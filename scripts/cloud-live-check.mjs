import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import 'fake-indexeddb/auto';
import { createRepository } from '../src/db/repository.js';
import { createSyncEngine } from '../src/cloud/engine.js';

export async function prepareLiveVerification({ url, key, adminKey }) {
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  const admin=createClient(url,adminKey,options);
  const userIds=[], clients=[], emails=[];
  const suffix=crypto.randomUUID(), password=crypto.randomUUID()+'aA9!';
  const cleanup=async()=>{
    for(const id of userIds){const {error}=await admin.auth.admin.deleteUser(id);if(error)throw error;}
  };
  try {
    for(const name of ['a','b']){
      const email=`ap-trainer-check-${name}-${suffix}@example.com`;
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
      if(created.error)throw created.error;
      userIds.push(created.data.user.id);emails.push(email);
      const client=createClient(url,key,options);
      const login=await client.auth.signInWithPassword({email,password});
      if(login.error)throw login.error;clients.push(client);
    }
    const wire=client=>{
      const rpc=async(name,args)=>{const {data,error}=await client.rpc(name,args).abortSignal(AbortSignal.timeout(30000));if(error)throw Error(error.message);return data;};
      return {pull:cursor=>rpc('ap_sync_pull',{after_revision:cursor,page_size:50}),push:(generation,entries)=>rpc('ap_sync_push',{expected_generation:generation,entries}),deleteHistory:token=>rpc('ap_sync_delete_history',{request_token:token})};
    };
    const owner=userIds[0],repoA=createRepository('live-a-'+suffix,owner),repoB=createRepository('live-b-'+suffix,owner);
    const trial=marker=>({id:crypto.randomUUID(),timestamp:new Date().toISOString(),target_chroma:'C',user_guess:'C',result_bool:true,marker});
    const x=trial('device-a'),y=trial('device-b');
    await repoA.write('trials',x);await repoB.write('trials',y);
    let lost=false;const transport=wire(clients[0]),statuses=[];
    const flaky={...transport,push:async(...args)=>{const result=await transport.push(...args);if(!lost){lost=true;throw Error('Simulated response loss after server commit');}return result;}};
    const engineA=createSyncEngine(repoA,flaky,s=>statuses.push(s)),engineB=createSyncEngine(repoB,transport,s=>statuses.push(s));
    await engineA.sync();assert.equal(statuses.at(-1).state,'error');
    await engineA.sync();assert.equal(statuses.at(-1).state,'synced',statuses.at(-1).error);
    await engineB.sync();await engineA.sync();
    assert.equal(await repoA.count('trials'),2);assert.deepEqual(await repoA.records('trials'),await repoB.records('trials'));
    const other=createRepository('live-other-'+suffix,userIds[1]);
    await other.write('trials',trial('private-user-b'));
    const otherEngine=createSyncEngine(other,wire(clients[1]),s=>statuses.push(s));
    await otherEngine.sync();assert.equal(statuses.at(-1).state,'synced',statuses.at(-1).error);
    const inaccessible=await clients[0].from('ap_sync_records').select('*').eq('user_id',userIds[1]);
    assert.ifError(inaccessible.error);assert.equal(inaccessible.data.length,0);
    for(const operation of [
      clients[0].from('ap_sync_records').insert({user_id:userIds[1],kind:'trials',logical_id:crypto.randomUUID(),payload:{},device_id:crypto.randomUUID(),clock:0,revision:1}),
      clients[0].from('ap_sync_records').update({payload:{tampered:true}}).eq('user_id',userIds[1]),
      clients[0].from('ap_sync_records').delete().eq('user_id',userIds[1])
    ])assert.ok((await operation).error,'Direct cross-user mutation must be denied');
    const anonymous=createClient(url,key,options);
    assert.ok((await anonymous.rpc('ap_sync_pull',{after_revision:0,page_size:10})).error);
    await repoB.write('trials',trial('offline-pending'));
    await transport.deleteHistory(crypto.randomUUID());
    await engineB.sync();assert.equal(await repoB.count('trials'),0);assert.equal((await repoB.recovery()).length,1);
    await engineA.sync();assert.equal(await repoA.count('trials'),0);
    await repoA.write('trials',trial('production-smoke'));
    await engineA.sync();assert.equal(statuses.at(-1).state,'synced',statuses.at(-1).error);
    return {summary:{hostedAuth:true,twoDeviceUnion:true,responseLossRetry:true,rlsIsolation:true,anonymousDenied:true,deletionNoResurrection:true},emails,password,cleanup};
  } catch(error) {await cleanup();throw error;}
}
