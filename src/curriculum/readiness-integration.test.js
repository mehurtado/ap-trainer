import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate, VERSIONS } from './model.js';
import { schedule, generateSequence, CONFIG, scopedState } from './scheduler.js';
const now = new Date(2026, 8, 9, 12).getTime();
function fixture() {
  const active = ['G','E','C#'], model = estimate([], 'e', now);
  const key = [...active].sort().join(',') + '|3000';
  model.configurations[key] = Object.fromEntries(active.map(p => [p,{correct:40,total:40,contexts:{}}]));
  active.forEach(p => { model.pitches[p].falsePositive = {mean:.02,lower:0,upper:.07,evidence:40}; model.pitches[p].median_rt = 900; });
  return { model, previous: {explicit_response_set:active,response_window_ms:3000}, key };
}
test('distinct bounded probes and exact candidate mass', () => {
  const {model,previous} = fixture(); const b = schedule(model,previous,42);
  assert.equal(b.scheduler_decision.action,'activate');
  assert.equal(b.sampling_distribution[b.scheduler_decision.candidate.pitch],CONFIG.candidateMass);
  const active = b.scheduler_decision.active_set;
  assert.ok(Math.abs(active.reduce((sum,p)=>sum+b.sampling_distribution[p],0)-.75)<1e-10);
  active.forEach(p=>assert.ok(b.probe_distribution[p]>=.5/active.length));
  const probes=generateSequence(b).slice(0,active.length).map(t=>t.target_pitch);
  assert.equal(new Set(probes).size,active.length);
  assert.deepEqual(generateSequence(b),generateSequence(b));
});
test('retention breaker counts training dates, stays latched on that date, and resets when no longer blocked', () => {
  const {model} = fixture(); let {previous}=fixture();
  for(const p of previous.explicit_response_set) model.pitches[p].retention.retention_opportunities=3;
  for(let day=0;day<10;day++) {
    model.computed_at=now+day*86400000;
    previous=schedule(model,previous,42,{...CONFIG,candidateOverride:{excluded:['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']}});
    const r=previous.scheduler_decision.readiness.per_pitch.G;
    assert.equal(r.retention_blocked_days,day+1); assert.equal(r.retention_report_only,day===9);
    const same=schedule(model,previous,43);
    assert.equal(same.scheduler_decision.readiness.per_pitch.G.retention_blocked_days,day+1);
  }
  assert.ok(previous.scheduler_decision.readiness.per_pitch.G.reasons.includes('retention'));
  assert.equal(previous.scheduler_decision.readiness.per_pitch.G.qualified,true);
  model.pitches.G.retention.stable=true;
  const cleared=schedule(model,previous,45);
  assert.equal(cleared.scheduler_decision.readiness.per_pitch.G.retention_blocked_days,0);
});
test('pooled accuracy changes affect only interference and the explicitly legacy comparison', () => {
  const {model,previous} = fixture();
  const a=schedule(model,previous,42,{...CONFIG,candidateOverride:{excluded:['C','D','D#','F','F#','G#','A','A#','B']}});
  const altered=structuredClone(model); altered.pitches.G.accuracy={mean:.1,lower:0,upper:.2,evidence:999};
  const b=schedule(altered,previous,42,{...CONFIG,candidateOverride:{excluded:['C','D','D#','F','F#','G#','A','A#','B']}});
  assert.deepEqual(a.scheduler_decision.readiness,b.scheduler_decision.readiness);
  assert.equal(a.scheduler_decision.load,b.scheduler_decision.load);
  assert.deepEqual(a.sampling_distribution,b.sampling_distribution);
  const introduced=schedule(model,previous,42), pitch=introduced.scheduler_decision.candidate.pitch;
  const key=[...introduced.explicit_response_set].sort().join(',')+'|3000';
  model.configurations[key]=Object.fromEntries(introduced.explicit_response_set.map(p=>[p,{correct:40,total:40,contexts:{}}]));
  introduced.scheduler_decision.candidate.baseline.G.lower=.8;
  model.pitches.G.accuracy.lower=.6;
  const hold=schedule(model,introduced,43);
  assert.equal(hold.scheduler_decision.candidate.hold_reason,'interference');
  assert.equal(hold.scheduler_decision.candidate.pitch,pitch);
  assert.ok(hold.scheduler_decision.notices.some(n=>n.includes('break')));
});
test('manual withdrawal is pure, logged, and nomination exclusions persist through config', () => {
  const {model,previous}=fixture(); const b=schedule(model,previous,42);
  const pitch=b.scheduler_decision.candidate.pitch;
  const before=JSON.stringify(b), config={...CONFIG,candidateOverride:{withdraw:true,excluded:[],reason:'Needs a break'}};
  const withdrawn=schedule(model,b,43,config);
  assert.equal(JSON.stringify(b),before); assert.equal(config.candidateOverride.withdraw,true);
  assert.equal(withdrawn.scheduler_decision.action,'withdraw');
  assert.deepEqual(withdrawn.scheduler_decision.active_set,b.scheduler_decision.active_set);
  assert.ok(!withdrawn.explicit_response_set.includes(pitch));
  assert.equal(withdrawn.scheduler_decision.candidate_history.at(-1).reason,'Needs a break');
  const next=schedule(model,withdrawn,44,{...CONFIG,candidateOverride:{withdraw:false,excluded:[pitch]}});
  assert.notEqual(next.scheduler_decision.candidate?.pitch,pitch);
});
test('context posterior carries context evidence and consistent confidence bounds',()=>{
  const {model,key}=fixture();model.configurations[key].G.contexts.focus={correct:2,total:3};
  const s=scopedState(model,'G',key,'focus');
  assert.equal(s.accuracy.evidence,3);
  assert.ok(s.accuracy.lower<s.accuracy.mean && s.accuracy.upper>s.accuracy.mean);
  assert.equal(s.uncertainty,s.accuracy.upper-s.accuracy.lower);
});
test('raw diagnostic windows use only full windows in the current epoch',()=>{
  const rows=Array.from({length:39},(_,i)=>({...VERSIONS,target_pitch:'G',response:'G',correct:i>=7,explicit_response_set:['G','E'],session_type:'adaptive',trial_purpose:'training',training_epoch:'e',session_id:'s',timestamp:new Date(now+i).toISOString(),delay_since_exposure_ms:i<3?86400000:null}));
  assert.equal(estimate(rows.slice(0,31),'e',now).pitches.G.recent_window_means,null);
  const p=estimate(rows,'e',now).pitches.G;
  assert.deepEqual(p.recent_window_means,[1,1,1,1]);assert.equal(p.recent_window_rate,1);
  assert.equal(p.retention.retention_opportunities,1);
  assert.equal(estimate(rows,'new',now).pitches.G.recent_window_means,null);
});
