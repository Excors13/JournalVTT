import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures.mjs';
import {ID,defaultPolicies} from '../scripts/model.js';
import {createRecord,saveRecord,nativeFolder,meta,versionOf,synchronizeOwnership,folderIdOf} from '../scripts/store.js';

async function offline({acceptGrants=false,sectionRoot=true,creator='t'}={}){
  const env=setup(),rules=defaultPolicies();rules.characters={1:3,2:3};env.setRules(rules);
  if(sectionRoot)await nativeFolder('characters');
  const notices=[];globalThis.ui={notifications:{info:message=>notices.push(message)}};
  const gm=game.users.get('gm');gm.active=false;game.user=game.users.get(creator);
  JournalEntry.canUserCreate=()=>true;const create=JournalEntry.create,requests=[];
  JournalEntry.create=async(data,options)=>{
    requests.push(data);const doc=await create(acceptGrants?data:{...data,ownership:{default:0,[game.user.id]:3}},options),update=doc.update.bind(doc);
    doc.update=async(changes,options)=>{
      if(game.user.role!==4&&(changes.ownership||Object.keys(changes).some(k=>k.startsWith('ownership.'))))throw new Error('GM-only ownership');
      return update(changes,options);
    };return doc;
  };
  return {...env,gm,notices,requests};
}
for(const creator of ['p','t'])test(`without GM, ${creator} creates and edits immediately even when ownership is stripped`,async()=>{
  const {notices,requests}=await offline({creator});
  const doc=await createRecord({name:'Offline journal',section:'characters'},'<p>First</p>');assert.equal(requests.length,1);assert.equal(doc.ownership[creator],3);assert.equal(meta(doc).ownershipPending,true);assert.equal(meta(doc).creatorId,creator);
  await saveRecord(doc,{...meta(doc),name:'Offline edit'},'<p>Second</p>',versionOf(doc));assert.equal(doc.name,'Offline edit');assert.equal(doc.pages[0].text.content,'<p>Second</p>');assert.equal(meta(doc).ownershipPending,true);assert.equal(notices.length,1);
});
test('if native create accepts grants, everyone receives the configured ownership immediately without a GM',async()=>{
  const {notices}=await offline({acceptGrants:true,creator:'p'});const doc=await createRecord({name:'Shared',section:'characters'},'');
  assert.deepEqual(doc.ownership,{default:0,gm:3,p:3,t:3});assert.equal(meta(doc).ownershipPending,false);assert.equal(notices.length,0);
  game.user=game.users.get('t');await saveRecord(doc,{...meta(doc),name:'Edited by another owner'},'<p>Shared edit</p>',versionOf(doc));assert.equal(doc.pages[0].text.content,'<p>Shared edit</p>');
});
test('no section folder is required: create at root and organize automatically when GM joins',async()=>{
  const {gm}=await offline({sectionRoot:false});const a=await createRecord({name:'A',section:'characters'},'<p>A</p>'),b=await createRecord({name:'B',section:'characters'},'<p>B</p>');
  assert.equal(folderIdOf(a),null);assert.equal(meta(a).folderPending,true);let batches=0;const update=JournalEntry.updateDocuments;JournalEntry.updateDocuments=async changes=>{batches++;return update(changes);};
  gm.active=true;game.user=gm;await synchronizeOwnership();assert.equal(batches,1);assert(folderIdOf(a));assert.equal(folderIdOf(a),folderIdOf(b));assert.equal(meta(a).folderPending,false);assert.equal(meta(a).ownershipPending,false);assert.equal(a.ownership.p,3);assert.equal(a.ownership.t,3);assert.equal(a.pages[0].text.content,'<p>A</p>');
  await synchronizeOwnership();assert.equal(batches,1);
});
test('deferred grants use current GM settings and ignore the submitted role policy and ownership snapshot',async()=>{
  const {gm,setRules}=await offline();const doc=await createRecord({name:'Pending',section:'characters'},'');
  meta(doc).rolePolicy={1:3,2:3};meta(doc).managedOwnership={default:3,p:3,t:3};const rules=defaultPolicies();rules.characters={1:0,2:3};setRules(rules);
  gm.active=true;game.user=gm;await synchronizeOwnership();assert.equal(doc.ownership.p,0);assert.equal(doc.ownership.t,3);assert.equal(doc.ownership.default,0);assert.equal(meta(doc).accessMode,'section');assert.equal(meta(doc).ownershipPending,false);
});
test('deferred creation rechecks author identity, ownership and role permission before sharing',async()=>{
  for(const invalid of ['gm-author','not-owner','revoked']){
    const {gm,setRules}=await offline();const doc=await createRecord({name:invalid,section:'characters'},'<p>Private</p>');
    if(invalid==='gm-author')meta(doc).creatorId=gm.id;
    if(invalid==='not-owner')meta(doc).creatorId='p';
    if(invalid==='revoked'){const rules=defaultPolicies();rules.characters={1:3,2:2};setRules(rules);}
    gm.active=true;game.user=gm;await synchronizeOwnership();assert.equal(doc.ownership.p,undefined);assert.equal(meta(doc).accessMode,'manual');assert.equal(meta(doc).ownershipPending,false);assert.equal(doc.pages[0].text.content,'<p>Private</p>');
  }
});
test('an explicit manual ownership decision is preserved when a pending record is synchronized',async()=>{
  const {gm}=await offline();const doc=await createRecord({name:'Manual',section:'characters'},'');meta(doc).accessMode='manual';
  gm.active=true;game.user=gm;await synchronizeOwnership();assert.deepEqual(doc.ownership,{default:0,t:3});
});
test('offline creation reports core permission requirements and still rejects non-owner sections',async()=>{
  await offline();JournalEntry.canUserCreate=()=>false;await assert.rejects(()=>createRecord({name:'Blocked',section:'characters'},''),/Создание журналов/);assert.equal(game.journal.length,0);
  JournalEntry.canUserCreate=()=>true;await assert.rejects(()=>createRecord({name:'Quest',section:'quests'},''),/Владелец/);assert.equal(game.journal.length,0);
});
