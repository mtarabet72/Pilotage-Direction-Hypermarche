-- ═══════════════════════════════════════════════════════════════════════
-- Pilotage Direction Hypermarché — Migration 002 : reprise des données
-- ═══════════════════════════════════════════════════════════════════════
-- À exécuter APRÈS : 001 (OK) + import des comptes (guide 2b-2, bootstrap.html).
--
-- COPIE les données de l'ancien système (hm_app_data, hm_completions, hm_events)
-- vers les nouvelles tables, en remplaçant les anciens identifiants (u_xxx)
-- par les nouveaux (uuid Supabase Auth) PARTOUT, y compris à l'intérieur des
-- données (planning de permanence, « assignée à », clés de cases, notes…).
--
-- • Les anciennes tables ne sont PAS modifiées (retour arrière possible).
-- • Sûr à rejouer : « on conflict do nothing » ne remplace jamais une donnée
--   déjà présente dans les nouvelles tables.
-- • Une ligne en erreur (ex. notes > 4 Mo) est ignorée et signalée dans le
--   rapport final ; elle n'annule pas le reste.
-- • Le rapport s'affiche à la fin : LISEZ-LE (lignes « ignorées »).
--
-- RE-SYNCHRONISATION juste avant la bascule (pour reprendre les dernières
-- données de l'ancien système) : exécuter d'abord, UNE SEULE FOIS ET SEULEMENT
-- avant que les utilisateurs n'utilisent la nouvelle version :
--   truncate public.app_settings, public.user_completions, public.user_history,
--            public.task_notes, public.task_events, public.permanence_notes;
-- puis rejouer ce script.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 0) Contrôles préalables ────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from public.profiles where legacy_id is not null) then
    raise exception 'Aucun profil importé (legacy_id vide). Lancez d''abord l''import des comptes (guide 2b-2).';
  end if;
  if to_regclass('public.hm_app_data') is null then
    raise exception 'Ancienne table hm_app_data introuvable.';
  end if;
end $$;

drop table if exists pg_temp.mig_report;
create temp table mig_report (
  item     text,
  migrated int  not null default 0,
  skipped  int  not null default 0,
  detail   text
) on commit preserve rows;

-- Remplace tout ancien identifiant par le nouveau : valeurs exactes ("u_x")
-- et préfixes de clés ("u_x__rôle__tâche__période").
create or replace function pg_temp.remap(j jsonb) returns jsonb language plpgsql as $$
declare t text := j::text; r record;
begin
  for r in select legacy_id as l, id::text as n from public.profiles where legacy_id is not null loop
    t := replace(t, '"' || r.l || '"',   '"' || r.n || '"');
    t := replace(t, '"' || r.l || '__',  '"' || r.n || '__');
  end loop;
  return t::jsonb;
end $$;

create or replace function pg_temp.remap_text(s text) returns text language plpgsql as $$
declare r record;
begin
  for r in select legacy_id as l, id::text as n from public.profiles where legacy_id is not null loop
    if left(s, length(r.l) + 2) = r.l || '__' then
      return r.n || substr(s, length(r.l) + 1);
    end if;
  end loop;
  return s;
end $$;

create or replace function pg_temp.report(p_item text, p_ok int, p_skip int, p_detail text default null) returns void
language sql as $$ insert into pg_temp.mig_report (item, migrated, skipped, detail) values (p_item, p_ok, p_skip, p_detail) $$;

-- ── 1) Paramètres partagés (société, rayons, rôles perso, planning…) ───
do $$
declare r record; cnt int; ok int := 0; sk int := 0; det text := '';
begin
  for r in select key, data from public.hm_app_data
           where key in ('hm_custom_tasks','hm_task_overrides','hm_custom_roles',
                         'hm_permanence_planning','hm_rayons','hm_company') and data is not null loop
    begin
      insert into public.app_settings (key, data) values (r.key, pg_temp.remap(r.data))
      on conflict (key) do nothing;
      get diagnostics cnt = row_count;
      if cnt = 1 then ok := ok + 1; else sk := sk + 1; det := det || r.key || ' (déjà présent) '; end if;
    exception when others then
      sk := sk + 1; det := det || r.key || ' : ' || sqlerrm || ' ';
    end;
  end loop;
  perform pg_temp.report('paramètres partagés', ok, sk, nullif(det, ''));
