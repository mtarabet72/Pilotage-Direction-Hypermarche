import { getCurrentUser, isDirector } from '../../services/auth.js';
import {
  store, loadAll, getAllRoles, getAllTasks, isTaskDone, getCompletionTime, isPermanenceRole,
  getPermanenceAssignedName, refreshCompletions, refreshEvents
} from '../../core/store.js';
import { sbStatus, connect } from '../../services/supabase.js';
import { localDateStr, deadlineSortMinutes } from '../../core/periods.js';
import { toast, esc } from '../../core/dom.js';

const SECTEURS = ['Commercial', 'Services', 'Permanence'];
const SECT_ICON = { Commercial: '🛍️', Services: '⚙️', Permanence: '🕐' };
const DEFAULT_LIMIT_MIN = 12 * 60;                 // sans échéance précise : « avant 12h » comme la v3
const col = (p) => (p === 100 ? '#27ae60' : p >= 50 ? '#f39c12' : '#e74c3c');
let panel = null, poll = null, timer = null;

const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();

// Tâches à suivre aujourd'hui pour une fonction : quotidiennes, ou toute tâche avec échéance / déjà faite.
function liveTasks(rid) {
  return getAllTasks(rid).filter((t) => t.freq === 'Q' || t.deadline || isTaskDone(rid, t.id, t.freq));
}

function indicator(rid, t, now) {
  const done = isTaskDone(rid, t.id, t.freq);
  const limit = t.deadline ? deadlineSortMinutes(t.deadline) : (t.freq === 'Q' ? DEFAULT_LIMIT_MIN : null);
  if (done) {
    const at = getCompletionTime(rid, t.id, t.freq);
    if (!at) return { done, html: '<span style="font-size:10px;color:#27ae60;margin-left:4px;">✓</span>' };
    const d = new Date(at), ok = limit === null || minutesOf(d) <= limit;
    const hh = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return { done, html: `<span style="font-size:10px;font-weight:800;padding:1px 7px;border-radius:8px;background:${ok ? '#27ae60' : '#e74c3c'}18;color:${ok ? '#27ae60' : '#e74c3c'};margin-left:4px;">${ok ? '🟢' : '🔴'} ${hh}</span>` };
  }
  const late = limit !== null && minutesOf(now) > limit;
  return { done, html: `<span style="font-size:10px;color:${late ? '#e74c3c' : '#bbb'};margin-left:4px;">${late ? '🔴 en retard' : '○'}${t.deadline && !late ? ' &lt;' + esc(t.deadline) : ''}</span>` };
}

function recentEvents() {
  const today = localDateStr(new Date());
  return Object.values(store.events)
    .filter((e) => e && e.isDone && e.completedAt && localDateStr(new Date(e.completedAt)) === today)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
}

