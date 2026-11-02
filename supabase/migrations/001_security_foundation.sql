-- ═══════════════════════════════════════════════════════════════════════
-- Pilotage Direction Hypermarché — Migration 001 : fondation de sécurité
-- ═══════════════════════════════════════════════════════════════════════
-- À exécuter dans : Supabase > SQL Editor > New query > Run
--
-- ADDITIVE : cette migration CRÉE de nouvelles tables à côté de l'existant
-- (hm_app_data, hm_events, hm_completions ne sont PAS modifiées).
-- L'application actuelle continue donc de fonctionner pendant la transition.
-- La fermeture de l'ancien système (rôle anon) se fait seulement à la
-- bascule finale (migration 003).
--
-- Rejouable : tout est en "if not exists" / "create or replace" / "drop policy if exists".
-- Une erreur annule tout (transaction unique).
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────────
-- 0) Schéma privé pour les fonctions d'aide (non exposé par l'API REST)
-- ───────────────────────────────────────────────────────────────────────
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 1) TABLES
-- ───────────────────────────────────────────────────────────────────────

-- Profils : 1 ligne par compte Supabase Auth. Le RÔLE vit ici (côté serveur),
-- jamais dans le navigateur. Aucune écriture possible par les utilisateurs :
-- seules l'Edge Function admin-users (service_role) et le Dashboard modifient.
create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  username             text not null check (username ~ '^[a-z0-9._-]{2,30}$'),
  name                 text not null check (char_length(btrim(name)) between 1 and 100),
  system_role          text not null check (system_role in ('directeur', 'chef_secteur', 'chef_rayon')),
  own_role_id          text,
  evaluable_role_ids   text[] not null default '{}',
  active               boolean not null default true,
  must_change_password boolean not null default true,
  legacy_id            text unique,          -- ancien identifiant (u_xxx) pour la migration des données
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));

-- Données partagées écrites par le Directeur (société, rayons, rôles perso, planning…).
create table if not exists public.app_settings (
  key        text primary key check (key in (
               'hm_custom_tasks', 'hm_task_overrides', 'hm_custom_roles',
               'hm_permanence_planning', 'hm_rayons', 'hm_company')),
  data       jsonb not null check (octet_length(data::text) <= 1048576),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- Cases cochées : 1 ligne par utilisateur (même format que l'ancien hm_completions).
create table if not exists public.user_completions (
  user_id    uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  data       jsonb not null check (octet_length(data::text) <= 1048576),
  updated_at timestamptz not null default now()
);

-- Archive permanente par utilisateur (ancien hm_history_<id>).
create table if not exists public.user_history (
  user_id    uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  data       jsonb not null check (octet_length(data::text) <= 2097152),
  updated_at timestamptz not null default now()
);

-- Notes + pièces jointes (ancien hm_task_notes_<id>). 4 Mo max par utilisateur
-- tant que les pièces jointes sont en base64 (elles passeront dans Storage en migration 002).
create table if not exists public.task_notes (
  user_id    uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  data       jsonb not null check (octet_length(data::text) <= 4194304),
  updated_at timestamptz not null default now()
);

-- Événements du suivi live (ancien hm_events).
create table if not exists public.task_events (
  id         text primary key check (char_length(id) <= 300),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  data       jsonb not null check (octet_length(data::text) <= 8192),
  updated_at timestamptz not null default now()
);
create index if not exists task_events_user_idx on public.task_events (user_id);

-- Notes de passation (ancien hm_perm_note_<date>_<créneau>).
create table if not exists public.permanence_notes (
  note_key   text primary key check (note_key ~ '^\d{4}-\d{2}-\d{2}_(matin|tranche|soir)$'),
  body       text not null check (char_length(body) <= 2000),
  author     uuid not null default auth.uid() references public.profiles (id),
  updated_at timestamptz not null default now()
);

-- Journal d'audit : ajout seulement (voir triggers plus bas).
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid,
  actor_role text,
  action     text not null,
  table_name text not null,
  row_key    text,
  old_data   jsonb,
  new_data   jsonb
);
create index if not exists audit_log_at_idx  on public.audit_log (at desc);
create index if not exists audit_log_row_idx on public.audit_log (table_name, row_key);

-- ───────────────────────────────────────────────────────────────────────
-- 2) FONCTIONS D'AIDE (security definer, search_path vide)
-- ───────────────────────────────────────────────────────────────────────
create or replace function private.is_active() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active) $$;