end $$;

-- ── 2) Cases cochées (hm_completions, une ligne par ancien utilisateur) ─
do $$
declare r record; cnt int; ok int := 0; sk int := 0; det text := '';
begin
  if to_regclass('public.hm_completions') is null then
    perform pg_temp.report('cases cochées', 0, 0, 'table hm_completions absente'); return;
  end if;
  for r in select c.user_id as legacy, c.data, p.id as uid, p.username
           from public.hm_completions c left join public.profiles p on p.legacy_id = c.user_id
           where c.data is not null loop
    begin
      if r.uid is null then sk := sk + 1; det := det || r.legacy || ' (compte inconnu) '; continue; end if;
      insert into public.user_completions (user_id, data) values (r.uid, pg_temp.remap(r.data))
      on conflict (user_id) do nothing;
      get diagnostics cnt = row_count;
      if cnt = 1 then ok := ok + 1; else sk := sk + 1; det := det || r.username || ' (déjà présent) '; end if;
    exception when others then
      sk := sk + 1; det := det || coalesce(r.username, r.legacy) || ' : ' || sqlerrm || ' ';
    end;
  end loop;
  perform pg_temp.report('cases cochées', ok, sk, nullif(det, ''));
end $$;

-- ── 3) Archives (hm_history_<ancien id> + ancien objet partagé hm_history) ─
create temp table mig_hist (user_id uuid primary key, data jsonb) on commit drop;
do $$
declare r record; k text; v jsonb; cnt int; ok int := 0; sk int := 0; det text := ''; pid uuid;
begin
  -- 3a) ancien objet partagé : réparti par préfixe d'utilisateur
  for r in select data from public.hm_app_data where key = 'hm_history' and jsonb_typeof(data) = 'object' loop
    for k, v in select * from jsonb_each(r.data) loop
      select id into pid from public.profiles where legacy_id = split_part(k, '__', 1);
      if pid is null then continue; end if;
      insert into mig_hist (user_id, data) values (pid, jsonb_build_object(pg_temp.remap_text(k), v))
      on conflict (user_id) do update set data = mig_hist.data || excluded.data;
    end loop;
  end loop;
  -- 3b) archives par utilisateur (prioritaires)
  for r in select key, data from public.hm_app_data
           where key like 'hm\_history\_%' and jsonb_typeof(data) = 'object' loop
    select id into pid from public.profiles where legacy_id = substr(r.key, 12);
    if pid is null then sk := sk + 1; det := det || r.key || ' (compte inconnu) '; continue; end if;
    insert into mig_hist (user_id, data) values (pid, pg_temp.remap(r.data))
    on conflict (user_id) do update set data = mig_hist.data || excluded.data;
  end loop;
  -- 3c) écriture
  for r in select h.user_id, h.data, p.username from mig_hist h join public.profiles p on p.id = h.user_id loop
    begin
      insert into public.user_history (user_id, data) values (r.user_id, r.data) on conflict (user_id) do nothing;
      get diagnostics cnt = row_count;
      if cnt = 1 then ok := ok + 1; else sk := sk + 1; det := det || r.username || ' (déjà présent) '; end if;
    exception when others then
      sk := sk + 1; det := det || r.username || ' : ' || sqlerrm || ' ';
    end;
  end loop;
  perform pg_temp.report('archives', ok, sk, nullif(det, ''));
end $$;

