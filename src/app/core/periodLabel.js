import { fmtDate, fmtDateStr, periodDays, periodKeyForDate } from './periods.js';

// [clé, niveau du moteur, libellé]
export const TYPES = [
  ['J', 'Q', 'Jour'], ['H', 'H', 'Semaine'], ['M', 'M', 'Mois'],
  ['T', 'T', 'Trimestre'], ['S', 'S', 'Semestre'], ['A', 'A', 'Année'], ['P', null, 'Période libre']
];
export const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
export const typeFreq = (type) => TYPES.find((t) => t[0] === type)[1];
export const typeLabel = (type) => TYPES.find((t) => t[0] === type)[2];

export function periodTitle(type, ref, from, to) {
  const f = typeFreq(type), d = new Date(ref + 'T00:00:00');
  if (type === 'P') return `Du ${fmtDateStr(from)} au ${fmtDateStr(to)}`;
  if (f === 'Q') return fmtDate(d);
  if (f === 'H') { const w = periodDays('H', ref); return `n°${periodKeyForDate('H', ref).split('-W')[1]} · du ${fmtDateStr(w[0])} au ${fmtDateStr(w[6])}`; }
  if (f === 'M') return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (f === 'T' || f === 'S') return periodKeyForDate(f, ref).split('-').reverse().join(' ');
  return String(d.getFullYear());
}
