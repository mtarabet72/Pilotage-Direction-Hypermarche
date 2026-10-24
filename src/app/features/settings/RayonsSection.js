import { openModal } from '../../components/Modal.js';
import { store } from '../../core/store.js';
import { saveShared } from '../../core/persist.js';
import { RAYONS_STANDARD } from '../../data/rayonsStandard.js';
import { esc, toast } from '../../core/dom.js';

const DEPTS = ['PGC', 'PRODUITS FRAIS', 'BAZAR', 'TEXTILE', 'SERVICES', 'ELECTROMENAGER', 'AUTRE'];
const DEPT_COLORS = { PGC: '#2980b9', 'PRODUITS FRAIS': '#27ae60', BAZAR: '#8e44ad', TEXTILE: '#e67e22', SERVICES: '#16a085', ELECTROMENAGER: '#2c3e50', AUTRE: '#7f8c8d' };
const FREQS = [['Q', '📅 Quotidien'], ['H', '📆 Hebdomadaire'], ['M', '🗓️ Mensuel']];
const RESP = [['employes', '👥 Employés'], ['superviseur', '👁️ Superviseur'], ['chef', '👤 Chef de rayon']];
const TO_ASSIGN = 'À affecter';
const btn = 'padding:5px 12px;font-size:11px;border-radius:6px;cursor:pointer;font-weight:600;';

