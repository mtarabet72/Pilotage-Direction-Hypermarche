import { store, ck, effectivePeriodKey } from './store.js';
import { getCurrentUser } from '../services/auth.js';
import { kvSet, kvDelete, kvGet, getClient } from '../services/supabase.js';

const readLocal = (k, fb) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? fb; } catch (e) { return fb; } };

// Règle de couleur du suivi live : vert si validé avant 12h00, rouge ensuite (comme la v3).
export function buildEvent(user, role, task, freq, isDone, now) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const green = isDone && minutes < 12 * 60;
  return {
    uid: user.id, userName: user.name || '?',
    roleId: role.id, roleLabel: role.label, roleIcon: role.icon, secteur: role.secteur,
    taskId: task.id, taskLabel: task.label, freq, isDone,
    statut: isDone ? (green ? 'VERT' : 'ROUGE') : 'ANNULE',
    couleur: isDone ? (green ? '#27ae60' : '#e74c3c') : '#888',
    heure: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    completedAt: now.toISOString(),
    period: effectivePeriodKey(role.id, freq)
  };
}

// Coche / décoche une tâche. Local d'abord (immédiat), puis synchronisation Supabase.
// Retourne { synced } : false si Supabase est injoignable (les données restent en local).
export async function setTaskDone(role, task, freq, isDone, now = new Date()) {
  const user = getCurrentUser();
  const key = ck(role.id, task.id, freq);
  store.completions[key] = isDone;
  localStorage.setItem('hm_comp_' + user.id, JSON.stringify(store.completions));

  // Archive permanente PAR UTILISATEUR (la v3 réécrivait un objet partagé : deux
  // personnes cochant en même temps pouvaient s'écraser mutuellement).
  const histKey = 'hm_history_' + user.id;
  const archive = readLocal('hm_hist_' + user.id, {});
  if (isDone) archive[key] = true; else delete archive[key];
  localStorage.setItem('hm_hist_' + user.id, JSON.stringify(archive));

  const event = buildEvent(user, role, task, freq, isDone, now);
  const eventKey = key; // même clé que la complétion : uid__rôle__tâche__période
  if (isDone) store.events[eventKey] = event; else delete store.events[eventKey];

  if (!getClient()) { markPending(); return { synced: false }; }
  try {
    await Promise.all([
      kvSet(user.id, store.completions, 'hm_completions'),
      kvSet(histKey, archive),
      isDone ? kvSet(eventKey, event, 'hm_events') : kvDelete(eventKey, 'hm_events')
    ]);
    clearPending();
    return { synced: true };
  } catch (e) {
    console.warn('Synchronisation :', e.message);
    markPending();
    return { synced: false, error: e.message };
  }
}

const PENDING = 'hm_sync_pending';
const markPending = () => localStorage.setItem(PENDING, '1');
const clearPending = () => localStorage.removeItem(PENDING);

// Renvoie les données locales vers Supabase après une coupure réseau.
export async function flushPending() {
  const user = getCurrentUser();
  if (!user || !getClient() || !localStorage.getItem(PENDING)) return false;
  try {
    const archive = readLocal('hm_hist_' + user.id, {});
    await Promise.all([
      kvSet(user.id, store.completions, 'hm_completions'),
      kvSet('hm_history_' + user.id, archive)
    ]);
    clearPending();
    return true;
  } catch (e) { return false; }
}