create or replace function private.is_director() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles p
                     where p.id = auth.uid() and p.active and p.system_role = 'directeur') $$;

revoke all on function private.is_active(), private.is_director() from public, anon;
grant execute on function private.is_active(), private.is_director() to authenticated, service_role;

-- Horodatage automatique
create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

-- Garde-fou : jamais de dernier directeur actif supprimé / rétrogradé / désactivé
create or replace function private.protect_last_director() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare other_director boolean;
begin
  if old.system_role = 'directeur' and old.active
     and (tg_op = 'DELETE' or new.system_role <> 'directeur' or not new.active) then
    select exists (select 1 from public.profiles
                   where system_role = 'directeur' and active and id <> old.id) into other_director;
    if not other_director then
      raise exception 'Il doit rester au moins un Directeur actif' using errcode = 'P0001';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- Audit : qui a changé quoi
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_old jsonb; v_new jsonb; k text;
begin
  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  k := coalesce(v_new, v_old) ->> (case tg_table_name when 'profiles' then 'id' else 'key' end);
  insert into public.audit_log (actor, actor_role, action, table_name, row_key, old_data, new_data)
  values (auth.uid(), auth.role(), tg_op, tg_table_name, k, v_old, v_new);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function private.audit_readonly() returns trigger
language plpgsql set search_path = ''
as $$ begin raise exception 'audit_log est en ajout seul' using errcode = '42501'; end $$;

-- Le salarié confirme avoir changé son mot de passe (seul champ qu'il peut toucher)
create or replace function public.ack_password_changed() returns void
language sql security definer set search_path = ''
as $$ update public.profiles set must_change_password = false where id = auth.uid() $$;
revoke all on function public.ack_password_changed() from public, anon;
grant execute on function public.ack_password_changed() to authenticated;

-- ───────────────────────────────────────────────────────────────────────
-- 3) TRIGGERS
-- ───────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['profiles','app_settings','user_completions','user_history',
                           'task_notes','task_events','permanence_notes'] loop
    execute format('drop trigger if exists trg_touch on public.%I', t);
    execute format('create trigger trg_touch before insert or update on public.%I
                    for each row execute function private.touch_updated_at()', t);
  end loop;
end $$;

drop trigger if exists trg_last_director on public.profiles;
create trigger trg_last_director before update or delete on public.profiles
  for each row execute function private.protect_last_director();

drop trigger if exists trg_audit on public.profiles;
create trigger trg_audit after insert or update or delete on public.profiles
  for each row execute function private.audit_row();

drop trigger if exists trg_audit on public.app_settings;
create trigger trg_audit after insert or update or delete on public.app_settings
  for each row execute function private.audit_row();

drop trigger if exists trg_audit_ro on public.audit_log;
create trigger trg_audit_ro before update or delete on public.audit_log
  for each row execute function private.audit_readonly();

-- ───────────────────────────────────────────────────────────────────────
-- 4) DROITS : fermé par défaut. anon n'a RIEN sur les nouvelles tables.
-- ───────────────────────────────────────────────────────────────────────
revoke all on public.profiles, public.app_settings, public.user_completions, public.user_history,
              public.task_notes, public.task_events, public.permanence_notes, public.audit_log
  from public, anon, authenticated;

grant select                         on public.profiles         to authenticated;
grant select, insert, update, delete on public.app_settings     to authenticated;
grant select, insert, update, delete on public.user_completions to authenticated;
grant select, insert, update, delete on public.user_history     to authenticated;
grant select, insert, update, delete on public.task_notes       to authenticated;
grant select, insert, update, delete on public.task_events      to authenticated;
grant select, insert, update, delete on public.permanence_notes to authenticated;
grant select                         on public.audit_log        to authenticated;

grant all on public.profiles, public.app_settings, public.user_completions, public.user_history,
             public.task_notes, public.task_events, public.permanence_notes, public.audit_log
  to service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 5) RLS
