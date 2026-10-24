import { getCurrentUser } from '../../services/auth.js';
import { loadHistoryIndex } from '../../core/history.js';
import { engine, resultsContext } from '../../core/resultsContext.js';
import {
  todayKey, fmtDate, fmtDateStr, shiftPeriod, periodDays, periodKeyForDate, FREQ_LABELS
} from '../../core/periods.js';
import { $, esc } from '../../core/dom.js';
import { TYPES, MONTHS, typeFreq, typeLabel, periodTitle } from '../../core/periodLabel.js';

const UNIT = { Q: 'jours', H: 'semaines', M: 'mois', T: 'trimestres', S: 'semestres', A: 'années' };
const UNIT_ONE = { Q: 'jour', H: 'semaine', M: 'mois', T: 'trimestre', S: 'semestre', A: 'année' };
const OWN = { Q: 'quotidiennes', H: 'hebdomadaires', M: 'mensuelles', T: 'trimestrielles', S: 'semestrielles', A: 'annuelles' };
const DAY = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

const ui = { type: 'H', ref: todayKey(), from: todayKey(), to: todayKey() };
const pctColor = (p) => (p >= 80 ? '#27ae60' : p >= 50 ? '#f39c12' : '#e74c3c');
const R = (p) => (p === null || p === undefined ? '—' : Math.round(p) + '%');
const freqOf = () => typeFreq(ui.type);

const periodTitleUi = () => periodTitle(ui.type, ui.ref, ui.from, ui.to);

const barRow = (label, sub, pct, color, dim = false) => `<div class="rs-comp"${dim ? ' style="opacity:.4"' : ''}>
  <div class="rs-comp-top"><span>${label}${sub ? ` <span class="rs-comp-sub">${sub}</span>` : ''}</span><span style="color:${color || pctColor(pct)}">${R(pct)}</span></div>
  <div class="rs-bar-wrap"><div class="rs-bar" style="width:${pct ?? 0}%;background:${color || pctColor(pct)}"></div></div></div>`;

function componentsHtml(res) {
  if (!res.components.length) return '';
  return res.components.map((c) => {
    if (c.kind === 'moyenne') return barRow(`Moyenne des ${UNIT[c.level]}`, `${c.count} ${c.count > 1 ? UNIT[c.level] : UNIT_ONE[c.level]}`, c.pct);
    return barRow(`Tâches ${OWN[c.level]}`, `${c.done}/${c.total} · niveau propre`, c.pct);
  }).join('');
}

// Rôles réellement concernés sur la période (union des rôles évalués chaque jour)
function rolesInPeriod(days) {
  const seen = new Map();
  days.forEach((d) => resultsContext.roles(d).forEach((r) => seen.set(r.id, r)));
  return [...seen.values()];
}

function roleRowsHtml(days, scoreFn) {
  const rows = rolesInPeriod(days).map((r) => ({ r, res: scoreFn(r.id) })).filter((x) => x.res.pct !== null);
  if (!rows.length) return '';
  rows.sort((a, b) => a.r.secteur.localeCompare(b.r.secteur) || a.r.label.localeCompare(b.r.label));
  return rows.map(({ r, res }) => `<div class="res-role-row"><span class="res-role-icon">${r.icon}</span><span class="res-role-name">${esc(r.label)}</span>
    <div class="res-role-bar-wrap"><div class="res-role-bar" style="width:${res.pct}%;background:${r.color}"></div></div>
    <span class="res-role-pct" style="color:${pctColor(res.pct)}">${R(res.pct)}</span></div>
    ${res.components.length > 1 ? `<div class="rs-comp-sub" style="margin:-2px 0 6px 30px">${res.components.map((c) => `${c.level} ${R(c.pct)}`).join(' · ')}</div>` : ''}`).join('');
}

