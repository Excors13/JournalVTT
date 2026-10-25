import {ID,PIN_TYPES,cleanMap,copy,uid} from "./model.js";
import {meta,readable,editable,saveMap,versionOf,getBody,textPage} from "./store.js";
import {node,icon,button,field,selectField,enrichedBody,activateLinks,report} from "./dom.js";
import {CodexForm} from "./form-app.js";

export const mapGlyph=type=>{const img=node("img","wc-map-glyph");img.src=`modules/${ID}/assets/icons/${type}.svg`;img.alt="";img.setAttribute("aria-hidden","true");return img;};
export async function journalTarget(uuid){
  if(typeof uuid!=="string"||!uuid||uuid.length>1000)return null;
  try{const doc=await fromUuid(uuid);if(!doc||!["JournalEntry","JournalEntryPage"].includes(doc.documentName)||!readable(doc))return null;return doc;}catch{return null;}
}
const targetEntry=doc=>doc.documentName==="JournalEntryPage"?doc.parent:doc;
const targetBody=doc=>doc.documentName==="JournalEntryPage"?(doc.type==="text"?doc.text?.content||"":""):getBody(doc);

/** Coordinates are normalized to the image. Zoom/pan are local to each application. */
export class MapView {
  constructor(app,doc,state){this.app=app;this.doc=doc;this.state=state;this.data=cleanMap(meta(doc).map);this.editing=Boolean(state.editing&&editable(doc));this.placing=null;this.dead=false;this.previews=0;this.targets=new Map();this.roots=[];this.build();}
  build(){
    this.root=node("div","wc-map-view");const toolbar=node("div","wc-map-toolbar"),heading=node("h2","",this.doc.name),actions=node("div","wc-actions");toolbar.append(heading,actions);
    if(editable(this.doc)){this.editButton=button(this.editing?"Готово":"Редактировать карту",()=>{this.editing=!this.editing;this.state.editing=this.editing;this.placing=null;this.closePreview();this.syncEditing();this.drawPins().catch(report);},{icon:"pen"});actions.append(this.editButton);}
    actions.append(button("",()=>this.fullscreen(),{icon:"expand",title:"Карта на весь экран"}));this.root.append(toolbar);
    this.stage=node("div","wc-map-stage");this.stage.setAttribute("aria-label",`Карта ${this.doc.name}. Масштаб — колесо или кнопки, перемещение — перетаскивание.`);
    this.image=node("img","wc-map-image");this.image.alt=this.doc.name;this.image.draggable=false;
    this.labels=node("div","wc-map-labels");this.pins=node("div","wc-map-pins");this.stage.append(this.image,this.labels,this.pins);this.root.append(this.stage);
    this.bar=node("div","wc-map-addbar");this.hint=node("span","wc-note","Метки и подписи можно перетаскивать");
    this.addPin=button("Добавить метку",()=>this.place("pin"),{icon:"map-pin"});this.addLabel=button("Добавить подпись",()=>this.place("label"),{icon:"font"});this.bar.append(this.hint,this.addPin,this.addLabel);this.stage.append(this.bar);
    const zoom=node("div","wc-map-zoom");this.zoomText=node("span","","100%");zoom.append(button("",()=>this.zoom(1/1.25),{icon:"minus",title:"Уменьшить масштаб"}),this.zoomText,button("",()=>this.zoom(1.25),{icon:"plus",title:"Увеличить масштаб"}),button("",()=>this.fit(),{icon:"compress",title:"Вписать карту"}));this.stage.append(zoom);
    this.empty=node("div","wc-map-empty","Выберите изображение карты в свойствах страницы.");this.stage.append(this.empty);
    this.image.addEventListener("load",()=>{if(this.dead)return;this.w=this.image.naturalWidth;this.h=this.image.naturalHeight;this.empty.hidden=true;if(this.state.image!==meta(this.doc).image){this.state.image=meta(this.doc).image;this.state.zoom=1;this.state.x=null;this.state.y=null;}this.position();});
    this.image.addEventListener("error",()=>{this.empty.hidden=false;this.empty.textContent="Не удалось загрузить изображение. Проверьте путь и доступ к файлу.";});
    const path=meta(this.doc).image;if(path){this.image.src=path;this.empty.hidden=true;}else this.image.hidden=true;
    this.stage.addEventListener("pointerdown",e=>{if(e.button!==0||e.target.closest("button,.wc-map-preview"))return;if(!this.w)return;const box=this.stage.getBoundingClientRect();if(this.placing){const point=this.point(e.clientX-box.left,e.clientY-box.top);const kind=this.placing;this.placing=null;this.syncEditing();kind==="pin"?this.editPin({...point}):this.editLabel({...point});return;}this.pan={x:e.clientX,y:e.clientY,px:this.state.x,py:this.state.y};this.stage.setPointerCapture(e.pointerId);});
    this.stage.addEventListener("pointermove",e=>{if(!this.pan)return;this.state.x=this.pan.px+e.clientX-this.pan.x;this.state.y=this.pan.py+e.clientY-this.pan.y;this.position();});
    for(const name of ["pointerup","pointercancel"])this.stage.addEventListener(name,()=>this.pan=null);
    this.stage.addEventListener("wheel",e=>{if(e.target.closest(".wc-map-preview"))return;e.preventDefault();const box=this.stage.getBoundingClientRect();this.zoom(e.deltaY<0?1.12:1/1.12,e.clientX-box.left,e.clientY-box.top);},{passive:false});
    this.root.addEventListener("keydown",e=>{if(e.key==="Escape"){this.placing=null;this.closePreview();this.syncEditing();}});
    this.observer=new ResizeObserver(()=>this.position());this.observer.observe(this.stage);this.syncEditing();this.drawPins().catch(report);
  }
  destroy(){this.dead=true;this.previews++;this.observer?.disconnect();}
  fit(){this.state.zoom=1;this.state.x=null;this.state.y=null;this.position();}
  scale(){return Math.max(this.stage.clientWidth/this.w,this.stage.clientHeight/this.h)*(this.state.zoom||1);}
  position(){if(!this.w||!this.h||!this.stage.clientWidth||this.dead)return;const s=this.scale(),sw=this.stage.clientWidth,sh=this.stage.clientHeight,w=this.w*s,h=this.h*s;this.state.x??=(sw-w)/2;this.state.y??=(sh-h)/2;this.state.x=w>=sw?Math.min(0,Math.max(sw-w,this.state.x)):(sw-w)/2;this.state.y=h>=sh?Math.min(0,Math.max(sh-h,this.state.y)):(sh-h)/2;
    Object.assign(this.image.style,{width:`${this.w}px`,height:`${this.h}px`,transform:`translate(${this.state.x}px,${this.state.y}px) scale(${s})`});this.zoomText.textContent=`${Math.round((this.state.zoom||1)*100)}%`;
    for(const n of this.pins.children){const p=this.data.pins.find(p=>p.id===n.dataset.pin);if(p)this.locate(n,p,s);}
    for(const n of this.labels.children){const l=this.data.labels.find(l=>l.id===n.dataset.label);if(l){this.locate(n,l,s);n.style.transform=`translate(-50%,-50%) rotate(${l.angle}deg)`;this.labelStyle(n,l,this.state.zoom||1);}}
  }
  locate(n,p,s){n.style.left=`${this.state.x+p.x*this.w*s}px`;n.style.top=`${this.state.y+p.y*this.h*s}px`;}
  point(x,y){const s=this.scale();return {x:Math.max(0,Math.min(1,(x-this.state.x)/(this.w*s))),y:Math.max(0,Math.min(1,(y-this.state.y)/(this.h*s)))};}
  zoom(factor,x=this.stage.clientWidth/2,y=this.stage.clientHeight/2){if(!this.w)return;const old=this.state.zoom||1,next=Math.max(1,Math.min(5,old*factor));this.state.x=x-(x-this.state.x)*next/old;this.state.y=y-(y-this.state.y)*next/old;this.state.zoom=next;this.position();}
  syncEditing(){this.bar.hidden=!this.editing;this.stage.dataset.editing=String(this.editing);this.stage.dataset.placing=String(Boolean(this.placing));if(this.editButton){this.editButton.querySelector("span").textContent=this.editing?"Готово":"Редактировать карту";this.editButton.setAttribute("aria-pressed",String(this.editing));}this.addPin.setAttribute("aria-pressed",String(this.placing==="pin"));this.addLabel.setAttribute("aria-pressed",String(this.placing==="label"));this.hint.textContent=this.placing==="label"?"Укажите точку для подписи":this.placing?"Укажите точку для метки":"Метки и подписи можно перетаскивать";this.drawLabels();}
  place(kind){if(!this.editing||!editable(this.doc))return;this.closePreview();this.placing=this.placing===kind?null:kind;this.syncEditing();}
  drag(n,item,kind){let moved=false;n.addEventListener("pointerdown",e=>{if(!this.editing||!editable(this.doc))return;e.stopPropagation();moved=false;const original=copy(item),version=versionOf(this.doc),start={x:e.clientX,y:e.clientY};n.setPointerCapture(e.pointerId);
    const move=e=>{if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>4)moved=true;if(!moved)return;const s=this.scale();item.x=Math.max(0,Math.min(1,original.x+(e.clientX-start.x)/(this.w*s)));item.y=Math.max(0,Math.min(1,original.y+(e.clientY-start.y)/(this.h*s)));this.position();};
    const end=async e=>{n.removeEventListener("pointermove",move);n.removeEventListener("pointerup",end);n.removeEventListener("pointercancel",end);if(!moved)return;if(e.type==="pointercancel"){Object.assign(item,original);this.position();return;}try{await this.persist(this.data,version);}catch(error){Object.assign(item,original);this.position();report(error);}};
    n.addEventListener("pointermove",move);n.addEventListener("pointerup",end);n.addEventListener("pointercancel",end);
    });n.addEventListener("click",()=>{if(moved){moved=false;return;}if(this.editing)(kind==="pin"?this.editPin(item):this.editLabel(item));else if(kind==="pin")this.preview(item).catch(report);});
  }
  async drawPins(){const version=++this.previews;const resolved=await Promise.all(this.data.pins.map(async p=>[p.id,await journalTarget(p.uuid)]));if(this.dead||version!==this.previews)return;this.targets=new Map(resolved);this.pins.replaceChildren();
    for(const p of this.data.pins){if(p.hidden&&!game.user.isGM)continue;if(!this.targets.get(p.id)&&!this.editing)continue;const b=node("button","wc-map-pin");b.type="button";b.dataset.pin=p.id;if(p.hidden){b.classList.add("wc-map-hidden");b.dataset.tooltip="Скрыто от игроков";}b.setAttribute("aria-label",`${p.name} · ${PIN_TYPES[p.type]}`);b.dataset.tooltip=p.name;b.append(mapGlyph(p.type));this.drag(b,p,"pin");this.pins.append(b);}this.position();
  }
  drawLabels(){this.labels.replaceChildren();for(const l of this.data.labels){if(l.hidden&&!game.user.isGM)continue;const n=node(this.editing?"button":"span","wc-map-label",l.text);if(this.editing){n.type="button";n.setAttribute("aria-label",`Редактировать подпись: ${l.text}`);this.drag(n,l,"label");}if(l.hidden)n.classList.add("wc-map-hidden");n.dataset.label=l.id;this.labels.append(n);}this.position();}
  labelStyle(n,l,zoom=1){Object.assign(n.style,{fontFamily:"Georgia, 'Times New Roman', serif",fontSize:`${l.size*zoom}px`,fontWeight:l.bold?"700":"400",fontStyle:l.italic?"italic":"normal",textAlign:l.align,color:l.color,textShadow:l.outline?"-1px 0 #16130eb0,1px 0 #16130eb0,0 -1px #16130eb0,0 1px #16130eb0":"none"});}
  async persist(data,version){await this.app.perform(()=>saveMap(this.doc,data,version));}
  editPin(pin){if(!editable(this.doc)||(pin.hidden&&!game.user.isGM))return;const data=copy(this.data),version=versionOf(this.doc),draft={id:pin.id||uid(),type:"interest",name:"",uuid:"",...pin};
    new CodexForm({title:pin.id?"Редактировать метку":"Новая метка",position:{width:500,height:650},build:fields=>{
      this.visibilityField(fields,draft);const name=field("Название",draft.name,{required:true});name.input.maxLength=150;fields.append(name.wrap);
      const types=node("div","wc-pin-types");const draw=()=>{types.replaceChildren();for(const [key,title] of Object.entries(PIN_TYPES)){const b=button(title,()=>{draft.type=key;draw();},{cls:"wc-pin-type"});b.prepend(mapGlyph(key));b.setAttribute("aria-pressed",String(draft.type===key));types.append(b);}};draw();fields.append(types);
      const choices={"":"Выберите журнал"};for(const d of game.journal.filter(d=>readable(d)&&meta(d)?.section!=="maps"))choices[d.uuid]=d.name;
      const journal=selectField("Журнал",choices,draft.uuid),uuid=field("UUID журнала или текстовой страницы",draft.uuid,{required:true});journal.input.addEventListener("change",()=>{uuid.input.value=journal.input.value;if(!name.input.value.trim())name.input.value=game.journal.find(d=>d.uuid===journal.input.value)?.name||"";});
      fields.append(journal.wrap,uuid.wrap,node("p","wc-note","Можно перетащить журнал из панели Foundry в поле UUID."));uuid.input.addEventListener("dragover",e=>e.preventDefault());uuid.input.addEventListener("drop",e=>{e.preventDefault();try{const d=JSON.parse(e.dataTransfer.getData("text/plain"));if(d.uuid)uuid.input.value=d.uuid;}catch{}});
      return ()=>({...draft,name:name.input.value.trim(),uuid:uuid.input.value.trim()});
    },save:async p=>{if(!await journalTarget(p.uuid))throw new Error("Выберите доступный журнал или текстовую страницу.");if(!p.name)throw new Error("Введите название.");const i=data.pins.findIndex(x=>x.id===p.id);if(i<0)data.pins.push(p);else data.pins[i]=p;await this.persist(data,version);},remove:pin.id?()=>this.persist({...data,pins:data.pins.filter(p=>p.id!==pin.id)},version):undefined}).render({force:true});
  }
  editLabel(label){if(!editable(this.doc)||(label.hidden&&!game.user.isGM))return;const data=copy(this.data),version=versionOf(this.doc),draft={id:label.id||uid(),text:"",size:22,bold:false,italic:false,align:"center",angle:0,color:"#f0e8d4",outline:true,...label};
    new CodexForm({title:label.id?"Редактировать подпись":"Новая подпись",build:fields=>{
      this.visibilityField(fields,draft);fields.append(node("p","wc-note","Georgia · единый шрифт карты"));const text=field("Текст подписи",draft.text,{tag:"textarea",rows:2,required:true});text.input.maxLength=500;fields.append(text.wrap);
      const format=node("div","wc-actions wc-label-format");for(const [key,title,glyph] of [["bold","Жирный","bold"],["italic","Курсив","italic"]]){const b=button(title,()=>{draft[key]=!draft[key];b.setAttribute("aria-pressed",String(draft[key]));preview();},{icon:glyph});b.setAttribute("aria-pressed",String(draft[key]));format.append(b);}fields.append(format);
      const size=field("Размер, px при 100%",draft.size),angle=field("Поворот, °",draft.angle),color=field("Цвет текста",draft.color),align=selectField("Выравнивание",{left:"Слева",center:"По центру",right:"Справа"},draft.align);size.input.type="number";size.input.min=12;size.input.max=64;size.input.step=1;size.input.required=true;angle.input.type="number";angle.input.min=-180;angle.input.max=180;angle.input.required=true;color.input.type="color";
      const grid=node("div","wc-label-grid");grid.append(size.wrap,align.wrap,angle.wrap,color.wrap);fields.append(grid);
      const check=node("label","wc-checkline"),outline=node("input");outline.type="checkbox";outline.checked=draft.outline;check.append(outline,node("span","","Обводка для читаемости"));fields.append(check);
      const sample=node("div","wc-label-sample");fields.append(sample);const read=()=>({...draft,text:text.input.value.trim(),size:Number(size.input.value),angle:Number(angle.input.value),color:color.input.value,align:align.input.value,outline:outline.checked});const preview=()=>{sample.textContent=text.input.value||"Название на карте";this.labelStyle(sample,read());};fields.addEventListener("input",preview);fields.addEventListener("change",preview);preview();return read;
    },save:async l=>{if(!l.text)throw new Error("Введите подпись.");const i=data.labels.findIndex(x=>x.id===l.id);if(i<0)data.labels.push(l);else data.labels[i]=l;await this.persist(data,version);},remove:label.id?()=>this.persist({...data,labels:data.labels.filter(l=>l.id!==label.id)},version):undefined}).render({force:true});
  }
  closePreview(){this.previewRoot?.remove();this.previewRoot=null;}
  async preview(pin){this.closePreview();const doc=await journalTarget(pin.uuid);if(!doc)throw new Error("Журнал недоступен.");if(this.dead)return;
    const entry=targetEntry(doc),m=meta(entry),wrap=node("section","wc-map-preview"),header=node("header"),article=node("article","wc-prose");wrap.setAttribute("role","dialog");wrap.setAttribute("aria-label",doc.name);header.append(node("span","wc-note",PIN_TYPES[pin.type]),button("",()=>this.closePreview(),{icon:"xmark",title:"Закрыть просмотр"}));article.append(node("h2","",doc.name));if(m?.subtitle)article.append(node("p","wc-subtitle",m.subtitle));const body=node("div");body.innerHTML=await enrichedBody(targetBody(doc),doc);article.append(body);
    if(m?.section==="quests"&&m.quest?.objectives?.length){article.append(node("h3","","Цели задания"));const list=node("ul","wc-objectives");for(const o of m.quest.objectives){const li=node("li");li.dataset.state=o.state;li.append(icon(o.state==="done"?"circle-check":o.state==="failed"?"circle-xmark":"circle"),node("span","",o.text));list.append(li);}article.append(list);}
    activateLinks(body,uuid=>this.openFull(uuid));const footer=node("footer","wc-actions");footer.append(button("К карте",()=>this.closePreview()),button("Открыть журнал",()=>this.openFull(doc.uuid),{cls:"wc-primary"}));wrap.append(header,article,footer);this.stage.append(wrap);this.previewRoot=wrap;header.querySelector("button").focus();
  }
  async openFull(uuid){if(document.fullscreenElement===this.root)await document.exitFullscreen();const doc=await journalTarget(uuid);if(!doc)throw new Error("Журнал недоступен.");const entry=targetEntry(doc);if(meta(entry)?.kind==="record")await this.app.openFromMap(doc.uuid,this.doc.id);else await (doc.sheet||entry.sheet).render({force:true});}
  visibilityField(fields,draft){if(!game.user.isGM)return;const wrap=node("label","wc-checkline"),input=node("input");input.type="checkbox";input.checked=Boolean(draft.hidden);input.setAttribute("aria-label","Скрыть от игроков");input.addEventListener("change",()=>draft.hidden=input.checked);wrap.append(input,node("span","","Скрыть от игроков"));fields.append(wrap);}
  async fullscreen(){if(document.fullscreenElement===this.root){await document.exitFullscreen();return;}try{if(this.root.requestFullscreen)await this.root.requestFullscreen();else throw new Error("unsupported");}catch{this.app.windowMode.toggle();}}
}
