import { useState, useSyncExternalStore } from 'react';
import Auth from './Auth.jsx';
import { subscribeCloud, getCloudSnapshot, syncNow, attachLocalHistory, deleteEverywhere } from '../cloud/runtime.js';
import { getRepository } from '../db/db.js';
import { isSupabaseConfigured } from '../lib/supabaseClient.js';
const labels = { local: 'Local only', pending: 'Changes saved locally — sync pending', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline — changes saved locally', error: 'Sync needs attention' };
export default function Account() {
  const cloud = useSyncExternalStore(subscribeCloud, getCloudSnapshot);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function action(fn) {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function recovery() {
    const rows = await getRepository().recovery();
    const blob = new Blob([JSON.stringify({ owner_id: cloud.session?.user.id, recovery: rows }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'ap-trainer-recovery.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <details className="account-panel">
    <summary>Account · <span role="status">{labels[cloud.state]}</span></summary>
    {!isSupabaseConfigured() && <p>Training is saved on this device. Cloud accounts will be available when this installation is connected.</p>}
    <Auth session={cloud.session} />
    {!cloud.session && <p>You can keep training without an account. Sign in to sync across devices.</p>}
    {cloud.session && <>
      {cloud.lastSync && <p>Last sync: {new Date(cloud.lastSync).toLocaleString()}</p>}
      <button disabled={busy} onClick={() => action(syncNow)}>Sync now</button>
      {cloud.hasLocalHistory && <p>This browser has local-only history. <button disabled={busy} onClick={() => {
        if (confirm(`Attach this browser's local-only history to ${cloud.session.user.email}? It will belong to this account and no longer appear when signed out.`)) action(attachLocalHistory);
      }}>Add local history to this account</button></p>}
      <p>Backups and local cache controls are available in Dashboard.</p>
      <button disabled={busy} onClick={() => {
        if (confirm('Delete your AP Trainer history on every synced device? This cannot be undone. Export a backup first. Unsynced records on other devices will be held for recovery, not uploaded.')) action(deleteEverywhere);
      }}>Delete my history everywhere</button>
      <button disabled={busy} onClick={() => action(recovery)}>Export held recovery records</button>
    </>}
    {(error || cloud.error) && <p role="alert">{error || cloud.error}</p>}
  </details>;
}
