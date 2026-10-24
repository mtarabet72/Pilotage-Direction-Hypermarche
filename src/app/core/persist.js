import { store, SHARED } from './store.js';
import { getCurrentUser, isDirector } from '../services/auth.js';
import { kvSet, kvDelete, kvGet, getAll, getClient } from '../services/supabase.js';

const result = async (fn) => {
  if (!getClient()) return { synced: false };
  try { await fn(); return { synced: true }; } catch (e) { return { synced: false, error: e.message }; }
};

// Tâches personnalisées : écrites par le Directeur uniquement.
export async function saveCustomTasks() {
  localStorage.setItem('hm_cust', JSON.stringify(store.customTasks));
  if (!isDirector()) return { synced: false, error: 'Réservé au Directeur' };
  return result(() => kvSet('hm_custom_tasks', store.customTasks));
}

// Notes : une ligne par utilisateur (plus d'écrasement entre utilisateurs). null = suppression.
export async function saveMyNotes() {
  const u = getCurrentUser();
  localStorage.setItem('hm_task_notes', JSON.stringify(store.taskNotes));
  const mine = {};
  Object.keys(store.taskNotes).forEach((k) => { if (k.startsWith(u.id + '__')) mine[k] = store.taskNotes[k]; });
  Object.keys(store.deletedNotes || {}).forEach((k) => { if (k.startsWith(u.id + '__')) mine[k] = null; });
  return result(() => kvSet('hm_task_notes_' + u.id, mine));
}

// Suppression d'une tâche : nettoie aussi les cases, événements live et notes de TOUS les utilisateurs.
export async function purgeTaskData(roleId, taskId) {
  const marker = `__${roleId}__${taskId}__`;
  Object.keys(store.completions).forEach((k) => { if (k.includes(marker)) delete store.completions[k]; });
  Object.keys(store.events).forEach((k) => { if (k.includes(marker)) delete store.events[k]; });
  store.deletedNotes = store.deletedNotes || {};
  Object.keys(store.taskNotes).forEach((k) => { if (k.includes(marker)) { delete store.taskNotes[k]; store.deletedNotes[k] = true; } });
  localStorage.setItem('hm_task_notes', JSON.stringify(store.taskNotes));
  if (!getClient()) return { synced: false };
  try {
    const rows = await getAll('hm_completions');
    await Promise.all(rows.filter((r) => r.data && Object.keys(r.data).some((k) => k.includes(marker))).map((r) => {
      const data = { ...r.data };
      Object.keys(data).forEach((k) => { if (k.includes(marker)) delete data[k]; });
      return kvSet(r.user_id, data, 'hm_completions');
    }));
    const evs = await getClient().from('hm_events').select('id').like('id', `%${marker}%`.replace(/_/g, '\\_'));
    await Promise.all((evs.data || []).map((e) => kvDelete(e.id, 'hm_events')));
    // notes : on neutralise dans chaque ligne par utilisateur et dans l'ancien objet partagé
    const noteRows = await getClient().from('hm_app_data').select('key,data').like('key', 'hm\\_task\\_notes%');
    await Promise.all((noteRows.data || []).filter((r) => r.data && Object.keys(r.data).some((k) => k.includes(marker))).map((r) => {
      const data = { ...r.data };
      Object.keys(data).forEach((k) => { if (k.includes(marker)) { if (r.key === 'hm_task_notes') delete data[k]; else data[k] = null; } });
      return kvSet(r.key, data);
    }));
    return { synced: true };
  } catch (e) { return { synced: false, error: e.message }; }
}

// Données partagées (société, rôles perso, rayons, planning…) : cache local + Supabase (Directeur uniquement).
export async function saveShared(prop) {
  const def = SHARED[prop];
  if (!def) throw new Error('Clé inconnue : ' + prop);
  localStorage.setItem(def.local, JSON.stringify(store[prop]));
  if (!isDirector()) return { synced: false, error: 'Réservé au Directeur' };
  return result(() => kvSet(def.remote, store[prop]));
}
