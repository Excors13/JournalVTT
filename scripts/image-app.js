import {CodexBase} from "./base-app.js";
import {node,button,field} from "./dom.js";
import {safeImagePath,cleanImageFrame} from "./model.js";
import {imageCropEditor} from "./portrait.js";

/** Image changes remain local until Apply; closing the window discards them. */
export class CodexImageEditor extends CodexBase {
  static DEFAULT_OPTIONS={id:"world-codex-image-editor",position:{width:850,height:690},window:{title:"Редактировать изображение",icon:"fa-solid fa-crop-simple"}};
  constructor({path,frame,apply,...options}){super({...options,position:{width:Math.min(850,globalThis.innerWidth?innerWidth-24:850),height:Math.min(690,globalThis.innerHeight?innerHeight-36:690),...options.position}});this.path=path||"";this.frame=cleanImageFrame(frame);this.apply=apply;}
  async _renderHTML(){
    this.crop?.destroy();const root=node("div","wc-app wc-image-dialog"),source=node("div","wc-image-source"),path=field("Изображение",this.path);path.input.placeholder="Путь к файлу Foundry или HTTPS";
    this.crop=imageCropEditor(this.path,this.frame,frame=>this.frame=frame);const setPath=value=>{this.path=value;path.input.value=value;this.crop.setSource(value);this.frame=this.crop.getFrame();};path.input.addEventListener("change",()=>setPath(path.input.value));
    source.append(path.wrap,button("Выбрать файл",()=>new foundry.applications.apps.FilePicker({type:"image",current:path.input.value,callback:setPath}).render({force:true}),{icon:"image"}));
    const error=node("p","wc-error");error.hidden=true;error.setAttribute("role","alert");const actions=node("footer","wc-actions wc-image-actions");
    actions.append(button("Убрать изображение",async()=>{await this.apply("",cleanImageFrame());await this.close();}),button("Отмена",()=>this.close()),button("Применить",async()=>{
      const value=path.input.value.trim();if(!value||safeImagePath(value)!==value||!this.crop.ready){error.textContent="Выберите доступное изображение и дождитесь загрузки.";error.hidden=false;return;}
      await this.apply(value,this.crop.getFrame());await this.close();
    },{cls:"wc-primary"}));root.append(source,this.crop.element,error,actions);return root;
  }
  async _onRender(context,options){await super._onRender(context,options);this.crop.mount();}
  async close(options={}){this.crop?.destroy();return super.close(options);}
}
