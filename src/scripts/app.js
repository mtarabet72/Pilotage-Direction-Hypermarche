body {
  min-height: 100vh;
}

#app-header {
  background: linear-gradient(135deg, #0a1628 0%, #102244 60%, #0d3060 100%);
  padding: 14px 20px 0;
  position: sticky;
  top: 0;
  z-index: 200;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}

.hdr-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.hdr-logo-text {
  font-size: 32px;
}

.hdr-title {
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: #fff;
}

.hdr-sub {
  font-size: 10px;
  opacity: 0.72;
  color: rgba(255, 255, 255, 0.8);
}

.hdr-user-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.hdr-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.hdr-tab {
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
  border-radius: 10px 10px 0 0;
  padding: 10px 14px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.hdr-tab.active {
  background: var(--color-primary);
  color: #fff;
}

.hdr-tab:hover:not(.active) {
  background: rgba(255, 255, 255, 0.15);
}

.view {
  display: none;
  animation: fadeIn 0.2s ease;
}

.view.active {
  display: block;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

#view-dashboard,
#view-results,
#view-export,
#view-settings {
  padding: 22px;
}

.summary-row,
.res-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
}

.sum-card,
.res-stat,
.export-card,
.settings-card,
.res-card,
.role-card,
.user-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  box-shadow: var(--shadow-soft);
}

.sum-card {
  padding: 18px 16px;
}

.sc-val {
  font-size: 28px;
  font-family: var(--font-mono);
  font-weight: 900;
  line-height: 1;
}

.sc-label,
.sc-sub {
  color: var(--color-muted);
  font-size: 11px;
}

.role-card {
  border-left: 4px solid var(--card-accent, var(--color-primary));
  padding: 14px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.role-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card);
}

.rc-bar-wrap,
.rb-bar-wrap,
#progress-bar-wrap {
  background: #edf2f7;
  border-radius: 999px;
  overflow: hidden;
}

.rc-bar,
.rb-bar,
#progress-bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
}

.freq-btn,
.period-btn,
.type-btn,
.scope-btn {
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  transition: all 0.2s ease;
}

.freq-btn:hover,
.period-btn:hover,
.type-btn:hover,
.scope-btn:hover {
  border-color: rgba(230, 57, 80, 0.3);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.05);
}

.period-btn.active,
.freq-btn.active,
.type-btn.active,
.scope-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

#task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-item {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: var(--shadow-soft);
  padding: 12px 14px;
}

.task-item.done-item {
  opacity: 0.8;
}

.task-label {
  font-weight: 700;
}

.done-item .task-label {
  text-decoration: line-through;
  color: var(--color-muted);
}

.btn-primary,
.btn-danger,
.btn-export,
#add-btn,
.modal-save {
  border: none;
  color: #fff;
  font-weight: 800;
  border-radius: 10px;
  padding: 10px 18px;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-strong));
  box-shadow: 0 10px 20px rgba(230, 57, 80, 0.16);
}

.btn-secondary,
.modal-cancel,
.af-cancel {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px 18px;
}

@media (max-width: 640px) {
  #view-dashboard,
  #view-results,
  #view-export,
  #view-settings {
    padding: 14px;
  }

  #app-header {
    padding-left: 14px;
    padding-right: 14px;
  }
}
