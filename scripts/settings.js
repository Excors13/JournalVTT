import {ID,SECTIONS,LEVELS} from "./model.js";
import {fullGM,policies,synchronizeOwnership,provisionDiaries} from "./store.js";
import {CodexBase} from "./base-app.js";
import {node,button,selectField,report} from "./dom.js";

export class CodexSettings extends CodexBase {
  static DEFAULT_OPTIONS={id:"world-codex-settings",position:{width:760,height:650},window:{title:"Кодекс мира — Владение по умолчанию"}};
  async _renderHTML() {
    if(!fullGM())throw new Error("Настройки доступны только мастеру.");
    const root=node("div","wc-app wc-settings-view"),form=node("form","wc-editor");
    form.append(node("h1","","Владение по умолчанию"),node("p","wc-note","Роли берутся из учётных записей Foundry VTT. Настройки относятся только к записям кодекса. Мастер и помощник мастера имеют доступ, предусмотренный Foundry."));
    const rows=node("div","wc-policy-rows"),selects=[];
    for(const [section,name] of Object.entries(SECTIONS)){
      const row=node("div","wc-policy-row");row.append(node("h3","",name));
      for(const [role,label] of [[1,"Игрок"],[2,"Доверенный игрок"]]){
        const field=selectField(label,LEVELS,policies()[section][role]);field.input.dataset.section=section;field.input.dataset.role=String(role);selects.push(field.input);row.append(field.wrap);
      }rows.append(row);
    }
    form.append(rows);
    const check=node("label","wc-checkline"),input=node("input");input.type="checkbox";input.checked=true;check.append(input,node("span","","Применить также к существующим записям, наследующим права раздела"));form.append(check);
    form.append(node("p","wc-note","Индивидуальные настройки владения сохраняются. Права личных дневников не зависят от этой таблицы."));
    const actions=node("div","wc-actions");actions.append(button("Проверить личные дневники",()=>provisionDiaries(),{icon:"book"}),button("Отмена",()=>this.close()));
    const save=node("button","wc-button wc-primary","Сохранить");save.type="submit";actions.append(save);form.append(actions);
    form.addEventListener("submit",async e=>{
      e.preventDefault();if(!fullGM())return;save.disabled=true;
      try{
        const next=Object.fromEntries(Object.keys(SECTIONS).map(id=>[id,{}]));for(const s of selects)next[s.dataset.section][s.dataset.role]=Number(s.value);
        await game.settings.set(ID,"policies",next);
        if(input.checked){const result=await synchronizeOwnership({applyDefaults:true});ui.notifications.info(`Кодекс: обновлено записей — ${result.updated}. Индивидуальные права сохранены.`);}
        else ui.notifications.info("Кодекс: новые правила будут применяться к новым записям.");
        await this.close();
      }catch(error){report(error);save.disabled=false;}
    });root.append(form);return root;
  }
}
