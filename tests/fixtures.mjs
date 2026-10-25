import {ID,defaultPolicies} from "../scripts/model.js";
export class Collection extends Array {
  get contents(){return [...this];}get(id){return this.find(x=>x.id===id);}get size(){return this.length;}
}
let counter=0,tick=0;
export class MockDocument {
  constructor(data={}){Object.assign(this,structuredClone(data));counter++;this.id??=`doc${counter}`;this.documentName??="JournalEntry";this.uuid=`${this.documentName}.${this.id}`;this.ownership??={default:0};this.flags??={};this.pages=new Collection(...(data.pages||[]).map(p=>new MockPage(p,this)));this._stats={modifiedTime:++tick};}
  get isOwner(){return this.testUserPermission(game.user,"OWNER");}
  getFlag(scope,key){return this.flags?.[scope]?.[key];}
  testUserPermission(user,level){return user?.isGM||Number(this.ownership[user?.id]??this.ownership.default??0)>={LIMITED:1,OBSERVER:2,OWNER:3}[level];}
  async update(changes){
    for(const [path,value] of Object.entries(changes)){
      if(path==="_id")continue;
      if(path==="ownership"){for(const [key,v] of Object.entries(value)){if(key.startsWith("-="))delete this.ownership[key.slice(2)];else this.ownership[key]=v;}continue;}
      const bits=path.split(".");let target=this;for(const part of bits.slice(0,-1))target=target[part]??={};target[bits.at(-1)]=structuredClone(value);
    }this._stats.modifiedTime=++tick;return this;
  }
  async createEmbeddedDocuments(_name,items){const result=items.map(p=>new MockPage(p,this));this.pages.push(...result);this._stats.modifiedTime=++tick;return result;}
  async updateEmbeddedDocuments(_name,items){for(const change of items)await this.pages.get(change._id).update(change);this._stats.modifiedTime=++tick;return items.map(i=>this.pages.get(i._id));}
  async deleteEmbeddedDocuments(_name,ids){for(const id of ids){const i=this.pages.findIndex(p=>p.id===id);if(i>=0)this.pages.splice(i,1);}this._stats.modifiedTime=++tick;}
  async delete(){const i=game.journal.findIndex(d=>d.id===this.id);if(i>=0)game.journal.splice(i,1);}
}
class MockPage extends MockDocument {
  constructor(data,parent){super({...data,pages:[]});this.parent=parent;this.documentName="JournalEntryPage";this.uuid=parent.uuid+".JournalEntryPage."+this.id;this.type=data.type||"text";}
  testUserPermission(user,level){return this.parent?this.parent.testUserPermission(user,level):super.testUserPermission(user,level);}
}
export function setup(){
  const users=new Collection({id:"gm",role:4,isGM:true,active:true,name:"Master"},{id:"p",role:1,isGM:false,name:"Player"},{id:"t",role:2,isGM:false,name:"Trusted"});
  let rules=defaultPolicies();
  globalThis.game={user:users[0],users,journal:new Collection(),folders:new Collection(),settings:{get:()=>structuredClone(rules),set:async(_id,_key,value)=>rules=structuredClone(value)}};
  globalThis.Folder={create:async data=>{const doc=new MockDocument(data);game.folders.push(doc);return doc;}};
  globalThis.JournalEntry={create:async data=>{const doc=new MockDocument(data);game.journal.push(doc);return doc;},updateDocuments:async changes=>{for(const change of changes)await game.journal.get(change._id).update(change);return changes;}};
  globalThis.CONFIG={JournalEntry:{documentClass:JournalEntry},Folder:{documentClass:Folder}};
  return {users,setRules:value=>rules=structuredClone(value),ID};
}
