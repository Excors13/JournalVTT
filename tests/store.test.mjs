import test from "node:test";
import assert from "node:assert/strict";
import {setup,MockDocument} from "./fixtures.mjs";
import {ID,defaultPolicies} from "../scripts/model.js";
import {createRecord,saveRecord,synchronizeOwnership,provisionDiaries,visibleDiaries,visibleRecords,saveDiary,versionOf,meta,useSectionOwnership} from "../scripts/store.js";

test("role changes update inherited ownership and preserve native manual exceptions",async()=>{
  setup();const inherited=await createRecord({name:"World",section:"world"},"<p>World</p>");const manual=await createRecord({name:"Exception",section:"world"},"");
  manual.ownership.t=0;game.users.get("t").role=1;
  await synchronizeOwnership();assert.equal(inherited.ownership.t,2);assert.equal(manual.ownership.t,0);assert.equal(meta(manual).accessMode,"manual");
  await useSectionOwnership(manual);assert.equal(meta(manual).accessMode,"section");assert.equal(manual.ownership.t,2);
});
test("defaults-only edits stay defaults-only across later synchronization",async()=>{
  const env=setup();const doc=await createRecord({name:"Old",section:"world"},"");const rules=defaultPolicies();rules.world[2]=0;env.setRules(rules);
  await synchronizeOwnership();assert.equal(doc.ownership.t,3);
  const newer=await createRecord({name:"New",section:"world"},"");assert.equal(newer.ownership.t,0);
  await synchronizeOwnership({applyDefaults:true});assert.equal(doc.ownership.t,0);
});
test("private diaries are created once per player, without any other explicit grants",async()=>{
  setup();await provisionDiaries();await provisionDiaries();const diaries=game.journal.filter(d=>meta(d)?.kind==="diary");assert.equal(diaries.length,2);
  const own=diaries.find(d=>meta(d).ownerId==="p");own.ownership.t=3;await provisionDiaries();assert.deepEqual(own.ownership,{default:0,p:3});
  game.user=game.users.get("p");assert.equal(visibleDiaries().length,1);assert.equal(meta(visibleDiaries()[0]).ownerId,"p");
});
test("player writes own diary without permission to create top-level journals",async()=>{
  setup();await provisionDiaries();const doc=game.journal.find(d=>meta(d)?.ownerId==="p");game.user=game.users.get("p");const page=await saveDiary(doc,null,{name:"Новая запись",date:"Первый день"},"<p>Мой текст</p>",versionOf(doc));assert.equal(page.name,"Новая запись");assert.equal(page.text.content,"<p>Мой текст</p>");
  game.user=game.users.get("t");await assert.rejects(()=>saveDiary(doc,null,{name:"Forbidden"},"",versionOf(doc)),/только его автор/);
});
test("contributor edits world content but cannot move it into quests or change ownership",async()=>{
  setup();const doc=await createRecord({name:"World",section:"world"},"<p>Old</p>");const ownership=structuredClone(doc.ownership);game.user=game.users.get("t");
  await saveRecord(doc,{name:"Updated",section:"quests",quest:{status:"completed",objectives:[]},links:[]},"<p>New</p>",versionOf(doc));assert.equal(meta(doc).section,"world");assert.equal(doc.pages[0].text.content,"<p>New</p>");assert.deepEqual(doc.ownership,ownership);
  const quest=new MockDocument({name:"Quest",ownership:{default:0,t:2},flags:{[ID]:{data:{kind:"record",section:"quests"}}}});await assert.rejects(()=>saveRecord(quest,{name:"No"},"",versionOf(quest)),/Нет права/);
});
test("stale editors cannot silently overwrite changes",async()=>{
  setup();const doc=await createRecord({name:"Shared",section:"world"},"<p>Old</p>");const version=versionOf(doc);await doc.update({name:"Changed by someone else"});await assert.rejects(()=>saveRecord(doc,{name:"Stale",section:"world"},"<p>Stale</p>",version),/изменилась/);assert.equal(doc.pages[0].text.content,"<p>Old</p>");
});
test("unrelated journals are not included or changed by access synchronization",async()=>{
  setup();const unrelated=new MockDocument({name:"GM notes",ownership:{default:0,t:0}});game.journal.push(unrelated);const before=versionOf(unrelated);await synchronizeOwnership({applyDefaults:true});assert.equal(versionOf(unrelated),before);assert.equal(visibleRecords().length,0);
});