export function renderLive() {
  if (!panel) return;
  const body = panel.querySelector('#lp-body'), last = panel.querySelector('#lp-last');
  const now = new Date(), events = recentEvents();
  if (last) last.innerHTML = `${events[0] ? `Màj ${esc(events[0].heure)} — ${esc(events[0].userName)} · ` : ''}${sbStatus.connected ? '<span style="color:#27ae60">⚡ Supabase actif</span>' : `<span style="color:#f39c12">⚠️ Local uniquement${sbStatus.error ? ' — ' + esc(String(sbStatus.error).slice(0, 80)) : ''}</span>`}`;

  const rows = getAllRoles()
    .filter((r) => !(isPermanenceRole(r.id) && !getPermanenceAssignedName(r.id)))      // créneau non planifié aujourd'hui
    .map((r) => {
      const tasks = liveTasks(r.id).map((t) => ({ t, ...indicator(r.id, t, now) }));
      return { r, tasks, done: tasks.filter((x) => x.done).length, total: tasks.length };
    }).filter((x) => x.total > 0);

  const feed = events.slice(0, 8).map((e) => `<div style="font-size:11px;padding:4px 8px;border-radius:6px;background:${esc(e.couleur)}12;color:${esc(e.couleur)};margin-bottom:3px;display:flex;gap:6px;align-items:center;">
    ${e.statut === 'VERT' ? '🟢' : '🔴'} <strong>${esc(e.userName)}</strong><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555">${esc(e.taskLabel)}</span><span style="opacity:.6">${esc(e.heure)}</span></div>`).join('');

  let html = feed ? `<div style="margin-bottom:14px;"><div style="font-size:10px;font-weight:800;color:#888;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">⚡ Activité récente</div>${feed}</div>` : '';
  SECTEURS.forEach((secteur) => {
    const list = rows.filter((x) => x.r.secteur === secteur);
    if (!list.length) return;
    const sd = list.reduce((a, x) => a + x.done, 0), st = list.reduce((a, x) => a + x.total, 0), sp = Math.round((sd / st) * 100);
    html += `<div style="margin-bottom:16px;"><div style="font-size:10px;font-weight:800;color:#888;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;display:flex;align-items:center;gap:8px;"><span>${SECT_ICON[secteur]} ${secteur}</span><span style="font-size:12px;font-weight:900;color:${col(sp)}">${sp}%</span></div>`;
    list.forEach(({ r, tasks, done, total }) => {
      const pct = Math.round((done / total) * 100);
      const who = isPermanenceRole(r.id) ? ` <span style="font-size:10px;font-weight:600;color:#888">· ${esc(getPermanenceAssignedName(r.id))}</span>` : '';
      html += `<div style="background:#f8f9fb;border-radius:10px;padding:10px 12px;margin-bottom:6px;border:1.5px solid #e8eaed;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="font-size:16px;">${r.icon}</span><span style="font-size:12px;font-weight:800;flex:1;">${esc(r.label)}${who}</span>
          <span style="font-size:13px;font-weight:900;color:${col(pct)};font-family:monospace;">${pct}%</span><span style="font-size:10px;color:#aaa;">${done}/${total}</span></div>
        <div style="background:#e0e4ea;border-radius:4px;height:5px;overflow:hidden;margin-bottom:8px;"><div style="width:${pct}%;height:100%;background:${col(pct)};border-radius:4px;transition:width .5s;"></div></div>
        ${tasks.map(({ t, done: d, html: ind }) => `<div style="display:flex;align-items:center;gap:5px;padding:3px 0;border-bottom:1px solid #f0f2f5;"><span style="font-size:11px;flex:1;color:${d ? '#555' : '#999'};${d ? 'text-decoration:line-through' : ''}">${esc(t.label)}</span>${ind}</div>`).join('')}</div>`;
    });
    html += '</div>';
  });
  body.innerHTML = html || '<div style="text-align:center;padding:30px;color:#aaa;font-size:12px;">En attente d\'activité…</div>';
}

async function reload() {
  if (!panel) return;
  try { await Promise.all([refreshEvents(), refreshCompletions()]); } catch (e) { /* hors ligne : on garde l'affichage actuel */ }
  renderLive();
}

export function closeLive() {
  panel?.remove(); panel = null;
  clearInterval(poll); poll = null; clearInterval(timer); timer = null;
}

export function openLivePanel() {
  if (!isDirector()) return toast('Accès réservé à l\'Admin', '#e74c3c');
  if (panel) return closeLive();
  panel = document.createElement('div');
  panel.id = 'live-panel';
  panel.innerHTML = `<div id="lp-header"><div><div style="font-size:13px;font-weight:900;">📡 Suivi Live — Admin</div><div id="lp-last" style="font-size:10px;opacity:.7;">Chargement…</div></div>
    <div style="display:flex;gap:6px;align-items:center;"><div style="font-size:10px;color:rgba(255,255,255,.5);">🟢 dans les temps &nbsp;🔴 en retard</div>
    <div style="width:10px;height:10px;border-radius:50%;background:${sbStatus.connected ? '#27ae60' : '#f39c12'};animation:lpPulse 1.5s infinite;"></div>
    ${sbStatus.connected ? '' : '<button type="button" data-live-retry style="background:#f39c12;border:none;color:#fff;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;">🔄 Reconnecter</button>'}
    <button type="button" data-live-close style="background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;">✕ Fermer</button></div></div>
    <div id="lp-body" style="overflow-y:auto;max-height:calc(80vh - 60px);padding:10px 12px;"></div>`;
  panel.addEventListener('click', async (e) => {
    if (e.target.closest('[data-live-close]')) return closeLive();
    if (e.target.closest('[data-live-retry]')) {
      try { await connect(); await loadAll(); toast('⚡ Supabase connecté', '#3ecf8e'); closeLive(); openLivePanel(); }
      catch (err) { toast('❌ ' + (err.message || err), '#e74c3c'); renderLive(); }
    }
  });
  document.body.appendChild(panel);
  renderLive();
  reload();
  poll = setInterval(reload, 20000);        // filet de sécurité si le Realtime est coupé
  timer = setInterval(renderLive, 60000);   // fait passer les tâches « en retard » à l'heure dite
}

export function initLive() {
  window.openLivePanel = openLivePanel;
  const refresh = () => renderLive();
  document.addEventListener('pilotage:data', () => setTimeout(refresh, 250));
  document.addEventListener('pilotage:changed', refresh);
  document.addEventListener('pilotage:logout', closeLive);
}
