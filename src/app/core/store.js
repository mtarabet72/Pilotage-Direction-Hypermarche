import { ROLES } from '../data/roles.js';
import { kvGet, kvList, getAll, getClient } from '../services/supabase.js';
import { getCurrentUser, getUsers, isDirector } from '../services/auth.js';
import {
  todayKey, dateKeyMinus, periodKey, deadlineSortMinutes
} from './periods.js';

// ── État des données métier (clés localStorage identiques à la v3) ──
export const store = {
  customTasks: {},
  taskOverrides: {},
  customRoles: [],
  permanencePlanning: {},
  taskNotes: {},
  rayons: {},
  permanenceNotes: {},
  completions: {},
  events: {},
  companyData: {}
};

const LOCAL_KEYS = {
  customTasks: 'hm_cust',
  taskOverrides: 'hm_overrides',
  customRoles: 'hm_custom_roles',
  permanencePlanning: 'hm_permanence_planning',
  taskNotes: 'hm_task_notes',
  rayons: 'hm_rayons',
  companyData: 'hm_company'
};
const REMOTE_KEYS = {
  hm_custom_tasks: 'customTasks',
  hm_task_overrides: 'taskOverrides',
  hm_custom_roles: 'customRoles',
  hm_permanence_planning: 'permanencePlanning',
  hm_task_notes: 'taskNotes',
  hm_rayons: 'rayons',
  hm_company: 'companyData'
};
// prop → { local, remote } pour les données partagées écrites par le Directeur.
export const SHARED = Object.fromEntries(Object.keys(REMOTE_KEYS).map((remote) => [REMOTE_KEYS[remote], { local: LOCAL_KEYS[REMOTE_KEYS[remote]], remote }]));
const isObj = (v) => v && typeof v === 'object';
const readLocal = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k) || 'null') ?? fallback; } catch (e) { return fallback; }
};

export function loadLocal() {
  store.customTasks = readLocal(LOCAL_KEYS.customTasks, {});
  store.taskOverrides = readLocal(LOCAL_KEYS.taskOverrides, {});
  store.customRoles = readLocal(LOCAL_KEYS.customRoles, []);
  store.permanencePlanning = readLocal(LOCAL_KEYS.permanencePlanning, {});
  store.taskNotes = readLocal(LOCAL_KEYS.taskNotes, {});
  store.rayons = readLocal(LOCAL_KEYS.rayons, {});
  store.companyData = readLocal(LOCAL_KEYS.companyData, {});
  const u = getCurrentUser();
  store.completions = u ? readLocal('hm_comp_' + u.id, {}) : {};
}

function applyRemote(remoteKey, value) {
  const prop = REMOTE_KEYS[remoteKey];
  if (!prop || value == null) return false;
  if (prop === 'customRoles' ? !Array.isArray(value) : !isObj(value)) return false;
  store[prop] = value;
  localStorage.setItem(LOCAL_KEYS[prop], JSON.stringify(value));
  return true;
}

// Les cases quotidiennes des jours passés ne sont pas rechargées (anti-résurrection, comme la v3).
export async function refreshCompletions() {
  const u = getCurrentUser();
  if (!u || !getClient()) return;
  let merged = {};
  if (isDirector(u)) {
    (await getAll('hm_completions')).forEach((r) => { if (isObj(r.data)) Object.assign(merged, r.data); });
  } else {
    merged = (await kvGet(u.id, 'hm_completions')) || {};
  }
  const today = todayKey();
  Object.keys(merged).forEach((k) => {
    const m = k.match(/__(\d{4}-\d{2}-\d{2})$/);
    if (m && m[1] !== today) delete merged[k];
  });
  store.completions = merged;
  localStorage.setItem('hm_comp_' + u.id, JSON.stringify(merged));
}

export async function refreshEvents() {
  if (!getClient()) return;
  const { data, error } = await getClient().from('hm_events').select('id,data');
  if (error) throw error;
  const evts = {};
  (data || []).forEach((r) => { if (r.data) evts[r.id] = r.data; });
  store.events = evts;
}

