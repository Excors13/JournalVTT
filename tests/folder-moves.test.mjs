import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,MockDocument} from './fixtures.mjs';
import {ID} from '../scripts/model.js';
import {saveFolder,moveFolder,sectionFolders,folderIdOf,createRecord,getBody} from '../scripts/store.js';

const siblings=parent=>Array.from(sectionFolders('world').filter(f=>folderIdOf(f)===parent),f=>f.name);
test('folders reorder before/after siblings in one request and append newly created folders',async()=>{
  setup();const a=await saveFolder('world','A'),b=await saveFolder('world','B'),c=await saveFolder('world','C'),root=folderIdOf(a);
  let requests=0;const update=Folder.updateDocuments;Folder.updateDocuments=async changes=>{requests++;return update(changes);};
  await moveFolder(c,root,a.id);assert.deepEqual(siblings(root),['C','A','B']);assert.equal(requests,1);
  await moveFolder(c,root,b.id,true);assert.deepEqual(siblings(root),['A','B','C']);
  assert.deepEqual(siblings(root),['A','B','C']);await saveFolder('world','AA');assert.deepEqual(siblings(root),['A','B','C','AA']);
  const count=requests;await moveFolder(c,root,c.id);assert.equal(requests,count);
});
test('nesting and moving back to root preserve child folders, record UUIDs, body and ownership',async()=>{
  setup();const a=await saveFolder('world','A'),b=await saveFolder('world','B'),child=await saveFolder('world','Child',a.id),root=folderIdOf(a);
  const doc=await createRecord({name:'Journal',section:'world',folderId:child.id},'<p>Keep this</p>'),uuid=doc.uuid,ownership=structuredClone(doc.ownership);
  await moveFolder(a,b.id);assert.equal(folderIdOf(a),b.id);assert.equal(folderIdOf(child),a.id);assert.equal(folderIdOf(doc),child.id);
  await moveFolder(a);assert.equal(folderIdOf(a),root);assert.equal(doc.uuid,uuid);assert.equal(getBody(doc),'<p>Keep this</p>');assert.deepEqual(doc.ownership,ownership);
});
test('legacy equal sort values retain alphabetical sibling order when manually moved',async()=>{
  setup();const c=await saveFolder('world','C'),a=await saveFolder('world','A'),b=await saveFolder('world','B'),root=folderIdOf(a);
  for(const f of [a,b,c])f.sort=0;
  assert.deepEqual(siblings(root),['A','B','C']);await moveFolder(c,root,a.id,true);assert.deepEqual(siblings(root),['A','C','B']);
});
test('folder moves reject cycles, cross-section targets, stale anchors, duplicate names and service folders without writes',async()=>{
  setup();const a=await saveFolder('world','A'),b=await saveFolder('world','B',a.id),other=await saveFolder('quests','Other'),target=await saveFolder('world','Target');
  await saveFolder('world','A',target.id);let writes=0;Folder.updateDocuments=async()=>{writes++;};
  await assert.rejects(()=>moveFolder(a,a.id),/самой себя/);await assert.rejects(()=>moveFolder(a,b.id),/потомка/);
  await assert.rejects(()=>moveFolder(a,other.id),/текущего раздела/);await assert.rejects(()=>moveFolder(a,null,'deleted'),/уже перемещена/);
  await assert.rejects(()=>moveFolder(a,target.id),/уже существует/);
  await assert.rejects(()=>moveFolder(game.folders.get(folderIdOf(a)),target.id),/мастер/);
  const detached=new MockDocument({type:'JournalEntry',flags:{[ID]:{folderSection:'world'}}});await assert.rejects(()=>moveFolder(detached,target.id),/мастер/);
  game.user=game.users.get('t');await assert.rejects(()=>moveFolder(a,target.id),/мастер/);assert.equal(writes,0);
});
test('server refusal leaves the folder tree and order unchanged',async()=>{
  setup();const a=await saveFolder('world','A'),b=await saveFolder('world','B'),parent=folderIdOf(a),sort=a.sort;
  Folder.updateDocuments=async()=>{throw new Error('Server refused');};await assert.rejects(()=>moveFolder(a,b.id),/refused/);
  assert.equal(folderIdOf(a),parent);assert.equal(a.sort,sort);
});
