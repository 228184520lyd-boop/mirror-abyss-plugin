/** Mirror Abyss mobile-safe floating loader 2.0.0-lite.ui.99-notify-scope-fix. */
const LOADER_ID = 'mirror-abyss-loader-control';
const APP_ROOT_ID = 'mirror-abyss-core-control';
let loaded;
let activating;

function mount(title = '点击启动镜渊') {
  if (typeof document === 'undefined') return;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', () => mount(title), { once: true });
    return;
  }
  if (document.getElementById(APP_ROOT_ID) || document.getElementById(LOADER_ID)) return;
  const root = document.createElement('div');
  root.id = LOADER_ID;
  root.style.cssText = 'position:fixed!important;right:max(10px,env(safe-area-inset-right))!important;top:50dvh!important;transform:translateY(-50%)!important;z-index:10052!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;';
  const button = document.createElement('button');
  button.type = 'button';
  button.title = title;
  button.setAttribute('aria-label', '启动并打开镜渊');
  button.style.cssText = 'display:flex!important;align-items:center!important;justify-content:center!important;width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;padding:0!important;border:1px solid rgba(255,255,255,.24)!important;border-radius:50%!important;background:#141418!important;color:#fff!important;box-shadow:0 3px 12px rgba(0,0,0,.42)!important;cursor:pointer!important;pointer-events:auto!important;touch-action:none!important;user-select:none!important;-webkit-tap-highlight-color:transparent!important;';
  button.innerHTML = '<i class="fa-solid fa-circle-nodes" style="font-size:14px;pointer-events:none"></i>';
  button.addEventListener('pointerdown', event => event.stopPropagation());
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    void activate(true);
  });
  root.append(button);
  document.body.append(root);
}

function showError(error) {
  const button = document.getElementById(LOADER_ID)?.querySelector?.('button');
  const message = error instanceof Error ? error.message : String(error);
  if (button) {
    button.disabled = false;
    button.title = `镜渊启动失败，点击重试：${message}`;
    button.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="font-size:14px;pointer-events:none"></i>';
  }
  console.error('[MirrorAbyss] application bundle failed to load', error);
}

function load() {
  mount();
  return loaded ??= import('./app.js?ui=99-notify-scope-fix').catch(error => {
    loaded = undefined;
    showError(error);
    throw error;
  });
}

async function openRealPanel() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const launcher = document.querySelector(`#${APP_ROOT_ID} .ma-lite-launcher`);
    if (launcher) {
      launcher.click();
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

async function activate(fromClick = false) {
  if (activating) return activating;
  const button = document.getElementById(LOADER_ID)?.querySelector?.('button');
  if (button) {
    button.disabled = true;
    button.title = '镜渊正在启动';
  }
  activating = (async () => {
    try {
      const mod = await load();
      await mod.onActivate();
      document.getElementById(LOADER_ID)?.remove();
      if (fromClick) await openRealPanel();
    } catch (error) {
      showError(error);
      throw error;
    } finally {
      activating = undefined;
      const current = document.getElementById(LOADER_ID)?.querySelector?.('button');
      if (current) current.disabled = false;
    }
  })();
  return activating;
}

export async function onActivate() { return activate(false); }
export async function onEnable() { return activate(false); }
export async function onDisable() {
  document.getElementById(LOADER_ID)?.remove();
  if (loaded) return (await loaded).onDisable();
  document.getElementById(APP_ROOT_ID)?.remove();
}
export async function onDelete() {
  document.getElementById(LOADER_ID)?.remove();
  if (loaded) return (await loaded).onDelete();
  document.getElementById(APP_ROOT_ID)?.remove();
}
export async function onInstall() { return (await load()).onInstall(); }
export async function onUpdate() { return (await load()).onUpdate(); }
export async function onClean() { if (loaded) return (await loaded).onClean(); }
mount();
