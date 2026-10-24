import { openModal } from '../../components/Modal.js';
import { changeOwnPassword, changePassword, getCurrentUser } from '../../services/auth.js';
import { toast } from '../../core/dom.js';

// forced = premier accès avec mot de passe provisoire : pas besoin de saisir l'ancien.
export function openChangePassword({ forced = false } = {}) {
  const user = getCurrentUser();
  if (!user) return;
  openModal({
    title: forced ? '🔑 Choisissez votre mot de passe' : '🔑 Changer mon mot de passe', saveLabel: 'Enregistrer',
    bodyHtml: `${forced ? '<div style="font-size:12px;color:var(--muted);margin-bottom:10px;">Votre mot de passe est provisoire : remplacez-le (6 caractères minimum).</div>'
      : '<div class="modal-field"><label>Mot de passe actuel</label><input type="password" id="cp-0" autocomplete="current-password"></div>'}
      <div class="modal-field"><label>Nouveau mot de passe</label><input type="password" id="cp-1" autocomplete="new-password"></div>
      <div class="modal-field"><label>Confirmer</label><input type="password" id="cp-2" autocomplete="new-password"></div>`,
    onOpen: (root) => root.querySelector(forced ? '#cp-1' : '#cp-0').focus(),
    onSave: async (root) => {
      const p1 = root.querySelector('#cp-1').value;
      if (p1 !== root.querySelector('#cp-2').value) { toast('Les mots de passe ne correspondent pas', '#e74c3c'); return false; }
      try {
        if (forced) await changePassword(user.id, p1); else await changeOwnPassword(root.querySelector('#cp-0').value, p1);
        toast('✅ Mot de passe modifié', '#27ae60');
      } catch (e) { toast(e.message, '#e74c3c'); return false; }
    }
  });
}