--    (select auth.uid()) / (select private.is_*()) : évalués une seule fois par requête.
-- ───────────────────────────────────────────────────────────────────────
alter table public.profiles         enable row level security;
alter table public.app_settings     enable row level security;
alter table public.user_completions enable row level security;
alter table public.user_history     enable row level security;
alter table public.task_notes       enable row level security;
alter table public.task_events      enable row level security;
alter table public.permanence_notes enable row level security;
alter table public.audit_log        enable row level security;

-- profiles : tout compte actif peut lister les collègues (noms pour le planning) ; aucune écriture.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using ((select private.is_active()));

-- app_settings : lecture pour tous les comptes actifs, écriture Directeur.
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select to authenticated
  using ((select private.is_active()));
drop policy if exists app_settings_write_ins on public.app_settings;
create policy app_settings_write_ins on public.app_settings for insert to authenticated
  with check ((select private.is_director()));
drop policy if exists app_settings_write_upd on public.app_settings;
create policy app_settings_write_upd on public.app_settings for update to authenticated
  using ((select private.is_director())) with check ((select private.is_director()));
drop policy if exists app_settings_write_del on public.app_settings;
create policy app_settings_write_del on public.app_settings for delete to authenticated
  using ((select private.is_director()));

-- Tables « une ligne par utilisateur » : le propriétaire lit/écrit sa ligne ;
-- le Directeur lit tout et peut corriger/supprimer (purge d'une tâche supprimée).
do $$
declare t text;
begin
  foreach t in array array['user_completions','user_history','task_notes','task_events'] loop
    execute format('drop policy if exists %1$s_own on public.%1$I', t);
    execute format($p$create policy %1$s_own on public.%1$I for all to authenticated
      using (user_id = (select auth.uid()) and (select private.is_active()))
      with check (user_id = (select auth.uid()) and (select private.is_active()))$p$, t);

    execute format('drop policy if exists %1$s_director_select on public.%1$I', t);
    execute format($p$create policy %1$s_director_select on public.%1$I for select to authenticated
      using ((select private.is_director()))$p$, t);

    execute format('drop policy if exists %1$s_director_update on public.%1$I', t);
    execute format($p$create policy %1$s_director_update on public.%1$I for update to authenticated
      using ((select private.is_director())) with check ((select private.is_director()))$p$, t);

    execute format('drop policy if exists %1$s_director_delete on public.%1$I', t);
    execute format($p$create policy %1$s_director_delete on public.%1$I for delete to authenticated
      using ((select private.is_director()))$p$, t);
  end loop;
end $$;

-- permanence_notes : lisibles par tous les comptes actifs ; l'auteur est forcé = l'appelant.
drop policy if exists perm_notes_select on public.permanence_notes;
create policy perm_notes_select on public.permanence_notes for select to authenticated
  using ((select private.is_active()));
drop policy if exists perm_notes_insert on public.permanence_notes;
create policy perm_notes_insert on public.permanence_notes for insert to authenticated
  with check (author = (select auth.uid()) and (select private.is_active()));
drop policy if exists perm_notes_update on public.permanence_notes;
create policy perm_notes_update on public.permanence_notes for update to authenticated
  using ((select private.is_active()))
  with check (author = (select auth.uid()) and (select private.is_active()));
drop policy if exists perm_notes_delete on public.permanence_notes;
create policy perm_notes_delete on public.permanence_notes for delete to authenticated
  using ((select private.is_active()));

-- audit_log : lecture Directeur uniquement ; aucune écriture directe (triggers seulement).
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using ((select private.is_director()));

-- ───────────────────────────────────────────────────────────────────────
-- 6) REALTIME : les nouvelles tables, filtrées par la RLS de l'utilisateur connecté
-- ───────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['app_settings','task_events','task_notes','permanence_notes'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;

commit;

-- ───────────────────────────────────────────────────────────────────────
-- 7) VÉRIFICATION (doit afficher 8 tables, rls_active = true partout)
-- ───────────────────────────────────────────────────────────────────────
select c.relname as table_name,
       c.relrowsecurity as rls_active,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as nb_policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profiles','app_settings','user_completions','user_history',
                    'task_notes','task_events','permanence_notes','audit_log')
order by c.relname;
