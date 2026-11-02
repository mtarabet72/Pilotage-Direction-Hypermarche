// Fonctions pures de l'Edge Function admin-users (testables sans Supabase).

export const SYSTEM_ROLES = ["directeur", "chef_secteur", "chef_rayon"] as const;
export type SystemRole = typeof SYSTEM_ROLES[number];

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface UserSpec {
  name: string;
  username: string;
  system_role: SystemRole;
  own_role_id: string | null;
  evaluable_role_ids: string[];
}

const USERNAME_RE = /^[a-z0-9._-]{2,30}$/;
const ROLE_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

// Ancien identifiant libre (accents, « / », espaces…) → identifiant valide : « crémerie » → « cremerie », « bazar/le » → « bazar.le ».
export function sanitizeUsername(raw: unknown): string {
  let s = String(raw ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  s = s.replace(/[^a-z0-9._-]+/g, ".").replace(/\.{2,}/g, ".").replace(/^[._-]+|[._-]+$/g, "");
  return s.slice(0, 30).replace(/[._-]+$/g, "");
}

export const normUsername = (u: unknown): string => String(u ?? "").trim().toLowerCase();

export function validateSpec(input: Record<string, unknown>): UserSpec {
  const name = String(input?.name ?? "").trim();
  const username = normUsername(input?.username);
  if (name.length < 1 || name.length > 100) throw new HttpError(400, "Nom requis (100 caractères maximum)");
  if (!USERNAME_RE.test(username)) throw new HttpError(400, "Identifiant : 2 à 30 caractères (lettres, chiffres, . _ -)");
  const system_role = String(input?.system_role ?? "") as SystemRole;
  if (!SYSTEM_ROLES.includes(system_role)) throw new HttpError(400, "Rôle système invalide");
  const own = input?.own_role_id;
  if (own != null && own !== "" && !(typeof own === "string" && ROLE_ID_RE.test(own))) throw new HttpError(400, "Fonction propre invalide");
  const ev = input?.evaluable_role_ids ?? [];
  if (!Array.isArray(ev) || ev.length > 100 || !ev.every((x) => typeof x === "string" && ROLE_ID_RE.test(x))) {
    throw new HttpError(400, "Fonctions évaluables invalides");
  }
  return {
    name,
    username,
    system_role,
    own_role_id: own ? String(own) : null,
    evaluable_role_ids: [...new Set(ev as string[])],
  };
}

export function validatePassword(p: unknown): string {
  const s = String(p ?? "");
  if (s.length < 10 || s.length > 72) throw new HttpError(400, "Mot de passe : 10 à 72 caractères");
  return s;
}

// Mot de passe provisoire : 12 caractères sans ambiguïté visuelle (pas de 0/O, 1/l/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export function genPassword(length = 12): string {
  const out: string[] = [];
  const max = 256 - (256 % ALPHABET.length);   // rejet pour éviter le biais modulo
  while (out.length < length) {
    const buf = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of buf) {
      if (b < max && out.length < length) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return out.join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export const toEmail = (username: string, domain: string): string => `${username}@${domain}`;

export function bearer(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  try {
    const part = jwt.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(atob(b64));
  } catch {
    return {};
  }
}

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const ok = allowed.includes("*") || (origin !== null && allowed.includes(origin));
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-bootstrap-token",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
  if (ok) h["Access-Control-Allow-Origin"] = allowed.includes("*") ? "*" : origin!;
  return h;
}

// Ancien format des utilisateurs (hm_app_data.hm_users) → profil.
export interface LegacyUser {
  id: string;
  name: string;
  username: string;
  systemRole: string;
  ownRoleId?: string | null;
  evaluableRoleIds?: string[];
  active?: boolean;
}

export function legacyToSpec(u: LegacyUser): UserSpec {
  return validateSpec({
    name: u.name,
    username: u.username,
    system_role: u.systemRole,
    own_role_id: u.ownRoleId ?? null,
    evaluable_role_ids: u.evaluableRoleIds ?? [],
  });
}
