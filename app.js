import { MODULE_NAME, VERSION } from '../constants.js';
import { getContext, getSettings, saveSettings, toast, tryGetContext } from '../core/context.js';
import { clearAllStorage } from '../storage/repository.js';
import { attemptAutomaticHistoryRecovery, installPipelineEventHandlers, processMessage } from '../pipeline/pipeline.js';
import { resetLorebookRuntime } from '../pipeline/lorebook.js';
import { installMessagePanelHandlers, renderAllMessagePanels } from '../ui/message-panel.js';
import { diagnosticReport } from '../ui/diagnostics.js';
import { mountOptionalTopButton, mountSettingsPanel } from '../ui/settings-panel.js';
import { disposeWorkspace, openWorkspace, refreshWorkspace, resetWorkspaceContext } from '../ui/workspace.js';
import { abortActiveRequests, setRequestAcceptance } from '../core/requests.js';
import { taskQueue } from '../pipeline/task-queue.js';
let state = 'idle';
let cleanupPipeline = null;
let cleanupPanels = null;
let cleanupUiEvents = null;
let appReadyHandlerInstalled = false;
let appReadyContext = null;
let appReadyHandler = null;
let extensionEnabled = true;
let lifecycleGeneration = 0;
let debugRegistered = false;
let startupAttempts = 0;
let lastError = null;
const MAX_STARTUP_ATTEMPTS = 20;
function exposeApi() {
    globalThis.MirrorAbyss = {
        version: VERSION,
        open: (tab = 'overview') => {
            if (!extensionEnabled)
                throw new Error('镜渊插件当前已禁用');
            return openWorkspace(tab);
        },
        processLatest: async () => {
            if (!extensionEnabled)
                throw new Error('镜渊插件当前已禁用');
            if (!getSettings().enabled)
                throw new Error('镜渊已关闭，请先启用');
            const context = getContext();
            const index = [...(context.chat ?? [])].map((_, i) => i).reverse().find((i) => !context.chat[i]?.is_user && String(context.chat[i]?.mes || '').trim());
            if (index === undefined)
                throw new Error('没有可整理的AI正文');
            return processMessage(index, true);
        },
        diagnostics: diagnosticReport,
        restart: restartPlugin,
        getState: () => ({ state, lastError: lastError instanceof Error ? lastError.message : String(lastError || '') }),
    };
}
export async function restartPlugin() {
    shutdown();
    taskQueue.resetRuntime();
    resetLorebookRuntime();
    extensionEnabled = true;
    startupAttempts = 0;
    installAppReadyHandler();
}
function showFatal(error) {
    document.querySelector('#ma11-fatal')?.remove();
    const button = document.createElement('button');
    button.id = 'ma11-fatal';
    button.className = 'ma11-fatal';
    button.type = 'button';
    button.textContent = '镜渊启动失败｜查看诊断';
    button.title = error instanceof Error ? error.message : String(error);
    button.addEventListener('click', () => openWorkspace('diagnostics'));
    document.body.appendChild(button);
}
export async function initialize() {
    if (!extensionEnabled)
        return;
    if (state === 'ready' || state === 'initializing')
        return;
    const generation = lifecycleGeneration;
    state = 'initializing';
    lastError = null;
    exposeApi();
    try {
        const settings = getSettings();
        setRequestAcceptance(settings.enabled);
        taskQueue.setAccepting(settings.enabled);
        await mountSettingsPanel(() => extensionEnabled && generation === lifecycleGeneration);
        if (!extensionEnabled || generation !== lifecycleGeneration)
            return;
        mountOptionalTopButton();
        cleanupPipeline ||= installPipelineEventHandlers();
        cleanupPanels ||= installMessagePanelHandlers();
        renderAllMessagePanels();
        const context = getContext();
        if (!cleanupUiEvents) {
            const rerender = () => {
                renderAllMessagePanels();
                refreshWorkspace();
            };
            const resetAndRerender = () => {
                resetWorkspaceContext();
                rerender();
            };
            context.eventSource.on(context.event_types.CHARACTER_MESSAGE_RENDERED, rerender);
            context.eventSource.on(context.event_types.CHAT_CHANGED, resetAndRerender);
            context.eventSource.on(context.event_types.MESSAGE_DELETED, resetAndRerender);
            cleanupUiEvents = () => {
                context.eventSource.removeListener?.(context.event_types.CHARACTER_MESSAGE_RENDERED, rerender);
                context.eventSource.removeListener?.(context.event_types.CHAT_CHANGED, resetAndRerender);
                context.eventSource.removeListener?.(context.event_types.MESSAGE_DELETED, resetAndRerender);
            };
        }
        if (!debugRegistered && typeof context.registerDebugFunction === 'function') {
            context.registerDebugFunction('mirror_abyss_diagnostics', 'Mirror Abyss Diagnostics', 'Open the Mirror Abyss diagnostics panel', () => {
                if (!extensionEnabled)
                    throw new Error('镜渊插件当前已禁用');
                openWorkspace('diagnostics');
            });
            debugRegistered = true;
        }
        document.querySelector('#ma11-fatal')?.remove();
        state = 'ready';
        toast('success', `已启动 ${VERSION}`);
        window.setTimeout(() => {
            void attemptAutomaticHistoryRecovery();
        }, 300);
    }
    catch (error) {
        if (!extensionEnabled || generation !== lifecycleGeneration)
            return;
        state = 'error';
        lastError = error;
        console.error('[MirrorAbyss] initialization failed', error);
        showFatal(error);
    }
}
export function installAppReadyHandler() {
    if (!extensionEnabled)
        return;
    if (appReadyHandlerInstalled)
        return;
    const context = tryGetContext();
    if (!context) {
        startupAttempts += 1;
        if (startupAttempts < MAX_STARTUP_ATTEMPTS) {
            window.setTimeout(installAppReadyHandler, 250);
        }
        else {
            const error = new Error('等待SillyTavern上下文超时，请刷新页面后重试');
            state = 'error';
            lastError = error;
            showFatal(error);
        }
        return;
    }
    startupAttempts = 0;
    appReadyHandlerInstalled = true;
    appReadyContext = context;
    appReadyHandler = () => {
        if (!extensionEnabled)
            return;
        void initialize();
    };
    context.eventSource.on(context.event_types.APP_READY, appReadyHandler);
    // Third-party extensions may be loaded after APP_READY, so initialization is
    // also attempted immediately. initialize() is idempotent.
    void initialize();
}
export async function cleanData() {
    await clearAllStorage();
    const context = tryGetContext();
    if (context?.extensionSettings?.[MODULE_NAME])
        delete context.extensionSettings[MODULE_NAME];
    context?.saveSettingsDebounced?.();
}
export function onEnable() {
    extensionEnabled = true;
    startupAttempts = 0;
    installAppReadyHandler();
}
function shutdown() {
    lifecycleGeneration += 1;
    extensionEnabled = false;
    taskQueue.setAccepting(false);
    setRequestAcceptance(false);
    abortActiveRequests();
    resetLorebookRuntime();
    cleanupPipeline?.();
    cleanupPanels?.();
    cleanupUiEvents?.();
    cleanupPipeline = null;
    cleanupPanels = null;
    cleanupUiEvents = null;
    if (appReadyContext && appReadyHandler) {
        appReadyContext.eventSource.removeListener?.(appReadyContext.event_types.APP_READY, appReadyHandler);
    }
    appReadyContext = null;
    appReadyHandler = null;
    appReadyHandlerInstalled = false;
    document.querySelector('#ma11-top-button')?.remove();
    disposeWorkspace();
    document.querySelector('#ma11-settings-root')?.remove();
    document.querySelector('#ma11-fatal')?.remove();
    document.querySelectorAll('.ma11-message-panel').forEach((element) => element.remove());
    document.querySelectorAll('.ma11-audit-hidden-message, .ma11-audit-marked-message').forEach((element) => {
        element.classList.remove('ma11-audit-hidden-message');
        element.classList.remove('ma11-audit-marked-message');
    });
    state = 'idle';
}
export function onDisable() {
    shutdown();
}
export function onActivate() {
    extensionEnabled = true;
    exposeApi();
    installAppReadyHandler();
}
export async function onInstall() {
    exposeApi();
}
export async function onUpdate() {
    const settings = tryGetContext() ? getSettings() : null;
    if (settings) {
        settings.migration.legacyChecked = false;
        saveSettings();
    }
}
export async function onClean() {
    await cleanData();
}
export async function onDelete() {
    shutdown();
}
