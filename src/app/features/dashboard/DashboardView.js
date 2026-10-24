import { isDirector, getCurrentUser } from '../../services/auth.js';
import {
  store, loadAll, applyRealtime, getAccessibleRoles, getAllTasks, getRoleStats, isTaskDone,
  getCompletionTime, isOwnRole, canEditRole, getRole, isPermanenceRole, PERM_ROLE_IDS,
  getPermanenceAssignedName, getPermanenceHoraireLabel
} from '../../core/store.js';
import {
  fmtDate, deadlinePeriodInfo, periodKey, todayKey
} from '../../core/periods.js';

const SECTEURS_ORDER = ['Commercial', 'Services', 'Permanence'];
const secteurIcon = (s) => (s === 'Commercial' ? '🛍️' : s === 'Permanence' ? '🕐' : '⚙️');
const pctColor = (p) => (p >= 80 ? '#27ae60' : p >= 50 ? '#f39c12' : '#e74c3c');

const ui = { period: 'Q', expanded: {} };
const $ = (id) => document.getElementById(id);

// Les libellés de tâches/rôles personnalisés sont saisis par les utilisateurs : on les échappe.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function statsFor(roles, freq) {
  let done = 0, total = 0;
  roles.forEach((r) => { const s = getRoleStats(r.id, freq); done += s.done; total += s.total; });
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function periodLabel(p) {
  if (p === 'Q') return `📅 ${fmtDate(new Date())}`;
  if (p === 'H') return `📅 Semaine ${periodKey('H')}`;
  if (p === 'M') return `📅 ${periodKey('M')}`;
  if (p === 'T') return `📊 ${periodKey('T')}`;
  if (p === 'A') return `📅 Année ${periodKey('A')}`;
  return '';
}

const card = (color, val, label, sub) =>
  `<div class="sum-card" style="border-top-color:${color}"><div class="sc-val" style="color:${color}">${val}</div><div class="sc-label">${label}</div><div class="sc-sub" style="color:${color}">${sub}</div></div>`;

function summaryHtml(roles, visibleCount) {
  const g = statsFor(roles, ui.period);
  const full = roles.filter((r) => getRoleStats(r.id, ui.period).pct === 100).length;
  if (!isDirector()) {
    return card('#e63950', `${g.pct}%`, 'Mon avancement', `${g.done}/${g.total} tâches`)
      + card('#27ae60', full, 'Fonctions à 100%', `sur ${roles.length}`)
      + card('#2980b9', g.total - g.done, 'Tâches restantes', ui.period === 'Q' ? "aujourd'hui" : 'sur la période');
  }
  const bySecteur = (s) => statsFor(roles.filter((r) => r.secteur === s), ui.period);
  const gc = bySecteur('Commercial'), gs = bySecteur('Services'), gp = bySecteur('Permanence');
  return card('#e63950', `${g.pct}%`, 'Taux global', `${g.done}/${g.total}`)
    + card('#1a6b3c', `${gc.pct}%`, 'Commercial', `${gc.done}/${gc.total}`)
    + card('#2980b9', `${gs.pct}%`, 'Services', `${gs.done}/${gs.total}`)
    + (gp.total > 0 ? card('#16a085', `${gp.pct}%`, 'Permanence', `${gp.done}/${gp.total}`) : '')
    + card('#27ae60', full, 'Fonctions à 100%', `sur ${roles.length}`);
}

function permanenceBannerHtml() {
  const ids = isDirector() ? PERM_ROLE_IDS : PERM_ROLE_IDS.filter((id) => canEditRole(id));
  const chips = ids.map((rid) => {
    const r = getRole(rid);
    if (!r) return '';
    const name = getPermanenceAssignedName(rid);
    const s = getRoleStats(rid, 'Q');
    const pc = s.total === 0 ? '#bbb' : pctColor(s.pct === 100 ? 100 : s.pct);
    return `<div data-open-role="${esc(rid)}" style="flex:1;min-width:150px;background:#fff;border-radius:10px;box-shadow:var(--shadow);padding:10px 12px;border-left:4px solid ${r.color};cursor:pointer;">
      <div style="font-size:11px;font-weight:800;color:${r.color};">${r.icon} ${esc(r.label)}</div>
      <div style="font-size:12px;font-weight:700;margin-top:3px;">${name ? esc(name) : '<span style="color:#e74c3c">Non planifié</span>'}</div>
      <div style="font-size:10px;color:var(--muted);margin-top:2px;">${esc(getPermanenceHoraireLabel(rid) || '—')} · <span style="color:${pc};font-weight:800;">${s.done}/${s.total}</span></div>
    </div>`;
  }).join('');
  return chips ? `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px;">${chips}</div>` : '';
}

