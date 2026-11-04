export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Valeurs injectées dans style="…" ou dans du HTML : on n'accepte que des formes inoffensives.
// (#rgb, #rrggbb, #rrggbbaa, rgb()/rgba()/hsl()/hsla() sans caractère spécial, ou un nom de couleur.)
const COLOR_RE = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\(\s*[0-9.,%\s\/deg-]{1,40}\)|[a-z]{3,20})$/i;
export const safeColor = (v, fallback = '#555555') => (typeof v === 'string' && COLOR_RE.test(v.trim()) ? v.trim() : fallback);
// Icône : quelques caractères (emoji ou lettres) ; jamais de balise ni de guillemet.
export const safeIcon = (v, fallback = '📋') => {
  const s = String(v ?? '').replace(/[<>&"'`\\]/g, '').trim();
  return s ? Array.from(s).slice(0, 4).join('') : fallback;
};

export function toast(msg, color = '#1a1f2e') {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg; el.style.background = color; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}
