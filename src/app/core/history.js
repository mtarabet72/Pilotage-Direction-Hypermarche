import { store } from './store.js';
import { kvGet, kvList, getAll, getClient } from '../services/supabase.js';

// Index de TOUT ce qui a été coché (jours passés inclus) : « rôle__tâche__période ».
// Sources : ancienne archive partagée (hm_history), archives par utilisateur (hm_history_<id>),
// complétions en cours (hm_completions), cache local de cet appareil, et cases en mémoire.
let index = new Set();
let loadedAt = 0;

const strip = (key) => key.slice(key.indexOf('__') + 2);       // retire « uid__ »
const addAll = (obj) => {
  if (!obj || typeof obj !== 'object') return;
  Object.keys(obj).forEach((k) => { if (obj[k] && k.includes('__')) index.add(strip(k)); });
};

export async function loadHistoryIndex(force = false) {
  if (!force && Date.now() - loadedAt < 60000) return index;
  const next = new Set();
  const prev = index;
  index = next;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('hm_hist_') || k.startsWith('hm_comp_'))) {
        try { addAll(JSON.parse(localStorage.getItem(k))); } catch (e) { /* ignoré */ }
      }
    }
    addAll(store.completions);
    if (getClient()) {
      const [legacy, perUser, rows] = await Promise.all([
        kvGet('hm_history').catch(() => null),
        kvList('hm_history_').catch(() => []),
        getAll('hm_completions').catch(() => [])
      ]);
      addAll(legacy);
      perUser.forEach((r) => addAll(r.data));
      rows.forEach((r) => addAll(r.data));
    }
    loadedAt = Date.now();
  } catch (e) {
    prev.forEach((k) => next.add(k));
  }
  return index;
}

export const historyHas = (rid, tid, period) => index.has(`${rid}__${tid}__${period}`);
