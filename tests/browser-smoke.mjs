import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {chromium,firefox,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)),harness=await fs.readFile(path.join(root,'tests/browser-harness.html'));
const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end(harness);return;}const data=await fs.readFile(path.join(root,pathname));res.setHeader('Content-Type',pathname.endsWith('.js')||pathname.endsWith('.mjs')?'text/javascript':pathname.endsWith('.css')?'text/css':'text/plain');res.end(data);}catch{res.statusCode=404;res.end('not found');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
async function ready(page,url,waitForRuntime=true){
 await page.goto(url);await page.waitForFunction(()=>window.testReady||window.harnessError);assert.equal(await page.evaluate(()=>window.harnessError),undefined);
 if(waitForRuntime){await page.waitForFunction(()=>game.modules.get('world-codex').api?.loader?.state==='ready');}
}
const results=[];
try{
for(const [engine,name] of [[chromium,'Chromium'],[firefox,'Firefox'],[webkit,'WebKit']]){
 const browser=await engine.launch({headless:true,args:name==='Chromium'?['--no-sandbox']:[]});
 try{
  for(const role of ['p','t','gm']){
   const ctx=await browser.newContext(),page=await ctx.newPage(),runtimeRequests=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/scripts/runtime.js')runtimeRequests.push(r.url());});await ready(page,base+'/?role='+role);assert.equal(runtimeRequests.length,1);assert(await page.locator('.world-codex-launcher').isVisible());
   if(role!=='gm'){assert.equal(await page.locator('.folder.wc-native').count(),0);assert.equal(await page.locator('.directory-list .directory-item').count(),1);}
   await page.locator('.world-codex-launcher').click();await page.waitForSelector('#world-codex');assert.equal(await page.locator('#world-codex h1').textContent(),'Find the masks');
   await page.keyboard.press('j');await page.waitForSelector('#world-codex',{state:'detached'});await page.keyboard.press('j');await page.waitForSelector('#world-codex');
   await page.locator('#chat').focus();await page.keyboard.type('j');assert.equal(await page.locator('#chat').inputValue(),'j');assert(await page.locator('#world-codex').isVisible());await page.locator('#chat').blur();
   await page.evaluate(()=>game.keybindings.set('world-codex','open',[{key:'KeyK',modifiers:['SHIFT']}])) ;await page.keyboard.press('j');assert(await page.locator('#world-codex').isVisible());await page.keyboard.press('Shift+k');await page.waitForSelector('#world-codex',{state:'detached'});await page.keyboard.press('Shift+k');await page.waitForSelector('#world-codex');
   await page.evaluate(()=>new (game.settings.menus.get('world-codex.keybindings').type)().render());assert.deepEqual(await page.evaluate(()=>keybindingOptions),{initialCategory:'world-codex'});
   await page.evaluate(()=>paintDirectory());assert.equal(await page.locator('.world-codex-launcher').count(),1);
   if(role==='gm'){
    await page.locator('.wc-page[data-record]').first().click({button:'right'});await page.getByRole('button',{name:'Настроить доступ',exact:true}).click();assert(await page.evaluate(()=>Boolean(window.ownershipDialog?.document)));
    await page.locator('summary[data-codex-folder]').first().click({button:'right'});await page.getByRole('button',{name:'Удалить папку',exact:true}).click();await page.waitForFunction(()=>!game.folders.get(fixture.folderId));assert(await page.evaluate(()=>Boolean(game.journal.get(fixture.recordId))));
    await page.locator('.wc-page[data-record]').first().click({button:'right'});await page.getByRole('button',{name:'Удалить запись',exact:true}).click();await page.waitForFunction(()=>!game.journal.get(fixture.recordId));
   }else{await page.locator('.wc-page[data-record]').first().click({button:'right'});assert.equal(await page.locator('#test-menu').count(),0);}
   assert.deepEqual(await page.evaluate(()=>errors),[]);results.push({browser:name,case:`fresh ${role}: launch, hide, typing, rebind, menus, permission checks`,passed:true});await ctx.close();
  }
  const ctx=await browser.newContext(),failed=await ctx.newPage();let attempts=0;
  await failed.route('**/scripts/runtime.js?*',async route=>{attempts++;if(attempts<=2)await route.fulfill({status:429,body:'Too Many Requests',contentType:'text/plain'});else await route.continue();});
  await ready(failed,base+'/',false);assert(await failed.evaluate(()=>game.ready));
  await failed.waitForFunction(()=>game.modules.get('world-codex').api.loader.state==='retrying');assert.equal(attempts,1);
  await failed.keyboard.press('j');await failed.waitForFunction(()=>game.modules.get('world-codex').api.loader.state==='ready',{},{timeout:30000});await failed.waitForSelector('#world-codex');assert.equal(attempts,3);assert.equal(await failed.evaluate(()=>game.modules.get('world-codex').api.loadError),null);assert.deepEqual(await failed.evaluate(()=>errors),[]);
  results.push({browser:name,case:'ready remains available through two 429 failures, then runtime recovers without reload',passed:true});await ctx.close();

 }finally{await browser.close();}
}
console.log(JSON.stringify(results,null,2));assert(results.some(r=>r.passed),'No browser engine ran');
}finally{server.close();}
