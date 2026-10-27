import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,MockDocument} from './fixtures.mjs';
import {ID} from '../scripts/model.js';
import {mountCodexLauncher,hideNativeCodex} from '../scripts/experience.js';

class Element {
  constructor(tag='div'){this.tag=tag;this.dataset={};this.children=[];this.listeners=new Map();}
  append(...children){for(const child of children){child.remove();child.parentElement=this;this.children.push(child);}}
  prepend(child){child.remove();child.parentElement=this;this.children.unshift(child);}
  remove(){if(!this.parentElement)return;const list=this.parentElement.children,index=list.indexOf(this);if(index>=0)list.splice(index,1);this.parentElement=null;}
  setAttribute(name,value){this[name]=value;}
  addEventListener(name,handler){this.listeners.set(name,handler);}
  querySelector(selector){const className=selector.slice(1);return this.children.find(c=>c.className?.split(' ').includes(className))||this.children.map(c=>c.querySelector(selector)).find(Boolean);}
  querySelectorAll(){return this.children.flatMap(c=>[c,...c.querySelectorAll()]).filter(c=>Object.keys(c.dataset).some(k=>['entryId','documentId','folderId','uuid'].includes(k)));}
}
function setupDOM(){
  setup();game.user=game.users.get('p');game.modules=new Map([[ID,{version:'1.0.2'}]]);globalThis.document={createElement:tag=>new Element(tag)};
  const root=new Element(),header=new Element(),actions=new Element();header.className='directory-header';actions.className='header-actions';actions.hidden=true;header.append(actions);root.append(header);return {root,header,actions};
}
test('player launcher remains outside hidden native creation actions and reports errors normally',async()=>{
  const {root,header,actions}=setupDOM();let opened=0;mountCodexLauncher(root,(...args)=>{assert.equal(args.length,0,'A click event must not be passed as a journal UUID');opened++;});
  const launcher=root.querySelector('.world-codex-launcher');assert.equal(launcher.parentElement,header);assert.notEqual(launcher.parentElement,actions);
  await launcher.listeners.get('click')({preventDefault(){}});assert.equal(opened,1);
  mountCodexLauncher(root,()=>opened++);assert.equal(header.children.filter(c=>c===launcher).length,1);
  actions.append(launcher);mountCodexLauncher([root],()=>opened++);assert.equal(launcher.parentElement,header);
});
test('native catalog hides service folders with v14 document IDs and UUIDs, leaving unrelated journals',()=>{
  const {root}=setupDOM(),record=new MockDocument({flags:{[ID]:{data:{kind:'record'}}}}),diary=new MockDocument({flags:{[ID]:{data:{kind:'diary',ownerId:'p'}}}});
  game.journal.push(record,diary);const folder=new MockDocument({id:'codex-root',flags:{[ID]:{root:true}}});game.folders.push(folder);
  const rows=[{documentId:folder.id},{uuid:`Folder.${folder.id}`},{entryId:record.id},{uuid:diary.uuid},{entryId:'ordinary'}].map(dataset=>Object.assign(new Element(),{dataset}));root.append(...rows);hideNativeCodex(root);
  assert.deepEqual(root.querySelectorAll(),[rows[4]]);
});
test('GM native catalog remains available and detached-window roots do not require instanceof HTMLElement',()=>{
  const {root}=setupDOM();game.user=game.users.get('gm');const row=new Element();row.dataset.folderId='root';root.append(row);hideNativeCodex(root);assert.equal(row.parentElement,root);
  mountCodexLauncher(root,()=>{});assert(root.querySelector('.world-codex-launcher'));
});
