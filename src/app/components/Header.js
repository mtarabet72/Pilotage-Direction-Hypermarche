export function renderHeader() {
  return `
    <header id="app-header">
      <div class="hdr-top">
        <div class="hdr-logo-text">🏬</div>
        <div style="flex:1;">
          <div class="hdr-title">PILOTAGE OPÉRATIONNEL — DIRECTION HYPERMARCHÉ</div>
          <div class="hdr-sub">Suivi des tâches · Dashboard global</div>
        </div>
        <div class="hdr-user-badge" data-theme-toggle>
          <span class="hdr-user-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#27ae60;"></span>
          <span>Direction</span>
          <span>▾</span>
        </div>
      </div>

      <nav class="hdr-tabs" aria-label="Navigation principale">
        <button class="hdr-tab active" type="button" data-view-switch="dashboard">📊 Dashboard</button>
        <button class="hdr-tab" type="button" data-view-switch="tasks">✅ Suivi Tâches</button>
        <button class="hdr-tab" type="button" data-view-switch="results">📈 Résultats</button>
        <button class="hdr-tab" type="button" data-view-switch="export">📄 Export PDF</button>
        <button class="hdr-tab" type="button" data-view-switch="settings">⚙️ Paramètres</button>
      </nav>
    </header>
  `;
}
