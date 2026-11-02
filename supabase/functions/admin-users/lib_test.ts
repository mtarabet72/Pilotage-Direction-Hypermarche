import nodeAssert from "node:assert/strict";

const assert = (v: unknown, msg?: string) => nodeAssert.ok(v, msg);
const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepEqual(a, b);
const assertThrows = (fn: () => unknown, cls: new (...a: never[]) => Error) => nodeAssert.throws(fn, cls);

import {
  bearer, corsHeaders, decodeJwtPayload, genPassword, HttpError, isUuid, legacyToSpec, timingSafeEqual,
  validatePassword, validateSpec, sanitizeUsername,
} from "./lib.ts";

Deno.test("genPassword : longueur, alphabet, unicité", () => {
  const set = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const p = genPassword();
    assertEquals(p.length, 12);
    assert(/^[A-HJ-NP-Za-km-z2-9]+$/.test(p), "caractère ambigu : " + p);
    set.add(p);
  }
  assertEquals(set.size, 500);
});

Deno.test("validateSpec : cas valide et normalisation", () => {
  const s = validateSpec({ name: " Ali ", username: " ALI.b ", system_role: "chef_rayon", own_role_id: "cr", evaluable_role_ids: ["a", "a", "b"] });
  assertEquals(s, { name: "Ali", username: "ali.b", system_role: "chef_rayon", own_role_id: "cr", evaluable_role_ids: ["a", "b"] });
});

Deno.test("validateSpec : refus (identifiant, rôle, injection)", () => {
  const base = { name: "X", username: "ok", system_role: "directeur" };
  for (const bad of [
    { ...base, username: "a" }, { ...base, username: "a b" }, { ...base, username: "x".repeat(31) },
    { ...base, system_role: "root" }, { ...base, name: "" }, { ...base, name: "n".repeat(101) },
    { ...base, own_role_id: "x'; drop table" }, { ...base, evaluable_role_ids: "cr" },
    { ...base, evaluable_role_ids: ["ok", "<script>"] },
  ]) {
    assertThrows(() => validateSpec(bad), HttpError);
  }
});

Deno.test("validatePassword : 10 à 72 caractères", () => {
  assertThrows(() => validatePassword("court"), HttpError);
  assertThrows(() => validatePassword("x".repeat(73)), HttpError);
  assertEquals(validatePassword("0123456789"), "0123456789");
});

Deno.test("timingSafeEqual", () => {
  assert(timingSafeEqual("abc", "abc"));
  assert(!timingSafeEqual("abc", "abd"));
  assert(!timingSafeEqual("abc", "abcd"));
  assert(!timingSafeEqual("", "a"));
});

Deno.test("isUuid", () => {
  assert(isUuid("00000000-0000-0000-0000-00000000000a"));
  assert(!isUuid("u_abc123"));
  assert(!isUuid(42));
});

Deno.test("bearer et decodeJwtPayload", () => {
  const payload = btoa(JSON.stringify({ aal: "aal2" })).replace(/=+$/, "");
  const req = new Request("http://x", { headers: { authorization: `Bearer h.${payload}.s` } });
  assertEquals(bearer(req), `h.${payload}.s`);
  assertEquals(decodeJwtPayload(bearer(req)).aal, "aal2");
  assertEquals(decodeJwtPayload("garbage"), {});
  assertEquals(bearer(new Request("http://x")), "");
});

Deno.test("corsHeaders : liste blanche", () => {
  assertEquals(corsHeaders("https://a.github.io", ["https://a.github.io"])["Access-Control-Allow-Origin"], "https://a.github.io");
  assertEquals(corsHeaders("https://evil.com", ["https://a.github.io"])["Access-Control-Allow-Origin"], undefined);
  assertEquals(corsHeaders("https://evil.com", ["*"])["Access-Control-Allow-Origin"], "*");
});

Deno.test("legacyToSpec : ancien format", () => {
  const s = legacyToSpec({ id: "u_1", name: "Directeur", username: "admin", systemRole: "directeur", ownRoleId: null, evaluableRoleIds: [] });
  assertEquals(s.system_role, "directeur");
  assertThrows(() => legacyToSpec({ id: "u_2", name: "Z", username: "z", systemRole: "inconnu" }), HttpError);
});

Deno.test("sanitizeUsername : anciens identifiants libres", () => {
  assertEquals(sanitizeUsername("crémerie"), "cremerie");
  assertEquals(sanitizeUsername("bazar/le"), "bazar.le");
  assertEquals(sanitizeUsername("em/elec"), "em.elec");
  assertEquals(sanitizeUsername("  RRM "), "rrm");
  assertEquals(sanitizeUsername("Boulangerie Pâtisserie"), "boulangerie.patisserie");
  assertEquals(sanitizeUsername("a//b"), "a.b");
  assertEquals(sanitizeUsername("/x/"), "x");
  assertEquals(sanitizeUsername("x".repeat(40)).length, 30);
  assertEquals(sanitizeUsername("é").length, 1);   // trop court : refusé plus loin (min 2)
  assertEquals(validateSpec({ name: "N", username: sanitizeUsername("bazar/le"), system_role: "chef_rayon" }).username, "bazar.le");
});
