import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
const server = await createServer({ server:{host:'127.0.0.1',port:5186,strictPort:true}, define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_ANON_KEY':'""'} });
await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir('artifacts/dashboard-ui',{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1365,height:1000}}); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5186/');
 await page.getByRole('button',{name:'Start training',exact:false}).waitFor();
 await page.getByRole('button',{name:'Dashboard',exact:true}).click();
 await page.getByRole('heading',{name:'Your adaptive progress starts here'}).waitFor();
 await page.evaluate(async()=>{
  const db=await import('/src/db/db.js');
  await db.setMeta('curriculumEpoch','ui-test');
  for(let b=0;b<4;b++) {
   const date=new Date(); date.setDate(date.getDate()-b);
   await db.putRecord('blocks',{id:`round-${b}`,created_at:date.toISOString(),session_type:'adaptive',training_epoch:'ui-test',block_length:12,explicit_response_set:['C','E','G'],scheduler_decision:{active_set:['C','E','G'],candidate:{pitch:'D',hold_reason:'learning'}}});
   for(let i=0;i<12;i++) await db.saveTrial({id:`r-${b}-${i}`,schema_version:2,learner_model_version:'3',stimulus_generator_version:'2',session_type:'adaptive',training_epoch:'ui-test',block_id:`round-${b}`,trial_purpose:i<2?'probe':'training',target_pitch:['C','E','G'][i%3],explicit_response_set:['C','E','G'],correct:i%4!==0,response:i%4===0?'OTHER':['C','E','G'][i%3],latency_ms:900+i*35,timestamp:date.toISOString()});
  }
  await db.saveTrial({id:'manual-test',target_chroma:'C',result_bool:true,session_type:'drill',latency_ms:950});
 });
 await page.reload();
 await page.getByRole('button',{name:'Dashboard',exact:true}).click();
 await page.getByText('48',{exact:true}).waitFor();
 assert.equal(await page.getByText('75%',{exact:true}).count()>0,true);
 await page.getByLabel('Show').selectOption('7');
 await page.screenshot({path:'artifacts/dashboard-ui/dashboard-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Backup',exact:true}).click();
 await page.getByRole('button',{name:'Download JSON',exact:true}).waitFor();
 await page.getByRole('button',{name:'Training',exact:true}).click();
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Dashboard',exact:true}).click();
 await page.getByRole('button',{name:'Learning details',exact:true}).click();
 await page.getByRole('heading',{name:'Your twelve-pitch learner map'}).waitFor();
 await page.getByRole('button',{name:'Dashboard',exact:true}).click();
 await page.getByRole('button',{name:'Practice modes',exact:true}).click();
 await page.getByRole('heading',{name:'Choose an exercise'}).waitFor();
 await page.getByRole('button',{name:'Training',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'artifacts/dashboard-ui/training-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Dashboard',exact:true}).click();
 await page.getByText('48',{exact:true}).waitFor();
 for(const width of [390,320,768,1365]) {
  await page.setViewportSize({width,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}`);
 }
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'artifacts/dashboard-ui/dashboard-mobile.png',fullPage:true});
 await page.getByText('Manual practice history · 1 responses',{exact:true}).click();
 await page.getByRole('heading',{name:'Per-Note Accuracy'}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'expanded manual overflow');
 assert.deepEqual(errors,[]);
 console.log('Browser checks passed: seeded adaptive + manual history, empty state, date filter, backup access, navigation, 320/390/768/1365px without overflow; no page errors.');
} finally { await browser.close(); await server.close(); }
