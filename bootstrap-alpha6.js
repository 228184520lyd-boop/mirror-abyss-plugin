/**
 * Mirror Abyss zero-side-effect lifecycle bootstrap.
 * FACT-HOST-006 / FACT-BUILD-007 / EVT-20260726-015.
 *
 * This module deliberately performs no top-level DOM access, network access,
 * dynamic import, module URL read, Date construction or global mutation.
 * SillyTavern must be able to fetch, parse and evaluate this file before any
 * Mirror Abyss work begins.
 */
var runtimePromise = null;
var ERROR_ID = 'mirror-abyss-v2-loader-error';
var STYLE_ID = 'mirror-abyss-v2-inline-style';
var VERSION = '2.0.0-alpha.6-realtest.1';
var STYLE_TEXT = ".mirror-abyss-v2-root { margin: .75rem 0; }\n.mirror-abyss-v2-panel { border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,.16)); border-radius: .5rem; padding: .75rem; background: var(--SmartThemeBlurTintColor, rgba(0,0,0,.12)); }\n.mirror-abyss-v2-panel h3 { margin: 0 0 .65rem; font-size: 1rem; }\n.mirror-abyss-v2-grid { display:grid; grid-template-columns:minmax(7rem,auto) minmax(0,1fr); gap:.4rem .75rem; align-items:start; }\n.mirror-abyss-v2-label { opacity:.72; }\n.mirror-abyss-v2-value { min-width:0; overflow-wrap:anywhere; }\n.mirror-abyss-v2-actions { display:flex; flex-wrap:wrap; gap:.65rem 1rem; align-items:center; margin:.9rem 0; }\n.mirror-abyss-v2-actions label { display:flex; align-items:center; gap:.35rem; }\n.mirror-abyss-v2-field { display:grid; gap:.35rem; margin:.65rem 0; }\n.mirror-abyss-v2-field textarea { width:100%; box-sizing:border-box; resize:vertical; }\n.mirror-abyss-v2-table-counts { display:flex; flex-wrap:wrap; gap:.35rem .75rem; margin-top:.75rem; font-size:.88rem; opacity:.82; }\n.mirror-abyss-v2-error { margin-top:.65rem; white-space:pre-wrap; color:var(--warning,#e6a23c); }\n.mirror-abyss-v2-note { margin:.75rem 0 0; opacity:.72; font-size:.85rem; }\n.mirror-abyss-v2-diagnostic-status { margin:-.35rem 0 .65rem; font-size:.85rem; opacity:.82; }\n.mirror-abyss-v2-loader-error details { margin-top:.45rem; }\n.mirror-abyss-v2-loader-error pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:14rem; overflow:auto; }\n";

export function onActivate() {
  return startRuntime('onActivate');
}

export function onEnable() {
  return startRuntime('onEnable');
}

export function onDisable() {
  return stopRuntime('onDisable', false);
}

export function onDelete() {
  return stopRuntime('onDelete', true);
}

export function getRuntimeProvider() {
  if (typeof globalThis === 'undefined') return null;
  return globalThis.__MIRROR_ABYSS_RUNTIME_PROVIDER__ || null;
}

export function getDependencyProviders() {
  if (typeof globalThis === 'undefined') return {};
  var value = globalThis.__MIRROR_ABYSS_DEPENDENCY_PROVIDERS__;
  if (!value || typeof value !== 'object') return {};
  return Object.assign({}, value);
}

function startRuntime(hookName) {
  markBootstrap(hookName + ':entered');
  installStyle();
  clearLoadError();
  return getRuntime().then(function (runtimeModule) {
    var hook = runtimeModule && runtimeModule[hookName];
    if (typeof hook !== 'function') throw new Error('runtime 缺少生命周期导出：' + hookName);
    return hook();
  }).then(function (result) {
    markBootstrap(hookName + ':completed');
    return result;
  }).catch(function (error) {
    markBootstrap(hookName + ':failed');
    showLoadError(error);
    throw normalizeError(error, 'Mirror Abyss ' + hookName + ' 失败');
  });
}

function stopRuntime(hookName, removeStyle) {
  var pending = runtimePromise;
  var task = pending ? pending.catch(function () { return null; }) : Promise.resolve(null);
  return task.then(function (runtimeModule) {
    var hook = runtimeModule && runtimeModule[hookName];
    if (typeof hook === 'function') return hook();
    return undefined;
  }).catch(function (error) {
    console.error('[MirrorAbyss] ' + hookName + ' failed', error);
  }).then(function () {
    clearLoadError();
    if (removeStyle && typeof document !== 'undefined') {
      var style = document.getElementById(STYLE_ID);
      if (style && style.parentNode) style.parentNode.removeChild(style);
    }
  });
}

