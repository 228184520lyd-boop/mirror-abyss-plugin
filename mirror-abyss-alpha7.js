/**
 * Mirror Abyss single-file real-machine candidate.
 * FACT-HOST-007 / FACT-BUILD-008 / FACT-TEST-008 / EVT-20260726-016.
 * Local application modules and CSS are embedded in this file. No local
 * runtime path is fetched after SillyTavern loads the manifest entry.
 */
var MA_VERSION = "2.0.0-alpha.7-realtest.1";
var MA_STYLE_ID = 'mirror-abyss-v2-inline-style';
var MA_ERROR_ID = 'mirror-abyss-v2-loader-error';
var MA_STYLE_TEXT = ".mirror-abyss-v2-root { margin: .75rem 0; }\n.mirror-abyss-v2-panel { border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,.16)); border-radius: .5rem; padding: .75rem; background: var(--SmartThemeBlurTintColor, rgba(0,0,0,.12)); }\n.mirror-abyss-v2-panel h3 { margin: 0 0 .65rem; font-size: 1rem; }\n.mirror-abyss-v2-grid { display:grid; grid-template-columns:minmax(7rem,auto) minmax(0,1fr); gap:.4rem .75rem; align-items:start; }\n.mirror-abyss-v2-label { opacity:.72; }\n.mirror-abyss-v2-value { min-width:0; overflow-wrap:anywhere; }\n.mirror-abyss-v2-actions { display:flex; flex-wrap:wrap; gap:.65rem 1rem; align-items:center; margin:.9rem 0; }\n.mirror-abyss-v2-actions label { display:flex; align-items:center; gap:.35rem; }\n.mirror-abyss-v2-field { display:grid; gap:.35rem; margin:.65rem 0; }\n.mirror-abyss-v2-field textarea { width:100%; box-sizing:border-box; resize:vertical; }\n.mirror-abyss-v2-table-counts { display:flex; flex-wrap:wrap; gap:.35rem .75rem; margin-top:.75rem; font-size:.88rem; opacity:.82; }\n.mirror-abyss-v2-error { margin-top:.65rem; white-space:pre-wrap; color:var(--warning,#e6a23c); }\n.mirror-abyss-v2-note { margin:.75rem 0 0; opacity:.72; font-size:.85rem; }\n.mirror-abyss-v2-diagnostic-status { margin:-.35rem 0 .65rem; font-size:.85rem; opacity:.82; }\n.mirror-abyss-v2-loader-error details { margin-top:.45rem; }\n.mirror-abyss-v2-loader-error pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:14rem; overflow:auto; }\n";
var MA_DEPENDENCY_CANDIDATES = {
  "react": [
    {
      "id": "esmsh",
      "label": "esm.sh",
      "url": "https://esm.sh/react@18.2.0?target=es2022"
    },
    {
      "id": "jsdelivr",
      "label": "jsDelivr +esm",
      "url": "https://cdn.jsdelivr.net/npm/react@18.2.0/+esm"
    }
  ],
  "react-dom/client": [
    {
      "id": "esmsh",
      "label": "esm.sh",
      "url": "https://esm.sh/react-dom@18.2.0/client?deps=react@18.2.0&target=es2022"
    },
    {
      "id": "jsdelivr",
      "label": "jsDelivr +esm",
      "url": "https://cdn.jsdelivr.net/npm/react-dom@18.2.0/client/+esm"
    }
  ],
  "react-redux": [
    {
      "id": "esmsh",
      "label": "esm.sh",
      "url": "https://esm.sh/react-redux@9.2.0?deps=react@18.2.0,redux@5.0.1&target=es2022"
    },
    {
      "id": "jsdelivr",
      "label": "jsDelivr +esm",
      "url": "https://cdn.jsdelivr.net/npm/react-redux@9.2.0/+esm"
    }
  ],
  "@reduxjs/toolkit": [
    {
      "id": "esmsh",
      "label": "esm.sh",
      "url": "https://esm.sh/@reduxjs/toolkit@2.11.0?target=es2022"
    },
    {
      "id": "jsdelivr",
      "label": "jsDelivr +esm",
      "url": "https://cdn.jsdelivr.net/npm/@reduxjs/toolkit@2.11.0/+esm"
    }
  ],
  "zod": [
    {
      "id": "esmsh",
      "label": "esm.sh",
      "url": "https://esm.sh/zod@4.4.3?target=es2022"
    },
    {
      "id": "jsdelivr",
      "label": "jsDelivr +esm",
      "url": "https://cdn.jsdelivr.net/npm/zod@4.4.3/+esm"
    }
  ],
  "p-queue": [
    {
      "id": "esmsh",
      "label": "esm.sh",
      "url": "https://esm.sh/p-queue@9.3.1?target=es2022"
    },
    {
      "id": "jsdelivr",
      "label": "jsDelivr +esm",
      "url": "https://cdn.jsdelivr.net/npm/p-queue@9.3.1/+esm"
    }
  ]
};
var MA_EXTERNALS = Object.create(null);
var MA_MODULE_CACHE = Object.create(null);
var MA_ENTRY_PROMISE = null;
var MA_ENTRY = null;
var MA_MODULES = {
"app/application": function(module, exports, require) {
/* Generated from src/app/application.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MirrorAbyssApplication = void 0;
exports.getApplication = getApplication;
const chat_session_1 = require("app/chat-session");
const chat_task_executor_1 = require("app/chat-task-executor");
const store_1 = require("app/store");
const document_slice_1 = require("features/document/document-slice");
const processing_slice_1 = require("features/processing/processing-slice");
const service_1 = require("features/processing/service");
const session_slice_1 = require("features/session/session-slice");
const settings_slice_1 = require("features/settings/settings-slice");
const message_gateway_1 = require("host/message-gateway");
const model_gateway_1 = require("host/model-gateway");
const settings_repository_1 = require("host/settings-repository");
const silly_tavern_1 = require("host/silly-tavern");
const chat_document_repository_1 = require("repository/chat-document-repository");
const errors_1 = require("shared/errors");
const mount_1 = require("ui/mount");
/**
 * 核心实机候选编排器。只包含一个消息处理入口和一组官方宿主监听。
 * EVT-20260726-004：由 FACT-RUN-001、FACT-DATA-002、FACT-CONTENT-002 触发建立本纵向闭环。
 */
class MirrorAbyssApplication {
    constructor() {
        this.runtime = (0, store_1.createApplicationStore)();
        this.store = this.runtime.store;
        this.host = new silly_tavern_1.SillyTavernGateway();
        this.session = new chat_session_1.ChatSessionController();
        this.executor = new chat_task_executor_1.ChatTaskExecutor(this.session);
        this.repository = new chat_document_repository_1.ChatDocumentRepository(this.host, this.session);
        this.settingsRepository = new settings_repository_1.SettingsRepository(this.host);
        this.processing = new service_1.ProcessingService(this.repository, new message_gateway_1.MessageGateway(this.host, this.session), new model_gateway_1.ModelGateway(this.host));
        this.mountedUi = null;
        this.cleanup = [];
        this.startPromise = null;
        this.started = false;
        this.runtime.listenerMiddleware.startListening({
            actionCreator: processing_slice_1.processingActions.processRequested,
            effect: async (action) => { await this.handleProcessRequest(action.payload); },
        });
        this.runtime.listenerMiddleware.startListening({
            actionCreator: settings_slice_1.settingsActions.patchRequested,
            effect: async (action) => {
                const settings = this.settingsRepository.save(action.payload);
                this.store.dispatch(settings_slice_1.settingsActions.loaded(settings));
            },
        });
    }
    start() {
        if (this.startPromise)
            return this.startPromise;
        this.startPromise = this.startInternal().finally(() => { this.startPromise = null; });
        return this.startPromise;
    }
    stop() {
        if (!this.started && !this.mountedUi)
            return;
        this.started = false;
        this.cleanup.splice(0).forEach((remove) => remove());
        this.session.stop();
        this.executor.clearAll();
        this.store.dispatch(document_slice_1.documentActions.cleared());
        this.store.dispatch(processing_slice_1.processingActions.reset());
        this.store.dispatch(session_slice_1.sessionActions.disabled());
        this.mountedUi?.unmount();
        this.mountedUi = null;
    }
    async startInternal() {
        if (this.started)
            return;
        try {
            this.host.getContext();
            this.store.dispatch(settings_slice_1.settingsActions.loaded(this.settingsRepository.load()));
            this.mountedUi = (0, mount_1.mountUi)(this.store);
            this.cleanup.push(this.host.subscribeChatChanged(() => void this.loadCurrentChat()));
            this.cleanup.push(this.host.subscribeMessageReceived((messageIndex) => this.onHostMessage('automatic', messageIndex)));
            this.cleanup.push(this.host.subscribeMessageChanged((messageIndex) => this.onHostMessage('message-change', messageIndex)));
            this.started = true;
            await this.loadCurrentChat();
        }
        catch (error) {
            // FACT-RUN-003 / EVT-20260726-009：启动不是“尽力而为”；失败必须撤销部分 UI 和监听。
            this.started = false;
            this.cleanup.splice(0).forEach((remove) => remove());
            this.session.stop();
            this.executor.clearAll();
            this.mountedUi?.unmount();
            this.mountedUi = null;
            throw error;
        }
    }
    onHostMessage(source, messageIndex) {
        const settings = this.settingsRepository.load();
        if (!settings.enabled || !settings.autoProcess)
            return;
        this.store.dispatch(processing_slice_1.processingActions.processRequested({
            source,
            ...(Number.isInteger(messageIndex) && messageIndex >= 0 ? { messageIndex } : {}),
        }));
    }
    async handleProcessRequest(request) {
        const token = this.session.capture();
        if (!token.chatKey) {
            this.store.dispatch(processing_slice_1.processingActions.failed('没有活动聊天'));
            return;
        }
        const settings = this.settingsRepository.load();
        if (!settings.enabled) {
            this.store.dispatch(processing_slice_1.processingActions.failed('插件当前已关闭'));
            return;
        }
        try {
            const document = await this.executor.run(token, async () => this.processing.process(token, settings, {
                started: (messageIndex, messageKey) => this.store.dispatch(processing_slice_1.processingActions.started({ source: request.source, messageIndex, messageKey })),
                stage: (stage, detail) => this.store.dispatch(processing_slice_1.processingActions.stageChanged({ stage, detail })),
                committed: (committed) => this.store.dispatch(document_slice_1.documentActions.committed(committed)),
            }, request.messageIndex));
            if (!this.session.isCurrent(token))
                return;
            this.store.dispatch(document_slice_1.documentActions.committed(document));
            this.store.dispatch(processing_slice_1.processingActions.completed(`处理完成，文档 revision ${document.revision}`));
        }
        catch (error) {
            if (error instanceof chat_session_1.StaleChatSessionError || (error instanceof DOMException && error.name === 'AbortError') || token.signal.aborted)
                return;
            if (!this.session.isCurrent(token))
                return;
            const message = (0, errors_1.errorMessage)(error);
            if (error instanceof errors_1.MirrorAbyssError && ['AUDIT_BLOCKED', 'REVISION_REQUIRED'].includes(error.code)) {
                this.store.dispatch(processing_slice_1.processingActions.blocked(message));
            }
            else {
                this.store.dispatch(processing_slice_1.processingActions.failed(message));
            }
            console.error('[MirrorAbyss] message processing failed', error);
        }
    }
    async loadCurrentChat() {
        const chatKey = this.host.getCurrentChatKey();
        const token = this.session.switchTo(chatKey);
        this.executor.clearExcept(chatKey);
        this.store.dispatch(session_slice_1.sessionActions.chatChanged({ chatKey, generation: token.generation }));
        this.store.dispatch(document_slice_1.documentActions.cleared());
        this.store.dispatch(processing_slice_1.processingActions.reset());
        if (!chatKey)
            return;
        try {
            const document = await this.executor.run(token, async () => this.repository.loadCurrent(token));
            if (!this.session.isCurrent(token))
                return;
            this.store.dispatch(document_slice_1.documentActions.loaded(document));
            this.store.dispatch(session_slice_1.sessionActions.ready());
        }
        catch (error) {
            if (error instanceof chat_session_1.StaleChatSessionError || token.signal.aborted || !this.session.isCurrent(token))
                return;
            this.store.dispatch(session_slice_1.sessionActions.failed((0, errors_1.errorMessage)(error)));
            console.error('[MirrorAbyss] failed to load current chat', error);
        }
    }
}
exports.MirrorAbyssApplication = MirrorAbyssApplication;
let singleton = null;
function getApplication() { singleton ?? (singleton = new MirrorAbyssApplication()); return singleton; }

},
"app/chat-session": function(module, exports, require) {
/* Generated from src/app/chat-session.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatSessionController = exports.StaleChatSessionError = void 0;
class StaleChatSessionError extends Error {
    constructor() {
        super('聊天会话已经切换，旧任务结果已丢弃');
        this.name = 'StaleChatSessionError';
    }
}
exports.StaleChatSessionError = StaleChatSessionError;
/**
 * 当前聊天会话控制器。
 * 切换聊天时只做三件事：递增代次、取消旧请求、建立新信号。
 */
class ChatSessionController {
    constructor() {
        this.chatKey = null;
        this.generation = 0;
        this.controller = new AbortController();
    }
    switchTo(chatKey) {
        this.controller.abort('chat-changed');
        this.generation += 1;
        this.chatKey = chatKey;
        this.controller = new AbortController();
        return this.capture();
    }
    capture() {
        return Object.freeze({
            chatKey: this.chatKey,
            generation: this.generation,
            signal: this.controller.signal,
        });
    }
    assertCurrent(token) {
        if (token.signal.aborted ||
            token.generation !== this.generation ||
            token.chatKey !== this.chatKey) {
            throw new StaleChatSessionError();
        }
    }
    isCurrent(token) {
        try {
            this.assertCurrent(token);
            return true;
        }
        catch {
            return false;
        }
    }
    stop() {
        this.controller.abort('extension-stopped');
        this.generation += 1;
        this.chatKey = null;
    }
}
exports.ChatSessionController = ChatSessionController;

},
"app/chat-task-executor": function(module, exports, require) {
/* Generated from src/app/chat-task-executor.ts. */
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatTaskExecutor = void 0;
const p_queue_1 = __importDefault(require("p-queue"));
/**
 * 每个聊天只允许一个改变业务状态的任务运行。
 * 不提供优先级、租约、心跳、恢复或第二套状态机。
 */
class ChatTaskExecutor {
    constructor(session) {
        this.session = session;
        this.queues = new Map();
    }
    async run(token, operation) {
        if (!token.chatKey) {
            throw new Error('没有活动聊天，无法执行聊天任务');
        }
        const queue = this.getQueue(token.chatKey);
        const result = await queue.add(async () => {
            this.session.assertCurrent(token);
            const value = await operation(token.signal);
            this.session.assertCurrent(token);
            return value;
        }, { signal: token.signal });
        return result;
    }
    clearExcept(chatKey) {
        for (const [key, queue] of this.queues) {
            if (key !== chatKey) {
                queue.clear();
                this.queues.delete(key);
            }
        }
    }
    clearAll() {
        for (const queue of this.queues.values()) {
            queue.clear();
        }
        this.queues.clear();
    }
    getQueue(chatKey) {
        const existing = this.queues.get(chatKey);
        if (existing)
            return existing;
        const queue = new p_queue_1.default({ concurrency: 1 });
        this.queues.set(chatKey, queue);
        return queue;
    }
}
exports.ChatTaskExecutor = ChatTaskExecutor;

},
"app/store": function(module, exports, require) {
/* Generated from src/app/store.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApplicationStore = createApplicationStore;
const toolkit_1 = require("@reduxjs/toolkit");
const document_slice_1 = require("features/document/document-slice");
const processing_slice_1 = require("features/processing/processing-slice");
const session_slice_1 = require("features/session/session-slice");
const settings_slice_1 = require("features/settings/settings-slice");
function createApplicationStore() {
    const listenerMiddleware = (0, toolkit_1.createListenerMiddleware)();
    const store = (0, toolkit_1.configureStore)({
        reducer: { session: session_slice_1.sessionReducer, document: document_slice_1.documentReducer, processing: processing_slice_1.processingReducer, settings: settings_slice_1.settingsReducer },
        middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: true, immutableCheck: true }).prepend(listenerMiddleware.middleware),
    });
    return { store, listenerMiddleware };
}

},
"constants": function(module, exports, require) {
/* Generated from src/constants.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TABLE_KEYS = exports.CHAT_DOCUMENT_SCHEMA_VERSION = exports.VERSION = exports.DISPLAY_NAME = exports.EXTENSION_NAMESPACE = void 0;
exports.EXTENSION_NAMESPACE = 'mirrorAbyssV2';
exports.DISPLAY_NAME = 'Mirror Abyss｜镜渊';
exports.VERSION = '2.0.0-alpha.7-realtest.1';
exports.CHAT_DOCUMENT_SCHEMA_VERSION = 3;
exports.DEFAULT_TABLE_KEYS = [
    'spacetime', 'scenes', 'characters', 'items', 'events',
    'regions', 'globalChanges', 'foundations', 'customObjects',
];

},
"features/document/document-slice": function(module, exports, require) {
/* Generated from src/features/document/document-slice.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentReducer = exports.documentActions = void 0;
const toolkit_1 = require("@reduxjs/toolkit");
const initialState = {
    active: null,
};
const documentSlice = (0, toolkit_1.createSlice)({
    name: 'document',
    initialState,
    reducers: {
        cleared(state) {
            state.active = null;
        },
        loaded(state, action) {
            state.active = action.payload;
        },
        /**
         * 后续业务只能在持久化成功后派发该动作。
         * 第一阶段不提供乐观更新入口。
         */
        committed(state, action) {
            state.active = action.payload;
        },
    },
});
exports.documentActions = documentSlice.actions;
exports.documentReducer = documentSlice.reducer;

},
"features/processing/parsers": function(module, exports, require) {
/* Generated from src/features/processing/parsers.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAuditOutput = parseAuditOutput;
exports.parseExtractionOutput = parseExtractionOutput;
const errors_1 = require("shared/errors");
const fixed_text_1 = require("shared/fixed-text");
const schemas_1 = require("features/processing/schemas");
const TABLE_ALIASES = {
    时空: 'spacetime', spacetime: 'spacetime',
    场景: 'scenes', scene: 'scenes', scenes: 'scenes',
    角色: 'characters', character: 'characters', characters: 'characters',
    物品: 'items', item: 'items', items: 'items',
    事件: 'events', event: 'events', events: 'events',
    地点: 'regions', region: 'regions', regions: 'regions',
    全局变化: 'globalChanges', 全局: 'globalChanges', globalchanges: 'globalChanges',
    基础设定: 'foundations', foundations: 'foundations',
    自定义对象: 'customObjects', 自定义: 'customObjects', customobjects: 'customObjects',
};
function decision(value) {
    const normalized = value.normalize('NFKC').trim().toLocaleLowerCase();
    if (['pass', '通过', '合格'].includes(normalized))
        return 'pass';
    if (['revise', '修改', '修正', '需修改', '需要修改'].includes(normalized))
        return 'revise';
    if (['block', '阻止', '拦截', '无法修正'].includes(normalized))
        return 'block';
    return null;
}
function parseAuditOutput(raw) {
    const blocks = (0, fixed_text_1.parseBlocks)(raw, [
        { kind: 'audit', start: '<MA_AUDIT>', end: '</MA_AUDIT>' },
        { kind: 'violation', start: '<MA_VIOLATION>', end: '</MA_VIOLATION>' },
        { kind: 'replacement', start: '<MA_REPLACEMENT>', end: '</MA_REPLACEMENT>' },
    ]);
    const auditBlocks = blocks.filter((block) => block.kind === 'audit');
    if (auditBlocks.length !== 1) {
        throw new errors_1.MirrorAbyssError('INVALID_AUDIT_OUTPUT', `审核结果必须包含一个 MA_AUDIT，实际 ${auditBlocks.length} 个`, 'audit');
    }
    const audit = auditBlocks[0];
    if (!audit)
        throw new errors_1.MirrorAbyssError('INVALID_AUDIT_OUTPUT', '审核主块为空', 'audit');
    const result = decision((0, fixed_text_1.field)(audit, 'result', '结果', '判定'));
    if (!result)
        throw new errors_1.MirrorAbyssError('INVALID_AUDIT_OUTPUT', '审核结果缺少 pass/revise/block', 'audit');
    const violations = blocks
        .filter((block) => block.kind === 'violation')
        .map((block, index) => ({
        ruleId: (0, fixed_text_1.field)(block, 'ruleid', 'rule_id', '规则编号') || `rule_${index + 1}`,
        rule: (0, fixed_text_1.field)(block, 'rule', '规则'),
        evidence: (0, fixed_text_1.field)(block, 'evidence', '证据'),
        action: (0, fixed_text_1.field)(block, 'action', '修改', '操作'),
    }))
        .filter((item) => item.rule || item.evidence || item.action)
        .slice(0, 24);
    if (result !== 'pass' && violations.length === 0) {
        throw new errors_1.MirrorAbyssError('INVALID_AUDIT_OUTPUT', '审核未通过但没有违规块', 'audit');
    }
    const replacement = blocks.find((block) => block.kind === 'replacement')?.body.trim();
    return schemas_1.AuditResultSchema.parse({
        passed: result === 'pass',
        decision: result,
        reason: (0, fixed_text_1.field)(audit, 'reason', '原因', '理由') || (result === 'pass' ? '通过' : '违反规则'),
        violations: result === 'pass' ? [] : violations,
        preserve: (0, fixed_text_1.fields)(audit, 'preserve', '保留', '必须保留').filter(Boolean).slice(0, 24),
        rewriteInstruction: (0, fixed_text_1.field)(audit, 'rewrite', '修正指令', '修改指令'),
        ...(result === 'revise' && replacement ? { replacementText: replacement } : {}),
    });
}
function parseExtractionOutput(raw) {
    const blocks = (0, fixed_text_1.parseBlocks)(raw, [
        { kind: 'turn', start: '<MA_TURN>', end: '</MA_TURN>' },
        { kind: 'fact', start: '<MA_FACT>', end: '</MA_FACT>' },
    ]);
    const turnBlocks = blocks.filter((block) => block.kind === 'turn');
    if (turnBlocks.length !== 1) {
        throw new errors_1.MirrorAbyssError('INVALID_EXTRACTION_OUTPUT', `状态提取必须包含一个 MA_TURN，实际 ${turnBlocks.length} 个`, 'extraction');
    }
    const facts = blocks.filter((block) => block.kind === 'fact').map((block) => {
        const tableRaw = (0, fixed_text_1.field)(block, '表格', 'table').replace(/\s+/g, '');
        const tableKey = TABLE_ALIASES[tableRaw] ?? TABLE_ALIASES[tableRaw.toLocaleLowerCase()] ?? '';
        const item = {
            eventName: (0, fixed_text_1.field)(block, '事件', 'event'),
            tableKey,
            objectName: (0, fixed_text_1.field)(block, '对象', 'object'),
            semanticLayer: (0, fixed_text_1.field)(block, '语义层', 'layer'),
            fact: (0, fixed_text_1.field)(block, '事实', 'fact'),
        };
        if (!item.tableKey || !item.objectName || !item.fact) {
            throw new errors_1.MirrorAbyssError('INVALID_EXTRACTION_OUTPUT', 'MA_FACT 缺少有效表格、对象或事实', 'extraction');
        }
        return item;
    });
    return schemas_1.ExtractionResultSchema.parse({
        turnSummary: turnBlocks[0]?.body.trim() ?? '',
        facts,
    });
}

},
"features/processing/processing-slice": function(module, exports, require) {
/* Generated from src/features/processing/processing-slice.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processingReducer = exports.processingActions = void 0;
const toolkit_1 = require("@reduxjs/toolkit");
const initialState = {
    status: 'idle', source: null, messageIndex: null, messageKey: null,
    detail: null, error: null, lastCompletedAt: null,
};
const slice = (0, toolkit_1.createSlice)({
    name: 'processing',
    initialState,
    reducers: {
        processRequested(_state, _action) { },
        started(state, action) {
            state.status = 'loading';
            state.source = action.payload.source;
            state.messageIndex = action.payload.messageIndex;
            state.messageKey = action.payload.messageKey;
            state.detail = '读取消息与阶段缓存';
            state.error = null;
        },
        stageChanged(state, action) {
            state.status = action.payload.stage;
            state.detail = action.payload.detail;
            state.error = null;
        },
        completed(state, action) {
            state.status = 'complete';
            state.detail = action.payload;
            state.error = null;
            state.lastCompletedAt = Date.now();
        },
        blocked(state, action) {
            state.status = 'blocked';
            state.detail = action.payload;
            state.error = null;
        },
        failed(state, action) {
            state.status = 'error';
            state.error = action.payload;
            state.detail = null;
        },
        reset(state) {
            Object.assign(state, initialState);
        },
    },
});
exports.processingActions = slice.actions;
exports.processingReducer = slice.reducer;

},
"features/processing/reducer": function(module, exports, require) {
/* Generated from src/features/processing/reducer.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureMessageRecord = ensureMessageRecord;
exports.applyExtraction = applyExtraction;
exports.rebuildTablesFromFacts = rebuildTablesFromFacts;
const constants_1 = require("constants");
const hash_1 = require("shared/hash");
function ensureMessageRecord(document, input) {
    const existing = document.messages[input.messageKey];
    if (existing && existing.visibleContentHash === input.contentHash) {
        existing.messageIndex = input.messageIndex;
        return existing;
    }
    // FACT-CONTENT-003：若修正文已写入 SillyTavern、但 appliedContentHash 的 metadata 保存失败，
    // 用已持久化候选正文与当前可见正文对照恢复，不重新调用审核或修正模型。
    const revisionResult = existing?.stages.revision?.result;
    if (existing && revisionResult && typeof revisionResult === 'object') {
        const revisedText = 'text' in revisionResult && typeof revisionResult.text === 'string'
            ? revisionResult.text
            : '';
        if (revisedText && (0, hash_1.hashText)(revisedText) === input.contentHash) {
            existing.messageIndex = input.messageIndex;
            existing.visibleContentHash = input.contentHash;
            const revisionStage = existing.stages.revision;
            if (!revisionStage)
                return existing;
            existing.stages.revision = {
                inputHash: revisionStage.inputHash,
                ...(revisionStage.completedAt !== undefined ? { completedAt: revisionStage.completedAt } : {}),
                ...(revisionStage.error !== undefined ? { error: revisionStage.error } : {}),
                result: { ...revisionResult, appliedContentHash: input.contentHash },
            };
            return existing;
        }
    }
    const record = {
        messageKey: input.messageKey,
        messageIndex: input.messageIndex,
        sourceText: input.text,
        sourceContentHash: input.contentHash,
        visibleContentHash: input.contentHash,
        stages: {},
    };
    document.messages[input.messageKey] = record;
    return record;
}
/**
 * FACT-DATA-004 / FACT-DATA-006：事实 ID 确定；重处理同一消息时替换该消息的事实贡献，
 * 九张表随后由完整事实账本重新投影，禁止新旧正文事实叠加。
 */
function applyExtraction(document, messageKey, result, now = Date.now()) {
    for (const [factId, fact] of Object.entries(document.facts)) {
        if (fact.sourceMessageKey === messageKey)
            delete document.facts[factId];
    }
    for (const fact of result.facts) {
        const objectToken = (0, hash_1.normalizedIdentity)(fact.objectName) || (0, hash_1.hashText)(fact.objectName);
        const objectId = fact.tableKey === 'spacetime' ? 'spacetime:current' : `${fact.tableKey}:${(0, hash_1.hashText)(objectToken)}`;
        const factId = `fact:${(0, hash_1.hashText)([messageKey, fact.eventName, fact.tableKey, objectToken, fact.semanticLayer, fact.fact].join('|'))}`;
        document.facts[factId] = {
            id: factId,
            tableKey: fact.tableKey,
            objectId,
            sourceMessageKey: messageKey,
            value: structuredClone(fact),
            updatedAt: now,
        };
    }
    rebuildTablesFromFacts(document);
    document.lastTurnSummary = result.turnSummary;
}
/** 仅事实账本驱动模型行；人工行和锁定行原样保留。 */
function rebuildTablesFromFacts(document) {
    var _a;
    const tableKeys = new Set([...constants_1.DEFAULT_TABLE_KEYS, ...Object.keys(document.tables)]);
    const nextTables = {};
    for (const key of tableKeys) {
        nextTables[key] = (document.tables[key] ?? [])
            .filter((row) => row.source !== 'model' || row.locked === true)
            .map((row) => structuredClone(row));
    }
    const facts = Object.values(document.facts).sort((left, right) => left.updatedAt - right.updatedAt || left.id.localeCompare(right.id));
    for (const factRecord of facts) {
        const fact = readExtractedFact(factRecord);
        if (!fact)
            continue;
        const rows = (nextTables[_a = fact.tableKey] ?? (nextTables[_a] = []));
        const existing = rows.find((row) => row.id === factRecord.objectId);
        if (existing && (existing.locked === true || existing.source !== 'model'))
            continue;
        const incoming = {
            id: factRecord.objectId,
            title: fact.objectName,
            content: fact.fact,
            status: 'current',
            keywords: unique([fact.objectName, fact.eventName]),
            fields: { [fact.semanticLayer || '现行事实']: [fact.fact] },
            factIds: [factRecord.id],
            source: 'model',
            locked: false,
            updatedAt: factRecord.updatedAt,
        };
        const merged = mergeRow(existing, incoming);
        if (existing)
            Object.assign(existing, merged);
        else
            rows.push(merged);
    }
    document.tables = nextTables;
}
function readExtractedFact(record) {
    const value = record.value;
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const candidate = value;
    const eventName = typeof candidate.eventName === 'string' ? candidate.eventName : '';
    const tableKey = typeof candidate.tableKey === 'string' ? candidate.tableKey : '';
    const objectName = typeof candidate.objectName === 'string' ? candidate.objectName : '';
    const semanticLayer = typeof candidate.semanticLayer === 'string' ? candidate.semanticLayer : '';
    const fact = typeof candidate.fact === 'string' ? candidate.fact : '';
    return tableKey && objectName && fact ? { eventName, tableKey, objectName, semanticLayer, fact } : null;
}
function mergeRow(existing, incoming) {
    if (!existing)
        return incoming;
    const fields = { ...(existing.fields ?? {}) };
    for (const [key, value] of Object.entries(incoming.fields ?? {})) {
        fields[key] = unique([
            ...(Array.isArray(fields[key]) ? fields[key] : []),
            ...(Array.isArray(value) ? value.map(String) : [String(value)]),
        ]);
    }
    return {
        ...existing,
        ...incoming,
        keywords: unique([
            ...(Array.isArray(existing.keywords) ? existing.keywords.map(String) : []),
            ...incoming.keywords,
        ]),
        factIds: unique([
            ...(Array.isArray(existing.factIds) ? existing.factIds.map(String) : []),
            ...incoming.factIds,
        ]),
        fields,
    };
}
function unique(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

},
"features/processing/schemas": function(module, exports, require) {
/* Generated from src/features/processing/schemas.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtractionResultSchema = exports.RevisionResultSchema = exports.AuditResultSchema = void 0;
const zod_1 = require("zod");
exports.AuditResultSchema = zod_1.z.object({
    passed: zod_1.z.boolean(),
    decision: zod_1.z.enum(['pass', 'revise', 'block']),
    reason: zod_1.z.string(),
    violations: zod_1.z.array(zod_1.z.object({
        ruleId: zod_1.z.string(),
        rule: zod_1.z.string(),
        evidence: zod_1.z.string(),
        action: zod_1.z.string(),
    })),
    preserve: zod_1.z.array(zod_1.z.string()),
    rewriteInstruction: zod_1.z.string(),
    replacementText: zod_1.z.string().optional(),
});
exports.RevisionResultSchema = zod_1.z.object({
    text: zod_1.z.string().min(1),
    appliedContentHash: zod_1.z.string().optional(),
});
exports.ExtractionResultSchema = zod_1.z.object({
    turnSummary: zod_1.z.string(),
    facts: zod_1.z.array(zod_1.z.object({
        eventName: zod_1.z.string(),
        tableKey: zod_1.z.string(),
        objectName: zod_1.z.string(),
        semanticLayer: zod_1.z.string(),
        fact: zod_1.z.string(),
    })),
    appliedContentHash: zod_1.z.string().optional(),
    protocolVersion: zod_1.z.string().optional(),
});

},
"features/processing/service": function(module, exports, require) {
/* Generated from src/features/processing/service.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessingService = void 0;
const audit_1 = require("prompts/audit");
const extraction_1 = require("prompts/extraction");
const revision_1 = require("prompts/revision");
const errors_1 = require("shared/errors");
const hash_1 = require("shared/hash");
const schemas_1 = require("features/processing/schemas");
const parsers_1 = require("features/processing/parsers");
const reducer_1 = require("features/processing/reducer");
/** 一条正文的真实纵向闭环：审核 → 必要修正 → 提取 → 持久化。 */
class ProcessingService {
    constructor(repository, messages, model) {
        this.repository = repository;
        this.messages = messages;
        this.model = model;
    }
    async process(token, settings, hooks, requestedIndex) {
        let snapshot = await this.messages.getAssistantMessage(token, requestedIndex);
        hooks.started(snapshot.messageIndex, snapshot.messageKey);
        let document = structuredClone(await this.repository.loadCurrent(token));
        let record = (0, reducer_1.ensureMessageRecord)(document, snapshot);
        const audit = await this.audit(token, settings, document, record, snapshot.playerText, hooks);
        if (audit.decision === 'block')
            throw new errors_1.MirrorAbyssError('AUDIT_BLOCKED', audit.reason, 'audit');
        if (audit.decision === 'revise') {
            if (!settings.autoRevision)
                throw new errors_1.MirrorAbyssError('REVISION_REQUIRED', audit.reason, 'revision');
            const revision = await this.revision(token, settings, document, record, snapshot.playerText, audit, hooks);
            if (!revision.appliedContentHash) {
                snapshot = await this.messages.replaceText(token, snapshot, revision.text);
                revision.appliedContentHash = snapshot.contentHash;
                record.visibleContentHash = snapshot.contentHash;
                record.stages.revision = completedStage(revisionInputHash(settings, record, audit), revision);
                document = await this.commit(token, document, hooks, false);
            }
            else {
                snapshot = await this.messages.getAssistantMessage(token, snapshot.messageIndex);
                if (snapshot.contentHash !== revision.appliedContentHash) {
                    throw new errors_1.MirrorAbyssError('MESSAGE_CHANGED', '已记录的修正文与当前可见正文不一致', 'revision');
                }
            }
        }
        hooks.stage('extraction', '提取本轮明确成立的扁平事实');
        const previouslyAppliedParse = schemas_1.ExtractionResultSchema.safeParse(record.stages.extraction?.result);
        const previouslyApplied = previouslyAppliedParse.success
            ? previouslyAppliedParse.data
            : null;
        if (previouslyApplied
            && previouslyApplied.protocolVersion === extraction_1.EXTRACTION_PROMPT_VERSION
            && previouslyApplied.appliedContentHash === snapshot.contentHash) {
            hooks.stage('complete', `已复用完成结果，共 ${previouslyApplied.facts.length} 条事实`);
            return document;
        }
        const stateContextHash = (0, hash_1.hashText)(JSON.stringify({ tables: document.tables, facts: document.facts }));
        const extractionHash = (0, hash_1.hashText)([extraction_1.EXTRACTION_PROMPT_VERSION, snapshot.contentHash, snapshot.playerText, stateContextHash].join('|'));
        let extraction = cachedResult(record.stages.extraction, extractionHash, (value) => schemas_1.ExtractionResultSchema.parse(value));
        if (!extraction) {
            const raw = await this.model.generate({
                systemPrompt: (0, extraction_1.extractionSystemPrompt)(),
                prompt: (0, extraction_1.extractionUserPrompt)(snapshot.playerText, snapshot.text, document),
                responseLength: settings.extractionResponseTokens,
                timeoutMs: settings.requestTimeoutMs,
                signal: token.signal,
            });
            extraction = { ...(0, parsers_1.parseExtractionOutput)(raw), protocolVersion: extraction_1.EXTRACTION_PROMPT_VERSION };
            record.stages.extraction = completedStage(extractionHash, extraction);
            document = await this.commit(token, document, hooks, false); // 先保存昂贵模型结果，失败后可复用。
        }
        (0, reducer_1.applyExtraction)(document, record.messageKey, extraction);
        extraction.appliedContentHash = snapshot.contentHash;
        extraction.protocolVersion = extraction_1.EXTRACTION_PROMPT_VERSION;
        record.stages.extraction = completedStage(extractionHash, extraction);
        record.visibleContentHash = snapshot.contentHash;
        document.recordingBoundary ?? (document.recordingBoundary = { messageIndex: record.messageIndex, messageKey: record.messageKey });
        document = await this.commit(token, document, hooks, true);
        hooks.stage('complete', `已写入 ${extraction.facts.length} 条事实`);
        return document;
    }
    async audit(token, settings, document, record, playerText, hooks) {
        if (!settings.auditEnabled)
            return { passed: true, decision: 'pass', reason: '审核未启用', violations: [], preserve: [], rewriteInstruction: '' };
        if (!settings.auditRules.trim())
            throw new Error('审核已启用，但审核规则为空');
        hooks.stage('audit', '按玩家硬规则审核正文');
        const inputHash = (0, hash_1.hashText)([audit_1.AUDIT_PROMPT_VERSION, settings.auditRules, playerText, record.sourceContentHash].join('|'));
        const cached = cachedResult(record.stages.audit, inputHash, (value) => schemas_1.AuditResultSchema.parse(value));
        if (cached)
            return cached;
        const raw = await this.model.generate({
            systemPrompt: (0, audit_1.auditSystemPrompt)(),
            prompt: (0, audit_1.auditUserPrompt)(settings.auditRules, playerText, record.sourceText),
            responseLength: settings.auditResponseTokens,
            timeoutMs: settings.requestTimeoutMs,
            signal: token.signal,
        });
        const result = (0, parsers_1.parseAuditOutput)(raw);
        record.stages.audit = completedStage(inputHash, result);
        await this.commit(token, document, hooks, false);
        return result;
    }
    async revision(token, settings, document, record, playerText, audit, hooks) {
        hooks.stage('revision', '生成并应用最小修正版');
        const inputHash = revisionInputHash(settings, record, audit);
        const cached = cachedResult(record.stages.revision, inputHash, (value) => schemas_1.RevisionResultSchema.parse(value));
        if (cached)
            return cached;
        const text = audit.replacementText?.trim() || await this.model.generate({
            systemPrompt: (0, revision_1.revisionSystemPrompt)(settings.revisionInstructions),
            prompt: (0, revision_1.revisionUserPrompt)(settings.auditRules, playerText, record.sourceText, audit),
            responseLength: settings.revisionResponseTokens,
            timeoutMs: settings.requestTimeoutMs,
            signal: token.signal,
        });
        const result = { text: text.trim() };
        record.stages.revision = completedStage(inputHash, result);
        await this.commit(token, document, hooks, false); // 候选修正文先落盘；应用失败时不重复调用模型。
        return result;
    }
    async commit(token, document, hooks, publishableChange) {
        hooks.stage('saving', '保存当前聊天 ChatDocument');
        document.revision += 1;
        document.updatedAt = Date.now();
        // FACT-DATA-005 / EVT-20260726-006：审核缓存等恢复信息不应触发世界书重发。
        if (publishableChange)
            document.publication.targetRevision = document.revision;
        await this.repository.saveCurrent(token, document);
        hooks.committed(structuredClone(document));
        return document;
    }
}
exports.ProcessingService = ProcessingService;
function completedStage(inputHash, result) {
    return { inputHash, completedAt: Date.now(), result: structuredClone(result) };
}
function cachedResult(stage, inputHash, parse) {
    if (!stage || stage.inputHash !== inputHash || stage.error || stage.result === undefined)
        return null;
    try {
        return parse(stage.result);
    }
    catch {
        // 无效旧缓存不进入业务层；按当前协议重新请求即可。
        return null;
    }
}
function revisionInputHash(settings, record, audit) {
    return (0, hash_1.hashText)([revision_1.REVISION_PROMPT_VERSION, settings.auditRules, settings.revisionInstructions, record.sourceContentHash, JSON.stringify(audit)].join('|'));
}

},
"features/processing/types": function(module, exports, require) {
/* Generated from src/features/processing/types.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

},
"features/session/session-slice": function(module, exports, require) {
/* Generated from src/features/session/session-slice.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionReducer = exports.sessionActions = void 0;
const toolkit_1 = require("@reduxjs/toolkit");
const initialState = {
    activeChatKey: null,
    generation: 0,
    status: 'idle',
    error: null,
};
const sessionSlice = (0, toolkit_1.createSlice)({
    name: 'session',
    initialState,
    reducers: {
        chatChanged(state, action) {
            state.activeChatKey = action.payload.chatKey;
            state.generation = action.payload.generation;
            state.status = action.payload.chatKey ? 'loading-chat' : 'idle';
            state.error = null;
        },
        ready(state) {
            state.status = 'ready';
            state.error = null;
        },
        failed(state, action) {
            state.status = 'error';
            state.error = action.payload;
        },
        disabled(state) {
            state.status = 'disabled';
            state.error = null;
        },
    },
});
exports.sessionActions = sessionSlice.actions;
exports.sessionReducer = sessionSlice.reducer;

},
"features/settings/settings-slice": function(module, exports, require) {
/* Generated from src/features/settings/settings-slice.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsReducer = exports.settingsActions = void 0;
const toolkit_1 = require("@reduxjs/toolkit");
const settings_1 = require("model/settings");
const slice = (0, toolkit_1.createSlice)({
    name: 'settings',
    initialState: settings_1.DEFAULT_SETTINGS,
    reducers: {
        loaded(_state, action) { return action.payload; },
        patchRequested(_state, _action) { },
        patched(state, action) {
            Object.assign(state, action.payload);
        },
    },
});
exports.settingsActions = slice.actions;
exports.settingsReducer = slice.reducer;

},
"host/message-gateway": function(module, exports, require) {
/* Generated from src/host/message-gateway.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageGateway = void 0;
const errors_1 = require("shared/errors");
const hash_1 = require("shared/hash");
const MESSAGE_NAMESPACE = 'mirrorAbyssV2';
/**
 * 正文读取和替换的唯一边界。
 * FACT-RUN-001 / FACT-CONTENT-002：每次操作固定 chatKey；替换后必须重新读取并校验哈希。
 */
class MessageGateway {
    constructor(host, session) {
        this.host = host;
        this.session = session;
    }
    async getAssistantMessage(token, requestedIndex) {
        this.assertTarget(token);
        const context = this.host.getContext();
        const chat = context.chat ?? [];
        const index = requestedIndex ?? findLatestAssistantIndex(chat);
        if (index < 0)
            throw new errors_1.MirrorAbyssError('NO_ASSISTANT_MESSAGE', '当前聊天没有可处理的 AI 正文');
        const message = chat[index];
        if (!isAssistantMessage(message))
            throw new errors_1.MirrorAbyssError('NO_ASSISTANT_MESSAGE', `第 ${index} 条不是可处理的 AI 正文`);
        const messageKey = await this.ensureMessageKey(token, index, message);
        this.assertTarget(token);
        return {
            messageKey,
            messageIndex: index,
            text: String(message.mes ?? ''),
            contentHash: (0, hash_1.hashText)(String(message.mes ?? '')),
            playerText: previousPlayerText(chat, index),
        };
    }
    async replaceText(token, snapshot, text) {
        this.assertTarget(token);
        const context = this.host.getContext();
        const message = context.chat?.[snapshot.messageIndex];
        if (!isAssistantMessage(message))
            throw new errors_1.MirrorAbyssError('MESSAGE_CHANGED', '待修正消息已不存在');
        if (readMessageKey(message) !== snapshot.messageKey || (0, hash_1.hashText)(String(message.mes ?? '')) !== snapshot.contentHash) {
            throw new errors_1.MirrorAbyssError('MESSAGE_CHANGED', '修正前正文已经变化，拒绝覆盖');
        }
        message.mes = text;
        if (Array.isArray(message.swipes) && Number.isInteger(message.swipe_id) && message.swipe_id >= 0) {
            message.swipes[message.swipe_id] = text;
        }
        context.updateMessageBlock?.(snapshot.messageIndex, message);
        await this.host.saveCurrentChat();
        this.assertTarget(token);
        const verified = context.chat?.[snapshot.messageIndex];
        if (!isAssistantMessage(verified) || readMessageKey(verified) !== snapshot.messageKey) {
            throw new errors_1.MirrorAbyssError('MESSAGE_CHANGED', '修正后无法重新定位正文');
        }
        const verifiedText = String(verified.mes ?? '');
        const verifiedHash = (0, hash_1.hashText)(verifiedText);
        if (verifiedHash !== (0, hash_1.hashText)(text)) {
            throw new errors_1.MirrorAbyssError('MESSAGE_CHANGED', 'SillyTavern 回读正文与修正结果不一致');
        }
        return { ...snapshot, text: verifiedText, contentHash: verifiedHash };
    }
    async ensureMessageKey(token, index, message) {
        const existing = readMessageKey(message);
        if (existing)
            return existing;
        const context = this.host.getContext();
        const generated = context.uuidv4?.() ?? crypto.randomUUID();
        const extra = (message.extra ?? (message.extra = {}));
        extra[MESSAGE_NAMESPACE] = { messageKey: generated };
        context.updateMessageBlock?.(index, message);
        await this.host.saveCurrentChat();
        this.assertTarget(token);
        return generated;
    }
    assertTarget(token) {
        this.session.assertCurrent(token);
        if (!token.chatKey || !this.host.isCurrentChat(token.chatKey)) {
            throw new errors_1.MirrorAbyssError('STALE_CHAT', '聊天已经切换，拒绝继续操作');
        }
    }
}
exports.MessageGateway = MessageGateway;
function readMessageKey(message) {
    const value = message.extra?.[MESSAGE_NAMESPACE];
    return value && typeof value === 'object' && typeof value.messageKey === 'string' ? value.messageKey : '';
}
function isAssistantMessage(message) {
    return Boolean(message && !message.is_user && !message.is_system && typeof message.mes === 'string' && message.mes.trim());
}
function findLatestAssistantIndex(chat) {
    for (let index = chat.length - 1; index >= 0; index -= 1)
        if (isAssistantMessage(chat[index]))
            return index;
    return -1;
}
function previousPlayerText(chat, before) {
    for (let index = before - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (message?.is_user && !message.is_system && typeof message.mes === 'string')
            return message.mes;
    }
    return '';
}

},
"host/model-gateway": function(module, exports, require) {
/* Generated from src/host/model-gateway.ts. */
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelGateway = void 0;
const p_queue_1 = __importDefault(require("p-queue"));
const errors_1 = require("shared/errors");
/**
 * 当前连接模型调用边界。调用形式直接采用 SillyTavern 官方 memory 扩展使用的 generateRaw(params)。
 * FACT-HOST-003：不做多级 API fallback，也不猜测十几种响应包络。
 * FACT-HOST-004 / EVT-20260726-006：当前未确认 generateRaw 支持单请求 AbortSignal，
 * 因此插件模型调用在这里单通道串行；聊天切换后等待宿主请求自然结束，再丢弃旧结果。
 */
class ModelGateway {
    constructor(host) {
        this.host = host;
        this.requestQueue = new p_queue_1.default({ concurrency: 1 });
    }
    async generate(request) {
        const result = await this.requestQueue.add(async () => {
            if (request.signal.aborted)
                throw abortError();
            const generateRaw = this.host.getContext().generateRaw;
            if (typeof generateRaw !== 'function') {
                throw new errors_1.MirrorAbyssError('HOST_API_UNAVAILABLE', '当前 SillyTavern 未提供 generateRaw');
            }
            const startedAt = Date.now();
            const raw = await generateRaw({
                prompt: request.prompt,
                systemPrompt: request.systemPrompt,
                responseLength: request.responseLength,
            });
            const elapsedMs = Date.now() - startedAt;
            // 不让已经切换聊天的结果进入下一阶段，但也不使用无法真正中止上游的伪超时竞速。
            if (request.signal.aborted)
                throw abortError();
            if (elapsedMs > request.timeoutMs) {
                console.warn(`[MirrorAbyss] 模型请求耗时 ${elapsedMs}ms，超过软时限 ${request.timeoutMs}ms；结果仍按真实返回处理。`);
            }
            const text = typeof raw === 'string' ? raw.trim() : '';
            if (!text)
                throw new errors_1.MirrorAbyssError('EMPTY_RESPONSE', '模型返回为空');
            return text;
        });
        if (typeof result !== 'string') {
            throw new errors_1.MirrorAbyssError('EMPTY_RESPONSE', '模型请求未返回文本');
        }
        return result;
    }
}
exports.ModelGateway = ModelGateway;
function abortError() {
    return new DOMException('请求已因聊天切换或插件停用而作废', 'AbortError');
}

},
"host/settings-repository": function(module, exports, require) {
/* Generated from src/host/settings-repository.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsRepository = void 0;
const constants_1 = require("constants");
const settings_1 = require("model/settings");
/** 插件全局设置只存 extensionSettings，不进入 ChatDocument。 */
class SettingsRepository {
    constructor(host) {
        this.host = host;
    }
    load() {
        const context = this.host.getContext();
        const root = (context.extensionSettings ?? (context.extensionSettings = {}));
        const namespace = readNamespace(root[constants_1.EXTENSION_NAMESPACE]);
        const settings = (0, settings_1.parseSettings)(namespace.settings ?? settings_1.DEFAULT_SETTINGS);
        root[constants_1.EXTENSION_NAMESPACE] = { ...namespace, settings: structuredClone(settings) };
        return settings;
    }
    save(patch) {
        const context = this.host.getContext();
        const root = (context.extensionSettings ?? (context.extensionSettings = {}));
        const namespace = readNamespace(root[constants_1.EXTENSION_NAMESPACE]);
        const settings = (0, settings_1.parseSettings)({ ...this.load(), ...patch });
        root[constants_1.EXTENSION_NAMESPACE] = { ...namespace, settings: structuredClone(settings) };
        context.saveSettingsDebounced?.();
        return settings;
    }
}
exports.SettingsRepository = SettingsRepository;
function readNamespace(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}

},
"host/silly-tavern": function(module, exports, require) {
/* Generated from src/host/silly-tavern.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SillyTavernGateway = void 0;
/** SillyTavern 公共上下文的唯一入口；其他模块不得缓存宿主可变对象。 */
class SillyTavernGateway {
    getContext() {
        const context = globalThis.SillyTavern?.getContext?.();
        if (!context)
            throw new Error('SillyTavern 上下文尚未就绪');
        return context;
    }
    getCurrentChatKey() {
        const context = this.getContext();
        const chatId = context.getCurrentChatId?.() ?? context.chatId ?? context.chat_metadata?.chat_id ?? null;
        if (chatId === null || chatId === undefined || String(chatId) === '')
            return null;
        const scope = this.getScopeKey(context);
        return `${scope}:${hashText(`${scope}|${String(chatId)}`)}`;
    }
    isCurrentChat(chatKey) { return this.getCurrentChatKey() === chatKey; }
    subscribeChatChanged(handler) { return this.subscribe('CHAT_CHANGED', handler); }
    subscribeMessageReceived(handler) {
        return this.subscribe('MESSAGE_RECEIVED', (value) => handler(Number(value)));
    }
    subscribeMessageChanged(handler) {
        const removers = ['MESSAGE_UPDATED', 'MESSAGE_EDITED', 'MESSAGE_SWIPED']
            .map((name) => this.subscribe(name, (value) => handler(Number(value)), false))
            .filter((value) => Boolean(value));
        return () => removers.forEach((remove) => remove());
    }
    async saveCurrentChatMetadata() {
        const save = this.getContext().saveMetadata;
        if (typeof save !== 'function')
            throw new Error('当前 SillyTavern 未提供 saveMetadata');
        await save();
    }
    async saveCurrentChat() {
        const save = this.getContext().saveChat;
        if (typeof save !== 'function')
            throw new Error('当前 SillyTavern 未提供 saveChat');
        await save();
    }
    subscribe(name, handler, required = true) {
        const context = this.getContext();
        // FACT-HOST-001：官方当前接口提供 eventTypes，同时保留 event_types 兼容别名。
        const events = context.eventTypes ?? context.event_types ?? {};
        const event = events[name];
        if (!event) {
            if (required)
                throw new Error(`当前 SillyTavern 未提供 ${name} 事件`);
            return null;
        }
        context.eventSource.on(event, handler);
        return () => {
            if (typeof context.eventSource.off === 'function')
                context.eventSource.off(event, handler);
            else
                context.eventSource.removeListener?.(event, handler);
        };
    }
    getScopeKey(context) {
        if (context.groupId !== null && context.groupId !== undefined)
            return `group:${String(context.groupId)}`;
        if (context.characterId !== null && context.characterId !== undefined)
            return `character:${String(context.characterId)}`;
        return `character-name:${context.name2 || 'unknown'}`;
    }
}
exports.SillyTavernGateway = SillyTavernGateway;
function hashText(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}

},
"index": function(module, exports, require) {
/* Generated from src/index.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onActivate = onActivate;
exports.onEnable = onEnable;
exports.onDisable = onDisable;
exports.onDelete = onDelete;
const application_1 = require("app/application");
/**
 * SillyTavern 生命周期入口。
 * 这里不包含业务逻辑，只转发到唯一应用实例。
 */
async function onActivate() {
    await (0, application_1.getApplication)().start();
}
async function onEnable() {
    await (0, application_1.getApplication)().start();
}
function onDisable() {
    (0, application_1.getApplication)().stop();
}
function onDelete() {
    (0, application_1.getApplication)().stop();
}

},
"model/chat-document": function(module, exports, require) {
/* Generated from src/model/chat-document.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptyChatDocument = createEmptyChatDocument;
const constants_1 = require("constants");
function createEmptyChatDocument(chatKey, now = Date.now()) {
    const tables = Object.fromEntries(constants_1.DEFAULT_TABLE_KEYS.map((key) => [key, []]));
    return {
        schemaVersion: constants_1.CHAT_DOCUMENT_SCHEMA_VERSION,
        chatKey, revision: 0, createdAt: now, updatedAt: now,
        recordingBoundary: null, focusObjectId: null, lastTurnSummary: '',
        messages: {}, facts: {}, tables,
        summaries: { small: [], large: [] }, rebuildDraft: null,
        publication: { targetRevision: 0, publishedRevision: 0, lastError: null },
    };
}

},
"model/schemas": function(module, exports, require) {
/* Generated from src/model/schemas.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatDocumentSchema = void 0;
exports.parseChatDocument = parseChatDocument;
const zod_1 = require("zod");
const constants_1 = require("constants");
const CachedStageSchema = zod_1.z.object({
    inputHash: zod_1.z.string().min(1), completedAt: zod_1.z.number().int().nonnegative().optional(),
    result: zod_1.z.unknown().optional(), error: zod_1.z.string().optional(),
});
const MessageRecordSchema = zod_1.z.object({
    messageKey: zod_1.z.string().min(1), messageIndex: zod_1.z.number().int().nonnegative(),
    sourceText: zod_1.z.string(), sourceContentHash: zod_1.z.string().min(1), visibleContentHash: zod_1.z.string().min(1),
    stages: zod_1.z.object({
        audit: CachedStageSchema.optional(), revision: CachedStageSchema.optional(),
        extraction: CachedStageSchema.optional(), smallSummary: CachedStageSchema.optional(),
        largeSummary: CachedStageSchema.optional(),
    }),
});
const FactRecordSchema = zod_1.z.object({
    id: zod_1.z.string().min(1), tableKey: zod_1.z.string().min(1), objectId: zod_1.z.string().min(1),
    sourceMessageKey: zod_1.z.string().min(1), value: zod_1.z.unknown(), updatedAt: zod_1.z.number().int().nonnegative(),
});
const SummaryRecordSchema = zod_1.z.object({
    id: zod_1.z.string().min(1), content: zod_1.z.string(), sourceMessageKeys: zod_1.z.array(zod_1.z.string()), createdAt: zod_1.z.number().int().nonnegative(),
});
const TableRowSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown());
exports.ChatDocumentSchema = zod_1.z.lazy(() => zod_1.z.object({
    schemaVersion: zod_1.z.literal(constants_1.CHAT_DOCUMENT_SCHEMA_VERSION), chatKey: zod_1.z.string().min(1),
    revision: zod_1.z.number().int().nonnegative(), createdAt: zod_1.z.number().int().nonnegative(), updatedAt: zod_1.z.number().int().nonnegative(),
    recordingBoundary: zod_1.z.object({ messageIndex: zod_1.z.number().int().nonnegative(), messageKey: zod_1.z.string().nullable() }).nullable(),
    focusObjectId: zod_1.z.string().nullable(), lastTurnSummary: zod_1.z.string(),
    messages: zod_1.z.record(zod_1.z.string(), MessageRecordSchema), facts: zod_1.z.record(zod_1.z.string(), FactRecordSchema),
    tables: zod_1.z.record(zod_1.z.string(), zod_1.z.array(TableRowSchema)),
    summaries: zod_1.z.object({ small: zod_1.z.array(SummaryRecordSchema), large: zod_1.z.array(SummaryRecordSchema) }),
    rebuildDraft: zod_1.z.object({ sourceHash: zod_1.z.string().min(1), cursor: zod_1.z.number().int().nonnegative(), updatedAt: zod_1.z.number().int().nonnegative(), document: zod_1.z.unknown() })
        .nullable().transform((value) => value),
    publication: zod_1.z.object({ targetRevision: zod_1.z.number().int().nonnegative(), publishedRevision: zod_1.z.number().int().nonnegative(), lastError: zod_1.z.string().nullable() }),
}));
function parseChatDocument(value) { return exports.ChatDocumentSchema.parse(value); }

},
"model/settings": function(module, exports, require) {
/* Generated from src/model/settings.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = exports.SettingsSchema = void 0;
exports.parseSettings = parseSettings;
const zod_1 = require("zod");
exports.SettingsSchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
    autoProcess: zod_1.z.boolean(),
    auditEnabled: zod_1.z.boolean(),
    autoRevision: zod_1.z.boolean(),
    auditRules: zod_1.z.string(),
    revisionInstructions: zod_1.z.string(),
    requestTimeoutMs: zod_1.z.number().int().min(10000).max(300000),
    auditResponseTokens: zod_1.z.number().int().min(256).max(16384),
    revisionResponseTokens: zod_1.z.number().int().min(256).max(16384),
    extractionResponseTokens: zod_1.z.number().int().min(256).max(16384),
});
exports.DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    autoProcess: false,
    auditEnabled: false,
    autoRevision: true,
    auditRules: '',
    revisionInstructions: '',
    requestTimeoutMs: 90000,
    auditResponseTokens: 4096,
    revisionResponseTokens: 4096,
    extractionResponseTokens: 4096,
});
function parseSettings(value) {
    const candidate = value && typeof value === 'object' ? value : {};
    return exports.SettingsSchema.parse({ ...exports.DEFAULT_SETTINGS, ...candidate });
}

},
"prompts/audit": function(module, exports, require) {
/* Generated from src/prompts/audit.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUDIT_PROMPT_VERSION = void 0;
exports.auditSystemPrompt = auditSystemPrompt;
exports.auditUserPrompt = auditUserPrompt;
/**
 * 从 alpha.27 的审核固定文本协议迁移。业务语义不在本次重构中改写。
 * FACT-MODEL-001：审核只判断玩家硬规则，不续写、不润色。
 */
exports.AUDIT_PROMPT_VERSION = 'audit-fixed-text-v1';
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
- pass：没有明确违规，不输出违规和替换正文。
- revise：可以在不改变已经成立的外部事件、NPC行为和事件顺序的前提下定向修正。
- block：整段内容建立在违规前提上，无法局部修正而不重构剧情。

只列出有明确证据的违规；修改指令必须具体；字段外层标签必须保持。`;
}
function auditUserPrompt(rules, playerText, assistantText) {
    return `【玩家审核规则】\n${rules}\n\n【玩家本轮输入】\n${playerText || '（空）'}\n\n【待审核AI正文】\n${assistantText}`;
}

},
"prompts/extraction": function(module, exports, require) {
/* Generated from src/prompts/extraction.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTRACTION_PROMPT_VERSION = void 0;
exports.extractionSystemPrompt = extractionSystemPrompt;
exports.extractionUserPrompt = extractionUserPrompt;
exports.EXTRACTION_PROMPT_VERSION = 'flat-facts-v1';
const TABLE_DESCRIPTION = `时空：当前时间、时间推进、总体位置和环境连续性
场景：当前实际发生的场景、参与对象、核心局面和直接限制
角色：具体个体已经明确成立的身份、关系、状态和变化
物品：可区分物品的所有权、位置、数量、完整性、可用性和用途
事件：事件动作骨架、进展、结果和当前状态
地点：地点自身稳定属性与已发生改变
全局变化：组织、制度、阵营、政权、群体格局和全局影响
基础设定：世界规则、物种规则、制度基础等明确设定
自定义对象：用户自定义且不属于以上类别的对象`;
/**
 * 从 alpha.27 的扁平事实协议迁移。这里只发送少量相关旧行，避免再次出现三四万字输入。
 */
function extractionSystemPrompt() {
    return `“镜渊”无观点事实书记｜扁平事实协议

职责：只提取本轮正文明确建立的短事实。禁止评论、预测、补全、判断价值或决定删除。
禁止 JSON、Markdown 代码块、思考过程和块外说明。

唯一输出结构：
<MA_TURN>
本轮最短变化概括
</MA_TURN>

每条独立事实：
<MA_FACT>
事件：稳定、可读的变化链名称
表格：时空|场景|角色|物品|事件|地点|全局变化|基础设定|自定义对象
对象：该事实唯一主体的稳定名称
语义层：身份定义|现行事实|当前状态|关系状态|能力状态|外观表现|动作骨架
事实：正文明确建立的一句当前结果
</MA_FACT>

当前表格含义：
${TABLE_DESCRIPTION}

硬限制：
1. 每个事实块只写一个主体、一个角度、一个已发生结果。
2. 没有独立变化的对象不输出；背景板、围观者和普通服装描写默认不建档。
3. 身份定义只用于正文明确改变对象本质；短期变化写现行事实或当前状态。
4. 不写生命周期、稳定ID、事实ID、建议或未知可能性。
5. 无事实变化时只返回一个 MA_TURN。`;
}
function extractionUserPrompt(playerText, assistantText, document) {
    const rows = Object.entries(document.tables)
        .flatMap(([tableKey, tableRows]) => tableRows.slice(-2).map((row) => ({ tableKey, row })))
        .slice(-12)
        .map(({ tableKey, row }) => `${tableKey}｜${String(row.title ?? '')}：${String(row.content ?? '')}`)
        .join('\n');
    return `【少量相关旧状态，仅用于身份延续】\n${rows || '（无）'}\n\n【玩家输入】\n${playerText || '（空）'}\n\n【本轮最终可见正文】\n${assistantText}\n\n只返回固定文本协议。`;
}

},
"prompts/revision": function(module, exports, require) {
/* Generated from src/prompts/revision.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REVISION_PROMPT_VERSION = void 0;
exports.revisionSystemPrompt = revisionSystemPrompt;
exports.revisionUserPrompt = revisionUserPrompt;
exports.REVISION_PROMPT_VERSION = 'revision-fixed-text-v1';
function revisionSystemPrompt(customPrompt) {
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
function revisionUserPrompt(rules, playerText, sourceText, audit) {
    const violations = audit.violations
        .map((item, index) => `${index + 1}. 规则：${item.rule}\n   证据：${item.evidence}\n   修改：${item.action}`)
        .join('\n');
    const preserve = audit.preserve.length
        ? audit.preserve.map((item) => `- ${item}`).join('\n')
        : '- 原正文中全部已成立的外部事实';
    return `【玩家硬性规则】\n${rules}\n\n【玩家本轮输入】\n${playerText || '（空）'}\n\n【必须修正的问题】\n${violations || audit.reason}\n\n【必须保留】\n${preserve}\n\n【审核器综合修改指令】\n${audit.rewriteInstruction || audit.reason}\n\n【待修正文】\n${sourceText}\n\n只输出修正后的完整正文。`;
}

},
"repository/chat-document-repository": function(module, exports, require) {
/* Generated from src/repository/chat-document-repository.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatDocumentRepository = void 0;
const constants_1 = require("constants");
const chat_document_1 = require("model/chat-document");
const schemas_1 = require("model/schemas");
/**
 * ChatDocument 的唯一物理持久化边界。
 * 它只允许读写当前聊天，禁止后台任务通过“当前上下文”猜测旧聊天目标。
 */
class ChatDocumentRepository {
    constructor(host, session) {
        this.host = host;
        this.session = session;
    }
    async loadCurrent(token) {
        this.assertWritableTarget(token);
        const context = this.host.getContext();
        const namespace = this.readNamespace(context);
        if (namespace.document === undefined) {
            return (0, chat_document_1.createEmptyChatDocument)(token.chatKey);
        }
        const document = (0, schemas_1.parseChatDocument)(namespace.document);
        if (document.chatKey !== token.chatKey) {
            throw new Error('聊天元数据中的 ChatDocument 与当前聊天身份不一致');
        }
        this.assertWritableTarget(token);
        return document;
    }
    async saveCurrent(token, document) {
        this.assertWritableTarget(token);
        if (document.chatKey !== token.chatKey) {
            throw new Error('拒绝把 ChatDocument 写入其他聊天');
        }
        const validated = (0, schemas_1.parseChatDocument)(document);
        const context = this.host.getContext();
        const metadata = (context.chatMetadata ?? (context.chatMetadata = {}));
        const previous = metadata[constants_1.EXTENSION_NAMESPACE];
        metadata[constants_1.EXTENSION_NAMESPACE] = {
            document: structuredClone(validated),
        };
        try {
            this.assertWritableTarget(token);
            await this.host.saveCurrentChatMetadata();
            this.assertWritableTarget(token);
        }
        catch (error) {
            // 保存失败时恢复当前内存引用，避免 UI 误读未持久化数据。
            if (previous === undefined) {
                delete metadata[constants_1.EXTENSION_NAMESPACE];
            }
            else {
                metadata[constants_1.EXTENSION_NAMESPACE] = previous;
            }
            throw error;
        }
    }
    readNamespace(context) {
        const value = context.chatMetadata?.[constants_1.EXTENSION_NAMESPACE];
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value;
    }
    assertWritableTarget(token) {
        this.session.assertCurrent(token);
        if (!token.chatKey || !this.host.isCurrentChat(token.chatKey)) {
            throw new Error('当前 SillyTavern 聊天已变化，拒绝继续读写');
        }
    }
}
exports.ChatDocumentRepository = ChatDocumentRepository;

},
"shared/diagnostics": function(module, exports, require) {
/* Generated from src/shared/diagnostics.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDiagnosticReport = createDiagnosticReport;
const constants_1 = require("constants");
/**
 * 只输出宿主能力、阶段状态和数量，不包含正文、事实内容、规则文本或角色名称。
 * 该 JSON 用于实机留证，避免用户只能依赖截图描述错误。
 */
function createDiagnosticReport(input) {
    const host = readHostCapabilities();
    const document = input.document;
    const tableCounts = Object.fromEntries(constants_1.DEFAULT_TABLE_KEYS.map((key) => [key, document?.tables[key]?.length ?? 0]));
    return {
        version: constants_1.VERSION,
        generatedAt: new Date().toISOString(),
        runtimeProvider: globalThis.__MIRROR_ABYSS_RUNTIME_PROVIDER__ ?? null,
        dependencyProviders: globalThis.__MIRROR_ABYSS_DEPENDENCY_PROVIDERS__ ?? {},
        bootstrap: globalThis.__MIRROR_ABYSS_BOOTSTRAP__ ?? null,
        environment: {
            userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
            location: typeof location === 'undefined' ? null : location.href,
        },
        host,
        session: {
            status: input.session.status,
            activeChatKey: input.session.activeChatKey,
            generation: input.session.generation,
            error: input.session.error,
        },
        processing: {
            status: input.processing.status,
            source: input.processing.source,
            messageIndex: input.processing.messageIndex,
            messageKey: input.processing.messageKey,
            detail: input.processing.detail,
            error: input.processing.error,
            lastCompletedAt: input.processing.lastCompletedAt,
        },
        document: document ? {
            schemaVersion: document.schemaVersion,
            chatKey: document.chatKey,
            revision: document.revision,
            updatedAt: document.updatedAt,
            messageRecordCount: Object.keys(document.messages).length,
            factCount: Object.keys(document.facts).length,
            tableCounts,
            publication: document.publication,
        } : null,
    };
}
function readHostCapabilities() {
    const getContext = globalThis.SillyTavern?.getContext;
    if (typeof getContext !== 'function') {
        return { getContext: false };
    }
    try {
        const context = getContext();
        const events = context?.eventTypes ?? context?.event_types ?? {};
        return {
            getContext: true,
            eventSource: Boolean(context?.eventSource && typeof context.eventSource.on === 'function'),
            eventTypes: Boolean(context?.eventTypes ?? context?.event_types),
            events: {
                CHAT_CHANGED: Boolean(events.CHAT_CHANGED),
                MESSAGE_RECEIVED: Boolean(events.MESSAGE_RECEIVED),
                MESSAGE_UPDATED: Boolean(events.MESSAGE_UPDATED),
                MESSAGE_EDITED: Boolean(events.MESSAGE_EDITED),
                MESSAGE_SWIPED: Boolean(events.MESSAGE_SWIPED),
            },
            chatArray: Array.isArray(context?.chat),
            chatMetadata: Boolean(context?.chatMetadata && typeof context.chatMetadata === 'object'),
            saveMetadata: typeof context?.saveMetadata === 'function',
            saveChat: typeof context?.saveChat === 'function',
            generateRaw: typeof context?.generateRaw === 'function',
            updateMessageBlock: typeof context?.updateMessageBlock === 'function',
        };
    }
    catch (error) {
        return {
            getContext: true,
            contextReadError: error instanceof Error ? error.message : String(error),
        };
    }
}

},
"shared/errors": function(module, exports, require) {
/* Generated from src/shared/errors.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MirrorAbyssError = void 0;
exports.errorMessage = errorMessage;
/** 统一错误对象，供 UI 显示 stage、chatKey 与 messageKey。 */
class MirrorAbyssError extends Error {
    constructor(code, message, stage, cause) {
        super(message);
        this.code = code;
        this.stage = stage;
        this.cause = cause;
        this.name = 'MirrorAbyssError';
    }
}
exports.MirrorAbyssError = MirrorAbyssError;
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

},
"shared/fixed-text": function(module, exports, require) {
/* Generated from src/shared/fixed-text.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBlocks = parseBlocks;
exports.field = field;
exports.fields = fields;
exports.normalizeKey = normalizeKey;
/**
 * 解析镜渊固定文本协议。允许“字段=值”和“字段：值”，不解析模型思考文本。
 * FACT-MODEL-002：边界适度宽容，但不会猜造缺失业务字段。
 */
function parseBlocks(raw, markers) {
    const text = raw.replace(/\r/g, '');
    const blocks = [];
    for (const marker of markers) {
        let cursor = 0;
        while (cursor < text.length) {
            const start = text.indexOf(marker.start, cursor);
            if (start < 0)
                break;
            const bodyStart = start + marker.start.length;
            const end = text.indexOf(marker.end, bodyStart);
            if (end < 0)
                break;
            const body = text.slice(bodyStart, end).trim();
            const fields = new Map();
            for (const line of body.split('\n')) {
                const match = line.match(/^\s*([^=：:]+?)\s*(?:=|：|:)\s*(.*)\s*$/u);
                if (!match)
                    continue;
                const key = normalizeKey(match[1] ?? '');
                const value = (match[2] ?? '').trim();
                if (!key)
                    continue;
                const values = fields.get(key) ?? [];
                values.push(value);
                fields.set(key, values);
            }
            blocks.push({ kind: marker.kind, body, fields });
            cursor = end + marker.end.length;
        }
    }
    return blocks.sort((left, right) => raw.indexOf(left.body) - raw.indexOf(right.body));
}
function field(block, ...keys) {
    for (const key of keys) {
        const values = block.fields.get(normalizeKey(key));
        if (values?.length)
            return values[0] ?? '';
    }
    return '';
}
function fields(block, ...keys) {
    const output = [];
    for (const key of keys) {
        output.push(...(block.fields.get(normalizeKey(key)) ?? []));
    }
    return output;
}
function normalizeKey(value) {
    return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/[\s_-]+/g, '');
}

},
"shared/hash": function(module, exports, require) {
/* Generated from src/shared/hash.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashText = hashText;
exports.normalizedIdentity = normalizedIdentity;
/**
 * 非密码学稳定哈希。只用于消息内容、提示词版本和事实键去重。
 * FACT-DATA-003：哈希相同才允许复用阶段结果；它不承担安全用途。
 */
function hashText(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}
function normalizedIdentity(value) {
    return value
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\s·•._—–\-|｜:：()（）【】\[\]<>《》“”"'`]+/gu, '');
}

},
"ui/App": function(module, exports, require) {
/* Generated from src/ui/App.tsx. */
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.App = App;
const react_1 = __importDefault(require("react"));
const constants_1 = require("constants");
const processing_slice_1 = require("features/processing/processing-slice");
const settings_slice_1 = require("features/settings/settings-slice");
const diagnostics_1 = require("shared/diagnostics");
const store_hooks_1 = require("ui/store-hooks");
const STATUS_TEXT = { idle: '等待聊天', 'loading-chat': '正在载入当前聊天', ready: '已就绪', error: '发生错误', disabled: '已禁用' };
const STAGE_TEXT = { idle: '空闲', loading: '读取消息', audit: '审核', revision: '修正', extraction: '事实提取', saving: '保存', complete: '完成', blocked: '已阻断', error: '失败' };
function App() {
    const dispatch = (0, store_hooks_1.useAppDispatch)();
    const session = (0, store_hooks_1.useAppSelector)((state) => state.session);
    const document = (0, store_hooks_1.useAppSelector)((state) => state.document.active);
    const processing = (0, store_hooks_1.useAppSelector)((state) => state.processing);
    const settings = (0, store_hooks_1.useAppSelector)((state) => state.settings);
    const busy = !['idle', 'complete', 'blocked', 'error'].includes(processing.status);
    const [diagnosticStatus, setDiagnosticStatus] = react_1.default.useState('');
    const runtimeProvider = globalThis.__MIRROR_ABYSS_RUNTIME_PROVIDER__ ?? '未记录';
    const dependencyProviders = globalThis.__MIRROR_ABYSS_DEPENDENCY_PROVIDERS__ ?? {};
    const copyDiagnostics = async () => {
        const report = (0, diagnostics_1.createDiagnosticReport)({ session, processing, document });
        const text = JSON.stringify(report, null, 2);
        try {
            await copyText(text);
            setDiagnosticStatus('诊断 JSON 已复制；可直接粘贴反馈。');
        }
        catch (error) {
            setDiagnosticStatus(`复制失败：${error instanceof Error ? error.message : String(error)}`);
        }
    };
    return react_1.default.createElement("section", { className: "mirror-abyss-v2-panel", "aria-label": "Mirror Abyss" },
        react_1.default.createElement("h3", null, "Mirror Abyss\uFF5C\u53EF\u5B89\u88C5\u5B9E\u673A\u5019\u9009"),
        react_1.default.createElement("div", { className: "mirror-abyss-v2-grid" },
            react_1.default.createElement("span", { className: "mirror-abyss-v2-label" }, "\u7248\u672C"),
            react_1.default.createElement("span", null, constants_1.VERSION),
            react_1.default.createElement("span", { className: "mirror-abyss-v2-label" }, "\u8FD0\u884C\u4F9D\u8D56"),
            react_1.default.createElement("span", null, runtimeProvider),
            react_1.default.createElement("span", { className: "mirror-abyss-v2-label" }, "\u5BBF\u4E3B\u72B6\u6001"),
            react_1.default.createElement("span", null, STATUS_TEXT[session.status]),
            react_1.default.createElement("span", { className: "mirror-abyss-v2-label" }, "\u5F53\u524D\u804A\u5929"),
            react_1.default.createElement("span", { className: "mirror-abyss-v2-value" }, session.activeChatKey ?? '未选择'),
            react_1.default.createElement("span", { className: "mirror-abyss-v2-label" }, "\u5904\u7406\u9636\u6BB5"),
            react_1.default.createElement("span", null,
                STAGE_TEXT[processing.status],
                processing.detail ? `｜${processing.detail}` : ''),
            react_1.default.createElement("span", { className: "mirror-abyss-v2-label" }, "\u6587\u6863\u7248\u672C"),
            react_1.default.createElement("span", null, document ? `revision ${document.revision}` : '尚未建立'),
            react_1.default.createElement("span", { className: "mirror-abyss-v2-label" }, "\u672C\u8F6E\u6982\u62EC"),
            react_1.default.createElement("span", null, document?.lastTurnSummary || '（无）')),
        react_1.default.createElement("div", { className: "mirror-abyss-v2-actions" },
            react_1.default.createElement("button", { className: "menu_button", disabled: busy || !session.activeChatKey, onClick: () => dispatch(processing_slice_1.processingActions.processRequested({ source: 'manual' })) }, "\u5904\u7406\u6700\u65B0 AI \u6B63\u6587"),
            react_1.default.createElement("button", { className: "menu_button", type: "button", onClick: copyDiagnostics }, "\u590D\u5236\u5B9E\u673A\u8BCA\u65AD JSON"),
            react_1.default.createElement("label", null,
                react_1.default.createElement("input", { type: "checkbox", checked: settings.autoProcess, onChange: (e) => dispatch(settings_slice_1.settingsActions.patchRequested({ autoProcess: e.target.checked })) }),
                " \u81EA\u52A8\u5904\u7406\u65B0\u6B63\u6587"),
            react_1.default.createElement("label", null,
                react_1.default.createElement("input", { type: "checkbox", checked: settings.auditEnabled, onChange: (e) => dispatch(settings_slice_1.settingsActions.patchRequested({ auditEnabled: e.target.checked })) }),
                " \u542F\u7528\u5BA1\u6838"),
            react_1.default.createElement("label", null,
                react_1.default.createElement("input", { type: "checkbox", checked: settings.autoRevision, onChange: (e) => dispatch(settings_slice_1.settingsActions.patchRequested({ autoRevision: e.target.checked })) }),
                " \u5BA1\u6838\u5931\u8D25\u65F6\u6700\u5C0F\u4FEE\u6B63")),
        diagnosticStatus ? react_1.default.createElement("div", { className: "mirror-abyss-v2-diagnostic-status", role: "status" }, diagnosticStatus) : null,
        react_1.default.createElement("label", { className: "mirror-abyss-v2-field" },
            "\u5BA1\u6838\u89C4\u5219",
            react_1.default.createElement("textarea", { rows: 6, value: settings.auditRules, placeholder: "\u4E00\u6761\u786C\u89C4\u5219\u4E00\u884C\uFF1B\u4E3A\u7A7A\u65F6\u4E0D\u8981\u542F\u7528\u5BA1\u6838", onChange: (e) => dispatch(settings_slice_1.settingsActions.patchRequested({ auditRules: e.target.value })) })),
        react_1.default.createElement("label", { className: "mirror-abyss-v2-field" },
            "\u9644\u52A0\u4FEE\u6B63\u8981\u6C42",
            react_1.default.createElement("textarea", { rows: 3, value: settings.revisionInstructions, onChange: (e) => dispatch(settings_slice_1.settingsActions.patchRequested({ revisionInstructions: e.target.value })) })),
        react_1.default.createElement("div", { className: "mirror-abyss-v2-table-counts" }, constants_1.DEFAULT_TABLE_KEYS.map((key) => react_1.default.createElement("span", { key: key },
            key,
            ": ",
            document?.tables[key]?.length ?? 0))),
        session.error || processing.error ? react_1.default.createElement("div", { className: "mirror-abyss-v2-error", role: "alert" }, session.error || processing.error) : null,
        react_1.default.createElement("p", { className: "mirror-abyss-v2-note" }, "\u5F53\u524D\u7248\u672C\u7528\u4E8E\u771F\u5B9E SillyTavern \u9A8C\u8BC1\u201C\u4E8B\u4EF6 \u2192 \u5BA1\u6838/\u4FEE\u6B63 \u2192 \u63D0\u53D6 \u2192 chatMetadata \u2192 UI\u201D\u95ED\u73AF\uFF1B\u603B\u7ED3\u3001\u6C89\u964D\u3001\u4E16\u754C\u4E66\u548C\u5386\u53F2\u91CD\u5EFA\u5C1A\u672A\u63A5\u5165\u3002"));
}
async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = window.document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    window.document.body.appendChild(textarea);
    textarea.select();
    const copied = window.document.execCommand('copy');
    textarea.remove();
    if (!copied)
        throw new Error('浏览器拒绝剪贴板写入');
}

},
"ui/mount": function(module, exports, require) {
/* Generated from src/ui/mount.tsx. */
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountUi = mountUi;
const react_1 = __importDefault(require("react"));
const client_1 = require("react-dom/client");
const react_redux_1 = require("react-redux");
const App_1 = require("ui/App");
const ROOT_ID = 'mirror-abyss-v2-root';
/** 挂载点沿用 SillyTavern 官方 React 模板的 extensions_settings 容器。 */
function mountUi(store) {
    const container = document.getElementById('extensions_settings');
    if (!container) {
        throw new Error('找不到 SillyTavern 扩展设置容器');
    }
    document.getElementById(ROOT_ID)?.remove();
    const element = document.createElement('div');
    element.id = ROOT_ID;
    element.className = 'mirror-abyss-v2-root';
    container.appendChild(element);
    const root = (0, client_1.createRoot)(element);
    root.render(react_1.default.createElement(react_1.default.StrictMode, null,
        react_1.default.createElement(react_redux_1.Provider, { store: store },
            react_1.default.createElement(App_1.App, null))));
    return {
        unmount() {
            root.unmount();
            element.remove();
        },
    };
}

},
"ui/store-hooks": function(module, exports, require) {
/* Generated from src/ui/store-hooks.ts. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAppSelector = exports.useAppDispatch = void 0;
const react_redux_1 = require("react-redux");
exports.useAppDispatch = react_redux_1.useDispatch.withTypes();
exports.useAppSelector = react_redux_1.useSelector.withTypes();

}
};

export function onActivate() { return maStart('onActivate'); }
export function onEnable() { return maStart('onEnable'); }
export function onDisable() { return maStop('onDisable', false); }
export function onDelete() { return maStop('onDelete', true); }
export function getRuntimeProvider() { return globalThis.__MIRROR_ABYSS_RUNTIME_PROVIDER__ || null; }
export function getDependencyProviders() { return Object.assign({}, globalThis.__MIRROR_ABYSS_DEPENDENCY_PROVIDERS__ || {}); }
export function __testRequire(id) { return maRequire(id); }
export function __testLoadPinnedDependency(name, candidates) { return maLoadPinnedDependency(name, candidates); }

function maStart(hookName) {
  maInstallStyle();
  maClearLoadError();
  maMark(hookName + ':entered');
  return maGetEntry().then(function(entry) {
    var fn = entry && entry[hookName];
    if (typeof fn !== 'function') throw new Error('单文件业务入口缺少生命周期：' + hookName);
    return fn();
  }).then(function(result) {
    maMark(hookName + ':complete');
    return result;
  }).catch(function(error) {
    var normalized = maNormalizeError(error, hookName + ' 启动失败');
    maMark(hookName + ':failed', normalized);
    maShowLoadError(normalized);
    console.error('[MirrorAbyss] ' + hookName + ' failed', normalized);
    throw normalized;
  });
}

function maStop(hookName, removeStyle) {
  var action = Promise.resolve();
  if (MA_ENTRY && typeof MA_ENTRY[hookName] === 'function') {
    action = Promise.resolve().then(function() { return MA_ENTRY[hookName](); });
  }
  return action.catch(function(error) {
    console.error('[MirrorAbyss] ' + hookName + ' failed', error);
  }).then(function() {
    maClearLoadError();
    if (removeStyle && typeof document !== 'undefined') {
      var style = document.getElementById(MA_STYLE_ID);
      if (style && style.parentNode) style.parentNode.removeChild(style);
    }
  });
}

function maGetEntry() {
  if (MA_ENTRY) return Promise.resolve(MA_ENTRY);
  if (!MA_ENTRY_PROMISE) {
    MA_ENTRY_PROMISE = maAssertHostReady()
      .then(maLoadDependencies)
      .then(function() {
        MA_ENTRY = maRequire('index');
        globalThis.__MIRROR_ABYSS_RUNTIME_PROVIDER__ = 'single-local-file';
        maMark('local-bundle-loaded');
        console.info('[MirrorAbyss] single local bundle loaded');
        return MA_ENTRY;
      })
      .catch(function(error) {
        MA_ENTRY_PROMISE = null;
        throw error;
      });
  }
  return MA_ENTRY_PROMISE;
}

function maAssertHostReady() {
  return Promise.resolve().then(function() {
    var st = globalThis.SillyTavern;
    if (!st || typeof st.getContext !== 'function') throw new Error('SillyTavern.getContext 尚未就绪');
    var context = st.getContext();
    var eventTypes = context && (context.eventTypes || context.event_types);
    if (!context || !context.eventSource || !eventTypes) throw new Error('SillyTavern 扩展事件接口不可用');
  });
}

function maLoadDependencies() {
  var order = ['react', '@reduxjs/toolkit', 'zod', 'p-queue', 'react-dom/client', 'react-redux'];
  return order.reduce(function(chain, name) {
    return chain.then(function() {
      if (MA_EXTERNALS[name]) return;
      return maLoadPinnedDependency(name, MA_DEPENDENCY_CANDIDATES[name]).then(function(namespace) {
        var compatible = Object.assign({ __esModule: true }, namespace);
        MA_EXTERNALS[name] = compatible;
      });
    });
  }, Promise.resolve());
}

async function maLoadPinnedDependency(name, candidates) {
  var failures = [];
  for (var index = 0; index < candidates.length; index += 1) {
    var candidate = candidates[index];
    try {
      var namespace = await import(candidate.url);
      var providers = globalThis.__MIRROR_ABYSS_DEPENDENCY_PROVIDERS__ || (globalThis.__MIRROR_ABYSS_DEPENDENCY_PROVIDERS__ = {});
      providers[name] = candidate.id;
      console.info('[MirrorAbyss] dependency loaded:', name, candidate.label);
      return namespace;
    } catch (error) {
      failures.push({ candidate: candidate, error: error });
      console.warn('[MirrorAbyss] dependency failed:', name, candidate.label, error);
    }
  }
  var detail = failures.map(function(item) { return item.candidate.label + ': ' + maDescribeError(item.error); }).join('\n');
  var aggregate = new AggregateError(failures.map(function(item) { return item.error; }), '依赖 ' + name + ' 的所有锁定来源均加载失败\n' + detail);
  aggregate.mirrorAbyssDependency = { name: name, failures: failures.map(function(item) { return { provider: item.candidate.id, detail: maDescribeError(item.error) }; }) };
  throw aggregate;
}

function maRequire(id) {
  if (Object.prototype.hasOwnProperty.call(MA_EXTERNALS, id)) return MA_EXTERNALS[id];
  if (Object.prototype.hasOwnProperty.call(MA_MODULE_CACHE, id)) return MA_MODULE_CACHE[id].exports;
  var factory = MA_MODULES[id];
  if (!factory) throw new Error('单文件模块不存在：' + id);
  var module = { exports: {} };
  MA_MODULE_CACHE[id] = module;
  try {
    factory(module, module.exports, maRequire);
    return module.exports;
  } catch (error) {
    delete MA_MODULE_CACHE[id];
    throw error;
  }
}

function maInstallStyle() {
  if (typeof document === 'undefined' || document.getElementById(MA_STYLE_ID)) return;
  var parent = document.head || document.documentElement;
  if (!parent) return;
  var style = document.createElement('style');
  style.id = MA_STYLE_ID;
  style.textContent = MA_STYLE_TEXT;
  parent.appendChild(style);
}

function maDescribeError(error) {
  if (error instanceof Error) return error.name + ': ' + error.message;
  if (typeof Event !== 'undefined' && error instanceof Event) {
    var target = error.target || error.currentTarget;
    var url = target && (target.src || target.href) || '';
    return 'DOM Event(type=' + error.type + (url ? ', url=' + url : '') + ')';
  }
  try { return JSON.stringify(error); } catch (_) { return String(error); }
}

function maNormalizeError(error, prefix) {
  if (error instanceof Error) {
    if (!prefix || error.message.indexOf(prefix) === 0) return error;
    var wrapped = new Error(prefix + '：' + error.message, { cause: error });
    wrapped.name = error.name;
    if (error.mirrorAbyssDependency) wrapped.mirrorAbyssDependency = error.mirrorAbyssDependency;
    return wrapped;
  }
  return new Error(prefix + '：' + maDescribeError(error));
}

function maMark(phase, error) {
  globalThis.__MIRROR_ABYSS_BOOTSTRAP__ = {
    version: MA_VERSION,
    phase: phase,
    recordedAt: new Date().toISOString(),
    dependencyProviders: getDependencyProviders(),
    error: error ? maDescribeError(error) : null,
  };
}

function maShowLoadError(error) {
  if (typeof document === 'undefined') return;
  var host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings') || document.body;
  if (!host) return;
  var existing = document.getElementById(MA_ERROR_ID);
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  var block = document.createElement('div');
  block.id = MA_ERROR_ID;
  block.className = 'mirror-abyss-v2-loader-error';
  var title = document.createElement('h3');
  title.textContent = 'Mirror Abyss 加载失败';
  var message = document.createElement('pre');
  message.textContent = maDescribeError(error);
  var diagnostic = document.createElement('pre');
  diagnostic.textContent = JSON.stringify(globalThis.__MIRROR_ABYSS_BOOTSTRAP__ || {}, null, 2);
  block.appendChild(title);
  block.appendChild(message);
  block.appendChild(diagnostic);
  host.appendChild(block);
}

function maClearLoadError() {
  if (typeof document === 'undefined') return;
  var existing = document.getElementById(MA_ERROR_ID);
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
}
