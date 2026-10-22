export class ExportView {
  constructor() {
    this.name = 'export';
  }

  render() {
    const root = document.getElementById('app-root');
    if (!root) return;

    root.innerHTML = `
      <div class="view" data-view="export">
        <section class="panel-shell" style="margin: 22px;">
          <div class="section-label">Export PDF</div>

          <div class="grid-3">
            <div class="surface-card" style="padding: 18px;">
              <div class="badge badge--info">Quotidien</div>
              <p style="margin-top:12px; color: var(--muted);">Rapport journalier de l’activité et des performances.</p>
            </div>

            <div class="surface-card" style="padding: 18px;">
              <div class="badge badge--warning">Hebdomadaire</div>
              <p style="margin-top:12px; color: var(--muted);">Analyse de la semaine, dépassements et priorités.</p>
            </div>

            <div class="surface-card" style="padding: 18px;">
              <div class="badge badge--success">Mensuel</div>
              <p style="margin-top:12px; color: var(--muted);">Bilan global du mois et recommandations direction.</p>
            </div>
          </div>
        </section>
      </div>
    `;
  }
}
