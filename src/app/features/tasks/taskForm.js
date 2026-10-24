import { openModal } from '../../components/Modal.js';
import { getUsers, getCurrentUser, isDirector } from '../../services/auth.js';
import { store } from '../../core/store.js';
import { saveCustomTasks } from '../../core/persist.js';
import { TASKS_LIBRARY } from '../../data/tasksLibrary.js';
import { FREQ_LABELS } from '../../core/periods.js';
import { esc, toast } from '../../core/dom.js';

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const LIB_LABELS = { direction: 'Direction / Encadrement' };

const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;

function noteFor(freq, deadline, jours, datesMois) {
  const when = deadline ? ` — avant ${deadline.replace(':00', 'h')}` : '';
  if (freq === 'Q') return deadline ? `⏰ Avant ${deadline.replace(':00', 'h')}` : '';
  if (freq === 'H') return `📅 ${jours.length ? jours.join(', ') : 'Tous les jours'}${when}`;
  if (freq === 'M') return `🗓️ ${datesMois.length ? datesMois.join(', ') : 'À définir'}${when}`;
  return { T: '📊 Trimestriel', S: '🔶 Semestriel', A: '📅 Annuel' }[freq] || '';
}

function formHtml(t, isEdit) {
  const me = getCurrentUser();
  const users = getUsers().filter((u) => u.active !== false && u.id !== me?.id);
  const dl = t.deadline || '';
  const preset = dl === '12:00' ? 'MATIN' : dl === '22:00' ? 'SOIR' : dl ? 'PERSO' : 'AUCUNE';
  const libCats = Object.keys(TASKS_LIBRARY);
  return `
    ${isEdit ? '' : `<div class="hm-field"><label>Choisir dans la bibliothèque (optionnel)</label>
      <div class="hm-row"><select id="tf-lib-cat"><option value="">Catégorie…</option>${libCats.map((c) => opt(c, LIB_LABELS[c] || c)).join('')}</select>
      <select id="tf-lib-task"><option value="">Tâche…</option></select></div></div>`}
    <div class="hm-field"><label for="tf-label">Libellé</label><input type="text" id="tf-label" maxlength="200" value="${esc(t.label || '')}" placeholder="Libellé de la tâche"></div>
    <div class="hm-row">
      <div class="hm-field"><label for="tf-freq">Fréquence</label><select id="tf-freq">${Object.entries(FREQ_LABELS).map(([k, v]) => opt(k, v, (t.freq || 'Q') === k)).join('')}</select></div>
      <div class="hm-field"><label for="tf-assignee">Assignée à</label><select id="tf-assignee">${opt('', 'Tous', !t.assignedTo)}${users.map((u) => opt(u.id, `${u.name} (@${u.username})`, t.assignedTo === u.id)).join('')}</select></div>
    </div>
    <div class="hm-row" id="tf-deadline-row">
      <div class="hm-field"><label for="tf-preset">Avant</label><select id="tf-preset">${opt('AUCUNE', 'Aucune heure', preset === 'AUCUNE')}${opt('MATIN', 'Matin (12h)', preset === 'MATIN')}${opt('SOIR', 'Soir (22h)', preset === 'SOIR')}${opt('PERSO', 'Heure précise', preset === 'PERSO')}</select></div>
      <div class="hm-field"><label for="tf-time">Heure</label><input type="time" id="tf-time" value="${esc(dl)}"></div>
    </div>
    <div class="hm-field" id="tf-days-wrap"><label>Jours (hebdomadaire)</label><div class="hm-days">${DAYS.map((d) => `<label><input type="checkbox" class="tf-day" value="${d}"${(t.jours || []).includes(d) ? ' checked' : ''}>${d}</label>`).join('')}</div></div>
    <div class="hm-field" id="tf-dates-wrap"><label for="tf-dates">Jours du mois (mensuel, ex : 1, 15)</label><input type="text" id="tf-dates" value="${esc((t.datesMois || []).join(', '))}"></div>
    <div class="hm-field"><label for="tf-note">Note / description (optionnel)</label><input type="text" id="tf-note" maxlength="200" value="${esc(isEdit ? t.note || '' : '')}"></div>`;
}

