import {safeImagePath} from "./model.js";
export function node(tag,cls,text) {
  const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;
}
export function icon(name) {const i=node("i",`fa-solid fa-${name}`);i.setAttribute("aria-hidden","true");return i;}
export function button(label,action,{icon:iconName,cls="",title,disabled=false}={}) {
  const b=node("button",`wc-button ${cls}`);b.type="button";b.disabled=disabled;
  if(iconName)b.append(icon(iconName));if(label)b.append(node("span","",label));
  if(title){b.setAttribute("aria-label",title);b.dataset.tooltip=title;}
  b.addEventListener("click",async e=>{e.preventDefault();try{await action(e);}catch(error){report(error);}});return b;
}
export function report(error) {console.error("World Codex |",error);ui.notifications.error(error.message||"Не удалось выполнить действие.");}
export function field(label,value,{tag="input",name="",rows=3,required=false}={}) {
  const wrap=node("label","wc-field");wrap.append(node("span","",label));const input=node(tag);input.name=name;input.value=value??"";input.required=required;input.setAttribute("aria-label",label);
  if(tag==="textarea")input.rows=rows;wrap.append(input);return {wrap,input};
}
export function selectField(label,options,value) {
  const {wrap,input}=field(label,"",{tag:"select"});for(const [v,label] of Object.entries(options)){const o=node("option","",label);o.value=v;input.append(o);}input.value=String(value);return {wrap,input};
}
export async function confirm(content,title="Кодекс мира") {
  return foundry.applications.api.DialogV2.confirm({window:{title},content,rejectClose:false,modal:true});
}
const ALLOWED=new Set("P BR STRONG B EM I U S H1 H2 H3 H4 H5 UL OL LI BLOCKQUOTE PRE CODE HR TABLE THEAD TBODY TFOOT TR TD TH IMG A SECTION DIV SPAN FIGURE FIGCAPTION MARK SUB SUP DETAILS SUMMARY".split(" "));
const DROP=new Set("SCRIPT STYLE IFRAME OBJECT EMBED FORM INPUT BUTTON SELECT TEXTAREA LINK META SVG MATH".split(" "));
export function sanitizeHTML(value,{secrets=true}={}) {
  const template=document.createElement("template");template.innerHTML=String(value||"");
  const clean=parent=>{
    for(const child of [...parent.children]){
      if(DROP.has(child.tagName)){child.remove();continue;}
      clean(child);
      if(!ALLOWED.has(child.tagName)){child.replaceWith(...child.childNodes);continue;}
      for(const attr of [...child.attributes]){
        const k=attr.name,v=attr.value;
        const safeClass=k==="class"&&/^(?:secret|revealed|content-link|inline-roll|broken|[\s])+$/i.test(v);
        const safeData=["data-uuid","data-id","data-type","data-pack","data-tooltip","data-revealed"].includes(k);
        const safeGeneric=["title","alt","colspan","rowspan"].includes(k);
        const safeHref=k==="href"&&!/^[\s]*(?:javascript|data|vbscript):/i.test(v)&&!/[\u0000-\u001f]/.test(v)&&(!/^[a-z][a-z0-9+.-]*:/i.test(v)||/^(https?:|mailto:)/i.test(v));
        const safeSrc=k==="src"&&child.tagName==="IMG"&&safeImagePath(v)===v;
        if(!(safeClass||safeData||safeGeneric||safeHref||safeSrc))child.removeAttribute(k);
      }
      if(child.tagName==="A")child.setAttribute("rel","noopener noreferrer");
      if(!secrets&&child.classList.contains("secret")&&!child.classList.contains("revealed")&&child.dataset.revealed!=="true")child.remove();
    }
  };clean(template.content);return template.innerHTML;
}
export async function enrichedBody(html,doc) {
  const clean=sanitizeHTML(html,{secrets:doc.isOwner});
  const editor=foundry.applications.ux.TextEditor.implementation;
  return sanitizeHTML(await editor.enrichHTML(clean,{secrets:doc.isOwner,relativeTo:doc}),{secrets:doc.isOwner});
}
export function richEditor(value,doc) {
  const editor=foundry.applications.elements.HTMLProseMirrorElement.create({name:"body",value:sanitizeHTML(value),documentUUID:doc?.uuid||"",collaborate:false,toggled:false,height:320});
  editor.classList.add("wc-rich-editor");return editor;
}
export function activateLinks(container,onManaged){
  container.addEventListener("click",async event=>{
    const anchor=event.target.closest("a.content-link[data-uuid]");if(!anchor)return;
    event.preventDefault();event.stopPropagation();
    try{const doc=await fromUuid(anchor.dataset.uuid);if(!doc||!doc.testUserPermission(game.user,"OBSERVER"))throw new Error("Запись недоступна.");const entry=doc.documentName==="JournalEntryPage"?doc.parent:doc;
      if(entry.documentName==="JournalEntry"&&entry.getFlag("world-codex","data")?.kind==="record"&&onManaged)await onManaged(doc.uuid);
      else await doc.sheet?.render({force:true});
    }catch(error){report(error);}
  });
}

