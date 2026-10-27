import {ID,uid} from "./model.js";
import {fullGM,meta,managedRecords,createRecord,saveFolder} from "./store.js";

/** Deliberately opt-in: no demo data is created by enabling the module. */
export async function createDemo(){
  if(!fullGM())throw new Error("Создать пример может мастер.");
  if(managedRecords().length)throw new Error("Пример создаётся только в пустом кодексе.");
  const active=await saveFolder("quests","В процессе");await saveFolder("quests","Завершённые");await saveFolder("quests","Проваленные");
  const places=await saveFolder("locations","Пограничье"),world=await saveFolder("world","Хроника мира");
  const location=await createRecord({name:"Старый дозор",section:"locations",folderId:places.id,subtitle:"Каменная застава над рекой, где заканчивается мощёная дорога и начинается лес.",facts:[{label:"Тип",value:"Пограничная застава"},{label:"Кто управляет",value:"Капитан Элиас Вейн"}]},"<h2>У речного изгиба</h2><p>Низкая башня стоит на скальном выступе. По вечерам из окон караульного дома виден тёплый свет.</p><h2>Внутри заставы</h2><p>Здесь можно переночевать, купить припасы и узнать о состоянии дорог.</p>");
  await createRecord({name:"Дороги пограничья",section:"world",folderId:world.id,facts:[{label:"Тема",value:"Дороги и переправы"},{label:"Главный путь",value:"Северный тракт"}]},`<h2>Северная дорога</h2><p>Старый тракт соединяет поселения пограничья. У реки путники останавливаются на заставе @UUID[${location.uuid}]{Старый дозор}.</p><h2>Путевые обычаи</h2><p>Перед выходом из поселения оставляют зажжённый фонарь для тех, кто придёт следом.</p>`);
  const quest=await createRecord({name:"Тишина у переправы",section:"quests",folderId:active.id,subtitle:"Два обоза пропали на северной дороге. Капитан Вейн просит выяснить, что случилось у старого моста.",facts:[{label:"Кто поручил",value:"Элиас Вейн"},{label:"Место",value:"Старая переправа"},{label:"Награда",value:"Припасы и плата по договору"}],quest:{status:"active",objectives:[{id:uid(),state:"done",text:"Поговорить с капитаном Вейном"},{id:uid(),state:"todo",text:"Добраться до старой переправы"},{id:uid(),state:"todo",text:"Узнать судьбу пропавших обозов"}]}},"<h2>Что произошло</h2><p>Последний возница, вернувшийся с севера, видел на дороге брошенную телегу. Лошадей рядом не было. На заставе слишком мало бойцов, чтобы отправить дозор.</p><blockquote>Если у переправы тихо — это ещё не значит, что там безопасно.</blockquote>");
  await createRecord({name:"Северное пограничье",section:"maps",image:`modules/${ID}/assets/demo-map.svg`,map:{pins:[{id:uid(),type:"fortress",name:"Старый дозор",uuid:location.uuid,x:.58,y:.47},{id:uid(),type:"unknown",name:"Тишина у переправы",uuid:quest.uuid,x:.38,y:.25}],labels:[{id:uid(),text:"Седые хребты",x:.66,y:.17,size:21,italic:true,angle:-4,color:"#40351e",outline:false},{id:uid(),text:"Старая чаща",x:.365,y:.36,size:18,italic:true,color:"#40351e",outline:false},{id:uid(),text:"Северное море",x:.075,y:.54,size:20,italic:true,angle:-90,color:"#f0e8d4",outline:true}]}},"");
  return game.journal.filter(d=>meta(d)?.kind==="record");
}

