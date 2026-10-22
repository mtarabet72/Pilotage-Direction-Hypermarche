export function renderDashboardSummary() {
  return [
    { label: 'Tâches actives', value: '128', delta: '+12% vs semaine précédente', tone: 'up' },
    { label: 'Progression générale', value: '78%', delta: '+4% aujourd’hui', tone: 'up' },
    { label: 'Alertes', value: '9', delta: '3 à traiter', tone: 'down' },
    { label: 'Conformité', value: '96.2%', delta: 'Très bon niveau', tone: 'up' }
  ];
}
