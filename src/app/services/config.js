// Configuration du projet Supabase.
//
// Ces deux valeurs sont PUBLIQUES par conception : l'adresse du projet et la clé « publishable »
// sont faites pour être embarquées dans une application web. Ce qui protège les données, c'est
// la RLS côté base + l'authentification Supabase Auth (aucun secret partagé dans le navigateur).
// La clé « service_role » (secrète) ne doit JAMAIS apparaître ici : elle reste dans l'Edge Function.
export const CONFIG = Object.freeze({
  projectUrl: 'https://qpszmqkbhrqlycgdkgop.supabase.co',
  publishableKey: 'sb_publishable_xfiru-6nz7xeUBgSVnA52g_SB4KhTgm',
  // Domaine technique des adresses : « abdel » se connecte avec abdel@<emailDomain>. Aucun e-mail n'est envoyé.
  // Doit être identique au secret EMAIL_DOMAIN de l'Edge Function admin-users.
  emailDomain: 'pilotage.invalid',
  adminFunction: 'admin-users'
});

// Nettoyage des anciennes données sensibles laissées par la version précédente dans les navigateurs :
// ancien code d'accès partagé (hm_sb_cfg) et ancienne liste d'utilisateurs avec leurs hash (hm_users).
export function purgeLegacyStorage() {
  try {
    ['hm_sb_cfg', 'hm_users', 'hm_users_dirty'].forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem('pilotage-session');
  } catch (e) { /* stockage indisponible : rien à nettoyer */ }
}
