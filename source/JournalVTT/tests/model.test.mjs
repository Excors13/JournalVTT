import test from "node:test";
import assert from "node:assert/strict";
import {defaultPolicies,roleOwnership,diaryOwnership,ownershipPatch,sameOwnership,cleanRecord,folderTree,safeImagePath} from "../scripts/model.js";

const users=[{id:"player",role:1},{id:"trusted",role:2},{id:"assistant",role:3},{id:"gm",role:4},{id:"blocked",role:0}];
test("trusted player can contribute to world while quests remain read-only",()=>{
  const rules=defaultPolicies();assert.equal(roleOwnership(rules,"world",users).trusted,3);assert.equal(roleOwnership(rules,"quests",users).trusted,2);assert.equal(roleOwnership(rules,"world",users).player,2);assert.equal(roleOwnership(rules,"world",users).default,0);assert.equal(roleOwnership(rules,"world",users).blocked,0);
});
test("diary defaults never expose another user's writing",()=>{assert.deepEqual(diaryOwnership("player",users),{default:0,player:3});assert.deepEqual(diaryOwnership("blocked",users),{default:0,blocked:0});});
test("ownership revokes stale grants with v14-valid numeric levels",()=>{assert.deepEqual(ownershipPatch({default:0,player:3,intruder:3},{default:0,player:3}),{default:0,player:3,intruder:0});});
test("revoked overrides compare equal to the fallback without repeated synchronization",()=>{assert(sameOwnership({default:0,player:3,intruder:0},{default:0,player:3}));assert(!sameOwnership({default:2,player:0},{default:2}));});
test("ownership comparison ignores key order and accepts Foundry numeric levels",()=>{assert(sameOwnership({a:3,default:0},{default:0,a:3}));assert(!sameOwnership({a:3,default:0},{default:0,a:2}));});
test("record validation rejects script URLs and invalid objective states",()=>{
  const d=cleanRecord({section:"quests",image:"javascript:alert(1)",links:["JournalEntry.abcd","JournalEntry.abcd","Macro.secret"],quest:{status:"bogus",objectives:[{text:"  Проверить мост  ",state:"bogus"},{text:" "}]}});
  assert.equal(d.image,"");assert.equal(d.links,undefined);assert.deepEqual(d.quest,{status:"active",objectives:[{id:"",text:"Проверить мост",state:"todo"}]});
});
test("nested folders keep every record at its correct path",()=>{
  const records=[{doc:{id:"one"},meta:{folder:"Пограничье / Заставы"}},{doc:{id:"two"},meta:{folder:"Пограничье/Дороги"}},{doc:{id:"three"},meta:{folder:""}}];const tree=folderTree(records);
  assert.equal(tree.records[0].doc.id,"three");assert.equal(tree.children.get("Пограничье").children.get("Заставы").records[0].doc.id,"one");
});
test("image paths allow server assets and HTTPS, rejecting executable schemes",()=>{
  for(const bad of ["javascript:alert(1)","data:image/svg+xml,test","file:///private","//evil.test/x","https:\n//evil.test"])assert.equal(safeImagePath(bad),"");
  assert.equal(safeImagePath("worlds/campaign/portrait.webp"),"worlds/campaign/portrait.webp");assert.equal(safeImagePath("https://example.org/portrait.webp"),"https://example.org/portrait.webp");
});

test("map coordinates, font data and types are validated without discarding valid pins",async()=>{
  const {cleanMap,SECTIONS}=await import("../scripts/model.js");assert.deepEqual(Object.values(SECTIONS),["Задания","Мир","Персонажи","Фракции","Места","Бестиарий","Карты"]);
  const data=cleanMap({pins:[{id:"a",name:"Мост",uuid:"JournalEntry.abcd",x:-1,y:99,type:"invalid"},{id:"a",name:"Duplicate",uuid:"JournalEntry.abcd"}],labels:[{id:"b",text:"Лес",x:"not a number",y:.2,size:100,bold:true,angle:999,color:"red;display:none",align:"center"}]});
  assert.equal(data.pins.length,1);assert.equal(data.pins[0].type,"interest");assert.equal(data.pins[0].x,0);assert.equal(data.pins[0].y,1);assert.equal(data.labels[0].x,.5);assert.equal(data.labels[0].size,64);assert.equal(data.labels[0].angle,180);assert.equal(data.labels[0].color,"#40351e");
});

