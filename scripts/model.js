export const ID = "world-codex";
export const SCHEMA = 2;
export const SECTIONS = Object.freeze({quests:"Задания",world:"Мир",characters:"Персонажи",factions:"Фракции",locations:"Места",bestiary:"Бестиарий",maps:"Карты"});
export const ICONS = {world:"globe",characters:"user",locations:"location-dot",factions:"flag",quests:"scroll",bestiary:"paw",maps:"map"};
export const PIN_TYPES={village:"Деревня",fortress:"Крепость",city:"Город",capital:"Столица",interest:"Место интереса",unknown:"Неизвестное",camp:"Военный лагерь",tomb:"Гробница",cave:"Пещера",monster:"Гнездо чудовищ",ruins:"Руины города"};
export const LEVELS = {0:"Нет доступа",1:"Ограниченный",2:"Наблюдатель",3:"Владелец"};
export const QUEST_STATES = {available:"Доступно",active:"В работе",completed:"Завершено",failed:"Провалено"};
export const OBJECTIVE_STATES = {todo:"Не выполнена",done:"Выполнена",failed:"Провалена",skipped:"Пропущена"};
export const copy = value => structuredClone(value);
export const validLevel = value => [0,1,2,3].includes(Number(value)) ? Number(value) : 0;
export function defaultPolicies() {
  return Object.fromEntries(Object.keys(SECTIONS).map(s=>[s,{1:2,2:s==="world"?3:2}]));
}
export function normalizePolicies(value) {
  const defaults=defaultPolicies();
  return Object.fromEntries(Object.keys(SECTIONS).map(s=>[s,{1:validLevel(value?.[s]?.[1]??defaults[s][1]),2:validLevel(value?.[s]?.[2]??defaults[s][2])}]));
}
export function roleOwnership(policies, section, users) {
  const rule=normalizePolicies(policies)[section];
  if(!rule) throw new Error("Неизвестный раздел журнала.");
  const result={default:0};
  for(const user of users) {
    const role=Number(user.role);
    result[user.id]=role>=3?3:role===1||role===2?rule[role]:0;
  }
  return result;
}
export function diaryOwnership(ownerId, users) {
  const owner=users.find(u=>u.id===ownerId);
  return {default:0,[ownerId]:owner && Number(owner.role)>0 ? 3 : 0};
}
export function sameOwnership(a,b) {
  // An explicit fallback level is equivalent to an absent user override.
  const normalize=o=>{const fallback=validLevel(o?.default??0);return Object.fromEntries([["default",fallback],...Object.entries(o||{}).filter(([k,v])=>k!=="default"&&Number(v)!==fallback).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,Number(v)])]);};
  return JSON.stringify(normalize(a))===JSON.stringify(normalize(b));
}
export function ownershipPatch(current,next) {
  // v14 validates ownership diffs as a mapping of IDs to integer levels.
  // Revoke obsolete grants with the new fallback, never -=user: null.
  return {...Object.fromEntries(Object.keys(current||{}).filter(k=>!Object.hasOwn(next,k)).map(k=>[k,validLevel(next.default??0)])),...next};
}
export function cleanRecord(input) {
  const section=Object.hasOwn(SECTIONS,input.section)?input.section:"world";
  return {
    schema:SCHEMA,kind:"record",section,
    folder:String(input.folder||"").trim().slice(0,250),
    subtitle:String(input.subtitle||"").trim().slice(0,2000),
    image:safeImagePath(input.image),
    facts:(Array.isArray(input.facts)?input.facts:[]).slice(0,100).map(f=>({label:String(f.label||"").trim().slice(0,150),value:String(f.value||"").trim().slice(0,4000)})).filter(f=>f.label||f.value),
    quest:{status:Object.hasOwn(QUEST_STATES,input.quest?.status)?input.quest.status:"active",objectives:(input.quest?.objectives||[]).map(o=>({id:String(o.id||"").slice(0,80),text:String(o.text||"").trim().slice(0,2000),state:Object.hasOwn(OBJECTIVE_STATES,o.state)?o.state:"todo"})).filter(o=>o.text).slice(0,200)},
    map:cleanMap(input.map)
  };
}
export const clamp=(value,min,max,fallback=min)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
export const uid=()=>globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now().toString(36);
export function cleanMap(input={}){
  const ids=new Set();
  const unique=value=>{const id=String(value||uid()).slice(0,80);if(ids.has(id))return null;ids.add(id);return id;};
  return {pins:(Array.isArray(input?.pins)?input.pins:[]).slice(0,1000).map(p=>({id:unique(p.id),type:Object.hasOwn(PIN_TYPES,p.type)?p.type:"interest",name:String(p.name||"").trim().slice(0,150),hidden:p.hidden===true,uuid:String(p.uuid||"").trim().slice(0,1000),x:clamp(p.x,0,1,.5),y:clamp(p.y,0,1,.5)})).filter(p=>p.id&&p.name&&p.uuid),labels:(Array.isArray(input?.labels)?input.labels:[]).slice(0,500).map(l=>({id:unique(l.id),text:String(l.text||"").trim().slice(0,500),hidden:l.hidden===true,x:clamp(l.x,0,1,.5),y:clamp(l.y,0,1,.5),size:Math.round(clamp(l.size,12,64,22)),bold:Boolean(l.bold),italic:Boolean(l.italic),align:["left","center","right"].includes(l.align)?l.align:"center",angle:clamp(l.angle,-180,180,0),color:/^#[0-9a-f]{6}$/i.test(l.color)?l.color:"#40351e",outline:l.outline!==false})).filter(l=>l.id&&l.text)};
}
export function safeImagePath(input) {
  const value=String(input||"").trim();
  if(!value)return "";
  if(/[\u0000-\u001f]/.test(value)||value.startsWith("//")||value.startsWith("\\")||/^(?!https?:)[a-z][a-z0-9+.-]*:/i.test(value))return "";
  return value.slice(0,4000);
}
export function folderTree(records) {
  const root={name:"",path:"",children:new Map(),records:[]};
  for(const record of records) {
    let node=root;
    const path=String(record.meta.folder||"").split("/").map(s=>s.trim()).filter(Boolean);
    for(const name of path) {
      const key=node.path?`${node.path}/${name}`:name;
      if(!node.children.has(name))node.children.set(name,{name,path:key,children:new Map(),records:[]});
      node=node.children.get(name);
    }
    node.records.push(record);
  }
  return root;
}