function taskLineHtml(r, t) {
  const done = isTaskDone(r.id, t.id, t.freq);
  let badge = '';
  if (t.deadline) {
    const doneAt = done ? getCompletionTime(r.id, t.id, t.freq) : null;
    if (doneAt) {
      const d = new Date(doneAt);
      const [dh, dm] = t.deadline.split(':').map(Number);
      const onTime = d.getHours() * 60 + d.getMinutes() <= dh * 60 + dm;
      const hh = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      badge = `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:6px;background:${onTime ? '#eafaf1' : '#fdecea'};color:${onTime ? '#27ae60' : '#e74c3c'}">${onTime ? '🟢' : '🔴'} ${hh}</span>`;
    } else {
      badge = `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:6px;background:#fef9f0;color:#e67e22">${deadlinePeriodInfo(t.deadline).emoji} &lt;${esc(t.deadline)}</span>`;
    }
  }
  return `<div class="rct-item"><div class="rct-dot" style="background:${done ? r.color : '#e0e4ea'}"></div><span style="color:${done ? '#555' : 'var(--text)'};text-decoration:${done ? 'line-through' : ''};flex:1">${esc(t.label)}</span>${badge}</div>`;
}

function roleCardHtml(r) {
  const s = getRoleStats(r.id, ui.period);
  const tasks = getAllTasks(r.id).filter((t) => t.freq === ui.period);
  const own = !isDirector() && isOwnRole(r.id)
    ? ' <span style="font-size:9px;background:#eafaf1;color:#27ae60;padding:1px 6px;border-radius:8px;font-weight:700;">Mon rôle</span>' : '';
  return `<div class="role-card${ui.expanded[r.id] ? ' expanded' : ''}" data-toggle-card="${esc(r.id)}" style="border-left-color:${r.color}">
    <div class="rc-top"><span class="rc-icon">${r.icon}</span><span class="rc-name">${esc(r.label)}${own}</span><span class="rc-pct" style="color:${pctColor(s.pct)}">${s.pct}%</span></div>
    <div class="rc-bar-wrap"><div class="rc-bar" style="width:${s.pct}%;background:${r.color}"></div></div>
    <div class="rc-count">${s.done}/${s.total} · ${esc(r.sous)}</div>
    <div class="rc-tasks-preview"><div style="font-size:10px;font-weight:700;color:var(--muted);margin:8px 0 4px;text-transform:uppercase;letter-spacing:1px;">Tâches</div>
      ${tasks.map((t) => taskLineHtml(r, t)).join('')}
    </div></div>`;
}

export function renderDashboard() {
  const summaryEl = $('dash-summary'), secteursEl = $('dash-secteurs');
  if (!summaryEl || !secteursEl) return;
  if (!getCurrentUser()) { summaryEl.innerHTML = ''; secteursEl.innerHTML = ''; return; }

  const roles = getAccessibleRoles().filter((r) => getAllTasks(r.id).length > 0);
  $('dash-period-label').textContent = periodLabel(ui.period);
  summaryEl.innerHTML = summaryHtml(roles, getAccessibleRoles().length);

  let html = permanenceBannerHtml();
  SECTEURS_ORDER.forEach((secteur) => {
    const list = roles.filter((r) => r.secteur === secteur);
    if (!list.length) return;
    const sg = statsFor(list, ui.period);
    html += `<div class="secteur-block"><div class="secteur-head"><span class="sh-icon">${secteurIcon(secteur)}</span><span class="sh-name">${secteur}</span>
      <div><span class="sh-pct" style="color:${pctColor(sg.pct)}">${sg.pct}%</span><span style="font-size:11px;color:var(--muted);margin-left:6px;">${sg.done}/${sg.total}</span></div></div>
      ${list.map(roleCardHtml).join('')}</div>`;
  });
  secteursEl.innerHTML = html || `<div style="text-align:center;padding:40px 20px;color:var(--muted);font-size:14px;">
    <div style="font-size:48px;margin-bottom:12px;">📋</div><div style="font-weight:700;">Aucune fonction assignée</div>
    <div style="font-size:12px;margin-top:6px;">Contactez l'administrateur pour vous assigner des fonctions.</div></div>`;
}

let timer = null;
const scheduleRender = () => { clearTimeout(timer); timer = setTimeout(renderDashboard, 120); };

export function initDashboard() {
  window.setDashPeriod = (p, btn) => {
    ui.period = p;
    document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
    btn?.classList.add('active');
    renderDashboard();
  };

  // Délégation d'événements : plus d'onclick inline généré avec des identifiants.
  $('dash-secteurs')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-open-role]');
    if (chip) {
      document.dispatchEvent(new CustomEvent('pilotage:open-role', { detail: chip.dataset.openRole }));
      window.showView?.('tasks');
      return;
    }
    const card = e.target.closest('[data-toggle-card]');
    if (card) { ui.expanded[card.dataset.toggleCard] = !ui.expanded[card.dataset.toggleCard]; renderDashboard(); }
  });

  document.addEventListener('pilotage:login', async () => {
    renderDashboard();                       // affichage immédiat avec le cache local
    try { await loadAll(); } catch (e) { console.warn('Chargement données :', e.message); }
    renderDashboard();
  });
  document.addEventListener('pilotage:changed', renderDashboard);
  document.addEventListener('pilotage:data', async (e) => {
    try { await applyRealtime(e.detail); } catch (err) { console.warn('Realtime :', err.message); }
    scheduleRender();
  });
  setInterval(() => { if (getCurrentUser() && document.visibilityState === 'visible') renderDashboard(); }, 60000);
}
