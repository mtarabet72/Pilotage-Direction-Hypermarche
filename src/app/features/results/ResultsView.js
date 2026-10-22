export class ResultsView {
  constructor() {
    this.name = 'results';
  }

  render() {
    const root = document.getElementById('app-root');
    if (!root) return;

    root.innerHTML = `
      <div class="view" data-view="results">
        <section class="panel-shell" style="margin: 22px;">
          <div class="section-label">Résultats</div>

          <div class="res-stat-grid">
            <article class="kpi-card">
              <span class="kpi-card__value">84%</span>
              <div class="kpi-card__label">Taux de réalisation</div>
            </article>
            <article class="kpi-card">
              <span class="kpi-card__value">1.42M</span>
              <div class="kpi-card__label">Chiffre d'affaires</div>
            </article>
            <article class="kpi-card">
              <span class="kpi-card__value">28</span>
              <div class="kpi-card__label">Indicateurs validés</div>
            </article>
          </div>
        </section>
      </div>
    `;
  }
}
