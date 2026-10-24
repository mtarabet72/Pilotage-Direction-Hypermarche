import { getCurrentUser, isDirector } from '../../services/auth.js';
import { store } from '../../core/store.js';
import { loadHistoryIndex } from '../../core/history.js';
import { periodDays, shiftPeriod, todayKey, localDateStr } from '../../core/periods.js';
import { TYPES, typeFreq, typeLabel, periodTitle } from '../../core/periodLabel.js';
import { buildReportModel, reportHtml, rolesUnion } from './report.js';
import { renderPdf } from './pdf.js';
import { $, esc, toast } from '../../core/dom.js';

const DESC = { J: 'Tâches du jour', H: 'Résultat de la semaine', M: 'Résultat du mois', T: 'Résultat du trimestre', S: 'Résultat du semestre', A: 'Résultat de l\'année', P: 'Plage de dates' };
const ICON = { J: '📅', H: '📆', M: '🗓️', T: '📊', S: '🔶', A: '📅', P: '🔎' };
const SECTEURS = ['Commercial', 'Services', 'Permanence'];
const SECT_ICON = { Commercial: '🛍️', Services: '⚙️', Permanence: '🕐' };

const ui = { type: 'H', ref: todayKey(), from: shiftPeriod('M', todayKey(), -1), to: todayKey(), scope: new Set(['ALL']), busy: false };
const days = () => (ui.type === 'P' ? daysInRange(ui.from, ui.to) : periodDays(typeFreq(ui.type), ui.ref));
function daysInRange(a, b) {
  const out = [];
  for (let d = new Date(a + 'T00:00:00'), end = new Date(b + 'T00:00:00'); d <= end && out.length < 400; d.setDate(d.getDate() + 1)) out.push(localDateStr(d));
  return out;
}
const isActive = () => $('view-export')?.classList.contains('active');

function renderShell() {
  const v = $('view-export');
  if (!v || v.dataset.ready) return;
  v.dataset.ready = '1';
  v.innerHTML = `<div class="export-card"><h3>📄 Générer un rapport</h3>
      <div class="type-grid">${TYPES.map(([k, , label]) => `<div class="type-btn" data-type="${k}"><div class="tb-icon">${ICON[k]}</div><div class="tb-label">${label}</div><div class="tb-desc">${DESC[k]}</div></div>`).join('')}</div>
      <div id="ex-single" class="date-row"><div class="date-field"><label id="ex-date-label">📅 Date de référence</label><input type="date" id="ex-date"></div></div>
      <div id="ex-range" class="date-row" style="display:none"><div class="date-field"><label>Du</label><input type="date" id="ex-from"></div><div class="date-field"><label>Au</label><input type="date" id="ex-to"></div></div></div>
    <div class="export-card"><h3>🏢 Périmètre</h3><div id="ex-scope" class="scope-grid"></div></div>
    <div class="export-card"><h3>⚙️ Options</h3><div class="ex-opts">
      <label><input type="checkbox" id="ex-done" checked>Tâches faites ✓</label><label><input type="checkbox" id="ex-todo" checked>Tâches non faites ○</label><label><input type="checkbox" id="ex-note" checked>Notes / commentaires</label></div></div>
    <div class="export-card" style="border-left:4px solid var(--accent);"><div class="export-actions">
      <button class="btn-export" data-action="pdf" id="ex-btn-pdf" style="background:linear-gradient(135deg,#e63950,#c72b3f);">⬇️ Télécharger PDF</button>
      <button class="btn-export" data-action="print" style="background:linear-gradient(135deg,#2980b9,#1a5276);">🖨️ Imprimer</button>
      <button class="btn-preview" data-action="preview">👁️ Aperçu</button></div>
      <div class="ex-progress" id="ex-progress"><span id="ex-progress-text">Génération…</span><div class="bar-bg"><div class="bar" id="ex-progress-bar"></div></div></div></div>
    <div id="preview-panel"><div class="pp-head"><h3>👁️ Aperçu</h3><button class="btn-preview" data-action="close-preview" style="padding:6px 12px;font-size:11px;">✕ Fermer</button></div>
      <div id="preview-iframe-wrap"><iframe id="preview-iframe" style="width:100%;height:80vh;border:none;background:#fff"></iframe></div></div>`;
}

function renderScope() {
  const grid = $('ex-scope');
  if (!grid) return;
  const roles = rolesUnion(days(), null);
  const all = isDirector()
    ? `<button class="scope-btn${ui.scope.has('ALL') ? ' active' : ''}" data-scope="ALL">🌐 Tout le magasin</button>`
    : `<button class="scope-btn${ui.scope.has('ALL') ? ' active' : ''}" data-scope="ALL">👤 Mes fonctions</button>`;
  grid.innerHTML = all + SECTEURS.map((s) => {
    const list = roles.filter((r) => r.secteur === s);
    return list.length ? `<div style="grid-column:1/-1;font-size:10px;font-weight:800;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase;padding:6px 0 2px">${SECT_ICON[s]} ${s}</div>`
      + list.map((r) => `<button class="scope-btn${ui.scope.has(r.id) ? ' active' : ''}" data-scope="${esc(r.id)}">${r.icon} ${esc(r.label)}</button>`).join('') : '';
  }).join('');
}

