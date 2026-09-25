import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import 'fake-indexeddb/auto';
import { createRepository } from '../src/db/repository.js';
import { createSyncEngine } from '../src/cloud/engine.js';
const pg=new PGlite(),uid='33333333-3333-4333-8333-333333333333';
try {
await pg.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select '${uid}'::uuid $$;insert into auth.users values('${uid}');`);
await pg.exec(await readFile('supabase/migrations/202609220001_sync.sql','utf8'));
await pg.exec(`insert into public.ap_sync_accounts values('${uid}',1,100000);
insert into public.ap_sync_records(user_id,kind,logical_id,payload,device_id,clock,revision)
select '${uid}','trials',md5(n::text)::uuid::text,jsonb_build_object('id',md5(n::text)::uuid::text,'timestamp','2026-01-01T00:00:00Z','target_pitch','C','detail',jsonb_build_array(n)),'${uid}',n,n from generate_series(1,100000)n;`);
const r=createRepository('large-'+crypto.randomUUID(),uid);
let pulls=0,received=0,last;
const transport={
pull:async cursor=>{pulls++;const result=(await pg.query('select public.ap_sync_pull($1,500) as result',[cursor])).rows[0].result;received+=result.rows.length;return result;},
push:async()=>{throw Error('Downloaded data must not be re-uploaded');}
};
const engine=createSyncEngine(r,transport,s=>{last=s;});
const start=performance.now();await engine.sync();assert.equal(last.state,'synced',last.error);
assert.equal(await r.count('trials'),100000);assert.equal(received,100000);assert.equal(await r.state('cursor'),100000);
const before=pulls;await engine.sync();assert.equal(received,100000);assert.equal(pulls-before,2);
console.log(JSON.stringify({records:100000,received,initialPullPages:before,unchangedSyncRows:0,elapsedSeconds:Math.round((performance.now()-start)/1000)}));
await r.close();
} finally {await pg.close();}