// Notes : ancien objet partagé (v3) + une ligne par utilisateur hm_task_notes_<id> (null = note supprimée).
export async function loadNotes() {
  const u = getCurrentUser();
  if (!u || !getClient()) return;
  const merged = { ...(isObj(store.taskNotes) ? store.taskNotes : {}) };
  const legacy = await kvGet('hm_task_notes').catch(() => null);
  if (isObj(legacy)) Object.assign(merged, legacy);
  const rows = isDirector(u)
    ? await kvList('hm_task_notes_').catch(() => [])
    : [{ data: await kvGet('hm_task_notes_' + u.id).catch(() => null) }];
  rows.forEach((r) => {
    if (!isObj(r.data)) return;
    Object.entries(r.data).forEach(([k, v]) => { if (v === null) delete merged[k]; else merged[k] = v; });
  });
  store.taskNotes = merged;
  localStorage.setItem(LOCAL_KEYS.taskNotes, JSON.stringify(merged));
}

// Notes de passation : une ligne Supabase par jour ET créneau (hm_perm_note_<date>_<slot>).
const PERM_SLOTS = ['matin', 'tranche', 'soir'];
export async function loadPermanenceNotes() {
  const cached = readLocal('hm_perm_notes', {});
  store.permanenceNotes = { ...cached, ...store.permanenceNotes };
  if (!getClient()) return;
  const dates = [todayKey(), dateKeyMinus(1)];
  const keys = dates.flatMap((d) => PERM_SLOTS.map((s) => `${d}_${s}`));
  const vals = await Promise.all(keys.map((k) => kvGet('hm_perm_note_' + k).catch(() => null)));
  keys.forEach((k, i) => { if (typeof vals[i] === 'string') store.permanenceNotes[k] = vals[i]; else if (vals[i] === '') delete store.permanenceNotes[k]; });
  localStorage.setItem('hm_perm_notes', JSON.stringify(store.permanenceNotes));
}

// Note laissée par le créneau précédent (nouveau format, sinon ancien planning.notes de la v3).
const legacyNote = (date, slot) => ((store.permanencePlanning[date] || {}).notes || {})[slot] || '';
const noteOf = (date, slot) => store.permanenceNotes[`${date}_${slot}`] ?? legacyNote(date, slot);
export function getPermanenceIncomingNote(rid) {
  const today = todayKey();
  if (rid === 'perm_matin') return noteOf(dateKeyMinus(1), 'soir');
  if (rid === 'perm_tranche') return noteOf(today, 'matin');
  if (rid === 'perm_soir') return (store.permanencePlanning[today] || {}).tranche?.userId ? noteOf(today, 'tranche') : noteOf(today, 'matin');
  return '';
}
export const getPermanenceOutgoingNote = (rid) => (PERM_SLOT_OF_ROLE[rid] ? noteOf(todayKey(), PERM_SLOT_OF_ROLE[rid]) : '');

export async function loadAll() {
  loadLocal();
  if (!getClient()) { await loadPermanenceNotes(); return; }
  const keys = Object.keys(REMOTE_KEYS);
  const values = await Promise.all(keys.map((k) => kvGet(k).catch(() => null)));
  keys.forEach((k, i) => applyRemote(k, values[i]));
  await Promise.all([refreshCompletions().catch(() => {}), refreshEvents().catch(() => {}), loadNotes().catch(() => {}), loadPermanenceNotes().catch(() => {})]);
  if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('pilotage:loaded'));
}

// Mise à jour ciblée depuis le Realtime
export async function applyRealtime({ table, key, fresh }) {
  if (table === 'hm_events') {
    await refreshEvents().catch(() => {});
    if (isDirector()) await refreshCompletions().catch(() => {});
    return true;
  }
  if (key && key.startsWith('hm_perm_note_')) { await loadPermanenceNotes().catch(() => {}); return true; }
  if (key && key.startsWith('hm_task_notes_')) { await loadNotes().catch(() => {}); return true; }
  return key ? applyRemote(key, fresh) : false;
}

// ── Rôles & tâches ──────────────────────────────────────────
export const getAllRoles = () => [...ROLES, ...(store.customRoles || [])];
export const getRole = (id) => getAllRoles().find((r) => r.id === id);

