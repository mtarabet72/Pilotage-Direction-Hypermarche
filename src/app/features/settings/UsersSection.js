import { openModal } from '../../components/Modal.js';
import {
  getUsers, getCurrentUser, createUser, updateUser, resetPassword, setUserActive, deleteUser
} from '../../services/auth.js';
import { getAllRoles } from '../../core/store.js';
import { esc, toast } from '../../core/dom.js';

const SECTEURS = ['Commercial', 'Services', 'Permanence'];
const SECT_ICON = { Commercial: '🛍️', Services: '⚙️', Permanence: '🕐' };
const ROLE_LABELS = { chef_rayon: 'Chef de Rayon', chef_secteur: 'Chef Secteur / Département', directeur: 'Directeur (Admin)' };
const ROLE_COLORS = { chef_rayon: '#27ae60', chef_secteur: '#2980b9', directeur: '#e63950' };
const DEFAULT_EVAL = { chef_secteur: ['cr', 'sup_com', 'employe'], chef_rayon: ['employe'] };

export function usersSectionHtml() {
  const users = getUsers(), me = getCurrentUser(), roles = getAllRoles();
  const actifs = users.filter((u) => u.active !== false).length;
  const head = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:10px 14px;background:linear-gradient(135deg,#0a1628,#102244);border-radius:10px;color:#fff;">
    <div style="font-size:12px;font-weight:700;">👥 ${users.length} utilisateur${users.length > 1 ? 's' : ''} · <span style="color:#4ade80;">${actifs} actif${actifs > 1 ? 's' : ''}</span></div>
    <button type="button" data-action="user-add" style="background:#e63950;border:none;color:#fff;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">➕ Ajouter</button></div>`;
  const cards = users.map((u) => {
    const active = u.active !== false, rc = ROLE_COLORS[u.systemRole] || '#888', self = u.id === me?.id;
    const own = u.ownRoleId && roles.find((r) => r.id === u.ownRoleId);
    const ev = (u.evaluableRoleIds || []).map((id) => roles.find((r) => r.id === id)).filter(Boolean);
    return `<div class="user-card${active ? '' : ' inactive'}" data-uid="${esc(u.id)}" style="flex-direction:column;align-items:stretch;gap:10px;padding:14px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="user-avatar" style="background:${rc}">${esc((u.name || '?').charAt(0).toUpperCase())}</div>
        <div class="user-info" style="flex:1;"><div class="user-name">${esc(u.name)} ${self ? '<span style="font-size:9px;color:#27ae60;font-weight:700;">(Vous)</span>' : ''}${active ? '' : ' <span style="font-size:9px;color:#e74c3c;font-weight:700;">INACTIF</span>'}</div>
          <div class="user-meta" style="margin-top:3px;"><span style="margin-right:6px;">@${esc(u.username)}</span><span class="user-role-badge" style="background:${rc}18;color:${rc}">${esc(ROLE_LABELS[u.systemRole] || u.systemRole)}</span>
          ${own ? `<span style="margin-left:6px;font-size:10px;color:var(--muted);">Poste : ${own.icon} ${esc(own.label)}</span>` : ''}</div></div>
        <div class="user-actions">
          ${active ? '<button type="button" class="user-btn" data-action="user-edit" title="Modifier">✏️</button><button type="button" class="user-btn" data-action="user-pw" title="Réinitialiser le mot de passe">🔑</button>' : ''}
          ${self ? '' : `<button type="button" class="user-btn${active ? ' danger' : ''}" data-action="user-toggle" title="${active ? 'Désactiver' : 'Réactiver'}">${active ? '🚫' : '✅'}</button><button type="button" class="user-btn danger" data-action="user-del" title="Supprimer">🗑️</button>`}</div></div>
      ${ev.length ? `<div style="padding-top:8px;border-top:1px solid var(--border);"><div style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">📋 Fonctions évaluées (${ev.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">${ev.map((r) => `<span style="background:${esc(r.light || '#f0f2f5')};color:${esc(r.color || '#555')};padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;">${r.icon} ${esc(r.label)}</span>`).join('')}</div></div>`
        : u.systemRole === 'directeur' ? '' : '<div style="padding-top:8px;border-top:1px solid var(--border);font-size:11px;color:#e74c3c;">⚠️ Aucune fonction assignée</div>'}</div>`;
  }).join('');
  return head + (cards || '<div style="color:var(--muted);font-size:12px;text-align:center;padding:20px;">Aucun utilisateur.</div>');
}

function formBody(u) {
  const roles = getAllRoles();
  return `<div class="modal-field"><label>Nom complet</label><input type="text" id="uf-name" value="${esc(u?.name || '')}" placeholder="Prénom NOM" maxlength="60"></div>
    <div class="modal-field"><label>Identifiant (login)</label><input type="text" id="uf-username" value="${esc(u?.username || '')}" autocomplete="off" maxlength="30"></div>
    ${u ? '' : `<div class="modal-field"><label>Mot de passe (6 caractères minimum)</label><input type="password" id="uf-pw" autocomplete="new-password"></div>
      <div class="modal-field"><label>Confirmer le mot de passe</label><input type="password" id="uf-pw2" autocomplete="new-password"></div>`}
    <div class="modal-field"><label>Rôle système</label><select id="uf-sysrole">${Object.entries(ROLE_LABELS).map(([k, v]) => `<option value="${k}"${u?.systemRole === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="modal-field" id="uf-own-wrap"><label>Son propre poste dans l'application</label><select id="uf-ownrole"><option value="">— Aucun —</option>${roles.map((r) => `<option value="${esc(r.id)}"${u?.ownRoleId === r.id ? ' selected' : ''}>${r.icon} ${esc(r.label)}</option>`).join('')}</select></div>
    <div class="modal-section">📋 Fonctions qu'il peut évaluer / modifier</div>
    <div class="perm-grid">${SECTEURS.map((s) => {
      const list = roles.filter((r) => r.secteur === s);
      return list.length ? `<div class="perm-section-title">${SECT_ICON[s]} ${s}</div>` + list.map((r) => `<label class="perm-item"><input type="checkbox" class="eval-chk" value="${esc(r.id)}"${(u?.evaluableRoleIds || []).includes(r.id) ? ' checked' : ''}>${r.icon} ${esc(r.label)}</label>`).join('') : '';
    }).join('')}</div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
      <button type="button" class="user-btn" data-eval="all" style="font-size:11px;padding:5px 10px;">✅ Tout</button>
      <button type="button" class="user-btn" data-eval="none" style="font-size:11px;padding:5px 10px;">⬜ Aucun</button>
      <button type="button" class="user-btn" data-eval="default" style="font-size:11px;padding:5px 10px;">🎯 Par défaut</button></div>`;
}

function wireForm(root) {
  const sys = root.querySelector('#uf-sysrole'), own = root.querySelector('#uf-own-wrap');
  const chks = () => [...root.querySelectorAll('.eval-chk')];
  const sync = () => { own.style.display = sys.value === 'directeur' ? 'none' : ''; };
  sys.addEventListener('change', sync); sync();
  root.addEventListener('click', (e) => {
    const m = e.target.closest('[data-eval]')?.dataset.eval;
    if (!m) return;
    if (m === 'all') chks().forEach((c) => { c.checked = true; });
    else if (m === 'none') chks().forEach((c) => { c.checked = false; });
    else { const d = sys.value === 'directeur' ? getAllRoles().map((r) => r.id) : DEFAULT_EVAL[sys.value] || []; chks().forEach((c) => { c.checked = d.includes(c.value); }); }
  });
  root.querySelector('#uf-name').focus();
}

const syncMsg = (ok, msg) => toast(ok ? msg : msg + ' — ⚠️ synchronisation en attente', ok ? '#27ae60' : '#e67e22');

export function openUserForm(userId, onDone) {
  const u = userId ? getUsers().find((x) => x.id === userId) : null;
  openModal({
    title: u ? `✏️ Modifier — ${u.name}` : '➕ Nouvel utilisateur', bodyHtml: formBody(u), saveLabel: u ? 'Enregistrer' : 'Créer', onOpen: wireForm,
    onSave: async (root) => {
      const v = (s) => root.querySelector(s)?.value ?? '';
      const data = { name: v('#uf-name'), username: v('#uf-username'), systemRole: v('#uf-sysrole'), ownRoleId: v('#uf-ownrole'), evaluableRoleIds: [...root.querySelectorAll('.eval-chk:checked')].map((c) => c.value) };
      try {
        if (u) { const r = await updateUser(u.id, data); syncMsg(r.synced, `✅ ${data.name} modifié`); }
        else {
          if (v('#uf-pw') !== v('#uf-pw2')) { toast('Les mots de passe ne correspondent pas', '#e74c3c'); return false; }
          const r = await createUser({ ...data, password: v('#uf-pw') });
          syncMsg(r.synced, `✅ ${data.name} créé — ${data.evaluableRoleIds.length} fonction(s)`);
        }
        onDone();
      } catch (e) { toast(e.message, '#e74c3c'); return false; }
    }
  });
}

export function openResetPassword(userId, onDone) {
  const u = getUsers().find((x) => x.id === userId);
  if (!u) return;
  openModal({
    title: `🔑 Réinitialiser — ${u.name}`, saveLabel: 'Enregistrer',
    bodyHtml: '<div class="modal-field"><label>Nouveau mot de passe (6 caractères minimum)</label><input type="password" id="rp-1" autocomplete="new-password"></div><div class="modal-field"><label>Confirmer</label><input type="password" id="rp-2" autocomplete="new-password"></div>',
    onOpen: (root) => root.querySelector('#rp-1').focus(),
    onSave: async (root) => {
      if (root.querySelector('#rp-1').value !== root.querySelector('#rp-2').value) { toast('Les mots de passe ne correspondent pas', '#e74c3c'); return false; }
      try { const r = await resetPassword(userId, root.querySelector('#rp-1').value); syncMsg(r.synced, '✅ Mot de passe modifié'); onDone(); }
      catch (e) { toast(e.message, '#e74c3c'); return false; }
    }
  });
}

export async function handleUserAction(action, userId, onDone) {
  try {
    if (action === 'user-add') return openUserForm(null, onDone);
    if (action === 'user-edit') return openUserForm(userId, onDone);
    if (action === 'user-pw') return openResetPassword(userId, onDone);
    if (action === 'user-toggle') {
      const u = getUsers().find((x) => x.id === userId);
      const r = await setUserActive(userId, u.active === false);
      syncMsg(r.synced, u.active === false ? 'Utilisateur désactivé' : '✅ Utilisateur réactivé');
      return onDone();
    }
    if (action === 'user-del') {
      if (!window.confirm('Supprimer définitivement cet utilisateur ?\n(Son historique de tâches est conservé.)')) return;
      const r = await deleteUser(userId); syncMsg(r.synced, 'Utilisateur supprimé'); onDone();
    }
  } catch (e) { toast(e.message, '#e74c3c'); }
}
