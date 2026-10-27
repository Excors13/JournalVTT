import {cleanImageFrame,safeImagePath} from "./model.js";
import {node,icon,button,field,selectField} from "./dom.js";

// Both the reader and editor use the same 5:6 frame and percentage geometry.
export function frameGeometry(width,height,value){
  width=Number(width);height=Number(height);if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null;
  const frame=cleanImageFrame(value),scale=(frame.fit==="contain"?Math.min(5/width,6/height):Math.max(5/width,6/height))*frame.zoom;
  const w=width*scale/5*100,h=height*scale/6*100;
  return {width:w,height:h,left:(100-w)*frame.x,top:(100-h)*frame.y};
}
export function panImageFrame(value,geometry,dx,dy,width,height){
  const frame=cleanImageFrame(value),gapX=width*(1-geometry.width/100),gapY=height*(1-geometry.height/100);
  return cleanImageFrame({...frame,x:frame.x+(Math.abs(gapX)>0.5?dx/gapX:0),y:frame.y+(Math.abs(gapY)>0.5?dy/gapY:0)});
}
export function portraitFrame(path,value,{alt="",placeholder="image",onStatus=()=>{}}={}){
  const element=node("div","wc-art");let frame=cleanImageFrame(value),source=null,image=null;
  const draw=()=>{
    const geometry=frameGeometry(image?.naturalWidth,image?.naturalHeight,frame);if(!geometry)return;
    Object.assign(image.style,Object.fromEntries(Object.entries(geometry).map(([key,value])=>[key,`${value}%`])));image.style.visibility="visible";
  };
  const setSource=path=>{
    const next=safeImagePath(path);if(next===source)return;source=next;image=null;element.replaceChildren();
    if(!next){element.append(icon(placeholder),node("span","","Изображение страницы"));onStatus("empty");return;}
    const img=node("img","wc-framed-image");image=img;img.alt=alt;img.draggable=false;img.decoding="async";img.style.visibility="hidden";
    img.addEventListener("load",()=>{if(image!==img)return;draw();onStatus("ready");});
    img.addEventListener("error",()=>{if(image!==img)return;image=null;element.replaceChildren(icon(placeholder));onStatus("error");});
    element.append(img);onStatus("loading");img.src=next;if(img.complete&&img.naturalWidth){draw();onStatus("ready");}
  };
  setSource(path);
  return {element,get image(){return image;},get source(){return source;},setSource,setFrame:value=>{frame=cleanImageFrame(value);draw();}};
}
export function imageFrameEditor(path,value,onChange=()=>{}){
  const root=node("section","wc-image-framing"),status=node("p","wc-frame-status");status.setAttribute("aria-live","polite");
  let frame=cleanImageFrame(value),drag=null;
  const view=portraitFrame(path,frame,{alt:"Предпросмотр изображения в кодексе",onStatus:state=>{status.textContent={empty:"Выберите изображение для настройки кадра.",loading:"Загрузка изображения…",ready:"Так изображение будет выглядеть в записи.",error:"Не удалось загрузить изображение. Проверьте путь и доступ к файлу."}[state];}});
  view.element.classList.add("wc-frame-preview");
  root.append(node("h4","","Область изображения"),view.element,status,node("p","wc-note","Перетащите изображение в рамке или настройте положение ползунками."));
  const fit=selectField("Размещение",{cover:"Заполнить рамку",contain:"Показать целиком"},frame.fit),sliders={},outputs={};root.append(fit.wrap);
  for(const [key,label,min,max,step] of [["zoom","Масштаб",0.25,4,0.05],["x","По горизонтали",0,1,0.01],["y","По вертикали",0,1,0.01]]){
    const control=field(label,frame[key]),output=node("output");control.input.type="range";control.input.min=min;control.input.max=max;control.input.step=step;control.input.dataset.frameControl=key;control.wrap.append(output);root.append(control.wrap);sliders[key]=control.input;outputs[key]=output;
    control.input.addEventListener("input",()=>update({...frame,[key]:Number(control.input.value)}));
  }
  const sync=()=>{fit.input.value=frame.fit;for(const key of Object.keys(sliders)){sliders[key].value=String(frame[key]);outputs[key].textContent=`${Math.round(frame[key]*100)}%`;}view.setFrame(frame);};
  const update=value=>{frame=cleanImageFrame(value);sync();onChange({...frame});};
  fit.input.addEventListener("change",()=>update({...frame,fit:fit.input.value}));
  const actions=node("div","wc-actions");actions.append(button("−",()=>update({...frame,zoom:frame.zoom-0.1}),{title:"Уменьшить изображение"}),button("+",()=>update({...frame,zoom:frame.zoom+0.1}),{title:"Увеличить изображение"}),button("Сбросить кадр",()=>update(cleanImageFrame())));root.append(actions);
  view.element.addEventListener("pointerdown",event=>{
    if(event.button!==0||drag)return;const geometry=frameGeometry(view.image?.naturalWidth,view.image?.naturalHeight,frame);if(!geometry)return;
    event.preventDefault();const rect=view.element.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX,y:event.clientY,frame:{...frame},geometry,width:rect.width,height:rect.height};view.element.setPointerCapture?.(event.pointerId);view.element.classList.add("wc-is-panning");
  });
  view.element.addEventListener("pointermove",event=>{if(!drag||event.pointerId!==drag.id)return;event.preventDefault();update(panImageFrame(drag.frame,drag.geometry,event.clientX-drag.x,event.clientY-drag.y,drag.width,drag.height));});
  const stop=event=>{if(!drag||event.pointerId!==drag.id)return;drag=null;view.element.classList.remove("wc-is-panning");};
  for(const event of ["pointerup","pointercancel","lostpointercapture"])view.element.addEventListener(event,stop);
  sync();
  return {element:root,setSource:path=>{const next=safeImagePath(path);if(next!==view.source){update(cleanImageFrame());view.setSource(next);}},getFrame:()=>({...frame})};
}