test("empty nested folders persist and journals move without changing quest state",async()=>{
  setup();const {saveFolder,moveRecord,folderIdOf,sectionFolders}=await import("../scripts/store.js");
  const active=await saveFolder("quests","В процессе"),done=await saveFolder("quests","Завершённые"),nested=await saveFolder("quests","История",done.id);
  assert.equal(sectionFolders("quests").length,3);assert.equal(folderIdOf(nested),done.id);
  const q=await createRecord({name:"Quest",section:"quests",folderId:active.id,quest:{status:"active",objectives:[]}},"");await moveRecord(q,done.id);assert.equal(folderIdOf(q),done.id);assert.equal(meta(q).quest.status,"active");
  await assert.rejects(()=>saveFolder("quests","Завершённые",nested.id,done.id),/внутрь/);
  const wrong=await saveFolder("world","История мира");await assert.rejects(()=>moveRecord(q,wrong.id),/текущего раздела/);
});
test("quest goals and maps require ownership and reject stale writes",async()=>{
  setup();const {setObjectiveState,saveMap}=await import("../scripts/store.js");
  const q=await createRecord({name:"Q",section:"quests",quest:{objectives:[{text:"Goal",state:"todo"}]}},"");const stale=versionOf(q);await setObjectiveState(q,0,"done",stale);assert.equal(meta(q).quest.objectives[0].state,"done");await assert.rejects(()=>setObjectiveState(q,0,"failed",stale),/изменилось/);
  const m=await createRecord({name:"Map",section:"maps"},"");await saveMap(m,{labels:[{id:"l",text:"Лес",x:.2,y:.3,size:24,bold:true}],pins:[{id:"p",name:"Мост",uuid:q.uuid,type:"unknown",x:.5,y:.5}]},versionOf(m));assert.equal(meta(m).map.labels[0].bold,true);assert.equal(meta(m).map.pins[0].uuid,q.uuid);
  game.user=game.users.get("p");await assert.rejects(()=>saveMap(m,{labels:[],pins:[]},versionOf(m)),/Нет права/);await assert.rejects(()=>setObjectiveState(q,0,"todo",versionOf(q)),/Нет права/);
});
test("facts survive edits, managed folder order persists, and migrations preserve body",async()=>{
  setup();const {saveFolder,moveRecord,folderIdOf,migrateRecords}=await import("../scripts/store.js");
  const f=await saveFolder("world","Хроника"),a=await createRecord({name:"A",section:"world",folderId:f.id,facts:[{label:"Тема",value:"Религии"}]},"<h2>Обряды</h2><p>Текст</p>"),b=await createRecord({name:"B",section:"world",folderId:f.id},"");await moveRecord(b,f.id,a.id);assert(b.sort<a.sort);assert.equal(meta(a).facts[0].label,"Тема");
  const old=new MockDocument({name:"Legacy",folder:folderIdOf(a),ownership:{default:0},pages:[{type:"text",text:{content:"<h2>Old</h2>"}}],flags:{[ID]:{data:{kind:"record",section:"world",schema:1,folder:"Старое/Вложенное"}}}});game.journal.push(old);await migrateRecords();assert.equal(meta(old).schema,2);assert.equal(old.pages[0].text.content,"<h2>Old</h2>");assert.equal(game.folders.get(folderIdOf(old)).name,"Вложенное");
});