function sync() {
  document.querySelectorAll('#view-export .type-btn').forEach((b) => b.classList.toggle('active', b.dataset.type === ui.type));
  const custom = ui.type === 'P';
  $('ex-single').style.display = custom ? 'none' : 'flex';
  $('ex-range').style.display = custom ? 'flex' : 'none';
  $('ex-date').value = ui.ref; $('ex-from').value = ui.from; $('ex-to').value = ui.to;
  $('ex-date-label').textContent = `📅 ${ui.type === 'J' ? 'Date du rapport' : 'Une date de la période'} — ${periodTitle(ui.type, ui.ref, ui.from, ui.to)}`;
  renderScope();
}

async function makeHtml() {
  if (!getCurrentUser()) throw new Error('Connectez-vous d\'abord');
  await loadHistoryIndex(true);
  const roleIds = ui.scope.has('ALL') ? null : ui.scope;
  const model = buildReportModel({
    type: ui.type, ref: ui.ref, from: ui.from, to: ui.to, roleIds,
    options: { showDone: $('ex-done').checked, showTodo: $('ex-todo').checked, showNote: $('ex-note').checked }
  });
  return { model, html: reportHtml(model, { company: store.companyData || {}, user: getCurrentUser(), isDirector: isDirector() }) };
}

const safeName = (s) => String(s).replace(/[^a-z0-9À-ɏ]/gi, '_');

async function run(action) {
  if (ui.busy) return;
  ui.busy = true;
  const btn = $('ex-btn-pdf'), prog = $('ex-progress');
  try {
    const { model, html } = await makeHtml();
    if (action === 'preview') {
      $('preview-panel').classList.add('open');
      $('preview-iframe').srcdoc = html;
      $('preview-panel').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    } else if (action === 'print') {
      const w = window.open('', '_blank');
      if (!w) return toast('Autorisez les fenêtres popup pour imprimer', '#e74c3c');
      w.document.write(html); w.document.close(); w.onload = () => { w.focus(); w.print(); };
    } else if (action === 'pdf') {
      btn.disabled = true; btn.style.opacity = '.6'; prog.style.display = 'flex';
      const set = (p, t) => { $('ex-progress-bar').style.width = p + '%'; $('ex-progress-text').textContent = t; };
      const name = `${safeName((store.companyData || {}).nom || 'Rapport')}_${safeName(typeLabel(ui.type))}_${safeName(periodTitle(ui.type, ui.ref, ui.from, ui.to))}_${todayKey()}.pdf`;
      const pages = await renderPdf(html, name, set);
      set(100, '✅ PDF téléchargé');
      toast(`✅ PDF généré (${pages} page${pages > 1 ? 's' : ''})`, '#27ae60');
      setTimeout(() => { prog.style.display = 'none'; set(0, ''); }, 2500);
    }
    return model;
  } catch (e) {
    console.error('Export :', e);
    toast('❌ ' + e.message, '#e74c3c');
    if (prog) prog.style.display = 'none';
  } finally {
    ui.busy = false;
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

export function initExport() {
  window.setExportType = () => {};        // ancien attribut onclick de la v4 : remplacé par la délégation ci-dessous
  document.addEventListener('click', (e) => {
    if (!isActive()) return;
    const t = e.target.closest('#view-export .type-btn');
    if (t) { ui.type = t.dataset.type; if (ui.scope.size && !ui.scope.has('ALL')) ui.scope = new Set(['ALL']); return sync(); }
    const s = e.target.closest('[data-scope]');
    if (s) {
      const id = s.dataset.scope;
      if (id === 'ALL') ui.scope = new Set(['ALL']);
      else { ui.scope.delete('ALL'); ui.scope.has(id) ? ui.scope.delete(id) : ui.scope.add(id); if (!ui.scope.size) ui.scope.add('ALL'); }
      return renderScope();
    }
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (a === 'close-preview') return $('preview-panel').classList.remove('open');
    if (a) run(a);
  });
  document.addEventListener('change', (e) => {
    if (!isActive()) return;
    const id = e.target.id;
    if (id === 'ex-date' && e.target.value) ui.ref = e.target.value;
    else if (id === 'ex-from' && e.target.value) ui.from = e.target.value;
    else if (id === 'ex-to' && e.target.value) ui.to = e.target.value;
    else return;
    if (ui.from > ui.to) [ui.from, ui.to] = [ui.to, ui.from];
    ui.scope = new Set(['ALL']);
    sync();
  });
  document.addEventListener('pilotage:view', (e) => { if (e.detail === 'export') { renderShell(); sync(); } });
}
