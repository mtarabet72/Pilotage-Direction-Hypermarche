import { loadConfig } from './config.js';

let client = null;
export const sbStatus = { connected: false, error: null };

const keyColumn = (table) =>
  table === 'hm_events' ? 'id' : table === 'hm_completions' ? 'user_id' : 'key';

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' : délai dépassé')), ms))
  ]);

// Une écriture refusée par la RLS (code 42501) = code d'accès absent ou incorrect.
function denied(error) {
  if (error && (error.code === '42501' || /row-level security/i.test(error.message || ''))) {
    sbStatus.denied = true;
    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('pilotage:denied'));
    return new Error('Code d\'accès Supabase refusé (code absent ou incorrect)');
  }
  return error;
}

export function getClient() {
  return client;
}

export async function connect(cfg = loadConfig()) {
  sbStatus.connected = false;
  sbStatus.error = null;
  try {
    if (!window.supabase) throw new Error('SDK Supabase non chargé');
    client = window.supabase.createClient(cfg.projectUrl, cfg.anonKey, {
      global: { headers: { 'x-app-secret': cfg.appSecret } }
    });
    const { error } = await withTimeout(
      client.from('hm_app_data').select('key').limit(1),
      8000,
      'Connexion Supabase'
    );
    if (error) throw error;
    sbStatus.connected = true;
    return true;
  } catch (e) {
    client = null;
    sbStatus.error = e.message || String(e);
    throw e;
  }
}

export function disconnect() {
  client = null;
  sbStatus.connected = false;
}

// Lecture d'une valeur (jsonb) ; retourne null si absente ou hors ligne.
export async function kvGet(key, table = 'hm_app_data') {
  if (!client) return null;
  const { data, error } = await client
    .from(table).select('data').eq(keyColumn(table), key).maybeSingle();
  if (error) throw error;
  return data ? data.data : null;
}

// Écriture : lève une erreur en cas d'échec (la v3 les ignorait silencieusement).
export async function kvSet(key, value, table = 'hm_app_data') {
  if (!client) return false;
  const { error } = await client
    .from(table)
    .upsert({ [keyColumn(table)]: key, data: value });
  if (error) throw denied(error);
  return true;
}

export async function kvDelete(key, table = 'hm_app_data') {
  if (!client) return false;
  const { error } = await client.from(table).delete().eq(keyColumn(table), key);
  if (error) throw denied(error);
  return true;
}

// Toutes les lignes dont la clé commence par `prefix` (ex: hm_task_notes_). Retourne [{key,data}].
export async function kvList(prefix, table = 'hm_app_data') {
  if (!client) return [];
  const escaped = prefix.replace(/[\\%_]/g, (c) => '\\' + c);
  const { data, error } = await client.from(table).select('key,data').like('key', escaped + '%');
  if (error) throw error;
  return data || [];
}

export async function getAll(table) {
  if (!client) return [];
  const { data, error } = await client.from(table).select('*');
  if (error) throw error;
  return data || [];
}

// Abonnement Realtime ; retourne une fonction de désabonnement.
export function subscribe(table, callback) {
  if (!client) return () => {};
  const channel = client
    .channel('rt:' + table)
    .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
    .subscribe();
  return () => client && client.removeChannel(channel);
}
