import test from "node:test";
import assert from "node:assert/strict";
import {setup} from "./fixtures.mjs";
import {ID,defaultPolicies} from "../scripts/model.js";
import {canCreateInSection,createRecord,saveFolder,meta,folderIdOf} from "../scripts/store.js";
import {handleCreationRequest,requestCreation} from "../scripts/creation.js";

function prepare(){
  const state=setup();
  for(const user of game.users){user.active=true;user.flags={};user.getFlag=(scope,key)=>user.flags[scope]?.[key];user.setFlag=async(scope,key,value)=>{(user.flags[scope]??={})[key]=structuredClone(value);return user;};}
  return state;
}
test("role ownership permits creating only inside the granted section, independent of a single record's ownership",async()=>{
  const {setRules}=prepare(),rules=defaultPolicies();rules.characters[1]=3;setRules(rules);
  game.user=game.users.get("p");assert.equal(canCreateInSection("characters"),true);assert.equal(canCreateInSection("quests"),false);
  await assert.rejects(()=>createRecord({name:"Quest",section:"quests"},""),/Владелец/);
  await assert.rejects(()=>saveFolder("quests","No"),/Владелец/);
  await assert.rejects(()=>requestCreation("record",{name:"Denied",section:"quests"}),/Нет права/);
});

test("GM relay uses authenticated writer, validates section policy and ignores supplied flags/ownership/body",async()=>{
  prepare();const player=game.users.get("t");
  await player.setFlag(ID,"creationRequest",{id:"auth-owner",action:"record",section:"world",name:"World record",ownership:{default:3},body:"private text",flags:{bad:true}});
  assert.equal(handleCreationRequest(player,{}, {},"p"),undefined);assert.equal(game.journal.length,0);
  const result=await handleCreationRequest(player,{}, {},player.id);assert.equal(result.ok,true);
  const doc=game.journal.get(result.id);assert.equal(meta(doc).section,"world");assert.equal(doc.ownership.default,0);assert.equal(doc.ownership.t,3);assert.equal(doc.pages[0].text.content,"");
  await handleCreationRequest(player,{}, {},player.id);assert.equal(game.journal.length,1);
  await player.setFlag(ID,"creationRequest",{id:"auth-denied",action:"record",section:"quests",name:"Denied"});
  assert.equal((await handleCreationRequest(player,{}, {},player.id)).ok,false);assert.equal(game.journal.length,1);
});

test("GM relay creates real nested folders but rejects foreign parents and non-creation actions",async()=>{
  prepare();const parent=await saveFolder("world","World parent"),foreign=await saveFolder("quests","Quest parent"),player=game.users.get("t");
  await player.setFlag(ID,"creationRequest",{id:"folder-ok",action:"folder",section:"world",name:"Player folder",parentId:parent.id});
  const result=await handleCreationRequest(player,{}, {},player.id);assert.equal(result.ok,true);assert.equal(folderIdOf(game.folders.get(result.id)),parent.id);
  const count=game.folders.length;
  await player.setFlag(ID,"creationRequest",{id:"folder-foreign",action:"folder",section:"world",name:"Outside",parentId:foreign.id});
  assert.equal((await handleCreationRequest(player,{}, {},player.id)).ok,false);assert.equal(game.folders.length,count);
  await player.setFlag(ID,"creationRequest",{id:"delete-denied",action:"delete",section:"world",name:"Not allowed"});
  assert.equal((await handleCreationRequest(player,{}, {},player.id)).ok,false);
});

test("relay rechecks revoked role ownership and does not run for inactive users or on player clients",async()=>{
  const {setRules}=prepare(),player=game.users.get("t");
  await player.setFlag(ID,"creationRequest",{id:"revoked",action:"record",section:"world",name:"Revoked"});
  const rules=defaultPolicies();rules.world[2]=2;setRules(rules);
  assert.equal((await handleCreationRequest(player,{}, {},player.id)).ok,false);assert.equal(game.journal.length,0);
  game.user=player;assert.equal(handleCreationRequest(player,{}, {},player.id),undefined);
  game.user=game.users.get("gm");player.active=false;
  await player.setFlag(ID,"creationRequest",{id:"inactive",action:"record",section:"world",name:"Inactive"});
  assert.equal((await handleCreationRequest(player,{}, {},player.id)).ok,false);
});

test("player request sends only creation metadata, rejects forged replies and cleans up its listener",async()=>{
  prepare();const callbacks=new Map();let counter=0,sent;
  globalThis.Hooks={on:(_event,fn)=>{const id=++counter;callbacks.set(id,fn);return id;},off:(_event,id)=>callbacks.delete(id)};
  const player=game.users.get("t");game.user=player;
  player.setFlag=async(_scope,_key,value)=>{
    sent=structuredClone(value);
    player.getFlag=()=>({requestId:value.id,ok:true,id:"forged"});
    for(const fn of [...callbacks.values()])fn(player,{}, {},"p");assert.equal(callbacks.size,1);
    player.getFlag=()=>({requestId:value.id,ok:true,id:"real"});
    for(const fn of [...callbacks.values()])fn(player,{}, {},"gm");
  };
  const result=await requestCreation("record",{section:"world",name:"Draft title",body:"private draft",ownership:{default:3}});
  assert.equal(result.id,"real");assert.equal(sent.name,"Новый журнал");assert.equal(sent.body,undefined);assert.equal(sent.ownership,undefined);assert.equal(callbacks.size,0);
  game.users.get("gm").active=false;await assert.rejects(()=>requestCreation("folder",{section:"world",name:"Offline"}),/мастером/);
});

test("a section owner without global creation permissions gets a journal and folder through the GM; text saves as that player",async()=>{
  prepare();const callbacks=new Map();let counter=0;
  globalThis.Hooks={on:(_event,fn)=>{const id=++counter;callbacks.set(id,fn);return id;},off:(_event,id)=>callbacks.delete(id)};
  CONFIG.JournalEntry.documentClass.canUserCreate=()=>false;CONFIG.Folder.documentClass.canUserCreate=()=>false;
  const gm=game.users.get("gm"),player=game.users.get("t");game.user=player;
  player.setFlag=async(scope,key,value)=>{
    (player.flags[scope]??={})[key]=structuredClone(value);
    if(key!=="creationRequest")return player;
    game.user=gm;try{await handleCreationRequest(player,{}, {},player.id);}finally{game.user=player;}
    for(const fn of [...callbacks.values()])fn(player,{}, {},gm.id);return player;
  };
  const folder=await saveFolder("world","Player folder");assert.equal(folder.getFlag(ID,"folderSection"),"world");
  const doc=await createRecord({name:"Player journal",section:"world",folderId:folder.id,facts:[{label:"Author",value:"Player"}]},"<p>Private draft body</p>");
  assert.equal(game.user,player);assert.equal(doc.ownership.t,3);assert.equal(folderIdOf(doc),folder.id);assert.equal(doc.pages[0].text.content,"<p>Private draft body</p>");
  assert.equal(meta(doc).facts[0].value,"Player");assert.equal(player.getFlag(ID,"creationRequest").body,undefined);assert.equal(callbacks.size,0);
});

