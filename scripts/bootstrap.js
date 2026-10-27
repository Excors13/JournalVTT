// No imports here: one small entry point survives a failure to load the runtime.
const ID="world-codex";
function startCodexLoader(fromInit=false){
  // ES modules may evaluate before the socket has created game or its packages.
  // Read the descriptor inside Foundry's lifecycle, never at module evaluation.
  const module=game.modules?.get(ID);
  if(!module||module.__codexLoaderStarted)return;
  module.__codexLoaderStarted=true;
  const api=module.api=module.api||{};api.version=module.version;
  const status=api.loader={state:"waiting",attempt:0,nextRetryAt:null,lastError:null};
  let pendingOpen=false,warned=false;
  function onKey(context={}){
    const typing="input,textarea,select,[contenteditable]:not([contenteditable='false']),prose-mirror";
    if([document.activeElement,...(context.event?.composedPath?.()||[])].some(target=>target?.closest?.(typing)))return false;
    if(!context.repeat){
      if(typeof module.api.toggle==="function")Promise.resolve(module.api.toggle()).catch(error=>ui.notifications.error(error.message));
      else pendingOpen=true;
    }
    return true;
  }
  if(fromInit&&!module.__codexBindingRegistered){
    game.keybindings.register(ID,"open",{name:"Открыть / закрыть кодекс мира",hint:"Выбранное сочетание переключает окно кодекса. По умолчанию J (О в русской раскладке). При вводе текста клавиша не перехватывается.",editable:[{key:"KeyJ"}],onDown:onKey,repeat:false,precedence:CONST.KEYBINDING_PRECEDENCE.PRIORITY,restricted:false});
    module.__codexBindingRegistered=true;
  }
  function schedule(delay){
    status.nextRetryAt=Date.now()+delay;
    setTimeout(()=>{status.nextRetryAt=null;void load();},delay);
  }
  function fatal(error){
    status.state="error";status.lastError=api.loadError=String(error);
    console.error("World Codex | Ошибка запуска; автоматические попытки остановлены.",error);
    ui.notifications.error("Кодекс мира: ошибка запуска. Передайте мастеру первую ошибку World Codex из консоли (F12).",{permanent:true});
  }
  async function load(){
    if(status.state==="loading"||status.state==="ready"||status.state==="error")return;
    status.state="loading";status.attempt++;
    let runtime;
    try{
      // The runtime has no external imports. A fresh URL retries only this one file.
      const url=new URL("./runtime.js",import.meta.url);
      url.searchParams.set("v",module.version);url.searchParams.set("attempt",String(status.attempt));
      runtime=await import(url.href);
    }catch(error){
      if(error?.name==="SyntaxError"||error?.name==="ReferenceError"){fatal(error);return;}
      status.state="retrying";status.lastError=api.loadError=String(error);
      const delay=Math.min(60000,3000*2**Math.min(status.attempt-1,5)+Math.floor(Math.random()*1000));
      console.warn(`World Codex | Попытка ${status.attempt}: не удалось загрузить файл. Повтор через ${Math.ceil(delay/1000)} сек.`,error);
      if(!warned){warned=true;ui.notifications.warn("Кодекс мира пока не загрузился. Повторяю загрузку автоматически; страницу обновлять не нужно.");}
      schedule(delay);return;
    }
    try{
      runtime.resumeCodex();
      status.state="ready";status.lastError=api.loadError=null;
      if(warned)ui.notifications.info("Кодекс мира загрузился.");
      if(pendingOpen){pendingOpen=false;await module.api.open();}
    }catch(error){fatal(error);}
  }
  function afterWorldReady(){schedule(2000+Math.floor(Math.random()*1000));}
  if(game.ready)afterWorldReady();else Hooks.once("ready",afterWorldReady);
}
Hooks.once("init",()=>startCodexLoader(true));
// A delayed entry file can miss init. The runtime handles late registration.
Hooks.once("ready",()=>startCodexLoader());
function worldAlreadyReady(){
  // Foundry may not have assigned the global game binding yet.
  try{return game?.ready===true;}catch(error){if(error?.name==="ReferenceError")return false;throw error;}
}
if(worldAlreadyReady())startCodexLoader();