function wire(root) {
  const $r = (s) => root.querySelector(s);
  const sync = () => {
    const f = $r('#tf-freq').value, p = $r('#tf-preset').value;
    $r('#tf-deadline-row').style.display = ['Q', 'H', 'M'].includes(f) ? '' : 'none';
    $r('#tf-days-wrap').style.display = f === 'H' ? '' : 'none';
    $r('#tf-dates-wrap').style.display = f === 'M' ? '' : 'none';
    $r('#tf-time').disabled = p !== 'PERSO';
    if (p === 'MATIN') $r('#tf-time').value = '12:00';
    if (p === 'SOIR') $r('#tf-time').value = '22:00';
    if (p === 'AUCUNE') $r('#tf-time').value = '';
  };
  $r('#tf-freq').addEventListener('change', sync);
  $r('#tf-preset').addEventListener('change', sync);
  const cat = $r('#tf-lib-cat'), lib = $r('#tf-lib-task');
  if (cat) {
    cat.addEventListener('change', () => {
      const items = TASKS_LIBRARY[cat.value] || [];
      lib.innerHTML = '<option value="">Tâche…</option>' + items.map((i) => opt(i.id, `${i.label} (${FREQ_LABELS[i.freq] || i.freq})`)).join('');
    });
    lib.addEventListener('change', () => {
      const it = (TASKS_LIBRARY[cat.value] || []).find((i) => i.id === lib.value);
      if (!it) return;
      $r('#tf-label').value = it.label; $r('#tf-freq').value = it.freq; $r('#tf-note').value = it.note || '';
      sync();
    });
  }
  sync();
  $r('#tf-label').focus();
}

// roleId : fonction concernée ; taskId : fourni pour modifier une tâche personnalisée existante.
export function openTaskForm(roleId, taskId = null, onDone = () => {}) {
  if (!isDirector()) return toast('Accès réservé au Directeur', '#e74c3c');
  const list = store.customTasks[roleId] || [];
  const existing = taskId ? list.find((x) => x.id === taskId) : null;
  openModal({
    title: existing ? '✏️ Modifier la tâche' : '➕ Nouvelle tâche',
    bodyHtml: formHtml(existing || {}, !!existing),
    saveLabel: existing ? 'Mettre à jour' : 'Enregistrer la tâche',
    onOpen: wire,
    onSave: async (root) => {
      const v = (s) => root.querySelector(s).value.trim();
      const label = v('#tf-label');
      if (!label) { toast('Le libellé est requis', '#e74c3c'); return false; }
      const freq = v('#tf-freq');
      const hasTime = ['Q', 'H', 'M'].includes(freq);
      const deadline = hasTime && /^\d{2}:\d{2}$/.test(v('#tf-time')) ? v('#tf-time') : '';
      const jours = freq === 'H' ? [...root.querySelectorAll('.tf-day:checked')].map((c) => c.value) : [];
      const datesMois = freq === 'M'
        ? v('#tf-dates').split(',').map((d) => parseInt(d, 10)).filter((d) => d >= 1 && d <= 31).map(String) : [];
      const note = v('#tf-note') || noteFor(freq, deadline, jours, datesMois);
      const assignedTo = v('#tf-assignee') || null;

      if (!store.customTasks[roleId]) store.customTasks[roleId] = [];
      if (existing) {
        const i = store.customTasks[roleId].findIndex((x) => x.id === existing.id);
        store.customTasks[roleId][i] = { ...existing, label, freq, note, deadline, jours, datesMois, assignedTo };
      } else {
        store.customTasks[roleId].push({
          id: 'c_' + Date.now(), label, freq, note, deadline, jours, datesMois, assignedTo,
          createdBy: getCurrentUser().id, createdAt: new Date().toISOString()
        });
      }
      const res = await saveCustomTasks();
      toast(res.synced ? (existing ? '✅ Tâche mise à jour' : '✅ Tâche créée') : '⚠️ Enregistrée sur cet appareil — synchronisation en attente', res.synced ? '#27ae60' : '#e67e22');
      onDone();
    }
  });
}
