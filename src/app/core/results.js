import { LEVELS, periodDays, periodKeyForDate } from './periods.js';

// ═══════════════════════════════════════════════════════════════════════
//  MOTEUR DE RÉSULTATS — « moyenne des périodes inférieures + niveau propre »
//
//  Pour une période P de fréquence F (Q < H < M < T < S < A) :
//    • composantes inférieures : pour chaque niveau L < F, on calcule le % de réalisation
//      de CHAQUE sous-période de niveau L écoulée dans P, puis on en fait la MOYENNE ;
//    • composante propre : le % des tâches de fréquence F pour P elle-même ;
//    • Résultat(P) = MOYENNE des composantes disponibles (niveaux sans tâche ignorés).
//
//  Exemple, une semaine : moyenne des % quotidiens  +  % des tâches hebdomadaires  → moyenne des deux.
//  Chaque sous-période n'est comptée qu'UNE fois (pas de double comptage aux frontières).
// ═══════════════════════════════════════════════════════════════════════

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

/**
 * ctx (injecté, donc testable) :
 *   today()                      → 'YYYY-MM-DD'
 *   roles(dateStr)               → rôles évalués à cette date (filtre permanence inclus)
 *   tasks(roleId, freq, dateStr) → tâches de fréquence `freq` applicables à cette date
 *   isDone(roleId, taskId, freq, dateStr) → booléen
 */
export function createEngine(ctx) {
  const rolesOf = (date, roleId) => ctx.roles(date).filter((r) => !roleId || r.id === roleId);

  // % de réalisation des tâches de fréquence `freq` pour la période de `date` (null = aucune tâche)
  function ownStats(freq, date, roleId) {
    let done = 0, total = 0;
    rolesOf(date, roleId).forEach((r) => ctx.tasks(r.id, freq, date).forEach((t) => {
      total++;
      if (ctx.isDone(r.id, t.id, freq, date)) done++;
    }));
    return { done, total, pct: total ? (done / total) * 100 : null };
  }

  function score(freq, ref, { roleId = null } = {}) {
    const today = ctx.today();
    const days = periodDays(freq, ref).filter((d) => d <= today);
    if (!days.length) return { pct: null, components: [], days: [] };

    const components = [];
    LEVELS.slice(0, LEVELS.indexOf(freq)).forEach((level) => {
      // une date représentative par sous-période distincte du niveau `level`
      const seen = new Set(), reps = [];
      days.forEach((d) => { const k = periodKeyForDate(level, d); if (!seen.has(k)) { seen.add(k); reps.push(d); } });
      const subs = reps.map((d) => ownStats(level, d, roleId)).filter((s) => s.total > 0);
      if (subs.length) components.push({ level, pct: mean(subs.map((s) => s.pct)), count: subs.length, kind: 'moyenne' });
    });
    const own = ownStats(freq, days[days.length - 1], roleId);
    if (own.total > 0) components.push({ level: freq, pct: own.pct, done: own.done, total: own.total, kind: 'propre' });

    return { pct: mean(components.map((c) => c.pct)), components, days };
  }

  // Détail jour par jour (pour la semaine / le mois) : % quotidien de chaque jour écoulé
  function dailySeries(freq, ref, opts = {}) {
    const today = ctx.today();
    return periodDays(freq, ref).map((d) => ({
      date: d, future: d > today,
      pct: d > today ? null : ownStats('Q', d, opts.roleId).pct
    }));
  }

  // Plage libre [from, to] : même principe (moyenne par niveau puis moyenne des niveaux).
  // Une sous-période n'est comptée que si au moins la moitié de ses jours est dans la plage
  // (une plage de 3 jours n'embarque donc pas les tâches hebdomadaires d'une semaine entière).
  function scoreRange(from, to, { roleId = null } = {}) {
    const today = ctx.today();
    const end = to > today ? today : to;
    const days = [];
    for (let d = from; d <= end;) {
      days.push(d);
      const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + 1);
      d = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    }
    if (!days.length) return { pct: null, components: [], days: [] };
    const inRange = new Set(days);
    const components = [];
    LEVELS.forEach((level) => {
      const seen = new Map();
      days.forEach((d) => { const k = periodKeyForDate(level, d); if (!seen.has(k)) seen.set(k, d); });
      const subs = [];
      seen.forEach((rep) => {
        if (level !== 'Q') {
          const all = periodDays(level, rep);
          if (all.filter((d) => inRange.has(d)).length / all.length < 0.5) return;
        }
        const st = ownStats(level, rep, roleId);
        if (st.total > 0) subs.push(st);
      });
      if (subs.length) components.push({ level, pct: mean(subs.map((x) => x.pct)), count: subs.length, kind: 'moyenne' });
    });
    return { pct: mean(components.map((c) => c.pct)), components, days };
  }

  return { score, ownStats, dailySeries, scoreRange };
}
