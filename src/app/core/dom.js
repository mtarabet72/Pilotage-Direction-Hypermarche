export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function toast(msg, color = '#1a1f2e') {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg; el.style.background = color; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}
