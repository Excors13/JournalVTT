import vm from 'node:vm';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const source=await fs.readFile('scripts/bootstrap.js','utf8'),scenario=process.argv[2];
const hooks=new Map(),timers=[],notices=[],requests=[];let key,registered=0,resumed=0,opened=0;
const module={version:'1.0.3'},game={ready:scenario==='late-start',modules:new Map([['world-codex',module]]),keybindings:{register(_id,_key,value){registered++;key=value;}}};
const ready=()=>{game.ready=true;hooks.get('ready')?.();};
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};
let importResult=async()=>{throw new TypeError('HTTP 429 Too Many Requests');};
const context=vm.createContext({game,URL,document:{activeElement:null},CONST:{KEYBINDING_PRECEDENCE:{PRIORITY:0}},Math:Object.assign(Object.create(Math),{random:()=>0}),Date,Promise,
  setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},
  Hooks:{once:(name,fn)=>hooks.set(name,fn)},console:{warn(){},error(){}},ui:{notifications:Object.fromEntries(['warn','error','info'].map(level=>[level,(message,options)=>notices.push({level,message,options})]))}});
const entry=()=>new vm.SourceTextModule(source,{context,initializeImportMeta:meta=>meta.url='https://foundry.example/modules/world-codex/scripts/bootstrap.js',importModuleDynamically:async spec=>{requests.push(spec);return importResult();}});
const evaluate=async()=>{const mod=entry();await mod.link(()=>{});await mod.evaluate();};
const tick=async()=>{const timer=timers.shift();assert(timer);timer.fn();await flush();return timer.delay;};
const success=async()=>{
  const runtime=new vm.SyntheticModule(['resumeCodex'],function(){this.setExport('resumeCodex',()=>{resumed++;module.api.toggle=async()=>{};module.api.open=async()=>opened++;});},{context});await runtime.link(()=>{});await runtime.evaluate();return runtime;
};
await evaluate();
if(scenario==='deferred'){
  assert.equal(requests.length,0);assert.equal(timers.length,0);hooks.get('init')();assert.equal(registered,1);assert.equal(key.restricted,false);ready();assert.equal(requests.length,0);assert.equal(timers[0].delay,2000);
  importResult=success;await tick();assert.equal(requests.length,1);assert.equal(module.api.loader.state,'ready');assert.equal(resumed,1);assert.equal(timers.length,0);
}else if(scenario==='retry'||scenario==='backoff'){
  hooks.get('init')();ready();const expected=scenario==='backoff'?[2000,3000,6000,12000,24000,48000,...Array(34).fill(60000)]:[2000,3000];
  for(const delay of expected){assert.equal(await tick(),delay);assert.equal(timers.length,1);}
  assert.equal(requests.length,expected.length);assert.equal(new Set(requests).size,requests.length);assert.equal(notices.filter(n=>n.level==='warn').length,1);assert.equal(notices.filter(n=>n.level==='error').length,0);assert.equal(module.api.loader.state,'retrying');
}else if(scenario==='fatal'){
  ready();importResult=async()=>{throw new SyntaxError('Bad source');};await tick();assert.equal(module.api.loader.state,'error');assert.equal(timers.length,0);assert.equal(notices.filter(n=>n.level==='error').length,1);
}else if(scenario==='offline-then-success'){
  hooks.get('init')();ready();await tick();key.onDown({});importResult=success;await tick();assert.equal(requests.length,2);assert.equal(module.api.loadError,null);assert.equal(resumed,1);assert.equal(opened,1);assert.equal(timers.length,0);assert.equal(module.api.loader.state,'ready');assert.equal(notices.filter(n=>n.level==='info').length,1);
}else if(scenario==='inflight'){
  let finish;importResult=()=>new Promise(resolve=>finish=resolve);ready();const callback=timers[0].fn;await tick();assert.equal(requests.length,1);callback();await flush();assert.equal(requests.length,1);finish(await success());await flush();assert.equal(module.api.loader.state,'ready');
}else if(scenario==='late-start'){
  assert.equal(timers.length,1);importResult=success;await tick();assert.equal(module.api.loader.state,'ready');assert.equal(resumed,1);
}else if(scenario==='duplicate-entry'){
  await evaluate();assert.equal(hooks.size,2);hooks.get('init')();assert.equal(registered,1);ready();assert.equal(timers.length,1);
}

if(scenario==='init-error'){
  ready();importResult=async()=>{
    const broken=new vm.SyntheticModule(['resumeCodex'],function(){this.setExport('resumeCodex',()=>{throw new Error('Broken init');});},{context});await broken.link(()=>{});await broken.evaluate();return broken;
  };
  await tick();assert.equal(module.api.loader.state,'error');assert.equal(timers.length,0);assert.equal(requests.length,1);assert.equal(notices.filter(n=>n.level==='error').length,1);
}else if(scenario==='typing'){
  hooks.get('init')();context.document.activeElement={closest:()=>({})};assert.equal(key.onDown({}),false);context.document.activeElement=null;assert.equal(key.onDown({repeat:true}),true);
  ready();importResult=success;await tick();assert.equal(opened,0);assert.equal(module.api.loader.state,'ready');
}
