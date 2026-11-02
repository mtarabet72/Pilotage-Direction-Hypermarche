import { CONFIG } from './config.js';

// ═══════════════════════════════════════════════════════════════════════
// Couche d'accès Supabase.
//
// Le reste de l'application utilise une interface « clé/valeur » historique (kvGet, kvSet, kvList,
// getAll, subscribe) avec les anciens noms de tables (hm_app_data, hm_events, hm_completions).
// Cet ADAPTATEUR traduit ces appels vers les nouvelles tables sécurisées (RLS + Supabase Auth) :
//
//   hm_app_data  · hm_custom_tasks, hm_rayons, hm_company…   → app_settings
//   hm_app_data  · hm_task_notes_<uid>                        → task_notes
//   hm_app_data  · hm_history_<uid>                           → user_history
//   hm_app_data  · hm_perm_note_<date>_<créneau>              → permanence_notes
//   hm_completions (clé = uid)                                → user_completions
//   hm_events (clé = id d'événement)                          → task_events
//
// Toute autre clé de l'ancien système (hm_users, hm_ping, objets partagés v3…) n'existe plus : lecture = null.
// ═══════════════════════════════════════════════════════════════════════

let client = null;
let uid = null;
export const sbStatus = { connected: false, error: null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SETTINGS_KEYS = new Set([
  'hm_custom_tasks', 'hm_task_overrides', 'hm_custom_roles', 'hm_permanence_planning', 'hm_rayons', 'hm_company'
]);
const PREFIXES = [
  ['hm_task_notes_', 'task_notes', 'user_id'],
  ['hm_history_', 'user_history', 'user_id'],
  ['hm_perm_note_', 'permanence_notes', 'note_key']
];

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' : délai dépassé')), ms))
  ]);

export const getClient = () => client;
export const getSupabase = () => client;
export const currentUid = () => uid;

// Accès refusé par la RLS (42501) ou session expirée : l'interface propose de se reconnecter.
function denied(error) {
  const auth = error && (error.code === '42501' || error.status === 401 || /jwt|row-level security/i.test(error.message || ''));
  if (auth) {
    sbStatus.denied = true;
    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('pilotage:denied'));
    return new Error('Accès refusé : reconnectez-vous (session expirée ou droits insuffisants)');
  }
  return error;
}

// Message compréhensible pour un utilisateur non technique.
export function explainError(msg) {
  const m = String(msg || '');
  if (/failed to fetch|ERR_FAILED|networkerror|load failed/i.test(m)) return 'serveur injoignable (projet en pause ou réseau bloqué)';
  if (/invalid api key|apikey/i.test(m)) return 'clé publique invalide pour ce projet';
  if (/délai|timeout/i.test(m)) return 'délai dépassé (réseau trop lent)';
  if (/SDK/i.test(m)) return 'bibliothèque Supabase non chargée (réseau ou bloqueur)';
  if (/permission denied|42501|row-level/i.test(m)) return 'accès refusé par la base (droits)';
  return m || 'erreur inconnue';
}

