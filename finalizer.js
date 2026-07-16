import { loadPatchedCore, hotfixMetadata } from './core-hotfix.js';

function showHotfixFatal(error) {
  globalThis.MirrorAbyssHotfixError = error;
  console.error('[MirrorAbyss] hotfix bootstrap failed', error);
  const render = () => {
    if (!document.body || document.querySelector('#ma11-hotfix-fatal')) return;
    const button = document.createElement('button');
    button.id = 'ma11-hotfix-fatal';
    button.className = 'ma11-fatal';
    button.type = 'button';
    button.textContent = '镜渊总结安全批次热修复启动失败｜查看控制台';
    button.title = error instanceof Error ? error.message : String(error);
    button.addEventListener('click', () => console.error('[MirrorAbyss] hotfix failure detail', error));
    document.body.appendChild(button);
  };
  if (document.body) render();
  else document.addEventListener('DOMContentLoaded', render, { once: true });
}

let core;
try {
  core = await loadPatchedCore();
} catch (error) {
  showHotfixFatal(error);
  throw error;
}

const PRODUCT_VERSION = '1.1.0-rc.4.2';
const PRODUCT_STAGE = 'product-closure';

const PRODUCT_CONTRACT = Object.freeze({
  version: 1,
  goal: 'continuous-world-memory',
  principles: Object.freeze([
    'world-continuity',
    'observable-facts-first',
    'persisted-state-authoritative',
    'foreground-never-waits-for-derived-memory',
    'chat-and-revision-isolation',
    'concepts-guide-architecture-not-hard-coded-narrative',
  ]),
  pipeline: Object.freeze([
    Object.freeze({ id: 'foreground', label: '前台', detail: '正文审核与必要修正', priority: 400 }),
    Object.freeze({ id: 'facts', label: '事实关键后台', detail: '事实提取与活跃状态', priority: 300 }),
    Object.freeze({ id: 'derived', label: '派生后台', detail: '事件小结与长期沉降', priority: 200 }),
    Object.freeze({ id: 'publish', label: '发布', detail: '世界书事务与回读验证', priority: 100 }),
  ]),
  historyPolicy: 'persisted-state-authoritative-and-future-only',
});

let observer = null;
let refreshTimer = null;
let refreshQueued = false;
let installed = false;

function cloneContract() {
  return JSON.parse(JSON.stringify(PRODUCT_CONTRACT));
}

function runtimeLabel(state) {
  if (!state) return '等待核心';
  if (state.state === 'ready') return '已就绪';
  if (state.state === 'initializing') return '启动中';
  if (state.state === 'error') return '启动异常';
  return state.active === false ? '已停用' : '待机';
}

function attachProductApi() {
  const api = globalThis.MirrorAbyss;
  if (!api || typeof api !== 'object') return null;

  if (!api.coreVersion) api.coreVersion = String(api.version || '1.1.0-rc.3');
  api.version = PRODUCT_VERSION;
  api.productStage = PRODUCT_STAGE;
  api.hotfix = globalThis.MirrorAbyssHotfix || hotfixMetadata;
  api.contract = PRODUCT_CONTRACT;
  api.getContract = cloneContract;

  if (api.recovery && typeof api.recovery === 'object') {
    // Historical dependency rebuild is intentionally unreachable in the product contract.
    delete api.recovery.retryHistoryRebuild;
    delete api.recovery.abandonHistoryRebuild;
    api.recovery.historyPolicy = PRODUCT_CONTRACT.historyPolicy;
  }

  return api;
}

function createStatusRail(shell) {
  const rail = document.createElement('section');
  rail.className = 'ma11-product-status';
  rail.dataset.maRole = 'product-status';
  rail.setAttribute('aria-label', '镜渊运行结构');
  rail.innerHTML = `
    <div class="ma11-product-runtime">
      <span class="ma11-product-kicker">镜渊 ${PRODUCT_VERSION} · 5K 安全批次</span>
      <strong data-ma-runtime aria-live="polite">等待核心</strong>
      <span data-ma-scope>聊天作用域待确认</span>
    </div>
    <div class="ma11-product-layers" aria-label="处理层级">
      ${PRODUCT_CONTRACT.pipeline.map((stage) => `
        <span class="ma11-product-chip" title="${stage.detail}">
          <b>${stage.label}</b><small>${stage.detail}</small>
        </span>
      `).join('')}
    </div>
  `;

  const tabs = shell.querySelector(':scope > .ma11-tabs');
  shell.insertBefore(rail, tabs || shell.children[1] || null);
  return rail;
}

function removeLegacyControls(workspace) {
  workspace.querySelectorAll(
    '[data-action*="history-rebuild"], [data-ma-action*="history-rebuild"], [data-action="retry-history-rebuild"], [data-action="abandon-history-rebuild"]',
  ).forEach((node) => node.remove());
}

function refreshProductLayer() {
  refreshQueued = false;
  const api = attachProductApi();
  const workspace = document.querySelector('#ma11-workspace');
  if (!workspace) return;

  removeLegacyControls(workspace);
  const shell = workspace.querySelector('.ma11-shell');
  if (!shell) return;

  const rail = shell.querySelector(':scope > [data-ma-role="product-status"]') || createStatusRail(shell);
  const state = typeof api?.getState === 'function' ? api.getState() : null;
  const runtime = rail.querySelector('[data-ma-runtime]');
  const scope = rail.querySelector('[data-ma-scope]');

  if (runtime) {
    runtime.textContent = runtimeLabel(state);
    runtime.dataset.state = String(state?.state || 'waiting');
  }
  if (scope) {
    const persistent = state?.scope?.persistent;
    scope.textContent = persistent === true
      ? '聊天隔离已建立 · 持久状态为权威'
      : persistent === false
        ? '临时聊天作用域 · 仅处理后续消息'
        : '持久状态为权威 · 仅处理后续消息';
  }
}

function scheduleRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(refreshProductLayer);
}

function installProductLayer() {
  if (installed) {
    scheduleRefresh();
    return;
  }
  installed = true;
  document.documentElement.dataset.ma11Product = PRODUCT_STAGE;
  document.documentElement.dataset.ma11Version = PRODUCT_VERSION;

  const start = () => {
    if (!document.body) return;
    observer ||= new MutationObserver(scheduleRefresh);
    observer.observe(document.body, { childList: true, subtree: true });
    refreshTimer ||= window.setInterval(scheduleRefresh, 1500);
    scheduleRefresh();
  };

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}

function uninstallProductLayer() {
  installed = false;
  observer?.disconnect();
  observer = null;
  if (refreshTimer !== null) window.clearInterval(refreshTimer);
  refreshTimer = null;
  refreshQueued = false;
  document.querySelectorAll('[data-ma-role="product-status"]').forEach((node) => node.remove());
  delete document.documentElement.dataset.ma11Product;
  delete document.documentElement.dataset.ma11Version;
}

installProductLayer();

export async function onInstall() {
  await core.onInstall?.();
  installProductLayer();
}

export async function onUpdate() {
  await core.onUpdate?.();
  installProductLayer();
}

export function onEnable() {
  const result = core.onEnable?.();
  installProductLayer();
  return result;
}

export function onActivate() {
  const result = core.onActivate?.();
  installProductLayer();
  return result;
}

export function onDisable() {
  uninstallProductLayer();
  return core.onDisable?.();
}

export async function onClean() {
  uninstallProductLayer();
  return core.onClean?.();
}

export async function onDelete() {
  uninstallProductLayer();
  return core.onDelete?.();
}
