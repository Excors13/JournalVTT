import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanImageFrame} from '../scripts/model.js';
import {frameGeometry,panImageFrame,portraitFrame,imageFrameEditor} from '../scripts/portrait.js';
import {setup} from './fixtures.mjs';
import {createRecord,saveRecord,meta,versionOf} from '../scripts/store.js';
const close=(actual,expected)=>assert(Math.abs(actual-expected)<0.000001,`${actual} != ${expected}`);
test('portrait settings are bounded and old records keep centered cover behavior',()=>{
  assert.deepEqual(cleanImageFrame(),{fit:'cover',zoom:1,x:0.5,y:0.5});assert.deepEqual(cleanImageFrame(null),cleanImageFrame());
  assert.deepEqual(cleanImageFrame({fit:'script',zoom:100,x:-20,y:5,extra:'discard'}),{fit:'cover',zoom:4,x:0,y:1});
  assert.deepEqual(cleanImageFrame({fit:'contain',zoom:'bad',x:Infinity,y:'bad'}),{fit:'contain',zoom:1,x:0.5,y:0.5});
});
test('wide and tall portraits retain aspect ratio in cover/contain modes and at different source resolutions',()=>{
  const wide=frameGeometry(1200,600),tall=frameGeometry(400,1200);
  assert.deepEqual(wide,{width:240,height:100,left:-70,top:0});assert.deepEqual(tall,{width:100,height:250,left:0,top:-75});
  assert.deepEqual(frameGeometry(2400,1200),wide);const contain=frameGeometry(1200,600,{fit:'contain'});close(contain.width,100);close(contain.height,100*5/12);close(contain.top,(100-100*5/12)/2);
  for(const [w,h] of [[1200,600],[400,1200],[100,100]])for(const fit of ['contain','cover'])for(const zoom of [0.25,1,4]){const g=frameGeometry(w,h,{fit,zoom});close((g.width*5)/(g.height*6),w/h);}
  assert.equal(frameGeometry(0,10),null);assert.equal(frameGeometry(Infinity,10),null);
});
test('zoom and dragging select the visible region and clamp to the frame edges',()=>{
  const value={fit:'cover',zoom:2,x:0.75,y:0.25},g=frameGeometry(1200,600,value);assert.deepEqual(g,{width:480,height:200,left:-285,top:-25});
  const pan=panImageFrame({},frameGeometry(1200,600),35,100,250,300);close(pan.x,0.4);close(pan.y,0.5);
  const edge=panImageFrame({},frameGeometry(1200,600),100000,-100000,250,300);assert.equal(edge.x,0);assert.equal(edge.y,0.5);
  const small=frameGeometry(1200,600,{zoom:0.25});assert.deepEqual(small,{width:60,height:25,left:20,top:37.5});
});
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.style={};this.listeners=new Map();this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c)};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(name,value){this[name]=value;}
  addEventListener(name,fn){this.listeners.set(name,fn);}
  async emit(name,event={}){event.preventDefault??=()=>{};return this.listeners.get(name)?.(event);}
  all(){return [this,...this.children.flatMap(c=>c.all())];}
  getBoundingClientRect(){return {width:250,height:300};}
  setPointerCapture(id){this.captured=id;}
  set src(value){this.path=value;requests++;}
}
let requests=0;
function dom(){requests=0;globalThis.document={createElement:tag=>new Element(tag)};}
async function load(img,width=1200,height=600){img.naturalWidth=width;img.naturalHeight=height;await img.emit('load');}
test('reader and editor use identical geometry; zoom and position changes do not fetch images again',async()=>{
  dom();const value={fit:'cover',zoom:1.5,x:0.7,y:0.1},reader=portraitFrame('worlds/a.webp',value),changes=[],editor=imageFrameEditor('worlds/a.webp',value,v=>changes.push(v)),nodes=editor.element.all(),preview=nodes.find(n=>n.tag==='img');
  await load(reader.image);await load(preview);assert.deepEqual(preview.style,reader.image.style);assert.equal(requests,2);
  const zoom=nodes.find(n=>n.dataset.frameControl==='zoom');zoom.value='0.5';await zoom.emit('input');assert.equal(editor.getFrame().zoom,0.5);assert.equal(changes.at(-1).zoom,0.5);assert.equal(requests,2);
  const x=nodes.find(n=>n.dataset.frameControl==='x');x.value='0.3';await x.emit('input');assert.equal(editor.getFrame().x,0.3);assert.equal(requests,2);
});
test('preview dragging changes the saved draft and stops on pointer cancellation',async()=>{
  dom();const editor=imageFrameEditor('worlds/a.webp',{}),preview=editor.element.all().find(n=>n.classes.has('wc-frame-preview')),img=preview.children[0];await load(img);
  await preview.emit('pointerdown',{button:0,pointerId:4,clientX:100,clientY:100});assert.equal(preview.captured,4);
  await preview.emit('pointermove',{pointerId:4,clientX:135,clientY:100});close(editor.getFrame().x,0.4);
  await preview.emit('pointercancel',{pointerId:4});await preview.emit('pointermove',{pointerId:4,clientX:170,clientY:100});close(editor.getFrame().x,0.4);assert(!preview.classes.has('wc-is-panning'));assert.equal(requests,1);
});
test('new sources reset framing, unsafe paths never load and broken images show an error',async()=>{
  dom();const editor=imageFrameEditor('worlds/a.webp',{zoom:3,x:0.1,y:0.9});editor.setSource('worlds/a.webp');assert.equal(requests,1);assert.equal(editor.getFrame().zoom,3);
  editor.setSource('worlds/b.webp');assert.equal(requests,2);assert.deepEqual(editor.getFrame(),cleanImageFrame());let nodes=editor.element.all();await nodes.find(n=>n.tag==='img').emit('error');assert(nodes.find(n=>n.className==='wc-frame-status').textContent.includes('Не удалось'));
  editor.setSource('javascript:alert(1)');assert.equal(requests,2);assert(!editor.element.all().some(n=>n.tag==='img'));
});
test('crop is persisted with the journal and survives subsequent edits while ownership stays unchanged',async()=>{
  setup();const crop={fit:'contain',zoom:1.25,x:0.3,y:0.8},doc=await createRecord({name:'Portrait',section:'world',image:'worlds/a.webp',imageFrame:crop},'<p>Body</p>'),ownership=structuredClone(doc.ownership);
  assert.deepEqual(meta(doc).imageFrame,crop);game.user=game.users.get('t');await saveRecord(doc,{...meta(doc),name:doc.name,imageFrame:{fit:'cover',zoom:2,x:0.8,y:0.2}},'<p>Updated</p>',versionOf(doc));
  const saved=structuredClone(meta(doc).imageFrame);await saveRecord(doc,{name:doc.name,section:'world'},'<p>Again</p>',versionOf(doc));assert.deepEqual(meta(doc).imageFrame,saved);assert.deepEqual(doc.ownership,ownership);assert.equal(doc.pages[0].text.content,'<p>Again</p>');
});
