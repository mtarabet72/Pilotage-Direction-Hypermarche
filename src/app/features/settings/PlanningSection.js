import { store } from '../../core/store.js';
import { saveShared } from '../../core/persist.js';
import { getUsers } from '../../services/auth.js';
import { localDateStr, todayKey } from '../../core/periods.js';
import { MONTHS } from '../../core/periodLabel.js';
import { esc, toast } from '../../core/dom.js';

const SLOTS = [['matin', '🌅 Matin'], ['tranche', '🔄 Tranche'], ['soir', '🌙 Soir']];
const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
let offset = 0;                                   // 0 = mois en cours

const target = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset); return { y: d.getFullYear(), m: d.getMonth() }; };

export function planningSectionHtml() {
  const { y, m } = target(), today = todayKey();
  const users = getUsers().filter((u) => u.active !== false);
  const opts = (sel) => '<option value="">— Non assigné —</option>' + users.map((u) => `<option value="${esc(u.id)}"${u.id === sel ? ' selected' : ''}>${esc(u.name)}</option>`).join('');
  const cell = (slot, e) => `<select data-slot="${slot}" data-field="userId" style="width:100%;margin-bottom:4px;padding:5px;font-size:12px;border:1.5px solid var(--border);border-radius:6px;">${opts(e.userId)}</select>
    <div style="display:flex;gap:4px;align-items:center;"><input type="time" data-slot="${slot}" data-field="heureDebut" value="${esc(e.heureDebut || '')}" title="Début" style="flex:1;padding:5px;border-radius:6px;border:1.5px solid var(--border);font-size:11px;"><span>–</span>
    <input type="time" data-slot="${slot}" data-field="heureFin" value="${esc(e.heureFin || '')}" title="Fin (heure inférieure au début = passage à minuit)" style="flex:1;padding:5px;border-radius:6px;border:1.5px solid var(--border);font-size:11px;"></div>`;
  const rows = Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => {
    const date = localDateStr(new Date(y, m, i + 1)), dow = new Date(y, m, i + 1).getDay(), plan = store.permanencePlanning[date] || {};
    return `<tr data-date="${date}" style="border-bottom:1px solid #f0f2f5;${date === today ? 'background:#fff9e8;' : ''}"><td style="padding:6px 8px;font-weight:700;white-space:nowrap;vertical-align:top;">${DAYS[dow]} ${i + 1}/${m + 1}${date === today ? ' <span style="color:var(--accent)">(aujourd\'hui)</span>' : ''}</td>
      ${SLOTS.map(([s]) => `<td style="padding:6px 8px;vertical-align:top;">${cell(s, plan[s] || {})}</td>`).join('')}</tr>`;
  }).join('');
  return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
    <button type="button" class="user-btn" data-action="plan-prev" aria-label="Mois précédent">‹</button><b>${MONTHS[m]} ${y}</b><button type="button" class="user-btn" data-action="plan-next" aria-label="Mois suivant">›</button>
    <button type="button" class="btn-primary" data-action="plan-save" style="margin-left:auto;">💾 Enregistrer le planning</button></div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">⏰ Heures vides = créneau actif toute la journée (sans badge de ponctualité). Un créneau qui passe minuit (ex. 22:00 → 00:30) s'indique avec une heure de fin inférieure au début.</div>
    <div style="overflow-x:auto;"><table id="plan-table" style="width:100%;border-collapse:collapse;min-width:760px;font-size:12px;"><thead><tr style="text-align:left;border-bottom:2px solid var(--border);"><th style="padding:6px 8px;">Jour</th>${SLOTS.map(([, l]) => `<th style="padding:6px 8px;">${l}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

// Lit le tableau affiché dans le planning en mémoire. Un créneau sans responsable ni horaire est supprimé.
export function collectPlanning() {
  document.querySelectorAll('#plan-table tr[data-date]').forEach((tr) => {
    const date = tr.dataset.date, plan = store.permanencePlanning[date] || {};
    SLOTS.forEach(([slot]) => {
      const e = {};
      tr.querySelectorAll(`[data-slot="${slot}"]`).forEach((i) => { if (i.value) e[i.dataset.field] = i.value; });
      if (Object.keys(e).length) plan[slot] = e; else delete plan[slot];
    });
    if (Object.keys(plan).length) store.permanencePlanning[date] = plan; else delete store.permanencePlanning[date];
  });
}

export async function handlePlanningAction(action, onDone) {
  if (action === 'plan-prev' || action === 'plan-next') { collectPlanning(); offset += action === 'plan-next' ? 1 : -1; return onDone(); }
  if (action === 'plan-save') {
    collectPlanning();
    const res = await saveShared('permanencePlanning');
    document.dispatchEvent(new CustomEvent('pilotage:changed'));
    toast(res.synced ? '✅ Planning de permanence enregistré' : '⚠️ Enregistré sur cet appareil — synchronisation en attente', res.synced ? '#27ae60' : '#e67e22');
  }
}
