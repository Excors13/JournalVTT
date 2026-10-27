import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures.mjs';
import {saveFolder,sectionFolders,folderIdOf,createRecord,visibleRecords} from '../scripts/store.js';
globalThis.foundry={applications:{api:{ApplicationV2:class {}}}};
const {CodexApp}=await import('../scripts/app.js');
const MIME='application/x-world-codex-folder';
class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.listeners=new Map();this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c)};}
  append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}
  setAttribute(name,value){this[name]=value;}
  addEventListener(name,callback){this.listeners.set(name,[...(this.listeners.get(name)||[]),callback]);}
  async emit(name,event){event.target??=this;for(const callback of this.listeners.get(name)||[])await callback(event);}
  closest(selector){return selector==='button'?(this.tag==='button'?this:this.parentElement?.closest(selector)):null;}
  contains(other){return Boolean(other&&(other===this||this.children.some(c=>c.contains(other))));}
  querySelectorAll(){return this.children.flatMap(c=>[c,...c.querySelectorAll()]).filter(c=>c.dataset.folderDrop);}
  getBoundingClientRect(){return {top:100,height:40};}
}
function transfer(type=MIME,id=''){const data=new Map([[type,id]]);return {get types(){return [...data.keys()];},setData:(key,value)=>data.set(key,value),getData:key=>data.get(key)||''};}
const event=(dataTransfer,clientY=120)=>({dataTransfer,clientY,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}});
function app(){setup();globalThis.document={createElement:tag=>new Element(tag)};const instance=new CodexApp();instance.section='world';instance.element=new Element();instance.perform=async action=>action();return instance;}
test('folder drag uses its own payload; top, middle and bottom move before, inside and after',async()=>{
  const instance=app(),a=await saveFolder('world','A'),b=await saveFolder('world','B'),root=folderIdOf(a),source=new Element('summary'),target=new Element('summary');
  instance.element.append(source,target);instance.folderDragSource(source,a);instance.folderDropTarget(target,b);assert.equal(source.draggable,true);
  const data=transfer();await source.emit('dragstart',event(data));assert.equal(data.getData(MIME),a.id);assert.equal(data.effectAllowed,'move');assert.equal(JSON.parse(data.getData('text/plain')).type,'Folder');
  for(const [y,hint] of [[102,'before'],[120,'inside'],[138,'after']]){
    const hover=event(data,y);await target.emit('dragover',hover);assert.equal(hover.prevented,true);assert.equal(target.dataset.folderDrop,hint);
    await target.emit('drop',event(data,y));assert.equal(target.dataset.folderDrop,undefined);
    if(hint==='inside'){assert.equal(folderIdOf(a),b.id);assert.equal(instance.folders.get(b.id),true);}
    else{assert.equal(folderIdOf(a),root);assert.deepEqual(Array.from(sectionFolders('world').filter(f=>folderIdOf(f)===root),f=>f.id),hint==='before'?[a.id,b.id]:[b.id,a.id]);}
  }
});
test('navigation respects manual order, exposes root drop for empty folders, and a new app reads the saved order',async()=>{
  const instance=app(),a=await saveFolder('world','A'),b=await saveFolder('world','B'),target=new Element('summary');instance.folderDropTarget(target,a);
  await target.emit('drop',event(transfer(MIME,b.id),102));
  const tree=new Element();instance.recordTree(tree,[]);assert.deepEqual(tree.children.filter(c=>c.tag==='details').map(c=>c.dataset.codexFolder),[b.id,a.id]);
  const rootDrop=tree.children.find(c=>c.className==='wc-root-drop');assert(rootDrop);
  const nestedTarget=new Element('summary');instance.folderDropTarget(nestedTarget,b);await nestedTarget.emit('drop',event(transfer(MIME,a.id),120));assert.equal(folderIdOf(a),b.id);
  await rootDrop.emit('drop',event(transfer(MIME,a.id)));assert.equal(folderIdOf(a),folderIdOf(b));
  const next=new CodexApp();next.section='world';const rebuilt=new Element();next.recordTree(rebuilt,[]);assert.deepEqual(rebuilt.children.filter(c=>c.tag==='details').map(c=>c.dataset.codexFolder),[b.id,a.id]);
});
test('players and active editors cannot move folders; editing button does not start a drag',async()=>{
  const instance=app(),folder=await saveFolder('world','A'),target=new Element('summary'),button=new Element('button');target.append(button);instance.folderDragSource(target,folder);
  const attempt=event(transfer());attempt.target=button;await target.emit('dragstart',attempt);assert.equal(attempt.prevented,true);assert.equal(attempt.dataTransfer.getData(MIME),'');
  game.user=game.users.get('p');const playerTarget=new Element();instance.folderDragSource(playerTarget,folder);instance.folderDropTarget(playerTarget,folder);assert.equal(playerTarget.draggable,undefined);assert.equal(playerTarget.listeners.size,0);
  game.user=game.users.get('gm');instance.folderDropTarget(target,folder);instance.editing={};const hover=event(transfer(MIME,folder.id));await target.emit('dragover',hover);assert.equal(hover.prevented,undefined);await target.emit('drop',hover);assert.equal(folderIdOf(folder),game.folders.find(f=>f.getFlag('world-codex','section')==='world').id);
});
test('record dragging into folders still works and folder dragging does not trigger journal import',async()=>{
  const instance=app(),folder=await saveFolder('world','A'),doc=await createRecord({name:'Record',section:'world'},''),target=new Element('summary');
  instance.dropTarget(target,folder.id);instance.folderDropTarget(target,folder);await target.emit('drop',event(transfer('application/x-world-codex',doc.id)));assert.equal(folderIdOf(doc),folder.id);
  const sidebar=new Element();instance.importDropTarget(sidebar);const hover=event(transfer(MIME,folder.id));await sidebar.emit('dragover',hover);assert.equal(hover.prevented,undefined);assert(!sidebar.classes.has('wc-import-over'));
  const player=game.users.get('p');game.user=player;const tree=new Element();instance.recordTree(tree,visibleRecords());assert(tree.children.filter(c=>c.tag==='details').every(c=>!c.children[0].draggable));
});