// Le serveur est-il joignable ? (/auth/v1/health ne demande aucune connexion)
async function ping() {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(CONFIG.projectUrl + '/auth/v1/health', { headers: { apikey: CONFIG.publishableKey }, signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Connexion Supabase : délai dépassé' : 'Failed to fetch');
  } finally { clearTimeout(timer); }
}

export async function connect() {
  sbStatus.connected = false;
  sbStatus.error = null;
  try {
    if (!window.supabase) throw new Error('SDK Supabase non chargé');
    await ping();
    if (!client) {
      client = window.supabase.createClient(CONFIG.projectUrl, CONFIG.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
      client.auth.onAuthStateChange((_event, session) => { uid = session?.user?.id || null; });
    }
    const { data, error } = await withTimeout(client.auth.getSession(), 8000, 'Connexion Supabase');
    if (error) throw error;
    uid = data?.session?.user?.id || null;
    sbStatus.connected = true;
    return true;
  } catch (e) {
    client = null;
    uid = null;
    sbStatus.error = e.message || String(e);
    throw e;
  }
}

export function disconnect() {
  client = null;
  uid = null;
  sbStatus.connected = false;
}

// ── Routage ancienne interface → nouvelles tables ───────────────────────
// Retourne { t: table, col: colonne clé, id: valeur } ou null si la clé n'existe plus.
function route(table, key) {
  const k = String(key ?? '');
  if (table === 'hm_completions') return UUID_RE.test(k) ? { t: 'user_completions', col: 'user_id', id: k } : null;
  if (table === 'hm_events') return k ? { t: 'task_events', col: 'id', id: k } : null;
  if (SETTINGS_KEYS.has(k)) return { t: 'app_settings', col: 'key', id: k };
  for (const [prefix, t, col] of PREFIXES) {
    if (k.startsWith(prefix)) {
      const id = k.slice(prefix.length);
      if (col === 'user_id' && !UUID_RE.test(id)) return null;   // ancien identifiant u_xxx : plus utilisé
      return { t, col, id };
    }
  }
  return null;
}
const isPerm = (r) => r.t === 'permanence_notes';

// Lecture d'une valeur ; retourne null si absente, inconnue ou hors ligne.
export async function kvGet(key, table = 'hm_app_data') {
  if (!client) return null;
  const r = route(table, key);
  if (!r) return null;
  const { data, error } = await client.from(r.t).select(isPerm(r) ? 'body' : 'data').eq(r.col, r.id).maybeSingle();
  if (error) throw error;
  if (isPerm(r)) return data ? data.body : '';       // note supprimée = '' (comme l'ancien système)
  return data ? data.data : null;
}

// Écriture : lève une erreur en cas d'échec.
export async function kvSet(key, value, table = 'hm_app_data') {
  if (!client) return false;
  const r = route(table, key);
  if (!r) return false;
  let res;
  if (isPerm(r)) {
    res = value
      ? await client.from(r.t).upsert({ note_key: r.id, body: String(value), author: uid }, { onConflict: 'note_key' })
      : await client.from(r.t).delete().eq('note_key', r.id);
  } else if (r.t === 'app_settings') {
    res = await client.from(r.t).upsert({ key: r.id, data: value }, { onConflict: 'key' });
  } else if (r.col === 'user_id' && r.id !== uid) {
    // Le Directeur corrige la ligne d'un autre utilisateur : mise à jour seulement (la RLS refuse l'insertion pour autrui).
    res = await client.from(r.t).update({ data: value }).eq('user_id', r.id);
  } else if (r.t === 'task_events') {
    res = await client.from(r.t).upsert({ id: r.id, data: value }, { onConflict: 'id' });
  } else {
    res = await client.from(r.t).upsert({ user_id: r.id, data: value }, { onConflict: 'user_id' });
  }
  if (res.error) throw denied(res.error);
  return true;
}

export async function kvDelete(key, table = 'hm_app_data') {
  if (!client) return false;
  const r = route(table, key);
  if (!r) return false;
  const { error } = await client.from(r.t).delete().eq(r.col, r.id);
  if (error) throw denied(error);
  return true;
}

// Toutes les lignes dont la clé commence par `prefix` (ex: hm_task_notes_). Retourne [{key,data}].
export async function kvList(prefix, table = 'hm_app_data') {
  if (!client || table !== 'hm_app_data') return [];
  const def = PREFIXES.find(([p]) => prefix === p || prefix.startsWith(p));
  if (!def) return [];
  const [p, t, col] = def;
  const { data, error } = await client.from(t).select(t === 'permanence_notes' ? 'note_key,body' : 'user_id,data');
  if (error) throw error;
  return (data || [])
    .map((row) => ({ key: p + row[col], data: t === 'permanence_notes' ? row.body : row.data }))
    .filter((row) => row.key.startsWith(prefix));
}

// Lecture complète d'une « table » historique. Mêmes formes qu'avant : {user_id,data} / {id,data} / {key,data}.
export async function getAll(table) {
  if (!client) return [];
  const map = {
    hm_completions: ['user_completions', 'user_id,data'],
    hm_events: ['task_events', 'id,data'],
    hm_app_data: ['app_settings', 'key,data']
  }[table];
  if (!map) return [];
  const { data, error } = await client.from(map[0]).select(map[1]);
  if (error) throw error;
  return data || [];
}

// Abonnement Realtime (filtré par la RLS de l'utilisateur connecté) ; retourne une fonction de désabonnement.
// Les événements sont traduits vers les anciens noms (table, clé) attendus par l'application.
export function subscribe(table, callback) {
  if (!client) return () => {};
  // [table réelle, colonne clé, préfixe d'ancienne clé ('' = champ id)]
  const sources = table === 'hm_events'
    ? [['task_events', 'id', null]]
    : [['app_settings', 'key', ''], ['task_notes', 'user_id', 'hm_task_notes_'], ['permanence_notes', 'note_key', 'hm_perm_note_']];
  // Sur une suppression, « new » est vide : on ne fabrique pas de clé à partir d'une valeur absente.
  const toKey = (row, pk, prefix) => {
    if (!row || row[pk] === undefined || row[pk] === null) return {};
    if (prefix === null) return { id: row[pk] };
    return { key: prefix + row[pk] };
  };
  const channels = sources.map(([t, pk, prefix]) =>
    client.channel('rt:' + t)
      .on('postgres_changes', { event: '*', schema: 'public', table: t }, (payload) => {
        callback({ eventType: payload.eventType, new: toKey(payload.new, pk, prefix), old: toKey(payload.old, pk, prefix) });
      })
      .subscribe());
  return () => { if (client) channels.forEach((c) => client.removeChannel(c)); };
}