-- ── 4) Notes + pièces jointes (hm_task_notes_<id> + ancien objet partagé) ─
create temp table mig_notes (user_id uuid primary key, data jsonb) on commit drop;
do $$
declare r record; k text; v jsonb; cnt int; ok int := 0; sk int := 0; det text := ''; pid uuid;
begin
  for r in select data from public.hm_app_data where key = 'hm_task_notes' and jsonb_typeof(data) = 'object' loop
    for k, v in select * from jsonb_each(r.data) loop
      select id into pid from public.profiles where legacy_id = split_part(k, '__', 1);
      if pid is null then continue; end if;
      insert into mig_notes (user_id, data) values (pid, jsonb_build_object(pg_temp.remap_text(k), v))
      on conflict (user_id) do update set data = mig_notes.data || excluded.data;
    end loop;
  end loop;
  for r in select key, data from public.hm_app_data
           where key like 'hm\_task\_notes\_%' and jsonb_typeof(data) = 'object' loop
    select id into pid from public.profiles where legacy_id = substr(r.key, 15);
    if pid is null then sk := sk + 1; det := det || r.key || ' (compte inconnu) '; continue; end if;
    insert into mig_notes (user_id, data) values (pid, pg_temp.remap(r.data))
    on conflict (user_id) do update set data = mig_notes.data || excluded.data;
  end loop;
  for r in select n.user_id, n.data, p.username from mig_notes n join public.profiles p on p.id = n.user_id loop
    begin
      insert into public.task_notes (user_id, data) values (r.user_id, r.data) on conflict (user_id) do nothing;
      get diagnostics cnt = row_count;
      if cnt = 1 then ok := ok + 1; else sk := sk + 1; det := det || r.username || ' (déjà présent) '; end if;
    exception when check_violation then
      sk := sk + 1; det := det || r.username || ' : notes trop volumineuses (> 4 Mo, pièces jointes) — à traiter avec Storage ';
    when others then
      sk := sk + 1; det := det || r.username || ' : ' || sqlerrm || ' ';
    end;
  end loop;
  perform pg_temp.report('notes et pièces jointes', ok, sk, nullif(det, ''));
end $$;

-- ── 5) Événements du suivi live (hm_events) ────────────────────────────
do $$
declare r record; cnt int; ok int := 0; sk int := 0; pid uuid;
begin
  if to_regclass('public.hm_events') is null then
    perform pg_temp.report('événements live', 0, 0, 'table hm_events absente'); return;
  end if;
  for r in select id, data from public.hm_events where data is not null loop
    begin
      select p.id into pid from public.profiles p where p.legacy_id = split_part(r.id, '__', 1);
      if pid is null then sk := sk + 1; continue; end if;
      insert into public.task_events (id, user_id, data)
      values (pg_temp.remap_text(r.id), pid, pg_temp.remap(r.data)) on conflict (id) do nothing;
      get diagnostics cnt = row_count;
      if cnt = 1 then ok := ok + 1; else sk := sk + 1; end if;
    exception when others then sk := sk + 1;
    end;
  end loop;
  perform pg_temp.report('événements live', ok, sk);
end $$;

-- ── 6) Notes de passation (hm_perm_note_<date>_<créneau>) ──────────────
-- L'auteur d'origine n'est pas connu : rattaché au premier Directeur actif.
do $$
declare r record; cnt int; ok int := 0; sk int := 0; boss uuid; body text;
begin
  select id into boss from public.profiles where system_role = 'directeur' and active order by created_at limit 1;
  for r in select key, data from public.hm_app_data where key like 'hm\_perm\_note\_%' loop
    begin
      body := r.data #>> '{}';
      if body is null or btrim(body) = '' then continue; end if;
      insert into public.permanence_notes (note_key, body, author)
      values (substr(r.key, 14), left(body, 2000), boss) on conflict (note_key) do nothing;
      get diagnostics cnt = row_count;
      if cnt = 1 then ok := ok + 1; else sk := sk + 1; end if;
    exception when others then sk := sk + 1;
    end;
  end loop;
  perform pg_temp.report('notes de passation', ok, sk);
end $$;

-- ── 7) Clés de l'ancien système NON reprises (information) ─────────────
insert into pg_temp.mig_report (item, migrated, skipped, detail)
select 'clés non reprises (information)', 0, count(*),
       coalesce(string_agg(key, ', ' order by key), 'aucune')
from public.hm_app_data
where key <> 'hm_users'
  and key not in ('hm_custom_tasks','hm_task_overrides','hm_custom_roles','hm_permanence_planning',
                  'hm_rayons','hm_company','hm_history','hm_task_notes')
  and key not like 'hm\_history\_%' and key not like 'hm\_task\_notes\_%' and key not like 'hm\_perm\_note\_%';

commit;

-- ── RAPPORT (dernier résultat affiché) ─────────────────────────────────
select item as "Élément", migrated as "Repris", skipped as "Ignorés", detail as "Détail"
from pg_temp.mig_report order by 1;
