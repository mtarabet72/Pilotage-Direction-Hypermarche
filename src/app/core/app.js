import { appState, setTheme } from './state.js';
import { Router } from './router.js';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const savedTheme = localStorage.getItem('pilotage-theme') || appState.ui.theme;
  setTheme(savedTheme);

  const router = new Router();

  document.querySelectorAll('[data-view]').forEach((viewEl) => {
    const viewName = viewEl.dataset.view;
    router.register(viewName, {
      name: viewName,
      render: () => {
        document.querySelectorAll('.view').forEach((el) => {
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

  const defaultView = appState.ui.currentView || 'dashboard';
  router.setCurrent(defaultView);

  document.querySelectorAll('[data-view-switch]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.viewSwitch;
      if (target) {
        appState.ui.currentView = target;
        router.setCurrent(target);
      }
    });
  });

  const showView = (viewName) => {
    if (!viewName) return;
    appState.ui.currentView = viewName;
    router.setCurrent(viewName);
  };

  window.showView = showView;
  window.appRouter = router;
  window.pilotageApp = {
    ready: true,
    theme: root.getAttribute('data-theme') || 'light',
    router,
    init() {
      document.body.dataset.appReady = 'true';
      document.body.dataset.theme = root.getAttribute('data-theme') || 'light';
      showView(appState.ui.currentView);
    }
  };

  window.pilotageApp.init();
});

window.addEventListener('load', () => {
  if (window.pilotageApp) {
    window.pilotageApp.ready = true;
  }
});
