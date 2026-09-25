import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { PGlite } from '@electric-sql/pglite';
import { readFile, mkdir } from 'node:fs/promises';
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const pg=new PGlite();
await pg.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;insert into auth.users values('${A}'),('${B}');`);
await pg.exec(await readFile('supabase/migrations/202609220001_sync.sql','utf8'));
const server=await createServer({server:{host:'127.0.0.1',port:5179,strictPort:true},define:{
  'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://ap-test.supabase.co'),
  'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('test-public-key')
},plugins:[{name:'blank',configureServer(s){s.middlewares.use('/test-blank',(_req,res)=>res.end('<html>Setup</html>'));}}]});
await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const errors=[]; const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const session=uid=>({access_token:[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600},'signature'].map(v=>typeof v==='string'?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.'),refresh_token:'refresh-'+uid,expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:uid,email:uid===A?'a@example.com':'b@example.com',aud:'authenticated'}});
  await context.route('https://ap-test.supabase.co/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    const body=req.postDataJSON();
    let result={};
    if(url.pathname.endsWith('/token'))result=session(body.email==='a@example.com'?A:B);
    else if(url.pathname.includes('/rpc/')){
      const uid=JSON.parse(Buffer.from(req.headers().authorization.split('.')[1],'base64url')).sub;
      const name=url.pathname.split('/').at(-1);
      result=await pg.transaction(async tx=>{
        await tx.exec('set local role authenticated');
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);
        const args=name==='ap_sync_pull'?[body.after_revision,body.page_size]:name==='ap_sync_push'?[body.expected_generation,JSON.stringify(body.entries)]:[body.request_token];
        const sql=name==='ap_sync_pull'?'select public.ap_sync_pull($1,$2) as result':name==='ap_sync_push'?'select public.ap_sync_push($1,$2::jsonb) as result':'select public.ap_sync_delete_history($1) as result';
        return (await tx.query(sql,args)).rows[0].result;
      });
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
  });
  await page.goto('http://127.0.0.1:5179/test-blank');
  await page.evaluate(()=>new Promise(resolve=>{
    const req=indexedDB.open('ap-trainer',2);
    req.onupgradeneeded=()=>{req.result.createObjectStore('trials',{autoIncrement:true});req.result.createObjectStore('ambient',{autoIncrement:true});req.result.createObjectStore('meta',{keyPath:'key'});};
    req.onsuccess=()=>{const tx=req.result.transaction('trials','readwrite');tx.objectStore('trials').put({timestamp:'2026-01-01',target_chroma:'C',result_bool:true,marker:'legacy'},42);tx.oncomplete=()=>{req.result.close();resolve();};};
  }));
  await page.goto('http://127.0.0.1:5179/');
  await page.getByRole('button',{name:'Start training',exact:false}).waitFor();
  await page.locator('summary').filter({hasText:'Account'}).click();
  const login=async email=>{
    if(!await page.getByLabel('Email',{exact:true}).isVisible())await page.locator('summary').filter({hasText:'Account'}).click();
    await page.getByLabel('Email',{exact:true}).fill(email);
    await page.getByLabel('Password',{exact:true}).fill('test-password');
    await page.getByRole('button',{name:'Sign in',exact:true}).last().click();
    await page.getByRole('button',{name:'Start training',exact:false}).waitFor();
    await page.locator('summary').filter({hasText:'Account'}).click();
    await page.getByText('Signed in as '+email).waitFor();
  };
  await login('a@example.com');
  page.on('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Add local history to this account'}).click();
  await page.waitForFunction(async()=>{const db=await import('/src/db/db.js');return (await db.getAllTrials()).some(r=>r.marker==='legacy');});
  await page.getByRole('button',{name:'Sync now',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Synced'}).waitFor();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByRole('button',{name:'Start training',exact:false}).waitFor();
  assert.equal(await page.evaluate(async()=>(await (await import('/src/db/db.js')).getAllTrials()).length),0);
  await login('b@example.com');
  assert.equal(await page.evaluate(async()=>(await (await import('/src/db/db.js')).getAllTrials()).length),0);
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByRole('button',{name:'Start training',exact:false}).waitFor();
  await login('a@example.com');
  assert.equal(await page.evaluate(async()=>(await (await import('/src/db/db.js')).getAllTrials()).filter(r=>r.marker==='legacy').length),1);
  await context.setOffline(true);
  await page.evaluate(async()=>{await (await import('/src/db/db.js')).saveTrial({marker:'offline',timestamp:'2026-01-02'});});
  await context.setOffline(false);
  await page.getByRole('button',{name:'Sync now',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Synced'}).waitFor();
  await page.getByRole('button',{name:'Dashboard',exact:true}).click();
  await page.getByRole('button',{name:'Clear local cache',exact:true}).waitFor();
  const secondPage=await context.newPage();
  await secondPage.goto('http://127.0.0.1:5179/');
  await secondPage.getByRole('button',{name:'Start training',exact:false}).waitFor();
  await secondPage.evaluate(async()=>{await (await import('/src/db/db.js')).saveTrial({marker:'other-tab',timestamp:'2026-01-03'});});
  await page.waitForFunction(()=>document.querySelector('.stat-card .stat-value')?.textContent==='3');
  await secondPage.close();
  await mkdir('artifacts/cloud-sync',{recursive:true});
  await page.screenshot({path:'artifacts/cloud-sync/mobile-dashboard.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('button',{name:'Delete my history everywhere',exact:true}).click();
  await page.getByRole('button',{name:'Start training',exact:false}).waitFor();
  assert.equal(await page.evaluate(async()=>(await (await import('/src/db/db.js')).getAllTrials()).length),0);
  await page.reload();
  await page.getByRole('button',{name:'Start training',exact:false}).waitFor();
  assert.equal(await page.evaluate(async()=>(await (await import('/src/db/db.js')).getAllTrials()).length),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: legacy migration, email sign-in UI, attachment, sign-out/A-B-A isolation, offline persistence, real SQL RPC sync, cross-tab refresh, deletion/reload, mobile Dashboard.');
} finally {await browser.close();await server.close();await pg.close();}