export const PERM_ROLE_IDS = ['perm_matin', 'perm_soir', 'perm_tranche'];
export const PERM_SLOT_OF_ROLE = { perm_matin: 'matin', perm_soir: 'soir', perm_tranche: 'tranche' };
export const isPermanenceRole = (rid) => PERM_ROLE_IDS.includes(rid);

const permMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const crossesMidnight = (e) => !!(e && e.heureDebut && e.heureFin && permMinutes(e.heureFin) < permMinutes(e.heureDebut));
const slotEntry = (rid, dateStr) => (store.permanencePlanning[dateStr] || {})[PERM_SLOT_OF_ROLE[rid]];

// Entrée de planning active à cet instant (gère le passage de minuit).
export function getPermanenceActiveEntry(rid) {
  if (!PERM_SLOT_OF_ROLE[rid]) return null;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const eToday = slotEntry(rid, todayKey());
  const eHier = slotEntry(rid, dateKeyMinus(1));
  if (eHier && eHier.userId && crossesMidnight(eHier) && nowMin <= permMinutes(eHier.heureFin)) return eHier;
  if (eToday && eToday.userId) {
    if (!eToday.heureDebut || !eToday.heureFin) return eToday;
    const d = permMinutes(eToday.heureDebut), f = permMinutes(eToday.heureFin);
    if (f >= d ? nowMin >= d && nowMin <= f : nowMin >= d) return eToday;
  }
  return null;
}
export function isAssignedToPermanenceToday(rid, userId) {
  const e = userId ? getPermanenceActiveEntry(rid) : null;
  return !!(e && e.userId === userId);
}
export function getPermanenceDeadlineToday(rid) {
  const e = slotEntry(rid, todayKey());
  return !e || !e.heureFin || crossesMidnight(e) ? '' : e.heureFin;
}
export function getPermanenceAssignedName(rid, dateStr = todayKey()) {
  const e = slotEntry(rid, dateStr);
  if (!e || !e.userId) return null;
  const u = getUsers().find((x) => x.id === e.userId);
  return u ? u.name : null;
}
export function getPermanenceHoraireLabel(rid, dateStr = todayKey()) {
  const e = slotEntry(rid, dateStr);
  if (!e || !e.heureDebut || !e.heureFin) return null;
  return `${e.heureDebut} – ${e.heureFin}${crossesMidnight(e) ? ' (+1j)' : ''}`;
}

// ── Accès ───────────────────────────────────────────────────
export function canEditRole(rid) {
  const u = getCurrentUser();
  if (!u) return false;
  if (isDirector(u)) return true;
  if (isPermanenceRole(rid) && isAssignedToPermanenceToday(rid, u.id)) return true;
  return (u.evaluableRoleIds || []).includes(rid) || u.ownRoleId === rid;
}
export function isOwnRole(rid) {
  const u = getCurrentUser();
  return !!u && (u.ownRoleId === rid || (isPermanenceRole(rid) && isAssignedToPermanenceToday(rid, u.id)));
}
export function getAccessibleRoles() {
  const u = getCurrentUser();
  if (!u) return [];
  if (isDirector(u)) return getAllRoles();
  const ids = new Set(u.evaluableRoleIds || []);
  if (u.ownRoleId) ids.add(u.ownRoleId);
  PERM_ROLE_IDS.forEach((rid) => { if (isAssignedToPermanenceToday(rid, u.id)) ids.add(rid); });
  return getAllRoles().filter((r) => ids.has(r.id));
}

// ── Tâches ──────────────────────────────────────────────────
const taskEffective = (role, task) => {
  const ov = (store.taskOverrides[role.id] || {})[task.id];
  return ov ? { ...task, label: ov.label || task.label, note: ov.note !== undefined ? ov.note : task.note, freq: ov.freq || task.freq } : task;
};
const isTaskHidden = (rid, tid) => !!(store.taskOverrides[rid] || {})[tid]?.hidden;

