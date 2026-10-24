import { store } from '../../core/store.js';
import { periodKey, FREQ_LABELS, FREQ_COLORS } from '../../core/periods.js';
import { $, esc } from '../../core/dom.js';

const ACTIVE_KEY = 'hm_rayon_actif';
const BLUE = '#2980b9';
// Les tâches de rayon n'existent qu'en Q/H/M ; un filtre T/A hérité de la vue Fonction est ignoré.
const effFreq = (f) => (f === 'T' || f === 'A' ? 'ALL' : f);

// Cases de rayon : stockées sur cet appareil UNIQUEMENT (comme la v3), mais rattachées à la période
// en cours — les cases se réinitialisent donc chaque jour / semaine / mois (la v3 ne les remettait jamais à zéro).
const storageKey = (rayonKey, t) => `hm_rayon_${rayonKey}_${t.id}_${t.freq}_${periodKey(t.freq)}`;
const isDone = (rayonKey, t) => localStorage.getItem(storageKey(rayonKey, t)) === 'true';

export function getActiveRayon() {
  const last = localStorage.getItem(ACTIVE_KEY);
  return last && store.rayons[last] ? last : '';
}

export function populateRayonSelect() {
  const sel = $('selectRayon');
  if (!sel) return;
  const keys = Object.keys(store.rayons || {});
  sel.innerHTML = '<option value="">-- Choisir un rayon --</option>' +
    keys.map((k) => `<option value="${esc(k)}">${esc(store.rayons[k].nom || k)}</option>`).join('');
  sel.value = getActiveRayon();
}

export function setActiveRayon(key) {
  if (key) localStorage.setItem(ACTIVE_KEY, key);
}

export function toggleRayonTask(rayonKey, tid, freq) {
  const t = (store.rayons[rayonKey]?.taches || []).find((x) => x.id === tid && x.freq === freq);
  if (!t) return;
  localStorage.setItem(storageKey(rayonKey, t), String(!isDone(rayonKey, t)));
}

export function renderRayon(freq) {
  const rh = $('role-header'), tl = $('task-list');
  const keys = Object.keys(store.rayons || {});
  if (!keys.length) {
    rh.innerHTML = `<div style="padding:28px 20px;text-align:center;color:var(--muted);"><div style="font-size:32px;margin-bottom:10px;">🏪</div>
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;">Aucun rayon créé</div>
      <div style="font-size:12px;">Les rayons se créent dans <strong>⚙️ Paramètres → Gestion des Rayons</strong>.</div></div>`;
    tl.innerHTML = ''; $('pb-count').textContent = '0/0 (0%)'; $('progress-bar').style.width = '0%';
    return;
  }
  const key = getActiveRayon();
  const rayon = key && store.rayons[key];
  if (!rayon) {
    rh.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);">Sélectionnez un rayon ci-dessus.</div>';
    tl.innerHTML = ''; $('pb-count').textContent = '0/0 (0%)'; $('progress-bar').style.width = '0%';
    return;
  }
  const f = effFreq(freq);
  const tasks = (rayon.taches || []).filter((t) => f === 'ALL' || t.freq === f);
  const done = tasks.filter((t) => isDone(key, t)).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const eq = rayon.equipe || {};

  rh.style.borderColor = BLUE + '28';
  rh.innerHTML = `<div class="rh-icon">📦</div>
    <div class="rh-body"><h2 style="color:${BLUE}">${esc(rayon.nom)} <span style="font-size:12px;color:var(--muted);font-weight:500;">(N°${esc(rayon.numero)})</span></h2>
    <div class="rh-sous">Rayon — ${esc(rayon.secteur)} — ${esc(rayon.departement)}</div>
    <div class="gere-tags"><span class="gtag">👤 Chef : ${esc(eq.chef)}</span><span class="gtag">👁️ Superviseur : ${esc(eq.superviseur)}</span></div></div>
    <div id="donut-wrap"><div class="donut-pct" style="color:${BLUE};font-size:20px;">${pct}%</div><div class="donut-lbl">Progression</div></div>`;

  tl.innerHTML = tasks.length ? tasks.map((t) => {
    const d = isDone(key, t);
    const who = t.responsable === 'chef' ? eq.chef : t.responsable === 'superviseur' ? eq.superviseur : 'Équipe employés';
    return `<div class="task-item${d ? ' done-item' : ''}" data-rayon-task="${esc(t.id)}" data-freq="${esc(t.freq)}" style="${d ? `background:#eaf4fb;border-color:${BLUE}22` : ''}">
      <div class="task-check" style="${d ? `background:${BLUE};border-color:${BLUE}` : ''}">${d ? '✓' : ''}</div>
      <div class="task-body"><div class="task-top"><span class="task-label">${esc(t.label)}</span>
        <span class="fbadge" style="background:${FREQ_COLORS[t.freq]}18;color:${FREQ_COLORS[t.freq]}">${FREQ_LABELS[t.freq]}</span><span class="cbadge">👤 ${esc(who)}</span></div>
        ${t.note ? `<div class="task-note">📝 ${esc(t.note)}</div>` : ''}</div></div>`;
  }).join('') : '<div style="text-align:center;padding:40px;color:var(--muted);">Aucune tâche.</div>';

  $('pb-count').textContent = `${done}/${tasks.length} (${pct}%)`;
  $('pb-count').style.color = BLUE;
  const bar = $('progress-bar'); bar.style.width = pct + '%'; bar.style.background = BLUE;
}