function dailyRowsHtml(days) {
  const today = todayKey();
  return days.map((d) => {
    const future = d > today;
    const pct = future ? null : engine.ownStats('Q', d, null).pct;
    return `<div class="res-day-row" style="${future ? 'opacity:.4' : ''}"><span class="res-day-label">${DAY[new Date(d + 'T00:00:00').getDay()]} ${fmtDateStr(d).slice(0, 5)}${d === today ? ' 📍' : ''}</span>
      <div class="res-day-bar-wrap"><div class="res-day-bar" style="width:${pct ?? 0}%;background:${pct === null ? '#ddd' : pctColor(pct)}"></div></div><span class="res-day-pct">${R(pct)}</span></div>`;
  }).join('');
}

function monthlyRowsHtml(f, ref) {
  const today = todayKey(), months = [...new Set(periodDays(f, ref).map((d) => d.slice(0, 7)))];
  return months.map((ym) => {
    const first = ym + '-01', future = first > today;
    const pct = future ? null : engine.score('M', first).pct;
    return barRow(`${MONTHS[+ym.slice(5, 7) - 1]}`, '', pct, null, future);
  }).join('');
}

function dayDetailHtml(date) {
  return rolesInPeriod([date]).map((r) => {
    const tasks = resultsContext.tasks(r.id, 'Q', date);
    if (!tasks.length) return '';
    return `<div style="margin:10px 0 4px;font-weight:800;font-size:12px;">${r.icon} ${esc(r.label)}</div>` + tasks.map((t) => {
      const done = resultsContext.isDone(r.id, t.id, 'Q', date);
      return `<div class="rs-task" style="background:${done ? '#f0fff4' : '#fff5f5'}"><span>${done ? '✅' : '⬜'}</span><span style="flex:1;${done ? 'color:#1a6b3c;text-decoration:line-through' : 'color:#555'}">${esc(t.label)}</span></div>`;
    }).join('');
  }).join('');
}

const METHOD = `<details class="rs-method"><summary>Méthode de calcul</summary>
  Chaque niveau (jour, semaine, mois…) compte pour un poids égal. Pour une période : on calcule le % de réalisation de <strong>chaque</strong> sous-période
  (chaque jour, chaque semaine…), on en fait la <strong>moyenne</strong>, puis on y ajoute le % des tâches propres à la période (ex. tâches hebdomadaires pour une semaine).
  Le résultat est la moyenne de ces composantes. Les niveaux sans tâche sont ignorés ; un jour futur n'est pas compté ; une tâche ne compte qu'à partir de sa date de création.</details>`;

function draw() {
  const content = $('results-content');
  if (!content) return;
  if (!getCurrentUser()) { content.innerHTML = ''; return; }
  const f = freqOf(), custom = ui.type === 'P';
  const res = custom ? engine.scoreRange(ui.from, ui.to) : engine.score(f, ui.ref);
  const days = res.days.length ? res.days : [ui.ref];

  if (res.pct === null) {
    content.innerHTML = `<div class="res-card"><h3>${esc(periodTitleUi())}</h3><div style="text-align:center;padding:30px;color:var(--muted);">Aucune tâche évaluée sur cette période.</div></div>`;
    return;
  }
  let detail = '';
  if (f === 'Q') detail = `<div style="font-size:12px;font-weight:800;color:var(--muted);margin:14px 0 4px;text-transform:uppercase;letter-spacing:1px;">Détail des tâches</div>${dayDetailHtml(ui.ref)}`;
  else if (f === 'H' || f === 'M' || (custom && days.length <= 31)) detail = `<div style="font-size:12px;font-weight:800;color:var(--muted);margin:14px 0 8px;text-transform:uppercase;letter-spacing:1px;">Détail journalier</div>${dailyRowsHtml(custom ? days : periodDays(f, ui.ref))}`;
  else if (f === 'T' || f === 'S' || f === 'A') detail = `<div style="font-size:12px;font-weight:800;color:var(--muted);margin:14px 0 8px;text-transform:uppercase;letter-spacing:1px;">Détail mensuel</div>${monthlyRowsHtml(f, ui.ref)}`;

  const roles = f === 'Q' ? '' : roleRowsHtml(days, (rid) => (custom ? engine.scoreRange(ui.from, ui.to, { roleId: rid }) : engine.score(f, ui.ref, { roleId: rid })));
  content.innerHTML = `<div class="res-card"><h3>${esc(typeLabel(ui.type))} — ${esc(periodTitleUi())}</h3>
    <div class="res-stat-grid"><div class="res-stat"><div class="res-stat-val" style="color:${pctColor(res.pct)}">${R(res.pct)}</div><div class="res-stat-lbl">Résultat de la période</div></div></div>
    <div style="font-size:12px;font-weight:800;color:var(--muted);margin:14px 0 4px;text-transform:uppercase;letter-spacing:1px;">Composantes</div>${componentsHtml(res)}
    ${detail}
    ${roles ? `<div style="font-size:12px;font-weight:800;color:var(--muted);margin:16px 0 8px;text-transform:uppercase;letter-spacing:1px;">Par fonction</div>${roles}` : ''}
    ${METHOD}</div>`;
}