export function rayonsSectionHtml() {
  const keys = Object.keys(store.rayons).sort((a, b) => (store.rayons[a].numero || 999) - (store.rayons[b].numero || 999));
  const head = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
    <button type="button" class="btn-primary" data-action="rayon-add">➕ Ajouter un rayon</button>
    <button type="button" class="btn-primary" data-action="rayon-import" style="background:#fff;color:#333;">📥 Importer les rayons standards (${RAYONS_STANDARD.length})</button></div>`;
  if (!keys.length) return head + '<div style="text-align:center;padding:28px 20px;color:var(--muted);font-size:13px;background:#f8fafc;border-radius:10px;border:2px dashed var(--border);"><div style="font-size:34px;margin-bottom:8px;">🏪</div><b>Aucun rayon créé</b></div>';
  const byDept = {};
  keys.forEach((k) => { const d = store.rayons[k].departement || 'AUTRE'; (byDept[d] = byDept[d] || []).push(k); });
  return head + Object.keys(byDept).sort().map((d) => {
    const c = DEPT_COLORS[d] || '#7f8c8d';
    return `<div style="margin-bottom:14px;"><div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:${c};display:flex;margin-bottom:6px;"><span style="flex:1">${esc(d)}</span><span style="font-weight:400;color:var(--muted)">${byDept[d].length} rayon${byDept[d].length > 1 ? 's' : ''}</span></div>
      ${byDept[d].map((k) => {
        const r = store.rayons[k], n = (r.taches || []).length, e = r.equipe || {};
        return `<div data-rayon="${esc(k)}" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;border:1px solid var(--border);border-radius:8px;margin-bottom:7px;flex-wrap:wrap;">
          <div style="width:32px;height:32px;border-radius:8px;background:${c}18;display:flex;align-items:center;justify-content:center;">🏪</div>
          <div style="flex:1;min-width:120px;"><div style="font-weight:700;font-size:13px;">${esc(r.nom)} <span style="font-weight:400;font-size:11px;color:var(--muted);">N°${esc(r.numero || '?')}</span></div>
            <div style="display:flex;gap:8px;margin-top:3px;flex-wrap:wrap;font-size:11px;">${e.chef ? `<span style="color:#2980b9">👤 ${esc(e.chef)}</span>` : ''}${e.superviseur ? `<span style="color:#8e44ad">👁️ ${esc(e.superviseur)}</span>` : ''}<span style="color:var(--muted)">📋 ${n} tâche${n !== 1 ? 's' : ''}</span></div></div>
          <div style="display:flex;gap:6px;"><button type="button" data-action="rayon-edit" style="${btn}border:1px solid #2980b9;color:#2980b9;background:#eaf4fb;">✏️</button><button type="button" data-action="rayon-del" style="${btn}border:1px solid #e74c3c;color:#e74c3c;background:#fdf2f2;">🗑️</button></div></div>`;
      }).join('')}</div>`;
  }).join('');
}

const sel = (opts, cur, field) => `<select data-field="${field}" style="padding:5px 8px;font-size:11px;border:1px solid var(--border);border-radius:6px;flex:1;">${opts.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
const taskRow = (t) => `<div class="mr-task" data-id="${esc(t.id || '')}" style="background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
  <div style="display:flex;gap:6px;margin-bottom:6px;"><input type="text" data-field="label" value="${esc(t.label || '')}" maxlength="200" placeholder="Libellé de la tâche *" style="flex:1;padding:7px 10px;font-size:12px;border:1px solid var(--border);border-radius:6px;">
    <button type="button" data-rm style="padding:5px 9px;border:1px solid #e74c3c;color:#e74c3c;background:#fdf2f2;border-radius:6px;cursor:pointer;">✕</button></div>
  <div style="display:flex;gap:6px;">${sel(FREQS, t.freq || 'Q', 'freq')}${sel(RESP, t.responsable || 'employes', 'responsable')}</div></div>`;

function formBody(r) {
  const f = (id, label, val, extra = '') => `<div class="modal-field"${extra}><label>${label}</label><input type="text" id="${id}" value="${esc(val)}" style="width:100%;box-sizing:border-box;"></div>`;
  const e = r.equipe || {};
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
    ${f('mr-nom', 'Nom du rayon *', r.nom || '', ' style="grid-column:1/-1"')}
    <div class="modal-field"><label>Numéro</label><input type="number" id="mr-num" value="${esc(r.numero || '')}" min="1" max="999" style="width:100%;box-sizing:border-box;"></div>
    <div class="modal-field"><label>Département</label><select id="mr-dept" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;">${DEPTS.map((d) => `<option${(r.departement || 'PGC') === d ? ' selected' : ''}>${d}</option>`).join('')}</select></div>
    ${f('mr-chef', 'Chef de rayon', e.chef && e.chef !== TO_ASSIGN ? e.chef : '')}${f('mr-sup', 'Superviseur', e.superviseur && e.superviseur !== TO_ASSIGN ? e.superviseur : '')}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 8px;"><b style="font-size:12px;color:var(--muted);text-transform:uppercase;">📋 Tâches du rayon</b>
      <button type="button" id="mr-add" style="${btn}border:1px solid #2980b9;color:#2980b9;background:#eaf4fb;">+ Ajouter tâche</button></div>
    <div id="mr-tasks">${(r.taches || []).map(taskRow).join('')}</div>`;
}

export function openRayonForm(key, onDone) {
  const r = key ? store.rayons[key] : { taches: [] };
  openModal({
    title: key ? `✏️ Modifier — ${r.nom}` : '➕ Nouveau rayon', bodyHtml: formBody(r), saveLabel: key ? '💾 Enregistrer' : '✅ Créer le rayon',
    onOpen: (root) => {
      const list = root.querySelector('#mr-tasks');
      root.querySelector('#mr-add').addEventListener('click', () => { list.insertAdjacentHTML('beforeend', taskRow({})); list.lastElementChild.querySelector('input').focus(); });
      list.addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) e.target.closest('.mr-task').remove(); });
      root.querySelector('#mr-nom').focus();
    },
    onSave: async (root) => {
      const v = (id) => root.querySelector(id).value.trim();
      const nom = v('#mr-nom'), numero = parseInt(v('#mr-num'), 10) || 0;
      if (!nom) { toast('⚠️ Le nom du rayon est requis', '#e74c3c'); return false; }
      if (numero && Object.entries(store.rayons).some(([k, x]) => x.numero === numero && k !== key)) { toast(`⚠️ Le numéro ${numero} est déjà utilisé`, '#e74c3c'); return false; }
      const taches = [...root.querySelectorAll('.mr-task')].map((row, i) => ({
        id: row.dataset.id || `RT-${Date.now()}-${i}`, label: row.querySelector('[data-field="label"]').value.trim(),
        freq: row.querySelector('[data-field="freq"]').value, responsable: row.querySelector('[data-field="responsable"]').value
      })).filter((t) => t.label);
      const k = key || `${nom.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20)}_${Date.now()}`;
      store.rayons[k] = { nom, numero, departement: v('#mr-dept'), secteur: r.secteur || 'Commercial',
        equipe: { chef: v('#mr-chef') || TO_ASSIGN, superviseur: v('#mr-sup') || TO_ASSIGN, employes: (r.equipe && r.equipe.employes) || [] }, taches };
      const res = await saveShared('rayons');
      toast(res.synced ? (key ? '✅ Rayon modifié' : '✅ Rayon créé') : '⚠️ Enregistré sur cet appareil — synchronisation en attente', res.synced ? '#27ae60' : '#e67e22');
      onDone();
    }
  });
}

export async function handleRayonAction(action, key, onDone) {
  if (action === 'rayon-add') return openRayonForm(null, onDone);
  if (action === 'rayon-edit') return openRayonForm(key, onDone);
  if (action === 'rayon-del') {
    const r = store.rayons[key];
    if (!r || !window.confirm(`Supprimer le rayon « ${r.nom} » ?\n\nToutes ses tâches seront perdues.`)) return;
    delete store.rayons[key];
    if (localStorage.getItem('hm_rayon_actif') === key) localStorage.removeItem('hm_rayon_actif');
    const res = await saveShared('rayons'); toast(res.synced ? '🗑️ Rayon supprimé' : '⚠️ Supprimé localement — synchronisation en attente', res.synced ? '#27ae60' : '#e67e22'); return onDone();
  }
  if (action === 'rayon-import') {
    const have = new Set(Object.values(store.rayons).map((r) => r.numero));
    const todo = RAYONS_STANDARD.filter((r) => !have.has(r.numero));
    if (!todo.length) return toast('ℹ️ Tous les rayons standards existent déjà', '#888');
    if (!window.confirm(`Créer ${todo.length} rayon(s) manquant(s) sur ${RAYONS_STANDARD.length} ?\nLes rayons existants (même numéro) ne sont pas modifiés.`)) return;
    todo.forEach((r) => { store.rayons[`${r.nom.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20)}_${r.numero}`] = { nom: r.nom, numero: r.numero, departement: r.departement, secteur: 'Commercial', equipe: { chef: TO_ASSIGN, superviseur: TO_ASSIGN, employes: [] }, taches: [] }; });
    const res = await saveShared('rayons'); toast(res.synced ? `✅ ${todo.length} rayon(s) créé(s)` : '⚠️ Créés localement — synchronisation en attente', res.synced ? '#27ae60' : '#e67e22'); onDone();
  }
}
