import { kvGet, kvSet } from './supabase.js';

const USERS_KEY = 'hm_users';
const SESSION_KEY = 'pilotage-session';
const PBKDF2_ITERATIONS = 100000;

let users = [];
let currentUser = null;

// ── Hash ────────────────────────────────────────────────────
const toHex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function pbkdf2(password, saltHex) {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  );
  return toHex(bits);
}

// Ancien hash (v3, FNV-1a 32 bits) : conservé UNIQUEMENT pour migrer les comptes existants.
function legacyHash(s) {
  let h = 0x811c9dc5;
  const full = s + '_hm_tarabet_sec';
  for (let i = 0; i < full.length; i++) {
    h ^= full.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export async function makeHash(password) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return `pbkdf2$${salt}$${await pbkdf2(password, salt)}`;
}

async function verifyPassword(password, user) {
  const stored = user.passwordHash || '';
  if (stored.startsWith('pbkdf2$')) {
    const [, salt, hash] = stored.split('$');
    return { ok: (await pbkdf2(password, salt)) === hash, upgrade: false };
  }
  return { ok: stored === legacyHash(password), upgrade: true };
}

// ── Utilisateurs ────────────────────────────────────────────
const DIRTY_KEY = 'hm_users_dirty';       // modifications locales pas encore envoyées à Supabase
const readLocalUsers = () => {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]') || []; }
  catch (e) { return []; }
};

async function seedAdmin() {
  // Premier démarrage : compte directeur avec mot de passe provisoire à changer.
  return {
    id: 'u_admin', name: 'Directeur', username: 'admin',
    passwordHash: await makeHash('1234'), mustChangePassword: true,
    systemRole: 'directeur', ownRoleId: null, evaluableRoleIds: [],
    active: true, createdAt: new Date().toISOString()
  };
}

export async function saveUsers() {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  try { await kvSet(USERS_KEY, users); localStorage.removeItem(DIRTY_KEY); return true; }
  catch (e) { localStorage.setItem(DIRTY_KEY, '1'); console.warn('Sync utilisateurs impossible :', e.message); return false; }
}

// Supabase fait foi (sinon une suppression faite sur un appareil ressusciterait depuis un autre).
// Exception : des modifications locales non envoyées (hors ligne) sont conservées puis poussées.
export async function loadUsers() {
  const local = readLocalUsers();
  let remote = null;
  try { remote = await kvGet(USERS_KEY); } catch (e) { console.warn('Lecture utilisateurs :', e.message); }

  if (Array.isArray(remote) && remote.length && !localStorage.getItem(DIRTY_KEY)) users = remote;
  else users = local.length ? local : (Array.isArray(remote) ? remote : []);

  if (!users.find((u) => u.username === 'admin')) users.unshift(await seedAdmin());
  await saveUsers();
  return users;
}

export const getUsers = () => users;

const normUsername = (u) => String(u || '').trim().toLowerCase();
const usernameTaken = (username, exceptId) => users.some((u) => normUsername(u.username) === username && u.id !== exceptId);

function checkProfile({ name, username }, exceptId) {
  if (!String(name || '').trim() || !username) throw new Error('Nom et identifiant requis');
  if (!/^[a-z0-9._-]{2,30}$/.test(username)) throw new Error('Identifiant : 2 à 30 caractères (lettres, chiffres, . _ -)');
  if (usernameTaken(username, exceptId)) throw new Error('Cet identifiant est déjà utilisé');
}

export async function createUser({ name, username, password, systemRole, ownRoleId, evaluableRoleIds }) {
  const uname = normUsername(username);
  checkProfile({ name, username: uname });
  if (!password || password.length < 6) throw new Error('Mot de passe : 6 caractères minimum');
  const user = {
    id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name.trim(), username: uname,
    passwordHash: await makeHash(password), systemRole, ownRoleId: ownRoleId || null,
    evaluableRoleIds: evaluableRoleIds || [], active: true, createdAt: new Date().toISOString()
  };
  users.push(user);
  return { user, synced: await saveUsers() };
}

