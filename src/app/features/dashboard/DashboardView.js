export class DashboardView {
  constructor() {
    this.name = 'dashboard';
  }

  render() {
    const root = document.getElementById('app-root');
    if (!root) return;

    root.innerHTML = `
      <div class="view active" data-view="dashboard">
        <section class="panel-shell" style="margin: 22px;">
          <div class="section-label">Dashboard</div>
          <div class="dash-period-row" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;">
            <button class="btn btn--secondary" type="button">Aujourd'hui</button>
            <button class="btn btn--secondary" type="button">Cette semaine</button>
            <button class="btn btn--secondary" type="button">Ce mois</button>
            <button class="btn btn--secondary" type="button">Ce trimestre</button>
          </div>

          <div class="kpi-grid">
            <article class="kpi-card">
              <span class="kpi-card__value">128</span>
              <div class="kpi-card__label">Tâches actives</div>
              <div class="kpi-card__delta kpi-card__delta--up">+12% vs semaine précédente</div>
            </article>

            <article class="kpi-card">
              <span class="kpi-card__value">78%</span>
              <div class="kpi-card__label">Progression générale</div>
              <div class="kpi-card__delta kpi-card__delta--up">+4% aujourd'hui</div>
            </article>

            <article class="kpi-card">
              <span class="kpi-card__value">9</span>
              <div class="kpi-card__label">Alertes</div>
              <div class="kpi-card__delta kpi-card__delta--down">3 à traiter</div>
            </article>

            <article class="kpi-card">
              <span class="kpi-card__value">96.2%</span>
              <div class="kpi-card__label">Conformité</div>
              <div class="kpi-card__delta kpi-card__delta--up">Très bon niveau</div>
            </article>
          </div>
        </section>
      </div>
    `;
  }
}
