// No React or browser globals: the protocol is tested independently of UI.
export function createSyncEngine(repository, transport, status = () => {}) {
  let running;
  let stopped = false;
  let dirty = false;
  async function reconcileGeneration(generation) {
    const local = await repository.state('generation');
    if ((local != null && local !== generation) || (local == null && generation > 1)) {
      await repository.reset(generation, true);
      return true;
    }
    if (local == null) await repository.setState('generation', generation);
    return false;
  }
  async function pull() {
    let changed = false;
    while (!stopped) {
      let page = await transport.pull(await repository.state('cursor') ?? 0);
      if (stopped) break;
      if (await reconcileGeneration(page.generation)) {
        changed = true;
        page = await transport.pull(0);
        // A second deletion racing this pull is handled on the next iteration.
        if (await reconcileGeneration(page.generation)) continue;
      }
      await repository.applyPage(page.rows, page.cursor, page.generation);
      changed ||= page.rows.length > 0;
      dirty ||= page.rows.length > 0;
      if (!page.more) break;
    }
    return changed;
  }
  async function run() {
    status({ state: 'syncing' });
    try {
      let changed = await pull();
      const errors = [];
      // Quarantined rows remain durable; retry once per run without starving
      // later records. Bounded pages use IDB keys instead of full history scans.
      let after;
      while (!stopped) {
        const batch = await repository.pending(200, after);
        if (!batch.length) break;
        after = batch.at(-1).id;
        const result = await transport.push(await repository.state('generation'), batch);
        if (stopped) break;
        if (result.reset) { await reconcileGeneration(result.generation); break; }
        const accepted = new Set(result.accepted);
        await repository.acknowledge(batch.filter(row => accepted.has(row.token)));
        errors.push(...result.errors);
      }
      if (!stopped) {
        changed = await pull() || changed;
        dirty ||= changed;
        const lastSync = new Date().toISOString();
        await repository.setState('lastSync', lastSync);
        const pending = (await repository.pending(1)).length > 0;
        status({ state: errors.length ? 'error' : pending ? 'pending' : 'synced', lastSync,
          error: errors.length ? `${errors.length} records need attention. They remain saved on this device. ${errors[0].message}` : null });
      }
    } catch (error) {
      if (!stopped) status({ state: 'error', error: error.message });
    } finally {
      if (dirty && !stopped) { dirty = false; repository.changed(); }
    }
  }
  return {
    sync() { if (stopped) return Promise.resolve(); if (!running) running = run().finally(() => { running = null; }); return running; },
    stop() { stopped = true; },
    async deleteHistory(token) {
      if (running) await running;
      const generation = await transport.deleteHistory(token);
      await repository.reset(generation, true);
    }
  };
}
