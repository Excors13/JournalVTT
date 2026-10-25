import {ID,SCHEMA,SECTIONS,OBJECTIVE_STATES,copy,normalizePolicies,roleOwnership,diaryOwnership,sameOwnership,ownershipPatch,cleanRecord,cleanMap} from "./model.js";

export const meta = doc => doc?.getFlag(ID,"data");
export const fullGM = (user=game.user) => Number(user?.role)===4;
export const readable = doc => Boolean(doc?.testUserPermission(game.user,"OBSERVER"));
export const editable = doc => Boolean(doc?.testUserPermission(game.user,"OWNER"));
export const policies = () => normalizePolicies(game.settings.get(ID,"policies"));
export const managedRecords = () => game.journal.filter(d=>meta(d)?.kind==="record"&&Object.hasOwn(SECTIONS,meta(d).section));
export const visibleRecords = () => managedRecords().filter(d=>d.testUserPermission(game.user,"LIMITED")).map(doc=>({doc,meta:meta(doc)})).sort((a,b)=>(a.doc.sort||0)-(b.doc.sort||0)||a.doc.name.localeCompare(b.doc.name,"ru"));
export const textPage = (doc,pageId) => pageId?doc?.pages.find(p=>p.id===pageId&&p.type==="text"):doc?.pages.find(p=>p.type==="text");
export const getBody = (doc,pageId) => {const page=pageId?textPage(doc,pageId):doc?.pages.find(p=>p.type==="text"&&readable(p));return readable(page)?page.text?.content||"":"";};
export const versionOf = doc => JSON.stringify([doc?._stats?.modifiedTime,...(doc?.pages?.contents||[]).map(p=>[p.id,p._stats?.modifiedTime])]);
export function activeManager() {
  const managers=game.users.filter(u=>u.active&&fullGM(u)).sort((a,b)=>a.id.localeCompare(b.id));
  return managers[0]?.id===game.user.id;
}
export async function nativeFolder(section) {
  const existing=game.folders.find(f=>f.type==="JournalEntry"&&f.getFlag(ID,"section")===section);if(existing)return existing.id;
  if(!fullGM())return null;
  let root=game.folders.find(f=>f.type==="JournalEntry"&&f.getFlag(ID,"root"));
  if(!root)root=await CONFIG.Folder.documentClass.create({name:"Кодекс мира",type:"JournalEntry",flags:{[ID]:{root:true}}});
  let folder=game.folders.find(f=>f.type==="JournalEntry"&&f.getFlag(ID,"section")===section);
  if(!folder)folder=await CONFIG.Folder.documentClass.create({name:section==="diary"?"Личные дневники":SECTIONS[section],type:"JournalEntry",folder:root.id,flags:{[ID]:{section}}});
  return folder.id;
}
export async function createRecord(input, body) {
  if(!fullGM())throw new Error("Создавать записи кодекса может мастер. Игроки могут дополнять доступные им записи.");
  const data=cleanRecord(input),ownership=roleOwnership(policies(),data.section,game.users.contents);
  const destination=validFolder(input.folderId,data.section)||await nativeFolder(data.section);
  const sort=Math.max(0,...managedRecords().filter(d=>meta(d).section===data.section).map(d=>d.sort||0))+100000;
  const doc=await CONFIG.JournalEntry.documentClass.create({name:input.name.trim(),sort,folder:destination,ownership,pages:[{name:"Текст",type:"text",text:{format:1,content:body}}],flags:{[ID]:{data:{...data,accessMode:"section",rolePolicy:policies()[data.section],managedOwnership:copy(ownership)}}}},{wcManaged:true});
  return doc;
}
export async function saveRecord(doc,input,body,expectedVersion,pageId) {
  if(!editable(doc)||meta(doc)?.kind!=="record")throw new Error("Нет права редактирования этой записи.");
  const page=textPage(doc,pageId);
  if((pageId&&!page)||(page&&!editable(page)))throw new Error("Нет права редактирования этой страницы.");
  if(expectedVersion!==versionOf(doc))throw new Error("Запись изменилась после открытия редактора. Скопируйте свой текст и откройте её заново.");
  const old=meta(doc),next=cleanRecord({...input,section:fullGM()?input.section:old.section});
  const update={name:input.name.trim(),[`flags.${ID}.data`]:{...copy(old),...next}};
  if(fullGM()&&old.section!==next.section){
    update.folder=await nativeFolder(next.section);
    if(old.accessMode==="section"){
      const ownership=roleOwnership(policies(),next.section,game.users.contents);
      update.ownership=ownershipPatch(doc.ownership,ownership);update[`flags.${ID}.data`].managedOwnership=ownership;update[`flags.${ID}.data`].rolePolicy=policies()[next.section];
    }
  }
  if(input.folderId!==undefined){const destination=validFolder(input.folderId,next.section);if(input.folderId&&!destination)throw new Error("Папка недоступна в этом разделе.");update.folder=destination||await nativeFolder(next.section);}
  // Core embedded-document writes validate the current user's ownership on the server.
  if(page)await doc.updateEmbeddedDocuments("JournalEntryPage",[{_id:page.id,"text.content":body}],{wcManaged:true});
  else await doc.createEmbeddedDocuments("JournalEntryPage",[{name:"Текст",type:"text",text:{format:1,content:body}}],{wcManaged:true});
  await doc.update(update,{wcManaged:true});return doc;
}
export const folderIdOf=doc=>typeof doc?.folder==="string"?doc.folder:doc?.folder?.id||null;
export const sectionFolders=section=>game.folders.filter(f=>f.type==="JournalEntry"&&f.getFlag(ID,"folderSection")===section);
export function validFolder(id,section){return id&&game.folders.some(f=>f.id===id&&f.type==="JournalEntry"&&(f.getFlag(ID,"folderSection")===section||f.getFlag(ID,"section")===section))?id:null;}
export function folderLabel(id){const result=[],seen=new Set();while(id&&!seen.has(id)){seen.add(id);const f=game.folders.get(id);if(!f||f.getFlag(ID,"root")||f.getFlag(ID,"section"))break;result.unshift(f.name);id=folderIdOf(f);}return result.join(" / ");}
export async function saveFolder(section,name,parentId=null,id=null){
  if(!fullGM()||!Object.hasOwn(SECTIONS,section))throw new Error("Папками управляет мастер.");
  name=String(name).trim().slice(0,80);if(!name||name.includes("/"))throw new Error("Введите название папки без символа /.");
  if(parentId&&!validFolder(parentId,section))throw new Error("Неверная родительская папка.");
  let p=parentId;const seen=new Set();while(p&&!seen.has(p)){if(p===id)throw new Error("Нельзя поместить папку внутрь самой себя.");seen.add(p);p=folderIdOf(game.folders.get(p));}
  const destination=parentId||await nativeFolder(section);
  if(game.folders.some(f=>f.id!==id&&f.name===name&&folderIdOf(f)===destination))throw new Error("Такая папка уже существует.");
  if(id){if(!sectionFolders(section).some(f=>f.id===id))throw new Error("Папка недоступна.");return game.folders.get(id).update({name,folder:destination});}
  return CONFIG.Folder.documentClass.create({name,type:"JournalEntry",folder:destination,sorting:"m",flags:{[ID]:{folderSection:section}}});
}
export async function moveRecord(doc,toFolder,before=null,after=false){
  if(!editable(doc)||meta(doc)?.kind!=="record")throw new Error("Нет права перемещения.");
  const section=meta(doc).section;
  if(toFolder&&!validFolder(toFolder,section))throw new Error("Перемещение возможно только в папки текущего раздела.");
  const destination=toFolder||await nativeFolder(section);if(!destination)throw new Error("Мастер должен сначала создать раздел.");
  if(before===doc.id)return;
  const peers=managedRecords().filter(d=>meta(d).section===section&&folderIdOf(d)===destination&&d.id!==doc.id).sort((a,b)=>(a.sort||0)-(b.sort||0)||a.id.localeCompare(b.id));
  let index=peers.findIndex(d=>d.id===before);if(index<0)index=peers.length;else if(after)index++;
  const lo=index?peers[index-1].sort||0:0,hi=peers[index]?.sort;let sort=hi===undefined?lo+100000:Math.floor((lo+hi)/2);
  if(sort===lo||sort===hi){if(!fullGM())throw new Error("Для пересортировки этой папки обратитесь к мастеру.");peers.splice(index,0,doc);await CONFIG.JournalEntry.documentClass.updateDocuments(peers.map((d,i)=>({_id:d.id,sort:(i+1)*100000,...(d===doc?{folder:destination}: {})})),{wcManaged:true});return;}
  await doc.update({folder:destination,sort},{wcManaged:true});
}
export async function setObjectiveState(doc,index,state,expectedVersion){
  if(!editable(doc)||meta(doc)?.section!=="quests"||!Object.hasOwn(OBJECTIVE_STATES,state))throw new Error("Нет права менять цель.");
  if(expectedVersion!==versionOf(doc))throw new Error("Задание изменилось. Откройте его заново.");
  const objectives=copy(meta(doc).quest?.objectives||[]);if(!objectives[index])throw new Error("Цель уже удалена.");objectives[index].state=state;
  await doc.update({[`flags.${ID}.data.quest.objectives`]:objectives},{wcManaged:true});
}
export async function saveMap(doc,data,expectedVersion){
  if(!editable(doc)||meta(doc)?.section!=="maps")throw new Error("Нет права редактировать карту.");
  if(expectedVersion!==versionOf(doc))throw new Error("Карта изменена другим пользователем. Откройте редактор заново.");
  const next=cleanMap(data);
  if(!game.user.isGM){
    const previous=cleanMap(meta(doc).map);
    for(const key of ["pins","labels"]){
      const hidden=previous[key].filter(item=>item.hidden),ids=new Set(hidden.map(item=>item.id));
      next[key]=[...next[key].filter(item=>!ids.has(item.id)).map(item=>({...item,hidden:false})),...hidden];
    }
  }
  await doc.update({[`flags.${ID}.data.map`]:next},{wcManaged:true});
}
export async function importJournal(doc,section,folderId=null){
  if(!fullGM())throw new Error("Добавлять журналы может только мастер.");
  if(!doc||game.journal.get(doc.id)!==doc||meta(doc)?.kind||!Object.hasOwn(SECTIONS,section))throw new Error("Выберите обычный журнал мира и раздел.");
  if(!doc.pages.some(p=>p.type==="text"))throw new Error("В журнале должна быть хотя бы одна текстовая страница.");
  if(folderId&&!validFolder(folderId,section))throw new Error("Папка недоступна в этом разделе.");
  const data=cleanRecord({section});
  // Attach the original document: UUIDs, embedded pages and native permissions stay intact.
  await doc.update({folder:folderId||await nativeFolder(section),[`flags.${ID}.data`]:{...data,accessMode:"manual",sourceFolder:folderIdOf(doc)}},{wcManaged:true});
  return doc;
}
export async function migrateRecords(){
  if(!fullGM())return;
  for(const doc of managedRecords()){
    const m=meta(doc);if((m.schema||1)>=SCHEMA)continue;
    let destination=await nativeFolder(m.section);
    for(const name of String(m.folder||"").split("/").map(x=>x.trim()).filter(Boolean)){
      const found=sectionFolders(m.section).find(f=>f.name===name&&folderIdOf(f)===destination);
      destination=found?.id||(await saveFolder(m.section,name,destination)).id;
    }
    // Legacy related links stay in flags for backwards recovery; there is no links UI.
    await doc.update({folder:destination,[`flags.${ID}.data.schema`]:SCHEMA,[`flags.${ID}.data.facts`]:m.facts||[],[`flags.${ID}.data.map`]:cleanMap(m.map)},{wcManaged:true});
  }
}
export async function synchronizeOwnership({applyDefaults=false}={}) {
  if(!fullGM())return {updated:0,skipped:0};
  const updates=[];let skipped=0;
  for(const doc of managedRecords()){
    const m=meta(doc);
    if(m.accessMode!=="section"){skipped++;continue;}
    if(m.managedOwnership&&!sameOwnership(doc.ownership,m.managedOwnership)){
      updates.push({_id:doc.id,[`flags.${ID}.data.accessMode`]:"manual"});skipped++;continue;
    }
    const rule=applyDefaults?policies()[m.section]:(m.rolePolicy||policies()[m.section]);
    const ownership=roleOwnership({[m.section]:rule},m.section,game.users.contents);
    if(applyDefaults||!sameOwnership(doc.ownership,ownership))updates.push({_id:doc.id,ownership:ownershipPatch(doc.ownership,ownership),[`flags.${ID}.data.managedOwnership`]:ownership,[`flags.${ID}.data.rolePolicy`]:rule});
  }
  // One batch; core validates every update. No privileged socket handlers are used.
  if(updates.length)await CONFIG.JournalEntry.documentClass.updateDocuments(updates,{wcManaged:true});
  return {updated:updates.length,skipped};
}
export async function useSectionOwnership(doc) {
  if(!fullGM()||meta(doc)?.kind!=="record")throw new Error("Недостаточно прав.");
  const ownership=roleOwnership(policies(),meta(doc).section,game.users.contents);
  await doc.update({ownership:ownershipPatch(doc.ownership,ownership),[`flags.${ID}.data.accessMode`]:"section",[`flags.${ID}.data.managedOwnership`]:ownership,[`flags.${ID}.data.rolePolicy`]:policies()[meta(doc).section]},{wcManaged:true});
}
export function visibleDiaries() {
  return game.journal.filter(d=>meta(d)?.kind==="diary"&&readable(d)&&(game.user.isGM||meta(d).ownerId===game.user.id)).sort((a,b)=>a.name.localeCompare(b.name,"ru"));
}
export async function provisionDiaries() {
  if(!fullGM())return;
  for(const user of game.users.filter(u=>Number(u.role)>0&&!u.isGM)){
    const existing=game.journal.find(d=>meta(d)?.kind==="diary"&&meta(d).ownerId===user.id);
    const ownership=diaryOwnership(user.id,game.users.contents);
    if(existing){if(!sameOwnership(existing.ownership,ownership))await existing.update({ownership:ownershipPatch(existing.ownership,ownership)},{wcManaged:true});continue;}
    await CONFIG.JournalEntry.documentClass.create({name:`Дневник · ${user.name}`,folder:await nativeFolder("diary"),ownership,pages:[],flags:{[ID]:{data:{kind:"diary",schema:SCHEMA,ownerId:user.id}}}},{wcManaged:true});
  }
}
export async function saveDiary(doc,page,input,body,expectedVersion) {
  if(meta(doc)?.kind!=="diary"||meta(doc).ownerId!==game.user.id||!editable(doc))throw new Error("Редактировать дневник может только его автор.");
  if(expectedVersion!==versionOf(doc))throw new Error("Дневник изменился. Скопируйте текст и откройте запись заново.");
  const data={name:input.name.trim(),type:"text",text:{format:1,content:body},flags:{[ID]:{date:String(input.date||"").slice(0,250)}}};
  if(page){await doc.updateEmbeddedDocuments("JournalEntryPage",[{_id:page.id,...data}],{wcManaged:true});return page;}
  const [created]=await doc.createEmbeddedDocuments("JournalEntryPage",[data],{wcManaged:true});return created;
}
