import test from "node:test";
import assert from "node:assert/strict";
import {setup,MockDocument} from "./fixtures.mjs";
import {ID,cleanMap} from "../scripts/model.js";
import {importJournal,meta,createRecord,saveRecord,getBody,saveMap,versionOf,setObjectiveState} from "../scripts/store.js";
import {ViewHistory,WindowMode,accessSummary} from "../scripts/experience.js";
import {QuestNotices,questAdvanced,questSnapshot} from "../scripts/notifications.js";

test("history skips deleted/private views and discards forward branches after a new visit",()=>{
  const history=new ViewHistory();for(const id of ["a","private","b"])history.push({id});
  assert.equal(history.target(-1,s=>s.id!=="private"),0);history.index=0;history.push({id:"c"});
  assert.deepEqual(history.items,[{id:"a"},{id:"c"}]);history.push({id:"c"});assert.equal(history.items.length,2);
});

test("window expansion fits viewport, follows resize, restores geometry and removes listeners",()=>{
  const listeners=new Set(),view={innerWidth:1500,innerHeight:900,addEventListener:(_event,fn)=>listeners.add(fn),removeEventListener:(_event,fn)=>listeners.delete(fn)};
  const app={rendered:true,position:{left:80,top:40,width:900,height:700,scale:1},element:{ownerDocument:{defaultView:view},classList:{toggle(){}},querySelector:()=>null},setPosition(p){Object.assign(this.position,p);}};
  const mode=new WindowMode(app);mode.toggle();assert.equal(app.position.width,1500);assert.equal(listeners.size,1);
  view.innerWidth=1200;mode.resize();assert.equal(app.position.width,1200);mode.toggle();
  assert.deepEqual(app.position,{left:80,top:40,width:900,height:700,scale:1});assert.equal(listeners.size,0);
  mode.toggle();mode.detach();assert.equal(listeners.size,0);
});

test("import keeps original UUID, every page and native permissions; edits target the selected page",async()=>{
  setup();const doc=new MockDocument({name:"Chronicle",ownership:{default:0,p:2,t:3},pages:[{name:"First",type:"text",text:{content:"<h2>First</h2>"}},{name:"Second",type:"text",text:{content:"<h2>Second</h2>"}},{name:"Art",type:"image",src:"art.webp"}]});game.journal.push(doc);
  const uuid=doc.uuid,ownership=structuredClone(doc.ownership),pages=doc.pages.map(p=>p.id);
  await importJournal(doc,"world");assert.equal(doc.uuid,uuid);assert.deepEqual(doc.ownership,ownership);assert.deepEqual(doc.pages.map(p=>p.id),pages);assert.equal(meta(doc).accessMode,"manual");
  await saveRecord(doc,{...meta(doc),name:doc.name},"<p>Updated second</p>",versionOf(doc),doc.pages[1].id);
  assert.equal(doc.pages[0].text.content,"<h2>First</h2>");assert.equal(doc.pages[1].text.content,"<p>Updated second</p>");
  game.user=game.users.get("p");await assert.rejects(()=>importJournal(doc,"world"),/мастер/);
});

test("map hidden items survive normalization and contributor saves without being revealed or deleted",async()=>{
  setup();const doc=await createRecord({name:"Map",section:"maps"},"");await doc.update({ownership:{t:3}});
  const map=cleanMap({pins:[{id:"secret",name:"Secret",uuid:"JournalEntry.target",hidden:true}],labels:[{id:"hidden-label",text:"Secret region",hidden:true}]});
  await saveMap(doc,map,versionOf(doc));assert.equal(meta(doc).map.pins[0].hidden,true);
  game.user=game.users.get("t");await saveMap(doc,{pins:[],labels:[{id:"visible",text:"Known region",hidden:true}]},versionOf(doc));
  assert.equal(meta(doc).map.pins[0].id,"secret");assert.equal(meta(doc).map.pins[0].hidden,true);
  assert.equal(meta(doc).map.labels.find(l=>l.id==="hidden-label").hidden,true);assert.equal(meta(doc).map.labels.find(l=>l.id==="visible").hidden,false);
});

test("quest notifications fire once on completion, not on edits, loading or inaccessible quests",async()=>{
  setup();const doc=await createRecord({name:"Quest",section:"quests",quest:{objectives:[{id:"one",text:"Checkpoint",state:"todo"}]}},"");
  const shown=[],notices=new QuestNotices(d=>shown.push(d.id));notices.seed(game.journal);
  await doc.update({name:"New title"});notices.updated(doc);assert.equal(shown.length,0);
  await setObjectiveState(doc,0,"done",versionOf(doc));notices.updated(doc);notices.updated(doc);assert.equal(shown.length,1);
  await doc.update({[`flags.${ID}.data.quest.status`]:"completed"});notices.updated(doc);assert.equal(shown.length,2);
  const loaded=new QuestNotices(d=>shown.push(d.id));loaded.seed(game.journal);loaded.updated(doc);assert.equal(shown.length,2);
  game.user=game.users.get("p");await doc.update({ownership:{p:0},[`flags.${ID}.data.quest.status`]:"active"});notices.updated(doc);
  await doc.update({[`flags.${ID}.data.quest.status`]:"completed"});notices.updated(doc);assert.equal(shown.length,2);
});

test("reordering completed quest checkpoints does not cause false notifications",()=>{
  const before={status:"active",objectives:[{id:"a",state:"done"},{id:"b",state:"todo"}]};
  assert.equal(questAdvanced(before,{...before,objectives:[...before.objectives].reverse()}),false);
  assert.equal(questAdvanced(before,{...before,objectives:[{id:"new",state:"done"},...before.objectives]}),true);
});

test("access indicator summarizes explicit users and section exceptions",async()=>{
  setup();const doc=await createRecord({name:"World",section:"world"},"");
  assert.match(accessSummary(doc).label,/2\/2.*Права раздела/);
  await doc.update({ownership:{p:0},[`flags.${ID}.data.accessMode`]:"manual"});
  assert.match(accessSummary(doc).label,/1\/2.*Индивидуально/);assert.match(accessSummary(doc).title,/Player: Нет доступа/);
});
