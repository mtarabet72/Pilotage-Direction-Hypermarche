export const appState = {
  ui: {
    currentView: 'dashboard',
    theme: localStorage.getItem('pilotage-theme') || 'light',
    filters: {
      period: 'Q',
      freq: 'ALL'
    }
  },
  data: {
    roles: [],
    tasks: [],
    reports: []
  }
};

export function updateState(patch) {
  Object.assign(appState, patch);
}

export function setTheme(theme) {
  appState.ui.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('pilotage-theme', theme);
}
