// Configuration Supabase.
// Priorité : localStorage (saisie dans Paramètres) > valeurs par défaut ci-dessous.
// ⚠️ appSecret doit être identique à celui du script supabase-setup.sql.
const STORAGE_KEY = 'hm_sb_cfg';

const DEFAULT_CONFIG = {
  projectUrl: 'https://kipfcdhraasuuksypfyu.supabase.co',
  anonKey: 'sb_publishable__tvkohWyHFGl8Yv9t3G9Uw_2cn-FXH4',
  appSecret: 'Mjn_Tanger08_Med!na#2025'
};

export function loadConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (stored && stored.projectUrl && stored.anonKey) {
      return { ...DEFAULT_CONFIG, ...stored };
    }
  } catch (e) { /* config locale invalide : on utilise les valeurs par défaut */ }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
}
