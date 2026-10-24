-- ═══════════════════════════════════════════════════════════
-- Pilotage Direction Hypermarché — Configuration Supabase
-- À exécuter dans : Supabase > SQL Editor > New query > Run
-- Script rejouable (idempotent).
-- ═══════════════════════════════════════════════════════════

-- 1) TABLES (structure attendue par le helper _sb dans index.html)
--    hm_app_data    : clé/valeur (users, tâches, rayons, société, historique...)
--    hm_events      : événements live (tâche cochée / décochée)
--    hm_completions : complétions par utilisateur (migration vers hm_history)

create table if not exists public.hm_app_data (
  key  text primary key,
  data jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.hm_events (
  id   text primary key,
  data jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.hm_completions (
  user_id text primary key,
  data    jsonb,
  updated_at timestamptz not null default now()
);

-- 2) RLS
alter table public.hm_app_data    enable row level security;
alter table public.hm_events      enable row level security;
alter table public.hm_completions enable row level security;

-- Nettoyage d'anciennes policies éventuelles
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('hm_app_data','hm_events','hm_completions')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Lecture : ouverte au rôle anon (nécessaire pour le Realtime et la
-- synchronisation au login : le websocket Realtime n'envoie PAS le header x-app-secret).
-- Écriture : réservée aux requêtes portant le header x-app-secret
-- (envoyé par le client : createClient(..., { global: { headers: { 'x-app-secret': APP_SECRET } } })).
--
-- ⚠️ REMPLACE la valeur ci-dessous par TON secret (même valeur que APP_SECRET dans index.html).

do $$
declare
  t text;
  secret text := 'REMPLACER_PAR_APP_SECRET';
begin
  foreach t in array array['hm_app_data','hm_events','hm_completions'] loop
    execute format('create policy "%1$s_select" on public.%1$I for select to anon using (true)', t);
    execute format($p$create policy "%1$s_insert" on public.%1$I for insert to anon
      with check ((current_setting('request.headers', true)::json ->> 'x-app-secret') = %2$L)$p$, t, secret);
    execute format($p$create policy "%1$s_update" on public.%1$I for update to anon
      using ((current_setting('request.headers', true)::json ->> 'x-app-secret') = %2$L)
      with check ((current_setting('request.headers', true)::json ->> 'x-app-secret') = %2$L)$p$, t, secret);
    execute format($p$create policy "%1$s_delete" on public.%1$I for delete to anon
      using ((current_setting('request.headers', true)::json ->> 'x-app-secret') = %2$L)$p$, t, secret);
  end loop;
end $$;

-- 3) REALTIME (suivi live admin)
do $$
declare t text;
begin
  foreach t in array array['hm_app_data','hm_events'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- 4) VÉRIFICATION (doit afficher 3 tables, 4 policies chacune)
select tablename, count(*) as nb_policies
from pg_policies
where schemaname = 'public' and tablename like 'hm\_%'
group by tablename
order by tablename;
