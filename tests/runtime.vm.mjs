import vm from 'node:vm';import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {setup} from './fixtures.mjs';
setup();const module={version:'1.2.3',__codexBindingRegistered:true,api:{loader:{state:'loading'}}};game.modules=new Map([['world-codex',module]]);game.ready=true;
let settings=0,menus=0,bindings=0;game.settings.register=()=>settings++;game.settings.registerMenu=()=>menus++;game.keybindings={register(){bindings++;}};
const hooks=[],timers=[];class Application{async render(){this.rendered=true;return this;}async close(){this.rendered=false;return this;}bringToFront(){}}
const context=vm.createContext({game,CONFIG,JournalEntry,Folder,structuredClone,crypto,Map,Set,URL,window:{innerWidth:1200,innerHeight:800},document:{activeElement:null},console,CONST:{KEYBINDING_PRECEDENCE:{PRIORITY:0}},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},Hooks:{once:(event,callback)=>hooks.push({event,callback}),on:(event,callback)=>hooks.push({event,callback})},ui:{notifications:{error:message=>{throw new Error(message);}}},foundry:{applications:{api:{ApplicationV2:Application,DialogV2:{confirm:async()=>true}}}}});
const source=await fs.readFile('scripts/runtime.js','utf8');let imports=0;
const runtime=new vm.SourceTextModule(source+'\nexport {__load as testLoad};',{context});await runtime.link(()=>{imports++;throw new Error('External import in bundle');});await runtime.evaluate();assert.equal(imports,0);
const fromBootstrap=process.argv[2]==='early-bootstrap';
if(fromBootstrap){
  context.game=undefined;module.__codexBindingRegistered=false;game.ready=false;let requests=0;
  const bootstrap=new vm.SourceTextModule(await fs.readFile('scripts/bootstrap.js','utf8'),{context,initializeImportMeta:meta=>meta.url='https://foundry.example/modules/world-codex/scripts/bootstrap.js',importModuleDynamically:async()=>{requests++;return runtime;}});
  await bootstrap.link(()=>{});await bootstrap.evaluate();assert.equal(settings,0);assert.equal(menus,0);assert.equal(requests,0);
  context.game=game;for(const hook of hooks.filter(h=>h.event==='init'))hook.callback();assert.equal(bindings,1);assert.equal(settings,0);
  game.ready=true;for(const hook of hooks.filter(h=>h.event==='ready'))hook.callback();assert.equal(requests,0);assert.equal(timers.length,1);
  timers.shift()();for(let i=0;i<12;i++)await new Promise(setImmediate);
  assert.equal(requests,1);assert.equal(module.api.loader.state,'ready');assert.equal(settings,2);assert.equal(menus,3);
}
const {resumeCodex,testLoad}=runtime.namespace;resumeCodex();assert.equal(settings,2);assert.equal(menus,3);assert.equal(bindings,fromBootstrap?1:0);assert.equal(module.__codexInitialized,true);assert.equal(module.__codexReady,true);assert.equal(module.api.loader.state,fromBootstrap?'ready':'loading');
const hookCount=hooks.length;resumeCodex();assert.equal(settings,2);assert.equal(menus,3);assert.equal(hooks.length,hookCount);assert.equal(timers.length,1);
const store=testLoad('store.js');assert.equal(store,testLoad('store.js'));
const doc=await store.createRecord({name:'Bundle record',section:'world'},'<p>Text</p>');assert.equal(store.meta(doc).kind,'record');
await store.provisionDiaries();assert.equal(store.visibleDiaries().length,2);
await module.api.toggle();const app=await module.api.open();assert.equal(app.rendered,true);await module.api.toggle();assert.equal(app.rendered,false);
for(const name of ['app.js','base-app.js','creation.js','demo.js','dom.js','experience.js','form-app.js','main.js','maps.js','model.js','notifications.js','settings.js','store.js'])assert(testLoad(name));
