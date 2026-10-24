import { store } from '../../core/store.js';
import { createEngine } from '../../core/results.js';
import { resultsContext } from '../../core/resultsContext.js';
import { periodDays, periodKeyForDate, fmtDateStr, FREQ_LABELS, FREQ_COLORS, todayKey } from '../../core/periods.js';
import { typeFreq, periodTitle, typeLabel, MONTHS } from '../../core/periodLabel.js';
import { esc } from '../../core/dom.js';

const UNIT = { Q: 'jours', H: 'semaines', M: 'mois', T: 'trimestres', S: 'semestres', A: 'années' };
const OWN = { Q: 'quotidiennes', H: 'hebdomadaires', M: 'mensuelles', T: 'trimestrielles', S: 'semestrielles', A: 'annuelles' };
const DAY = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const color = (p) => (p >= 80 ? '#1a7a40' : p >= 50 ? '#b85c00' : '#c0392b');
const barColor = (p) => (p >= 80 ? '#27ae60' : p >= 50 ? '#f39c12' : '#e74c3c');
const R = (p) => (p === null || p === undefined ? '—' : Math.round(p) + '%');
const safeImg = (u) => (typeof u === 'string' && /^data:image\//.test(u) ? u : '');

// Rôles concernés sur les jours donnés, limités au périmètre choisi (roleIds = null → tout).
export const rolesUnion = (days, roleIds) => {
  const m = new Map();
  days.forEach((d) => resultsContext.roles(d).forEach((r) => { if (!roleIds || roleIds.has(r.id)) m.set(r.id, r); }));
  return [...m.values()];
};

// Dernière note / commentaire saisi pour cette tâche et cette période (tous utilisateurs confondus).
function findNote(rid, tid, periodKey) {
  const suffix = `__${rid}__${tid}__${periodKey}`;
  const hits = Object.entries(store.taskNotes).filter(([k, v]) => v && k.endsWith(suffix)).map(([, v]) => v);
  hits.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return hits[0] || null;
}

// Sous-périodes (une date représentative par période) prises en compte pour un niveau — même règle que le moteur.
function subReps(level, days, custom) {
  const inRange = new Set(days), seen = new Map();
  days.forEach((d) => { const k = periodKeyForDate(level, d); if (!seen.has(k)) seen.set(k, d); });
  return [...seen.values()].filter((rep) => {
    if (!custom || level === 'Q') return true;
    const all = periodDays(level, rep);
    return all.filter((d) => inRange.has(d)).length / all.length >= 0.5;
  });
}

function taskRows(role, res, { freq, ref, custom }) {
  const rows = [];
  if (freq) {                                             // niveau propre : fait / pas fait pour la période elle-même
    const pk = periodKeyForDate(freq, ref);
    resultsContext.tasks(role.id, freq, ref).forEach((t) => rows.push({
      kind: 'own', label: t.label, freq, done: resultsContext.isDone(role.id, t.id, freq, ref), note: t.note, noteObj: findNote(role.id, t.id, pk)
    }));
  }
  res.components.filter((c) => c.kind === 'moyenne').forEach((c) => {   // niveaux inférieurs : n réalisées / N
    const acc = new Map();
    subReps(c.level, res.days, custom).forEach((rep) => {
      if (c.level === 'Q' && !resultsContext.roles(rep).some((r) => r.id === role.id)) return;
      resultsContext.tasks(role.id, c.level, rep).forEach((t) => {
        const a = acc.get(t.id) || { label: t.label, total: 0, done: 0 };
        a.total++; if (resultsContext.isDone(role.id, t.id, c.level, rep)) a.done++;
        acc.set(t.id, a);
      });
    });
    acc.forEach((a) => rows.push({ kind: 'sub', label: a.label, freq: c.level, done: a.done, total: a.total }));
  });
  return rows;
}

export function buildReportModel({ type, ref, from, to, roleIds, options }) {
  const custom = type === 'P', freq = typeFreq(type);
  const eng = createEngine({ ...resultsContext, roles: (d) => resultsContext.roles(d).filter((r) => !roleIds || roleIds.has(r.id)) });
  const res = custom ? eng.scoreRange(from, to) : eng.score(freq, ref);
  const days = res.days.length ? res.days : [ref];
  const today = todayKey();

  let series = null;
  if (freq === 'H' || freq === 'M' || (custom && days.length <= 31)) {
    series = { title: 'Détail journalier', rows: (custom ? days : periodDays(freq, ref)).map((d) => ({
      label: `${DAY[new Date(d + 'T00:00:00').getDay()]} ${fmtDateStr(d).slice(0, 5)}`, pct: d > today ? null : eng.ownStats('Q', d, null).pct, future: d > today
    })) };
  } else if (freq === 'T' || freq === 'S' || freq === 'A') {
    const months = [...new Set(periodDays(freq, ref).map((d) => d.slice(0, 7)))];
    series = { title: 'Détail mensuel', rows: months.map((ym) => ({
      label: MONTHS[+ym.slice(5, 7) - 1], pct: ym + '-01' > today ? null : eng.score('M', ym + '-01').pct, future: ym + '-01' > today
    })) };
  }

  const roles = rolesUnion(days, roleIds).map((r) => {
    const rr = custom ? eng.scoreRange(from, to, { roleId: r.id }) : eng.score(freq, ref, { roleId: r.id });
    return { role: r, res: rr, rows: rr.pct === null ? [] : taskRows(r, rr, { freq, ref, custom }) };
  }).filter((x) => x.res.pct !== null);
  roles.sort((a, b) => a.role.secteur.localeCompare(b.role.secteur) || a.role.label.localeCompare(b.role.label));

  return { type, custom, freq, title: `${typeLabel(type)} — ${periodTitle(type, ref, from, to)}`, res, series, roles, options };
}

const css = `*{box-sizing:border-box;margin:0;padding:0;}
html,body{width:210mm;background:#fff;}
body{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#1a1f2e;padding:12mm 12mm 10mm;}
@page{margin:0;size:A4 portrait;}
.header{background:linear-gradient(135deg,#0a1628,#0d3060);color:#fff;padding:13px 16px;border-radius:6px;margin-bottom:10px;}
.header-top{display:flex;align-items:center;gap:12px;margin-bottom:8px;}
.company-name{font-size:15px;font-weight:900;} .company-addr{font-size:9px;opacity:.7;margin-top:2px;}
.meta-row{display:flex;gap:18px;flex-wrap:wrap;} .meta-label{font-size:8.5px;opacity:.6;} .meta-val{font-size:11px;font-weight:700;}
.org-bar{margin-top:7px;padding:5px 10px;background:rgba(255,255,255,.1);border-radius:4px;font-size:9px;}
.box{padding:10px 14px;background:#f8f9fb;border:1px solid #e2e6ed;border-radius:6px;margin-bottom:12px;}
.kpi{display:flex;align-items:center;gap:16px;margin-bottom:8px;} .kpi-pct{font-size:26px;font-weight:900;font-family:monospace;} .kpi-lbl{font-size:9px;color:#888;}
.bar-bg{background:#e0e4ea;border-radius:5px;height:8px;overflow:hidden;} .bar-fill{height:100%;border-radius:5px;}
.comp{margin:6px 0;} .comp-top{display:flex;justify-content:space-between;font-size:10px;font-weight:700;margin-bottom:2px;} .comp-sub{font-size:8.5px;color:#888;font-weight:400;}
.sec-title{font-size:9.5px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;}
.srow{display:flex;align-items:center;gap:8px;margin:3px 0;font-size:9.5px;} .srow .lbl{width:70px;color:#555;} .srow .bar-bg{flex:1;height:7px;} .srow .v{width:34px;text-align:right;font-weight:700;font-family:monospace;}
.role-block{margin-bottom:12px;border:1px solid #e8eaed;border-radius:5px;overflow:hidden;}
.role-head{display:flex;align-items:center;gap:8px;padding:6px 10px;} .rh-name{font-weight:800;font-size:11.5px;flex:1;} .rh-pct{font-weight:900;font-size:13px;font-family:monospace;}
.rh-comps{font-size:8.5px;color:#888;padding:0 10px 4px;}
table{width:100%;border-collapse:collapse;font-size:10px;} thead tr{background:#f4f6f9;}
th{padding:4px 7px;text-align:left;border-bottom:1px solid #e0e4ea;font-weight:700;font-size:9.5px;color:#555;}
td{padding:4px 7px;vertical-align:top;border-bottom:1px solid #f0f2f5;line-height:1.35;}
tr.odd{background:#fafbfc;}
.chk{display:inline-block;width:13px;height:13px;border-radius:3px;border:1.5px solid #ccc;text-align:center;line-height:11px;color:#fff;font-size:9px;font-weight:700;}
.fbadge{font-size:8.5px;padding:1px 5px;border-radius:5px;font-weight:700;white-space:nowrap;}
.note-cell{color:#888;font-style:italic;font-size:9.5px;}
.report-comment{margin-top:4px;font-size:9.5px;font-style:italic;color:#6c4a85;background:#f7f1fb;border-radius:4px;padding:3px 6px;line-height:1.3;}
.report-attach{margin-top:4px;display:flex;align-items:center;gap:6px;font-size:9px;color:#555;} .report-attach img{max-width:60px;max-height:45px;border-radius:4px;border:1px solid #e0e4ea;}
.no-task{font-size:10px;color:#aaa;padding:5px 10px;}
.footer{margin-top:16px;padding-top:8px;border-top:1px solid #e2e6ed;text-align:center;font-size:8.5px;color:#bbb;}`;

function noteCell(row) {
  let h = row.note ? esc(row.note) : '';
  const n = row.noteObj;
  if (n && n.comment) h += `<div class="report-comment">💬 ${n.userName ? `<strong>${esc(n.userName)} :</strong> ` : ''}${esc(n.comment)}</div>`;
  if (n && n.fileData) {
    const img = safeImg(n.fileData), size = n.fileSize ? Math.round(n.fileSize / 1024) + ' Ko' : '';
    h += `<div class="report-attach">${img ? `<img src="${esc(img)}" alt="">` : ''}<span>📎 ${esc(n.fileName || 'fichier')} ${size}</span></div>`;
  }
  return h;
}

export function reportHtml(model, { company = {}, user = null, isDirector = false, now = new Date() } = {}) {
  const { res, options: o } = model, when = now.toLocaleString('fr-FR');
  const logoSrc = safeImg(company.logo);
  const logo = logoSrc ? `<img src="${esc(logoSrc)}" style="height:44px;border-radius:5px;" alt="Logo">` : '<span style="font-size:26px;">🏬</span>';

  const comps = res.components.map((c) => {
    const [lbl, sub] = c.kind === 'moyenne'
      ? [`Moyenne des ${UNIT[c.level]}`, `${c.count} ${c.count > 1 ? UNIT[c.level] : UNIT[c.level].replace(/s$/, '')}`]
      : [`Tâches ${OWN[c.level]}`, `${c.done}/${c.total} · niveau propre`];
    return `<div class="comp"><div class="comp-top"><span>${lbl} <span class="comp-sub">${sub}</span></span><span style="color:${color(c.pct)}">${R(c.pct)}</span></div>
      <div class="bar-bg"><div class="bar-fill" style="width:${c.pct}%;background:${barColor(c.pct)}"></div></div></div>`;
  }).join('');

  const series = model.series ? `<div class="box" data-break><div class="sec-title">${model.series.title}</div>${model.series.rows.map((r) =>
    `<div class="srow"${r.future ? ' style="opacity:.4"' : ''}><span class="lbl">${esc(r.label)}</span><div class="bar-bg"><div class="bar-fill" style="width:${r.pct ?? 0}%;background:${r.pct === null ? '#ddd' : barColor(r.pct)}"></div></div><span class="v">${R(r.pct)}</span></div>`).join('')}</div>` : '';

  const blocks = model.roles.map(({ role: r, res: rr, rows }) => {
    const shown = rows.filter((t) => {
      const done = t.kind === 'own' ? t.done : t.done === t.total;
      return (done && o.showDone) || (!done && o.showTodo);
    });
    const showNote = o.showNote && shown.some((t) => t.kind === 'own');
    const table = shown.length ? `<table><thead><tr><th style="width:44px;">État</th><th>Tâche</th><th style="width:70px;">Fréq.</th>${showNote ? '<th style="width:32%;">Consigne / commentaire</th>' : ''}</tr></thead><tbody>${shown.map((t, i) => {
      const fc = FREQ_COLORS[t.freq], ok = t.kind === 'own' ? t.done : t.done === t.total;
      const state = t.kind === 'own' ? `<span class="chk" style="background:${ok ? r.color : '#fff'};border-color:${ok ? r.color : '#ccc'}">${ok ? '✓' : ''}</span>`
        : `<strong style="color:${color((t.done / t.total) * 100)}">${t.done}/${t.total}</strong>`;
      return `<tr class="${i % 2 ? 'odd' : ''}"><td>${state}</td><td>${esc(t.label)}</td><td><span class="fbadge" style="background:${fc}18;color:${fc}">${FREQ_LABELS[t.freq]}</span></td>${showNote ? `<td class="note-cell">${t.kind === 'own' ? noteCell(t) : ''}</td>` : ''}</tr>`;
    }).join('')}</tbody></table>` : '<div class="no-task">Aucune tâche à afficher.</div>';
    return `<div class="role-block" data-break><div class="role-head" style="background:${r.light};border-left:4px solid ${r.color};"><span>${r.icon}</span><span class="rh-name" style="color:${r.color};">${esc(r.label)}</span><span class="rh-pct" style="color:${color(rr.pct)}">${R(rr.pct)}</span></div>
      <div class="rh-comps">${rr.components.map((c) => `${FREQ_LABELS[c.level]} ${R(c.pct)}`).join(' · ')}</div>${table}</div>`;
  }).join('');

  const meta = `<div><div class="meta-label">Période</div><div class="meta-val">${esc(model.title)}</div></div>
    <div><div class="meta-label">Généré le</div><div class="meta-val">${esc(when)}</div></div>
    ${company.directorName ? `<div><div class="meta-label">Directeur</div><div class="meta-val">${esc(company.directorName)}${company.directorTitle ? ' — ' + esc(company.directorTitle) : ''}</div></div>` : ''}
    ${!isDirector && user ? `<div><div class="meta-label">Utilisateur</div><div class="meta-val">${esc(user.name)}</div></div>` : ''}`;

  const body = res.pct === null
    ? '<div style="text-align:center;padding:30px;color:#aaa;">Aucune donnée pour cette période.</div>'
    : `<div class="box" data-break><div class="kpi"><div><div class="kpi-pct" style="color:${color(res.pct)}">${R(res.pct)}</div><div class="kpi-lbl">Résultat de la période</div></div></div>
        <div class="sec-title" style="margin-top:6px;">Composantes (moyenne par niveau)</div>${comps}</div>${series}${blocks}`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Rapport — ${esc(model.title)}</title><style>${css}</style></head><body>
<div class="header"><div class="header-top">${logo}<div><div class="company-name">${esc(company.nom || 'RAPPORT DE SUIVI DES TÂCHES')}</div>${company.address ? `<div class="company-addr">${esc(company.address)}</div>` : ''}</div></div>
<div class="meta-row">${meta}</div>${company.orgName ? `<div class="org-bar"><strong>Organisme :</strong> ${esc(company.orgName)}${company.orgRef ? ' (' + esc(company.orgRef) + ')' : ''}</div>` : ''}</div>
${body}
<div class="footer">${esc(company.nom || 'Outil de pilotage opérationnel')} · Rapport généré le ${esc(when)} · Résultat = moyenne des niveaux (jours, semaines, mois…)</div></body></html>`;
}
