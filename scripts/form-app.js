import {CodexBase} from "./base-app.js";
import {node,button,report,confirm} from "./dom.js";

/** A small Foundry window for metadata; main journal text uses native ProseMirror. */
export class CodexForm extends CodexBase {
  static DEFAULT_OPTIONS={position:{width:470,height:590},window:{title:"Кодекс мира — Редактирование"}};
  constructor({title,build,save,remove,...options}){super({...options,window:{...options.window,title}});this.build=build;this.save=save;this.remove=remove;this.busy=false;this.changed=false;}
  async _renderHTML(){
    const root=node("div","wc-app wc-dialog-view"),form=node("form","wc-modal-form"),head=node("header","wc-modal-head");head.append(node("h2","",this.title));form.append(head);
    const fields=node("div","wc-modal-fields");const read=await this.build(fields);form.append(fields);
    const error=node("p","wc-error");error.setAttribute("role","alert");error.hidden=true;fields.append(error);
    const actions=node("footer","wc-actions wc-modal-actions");
    if(this.remove)actions.append(button("Удалить",async()=>{if(this.busy)return;if(!await confirm("<p>Удалить этот элемент?</p>"))return;await run(this.remove);},{icon:"trash",cls:"wc-delete-inline"}));
    actions.append(button("Отмена",()=>this.close()));const save=node("button","wc-button wc-primary","Сохранить");save.type="submit";actions.append(save);form.append(actions);root.append(form);
    const run=async fn=>{this.busy=true;save.disabled=true;try{await fn();this.changed=false;await this.close();}catch(e){error.textContent=e.message;error.hidden=false;report(e);}finally{this.busy=false;save.disabled=false;}};
    form.addEventListener("input",()=>this.changed=true);form.addEventListener("change",()=>this.changed=true);
    form.addEventListener("submit",e=>{e.preventDefault();if(!this.busy)run(async()=>this.save(await read()));});return root;
  }
}

