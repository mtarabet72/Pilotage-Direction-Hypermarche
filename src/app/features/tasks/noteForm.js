import { openModal } from '../../components/Modal.js';
import { store, ck } from '../../core/store.js';
import { saveMyNotes } from '../../core/persist.js';
import { getCurrentUser } from '../../services/auth.js';
import { esc, toast } from '../../core/dom.js';

export const NOTE_MAX_WORDS = 150;
export const FILE_MAX_BYTES = 2 * 1024 * 1024;
export const countWords = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length;

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error('Lecture du fichier impossible'));
  r.readAsDataURL(file);
});

// Les photos sont réduites (max 1280 px, JPEG) : une note ne pèse plus qu'une centaine de Ko
// au lieu de plusieurs Mo, ce qui ménage la base et accélère la synchronisation.
async function compressImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.8);
    return { fileData: dataUrl, fileType: 'image/jpeg', fileSize: Math.round(dataUrl.length * 0.75) };
  } catch (e) { return null; }
}

export function openNoteForm(roleId, task, onDone = () => {}) {
  const user = getCurrentUser();
  const key = ck(roleId, task.id, task.freq);
  const prev = store.taskNotes[key] || {};
  let pending; // undefined = inchangé · null = retiré · objet = nouveau fichier

  const preview = (root) => {
    const f = pending === null ? null : pending || (prev.fileData ? prev : null);
    const el = root.querySelector('#nf-preview');
    if (!f) { el.innerHTML = ''; return; }
    const img = (f.fileType || '').startsWith('image/') ? `<img src="${esc(f.fileData)}" alt="">` : '📎';
    el.innerHTML = `<div class="hm-file-preview">${img}<span>${esc(f.fileName || 'fichier')} ${f.fileSize ? Math.round(f.fileSize / 1024) + ' Ko' : ''}</span><button type="button" id="nf-remove" class="hm-btn-cancel" style="padding:3px 8px">Retirer</button></div>`;
    el.querySelector('#nf-remove').onclick = () => { pending = null; root.querySelector('#nf-file').value = ''; preview(root); };
  };

  openModal({
    title: '💬 Commentaire & pièce jointe',
    bodyHtml: `<div class="hm-field"><label for="nf-comment">Commentaire (${NOTE_MAX_WORDS} mots maximum)</label>
        <textarea id="nf-comment" rows="4">${esc(prev.comment || '')}</textarea><div class="hm-hint" id="nf-count"></div></div>
      <div class="hm-field"><label for="nf-file">Pièce jointe — image ou fichier (2 Mo max)</label>
        <input type="file" id="nf-file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"><div id="nf-preview"></div></div>`,
    onOpen: (root) => {
      const ta = root.querySelector('#nf-comment'), cnt = root.querySelector('#nf-count');
      const upd = () => { const n = countWords(ta.value); cnt.textContent = `${n} / ${NOTE_MAX_WORDS} mots`; cnt.classList.toggle('over', n > NOTE_MAX_WORDS); };
      ta.addEventListener('input', upd); upd(); preview(root);
      root.querySelector('#nf-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > FILE_MAX_BYTES) { toast('⚠️ Fichier trop volumineux — 2 Mo maximum', '#e74c3c'); e.target.value = ''; return; }
        try {
          const small = file.type.startsWith('image/') ? await compressImage(file) : null;
          pending = { fileName: file.name, ...(small || { fileData: await readAsDataUrl(file), fileType: file.type || 'application/octet-stream', fileSize: file.size }) };
          preview(root);
        } catch (err) { toast('⚠️ ' + err.message, '#e74c3c'); }
      });
      ta.focus();
    },
    onSave: async (root) => {
      const comment = root.querySelector('#nf-comment').value.trim();
      if (countWords(comment) > NOTE_MAX_WORDS) { toast(`⚠️ Commentaire trop long (${NOTE_MAX_WORDS} mots max)`, '#e74c3c'); return false; }
      const file = pending === null ? { fileName: null, fileType: null, fileSize: null, fileData: null }
        : pending ? pending : { fileName: prev.fileName || null, fileType: prev.fileType || null, fileSize: prev.fileSize || null, fileData: prev.fileData || null };
      store.deletedNotes = store.deletedNotes || {};
      if (!comment && !file.fileData) { delete store.taskNotes[key]; store.deletedNotes[key] = true; }
      else { store.taskNotes[key] = { comment, ...file, userId: user.id, userName: user.name || '', updatedAt: new Date().toISOString() }; delete store.deletedNotes[key]; }
      const res = await saveMyNotes();
      toast(res.synced ? '✅ Enregistré' : '⚠️ Enregistré sur cet appareil — synchronisation en attente', res.synced ? '#27ae60' : '#e67e22');
      onDone();
    }
  });
}
