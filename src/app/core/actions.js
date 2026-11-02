// Boutons de l'en-tête : la politique de sécurité (CSP) interdit les attributs onclick="…" écrits dans le HTML.
// Chaque bouton porte donc data-act="nomDeFonction" (et data-args='["valeur"]') ; ce petit répartiteur appelle
// la fonction globale correspondante en lui passant l'élément cliqué en dernier argument.
export function initActions() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-act]');
    if (!el) return;
    const fn = window[el.dataset.act];
    if (typeof fn !== 'function') return;
    let args = [];
    try { args = el.dataset.args ? JSON.parse(el.dataset.args) : []; } catch (err) { args = []; }
    fn(...args, el);
  });
}
