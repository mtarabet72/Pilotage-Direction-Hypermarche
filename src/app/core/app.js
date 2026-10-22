document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const savedTheme = localStorage.getItem('pilotage-theme') || 'light';

  const applyTheme = (theme) => {
    root.setAttribute('data-theme', theme);
    localStorage.setItem('pilotage-theme', theme);
  };

  applyTheme(savedTheme);

  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  });

  document.body.classList.add('app-shell-ready');

  window.pilotageApp = {
    ready: true,
    theme: root.getAttribute('data-theme') || 'light',
    init() {
      document.body.dataset.appReady = 'true';
      document.body.dataset.theme = root.getAttribute('data-theme') || 'light';
    }
  };

  window.pilotageApp.init();
});

window.addEventListener('load', () => {
  if (window.pilotageApp) {
    window.pilotageApp.ready = true;
  }
});
