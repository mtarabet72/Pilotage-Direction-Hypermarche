// ═══════════════════════════════════════════════════════════════════════
// Edge Function « admin-users » — gestion des comptes (Directeur uniquement)
//
// Actions (POST JSON { action, ... }) :
//   create          { name, username, system_role, own_role_id?, evaluable_role_ids?, password? }
//   update          { id, name, username, system_role, own_role_id?, evaluable_role_ids? }
//   reset_password  { id, password? }          → nouveau mot de passe provisoire
//   set_active      { id, active }             → désactive (et bloque) / réactive un compte
//   delete          { id, confirm: true }      → ⚠ supprime aussi cases, notes, historique
//   import_legacy   {}                         → importe les comptes de l'ancien hm_users
//   bootstrap       {}                         → 1er import, SANS connexion, via x-bootstrap-token
//
// La clé service_role reste ici (secrets de la fonction) et n'est JAMAIS envoyée au navigateur.
// Secrets attendus : EMAIL_DOMAIN, BOOTSTRAP_TOKEN (temporaire), ALLOWED_ORIGINS (conseillé),
//                    REQUIRE_MFA (optionnel, "true"), SERVICE_ROLE_KEY (si SUPABASE_SERVICE_ROLE_KEY absente).
// ═══════════════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import {
  bearer, corsHeaders, decodeJwtPayload, genPassword, HttpError, isUuid, legacyToSpec,
  type LegacyUser, normUsername, sanitizeUsername, timingSafeEqual, toEmail, type UserSpec, validatePassword, validateSpec,
} from "./lib.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EMAIL_DOMAIN = Deno.env.get("EMAIL_DOMAIN") ?? "pilotage.invalid";
const BOOTSTRAP_TOKEN = Deno.env.get("BOOTSTRAP_TOKEN") ?? "";
const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",").map((s) => s.trim()).filter(Boolean);
const REQUIRE_MFA = Deno.env.get("REQUIRE_MFA") === "true";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BAN_FOREVER = "876000h"; // ≈ 100 ans

// ── Utilitaires ─────────────────────────────────────────────────────────
function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function audit(actor: string | null, action: string, rowKey: string, details: Record<string, unknown> = {}) {
  // Jamais de mot de passe dans le journal.
  const { error } = await admin.from("audit_log").insert({
    actor, actor_role: "admin-users", action, table_name: "auth.users", row_key: rowKey, new_data: details,
  });
  if (error) console.error("audit_log :", error.message);
}

function authMessage(msg: string): string {
  if (/already|registered|exists/i.test(msg)) return "Cet identifiant est déjà utilisé";
  if (/email/i.test(msg) && /invalid|valid/i.test(msg)) {
    return "Adresse technique refusée par Supabase Auth : changez le secret EMAIL_DOMAIN (voir guide)";
  }
  if (/password/i.test(msg)) return "Mot de passe refusé par la politique de Supabase Auth";
  return "Erreur Supabase Auth : " + msg;
}

// ── Contrôle d'accès ────────────────────────────────────────────────────
async function requireDirector(req: Request): Promise<string> {
  const jwt = bearer(req);
  if (!jwt) throw new HttpError(401, "Connexion requise");
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) throw new HttpError(401, "Session invalide ou expirée");
  if (REQUIRE_MFA && decodeJwtPayload(jwt).aal !== "aal2") {
    throw new HttpError(403, "Double authentification (MFA) requise pour cette action");
  }
  const { data: p, error: pe } = await admin.from("profiles")
    .select("system_role, active").eq("id", data.user.id).maybeSingle();
  if (pe) throw new HttpError(500, "Lecture du profil impossible");
  if (!p || !p.active || p.system_role !== "directeur") throw new HttpError(403, "Réservé au Directeur");
  return data.user.id;
}

// ── Création d'un compte Auth + profil (avec annulation si le profil échoue) ──
async function createAccount(spec: UserSpec, password: string, extra: { legacy_id?: string; active?: boolean } = {}) {
  const { data: dup } = await admin.from("profiles").select("id").eq("username", spec.username).maybeSingle();
  if (dup) throw new HttpError(409, "Cet identifiant est déjà utilisé");

  const { data, error } = await admin.auth.admin.createUser({
    email: toEmail(spec.username, EMAIL_DOMAIN),
    password,
    email_confirm: true,
  });
  if (error || !data?.user) throw new HttpError(400, authMessage(error?.message ?? "création impossible"));
  const id = data.user.id;

  const active = extra.active !== false;
  const { error: pe } = await admin.from("profiles").insert({
    id, username: spec.username, name: spec.name, system_role: spec.system_role,
    own_role_id: spec.own_role_id, evaluable_role_ids: spec.evaluable_role_ids,
    active, must_change_password: true, legacy_id: extra.legacy_id ?? null,
  });
  if (pe) {
    await admin.auth.admin.deleteUser(id);          // annulation : pas de compte orphelin
    throw new HttpError(pe.code === "23505" ? 409 : 400, pe.code === "23505" ? "Identifiant déjà utilisé" : "Création du profil impossible");
  }
  if (!active) await admin.auth.admin.updateUserById(id, { ban_duration: BAN_FOREVER });
  return id;
}

