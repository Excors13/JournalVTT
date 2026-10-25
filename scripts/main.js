import {ID,defaultPolicies} from "./model.js";
import {meta,fullGM,activeManager,provisionDiaries,synchronizeOwnership,migrateRecords} from "./store.js";
import {button,report} from "./dom.js";
import {CodexApp} from "./app.js";
import {CodexSettings} from "./settings.js";

let app;
export async function openCodex(uuid){
  app??=new CodexApp({position:{width:Math.min(1120,Math.max(500,window.innerWidth-40)),height:Math.min(780,Math.max(420,window.innerHeight-60))}});
  if(uuid)await app.openRecord(uuid);else await app.render({force:true});app.bringToFront();return app;
}
class CodexMenu extends foundry.applications.api.ApplicationV2 {render(){return openCodex();}}
let syncTimer,syncQueue=Promise.resolve();
function queueSync(){
  clearTimeout(syncTimer);syncTimer=setTimeout(()=>{
    if(!activeManager())return;
    syncQueue=syncQueue.then(async()=>{await migrateRecords();await provisionDiaries();await synchronizeOwnership();}).catch(report);
  },200);
}
Hooks.once("init",()=>{
  game.settings.register(ID,"policies",{name:"Права разделов",scope:"world",config:false,type:Object,default:defaultPolicies()});
  game.settings.registerMenu(ID,"open",{name:"Кодекс мира",label:"Открыть кодекс",hint:"Мир, задания, бестиарий и личные дневники.",icon:"fa-solid fa-book-open",type:CodexMenu,restricted:false});
  game.settings.registerMenu(ID,"access",{name:"Владение по умолчанию",label:"Настроить доступ по ролям",hint:"Уровни владения разделами для ролей Foundry VTT.",icon:"fa-solid fa-key",type:CodexSettings,restricted:true});
  game.keybindings.register(ID,"open",{name:"Открыть кодекс мира",editable:[{key:"KeyJ",modifiers:["ALT"]}],onDown:()=>{openCodex().catch(report);return true;},restricted:false});
  game.modules.get(ID).api={open:openCodex,openRecord:uuid=>openCodex(uuid),version:game.modules.get(ID).version};
});
Hooks.once("ready",queueSync);
Hooks.on("renderJournalDirectory",(_app,html)=>{
  const root=html instanceof HTMLElement?html:html?.[0];if(!root||root.querySelector(".world-codex-launcher"))return;
  const b=button("Кодекс мира",()=>openCodex(),{icon:"book-open",cls:"world-codex-launcher"});
  (root.querySelector(".header-actions")||root.querySelector(".directory-header")||root).prepend(b);
});
Hooks.on("preUpdateJournalEntry",(doc,changes,options)=>{
  // A change made through Foundry's native ownership dialog is a manual exception.
  if(!fullGM()||options.wcManaged||meta(doc)?.kind!=="record")return;
  if(Object.hasOwn(changes,"ownership")||Object.keys(changes).some(k=>k.startsWith("ownership.")))changes[`flags.${ID}.data.accessMode`]="manual";
});
for(const event of ["createJournalEntry","updateJournalEntry","deleteJournalEntry"])Hooks.on(event,doc=>app?.onWorldChange(doc));
for(const event of ["createJournalEntryPage","updateJournalEntryPage","deleteJournalEntryPage"])Hooks.on(event,page=>app?.onWorldChange(page.parent));
for(const event of ["createFolder","updateFolder","deleteFolder"])Hooks.on(event,()=>app?.onWorldChange(null));
Hooks.on("createUser",queueSync);Hooks.on("deleteUser",queueSync);
Hooks.on("updateUser",(_user,changes)=>{if(Object.hasOwn(changes,"role")||Object.hasOwn(changes,"active")||Object.hasOwn(changes,"name"))queueSync();});
Hooks.on("userConnected",queueSync);
