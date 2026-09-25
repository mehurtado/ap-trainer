import { createRepository } from '../db/repository.js';
import { setRepository, subscribeData, notifyData } from '../db/db.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { createSyncEngine } from './engine.js';
const listeners = new Set();
let snapshot = { state: 'local', session: null, ready: false };
let engine, repository, timer, channel;
const publish = update => { snapshot = { ...snapshot, ...update }; for (const cb of listeners) cb(); };
export const subscribeCloud = cb => { listeners.add(cb); return () => listeners.delete(cb); };
export const getCloudSnapshot = () => snapshot;
const locked = (name, fn) => navigator.locks ? navigator.locks.request(name, fn) : fn();
export function syncNow() {
  if (!engine) return Promise.resolve();
  if (!navigator.onLine) { publish({ state: 'offline' }); return Promise.resolve(); }
  return locked(`ap-sync:${repository.owner}`, () => engine.sync());
}
function schedule() { clearTimeout(timer); timer = setTimeout(syncNow, 1500); }
function transport(supabase, userId) {
  async function rpc(name, args) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user.id !== userId) throw new Error('Account changed. Reload to continue.');
    const { data, error } = await supabase.rpc(name, args).abortSignal(AbortSignal.timeout(30000));
    if (error) throw new Error(error.message);
    return data;
  }
  return {
    pull: cursor => rpc('ap_sync_pull', { after_revision: cursor, page_size: 200 }),
    push: (generation, entries) => rpc('ap_sync_push', { expected_generation: generation, entries }),
    deleteHistory: token => rpc('ap_sync_delete_history', { request_token: token })
  };
}
export async function initializeCloud() {
  const client = getSupabaseClient();
  let session = null;
  if (client && !navigator.onLine && localStorage.getItem('ap-active-account')) {
    session = { user: JSON.parse(localStorage.getItem('ap-active-account')) };
  } else if (client) {
    const result = await client.auth.getSession();
    if (result.error) throw result.error;
    session = result.data.session;
  }
  if (session) localStorage.setItem('ap-active-account', JSON.stringify({ id: session.user.id, email: session.user.email }));
  else localStorage.removeItem('ap-active-account');
  const archives = [];
  let localName = 'ap-trainer';
  for (let i = 0; ; i++) {
    const candidate = createRepository(localName);
    if (!await candidate.state('claimedBy')) { await candidate.close(); break; }
    archives.push(candidate);
    localName = `ap-trainer:local:${i + 1}`;
  }
  const name = session ? `ap-trainer:${session.user.id}` : localName;
  channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('ap-history-changes');
  if (channel) channel.onmessage = ({ data }) => {
    if (data.name !== name) return;
    if (data.type === 'reset') { publish({ ready: false }); location.reload(); }
    else { notifyData('pull'); if (data.type === 'write') schedule(); }
  };
  repository = createRepository(name, session?.user.id ?? null, type => {
    notifyData(type);
    channel?.postMessage({ name, type });
  });
  setRepository(repository);
  let device = localStorage.getItem('ap-device-id');
  if (!device) { device = crypto.randomUUID(); localStorage.setItem('ap-device-id', device); }
  await repository.setState('device', device);
  await repository.initialize();
  publish({ session, ready: true, state: session ? 'offline' : 'local', lastSync: await repository.state('lastSync') });
  if (client) {
    client.auth.onAuthStateChange((_event, next) => {
      if ((next?.user.id ?? null) !== (session?.user.id ?? null)) {
        if (next) localStorage.setItem('ap-active-account', JSON.stringify({ id: next.user.id, email: next.user.email }));
        else localStorage.removeItem('ap-active-account');
        engine?.stop();
        publish({ ready: false });
        setTimeout(() => location.reload(), 0);
      }
    });
  }
  if (session) {
    engine = createSyncEngine(repository, transport(client, session.user.id), update => publish({ ...update, state: navigator.onLine ? update.state : 'offline' }));
    subscribeData(type => { if (type === 'write') schedule(); if (type === 'reset') location.reload(); });
    window.addEventListener('online', syncNow);
    window.addEventListener('offline', () => publish({ state: 'offline' }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
    setInterval(syncNow, 60000);
    await syncNow();
    for (const source of archives) {
      if (await source.state('claimedBy') === session.user.id && !await source.state('attachmentComplete')) await attachSource(source);
    }
    const source = createRepository(localName);
    const available = !await source.state('claimedBy') && ((await source.count('trials')) + (await source.count('ambient')) > 0);
    await source.close();
    publish({ hasLocalHistory: available, localName });
    await syncNow();
  }
  for (const archive of archives) await archive.close();
}
async function attachSource(source) {
  const generation = await repository.state('generation');
  if (generation == null) throw new Error('Connect and sync this account before attaching local history. Your local history is still preserved.');
  const originalGeneration = await source.state('attachmentGeneration');
  if (originalGeneration != null && originalGeneration !== generation) {
    await source.setState('attachmentComplete', true);
    publish({ error: 'An interrupted attachment predates a cloud history deletion. Its source archive was retained and was not uploaded again.' });
    return;
  }
  await source.setState('attachmentGeneration', generation);
  await source.initialize();
  let selected = await source.state('attachmentEpoch');
  if (!selected) {
    const sourceEpoch = await source.getMeta('curriculumEpoch');
    const existingEpoch = await repository.getMeta('curriculumEpoch');
    selected = { value: await repository.count('trials') ? existingEpoch : sourceEpoch };
    await source.setState('attachmentEpoch', selected);
  }
  await source.copyInto(repository);
  if (selected.value) await repository.setMeta('curriculumEpoch', selected.value);
  await source.setState('attachmentComplete', true);
  notifyData('pull');
}
export async function attachLocalHistory() {
  if (!repository.owner) return;
  await locked('ap-history-attachment', async () => {
    const source = createRepository(snapshot.localName);
    const claimant = await source.state('claimedBy');
    if (claimant && claimant !== repository.owner) throw new Error('This local history is already attached to another account.');
    if (await repository.state('generation') == null) throw new Error('Connect and sync this account before attaching local history.');
    await source.setState('claimedBy', repository.owner);
    channel?.postMessage({ name: source.name, type: 'reset' });
    await attachSource(source);
    publish({ hasLocalHistory: false });
  });
  await syncNow();
}
export async function deleteEverywhere() {
  if (!engine) return;
  await locked(`ap-sync:${repository.owner}`, async () => {
    const token = await repository.state('deleteToken') ?? crypto.randomUUID();
    await repository.setState('deleteToken', token);
    await engine.deleteHistory(token);
    await repository.setState('deleteToken', null);
  });
  await syncNow();
}
