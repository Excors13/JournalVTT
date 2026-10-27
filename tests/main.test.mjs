import test,{beforeEach} from "node:test";
import assert from "node:assert/strict";
import {setup} from "./fixtures.mjs";
import {ID} from "../scripts/model.js";
import {createRecord,meta,synchronizeOwnership} from "../scripts/store.js";

const hooks=new Map();
globalThis.Hooks={once:(name,fn)=>hooks.set(name,fn),on:(name,fn)=>hooks.set(name,fn)};
let discard=true,confirmations=0;
class Application {
  async render(){this.rendered=true;return this;}
  async close(){this.rendered=false;return this;}
  bringToFront(){}
}
globalThis.foundry={applications:{api:{ApplicationV2:Application,DialogV2:{confirm:async()=>{confirmations++;return discard;}}}}};
globalThis.CONST={KEYBINDING_PRECEDENCE:{PRIORITY:0}};
globalThis.document={activeElement:null};
globalThis.window={innerWidth:1200,innerHeight:900};
globalThis.ui={notifications:{error:message=>{throw new Error(message);}}};
const {openCodex,toggleCodex}=await import("../scripts/main.js");
let binding,menus;
beforeEach(async()=>{
  setup();document.activeElement=null;discard=true;confirmations=0;
  menus=new Map();game.settings.register=()=>{};game.settings.registerMenu=(_id,key,value)=>menus.set(key,value);
  game.keybindings={register:(_id,_key,config)=>binding=config};
  game.modules=new Map([[ID,{version:"1.0.1"}]]);
  hooks.get("init")();
  const app=await openCodex();app.editing=null;app.dirty=false;app.saving=false;await app.close();
});

test("default J opens, closes and reopens the same codex; API open keeps it open",async()=>{
  assert.deepEqual(binding.editable,[{key:"KeyJ"}]);
  assert.equal(binding.repeat,false);
  assert.equal(binding.onDown({}),true);
  await new Promise(setImmediate);
  const app=await openCodex();assert.equal(app.rendered,true);
  await toggleCodex();assert.equal(app.rendered,false);
  await toggleCodex();assert.equal(app.rendered,true);
  assert.equal(await openCodex(),app);assert.equal(app.rendered,true);
});

test("J is left to text inputs and composed-path rich editors; held J does not toggle",async()=>{
  const app=await openCodex();
  const field={closest:()=>({})};document.activeElement=field;
  assert.equal(binding.onDown({}),false);
  document.activeElement=null;
  assert.equal(binding.onDown({event:{composedPath:()=>[field]}}),false);
  assert.equal(binding.onDown({repeat:true}),true);
  await new Promise(setImmediate);assert.equal(app.rendered,true);
});

test("closing with J respects discard confirmation and a save in progress",async()=>{
  const app=await openCodex(),edit={draft:{name:"Unsaved"}};
  app.editing=edit;app.dirty=true;discard=false;
  await toggleCodex();assert.equal(app.rendered,true);assert.equal(app.editing,edit);
  assert.equal(confirmations,1);
  app.saving=true;await toggleCodex();assert.equal(app.rendered,true);assert.equal(confirmations,1);
  app.saving=false;discard=true;await toggleCodex();assert.equal(app.rendered,false);assert.equal(app.editing,null);
});

test("a second toggle during rendering does not race the window lifecycle",async()=>{
  const app=await openCodex();await app.close();
  const original=app.render;let finish;
  app.render=async()=>{await new Promise(resolve=>finish=resolve);return original.call(app);};
  try{const first=toggleCodex();await toggleCodex();finish();await first;assert.equal(app.rendered,true);}
  finally{app.render=original;}
});

test("native ownership saves become manual exceptions and survive section synchronization",async()=>{
  const doc=await createRecord({name:"Hidden record",section:"world"},"<p>Text</p>");
  const changes={ownership:{p:0,t:3}};
  hooks.get("preUpdateJournalEntry")(doc,changes,{});
  await doc.update(changes);assert.equal(meta(doc).accessMode,"manual");
  await synchronizeOwnership({applyDefaults:true});
  assert.equal(doc.ownership.p,0);assert.equal(doc.ownership.t,3);
  const managed={ownership:{p:2}};
  hooks.get("preUpdateJournalEntry")(doc,managed,{wcManaged:true});
  assert.equal(managed[`flags.${ID}.data.accessMode`],undefined);
});



test("entering the world as GM automatically applies pending offline ownership",async()=>{
  const doc=await createRecord({name:'Created while GM was away',section:'world'},'<p>Offline text</p>');doc.ownership={default:0,t:3};Object.assign(meta(doc),{creatorId:'t',ownershipPending:true});
  game.ready=true;hooks.get('ready')();await new Promise(resolve=>setTimeout(resolve,250));
  assert.equal(meta(doc).ownershipPending,false);assert.equal(doc.ownership.p,2);assert.equal(doc.ownership.t,3);assert.equal(doc.pages[0].text.content,'<p>Offline text</p>');
});

test("players can open the keybinding settings directly from module settings",async()=>{
  game.user=game.users.get("p");assert.equal(binding.restricted,false);assert.equal(menus.get("keybindings").restricted,false);assert.equal(menus.get("open").restricted,false);
  let configured,rendered;
  foundry.applications.sidebar={apps:{ControlsConfig:class {constructor(options){configured=options;}render(options){rendered=options;return this;}}}};
  new (menus.get("keybindings").type)().render();assert.deepEqual(configured,{initialCategory:ID});assert.deepEqual(rendered,{force:true});
});

test("record deletion confirms, enforces GM permission and preserves a canceled record",async()=>{
  const doc=await createRecord({name:"Delete",section:"world"},"<p>Text</p>"),app=await openCodex();
  discard=false;await app.deleteRecordEntry(doc);assert.equal(game.journal.get(doc.id),doc);
  game.user=game.users.get("t");await assert.rejects(()=>app.deleteRecordEntry(doc),/мастер/);
  game.user=game.users.get("gm");discard=true;await app.deleteRecordEntry(doc);assert.equal(game.journal.get(doc.id),undefined);
});

test("v14 context menus retain ownership and expose folder/record deletion only to the GM",async()=>{
  const app=await openCodex(),menus=[];app._createContextMenu=(entries,selector)=>menus.push({entries:entries(),selector});
  app.registerContextMenus();assert(menus.find(m=>m.selector===".wc-page[data-record]").entries.some(e=>e.label==="Настроить доступ"));
  assert(menus.find(m=>m.selector==="summary[data-codex-folder]").entries.some(e=>e.label==="Удалить папку"));
  game.user=game.users.get("p");menus.length=0;app.registerContextMenus();assert.equal(menus.length,1);assert.equal(menus[0].selector,".wc-page[data-diary-page]");
});