export async function updateUser(id, { name, username, systemRole, ownRoleId, evaluableRoleIds }) {
  const u = users.find((x) => x.id === id);
  if (!u) throw new Error('Utilisateur introuvable');
  const uname = normUsername(username);
  checkProfile({ name, username: uname }, id);
  if (u.systemRole === 'directeur' && systemRole !== 'directeur' && users.filter((x) => x.systemRole === 'directeur' && x.active !== false).length < 2)
    throw new Error('Il doit rester au moins un Directeur actif');
  Object.assign(u, { name: name.trim(), username: uname, systemRole, ownRoleId: ownRoleId || null, evaluableRoleIds: evaluableRoleIds || [] });
  return { user: u, synced: await saveUsers() };
}

export async function resetPassword(id, newPassword) {
  if (!newPassword || newPassword.length < 6) throw new Error('Mot de passe : 6 caractères minimum');
  const u = users.find((x) => x.id === id);
  if (!u) throw new Error('Utilisateur introuvable');
  u.passwordHash = await makeHash(newPassword);
  u.mustChangePassword = false;
  return { synced: await saveUsers() };
}

// Changement par l'utilisateur lui-même : exige l'ancien mot de passe.
export async function changeOwnPassword(current, next) {
  if (!currentUser) throw new Error('Non connecté');
  if (!(await verifyPassword(current, currentUser)).ok) throw new Error('Mot de passe actuel incorrect');
  await changePassword(currentUser.id, next);
}

const activeDirectors = () => users.filter((x) => x.systemRole === 'directeur' && x.active !== false);

export async function setUserActive(id, active) {
  const u = users.find((x) => x.id === id);
  if (!u) throw new Error('Utilisateur introuvable');
  if (!active && (id === currentUser?.id || (u.systemRole === 'directeur' && activeDirectors().length < 2))) throw new Error('Impossible de désactiver ce compte');
  u.active = active;
  return { synced: await saveUsers() };
}

export async function deleteUser(id) {
  const u = users.find((x) => x.id === id);
  if (!u) throw new Error('Utilisateur introuvable');
  if (id === currentUser?.id || (u.systemRole === 'directeur' && activeDirectors().length < 2 && u.active !== false)) throw new Error('Impossible de supprimer ce compte');
  users = users.filter((x) => x.id !== id);
  return { synced: await saveUsers() };
}

// ── Session ─────────────────────────────────────────────────
export const getCurrentUser = () => currentUser;

export async function login(username, password) {
  const name = (username || '').trim().toLowerCase();
  const user = users.find((u) => (u.username || '').toLowerCase() === name);
  if (!user || user.active === false) throw new Error('Identifiant ou mot de passe incorrect');

  const { ok, upgrade } = await verifyPassword(password, user);
  if (!ok) throw new Error('Identifiant ou mot de passe incorrect');

  if (upgrade) {                       // migration transparente vers PBKDF2
    user.passwordHash = await makeHash(password);
    delete user._pwChanged;
    await saveUsers();
  }
  currentUser = user;
  sessionStorage.setItem(SESSION_KEY, user.id);
  return user;
}

export function restoreSession() {
  const id = sessionStorage.getItem(SESSION_KEY);
  currentUser = users.find((u) => u.id === id && u.active !== false) || null;
  return currentUser;
}

export function logout() {
  currentUser = null;
  sessionStorage.removeItem(SESSION_KEY);
}

export async function changePassword(userId, newPassword) {
  if (!newPassword || newPassword.length < 6) throw new Error('6 caractères minimum');
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error('Utilisateur introuvable');
  user.passwordHash = await makeHash(newPassword);
  user.mustChangePassword = false;
  await saveUsers();
}

export const isDirector = (u = currentUser) => !!u && u.systemRole === 'directeur';
