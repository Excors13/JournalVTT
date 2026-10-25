export class CodexBase extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS={classes:["world-codex-window"],tag:"div",window:{resizable:true,icon:"fa-solid fa-book-open"},position:{width:1120,height:780}};
  _replaceHTML(result,content) {content.replaceChildren(result);}
}
