import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
// Use a locally installed playwright or the caller's NODE_PATH; no dependency download.
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 5178, strictPort: true }, plugins: [{ name: 'smoke-blank', configureServer(server) { server.middlewares.use('/test-blank', (_req,res) => res.end('<html><body>Test setup</body></html>')); } }] });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5178/test-blank');
  // Exercise historical DB upgrade in an isolated, temporary browser profile.
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const r=indexedDB.open('ap-trainer',1);
    r.onupgradeneeded=()=>{const db=r.result;db.createObjectStore('trials',{autoIncrement:true});db.createObjectStore('ambient',{autoIncrement:true});db.createObjectStore('meta',{keyPath:'key'});};
    r.onsuccess=()=>{const tx=r.result.transaction('trials','readwrite');tx.objectStore('trials').add({target_chroma:'C',result_bool:true,timestamp:'2020-01-01T00:00:00.000Z'});tx.oncomplete=()=>{r.result.close();resolve();};};r.onerror=()=>reject(r.error);
  }));
  const candidate = await page.evaluate(async()=>{
    const db=await import('/src/db/db.js'), {VERSIONS,estimate}=await import('/src/curriculum/model.js');
    const {schedule,generateSequence}=await import('/src/curriculum/scheduler.js');
    const active=['G','E','C#'], time=Date.now(), rows=[];
    await db.setMeta('curriculumEpoch','smoke');
    for(let i=0;i<60;i++) for(const p of active) {
      const row={...VERSIONS,id:crypto.randomUUID(),target_pitch:p,response:p,correct:true,explicit_response_set:active,response_window_ms:3000,
        training_epoch:'smoke',session_type:'adaptive',trial_purpose:'training',session_id:'seed',timestamp:new Date(time-1000).toISOString(),latency_ms:900,canonical_condition:true};
      rows.push(row);await db.saveTrial(row);
    }
    const previous={id:'seed',created_at:new Date(time-500).toISOString(),session_type:'adaptive',training_epoch:'smoke',explicit_response_set:active,response_window_ms:3000};
    await db.putRecord('blocks',previous);
    const model=estimate(rows,'smoke',time);
    for(let seed=1;seed<100;seed++) {
      const b=schedule(model,previous,seed);
      if(b.scheduler_decision.candidate && generateSequence(b).some(t=>t.target_pitch===b.scheduler_decision.candidate.pitch)) {
        sessionStorage.setItem('test-seed',String(seed));return b.scheduler_decision.candidate.pitch;
      }
    }
    throw new Error('Could not construct a candidate block');
  });
  await page.addInitScript(()=>{crypto.getRandomValues=a=>{a.fill(Number(sessionStorage.getItem('test-seed')||42));return a;};});
  await page.goto('http://127.0.0.1:5178');
  await page.getByRole('button',{name:'Progress',exact:true}).click();
  await page.locator('.pitch-map article').first().waitFor();
  assert.equal(await page.locator('.pitch-map article').count(),12);
  assert.ok((await page.locator('body').innerText()).includes('Still gathering evidence'));
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByText('Expansion experiment',{exact:true}).click();
  await page.getByRole('button',{name:'Allow one threshold experiment',exact:true}).click();
  await page.getByRole('button',{name:'Cancel expansion experiment',exact:true}).waitFor();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  // Skip only the ten-second wipe in this UI smoke; production audio code stays untouched.
  await page.evaluate(async()=>{const {audioEngine}=await import('/src/audio/AudioEngine.js');audioEngine.runBufferWipe=()=>audioEngine.ctx.currentTime;});
  await page.getByRole('button',{name:/Start training/}).click();
  for(let i=0;i<24;i++) {
    const enabled=page.locator('.curriculum-grid button:not([disabled])');await enabled.first().waitFor();
    assert.ok(await page.locator('.curriculum-grid').getByRole('button',{name:candidate,exact:true}).isEnabled());
    const expected=await page.evaluate(async i=>{const db=await import('/src/db/db.js');const b=(await db.getRecords('blocks')).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)).at(-1);const p=b.trials[i].target_pitch;return b.explicit_response_set.includes(p)?p:'OTHER';},i);
    await page.locator('.curriculum-grid').getByRole('button',{name:expected,exact:true}).click();
    await page.getByRole('button',{name:'Medium',exact:true}).click();
    if(i<4) { await page.getByRole('heading',{name:'Response saved',exact:true}).waitFor();assert.ok(!(await page.locator('body').innerText()).includes('Target:')); }
    await page.getByRole('button',{name:i===23?'Review block':'Next trial',exact:true}).click();
  }
  await page.getByRole('heading',{name:'Round complete'}).waitFor();
  assert.ok((await page.locator('body').innerText()).includes('New note on trial'));
  await page.getByRole('button',{name:'Dismiss notice',exact:true}).click();
  await page.getByRole('button',{name:'Finish session',exact:true}).click();
  await page.getByRole('button',{name:'Progress',exact:true}).click();
  await page.locator('.pitch-map article').first().waitFor();
  await page.locator('.pitch-map article details').evaluateAll(ds=>ds.forEach(d=>{if(d.querySelector('summary')?.textContent==='Details')d.open=true;}));
  const text=await page.locator('body').innerText();assert.ok(text.includes('Being trialled'));assert.ok(text.includes('not yet measured'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/curriculum-readiness-mobile.png',fullPage:false});
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByLabel('Reason for pausing').fill('Browser smoke withdrawal');
  await page.getByRole('button',{name:'Pause this trial',exact:true}).click();
  await page.getByRole('button',{name:'Pause queued for next block'}).waitFor();
  await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Pause queued for next block'}).waitFor();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.evaluate(async()=>{const {audioEngine}=await import('/src/audio/AudioEngine.js');audioEngine.runBufferWipe=()=>audioEngine.ctx.currentTime;});
  await page.getByRole('button',{name:/Start training/}).click();
  await page.locator('.curriculum-grid button:not([disabled])').first().waitFor();
  assert.ok(await page.locator('.curriculum-grid').getByRole('button',{name:candidate,exact:true}).isDisabled());
  await page.getByRole('button',{name:'End session',exact:true}).click();
  const backup=await page.evaluate(async()=>{const db=await import('/src/db/db.js');return {backup:await db.exportJSON(),override:await db.getMeta('candidateOverride')};});
  const trials=backup.backup.trials.filter(t=>t.scheduler_reason==='activate');
  assert.equal(await page.evaluate(async()=>{const db=await import('/src/db/db.js');return db.getMeta('readinessPerturbation');}),null);
  assert.ok(backup.backup.blocks.some(b=>b.scheduler_decision?.readiness?.perturbation?.applied==='below'));
  assert.equal(trials.length,24);assert.ok(trials.some(t=>t.target_scheduler_role==='candidate'));
  assert.ok(backup.backup.trials.some(t=>t.timestamp==='2020-01-01T00:00:00.000Z'));
  assert.ok(backup.override.excluded.includes(candidate));assert.equal(backup.override.withdraw,false);
  assert.ok(backup.backup.blocks.some(b=>b.scheduler_decision?.candidate_history?.some(h=>h.reason==='Browser smoke withdrawal')));
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Try this again: '+candidate,exact:true}).click();
  assert.ok(!(await page.evaluate(async()=>{const db=await import('/src/db/db.js');return (await db.getMeta('candidateOverride')).excluded;})).includes(candidate));
  await page.getByText('Training tools',{exact:true}).click();
  await page.getByRole('button',{name:'Benchmark · 72 trials',exact:true}).click();
  await page.locator('.curriculum-grid button:not([disabled])').first().waitFor();
  assert.equal(await page.locator('.curriculum-grid button').count(),12);
  await page.locator('.curriculum-grid button').first().click();
  await page.getByRole('button',{name:'Medium',exact:true}).click();
  await page.getByRole('heading',{name:'Response saved',exact:true}).waitFor();
  assert.ok(!(await page.locator('body').innerText()).includes('Target:'));
  await page.getByRole('button',{name:'End session',exact:true}).click();
  await page.getByRole('button',{name:'Progress',exact:true}).click();
  assert.ok((await page.locator('body').innerText()).includes('1/72'));
  assert.deepEqual(errors,[]);
  console.log('PASS browser: historical upgrade, full candidate block, enabled candidate, saved roles and reasons, notices, null map, mobile layout, persisted pause, withdrawal and restore');
} finally { await browser.close();await server.close(); }