export function getAllTasks(rid) {
  const role = getRole(rid);
  if (!role) return [];
  const u = getCurrentUser();
  const base = role.taches.filter((t) => !isTaskHidden(rid, t.id)).map((t) => taskEffective(role, t));
  const custom = (store.customTasks[rid] || []).filter((t) => isDirector(u) || !t.assignedTo || t.assignedTo === u?.id);
  const now = new Date();
  const dayName = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][now.getDay()];
  const visible = custom.filter((t) => {
    if (t.freq === 'H') return !t.jours || !t.jours.length || t.jours.includes(dayName);
    if (t.freq === 'M') return !t.datesMois || !t.datesMois.length || t.datesMois.map(Number).includes(now.getDate());
    return true;
  });
  return [...base, ...visible]
    .map((t) => (isPermanenceRole(rid) ? { ...t, deadline: getPermanenceDeadlineToday(rid) } : t))
    .sort((a, b) => deadlineSortMinutes(a.deadline) - deadlineSortMinutes(b.deadline));
}

// ── Complétions ─────────────────────────────────────────────
// Un service de permanence de la veille reste actif tant que celui du jour n'a pas démarré.
function permanenceQPeriodKey(rid) {
  const eHier = slotEntry(rid, dateKeyMinus(1));
  if (!eHier || !eHier.userId) return todayKey();
  const eToday = slotEntry(rid, todayKey());
  if (!eToday || !eToday.userId || !eToday.heureDebut) return todayKey();
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() < permMinutes(eToday.heureDebut) ? dateKeyMinus(1) : todayKey();
}
export const effectivePeriodKey = (rid, freq) =>
  freq === 'Q' && isPermanenceRole(rid) ? permanenceQPeriodKey(rid) : periodKey(freq);

export const ck = (rid, tid, freq) => `${getCurrentUser()?.id || 'guest'}__${rid}__${tid}__${effectivePeriodKey(rid, freq)}`;

export function isTaskDone(rid, tid, freq) {
  if (isDirector()) {
    const suffix = `__${rid}__${tid}__${effectivePeriodKey(rid, freq)}`;
    return Object.keys(store.completions).some((k) => k.endsWith(suffix) && store.completions[k]);
  }
  return !!store.completions[ck(rid, tid, freq)];
}

// Heure de validation (événement live) pour le badge de ponctualité.
export function getCompletionTime(rid, tid, freq) {
  const suffix = `__${rid}__${tid}__${effectivePeriodKey(rid, freq)}`;
  const id = Object.keys(store.events).find((k) => k.endsWith(suffix));
  return id ? store.events[id]?.completedAt || null : null;
}

export function getRoleStats(rid, freq = 'ALL') {
  const tasks = getAllTasks(rid).filter((t) => freq === 'ALL' || t.freq === freq);
  const done = tasks.filter((t) => isTaskDone(rid, t.id, t.freq)).length;
  return { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

// ── Pour les Résultats : tâches telles qu'elles existent, sans les filtres « du jour » de getAllTasks ──
// (un jour passé ne doit pas dépendre du jour de la semaine actuel ni de l'utilisateur connecté).
export function getTasksForResults(rid) {
  const role = getRole(rid);
  if (!role) return [];
  const base = role.taches.filter((t) => !isTaskHidden(rid, t.id)).map((t) => taskEffective(role, t));
  return [...base, ...(store.customTasks[rid] || [])];
}

// Rôles pris en compte à une date : tout pour le Directeur, ses fonctions sinon (+ permanence planifiée ce jour-là).
// Un créneau de permanence non planifié à cette date est exclu : ses tâches ne gonflent pas le dénominateur.
export function getResultRolesForDate(dateStr) {
  const u = getCurrentUser();
  if (!u) return [];
  const admin = isDirector(u);
  const own = new Set([...(u.evaluableRoleIds || []), ...(u.ownRoleId ? [u.ownRoleId] : [])]);
  return getAllRoles().filter((r) => {
    if (isPermanenceRole(r.id)) {
      const e = (store.permanencePlanning[dateStr] || {})[PERM_SLOT_OF_ROLE[r.id]];
      if (!e || !e.userId) return false;
      return admin || e.userId === u.id || own.has(r.id);
    }
    return admin || own.has(r.id);
  });
}
