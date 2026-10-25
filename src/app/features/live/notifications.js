import { getCurrentUser, isDirector } from '../../services/auth.js';
import { getAccessibleRoles, getAllTasks, isTaskDone } from '../../core/store.js';
import { todayKey } from '../../core/periods.js';
import { toast } from '../../core/dom.js';

const sent = new Set();
const SEEN_KEY = 'hm_notif_new_tasks';
const seenTasks = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); } };
const markSeen = (id) => { const s = seenTasks(); s.add(id); try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-300))); } catch (e) { /* quota */ } };
const supported = () => typeof window !== 'undefined' && 'Notification' in window;

// Notification native : via le service worker quand il existe (obligatoire sur Android), sinon directe.
export async function sendNotif(title, body, tag) {
  if (!supported() || Notification.permission !== 'granted') return false;
  const opts = { body, tag: tag || 'hm-' + Date.now(), icon: './icon-192.png', badge: './icon-192.png' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) { await reg.showNotification(title, opts); return true; }
  } catch (e) { /* repli ci-dessous */ }
  try { const n = new Notification(title, opts); setTimeout(() => n.close(), 8000); return true; } catch (e) { return false; }
}

export function notifState() {
  if (!supported()) return { label: '🔕', title: 'Notifications non supportées', color: '#999' };
  if (Notification.permission === 'granted') return { label: '🔔', title: 'Notifications activées', color: '#27ae60' };
  if (Notification.permission === 'denied') return { label: '🔕', title: 'Notifications bloquées — autorisez-les dans les réglages du site', color: '#e74c3c' };
  return { label: '🔔', title: 'Activer les notifications', color: '' };
}

function refreshButton() {
  const b = document.getElementById('hdr-notif-btn');
  if (!b) return;
  const st = notifState();
  b.textContent = st.label; b.title = st.title; b.style.color = st.color; b.style.opacity = st.color ? '1' : '.7';
}

async function onButton() {
  if (!supported()) return toast('🔕 Notifications non supportées sur ce navigateur', '#e74c3c');
  if (Notification.permission === 'denied') { refreshButton(); return toast('🔕 Bloquées : autorisez-les via l\'icône 🔒 à côté de l\'adresse', '#e74c3c'); }
  if (Notification.permission === 'granted') { toast('🔔 Notifications déjà activées', '#27ae60'); return; }
  const p = await Notification.requestPermission();          // doit venir d'un clic : c'est le cas ici
  toast(p === 'granted' ? '🔔 Notifications activées' : '🔕 Notifications refusées', p === 'granted' ? '#27ae60' : '#e74c3c');
  refreshButton();
}

// ── Admin : une tâche vient d'être faite ──
function onEvents(e) {
  if (!isDirector()) return;
  const added = e.detail.added.filter((x) => Date.now() - new Date(x.completedAt).getTime() < 120000);
  added.slice(0, 3).forEach((x) => {
    const key = `done-${x.userName}-${x.taskLabel}-${x.completedAt}`;
    if (sent.has(key)) return;
    sent.add(key);
    toast(`✅ ${x.userName} — ${x.taskLabel}`.slice(0, 90), '#27ae60');
    sendNotif(`✅ Tâche effectuée — ${x.heure}`, `${x.roleIcon || '📋'} ${x.roleLabel}\n👤 ${x.userName}\n📋 ${x.taskLabel}`, key);
  });
  if (added.length > 3) toast(`✅ +${added.length - 3} autres tâches effectuées`, '#27ae60');
}

// ── Utilisateur : nouvelle tâche assignée + rappel 5 minutes avant l'échéance ──
export function checkUserReminders(now = new Date()) {
  const user = getCurrentUser();
  if (!user || isDirector()) return;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const seen = seenTasks();
  getAccessibleRoles().forEach((r) => {
    getAllTasks(r.id).forEach((t) => {
      if (String(t.id).startsWith('c_') && t.createdBy && t.createdBy !== user.id && !seen.has(t.id) && t.createdAt
          && now.getTime() - new Date(t.createdAt).getTime() < 3600000) {
        markSeen(t.id);
        const dl = t.deadline ? ` · avant ${t.deadline}` : '';
        toast(`📋 Nouvelle tâche : « ${t.label} »${dl}`, '#2980b9');
        sendNotif('📋 Nouvelle tâche assignée', `${r.icon} ${r.label}\n📝 ${t.label}${dl}`, `new-${t.id}`);
      }
      if (!t.deadline || isTaskDone(r.id, t.id, t.freq)) return;
      const [h, m] = t.deadline.split(':').map(Number);
      const diff = h * 60 + m - nowMin;
      const key = `${user.id}__${r.id}__${t.id}__${todayKey()}__remind`;
      if (diff >= 4 && diff <= 6 && !sent.has(key)) {
        sent.add(key);
        toast(`⏰ Rappel : « ${t.label} » — avant ${t.deadline}`, '#f39c12');
        sendNotif('⏰ Rappel — 5 min avant l\'échéance', `${r.icon} ${r.label}\n📋 ${t.label}\n🕐 Avant ${t.deadline}`, key);
      }
    });
  });
}

export function initNotifications() {
  if (!document.getElementById('hdr-notif-btn')) {
    const badge = document.getElementById('hdr-user-badge');
    if (badge) {
      const b = document.createElement('button');
      b.id = 'hdr-notif-btn'; b.type = 'button'; b.setAttribute('aria-label', 'Notifications');
      b.style.cssText = 'background:none;border:none;font-size:17px;cursor:pointer;padding:2px 6px;';
      b.addEventListener('click', onButton);
      badge.parentNode.insertBefore(b, badge);
    }
  }
  refreshButton();
  document.addEventListener('pilotage:events', onEvents);
  document.addEventListener('pilotage:login', () => { refreshButton(); setTimeout(checkUserReminders, 800); });
  document.addEventListener('pilotage:loaded', () => checkUserReminders());
  document.addEventListener('pilotage:changed', () => setTimeout(checkUserReminders, 500));
  setInterval(() => { if (document.visibilityState === 'visible') checkUserReminders(); }, 60000);
}
