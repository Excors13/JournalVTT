import {cleanImageFrame,safeImagePath} from "./model.js";
import {node,icon,button,field,report} from "./dom.js";

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
export function portraitFrame(path,value,{alt="",placeholder="image",onStatus=()=>{},onOpen}={}){
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
  if(onOpen&&safeImagePath(path)){
    element.classList.add("wc-image-open");element.setAttribute("role","button");element.tabIndex=0;element.setAttribute("aria-label","Открыть изображение в Foundry");
    const open=async()=>{if(source&&image?.naturalWidth)try{await onOpen(source);}catch(error){report(error);}};element.addEventListener("click",open);element.addEventListener("keydown",event=>{if(["Enter"," "].includes(event.key)){event.preventDefault();open();}});
  }
  setSource(path);
  return {element,get image(){return image;},get source(){return source;},setSource,setFrame:value=>{frame=cleanImageFrame(value);draw();}};
}

// Inverse of the reader geometry: the selected 5:6 rectangle in source pixels.
export function cropRectangle(width,height,value){
  const geometry=frameGeometry(width,height,value);if(!geometry)return null;
  return {x:-geometry.left/geometry.width*width,y:-geometry.top/geometry.height*height,width:100/geometry.width*width,height:100/geometry.height*height};
}
export function frameFromCrop(width,height,rect,value){
  const previous=cleanImageFrame(value),base=cropRectangle(width,height,{...previous,zoom:1});
  if(!base||!Number.isFinite(rect.width)||rect.width<=0)return previous;
  const zoom=Math.max(0.25,Math.min(4,base.width/rect.width)),w=base.width/zoom,h=w*6/5;
  return cleanImageFrame({...previous,zoom,x:Math.abs(width-w)>0.000001?rect.x/(width-w):0.5,y:Math.abs(height-h)>0.000001?rect.y/(height-h):0.5});
}
export function imageCropEditor(path,value,onChange=()=>{}){
  const element=node("section","wc-crop-editor"),stage=node("div","wc-crop-stage"),sourceImage=node("img","wc-crop-source"),selection=node("div","wc-crop-selection"),status=node("p","wc-frame-status");
  sourceImage.draggable=false;sourceImage.alt="Исходное изображение";selection.tabIndex=0;selection.setAttribute("role","group");selection.setAttribute("aria-label","Область кадра 5:6. Стрелки — переместить, плюс и минус — изменить размер.");status.setAttribute("aria-live","polite");
  let frame=cleanImageFrame(value),source=null,ready=false,drag=null,scene=null,observer;
  const preview=portraitFrame("",frame,{alt:"Предпросмотр кадра"});preview.element.classList.add("wc-frame-preview");
  const aside=node("aside","wc-crop-preview");aside.append(node("h3","","Результат"),preview.element,node("p","wc-note","Одинаковая форма 5:6 для всех записей."));
  for(const corner of ["nw","ne","sw","se"]){const handle=node("span",`wc-crop-handle wc-crop-${corner}`);handle.dataset.corner=corner;selection.append(handle);}
  stage.append(sourceImage,selection);const workspace=node("div","wc-crop-workspace");workspace.append(stage,aside);element.append(workspace,status);
  const zoom=field("Масштаб изображения",frame.zoom);zoom.input.type="range";zoom.input.min="0.25";zoom.input.max="4";zoom.input.step="0.01";zoom.input.dataset.frameControl="zoom";
  const output=node("output");zoom.wrap.append(output);
  const draw=(refit=true)=>{
    zoom.input.value=String(frame.zoom);output.textContent=`${Math.round(frame.zoom*100)}%`;preview.setFrame(frame);selection.hidden=!ready;sourceImage.hidden=!ready;
    if(!ready)return;
    const width=sourceImage.naturalWidth,height=sourceImage.naturalHeight,rect=cropRectangle(width,height,frame),box=stage.getBoundingClientRect();
    if(refit||!scene){const left=Math.min(0,rect.x),top=Math.min(0,rect.y),w=Math.max(width,rect.x+rect.width)-left,h=Math.max(height,rect.y+rect.height)-top,scale=Math.max(0.001,Math.min(Math.max(1,box.width-36)/w,Math.max(1,box.height-36)/h));scene={scale,x:(box.width-w*scale)/2-left*scale,y:(box.height-h*scale)/2-top*scale};}
    for(const [el,r] of [[sourceImage,{x:0,y:0,width,height}],[selection,rect]])Object.assign(el.style,{left:`${scene.x+r.x*scene.scale}px`,top:`${scene.y+r.y*scene.scale}px`,width:`${r.width*scene.scale}px`,height:`${r.height*scene.scale}px`});
  };
  const update=(next,refit=true)=>{frame=cleanImageFrame(next);draw(refit);onChange({...frame});};
  const resize=factor=>{const rect=cropRectangle(sourceImage.naturalWidth,sourceImage.naturalHeight,frame);if(!ready||!rect)return;const next={...rect,width:rect.width*factor};next.x=rect.x+(rect.width-next.width)/2;next.y=rect.y+(rect.height-next.width*6/5)/2;update(frameFromCrop(sourceImage.naturalWidth,sourceImage.naturalHeight,next,frame));};
  zoom.input.addEventListener("input",()=>update({...frame,zoom:Number(zoom.input.value)}));
  const controls=node("div","wc-crop-controls");controls.append(zoom.wrap,button("Уменьшить рамку",()=>resize(0.9)),button("Увеличить рамку",()=>resize(1.1)),button("Заполнить рамку",()=>update(cleanImageFrame())),button("Показать целиком",()=>update({...cleanImageFrame(),fit:"contain"})));element.append(controls);
  selection.addEventListener("pointerdown",event=>{
    if(event.button!==0||!ready||drag)return;event.preventDefault();event.stopPropagation();selection.focus?.();
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,rect:cropRectangle(sourceImage.naturalWidth,sourceImage.naturalHeight,frame),frame:{...frame},scale:scene.scale,corner:event.target.dataset.corner};selection.setPointerCapture?.(event.pointerId);
  });
  selection.addEventListener("pointermove",event=>{
    if(!drag||event.pointerId!==drag.id)return;event.preventDefault();const dx=(event.clientX-drag.x)/drag.scale,dy=(event.clientY-drag.y)/drag.scale,rect={...drag.rect};
    if(drag.corner){const sx=drag.corner.includes("e")?1:-1,sy=drag.corner.includes("s")?1:-1,change=(sx*dx+sy*dy*6/5)/(1+36/25),w=sourceImage.naturalWidth,h=sourceImage.naturalHeight,base=cropRectangle(w,h,{...drag.frame,zoom:1});rect.width=Math.max(base.width/4,Math.min(base.width/0.25,rect.width+change));if(sx<0)rect.x=drag.rect.x+drag.rect.width-rect.width;if(sy<0)rect.y=drag.rect.y+drag.rect.height-rect.width*6/5;
    }else{rect.x+=dx;rect.y+=dy;}
    update(frameFromCrop(sourceImage.naturalWidth,sourceImage.naturalHeight,rect,drag.frame),false);
  });
  const stop=event=>{if(drag?.id!==event.pointerId)return;drag=null;draw();};for(const name of ["pointerup","pointercancel","lostpointercapture"])selection.addEventListener(name,stop);
  selection.addEventListener("keydown",event=>{
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta&&!['+','-','='].includes(event.key))return;event.preventDefault();event.stopPropagation();
    if(!delta){resize(event.key==='-'?1.1:0.9);return;}if(!ready)return;const rect=cropRectangle(sourceImage.naturalWidth,sourceImage.naturalHeight,frame),step=rect.width*(event.shiftKey?0.1:0.01);update(frameFromCrop(sourceImage.naturalWidth,sourceImage.naturalHeight,{...rect,x:rect.x+delta[0]*step,y:rect.y+delta[1]*step},frame));
  });
  sourceImage.addEventListener("load",()=>{ready=true;status.textContent="Перемещайте рамку. Потяните за угол, чтобы изменить её размер.";draw();});
  sourceImage.addEventListener("error",()=>{ready=false;status.textContent="Не удалось загрузить изображение. Проверьте путь и доступ к файлу.";draw();});
  const setSource=path=>{const next=safeImagePath(path);if(next===source)return;source=next;ready=false;drag=null;scene=null;frame=cleanImageFrame();preview.setSource(next);status.textContent=next?"Загрузка изображения…":"Выберите изображение.";if(next)sourceImage.src=next;else sourceImage.removeAttribute("src");draw();};
  setSource(path);frame=cleanImageFrame(value);draw();
  return {element,setSource,getFrame:()=>({...frame}),get ready(){return ready;},mount:()=>{if(typeof ResizeObserver!=="undefined"){observer=new ResizeObserver(()=>draw());observer.observe(stage);}draw();},destroy:()=>{observer?.disconnect();drag=null;}};
}
