import { getCurrentUser, isDirector } from '../../services/auth.js';
import { store, SHARED } from '../../core/store.js';
import { saveShared } from '../../core/persist.js';
import { connect, getClient, kvSet, sbStatus } from '../../services/supabase.js';
import { loadConfig, saveConfig, clearConfig } from '../../services/config.js';
import { usersSectionHtml, handleUserAction } from './UsersSection.js';
import { rayonsSectionHtml, handleRayonAction } from './RayonsSection.js';
import { planningSectionHtml, handlePlanningAction } from './PlanningSection.js';
import { $, esc, toast } from '../../core/dom.js';

const COMPANY_FIELDS = [
  ['nom', 'Nom de la société'], ['phone', 'Téléphone'], ['address', 'Adresse'], ['email', 'E-mail'], ['web', 'Site web'],
  ['directorName', 'Nom du directeur'], ['directorTitle', 'Titre du directeur'], ['directorPhone', 'Téléphone du directeur'], ['directorEmail', 'E-mail du directeur'],
  ['orgName', 'Organisme / enseigne'], ['orgRef', 'Référence organisme'], ['orgAddress', 'Adresse organisme'], ['orgContact', 'Contact organisme'], ['orgPerson', 'Personne référente']
];
const isImageData = (u) => typeof u === 'string' && /^data:image\//.test(u);
const root = () => $('settings-root');

// ── Image de marque (en-tête + écran de connexion) ──
export function applyCompanyBranding() {
  const c = store.companyData || {};
  if (c.nom) {
    $('hdr-company-name') && ($('hdr-company-name').textContent = c.nom.toUpperCase());
    $('login-company-name') && ($('login-company-name').textContent = c.nom.toUpperCase());
  }
  if ($('hdr-company-sub') && c.nom) $('hdr-company-sub').textContent = (c.directorName ? `Dir : ${c.directorName}` : 'Suivi des tâches') + ' · Dashboard global';
  const box = $('hdr-logo-container');
  if (!box) return;
  box.textContent = '';
  if (isImageData(c.logo)) { const img = document.createElement('img'); img.className = 'hdr-logo-img'; img.alt = 'Logo'; img.src = c.logo; box.appendChild(img); }
  else { const s = document.createElement('span'); s.className = 'hdr-logo-text'; s.textContent = '🏬'; box.appendChild(s); }
}

// Le logo est réduit (256 px max) : il est copié dans chaque rapport PDF et chaque chargement.
async function logoFromFile(file) {
  if (!file.type.startsWith('image/')) throw new Error('Choisissez un fichier image');
  if (file.size > 3 * 1024 * 1024) throw new Error('Image trop volumineuse (3 Mo max)');
  const raw = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Lecture impossible')); r.readAsDataURL(file); });
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } catch (e) { if (raw.length > 400000) throw new Error('Image trop volumineuse'); return raw; }
}

function companyHtml() {
  const c = store.companyData || {};
  return `<div class="settings-card"><h3>🏢 Société & rapports</h3>
    <div class="settings-grid">${COMPANY_FIELDS.map(([k, l]) => `<div class="sf-group"><label class="sf-label">${l}</label><input type="text" class="sf-input" data-company="${k}" value="${esc(c[k] || (k === 'directorTitle' ? 'Directeur' : ''))}" maxlength="120"></div>`).join('')}</div>
    <div style="margin-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      ${isImageData(c.logo) ? `<img src="${esc(c.logo)}" alt="Logo" style="height:48px;border-radius:6px;border:1px solid var(--border)">` : '<span style="font-size:30px">🏬</span>'}
      <label class="logo-upload-btn" style="cursor:pointer;">📷 Choisir un logo<input type="file" id="logo-file" accept="image/*" style="display:none"></label>
      ${isImageData(c.logo) ? '<button type="button" class="btn-danger" data-action="logo-remove">Retirer</button>' : ''}</div>
    <div style="margin-top:14px;"><button type="button" class="btn-primary" data-action="company-save">💾 Enregistrer</button></div></div>`;
}

