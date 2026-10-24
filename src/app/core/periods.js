// Clés de période (même format que la v3 pour rester compatible avec les données existantes).
export const FREQ_LABELS = { Q: 'Quotidien', H: 'Hebdomadaire', M: 'Mensuel', T: 'Trimestriel', S: 'Semestriel', A: 'Annuel' };
export const FREQ_COLORS = { Q: '#e74c3c', H: '#f39c12', M: '#27ae60', T: '#8e44ad', S: '#16a085', A: '#2c3e50' };

const pad = (n) => String(n).padStart(2, '0');

// YYYY-MM-DD en heure LOCALE (évite le décalage UTC de toISOString)
export const localDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => localDateStr(new Date());

export function dateKeyMinus(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDateStr(d);
}

const toDate = (s) => new Date(s + 'T00:00:00');

// Numéro de semaine (même formule que la v3 → clés inchangées du lundi au samedi).
// Correction : le DIMANCHE est rattaché à la semaine qui se termine (lundi→dimanche, comme l'affichage),
// et non à la suivante — sinon une tâche hebdomadaire cochée le dimanche tombait dans la semaine d'après.
export function weekKeyForDate(s) {
  const d = toDate(s);
  let ref = d;
  if (d.getDay() === 0) {
    const monday = new Date(d);
    monday.setDate(d.getDate() - 6);
    if (monday.getFullYear() === d.getFullYear()) ref = monday;
  }
  const j = new Date(ref.getFullYear(), 0, 1);
  const w = Math.ceil(((ref - j) / 864e5 + j.getDay() + 1) / 7);
  return `${ref.getFullYear()}-W${pad(w)}`;
}
export const quarterKeyForDate = (s) => `${toDate(s).getFullYear()}-T${Math.ceil((toDate(s).getMonth() + 1) / 3)}`;
export const semesterKeyForDate = (s) => `${toDate(s).getFullYear()}-S${toDate(s).getMonth() < 6 ? 1 : 2}`;
export const yearKeyForDate = (s) => s.slice(0, 4);

export function periodKeyForDate(freq, dateStr) {
  switch (freq) {
    case 'Q': return dateStr;
    case 'H': return weekKeyForDate(dateStr);
    case 'M': return dateStr.slice(0, 7);
    case 'T': return quarterKeyForDate(dateStr);
    case 'S': return semesterKeyForDate(dateStr);
    case 'A': return yearKeyForDate(dateStr);
    default: return dateStr;
  }
}

// Période courante pour une fréquence (monthKey par défaut, comme la v3).
export function periodKey(freq) {
  const t = todayKey();
  return periodKeyForDate(['Q', 'H', 'M', 'T', 'S', 'A'].includes(freq) ? freq : 'M', t);
}

export function fmtDate(d) {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function deadlinePeriodInfo(deadline) {
  if (!deadline) return { emoji: '', label: '' };
  const [h, m] = deadline.split(':').map(Number);
  return h < 12 || (h === 12 && m === 0) ? { emoji: '🌅', label: 'Matin' } : { emoji: '🌙', label: 'Soir' };
}

export function deadlineSortMinutes(d) {
  if (!d) return Infinity;
  const [h, m] = d.split(':').map(Number);
  return Number.isNaN(h) || Number.isNaN(m) ? Infinity : h * 60 + m;
}

// ── Calendrier des périodes (utilisé par les Résultats) ─────
export const LEVELS = ['Q', 'H', 'M', 'T', 'S', 'A'];

const fromDate = (d) => localDateStr(d);
export const daysInMonth = (ym) => {
  const y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(5, 7), 10);
  return Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${ym}-${pad(i + 1)}`);
};

// Lundi → dimanche de la semaine contenant `s`
export function weekDates(s) {
  const d = toDate(s), diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + diff + i); return fromDate(x); });
}

// Tous les jours calendaires de la période (de fréquence `freq`) qui contient `s`.
export function periodDays(freq, s) {
  const y = s.slice(0, 4), mo = toDate(s).getMonth();
  const months = (from, count) => Array.from({ length: count }, (_, i) => `${y}-${pad(from + i + 1)}`).flatMap(daysInMonth);
  switch (freq) {
    case 'Q': return [s];
    case 'H': return weekDates(s);
    case 'M': return daysInMonth(s.slice(0, 7));
    case 'T': return months(Math.floor(mo / 3) * 3, 3);
    case 'S': return months(mo < 6 ? 0 : 6, 6);
    case 'A': return months(0, 12);
    default: return [s];
  }
}

// Décale une date de référence d'une période (n = -1 précédente, +1 suivante).
export function shiftPeriod(freq, s, n) {
  const d = toDate(s);
  if (freq === 'Q') d.setDate(d.getDate() + n);
  else if (freq === 'H') d.setDate(d.getDate() + 7 * n);
  else { const months = { M: 1, T: 3, S: 6, A: 12 }[freq]; d.setDate(1); d.setMonth(d.getMonth() + months * n); }
  return fromDate(d);
}

export const fmtDateStr = (s) => (s ? s.split('-').reverse().join('/') : '');