function getRuntime() {
  if (!runtimePromise) runtimePromise = loadRuntime();
  return runtimePromise;
}

function loadRuntime() {
  try {
    assertHostReady();
  } catch (error) {
    return Promise.reject(error);
  }
  return import('./dist/runtime/index.js').then(function (runtimeModule) {
    if (typeof globalThis !== 'undefined') {
      globalThis.__MIRROR_ABYSS_RUNTIME_PROVIDER__ = 'per-dependency-fallback';
    }
    markBootstrap('runtime-loaded');
    console.info('[MirrorAbyss] local runtime loaded');
    return runtimeModule;
  }).catch(function (error) {
    runtimePromise = null;
    throw normalizeError(error, '本地 runtime 或成熟依赖加载失败');
  });
}

function assertHostReady() {
  var root = typeof globalThis !== 'undefined' ? globalThis : window;
  var sillyTavern = root && root.SillyTavern;
  var getContext = sillyTavern && sillyTavern.getContext;
  if (typeof getContext !== 'function') throw new Error('SillyTavern.getContext 尚未就绪');
  var context = getContext();
  var eventTypes = context && (context.eventTypes || context.event_types);
  if (!context || !context.eventSource || !eventTypes) throw new Error('SillyTavern 扩展事件接口不可用');
}

function installStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  var parent = document.head || document.documentElement;
  if (!parent) return;
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.type = 'text/css';
  style.appendChild(document.createTextNode(STYLE_TEXT));
  parent.appendChild(style);
}

function markBootstrap(phase) {
  if (typeof globalThis === 'undefined') return;
  globalThis.__MIRROR_ABYSS_BOOTSTRAP__ = {
    version: VERSION,
    phase: phase,
    recordedAt: new Date().toISOString()
  };
}

function showLoadError(error) {
  console.error('[MirrorAbyss] runtime load failed', error);
  if (typeof document === 'undefined') return;
  clearLoadError();
  var parent = document.getElementById('extensions_settings') || document.body || document.documentElement;
  if (!parent) return;
  var box = document.createElement('div');
  box.id = ERROR_ID;
  box.className = 'mirror-abyss-v2-error mirror-abyss-v2-loader-error';
  var title = document.createElement('strong');
  title.textContent = 'Mirror Abyss 加载失败';
  var message = document.createElement('div');
  message.textContent = describeError(error);
  var pre = document.createElement('pre');
  var bootstrap = typeof globalThis !== 'undefined' ? globalThis.__MIRROR_ABYSS_BOOTSTRAP__ : null;
  var providers = typeof globalThis !== 'undefined' ? globalThis.__MIRROR_ABYSS_DEPENDENCY_PROVIDERS__ : null;
  pre.textContent = JSON.stringify({
    version: VERSION,
    bootstrap: bootstrap || null,
    dependencyProviders: providers || {},
    error: describeError(error)
  }, null, 2);
  box.appendChild(title);
  box.appendChild(message);
  box.appendChild(pre);
  parent.appendChild(box);
}

function describeError(error) {
  if (error && error.name === 'AggregateError' && error.errors) {
    var nested = Array.prototype.map.call(error.errors, describeError).filter(Boolean);
    return [error.message || 'AggregateError'].concat(nested).join(' | ');
  }
  if (error instanceof Error) return error.name + ': ' + error.message;
  if (typeof Event !== 'undefined' && error instanceof Event) {
    var target = error.target || error.currentTarget;
    var url = target && (target.src || target.href) || '';
    return 'DOM Event(type=' + error.type + (url ? ', url=' + url : '') + ')';
  }
  try {
    var json = JSON.stringify(error);
    return json === undefined ? String(error) : json;
  } catch (ignored) {
    return String(error);
  }
}

function normalizeError(error, prefix) {
  if (error instanceof Error) return error;
  return new Error(prefix + ': ' + describeError(error));
}

function clearLoadError() {
  if (typeof document === 'undefined') return;
  var node = document.getElementById(ERROR_ID);
  if (node && node.parentNode) node.parentNode.removeChild(node);
}
