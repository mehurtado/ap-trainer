export default function AppNav({ current, onTraining, onDashboard, onPractice, onSettings, onDetails }) {
  const items = [['training', 'Training', onTraining], ['dashboard', 'Dashboard', onDashboard], ['practice', 'Practice modes', onPractice], ['settings', 'Settings', onSettings], ['map', 'Learning details', onDetails]];
  return <nav className="app-nav" aria-label="Main navigation">{items.filter(([key, , action]) => action || key === current).map(([key, label, action]) => <button type="button" key={key} aria-current={key === current ? 'page' : undefined} onClick={action}>{label}</button>)}</nav>;
}
