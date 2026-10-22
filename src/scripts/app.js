document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const savedTheme = localStorage.getItem('hypermarket-theme') || 'light';

  const applyTheme = (mode) => {
    root.setAttribute('data-theme', mode);
    localStorage.setItem('hypermarket-theme', mode);
  };

  applyTheme(savedTheme);

  const toggles = document.querySelectorAll('[data-theme-toggle]');
  toggles.forEach((button) => {
    button.addEventListener('click', () => {
      const nextMode = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(nextMode);
    });
  });

  document.body.dataset.appReady = 'true';
  window.appBootstrap = {
    init() {
      document.body.dataset.appMode = 'ready';
    },
    showToast(message) {
      const toast = document.getElementById('toast');
      if (!toast) return;

      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(window.toastTimer);
      window.toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
    }
  };

  window.appBootstrap.init();
});

window.hypermarchApp = {
  start() {
    document.body.dataset.appMode = 'ready';
  }
};

if (window.location.pathname.endsWith('/')) {
  document.body.classList.add('app-shell-ready');
}

window.addEventListener('load', () => {
  if (window.appBootstrap) {
    window.appBootstrap.init();
  }
});

if (typeof window !== 'undefined') {
  window.__pilotageApp = true;
}

export default {};













































































































