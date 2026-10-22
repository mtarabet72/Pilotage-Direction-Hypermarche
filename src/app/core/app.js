import { appState, setTheme } from './state.js';
import { Router } from './router.js';

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
