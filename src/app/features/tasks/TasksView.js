export class TasksView {
  constructor() {
    this.name = 'tasks';
  }

  render() {
    const root = document.getElementById('app-root');
    if (!root) return;

    root.innerHTML = `
      <div class="view" data-view="tasks">
        <section class="panel-shell" style="margin: 22px;">
          <div class="section-label">Suivi des tâches</div>

          <div class="grid-2" style="margin-top: 16px;">
            <div class="surface-card" style="padding: 18px;">
              <h3 style="margin:0 0 12px;">Fonctions</h3>
              <div class="badge badge--primary" style="margin-bottom:8px;">Commercial</div>
              <div class="badge badge--info" style="margin-bottom:8px;">Services</div>
              <div class="badge badge--success">Permanence</div>
            </div>

            <div class="surface-card" style="padding: 18px;">
              <h3 style="margin:0 0 12px;">Progression</h3>
              <div id="progress-bar-wrap" style="height: 10px; margin-bottom: 10px;">
                <div id="progress-bar" style="width: 72%; height:100%;"></div>
              </div>
              <div style="color: var(--muted); font-size: 12px;">72% des tâches du jour validées</div>
            </div>
          </div>
        </section>
      </div>
    `;
  }
}
