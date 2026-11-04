import { openModal } from '../../components/Modal.js';
import { store } from '../../core/store.js';
import { saveShared, saveCustomTasks } from '../../core/persist.js';
import { esc, toast, safeColor, safeIcon } from '../../core/dom.js';

// Fonctions (rôles) créées par le Directeur : chacune a sa propre checklist de tâches.
// Les tâches s'ajoutent ensuite dans l'onglet Tâches, comme pour les fonctions existantes.
const SECTEURS = ['Commercial', 'Services'];
const btn = 'padding:5px 12px;font-size:11px;border-radius:6px;cursor:pointer;font-weight:600;';
const clean = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#555555');
const list = () => (Array.isArray(store.customRoles) ? store.customRoles : []);

export function fonctionsSectionHtml() {
  const head = `<div style="margin-bottom:12px;"><button type="button" class="btn-primary" data-action="fonction-add">➕ Ajouter une fonction</button></div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:12px;">Une fonction est un poste avec sa propre checklist (ex. Qualité, Décoration, Adjoint de direction). Créez-la ici, puis ajoutez ses tâches dans l'onglet Tâches et donnez-la aux utilisateurs concernés (Paramètres → Utilisateurs).</div>`;
  if (!list().length) return head + '<div style="text-align:center;padding:22px 20px;color:var(--muted);font-size:13px;background:#f8fafc;border-radius:10px;border:2px dashed var(--border);"><div style="font-size:30px;margin-bottom:8px;">🧩</div><b>Aucune fonction ajoutée</b></div>';
  return head + list().map((r) => {
    const c = safeColor(r.color, '#555555');
    const n = ((store.customTasks || {})[r.id] || []).length;
    return `<div data-fonction="${esc(r.id)}" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;border:1px solid var(--border);border-left:4px solid ${c};border-radius:8px;margin-bottom:7px;flex-wrap:wrap;">
      <div style="font-size:22px;">${esc(safeIcon(r.icon))}</div>
      <div style="flex:1;min-width:120px;"><div style="font-weight:700;font-size:13px;">${esc(r.label)}</div>
        <div style="font-size:11px;color:var(--muted);">${esc(r.secteur)}${r.sous ? ' · ' + esc(r.sous) : ''} · 📋 ${n} tâche${n !== 1 ? 's' : ''}</div></div>
      <div style="display:flex;gap:6px;"><button type="button" data-action="fonction-edit" style="${btn}border:1px solid #2980b9;color:#2980b9;background:#eaf4fb;">✏️</button><button type="button" data-action="fonction-del" style="${btn}border:1px solid #e74c3c;color:#e74c3c;background:#fdf2f2;">🗑️</button></div></div>`;
  }).join('');
}

const formBody = (r) => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
  <div class="modal-field" style="grid-column:1/-1"><label>Nom de la fonction *</label><input type="text" id="fn-nom" maxlength="60" value="${esc(r.label || '')}" placeholder="Ex. Responsable Qualité" style="width:100%;box-sizing:border-box;"></div>
  <div class="modal-field" style="grid-column:1/-1"><label>Description courte</label><input type="text" id="fn-sous" maxlength="60" value="${esc(r.sous || '')}" placeholder="Ex. Hygiène & conformité" style="width:100%;box-sizing:border-box;"></div>
  <div class="modal-field"><label>Secteur</label><select id="fn-secteur" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;">${SECTEURS.map((s) => `<option${(r.secteur || 'Services') === s ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
  <div class="modal-field"><label>Icône (un emoji)</label><input type="text" id="fn-icon" maxlength="4" value="${esc(r.icon || '📋')}" style="width:100%;box-sizing:border-box;"></div>
  <div class="modal-field"><label>Couleur</label><input type="color" id="fn-color" value="${esc(hex(safeColor(r.color, '#2980b9')))}" style="width:100%;height:38px;"></div></div>`;

function openForm(id, onDone) {
  const r = id ? list().find((x) => x.id === id) : {};
  if (id && !r) return;
  openModal({
    title: id ? `✏️ Modifier — ${r.label}` : '➕ Nouvelle fonction', bodyHtml: formBody(r), saveLabel: id ? '💾 Enregistrer' : '✅ Créer la fonction',
    onOpen: (root) => root.querySelector('#fn-nom').focus(),
    onSave: async (root) => {
      const v = (s) => root.querySelector(s).value;
      const label = clean(v('#fn-nom'), 60);
      if (!label) { toast('⚠️ Le nom de la fonction est requis', '#e74c3c'); return false; }
      if ([...list()].some((x) => x.id !== id && String(x.label).toLowerCase() === label.toLowerCase())) { toast('⚠️ Cette fonction existe déjà', '#e74c3c'); return false; }
      const color = hex(v('#fn-color'));
      const data = { label, sous: clean(v('#fn-sous'), 60), secteur: SECTEURS.includes(v('#fn-secteur')) ? v('#fn-secteur') : 'Services', icon: safeIcon(v('#fn-icon')), color, light: color + '1a' };
      if (id) Object.assign(r, data);
      else store.customRoles = [...list(), { id: `fn_${Date.now().toString(36)}`, ...data, gere: [], rayons: [], taches: [] }];
      const res = await saveShared('customRoles');
      toast(res.synced ? (id ? '✅ Fonction modifiée' : '✅ Fonction créée') : '⚠️ Enregistré sur cet appareil — synchronisation en attente', res.synced ? '#27ae60' : '#e67e22');
      onDone();
    }
  });
}

export async function handleFonctionAction(action, id, onDone) {
  if (action === 'fonction-add') return openForm(null, onDone);
  if (action === 'fonction-edit') return openForm(id, onDone);
  if (action === 'fonction-del') {
    const r = list().find((x) => x.id === id);
    if (!r || !window.confirm(`Supprimer la fonction « ${r.label} » ?\n\nSes tâches seront perdues et elle disparaîtra de la liste des utilisateurs.`)) return;
    store.customRoles = list().filter((x) => x.id !== id);
    if (store.customTasks && store.customTasks[id]) { delete store.customTasks[id]; await saveCustomTasks(); }
    const res = await saveShared('customRoles');
    toast(res.synced ? '🗑️ Fonction supprimée' : '⚠️ Supprimée localement — synchronisation en attente', res.synced ? '#27ae60' : '#e67e22');
    onDone();
  }
}