// ── Import de l'ancien système (hm_app_data.hm_users) ───────────────────
async function importLegacy(actor: string | null) {
  const { data, error } = await admin.from("hm_app_data").select("data").eq("key", "hm_users").maybeSingle();
  if (error) throw new HttpError(500, "Lecture de l'ancien hm_users impossible : " + error.message);
  const list = (Array.isArray(data?.data) ? data!.data : []) as LegacyUser[];
  if (list.length === 0) throw new HttpError(404, "Aucun utilisateur trouvé dans l'ancien système");
  if (list.length > 200) throw new HttpError(413, "Trop d'utilisateurs (200 maximum)");
  if (!list.some((u) => u.systemRole === "directeur" && u.active !== false)) {
    throw new HttpError(422, "Aucun Directeur actif dans l'ancien système : import annulé");
  }

  const { data: existing } = await admin.from("profiles").select("legacy_id, username");
  const knownLegacy = new Set((existing ?? []).map((r) => r.legacy_id).filter(Boolean));
  const knownNames = new Set((existing ?? []).map((r) => String(r.username).toLowerCase()));

  const created: Array<Record<string, string>> = [];
  const skipped: Array<{ name: string; username: string; reason: string }> = [];
  const renamed: Array<{ name: string; from: string; to: string }> = [];
  for (const u of list) {
    const original = String(u.username ?? "").trim();
    const label = String(u.name ?? "?");
    try {
      if (!u.id) { skipped.push({ name: label, username: original, reason: "sans identifiant interne" }); continue; }
      if (knownLegacy.has(u.id)) { skipped.push({ name: label, username: original, reason: "déjà importé" }); continue; }
      const base = sanitizeUsername(original);
      if (base.length < 2) throw new HttpError(400, "identifiant inutilisable après nettoyage");
      let uname = base;
      for (let n = 2; knownNames.has(uname); n++) {     // doublon : rrm, rrm.2, rrm.3…
        const suffix = "." + n;
        uname = base.slice(0, 30 - suffix.length) + suffix;
      }
      const spec = legacyToSpec({ ...u, username: uname });
      const password = genPassword();
      const id = await createAccount(spec, password, { legacy_id: u.id, active: u.active !== false });
      knownNames.add(uname);
      knownLegacy.add(u.id);
      created.push({ id, username: spec.username, name: spec.name, system_role: spec.system_role, temp_password: password });
      if (uname !== original.toLowerCase()) renamed.push({ name: label, from: original, to: uname });
    } catch (e) {
      skipped.push({ name: label, username: original, reason: e instanceof HttpError ? e.message : "erreur" });
    }
  }
  await audit(actor, "IMPORT_LEGACY", "hm_users", { created: created.length, skipped: skipped.length });
  return { created, skipped, renamed, note: "Les mots de passe provisoires ne sont affichés qu'UNE fois. Chaque utilisateur devra le changer à sa première connexion." };
}

async function bootstrap(req: Request) {
  if (BOOTSTRAP_TOKEN.length < 24) throw new HttpError(503, "Bootstrap désactivé (secret BOOTSTRAP_TOKEN absent ou trop court)");
  const given = req.headers.get("x-bootstrap-token") ?? "";
  if (!timingSafeEqual(given, BOOTSTRAP_TOKEN)) throw new HttpError(403, "Jeton invalide");
  const { data: dirs, error } = await admin.from("profiles")
    .select("must_change_password").eq("system_role", "directeur").eq("active", true);
  if (error) throw new HttpError(500, "Lecture de profiles impossible : " + error.message + " (code " + (error.code ?? "?") + ")");
  if ((dirs ?? []).some((d) => d.must_change_password === false)) {
    throw new HttpError(409, "Fenêtre d'import fermée : un Directeur a déjà changé son mot de passe. Utilisez import_legacy connecté.");
  }
  return await importLegacy(null);
}

