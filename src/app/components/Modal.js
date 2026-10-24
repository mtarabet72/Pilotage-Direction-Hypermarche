import { $ } from '../core/dom.js';

let onSaveCb = null;

function ensure() {
  if ($('hm-modal')) return $('hm-modal');
  const el = document.createElement('div');
  el.id = 'hm-modal';
  el.className = 'hm-modal-overlay';
  el.innerHTML = `<div class="hm-modal-box" role="dialog" aria-modal="true">
    <div class="hm-modal-head"><h3 id="hm-modal-title"></h3><button type="button" class="hm-modal-x" data-modal-close aria-label="Fermer">✕</button></div>
    <div id="hm-modal-body"></div>
    <div class="hm-modal-actions"><button type="button" class="hm-btn-cancel" data-modal-close>Annuler</button><button type="button" class="hm-btn-save" id="hm-modal-save">Enregistrer</button></div>
  </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-modal-close]')) closeModal(); });
  $('hm-modal-save').addEventListener('click', async () => {
    if (!onSaveCb) return;
    const keepOpen = await onSaveCb($('hm-modal-body'));
    if (keepOpen !== false) closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  return el;
}

export function openModal({ title, bodyHtml, saveLabel = 'Enregistrer', onSave, onOpen }) {
  const el = ensure();
  $('hm-modal-title').textContent = title;
  $('hm-modal-body').innerHTML = bodyHtml;
  $('hm-modal-save').textContent = saveLabel;
  onSaveCb = onSave;
  el.classList.add('open');
  if (onOpen) onOpen($('hm-modal-body'));
}

export function closeModal() {
  $('hm-modal')?.classList.remove('open');
  onSaveCb = null;
}
