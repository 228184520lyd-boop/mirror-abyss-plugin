const __defs=Object.create(null);
const __cache=Object.create(null);
function __require(id){
  if(__cache[id]) return __cache[id];
  const exports={};
  __cache[id]=exports;
  const factory=__defs[id];
  if(!factory) throw new Error('Mirror Abyss bundled module missing: '+id);
  factory(exports,__require);
  return exports;
}
__defs["bootstrap/app.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"MODULE_NAME",{enumerable:true,configurable:true,get:()=>__require("constants.js")["MODULE_NAME"]});
Object.defineProperty(__scope,"VERSION",{enumerable:true,configurable:true,get:()=>__require("constants.js")["VERSION"]});
Object.defineProperty(__scope,"getContext",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getContext"]});
Object.defineProperty(__scope,"getSettings",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getSettings"]});
Object.defineProperty(__scope,"isProcessableAssistantMessage",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["isProcessableAssistantMessage"]});
Object.defineProperty(__scope,"saveSettings",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["saveSettings"]});
Object.defineProperty(__scope,"toast",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["toast"]});
Object.defineProperty(__scope,"tryGetContext",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["tryGetContext"]});
Object.defineProperty(__scope,"clearAllStorage",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["clearAllStorage"]});
Object.defineProperty(__scope,"installPipelineEventHandlers",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["installPipelineEventHandlers"]});
Object.defineProperty(__scope,"processMessage",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["processMessage"]});
Object.defineProperty(__scope,"reconcileInterruptedRuntimeState",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["reconcileInterruptedRuntimeState"]});
Object.defineProperty(__scope,"resumeRuntimeOutbox",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["resumeRuntimeOutbox"]});
Object.defineProperty(__scope,"resetLorebookRuntime",{enumerable:true,configurable:true,get:()=>__require("pipeline/lorebook.js")["resetLorebookRuntime"]});
Object.defineProperty(__scope,"installMessagePanelHandlers",{enumerable:true,configurable:true,get:()=>__require("ui/message-panel.js")["installMessagePanelHandlers"]});
Object.defineProperty(__scope,"renderAllMessagePanels",{enumerable:true,configurable:true,get:()=>__require("ui/message-panel.js")["renderAllMessagePanels"]});
Object.defineProperty(__scope,"diagnosticReport",{enumerable:true,configurable:true,get:()=>__require("ui/diagnostics.js")["diagnosticReport"]});
Object.defineProperty(__scope,"mountOptionalTopButton",{enumerable:true,configurable:true,get:()=>__require("ui/settings-panel.js")["mountOptionalTopButton"]});
Object.defineProperty(__scope,"mountSettingsPanel",{enumerable:true,configurable:true,get:()=>__require("ui/settings-panel.js")["mountSettingsPanel"]});
Object.defineProperty(__scope,"disposeWorkspace",{enumerable:true,configurable:true,get:()=>__require("ui/workspace.js")["disposeWorkspace"]});
Object.defineProperty(__scope,"openWorkspace",{enumerable:true,configurable:true,get:()=>__require("ui/workspace.js")["openWorkspace"]});
Object.defineProperty(__scope,"refreshWorkspace",{enumerable:true,configurable:true,get:()=>__require("ui/workspace.js")["refreshWorkspace"]});
Object.defineProperty(__scope,"resetWorkspaceContext",{enumerable:true,configurable:true,get:()=>__require("ui/workspace.js")["resetWorkspaceContext"]});
Object.defineProperty(__scope,"abortActiveRequests",{enumerable:true,configurable:true,get:()=>__require("core/requests.js")["abortActiveRequests"]});
Object.defineProperty(__scope,"setRequestAcceptance",{enumerable:true,configurable:true,get:()=>__require("core/requests.js")["setRequestAcceptance"]});
Object.defineProperty(__scope,"taskQueue",{enumerable:true,configurable:true,get:()=>__require("pipeline/task-queue.js")["taskQueue"]});
with(__scope){
Object.defineProperty(exports,"restartPlugin",{enumerable:true,configurable:true,get:()=>restartPlugin});
Object.defineProperty(exports,"initialize",{enumerable:true,configurable:true,get:()=>initialize});
Object.defineProperty(exports,"cleanData",{enumerable:true,configurable:true,get:()=>cleanData});
Object.defineProperty(exports,"onInstall",{enumerable:true,configurable:true,get:()=>onInstall});
Object.defineProperty(exports,"onUpdate",{enumerable:true,configurable:true,get:()=>onUpdate});
Object.defineProperty(exports,"onClean",{enumerable:true,configurable:true,get:()=>onClean});
Object.defineProperty(exports,"onDelete",{enumerable:true,configurable:true,get:()=>onDelete});
Object.defineProperty(exports,"installAppReadyHandler",{enumerable:true,configurable:true,get:()=>installAppReadyHandler});
Object.defineProperty(exports,"onEnable",{enumerable:true,configurable:true,get:()=>onEnable});
Object.defineProperty(exports,"onDisable",{enumerable:true,configurable:true,get:()=>onDisable});
Object.defineProperty(exports,"onActivate",{enumerable:true,configurable:true,get:()=>onActivate});
/**
 * 模块职责：插件启动、禁用、重启、事件装卸与调试 API 的生命周期总控。
 * 维护边界：生命周期代次用于阻止旧初始化继续落地；禁用时必须停止接收任务并取消活动请求。
 */
let state = 'idle';
let cleanupPipeline = null;
let cleanupPanels = null;
let cleanupUiEvents = null;
let appReadyHandlerInstalled = false;
let appReadyContext = null;
let appReadyHandler = null;
let startupTimer;
let extensionEnabled = true;
// 每次 shutdown 都递增代次，使旧 initialize continuation 即使恢复也不能继续挂载 UI 或监听器。
let lifecycleGeneration = 0;
let debugRegistered = false;
let startupAttempts = 0;
let lastError = null;
const MAX_STARTUP_ATTEMPTS = 20;
function removeSourceListener(source, event, handler) {
    if (typeof source?.off === 'function')
        source.off(event, handler);
    else
        source?.removeListener?.(event, handler);
}
function clearStartupTimer() {
    if (startupTimer === undefined)
        return;
    window.clearTimeout(startupTimer);
    startupTimer = undefined;
}
/** 暴露稳定调试入口；这些名称可能被用户脚本和诊断流程依赖。 */
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
            const index = [...(context.chat ?? [])].map((_, i) => i).reverse().find((i) => isProcessableAssistantMessage(context.chat[i]));
            if (index === undefined)
                throw new Error('没有可整理的AI正文');
            return processMessage(index, false);
        },
        diagnostics: diagnosticReport,
        restart: restartPlugin,
        getState: () => ({ state, lastError: lastError instanceof Error ? lastError.message : String(lastError || '') }),
    };
}
async function restartPlugin() {
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
async function initialize() {
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
        await reconcileInterruptedRuntimeState();
        if (!extensionEnabled || generation !== lifecycleGeneration)
            return;
        await resumeRuntimeOutbox();
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
                removeSourceListener(context.eventSource, context.event_types.CHARACTER_MESSAGE_RENDERED, rerender);
                removeSourceListener(context.eventSource, context.event_types.CHAT_CHANGED, resetAndRerender);
                removeSourceListener(context.eventSource, context.event_types.MESSAGE_DELETED, resetAndRerender);
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
function installAppReadyHandler() {
    if (!extensionEnabled)
        return;
    if (appReadyHandlerInstalled)
        return;
    const context = tryGetContext();
    if (!context) {
        startupAttempts += 1;
        if (startupAttempts < MAX_STARTUP_ATTEMPTS) {
            if (startupTimer === undefined) {
                const generation = lifecycleGeneration;
                startupTimer = window.setTimeout(() => {
                    startupTimer = undefined;
                    if (!extensionEnabled || generation !== lifecycleGeneration)
                        return;
                    installAppReadyHandler();
                }, 250);
            }
        }
        else {
            clearStartupTimer();
            const error = new Error('等待SillyTavern上下文超时，请刷新页面后重试');
            state = 'error';
            lastError = error;
            showFatal(error);
        }
        return;
    }
    clearStartupTimer();
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
async function cleanData() {
    await clearAllStorage();
    const context = tryGetContext();
    if (context?.extensionSettings?.[MODULE_NAME])
        delete context.extensionSettings[MODULE_NAME];
    context?.saveSettingsDebounced?.();
}
function onEnable() {
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
    clearStartupTimer();
    startupAttempts = 0;
    if (appReadyContext && appReadyHandler) {
        removeSourceListener(appReadyContext.eventSource, appReadyContext.event_types.APP_READY, appReadyHandler);
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
function onDisable() {
    shutdown();
}
function onActivate() {
    extensionEnabled = true;
    exposeApi();
    installAppReadyHandler();
}
async function onInstall() {
    exposeApi();
}
async function onUpdate() {
    const settings = tryGetContext() ? getSettings() : null;
    if (settings) {
        settings.migration.legacyChecked = false;
        saveSettings();
    }
}
async function onClean() {
    await cleanData();
}
async function onDelete() {
    shutdown();
}

}
};
__defs["constants.js"]=function(exports,__require){
const __scope=Object.create(null);
with(__scope){
Object.defineProperty(exports,"MODULE_NAME",{enumerable:true,configurable:true,get:()=>MODULE_NAME});
Object.defineProperty(exports,"LEGACY_MODULE_NAME",{enumerable:true,configurable:true,get:()=>LEGACY_MODULE_NAME});
Object.defineProperty(exports,"DISPLAY_NAME",{enumerable:true,configurable:true,get:()=>DISPLAY_NAME});
Object.defineProperty(exports,"VERSION",{enumerable:true,configurable:true,get:()=>VERSION});
Object.defineProperty(exports,"PIPELINE_VERSION",{enumerable:true,configurable:true,get:()=>PIPELINE_VERSION});
Object.defineProperty(exports,"DEFAULT_CONTENT_LIMITS",{enumerable:true,configurable:true,get:()=>DEFAULT_CONTENT_LIMITS});
Object.defineProperty(exports,"DEFAULT_STATE_PROMPTS",{enumerable:true,configurable:true,get:()=>DEFAULT_STATE_PROMPTS});
Object.defineProperty(exports,"DEFAULT_SUMMARY_PROMPTS",{enumerable:true,configurable:true,get:()=>DEFAULT_SUMMARY_PROMPTS});
Object.defineProperty(exports,"DEFAULT_SETTINGS",{enumerable:true,configurable:true,get:()=>DEFAULT_SETTINGS});
/**
 * 模块职责：集中定义版本、任务类型、动态表格设置与默认值。
 * 维护边界：表格数量和名称不得在业务模块中写死，默认表仅用于首次初始化和恢复默认。
 */
const MODULE_NAME = 'mirrorAbyssV11';
const LEGACY_MODULE_NAME = 'mirrorAbyss';
const DISPLAY_NAME = '镜渊';
const VERSION = '1.4.0-alpha.7';
const PIPELINE_VERSION = 'ma-runtime-v2-1';
const DEFAULT_CONTENT_LIMITS = {
    tables: {
        spacetime: 700,
        scenes: 700,
        characters: 1800,
        items: 800,
        events: 2200,
        regions: 1200,
        globalChanges: 1500,
        foundations: 1500,
        customObjects: 1200,
    },
    smallSummary: 420,
    largeSummary: 900,
};
const DEFAULT_STATE_PROMPTS = {
    admissionRules: [
        '只在当前启用表头及其记录要求明确允许时建档；表头名称、用途说明和字段记录要求共同决定提取方向。',
        '新对象必须能够被稳定命名，并与已有对象区分；无法确认对象边界时暂不建档。',
        '只记录本轮正文明确建立、且会改变当前记录或后续连续性的事实。',
    ].join('\n'),
    exclusionRules: [
        '没有命中任何启用表头记录要求的内容不建档，也不强行塞入最相近的表。',
        '仅有措辞变化、重复描述、普通反应、无结果动作或一次性背景信息时不更新。',
        '不能从常识、类型名称、文风暗示或可能性补全正文未明确给出的事实。',
    ].join('\n'),
    routingRules: [
        '按当前启用表头的名称、用途说明和字段记录要求分流，不按内部通道名称猜测语义。',
        '同一事实只进入最直接承载它的表头；确实属于多个对象时分别写各对象自身结果，不重复整段内容。',
        '已有对象沿用原表和稳定身份；只有表头记录要求明确改变时，未来新事实才按新方向提取。',
    ].join('\n'),
    evidenceRules: [
        '只使用本轮正文明确出现的事实和插件提供的旧记录。',
        '传闻、转述、主观判断和不确定信息必须保留其证据等级，不得自动升级为确认事实。',
        '新旧内容冲突时，只有正文明确推翻、结束或替换旧事实才更新；证据不足时保留旧记录。',
    ].join('\n'),
    updateRules: [
        '只输出本轮新增、结束、被替换或发生实质变化的内容；再次出现和近义改写不算更新。',
        '当前层只保留当前唯一有效版本；新事实替换旧状态时不得把完整过程持续追加。',
        '表头联动只要求重新检查目标表；没有真实变化时目标表不要输出。',
        '每条事实只表达一个主体、一个变化和一个当前结果，相同信息只保留一次。',
    ].join('\n'),
};
const DEFAULT_SUMMARY_PROMPTS = {
    small: {
        coreQuestion: '材料中哪些明确事实构成这条事件线当前唯一有效的结果与直接连续性？',
        includeRules: [
            '正文已经明确建立、且仍直接构成当前结果的起因与承诺。',
            '正文明确形成的转折、决定及其结果。',
            '当前阶段已经形成、且未被后续事实替代的结果。',
            '材料中明确仍在持续的状态、限制与资源变化。',
            '正文已经明确建立、且当前仍成立的目标、责任、约束与结果。',
        ].join('\n'),
        excludeRules: [
            '台词复述、连续动作、场面调度、服装外貌、气氛和普通反应。',
            '没有介入或改变事件因果的旁观者、观众、路人。',
            '已经被后续结果覆盖的中间步骤。',
            '没有形成状态、关系、资源或事件结果的临时细节。',
            '已经失效、已经解决或只是重复改写的信息。',
        ].join('\n'),
        updateRules: [
            '上一版小总结只是待修订原料，不得在其后继续追加或机械缩写。',
            '结合新增事实，重写为当前唯一有效版本。',
            '新结果覆盖旧过程时，删除已失效的旧过程；只保留正文明确确认的当前结果。',
            '不同事件槽位绝不能混合人物、地点、因果或结果。',
        ].join('\n'),
        expressionRules: [
            '直接写对象、事实和当前结果，不写分析过程。',
            '每句话只承担一个近期连续性信息，并优先表达“变化后的当前结果”。',
            '相同信息只出现一次；没有内容的字段不要编造。',
            '遵守白盒硬上限；优先删除重复表达和已被新结果覆盖的过程，不新增事实。',
        ].join('\n'),
    },
    large: {
        coreQuestion: '材料中哪些事实被正文明确确认为跨场景、跨阶段持续成立？',
        includeRules: [
            '已经确认并跨阶段有效的结果。',
            '材料明确表述为不可逆、反复出现或长期持续的变化。',
            '长期身份、关系、能力、归属、制度或世界状态变化。',
            '材料明确建立并持续成立的因果结果。',
            '正文明确建立并跨阶段持续成立的责任、目标与约束。',
        ].join('\n'),
        excludeRules: [
            '事件经过、动作过程、台词、神态和气氛。',
            '没有介入或改变长期因果的旁观者、观众、路人。',
            '临时地点移动、短期情绪和即时状态。',
            '已经解决的误会、冲突、任务或普通阶段问题。',
            '只在当前场景成立、或已由当前状态表表达的短期信息。',
            '小总结的逐项缩写、近义改写或同义重复。',
        ].join('\n'),
        updateRules: [
            '不要逐句缩写小总结；只保留材料中已明确说明为长期、持续、不可逆或跨阶段成立的事实。',
            '上一版大总结只是待修订原料。没有新的长期变化时保持原意，不得扩写。',
            '长期事实被新事实推翻、结束或替换时，更新为当前唯一有效版本。',
            '不同事件槽位绝不能混合事实、因果、人物或地点。',
        ].join('\n'),
        expressionRules: [
            '每句话只表达一个已明确成立的长期结果、持续影响或跨阶段约束。',
            '直接写长期成立的对象、事实和因果，不写判断过程。',
            '相同信息只出现一次；材料未明确支持长期持续的内容不写入。',
            '遵守白盒硬上限；压缩重复表述和已被替代过程，不推断长期意义。',
        ].join('\n'),
    },
};
const DEFAULT_SETTINGS = {
    enabled: true,
    hostControl: { enabled: true, vector: true, recursion: true },
    autoState: true,
    showMessagePanel: true,
    showTopButton: true,
    auditEnabled: false,
    auditPrompt: '',
    auditFailAction: 'revise',
    revisionPrompt: '',
    maxRevisionAttempts: 1,
    stopOnRepeatedViolation: true,
    revisionFallbackAction: 'hide',
    autoSmallSummary: true,
    smallSummaryTurns: 12,
    autoLargeSummary: true,
    largeSummaryCount: 4,
    statePrompts: DEFAULT_STATE_PROMPTS,
    summaryPrompts: DEFAULT_SUMMARY_PROMPTS,
    contentLimits: DEFAULT_CONTENT_LIMITS,
    lorebookSync: true,
    autoCreateLorebook: true,
    lorebookName: '',
    vectorizeRows: true,
    latestContinuityConstant: true,
    lorebookLayout: 'semantic',
    lorebookRecall: { similarityThreshold: 0.72, maxVectorResults: 8, totalCapacity: 24000 },
    requestTimeoutMs: 90000,
    stateContextChars: 18000,
    stateOutputTokens: 3072,
    stateChunkChars: 6000,
    tableRegistry: [],
    tableLinkRules: [],
    connections: {
        audit: { mode: 'current', profileId: '', profile: '' },
        revision: { mode: 'current', profileId: '', profile: '' },
        state: { mode: 'current', profileId: '', profile: '' },
        smallSummary: { mode: 'current', profileId: '', profile: '' },
        largeSummary: { mode: 'current', profileId: '', profile: '' },
    },
    ui: { activeTab: 'overview', activeTable: 'spacetime', graphScope: 'world', graphZoom: 1, memoryView: 'combined' },
    migration: { legacyChecked: false, dynamicTablesV23: false, objectViewsV26: false, sceneTableV33: false, entryRoutingV33: false, stateProtocolV37: false, hostControlV39: false, naturalModulesV39: false, tableLinksV40: false, headerTemplateV40: false },
};

}
};
__defs["core/commit-guard.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"currentChatKey",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["currentChatKey"]});
Object.defineProperty(__scope,"getContext",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getContext"]});
Object.defineProperty(__scope,"getMessage",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getMessage"]});
Object.defineProperty(__scope,"messageFingerprint",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["messageFingerprint"]});
with(__scope){
Object.defineProperty(exports,"persistChatFor",{enumerable:true,configurable:true,get:()=>persistChatFor});
Object.defineProperty(exports,"persistMetadataFor",{enumerable:true,configurable:true,get:()=>persistMetadataFor});
Object.defineProperty(exports,"assertChatCommitCurrent",{enumerable:true,configurable:true,get:()=>assertChatCommitCurrent});
Object.defineProperty(exports,"currentHistoryRevision",{enumerable:true,configurable:true,get:()=>currentHistoryRevision});
Object.defineProperty(exports,"invalidateHistoryRevision",{enumerable:true,configurable:true,get:()=>invalidateHistoryRevision});
Object.defineProperty(exports,"assertHistoryRevisionCurrent",{enumerable:true,configurable:true,get:()=>assertHistoryRevisionCurrent});
Object.defineProperty(exports,"bindArtifactHistoryRevision",{enumerable:true,configurable:true,get:()=>bindArtifactHistoryRevision});
Object.defineProperty(exports,"unbindArtifactHistoryRevision",{enumerable:true,configurable:true,get:()=>unbindArtifactHistoryRevision});
Object.defineProperty(exports,"bindArtifactTaskGuard",{enumerable:true,configurable:true,get:()=>bindArtifactTaskGuard});
Object.defineProperty(exports,"unbindArtifactTaskGuard",{enumerable:true,configurable:true,get:()=>unbindArtifactTaskGuard});
Object.defineProperty(exports,"assertArtifactCommitCurrent",{enumerable:true,configurable:true,get:()=>assertArtifactCommitCurrent});
Object.defineProperty(exports,"CommitRejectedError",{enumerable:true,configurable:true,get:()=>CommitRejectedError});
/**
 * 模块职责：所有异步结果提交前的聊天、历史修订、任务代次与正文指纹守卫。
 * 维护边界：任何新增异步写入点都应复用这些守卫，不能只依赖 messageIndex。
 */
// 这些修订号只存在于当前页面运行期，用于让历史变化后的旧异步任务失效；不写入持久数据结构。
const historyRevisions = new Map();
const artifactHistoryRevisions = new WeakMap();
const artifactTaskGuards = new WeakMap();
class CommitRejectedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CommitRejectedError';
    }
}
function assertChatCommitCurrent(chatKey, message = '聊天已切换，本次结果不再写入') {
    if (currentChatKey() !== chatKey) {
        throw new CommitRejectedError(message);
    }
}
/**
 * 使用发起操作时的 chatKey 包围一次聊天保存。
 * 保存前后都校验，是为了覆盖 saveChat 内部存在 await 的切换聊天空窗。
 */
async function persistChatFor(chatKey) {
    assertChatCommitCurrent(chatKey);
    const context = getContext();
    assertChatCommitCurrent(chatKey);
    if (typeof context.saveChat === 'function') {
        await context.saveChat.call(context);
    }
    else if (typeof context.saveChatConditional === 'function') {
        await context.saveChatConditional.call(context);
    }
    assertChatCommitCurrent(chatKey);
}
async function persistMetadataFor(chatKey) {
    assertChatCommitCurrent(chatKey, '聊天已切换，本次元数据不再写入');
    const context = getContext();
    assertChatCommitCurrent(chatKey, '聊天已切换，本次元数据不再写入');
    if (typeof context.saveMetadata === 'function') {
        await context.saveMetadata.call(context);
    }
    else {
        context.saveMetadataDebounced?.call(context);
    }
    assertChatCommitCurrent(chatKey, '聊天已切换，本次元数据不再写入');
}
function currentHistoryRevision(chatKey) {
    return historyRevisions.get(chatKey) ?? 0;
}
function invalidateHistoryRevision(chatKey) {
    const next = currentHistoryRevision(chatKey) + 1;
    historyRevisions.set(chatKey, next);
    return next;
}
function assertHistoryRevisionCurrent(chatKey, expectedRevision) {
    if (currentHistoryRevision(chatKey) !== expectedRevision) {
        throw new CommitRejectedError('历史消息已经变化，本次旧任务结果不再写入');
    }
}
function bindArtifactHistoryRevision(artifact, revision) {
    artifactHistoryRevisions.set(artifact, revision);
}
function unbindArtifactHistoryRevision(artifact, revision) {
    if (revision === undefined || artifactHistoryRevisions.get(artifact) === revision) {
        artifactHistoryRevisions.delete(artifact);
    }
}
function bindArtifactTaskGuard(artifact, guard) {
    artifactTaskGuards.set(artifact, guard);
}
function unbindArtifactTaskGuard(artifact, guard) {
    if (!guard || artifactTaskGuards.get(artifact) === guard)
        artifactTaskGuards.delete(artifact);
}
/**
 * artifact 最终提交守卫：任务代次、历史修订、聊天身份和正文指纹必须同时有效。
 */
function assertArtifactCommitCurrent(artifact) {
    artifactTaskGuards.get(artifact)?.assertCurrent();
    const expectedRevision = artifactHistoryRevisions.get(artifact);
    if (expectedRevision !== undefined) {
        assertHistoryRevisionCurrent(artifact.chatKey, expectedRevision);
    }
    assertChatCommitCurrent(artifact.chatKey);
    const message = getMessage(artifact.messageIndex);
    if (!message || message.is_user) {
        throw new CommitRejectedError('原AI正文已不存在，请重新整理');
    }
    if (messageFingerprint(artifact.messageIndex) !== artifact.sourceFingerprint) {
        throw new CommitRejectedError('正文已经变化，请重新整理');
    }
}

}
};
__defs["core/context.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"DEFAULT_CONTENT_LIMITS",{enumerable:true,configurable:true,get:()=>__require("constants.js")["DEFAULT_CONTENT_LIMITS"]});
Object.defineProperty(__scope,"DEFAULT_SETTINGS",{enumerable:true,configurable:true,get:()=>__require("constants.js")["DEFAULT_SETTINGS"]});
Object.defineProperty(__scope,"DISPLAY_NAME",{enumerable:true,configurable:true,get:()=>__require("constants.js")["DISPLAY_NAME"]});
Object.defineProperty(__scope,"LEGACY_MODULE_NAME",{enumerable:true,configurable:true,get:()=>__require("constants.js")["LEGACY_MODULE_NAME"]});
Object.defineProperty(__scope,"MODULE_NAME",{enumerable:true,configurable:true,get:()=>__require("constants.js")["MODULE_NAME"]});
Object.defineProperty(__scope,"deepClone",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["deepClone"]});
Object.defineProperty(__scope,"hashText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["hashText"]});
Object.defineProperty(__scope,"mergeDefaults",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["mergeDefaults"]});
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"migrateTableRegistryToObjectViews",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["migrateTableRegistryToObjectViews"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
Object.defineProperty(__scope,"restoreDefaultTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["restoreDefaultTableRegistry"]});
Object.defineProperty(__scope,"tableByKey",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["tableByKey"]});
Object.defineProperty(__scope,"normalizeTableLinkRules",{enumerable:true,configurable:true,get:()=>__require("domain/table-link-rules.js")["normalizeTableLinkRules"]});
Object.defineProperty(__scope,"restoreDefaultTableLinkRules",{enumerable:true,configurable:true,get:()=>__require("domain/table-link-rules.js")["restoreDefaultTableLinkRules"]});
with(__scope){
Object.defineProperty(exports,"persistMetadata",{enumerable:true,configurable:true,get:()=>persistMetadata});
Object.defineProperty(exports,"persistChat",{enumerable:true,configurable:true,get:()=>persistChat});
Object.defineProperty(exports,"getContext",{enumerable:true,configurable:true,get:()=>getContext});
Object.defineProperty(exports,"tryGetContext",{enumerable:true,configurable:true,get:()=>tryGetContext});
Object.defineProperty(exports,"getSettings",{enumerable:true,configurable:true,get:()=>getSettings});
Object.defineProperty(exports,"saveSettings",{enumerable:true,configurable:true,get:()=>saveSettings});
Object.defineProperty(exports,"getChat",{enumerable:true,configurable:true,get:()=>getChat});
Object.defineProperty(exports,"getMessage",{enumerable:true,configurable:true,get:()=>getMessage});
Object.defineProperty(exports,"isProcessableAssistantMessage",{enumerable:true,configurable:true,get:()=>isProcessableAssistantMessage});
Object.defineProperty(exports,"latestAssistantIndex",{enumerable:true,configurable:true,get:()=>latestAssistantIndex});
Object.defineProperty(exports,"previousUserText",{enumerable:true,configurable:true,get:()=>previousUserText});
Object.defineProperty(exports,"currentChatLocator",{enumerable:true,configurable:true,get:()=>currentChatLocator});
Object.defineProperty(exports,"currentChatKey",{enumerable:true,configurable:true,get:()=>currentChatKey});
Object.defineProperty(exports,"messageFingerprint",{enumerable:true,configurable:true,get:()=>messageFingerprint});
Object.defineProperty(exports,"messageIdentity",{enumerable:true,configurable:true,get:()=>messageIdentity});
Object.defineProperty(exports,"getChatMetadataNamespace",{enumerable:true,configurable:true,get:()=>getChatMetadataNamespace});
Object.defineProperty(exports,"toast",{enumerable:true,configurable:true,get:()=>toast});
Object.defineProperty(exports,"cloneSettings",{enumerable:true,configurable:true,get:()=>cloneSettings});
/**
 * 模块职责：封装 SillyTavern 上下文、设置迁移、聊天身份与消息身份。
 * 维护边界：自动链只接受明确的非系统角色正文；不要为兼容含糊事件而放宽边界。
 */
function getContext() {
    const context = globalThis.SillyTavern?.getContext?.();
    if (!context)
        throw new Error('SillyTavern上下文尚未就绪');
    return context;
}
function tryGetContext() {
    try {
        return globalThis.SillyTavern?.getContext?.() ?? null;
    }
    catch {
        return null;
    }
}
function getSettings() {
    const context = getContext();
    context.extensionSettings ||= {};
    const legacy = context.extensionSettings[LEGACY_MODULE_NAME];
    const current = context.extensionSettings[MODULE_NAME];
    const migrated = current ?? migrateLegacySettings(legacy);
    context.extensionSettings[MODULE_NAME] = mergeDefaults(DEFAULT_SETTINGS, migrated);
    const settings = context.extensionSettings[MODULE_NAME];
    settings.hostControl ||= structuredClone(DEFAULT_SETTINGS.hostControl);
    settings.hostControl.enabled = settings.hostControl.enabled !== false;
    settings.hostControl.vector = settings.hostControl.vector !== false;
    settings.hostControl.recursion = settings.hostControl.recursion !== false;
    if (String(settings.lorebookLayout) === 'compact')
        settings.lorebookLayout = 'semantic';
    const auditFailAction = String(settings.auditFailAction || 'revise');
    settings.auditFailAction = auditFailAction === 'delete' || auditFailAction === 'withdraw'
        ? 'hide'
        : ['revise', 'mark', 'hide'].includes(auditFailAction)
            ? auditFailAction
            : 'revise';
    settings.revisionFallbackAction = String(settings.revisionFallbackAction) === 'mark' ? 'mark' : 'hide';
    settings.maxRevisionAttempts = Math.min(2, Math.max(1, Math.round(Number(settings.maxRevisionAttempts) || 1)));
    settings.smallSummaryTurns = Math.min(100, Math.max(1, Math.round(Number(settings.smallSummaryTurns) || 12)));
    settings.largeSummaryCount = Math.min(50, Math.max(1, Math.round(Number(settings.largeSummaryCount) || 4)));
    settings.statePrompts.admissionRules = safeText(settings.statePrompts.admissionRules, 8000).trim();
    settings.statePrompts.exclusionRules = safeText(settings.statePrompts.exclusionRules, 8000).trim();
    settings.statePrompts.routingRules = safeText(settings.statePrompts.routingRules, 8000).trim();
    settings.statePrompts.evidenceRules = safeText(settings.statePrompts.evidenceRules, 8000).trim();
    settings.statePrompts.updateRules = safeText(settings.statePrompts.updateRules, 8000).trim();
    for (const kind of ['small', 'large']) {
        const section = settings.summaryPrompts[kind];
        section.coreQuestion = safeText(section.coreQuestion, 1200).trim();
        section.includeRules = safeText(section.includeRules, 6000).trim();
        section.excludeRules = safeText(section.excludeRules, 6000).trim();
        section.updateRules = safeText(section.updateRules, 6000).trim();
        section.expressionRules = safeText(section.expressionRules, 6000).trim();
    }
    settings.contentLimits ||= structuredClone(DEFAULT_CONTENT_LIMITS);
    settings.contentLimits.tables ||= {};
    for (const [key, fallback] of Object.entries(DEFAULT_CONTENT_LIMITS.tables)) {
        const current = Number(settings.contentLimits.tables[key]);
        settings.contentLimits.tables[key] = Math.min(20000, Math.max(200, Math.round(current || fallback)));
    }
    for (const table of settings.tableRegistry ?? []) {
        const fallback = DEFAULT_CONTENT_LIMITS.tables[table.key] ?? DEFAULT_CONTENT_LIMITS.tables.customObjects;
        const current = Number(settings.contentLimits.tables[table.key]);
        settings.contentLimits.tables[table.key] = Math.min(20000, Math.max(200, Math.round(current || fallback)));
    }
    settings.contentLimits.smallSummary = Math.min(10000, Math.max(200, Math.round(Number(settings.contentLimits.smallSummary) || DEFAULT_CONTENT_LIMITS.smallSummary)));
    settings.contentLimits.largeSummary = Math.min(20000, Math.max(300, Math.round(Number(settings.contentLimits.largeSummary) || DEFAULT_CONTENT_LIMITS.largeSummary)));
    settings.requestTimeoutMs = Math.min(300000, Math.max(10000, Math.round(Number(settings.requestTimeoutMs) || 90000)));
    settings.stateContextChars = Math.min(60000, Math.max(6000, Math.round(Number(settings.stateContextChars) || 18000)));
    settings.stateOutputTokens = Math.min(8192, Math.max(768, Math.round(Number(settings.stateOutputTokens) || 3072)));
    settings.stateChunkChars = Math.min(16000, Math.max(1800, Math.round(Number(settings.stateChunkChars) || 6000)));
    settings.ui ||= structuredClone(DEFAULT_SETTINGS.ui);
    settings.ui.graphScope = settings.ui.graphScope === 'relations' ? 'relations' : 'world';
    settings.ui.graphZoom = Math.min(2.5, Math.max(0.5, Number(settings.ui.graphZoom) || 1));
    settings.ui.memoryView = ['combined', 'events', 'graph'].includes(String(settings.ui.memoryView))
        ? settings.ui.memoryView
        : 'combined';
    delete settings.compatibilityMode;
    delete settings.repairInvalidJsonOnce;
    settings.migration ||= { legacyChecked: false, dynamicTablesV23: false, objectViewsV26: false };
    if (!settings.migration.memoryNetworkV38) {
        settings.ui.memoryView = 'combined';
        settings.ui.graphScope = 'world';
        settings.migration.memoryNetworkV38 = true;
    }
    if (!settings.migration.hostControlV39) {
        settings.hostControl = { enabled: true, vector: true, recursion: true };
        settings.migration.hostControlV39 = true;
    }
    settings.migration.naturalModulesV39 ??= false;
    settings.migration.tableLinksV40 ??= false;
    settings.migration.headerTemplateV40 ??= false;
    settings.migration.objectViewsV26 ??= false;
    settings.migration.sceneTableV33 ??= false;
    settings.migration.entryRoutingV33 ??= false;
    settings.lorebookRecall ||= { similarityThreshold: 0.72, maxVectorResults: 8, totalCapacity: 24000 };
    settings.lorebookRecall.similarityThreshold = Math.min(0.99, Math.max(0, Number(settings.lorebookRecall.similarityThreshold) || 0.72));
    settings.lorebookRecall.maxVectorResults = Math.min(100, Math.max(1, Math.round(Number(settings.lorebookRecall.maxVectorResults) || 8)));
    settings.lorebookRecall.totalCapacity = Math.min(200000, Math.max(2000, Math.round(Number(settings.lorebookRecall.totalCapacity) || 24000)));
    if (!settings.migration.dynamicTablesV23 || !Array.isArray(settings.tableRegistry) || !settings.tableRegistry.length) {
        settings.tableRegistry = restoreDefaultTableRegistry();
        settings.vectorizeRows = true;
        settings.migration.dynamicTablesV23 = true;
    }
    else {
        settings.tableRegistry = normalizeTableRegistry(settings.tableRegistry);
    }
    if (!settings.migration.objectViewsV26) {
        settings.tableRegistry = migrateTableRegistryToObjectViews(settings.tableRegistry);
        settings.migration.objectViewsV26 = true;
        const legacyActive = settings.ui?.activeTable || '';
        if (['focus', 'state', 'characters', 'skills', 'relationships'].includes(legacyActive))
            settings.ui.activeTable = 'characters';
        if (legacyActive === 'regions')
            settings.ui.activeTable = 'regions';
        if (legacyActive === 'foundations')
            settings.ui.activeTable = 'foundations';
    }
    if (!settings.migration.sceneTableV33) {
        const hasSceneTable = settings.tableRegistry.some((table) => table.key === 'scenes' || table.role === 'scenes');
        if (!hasSceneTable) {
            const sceneTable = restoreDefaultTableRegistry().find((table) => table.key === 'scenes');
            if (sceneTable) {
                const spacetimeIndex = settings.tableRegistry.findIndex((table) => table.role === 'spacetime');
                const insertAt = spacetimeIndex >= 0 ? spacetimeIndex + 1 : 0;
                settings.tableRegistry.splice(insertAt, 0, sceneTable);
                settings.tableRegistry = normalizeTableRegistry(settings.tableRegistry.map((table, order) => ({ ...table, order })));
            }
        }
        settings.migration.sceneTableV33 = true;
    }
    if (!settings.migration.entryRoutingV33) {
        const appendRule = (current, rule, marker) => current.includes(marker)
            ? current
            : `${current.trim()}${current.trim() ? '\n' : ''}${rule}`;
        settings.statePrompts.admissionRules = appendRule(settings.statePrompts.admissionRules, '物品只要其身份可区分，且所有权、位置、数量、完整性、可用性、隐藏状态、用途或后续能否取得会影响下一轮，就应建档；不要求已经多次出现。', '后续能否取得');
        settings.statePrompts.admissionRules = appendRule(settings.statePrompts.admissionRules, '当前实际发生的叙事场景必须建立或更新场景条目；场景条目记录参与对象、核心局面、直接限制与未决承接，不等同于地点本身。', '不等同于地点本身');
        settings.statePrompts.routingRules = appendRule(settings.statePrompts.routingRules, 'scenes（场景）：一次真实发生的叙事场景或局面切片；场景结束后改为已结束/已离开，不删除。', 'scenes（场景）');
        settings.statePrompts.routingRules = appendRule(settings.statePrompts.routingRules, '分类时先判断对象本质：具体个体才是角色；组织、阵营、政权、机构、群体格局和制度执行即使具有名称、目标、关系或行动，也归入全局变化。', '具体个体才是角色');
        settings.statePrompts.updateRules = appendRule(settings.statePrompts.updateRules, '提交前逐项复查正文中的可区分物品，凡所有权、位置、数量、完整性、可用性、隐藏状态、用途或后续可取得性被建立或改变，均需输出独立物品条目。', '逐项复查正文中的可区分物品');
        settings.statePrompts.updateRules = appendRule(settings.statePrompts.updateRules, '提交前确认当前真实场景有场景条目；发生场景切换时，新场景设为当前，旧场景更新为已结束或已离开。', '当前真实场景有场景条目');
        settings.migration.entryRoutingV33 = true;
    }
    for (const table of settings.tableRegistry) {
        const fallback = DEFAULT_CONTENT_LIMITS.tables[table.key] ?? DEFAULT_CONTENT_LIMITS.tables.customObjects;
        const current = Number(settings.contentLimits.tables[table.key]);
        settings.contentLimits.tables[table.key] = Math.min(20000, Math.max(200, Math.round(current || fallback)));
    }
    if (!settings.migration.factOnlyV36) {
        settings.migration.factOnlyV36 = true;
    }
    if (!settings.migration.contentLimitsV36) {
        settings.migration.contentLimitsV36 = true;
    }
    if (!settings.migration.stateProtocolV37) {
        settings.migration.stateProtocolV37 = true;
    }
    if (!settings.migration.tableLinksV40) {
        settings.tableLinkRules = restoreDefaultTableLinkRules(settings.tableRegistry);
        settings.migration.tableLinksV40 = true;
    }
    else {
        settings.tableLinkRules = normalizeTableLinkRules(settings.tableLinkRules, settings.tableRegistry);
    }
    // 1.4.0-alpha.5 起，用户只通过表头提示词改变提取方向；旧的五组全局规则收回为固定通用内核。
    if (!settings.migration.headerTemplateV40) {
        settings.statePrompts = structuredClone(DEFAULT_SETTINGS.statePrompts);
        settings.migration.headerTemplateV40 = true;
    }
    if (!tableByKey(settings.tableRegistry, settings.ui?.activeTable || '') || !tableByKey(settings.tableRegistry, settings.ui.activeTable)?.enabled) {
        settings.ui.activeTable = settings.tableRegistry.find((table) => table.enabled)?.key || settings.tableRegistry[0]?.key || 'spacetime';
    }
    const savedProfiles = Array.isArray(context.extensionSettings?.connectionManager?.profiles)
        ? context.extensionSettings.connectionManager.profiles
        : [];
    for (const connection of Object.values(settings.connections ?? {})) {
        connection.profileId ||= '';
        connection.profile ||= '';
        if (connection.mode === 'independent')
            connection.mode = 'current';
        if (!connection.profileId && connection.profile) {
            const matched = savedProfiles.find((profile) => safeText(profile?.name, 160).trim() === safeText(connection.profile, 160).trim());
            if (matched?.id)
                connection.profileId = String(matched.id);
        }
    }
    return settings;
}
function migrateLegacySettings(legacy) {
    if (!legacy || typeof legacy !== 'object')
        return undefined;
    return {
        enabled: legacy.enabled ?? true,
        hostControl: { enabled: true, vector: true, recursion: true },
        autoState: legacy.autoState ?? true,
        showMessagePanel: legacy.showMessagePanels ?? true,
        showTopButton: legacy.showTopButton ?? true,
        auditEnabled: legacy.ruleAuditEnabled ?? false,
        auditPrompt: safeText(legacy.ruleAuditPrompt ?? ''),
        auditFailAction: legacy.ruleAuditFailAction === 'withdraw' ? 'hide' : 'mark',
        revisionPrompt: safeText(legacy.revisionPrompt ?? ''),
        maxRevisionAttempts: Number(legacy.maxRevisionAttempts) || 1,
        stopOnRepeatedViolation: legacy.stopOnRepeatedViolation ?? true,
        revisionFallbackAction: legacy.revisionFallbackAction === 'mark' ? 'mark' : 'hide',
        autoSmallSummary: legacy.autoSmallSummary ?? true,
        smallSummaryTurns: Number(legacy.smallSummaryTurns) || 15,
        autoLargeSummary: legacy.autoLargeSummary ?? true,
        largeSummaryCount: Number(legacy.largeSummaryCount) || 6,
        lorebookSync: legacy.lorebookSync ?? true,
        autoCreateLorebook: legacy.autoCreateChatLorebook ?? true,
        lorebookName: safeText(legacy.lorebookName ?? '', 80),
        vectorizeRows: legacy.vectorizeStateRows ?? false,
        latestContinuityConstant: legacy.latestContinuityConstant ?? true,
        connections: {
            audit: { mode: legacy.auditProfile ? 'profile' : 'current', profileId: '', profile: safeText(legacy.auditProfile ?? '', 120) },
            revision: { mode: legacy.revisionProfile ? 'profile' : 'current', profileId: '', profile: safeText(legacy.revisionProfile ?? legacy.auditProfile ?? '', 120) },
            state: { mode: legacy.stateProfile ? 'profile' : 'current', profileId: '', profile: safeText(legacy.stateProfile ?? '', 120) },
            smallSummary: { mode: legacy.smallSummaryProfile ? 'profile' : 'current', profileId: '', profile: safeText(legacy.smallSummaryProfile ?? '', 120) },
            largeSummary: { mode: legacy.largeSummaryProfile ? 'profile' : 'current', profileId: '', profile: safeText(legacy.largeSummaryProfile ?? '', 120) },
        },
    };
}
function saveSettings() {
    getContext().saveSettingsDebounced?.();
}
function getChat() {
    return (getContext().chat ?? []);
}
function getMessage(index) {
    return getChat()[index] ?? null;
}
/** 自动触发的唯一消息入口边界：必须是明确角色消息，且不能是系统消息或空正文。 */
function isProcessableAssistantMessage(message) {
    return Boolean(message
        && message.is_user === false
        && message.is_system !== true
        && message.extra?.type !== 'system'
        && safeText(message.mes).trim());
}
function latestAssistantIndex() {
    const chat = getChat();
    for (let i = chat.length - 1; i >= 0; i -= 1) {
        if (isProcessableAssistantMessage(chat[i]))
            return i;
    }
    return -1;
}
function previousUserText(beforeIndex) {
    const chat = getChat();
    for (let i = beforeIndex - 1; i >= 0; i -= 1) {
        if (chat[i]?.is_user)
            return safeText(chat[i]?.mes).trim();
    }
    return '';
}
function chatLocator(context) {
    const chatId = context.getCurrentChatId?.() ?? context.chatId ?? context.chat_metadata?.chat_id ?? '';
    const scope = context.groupId ? `group:${context.groupId}` : `character:${context.characterId ?? context.name2 ?? 'unknown'}`;
    return chatId ? `${scope}|${String(chatId)}` : '';
}
/** 用稳定角色/群组 ID 与聊天 ID 绑定已保存 chatKey；角色显示名变化不能改变同一聊天身份。 */
function currentChatLocator() {
    return chatLocator(getContext());
}
/** chatKey 同时包含角色/群组作用域与聊天标识，不能用消息索引代替。 */
function currentChatKey() {
    const context = getContext();
    const locator = chatLocator(context);
    const storedState = context.chatMetadata?.[MODULE_NAME]?.state;
    if (locator && storedState?.chatLocator === locator && safeText(storedState.chatKey, 240).trim()) {
        return safeText(storedState.chatKey, 240).trim();
    }
    const chatId = context.getCurrentChatId?.() ?? context.chatId ?? context.chat_metadata?.chat_id ?? '';
    const scope = context.groupId ? `group:${context.groupId}` : `character:${context.characterId ?? context.name2 ?? 'unknown'}`;
    const seed = `${scope}|${chatId || context.name1 || 'chat'}|${context.name2 || ''}`;
    return `${scope}:${hashText(seed)}`;
}
function messageFingerprint(index) {
    const message = getMessage(index);
    return hashText(`${previousUserText(index)}\n---MA11---\n${safeText(message?.mes)}`);
}
function messageIdentity(index) {
    const message = getMessage(index);
    const stable = message?.id ?? message?.send_date ?? message?.extra?.gen_id ?? index;
    return `${String(stable)}:${messageFingerprint(index)}`;
}
function getChatMetadataNamespace() {
    const context = getContext();
    context.chatMetadata ||= {};
    context.chatMetadata[MODULE_NAME] ||= {
        schemaVersion: 1,
        createdAt: nowIso(),
        updatedAt: nowIso(),
    };
    return context.chatMetadata[MODULE_NAME];
}
async function persistMetadata() {
    const context = getContext();
    if (typeof context.saveMetadata === 'function') {
        await context.saveMetadata();
        return;
    }
    context.saveMetadataDebounced?.();
}
async function persistChat() {
    const context = getContext();
    if (typeof context.saveChat === 'function') {
        await context.saveChat();
        return;
    }
    if (typeof context.saveChatConditional === 'function') {
        await context.saveChatConditional();
    }
}
function toast(kind, message) {
    const toastr = globalThis.toastr;
    if (toastr?.[kind])
        toastr[kind](message, DISPLAY_NAME);
    else
        console[kind === 'error' ? 'error' : 'log'](`[${DISPLAY_NAME}] ${message}`);
}
function cloneSettings() {
    return deepClone(getSettings());
}

}
};
__defs["core/message-update.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"getContext",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getContext"]});
Object.defineProperty(__scope,"getMessage",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getMessage"]});
Object.defineProperty(__scope,"messageFingerprint",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["messageFingerprint"]});
Object.defineProperty(__scope,"messageIdentity",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["messageIdentity"]});
Object.defineProperty(__scope,"assertArtifactCommitCurrent",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["assertArtifactCommitCurrent"]});
Object.defineProperty(__scope,"persistChatFor",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["persistChatFor"]});
Object.defineProperty(__scope,"attachArtifactToMessage",{enumerable:true,configurable:true,get:()=>__require("domain/artifact.js")["attachArtifactToMessage"]});
with(__scope){
Object.defineProperty(exports,"refreshMessageDisplay",{enumerable:true,configurable:true,get:()=>refreshMessageDisplay});
Object.defineProperty(exports,"replaceMessageInPlace",{enumerable:true,configurable:true,get:()=>replaceMessageInPlace});
/**
 * 模块职责：将定向修正结果原位写回当前活动 swipe，并刷新 SillyTavern 消息显示。
 * 维护边界：只允许修改仍与 artifact 指纹一致的当前正文，不新增重复消息。
 */
function updateActiveSwipe(message, text) {
    if (!Array.isArray(message?.swipes))
        return;
    const id = Number(message.swipe_id);
    if (Number.isInteger(id) && id >= 0 && id < message.swipes.length)
        message.swipes[id] = text;
}
async function refreshMessageDisplay(index) {
    const context = getContext();
    const message = getMessage(index);
    // 原位修正只需要重绘这一条消息。reloadCurrentChat 会触发聊天级生命周期事件，
    // 可能把仍在运行的“修正 → 表格”主链误当成聊天切换而取消。
    if (typeof context.updateMessageBlock === 'function') {
        await context.updateMessageBlock(index, message);
        return;
    }
    if (context.event_types?.MESSAGE_UPDATED) {
        context.eventSource?.emit?.(context.event_types.MESSAGE_UPDATED, index);
        return;
    }
    // 仅旧版 SillyTavern 缺少单消息重绘能力时才退回整聊天刷新。
    if (typeof context.reloadCurrentChat === 'function')
        await context.reloadCurrentChat();
}
async function replaceMessageInPlace(artifact, text) {
    assertArtifactCommitCurrent(artifact);
    const message = getMessage(artifact.messageIndex);
    if (!message || message.is_user)
        throw new Error('原AI消息已不存在');
    const finalText = String(text || '').trim();
    if (!finalText)
        throw new Error('修正文模型返回空正文');
    message.mes = finalText;
    updateActiveSwipe(message, finalText);
    artifact.assistantText = finalText;
    artifact.sourceFingerprint = messageFingerprint(artifact.messageIndex);
    artifact.messageKey = messageIdentity(artifact.messageIndex);
    artifact.approvedFingerprint = artifact.sourceFingerprint;
    artifact.hiddenByAudit = false;
    attachArtifactToMessage(message, artifact);
    await persistChatFor(artifact.chatKey);
    await refreshMessageDisplay(artifact.messageIndex);
    return artifact.sourceFingerprint;
}

}
};
__defs["core/requests.js"]=function(exports,__require){
const __scope=Object.create(null);
with(__scope){
Object.defineProperty(exports,"setRequestAcceptance",{enumerable:true,configurable:true,get:()=>setRequestAcceptance});
Object.defineProperty(exports,"beginModelRequest",{enumerable:true,configurable:true,get:()=>beginModelRequest});
Object.defineProperty(exports,"finishModelRequest",{enumerable:true,configurable:true,get:()=>finishModelRequest});
Object.defineProperty(exports,"abortActiveRequests",{enumerable:true,configurable:true,get:()=>abortActiveRequests});
Object.defineProperty(exports,"abortActiveBusinessRequests",{enumerable:true,configurable:true,get:()=>abortActiveBusinessRequests});
Object.defineProperty(exports,"abortActiveAutomaticSummaryRequests",{enumerable:true,configurable:true,get:()=>abortActiveAutomaticSummaryRequests});
const activeControllers = new Map();
let acceptingRequests = true;
function setRequestAcceptance(accepting) {
    acceptingRequests = accepting;
}
function beginModelRequest(metadata) {
    if (!acceptingRequests)
        throw new Error('镜渊已禁用，不再接受新请求');
    const controller = new AbortController();
    activeControllers.set(controller, metadata);
    return controller;
}
function finishModelRequest(controller) {
    activeControllers.delete(controller);
}
function abortActiveRequests(predicate = () => true) {
    let aborted = 0;
    for (const [controller, metadata] of activeControllers) {
        if (!predicate(metadata))
            continue;
        aborted += 1;
        controller.abort();
        activeControllers.delete(controller);
    }
    return aborted;
}
/** 历史内容变化会使所有业务结果失效，但只读诊断不依赖正文快照。 */
function abortActiveBusinessRequests() {
    return abortActiveRequests((metadata) => metadata.requestClass === 'business');
}
/** 新正文只允许抢占自动总结业务请求；诊断和其他业务链不受影响。 */
function abortActiveAutomaticSummaryRequests() {
    return abortActiveRequests((metadata) => (metadata.requestClass === 'business'
        && ['smallSummary', 'largeSummary'].includes(metadata.task)));
}

}
};
__defs["core/utils.js"]=function(exports,__require){
const __scope=Object.create(null);
with(__scope){
Object.defineProperty(exports,"deepClone",{enumerable:true,configurable:true,get:()=>deepClone});
Object.defineProperty(exports,"mergeDefaults",{enumerable:true,configurable:true,get:()=>mergeDefaults});
Object.defineProperty(exports,"hashText",{enumerable:true,configurable:true,get:()=>hashText});
Object.defineProperty(exports,"makeId",{enumerable:true,configurable:true,get:()=>makeId});
Object.defineProperty(exports,"nowIso",{enumerable:true,configurable:true,get:()=>nowIso});
Object.defineProperty(exports,"escapeHtml",{enumerable:true,configurable:true,get:()=>escapeHtml});
Object.defineProperty(exports,"withTimeout",{enumerable:true,configurable:true,get:()=>withTimeout});
Object.defineProperty(exports,"safeText",{enumerable:true,configurable:true,get:()=>safeText});
Object.defineProperty(exports,"sanitizeBookName",{enumerable:true,configurable:true,get:()=>sanitizeBookName});
Object.defineProperty(exports,"toErrorMessage",{enumerable:true,configurable:true,get:()=>toErrorMessage});
/**
 * 模块职责：通用克隆、哈希、超时与错误文本工具。
 * 维护边界：模型协议解析由固定文本领域模块负责；这里不承担模型输出修复。
 */
function deepClone(value) {
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        }
        catch {
            // Fall through.
        }
    }
    return JSON.parse(JSON.stringify(value));
}
function isPlainRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function mergeDefaults(defaults, current) {
    const output = deepClone(defaults);
    const merge = (target, source) => {
        // 持久化设置属于不可信反序列化输入。容器类型不匹配时保留默认值，
        // 不能把字符串、数组或 null 覆盖到后续会被直接解引用的设置对象上。
        if (!isPlainRecord(source) || !isPlainRecord(target))
            return;
        for (const [key, value] of Object.entries(source)) {
            const fallback = target[key];
            if (isPlainRecord(fallback)) {
                if (isPlainRecord(value))
                    merge(fallback, value);
                continue;
            }
            if (Array.isArray(fallback)) {
                if (Array.isArray(value))
                    target[key] = deepClone(value);
                continue;
            }
            if (value !== undefined && (value === null || ['string', 'number', 'boolean'].includes(typeof value))) {
                target[key] = value;
            }
        }
    };
    merge(output, current);
    return output;
}
function hashText(value) {
    const text = String(value ?? '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}
function makeId(prefix = 'ma') {
    if (globalThis.crypto?.randomUUID)
        return `${prefix}_${globalThis.crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
function nowIso() {
    return new Date().toISOString();
}
function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = String(value ?? '');
    return element.innerHTML;
}
function withTimeout(promise, ms, label, controller) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer;
        const cleanup = () => {
            if (timer !== undefined)
                window.clearTimeout(timer);
            controller?.signal.removeEventListener('abort', onAbort);
        };
        const onAbort = () => {
            if (settled)
                return;
            settled = true;
            cleanup();
            const error = new Error(`${label}已取消`);
            error.name = 'AbortError';
            reject(error);
        };
        if (controller?.signal.aborted) {
            onAbort();
            return;
        }
        controller?.signal.addEventListener('abort', onAbort, { once: true });
        timer = window.setTimeout(() => {
            if (settled)
                return;
            settled = true;
            cleanup();
            controller?.abort();
            reject(new Error(`${label}超时（${Math.round(ms / 1000)}秒）`));
        }, ms);
        promise.then((value) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            resolve(value);
        }, (error) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            reject(error);
        });
    });
}
function safeText(value, max = 100000) {
    return String(value ?? '').replace(/\u0000/g, '').slice(0, max);
}
function sanitizeBookName(value) {
    return String(value ?? '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
}
function toErrorMessage(error) {
    if (error instanceof Error) {
        const parts = [];
        const seen = new Set();
        let current = error;
        while (current instanceof Error && !seen.has(current)) {
            seen.add(current);
            if (current.message && !parts.includes(current.message))
                parts.push(current.message);
            current = current.cause;
        }
        return parts.join('：') || error.name || '未知错误';
    }
    if (error && typeof error === 'object') {
        try {
            const message = error.message ?? error.error?.message;
            if (message)
                return String(message);
            return JSON.stringify(error);
        }
        catch {
            return String(error);
        }
    }
    return String(error ?? '未知错误');
}

}
};
__defs["domain/artifact.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"MODULE_NAME",{enumerable:true,configurable:true,get:()=>__require("constants.js")["MODULE_NAME"]});
Object.defineProperty(__scope,"currentChatKey",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["currentChatKey"]});
Object.defineProperty(__scope,"messageFingerprint",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["messageFingerprint"]});
Object.defineProperty(__scope,"messageIdentity",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["messageIdentity"]});
Object.defineProperty(__scope,"previousUserText",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["previousUserText"]});
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
with(__scope){
Object.defineProperty(exports,"createArtifact",{enumerable:true,configurable:true,get:()=>createArtifact});
Object.defineProperty(exports,"attachArtifactToMessage",{enumerable:true,configurable:true,get:()=>attachArtifactToMessage});
Object.defineProperty(exports,"getAttachedArtifact",{enumerable:true,configurable:true,get:()=>getAttachedArtifact});
Object.defineProperty(exports,"markStage",{enumerable:true,configurable:true,get:()=>markStage});
/**
 * 模块职责：创建、读取、附着消息级 artifact，并维护阶段状态。
 * 维护边界：artifact 是单条正文的规范结果，必须与 chatKey、messageIdentity 和 sourceFingerprint 绑定。
 */
function idleStage() {
    return { status: 'idle', attempts: 0 };
}
function createArtifact(message, messageIndex) {
    const now = nowIso();
    return {
        schemaVersion: 1,
        chatKey: currentChatKey(),
        messageKey: messageIdentity(messageIndex),
        messageIndex,
        sourceFingerprint: messageFingerprint(messageIndex),
        playerText: previousUserText(messageIndex),
        assistantText: safeText(message.mes),
        createdAt: now,
        updatedAt: now,
        stages: {
            audit: idleStage(),
            revision: idleStage(),
            state: idleStage(),
            summary: idleStage(),
            sync: idleStage(),
        },
    };
}
function attachArtifactToMessage(message, artifact) {
    message.extra ||= {};
    message.extra[MODULE_NAME] = artifact;
}
function getAttachedArtifact(message) {
    const value = message?.extra?.[MODULE_NAME];
    return value && typeof value === 'object' ? value : null;
}
function markStage(artifact, stage, status, error) {
    const current = artifact.stages[stage] ?? idleStage();
    const now = nowIso();
    const terminal = ['success', 'failed', 'cancelled', 'skipped', 'blocked'].includes(status);
    const enteringRunning = status === 'running' && current.status !== 'running';
    artifact.stages[stage] = {
        ...current,
        status,
        attempts: enteringRunning ? current.attempts + 1 : current.attempts,
        // queued/idle 代表一轮尚未开始；直接 blocked/skipped 也不能继承上一轮执行时间。
        startedAt: status === 'running'
            ? (enteringRunning ? now : current.startedAt)
            : terminal && current.status === 'running'
                ? current.startedAt
                : undefined,
        finishedAt: terminal ? now : undefined,
        error: error || undefined,
    };
    artifact.updatedAt = now;
}

}
};
__defs["domain/audit-text.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"hashText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["hashText"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"fixedTextValue",{enumerable:true,configurable:true,get:()=>__require("domain/fixed-text.js")["fixedTextValue"]});
Object.defineProperty(__scope,"fixedTextValues",{enumerable:true,configurable:true,get:()=>__require("domain/fixed-text.js")["fixedTextValues"]});
Object.defineProperty(__scope,"parseFixedTextBlocks",{enumerable:true,configurable:true,get:()=>__require("domain/fixed-text.js")["parseFixedTextBlocks"]});
with(__scope){
Object.defineProperty(exports,"parseAuditTextOutput",{enumerable:true,configurable:true,get:()=>parseAuditTextOutput});
/**
 * 模块职责：解析审核模型的固定文本协议并转换为内部审核对象。
 * 维护边界：模型只给出自然语言字段；违规指纹、默认值和内部结构由插件生成。
 */
const MARKERS = [
    { kind: 'audit', start: '<MA_AUDIT>', end: '</MA_AUDIT>' },
    { kind: 'violation', start: '<MA_VIOLATION>', end: '</MA_VIOLATION>' },
    { kind: 'replacement', start: '<MA_REPLACEMENT>', end: '</MA_REPLACEMENT>', rawBody: true },
];
function normalizedKey(value) {
    return value.normalize('NFKC').trim().toLowerCase().replace(/[\s_-]+/g, '');
}
function aliasFields(block) {
    const aliases = {
        '结果': 'result', '判定': 'result', '结论': 'result',
        '原因': 'reason', '理由': 'reason',
        '保留': 'preserve', '必须保留': 'preserve',
        '修正指令': 'rewrite', '修改指令': 'rewrite', '重写指令': 'rewrite', 'rewriteinstruction': 'rewrite',
        '规则编号': 'ruleid', '规则id': 'ruleid', 'rule_id': 'ruleid',
        '规则': 'rule', '证据': 'evidence', '修改': 'action', '操作': 'action',
    };
    const output = new Map();
    for (const [key, values] of block.fields.entries()) {
        const normalized = normalizedKey(key);
        const target = aliases[key.trim()] || aliases[normalized] || normalized;
        output.set(target, [...(output.get(target) ?? []), ...values]);
    }
    return output;
}
function values(block, ...keys) {
    return fixedTextValues({ ...block, fields: aliasFields(block) }, ...keys);
}
function value(block, ...keys) {
    return fixedTextValue({ ...block, fields: aliasFields(block) }, ...keys);
}
function fingerprint(violations) {
    const source = violations
        .map((item) => `${item.ruleId}|${item.rule}`.toLowerCase().replace(/\s+/g, ' ').trim())
        .sort()
        .join('\n');
    return source ? hashText(source) : '';
}
function decisionValue(raw) {
    const value = normalizedKey(raw);
    if (['pass', '通过', '合格'].includes(value))
        return 'pass';
    if (['revise', '修改', '修正', '需修改', '需要修改'].includes(value))
        return 'revise';
    if (['block', '阻止', '拦截', '无法修正'].includes(value))
        return 'block';
    return '';
}
function parseAuditTextOutput(raw) {
    const text = safeText(raw, 220000).trim();
    const legacy = text.replace(/\r/g, '').split('\n');
    if (legacy[0]?.trim().toUpperCase() === 'MA_OK') {
        return { passed: true, decision: 'pass', reason: legacy.slice(1).join('\n').trim() || '通过', violations: [], preserve: [], rewriteInstruction: '', violationFingerprint: '' };
    }
    if (legacy[0]?.trim().toUpperCase() === 'MA_FAIL') {
        const reason = legacy.slice(1).join('\n').trim() || '违反规则';
        const violations = [{ ruleId: 'legacy_failure', rule: '审核模型判定违反玩家规则', evidence: reason, action: reason }];
        return { passed: false, decision: 'revise', reason, violations, preserve: [], rewriteInstruction: reason, violationFingerprint: fingerprint(violations) };
    }
    const blocks = parseFixedTextBlocks(text, MARKERS);
    const auditBlocks = blocks.filter((block) => block.kind === 'audit');
    if (auditBlocks.length !== 1)
        throw new Error(`审核固定文本必须且只能包含一个 <MA_AUDIT>，实际 ${auditBlocks.length} 个`);
    const audit = auditBlocks[0];
    const decision = decisionValue(value(audit, 'result'));
    if (!decision)
        throw new Error('审核固定文本缺少有效 result=pass|revise|block');
    const passed = decision === 'pass';
    const violations = blocks.filter((block) => block.kind === 'violation').map((block, index) => ({
        ruleId: safeText(value(block, 'ruleid') || `rule_${index + 1}`, 120).trim() || `rule_${index + 1}`,
        rule: safeText(value(block, 'rule'), 1000).trim(),
        evidence: safeText(value(block, 'evidence'), 3000).trim(),
        action: safeText(value(block, 'action'), 3000).trim(),
    })).filter((item) => item.rule || item.evidence || item.action).slice(0, 24);
    if (!passed && !violations.length)
        throw new Error('审核判定未通过，但没有返回 <MA_VIOLATION>');
    const replacementBlocks = blocks.filter((block) => block.kind === 'replacement');
    if (replacementBlocks.length > 1)
        throw new Error('审核固定文本最多只能包含一个 <MA_REPLACEMENT>');
    const replacementText = decision === 'revise' ? safeText(replacementBlocks[0]?.raw, 200000).trim() || undefined : undefined;
    return {
        passed,
        decision,
        reason: safeText(value(audit, 'reason'), 3000).trim() || (passed ? '通过' : '违反规则'),
        violations: passed ? [] : violations,
        preserve: values(audit, 'preserve').map((item) => safeText(item, 2000).trim()).filter(Boolean).slice(0, 24),
        rewriteInstruction: safeText(value(audit, 'rewrite'), 6000).trim(),
        violationFingerprint: passed ? '' : fingerprint(violations),
        replacementText,
    };
}

}
};
__defs["domain/entry-lifecycle.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"canonicalObjectTitle",{enumerable:true,configurable:true,get:()=>__require("domain/object-identity.js")["canonicalObjectTitle"]});
Object.defineProperty(__scope,"rewriteObjectReferences",{enumerable:true,configurable:true,get:()=>__require("domain/object-identity.js")["rewriteObjectReferences"]});
Object.defineProperty(__scope,"dedupeStrongStateRows",{enumerable:true,configurable:true,get:()=>__require("domain/state-text.js")["dedupeStrongStateRows"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
with(__scope){
Object.defineProperty(exports,"normalizeEntryLifecycleValue",{enumerable:true,configurable:true,get:()=>normalizeEntryLifecycleValue});
Object.defineProperty(exports,"entryState",{enumerable:true,configurable:true,get:()=>entryState});
Object.defineProperty(exports,"isLegacyEntryLifecycle",{enumerable:true,configurable:true,get:()=>isLegacyEntryLifecycle});
Object.defineProperty(exports,"isEntryLifecycleHidden",{enumerable:true,configurable:true,get:()=>isEntryLifecycleHidden});
Object.defineProperty(exports,"isEntryParticipationPaused",{enumerable:true,configurable:true,get:()=>isEntryParticipationPaused});
Object.defineProperty(exports,"visibleStateRows",{enumerable:true,configurable:true,get:()=>visibleStateRows});
Object.defineProperty(exports,"applyEntryLifecycleDirectives",{enumerable:true,configurable:true,get:()=>applyEntryLifecycleDirectives});
Object.defineProperty(exports,"finalizeSettlingEntries",{enumerable:true,configurable:true,get:()=>finalizeSettlingEntries});
Object.defineProperty(exports,"garbageCollectLegacyEntryTombstones",{enumerable:true,configurable:true,get:()=>garbageCollectLegacyEntryTombstones});
function stringList(value, limit = 80, itemLimit = 180) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => safeText(item, itemLimit).trim()).filter(Boolean))].slice(0, limit);
}
/** 旧 absorbed/retired 只作为迁移输入；任何新写入统一收敛为 settling。 */
function normalizeEntryLifecycleValue(value, previous) {
    const source = value && typeof value === 'object' ? value : {};
    const rawState = safeText(source.state ?? previous?.state, 24).trim();
    const rawAction = safeText(source.action ?? previous?.action, 24).trim();
    const action = rawAction === 'absorb' || rawState === 'absorbed'
        ? 'absorb'
        : rawAction === 'retire' || rawState === 'retired'
            ? 'retire'
            : undefined;
    if (rawState !== 'settling' && rawState !== 'absorbed' && rawState !== 'retired')
        return undefined;
    if (!action)
        return undefined;
    return {
        state: 'settling',
        legacyState: rawState === 'absorbed' || rawState === 'retired' ? rawState : previous?.legacyState,
        action,
        targetTable: safeText(source.targetTable ?? previous?.targetTable, 100).trim() || undefined,
        targetId: safeText(source.targetId ?? previous?.targetId, 160).trim() || undefined,
        targetTitle: safeText(source.targetTitle ?? previous?.targetTitle, 240).trim() || undefined,
        trigger: safeText(source.trigger ?? previous?.trigger, 40).trim() || undefined,
        triggerEventIds: stringList(source.triggerEventIds ?? previous?.triggerEventIds, 20, 180),
        note: safeText(source.note ?? previous?.note, 1200).trim(),
        reason: safeText(source.reason ?? previous?.reason, 800).trim(),
        updatedAt: safeText(source.updatedAt ?? previous?.updatedAt ?? nowIso(), 80).trim() || nowIso(),
    };
}
function entryState(row) {
    return row?.entryLifecycle ? 'settling' : 'active';
}
/** 仅用于识别尚未经过归一化的 1.3.4 旧数据。 */
function isLegacyEntryLifecycle(row) {
    const state = safeText(row?.entryLifecycle?.state, 24);
    return state === 'absorbed' || state === 'retired';
}
/** 兼容旧 API：旧墓碑在归一化前隐藏；新 settling 条目保持可见但暂停参与。 */
function isEntryLifecycleHidden(row) {
    return isLegacyEntryLifecycle(row);
}
function isEntryParticipationPaused(row) {
    return entryState(row) === 'settling' || isLegacyEntryLifecycle(row);
}
function visibleStateRows(rows) {
    return (rows ?? []).filter((row) => !isEntryLifecycleHidden(row));
}
function protectedRow(row, focusObjectId) {
    return row.source === 'manual'
        || row.locked
        || row.lockMode === 'all'
        || row.lockMode === 'base'
        || row.id === focusObjectId;
}
function rowEventIds(row) {
    return [...new Set([...(row.eventIds ?? []), row.eventId].map((item) => safeText(item, 180).trim()).filter(Boolean))];
}
function appendUniqueText(value, text, limit = 60) {
    const current = Array.isArray(value) ? value.map((item) => safeText(item, 1200).trim()).filter(Boolean) : [];
    return [...new Set([...current, safeText(text, 1200).trim()].filter(Boolean))].slice(-limit);
}
function findTarget(snapshot, directive) {
    const targetTable = safeText(directive.targetTable, 100).trim();
    const targetTitle = canonicalObjectTitle(safeText(directive.targetTitle, 240));
    if (!targetTable || !targetTitle)
        return undefined;
    const matches = (snapshot[targetTable] ?? []).filter((row) => entryState(row) === 'active' && canonicalObjectTitle(row.title) === targetTitle);
    return matches.length === 1 ? { tableKey: targetTable, row: matches[0] } : undefined;
}
/**
 * 只执行插件产生的结构化指令。active 只能进入 settling；restore 只能在物理删除前恢复同一 ID。
 */
function applyEntryLifecycleDirectives(snapshot, directives, registry, focusObjectId) {
    const tables = normalizeTableRegistry(registry);
    const next = structuredClone(snapshot);
    const applied = [];
    const ignored = [];
    for (const directive of directives ?? []) {
        const source = (next[directive.sourceTable] ?? []).find((row) => row.id === directive.sourceId);
        if (!source || protectedRow(source, focusObjectId)) {
            ignored.push(directive.sourceId);
            continue;
        }
        if (directive.action === 'restore') {
            if (entryState(source) !== 'settling') {
                ignored.push(source.id);
                continue;
            }
            delete source.entryLifecycle;
            if (/^(待结算|已并入|已退出|absorbed|retired)/i.test(source.status))
                source.status = 'active';
            source.updatedAt = nowIso();
            applied.push(source.id);
            continue;
        }
        // 新状态机禁止 active -> physical delete；这里只能打开 settling。
        if (entryState(source) !== 'active') {
            ignored.push(source.id);
            continue;
        }
        const note = safeText(directive.note, 1200).trim();
        const reason = safeText(directive.reason, 800).trim();
        if (directive.action === 'absorb') {
            const target = findTarget(next, directive);
            if (!target || target.row.id === source.id || target.row.locked || target.row.lockMode === 'all') {
                ignored.push(source.id);
                continue;
            }
            const memory = note || `${source.title}不再作为独立条目保留，其有效后果已并入${target.row.title}。`;
            target.row.fields ||= {};
            target.row.fields.absorbedMemory = appendUniqueText(target.row.fields.absorbedMemory, memory);
            target.row.factIds = [...new Set([...(target.row.factIds ?? []), ...(source.factIds ?? [])])];
            target.row.eventIds = [...new Set([
                    ...(target.row.eventIds ?? (target.row.eventId ? [target.row.eventId] : [])),
                    ...(source.eventIds ?? (source.eventId ? [source.eventId] : [])),
                ])];
            target.row.eventId ||= target.row.eventIds[0];
            target.row.recall ||= { any: [], all: [], exclude: [] };
            target.row.recall.any = [...new Set([...(target.row.recall.any ?? []), source.title, ...(source.keywords ?? [])])].slice(0, 32);
            target.row.updatedAt = nowIso();
            source.entryLifecycle = {
                state: 'settling',
                action: 'absorb',
                targetTable: target.tableKey,
                targetId: target.row.id,
                targetTitle: target.row.title,
                note: memory,
                reason,
                updatedAt: nowIso(),
            };
            source.status = `待结算：并入${target.row.title}`;
            source.updatedAt = nowIso();
            applied.push(source.id);
            continue;
        }
        if (directive.action === 'retire') {
            const terminalText = `${source.status} ${source.content} ${note} ${reason}`;
            const terminal = /(已出售|已赠出|已消耗|耗尽|已损毁|已销毁|已丢弃|已遗失|已结束|已关闭|已失效|已解决|已解散|已退出|已离开场景|已离开当前场景|预退出|不再有效|无后续价值|sold|consumed|destroyed|discarded|lost|closed|ended|resolved|retired|obsolete)/i.test(terminalText);
            if (!terminal) {
                ignored.push(source.id);
                continue;
            }
            source.entryLifecycle = {
                state: 'settling',
                action: 'retire',
                trigger: safeText(directive.trigger, 40).trim() || undefined,
                triggerEventIds: stringList(directive.triggerEventIds, 20, 180),
                note: note || `${source.title}已失去独立追踪价值。`,
                reason,
                updatedAt: nowIso(),
            };
            source.status = '待结算：退出独立条目';
            source.updatedAt = nowIso();
            applied.push(source.id);
        }
    }
    const finalized = dedupeStrongStateRows(next, tables);
    // 去重可能把同 ID 的旧视图状态文本重新合回结果；恢复必须在最终快照上原子清除待结算痕迹。
    if (applied.length) {
        const restoredIds = new Set((directives ?? [])
            .filter((item) => item.action === 'restore' && applied.includes(item.sourceId))
            .map((item) => item.sourceId));
        for (const table of tables) {
            for (const row of finalized[table.key] ?? []) {
                if (!restoredIds.has(row.id))
                    continue;
                delete row.entryLifecycle;
                if (!safeText(row.status, 120).trim()
                    || /^(待结算|已并入|已退出|absorbed|retired)/i.test(row.status)) {
                    row.status = 'active';
                }
                row.updatedAt = nowIso();
            }
        }
    }
    return {
        snapshot: finalized,
        appliedSourceIds: [...new Set(applied)],
        ignoredSourceIds: [...new Set(ignored)],
    };
}
function findLifecycleTarget(snapshot, row) {
    const lifecycle = row.entryLifecycle;
    if (!lifecycle || lifecycle.action !== 'absorb')
        return undefined;
    const rows = lifecycle.targetTable ? snapshot[lifecycle.targetTable] ?? [] : [];
    return rows.find((candidate) => candidate.id === lifecycle.targetId)
        ?? rows.find((candidate) => canonicalObjectTitle(candidate.title) === canonicalObjectTitle(lifecycle.targetTitle));
}
function targetHasDistribution(snapshot, row, eventId) {
    if (row.entryLifecycle?.action === 'retire') {
        const sourceFactIds = new Set(row.factIds ?? []);
        for (const rows of Object.values(snapshot)) {
            if (!Array.isArray(rows))
                continue;
            for (const candidate of rows) {
                if (!candidate || candidate.id === row.id || entryState(candidate) !== 'active')
                    continue;
                const fields = candidate.fields ?? {};
                const hasDurableMemory = ['recentHistory', 'solidifiedHistory', 'absorbedMemory']
                    .some((key) => Array.isArray(fields[key]) && fields[key].some((item) => safeText(item, 1200).trim()));
                if (!hasDurableMemory)
                    continue;
                const sameEvent = rowEventIds(candidate).includes(eventId);
                const carriesSourceFact = (candidate.factIds ?? []).some((id) => sourceFactIds.has(id));
                if (sameEvent || carriesSourceFact)
                    return true;
            }
        }
        // retire 不带目标宿主；若没有另一个活动对象明确承接总结，必须保留原容器。
        return false;
    }
    if (row.entryLifecycle?.action !== 'absorb')
        return false;
    const target = findLifecycleTarget(snapshot, row);
    if (!target)
        return false;
    const absorbed = Array.isArray(target.fields?.absorbedMemory)
        ? target.fields.absorbedMemory.map((item) => safeText(item, 1200).trim())
        : [];
    const note = safeText(row.entryLifecycle.note, 1200).trim();
    const sourceFacts = new Set(row.factIds ?? []);
    const targetHasFacts = [...sourceFacts].every((id) => (target.factIds ?? []).includes(id));
    return (!note || absorbed.includes(note)) && targetHasFacts;
}
/**
 * 总结覆盖审计。只有 settling 可以物理删除；summary coverage 必须先写入事务副本再调用本函数。
 */
function finalizeSettlingEntries(snapshot, options) {
    const tables = normalizeTableRegistry(options.registry);
    const next = structuredClone(snapshot);
    const coveredFactIds = new Set(stringList(options.sourceFactIds, 200, 180));
    for (const fact of options.internalFacts ?? []) {
        if (fact.consumedBySmallSummaryId || fact.solidifiedByLargeSummaryId)
            coveredFactIds.add(fact.factId);
    }
    const retained = [];
    const deleted = [];
    // 先基于同一个事务副本做完整判定，再统一删除，支持源和宿主同批级联结算。
    for (const table of tables) {
        for (const row of next[table.key] ?? []) {
            if (entryState(row) !== 'settling')
                continue;
            const linkedByEvent = rowEventIds(row).includes(options.eventId);
            const rowFacts = stringList(row.factIds, 200, 180);
            const linkedByFacts = rowFacts.some((id) => coveredFactIds.has(id));
            const allKnownFactsCovered = rowFacts.length > 0 && rowFacts.every((id) => coveredFactIds.has(id));
            const sceneBoundarySettlement = row.entryLifecycle?.trigger === 'scene-boundary'
                && (row.entryLifecycle.triggerEventIds ?? []).includes(options.eventId);
            // 事件容器和依附事件终局的对象仍要求事件关闭；场景边界临时容器则按自身承接状态退出。
            const lifecycleCanClose = options.eventClosed || sceneBoundarySettlement;
            const ready = !protectedRow(row, options.focusObjectId)
                && lifecycleCanClose
                && (linkedByEvent || linkedByFacts)
                && allKnownFactsCovered
                && targetHasDistribution(next, row, options.eventId);
            if (!ready) {
                retained.push(row.id);
                continue;
            }
            deleted.push({
                tableKey: table.key,
                id: row.id,
                title: row.title,
                targetId: row.entryLifecycle?.action === 'absorb' ? row.entryLifecycle.targetId : undefined,
            });
        }
    }
    if (deleted.length) {
        const deletedIds = new Set(deleted.map((item) => item.id));
        const remap = new Map();
        for (const item of deleted) {
            if (item.targetId && !deletedIds.has(item.targetId))
                remap.set(item.id, item.targetId);
        }
        for (const table of tables)
            next[table.key] = (next[table.key] ?? []).filter((row) => !deletedIds.has(row.id));
        rewriteObjectReferences(next, remap, deletedIds);
    }
    return {
        snapshot: dedupeStrongStateRows(next, tables),
        deletedRowIds: [...new Set(deleted.map((item) => item.id))],
        deletedEntries: deleted,
        retainedRowIds: [...new Set(retained)],
    };
}
/** 幂等迁移：旧 absorbed/retired 先转换为 settling，再按已有覆盖事实进入正常结算。 */
function garbageCollectLegacyEntryTombstones(snapshot, internalFacts, registry, focusObjectId) {
    const tables = normalizeTableRegistry(registry);
    const hasLegacyRows = tables.some((table) => (snapshot[table.key] ?? []).some((row) => {
        const state = safeText(row.entryLifecycle?.state, 24);
        return state === 'absorbed' || state === 'retired' || Boolean(row.entryLifecycle?.legacyState);
    }));
    // 没有旧墓碑时必须保持引用和序列化内容完全不变；迁移扫描不能顺带重排正常快照。
    if (!hasLegacyRows)
        return { snapshot, deletedRowIds: [] };
    const next = structuredClone(snapshot);
    const factsById = new Map((internalFacts ?? []).map((fact) => [fact.factId, fact]));
    const deleted = new Set();
    for (const table of tables) {
        for (const row of next[table.key] ?? []) {
            const rawState = safeText(row.entryLifecycle?.state, 24);
            const legacyState = row.entryLifecycle?.legacyState || (rawState === 'absorbed' || rawState === 'retired' ? rawState : undefined);
            if (!legacyState)
                continue;
            row.entryLifecycle = normalizeEntryLifecycleValue({ ...row.entryLifecycle, state: legacyState }, row.entryLifecycle);
            if (!row.entryLifecycle || protectedRow(row, focusObjectId))
                continue;
            const rowFacts = stringList(row.factIds, 200, 180).map((id) => factsById.get(id)).filter((fact) => Boolean(fact));
            const allCovered = rowFacts.length > 0 && rowFacts.every((fact) => Boolean(fact.consumedBySmallSummaryId || fact.solidifiedByLargeSummaryId));
            const stillActive = rowFacts.some((fact) => fact.active);
            if (allCovered && !stillActive && targetHasDistribution(next, row))
                deleted.add(row.id);
        }
    }
    if (deleted.size) {
        for (const table of tables)
            next[table.key] = (next[table.key] ?? []).filter((row) => !deleted.has(row.id));
        rewriteObjectReferences(next, new Map(), deleted);
    }
    return { snapshot: dedupeStrongStateRows(next, tables), deletedRowIds: [...deleted] };
}

}
};
__defs["domain/event-profile.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"enabledTables",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["enabledTables"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
Object.defineProperty(__scope,"tableByRole",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["tableByRole"]});
Object.defineProperty(__scope,"isEntryParticipationPaused",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["isEntryParticipationPaused"]});
with(__scope){
Object.defineProperty(exports,"buildEventProfiles",{enumerable:true,configurable:true,get:()=>buildEventProfiles});
function unique(values, limit = 80) {
    return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, limit);
}
function eventIdsOf(row) {
    return unique([...(row.eventIds ?? []), row.eventId ?? '']);
}
function normalizeEntityReference(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}
function rowReferenceKeys(row) {
    return unique([row.title, ...(row.keywords ?? [])]
        .map(normalizeEntityReference)
        .filter((value) => value.length >= 2));
}
function factClosed(fact) {
    return !fact.active || /已结束|已完成|已关闭|已结算|完成|结束|关闭|closed|completed|ended|settled/i.test(String(fact.status || ''));
}
function rowClosed(row) {
    return Boolean(row && /已结束|已完成|已关闭|已结算|完成|结束|关闭|closed|completed|ended|settled/i.test(`${row.status} ${row.content}`));
}
function summaryEventId(summary) {
    return String(summary.eventId || summary.eventIds?.[0] || '').trim();
}
function buildEventProfiles(snapshot, facts, smallSummaries, largeSummaries, registry) {
    const tables = normalizeTableRegistry(registry);
    const eventTable = tableByRole(tables, 'events', false);
    const eventRows = eventTable ? (snapshot?.[eventTable.key] ?? []) : [];
    const eventRowById = new Map();
    for (const row of eventRows) {
        eventRowById.set(row.id, row);
        for (const eventId of eventIdsOf(row))
            eventRowById.set(eventId, row);
    }
    const ids = new Set();
    facts.filter((fact) => fact.storageClass !== 'episodic')
        .forEach((fact) => ids.add(String(fact.eventId || '').trim()));
    eventRows.forEach((row) => {
        const linked = eventIdsOf(row);
        (linked.length ? linked : [row.id]).forEach((id) => ids.add(String(id || '').trim()));
    });
    smallSummaries.forEach((summary) => ids.add(summaryEventId(summary)));
    largeSummaries.forEach((summary) => ids.add(summaryEventId(summary)));
    ids.delete('');
    const enabled = enabledTables(tables);
    const profiles = [];
    for (const eventId of ids) {
        const eventFacts = facts.filter((fact) => fact.storageClass !== 'episodic'
            && String(fact.eventId || '').trim() === eventId);
        const eventRow = eventRowById.get(eventId);
        // 新数据优先使用 eventIds；旧存档缺少该元数据时，只使用事实中明确列出的 relatedEntities 做精确回挂。
        // 不扫描正文、不进行模糊推断，避免把同名或背景对象错误接入事件。
        const explicitRelatedKeys = new Set(eventFacts
            .flatMap((fact) => fact.relatedEntities ?? [])
            .map(normalizeEntityReference)
            .filter((value) => value.length >= 2));
        const relatedEntries = [];
        const seenRelatedEntries = new Set();
        for (const table of enabled) {
            for (const row of snapshot?.[table.key] ?? []) {
                const linkedByEventId = eventIdsOf(row).includes(eventId) || row.id === eventId;
                const linkedByExplicitEntity = rowReferenceKeys(row).some((key) => explicitRelatedKeys.has(key));
                if (!linkedByEventId && !linkedByExplicitEntity)
                    continue;
                const relatedKey = `${table.key}:${row.id}`;
                if (seenRelatedEntries.has(relatedKey))
                    continue;
                seenRelatedEntries.add(relatedKey);
                relatedEntries.push({
                    id: row.id,
                    title: row.title,
                    table: table.name,
                    tableKey: table.key,
                    settling: isEntryParticipationPaused(row),
                });
            }
        }
        const small = smallSummaries.filter((summary) => summaryEventId(summary) === eventId && !summary.supersededBySmallSummaryId);
        const large = largeSummaries.filter((summary) => summaryEventId(summary) === eventId);
        const latestFact = [...eventFacts].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
        const latestSummary = [...large, ...small].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
        const updatedAt = [eventRow?.updatedAt, latestFact?.updatedAt, latestSummary?.createdAt].filter(Boolean).sort().at(-1) ?? '';
        const relatedEntities = unique([
            ...eventFacts.flatMap((fact) => fact.relatedEntities ?? []),
            ...relatedEntries.map((entry) => entry.title),
        ], 24);
        const currentResults = unique(eventFacts.flatMap((fact) => fact.occurredFacts ?? []).filter(Boolean), 8);
        const allFactsClosed = eventFacts.length > 0 && eventFacts.every(factClosed);
        const closed = Boolean(eventRow ? rowClosed(eventRow) : allFactsClosed || small.some((summary) => summary.eventClosed));
        profiles.push({
            eventId,
            title: eventRow?.title || latestFact?.title || latestSummary?.title || eventId,
            eventEntryId: eventRow?.id,
            status: closed ? 'closed' : 'active',
            factCount: eventFacts.length,
            messageCount: unique(eventFacts.flatMap((fact) => fact.sourceMessageIds ?? []), 10000).length,
            relatedEntities,
            relatedEntries,
            smallSummaryCount: small.length,
            hasLargeSummary: large.length > 0,
            settlingEntryCount: relatedEntries.filter((entry) => entry.settling).length,
            contentChars: eventFacts.reduce((sum, fact) => sum + (fact.occurredFacts ?? []).join('').length + String(fact.content || '').length, 0)
                + small.reduce((sum, summary) => sum + summary.summary.length, 0)
                + large.reduce((sum, summary) => sum + summary.summary.length, 0),
            updatedAt,
            currentResults,
        });
    }
    return profiles.sort((a, b) => {
        if (a.status !== b.status)
            return a.status === 'active' ? -1 : 1;
        return String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.title.localeCompare(b.title);
    });
}

}
};
__defs["domain/fact-contract.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"hashText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["hashText"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
with(__scope){
Object.defineProperty(exports,"applyFactContractGate",{enumerable:true,configurable:true,get:()=>applyFactContractGate});
Object.defineProperty(exports,"FACT_STORAGE_CLASSES",{enumerable:true,configurable:true,get:()=>FACT_STORAGE_CLASSES});
Object.defineProperty(exports,"FACT_EVIDENCE_KINDS",{enumerable:true,configurable:true,get:()=>FACT_EVIDENCE_KINDS});
/**
 * 模块职责：在模型事实进入账本前，统一补齐准入、唯一主宿主、切面、保存层级与有效区间。
 * 维护边界：只依据模型已返回模块、稳定投影和插件上下文分类；不得补写剧情事实或猜测旧对象身份。
 */
const FACT_STORAGE_CLASSES = new Set(['working', 'episodic', 'event', 'durable']);
const FACT_EVIDENCE_KINDS = new Set(['confirmed', 'recorded', 'reported', 'uncertain']);

const FACET_BY_LAYER_KEY = {
    baseContent: 'identity',
    currentFacts: 'fact',
    currentStates: 'status',
    presentationStates: 'appearance',
    relationshipStates: 'relationship',
    abilityStates: 'ability',
    relatedObjects: 'relation',
    relatedEvents: 'event-link',
    recentHistory: 'history',
    solidifiedHistory: 'history',
};

const FACET_BY_MODULE = {
    MA_CORE: 'progress',
    MA_EVENT_RESULT: 'result',
    MA_EVENT_STATE: 'status',
    MA_EVENT_STATUS: 'status',
    MA_CHARACTER_IDENTITY: 'identity',
    MA_CHARACTER_FACT: 'fact',
    MA_CHARACTER_STATE: 'status',
    MA_CHARACTER_APPEARANCE: 'appearance',
    MA_CHARACTER_RELATION: 'relationship',
    MA_CHARACTER_ABILITY: 'ability',
    MA_ITEM_IDENTITY: 'identity',
    MA_ITEM_FACT: 'fact',
    MA_ITEM_STATE: 'status',
    MA_SCENE_IDENTITY: 'identity',
    MA_SCENE_FACT: 'fact',
    MA_SCENE_STATE: 'status',
    MA_REGION_IDENTITY: 'identity',
    MA_REGION_FACT: 'fact',
    MA_REGION_STATE: 'status',
    MA_GLOBAL_IDENTITY: 'identity',
    MA_GLOBAL_FACT: 'fact',
    MA_GLOBAL_STATE: 'status',
    MA_FOUNDATION_IDENTITY: 'rule',
    MA_FOUNDATION_FACT: 'rule',
    MA_FOUNDATION_STATE: 'status',
    MA_SPACETIME_STATE: 'spacetime',
};

function text(value, limit = 240) {
    return safeText(value, limit).trim();
}

function objectValue(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizedHostType(value) {
    const type = text(value, 100);
    if (!type)
        return '';
    const aliases = {
        event: 'events',
        character: 'characters',
        state: 'characters',
        item: 'items',
        scene: 'scenes',
        region: 'regions',
        location: 'regions',
        global: 'globalChanges',
        foundation: 'foundations',
        custom: 'customObjects',
        spacetime: 'spacetime',
        episode: 'episodic',
    };
    return aliases[type] || type;
}

function explicitEventId(source) {
    const direct = text(source.eventId ?? source.event_id, 160);
    if (direct)
        return direct;
    const type = normalizedHostType(source.type);
    const entity = text(source.entityId ?? source.entity_id, 160);
    return type === 'events' && entity ? entity : undefined;
}

function normalizeSubjectRef(value) {
    if (typeof value === 'string') {
        const id = text(value, 180);
        return id ? { kind: 'stable', id } : undefined;
    }
    const source = objectValue(value);
    const id = text(source.id, 180);
    const label = text(source.label ?? source.name, 240);
    const kind = source.kind === 'weak' || (!id && label) ? 'weak' : 'stable';
    if (!id && !label)
        return undefined;
    return { kind, id: id || undefined, label: label || undefined };
}

function inferFacet(source, view) {
    const explicit = text(source.facet, 80);
    if (explicit)
        return explicit;
    const moduleTag = text(view.moduleTag, 80);
    if (FACET_BY_MODULE[moduleTag])
        return FACET_BY_MODULE[moduleTag];
    const layerKey = text(view.layerKey, 100);
    if (FACET_BY_LAYER_KEY[layerKey])
        return FACET_BY_LAYER_KEY[layerKey];
    const role = normalizedHostType(view.semanticRole ?? source.type);
    if (role === 'events')
        return view.layerKind === 'status' ? 'status' : 'progress';
    if (role === 'spacetime')
        return 'spacetime';
    return view.layerKind === 'status' ? 'status' : 'fact';
}

function inferStorageClass(source, hostType, facet, eventId) {
    const explicit = text(source.storageClass ?? source.storage_class, 40);
    if (FACT_STORAGE_CLASSES.has(explicit))
        return explicit;
    if (hostType === 'episodic')
        return 'episodic';
    if (hostType === 'events' || (eventId && hostType === 'legacy'))
        return 'event';
    if (hostType === 'foundations' || facet === 'rule')
        return 'durable';
    if (facet === 'identity' && !['scenes', 'spacetime'].includes(hostType))
        return 'durable';
    if (['regions', 'globalChanges'].includes(hostType) && facet !== 'status')
        return 'durable';
    return 'working';
}

function inferPrimaryHost(source, view, factId, eventId) {
    const explicit = objectValue(source.primaryHost ?? source.primary_host);
    const explicitType = normalizedHostType(explicit.type ?? explicit.kind);
    const explicitId = text(explicit.id ?? explicit.hostId ?? explicit.host_id, 180);
    if (explicitType && explicitId)
        return { type: explicitType, id: explicitId };
    const table = text(view.table, 100);
    const rowId = text(view.rowId, 180);
    const role = normalizedHostType(view.semanticRole ?? source.type);
    if (rowId)
        return { type: role || table || 'customObjects', id: rowId };
    if (role === 'events' && eventId)
        return { type: 'events', id: eventId };
    // 旧事实没有稳定投影时不依据标题或 related_entities 猜对象，只挂入可审计的 legacy 宿主。
    return { type: 'legacy', id: factId };
}

function inferSubjectRef(source, view, host) {
    const explicit = normalizeSubjectRef(source.subjectRef ?? source.subject_ref);
    if (explicit)
        return explicit;
    const label = text(view.objectTitle, 240);
    if (host.type !== 'legacy' && host.type !== 'episodic')
        return { kind: 'stable', id: host.id, label: label || undefined };
    const related = Array.isArray(source.relatedEntities ?? source.related_entities)
        ? source.relatedEntities ?? source.related_entities
        : [];
    const weakLabel = text(related[0] || label || source.title, 240);
    return weakLabel ? { kind: 'weak', label: weakLabel } : undefined;
}

const CHARACTER_DURABLE_FACETS = new Set(['identity', 'relationship', 'ability']);
const CHARACTER_SUSTAINED_EFFECT_RE = /(承诺|约定|委托|雇佣|契约|债务|欠款|交易|交付|赠予|给予|取得|持有|保管|归还|偷取|抢夺|冲突|敌对|追捕|威胁|攻击|战斗|伤害|救援|治疗|保护|背叛|结盟|加入|离开队伍|告知|透露|情报|秘密|线索|证词|警告|邀请|命令|许可|拒绝|关系|好感|信任|仇恨|亲属|同伴|导师|下属|promise|contract|debt|trade|deliver|give|take|hold|conflict|attack|fight|injur|rescue|heal|protect|betray|alliance|inform|reveal|clue|secret|relationship)/i;

function characterAdmissionQualified(source, facet) {
    if (CHARACTER_DURABLE_FACETS.has(facet))
        return true;
    const evidence = [
        source.content,
        source.title,
        ...(Array.isArray(source.occurred) ? source.occurred : []),
        ...(Array.isArray(source.related_entities) ? source.related_entities : []),
    ].map((item) => text(item, 1200)).filter(Boolean).join(' ');
    return CHARACTER_SUSTAINED_EFFECT_RE.test(evidence);
}

/**
 * 新角色必须具备独立身份、关系/能力，或产生可持续影响。
 * 一句普通台词、站位、外观和即时反应仍可留作情景事实，但不得生成角色工作卡。
 */
function applyObjectAdmission(source, host, facet, storageClass, view, factId, options) {
    const unqualifiedNewCharacter = host.type === 'characters'
        && options.existingObject !== true
        && !characterAdmissionQualified(source, facet);
    if (!unqualifiedNewCharacter) {
        return {
            host,
            storageClass,
            view,
            admission: {
                admitted: true,
                objectQualified: options.existingObject === true || host.type !== 'characters' || facet !== 'appearance',
                projectionAllowed: true,
                reason: 'contract-route',
            },
        };
    }
    return {
        host: { type: 'episodic', id: factId },
        storageClass: 'episodic',
        view: undefined,
        admission: {
            admitted: true,
            objectQualified: false,
            projectionAllowed: false,
            reason: facet === 'appearance'
                ? 'appearance-alone-does-not-create-character'
                : 'no-sustained-character-effect',
        },
    };
}

function applyFactContractGate(value, options = {}) {
    const source = objectValue(value);
    const factId = text(source.factId ?? source.fact_id ?? source.id, 180)
        || `fact_${hashText(`${source.title || ''}|${source.content || ''}|${options.index || 0}`)}`;
    const eventId = explicitEventId(source);
    const view = source.view && typeof source.view === 'object' ? structuredClone(source.view) : undefined;
    const facet = inferFacet(source, view ?? {});
    const inferredHost = inferPrimaryHost(source, view ?? {}, factId, eventId);
    const inferredStorage = inferStorageClass(source, inferredHost.type, facet, eventId);
    const admitted = applyObjectAdmission(source, inferredHost, facet, inferredStorage, view, factId, options);
    const timeRange = objectValue(source.timeRange ?? source.time_range);
    const operation = text(source.operation, 40);
    const sourceMessageId = text(options.sourceMessageId, 200);
    const validFrom = text(source.validFrom ?? source.valid_from ?? timeRange.start, 200) || sourceMessageId || undefined;
    const validTo = text(source.validTo ?? source.valid_to ?? timeRange.end, 200)
        || (['close'].includes(operation) ? sourceMessageId || undefined : undefined);
    const evidence = text(source.evidenceKind ?? source.evidence_kind ?? source.confidence, 40);
    return {
        factId,
        eventId,
        subjectRef: inferSubjectRef(source, admitted.view ?? view ?? {}, admitted.host),
        primaryHost: admitted.host,
        facet,
        storageClass: admitted.storageClass,
        validFrom,
        validTo,
        supersedesFactId: text(source.supersedesFactId ?? source.supersedes_fact_id, 180) || undefined,
        supersededByFactId: text(source.supersededByFactId ?? source.superseded_by_fact_id, 180) || undefined,
        evidenceKind: FACT_EVIDENCE_KINDS.has(evidence) ? evidence : 'uncertain',
        projectionHint: admitted.view ? structuredClone(admitted.view) : undefined,
        view: admitted.view,
        admission: admitted.admission,
    };
}

}
};
__defs["domain/facts.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"hashText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["hashText"]});
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"isPurePassiveObserverText",{enumerable:true,configurable:true,get:()=>__require("domain/observer.js")["isPurePassiveObserverText"]});
Object.defineProperty(__scope,"applyFactContractGate",{enumerable:true,configurable:true,get:()=>__require("domain/fact-contract.js")["applyFactContractGate"]});
with(__scope){
Object.defineProperty(exports,"normalizeFacts",{enumerable:true,configurable:true,get:()=>normalizeFacts});
Object.defineProperty(exports,"filterPassiveObserverFacts",{enumerable:true,configurable:true,get:()=>filterPassiveObserverFacts});
Object.defineProperty(exports,"normalizeFactPackage",{enumerable:true,configurable:true,get:()=>normalizeFactPackage});
/**
 * 模块职责：归一化模型返回的事实包与事实操作。
 * 维护边界：只整理已显影事实，不在领域层补写隐私、隐藏关系、能力或未来结果。
 */
const OPERATIONS = new Set(['create', 'update', 'append', 'close', 'supersede']);
const CONFIDENCE = new Set(['confirmed', 'recorded', 'reported', 'uncertain']);
function list(value, limit = 24, itemLimit = 500) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => safeText(item, itemLimit).trim()).filter(Boolean))].slice(0, limit);
}
function normalizeTimeRange(value) {
    const source = value && typeof value === 'object' ? value : {};
    return { start: safeText(source.start, 120).trim() || undefined, end: safeText(source.end, 120).trim() || undefined, label: safeText(source.label, 240).trim() || undefined };
}
function normalizeFactView(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const table = safeText(source.table, 100).trim();
    const rowId = safeText(source.rowId, 160).trim();
    const objectTitle = safeText(source.objectTitle, 240).trim();
    if (!table || !rowId || !objectTitle)
        return undefined;
    const relocation = source.relocation && typeof source.relocation === 'object' ? {
        id: safeText(source.relocation.id, 160).trim(),
        title: safeText(source.relocation.title, 240).trim(),
        fromTable: safeText(source.relocation.fromTable, 100).trim(),
        toTable: safeText(source.relocation.toTable, 100).trim(),
    } : undefined;
    return {
        table,
        rowId,
        objectTitle,
        semanticRole: safeText(source.semanticRole, 80).trim(),
        layerKind: safeText(source.layerKind, 40).trim(),
        layerKey: safeText(source.layerKey, 100).trim() || undefined,
        layerType: safeText(source.layerType, 40).trim() || undefined,
        arrayOperation: safeText(source.arrayOperation, 24).trim() || undefined,
        value: safeText(source.value, 6000).trim(),
        keywords: list(source.keywords, 24, 100),
        eventName: safeText(source.eventName, 240).trim(),
        eventClosed: source.eventClosed === true,
        relatedObjects: list(source.relatedObjects, 40, 240),
        moduleTag: safeText(source.moduleTag, 80).trim(),
        relocation: relocation?.id && relocation.fromTable && relocation.toTable ? relocation : undefined,
        baseRevisionStatement: safeText(source.baseRevisionStatement, 1200).trim() || undefined,
    };
}
function normalizeFacts(value, options = {}) {
    if (!Array.isArray(value))
        return [];
    return value.map((item) => item && typeof item === 'object' ? item : {})
        .map((item, index) => {
        const operation = safeText(item.operation, 40).trim();
        const confidence = safeText(item.confidence, 40).trim();
        const entityId = safeText(item.entityId ?? item.entity_id, 160).trim();
        const title = safeText(item.title, 240).trim();
        const content = safeText(item.content, 6000).trim();
        const id = safeText(item.factId ?? item.fact_id ?? item.id, 160).trim() || `fact_${hashText(`${entityId}|${title}|${content}|${index}`)}`;
        const occurred = list(item.occurred ?? item.occurredFacts ?? (content ? [content] : []), 30, 1000);
        const unresolved = list(item.unresolved ?? item.unresolvedItems, 30, 1000);
        const view = normalizeFactView(item.view);
        const contract = applyFactContractGate({
            ...item,
            factId: id,
            type: safeText(item.type, 80).trim() || 'fact',
            entityId: entityId || undefined,
            eventId: safeText(item.eventId ?? item.event_id, 160).trim() || undefined,
            title: title || `事实 ${index + 1}`,
            content: content || occurred.join('；'),
            confidence: CONFIDENCE.has(confidence) ? confidence : 'uncertain',
            view,
        }, {
            index,
            sourceMessageId: options.sourceMessageId,
            existingObject: item.admission?.objectQualified === true,
        });
        return {
            id,
            factId: id,
            type: safeText(item.type, 80).trim() || 'fact',
            entityId: entityId || undefined,
            eventId: contract.eventId,
            title: title || `事实 ${index + 1}`,
            content: content || occurred.join('；'),
            occurred,
            unresolved,
            status: safeText(item.status, 120).trim() || 'active',
            timeRange: normalizeTimeRange(item.timeRange ?? item.time_range),
            relatedEntities: list(item.relatedEntities ?? item.related_entities, 30, 240),
            keywords: list(item.keywords, 24, 100),
            operation: OPERATIONS.has(operation) ? operation : 'update',
            confidence: CONFIDENCE.has(confidence) ? confidence : 'uncertain',
            evidenceKind: contract.evidenceKind,
            subjectRef: contract.subjectRef,
            primaryHost: contract.primaryHost,
            facet: contract.facet,
            storageClass: contract.storageClass,
            validFrom: contract.validFrom,
            validTo: contract.validTo,
            supersedesFactId: contract.supersedesFactId,
            supersededByFactId: contract.supersededByFactId,
            projectionHint: contract.projectionHint,
            admission: contract.admission,
            view: contract.view,
        };
    })
        .filter((fact) => fact.content)
        .slice(0, 80);
}
/** 模型即使误报，也不允许纯围观、喝彩、议论及其附属物进入内部活跃事实层。 */
function filterPassiveObserverFacts(facts) {
    return facts.filter((fact) => {
        const text = [
            fact.type, fact.title, fact.content, fact.status,
            ...(fact.occurred ?? []), ...(fact.unresolved ?? []),
            ...(fact.relatedEntities ?? []), ...fact.keywords,
        ].join(' ');
        return !isPurePassiveObserverText(text);
    });
}
function normalizeFactPackage(value, sourceMessageKey) {
    return {
        schemaVersion: 3,
        sourceMessageKey,
        turnSummary: safeText(value.turnSummary, 4000).trim(),
        facts: filterPassiveObserverFacts(normalizeFacts(value.facts, { sourceMessageId: sourceMessageKey })),
        createdAt: nowIso(),
    };
}

}
};
__defs["domain/fixed-text.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
with(__scope){
Object.defineProperty(exports,"parseFixedTextBlocks",{enumerable:true,configurable:true,get:()=>parseFixedTextBlocks});
Object.defineProperty(exports,"fixedTextValues",{enumerable:true,configurable:true,get:()=>fixedTextValues});
Object.defineProperty(exports,"fixedTextValue",{enumerable:true,configurable:true,get:()=>fixedTextValue});
/**
 * 模块职责：解析模型返回的固定标签文本协议。
 * 维护边界：只处理文本边界、重复字段和续行；业务字段、对象身份与持久化由各领域模块负责。
 */
function normalizedMarker(value) {
    return value.trim().toUpperCase();
}
function appendField(block, key, value) {
    const current = block.fields.get(key) ?? [];
    block.fields.set(key, [...current, value]);
}
function appendContinuation(block, key, value) {
    const current = block.fields.get(key) ?? [];
    if (!current.length)
        return;
    const next = [...current];
    next[next.length - 1] = `${next[next.length - 1]}\n${value}`.trim();
    block.fields.set(key, next);
}
/**
 * 支持：英文/中文等号、英文/中文冒号、重复字段、多行续写、原文块。
 * 固定文本是提交协议而不是宽松标记提取：普通块必须用与起始标签配对的结束标签闭合。
 */
function parseFixedTextBlocks(raw, markers) {
    const source = safeText(raw, 240000).replace(/^\uFEFF/, '');
    const byStart = new Map(markers.map((item) => [normalizedMarker(item.start), item]));
    const byEnd = new Map(markers.map((item) => [normalizedMarker(item.end), item]));
    const blocks = [];
    let current = null;
    let definition = null;
    let lastKey = '';
    let rawLines = [];
    const flush = () => {
        if (!current)
            return;
        if (definition?.rawBody)
            current.raw = rawLines.join('\n').trim();
        blocks.push(current);
        current = null;
        definition = null;
        lastKey = '';
        rawLines = [];
    };
    source.split(/\r?\n/).forEach((sourceLine, index) => {
        const trimmed = sourceLine.trim();
        const markerKey = normalizedMarker(trimmed);
        // 原文块内只有自身结束标签具有结构意义；正文恰好包含其他协议标签时仍按原文保留。
        if (current && definition?.rawBody) {
            if (markerKey === normalizedMarker(definition.end)) {
                flush();
            }
            else {
                rawLines.push(sourceLine);
            }
            return;
        }
        const start = byStart.get(markerKey);
        if (start) {
            if (current && definition) {
                throw new Error(`第 ${current.line} 行开始的 ${definition.start} 未闭合，缺少 ${definition.end}`);
            }
            definition = start;
            current = { kind: start.kind, fields: new Map(), raw: '', line: index + 1 };
            return;
        }
        const end = byEnd.get(markerKey);
        if (end) {
            if (!current || !definition)
                throw new Error(`第 ${index + 1} 行出现未配对结束标签 ${end.end}`);
            if (markerKey !== normalizedMarker(definition.end)) {
                throw new Error(`第 ${current.line} 行开始的 ${definition.start} 结束标签不匹配，期望 ${definition.end}`);
            }
            flush();
            return;
        }
        if (!current || !definition)
            return;
        if (definition.rawBody) {
            rawLines.push(sourceLine);
            return;
        }
        if (!trimmed || /^```/.test(trimmed))
            return;
        const match = sourceLine.match(/^\s*([^=＝:：]+?)\s*[=＝:：]\s*(.*)$/);
        if (match) {
            lastKey = match[1].trim();
            if (lastKey)
                appendField(current, lastKey, match[2].trim());
            return;
        }
        if (lastKey)
            appendContinuation(current, lastKey, sourceLine.trim());
    });
    if (current && definition) {
        throw new Error(`第 ${current.line} 行开始的 ${definition.start} 未闭合，缺少 ${definition.end}`);
    }
    return blocks;
}
function fixedTextValues(block, ...keys) {
    const output = [];
    const seen = new Set();
    for (const key of keys) {
        for (const raw of block.fields.get(key) ?? []) {
            const value = safeText(raw, 12000).trim();
            if (!value || seen.has(value))
                continue;
            seen.add(value);
            output.push(value);
        }
    }
    return output;
}
function fixedTextValue(block, ...keys) {
    return fixedTextValues(block, ...keys).at(-1) ?? '';
}

}
};
__defs["domain/graph.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"DEFAULT_TABLE_REGISTRY",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["DEFAULT_TABLE_REGISTRY"]});
Object.defineProperty(__scope,"enabledTables",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["enabledTables"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
Object.defineProperty(__scope,"isEntryLifecycleHidden",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["isEntryLifecycleHidden"]});
with(__scope){
Object.defineProperty(exports,"buildRelationshipGraph",{enumerable:true,configurable:true,get:()=>buildRelationshipGraph});
Object.defineProperty(exports,"enrichRelationshipGraphWithEventProfiles",{enumerable:true,configurable:true,get:()=>enrichRelationshipGraphWithEventProfiles});
function nodeTypeFor(role) {
    if (role === 'characters' || role === 'state')
        return 'character';
    if (role === 'items' || role === 'skills')
        return 'item';
    if (role === 'events')
        return 'event';
    if (role === 'regions' || role === 'scenes' || role === 'spacetime' || role === 'globalChanges')
        return 'region';
    return null;
}
function compactLabel(value) {
    const text = String(value || '').trim();
    return text.length > 24 ? `${text.slice(0, 23)}…` : text;
}
function stringList(value) {
    return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}
function normalizeReference(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}
function rowAliases(row) {
    return [...new Set([row.title, ...(row.keywords ?? [])]
            .map(normalizeReference)
            .filter((value) => value.length >= 2))];
}
function relationText(row) {
    const fields = row.fields ?? {};
    return [row.title, row.content, row.status, ...row.keywords, ...stringList(fields.relationshipStates)]
        .join(' ')
        .toLowerCase();
}
function uniquePairKey(a, b, kind) {
    const [left, right] = [a, b].sort();
    return `${left}|${right}|${kind}`;
}
function referenceMatches(reference, aliases) {
    const normalized = normalizeReference(reference);
    if (!normalized)
        return false;
    return aliases.some((alias) => normalized === alias || normalized.includes(alias) || alias.includes(normalized));
}
function relationshipLineFor(row, aliases) {
    return stringList(row.fields?.relationshipStates)
        .find((line) => aliases.some((alias) => normalizeReference(line).includes(alias))) || '';
}
function edgeKindFor(target, relationshipLine) {
    if (relationshipLine)
        return 'relationship';
    if (target.type === 'event')
        return 'event';
    return 'object';
}
function edgeLabelFor(target, relationshipLine) {
    if (relationshipLine)
        return compactLabel(relationshipLine);
    if (target.type === 'event')
        return '参与事件';
    if (target.type === 'region')
        return '关联区域';
    if (target.type === 'item')
        return '关联物品';
    return '关联对象';
}
function buildRelationshipGraph(snapshot, scope = 'relations', customRegistry) {
    if (!snapshot)
        return { nodes: [], edges: [] };
    const registry = normalizeTableRegistry(customRegistry?.length ? customRegistry : DEFAULT_TABLE_REGISTRY);
    const nodes = [];
    const rowsByNode = new Map();
    const aliasesByNode = new Map();
    const roles = scope === 'relations'
        ? ['characters', 'state']
        : ['characters', 'state', 'items', 'events', 'regions', 'scenes', 'spacetime', 'globalChanges'];
    for (const table of enabledTables(registry).filter((item) => roles.includes(item.role))) {
        const type = nodeTypeFor(table.role);
        if (!type)
            continue;
        for (const row of snapshot[table.key] ?? []) {
            if (isEntryLifecycleHidden(row))
                continue;
            const id = `${table.key}:${row.id}`;
            nodes.push({
                id,
                label: String(row.title || '未命名').trim(),
                type,
                detail: row.content,
                status: row.status,
                existence: row.lifecycle?.existence,
                activity: row.lifecycle?.activity,
                memory: row.lifecycle?.memory,
            });
            rowsByNode.set(id, row);
            aliasesByNode.set(id, rowAliases(row));
        }
    }
    const edges = [];
    const seen = new Set();
    for (const source of nodes) {
        const row = rowsByNode.get(source.id);
        if (!row)
            continue;
        const relatedObjects = stringList(row.fields?.relatedObjects);
        const relatedEvents = stringList(row.fields?.relatedEvents);
        const relationshipStates = stringList(row.fields?.relationshipStates);
        const hasExplicitLinks = relatedObjects.length > 0 || relatedEvents.length > 0 || relationshipStates.length > 0;
        const legacyText = relationText(row);
        for (const target of nodes) {
            if (target.id === source.id)
                continue;
            if (scope === 'relations' && (source.type !== 'character' || target.type !== 'character'))
                continue;
            const targetAliases = aliasesByNode.get(target.id) ?? [];
            if (!targetAliases.length)
                continue;
            const relationshipLine = relationshipLineFor(row, targetAliases);
            const objectReference = relatedObjects.find((item) => referenceMatches(item, targetAliases)) || '';
            const eventReference = relatedEvents.find((item) => referenceMatches(item, targetAliases)) || '';
            const legacyMention = !hasExplicitLinks && targetAliases.some((alias) => legacyText.includes(alias));
            if (!relationshipLine && !objectReference && !eventReference && !legacyMention)
                continue;
            const kind = legacyMention ? 'legacy' : edgeKindFor(target, relationshipLine);
            const key = uniquePairKey(source.id, target.id, kind);
            if (seen.has(key))
                continue;
            seen.add(key);
            const evidence = relationshipLine || objectReference || eventReference || row.content;
            edges.push({
                id: `edge:${source.id}:${target.id}:${kind}`,
                source: source.id,
                target: target.id,
                label: legacyMention ? '旧记录关联' : edgeLabelFor(target, relationshipLine),
                detail: evidence,
                kind,
                explicit: !legacyMention,
            });
        }
    }
    return { nodes, edges };
}
/**
 * 将事件画像的明确事件—对象关联叠加到只读图谱。
 * 只生成派生节点/边，不写回快照，也不反向创建事实。
 */
function enrichRelationshipGraphWithEventProfiles(source, profiles) {
    const nodes = source.nodes.map((node) => ({ ...node }));
    const edges = source.edges.map((edge) => ({ ...edge }));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const edgePairs = new Set(edges.map((edge) => [edge.source, edge.target].sort().join('|')));
    const nodeForEntry = (tableKey, entryId) => nodeById.get(`${tableKey}:${entryId}`)
        ?? nodes.find((node) => node.id.endsWith(`:${entryId}`));
    for (const profile of profiles) {
        let eventNode = profile.eventEntryId
            ? nodes.find((node) => node.type === 'event' && node.id.endsWith(`:${profile.eventEntryId}`))
            : undefined;
        eventNode ??= nodes.find((node) => node.type === 'event' && (node.id.endsWith(`:${profile.eventId}`) || node.label === profile.title));
        if (!eventNode) {
            eventNode = {
                id: `event-profile:${profile.eventId}`,
                label: profile.title,
                type: 'event',
                detail: profile.currentResults.join('；') || '由已提交事实派生的事件画像',
                status: profile.status === 'closed' ? '已形成结果' : '进行中',
            };
            nodes.push(eventNode);
            nodeById.set(eventNode.id, eventNode);
        }
        for (const entry of profile.relatedEntries) {
            const target = nodeForEntry(entry.tableKey, entry.id);
            if (!target || target.id === eventNode.id)
                continue;
            const pair = [eventNode.id, target.id].sort().join('|');
            if (edgePairs.has(pair))
                continue;
            edgePairs.add(pair);
            edges.push({
                id: `event-profile-edge:${profile.eventId}:${target.id}`,
                source: eventNode.id,
                target: target.id,
                label: '事件关联',
                detail: `${target.label}参与或受到“${profile.title}”影响`,
                kind: 'event',
                explicit: true,
            });
        }
    }
    return { nodes, edges };
}

}
};
__defs["domain/history.js"]=function(exports,__require){
const __scope=Object.create(null);
with(__scope){
Object.defineProperty(exports,"firstInconsistentArtifactIndex",{enumerable:true,configurable:true,get:()=>firstInconsistentArtifactIndex});
function firstInconsistentArtifactIndex(chat, moduleName, identityAt, fingerprintAt) {
    return chat.findIndex((message, index) => {
        const artifact = message?.extra?.[moduleName];
        return Boolean(artifact &&
            (artifact.messageIndex !== index ||
                artifact.messageKey !== identityAt(index) ||
                artifact.sourceFingerprint !== fingerprintAt(index)));
    });
}

}
};
__defs["domain/host-control.js"]=function(exports,__require){
const __scope=Object.create(null);
with(__scope){
Object.defineProperty(exports,"resolveHostControl",{enumerable:true,configurable:true,get:()=>resolveHostControl});
function resolveHostControl(settings) {
    const managed = Boolean(settings.enabled && settings.hostControl?.enabled !== false);
    return {
        managed,
        audit: Boolean(managed && settings.auditEnabled),
        lorebook: Boolean(managed && settings.lorebookSync),
        vector: Boolean(managed && settings.hostControl?.vector !== false),
        recursion: Boolean(managed && settings.hostControl?.recursion !== false),
    };
}

}
};
__defs["domain/incremental-settlement.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"enabledTables",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["enabledTables"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
Object.defineProperty(__scope,"isEntryParticipationPaused",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["isEntryParticipationPaused"]});
Object.defineProperty(__scope,"tableByRole",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["tableByRole"]});
Object.defineProperty(__scope,"linkedTargetRoles",{enumerable:true,configurable:true,get:()=>__require("domain/table-link-rules.js")["linkedTargetRoles"]});
with(__scope){
Object.defineProperty(exports,"deriveSpacetimeChange",{enumerable:true,configurable:true,get:()=>deriveSpacetimeChange});
Object.defineProperty(exports,"deriveSceneBoundary",{enumerable:true,configurable:true,get:()=>deriveSceneBoundary});
Object.defineProperty(exports,"deriveIncrementalSettlementDirectives",{enumerable:true,configurable:true,get:()=>deriveIncrementalSettlementDirectives});
const CLOSED_STATUS_RE = /(已完成|完成|已结束|结束|已关闭|关闭|已解决|解决|已归档|归档|closed|completed|resolved|ended|archived)/i;
const ITEM_TERMINAL_RE = /(已出售|出售完成|已赠出|已交付|已消耗|耗尽|已损毁|已销毁|已丢弃|已遗失|不再持有|sold|transferred|delivered|consumed|destroyed|discarded|lost)/i;
const ITEM_TRANSFER_RE = /(已出售|出售完成|已赠出|已交付|已遗失|不再持有|sold|transferred|delivered|lost)/i;
const ITEM_DISPOSABLE_RE = /(普通|制式|可替代|消耗品|一次性|空瓶|废弃|无特殊|common|ordinary|disposable|consumable)/i;
const ITEM_INDEPENDENT_RE = /(唯一|神器|圣器|圣剑|证物|任务|关键|不可替代|传家|王室|核心|unique|artifact|evidence|quest|key item)/i;
const SCENE_TERMINAL_RE = /(已结束|已离开|离开场景|场景结束|已关闭|ended|left|closed)/i;
function text(value) {
    return String(value ?? '').trim();
}
function list(value) {
    return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}
function identity(value) {
    return text(value).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}
function factEventId(fact) {
    return text(fact.event_id ?? fact.eventId ?? fact.entity_id ?? fact.entityId);
}
function factId(fact) {
    return text(fact.fact_id ?? fact.factId ?? fact.id);
}
function factClosed(fact) {
    const operation = text(fact.operation).toLowerCase();
    return operation === 'close' || CLOSED_STATUS_RE.test(text(fact.status));
}
function rowEventIds(row) {
    return [...new Set([...(row?.eventIds ?? []), row?.eventId].map(text).filter(Boolean))];
}
function activeRow(row) {
    return !isEntryParticipationPaused(row)
        && !CLOSED_STATUS_RE.test(rowText(row));
}
function currentSpacetime(snapshot, registry) {
    const table = tableByRole(registry, 'spacetime', false);
    return table ? (snapshot[table.key] ?? []).filter(activeRow).at(-1) : undefined;
}
/**
 * 时空槽位变化只由前后两个已提交快照的稳定身份变化产生。
 * 它用于接受 spacetime_current 的新标题，本身不代表要联动其他表。
 */
function deriveSpacetimeChange(previous, next, registryValue) {
    const registry = normalizeTableRegistry(registryValue);
    const before = currentSpacetime(previous, registry);
    const after = currentSpacetime(next, registry);
    if (!before || !after || identity(before.title) === identity(after.title))
        return undefined;
    const sceneTable = tableByRole(registry, 'scenes', false);
    const previousScenes = sceneTable ? previous[sceneTable.key] ?? [] : [];
    const oldScene = previousScenes.find((row) => identity(row.title) === identity(before.title))
        ?? previousScenes.filter(activeRow).at(-1);
    return {
        previousTitle: before.title,
        currentTitle: after.title,
        previousSceneId: oldScene?.id,
        relatedObjectTokens: [...new Set(list(oldScene?.fields?.relatedObjects).map(identity).filter(Boolean))],
        eventIds: [...new Set([
                ...rowEventIds(before),
                ...rowEventIds(oldScene),
            ].filter(Boolean))],
    };
}
/**
 * 场景边界是“时空变化 + 已启用联动规则”的结果。
 * 关闭时空联动后，时空表本身仍可更新，但不会触发场景/NPC 预退出或提前总结。
 */
function deriveSceneBoundary(previous, next, registryValue, linkRules = undefined) {
    const registry = normalizeTableRegistry(registryValue);
    const change = deriveSpacetimeChange(previous, next, registry);
    if (!change)
        return undefined;
    const targetRoles = linkedTargetRoles(linkRules, registry, 'spacetime');
    if (!targetRoles.size)
        return undefined;
    return { ...change, targetRoles: [...targetRoles] };
}
function rowText(row) {
    const fields = row.fields ?? {};
    return [
        row.status,
        row.content,
        fields.baseContent,
        ...list(fields.currentFacts),
        ...list(fields.currentStates),
    ].map(text).filter(Boolean).join(' ');
}
function explicitTerminal(role, row) {
    const source = rowText(row);
    if (role === 'events')
        return CLOSED_STATUS_RE.test(source);
    if (role === 'scenes')
        return SCENE_TERMINAL_RE.test(source);
    if (role === 'items') {
        if (!ITEM_TERMINAL_RE.test(source))
            return false;
        if (ITEM_INDEPENDENT_RE.test(source))
            return false;
        if (ITEM_TRANSFER_RE.test(source))
            return ITEM_DISPOSABLE_RE.test(source);
        return true;
    }
    return false;
}
function eventHost(snapshot, registry, eventId) {
    for (const table of enabledTables(registry).filter((item) => item.role === 'events')) {
        const exact = (snapshot[table.key] ?? []).find((row) => rowEventIds(row).includes(eventId));
        if (exact)
            return { table: table.key, row: exact };
    }
    return undefined;
}
function rowFactText(row, facts, eventId) {
    const rowIds = new Set(row.factIds ?? []);
    const aliases = new Set([row.id, row.title, ...(row.keywords ?? [])].map(identity).filter(Boolean));
    const matched = facts.filter((fact) => {
        if (factEventId(fact) !== eventId)
            return false;
        if (rowIds.has(factId(fact)))
            return true;
        return list(fact.related_entities ?? fact.relatedEntities).map(identity).some((value) => aliases.has(value));
    });
    return [...new Set(matched.flatMap((fact) => list(fact.occurred ?? fact.occurredFacts).concat(text(fact.content))).map(text).filter(Boolean))]
        .join('；')
        .slice(0, 1200);
}
/**
 * 只检查本轮返回的行。事件是否结束来自本轮明确事实；条目是否可进入待结算来自固定表类型与显式终态。
 */
function deriveIncrementalSettlementDirectives(input) {
    const registry = normalizeTableRegistry(input.registry);
    const tableByKey = new Map(registry.map((table) => [table.key, table]));
    const touched = new Map();
    for (const [tableKey, patches] of Object.entries(input.patchSnapshot ?? {})) {
        const table = tableByKey.get(tableKey);
        if (!table || !Array.isArray(patches))
            continue;
        for (const patch of patches) {
            const row = (input.snapshot[tableKey] ?? []).find((candidate) => candidate.id === patch.id);
            if (row)
                touched.set(row.id, { table, patch, row });
        }
    }
    const closedEventIds = new Set(input.facts.filter(factClosed).map(factEventId).filter(Boolean));
    const activeEventIds = new Set(input.facts.filter((fact) => !factClosed(fact)).map(factEventId).filter(Boolean));
    const sceneBoundary = input.sceneBoundary;
    const currentPatchObjectTokens = new Set();
    for (const [tableKey, patches] of Object.entries(input.patchSnapshot ?? {})) {
        const table = tableByKey.get(tableKey);
        if (!table || !['characters', 'state'].includes(table.role) || !Array.isArray(patches))
            continue;
        for (const patch of patches)
            for (const value of [patch?.id, patch?.title, ...(patch?.keywords ?? [])]) {
                const token = identity(value);
                if (token)
                    currentPatchObjectTokens.add(token);
            }
    }
    // 事件结束后只扫描绑定该事件的局部对象，不扫描整个仓库内容。
    for (const table of enabledTables(registry)) {
        for (const row of input.snapshot[table.key] ?? []) {
            if (touched.has(row.id))
                continue;
            if (!rowEventIds(row).some((eventId) => closedEventIds.has(eventId)))
                continue;
            touched.set(row.id, { table, patch: row, row });
        }
    }
    // 场景切换只加入旧场景及其明确关联的临时角色；本轮继续出现的对象不预退出。
    if (sceneBoundary) {
        const related = new Set(sceneBoundary.relatedObjectTokens ?? []);
        const targetRoles = new Set(sceneBoundary.targetRoles ?? []);
        for (const table of enabledTables(registry)) {
            for (const row of input.snapshot[table.key] ?? []) {
                const rowTokens = [row.id, row.title, ...(row.keywords ?? [])].map(identity).filter(Boolean);
                const oldScene = targetRoles.has('scenes') && table.role === 'scenes'
                    && (row.id === sceneBoundary.previousSceneId || identity(row.title) === identity(sceneBoundary.previousTitle));
                const relatedCharacter = (targetRoles.has('characters') || targetRoles.has('state'))
                    && ['characters', 'state'].includes(table.role)
                    && rowTokens.some((token) => related.has(token))
                    && !rowTokens.some((token) => currentPatchObjectTokens.has(token));
                if (oldScene || relatedCharacter)
                    touched.set(row.id, { table, patch: row, row, sceneBoundary: true });
            }
        }
    }
    const output = new Map();
    for (const { table, patch, row, sceneBoundary: fromSceneBoundary } of touched.values()) {
        const protectedEntry = row.source === 'manual' || row.locked || row.lockMode === 'all' || row.lockMode === 'base' || row.id === input.focusObjectId;
        if (protectedEntry)
            continue;
        const events = rowEventIds(row);
        const patchEvents = rowEventIds(patch);
        const touchedActive = [...new Set([...events, ...patchEvents])].some((eventId) => activeEventIds.has(eventId));
        const explicitlyReturned = touched.has(row.id) && patch !== row;
        if (isEntryParticipationPaused(row)
            && (touchedActive || explicitlyReturned)
            && !explicitTerminal(table.role, patch)) {
            output.set(row.id, { sourceId: row.id, sourceTable: table.key, sourceTitle: row.title, action: 'restore' });
            continue;
        }
        if (fromSceneBoundary) {
            if (table.role === 'scenes') {
                output.set(row.id, {
                    sourceId: row.id,
                    sourceTable: table.key,
                    sourceTitle: row.title,
                    action: 'retire',
                    trigger: 'scene-boundary',
                    triggerEventIds: sceneBoundary.eventIds,
                    note: `${row.title}已离开场景，等待本场景事实完成分发。`,
                    reason: `场景已切换至${sceneBoundary.currentTitle}；旧场景进入预退出。`,
                });
                continue;
            }
            const hasOpenCrossSceneEvent = events.some((eventId) => {
                if (closedEventIds.has(eventId))
                    return false;
                const host = eventHost(input.snapshot, registry, eventId);
                return host ? activeRow(host.row) : true;
            });
            const fields = row.fields ?? {};
            const persistentCharacter = Boolean(text(fields.baseContent)
                || list(fields.relationshipStates).length
                || list(fields.abilityStates).length
                || events.length > 1);
            if (!hasOpenCrossSceneEvent && !persistentCharacter) {
                output.set(row.id, {
                    sourceId: row.id,
                    sourceTable: table.key,
                    sourceTitle: row.title,
                    action: 'retire',
                    trigger: 'scene-boundary',
                    triggerEventIds: sceneBoundary.eventIds,
                    note: `${row.title}已离开当前场景，等待其短期影响完成分发。`,
                    reason: `场景已切换至${sceneBoundary.currentTitle}；临时 NPC 进入预退出。`,
                });
            }
            continue;
        }
        const closedEventId = events.find((eventId) => closedEventIds.has(eventId));
        if (!closedEventId)
            continue;
        const note = rowFactText(row, input.facts, closedEventId)
            || `${row.title}在该事件中的明确结果已写入对象事实。`;
        // 事件状态只由插件根据正文与自然事实模块中的明确终局证据确定。
        if (table.role === 'events') {
            output.set(row.id, {
                sourceId: row.id,
                sourceTable: table.key,
                sourceTitle: row.title,
                action: 'retire',
                note,
                reason: '事件已结束且不存在未决模块；等待小总结完成对象分发后删除事件容器。',
            });
            continue;
        }
        // 没有基础定义、关系或能力层，且只服务于本事件的自动角色，视为临时 NPC。
        const fields = row.fields ?? {};
        const persistentCharacter = Boolean(text(fields.baseContent)
            || list(fields.relationshipStates).length
            || list(fields.abilityStates).length
            || events.length > 1);
        if ((table.role === 'characters' || table.role === 'state') && !persistentCharacter) {
            output.set(row.id, {
                sourceId: row.id,
                sourceTable: table.key,
                sourceTitle: row.title,
                action: 'retire',
                note,
                reason: '临时 NPC 仅参与已结束事件，持续结果由事件或相关对象承接，原条目无后续独立追踪价值。',
            });
            continue;
        }
        // 场景与物品必须有明确终态，防止关闭一场事件时误删仍长期存在的地点和关键物品。
        if ((table.role === 'scenes' || table.role === 'items') && explicitTerminal(table.role, row)) {
            output.set(row.id, {
                sourceId: row.id,
                sourceTable: table.key,
                sourceTitle: row.title,
                action: 'retire',
                note,
                reason: `${table.role === 'items' ? '物品' : '场景'}已形成明确终态；等待总结覆盖后删除临时容器。`,
            });
        }
    }
    return [...output.values()];
}

}
};
__defs["domain/internal-facts.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"hashText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["hashText"]});
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"applyFactContractGate",{enumerable:true,configurable:true,get:()=>__require("domain/fact-contract.js")["applyFactContractGate"]});
with(__scope){
Object.defineProperty(exports,"normalizeInternalFact",{enumerable:true,configurable:true,get:()=>normalizeInternalFact});
Object.defineProperty(exports,"normalizeInternalFacts",{enumerable:true,configurable:true,get:()=>normalizeInternalFacts});
Object.defineProperty(exports,"mergeInternalFacts",{enumerable:true,configurable:true,get:()=>mergeInternalFacts});
Object.defineProperty(exports,"pendingFactsByEvent",{enumerable:true,configurable:true,get:()=>pendingFactsByEvent});
Object.defineProperty(exports,"markFactsConsumed",{enumerable:true,configurable:true,get:()=>markFactsConsumed});
Object.defineProperty(exports,"markFactsSolidified",{enumerable:true,configurable:true,get:()=>markFactsSolidified});
Object.defineProperty(exports,"migrateLegacyConsumption",{enumerable:true,configurable:true,get:()=>migrateLegacyConsumption});
Object.defineProperty(exports,"invalidateFactsAfterMessages",{enumerable:true,configurable:true,get:()=>invalidateFactsAfterMessages});
/**
 * 模块职责：维护与可见表格数量无关的聊天级内部事实层。
 * 维护边界：表格删除、停用或重命名不得删除这里的事件线、消费标记或历史来源。
 */
const CONFIDENCE = new Set(['confirmed', 'recorded', 'reported', 'uncertain']);
function stringList(value, limit = 40, itemLimit = 500) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => safeText(item, itemLimit).trim()).filter(Boolean))].slice(0, limit);
}
function timeRange(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        start: safeText(source.start, 120).trim() || undefined,
        end: safeText(source.end, 120).trim() || undefined,
        label: safeText(source.label, 240).trim() || undefined,
    };
}
function normalizeFactView(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const table = safeText(source.table, 100).trim();
    const rowId = safeText(source.rowId, 160).trim();
    const objectTitle = safeText(source.objectTitle, 240).trim();
    if (!table || !rowId || !objectTitle)
        return undefined;
    return {
        table,
        rowId,
        objectTitle,
        semanticRole: safeText(source.semanticRole, 80).trim(),
        layerKind: safeText(source.layerKind, 40).trim(),
        layerKey: safeText(source.layerKey, 100).trim() || undefined,
        layerType: safeText(source.layerType, 40).trim() || undefined,
        arrayOperation: safeText(source.arrayOperation, 24).trim() || undefined,
        value: safeText(source.value, 6000).trim(),
        keywords: stringList(source.keywords, 24, 100),
        eventName: safeText(source.eventName, 240).trim(),
        eventClosed: source.eventClosed === true,
        relatedObjects: stringList(source.relatedObjects, 40, 240),
        moduleTag: safeText(source.moduleTag, 80).trim(),
        relocation: source.relocation && typeof source.relocation === 'object'
            ? structuredClone(source.relocation)
            : undefined,
        baseRevisionStatement: safeText(source.baseRevisionStatement, 1200).trim() || undefined,
    };
}
function normalizeInternalFact(value, sourceMessageId = '', index = 0) {
    const source = value && typeof value === 'object' ? value : {};
    const content = safeText(source.content, 6000).trim();
    const occurred = stringList(source.occurredFacts ?? source.occurred ?? (content ? [content] : []), 30, 1000);
    if (!content && !occurred.length)
        return null;
    const title = safeText(source.title, 240).trim() || `事实 ${index + 1}`;
    const explicitFactId = safeText(source.factId ?? source.fact_id ?? source.id, 160).trim();
    const factId = explicitFactId || `fact_${hashText(`${title}|${content}|${index}`)}`;
    const status = safeText(source.status, 160).trim() || 'active';
    const confidenceText = safeText(source.confidence, 40).trim();
    const sourceIds = stringList(source.sourceMessageIds ?? source.source_message_ids, 40, 200);
    if (sourceMessageId && !sourceIds.includes(sourceMessageId))
        sourceIds.push(sourceMessageId);
    const view = normalizeFactView(source.view ?? source.projectionHint ?? source.projection_hint);
    const contract = applyFactContractGate({
        ...source,
        factId,
        title,
        content: content || occurred.join('；'),
        confidence: CONFIDENCE.has(confidenceText) ? confidenceText : 'uncertain',
        view,
    }, {
        index,
        sourceMessageId,
        existingObject: source.admission?.objectQualified === true,
    });
    const validTo = contract.validTo;
    return {
        factId,
        eventId: contract.eventId,
        sourceMessageIds: sourceIds,
        pendingSourceMessageIds: stringList(source.pendingSourceMessageIds ?? source.pending_source_message_ids, 40, 200),
        occurredFacts: occurred,
        unresolvedItems: stringList(source.unresolvedItems ?? source.unresolved ?? source.openItems, 30, 1000),
        status,
        timeRange: timeRange(source.timeRange ?? source.time_range),
        relatedEntities: stringList(source.relatedEntities ?? source.related_entities, 30, 240),
        title,
        content: content || occurred.join('；'),
        type: safeText(source.type, 80).trim() || 'fact',
        keywords: stringList(source.keywords, 24, 100),
        confidence: CONFIDENCE.has(confidenceText) ? confidenceText : 'uncertain',
        evidenceKind: contract.evidenceKind,
        subjectRef: contract.subjectRef,
        primaryHost: contract.primaryHost,
        facet: contract.facet,
        storageClass: contract.storageClass,
        validFrom: contract.validFrom,
        validTo,
        active: source.active !== false
            && !validTo
            && !/(closed|resolved|ended|archived|结束|已解决|已关闭|已归档)/i.test(status),
        supersedesFactId: contract.supersedesFactId,
        supersededByFactId: contract.supersededByFactId,
        consumedBySmallSummaryId: safeText(source.consumedBySmallSummaryId, 160).trim() || undefined,
        solidifiedByLargeSummaryId: safeText(source.solidifiedByLargeSummaryId, 160).trim() || undefined,
        projectionHint: contract.projectionHint,
        admission: contract.admission,
        view: contract.view,
        lastOperation: safeText(source.operation ?? source.lastOperation, 40).trim() || undefined,
        createdAt: safeText(source.createdAt, 80).trim() || nowIso(),
        updatedAt: safeText(source.updatedAt, 80).trim() || nowIso(),
    };
}
function normalizeInternalFacts(value, sourceMessageId = '') {
    if (!Array.isArray(value))
        return [];
    const output = [];
    const seen = new Set();
    value.forEach((item, index) => {
        const normalized = normalizeInternalFact(item, sourceMessageId, index);
        if (!normalized)
            return;
        if (seen.has(normalized.factId)) {
            normalized.factId = `${normalized.factId}_${index + 1}`;
        }
        if (!normalized.pendingSourceMessageIds?.length && !normalized.consumedBySmallSummaryId) {
            normalized.pendingSourceMessageIds = [...normalized.sourceMessageIds];
        }
        seen.add(normalized.factId);
        output.push(normalized);
    });
    return output.slice(0, 2000);
}
function mergeList(left, right, limit = 60) {
    return [...new Set([...left, ...right].map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}
function mergeTimeRange(previous, next) {
    return {
        start: next.start || previous.start,
        end: next.end || previous.end,
        label: next.label || previous.label,
    };
}
function semanticFingerprint(fact) {
    return JSON.stringify({
        eventId: fact.eventId,
        occurredFacts: fact.occurredFacts,
        unresolvedItems: fact.unresolvedItems,
        status: fact.status,
        timeRange: fact.timeRange,
        relatedEntities: fact.relatedEntities,
        title: fact.title,
        content: fact.content,
        type: fact.type,
        keywords: fact.keywords,
        confidence: fact.confidence,
        active: fact.active,
        supersededByFactId: fact.supersededByFactId,
        supersedesFactId: fact.supersedesFactId,
        subjectRef: fact.subjectRef,
        primaryHost: fact.primaryHost,
        facet: fact.facet,
        storageClass: fact.storageClass,
        validFrom: fact.validFrom,
        validTo: fact.validTo,
        evidenceKind: fact.evidenceKind,
        admission: fact.admission,
        view: fact.view,
    });
}
/** 合并本轮事实操作；close/supersede 只改变事实状态，不删除历史来源。 */
function mergeInternalFacts(existing, incoming, rawFacts = []) {
    const output = existing.map((fact) => ({
        ...fact,
        sourceMessageIds: [...fact.sourceMessageIds],
        pendingSourceMessageIds: [...(fact.pendingSourceMessageIds ?? (fact.consumedBySmallSummaryId ? [] : fact.sourceMessageIds))],
        occurredFacts: [...fact.occurredFacts],
        unresolvedItems: [...fact.unresolvedItems],
        relatedEntities: [...fact.relatedEntities],
        keywords: [...fact.keywords],
        timeRange: { ...fact.timeRange },
        view: fact.view ? structuredClone(fact.view) : undefined,
        projectionHint: fact.projectionHint ? structuredClone(fact.projectionHint) : undefined,
        subjectRef: fact.subjectRef ? structuredClone(fact.subjectRef) : undefined,
        primaryHost: fact.primaryHost ? structuredClone(fact.primaryHost) : undefined,
        admission: fact.admission ? structuredClone(fact.admission) : undefined,
    }));
    const byId = new Map(output.map((fact, index) => [fact.factId, index]));
    const rawById = new Map(rawFacts.map((fact) => [fact.factId || fact.fact_id || fact.id, fact]));
    for (const next of incoming) {
        const replacedFactId = next.supersedesFactId;
        if (replacedFactId && replacedFactId !== next.factId) {
            const replacedIndex = byId.get(replacedFactId);
            if (replacedIndex !== undefined) {
                const replaced = output[replacedIndex];
                output[replacedIndex] = {
                    ...replaced,
                    active: false,
                    validTo: next.validFrom || next.sourceMessageIds.at(-1) || nowIso(),
                    supersededByFactId: next.factId,
                    updatedAt: nowIso(),
                };
            }
        }
        const index = byId.get(next.factId);
        if (index === undefined) {
            next.pendingSourceMessageIds = [...new Set(next.pendingSourceMessageIds?.length ? next.pendingSourceMessageIds : next.sourceMessageIds)];
            byId.set(next.factId, output.length);
            output.push(next);
            continue;
        }
        const previous = output[index];
        const raw = rawById.get(next.factId);
        const operation = raw?.operation ?? 'update';
        const unresolved = operation === 'close' ? [] : operation === 'append'
            ? mergeList(previous.unresolvedItems, next.unresolvedItems)
            : next.unresolvedItems.length ? next.unresolvedItems : previous.unresolvedItems;
        const merged = {
            ...previous,
            ...next,
            sourceMessageIds: mergeList(previous.sourceMessageIds, next.sourceMessageIds),
            pendingSourceMessageIds: [...(previous.pendingSourceMessageIds ?? [])],
            occurredFacts: mergeList(previous.occurredFacts, next.occurredFacts),
            unresolvedItems: unresolved,
            relatedEntities: mergeList(previous.relatedEntities, next.relatedEntities),
            keywords: mergeList(previous.keywords, next.keywords),
            timeRange: mergeTimeRange(previous.timeRange, next.timeRange),
            active: operation === 'close' || operation === 'supersede' ? false : next.active,
            validFrom: previous.validFrom || next.validFrom,
            validTo: operation === 'close' || (operation === 'supersede' && !next.supersedesFactId)
                ? (next.validTo || next.sourceMessageIds.at(-1) || previous.validTo || nowIso())
                : next.validTo || previous.validTo,
            supersedesFactId: next.supersedesFactId || previous.supersedesFactId,
            supersededByFactId: operation === 'supersede' && !next.supersedesFactId
                ? (next.supersededByFactId || previous.supersededByFactId)
                : next.supersededByFactId || previous.supersededByFactId,
            consumedBySmallSummaryId: previous.consumedBySmallSummaryId,
            solidifiedByLargeSummaryId: previous.solidifiedByLargeSummaryId,
            createdAt: previous.createdAt,
            updatedAt: nowIso(),
        };
        if (semanticFingerprint(merged) !== semanticFingerprint(previous)) {
            // 同一 fact_id 出现新的已发生内容、未决变化或关闭结果时，必须重新进入该 event_id 的小总结。
            delete merged.consumedBySmallSummaryId;
            delete merged.solidifiedByLargeSummaryId;
            merged.pendingSourceMessageIds = mergeList(previous.pendingSourceMessageIds ?? [], next.sourceMessageIds);
        }
        output[index] = merged;
    }
    return output.slice(-2000);
}
function pendingFactsByEvent(facts) {
    const groups = new Map();
    for (const fact of facts) {
        if (fact.consumedBySmallSummaryId)
            continue;
        if (!fact.eventId || fact.storageClass === 'episodic')
            continue;
        const list = groups.get(fact.eventId) ?? [];
        list.push(fact);
        groups.set(fact.eventId, list);
    }
    return groups;
}
function markFactsConsumed(facts, factIds, summaryId) {
    const selected = new Set(factIds);
    for (const fact of facts) {
        if (!selected.has(fact.factId))
            continue;
        fact.consumedBySmallSummaryId = summaryId;
        fact.pendingSourceMessageIds = [];
    }
}
function markFactsSolidified(facts, factIds, largeSummaryId) {
    const selected = new Set(factIds);
    for (const fact of facts)
        if (selected.has(fact.factId))
            fact.solidifiedByLargeSummaryId = largeSummaryId;
}
function migrateLegacyConsumption(facts, smallSummaries, largeSummaries) {
    for (const summary of smallSummaries) {
        const directFactIds = new Set(summary.sourceFactIds ?? []);
        for (const fact of facts) {
            if (directFactIds.has(fact.factId) || summary.sourceKeys.includes(fact.factId) || fact.sourceMessageIds.some((id) => summary.sourceKeys.includes(id))) {
                fact.consumedBySmallSummaryId ||= summary.id;
            }
        }
    }
    const largeBySmall = new Map();
    for (const large of largeSummaries)
        for (const smallId of large.sourceSummaryIds ?? large.sourceKeys)
            largeBySmall.set(smallId, large.id);
    for (const small of smallSummaries) {
        const largeId = small.solidifiedByLargeSummaryId || largeBySmall.get(small.id);
        if (!largeId)
            continue;
        small.solidifiedByLargeSummaryId = largeId;
        for (const fact of facts)
            if (fact.consumedBySmallSummaryId === small.id)
                fact.solidifiedByLargeSummaryId ||= largeId;
    }
}
function invalidateFactsAfterMessages(facts, validMessageIds) {
    const removedFactIds = new Set();
    const kept = facts.filter((fact) => {
        const valid = fact.sourceMessageIds.length > 0 && fact.sourceMessageIds.every((id) => validMessageIds.has(id));
        if (!valid)
            removedFactIds.add(fact.factId);
        return valid;
    });
    return { facts: kept, removedFactIds };
}

}
};
__defs["domain/lorebook-publish.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"DEFAULT_CONTENT_LIMITS",{enumerable:true,configurable:true,get:()=>__require("constants.js")["DEFAULT_CONTENT_LIMITS"]});
Object.defineProperty(__scope,"customizedFieldLabel",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["customizedFieldLabel"]});
Object.defineProperty(__scope,"DEFAULT_TABLE_REGISTRY",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["DEFAULT_TABLE_REGISTRY"]});
Object.defineProperty(__scope,"enabledTables",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["enabledTables"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
Object.defineProperty(__scope,"tableByRole",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["tableByRole"]});
Object.defineProperty(__scope,"isEntryLifecycleHidden",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["isEntryLifecycleHidden"]});
Object.defineProperty(__scope,"isEntryParticipationPaused",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["isEntryParticipationPaused"]});
Object.defineProperty(__scope,"filterPassiveObservers",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["filterPassiveObservers"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"canonicalObjectTitle",{enumerable:true,configurable:true,get:()=>__require("domain/object-identity.js")["canonicalObjectTitle"]});
Object.defineProperty(__scope,"isPurePassiveObserverText",{enumerable:true,configurable:true,get:()=>__require("domain/observer.js")["isPurePassiveObserverText"]});
Object.defineProperty(__scope,"narrativeContextText",{enumerable:true,configurable:true,get:()=>__require("runtime-v2/orchestrator.js")["narrativeContextText"]});
with(__scope){
Object.defineProperty(exports,"filterSnapshotForLorebook",{enumerable:true,configurable:true,get:()=>filterSnapshotForLorebook});
Object.defineProperty(exports,"unconsumedSmallSummaries",{enumerable:true,configurable:true,get:()=>unconsumedSmallSummaries});
Object.defineProperty(exports,"selectLorebookDocuments",{enumerable:true,configurable:true,get:()=>selectLorebookDocuments});
Object.defineProperty(exports,"buildSemanticLorebookDocuments",{enumerable:true,configurable:true,get:()=>buildSemanticLorebookDocuments});
Object.defineProperty(exports,"buildDetailedLorebookDocuments",{enumerable:true,configurable:true,get:()=>buildDetailedLorebookDocuments});
Object.defineProperty(exports,"buildLorebookDocuments",{enumerable:true,configurable:true,get:()=>buildLorebookDocuments});
/**
 * 模块职责：把承载当前、近期与历史层的对象/事件表格条目转换为 constant / trigger / vector 三种世界书文档。
 * 维护边界：不使用数值权重决定记忆进入上下文；不同信息点可共享 fact_id/event_id，去重只按条目身份与完全相同内容，再按总容量裁剪。
 */
function registry(options) {
    return normalizeTableRegistry(options?.registry?.length ? options.registry : DEFAULT_TABLE_REGISTRY);
}
function uniq(values, limit = 40) {
    return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, limit);
}
function lifecycleLines(lifecycle) {
    if (!lifecycle)
        return [];
    const lines = [`存在状态：${lifecycle.existence}`, `活跃状态：${lifecycle.activity}`, `记忆状态：${lifecycle.memory}`, `证据等级：${lifecycle.evidenceLevel}`];
    if (lifecycle.evidence)
        lines.push(`判断依据：${lifecycle.evidence}`);
    if (lifecycle.returnConditions.length)
        lines.push(`可能回流条件：${lifecycle.returnConditions.join('；')}`);
    if (lifecycle.returnBlockers.length)
        lines.push(`阻止回流条件：${lifecycle.returnBlockers.join('；')}`);
    return lines;
}
function boundedLine(label, value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item ?? '').trim()).filter(Boolean).map((item) => `${label}：${item}`);
    }
    const text = String(value ?? '').trim();
    return text ? [`${label}：${text}`] : [];
}
function fitWholeLines(lines, maxChars) {
    const limit = Math.max(200, Math.round(Number(maxChars) || 1200));
    const output = [];
    let used = 0;
    for (const rawLine of lines) {
        const line = String(rawLine || '').trim();
        if (!line)
            continue;
        const separator = output.length ? 1 : 0;
        if (used + separator + line.length <= limit) {
            output.push(line);
            used += separator + line.length;
            continue;
        }
        // 优先丢弃完整的低优先级事实，不从中间硬截断；只有首个身份行本身过长时才安全截断。
        if (!output.length)
            return line.slice(0, Math.max(1, limit - 1)) + (line.length > limit ? '…' : '');
    }
    return output.join('\n');
}
function uniqueContentLines(lines) {
    const seen = new Set();
    const output = [];
    for (const raw of lines) {
        const line = String(raw || '').trim();
        const token = line.normalize('NFKC').replace(/\s+/g, ' ').trim();
        if (!line || seen.has(token))
            continue;
        seen.add(token);
        output.push(line);
    }
    return output;
}
function rowContent(table, row, maxChars) {
    const titleLabel = customizedFieldLabel(table, 'title', '');
    const statusLabel = customizedFieldLabel(table, 'status', '当前状态');
    const contentLabel = customizedFieldLabel(table, 'content', '当前记录');
    const heading = titleLabel
        ? `[${table.name}｜${titleLabel}：${row.title}]`
        : `[${table.name}：${row.title}]`;
    const fields = row.fields ?? {};
    const fieldByKey = new Map(table.fields.map((field) => [field.key, field]));
    const prioritizedKeys = [
        'baseContent', 'currentFacts', 'currentStates', 'presentationStates', 'relationshipStates', 'abilityStates',
        'relatedObjects', 'relatedEvents', 'recentHistory', 'solidifiedHistory',
    ];
    const lines = [heading];
    const baseField = fieldByKey.get('baseContent');
    if (baseField && 'baseContent' in fields)
        lines.push(...boundedLine(baseField.label, fields.baseContent));
    if (row.status && !/^(active|进行中)$/i.test(row.status.trim()))
        lines.push(`${statusLabel}：${row.status}`);
    if (row.content && canonicalObjectTitle(row.content) !== canonicalObjectTitle(row.title))
        lines.push(`${contentLabel}：${row.content}`);
    for (const key of prioritizedKeys.filter((key) => key !== 'baseContent')) {
        const field = fieldByKey.get(key);
        if (field && key in fields)
            lines.push(...boundedLine(field.label, fields[key]));
    }
    for (const field of table.fields) {
        if (prioritizedKeys.includes(field.key) || !(field.key in fields))
            continue;
        lines.push(...boundedLine(field.label, fields[field.key]));
    }
    // 事实 ID、事件 ID 与维护权限只保留在插件元数据中，不注入正文模型。
    return fitWholeLines(uniqueContentLines(lines), maxChars);
}
function rowSearchText(row) { return `${row.title} ${row.content} ${row.status} ${row.keywords.join(' ')}`; }
function isAudienceRow(row) {
    if (row.source === 'manual' || row.locked)
        return false;
    return isPurePassiveObserverText(rowSearchText(row));
}
function normalizedName(value) { return canonicalObjectTitle(value); }
function aliases(title) {
    const raw = String(title || '').trim();
    return uniq([normalizedName(raw), ...raw.split(/[｜|:：—–-]/).map(normalizedName)], 12);
}
/**
 * 活跃视图和世界书共同过滤纯旁观者，人工/锁定行不自动删除。
 * 发布前过滤只依据对象事实和保护规则；焦点不得改变对象是否参与发布，唯一效果在 recallModeFor。
 */
function filterSnapshotForLorebook(snapshot, customRegistry) {
    const tables = normalizeTableRegistry(customRegistry?.length ? customRegistry : DEFAULT_TABLE_REGISTRY);
    // 世界书只消费已经提交的快照，不再自行创建场景、迁移对象或合并身份。
    // 旧存档修复属于 repository 迁移，普通发布链不得成为第二套状态机。
    const next = filterPassiveObservers(structuredClone(snapshot), tables);
    for (const table of tables)
        next[table.key] ||= [];
    for (const table of tables)
        next[table.key] = (next[table.key] ?? []).filter((row) => !isEntryLifecycleHidden(row));
    const stateKey = tableByRole(tables, 'characters', false)?.key || tableByRole(tables, 'state', false)?.key;
    const eventKey = tableByRole(tables, 'events', false)?.key;
    const relationKey = tableByRole(tables, 'relationships', false)?.key;
    if (!stateKey)
        return next;
    const relevanceRows = [eventKey, relationKey].filter(Boolean).flatMap((key) => next[key] ?? []);
    const relevance = normalizedName(relevanceRows.map(rowSearchText).join(' '));
    next[stateKey] = (next[stateKey] ?? []).filter((row) => {
        if (row.source === 'manual' || row.locked)
            return true;
        if (isAudienceRow(row))
            return false;
        const named = aliases(row.title).some((name) => name && relevance.includes(name));
        const direct = /(核心参与|直接相关|交战|对战|行动者|目标|当事人)/i.test(rowSearchText(row));
        return named || direct || !relevance;
    });
    const retainedNames = new Set(next[stateKey].flatMap((row) => aliases(row.title)));
    for (const table of enabledTables(tables)) {
        if (['focus', 'spacetime', 'scenes', 'characters', 'state', 'items', 'events', 'globalChanges', 'foundations'].includes(table.role))
            continue;
        next[table.key] = (next[table.key] ?? []).filter((row) => {
            if (table.role === 'custom' && safeText(row.fields?.migrationStatus, 80).trim() === '已归并')
                return false;
            if (row.source === 'manual' || row.locked)
                return true;
            if (isAudienceRow(row))
                return false;
            const text = normalizedName(rowSearchText(row));
            return !retainedNames.size || [...retainedNames].some((name) => text.includes(name)) || table.role === 'regions';
        });
    }
    return next;
}
function defaultTrigger(row) {
    const recall = row.recall ?? { any: [], all: [], exclude: [] };
    const any = uniq([...(recall.any ?? []), row.title, ...row.keywords], 32);
    return { any, all: uniq(recall.all ?? [], 20), exclude: uniq(recall.exclude ?? [], 20) };
}
function isEssentialState(row) {
    return /(不可缺失|昏迷|重伤|濒死|死亡|失踪|被拘禁|封印|当前在场|当前相关|核心参与)/i.test(rowSearchText(row));
}
function isHistoricalSpacetime(row) {
    return /(已离开|离开场景|历史场景|过去场景|非当前|已结束|已关闭|已归档|inactive|closed|ended|archived)/i.test(rowSearchText(row));
}
function currentSpacetimeRowId(rows) {
    const active = rows.filter((row) => !isHistoricalSpacetime(row));
    if (!active.length)
        return undefined;
    const explicit = active.filter((row) => /(当前场景|当前位置|当前地点|当前时空|正在此处|当前所在|current|active)/i.test(rowSearchText(row)));
    return (explicit.at(-1) ?? active.at(-1))?.id;
}
function recallModeFor(role, row, options, _currentSpacetimeId) {
    // Runtime V2 publishes one clean current-context entry as the only automatic
    // continuity constant. Raw scene/spacetime working rows stay retrievable but
    // can no longer pin stale machine state into every generation.
    if ((role === 'characters' || role === 'state') && row.id === options.focusObjectId)
        return 'constant';
    if (role === 'globalChanges')
        return 'constant';
    if (role === 'foundations' && /(必要|规则|制度|禁止|必须|不可)/i.test(rowSearchText(row)))
        return 'constant';
    if (role === 'events' && options.vectorize)
        return 'vector';
    return 'trigger';
}

function makeDocument(key, logicalKey, comment, content, kind, mode, trigger, factIds, eventIds, updatedAt, options, disabled = false) {
    const constant = !disabled && mode === 'constant';
    const vectorized = !disabled && mode === 'vector';
    const keywords = !disabled && !constant ? trigger.any : [];
    return {
        key,
        logicalKey,
        comment: `[MA11] ${comment}`,
        content,
        keywords,
        constant,
        vectorized,
        disabled,
        order: 0,
        updatedAt,
        kind,
        // Hybrid means keyword + vector are both available. This is metadata;
        // SillyTavern receives the independent key/vectorized fields below.
        recallMode: constant ? 'constant' : vectorized ? 'hybrid' : 'trigger',
        trigger,
        vector: { similarityThreshold: Math.min(0.99, Math.max(0, Number(options.similarityThreshold) || 0.72)), maxResults: Math.max(1, Math.round(Number(options.maxVectorResults) || 8)) },
        factIds: uniq(factIds, 100),
        eventIds: uniq(eventIds, 60),
        allowRecursion: options.recursion !== false,
    };
}

function unconsumedSmallSummaries(small, large) {
    const legacy = new Set(large.flatMap((item) => item.sourceSummaryIds ?? item.sourceKeys));
    return small.filter((item) => !item.solidifiedByLargeSummaryId && !item.supersededBySmallSummaryId && !legacy.has(item.id));
}
function relationLookups(snapshot, tables) {
    const objectTitles = new Map();
    const eventTitles = new Map();
    for (const table of tables) {
        for (const row of snapshot?.[table.key] ?? []) {
            const title = String(row?.title || '').trim();
            const id = String(row?.id || '').trim();
            if (id && title)
                objectTitles.set(id, title);
            if (table.role === 'events' && title) {
                for (const eventId of [...new Set([id, row?.eventId, ...(row?.eventIds ?? [])]
                    .map((item) => String(item || '').trim()).filter(Boolean))]) {
                    eventTitles.set(eventId, title);
                }
            }
        }
    }
    return { objectTitles, eventTitles };
}
function readableRelation(value, lookup) {
    const text = String(value ?? '').trim();
    return lookup.get(text) || text;
}
function rowForPublication(row, lookups) {
    const next = structuredClone(row);
    next.fields ||= {};
    if (Array.isArray(next.fields.relatedObjects)) {
        next.fields.relatedObjects = next.fields.relatedObjects
            .map((item) => readableRelation(item, lookups.objectTitles));
    }
    if (Array.isArray(next.fields.relatedEvents)) {
        next.fields.relatedEvents = next.fields.relatedEvents
            .map((item) => readableRelation(item, lookups.eventTitles));
    }
    return next;
}
function tableDocuments(snapshot, options) {
    if (!snapshot)
        return [];
    const tables = registry(options);
    const filtered = filterSnapshotForLorebook(snapshot, tables);
    const lookups = relationLookups(filtered, tables);
    const docs = [];
    for (const table of enabledTables(tables)) {
        const rows = filtered[table.key] ?? [];
        const currentSpacetimeId = table.role === 'spacetime' || table.role === 'scenes' ? currentSpacetimeRowId(rows) : undefined;
        for (const row of rows) {
            const readableRow = rowForPublication(row, lookups);
            const mode = recallModeFor(table.role, row, options, currentSpacetimeId);
            const trigger = defaultTrigger(row);
            const titleToken = normalizedName(row.title) || row.id;
            docs.push(makeDocument(`view:${table.key}:${row.id}`, `view:${table.key}:${titleToken}`, `MA｜${table.name}｜${row.title}`, rowContent(table, readableRow, Math.max(200, Number(options.entryLimits?.[table.key]) || Number(DEFAULT_CONTENT_LIMITS.tables[table.key]) || 1200)), `view:${table.role}`, mode, trigger, row.factIds ?? [], row.eventIds ?? (row.eventId ? [row.eventId] : []), row.updatedAt, options, isEntryParticipationPaused(row)));
        }
    }
    return docs;
}
function factValue(fact, camel, snake) {
    return fact?.[camel] ?? fact?.[snake];
}
function factList(fact, camel, snake) {
    const value = factValue(fact, camel, snake);
    return Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : [];
}
const FACT_TYPE_ROLES = {
    spacetime: 'spacetime',
    scenes: 'scenes',
    scene: 'scenes',
    characters: 'characters',
    character: 'characters',
    state: 'characters',
    items: 'items',
    item: 'items',
    events: 'events',
    event: 'events',
    regions: 'regions',
    region: 'regions',
    globalChanges: 'globalChanges',
    global: 'globalChanges',
    foundations: 'foundations',
    foundation: 'foundations',
};
function factPublishingEnabled(fact, tables) {
    const viewTable = String(fact?.view?.table ?? '').trim();
    if (viewTable)
        return tables.some((table) => table.key === viewTable && table.enabled);
    const type = String(fact?.type ?? '').trim();
    const direct = tables.find((table) => table.key === type);
    if (direct)
        return direct.enabled;
    const role = FACT_TYPE_ROLES[type];
    if (!role)
        return true;
    const matches = tables.filter((table) => table.role === role);
    return matches.length > 0 && matches.some((table) => table.enabled);
}
function factDocuments(facts, representedFactIds, representedEventIds, tables, options) {
    const docs = [];
    for (const fact of facts ?? []) {
        const factId = String(factValue(fact, 'factId', 'fact_id') ?? '').trim();
        const eventId = String(factValue(fact, 'eventId', 'event_id') ?? '').trim();
        const storageClass = String(factValue(fact, 'storageClass', 'storage_class') ?? '').trim();
        const supersededByFactId = String(factValue(fact, 'supersededByFactId', 'superseded_by_fact_id') ?? '').trim();
        if (!factId
            || storageClass === 'episodic'
            || Boolean(supersededByFactId)
            || representedFactIds.has(factId)
            || (eventId && representedEventIds.has(eventId))
            || !factPublishingEnabled(fact, tables))
            continue;
        const title = String(fact.title || '叙事事实').trim();
        const content = String(fact.content || '').trim();
        const occurred = factList(fact, 'occurredFacts', 'occurred');
        const unresolved = factList(fact, 'unresolvedItems', 'unresolved');
        const lines = [`[事实：${title}]`, ...occurred];
        if (content && !occurred.includes(content))
            lines.push(content);
        if (unresolved.length)
            lines.push(...unresolved.map((item) => `未决：${item}`));
        const text = fitWholeLines(uniqueContentLines(lines), Math.max(240, Number(options.factEntryLimit) || 1200));
        if (!text)
            continue;
        const related = factList(fact, 'relatedEntities', 'related_entities');
        const keywords = uniq([...(fact.keywords ?? []), title, ...related], 32);
        const historical = fact.active === false
            || Boolean(fact.consumedBySmallSummaryId)
            || Boolean(fact.solidifiedByLargeSummaryId)
            || /(closed|resolved|ended|archived|结束|已解决|已关闭|已归档)/i.test(String(fact.status || ''));
        const mode = historical && options.vectorize ? 'vector' : 'trigger';
        docs.push(makeDocument(`fact:${factId}`, `fact:${factId}`, `MA｜事实｜${title}`, text, 'fact', mode, { any: keywords, all: [], exclude: [] }, [factId], eventId ? [eventId] : [], fact.updatedAt || fact.createdAt, options));
    }
    return docs;
}
function summaryFallbackDocuments(small, large, representedEventIds, options) {
    const docs = [];
    const candidates = [
        ...(large ?? []).map((item) => ({ ...item, fallbackKind: 'large' })),
        ...unconsumedSmallSummaries(small ?? [], large ?? []).map((item) => ({ ...item, fallbackKind: 'small' })),
    ];
    for (const summary of candidates) {
        const eventId = String(summary.eventId || summary.eventIds?.[0] || '').trim();
        if (!eventId || representedEventIds.has(eventId))
            continue;
        const text = fitWholeLines(uniqueContentLines([
            `[${summary.fallbackKind === 'large' ? '长期记忆' : '近期记忆'}：${summary.title || '事件线'}]`,
            summary.summary,
            ...(summary.unresolvedItems ?? []).map((item) => `未决：${item}`),
        ]), Math.max(240, Number(options.summaryEntryLimit) || 1600));
        if (!text)
            continue;
        const id = String(summary.id || `${summary.fallbackKind}:${eventId}`);
        const mode = options.vectorize ? 'vector' : 'trigger';
        docs.push(makeDocument(`summary:${id}`, `summary:${id}`, `MA｜总结回退｜${summary.title || eventId}`, text, `summary:${summary.fallbackKind}`, mode, { any: uniq([...(summary.keywords ?? []), summary.title, eventId], 32), all: [], exclude: [] }, summary.sourceFactIds ?? [], [eventId], summary.createdAt, options));
        representedEventIds.add(eventId);
    }
    return docs;
}
/** 编译完整保存集合；SillyTavern 在运行时负责关键词、向量条数与上下文容量限制。 */
function selectLorebookDocuments(documents, options) {
    const modeRank = { constant: 0, trigger: 1, hybrid: 2, vector: 2 };
    const selectionMode = (document) => {
        const focusedCharacter = Boolean(options.focusObjectId
            && ['view:characters', 'view:state'].includes(document.kind)
            && document.key.endsWith(`:${options.focusObjectId}`));
        // 焦点只改变入选角色的召回模式；选择、排序与容量裁剪仍按普通角色处理。
        return focusedCharacter ? 'trigger' : document.recallMode;
    };
    // 模式顺序来自产品召回流程；同一模式按事实更新时间和稳定键排序，绝不使用 UI order、importance 或权重裁剪记忆。
    const ordered = [...documents].sort((a, b) => {
        if (a.disabled !== b.disabled)
            return Number(a.disabled) - Number(b.disabled);
        const modeDifference = modeRank[selectionMode(a)] - modeRank[selectionMode(b)];
        if (modeDifference)
            return modeDifference;
        const timeDifference = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        return timeDifference || a.key.localeCompare(b.key);
    });
    const seenKeys = new Set();
    const seenContents = new Set();
    const output = [];
    for (const doc of ordered) {
        if (seenKeys.has(doc.key))
            continue;
        // disable 条目不进入主模型上下文预算，但必须留在期望计划中，确保 ST 原条目被真正暂停而非提前删除。
        if (doc.disabled) {
            output.push({ ...doc, constant: false, vectorized: false, keywords: [], order: output.length + 100 });
            seenKeys.add(doc.key);
            continue;
        }
        const contentIdentity = doc.content.replace(/\s+/g, ' ').trim();
        if (contentIdentity && seenContents.has(contentIdentity))
            continue;
        output.push({ ...doc, order: output.length + 100 });
        seenKeys.add(doc.key);
        if (contentIdentity)
            seenContents.add(contentIdentity);
    }
    return output;
}
function narrativeContextDocument(options) {
    const content = narrativeContextText(options.narrativeContext);
    if (!content || content === '[当前叙事上下文]')
        return null;
    return {
        key: 'runtime:narrative-context',
        logicalKey: 'runtime:narrative-context',
        comment: '[MA11] MA｜当前叙事上下文',
        content,
        keywords: [],
        constant: true,
        vectorized: false,
        disabled: false,
        order: 1,
        updatedAt: options.narrativeContext?.generatedAt || '',
        kind: 'runtime:narrative-context',
        recallMode: 'constant',
        trigger: { any: [], all: [], exclude: [] },
        vector: { similarityThreshold: 0, maxResults: 1 },
        factIds: [],
        eventIds: [],
        // Current-context projection is a terminal projection and must not fan
        // out through recursive lorebook activation.
        allowRecursion: false,
    };
}

function buildSemanticLorebookDocuments(snapshot, small, large, options) {
    const tables = registry(options);
    const views = tableDocuments(snapshot, options);
    // 生命周期暂停只暂停原视图，不能占用事实/总结的代表资格；否则 settling 条目会形成召回空洞。
    const activeViews = views.filter((item) => !item.disabled);
    const representedFactIds = new Set(activeViews.flatMap((item) => item.factIds ?? []));
    const representedEventIds = new Set(activeViews.flatMap((item) => item.eventIds ?? []));
    const facts = options.internalFacts ?? [];
    const eventPublishingEnabled = Boolean(tableByRole(tables, 'events', false)?.enabled);
    // 已结算事件优先由总结承接；没有可用总结时才回退到正式事实。
    const summaryFallbacks = eventPublishingEnabled
        ? summaryFallbackDocuments(small, large, representedEventIds, options)
        : [];
    const summaryEventIds = new Set(summaryFallbacks.flatMap((item) => item.eventIds ?? []));
    const representedByViewOrSummary = new Set([...representedEventIds, ...summaryEventIds]);
    const factFallbacks = factDocuments(facts, representedFactIds, representedByViewOrSummary, tables, options);
    const currentContext = narrativeContextDocument(options);
    return selectLorebookDocuments([...(currentContext ? [currentContext] : []), ...views, ...factFallbacks, ...summaryFallbacks], options);
}
function buildDetailedLorebookDocuments(snapshot, small, large, options) {
    return buildSemanticLorebookDocuments(snapshot, small, large, options);
}
function buildLorebookDocuments(snapshot, small, large, options) {
    return options.layout === 'detailed' ? buildDetailedLorebookDocuments(snapshot, small, large, options) : buildSemanticLorebookDocuments(snapshot, small, large, options);
}

}
};
__defs["domain/memory-state-machine.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"alignPatchRowsToCanonicalSnapshot",{enumerable:true,configurable:true,get:()=>__require("domain/object-identity.js")["alignPatchRowsToCanonicalSnapshot"]});
Object.defineProperty(__scope,"canonicalObjectTitle",{enumerable:true,configurable:true,get:()=>__require("domain/object-identity.js")["canonicalObjectTitle"]});
Object.defineProperty(__scope,"canonicalizeObjectIdentities",{enumerable:true,configurable:true,get:()=>__require("domain/object-identity.js")["canonicalizeObjectIdentities"]});
Object.defineProperty(__scope,"deriveIncrementalSettlementDirectives",{enumerable:true,configurable:true,get:()=>__require("domain/incremental-settlement.js")["deriveIncrementalSettlementDirectives"]});
Object.defineProperty(__scope,"deriveSceneBoundary",{enumerable:true,configurable:true,get:()=>__require("domain/incremental-settlement.js")["deriveSceneBoundary"]});
Object.defineProperty(__scope,"deriveSpacetimeChange",{enumerable:true,configurable:true,get:()=>__require("domain/incremental-settlement.js")["deriveSpacetimeChange"]});
Object.defineProperty(__scope,"applyEntryLifecycleDirectives",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["applyEntryLifecycleDirectives"]});
Object.defineProperty(__scope,"finalizeSettlingEntries",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["finalizeSettlingEntries"]});
Object.defineProperty(__scope,"ensureCurrentSceneEntry",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["ensureCurrentSceneEntry"]});
Object.defineProperty(__scope,"enforceObjectViewAllocation",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["enforceObjectViewAllocation"]});
Object.defineProperty(__scope,"filterPassiveObservers",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["filterPassiveObservers"]});
Object.defineProperty(__scope,"preserveObjectBaseLayers",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["preserveObjectBaseLayers"]});
Object.defineProperty(__scope,"preservePersistentCharacters",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["preservePersistentCharacters"]});
Object.defineProperty(__scope,"removeFocusCharacterDuplicates",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["removeFocusCharacterDuplicates"]});
Object.defineProperty(__scope,"enforceSpacetimeSingleton",{enumerable:true,configurable:true,get:()=>__require("domain/special-table-rules.js")["enforceSpacetimeSingleton"]});
Object.defineProperty(__scope,"dedupeStrongStateRows",{enumerable:true,configurable:true,get:()=>__require("domain/state-text.js")["dedupeStrongStateRows"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
Object.defineProperty(__scope,"tableByRole",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["tableByRole"]});
Object.defineProperty(__scope,"linkedTargetRoles",{enumerable:true,configurable:true,get:()=>__require("domain/table-link-rules.js")["linkedTargetRoles"]});
with(__scope){
Object.defineProperty(exports,"preserveProtectedRows",{enumerable:true,configurable:true,get:()=>preserveProtectedRows});
Object.defineProperty(exports,"assertCommittedMemoryState",{enumerable:true,configurable:true,get:()=>assertCommittedMemoryState});
Object.defineProperty(exports,"transitionStateSnapshot",{enumerable:true,configurable:true,get:()=>transitionStateSnapshot});
Object.defineProperty(exports,"finalizeSummarySettlement",{enumerable:true,configurable:true,get:()=>finalizeSummarySettlement});
const MEMORY_STATE_VERSION = 2;
function cloneProtectedRow(row) {
    return structuredClone(row);
}
/**
 * 完全锁定行整行恢复；普通人工行只保护身份、基础内容和已固化历史。
 * 当前状态、关系与能力仍允许依据明确事实更新。
 */
function preserveProtectedRows(previous, next, registryValue) {
    const registry = normalizeTableRegistry(registryValue);
    previous = dedupeStrongStateRows(previous, registry);
    next = dedupeStrongStateRows(next, registry);
    const mutableFields = new Set([
        'currentFacts', 'currentStates', 'recentHistory', 'relationshipStates', 'abilityStates',
        'presentationStates', 'relatedObjects', 'relatedEvents', 'migrationStatus',
    ]);
    for (const table of registry) {
        const key = table.key;
        next[key] ||= [];
        const nextIndexById = new Map(next[key].map((row, index) => [row.id, index]));
        const nextIndexesByTitle = new Map();
        next[key].forEach((row, index) => {
            const title = canonicalObjectTitle(row.title);
            if (title)
                nextIndexesByTitle.set(title, [...(nextIndexesByTitle.get(title) ?? []), index]);
        });
        for (const row of previous[key] ?? []) {
            if (row.source !== 'manual' && !row.locked && row.lockMode !== 'all' && row.lockMode !== 'base')
                continue;
            const protectedRow = cloneProtectedRow(row);
            const title = canonicalObjectTitle(row.title);
            const titleIndexes = title ? nextIndexesByTitle.get(title) ?? [] : [];
            const existingIndex = nextIndexById.get(row.id) ?? titleIndexes[0];
            if (existingIndex === undefined) {
                nextIndexById.set(row.id, next[key].length);
                next[key].push(protectedRow);
                continue;
            }
            if (row.locked || row.lockMode === 'all') {
                next[key][existingIndex] = protectedRow;
                continue;
            }
            const generated = next[key][existingIndex];
            const oldFields = row.fields ?? {};
            const generatedFields = generated.fields ?? {};
            const mergedFields = { ...structuredClone(oldFields) };
            for (const field of mutableFields)
                if (field in generatedFields)
                    mergedFields[field] = structuredClone(generatedFields[field]);
            // 人工基础行仍可被正文中有事件证据的本质变化更新；完全锁定行在上方已整行恢复。
            // 这允许“原为男性，明确手术后成为女性”更新当前基础定义，同时保留稳定 ID 与变化事实。
            const oldBase = String(oldFields.baseContent ?? '').trim();
            const generatedBase = String(generatedFields.baseContent ?? '').trim();
            const explicitBaseRevision = Boolean(generated.baseRevisionEvidence?.eventId
                && generated.baseRevisionEvidence?.factId
                && generatedBase
                && generatedBase !== oldBase);
            if (explicitBaseRevision)
                mergedFields.baseContent = structuredClone(generatedFields.baseContent);
            next[key][existingIndex] = {
                ...generated,
                id: row.id,
                title: row.title,
                source: 'manual',
                locked: false,
                lockMode: 'base',
                fields: mergedFields,
                factIds: [...new Set([...(row.factIds ?? []), ...(generated.factIds ?? [])])],
                baseRevisionEvidence: explicitBaseRevision ? generated.baseRevisionEvidence : row.baseRevisionEvidence,
            };
        }
    }
    return dedupeStrongStateRows(next, registry);
}
/**
 * 已提交记忆状态的硬约束。生产链中只允许 active（无 entryLifecycle）或 settling。
 * 旧 absorbed/retired 必须在 repository 迁移阶段消化，不能流入普通游玩状态机。
 */
function assertCommittedMemoryState(snapshot, registryValue) {
    const registry = normalizeTableRegistry(registryValue);
    for (const table of registry) {
        const ids = new Set();
        for (const row of snapshot[table.key] ?? []) {
            if (ids.has(row.id))
                throw new Error(`已提交快照包含重复对象 ID：${table.key}/${row.id}`);
            ids.add(row.id);
            if (row.entryLifecycle && row.entryLifecycle.state !== 'settling') {
                throw new Error(`生产状态包含旧生命周期：${table.key}/${row.id}/${row.entryLifecycle.state}`);
            }
        }
    }
}
/**
 * 状态事实阶段的唯一编排入口。
 * 顺序固定：identity -> protected/base -> special tables -> lifecycle -> legacy migration -> observers。
 */
function transitionStateSnapshot(input) {
    const registry = normalizeTableRegistry(input.registry);
    const diagnostics = [];
    // spacetime_current 是固定槽位，地点切换必须在通用对象身份继承把标题收回旧值之前判定。
    const spacetimeChange = deriveSpacetimeChange(input.previous, input.incoming, registry);
    const sceneBoundary = deriveSceneBoundary(input.previous, input.incoming, registry, input.tableLinkRules);
    const spacetimeLinkedRoles = linkedTargetRoles(input.tableLinkRules, registry, 'spacetime');
    const identity = canonicalizeObjectIdentities(input.previous, input.incoming, registry);
    if (identity.idRemap.size)
        diagnostics.push({
            stage: 'identity', code: 'id-remap', detail: `继承并改写 ${identity.idRemap.size} 个对象 ID`,
        });
    const protectedMerged = preserveProtectedRows(input.previous, identity.snapshot, registry);
    const persistent = preservePersistentCharacters(input.previous, protectedMerged, registry);
    const basePreserved = preserveObjectBaseLayers(input.previous, persistent, registry);
    diagnostics.push({ stage: 'protected', code: 'protected-layers-applied', detail: '人工/锁定与基础历史层已恢复' });
    let prepared = removeFocusCharacterDuplicates(basePreserved, registry);
    if (spacetimeChange) {
        const spacetimeTable = tableByRole(registry, 'spacetime', false);
        const incomingCurrent = spacetimeTable
            ? (input.incoming[spacetimeTable.key] ?? []).find((row) => canonicalObjectTitle(row.title) === canonicalObjectTitle(spacetimeChange.currentTitle))
            : undefined;
        const preparedCurrent = spacetimeTable ? (prepared[spacetimeTable.key] ?? []).at(-1) : undefined;
        if (incomingCurrent && preparedCurrent) {
            // 当前时空是固定发布槽位，不是永久地点对象；切换时接受新内容但继续沿用固定 ID。
            Object.assign(preparedCurrent, structuredClone(incomingCurrent), { id: 'spacetime_current' });
        }
    }
    prepared = enforceObjectViewAllocation(prepared, registry);
    const spacetime = enforceSpacetimeSingleton(prepared, registry);
    prepared = spacetimeLinkedRoles.has('scenes')
        ? ensureCurrentSceneEntry(spacetime.snapshot, registry)
        : spacetime.snapshot;
    if (spacetime.mergedRowIds.length)
        diagnostics.push({
            stage: 'special-tables', code: 'spacetime-singleton', detail: `合并 ${spacetime.mergedRowIds.length} 条旧时空行`,
        });
    const alignedPatch = alignPatchRowsToCanonicalSnapshot(input.patchSnapshot, prepared, identity.idRemap, registry);
    if (alignedPatch.alignedRowCount)
        diagnostics.push({
            stage: 'identity', code: 'patch-id-aligned', detail: `将 ${alignedPatch.alignedRowCount} 条本轮补丁绑定到稳定对象 ID`,
        });
    const directives = deriveIncrementalSettlementDirectives({
        snapshot: prepared,
        patchSnapshot: alignedPatch.patchSnapshot,
        facts: input.facts,
        registry,
        focusObjectId: input.focusObjectId,
        sceneBoundary,
    });
    const lifecycle = applyEntryLifecycleDirectives(prepared, directives, registry, input.focusObjectId);
    if (lifecycle.appliedSourceIds.length || lifecycle.ignoredSourceIds.length)
        diagnostics.push({
            stage: 'lifecycle',
            code: 'settlement-transitions',
            detail: `应用 ${lifecycle.appliedSourceIds.length}，忽略 ${lifecycle.ignoredSourceIds.length}`,
        });
    const committed = filterPassiveObservers(lifecycle.snapshot, registry);
    assertCommittedMemoryState(committed, registry);
    return {
        snapshot: committed,
        memoryStateVersion: MEMORY_STATE_VERSION,
        lifecycleAppliedIds: lifecycle.appliedSourceIds,
        lifecycleIgnoredIds: lifecycle.ignoredSourceIds,
        sceneBoundary,
        // 字段仅保留 API 兼容；旧墓碑清理由 repository 的一次性迁移负责。
        legacyDeletedIds: [],
        diagnostics,
    };
}
function assertCoverageCommitted(input) {
    const byId = new Map(input.internalFacts.map((fact) => [fact.factId, fact]));
    for (const factId of input.sourceFactIds) {
        const fact = byId.get(factId);
        if (!fact)
            continue; // 旧总结可能只保留历史 source key，不能凭缺失记录阻塞迁移。
        const covered = input.coverageKind === 'small'
            ? Boolean(fact.consumedBySmallSummaryId || fact.solidifiedByLargeSummaryId)
            : Boolean(fact.solidifiedByLargeSummaryId);
        if (!covered)
            throw new Error(`${input.coverageKind === 'small' ? '小总结' : '大总结'}覆盖标记尚未提交：${factId}`);
    }
}
/**
 * 总结事务的结算入口。调用前必须已在同一事务副本写入 coverage 标记与总结层文本。
 */
function finalizeSummarySettlement(input) {
    assertCoverageCommitted(input);
    assertCommittedMemoryState(input.snapshot, input.registry);
    const result = finalizeSettlingEntries(input.snapshot, {
        eventId: input.eventId,
        sourceFactIds: input.sourceFactIds,
        eventClosed: input.eventClosed,
        internalFacts: input.internalFacts,
        registry: input.registry,
        focusObjectId: input.focusObjectId,
    });
    assertCommittedMemoryState(result.snapshot, input.registry);
    return {
        ...result,
        diagnostics: [{
                stage: 'summary-settlement',
                code: result.deletedRowIds.length ? 'physical-delete' : 'retained',
                detail: result.deletedRowIds.length
                    ? `总结覆盖后物理删除 ${result.deletedRowIds.length} 个容器`
                    : `本次保留 ${result.retainedRowIds.length} 个待结算容器`,
            }],
    };
}

}
};
__defs["domain/object-identity.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"dedupeStrongStateRows",{enumerable:true,configurable:true,get:()=>__require("domain/state-text.js")["dedupeStrongStateRows"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
with(__scope){
Object.defineProperty(exports,"canonicalObjectTitle",{enumerable:true,configurable:true,get:()=>canonicalObjectTitle});
Object.defineProperty(exports,"rewriteObjectReferences",{enumerable:true,configurable:true,get:()=>rewriteObjectReferences});
Object.defineProperty(exports,"alignPatchRowsToCanonicalSnapshot",{enumerable:true,configurable:true,get:()=>alignPatchRowsToCanonicalSnapshot});
Object.defineProperty(exports,"canonicalizeObjectIdentities",{enumerable:true,configurable:true,get:()=>canonicalizeObjectIdentities});
function canonicalObjectTitle(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .trim()
        .toLocaleLowerCase()
        .replace(/[\s·•._—–\-|｜:：()（）【】\[\]<>《》“”"'`]+/gu, '');
}
function stringArray(value, itemLimit = 500) {
    return Array.isArray(value) ? value.map((item) => safeText(item, itemLimit).trim()).filter(Boolean) : [];
}
function replaceExactValue(value, idRemap, deletedIds) {
    if (typeof value === 'string') {
        const token = value.trim();
        if (idRemap.has(token))
            return idRemap.get(token);
        if (deletedIds.has(token))
            return undefined;
        return value;
    }
    if (Array.isArray(value)) {
        return [...new Set(value
                .map((item) => replaceExactValue(item, idRemap, deletedIds))
                .filter((item) => item !== undefined))];
    }
    return value;
}
/** 精确改写对象 ID 引用；不按标题、正文或子串猜测。 */
function rewriteObjectReferences(snapshot, idRemap, deletedIds = new Set()) {
    if (!idRemap.size && !deletedIds.size)
        return snapshot;
    for (const rows of Object.values(snapshot)) {
        if (!Array.isArray(rows))
            continue;
        for (const row of rows) {
            if (!row.fields || typeof row.fields !== 'object')
                continue;
            for (const key of ['relatedObjects', 'relatedObjectIds', 'relatedEntities', 'participantIds', 'ownerId', 'holderId', 'hostId']) {
                if (!(key in row.fields))
                    continue;
                const replaced = replaceExactValue(row.fields[key], idRemap, deletedIds);
                if (replaced === undefined)
                    delete row.fields[key];
                else
                    row.fields[key] = replaced;
            }
        }
    }
    return snapshot;
}
function preserveAnchoredTitle(existing, incoming) {
    const incomingTitle = safeText(incoming.title, 240).trim();
    const anchoredTitle = safeText(existing.title, 240).trim() || incomingTitle;
    const alias = incomingTitle && canonicalObjectTitle(incomingTitle) !== canonicalObjectTitle(anchoredTitle) ? incomingTitle : '';
    return {
        ...incoming,
        id: existing.id,
        title: anchoredTitle,
        keywords: [...new Set([...(existing.keywords ?? []), ...(incoming.keywords ?? []), ...(alias ? [alias] : [])])].slice(0, 24),
        recall: {
            any: [...new Set([...(existing.recall?.any ?? []), ...(incoming.recall?.any ?? []), ...(alias ? [alias] : [])])].slice(0, 32),
            all: [...new Set([...(existing.recall?.all ?? []), ...(incoming.recall?.all ?? [])])].slice(0, 20),
            exclude: [...new Set([...(existing.recall?.exclude ?? []), ...(incoming.recall?.exclude ?? [])])].slice(0, 20),
        },
    };
}
function mergeRowsByIdentity(existing, incoming) {
    const fields = { ...(existing.fields ?? {}) };
    for (const [key, value] of Object.entries(incoming.fields ?? {})) {
        if (Array.isArray(value))
            fields[key] = [...new Set([...stringArray(fields[key]), ...stringArray(value)])];
        else if (safeText(value, 4000).trim())
            fields[key] = structuredClone(value);
    }
    return preserveAnchoredTitle(existing, {
        ...existing,
        ...incoming,
        id: existing.id,
        content: incoming.content || existing.content,
        keywords: [...new Set([...(existing.keywords ?? []), ...(incoming.keywords ?? [])])],
        factIds: [...new Set([...(existing.factIds ?? []), ...(incoming.factIds ?? [])])],
        eventId: incoming.eventId || existing.eventId,
        eventIds: [...new Set([
                ...(existing.eventIds ?? (existing.eventId ? [existing.eventId] : [])),
                ...(incoming.eventIds ?? (incoming.eventId ? [incoming.eventId] : [])),
            ])],
        fields,
        source: existing.source === 'manual' || incoming.source === 'manual' ? 'manual' : 'auto',
        locked: Boolean(existing.locked || incoming.locked),
        lockMode: existing.lockMode === 'all' || incoming.lockMode === 'all'
            ? 'all'
            : existing.lockMode === 'base' || incoming.lockMode === 'base'
                ? 'base'
                : undefined,
        entryLifecycle: incoming.entryLifecycle ?? existing.entryLifecycle,
        baseRevisionEvidence: incoming.baseRevisionEvidence ?? existing.baseRevisionEvidence,
    });
}
/**
 * 将模型本轮补丁重新绑定到唯一化后的稳定对象。
 * 只使用确定性唯一键；避免补丁仍携带临时 ID，导致后续生命周期阶段漏掉本轮触及行。
 */
function alignPatchRowsToCanonicalSnapshot(patchSnapshot, canonicalSnapshot, idRemap, registry) {
    const tables = normalizeTableRegistry(registry);
    const next = {};
    let alignedRowCount = 0;
    const eventIds = (row) => [...new Set([...(row.eventIds ?? []), row.eventId].map((item) => String(item || '').trim()).filter(Boolean))];
    for (const table of tables) {
        const canonicalRows = canonicalSnapshot[table.key] ?? [];
        const rows = structuredClone(patchSnapshot?.[table.key] ?? []);
        const byId = new Map(canonicalRows.map((row) => [row.id, row]));
        const byTitle = new Map();
        const byEvent = new Map();
        const byFact = new Map();
        for (const row of canonicalRows) {
            const title = canonicalObjectTitle(row.title);
            if (title)
                byTitle.set(title, [...(byTitle.get(title) ?? []), row]);
            for (const eventId of eventIds(row))
                byEvent.set(eventId, [...(byEvent.get(eventId) ?? []), row]);
            for (const factId of new Set(row.factIds ?? []))
                byFact.set(factId, [...(byFact.get(factId) ?? []), row]);
        }
        for (const row of rows) {
            const originalId = String(row.id || '').trim();
            const remappedId = idRemap.get(originalId);
            let matched = (remappedId && byId.get(remappedId)) || byId.get(originalId);
            if (!matched) {
                const candidates = new Set();
                const title = canonicalObjectTitle(row.title);
                if (title && byTitle.get(title)?.length === 1)
                    candidates.add(byTitle.get(title)[0]);
                for (const eventId of eventIds(row))
                    if (byEvent.get(eventId)?.length === 1)
                        candidates.add(byEvent.get(eventId)[0]);
                for (const factId of new Set(row.factIds ?? []))
                    if (byFact.get(factId)?.length === 1)
                        candidates.add(byFact.get(factId)[0]);
                if (candidates.size === 1)
                    matched = [...candidates][0];
            }
            if (matched && row.id !== matched.id) {
                row.id = matched.id;
                alignedRowCount += 1;
            }
        }
        if (rows.length)
            next[table.key] = rows;
    }
    return { patchSnapshot: next, alignedRowCount };
}
/**
 * 根据已有稳定 ID、唯一 event_id、唯一规范标题和唯一 fact_id 继承对象身份。
 * 所有匹配都要求在当前表中唯一，不做模糊语义猜测。
 */
function canonicalizeObjectIdentities(previous, incoming, registry) {
    const tables = normalizeTableRegistry(registry);
    const next = dedupeStrongStateRows(incoming, tables);
    const old = dedupeStrongStateRows(previous, tables);
    const idRemap = new Map();
    for (const table of tables) {
        const oldRows = old[table.key] ?? [];
        const newRows = next[table.key] ?? [];
        const oldById = new Map(oldRows.map((row) => [row.id, row]));
        const oldByEvent = new Map();
        const oldByTitle = new Map();
        const oldByFact = new Map();
        const newEventCounts = new Map();
        const newTitleCounts = new Map();
        const newFactCounts = new Map();
        const eventIds = (row) => [...new Set([...(row.eventIds ?? []), row.eventId].map((item) => String(item || '').trim()).filter(Boolean))];
        for (const row of newRows) {
            for (const eventId of eventIds(row))
                newEventCounts.set(eventId, (newEventCounts.get(eventId) ?? 0) + 1);
            const title = canonicalObjectTitle(row.title);
            if (title)
                newTitleCounts.set(title, (newTitleCounts.get(title) ?? 0) + 1);
            for (const factId of new Set(row.factIds ?? []))
                newFactCounts.set(factId, (newFactCounts.get(factId) ?? 0) + 1);
        }
        for (const row of oldRows) {
            for (const eventId of eventIds(row))
                oldByEvent.set(eventId, [...(oldByEvent.get(eventId) ?? []), row]);
            const title = canonicalObjectTitle(row.title);
            if (title)
                oldByTitle.set(title, [...(oldByTitle.get(title) ?? []), row]);
            for (const factId of new Set(row.factIds ?? []))
                oldByFact.set(factId, [...(oldByFact.get(factId) ?? []), row]);
        }
        const claimed = new Set();
        const uniqueUnclaimed = (rows) => rows?.length === 1 && !claimed.has(rows[0].id) ? rows[0] : undefined;
        for (const row of newRows) {
            let matched = oldById.get(row.id);
            if (matched && claimed.has(matched.id))
                matched = undefined;
            if (!matched) {
                const candidates = new Set();
                for (const eventId of eventIds(row)) {
                    if (newEventCounts.get(eventId) !== 1)
                        continue;
                    const candidate = uniqueUnclaimed(oldByEvent.get(eventId));
                    if (candidate)
                        candidates.add(candidate);
                }
                if (candidates.size === 1)
                    matched = [...candidates][0];
            }
            const title = canonicalObjectTitle(row.title);
            if (!matched && title && newTitleCounts.get(title) === 1)
                matched = uniqueUnclaimed(oldByTitle.get(title));
            if (!matched) {
                const candidates = new Set();
                for (const factId of new Set(row.factIds ?? [])) {
                    if (newFactCounts.get(factId) !== 1)
                        continue;
                    const candidate = uniqueUnclaimed(oldByFact.get(factId));
                    if (candidate)
                        candidates.add(candidate);
                }
                if (candidates.size === 1)
                    matched = [...candidates][0];
            }
            if (!matched)
                continue;
            const replacedId = row.id;
            Object.assign(row, preserveAnchoredTitle(matched, row));
            if (replacedId && replacedId !== matched.id)
                idRemap.set(replacedId, matched.id);
            claimed.add(matched.id);
        }
        const merged = new Map();
        for (const row of newRows) {
            const current = merged.get(row.id);
            merged.set(row.id, current ? mergeRowsByIdentity(current, row) : row);
        }
        next[table.key] = [...merged.values()];
    }
    rewriteObjectReferences(next, idRemap);
    return { snapshot: dedupeStrongStateRows(next, tables), idRemap };
}

}
};
__defs["domain/observer.js"]=function(exports,__require){
const __scope=Object.create(null);
with(__scope){
Object.defineProperty(exports,"isPurePassiveObserverText",{enumerable:true,configurable:true,get:()=>isPurePassiveObserverText});
/**
 * 模块职责：提供事实、快照与世界书发布共用的纯旁观判定。
 * 维护边界：含旁观措辞但产生明确因果介入时必须保留；否定介入不能被误判为介入。
 */
const PASSIVE_OBSERVER = /(纯观众|旁观|围观|观众|看客|路人|背景人物|未介入|只听见|喝彩|起哄|议论|人群反应|站在一旁|远处观看|观战)/i;
const CAUSAL_INTERVENTION = /(介入|出手|攻击|阻止|救援|治疗|打断|干预|加入战斗|改变战局|扭转|导致|造成|夺取|提供关键|发动|施放|控制|拦截|保护|击中|受伤|伤害|死亡|被俘)/i;
const NEGATED_INTERVENTION = /(?:未|没有|并未|从未|不曾)\s*(?:介入|出手|攻击|阻止|救援|治疗|打断|干预|加入战斗|改变战局|扭转|导致|造成|夺取|提供关键|发动|施放|控制|拦截|保护|击中|受伤|伤害)/gi;
function isPurePassiveObserverText(value) {
    const text = String(value ?? '');
    if (!PASSIVE_OBSERVER.test(text))
        return false;
    const affirmativeText = text.replace(NEGATED_INTERVENTION, '');
    return !CAUSAL_INTERVENTION.test(affirmativeText);
}

}
};
__defs["domain/publication-control.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
with(__scope){
Object.defineProperty(exports,"normalizeLorebookPublication",{enumerable:true,configurable:true,get:()=>normalizeLorebookPublication});
Object.defineProperty(exports,"detectPlayerDeletedLorebookEntries",{enumerable:true,configurable:true,get:()=>detectPlayerDeletedLorebookEntries});
Object.defineProperty(exports,"applyLorebookSuppressions",{enumerable:true,configurable:true,get:()=>applyLorebookSuppressions});
Object.defineProperty(exports,"updateLorebookPublicationLedger",{enumerable:true,configurable:true,get:()=>updateLorebookPublicationLedger});
Object.defineProperty(exports,"restoreLorebookSuppression",{enumerable:true,configurable:true,get:()=>restoreLorebookSuppression});
Object.defineProperty(exports,"suppressedLorebookEntries",{enumerable:true,configurable:true,get:()=>suppressedLorebookEntries});
function strings(value, limit = 160) {
    return [...new Set((Array.isArray(value) ? value : [])
            .map((item) => String(item ?? '').trim())
            .filter(Boolean))].slice(0, limit);
}

function normalizeRecord(value, fallbackKey = '') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const key = String(value.key || fallbackKey).trim();
    if (!key)
        return undefined;
    return {
        key,
        uid: String(value.uid ?? '').trim(),
        logicalKey: String(value.logicalKey || key).trim(),
        comment: String(value.comment || '').trim(),
        kind: String(value.kind || '').trim(),
        eventIds: strings(value.eventIds, 120),
        factIds: strings(value.factIds, 200),
        deletedAt: value.deletedAt ? String(value.deletedAt) : undefined,
        reason: value.reason ? String(value.reason) : undefined,
    };
}

function normalizeRecordMap(value) {
    const output = {};
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return output;
    for (const [key, record] of Object.entries(value)) {
        const normalized = normalizeRecord(record, key);
        if (normalized)
            output[normalized.key] = normalized;
    }
    return output;
}

function normalizeLorebookPublication(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        bookName: String(source.bookName || '').trim(),
        published: normalizeRecordMap(source.published),
        suppressed: normalizeRecordMap(source.suppressed),
    };
}

function managedInfo(entry) {
    return entry?.extensions?.mirrorAbyssV11 ?? null;
}

function existingManagedKeys(data, chatKey) {
    const keys = new Set();
    for (const entry of Object.values(data?.entries ?? {})) {
        const info = managedInfo(entry);
        if (info?.managed && info.chatKey === chatKey && info.key)
            keys.add(String(info.key));
    }
    return keys;
}

function detectPlayerDeletedLorebookEntries(state, data, desired, chatKey, bookName) {
    const publication = normalizeLorebookPublication(state?.lorebookPublication);
    state.lorebookPublication = publication;
    if (!publication.bookName || publication.bookName !== String(bookName || '').trim())
        return [];
    const existing = existingManagedKeys(data, chatKey);
    const detected = [];
    for (const [key, previous] of Object.entries(publication.published)) {
        if (!desired.has(key) || existing.has(key) || publication.suppressed[key])
            continue;
        publication.suppressed[key] = {
            ...previous,
            key,
            reason: 'player_deleted',
            deletedAt: nowIso(),
        };
        detected.push(key);
    }
    return detected;
}

function commentTitle(comment) {
    return String(comment || '')
        .replace(/^\s*\[MA11\]\s*/i, '')
        .split(/[｜|]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .at(-1) || '';
}

function relationToken(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function relationLineParts(line) {
    const match = String(line || '').match(/^(\s*(?:关联对象|直接关联对象|关联事件|直接关联事件|related\s*(?:objects?|events?))\s*[：:]\s*)(.*)$/i);
    return match ? { prefix: match[1], value: match[2] } : undefined;
}

function scrubRelationLine(line, suppressedTokens) {
    const parts = relationLineParts(line);
    if (!parts)
        return String(line || '');
    const values = parts.value
        .split(/[、,，;；|｜]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => {
            const normalized = relationToken(item);
            return !suppressedTokens.some((token) => token && (normalized === token || normalized.includes(token)));
        });
    return values.length ? `${parts.prefix}${values.join('、')}` : '';
}

function isEventPrimary(record) {
    const kind = String(record?.kind || '');
    const key = String(record?.key || '');
    return kind === 'view:events' || kind.startsWith('summary:') || key.startsWith('view:events:') || key.startsWith('summary:');
}

function specIsEventPrimary(spec, key) {
    const kind = String(spec?.kind || '');
    return kind === 'view:events' || kind.startsWith('summary:') || String(key).startsWith('view:events:') || String(key).startsWith('summary:');
}

function applyLorebookSuppressions(desired, state) {
    const publication = normalizeLorebookPublication(state?.lorebookPublication);
    state.lorebookPublication = publication;
    const suppressed = Object.values(publication.suppressed);
    if (!suppressed.length)
        return new Map(desired);
    const directKeys = new Set(suppressed.map((item) => item.key));
    const suppressedEventIds = new Set(suppressed.filter(isEventPrimary).flatMap((item) => item.eventIds));
    const relationTokens = new Set(suppressed.flatMap((item) => [commentTitle(item.comment), ...item.eventIds])
        .map(relationToken)
        .filter(Boolean));
    const output = new Map();
    for (const [key, source] of desired) {
        const eventIds = strings(source?.eventIds, 120);
        const sameSuppressedEvent = specIsEventPrimary(source, key)
            && eventIds.some((eventId) => suppressedEventIds.has(eventId));
        if (directKeys.has(key) || sameSuppressedEvent)
            continue;
        const suppressedTokens = [...relationTokens];
        const content = String(source?.content || '')
            .split('\n')
            .map((line) => scrubRelationLine(line, suppressedTokens))
            .filter(Boolean)
            .join('\n');
        output.set(key, {
            ...structuredClone(source),
            content,
            eventIds: eventIds.filter((eventId) => !suppressedEventIds.has(eventId)),
            // 玩家删除只否决世界书节点与显式关联，不改其他条目的事实来源。
            factIds: strings(source?.factIds, 200),
        });
    }
    return output;
}

function updateLorebookPublicationLedger(state, data, chatKey, bookName) {
    const publication = normalizeLorebookPublication(state?.lorebookPublication);
    const published = {};
    for (const [uid, entry] of Object.entries(data?.entries ?? {})) {
        const info = managedInfo(entry);
        if (!info?.managed || info.chatKey !== chatKey || !info.key)
            continue;
        const key = String(info.key);
        published[key] = {
            key,
            uid: String(uid),
            logicalKey: String(info.logicalKey || key),
            comment: String(entry.comment || ''),
            kind: String(info.kind || ''),
            eventIds: strings(info.eventIds, 120),
            factIds: strings(info.factIds, 200),
        };
    }
    state.lorebookPublication = {
        bookName: String(bookName || '').trim(),
        published,
        suppressed: publication.suppressed,
    };
    return state.lorebookPublication;
}

function restoreLorebookSuppression(state, key) {
    const publication = normalizeLorebookPublication(state?.lorebookPublication);
    const normalizedKey = String(key || '').trim();
    const existed = Boolean(normalizedKey && publication.suppressed[normalizedKey]);
    if (existed)
        delete publication.suppressed[normalizedKey];
    state.lorebookPublication = publication;
    return existed;
}

function suppressedLorebookEntries(state) {
    return Object.values(normalizeLorebookPublication(state?.lorebookPublication).suppressed)
        .sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')) || a.key.localeCompare(b.key));
}

}
};
__defs["domain/recording-boundary.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
with(__scope){
Object.defineProperty(exports,"normalizeRecordingBoundary",{enumerable:true,configurable:true,get:()=>normalizeRecordingBoundary});
Object.defineProperty(exports,"hasRecordingBoundary",{enumerable:true,configurable:true,get:()=>hasRecordingBoundary});
Object.defineProperty(exports,"recordingStartIndex",{enumerable:true,configurable:true,get:()=>recordingStartIndex});
Object.defineProperty(exports,"messageInsideRecordingBoundary",{enumerable:true,configurable:true,get:()=>messageInsideRecordingBoundary});
Object.defineProperty(exports,"createPlayerRecordingBoundary",{enumerable:true,configurable:true,get:()=>createPlayerRecordingBoundary});
function normalizeRecordingBoundary(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const startIndex = Number(value.startIndex);
    if (!Number.isInteger(startIndex) || startIndex < 0)
        return undefined;
    return {
        startIndex,
        setAt: String(value.setAt || nowIso()),
        source: ['player', 'legacy'].includes(String(value.source)) ? String(value.source) : 'player',
    };
}

function hasRecordingBoundary(state) {
    return Boolean(normalizeRecordingBoundary(state?.recordingBoundary));
}

function recordingStartIndex(state) {
    return normalizeRecordingBoundary(state?.recordingBoundary)?.startIndex;
}

function messageInsideRecordingBoundary(state, messageIndex) {
    const startIndex = recordingStartIndex(state);
    return startIndex !== undefined && Number.isInteger(messageIndex) && messageIndex >= startIndex;
}

function createPlayerRecordingBoundary(startIndex) {
    const normalized = Math.max(0, Math.trunc(Number(startIndex) || 0));
    return { startIndex: normalized, setAt: nowIso(), source: 'player' };
}

}
};
__defs["domain/snapshot.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"makeId",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["makeId"]});
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"canonicalObjectTitle",{enumerable:true,configurable:true,get:()=>__require("domain/object-identity.js")["canonicalObjectTitle"]});
Object.defineProperty(__scope,"canonicalizeObjectIdentities",{enumerable:true,configurable:true,get:()=>__require("domain/object-identity.js")["canonicalizeObjectIdentities"]});
Object.defineProperty(__scope,"rewriteObjectReferences",{enumerable:true,configurable:true,get:()=>__require("domain/object-identity.js")["rewriteObjectReferences"]});
Object.defineProperty(__scope,"isEntryLifecycleHidden",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["isEntryLifecycleHidden"]});
Object.defineProperty(__scope,"normalizeEntryLifecycleValue",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["normalizeEntryLifecycleValue"]});
Object.defineProperty(__scope,"visibleStateRows",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["visibleStateRows"]});
Object.defineProperty(__scope,"enforceSpacetimeSingleton",{enumerable:true,configurable:true,get:()=>__require("domain/special-table-rules.js")["enforceSpacetimeSingleton"]});
Object.defineProperty(__scope,"isHistoricalSceneRow",{enumerable:true,configurable:true,get:()=>__require("domain/special-table-rules.js")["isHistoricalSceneRow"]});
Object.defineProperty(__scope,"isPurePassiveObserverText",{enumerable:true,configurable:true,get:()=>__require("domain/observer.js")["isPurePassiveObserverText"]});
Object.defineProperty(__scope,"dedupeStrongStateRows",{enumerable:true,configurable:true,get:()=>__require("domain/state-text.js")["dedupeStrongStateRows"]});
Object.defineProperty(__scope,"mergeDuplicateStateRows",{enumerable:true,configurable:true,get:()=>__require("domain/state-text.js")["mergeDuplicateStateRows"]});
Object.defineProperty(__scope,"DEFAULT_TABLE_REGISTRY",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["DEFAULT_TABLE_REGISTRY"]});
Object.defineProperty(__scope,"migrateSnapshotTables",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["migrateSnapshotTables"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
Object.defineProperty(__scope,"tableByKey",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["tableByKey"]});
Object.defineProperty(__scope,"tableByRole",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["tableByRole"]});
Object.defineProperty(exports,"rewriteObjectReferences",{enumerable:true,configurable:true,get:()=>__require("domain/object-identity.js")["rewriteObjectReferences"]});
Object.defineProperty(exports,"isEntryLifecycleHidden",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["isEntryLifecycleHidden"]});
Object.defineProperty(exports,"isEntryParticipationPaused",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["isEntryParticipationPaused"]});
Object.defineProperty(exports,"visibleStateRows",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["visibleStateRows"]});
with(__scope){
Object.defineProperty(exports,"emptySnapshot",{enumerable:true,configurable:true,get:()=>emptySnapshot});
Object.defineProperty(exports,"normalizeKeywords",{enumerable:true,configurable:true,get:()=>normalizeKeywords});
Object.defineProperty(exports,"defaultLifecycle",{enumerable:true,configurable:true,get:()=>defaultLifecycle});
Object.defineProperty(exports,"normalizeLifecycle",{enumerable:true,configurable:true,get:()=>normalizeLifecycle});
Object.defineProperty(exports,"normalizeRow",{enumerable:true,configurable:true,get:()=>normalizeRow});
Object.defineProperty(exports,"normalizeSnapshot",{enumerable:true,configurable:true,get:()=>normalizeSnapshot});
Object.defineProperty(exports,"preservePersistentCharacters",{enumerable:true,configurable:true,get:()=>preservePersistentCharacters});
Object.defineProperty(exports,"preserveObjectBaseLayers",{enumerable:true,configurable:true,get:()=>preserveObjectBaseLayers});
Object.defineProperty(exports,"removeFocusCharacterDuplicates",{enumerable:true,configurable:true,get:()=>removeFocusCharacterDuplicates});
Object.defineProperty(exports,"mergePersistedCharacterDuplicates",{enumerable:true,configurable:true,get:()=>mergePersistedCharacterDuplicates});
Object.defineProperty(exports,"preserveStableObjectIds",{enumerable:true,configurable:true,get:()=>preserveStableObjectIds});
Object.defineProperty(exports,"enforceObjectViewAllocation",{enumerable:true,configurable:true,get:()=>enforceObjectViewAllocation});
Object.defineProperty(exports,"enforceCurrentSpacetimeSingleton",{enumerable:true,configurable:true,get:()=>enforceCurrentSpacetimeSingleton});
Object.defineProperty(exports,"ensureCurrentSceneEntry",{enumerable:true,configurable:true,get:()=>ensureCurrentSceneEntry});
Object.defineProperty(exports,"snapshotRowCount",{enumerable:true,configurable:true,get:()=>snapshotRowCount});
Object.defineProperty(exports,"upsertManualRow",{enumerable:true,configurable:true,get:()=>upsertManualRow});
Object.defineProperty(exports,"moveManualRow",{enumerable:true,configurable:true,get:()=>moveManualRow});
Object.defineProperty(exports,"deleteRow",{enumerable:true,configurable:true,get:()=>deleteRow});
Object.defineProperty(exports,"filterPassiveObservers",{enumerable:true,configurable:true,get:()=>filterPassiveObservers});
// 生命周期写操作只允许从 entry-lifecycle / memory-state-machine 进入。
// snapshot 仅保留只读参与状态辅助函数，避免形成第二个写入入口。
const EXISTENCE_STATES = new Set([
    '存活', '死亡已确认', '存在未知', '失踪', '身份存疑', '虚构或误认已确认', '存在被抹除', '未标注', '不适用',
]);
const ACTIVITY_STATES = new Set([
    '当前在场', '当前相关', '离场但仍活跃', '休眠', '长期休眠', '已归档', '未标注', '不适用',
]);
const MEMORY_STATES = new Set([
    '广泛记得', '部分人物记得', '仅记录留存', '仅痕迹留存', '无人可确认记得', '记忆被篡改', '记忆被抹除', '未标注', '不适用',
]);
const EVIDENCE_LEVELS = new Set(['已确认', '可靠记录', '多方陈述', '单方陈述', '推测', '未知']);
const STANDARD_FIELDS = new Set(['id', 'title', 'name', 'content', 'summary', 'keywords', 'status', 'source', 'locked', 'lockMode', 'lifecycle', 'entryLifecycle', 'updatedAt', 'factIds', 'fact_ids', 'eventId', 'event_id', 'eventIds', 'event_ids', 'recall', 'fields']);
function registryOrDefault(registry) {
    return normalizeTableRegistry(registry?.length ? registry : DEFAULT_TABLE_REGISTRY);
}
/** 非枚举 characters 别名只用于 rc.19 测试/API 兼容，不会进入模型输出。 */
function characterTableKey(registry) {
    return tableByRole(registry, 'characters', false)?.key || tableByRole(registry, 'state', false)?.key;
}
function attachLegacyAliases(snapshot, registry) {
    const key = characterTableKey(registry);
    if (!key || !(key in snapshot))
        return snapshot;
    for (const alias of ['characters', 'state']) {
        if (alias === key || Object.prototype.hasOwnProperty.call(snapshot, alias))
            continue;
        Object.defineProperty(snapshot, alias, {
            configurable: true, enumerable: false,
            get: () => snapshot[key],
            set: (value) => { snapshot[key] = Array.isArray(value) ? value : []; },
        });
    }
    return snapshot;
}
function emptySnapshot(registry, includeDisabled = true) {
    const tables = registryOrDefault(registry).filter((table) => includeDisabled || table.enabled);
    return attachLegacyAliases(Object.fromEntries(tables.map((table) => [table.key, []])), tables);
}
function normalizeKeywords(value) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => safeText(item, 80).trim()).filter(Boolean))].slice(0, 24);
}
function normalizeStringList(value, limit = 20, itemLimit = 240) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => safeText(item, itemLimit).trim()).filter(Boolean))].slice(0, limit);
}
function enumValue(value, allowed, fallback) {
    const text = safeText(value, 80).trim();
    return allowed.has(text) ? text : fallback;
}
function defaultLifecycle() {
    return { existence: '未标注', activity: '未标注', memory: '未标注', evidenceLevel: '未知', evidence: '', returnConditions: [], returnBlockers: [] };
}
function normalizeLifecycle(value, previous) {
    const source = value && typeof value === 'object' ? value : {};
    const base = previous ?? defaultLifecycle();
    return {
        existence: enumValue(source.existence ?? base.existence, EXISTENCE_STATES, base.existence),
        activity: enumValue(source.activity ?? base.activity, ACTIVITY_STATES, base.activity),
        memory: enumValue(source.memory ?? base.memory, MEMORY_STATES, base.memory),
        evidenceLevel: enumValue(source.evidenceLevel ?? base.evidenceLevel, EVIDENCE_LEVELS, base.evidenceLevel),
        evidence: safeText(source.evidence ?? base.evidence, 4000).trim(),
        returnConditions: normalizeStringList(source.returnConditions ?? base.returnConditions),
        returnBlockers: normalizeStringList(source.returnBlockers ?? base.returnBlockers),
    };
}
function normalizeRecall(value, title, keywords) {
    const source = value && typeof value === 'object' ? value : {};
    const any = normalizeStringList(source.any, 24, 100);
    return {
        any: any.length ? any : normalizeKeywords([title, ...keywords]),
        all: normalizeStringList(source.all, 16, 100),
        exclude: normalizeStringList(source.exclude, 16, 100),
    };
}
function normalizeCustomFields(source, table, previous) {
    const prior = previous?.fields && typeof previous.fields === 'object' ? previous.fields : {};
    const nested = source.fields && typeof source.fields === 'object' ? source.fields : {};
    const output = {};
    for (const field of table.fields) {
        if (STANDARD_FIELDS.has(field.key) || field.key === 'lifecycle')
            continue;
        const raw = source[field.key] ?? nested[field.key] ?? prior[field.key];
        if (field.type === 'string[]')
            output[field.key] = normalizeStringList(raw, 30, 500);
        else
            output[field.key] = safeText(raw, 4000).trim();
    }
    return output;
}
function normalizeRow(value, tableKey, index, previous, registry) {
    const tables = registryOrDefault(registry);
    const table = tableByKey(tables, tableKey) ?? { key: tableKey, name: tableKey, role: 'custom', fields: [] };
    const source = value && typeof value === 'object' ? value : {};
    const now = nowIso();
    const id = safeText(source.id || previous?.id || makeId(tableKey), 160).trim() || makeId(tableKey);
    const manual = source.source === 'manual' || previous?.source === 'manual';
    const locked = Boolean(source.locked ?? previous?.locked ?? false);
    const rawLockMode = safeText(source.lockMode ?? previous?.lockMode, 20).trim();
    const lockMode = locked || rawLockMode === 'all' ? 'all' : manual || rawLockMode === 'base' ? 'base' : undefined;
    const incomingTitle = safeText(source.title || source.name || previous?.title || `${table.name} ${index + 1}`, 240).trim();
    const previousTitle = safeText(previous?.title, 240).trim();
    // 同一稳定 ID 的自动归一化必须沿用首次名称；只有玩家手动编辑可显式改名。
    const title = !manual && previousTitle ? previousTitle : incomingTitle;
    const keywords = manual
        ? normalizeKeywords(source.keywords ?? previous?.keywords ?? [])
        : normalizeKeywords([
            ...(previous?.keywords ?? []),
            ...normalizeKeywords(source.keywords ?? []),
            ...(incomingTitle && identityTitle(incomingTitle) !== identityTitle(title) ? [incomingTitle] : []),
        ]);
    const supportsLifecycle = ['characters', 'state'].includes(table.role) || table.fields.some((field) => field.type === 'lifecycle');
    const lifecycleInput = source.lifecycle ?? previous?.lifecycle;
    const entryLifecycle = normalizeEntryLifecycleValue(source.entryLifecycle ?? previous?.entryLifecycle, previous?.entryLifecycle);
    const factIds = normalizeStringList(source.factIds ?? source.fact_ids ?? previous?.factIds, 40, 160);
    const eventId = safeText(source.eventId ?? source.event_id ?? previous?.eventId, 160).trim() || undefined;
    const eventIds = normalizeStringList(source.eventIds ?? source.event_ids ?? previous?.eventIds ?? (eventId ? [eventId] : []), 60, 160);
    if (eventId && !eventIds.includes(eventId))
        eventIds.unshift(eventId);
    const content = safeText(source.content || source.summary || previous?.content || '', 12000).trim();
    const fields = normalizeCustomFields(source, table, previous);
    if (manual && !safeText(fields.baseContent, 12000).trim() && content)
        fields.baseContent = content;
    return {
        id,
        title,
        content,
        keywords,
        status: safeText(source.status || previous?.status || 'active', 120).trim() || 'active',
        source: manual ? 'manual' : 'auto',
        locked: lockMode === 'all',
        lockMode,
        lifecycle: supportsLifecycle && lifecycleInput ? normalizeLifecycle(lifecycleInput, previous?.lifecycle) : undefined,
        updatedAt: safeText(source.updatedAt || previous?.updatedAt || now, 80) || now,
        fields,
        factIds,
        eventId: eventId || eventIds[0],
        eventIds,
        recall: normalizeRecall(source.recall ?? previous?.recall, title, keywords),
        semanticRole: table.role,
        entryLifecycle,
    };
}
function normalizeSnapshot(value, previousSnapshot, registry, includeDisabled = true) {
    const tables = registryOrDefault(registry).filter((table) => includeDisabled || table.enabled);
    const source = migrateSnapshotTables(value, tables);
    const previous = previousSnapshot ? migrateSnapshotTables(previousSnapshot, tables) : {};
    const output = emptySnapshot(tables, true);
    for (const table of tables) {
        const key = table.key;
        const rows = Array.isArray(source[key]) ? source[key] : [];
        const previousMap = new Map((previous[key] ?? []).map((row) => [row.id, row]));
        const used = new Set();
        output[key] = rows.map((row, index) => {
            const rawId = row && typeof row === 'object' ? safeText(row.id, 160) : '';
            const normalized = normalizeRow(row, key, index, rawId ? previousMap.get(rawId) : undefined, tables);
            if (used.has(normalized.id))
                normalized.id = makeId(key);
            used.add(normalized.id);
            return normalized;
        });
    }
    return attachLegacyAliases(dedupeStrongStateRows(output, tables), tables);
}
function identityTitle(value) {
    return canonicalObjectTitle(value);
}
function stateRows(snapshot, registry) {
    const key = characterTableKey(registry);
    return key ? snapshot[key] ?? [] : [];
}
/** 保留已建立主体，人工/锁定行优先；仅视图层维护，不代表自动创建人物卡。 */
function preservePersistentCharacters(previous, next, registry) {
    const tables = registryOrDefault(registry);
    previous = dedupeStrongStateRows(previous, tables);
    next = dedupeStrongStateRows(next, tables);
    const key = characterTableKey(tables);
    if (!key)
        return next;
    const nextRows = next[key] ?? (next[key] = []);
    const oldRows = previous[key] ?? previous.characters ?? [];
    const byId = new Map(nextRows.map((row) => [row.id, row]));
    const idRemap = new Map();
    const nextByTitle = new Map();
    for (const row of nextRows) {
        const title = identityTitle(row.title);
        if (title)
            nextByTitle.set(title, [...(nextByTitle.get(title) ?? []), row]);
    }
    for (const oldRow of oldRows) {
        if (byId.has(oldRow.id))
            continue;
        const title = identityTitle(oldRow.title);
        const titleMatches = title ? nextByTitle.get(title) ?? [] : [];
        const titleMatch = titleMatches[0];
        if (titleMatch) {
            const replacedId = titleMatch.id;
            titleMatch.id = oldRow.id;
            if (replacedId && replacedId !== oldRow.id)
                idRemap.set(replacedId, oldRow.id);
            if (oldRow.locked || oldRow.lockMode === 'all') {
                Object.assign(titleMatch, structuredClone(oldRow));
            }
            else if (oldRow.source === 'manual' || oldRow.lockMode === 'base') {
                const generatedFields = titleMatch.fields ?? {};
                const oldFields = oldRow.fields ?? {};
                titleMatch.title = oldRow.title;
                titleMatch.source = 'manual';
                titleMatch.locked = false;
                titleMatch.lockMode = 'base';
                titleMatch.fields = {
                    ...structuredClone(oldFields),
                    currentStates: structuredClone(generatedFields.currentStates ?? oldFields.currentStates ?? []),
                    relationshipStates: structuredClone(generatedFields.relationshipStates ?? oldFields.relationshipStates ?? []),
                    abilityStates: structuredClone(generatedFields.abilityStates ?? oldFields.abilityStates ?? []),
                    relatedObjects: structuredClone(generatedFields.relatedObjects ?? oldFields.relatedObjects ?? []),
                    relatedEvents: structuredClone(generatedFields.relatedEvents ?? oldFields.relatedEvents ?? []),
                };
            }
            else if (!titleMatch.lifecycle && oldRow.lifecycle) {
                titleMatch.lifecycle = structuredClone(oldRow.lifecycle);
            }
            byId.set(oldRow.id, titleMatch);
            continue;
        }
        const restored = structuredClone(oldRow);
        nextRows.push(restored);
        byId.set(restored.id, restored);
        if (title)
            nextByTitle.set(title, [...(nextByTitle.get(title) ?? []), restored]);
    }
    next[key] = nextRows;
    rewriteObjectReferences(next, idRemap);
    return attachLegacyAliases(dedupeStrongStateRows(next, tables), tables);
}
/** 基础内容与已固化历史不是状态提取的可写区；已有值始终由上一快照覆盖回去。 */
function preserveObjectBaseLayers(previous, next, registry) {
    const tables = registryOrDefault(registry);
    previous = dedupeStrongStateRows(previous, tables);
    next = dedupeStrongStateRows(next, tables);
    for (const table of tables) {
        const previousRows = previous[table.key] ?? [];
        const byId = new Map(previousRows.map((row) => [row.id, row]));
        const previousByTitle = new Map();
        for (const row of previousRows) {
            const title = identityTitle(row.title);
            if (title)
                previousByTitle.set(title, [...(previousByTitle.get(title) ?? []), row]);
        }
        for (const row of next[table.key] ?? []) {
            const title = identityTitle(row.title);
            const titleMatches = title ? previousByTitle.get(title) ?? [] : [];
            const old = byId.get(row.id) ?? titleMatches[0];
            if (!old)
                continue;
            row.fields ||= {};
            const oldFields = old.fields ?? {};
            const existingBase = safeText(oldFields.baseContent, 12000).trim();
            const incomingBase = safeText(row.fields.baseContent, 12000).trim();
            const explicitRevision = Boolean(row.baseRevisionEvidence?.eventId
                && row.baseRevisionEvidence?.factId
                && incomingBase
                && incomingBase !== existingBase);
            if (existingBase && !explicitRevision)
                row.fields.baseContent = structuredClone(oldFields.baseContent);
            // 空基础层可以初始化；已有基础层只有携带插件生成的事件证据时才允许替换。
            if ('recentHistory' in oldFields)
                row.fields.recentHistory = structuredClone(oldFields.recentHistory);
            else
                delete row.fields.recentHistory;
            if ('solidifiedHistory' in oldFields)
                row.fields.solidifiedHistory = structuredClone(oldFields.solidifiedHistory);
            else
                delete row.fields.solidifiedHistory;
        }
    }
    return attachLegacyAliases(dedupeStrongStateRows(next, tables), tables);
}
function characterTitleAliases(title) {
    const raw = String(title || '').trim();
    const parts = raw.split(/[｜|:：—–-]/).map(identityTitle).filter(Boolean);
    const stripped = identityTitle(raw.replace(/(?:人物|角色|人物状态|角色状态|档案|信息|当前状态)$/g, ''));
    return [...new Set([identityTitle(raw), stripped, ...parts].filter(Boolean))];
}
function removeFocusCharacterDuplicates(snapshot, registry) {
    const tables = registryOrDefault(registry);
    const focusKey = tableByRole(tables, 'focus', false)?.key;
    if (!focusKey)
        return snapshot;
    const characters = stateRows(snapshot, tables);
    const aliases = new Set(characters.flatMap((row) => characterTitleAliases(row.title)));
    const contents = new Set(characters.map((row) => identityTitle(row.content)).filter((value) => value.length >= 12));
    snapshot[focusKey] = (snapshot[focusKey] ?? []).filter((row) => {
        if (row.source === 'manual' || row.locked)
            return true;
        const title = identityTitle(row.title);
        const content = identityTitle(row.content);
        return !(title && aliases.has(title)) && !(content.length >= 12 && contents.has(content));
    });
    return snapshot;
}
function rowArray(value) {
    return Array.isArray(value) ? value.map((item) => safeText(item, 500).trim()).filter(Boolean) : [];
}
const LEGACY_CHARACTER_STATE_FIELDS = ['currentFacts', 'currentStates', 'recentHistory', 'relationshipStates', 'abilityStates', 'presentationStates'];
function legacyCharacterTitle(value) {
    const original = safeText(value, 240).trim();
    let title = original
        .replace(/^(?:人物|角色)(?:的)?(?:当前)?状态\s*[:：|｜-]\s*/i, '')
        .replace(/^(?:人物|角色|档案|信息)\s*[:：|｜-]\s*/i, '')
        .replace(/\s*(?:的)?(?:人物|角色)?(?:当前)?状态\s*$/i, '')
        .replace(/\s*(?:人物|角色)?(?:档案|信息)\s*$/i, '')
        .trim();
    if (!title)
        title = original;
    const token = identityTitle(title);
    return new Set(['角色', '人物', '未知', '未命名', 'unknown', 'unknowncharacter']).has(token) ? '' : title;
}
function explicitLegacyStateTitle(value) {
    const title = safeText(value, 240).trim();
    return /^(?:人物|角色)(?:的)?(?:当前)?状态\s*[:：|｜-]/i.test(title)
        || /(?:的)?(?:人物|角色)?(?:当前)?状态\s*$/i.test(title);
}
function legacyBaseSignal(row) {
    const baseContent = safeText(row.fields?.baseContent, 12000).trim();
    return Boolean(baseContent || row.source === 'manual' || row.locked || row.lockMode === 'base' || row.lockMode === 'all');
}
function legacyStateSignal(row) {
    const generatedId = /^characters(?:_|$)/i.test(safeText(row.id, 160).trim());
    const mutableState = LEGACY_CHARACTER_STATE_FIELDS.some((field) => rowArray(row.fields?.[field]).length > 0);
    return explicitLegacyStateTitle(row.title) || (generatedId && mutableState);
}
function mergedRecall(base, state) {
    if (!base && !state)
        return undefined;
    return {
        any: [...new Set([...(base?.any ?? []), ...(state?.any ?? [])])],
        all: [...new Set([...(base?.all ?? []), ...(state?.all ?? [])])],
        exclude: [...new Set([...(base?.exclude ?? []), ...(state?.exclude ?? [])])],
    };
}
/**
 * 已建立对象的 title 是长期身份锚点。自动状态提取只能更新内容与别名，不能改名。
 * 模型若对同一稳定对象换了称呼，将新称呼并入 keywords / recall.any，继续沿用旧 title。
 * 玩家手动编辑不经过本函数，仍可显式修改条目名称。
 */
function preserveAnchoredTitle(existing, incoming) {
    const incomingTitle = safeText(incoming.title, 240).trim();
    const anchoredTitle = safeText(existing.title, 240).trim() || incomingTitle;
    const alias = incomingTitle && identityTitle(incomingTitle) !== identityTitle(anchoredTitle)
        ? incomingTitle
        : '';
    const keywords = normalizeKeywords([
        ...(existing.keywords ?? []),
        ...(incoming.keywords ?? []),
        ...(alias ? [alias] : []),
    ]);
    const recall = mergedRecall(existing.recall, incoming.recall);
    if (recall)
        recall.any = normalizeKeywords([...(recall.any ?? []), anchoredTitle, ...keywords]);
    return {
        ...incoming,
        id: existing.id,
        title: anchoredTitle,
        keywords,
        recall,
    };
}
/**
 * 仅供 V30 一次性升级使用：旧版本可能已把同一角色的多个切面保存为同名不同 ID。
 * 现在同一 characters 表内同一规范名称必须收拢为一个对象，其他 ID 引用同步改写。
 */
function mergePersistedCharacterDuplicates(snapshot, registry) {
    const tables = registryOrDefault(registry);
    const key = characterTableKey(tables);
    const idRemap = new Map();
    if (!key)
        return { snapshot, idRemap, mergedCount: 0 };
    // 尚保留可枚举旧 state 表时应交给 V29 的确定性双表迁移，V30 不参与猜测。
    if (key !== 'state' && Object.prototype.propertyIsEnumerable.call(snapshot, 'state') && Array.isArray(snapshot.state)) {
        return { snapshot, idRemap, mergedCount: 0 };
    }
    const working = structuredClone(snapshot);
    const groups = new Map();
    for (const row of working[key] ?? []) {
        const displayTitle = legacyCharacterTitle(row.title);
        const token = identityTitle(displayTitle);
        if (!token)
            continue;
        groups.set(token, [...(groups.get(token) ?? []), row]);
    }
    for (const rows of groups.values()) {
        if (rows.length < 2)
            continue;
        const protectedRows = rows.filter(legacyBaseSignal);
        const canonical = protectedRows.find((row) => row.locked || row.lockMode === 'all')
            ?? protectedRows[0]
            ?? rows[0];
        const title = legacyCharacterTitle(canonical.title) || canonical.title;
        const stateRows = rows.filter(legacyStateSignal);
        const freshestState = [...stateRows].sort((left, right) => {
            const time = String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
            return time || String(right.id || '').localeCompare(String(left.id || ''));
        })[0];
        if (freshestState) {
            canonical.content = freshestState.content || canonical.content;
            canonical.status = freshestState.status || canonical.status;
            canonical.updatedAt = freshestState.updatedAt || canonical.updatedAt;
            canonical.lifecycle = structuredClone(freshestState.lifecycle ?? canonical.lifecycle);
            canonical.eventId = freshestState.eventId || canonical.eventId;
        }
        const suppliedStateFields = new Set();
        for (const row of stateRows) {
            for (const field of LEGACY_CHARACTER_STATE_FIELDS) {
                if (Object.prototype.hasOwnProperty.call(row.fields ?? {}, field))
                    suppliedStateFields.add(field);
            }
        }
        for (const row of protectedRows) {
            if (!suppliedStateFields.size)
                continue;
            row.fields ||= {};
            for (const field of suppliedStateFields)
                delete row.fields[field];
        }
        for (const row of rows) {
            const originalTitle = safeText(row.title, 240).trim();
            row.title = title;
            if (originalTitle && identityTitle(originalTitle) !== identityTitle(title)) {
                row.keywords = normalizeKeywords([...(row.keywords ?? []), originalTitle]);
            }
        }
    }
    const result = mergeDuplicateStateRows(working, tables, new Set([key]));
    return {
        snapshot: attachLegacyAliases(result.snapshot, tables),
        idRemap: result.idRemap,
        mergedCount: result.mergedCount,
    };
}
/**
 * 兼容旧 API：执行集中对象身份模块，并保留传入 next 的原位更新语义。
 */
function preserveStableObjectIds(previous, next, registry) {
    const tables = registryOrDefault(registry);
    const target = next;
    const result = canonicalizeObjectIdentities(previous, next, tables).snapshot;
    for (const key of Object.keys(target))
        delete target[key];
    for (const [key, rows] of Object.entries(result))
        target[key] = rows;
    return attachLegacyAliases(target, tables);
}
function regionStateText(row) {
    const fields = row.fields ?? {};
    return [row.title, row.content, row.status, ...rowArray(fields.currentFacts), ...rowArray(fields.currentStates), ...rowArray(fields.recentHistory), ...rowArray(fields.solidifiedHistory)].join(' ');
}
/**
 * 区域不是“当前位置”的副本。仅因进入、停留或提及地点产生的自动区域行会被剔除；
 * 有基础定义、长期历史或离开场景后仍成立的区域变化继续保留。
 */
function enforceObjectViewAllocation(snapshot, registry) {
    const tables = registryOrDefault(registry);
    const spacetimeKey = tableByRole(tables, 'spacetime', false)?.key;
    const regionKey = tableByRole(tables, 'regions', false)?.key;
    if (!spacetimeKey || !regionKey)
        return snapshot;
    const spacetimeRows = snapshot[spacetimeKey] ?? [];
    const activeRows = spacetimeRows.filter((row) => !isEntryLifecycleHidden(row) && !/(已离开|历史场景|过去场景|非当前|已结束|已关闭|已归档|inactive|closed|ended|archived)/i.test(`${row.status} ${row.content}`));
    const current = activeRows.at(-1);
    if (!current)
        return snapshot;
    const currentIdentity = identityTitle(current.title);
    // 自动区域必须证明自己是独立对象：有稳定基础定义、已固化历史，或离开当前场景后仍成立的变化。
    // 纯进入/停留、设施列举、路径说明和一次性提及既不能复制当前时空，也不能以“另一个地点”名义残留。
    const persistentChangeSignal = /(封锁|解封|开放|关闭|停用|启用|损坏|损毁|坍塌|重建|占领|失守|戒严|污染|净化|改造|沦陷|恢复|摧毁|建成|归属改变|控制权|驻军撤离|驻军进驻|灾害|危机解除|永久|长期持续)/i;
    const sceneOnlySignal = /(当前|进入|来到|抵达|停留|正在|位于|设有|用于|用作|配备|包含|连接|通往|内部有|内有|可供)/i;
    const stableDefinitionSignal = /(属于|隶属|管辖|地处|坐落|是一座|是一个|是一处|是一片|区域类型|建筑类型|辖区|边界|常年|主要居民|主要产业|地貌|气候|历史上)/i;
    snapshot[regionKey] = (snapshot[regionKey] ?? []).filter((row) => {
        if (row.source === 'manual' || row.locked || row.lockMode === 'all')
            return true;
        const fields = row.fields ?? {};
        const baseContent = safeText(fields.baseContent, 12000).trim();
        const hasHistory = rowArray(fields.solidifiedHistory).length > 0;
        const text = regionStateText(row);
        if (hasHistory || persistentChangeSignal.test(text))
            return true;
        // 没有基础层或持续变化的自动行只是一次性场景记录，不应进入区域对象视图。
        if (!baseContent)
            return false;
        const regionIdentity = identityTitle(row.title);
        const duplicatesCurrentPath = Boolean(regionIdentity && currentIdentity && (currentIdentity.includes(regionIdentity) || regionIdentity.includes(currentIdentity)));
        if (!duplicatesCurrentPath)
            return true;
        // 当前路径上的区域只有明确稳定定义才保留；“设有某设施/用于某功能”仍属于时空描述。
        return stableDefinitionSignal.test(baseContent) && !sceneOnlySignal.test(baseContent.replace(stableDefinitionSignal, ''));
    });
    return attachLegacyAliases(snapshot, tables);
}
/**
 * 兼容旧 API：时空单例由 special-table-rules 统一执行。
 */
function enforceCurrentSpacetimeSingleton(snapshot, registry) {
    const tables = registryOrDefault(registry);
    return attachLegacyAliases(enforceSpacetimeSingleton(snapshot, tables).snapshot, tables);
}
function ensureCurrentSceneEntry(snapshot, registry) {
    const tables = registryOrDefault(registry);
    const spacetimeKey = tableByRole(tables, 'spacetime', false)?.key;
    const sceneKey = tableByRole(tables, 'scenes', false)?.key;
    if (!spacetimeKey || !sceneKey)
        return snapshot;
    const currentSpacetime = (snapshot[spacetimeKey] ?? []).filter((row) => !isHistoricalSceneRow(row)).at(-1);
    if (!currentSpacetime)
        return snapshot;
    const sceneRows = snapshot[sceneKey] ?? (snapshot[sceneKey] = []);
    if (sceneRows.some((row) => !isHistoricalSceneRow(row)))
        return snapshot;
    const titleToken = identityTitle(currentSpacetime.title);
    const existing = titleToken ? sceneRows.find((row) => identityTitle(row.title) === titleToken) : undefined;
    if (existing) {
        existing.content = currentSpacetime.content || existing.content;
        existing.status = '当前场景';
        existing.keywords = [...new Set([...(existing.keywords ?? []), currentSpacetime.title, ...(currentSpacetime.keywords ?? [])])];
        existing.semanticRole = 'scenes';
        existing.updatedAt = currentSpacetime.updatedAt || nowIso();
        return snapshot;
    }
    sceneRows.push(normalizeRow({
        id: `scene_${currentSpacetime.id}`,
        title: currentSpacetime.title,
        content: currentSpacetime.content || `当前场景位于${currentSpacetime.title}`,
        status: '当前场景',
        keywords: [currentSpacetime.title, ...(currentSpacetime.keywords ?? [])],
        fields: {
            currentFacts: Array.isArray(currentSpacetime.fields?.currentFacts) ? currentSpacetime.fields?.currentFacts : [],
            currentStates: Array.isArray(currentSpacetime.fields?.currentStates) ? currentSpacetime.fields?.currentStates : [],
            relatedObjects: Array.isArray(currentSpacetime.fields?.relatedObjects) ? currentSpacetime.fields?.relatedObjects : [],
            relatedEvents: Array.isArray(currentSpacetime.fields?.relatedEvents) ? currentSpacetime.fields?.relatedEvents : [],
        },
        updatedAt: currentSpacetime.updatedAt || nowIso(),
    }, sceneKey, sceneRows.length, undefined, tables));
    return snapshot;
}
function snapshotRowCount(snapshot, registry, enabledOnly = false) {
    if (!snapshot)
        return 0;
    const tables = registryOrDefault(registry).filter((table) => !enabledOnly || table.enabled);
    return tables.reduce((sum, table) => sum + visibleStateRows(snapshot[table.key]).length, 0);
}
/**
 * UI 新增/编辑默认创建“人工基础保护”对象；只有显式 locked=true 才升级为完全锁定。
 * 这保证玩家写下的基础不被模型改写，同时允许后续明确事实更新状态层。
 */
function upsertManualRow(snapshot, tableKey, row, registry) {
    const tables = registryOrDefault(registry);
    const next = normalizeSnapshot(snapshot, snapshot, tables);
    next[tableKey] ||= [];
    const idIndex = next[tableKey].findIndex((item) => item.id === row.id);
    const titleToken = identityTitle(safeText(row.title, 240));
    const titleIndex = titleToken
        ? next[tableKey].findIndex((item, index) => index !== idIndex && identityTitle(item.title) === titleToken)
        : -1;
    const targetIndex = titleIndex >= 0 ? titleIndex : idIndex;
    const target = targetIndex >= 0 ? next[tableKey][targetIndex] : undefined;
    const edited = idIndex >= 0 ? next[tableKey][idIndex] : undefined;
    const fields = {
        ...(target?.fields ?? {}),
        ...(edited?.fields ?? {}),
        ...(row.fields ?? {}),
    };
    const normalized = normalizeRow({
        ...target,
        ...edited,
        ...row,
        id: target?.id || edited?.id || row.id,
        keywords: [...new Set([...(target?.keywords ?? []), ...(edited?.keywords ?? []), ...(row.keywords ?? [])])],
        factIds: [...new Set([...(target?.factIds ?? []), ...(edited?.factIds ?? []), ...(row.factIds ?? [])])],
        eventIds: [...new Set([
                ...(target?.eventIds ?? (target?.eventId ? [target.eventId] : [])),
                ...(edited?.eventIds ?? (edited?.eventId ? [edited.eventId] : [])),
                ...(row.eventIds ?? (row.eventId ? [row.eventId] : [])),
            ])],
        fields,
        source: 'manual',
        locked: row.locked ?? edited?.locked ?? target?.locked ?? false,
        updatedAt: nowIso(),
    }, tableKey, targetIndex >= 0 ? targetIndex : next[tableKey].length, target, tables);
    if (targetIndex >= 0)
        next[tableKey][targetIndex] = normalized;
    else
        next[tableKey].push(normalized);
    if (idIndex >= 0 && idIndex !== targetIndex) {
        const removedId = edited?.id;
        next[tableKey].splice(idIndex, 1);
        if (removedId && removedId !== normalized.id)
            rewriteObjectReferences(next, new Map([[removedId, normalized.id]]));
    }
    return dedupeStrongStateRows(next, tables);
}
/**
 * 人工修正对象归属表格。保留稳定 ID、事实/事件引用与人工保护语义；
 * 目标表不支持的角色生命周期字段会在归一化时自然移除。
 */
function moveManualRow(snapshot, sourceTableKey, targetTableKey, rowId, row, registry) {
    const tables = registryOrDefault(registry);
    if (sourceTableKey === targetTableKey)
        return upsertManualRow(snapshot, sourceTableKey, { ...row, id: rowId }, tables);
    const next = normalizeSnapshot(snapshot, snapshot, tables);
    const source = (next[sourceTableKey] ?? []).find((item) => item.id === rowId);
    if (!source)
        throw new Error('要移动的条目不存在或已被更新');
    const title = safeText(row.title ?? source.title, 240).trim();
    const sameTitle = (next[targetTableKey] ?? []).find((item) => canonicalObjectTitle(item.title) === canonicalObjectTitle(title));
    const previousId = source.id;
    const targetId = sameTitle?.id || previousId;
    const mergedFields = { ...(source.fields ?? {}), ...(row.fields ?? {}) };
    let moved = upsertManualRow(next, targetTableKey, {
        ...source,
        ...row,
        id: targetId,
        fields: mergedFields,
        source: 'manual',
    }, tables);
    moved[sourceTableKey] = (moved[sourceTableKey] ?? []).filter((item) => item.id !== previousId);
    if (targetId !== previousId)
        moved = rewriteObjectReferences(moved, new Map([[previousId, targetId]]));
    return dedupeStrongStateRows(moved, tables);
}
function deleteRow(snapshot, tableKey, rowId, registry) {
    const rawTitle = (snapshot[tableKey] ?? []).find((row) => row.id === rowId)?.title;
    const next = normalizeSnapshot(snapshot, snapshot, registry);
    const titleToken = identityTitle(rawTitle || '');
    next[tableKey] = (next[tableKey] ?? []).filter((row) => row.id !== rowId && (!titleToken || identityTitle(row.title) !== titleToken));
    return next;
}
function relevanceText(row) {
    return `${row.title} ${row.content} ${row.status} ${row.keywords.join(' ')}`;
}
function isPassiveObserver(row) {
    if (row.source === 'manual' || row.locked)
        return false;
    return isPurePassiveObserverText(relevanceText(row));
}
/** 最后一层确定性过滤：纯旁观者及其临时反应不得留在活跃视图。 */
function filterPassiveObservers(snapshot, registry) {
    const tables = registryOrDefault(registry);
    for (const table of tables) {
        if (!table.enabled)
            continue;
        snapshot[table.key] = (snapshot[table.key] ?? []).filter((row) => !isPassiveObserver(row));
    }
    return snapshot;
}

}
};
__defs["domain/special-table-rules.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"isEntryLifecycleHidden",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["isEntryLifecycleHidden"]});
Object.defineProperty(__scope,"rewriteObjectReferences",{enumerable:true,configurable:true,get:()=>__require("domain/object-identity.js")["rewriteObjectReferences"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
Object.defineProperty(__scope,"tableByRole",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["tableByRole"]});
with(__scope){
Object.defineProperty(exports,"isHistoricalSceneRow",{enumerable:true,configurable:true,get:()=>isHistoricalSceneRow});
Object.defineProperty(exports,"enforceSpacetimeSingleton",{enumerable:true,configurable:true,get:()=>enforceSpacetimeSingleton});
function stringArray(value) {
    return Array.isArray(value) ? value.map((item) => safeText(item, 500).trim()).filter(Boolean) : [];
}
function isHistoricalSceneRow(row) {
    return isEntryLifecycleHidden(row)
        || /(已离开|离开场景|历史场景|过去场景|非当前|已结束|已关闭|已归档|inactive|closed|ended|archived)/i.test(`${row.status} ${row.content}`);
}
/**
 * 每个聊天只保留一个当前时空条目，固定 ID 为 spacetime_current。
 * 旧重复行只合并明确结构字段，不推测缺失事实。
 */
function enforceSpacetimeSingleton(snapshot, registry) {
    const tables = normalizeTableRegistry(registry);
    const spacetimeKey = tableByRole(tables, 'spacetime', false)?.key;
    if (!spacetimeKey)
        return { snapshot, idRemap: new Map(), mergedRowIds: [] };
    const rows = snapshot[spacetimeKey] ?? [];
    if (!rows.length)
        return { snapshot, idRemap: new Map(), mergedRowIds: [] };
    const active = rows.filter((row) => !isHistoricalSceneRow(row));
    const candidates = active.length ? active : rows;
    const selectedSource = candidates.map((row, index) => ({ row, index })).reduce((current, candidate) => {
        const currentTime = Date.parse(current.row.updatedAt || '') || 0;
        const candidateTime = Date.parse(candidate.row.updatedAt || '') || 0;
        return candidateTime > currentTime || (candidateTime === currentTime && candidate.index > current.index) ? candidate : current;
    }).row;
    const selected = structuredClone(selectedSource);
    const mergeListField = (key, limit = 60) => [...new Set(rows.flatMap((row) => stringArray(row.fields?.[key])))].slice(-limit);
    selected.id = 'spacetime_current';
    selected.semanticRole = 'spacetime';
    selected.keywords = [...new Set([selected.title, ...(selected.keywords ?? [])].filter(Boolean))].slice(0, 24);
    selected.factIds = [...new Set(rows.flatMap((row) => row.factIds ?? []))].slice(0, 80);
    selected.eventIds = [...new Set(rows.flatMap((row) => row.eventIds ?? (row.eventId ? [row.eventId] : [])))].slice(0, 80);
    selected.eventId = selected.eventId || selected.eventIds[0];
    selected.fields ||= {};
    for (const key of ['recentHistory', 'solidifiedHistory', 'relatedObjects', 'relatedEvents']) {
        const merged = mergeListField(key, key.includes('History') ? 40 : 80);
        if (merged.length)
            selected.fields[key] = merged;
    }
    const idRemap = new Map(rows
        .map((row) => [row.id, selected.id])
        .filter(([oldId]) => oldId && oldId !== selected.id));
    const mergedRowIds = rows.map((row) => row.id).filter((id) => id !== selected.id);
    snapshot[spacetimeKey] = [selected];
    rewriteObjectReferences(snapshot, idRemap);
    return { snapshot, idRemap, mergedRowIds };
}

}
};
__defs["domain/state-semantics.js"]=function(exports,__require){
const __scope=Object.create(null);
with(__scope){
Object.defineProperty(exports,"resolveStateLayer",{enumerable:true,configurable:true,get:()=>resolveStateLayer});
Object.defineProperty(exports,"stateLayerLabelForField",{enumerable:true,configurable:true,get:()=>stateLayerLabelForField});
Object.defineProperty(exports,"writableStateLayers",{enumerable:true,configurable:true,get:()=>writableStateLayers});
const FORBIDDEN_FIELD_KEYS = new Set([
    'id', 'title', 'content', 'keywords', 'status',
    'recentHistory', 'solidifiedHistory', 'absorbedMemory',
    'factIds', 'eventId', 'eventIds', 'recall', 'lifecycle',
]);
const FIXED_FIELD_LAYERS = [
    { key: 'baseContent', label: '身份定义', aliases: ['身份定义', '身份与对象定义', '对象定义', '身份锚点'] },
    { key: 'currentFacts', label: '现行事实', aliases: ['现行事实', '长期与现行事实', '持续事实'] },
    { key: 'currentStates', label: '当前状态', aliases: ['当前状态', '当前现实', '即时状态', '阶段状态'] },
    { key: 'presentationStates', label: '外观表现', aliases: ['外观表现', '外观与表现', '表象状态'] },
    { key: 'relationshipStates', label: '关系状态', aliases: ['关系状态', '持续关系'] },
    { key: 'abilityStates', label: '能力状态', aliases: ['能力状态', '能力变化'] },
    { key: 'relatedObjects', label: '关联对象', aliases: ['关联对象', '直接关联对象'] },
    { key: 'relatedEvents', label: '关联事件', aliases: ['关联事件', '直接关联事件'] },
];
const PSEUDO_LAYERS = [
    { kind: 'content', label: '当前摘要', aliases: ['当前摘要', '摘要', '当前记录'] },
    { kind: 'status', label: '条目状态', aliases: ['条目状态', '存续状态', '生命周期状态'] },
    { kind: 'keywords', label: '检索词', aliases: ['检索词', '关键词', '别名'] },
];
function token(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s·•._—–\-|｜:：()（）【】\[\]<>《》“”"'`]+/gu, '');
}
function fieldByKey(table, key) {
    return table.fields.find((field) => field.key === key);
}
function customWritableFields(table) {
    const fixedKeys = new Set(FIXED_FIELD_LAYERS.map((item) => item.key));
    return table.fields.filter((field) => (!FORBIDDEN_FIELD_KEYS.has(field.key)
        && !fixedKeys.has(field.key)
        && field.type !== 'lifecycle'));
}
function resolveStateLayer(table, raw) {
    const normalized = token(raw);
    if (!normalized)
        throw new Error(`变化层为空（${table.name}）`);
    for (const layer of PSEUDO_LAYERS) {
        if (layer.aliases.some((alias) => token(alias) === normalized))
            return { kind: layer.kind, label: layer.label };
    }
    for (const layer of FIXED_FIELD_LAYERS) {
        if (!layer.aliases.some((alias) => token(alias) === normalized))
            continue;
        const definition = fieldByKey(table, layer.key);
        if (!definition)
            throw new Error(`变化层“${layer.label}”不适用于${table.name}`);
        return { kind: 'field', key: definition.key, label: layer.label, definition };
    }
    const matches = customWritableFields(table).filter((field) => token(field.label) === normalized);
    if (matches.length === 1) {
        const definition = matches[0];
        return { kind: 'field', key: definition.key, label: definition.label, definition };
    }
    if (matches.length > 1)
        throw new Error(`变化层名称存在歧义（${table.name}）：${raw}`);
    throw new Error(`变化层未注册于${table.name}：${raw}`);
}
function stateLayerLabelForField(table, key) {
    const fixed = FIXED_FIELD_LAYERS.find((item) => item.key === key);
    if (fixed)
        return fixed.label;
    return customWritableFields(table).find((field) => field.key === key)?.label;
}
function writableStateLayers(table) {
    const content = fieldByKey(table, 'content');
    const status = fieldByKey(table, 'status');
    const keywords = fieldByKey(table, 'keywords');
    const output = [
        { label: '当前摘要', description: content?.description || '对象当前唯一有效概括。', multiple: false },
        { label: '条目状态', description: status?.description || '对象当前生命周期或有效性状态。', multiple: false },
        { label: '检索词', description: keywords?.description || '对象名、别名及检索触发词。', multiple: true },
    ];
    for (const layer of FIXED_FIELD_LAYERS) {
        const field = fieldByKey(table, layer.key);
        if (!field)
            continue;
        output.push({ label: layer.label, description: field.description || layer.label, multiple: field.type === 'string[]' });
    }
    for (const field of customWritableFields(table)) {
        output.push({ label: field.label, description: field.description || field.label, multiple: field.type === 'string[]' });
    }
    const seen = new Set();
    return output.filter((item) => {
        const normalized = token(item.label);
        if (!normalized || seen.has(normalized))
            return false;
        seen.add(normalized);
        return true;
    });
}

}
};
__defs["domain/state-text.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"hashText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["hashText"]});
Object.defineProperty(__scope,"makeId",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["makeId"]});
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"parseFixedTextBlocks",{enumerable:true,configurable:true,get:()=>__require("domain/fixed-text.js")["parseFixedTextBlocks"]});
Object.defineProperty(__scope,"canonicalObjectTitle",{enumerable:true,configurable:true,get:()=>__require("domain/object-identity.js")["canonicalObjectTitle"]});
Object.defineProperty(__scope,"applyFactContractGate",{enumerable:true,configurable:true,get:()=>__require("domain/fact-contract.js")["applyFactContractGate"]});
Object.defineProperty(__scope,"enabledTables",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["enabledTables"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
Object.defineProperty(__scope,"tableByRole",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["tableByRole"]});
Object.defineProperty(__scope,"resolveStateLayer",{enumerable:true,configurable:true,get:()=>__require("domain/state-semantics.js")["resolveStateLayer"]});
with(__scope){
Object.defineProperty(exports,"mergeDuplicateStateRows",{enumerable:true,configurable:true,get:()=>mergeDuplicateStateRows});
Object.defineProperty(exports,"dedupeStrongStateRows",{enumerable:true,configurable:true,get:()=>dedupeStrongStateRows});
Object.defineProperty(exports,"parseStateTextBlocks",{enumerable:true,configurable:true,get:()=>parseStateTextBlocks});
Object.defineProperty(exports,"parseStateTextOutput",{enumerable:true,configurable:true,get:()=>parseStateTextOutput});
Object.defineProperty(exports,"STATE_TEXT_MARKERS",{enumerable:true,configurable:true,get:()=>STATE_TEXT_MARKERS});
const STATE_TEXT_MARKERS = {
    turnStart: '<MA_TURN>',
    turnEnd: '</MA_TURN>',
    changeStart: '<MA_CHANGE>',
    changeEnd: '</MA_CHANGE>',
};
const CHANGE_OPERATIONS = new Set(['set', 'replace', 'add', 'remove', 'close']);
const FACT_CONFIDENCE = new Set(['confirmed', 'recorded', 'reported', 'uncertain']);
const KEY_ALIASES = {
    '摘要': 'summary',
    '事件': 'event',
    '对象类型': 'kind', '类型': 'kind',
    '表格': 'table',
    '对象': 'object', '名称': 'object',
    '变化层': 'layer',
    '动作': 'operation',
    '内容': 'value',
    '事实结果': 'result', '结果': 'result',
    '置信度': 'confidence',
    '关联对象': 'related',
    '关键词': 'keyword',
    '开始时间': 'time_start',
    '结束时间': 'time_end',
    '时间标签': 'time_label',
};
const KIND_ROLE = {
    spacetime: 'spacetime',
    scene: 'scenes',
    character: 'characters',
    item: 'items',
    event: 'events',
    region: 'regions',
    global: 'globalChanges',
    foundation: 'foundations',
    custom: 'custom',
};
const KIND_ALIASES = {
    spacetime: 'spacetime', timeandspace: 'spacetime', 时空: 'spacetime',
    scene: 'scene', scenes: 'scene', 场景: 'scene', 局面: 'scene',
    character: 'character', characters: 'character', person: 'character', individual: 'character', 角色: 'character', 人物: 'character', 个体: 'character',
    item: 'item', items: 'item', object: 'item', prop: 'item', 物品: 'item', 道具: 'item', 装备: 'item',
    event: 'event', events: 'event', 事件: 'event',
    region: 'region', regions: 'region', place: 'region', location: 'region', 地点: 'region', 区域: 'region', 建筑: 'region',
    global: 'global', globalchange: 'global', globalchanges: 'global', organization: 'global', faction: 'global', institution: 'global', polity: 'global', 全局: 'global', 全局变化: 'global', 组织: 'global', 阵营: 'global', 政权: 'global', 机构: 'global',
    foundation: 'foundation', foundations: 'foundation', rule: 'foundation', setting: 'foundation', 基础设定: 'foundation', 规则: 'foundation', 设定: 'foundation',
    custom: 'custom', customobject: 'custom', customobjects: 'custom', 自定义: 'custom', 自定义对象: 'custom',
};
function identity(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s·•._—–\-|｜:：()（）【】\[\]<>《》“”"'`]+/gu, '');
}
function rowKind(value) {
    return KIND_ALIASES[identity(value)];
}
function semanticTable(kind, active) {
    return kind ? tableByRole(active, KIND_ROLE[kind], false) : undefined;
}
function unique(values, limit = 40, chars = 800) {
    return [...new Set(values.map((item) => safeText(item, chars).trim()).filter(Boolean))].slice(0, limit);
}
function normalizeKey(raw) {
    const trimmed = raw.trim();
    return KEY_ALIASES[trimmed] || trimmed;
}
function addField(block, key, value) {
    const normalized = normalizeKey(key);
    if (!normalized)
        return;
    block.fields.set(normalized, [...(block.fields.get(normalized) ?? []), value.trim()]);
}
function fieldValues(block, ...keys) {
    return unique(keys.flatMap((key) => block.fields.get(key) ?? []));
}
function fieldValue(block, ...keys) {
    return fieldValues(block, ...keys).at(-1) ?? '';
}
const STATE_BLOCK_MARKERS = [
    { kind: 'turn', start: STATE_TEXT_MARKERS.turnStart, end: STATE_TEXT_MARKERS.turnEnd },
    { kind: 'change', start: STATE_TEXT_MARKERS.changeStart, end: STATE_TEXT_MARKERS.changeEnd },
];
function safelyCloseTrailingStateBlock(raw) {
    const source = String(raw ?? '').replace(/^\uFEFF/, '').trim();
    if (!source)
        return source;
    const candidates = STATE_BLOCK_MARKERS
        .map((item) => ({ ...item, index: source.toUpperCase().lastIndexOf(item.start.toUpperCase()) }))
        .filter((item) => item.index >= 0)
        .sort((a, b) => b.index - a.index);
    const last = candidates[0];
    if (!last)
        return source;
    const tail = source.slice(last.index);
    if (tail.toUpperCase().includes(last.end.toUpperCase()))
        return source;
    const body = tail.slice(last.start.length);
    const hasCompleteLine = /(^|\n)\s*[^=＝:：\n]+\s*[=＝:：]\s*\S[^\n]*\s*$/u.test(body);
    if (!hasCompleteLine)
        return source;
    if (last.kind === 'turn' && !/(^|\n)\s*(?:摘要|summary)\s*[=＝:：]\s*\S/iu.test(body))
        return source;
    if (last.kind === 'change') {
        const required = ['事件', '对象类型', '对象', '变化层', '动作'];
        if (!required.every((key) => new RegExp(`(^|\\n)\\s*${key}\\s*[=＝:：]\\s*\\S`, 'u').test(body)))
            return source;
        if (!/(^|\n)\s*(?:内容|事实结果)\s*[=＝:：]\s*\S/u.test(body))
            return source;
    }
    return `${source}\n${last.end}`;
}
function parseLegacyStateTextBlocks(raw) {
    const source = String(raw ?? '');
    if (/<MA_(?:FACT|ROW)>|<\/MA_(?:FACT|ROW)>|【(?:事实|条目)(?:结束)?】|(^|\n)\s*(?:field|字段)(?:\.|\s*[=＝:：])/iu.test(source)) {
        throw new Error('状态模型返回了已停用旧协议；只接受 <MA_TURN>/<MA_CHANGE> 与“变化层”');
    }
    const parsed = parseFixedTextBlocks(safelyCloseTrailingStateBlock(source), STATE_BLOCK_MARKERS);
    if (!parsed.length)
        throw new Error('状态模型未返回固定文本块（缺少 <MA_TURN>/<MA_CHANGE>）');
    return parsed.map((source) => {
        const block = { ...source, kind: source.kind, fields: new Map() };
        for (const [key, values] of source.fields.entries())
            for (const value of values)
                addField(block, key, value);
        return block;
    });
}
function rowTokens(row) {
    return new Set([row.title, ...(row.keywords ?? [])].map(identity).filter(Boolean));
}
function intersection(left, right) {
    const rightSet = right instanceof Set ? right : new Set(right);
    return [...left].filter((item) => rightSet.has(item));
}
function mergeFieldValues(left, right) {
    if (Array.isArray(left) || Array.isArray(right))
        return unique([...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])], 60, 1200);
    const rightText = safeText(right, 12000).trim();
    return rightText || left;
}
function rowProtectionRank(row) {
    if (row.locked || row.lockMode === 'all')
        return 3;
    if (row.source === 'manual' || row.lockMode === 'base')
        return 2;
    return 1;
}
function canonicalRow(left, right) {
    const rankDiff = rowProtectionRank(right) - rowProtectionRank(left);
    if (rankDiff)
        return rankDiff > 0 ? right : left;
    const leftTime = String(left.updatedAt || '');
    const rightTime = String(right.updatedAt || '');
    if (leftTime && rightTime && leftTime !== rightTime)
        return leftTime < rightTime ? left : right;
    if (leftTime !== rightTime)
        return leftTime ? left : right;
    return String(left.id || '').localeCompare(String(right.id || '')) <= 0 ? left : right;
}
function fresherRow(left, right) {
    const leftTime = String(left.updatedAt || '');
    const rightTime = String(right.updatedAt || '');
    if (leftTime !== rightTime)
        return rightTime > leftTime ? right : left;
    return String(right.id || '').localeCompare(String(left.id || '')) > 0 ? right : left;
}
function mergeRows(left, right) {
    const canonical = canonicalRow(left, right);
    const secondary = canonical === left ? right : left;
    const newer = fresherRow(left, right);
    const fields = { ...(canonical.fields ?? {}) };
    for (const [key, value] of Object.entries(secondary.fields ?? {})) {
        if (Array.isArray(fields[key]) || Array.isArray(value)) {
            fields[key] = mergeFieldValues(fields[key], value);
            continue;
        }
        const currentText = safeText(fields[key], 12000).trim();
        const incomingText = safeText(value, 12000).trim();
        if (!currentText && incomingText)
            fields[key] = value;
        else if (rowProtectionRank(canonical) === 1 && newer === secondary && incomingText)
            fields[key] = value;
    }
    const fullyLocked = rowProtectionRank(canonical) === 3;
    if (!fullyLocked) {
        const revisionRow = right.baseRevisionEvidence ? right : left.baseRevisionEvidence ? left : undefined;
        const revisionBase = safeText(revisionRow?.fields?.baseContent, 12000).trim();
        if (revisionRow?.baseRevisionEvidence?.eventId && revisionRow.baseRevisionEvidence.factId && revisionBase) {
            fields.baseContent = structuredClone(revisionRow.fields?.baseContent);
        }
    }
    const recall = canonical.recall || secondary.recall ? {
        any: unique([...(canonical.recall?.any ?? []), ...(secondary.recall?.any ?? [])], 40, 120),
        all: unique([...(canonical.recall?.all ?? []), ...(secondary.recall?.all ?? [])], 30, 120),
        exclude: unique([...(canonical.recall?.exclude ?? []), ...(secondary.recall?.exclude ?? [])], 30, 120),
    } : undefined;
    return {
        ...canonical,
        content: fullyLocked ? canonical.content : newer.content || canonical.content || secondary.content,
        status: fullyLocked ? canonical.status : newer.status || canonical.status,
        keywords: unique([...(canonical.keywords ?? []), ...(secondary.keywords ?? [])], 24, 100),
        fields,
        factIds: unique([...(canonical.factIds ?? []), ...(secondary.factIds ?? [])], 80, 160),
        eventIds: unique([...(canonical.eventIds ?? []), canonical.eventId, ...(secondary.eventIds ?? []), secondary.eventId], 80, 160),
        eventId: fullyLocked ? canonical.eventId || secondary.eventId : newer.eventId || canonical.eventId || secondary.eventId,
        lifecycle: fullyLocked ? canonical.lifecycle ?? secondary.lifecycle : newer.lifecycle ?? canonical.lifecycle ?? secondary.lifecycle,
        entryLifecycle: fullyLocked ? canonical.entryLifecycle ?? secondary.entryLifecycle : newer.entryLifecycle ?? canonical.entryLifecycle ?? secondary.entryLifecycle,
        baseRevisionEvidence: fullyLocked
            ? canonical.baseRevisionEvidence ?? secondary.baseRevisionEvidence
            : newer.baseRevisionEvidence ?? canonical.baseRevisionEvidence ?? secondary.baseRevisionEvidence,
        recall,
        updatedAt: fullyLocked ? canonical.updatedAt : newer.updatedAt || canonical.updatedAt,
    };
}
function mergeDuplicateStateRows(snapshot, registry, onlyTableKeys) {
    const tables = normalizeTableRegistry(registry);
    const output = structuredClone(snapshot);
    const idRemap = new Map();
    let mergedCount = 0;
    for (const table of tables) {
        if (onlyTableKeys && !onlyTableKeys.has(table.key))
            continue;
        const rows = output[table.key] ?? [];
        const groups = new Map();
        const order = [];
        for (const row of rows) {
            const token = canonicalObjectTitle(row.title) || `@id:${row.id}`;
            if (!groups.has(token))
                order.push(token);
            groups.set(token, [...(groups.get(token) ?? []), row]);
        }
        output[table.key] = order.map((token) => {
            const group = [...(groups.get(token) ?? [])].sort((left, right) => {
                const time = String(left.updatedAt || '').localeCompare(String(right.updatedAt || ''));
                return time || String(left.id || '').localeCompare(String(right.id || ''));
            });
            const merged = group.slice(1).reduce((current, row) => mergeRows(current, row), group[0]);
            if (group.length > 1)
                mergedCount += group.length - 1;
            for (const row of group) {
                if (row.id && row.id !== merged.id)
                    idRemap.set(row.id, merged.id);
            }
            return merged;
        });
    }
    if (idRemap.size) {
        for (const rows of Object.values(output)) {
            if (!Array.isArray(rows))
                continue;
            for (const row of rows) {
                const related = Array.isArray(row.fields?.relatedObjects) ? row.fields.relatedObjects : [];
                if (!related.length)
                    continue;
                row.fields ||= {};
                row.fields.relatedObjects = unique(related.map((value) => idRemap.get(String(value)) ?? value), 60, 240);
            }
        }
    }
    return { snapshot: output, idRemap, mergedCount };
}
function dedupeStrongStateRows(snapshot, registry) {
    return mergeDuplicateStateRows(snapshot, registry).snapshot;
}
function findExistingRow(tableKey, objectName, keywords, previous) {
    const rows = previous[tableKey] ?? [];
    const objectToken = canonicalObjectTitle(objectName);
    const exactTitle = rows.filter((row) => canonicalObjectTitle(row.title) === objectToken);
    if (exactTitle.length === 1)
        return exactTitle[0];
    if (exactTitle.length > 1) {
        return exactTitle.slice(1).reduce((current, row) => mergeRows(current, row), exactTitle[0]);
    }
    const wanted = new Set([objectName, ...keywords].map(identity).filter(Boolean));
    const aliasMatches = rows.filter((row) => intersection(rowTokens(row), wanted).length > 0);
    if (aliasMatches.length === 1)
        return aliasMatches[0];
    if (aliasMatches.length > 1)
        throw new Error(`表格 ${tableKey} 中有多个条目命中对象别名：${objectName}`);
    return undefined;
}
function resolveTable(raw, active) {
    const token = identity(raw);
    const matches = active.filter((table) => identity(table.name) === token);
    if (matches.length === 1)
        return matches[0];
    if (!matches.length)
        throw new Error(`固定文本条目使用了未注册或已停用表格：${raw || '空'}`);
    throw new Error(`固定文本表格名称存在歧义：${raw}`);
}
/**
 * 同一稳定对象一旦已经存在于某张表，模型后续误选表格时优先沿用原表。
 * 这里只接受跨表唯一的规范标题命中；别名或多表同名不自动迁移，避免把同名人物与地点错误合并。
 */
function findUniqueExactRowAcrossTables(requestedTableKey, objectName, previous, active) {
    const token = canonicalObjectTitle(objectName);
    if (!token)
        return undefined;
    const matches = [];
    for (const table of active) {
        if (table.key === requestedTableKey)
            continue;
        for (const row of previous[table.key] ?? []) {
            if (canonicalObjectTitle(row.title) === token)
                matches.push({ table, row });
        }
    }
    return matches.length === 1 ? matches[0] : undefined;
}
function mergePatchRows(left, right) {
    return {
        ...left,
        ...right,
        id: left.id || right.id,
        title: left.title || right.title,
        content: right.content || left.content,
        status: right.status || left.status,
        keywords: unique([...(left.keywords ?? []), ...(right.keywords ?? [])], 24, 100),
        fields: { ...(left.fields ?? {}), ...(right.fields ?? {}) },
        lifecycle: right.lifecycle ?? left.lifecycle,
        baseRevisionEvidence: right.baseRevisionEvidence ?? left.baseRevisionEvidence,
    };
}
function activeEventMatch(eventName, activeFacts) {
    const token = identity(eventName);
    if (!token)
        return undefined;
    const matches = new Set(activeFacts.filter((fact) => {
        const terms = [
            fact.eventId,
            fact.title,
            fact.view?.eventName,
            fact.view?.objectTitle,
            ...fact.keywords,
        ].map(identity).filter(Boolean);
        return terms.includes(token);
    }).map((fact) => fact.eventId));
    return matches.size === 1 ? [...matches][0] : undefined;
}
function snapshotEventMatch(eventName, previous, active) {
    const token = identity(eventName);
    if (!token)
        return undefined;
    const matches = new Set();
    for (const table of active.filter((item) => item.role === 'events')) {
        for (const row of previous[table.key] ?? []) {
            const terms = [row.title, ...(row.keywords ?? [])].map(identity).filter(Boolean);
            if (!terms.includes(token))
                continue;
            for (const eventId of [...(row.eventIds ?? []), row.eventId].filter(Boolean))
                matches.add(eventId);
        }
    }
    return matches.size === 1 ? [...matches][0] : undefined;
}
function rowSingleEventMatch(row) {
    if (!row)
        return undefined;
    const values = [...new Set([...(row.eventIds ?? []), row.eventId].filter(Boolean))];
    return values.length === 1 ? values[0] : undefined;
}
function rowEventIds(row) {
    return [...new Set([...(row?.eventIds ?? []), row?.eventId].map((value) => String(value || '').trim()).filter(Boolean))];
}
function eventRowById(snapshot, active, eventId) {
    if (!eventId)
        return undefined;
    const matches = [];
    for (const table of active.filter((item) => item.role === 'events')) {
        for (const row of snapshot[table.key] ?? []) {
            if (rowEventIds(row).includes(eventId))
                matches.push(row);
        }
    }
    return matches.length === 1 ? matches[0] : undefined;
}
function eventCandidateOpen(eventId, snapshot, active, activeFacts) {
    const row = eventRowById(snapshot, active, eventId);
    if (row?.entryLifecycle?.state === 'settling'
        || /(已结束|结束|已完成|完成|已解决|已关闭|已归档|closed|completed|resolved|ended|archived)/i.test(String(row?.status || ''))) {
        return false;
    }
    const statusFacts = activeFacts.filter((fact) => fact.eventId === eventId
        && (fact.view?.moduleTag === 'MA_EVENT_STATUS' || /事件状态$/u.test(String(fact.title || ''))));
    const latest = statusFacts.at(-1);
    return !latest || latest.active !== false;
}
function canonicalEventName(eventId, fallback, snapshot, active, activeFacts) {
    const row = eventRowById(snapshot, active, eventId);
    if (row?.title)
        return row.title;
    const fact = [...activeFacts].reverse().find((item) => item.eventId === eventId
        && item.view?.semanticRole === 'events'
        && item.view?.objectTitle);
    return fact?.view?.objectTitle || fallback;
}
const GENERIC_EVENT_CONTEXT_TOKENS = new Set([
    '事件', '任务', '状态', '当前', '已经', '开始', '继续', '进行', '完成', '结束',
    '结果', '目标', '行动', '阶段', '成功', '失败', '仍在', '正在',
]);
function eventContextTokens(value, omitted = []) {
    let token = identity(value);
    for (const item of omitted.map(identity).filter((item) => item.length >= 2))
        token = token.split(item).join('');
    const output = new Set();
    for (let index = 0; index + 1 < token.length; index += 1) {
        const part = token.slice(index, index + 2);
        if (!GENERIC_EVENT_CONTEXT_TOKENS.has(part))
            output.add(part);
    }
    return output;
}
function contextualEventMatches(event, snapshot, active, activeFacts, allowedIds) {
    const matches = new Set();
    const currentText = [event.eventName, ...event.modules.map((item) => item.content)].join(' ');
    const currentIdentity = identity(currentText);
    for (const table of active.filter((item) => item.role === 'events')) {
        for (const row of snapshot[table.key] ?? []) {
            const eventIds = rowEventIds(row).filter((eventId) => (!allowedIds || allowedIds.has(eventId))
                && eventCandidateOpen(eventId, snapshot, active, activeFacts));
            if (!eventIds.length)
                continue;
            const anchors = unique(row.fields?.relatedObjects ?? [], 40, 240)
                .filter((item) => identity(item).length >= 2);
            if (!anchors.some((item) => currentIdentity.includes(identity(item))))
                continue;
            const currentTokens = eventContextTokens(currentText, anchors);
            const previousTokens = eventContextTokens([
                row.title,
                row.content,
                ...(row.keywords ?? []),
            ].join(' '), anchors);
            if (![...currentTokens].some((item) => previousTokens.has(item)))
                continue;
            for (const eventId of eventIds)
                matches.add(eventId);
        }
    }
    return matches;
}
function freshEventId(eventName, snapshot, active, activeFacts) {
    const token = identity(eventName);
    const base = `event_${hashText(token)}`;
    const used = new Set(activeFacts.map((fact) => String(fact.eventId || '').trim()).filter(Boolean));
    for (const table of active.filter((item) => item.role === 'events'))
        for (const row of snapshot[table.key] ?? [])
            for (const eventId of rowEventIds(row))
                used.add(eventId);
    if (!used.has(base))
        return base;
    return `event_${hashText(`${token}|new-after|${[...used].sort().join('|')}`)}`;
}
/**
 * 一个 <MA_EVENT> 是事件身份解析的最小事务边界。先按事件名精确复用；名称漂移时，
 * 优先接受本块明确对象行共同指向的唯一、仍开放 event_id；对象模块缺失或多线并存时，
 * 还必须同时命中旧事件的明确关联对象与非通用文本片段。多候选或已结束候选都不猜测。
 */
function resolveNaturalEventIdentity(event, snapshot, active, activeFacts) {
    const exact = activeEventMatch(event.eventName, activeFacts)
        || snapshotEventMatch(event.eventName, snapshot, active);
    if (exact && eventCandidateOpen(exact, snapshot, active, activeFacts)) {
        return {
            eventId: exact,
            canonicalName: canonicalEventName(exact, event.eventName, snapshot, active, activeFacts),
        };
    }
    const candidates = new Set();
    for (const module of event.modules.filter((item) => !item.eventModule)) {
        const token = canonicalObjectTitle(module.objectName);
        if (!token)
            continue;
        const matches = [];
        for (const table of active.filter((item) => item.role !== 'events')) {
            for (const row of snapshot[table.key] ?? []) {
                if (canonicalObjectTitle(row.title) === token)
                    matches.push(row);
            }
        }
        if (matches.length !== 1)
            continue;
        for (const eventId of rowEventIds(matches[0])) {
            if (eventCandidateOpen(eventId, snapshot, active, activeFacts))
                candidates.add(eventId);
        }
    }
    if (candidates.size === 1) {
        const eventId = [...candidates][0];
        return {
            eventId,
            canonicalName: canonicalEventName(eventId, event.eventName, snapshot, active, activeFacts),
        };
    }
    const contextual = contextualEventMatches(event, snapshot, active, activeFacts, candidates.size ? candidates : undefined);
    if (contextual.size === 1) {
        const eventId = [...contextual][0];
        return {
            eventId,
            canonicalName: canonicalEventName(eventId, event.eventName, snapshot, active, activeFacts),
        };
    }
    return {
        eventId: freshEventId(event.eventName, snapshot, active, activeFacts),
        canonicalName: event.eventName,
    };
}
function changeOperation(value) {
    const token = identity(value);
    if (['replace', '替换', '覆盖'].includes(token))
        return 'replace';
    if (['add', 'append', '新增', '添加', '追加'].includes(token))
        return 'add';
    if (['remove', 'delete', '移除', '删除', '解除'].includes(token))
        return 'remove';
    if (['close', 'closed', '结束', '关闭', '完成', '解决'].includes(token))
        return 'close';
    return 'set';
}
function arrayAfterChange(existing, values, operation) {
    const current = Array.isArray(existing) ? existing.map((item) => safeText(item, 1200).trim()).filter(Boolean) : [];
    if (operation === 'add')
        return unique([...current, ...values], 40, 1200);
    if (operation === 'remove') {
        const removed = new Set(values.map(identity).filter(Boolean));
        return current.filter((item) => !removed.has(identity(item)));
    }
    return unique(values, 40, 1200);
}
function confidenceFromValue(value) {
    const raw = String(value ?? '').trim();
    const normalized = identity(raw);
    if (['confirmed', '确认', '已确认'].map(identity).includes(normalized))
        return 'confirmed';
    if (['recorded', '记录', '已记录'].map(identity).includes(normalized))
        return 'recorded';
    if (['reported', '转述', '传闻', '报告'].map(identity).includes(normalized))
        return 'reported';
    if (['uncertain', '不确定', '存疑'].map(identity).includes(normalized))
        return 'uncertain';
    return FACT_CONFIDENCE.has(raw) ? raw : 'confirmed';
}
function changeFromBlock(block, active, previous, activeFacts) {
    const kind = rowKind(fieldValue(block, 'kind'));
    const explicitTable = fieldValue(block, 'table').trim();
    let table = explicitTable ? resolveTable(explicitTable, active) : semanticTable(kind, active);
    if (!table)
        throw new Error(`第 ${block.line} 行开始的 <MA_CHANGE> 无法确定对象表；请修正“对象类型”${explicitTable ? `或“表格=${explicitTable}”` : ''}`);
    const semantic = semanticTable(kind, active);
    if (semantic && table.role !== semantic.role)
        table = semantic;
    const objectName = fieldValue(block, 'object').trim();
    if (!objectName)
        throw new Error(`第 ${block.line} 行开始的 <MA_CHANGE> 缺少“对象”`);
    const keywords = unique([objectName, ...fieldValues(block, 'keyword')], 24, 100);
    let existing = findExistingRow(table.key, objectName, keywords, previous);
    let relocation;
    if (!existing) {
        const anchored = findUniqueExactRowAcrossTables(table.key, objectName, previous, active);
        if (anchored) {
            const protectedPlacement = anchored.row.source === 'manual' || anchored.row.locked || anchored.row.lockMode === 'all' || anchored.row.lockMode === 'base';
            const explicitSemanticMove = Boolean(kind && semantic?.key === table.key && anchored.table.key !== table.key && !(table.role === 'characters' && anchored.table.role !== 'characters'));
            if (explicitSemanticMove && !protectedPlacement) {
                existing = anchored.row;
                relocation = { id: anchored.row.id, title: anchored.row.title, fromTable: anchored.table.key, toTable: table.key };
            }
            else {
                table = anchored.table;
                existing = anchored.row;
            }
        }
    }
    const rawLayer = fieldValue(block, 'layer').trim();
    if (!rawLayer)
        throw new Error(`第 ${block.line} 行开始的 <MA_CHANGE> 缺少“变化层”`);
    const layer = resolveStateLayer(table, rawLayer);
    const values = fieldValues(block, 'value');
    const result = fieldValue(block, 'result').trim() || values.join('；').trim();
    if (!values.length && !result)
        throw new Error(`第 ${block.line} 行开始的 <MA_CHANGE> 缺少“内容”或“事实结果”`);
    const operation = changeOperation(fieldValue(block, 'operation'));
    if (!CHANGE_OPERATIONS.has(operation))
        throw new Error(`第 ${block.line} 行开始的 <MA_CHANGE> 动作不合法`);
    const fields = {};
    let content = existing?.content || objectName;
    let status = existing?.status || 'active';
    let rowKeywords = [...(existing?.keywords ?? []), ...keywords];
    if (layer.kind === 'content') {
        if (operation !== 'remove')
            content = values.at(-1) || result || content;
    }
    else if (layer.kind === 'status') {
        status = operation === 'remove' ? 'active' : values.at(-1) || result || (operation === 'close' ? 'closed' : status);
    }
    else if (layer.kind === 'keywords') {
        rowKeywords = operation === 'remove'
            ? rowKeywords.filter((item) => !new Set(values.map(identity)).has(identity(item)))
            : unique([...rowKeywords, ...values], 24, 100);
    }
    else {
        const prior = existing?.fields?.[layer.key];
        if (layer.definition.type === 'string[]')
            fields[layer.key] = arrayAfterChange(prior, values.length ? values : [result], operation);
        else
            fields[layer.key] = operation === 'remove' ? '' : values.at(-1) || result;
    }
    if (operation === 'close')
        status = layer.kind === 'status' ? (values.at(-1) || result || 'closed') : 'closed';
    const rowContent = layer.kind === 'content' ? content : existing?.content || result || objectName;
    const row = {
        id: existing?.id || makeId(table.key),
        title: existing?.title || objectName,
        content: rowContent,
        keywords: unique(rowKeywords, 24, 100),
        status,
        source: existing?.source ?? 'auto',
        locked: existing?.locked ?? false,
        lockMode: existing?.lockMode,
        lifecycle: existing?.lifecycle,
        // 待结算对象再次出现时，必须把状态机标记带到事务入口，由 restore 指令原子恢复；
        // 不能在模型投影阶段静默丢失，否则会留下“无 lifecycle 但状态仍待结算”的半恢复行。
        entryLifecycle: existing?.entryLifecycle ? structuredClone(existing.entryLifecycle) : undefined,
        updatedAt: nowIso(),
        fields: relocation ? { ...(existing?.fields ?? {}), ...fields } : fields,
        semanticRole: table.role,
    };
    const eventName = fieldValue(block, 'event').trim() || objectName;
    const eventId = activeEventMatch(eventName, activeFacts)
        || snapshotEventMatch(eventName, previous, active)
        || rowSingleEventMatch(existing)
        || `event_${hashText(identity(eventName))}`;
    const factTitle = `${objectName}·${layer.label}`;
    const previousMatches = activeFacts.filter((fact) => fact.eventId === eventId && identity(fact.title) === identity(factTitle));
    const factId = previousMatches.length === 1
        ? previousMatches[0].factId
        : `fact_${hashText(`${eventId}|${identity(factTitle)}`)}`;
    const confidence = confidenceFromValue(fieldValue(block, 'confidence'));
    const explicitClosed = operation === 'close'
        || (layer.kind === 'status' && /(完成|结束|关闭|解决|归档|closed|completed|resolved|ended|archived)/i.test(status));
    const factOperation = explicitClosed ? 'close' : operation === 'add' ? 'append' : previousMatches.length ? 'update' : 'create';
    const occurred = unique([result || `${objectName}：${values.join('；')}`], 8, 1200);
    const fact = {
        fact_id: factId,
        event_id: eventId,
        entity_id: eventId,
        type: kind || table.role || 'event',
        title: factTitle,
        content: occurred.join('；'),
        occurred,
        unresolved: [],
        status: explicitClosed ? 'closed' : 'active',
        time_range: {
            start: fieldValue(block, 'time_start'),
            end: fieldValue(block, 'time_end'),
            label: fieldValue(block, 'time_label'),
        },
        related_entities: unique([objectName, ...fieldValues(block, 'related')], 40, 240),
        keywords: unique([objectName, eventName, factTitle, ...fieldValues(block, 'keyword')], 24, 100),
        operation: factOperation,
        confidence,
    };
    return {
        fact,
        patch: { table: table.key, row, matchKey: existing?.id || `new:${identity(objectName)}`, relocation },
    };
}
function mergeFacts(left, right) {
    return {
        ...left,
        ...right,
        content: unique([left.content, right.content], 20, 1200).join('；'),
        occurred: unique([...(left.occurred ?? []), ...(right.occurred ?? [])], 40, 1200),
        unresolved: unique([...(left.unresolved ?? []), ...(right.unresolved ?? [])], 40, 1200),
        related_entities: unique([...(left.related_entities ?? []), ...(right.related_entities ?? [])], 40, 240),
        keywords: unique([...(left.keywords ?? []), ...(right.keywords ?? [])], 24, 100),
    };
}
function applyPatchToWorkingSnapshot(working, patch) {
    if (patch.relocation) {
        working[patch.relocation.fromTable] = (working[patch.relocation.fromTable] ?? []).filter((row) => row.id !== patch.relocation.id);
    }
    const rows = working[patch.table] ?? [];
    const index = rows.findIndex((row) => row.id === patch.row.id);
    if (index < 0)
        working[patch.table] = [...rows, structuredClone(patch.row)];
    else {
        const next = [...rows];
        next[index] = mergePatchRows(next[index], patch.row);
        working[patch.table] = next;
    }
}
const NATURAL_MODULES = {
    MA_CORE: { role: 'events', layer: '当前摘要', event: true },
    MA_EVENT_RESULT: { role: 'events', layer: '现行事实', event: true },
    MA_EVENT_STATE: { role: 'events', layer: '当前状态', event: true },
    MA_UNRESOLVED: { role: 'events', layer: '当前状态', event: true, unresolved: true },
    MA_CHARACTER_IDENTITY: { role: 'characters', layer: '身份定义' },
    MA_CHARACTER_FACT: { role: 'characters', layer: '现行事实' },
    MA_CHARACTER_STATE: { role: 'characters', layer: '当前状态' },
    MA_CHARACTER_APPEARANCE: { role: 'characters', layer: '外观表现' },
    MA_CHARACTER_RELATION: { role: 'characters', layer: '关系状态' },
    MA_CHARACTER_ABILITY: { role: 'characters', layer: '能力状态' },
    MA_ITEM_IDENTITY: { role: 'items', layer: '身份定义' },
    MA_ITEM_FACT: { role: 'items', layer: '现行事实' },
    MA_ITEM_STATE: { role: 'items', layer: '当前状态' },
    MA_SCENE_IDENTITY: { role: 'scenes', layer: '身份定义' },
    MA_SCENE_FACT: { role: 'scenes', layer: '现行事实' },
    MA_SCENE_STATE: { role: 'scenes', layer: '当前状态' },
    MA_REGION_IDENTITY: { role: 'regions', layer: '身份定义' },
    MA_REGION_FACT: { role: 'regions', layer: '现行事实' },
    MA_REGION_STATE: { role: 'regions', layer: '当前状态' },
    MA_GLOBAL_IDENTITY: { role: 'globalChanges', layer: '身份定义' },
    MA_GLOBAL_FACT: { role: 'globalChanges', layer: '现行事实' },
    MA_GLOBAL_STATE: { role: 'globalChanges', layer: '当前状态' },
    MA_FOUNDATION_IDENTITY: { role: 'foundations', layer: '身份定义' },
    MA_FOUNDATION_FACT: { role: 'foundations', layer: '现行事实' },
    MA_FOUNDATION_STATE: { role: 'foundations', layer: '当前状态' },
    MA_SPACETIME_STATE: { role: 'spacetime', layer: '当前状态' },
    MA_CUSTOM: { layer: '', custom: true },
};
function moduleLines(value) {
    return String(value || '')
        .replace(/^\s+|\s+$/g, '')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
}
function lineOf(source, index) {
    return source.slice(0, index).split('\n').length;
}
function compactFactText(value, limit = 220, label = '事实模块') {
    const text = safeText(value, Math.max(limit * 4, 1200)).replace(/\s+/g, ' ').trim();
    if (!text)
        return '';
    if (text.length > limit)
        throw new Error(`${label}过长：${text.length}/${limit} 字；只写一到两句具体事实`);
    return text;
}
/**
 * 模型偶尔会把同一语义槽拆成两个同名模块。该情况不改变对象、表格或语义层，
 * 可以在本地确定性合并，不能升级为第二次剧情模型调用。
 */
function mergeNaturalModuleContent(left, right, tag) {
    const values = [];
    const identities = new Set();
    for (const value of [left, right]) {
        for (const part of String(value || '').split(/[；;]+/u).map((item) => item.trim()).filter(Boolean)) {
            const key = identity(part);
            if (!key || identities.has(key))
                continue;
            identities.add(key);
            values.push(part);
        }
    }
    const limit = tag === 'MA_CORE' ? 640 : 440;
    return compactFactText(values.join('；'), limit, `<${tag}> 合并结果`);
}
// 事件关闭只接受正文和事实模块共同出现的明确终局表达。单个动作完成、到达、开门、
// 交付一件物品等原子结果都不能据此关闭整条事件线。
const EXPLICIT_EVENT_TERMINAL_RE = /(?:事件|任务|目标|委托|调查|案件|战斗|冲突|谈判|交易|仪式|行动|计划|追捕|危机|救援|审判|比赛|旅程|会面|婚礼|实验|测量流程|观测流程|测试|验证|分析流程|研究阶段|项目|工作流|拍摄|场次).{0,16}(?:已结束|已经结束|结束了|已完成|已经完成|完成了|已解决|已经解决|已关闭|已经关闭|已达成|已经达成|宣告结束|告一段落|结案|告破)|(?:任务完成|目标达成|危机解除|战斗结束|谈判结束|交易完成|仪式完成|追捕结束|调查结案|案件告破|救援完成|比赛结束|婚礼结束|实验结束|实验完成|测量流程完成|观测流程结束|测试完成|验证结束|分析流程完成|研究阶段结束|项目完成|工作流结束|拍摄结束|场次结束)|(?:此事|此案|争端|纠纷).{0,8}(?:作罢|了结|终结|不再追究)|(?:对方|双方|一方).{0,12}(?:认输|投降).{0,12}(?:不再追究|退出争端|停止争斗)/iu;
function explicitlyClosedEvent(event, sourceText) {
    if (event.modules.some((module) => module.unresolved))
        return false;
    const eventEvidence = event.modules
        .filter((module) => module.tag === 'MA_EVENT_RESULT' || module.tag === 'MA_EVENT_STATE' || module.tag === 'MA_CORE')
        .map((module) => module.content)
        .join(' ');
    const source = String(sourceText ?? '').trim();
    return Boolean(source
        && EXPLICIT_EVENT_TERMINAL_RE.test(eventEvidence)
        && EXPLICIT_EVENT_TERMINAL_RE.test(source));
}
/**
 * 1.3.14 自然模块协议。模块正文使用位置而非 key=value：对象模块第一行是对象名，后续是最短事实。
 */
function parseStateTextBlocks(raw) {
    const source = String(raw ?? '').replace(/^\uFEFF/, '').trim();
    if (!source)
        throw new Error('状态模型返回为空');
    if (/<MA_CHANGE>|<MA_(?:FACT|ROW)>|(^|\n)\s*[^\n]+\s*[=＝]\s*\S/iu.test(source)) {
        throw new Error('状态模型返回了已停用键值协议；只接受 <MA_EVENT> 内的自然事实模块');
    }
    const output = [];
    const turnRe = /<MA_TURN>([\s\S]*?)<\/MA_TURN>/giu;
    for (const match of source.matchAll(turnRe)) {
        const summary = compactFactText(match[1], 320, '<MA_TURN>');
        if (summary)
            output.push({ kind: 'turn', line: lineOf(source, match.index ?? 0), summary });
    }
    const eventRe = /<MA_EVENT>([\s\S]*?)<\/MA_EVENT>/giu;
    for (const match of source.matchAll(eventRe)) {
        const body = match[1];
        const line = lineOf(source, match.index ?? 0);
        const moduleRe = /<(MA_[A-Z_]+)>([\s\S]*?)<\/\1>/gu;
        const modules = [];
        let firstModuleIndex = body.length;
        for (const moduleMatch of body.matchAll(moduleRe)) {
            firstModuleIndex = Math.min(firstModuleIndex, moduleMatch.index ?? body.length);
            const tag = moduleMatch[1].toUpperCase();
            const spec = NATURAL_MODULES[tag];
            if (!spec)
                throw new Error(`第 ${lineOf(source, (match.index ?? 0) + (moduleMatch.index ?? 0))} 行使用了未注册模块 <${tag}>`);
            const lines = moduleLines(moduleMatch[2]);
            let objectName = '';
            let tableName = '';
            let layerLabel = spec.layer;
            let contentLines = [];
            if (spec.event) {
                contentLines = lines;
            }
            else if (spec.custom) {
                if (lines.length < 4)
                    throw new Error(`第 ${line} 行的 <MA_CUSTOM> 至少需要“表名、对象、语义层、事实”四行`);
                [tableName, objectName, layerLabel] = lines;
                contentLines = lines.slice(3);
            }
            else {
                objectName = lines[0] || '';
                contentLines = lines.slice(1);
            }
            const contentLimit = tag === 'MA_CORE' ? 320 : 220;
            const content = compactFactText(contentLines.join(' '), contentLimit, `<${tag}>`);
            if (!content)
                throw new Error(`第 ${line} 行的 <${tag}> 缺少具体事实`);
            if (!spec.event && !objectName)
                throw new Error(`第 ${line} 行的 <${tag}> 缺少对象名`);
            modules.push({
                tag,
                line,
                objectName: objectName || undefined,
                tableName: tableName || undefined,
                layerLabel,
                content,
                role: spec.role,
                eventModule: Boolean(spec.event),
                unresolved: Boolean(spec.unresolved),
            });
        }
        const prelude = moduleLines(body.slice(0, firstModuleIndex));
        const eventName = safeText(prelude[0], 240).trim();
        if (!eventName)
            throw new Error(`第 ${line} 行的 <MA_EVENT> 缺少事件名称`);
        // 兼容 1.3.14 已保存的模型输出：旧第二行可以读取，但只作为迁移输入，
        // 不再拥有事件关闭权。新协议在事件名之后直接进入事实模块。
        const legacyStatus = prelude[1] || '';
        if (legacyStatus && !/^(进行中|已结束)$/u.test(legacyStatus))
            throw new Error(`事件“${eventName}”在事件名后出现未知文本；新协议应直接写事实模块`);
        if (prelude.length > (legacyStatus ? 2 : 1))
            throw new Error(`事件“${eventName}”在事实模块前包含多余文本`);
        if (!modules.length)
            throw new Error(`事件“${eventName}”没有事实模块`);
        if (!modules.some((module) => module.tag === 'MA_CORE'))
            throw new Error(`事件“${eventName}”缺少唯一的 <MA_CORE> 动作骨架`);
        const mergedModules = [];
        const moduleIndexes = new Map();
        for (const module of modules) {
            const key = module.eventModule
                ? module.tag
                : `${module.tag}|${canonicalObjectTitle(module.objectName)}|${module.tableName || ''}|${module.layerLabel}`;
            const existingIndex = moduleIndexes.get(key);
            if (existingIndex === undefined) {
                moduleIndexes.set(key, mergedModules.length);
                mergedModules.push(module);
                continue;
            }
            const existing = mergedModules[existingIndex];
            existing.content = mergeNaturalModuleContent(existing.content, module.content, existing.tag);
            existing.unresolved = Boolean(existing.unresolved || module.unresolved);
        }
        output.push({ kind: 'event', line, eventName, reportedClosed: legacyStatus === '已结束', closed: false, modules: mergedModules });
    }
    if (!output.some((block) => block.kind === 'turn' || block.kind === 'event')) {
        throw new Error('状态模型未返回 <MA_TURN> 或 <MA_EVENT>');
    }
    return output.sort((a, b) => a.line - b.line);
}
function naturalTable(module, active) {
    if (module.tableName)
        return resolveTable(module.tableName, active);
    if (!module.role)
        throw new Error(`<${module.tag}> 无法确定对象表`);
    const table = tableByRole(active, module.role, false);
    if (!table)
        throw new Error(`<${module.tag}> 对应的表格未启用`);
    return table;
}
function arrayLayerOperation(layerKey) {
    return ['currentFacts', 'relatedObjects', 'relatedEvents'].includes(layerKey) ? 'add' : 'replace';
}
function eventCoreText(event) {
    return event.modules.find((module) => module.tag === 'MA_CORE')?.content
        || event.modules.find((module) => module.tag === 'MA_EVENT_RESULT')?.content
        || `${event.eventName}${event.closed ? '已结束' : '正在进行'}`;
}
function projectionPatchForFact(fact, working) {
    const view = fact.view;
    if (!view)
        return undefined;
    const rows = working[view.table] ?? [];
    const existing = rows.find((row) => row.id === view.rowId)
        ?? rows.find((row) => canonicalObjectTitle(row.title) === canonicalObjectTitle(view.objectTitle));
    const fields = { ...(existing?.fields ?? {}) };
    let content = existing?.content || '';
    let status = existing?.status || 'active';
    let rowKeywords = unique([...(existing?.keywords ?? []), ...(view.keywords ?? [])], 24, 100);
    if (view.layerKind === 'content')
        content = view.value;
    else if (view.layerKind === 'status')
        status = view.value;
    else if (view.layerKind === 'keywords')
        rowKeywords = unique([...rowKeywords, view.value], 24, 100);
    else if (view.layerType === 'string[]')
        fields[view.layerKey] = arrayAfterChange(fields[view.layerKey], [view.value], view.arrayOperation || 'replace');
    else if (view.layerKey)
        fields[view.layerKey] = view.value;
    if (!content && !(view.layerKind === 'field' && view.layerKey === 'baseContent'))
        content = view.objectTitle;
    if (view.moduleTag === 'MA_CORE')
        content = view.value;
    if (view.semanticRole === 'events')
        status = view.eventClosed ? '已结束' : '进行中';
    fields.relatedEvents = arrayAfterChange(fields.relatedEvents, [view.eventName], 'add');
    if (view.semanticRole === 'events' && view.relatedObjects?.length)
        fields.relatedObjects = arrayAfterChange(fields.relatedObjects, view.relatedObjects, 'add');
    const row = {
        id: existing?.id || view.rowId,
        title: existing?.title || view.objectTitle,
        content,
        keywords: rowKeywords,
        status,
        source: existing?.source ?? 'auto',
        locked: existing?.locked ?? false,
        lockMode: existing?.lockMode,
        lifecycle: existing?.lifecycle,
        entryLifecycle: existing?.entryLifecycle ? structuredClone(existing.entryLifecycle) : undefined,
        updatedAt: nowIso(),
        fields,
        semanticRole: view.semanticRole,
        eventId: fact.event_id,
        eventIds: unique([...(existing?.eventIds ?? []), existing?.eventId, fact.event_id], 80, 160),
        factIds: unique([...(existing?.factIds ?? []), fact.fact_id], 200, 180),
    };
    if (view.baseRevisionStatement)
        row.baseRevisionEvidence = { eventId: fact.event_id, factId: fact.fact_id, statement: view.baseRevisionStatement };
    return {
        table: view.table,
        row,
        matchKey: existing?.id || `new:${identity(view.objectTitle)}`,
        relocation: view.relocation,
    };
}
function naturalChange(event, module, active, previous, activeFacts, allObjectNames) {
    const enabledEventTable = module.eventModule ? tableByRole(active, 'events', false) : undefined;
    // <MA_EVENT> 是所有对象变化共用的事务容器。即使玩家关闭事件视图，
    // MA_CORE 仍需形成内部事实以维持对象事实的 event_id 一致性，但不得重新发布事件行。
    const table = module.eventModule
        ? (enabledEventTable ?? tableByRole(normalizeTableRegistry(), 'events', false))
        : naturalTable(module, active);
    if (!table)
        throw new Error(`<${module.tag}> 无法确定对象表`);
    const projectView = !module.eventModule || Boolean(enabledEventTable);
    const stableEventName = event.canonicalName || event.eventName;
    const objectName = module.eventModule ? stableEventName : module.objectName;
    const keywords = unique([objectName], 24, 100);
    let targetTable = table;
    let existing = findExistingRow(table.key, objectName, keywords, previous);
    let relocation;
    if (!existing) {
        const anchored = findUniqueExactRowAcrossTables(table.key, objectName, previous, active);
        if (anchored) {
            const protectedPlacement = anchored.row.source === 'manual' || anchored.row.locked || anchored.row.lockMode === 'all' || anchored.row.lockMode === 'base';
            const explicitSemanticMove = anchored.table.key !== table.key && !(table.role === 'characters' && anchored.table.role !== 'characters');
            if (explicitSemanticMove && !protectedPlacement) {
                existing = anchored.row;
                relocation = { id: anchored.row.id, title: anchored.row.title, fromTable: anchored.table.key, toTable: table.key };
            }
            else {
                targetTable = anchored.table;
                existing = anchored.row;
            }
        }
    }
    const layer = resolveStateLayer(targetTable, module.layerLabel);
    const eventId = event.eventId;
    const factTitle = `${objectName}·${layer.label}`;
    const previousMatches = activeFacts.filter((fact) => fact.eventId === eventId && identity(fact.title) === identity(factTitle));
    const replacementLayer = !module.eventModule && arrayLayerOperation(layer.key) === 'replace';
    const hostId = existing?.id;
    const currentHostFact = replacementLayer && hostId
        ? [...activeFacts].reverse().find((fact) => fact.active !== false
            && !fact.supersededByFactId
            && (fact.primaryHost?.id === hostId || fact.view?.rowId === hostId)
            && (fact.view?.layerKey === layer.key || identity(fact.title) === identity(factTitle)))
        : undefined;
    const sameCurrentValue = currentHostFact
        && identity(currentHostFact.content) === identity(module.content);
    const factId = sameCurrentValue
        ? currentHostFact.factId
        : currentHostFact
            ? `fact_${hashText(`${hostId}|${layer.key}|${currentHostFact.factId}|${identity(module.content)}`)}`
            : previousMatches.length === 1
                ? previousMatches[0].factId
                : `fact_${hashText(`${eventId}|${identity(factTitle)}`)}`;
    const relatedObjects = module.eventModule ? allObjectNames : [objectName];
    const previousBase = safeText(existing?.fields?.baseContent, 12000).trim();
    const fact = {
        fact_id: factId,
        event_id: eventId,
        entity_id: eventId,
        type: targetTable.role,
        title: factTitle,
        content: module.content,
        occurred: module.unresolved ? [] : [module.content],
        unresolved: module.unresolved ? [module.content] : [],
        status: module.unresolved ? 'active' : 'active',
        time_range: {},
        related_entities: unique([...relatedObjects, stableEventName, event.eventName], 40, 240),
        keywords: unique([objectName, stableEventName, event.eventName, factTitle], 24, 100),
        operation: sameCurrentValue || previousMatches.some((fact) => fact.factId === factId) ? 'update' : 'create',
        confidence: 'confirmed',
        supersedes_fact_id: currentHostFact && !sameCurrentValue ? currentHostFact.factId : undefined,
        view: projectView ? {
            table: targetTable.key,
            rowId: existing?.id || makeId(targetTable.key),
            objectTitle: existing?.title || objectName,
            semanticRole: targetTable.role,
            layerKind: layer.kind,
            layerKey: layer.key,
            layerType: layer.definition?.type,
            arrayOperation: arrayLayerOperation(layer.key),
            value: module.content,
            keywords: unique([...keywords, stableEventName, event.eventName], 24, 100),
            eventName: stableEventName,
            eventClosed: event.closed,
            relatedObjects: module.eventModule ? allObjectNames : [],
            moduleTag: module.tag,
            relocation,
            baseRevisionStatement: layer.kind === 'field' && layer.key === 'baseContent' && existing && previousBase !== module.content
                ? eventCoreText(event)
                : undefined,
        } : undefined,
    };
    return {
        ...fact,
        ...applyFactContractGate(fact, { existingObject: Boolean(existing) }),
    };
}
function parseStateTextOutput(raw, previousSnapshot, registry, activeFacts = [], options = {}) {
    const active = enabledTables(normalizeTableRegistry(registry));
    const previous = dedupeStrongStateRows(previousSnapshot, registry);
    const working = structuredClone(previous);
    const blocks = parseStateTextBlocks(raw);
    const turnSummary = blocks.filter((block) => block.kind === 'turn').map((block) => block.summary).at(-1) ?? '';
    const factsById = new Map();
    const snapshot = {};
    const rowsByIdentity = new Map();
    const relocationsById = new Map();
    for (const event of blocks.filter((block) => block.kind === 'event')) {
        event.closed = explicitlyClosedEvent(event, options.sourceText);
        const eventIdentity = resolveNaturalEventIdentity(event, working, active, activeFacts);
        event.eventId = eventIdentity.eventId;
        event.canonicalName = eventIdentity.canonicalName;
        const allObjectNames = unique(event.modules.filter((module) => !module.eventModule).map((module) => module.objectName), 40, 240);
        for (const module of event.modules) {
            const fact = naturalChange(event, module, active, working, activeFacts, allObjectNames);
            const id = String(fact.fact_id);
            factsById.set(id, factsById.has(id) ? mergeFacts(factsById.get(id), fact) : fact);
            const patch = projectionPatchForFact(fact, working);
            if (!patch)
                continue;
            applyPatchToWorkingSnapshot(working, patch);
            const key = `${patch.table}|${canonicalObjectTitle(patch.row.title) || patch.matchKey}`;
            const current = rowsByIdentity.get(key);
            rowsByIdentity.set(key, current ? {
                table: patch.table,
                row: mergePatchRows(current.row, patch.row),
                matchKey: patch.matchKey,
                relocation: current.relocation ?? patch.relocation,
            } : patch);
            if (patch.relocation)
                relocationsById.set(patch.relocation.id, patch.relocation);
        }
        // 事件状态由插件生成稳定事实，永远最后提交，确保已结束事件不会被后续对象模块重新判为 active。
        const eventId = event.eventId;
        const stableEventName = event.canonicalName || event.eventName;
        const statusFactId = `fact_${hashText(`${eventId}|event-status`)}`;
        const previousStatus = activeFacts.find((fact) => fact.factId === statusFactId);
        const eventTable = tableByRole(active, 'events', false);
        const existingEventRow = eventTable
            ? eventRowById(working, active, eventId)
                || findExistingRow(eventTable.key, stableEventName, [stableEventName, event.eventName], working)
            : undefined;
        const statusFact = {
            fact_id: statusFactId,
            event_id: eventId,
            entity_id: eventId,
            type: 'events',
            title: `${stableEventName}·事件状态`,
            content: event.closed ? `${stableEventName}已结束。` : `${stableEventName}正在进行。`,
            occurred: [event.closed ? `${stableEventName}已结束。` : `${stableEventName}正在进行。`],
            unresolved: event.modules.filter((module) => module.unresolved).map((module) => module.content),
            status: event.closed ? 'closed' : 'active',
            time_range: {},
            related_entities: unique([stableEventName, event.eventName, ...allObjectNames], 40, 240),
            keywords: unique([stableEventName, event.eventName], 24, 100),
            operation: event.closed ? 'close' : previousStatus ? 'update' : 'create',
            confidence: 'confirmed',
            view: eventTable ? {
                table: eventTable.key,
                rowId: existingEventRow?.id || makeId(eventTable.key),
                objectTitle: existingEventRow?.title || stableEventName,
                semanticRole: 'events',
                layerKind: 'status',
                value: event.closed ? '已结束' : '进行中',
                keywords: unique([stableEventName, event.eventName], 24, 100),
                eventName: stableEventName,
                eventClosed: event.closed,
                relatedObjects: allObjectNames,
                moduleTag: 'MA_EVENT_STATUS',
            } : undefined,
        };
        const routedStatusFact = {
            ...statusFact,
            ...applyFactContractGate(statusFact, { existingObject: Boolean(existingEventRow) }),
        };
        factsById.set(statusFactId, routedStatusFact);
        const statusPatch = projectionPatchForFact(routedStatusFact, working);
        if (statusPatch) {
            applyPatchToWorkingSnapshot(working, statusPatch);
            const key = `${statusPatch.table}|${canonicalObjectTitle(statusPatch.row.title) || statusPatch.matchKey}`;
            const current = rowsByIdentity.get(key);
            rowsByIdentity.set(key, current ? {
                table: statusPatch.table,
                row: mergePatchRows(current.row, statusPatch.row),
                matchKey: statusPatch.matchKey,
                relocation: current.relocation ?? statusPatch.relocation,
            } : statusPatch);
        }
    }
    for (const { table, row } of rowsByIdentity.values())
        (snapshot[table] ||= []).push(row);
    return {
        turnSummary,
        facts: [...factsById.values()],
        snapshot,
        relocations: [...relocationsById.values()],
        entryLifecycleDirectives: [],
    };
}

}
};
__defs["domain/summary-text.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
with(__scope){
Object.defineProperty(exports,"parseSummaryTextOutput",{enumerable:true,configurable:true,get:()=>parseSummaryTextOutput});
/**
 * 模块职责：解析小总结和大总结的自然文本模块，并按本次请求槽位回收结果。
 * 维护边界：模型只返回位置固定的短文本；eventId、总结 ID、版本链和持久化全部由插件维护。
 */
function lines(value) {
    return String(value || '')
        .replace(/^\s+|\s+$/g, '')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
}
function lineOf(source, index) {
    return source.slice(0, index).split('\n').length;
}
function nested(body, tag) {
    const match = body.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'iu'));
    return match?.[1] ?? '';
}
function nestedAll(body, tag) {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'giu');
    return [...body.matchAll(re)].map((match) => match[1]);
}
/**
 * 固定自然模块：<MA_SUMMARY> 的前两行依次是 slot 与标题；摘要正文和关键词放在独立子模块。
 * 任何 key=value 都视为旧协议并拒绝，避免总结文本继续表现为数据库表单。
 */
function parseSummaryTextOutput(raw, expectedSlots) {
    const source = String(raw ?? '').replace(/^\uFEFF/, '').trim();
    if (!source)
        throw new Error('总结模型返回为空');
    if (/(^|\n)\s*[^\n]+\s*[=＝]\s*\S/u.test(source))
        throw new Error('总结模型返回了已停用键值协议');
    const expected = new Set(expectedSlots.map((slot) => slot.toUpperCase()));
    const output = new Map();
    const blockRe = /<MA_SUMMARY>([\s\S]*?)<\/MA_SUMMARY>/giu;
    for (const match of source.matchAll(blockRe)) {
        const body = match[1];
        const firstNested = body.search(/<MA_(?:SUMMARY_TEXT|MEMORY|KEYWORDS)>/iu);
        const prelude = lines(firstNested < 0 ? body : body.slice(0, firstNested));
        const slot = safeText(prelude[0], 40).trim().toUpperCase();
        const title = safeText(prelude[1], 1000).trim();
        const line = lineOf(source, match.index ?? 0);
        if (!slot)
            throw new Error(`第 ${line} 行开始的 <MA_SUMMARY> 缺少槽位`);
        if (!expected.has(slot))
            throw new Error(`总结返回未请求槽位：${slot}`);
        if (output.has(slot))
            throw new Error(`总结重复返回槽位：${slot}`);
        const summary = safeText(nested(body, 'MA_SUMMARY_TEXT'), 20000).replace(/\s+/g, ' ').trim();
        if (!summary)
            throw new Error(`总结槽位 ${slot} 缺少 <MA_SUMMARY_TEXT>`);
        const keywords = lines(nested(body, 'MA_KEYWORDS'))
            .map((item) => safeText(item.replace(/^[-*•]\s*/, ''), 200).trim())
            .filter(Boolean)
            .slice(0, 24);
        const distributions = nestedAll(body, 'MA_MEMORY').map((value) => {
            const parts = lines(value);
            const content = safeText(parts.slice(2).join(' '), 1200).replace(/\s+/g, ' ').trim();
            if (content.length > 220)
                throw new Error(`总结槽位 ${slot} 的对象记忆过长：${content.length}/220 字`);
            return {
                objectType: safeText(parts[0], 80).trim(),
                objectName: safeText(parts[1], 240).trim(),
                content,
            };
        }).filter((item) => item.objectName && item.content).slice(0, 40);
        output.set(slot, { slot, title, summary, keywords, unresolved: [], distributions });
    }
    if (!output.size)
        throw new Error('总结模型未返回 <MA_SUMMARY>');
    for (const slot of expected)
        if (!output.has(slot))
            throw new Error(`总结缺少槽位结果：${slot}`);
    return output;
}

}
};
__defs["domain/summary.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"makeId",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["makeId"]});
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
with(__scope){
Object.defineProperty(exports,"normalizeSummary",{enumerable:true,configurable:true,get:()=>normalizeSummary});
function stringList(value, limit = 60, itemLimit = 600) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => safeText(item, itemLimit).trim()).filter(Boolean))].slice(0, limit);
}
function normalizeActivityUpdates(value) {
    if (!Array.isArray(value))
        return [];
    const allowed = new Set(['休眠', '长期休眠', '已归档']);
    return value.map((item) => item && typeof item === 'object' ? item : {}).map((item) => ({
        rowId: safeText(item.rowId, 160).trim(), activity: safeText(item.activity, 40).trim(), reason: safeText(item.reason, 500).trim(),
    })).filter((item) => item.rowId && allowed.has(item.activity)).slice(0, 30);
}
function normalizeSedimentation(value) {
    if (!value || typeof value !== 'object')
        return undefined;
    const source = value;
    return {
        removeRowIds: stringList(source.removeRowIds, 50, 160),
        characterActivityUpdates: normalizeActivityUpdates(source.characterActivityUpdates),
        notes: stringList(source.notes, 30, 500),
        appliedRowIds: stringList(source.appliedRowIds, 80, 160),
        ignoredRowIds: stringList(source.ignoredRowIds, 80, 160),
    };
}
function normalizeSummary(value, kind, sourceKeys, previousLargeSummaryId, metadata = {}) {
    return {
        id: makeId(kind),
        kind,
        title: safeText(value.title || (kind === 'small' ? '事件线小总结' : '长期因果总结'), 240).trim(),
        summary: safeText(value.summary || '', 30000).trim(),
        keywords: stringList(value.keywords, 32, 100),
        sourceKeys: [...new Set(sourceKeys)],
        sourceFactIds: metadata.sourceFactIds ? [...new Set(metadata.sourceFactIds)] : (kind === 'small' ? [...new Set(sourceKeys)] : undefined),
        sourceSummaryIds: kind === 'large' ? [...new Set(metadata.sourceSummaryIds ?? sourceKeys)] : undefined,
        eventId: safeText(metadata.eventId || value.event_id || value.eventId, 160).trim() || undefined,
        eventIds: kind === 'large' ? [...new Set(metadata.eventIds ?? (metadata.eventId ? [metadata.eventId] : []))] : undefined,
        unresolvedItems: stringList(value.unresolved ?? value.unresolvedItems, 40, 1000),
        createdAt: nowIso(),
        // 兼容字段现在只保存统一状态机的结算报告，不再反向修改快照。
        sedimentation: normalizeSedimentation(value.sedimentation),
        previousLargeSummaryId: kind === 'large' ? previousLargeSummaryId : undefined,
    };
}

}
};
__defs["domain/table-link-rules.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"hashText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["hashText"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
Object.defineProperty(__scope,"tableByKey",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["tableByKey"]});
with(__scope){
Object.defineProperty(exports,"normalizeTableLinkRules",{enumerable:true,configurable:true,get:()=>normalizeTableLinkRules});
Object.defineProperty(exports,"restoreDefaultTableLinkRules",{enumerable:true,configurable:true,get:()=>restoreDefaultTableLinkRules});
Object.defineProperty(exports,"enabledTableLinkRules",{enumerable:true,configurable:true,get:()=>enabledTableLinkRules});
Object.defineProperty(exports,"tableLinkRulesFingerprint",{enumerable:true,configurable:true,get:()=>tableLinkRulesFingerprint});
Object.defineProperty(exports,"createTableLinkRule",{enumerable:true,configurable:true,get:()=>createTableLinkRule});
Object.defineProperty(exports,"updateTableLinkRule",{enumerable:true,configurable:true,get:()=>updateTableLinkRule});
Object.defineProperty(exports,"removeTableLinkRule",{enumerable:true,configurable:true,get:()=>removeTableLinkRule});
Object.defineProperty(exports,"linkedTargetRoles",{enumerable:true,configurable:true,get:()=>linkedTargetRoles});
Object.defineProperty(exports,"DEFAULT_TABLE_LINK_RULES",{enumerable:true,configurable:true,get:()=>DEFAULT_TABLE_LINK_RULES});
const DEFAULT_RULE_DEFINITIONS = [
    {
        id: 'link_spacetime_context',
        sourceTableKey: 'spacetime',
        targetTableKeys: ['scenes', 'characters', 'items', 'events'],
        enabled: true,
        isDefault: true,
    },
];

const DEFAULT_TABLE_LINK_RULES = Object.freeze(DEFAULT_RULE_DEFINITIONS.map((rule) => Object.freeze({
    ...rule,
    targetTableKeys: Object.freeze([...rule.targetTableKeys]),
})));

function normalizedRuleId(value, sourceTableKey, targetTableKeys, index) {
    const raw = safeText(value, 80).trim().replace(/[^a-zA-Z0-9_-]/g, '');
    return raw || `link_${hashText(`${sourceTableKey}|${targetTableKeys.join(',')}|${index}`)}`;
}

/**
 * 联动规则只表达“来源表变化时，同轮重新检查哪些目标表”。
 * 它不直接修改目标表，也不允许脚本或表达式进入运行链。
 */
function normalizeTableLinkRules(value, registryValue) {
    const registry = normalizeTableRegistry(registryValue);
    const tableKeys = new Set(registry.map((table) => table.key));
    const source = Array.isArray(value) ? value : DEFAULT_TABLE_LINK_RULES;
    const output = [];
    const usedIds = new Set();
    source.forEach((item, index) => {
        const row = item && typeof item === 'object' ? item : {};
        const sourceTableKey = safeText(row.sourceTableKey ?? row.source, 80).trim();
        if (!tableKeys.has(sourceTableKey))
            return;
        const targets = Array.isArray(row.targetTableKeys)
            ? row.targetTableKeys
            : Array.isArray(row.targets) ? row.targets : [];
        const targetTableKeys = [...new Set(targets
                .map((target) => safeText(target, 80).trim())
                .filter((target) => target && target !== sourceTableKey && tableKeys.has(target)))];
        if (!targetTableKeys.length)
            return;
        let id = normalizedRuleId(row.id, sourceTableKey, targetTableKeys, index);
        if (usedIds.has(id))
            id = `${id}_${index + 1}`;
        usedIds.add(id);
        output.push({
            id,
            sourceTableKey,
            targetTableKeys,
            enabled: row.enabled !== false,
            isDefault: Boolean(row.isDefault || DEFAULT_TABLE_LINK_RULES.some((rule) => rule.id === id)),
        });
    });
    return output;
}

function restoreDefaultTableLinkRules(registryValue) {
    return normalizeTableLinkRules(DEFAULT_TABLE_LINK_RULES.map((rule) => ({
        ...rule,
        targetTableKeys: [...rule.targetTableKeys],
    })), registryValue);
}

function enabledTableLinkRules(value, registryValue) {
    const registry = normalizeTableRegistry(registryValue);
    const enabledTables = new Set(registry.filter((table) => table.enabled).map((table) => table.key));
    return normalizeTableLinkRules(value, registry)
        .filter((rule) => rule.enabled && enabledTables.has(rule.sourceTableKey))
        .map((rule) => ({
            ...rule,
            targetTableKeys: rule.targetTableKeys.filter((key) => enabledTables.has(key)),
        }))
        .filter((rule) => rule.targetTableKeys.length);
}

function tableLinkRulesFingerprint(value, registryValue) {
    return hashText(JSON.stringify(normalizeTableLinkRules(value, registryValue).map((rule) => ({
        id: rule.id,
        sourceTableKey: rule.sourceTableKey,
        targetTableKeys: rule.targetTableKeys,
        enabled: rule.enabled,
    }))));
}

function createTableLinkRule(value, registryValue, sourceTableKey, targetTableKeys) {
    const registry = normalizeTableRegistry(registryValue);
    const next = normalizeTableLinkRules(value, registry);
    const source = tableByKey(registry, sourceTableKey);
    if (!source)
        throw new Error('请选择有效的来源表头');
    const targets = [...new Set((targetTableKeys ?? []).filter((key) => key !== sourceTableKey && tableByKey(registry, key)))];
    if (!targets.length)
        throw new Error('请至少选择一个需要重新检查的目标表头');
    next.push({
        id: `link_${hashText(`${sourceTableKey}|${targets.join(',')}|${Date.now()}|${next.length}`)}`,
        sourceTableKey,
        targetTableKeys: targets,
        enabled: true,
        isDefault: false,
    });
    return normalizeTableLinkRules(next, registry);
}

function updateTableLinkRule(value, registryValue, id, patch) {
    const registry = normalizeTableRegistry(registryValue);
    const next = normalizeTableLinkRules(value, registry).map((rule) => rule.id === id
        ? {
            ...rule,
            sourceTableKey: patch.sourceTableKey ?? rule.sourceTableKey,
            targetTableKeys: patch.targetTableKeys ?? rule.targetTableKeys,
            enabled: patch.enabled ?? rule.enabled,
        }
        : rule);
    return normalizeTableLinkRules(next, registry);
}

function removeTableLinkRule(value, registryValue, id) {
    return normalizeTableLinkRules(value, registryValue).filter((rule) => rule.id !== id);
}

function linkedTargetRoles(value, registryValue, sourceRole) {
    const registry = normalizeTableRegistry(registryValue);
    const tableByKeyMap = new Map(registry.map((table) => [table.key, table]));
    const roles = new Set();
    for (const rule of enabledTableLinkRules(value, registry)) {
        const source = tableByKeyMap.get(rule.sourceTableKey);
        if (source?.role !== sourceRole)
            continue;
        for (const targetKey of rule.targetTableKeys) {
            const target = tableByKeyMap.get(targetKey);
            if (target?.role)
                roles.add(target.role);
        }
    }
    return roles;
}

}
};
__defs["domain/table-registry.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"deepClone",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["deepClone"]});
Object.defineProperty(__scope,"hashText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["hashText"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
with(__scope){
Object.defineProperty(exports,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>normalizeTableRegistry});
Object.defineProperty(exports,"exportTableRegistryTemplate",{enumerable:true,configurable:true,get:()=>exportTableRegistryTemplate});
Object.defineProperty(exports,"normalizeImportedTableRegistry",{enumerable:true,configurable:true,get:()=>normalizeImportedTableRegistry});
Object.defineProperty(exports,"migrateTableRegistryToObjectViews",{enumerable:true,configurable:true,get:()=>migrateTableRegistryToObjectViews});
Object.defineProperty(exports,"enabledTables",{enumerable:true,configurable:true,get:()=>enabledTables});
Object.defineProperty(exports,"tableByKey",{enumerable:true,configurable:true,get:()=>tableByKey});
Object.defineProperty(exports,"tableByRole",{enumerable:true,configurable:true,get:()=>tableByRole});
Object.defineProperty(exports,"tableKeyForRole",{enumerable:true,configurable:true,get:()=>tableKeyForRole});
Object.defineProperty(exports,"restoreDefaultTableRegistry",{enumerable:true,configurable:true,get:()=>restoreDefaultTableRegistry});
Object.defineProperty(exports,"registryFingerprint",{enumerable:true,configurable:true,get:()=>registryFingerprint});
Object.defineProperty(exports,"customizedFieldLabel",{enumerable:true,configurable:true,get:()=>customizedFieldLabel});
Object.defineProperty(exports,"tableColumnHeaders",{enumerable:true,configurable:true,get:()=>tableColumnHeaders});
Object.defineProperty(exports,"editableHeaderText",{enumerable:true,configurable:true,get:()=>editableHeaderText});
Object.defineProperty(exports,"updateTableHeaders",{enumerable:true,configurable:true,get:()=>updateTableHeaders});
Object.defineProperty(exports,"parseCustomFields",{enumerable:true,configurable:true,get:()=>parseCustomFields});
Object.defineProperty(exports,"customFieldText",{enumerable:true,configurable:true,get:()=>customFieldText});
Object.defineProperty(exports,"updateTableFields",{enumerable:true,configurable:true,get:()=>updateTableFields});
Object.defineProperty(exports,"createCustomTable",{enumerable:true,configurable:true,get:()=>createCustomTable});
Object.defineProperty(exports,"updateTableDefinition",{enumerable:true,configurable:true,get:()=>updateTableDefinition});
Object.defineProperty(exports,"removeTableDefinition",{enumerable:true,configurable:true,get:()=>removeTableDefinition});
Object.defineProperty(exports,"moveTableDefinition",{enumerable:true,configurable:true,get:()=>moveTableDefinition});
Object.defineProperty(exports,"migrateSnapshotTables",{enumerable:true,configurable:true,get:()=>migrateSnapshotTables});
Object.defineProperty(exports,"CORE_FIELD_KEYS",{enumerable:true,configurable:true,get:()=>CORE_FIELD_KEYS});
Object.defineProperty(exports,"EDITABLE_HEADER_FIELD_KEYS",{enumerable:true,configurable:true,get:()=>EDITABLE_HEADER_FIELD_KEYS});
Object.defineProperty(exports,"DEFAULT_TABLE_REGISTRY",{enumerable:true,configurable:true,get:()=>DEFAULT_TABLE_REGISTRY});
Object.defineProperty(exports,"LEGACY_TABLE_KEY_MAP",{enumerable:true,configurable:true,get:()=>LEGACY_TABLE_KEY_MAP});
const CORE_FIELD_KEYS = [
    'id', 'title', 'content', 'keywords', 'status', 'factIds', 'eventId', 'recall',
    'baseContent', 'currentFacts', 'currentStates', 'recentHistory', 'solidifiedHistory', 'relatedObjects', 'relatedEvents',
    'absorbedMemory', 'relationshipStates', 'abilityStates', 'presentationStates', 'objectType', 'migrationStatus',
];
/** 玩家可改的是语义表头，不是底层字段身份。 */
const EDITABLE_HEADER_FIELD_KEYS = ['title', 'content', 'status', 'keywords'];
const EDITABLE_HEADER_FIELD_KEY_SET = new Set(EDITABLE_HEADER_FIELD_KEYS);
const RESERVED_CUSTOM_FIELD_KEYS = new Set([
    ...CORE_FIELD_KEYS,
    'name', 'summary', 'source', 'locked', 'lockMode', 'lifecycle', 'entryLifecycle', 'updatedAt',
    'fact_ids', 'event_id', 'fields', '__proto__', 'prototype', 'constructor',
]);
const COMMON_FIELDS = [
    { key: 'id', label: '稳定ID', description: '同一对象必须沿用稳定ID；不得因场景、状态或总结版本变化重新创建。', type: 'string', required: true },
    { key: 'title', label: '对象', description: '对象的稳定名称或明确标识。', type: 'string', required: true },
    { key: 'content', label: '当前摘要', description: '只概括当前有效状态，不复制基础内容、已固化历史或其他表格内容。', type: 'string', required: true },
    { key: 'keywords', label: '关键词', description: '对象名、别名及可明确触发该对象的词。', type: 'string[]', required: true },
    { key: 'status', label: '状态', description: '对象当前生命周期、阶段或有效性标记。', type: 'string', required: true },
];
const OBJECT_LAYER_FIELDS = [
    { key: 'baseContent', label: '身份与对象定义', description: '对象本身是什么，承担身份锚点。已有非空值不得因外观、称呼、情绪或普通状态变化改写；仅正文明确纠正、重定义、转化、毁灭、重建或人工编辑时变化。', type: 'string', required: false },
    { key: 'currentFacts', label: '长期与现行事实', description: '正文明确成立、持续时间较长但仍可能被后续明确事实替换的属性与事实；不得从单次情绪或行为推断人格。', type: 'string[]', required: false },
    { key: 'currentStates', label: '当前状态', description: '正在发生、短期或阶段性的状态；当前层应保留最多细节，并允许后续更新、关闭或替换。', type: 'string[]', required: false },
    { key: 'recentHistory', label: '近期经历', description: '由小总结归并的近期事件过程、直接因果与尚有后续作用的影响；细节少于当前层、多于历史层。', type: 'string[]', required: false },
    { key: 'solidifiedHistory', label: '历史事实', description: '由大总结长期固化的最精简结果与不可忽略影响；不得把无关事件线混在同一事实中。', type: 'string[]', required: false },
    { key: 'relatedObjects', label: '关联对象', description: '明确参与或受影响的对象稳定名称；不得因同场或围观建立关联。', type: 'string[]', required: false },
    { key: 'relatedEvents', label: '关联事件', description: '直接施加当前状态或长期影响的事件名称。', type: 'string[]', required: false },
    { key: 'absorbedMemory', label: '承接记录', description: '由插件写入：其他临时条目退出前分发到本条目的持续结果。原条目在总结覆盖审计通过后删除；模型不得直接填写。', type: 'string[]', required: false },
];
const CHARACTER_FIELDS = [
    { key: 'presentationStates', label: '外观与表现', description: '当前服装、伪装、称呼、外观与他人明确认知；只记录表象，不得反向改写身份锚点。', type: 'string[]', required: false },
    { key: 'relationshipStates', label: '关系状态', description: '仅记录已明确发生变化且会影响后续的关系；同场、普通对话和推测不得写入。', type: 'string[]', required: false },
    { key: 'abilityStates', label: '能力状态', description: '已确认能力及其当前可用、受限、获得、失去或改变状态；禁止按身份补全。', type: 'string[]', required: false },
];
const CUSTOM_OBJECT_FIELDS = [
    { key: 'objectType', label: '对象类型', description: '玩家定义或待归并对象的类型。', type: 'string', required: false },
    { key: 'migrationStatus', label: '归并状态', description: '独立、待归并、已归并或存在歧义。', type: 'string', required: false },
];
const LIFECYCLE_FIELD = {
    key: 'lifecycle', label: '生命周期', description: '角色存在、活跃、记忆、证据与回流条件。', type: 'lifecycle', required: false,
};
function roleFields(role) {
    const fields = [...deepClone(COMMON_FIELDS), ...deepClone(OBJECT_LAYER_FIELDS)];
    if (role === 'characters' || role === 'state')
        fields.push(...deepClone(CHARACTER_FIELDS), deepClone(LIFECYCLE_FIELD));
    if (role === 'custom')
        fields.push(...deepClone(CUSTOM_OBJECT_FIELDS));
    return fields;
}
function defaults() {
    const definitions = [
        ['spacetime', '时空', '记录当前真实时间、所在场景及影响连续性的空间变化；提及、回忆或背景地点不得写成当前位置。', 'spacetime'],
        ['scenes', '场景', '记录真实发生的叙事场景切片，包括参与对象、核心局面、直接限制与环境状态；正文明确结束后由插件按事实分发与总结覆盖执行结算。', 'scenes'],
        ['characters', '角色', '只记录具有持续作用的具体个体角色。外貌、站位、一次动作或一句台词不足以建档；组织、阵营、政权、群体、地点、制度和世界态势不得进入角色表。', 'characters'],
        ['items', '物品', '记录可区分且会影响后续连续性的具体物件、装备、文件、材料、容器、货币批次或关键资源；所有权、位置、数量、完整性、可用性、隐藏状态、用途或能否再次取得发生建立或变化时都应记录。纯布景不建档。', 'items'],
        ['events', '事件', '记录正文明确建立的起因、过程状态、结果或持续影响；普通交谈和无结果动作不建事件。', 'events'],
        ['regions', '地点', '记录真实进入或被明确建立为重要、可复用的地点及其定义、布局、归属、访问条件和持续变化；提及、回忆和模糊背景不建档。', 'regions'],
        ['globalChanges', '全局变化', '记录跨对象或区域持续生效的组织、阵营、政权、机构、群体格局、制度执行和世界态势；即使像角色一样行动也仍属全局。预测和局部波动不写入。', 'globalChanges'],
        ['foundations', '基础设定', '记录正文明确确认、长期稳定并约束世界运行的规则、制度、种族或世界设定；禁止按题材常识补全。', 'foundations'],
        ['customObjects', '自定义对象', '记录玩家主动定义或已满足建档资格但暂时无法安全归类的对象；不作为不确定信息和背景板的兜底。', 'custom'],
    ];
    return definitions.map(([key, name, purpose, role], order) => ({
        key, name, purpose, role, enabled: true, order, isDefault: true, fields: roleFields(role),
    }));
}
const DEFAULT_TABLE_REGISTRY = Object.freeze(defaults());
/** 直接映射只处理能无歧义迁移的旧表；关系/技能/焦点由 migrateSnapshotTables 进一步处理。 */
const LEGACY_TABLE_KEY_MAP = {
    spacetime: 'spacetime', scenes: 'scenes', characters: 'characters', state: 'characters', items: 'items',
    events: 'events', regions: 'regions', globalChanges: 'globalChanges', foundations: 'foundations',
    customObjects: 'customObjects',
};
function normalizeField(value, index) {
    const source = value && typeof value === 'object' ? value : {};
    const key = safeText(source.key, 60).trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!key)
        return null;
    const type = ['string', 'string[]', 'lifecycle'].includes(String(source.type)) ? source.type : 'string';
    return {
        key,
        label: safeText(source.label || key, 80).trim() || `字段${index + 1}`,
        description: safeText(source.description, 500).trim(),
        type,
        required: Boolean(source.required),
    };
}
function normalizedRole(value) {
    const allowed = new Set(['spacetime', 'scenes', 'characters', 'items', 'events', 'regions', 'globalChanges', 'foundations', 'custom', 'focus', 'state', 'skills', 'relationships']);
    return allowed.has(String(value)) ? String(value) : 'custom';
}
function mergeRoleFields(role, sourceFields) {
    const fields = roleFields(role);
    const incoming = (Array.isArray(sourceFields) ? sourceFields : []).map(normalizeField).filter((field) => Boolean(field));
    for (const field of incoming) {
        const existingIndex = fields.findIndex((existing) => existing.key === field.key);
        if (existingIndex < 0) {
            // BUGFIX：导入模板不得把 source/locked/constructor 等内部保留键伪装成自定义表头。
            if (RESERVED_CUSTOM_FIELD_KEYS.has(field.key))
                continue;
            fields.push(field);
            continue;
        }
        if (!EDITABLE_HEADER_FIELD_KEY_SET.has(field.key))
            continue;
        const canonical = fields[existingIndex];
        fields[existingIndex] = {
            ...canonical,
            label: field.label || canonical.label,
            description: field.description || canonical.description,
            // key/type/required 永远由 canonical 定义提供，玩家改表头不能改变传输结构。
        };
    }
    return fields;
}
function normalizeTableRegistry(value) {
    const source = Array.isArray(value) && value.length ? value : DEFAULT_TABLE_REGISTRY;
    const output = [];
    const used = new Set();
    source.forEach((item, index) => {
        const row = item && typeof item === 'object' ? item : {};
        let key = safeText(row.key, 80).trim().replace(/[^a-zA-Z0-9_-]/g, '');
        if (!key)
            key = `custom_${hashText(`${row.name}|${index}`)}`;
        if (used.has(key))
            key = `${key}_${index + 1}`;
        used.add(key);
        const role = normalizedRole(row.role);
        const rawName = safeText(row.name || DEFAULT_TABLE_REGISTRY.find((table) => table.key === key)?.name || `自定义表格 ${index + 1}`, 80).trim();
        const name = key === 'regions' && rawName === '区域' ? '地点' : rawName;
        output.push({
            key,
            name,
            purpose: safeText(row.purpose, 1000).trim() || '记录玩家定义、对后续生成有用的已显影对象与状态。',
            role,
            enabled: row.enabled !== false,
            order: Number.isFinite(Number(row.order)) ? Number(row.order) : index,
            isDefault: Boolean(row.isDefault || DEFAULT_TABLE_REGISTRY.some((table) => table.key === key)),
            fields: mergeRoleFields(role, row.fields),
        });
    });
    return output.sort((a, b) => a.order - b.order).map((table, order) => ({ ...table, order }));
}
/**
 * 导出模板只包含玩家可编辑的提取方向；不暴露内部 role、required、生命周期或核心存储字段。
 * key 仅用于导入时稳定匹配原表头，自定义字段保留 type 以避免往返后改变数据形态。
 */
function exportTableRegistryTemplate(value) {
    return normalizeTableRegistry(value).map((table) => ({
        key: table.key,
        name: table.name,
        purpose: table.purpose,
        enabled: table.enabled,
        order: table.order,
        headers: EDITABLE_HEADER_FIELD_KEYS.map((key) => {
            const field = table.fields.find((item) => item.key === key)
                ?? roleFields(table.role).find((item) => item.key === key);
            return field ? { key, label: field.label, description: field.description } : null;
        }).filter(Boolean),
        fields: table.fields
            .filter((field) => !CORE_FIELD_KEYS.includes(field.key) && field.key !== 'lifecycle')
            .map((field) => ({
                key: field.key,
                label: field.label,
                description: field.description,
                type: field.type === 'string' ? 'string' : 'string[]',
            })),
    }));
}

/**
 * 模板只承载显示表头、用途、启用状态、顺序和自定义表。
 * 默认表的内部 role 固定；导入的新表一律属于 custom，防止模板改写生命周期与事实路由。
 */
function normalizeImportedTableRegistry(value) {
    const canonicalRoles = new Map(DEFAULT_TABLE_REGISTRY.map((table) => [table.key, table.role]));
    const source = Array.isArray(value) ? value : [];
    const sanitized = source.map((item) => {
        const row = item && typeof item === 'object' ? item : {};
        const key = safeText(row.key, 80).trim().replace(/[^a-zA-Z0-9_-]/g, '');
        const canonicalRole = canonicalRoles.get(key);
        const fields = Array.isArray(row.headers)
            ? [...row.headers, ...(Array.isArray(row.fields) ? row.fields : [])]
            : row.fields;
        return {
            ...row,
            fields,
            role: canonicalRole ?? 'custom',
            isDefault: Boolean(canonicalRole),
        };
    });
    return normalizeTableRegistry(sanitized);
}
/** rc.22 默认十表迁移为对象视图；保留玩家自定义视图和默认表上的自定义字段。 */
function migrateTableRegistryToObjectViews(value) {
    const old = normalizeTableRegistry(value);
    const next = restoreDefaultTableRegistry();
    const sourceFor = {
        spacetime: ['spacetime'], scenes: ['scenes'], characters: ['characters', 'state'], items: ['items'], events: ['events'],
        regions: ['regions'], globalChanges: ['globalChanges'], foundations: ['foundations'], customObjects: ['customObjects'],
    };
    for (const table of next) {
        const source = old.find((item) => sourceFor[table.key]?.includes(item.key) || sourceFor[table.key]?.includes(item.role));
        if (!source)
            continue;
        table.enabled = source.enabled;
        table.fields = mergeRoleFields(table.role, source.fields);
    }
    const custom = old.filter((table) => !table.isDefault && !next.some((item) => item.key === table.key));
    return normalizeTableRegistry([...next, ...custom.map((table, index) => ({ ...table, order: next.length + index }))]);
}
function enabledTables(registry) {
    return normalizeTableRegistry(registry).filter((table) => table.enabled);
}
function tableByKey(registry, key) {
    return normalizeTableRegistry(registry).find((table) => table.key === key);
}
function tableByRole(registry, role, enabledOnly = true) {
    return normalizeTableRegistry(registry).find((table) => (!enabledOnly || table.enabled) && table.role === role);
}
function tableKeyForRole(registry, role, fallback = '') {
    return tableByRole(registry, role)?.key || fallback;
}
function restoreDefaultTableRegistry() { return deepClone(DEFAULT_TABLE_REGISTRY); }
function registryFingerprint(registry) {
    return hashText(JSON.stringify(normalizeTableRegistry(registry).map(({ key, name, purpose, role, enabled, order, fields }) => ({ key, name, purpose, role, enabled, order, fields }))));
}
function customizedFieldLabel(table, fieldKey, fallback) {
    const current = table.fields.find((field) => field.key === fieldKey);
    const canonical = roleFields(table.role).find((field) => field.key === fieldKey);
    if (!current?.label || current.label === canonical?.label)
        return fallback;
    return current.label;
}
function tableColumnHeaders(table) {
    const title = customizedFieldLabel(table, 'title', '对象');
    const content = customizedFieldLabel(table, 'content', '当前记录');
    const status = customizedFieldLabel(table, 'status', '状态');
    const keywords = customizedFieldLabel(table, 'keywords', '关键词');
    return { title, content, state: `${status}与${keywords}` };
}
function editableHeaderText(table) {
    return EDITABLE_HEADER_FIELD_KEYS.map((key) => {
        const field = table.fields.find((item) => item.key === key)
            ?? roleFields(table.role).find((item) => item.key === key);
        return field ? `${field.label}｜${field.description}` : '';
    }).filter(Boolean).join('\n');
}
function splitVisibleFieldLine(line) {
    const vertical = line.indexOf('｜') >= 0 ? line.indexOf('｜') : line.indexOf('|');
    if (vertical >= 0) {
        return {
            label: safeText(line.slice(0, vertical), 80).trim(),
            description: safeText(line.slice(vertical + 1), 500).trim(),
        };
    }
    const colon = line.search(/[:：]/);
    if (colon >= 0) {
        return {
            label: safeText(line.slice(0, colon), 80).trim(),
            description: safeText(line.slice(colon + 1), 500).trim(),
        };
    }
    return { label: safeText(line, 80).trim(), description: '' };
}
function updateTableHeaders(registry, key, headerText) {
    const current = normalizeTableRegistry(registry).find((table) => table.key === key);
    if (!current)
        return normalizeTableRegistry(registry);
    const updates = new Map();
    const rows = headerText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    rows.forEach((line, index) => {
        // 兼容旧版“字段键:玩家表头:说明”，新版 UI 不再展示底层字段键。
        const legacyParts = line.split(/[:：]/).map((part) => part.trim());
        const legacyKey = legacyParts[0] || '';
        if (EDITABLE_HEADER_FIELD_KEY_SET.has(legacyKey)) {
            const canonical = roleFields(current.role).find((field) => field.key === legacyKey);
            const label = safeText(legacyParts[1], 80).trim() || canonical?.label || legacyKey;
            const description = safeText(legacyParts.slice(2).join('：'), 500).trim() || canonical?.description || label;
            updates.set(legacyKey, { label, description });
            return;
        }
        const fieldKey = EDITABLE_HEADER_FIELD_KEYS[index];
        if (!fieldKey)
            return;
        const canonical = roleFields(current.role).find((field) => field.key === fieldKey);
        const visible = splitVisibleFieldLine(line);
        updates.set(fieldKey, {
            label: visible.label || canonical?.label || fieldKey,
            description: visible.description || canonical?.description || visible.label || fieldKey,
        });
    });
    const fields = current.fields.map((field) => {
        const update = updates.get(field.key);
        return update ? { ...field, ...update } : field;
    });
    return updateTableDefinition(registry, key, { fields });
}
function normalizedFieldLabel(value) {
    return safeText(value, 120).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}
function parseCustomFields(fieldText = '', previousCustom = []) {
    const used = new Set();
    const usedPrevious = new Set();
    const previousByLabel = new Map(previousCustom.map((field) => [normalizedFieldLabel(field.label), field]));
    const rows = fieldText.split(/\n+/).map((value) => value.trim()).filter(Boolean);
    return rows.map((line, index) => {
        const legacyParts = line.split(/[:：]/).map((part) => part.trim());
        const isLegacy = legacyParts.length >= 3 && /^(?:string|string\[\])$/.test(legacyParts[2] || '');
        if (isLegacy) {
            const rawKey = legacyParts[0] || `field_${index + 1}`;
            let key = safeText(rawKey, 60).trim().replace(/[^a-zA-Z0-9_-]/g, '') || `field_${index + 1}`;
            if (RESERVED_CUSTOM_FIELD_KEYS.has(key))
                throw new Error(`字段“${key}”是系统保留字段，不能用作自定义字段键`);
            while (used.has(key))
                key = `${key}_${index + 1}`;
            used.add(key);
            const label = safeText(legacyParts[1] || key, 80).trim() || key;
            const type = legacyParts[2] === 'string[]' ? 'string[]' : 'string';
            const description = safeText(legacyParts.slice(3).join('：') || label, 500).trim();
            return { key, label, description, type, required: false };
        }
        const visible = splitVisibleFieldLine(line);
        const label = visible.label || `表头${index + 1}`;
        const labelToken = normalizedFieldLabel(label);
        let previous = previousByLabel.get(labelToken);
        if (!previous || usedPrevious.has(previous.key))
            previous = previousCustom[index];
        if (previous && usedPrevious.has(previous.key))
            previous = undefined;
        if (previous)
            usedPrevious.add(previous.key);
        let key = previous?.key || `field_${hashText(`${label}|${index}`)}`;
        if (RESERVED_CUSTOM_FIELD_KEYS.has(key))
            key = `field_${hashText(`${label}|${index}|custom`)}`;
        while (used.has(key))
            key = `${key}_${index + 1}`;
        used.add(key);
        return {
            key,
            label: safeText(label, 80).trim() || `表头${index + 1}`,
            description: safeText(visible.description || previous?.description || label, 500).trim(),
            type: previous?.type === 'string' ? 'string' : 'string[]',
            required: false,
        };
    });
}
function customFieldText(table) {
    return table.fields.filter((field) => !CORE_FIELD_KEYS.includes(field.key) && field.key !== 'lifecycle')
        .map((field) => `${field.label}｜${field.description}`).join('\n');
}
function updateTableFields(registry, key, fieldText) {
    const current = normalizeTableRegistry(registry).find((table) => table.key === key);
    if (!current)
        return normalizeTableRegistry(registry);
    const previousCustom = current.fields.filter((field) => !CORE_FIELD_KEYS.includes(field.key) && field.key !== 'lifecycle');
    const rows = fieldText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const legacyMode = rows.length > 0 && rows.every((line) => {
        const parts = line.split(/[:：]/).map((part) => part.trim());
        return parts.length >= 3 && /^(?:string|string\[\])$/.test(parts[2] || '');
    });
    const nextCustom = parseCustomFields(fieldText, previousCustom);
    if (legacyMode) {
        const nextByKey = new Map(nextCustom.map((field) => [field.key, field]));
        const previousKeys = new Set(previousCustom.map((field) => field.key));
        const removedKeys = previousCustom.filter((field) => !nextByKey.has(field.key)).map((field) => field.key);
        const addedKeys = nextCustom.filter((field) => !previousKeys.has(field.key)).map((field) => field.key);
        if (removedKeys.length && addedKeys.length) {
            throw new Error(`字段键是稳定键，不能在同一次表头编辑中把“${removedKeys.join('、')}”改为“${addedKeys.join('、')}”`);
        }
        for (const previous of previousCustom) {
            const next = nextByKey.get(previous.key);
            if (next && next.type !== previous.type)
                throw new Error(`字段“${previous.key}”的字段类型创建后不可直接修改`);
        }
    }
    const coreFields = current.fields.filter((field) => CORE_FIELD_KEYS.includes(field.key) || field.key === 'lifecycle');
    return updateTableDefinition(registry, key, { fields: [...coreFields, ...nextCustom] });
}
function createCustomTable(registry, name, purpose, fieldText = '') {
    const next = normalizeTableRegistry(registry);
    const key = `custom_${hashText(`${name}|${Date.now()}|${next.length}`)}`;
    next.push({
        key,
        name: safeText(name, 80).trim() || '自定义表格',
        purpose: safeText(purpose, 1000).trim() || '记录玩家定义的对象、基础内容与可变状态。',
        role: 'custom', enabled: true, order: next.length, isDefault: false,
        fields: [...roleFields('custom'), ...parseCustomFields(fieldText)],
    });
    return normalizeTableRegistry(next);
}
function updateTableDefinition(registry, key, patch) {
    return normalizeTableRegistry(registry).map((table) => table.key === key
        ? { ...table, ...patch, key: table.key, isDefault: table.isDefault, fields: patch.fields ? patch.fields.map((field, index) => normalizeField(field, index)).filter(Boolean) : table.fields }
        : table);
}
function removeTableDefinition(registry, key) {
    return normalizeTableRegistry(registry).filter((table) => table.key !== key).map((table, order) => ({ ...table, order }));
}
function moveTableDefinition(registry, key, direction) {
    const next = normalizeTableRegistry(registry);
    const index = next.findIndex((table) => table.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length)
        return next;
    [next[index], next[target]] = [next[target], next[index]];
    return next.map((table, order) => ({ ...table, order }));
}
function normalizedName(value) {
    return safeText(value, 240).toLowerCase().replace(/[\s·•._—–\-|｜:：()（）【】\[\]]+/g, '');
}
function characterNameAliases(value) {
    const raw = safeText(value, 240).trim();
    const stripped = raw
        .replace(/^(?:人物|角色|人物状态|角色状态|档案|信息)\s*[:：|｜-]?\s*/i, '')
        .replace(/\s*(?:人物|角色|人物状态|角色状态|档案|信息|当前状态)$/i, '');
    const candidates = [raw, stripped, ...raw.split(/[|｜:：—–-]/)];
    return [...new Set(candidates.map(normalizedName).filter((name) => name.length >= 2 || /[\u3400-\u9fff]/.test(name)))];
}
function list(value) { return Array.isArray(value) ? value.map((item) => safeText(item, 500).trim()).filter(Boolean) : []; }
function rowText(row) { return `${safeText(row?.title, 240)} ${safeText(row?.content, 4000)} ${list(row?.keywords).join(' ')}`; }
function appendField(row, field, value) {
    row.fields ||= {};
    const current = list(row.fields[field]);
    if (value && !current.includes(value))
        current.push(value);
    row.fields[field] = current;
}
function mergeIds(row, source) {
    row.factIds = [...new Set([...list(row.factIds ?? row.fact_ids), ...list(source.factIds ?? source.fact_ids)])];
    row.keywords = [...new Set([...list(row.keywords), ...list(source.keywords)])];
    if (!row.eventId && (source.eventId || source.event_id))
        row.eventId = safeText(source.eventId || source.event_id, 160);
}
function mergeLegacyCharactersByStableId(rows) {
    const output = [];
    const byId = new Map();
    for (const raw of rows) {
        const row = deepClone(raw);
        const id = safeText(row?.id, 160).trim();
        const existing = id ? byId.get(id) : undefined;
        if (!existing) {
            output.push(row);
            if (id)
                byId.set(id, row);
            continue;
        }
        const existingFields = existing.fields && typeof existing.fields === 'object' ? existing.fields : {};
        const incomingFields = row.fields && typeof row.fields === 'object' ? row.fields : {};
        for (const [key, value] of Object.entries(incomingFields)) {
            if (Array.isArray(value))
                existingFields[key] = [...new Set([...list(existingFields[key]), ...list(value)])];
            else if (!safeText(existingFields[key], 12000).trim() && safeText(value, 12000).trim())
                existingFields[key] = deepClone(value);
        }
        existing.fields = existingFields;
        if (safeText(row.content, 12000).trim())
            existing.content = row.content;
        if (safeText(row.status, 120).trim())
            existing.status = row.status;
        if (safeText(row.updatedAt, 80).trim())
            existing.updatedAt = row.updatedAt;
        existing.source = existing.source === 'manual' || row.source === 'manual' ? 'manual' : existing.source ?? row.source;
        existing.locked = Boolean(existing.locked || row.locked);
        existing.lockMode = existing.locked || existing.lockMode === 'all' || row.lockMode === 'all'
            ? 'all'
            : existing.source === 'manual' || existing.lockMode === 'base' || row.lockMode === 'base'
                ? 'base'
                : undefined;
        mergeIds(existing, row);
    }
    return output;
}
/**
 * 归属不唯一的旧关系、技能或人工焦点先进入待归并对象。
 * 这里保留原 id/正文和玩家锁定语义，不把“不确定归属”伪装成已确认的角色状态。
 */
function pendingCustom(row, objectType) {
    return {
        ...deepClone(row),
        id: safeText(row?.id, 160).trim() || `legacy_${objectType}_${hashText(rowText(row))}`,
        fields: { ...(row?.fields && typeof row.fields === 'object' ? deepClone(row.fields) : {}), objectType, migrationStatus: '待归并' },
    };
}
/**
 * 将旧角色/状态直接迁入角色对象；旧关系与技能只在对象匹配明确时分发到角色状态，否则保留为待归并自定义对象。
 * 旧自动焦点不迁移为事实；玩家人工/锁定焦点保留到自定义对象，避免数据丢失。
 */
function migrateSnapshotTables(value, registry) {
    const source = value && typeof value === 'object' ? value : {};
    const tables = normalizeTableRegistry(registry);
    const output = Object.fromEntries(tables.map((table) => [table.key, []]));
    const characterKey = tableByRole(tables, 'characters', false)?.key || tableByRole(tables, 'state', false)?.key;
    const customKey = tableByRole(tables, 'custom', false)?.key || 'customObjects';
    for (const [sourceKey, rawRows] of Object.entries(source)) {
        if (!Array.isArray(rawRows))
            continue;
        const targetKey = LEGACY_TABLE_KEY_MAP[sourceKey] ?? sourceKey;
        // 旧 characters/state 必须脱离 JSON 键顺序单独处理；characters 提供身份，
        // state 随后只覆盖当前正文、状态和更新时间。
        if (characterKey && targetKey === characterKey && ['characters', 'state'].includes(sourceKey))
            continue;
        if (targetKey in output)
            output[targetKey].push(...deepClone(rawRows));
    }
    if (characterKey) {
        for (const sourceKey of ['characters', 'state']) {
            const rawRows = source[sourceKey];
            if (Array.isArray(rawRows))
                output[characterKey].push(...deepClone(rawRows));
        }
    }
    const characters = characterKey ? mergeLegacyCharactersByStableId(output[characterKey] ?? []) : [];
    if (characterKey)
        output[characterKey] = characters;
    const characterNames = characters
        .map((row) => ({ row, names: characterNameAliases(row?.title) }))
        .filter((item) => item.names.length);
    // 关系允许一至两个明确角色；技能只允许唯一所有者。匹配数量超出边界时宁可待归并，也不猜测分发对象。
    const distribute = (rows, field, objectType) => {
        if (!Array.isArray(rows))
            return;
        for (const raw of rows) {
            const row = deepClone(raw);
            const text = normalizedName(rowText(row));
            const matches = characterNames.filter((item) => item.names.some((name) => text.includes(name)));
            const allowed = field === 'relationshipStates'
                ? (matches.length >= 1 && matches.length <= 2 ? matches : [])
                : (matches.length === 1 ? matches : []);
            if (!allowed.length) {
                if (customKey in output)
                    output[customKey].push(pendingCustom(row, objectType));
                continue;
            }
            const statement = `${safeText(row.title, 240).trim()}${safeText(row.content, 4000).trim() ? `：${safeText(row.content, 4000).trim()}` : ''}`;
            for (const match of allowed) {
                appendField(match.row, field, statement);
                if (row.eventId || row.event_id)
                    appendField(match.row, 'relatedEvents', safeText(row.eventId || row.event_id, 160));
                mergeIds(match.row, row);
            }
            // 人工/锁定旧行保留为迁移凭据，标记已归并；它们留在 UI 中但不再重复发布世界书。
            if ((row.source === 'manual' || row.locked) && customKey in output) {
                const migrated = pendingCustom(row, objectType);
                migrated.fields.migrationStatus = '已归并';
                migrated.fields.relatedObjects = allowed.map((match) => safeText(match.row.id || match.row.title, 240)).filter(Boolean);
                output[customKey].push(migrated);
            }
        }
    };
    distribute(source.relationships, 'relationshipStates', 'legacy_relationship');
    distribute(source.skills, 'abilityStates', 'legacy_skill');
    if (Array.isArray(source.focus) && customKey in output) {
        for (const row of source.focus) {
            if (row?.source === 'manual' || row?.locked)
                output[customKey].push(pendingCustom(row, 'legacy_focus_note'));
        }
    }
    return output;
}

}
};
__defs["index.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"onActivate",{enumerable:true,configurable:true,get:()=>__require("bootstrap/app.js")["onActivate"]});
Object.defineProperty(__scope,"onInstall",{enumerable:true,configurable:true,get:()=>__require("bootstrap/app.js")["onInstall"]});
Object.defineProperty(__scope,"onUpdate",{enumerable:true,configurable:true,get:()=>__require("bootstrap/app.js")["onUpdate"]});
Object.defineProperty(__scope,"onEnable",{enumerable:true,configurable:true,get:()=>__require("bootstrap/app.js")["onEnable"]});
Object.defineProperty(__scope,"onDisable",{enumerable:true,configurable:true,get:()=>__require("bootstrap/app.js")["onDisable"]});
Object.defineProperty(__scope,"onClean",{enumerable:true,configurable:true,get:()=>__require("bootstrap/app.js")["onClean"]});
Object.defineProperty(__scope,"onDelete",{enumerable:true,configurable:true,get:()=>__require("bootstrap/app.js")["onDelete"]});
with(__scope){
Object.defineProperty(exports,"onActivate",{enumerable:true,configurable:true,get:()=>onActivate});
Object.defineProperty(exports,"onInstall",{enumerable:true,configurable:true,get:()=>onInstall});
Object.defineProperty(exports,"onUpdate",{enumerable:true,configurable:true,get:()=>onUpdate});
Object.defineProperty(exports,"onEnable",{enumerable:true,configurable:true,get:()=>onEnable});
Object.defineProperty(exports,"onDisable",{enumerable:true,configurable:true,get:()=>onDisable});
Object.defineProperty(exports,"onClean",{enumerable:true,configurable:true,get:()=>onClean});
Object.defineProperty(exports,"onDelete",{enumerable:true,configurable:true,get:()=>onDelete});

}
};
__defs["llm/generator.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"getContext",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getContext"]});
Object.defineProperty(__scope,"getSettings",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getSettings"]});
Object.defineProperty(__scope,"beginModelRequest",{enumerable:true,configurable:true,get:()=>__require("core/requests.js")["beginModelRequest"]});
Object.defineProperty(__scope,"finishModelRequest",{enumerable:true,configurable:true,get:()=>__require("core/requests.js")["finishModelRequest"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"toErrorMessage",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["toErrorMessage"]});
Object.defineProperty(__scope,"withTimeout",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["withTimeout"]});
Object.defineProperty(__scope,"requestScheduler",{enumerable:true,configurable:true,get:()=>__require("llm/request-scheduler.js")["requestScheduler"]});
with(__scope){
Object.defineProperty(exports,"generateTask",{enumerable:true,configurable:true,get:()=>generateTask});
Object.defineProperty(exports,"testConnection",{enumerable:true,configurable:true,get:()=>testConnection});
Object.defineProperty(exports,"listSupportedConnectionProfiles",{enumerable:true,configurable:true,get:()=>listSupportedConnectionProfiles});
Object.defineProperty(exports,"describeTaskConnection",{enumerable:true,configurable:true,get:()=>describeTaskConnection});
Object.defineProperty(exports,"requestTraceReport",{enumerable:true,configurable:true,get:()=>requestTraceReport});
/**
 * 模块职责：通过 SillyTavern 当前连接或 Connection Profile 发起模型请求。
 * 维护边界：插件不保存密钥、不切换全局 Profile；同物理连接的业务请求串行，
 * 只读诊断使用独立且同样受限的诊断通道，不参与数据提交。
 */
const TASK_RESPONSE_TOKENS = {
    audit: 1800,
    revision: 4096,
    state: 4096,
    smallSummary: 2400,
    largeSummary: 3200,
};
function responseTokens(options) {
    const requested = Number(options.maxTokens);
    if (Number.isFinite(requested) && requested > 0) {
        return Math.max(128, Math.min(32768, Math.round(requested)));
    }
    return TASK_RESPONSE_TOKENS[options.task];
}
function textFromValue(value) {
    if (typeof value === 'string')
        return value.trim();
    if (!value || typeof value !== 'object')
        return '';
    const source = value;
    for (const key of ['text', 'output_text', 'content', 'value']) {
        const nested = source[key];
        if (typeof nested === 'string' && nested.trim())
            return nested.trim();
        if (Array.isArray(nested)) {
            const text = textFromContentParts(nested);
            if (text)
                return text;
        }
    }
    return '';
}
function textFromContentParts(value) {
    if (!Array.isArray(value))
        return '';
    const parts = [];
    for (const item of value) {
        if (typeof item === 'string') {
            if (item.trim())
                parts.push(item.trim());
            continue;
        }
        if (!item || typeof item !== 'object')
            continue;
        const source = item;
        const text = typeof source.text === 'string'
            ? source.text.trim()
            : typeof source.output_text === 'string'
                ? source.output_text.trim()
                : '';
        if (text)
            parts.push(text);
        const args = source.functionCall?.args ?? source.function_call?.arguments ?? source.input;
        if (typeof args === 'string' && args.trim())
            parts.push(args.trim());
    }
    return parts.filter(Boolean).join('\n').trim();
}
function generationText(result) {
    if (typeof result === 'string')
        return result.trim();
    if (!result || typeof result !== 'object')
        return '';
    for (const value of [result.output_text, result.content, result.text, result.result, result.value, result.pipe]) {
        if (Array.isArray(value)) {
            const text = textFromContentParts(value);
            if (text)
                return text;
            continue;
        }
        const text = textFromValue(value);
        if (text)
            return text;
    }
    const messageContent = result?.message?.content ?? result?.choices?.[0]?.message?.content;
    if (Array.isArray(messageContent)) {
        const text = textFromContentParts(messageContent);
        if (text)
            return text;
    }
    else {
        const text = textFromValue(messageContent);
        if (text)
            return text;
    }
    for (const value of [
        result?.choices?.[0]?.text,
        result?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments,
        result?.choices?.[0]?.message?.function_call?.arguments,
    ]) {
        const text = textFromValue(value);
        if (text)
            return text;
    }
    const candidateParts = result?.candidates?.[0]?.content?.parts;
    const candidateText = textFromContentParts(candidateParts);
    if (candidateText)
        return candidateText;
    if (Array.isArray(result.output)) {
        for (const item of result.output) {
            const outputText = textFromContentParts(item?.content);
            if (outputText)
                return outputText;
            const input = item?.input ?? item?.arguments;
            const inputText = textFromValue(input);
            if (inputText)
                return inputText;
        }
    }
    else {
        const outputText = textFromValue(result.output);
        if (outputText)
            return outputText;
    }
    const hasEnvelope = [
        'content', 'text', 'output', 'output_text', 'result', 'value', 'pipe', 'message', 'choices',
        'candidates', 'error', 'refusal', 'status', 'incomplete_details', 'promptFeedback',
    ].some((key) => key in result);
    return hasEnvelope ? '' : textFromValue(result);
}
function generationFailureDetail(result) {
    if (!result || typeof result !== 'object')
        return '';
    const error = result.error;
    const errorText = typeof error === 'string'
        ? error
        : typeof error?.message === 'string'
            ? error.message
            : typeof error?.error?.message === 'string'
                ? error.error.message
                : '';
    if (errorText.trim())
        return safeText(errorText, 500).trim();
    const refusal = result.refusal
        ?? result?.message?.refusal
        ?? result?.choices?.[0]?.message?.refusal;
    if (typeof refusal === 'string' && refusal.trim())
        return `模型拒绝返回内容：${safeText(refusal, 300).trim()}`;
    const incompleteReason = result?.incomplete_details?.reason;
    if (typeof incompleteReason === 'string' && incompleteReason.trim()) {
        return `模型响应未完成：${safeText(incompleteReason, 160).trim()}`;
    }
    const finishReason = result?.choices?.[0]?.finish_reason
        ?? result?.stop_reason
        ?? result?.candidates?.[0]?.finishReason
        ?? result?.candidates?.[0]?.finish_reason;
    if (typeof finishReason === 'string' && finishReason.trim()) {
        return `No message generated（终止原因：${safeText(finishReason, 160).trim()}）`;
    }
    const blockReason = result?.promptFeedback?.blockReason ?? result?.prompt_feedback?.block_reason;
    if (typeof blockReason === 'string' && blockReason.trim()) {
        return `模型请求被拦截：${safeText(blockReason, 160).trim()}`;
    }
    return '';
}
function emptyGenerationError(label, result) {
    const detail = generationFailureDetail(result);
    return new Error(detail || `${label}返回为空（No message generated）`);
}
function cleanProfileName(value) {
    return safeText(value, 160).replace(/["|\r\n]/g, '').trim();
}
function connectionManagerStore() {
    const context = getContext();
    const store = context.extensionSettings?.connectionManager;
    if (!store || !Array.isArray(store.profiles))
        return null;
    return store;
}
function supportedProfiles() {
    const context = getContext();
    const service = context.ConnectionManagerRequestService;
    if (typeof service?.getSupportedProfiles === 'function') {
        // BUGFIX: 服务明确报错（例如 Connection Manager 已禁用）时必须向上抛出；
        // 若退回原始列表，UI 会显示实际不可调用的 Profile，测试时才出现 API 失败。
        return service.getSupportedProfiles();
    }
    // 仅兼容尚未导出服务方法的旧版 SillyTavern。
    return connectionManagerStore()?.profiles ?? [];
}
function resolveProfileId(connection) {
    const profiles = supportedProfiles();
    if (connection.profileId && profiles.some((profile) => profile?.id === connection.profileId))
        return connection.profileId;
    const legacyName = cleanProfileName(connection.profile);
    const match = profiles.find((profile) => cleanProfileName(profile?.name) === legacyName);
    if (match?.id) {
        connection.profileId = String(match.id);
        return String(match.id);
    }
    return '';
}
function messagesFromOptions(options) {
    const messages = [];
    if (options.systemPrompt.trim())
        messages.push({ role: 'system', content: options.systemPrompt });
    if (Array.isArray(options.prompt)) {
        for (const item of options.prompt) {
            const role = safeText(item?.role, 30).trim() || 'user';
            const content = safeText(item?.content, 200000);
            if (content.trim())
                messages.push({ role, content });
        }
    }
    else {
        messages.push({ role: 'user', content: options.prompt });
    }
    return messages;
}
async function generateCurrent(options, controller) {
    const context = getContext();
    if (typeof context.generateRaw !== 'function')
        throw new Error('当前SillyTavern未提供generateRaw');
    const settings = getSettings();
    const result = await withTimeout(Promise.resolve(context.generateRaw({
        systemPrompt: options.systemPrompt,
        prompt: options.prompt,
        responseLength: responseTokens(options),
        signal: options.signal,
    })), Math.max(10000, Number(settings.requestTimeoutMs) || 90000), `${options.task}模型调用`, controller);
    const text = generationText(result);
    if (!text)
        throw emptyGenerationError(`${options.task}模型`, result);
    return text;
}
function normalizeProfileTransportError(error, label) {
    const message = toErrorMessage(error);
    if (/unexpected token\s*["']?<|<html|<!doctype|not valid json/i.test(message)) {
        return new Error(`${label}上游返回了HTML错误页而不是模型JSON。通常是反向代理、网关超时、接口路径错误或登录页拦截；请查看请求诊断中的HTTP状态。`, { cause: error });
    }
    return error instanceof Error ? error : new Error(message || `${label}请求失败`);
}
async function consumeProfileStream(streamResult, label) {
    if (typeof streamResult !== 'function') {
        const directText = generationText(streamResult);
        if (!directText)
            throw emptyGenerationError(label, streamResult);
        return directText;
    }
    const iterable = streamResult();
    if (!iterable || typeof iterable[Symbol.asyncIterator] !== 'function')
        throw new Error(`${label}没有返回可读取的流`);
    let latestText = '';
    for await (const chunk of iterable) {
        const chunkText = generationText(chunk);
        if (chunkText)
            latestText = chunkText;
    }
    if (!latestText)
        throw emptyGenerationError(label, null);
    return latestText;
}
async function generateWithNativeProfile(options, profileId, controller) {
    const context = getContext();
    const service = context.ConnectionManagerRequestService;
    if (typeof service?.sendRequest !== 'function') {
        throw new Error('当前SillyTavern未提供ConnectionManagerRequestService');
    }
    const settings = getSettings();
    const messages = messagesFromOptions(options);
    const label = `${options.task} Connection Profile`;
    const request = (async () => {
        try {
            // SillyTavern 的非流式路径会在检查 HTTP 状态前直接 response.json()。
            // 使用流式路径可先检查 4xx/5xx，并持续产生数据，避免长请求被网关误判为空闲。
            const streamResult = await service.sendRequest(profileId, messages, responseTokens(options), {
                stream: true,
                extractData: true,
                // BUGFIX：独立 Profile 必须使用其自己的生成预设与文本补全 instruct。
                // 强制关闭会退回当前聊天的全局采样参数，并把 Text Completion 消息降级为裸文本拼接。
                includePreset: true,
                includeInstruct: true,
                signal: options.signal,
            }, { stream: true });
            return await consumeProfileStream(streamResult, label);
        }
        catch (error) {
            throw normalizeProfileTransportError(error, label);
        }
    })();
    return await withTimeout(request, Math.max(10000, Number(settings.requestTimeoutMs) || 90000), `${label}请求`, controller);
}
function listSupportedConnectionProfiles() {
    return supportedProfiles()
        .map((profile) => ({
        id: safeText(profile?.id, 160),
        name: cleanProfileName(profile?.name) || '未命名配置',
        api: safeText(profile?.api, 80),
        model: safeText(profile?.model, 240),
    }))
        .filter((profile) => profile.id);
}
function describeTaskConnection(task) {
    const connection = getSettings().connections[task];
    if (connection?.mode === 'profile') {
        const id = resolveProfileId(connection);
        const profile = listSupportedConnectionProfiles().find((item) => item.id === id);
        return `Connection Profile：${profile?.name || cleanProfileName(connection.profile) || '未选择'}`;
    }
    return '当前聊天连接';
}
/**
 * 所有业务模型调用的统一入口。连接解析、lane 排队、超时与活动请求登记都在此收口。
 */
async function generateTask(options) {
    const requestClass = options.requestClass === 'diagnostic' ? 'diagnostic' : 'business';
    const controller = beginModelRequest({ task: options.task, requestClass });
    const externalSignal = options.signal;
    const forwardAbort = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted)
        forwardAbort();
    else
        externalSignal?.addEventListener('abort', forwardAbort, { once: true });
    try {
        const request = { ...options, signal: controller.signal };
        const connection = getSettings().connections[options.task];
        const profileId = connection?.mode === 'profile' ? resolveProfileId(connection) : '';
        const connectionLane = connection?.mode === 'profile'
            ? `profile:${profileId || 'unselected'}`
            : 'current-chat';
        const promptChars = Array.isArray(options.prompt)
            ? options.prompt.reduce((sum, item) => sum + safeText(item?.content, 200000).length, 0)
            : safeText(options.prompt, 200000).length;
        const tokenLimit = responseTokens(options);
        return await requestScheduler.run(connectionLane, requestClass, options.task, controller.signal, async () => {
            if (connection?.mode === 'profile') {
                if (!profileId)
                    throw new Error(`${options.task}未选择有效的Connection Profile`);
                return generateWithNativeProfile(request, profileId, controller);
            }
            return generateCurrent(request, controller);
        }, {
            requestPurpose: options.requestPurpose || 'plain',
            requestOrigin: options.requestOrigin ? safeText(options.requestOrigin, 80) : undefined,
            systemPromptChars: options.systemPrompt.length,
            promptChars,
            responseTokens: tokenLimit,
            protocol: options.requestPurpose === 'fixed-text' || options.requestPurpose === 'connection-test' ? 'fixed-text' : 'plain-text',
            streamMode: connection?.mode === 'profile' ? 'on' : 'off',
        });
    }
    finally {
        externalSignal?.removeEventListener('abort', forwardAbort);
        finishModelRequest(controller);
    }
}
function requestTraceReport() {
    return requestScheduler.list();
}
async function testConnection(task) {
    const started = performance.now();
    const raw = await generateTask({
        task,
        systemPrompt: '你是镜渊固定文本协议测试器。禁止JSON、Markdown、解释和思考标签。',
        prompt: '<MA_PING>\nstatus=ok\nsource=mirror-abyss\n</MA_PING>',
        maxTokens: 128,
        requestClass: 'diagnostic',
        requestOrigin: 'connection-test',
        requestPurpose: 'connection-test',
    });
    const normalized = raw.replace(/\r/g, '').trim();
    const instructionFollowed = /<MA_PING>\s*status\s*[=＝:：]\s*ok\s*source\s*[=＝:：]\s*mirror-abyss\s*<\/MA_PING>/i.test(normalized);
    return {
        connected: Boolean(normalized),
        instructionFollowed,
        protocolValid: instructionFollowed,
        method: describeTaskConnection(task),
        elapsedMs: Math.round(performance.now() - started),
        responsePreview: normalized.replace(/\s+/g, ' ').slice(0, 240),
        responseFormat: 'fixed-text',
        protocolDetail: '所有模型任务均使用固定文本或正文文本，不发送JSON Schema',
    };
}

}
};
__defs["llm/request-scheduler.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"makeId",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["makeId"]});
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
Object.defineProperty(__scope,"toErrorMessage",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["toErrorMessage"]});
with(__scope){
Object.defineProperty(exports,"RequestLaneScheduler",{enumerable:true,configurable:true,get:()=>RequestLaneScheduler});
Object.defineProperty(exports,"requestScheduler",{enumerable:true,configurable:true,get:()=>requestScheduler});
const REQUEST_PRIORITIES = {
    audit: 100,
    revision: 100,
    state: 90,
    smallSummary: 30,
    largeSummary: 10,
};
function abortError(message = '模型请求已取消') {
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
}
function requestErrorMetadata(error) {
    const message = toErrorMessage(error);
    const statusMatch = message.match(/(?:http|status|code)?\s*[:=]?\s*([45]\d{2})\b/i);
    const httpStatus = statusMatch ? Number(statusMatch[1]) : undefined;
    if ((error instanceof Error && error.name === 'AbortError')
        || /\b(?:cancelled|canceled|aborted)\b|stop event|已取消|被取消|已中止/i.test(message))
        return { errorKind: 'cancelled', httpStatus };
    if (/no message generated|返回为空|空内容/i.test(message))
        return { errorKind: 'empty', httpStatus };
    if (httpStatus === 401 || httpStatus === 403 || /unauthori[sz]ed|forbidden|api key/i.test(message))
        return { errorKind: 'auth', httpStatus };
    if (httpStatus === 429 || /rate.?limit|too many requests/i.test(message))
        return { errorKind: 'rate_limit', httpStatus };
    if ((httpStatus !== undefined && httpStatus >= 500) || /gateway|upstream|bad gateway|service unavailable|HTML错误页|not valid json|unexpected token\s*[\"']?</i.test(message))
        return { errorKind: 'upstream', httpStatus };
    if (/timeout|timed out|超时/i.test(message))
        return { errorKind: 'timeout', httpStatus };
    if (httpStatus === 400 || /bad request|invalid schema|invalid request/i.test(message))
        return { errorKind: 'request', httpStatus };
    return { errorKind: 'unknown', httpStatus };
}
/**
 * 每个显式 lane 保持单请求；不同 lane 可独立运行。
 * 调用方必须把 lane 组成定义为“物理连接 + 调度类别”，从而把业务链与只读诊断隔离。
 * pending 按优先级选取，已经 running 的请求不会被新任务强行中断。
 */
class RequestLaneScheduler {
    static MAX_TRACES = 200;
    lanes = new Map();
    traces = new Map();
    sequence = 0;
    list() {
        return [...this.traces.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }
    clearHistory() {
        for (const [id, trace] of this.traces) {
            if (!['queued', 'running'].includes(String(trace.state)))
                this.traces.delete(id);
        }
    }
    prune() {
        while (this.traces.size > RequestLaneScheduler.MAX_TRACES) {
            const removable = [...this.traces.entries()].find(([, trace]) => !['queued', 'running'].includes(String(trace.state)));
            if (!removable)
                break;
            this.traces.delete(removable[0]);
        }
    }
    lane(name) {
        let state = this.lanes.get(name);
        if (!state) {
            state = { active: null, pending: [] };
            this.lanes.set(name, state);
        }
        return state;
    }
    selectNext(state) {
        if (!state.pending.length)
            return null;
        let selectedIndex = 0;
        for (let index = 1; index < state.pending.length; index += 1) {
            const candidate = state.pending[index];
            const selected = state.pending[selectedIndex];
            if (candidate.priority > selected.priority || (candidate.priority === selected.priority && candidate.sequence < selected.sequence))
                selectedIndex = index;
        }
        return state.pending.splice(selectedIndex, 1)[0] ?? null;
    }
    pump(laneName) {
        const state = this.lane(laneName);
        if (state.active)
            return;
        const job = this.selectNext(state);
        if (!job) {
            if (!state.pending.length)
                this.lanes.delete(laneName);
            return;
        }
        if (job.signal.aborted) {
            job.signal.removeEventListener('abort', job.abortListener);
            job.trace.state = 'cancelled';
            job.trace.error = '模型请求已取消';
            job.trace.errorKind = 'cancelled';
            job.trace.finishedAt = nowIso();
            job.trace.transportWaitMs = Math.max(0, Date.now() - job.createdMs);
            job.trace.totalMs = job.trace.transportWaitMs;
            job.reject(abortError());
            this.prune();
            this.pump(laneName);
            return;
        }
        state.active = job;
        const startedMs = Date.now();
        job.trace.state = 'running';
        job.trace.startedAt = nowIso();
        job.trace.transportWaitMs = Math.max(0, startedMs - job.createdMs);
        // 与成熟 Promise 队列一致：执行函数即使同步 throw，也必须进入任务 Promise 的失败路径，
        // 不能让 run() 直接抛出并把 lane 永久留在 active。
        void Promise.resolve()
            .then(async () => {
            if (job.signal.aborted)
                throw abortError();
            const result = await job.work();
            if (job.signal.aborted)
                throw abortError();
            return result;
        })
            .then((result) => {
            job.trace.state = 'success';
            job.resolve(result);
        })
            .catch((error) => {
            const metadata = requestErrorMetadata(error);
            job.trace.state = metadata.errorKind === 'cancelled' ? 'cancelled' : 'failed';
            job.trace.error = toErrorMessage(error);
            job.trace.errorKind = metadata.errorKind;
            job.trace.httpStatus = metadata.httpStatus;
            job.reject(error);
        })
            .finally(() => {
            const finishedMs = Date.now();
            job.signal.removeEventListener('abort', job.abortListener);
            job.trace.finishedAt = nowIso();
            job.trace.requestMs = Math.max(0, finishedMs - startedMs);
            job.trace.totalMs = Math.max(0, finishedMs - job.createdMs);
            state.active = null;
            this.prune();
            this.pump(laneName);
        });
    }
    run(connectionLane, requestClass, task, signal, work, metadata = {}) {
        if (signal.aborted)
            return Promise.reject(abortError());
        const laneName = `${connectionLane}:${requestClass}`;
        const createdMs = Date.now();
        const id = makeId('request');
        const trace = {
            ...metadata,
            id,
            lane: laneName,
            connectionLane,
            requestClass,
            task,
            state: 'queued',
            createdAt: nowIso(),
            transportWaitMs: 0,
            requestMs: 0,
            totalMs: 0,
            firstByteMs: undefined,
            streamMode: metadata.streamMode === 'on' ? 'on' : 'off',
        };
        this.traces.set(id, trace);
        let resolve;
        let reject;
        const promise = new Promise((resolveValue, rejectValue) => {
            resolve = resolveValue;
            reject = rejectValue;
        });
        const state = this.lane(laneName);
        const job = {
            id,
            lane: laneName,
            task,
            priority: REQUEST_PRIORITIES[task],
            sequence: this.sequence += 1,
            createdMs,
            signal,
            work,
            resolve,
            reject,
            trace,
            abortListener: () => {
                if (state.active === job)
                    return;
                const index = state.pending.indexOf(job);
                if (index < 0)
                    return;
                state.pending.splice(index, 1);
                trace.state = 'cancelled';
                trace.error = '模型请求已取消';
                trace.errorKind = 'cancelled';
                trace.finishedAt = nowIso();
                trace.transportWaitMs = Math.max(0, Date.now() - createdMs);
                trace.totalMs = trace.transportWaitMs;
                signal.removeEventListener('abort', job.abortListener);
                reject(abortError());
                this.prune();
                this.pump(laneName);
            },
        };
        signal.addEventListener('abort', job.abortListener, { once: true });
        state.pending.push(job);
        this.prune();
        this.pump(laneName);
        return promise;
    }
}
const requestScheduler = new RequestLaneScheduler();

}
};
__defs["pipeline/audit.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"getSettings",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getSettings"]});
Object.defineProperty(__scope,"toast",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["toast"]});
Object.defineProperty(__scope,"assertArtifactCommitCurrent",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["assertArtifactCommitCurrent"]});
Object.defineProperty(__scope,"hashText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["hashText"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"toErrorMessage",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["toErrorMessage"]});
Object.defineProperty(__scope,"markStage",{enumerable:true,configurable:true,get:()=>__require("domain/artifact.js")["markStage"]});
Object.defineProperty(__scope,"describeTaskConnection",{enumerable:true,configurable:true,get:()=>__require("llm/generator.js")["describeTaskConnection"]});
Object.defineProperty(__scope,"generateTask",{enumerable:true,configurable:true,get:()=>__require("llm/generator.js")["generateTask"]});
Object.defineProperty(__scope,"auditSystemPrompt",{enumerable:true,configurable:true,get:()=>__require("prompts/audit.js")["auditSystemPrompt"]});
Object.defineProperty(__scope,"auditUserPrompt",{enumerable:true,configurable:true,get:()=>__require("prompts/audit.js")["auditUserPrompt"]});
Object.defineProperty(__scope,"putArtifact",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["putArtifact"]});
Object.defineProperty(__scope,"parseAuditTextOutput",{enumerable:true,configurable:true,get:()=>__require("domain/audit-text.js")["parseAuditTextOutput"]});
Object.defineProperty(__scope,"resolveHostControl",{enumerable:true,configurable:true,get:()=>__require("domain/host-control.js")["resolveHostControl"]});
with(__scope){
Object.defineProperty(exports,"auditText",{enumerable:true,configurable:true,get:()=>auditText});
Object.defineProperty(exports,"applyAuditFailureAction",{enumerable:true,configurable:true,get:()=>applyAuditFailureAction});
Object.defineProperty(exports,"runAudit",{enumerable:true,configurable:true,get:()=>runAudit});
Object.defineProperty(exports,"parseAuditResult",{enumerable:true,configurable:true,get:()=>parseAuditResult});
Object.defineProperty(exports,"findMessageElement",{enumerable:true,configurable:true,get:()=>findMessageElement});
Object.defineProperty(exports,"applyAuditVisibility",{enumerable:true,configurable:true,get:()=>applyAuditVisibility});
/**
 * 模块职责：解析和执行规则审核，并应用标记、隐藏或进入修正的结果。
 * 维护边界：技术故障与内容违规必须分开；缺少合法 result 的对象不能默认判为违规。
 */
/** 审核模型只返回固定文本；插件负责转换为内部对象。 */
function parseAuditResult(raw) {
    return parseAuditTextOutput(raw);
}
function findMessageElement(index) {
    return document.querySelector(`.mes[mesid="${index}"], .mes[data-message-id="${index}"], #chat .mes:nth-of-type(${index + 1})`);
}
function applyAuditVisibility(index, hidden, marked = false) {
    const element = findMessageElement(index);
    element?.classList.toggle('ma11-audit-hidden-message', hidden);
    element?.classList.toggle('ma11-audit-marked-message', !hidden && marked);
}
function isCancelledAuditRequest(error) {
    return error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name);
}
async function auditText(playerRules, playerText, assistantText) {
    const raw = await generateTask({
        task: 'audit',
        systemPrompt: auditSystemPrompt(),
        prompt: auditUserPrompt(playerRules, playerText, assistantText),
        requestPurpose: 'fixed-text',
    });
    try {
        return parseAuditResult(raw);
    }
    catch (error) {
        const preview = safeText(raw, 1200).replace(/\s+/g, ' ').trim();
        throw new Error(`规则审核未返回有效固定文本（${describeTaskConnection('audit')}）。${toErrorMessage(error)}${preview ? `；返回片段：${preview}` : ''}`, { cause: error });
    }
}
async function applyAuditFailureAction(artifact, action) {
    if (action === 'mark') {
        artifact.hiddenByAudit = false;
        applyAuditVisibility(artifact.messageIndex, false, true);
        return;
    }
    if (action === 'hide') {
        artifact.hiddenByAudit = true;
        applyAuditVisibility(artifact.messageIndex, true);
        return;
    }
    artifact.hiddenByAudit = true;
    applyAuditVisibility(artifact.messageIndex, true);
    toast('warning', '审核未通过；插件不会自动删除酒馆消息，已隐藏并保留人工处理入口');
}
function alignRevisionStageWithAudit(artifact, result) {
    const settings = getSettings();
    const currentRevision = artifact.revision;
    const committedRevision = Boolean(currentRevision?.status === 'success'
        && currentRevision.finalFingerprint
        && currentRevision.finalFingerprint === artifact.sourceFingerprint);
    if (result.passed) {
        // 修正成功后的复审属于修正阶段的一部分，不能在后续恢复时把“修正成功”覆盖成“跳过”。
        if (!committedRevision)
            markStage(artifact, 'revision', 'skipped');
        return;
    }
    if (result.decision === 'block') {
        markStage(artifact, 'revision', 'blocked', result.reason || '审核判定无法局部修正');
        return;
    }
    if (settings.auditFailAction === 'revise') {
        // 失败审核本身是可恢复检查点。即使旧数据把 revision 留在 skipped，
        // 也必须恢复成待执行，避免“从失败位置继续”时直接越过修正。
        if (artifact.stages.revision.status !== 'running' && !committedRevision) {
            markStage(artifact, 'revision', 'idle');
        }
        return;
    }
    markStage(artifact, 'revision', 'skipped', '当前审核失败处理未启用自动修正');
}
/**
 * 审核只决定当前正文是否通过以及后续是否需要修正；技术异常由调用方按失败状态处理。
 * 已完成且仍对应当前正文/规则的失败审核也必须复用：它是“审核 → 修正”之间的正式检查点。
 */
async function runAudit(artifact, force = false) {
    const settings = getSettings();
    artifact.stages.revision ||= { status: 'idle', attempts: 0 };
    if (!resolveHostControl(settings).audit) {
        markStage(artifact, 'audit', 'skipped');
        markStage(artifact, 'revision', 'skipped');
        artifact.hiddenByAudit = false;
        applyAuditVisibility(artifact.messageIndex, false, false);
        artifact.audit = {
            passed: true,
            decision: 'pass',
            reason: '未启用规则审核',
            violations: [],
            preserve: [],
            rewriteInstruction: '',
            violationFingerprint: '',
        };
        await putArtifact(artifact);
        return artifact.audit;
    }
    if (!settings.auditPrompt.trim())
        throw new Error('已启用规则审核，但审核提示词为空');
    const ruleFingerprint = hashText(`${settings.auditPrompt}\n${settings.auditFailAction}\n${settings.maxRevisionAttempts}`);
    const cachedAudit = artifact.audit;
    const cachedRuleMatches = !artifact.auditRuleFingerprint || artifact.auditRuleFingerprint === ruleFingerprint;
    const cachedSourceMatches = !artifact.auditSourceFingerprint || artifact.auditSourceFingerprint === artifact.sourceFingerprint;
    const cachedTerminalMatches = Boolean(cachedAudit
        && ((cachedAudit.passed && artifact.stages.audit.status === 'success' && artifact.approvedFingerprint === artifact.sourceFingerprint)
            || (!cachedAudit.passed && artifact.stages.audit.status === 'blocked')));
    if (!force && cachedTerminalMatches && cachedRuleMatches && cachedSourceMatches && cachedAudit) {
        artifact.auditRuleFingerprint = ruleFingerprint;
        artifact.auditSourceFingerprint = artifact.sourceFingerprint;
        alignRevisionStageWithAudit(artifact, cachedAudit);
        return cachedAudit;
    }
    markStage(artifact, 'audit', 'running');
    await putArtifact(artifact);
    try {
        const result = await auditText(settings.auditPrompt, artifact.playerText, artifact.assistantText);
        assertArtifactCommitCurrent(artifact);
        artifact.audit = result;
        artifact.auditRuleFingerprint = ruleFingerprint;
        artifact.auditSourceFingerprint = artifact.sourceFingerprint;
        if (result.passed) {
            artifact.approvedFingerprint = artifact.sourceFingerprint;
            artifact.hiddenByAudit = false;
            applyAuditVisibility(artifact.messageIndex, false, false);
            markStage(artifact, 'audit', 'success');
        }
        else {
            artifact.approvedFingerprint = undefined;
            markStage(artifact, 'audit', 'blocked', result.reason);
        }
        alignRevisionStageWithAudit(artifact, result);
        // 审核阶段只更新内存 artifact；业务编排器负责在明确检查点统一保存。
        // 避免审核函数与主链紧邻地重复保存同一条聊天。
        await putArtifact(artifact);
        return result;
    }
    catch (error) {
        if (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name)) {
            markStage(artifact, 'audit', 'cancelled', toErrorMessage(error));
            await putArtifact(artifact);
            throw error;
        }
        markStage(artifact, 'audit', 'failed', toErrorMessage(error));
        await putArtifact(artifact);
        throw error;
    }
}

}
};
__defs["pipeline/lorebook.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"VERSION",{enumerable:true,configurable:true,get:()=>__require("constants.js")["VERSION"]});
Object.defineProperty(__scope,"assertArtifactCommitCurrent",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["assertArtifactCommitCurrent"]});
Object.defineProperty(__scope,"assertChatCommitCurrent",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["assertChatCommitCurrent"]});
Object.defineProperty(__scope,"persistMetadataFor",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["persistMetadataFor"]});
Object.defineProperty(__scope,"currentChatKey",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["currentChatKey"]});
Object.defineProperty(__scope,"getChatMetadataNamespace",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getChatMetadataNamespace"]});
Object.defineProperty(__scope,"getContext",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getContext"]});
Object.defineProperty(__scope,"getSettings",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getSettings"]});
Object.defineProperty(__scope,"hashText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["hashText"]});
Object.defineProperty(__scope,"sanitizeBookName",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["sanitizeBookName"]});
Object.defineProperty(__scope,"toErrorMessage",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["toErrorMessage"]});
Object.defineProperty(__scope,"markStage",{enumerable:true,configurable:true,get:()=>__require("domain/artifact.js")["markStage"]});
Object.defineProperty(__scope,"getChatState",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["getChatState"]});
Object.defineProperty(__scope,"putArtifact",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["putArtifact"]});
Object.defineProperty(__scope,"putChatState",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["putChatState"]});
Object.defineProperty(__scope,"TaskBlockedError",{enumerable:true,configurable:true,get:()=>__require("pipeline/task-queue.js")["TaskBlockedError"]});
Object.defineProperty(__scope,"buildLorebookDocuments",{enumerable:true,configurable:true,get:()=>__require("domain/lorebook-publish.js")["buildLorebookDocuments"]});
Object.defineProperty(__scope,"resolveHostControl",{enumerable:true,configurable:true,get:()=>__require("domain/host-control.js")["resolveHostControl"]});
Object.defineProperty(__scope,"readHistoryWorkflow",{enumerable:true,configurable:true,get:()=>__require("workflow/history-workflow.js")["readHistoryWorkflow"]});
Object.defineProperty(__scope,"applyLorebookSuppressions",{enumerable:true,configurable:true,get:()=>__require("domain/publication-control.js")["applyLorebookSuppressions"]});
Object.defineProperty(__scope,"detectPlayerDeletedLorebookEntries",{enumerable:true,configurable:true,get:()=>__require("domain/publication-control.js")["detectPlayerDeletedLorebookEntries"]});
Object.defineProperty(__scope,"restoreLorebookSuppression",{enumerable:true,configurable:true,get:()=>__require("domain/publication-control.js")["restoreLorebookSuppression"]});
Object.defineProperty(__scope,"updateLorebookPublicationLedger",{enumerable:true,configurable:true,get:()=>__require("domain/publication-control.js")["updateLorebookPublicationLedger"]});
with(__scope){
Object.defineProperty(exports,"reloadWorldInfoEditor",{enumerable:true,configurable:true,get:()=>reloadWorldInfoEditor});
Object.defineProperty(exports,"syncLorebook",{enumerable:true,configurable:true,get:()=>syncLorebook});
Object.defineProperty(exports,"previewLorebookMaintenance",{enumerable:true,configurable:true,get:()=>previewLorebookMaintenance});
Object.defineProperty(exports,"applyLorebookMaintenance",{enumerable:true,configurable:true,get:()=>applyLorebookMaintenance});
Object.defineProperty(exports,"restoreSuppressedLorebookEntry",{enumerable:true,configurable:true,get:()=>restoreSuppressedLorebookEntry});
Object.defineProperty(exports,"clearCurrentChatLorebookEntries",{enumerable:true,configurable:true,get:()=>clearCurrentChatLorebookEntries});
Object.defineProperty(exports,"pauseCurrentChatLorebookEntries",{enumerable:true,configurable:true,get:()=>pauseCurrentChatLorebookEntries});
Object.defineProperty(exports,"resetLorebookRuntime",{enumerable:true,configurable:true,get:()=>resetLorebookRuntime});
Object.defineProperty(exports,"setLorebookWorldInfoApiForTests",{enumerable:true,configurable:true,get:()=>setLorebookWorldInfoApiForTests});
Object.defineProperty(exports,"mirrorAbyssManagedNameIdentity",{enumerable:true,configurable:true,get:()=>mirrorAbyssManagedNameIdentity});
Object.defineProperty(exports,"isMirrorAbyssGeneratedEntry",{enumerable:true,configurable:true,get:()=>isMirrorAbyssGeneratedEntry});
Object.defineProperty(exports,"mirrorAbyssExactIdentity",{enumerable:true,configurable:true,get:()=>mirrorAbyssExactIdentity});
Object.defineProperty(exports,"triggerKeys",{enumerable:true,configurable:true,get:()=>triggerKeys});
Object.defineProperty(exports,"normalizeDesiredLorebookSpecs",{enumerable:true,configurable:true,get:()=>normalizeDesiredLorebookSpecs});
Object.defineProperty(exports,"reconcileLorebookEntries",{enumerable:true,configurable:true,get:()=>reconcileLorebookEntries});
Object.defineProperty(exports,"reconcileLorebookMaintenanceEntries",{enumerable:true,configurable:true,get:()=>reconcileLorebookMaintenanceEntries});
/**
 * 模块职责：解析当前聊天世界书并差异化发布、暂停或清理镜渊条目。
 * 维护边界：普通同步只按当前 chatKey 的 managedKey / logicalKey 匹配；备注、精确签名
 * 与旧 small/large 键只在玩家主动维护时检查，禁止影响人工条目、其他插件或其他聊天。
 */
let worldInfoModulePromise = null;
let worldInfoApiForTests = null;
const lorebookMutationLocks = new Map();
function resetLorebookRuntime() {
    worldInfoModulePromise = null;
    worldInfoApiForTests = null;
    // 正在执行的物理世界书写入不会因插件重启而瞬间停止。清空锁表会让新实例
    // 与旧保存并发写同一本书；保留 Promise 链，待旧写入真正结束后由 finally 自行释放。
}
/** Node 集成测试使用；生产环境未设置时仍只加载 SillyTavern 的 world-info 模块。 */
function setLorebookWorldInfoApiForTests(api) {
    worldInfoApiForTests = api;
    worldInfoModulePromise = null;
}
async function worldInfoApi() {
    if (worldInfoApiForTests)
        return worldInfoApiForTests;
    if (!worldInfoModulePromise) {
        const moduleUrl = '/scripts/world-info.js';
        worldInfoModulePromise = import(/* @vite-ignore */ moduleUrl);
    }
    return worldInfoModulePromise;
}
async function withLorebookMutation(name, action) {
    const lockKey = sanitizeBookName(name);
    if (!lockKey)
        return action();
    const previous = lorebookMutationLocks.get(lockKey) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(action);
    lorebookMutationLocks.set(lockKey, current);
    try {
        return await current;
    }
    finally {
        if (lorebookMutationLocks.get(lockKey) === current)
            lorebookMutationLocks.delete(lockKey);
    }
}
/** 多本物理世界书迁移时按规范化书名固定顺序取锁，避免两个聊天反向迁移形成死锁。 */
async function withLorebookMutations(names, action) {
    const ordered = [...new Set(names.map(sanitizeBookName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const acquire = (index) => index >= ordered.length
        ? action()
        : withLorebookMutation(ordered[index], () => acquire(index + 1));
    return acquire(0);
}
function generatedBookName(chatKey = currentChatKey()) {
    const context = getContext();
    const display = sanitizeBookName(context.name2 || context.name1 || 'Chat') || 'Chat';
    return sanitizeBookName(`MA_${display}_${hashText(chatKey).slice(0, 8)}`);
}
function isDedicatedGeneratedBook(name, chatKey) {
    return !sanitizeBookName(getSettings().lorebookName) && name === generatedBookName(chatKey);
}
function resolveTargetBookName(create, chatKey = currentChatKey()) {
    const settings = getSettings();
    const meta = getChatMetadataNamespace();
    const context = getContext();
    let name = sanitizeBookName(settings.lorebookName || meta.lorebookName || context.chatMetadata?.world_info || '');
    if (!name && create && settings.autoCreateLorebook)
        name = generatedBookName(chatKey);
    return name;
}
async function ensureLorebook(name, chatKey, artifact) {
    const assertCurrent = () => {
        if (artifact)
            assertArtifactCommitCurrent(artifact);
        else
            assertChatCommitCurrent(chatKey);
    };
    assertCurrent();
    const wi = await worldInfoApi();
    assertCurrent();
    let data = await wi.loadWorldInfo(name);
    assertCurrent();
    if (!data && typeof wi.createNewWorldInfo === 'function') {
        assertCurrent();
        await wi.createNewWorldInfo(name, { interactive: false });
        assertCurrent();
        data = await wi.loadWorldInfo(name);
        assertCurrent();
    }
    if (!data) {
        data = { entries: {} };
        assertCurrent();
        await wi.saveWorldInfo(name, data, true);
        assertCurrent();
    }
    const context = getContext();
    const meta = getChatMetadataNamespace();
    assertCurrent();
    context.chatMetadata ||= {};
    context.chatMetadata[wi.METADATA_KEY || 'world_info'] = name;
    meta.lorebookName = name;
    await persistMetadataFor(chatKey);
    assertCurrent();
    refreshChatLorebookIndicator(name);
    return wi;
}
/** 只有带当前模块 managed 元数据的条目才属于镜渊管理范围。 */
function managedInfo(entry) {
    return entry?.extensions?.mirrorAbyssV11 ?? null;
}
function removeManagedEntriesForChat(data, chatKey) {
    if (!data?.entries)
        return 0;
    let removed = 0;
    for (const [uid, entry] of Object.entries(data.entries)) {
        const info = managedInfo(entry);
        if (info?.managed && info.chatKey === chatKey) {
            delete data.entries[uid];
            removed += 1;
        }
    }
    return removed;
}
/**
 * 目标书迁移完成后，只清理旧物理书中明确属于当前 chatKey 的镜渊托管条目。
 * 人工条目、owner 未知条目和其他聊天条目均不进入删除集合。
 */
async function cleanupPreviousLorebook(wi, name, chatKey, artifact) {
    assertArtifactCommitCurrent(artifact);
    const data = await wi.loadWorldInfo(name);
    assertArtifactCommitCurrent(artifact);
    if (!data?.entries)
        return 0;
    let removed = removeManagedEntriesForChat(data, chatKey);
    if (!removed)
        return 0;
    await wi.saveWorldInfo(name, data, true);
    assertArtifactCommitCurrent(artifact);
    // 保存后回读，防止旧缓存把当前聊天条目重新写回旧书。
    const verifiedData = (await wi.loadWorldInfo(name)) || data;
    assertArtifactCommitCurrent(artifact);
    const verifiedRemoved = removeManagedEntriesForChat(verifiedData, chatKey);
    removed += verifiedRemoved;
    if (verifiedRemoved) {
        await wi.saveWorldInfo(name, verifiedData, true);
        assertArtifactCommitCurrent(artifact);
    }
    const rendered = await reloadWorldInfoEditor(wi, name, false);
    assertArtifactCommitCurrent(artifact);
    if (rendered) {
        const postReloadData = (await wi.loadWorldInfo(name)) || verifiedData;
        assertArtifactCommitCurrent(artifact);
        const postReloadRemoved = removeManagedEntriesForChat(postReloadData, chatKey);
        removed += postReloadRemoved;
        if (postReloadRemoved) {
            await wi.saveWorldInfo(name, postReloadData, true);
            assertArtifactCommitCurrent(artifact);
            await reloadWorldInfoEditor(wi, name, true);
            assertArtifactCommitCurrent(artifact);
            const finalData = (await wi.loadWorldInfo(name)) || postReloadData;
            const finalRemoved = removeManagedEntriesForChat(finalData, chatKey);
            removed += finalRemoved;
            if (finalRemoved) {
                await wi.saveWorldInfo(name, finalData, true);
                assertArtifactCommitCurrent(artifact);
                throw new Error('旧世界书清理刷新后持续回写旧缓存，已修正入库但界面未能稳定刷新');
            }
        }
    }
    return removed;
}
function managedContentIdentity(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}
function managedCommentIdentity(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}
/**
 * 世界书条目的逻辑名称。SillyTavern 用 comment 作为条目名称/备注；镜渊生成的同一聊天条目
 * 约定名称唯一。这里只统一 Unicode、分隔符、大小写和空白，不读取正文，避免正文更新后失去身份。
 */
function mirrorAbyssManagedNameIdentity(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/^\s*\[MA11\]\s*/i, '')
        .replace(/[|｜]+/g, '|')
        .split('|')
        .map((part) => part.replace(/\s+/g, ' ').trim().toLocaleLowerCase())
        .filter(Boolean)
        .join('|');
}
/** 只把带镜渊固定备注前缀的条目视为可识别旧副本，普通人工条目不参与精确清理。 */
function isMirrorAbyssGeneratedEntry(entry) {
    return /^\[MA11\]\s+MA[｜|]/.test(managedCommentIdentity(entry?.comment));
}
/** 备注与正文共同组成精确签名；仅正文相似不会触发删除。 */
function mirrorAbyssExactIdentity(comment, content) {
    const normalizedComment = managedCommentIdentity(comment);
    const normalizedContent = managedContentIdentity(content);
    return normalizedComment && normalizedContent ? `${normalizedComment}\n${normalizedContent}` : '';
}
/**
 * 逻辑键是刷新/迁移后的第二身份。优先读托管元数据；旧摘要再从正文事件线恢复，
 * 对象条目最后才从完整备注恢复。不能只凭相似正文推断，否则共享世界书会误接管其他聊天。
 */
function legacyLogicalKey(entry, info) {
    const explicit = String(info?.logicalKey || '').trim();
    if (explicit)
        return explicit;
    const comment = managedCommentIdentity(entry?.comment);
    const content = managedContentIdentity(entry?.content);
    if (/^\[MA11\]\s+MA[｜|]大总结(?:[｜|]|$)/.test(comment)) {
        const eventId = content.match(/\[长期事件线[：:]\s*([^\]\n]+)\]/)?.[1]?.trim();
        return eventId ? `large:event:${eventId}` : 'large:current';
    }
    if (/^\[MA11\]\s+MA[｜|]小总结(?:[｜|]|$)/.test(comment)) {
        const eventId = content.match(/\[事件线[：:]\s*([^\]\n]+)\]/)?.[1]?.trim();
        if (eventId)
            return `small:event:${eventId}`;
    }
    return '';
}
/** 等待 SillyTavern 完成一轮编辑器 DOM 提交；测试环境没有 rAF 时退回计时器。 */
async function waitForWorldInfoEditorPaint() {
    const raf = typeof window?.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : null;
    if (!raf) {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        return;
    }
    await new Promise((resolve) => raf(() => raf(() => resolve())));
}
/**
 * 刷新 SillyTavern 世界书列表和编辑器。
 *
 * saveWorldInfo 会更新 SillyTavern 的世界书缓存，但不会保证当前编辑器 DOM 立即重绘。
 * reloadEditor 只触发异步 change；showWorldEditor 才执行实际列表重建。两者同时调用会形成
 * 两条并发刷新链，后完成的旧 change 渲染可能覆盖新列表。因此：
 * - 目标书正在显示或人工强制刷新时，只走一条可等待的 showWorldEditor 路径；
 * - 后台书未显示时，才使用 reloadEditor 通知选择器。
 */
async function reloadWorldInfoEditor(wi, name, loadIfNotSelected = false) {
    const context = getContext();
    const contextUpdateList = context.updateWorldInfoList;
    const moduleUpdateList = wi.updateWorldInfoList;
    const updateList = contextUpdateList ?? moduleUpdateList;
    if (typeof updateList === 'function') {
        await Promise.resolve(updateList.call(contextUpdateList ? context : wi));
    }
    const names = typeof context.getWorldInfoNames === 'function'
        ? context.getWorldInfoNames()
        : Array.isArray(wi.world_names)
            ? [...wi.world_names]
            : [];
    // 新建书偶尔会晚一拍进入下拉列表。直接 showWorldEditor 仍可按书名读取缓存。
    const listed = !names.length || names.includes(name);
    const editorSelect = document.querySelector('#world_editor_select');
    const selectedName = editorSelect?.selectedOptions?.[0]?.textContent?.trim() ?? '';
    const shouldRenderTarget = loadIfNotSelected || selectedName === name;
    const contextShow = context.showWorldEditor;
    const moduleShow = wi.showWorldEditor;
    const show = contextShow ?? moduleShow;
    if (shouldRenderTarget && typeof show === 'function') {
        // 只更新选择框值，不触发 change，避免再次排入一条异步旧渲染。
        if (editorSelect && listed && editorSelect.options) {
            const targetOption = Array.from(editorSelect.options).find((option) => option.textContent?.trim() === name);
            if (targetOption)
                editorSelect.value = targetOption.value;
        }
        // showWorldEditor 会从 saveWorldInfo 已更新的缓存重建列表；这里不再并发触发 reloadEditor。
        await Promise.resolve(show.call(contextShow ? context : wi, name));
        await waitForWorldInfoEditorPaint();
        return true;
    }
    const contextReload = context.reloadWorldInfoEditor;
    const moduleReload = wi.reloadEditor ?? wi.reloadWorldInfoEditor;
    const reload = contextReload ?? moduleReload;
    if (typeof reload === 'function' && listed) {
        await Promise.resolve(reload.call(contextReload ? context : wi, name, loadIfNotSelected));
        await waitForWorldInfoEditorPaint();
    }
    return false;
}
/** 聊天世界书关联写入后立即刷新按钮状态，不再等待下一次 CHAT_CHANGED。 */
function refreshChatLorebookIndicator(name) {
    if (typeof document?.querySelectorAll !== 'function')
        return;
    const linked = Boolean(name);
    document.querySelectorAll('.chat_lorebook_button').forEach((button) => {
        button.classList.toggle('world_set', linked);
    });
}
function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function triggerKeys(spec) {
    const trigger = spec.trigger ?? { any: spec.keywords ?? [], all: [], exclude: [] };
    const any = Array.isArray(trigger.any) ? trigger.any.filter(Boolean) : [];
    const all = Array.isArray(trigger.all) ? trigger.all.filter(Boolean) : [];
    const exclude = Array.isArray(trigger.exclude) ? trigger.exclude.filter(Boolean) : [];
    if (!all.length && !exclude.length)
        return any;
    const anyLookahead = any.length ? `(?=[\\s\\S]*(?:${any.map(escapeRegex).join('|')}))` : '';
    const allLookaheads = all.map((item) => `(?=[\\s\\S]*${escapeRegex(item)})`).join('');
    const excludeLookahead = exclude.length ? `(?![\\s\\S]*(?:${exclude.map(escapeRegex).join('|')}))` : '';
    return [`/${excludeLookahead}${allLookaheads}${anyLookahead}[\\s\\S]*/i`];
}
function applyEntry(entry, chatKey, key, spec, wi) {
    entry.comment = spec.comment;
    entry.content = spec.content;
    const disabled = spec.disabled === true;
    entry.constant = !disabled && spec.constant === true;
    entry.vectorized = !disabled && spec.vectorized === true;
    entry.key = !disabled && !entry.constant && (spec.keywords?.length || spec.trigger?.any?.length) ? triggerKeys(spec) : [];
    entry.keysecondary = [];
    entry.selective = false;
    entry.disable = disabled;
    entry.addMemo = true;
    entry.position = wi.world_info_position?.after ?? 1;
    // order 仅用于世界书编辑器显示顺序，不参与镜渊的记忆取舍。
    entry.order = spec.order;
    entry.preventRecursion = !spec.allowRecursion;
    entry.excludeRecursion = !spec.allowRecursion;
    entry.delayUntilRecursion = 0;
    entry.extensions ||= {};
    entry.extensions.mirrorAbyssV11 = {
        managed: true,
        chatKey,
        key,
        logicalKey: spec.logicalKey || key,
        kind: spec.kind,
        version: VERSION,
        recallMode: spec.recallMode,
        trigger: spec.trigger,
        vector: spec.vector,
        factIds: spec.factIds,
        eventIds: spec.eventIds,
        disabled,
        allowRecursion: spec.allowRecursion !== false,
    };
}
function summaryEventKey(item) {
    return String(item?.eventId || item?.id || '').trim();
}
async function desiredSpecs(artifact, committedState) {
    const settings = getSettings();
    const control = resolveHostControl(settings);
    const state = committedState ?? await getChatState(artifact.chatKey);
    const documents = buildLorebookDocuments(artifact.snapshot, state.smallSummaries, state.largeSummaries, {
        layout: settings.lorebookLayout,
        vectorize: control.vector && settings.vectorizeRows,
        recursion: control.recursion,
        latestContinuityConstant: settings.latestContinuityConstant,
        registry: settings.tableRegistry,
        internalFacts: state.internalFacts,
        similarityThreshold: settings.lorebookRecall.similarityThreshold,
        maxVectorResults: settings.lorebookRecall.maxVectorResults,
        totalCapacity: settings.lorebookRecall.totalCapacity,
        focusObjectId: state.focusObjectId,
        narrativeContext: state.runtimeV2?.narrativeContext,
        entryLimits: settings.contentLimits.tables,
    });
    const desired = normalizeDesiredLorebookSpecs(new Map(documents.map((document) => [document.key, document])));
    return { desired };
}
async function legacyCleanupScope(artifact) {
    const state = await getChatState(artifact.chatKey);
    const logicalKeys = new Set();
    const legacyKeys = new Set();
    const comments = new Set();
    for (const item of state.smallSummaries) {
        const eventKey = summaryEventKey(item);
        if (eventKey)
            logicalKeys.add(`small:event:${eventKey}`);
        legacyKeys.add(`small:${item.id}`);
        comments.add(managedCommentIdentity(`[MA11] MA｜小总结｜${item.title}`));
    }
    for (const item of state.largeSummaries) {
        const eventKey = summaryEventKey(item);
        if (eventKey)
            logicalKeys.add(`large:event:${eventKey}`);
        logicalKeys.add('large:current');
        legacyKeys.add(`large:${item.id}`);
        comments.add(managedCommentIdentity(`[MA11] MA｜大总结｜${item.title}`));
    }
    return { logicalKeys, legacyKeys, comments };
}
function legacyManagedKey(key) {
    return (key.startsWith('small:') && !key.startsWith('small:event:'))
        || (key.startsWith('large:') && key !== 'large:current' && !key.startsWith('large:event:'));
}
function appendPair(index, key, pair) {
    if (!key)
        return;
    index.set(key, [...(index.get(key) ?? []), pair]);
}
function uniqueSpecStrings(values, limit = 120) {
    return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value])
            .map((value) => String(value ?? '').trim()).filter(Boolean))].slice(0, limit);
}
function recallModePriority(value) {
    return value === 'constant' ? 0 : value === 'trigger' ? 1 : 2;
}
function mergeDesiredLorebookSpec(left, right) {
    const rightIsNewer = String(right?.updatedAt || '') > String(left?.updatedAt || '');
    const primary = rightIsNewer ? right : left;
    const secondary = primary === left ? right : left;
    const mode = recallModePriority(left?.recallMode) <= recallModePriority(right?.recallMode)
        ? left?.recallMode
        : right?.recallMode;
    return {
        ...secondary,
        ...primary,
        // 正文是对象当前完整视图，不能把两份完整条目逐行拼接成重复切面。
        // 事实与事件通过下方 ID 集合合并；正文采用较新的完整视图。
        content: String(primary?.content || secondary?.content || '').trim(),
        recallMode: mode,
        constant: Boolean(left?.constant || right?.constant || mode === 'constant'),
        vectorized: Boolean(left?.vectorized || right?.vectorized || mode === 'hybrid' || mode === 'vector')
            && !(left?.disabled === true && right?.disabled === true),
        keywords: uniqueSpecStrings([left?.keywords, right?.keywords, left?.trigger?.any, right?.trigger?.any], 48),
        disabled: left?.disabled === true && right?.disabled === true,
        trigger: {
            any: uniqueSpecStrings([left?.trigger?.any, right?.trigger?.any], 48),
            all: uniqueSpecStrings([left?.trigger?.all, right?.trigger?.all], 32),
            exclude: uniqueSpecStrings([left?.trigger?.exclude, right?.trigger?.exclude], 32),
        },
        factIds: uniqueSpecStrings([left?.factIds, right?.factIds], 160),
        eventIds: uniqueSpecStrings([left?.eventIds, right?.eventIds], 120),
        updatedAt: String(primary?.updatedAt || secondary?.updatedAt || ''),
    };
}
/**
 * 世界书发布计划的最终唯一闸门。
 *
 * 同一聊天、同一完整条目名称只允许存在一条。不同事实、事件和时间切面全部并入同一条目，
 * 不再保留“同名但证据不足”的分支；该情况属于上游对象唯一性失效，必须在这里收拢。
 */
function normalizeDesiredLorebookSpecs(desired) {
    const output = new Map([...desired.entries()].map(([key, spec]) => [key, structuredClone(spec)]));
    const groups = new Map();
    for (const [key, spec] of output) {
        const nameIdentity = mirrorAbyssManagedNameIdentity(spec?.comment);
        if (!nameIdentity)
            continue;
        groups.set(nameIdentity, [...(groups.get(nameIdentity) ?? []), { key, spec }]);
    }
    for (const group of groups.values()) {
        if (group.length < 2)
            continue;
        const ordered = [...group].sort((left, right) => {
            const mode = recallModePriority(left.spec?.recallMode) - recallModePriority(right.spec?.recallMode);
            if (mode)
                return mode;
            const time = String(right.spec?.updatedAt || '').localeCompare(String(left.spec?.updatedAt || ''));
            return time || left.key.localeCompare(right.key);
        });
        const survivor = ordered[0];
        let merged = structuredClone(survivor.spec);
        for (const item of ordered.slice(1)) {
            merged = mergeDesiredLorebookSpec(merged, item.spec);
            output.delete(item.key);
        }
        merged.comment = survivor.spec.comment;
        merged.logicalKey = String(survivor.spec.logicalKey || survivor.key);
        output.set(survivor.key, merged);
    }
    return output;
}
/**
 * 普通同步的唯一身份顺序：
 *
 * 1. 当前 chatKey + managedKey；
 * 2. 当前 chatKey + 规范化条目名称；同名多条时确定性保留一个 UID 并删除其余；
 * 3. 当前 chatKey + 两侧唯一 logicalKey；
 * 4. 否则创建。
 *
 * owner 未知与其他 chatKey 条目完全不进入普通同步候选。旧键和歧义 logicalKey 留给
 * 玩家主动维护，避免热路径中的历史猜测和顺序接管。
 */
function reconcileLorebookEntries(data, desired, chatKey, wi, name, dedicatedBook = false, _cleanup = {}) {
    desired = normalizeDesiredLorebookSpecs(desired);
    data.entries ||= {};
    const pairs = [];
    const currentByKey = new Map();
    const currentByName = new Map();
    const currentByLogical = new Map();
    for (const [uid, entry] of Object.entries(data.entries)) {
        const info = managedInfo(entry);
        const ownedByCurrentChat = Boolean(info?.managed && info.chatKey === chatKey);
        const generated = isMirrorAbyssGeneratedEntry(entry);
        const ownerUnknown = generated && (!info?.managed || !info?.chatKey);
        const currentScope = ownedByCurrentChat || Boolean(dedicatedBook && ownerUnknown);
        if (!currentScope)
            continue;
        const pair = {
            uid,
            entry,
            info,
            key: String(info?.key || ''),
            logicalKey: legacyLogicalKey(entry, info),
            nameIdentity: mirrorAbyssManagedNameIdentity(entry.comment),
            commentIdentity: managedCommentIdentity(entry.comment),
            exactIdentity: mirrorAbyssExactIdentity(entry.comment, entry.content),
            currentScope,
            generated,
        };
        pairs.push(pair);
        appendPair(currentByKey, pair.key, pair);
        appendPair(currentByName, pair.nameIdentity, pair);
        appendPair(currentByLogical, pair.logicalKey, pair);
    }
    let changed = false;
    let created = 0;
    let adoptedLegacy = 0;
    let removed = 0;
    const claimed = new Set();
    const duplicateManaged = new Set();
    const protectedAmbiguous = new Set();
    const entryIds = [];
    const desiredNameCounts = new Map();
    const desiredLogicalCounts = new Map();
    for (const [key, spec] of desired) {
        const nameIdentity = mirrorAbyssManagedNameIdentity(spec.comment);
        if (nameIdentity)
            desiredNameCounts.set(nameIdentity, (desiredNameCounts.get(nameIdentity) ?? 0) + 1);
        const logicalKey = String(spec.logicalKey || key);
        desiredLogicalCounts.set(logicalKey, (desiredLogicalCounts.get(logicalKey) ?? 0) + 1);
    }
    const stablePairOrder = (left, right) => {
        const leftNumber = Number(left.uid);
        const rightNumber = Number(right.uid);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
            return leftNumber - rightNumber;
        }
        return left.uid.localeCompare(right.uid);
    };
    const desiredItems = [...desired.entries()].map(([key, spec]) => ({
        key,
        spec,
        logicalKey: String(spec.logicalKey || key),
        nameIdentity: mirrorAbyssManagedNameIdentity(spec.comment),
        commentIdentity: managedCommentIdentity(spec.comment),
        exactIdentity: mirrorAbyssExactIdentity(spec.comment, spec.content),
        pair: undefined,
    }));
    // 第一遍先预留所有 managedKey 命中，避免 desired Map 顺序让 logicalKey 抢走稳定 UID。
    for (const item of desiredItems) {
        const keyCandidates = (currentByKey.get(item.key) ?? [])
            .filter((pair) => !claimed.has(pair.uid))
            .sort(stablePairOrder);
        item.pair = keyCandidates[0];
        if (item.pair)
            claimed.add(item.pair.uid);
        if (item.pair && keyCandidates.length > 1) {
            for (const duplicate of keyCandidates.slice(1))
                duplicateManaged.add(duplicate.uid);
        }
    }
    // 第二遍按当前聊天中的唯一条目名称锁定 UID。同名多条属于重复发布：优先保留 managedKey
    // 已命中的 UID；否则保留最小 UID，并删除其余当前聊天托管副本。desired 已在入口强制归并为唯一名称。
    for (const item of desiredItems) {
        if (!item.nameIdentity || desiredNameCounts.get(item.nameIdentity) !== 1)
            continue;
        const nameCandidates = (currentByName.get(item.nameIdentity) ?? [])
            .filter((candidate) => !duplicateManaged.has(candidate.uid))
            .sort(stablePairOrder);
        if (item.pair) {
            for (const candidate of nameCandidates) {
                if (candidate.uid !== item.pair.uid && !claimed.has(candidate.uid))
                    duplicateManaged.add(candidate.uid);
            }
            continue;
        }
        const available = nameCandidates.filter((candidate) => !claimed.has(candidate.uid));
        if (!available.length)
            continue;
        item.pair = available[0];
        claimed.add(item.pair.uid);
        for (const duplicate of available.slice(1))
            duplicateManaged.add(duplicate.uid);
    }
    // 第三遍只允许新旧两侧均唯一、且未被 managedKey/名称预留的 logicalKey 接管。
    for (const item of desiredItems) {
        if (item.pair)
            continue;
        const logicalCandidates = (currentByLogical.get(item.logicalKey) ?? [])
            .filter((candidate) => !claimed.has(candidate.uid) && !duplicateManaged.has(candidate.uid));
        const logicalUniqueOnBothSides = logicalCandidates.length === 1
            && desiredLogicalCounts.get(item.logicalKey) === 1;
        if (logicalUniqueOnBothSides) {
            item.pair = logicalCandidates[0];
            claimed.add(item.pair.uid);
        }
        else if (logicalCandidates.length) {
            for (const candidate of logicalCandidates)
                protectedAmbiguous.add(candidate.uid);
        }
    }
    for (const item of desiredItems) {
        let pair = item.pair;
        const adoptedExistingLegacy = Boolean(pair && (!pair.info?.managed || !pair.info?.chatKey));
        let entry = pair?.entry;
        if (!entry) {
            entry = wi.createWorldInfoEntry(name, data);
            if (!entry)
                throw new Error(`世界书条目创建失败：${item.key}`);
            const createdUid = String(entry.uid ?? Object.entries(data.entries).find(([, value]) => value === entry)?.[0] ?? '');
            if (!createdUid)
                throw new Error(`世界书条目缺少UID：${item.key}`);
            pair = {
                uid: createdUid,
                entry,
                info: null,
                key: item.key,
                logicalKey: item.logicalKey,
                nameIdentity: item.nameIdentity,
                commentIdentity: item.commentIdentity,
                exactIdentity: item.exactIdentity,
                currentScope: true,
                generated: true,
            };
            created += 1;
            changed = true;
        }
        claimed.add(pair.uid);
        if (adoptedExistingLegacy)
            adoptedLegacy += 1;
        const before = JSON.stringify(entry);
        applyEntry(entry, chatKey, item.key, item.spec, wi);
        if (before !== JSON.stringify(entry))
            changed = true;
        if (Number.isFinite(Number(entry.uid)))
            entryIds.push(Number(entry.uid));
    }
    for (const pair of pairs) {
        if (claimed.has(pair.uid))
            continue;
        if (duplicateManaged.has(pair.uid)) {
            delete data.entries[pair.uid];
            removed += 1;
            changed = true;
            continue;
        }
        if (protectedAmbiguous.has(pair.uid))
            continue;
        if (legacyManagedKey(pair.key))
            continue;
        if (!pair.currentScope)
            continue;
        delete data.entries[pair.uid];
        removed += 1;
        changed = true;
    }
    return { changed, entryIds, created, adoptedLegacy, removed };
}
/**
 * 玩家主动维护使用的历史归并器。它保留备注、精确签名和旧键考古，但共享书里 owner
 * 未知的条目只统计、不接管、不删除；明确属于其他 chatKey 的条目始终不可写。
 */
function reconcileLorebookMaintenanceEntries(data, desired, chatKey, wi, name, dedicatedBook = false, cleanup = {}) {
    desired = normalizeDesiredLorebookSpecs(desired);
    data.entries ||= {};
    const pairs = [];
    const currentByKey = new Map();
    const currentByName = new Map();
    const currentByLogical = new Map();
    const currentByComment = new Map();
    const currentByExact = new Map();
    const adoptableByName = new Map();
    const adoptableByLogical = new Map();
    const adoptableByComment = new Map();
    const adoptableByExact = new Map();
    for (const [uid, entry] of Object.entries(data.entries)) {
        const info = managedInfo(entry);
        const currentScope = Boolean(info?.managed && info.chatKey === chatKey);
        const generated = isMirrorAbyssGeneratedEntry(entry);
        const ownerUnknown = generated && (!info?.managed || !info?.chatKey);
        if (!currentScope && !(dedicatedBook && ownerUnknown))
            continue;
        const pair = {
            uid,
            entry,
            info,
            key: String(info?.key || ''),
            logicalKey: legacyLogicalKey(entry, info),
            nameIdentity: mirrorAbyssManagedNameIdentity(entry.comment),
            commentIdentity: managedCommentIdentity(entry.comment),
            exactIdentity: mirrorAbyssExactIdentity(entry.comment, entry.content),
            currentScope,
            generated,
        };
        pairs.push(pair);
        if (currentScope) {
            appendPair(currentByKey, pair.key, pair);
            appendPair(currentByName, pair.nameIdentity, pair);
            appendPair(currentByLogical, pair.logicalKey, pair);
            appendPair(currentByComment, pair.commentIdentity, pair);
            appendPair(currentByExact, pair.exactIdentity, pair);
        }
        if (dedicatedBook && ownerUnknown) {
            appendPair(adoptableByName, pair.nameIdentity, pair);
            appendPair(adoptableByLogical, pair.logicalKey, pair);
            appendPair(adoptableByComment, pair.commentIdentity, pair);
            appendPair(adoptableByExact, pair.exactIdentity, pair);
        }
    }
    let changed = false;
    let created = 0;
    let adoptedLegacy = 0;
    let removed = 0;
    const claimed = new Set();
    const duplicateManaged = new Set();
    const entryIds = [];
    const stablePairOrder = (left, right) => {
        const leftNumber = Number(left.uid);
        const rightNumber = Number(right.uid);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
            return leftNumber - rightNumber;
        }
        return left.uid.localeCompare(right.uid);
    };
    const takeUnique = (items) => {
        const available = (items ?? []).filter((pair) => !claimed.has(pair.uid));
        return available.length === 1 ? available[0] : undefined;
    };
    const desiredNameCounts = new Map();
    for (const [key, spec] of desired) {
        const nameIdentity = mirrorAbyssManagedNameIdentity(spec.comment);
        if (nameIdentity)
            desiredNameCounts.set(nameIdentity, (desiredNameCounts.get(nameIdentity) ?? 0) + 1);
    }
    for (const [key, spec] of desired) {
        const logicalKey = String(spec.logicalKey || key);
        const nameIdentity = mirrorAbyssManagedNameIdentity(spec.comment);
        const commentIdentity = managedCommentIdentity(spec.comment);
        const exactIdentity = mirrorAbyssExactIdentity(spec.comment, spec.content);
        const keyCandidates = (currentByKey.get(key) ?? [])
            .filter((candidate) => !claimed.has(candidate.uid))
            .sort(stablePairOrder);
        let pair = keyCandidates[0];
        if (pair) {
            for (const duplicate of keyCandidates.slice(1))
                duplicateManaged.add(duplicate.uid);
        }
        if (nameIdentity && desiredNameCounts.get(nameIdentity) === 1) {
            const nameCandidates = (currentByName.get(nameIdentity) ?? [])
                .filter((candidate) => !claimed.has(candidate.uid) && !duplicateManaged.has(candidate.uid))
                .sort(stablePairOrder);
            if (!pair && nameCandidates.length)
                pair = nameCandidates[0];
            if (pair) {
                for (const duplicate of nameCandidates) {
                    if (duplicate.uid !== pair.uid)
                        duplicateManaged.add(duplicate.uid);
                }
            }
        }
        pair ??= takeUnique(currentByLogical.get(logicalKey))
            ?? takeUnique(currentByComment.get(commentIdentity))
            ?? takeUnique(currentByExact.get(exactIdentity));
        if (!pair && dedicatedBook) {
            pair = (nameIdentity && desiredNameCounts.get(nameIdentity) === 1
                ? takeUnique(adoptableByName.get(nameIdentity))
                : undefined)
                ?? takeUnique(adoptableByLogical.get(logicalKey))
                ?? takeUnique(adoptableByComment.get(commentIdentity))
                ?? takeUnique(adoptableByExact.get(exactIdentity));
            if (pair)
                adoptedLegacy += 1;
        }
        let entry = pair?.entry;
        if (!entry) {
            entry = wi.createWorldInfoEntry(name, data);
            if (!entry)
                throw new Error(`世界书条目创建失败：${key}`);
            const createdUid = String(entry.uid ?? Object.entries(data.entries).find(([, value]) => value === entry)?.[0] ?? '');
            if (!createdUid)
                throw new Error(`世界书条目缺少UID：${key}`);
            pair = {
                uid: createdUid,
                entry,
                info: null,
                key,
                logicalKey,
                nameIdentity,
                commentIdentity,
                exactIdentity,
                currentScope: true,
                generated: true,
            };
            created += 1;
            changed = true;
        }
        claimed.add(pair.uid);
        const before = JSON.stringify(entry);
        applyEntry(entry, chatKey, key, spec, wi);
        if (before !== JSON.stringify(entry))
            changed = true;
        if (Number.isFinite(Number(entry.uid)))
            entryIds.push(Number(entry.uid));
    }
    for (const pair of pairs) {
        if (claimed.has(pair.uid))
            continue;
        if (duplicateManaged.has(pair.uid) && pair.currentScope) {
            delete data.entries[pair.uid];
            removed += 1;
            changed = true;
            continue;
        }
        const ownerUnknown = pair.generated && (!pair.info?.managed || !pair.info?.chatKey);
        const oldKeyInScope = pair.currentScope && (legacyManagedKey(pair.key)
            || Boolean(pair.key && cleanup.legacyKeys?.has(pair.key))
            || Boolean(pair.logicalKey && cleanup.logicalKeys?.has(pair.logicalKey))
            || Boolean(pair.commentIdentity && cleanup.comments?.has(pair.commentIdentity)));
        if (!oldKeyInScope && !(dedicatedBook && ownerUnknown))
            continue;
        delete data.entries[pair.uid];
        removed += 1;
        changed = true;
    }
    return { changed, entryIds, created, adoptedLegacy, removed };
}
async function refreshTargetLorebookAndConfirm(wi, name, desired, artifact, dedicatedBook, force, entryIds) {
    const renderedTarget = await reloadWorldInfoEditor(wi, name, force);
    assertArtifactCommitCurrent(artifact);
    if (!renderedTarget)
        return entryIds;
    // showWorldEditor 可能把打开前的旧缓存延迟写回。重绘后必须重新加载并按当前 desired 对账。
    const postReloadData = (await wi.loadWorldInfo(name)) || { entries: {} };
    postReloadData.entries ||= {};
    const postReloadVerification = reconcileLorebookEntries(postReloadData, desired, artifact.chatKey, wi, name, dedicatedBook);
    entryIds = postReloadVerification.entryIds;
    if (!postReloadVerification.changed)
        return entryIds;
    assertArtifactCommitCurrent(artifact);
    await wi.saveWorldInfo(name, postReloadData, true);
    assertArtifactCommitCurrent(artifact);
    // 修正保存后再次重绘，确保当前编辑器看到的是最终入库版本，而不是刚被修掉的旧缓存。
    await reloadWorldInfoEditor(wi, name, true);
    assertArtifactCommitCurrent(artifact);
    const finalData = (await wi.loadWorldInfo(name)) || postReloadData;
    finalData.entries ||= {};
    const finalVerification = reconcileLorebookEntries(finalData, desired, artifact.chatKey, wi, name, dedicatedBook);
    entryIds = finalVerification.entryIds;
    if (finalVerification.changed) {
        await wi.saveWorldInfo(name, finalData, true);
        assertArtifactCommitCurrent(artifact);
        throw new Error('世界书编辑器刷新后持续回写旧缓存，已修正入库但界面未能稳定刷新');
    }
    return entryIds;
}
/**
 * 基于最新成功状态及总结执行差异同步；写入前后持续校验 artifact 是否仍然有效。
 */
async function syncLorebookOnce(artifact, name, force = false, options = {}) {
    assertArtifactCommitCurrent(artifact);
    if (!artifact.snapshot || artifact.stages.state.status !== 'success') {
        throw new Error('没有成功状态表，停止世界书同步');
    }
    const settings = getSettings();
    const retryingFailedSync = artifact.stages.sync.status === 'failed';
    if (!resolveHostControl(settings).lorebook && !force) {
        markStage(artifact, 'sync', 'skipped');
        await putArtifact(artifact);
        return;
    }
    markStage(artifact, 'sync', 'running');
    await putArtifact(artifact);
    const chatState = await getChatState(artifact.chatKey);
    const historyWorkflow = readHistoryWorkflow(chatState);
    if (historyWorkflow.blocked) {
        const recoveryAuthorized = Boolean(options.allowHistoryRecovery
            && historyWorkflow.phase === 'publishing-lorebook'
            && chatState.latestSnapshotMessageKey === artifact.messageKey);
        if (!recoveryAuthorized) {
            const blockedReason = historyWorkflow.startIndex === undefined
                ? '历史删除位置未知，请先选择重算起点'
                : `第 ${historyWorkflow.startIndex + 1} 条消息之后的数据需要重算`;
            markStage(artifact, 'sync', 'blocked', blockedReason);
            await putArtifact(artifact);
            throw new TaskBlockedError(blockedReason);
        }
    }
    try {
        const wi = await ensureLorebook(name, artifact.chatKey, artifact);
        if (!name)
            throw new Error('没有可用的聊天世界书');
        const data = (await wi.loadWorldInfo(name)) || { entries: {} };
        data.entries ||= {};
        const plan = await desiredSpecs(artifact, chatState);
        const detectedDeletions = detectPlayerDeletedLorebookEntries(chatState, data, plan.desired, artifact.chatKey, name);
        if (detectedDeletions.length) {
            // 玩家删除属于持久化发布否决，必须在任何可能失败的后续写入前先保存墓碑。
            await putChatState(chatState);
            assertArtifactCommitCurrent(artifact);
        }
        const desired = applyLorebookSuppressions(plan.desired, chatState);
        const dedicatedBook = isDedicatedGeneratedBook(name, artifact.chatKey);
        const reconciliation = reconcileLorebookEntries(data, desired, artifact.chatKey, wi, name, dedicatedBook);
        const changed = reconciliation.changed;
        let entryIds = reconciliation.entryIds;
        assertArtifactCommitCurrent(artifact);
        if (changed) {
            await wi.saveWorldInfo(name, data, true);
            assertArtifactCommitCurrent(artifact);
            // 只有实际保存后做一次回读确认，清除保存路径回流的同 managedKey 副本。
            const verifiedData = (await wi.loadWorldInfo(name)) || data;
            const verification = reconcileLorebookEntries(verifiedData, desired, artifact.chatKey, wi, name, dedicatedBook);
            entryIds = verification.entryIds;
            if (verification.changed) {
                assertArtifactCommitCurrent(artifact);
                await wi.saveWorldInfo(name, verifiedData, true);
                assertArtifactCommitCurrent(artifact);
            }
        }
        // 普通同步只在数据变化后刷新；强制同步或上一轮刷新失败的重试即使无变化也必须重绘。
        if (changed || force || retryingFailedSync || chatState.lastSyncStatus === 'failed') {
            entryIds = await refreshTargetLorebookAndConfirm(wi, name, desired, artifact, dedicatedBook, force, entryIds);
        }
        const previousLorebookName = sanitizeBookName(chatState.lastLorebookName || '');
        if (previousLorebookName && previousLorebookName !== name) {
            // 新目标书已经成功入库后再清旧书，避免目标发布失败时先丢失原有长期记忆。
            await cleanupPreviousLorebook(wi, previousLorebookName, artifact.chatKey, artifact);
        }
        assertArtifactCommitCurrent(artifact);
        const finalPublicationData = (await wi.loadWorldInfo(name)) || data;
        assertArtifactCommitCurrent(artifact);
        updateLorebookPublicationLedger(chatState, finalPublicationData, artifact.chatKey, name);
        artifact.lorebookEntryIds = entryIds;
        markStage(artifact, 'sync', 'success');
        chatState.lastLorebookName = name;
        chatState.lastSyncAt = new Date().toISOString();
        chatState.lastSyncStatus = 'success';
        chatState.lastSyncError = undefined;
        await putArtifact(artifact);
        await putChatState(chatState);
    }
    catch (error) {
        if (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name)) {
            markStage(artifact, 'sync', 'cancelled', toErrorMessage(error));
            await putArtifact(artifact);
            throw error;
        }
        const message = toErrorMessage(error);
        markStage(artifact, 'sync', 'failed', message);
        chatState.lastSyncStatus = 'failed';
        chatState.lastSyncError = message;
        await putArtifact(artifact);
        await putChatState(chatState);
        throw error;
    }
}
/** 所有世界书写操作按最终物理书名串行；chatKey 只定义条目归属，不作为物理锁。 */
async function syncLorebook(artifact, force = false, options = {}) {
    assertArtifactCommitCurrent(artifact);
    const settings = getSettings();
    const name = resolveTargetBookName(true, artifact.chatKey);
    if (!resolveHostControl(settings).lorebook && !force) {
        await syncLorebookOnce(artifact, name, force, options);
        return;
    }
    if (!name)
        throw new Error('没有可用的聊天世界书');
    const persisted = await getChatState(artifact.chatKey);
    const previousLorebookName = sanitizeBookName(persisted.lastLorebookName || '');
    await withLorebookMutations([name, previousLorebookName], async () => {
        assertArtifactCommitCurrent(artifact);
        await syncLorebookOnce(artifact, name, force, options);
    });
}
function maintenancePreviewFromData(data, name, chatKey, dedicatedBook) {
    let currentManaged = 0;
    let protectedUnknown = 0;
    let protectedForeign = 0;
    const candidateUids = new Set();
    const removableUids = new Set();
    const currentByName = new Map();
    for (const [uid, entry] of Object.entries(data?.entries ?? {})) {
        const info = managedInfo(entry);
        const generated = isMirrorAbyssGeneratedEntry(entry);
        if (info?.managed && info.chatKey === chatKey) {
            currentManaged += 1;
            const nameIdentity = mirrorAbyssManagedNameIdentity(entry.comment);
            if (nameIdentity)
                currentByName.set(nameIdentity, [...(currentByName.get(nameIdentity) ?? []), uid]);
            const key = String(info.key || '');
            if (!key || legacyManagedKey(key)) {
                candidateUids.add(uid);
                removableUids.add(uid);
            }
            continue;
        }
        if (info?.managed && info.chatKey && info.chatKey !== chatKey) {
            protectedForeign += 1;
            continue;
        }
        if (generated && (!info?.managed || !info?.chatKey)) {
            candidateUids.add(uid);
            if (dedicatedBook)
                removableUids.add(uid);
            else
                protectedUnknown += 1;
        }
    }
    for (const uids of currentByName.values()) {
        if (uids.length < 2)
            continue;
        // 预览只需要准确报告重复数量；实际执行会优先保留当前 managedKey 命中的 UID。
        for (const uid of uids.slice(1)) {
            candidateUids.add(uid);
            removableUids.add(uid);
        }
    }
    return {
        applied: false,
        name,
        dedicatedBook,
        currentManaged,
        legacyCandidates: candidateUids.size,
        removable: removableUids.size,
        protectedUnknown,
        protectedForeign,
        removed: 0,
    };
}
/**
 * 玩家维护的只读预览。不创建世界书、不保存、不写聊天 metadata。
 */
async function previewLorebookMaintenance(artifact) {
    assertArtifactCommitCurrent(artifact);
    const name = resolveTargetBookName(false, artifact.chatKey);
    if (!name)
        return maintenancePreviewFromData(null, '', artifact.chatKey, false);
    return withLorebookMutation(name, async () => {
        assertArtifactCommitCurrent(artifact);
        const wi = await worldInfoApi();
        assertArtifactCommitCurrent(artifact);
        const data = await wi.loadWorldInfo(name);
        assertArtifactCommitCurrent(artifact);
        return maintenancePreviewFromData(data, name, artifact.chatKey, isDedicatedGeneratedBook(name, artifact.chatKey));
    });
}
/**
 * 玩家确认后的维护执行。共享书 owner 未知条目不会进入写集合；执行时重新加载和规划，
 * 不信任预览阶段的 UID。调用者随后仍应执行一次普通 sync 来提交同步状态。
 */
async function applyLorebookMaintenance(artifact) {
    assertArtifactCommitCurrent(artifact);
    if (!artifact.snapshot || artifact.stages.state.status !== 'success') {
        throw new Error('没有成功状态表，停止世界书维护');
    }
    const name = resolveTargetBookName(true, artifact.chatKey);
    if (!name)
        throw new Error('没有可用的聊天世界书');
    return withLorebookMutation(name, async () => {
        assertArtifactCommitCurrent(artifact);
        const wi = await ensureLorebook(name, artifact.chatKey, artifact);
        assertArtifactCommitCurrent(artifact);
        const data = (await wi.loadWorldInfo(name)) || { entries: {} };
        assertArtifactCommitCurrent(artifact);
        data.entries ||= {};
        const dedicatedBook = isDedicatedGeneratedBook(name, artifact.chatKey);
        const preview = maintenancePreviewFromData(data, name, artifact.chatKey, dedicatedBook);
        const state = await getChatState(artifact.chatKey);
        const plan = await desiredSpecs(artifact, state);
        const detectedDeletions = detectPlayerDeletedLorebookEntries(state, data, plan.desired, artifact.chatKey, name);
        if (detectedDeletions.length) {
            await putChatState(state);
            assertArtifactCommitCurrent(artifact);
        }
        const desired = applyLorebookSuppressions(plan.desired, state);
        const cleanup = await legacyCleanupScope(artifact);
        assertArtifactCommitCurrent(artifact);
        const first = reconcileLorebookMaintenanceEntries(data, desired, artifact.chatKey, wi, name, dedicatedBook, cleanup);
        let removed = first.removed;
        if (first.changed) {
            assertArtifactCommitCurrent(artifact);
            await wi.saveWorldInfo(name, data, true);
            assertArtifactCommitCurrent(artifact);
            const verifiedData = (await wi.loadWorldInfo(name)) || data;
            assertArtifactCommitCurrent(artifact);
            const verification = reconcileLorebookMaintenanceEntries(verifiedData, desired, artifact.chatKey, wi, name, dedicatedBook, cleanup);
            removed += verification.removed;
            if (verification.changed) {
                await wi.saveWorldInfo(name, verifiedData, true);
                assertArtifactCommitCurrent(artifact);
            }
            const renderedTarget = await reloadWorldInfoEditor(wi, name, true);
            assertArtifactCommitCurrent(artifact);
            if (renderedTarget) {
                const postReloadData = (await wi.loadWorldInfo(name)) || verifiedData;
                assertArtifactCommitCurrent(artifact);
                const postReloadVerification = reconcileLorebookMaintenanceEntries(postReloadData, desired, artifact.chatKey, wi, name, dedicatedBook, cleanup);
                removed += postReloadVerification.removed;
                if (postReloadVerification.changed) {
                    await wi.saveWorldInfo(name, postReloadData, true);
                    assertArtifactCommitCurrent(artifact);
                    await reloadWorldInfoEditor(wi, name, true);
                    assertArtifactCommitCurrent(artifact);
                    const finalData = (await wi.loadWorldInfo(name)) || postReloadData;
                    assertArtifactCommitCurrent(artifact);
                    const finalVerification = reconcileLorebookMaintenanceEntries(finalData, desired, artifact.chatKey, wi, name, dedicatedBook, cleanup);
                    removed += finalVerification.removed;
                    if (finalVerification.changed) {
                        await wi.saveWorldInfo(name, finalData, true);
                        assertArtifactCommitCurrent(artifact);
                        throw new Error('世界书维护刷新后持续回写旧缓存，已修正入库但界面未能稳定刷新');
                    }
                }
            }
        }
        return { ...preview, applied: true, removed };
    });
}
async function restoreSuppressedLorebookEntry(artifact, key) {
    assertArtifactCommitCurrent(artifact);
    const state = await getChatState(artifact.chatKey);
    if (!restoreLorebookSuppression(state, key))
        return false;
    await putChatState(state);
    assertArtifactCommitCurrent(artifact);
    await syncLorebook(artifact, true);
    return true;
}

async function knownLorebookNamesForChat(chatKey) {
    const state = await getChatState(chatKey);
    return [...new Set([
            sanitizeBookName(state.lastLorebookName || ''),
            resolveTargetBookName(false, chatKey),
        ].filter(Boolean))];
}
async function clearManagedEntriesInBook(wi, name, chatKey) {
    const assertCurrent = () => assertChatCommitCurrent(chatKey, '聊天已切换，停止清理旧聊天世界书');
    assertCurrent();
    const data = await wi.loadWorldInfo(name);
    assertCurrent();
    if (!data?.entries)
        return 0;
    const removed = removeManagedEntriesForChat(data, chatKey);
    if (!removed)
        return 0;
    await wi.saveWorldInfo(name, data, true);
    assertCurrent();
    const verifiedData = (await wi.loadWorldInfo(name)) || data;
    assertCurrent();
    const verifiedRemoved = removeManagedEntriesForChat(verifiedData, chatKey);
    if (verifiedRemoved) {
        await wi.saveWorldInfo(name, verifiedData, true);
        assertCurrent();
    }
    const rendered = await reloadWorldInfoEditor(wi, name);
    assertCurrent();
    if (rendered) {
        const postReloadData = (await wi.loadWorldInfo(name)) || verifiedData;
        assertCurrent();
        const postReloadRemoved = removeManagedEntriesForChat(postReloadData, chatKey);
        if (postReloadRemoved) {
            await wi.saveWorldInfo(name, postReloadData, true);
            assertCurrent();
            await reloadWorldInfoEditor(wi, name, true);
            assertCurrent();
            const finalData = (await wi.loadWorldInfo(name)) || postReloadData;
            const finalRemoved = removeManagedEntriesForChat(finalData, chatKey);
            if (finalRemoved) {
                await wi.saveWorldInfo(name, finalData, true);
                assertCurrent();
                throw new Error('世界书清理刷新后持续回写旧缓存，已修正入库但界面未能稳定刷新');
            }
        }
    }
    return removed;
}
function pauseManagedEntries(data, chatKey) {
    let managed = 0;
    let changed = false;
    for (const entry of Object.values(data?.entries ?? {})) {
        const info = managedInfo(entry);
        if (info?.managed && info.chatKey === chatKey) {
            managed += 1;
            if (!entry.disable) {
                entry.disable = true;
                changed = true;
            }
        }
    }
    return { managed, changed };
}
async function pauseManagedEntriesInBook(wi, name, chatKey) {
    const assertCurrent = () => assertChatCommitCurrent(chatKey, '聊天已切换，停止暂停旧聊天世界书');
    assertCurrent();
    const data = await wi.loadWorldInfo(name);
    assertCurrent();
    if (!data?.entries)
        return 0;
    const first = pauseManagedEntries(data, chatKey);
    if (!first.changed)
        return first.managed;
    await wi.saveWorldInfo(name, data, true);
    assertCurrent();
    const verifiedData = (await wi.loadWorldInfo(name)) || data;
    const verification = pauseManagedEntries(verifiedData, chatKey);
    if (verification.changed) {
        await wi.saveWorldInfo(name, verifiedData, true);
        assertCurrent();
    }
    const rendered = await reloadWorldInfoEditor(wi, name);
    assertCurrent();
    if (rendered) {
        const postReloadData = (await wi.loadWorldInfo(name)) || verifiedData;
        const postReloadVerification = pauseManagedEntries(postReloadData, chatKey);
        if (postReloadVerification.changed) {
            await wi.saveWorldInfo(name, postReloadData, true);
            assertCurrent();
            await reloadWorldInfoEditor(wi, name, true);
            assertCurrent();
            const finalData = (await wi.loadWorldInfo(name)) || postReloadData;
            const finalVerification = pauseManagedEntries(finalData, chatKey);
            if (finalVerification.changed) {
                await wi.saveWorldInfo(name, finalData, true);
                assertCurrent();
                throw new Error('世界书暂停刷新后持续回写旧缓存，已修正入库但界面未能稳定刷新');
            }
        }
    }
    return first.managed;
}
async function clearCurrentChatLorebookEntries(chatKey = currentChatKey()) {
    assertChatCommitCurrent(chatKey, '聊天已切换，停止清理旧聊天世界书');
    const names = await knownLorebookNamesForChat(chatKey);
    if (!names.length)
        return 0;
    return withLorebookMutations(names, async () => {
        const wi = await worldInfoApi();
        let removed = 0;
        for (const name of names)
            removed += await clearManagedEntriesInBook(wi, name, chatKey);
        return removed;
    });
}
async function pauseCurrentChatLorebookEntries(chatKey = currentChatKey()) {
    assertChatCommitCurrent(chatKey, '聊天已切换，停止暂停旧聊天世界书');
    const names = await knownLorebookNamesForChat(chatKey);
    if (!names.length)
        return 0;
    return withLorebookMutations(names, async () => {
        const wi = await worldInfoApi();
        let managed = 0;
        for (const name of names)
            managed += await pauseManagedEntriesInBook(wi, name, chatKey);
        return managed;
    });
}

}
};
__defs["pipeline/pipeline.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"LEGACY_MODULE_NAME",{enumerable:true,configurable:true,get:()=>__require("constants.js")["LEGACY_MODULE_NAME"]});
Object.defineProperty(__scope,"MODULE_NAME",{enumerable:true,configurable:true,get:()=>__require("constants.js")["MODULE_NAME"]});
Object.defineProperty(__scope,"PIPELINE_VERSION",{enumerable:true,configurable:true,get:()=>__require("constants.js")["PIPELINE_VERSION"]});
Object.defineProperty(__scope,"assertArtifactCommitCurrent",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["assertArtifactCommitCurrent"]});
Object.defineProperty(__scope,"assertHistoryRevisionCurrent",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["assertHistoryRevisionCurrent"]});
Object.defineProperty(__scope,"bindArtifactHistoryRevision",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["bindArtifactHistoryRevision"]});
Object.defineProperty(__scope,"bindArtifactTaskGuard",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["bindArtifactTaskGuard"]});
Object.defineProperty(__scope,"CommitRejectedError",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["CommitRejectedError"]});
Object.defineProperty(__scope,"currentHistoryRevision",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["currentHistoryRevision"]});
Object.defineProperty(__scope,"invalidateHistoryRevision",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["invalidateHistoryRevision"]});
Object.defineProperty(__scope,"persistChatFor",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["persistChatFor"]});
Object.defineProperty(__scope,"persistMetadataFor",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["persistMetadataFor"]});
Object.defineProperty(__scope,"unbindArtifactHistoryRevision",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["unbindArtifactHistoryRevision"]});
Object.defineProperty(__scope,"unbindArtifactTaskGuard",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["unbindArtifactTaskGuard"]});
Object.defineProperty(__scope,"currentChatKey",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["currentChatKey"]});
Object.defineProperty(__scope,"getChat",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getChat"]});
Object.defineProperty(__scope,"getChatMetadataNamespace",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getChatMetadataNamespace"]});
Object.defineProperty(__scope,"getContext",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getContext"]});
Object.defineProperty(__scope,"getMessage",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getMessage"]});
Object.defineProperty(__scope,"getSettings",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getSettings"]});
Object.defineProperty(__scope,"isProcessableAssistantMessage",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["isProcessableAssistantMessage"]});
Object.defineProperty(__scope,"latestAssistantIndex",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["latestAssistantIndex"]});
Object.defineProperty(__scope,"messageFingerprint",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["messageFingerprint"]});
Object.defineProperty(__scope,"messageIdentity",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["messageIdentity"]});
Object.defineProperty(__scope,"toast",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["toast"]});
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
Object.defineProperty(__scope,"toErrorMessage",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["toErrorMessage"]});
Object.defineProperty(__scope,"abortActiveAutomaticSummaryRequests",{enumerable:true,configurable:true,get:()=>__require("core/requests.js")["abortActiveAutomaticSummaryRequests"]});
Object.defineProperty(__scope,"abortActiveBusinessRequests",{enumerable:true,configurable:true,get:()=>__require("core/requests.js")["abortActiveBusinessRequests"]});
Object.defineProperty(__scope,"abortActiveRequests",{enumerable:true,configurable:true,get:()=>__require("core/requests.js")["abortActiveRequests"]});
Object.defineProperty(__scope,"attachArtifactToMessage",{enumerable:true,configurable:true,get:()=>__require("domain/artifact.js")["attachArtifactToMessage"]});
Object.defineProperty(__scope,"createArtifact",{enumerable:true,configurable:true,get:()=>__require("domain/artifact.js")["createArtifact"]});
Object.defineProperty(__scope,"getAttachedArtifact",{enumerable:true,configurable:true,get:()=>__require("domain/artifact.js")["getAttachedArtifact"]});
Object.defineProperty(__scope,"markStage",{enumerable:true,configurable:true,get:()=>__require("domain/artifact.js")["markStage"]});
Object.defineProperty(__scope,"firstInconsistentArtifactIndex",{enumerable:true,configurable:true,get:()=>__require("domain/history.js")["firstInconsistentArtifactIndex"]});
Object.defineProperty(__scope,"beginHistoryRecovery",{enumerable:true,configurable:true,get:()=>__require("workflow/history-workflow.js")["beginHistoryRecovery"]});
Object.defineProperty(__scope,"chooseHistoryWorkflowStart",{enumerable:true,configurable:true,get:()=>__require("workflow/history-workflow.js")["chooseHistoryRecalculationStart"]});
Object.defineProperty(__scope,"completeHistoryWorkflow",{enumerable:true,configurable:true,get:()=>__require("workflow/history-workflow.js")["completeHistoryWorkflow"]});
Object.defineProperty(__scope,"failHistoryRecovery",{enumerable:true,configurable:true,get:()=>__require("workflow/history-workflow.js")["failHistoryRecovery"]});
Object.defineProperty(__scope,"historyBlockedMessage",{enumerable:true,configurable:true,get:()=>__require("workflow/history-workflow.js")["historyBlockedMessage"]});
Object.defineProperty(__scope,"interruptHistoryRecovery",{enumerable:true,configurable:true,get:()=>__require("workflow/history-workflow.js")["interruptHistoryRecovery"]});
Object.defineProperty(__scope,"invalidateHistoryWorkflow",{enumerable:true,configurable:true,get:()=>__require("workflow/history-workflow.js")["invalidateHistoryWorkflow"]});
Object.defineProperty(__scope,"markHistoryRecoveryPartial",{enumerable:true,configurable:true,get:()=>__require("workflow/history-workflow.js")["markHistoryRecoveryPartial"]});
Object.defineProperty(__scope,"readHistoryWorkflow",{enumerable:true,configurable:true,get:()=>__require("workflow/history-workflow.js")["readHistoryWorkflow"]});
Object.defineProperty(__scope,"resolveLatestHistoryLock",{enumerable:true,configurable:true,get:()=>__require("workflow/history-workflow.js")["resolveLatestHistoryInvalidation"]});
Object.defineProperty(__scope,"setHistoryPauseError",{enumerable:true,configurable:true,get:()=>__require("workflow/history-workflow.js")["setHistoryPauseError"]});
Object.defineProperty(__scope,"updateHistoryRecovery",{enumerable:true,configurable:true,get:()=>__require("workflow/history-workflow.js")["updateHistoryRecovery"]});
Object.defineProperty(__scope,"invalidateFactsAfterMessages",{enumerable:true,configurable:true,get:()=>__require("domain/internal-facts.js")["invalidateFactsAfterMessages"]});
Object.defineProperty(__scope,"mergeInternalFacts",{enumerable:true,configurable:true,get:()=>__require("domain/internal-facts.js")["mergeInternalFacts"]});
Object.defineProperty(__scope,"normalizeInternalFacts",{enumerable:true,configurable:true,get:()=>__require("domain/internal-facts.js")["normalizeInternalFacts"]});
Object.defineProperty(__scope,"applyAuditFailureAction",{enumerable:true,configurable:true,get:()=>__require("pipeline/audit.js")["applyAuditFailureAction"]});
Object.defineProperty(__scope,"runAudit",{enumerable:true,configurable:true,get:()=>__require("pipeline/audit.js")["runAudit"]});
Object.defineProperty(__scope,"runRevisionFlow",{enumerable:true,configurable:true,get:()=>__require("pipeline/revision.js")["runRevisionFlow"]});
Object.defineProperty(__scope,"applyLorebookMaintenanceForArtifact",{enumerable:true,configurable:true,get:()=>__require("pipeline/lorebook.js")["applyLorebookMaintenance"]});
Object.defineProperty(__scope,"clearCurrentChatLorebookEntries",{enumerable:true,configurable:true,get:()=>__require("pipeline/lorebook.js")["clearCurrentChatLorebookEntries"]});
Object.defineProperty(__scope,"pauseCurrentChatLorebookEntries",{enumerable:true,configurable:true,get:()=>__require("pipeline/lorebook.js")["pauseCurrentChatLorebookEntries"]});
Object.defineProperty(__scope,"previewLorebookMaintenanceForArtifact",{enumerable:true,configurable:true,get:()=>__require("pipeline/lorebook.js")["previewLorebookMaintenance"]});
Object.defineProperty(__scope,"restoreSuppressedLorebookEntryForArtifact",{enumerable:true,configurable:true,get:()=>__require("pipeline/lorebook.js")["restoreSuppressedLorebookEntry"]});
Object.defineProperty(__scope,"syncLorebook",{enumerable:true,configurable:true,get:()=>__require("pipeline/lorebook.js")["syncLorebook"]});
Object.defineProperty(__scope,"hasEligibleLargeSummary",{enumerable:true,configurable:true,get:()=>__require("pipeline/summary.js")["hasEligibleLargeSummary"]});
Object.defineProperty(__scope,"hasEligibleSmallSummary",{enumerable:true,configurable:true,get:()=>__require("pipeline/summary.js")["hasEligibleSmallSummary"]});
Object.defineProperty(__scope,"maybeRunSummaries",{enumerable:true,configurable:true,get:()=>__require("pipeline/summary.js")["maybeRunSummaries"]});
Object.defineProperty(__scope,"rebuildEligibleSummaries",{enumerable:true,configurable:true,get:()=>__require("pipeline/summary.js")["rebuildEligibleSummaries"]});
Object.defineProperty(__scope,"runSummaryStage",{enumerable:true,configurable:true,get:()=>__require("pipeline/summary.js")["runSummaryStage"]});
Object.defineProperty(__scope,"runStateExtraction",{enumerable:true,configurable:true,get:()=>__require("pipeline/state.js")["runStateExtraction"]});
Object.defineProperty(__scope,"TaskBlockedError",{enumerable:true,configurable:true,get:()=>__require("pipeline/task-queue.js")["TaskBlockedError"]});
Object.defineProperty(__scope,"TaskSkippedError",{enumerable:true,configurable:true,get:()=>__require("pipeline/task-queue.js")["TaskSkippedError"]});
Object.defineProperty(__scope,"taskQueue",{enumerable:true,configurable:true,get:()=>__require("pipeline/task-queue.js")["taskQueue"]});
Object.defineProperty(__scope,"emptyChatState",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["emptyChatState"]});
Object.defineProperty(__scope,"getChatState",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["getChatState"]});
Object.defineProperty(__scope,"putArtifact",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["putArtifact"]});
Object.defineProperty(__scope,"putChatState",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["putChatState"]});
Object.defineProperty(__scope,"resolveHostControl",{enumerable:true,configurable:true,get:()=>__require("domain/host-control.js")["resolveHostControl"]});
Object.defineProperty(__scope,"createPlayerRecordingBoundary",{enumerable:true,configurable:true,get:()=>__require("domain/recording-boundary.js")["createPlayerRecordingBoundary"]});
Object.defineProperty(__scope,"messageInsideRecordingBoundary",{enumerable:true,configurable:true,get:()=>__require("domain/recording-boundary.js")["messageInsideRecordingBoundary"]});
Object.defineProperty(__scope,"recordingStartIndex",{enumerable:true,configurable:true,get:()=>__require("domain/recording-boundary.js")["recordingStartIndex"]});
Object.defineProperty(__scope,"advanceRuntimeV2",{enumerable:true,configurable:true,get:()=>__require("runtime-v2/orchestrator.js")["advanceRuntimeV2"]});
Object.defineProperty(__scope,"ensureRuntimeJob",{enumerable:true,configurable:true,get:()=>__require("runtime-v2/orchestrator.js")["ensureRuntimeJob"]});
Object.defineProperty(__scope,"markRuntimeJobDone",{enumerable:true,configurable:true,get:()=>__require("runtime-v2/orchestrator.js")["markRuntimeJobDone"]});
Object.defineProperty(__scope,"markRuntimeJobFailed",{enumerable:true,configurable:true,get:()=>__require("runtime-v2/orchestrator.js")["markRuntimeJobFailed"]});
Object.defineProperty(__scope,"markRuntimeJobRunning",{enumerable:true,configurable:true,get:()=>__require("runtime-v2/orchestrator.js")["markRuntimeJobRunning"]});
Object.defineProperty(__scope,"normalizeRuntimeV2",{enumerable:true,configurable:true,get:()=>__require("runtime-v2/state.js")["normalizeRuntimeV2"]});
with(__scope){
Object.defineProperty(exports,"reconcileInterruptedRuntimeState",{enumerable:true,configurable:true,get:()=>reconcileInterruptedRuntimeState});
Object.defineProperty(exports,"resumeRuntimeOutbox",{enumerable:true,configurable:true,get:()=>resumeRuntimeOutbox});
Object.defineProperty(exports,"processMessage",{enumerable:true,configurable:true,get:()=>processMessage});
Object.defineProperty(exports,"invalidateHistory",{enumerable:true,configurable:true,get:()=>invalidateHistory});
Object.defineProperty(exports,"recalculateInvalidatedHistory",{enumerable:true,configurable:true,get:()=>recalculateInvalidatedHistory});
Object.defineProperty(exports,"chooseHistoryRecalculationStart",{enumerable:true,configurable:true,get:()=>chooseHistoryRecalculationStart});
Object.defineProperty(exports,"retryStage",{enumerable:true,configurable:true,get:()=>retryStage});
Object.defineProperty(exports,"previewLorebookMaintenance",{enumerable:true,configurable:true,get:()=>previewLorebookMaintenance});
Object.defineProperty(exports,"applyLorebookMaintenance",{enumerable:true,configurable:true,get:()=>applyLorebookMaintenance});
Object.defineProperty(exports,"forceSummary",{enumerable:true,configurable:true,get:()=>forceSummary});
Object.defineProperty(exports,"beginPlayRecording",{enumerable:true,configurable:true,get:()=>beginPlayRecording});
Object.defineProperty(exports,"restoreSuppressedLorebookEntry",{enumerable:true,configurable:true,get:()=>restoreSuppressedLorebookEntry});
Object.defineProperty(exports,"resetCurrentGame",{enumerable:true,configurable:true,get:()=>resetCurrentGame});
Object.defineProperty(exports,"subscribePipeline",{enumerable:true,configurable:true,get:()=>subscribePipeline});
Object.defineProperty(exports,"scheduleMessage",{enumerable:true,configurable:true,get:()=>scheduleMessage});
Object.defineProperty(exports,"getArtifactAt",{enumerable:true,configurable:true,get:()=>getArtifactAt});
Object.defineProperty(exports,"latestArtifact",{enumerable:true,configurable:true,get:()=>latestArtifact});
Object.defineProperty(exports,"latestSnapshotArtifact",{enumerable:true,configurable:true,get:()=>latestSnapshotArtifact});
Object.defineProperty(exports,"installPipelineEventHandlers",{enumerable:true,configurable:true,get:()=>installPipelineEventHandlers});
/**
 * 模块职责：镜渊业务主链：触发、审核、修正、状态提交、派生排队、历史失效与重算。
 * 维护边界：事实与状态必须先提交；总结和世界书失败不得回滚核心结果。
 */
const listeners = new Set();
const scheduledMessageTimers = new Map();
function removeSourceListener(source, event, handler) {
    if (typeof source?.off === 'function')
        source.off(event, handler);
    else
        source?.removeListener?.(event, handler);
}
function cancelScheduledMessagesForChat(chatKey) {
    let cancelled = 0;
    for (const [key, timer] of scheduledMessageTimers) {
        if (!key.startsWith(`${chatKey}:`))
            continue;
        window.clearTimeout(timer);
        scheduledMessageTimers.delete(key);
        cancelled += 1;
    }
    return cancelled;
}
function cancelScheduledMessagesOutsideChat(chatKey) {
    let cancelled = 0;
    for (const [key, timer] of scheduledMessageTimers) {
        if (key.startsWith(`${chatKey}:`))
            continue;
        window.clearTimeout(timer);
        scheduledMessageTimers.delete(key);
        cancelled += 1;
    }
    return cancelled;
}
const INTERRUPTED_STAGE_MESSAGE = '页面刷新、插件重启或聊天切换中断了旧任务，请从失败阶段继续';
/**
 * 运行时任务不会跨页面刷新或插件重启继续执行。进入一个聊天时，把持久化的 queued/running
 * 还原为可重试终态，避免 UI 永久显示“正在处理”；正式事实、状态和世界书凭证保持不变。
 */
async function reconcileInterruptedRuntimeState(reason = INTERRUPTED_STAGE_MESSAGE) {
    const chatKey = currentChatKey();
    const chat = getChat();
    let changedArtifacts = 0;
    let firstChangedIndex = chat.length;
    for (let index = 0; index < chat.length; index += 1) {
        const artifact = getAttachedArtifact(chat[index]);
        if (!artifact || artifact.chatKey !== chatKey)
            continue;
        let changed = false;
        for (const stage of ['audit', 'revision', 'state', 'summary', 'sync']) {
            const status = artifact.stages?.[stage]?.status;
            if (status !== 'queued' && status !== 'running')
                continue;
            markStage(artifact, stage, 'cancelled', reason);
            changed = true;
        }
        if (changed) {
            changedArtifacts += 1;
            firstChangedIndex = Math.min(firstChangedIndex, index);
        }
    }
    if (changedArtifacts) {
        await persistChatFor(chatKey);
        notifyFrom(firstChangedIndex);
    }
    const chatState = await getChatState(chatKey);
    const interruptedRecovery = interruptHistoryRecovery(chatState, reason);
    const runtime = normalizeRuntimeV2(chatState.runtimeV2);
    let runtimeChanged = false;
    for (const job of runtime.outbox) {
        if (job.status !== 'running')
            continue;
        job.status = 'pending';
        job.startedAt = '';
        job.finishedAt = '';
        job.error = reason;
        runtimeChanged = true;
    }
    if (runtime.machines.publication.status === 'writing') {
        runtime.machines.publication.status = 'queued';
        runtime.machines.publication.lastError = reason;
        runtimeChanged = true;
    }
    if (runtimeChanged) {
        runtime.updatedAt = nowIso();
        chatState.runtimeV2 = runtime;
    }
    if (interruptedRecovery || runtimeChanged)
        await putChatState(chatState);
    return { artifacts: changedArtifacts, historyRecovery: interruptedRecovery, runtimeOutboxRecovered: runtimeChanged };
}
function subscribePipeline(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
function notify(index, artifact) {
    for (const listener of listeners) {
        try {
            listener(index, artifact);
        }
        catch (error) {
            console.warn('[MirrorAbyss] pipeline listener failed', error);
        }
    }
}
function notifyFrom(startIndex) {
    for (let index = Math.max(0, startIndex); index < getChat().length; index += 1) {
        notify(index, getAttachedArtifact(getMessage(index)));
    }
}
function resolveMessageIndex(payload) {
    if (Number.isInteger(payload))
        return Number(payload);
    const candidates = [payload?.messageId, payload?.message_id, payload?.mesId, payload?.mesid, payload?.index];
    for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && Number.isInteger(Number(candidate)))
            return Number(candidate);
    }
    const chat = getChat();
    const direct = chat.indexOf(payload);
    if (direct >= 0)
        return direct;
    const nested = payload?.message;
    const nestedIndex = nested ? chat.indexOf(nested) : -1;
    return nestedIndex >= 0 ? nestedIndex : -1;
}
function resolveChangedIndex(payload) {
    if (Number.isInteger(payload))
        return Number(payload);
    const candidates = [payload?.messageId, payload?.message_id, payload?.mesId, payload?.mesid, payload?.index];
    for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && Number.isInteger(Number(candidate)))
            return Number(candidate);
    }
    const chat = getChat();
    const direct = chat.indexOf(payload);
    if (direct >= 0)
        return direct;
    const nested = payload?.message;
    const nestedIndex = nested ? chat.indexOf(nested) : -1;
    return nestedIndex >= 0 ? nestedIndex : null;
}
/**
 * SillyTavern 可能在正文后插入非叙事系统消息。自动恢复判断只看是否还有后续玩家/角色正文，
 * 不能机械要求目标消息恰好是 chat 数组最后一项。
 */
function isNarrativeTail(index) {
    if (index < 0 || index !== latestAssistantIndex())
        return false;
    return !getChat().slice(index + 1).some((message) => message?.is_user === true || isProcessableAssistantMessage(message));
}
async function pauseLorebookForHistoryChange(chatKey) {
    try {
        await pauseCurrentChatLorebookEntries(chatKey);
        const state = await getChatState(chatKey);
        if (readHistoryWorkflow(state).pauseError) {
            setHistoryPauseError(state);
            await putChatState(state);
        }
    }
    catch (error) {
        const detail = toErrorMessage(error);
        console.warn('[MirrorAbyss] failed to pause stale lorebook entries', error);
        const state = await getChatState(chatKey);
        if (readHistoryWorkflow(state).invalidation) {
            setHistoryPauseError(state, detail);
            await putChatState(state);
        }
        toast('warning', `历史数据已暂停，但世界书条目暂停失败：${detail}。请避免继续生成并手动重试历史重算`);
    }
}
async function saveArtifactToMessage(index, artifact) {
    assertArtifactCommitCurrent(artifact);
    const message = getMessage(index);
    if (!message || message.is_user)
        throw new Error('原AI正文已不存在，请重新整理');
    attachArtifactToMessage(message, artifact);
    await putArtifact(artifact);
    await persistChatFor(artifact.chatKey);
    notify(index, artifact);
}
async function loadOrCreateArtifact(index, _force, historyRevision, taskGuard) {
    const message = getMessage(index);
    if (!isProcessableAssistantMessage(message))
        throw new Error('目标不是有效AI正文');
    const fingerprint = messageFingerprint(index);
    let artifact = getAttachedArtifact(message);
    try {
        if (!artifact || artifact.chatKey !== currentChatKey() || artifact.sourceFingerprint !== fingerprint) {
            artifact = createArtifact(message, index);
        }
        if (historyRevision !== undefined)
            bindArtifactHistoryRevision(artifact, historyRevision);
        if (taskGuard)
            bindArtifactTaskGuard(artifact, taskGuard);
        assertArtifactCommitCurrent(artifact);
        attachArtifactToMessage(message, artifact);
        // 创建/绑定 artifact 不是业务提交点。失败与成功终态由后续检查点统一保存，
        // 避免模型调用前先写入一个没有新增业务结果的空壳 artifact。
        artifact.stages.revision ||= { status: 'idle', attempts: 0 };
        return artifact;
    }
    catch (error) {
        if (artifact && historyRevision !== undefined)
            unbindArtifactHistoryRevision(artifact, historyRevision);
        if (artifact && taskGuard)
            unbindArtifactTaskGuard(artifact, taskGuard);
        throw error;
    }
}
/**
 * 核心提交只包含内部事实、动态可见视图及消息 artifact。该步骤成功后才允许排队总结和世界书。
 */
async function commitCoreState(artifact, resolveLatestHistoryInvalidation = false) {
    if (!artifact.snapshot || artifact.stages.state.status !== 'success') {
        throw new Error('状态表尚未成功，不能提交核心结果');
    }
    assertArtifactCommitCurrent(artifact);
    const chatState = await getChatState(artifact.chatKey);
    if (!chatState.processedMessageKeys.includes(artifact.messageKey)) {
        chatState.processedMessageKeys.push(artifact.messageKey);
    }
    if (artifact.factPackage?.facts?.length) {
        const incomingFacts = normalizeInternalFacts(artifact.factPackage.facts, artifact.messageKey);
        chatState.internalFacts = mergeInternalFacts(chatState.internalFacts ?? [], incomingFacts, artifact.factPackage.facts);
    }
    chatState.latestSnapshotMessageKey = artifact.messageKey;
    if (resolveLatestHistoryInvalidation && isNarrativeTail(artifact.messageIndex)) {
        resolveLatestHistoryLock(chatState, artifact.messageIndex);
    }
    const settings = getSettings();
    const runtime = advanceRuntimeV2({
        chatState,
        artifact,
        settings,
        smallEligible: Boolean(settings.autoSmallSummary && hasEligibleSmallSummary(
            chatState.internalFacts ?? [],
            settings.smallSummaryTurns,
            artifact.sceneBoundary?.eventIds ?? [],
        )),
        largeEligible: Boolean(settings.autoLargeSummary && hasEligibleLargeSummary(
            chatState.smallSummaries ?? [],
            chatState.largeSummaries ?? [],
            settings.largeSummaryCount,
        )),
    });
    artifact.runtimeV2 = {
        revision: runtime.runtime.revision,
        plan: runtime.plan,
        narrativeContext: structuredClone(runtime.runtime.narrativeContext),
    };
    chatState.updatedAt = nowIso();
    assertArtifactCommitCurrent(artifact);
    await putChatState(chatState);
    // 状态 artifact 已在进入核心提交前保存；这里仅提交 ChatState，
    // 避免同一状态结果连续保存两次聊天，并把已提交状态直接传给派生计划。
    return chatState;
}
/**
 * 状态表成功后立即把派生阶段标成 queued/skipped，避免 UI 在后台任务已经排队时仍显示 idle。
 */
function invalidateDerivedForValidMessages(chatState, validMessageIds) {
    const currentFacts = Array.isArray(chatState.internalFacts) ? chatState.internalFacts : [];
    const allFactIds = new Set(currentFacts.map((fact) => String(fact.factId || '')));
    const invalidated = invalidateFactsAfterMessages(currentFacts, validMessageIds);
    chatState.internalFacts = invalidated.facts;
    const invalidSmallIds = new Set();
    for (const summary of chatState.smallSummaries ?? []) {
        const sourceFactIds = Array.isArray(summary.sourceFactIds) ? summary.sourceFactIds : [];
        const factInvalid = sourceFactIds.some((id) => invalidated.removedFactIds.has(id));
        const legacyInvalid = (summary.sourceKeys ?? []).some((key) => {
            if (allFactIds.has(key))
                return invalidated.removedFactIds.has(key);
            return !validMessageIds.has(key);
        });
        if (factInvalid || legacyInvalid)
            invalidSmallIds.add(summary.id);
    }
    chatState.smallSummaries = (chatState.smallSummaries ?? []).filter((summary) => !invalidSmallIds.has(summary.id));
    const invalidLargeIds = new Set();
    for (const summary of chatState.largeSummaries ?? []) {
        const sources = summary.sourceSummaryIds ?? summary.sourceKeys ?? [];
        if (sources.some((id) => invalidSmallIds.has(id)) || (summary.previousLargeSummaryId && invalidLargeIds.has(summary.previousLargeSummaryId))) {
            invalidLargeIds.add(summary.id);
        }
    }
    chatState.largeSummaries = (chatState.largeSummaries ?? []).filter((summary) => !invalidLargeIds.has(summary.id));
    for (const summary of chatState.smallSummaries ?? []) {
        if (summary.solidifiedByLargeSummaryId && invalidLargeIds.has(summary.solidifiedByLargeSummaryId))
            delete summary.solidifiedByLargeSummaryId;
    }
    for (const fact of chatState.internalFacts) {
        if (fact.consumedBySmallSummaryId && invalidSmallIds.has(fact.consumedBySmallSummaryId))
            delete fact.consumedBySmallSummaryId;
        if (fact.solidifiedByLargeSummaryId && invalidLargeIds.has(fact.solidifiedByLargeSummaryId))
            delete fact.solidifiedByLargeSummaryId;
    }
}
async function prepareDerivedStageStatuses(artifact, chatState) {
    const settings = getSettings();
    const summaryKind = artifact.runtimeV2?.plan?.summaryKind || '';
    const runtimePlan = artifact.runtimeV2?.plan ?? {};
    const plan = {
        small: summaryKind === 'small',
        large: summaryKind === 'large',
        summaryKind,
        summaryJobId: String(runtimePlan.summaryJobId || ''),
        syncJobId: String(runtimePlan.syncJobId || ''),
    };
    markStage(artifact, 'summary', plan.small || plan.large ? 'queued' : 'skipped');
    const historyWorkflow = readHistoryWorkflow(chatState);
    if (historyWorkflow.blocked) {
        const automatic = historyWorkflow.automatic;
        markStage(artifact, 'sync', 'blocked', automatic ? '最新正文正在自动重建，完成后将继续同步' : '历史消息已变化，等待手动重算');
    }
    else {
        markStage(artifact, 'sync', resolveHostControl(settings).lorebook ? 'queued' : 'skipped');
    }
    await saveArtifactToMessage(artifact.messageIndex, artifact);
    return plan;
}
/**
 * 只允许“最新一条 AI 正文自身发生编辑/swipe”在用户显式重新整理成功后解除历史暂停。
 * 更早位置、删除位置未知或当前消息后仍有新消息时，继续要求完整历史重算。
 */
/**
 * 正文被单独修正后，旧状态与旧总结已不再对应当前正文；先清除并暂停世界书，等待用户点击“生成表格”。
 */
async function invalidateCoreAfterManualRevision(artifact, previousMessageKey) {
    const chatState = await getChatState(artifact.chatKey);
    const validMessageIds = new Set(chatState.processedMessageKeys.filter((key) => key !== previousMessageKey));
    invalidateDerivedForValidMessages(chatState, validMessageIds);
    chatState.processedMessageKeys = [...validMessageIds];
    if (chatState.latestSnapshotMessageKey === previousMessageKey) {
        chatState.latestSnapshotMessageKey = chatState.processedMessageKeys.at(-1);
    }
    artifact.factPackage = undefined;
    artifact.snapshot = undefined;
    markStage(artifact, 'state', 'idle');
    markStage(artifact, 'summary', 'idle');
    markStage(artifact, 'sync', 'blocked', '正文已修正，等待重新生成表格');
    await putChatState(chatState);
    await saveArtifactToMessage(artifact.messageIndex, artifact);
    try {
        await pauseCurrentChatLorebookEntries(artifact.chatKey);
    }
    catch (error) {
        const detail = toErrorMessage(error);
        console.warn('[MirrorAbyss] revised text saved but stale lorebook pause failed', error);
        markStage(artifact, 'sync', 'failed', `旧世界书条目暂停失败：${detail}`);
        await saveArtifactToMessage(artifact.messageIndex, artifact);
        toast('warning', `正文已修正，但旧世界书条目暂停失败：${detail}。请在生成表格后手动同步世界书`);
    }
}
function derivedTaskError(error) {
    return error instanceof CommitRejectedError
        || error instanceof TaskBlockedError
        || error instanceof TaskSkippedError
        || (error instanceof Error && ['AbortError', 'TaskBlockedError', 'TaskSkippedError'].includes(error.name));
}
function cancelledDerivedCanFallBackToSync(error, chatKey, historyRevision) {
    return error instanceof Error
        && error.name === 'AbortError'
        && currentChatKey() === chatKey
        && currentHistoryRevision(chatKey) === historyRevision
        && getSettings().enabled;
}
/**
 * 派生链按小总结 → 大总结 → 世界书单向排队。每一段独立失败，不回滚核心状态。
 */
function queueAutomaticDerived(index, artifact, historyRevision, summaryPlan) {
    const chatKey = artifact.chatKey;
    const messageKey = artifact.messageKey;
    const runWithGuards = async (guard, work) => {
        if (currentChatKey() !== chatKey)
            throw new CommitRejectedError('聊天已切换，旧派生任务不再运行');
        assertHistoryRevisionCurrent(chatKey, historyRevision);
        bindArtifactHistoryRevision(artifact, historyRevision);
        bindArtifactTaskGuard(artifact, guard);
        try {
            assertArtifactCommitCurrent(artifact);
            await work();
            assertArtifactCommitCurrent(artifact);
        }
        finally {
            unbindArtifactTaskGuard(artifact, guard);
            unbindArtifactHistoryRevision(artifact, historyRevision);
        }
    };
    const updateRuntime = async (type, status, error = '') => {
        const state = await getChatState(chatKey);
        const jobId = type === 'lorebook-sync' ? summaryPlan.syncJobId : summaryPlan.summaryJobId;
        if (status === 'running')
            markRuntimeJobRunning(state, type, messageKey, jobId);
        else if (status === 'done')
            markRuntimeJobDone(state, type, artifact, jobId);
        else
            markRuntimeJobFailed(state, type, messageKey, error, jobId);
        await putChatState(state);
    };
    const queueSync = () => {
        if (currentChatKey() !== chatKey || currentHistoryRevision(chatKey) !== historyRevision || !getSettings().enabled)
            return;
        if (!resolveHostControl(getSettings()).lorebook)
            return;
        const key = `${PIPELINE_VERSION}:runtime-v2:sync:${chatKey}:${messageKey}`;
        void taskQueue.run(key, `后台同步第 ${index + 1} 条正文世界书`, 'sync', async (guard) => {
            await runWithGuards(guard, async () => {
                await updateRuntime('lorebook-sync', 'running');
                try {
                    await syncLorebook(artifact);
                    await updateRuntime('lorebook-sync', 'done');
                }
                catch (error) {
                    await updateRuntime('lorebook-sync', 'failed', toErrorMessage(error));
                    throw error;
                }
                finally {
                    await saveArtifactToMessage(index, artifact);
                }
            });
        }, {
            priority: 40,
            chatKey,
            triggerSource: 'runtime-v2-sync',
            messageKey,
            messageFingerprint: artifact.sourceFingerprint,
            historyRevisionAtEnqueue: historyRevision,
            automatic: true,
        }).catch((error) => {
            if (derivedTaskError(error))
                return;
            console.warn('[MirrorAbyss] runtime-v2 lorebook sync failed', error);
            toast('warning', `核心状态已保存，但世界书投影失败：${toErrorMessage(error)}`);
        });
    };
    const kind = summaryPlan.summaryKind || (summaryPlan.small ? 'small' : summaryPlan.large ? 'large' : '');
    if (!kind) {
        queueSync();
        return;
    }
    const jobType = `${kind}-summary`;
    const key = `${PIPELINE_VERSION}:runtime-v2:${kind}:${chatKey}:${messageKey}`;
    void taskQueue.run(key, `后台生成第 ${index + 1} 条正文${kind === 'small' ? '小' : '大'}总结`, kind === 'small' ? 'smallSummary' : 'largeSummary', async (guard) => {
        await runWithGuards(guard, async () => {
            await updateRuntime(jobType, 'running');
            try {
                await runSummaryStage(artifact, kind);
                await updateRuntime(jobType, 'done');
            }
            catch (error) {
                await updateRuntime(jobType, 'failed', toErrorMessage(error));
                throw error;
            }
            finally {
                await saveArtifactToMessage(index, artifact);
            }
        });
    }, {
        priority: kind === 'small' ? 30 : 20,
        chatKey,
        triggerSource: `runtime-v2-${kind}-summary`,
        messageKey,
        messageFingerprint: artifact.sourceFingerprint,
        historyRevisionAtEnqueue: historyRevision,
        automatic: true,
    }).then(() => {
        if (summaryPlan.resumeLatestSync)
            void resumeRuntimeOutbox();
        else
            queueSync();
    }, (error) => {
        if (derivedTaskError(error)) {
            if (cancelledDerivedCanFallBackToSync(error, chatKey, historyRevision)) {
                if (summaryPlan.resumeLatestSync)
                    void resumeRuntimeOutbox();
                else
                    queueSync();
            }
            return;
        }
        console.warn(`[MirrorAbyss] runtime-v2 ${kind} summary failed`, error);
        toast('warning', `核心状态已保存，但${kind === 'small' ? '小' : '大'}总结失败：${toErrorMessage(error)}`);
        if (currentChatKey() === chatKey && currentHistoryRevision(chatKey) === historyRevision && getSettings().enabled) {
            if (summaryPlan.resumeLatestSync)
                void resumeRuntimeOutbox();
            else
                queueSync();
        }
    });
}

async function resumeRuntimeOutbox() {
    if (!getSettings().enabled)
        return { resumed: false, reason: 'disabled' };
    const chatKey = currentChatKey();
    const state = await getChatState(chatKey);
    let runtime = normalizeRuntimeV2(state.runtimeV2);
    const chat = getChat();
    const artifactForTurnKey = (turnKey) => {
        const index = chat.findIndex((message) => getAttachedArtifact(message)?.messageKey === turnKey);
        return { index, artifact: index >= 0 ? getAttachedArtifact(chat[index]) : null };
    };
    const latest = [...chat].map((message, index) => ({ index, artifact: getAttachedArtifact(message) }))
        .reverse()
        .find((item) => item.artifact?.snapshot && item.artifact?.stages?.state?.status === 'success');
    let stateChanged = JSON.stringify(runtime) !== JSON.stringify(state.runtimeV2);
    let pendingSummary = [...runtime.outbox].reverse().find((job) => ['small-summary', 'large-summary'].includes(job.type) && job.status === 'pending');
    if (!pendingSummary && runtime.machines.summary.pendingKind && runtime.machines.summary.pendingTurnKey) {
        const target = artifactForTurnKey(runtime.machines.summary.pendingTurnKey);
        if (target.artifact?.snapshot && target.artifact.stages?.state?.status === 'success') {
            pendingSummary = ensureRuntimeJob(state, `${runtime.machines.summary.pendingKind}-summary`, target.artifact, runtime.revision);
            runtime = normalizeRuntimeV2(state.runtimeV2);
            stateChanged = true;
        }
    }
    let syncJob = [...runtime.outbox].reverse().find((job) => job.type === 'lorebook-sync' && job.status === 'pending');
    if (!syncJob && runtime.machines.publication.desiredRevision > runtime.machines.publication.confirmedRevision && latest) {
        syncJob = ensureRuntimeJob(state, 'lorebook-sync', latest.artifact, runtime.machines.publication.desiredRevision);
        runtime = normalizeRuntimeV2(state.runtimeV2);
        stateChanged = true;
    }
    if (stateChanged)
        await putChatState(state);
    if (pendingSummary) {
        const target = artifactForTurnKey(pendingSummary.turnKey);
        if (target.artifact?.snapshot && target.artifact.stages?.state?.status === 'success') {
            const pendingSync = [...runtime.outbox].reverse().find((job) => job.type === 'lorebook-sync' && job.status === 'pending');
            queueAutomaticDerived(target.index, target.artifact, currentHistoryRevision(chatKey), {
                small: pendingSummary.type === 'small-summary',
                large: pendingSummary.type === 'large-summary',
                summaryKind: pendingSummary.type === 'small-summary' ? 'small' : 'large',
                summaryJobId: pendingSummary.id,
                syncJobId: '',
                resumeLatestSync: true,
            });
            return { resumed: true, kind: pendingSummary.type, turnKey: pendingSummary.turnKey, jobId: pendingSummary.id };
        }
    }
    if (syncJob && latest) {
        queueAutomaticDerived(latest.index, latest.artifact, currentHistoryRevision(chatKey), {
            small: false,
            large: false,
            summaryKind: '',
            summaryJobId: '',
            syncJobId: syncJob.id,
        });
        return { resumed: true, kind: 'lorebook-sync', turnKey: latest.artifact.messageKey, jobId: syncJob.id };
    }
    return { resumed: false, reason: runtime.outbox.some((job) => job.status === 'pending') ? 'artifact-missing' : 'empty' };
}

function isAutomaticLatestHistoryRecovery(index, chatState) {
    const workflow = readHistoryWorkflow(chatState);
    return Boolean(workflow.invalidation
        && workflow.automatic
        && workflow.startIndex === index
        && workflow.invalidation.reason !== 'deleted'
        && isNarrativeTail(index));
}
/**
 * 处理单条角色正文。force 仅表示显式重新整理，不绕过聊天、历史、任务代次和正文指纹守卫。
 */
async function processMessage(index, force = false, options = {}) {
    if (!getSettings().enabled)
        return null;
    const message = getMessage(index);
    if (!isProcessableAssistantMessage(message))
        return null;
    const identity = messageIdentity(index);
    const scheduledFingerprint = messageFingerprint(index);
    const scheduledChatKey = currentChatKey();
    const scheduledHistoryRevision = currentHistoryRevision(scheduledChatKey);
    const enqueueState = await getChatState(scheduledChatKey);
    if (!messageInsideRecordingBoundary(enqueueState, index)) {
        if (options.automatic)
            return null;
        const startIndex = recordingStartIndex(enqueueState);
        throw new Error(startIndex === undefined
            ? '尚未设置游玩记录起点，请先在镜渊总览点击“开始游玩记录”'
            : `第 ${index + 1} 条消息位于游玩记录起点之前，不会进入镜渊记忆`);
    }
    const enqueueWorkflow = readHistoryWorkflow(enqueueState);
    if (enqueueWorkflow.running && !options.historyRecovery && !options.automatic) {
        const detail = `历史恢复正在执行（${enqueueWorkflow.phase}），本次手动任务未入队`;
        throw new TaskBlockedError(detail);
    }
    const triggerSource = options.triggerSource
        || (options.historyRecovery ? 'history-recovery' : options.automatic ? 'automatic' : force ? 'manual-force' : 'manual');
    const key = `${PIPELINE_VERSION}:${scheduledChatKey}:${identity}`;
    const attachedAtEnqueue = getAttachedArtifact(message);
    const duplicateCommittedAutomatic = Boolean(options.automatic
        && !force
        && !options.historyRecovery
        && attachedAtEnqueue
        && attachedAtEnqueue.chatKey === scheduledChatKey
        && attachedAtEnqueue.sourceFingerprint === scheduledFingerprint
        && attachedAtEnqueue.messageKey === identity
        && attachedAtEnqueue.snapshot
        && attachedAtEnqueue.stages.state.status === 'success'
        && enqueueState.processedMessageKeys.includes(attachedAtEnqueue.messageKey));
    if (!options.historyRecovery && !duplicateCommittedAutomatic) {
        const preempted = taskQueue.cancelActiveMatching((task) => Boolean(task.chatKey === scheduledChatKey
            && task.automatic === true
            && ['smallSummary', 'largeSummary'].includes(String(task.kind))), '检测到新的正文，旧自动总结已暂停并等待后续重新归并');
        if (preempted)
            abortActiveAutomaticSummaryRequests();
    }
    return taskQueue.run(key, `处理第 ${index + 1} 条AI正文`, 'state', async (guard) => {
        const settings = getSettings();
        if (!settings.enabled)
            throw new TaskSkippedError('镜渊已关闭，本次排队任务不再处理');
        if (currentChatKey() !== scheduledChatKey)
            throw new TaskSkippedError('聊天已切换，本次排队任务不再处理');
        guard.assertCurrent();
        assertHistoryRevisionCurrent(scheduledChatKey, scheduledHistoryRevision);
        if (!isProcessableAssistantMessage(getMessage(index)))
            throw new TaskSkippedError('目标正文已不存在或不再符合处理条件');
        if (messageFingerprint(index) !== scheduledFingerprint) {
            throw new CommitRejectedError('正文已经变化，本次排队任务不再处理');
        }
        const processingState = await getChatState(scheduledChatKey);
        const processingWorkflow = readHistoryWorkflow(processingState);
        if (processingWorkflow.running && !options.historyRecovery) {
            const detail = `历史恢复正在执行（${processingWorkflow.phase}），本次普通任务已跳过`;
            if (options.automatic)
                throw new TaskSkippedError(detail);
            throw new TaskBlockedError(detail);
        }
        if (processingWorkflow.blocked) {
            const recoveryAuthorized = Boolean(options.historyRecovery
                && processingWorkflow.recovery
                && index >= Number(processingWorkflow.startIndex ?? index));
            if (!recoveryAuthorized && !isAutomaticLatestHistoryRecovery(index, processingState)) {
                throw new TaskBlockedError(historyBlockedMessage(processingState));
            }
        }
        const attached = getAttachedArtifact(getMessage(index));
        const alreadyCommitted = Boolean(options.automatic
            && !force
            && !options.historyRecovery
            && attached
            && attached.chatKey === scheduledChatKey
            && attached.sourceFingerprint === scheduledFingerprint
            && attached.messageKey === identity
            && attached.snapshot
            && attached.stages.state.status === 'success'
            && processingState.processedMessageKeys.includes(attached.messageKey));
        if (alreadyCommitted) {
            throw new TaskSkippedError('相同正文已由当前流水线正式提交，本次自动任务不再重复处理');
        }
        const artifact = await loadOrCreateArtifact(index, force, scheduledHistoryRevision, guard);
        notify(index, artifact);
        try {
            let audit = await runAudit(artifact, force);
            await saveArtifactToMessage(index, artifact);
            if (!audit.passed && settings.auditFailAction === 'revise') {
                const revised = await runRevisionFlow(artifact);
                audit = revised.audit;
                await saveArtifactToMessage(index, artifact);
            }
            if (!audit.passed) {
                const failureAction = settings.auditFailAction === 'revise'
                    ? settings.revisionFallbackAction
                    : settings.auditFailAction;
                await applyAuditFailureAction(artifact, failureAction);
                markStage(artifact, 'state', 'blocked', '规则审核未通过');
                markStage(artifact, 'summary', 'blocked', '规则审核未通过');
                markStage(artifact, 'sync', 'blocked', '规则审核未通过');
                await saveArtifactToMessage(index, artifact);
                return artifact;
            }
            if (settings.autoState || force) {
                await runStateExtraction(artifact, force);
                await saveArtifactToMessage(index, artifact);
            }
            else {
                if (!artifact.snapshot || artifact.stages.state.status !== 'success') {
                    markStage(artifact, 'state', 'skipped');
                    markStage(artifact, 'summary', 'skipped');
                    markStage(artifact, 'sync', 'skipped');
                }
                await saveArtifactToMessage(index, artifact);
            }
            if (artifact.snapshot && artifact.stages.state.status === 'success') {
                const committedState = await commitCoreState(artifact, !options.historyRecovery);
                const summaryPlan = await prepareDerivedStageStatuses(artifact, committedState);
                if (!options.skipDerived) {
                    taskQueue.cancelPendingDerivedByChatKey(artifact.chatKey);
                    queueAutomaticDerived(index, artifact, scheduledHistoryRevision, summaryPlan);
                }
            }
            return artifact;
        }
        catch (error) {
            const messageText = toErrorMessage(error);
            console.error('[MirrorAbyss] pipeline failed', error);
            if (error instanceof CommitRejectedError) {
                toast('warning', messageText);
                throw error;
            }
            if (error instanceof Error && error.name === 'AbortError')
                throw error;
            // 先把失败阶段推送给 UI，再等待宿主保存；移动端 saveChat 卡顿时不再长时间显示“处理中”。
            notify(index, artifact);
            await saveArtifactToMessage(index, artifact);
            throw error;
        }
        finally {
            unbindArtifactTaskGuard(artifact, guard);
            unbindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
        }
    }, {
        priority: 90,
        chatKey: scheduledChatKey,
        triggerSource,
        messageKey: identity,
        messageFingerprint: scheduledFingerprint,
        historyRevisionAtEnqueue: scheduledHistoryRevision,
        historyRecoveryPhaseAtEnqueue: enqueueWorkflow.phase,
        automatic: options.automatic === true,
    });
}
function scheduleMessage(payload, force = false, delay = 0, triggerSource = 'automatic-event') {
    if (!getSettings().enabled)
        return;
    const index = resolveMessageIndex(payload);
    if (index < 0)
        return;
    const message = getMessage(index);
    if (!isProcessableAssistantMessage(message))
        return;
    const scheduledChatKey = currentChatKey();
    const scheduledIdentity = messageIdentity(index);
    const scheduledFingerprint = messageFingerprint(index);
    const scheduleKey = `${scheduledChatKey}:${scheduledIdentity}`;
    const existingTimer = scheduledMessageTimers.get(scheduleKey);
    if (existingTimer !== undefined)
        window.clearTimeout(existingTimer);
    const timer = window.setTimeout(() => {
        scheduledMessageTimers.delete(scheduleKey);
        void (async () => {
            if (!getSettings().enabled)
                return;
            if (currentChatKey() !== scheduledChatKey)
                return;
            const current = getMessage(index);
            if (!isProcessableAssistantMessage(current))
                return;
            if (messageIdentity(index) !== scheduledIdentity || messageFingerprint(index) !== scheduledFingerprint)
                return;
            const state = await getChatState(scheduledChatKey);
            if (!messageInsideRecordingBoundary(state, index))
                return;
            const workflow = readHistoryWorkflow(state);
            if (workflow.running)
                return;
            const latestOnlyInvalidation = Boolean(workflow.invalidation
                && workflow.startIndex === index
                && workflow.invalidation.reason !== 'deleted'
                && isNarrativeTail(index));
            if (!force && workflow.blocked && !latestOnlyInvalidation)
                return;
            await processMessage(index, force, { automatic: true, triggerSource });
        })().catch((error) => {
            if (error instanceof CommitRejectedError
                || error instanceof TaskSkippedError
                || (error instanceof Error && ['AbortError', 'TaskSkippedError'].includes(error.name)))
                return;
            console.error('[MirrorAbyss] scheduled processing failed', error);
            toast('error', `自动整理失败：${toErrorMessage(error)}`);
        });
    }, delay);
    scheduledMessageTimers.set(scheduleKey, timer);
}
/**
 * 历史变化后保留仍可复用的审核/修正检查点，只把依赖上游连续性的状态、总结和同步标为待重建。
 */
function markArtifactsForHistoryRebuild(startIndex, changedIndex = startIndex) {
    for (let i = startIndex; i < getChat().length; i += 1) {
        const message = getMessage(i);
        const artifact = getAttachedArtifact(message);
        if (!artifact)
            continue;
        if (i === changedIndex && artifact.sourceFingerprint !== messageFingerprint(i)) {
            markStage(artifact, 'audit', 'idle');
            markStage(artifact, 'revision', 'idle');
            artifact.approvedFingerprint = undefined;
        }
        markStage(artifact, 'state', 'blocked', '上游历史已变化，等待按依赖重建');
        markStage(artifact, 'summary', 'blocked', '上游历史已变化，等待按依赖重建');
        markStage(artifact, 'sync', 'blocked', '上游历史已变化，等待按依赖重建');
    }
}
/**
 * 编辑、swipe 或删除会提升历史修订号、取消旧任务并暂停派生发布，等待明确重算。
 */
async function invalidateHistory(payload, reason) {
    if (!getSettings().enabled)
        return;
    const chatKey = currentChatKey();
    const eventIndex = resolveChangedIndex(payload);
    // 新生成的正文没有镜渊检查点，MESSAGE_SWIPED/EDITED 只代表酒馆完成了消息落盘，
    // 不应被误判成“旧历史变化”。否则会先暂停世界书，再与 MESSAGE_RECEIVED 重复启动整条模型链。
    if (reason !== 'deleted' && eventIndex !== null) {
        const message = getMessage(eventIndex);
        const attached = getAttachedArtifact(message);
        if (!attached)
            return;
        if (attached.sourceFingerprint === messageFingerprint(eventIndex))
            return;
    }
    const scannedIndex = firstInconsistentArtifactIndex(getChat(), MODULE_NAME, messageIdentity, messageFingerprint);
    const detectedIndex = eventIndex ?? (scannedIndex === -1 ? null : scannedIndex);
    if (detectedIndex === null && reason !== 'deleted') {
        // 编辑/swipe 事件没有可定位消息，且一致性扫描也未发现旧 artifact 失配；
        // 必须在提升修订号或取消请求之前退出，避免无效事件打断正在运行的自动链。
        console.warn('[MirrorAbyss] ignored unlocatable history event without artifact mismatch', reason, payload);
        return;
    }
    const state = await getChatState(chatKey);
    if (currentChatKey() !== chatKey)
        throw new Error('聊天已切换，历史变化不再写入');
    const boundaryStart = recordingStartIndex(state);
    if (boundaryStart === undefined)
        return;
    if (detectedIndex !== null && detectedIndex < boundaryStart) {
        // 起点之前的内容不属于游戏记录。删除会让后续数组序号整体左移，因此只校正边界，不触发历史重建。
        if (reason === 'deleted') {
            state.recordingBoundary = { ...state.recordingBoundary, startIndex: Math.max(0, boundaryStart - 1) };
            await putChatState(state);
        }
        return;
    }
    invalidateHistoryRevision(chatKey);
    abortActiveBusinessRequests();
    taskQueue.cancelPendingByChatKey(chatKey, '历史消息已变化，旧排队任务已取消');
    if (detectedIndex === null) {
        invalidateHistoryWorkflow(state, { reason });
        await putChatState(state);
        await pauseLorebookForHistoryChange(chatKey);
        toast('warning', '检测到历史消息删除，但无法判断位置。现有记忆已保留，世界书同步暂停；请在镜渊中选择重算起点');
        notifyFrom(0);
        return;
    }
    const index = Math.max(0, detectedIndex);
    const startIndex = Math.min(index, readHistoryWorkflow(state).startIndex ?? index);
    const latestOnly = Boolean(reason !== 'deleted'
        && startIndex === index
        && isNarrativeTail(index));
    invalidateHistoryWorkflow(state, { startIndex, reason, automatic: latestOnly });
    const validPrefixKeys = new Set();
    for (let i = 0; i < startIndex; i += 1) {
        const attached = getAttachedArtifact(getMessage(i));
        if (attached)
            validPrefixKeys.add(attached.messageKey);
    }
    markArtifactsForHistoryRebuild(startIndex, index);
    invalidateDerivedForValidMessages(state, validPrefixKeys);
    state.processedMessageKeys = state.processedMessageKeys.filter((key) => validPrefixKeys.has(key));
    state.latestSnapshotMessageKey = state.processedMessageKeys.at(-1);
    await persistChatFor(chatKey);
    await putChatState(state);
    await pauseLorebookForHistoryChange(chatKey);
    notifyFrom(index);
    if (latestOnly) {
        toast('info', '最新正文已变化，镜渊将自动从审核继续处理；世界书在完成前暂时停用');
    }
    else {
        toast('warning', `历史消息已变化，世界书同步已暂停；请在镜渊中从第 ${startIndex + 1} 条开始重算`);
    }
}
async function recalculateInvalidatedHistory() {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const chatKey = currentChatKey();
    cancelScheduledMessagesForChat(chatKey);
    const state = await getChatState(chatKey);
    const workflow = readHistoryWorkflow(state);
    const boundaryStart = recordingStartIndex(state);
    const startIndex = workflow.startIndex === undefined || boundaryStart === undefined
        ? workflow.startIndex
        : Math.max(workflow.startIndex, boundaryStart);
    if (startIndex === undefined || !workflow.invalidation)
        throw new Error(boundaryStart === undefined ? '尚未设置游玩记录起点' : '尚未选择历史重算起点');
    const endIndex = getChat().length;
    const processableIndexes = Array.from({ length: Math.max(0, endIndex - startIndex) }, (_, offset) => startIndex + offset)
        .filter((index) => isProcessableAssistantMessage(getMessage(index)));
    const previousRecovery = workflow.recovery;
    const canResumeCore = Boolean(previousRecovery
        && previousRecovery.startIndex === startIndex
        && ['failed', 'rebuilding-core'].includes(previousRecovery.phase)
        && Number.isInteger(previousRecovery.currentIndex)
        && processableIndexes.includes(Number(previousRecovery.currentIndex)));
    const resumeOffset = canResumeCore
        ? processableIndexes.indexOf(Number(previousRecovery?.currentIndex))
        : previousRecovery
            && previousRecovery.startIndex === startIndex
            && ['rebuilding-derived', 'publishing-lorebook', 'partial'].includes(previousRecovery.phase)
            ? processableIndexes.length
            : 0;
    // currentIndex 指向下一条待处理/本次失败消息；其在当前可处理序列中的位置
    // 就是已经成功固化的数量。不要重新使用 startIndex，否则重试会重复调用前缀消息。
    const completedBeforeRun = resumeOffset;
    const remainingIndexes = processableIndexes.slice(resumeOffset);
    beginHistoryRecovery(state, {
        startIndex,
        endIndex,
        currentIndex: remainingIndexes[0] ?? processableIndexes.at(-1),
        completedCount: completedBeforeRun,
        totalCount: processableIndexes.length,
        phase: remainingIndexes.length ? 'rebuilding-core' : 'rebuilding-derived',
    });
    await putChatState(state);
    let latest = null;
    const recoveredMessageKeys = new Set();
    for (const index of processableIndexes.slice(0, completedBeforeRun)) {
        const attached = getAttachedArtifact(getMessage(index));
        if (attached?.messageKey)
            recoveredMessageKeys.add(attached.messageKey);
    }
    for (const [runPosition, index] of remainingIndexes.entries()) {
        const absolutePosition = completedBeforeRun + runPosition;
        if (currentChatKey() !== chatKey)
            throw new Error('聊天已切换，历史重算已停止');
        try {
            latest = await processMessage(index, false, { skipDerived: true, historyRecovery: true });
            if (latest?.messageKey)
                recoveredMessageKeys.add(latest.messageKey);
            if (currentChatKey() !== chatKey)
                throw new Error('聊天已切换，历史重算已停止');
            if (!latest || latest.stages.state.status === 'failed' || latest.stages.state.status === 'blocked') {
                const stageError = latest?.stages.state.error || '状态表未成功';
                throw new Error(stageError);
            }
            const completedState = await getChatState(chatKey);
            updateHistoryRecovery(completedState, {
                completedCount: absolutePosition + 1,
                currentIndex: processableIndexes[absolutePosition + 1] ?? index,
                phase: 'rebuilding-core',
                error: undefined,
            });
            await putChatState(completedState);
        }
        catch (error) {
            const detail = toErrorMessage(error);
            const failedState = await getChatState(chatKey);
            const failedWorkflow = readHistoryWorkflow(failedState);
            if (!failedWorkflow.recovery && workflow.recovery) {
                beginHistoryRecovery(failedState, workflow.recovery);
            }
            failHistoryRecovery(failedState, detail, { currentIndex: index, completedCount: absolutePosition });
            await putChatState(failedState);
            throw new Error(`历史重建未完成：第 ${index + 1} 条消息的状态提取失败。${detail}`);
        }
    }
    if (currentChatKey() !== chatKey)
        throw new Error('聊天已切换，历史重算已停止');
    const recoveryInfo = latest
        ? { index: latest.messageIndex, artifact: latest }
        : latestSnapshotArtifact();
    const freshState = await getChatState(chatKey);
    if (!recoveryInfo) {
        await clearCurrentChatLorebookEntries(chatKey);
        completeHistoryWorkflow(freshState);
        freshState.lastSyncError = undefined;
        freshState.lastSyncStatus = 'success';
        freshState.lastSyncAt = nowIso();
        await putChatState(freshState);
        toast('success', '历史数据重算完成；当前没有可发布状态，已清除本聊天的镜渊世界书条目');
        return null;
    }
    updateHistoryRecovery(freshState, {
        phase: 'rebuilding-derived',
        currentIndex: recoveryInfo.index,
    });
    await putChatState(freshState);
    const artifact = recoveryInfo.artifact;
    const revision = currentHistoryRevision(chatKey);
    const errors = [];
    try {
        await taskQueue.run(`${PIPELINE_VERSION}:history-recovery-derived:${chatKey}:${artifact.messageKey}`, '恢复历史总结与世界书', 'smallSummary', async (guard) => {
            bindArtifactHistoryRevision(artifact, revision);
            bindArtifactTaskGuard(artifact, guard);
            try {
                try {
                    // 不 force；只排空因本次历史变化而重新达到条件的 event_id 与未固化小总结。
                    await rebuildEligibleSummaries(artifact);
                }
                catch (error) {
                    if (derivedTaskError(error))
                        throw error;
                    errors.push(`总结：${toErrorMessage(error)}`);
                }
                await saveArtifactToMessage(recoveryInfo.index, artifact);
                if (resolveHostControl(getSettings()).lorebook && errors.length === 0) {
                    const publishingState = await getChatState(chatKey);
                    updateHistoryRecovery(publishingState, { phase: 'publishing-lorebook' });
                    await putChatState(publishingState);
                    try {
                        await syncLorebook(artifact, false, { allowHistoryRecovery: true });
                    }
                    catch (error) {
                        if (error instanceof CommitRejectedError || (error instanceof Error && error.name === 'AbortError'))
                            throw error;
                        errors.push(`世界书：${toErrorMessage(error)}`);
                    }
                    await saveArtifactToMessage(recoveryInfo.index, artifact);
                }
                if (errors.length)
                    throw new Error(errors.join('；'));
                // 恢复提交成功前，清理恢复期间由宿主保存事件产生的陈旧自动任务。
                cancelScheduledMessagesForChat(chatKey);
                taskQueue.cancelPendingMatching((task) => Boolean(task.chatKey === chatKey
                    && task.automatic === true
                    && recoveredMessageKeys.has(String(task.messageKey || ''))
                    && task.triggerSource !== 'history-recovery'), '历史恢复已提交相同正文，陈旧自动任务已取消');
            }
            finally {
                unbindArtifactTaskGuard(artifact, guard);
                unbindArtifactHistoryRevision(artifact, revision);
            }
        }, { priority: 70, chatKey });
    }
    catch (error) {
        if (derivedTaskError(error))
            throw error;
        if (errors.length === 0)
            errors.push(toErrorMessage(error));
    }
    const finalState = await getChatState(chatKey);
    if (errors.length) {
        markHistoryRecoveryPartial(finalState, errors.join('；'));
        await putChatState(finalState);
        toast('warning', `历史核心状态已重算完成，但部分派生恢复失败：${errors.join('；')}`);
    }
    else {
        completeHistoryWorkflow(finalState);
        if (!resolveHostControl(getSettings()).lorebook) {
            finalState.lastSyncStatus = 'idle';
            finalState.lastSyncError = undefined;
        }
        await putChatState(finalState);
        toast('success', resolveHostControl(getSettings()).lorebook ? '历史数据重算完成，世界书同步已恢复' : '历史数据重算完成；自动世界书同步当前已关闭');
    }
    return artifact;
}
async function chooseHistoryRecalculationStart(startIndex) {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const chatKey = currentChatKey();
    const state = await getChatState(chatKey);
    if (currentChatKey() !== chatKey)
        throw new Error('聊天已切换，不再修改历史重算范围');
    if (!readHistoryWorkflow(state).invalidation)
        throw new Error('当前没有待处理的历史失效');
    const boundaryStart = recordingStartIndex(state);
    if (boundaryStart === undefined)
        throw new Error('尚未设置游玩记录起点');
    const index = Math.max(boundaryStart, Math.min(Math.trunc(startIndex), Math.max(boundaryStart, getChat().length - 1)));
    chooseHistoryWorkflowStart(state, index);
    const validPrefixKeys = new Set();
    for (let i = 0; i < index; i += 1) {
        const attached = getAttachedArtifact(getMessage(i));
        if (attached)
            validPrefixKeys.add(attached.messageKey);
    }
    markArtifactsForHistoryRebuild(index, index);
    invalidateDerivedForValidMessages(state, validPrefixKeys);
    state.processedMessageKeys = state.processedMessageKeys.filter((key) => validPrefixKeys.has(key));
    state.latestSnapshotMessageKey = state.processedMessageKeys.at(-1);
    await persistChatFor(chatKey);
    await putChatState(state);
    notifyFrom(index);
}
/**
 * 人工重试仍受最新正文/最新成功快照边界限制，避免旧结果覆盖当前连续性。
 */
async function retryStage(index, stage) {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const latestSnapshot = latestSnapshotArtifact();
    if (['audit', 'revision', 'state'].includes(stage) && index !== latestAssistantIndex()) {
        throw new Error('普通重试只适用于最新AI正文；旧正文请通过历史变更提示从该条开始重算');
    }
    if (['summary', 'sync'].includes(stage) && latestSnapshot?.index !== index) {
        throw new Error('总结和世界书只能基于最新成功状态表');
    }
    const chatKey = currentChatKey();
    const scheduledHistoryRevision = currentHistoryRevision(chatKey);
    const identity = messageIdentity(index);
    const key = `${PIPELINE_VERSION}:retry:${stage}:${chatKey}:${identity}`;
    const queueKind = stage === 'sync' ? 'sync' : stage === 'summary' ? 'smallSummary' : stage;
    return taskQueue.run(key, `重试${stage}`, queueKind, async (guard) => {
        if (currentChatKey() !== chatKey)
            throw new TaskSkippedError('聊天已切换，本次阶段重试不再处理');
        assertHistoryRevisionCurrent(chatKey, scheduledHistoryRevision);
        const currentState = await getChatState(chatKey);
        if (readHistoryWorkflow(currentState).blocked && ['state', 'summary', 'sync'].includes(stage)) {
            throw new TaskBlockedError(historyBlockedMessage(currentState));
        }
        const artifact = latestSnapshot?.index === index
            ? latestSnapshot.artifact
            : await loadOrCreateArtifact(index, false, scheduledHistoryRevision, guard);
        bindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
        bindArtifactTaskGuard(artifact, guard);
        try {
            if (stage === 'audit') {
                const audit = await runAudit(artifact, true);
                if (!audit.passed) {
                    markStage(artifact, 'state', 'blocked', '规则审核未通过');
                    markStage(artifact, 'summary', 'blocked', '规则审核未通过');
                    markStage(artifact, 'sync', 'blocked', '规则审核未通过');
                    const action = getSettings().auditFailAction;
                    if (action !== 'revise')
                        await applyAuditFailureAction(artifact, action);
                    try {
                        await pauseCurrentChatLorebookEntries(artifact.chatKey);
                    }
                    catch (error) {
                        console.warn('[MirrorAbyss] audit blocked but lorebook pause failed', error);
                        toast('warning', `审核已阻断正文，但旧世界书条目暂停失败：${toErrorMessage(error)}`);
                    }
                }
                else if (!artifact.snapshot || artifact.stages.state.status !== 'success') {
                    markStage(artifact, 'state', 'idle');
                    markStage(artifact, 'summary', 'idle');
                    markStage(artifact, 'sync', 'idle');
                }
                await saveArtifactToMessage(index, artifact);
            }
            if (stage === 'revision') {
                if (!artifact.audit || artifact.audit.passed)
                    throw new Error('当前正文没有待修正的审核违规');
                const previousMessageKey = artifact.messageKey;
                const result = await runRevisionFlow(artifact);
                await saveArtifactToMessage(index, artifact);
                if (result.approved) {
                    await invalidateCoreAfterManualRevision(artifact, previousMessageKey);
                }
                else {
                    await applyAuditFailureAction(artifact, getSettings().revisionFallbackAction);
                    await saveArtifactToMessage(index, artifact);
                }
            }
            if (stage === 'state') {
                if (resolveHostControl(getSettings()).audit && !artifact.audit?.passed) {
                    throw new Error('规则审核尚未通过，不能生成状态表');
                }
                await runStateExtraction(artifact, true);
                await saveArtifactToMessage(index, artifact);
                const committedState = await commitCoreState(artifact, true);
                const summaryPlan = await prepareDerivedStageStatuses(artifact, committedState);
                taskQueue.cancelPendingDerivedByChatKey(artifact.chatKey);
                queueAutomaticDerived(index, artifact, scheduledHistoryRevision, summaryPlan);
            }
            if (stage === 'summary') {
                const errors = [];
                try {
                    await maybeRunSummaries(artifact, true, true);
                }
                catch (error) {
                    if (derivedTaskError(error))
                        throw error;
                    errors.push(`总结：${toErrorMessage(error)}`);
                }
                await saveArtifactToMessage(index, artifact);
                if (resolveHostControl(getSettings()).lorebook) {
                    try {
                        await syncLorebook(artifact);
                    }
                    catch (error) {
                        if (derivedTaskError(error))
                            throw error;
                        errors.push(`世界书：${toErrorMessage(error)}`);
                    }
                    await saveArtifactToMessage(index, artifact);
                }
                if (errors.length)
                    throw new Error(errors.join('；'));
            }
            if (stage === 'sync') {
                await syncLorebook(artifact, true);
                await saveArtifactToMessage(index, artifact);
            }
            return artifact;
        }
        finally {
            unbindArtifactTaskGuard(artifact, guard);
            unbindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
        }
    }, { priority: 70, chatKey });
}
/** 玩家主动维护先只读预览；普通自动/手动 sync 不会进入历史考古。 */
async function previewLorebookMaintenance(index) {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const latest = latestSnapshotArtifact();
    if (!latest || latest.index !== index)
        throw new Error('世界书维护只能基于最新成功状态表');
    return previewLorebookMaintenanceForArtifact(latest.artifact);
}
/** 玩家确认后在独立队列任务中执行维护，再用普通同步提交状态和条目 ID。 */
async function applyLorebookMaintenance(index) {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const latest = latestSnapshotArtifact();
    if (!latest || latest.index !== index)
        throw new Error('世界书维护只能基于最新成功状态表');
    const artifact = latest.artifact;
    const scheduledHistoryRevision = currentHistoryRevision(artifact.chatKey);
    const key = `${PIPELINE_VERSION}:maintain-lorebook:${artifact.chatKey}:${artifact.messageKey}`;
    return taskQueue.run(key, '清理并重新发布世界书', 'sync', async (guard) => {
        if (currentChatKey() !== artifact.chatKey)
            throw new TaskSkippedError('聊天已切换，本次世界书维护不再处理');
        assertHistoryRevisionCurrent(artifact.chatKey, scheduledHistoryRevision);
        bindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
        bindArtifactTaskGuard(artifact, guard);
        try {
            const result = await applyLorebookMaintenanceForArtifact(artifact);
            await syncLorebook(artifact, true);
            await saveArtifactToMessage(index, artifact);
            return result;
        }
        finally {
            unbindArtifactTaskGuard(artifact, guard);
            unbindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
        }
    }, { priority: 70, chatKey: artifact.chatKey });
}
async function forceSummary(requestedIndex, kind) {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const latest = latestSnapshotArtifact();
    if (!latest)
        throw new Error('没有成功状态表，不能生成总结');
    if (Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex !== latest.index) {
        throw new Error('总结只能基于最新成功状态表');
    }
    const { index, artifact } = latest;
    const scheduledHistoryRevision = currentHistoryRevision(artifact.chatKey);
    // 玩家手动重试必须接管同聊天的陈旧自动派生任务。否则上游空响应后，旧自动总结/同步
    // 仍可能短暂占住全局执行器，让“立即小总结”长期停留在排队外观。
    taskQueue.cancelPendingMatching((task) => Boolean(task.chatKey === artifact.chatKey
        && task.automatic === true
        && ['smallSummary', 'largeSummary', 'sync'].includes(String(task.kind))), '玩家已手动提交总结，旧自动派生任务已取消');
    const cancelledActiveSummary = taskQueue.cancelActiveMatching((task) => Boolean(task.chatKey === artifact.chatKey
        && task.automatic === true
        && ['smallSummary', 'largeSummary'].includes(String(task.kind))), '玩家已手动提交总结，旧自动总结已请求取消');
    if (cancelledActiveSummary)
        abortActiveAutomaticSummaryRequests();
    // queued/running 是运行时状态，不能在真实任务已经结束后继续作为持久化锁。
    const hasLiveSummaryTask = taskQueue.list().some((task) => Boolean(['queued', 'running'].includes(String(task.state))
        && task.chatKey === artifact.chatKey
        && ['smallSummary', 'largeSummary'].includes(String(task.kind))
        && (!task.messageKey || task.messageKey === artifact.messageKey)));
    if (['queued', 'running'].includes(artifact.stages.summary.status) && !hasLiveSummaryTask) {
        markStage(artifact, 'summary', 'failed', '上次总结任务已结束但状态未收尾，已释放并允许重新提交');
        await saveArtifactToMessage(index, artifact);
    }
    const key = `${PIPELINE_VERSION}:force-summary:${kind}:${artifact.chatKey}:${artifact.messageKey}`;
    return taskQueue.run(key, `立即${kind === 'small' ? '小' : '大'}总结`, kind === 'small' ? 'smallSummary' : 'largeSummary', async (guard) => {
        if (currentChatKey() !== artifact.chatKey)
            throw new TaskSkippedError('聊天已切换，本次总结任务不再处理');
        assertHistoryRevisionCurrent(artifact.chatKey, scheduledHistoryRevision);
        bindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
        bindArtifactTaskGuard(artifact, guard);
        const errors = [];
        try {
            try {
                await runSummaryStage(artifact, kind, true);
            }
            catch (error) {
                if (derivedTaskError(error))
                    throw error;
                errors.push(`${kind === 'small' ? '小总结' : '大总结'}：${toErrorMessage(error)}`);
            }
            await saveArtifactToMessage(index, artifact);
            if (resolveHostControl(getSettings()).lorebook) {
                try {
                    await syncLorebook(artifact);
                }
                catch (error) {
                    if (derivedTaskError(error))
                        throw error;
                    errors.push(`世界书：${toErrorMessage(error)}`);
                }
                await saveArtifactToMessage(index, artifact);
            }
            if (errors.length)
                throw new Error(errors.join('；'));
            return artifact;
        }
        finally {
            unbindArtifactTaskGuard(artifact, guard);
            unbindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
        }
    }, {
        priority: 70,
        chatKey: artifact.chatKey,
        triggerSource: 'manual-summary',
        messageKey: artifact.messageKey,
        messageFingerprint: artifact.sourceFingerprint,
        historyRevisionAtEnqueue: scheduledHistoryRevision,
        automatic: false,
    });
}
function getArtifactAt(index) {
    return getAttachedArtifact(getMessage(index));
}
async function beginPlayRecording() {
    const sourceChatKey = currentChatKey();
    taskQueue.setAccepting(false);
    abortActiveRequests();
    taskQueue.resetRuntime();
    try {
        await taskQueue.whenIdle();
        if (currentChatKey() !== sourceChatKey)
            throw new Error('聊天已切换，已停止设置游玩记录起点');
        const lorebookEntries = await clearCurrentChatLorebookEntries(sourceChatKey);
        let clearedArtifacts = 0;
        for (const message of getChat()) {
            if (message?.extra?.[MODULE_NAME]) {
                delete message.extra[MODULE_NAME];
                clearedArtifacts += 1;
            }
            if (message?.extra?.[LEGACY_MODULE_NAME])
                delete message.extra[LEGACY_MODULE_NAME];
        }
        const state = emptyChatState(sourceChatKey);
        state.recordingBoundary = createPlayerRecordingBoundary(getChat().length);
        await persistChatFor(sourceChatKey);
        await putChatState(state);
        notifyFrom(0);
        return { boundary: state.recordingBoundary, clearedArtifacts, lorebookEntries };
    }
    finally {
        taskQueue.setAccepting(getSettings().enabled);
    }
}

async function restoreSuppressedLorebookEntry(key) {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const latest = latestSnapshotArtifact();
    if (!latest)
        throw new Error('尚无可同步的状态');
    return restoreSuppressedLorebookEntryForArtifact(latest.artifact, key);
}

async function resetCurrentGame() {
    const sourceChatKey = currentChatKey();
    taskQueue.setAccepting(false);
    abortActiveRequests();
    taskQueue.resetRuntime();
    try {
        await taskQueue.whenIdle();
        if (currentChatKey() !== sourceChatKey)
            throw new Error('聊天已切换，已停止重置当前游戏');
        const lorebookEntries = await clearCurrentChatLorebookEntries(sourceChatKey);
        if (currentChatKey() !== sourceChatKey)
            throw new Error('聊天已切换，已停止重置当前游戏');
        let messages = 0;
        for (const message of getChat()) {
            const extra = message?.extra;
            const hadCurrent = Boolean(extra?.[MODULE_NAME]);
            const hadLegacy = Boolean(extra?.[LEGACY_MODULE_NAME]);
            if (hadCurrent) {
                delete extra[MODULE_NAME];
            }
            if (hadLegacy) {
                delete extra[LEGACY_MODULE_NAME];
            }
            if (hadCurrent || hadLegacy) {
                messages += 1;
            }
        }
        const namespace = getChatMetadataNamespace();
        delete namespace.state;
        delete namespace.lorebookName;
        namespace.updatedAt = nowIso();
        const context = getContext();
        if (context.chatMetadata?.[LEGACY_MODULE_NAME])
            delete context.chatMetadata[LEGACY_MODULE_NAME];
        await persistChatFor(sourceChatKey);
        if (currentChatKey() !== sourceChatKey)
            throw new Error('聊天已切换，已停止重置当前游戏');
        await persistMetadataFor(sourceChatKey);
        notifyFrom(0);
        return { messages, lorebookEntries };
    }
    finally {
        taskQueue.setAccepting(getSettings().enabled);
    }
}
function latestArtifact() {
    const chat = getChat();
    const chatKey = currentChatKey();
    for (let i = chat.length - 1; i >= 0; i -= 1) {
        const artifact = getAttachedArtifact(chat[i]);
        if (artifact?.chatKey === chatKey)
            return { index: i, artifact };
    }
    return null;
}
function latestSnapshotArtifact() {
    const chat = getChat();
    const chatKey = currentChatKey();
    for (let i = chat.length - 1; i >= 0; i -= 1) {
        const artifact = getAttachedArtifact(chat[i]);
        if (artifact?.chatKey === chatKey && artifact.snapshot && artifact.stages.state.status === 'success') {
            return { index: i, artifact };
        }
    }
    return null;
}
function installPipelineEventHandlers() {
    const context = globalThis.SillyTavern.getContext();
    const { eventSource, event_types } = context;
    const onReceived = (payload) => scheduleMessage(payload, false, 180, 'message-received');
    const handleInvalidation = (payload, reason) => {
        if (!getSettings().enabled)
            return;
        const changedIndex = resolveChangedIndex(payload);
        void invalidateHistory(payload, reason).then(() => {
            if (reason !== 'deleted'
                && changedIndex !== null
                && isNarrativeTail(changedIndex)) {
                // 最新正文的编辑或 swipe 没有后续依赖，自动从审核继续跑完整链，不要求人工历史重建。
                scheduleMessage(changedIndex, false, 120, `history-${reason}`);
            }
        }).catch((error) => {
            console.error('[MirrorAbyss] history invalidation failed', error);
            toast('error', `历史变化处理失败：${toErrorMessage(error)}`);
        });
    };
    const onEdited = (payload) => handleInvalidation(payload, 'edited');
    const onSwiped = (payload) => handleInvalidation(payload, 'swiped');
    const onDeleted = (payload) => handleInvalidation(payload, 'deleted');
    const onChatChanged = () => {
        const chatKey = currentChatKey();
        // chatKey 单独不能识别 A → B → A：不受 AbortController 控制的宿主保存或世界书
        // I/O 可能在玩家切回 A 后才返回。给当前 active job 留下永久取消标记，使既有
        // task guard 在下一提交点拒绝迟到结果。
        taskQueue.cancelActiveMatching(() => true, '聊天已切换，旧聊天运行任务已取消');
        abortActiveRequests();
        taskQueue.cancelPendingOutsideChat(chatKey);
        cancelScheduledMessagesOutsideChat(chatKey);
        void (async () => {
            try {
                await reconcileInterruptedRuntimeState();
                await resumeRuntimeOutbox();
            }
            catch (error) {
                console.warn('[MirrorAbyss] interrupted runtime reconciliation or outbox resume failed', error);
            }
        })();
    };
    eventSource.on(event_types.MESSAGE_RECEIVED, onReceived);
    eventSource.on(event_types.MESSAGE_EDITED, onEdited);
    eventSource.on(event_types.MESSAGE_SWIPED, onSwiped);
    eventSource.on(event_types.MESSAGE_DELETED, onDeleted);
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    return () => {
        removeSourceListener(eventSource, event_types.MESSAGE_RECEIVED, onReceived);
        removeSourceListener(eventSource, event_types.MESSAGE_EDITED, onEdited);
        removeSourceListener(eventSource, event_types.MESSAGE_SWIPED, onSwiped);
        removeSourceListener(eventSource, event_types.MESSAGE_DELETED, onDeleted);
        removeSourceListener(eventSource, event_types.CHAT_CHANGED, onChatChanged);
    };
}

}
};
__defs["pipeline/revision.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"getSettings",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getSettings"]});
Object.defineProperty(__scope,"assertArtifactCommitCurrent",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["assertArtifactCommitCurrent"]});
Object.defineProperty(__scope,"hashText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["hashText"]});
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"toErrorMessage",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["toErrorMessage"]});
Object.defineProperty(__scope,"replaceMessageInPlace",{enumerable:true,configurable:true,get:()=>__require("core/message-update.js")["replaceMessageInPlace"]});
Object.defineProperty(__scope,"markStage",{enumerable:true,configurable:true,get:()=>__require("domain/artifact.js")["markStage"]});
Object.defineProperty(__scope,"generateTask",{enumerable:true,configurable:true,get:()=>__require("llm/generator.js")["generateTask"]});
Object.defineProperty(__scope,"revisionSystemPrompt",{enumerable:true,configurable:true,get:()=>__require("prompts/revision.js")["revisionSystemPrompt"]});
Object.defineProperty(__scope,"revisionUserPrompt",{enumerable:true,configurable:true,get:()=>__require("prompts/revision.js")["revisionUserPrompt"]});
Object.defineProperty(__scope,"putArtifact",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["putArtifact"]});
Object.defineProperty(__scope,"applyAuditVisibility",{enumerable:true,configurable:true,get:()=>__require("pipeline/audit.js")["applyAuditVisibility"]});
Object.defineProperty(__scope,"auditText",{enumerable:true,configurable:true,get:()=>__require("pipeline/audit.js")["auditText"]});
with(__scope){
Object.defineProperty(exports,"runRevisionFlow",{enumerable:true,configurable:true,get:()=>runRevisionFlow});
/**
 * 模块职责：按审核指令生成最小修正版并复审，成功后原位替换正文。
 * 维护边界：修正次数有限；技术错误不能当作再次违规，也不能因此隐藏正文。
 */
function cleanRevisionText(raw) {
    let text = safeText(raw, 200000).trim();
    const fenced = text.match(/^```(?:markdown|text)?\s*([\s\S]*?)```$/i);
    if (fenced)
        text = fenced[1].trim();
    text = text.replace(/^(?:【?修正版(?:正文)?】?|修正后的完整正文)\s*[:：]?\s*/i, '').trim();
    return text;
}
function initialRevisionRecord(artifact) {
    return artifact.revision ?? {
        status: 'idle',
        originalText: artifact.assistantText,
        originalFingerprint: artifact.sourceFingerprint,
        attempts: [],
    };
}
/**
 * 每次候选正文都必须复审通过后才能原位替换。达到次数上限或重复违规时停止，不递归扩张。
 */
async function runRevisionFlow(artifact) {
    const settings = getSettings();
    const firstAudit = artifact.audit;
    if (!firstAudit || firstAudit.passed)
        throw new Error('没有可修正的审核失败结果');
    artifact.revision = initialRevisionRecord(artifact);
    if (firstAudit.decision === 'block') {
        artifact.revision.status = 'blocked';
        artifact.revision.stoppedReason = firstAudit.reason || '审核判定无法局部修正';
        markStage(artifact, 'revision', 'blocked', artifact.revision.stoppedReason);
        await putArtifact(artifact);
        return { approved: false, audit: firstAudit };
    }
    artifact.hiddenByAudit = true;
    applyAuditVisibility(artifact.messageIndex, true);
    artifact.revision.status = 'running';
    markStage(artifact, 'revision', 'running');
    await putArtifact(artifact);
    let sourceText = artifact.assistantText;
    let currentAudit = firstAudit;
    let previousViolationFingerprint = firstAudit.violationFingerprint;
    const maxAttempts = Math.min(2, Math.max(1, Number(settings.maxRevisionAttempts) || 1));
    try {
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const replacementText = safeText(currentAudit.replacementText, 200000).trim();
            const supplied = attempt === 1 && replacementText ? replacementText : undefined;
            const raw = supplied ?? await generateTask({
                task: 'revision',
                systemPrompt: revisionSystemPrompt(settings.revisionPrompt),
                prompt: revisionUserPrompt(settings.auditPrompt, artifact.playerText, sourceText, currentAudit, attempt),
            });
            const candidate = cleanRevisionText(raw);
            if (!candidate)
                throw new Error('修正文模型返回空正文');
            if (hashText(candidate) === hashText(sourceText))
                throw new Error('修正文模型未改变正文');
            const candidateAudit = await auditText(settings.auditPrompt, artifact.playerText, candidate);
            assertArtifactCommitCurrent(artifact);
            artifact.revision.attempts.push({
                attempt,
                sourceFingerprint: hashText(sourceText),
                candidateFingerprint: hashText(candidate),
                audit: candidateAudit,
                createdAt: nowIso(),
            });
            if (candidateAudit.passed) {
                artifact.audit = candidateAudit;
                await replaceMessageInPlace(artifact, candidate);
                artifact.auditSourceFingerprint = artifact.sourceFingerprint;
                artifact.revision.status = 'success';
                artifact.revision.finalFingerprint = artifact.sourceFingerprint;
                artifact.revision.committedAt = nowIso();
                // The rejected body is no longer needed after an atomic in-place commit.
                // Purging it keeps the saved chat metadata free of the discarded prose.
                artifact.revision.originalText = '';
                artifact.hiddenByAudit = false;
                markStage(artifact, 'audit', 'success');
                markStage(artifact, 'revision', 'success');
                await putArtifact(artifact);
                return { approved: true, audit: candidateAudit };
            }
            const sameViolation = Boolean(settings.stopOnRepeatedViolation &&
                candidateAudit.violationFingerprint &&
                candidateAudit.violationFingerprint === previousViolationFingerprint);
            if (candidateAudit.decision === 'block' || sameViolation) {
                artifact.revision.status = 'blocked';
                artifact.revision.stoppedReason = candidateAudit.decision === 'block'
                    ? candidateAudit.reason
                    : '修正后重复出现相同违规，已停止循环';
                markStage(artifact, 'revision', 'blocked', artifact.revision.stoppedReason);
                await putArtifact(artifact);
                return { approved: false, audit: candidateAudit };
            }
            sourceText = candidate;
            currentAudit = candidateAudit;
            previousViolationFingerprint = candidateAudit.violationFingerprint;
            // 候选正文尚未提交，artifact.audit 必须继续对应玩家当前可见正文。
            // 候选审核保存在 revision.attempts 中，供诊断与下一次循环使用。
            await putArtifact(artifact);
        }
        artifact.revision.status = 'failed';
        artifact.revision.stoppedReason = `达到最大自动修正次数（${maxAttempts}）`;
        markStage(artifact, 'revision', 'failed', artifact.revision.stoppedReason);
        await putArtifact(artifact);
        return { approved: false, audit: artifact.audit ?? firstAudit };
    }
    catch (error) {
        if (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name)) {
            artifact.revision.status = 'cancelled';
            artifact.revision.stoppedReason = toErrorMessage(error);
            artifact.hiddenByAudit = false;
            applyAuditVisibility(artifact.messageIndex, false, true);
            markStage(artifact, 'revision', 'cancelled', artifact.revision.stoppedReason);
            await putArtifact(artifact);
            throw error;
        }
        artifact.revision.status = 'failed';
        artifact.revision.stoppedReason = toErrorMessage(error);
        artifact.hiddenByAudit = false;
        applyAuditVisibility(artifact.messageIndex, false, true);
        markStage(artifact, 'revision', 'failed', `修正执行失败：${artifact.revision.stoppedReason}`);
        await putArtifact(artifact);
        throw error;
    }
}

}
};
__defs["pipeline/state.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"assertArtifactCommitCurrent",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["assertArtifactCommitCurrent"]});
Object.defineProperty(__scope,"CommitRejectedError",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["CommitRejectedError"]});
Object.defineProperty(__scope,"getChat",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getChat"]});
Object.defineProperty(__scope,"getSettings",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getSettings"]});
Object.defineProperty(__scope,"hashText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["hashText"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"toErrorMessage",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["toErrorMessage"]});
Object.defineProperty(__scope,"markStage",{enumerable:true,configurable:true,get:()=>__require("domain/artifact.js")["markStage"]});
Object.defineProperty(__scope,"normalizeFactPackage",{enumerable:true,configurable:true,get:()=>__require("domain/facts.js")["normalizeFactPackage"]});
Object.defineProperty(__scope,"canonicalObjectTitle",{enumerable:true,configurable:true,get:()=>__require("domain/object-identity.js")["canonicalObjectTitle"]});
Object.defineProperty(__scope,"enabledTables",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["enabledTables"]});
Object.defineProperty(__scope,"migrateSnapshotTables",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["migrateSnapshotTables"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
Object.defineProperty(__scope,"registryFingerprint",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["registryFingerprint"]});
Object.defineProperty(__scope,"tableLinkRulesFingerprint",{enumerable:true,configurable:true,get:()=>__require("domain/table-link-rules.js")["tableLinkRulesFingerprint"]});
Object.defineProperty(__scope,"emptySnapshot",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["emptySnapshot"]});
Object.defineProperty(__scope,"normalizeSnapshot",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["normalizeSnapshot"]});
Object.defineProperty(__scope,"transitionStateSnapshot",{enumerable:true,configurable:true,get:()=>__require("domain/memory-state-machine.js")["transitionStateSnapshot"]});
Object.defineProperty(__scope,"dedupeStrongStateRows",{enumerable:true,configurable:true,get:()=>__require("domain/state-text.js")["dedupeStrongStateRows"]});
Object.defineProperty(__scope,"parseStateTextOutput",{enumerable:true,configurable:true,get:()=>__require("domain/state-text.js")["parseStateTextOutput"]});
Object.defineProperty(__scope,"generateTask",{enumerable:true,configurable:true,get:()=>__require("llm/generator.js")["generateTask"]});
Object.defineProperty(__scope,"stateSystemPrompt",{enumerable:true,configurable:true,get:()=>__require("prompts/state.js")["stateSystemPrompt"]});
Object.defineProperty(__scope,"stateUserPrompt",{enumerable:true,configurable:true,get:()=>__require("prompts/state.js")["stateUserPrompt"]});
Object.defineProperty(__scope,"getChatState",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["getChatState"]});
Object.defineProperty(__scope,"putArtifact",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["putArtifact"]});
Object.defineProperty(exports,"preserveProtectedRows",{enumerable:true,configurable:true,get:()=>__require("domain/memory-state-machine.js")["preserveProtectedRows"]});
with(__scope){
Object.defineProperty(exports,"runStateExtraction",{enumerable:true,configurable:true,get:()=>runStateExtraction});
Object.defineProperty(exports,"previousSnapshot",{enumerable:true,configurable:true,get:()=>previousSnapshot});
Object.defineProperty(exports,"mergeStateRowPatches",{enumerable:true,configurable:true,get:()=>mergeStateRowPatches});
Object.defineProperty(exports,"applyStateRowRelocations",{enumerable:true,configurable:true,get:()=>applyStateRowRelocations});
Object.defineProperty(exports,"attachLocalFactMetadata",{enumerable:true,configurable:true,get:()=>attachLocalFactMetadata});
/**
 * 模块职责：调用状态模型并把内部事实包与动态可见表格合并为下一快照。
 * 维护边界：模型只更新启用表格；停用表格保留隐藏旧视图；人工/锁定行必须恢复。
 */
class RegistryChangedError extends CommitRejectedError {
}
const FACT_OPERATIONS = new Set(['create', 'update', 'append', 'close', 'supersede']);
const FACT_CONFIDENCE = new Set(['confirmed', 'recorded', 'reported', 'uncertain']);
const FACT_STORAGE_CLASSES = new Set(['working', 'episodic', 'event', 'durable']);
/** 固定文本解析后再检查镜渊业务身份约束。 */
function assertStateBusinessShape(parsed, active) {
    const factIds = new Set();
    parsed.facts.forEach((fact, index) => {
        if (!fact || typeof fact !== 'object' || Array.isArray(fact))
            throw new Error(`facts[${index}] 必须是对象`);
        const source = fact;
        const factId = String(source.fact_id ?? source.factId ?? source.id ?? '').trim();
        const eventId = String(source.event_id ?? source.eventId ?? '').trim();
        const type = String(source.type ?? '').trim();
        const title = String(source.title ?? '').trim();
        if (!factId)
            throw new Error(`facts[${index}].fact_id 不能为空`);
        if ((type === 'events' || type === 'event') && !eventId)
            throw new Error(`facts[${index}] 是事件事实但缺少 event_id`);
        if (!title)
            throw new Error(`facts[${index}].title 不能为空`);
        if (factIds.has(factId))
            throw new Error(`同一次状态返回包含重复 fact_id：${factId}`);
        factIds.add(factId);
        if (source.operation !== undefined && !FACT_OPERATIONS.has(String(source.operation)))
            throw new Error(`facts[${index}].operation 不合法`);
        if (source.confidence !== undefined && !FACT_CONFIDENCE.has(String(source.confidence)))
            throw new Error(`facts[${index}].confidence 不合法`);
        if (!source.primaryHost?.type || !source.primaryHost?.id)
            throw new Error(`facts[${index}].primary_host 不完整`);
        if (!String(source.facet ?? '').trim())
            throw new Error(`facts[${index}].facet 不能为空`);
        if (!FACT_STORAGE_CLASSES.has(String(source.storageClass ?? '')))
            throw new Error(`facts[${index}].storage_class 不合法`);
        if (!eventId && source.storageClass === 'event')
            throw new Error(`facts[${index}] 无 event_id，不能进入 event 保存层`);
    });
    for (const table of active) {
        const rows = parsed.snapshot[table.key];
        if (rows === undefined)
            continue;
        if (!Array.isArray(rows))
            throw new Error(`状态表 ${table.key} 必须是数组`);
        const ids = new Set();
        const titles = new Set();
        rows.forEach((row, index) => {
            if (!row || typeof row !== 'object' || Array.isArray(row))
                throw new Error(`状态表 ${table.key}[${index}] 必须是对象`);
            const source = row;
            const id = String(source.id ?? '').trim();
            const title = String(source.title ?? '').trim();
            if (!id)
                throw new Error(`状态表 ${table.key}[${index}].id 不能为空`);
            if (!title)
                throw new Error(`状态表 ${table.key}[${index}].title 不能为空`);
            if (ids.has(id))
                throw new Error(`状态表 ${table.key} 同一次返回包含重复 id：${id}`);
            const titleToken = canonicalObjectTitle(title);
            if (titleToken && titles.has(titleToken))
                throw new Error(`状态表 ${table.key} 同一次返回包含重复对象：${title}`);
            ids.add(id);
            if (titleToken)
                titles.add(titleToken);
        });
    }
}
function previousSnapshot(beforeIndex) {
    const registry = getSettings().tableRegistry;
    const chat = getChat();
    for (let i = beforeIndex - 1; i >= 0; i -= 1) {
        if (chat[i]?.is_user)
            continue;
        const snapshot = chat[i]?.extra?.mirrorAbyssV11?.snapshot;
        if (snapshot)
            return normalizeSnapshot(snapshot, snapshot, registry);
        const legacy = chat[i]?.extra?.mirrorAbyss?.tableSnapshot;
        if (legacy)
            return normalizeSnapshot(legacy, legacy, registry);
    }
    return emptySnapshot(registry);
}
function normalizedTitle(value) {
    return canonicalObjectTitle(value);
}
function normalizedComparableText(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/[。．.！!？?；;，,、：:]$/u, '')
        .trim();
}
function normalizedComparableList(value) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map(normalizedComparableText).filter(Boolean))].sort();
}
function normalizedComparableObject(value) {
    if (Array.isArray(value))
        return value.map(normalizedComparableObject);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, normalizedComparableObject(item)]));
    }
    return normalizedComparableText(value);
}
function sameComparableValue(left, right) {
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right))
            return false;
        const a = normalizedComparableList(left);
        const b = normalizedComparableList(right);
        return a.length === b.length && a.every((value, index) => value === b[index]);
    }
    const leftObject = left && typeof left === 'object';
    const rightObject = right && typeof right === 'object';
    if (leftObject || rightObject) {
        if (!leftObject || !rightObject)
            return false;
        return JSON.stringify(normalizedComparableObject(left)) === JSON.stringify(normalizedComparableObject(right));
    }
    return normalizedComparableText(left) === normalizedComparableText(right);
}
/**
 * 模型返回的是候选修订。若只是空白、末尾标点或数组顺序变化，继续沿用旧值，
 * 避免无剧情变化时产生快照抖动；真正内容变化仍完整接受，不限制变化幅度。
 */
function preserveEquivalentPatchValues(existing, source) {
    const output = { ...source };
    if ('content' in output && sameComparableValue(existing.content, output.content))
        output.content = existing.content;
    if ('status' in output && sameComparableValue(existing.status, output.status))
        output.status = existing.status;
    if ('keywords' in output && sameComparableValue(existing.keywords, output.keywords))
        output.keywords = structuredClone(existing.keywords);
    if (output.fields && typeof output.fields === 'object' && !Array.isArray(output.fields)) {
        const nextFields = { ...output.fields };
        for (const [key, value] of Object.entries(nextFields)) {
            const oldValue = existing.fields?.[key];
            if (sameComparableValue(oldValue, value))
                nextFields[key] = structuredClone(oldValue);
        }
        output.fields = nextFields;
    }
    if ('lifecycle' in output && sameComparableValue(existing.lifecycle, output.lifecycle))
        output.lifecycle = structuredClone(existing.lifecycle);
    return output;
}
/**
 * V35 行级补丁合并：非空数组只 upsert 返回行，未返回行和空数组都保留旧表。
 * 自动状态提取不再用 [] 承担高风险清表语义；未来清表必须走独立显式操作。
 * 旧模型若仍返回完整表，也会按同一规则逐行覆盖，不产生重复。
 */
function mergeStateRowPatches(previous, parsedSnapshot, registry) {
    const merged = {};
    for (const table of registry)
        merged[table.key] = structuredClone(previous[table.key] ?? []);
    for (const table of enabledTables(registry)) {
        if (!Object.prototype.hasOwnProperty.call(parsedSnapshot, table.key))
            continue;
        const patches = parsedSnapshot[table.key];
        if (!Array.isArray(patches))
            continue;
        if (patches.length === 0)
            continue;
        const rows = structuredClone(previous[table.key] ?? []);
        const idIndex = new Map(rows.map((row, index) => [row.id, index]));
        const titleIndexes = new Map();
        rows.forEach((row, index) => {
            const title = normalizedTitle(row.title);
            if (title)
                titleIndexes.set(title, [...(titleIndexes.get(title) ?? []), index]);
        });
        const patchTitleCounts = new Map();
        for (const patch of patches) {
            const title = normalizedTitle(patch?.title);
            if (title)
                patchTitleCounts.set(title, (patchTitleCounts.get(title) ?? 0) + 1);
        }
        for (const patch of patches) {
            if (!patch || typeof patch !== 'object')
                continue;
            const id = String(patch.id ?? '').trim();
            const title = normalizedTitle(patch.title);
            const uniqueTitleIndex = title
                && patchTitleCounts.get(title) === 1
                && (titleIndexes.get(title)?.length ?? 0) === 1
                ? titleIndexes.get(title)?.[0]
                : undefined;
            const index = (id && idIndex.get(id) !== undefined) ? idIndex.get(id) : uniqueTitleIndex;
            if (index === undefined) {
                rows.push(patch);
                if (id)
                    idIndex.set(id, rows.length - 1);
                if (title)
                    titleIndexes.set(title, [...(titleIndexes.get(title) ?? []), rows.length - 1]);
            }
            else {
                const existing = rows[index];
                const source = preserveEquivalentPatchValues(existing, patch);
                rows[index] = {
                    ...existing,
                    ...source,
                    // 标题唯一命中时必须继续沿用旧稳定 ID；模型补丁不能借机分裂同一对象。
                    id: existing.id,
                    fields: {
                        ...(existing.fields ?? {}),
                        ...(source.fields && typeof source.fields === 'object' ? source.fields : {}),
                    },
                };
                idIndex.set(existing.id, index);
            }
        }
        merged[table.key] = rows;
    }
    return normalizeSnapshot(merged, previous, registry);
}
/**
 * 模型通过 kind 明确纠正自动条目的语义归属时，先从旧表移除同一稳定 ID，
 * 再由正常行级补丁写入目标表。人工基础保护和完全锁定条目不允许自动搬迁。
 */
function applyStateRowRelocations(previous, rawRelocations, registry) {
    if (!Array.isArray(rawRelocations) || !rawRelocations.length)
        return previous;
    const next = structuredClone(previous);
    const tableKeys = new Set(registry.map((table) => table.key));
    for (const raw of rawRelocations) {
        if (!raw || typeof raw !== 'object')
            continue;
        const move = raw;
        const id = String(move.id ?? '').trim();
        const fromTable = String(move.fromTable ?? '').trim();
        const toTable = String(move.toTable ?? '').trim();
        if (!id || !fromTable || !toTable || fromTable === toTable)
            continue;
        if (!tableKeys.has(fromTable) || !tableKeys.has(toTable))
            continue;
        const sourceRows = next[fromTable] ?? [];
        const source = sourceRows.find((row) => row.id === id);
        if (!source)
            continue;
        if (source.source === 'manual' || source.locked || source.lockMode === 'all' || source.lockMode === 'base')
            continue;
        next[fromTable] = sourceRows.filter((row) => row.id !== id);
    }
    return normalizeSnapshot(next, previous, registry);
}
function identityToken(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s·•._—–\-|｜:：()（）【】\[\]]+/g, '');
}
function textList(value) {
    return Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : [];
}
/**
 * facts 是事件线真相来源；行只输出内容补丁。这里在本地把同一轮多事件线重新挂回受影响对象，
 * 避免模型为每一行重复 factIds/eventIds/recall，降低输出体积并防止两条线互相覆盖。
 */
function attachLocalFactMetadata(parsedSnapshot, rawFacts, registry) {
    const facts = rawFacts.filter((item) => item && typeof item === 'object').map((item) => item);
    for (const table of enabledTables(registry)) {
        const patches = parsedSnapshot[table.key];
        if (!Array.isArray(patches))
            continue;
        for (const rawPatch of patches) {
            if (!rawPatch || typeof rawPatch !== 'object')
                continue;
            const patch = rawPatch;
            const title = String(patch.title ?? '').trim();
            const id = String(patch.id ?? '').trim();
            const rowTokens = new Set([title, id].map(identityToken).filter(Boolean));
            let matched = facts.filter((fact) => {
                const related = textList(fact.related_entities ?? fact.relatedEntities).map(identityToken).filter(Boolean);
                if (related.some((token) => rowTokens.has(token)))
                    return true;
                if (table.role === 'events' && identityToken(fact.title) === identityToken(title))
                    return true;
                return false;
            });
            // 单事件轮次允许安全回退；多事件轮次绝不凭模糊关键词把无关线挂到一起。
            if (!matched.length && facts.length === 1)
                matched = facts;
            const factIds = [...new Set([
                    ...textList(patch.factIds ?? patch.fact_ids),
                    ...matched.map((fact) => String(fact.fact_id ?? fact.factId ?? '').trim()).filter(Boolean),
                ])];
            const eventIds = [...new Set([
                    ...textList(patch.eventIds ?? patch.event_ids),
                    String(patch.eventId ?? patch.event_id ?? '').trim(),
                    ...matched.map((fact) => String(fact.event_id ?? fact.eventId ?? '').trim()).filter(Boolean),
                ].filter(Boolean))];
            patch.factIds = factIds;
            patch.eventIds = eventIds;
            patch.eventId = eventIds[0] ?? '';
            if (!patch.recall || typeof patch.recall !== 'object') {
                const keywords = textList(patch.keywords);
                patch.recall = { any: [...new Set([title, ...keywords].filter(Boolean))], all: [], exclude: [] };
            }
            const hasRelatedEvents = table.fields.some((field) => field.key === 'relatedEvents');
            if (hasRelatedEvents && eventIds.length) {
                patch.relatedEvents = [...new Set([...textList(patch.relatedEvents), ...eventIds])];
            }
        }
    }
    return parsedSnapshot;
}
function assertRegistryCurrent(expectedFingerprint) {
    const settings = getSettings();
    const current = enabledTables(normalizeTableRegistry(settings.tableRegistry));
    const currentFingerprint = hashText(`${registryFingerprint(current)}|${tableLinkRulesFingerprint(settings.tableLinkRules, current)}`);
    if (currentFingerprint !== expectedFingerprint) {
        throw new RegistryChangedError('表头或联动规则已变化，旧状态结果不再提交');
    }
}
function splitStateSource(text, limit) {
    const max = Math.max(800, Math.round(limit));
    const paragraphs = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    const chunks = [];
    let current = '';
    const push = (value) => {
        const cleaned = value.trim();
        if (cleaned)
            chunks.push(cleaned);
    };
    const append = (piece) => {
        if (!piece)
            return;
        if (!current) {
            current = piece;
            return;
        }
        if (current.length + piece.length + 2 <= max)
            current += `\n\n${piece}`;
        else {
            push(current);
            current = piece;
        }
    };
    for (const paragraph of paragraphs.length ? paragraphs : [String(text || '')]) {
        if (paragraph.length <= max) {
            append(paragraph);
            continue;
        }
        const sentences = paragraph.split(/(?<=[。！？!?；;])\s*/u).map((item) => item.trim()).filter(Boolean);
        for (const sentence of sentences.length ? sentences : [paragraph]) {
            if (sentence.length <= max) {
                append(sentence);
                continue;
            }
            if (current) {
                push(current);
                current = '';
            }
            for (let offset = 0; offset < sentence.length; offset += max)
                push(sentence.slice(offset, offset + max));
        }
    }
    push(current);
    return chunks.length ? chunks : [''];
}
function minimalStateChunkPrompt(playerText, assistantChunk, index, total) {
    return `【玩家输入】\n${playerText || '（空）'}\n\n【本轮正文分段 ${index + 1}/${total}】\n${assistantChunk}\n\n只提取这一分段明确建立的变化。只返回 <MA_TURN> 与 <MA_EVENT> 自然事实模块。每个事件必须有一条 <MA_CORE> 动作骨架；对象模块第一行写对象名，后续只写该对象自身的一句结果。禁止等号、键值字段、重复复述和内部字段键。`;
}
function retryableStateTransportError(error) {
    return /(504|502|503|gateway|timeout|timed out|超时|网关|no message generated|返回为空|响应未完成|upstream)/i.test(toErrorMessage(error));
}
/** 只修复标签、块和必填语义项等传输格式问题；表格/语义层权限与对象歧义属于语义校验，必须原样失败。 */
function repairableStateParseError(error) {
    const message = toErrorMessage(error);
    return !/(未注册|已停用|无法确定对象表|存在歧义|多个条目命中|不允许写入|不允许直接维护|未知生命周期|只能用于已有对象|absorb 必须|merge_)/i.test(message);
}
function compactStateRepairSystemPrompt() {
    return `你是固定文本整理器，不分析剧情、不补充事实。把输入中已经写出的内容整理成镜渊自然事实模块。
只允许 <MA_TURN> 和 <MA_EVENT>。删除块外说明、JSON 外壳、代码围栏、等号键值和思考文字。
<MA_EVENT> 第一行只写事件名，随后直接写事实模块；删除“进行中/已结束”状态行。必须保留唯一 <MA_CORE>。对象模块第一行写对象名，后续只写该对象自身的一到两句具体结果。不同模块不得重复整件事；原始返回没有表达的事实不得添加。`;
}
function compactStateRepairPrompt(raw) {
    return `【待整理的模型原始返回】\n${safeText(raw, 18000)}\n\n只做格式整理。原始返回没有表达的事实不得添加。`;
}
async function repairStateText(raw, previous, registry, activeFacts, maxTokens, origin) {
    const repaired = await generateTask({
        task: 'state',
        systemPrompt: compactStateRepairSystemPrompt(),
        prompt: compactStateRepairPrompt(raw),
        maxTokens: Math.min(Math.max(768, maxTokens), 1536),
        requestPurpose: 'fixed-text',
        requestOrigin: origin,
    });
    parseStateTextOutput(repaired, previous, registry, activeFacts);
    return repaired;
}
async function generateValidatedStateText(request, previous, registry, activeFacts, repairOrigin) {
    const raw = await generateTask(request);
    try {
        parseStateTextOutput(raw, previous, registry, activeFacts);
        return raw;
    }
    catch (parseError) {
        if (!repairableStateParseError(parseError))
            throw parseError;
        try {
            return await repairStateText(raw, previous, registry, activeFacts, Number(request.maxTokens) || 1536, repairOrigin);
        }
        catch (repairError) {
            const failure = new Error(`状态返回格式整理失败：${toErrorMessage(parseError)}；整理重试：${toErrorMessage(repairError)}`, { cause: repairError });
            failure.code = 'STATE_FORMAT_REPAIR_FAILED';
            throw failure;
        }
    }
}
async function requestStateText(artifact, previous, activeFacts, registry, systemPrompt, settings) {
    const fullPrompt = stateUserPrompt(previous, artifact.playerText, artifact.assistantText, registry, activeFacts);
    const budget = Math.max(6000, settings.stateContextChars);
    const initialRequest = {
        task: 'state',
        systemPrompt,
        prompt: fullPrompt,
        maxTokens: settings.stateOutputTokens,
        requestPurpose: 'fixed-text',
        requestOrigin: 'state-primary',
    };
    let initialError;
    if (systemPrompt.length + fullPrompt.length <= budget) {
        try {
            return await generateValidatedStateText(initialRequest, previous, registry, activeFacts, 'state-format-repair');
        }
        catch (error) {
            // 主请求已经获得内容但格式整理失败时，不再切块重跑同一正文。
            // 这类重跑会放大调用次数，并可能把同一事实拆成多份。
            if (error?.code === 'STATE_FORMAT_REPAIR_FAILED')
                throw error;
            if (!retryableStateTransportError(error))
                throw error;
            initialError = error;
        }
    }
    const reserve = Math.max(2200, budget - systemPrompt.length - 1800);
    let chunkLimit = Math.max(800, Math.min(settings.stateChunkChars, reserve));
    let chunks = splitStateSource(artifact.assistantText, chunkLimit);
    if (chunks.length > 12) {
        chunkLimit = Math.max(chunkLimit, Math.ceil(String(artifact.assistantText || '').length / 12));
        chunks = splitStateSource(artifact.assistantText, chunkLimit);
    }
    const outputs = [];
    for (let index = 0; index < chunks.length; index += 1) {
        let prompt = initialError
            ? minimalStateChunkPrompt(artifact.playerText, chunks[index], index, chunks.length)
            : stateUserPrompt(previous, artifact.playerText, chunks[index], registry, activeFacts, false);
        if (systemPrompt.length + prompt.length > budget)
            prompt = minimalStateChunkPrompt(artifact.playerText, chunks[index], index, chunks.length);
        outputs.push(await generateValidatedStateText({
            task: 'state',
            systemPrompt,
            prompt,
            maxTokens: Math.min(settings.stateOutputTokens, 2304),
            requestPurpose: 'fixed-text',
            requestOrigin: `state-chunk-${index + 1}-of-${chunks.length}`,
        }, previous, registry, activeFacts, `state-chunk-format-repair-${index + 1}-of-${chunks.length}`));
    }
    const combined = outputs.join('\n');
    parseStateTextOutput(combined, previous, registry, activeFacts);
    return combined;
}
/** 状态任务一次产出内部事实变更和动态快照，成功后由主流水线提交核心结果。 */
async function runStateExtraction(artifact, force = false) {
    const settings = getSettings();
    const registry = normalizeTableRegistry(settings.tableRegistry);
    const active = enabledTables(registry);
    const expectedRegistryFingerprint = hashText(`${registryFingerprint(active)}|${tableLinkRulesFingerprint(settings.tableLinkRules, active)}`);
    const previous = dedupeStrongStateRows(previousSnapshot(artifact.messageIndex), registry);
    const chatState = await getChatState(artifact.chatKey);
    const activeFacts = (chatState.internalFacts ?? [])
        .filter((fact) => fact.storageClass !== 'episodic')
        .filter((fact) => fact.active || !fact.consumedBySmallSummaryId)
        .slice(-120);
    const systemPrompt = stateSystemPrompt(registry, settings.statePrompts, settings.contentLimits, settings.tableLinkRules);
    const prompt = stateUserPrompt(previous, artifact.playerText, artifact.assistantText, registry, activeFacts);
    const inputFingerprint = hashText(JSON.stringify({
        systemPrompt,
        prompt,
        stateContextChars: settings.stateContextChars,
        stateOutputTokens: settings.stateOutputTokens,
        stateChunkChars: settings.stateChunkChars,
    }));
    assertRegistryCurrent(expectedRegistryFingerprint);
    if (!force && artifact.stages.state.status === 'success' && artifact.snapshot && artifact.stateInputFingerprint === inputFingerprint) {
        return normalizeSnapshot(artifact.snapshot, artifact.snapshot, registry);
    }
    markStage(artifact, 'state', 'running');
    await putArtifact(artifact);
    try {
        const raw = await requestStateText(artifact, previous, activeFacts, registry, systemPrompt, settings);
        let parsed;
        try {
            parsed = parseStateTextOutput(raw, previous, registry, activeFacts, {
                sourceText: `${artifact.playerText}\n${artifact.assistantText}`,
            });
        }
        catch (error) {
            const preview = safeText(raw, 1200).replace(/\s+/g, ' ').trim();
            throw new Error(`状态表固定文本无法解析：${toErrorMessage(error)}${preview ? `；返回片段：${preview}` : ''}`, { cause: error });
        }
        if (typeof parsed.turnSummary !== 'string')
            throw new Error('状态返回缺少 turnSummary 字符串');
        if (!Array.isArray(parsed.facts))
            throw new Error('状态返回缺少 facts 数组');
        if (!parsed.snapshot || typeof parsed.snapshot !== 'object' || Array.isArray(parsed.snapshot))
            throw new Error('状态返回缺少 snapshot 根对象');
        // 兼容旧模型返回 state/characters；只迁移到当前注册的角色视图，其他未注册键仍拒绝。
        const characterTable = active.find((table) => table.role === 'characters' || table.role === 'state');
        if (characterTable) {
            if (Array.isArray(parsed.snapshot.state) && !Array.isArray(parsed.snapshot[characterTable.key]))
                parsed.snapshot[characterTable.key] = parsed.snapshot.state;
            if (Array.isArray(parsed.snapshot.characters) && !Array.isArray(parsed.snapshot[characterTable.key]))
                parsed.snapshot[characterTable.key] = parsed.snapshot.characters;
            if (characterTable.key !== 'state')
                delete parsed.snapshot.state;
            if (characterTable.key !== 'characters')
                delete parsed.snapshot.characters;
        }
        const returnedKeys = Object.keys(parsed.snapshot);
        const activeKeys = new Set(active.map((table) => table.key));
        const legacyViewKeys = new Set(['focus', 'state', 'characters', 'skills', 'relationships']);
        for (const key of returnedKeys)
            if (!activeKeys.has(key) && !legacyViewKeys.has(key))
                throw new Error(`模型返回未注册或已停用表格：${key}`);
        parsed.snapshot = attachLocalFactMetadata(migrateSnapshotTables(parsed.snapshot, registry), parsed.facts, registry);
        for (const [key, value] of Object.entries(parsed.snapshot)) {
            if (activeKeys.has(key) && !Array.isArray(value))
                throw new Error(`状态表 ${key} 必须是数组`);
        }
        assertStateBusinessShape(parsed, active);
        assertArtifactCommitCurrent(artifact);
        assertRegistryCurrent(expectedRegistryFingerprint);
        const routedPrevious = applyStateRowRelocations(previous, parsed.relocations, registry);
        const mergedViews = mergeStateRowPatches(routedPrevious, parsed.snapshot, registry);
        const transition = transitionStateSnapshot({
            previous: routedPrevious,
            incoming: mergedViews,
            patchSnapshot: parsed.snapshot,
            facts: parsed.facts,
            internalFacts: chatState.internalFacts,
            registry,
            focusObjectId: chatState.focusObjectId,
            tableLinkRules: settings.tableLinkRules,
        });
        const normalized = transition.snapshot;
        artifact.factPackage = normalizeFactPackage(parsed, artifact.messageKey);
        artifact.snapshot = normalized;
        artifact.sceneBoundary = transition.sceneBoundary;
        artifact.stateInputFingerprint = inputFingerprint;
        markStage(artifact, 'state', 'success');
        await putArtifact(artifact);
        return normalized;
    }
    catch (error) {
        if (error instanceof RegistryChangedError) {
            markStage(artifact, 'state', 'idle');
            await putArtifact(artifact);
            throw error;
        }
        if (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name)) {
            markStage(artifact, 'state', 'cancelled', toErrorMessage(error));
            await putArtifact(artifact);
            throw error;
        }
        markStage(artifact, 'state', 'failed', toErrorMessage(error));
        await putArtifact(artifact);
        throw error;
    }
}

}
};
__defs["pipeline/summary.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"getSettings",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getSettings"]});
Object.defineProperty(__scope,"assertArtifactCommitCurrent",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["assertArtifactCommitCurrent"]});
Object.defineProperty(__scope,"persistChatFor",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["persistChatFor"]});
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"toErrorMessage",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["toErrorMessage"]});
Object.defineProperty(__scope,"markStage",{enumerable:true,configurable:true,get:()=>__require("domain/artifact.js")["markStage"]});
Object.defineProperty(__scope,"markFactsConsumed",{enumerable:true,configurable:true,get:()=>__require("domain/internal-facts.js")["markFactsConsumed"]});
Object.defineProperty(__scope,"markFactsSolidified",{enumerable:true,configurable:true,get:()=>__require("domain/internal-facts.js")["markFactsSolidified"]});
Object.defineProperty(__scope,"pendingFactsByEvent",{enumerable:true,configurable:true,get:()=>__require("domain/internal-facts.js")["pendingFactsByEvent"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
Object.defineProperty(__scope,"isEntryLifecycleHidden",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["isEntryLifecycleHidden"]});
Object.defineProperty(__scope,"finalizeSummarySettlement",{enumerable:true,configurable:true,get:()=>__require("domain/memory-state-machine.js")["finalizeSummarySettlement"]});
Object.defineProperty(__scope,"normalizeSummary",{enumerable:true,configurable:true,get:()=>__require("domain/summary.js")["normalizeSummary"]});
Object.defineProperty(__scope,"generateTask",{enumerable:true,configurable:true,get:()=>__require("llm/generator.js")["generateTask"]});
Object.defineProperty(__scope,"largeSummaryPrompt",{enumerable:true,configurable:true,get:()=>__require("prompts/summary.js")["largeSummaryPrompt"]});
Object.defineProperty(__scope,"largeSummarySystemPrompt",{enumerable:true,configurable:true,get:()=>__require("prompts/summary.js")["largeSummarySystemPrompt"]});
Object.defineProperty(__scope,"smallSummaryBatchPrompt",{enumerable:true,configurable:true,get:()=>__require("prompts/summary.js")["smallSummaryBatchPrompt"]});
Object.defineProperty(__scope,"smallSummarySystemPrompt",{enumerable:true,configurable:true,get:()=>__require("prompts/summary.js")["smallSummarySystemPrompt"]});
Object.defineProperty(__scope,"parseSummaryTextOutput",{enumerable:true,configurable:true,get:()=>__require("domain/summary-text.js")["parseSummaryTextOutput"]});
Object.defineProperty(__scope,"getChatState",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["getChatState"]});
Object.defineProperty(__scope,"putArtifact",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["putArtifact"]});
Object.defineProperty(__scope,"putChatState",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["putChatState"]});
with(__scope){
Object.defineProperty(exports,"generateSmallSummary",{enumerable:true,configurable:true,get:()=>generateSmallSummary});
Object.defineProperty(exports,"generateLargeSummary",{enumerable:true,configurable:true,get:()=>generateLargeSummary});
Object.defineProperty(exports,"runSummaryStage",{enumerable:true,configurable:true,get:()=>runSummaryStage});
Object.defineProperty(exports,"maybeRunSummaries",{enumerable:true,configurable:true,get:()=>maybeRunSummaries});
Object.defineProperty(exports,"rebuildEligibleSummaries",{enumerable:true,configurable:true,get:()=>rebuildEligibleSummaries});
Object.defineProperty(exports,"applySummaryLayer",{enumerable:true,configurable:true,get:()=>applySummaryLayer});
Object.defineProperty(exports,"pendingSmallSummaries",{enumerable:true,configurable:true,get:()=>pendingSmallSummaries});
Object.defineProperty(exports,"hasEligibleSmallSummary",{enumerable:true,configurable:true,get:()=>hasEligibleSmallSummary});
Object.defineProperty(exports,"hasEligibleLargeSummary",{enumerable:true,configurable:true,get:()=>hasEligibleLargeSummary});
/**
 * 模块职责：按 event_id 消费内部事实生成小总结，并仅消费未固化小总结生成大总结。
 * 维护边界：失败不破坏核心事实；同一事实和小总结不得重复消费。
 */
function eventClosed(facts) {
    if (!facts.length)
        return false;
    // 内部事实按首次出现顺序保存，更新时 updatedAt 前移。以最后一次事件状态信号为准：
    // 旧阶段已结束但后续阶段仍活跃时不能关闭；后续明确结果可以覆盖早期“胜负未定”等旧未决表述。
    const latest = facts.reduce((selected, fact, index) => {
        const selectedTime = Date.parse(selected.fact.updatedAt) || 0;
        const factTime = Date.parse(fact.updatedAt) || 0;
        return factTime > selectedTime || (factTime === selectedTime && index > selected.index) ? { fact, index } : selected;
    }, { fact: facts[0], index: 0 }).fact;
    const settled = !latest.active || /(结束|已解决|已关闭|完成|归档|closed|resolved|ended)/i.test(latest.status);
    return settled;
}
function entryToken(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s·•._—–\-|｜:：()（）【】\[\]]+/g, '');
}
function summaryMemoryText(summary) {
    const title = String(summary.title || '').trim();
    const body = String(summary.summary || '').trim();
    return title ? `【${title}】${body}` : body;
}
function rowEventIds(row) {
    return [...new Set([...(row.eventIds ?? []), String(row.eventId || '').trim()].filter(Boolean))];
}
/**
 * 总结不再把同一整段事件摘要复制到所有对象。事件条目只承接事件线摘要；
 * 其他对象只承接模型在 <MA_MEMORY> 中为该对象给出的短结果。
 */
function applySummaryLayer(snapshot, eventId, facts, layer, addition, removals, registryValue) {
    const registry = normalizeTableRegistry(registryValue);
    const relatedTokens = new Set(facts.flatMap((fact) => fact.relatedEntities).map(entryToken).filter(Boolean));
    const eventTitleTokens = new Set(facts.map((fact) => entryToken(fact.title)).filter(Boolean));
    const factIds = new Set(facts.map((fact) => fact.factId).filter(Boolean));
    const next = structuredClone(snapshot);
    const removalEventTexts = new Set(removals.map(summaryMemoryText).filter(Boolean));
    const removalByObject = new Map();
    for (const previous of removals) {
        for (const memory of previous.distributions ?? []) {
            const key = entryToken(memory.objectName);
            if (!key)
                continue;
            const values = removalByObject.get(key) ?? new Set();
            values.add(String(memory.content || '').trim());
            removalByObject.set(key, values);
        }
    }
    const currentFactTextByObject = new Map();
    const eventNames = new Set();
    for (const fact of facts) {
        const title = String(fact.title || '').trim();
        const separator = title.lastIndexOf('·');
        const objectName = separator > 0 ? title.slice(0, separator).trim() : '';
        const layerLabel = separator > 0 ? title.slice(separator + 1).trim() : '';
        if (fact.type === 'events' && objectName)
            eventNames.add(objectName);
        if (!objectName || layerLabel !== '现行事实')
            continue;
        const key = entryToken(objectName);
        const values = currentFactTextByObject.get(key) ?? new Set();
        for (const value of [fact.content, ...fact.occurredFacts]) {
            const text = String(value || '').trim();
            if (text)
                values.add(text);
        }
        currentFactTextByObject.set(key, values);
    }
    const additionByObject = new Map();
    for (const memory of addition?.distributions ?? []) {
        const key = entryToken(memory.objectName);
        const content = String(memory.content || '').trim();
        if (!key || !content)
            continue;
        additionByObject.set(key, [...new Set([...(additionByObject.get(key) ?? []), content])]);
    }
    for (const table of registry) {
        for (const row of next[table.key] ?? []) {
            if (isEntryLifecycleHidden(row))
                continue;
            const rowTokens = [
                entryToken(row.id),
                entryToken(row.title),
                ...(row.keywords ?? []).map(entryToken),
                ...(row.recall?.any ?? []).map(entryToken),
            ].filter(Boolean);
            const linkedByEvent = rowEventIds(row).includes(eventId);
            const linkedByFact = (row.factIds ?? []).some((id) => factIds.has(id));
            const linkedByObject = rowTokens.some((token) => relatedTokens.has(token));
            const linkedEventRow = table.role === 'events' && rowTokens.some((token) => eventTitleTokens.has(token));
            if (!(linkedByEvent || linkedByFact || linkedByObject || linkedEventRow) || row.locked || row.lockMode === 'all')
                continue;
            const objectKey = entryToken(row.title);
            const removeTexts = table.role === 'events'
                ? removalEventTexts
                : (removalByObject.get(objectKey) ?? new Set());
            const addTexts = table.role === 'events'
                ? (addition ? [summaryMemoryText(addition)].filter(Boolean) : [])
                : (additionByObject.get(objectKey) ?? []);
            // 没有该对象自己的模块时，不把事件摘要兜底复制过来。
            if (!removeTexts.size && !addTexts.length)
                continue;
            row.fields ||= {};
            const current = Array.isArray(row.fields[layer])
                ? row.fields[layer].map((item) => String(item ?? '').trim()).filter(Boolean)
                : [];
            const values = [...new Set([...current.filter((item) => !removeTexts.has(item)), ...addTexts])].slice(-24);
            if (JSON.stringify(current) === JSON.stringify(values))
                continue;
            row.fields[layer] = values;
            // 对象自己的低精度承接写入后，移除已经被该总结覆盖的短期“现行事实”副本；当前状态、关系、能力和基础定义继续保留。
            if (table.role !== 'events' && !row.entryLifecycle && addTexts.length) {
                if (layer === 'recentHistory') {
                    const consumedTexts = new Set(currentFactTextByObject.get(objectKey) ?? []);
                    if (row.baseRevisionEvidence?.eventId === eventId)
                        consumedTexts.add(String(row.baseRevisionEvidence.statement || '').trim());
                    if (consumedTexts.size && Array.isArray(row.fields.currentFacts)) {
                        row.fields.currentFacts = row.fields.currentFacts
                            .map((item) => String(item ?? '').trim())
                            .filter((item) => item && !consumedTexts.has(item));
                    }
                }
                if (layer === 'solidifiedHistory') {
                    row.factIds = (row.factIds ?? []).filter((id) => !factIds.has(id));
                    row.eventIds = (row.eventIds ?? []).filter((id) => id !== eventId);
                    if (row.eventId === eventId)
                        row.eventId = row.eventIds[0];
                    if (Array.isArray(row.fields.relatedEvents) && eventNames.size) {
                        row.fields.relatedEvents = row.fields.relatedEvents
                            .map((item) => String(item ?? '').trim())
                            .filter((item) => item && !eventNames.has(item));
                    }
                }
            }
            row.updatedAt = nowIso();
        }
    }
    return next;
}
function pendingSmallEventGroups(facts, threshold, force, boundaryEventIds = []) {
    const boundaryEvents = new Set(boundaryEventIds);
    const allByEvent = new Map();
    for (const fact of facts) {
        const list = allByEvent.get(fact.eventId) ?? [];
        list.push(fact);
        allByEvent.set(fact.eventId, list);
    }
    return [...pendingFactsByEvent(facts).entries()]
        .map(([eventId, eventFacts]) => ({
        eventId,
        facts: eventFacts,
        closed: eventClosed(allByEvent.get(eventId) ?? eventFacts),
        // 只统计上一次成功小总结之后进入当前窗口的消息。完整 sourceMessageIds 仍保留作历史来源，
        // 但不得再次触发阈值，否则同一事实更新后会从第一个达标回合起每轮重复总结。
        messages: new Set(eventFacts.flatMap((fact) => fact.pendingSourceMessageIds ?? fact.sourceMessageIds)).size,
    }))
        // 开放事件只按跨消息进度或明确结束触发；单回合返回很多事实不能被误判为完成了一段事件线。
        .filter((group) => force || group.closed || boundaryEvents.has(group.eventId) || group.messages >= threshold)
        .sort((a, b) => Number(b.closed) - Number(a.closed) || b.facts.length - a.facts.length || a.eventId.localeCompare(b.eventId));
}
/** 兼容旧调用：仅返回每条事件线当前活动的小总结版本。 */
function pendingSmallSummaries(small, large) {
    const consumed = new Set(large.flatMap((item) => item.sourceSummaryIds ?? item.sourceKeys));
    return small.filter((item) => !item.solidifiedByLargeSummaryId && !item.supersededBySmallSummaryId && !consumed.has(item.id));
}
function pendingLargeEventGroups(small, large, threshold, force) {
    const consumed = new Set(large.flatMap((item) => item.sourceSummaryIds ?? item.sourceKeys));
    const groups = new Map();
    for (const item of small) {
        if (item.solidifiedByLargeSummaryId || consumed.has(item.id))
            continue;
        // 缺 event_id 的旧数据按自身 ID 隔离，绝不因标题相似把不同事件混线。
        const eventId = String(item.eventId || item.id).trim();
        groups.set(eventId, [...(groups.get(eventId) ?? []), item]);
    }
    const minimum = Math.max(1, Math.round(Number(threshold) || 4));
    const output = [];
    for (const [eventId, items] of groups) {
        const ordered = items.map((item, index) => ({ item, index })).sort((a, b) => String(a.item.createdAt || '').localeCompare(String(b.item.createdAt || '')) || a.index - b.index).map(({ item }) => item);
        const latest = [...ordered].reverse().find((item) => !item.supersededBySmallSummaryId) ?? ordered.at(-1);
        const closed = latest.eventClosed === true;
        const rollupCount = Math.max(ordered.length, Number(latest.rollupCount) || 1);
        if (!force && !closed && rollupCount < minimum)
            continue;
        const previousLarge = [...large].reverse().find((item) => item.eventId === eventId || item.eventIds?.includes(eventId));
        output.push({
            eventId,
            items: ordered,
            latest,
            previousLarge,
            // 小总结新版本是累计版本；大总结只直接读取最新版本，但提交后要把整条旧版本链一起标记为已固化。
            sourceSummaryIds: [latest.id],
            consumedVersionIds: ordered.map((item) => item.id),
            sourceFactIds: [...new Set(latest.sourceFactIds ?? latest.sourceKeys)],
            rollupCount,
            closed,
        });
    }
    return output.sort((a, b) => Number(b.closed) - Number(a.closed)
        || b.items.length - a.items.length
        || a.eventId.localeCompare(b.eventId));
}
function hasEligibleSmallSummary(facts, threshold, boundaryEventIds = []) {
    return pendingSmallEventGroups(facts, Math.max(1, Math.round(Number(threshold) || 12)), false, boundaryEventIds).length > 0;
}
function hasEligibleLargeSummary(small, large, threshold) {
    return pendingLargeEventGroups(small, large, threshold, false).length > 0;
}
async function generateSmallSummary(artifact, force = false) {
    const settings = getSettings();
    const chatState = await getChatState(artifact.chatKey);
    const threshold = Math.max(1, Math.round(Number(settings.smallSummaryTurns) || 12));
    // 尽量一次处理所有到期事件线；上限只防止极端输入重新撞上网关超时。
    const boundaryEventIds = artifact.sceneBoundary?.eventIds ?? [];
    const selected = pendingSmallEventGroups(chatState.internalFacts ?? [], threshold, force, boundaryEventIds).slice(0, 8);
    if (!selected.length)
        return null;
    const prepared = selected.map((group) => ({
        ...group,
        previous: [...chatState.smallSummaries].reverse().find((item) => item.eventId === group.eventId && !item.solidifiedByLargeSummaryId && !item.supersededBySmallSummaryId),
    }));
    const slotted = prepared.map((group, index) => ({ ...group, slot: `S${index + 1}` }));
    const raw = await generateTask({
        task: 'smallSummary',
        systemPrompt: smallSummarySystemPrompt(settings.summaryPrompts.small, settings.contentLimits.smallSummary),
        prompt: smallSummaryBatchPrompt(slotted.map((group) => ({ slot: group.slot, eventId: group.eventId, facts: group.facts, previous: group.previous }))),
        maxTokens: Math.min(2200, 700 + prepared.length * 260),
        requestPurpose: 'fixed-text',
    });
    assertArtifactCommitCurrent(artifact);
    let bySlot;
    try {
        bySlot = parseSummaryTextOutput(raw, slotted.map((group) => group.slot));
    }
    catch (error) {
        const preview = safeText(raw, 1200).replace(/\s+/g, ' ').trim();
        throw new Error(`小总结未返回有效固定文本：${toErrorMessage(error)}${preview ? `；返回片段：${preview}` : ''}`, { cause: error });
    }
    const generated = slotted.map((group) => {
        const newFactIds = group.facts.map((fact) => fact.factId);
        const sourceFactIds = [...new Set([...(group.previous?.sourceFactIds ?? group.previous?.sourceKeys ?? []), ...newFactIds])];
        const text = bySlot.get(group.slot);
        const summary = normalizeSummary({ title: text.title, summary: text.summary, keywords: text.keywords, unresolved: text.unresolved }, 'small', sourceFactIds, undefined, { eventId: group.eventId, sourceFactIds });
        summary.distributions = text.distributions;
        summary.previousSmallSummaryId = group.previous?.id;
        // 小总结旧版本在对象分发后会退出，因此用累计次数保留大总结阈值进度。
        summary.rollupCount = group.previous
            ? Math.max(1, Number(group.previous.rollupCount) || 1) + 1
            : 1;
        summary.eventClosed = group.closed;
        if (!summary.summary)
            throw new Error(`小总结模型返回空摘要：${group.eventId}`);
        if (summary.summary.length > settings.contentLimits.smallSummary)
            throw new Error(`小总结超过白盒硬上限：${summary.summary.length}/${settings.contentLimits.smallSummary} 字（${group.eventId}）`);
        return { group, summary, newFactIds };
    });
    const previousSnapshot = artifact.snapshot ? structuredClone(artifact.snapshot) : undefined;
    const previousFacts = structuredClone(chatState.internalFacts);
    const previousSummaries = structuredClone(chatState.smallSummaries);
    try {
        chatState.smallSummaries.push(...generated.map((item) => item.summary));
        for (const { group, summary, newFactIds } of generated) {
            if (group.previous)
                group.previous.supersededBySmallSummaryId = summary.id;
            markFactsConsumed(chatState.internalFacts, newFactIds, summary.id);
        }
        if (artifact.snapshot) {
            let nextSnapshot = artifact.snapshot;
            for (const { group, summary, newFactIds } of generated) {
                nextSnapshot = applySummaryLayer(nextSnapshot, group.eventId, group.facts, 'recentHistory', summary, group.previous ? [group.previous] : [], settings.tableRegistry);
                const settlement = finalizeSummarySettlement({
                    snapshot: nextSnapshot,
                    eventId: group.eventId,
                    sourceFactIds: summary.sourceFactIds ?? [],
                    eventClosed: group.closed,
                    internalFacts: chatState.internalFacts,
                    coverageKind: 'small',
                    registry: settings.tableRegistry,
                    focusObjectId: chatState.focusObjectId,
                });
                nextSnapshot = settlement.snapshot;
                summary.sedimentation = {
                    removeRowIds: [],
                    characterActivityUpdates: [],
                    appliedRowIds: [...settlement.deletedRowIds],
                    ignoredRowIds: [...settlement.retainedRowIds],
                    notes: settlement.deletedRowIds.length
                        ? [`总结覆盖后由统一状态机物理删除：${settlement.deletedRowIds.join('、')}`]
                        : ['总结已写入覆盖标记；没有满足删除契约的待结算容器。'],
                };
            }
            artifact.snapshot = nextSnapshot;
            assertArtifactCommitCurrent(artifact);
            await persistChatFor(artifact.chatKey);
        }
        // 小总结是加工容器：同一事件只保留当前累计版本，旧版本在完成对象分发后退出。
        chatState.smallSummaries = chatState.smallSummaries.filter((item) => !item.supersededBySmallSummaryId);
        await putChatState(chatState);
    }
    catch (error) {
        artifact.snapshot = previousSnapshot;
        chatState.internalFacts = previousFacts;
        chatState.smallSummaries = previousSummaries;
        try {
            assertArtifactCommitCurrent(artifact);
            await persistChatFor(artifact.chatKey).catch(() => undefined);
        }
        catch {
            // 聊天或正文已变化，旧任务回滚不得接触新聊天。
        }
        throw error;
    }
    return generated.at(-1)?.summary ?? null;
}
async function generateLargeSummary(artifact, force = false) {
    const settings = getSettings();
    const chatState = await getChatState(artifact.chatKey);
    const threshold = Math.max(1, Number(settings.largeSummaryCount) || 4);
    // 尽量一次处理所有到期事件线；设上限只用于防止极端输入重新撞上网关超时。
    const groups = pendingLargeEventGroups(chatState.smallSummaries, chatState.largeSummaries, threshold, force).slice(0, 8);
    if (!groups.length)
        return null;
    const slotted = groups.map((group, index) => ({ ...group, slot: `L${index + 1}` }));
    const raw = await generateTask({
        task: 'largeSummary',
        systemPrompt: largeSummarySystemPrompt(settings.summaryPrompts.large, settings.contentLimits.largeSummary),
        prompt: largeSummaryPrompt(slotted.map((group) => ({
            slot: group.slot,
            eventId: group.eventId,
            latestSmall: group.latest,
            sourceSummaryIds: group.sourceSummaryIds,
            previousLarge: group.previousLarge,
        }))),
        maxTokens: Math.min(2200, 700 + groups.length * 260),
        requestPurpose: 'fixed-text',
    });
    assertArtifactCommitCurrent(artifact);
    let bySlot;
    try {
        bySlot = parseSummaryTextOutput(raw, slotted.map((group) => group.slot));
    }
    catch (error) {
        const preview = safeText(raw, 1200).replace(/\s+/g, ' ').trim();
        throw new Error(`大总结未返回有效固定文本：${toErrorMessage(error)}${preview ? `；返回片段：${preview}` : ''}`, { cause: error });
    }
    const generated = slotted.map((group) => {
        const text = bySlot.get(group.slot);
        const value = { title: text.title, summary: text.summary, keywords: text.keywords, unresolved: text.unresolved };
        const summary = normalizeSummary(value, 'large', group.sourceSummaryIds, group.previousLarge?.id, {
            eventId: group.eventId,
            eventIds: [group.eventId],
            sourceSummaryIds: group.sourceSummaryIds,
            sourceFactIds: group.sourceFactIds,
        });
        summary.distributions = text.distributions;
        if (!summary.summary)
            throw new Error(`大总结模型返回空摘要：${group.eventId}`);
        if (summary.summary.length > settings.contentLimits.largeSummary)
            throw new Error(`大总结超过白盒硬上限：${summary.summary.length}/${settings.contentLimits.largeSummary} 字（${group.eventId}）`);
        return { group, summary };
    });
    const previousLargeList = structuredClone(chatState.largeSummaries);
    const previousSmall = structuredClone(chatState.smallSummaries);
    const previousFacts = structuredClone(chatState.internalFacts);
    const previousSnapshot = artifact.snapshot ? structuredClone(artifact.snapshot) : undefined;
    try {
        chatState.largeSummaries.push(...generated.map((item) => item.summary));
        for (const { group, summary } of generated) {
            const selectedIds = new Set(group.consumedVersionIds);
            for (const item of chatState.smallSummaries)
                if (selectedIds.has(item.id))
                    item.solidifiedByLargeSummaryId = summary.id;
            markFactsSolidified(chatState.internalFacts, group.sourceFactIds, summary.id);
        }
        if (artifact.snapshot) {
            let nextSnapshot = artifact.snapshot;
            for (const { group, summary } of generated) {
                const eventFacts = chatState.internalFacts.filter((fact) => fact.eventId === group.eventId);
                nextSnapshot = applySummaryLayer(nextSnapshot, group.eventId, eventFacts, 'recentHistory', undefined, group.items, settings.tableRegistry);
                nextSnapshot = applySummaryLayer(nextSnapshot, group.eventId, eventFacts, 'solidifiedHistory', summary, group.previousLarge ? [group.previousLarge] : [], settings.tableRegistry);
                const settlement = finalizeSummarySettlement({
                    snapshot: nextSnapshot,
                    eventId: group.eventId,
                    sourceFactIds: summary.sourceFactIds ?? [],
                    eventClosed: eventClosed(eventFacts),
                    internalFacts: chatState.internalFacts,
                    coverageKind: 'large',
                    registry: settings.tableRegistry,
                    focusObjectId: chatState.focusObjectId,
                });
                nextSnapshot = settlement.snapshot;
                summary.sedimentation = {
                    removeRowIds: [],
                    characterActivityUpdates: [],
                    appliedRowIds: [...settlement.deletedRowIds],
                    ignoredRowIds: [...settlement.retainedRowIds],
                    notes: settlement.deletedRowIds.length
                        ? [`大总结覆盖后由统一状态机物理删除：${settlement.deletedRowIds.join('、')}`]
                        : ['大总结已固化；没有满足删除契约的待结算容器。'],
                };
            }
            artifact.snapshot = nextSnapshot;
            assertArtifactCommitCurrent(artifact);
            await persistChatFor(artifact.chatKey);
        }
        // 大总结完成固化后，已消费的小总结不再作为独立条目保留。
        const consumedSmallIds = new Set(generated.flatMap(({ group }) => group.consumedVersionIds));
        chatState.smallSummaries = chatState.smallSummaries.filter((item) => !consumedSmallIds.has(item.id));
        // 大总结同样只是加工容器：开放事件保留当前累计版本；关闭事件已分发到长期宿主后移除正文容器。
        const closedEventIds = new Set(generated.filter((item) => item.group.closed).map((item) => item.group.eventId));
        const supersededLargeIds = new Set(generated.map((item) => item.summary.previousLargeSummaryId).filter(Boolean));
        chatState.largeSummaries = chatState.largeSummaries.filter((item) => {
            if (supersededLargeIds.has(item.id))
                return false;
            if (closedEventIds.has(String(item.eventId || '')))
                return false;
            return true;
        });
        await putChatState(chatState);
        const readBack = await getChatState(artifact.chatKey);
        const retainedGeneratedIds = new Set(generated
            .filter((item) => !item.group.closed)
            .map((item) => item.summary.id));
        if (![...retainedGeneratedIds].every((id) => readBack.largeSummaries.some((item) => item.id === id))) {
            throw new Error('开放事件大总结写入后回读校验失败');
        }
    }
    catch (error) {
        artifact.snapshot = previousSnapshot;
        chatState.largeSummaries = previousLargeList;
        chatState.smallSummaries = previousSmall;
        chatState.internalFacts = previousFacts;
        if (previousSnapshot) {
            try {
                assertArtifactCommitCurrent(artifact);
                await persistChatFor(artifact.chatKey).catch(() => undefined);
            }
            catch {
                // 聊天或正文已变化，旧总结回滚不得接触新聊天。
            }
        }
        throw error;
    }
    return generated.at(-1)?.summary ?? null;
}
async function runSummaryStage(artifact, kind, force = false) {
    const settings = getSettings();
    const enabled = kind === 'small' ? settings.autoSmallSummary : settings.autoLargeSummary;
    if (!enabled && !force)
        return false;
    const previousStatus = artifact.stages.summary.status;
    const preserveEarlierFailure = !force && previousStatus === 'failed';
    if (!preserveEarlierFailure)
        markStage(artifact, 'summary', 'running');
    await putArtifact(artifact);
    try {
        const generated = kind === 'small'
            ? await generateSmallSummary(artifact, force)
            : await generateLargeSummary(artifact, force);
        if (!preserveEarlierFailure)
            markStage(artifact, 'summary', generated || previousStatus === 'success' ? 'success' : 'skipped');
        await putArtifact(artifact);
        return Boolean(generated);
    }
    catch (error) {
        if (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name)) {
            if (!preserveEarlierFailure)
                markStage(artifact, 'summary', 'cancelled', toErrorMessage(error));
            await putArtifact(artifact);
            throw error;
        }
        const label = kind === 'small' ? '小总结' : '大总结';
        const previous = artifact.stages.summary.error;
        const current = `${label}失败：${toErrorMessage(error)}`;
        markStage(artifact, 'summary', 'failed', previous && previous !== current ? `${previous}；${current}` : current);
        await putArtifact(artifact);
        throw error;
    }
}
async function maybeRunSummaries(artifact, forceSmall = false, forceLarge = false) {
    // Runtime V2 invariant: one turn / one maintenance action may commit at
    // most one summary layer. Small summary always has priority; large summary
    // must wait for a later turn or a separate explicit action.
    if (forceSmall) {
        await runSummaryStage(artifact, 'small', true);
        return;
    }
    if (forceLarge) {
        await runSummaryStage(artifact, 'large', true);
        return;
    }
    const settings = getSettings();
    const state = await getChatState(artifact.chatKey);
    if (settings.autoSmallSummary && hasEligibleSmallSummary(
        state.internalFacts ?? [],
        settings.smallSummaryTurns,
        artifact.sceneBoundary?.eventIds ?? [],
    )) {
        await runSummaryStage(artifact, 'small', false);
        return;
    }
    if (settings.autoLargeSummary && hasEligibleLargeSummary(
        state.smallSummaries ?? [],
        state.largeSummaries ?? [],
        settings.largeSummaryCount,
    )) {
        await runSummaryStage(artifact, 'large', false);
    }
}

/** 历史恢复专用：不 force，只把当前确实达到条件的受影响事件线与未固化小总结排空。 */
async function rebuildEligibleSummaries(artifact) {
    const settings = getSettings();
    const errors = [];
    let generatedAny = false;
    const previousStatus = artifact.stages.summary.status;
    markStage(artifact, 'summary', 'running');
    await putArtifact(artifact);
    if (settings.autoSmallSummary) {
        try {
            while (await generateSmallSummary(artifact, false)) {
                generatedAny = true;
                // 每次成功至少消费一个 event_id 的待总结事实，循环必然收敛。
            }
        }
        catch (error) {
            if (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name))
                throw error;
            errors.push(`小总结：${toErrorMessage(error)}`);
        }
    }
    if (settings.autoLargeSummary) {
        try {
            while (await generateLargeSummary(artifact, false)) {
                generatedAny = true;
                // 每次成功固化一批未固化小总结，剩余不足阈值时停止。
            }
        }
        catch (error) {
            if (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name))
                throw error;
            errors.push(`大总结：${toErrorMessage(error)}`);
        }
    }
    if (errors.length) {
        markStage(artifact, 'summary', 'failed', errors.join('；'));
        await putArtifact(artifact);
        throw new Error(errors.join('；'));
    }
    markStage(artifact, 'summary', generatedAny || previousStatus === 'success'
        ? 'success'
        : 'skipped');
    await putArtifact(artifact);
}

}
};
__defs["pipeline/task-queue.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"makeId",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["makeId"]});
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
Object.defineProperty(__scope,"toErrorMessage",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["toErrorMessage"]});
with(__scope){
Object.defineProperty(exports,"TaskBlockedError",{enumerable:true,configurable:true,get:()=>TaskBlockedError});
Object.defineProperty(exports,"TaskSkippedError",{enumerable:true,configurable:true,get:()=>TaskSkippedError});
Object.defineProperty(exports,"TaskQueue",{enumerable:true,configurable:true,get:()=>TaskQueue});
Object.defineProperty(exports,"taskQueue",{enumerable:true,configurable:true,get:()=>taskQueue});
/** 业务前置条件未满足。任务已被正确阻断，不属于执行失败。 */
class TaskBlockedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TaskBlockedError';
    }
}
/** 输入已经由同版本流水线完成，不需要再次执行。 */
class TaskSkippedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TaskSkippedError';
    }
}
function cancelledError(message) {
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
}
function elapsed(startedAt, finishedAt = Date.now()) {
    return startedAt === undefined ? undefined : Math.max(0, finishedAt - startedAt);
}
const DEFAULT_PRIORITIES = {
    audit: 100,
    revision: 100,
    state: 90,
    manual: 70,
    sync: 40,
    smallSummary: 30,
    largeSummary: 10,
};
/**
 * 全插件只有一个 active 业务任务。优先级决定下一个 pending；显式取消只用于安全让位，不引入并发写入。
 */
class TaskQueue {
    static MAX_TASKS = 200;
    inFlight = new Map();
    tasks = new Map();
    listeners = new Set();
    accepting = true;
    generation = 0;
    sequence = 0;
    pending = [];
    active = null;
    idleWaiters = new Set();
    setAccepting(accepting) {
        if (this.accepting && !accepting) {
            this.generation += 1;
            this.cancelActiveMatching(() => true, '镜渊已禁用，运行任务已请求取消');
            this.cancelPending(() => true, '镜渊已禁用，排队任务已取消');
        }
        this.accepting = accepting;
        if (accepting)
            this.pump();
    }
    isTerminal(task) {
        return !['running', 'queued'].includes(String(task.state));
    }
    pruneTasks() {
        while (this.tasks.size > TaskQueue.MAX_TASKS) {
            const removable = [...this.tasks.entries()].find(([, task]) => this.isTerminal(task));
            if (!removable)
                break;
            this.tasks.delete(removable[0]);
        }
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    notify() {
        for (const listener of this.listeners) {
            try {
                listener();
            }
            catch (error) {
                console.warn('[MirrorAbyss] task listener failed', error);
            }
        }
    }
    list() {
        return [...this.tasks.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }
    has(key) {
        return this.inFlight.has(key);
    }
    clearHistory() {
        for (const [id, task] of this.tasks) {
            if (this.isTerminal(task))
                this.tasks.delete(id);
        }
        this.notify();
    }
    resetRuntime() {
        this.generation += 1;
        this.cancelActiveMatching(() => true, '镜渊运行环境已重置，运行任务已请求取消');
        this.cancelPending(() => true, '镜渊运行环境已重置，排队任务已取消');
        this.clearHistory();
        this.notify();
    }
    resolveIdle() {
        if (this.active || this.pending.length)
            return;
        for (const resolve of this.idleWaiters)
            resolve();
        this.idleWaiters.clear();
    }
    async whenIdle() {
        if (!this.active && !this.pending.length)
            return;
        await new Promise((resolve) => this.idleWaiters.add(resolve));
    }
    cancelPendingByChatKey(chatKey, reason = '聊天已切换，旧聊天排队任务已取消') {
        return this.cancelPending((job) => job.chatKey === chatKey, reason);
    }
    cancelPendingOutsideChat(chatKey, reason = '聊天已切换，旧聊天排队任务已取消') {
        return this.cancelPending((job) => Boolean(job.chatKey && job.chatKey !== chatKey), reason);
    }
    cancelPendingDerivedByChatKey(chatKey, reason = '已有更新的正文状态，旧派生任务已取消') {
        return this.cancelPending((job) => Boolean(job.chatKey === chatKey
            && job.task.automatic === true
            && ['smallSummary', 'largeSummary', 'sync'].includes(String(job.task.kind))), reason);
    }
    /**
     * 只标记当前 active 任务取消；调用方负责取消其外部请求。任务守卫会阻止迟到结果提交。
     */
    cancelActiveMatching(predicate, reason = '运行中的任务已被更高优先级工作取代') {
        const job = this.active;
        if (!job || !predicate(job.task) || job.cancelReason)
            return false;
        job.cancelReason = reason;
        job.task.cancelRequestedAt = nowIso();
        job.task.cancelReason = reason;
        this.notify();
        return true;
    }
    cancelPendingMatching(predicate, reason = '排队任务已失效') {
        return this.cancelPending((job) => predicate(job.task), reason);
    }
    cancelPending(predicate, reason) {
        const remaining = [];
        let cancelled = 0;
        const now = Date.now();
        for (const job of this.pending) {
            if (!predicate(job)) {
                remaining.push(job);
                continue;
            }
            cancelled += 1;
            job.task.state = 'cancelled';
            job.task.error = reason;
            job.task.cancelReason = reason;
            job.task.cancelRequestedAt = nowIso();
            job.task.finishedAt = nowIso();
            job.task.queueWaitMs = elapsed(job.task.createdAtMs, now);
            job.task.totalMs = elapsed(job.task.createdAtMs, now);
            if (this.inFlight.get(job.task.key) === job.promise)
                this.inFlight.delete(job.task.key);
            job.reject(cancelledError(reason));
        }
        this.pending = remaining;
        if (cancelled) {
            this.pruneTasks();
            this.notify();
        }
        this.resolveIdle();
        return cancelled;
    }
    /** 从 pending 中选择最高优先级任务；同优先级保持进入顺序。 */
    selectNext() {
        if (!this.pending.length)
            return null;
        let selectedIndex = 0;
        for (let index = 1; index < this.pending.length; index += 1) {
            const candidate = this.pending[index];
            const selected = this.pending[selectedIndex];
            if (candidate.priority > selected.priority || (candidate.priority === selected.priority && candidate.sequence < selected.sequence)) {
                selectedIndex = index;
            }
        }
        return this.pending.splice(selectedIndex, 1)[0] ?? null;
    }
    pump() {
        if (this.active || !this.accepting) {
            this.resolveIdle();
            return;
        }
        const job = this.selectNext();
        if (!job) {
            this.resolveIdle();
            return;
        }
        this.active = job;
        const task = job.task;
        const startedMs = Date.now();
        task.state = 'running';
        task.startedAt = nowIso();
        task.startedAtMs = startedMs;
        task.queueWaitMs = elapsed(task.createdAtMs, startedMs);
        this.notify();
        const guard = {
            generation: job.generation,
            assertCurrent: () => {
                if (job.cancelReason)
                    throw cancelledError(job.cancelReason);
                if (!this.accepting || job.generation !== this.generation) {
                    throw cancelledError('镜渊生命周期已变化，旧任务结果不再提交');
                }
            },
        };
        void Promise.resolve()
            .then(async () => {
            guard.assertCurrent();
            const result = await job.work(guard);
            guard.assertCurrent();
            return result;
        })
            .then((result) => {
            task.state = 'success';
            job.resolve(result);
        })
            .catch((error) => {
            // 一旦任务已被生命周期/聊天切换明确取消，迟到的上游错误不能把终态改写成 failed。
            // 取消意图优先；原始请求错误仍可在请求诊断中查看。
            const cancelled = Boolean(job.cancelReason)
                || (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name));
            const blocked = error instanceof TaskBlockedError
                || (error instanceof Error && error.name === 'TaskBlockedError');
            const skipped = error instanceof TaskSkippedError
                || (error instanceof Error && error.name === 'TaskSkippedError');
            task.state = cancelled ? 'cancelled' : blocked ? 'blocked' : skipped ? 'skipped' : 'failed';
            if (skipped) {
                task.skipReason = toErrorMessage(error);
                delete task.error;
            }
            else {
                task.error = cancelled && job.cancelReason ? job.cancelReason : toErrorMessage(error);
            }
            job.reject(cancelled && job.cancelReason ? cancelledError(job.cancelReason) : error);
        })
            .finally(() => {
            const finishedMs = Date.now();
            task.finishedAt = nowIso();
            task.runMs = elapsed(startedMs, finishedMs);
            task.totalMs = elapsed(task.createdAtMs, finishedMs);
            if (this.inFlight.get(task.key) === job.promise)
                this.inFlight.delete(task.key);
            if (this.active === job)
                this.active = null;
            this.pruneTasks();
            this.notify();
            this.pump();
        });
    }
    /**
     * 相同 key 的任务共享同一 Promise；generation 与 guard 共同阻止禁用/重启后的旧任务提交。
     */
    run(key, label, kind, work, options = {}) {
        if (!this.accepting)
            return Promise.reject(cancelledError('镜渊已禁用，不再接受新任务'));
        const existing = this.inFlight.get(key);
        if (existing)
            return existing;
        const createdMs = Date.now();
        const priority = Number.isFinite(options.priority)
            ? Number(options.priority)
            : (DEFAULT_PRIORITIES[String(kind)] ?? 50);
        const task = {
            id: makeId('task'),
            key,
            label,
            kind,
            state: 'queued',
            createdAt: nowIso(),
            createdAtMs: createdMs,
            priority,
            chatKey: options.chatKey,
            triggerSource: options.triggerSource,
            messageKey: options.messageKey,
            messageFingerprint: options.messageFingerprint,
            historyRevisionAtEnqueue: options.historyRevisionAtEnqueue,
            historyRecoveryPhaseAtEnqueue: options.historyRecoveryPhaseAtEnqueue,
            automatic: options.automatic === true,
        };
        this.tasks.set(task.id, task);
        let resolve;
        let reject;
        const promise = new Promise((resolveValue, rejectValue) => {
            resolve = resolveValue;
            reject = rejectValue;
        });
        const job = {
            task,
            work,
            generation: this.generation,
            sequence: this.sequence += 1,
            priority,
            chatKey: options.chatKey,
            promise,
            resolve,
            reject,
        };
        this.pending.push(job);
        this.inFlight.set(key, promise);
        this.pruneTasks();
        this.notify();
        this.pump();
        return promise;
    }
}
const taskQueue = new TaskQueue();

}
};
__defs["prompts/audit.js"]=function(exports,__require){
const __scope=Object.create(null);
with(__scope){
Object.defineProperty(exports,"auditSystemPrompt",{enumerable:true,configurable:true,get:()=>auditSystemPrompt});
Object.defineProperty(exports,"auditUserPrompt",{enumerable:true,configurable:true,get:()=>auditUserPrompt});
/**
 * 模块职责：构造审核固定文本协议提示。
 * 维护边界：模型不生成 JSON；插件负责解析、指纹、存储和后续流程。
 */
function auditSystemPrompt() {
    return `你是“镜渊”规则审核器。你只检查给定AI正文是否违反玩家提供的硬性规则，不续写，不润色，不替正文辩护。

必须返回固定文本协议，禁止JSON、Markdown代码块、解释、前言、结语和思考标签。

主结果必须且只能有一个：
<MA_AUDIT>
result=pass|revise|block
reason=一句话结论
preserve=修正时必须保留的外部事实（可重复多行）
rewrite=给修正文模型的完整修改指令
</MA_AUDIT>

每项明确违规单独返回：
<MA_VIOLATION>
rule_id=稳定、简短的规则编号
rule=被违反的规则
evidence=正文中的具体违规片段或准确概述
action=应如何修改，必须具体可执行
</MA_VIOLATION>

若判定 revise 且能严格最小修正，可额外返回完整替换正文：
<MA_REPLACEMENT>
修正后的完整正文
</MA_REPLACEMENT>

判定标准：
- pass：没有明确违规，不输出 <MA_VIOLATION> 和 <MA_REPLACEMENT>。
- revise：可以在不改变已经成立的外部事件、NPC行为和事件顺序的前提下定向修正。
- block：整段内容建立在违规前提上，无法局部修正而不重构剧情。

规则：
1. 只列出有明确证据的违规。
2. evidence必须足以让修正文模型定位问题。
3. action必须说明“删什么、保留什么、用什么可观察事实替代”，不能只写“不要违规”。
4. preserve只写已经成立且不能被修正模型改动的外部事实。
5. 字段内容使用自然语言；外层标签和字段名必须严格保持。`;
}
function auditUserPrompt(rulePrompt, playerText, assistantText) {
    return `【玩家审核规则】
${rulePrompt}

【玩家本轮输入】
${playerText || '（空）'}

【待审核AI正文】
${assistantText}`;
}

}
};
__defs["prompts/revision.js"]=function(exports,__require){
const __scope=Object.create(null);
with(__scope){
Object.defineProperty(exports,"revisionSystemPrompt",{enumerable:true,configurable:true,get:()=>revisionSystemPrompt});
Object.defineProperty(exports,"revisionUserPrompt",{enumerable:true,configurable:true,get:()=>revisionUserPrompt});
function revisionSystemPrompt(customPrompt = '') {
    return `你是“镜渊”正文定向修正器。你的任务是修正已有正文，不是重新创作。

硬性要求：
1. 只修改审核指出的违规部分。
2. 保留原有时间、地点、事件顺序、NPC已经发生的动作与对白、物品状态和已经成立的外部结果。
3. 不增加新人物、新事件、新线索、新对白、新行动或新结果。
4. 不替玩家焦点补充未声明的心理、判断、决定、目标、注意力或行动理由。
5. 若删除违规句会造成语法断裂，可用最小量的外部可观察事实连接，但不得扩展剧情。
6. 只输出修正后的完整正文，不输出标题、说明、审核报告、前后对比或Markdown代码块。
${customPrompt.trim() ? `\n【玩家附加修正要求】\n${customPrompt.trim()}` : ''}`;
}
function revisionUserPrompt(playerRules, playerText, sourceText, audit, attempt) {
    const violations = audit.violations
        .map((item, index) => `${index + 1}. 规则：${item.rule}\n   证据：${item.evidence}\n   修改：${item.action}`)
        .join('\n');
    const preserve = audit.preserve.length ? audit.preserve.map((item) => `- ${item}`).join('\n') : '- 原正文中全部已成立的外部事实';
    return `【修正轮次】
第${attempt}次

【玩家硬性规则】
${playerRules}

【玩家本轮输入】
${playerText || '（空）'}

【必须修正的问题】
${violations || audit.reason}

【必须保留】
${preserve}

【审核器综合修改指令】
${audit.rewriteInstruction || audit.reason}

【待修正文】
${sourceText}

只输出修正后的完整正文。`;
}

}
};
__defs["prompts/state.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"DEFAULT_CONTENT_LIMITS",{enumerable:true,configurable:true,get:()=>__require("constants.js")["DEFAULT_CONTENT_LIMITS"]});
Object.defineProperty(__scope,"DEFAULT_STATE_PROMPTS",{enumerable:true,configurable:true,get:()=>__require("constants.js")["DEFAULT_STATE_PROMPTS"]});
Object.defineProperty(__scope,"CORE_FIELD_KEYS",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["CORE_FIELD_KEYS"]});
Object.defineProperty(__scope,"EDITABLE_HEADER_FIELD_KEYS",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["EDITABLE_HEADER_FIELD_KEYS"]});
Object.defineProperty(__scope,"DEFAULT_TABLE_REGISTRY",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["DEFAULT_TABLE_REGISTRY"]});
Object.defineProperty(__scope,"enabledTables",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["enabledTables"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
Object.defineProperty(__scope,"enabledTableLinkRules",{enumerable:true,configurable:true,get:()=>__require("domain/table-link-rules.js")["enabledTableLinkRules"]});
Object.defineProperty(__scope,"stateLayerLabelForField",{enumerable:true,configurable:true,get:()=>__require("domain/state-semantics.js")["stateLayerLabelForField"]});
Object.defineProperty(__scope,"writableStateLayers",{enumerable:true,configurable:true,get:()=>__require("domain/state-semantics.js")["writableStateLayers"]});
with(__scope){
Object.defineProperty(exports,"stateSystemPrompt",{enumerable:true,configurable:true,get:()=>stateSystemPrompt});
Object.defineProperty(exports,"stateUserPrompt",{enumerable:true,configurable:true,get:()=>stateUserPrompt});
Object.defineProperty(exports,"stateTextProtocolDescription",{enumerable:true,configurable:true,get:()=>stateTextProtocolDescription});
/**
 * 模块职责：依据动态表格注册表构造内部事实与行级状态固定文本协议。
 * 维护边界：只提取已发生、已显影内容；未返回行由插件保留，禁止模型重写完整旧快照。
 */
const ACTIVE_STATUS_RE = /current|active|进行|当前|活跃|未决|持续|开放|受限|暂停/i;
const DIRECTORY_CHAR_BUDGET = 1600;
const MAX_DIRECTORY_ALIASES = 6;
const MAX_FULL_ROWS = 6;
const MAX_FULL_ROWS_PER_TABLE = 2;
const MAX_FACTS = 6;
function tables(registry) {
    return enabledTables(normalizeTableRegistry(registry?.length ? registry : DEFAULT_TABLE_REGISTRY));
}
const COMMON_STATE_LAYER_LABELS = new Set([
    '当前摘要', '条目状态', '检索词', '身份定义', '现行事实', '当前状态', '关联对象', '关联事件',
]);
function compactRegistryDescription(active) {
    return active.map((table, index) => {
        const visibleFields = table.fields.filter((field) => EDITABLE_HEADER_FIELD_KEYS.includes(field.key)
            || (!CORE_FIELD_KEYS.includes(field.key) && field.key !== 'lifecycle'));
        const fieldText = visibleFields.length
            ? visibleFields.map((field) => `${field.label}：${field.description}`).join('；')
            : '使用该表用途说明判断是否记录';
        return `${index + 1}. ${table.name}｜记录方向：${table.purpose}｜表头要求：${fieldText}`;
    }).join('\n');
}
function kindLabel(table) {
    const labels = {
        spacetime: '时空', scenes: '场景', characters: '角色', items: '物品', events: '事件',
        regions: '地点', globalChanges: '全局', foundations: '基础设定', custom: '自定义对象',
    };
    return labels[table.role] || '自定义对象';
}
const MODEL_VISIBLE_RULE_REPLACEMENTS = [
    [/relationshipStates/gi, '关系状态'],
    [/presentationStates/gi, '外观表现'],
    [/solidifiedHistory/gi, '历史事实'],
    [/absorbedMemory/gi, '承接记录'],
    [/globalChanges/gi, '全局变化'],
    [/customObjects/gi, '自定义对象'],
    [/currentStates/gi, '当前状态'],
    [/currentFacts/gi, '现行事实'],
    [/recentHistory/gi, '近期经历'],
    [/relatedObjects/gi, '关联对象'],
    [/relatedEvents/gi, '关联事件'],
    [/abilityStates/gi, '能力状态'],
    [/baseContent/gi, '身份定义'],
    [/characters/gi, '角色'],
    [/character/gi, '角色'],
    [/foundations/gi, '基础设定'],
    [/spacetime/gi, '时空'],
    [/global/gi, '全局'],
    [/regions/gi, '地点'],
    [/region/gi, '地点'],
    [/scenes/gi, '场景'],
    [/scene/gi, '场景'],
    [/items/gi, '物品'],
    [/item/gi, '物品'],
    [/events/gi, '事件'],
    [/event/gi, '事件'],
    [/confirmed/gi, '确认'],
    [/reported/gi, '转述'],
    [/uncertain/gi, '不确定'],
];
function modelVisibleRuleText(value, fallback) {
    let text = String(value ?? '').trim() || fallback;
    for (const [pattern, replacement] of MODEL_VISIBLE_RULE_REPLACEMENTS)
        text = text.replace(pattern, replacement);
    return text;
}
const ROLE_TRANSPORT_MODULES = {
    events: '<MA_CORE>、<MA_EVENT_RESULT>、<MA_EVENT_STATE>',
    characters: '<MA_CHARACTER_IDENTITY>、<MA_CHARACTER_FACT>、<MA_CHARACTER_STATE>、<MA_CHARACTER_APPEARANCE>、<MA_CHARACTER_RELATION>、<MA_CHARACTER_ABILITY>',
    state: '<MA_CHARACTER_IDENTITY>、<MA_CHARACTER_FACT>、<MA_CHARACTER_STATE>、<MA_CHARACTER_APPEARANCE>、<MA_CHARACTER_RELATION>、<MA_CHARACTER_ABILITY>',
    items: '<MA_ITEM_IDENTITY>、<MA_ITEM_FACT>、<MA_ITEM_STATE>',
    scenes: '<MA_SCENE_IDENTITY>、<MA_SCENE_FACT>、<MA_SCENE_STATE>',
    regions: '<MA_REGION_IDENTITY>、<MA_REGION_FACT>、<MA_REGION_STATE>',
    globalChanges: '<MA_GLOBAL_IDENTITY>、<MA_GLOBAL_FACT>、<MA_GLOBAL_STATE>',
    foundations: '<MA_FOUNDATION_IDENTITY>、<MA_FOUNDATION_FACT>、<MA_FOUNDATION_STATE>',
    spacetime: '<MA_SPACETIME_STATE>',
    custom: '<MA_CUSTOM>（依次四行写：表格显示名、对象名、语义层显示名、具体事实）',
};
function transportModuleDescription(active) {
    return active.map((table) => `${table.name}：${ROLE_TRANSPORT_MODULES[table.role] || ROLE_TRANSPORT_MODULES.custom}`).join('\n');
}
function linkRuleDescription(linkRules, registry) {
    const active = normalizeTableRegistry(registry);
    const byKey = new Map(active.map((table) => [table.key, table]));
    const rules = enabledTableLinkRules(linkRules, active);
    if (!rules.length)
        return '当前没有启用联动规则。只处理正文直接命中的表头。';
    return rules.map((rule, index) => {
        const source = byKey.get(rule.sourceTableKey)?.name || rule.sourceTableKey;
        const targets = rule.targetTableKeys.map((key) => byKey.get(key)?.name || key).join('、');
        return `${index + 1}. “${source}”发生真实变化时，同轮重新检查“${targets}”；目标没有真实变化时不要输出。`;
    }).join('\n');
}
function stateSystemPrompt(registry, promptSettings = DEFAULT_STATE_PROMPTS, contentLimits = DEFAULT_CONTENT_LIMITS, linkRules = undefined) {
    const active = tables(registry);
    const names = active.map((table) => table.name).join('、');
    const admissionRules = modelVisibleRuleText(promptSettings?.admissionRules, DEFAULT_STATE_PROMPTS.admissionRules);
    const exclusionRules = modelVisibleRuleText(promptSettings?.exclusionRules, DEFAULT_STATE_PROMPTS.exclusionRules);
    const routingRules = modelVisibleRuleText(promptSettings?.routingRules, DEFAULT_STATE_PROMPTS.routingRules);
    const evidenceRules = modelVisibleRuleText(promptSettings?.evidenceRules, DEFAULT_STATE_PROMPTS.evidenceRules);
    const updateRules = modelVisibleRuleText(promptSettings?.updateRules, DEFAULT_STATE_PROMPTS.updateRules);
    void contentLimits;
    return `“镜渊”无观点事实书记｜自然事实模块协议

职责：只提取本轮明确成立的短事实。表头名称、用途说明和表头记录要求决定提取方向；内部标签只是传输通道，不代表固定领域。
禁止评论、解释动机、预测、补全、判断价值、决定删除或输出数据库字段。
禁止 JSON、键值表单、Markdown 代码块、思考过程和块外说明。

【变化容器】
每条彼此独立的变化链使用一个 <MA_EVENT>。第一行写稳定、可读的变化链名称，随后写相关事实模块。书记只记录已发生结果，不单独生成“未决事项”，不判断整条变化链是否应删除或归档。
对象模块第一行必须是对象稳定名称，后续只写该对象自身的具体变化；同一事实不得在多个模块中重复复述。

【当前启用表与传输标签】
${transportModuleDescription(active) || '当前没有启用表头。'}

【固定提取边界】
允许建档：
${admissionRules}

默认排除：
${exclusionRules}

表头分流：
${routingRules}

证据边界：
${evidenceRules}

更新与冲突：
${updateRules}

【当前提取模板】
${compactRegistryDescription(active) || '当前没有启用表头；不要输出对象模块。'}

【表头联动】
${linkRuleDescription(linkRules, registry)}

【硬限制】
1. 每个模块只写一个对象、一个角度、一个当前结果，通常一句，复杂时最多两句。
2. 没有独立变化的对象不输出模块；重复描述、普通反应和无结果过程不算变化。
3. “身份/定义”通道只用于正文明确改变对象本质或基础定义；短期变化写当前事实或状态。
4. 只记录正文明确写出的已发生结果，不生成可能性、未来风险或未决建议。
5. 不写近期经历、历史事实、承接记录、生命周期、稳定 ID、事件 ID 或事实 ID；这些由插件维护。
6. 不使用“字段、变化层、动作、内容”等表单词，不输出等号。
7. 无事实变化时只输出 <MA_TURN>，正文写一句最短变化概括。
8. 当前启用表头：${names || '（无）'}。
9. 联动只表示重新检查，不得因为来源表变化而凭空修改目标表。

输出前只检查：事实是否明确、是否命中启用表头、模块是否短、各模块是否互不重复、标签是否闭合。`;
}
function normalizeSearchText(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}
function stringList(value) {
    return Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : [];
}
function boundedList(value, count, chars) {
    return stringList(value).slice(-count).map((item) => item.slice(0, chars));
}
function compactLifecycle(row) {
    if (!row.lifecycle)
        return undefined;
    return {
        existence: row.lifecycle.existence,
        activity: row.lifecycle.activity,
        memory: row.lifecycle.memory,
        evidenceLevel: row.lifecycle.evidenceLevel,
        evidence: String(row.lifecycle.evidence || '').slice(0, 160),
        returnConditions: boundedList(row.lifecycle.returnConditions, 4, 100),
        returnBlockers: boundedList(row.lifecycle.returnBlockers, 4, 100),
    };
}
/**
 * 只给高相关对象发送“工作副本”，不是完整持久化行。
 * direct 允许更多当前切面；support 仅保留帮助代词、事件延续和身份判断的必要内容。
 */
function modelRow(row, detail) {
    const direct = detail === 'direct';
    const output = {
        title: row.title,
        content: String(row.content || '').slice(0, direct ? 240 : 160),
        keywords: (row.keywords ?? []).slice(0, direct ? 8 : 5).map((item) => String(item).slice(0, 60)),
        status: String(row.status || '').slice(0, 80),
    };
    const fields = row.fields && typeof row.fields === 'object' ? row.fields : {};
    for (const [key, value] of Object.entries(fields)) {
        if (key === 'baseContent')
            output[key] = String(value ?? '').slice(0, direct ? 240 : 160);
        else if (key === 'currentFacts' || key === 'currentStates')
            output[key] = boundedList(value, direct ? 6 : 3, direct ? 100 : 80);
        else if (key === 'relationshipStates' || key === 'abilityStates' || key === 'presentationStates')
            output[key] = boundedList(value, direct ? 4 : 2, direct ? 100 : 80);
        else if (key === 'relatedObjects' || key === 'relatedEvents')
            output[key] = boundedList(value, direct ? 6 : 4, 70);
        else if (Array.isArray(value))
            output[key] = boundedList(value, direct ? 4 : 2, direct ? 90 : 70);
        else
            output[key] = String(value ?? '').slice(0, direct ? 200 : 140);
    }
    return output;
}
function directoryEntry(item) {
    const titleToken = normalizeSearchText(item.row.title);
    const keywords = [...new Set((item.row.keywords ?? [])
            .map((value) => String(value ?? '').trim())
            .filter(Boolean)
            .filter((value) => normalizeSearchText(value) !== titleToken))]
        .slice(0, MAX_DIRECTORY_ALIASES)
        .map((value) => value.slice(0, 60));
    return { table: item.table.name, kind: kindLabel(item.table), title: String(item.row.title || '').slice(0, 100), keywords };
}
function directoryLine(entry) {
    const safe = (value) => contextValue(value).replace(/[｜|]/g, '／');
    const aliases = entry.keywords.map(safe).filter(Boolean).join('、');
    return `${safe(entry.kind)}｜${safe(entry.table)}｜${safe(entry.title)}${aliases ? `｜${aliases}` : ''}`;
}
function rowTerms(row) {
    return [row.id, row.title, ...(row.keywords ?? [])]
        .map(normalizeSearchText)
        .filter((term) => term.length >= 2);
}
function rowMatches(row, source) {
    return rowTerms(row).some((term) => source.includes(term));
}
function relatedTokens(row) {
    const fields = row.fields && typeof row.fields === 'object' ? row.fields : {};
    return [
        ...stringList(fields.relatedObjects),
        ...stringList(fields.relatedEvents),
    ].map(normalizeSearchText).filter(Boolean);
}
function compactSnapshotContext(previous, active, sourceText) {
    const source = normalizeSearchText(sourceText);
    const all = [];
    let order = 0;
    for (const table of active) {
        for (const row of previous[table.key] ?? []) {
            const direct = rowMatches(row, source);
            const statusActive = ACTIVE_STATUS_RE.test(row.status);
            all.push({
                table,
                row,
                direct,
                active: statusActive,
                spacetime: table.role === 'spacetime',
                activeEvent: table.role === 'events' && statusActive,
                activeCharacter: table.role === 'characters' && statusActive,
                order: order += 1,
            });
        }
    }
    const directTerms = new Set();
    const directReferences = new Set();
    for (const item of all) {
        if (!item.direct)
            continue;
        for (const term of rowTerms(item.row))
            directTerms.add(term);
        for (const term of relatedTokens(item.row))
            directReferences.add(term);
    }
    const related = (item) => (rowTerms(item.row).some((term) => directReferences.has(term))
        || relatedTokens(item.row).some((term) => directTerms.has(term)));
    const priority = (item) => item.direct ? 100
        : item.spacetime ? 90
            : item.activeEvent ? 80
                : related(item) ? 70
                    : item.activeCharacter ? 60
                        : item.active ? 30
                            : 0;
    const sorted = [...all].sort((a, b) => priority(b) - priority(a)
        || String(b.row.updatedAt || '').localeCompare(String(a.row.updatedAt || ''))
        || a.order - b.order);
    // 目录只发送本轮直接命中、显式关联与当前连续性对象；插件不把完整仓库交给模型扫描。
    const directory = [];
    let directoryChars = '<MA_DIRECTORY>\n</MA_DIRECTORY>'.length;
    let directoryOmitted = 0;
    for (const item of sorted.filter((candidate) => priority(candidate) > 0).slice(0, 32)) {
        const entry = directoryEntry(item);
        const line = directoryLine(entry);
        if (directoryChars + line.length + 1 > DIRECTORY_CHAR_BUDGET) {
            directoryOmitted += 1;
            continue;
        }
        directory.push(entry);
        directoryChars += line.length + 1;
    }
    const relevant = {};
    let total = 0;
    const perTable = new Map();
    for (const item of sorted) {
        if (priority(item) <= 0)
            continue;
        if (total >= MAX_FULL_ROWS)
            break;
        const count = perTable.get(item.table.key) ?? 0;
        if (count >= MAX_FULL_ROWS_PER_TABLE)
            continue;
        const detail = item.direct ? 'direct' : 'support';
        (relevant[item.table.key] ||= []).push(modelRow(item.row, detail));
        perTable.set(item.table.key, count + 1);
        total += 1;
    }
    return { directory, directoryOmitted, relevant };
}
function factMatches(fact, source) {
    const terms = [fact.factId, fact.eventId, fact.title, ...fact.keywords, ...fact.relatedEntities]
        .map(normalizeSearchText)
        .filter((term) => term.length >= 2);
    return terms.some((term) => source.includes(term));
}
function activeFactPayload(facts, sourceText) {
    const source = normalizeSearchText(sourceText);
    const scored = facts.map((fact, index) => ({
        fact,
        index,
        score: (factMatches(fact, source) ? 100 : 0) + (fact.active ? 20 : 0),
    })).sort((a, b) => b.score - a.score
        || String(b.fact.updatedAt || '').localeCompare(String(a.fact.updatedAt || ''))
        || b.index - a.index);
    const selected = scored.filter((item) => item.score > 0).slice(0, MAX_FACTS).map((item) => item.fact);
    return selected.map((fact) => ({
        event_name: String(fact.view?.eventName || (fact.view?.semanticRole === 'events' ? fact.view?.objectTitle : '') || '').slice(0, 120),
        occurred: boundedList(fact.occurredFacts, 3, 140),
        status: String(fact.status || '').slice(0, 60),
        time_range: {
            start: String(fact.timeRange?.start || '').slice(0, 80),
            end: String(fact.timeRange?.end || '').slice(0, 80),
            label: String(fact.timeRange?.label || '').slice(0, 100),
        },
        related_entities: boundedList(fact.relatedEntities, 8, 80),
        title: String(fact.title || '').slice(0, 120),
        type: String(fact.type || '').slice(0, 60),
        keywords: boundedList(fact.keywords, 6, 60),
        confidence: fact.confidence,
        active: fact.active,
    }));
}
function contextValue(value) {
    return String(value ?? '')
        .replace(/<\/?MA_[A-Z_]+>/gi, (tag) => tag.replace(/</g, '＜').replace(/>/g, '＞'))
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function pushContextField(lines, key, value) {
    if (Array.isArray(value)) {
        for (const item of value)
            pushContextField(lines, key, item);
        return;
    }
    if (value && typeof value === 'object') {
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
            pushContextField(lines, `${key}.${nestedKey}`, nestedValue);
        }
        return;
    }
    const text = contextValue(value);
    if (text)
        lines.push(`${key}：${text}`);
}
function contextFactBlocks(payload) {
    if (!payload.length)
        return '（无）';
    return payload.map((fact) => {
        const lines = ['<MA_CONTEXT_FACT>'];
        pushContextField(lines, 'event_name', fact.event_name);
        pushContextField(lines, 'title', fact.title);
        pushContextField(lines, 'type', fact.type);
        pushContextField(lines, 'status', fact.status);
        pushContextField(lines, 'confidence', fact.confidence);
        pushContextField(lines, 'active', fact.active);
        const time = fact.time_range && typeof fact.time_range === 'object'
            ? fact.time_range
            : {};
        pushContextField(lines, 'time_start', time.start);
        pushContextField(lines, 'time_end', time.end);
        pushContextField(lines, 'time_label', time.label);
        pushContextField(lines, 'occurred', fact.occurred);
        pushContextField(lines, 'related', fact.related_entities);
        pushContextField(lines, 'keyword', fact.keywords);
        lines.push('</MA_CONTEXT_FACT>');
        return lines.join('\n');
    }).join('\n');
}
function contextDirectoryBlock(directory, omitted) {
    const lines = ['<MA_DIRECTORY>'];
    for (const entry of directory)
        lines.push(directoryLine(entry));
    if (omitted > 0)
        lines.push(`省略对象：${omitted}`);
    lines.push('</MA_DIRECTORY>');
    return lines.join('\n');
}
function contextRowBlocks(relevant, active) {
    const blocks = [];
    for (const [tableKey, rows] of Object.entries(relevant)) {
        const table = active.find((item) => item.key === tableKey);
        if (!table)
            continue;
        for (const source of rows) {
            const row = source && typeof source === 'object' ? source : {};
            const lines = ['<MA_CONTEXT_ROW>'];
            pushContextField(lines, '对象类型', kindLabel(table));
            pushContextField(lines, '表格', table.name);
            pushContextField(lines, '对象', row.title);
            pushContextField(lines, '当前摘要', row.content);
            pushContextField(lines, '条目状态', row.status);
            pushContextField(lines, '检索词', row.keywords);
            for (const [key, value] of Object.entries(row)) {
                if (['title', 'content', 'status', 'keywords', 'lifecycle'].includes(key))
                    continue;
                const label = stateLayerLabelForField(table, key);
                if (label)
                    pushContextField(lines, label, value);
            }
            lines.push('</MA_CONTEXT_ROW>');
            blocks.push(lines.join('\n'));
        }
    }
    return blocks.join('\n') || '（无）';
}
function stateUserPrompt(previous, playerText, assistantText, registry, internalFacts = [], repair = false) {
    const active = tables(registry);
    const sourceText = `${playerText}
${assistantText}`;
    const context = compactSnapshotContext(previous, active, sourceText);
    const eventTable = active.find((table) => table.role === 'events');
    const sceneTable = active.find((table) => table.role === 'scenes');
    const spacetimeTable = active.find((table) => table.role === 'spacetime');
    const chainLabel = eventTable?.name || '变化链';
    const conditionalInstructions = [
        `每个 <MA_EVENT> 第一行只写一条稳定、可读的“${chainLabel}”变化链名称，随后直接写命中当前表头的事实模块。`,
        '若相关既有事实中的 event_name 与本轮仍属于同一项未完成变化链，必须逐字沿用；若旧变化链已完成而正文进入新的目标、阶段或独立处理流程，应使用新的可读名称，不得强行复用旧名。',
        sceneTable ? `正文命中“${sceneTable.name}”的记录要求，且其建立、切换、阶段或目标发生真实变化时，输出对应状态模块并写明该表头提示词要求的当前结果。` : '',
        spacetimeTable ? `正文命中“${spacetimeTable.name}”的记录要求并发生真实变化时，输出对应状态模块。` : '',
    ].filter(Boolean).join('');
    return `【相关既有事实｜只用于识别同一对象与变化链】
${contextFactBlocks(activeFactPayload(internalFacts, sourceText))}

【相关对象短目录】
${contextDirectoryBlock(context.directory, context.directoryOmitted)}

【相关对象当前工作副本】
${contextRowBlocks(context.relevant, active)}

【玩家输入】
${playerText || '（空）'}

【本轮正文】
${assistantText}

只返回 <MA_TURN> 和一个或多个 <MA_EVENT> 自然模块。${conditionalInstructions}对象模块第一行是对象稳定名称，后续是一到两句具体事实。不要使用等号、键值字段、JSON、内部英文键或旧协议。核心事实只写一次，各对象模块只写自身变化。${repair ? '\n上一次返回格式不完整：只补齐自然模块标签与变化链名称，不得改写或新增原文事实。' : ''}`;
}
function stateTextProtocolDescription(registry) {
    const active = tables(registry);
    return `自然事实模块：<MA_TURN>、<MA_EVENT> 以及当前启用表头对应的对象模块。启用表头：${active.map((table) => table.name).join('、') || '（无）'}。模型只写短事实；插件负责识别对象、映射语义层、分发、稳定 ID、总结窗口与结算。`;
}

}
};
__defs["prompts/summary.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"DEFAULT_SUMMARY_PROMPTS",{enumerable:true,configurable:true,get:()=>__require("constants.js")["DEFAULT_SUMMARY_PROMPTS"]});
with(__scope){
Object.defineProperty(exports,"summaryFixedProtocol",{enumerable:true,configurable:true,get:()=>summaryFixedProtocol});
Object.defineProperty(exports,"smallSummarySystemPrompt",{enumerable:true,configurable:true,get:()=>smallSummarySystemPrompt});
Object.defineProperty(exports,"smallSummaryBatchPrompt",{enumerable:true,configurable:true,get:()=>smallSummaryBatchPrompt});
Object.defineProperty(exports,"smallSummaryPrompt",{enumerable:true,configurable:true,get:()=>smallSummaryPrompt});
Object.defineProperty(exports,"largeSummarySystemPrompt",{enumerable:true,configurable:true,get:()=>largeSummarySystemPrompt});
Object.defineProperty(exports,"largeSummaryPrompt",{enumerable:true,configurable:true,get:()=>largeSummaryPrompt});
/**
 * 模块职责：构造按事件槽位的小总结和大总结固定文本协议。
 * 维护边界：模型不返回 eventId 或 JSON；插件用本次请求 slot 映射内部事件线与版本链。
 */
function ruleLines(value) {
    return String(value || '')
        .split(/\n+/)
        .map((line) => line.trim().replace(/^[-*•\d.、)）\s]+/, ''))
        .filter(Boolean)
        .map((line, index) => `${index + 1}. ${line}`)
        .join('\n') || '（无附加规则）';
}
function summaryFixedProtocol(kind) {
    return `<MA_SUMMARY>
${kind === 'small' ? 'S1' : 'L1'}
事件线标题
<MA_SUMMARY_TEXT>
${kind === 'small' ? '只保留近期继续游玩必须知道的结果与未决状态。' : '只保留跨阶段仍成立的长期结果。'}
</MA_SUMMARY_TEXT>
<MA_MEMORY>
角色
对象名
${kind === 'small' ? '该对象近期继续游玩必须知道的一句结果。' : '该对象跨阶段仍成立的一句长期结果。'}
</MA_MEMORY>
<MA_KEYWORDS>
关键词
</MA_KEYWORDS>
</MA_SUMMARY>`;
}
function systemPrompt(kind, sections, maxChars) {
    const small = kind === 'small';
    return `任务：生成每个事件槽位当前唯一有效的${small ? '小总结' : '大总结'}。

角色边界：
职责仅限于无观点事实压缩。只保留材料中明确成立、符合白盒规则的事实；不推测未来、不解释动机、不评价重要性、不补全未知。

事实筛选边界：
${sections.coreQuestion}

只保留：
${ruleLines(sections.includeRules)}

必须删除：
${ruleLines(sections.excludeRules)}

更新规则：
${ruleLines(sections.updateRules)}

表达规则：
${ruleLines(sections.expressionRules)}

固定要求：
1. 必须返回固定文本协议。
2. 只使用本次请求提供的材料，不读取聊天正文，不补全未显影内容。
3. <MA_SUMMARY> 第一行是本次请求槽位，第二行是标题；槽位必须原样返回，不要输出任何内部 ID。
4. 每个输入 slot 必须且只能返回一个 <MA_SUMMARY>。
5. 禁止 JSON、Markdown 代码块、解释、分析过程和思考标签。
6. <MA_SUMMARY_TEXT> 正文不得超过 ${Math.max(200, Math.round(maxChars))} 个字符；只删除重复、已覆盖过程与无事实内容，不得新增事实。
7. 不输出建议、评价、潜在价值或处理方案；小总结只保留近期连续性，大总结只保留长期结果。
8. 禁止使用等号、键值字段和逐条复述原子事实。
9. 每个需要承接结果的对象可输出一个 <MA_MEMORY>：第一行对象类型，第二行对象名，后续只写该对象自身的一句结果；不要把事件摘要复制给所有对象。
10. 临时对象没有持续结果时不输出 <MA_MEMORY>，由插件在覆盖审计后删除其临时条目。

固定输出协议：
${summaryFixedProtocol(kind)}`;
}
function smallSummarySystemPrompt(sections = DEFAULT_SUMMARY_PROMPTS.small, maxChars = 420) {
    return systemPrompt('small', sections, maxChars);
}
function lines(values) {
    return values.map((item) => `- ${String(item ?? '').trim()}`).filter((item) => item !== '-').join('\n') || '（无）';
}
function distributionLines(items) {
    if (!items?.length)
        return '（无）';
    return items.map((item) => `- ${item.objectType || '对象'}｜${item.objectName}：${item.content}`).join('\n');
}
function smallEventSection(group, index) {
    const slot = group.slot || `S${index + 1}`;
    const facts = group.facts.map((fact, factIndex) => `事实${factIndex + 1}
标题：${fact.title}
已发生：${lines(fact.occurredFacts)}
状态：${fact.status}
时间：${[fact.timeRange.start, fact.timeRange.end, fact.timeRange.label].filter(Boolean).join(' / ') || '未标注'}
直接影响对象：${lines(fact.relatedEntities)}
置信度：${fact.confidence}`).join('\n\n');
    return `【事件槽位 ${slot}】
内部事件名称（只用于理解，不要输出）：${group.eventId}

上一版小总结（待修订原料，不是必须保留的正文）：
${group.previous ? `标题：${group.previous.title}\n摘要：${group.previous.summary}\n对象承接：\n${distributionLines(group.previous.distributions)}\n关键词：${lines(group.previous.keywords)}` : '（无）'}

本次新增事实：
${facts || '（无）'}`;
}
function smallSummaryBatchPrompt(groups) {
    return `分别更新下列事件槽位的小总结。对每个槽位都要重写当前唯一有效版本，不得在旧总结后追加。

${groups.map(smallEventSection).join('\n\n====================\n\n')}

按输入顺序返回 <MA_SUMMARY>。每个 slot 必须且只能出现一次。`;
}
function smallSummaryPrompt(eventId, facts, previous) {
    return smallSummaryBatchPrompt([{ slot: 'S1', eventId, facts, previous }]);
}
function largeSummarySystemPrompt(sections = DEFAULT_SUMMARY_PROMPTS.large, maxChars = 900) {
    return systemPrompt('large', sections, maxChars);
}
function largeEventSection(group, index) {
    const slot = group.slot || `L${index + 1}`;
    return `【事件槽位 ${slot}】
内部事件名称（只用于理解，不要输出）：${group.eventId}

上一版长期总结（待修订原料）：
${group.previousLarge ? `标题：${group.previousLarge.title}\n摘要：${group.previousLarge.summary}\n对象承接：\n${distributionLines(group.previousLarge.distributions)}\n关键词：${lines(group.previousLarge.keywords)}` : '（无）'}

最新累计小总结（只作为已确认事实材料，不得逐句缩写或推测长期意义）：
标题：${group.latestSmall.title}
摘要：${group.latestSmall.summary}
对象承接：
${distributionLines(group.latestSmall.distributions)}
关键词：${lines(group.latestSmall.keywords)}`;
}
function largeSummaryPrompt(groups) {
    return `分别处理下列事件槽位。只写材料明确表述为长期、持续、不可逆或跨阶段成立的事实；没有介入或改变长期因果的对象描写不写入；不得根据人物重要性、未来可能或主观判断扩写。不是逐句缩写小总结。

${groups.map(largeEventSection).join('\n\n====================\n\n')}

按输入顺序返回 <MA_SUMMARY>。每个 slot 必须且只能出现一次。`;
}

}
};
__defs["runtime-v2/orchestrator.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"hashText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["hashText"]});
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"tableByRole",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["tableByRole"]});
Object.defineProperty(__scope,"normalizeRuntimeV2",{enumerable:true,configurable:true,get:()=>__require("runtime-v2/state.js")["normalizeRuntimeV2"]});
with(__scope){
Object.defineProperty(exports,"advanceRuntimeV2",{enumerable:true,configurable:true,get:()=>advanceRuntimeV2});
Object.defineProperty(exports,"ensureRuntimeJob",{enumerable:true,configurable:true,get:()=>ensureRuntimeJob});
Object.defineProperty(exports,"markRuntimeJobRunning",{enumerable:true,configurable:true,get:()=>markRuntimeJobRunning});
Object.defineProperty(exports,"markRuntimeJobDone",{enumerable:true,configurable:true,get:()=>markRuntimeJobDone});
Object.defineProperty(exports,"markRuntimeJobFailed",{enumerable:true,configurable:true,get:()=>markRuntimeJobFailed});
Object.defineProperty(exports,"narrativeContextText",{enumerable:true,configurable:true,get:()=>narrativeContextText});
/**
 * Runtime V2 turn orchestrator.
 *
 * One committed assistant turn advances authoritative machines once, writes an
 * immutable journal record, schedules at most one summary kind and creates a
 * durable lorebook publication intent.
 */
const TERMINAL_RE = /(已完成|完成|已结束|结束|已关闭|关闭|已离开|离开场景|已中止|中止|已解决|resolved|completed|closed|ended|aborted|archived)/i;
const ACTIVE_RE = /(进行中|正在|当前|active|ongoing|pending|等待|候场|处理中)/i;

function text(value, limit = 1200) {
    return safeText(value, limit).trim();
}

function list(value) {
    return Array.isArray(value) ? value.map((item) => text(item, 500)).filter(Boolean) : [];
}

function rowText(row) {
    const fields = row?.fields ?? {};
    return [
        row?.title,
        row?.status,
        row?.content,
        fields.baseContent,
        ...list(fields.currentFacts),
        ...list(fields.currentStates),
        ...list(fields.relatedEvents),
    ].map((item) => text(item, 1000)).filter(Boolean).join('；');
}

function normalizedToken(value) {
    return text(value, 500).normalize('NFKC').toLowerCase().replace(/[\s，。；、：:｜|—–-]+/g, '');
}

const SCENE_LABEL_GROUPS = {
    location: ['当前地点', '所在地点', '地点'],
    stage: ['当前阶段', '场景阶段', '阶段'],
    goal: ['当前目标', '场景目标', '目标'],
    status: ['阶段状态', '场景状态', '进度状态'],
};
const ALL_SCENE_LABELS = Object.values(SCENE_LABEL_GROUPS).flat();
function escapedAlternation(values) {
    return values.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
}
function labeledValue(source, labels) {
    const wanted = escapedAlternation(labels);
    const anyLabel = escapedAlternation(ALL_SCENE_LABELS);
    const regex = new RegExp(`(?:^|[\\n；。]|\\s)(?:${wanted})\\s*[：:]\\s*([\\s\\S]*?)(?=(?:[\\n；。]|\\s)(?:${anyLabel})\\s*[：:]|$)`, 'i');
    const matched = String(source || '').match(regex);
    return matched?.[1] ? text(matched[1].replace(/^[；。\s]+|[；。\s]+$/g, ''), 500) : '';
}
function bareSceneLocation(value) {
    let source = text(value, 1500);
    if (!source)
        return '';
    source = source.replace(/^(?:当前地点|所在地点|地点)\s*[：:]\s*/i, '');
    const trailingLabels = [...SCENE_LABEL_GROUPS.stage, ...SCENE_LABEL_GROUPS.goal, ...SCENE_LABEL_GROUPS.status];
    const nextLabel = new RegExp(`(?:[\\n；。]|\\s)(?:${escapedAlternation(trailingLabels)})\\s*[：:]`, 'i');
    const matched = nextLabel.exec(source);
    if (matched)
        source = source.slice(0, matched.index);
    return text(source.replace(/[；。\s]+$/g, ''), 240);
}

function latestRows(snapshot, registry, role) {
    const table = tableByRole(registry, role, false);
    return table ? snapshot?.[table.key] ?? [] : [];
}

function activeRow(rows) {
    return rows.filter((row) => !TERMINAL_RE.test(rowText(row))).at(-1) ?? rows.at(-1);
}

function eventIds(row) {
    return [...new Set([row?.eventId, ...(row?.eventIds ?? [])].map((item) => text(item, 180)).filter(Boolean))];
}

function sceneDescriptor(snapshot, artifact, registry) {
    const sceneRows = latestRows(snapshot, registry, 'scenes');
    const spacetimeRows = latestRows(snapshot, registry, 'spacetime');
    const scene = activeRow(sceneRows);
    const spacetime = activeRow(spacetimeRows);
    const source = [rowText(scene), rowText(spacetime), artifact?.factPackage?.turnSummary]
        .map((item) => text(item, 1500)).filter(Boolean).join('\n');
    const location = labeledValue(source, SCENE_LABEL_GROUPS.location)
        || bareSceneLocation(spacetime?.title || spacetime?.content)
        || bareSceneLocation(scene?.title);
    const stage = labeledValue(source, SCENE_LABEL_GROUPS.stage);
    const goal = labeledValue(source, SCENE_LABEL_GROUPS.goal);
    const explicitStatus = labeledValue(source, SCENE_LABEL_GROUPS.status);
    const rawStatus = explicitStatus || text(scene?.status, 120);
    const status = TERMINAL_RE.test(rawStatus || source)
        ? 'closed'
        : ACTIVE_RE.test(rawStatus || source)
            ? 'active'
            : 'active';
    return {
        title: text(scene?.title || location, 240),
        location,
        stage,
        goal,
        status,
        eventIds: eventIds(scene),
        sourceRowId: text(scene?.id, 180),
    };
}

const CHINESE_NUMBERS = new Map([
    ['半', 0.5], ['一', 1], ['二', 2], ['两', 2], ['三', 3], ['四', 4], ['五', 5],
    ['六', 6], ['七', 7], ['八', 8], ['九', 9], ['十', 10],
]);

function numberValue(value) {
    if (/^\d+(?:\.\d+)?$/.test(value))
        return Number(value);
    if (CHINESE_NUMBERS.has(value))
        return CHINESE_NUMBERS.get(value);
    const ten = value.match(/^十([一二三四五六七八九])?$/);
    if (ten)
        return 10 + (CHINESE_NUMBERS.get(ten[1]) || 0);
    const tens = value.match(/^([二三四五六七八九])十([一二三四五六七八九])?$/);
    if (tens)
        return CHINESE_NUMBERS.get(tens[1]) * 10 + (CHINESE_NUMBERS.get(tens[2]) || 0);
    return 0;
}

function explicitElapsedMinutes(assistantText) {
    const source = text(assistantText, 8000);
    let total = 0;
    const unitMinutes = { 年: 525600, 月: 43200, 周: 10080, 天: 1440, 日: 1440, 小时: 60, 时辰: 120, 分钟: 1 };
    const pattern = /(\d+(?:\.\d+)?|半|一|二|两|三|四|五|六|七|八|九|十|十一|十二|十三|十四|十五|十六|十七|十八|十九|二十|三十)(年|个月|月|周|天|日|小时|时辰|分钟)(?:后|以后|之后|过去|流逝|前进|抵达|到达)/g;
    for (const match of source.matchAll(pattern)) {
        const amount = numberValue(match[1]);
        const unit = match[2] === '个月' ? '月' : match[2];
        if (amount > 0 && unitMinutes[unit])
            total += Math.round(amount * unitMinutes[unit]);
    }
    if (/(翌日|次日|第二天|第二日)/.test(source))
        total = Math.max(total, 1440);
    return total;
}

function clockDisplay(snapshot, registry) {
    const row = activeRow(latestRows(snapshot, registry, 'spacetime'));
    const source = rowText(row);
    const labeled = labeledValue(source, ['当前时间', '游戏时间', '时间']);
    if (labeled)
        return labeled;
    const stateTime = row?.fields?.currentStates?.find?.((item) => /(第.{0,8}[日天]|\d{1,2}[:：]\d{2}|清晨|上午|中午|下午|傍晚|夜晚|深夜|凌晨)/.test(String(item)));
    return text(stateTime, 240);
}

function eventContext(snapshot, registry) {
    const rows = latestRows(snapshot, registry, 'events');
    return rows
        .filter((row) => !TERMINAL_RE.test(rowText(row)))
        .slice(-8)
        .map((row) => {
            const fields = row.fields ?? {};
            const state = list(fields.currentStates).at(-1) || text(row.status, 160) || text(row.content, 300);
            return state ? `${text(row.title, 180)}：${state}` : text(row.title, 180);
        })
        .filter(Boolean);
}

function effectiveFactContext(snapshot, registry, descriptor) {
    const selected = [];
    const related = new Set([...(descriptor.eventIds ?? [])].map(normalizedToken).filter(Boolean));
    for (const table of registry ?? []) {
        if (!table?.enabled || !['characters', 'items', 'globalChanges', 'foundations'].includes(table.role))
            continue;
        for (const row of snapshot?.[table.key] ?? []) {
            const rowEvents = eventIds(row).map(normalizedToken);
            const directlyRelated = related.size === 0 || rowEvents.some((id) => related.has(id));
            if (!directlyRelated && table.role !== 'foundations')
                continue;
            const fields = row.fields ?? {};
            const current = [...list(fields.currentFacts), ...list(fields.currentStates)].slice(-2);
            for (const fact of current) {
                selected.push(`${text(row.title, 180)}：${fact}`);
                if (selected.length >= 10)
                    return selected;
            }
        }
    }
    return selected;
}

function appendJournal(runtime, type, turnKey, turnIndex, payload = {}) {
    const id = `rte_${hashText(`${runtime.revision + 1}|${type}|${turnKey}|${JSON.stringify(payload)}`)}`;
    if (runtime.journal.some((item) => item.id === id))
        return;
    runtime.revision += 1;
    runtime.journal.push({ id, revision: runtime.revision, type, turnKey, turnIndex, payload, createdAt: nowIso() });
    runtime.journal = runtime.journal.slice(-3000);
}

function closeCurrentScene(runtime, turnKey, turnIndex, reason) {
    const machine = runtime.machines.scene;
    const current = machine.instances[machine.currentInstanceId];
    if (!current || current.status === 'closed' || current.status === 'archived')
        return null;
    current.status = 'closed';
    current.closedTurnKey = turnKey;
    current.closedTurnIndex = turnIndex;
    current.closureReason = reason;
    current.updatedAt = nowIso();
    machine.currentInstanceId = '';
    appendJournal(runtime, 'SCENE_CLOSED', turnKey, turnIndex, { sceneInstanceId: current.id, reason });
    return current;
}

function sceneSignature(descriptor) {
    return [descriptor.location, descriptor.stage, descriptor.goal].map(normalizedToken).join('|');
}

function advanceScene(runtime, descriptor, artifact) {
    const turnKey = artifact.messageKey;
    const turnIndex = artifact.messageIndex;
    const machine = runtime.machines.scene;
    let current = machine.instances[machine.currentInstanceId];
    const boundary = artifact.sceneBoundary;
    if (current && boundary) {
        closeCurrentScene(runtime, turnKey, turnIndex, `离开“${boundary.previousTitle || current.title}”，进入“${boundary.currentTitle || descriptor.title}”`);
        current = undefined;
    }
    if (current && descriptor.status === 'closed') {
        closeCurrentScene(runtime, turnKey, turnIndex, '场景阶段已明确完成或关闭');
        current = undefined;
    }
    if (current) {
        const oldSignature = sceneSignature(current);
        const nextSignature = sceneSignature(descriptor);
        const explicitStageChanged = Boolean(descriptor.stage && current.stage && normalizedToken(descriptor.stage) !== normalizedToken(current.stage));
        const explicitGoalChanged = Boolean(descriptor.goal && current.goal && normalizedToken(descriptor.goal) !== normalizedToken(current.goal));
        const locationChanged = Boolean(descriptor.location && current.location && normalizedToken(descriptor.location) !== normalizedToken(current.location));
        if (locationChanged || explicitStageChanged || explicitGoalChanged) {
            closeCurrentScene(runtime, turnKey, turnIndex, locationChanged ? '物理地点发生变化' : '同一地点内叙事阶段或目标发生变化');
            current = undefined;
        }
        else if (oldSignature === nextSignature || !nextSignature.replace(/\|/g, '')) {
            current.title = descriptor.title || current.title;
            current.location = descriptor.location || current.location;
            current.stage = descriptor.stage || current.stage;
            current.goal = descriptor.goal || current.goal;
            current.eventIds = [...new Set([...current.eventIds, ...descriptor.eventIds])];
            current.updatedAt = nowIso();
            appendJournal(runtime, 'SCENE_UPDATED', turnKey, turnIndex, { sceneInstanceId: current.id });
            return current;
        }
    }
    if (!descriptor.title && !descriptor.location)
        return undefined;
    machine.sequence += 1;
    const id = `sceneinst_${machine.sequence}_${hashText(`${turnKey}|${descriptor.location}|${descriptor.stage}|${descriptor.goal}`)}`;
    const instance = {
        id,
        location: descriptor.location,
        title: descriptor.title || descriptor.location,
        stage: descriptor.stage,
        goal: descriptor.goal,
        status: descriptor.status === 'closed' ? 'closed' : 'active',
        startedTurnKey: turnKey,
        startedTurnIndex: turnIndex,
        closedTurnKey: descriptor.status === 'closed' ? turnKey : '',
        closedTurnIndex: descriptor.status === 'closed' ? turnIndex : -1,
        closureReason: descriptor.status === 'closed' ? '本轮建立时已经明确完成' : '',
        eventIds: descriptor.eventIds,
        updatedAt: nowIso(),
    };
    machine.instances[id] = instance;
    if (instance.status === 'active')
        machine.currentInstanceId = id;
    appendJournal(runtime, 'SCENE_ENTERED', turnKey, turnIndex, { sceneInstanceId: id, location: instance.location, stage: instance.stage, goal: instance.goal });
    if (instance.status === 'closed')
        appendJournal(runtime, 'SCENE_CLOSED', turnKey, turnIndex, { sceneInstanceId: id, reason: instance.closureReason });
    return instance;
}

function enqueue(runtime, type, artifact, sourceRevision = runtime.revision) {
    const id = `outbox_${hashText(`${type}|${artifact.messageKey}|${runtime.revision}`)}`;
    const existing = runtime.outbox.find((item) => item.id === id);
    if (existing)
        return existing;
    const job = {
        id,
        type,
        turnKey: artifact.messageKey,
        turnIndex: artifact.messageIndex,
        sourceRevision: Math.max(0, Number(sourceRevision) || 0),
        status: 'pending',
        attempts: 0,
        createdAt: nowIso(),
        startedAt: '',
        finishedAt: '',
        error: '',
    };
    runtime.outbox.push(job);
    runtime.outbox = runtime.outbox.slice(-1000);
    appendJournal(runtime, 'OUTBOX_JOB_QUEUED', artifact.messageKey, artifact.messageIndex, { jobId: id, jobType: type });
    return job;
}

function planSummary(runtime, artifact, eligibility) {
    const machine = runtime.machines.summary;
    if (machine.pendingKind && machine.pendingTurnKey && machine.pendingTurnKey !== artifact.messageKey)
        return { kind: '', job: undefined };
    let kind = '';
    if (eligibility.small) {
        kind = 'small';
    }
    else if (eligibility.large && artifact.messageIndex > machine.lastSmallTurnIndex) {
        // A large summary may never be automatically scheduled on the same turn
        // that committed a small summary.
        kind = 'large';
    }
    if (!kind)
        return { kind: '', job: undefined };
    machine.pendingKind = kind;
    machine.pendingTurnKey = artifact.messageKey;
    const job = enqueue(runtime, `${kind}-summary`, artifact);
    appendJournal(runtime, 'SUMMARY_SCHEDULED', artifact.messageKey, artifact.messageIndex, { kind, jobId: job.id });
    return { kind, job };
}

function buildNarrativeContext(runtime, snapshot, registry, descriptor) {
    const currentId = runtime.machines.scene.currentInstanceId;
    const current = runtime.machines.scene.instances[currentId];
    const completed = Object.values(runtime.machines.scene.instances)
        .filter((item) => item.status === 'closed')
        .sort((a, b) => b.closedTurnIndex - a.closedTurnIndex)
        .slice(0, 8)
        .map((item) => {
            const label = item.stage || item.goal || item.title;
            const suffix = item.goal && item.goal !== label ? `（${item.goal}）` : '';
            return `${label}${suffix}：已完成`;
        });
    return {
        revision: runtime.revision,
        time: runtime.machines.clock.display,
        location: current?.location || descriptor.location,
        scene: current?.title || descriptor.title,
        stage: current?.stage || descriptor.stage,
        goal: current?.goal || descriptor.goal,
        completedPrerequisites: completed,
        activeEvents: eventContext(snapshot, registry),
        effectiveFacts: effectiveFactContext(snapshot, registry, descriptor),
        generatedAt: nowIso(),
    };
}

function advanceRuntimeV2({ chatState, artifact, settings, smallEligible, largeEligible }) {
    const runtime = normalizeRuntimeV2(chatState.runtimeV2);
    if (runtime.processedTurnKeys.includes(artifact.messageKey)) {
        return {
            runtime,
            plan: {
                summaryKind: runtime.machines.summary.pendingTurnKey === artifact.messageKey
                    ? runtime.machines.summary.pendingKind
                    : '',
                summaryJobId: runtime.outbox.find((job) => ['small-summary', 'large-summary'].includes(job.type)
                    && job.turnKey === artifact.messageKey
                    && ['pending', 'running'].includes(job.status))?.id || '',
                sync: runtime.machines.publication.desiredRevision > runtime.machines.publication.confirmedRevision,
                syncJobId: runtime.machines.publication.pendingJobId || '',
            },
            duplicate: true,
        };
    }
    runtime.machines.turn.status = 'committing';
    appendJournal(runtime, 'TURN_RECEIVED', artifact.messageKey, artifact.messageIndex, {});
    const delta = explicitElapsedMinutes(artifact.assistantText);
    const display = clockDisplay(artifact.snapshot, settings.tableRegistry);
    if (delta > 0 || (display && display !== runtime.machines.clock.display)) {
        runtime.machines.clock.elapsedMinutes += delta;
        runtime.machines.clock.display = display || runtime.machines.clock.display;
        runtime.machines.clock.sourceTurnKey = artifact.messageKey;
        runtime.machines.clock.revision += 1;
        appendJournal(runtime, 'GAME_TIME_CHANGED', artifact.messageKey, artifact.messageIndex, { deltaMinutes: delta, display: runtime.machines.clock.display });
    }
    const descriptor = sceneDescriptor(artifact.snapshot, artifact, settings.tableRegistry);
    advanceScene(runtime, descriptor, artifact);
    const summaryPlan = planSummary(runtime, artifact, { small: smallEligible, large: largeEligible });
    const summaryKind = summaryPlan.kind;
    runtime.narrativeContext = buildNarrativeContext(runtime, artifact.snapshot, settings.tableRegistry, descriptor);
    appendJournal(runtime, 'NARRATIVE_CONTEXT_PROJECTED', artifact.messageKey, artifact.messageIndex, { revision: runtime.narrativeContext.revision });
    runtime.machines.publication.desiredRevision = runtime.revision;
    const syncJob = enqueue(runtime, 'lorebook-sync', artifact, runtime.machines.publication.desiredRevision);
    runtime.machines.publication.status = 'queued';
    runtime.machines.publication.pendingJobId = syncJob.id;
    runtime.machines.publication.updatedAt = nowIso();
    runtime.processedTurnKeys.push(artifact.messageKey);
    runtime.processedTurnKeys = runtime.processedTurnKeys.slice(-2000);
    runtime.machines.turn.status = 'committed';
    runtime.machines.turn.lastTurnKey = artifact.messageKey;
    runtime.machines.turn.lastTurnIndex = artifact.messageIndex;
    runtime.machines.turn.lastCommittedAt = nowIso();
    runtime.updatedAt = nowIso();
    chatState.runtimeV2 = runtime;
    return {
        runtime,
        plan: {
            summaryKind,
            summaryJobId: summaryPlan.job?.id || '',
            sync: true,
            syncJobId: syncJob.id,
        },
        duplicate: false,
    };
}

function findJob(runtime, type, turnKey, jobId = '') {
    if (jobId)
        return runtime.outbox.find((item) => item.id === jobId && item.type === type);
    return [...runtime.outbox].reverse().find((item) => item.type === type && item.turnKey === turnKey && !['cancelled', 'superseded'].includes(item.status));
}

function ensureRuntimeJob(chatState, type, artifact, sourceRevision) {
    const runtime = normalizeRuntimeV2(chatState.runtimeV2);
    let job = findJob(runtime, type, artifact.messageKey);
    if (!job || ['done', 'cancelled', 'superseded'].includes(job.status))
        job = enqueue(runtime, type, artifact, sourceRevision ?? runtime.revision);
    if (type === 'small-summary' || type === 'large-summary') {
        runtime.machines.summary.pendingKind = type === 'small-summary' ? 'small' : 'large';
        runtime.machines.summary.pendingTurnKey = artifact.messageKey;
    }
    if (type === 'lorebook-sync') {
        runtime.machines.publication.desiredRevision = Math.max(runtime.machines.publication.desiredRevision, job.sourceRevision);
        runtime.machines.publication.pendingJobId = job.id;
        runtime.machines.publication.status = 'queued';
        runtime.machines.publication.updatedAt = nowIso();
    }
    runtime.updatedAt = nowIso();
    chatState.runtimeV2 = runtime;
    return job;
}

function markRuntimeJobRunning(chatState, type, turnKey, jobId = '') {
    const runtime = normalizeRuntimeV2(chatState.runtimeV2);
    const job = findJob(runtime, type, turnKey, jobId);
    if (!job) {
        chatState.runtimeV2 = runtime;
        return undefined;
    }
    job.status = 'running';
    job.attempts += 1;
    job.startedAt = nowIso();
    job.error = '';
    if (type === 'lorebook-sync') {
        runtime.machines.publication.status = 'writing';
        runtime.machines.publication.updatedAt = nowIso();
    }
    chatState.runtimeV2 = runtime;
    return job;
}

function markRuntimeJobDone(chatState, type, artifact, jobId = '') {
    const runtime = normalizeRuntimeV2(chatState.runtimeV2);
    const job = findJob(runtime, type, artifact.messageKey, jobId);
    if (!job) {
        chatState.runtimeV2 = runtime;
        return undefined;
    }
    job.status = 'done';
    job.finishedAt = nowIso();
    job.error = '';
    if (type === 'small-summary' || type === 'large-summary') {
        const kind = type === 'small-summary' ? 'small' : 'large';
        runtime.machines.summary.pendingKind = '';
        runtime.machines.summary.pendingTurnKey = '';
        if (kind === 'small') {
            runtime.machines.summary.lastSmallTurnIndex = artifact.messageIndex;
            runtime.machines.summary.lastSmallTurnKey = artifact.messageKey;
        }
        else {
            runtime.machines.summary.lastLargeTurnIndex = artifact.messageIndex;
            runtime.machines.summary.lastLargeTurnKey = artifact.messageKey;
        }
        appendJournal(runtime, 'SUMMARY_COMMITTED', artifact.messageKey, artifact.messageIndex, { kind });
    }
    if (type === 'lorebook-sync') {
        runtime.machines.publication.confirmedRevision = Math.max(runtime.machines.publication.confirmedRevision, job?.sourceRevision ?? runtime.revision);
        for (const candidate of runtime.outbox) {
            if (candidate.id !== job?.id
                && candidate.type === 'lorebook-sync'
                && ['pending', 'running', 'failed'].includes(candidate.status)
                && candidate.sourceRevision <= runtime.machines.publication.confirmedRevision) {
                candidate.status = 'superseded';
                candidate.finishedAt ||= nowIso();
                candidate.error = '';
            }
        }
        const nextJob = runtime.outbox
            .filter((candidate) => candidate.type === 'lorebook-sync'
                && ['pending', 'running'].includes(candidate.status)
                && candidate.sourceRevision > runtime.machines.publication.confirmedRevision)
            .sort((a, b) => a.sourceRevision - b.sourceRevision)
            .at(-1);
        runtime.machines.publication.pendingJobId = nextJob?.id || '';
        runtime.machines.publication.status = runtime.machines.publication.confirmedRevision >= runtime.machines.publication.desiredRevision && !nextJob ? 'clean' : 'dirty';
        runtime.machines.publication.lastError = '';
        runtime.machines.publication.updatedAt = nowIso();
        appendJournal(runtime, 'LOREBOOK_PROJECTION_CONFIRMED', artifact.messageKey, artifact.messageIndex, { revision: runtime.machines.publication.confirmedRevision, jobId: job?.id || '' });
    }
    runtime.updatedAt = nowIso();
    chatState.runtimeV2 = runtime;
    return job;
}

function markRuntimeJobFailed(chatState, type, turnKey, error, jobId = '') {
    const runtime = normalizeRuntimeV2(chatState.runtimeV2);
    const job = findJob(runtime, type, turnKey, jobId);
    if (!job) {
        chatState.runtimeV2 = runtime;
        return undefined;
    }
    job.status = 'failed';
    job.finishedAt = nowIso();
    job.error = text(error, 1200);
    if (type === 'small-summary' || type === 'large-summary') {
        runtime.machines.summary.pendingKind = '';
        runtime.machines.summary.pendingTurnKey = '';
    }
    if (type === 'lorebook-sync') {
        runtime.machines.publication.status = 'failed';
        runtime.machines.publication.lastError = text(error, 1200);
        runtime.machines.publication.updatedAt = nowIso();
    }
    runtime.updatedAt = nowIso();
    chatState.runtimeV2 = runtime;
    return job;
}

function narrativeContextText(context) {
    const source = context && typeof context === 'object' ? context : {};
    const lines = ['[当前叙事上下文]'];
    if (source.time)
        lines.push(`当前时间：${source.time}`);
    if (source.location)
        lines.push(`当前地点：${source.location}`);
    if (source.scene)
        lines.push(`当前场景：${source.scene}`);
    if (source.stage)
        lines.push(`当前阶段：${source.stage}`);
    if (source.goal)
        lines.push(`当前目标：${source.goal}`);
    for (const item of source.completedPrerequisites ?? [])
        lines.push(`已完成前置：${item}`);
    for (const item of source.activeEvents ?? [])
        lines.push(`当前事件：${item}`);
    for (const item of source.effectiveFacts ?? [])
        lines.push(`有效事实：${item}`);
    return lines.join('\n');
}

}
};
__defs["runtime-v2/state.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
with(__scope){
Object.defineProperty(exports,"emptyNarrativeContext",{enumerable:true,configurable:true,get:()=>emptyNarrativeContext});
Object.defineProperty(exports,"emptyRuntimeV2",{enumerable:true,configurable:true,get:()=>emptyRuntimeV2});
Object.defineProperty(exports,"normalizeRuntimeV2",{enumerable:true,configurable:true,get:()=>normalizeRuntimeV2});
Object.defineProperty(exports,"RUNTIME_V2_VERSION",{enumerable:true,configurable:true,get:()=>RUNTIME_V2_VERSION});
/**
 * Runtime V2 canonical state.
 *
 * This state is the authoritative orchestration layer. Snapshots, summaries and
 * lorebook entries are projections/adapters and must not drive these machines.
 */
const RUNTIME_V2_VERSION = 1;

function cleanText(value, limit = 800) {
    return safeText(value, limit).trim();
}

function integer(value, fallback = -1) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : fallback;
}

function emptyNarrativeContext() {
    return {
        revision: 0,
        time: '',
        location: '',
        scene: '',
        stage: '',
        goal: '',
        completedPrerequisites: [],
        activeEvents: [],
        effectiveFacts: [],
        generatedAt: nowIso(),
    };
}

function emptyRuntimeV2() {
    return {
        version: RUNTIME_V2_VERSION,
        revision: 0,
        journal: [],
        processedTurnKeys: [],
        machines: {
            turn: {
                status: 'idle',
                lastTurnKey: '',
                lastTurnIndex: -1,
                lastCommittedAt: '',
            },
            clock: {
                elapsedMinutes: 0,
                display: '',
                sourceTurnKey: '',
                revision: 0,
            },
            scene: {
                sequence: 0,
                currentInstanceId: '',
                instances: {},
            },
            summary: {
                pendingKind: '',
                pendingTurnKey: '',
                lastSmallTurnIndex: -1,
                lastLargeTurnIndex: -1,
                lastSmallTurnKey: '',
                lastLargeTurnKey: '',
            },
            publication: {
                desiredRevision: 0,
                confirmedRevision: 0,
                status: 'clean',
                pendingJobId: '',
                lastError: '',
                updatedAt: '',
            },
        },
        outbox: [],
        narrativeContext: emptyNarrativeContext(),
        updatedAt: nowIso(),
    };
}

function normalizeSceneInstance(value, id) {
    const source = value && typeof value === 'object' ? value : {};
    const status = ['active', 'closing', 'closed', 'archived'].includes(String(source.status))
        ? String(source.status)
        : 'active';
    return {
        id: cleanText(source.id || id, 180) || id,
        location: cleanText(source.location, 240),
        title: cleanText(source.title, 240),
        stage: cleanText(source.stage, 240),
        goal: cleanText(source.goal, 500),
        status,
        startedTurnKey: cleanText(source.startedTurnKey, 220),
        startedTurnIndex: integer(source.startedTurnIndex),
        closedTurnKey: cleanText(source.closedTurnKey, 220),
        closedTurnIndex: integer(source.closedTurnIndex),
        closureReason: cleanText(source.closureReason, 500),
        eventIds: Array.isArray(source.eventIds)
            ? [...new Set(source.eventIds.map((item) => cleanText(item, 180)).filter(Boolean))].slice(0, 40)
            : [],
        updatedAt: cleanText(source.updatedAt, 80) || nowIso(),
    };
}

function normalizeOutboxJob(value) {
    const source = value && typeof value === 'object' ? value : {};
    const status = ['pending', 'running', 'done', 'failed', 'cancelled', 'superseded'].includes(String(source.status))
        ? String(source.status)
        : 'pending';
    const type = ['small-summary', 'large-summary', 'lorebook-sync'].includes(String(source.type))
        ? String(source.type)
        : '';
    const id = cleanText(source.id, 220);
    if (!id || !type)
        return null;
    return {
        id,
        type,
        turnKey: cleanText(source.turnKey, 220),
        turnIndex: integer(source.turnIndex),
        sourceRevision: Math.max(0, integer(source.sourceRevision, 0)),
        status,
        attempts: Math.max(0, integer(source.attempts, 0)),
        createdAt: cleanText(source.createdAt, 80) || nowIso(),
        startedAt: cleanText(source.startedAt, 80),
        finishedAt: cleanText(source.finishedAt, 80),
        error: cleanText(source.error, 1200),
    };
}

function normalizeRuntimeV2(value) {
    const base = emptyRuntimeV2();
    const source = value && typeof value === 'object' ? value : {};
    const machines = source.machines && typeof source.machines === 'object' ? source.machines : {};
    const sceneSource = machines.scene && typeof machines.scene === 'object' ? machines.scene : {};
    const instances = {};
    for (const [id, instance] of Object.entries(sceneSource.instances ?? {})) {
        const normalized = normalizeSceneInstance(instance, id);
        if (normalized.id)
            instances[normalized.id] = normalized;
    }
    const runtime = {
        ...base,
        version: RUNTIME_V2_VERSION,
        revision: Math.max(0, integer(source.revision, 0)),
        journal: Array.isArray(source.journal)
            ? source.journal.filter((item) => item && typeof item === 'object').slice(-3000)
            : [],
        processedTurnKeys: Array.isArray(source.processedTurnKeys)
            ? [...new Set(source.processedTurnKeys.map((item) => cleanText(item, 220)).filter(Boolean))].slice(-2000)
            : [],
        machines: {
            turn: {
                ...base.machines.turn,
                ...(machines.turn ?? {}),
                status: ['idle', 'committing', 'committed', 'failed'].includes(String(machines.turn?.status))
                    ? String(machines.turn.status)
                    : 'idle',
                lastTurnKey: cleanText(machines.turn?.lastTurnKey, 220),
                lastTurnIndex: integer(machines.turn?.lastTurnIndex),
                lastCommittedAt: cleanText(machines.turn?.lastCommittedAt, 80),
            },
            clock: {
                ...base.machines.clock,
                ...(machines.clock ?? {}),
                elapsedMinutes: Math.max(0, integer(machines.clock?.elapsedMinutes, 0)),
                display: cleanText(machines.clock?.display, 240),
                sourceTurnKey: cleanText(machines.clock?.sourceTurnKey, 220),
                revision: Math.max(0, integer(machines.clock?.revision, 0)),
            },
            scene: {
                sequence: Math.max(0, integer(sceneSource.sequence, 0)),
                currentInstanceId: cleanText(sceneSource.currentInstanceId, 180),
                instances,
            },
            summary: {
                ...base.machines.summary,
                ...(machines.summary ?? {}),
                pendingKind: ['small', 'large'].includes(String(machines.summary?.pendingKind))
                    ? String(machines.summary.pendingKind)
                    : '',
                pendingTurnKey: cleanText(machines.summary?.pendingTurnKey, 220),
                lastSmallTurnIndex: integer(machines.summary?.lastSmallTurnIndex),
                lastLargeTurnIndex: integer(machines.summary?.lastLargeTurnIndex),
                lastSmallTurnKey: cleanText(machines.summary?.lastSmallTurnKey, 220),
                lastLargeTurnKey: cleanText(machines.summary?.lastLargeTurnKey, 220),
            },
            publication: {
                ...base.machines.publication,
                ...(machines.publication ?? {}),
                desiredRevision: Math.max(0, integer(machines.publication?.desiredRevision, 0)),
                confirmedRevision: Math.max(0, integer(machines.publication?.confirmedRevision, 0)),
                status: ['clean', 'dirty', 'queued', 'writing', 'failed', 'suppressed'].includes(String(machines.publication?.status))
                    ? String(machines.publication.status)
                    : 'clean',
                pendingJobId: cleanText(machines.publication?.pendingJobId, 220),
                lastError: cleanText(machines.publication?.lastError, 1200),
                updatedAt: cleanText(machines.publication?.updatedAt, 80),
            },
        },
        outbox: Array.isArray(source.outbox)
            ? source.outbox.map(normalizeOutboxJob).filter(Boolean).slice(-1000)
            : [],
        narrativeContext: {
            ...base.narrativeContext,
            ...(source.narrativeContext ?? {}),
            revision: Math.max(0, integer(source.narrativeContext?.revision, 0)),
            time: cleanText(source.narrativeContext?.time, 240),
            location: cleanText(source.narrativeContext?.location, 240),
            scene: cleanText(source.narrativeContext?.scene, 240),
            stage: cleanText(source.narrativeContext?.stage, 240),
            goal: cleanText(source.narrativeContext?.goal, 500),
            completedPrerequisites: Array.isArray(source.narrativeContext?.completedPrerequisites)
                ? [...new Set(source.narrativeContext.completedPrerequisites.map((item) => cleanText(item, 500)).filter(Boolean))].slice(-8)
                : [],
            activeEvents: Array.isArray(source.narrativeContext?.activeEvents)
                ? [...new Set(source.narrativeContext.activeEvents.map((item) => cleanText(item, 500)).filter(Boolean))].slice(0, 8)
                : [],
            effectiveFacts: Array.isArray(source.narrativeContext?.effectiveFacts)
                ? [...new Set(source.narrativeContext.effectiveFacts.map((item) => cleanText(item, 500)).filter(Boolean))].slice(0, 10)
                : [],
            generatedAt: cleanText(source.narrativeContext?.generatedAt, 80) || nowIso(),
        },
        updatedAt: cleanText(source.updatedAt, 80) || nowIso(),
    };
    if (runtime.machines.scene.currentInstanceId && !runtime.machines.scene.instances[runtime.machines.scene.currentInstanceId]) {
        runtime.machines.scene.currentInstanceId = '';
    }
    // 已确认投影覆盖其之前的同步意图，旧任务不应永久停留在 pending/failed。
    for (const job of runtime.outbox) {
        if (job.type === 'lorebook-sync'
            && ['pending', 'running', 'failed'].includes(job.status)
            && job.sourceRevision <= runtime.machines.publication.confirmedRevision) {
            job.status = 'superseded';
            job.finishedAt ||= runtime.machines.publication.updatedAt || nowIso();
            job.error = '';
        }
    }
    const liveSyncJobs = runtime.outbox
        .filter((job) => job.type === 'lorebook-sync'
            && ['pending', 'running'].includes(job.status)
            && job.sourceRevision > runtime.machines.publication.confirmedRevision)
        .sort((a, b) => a.sourceRevision - b.sourceRevision);
    if (!liveSyncJobs.some((job) => job.id === runtime.machines.publication.pendingJobId))
        runtime.machines.publication.pendingJobId = liveSyncJobs.at(-1)?.id || '';
    if (runtime.machines.publication.confirmedRevision >= runtime.machines.publication.desiredRevision && !liveSyncJobs.length)
        runtime.machines.publication.status = 'clean';
    else if (runtime.machines.publication.status === 'clean')
        runtime.machines.publication.status = liveSyncJobs.some((job) => job.status === 'running') ? 'writing' : 'queued';
    const liveSummaryJobs = runtime.outbox
        .filter((job) => ['small-summary', 'large-summary'].includes(job.type) && ['pending', 'running'].includes(job.status));
    const latestSummaryJob = liveSummaryJobs.at(-1);
    if (latestSummaryJob && (!runtime.machines.summary.pendingKind || !runtime.machines.summary.pendingTurnKey)) {
        runtime.machines.summary.pendingKind = latestSummaryJob.type === 'small-summary' ? 'small' : 'large';
        runtime.machines.summary.pendingTurnKey = latestSummaryJob.turnKey;
    }
    return runtime;
}

}
};
__defs["storage/repository.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"MODULE_NAME",{enumerable:true,configurable:true,get:()=>__require("constants.js")["MODULE_NAME"]});
Object.defineProperty(__scope,"currentChatKey",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["currentChatKey"]});
Object.defineProperty(__scope,"currentChatLocator",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["currentChatLocator"]});
Object.defineProperty(__scope,"getChat",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getChat"]});
Object.defineProperty(__scope,"getChatMetadataNamespace",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getChatMetadataNamespace"]});
Object.defineProperty(__scope,"getSettings",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getSettings"]});
Object.defineProperty(__scope,"assertChatCommitCurrent",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["assertChatCommitCurrent"]});
Object.defineProperty(__scope,"CommitRejectedError",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["CommitRejectedError"]});
Object.defineProperty(__scope,"persistChatFor",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["persistChatFor"]});
Object.defineProperty(__scope,"persistMetadataFor",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["persistMetadataFor"]});
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
Object.defineProperty(__scope,"mergeInternalFacts",{enumerable:true,configurable:true,get:()=>__require("domain/internal-facts.js")["mergeInternalFacts"]});
Object.defineProperty(__scope,"migrateLegacyConsumption",{enumerable:true,configurable:true,get:()=>__require("domain/internal-facts.js")["migrateLegacyConsumption"]});
Object.defineProperty(__scope,"normalizeInternalFacts",{enumerable:true,configurable:true,get:()=>__require("domain/internal-facts.js")["normalizeInternalFacts"]});
Object.defineProperty(__scope,"canonicalObjectTitle",{enumerable:true,configurable:true,get:()=>__require("domain/object-identity.js")["canonicalObjectTitle"]});
Object.defineProperty(__scope,"enforceObjectViewAllocation",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["enforceObjectViewAllocation"]});
Object.defineProperty(__scope,"enforceCurrentSpacetimeSingleton",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["enforceCurrentSpacetimeSingleton"]});
Object.defineProperty(__scope,"mergePersistedCharacterDuplicates",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["mergePersistedCharacterDuplicates"]});
Object.defineProperty(__scope,"normalizeSnapshot",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["normalizeSnapshot"]});
Object.defineProperty(__scope,"preserveStableObjectIds",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["preserveStableObjectIds"]});
Object.defineProperty(__scope,"rewriteObjectReferences",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["rewriteObjectReferences"]});
Object.defineProperty(__scope,"garbageCollectLegacyEntryTombstones",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["garbageCollectLegacyEntryTombstones"]});
Object.defineProperty(__scope,"normalizeEntryLifecycleValue",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["normalizeEntryLifecycleValue"]});
Object.defineProperty(__scope,"mergeDuplicateStateRows",{enumerable:true,configurable:true,get:()=>__require("domain/state-text.js")["mergeDuplicateStateRows"]});
Object.defineProperty(__scope,"normalizeRecordingBoundary",{enumerable:true,configurable:true,get:()=>__require("domain/recording-boundary.js")["normalizeRecordingBoundary"]});
Object.defineProperty(__scope,"normalizeLorebookPublication",{enumerable:true,configurable:true,get:()=>__require("domain/publication-control.js")["normalizeLorebookPublication"]});
Object.defineProperty(__scope,"emptyRuntimeV2",{enumerable:true,configurable:true,get:()=>__require("runtime-v2/state.js")["emptyRuntimeV2"]});
Object.defineProperty(__scope,"normalizeRuntimeV2",{enumerable:true,configurable:true,get:()=>__require("runtime-v2/state.js")["normalizeRuntimeV2"]});
with(__scope){
Object.defineProperty(exports,"putArtifact",{enumerable:true,configurable:true,get:()=>putArtifact});
Object.defineProperty(exports,"putChatState",{enumerable:true,configurable:true,get:()=>putChatState});
Object.defineProperty(exports,"clearAllStorage",{enumerable:true,configurable:true,get:()=>clearAllStorage});
Object.defineProperty(exports,"emptyChatState",{enumerable:true,configurable:true,get:()=>emptyChatState});
Object.defineProperty(exports,"migrateLegacySmallSummaryVersions",{enumerable:true,configurable:true,get:()=>migrateLegacySmallSummaryVersions});
Object.defineProperty(exports,"getChatState",{enumerable:true,configurable:true,get:()=>getChatState});
Object.defineProperty(exports,"CURRENT_SCHEMA_VERSION",{enumerable:true,configurable:true,get:()=>CURRENT_SCHEMA_VERSION});
/**
 * 模块职责：定义消息 artifact 与聊天级 ChatState 的存储边界，并迁移 rc.19 事实/总结数据。
 * 维护边界：消息结果附着 message.extra；内部事实与消费标记写入当前 chatMetadata，并在保存前后校验 chatKey。
 */
const CURRENT_SCHEMA_VERSION = 6;
/** ChatState 是持久化 JSON 数据；使用 JSON 副本兼容 SillyTavern/插件可能提供的 Proxy 包装对象。 */
function cloneChatState(value) {
    return JSON.parse(JSON.stringify(value));
}
function emptyChatState(chatKey) {
    return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        memoryStateVersion: 2,
        chatKey,
        processedMessageKeys: [],
        internalFacts: [],
        smallSummaries: [],
        largeSummaries: [],
        lastSyncStatus: 'idle',
        lorebookPublication: normalizeLorebookPublication(),
        runtimeV2: emptyRuntimeV2(),
        migration: { dynamicTablesV23: false, internalFactsV23: false, objectViewsV26: false, objectAllocationV27: false, summaryVersionsV27: false, regionAllocationV28: false, characterMergeV29: false, persistedCharacterMergeV30: false, uniqueObjectNamesV31: false, spacetimeSingletonV32: false, entryLifecycleV33: false, singleAuthorityV34: false, factContractV35: false },
        updatedAt: nowIso(),
    };
}
function normalizeSummaryArrays(value, kind) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => item && typeof item === 'object').map((item) => ({
        ...item,
        kind,
        sourceKeys: Array.isArray(item.sourceKeys) ? [...new Set(item.sourceKeys.map(String))] : [],
        sourceFactIds: Array.isArray(item.sourceFactIds) ? [...new Set(item.sourceFactIds.map(String))] : undefined,
        sourceSummaryIds: Array.isArray(item.sourceSummaryIds) ? [...new Set(item.sourceSummaryIds.map(String))] : undefined,
        eventIds: Array.isArray(item.eventIds) ? [...new Set(item.eventIds.map(String))] : undefined,
        unresolvedItems: Array.isArray(item.unresolvedItems) ? [...new Set(item.unresolvedItems.map(String))] : undefined,
    }));
}
/**
 * rc.23 以前同一 event_id 可能累计留下多条尚未固化的小总结。迁移时把它们整理为一条
 * 可继续更新的累计版本，同时保留旧记录和版本指针，避免世界书残留、再次进入大总结。
 */
function migrateLegacySmallSummaryVersions(small, large) {
    const consumedByLarge = new Set(large.flatMap((item) => item.sourceSummaryIds ?? item.sourceKeys));
    const groups = new Map();
    small.forEach((item, index) => {
        if (item.solidifiedByLargeSummaryId || item.supersededBySmallSummaryId || consumedByLarge.has(item.id))
            return;
        // 缺少 event_id 的旧摘要无法可靠判断是否属于同一事件，保持独立，不按同名标题猜测合并。
        const eventKey = String(item.eventId || '').trim();
        if (!eventKey)
            return;
        const rows = groups.get(eventKey) ?? [];
        rows.push({ item, index });
        groups.set(eventKey, rows);
    });
    let changed = false;
    for (const rows of groups.values()) {
        if (rows.length < 2)
            continue;
        rows.sort((a, b) => String(a.item.createdAt || '').localeCompare(String(b.item.createdAt || '')) || a.index - b.index);
        const latest = rows.at(-1).item;
        const older = rows.slice(0, -1).map(({ item }) => item);
        const summaries = [...new Set(rows.map(({ item }) => String(item.summary || '').trim()).filter(Boolean))];
        const unresolved = [...new Set(rows.flatMap(({ item }) => item.unresolvedItems ?? []))];
        const sourceFactIds = [...new Set(rows.flatMap(({ item }) => item.sourceFactIds ?? item.sourceKeys))];
        const sourceKeys = [...new Set(rows.flatMap(({ item }) => item.sourceKeys ?? []))];
        latest.summary = summaries.join('\n');
        latest.unresolvedItems = unresolved;
        latest.sourceFactIds = sourceFactIds;
        latest.sourceKeys = sourceKeys.length ? sourceKeys : sourceFactIds;
        latest.previousSmallSummaryId ||= older.at(-1)?.id;
        latest.rollupCount = Math.max(Number(latest.rollupCount) || 1, rows.length);
        for (const item of older)
            item.supersededBySmallSummaryId = latest.id;
        changed = true;
    }
    return changed;
}
function currentCharacterIds(chatKey, registry) {
    const characterTable = registry.find((table) => table.enabled && table.role === 'characters');
    if (!characterTable)
        return new Set();
    const chat = getChat();
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const artifact = chat[index]?.extra?.[MODULE_NAME];
        if (!artifact || artifact.chatKey !== chatKey || !artifact.snapshot)
            continue;
        const rows = artifact.snapshot[characterTable.key];
        return new Set((Array.isArray(rows) ? rows : [])
            .map((row) => String(row?.id ?? '').trim())
            .filter(Boolean));
    }
    return new Set();
}
function validateCurrentFocus(state, registry) {
    const hadFocus = Object.prototype.hasOwnProperty.call(state, 'focusObjectId');
    const focusObjectId = String(state.focusObjectId ?? '').trim();
    if (!focusObjectId) {
        delete state.focusObjectId;
        return hadFocus;
    }
    if (!currentCharacterIds(state.chatKey, registry).has(focusObjectId)) {
        delete state.focusObjectId;
        return true;
    }
    return false;
}
/**
 * rc.38 及更早版本曾把“历史暂停/重建进度”写入 lastSyncStatus/lastSyncError。
 * lastSync* 只应描述真实世界书写入结果；控制流状态由 historyInvalidation/historyRecovery 表达。
 */
function normalizeLegacySyncControlState(state) {
    const error = String(state.lastSyncError ?? '').trim();
    if (!error || state.lastSyncStatus !== 'failed')
        return false;
    const controlOnly = /^(?:正在重建|历史核心状态已重建|历史核心状态与总结已恢复|历史消息发生变化|最新正文已变化|检测到历史删除|已选择从第|历史恢复被中断|正文已修正|历史重建未完成)/.test(error)
        || (/^历史核心状态已恢复，但部分派生失败/.test(error) && !error.includes('世界书：'));
    if (!controlOnly)
        return false;
    state.lastSyncStatus = state.lastSyncAt ? 'success' : 'idle';
    delete state.lastSyncError;
    return true;
}
function aliasMapFrom(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return new Map();
    return new Map(Object.entries(value)
        .map(([oldId, stableId]) => [String(oldId).trim(), String(stableId ?? '').trim()])
        .filter(([oldId, stableId]) => Boolean(oldId && stableId && oldId !== stableId)));
}
function resolveIdAlias(value, aliases) {
    let current = String(value || '').trim();
    const seen = new Set();
    while (current && aliases.has(current) && !seen.has(current)) {
        seen.add(current);
        current = String(aliases.get(current) || '').trim() || current;
    }
    return current;
}
function flattenAliasMap(aliases) {
    const flattened = new Map();
    for (const oldId of aliases.keys()) {
        const stableId = resolveIdAlias(oldId, aliases);
        if (oldId && stableId && oldId !== stableId)
            flattened.set(oldId, stableId);
    }
    return flattened;
}
function applyObjectIdAliases(snapshot, aliases, registry) {
    if (!aliases.size)
        return false;
    aliases = flattenAliasMap(aliases);
    let changed = false;
    for (const table of registry) {
        for (const row of snapshot[table.key] ?? []) {
            const stableId = resolveIdAlias(row.id, aliases);
            if (stableId && stableId !== row.id) {
                row.id = stableId;
                changed = true;
            }
        }
    }
    rewriteObjectReferences(snapshot, aliases);
    return changed;
}
/** 将旧 artifact 事实包与旧固定视图迁入聊天级内部事实层和当前对象视图。 */
function migrateChatState(raw, chatKey) {
    const state = raw && raw.chatKey === chatKey ? cloneChatState(raw) : emptyChatState(chatKey);
    const metadataBefore = JSON.stringify(raw ?? null);
    const previousSchema = Number(state.schemaVersion) || 1;
    const needsViewMigration = state.migration?.dynamicTablesV23 !== true;
    const needsFactMigration = state.migration?.internalFactsV23 !== true;
    const needsObjectViewMigration = state.migration?.objectViewsV26 !== true;
    const needsObjectAllocationMigration = state.migration?.objectAllocationV27 !== true;
    const needsSummaryVersionMigration = state.migration?.summaryVersionsV27 !== true;
    // rc.24 只清理了与当前时空路径重叠的临时区域；rc.25 重新跑一次对象分配，清理其他无依据自动区域。
    const needsRegionAllocationMigration = state.migration?.regionAllocationV28 !== true;
    // rc.26 固定 characters/state 合并优先级；已执行旧迁移的聊天也必须重新归一化一次。
    const needsCharacterMergeMigration = state.migration?.characterMergeV29 !== true;
    // rc.27 专门修复已经被 rc.25 保存为 characters 单表、且重复行 ID 已分裂的聊天。
    const needsPersistedCharacterMergeMigration = state.migration?.persistedCharacterMergeV30 !== true;
    // rc.53 将“同表同名唯一”提升为全表硬约束；旧迁移完成的聊天也必须重新扫描全部历史快照。
    const needsUniqueObjectNamesMigration = state.migration?.uniqueObjectNamesV31 !== true;
    // 1.3.7 将时空表收敛为每聊天唯一的当前时空单例。
    const needsSpacetimeSingletonMigration = state.migration?.spacetimeSingletonV32 !== true;
    // 1.3.9 将 absorbed/retired 统一迁移为 settling，并用同一覆盖闸门回收已完成旧墓碑。
    const needsEntryLifecycleMigration = state.migration?.entryLifecycleV33 !== true;
    const needsSingleAuthorityMigration = state.migration?.singleAuthorityV34 !== true;
    // core.4 为旧事实补齐主宿主、切面、保存层级和有效区间；无法确认对象时保留 legacy 宿主，不猜测归并。
    const needsFactContractMigration = state.migration?.factContractV35 !== true;
    const needsFullSnapshotMigration = needsViewMigration || needsObjectViewMigration
        || needsObjectAllocationMigration || needsRegionAllocationMigration || needsCharacterMergeMigration;
    let artifactViewsChanged = false;
    state.schemaVersion = CURRENT_SCHEMA_VERSION;
    state.runtimeV2 = normalizeRuntimeV2(state.runtimeV2);
    state.memoryStateVersion = 2;
    state.chatLocator = currentChatLocator() || state.chatLocator;
    state.processedMessageKeys = Array.isArray(state.processedMessageKeys) ? [...new Set(state.processedMessageKeys.map(String))] : [];
    state.recordingBoundary = normalizeRecordingBoundary(state.recordingBoundary);
    state.lorebookPublication = normalizeLorebookPublication(state.lorebookPublication);
    if (!state.recordingBoundary && state.processedMessageKeys.length) {
        const processed = new Set(state.processedMessageKeys);
        const firstIndex = getChat().findIndex((message) => {
            const artifact = message?.extra?.[MODULE_NAME];
            return Boolean(artifact?.chatKey === chatKey && processed.has(String(artifact.messageKey || '')));
        });
        if (firstIndex >= 0) {
            state.recordingBoundary = {
                startIndex: firstIndex,
                setAt: state.updatedAt || nowIso(),
                source: 'legacy',
            };
        }
    }
    state.smallSummaries = normalizeSummaryArrays(state.smallSummaries, 'small');
    state.largeSummaries = normalizeSummaryArrays(state.largeSummaries, 'large');
    const summaryVersionsChanged = needsSummaryVersionMigration
        ? migrateLegacySmallSummaryVersions(state.smallSummaries, state.largeSummaries)
        : false;
    let facts = normalizeInternalFacts(state.internalFacts);
    const registry = getSettings().tableRegistry;
    let previousMigratedSnapshot;
    let persistedCharactersChanged = false;
    let uniqueObjectNamesChanged = false;
    const uniqueNameAliases = new Map();
    const canonicalIdsByTableTitle = new Map();
    for (const message of getChat()) {
        const artifact = message?.extra?.[MODULE_NAME];
        if (!artifact || artifact.chatKey !== chatKey)
            continue;
        if ((needsFullSnapshotMigration || needsPersistedCharacterMergeMigration || needsUniqueObjectNamesMigration || needsSpacetimeSingletonMigration || needsEntryLifecycleMigration || needsSingleAuthorityMigration) && artifact.snapshot) {
            const before = JSON.stringify({
                snapshot: artifact.snapshot,
                aliases: artifact.persistedCharacterIdAliasesV30,
                uniqueAliases: artifact.uniqueObjectIdAliasesV31,
                sync: artifact.stages?.sync,
                lorebookEntryIds: artifact.lorebookEntryIds,
            });
            let migrated = needsFullSnapshotMigration
                ? normalizeSnapshot(artifact.snapshot, previousMigratedSnapshot ?? artifact.snapshot, registry)
                : structuredClone(artifact.snapshot);
            if (needsFullSnapshotMigration && previousMigratedSnapshot) {
                migrated = preserveStableObjectIds(previousMigratedSnapshot, migrated, registry);
            }
            if (needsPersistedCharacterMergeMigration) {
                const savedAliases = artifact.persistedCharacterIdAliasesV30
                    && typeof artifact.persistedCharacterIdAliasesV30 === 'object'
                    ? artifact.persistedCharacterIdAliasesV30
                    : {};
                const aliasMap = new Map(Object.entries(savedAliases)
                    .map(([oldId, stableId]) => [String(oldId), String(stableId)])
                    .filter(([oldId, stableId]) => Boolean(oldId && stableId)));
                if (aliasMap.size)
                    persistedCharactersChanged = true;
                rewriteObjectReferences(migrated, aliasMap);
                const persisted = mergePersistedCharacterDuplicates(migrated, registry);
                migrated = persisted.snapshot;
                if (persisted.idRemap.size) {
                    artifact.persistedCharacterIdAliasesV30 = {
                        ...Object.fromEntries(aliasMap),
                        ...Object.fromEntries(persisted.idRemap),
                    };
                    persistedCharactersChanged = true;
                    if (artifact.stages?.sync) {
                        artifact.stages.sync = {
                            ...artifact.stages.sync,
                            status: 'idle',
                            error: undefined,
                            startedAt: undefined,
                            finishedAt: undefined,
                        };
                    }
                    delete artifact.lorebookEntryIds;
                }
            }
            if (needsUniqueObjectNamesMigration) {
                const savedAliases = aliasMapFrom(artifact.uniqueObjectIdAliasesV31);
                if (savedAliases.size) {
                    applyObjectIdAliases(migrated, savedAliases, registry);
                    for (const [oldId, stableId] of savedAliases)
                        uniqueNameAliases.set(oldId, stableId);
                    uniqueObjectNamesChanged = true;
                }
                const unique = mergeDuplicateStateRows(migrated, registry);
                migrated = unique.snapshot;
                const artifactAliases = new Map(savedAliases);
                for (const [oldId, stableId] of unique.idRemap)
                    artifactAliases.set(oldId, stableId);
                // 跨历史快照也必须沿用同一对象 ID：首次出现的规范名称确定稳定 ID，后续切面不得换 ID。
                const crossSnapshotAliases = new Map();
                for (const table of registry) {
                    const rows = migrated[table.key] ?? [];
                    const occupied = new Map(rows.map((row) => [row.id, row]));
                    for (const row of rows) {
                        const titleToken = canonicalObjectTitle(row.title);
                        if (!titleToken)
                            continue;
                        const identityKey = `${table.key}\u0000${titleToken}`;
                        const stableId = canonicalIdsByTableTitle.get(identityKey);
                        if (!stableId) {
                            canonicalIdsByTableTitle.set(identityKey, row.id);
                            continue;
                        }
                        if (stableId === row.id)
                            continue;
                        const collision = occupied.get(stableId);
                        if (collision && collision !== row) {
                            throw new Error(`对象唯一化迁移检测到 ID 冲突：${table.key}/${row.title}/${stableId}`);
                        }
                        const oldId = row.id;
                        row.id = stableId;
                        occupied.delete(oldId);
                        occupied.set(stableId, row);
                        crossSnapshotAliases.set(oldId, stableId);
                        artifactAliases.set(oldId, stableId);
                    }
                }
                if (crossSnapshotAliases.size)
                    rewriteObjectReferences(migrated, crossSnapshotAliases);
                const flattenedAliases = flattenAliasMap(artifactAliases);
                if (flattenedAliases.size) {
                    artifact.uniqueObjectIdAliasesV31 = Object.fromEntries(flattenedAliases);
                    for (const [oldId, stableId] of flattenedAliases)
                        uniqueNameAliases.set(oldId, stableId);
                }
                if (unique.mergedCount || crossSnapshotAliases.size || savedAliases.size) {
                    uniqueObjectNamesChanged = true;
                    if (artifact.stages?.sync) {
                        artifact.stages.sync = {
                            ...artifact.stages.sync,
                            status: 'idle',
                            error: undefined,
                            startedAt: undefined,
                            finishedAt: undefined,
                        };
                    }
                    delete artifact.lorebookEntryIds;
                }
            }
            if (needsEntryLifecycleMigration || needsSingleAuthorityMigration) {
                for (const table of registry) {
                    for (const row of migrated[table.key] ?? []) {
                        if (!row.entryLifecycle)
                            continue;
                        const normalizedLifecycle = normalizeEntryLifecycleValue(row.entryLifecycle, row.entryLifecycle);
                        if (normalizedLifecycle)
                            row.entryLifecycle = normalizedLifecycle;
                        else
                            delete row.entryLifecycle;
                    }
                }
            }
            if (needsFullSnapshotMigration)
                migrated = enforceObjectViewAllocation(migrated, registry);
            if (needsSpacetimeSingletonMigration)
                migrated = enforceCurrentSpacetimeSingleton(migrated, registry);
            artifact.snapshot = migrated;
            if (needsFullSnapshotMigration)
                previousMigratedSnapshot = migrated;
            const after = JSON.stringify({
                snapshot: artifact.snapshot,
                aliases: artifact.persistedCharacterIdAliasesV30,
                uniqueAliases: artifact.uniqueObjectIdAliasesV31,
                sync: artifact.stages?.sync,
                lorebookEntryIds: artifact.lorebookEntryIds,
            });
            if (after !== before)
                artifactViewsChanged = true;
        }
        else if (artifact.snapshot) {
            if (needsFullSnapshotMigration)
                previousMigratedSnapshot = normalizeSnapshot(artifact.snapshot, artifact.snapshot, registry);
        }
        if (!needsFactMigration || !artifact.factPackage?.facts?.length)
            continue;
        const incoming = normalizeInternalFacts(artifact.factPackage.facts, artifact.messageKey);
        facts = mergeInternalFacts(facts, incoming, artifact.factPackage.facts);
    }
    if (state.focusObjectId) {
        const stableFocusId = resolveIdAlias(state.focusObjectId, flattenAliasMap(uniqueNameAliases));
        if (stableFocusId && stableFocusId !== state.focusObjectId) {
            state.focusObjectId = stableFocusId;
            uniqueObjectNamesChanged = true;
        }
    }
    validateCurrentFocus(state, registry);
    normalizeLegacySyncControlState(state);
    if (persistedCharactersChanged || uniqueObjectNamesChanged) {
        state.lastSyncStatus = 'idle';
        state.lastSyncError = undefined;
    }
    if (needsFactMigration || needsSummaryVersionMigration || needsFactContractMigration) {
        migrateLegacyConsumption(facts, state.smallSummaries, state.largeSummaries);
    }
    state.internalFacts = facts;
    if (needsEntryLifecycleMigration) {
        for (const message of getChat()) {
            const artifact = message?.extra?.[MODULE_NAME];
            if (!artifact || artifact.chatKey !== chatKey || !artifact.snapshot)
                continue;
            const gc = garbageCollectLegacyEntryTombstones(artifact.snapshot, facts, registry, state.focusObjectId);
            if (gc.deletedRowIds.length || JSON.stringify(gc.snapshot) !== JSON.stringify(artifact.snapshot)) {
                artifact.snapshot = gc.snapshot;
                artifactViewsChanged = true;
                if (artifact.stages?.sync)
                    artifact.stages.sync = { ...artifact.stages.sync, status: 'idle', error: undefined };
                delete artifact.lorebookEntryIds;
            }
        }
    }
    state.migration = {
        ...(state.migration ?? {}),
        dynamicTablesV23: true,
        internalFactsV23: true,
        objectViewsV26: true,
        objectAllocationV27: true,
        summaryVersionsV27: true,
        regionAllocationV28: true,
        characterMergeV29: true,
        persistedCharacterMergeV30: true,
        uniqueObjectNamesV31: true,
        spacetimeSingletonV32: true,
        entryLifecycleV33: true,
        singleAuthorityV34: true,
        factContractV35: true,
    };
    state.updatedAt ||= nowIso();
    return {
        state,
        artifactViewsChanged,
        metadataChanged: metadataBefore !== JSON.stringify(state)
            || previousSchema !== CURRENT_SCHEMA_VERSION
            || summaryVersionsChanged,
    };
}
/** Canonical message artifacts live on message.extra. */
async function putArtifact(_artifact) {
    // The live artifact object is already attached to the SillyTavern message.
}
const chatStateReads = new Map();
const REQUIRED_MIGRATIONS = [
    'dynamicTablesV23',
    'internalFactsV23',
    'objectViewsV26',
    'objectAllocationV27',
    'summaryVersionsV27',
    'regionAllocationV28',
    'characterMergeV29',
    'persistedCharacterMergeV30',
    'uniqueObjectNamesV31',
    'spacetimeSingletonV32',
    'entryLifecycleV33',
    'singleAuthorityV34',
    'factContractV35',
];
function currentStateStructure(raw, chatKey) {
    if (!raw || typeof raw !== 'object')
        return false;
    const state = raw;
    if (state.schemaVersion !== CURRENT_SCHEMA_VERSION || state.memoryStateVersion !== 2 || state.chatKey !== chatKey)
        return false;
    if (!Array.isArray(state.processedMessageKeys)
        || !Array.isArray(state.internalFacts)
        || !Array.isArray(state.smallSummaries)
        || !Array.isArray(state.largeSummaries))
        return false;
    if (!state.processedMessageKeys.every((key) => typeof key === 'string'))
        return false;
    if (new Set(state.processedMessageKeys).size !== state.processedMessageKeys.length)
        return false;
    if (!['idle', 'success', 'failed'].includes(state.lastSyncStatus))
        return false;
    if (typeof state.updatedAt !== 'string')
        return false;
    if (state.focusObjectId !== undefined && typeof state.focusObjectId !== 'string')
        return false;
    if (state.recordingBoundary !== undefined && !normalizeRecordingBoundary(state.recordingBoundary))
        return false;
    if (JSON.stringify(state.lorebookPublication) !== JSON.stringify(normalizeLorebookPublication(state.lorebookPublication)))
        return false;
    if (JSON.stringify(state.runtimeV2) !== JSON.stringify(normalizeRuntimeV2(state.runtimeV2)))
        return false;
    return REQUIRED_MIGRATIONS.every((key) => state.migration?.[key] === true);
}
async function readCurrentChatStateFast(namespace, state, chatKey) {
    const next = { ...state };
    const focusChanged = Object.prototype.hasOwnProperty.call(state, 'focusObjectId')
        ? validateCurrentFocus(next, getSettings().tableRegistry)
        : false;
    const syncStateChanged = normalizeLegacySyncControlState(next);
    if (!focusChanged && !syncStateChanged)
        return cloneChatState(state);
    namespace.state = next;
    try {
        await persistMetadataFor(chatKey);
        return cloneChatState(next);
    }
    catch (error) {
        namespace.state = state;
        throw error;
    }
}
async function readChatState(chatKey) {
    assertChatCommitCurrent(chatKey, '聊天已切换，不读取旧聊天状态');
    const namespace = getChatMetadataNamespace();
    if (currentStateStructure(namespace.state, chatKey)) {
        return readCurrentChatStateFast(namespace, namespace.state, chatKey);
    }
    const hadState = Object.prototype.hasOwnProperty.call(namespace, 'state');
    const previousState = namespace.state;
    const backups = [];
    for (const message of getChat()) {
        const artifact = message?.extra?.[MODULE_NAME];
        if (!artifact || artifact.chatKey !== chatKey)
            continue;
        backups.push({
            artifact,
            snapshot: artifact.snapshot,
            aliases: artifact.persistedCharacterIdAliasesV30,
            hadAliases: Object.prototype.hasOwnProperty.call(artifact, 'persistedCharacterIdAliasesV30'),
            uniqueAliases: artifact.uniqueObjectIdAliasesV31,
            hadUniqueAliases: Object.prototype.hasOwnProperty.call(artifact, 'uniqueObjectIdAliasesV31'),
            sync: artifact.stages?.sync,
            hadSync: Boolean(artifact.stages && Object.prototype.hasOwnProperty.call(artifact.stages, 'sync')),
            lorebookEntryIds: artifact.lorebookEntryIds,
            hadLorebookEntryIds: Object.prototype.hasOwnProperty.call(artifact, 'lorebookEntryIds'),
        });
    }
    const migration = migrateChatState(namespace.state, chatKey);
    let chatPersisted = false;
    try {
        if (migration.artifactViewsChanged) {
            await persistChatFor(chatKey);
            chatPersisted = true;
        }
        namespace.state = migration.state;
        if (migration.metadataChanged)
            await persistMetadataFor(chatKey);
        // 调用方拿到工作副本，只有 putChatState 成功后才进入聊天 metadata。
        // 避免保存失败时，未落盘修改仍污染当前运行期的规范状态。
        return cloneChatState(namespace.state);
    }
    catch (error) {
        if (hadState)
            namespace.state = previousState;
        else
            delete namespace.state;
        // 若聊天尚未确认保存，恢复所有内存 artifact；若聊天已保存而 metadata 失败，
        // 保留随聊天落盘的 V30/V31 ID 别名，让下一次读取能修复旧 focusObjectId 与对象引用后完成迁移位。
        if (!chatPersisted) {
            for (const backup of backups) {
                backup.artifact.snapshot = backup.snapshot;
                if (backup.hadAliases)
                    backup.artifact.persistedCharacterIdAliasesV30 = backup.aliases;
                else
                    delete backup.artifact.persistedCharacterIdAliasesV30;
                if (backup.hadUniqueAliases)
                    backup.artifact.uniqueObjectIdAliasesV31 = backup.uniqueAliases;
                else
                    delete backup.artifact.uniqueObjectIdAliasesV31;
                if (backup.artifact.stages) {
                    if (backup.hadSync)
                        backup.artifact.stages.sync = backup.sync;
                    else
                        delete backup.artifact.stages.sync;
                }
                if (backup.hadLorebookEntryIds)
                    backup.artifact.lorebookEntryIds = backup.lorebookEntryIds;
                else
                    delete backup.artifact.lorebookEntryIds;
            }
        }
        throw error;
    }
}
function getChatState(chatKey) {
    const running = chatStateReads.get(chatKey);
    if (running)
        return running;
    const pending = readChatState(chatKey).finally(() => {
        if (chatStateReads.get(chatKey) === pending)
            chatStateReads.delete(chatKey);
    });
    chatStateReads.set(chatKey, pending);
    return pending;
}
/** ChatState 只能写入其自身 chatKey 对应的当前聊天 metadata。 */
async function putChatState(state) {
    assertChatCommitCurrent(state.chatKey, '聊天已切换，不写入旧聊天状态');
    const namespace = getChatMetadataNamespace();
    const hadState = Object.prototype.hasOwnProperty.call(namespace, 'state');
    const previousState = hadState ? cloneChatState(namespace.state) : undefined;
    const hadUpdatedAt = Object.prototype.hasOwnProperty.call(namespace, 'updatedAt');
    const previousUpdatedAt = namespace.updatedAt;
    const next = cloneChatState(state);
    next.schemaVersion = CURRENT_SCHEMA_VERSION;
    next.chatLocator = currentChatLocator() || next.chatLocator;
    next.internalFacts = normalizeInternalFacts(next.internalFacts);
    next.recordingBoundary = normalizeRecordingBoundary(next.recordingBoundary);
    next.lorebookPublication = normalizeLorebookPublication(next.lorebookPublication);
    next.runtimeV2 = normalizeRuntimeV2(next.runtimeV2);
    if (next.migration?.internalFactsV23 !== true || next.migration?.summaryVersionsV27 !== true) {
        migrateLegacyConsumption(next.internalFacts, next.smallSummaries, next.largeSummaries);
    }
    next.updatedAt = nowIso();
    namespace.state = next;
    namespace.updatedAt = next.updatedAt;
    try {
        await persistMetadataFor(next.chatKey);
        // 保持调用方后续继续使用同一工作对象时能看到规范化后的成功版本。
        Object.assign(state, cloneChatState(next));
    }
    catch (error) {
        // 保存本身失败时回滚；若物理保存已完成、仅因随后切换聊天而拒绝继续提交，
        // 源聊天对象必须保留已经落盘的状态，不能反向制造内存/磁盘分歧。
        if (!(error instanceof CommitRejectedError)) {
            if (hadState)
                namespace.state = previousState;
            else
                delete namespace.state;
            if (hadUpdatedAt)
                namespace.updatedAt = previousUpdatedAt;
            else
                delete namespace.updatedAt;
        }
        throw error;
    }
}
async function clearAllStorage(chatKey = currentChatKey()) {
    assertChatCommitCurrent(chatKey, '聊天已切换，不清理旧聊天状态');
    const namespace = getChatMetadataNamespace();
    const hadState = Object.prototype.hasOwnProperty.call(namespace, 'state');
    const previousState = hadState ? cloneChatState(namespace.state) : undefined;
    const hadLorebookName = Object.prototype.hasOwnProperty.call(namespace, 'lorebookName');
    const previousLorebookName = namespace.lorebookName;
    const hadUpdatedAt = Object.prototype.hasOwnProperty.call(namespace, 'updatedAt');
    const previousUpdatedAt = namespace.updatedAt;
    delete namespace.state;
    delete namespace.lorebookName;
    namespace.updatedAt = nowIso();
    try {
        await persistMetadataFor(chatKey);
    }
    catch (error) {
        if (!(error instanceof CommitRejectedError)) {
            if (hadState)
                namespace.state = previousState;
            else
                delete namespace.state;
            if (hadLorebookName)
                namespace.lorebookName = previousLorebookName;
            else
                delete namespace.lorebookName;
            if (hadUpdatedAt)
                namespace.updatedAt = previousUpdatedAt;
            else
                delete namespace.updatedAt;
        }
        throw error;
    }
}

}
};
__defs["types.js"]=function(exports,__require){
const __scope=Object.create(null);
with(__scope){

}
};
__defs["ui/diagnostics.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"VERSION",{enumerable:true,configurable:true,get:()=>__require("constants.js")["VERSION"]});
Object.defineProperty(__scope,"enabledTables",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["enabledTables"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
Object.defineProperty(__scope,"currentChatKey",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["currentChatKey"]});
Object.defineProperty(__scope,"getSettings",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getSettings"]});
Object.defineProperty(__scope,"tryGetContext",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["tryGetContext"]});
Object.defineProperty(__scope,"getChatState",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["getChatState"]});
Object.defineProperty(__scope,"taskQueue",{enumerable:true,configurable:true,get:()=>__require("pipeline/task-queue.js")["taskQueue"]});
Object.defineProperty(__scope,"requestTraceReport",{enumerable:true,configurable:true,get:()=>__require("llm/generator.js")["requestTraceReport"]});
Object.defineProperty(__scope,"readHistoryWorkflow",{enumerable:true,configurable:true,get:()=>__require("workflow/history-workflow.js")["readHistoryWorkflow"]});
with(__scope){
Object.defineProperty(exports,"runDiagnostics",{enumerable:true,configurable:true,get:()=>runDiagnostics});
Object.defineProperty(exports,"diagnosticReport",{enumerable:true,configurable:true,get:()=>diagnosticReport});
/**
 * 模块职责：生成任务、请求、设置与运行状态诊断。
 * 维护边界：诊断不得包含提示词、玩家正文、角色正文、总结全文、完整响应或密钥。
 */
function historyStatus(state) {
    const workflow = readHistoryWorkflow(state);
    const pauseError = redactedError(workflow.pauseError);
    const recovery = workflow.recovery;
    if (recovery) {
        const progress = recovery.totalCount ? `${recovery.completedCount ?? 0}/${recovery.totalCount}` : '检查中';
        const current = Number.isInteger(recovery.currentIndex) ? `第 ${recovery.currentIndex + 1} 条消息` : '当前历史';
        if (recovery.phase === 'failed') {
            return { status: 'error', detail: `历史重建失败：${redactedError(recovery.error) || '未知错误'}${pauseError ? `；旧世界书暂停失败：${pauseError}` : ''}` };
        }
        if (pauseError) {
            return { status: 'error', detail: `历史恢复进行中，但旧世界书条目暂停失败：${pauseError}` };
        }
        if (recovery.phase === 'partial') {
            return { status: 'warn', detail: `历史核心状态已恢复，但派生不完整：${redactedError(recovery.error) || '请重试'}` };
        }
        const labels = {
            'rebuilding-core': '正在重建核心状态',
            'rebuilding-derived': '正在恢复总结',
            'publishing-lorebook': '正在发布世界书',
        };
        return { status: 'warn', detail: `${labels[recovery.phase] || '正在恢复历史'}（${progress}，${current}）` };
    }
    const invalidation = workflow.invalidation;
    if (invalidation) {
        if (invalidation.pauseError) {
            return { status: 'error', detail: `历史已失效，但旧世界书条目暂停失败：${invalidation.pauseError}` };
        }
        return {
            status: 'warn',
            detail: invalidation.startIndex === undefined
                ? '历史删除位置未知，需要先选择重算起点'
                : `${invalidation.automatic ? '最新正文正在自动恢复' : `第 ${invalidation.startIndex + 1} 条消息之后需要手动重算`}`,
        };
    }
    return { status: 'ok', detail: '当前派生数据未发现历史失效' };
}
function syncStatus(state) {
    const workflow = readHistoryWorkflow(state);
    if (workflow.blocked) {
        const pauseError = redactedError(workflow.pauseError);
        const last = state.lastSyncAt ? `；上次实际同步：${state.lastSyncAt}` : '';
        return pauseError
            ? { status: 'error', detail: `旧世界书条目暂停失败：${pauseError}${last}` }
            : { status: 'warn', detail: `历史恢复期间世界书同步暂停${last}` };
    }
    return {
        status: state?.lastSyncStatus === 'failed' ? 'error' : state?.lastSyncStatus === 'success' ? 'ok' : 'warn',
        detail: redactedError(state?.lastSyncError) || state?.lastSyncAt || '尚未同步',
    };
}
async function runDiagnostics() {
    const checks = [];
    const context = tryGetContext();
    checks.push({
        id: 'context',
        label: 'SillyTavern上下文',
        status: context ? 'ok' : 'error',
        detail: context ? '已连接' : '不可用',
    });
    checks.push({
        id: 'generateRaw',
        label: '当前连接原始调用',
        status: typeof context?.generateRaw === 'function' ? 'ok' : 'warn',
        detail: typeof context?.generateRaw === 'function' ? 'generateRaw可用' : '当前连接模式不可用；请选择可用的Connection Profile',
    });
    checks.push({
        id: 'connectionService',
        label: 'Connection Profile隔离调用',
        status: typeof context?.ConnectionManagerRequestService?.sendRequest === 'function' ? 'ok' : 'warn',
        detail: typeof context?.ConnectionManagerRequestService?.sendRequest === 'function'
            ? 'ConnectionManagerRequestService可用，不需要切换全局连接'
            : '不可用；Profile模式不可用，仍可使用当前聊天连接',
    });
    checks.push({
        id: 'settingsPanel',
        label: '扩展设置入口',
        status: document.querySelector('#ma11-settings-root') ? 'ok' : 'warn',
        detail: document.querySelector('#ma11-settings-root') ? '已挂载' : '尚未挂载',
    });
    const settings = context ? getSettings() : null;
    if (settings) {
        const registry = normalizeTableRegistry(settings.tableRegistry);
        checks.push({
            id: 'tableRegistry',
            label: '动态表格注册表',
            status: registry.length ? 'ok' : 'warn',
            detail: `${registry.length} 张已注册，${enabledTables(registry).length} 张启用`,
        });
        checks.push({
            id: 'modelProtocol',
            label: '模型返回协议',
            status: 'ok',
            detail: '审核、状态表、小总结和大总结统一使用固定文本；JSON仅用于插件内部存储',
        });
    }
    checks.push({
        id: 'audit',
        label: '规则审核配置',
        status: settings?.auditEnabled && !settings.auditPrompt.trim() ? 'error' : 'ok',
        detail: settings?.auditEnabled ? (settings.auditPrompt.trim() ? '已启用并填写规则' : '已启用但规则为空') : '未启用',
    });
    const revisionConnection = settings?.connections.revision;
    const revisionProfileMissing = Boolean(settings?.auditEnabled &&
        settings.auditFailAction === 'revise' &&
        revisionConnection?.mode === 'profile' && !revisionConnection.profileId.trim());
    checks.push({
        id: 'revision',
        label: '定向修正配置',
        status: revisionProfileMissing ? 'error' : 'ok',
        detail: settings?.auditFailAction === 'revise'
            ? revisionProfileMissing
                ? '修正模型已选择独立连接方式，但尚未选择有效配置'
                : `已启用，最多${settings.maxRevisionAttempts}次，失败后${settings.revisionFallbackAction}`
            : '未启用自动修正',
    });
    if (context) {
        const state = await getChatState(currentChatKey());
        const history = historyStatus(state);
        checks.push({ id: 'history', label: '历史数据一致性', ...history });
        const sync = syncStatus(state);
        checks.push({ id: 'sync', label: '最近世界书同步', ...sync });
    }
    return checks;
}
function redactedChatState(state) {
    if (!state)
        return {};
    return {
        schemaVersion: state.schemaVersion,
        chatKey: state.chatKey,
        processedMessageCount: Array.isArray(state.processedMessageKeys) ? state.processedMessageKeys.length : 0,
        latestSnapshotMessageKey: state.latestSnapshotMessageKey,
        recordingBoundary: state.recordingBoundary ? {
            startIndex: state.recordingBoundary.startIndex,
            setAt: state.recordingBoundary.setAt,
            source: state.recordingBoundary.source,
        } : undefined,
        suppressedLorebookEntryCount: Object.keys(state.lorebookPublication?.suppressed ?? {}).length,
        internalFactCount: Array.isArray(state.internalFacts) ? state.internalFacts.length : 0,
        pendingSmallFactCount: Array.isArray(state.internalFacts) ? state.internalFacts.filter((fact) => !fact.consumedBySmallSummaryId).length : 0,
        smallSummaryCount: Array.isArray(state.smallSummaries) ? state.smallSummaries.length : 0,
        largeSummaryCount: Array.isArray(state.largeSummaries) ? state.largeSummaries.length : 0,
        historyInvalidation: state.historyInvalidation ? {
            ...state.historyInvalidation,
            pauseError: redactedError(state.historyInvalidation.pauseError),
        } : undefined,
        historyRecovery: state.historyRecovery ? {
            ...state.historyRecovery,
            error: redactedError(state.historyRecovery.error),
        } : undefined,
        lastLorebookName: state.lastLorebookName ? '[已设置]' : '',
        lastSyncAt: state.lastSyncAt,
        lastSyncStatus: state.lastSyncStatus,
        lastSyncError: redactedError(state.lastSyncError),
        runtimeV2: state.runtimeV2 ? {
            version: state.runtimeV2.version,
            revision: state.runtimeV2.revision,
            processedTurnCount: Array.isArray(state.runtimeV2.processedTurnKeys) ? state.runtimeV2.processedTurnKeys.length : 0,
            journalCount: Array.isArray(state.runtimeV2.journal) ? state.runtimeV2.journal.length : 0,
            outbox: Array.isArray(state.runtimeV2.outbox) ? state.runtimeV2.outbox.map((job) => ({
                id: job.id,
                type: job.type,
                turnIndex: job.turnIndex,
                sourceRevision: job.sourceRevision,
                status: job.status,
                attempts: job.attempts,
                error: redactedError(job.error),
            })) : [],
            machines: state.runtimeV2.machines,
            narrativeContext: state.runtimeV2.narrativeContext,
        } : undefined,
        updatedAt: state.updatedAt,
    };
}
function redactedError(value) {
    const text = String(value ?? '').trim();
    if (!text)
        return undefined;
    return text
        .replace(/([；;]\s*(?:原始)?返回片段\s*[:：]).*$/s, '$1[已隐藏]')
        .slice(0, 1200);
}
function safeTask(task) {
    return {
        id: task.id,
        key: task.key,
        label: task.label,
        kind: task.kind,
        state: task.state,
        priority: task.priority,
        chatKey: task.chatKey,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        finishedAt: task.finishedAt,
        queueWaitMs: task.queueWaitMs,
        runMs: task.runMs,
        totalMs: task.totalMs,
        triggerSource: task.triggerSource,
        messageKey: task.messageKey,
        messageFingerprint: task.messageFingerprint,
        historyRevisionAtEnqueue: task.historyRevisionAtEnqueue,
        historyRecoveryPhaseAtEnqueue: task.historyRecoveryPhaseAtEnqueue,
        automatic: task.automatic === true,
        cancelRequestedAt: task.cancelRequestedAt,
        cancelReason: redactedError(task.cancelReason),
        skipReason: redactedError(task.skipReason),
        error: redactedError(task.error),
    };
}
function safeRequest(trace) {
    return {
        id: trace.id,
        lane: trace.lane,
        connectionLane: trace.connectionLane,
        requestClass: trace.requestClass,
        requestOrigin: trace.requestOrigin,
        task: trace.task,
        state: trace.state,
        createdAt: trace.createdAt,
        startedAt: trace.startedAt,
        finishedAt: trace.finishedAt,
        transportWaitMs: trace.transportWaitMs,
        requestMs: trace.requestMs,
        totalMs: trace.totalMs,
        firstByteMs: trace.firstByteMs,
        streamMode: trace.streamMode,
        requestPurpose: trace.requestPurpose,
        systemPromptChars: trace.systemPromptChars,
        promptChars: trace.promptChars,
        responseTokens: trace.responseTokens,
        protocol: trace.protocol,
        errorKind: trace.errorKind,
        httpStatus: trace.httpStatus,
        error: redactedError(trace.error),
    };
}
async function diagnosticReport() {
    const context = tryGetContext();
    const chatKey = context ? currentChatKey() : 'unavailable';
    const settings = context ? getSettings() : null;
    const chatState = context ? await getChatState(chatKey) : null;
    return {
        version: VERSION,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        location: location.origin,
        chatKey,
        checks: await runDiagnostics(),
        settings: settings ? {
            ...settings,
            auditPrompt: settings.auditPrompt ? '[已填写]' : '',
            revisionPrompt: settings.revisionPrompt ? '[已填写]' : '',
        } : null,
        chatState: redactedChatState(chatState),
        tasks: taskQueue.list().map(safeTask),
        requests: requestTraceReport().map(safeRequest),
        privacy: '诊断不包含玩家输入、AI正文、小总结正文、大总结正文、完整模型响应或API密钥',
    };
}

}
};
__defs["ui/message-panel.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"getChat",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getChat"]});
Object.defineProperty(__scope,"getSettings",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getSettings"]});
Object.defineProperty(__scope,"latestAssistantIndex",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["latestAssistantIndex"]});
Object.defineProperty(__scope,"toast",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["toast"]});
Object.defineProperty(__scope,"escapeHtml",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["escapeHtml"]});
Object.defineProperty(__scope,"toErrorMessage",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["toErrorMessage"]});
Object.defineProperty(__scope,"forceSummary",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["forceSummary"]});
Object.defineProperty(__scope,"getArtifactAt",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["getArtifactAt"]});
Object.defineProperty(__scope,"latestSnapshotArtifact",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["latestSnapshotArtifact"]});
Object.defineProperty(__scope,"processMessage",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["processMessage"]});
Object.defineProperty(__scope,"retryStage",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["retryStage"]});
Object.defineProperty(__scope,"subscribePipeline",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["subscribePipeline"]});
Object.defineProperty(__scope,"openWorkspace",{enumerable:true,configurable:true,get:()=>__require("ui/workspace.js")["openWorkspace"]});
Object.defineProperty(__scope,"applyAuditVisibility",{enumerable:true,configurable:true,get:()=>__require("pipeline/audit.js")["applyAuditVisibility"]});
Object.defineProperty(__scope,"snapshotRowCount",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["snapshotRowCount"]});
Object.defineProperty(__scope,"taskQueue",{enumerable:true,configurable:true,get:()=>__require("pipeline/task-queue.js")["taskQueue"]});
with(__scope){
Object.defineProperty(exports,"messageStageAvailability",{enumerable:true,configurable:true,get:()=>messageStageAvailability});
Object.defineProperty(exports,"panelHtml",{enumerable:true,configurable:true,get:()=>panelHtml});
Object.defineProperty(exports,"renderMessagePanel",{enumerable:true,configurable:true,get:()=>renderMessagePanel});
Object.defineProperty(exports,"renderAllMessagePanels",{enumerable:true,configurable:true,get:()=>renderAllMessagePanels});
Object.defineProperty(exports,"installMessagePanelHandlers",{enumerable:true,configurable:true,get:()=>installMessagePanelHandlers});
/**
 * 模块职责：渲染每条角色消息下方的阶段状态与操作入口。
 * 维护边界：UI 只展示 artifact 状态；所有阶段按钮必须调用 pipeline 公开入口。
 */
function stageLabel(stage) {
    const map = {
        idle: '等待', queued: '排队', running: '处理中', success: '成功', failed: '失败', cancelled: '已取消', skipped: '跳过', blocked: '阻断',
    };
    return map[stage?.status] || '等待';
}
function tone(stage) {
    if (stage?.status === 'success' || stage?.status === 'skipped')
        return 'success';
    if (stage?.status === 'failed' || stage?.status === 'blocked')
        return 'danger';
    if (stage?.status === 'running' || stage?.status === 'queued')
        return 'working';
    return 'neutral';
}
function liveTaskMatchesArtifact(artifact, kinds) {
    return taskQueue.list().some((task) => Boolean(['queued', 'running'].includes(String(task.state))
        && (!task.chatKey || task.chatKey === artifact.chatKey)
        && (!task.messageKey || task.messageKey === artifact.messageKey)
        && kinds.includes(String(task.kind))));
}
function effectiveStageBusy(artifact, stage) {
    const status = artifact.stages[stage]?.status;
    if (!['queued', 'running'].includes(status ?? 'idle'))
        return false;
    if (stage === 'summary')
        return liveTaskMatchesArtifact(artifact, ['smallSummary', 'largeSummary']);
    if (stage === 'sync')
        return liveTaskMatchesArtifact(artifact, ['sync']);
    return true;
}
function displayStage(artifact, stage) {
    const value = artifact.stages[stage];
    if (!['queued', 'running'].includes(value?.status ?? 'idle') || effectiveStageBusy(artifact, stage))
        return value;
    return {
        ...value,
        status: 'failed',
        error: value?.error || '任务已结束但界面状态未收尾，可重新提交',
    };
}
function findMessageElement(index) {
    return document.querySelector(`.mes[mesid="${index}"], .mes[data-message-id="${index}"], #chat .mes:nth-of-type(${index + 1})`);
}
/** 按钮始终渲染；这里只决定能否点击，避免失败前完全找不到对应操作。 */
function messageStageAvailability(index, artifact) {
    const settings = getSettings();
    const latestText = index === latestAssistantIndex();
    const latestSnapshot = index === latestSnapshotArtifact()?.index;
    const notBusy = (stage) => !effectiveStageBusy(artifact, stage);
    return {
        audit: Boolean(settings.enabled && settings.hostControl.enabled && latestText && settings.auditEnabled && settings.auditPrompt.trim() && notBusy('audit')),
        revision: Boolean(settings.enabled && latestText && artifact.audit && !artifact.audit.passed && artifact.audit.decision !== 'block' && notBusy('revision')),
        state: Boolean(settings.enabled && latestText && (!settings.hostControl.enabled || !settings.auditEnabled || artifact.audit?.passed) && notBusy('state')),
        small: Boolean(settings.enabled && latestSnapshot && artifact.stages.state.status === 'success' && notBusy('summary')),
        large: Boolean(settings.enabled && latestSnapshot && artifact.stages.state.status === 'success' && notBusy('summary')),
        sync: Boolean(settings.enabled && latestSnapshot && artifact.stages.state.status === 'success' && notBusy('sync')),
    };
}
const pendingRetryIndexes = new Set();
const expandedPanelIndexes = new Set();
function flowStageHtml(order, label, stage) {
    const status = stageLabel(stage);
    const symbol = stage?.status === 'success' || stage?.status === 'skipped'
        ? '✓'
        : stage?.status === 'failed' || stage?.status === 'blocked'
            ? '!'
            : stage?.status === 'running' || stage?.status === 'queued'
                ? '…'
                : String(order);
    return `<span class="ma11-flow-stage ${tone(stage)}"><em>${symbol}</em><span><small>${label}</small><b>${status}</b></span></span>`;
}
function panelHtml(index, artifact) {
    const rows = snapshotRowCount(artifact.snapshot, getSettings().tableRegistry, true);
    const error = Object.values(artifact.stages).find((stage) => stage.error)?.error;
    const retrying = pendingRetryIndexes.has(index);
    const latestText = index === latestAssistantIndex();
    const latestSnapshot = index === latestSnapshotArtifact()?.index;
    const available = messageStageAvailability(index, artifact);
    const enabled = (action) => !retrying && available[action] ? '' : 'disabled';
    const expanded = expandedPanelIndexes.has(index);
    const displayStages = {
        audit: displayStage(artifact, 'audit'),
        revision: displayStage(artifact, 'revision'),
        state: displayStage(artifact, 'state'),
        summary: displayStage(artifact, 'summary'),
        sync: displayStage(artifact, 'sync'),
    };
    const stages = [displayStages.audit, displayStages.revision, displayStages.state, displayStages.summary, displayStages.sync];
    const chainBusy = Object.keys(displayStages).some((stage) => effectiveStageBusy(artifact, stage));
    const chainFailed = stages.some((stage) => ['failed', 'blocked'].includes(stage.status));
    const completedStages = stages.filter((stage) => ['success', 'skipped'].includes(stage.status)).length;
    const chainComplete = artifact.stages.state.status === 'success'
        && ['success', 'skipped'].includes(artifact.stages.summary.status)
        && ['success', 'skipped'].includes(artifact.stages.sync.status);
    const chainState = chainBusy ? '处理中' : chainFailed ? '需处理' : chainComplete ? '已完成' : '待继续';
    return `
    <div class="ma11-message-panel ${expanded ? 'is-open' : 'is-collapsed'}" data-ma-index="${index}">
      <div class="ma11-message-bar ${chainFailed ? 'danger' : chainBusy ? 'working' : chainComplete ? 'success' : 'neutral'}">
        <span class="ma11-message-state-dot" aria-hidden="true"></span>
        <button class="ma11-message-open" type="button" data-ma-action="toggle-inline" aria-expanded="${expanded}" aria-controls="ma11-message-detail-${index}">
          <b>镜渊</b><span>${chainState}</span><i aria-hidden="true">⌄</i>
        </button>
        <span class="ma11-message-count">${rows} 对象</span>
        <button class="ma11-message-open-workspace" type="button" data-ma-action="open">工作区</button>
      </div>
      <div class="ma11-message-detail" id="ma11-message-detail-${index}" ${expanded ? '' : 'hidden'}>
        <div class="ma11-message-progress-head"><span>处理进度</span><b>${completedStages}/5</b></div>
        <div class="ma11-flow" aria-label="审核到世界书的处理进度">
          ${flowStageHtml(1, '审核', displayStages.audit)}
          ${flowStageHtml(2, '修正', displayStages.revision)}
          ${flowStageHtml(3, '表格', displayStages.state)}
          ${flowStageHtml(4, '总结', displayStages.summary)}
          ${flowStageHtml(5, '世界书', displayStages.sync)}
        </div>
        ${artifact.audit && !artifact.audit.passed ? `<div class="ma11-message-error">${escapeHtml(artifact.audit.reason)}</div>` : error ? `<div class="ma11-message-error">${escapeHtml(error)}</div>` : ''}
        ${latestText ? `<div class="ma11-message-primary-actions">
          <button class="ma11-primary-action" data-ma-auto-continue ${retrying || chainBusy || chainComplete ? 'disabled' : ''}>${chainBusy ? '处理中' : chainComplete ? '流程已完成' : '继续自动流程'}</button>
          <button data-ma-action="open">打开工作区</button>
        </div>
        <div class="ma11-message-tools" aria-label="单阶段排错">
          <div class="ma11-message-tools-title"><b>单阶段处理</b><small>仅在自动流程未能完成时使用</small></div>
          <div class="ma11-message-actions ma11-message-stage-actions" aria-label="镜渊分阶段操作">
            <button data-ma-stage-action="audit" ${enabled('audit')}>仅审核</button>
            <button data-ma-stage-action="revision" ${enabled('revision')}>仅修正</button>
            <button data-ma-stage-action="state" ${enabled('state')}>仅生成表格</button>
            <button data-ma-stage-action="small" ${enabled('small')}>立即小总结</button>
            <button data-ma-stage-action="large" ${enabled('large')}>立即大总结</button>
            <button data-ma-stage-action="sync" ${enabled('sync')}>立即同步</button>
          </div>
        </div>` : '<div class="ma11-message-actions"><button data-ma-action="open">打开工作区</button></div>'}
        <div class="ma11-message-actions ma11-message-retries">
          ${retrying ? '<button disabled>处理中…</button>' : ''}
          ${!retrying && latestText && artifact.stages.audit.status === 'failed' ? '<button data-ma-retry="audit">重试审核</button>' : ''}
          ${!retrying && latestText && ['failed', 'blocked'].includes(artifact.stages.revision?.status ?? 'idle') ? '<button data-ma-retry="revision">重试定向修正</button>' : ''}
          ${!retrying && latestText && artifact.stages.state.status === 'failed' ? '<button data-ma-retry="state">重试表格</button>' : ''}
          ${!retrying && latestSnapshot && artifact.stages.summary.status === 'failed' ? '<button data-ma-retry="summary">重试总结</button>' : ''}
          ${!retrying && latestSnapshot && artifact.stages.sync.status === 'failed' ? '<button data-ma-retry="sync">重试同步</button>' : ''}
        </div>
      </div>
    </div>`;
}
function renderMessagePanel(index) {
    const messageElement = findMessageElement(index);
    if (!messageElement)
        return;
    const settings = getSettings();
    const artifact = getArtifactAt(index);
    applyAuditVisibility(index, Boolean(settings.enabled && artifact?.hiddenByAudit), Boolean(settings.enabled && artifact?.audit && !artifact.audit.passed && !artifact.hiddenByAudit));
    messageElement.querySelector(':scope > .ma11-message-panel')?.remove();
    if (!settings.showMessagePanel)
        return;
    if (!artifact)
        return;
    messageElement.insertAdjacentHTML('beforeend', panelHtml(index, artifact));
}
function renderAllMessagePanels() {
    getChat().forEach((message, index) => {
        if (!message?.is_user)
            renderMessagePanel(index);
    });
}
let installed = false;
function installMessagePanelHandlers() {
    if (installed)
        return () => undefined;
    installed = true;
    const click = (event) => {
        const target = event.target;
        const panel = target.closest('.ma11-message-panel');
        if (!panel)
            return;
        const index = Number(panel.dataset.maIndex);
        if (target.closest('[data-ma-action="toggle-inline"]')) {
            if (expandedPanelIndexes.has(index))
                expandedPanelIndexes.delete(index);
            else
                expandedPanelIndexes.add(index);
            renderMessagePanel(index);
            return;
        }
        if (target.closest('[data-ma-action="open"]')) {
            openWorkspace('overview', index);
            return;
        }
        if (target.closest('[data-ma-auto-continue]')) {
            if (pendingRetryIndexes.has(index))
                return;
            pendingRetryIndexes.add(index);
            renderMessagePanel(index);
            toast('info', '正在从第一个失效阶段继续处理');
            void processMessage(index, false).catch((error) => {
                toast('error', toErrorMessage(error));
            }).finally(() => {
                pendingRetryIndexes.delete(index);
                renderMessagePanel(index);
            });
            return;
        }
        const stageAction = target.closest('[data-ma-stage-action]')?.dataset.maStageAction;
        if (stageAction) {
            if (pendingRetryIndexes.has(index))
                return;
            pendingRetryIndexes.add(index);
            renderMessagePanel(index);
            toast('info', '已提交阶段任务，请稍候');
            const task = stageAction === 'small' || stageAction === 'large'
                ? forceSummary(index, stageAction)
                : retryStage(index, stageAction);
            void task.catch((error) => {
                toast('error', toErrorMessage(error));
            }).finally(() => {
                pendingRetryIndexes.delete(index);
                renderMessagePanel(index);
            });
            return;
        }
        const retry = target.closest('[data-ma-retry]')?.dataset.maRetry;
        if (retry) {
            if (pendingRetryIndexes.has(index))
                return;
            pendingRetryIndexes.add(index);
            renderMessagePanel(index);
            toast('info', '已提交重试，请稍候');
            void retryStage(index, retry).catch((error) => {
                toast('error', toErrorMessage(error));
            }).finally(() => {
                pendingRetryIndexes.delete(index);
                renderMessagePanel(index);
            });
        }
    };
    document.addEventListener('click', click);
    const unsubscribe = subscribePipeline((index) => renderMessagePanel(index));
    return () => {
        installed = false;
        pendingRetryIndexes.clear();
        expandedPanelIndexes.clear();
        document.removeEventListener('click', click);
        unsubscribe();
    };
}

}
};
__defs["ui/settings-panel.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"DISPLAY_NAME",{enumerable:true,configurable:true,get:()=>__require("constants.js")["DISPLAY_NAME"]});
Object.defineProperty(__scope,"VERSION",{enumerable:true,configurable:true,get:()=>__require("constants.js")["VERSION"]});
Object.defineProperty(__scope,"getContext",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getContext"]});
Object.defineProperty(__scope,"getSettings",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getSettings"]});
Object.defineProperty(__scope,"saveSettings",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["saveSettings"]});
Object.defineProperty(__scope,"openWorkspace",{enumerable:true,configurable:true,get:()=>__require("ui/workspace.js")["openWorkspace"]});
Object.defineProperty(__scope,"refreshWorkspace",{enumerable:true,configurable:true,get:()=>__require("ui/workspace.js")["refreshWorkspace"]});
Object.defineProperty(__scope,"renderAllMessagePanels",{enumerable:true,configurable:true,get:()=>__require("ui/message-panel.js")["renderAllMessagePanels"]});
Object.defineProperty(__scope,"abortActiveRequests",{enumerable:true,configurable:true,get:()=>__require("core/requests.js")["abortActiveRequests"]});
Object.defineProperty(__scope,"setRequestAcceptance",{enumerable:true,configurable:true,get:()=>__require("core/requests.js")["setRequestAcceptance"]});
Object.defineProperty(__scope,"taskQueue",{enumerable:true,configurable:true,get:()=>__require("pipeline/task-queue.js")["taskQueue"]});
with(__scope){
Object.defineProperty(exports,"mountSettingsPanel",{enumerable:true,configurable:true,get:()=>mountSettingsPanel});
Object.defineProperty(exports,"mountOptionalTopButton",{enumerable:true,configurable:true,get:()=>mountOptionalTopButton});
/**
 * 模块职责：挂载 SillyTavern 设置入口和顶部工作区按钮。
 * 维护边界：打开或切换 UI 本身不得触发模型请求。
 */
function extensionPathFromUrl() {
    const url = new URL(globalThis.__MirrorAbyssEntryUrl);
    const marker = '/scripts/extensions/';
    const index = url.pathname.indexOf(marker);
    if (index < 0)
        return 'third-party/mirror-abyss-plugin';
    const remainder = url.pathname.slice(index + marker.length);
    const parts = remainder.split('/').filter(Boolean);
    if (parts[0] === 'third-party' && parts[1])
        return `third-party/${parts[1]}`;
    return parts[0] || 'third-party/mirror-abyss-plugin';
}
async function waitForElement(selector, timeoutMs = 15000) {
    const immediate = document.querySelector(selector);
    if (immediate)
        return immediate;
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
            observer.disconnect();
            reject(new Error(`未找到界面挂载点：${selector}`));
        }, timeoutMs);
        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            if (element) {
                window.clearTimeout(timer);
                observer.disconnect();
                resolve(element);
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    });
}
async function mountSettingsPanel(isCurrent = () => true) {
    if (document.querySelector('#ma11-settings-root'))
        return;
    const context = getContext();
    const host = await waitForElement('#extensions_settings2');
    if (!isCurrent())
        return;
    const html = await context.renderExtensionTemplateAsync(extensionPathFromUrl(), 'settings', {
        title: DISPLAY_NAME,
        version: VERSION,
    });
    if (!isCurrent() || document.querySelector('#ma11-settings-root'))
        return;
    host.insertAdjacentHTML('beforeend', html);
    const root = document.querySelector('#ma11-settings-root');
    if (!root)
        throw new Error('设置模板加载后未找到根节点');
    root.querySelector('[data-ma11-quick-setting="enabled"]').checked = getSettings().enabled;
    root.querySelector('[data-ma11-action="open"]')?.addEventListener('click', () => openWorkspace('overview'));
    root.querySelector('[data-ma11-action="diagnostics"]')?.addEventListener('click', () => openWorkspace('diagnostics'));
    root.querySelector('[data-ma11-quick-setting="enabled"]')?.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        getSettings().enabled = enabled;
        setRequestAcceptance(enabled);
        taskQueue.setAccepting(enabled);
        if (!enabled)
            abortActiveRequests();
        saveSettings();
        const workspaceToggle = document.querySelector('[data-ma11-setting="enabled"]');
        if (workspaceToggle)
            workspaceToggle.checked = enabled;
        renderAllMessagePanels();
        refreshWorkspace();
    });
}
function mountOptionalTopButton() {
    const settings = getSettings();
    document.querySelector('#ma11-top-button')?.remove();
    if (!settings.showTopButton)
        return;
    const candidates = ['#top-settings-holder', '#rightNavHolder', '#top-bar', '#top-bar-left'];
    const host = candidates.map((selector) => document.querySelector(selector)).find(Boolean);
    if (!host)
        return;
    const button = document.createElement('button');
    button.id = 'ma11-top-button';
    button.className = 'menu_button ma11-top-button fa-solid fa-table-list';
    button.type = 'button';
    button.title = '打开镜渊';
    button.setAttribute('aria-label', '打开镜渊');
    button.addEventListener('click', () => openWorkspace('overview'));
    host.appendChild(button);
}

}
};
__defs["ui/workspace.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"VERSION",{enumerable:true,configurable:true,get:()=>__require("constants.js")["VERSION"]});
Object.defineProperty(__scope,"DEFAULT_SUMMARY_PROMPTS",{enumerable:true,configurable:true,get:()=>__require("constants.js")["DEFAULT_SUMMARY_PROMPTS"]});
Object.defineProperty(__scope,"getChat",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getChat"]});
Object.defineProperty(__scope,"currentChatKey",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["currentChatKey"]});
Object.defineProperty(__scope,"getMessage",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getMessage"]});
Object.defineProperty(__scope,"getSettings",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["getSettings"]});
Object.defineProperty(__scope,"latestAssistantIndex",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["latestAssistantIndex"]});
Object.defineProperty(__scope,"saveSettings",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["saveSettings"]});
Object.defineProperty(__scope,"toast",{enumerable:true,configurable:true,get:()=>__require("core/context.js")["toast"]});
Object.defineProperty(__scope,"assertArtifactCommitCurrent",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["assertArtifactCommitCurrent"]});
Object.defineProperty(__scope,"persistChatFor",{enumerable:true,configurable:true,get:()=>__require("core/commit-guard.js")["persistChatFor"]});
Object.defineProperty(__scope,"escapeHtml",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["escapeHtml"]});
Object.defineProperty(__scope,"safeText",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["safeText"]});
Object.defineProperty(__scope,"toErrorMessage",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["toErrorMessage"]});
Object.defineProperty(__scope,"attachArtifactToMessage",{enumerable:true,configurable:true,get:()=>__require("domain/artifact.js")["attachArtifactToMessage"]});
Object.defineProperty(__scope,"canonicalObjectTitle",{enumerable:true,configurable:true,get:()=>__require("domain/object-identity.js")["canonicalObjectTitle"]});
Object.defineProperty(__scope,"buildEventProfiles",{enumerable:true,configurable:true,get:()=>__require("domain/event-profile.js")["buildEventProfiles"]});
Object.defineProperty(__scope,"deleteRow",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["deleteRow"]});
Object.defineProperty(__scope,"moveManualRow",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["moveManualRow"]});
Object.defineProperty(__scope,"snapshotRowCount",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["snapshotRowCount"]});
Object.defineProperty(__scope,"upsertManualRow",{enumerable:true,configurable:true,get:()=>__require("domain/snapshot.js")["upsertManualRow"]});
Object.defineProperty(__scope,"visibleStateRows",{enumerable:true,configurable:true,get:()=>__require("domain/entry-lifecycle.js")["visibleStateRows"]});
Object.defineProperty(__scope,"createCustomTable",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["createCustomTable"]});
Object.defineProperty(__scope,"customFieldText",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["customFieldText"]});
Object.defineProperty(__scope,"customizedFieldLabel",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["customizedFieldLabel"]});
Object.defineProperty(__scope,"editableHeaderText",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["editableHeaderText"]});
Object.defineProperty(__scope,"enabledTables",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["enabledTables"]});
Object.defineProperty(__scope,"moveTableDefinition",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["moveTableDefinition"]});
Object.defineProperty(__scope,"exportTableRegistryTemplate",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["exportTableRegistryTemplate"]});
Object.defineProperty(__scope,"normalizeImportedTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeImportedTableRegistry"]});
Object.defineProperty(__scope,"normalizeTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["normalizeTableRegistry"]});
Object.defineProperty(__scope,"removeTableDefinition",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["removeTableDefinition"]});
Object.defineProperty(__scope,"restoreDefaultTableRegistry",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["restoreDefaultTableRegistry"]});
Object.defineProperty(__scope,"tableColumnHeaders",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["tableColumnHeaders"]});
Object.defineProperty(__scope,"tableByKey",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["tableByKey"]});
Object.defineProperty(__scope,"updateTableDefinition",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["updateTableDefinition"]});
Object.defineProperty(__scope,"updateTableFields",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["updateTableFields"]});
Object.defineProperty(__scope,"updateTableHeaders",{enumerable:true,configurable:true,get:()=>__require("domain/table-registry.js")["updateTableHeaders"]});
Object.defineProperty(__scope,"createTableLinkRule",{enumerable:true,configurable:true,get:()=>__require("domain/table-link-rules.js")["createTableLinkRule"]});
Object.defineProperty(__scope,"normalizeTableLinkRules",{enumerable:true,configurable:true,get:()=>__require("domain/table-link-rules.js")["normalizeTableLinkRules"]});
Object.defineProperty(__scope,"removeTableLinkRule",{enumerable:true,configurable:true,get:()=>__require("domain/table-link-rules.js")["removeTableLinkRule"]});
Object.defineProperty(__scope,"restoreDefaultTableLinkRules",{enumerable:true,configurable:true,get:()=>__require("domain/table-link-rules.js")["restoreDefaultTableLinkRules"]});
Object.defineProperty(__scope,"updateTableLinkRule",{enumerable:true,configurable:true,get:()=>__require("domain/table-link-rules.js")["updateTableLinkRule"]});
Object.defineProperty(__scope,"buildRelationshipGraph",{enumerable:true,configurable:true,get:()=>__require("domain/graph.js")["buildRelationshipGraph"]});
Object.defineProperty(__scope,"enrichRelationshipGraphWithEventProfiles",{enumerable:true,configurable:true,get:()=>__require("domain/graph.js")["enrichRelationshipGraphWithEventProfiles"]});
Object.defineProperty(__scope,"listSupportedConnectionProfiles",{enumerable:true,configurable:true,get:()=>__require("llm/generator.js")["listSupportedConnectionProfiles"]});
Object.defineProperty(__scope,"testConnection",{enumerable:true,configurable:true,get:()=>__require("llm/generator.js")["testConnection"]});
Object.defineProperty(__scope,"applyLorebookMaintenance",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["applyLorebookMaintenance"]});
Object.defineProperty(__scope,"beginPlayRecording",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["beginPlayRecording"]});
Object.defineProperty(__scope,"forceSummary",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["forceSummary"]});
Object.defineProperty(__scope,"getArtifactAt",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["getArtifactAt"]});
Object.defineProperty(__scope,"latestArtifact",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["latestArtifact"]});
Object.defineProperty(__scope,"latestSnapshotArtifact",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["latestSnapshotArtifact"]});
Object.defineProperty(__scope,"previewLorebookMaintenance",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["previewLorebookMaintenance"]});
Object.defineProperty(__scope,"processMessage",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["processMessage"]});
Object.defineProperty(__scope,"recalculateInvalidatedHistory",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["recalculateInvalidatedHistory"]});
Object.defineProperty(__scope,"resetCurrentGame",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["resetCurrentGame"]});
Object.defineProperty(__scope,"restoreSuppressedLorebookEntry",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["restoreSuppressedLorebookEntry"]});
Object.defineProperty(__scope,"chooseHistoryRecalculationStart",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["chooseHistoryRecalculationStart"]});
Object.defineProperty(__scope,"retryStage",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["retryStage"]});
Object.defineProperty(__scope,"subscribePipeline",{enumerable:true,configurable:true,get:()=>__require("pipeline/pipeline.js")["subscribePipeline"]});
Object.defineProperty(__scope,"taskQueue",{enumerable:true,configurable:true,get:()=>__require("pipeline/task-queue.js")["taskQueue"]});
Object.defineProperty(__scope,"pendingSmallSummaries",{enumerable:true,configurable:true,get:()=>__require("pipeline/summary.js")["pendingSmallSummaries"]});
Object.defineProperty(__scope,"largeSummarySystemPrompt",{enumerable:true,configurable:true,get:()=>__require("prompts/summary.js")["largeSummarySystemPrompt"]});
Object.defineProperty(__scope,"smallSummarySystemPrompt",{enumerable:true,configurable:true,get:()=>__require("prompts/summary.js")["smallSummarySystemPrompt"]});
Object.defineProperty(__scope,"stateSystemPrompt",{enumerable:true,configurable:true,get:()=>__require("prompts/state.js")["stateSystemPrompt"]});
Object.defineProperty(__scope,"auditSystemPrompt",{enumerable:true,configurable:true,get:()=>__require("prompts/audit.js")["auditSystemPrompt"]});
Object.defineProperty(__scope,"revisionSystemPrompt",{enumerable:true,configurable:true,get:()=>__require("prompts/revision.js")["revisionSystemPrompt"]});
Object.defineProperty(__scope,"getChatState",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["getChatState"]});
Object.defineProperty(__scope,"putArtifact",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["putArtifact"]});
Object.defineProperty(__scope,"putChatState",{enumerable:true,configurable:true,get:()=>__require("storage/repository.js")["putChatState"]});
Object.defineProperty(__scope,"diagnosticReport",{enumerable:true,configurable:true,get:()=>__require("ui/diagnostics.js")["diagnosticReport"]});
Object.defineProperty(__scope,"runDiagnostics",{enumerable:true,configurable:true,get:()=>__require("ui/diagnostics.js")["runDiagnostics"]});
Object.defineProperty(__scope,"renderAllMessagePanels",{enumerable:true,configurable:true,get:()=>__require("ui/message-panel.js")["renderAllMessagePanels"]});
Object.defineProperty(__scope,"abortActiveRequests",{enumerable:true,configurable:true,get:()=>__require("core/requests.js")["abortActiveRequests"]});
Object.defineProperty(__scope,"setRequestAcceptance",{enumerable:true,configurable:true,get:()=>__require("core/requests.js")["setRequestAcceptance"]});
Object.defineProperty(__scope,"readHistoryWorkflow",{enumerable:true,configurable:true,get:()=>__require("workflow/history-workflow.js")["readHistoryWorkflow"]});
Object.defineProperty(__scope,"recordingStartIndex",{enumerable:true,configurable:true,get:()=>__require("domain/recording-boundary.js")["recordingStartIndex"]});
Object.defineProperty(__scope,"suppressedLorebookEntries",{enumerable:true,configurable:true,get:()=>__require("domain/publication-control.js")["suppressedLorebookEntries"]});
with(__scope){
Object.defineProperty(exports,"resolveWorkspaceStageCommand",{enumerable:true,configurable:true,get:()=>resolveWorkspaceStageCommand});
Object.defineProperty(exports,"workspacePipelineBusy",{enumerable:true,configurable:true,get:()=>workspacePipelineBusy});
Object.defineProperty(exports,"resolveWorkspaceMessageSelection",{enumerable:true,configurable:true,get:()=>resolveWorkspaceMessageSelection});
Object.defineProperty(exports,"openWorkspace",{enumerable:true,configurable:true,get:()=>openWorkspace});
Object.defineProperty(exports,"closeWorkspace",{enumerable:true,configurable:true,get:()=>closeWorkspace});
Object.defineProperty(exports,"resetWorkspaceContext",{enumerable:true,configurable:true,get:()=>resetWorkspaceContext});
Object.defineProperty(exports,"disposeWorkspace",{enumerable:true,configurable:true,get:()=>disposeWorkspace});
Object.defineProperty(exports,"refreshWorkspace",{enumerable:true,configurable:true,get:()=>refreshWorkspace});
/**
 * 模块职责：镜渊完整工作区：总览、动态表格、图谱、总结、审核、同步、设置与诊断。
 * 维护边界：人工表格编辑必须保存 source=manual/locked 语义；UI 操作通过 pipeline 公开函数执行。
 */
let selectedMessageIndex = null;
let rendering = false;
let renderAgain = false;
let queueUnsubscribe = null;
let pipelineUnsubscribe = null;
let workspaceRenderScheduled = false;
let workspaceRenderDeferred = false;
let selectedGraphNodeId = null;
let editorChatKey = null;
let editorMessageKey = null;
let savingRow = false;
let workspacePipelineActionPending = false;
let workspaceViewportBound = false;
let tableSearchQuery = "";
let graphSearchQuery = "";
let diagnosticPromptKind = "state";
function updateWorkspaceViewportHeight() {
    const height = Math.max(320, Math.round(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight));
    document.documentElement.style.setProperty("--ma11-viewport-height", `${height}px`);
}
function lockWorkspaceViewport() {
    document.documentElement.classList.add("ma11-workspace-open");
    document.body.classList.add("ma11-workspace-open");
    updateWorkspaceViewportHeight();
    if (workspaceViewportBound)
        return;
    workspaceViewportBound = true;
    window.addEventListener("resize", updateWorkspaceViewportHeight, { passive: true });
    window.visualViewport?.addEventListener("resize", updateWorkspaceViewportHeight, { passive: true });
}
function unlockWorkspaceViewport() {
    document.documentElement.classList.remove("ma11-workspace-open");
    document.body.classList.remove("ma11-workspace-open");
    if (!workspaceViewportBound)
        return;
    workspaceViewportBound = false;
    window.removeEventListener("resize", updateWorkspaceViewportHeight);
    window.visualViewport?.removeEventListener("resize", updateWorkspaceViewportHeight);
    document.documentElement.style.removeProperty("--ma11-viewport-height");
}
/** 单一映射同时供按钮渲染测试和点击处理使用，避免 UI 文案存在但后端动作接错。 */
function resolveWorkspaceStageCommand(action) {
    const commands = {
        'run-audit': { kind: 'retry', stage: 'audit' },
        'run-revision': { kind: 'retry', stage: 'revision' },
        'run-state': { kind: 'retry', stage: 'state' },
        'force-small': { kind: 'summary', summary: 'small' },
        'force-large': { kind: 'summary', summary: 'large' },
    };
    return commands[action] ?? null;
}
function clampGraphZoom(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric))
        return 1;
    return Math.min(2.5, Math.max(0.5, Math.round(numeric * 20) / 20));
}
function ensureWorkspaceSubscriptions() {
    queueUnsubscribe ||= taskQueue.subscribe(handleQueueChange);
    pipelineUnsubscribe ||= subscribePipeline(() => handlePipelineChange());
}
const WORKSPACE_NAVIGATION = [
    { key: "overview", label: "总览", icon: "fa-gauge-high", description: "流程状态、最近任务与快捷操作" },
    { key: "tables", label: "表格", icon: "fa-table-cells-large", description: "查看当前提取模板生成的记忆表格" },
    { key: "tableManager", label: "模板", icon: "fa-sliders", description: "表头提示词、联动规则与模板导入导出" },
    { key: "summaries", label: "总结", icon: "fa-layer-group", description: "查看小总结与大总结" },
    { key: "graph", label: "记忆网络", icon: "fa-diagram-project", description: "融合事件画像与对象关系图谱" },
    { key: "audit", label: "审核", icon: "fa-shield-halved", description: "审核规则、修正策略与结果" },
    { key: "sync", label: "世界书", icon: "fa-book-atlas", description: "发布、清理与召回设置" },
    { key: "settings", label: "设置", icon: "fa-gears", description: "连接分配、自动化与维护" },
    { key: "diagnostics", label: "诊断", icon: "fa-stethoscope", description: "检查入口、模型、存储与同步" },
];
function workspaceTabMeta(tab) {
    const key = String(tab || "overview");
    const item = WORKSPACE_NAVIGATION.find((candidate) => candidate.key === key);
    if (item)
        return { key: item.key, label: item.label, description: item.description };
    return { key: "overview", label: "总览", description: "流程状态、最近任务与快捷操作" };
}
function workspaceNavigationHtml() {
    return WORKSPACE_NAVIGATION.map((item) => `
    <button type="button" role="tab" aria-selected="false" aria-controls="ma11-workspace-content" data-ma11-tab="${item.key}" title="${item.description}">
      <i class="ma11-nav-icon fa-solid ${item.icon}" aria-hidden="true"></i>
      <span>${item.label}</span>
    </button>`).join("");
}
function scrollActiveWorkspaceTabIntoView(workspace, key) {
    const tabs = workspace.querySelector("[data-ma11-scroll-tabs]");
    const active = workspace.querySelector(`[role="tab"][data-ma11-tab="${key}"]`);
    if (!tabs || !active)
        return;
    active.scrollIntoView({ block: "nearest", inline: "nearest" });
    window.requestAnimationFrame(() => {
        if (!tabs.isConnected || !active.isConnected)
            return;
        // Chromium 在小数 CSS 像素下可能仍把末端标签裁掉不足 1px；按最终布局边界留出 8px。
        const tabRect = tabs.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        if (activeRect.right > tabRect.right - 8)
            tabs.scrollLeft += activeRect.right - tabRect.right + 8;
        if (activeRect.left < tabRect.left + 8)
            tabs.scrollLeft -= tabRect.left - activeRect.left + 8;
    });
}
function root() {
    let element = document.querySelector("#ma11-workspace");
    if (element) {
        ensureWorkspaceSubscriptions();
        return element;
    }
    document.body.insertAdjacentHTML("beforeend", `
    <div id="ma11-workspace" class="ma11-workspace" hidden>
      <div class="ma11-shell" role="dialog" aria-modal="true" aria-label="镜渊控制中心">
        <section class="ma11-main">
          <header class="ma11-header">
            <div class="ma11-header-brand">
              <div class="ma11-brand-mark" aria-hidden="true">渊</div>
              <div class="ma11-header-brand-copy">
                <div class="ma11-brand">镜渊</div>
                <div class="ma11-subtitle">长期结构化记忆</div>
              </div>
            </div>
            <div class="ma11-header-actions">
              <span class="ma11-chat-status"><span aria-hidden="true"></span>当前聊天</span>
              <span class="ma11-version">${VERSION}</span>
              <button class="ma11-icon-button" type="button" data-ma11-action="close" aria-label="关闭镜渊">×</button>
            </div>
          </header>
          <nav class="ma11-tabs" role="tablist" aria-label="镜渊功能" data-ma11-scroll-tabs>${workspaceNavigationHtml()}</nav>
          <main id="ma11-workspace-content" class="ma11-content" role="tabpanel"></main>
          <div class="ma11-live-region" role="status" aria-live="polite" aria-atomic="true" data-ma11-live></div>
        </section>
      </div>
      <div class="ma11-editor-backdrop" hidden>
        <form class="ma11-editor" id="ma11-row-editor">
          <header><b>编辑对象条目</b><button type="button" data-ma11-action="close-editor">×</button></header>
          <input type="hidden" name="tableKey" />
          <input type="hidden" name="rowId" />
          <label>归属表格<select name="targetTableKey" aria-label="条目归属表格"></select><small>按对象本质选择；修改后会保留稳定 ID 并移动到目标表格。</small></label>
          <label><span data-ma11-row-field-label="title">对象</span><input name="title" required maxlength="240" /></label>
          <label><span data-ma11-row-field-label="content">当前事实</span><textarea name="content" rows="6" maxlength="12000"></textarea></label>
          <label><span data-ma11-row-field-label="status">状态</span><input name="status" maxlength="120" /></label>
          <label><span data-ma11-row-field-label="keywords">关键词（逗号分隔）</span><input name="keywords" maxlength="800" /></label>
          <label class="ma11-switch"><input type="checkbox" name="locked" /><span>完全锁定（基础和状态均不自动修改）</span></label>
          <p class="ma11-help">普通人工条目默认只保护基础内容；当前状态、关系和能力仍可依据明确事实更新。</p>
          <fieldset class="ma11-object-editor">
            <legend>对象分层内容</legend>
            <label>基础内容<textarea name="baseContent" rows="4" maxlength="12000" placeholder="稳定定义；后续总结不得改写"></textarea></label>
            <label>已固化历史（每行一项）<textarea name="solidifiedHistory" rows="3" maxlength="8000"></textarea></label>
            <label>当前状态（每行一项）<textarea name="currentStates" rows="4" maxlength="8000"></textarea></label>
            <label>关联对象（每行一项）<textarea name="relatedObjects" rows="3" maxlength="4000"></textarea></label>
            <label>关联事件（每行一项）<textarea name="relatedEvents" rows="3" maxlength="4000"></textarea></label>
          </fieldset>
          <fieldset class="ma11-character-object-editor" data-ma11-character-object-fields hidden>
            <legend>角色可变信息</legend>
            <label>关系状态（每行一项）<textarea name="relationshipStates" rows="3" maxlength="6000"></textarea></label>
            <label>能力状态（每行一项）<textarea name="abilityStates" rows="3" maxlength="6000"></textarea></label>
          </fieldset>
          <fieldset class="ma11-lifecycle-editor" data-ma11-lifecycle-fields hidden>
            <legend>人物生命周期</legend>
            <div class="ma11-editor-grid">
              <label>存在状态<select name="existence">
                ${["存活", "死亡已确认", "存在未知", "失踪", "身份存疑", "虚构或误认已确认", "存在被抹除", "未标注"].map((value) => `<option value="${value}">${value}</option>`).join("")}
              </select></label>
              <label>活跃状态<select name="activity">
                ${["当前在场", "当前相关", "离场但仍活跃", "休眠", "长期休眠", "已归档", "未标注"].map((value) => `<option value="${value}">${value}</option>`).join("")}
              </select></label>
              <label>记忆状态<select name="memory">
                ${["广泛记得", "部分人物记得", "仅记录留存", "仅痕迹留存", "无人可确认记得", "记忆被篡改", "记忆被抹除", "未标注"].map((value) => `<option value="${value}">${value}</option>`).join("")}
              </select></label>
              <label>证据等级<select name="evidenceLevel">
                ${["已确认", "可靠记录", "多方陈述", "单方陈述", "推测", "未知"].map((value) => `<option value="${value}">${value}</option>`).join("")}
              </select></label>
            </div>
            <label>判断依据<textarea name="evidence" rows="3" maxlength="4000"></textarea></label>
            <label>可能回流条件（每行一项）<textarea name="returnConditions" rows="3" maxlength="3000"></textarea></label>
            <label>阻止回流条件（每行一项）<textarea name="returnBlockers" rows="3" maxlength="3000"></textarea></label>
          </fieldset>
          <footer><button type="button" data-ma11-action="close-editor">取消</button><button type="submit">保存</button></footer>
        </form>
      </div>
    </div>`);
    element = document.querySelector("#ma11-workspace");
    bindWorkspace(element);
    ensureWorkspaceSubscriptions();
    return element;
}
function currentArtifact() {
    if (selectedMessageIndex !== null) {
        const artifact = getArtifactAt(selectedMessageIndex);
        if (artifact)
            return { index: selectedMessageIndex, artifact };
        return null;
    }
    return latestArtifact();
}
/** 当前工作区是否已有业务链在排队或执行。工作区动作不得在该状态下重复提交。 */
function workspacePipelineBusy(artifactInfo = currentArtifact()) {
    const artifact = artifactInfo?.artifact;
    const chatKey = artifact?.chatKey || currentChatKey();
    const liveTasks = taskQueue.list().filter((task) => Boolean((task.state === "queued" || task.state === "running")
        && (!task.chatKey || task.chatKey === chatKey)
        && (!artifact || !task.messageKey || task.messageKey === artifact.messageKey)));
    const queueBusy = liveTasks.length > 0;
    const stageBusy = Boolean(artifact && Object.entries(artifact.stages).some(([stageName, stage]) => {
        if (stage.status !== "queued" && stage.status !== "running")
            return false;
        // summary/sync 的 queued/running 只代表运行时；真实队列已无对应任务时不能形成永久 UI 锁。
        if (stageName === "summary")
            return liveTasks.some((task) => ["smallSummary", "largeSummary"].includes(String(task.kind)));
        if (stageName === "sync")
            return liveTasks.some((task) => String(task.kind) === "sync");
        return true;
    }));
    return workspacePipelineActionPending || stageBusy || queueBusy;
}
function workspaceHasFocusedEditor(workspace) {
    const active = document.activeElement;
    return Boolean(workspace.contains(active) && active?.matches("input, textarea, select, [contenteditable='true']"));
}
function workspaceHasUnsavedSurface(workspace) {
    const editor = workspace.querySelector(".ma11-editor-backdrop");
    return editor?.hidden === false || getSettings().ui.activeTab === "tableManager";
}
function scheduleWorkspaceRender() {
    const workspace = document.querySelector("#ma11-workspace");
    if (!workspace || workspace.hidden)
        return;
    if (workspaceHasFocusedEditor(workspace) || workspaceHasUnsavedSurface(workspace)) {
        workspaceRenderDeferred = true;
        return;
    }
    if (workspaceRenderScheduled)
        return;
    workspaceRenderScheduled = true;
    queueMicrotask(() => {
        workspaceRenderScheduled = false;
        void renderWorkspace();
    });
}
function handlePipelineChange() {
    refreshTaskList();
    scheduleWorkspaceRender();
}
function statusText(value) {
    const map = {
        idle: "等待",
        queued: "排队",
        running: "处理中",
        success: "成功",
        failed: "失败",
        cancelled: "已取消",
        skipped: "跳过",
        blocked: "阻断",
    };
    return map[value] || value;
}
function statusClass(value) {
    if (value === "success" || value === "skipped")
        return "success";
    if (value === "failed" || value === "blocked")
        return "danger";
    if (value === "cancelled")
        return "neutral";
    if (value === "running" || value === "queued")
        return "working";
    return "neutral";
}
function workflowState(artifact) {
    if (!artifact)
        return { label: "尚未整理", detail: "生成一条 AI 正文后会自动开始", tone: "neutral", completed: 0, total: 5 };
    const stages = [artifact.stages.audit, artifact.stages.revision, artifact.stages.state, artifact.stages.summary, artifact.stages.sync];
    const failed = stages.find((stage) => ["failed", "blocked"].includes(stage.status));
    const running = stages.find((stage) => ["queued", "running"].includes(stage.status));
    const completed = stages.filter((stage) => ["success", "skipped"].includes(stage.status)).length;
    if (failed)
        return { label: "需要处理", detail: failed.error || "某个阶段未完成", tone: "danger", completed, total: 5 };
    if (running)
        return { label: "自动处理中", detail: "流程会按顺序继续", tone: "working", completed, total: 5 };
    if (artifact.stages.state.status === "success"
        && ["success", "skipped"].includes(artifact.stages.summary.status)
        && ["success", "skipped"].includes(artifact.stages.sync.status)) {
        return { label: "本轮已完成", detail: "状态、总结与世界书已更新", tone: "success", completed, total: 5 };
    }
    return { label: "等待继续", detail: "将从第一个未完成阶段继续", tone: "neutral", completed, total: 5 };
}
function stageStripHtml(artifact) {
    const stages = artifact?.stages;
    const rows = [
        ["audit", "审核"],
        ["revision", "修正"],
        ["state", "表格"],
        ["summary", "总结"],
        ["sync", "世界书"],
    ];
    return `<div class="ma11-stage-strip">${rows
        .map(([key, label]) => {
        const stage = stages?.[key] ?? { status: "idle", attempts: 0 };
        return `<div class="ma11-stage-step ${statusClass(stage.status)}" title="${stage.error ? escapeHtml(stage.error) : `${label}：${statusText(stage.status)}`}">
        <span aria-hidden="true"></span><b>${label}</b><small>${statusText(stage.status)}</small>
      </div>`;
    })
        .join("")}</div>`;
}
function stageActionButtonsHtml(artifactInfo) {
    const settings = getSettings();
    const latestIndex = latestAssistantIndex();
    const isLatestText = artifactInfo
        ? artifactInfo.index === latestIndex
        : selectedMessageIndex === null && latestIndex >= 0;
    const artifact = artifactInfo?.artifact;
    const latestSnapshot = latestSnapshotArtifact();
    const busy = workspacePipelineBusy(artifactInfo);
    const canAudit = Boolean(settings.enabled && !busy && settings.hostControl.enabled && settings.auditEnabled && settings.auditPrompt.trim() && isLatestText);
    const canRevise = Boolean(settings.enabled
        && !busy
        && isLatestText
        && artifact?.audit
        && !artifact.audit.passed
        && artifact.audit.decision !== 'block');
    const canState = Boolean(settings.enabled
        && !busy
        && isLatestText
        && (!settings.hostControl.enabled || !settings.auditEnabled || artifact?.audit?.passed));
    const canSummarize = Boolean(settings.enabled
        && !busy
        && latestSnapshot
        && artifactInfo?.artifact.messageKey === latestSnapshot.artifact.messageKey);
    return `<div class="ma11-actions ma11-stage-actions">
    <button data-ma11-action="run-audit" ${canAudit ? '' : 'disabled'}>审核正文</button>
    <button data-ma11-action="run-revision" ${canRevise ? '' : 'disabled'}>定向修正</button>
    <button data-ma11-action="run-state" ${canState ? '' : 'disabled'}>生成表格</button>
    <button data-ma11-action="force-small" ${canSummarize ? '' : 'disabled'}>小总结</button>
    <button data-ma11-action="force-large" ${canSummarize ? '' : 'disabled'}>大总结</button>
  </div>`;
}
function recentTasksHtml() {
    const chatKey = currentChatKey();
    const jobs = taskQueue.list()
        .filter((task) => !task.chatKey || task.chatKey === chatKey)
        .slice(0, 5);
    return {
        count: jobs.length,
        html: jobs.length
            ? jobs.map((task) => {
                const timing = [
                    Number.isFinite(task.queueWaitMs) ? `排队 ${task.queueWaitMs}ms` : "",
                    Number.isFinite(task.runMs) ? `执行 ${task.runMs}ms` : "",
                ].filter(Boolean).join(" · ");
                return `<div><span>${escapeHtml(task.label)}${timing ? `<small>${escapeHtml(timing)}</small>` : ""}</span><em class="${task.state}">${escapeHtml(statusText(task.state))}</em></div>`;
            }).join("")
            : '<p class="ma11-empty">暂无最近任务。</p>',
    };
}
function refreshTaskList() {
    const workspace = document.querySelector("#ma11-workspace");
    const list = workspace?.querySelector("[data-ma11-task-list]");
    const count = workspace?.querySelector("[data-ma11-task-count]");
    if (!list || !count)
        return;
    const tasks = recentTasksHtml();
    count.textContent = tasks.count ? `${tasks.count} 条最近任务` : "空闲";
    list.innerHTML = tasks.html;
}
function handleQueueChange() {
    refreshTaskList();
    scheduleWorkspaceRender();
}
function historyRecoveryHtml(chatState, busy = false) {
    const workflow = readHistoryWorkflow(chatState);
    const recovery = workflow.recovery;
    if (!recovery)
        return "";
    const pauseError = workflow.pauseError;
    const current = Number.isInteger(recovery.currentIndex) ? `第 ${recovery.currentIndex + 1} 条消息` : "当前历史";
    const progress = recovery.totalCount ? `${recovery.completedCount ?? 0}/${recovery.totalCount}` : "检查中";
    if (recovery.phase === "failed") {
        const failedDetail = `${recovery.error || "状态提取失败"}${pauseError ? `；旧世界书条目暂停失败：${pauseError}` : ""}`;
        return `<section class="ma11-card ma11-history-warning"><header><b>历史重建未完成</b><span>${escapeHtml(current)}</span></header><p>${escapeHtml(failedDetail)}</p><div class="ma11-actions"><button data-ma11-action="recalculate-history" ${busy ? "disabled" : ""}>从失败位置继续</button></div></section>`;
    }
    const labels = {
        "rebuilding-core": "正在重建核心状态",
        "rebuilding-derived": "正在恢复总结",
        "publishing-lorebook": "正在发布世界书",
        partial: "核心状态已恢复，派生恢复不完整",
    };
    const detail = pauseError
        ? `旧世界书条目暂停失败：${pauseError}`
        : recovery.phase === "partial" ? (recovery.error || "请重试未完成的派生阶段") : current;
    return `<section class="ma11-card ma11-history-warning"><header><b>${escapeHtml(labels[recovery.phase] || "正在恢复历史")}</b><span>${escapeHtml(progress)}</span></header><p>${escapeHtml(detail)}</p></section>`;
}
function extractionTemplateIsDefault() {
    const settings = getSettings();
    const registry = normalizeTableRegistry(settings.tableRegistry);
    const defaultRegistry = normalizeTableRegistry(restoreDefaultTableRegistry());
    const links = normalizeTableLinkRules(settings.tableLinkRules, registry);
    const defaultLinks = restoreDefaultTableLinkRules(defaultRegistry);
    return JSON.stringify(registry) === JSON.stringify(defaultRegistry)
        && JSON.stringify(links) === JSON.stringify(defaultLinks);
}
function summaryPromptsAreStandard() {
    return JSON.stringify(getSettings().summaryPrompts) === JSON.stringify(DEFAULT_SUMMARY_PROMPTS);
}
function setupReadinessHtml(artifact, chatState) {
    const settings = getSettings();
    const enabledCount = enabledTables(settings.tableRegistry).length;
    const checks = [
        { ok: settings.enabled, label: "插件已启用", action: "settings" },
        { ok: settings.autoState, label: "自动整理已开启", action: "settings" },
        { ok: recordingStartIndex(chatState) !== undefined, label: "游玩记录起点已设置", action: "overview" },
        { ok: enabledCount > 0, label: `${enabledCount} 个记忆视图可用`, action: "tableManager" },
        { ok: enabledCount > 0, label: extractionTemplateIsDefault() ? "默认提取模板已加载" : "自定义提取模板已加载", action: "tableManager" },
        { ok: Boolean(artifact?.snapshot), label: "当前聊天已有记忆快照", action: "tables" },
        { ok: settings.lorebookSync && !readHistoryWorkflow(chatState).blocked, label: "世界书同步可用", action: "sync" },
    ];
    const completed = checks.filter((item) => item.ok).length;
    const percent = Math.round((completed / checks.length) * 100);
    return `<section class="ma11-card ma11-readiness-card">
    <header><div><b>开箱检查</b><span>不需要理解内部协议，按未完成项处理即可</span></div><strong>${completed}/${checks.length}</strong></header>
    <div class="ma11-progress-track" aria-label="开箱检查完成度 ${percent}%"><span style="width:${percent}%"></span></div>
    <div class="ma11-readiness-grid">${checks.map((item) => `<button class="${item.ok ? "ready" : "pending"}" data-ma11-tab="${item.action}"><i class="fa-solid ${item.ok ? "fa-check" : "fa-arrow-right"}" aria-hidden="true"></i><span>${escapeHtml(item.label)}</span></button>`).join("")}</div>
  </section>`;
}
function runtimeV2OverviewHtml(chatState) {
    const runtime = chatState?.runtimeV2;
    if (!runtime)
        return '';
    const sceneMachine = runtime.machines?.scene ?? {};
    const current = sceneMachine.instances?.[sceneMachine.currentInstanceId];
    const summary = runtime.machines?.summary ?? {};
    const publication = runtime.machines?.publication ?? {};
    const pendingJobs = (runtime.outbox ?? []).filter((job) => ['pending', 'running', 'failed'].includes(job.status));
    const summaryLabel = summary.pendingKind === 'small'
        ? '小总结待执行'
        : summary.pendingKind === 'large'
            ? '大总结待执行'
            : '无总结任务';
    const sceneLabel = current
        ? [current.location, current.stage || current.title].filter(Boolean).join('｜')
        : '没有活动场景实例';
    return `<section class="ma11-card">
      <header><div><b>Runtime V2 权威状态</b><span>修订 ${escapeHtml(String(runtime.revision ?? 0))}</span></div></header>
      <dl class="ma11-meta">
        <dt>游戏时间</dt><dd>${escapeHtml(runtime.machines?.clock?.display || '未发生明确时间推进')}</dd>
        <dt>当前场景实例</dt><dd>${escapeHtml(sceneLabel)}</dd>
        <dt>当前目标</dt><dd>${escapeHtml(current?.goal || '未明确')}</dd>
        <dt>总结调度</dt><dd>${escapeHtml(summaryLabel)}</dd>
        <dt>世界书投影</dt><dd>${escapeHtml(`${publication.status || 'clean'}｜期望 ${publication.desiredRevision ?? 0} / 已确认 ${publication.confirmedRevision ?? 0}`)}</dd>
        <dt>未完成事务</dt><dd>${escapeHtml(String(pendingJobs.length))}</dd>
      </dl>
      ${publication.lastError ? `<div class="ma11-error-box">${escapeHtml(publication.lastError)}</div>` : ''}
    </section>`;
}

async function overviewHtml(artifactInfo) {
    const enabled = getSettings().enabled;
    const artifact = artifactInfo?.artifact;
    const chatState = await getChatState(currentChatKey());
    const historyWorkflow = readHistoryWorkflow(chatState);
    const playStart = recordingStartIndex(chatState);
    const rows = snapshotRowCount(artifact?.snapshot, getSettings().tableRegistry, true);
    const tasks = recentTasksHtml();
    const busy = workspacePipelineBusy(artifactInfo);
    const flow = workflowState(artifact);
    const syncText = chatState.lastSyncAt
        ? `世界书 ${new Date(chatState.lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "世界书未同步";
    return `
    <section class="ma11-card ma11-recording-card">
      <header><div><b>游玩记录边界</b><span>${playStart === undefined ? "尚未开始" : `从第 ${playStart + 1} 条消息起`}</span></div></header>
      <p>${playStart === undefined ? "起点之前的设定讨论、提示词、测试回复不会进入事实、总结或世界书。" : "镜渊只处理起点之后的正文；重设起点会清空当前聊天已有镜渊记忆和托管世界书条目。"}</p>
      <div class="ma11-actions"><button data-ma11-action="start-play-recording" ${busy ? "disabled" : ""}>${playStart === undefined ? "从下一条消息开始记录" : "重新设置记录起点"}</button></div>
    </section>
    ${historyRecoveryHtml(chatState, busy) || (historyWorkflow.invalidation ? (historyWorkflow.automatic ? `<section class="ma11-card ma11-history-warning"><header><b>最新正文正在自动恢复</b><span>世界书暂缓同步</span></header><p>检测到最新正文发生编辑或换页。镜渊会复用仍有效的审核结果，并从第一个失效阶段继续。</p></section>` : `<section class="ma11-card ma11-history-warning"><header><b>较早历史需要重算</b><span>世界书同步已暂停</span></header><p>${historyWorkflow.startIndex === undefined ? "检测到历史删除，但无法自动判断删除位置。" : `第 ${historyWorkflow.startIndex + 1} 条消息发生了${historyWorkflow.invalidation.reason === "edited" ? "编辑" : historyWorkflow.invalidation.reason === "swiped" ? "换页" : "删除"}。`}</p><div class="ma11-actions"><button data-ma11-action="recalculate-history" ${busy ? "disabled" : ""}>${historyWorkflow.startIndex === undefined ? "选择起点并重算" : "继续重建"}</button></div></section>`) : "")}
    <section class="ma11-dashboard-status ${flow.tone}">
      <div class="ma11-dashboard-status-icon" aria-hidden="true"><i class="fa-solid ${flow.tone === "success" ? "fa-check" : flow.tone === "danger" ? "fa-triangle-exclamation" : flow.tone === "working" ? "fa-spinner" : "fa-circle"}"></i></div>
      <div class="ma11-dashboard-status-copy">
        <small>当前流程</small>
        <h2>${escapeHtml(flow.label)}</h2>
        <p>${escapeHtml(flow.detail)}</p>
        <div class="ma11-dashboard-meta"><span>${artifact ? `第 ${artifact.messageIndex + 1} 条正文` : "当前聊天"}</span><span>${rows} 个对象</span><span>${escapeHtml(syncText)}</span></div>
      </div>
      <button data-ma11-action="process-latest" ${enabled && playStart !== undefined && latestAssistantIndex() >= playStart && !busy ? "" : "disabled"}>${artifact ? "重新整理" : "整理最新正文"}</button>
    </section>
    ${runtimeV2OverviewHtml(chatState)}
    ${setupReadinessHtml(artifact, chatState)}
    <section class="ma11-card ma11-progress-card">
      <header><b>处理进度</b><span>${flow.completed}/${flow.total}</span></header>
      <div class="ma11-progress-track" aria-label="处理进度 ${Math.round((flow.completed / flow.total) * 100)}%"><span style="width:${Math.round((flow.completed / flow.total) * 100)}%"></span></div>
      ${stageStripHtml(artifact)}
    </section>
    <nav class="ma11-dashboard-links" aria-label="常用功能">
      <button data-ma11-action="open-tables" ${artifact?.snapshot ? "" : "disabled"}><i class="fa-solid fa-table-cells-large" aria-hidden="true"></i><span><b>表格</b><small>查看状态表</small></span></button>
      <button data-ma11-tab="summaries" ${artifact?.snapshot ? "" : "disabled"}><i class="fa-solid fa-layer-group" aria-hidden="true"></i><span><b>总结</b><small>近期与长期</small></span></button>
      <button data-ma11-tab="sync" ${artifact?.snapshot ? "" : "disabled"}><i class="fa-solid fa-book-atlas" aria-hidden="true"></i><span><b>世界书</b><small>发布与召回</small></span></button>
    </nav>
    <section class="ma11-card ma11-task-card">
      <header><b>任务</b><span data-ma11-task-count>${tasks.count ? `${tasks.count} 条最近任务` : "当前空闲"}</span></header>
      <div class="ma11-task-list" data-ma11-task-list>${tasks.html}</div>
    </section>`;
}
function lifecycleHtml(row) {
    const life = row.lifecycle;
    if (!life)
        return "";
    const chips = [
        ["存在", life.existence],
        ["活跃", life.activity],
        ["记忆", life.memory],
        ["证据", life.evidenceLevel],
    ].map(([label, value]) => `<span class="ma11-life-chip"><small>${label}</small>${escapeHtml(value)}</span>`).join("");
    const conditions = [
        life.returnConditions.length ? `<p><b>回流：</b>${escapeHtml(life.returnConditions.join("；"))}</p>` : "",
        life.returnBlockers.length ? `<p><b>阻止：</b>${escapeHtml(life.returnBlockers.join("；"))}</p>` : "",
    ].join("");
    return `<div class="ma11-lifecycle-inline">${chips}${conditions}</div>`;
}
function rowCustomFieldsHtml(row, table) {
    if (!table || !row.fields)
        return "";
    const lines = table.fields.filter((field) => field.key in (row.fields ?? {})).map((field) => {
        const raw = row.fields?.[field.key];
        const value = Array.isArray(raw) ? raw.join("、") : String(raw ?? "");
        return value.trim() ? `<div><small>${escapeHtml(field.label)}</small>${escapeHtml(value)}</div>` : "";
    }).filter(Boolean);
    return lines.length ? `<div class="ma11-custom-fields">${lines.join("")}</div>` : "";
}
function searchableRowText(row) {
    return [
        row.title,
        row.content,
        row.status,
        ...(row.keywords ?? []),
        ...Object.values(row.fields ?? {}).flatMap((value) => Array.isArray(value) ? value.map(String) : [String(value ?? "")]),
    ].join(" ").toLocaleLowerCase();
}
async function tableHtml(artifactInfo) {
    const settings = getSettings();
    const registry = normalizeTableRegistry(settings.tableRegistry);
    const visibleTables = enabledTables(registry);
    const artifact = artifactInfo?.artifact;
    const latest = latestSnapshotArtifact();
    const chatState = await getChatState(currentChatKey());
    const focusObjectId = chatState.focusObjectId || '';
    const busy = workspacePipelineBusy(artifactInfo);
    const editable = Boolean(settings.enabled && !busy && artifactInfo && latest && latest.artifact.messageKey === artifactInfo.artifact.messageKey);
    if (!visibleTables.length) {
        return `<section class="ma11-empty-panel"><h2>没有启用的可见表格</h2><p>内部事实层仍会保存事件线和总结消费状态。请在“提取模板”中启用或新增表头。</p><button data-ma11-action="open-table-manager">打开提取模板</button></section>`;
    }
    let active = settings.ui.activeTable;
    let activeDefinition = visibleTables.find((table) => table.key === active);
    if (!activeDefinition) {
        activeDefinition = visibleTables[0];
        active = activeDefinition.key;
        settings.ui.activeTable = active;
    }
    const rows = visibleStateRows(artifact?.snapshot?.[active]);
    const columnHeaders = tableColumnHeaders(activeDefinition);
    const mobileCards = artifact?.snapshot ? (rows.length ? rows.map((row, index) => {
        const searchText = searchableRowText(row);
        const hidden = tableSearchQuery && !searchText.includes(tableSearchQuery.toLocaleLowerCase());
        const visibleFields = activeDefinition.fields.filter((field) => {
            const value = row.fields?.[field.key];
            return Array.isArray(value) ? value.length > 0 : String(value ?? '').trim();
        }).slice(0, 6);
        const fieldHtml = visibleFields.map((field) => {
            const raw = row.fields?.[field.key];
            const value = Array.isArray(raw) ? raw.join('；') : String(raw ?? '');
            return `<div class="ma11-mobile-field"><small>${escapeHtml(field.label)}</small><span>${escapeHtml(value)}</span></div>`;
        }).join('');
        const focusButton = ['characters', 'state'].includes(activeDefinition.role)
            ? (row.id === focusObjectId
                ? `<button data-ma11-action="clear-focus" data-ma11-focus-row="${escapeHtml(row.id)}" ${editable ? '' : 'disabled'}>取消焦点</button>`
                : `<button data-ma11-action="set-focus" data-ma11-focus-row="${escapeHtml(row.id)}" ${editable ? '' : 'disabled'}>设为焦点</button>`)
            : '';
        return `<article class="ma11-mobile-row-card" data-ma11-table-card-search="${escapeHtml(searchText)}" ${hidden ? 'hidden' : ''}>
      <header><span class="ma11-mobile-row-index">${index + 1}</span><div><b>${escapeHtml(row.title)}</b>${row.id === focusObjectId ? '<span class="ma11-badge">常驻焦点</span>' : ''}</div><span class="ma11-source ${row.source}">${row.locked ? '完全锁定' : row.source === 'manual' ? '人工基础' : '自动'}</span></header>
      ${row.content ? `<p class="ma11-mobile-row-summary">${escapeHtml(row.content)}</p>` : ''}
      ${row.status ? `<div class="ma11-mobile-row-status">${escapeHtml(row.status)}</div>` : ''}
      ${fieldHtml ? `<div class="ma11-mobile-row-fields">${fieldHtml}</div>` : ''}
      <footer><time>${escapeHtml(new Date(row.updatedAt).toLocaleString())}</time><div class="ma11-row-actions">${focusButton}<button data-ma11-edit-row="${escapeHtml(row.id)}" ${editable ? '' : 'disabled'}>编辑</button><button class="danger" data-ma11-delete-row="${escapeHtml(row.id)}" ${editable ? '' : 'disabled'}>删除</button></div></footer>
    </article>`;
    }).join('') : '<div class="ma11-empty-panel">该视图暂无记录。</div>') : '<div class="ma11-empty-panel">尚无状态表。点击“整理最新正文”。</div>';
    return `
    <section class="ma11-toolbar ma11-table-toolbar">
      <div>
        <div class="ma11-table-heading"><h2>记忆表格</h2><p>状态表记录当前事实，小总结写入近期经历，大总结写入历史事实。</p></div>
        <div class="ma11-table-tabs">${visibleTables.map((table) => `<button class="${table.key === active ? "active" : ""}" data-ma11-table="${escapeHtml(table.key)}">${escapeHtml(table.name)} <span>${visibleStateRows(artifact?.snapshot?.[table.key]).length}</span></button>`).join("")}</div>
        <p class="ma11-table-purpose"><b>${escapeHtml(activeDefinition.name)}</b>：${escapeHtml(activeDefinition.purpose)}</p>
      </div>
      <div class="ma11-table-tools">
        <label class="ma11-search-field"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input data-ma11-table-search value="${escapeHtml(tableSearchQuery)}" placeholder="搜索当前表格" aria-label="搜索当前表格"/><output data-ma11-table-visible-count>${rows.length} / ${rows.length}</output></label>
        <div class="ma11-actions"><button data-ma11-action="add-row" ${editable ? "" : "disabled"}>＋ 添加</button><button data-ma11-action="run-state" ${settings.enabled && !busy && artifactInfo?.index === latestAssistantIndex() && (!settings.hostControl.enabled || !settings.auditEnabled || artifact?.audit?.passed) ? "" : "disabled"}>生成/更新</button><button data-ma11-action="open-table-manager">提取模板</button></div>
      </div>
    </section>
    <section class="ma11-memory-layer-map" aria-label="表格与总结写入关系">
      <div><span>01</span><b>状态表</b><small>当前摘要、现行事实、当前状态</small></div>
      <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
      <div><span>02</span><b>小总结</b><small>归并到“近期经历”</small></div>
      <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
      <div><span>03</span><b>大总结</b><small>固化到“历史事实”</small></div>
    </section>
    <p class="ma11-table-hint">只显示启用视图。手机端使用对象卡片，只展示当前必要信息；完整内容通过编辑器查看和修改。</p>
    <section class="ma11-table-wrap" role="region" aria-label="${escapeHtml(activeDefinition.name)}状态表" tabindex="0">
      ${artifact?.snapshot ? `<table class="ma11-table">
        <colgroup><col class="ma11-col-index"/><col class="ma11-col-title"/><col class="ma11-col-content"/><col class="ma11-col-state"/><col class="ma11-col-meta"/><col class="ma11-col-actions"/></colgroup>
        <thead><tr><th>序号</th><th>${escapeHtml(columnHeaders.title)}</th><th>${escapeHtml(columnHeaders.content)}</th><th>${escapeHtml(columnHeaders.state)}</th><th>来源与更新时间</th><th>操作</th></tr></thead>
        <tbody>${rows.length ? rows.map((row, index) => {
        const searchText = searchableRowText(row);
        const hidden = tableSearchQuery && !searchText.includes(tableSearchQuery.toLocaleLowerCase());
        return `<tr data-ma11-table-row-search="${escapeHtml(searchText)}" ${hidden ? "hidden" : ""}>
          <td data-label="序号">${index + 1}</td>
          <td class="ma11-cell-title" data-label="${escapeHtml(columnHeaders.title)}"><b>${escapeHtml(row.title)}</b>${row.id === focusObjectId ? `<span class="ma11-badge">常驻焦点</span>` : ""}</td>
          <td class="ma11-cell-content" data-label="${escapeHtml(columnHeaders.content)}">${escapeHtml(row.content)}${rowCustomFieldsHtml(row, activeDefinition)}</td>
          <td data-label="${escapeHtml(columnHeaders.state)}"><div class="ma11-cell-status">${row.status ? `<span class="ma11-status-text">${escapeHtml(row.status)}</span>` : ""}${lifecycleHtml(row)}<div class="ma11-keyword-list">${row.keywords.map((word) => `<span class="ma11-keyword">${escapeHtml(word)}</span>`).join("")}</div></div></td>
          <td data-label="来源与更新时间"><div class="ma11-cell-meta"><span class="ma11-source ${row.source}">${row.locked ? "完全锁定" : row.source === "manual" ? "人工基础" : "自动"}</span><time>${escapeHtml(new Date(row.updatedAt).toLocaleString())}</time></div></td>
          <td data-label="操作"><div class="ma11-row-actions">${['characters', 'state'].includes(activeDefinition.role) ? (row.id === focusObjectId ? `<button data-ma11-action="clear-focus" data-ma11-focus-row="${escapeHtml(row.id)}" ${editable ? "" : "disabled"}>取消焦点</button>` : `<button data-ma11-action="set-focus" data-ma11-focus-row="${escapeHtml(row.id)}" ${editable ? "" : "disabled"}>设为焦点</button>`) : ""}<button data-ma11-edit-row="${escapeHtml(row.id)}" ${editable ? "" : "disabled"}>编辑</button><button class="danger" data-ma11-delete-row="${escapeHtml(row.id)}" ${editable ? "" : "disabled"}>删除</button></div></td>
        </tr>`;
    }).join("") : `<tr class="ma11-empty-row"><td colspan="6" class="ma11-empty">该视图暂无记录。</td></tr>`}</tbody>
      </table>` : '<div class="ma11-empty-panel">尚无状态表。点击“整理最新正文”。</div>'}
      <div class="ma11-mobile-table-cards">${mobileCards}</div>
    </section>`;
}
const HEADER_TEMPLATE_FORMAT = 'mirror-abyss-header-template';
const HEADER_TEMPLATE_VERSION = 1;
function headerTemplatePayload() {
    const settings = getSettings();
    const registry = normalizeTableRegistry(settings.tableRegistry);
    return {
        format: HEADER_TEMPLATE_FORMAT,
        formatVersion: HEADER_TEMPLATE_VERSION,
        exportedBy: VERSION,
        name: '镜渊提取模板',
        tables: exportTableRegistryTemplate(registry),
        links: normalizeTableLinkRules(settings.tableLinkRules, registry).map((rule) => ({
            sourceTableKey: rule.sourceTableKey,
            targetTableKeys: [...rule.targetTableKeys],
            enabled: rule.enabled,
        })),
    };
}
function exportHeaderTemplate() {
    const payload = headerTemplatePayload();
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Mirror-Abyss-header-template-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
async function importHeaderTemplateFile(file) {
    if (!(file instanceof File))
        throw new Error('没有选择模板文件');
    if (file.size > 2 * 1024 * 1024)
        throw new Error('模板文件不能超过 2MB');
    let payload;
    try {
        payload = JSON.parse(await file.text());
    }
    catch (error) {
        throw new Error(`模板不是有效 JSON：${toErrorMessage(error)}`);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        throw new Error('模板根结构无效');
    if (payload.format !== HEADER_TEMPLATE_FORMAT)
        throw new Error('这不是镜渊表头模板');
    if (Number(payload.formatVersion) !== HEADER_TEMPLATE_VERSION)
        throw new Error(`暂不支持模板格式版本 ${payload.formatVersion}`);
    const sourceTables = Array.isArray(payload.tables) ? payload.tables : payload.tableRegistry;
    if (!Array.isArray(sourceTables) || !sourceTables.length)
        throw new Error('模板中没有表头定义');
    // BUGFIX：模板导入只接受表头层配置，不能携带内部 role 或保留字段改变事实路由。
    const registry = normalizeImportedTableRegistry(sourceTables);
    const sourceLinks = Array.isArray(payload.links) ? payload.links : payload.tableLinkRules;
    const links = normalizeTableLinkRules(Array.isArray(sourceLinks) ? sourceLinks : [], registry);
    const settings = getSettings();
    settings.tableLinkRules = links;
    settings.migration.tableLinksV40 = true;
    await updateTableRegistryAndSync(registry);
}
function tableSelectOptions(registry, selectedKey = '') {
    return registry.map((table) => `<option value="${escapeHtml(table.key)}" ${table.key === selectedKey ? 'selected' : ''}>${escapeHtml(table.name)}</option>`).join('');
}
function linkTargetChoices(registry, sourceKey, selectedKeys, attributeName) {
    const selected = new Set(selectedKeys ?? []);
    return registry.filter((table) => table.key !== sourceKey).map((table) => `<label class="ma11-link-target"><input type="checkbox" ${attributeName} value="${escapeHtml(table.key)}" ${selected.has(table.key) ? 'checked' : ''}/><span>${escapeHtml(table.name)}</span></label>`).join('');
}
function selectedLinkTargets(workspace, selector) {
    return [...workspace.querySelectorAll(selector)]
        .filter((input) => input instanceof HTMLInputElement && input.checked)
        .map((input) => input.value);
}
function tableManagerHtml(artifactInfo) {
    const settings = getSettings();
    const registry = normalizeTableRegistry(settings.tableRegistry);
    const linkRules = normalizeTableLinkRules(settings.tableLinkRules, registry);
    const snapshot = artifactInfo?.artifact.snapshot;
    const rows = registry.map((table, index) => {
        const fields = customFieldText(table);
        const headers = editableHeaderText(table);
        return `<article class="ma11-table-manager-row" data-ma11-table-card="${escapeHtml(table.key)}">
      <div class="ma11-table-manager-head">
        <span class="ma11-order-number">${index + 1}</span>
        <label class="ma11-switch"><input type="checkbox" data-ma11-table-enabled="${escapeHtml(table.key)}" ${table.enabled ? 'checked' : ''}/><span>${table.enabled ? '启用' : '停用'}</span></label>
        <span class="ma11-badge">${table.isDefault ? '默认表头' : '新增表头'}</span>
        <span>${visibleStateRows(snapshot?.[table.key]).length} 行</span>
      </div>
      <div class="ma11-table-manager-fields">
        <label>表名<input data-ma11-table-name="${escapeHtml(table.key)}" value="${escapeHtml(table.name)}" maxlength="80" /></label>
        <label class="ma11-table-purpose-editor">提取提示词 <small>直接说明这张表应记录什么、不记录什么。</small><textarea data-ma11-table-purpose="${escapeHtml(table.key)}" rows="4" maxlength="1000">${escapeHtml(table.purpose)}</textarea></label>
        <label class="ma11-table-header-editor">基础表头提示词 <small>每行：表头名称｜该表头提取什么。内部字段身份由插件维护。</small><textarea data-ma11-table-headers="${escapeHtml(table.key)}" rows="6">${escapeHtml(headers)}</textarea></label>
        <label class="ma11-table-extra-editor">新增表头提示词 <small>可留空；每行：表头名称｜该表头提取什么。</small><textarea data-ma11-table-fields="${escapeHtml(table.key)}" rows="4" placeholder="战斗风格｜记录长期稳定的战斗方式和武器偏好">${escapeHtml(fields)}</textarea></label>
      </div>
      <div class="ma11-actions ma11-table-manager-actions">
        <button data-ma11-action="save-table" data-ma11-table-key="${escapeHtml(table.key)}">保存</button>
        <button data-ma11-action="move-table-up" data-ma11-table-key="${escapeHtml(table.key)}" ${index === 0 ? 'disabled' : ''}>上移</button>
        <button data-ma11-action="move-table-down" data-ma11-table-key="${escapeHtml(table.key)}" ${index === registry.length - 1 ? 'disabled' : ''}>下移</button>
        <button class="danger" data-ma11-action="delete-table" data-ma11-table-key="${escapeHtml(table.key)}">删除</button>
      </div>
      <p class="ma11-help">修改表名、提取提示词或表头提示词后，下一次状态提取会按新方向工作；已有数据不会自动重新解释。</p>
    </article>`;
    }).join('');
    const linkRows = linkRules.map((rule, index) => {
        const source = tableByKey(registry, rule.sourceTableKey) || registry[0];
        return `<article class="ma11-link-rule-row" data-ma11-link-card="${escapeHtml(rule.id)}">
      <div class="ma11-link-rule-head">
        <span class="ma11-order-number">${index + 1}</span>
        <label class="ma11-switch"><input type="checkbox" data-ma11-link-enabled="${escapeHtml(rule.id)}" ${rule.enabled ? 'checked' : ''}/><span>${rule.enabled ? '启用' : '停用'}</span></label>
        <span class="ma11-badge">${rule.isDefault ? '默认联动' : '新增联动'}</span>
      </div>
      <div class="ma11-link-rule-editor">
        <label>哪个表发生变化<select data-ma11-link-source="${escapeHtml(rule.id)}">${tableSelectOptions(registry, source?.key || '')}</select></label>
        <div class="ma11-link-target-box"><b>重新检查哪些表</b><div>${linkTargetChoices(registry, source?.key || '', rule.targetTableKeys, `data-ma11-link-target="${escapeHtml(rule.id)}"`)}</div></div>
      </div>
      <div class="ma11-actions ma11-table-manager-actions"><button data-ma11-action="save-link-rule" data-ma11-link-rule-id="${escapeHtml(rule.id)}">保存联动</button><button class="danger" data-ma11-action="delete-link-rule" data-ma11-link-rule-id="${escapeHtml(rule.id)}">删除联动</button></div>
      <p class="ma11-help">联动只让目标表在同一轮重新判断；目标没有真实变化时不会写入。</p>
    </article>`;
    }).join('');
    const isDefault = extractionTemplateIsDefault();
    const summaryStandard = summaryPromptsAreStandard();
    return `<section class="ma11-toolbar ma11-rules-toolbar"><div><h2>提取模板</h2><p>只需修改表名和对应提示词；插件内部的稳定 ID、合并、沉降、总结与世界书写入保持不变。</p></div><div class="ma11-actions"><button data-ma11-action="import-header-template">导入模板</button><button data-ma11-action="export-header-template">导出模板</button><button data-ma11-action="restore-default-template">恢复默认模板</button><button data-ma11-action="open-prompt-diagnostics">查看实际提示词</button></div><input type="file" hidden accept="application/json,.json" data-ma11-template-import /></section>
    <section class="ma11-card ma11-standard-card ${isDefault ? 'is-standard' : 'is-custom'}">
      <div><span class="ma11-standard-orb" aria-hidden="true"><i class="fa-solid ${isDefault ? 'fa-check' : 'fa-pen'}"></i></span><div><b>${isDefault ? '正在使用镜渊默认表头模板' : '当前表头模板已修改'}</b><p>默认模板就是此前一直使用的时空、场景、角色、物品、事件、地点、全局变化、基础设定与自定义对象，不额外内置其他用途模板。</p></div></div>
      <nav class="ma11-rule-jump" aria-label="模板页面导航"><a href="#ma11-template-tables">表头提示词</a><a href="#ma11-template-links">联动规则</a><a href="#ma11-template-summaries">总结规则</a></nav>
    </section>
    <section class="ma11-card ma11-form-card ma11-new-table">
      <header><div><b>新增表头</b><span>新增后自动进入下一次提取提示词</span></div></header>
      <label>表名<input data-ma11-new-table-name maxlength="80" placeholder="例如：实验条件" /></label>
      <label>提取提示词<textarea data-ma11-new-table-purpose rows="4" maxlength="1000" placeholder="说明这张表只记录什么，以及不记录什么。"></textarea></label>
      <label>新增表头提示词 <small>可留空；每行：表头名称｜该表头提取什么。</small><textarea data-ma11-new-table-fields rows="4" placeholder="测量结果｜记录数值、单位、条件和来源"></textarea></label>
      <div class="ma11-actions"><button data-ma11-action="create-table">新增表头</button></div>
    </section>
    <section class="ma11-section-heading" id="ma11-template-tables"><div><span>01</span><div><h3>表头与提取提示词</h3><p>启用、关闭、新增或改写后，模型会据此改变提取方向。</p></div></div></section>
    <section class="ma11-table-manager-list">${rows || '<div class="ma11-empty-panel">当前没有表头定义。</div>'}</section>
    <section class="ma11-section-heading" id="ma11-template-links"><div><span>02</span><div><h3>联动规则</h3><p>来源表变化时，让指定目标表在同一轮重新检查。</p></div></div></section>
    <section class="ma11-card ma11-form-card ma11-new-link-rule">
      <header><div><b>新增联动</b><span>不直接修改目标表，只触发重新判断</span></div></header>
      <label>哪个表发生变化<select data-ma11-new-link-source>${tableSelectOptions(registry, registry[0]?.key || '')}</select></label>
      <div class="ma11-link-target-box"><b>重新检查哪些表</b><div>${linkTargetChoices(registry, registry[0]?.key || '', [], 'data-ma11-new-link-target')}</div></div>
      <div class="ma11-actions"><button data-ma11-action="create-link-rule">新增联动</button></div>
    </section>
    <section class="ma11-link-rule-list">${linkRows || '<div class="ma11-empty-panel">当前没有联动规则。只有正文直接命中的表头会被检查。</div>'}</section>
    <section class="ma11-section-heading" id="ma11-template-summaries"><div><span>03</span><div><h3>总结压缩规则</h3><p>沿用现有小总结和大总结白盒设置，不随表头模板导入导出。</p></div></div><span class="ma11-badge ${summaryStandard ? 'success' : 'working'}">${summaryStandard ? '标准' : '已修改'}</span></section>
    <section class="ma11-summary-prompt-grid">${summaryPromptEditorHtml('small')}${summaryPromptEditorHtml('large')}</section>
    <section class="ma11-card ma11-note"><b>模板边界</b><p>导入导出只包含表头、表头提示词、启用状态、顺序和联动规则，不包含聊天数据、世界书、总结内容、连接设置或可执行代码。</p></section>`;
}
function graphNodePositions(graph, preferredId) {
    const width = 1000;
    const height = 760;
    const center = { x: width / 2, y: height / 2 };
    if (!graph.nodes.length)
        return [];
    const degree = new Map();
    const adjacency = new Map();
    for (const node of graph.nodes)
        adjacency.set(node.id, new Set());
    for (const edge of graph.edges) {
        adjacency.get(edge.source)?.add(edge.target);
        adjacency.get(edge.target)?.add(edge.source);
        degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
        degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
    const preferred = graph.nodes.find((node) => node.id === preferredId)
        ?? graph.nodes.find((node) => node.type === 'focus')
        ?? [...graph.nodes].filter((node) => node.type === 'event').sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))[0]
        ?? [...graph.nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.label.localeCompare(b.label))[0];
    const distance = new Map([[preferred.id, 0]]);
    const queue = [preferred.id];
    while (queue.length) {
        const id = queue.shift();
        const nextDistance = (distance.get(id) ?? 0) + 1;
        for (const neighbor of adjacency.get(id) ?? []) {
            if (distance.has(neighbor))
                continue;
            distance.set(neighbor, nextDistance);
            queue.push(neighbor);
        }
    }
    const byLayer = new Map();
    for (const node of graph.nodes) {
        const layer = Math.min(3, distance.get(node.id) ?? 3);
        byLayer.set(layer, [...(byLayer.get(layer) ?? []), node]);
    }
    for (const nodes of byLayer.values())
        nodes.sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.type.localeCompare(b.type) || a.label.localeCompare(b.label));
    const output = [{ ...preferred, x: center.x, y: center.y }];
    // BUGFIX：旧版左右列 + 底部网格会把远端节点堆到中央，并让关系线大量交叉。
    // 按最短关系距离放到同心椭圆，保持确定性，同时给中文标签留出横向空间。
    const placeRing = (nodes, radiusX, radiusY, phase) => {
        const filtered = nodes.filter((node) => node.id !== preferred.id);
        filtered.forEach((node, index) => {
            const angle = phase + (Math.PI * 2 * index) / Math.max(filtered.length, 1);
            output.push({
                ...node,
                x: center.x + Math.cos(angle) * radiusX,
                y: center.y + Math.sin(angle) * radiusY,
            });
        });
    };
    placeRing(byLayer.get(1) ?? [], 185, 145, -Math.PI / 2);
    placeRing(byLayer.get(2) ?? [], 325, 245, -Math.PI / 2 + Math.PI / 7);
    placeRing(byLayer.get(3) ?? [], 430, 315, -Math.PI / 2 + Math.PI / 11);
    return output;
}
function graphTypeLabel(type) {
    const labels = {
        focus: "焦点",
        character: "人物",
        relationship: "关系",
        item: "物品",
        event: "事件",
        region: "区域",
    };
    return labels[type];
}
function graphLifecycleClass(node) {
    if (node.existence === "死亡已确认")
        return "dead";
    if (node.existence === "存在未知" || node.existence === "身份存疑" || node.existence === "失踪")
        return "uncertain";
    if (node.activity === "已归档")
        return "archived";
    if (node.activity === "长期休眠")
        return "long-dormant";
    if (node.activity === "休眠")
        return "dormant";
    return "";
}
function graphHtml(artifactInfo, profiles = [], graphOverride) {
    const settings = getSettings();
    const snapshot = artifactInfo?.artifact.snapshot;
    const graph = graphOverride ?? buildRelationshipGraph(snapshot, settings.ui.graphScope, settings.tableRegistry);
    const positioned = graphNodePositions(graph, selectedGraphNodeId);
    const positions = new Map(positioned.map((node) => [node.id, node]));
    const degree = new Map();
    for (const edge of graph.edges) {
        degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
        degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
    const graphQuery = graphSearchQuery.trim().toLocaleLowerCase();
    const matchingNodeIds = new Set(positioned
        .filter((node) => !graphQuery || `${node.label} ${node.detail} ${node.status}`.toLocaleLowerCase().includes(graphQuery))
        .map((node) => node.id));
    const selected = positioned.find((node) => node.id === selectedGraphNodeId) ?? positioned[0];
    if (selected && !selectedGraphNodeId)
        selectedGraphNodeId = selected.id;
    const selectedEventProfile = selected?.type === "event"
        ? profiles.find((profile) => (profile.eventEntryId && selected.id.endsWith(`:${profile.eventEntryId}`))
            || profile.eventId === selected.label
            || profile.title === selected.label)
        : undefined;
    const zoom = clampGraphZoom(settings.ui.graphZoom);
    settings.ui.graphZoom = zoom;
    const edgeSvg = graph.edges
        .map((edge) => {
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target)
            return "";
        const mx = (source.x + target.x) / 2;
        const my = (source.y + target.y) / 2;
        const dimmed = graphQuery && !matchingNodeIds.has(edge.source) && !matchingNodeIds.has(edge.target);
        return `<g class="ma11-graph-edge ${edge.kind || "object"} ${edge.explicit === false ? "legacy" : "explicit"} ${dimmed ? "dimmed" : ""}" data-ma11-graph-edge-source="${escapeHtml(edge.source)}" data-ma11-graph-edge-target="${escapeHtml(edge.target)}"><line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"><title>${escapeHtml(`${edge.label}：${edge.detail}`)}</title></line>${graph.edges.length <= 18 ? `<text x="${mx}" y="${my}">${escapeHtml(edge.label)}</text>` : ""}</g>`;
    })
        .join("");
    const nodeSvg = positioned
        .map((node) => {
        const searchText = `${node.label} ${node.detail} ${node.status}`.toLocaleLowerCase();
        const matches = !graphQuery || matchingNodeIds.has(node.id);
        const shortLabel = node.label.length > 10 ? `${node.label.slice(0, 9)}…` : node.label;
        const labelWidth = Math.min(150, Math.max(82, 34 + Array.from(shortLabel).length * 12));
        return `<g class="ma11-graph-node ${node.type} ${graphLifecycleClass(node)} ${selected?.id === node.id ? "selected" : ""} ${graphQuery ? (matches ? "search-match" : "dimmed") : ""}" data-ma11-graph-node="${escapeHtml(node.id)}" data-ma11-graph-search-text="${escapeHtml(searchText)}" transform="translate(${node.x} ${node.y})" tabindex="0" role="button"><rect x="${-labelWidth / 2}" y="-23" width="${labelWidth}" height="46" rx="15"></rect><text text-anchor="middle" y="4">${escapeHtml(shortLabel)}</text><title>${escapeHtml(`${node.label}\n${node.detail}`)}</title></g>`;
    })
        .join("");
    const graphWidth = Math.round(1000 * zoom);
    const graphHeight = Math.round(760 * zoom);
    const compactGraph = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 900px)').matches;
    const graphStyle = compactGraph
        ? `width:${Math.max(100, Math.round(zoom * 100))}%;height:100%;min-height:100%;`
        : `width:${graphWidth}px;height:${graphHeight}px`;
    return `
    <section class="ma11-toolbar ma11-graph-toolbar">
      <div><h2>对象图谱</h2><p>优先使用明确的关联对象、关联事件和关系状态；旧数据缺少显式关联时才使用兼容推断。</p></div>
      <div class="ma11-graph-toolbar-actions">
        <div class="ma11-segmented"><button class="${settings.ui.graphScope === "relations" ? "active" : ""}" data-ma11-graph-scope="relations">人物关系</button><button class="${settings.ui.graphScope === "world" ? "active" : ""}" data-ma11-graph-scope="world">全局网络</button></div>
        <label class="ma11-search-field ma11-graph-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input data-ma11-graph-search value="${escapeHtml(graphSearchQuery)}" placeholder="查找并高亮节点" aria-label="查找图谱节点"/><output data-ma11-graph-match-count>${matchingNodeIds.size} / ${graph.nodes.length}</output></label>
        <div class="ma11-graph-zoom" aria-label="图谱缩放">
          <button type="button" data-ma11-graph-zoom="out" title="缩小">−</button>
          <input type="range" min="50" max="250" step="5" value="${Math.round(zoom * 100)}" data-ma11-graph-zoom-range aria-label="缩放比例" />
          <button type="button" data-ma11-graph-zoom="in" title="放大">＋</button>
          <button type="button" data-ma11-graph-zoom="reset">100%</button>
          <button type="button" data-ma11-graph-zoom="fit">适应</button>
          <output>${Math.round(zoom * 100)}%</output>
        </div>
      </div>
    </section>
    <section class="ma11-graph-stats"><span><b>${graph.nodes.length}</b>节点</span><span><b>${graph.edges.length}</b>关系</span><span><b>${graph.edges.filter((edge) => edge.explicit !== false).length}</b>明确关联</span><span><b>${graph.edges.filter((edge) => edge.explicit === false).length}</b>兼容关联</span></section>
    ${graph.nodes.length ? `<section class="ma11-graph-layout"><div><div class="ma11-graph-legend"><span><i class="character"></i>人物</span><span><i class="item"></i>物品</span><span><i class="event"></i>事件</span><span><i class="region"></i>地点 / 场景 / 全局</span><span><i class="legacy"></i>旧记录推断</span></div><div class="ma11-graph-canvas"><svg viewBox="0 0 1000 760" width="${graphWidth}" height="${graphHeight}" style="${graphStyle}" preserveAspectRatio="xMidYMid meet" aria-label="镜渊对象图谱">${edgeSvg}${nodeSvg}</svg></div></div><aside class="ma11-graph-detail">${selected ? `<span class="ma11-graph-type ${selected.type}">${escapeHtml(graphTypeLabel(selected.type))}</span><h3>${escapeHtml(selected.label)}</h3><p>${escapeHtml(selected.detail || "暂无详细记录")}</p><dl><dt>直接关系</dt><dd>${degree.get(selected.id) ?? 0}</dd><dt>状态</dt><dd>${escapeHtml(selected.status || "未标注")}</dd>${selected.existence ? `<dt>存在</dt><dd>${escapeHtml(selected.existence)}</dd>` : ""}${selected.activity ? `<dt>活跃</dt><dd>${escapeHtml(selected.activity)}</dd>` : ""}${selected.memory ? `<dt>记忆</dt><dd>${escapeHtml(selected.memory)}</dd>` : ""}${selectedEventProfile ? `<dt>事件事实</dt><dd>${selectedEventProfile.factCount}</dd><dt>总结层</dt><dd>${selectedEventProfile.hasLargeSummary ? "已有大总结" : selectedEventProfile.smallSummaryCount ? `${selectedEventProfile.smallSummaryCount} 个小总结` : "尚无总结"}</dd><dt>待结算</dt><dd>${selectedEventProfile.settlingEntryCount}</dd>` : ""}</dl>${selectedEventProfile?.currentResults.length ? `<div class="ma11-event-results ma11-graph-event-results"><b>明确结果</b><ul>${selectedEventProfile.currentResults.map((result) => `<li>${escapeHtml(result)}</li>`).join("")}</ul></div>` : ""}` : '<p class="ma11-empty">点击节点查看详情。</p>'}</aside></section>` : '<section class="ma11-empty-panel">当前状态表没有可绘制的关系节点。先在角色或事件条目中建立明确关联。</section>'}`;
}
function summaryPromptEditorHtml(kind) {
    const settings = getSettings();
    const prompt = settings.summaryPrompts[kind];
    const label = kind === 'small' ? '小总结规则' : '大总结规则';
    const description = kind === 'small'
        ? '把同一事件线整理成下一步必须承接的最小事实集合，并写入表格的“近期经历”。'
        : '重新审查小总结，只保留跨场景、跨阶段仍会改变未来的事实，并写入表格的“历史事实”。';
    const standard = JSON.stringify(prompt) === JSON.stringify(DEFAULT_SUMMARY_PROMPTS[kind]);
    const field = (key, title, rows, help) => `<label>${title}<small>${help}</small><textarea rows="${rows}" data-ma11-summary-prompt="${kind}" data-ma11-summary-section="${key}">${escapeHtml(prompt[key])}</textarea></label>`;
    return `<section class="ma11-card ma11-form-card ma11-summary-prompt-card" id="ma11-rule-${kind}">
    <header><div><b>${label}</b><span>${description}</span></div><span class="ma11-badge ${standard ? "success" : "working"}">${standard ? "标准" : "已自定义"}</span></header>
    ${field('coreQuestion', '核心判断', 3, '每次总结先回答这个问题，而不是按字数截断。')}
    <div class="ma11-rule-grid">
      ${field('includeRules', '必须保留', 8, '只列真正影响后续连续性的内容。')}
      ${field('excludeRules', '必须删除', 8, '排除过程、重复、背景板和已失效信息。')}
      ${field('updateRules', '版本更新', 7, '上一版是待修订原料，不是继续追加的正文。')}
      ${field('expressionRules', '表达方式', 7, '控制粒度、去重与最终可读性。')}
    </div>
    <div class="ma11-actions">
      <button data-ma11-action="save-summary-prompt" data-ma11-summary-kind="${kind}">保存${label}</button>
      <button data-ma11-action="restore-summary-prompt" data-ma11-summary-kind="${kind}">恢复标准规则</button>
    </div>
    <p class="ma11-help">事件分组、事实消费、版本继承、沉淀到对象和世界书同步由插件负责；这里仅调整模型筛选与表达。</p>
  </section>`;
}
async function summariesHtml() {
    const info = latestSnapshotArtifact();
    const enabled = getSettings().enabled;
    const busy = workspacePipelineBusy(info);
    const state = info ? await getChatState(info.artifact.chatKey) : null;
    const allSmall = state?.smallSummaries ?? [];
    const large = state?.largeSummaries ?? [];
    const small = pendingSmallSummaries(allSmall, large);
    return `
    <section class="ma11-toolbar"><div><h2>小总结与大总结</h2><p>小总结写入近期经历；大总结重新审查并写入历史事实。</p></div><div class="ma11-actions"><button data-ma11-action="force-small" ${enabled && info && !busy ? "" : "disabled"}>立即小总结</button><button data-ma11-action="force-large" ${enabled && info && !busy ? "" : "disabled"}>立即大总结</button></div></section>
    <div class="ma11-summary-columns">
      <section class="ma11-card"><header><b>小总结</b><span>${small.length}</span></header>${small.length
        ? small
            .slice()
            .reverse()
            .map((item) => `<article class="ma11-summary"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>${item.unresolvedItems?.length ? `<div class="ma11-summary-unresolved"><b>未决</b><span>${escapeHtml(item.unresolvedItems.join('；'))}</span></div>` : ''}${item.sedimentation ? `<div class="ma11-summary-settlement"><span>已应用 ${item.sedimentation.appliedRowIds?.length ?? 0}</span><span>保护/忽略 ${item.sedimentation.ignoredRowIds?.length ?? 0}</span></div>` : ""}<small>${escapeHtml(new Date(item.createdAt).toLocaleString())}</small></article>`)
            .join("")
        : '<p class="ma11-empty">尚无小总结。</p>'}</section>
      <section class="ma11-card"><header><b>大总结</b><span>${large.length}</span></header>${large.length
        ? large
            .slice()
            .reverse()
            .map((item) => `<article class="ma11-summary"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>${item.unresolvedItems?.length ? `<div class="ma11-summary-unresolved"><b>长期未决</b><span>${escapeHtml(item.unresolvedItems.join('；'))}</span></div>` : ''}${item.sedimentation ? `<div class="ma11-summary-settlement"><span>已应用 ${item.sedimentation.appliedRowIds?.length ?? 0}</span><span>保护/忽略 ${item.sedimentation.ignoredRowIds?.length ?? 0}</span></div>` : ""}<small>${escapeHtml(new Date(item.createdAt).toLocaleString())}</small></article>`)
            .join("")
        : '<p class="ma11-empty">尚无大总结。</p>'}</section>
    </div>`;
}
function auditHtml() {
    const settings = getSettings();
    const info = currentArtifact();
    const audit = info?.artifact.audit;
    const revision = info?.artifact.revision;
    const violationHtml = audit && !audit.passed && audit.violations.length
        ? `<ol class="ma11-violation-list">${audit.violations.map((item) => `<li><b>${escapeHtml(item.rule)}</b><p>${escapeHtml(item.evidence)}</p><small>修改：${escapeHtml(item.action)}</small></li>`).join("")}</ol>`
        : "";
    const latestIndex = latestAssistantIndex();
    const isLatest = info
        ? info.index === latestIndex
        : selectedMessageIndex === null && latestIndex >= 0;
    const busy = workspacePipelineBusy(info);
    const canAudit = Boolean(settings.enabled && !busy && settings.hostControl.enabled && settings.auditEnabled && settings.auditPrompt.trim() && isLatest);
    const canRevise = Boolean(settings.enabled && !busy && isLatest && audit && !audit.passed && audit.decision !== "block");
    return `
    <section class="ma11-toolbar"><div><h2>审核与修正</h2><p>审核和修正分开执行；修正通过后再点击“生成表格”。</p></div><div class="ma11-actions"><button data-ma11-action="run-audit" ${canAudit ? "" : "disabled"}>立即审核</button><button data-ma11-action="run-revision" ${canRevise ? "" : "disabled"}>执行修正</button></div></section>
    <section class="ma11-card ma11-form-card">
      <header><b>规则审核与定向修正</b><span>最终通过的正文才进入状态表与世界书</span></header>
      <div class="ma11-guidance-banner"><span aria-hidden="true">✓</span><div><b>只填写可以明确判定的硬规则</b><p>推荐写“必须/禁止/仅当”的可验证条件。文风偏好、模糊审美和互相冲突的要求不适合作为自动阻断规则。</p></div></div>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="auditEnabled" ${settings.auditEnabled ? "checked" : ""}/><span>启用规则审核</span></label>
      <label>审核失败处理<select data-ma11-setting="auditFailAction">
        <option value="revise" ${settings.auditFailAction === "revise" ? "selected" : ""}>定向修正并原位替换（推荐）</option>
        <option value="mark" ${settings.auditFailAction === "mark" ? "selected" : ""}>保留并标红</option>
        <option value="hide" ${settings.auditFailAction === "hide" ? "selected" : ""}>隐藏，等待人工处理</option>
      </select></label>
      <label>自动修正仍失败后的处理<select data-ma11-setting="revisionFallbackAction">
        <option value="hide" ${settings.revisionFallbackAction === "hide" ? "selected" : ""}>隐藏并等待人工处理（推荐）</option>
        <option value="mark" ${settings.revisionFallbackAction === "mark" ? "selected" : ""}>保留并标红</option>
      </select></label>
      <label>最大自动修正次数<input type="number" min="1" max="2" data-ma11-setting="maxRevisionAttempts" value="${settings.maxRevisionAttempts}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="stopOnRepeatedViolation" ${settings.stopOnRepeatedViolation ? "checked" : ""}/><span>相同违规重复出现时立即停止，防止循环</span></label>
      <label>审核规则 <small>一条规则一行，写明触发条件与允许的最小修正范围</small><textarea rows="14" data-ma11-setting="auditPrompt" placeholder="示例：禁止替玩家决定是否接受交易；若出现，只删除代替玩家作出的决定，不改动其他正文。">${escapeHtml(settings.auditPrompt)}</textarea></label>
      <label>附加修正要求（可选）<textarea rows="6" data-ma11-setting="revisionPrompt" placeholder="例如：只做最小改动；保留原有文风和段落长度。">${escapeHtml(settings.revisionPrompt)}</textarea></label>
      <p class="ma11-help">审核说明和修正指令不会作为聊天消息写入上下文。修正通过后原位更新正文；插件不会锁定酒馆生成按钮，也不会自动删除消息。</p>
    </section>
    ${audit ? `<section class="ma11-card"><header><b>最近审核结果</b><span class="ma11-badge ${audit.passed ? "success" : "danger"}">${audit.passed ? "通过" : audit.decision === "block" ? "阻断" : "需修正"}</span></header><p>${escapeHtml(audit.reason)}</p>${violationHtml}${revision ? `<dl class="ma11-meta"><dt>修正状态</dt><dd>${escapeHtml(revision.status)}</dd><dt>修正次数</dt><dd>${revision.attempts.length}</dd><dt>停止原因</dt><dd>${escapeHtml(revision.stoppedReason || "—")}</dd></dl>` : ""}</section>` : ""}`;
}
async function syncHtml() {
    const info = latestSnapshotArtifact();
    const state = await getChatState(currentChatKey());
    const settings = getSettings();
    const historyWorkflow = readHistoryWorkflow(state);
    const syncPaused = historyWorkflow.blocked;
    const busy = workspacePipelineBusy(info);
    const syncDisplayStatus = syncPaused ? "blocked" : (state?.lastSyncStatus || "idle");
    const syncDisplayText = syncPaused ? "暂停" : statusText(syncDisplayStatus);
    return `
    <section class="ma11-card ma11-form-card">
      <header><b>聊天世界书</b><span class="ma11-badge ${statusClass(syncDisplayStatus)}">${syncDisplayText}</span></header>
      ${historyWorkflow.recovery ? `<div class="ma11-error-box">${escapeHtml(historyWorkflow.error || "正在恢复历史；最近同步结果保持不变")}</div>` : ""}
      ${historyWorkflow.invalidation ? `<div class="ma11-error-box">${historyWorkflow.pauseError ? `旧世界书条目暂停失败：${escapeHtml(historyWorkflow.pauseError)}。请先完成历史重建并重新发布。` : historyWorkflow.automatic ? "最新正文正在自动重新整理，完成后会自行恢复世界书同步。" : historyWorkflow.startIndex === undefined ? "历史删除位置未知，请先选择重算起点。完成前不会发布世界书。" : `第 ${historyWorkflow.startIndex + 1} 条消息之后的数据已失效。按依赖重建完成前不会发布世界书。`}</div>` : ""}
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="lorebookSync" ${settings.lorebookSync ? "checked" : ""}/><span>自动同步世界书</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-host-control="vector" ${settings.hostControl.vector ? "checked" : ""}/><span>允许镜渊托管条目使用 ST 向量召回</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-host-control="recursion" ${settings.hostControl.recursion ? "checked" : ""}/><span>允许镜渊托管条目参与 ST 递归触发</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoCreateLorebook" ${settings.autoCreateLorebook ? "checked" : ""}/><span>自动创建每聊天独立世界书</span></label>
      <label>发布模式<select data-ma11-setting="lorebookLayout"><option value="semantic" ${settings.lorebookLayout === "semantic" ? "selected" : ""}>按对象整理（推荐）</option><option value="detailed" ${settings.lorebookLayout === "detailed" ? "selected" : ""}>逐条排错</option></select></label>
      <div class="ma11-guidance-banner ma11-recall-guide"><span aria-hidden="true">↗</span><div><b>镜渊会自动分配三种召回方式</b><p>极少量当前连续性始终携带；有明确关键词的内容按条件出现；其余长期记忆按语义相关性召回。普通使用无需理解底层字段或手工配置发布顺序。</p></div></div>
      <label>世界书名称（留空自动生成）<input data-ma11-setting="lorebookName" value="${escapeHtml(settings.lorebookName)}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="latestContinuityConstant" ${settings.latestContinuityConstant ? "checked" : ""}/><span>将极少量当前焦点、时空、必要规则、不可缺失状态和直接相关全局变化设为常驻</span></label>
      <div class="ma11-editor-grid ma11-recall-grid">
        <label>语义召回参考门槛 <small>越高越严格；默认值适合多数剧情</small><input type="number" min="0" max="0.99" step="0.01" data-ma11-recall-setting="similarityThreshold" value="${settings.lorebookRecall.similarityThreshold}" /></label>
        <label>单次最多召回条目 <small>用于限制无关信息和上下文占用</small><input type="number" min="1" max="100" data-ma11-recall-setting="maxVectorResults" value="${settings.lorebookRecall.maxVectorResults}" /></label>
        <label>长期记忆发布上限（字符）<small>达到上限时优先保留更直接相关的内容</small><input type="number" min="2000" max="200000" step="1000" data-ma11-recall-setting="totalCapacity" value="${settings.lorebookRecall.totalCapacity}" /></label>
      </div>
      <div class="ma11-actions ma11-sync-actions">
        <button data-ma11-action="sync-now" ${settings.enabled && info && !busy && !historyWorkflow.blocked ? "" : "disabled"}>立即同步</button>
        ${settings.lorebookLayout === "semantic" ? `<button data-ma11-action="maintain-lorebook" ${settings.enabled && info && !busy && !historyWorkflow.blocked ? "" : "disabled"}>按对象清理并重新发布</button>` : ""}
        <button data-ma11-action="open-graph" ${info?.artifact.snapshot ? "" : "disabled"}>查看记忆网络</button>
      </div>
      <p class="ma11-help ma11-maintenance-note"><b>维护操作：</b>“按对象清理并重新发布”会先检查可安全删除的镜渊旧条目，并在一次确认后发布当前真实快照；不会处理人工条目或其他聊天条目。</p>
      ${(() => {
        const suppressed = suppressedLorebookEntries(state);
        return suppressed.length ? `<section class="ma11-suppressed-list"><header><b>玩家已删除并禁止自动恢复</b><span>${suppressed.length} 条</span></header><p>关联显示已从其他世界书条目隐藏；内部事实链仍保留，恢复发布后会重新建立关联。</p>${suppressed.map((item) => `<div><span>${escapeHtml(item.comment || item.key)}</span><button data-ma11-action="restore-lorebook-entry" data-ma11-suppression-key="${escapeHtml(item.key)}">恢复发布</button></div>`).join("")}</section>` : "";
      })()}
      ${state?.lastSyncError ? `<div class="ma11-error-box">${escapeHtml(state.lastSyncError)}</div>` : ""}
      <dl class="ma11-meta"><dt>当前世界书</dt><dd>${escapeHtml(state?.lastLorebookName || "未建立")}</dd><dt>最近同步</dt><dd>${escapeHtml(state?.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString() : "尚未同步")}</dd></dl>
    </section>`;
}
function eventGraphNodeId(profile, graph) {
    const candidates = [profile.eventEntryId, profile.eventId].filter(Boolean);
    return graph.nodes.find((node) => node.id === `event-profile:${profile.eventId}`)?.id
        ?? graph.nodes.find((node) => node.type === "event" && candidates.some((id) => node.id.endsWith(`:${id}`)))?.id
        ?? graph.nodes.find((node) => node.type === "event" && node.label === profile.title)?.id
        ?? null;
}
function eventProfileSectionHtml(profiles, graph, compact = false) {
    const active = profiles.filter((profile) => profile.status === "active").length;
    const closed = profiles.length - active;
    const facts = profiles.reduce((sum, profile) => sum + profile.factCount, 0);
    const settling = profiles.reduce((sum, profile) => sum + profile.settlingEntryCount, 0);
    const query = graphSearchQuery.trim().toLocaleLowerCase();
    const visibleCount = profiles.filter((profile) => !query || [profile.title, profile.eventId, ...profile.relatedEntities, ...profile.currentResults].join(" ").toLocaleLowerCase().includes(query)).length;
    const cards = profiles.map((profile) => {
        const searchText = [profile.title, profile.eventId, ...profile.relatedEntities, ...profile.currentResults].join(" ").toLocaleLowerCase();
        const summaryState = profile.hasLargeSummary
            ? "已有大总结"
            : profile.smallSummaryCount
                ? `${profile.smallSummaryCount} 个有效小总结`
                : "尚无总结";
        const graphNodeId = eventGraphNodeId(profile, graph);
        return `<article class="ma11-card ma11-event-profile-card ${graphNodeId && selectedGraphNodeId === graphNodeId ? "selected" : ""}" data-ma11-event-profile data-ma11-event-profile-search="${escapeHtml(searchText)}">
      <header><div><b>${escapeHtml(profile.title)}</b><span>${escapeHtml(profile.eventId)}</span></div><span class="ma11-badge ${profile.status === "closed" ? "success" : "warning"}">${profile.status === "closed" ? "已形成结果" : "进行中"}</span></header>
      <div class="ma11-event-profile-metrics">
        <span><b>${profile.factCount}</b> 条事实</span><span><b>${profile.messageCount}</b> 条来源消息</span><span><b>${profile.relatedEntries.length}</b> 个关联条目</span><span><b>${profile.contentChars}</b> 字符材料</span>
      </div>
      <p><b>总结层：</b>${escapeHtml(summaryState)}${profile.settlingEntryCount ? ` · ${profile.settlingEntryCount} 个条目待结算` : ""}</p>
      ${profile.relatedEntities.length ? `<p><b>关联对象：</b>${escapeHtml(profile.relatedEntities.join("、"))}</p>` : ""}
      ${profile.currentResults.length ? `<div class="ma11-event-results"><b>明确结果</b><ul>${profile.currentResults.map((result) => `<li>${escapeHtml(result)}</li>`).join("")}</ul></div>` : `<p class="ma11-muted">尚未提取到明确结果；画像不会补全未知信息。</p>`}
      <footer><span>${profile.updatedAt ? `最近更新：${escapeHtml(profile.updatedAt)}` : "仅由现有事实派生"}</span>${graphNodeId ? `<button type="button" data-ma11-locate-graph-node="${escapeHtml(graphNodeId)}">在图谱中定位</button>` : ""}</footer>
    </article>`;
    }).join("");
    return `
    <section class="ma11-toolbar ma11-event-profile-toolbar"><div><h2>${compact ? "事件画像" : "事件画像"}</h2><p>由已提交事实、对象关联和总结版本实时派生；不调用模型，也不建立第二份记忆仓库。</p></div></section>
    <section class="ma11-card ma11-event-profile-overview">
      <div class="ma11-event-profile-stats"><span><b>${active}</b>进行中</span><span><b>${closed}</b>已形成结果</span><span><b>${facts}</b>事实</span><span><b>${settling}</b>待结算条目</span></div>
      <label class="ma11-search-field"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input data-ma11-event-profile-search-input value="${escapeHtml(graphSearchQuery)}" placeholder="搜索事件、对象或明确结果"/><output data-ma11-event-profile-match-count>${visibleCount} / ${profiles.length}</output></label>
    </section>
    <section class="ma11-event-profile-grid ${compact ? "compact" : ""}">${cards || `<article class="ma11-card ma11-empty-state"><b>暂无事件画像</b><p>完成状态提取后，事件画像会从现有事实自动出现。</p></article>`}</section>`;
}
async function memoryNetworkHtml(artifactInfo) {
    const settings = getSettings();
    const state = await getChatState(currentChatKey());
    // 记忆网络是聊天级当前视图，必须读取最近一次成功状态快照。
    // 当前选中消息可能只有审核/修正记录而没有 snapshot，直接使用它会把已有图谱误显示为空。
    const snapshotArtifact = latestSnapshotArtifact()
        ?? (artifactInfo?.artifact.snapshot ? artifactInfo : null);
    const snapshot = snapshotArtifact?.artifact.snapshot;
    const profiles = buildEventProfiles(snapshot, state.internalFacts, state.smallSummaries, state.largeSummaries, settings.tableRegistry);
    const baseGraph = buildRelationshipGraph(snapshot, settings.ui.graphScope, settings.tableRegistry);
    const graph = settings.ui.graphScope === "world"
        ? enrichRelationshipGraphWithEventProfiles(baseGraph, profiles)
        : baseGraph;
    const view = settings.ui.memoryView;
    return `
    <section class="ma11-toolbar ma11-memory-network-toolbar">
      <div><h2>记忆网络</h2><p>事件画像负责时间与结算，关系图谱负责对象联系；两者读取同一份事实和对象数据，不建立重复记忆。</p></div>
      <div class="ma11-segmented ma11-memory-view-switch" role="tablist" aria-label="记忆网络视图">
        <button type="button" class="${view === "combined" ? "active" : ""}" data-ma11-memory-view="combined">融合视图</button>
        <button type="button" class="${view === "events" ? "active" : ""}" data-ma11-memory-view="events">事件画像</button>
        <button type="button" class="${view === "graph" ? "active" : ""}" data-ma11-memory-view="graph">关系图谱</button>
      </div>
    </section>
    ${view === "events" ? eventProfileSectionHtml(profiles, graph) : ""}
    ${view === "graph" ? graphHtml(snapshotArtifact, profiles, graph) : ""}
    ${view === "combined" ? `<div class="ma11-memory-combined"><section class="ma11-memory-events-pane">${eventProfileSectionHtml(profiles, graph, true)}</section><section class="ma11-memory-graph-pane">${graphHtml(snapshotArtifact, profiles, graph)}</section></div>` : ""}`;
}
function connectionProfiles() {
    try {
        return listSupportedConnectionProfiles();
    }
    catch {
        return [];
    }
}
function connectionBlock(task, label) {
    const value = getSettings().connections[task];
    const profiles = connectionProfiles();
    const profileOptions = profiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${profile.id === value.profileId ? "selected" : ""}>${escapeHtml(profile.name)}${profile.model ? ` · ${escapeHtml(profile.model)}` : ""}</option>`).join("");
    const missingProfile = value.profileId && !profiles.some((profile) => profile.id === value.profileId)
        ? `<option value="${escapeHtml(value.profileId)}" selected>已删除或不受支持的配置</option>`
        : "";
    return `<div class="ma11-connection-row" data-ma11-connection="${task}">
    <b>${label}</b>
    <select data-ma11-connection-mode="${task}">
      <option value="current" ${value.mode === "current" ? "selected" : ""}>沿用当前聊天模型</option>
      <option value="profile" ${value.mode === "profile" ? "selected" : ""}>使用独立模型配置</option>
    </select>
    <select data-ma11-connection-profile-id="${task}" ${value.mode === "profile" ? "" : "hidden disabled"}><option value="">请选择Connection Profile</option>${missingProfile}${profileOptions}</select>
    <button data-ma11-test="${task}">测试</button>
  </div>`;
}
function settingsHtml() {
    const settings = getSettings();
    const tableLimitFields = enabledTables(settings.tableRegistry).map((table) => `
    <label>${escapeHtml(table.name)}单条上限 <small>发布到世界书的完整字符硬上限</small><input type="number" min="200" max="20000" step="50" data-ma11-entry-limit="${escapeHtml(table.key)}" value="${settings.contentLimits.tables[table.key] ?? 1200}" /></label>`).join("");
    return `
    <section class="ma11-toolbar"><div><h2>设置</h2><p>普通使用只需确认自动整理和模型分配；提取方向统一放在“模板”页。</p></div><div class="ma11-actions"><button data-ma11-action="open-rule-center">打开提取模板</button><button data-ma11-tab="diagnostics">运行诊断</button></div></section>
    <section class="ma11-card ma11-form-card ma11-quick-settings">
      <header><div><b>自动化与显示</b><span>推荐项已按开箱使用配置</span></div><span class="ma11-badge success">推荐</span></header>
      <div class="ma11-setting-tile-grid">
        <label class="ma11-setting-tile"><input type="checkbox" data-ma11-setting="enabled" ${settings.enabled ? "checked" : ""}/><span><b>启用镜渊</b><small>控制所有自动任务</small></span></label>
        <label class="ma11-setting-tile"><input type="checkbox" data-ma11-host-control="enabled" ${settings.hostControl.enabled ? "checked" : ""}/><span><b>统一接管 ST 记忆外围</b><small>默认由镜渊控制托管世界书、向量与递归</small></span></label>
        <label class="ma11-setting-tile"><input type="checkbox" data-ma11-host-control="vector" ${settings.hostControl.vector ? "checked" : ""}/><span><b>托管向量召回</b><small>关闭后事件条目退回关键词触发</small></span></label>
        <label class="ma11-setting-tile"><input type="checkbox" data-ma11-host-control="recursion" ${settings.hostControl.recursion ? "checked" : ""}/><span><b>托管递归触发</b><small>关闭后镜渊世界书条目禁止递归激活</small></span></label>
        <label class="ma11-setting-tile"><input type="checkbox" data-ma11-setting="autoState" ${settings.autoState ? "checked" : ""}/><span><b>自动状态表</b><small>每条新 AI 正文后更新当前事实</small></span></label>
        <label class="ma11-setting-tile"><input type="checkbox" data-ma11-setting="autoSmallSummary" ${settings.autoSmallSummary ? "checked" : ""}/><span><b>自动小总结</b><small>整理并写入近期经历</small></span></label>
        <label class="ma11-setting-tile"><input type="checkbox" data-ma11-setting="autoLargeSummary" ${settings.autoLargeSummary ? "checked" : ""}/><span><b>自动大总结</b><small>固化并写入历史事实</small></span></label>
        <label class="ma11-setting-tile"><input type="checkbox" data-ma11-setting="showMessagePanel" ${settings.showMessagePanel ? "checked" : ""}/><span><b>正文状态条</b><small>显示每条正文的处理状态</small></span></label>
      </div>
      <div class="ma11-editor-grid ma11-setting-number-grid">
        <label>小总结新增回合阈值 <small>只统计上次成功总结后的新回合</small><input type="number" min="8" max="30" data-ma11-setting="smallSummaryTurns" value="${settings.smallSummaryTurns}" /></label>
        <label>大总结所需小总结数 <small>达到后重新审查长期资格</small><input type="number" min="1" max="30" data-ma11-setting="largeSummaryCount" value="${settings.largeSummaryCount}" /></label>
        <label>模型请求超时 <small>单位：毫秒</small><input type="number" min="10000" max="300000" step="1000" data-ma11-setting="requestTimeoutMs" value="${settings.requestTimeoutMs}" /></label>
        <label>状态请求字符预算 <small>提示词与本轮上下文合计；超出后自动分段</small><input type="number" min="6000" max="60000" step="1000" data-ma11-setting="stateContextChars" value="${settings.stateContextChars}" /></label>
        <label>状态输出 Token 上限 <small>中模型或慢网关建议 2048–3072</small><input type="number" min="768" max="8192" step="256" data-ma11-setting="stateOutputTokens" value="${settings.stateOutputTokens}" /></label>
        <label>状态失败分段长度 <small>仅在超时或格式失败时拆分本轮正文</small><input type="number" min="1800" max="16000" step="200" data-ma11-setting="stateChunkChars" value="${settings.stateChunkChars}" /></label>
      </div>
    </section>
    <section class="ma11-card ma11-form-card ma11-content-limit-settings">
      <header><div><b>记忆正文硬上限</b><span>白盒配置；超限内容必须先压缩或分层，不允许无条件继续膨胀</span></div></header>
      <p class="ma11-help">对象上限控制发布到世界书的单条正文；小总结和大总结上限控制模型返回正文。内部事实不会从中间硬截断，也不会为此扫描整个仓库。</p>
      <div class="ma11-editor-grid ma11-setting-number-grid">
        ${tableLimitFields}
        <label>小总结单条上限 <small>每个事件当前有效的小总结正文</small><input type="number" min="200" max="10000" step="50" data-ma11-summary-limit="smallSummary" value="${settings.contentLimits.smallSummary}" /></label>
        <label>大总结单条上限 <small>每个事件长期固化正文</small><input type="number" min="300" max="20000" step="50" data-ma11-summary-limit="largeSummary" value="${settings.contentLimits.largeSummary}" /></label>
      </div>
    </section>
    <section class="ma11-card ma11-form-card ma11-model-settings">
      <header><div><b>任务模型分配</b><span>默认沿用当前聊天模型；需要隔离时再指定独立配置</span></div></header>
      ${connectionBlock("audit", "规则审核")}
      ${connectionBlock("revision", "定向修正")}
      ${connectionBlock("state", "状态表提取")}
      ${connectionBlock("smallSummary", "小总结")}
      ${connectionBlock("largeSummary", "大总结")}
      <p class="ma11-help">“测试”会验证连接与固定文本遵循情况。API 地址和密钥仍由 SillyTavern 管理，镜渊不单独保存。</p>
    </section>
    <section class="ma11-card ma11-form-card ma11-maintenance-card">
      <header><b>维护</b><span>不会影响其他聊天</span></header>
      <div class="ma11-actions">
        <button data-ma11-action="restart-plugin">重建插件缓存</button>
        <button class="danger" data-ma11-action="reset-current-game">重置当前聊天记忆</button>
      </div>
      <p class="ma11-help">重建缓存不会删除数据。重置当前聊天会删除本聊天的镜渊表格、总结、审核记录及镜渊世界书条目，之后需要重新整理。</p>
    </section>`;
}
async function diagnosticsHtml() {
    const checks = await runDiagnostics();
    const info = currentArtifact();
    const settings = getSettings();
    const promptMap = {
        state: stateSystemPrompt(settings.tableRegistry, settings.statePrompts, settings.contentLimits, settings.tableLinkRules),
        small: smallSummarySystemPrompt(settings.summaryPrompts.small, settings.contentLimits.smallSummary),
        large: largeSummarySystemPrompt(settings.summaryPrompts.large, settings.contentLimits.largeSummary),
        audit: `${auditSystemPrompt()}

【玩家审核规则】
${settings.auditPrompt || "（未填写）"}`,
        revision: revisionSystemPrompt(settings.revisionPrompt),
    };
    const selectedPrompt = promptMap[diagnosticPromptKind];
    return `
    <section class="ma11-toolbar"><div><h2>运行诊断</h2><p>先看检查结论；只有定位具体阶段时才使用下方调试工具。</p></div><div class="ma11-actions"><button data-ma11-action="refresh-diagnostics">刷新</button><button data-ma11-action="copy-diagnostics">复制诊断</button></div></section>
    <section class="ma11-check-grid">${checks.map((check) => `<article class="ma11-check ${check.status}"><span></span><div><b>${escapeHtml(check.label)}</b><p>${escapeHtml(check.detail)}</p></div></article>`).join("")}</section>
    <section class="ma11-card ma11-debug-tools">
      <header><b>单阶段排错</b><span>不会改变其他阶段的设置</span></header>
      ${stageActionButtonsHtml(info)}
    </section>
    <section class="ma11-card ma11-form-card ma11-prompt-inspector">
      <header><div><b>提示词调试预览</b><span>只读显示实际发送的系统规则；普通设置页不暴露固定协议</span></div><button data-ma11-action="copy-current-prompt">复制当前提示词</button></header>
      <label>选择任务<select data-ma11-prompt-inspector>
        <option value="state" ${diagnosticPromptKind === "state" ? "selected" : ""}>事实提取与表格</option>
        <option value="small" ${diagnosticPromptKind === "small" ? "selected" : ""}>近期事件总结</option>
        <option value="large" ${diagnosticPromptKind === "large" ? "selected" : ""}>长期事实固化</option>
        <option value="audit" ${diagnosticPromptKind === "audit" ? "selected" : ""}>规则审核</option>
        <option value="revision" ${diagnosticPromptKind === "revision" ? "selected" : ""}>定向修正</option>
      </select></label>
      <textarea readonly rows="24" data-ma11-current-prompt>${escapeHtml(selectedPrompt)}</textarea>
    </section>`;
}
async function renderWorkspace() {
    const workspace = document.querySelector("#ma11-workspace");
    if (!workspace || workspace.hidden)
        return;
    if (rendering) {
        renderAgain = true;
        return;
    }
    rendering = true;
    workspaceRenderDeferred = false;
    const renderChatKey = currentChatKey();
    try {
        const settings = getSettings();
        const info = currentArtifact();
        const activeMeta = workspaceTabMeta(settings.ui.activeTab);
        const contentPanel = workspace.querySelector("#ma11-workspace-content");
        contentPanel?.setAttribute("aria-label", `${activeMeta.label}：${activeMeta.description}`);
        workspace
            .querySelectorAll("[data-ma11-tab]")
            .forEach((button) => {
            const active = button.dataset.ma11Tab === activeMeta.key;
            button.classList.toggle("active", active);
            button.setAttribute("aria-selected", String(active));
            if (active)
                button.setAttribute("aria-current", "page");
            else
                button.removeAttribute("aria-current");
        });
        scrollActiveWorkspaceTabIntoView(workspace, activeMeta.key);
        let html = "";
        if (settings.ui.activeTab === "overview")
            html = await overviewHtml(info);
        if (settings.ui.activeTab === "tables")
            html = await tableHtml(info);
        if (settings.ui.activeTab === "tableManager")
            html = tableManagerHtml(info);
        if (settings.ui.activeTab === "graph")
            html = await memoryNetworkHtml(info);
        if (settings.ui.activeTab === "summaries")
            html = await summariesHtml();
        if (settings.ui.activeTab === "audit")
            html = auditHtml();
        if (settings.ui.activeTab === "sync")
            html = await syncHtml();
        if (settings.ui.activeTab === "settings")
            html = settingsHtml();
        if (settings.ui.activeTab === "diagnostics")
            html = await diagnosticsHtml();
        if (!workspace.isConnected || currentChatKey() !== renderChatKey) {
            renderAgain = true;
            return;
        }
        const content = workspace.querySelector("#ma11-workspace-content");
        if (content) {
            const scrollTop = content.scrollTop;
            const tableScrollLeft = content.querySelector(".ma11-table-wrap")?.scrollLeft ?? 0;
            content.innerHTML = html;
            content.scrollTop = scrollTop;
            const tableWrap = content.querySelector(".ma11-table-wrap");
            if (tableWrap)
                tableWrap.scrollLeft = tableScrollLeft;
            if (settings.ui.activeTab === "tables")
                applyTableSearch(workspace, tableSearchQuery);
            if (settings.ui.activeTab === "graph") {
                applyEventProfileSearch(workspace, graphSearchQuery);
                applyGraphSearch(workspace, graphSearchQuery);
            }
        }
    }
    catch (error) {
        if (currentChatKey() !== renderChatKey) {
            renderAgain = true;
            return;
        }
        const message = toErrorMessage(error);
        const content = workspace.querySelector("#ma11-workspace-content");
        if (content) {
            content.innerHTML = `<section class="ma11-card"><header><b>界面加载失败</b></header><p class="ma11-message-error">${escapeHtml(message)}</p><div class="ma11-actions"><button data-ma11-action="refresh-diagnostics">重新加载</button></div></section>`;
        }
        console.error("[MirrorAbyss] workspace render failed", error);
    }
    finally {
        rendering = false;
        if (renderAgain) {
            renderAgain = false;
            queueMicrotask(() => void renderWorkspace());
        }
    }
}
function setTab(tab) {
    const settings = getSettings();
    settings.ui.activeTab = tab;
    saveSettings();
    void renderWorkspace();
}
function editableArtifact() {
    if (!getSettings().enabled)
        throw new Error("镜渊已关闭，请先启用");
    if (editorChatKey && currentChatKey() !== editorChatKey) {
        throw new Error("聊天已切换，本次编辑不再保存");
    }
    const info = currentArtifact();
    if (workspacePipelineBusy(info))
        throw new Error("镜渊仍有任务在处理，请完成后再编辑");
    const latest = latestSnapshotArtifact();
    if (!info?.artifact.snapshot || !latest || info.artifact.messageKey !== latest.artifact.messageKey) {
        throw new Error("历史状态表只读，只能编辑最新成功状态表");
    }
    if (editorMessageKey && info.artifact.messageKey !== editorMessageKey) {
        throw new Error("编辑目标已经变化，请重新打开编辑器");
    }
    assertArtifactCommitCurrent(info.artifact);
    return info;
}
function applyRowEditorTable(form, tableKey) {
    const tableDefinition = tableByKey(getSettings().tableRegistry, tableKey);
    if (tableDefinition) {
        const labels = {
            title: customizedFieldLabel(tableDefinition, "title", "对象"),
            content: customizedFieldLabel(tableDefinition, "content", "当前事实"),
            status: customizedFieldLabel(tableDefinition, "status", "状态"),
            keywords: `${customizedFieldLabel(tableDefinition, "keywords", "关键词")}（逗号分隔）`,
        };
        for (const [fieldKey, label] of Object.entries(labels)) {
            const target = form.querySelector(`[data-ma11-row-field-label="${fieldKey}"]`);
            if (target)
                target.textContent = label;
        }
    }
    const supportsLifecycle = ["characters", "state"].includes(tableDefinition?.role || "");
    const characterObjectFields = form.querySelector("[data-ma11-character-object-fields]");
    const lifecycleFields = form.querySelector("[data-ma11-lifecycle-fields]");
    if (characterObjectFields)
        characterObjectFields.hidden = !supportsLifecycle;
    if (lifecycleFields)
        lifecycleFields.hidden = !supportsLifecycle;
}
function openRowEditor(tableKey, row) {
    const info = currentArtifact();
    editorChatKey = currentChatKey();
    editorMessageKey = info?.artifact.messageKey ?? null;
    const workspace = root();
    const backdrop = workspace.querySelector(".ma11-editor-backdrop");
    const form = workspace.querySelector("#ma11-row-editor");
    const tableDefinition = tableByKey(getSettings().tableRegistry, tableKey);
    const targetTable = form.elements.namedItem("targetTableKey");
    targetTable.innerHTML = enabledTables(getSettings().tableRegistry)
        .map((table) => `<option value="${escapeHtml(table.key)}">${escapeHtml(table.name)}</option>`)
        .join("");
    targetTable.value = tableKey;
    applyRowEditorTable(form, tableKey);
    form.elements.namedItem("tableKey").value = tableKey;
    form.elements.namedItem("rowId").value = row?.id || "";
    form.elements.namedItem("title").value =
        row?.title || "";
    form.elements.namedItem("content").value =
        row?.content || "";
    form.elements.namedItem("status").value =
        row?.status || "active";
    form.elements.namedItem("keywords").value =
        row?.keywords.join(", ") || "";
    form.elements.namedItem("locked").checked = row?.locked ?? false;
    const objectFields = row?.fields ?? {};
    const setList = (name, value) => {
        form.elements.namedItem(name).value = Array.isArray(value) ? value.join("\n") : String(value ?? "");
    };
    setList("baseContent", objectFields.baseContent);
    setList("solidifiedHistory", objectFields.solidifiedHistory);
    setList("currentStates", objectFields.currentStates);
    setList("relatedObjects", objectFields.relatedObjects);
    setList("relatedEvents", objectFields.relatedEvents);
    setList("relationshipStates", objectFields.relationshipStates);
    setList("abilityStates", objectFields.abilityStates);
    const life = row?.lifecycle;
    form.elements.namedItem("existence").value = life?.existence || "未标注";
    form.elements.namedItem("activity").value = life?.activity || "未标注";
    form.elements.namedItem("memory").value = life?.memory || "未标注";
    form.elements.namedItem("evidenceLevel").value = life?.evidenceLevel || "未知";
    form.elements.namedItem("evidence").value = life?.evidence || "";
    form.elements.namedItem("returnConditions").value = life?.returnConditions.join("\n") || "";
    form.elements.namedItem("returnBlockers").value = life?.returnBlockers.join("\n") || "";
    backdrop.hidden = false;
    form.elements.namedItem("title").focus();
}
function closeEditor() {
    const workspace = document.querySelector("#ma11-workspace");
    const backdrop = workspace?.querySelector(".ma11-editor-backdrop");
    if (backdrop)
        backdrop.hidden = true;
    editorChatKey = null;
    editorMessageKey = null;
}
async function saveRow(form) {
    const info = editableArtifact();
    const sourceTableKey = form.elements.namedItem("tableKey")
        .value;
    const tableKey = form.elements.namedItem("targetTableKey")
        .value;
    const rowId = form.elements.namedItem("rowId").value;
    const title = form.elements.namedItem("title").value.trim();
    const content = form.elements.namedItem("content").value.trim();
    const status = form.elements.namedItem("status").value.trim();
    const keywords = form.elements.namedItem("keywords").value
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
    const locked = form.elements.namedItem("locked").checked;
    const supportsLifecycle = ["characters", "state"].includes(tableByKey(getSettings().tableRegistry, tableKey)?.role || "");
    const listFrom = (name) => form.elements.namedItem(name).value
        .split(/\n|[；;]/)
        .map((item) => item.trim())
        .filter(Boolean);
    const lifecycle = supportsLifecycle ? {
        existence: form.elements.namedItem("existence").value,
        activity: form.elements.namedItem("activity").value,
        memory: form.elements.namedItem("memory").value,
        evidenceLevel: form.elements.namedItem("evidenceLevel").value,
        evidence: form.elements.namedItem("evidence").value.trim(),
        returnConditions: listFrom("returnConditions"),
        returnBlockers: listFrom("returnBlockers"),
    } : undefined;
    const fields = {
        baseContent: form.elements.namedItem("baseContent").value.trim(),
        solidifiedHistory: listFrom("solidifiedHistory"),
        currentStates: listFrom("currentStates"),
        relatedObjects: listFrom("relatedObjects"),
        relatedEvents: listFrom("relatedEvents"),
    };
    if (supportsLifecycle) {
        fields.relationshipStates = listFrom("relationshipStates");
        fields.abilityStates = listFrom("abilityStates");
    }
    // 未勾选“完全锁定”时写成 base 锁：玩家基础保留，后续明确事实仍可更新 currentStates 等可变层。
    const rowPatch = {
        id: rowId || undefined,
        title,
        content,
        status,
        keywords,
        locked,
        lockMode: locked ? "all" : "base",
        lifecycle,
        fields,
    };
    info.artifact.snapshot = rowId && sourceTableKey !== tableKey
        ? moveManualRow(info.artifact.snapshot, sourceTableKey, tableKey, rowId, rowPatch, getSettings().tableRegistry)
        : upsertManualRow(info.artifact.snapshot, tableKey, rowPatch, getSettings().tableRegistry);
    if (rowId) {
        const canonical = (info.artifact.snapshot[tableKey] ?? []).find((row) => canonicalObjectTitle(row.title) === canonicalObjectTitle(title));
        if (canonical && canonical.id !== rowId) {
            const chatState = await getChatState(info.artifact.chatKey);
            if (chatState.focusObjectId === rowId) {
                chatState.focusObjectId = canonical.id;
                await putChatState(chatState);
            }
        }
    }
    const message = getMessage(info.index);
    if (message)
        attachArtifactToMessage(message, info.artifact);
    await putArtifact(info.artifact);
    await persistChatFor(info.artifact.chatKey);
    assertArtifactCommitCurrent(info.artifact);
    if (getSettings().lorebookSync)
        await retryStage(info.index, "sync");
    closeEditor();
    await renderWorkspace();
}
async function deleteRowAction(rowId) {
    const info = editableArtifact();
    const tableKey = getSettings().ui.activeTable;
    if (!confirm("确定删除这条状态吗？"))
        return;
    info.artifact.snapshot = deleteRow(info.artifact.snapshot, tableKey, rowId, getSettings().tableRegistry);
    const chatState = await getChatState(info.artifact.chatKey);
    if (chatState.focusObjectId === rowId) {
        chatState.focusObjectId = undefined;
        await putChatState(chatState);
    }
    const message = getMessage(info.index);
    if (message)
        attachArtifactToMessage(message, info.artifact);
    await putArtifact(info.artifact);
    await persistChatFor(info.artifact.chatKey);
    assertArtifactCommitCurrent(info.artifact);
    if (getSettings().lorebookSync)
        await retryStage(info.index, "sync");
    await renderWorkspace();
}
async function updateTableRegistryAndSync(registry) {
    const settings = getSettings();
    settings.tableRegistry = normalizeTableRegistry(registry);
    settings.tableLinkRules = normalizeTableLinkRules(settings.tableLinkRules, settings.tableRegistry);
    const active = enabledTables(settings.tableRegistry);
    if (!active.some((table) => table.key === settings.ui.activeTable))
        settings.ui.activeTable = active[0]?.key || "";
    settings.migration.dynamicTablesV23 = true;
    saveSettings();
    renderAllMessagePanels();
    const latest = latestSnapshotArtifact();
    if (settings.lorebookSync && latest && !readHistoryWorkflow(await getChatState(latest.artifact.chatKey)).blocked) {
        try {
            await retryStage(latest.index, "sync");
        }
        catch (error) {
            toast("warning", `表格设置已保存，但世界书刷新失败：${toErrorMessage(error)}`);
        }
    }
    await renderWorkspace();
}
async function updateTableLinkRulesAndRender(linkRules) {
    const settings = getSettings();
    settings.tableLinkRules = normalizeTableLinkRules(linkRules, settings.tableRegistry);
    settings.migration.tableLinksV40 = true;
    saveSettings();
    await renderWorkspace();
}
function valueFromWorkspace(workspace, selector) {
    return workspace.querySelector(selector)?.value.trim() || "";
}
function applyTableSearch(workspace, value) {
    tableSearchQuery = value.trim().toLocaleLowerCase();
    const mobile = typeof window !== "undefined" && window.matchMedia?.("(max-width: 700px)").matches;
    const rows = Array.from(workspace.querySelectorAll(mobile ? "[data-ma11-table-card-search]" : "[data-ma11-table-row-search]"));
    let visible = 0;
    for (const row of rows) {
        const matches = !tableSearchQuery || String(mobile ? row.dataset.ma11TableCardSearch || "" : row.dataset.ma11TableRowSearch || "").includes(tableSearchQuery);
        row.hidden = !matches;
        if (matches)
            visible += 1;
    }
    const output = workspace.querySelector("[data-ma11-table-visible-count]");
    if (output)
        output.value = `${visible} / ${rows.length}`;
}
function applyEventProfileSearch(workspace, value) {
    graphSearchQuery = value.trim().toLocaleLowerCase();
    const cards = Array.from(workspace.querySelectorAll("[data-ma11-event-profile]"));
    let visible = 0;
    for (const card of cards) {
        const matches = !graphSearchQuery || String(card.dataset.ma11EventProfileSearch || "").includes(graphSearchQuery);
        card.hidden = !matches;
        if (matches)
            visible += 1;
    }
    const output = workspace.querySelector("[data-ma11-event-profile-match-count]");
    if (output)
        output.value = `${visible} / ${cards.length}`;
}
function applyGraphSearch(workspace, value) {
    graphSearchQuery = value.trim().toLocaleLowerCase();
    const matched = new Set();
    const nodes = Array.from(workspace.querySelectorAll("[data-ma11-graph-node]"));
    for (const node of nodes) {
        const matches = !graphSearchQuery || String(node.dataset.ma11GraphSearchText || "").includes(graphSearchQuery);
        node.classList.toggle("dimmed", Boolean(graphSearchQuery && !matches));
        node.classList.toggle("search-match", Boolean(graphSearchQuery && matches));
        if (matches && node.dataset.ma11GraphNode)
            matched.add(node.dataset.ma11GraphNode);
    }
    const edges = Array.from(workspace.querySelectorAll("[data-ma11-graph-edge-source]"));
    for (const edge of edges) {
        const connected = matched.has(String(edge.dataset.ma11GraphEdgeSource || "")) || matched.has(String(edge.dataset.ma11GraphEdgeTarget || ""));
        edge.classList.toggle("dimmed", Boolean(graphSearchQuery && !connected));
    }
    const output = workspace.querySelector("[data-ma11-graph-match-count]");
    if (output)
        output.value = `${matched.size} / ${nodes.length}`;
}
function announceWorkspace(workspace, message) {
    const live = workspace.querySelector("[data-ma11-live]");
    if (live)
        live.textContent = message;
}
function updateSetting(target) {
    const key = target.dataset.ma11Setting;
    if (!key)
        return;
    const settings = getSettings();
    const value = target instanceof HTMLInputElement && target.type === "checkbox"
        ? target.checked
        : target instanceof HTMLInputElement && target.type === "number"
            ? Number(target.value)
            : target.value;
    settings[key] = value;
    saveSettings();
    if (key === "enabled") {
        setRequestAcceptance(Boolean(value));
        taskQueue.setAccepting(Boolean(value));
        if (!value)
            abortActiveRequests();
        const quick = document.querySelector('[data-ma11-quick-setting="enabled"]');
        if (quick)
            quick.checked = Boolean(value);
        renderAllMessagePanels();
        void renderWorkspace();
    }
    if (key === "showMessagePanel")
        renderAllMessagePanels();
    if (key === "lorebookLayout")
        void renderWorkspace();
}
function updateHostControl(target) {
    const key = target.dataset.ma11HostControl;
    if (!key)
        return;
    getSettings().hostControl[key] = target.checked;
    saveSettings();
    void renderWorkspace();
}
function updateConnection(target) {
    const modeTask = target.dataset.ma11ConnectionMode;
    const profileTask = target.dataset.ma11ConnectionProfileId;
    const settings = getSettings();
    let shouldRender = false;
    if (modeTask) {
        settings.connections[modeTask].mode = target.value;
        shouldRender = true;
    }
    if (profileTask) {
        settings.connections[profileTask].profileId = safeText(target.value, 160).trim();
        const selected = connectionProfiles().find((profile) => profile.id === settings.connections[profileTask].profileId);
        settings.connections[profileTask].profile = selected?.name || '';
    }
    saveSettings();
    if (shouldRender)
        void renderWorkspace();
}
function bindWorkspace(workspace) {
    workspace.addEventListener("click", async (event) => {
        const target = event.target;
        const tab = target.closest("[data-ma11-tab]")?.dataset.ma11Tab;
        if (tab)
            return setTab(tab);
        const action = target.closest("[data-ma11-action]")?.dataset.ma11Action;
        const actionButton = action ? target.closest("[data-ma11-action]") : null;
        const testButton = target.closest("[data-ma11-test]");
        const busyButton = actionButton ?? testButton;
        const originalButtonText = busyButton?.textContent ?? "";
        const pipelineAction = [
            "process-latest", "recalculate-history", "run-audit", "run-revision", "run-state",
            "force-small", "force-large", "sync-now", "maintain-lorebook", "start-play-recording", "restore-lorebook-entry", "set-focus", "clear-focus",
        ].includes(action || "");
        if (pipelineAction && workspacePipelineBusy())
            return;
        if (pipelineAction) {
            workspacePipelineActionPending = true;
            scheduleWorkspaceRender();
        }
        try {
            if (busyButton && !["close", "open-tables", "open-graph", "close-editor"].includes(action || "")) {
                busyButton.disabled = true;
                busyButton.setAttribute("aria-busy", "true");
                busyButton.textContent = "处理中…";
            }
            if (action === "close") {
                closeWorkspace();
                return;
            }
            if (action === "open-tables")
                setTab("tables");
            if (action === "open-graph")
                setTab("graph");
            if (action === "open-table-manager")
                setTab("tableManager");
            if (action === "open-rule-center")
                setTab("tableManager");
            if (action === "open-prompt-diagnostics") {
                diagnosticPromptKind = "state";
                setTab("diagnostics");
            }
            if (action === "start-play-recording") {
                const state = await getChatState(currentChatKey());
                const existing = recordingStartIndex(state) !== undefined;
                const warning = existing
                    ? "重新设置起点会清空当前聊天已有的镜渊事实、总结、状态表和托管世界书条目。是否继续？"
                    : "将从下一条新消息开始记录；当前已有聊天内容不会进入镜渊记忆。是否继续？";
                if (!window.confirm(warning))
                    return;
                const result = await beginPlayRecording();
                toast("success", `游玩记录起点已设置；从第 ${result.boundary.startIndex + 1} 条消息起生效`);
                selectedMessageIndex = null;
                await renderWorkspace();
            }
            if (action === "restore-lorebook-entry") {
                const key = actionButton?.dataset.ma11SuppressionKey || "";
                if (!key)
                    throw new Error("无法确定需要恢复的世界书条目");
                await restoreSuppressedLorebookEntry(key);
                toast("success", "世界书条目已恢复发布");
                await renderWorkspace();
            }
            if (action === "process-latest") {
                if (!getSettings().enabled)
                    throw new Error("镜渊已关闭，请先启用");
                const index = latestAssistantIndex();
                if (index < 0)
                    throw new Error("没有可整理的AI正文");
                selectedMessageIndex = index;
                await processMessage(index, false);
                await renderWorkspace();
            }
            if (action === "recalculate-history") {
                const state = await getChatState(currentChatKey());
                if (readHistoryWorkflow(state).startIndex === undefined) {
                    const answer = window.prompt(`请输入重算起点（1-${Math.max(1, getChat().length)}）`, "1");
                    if (answer === null)
                        return;
                    const start = Number(answer);
                    if (!Number.isInteger(start) || start < 1 || start > Math.max(1, getChat().length)) {
                        throw new Error("重算起点必须是当前聊天范围内的消息序号");
                    }
                    await chooseHistoryRecalculationStart(start - 1);
                }
                await recalculateInvalidatedHistory();
                selectedMessageIndex = null;
                await renderWorkspace();
            }
            const stageCommand = action ? resolveWorkspaceStageCommand(action) : null;
            if (stageCommand?.kind === "retry") {
                const index = latestAssistantIndex();
                if (index < 0)
                    throw new Error("没有可处理的AI正文");
                selectedMessageIndex = index;
                await retryStage(index, stageCommand.stage);
                await renderWorkspace();
            }
            if (stageCommand?.kind === "summary") {
                const info = latestSnapshotArtifact();
                if (!info)
                    throw new Error("尚无可总结的状态");
                await forceSummary(info.index, stageCommand.summary);
                await renderWorkspace();
            }
            if (action === "sync-now") {
                const info = latestSnapshotArtifact();
                if (!info)
                    throw new Error("尚无可同步的状态");
                await retryStage(info.index, "sync");
                await renderWorkspace();
            }
            if (action === "maintain-lorebook") {
                const info = latestSnapshotArtifact();
                if (!info)
                    throw new Error("尚无可同步的状态");
                const preview = await previewLorebookMaintenance(info.index);
                const warning = [
                    `检测到 ${preview.legacyCandidates} 个历史候选，其中 ${preview.removable} 个可安全处理。`,
                    `将保留 ${preview.protectedForeign} 个其他聊天条目和 ${preview.protectedUnknown} 个共享书 owner 未知条目。`,
                    "确认后将按对象清理并重新发布当前真实快照。",
                ].join("\n");
                if (!window.confirm(warning))
                    return;
                await applyLorebookMaintenance(info.index);
                await renderWorkspace();
            }
            if (action === "save-summary-prompt" || action === "restore-summary-prompt") {
                const kind = actionButton?.dataset.ma11SummaryKind;
                if (!kind)
                    throw new Error("无法确定总结提示词类型");
                const settings = getSettings();
                if (action === "restore-summary-prompt") {
                    settings.summaryPrompts[kind] = structuredClone(DEFAULT_SUMMARY_PROMPTS[kind]);
                    saveSettings();
                    toast("success", `${kind === 'small' ? '小总结' : '大总结'}提示词已恢复默认`);
                    await renderWorkspace();
                }
                else {
                    const next = { ...settings.summaryPrompts[kind] };
                    for (const section of ['coreQuestion', 'includeRules', 'excludeRules', 'updateRules', 'expressionRules']) {
                        const input = workspace.querySelector(`[data-ma11-summary-prompt="${kind}"][data-ma11-summary-section="${section}"]`);
                        const value = safeText(input?.value, 6000).trim();
                        if (!value)
                            throw new Error(`${kind === 'small' ? '小总结' : '大总结'}的“${section}”不能为空`);
                        next[section] = value;
                    }
                    settings.summaryPrompts[kind] = next;
                    saveSettings();
                    toast("success", `${kind === 'small' ? '小总结' : '大总结'}提示词已保存`);
                    await renderWorkspace();
                }
            }
            if (action === "restore-standard-rules") {
                const settings = getSettings();
                settings.summaryPrompts = structuredClone(DEFAULT_SUMMARY_PROMPTS);
                saveSettings();
                toast("success", "总结压缩规则已恢复默认");
                await renderWorkspace();
            }
            if (action === "import-header-template") {
                workspace.querySelector("[data-ma11-template-import]")?.click();
            }
            if (action === "export-header-template") {
                exportHeaderTemplate();
                toast("success", "表头模板已导出");
            }
            if (action === "restore-default-template") {
                if (window.confirm("恢复默认模板会替换当前表头与联动规则；已有聊天事实和总结不会删除。是否继续？")) {
                    const settings = getSettings();
                    const registry = restoreDefaultTableRegistry();
                    settings.tableLinkRules = restoreDefaultTableLinkRules(registry);
                    await updateTableRegistryAndSync(registry);
                    toast("success", "已恢复镜渊默认表头模板");
                }
            }
            const linkRuleId = actionButton?.dataset.ma11LinkRuleId || "";
            if (action === "create-link-rule") {
                const source = workspace.querySelector("[data-ma11-new-link-source]")?.value || "";
                const targets = selectedLinkTargets(workspace, "[data-ma11-new-link-target]");
                await updateTableLinkRulesAndRender(createTableLinkRule(getSettings().tableLinkRules, getSettings().tableRegistry, source, targets));
                toast("success", "联动规则已新增");
            }
            if (action === "save-link-rule" && linkRuleId) {
                const source = workspace.querySelector(`[data-ma11-link-source="${linkRuleId}"]`)?.value || "";
                const targets = selectedLinkTargets(workspace, `[data-ma11-link-target="${linkRuleId}"]`);
                const enabled = Boolean(workspace.querySelector(`[data-ma11-link-enabled="${linkRuleId}"]`)?.checked);
                await updateTableLinkRulesAndRender(updateTableLinkRule(getSettings().tableLinkRules, getSettings().tableRegistry, linkRuleId, { sourceTableKey: source, targetTableKeys: targets, enabled }));
                toast("success", "联动规则已保存");
            }
            if (action === "delete-link-rule" && linkRuleId) {
                if (window.confirm("确定删除这条联动规则吗？")) {
                    await updateTableLinkRulesAndRender(removeTableLinkRule(getSettings().tableLinkRules, getSettings().tableRegistry, linkRuleId));
                    toast("success", "联动规则已删除");
                }
            }
            const tableDefinitionKey = actionButton?.dataset.ma11TableKey || "";
            if (action === "create-table") {
                const name = valueFromWorkspace(workspace, "[data-ma11-new-table-name]");
                const purpose = valueFromWorkspace(workspace, "[data-ma11-new-table-purpose]");
                const fields = valueFromWorkspace(workspace, "[data-ma11-new-table-fields]");
                if (!name)
                    throw new Error("请填写表格名称");
                await updateTableRegistryAndSync(createCustomTable(getSettings().tableRegistry, name, purpose, fields));
                toast("success", "表头已新增，将从下一次状态提取开始生效");
            }
            if (action === "save-table" && tableDefinitionKey) {
                const name = valueFromWorkspace(workspace, `[data-ma11-table-name="${tableDefinitionKey}"]`);
                const purpose = valueFromWorkspace(workspace, `[data-ma11-table-purpose="${tableDefinitionKey}"]`);
                const headers = valueFromWorkspace(workspace, `[data-ma11-table-headers="${tableDefinitionKey}"]`);
                const fields = valueFromWorkspace(workspace, `[data-ma11-table-fields="${tableDefinitionKey}"]`);
                if (!name || !purpose)
                    throw new Error("表格名称和用途说明不能为空");
                let registry = updateTableDefinition(getSettings().tableRegistry, tableDefinitionKey, { name, purpose });
                registry = updateTableHeaders(registry, tableDefinitionKey, headers);
                registry = updateTableFields(registry, tableDefinitionKey, fields);
                await updateTableRegistryAndSync(registry);
                toast("success", "表头提示词已更新，将从下一次状态提取开始生效");
            }
            if (action === "move-table-up" && tableDefinitionKey)
                await updateTableRegistryAndSync(moveTableDefinition(getSettings().tableRegistry, tableDefinitionKey, -1));
            if (action === "move-table-down" && tableDefinitionKey)
                await updateTableRegistryAndSync(moveTableDefinition(getSettings().tableRegistry, tableDefinitionKey, 1));
            if (action === "delete-table" && tableDefinitionKey) {
                const definition = tableByKey(getSettings().tableRegistry, tableDefinitionKey);
                const warning = definition?.isDefault
                    ? `确定删除默认表头“${definition.name}”吗？已有内部事实、事件线、小总结和大总结不会删除。`
                    : `确定删除新增表头“${definition?.name || tableDefinitionKey}”吗？内部事实和总结不会删除。`;
                if (window.confirm(warning))
                    await updateTableRegistryAndSync(removeTableDefinition(getSettings().tableRegistry, tableDefinitionKey));
            }
            if (action === "set-focus" || action === "clear-focus") {
                const rowId = actionButton?.dataset.ma11FocusRow || "";
                const info = latestSnapshotArtifact();
                if (!info?.artifact.snapshot)
                    throw new Error("尚无可设置焦点的角色视图");
                const registry = normalizeTableRegistry(getSettings().tableRegistry);
                const characterTable = registry.find((table) => ["characters", "state"].includes(table.role));
                if (!characterTable)
                    throw new Error("当前没有角色视图");
                const row = (info.artifact.snapshot[characterTable.key] ?? []).find((item) => item.id === rowId);
                if (action === "set-focus" && !row)
                    throw new Error("焦点目标不是当前角色条目");
                const state = await getChatState(info.artifact.chatKey);
                // 焦点只是聊天级 constant 开关：不写角色正文、不改状态、不触发任何模型任务。
                state.focusObjectId = action === "set-focus" ? rowId : undefined;
                await putChatState(state);
                if (getSettings().lorebookSync)
                    await retryStage(info.index, "sync");
                toast("success", action === "set-focus" ? `已将“${row?.title || "角色"}”设为唯一常驻焦点` : "已取消常驻焦点");
                await renderWorkspace();
            }
            if (action === "add-row")
                openRowEditor(getSettings().ui.activeTable);
            if (action === "close-editor")
                closeEditor();
            if (action === "refresh-diagnostics")
                await renderWorkspace();
            if (action === "copy-diagnostics") {
                const report = await diagnosticReport();
                await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
                toast("success", "诊断信息已复制");
            }
            if (action === "copy-current-prompt") {
                const prompt = workspace.querySelector("[data-ma11-current-prompt]")?.value || "";
                if (!prompt)
                    throw new Error("当前没有可复制的提示词");
                await navigator.clipboard.writeText(prompt);
                toast("success", "当前提示词已复制");
            }
            if (action === "restart-plugin") {
                const restart = globalThis.MirrorAbyss?.restart;
                if (typeof restart !== "function")
                    throw new Error("插件重置入口不可用");
                toast("info", "正在重置镜渊插件…");
                await restart();
                return;
            }
            if (action === "reset-current-game") {
                if (!window.confirm("这会删除当前聊天的镜渊表格、总结、审核记录和镜渊世界书条目。其他聊天和插件设置不受影响；删除后只能重新调用模型整理，无法自动恢复。是否继续？"))
                    return;
                const result = await resetCurrentGame();
                resetWorkspaceContext();
                renderAllMessagePanels();
                toast("success", `当前游戏已重置：清除 ${result.messages} 条消息记录、${result.lorebookEntries} 个世界书条目`);
                await renderWorkspace();
            }
            const memoryView = target.closest("[data-ma11-memory-view]")
                ?.dataset.ma11MemoryView;
            if (memoryView) {
                getSettings().ui.memoryView = memoryView;
                saveSettings();
                await renderWorkspace();
            }
            const locateGraphNodeId = target.closest("[data-ma11-locate-graph-node]")
                ?.dataset.ma11LocateGraphNode;
            if (locateGraphNodeId) {
                selectedGraphNodeId = locateGraphNodeId;
                getSettings().ui.memoryView = "combined";
                getSettings().ui.graphScope = "world";
                saveSettings();
                await renderWorkspace();
                workspace.querySelector(".ma11-memory-graph-pane")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }
            const graphScope = target.closest("[data-ma11-graph-scope]")
                ?.dataset.ma11GraphScope;
            if (graphScope) {
                getSettings().ui.graphScope = graphScope;
                selectedGraphNodeId = null;
                saveSettings();
                await renderWorkspace();
            }
            const graphZoomAction = target.closest("[data-ma11-graph-zoom]")
                ?.dataset.ma11GraphZoom;
            if (graphZoomAction) {
                const settings = getSettings();
                const current = clampGraphZoom(settings.ui.graphZoom);
                if (graphZoomAction === "in")
                    settings.ui.graphZoom = clampGraphZoom(current + 0.15);
                if (graphZoomAction === "out")
                    settings.ui.graphZoom = clampGraphZoom(current - 0.15);
                if (graphZoomAction === "reset")
                    settings.ui.graphZoom = 1;
                if (graphZoomAction === "fit") {
                    const canvas = workspace.querySelector(".ma11-graph-canvas");
                    const availableWidth = Math.max(320, canvas?.clientWidth || 760);
                    const availableHeight = Math.max(280, canvas?.clientHeight || 560);
                    settings.ui.graphZoom = clampGraphZoom(Math.min(availableWidth / 1000, availableHeight / 680));
                }
                saveSettings();
                await renderWorkspace();
            }
            const graphNodeId = target.closest("[data-ma11-graph-node]")
                ?.dataset.ma11GraphNode;
            if (graphNodeId) {
                selectedGraphNodeId = graphNodeId;
                await renderWorkspace();
            }
            const table = target.closest("[data-ma11-table]")?.dataset
                .ma11Table;
            if (table) {
                getSettings().ui.activeTable = table;
                saveSettings();
                await renderWorkspace();
            }
            const editId = target.closest("[data-ma11-edit-row]")
                ?.dataset.ma11EditRow;
            if (editId) {
                const info = currentArtifact();
                const key = getSettings().ui.activeTable;
                const row = info?.artifact.snapshot?.[key].find((item) => item.id === editId);
                if (row)
                    openRowEditor(key, row);
            }
            const deleteId = target.closest("[data-ma11-delete-row]")
                ?.dataset.ma11DeleteRow;
            if (deleteId)
                await deleteRowAction(deleteId);
            const testTask = target.closest("[data-ma11-test]")?.dataset
                .ma11Test;
            if (testTask) {
                const result = await testConnection(testTask);
                const detail = `${result.method}；耗时${result.elapsedMs}ms；连接${result.connected ? "成功" : "失败"}；固定文本${result.protocolValid ? "有效" : "无效"}；精确遵循${result.instructionFollowed ? "通过" : "未通过"}`;
                const diagnostic = result.protocolDetail ? `；协议诊断：${result.protocolDetail}` : "";
                toast(result.instructionFollowed ? "success" : "warning", result.instructionFollowed ? `${detail}${diagnostic}` : `${detail}${diagnostic}；返回：${result.responsePreview}`);
            }
        }
        catch (error) {
            toast("error", toErrorMessage(error));
        }
        finally {
            if (pipelineAction) {
                workspacePipelineActionPending = false;
                scheduleWorkspaceRender();
            }
            if (busyButton?.isConnected) {
                if (!pipelineAction)
                    busyButton.disabled = false;
                busyButton.removeAttribute("aria-busy");
                busyButton.textContent = originalButtonText;
            }
        }
    });
    workspace.addEventListener("change", (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.dataset.ma11TemplateImport !== undefined) {
            const file = target.files?.[0];
            target.value = "";
            if (file) {
                void importHeaderTemplateFile(file)
                    .then(() => toast("success", "表头模板已导入，将从下一次状态提取开始生效"))
                    .catch((error) => toast("error", toErrorMessage(error)));
            }
            return;
        }
        if (target instanceof HTMLSelectElement && target.dataset.ma11LinkSource !== undefined) {
            const id = target.dataset.ma11LinkSource;
            const card = target.closest("[data-ma11-link-card]");
            const box = card?.querySelector(".ma11-link-target-box > div");
            const selected = selectedLinkTargets(workspace, `[data-ma11-link-target="${id}"]`);
            if (box)
                box.innerHTML = linkTargetChoices(normalizeTableRegistry(getSettings().tableRegistry), target.value, selected, `data-ma11-link-target="${escapeHtml(id)}"`);
        }
        if (target instanceof HTMLSelectElement && target.dataset.ma11NewLinkSource !== undefined) {
            const card = target.closest(".ma11-new-link-rule");
            const box = card?.querySelector(".ma11-link-target-box > div");
            const selected = selectedLinkTargets(workspace, "[data-ma11-new-link-target]");
            if (box)
                box.innerHTML = linkTargetChoices(normalizeTableRegistry(getSettings().tableRegistry), target.value, selected, 'data-ma11-new-link-target');
        }
        if (target instanceof HTMLSelectElement && target.name === "targetTableKey") {
            const form = target.closest("#ma11-row-editor");
            if (form)
                applyRowEditorTable(form, target.value);
        }
        if (target.dataset.ma11Setting)
            updateSetting(target);
        if (target instanceof HTMLInputElement && target.dataset.ma11HostControl)
            updateHostControl(target);
        if (target.dataset.ma11RecallSetting) {
            const key = target.dataset.ma11RecallSetting;
            const value = Number(target.value);
            getSettings().lorebookRecall[key] = value;
            saveSettings();
        }
        if (target.dataset.ma11EntryLimit) {
            const key = target.dataset.ma11EntryLimit;
            const value = Math.min(20000, Math.max(200, Math.round(Number(target.value) || 1200)));
            getSettings().contentLimits.tables[key] = value;
            target.value = String(value);
            saveSettings();
        }
        if (target.dataset.ma11SummaryLimit) {
            const key = target.dataset.ma11SummaryLimit;
            const minimum = key === "largeSummary" ? 300 : 200;
            const maximum = key === "largeSummary" ? 20000 : 10000;
            const value = Math.min(maximum, Math.max(minimum, Math.round(Number(target.value) || (key === "largeSummary" ? 1800 : 700))));
            getSettings().contentLimits[key] = value;
            target.value = String(value);
            saveSettings();
        }
        if (target.dataset.ma11TableEnabled) {
            const key = target.dataset.ma11TableEnabled;
            const checked = target instanceof HTMLInputElement ? target.checked : false;
            void updateTableRegistryAndSync(updateTableDefinition(getSettings().tableRegistry, key, { enabled: checked }))
                .catch((error) => toast("error", toErrorMessage(error)));
        }
        if (target.dataset.ma11ConnectionMode ||
            target.dataset.ma11ConnectionProfileId)
            updateConnection(target);
        if (target.dataset.ma11PromptInspector !== undefined) {
            diagnosticPromptKind = target.value;
            void renderWorkspace();
        }
    });
    workspace.addEventListener("input", (event) => {
        const target = event.target;
        if (target.dataset.ma11TableSearch !== undefined) {
            applyTableSearch(workspace, target.value);
            return;
        }
        if (target.dataset.ma11EventProfileSearchInput !== undefined) {
            applyEventProfileSearch(workspace, target.value);
            return;
        }
        if (target.dataset.ma11GraphSearch !== undefined) {
            applyGraphSearch(workspace, target.value);
            return;
        }
        if (target.dataset.ma11GraphZoomRange !== undefined) {
            getSettings().ui.graphZoom = clampGraphZoom(Number(target.value) / 100);
            saveSettings();
            const output = workspace.querySelector(".ma11-graph-zoom output");
            if (output)
                output.value = `${Math.round(getSettings().ui.graphZoom * 100)}%`;
            const svg = workspace.querySelector(".ma11-graph-canvas svg");
            if (svg) {
                const zoom = getSettings().ui.graphZoom;
                svg.setAttribute("width", String(Math.round(1000 * zoom)));
                svg.setAttribute("height", String(Math.round(760 * zoom)));
                const compact = window.matchMedia?.("(max-width: 900px)").matches;
                svg.setAttribute("style", compact
                    ? `width:${Math.max(100, Math.round(zoom * 100))}%;height:100%;min-height:100%;`
                    : `width:${Math.round(1000 * zoom)}px;height:${Math.round(760 * zoom)}px`);
            }
            return;
        }
        if (target.dataset.ma11Setting === "auditPrompt" ||
            target.dataset.ma11Setting === "revisionPrompt" ||
            target.dataset.ma11Setting === "lorebookName")
            updateSetting(target);
        if (target.dataset.ma11ConnectionProfileId)
            updateConnection(target);
    });
    workspace.addEventListener("focusout", () => {
        window.setTimeout(() => {
            if (!workspaceRenderDeferred || workspaceHasFocusedEditor(workspace) || workspaceHasUnsavedSurface(workspace))
                return;
            workspaceRenderDeferred = false;
            scheduleWorkspaceRender();
        }, 0);
    });
    workspace
        .querySelector("#ma11-row-editor")
        ?.addEventListener("submit", (event) => {
        event.preventDefault();
        if (savingRow)
            return;
        savingRow = true;
        const form = event.currentTarget;
        const submit = form.querySelector('button[type="submit"]');
        if (submit) {
            submit.disabled = true;
            submit.textContent = "保存中…";
        }
        void saveRow(form)
            .catch((error) => toast("error", toErrorMessage(error)))
            .finally(() => {
            savingRow = false;
            if (submit?.isConnected) {
                submit.disabled = false;
                submit.textContent = "保存";
            }
        });
    });
}
function resolveWorkspaceMessageSelection(messageIndex) {
    return Number.isInteger(messageIndex) ? Number(messageIndex) : null;
}
function openWorkspace(tab, messageIndex) {
    const workspace = root();
    selectedMessageIndex = resolveWorkspaceMessageSelection(messageIndex);
    if (tab)
        getSettings().ui.activeTab = tab;
    workspace.hidden = false;
    lockWorkspaceViewport();
    void renderWorkspace();
}
function closeWorkspace() {
    closeEditor();
    const workspace = document.querySelector("#ma11-workspace");
    if (workspace)
        workspace.hidden = true;
    unlockWorkspaceViewport();
}
function resetWorkspaceContext() {
    selectedMessageIndex = null;
    selectedGraphNodeId = null;
    closeEditor();
}
function disposeWorkspace() {
    resetWorkspaceContext();
    queueUnsubscribe?.();
    queueUnsubscribe = null;
    pipelineUnsubscribe?.();
    pipelineUnsubscribe = null;
    savingRow = false;
    workspacePipelineActionPending = false;
    workspaceRenderScheduled = false;
    workspaceRenderDeferred = false;
    renderAgain = false;
    unlockWorkspaceViewport();
    document.querySelector("#ma11-workspace")?.remove();
}
function refreshWorkspace() {
    void renderWorkspace();
}

}
};
__defs["workflow/history-workflow.js"]=function(exports,__require){
const __scope=Object.create(null);
Object.defineProperty(__scope,"nowIso",{enumerable:true,configurable:true,get:()=>__require("core/utils.js")["nowIso"]});
with(__scope){
Object.defineProperty(exports,"readHistoryWorkflow",{enumerable:true,configurable:true,get:()=>readHistoryWorkflow});
Object.defineProperty(exports,"historyWorkflowBlocked",{enumerable:true,configurable:true,get:()=>historyWorkflowBlocked});
Object.defineProperty(exports,"historyRecoveryRunning",{enumerable:true,configurable:true,get:()=>historyRecoveryRunning});
Object.defineProperty(exports,"historyBlockedMessage",{enumerable:true,configurable:true,get:()=>historyBlockedMessage});
Object.defineProperty(exports,"invalidateHistoryWorkflow",{enumerable:true,configurable:true,get:()=>invalidateHistoryWorkflow});
Object.defineProperty(exports,"setHistoryPauseError",{enumerable:true,configurable:true,get:()=>setHistoryPauseError});
Object.defineProperty(exports,"resolveLatestHistoryInvalidation",{enumerable:true,configurable:true,get:()=>resolveLatestHistoryInvalidation});
Object.defineProperty(exports,"beginHistoryRecovery",{enumerable:true,configurable:true,get:()=>beginHistoryRecovery});
Object.defineProperty(exports,"updateHistoryRecovery",{enumerable:true,configurable:true,get:()=>updateHistoryRecovery});
Object.defineProperty(exports,"failHistoryRecovery",{enumerable:true,configurable:true,get:()=>failHistoryRecovery});
Object.defineProperty(exports,"markHistoryRecoveryPartial",{enumerable:true,configurable:true,get:()=>markHistoryRecoveryPartial});
Object.defineProperty(exports,"interruptHistoryRecovery",{enumerable:true,configurable:true,get:()=>interruptHistoryRecovery});
Object.defineProperty(exports,"chooseHistoryRecalculationStart",{enumerable:true,configurable:true,get:()=>chooseHistoryRecalculationStart});
Object.defineProperty(exports,"completeHistoryWorkflow",{enumerable:true,configurable:true,get:()=>completeHistoryWorkflow});
/**
 * 模块职责：统一解释和推进历史失效/恢复工作流。
 * 维护边界：本模块只管理流程状态，不修改事实、快照、总结或世界书内容。
 *
 * 当前持久化仍沿用 historyInvalidation/historyRecovery 两个旧字段；所有业务代码应通过
 * 本模块读写，避免两个字段在不同调用点各自演化。后续可在不改调用方的前提下收敛为单字段。
 */
function readHistoryWorkflow(state) {
    const invalidation = state?.historyInvalidation;
    const recovery = state?.historyRecovery;
    if (recovery) {
        const status = recovery.phase === 'failed'
            ? 'failed'
            : recovery.phase === 'partial'
                ? 'partial'
                : 'rebuilding';
        return {
            status,
            blocked: true,
            running: status === 'rebuilding',
            invalidation,
            recovery,
            startIndex: invalidation?.startIndex ?? recovery.startIndex,
            phase: recovery.phase,
            automatic: Boolean(invalidation?.automatic),
            pauseError: invalidation?.pauseError,
            error: recovery.error,
        };
    }
    if (invalidation) {
        return {
            status: 'invalid',
            blocked: true,
            running: false,
            invalidation,
            startIndex: invalidation.startIndex,
            automatic: Boolean(invalidation.automatic),
            pauseError: invalidation.pauseError,
        };
    }
    return { status: 'clean', blocked: false, running: false, automatic: false };
}
function historyWorkflowBlocked(state) {
    return readHistoryWorkflow(state).blocked;
}
function historyRecoveryRunning(state) {
    return readHistoryWorkflow(state).running;
}
function historyBlockedMessage(state) {
    const workflow = readHistoryWorkflow(state);
    return workflow.startIndex === undefined
        ? '历史数据已失效，请先选择历史重算起点'
        : `历史数据已失效，请从第 ${workflow.startIndex + 1} 条消息开始重算`;
}
function invalidateHistoryWorkflow(state, input) {
    delete state.historyRecovery;
    state.historyInvalidation = {
        ...input,
        detectedAt: input.detectedAt || nowIso(),
    };
    return state.historyInvalidation;
}
function setHistoryPauseError(state, error) {
    if (!state.historyInvalidation)
        return;
    if (error)
        state.historyInvalidation.pauseError = error;
    else
        delete state.historyInvalidation.pauseError;
}
function resolveLatestHistoryInvalidation(state, messageIndex) {
    const invalidation = state.historyInvalidation;
    if (!invalidation || invalidation.startIndex !== messageIndex || invalidation.reason === 'deleted')
        return false;
    delete state.historyInvalidation;
    return true;
}
function beginHistoryRecovery(state, input) {
    state.historyRecovery = {
        ...input,
        updatedAt: input.updatedAt || nowIso(),
    };
    return state.historyRecovery;
}
function updateHistoryRecovery(state, patch) {
    if (!state.historyRecovery)
        return undefined;
    Object.assign(state.historyRecovery, patch, { updatedAt: patch.updatedAt || nowIso() });
    return state.historyRecovery;
}
function failHistoryRecovery(state, error, patch = {}) {
    return updateHistoryRecovery(state, { ...patch, phase: 'failed', error });
}
function markHistoryRecoveryPartial(state, error) {
    return updateHistoryRecovery(state, { phase: 'partial', error });
}
function interruptHistoryRecovery(state, reason) {
    const workflow = readHistoryWorkflow(state);
    if (!workflow.running)
        return false;
    failHistoryRecovery(state, reason);
    return true;
}
function chooseHistoryRecalculationStart(state, startIndex) {
    if (!state.historyInvalidation)
        throw new Error('当前没有待处理的历史失效');
    state.historyInvalidation.startIndex = startIndex;
    delete state.historyRecovery;
}
function completeHistoryWorkflow(state) {
    delete state.historyInvalidation;
    delete state.historyRecovery;
}

}
};

const __entry=__require("index.js");
globalThis.__MirrorAbyssBundledLifecycle = {
  onActivate: __entry.onActivate,
  onInstall: __entry.onInstall,
  onUpdate: __entry.onUpdate,
  onEnable: __entry.onEnable,
  onDisable: __entry.onDisable,
  onClean: __entry.onClean,
  onDelete: __entry.onDelete,
};
