export class SettingsView {
  constructor() {
    this.name = 'settings';
  }

  render() {
    const root = document.getElementById('app-root');
    if (!root) return;

    root.innerHTML = `
      <div class="view" data-view="settings">
        <section class="panel-shell" style="margin: 22px;">
          <div class="section-label">Paramètres</div>
          <div class="grid-2">
            <div class="surface-card" style="padding: 18px;">
              <h3 style="margin:0 0 12px;">Identité de la société</h3>
              <div class="badge badge--primary">Entreprise</div>
            </div>

            <div class="surface-card" style="padding: 18px;">
              <h3 style="margin:0 0 12px;">Système de pilotage</h3>
              <div class="badge badge--success">Live</div>
            </div>
          </div>
        </section>
      </div>
    `;
  }
}
