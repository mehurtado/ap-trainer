import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:5178,strictPort:true}});server.middlewares.use('/test-blank',(req,res)=>res.end('<html><body>Test setup</body></html>'));await server.listen();
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:390,height:844});await page.goto('http://127.0.0.1:5178/test-blank');
 await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('ap-trainer',1);r.onupgradeneeded=()=>{const db=r.result;db.createObjectStore('trials',{autoIncrement:true});db.createObjectStore('ambient',{autoIncrement:true});db.createObjectStore('meta',{keyPath:'key'});};r.onsuccess=()=>{const tx=r.result.transaction('trials','readwrite');tx.objectStore('trials').add({target_chroma:'C',result_bool:true,timestamp:'2020-01-01T00:00:00.000Z'});tx.oncomplete=()=>{r.result.close();resolve();};};r.onerror=()=>reject(r.error);}));
 await page.goto('http://127.0.0.1:5178');
 const click=async text=>{await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>b.textContent===t),{},text);await page.evaluate(t=>[...document.querySelectorAll('button')].find(b=>b.textContent===t).click(),text);};
 await click('Start adaptive training');await page.waitForSelector('.curriculum-grid');
 const initial=await page.$$eval('.curriculum-grid button',bs=>bs.map(b=>({text:b.textContent,disabled:b.disabled,x:b.getBoundingClientRect().x,y:b.getBoundingClientRect().y})));
 assert.equal(initial.length,13);assert.equal(initial.filter(b=>!b.disabled).length,3);
 await page.screenshot({path:'scripts/curriculum-mobile.png',fullPage:true});
 await click('Begin block');await page.waitForFunction(()=>document.querySelector('.curriculum-grid button:not(:disabled)'));
 await page.evaluate(()=>document.querySelector('.curriculum-grid button:not(:disabled)').click());
 await click('Save response');await page.waitForFunction(()=>document.body.textContent.includes('Response saved'));
 assert.ok(!await page.evaluate(()=>document.body.textContent.includes('Target:')));
 await click('Next trial');await page.waitForFunction(()=>document.querySelector('.curriculum-grid button:not(:disabled)'));
 const positions=await page.$$eval('.curriculum-grid button',bs=>bs.map(b=>b.textContent));assert.deepEqual(positions,initial.map(b=>b.text));
 for(let i=1;i<24;i++){
  await page.waitForFunction(()=>document.querySelector('.curriculum-grid button:not(:disabled)'));
  await page.evaluate(()=>document.querySelector('.curriculum-grid button:not(:disabled)').click());await click('Save response');
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>['Next trial','Review block'].includes(b.textContent)));
  if(i>=4)assert.ok(await page.evaluate(()=>document.body.textContent.includes('Target:')));
  await click(i===23?'Review block':'Next trial');
 }
 await click('Prepare next block');await page.waitForFunction(()=>document.body.textContent.includes('Block 2'));
 await click('End session');await click('Learner map');await page.waitForSelector('.pitch-map article');assert.equal(await page.$$eval('.pitch-map article',a=>a.length),12);
 await click('Back');await click('Benchmark · 72 trials');await page.waitForSelector('.curriculum-grid');assert.equal(await page.$$eval('.curriculum-grid button',a=>a.length),12);
 await click('Begin block');await page.waitForFunction(()=>document.querySelector('.curriculum-grid button:not(:disabled)'));await page.evaluate(()=>document.querySelector('.curriculum-grid button:not(:disabled)').click());await click('Save response');await page.waitForFunction(()=>document.body.textContent.includes('Response saved'));assert.ok(!await page.evaluate(()=>document.body.textContent.includes('Target:')));
 await click('End session');await page.reload();await click('Learner map');await page.waitForSelector('.pitch-map article');assert.ok(await page.evaluate(()=>document.body.textContent.includes('1/72')));
 const backup=await page.evaluate(async()=>{const db=await import('/src/db/db.js');return db.exportJSON();});
 assert.equal(backup.trials.filter(t=>t.schema_version===2).length,25);assert.ok(backup.trials.some(t=>t.timestamp==='2020-01-01T00:00:00.000Z'));assert.equal(backup.blocks.length,3);assert.ok(backup.sessions.every(s=>s.ended_at));assert.ok(backup.epochs.length>=1);assert.ok(backup.blocks.every(b=>b.trials.length===b.block_length));
 assert.deepEqual(errors,[]);await page.screenshot({path:'scripts/curriculum-map-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 console.log('PASS browser: v1 database upgrade, full block and transition, complete backup,  mobile layout, fixed buttons, probe and benchmark feedback withholding, saved history, no runtime errors');
} finally {await browser.close();await server.close();}
