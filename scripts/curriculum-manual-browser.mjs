import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:5179,strictPort:true}});await server.listen();
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5179');
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Manual practice')));
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Manual practice')).click());
 await page.waitForSelector('.session-buttons');
 assert.ok(!await page.evaluate(()=>document.body.textContent.includes('Evening Session')));
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Drill Mode')).click());
 await page.waitForSelector('.binary-note-btn');await page.evaluate(()=>{const bs=document.querySelectorAll('.binary-note-btn');bs[0].click();bs[1].click();});
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Start →')));
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Start →')).click());
 await page.waitForFunction(async()=>{const db=await import('/src/db/db.js');return (await db.getAllTrials()).some(t=>t.trial_purpose==='manual');},{timeout:15000});
 const backup=await page.evaluate(async()=>{const db=await import('/src/db/db.js');return db.exportJSON();});
 const row=backup.trials.find(t=>t.trial_purpose==='manual');assert.equal(row.canonical_condition,false);assert.equal(row.explicit_response_set.length,2);assert.ok(backup.sessions.some(s=>s.id===row.session_id));assert.ok(backup.blocks.some(b=>b.id===row.block_id));assert.deepEqual(errors,[]);
 console.log('PASS manual drill: no fixed-level sessions, saved timeout, session/block linkage, explicitly noncanonical evidence');
}finally{await browser.close();await server.close();}