function renderControls() {
  const card = document.querySelector('#view-results .res-card');
  if (!card || card.dataset.ready) return;
  card.dataset.ready = '1';
  card.innerHTML = `<h3>📈 Résultats</h3>
    <div class="rs-types">${TYPES.map(([k, , label]) => `<button type="button" class="rs-type" data-type="${k}">${label}</button>`).join('')}</div>
    <div class="rs-nav" id="rs-nav-single"><button type="button" data-nav="-1" aria-label="Période précédente">‹</button>
      <input type="date" id="res-date"><button type="button" data-nav="1" aria-label="Période suivante">›</button>
      <button type="button" data-nav="today">Aujourd'hui</button></div>
    <div class="rs-nav" id="rs-nav-range" style="display:none"><label>Du <input type="date" id="res-from"></label><label>au <input type="date" id="res-to"></label></div>`;
}

function syncControls() {
  document.querySelectorAll('.rs-type').forEach((b) => b.classList.toggle('active', b.dataset.type === ui.type));
  const custom = ui.type === 'P';
  $('rs-nav-single').style.display = custom ? 'none' : 'flex';
  $('rs-nav-range').style.display = custom ? 'flex' : 'none';
  $('res-date').value = ui.ref; $('res-from').value = ui.from; $('res-to').value = ui.to;
}

async function render() {
  renderControls();
  if (!$('res-date')) return;
  syncControls();
  const content = $('results-content');
  if (getCurrentUser() && content && !content.innerHTML.trim()) content.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">⏳ Chargement de l\'historique…</div>';
  await loadHistoryIndex();
  draw();
}

const isActive = () => $('view-results')?.classList.contains('active');

export function initResults() {
  window.renderResults = render;           // compatibilité avec l'ancien attribut onchange
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.rs-type');
    if (t && isActive()) {
      ui.type = t.dataset.type;
      if (ui.type === 'P' && ui.from === ui.to) { ui.to = todayKey(); ui.from = shiftPeriod('M', ui.to, -1); }
      return render();
    }
    const n = e.target.closest('[data-nav]');
    if (n && isActive()) {
      const v = n.dataset.nav;
      ui.ref = v === 'today' ? todayKey() : shiftPeriod(freqOf(), ui.ref, +v);
      render();
    }
  });
  document.addEventListener('change', (e) => {
    if (!isActive()) return;
    if (e.target.id === 'res-date' && e.target.value) { ui.ref = e.target.value; render(); }
    if ((e.target.id === 'res-from' || e.target.id === 'res-to') && e.target.value) {
      ui[e.target.id === 'res-from' ? 'from' : 'to'] = e.target.value;
      if (ui.from > ui.to) [ui.from, ui.to] = [ui.to, ui.from];
      render();
    }
  });
  document.addEventListener('pilotage:view', (e) => { if (e.detail === 'results') { ui.ref = ui.ref || todayKey(); render(); } });
  document.addEventListener('pilotage:login', () => { const c = $('results-content'); if (c) c.innerHTML = ''; if (isActive()) render(); });
  document.addEventListener('pilotage:changed', () => { if (isActive()) loadHistoryIndex(true).then(draw); });
}
