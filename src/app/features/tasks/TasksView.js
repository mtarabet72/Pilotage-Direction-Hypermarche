import { getCurrentUser, isDirector } from '../../services/auth.js';
import {
  store, getAccessibleRoles, getRole, getAllTasks, getRoleStats, isTaskDone, canEditRole, isOwnRole,
  isPermanenceRole, getPermanenceAssignedName, getPermanenceHoraireLabel, getCompletionTime, ck
} from '../../core/store.js';
import { setTaskDone } from '../../core/completions.js';
import { saveCustomTasks, purgeTaskData } from '../../core/persist.js';
import { openTaskForm } from './taskForm.js';
import { openNoteForm } from './noteForm.js';
import { renderRayon, populateRayonSelect, setActiveRayon, toggleRayonTask } from './RayonView.js';
import { FREQ_LABELS, FREQ_COLORS, deadlinePeriodInfo } from '../../core/periods.js';

const SECTEURS_ORDER = ['Commercial', 'Services', 'Permanence'];
const secteurIcon = (s) => (s === 'Commercial' ? '🛍️' : s === 'Permanence' ? '🕐' : '⚙️');
const ui = { roleId: null, freq: 'ALL', mode: 'role' };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, color = '#1a1f2e') {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg; el.style.background = color; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

const closeSidebar = () => { $('sidebar')?.classList.remove('open'); $('sidebar-overlay')?.classList.remove('open'); };
const toggleSidebar = () => { $('sidebar')?.classList.toggle('open'); $('sidebar-overlay')?.classList.toggle('open'); };

function renderSidebar() {
  const sb = $('sidebar');
  if (!sb) return;
  const accessible = getAccessibleRoles();
  let html = '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px 6px;"><div class="sb-label" style="margin:0;">Fonctions accessibles</div></div>';
  if (!accessible.length) {
    sb.innerHTML = html + '<div style="padding:20px 14px;font-size:12px;color:var(--muted);text-align:center;">Aucune fonction accessible</div>';
    return;
  }
  SECTEURS_ORDER.forEach((secteur) => {
    const list = accessible.filter((r) => r.secteur === secteur);
    if (!list.length) return;
    html += `<div style="padding:8px 14px 3px;font-size:9px;font-weight:800;color:var(--accent);letter-spacing:1.5px;text-transform:uppercase;background:#fef5f6">${secteurIcon(secteur)} ${secteur}</div>`;
    list.forEach((r) => {
      const s = getRoleStats(r.id);
      const evalBadge = !isOwnRole(r.id) && !isDirector() ? '<span class="rb-badge" style="background:#eaf4fb;color:#2980b9">Éval.</span>' : '';
      html += `<button class="role-btn${r.id === ui.roleId ? ' active' : ''}" data-role="${esc(r.id)}" style="--rc:${r.color};--rl:${r.light}">
        <div class="rb-top"><span class="rb-icon">${r.icon}</span><span class="rb-name">${esc(r.label)}</span>${evalBadge}</div>
        <div class="rb-sub">${esc(r.sous)}</div>
        <div class="rb-bar-wrap"><div class="rb-bar" style="width:${s.pct}%;background:${r.color}"></div></div>
        <div class="rb-ct">${s.done}/${s.total} tâches</div></button>`;
    });
  });
  sb.innerHTML = html;
}

function renderRoleHeader(r) {
  const s = getRoleStats(r.id);
  const circ = 2 * Math.PI * 26, dash = circ * (1 - s.pct / 100);
  const rh = $('role-header');
  rh.style.borderColor = r.color + '28';
  rh.innerHTML = `<div class="rh-icon">${r.icon}</div>
    <div class="rh-body"><h2 style="color:${r.color}">${esc(r.label)}</h2><div class="rh-sous">${esc(r.sous)}</div>
    ${r.gere?.length ? `<div class="gere-tags">${r.gere.map((g) => `<span class="gtag" style="background:${r.light};color:${r.color}">${esc(g)}</span>`).join('')}</div>` : ''}
    ${r.rayons?.length ? `<div class="rayon-tags">${r.rayons.map((x) => `<span class="rtag">${esc(x)}</span>`).join('')}</div>` : ''}</div>
    <div id="donut-wrap"><svg width="62" height="62" viewBox="0 0 62 62" style="transform:rotate(-90deg)">
      <circle cx="31" cy="31" r="26" fill="none" stroke="#eef0f4" stroke-width="8"/>
      <circle cx="31" cy="31" r="26" fill="none" stroke="${r.color}" stroke-width="8" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${dash.toFixed(1)}" stroke-linecap="round"/>
      <text x="31" y="36" text-anchor="middle" font-family="DM Mono,monospace" font-size="11" font-weight="900" fill="${r.color}" transform="rotate(90,31,31)">${s.pct}%</text>
    </svg><div class="donut-lbl">${s.done}/${s.total}</div></div>`;
}

function renderControls() {
  const rayon = ui.mode === 'rayon', admin = isDirector();
  document.querySelectorAll('.freq-btn[data-freq]').forEach((btn) => {
    const f = btn.dataset.freq, c = f === 'ALL' ? '#555' : FREQ_COLORS[f];
    const on = f === ui.freq;
    btn.style.background = on ? c : '#fff'; btn.style.color = on ? '#fff' : c; btn.style.borderColor = c;
    btn.style.display = rayon && (f === 'T' || f === 'A') ? 'none' : '';
  });
  const toggle = document.querySelector('.view-mode-toggle');
  if (toggle) toggle.style.display = admin ? '' : 'none';   // « Par Rayon » réservé au Directeur (comme la v3)
  [['view-mode-role', 'role'], ['view-mode-rayon', 'rayon']].forEach(([id, m]) => {
    const b = $(id); if (!b) return;
    const on = ui.mode === m;
    b.style.background = on ? 'var(--accent)' : '#fff'; b.style.color = on ? '#fff' : '#555'; b.style.borderColor = on ? 'var(--accent)' : '#ccc';
  });
  const sel = $('rayon-selector'); if (sel) sel.style.display = rayon ? 'block' : 'none';
  const form = $('add-form'); if (form) form.style.display = 'none';   // remplacé par la fenêtre modale
  const add = $('add-btn'); if (add) add.style.display = admin && !rayon ? 'block' : 'none';
}

function permanenceLine(r) {
  const el = $('permanence-banner');
  if (!el) return;
  if (!isPermanenceRole(r.id)) { el.style.display = 'none'; return; }
  const name = getPermanenceAssignedName(r.id), hor = getPermanenceHoraireLabel(r.id);
  el.style.display = 'block';
  el.innerHTML = `<div style="background:#fff;border-radius:10px;box-shadow:var(--shadow);padding:10px 14px;margin-bottom:12px;border-left:4px solid ${r.color};font-size:12px;">
    <strong>${r.icon} ${esc(r.label)}</strong> — ${name ? esc(name) : '<span style="color:#e74c3c">Non planifié</span>'}${hor ? ` · ${esc(hor)}` : ''}</div>`;
}

const safeData = (u) => (typeof u === 'string' && /^data:(image|application)\//.test(u) ? u : '');

function noteHtml(r, t) {
  const suffix = `__${r.id}__${t.id}__`;
  const mine = store.taskNotes[ck(r.id, t.id, t.freq)];
  const any = isDirector() ? Object.entries(store.taskNotes).find(([k, v]) => k.includes(suffix) && v)?.[1] : null;
  const note = mine || any;
  if (!note) return '';
  let html = '';
  if (note.comment) {
    const who = isDirector() && note.userName ? `<span class="tc-who">${esc(note.userName)} :</span> ` : '';
    html += `<div class="task-comment-display">💬 ${who}${esc(note.comment)}</div>`;
  }
  const data = safeData(note.fileData);
  if (data) {
    const size = note.fileSize ? Math.round(note.fileSize / 1024) + ' Ko' : '';
    html += (note.fileType || '').startsWith('image/')
      ? `<div class="task-attach-display"><img src="${esc(data)}" alt="${esc(note.fileName)}"></div>`
      : `<div class="task-attach-display"><a href="${esc(data)}" download="${esc(note.fileName || 'piece-jointe')}">📎 ${esc(note.fileName || 'fichier')} ${size}</a></div>`;
  }
  return html;
}

function deadlineHtml(r, t, done) {
  if (!t.deadline) return '';
  const [dh, dm] = t.deadline.split(':').map(Number), dl = dh * 60 + dm;
  const base = 'display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:3px 9px;border-radius:10px;';
  const doneAt = done ? getCompletionTime(r.id, t.id, t.freq) : null;
  if (doneAt) {
    const d = new Date(doneAt), onTime = d.getHours() * 60 + d.getMinutes() <= dl;
    const hh = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `<span style="${base}background:${onTime ? '#eafaf1' : '#fdecea'};color:${onTime ? '#27ae60' : '#e74c3c'}">${onTime ? '🟢' : '🔴'} Validé à ${hh}</span>`;
  }
  const now = new Date(), late = now.getHours() * 60 + now.getMinutes() > dl;
  const p = deadlinePeriodInfo(t.deadline);
  return `<span style="${base}background:${late ? '#fdecea' : '#fef9f0'};color:${late ? '#e74c3c' : '#e67e22'}">${late ? '🔴' : '⏳'} ${p.emoji} ${p.label} · avant ${esc(t.deadline)}</span>`;
}

function actionsHtml(t, cust, clickable) {
  const btns = [];
  if (clickable) btns.push('<button type="button" data-action="note" title="Commentaire / pièce jointe">💬</button>');
  if (isDirector() && cust) btns.push('<button type="button" data-action="edit" title="Modifier">✏️</button><button type="button" data-action="delete" title="Supprimer">🗑️</button>');
  return btns.length ? `<div class="task-actions">${btns.join('')}</div>` : '';
}

function renderTasks(r) {
  const tasks = getAllTasks(r.id).filter((t) => ui.freq === 'ALL' || t.freq === ui.freq);
  const tl = $('task-list');
  if (!tasks.length) { tl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">Aucune tâche pour ce filtre.</div>'; return; }
  const canEdit = canEditRole(r.id), admin = isDirector();
  tl.innerHTML = tasks.map((t) => {
    const done = isTaskDone(r.id, t.id, t.freq), cust = String(t.id).startsWith('c_');
    const clickable = canEdit && !admin;
    const dl = deadlineHtml(r, t, done);
    return `<div class="task-item${done ? ' done-item' : ''}${!canEdit ? ' read-only' : ''}" data-task="${esc(t.id)}" data-freq="${esc(t.freq)}" style="${done ? `background:${r.light};border-color:${r.color}22` : ''}">
      <div class="task-check" style="${done ? `background:${r.color};border-color:${r.color}` : ''}${clickable ? '' : ';opacity:0.4;cursor:default'}">${done ? '✓' : ''}</div>
      <div class="task-body" style="flex:1;">
        <div class="task-top"><span class="task-label">${esc(t.label)}</span>
          <span class="fbadge" style="background:${FREQ_COLORS[t.freq]}18;color:${FREQ_COLORS[t.freq]}">${FREQ_LABELS[t.freq]}</span>${cust ? '<span class="cbadge">Personnalisé</span>' : ''}</div>
        ${t.note ? `<div class="task-note">${esc(t.note)}</div>` : ''}
        ${dl ? `<div style="margin-top:5px;">${dl}</div>` : ''}${noteHtml(r, t)}
      </div>${actionsHtml(t, cust, clickable)}</div>`;
  }).join('');
}

function renderProgress(r) {
  const tasks = getAllTasks(r.id).filter((t) => ui.freq === 'ALL' || t.freq === ui.freq);
  const done = tasks.filter((t) => isTaskDone(r.id, t.id, t.freq)).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  $('pb-count').textContent = `${done}/${tasks.length} (${pct}%)`;
  $('pb-count').style.color = r.color;
  const bar = $('progress-bar'); bar.style.width = pct + '%'; bar.style.background = r.color;
}

export function renderTaskView() {
  if (!getCurrentUser() || !$('task-list')) return;
  if (ui.mode === 'rayon' && isDirector()) {
    renderControls(); populateRayonSelect();
    const b = $('eval-banner'); if (b) b.style.display = 'none';
    const pb = $('permanence-banner'); if (pb) pb.style.display = 'none';
    renderRayon(ui.freq);
    return;
  }
  ui.mode = 'role';
  const accessible = getAccessibleRoles();
  if (!accessible.find((r) => r.id === ui.roleId)) {
    const own = accessible.find((r) => isOwnRole(r.id));
    ui.roleId = (own || accessible.find((r) => getAllTasks(r.id).length) || accessible[0])?.id || null;
  }
  renderSidebar();
  const r = ui.roleId && getRole(ui.roleId);
  if (!r) { $('task-list').innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">Aucune fonction accessible.</div>'; $('role-header').innerHTML = ''; return; }
  const evalMode = !isOwnRole(r.id) && !isDirector();
  const banner = $('eval-banner');
  if (banner) {
    banner.style.display = evalMode ? 'flex' : 'none';
    $('eval-banner-text').textContent = `🔍 Mode Évaluation — Vous évaluez : ${r.label} (${r.sous})`;
  }
  renderRoleHeader(r); renderControls(); permanenceLine(r); renderTasks(r); renderProgress(r);
}

export async function toggleTask(tid, freq) {
  const user = getCurrentUser(), r = ui.roleId && getRole(ui.roleId);
  if (!user || !r) return;
  if (isDirector()) return toast('Le Directeur suit les tâches, il ne les coche pas', '#f39c12');
  if (!canEditRole(r.id)) return toast('Accès non autorisé', '#e74c3c');
  const task = getAllTasks(r.id).find((t) => t.id === tid && t.freq === freq) || getAllTasks(r.id).find((t) => t.id === tid);
  if (!task) return;

  const wasDone = !!store.completions[ck(r.id, tid, freq)];
  if (!wasDone && task.deadline) {                       // on ne bloque que le cochage, jamais le décochage
    const now = new Date(), [dh, dm] = task.deadline.split(':').map(Number);
    if (now.getHours() * 60 + now.getMinutes() > dh * 60 + dm) {
      const p = deadlinePeriodInfo(task.deadline);
      return toast(`⛔ Hors délai — ${p.emoji} ${p.label} : validation avant ${task.deadline} uniquement`, '#e74c3c');
    }
  }
  const pending = setTaskDone(r, task, freq, !wasDone);  // l'état local est déjà à jour au retour synchrone
  renderTaskView();
  document.dispatchEvent(new CustomEvent('pilotage:changed'));
  const res = await pending;
  if (!res.synced) toast('⚠️ Enregistré sur cet appareil — synchronisation Supabase en attente', '#e67e22');
  renderTaskView();
}

async function deleteTask(taskId) {
  const r = ui.roleId;
  if (!isDirector() || !r) return;
  const t = (store.customTasks[r] || []).find((x) => x.id === taskId);
  if (!t || !window.confirm(`Supprimer la tâche « ${t.label} » ?\nLes cases cochées et commentaires associés seront aussi supprimés pour tous les utilisateurs.`)) return;
  store.customTasks[r] = store.customTasks[r].filter((x) => x.id !== taskId);
  renderTaskView();
  const [a, b] = await Promise.all([saveCustomTasks(), purgeTaskData(r, taskId)]);
  document.dispatchEvent(new CustomEvent('pilotage:changed'));
  toast(a.synced && b.synced ? '🗑️ Tâche supprimée' : '⚠️ Supprimée sur cet appareil — synchronisation en attente', a.synced && b.synced ? '#27ae60' : '#e67e22');
}

const refresh = () => { renderTaskView(); document.dispatchEvent(new CustomEvent('pilotage:changed')); };

export function initTasks() {
  window.setFreq = (f) => { ui.freq = f; renderTaskView(); };
  window.closeSidebar = closeSidebar;
  window.toggleSidebar = toggleSidebar;
  window.setViewMode = (m) => { ui.mode = isDirector() ? m : 'role'; if (ui.mode === 'rayon' && (ui.freq === 'T' || ui.freq === 'A')) ui.freq = 'ALL'; renderTaskView(); };
  window.changerRayon = () => { setActiveRayon($('selectRayon').value); renderTaskView(); };
  window.toggleAddForm = () => { if (ui.roleId) openTaskForm(ui.roleId, null, refresh); };

  $('sidebar')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-role]');
    if (b) { ui.mode = 'role'; ui.roleId = b.dataset.role; renderTaskView(); closeSidebar(); }
  });
  $('task-list')?.addEventListener('click', (e) => {
    const rayonItem = e.target.closest('[data-rayon-task]');
    if (rayonItem) { toggleRayonTask(document.getElementById('selectRayon').value, rayonItem.dataset.rayonTask, rayonItem.dataset.freq); return renderTaskView(); }
    const item = e.target.closest('[data-task]');
    if (!item) return;
    const action = e.target.closest('[data-action]')?.dataset.action;
    const task = getAllTasks(ui.roleId).find((t) => t.id === item.dataset.task && t.freq === item.dataset.freq);
    if (action === 'note' && task) return openNoteForm(ui.roleId, task, renderTaskView);
    if (action === 'edit') return openTaskForm(ui.roleId, item.dataset.task, refresh);
    if (action === 'delete') return deleteTask(item.dataset.task);
    toggleTask(item.dataset.task, item.dataset.freq);
  });
  document.addEventListener('pilotage:login', renderTaskView);
  document.addEventListener('pilotage:data', () => setTimeout(renderTaskView, 150));
  document.addEventListener('pilotage:open-role', (e) => { ui.mode = 'role'; ui.roleId = e.detail; renderTaskView(); });
}
