import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import 'fake-indexeddb/auto';
import { createRepository } from '../db/repository.js';
import { createSyncEngine } from './engine.js';
let pg;
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const id = () => crypto.randomUUID();
const repo = () => createRepository(id(), A);
before(async () => {
  pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${A}'), ('${B}');`);
  await pg.exec(await readFile(new URL('../../supabase/migrations/202609220001_sync.sql', import.meta.url), 'utf8'));
});
after(async () => { await pg?.close(); });
async function asUser(user, sql, args = []) {
  return pg.transaction(async tx => {
    await tx.exec('set local role ' + (user ? 'authenticated' : 'anon'));
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user ?? '']);
    return tx.query(sql, args);
  });
}
const transport = user => ({
  pull: async cursor => (await asUser(user, 'select public.ap_sync_pull($1, 23) as result', [cursor])).rows[0].result,
  push: async (generation, entries) => (await asUser(user, 'select public.ap_sync_push($1,$2::jsonb) as result', [generation, JSON.stringify(entries)])).rows[0].result,
  deleteHistory: async token => (await asUser(user, 'select public.ap_sync_delete_history($1) as result', [token])).rows[0].result
});
test('real SQL: own reads, anonymous denial and no direct cross-account insert/update/delete', async () => {
  const r = repo(); await r.write('trials', { id: id(), timestamp: '2026-01-01', detail: { full: true } });
  const result = await transport(A).push(1, await r.pending());
  assert.equal(result.errors.length, 0, JSON.stringify(result));
  const own = await asUser(A, 'select * from public.ap_sync_records');
  assert.equal(own.rows.length, 1);
  assert.equal((await asUser(B, 'select * from public.ap_sync_records')).rows.length, 0);
  for (const user of [A, B]) {
    await assert.rejects(asUser(user, 'update public.ap_sync_records set user_id=$1', [B]), /permission denied/);
    await assert.rejects(asUser(user, 'delete from public.ap_sync_records'), /permission denied/);
    await assert.rejects(asUser(user, "insert into public.ap_sync_records(user_id,kind,logical_id,payload,device_id,clock,revision) values($1,'trials',$2,'{}',$3,0,0)", [B,id(),id()]), /permission denied/);
  }
  await assert.rejects(transport(null).pull(0), /permission denied/);
  await assert.rejects(transport(null).push(1, []), /permission denied/);
  await assert.rejects(transport(null).deleteHistory(id()), /permission denied/);
  const attempted = (await r.pending()).map(e => ({ ...e, user_id: B }));
  await transport(A).push(1, attempted);
  assert.equal((await transport(B).pull(0)).rows.length, 0);
});
test('two offline devices converge with paginated pulls and response-loss retry', async () => {
  const x=repo(), y=repo();
  for(let i=0;i<60;i++) await x.write('trials',{id:id(),timestamp:new Date(1000+i).toISOString(),extra:[i]});
  await y.write('ambient',{id:id(),timestamp:'2025-01-01',notes:'offline'});
  let lose=true; const wire=transport(A), states=[];
  const flaky={...wire,push:async(...args)=>{const result=await wire.push(...args); if(lose){lose=false;throw Error('lost response');} return result;}};
  const ex=createSyncEngine(x,flaky,s=>states.push(s)), ey=createSyncEngine(y,wire);
  await ex.sync(); assert.equal(states.at(-1).state,'error');
  assert.ok((await x.pending()).length);
  await ex.sync(); await ey.sync(); await ex.sync();
  assert.deepEqual(await x.records('trials'),await y.records('trials'));
  assert.deepEqual(await x.records('ambient'),await y.records('ambient'));
  assert.equal((await x.records('trials')).length,61);
  assert.equal((await x.pending()).length,0);
  const cursor=await x.state('cursor');
  await ex.sync(); assert.equal(await x.state('cursor'),cursor);
});
test('malformed oldest row cannot starve later valid rows; mutable sessions complete monotonically',async()=>{
  const r=repo(), wire=transport(A), status=[];
  await r.write('trials',{id:'not-a-uuid',timestamp:'bad'});
  for(let i=0;i<205;i++)await r.write('trials',{id:id(),timestamp:'2026-01-01'});
  const sid=id();await r.write('sessions',{id:sid,ended_at:null,context:'immutable'});
  const engine=createSyncEngine(r,wire,s=>status.push(s));
  await engine.sync();
  assert.equal(status.at(-1).state,'error');
  assert.equal((await r.pending()).length,1);
  await r.write('sessions',{id:sid,ended_at:'2026-01-02',context:'changed'});
  await engine.sync();
  assert.equal((await r.records('sessions'))[0].context,'immutable');
  assert.equal((await r.records('sessions'))[0].ended_at,'2026-01-02');
});
test('delete generation blocks stale offline upload and deletion retry never deletes new history',async()=>{
  const r=repo(), wire=transport(A);
  const engine=createSyncEngine(r,wire);
  await engine.sync();
  await r.write('trials',{id:id(),timestamp:'2026-01-03',notes:'unsynced offline'});
  const token=id(), generation=await wire.deleteHistory(token);
  await engine.sync();
  assert.equal((await r.records('trials')).length,0);
  assert.equal((await r.recovery()).length,1);
  assert.equal((await r.pending()).length,0);
  await r.write('trials',{id:id(),timestamp:'2026-01-04'});
  await engine.sync();
  assert.equal(await wire.deleteHistory(token),generation);
  assert.equal((await wire.pull(0)).rows.length,1);
  const stale=repo();await stale.write('trials',{id:id()});
  assert.equal((await wire.push(1,await stale.pending())).reset,true);
});
test('metadata version order is deterministic and user-local keys are never uploaded',async()=>{
  const x=repo(),y=repo(),wire=transport(B);
  await x.setMeta('curriculumEpoch',id());await x.setMeta('readinessPerturbation',{delta:.06});
  const pending=await x.pending();
  assert.equal(pending.length,1);
  const newer={...pending[0],clock:pending[0].clock+10,token:id(),payload:{key:'curriculumEpoch',value:id()}};
  await wire.push(1,[newer]);await wire.push(1,pending);
  const page=await wire.pull(0);assert.equal(page.rows[0].payload.value,newer.payload.value);
  await y.applyPage(page.rows,page.cursor,page.generation);
  assert.equal(await y.getMeta('curriculumEpoch'),newer.payload.value);
});

test('committed partial pull invalidates local consumers even when the next page fails',async()=>{
  let invalidations=0,calls=0;
  const r=createRepository(id(),A,type=>{if(type==='pull')invalidations++;});
  const logical=id();
  const engine=createSyncEngine(r,{pull:async()=>{
    if(calls++)throw Error('connection lost');
    return {generation:1,rows:[{kind:'trials',logical_id:logical,payload:{id:logical}}],cursor:1,more:true};
  }});
  await engine.sync();assert.equal(await r.count('trials'),1);assert.equal(invalidations,1);
});