// ── Actions connectées ──────────────────────────────────────────────────
async function handleAction(action: string, body: Record<string, unknown>, actor: string) {
  switch (action) {
    case "create": {
      const spec = validateSpec(body);
      const password = body.password ? validatePassword(body.password) : genPassword();
      const id = await createAccount(spec, password);
      await audit(actor, "CREATE_USER", id, { username: spec.username, system_role: spec.system_role });
      return { id, username: spec.username, temp_password: password };
    }
    case "update": {
      if (!isUuid(body.id)) throw new HttpError(400, "Identifiant utilisateur invalide");
      const spec = validateSpec(body);
      const { data: cur } = await admin.from("profiles").select("username").eq("id", body.id).maybeSingle();
      if (!cur) throw new HttpError(404, "Utilisateur introuvable");
      if (cur.username.toLowerCase() !== spec.username) {
        const { data: dup } = await admin.from("profiles").select("id").eq("username", spec.username).neq("id", body.id).maybeSingle();
        if (dup) throw new HttpError(409, "Cet identifiant est déjà utilisé");
      }
      const { error } = await admin.from("profiles").update({
        username: spec.username, name: spec.name, system_role: spec.system_role,
        own_role_id: spec.own_role_id, evaluable_role_ids: spec.evaluable_role_ids,
      }).eq("id", body.id);
      if (error) throw new HttpError(400, error.message.includes("Directeur") ? error.message : "Modification impossible");
      if (cur.username.toLowerCase() !== spec.username) {
        const r = await admin.auth.admin.updateUserById(body.id, { email: toEmail(spec.username, EMAIL_DOMAIN) });
        if (r.error) throw new HttpError(400, authMessage(r.error.message));
      }
      await audit(actor, "UPDATE_USER", body.id, { username: spec.username, system_role: spec.system_role });
      return { ok: true };
    }
    case "reset_password": {
      if (!isUuid(body.id)) throw new HttpError(400, "Identifiant utilisateur invalide");
      const password = body.password ? validatePassword(body.password) : genPassword();
      const r = await admin.auth.admin.updateUserById(body.id, { password });
      if (r.error) throw new HttpError(400, authMessage(r.error.message));
      await admin.from("profiles").update({ must_change_password: true }).eq("id", body.id);
      await audit(actor, "RESET_PASSWORD", body.id);
      return { id: body.id, temp_password: password };
    }
    case "set_active": {
      if (!isUuid(body.id)) throw new HttpError(400, "Identifiant utilisateur invalide");
      const active = body.active === true;
      if (!active && body.id === actor) throw new HttpError(400, "Vous ne pouvez pas désactiver votre propre compte");
      const { error } = await admin.from("profiles").update({ active }).eq("id", body.id);
      if (error) throw new HttpError(400, error.message.includes("Directeur") ? error.message : "Modification impossible");
      const r = await admin.auth.admin.updateUserById(body.id, { ban_duration: active ? "none" : BAN_FOREVER });
      if (r.error) throw new HttpError(400, authMessage(r.error.message));
      await audit(actor, active ? "ACTIVATE_USER" : "DEACTIVATE_USER", body.id);
      return { ok: true };
    }
    case "delete": {
      if (!isUuid(body.id)) throw new HttpError(400, "Identifiant utilisateur invalide");
      if (body.confirm !== true) throw new HttpError(400, "Confirmation requise (confirm: true) — la suppression efface aussi cases, notes et historique ; préférez la désactivation");
      if (body.id === actor) throw new HttpError(400, "Vous ne pouvez pas supprimer votre propre compte");
      const { data: p } = await admin.from("profiles").select("username").eq("id", body.id).maybeSingle();
      const r = await admin.auth.admin.deleteUser(body.id);
      if (r.error) throw new HttpError(400, r.error.message.includes("Directeur") ? r.error.message : "Suppression impossible");
      await audit(actor, "DELETE_USER", body.id, { username: p?.username ?? null });
      return { ok: true };
    }
    case "import_legacy":
      return await importLegacy(actor);
    default:
      throw new HttpError(400, "Action inconnue");
  }
}

// ── Point d'entrée ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"), ALLOWED);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée" }, cors);
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: "Configuration serveur incomplète" }, cors);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error();
  } catch {
    return json(400, { error: "Corps JSON invalide" }, cors);
  }

  try {
    const action = String(body.action ?? "");
    if (action === "bootstrap") return json(200, await bootstrap(req), cors);
    const actor = await requireDirector(req);
    return json(200, await handleAction(action, body, actor), cors);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message }, cors);
    console.error("admin-users :", e);
    return json(500, { error: "Erreur interne" }, cors);
  }
});