function connectionHtml() {
  const cfg = loadConfig(), ok = sbStatus.connected;
  return `<div class="settings-card" style="border-left:4px solid #3ecf8e;"><h3>⚡ Connexion Supabase</h3>
    <div style="padding:8px 12px;border-radius:8px;font-size:12px;font-weight:700;margin-bottom:12px;background:${ok ? '#3ecf8e22' : '#e74c3c22'};color:${ok ? '#1a7a50' : '#c0392b'}">${ok ? '✅ Connecté' : '⚠️ Non connecté — mode local' + (sbStatus.error ? ' (' + esc(sbStatus.error) + ')' : '')}</div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.6;">Diagnostic : SDK ${window.supabase ? '✅ chargé' : '❌ non chargé (bloqué ?)'} · Projet ${esc((cfg.projectUrl || '').replace(/^https?:\/\//, '').slice(0, 40))} · Clé ${cfg.anonKey ? '✅ ' + esc(cfg.anonKey.slice(0, 10)) + '…' : '❌ absente'} · Code d'accès ${cfg.appSecret ? '✅ défini' : '❌ non défini'}</div>
    <div class="settings-grid">
      <div class="sf-group full-width"><label class="sf-label">Project URL</label><input type="text" class="sf-input" id="cfg-url" value="${esc(cfg.projectUrl)}" placeholder="https://xxxx.supabase.co"></div>
      <div class="sf-group full-width"><label class="sf-label">Clé publique (anon / publishable)</label><input type="text" class="sf-input" id="cfg-key" value="${esc(cfg.anonKey)}"></div>
      <div class="sf-group full-width"><label class="sf-label">Secret applicatif (à recopier à l'identique dans supabase-setup.sql)</label>
        <div style="display:flex;gap:6px;"><input type="text" class="sf-input" id="cfg-secret" value="${esc(cfg.appSecret)}" autocomplete="off" spellcheck="false" style="flex:1;font-family:monospace;">
        <button type="button" class="btn-primary" data-action="cfg-secret-copy" style="background:#fff;color:#333;">📋 Copier</button>
        <button type="button" class="btn-primary" data-action="cfg-secret-toggle" style="background:#fff;color:#333;" title="Masquer / afficher">👁️</button></div></div></div></div>
    <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;">
      <button type="button" class="btn-primary" data-action="cfg-save" style="background:#3ecf8e;border-color:#3ecf8e;color:#fff;">⚡ Enregistrer et reconnecter</button>
      <button type="button" class="btn-primary" data-action="cfg-test" style="background:#fff;color:#333;">🧪 Tester l'écriture</button>
      <button type="button" class="btn-danger" data-action="cfg-reset">Valeurs par défaut</button></div></div>`;
}

const backupHtml = () => `<div class="settings-card"><h3>💾 Sauvegarde</h3>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px;">Exporte les paramètres partagés (tâches personnalisées, fonctions, rayons, planning de permanence, société). Les mots de passe et l'historique ne sont pas inclus.</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;"><button type="button" class="btn-primary" data-action="backup-export">⬇️ Exporter (JSON)</button>
  <label class="logo-upload-btn" style="cursor:pointer;">⬆️ Restaurer<input type="file" id="backup-file" accept="application/json,.json" style="display:none"></label></div></div>`;

export function renderSettings() {
  const el = root();
  if (!el) return;
  if (!getCurrentUser()) { el.innerHTML = ''; return; }
  if (!isDirector()) { el.innerHTML = '<div class="settings-card"><h3>⚙️ Paramètres</h3><div style="color:var(--muted);font-size:13px;">Accès réservé au Directeur.</div></div>'; return; }
  const focus = document.activeElement?.id;
  el.innerHTML = companyHtml() + `<div class="settings-card"><h3>👥 Utilisateurs</h3><div id="users-list">${usersSectionHtml()}</div></div>`
    + `<div class="settings-card"><h3>🏪 Rayons</h3><div id="rayons-list">${rayonsSectionHtml()}</div></div>`
    + `<div class="settings-card"><h3>🕐 Planning de permanence</h3><div id="plan-wrap">${planningSectionHtml()}</div></div>` + connectionHtml() + backupHtml();
  if (focus && $(focus)) $(focus).focus();
}

const syncToast = (r, ok, warn) => toast(r.synced ? ok : warn, r.synced ? '#27ae60' : '#e67e22');

async function saveCompany() {
  document.querySelectorAll('[data-company]').forEach((i) => { store.companyData[i.dataset.company] = i.value.trim(); });
  const r = await saveShared('companyData');
  applyCompanyBranding();
  syncToast(r, '✅ Paramètres enregistrés', '⚠️ Enregistré sur cet appareil — synchronisation en attente');
}

async function saveConnection() {
  const cfg = { projectUrl: $('cfg-url').value.trim(), anonKey: $('cfg-key').value.trim(), appSecret: $('cfg-secret').value };
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.projectUrl) || !cfg.anonKey) return toast('⚠️ URL (https://xxxx.supabase.co) et clé requises', '#e74c3c');
  if (!cfg.appSecret) return toast('⚠️ Saisissez le code d\'accès', '#e74c3c');
  const previous = loadConfig();
  try { await connect(cfg); }
  catch (e) { await connect(previous).catch(() => {}); return toast('❌ Connexion impossible : ' + e.message, '#e74c3c'); }
  saveConfig(cfg);
  toast('✅ Connecté — rechargement…', '#3ecf8e');
  setTimeout(() => window.location.reload(), 900);
}

