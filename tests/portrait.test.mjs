import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanImageFrame} from '../scripts/model.js';
import {frameGeometry,panImageFrame,portraitFrame,imageCropEditor,cropRectangle,frameFromCrop} from '../scripts/portrait.js';
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
  getBoundingClientRect(){return {width:600,height:400};}
  removeAttribute(name){delete this[name];}
  focus(){}
  setPointerCapture(id){this.captured=id;}
  set src(value){this.path=value;requests++;}
}
let requests=0;
function dom(){requests=0;globalThis.document={createElement:tag=>new Element(tag)};}
async function load(img,width=1200,height=600){img.naturalWidth=width;img.naturalHeight=height;await img.emit('load');}
test('crop rectangles round-trip existing cover and contain settings without changing the visible region',()=>{
  for(const [width,height] of [[1200,600],[400,1200],[100,100],[5000,100]])for(const fit of ['cover','contain'])for(const zoom of [0.25,1,4]){
    const original={fit,zoom,x:0.3,y:0.8},rect=cropRectangle(width,height,original),restored=frameFromCrop(width,height,rect,original),again=cropRectangle(width,height,restored);
    close(rect.width/rect.height,5/6);for(const key of ['x','y','width','height'])close(again[key],rect[key]);
  }
});
test('editor preview and reader share geometry; crop changes do not fetch images again',async()=>{
  dom();const value={fit:'cover',zoom:1.5,x:0.7,y:0.1},reader=portraitFrame('worlds/a.webp',value),changes=[],editor=imageCropEditor('worlds/a.webp',value,v=>changes.push(v)),nodes=editor.element.all(),preview=nodes.find(n=>n.className==='wc-framed-image'),source=nodes.find(n=>n.className==='wc-crop-source');
  await load(reader.image);await load(preview);await load(source);assert.deepEqual(preview.style,reader.image.style);assert.equal(requests,3);
  const zoom=nodes.find(n=>n.dataset.frameControl==='zoom');zoom.value='2';await zoom.emit('input');assert.equal(editor.getFrame().zoom,2);assert.equal(changes.at(-1).zoom,2);assert.equal(requests,3);
});
test('selection moves and resizes at a fixed ratio; cancellation stops dragging',async()=>{
  dom();const editor=imageCropEditor('worlds/a.webp',{zoom:2}),nodes=editor.element.all(),selection=nodes.find(n=>n.className==='wc-crop-selection');await load(nodes.find(n=>n.className==='wc-crop-source'));
  await selection.emit('pointerdown',{button:0,pointerId:4,clientX:100,clientY:100,target:{dataset:{}},stopPropagation(){}});assert.equal(selection.captured,4);
  await selection.emit('pointermove',{pointerId:4,clientX:120,clientY:100});assert(editor.getFrame().x>0.5);const moved=editor.getFrame();await selection.emit('pointercancel',{pointerId:4});await selection.emit('pointermove',{pointerId:4,clientX:170,clientY:100});assert.deepEqual(editor.getFrame(),moved);
  for(const corner of ['nw','ne','sw','se']){
    const before=editor.getFrame(),sx=corner.includes('e')?1:-1,sy=corner.includes('s')?1:-1;
    await selection.emit('pointerdown',{button:0,pointerId:5,clientX:100,clientY:100,target:{dataset:{corner}},stopPropagation(){}});
    await selection.emit('pointermove',{pointerId:5,clientX:100+sx*10,clientY:100+sy*12});await selection.emit('pointerup',{pointerId:5});assert(editor.getFrame().zoom<before.zoom);
    close(parseFloat(selection.style.width)/parseFloat(selection.style.height),5/6);
  }
  assert.equal(requests,2);
});
test('new sources reset framing, unsafe paths never load and broken images show an error',async()=>{
  dom();const editor=imageCropEditor('worlds/a.webp',{zoom:3,x:0.1,y:0.9});editor.setSource('worlds/a.webp');assert.equal(requests,2);assert.equal(editor.getFrame().zoom,3);
  editor.setSource('worlds/b.webp');assert.equal(requests,4);assert.deepEqual(editor.getFrame(),cleanImageFrame());let nodes=editor.element.all();await nodes.find(n=>n.className==='wc-crop-source').emit('error');assert(nodes.find(n=>n.className==='wc-frame-status').textContent.includes('Не удалось'));assert.equal(editor.ready,false);
  editor.setSource('javascript:alert(1)');assert.equal(requests,4);assert.equal(editor.ready,false);
});
test('portrait opens the original source by click and keyboard, without adding edit controls',async()=>{
  dom();const opened=[],portrait=portraitFrame('worlds/a.webp',{}, {onOpen:path=>opened.push(path)});await portrait.element.emit('click');assert.equal(opened.length,0);await load(portrait.image);await portrait.element.emit('click');await portrait.element.emit('keydown',{key:'Enter'});await portrait.element.emit('keydown',{key:' '});assert.deepEqual(opened,Array(3).fill('worlds/a.webp'));assert.equal(portrait.element.role,'button');
});
test('crop is persisted with the journal and survives subsequent edits while ownership stays unchanged',async()=>{
  setup();const crop={fit:'contain',zoom:1.25,x:0.3,y:0.8},doc=await createRecord({name:'Portrait',section:'world',image:'worlds/a.webp',imageFrame:crop},'<p>Body</p>'),ownership=structuredClone(doc.ownership);
  assert.deepEqual(meta(doc).imageFrame,crop);game.user=game.users.get('t');await saveRecord(doc,{...meta(doc),name:doc.name,imageFrame:{fit:'cover',zoom:2,x:0.8,y:0.2}},'<p>Updated</p>',versionOf(doc));
  const saved=structuredClone(meta(doc).imageFrame);await saveRecord(doc,{name:doc.name,section:'world'},'<p>Again</p>',versionOf(doc));assert.deepEqual(meta(doc).imageFrame,saved);assert.deepEqual(doc.ownership,ownership);assert.equal(doc.pages[0].text.content,'<p>Again</p>');
});
