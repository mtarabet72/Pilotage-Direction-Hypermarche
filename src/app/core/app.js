import { appState, setTheme } from './state.js';
import { Router } from './router.js';
import { connect, sbStatus, subscribe, kvGet } from '../services/supabase.js';
import { initTasks } from '../features/tasks/TasksView.js';
import { flushPending } from './completions.js';
import { hasAccessCode, openAccessCodeModal, initAccessCode } from '../features/settings/accessCode.js';
import { initLive } from '../features/live/LivePanel.js';
import { initNotifications } from '../features/live/notifications.js';
import { initSettings, applyCompanyBranding } from '../features/settings/SettingsView.js';
import { openChangePassword } from '../features/settings/passwordModal.js';
import { initExport } from '../features/export/ExportView.js';
import { initResults } from '../features/results/ResultsView.js';
import { initDashboard } from '../features/dashboard/DashboardView.js';
import { loadUsers, login, logout, restoreSession, getCurrentUser, isDirector, changePassword } from '../services/auth.js';

const $ = (id) => document.getElementById(id);

function toast(msg, color = '#27ae60') {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.background = color;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function setLoginBusy(busy, hint = '') {
  const btn = $('btn-login');
  const hintEl = $('sb-loading-hint');
  if (btn) { btn.disabled = busy; btn.style.opacity = busy ? '0.6' : '1'; }
  if (hintEl) { hintEl.style.display = busy ? 'block' : 'none'; hintEl.textContent = hint; }
}

function applyUser(user) {
  $('login-overlay')?.classList.add('hidden');
  const nameEl = $('hdr-user-name');
  if (nameEl) nameEl.textContent = user.name || user.username;
  const admin = isDirector(user);
  const settingsTab = $('tab-settings');
  if (settingsTab) settingsTab.style.display = admin ? '' : 'none';
  const live = $('hdr-live-btn-wrap');
  if (live) live.style.display = admin ? '' : 'none';
  document.dispatchEvent(new CustomEvent('pilotage:login', { detail: user }));
  if (user.mustChangePassword) promptPasswordChange(user);
}

function promptPasswordChange() { openChangePassword({ forced: true }); }

async function doLogin() {
  const errEl = $('login-error');
  errEl?.classList.remove('show');
  try {
    const user = await login($('login-username').value, $('login-password').value);
    $('login-password').value = '';
    applyUser(user);
  } catch (e) {
    if (errEl) { errEl.textContent = e.message; errEl.classList.add('show'); }
  }
}

function doLogout() {
  logout();
  document.dispatchEvent(new CustomEvent('pilotage:logout'));
  $('login-overlay')?.classList.remove('hidden');
}

function showUserMenu() {
  const user = getCurrentUser();
  if (!user) return;
  if (window.confirm(`Connecté : ${user.name}\n\nOK = changer le mot de passe\nAnnuler = autres options`)) openChangePassword();
  else if (window.confirm('Se déconnecter ?')) doLogout();
}

// Démarrage : connexion Supabase (timeout 8 s, repli local), utilisateurs, session, Realtime.
async function bootstrapData() {
  if (!hasAccessCode()) openAccessCodeModal({ reason: 'first' });
  setLoginBusy(true, 'Connexion Supabase…');
  try {
    await connect();
    toast('⚡ Supabase connecté', '#3ecf8e');
  } catch (e) {
    console.warn('Supabase indisponible, mode local :', sbStatus.error);
    toast('Mode hors ligne (Supabase indisponible)', '#e67e22');
  }
  await loadUsers();
  setLoginBusy(false);
  const user = restoreSession();
  if (user) applyUser(user);

  if (sbStatus.connected) {
    ['hm_app_data', 'hm_events'].forEach((table) =>
      subscribe(table, async (payload) => {
        const key = payload.new?.key ?? payload.old?.key ?? payload.new?.id ?? payload.old?.id;
        // Re-lecture systématique : payload.new.data peut être null avec jsonb.
        const fresh = table === 'hm_app_data' && key ? await kvGet(key).catch(() => null) : null;
        document.dispatchEvent(new CustomEvent('pilotage:data', { detail: { table, key, fresh, payload } }));
      })
    );
  }
}


const ensureViewRegistry = () => {
  const routeNames = [...document.querySelectorAll('[data-view]')].map((el) => el.dataset.view);
  return routeNames;
};

document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const initialTheme = localStorage.getItem('pilotage-theme') || appState.ui.theme;
  setTheme(initialTheme);

  const router = new Router();
  const viewNames = ensureViewRegistry();

  viewNames.forEach((viewName) => {
    router.register(viewName, {
      name: viewName,
      render: () => {
        document.querySelectorAll('[data-view]').forEach((el) => {
          const isActive = el.dataset.view === viewName;
          el.classList.toggle('active', isActive);
        });

        document.querySelectorAll('[data-view-switch]').forEach((tab) => {
          const isActive = tab.dataset.viewSwitch === viewName;
          tab.classList.toggle('active', isActive);
        });
      }
    });
  });

  const activateView = (viewName) => {
    if (!viewName || !router.routes.has(viewName)) {
      return;
    }

    appState.ui.currentView = viewName;
    router.setCurrent(viewName);
    document.dispatchEvent(new CustomEvent('pilotage:view', { detail: viewName }));
  };

  document.querySelectorAll('[data-view-switch]').forEach((tab) => {
    tab.addEventListener('click', () => {
      activateView(tab.dataset.viewSwitch);
    });
  });

  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      setTheme(nextTheme);
    });
  });

  window.showView = activateView;
  window.doLogin = doLogin;
  window.showUserMenu = showUserMenu;
  window.doLogout = doLogout;
  $('btn-pw-eye')?.addEventListener('click', () => {
    const i = $('login-password');
    i.type = i.type === 'password' ? 'text' : 'password';
  });
  ['login-username', 'login-password'].forEach((id) =>
    $(id)?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); })
  );
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});   // PWA hors ligne + notifications Android
  initDashboard();
  initTasks();
  initResults();
  initExport();
  initSettings();
  initLive();
  initNotifications();
  initAccessCode();
  window.addEventListener('online', () => flushPending());
  bootstrapData();
  window.appRouter = router;

  window.pilotageApp = {
    ready: true,
    theme: appState.ui.theme,
    router,
    init() {
      document.body.dataset.appReady = 'true';
      document.body.dataset.theme = root.getAttribute('data-theme') || 'light';
      activateView(appState.ui.currentView);
    }
  };

  window.pilotageApp.init();
});

window.addEventListener('load', () => {
  if (window.pilotageApp) {
    window.pilotageApp.ready = true;
  }
});