async function testWrite() {
  if (!getClient()) return toast('Non connecté à Supabase', '#e74c3c');
  try { await kvSet('hm_ping', { t: Date.now(), by: getCurrentUser()?.name || '?' }); toast('✅ Supabase OK — écriture réussie', '#3ecf8e'); }
  catch (e) { toast('❌ Écriture refusée : ' + e.message + ' (secret ou policies RLS ?)', '#e74c3c'); }
}

function exportBackup() {
  const data = { app: 'pilotage-hm', version: 1, exportedAt: new Date().toISOString() };
  Object.keys(SHARED).filter((p) => p !== 'taskNotes').forEach((p) => { data[p] = store[p]; });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `pilotage_sauvegarde_${new Date().toISOString().slice(0, 10)}.json`; a.click();
  URL.revokeObjectURL(a.href);
  toast('✅ Sauvegarde exportée', '#27ae60');
}

const SHAPE = { customTasks: 'object', taskOverrides: 'object', customRoles: 'array', permanencePlanning: 'object', rayons: 'object', companyData: 'object' };
async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { return toast('Fichier JSON invalide', '#e74c3c'); }
  if (data?.app !== 'pilotage-hm') return toast('Ce fichier n\'est pas une sauvegarde Pilotage', '#e74c3c');
  const props = Object.keys(SHAPE).filter((p) => data[p] !== undefined);
  const bad = props.find((p) => (SHAPE[p] === 'array' ? !Array.isArray(data[p]) : !(data[p] && typeof data[p] === 'object' && !Array.isArray(data[p]))));
  if (bad) return toast(`Sauvegarde corrompue (« ${bad} »)`, '#e74c3c');
  if (!window.confirm(`Restaurer ${props.length} élément(s) (${props.join(', ')}) ?\nLes données actuelles correspondantes seront remplacées.`)) return;
  const results = [];
  for (const p of props) { store[p] = data[p]; results.push(await saveShared(p)); }
  applyCompanyBranding(); renderSettings();
  toast(results.every((r) => r.synced) ? '✅ Sauvegarde restaurée' : '⚠️ Restaurée sur cet appareil — synchronisation partielle', results.every((r) => r.synced) ? '#27ae60' : '#e67e22');
}

export function initSettings() {
  document.addEventListener('click', async (e) => {
    const view = $('view-settings');
    if (!view || !view.contains(e.target)) return;
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    if (a.startsWith('user-')) return handleUserAction(a, btn.closest('[data-uid]')?.dataset.uid, renderSettings);
    if (a.startsWith('rayon-')) return handleRayonAction(a, btn.closest('[data-rayon]')?.dataset.rayon, renderSettings);
    if (a.startsWith('plan-')) return handlePlanningAction(a, renderSettings);
    if (a === 'company-save') return saveCompany();
    if (a === 'logo-remove') { store.companyData.logo = null; const r = await saveShared('companyData'); applyCompanyBranding(); renderSettings(); return syncToast(r, 'Logo retiré', '⚠️ Retiré localement — synchronisation en attente'); }
    if (a === 'cfg-save') return saveConnection();
    if (a === 'cfg-secret-toggle') { const i = $('cfg-secret'); i.type = i.type === 'text' ? 'password' : 'text'; return; }
    if (a === 'cfg-secret-copy') {
      try { await navigator.clipboard.writeText($('cfg-secret').value); toast('📋 Secret copié', '#27ae60'); }
      catch (err) { $('cfg-secret').select(); toast('Sélectionné : faites Ctrl+C pour copier', '#f39c12'); }
      return;
    }
    if (a === 'cfg-test') return testWrite();
    if (a === 'cfg-reset') { clearConfig(); return renderSettings(); }
    if (a === 'backup-export') return exportBackup();
  });
  document.addEventListener('change', async (e) => {
    if (e.target.id === 'logo-file' && e.target.files[0]) {
      try {
        store.companyData.logo = await logoFromFile(e.target.files[0]);
        const r = await saveShared('companyData'); applyCompanyBranding(); renderSettings();
        syncToast(r, '✅ Logo enregistré', '⚠️ Logo enregistré localement — synchronisation en attente');
      } catch (err) { toast(err.message, '#e74c3c'); }
    }
    if (e.target.id === 'backup-file' && e.target.files[0]) { const f = e.target.files[0]; e.target.value = ''; importBackup(f); }
  });
  document.addEventListener('pilotage:view', (e) => { if (e.detail === 'settings') { if (!root()) $('view-settings').innerHTML = '<div id="settings-root"></div>'; renderSettings(); } });
  document.addEventListener('pilotage:login', () => { applyCompanyBranding(); });
  document.addEventListener('pilotage:loaded', () => { applyCompanyBranding(); if ($('view-settings')?.classList.contains('active')) renderSettings(); });
}
