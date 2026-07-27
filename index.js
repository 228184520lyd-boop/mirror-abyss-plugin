/** Mirror Abyss mobile-safe loader 2.0.0-core.realtest.7. */
const ROOT_ID='mirror-abyss-core-control';
let loaded;
function mount(text='镜渊…',title='镜渊正在加载'){
  if(typeof document==='undefined')return;
  if(!document.body){document.addEventListener('DOMContentLoaded',()=>mount(text,title),{once:true});return;}
  if(document.getElementById(ROOT_ID))return;
  const root=document.createElement('div');root.id=ROOT_ID;
  root.style.cssText='position:fixed!important;right:10px!important;bottom:84px!important;z-index:2147483640!important;visibility:visible!important;opacity:1!important;';
  const button=document.createElement('button');button.type='button';button.textContent=text;button.title=title;
  button.style.cssText='display:block!important;min-width:56px;min-height:44px;padding:0 12px;border:1px solid rgba(255,255,255,.24);border-radius:10px;background:#141418;color:#fff;font-weight:700;font-size:14px;';
  root.append(button);document.body.append(root);
}
function showError(error){
  const root=document.getElementById(ROOT_ID);const button=root&&root.querySelector?root.querySelector('button'):root?.children?.[0];
  const message=error instanceof Error?error.message:String(error);
  if(button){button.textContent='镜渊错误';button.title=message;button.onclick=()=>globalThis.alert?.('镜渊主体加载失败：'+message);}
  console.error('[MirrorAbyss] application bundle failed to load',error);
}
function load(){mount();return loaded??=(import('./app.js').catch(error=>{showError(error);throw error;}));}
export async function onActivate(){return (await load()).onActivate();}
export async function onEnable(){return (await load()).onEnable();}
export async function onDisable(){if(loaded)return (await loaded).onDisable();document.getElementById(ROOT_ID)?.remove();}
export async function onDelete(){if(loaded)return (await loaded).onDelete();document.getElementById(ROOT_ID)?.remove();}
export async function onInstall(){return (await load()).onInstall();}
export async function onUpdate(){return (await load()).onUpdate();}
export async function onClean(){if(loaded)return (await loaded).onClean();}
mount();
