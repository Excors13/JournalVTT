import {ID,uid} from "./model.js";
import {fullGM,activeManager,canCreateInSection,createRecord,saveFolder} from "./store.js";

const REQUEST="creationRequest",RESULT="creationResult";
const handled=new Map();let queue=Promise.resolve();

/** Core updateUser hooks provide the authenticated writer's ID; no claimed socket sender is trusted. */
export function handleCreationRequest(user,_changes,_options,writerId){
  if(!activeManager()||writerId!==user.id||game.users.get(user.id)!==user)return;
  const request=user.getFlag(ID,REQUEST);
  if(!request||typeof request.id!=="string"||!/^[a-zA-Z0-9-]{1,80}$/.test(request.id))return;
  const key=`${user.id}:${request.id}`;if(handled.has(key))return handled.get(key);
  const run=queue.catch(()=>{}).then(async()=>{
    let result;
    try{
      if(!user.active||!canCreateInSection(request.section,user))throw new Error("Нет права создавать материалы в этом разделе.");
      const name=String(request.name||"").trim().slice(0,request.action==="folder"?80:140);
      if(!name)throw new Error("Введите название.");
      let doc;
      if(request.action==="record")doc=await createRecord({name,section:request.section,folderId:typeof request.folderId==="string"?request.folderId:null},"");
      else if(request.action==="folder")doc=await saveFolder(request.section,name,typeof request.parentId==="string"?request.parentId:null);
      else throw new Error("Неизвестное действие создания.");
      result={requestId:request.id,ok:true,id:doc.id};
    }catch(error){result={requestId:request.id,ok:false,error:error.message||"Не удалось создать запись."};}
    await user.setFlag(ID,RESULT,result);return result;
  });
  handled.set(key,run);queue=run;
  if(handled.size>200)handled.delete(handled.keys().next().value);
  return run;
}

export async function requestCreation(action,input){
  if(!canCreateInSection(input.section))throw new Error("Нет права создания в этом разделе.");
  if(!game.users.some(u=>u.active&&fullGM(u)))throw new Error("Для создания журнала или папки войдите в мир вместе с мастером: этой роли Foundry не разрешает создавать документы напрямую.");
  const user=game.user,request={id:uid(),action,section:input.section,name:action==="record"?"Новый журнал":String(input.name||"").trim().slice(0,80)};
  if(action==="record")request.folderId=input.folderId||null;else if(action==="folder")request.parentId=input.parentId||null;else throw new Error("Неизвестное действие создания.");
  let timer,listener;
  const result=new Promise((resolve,reject)=>{
    const finish=(error,value)=>{clearTimeout(timer);Hooks.off("updateUser",listener);error?reject(error):resolve(value);};
    listener=Hooks.on("updateUser",(doc,_changed,_options,writerId)=>{
      if(doc.id!==user.id||!fullGM(game.users.get(writerId)))return;
      const response=doc.getFlag(ID,RESULT);if(response?.requestId!==request.id)return;
      response.ok?finish(null,response):finish(new Error(response.error||"Создание не разрешено."));
    });
    timer=setTimeout(()=>finish(new Error("Мастер не ответил на создание. Проверьте, что у мастера включён модуль и открыта вкладка мира.")),20000);
    // Only names and folder IDs travel via User flags. Journal text is never sent here.
    user.setFlag(ID,REQUEST,request).catch(error=>finish(error));
  });
  return result;
}

export async function waitForCreated(type,id){
  const collection=type==="Folder"?game.folders:game.journal;
  if(collection.get(id))return collection.get(id);
  return new Promise((resolve,reject)=>{
    const event=`create${type}`;let timer;
    const hook=Hooks.on(event,doc=>{if(doc.id!==id)return;clearTimeout(timer);Hooks.off(event,hook);resolve(doc);});
    timer=setTimeout(()=>{Hooks.off(event,hook);reject(new Error("Созданный документ ещё не появился. Перезагрузите мир, чтобы увидеть его."));},5000);
    if(collection.get(id)){clearTimeout(timer);Hooks.off(event,hook);resolve(collection.get(id));}
  });
}

