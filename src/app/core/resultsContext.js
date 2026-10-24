import { createEngine } from './results.js';
import { getResultRolesForDate, getTasksForResults } from './store.js';
import { historyHas } from './history.js';
import { periodKeyForDate, periodDays, todayKey } from './periods.js';

// Adaptateur entre l'application et le moteur de résultats (injecté → le moteur reste testable seul).
export const resultsContext = {
  today: todayKey,
  roles: getResultRolesForDate,
  // Tâches de fréquence `freq` applicables à la période de `date` ; une tâche ne compte
  // qu'à partir de sa date de création (les nouvelles tâches ne pénalisent pas le passé).
  tasks(rid, freq, date) {
    const days = periodDays(freq, date);
    const end = days[days.length - 1];
    return getTasksForResults(rid).filter((t) => t.freq === freq && (!t.createdAt || String(t.createdAt).slice(0, 10) <= end));
  },
  isDone: (rid, tid, freq, date) => historyHas(rid, tid, periodKeyForDate(freq, date))
};

export const engine = createEngine(resultsContext);
