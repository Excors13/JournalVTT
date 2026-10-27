import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures.mjs';
import {ID,SECTIONS,CATALOGS,defaultPolicies,normalizePolicies,cleanRecord} from '../scripts/model.js';
import {createRecord,saveRecord,meta,versionOf,visibleRecords,synchronizeOwnership,saveFolder,moveFolder,folderIdOf,sectionFolders,policies} from '../scripts/store.js';
class App {async render(){return this;}async close(){return this;}}
globalThis.foundry={applications:{api:{ApplicationV2:App,DialogV2:{confirm:async()=>false}}}};
const {CodexApp}=await import('../scripts/app.js');
const {CodexSettings}=await import('../scripts/settings.js');
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.listeners=new Map();this.classList={add(){}};}
  append(...children){this.children.push(...children);}
  setAttribute(name,value){this[name]=value;}
  addEventListener(name,fn){this.listeners.set(name,fn);}
  async emit(name){return this.listeners.get(name)?.({preventDefault(){}});}
  all(){return [this,...this.children.flatMap(c=>c.all())];}
}
const dom=()=>{globalThis.document={createElement:tag=>new Element(tag)};};
test('heroes is a separate catalog; upgrading settings inherits characters without changing existing policies',()=>{
  const old=defaultPolicies();delete old.heroes;old.characters={1:3,2:2};const before=structuredClone(old),next=normalizePolicies(old);
  assert.equal(Object.hasOwn(SECTIONS,'heroes'),false);assert.equal(CATALOGS.heroes,'Герои');assert.equal(Object.keys(SECTIONS).length,7);
  assert.deepEqual(next.heroes,{1:3,2:2});assert.deepEqual(old,before);for(const key of Object.keys(old))assert.deepEqual(next[key],old[key]);
  assert.deepEqual(normalizePolicies({...old,heroes:{1:0,2:3}}).heroes,{1:0,2:3});assert.equal(cleanRecord({section:'heroes'}).section,'heroes');
});
test('hero journals use their own folders and role permissions without exposing restricted heroes',async()=>{
  const env=setup(),rules=defaultPolicies();rules.heroes={1:2,2:3};env.setRules(rules);
  const folder=await saveFolder('heroes','Павшие'),hero=await createRecord({name:'A hero',section:'heroes',folderId:folder.id,image:'worlds/portrait.webp',facts:[{label:'Подвиг',value:'Спас город'}]},'<p>Story</p>'),npc=await createRecord({name:'An NPC',section:'characters'},'');
  assert.equal(meta(hero).section,'heroes');assert.equal(meta(hero).image,'worlds/portrait.webp');assert.equal(meta(hero).facts[0].value,'Спас город');assert.equal(hero.pages[0].text.content,'<p>Story</p>');assert.equal(folderIdOf(hero),folder.id);assert.equal(hero.ownership.p,2);assert.equal(hero.ownership.t,3);
  rules.heroes[1]=0;env.setRules(rules);await synchronizeOwnership({applyDefaults:true});game.user=game.users.get('p');assert(!visibleRecords().some(r=>r.doc.id===hero.id));assert(visibleRecords().some(r=>r.doc.id===npc.id));
});
test('moving an existing character into heroes keeps UUID, pages, body and facts',async()=>{
  const env=setup(),rules=defaultPolicies();rules.heroes={1:2,2:3};env.setRules(rules);
  const doc=await createRecord({name:'Veteran',section:'characters',facts:[{label:'Подвиг',value:'Оборона'}]},'<h2>Biography</h2>'),uuid=doc.uuid,pageId=doc.pages[0].id;
  await saveRecord(doc,{...meta(doc),name:doc.name,section:'heroes'},'<h2>Biography</h2>',versionOf(doc));
  assert.equal(doc.uuid,uuid);assert.equal(doc.pages[0].id,pageId);assert.equal(doc.pages[0].text.content,'<h2>Biography</h2>');assert.equal(meta(doc).facts[0].value,'Оборона');assert.equal(meta(doc).section,'heroes');assert.equal(game.folders.get(folderIdOf(doc)).getFlag(ID,'section'),'heroes');assert.equal(doc.ownership.t,3);
});
test('hero folders retain manual ordering and nesting independently of ordinary characters',async()=>{
  setup();const a=await saveFolder('heroes','A'),b=await saveFolder('heroes','B'),npc=await saveFolder('characters','NPC');
  await moveFolder(b,null,a.id);assert.deepEqual(Array.from(sectionFolders('heroes'),f=>f.id),[b.id,a.id]);await moveFolder(b,a.id);assert.equal(folderIdOf(b),a.id);await assert.rejects(()=>moveFolder(b,npc.id),/текущего раздела/);
});
test('hero button sits beside diaries, switches catalogs with history, and respects unsaved drafts',async()=>{
  setup();dom();const app=new CodexApp();app.lastSelection.heroes='hero-id';const tabs=app.catalogTabs(),[diary,hero,nav]=tabs.children;
  assert(diary.className.includes('wc-diary-button'));assert(hero.className.includes('wc-heroes-button'));assert.equal(hero['aria-label'],'Герои');assert.equal(nav.children.length,7);assert(nav.children.every(b=>b.children.every(c=>c.textContent!=='Герои')));
  await hero.emit('click');assert.equal(app.mode,'codex');assert.equal(app.section,'heroes');assert.equal(app.docId,'hero-id');assert.equal(app.catalogTabs().children[1]['aria-pressed'],'true');assert.equal(app.history.items.at(-1).section,'heroes');
  await diary.emit('click');assert.equal(app.mode,'diary');assert.equal(app.catalogTabs().children[1]['aria-pressed'],'false');await hero.emit('click');assert.equal(app.section,'heroes');assert.equal(app.mode,'codex');
  await app.openCatalog('characters');app.editing={};app.dirty=true;await hero.emit('click');assert.equal(app.section,'characters');assert(app.editing);
});
test('heroes search is scoped separately from the main catalogs',async()=>{
  setup();dom();const hero=await createRecord({name:'Shared hero',section:'heroes'},''),npc=await createRecord({name:'Shared NPC',section:'characters'},'');
  // Limited access allows name searches, without exposing either document body.
  hero.ownership.p=npc.ownership.p=1;game.user=game.users.get('p');const app=new CodexApp();app.query='Shared';
  for(const [section,id] of [['heroes',hero.id],['characters',npc.id]]){app.section=section;const tree=new Element('nav');app.drawNavigation(tree,visibleRecords(),[]);assert.deepEqual(tree.children.filter(c=>c.dataset.record).map(c=>c.dataset.record),[id]);}
});
test('hero permissions have an independent settings row initialized from legacy characters settings',async()=>{
  const env=setup(),old=defaultPolicies();delete old.heroes;old.characters={1:3,2:2};env.setRules(old);dom();const settings=new CodexSettings(),root=await settings._renderHTML(),nodes=root.all();
  assert(nodes.some(n=>n.tag==='h3'&&n.textContent==='Герои'));const selects=nodes.filter(n=>n.tag==='select'&&n.dataset.section==='heroes');assert.deepEqual(selects.map(n=>n.value),['3','2']);assert.equal(policies().characters[1],3);
});
