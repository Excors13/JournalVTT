import {ID,CATALOGS,LEVELS} from "./model.js";
import {meta,readable} from "./store.js";
import {sanitizeHTML,node,icon,button} from "./dom.js";

export function hideNativeCodex(root){
  if(game.user.isGM||!root?.querySelectorAll)return;
  const journals=new Set(game.journal.filter(d=>["record","diary"].includes(meta(d)?.kind)).map(d=>d.id));
  const folders=new Set(game.folders.filter(f=>f.getFlag(ID,"root")||f.getFlag(ID,"section")||f.getFlag(ID,"folderSection")).map(f=>f.id));
  for(const row of root.querySelectorAll("[data-entry-id],[data-document-id],[data-folder-id],[data-uuid]")){
    const {entryId,documentId,folderId,uuid}=row.dataset;
    if(journals.has(entryId)||journals.has(documentId)||folders.has(folderId)||folders.has(documentId)||folders.has(entryId)||uuid?.startsWith("JournalEntry.")&&journals.has(uuid.split(".")[1])||uuid?.startsWith("Folder.")&&folders.has(uuid.split(".")[1]))row.remove();
  }
}

export function mountCodexLauncher(html,open){
  // Duck typing also supports detached windows, where instanceof HTMLElement fails.
  const root=html?.querySelector?html:html?.[0];if(!root?.querySelector)return;
  hideNativeCodex(root);
  let launcher=root.querySelector(".world-codex-launcher");
  if(!launcher)launcher=button("Кодекс мира",()=>open(),{icon:"book-open",cls:"world-codex-launcher",title:`Открыть кодекс мира · ${game.modules.get(ID)?.version||""}`});
  // Core creation controls may be hidden for players. Keep our button outside them.
  const host=root.querySelector(".directory-header")||root;
  if(launcher.parentElement!==host)host.prepend(launcher);
}

export function accessSummary(doc){
  const players=game.users.filter(u=>Number(u.role)>0&&!u.isGM);
  const groups={read:[],write:[],limited:[],none:[]};
  for(const user of players){const level=Number(doc.ownership?.[user.id]??doc.ownership?.default??0);groups[level===3?"write":level===2?"read":level===1?"limited":"none"].push(user.name);}
  const title=players.map(u=>`${u.name}: ${LEVELS[Number(doc.ownership?.[u.id]??doc.ownership?.default??0)]||LEVELS[0]}`).join("\n");
  const mode=meta(doc)?.accessMode==="section"?(meta(doc)?.ownershipPending?"Права ожидают мастера":"Права раздела"):"Индивидуально";
  return {label:`Читают ${groups.write.length+groups.read.length}/${players.length} · ${mode}`,title};
}

export function searchRecords(records,query){
  const words=String(query).toLocaleLowerCase("ru").trim().split(/\s+/).filter(Boolean);
  return records.filter(({doc,meta:m})=>{
    let text=`${doc.name} ${CATALOGS[m.section]}`;
    if(readable(doc)){
      const template=document.createElement("template");
      template.innerHTML=sanitizeHTML(doc.pages.filter(p=>p.type==="text"&&p.testUserPermission(game.user,"OBSERVER")).map(p=>p.text?.content||"").join(" "),{secrets:doc.isOwner});
      text+=` ${m.subtitle||""} ${template.content.textContent} ${(m.facts||[]).map(f=>`${f.label} ${f.value}`).join(" ")} ${(m.quest?.objectives||[]).map(o=>o.text).join(" ")}`;
    }
    text=text.toLocaleLowerCase("ru");return words.every(word=>text.includes(word));
  });
}

export class ViewHistory{
  constructor(){this.items=[];this.index=-1;}
  push(state){if(JSON.stringify(this.items[this.index])===JSON.stringify(state))return;this.items.splice(this.index+1);this.items.push(structuredClone(state));if(this.items.length>80)this.items.shift();this.index=this.items.length-1;}
  target(step,allowed){for(let i=this.index+step;i>=0&&i<this.items.length;i+=step)if(allowed(this.items[i]))return i;return -1;}
}

/** Expand within Foundry, so native dialogs and file pickers stay usable above the codex. */
export class WindowMode{
  constructor(app){this.app=app;this.expanded=false;this.resize=()=>this.fit();}
  view(){return this.app.element?.ownerDocument.defaultView||window;}
  fit(){if(this.expanded&&this.app.rendered){const v=this.view();this.app.setPosition({left:0,top:0,width:v.innerWidth,height:v.innerHeight,scale:1});this.app.mapView?.position();}}
  detach(){this.listening?.removeEventListener("resize",this.resize);this.listening=null;}
  sync(){
    this.app.element?.classList.toggle("wc-expanded",this.expanded);
    this.detach();if(this.expanded){this.listening=this.view();this.listening.addEventListener("resize",this.resize);this.fit();}
    const b=this.app.element?.querySelector(".wc-expand-codex");if(b){const title=this.expanded?"Вернуть размер окна":"Кодекс на весь экран";b.setAttribute("aria-label",title);b.dataset.tooltip=title;b.setAttribute("aria-pressed",String(this.expanded));b.replaceChildren(icon(this.expanded?"compress":"expand"));}
  }
  toggle(){
    if(!this.app.rendered)return;
    if(!this.expanded)this.previous={...this.app.position};
    this.expanded=!this.expanded;this.sync();
    if(!this.expanded&&this.previous){const v=this.view(),p=this.previous;const width=Math.min(Number(p.width)||1120,v.innerWidth),height=Math.min(Number(p.height)||780,v.innerHeight);this.app.setPosition({...p,width,height,left:Math.max(0,Math.min(Number(p.left)||0,v.innerWidth-width)),top:Math.max(0,Math.min(Number(p.top)||0,v.innerHeight-height))});this.app.mapView?.position();}
  }
}

export function fontControls(app){
  const controls=node("div","wc-font-controls");
  controls.append(button("A−",()=>app.changeFont(-1),{title:"Уменьшить текст"}),button("A+",()=>app.changeFont(1),{title:"Увеличить текст"}));return controls;
}

