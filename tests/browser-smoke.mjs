import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {chromium,firefox,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)),harness=await fs.readFile(path.join(root,'tests/browser-harness.html'));
const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end(harness);return;}const data=await fs.readFile(path.join(root,pathname));res.setHeader('Content-Type',pathname.endsWith('.js')||pathname.endsWith('.mjs')?'text/javascript':pathname.endsWith('.css')?'text/css':pathname.endsWith('.svg')?'image/svg+xml':'text/plain');res.end(data);}catch{res.statusCode=404;res.end('not found');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
async function ready(page,url,waitForRuntime=true){
 await page.goto(url);await page.waitForFunction(()=>window.testReady||window.harnessError);assert.equal(await page.evaluate(()=>window.harnessError),undefined);
 if(waitForRuntime){await page.waitForFunction(()=>game.modules.get('world-codex').api?.loader?.state==='ready');}
}
const results=[];
async function checkNavigationLayout(page){
 const original=await page.locator('#world-codex').evaluate(el=>el.style.width);
 for(const width of [1120,900,700,500]){
  await page.locator('#world-codex').evaluate((el,width)=>el.style.width=`${width}px`,width);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const layout=await page.evaluate(()=>{const rect=selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,scrollWidth:el.scrollWidth};};return {app:rect('#world-codex'),tabs:rect('.wc-tabs'),nav:rect('.wc-main-tabs'),diary:rect('.wc-diary-button'),heroes:rect('.wc-heroes-button'),shell:rect('.wc-shell'),top:rect('.wc-top')};});
  assert(layout.nav.width>layout.app.width/2,'Main navigation collapsed into a narrow column');assert(layout.tabs.height<160,'Navigation displaced the workspace');assert(layout.heroes.left>=layout.diary.right);assert(Math.abs(layout.diary.top-layout.heroes.top)<1);assert(layout.shell.height>layout.app.height/2);assert(layout.tabs.scrollWidth<=layout.tabs.width+1);assert(layout.top.scrollWidth<=layout.app.width+1);
 }
 await page.locator('#world-codex').evaluate((el,width)=>el.style.width=width,original);
}
try{
for(const [engine,name] of [[chromium,'Chromium'],[firefox,'Firefox'],[webkit,'WebKit']]){
 const browser=await engine.launch({headless:true,args:name==='Chromium'?['--no-sandbox']:[]});
 try{
  for(const role of ['p','t','gm']){
   const ctx=await browser.newContext(),page=await ctx.newPage(),runtimeRequests=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/scripts/runtime.js')runtimeRequests.push(r.url());});await ready(page,base+'/?role='+role);assert.equal(runtimeRequests.length,1);assert(await page.locator('.world-codex-launcher').isVisible());
   if(role!=='gm'){assert.equal(await page.locator('.folder.wc-native').count(),0);assert.equal(await page.locator('.directory-list .directory-item').count(),1);}
   await page.locator('.world-codex-launcher').click();await page.waitForSelector('#world-codex');assert.equal(await page.locator('#world-codex h1').textContent(),'Find the masks');
   await checkNavigationLayout(page);
   await page.keyboard.press('j');await page.waitForSelector('#world-codex',{state:'detached'});await page.keyboard.press('j');await page.waitForSelector('#world-codex');
   await page.locator('#chat').focus();await page.keyboard.type('j');assert.equal(await page.locator('#chat').inputValue(),'j');assert(await page.locator('#world-codex').isVisible());await page.locator('#chat').blur();
   await page.evaluate(()=>game.keybindings.set('world-codex','open',[{key:'KeyK',modifiers:['SHIFT']}])) ;await page.keyboard.press('j');assert(await page.locator('#world-codex').isVisible());await page.keyboard.press('Shift+k');await page.waitForSelector('#world-codex',{state:'detached'});await page.keyboard.press('Shift+k');await page.waitForSelector('#world-codex');
   await page.evaluate(()=>new (game.settings.menus.get('world-codex.keybindings').type)().render());assert.deepEqual(await page.evaluate(()=>keybindingOptions),{initialCategory:'world-codex'});
   await page.evaluate(()=>paintDirectory());assert.equal(await page.locator('.world-codex-launcher').count(),1);
   if(role==='gm'){
    // Browser-native DataTransfer with the real folder handlers and persisted tree.
    const second=await page.evaluate(async()=>{const store=await import('/scripts/store.js');const f=await store.saveFolder('quests','Later');await game.modules.get('world-codex').api.open();return f.id;});
    const dragFolder=async(id,targetId,ratio)=>{
     const data=await page.evaluateHandle(()=>new DataTransfer()),source=page.locator(`summary[data-codex-folder="${id}"]`),target=targetId?page.locator(`summary[data-codex-folder="${targetId}"]`):page.locator('.wc-root-drop');
     const rect=await target.boundingBox(),clientY=rect.y+rect.height*ratio;
     await source.dispatchEvent('dragstart',{dataTransfer:data});await target.dispatchEvent('dragover',{dataTransfer:data,clientY});assert.equal(await target.getAttribute('data-folder-drop'),!targetId?'inside':ratio<0.25?'before':ratio>0.75?'after':'inside');await target.dispatchEvent('drop',{dataTransfer:data,clientY});await data.dispose();
    };
    await dragFolder(second,await page.evaluate(()=>fixture.folderId),0.1);
    await page.waitForFunction(id=>document.querySelector('.wc-tree > details')?.dataset.codexFolder===id,second);
    await dragFolder(second,await page.evaluate(()=>fixture.folderId),0.5);
    await page.waitForFunction(id=>{const f=game.folders.get(id);return (f.folder?.id||f.folder)===fixture.folderId;},second);
    await page.waitForSelector(`details[data-codex-folder="${await page.evaluate(()=>fixture.folderId)}"] > details[data-codex-folder="${second}"]`);
    await dragFolder(second,null,0.5);await page.waitForSelector(`.wc-tree > details[data-codex-folder="${second}"]`);await page.waitForFunction(id=>{const f=game.folders.get(id),root=game.folders.get(fixture.folderId);return (f.folder?.id||f.folder)===(root.folder?.id||root.folder);},second);
    // Remove the extra empty folder so the following original context-menu case targets the fixture.
    await page.evaluate(async id=>{const store=await import('/scripts/store.js');await store.deleteFolder(game.folders.get(id));await game.modules.get('world-codex').api.open();},second);
    await page.locator('.wc-page[data-record]').first().click({button:'right'});await page.getByRole('button',{name:'Настроить доступ',exact:true}).click();assert(await page.evaluate(()=>Boolean(window.ownershipDialog?.document)));
    await page.locator('summary[data-codex-folder]').first().click({button:'right'});await page.getByRole('button',{name:'Удалить папку',exact:true}).click();await page.waitForFunction(()=>!game.folders.get(fixture.folderId));assert(await page.evaluate(()=>Boolean(game.journal.get(fixture.recordId))));
    await page.locator('.wc-page[data-record]').first().click({button:'right'});await page.getByRole('button',{name:'Удалить запись',exact:true}).click();await page.waitForFunction(()=>!game.journal.get(fixture.recordId));
   }else{await page.locator('.wc-page[data-record]').first().click({button:'right'});assert.equal(await page.locator('#test-menu').count(),0);}
   await page.locator('.wc-heroes-button').click();await page.waitForFunction(()=>document.querySelector('#world-codex h1')?.textContent==='Remembered hero');assert.equal(await page.locator('.wc-main-tabs > button').count(),7);assert.equal(await page.locator('.wc-heroes-button').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.wc-main-tabs').getByText('Герои',{exact:true}).count(),0);
   await page.locator('.wc-diary-button').click();await page.waitForFunction(()=>document.querySelector('.wc-diary-button')?.getAttribute('aria-pressed')==='true');await page.locator('.wc-heroes-button').click();await page.waitForFunction(()=>document.querySelector('#world-codex h1')?.textContent==='Remembered hero');
   await page.locator('.wc-art img.wc-framed-image').waitFor({state:'visible'});
   if(role==='gm'){
    await page.getByRole('button',{name:'Редактировать',exact:true}).click();await page.locator('.wc-frame-preview img').waitFor({state:'visible'});
    const box=await page.locator('.wc-frame-preview').boundingBox();assert(Math.abs(box.width/box.height-5/6)<0.01);
    await page.getByLabel('Размещение',{exact:true}).selectOption('contain');
    for(const [key,value] of [['zoom','2'],['x','0.2']])await page.locator(`[data-frame-control="${key}"]`).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
    const preview=await page.locator('.wc-frame-preview img').evaluate(el=>({width:el.style.width,height:el.style.height,left:el.style.left,top:el.style.top}));
    await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.waitForSelector('.wc-frame-preview',{state:'detached'});await page.locator('.wc-art img.wc-framed-image').waitFor({state:'visible'});
    assert.deepEqual(await page.locator('.wc-art img.wc-framed-image').evaluate(el=>({width:el.style.width,height:el.style.height,left:el.style.left,top:el.style.top})),preview);
    assert.deepEqual(await page.evaluate(()=>game.journal.get(fixture.heroId).getFlag('world-codex','data').imageFrame),{fit:'contain',zoom:2,x:0.2,y:0.5});
   }
   assert.deepEqual(await page.evaluate(()=>errors),[]);results.push({browser:name,case:`fresh ${role}: launch, hide, typing, rebind, menus, permission checks and separate heroes catalog`,passed:true});await ctx.close();
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
