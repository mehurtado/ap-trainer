import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { createRepository } from './repository.js';
const id=()=>crypto.randomUUID();
const repo=()=>createRepository(id(),id());
test('offline write, reopen, stable logical UUID and atomic pending upload',async()=>{
  const r=repo(),trial=await r.write('trials',{timestamp:'2020-01-01',nested:{a:[1,2]}});
  assert.match(trial.id,/^[0-9a-f-]{36}$/);
  await r.close(); const reopened=createRepository(r.name,r.owner);
  assert.deepEqual((await reopened.records('trials'))[0],trial);
  assert.equal((await reopened.pending())[0].logical_id,trial.id);
});
test('acknowledgement cannot remove a newer write; cache clear refuses pending data',async()=>{
  const r=repo();await r.setMeta('level',1);const old=await r.pending();
  await r.setMeta('level',2);await r.acknowledge(old);
  assert.equal((await r.pending()).length,1);
  await assert.rejects(r.reset(null),/pending changes/);
  assert.equal(await r.getMeta('level'),2);
});
test('account databases and backup ownership prevent cross-user merging',async()=>{
  const a=repo(),b=repo();await a.write('trials',{id:id()});
  assert.equal((await b.records('trials')).length,0);
  await assert.rejects(b.importJSON(await a.exportJSON()),/another account/);
  const local=createRepository(id());await local.write('trials',{id:id()});
  await local.setState('claimedBy',a.owner);
  await assert.rejects(local.write('trials',{id:id()}),/attached/);
});
test('legacy keyless migration preserves physical keys and all fields, restart is idempotent',async()=>{
  const name=id();
  await new Promise((resolve,reject)=>{
    const req=indexedDB.open(name,2);
    req.onupgradeneeded=()=>{for(const store of ['trials','ambient'])req.result.createObjectStore(store,{autoIncrement:true});req.result.createObjectStore('meta',{keyPath:'key'});};
    req.onsuccess=()=>{const tx=req.result.transaction('trials','readwrite');tx.objectStore('trials').put({timestamp:'old',nested:{x:1}},42);tx.oncomplete=()=>{req.result.close();resolve();};};req.onerror=()=>reject(req.error);
  });
  const r=createRepository(name);await r.initialize();
  const first=await r.records('trials');await r.initialize();
  assert.deepEqual(await r.records('trials'),first);assert.equal(first.length,1);assert.ok(first[0].id);
  const keys=await new Promise(resolve=>{const req=indexedDB.open(name,3);req.onsuccess=()=>{const q=req.result.transaction('trials').objectStore('trials').getAllKeys();q.onsuccess=()=>{resolve(q.result);req.result.close();};};});
  assert.deepEqual(keys,[42]);assert.equal((await r.pending()).length,1);
});
test('all backup stores deduplicate, legacy content IDs repeat, internal metadata excluded',async()=>{
  const r=repo(),backup={trials:[{timestamp:'2020-01-01',note:'C'}],ambient:[{timestamp:'2020-01-01',notes:'hum'}],sessions:[{id:id(),ended_at:null}],blocks:[{id:id(),trials:[{x:1}]}],epochs:[{id:id()}],meta:[{key:'curriculumEpoch',value:'epoch'},{key:'uuidBackfillV1',value:true}]};
  await r.importJSON(backup);await r.importJSON(backup);
  const exported=await r.exportJSON();
  for(const kind of ['trials','ambient','sessions','blocks','epochs'])assert.equal(exported[kind].length,1);
  assert.equal(exported.meta.length,1);assert.equal(exported.owner_id,r.owner);
  const fresh=createRepository(id(),r.owner);await fresh.importJSON(exported);
  for(const kind of ['trials','ambient','sessions','blocks','epochs'])assert.deepEqual(await fresh.records(kind),exported[kind]);
});
test('pull transaction rolls back records and cursor together',async()=>{
  const r=repo();
  await assert.rejects(r.applyPage([{kind:'trials',logical_id:'one',payload:{id:'one'}},{kind:'unknown',logical_id:'two',payload:{id:'two'}}],10,1));
  assert.equal((await r.records('trials')).length,0);assert.equal(await r.state('cursor'),undefined);
});
test('duplicate pulled UUIDs and timestamp ties have deterministic local order',async()=>{
  const r=repo(),a=id(),b=id(),rows=[a,b].map(logical_id=>({kind:'trials',logical_id,payload:{id:logical_id,timestamp:'2020-01-01'}}));
  await r.applyPage(rows,2,1);await r.applyPage(rows,2,1);
  assert.deepEqual((await r.records('trials')).map(r=>r.id),[a,b].sort());
});

test('identical UUID-less legacy rows preserve multiplicity across repeat imports',async()=>{
  const r=repo(), row={timestamp:'2020-01-01',note:'C'};
  await r.importJSON({trials:[row,row]});await r.importJSON({trials:[row,row]});
  assert.equal(await r.count('trials'),2);
});
test('initial local epoch yields to established cloud epoch even with a newer local clock',async()=>{
  const r=repo();await r.setMeta('curriculumEpoch','local',{initial:true});
  await r.applyPage([{kind:'meta',logical_id:'curriculumEpoch',payload:{key:'curriculumEpoch',value:'remote'},clock:1,device_id:'a'}],1,1);
  assert.equal(await r.getMeta('curriculumEpoch'),'remote');
});

test('generation reset discards metadata conflict versions from deleted history',async()=>{
  const r=repo();await r.setMeta('curriculumEpoch','deleted');
  await r.reset(2,true);
  await r.applyPage([{kind:'meta',logical_id:'curriculumEpoch',payload:{key:'curriculumEpoch',value:'new-generation'},clock:1,device_id:'a'}],2,2);
  assert.equal(await r.getMeta('curriculumEpoch'),'new-generation');
});
