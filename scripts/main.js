import {ID,defaultPolicies} from "./model.js";
import {meta,fullGM,activeManager,provisionDiaries,synchronizeOwnership,migrateRecords} from "./store.js";
import {report} from "./dom.js";
import {CodexApp} from "./app.js";
import {CodexSettings,CodexKeybindings} from "./settings.js";
import {mountCodexLauncher} from "./experience.js";
import {QuestNotices} from "./notifications.js";
import {handleCreationRequest} from "./creation.js";

let app,toggling=false;
const notices=new QuestNotices();
export async function openCodex(uuid){
  app??=new CodexApp({position:{width:Math.min(1120,Math.max(500,window.innerWidth-40)),height:Math.min(780,Math.max(420,window.innerHeight-60))}});
  if(uuid)await app.openRecord(uuid);else await app.render({force:true});app.bringToFront();return app;
}
export async function toggleCodex(){
  if(toggling)return;
  toggling=true;
  try{if(app?.rendered)await app.close();else await openCodex();}finally{toggling=false;}
}
function onCodexKey(context={}){
  // Leave typing to chat, form fields and the native journal editor.
  const typing="input,textarea,select,[contenteditable]:not([contenteditable='false']),prose-mirror";
  const targets=[document.activeElement,...(context.event?.composedPath?.()||[])];
  if(targets.some(target=>target?.closest?.(typing)))return false;
  if(!context.repeat)toggleCodex().catch(report);
  return true;
}
class CodexMenu extends foundry.applications.api.ApplicationV2 {render(){return openCodex();}}
let syncTimer,syncQueue=Promise.resolve();
function queueSync(){
  clearTimeout(syncTimer);syncTimer=setTimeout(()=>{
    if(!activeManager())return;
    syncQueue=syncQueue.then(async()=>{await migrateRecords();await provisionDiaries();await synchronizeOwnership();}).catch(report);
  },200);
}
function initializeCodex(){
  const module=game.modules.get(ID);if(module.__codexInitialized)return;
  game.settings.register(ID,"fontSize",{name:"Размер текста кодекса",hint:"Личная настройка основного текста страниц.",scope:"client",config:true,type:Number,range:{min:12,max:22,step:1},default:14,onChange:value=>app?.applyFont(value)});
  game.settings.register(ID,"policies",{name:"Права разделов",scope:"world",config:false,type:Object,default:defaultPolicies()});
  game.settings.registerMenu(ID,"open",{name:"Кодекс мира",label:"Открыть кодекс",hint:"Мир, задания, бестиарий и личные дневники.",icon:"fa-solid fa-book-open",type:CodexMenu,restricted:false});
  game.settings.registerMenu(ID,"keybindings",{name:"Клавиша открытия кодекса",label:"Выбрать клавишу",hint:"Личный бинд открытия и закрытия кодекса. По умолчанию J; можно выбрать другую клавишу или сочетание. Сохраните назначение в открывшемся окне управления.",icon:"fa-solid fa-keyboard",type:CodexKeybindings,restricted:false});
  game.settings.registerMenu(ID,"access",{name:"Владение по умолчанию",label:"Настроить доступ по ролям",hint:"Уровни владения разделами для ролей Foundry VTT.",icon:"fa-solid fa-key",type:CodexSettings,restricted:true});
  if(!module.__codexBindingRegistered)game.keybindings.register(ID,"open",{name:"Открыть / закрыть кодекс мира",hint:"Выбранное сочетание переключает окно кодекса. По умолчанию J (О в русской раскладке). При вводе текста клавиша не перехватывается.",editable:[{key:"KeyJ"}],onDown:onCodexKey,repeat:false,precedence:CONST.KEYBINDING_PRECEDENCE.PRIORITY,restricted:false});
  module.api=Object.assign(module.api||{},{open:openCodex,toggle:toggleCodex,openRecord:uuid=>openCodex(uuid),version:module.version});
  module.__codexInitialized=true;
}
function activateCodex(){
  const module=game.modules.get(ID);if(module.__codexReady)return;
  notices.seed(game.journal);queueSync();mountCodexLauncher(ui.journal?.element,openCodex);module.__codexReady=true;
}
// The standalone loader may recover after Foundry's once-only hooks have passed.
export function resumeCodex(){initializeCodex();if(game.ready)activateCodex();}
Hooks.once("init",initializeCodex);
Hooks.once("ready",activateCodex);
Hooks.on("renderJournalDirectory",(_app,html)=>mountCodexLauncher(html,openCodex));
// UI replacements can subclass the directory or render it before the ready hook.
Hooks.on("renderApplicationV2",(directory,html)=>{
  if(directory?.collection===game.journal||directory?.id==="journal"||directory?.tabName==="journal")mountCodexLauncher(html,openCodex);
});
Hooks.on("createJournalEntry",doc=>notices.created(doc));
Hooks.on("createJournalEntry",doc=>{if(meta(doc)?.ownershipPending||meta(doc)?.folderPending)queueSync();});
Hooks.on("updateJournalEntry",doc=>notices.updated(doc));
Hooks.on("deleteJournalEntry",doc=>notices.deleted(doc));
Hooks.on("preUpdateJournalEntry",(doc,changes,options)=>{
  // A change made through Foundry's native ownership dialog is a manual exception.
  if(!fullGM()||options.wcManaged||meta(doc)?.kind!=="record")return;
  if(Object.hasOwn(changes,"ownership")||Object.keys(changes).some(k=>k.startsWith("ownership."))){changes[`flags.${ID}.data.accessMode`]="manual";changes[`flags.${ID}.data.ownershipPending`]=false;changes[`flags.${ID}.data.folderPending`]=false;}
});
for(const event of ["createJournalEntry","updateJournalEntry","deleteJournalEntry"])Hooks.on(event,doc=>app?.onWorldChange(doc));
for(const event of ["createJournalEntryPage","updateJournalEntryPage","deleteJournalEntryPage"])Hooks.on(event,page=>app?.onWorldChange(page.parent));
for(const event of ["createFolder","updateFolder","deleteFolder"])Hooks.on(event,()=>app?.onWorldChange(null));
Hooks.on("createUser",queueSync);Hooks.on("deleteUser",queueSync);
Hooks.on("updateUser",(_user,changes)=>{if(Object.hasOwn(changes,"role")||Object.hasOwn(changes,"active")||Object.hasOwn(changes,"name"))queueSync();});
Hooks.on("updateUser",(user,changes,options,userId)=>{handleCreationRequest(user,changes,options,userId)?.catch(report);});
Hooks.on("updateSetting",setting=>{if(setting.key===`${ID}.policies`)app?.onWorldChange(null);});
Hooks.on("userConnected",queueSync);

