import { openModal } from '../../components/Modal.js';
import { loadConfig, saveConfig } from '../../services/config.js';
import { toast } from '../../core/dom.js';

// Le code d'accès n'est jamais dans le code source : il est saisi une fois par appareil.
export const hasAccessCode = () => !!loadConfig().appSecret;

let asked = false;
export function openAccessCodeModal({ reason = 'first' } = {}) {
  if (asked) return;
  asked = true;
  openModal({
    title: '🔐 Code d\'accès',
    saveLabel: 'Valider',
    bodyHtml: `<div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5;">${reason === 'denied'
      ? '⚠️ Supabase a refusé l\'enregistrement : le code d\'accès est incorrect ou a changé.'
      : 'Saisissez le code d\'accès fourni par le Directeur.'} Il est mémorisé uniquement sur cet appareil.</div>
      <div class="modal-field"><label>Code d'accès</label><input type="password" id="ac-code" autocomplete="off" style="width:100%;box-sizing:border-box;"></div>`,
    onOpen: (root) => {
      root.querySelector('#ac-code').focus();
      root.querySelector('#ac-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('hm-modal-save').click(); });
    },
    onSave: (root) => {
      const code = root.querySelector('#ac-code').value;
      if (!code.trim()) { toast('Saisissez le code', '#e74c3c'); return false; }
      saveConfig({ ...loadConfig(), appSecret: code });
      toast('✅ Code enregistré — rechargement…', '#27ae60');
      setTimeout(() => window.location.reload(), 600);
    }
  });
  document.getElementById('hm-modal')?.style.setProperty('z-index', '20000');   // au-dessus de l'écran de connexion
}

export function initAccessCode() {
  document.addEventListener('pilotage:denied', () => openAccessCodeModal({ reason: 'denied' }));
}
