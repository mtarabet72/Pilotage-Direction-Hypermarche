import { CONFIG } from './config.js';
import { getClient } from './supabase.js';

// ═══════════════════════════════════════════════════════════════════════
// Authentification : Supabase Auth (mots de passe hachés côté serveur, jetons signés).
// Le rôle (directeur, chef de secteur…) vient de la table `profiles`, protégée par la RLS :
// le navigateur ne peut ni le choisir ni le modifier. La gestion des comptes passe par
// l'Edge Function `admin-users` (réservée au Directeur).
// ═══════════════════════════════════════════════════════════════════════

const MIN_PASSWORD = 10;
const PROFILE_CACHE = 'hm_profile_cache';   // dernier profil connu : permet de rouvrir l'application hors ligne

let users = [];
let currentUser = null;

// Même règle que le serveur : « Crémerie » → « cremerie », « bazar/le » → « bazar.le ».
export function sanitizeUsername(raw) {
  let s = String(raw ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  s = s.replace(/[^a-z0-9._-]+/g, '.').replace(/\.{2,}/g, '.').replace(/^[._-]+|[._-]+$/g, '');
  return s.slice(0, 30).replace(/[._-]+$/g, '');
}
const toEmail = (username) => `${sanitizeUsername(username)}@${CONFIG.emailDomain}`;

function fromProfile(p) {
  return {
    id: p.id, name: p.name, username: p.username, systemRole: p.system_role,
    ownRoleId: p.own_role_id || null, evaluableRoleIds: p.evaluable_role_ids || [],
    active: p.active !== false, mustChangePassword: !!p.must_change_password, createdAt: p.created_at
  };
}

const needClient = () => {
  const c = getClient();
  if (!c) throw new Error('Supabase injoignable : vérifiez le réseau puis réessayez');
  return c;
};

async function fetchProfile(id) {
  const { data, error } = await needClient().from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? fromProfile(data) : null;
}

// ── Utilisateurs ────────────────────────────────────────────────────────
// Liste des comptes (noms pour le planning, « assignée à »…). Nécessite d'être connecté.
export async function loadUsers() {
  const c = getClient();
  if (!c) return users;
  const { data, error } = await c.from('profiles').select('*').order('name');
  if (error) { console.warn('Lecture des utilisateurs :', error.message); return users; }
  users = (data || []).map(fromProfile);
  return users;
}

export const getUsers = () => users;
export const saveUsers = async () => true;   // plus de copie locale : la base fait foi

async function callAdmin(action, payload = {}) {
  const { data, error } = await needClient().functions.invoke(CONFIG.adminFunction, { body: { action, ...payload } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch (e) { /* message générique */ }
    throw new Error(msg);
  }
  return data;
}

function checkPasswordInput(pw) {
  if (pw && pw.length < MIN_PASSWORD) throw new Error(`Mot de passe : ${MIN_PASSWORD} caractères minimum (ou laissez vide pour en générer un)`);
}

// Création : mot de passe facultatif (généré par le serveur si vide). Retourne tempPassword à remettre à l'intéressé.
export async function createUser({ name, username, password, systemRole, ownRoleId, evaluableRoleIds }) {
  checkPasswordInput(password);
  const r = await callAdmin('create', {
    name, username: sanitizeUsername(username), password: password || undefined,
    system_role: systemRole, own_role_id: ownRoleId || null, evaluable_role_ids: evaluableRoleIds || []
  });
  await loadUsers();
  return { user: users.find((u) => u.id === r.id), synced: true, tempPassword: r.temp_password };
}

export async function updateUser(id, { name, username, systemRole, ownRoleId, evaluableRoleIds }) {
  await callAdmin('update', {
    id, name, username: sanitizeUsername(username), system_role: systemRole,
    own_role_id: ownRoleId || null, evaluable_role_ids: evaluableRoleIds || []
  });
  await loadUsers();
  return { user: users.find((u) => u.id === id), synced: true };
}

export async function resetPassword(id, newPassword) {
  checkPasswordInput(newPassword);
  const r = await callAdmin('reset_password', { id, password: newPassword || undefined });
  return { synced: true, tempPassword: r.temp_password };
}

export async function setUserActive(id, active) {
  if (!active && id === currentUser?.id) throw new Error('Impossible de désactiver votre propre compte');
  await callAdmin('set_active', { id, active });
  await loadUsers();
  return { synced: true };
}

export async function deleteUser(id) {
  if (id === currentUser?.id) throw new Error('Impossible de supprimer votre propre compte');
  await callAdmin('delete', { id, confirm: true });
  await loadUsers();
  return { synced: true };
}

// ── Session ─────────────────────────────────────────────────────────────
export const getCurrentUser = () => currentUser;
export const isDirector = (u = currentUser) => !!u && u.systemRole === 'directeur';

function rememberProfile(user) {
  try { localStorage.setItem(PROFILE_CACHE, JSON.stringify(user)); } catch (e) { /* quota : sans importance */ }
}
const forgetProfile = () => { try { localStorage.removeItem(PROFILE_CACHE); } catch (e) { /* ignoré */ } };

export async function login(username, password) {
  const client = needClient();
  if (!String(username || '').trim() || !password) throw new Error('Identifiant et mot de passe requis');
  const { data, error } = await client.auth.signInWithPassword({ email: toEmail(username), password });
  if (error) {
    if (error.status === 429 || /rate limit|too many/i.test(error.message)) throw new Error('Trop de tentatives : patientez quelques minutes');
    if (error.status === 400 || error.status === 401 || /invalid|credentials/i.test(error.message)) throw new Error('Identifiant ou mot de passe incorrect');
    throw new Error(error.message || 'Connexion impossible');
  }
  const user = await fetchProfile(data.user.id);
  if (!user || !user.active) {
    await client.auth.signOut({ scope: 'local' });
    throw new Error('Compte désactivé ou introuvable : contactez le Directeur');
  }
  currentUser = user;
  rememberProfile(user);
  await loadUsers();
  return user;
}

// Rouvre la session mémorisée par Supabase (jeton rafraîchi automatiquement). Hors ligne : profil mis en cache.
export async function restoreSession() {
  const client = getClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  const session = data?.session;
  if (!session) { currentUser = null; forgetProfile(); return null; }
  try {
    const user = await fetchProfile(session.user.id);
    if (!user || !user.active) { await client.auth.signOut({ scope: 'local' }); currentUser = null; forgetProfile(); return null; }
    currentUser = user;
    rememberProfile(user);
  } catch (e) {
    try {
      const cached = JSON.parse(localStorage.getItem(PROFILE_CACHE) || 'null');
      currentUser = cached && cached.id === session.user.id ? cached : null;
    } catch (err) { currentUser = null; }
  }
  if (currentUser) await loadUsers();
  return currentUser;
}

// Déconnexion de CET appareil seulement (les autres appareils du même compte restent connectés).
export async function logout() {
  currentUser = null;
  users = [];
  forgetProfile();
  try { await getClient()?.auth.signOut({ scope: 'local' }); } catch (e) { /* déjà déconnecté */ }
}

// ── Mot de passe ────────────────────────────────────────────────────────
// Premier accès (mot de passe provisoire) ou changement : met à jour Auth puis lève le drapeau « à changer ».
export async function changePassword(userId, newPassword) {
  if (!currentUser || (userId && userId !== currentUser.id)) throw new Error('Non autorisé');
  if (!newPassword || newPassword.length < MIN_PASSWORD) throw new Error(`${MIN_PASSWORD} caractères minimum`);
  const client = needClient();
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) {
    if (/same|different/i.test(error.message)) throw new Error('Le nouveau mot de passe doit être différent de l\'actuel');
    if (/weak|short|password/i.test(error.message)) throw new Error('Mot de passe refusé : choisissez-en un plus long ou moins courant');
    throw new Error(error.message);
  }
  const ack = await client.rpc('ack_password_changed');
  if (ack.error) console.warn('ack_password_changed :', ack.error.message);
  currentUser.mustChangePassword = false;
  rememberProfile(currentUser);
}

// Changement par l'utilisateur lui-même : exige l'ancien mot de passe (revérifié auprès du serveur).
export async function changeOwnPassword(current, next) {
  if (!currentUser) throw new Error('Non connecté');
  const { error } = await needClient().auth.signInWithPassword({ email: toEmail(currentUser.username), password: current });
  if (error) throw new Error('Mot de passe actuel incorrect');
  await changePassword(currentUser.id, next);
}
