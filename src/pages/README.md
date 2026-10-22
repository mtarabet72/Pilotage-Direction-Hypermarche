document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const app = document.body;

  app.dataset.appReady = 'true';
  root.style.setProperty('--app-ready', '1');

  const toggleTheme = (mode) => {
    root.setAttribute('data-theme', mode);
    localStorage.setItem('hypermarch-theme', mode);
  };

  const savedTheme = localStorage.getItem('hypermarch-theme') || 'light';
  toggleTheme(savedTheme);

  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      toggleTheme(next);
    });
  });

  const notice = document.getElementById('toast');
  if (notice && window.showToast) {
    window.showToast = (message) => {
      notice.textContent = message;
      notice.classList.add('show');
      clearTimeout(window.toastTimer);
      window.toastTimer = setTimeout(() => notice.classList.remove('show'), 2200);
    };
  }
});

window.hypermarchApp = {
  init() {
    document.body.dataset.appMode = 'ready';
  }
};

if (window.location.pathname.endsWith('/')) {
  document.body.classList.add('app-shell-ready');
}
