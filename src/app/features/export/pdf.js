const PAGE_W_PX = 794;                       // A4 à 96 dpi
const MARGIN_MM = 8;                         // marge haute/basse sur chaque page
const PAGE_H_PX = Math.floor(((297 - 2 * MARGIN_MM) / 210) * PAGE_W_PX);
const MAX_CANVAS_PX = 16000;                 // limite sûre des navigateurs pour un canvas

// Positions de coupure : on coupe AVANT un bloc (rôle, section) plutôt qu'au milieu d'une ligne.
// `boundaries` = positions (px) du haut de chaque bloc insécable ; `pageH` = hauteur utile d'une page.
export function computeBreaks(boundaries, total, pageH) {
  const sorted = [...boundaries].sort((a, b) => a - b);
  const breaks = [0];
  let start = 0;
  while (total - start > pageH) {
    const limit = start + pageH;
    let cut = null;
    for (const b of sorted) if (b > start + pageH * 0.25 && b <= limit) cut = b;   // dernier bloc qui tient, pas trop tôt
    if (cut === null) cut = limit;                                                  // bloc plus grand qu'une page : coupe franche
    breaks.push(cut);
    start = cut;
  }
  breaks.push(total);
  return breaks;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function renderPdf(html, filename, onProgress = () => {}) {
  if (typeof window.html2canvas === 'undefined' || !window.jspdf) throw new Error('Bibliothèques PDF indisponibles — utilisez « Imprimer ».');
  const { jsPDF } = window.jspdf;

  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-9999px;top:0;width:${PAGE_W_PX}px;background:#fff;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1a1f2e;z-index:-1`;
  document.body.appendChild(container);
  try {
    onProgress(8, 'Construction du rapport…');
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
    const css = html.match(/<style>([\s\S]*?)<\/style>/i)?.[1] || '';
    container.innerHTML = `<style>${css}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body,html{background:#fff!important}</style>${body}`;
    // Attendre les images (logo, pièces jointes) — au plus 3 s pour ne jamais bloquer la génération.
    await Promise.race([
      Promise.all([...container.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))),
      wait(3000)
    ]);
    await wait(250);

    const total = container.scrollHeight;
    const top = container.getBoundingClientRect().top;
    const boundaries = [...container.querySelectorAll('[data-break]')].map((el) => el.getBoundingClientRect().top - top);
    const breaks = computeBreaks(boundaries, total, PAGE_H_PX);
    const pages = breaks.length - 1;
    const scale = Math.max(1, Math.min(2, MAX_CANVAS_PX / total));
    const perPage = total * scale > MAX_CANVAS_PX;          // très long rapport : une capture par page

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const opts = { useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false, width: PAGE_W_PX, windowWidth: PAGE_W_PX };
    let full = null;
    if (!perPage) { onProgress(20, 'Capture du contenu…'); full = await window.html2canvas(container, { ...opts, scale }); }

    for (let p = 0; p < pages; p++) {
      if (p > 0) pdf.addPage('a4', 'portrait');
      const y0 = breaks[p], h = breaks[p + 1] - y0;
      let slice;
      if (perPage) {
        slice = await window.html2canvas(container, { ...opts, scale: 1.5, y: y0, height: h });
      } else {
        slice = document.createElement('canvas');
        slice.width = full.width; slice.height = Math.round(h * scale);
        slice.getContext('2d').drawImage(full, 0, Math.round(y0 * scale), full.width, slice.height, 0, 0, full.width, slice.height);
      }
      const hMm = (slice.height / slice.width) * 210;
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, MARGIN_MM, 210, hMm, 'p' + p, 'FAST');
      onProgress(25 + Math.round(((p + 1) / pages) * 70), `Page ${p + 1}/${pages}…`);
      await wait(5);
    }
    onProgress(98, 'Enregistrement…');
    pdf.save(filename);
    return pages;
  } finally {
    container.remove();
  }
}
