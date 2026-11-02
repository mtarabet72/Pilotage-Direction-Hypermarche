import { connect, sbStatus, explainError } from '../../services/supabase.js';
import { $, toast } from '../../core/dom.js';

// Écran de connexion : simple indicateur d'état + bouton « Réessayer ».
// (L'adresse du projet, la clé et l'ancien « code d'accès » ne se saisissent plus : tout est géré par le compte de chaque utilisateur.)
export function refreshLoginStatus() {
  const el = $('lc-status');
  if (!el) return;
  el.style.color = sbStatus.connected ? '#1a7a50' : '#b85c00';
  el.textContent = sbStatus.connected ? '⚡ Serveur joignable' : `⚠️ Hors ligne — ${explainError(sbStatus.error)}`;
}

// Message affiché sous le bouton de connexion quand la connexion échoue.
export function loginErrorMessage(err) {
  return sbStatus.connected ? err.message : `${err.message}. Le serveur est injoignable : réessayez quand le réseau est rétabli.`;
}

async function retry() {
  const btn = $('lc-retry');
  btn.disabled = true; btn.textContent = '⏳ Connexion…';
  try { await connect(); toast('⚡ Serveur joignable — vous pouvez vous connecter', '#3ecf8e'); }
  catch (e) { /* le statut affiche la raison */ }
  btn.disabled = false; btn.textContent = '🔄 Réessayer';
  refreshLoginStatus();
}

export function initLoginConnection() {
  const box = document.querySelector('#login-overlay .login-box');
  if (!box || $('lc-wrap')) return;
  box.insertAdjacentHTML('beforeend', `<div id="lc-wrap" style="margin-top:14px;border-top:1px solid #eef0f4;padding-top:10px;text-align:center;">
    <div id="lc-status" style="font-size:11px;font-weight:700;line-height:1.4;"></div>
    <div style="margin-top:6px;"><button id="lc-retry" type="button" style="font-size:11px;padding:5px 10px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;">🔄 Réessayer</button></div></div>`);
  $('lc-retry').addEventListener('click', retry);
  refreshLoginStatus();
}
