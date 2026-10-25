import {meta,readable} from "./store.js";
import {node,icon,button} from "./dom.js";

export function questSnapshot(doc){const m=meta(doc);return m?.kind==="record"&&m.section==="quests"?{status:m.quest?.status,objectives:(m.quest?.objectives||[]).map(o=>({id:o.id,text:o.text,state:o.state}))}:null;}
export function questAdvanced(before,after){
  if(!before||!after)return false;
  if(before.status!=="completed"&&after.status==="completed")return true;
  return after.objectives.some((o,i)=>o.state==="done"&&(o.id?before.objectives.find(p=>p.id===o.id):before.objectives.find(p=>p.text===o.text)||before.objectives[i])?.state!=="done");
}
export class QuestNotices{
  constructor(show=showQuestNotice){this.states=new Map();this.show=show;}
  seed(docs){this.states.clear();for(const doc of docs)this.states.set(doc.id,questSnapshot(doc));}
  created(doc){this.states.set(doc.id,questSnapshot(doc));}
  updated(doc){const before=this.states.get(doc.id),after=questSnapshot(doc);this.states.set(doc.id,after);if(readable(doc)&&questAdvanced(before,after))this.show(doc);}
  deleted(doc){this.states.delete(doc.id);}
}
const live=new Map();
export function showQuestNotice(doc){
  if(!readable(doc))return;
  let host=document.querySelector(".wc-quest-notices");if(!host){host=node("div","wc-quest-notices world-codex-window");host.setAttribute("aria-live","polite");host.setAttribute("aria-relevant","additions");document.body.append(host);}
  const old=live.get(doc.id);if(old){clearTimeout(old.timer);old.toast.remove();live.delete(doc.id);}
  const toast=node("div","wc-quest-toast");toast.setAttribute("role","status");toast.append(icon("scroll"),node("span","","Задание дополнено"));
  const remove=()=>{clearTimeout(live.get(doc.id)?.timer);toast.remove();live.delete(doc.id);if(!host.children.length)host.remove();};
  toast.append(button("",remove,{icon:"xmark",title:"Закрыть уведомление"}));host.append(toast);live.set(doc.id,{toast,timer:setTimeout(remove,5000)});
  while(live.size>3){const [id,item]=live.entries().next().value;clearTimeout(item.timer);item.toast.remove();live.delete(id);}
}
