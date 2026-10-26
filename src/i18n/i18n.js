const STORAGE_KEY = 'app.lang';
const SUPPORTED_LANGS = ['fr', 'ar'];
const translations = {};
let currentLang = (localStorage.getItem(STORAGE_KEY) || 'fr');

for (const lang of SUPPORTED_LANGS) {
  const response = await fetch(new URL(`./${lang}.json`, import.meta.url));
  if (!response.ok) {
    console.warn(`Missing translation file for ${lang}`);
    continue;
  }
  translations[lang] = await response.json();
}

if (!SUPPORTED_LANGS.includes(currentLang) || !translations[currentLang]) {
  currentLang = 'fr';
}

const getLookup = (lang = currentLang) => translations[lang] || translations.fr || {};

const setHtmlDirection = (lang) => {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dataset.lang = lang;
};

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  const next = SUPPORTED_LANGS.includes(lang) ? lang : 'fr';
  currentLang = next;
  localStorage.setItem(STORAGE_KEY, next);
  setHtmlDirection(next);
  applyI18n();
  document.dispatchEvent(new CustomEvent('lang:changed', { detail: next }));
  return next;
}

export function t(key, fallback = '') {
  const lookup = getLookup();
  const value = lookup[key];
  if (value !== undefined && value !== null && value !== '') return value;
  const fallbackValue = getLookup('fr')[key] || fallback || key;
  if (fallbackValue !== key) {
    console.warn(`Missing translation for key: ${key}`);
  }
  return fallbackValue;
}

export function applyI18n(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n;
    if (!key) return;
    node.textContent = t(key, node.textContent || '');
  });

  root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    const key = node.dataset.i18nPlaceholder;
    if (!key) return;
    node.placeholder = t(key, node.placeholder || '');
  });

  root.querySelectorAll('[data-i18n-title]').forEach((node) => {
    const key = node.dataset.i18nTitle;
    if (!key) return;
    node.title = t(key, node.title || '');
  });
}

if (document.readyState !== 'loading') {
  setHtmlDirection(currentLang);
  applyI18n();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    setHtmlDirection(currentLang);
    applyI18n();
  });
}

window.__pilotageI18n = { t, setLang, getLang, applyI18n };
export default { t, setLang, getLang, applyI18n };
