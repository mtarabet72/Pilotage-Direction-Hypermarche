// ══════════════════════════════════════════════════════════════
// MAIN.JS — Point d'entrée
// Génération A7 · Marjane Tanger Médina
// ══════════════════════════════════════════════════════════════

import { state, loadStateFromStorage } from './state.js';
import { $, createTabRouter } from './ui.js';
import { TEMPLATES_ALL } from './labelData.js';
import { initA7Form, updatePreview, renderQueue, updateCounters, clearQueue, addToQueue } from './a7.js';
import { generatePDF } from './pdfExport.js';
import { initBaseTab, renderBase } from './base.js';
import { initHistoryTab, renderHistory } from './history.js';
import { initApiKeyModal, translateToArabic, spellCheckFR } from './ai.js';
import { initConfigTab, refreshConfigTab } from './config.js';

async function boot(){
  // 1. Charger les données persistées (IndexedDB + migration localStorage)
  await loadStateFromStorage();
  state.templatesAll = TEMPLATES_ALL; // référence utilisée par findTemplate()

  // 2. Remplir le <select> Template
  const tplSelect = $('#templateInput');
  if(tplSelect){
    TEMPLATES_ALL.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      tplSelect.appendChild(opt);
    });
    tplSelect.addEventListener('change', updatePreview);
  }

  // 3. Câbler le formulaire Saisie + la file d'attente
  initA7Form();
  initBaseTab();
  initHistoryTab();
  initApiKeyModal();
  initConfigTab();
  $('#btnSpellArticle')?.addEventListener('click', () => spellCheckFR('m_desFR', 'm_desAR', 'btnSpellArticle'));
  $('#btnTransArticle')?.addEventListener('click', () => translateToArabic('m_desFR', 'm_desAR', 'btnTransArticle'));
  $('#btnSubmitQueue')?.addEventListener('click', addToQueue);
  $('#btnAddToQueue')?.addEventListener('click', addToQueue);

  // 4. Bouton génération PDF
  $('#btnGeneratePDF')?.addEventListener('click', generatePDF);
  $('#btnClearQueue')?.addEventListener('click', clearQueue);

  // 5. Routeur d'onglets (rail de navigation)
  const tabs = createTabRouter({
    scope: '#app-main',
    defaultTab: 'saisie',
    onEnter: {
      saisie:     () => updatePreview(),
      file:       () => renderQueue(),
      base:       () => renderBase(),
      historique: () => renderHistory(),
      config:     () => refreshConfigTab(),
    },
  });
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => tabs.switchTo(btn.dataset.tab));
  });

  // 6. Compteurs initiaux
  updateCounters();

  console.log('[main] Application initialisée ✓');
}

document.addEventListener('DOMContentLoaded', () => {
  boot().catch(e => console.error('[main] erreur au démarrage:', e));
});
