/** Mirror Abyss 2.0.0-alpha.9-infopoint.7-white-mobile single-file build. */
var MA_MODULES={"application":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MirrorAbyssApplication = void 0;
const host_1 = require("./host");
const settings_1 = require("./settings");
const tasks_1 = require("./tasks");
const ui_1 = require("./ui");
const worldbook_1 = require("./worldbook");
/**
 * Application shell. UI is a read/write projection over SillyTavern World Info.
 * It does not own a second narrative database.
 */
class MirrorAbyssApplication {
    constructor() {
        this.host = new host_1.HostAdapter();
        this.settingsStore = new settings_1.SettingsStore();
        this.worldbook = new worldbook_1.WorldbookAdapter(() => this.host.context());
        this.tasks = new tasks_1.TaskRunner(this.host, this.worldbook);
        this.ui = new ui_1.WorkspaceUi(this.host, this.settingsStore, this.worldbook, this.tasks);
        this.cleanup = [];
        this.started = false;
    }
    start() {
        if (this.started)
            return;
        this.host.context();
        // Alpha.27 order: visible shell first; projections and optional listeners later.
        this.ui.mount();
        this.listen('CHAT_CHANGED', () => void this.ui.refreshEntries());
        this.listen('MESSAGE_RECEIVED', (value) => void this.onMessage(Number(value)));
        this.listen('MESSAGE_EDITED', (value) => void this.onMessage(Number(value)));
        this.listen('MESSAGE_UPDATED', (value) => void this.onMessage(Number(value)));
        this.started = true;
        void this.ui.refreshEntries();
    }
    stop() {
        if (!this.started)
            return;
        this.started = false;
        this.cleanup.splice(0).forEach((remove) => {
            try {
                remove();
            }
            catch (error) {
                console.warn('[MirrorAbyss] listener cleanup failed', error);
            }
        });
        this.ui.unmount();
    }
    isStarted() { return this.started; }
    open(tab) { this.ui.openTab(tab); }
    refresh() { return this.ui.refreshEntries(); }
    processLatest() { return this.tasks.processTurn(this.settings(), false); }
    extract() { return this.tasks.runTask('extraction', this.settings()); }
    audit() { return this.tasks.runTask('audit', this.settings()); }
    smallSummary() { return this.tasks.runTask('smallSummary', this.settings()); }
    largeSummary() { return this.tasks.runTask('largeSummary', this.settings()); }
    preview(raw) { return this.tasks.previewExtraction(this.settings(), raw); }
    previewLegacyWorldbook() { return this.worldbook.previewMigration(this.settings()); }
    async migrateLegacyWorldbook() {
        const settings = this.settings();
        const preview = await this.worldbook.previewMigration(settings);
        return this.worldbook.migrateLegacyFormat(settings, preview);
    }
    undoLegacyWorldbookMigration() { return this.worldbook.undoMigration(this.settings()); }
    diagnostics() { return this.host.diagnostics(); }
    listen(eventName, handler) {
        try {
            this.cleanup.push(this.host.subscribe(eventName, handler, false));
        }
        catch (error) {
            console.warn(`[MirrorAbyss] 宿主事件 ${eventName} 不可用；仅停用该自动触发。`, error);
        }
    }
    settings() { return this.settingsStore.load(this.host.context()); }
    async onMessage(index) {
        if (!Number.isInteger(index) || !this.host.isAssistantIndex(index))
            return;
        const settings = this.settings();
        if (!settings.enabled || !settings.autoProcess)
            return;
        try {
            await this.tasks.processTurn(settings, true, index);
        }
        catch (error) {
            console.error('[MirrorAbyss] automatic information-point extraction failed', error);
        }
    }
}
exports.MirrorAbyssApplication = MirrorAbyssApplication;

},
"constants":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGED_VERSION = exports.MAX_CONTEXT_CHARS = exports.STYLE_ID = exports.WORLD_INFO_EXTENSION_KEY = exports.EXTENSION_NAMESPACE = exports.DISPLAY_NAME = exports.VERSION = void 0;
exports.VERSION = '2.0.0-alpha.9-infopoint.7-white-mobile';
exports.DISPLAY_NAME = 'Mirror Abyss｜镜渊';
exports.EXTENSION_NAMESPACE = 'mirrorAbyssInfoPoint';
exports.WORLD_INFO_EXTENSION_KEY = 'mirrorAbyssInfoPoint';
exports.STYLE_ID = 'mirror-abyss-infopoint-style';
exports.MAX_CONTEXT_CHARS = 48000;
exports.MANAGED_VERSION = 3;

},
"host":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HostAdapter = void 0;
const constants_1 = require("./constants");
const util_1 = require("./util");
class HostAdapter {
    constructor() {
        this.modelTail = Promise.resolve();
    }
    context() {
        const context = globalThis.SillyTavern?.getContext?.();
        if (!context)
            throw new Error('SillyTavern 上下文尚未就绪');
        return context;
    }
    chatKey() {
        const context = this.context();
        const chatId = context.getCurrentChatId?.() ?? context.chatId ?? context.chat_metadata?.chat_id;
        if (chatId === null || chatId === undefined || String(chatId) === '')
            return '';
        const scope = context.groupId !== null && context.groupId !== undefined
            ? `group:${context.groupId}`
            : `character:${context.characterId ?? context.name2 ?? 'unknown'}`;
        return `${scope}:${(0, util_1.hashText)(`${scope}|${chatId}`)}`;
    }
    subscribe(eventName, handler, required = false) {
        const context = this.context();
        const events = context.eventTypes ?? context.event_types ?? {};
        const event = events[eventName];
        if (!event) {
            if (required)
                throw new Error(`SillyTavern 未提供事件 ${eventName}`);
            return () => undefined;
        }
        context.eventSource.on(event, handler);
        return () => {
            if (typeof context.eventSource.off === 'function')
                context.eventSource.off(event, handler);
            else
                context.eventSource.removeListener?.(event, handler);
        };
    }
    latestTurn(requestedIndex) {
        const chatKey = this.chatKey();
        if (!chatKey)
            throw new Error('当前没有活动聊天');
        const chat = this.context().chat ?? [];
        const messageIndex = Number.isInteger(requestedIndex) ? Number(requestedIndex) : findLatestAssistant(chat);
        if (messageIndex < 0 || !isAssistant(chat[messageIndex]))
            throw new Error('当前聊天没有可处理的 AI 正文');
        const message = chat[messageIndex];
        const assistantText = String(message.mes ?? '');
        const messageKey = this.ensureMessageKey(messageIndex, message);
        return {
            chatKey,
            messageIndex,
            messageKey,
            assistantText,
            playerText: previousPlayerText(chat, messageIndex),
            contentHash: (0, util_1.hashText)(assistantText),
        };
    }
    isAssistantIndex(index) {
        return isAssistant((this.context().chat ?? [])[index]);
    }
    async generate(systemPrompt, prompt, responseLength, chatKey, timeoutMs) {
        const run = async () => {
            if (this.chatKey() !== chatKey)
                throw new Error('聊天已经切换，本次模型调用作废');
            const generateRaw = this.context().generateRaw;
            if (typeof generateRaw !== 'function')
                throw new Error('当前 SillyTavern 未提供 generateRaw');
            const startedAt = Date.now();
            const raw = await generateRaw({ systemPrompt, prompt, responseLength });
            if (this.chatKey() !== chatKey)
                throw new Error('聊天已经切换，本次模型结果不再写入');
            const elapsed = Date.now() - startedAt;
            if (elapsed > timeoutMs)
                console.warn(`[MirrorAbyss] 模型调用耗时 ${elapsed}ms，超过软时限 ${timeoutMs}ms`);
            const text = typeof raw === 'string' ? raw.trim() : '';
            if (!text)
                throw new Error('模型返回为空');
            return text;
        };
        const result = this.modelTail.then(run, run);
        this.modelTail = result.catch(() => undefined);
        return result;
    }
    async replaceAssistantText(turn, text) {
        if (this.chatKey() !== turn.chatKey)
            throw new Error('聊天已经切换，拒绝覆盖正文');
        const chat = this.context().chat ?? [];
        const message = chat[turn.messageIndex];
        if (!isAssistant(message))
            throw new Error('待修正正文已经不存在');
        if (readMessageKey(message) !== turn.messageKey || (0, util_1.hashText)(String(message.mes ?? '')) !== turn.contentHash) {
            throw new Error('正文已经变化，拒绝覆盖旧版本');
        }
        message.mes = text;
        if (Array.isArray(message.swipes) && Number.isInteger(message.swipe_id) && Number(message.swipe_id) >= 0) {
            message.swipes[Number(message.swipe_id)] = text;
        }
        this.context().updateMessageBlock?.(turn.messageIndex, message);
        await this.saveChat();
        return { ...turn, assistantText: text, contentHash: (0, util_1.hashText)(text) };
    }
    cursor() {
        const root = this.chatNamespace();
        const value = root.cursor && typeof root.cursor === 'object' ? root.cursor : {};
        return {
            lastProcessedMessageKey: String(value.lastProcessedMessageKey ?? ''),
            lastProcessedHash: String(value.lastProcessedHash ?? ''),
            lastSceneTitle: String(value.lastSceneTitle ?? ''),
            turnsSinceSmall: Math.max(0, Number(value.turnsSinceSmall) || 0),
            smallCountSinceLarge: Math.max(0, Number(value.smallCountSinceLarge) || 0),
        };
    }
    async saveCursor(cursor) {
        const root = this.chatNamespace();
        root.cursor = structuredClone(cursor);
        await this.saveMetadata();
    }
    getFocusTitle() {
        return String(this.chatNamespace().focusTitle ?? '').trim();
    }
    async setFocusTitle(title) {
        const root = this.chatNamespace();
        root.focusTitle = String(title ?? '').trim();
        await this.saveMetadata();
    }
    async saveMetadata() {
        const context = this.context();
        if (typeof context.saveMetadata === 'function')
            await context.saveMetadata();
        else
            context.saveMetadataDebounced?.();
    }
    async saveChat() {
        const context = this.context();
        if (typeof context.saveChat === 'function')
            await context.saveChat();
        else if (typeof context.saveChatConditional === 'function')
            await context.saveChatConditional();
    }
    diagnostics() {
        let context = null;
        try {
            context = this.context();
        }
        catch (error) {
            return { version: 1, error: (0, util_1.errorText)(error) };
        }
        const events = context.eventTypes ?? context.event_types ?? {};
        return {
            chatKey: this.chatKey(),
            generateRaw: typeof context.generateRaw === 'function',
            saveChat: typeof context.saveChat === 'function' || typeof context.saveChatConditional === 'function',
            saveMetadata: typeof context.saveMetadata === 'function' || typeof context.saveMetadataDebounced === 'function',
            events: Object.keys(events).filter((key) => /CHAT|MESSAGE|APP_READY/u.test(key)).sort(),
            assignedWorldbook: String(context.chatMetadata?.world_info ?? ''),
        };
    }
    ensureMessageKey(index, message) {
        const existing = readMessageKey(message);
        if (existing)
            return existing;
        const generated = this.context().uuidv4?.() ?? crypto.randomUUID();
        const extra = (message.extra ?? (message.extra = {}));
        extra[constants_1.EXTENSION_NAMESPACE] = { ...(extra[constants_1.EXTENSION_NAMESPACE] ?? {}), messageKey: generated };
        this.context().updateMessageBlock?.(index, message);
        void this.saveChat();
        return generated;
    }
    chatNamespace() {
        const metadata = (this.context().chatMetadata ?? (this.context().chatMetadata = {}));
        const current = metadata[constants_1.EXTENSION_NAMESPACE];
        if (!current || typeof current !== 'object' || Array.isArray(current))
            metadata[constants_1.EXTENSION_NAMESPACE] = {};
        return metadata[constants_1.EXTENSION_NAMESPACE];
    }
}
exports.HostAdapter = HostAdapter;
function readMessageKey(message) {
    const value = message?.extra?.[constants_1.EXTENSION_NAMESPACE];
    return value && typeof value === 'object' ? String(value.messageKey ?? '') : '';
}
function isAssistant(message) {
    return Boolean(message && !message.is_user && !message.is_system && typeof message.mes === 'string' && message.mes.trim());
}
function findLatestAssistant(chat) {
    for (let index = chat.length - 1; index >= 0; index -= 1)
        if (isAssistant(chat[index]))
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
"index":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onActivate = onActivate;
exports.onEnable = onEnable;
exports.onDisable = onDisable;
exports.onDelete = onDelete;
exports.onInstall = onInstall;
exports.onUpdate = onUpdate;
exports.onClean = onClean;
const application_1 = require("./application");
const constants_1 = require("./constants");
let application = null;
let runtimeState = 'idle';
let extensionEnabled = true;
let lifecycleGeneration = 0;
let retryTimer;
let startupAttempts = 0;
let appReadyContext = null;
let appReadyHandler = null;
let lastError = '';
const MAX_STARTUP_ATTEMPTS = 40;
function tryContext() {
    try {
        return globalThis.SillyTavern?.getContext?.() ?? null;
    }
    catch {
        return null;
    }
}
function clearRetry() {
    if (retryTimer !== undefined)
        globalThis.clearTimeout(retryTimer);
    retryTimer = undefined;
}
function removeListener(context, event, handler) {
    if (!context || !event || !handler)
        return;
    if (typeof context.eventSource.off === 'function')
        context.eventSource.off(event, handler);
    else
        context.eventSource.removeListener?.(event, handler);
}
async function requireApplication() {
    if (!extensionEnabled)
        throw new Error('镜渊插件当前已禁用');
    await initialize();
    if (!application?.isStarted())
        throw new Error(lastError || '镜渊尚未完成启动');
    return application;
}
function exposeApi() {
    globalThis.MirrorAbyss = {
        version: constants_1.VERSION,
        open: async (tab = 'overview') => (await requireApplication()).open(tab),
        processLatest: async () => (await requireApplication()).processLatest(),
        extract: async () => (await requireApplication()).extract(),
        audit: async () => (await requireApplication()).audit(),
        smallSummary: async () => (await requireApplication()).smallSummary(),
        largeSummary: async () => (await requireApplication()).largeSummary(),
        preview: async (raw) => (await requireApplication()).preview(raw),
        previewLegacyWorldbook: async () => (await requireApplication()).previewLegacyWorldbook(),
        migrateLegacyWorldbook: async () => (await requireApplication()).migrateLegacyWorldbook(),
        undoLegacyWorldbookMigration: async () => (await requireApplication()).undoLegacyWorldbookMigration(),
        refresh: async () => (await requireApplication()).refresh(),
        diagnostics: () => ({
            version: constants_1.VERSION,
            state: runtimeState,
            lastError,
            contextReady: Boolean(tryContext()),
            workspaceMounted: Boolean(document.getElementById('maip-workspace')),
            workspaceOpen: Boolean(document.getElementById('maip-workspace')?.open),
            host: application?.diagnostics() ?? null,
        }),
        restart: async () => {
            shutdown(false);
            extensionEnabled = true;
            startupAttempts = 0;
            installAppReadyHandler();
            await initialize();
        },
    };
}
async function initialize() {
    if (!extensionEnabled)
        return;
    if (runtimeState === 'ready' && application?.isStarted())
        return;
    if (runtimeState === 'initializing')
        return;
    const context = tryContext();
    if (!context) {
        runtimeState = 'waiting';
        installAppReadyHandler();
        return;
    }
    const generation = lifecycleGeneration;
    runtimeState = 'initializing';
    lastError = '';
    exposeApi();
    try {
        application ?? (application = new application_1.MirrorAbyssApplication());
        application.start();
        if (!extensionEnabled || generation !== lifecycleGeneration)
            return;
        runtimeState = 'ready';
        document.getElementById('maip-fatal')?.remove();
    }
    catch (error) {
        if (!extensionEnabled || generation !== lifecycleGeneration)
            return;
        runtimeState = 'error';
        lastError = error instanceof Error ? error.message : String(error);
        console.error('[MirrorAbyss] initialization failed', error);
        showFatal(lastError);
    }
}
function installAppReadyHandler() {
    if (!extensionEnabled)
        return;
    exposeApi();
    const context = tryContext();
    if (!context) {
        runtimeState = 'waiting';
        startupAttempts += 1;
        if (startupAttempts >= MAX_STARTUP_ATTEMPTS) {
            lastError = '等待 SillyTavern 上下文超时，请刷新页面后重试';
            runtimeState = 'error';
            showFatal(lastError);
            return;
        }
        if (retryTimer === undefined) {
            const generation = lifecycleGeneration;
            retryTimer = globalThis.setTimeout(() => {
                retryTimer = undefined;
                if (extensionEnabled && generation === lifecycleGeneration)
                    installAppReadyHandler();
            }, 250);
        }
        return;
    }
    clearRetry();
    startupAttempts = 0;
    const events = context.eventTypes ?? context.event_types ?? {};
    const readyEvent = events.APP_READY;
    if (appReadyContext !== context || !appReadyHandler) {
        const oldEvents = appReadyContext?.eventTypes ?? appReadyContext?.event_types ?? {};
        removeListener(appReadyContext, oldEvents.APP_READY, appReadyHandler);
        appReadyContext = context;
        appReadyHandler = () => { if (extensionEnabled)
            void initialize(); };
        if (readyEvent)
            context.eventSource.on(readyEvent, appReadyHandler);
    }
    // Extensions can activate after APP_READY, so initialization is also attempted now.
    void initialize();
}
function showFatal(message) {
    if (typeof document === 'undefined')
        return;
    let button = document.getElementById('maip-fatal');
    if (!button) {
        button = document.createElement('button');
        button.id = 'maip-fatal';
        button.className = 'maip-startup-error';
        button.type = 'button';
        button.textContent = '镜渊启动失败｜点击重试';
        button.addEventListener('click', () => {
            runtimeState = 'idle';
            startupAttempts = 0;
            lifecycleGeneration += 1;
            installAppReadyHandler();
        });
        (document.body ?? document.documentElement).appendChild(button);
    }
    button.title = message;
}
function shutdown(removeApi = true) {
    lifecycleGeneration += 1;
    clearRetry();
    const events = appReadyContext?.eventTypes ?? appReadyContext?.event_types ?? {};
    removeListener(appReadyContext, events.APP_READY, appReadyHandler);
    appReadyContext = null;
    appReadyHandler = null;
    application?.stop();
    document.getElementById('maip-fatal')?.remove();
    runtimeState = 'idle';
    if (removeApi)
        delete globalThis.MirrorAbyss;
}
function onActivate() { extensionEnabled = true; exposeApi(); installAppReadyHandler(); }
function onEnable() { extensionEnabled = true; exposeApi(); installAppReadyHandler(); }
function onDisable() { extensionEnabled = false; shutdown(); }
function onDelete() { extensionEnabled = false; shutdown(); application = null; }
function onInstall() { exposeApi(); }
function onUpdate() { exposeApi(); }
function onClean() { }

},
"matcher":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEntryIndex = buildEntryIndex;
exports.matchBlock = matchBlock;
exports.selectBestCandidate = selectBestCandidate;
exports.relevantEntries = relevantEntries;
exports.titleTokens = titleTokens;
const util_1 = require("./util");
function buildEntryIndex(entries) {
    const byUid = new Map();
    const byTitle = new Map();
    const byAlias = new Map();
    const byKeyword = new Map();
    for (const entry of entries) {
        byUid.set(String(entry.uid), entry);
        add(byTitle, entry.normalizedTitle, entry);
        for (const alias of entry.aliases)
            add(byAlias, normalizeLookup(alias), entry);
        for (const keyword of entry.keywords)
            add(byKeyword, normalizeLookup(keyword), entry);
    }
    return { entries, byUid, byTitle, byAlias, byKeyword };
}
function matchBlock(block, index, contextText, weights) {
    const evidenceByUid = new Map();
    const record = (entry, evidence) => {
        const list = evidenceByUid.get(entry.uid) ?? [];
        list.push(evidence);
        evidenceByUid.set(entry.uid, list);
    };
    if (block.uid) {
        const entry = index.byUid.get(block.uid);
        if (entry)
            record(entry, { kind: 'uid', score: weights.uid, detail: `UID ${block.uid} 精确命中` });
    }
    const exactTitle = (0, util_1.normalizeTitle)(block.title).toLocaleLowerCase();
    for (const entry of index.byTitle.get(exactTitle) ?? []) {
        record(entry, { kind: 'exact-title', score: weights.exactTitle, detail: '标题精确命中' });
    }
    for (const entry of index.entries) {
        if (entry.normalizedTitle === exactTitle) {
            record(entry, { kind: 'normalized-title', score: weights.normalizedTitle, detail: '规范化标题命中' });
        }
        if (entry.type === block.type && normalizeLookup(entry.name) === normalizeLookup(block.name)) {
            record(entry, { kind: 'type-name', score: weights.typeAndName, detail: '类型与主体名称命中' });
        }
    }
    const nameKey = normalizeLookup(block.name);
    for (const entry of index.byAlias.get(nameKey) ?? []) {
        record(entry, { kind: 'alias', score: weights.alias, detail: `别名“${block.name}”命中` });
    }
    for (const entry of index.byKeyword.get(nameKey) ?? []) {
        record(entry, { kind: 'keyword-exact', score: weights.keywordExact, detail: `关键词“${block.name}”精确命中` });
    }
    const context = normalizeLookup(contextText);
    const blockText = [block.title, ...block.sections.flatMap((section) => section.lines)].join('\n');
    for (const entry of index.entries) {
        const typePenalty = entry.type && block.type && entry.type !== block.type ? weights.typeMismatchPenalty : 0;
        const matchedKeywords = entry.keywords.filter((key) => {
            const normalized = normalizeLookup(key);
            return normalized.length >= 2 && (context.includes(normalized) || nameKey.includes(normalized) || normalized.includes(nameKey));
        });
        if (matchedKeywords.length) {
            record(entry, {
                kind: 'keyword-contains',
                score: weights.keywordContains + Math.min(80, matchedKeywords.length * 20) + typePenalty,
                detail: `上下文关键词命中：${matchedKeywords.slice(0, 3).join('、')}`,
            });
        }
        const referenceHit = entry.references.some((title) => normalizeLookup(title) === normalizeLookup(block.title));
        if (referenceHit)
            record(entry, { kind: 'reference', score: weights.reference + typePenalty, detail: '关联标题反向命中' });
        const bodySimilarity = Math.max((0, util_1.diceSimilarity)(blockText, entry.content), ...Object.values(entry.sections.values).flat().map((line) => (0, util_1.diceSimilarity)(blockText, line)));
        if (bodySimilarity >= 0.42) {
            record(entry, {
                kind: 'body-similarity',
                score: Math.round(weights.bodySimilarity * bodySimilarity) + typePenalty,
                detail: `少量正文相似度 ${(bodySimilarity * 100).toFixed(0)}%`,
            });
        }
    }
    return [...evidenceByUid.entries()]
        .map(([uid, evidence]) => {
        const entry = index.byUid.get(uid);
        const strongestByKind = new Map();
        for (const item of evidence) {
            const previous = strongestByKind.get(item.kind);
            if (!previous || item.score > previous.score)
                strongestByKind.set(item.kind, item);
        }
        const distinct = [...strongestByKind.values()];
        const strongest = Math.max(...distinct.map((item) => item.score));
        const supporting = distinct.filter((item) => item.score < strongest).reduce((sum, item) => sum + Math.max(0, item.score) * 0.18, 0);
        return { entry, score: Math.round(strongest + supporting), evidence: distinct.sort((a, b) => b.score - a.score) };
    })
        .sort((left, right) => right.score - left.score || left.entry.title.localeCompare(right.entry.title));
}
function selectBestCandidate(candidates, minimumScore) {
    const first = candidates[0];
    if (!first || first.score < minimumScore)
        return null;
    return first;
}
function relevantEntries(entries, text, limit = 24) {
    const normalized = normalizeLookup(text);
    const scored = entries.map((entry) => {
        let score = 0;
        const name = normalizeLookup(entry.name);
        if (name.length >= 2 && normalized.includes(name))
            score += 1000;
        for (const keyword of entry.keywords) {
            const key = normalizeLookup(keyword);
            if (key.length >= 2 && normalized.includes(key))
                score += 180;
        }
        for (const alias of entry.aliases) {
            const key = normalizeLookup(alias);
            if (key.length >= 2 && normalized.includes(key))
                score += 240;
        }
        if (entry.focus)
            score += 900;
        if (entry.activation.constant)
            score += 300;
        if (/(进行中|当前场景|当前相关|活跃)/u.test(entry.content))
            score += 120;
        return { entry, score };
    });
    const selected = scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score).map((item) => item.entry);
    const fallback = entries.filter((entry) => /(小总结|大总结|事件|场景)/u.test(entry.type)).slice(-12);
    return [...new Map([...selected, ...fallback].map((entry) => [entry.uid, entry])).values()].slice(0, limit);
}
function titleTokens(value) {
    const split = (0, util_1.splitTitle)(value);
    return (0, util_1.unique)([split?.type, split?.name, value].map((item) => (0, util_1.normalizeFact)(String(item ?? ''))));
}
function normalizeLookup(value) {
    return (0, util_1.normalizeFact)(value).replace(/[｜|]/gu, '');
}
function add(map, key, entry) {
    if (!key)
        return;
    const list = map.get(key) ?? [];
    if (!list.some((candidate) => candidate.uid === entry.uid))
        list.push(entry);
    map.set(key, list);
}

},
"model":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

},
"operations":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOperationPlan = buildOperationPlan;
exports.applyPlanToEntries = applyPlanToEntries;
exports.informationAnchor = informationAnchor;
const matcher_1 = require("./matcher");
const parser_1 = require("./parser");
const util_1 = require("./util");
const ARCHIVE_OPTIONS = new Set(['归档', '已归档', '沉降', '已沉降']);
const DELETE_OPTIONS = new Set(['删除', '移除', '退出', '销毁']);
const KEEP_OPTIONS = new Set(['保留', '无', '无变化', '继续']);
function buildOperationPlan(blocks, entries, settings, contextText) {
    const index = (0, matcher_1.buildEntryIndex)(entries);
    const operations = [];
    for (const block of blocks) {
        const candidates = (0, matcher_1.matchBlock)(block, index, contextText, settings.matchWeights);
        const target = (0, matcher_1.selectBestCandidate)(candidates, Math.max(300, settings.matchWeights.keywordContains - 80));
        if (!target) {
            operations.push({
                id: operationId('create-entry', block.title, ''),
                kind: 'create-entry',
                title: block.title,
                newValue: block.title,
                reason: '未找到可信候选，按结构化标题创建新条目',
                score: candidates[0]?.score,
                matchEvidence: candidates[0]?.evidence,
            });
            for (const keyword of block.keywords) {
                operations.push(op('merge-keywords', block.title, undefined, '关键词', undefined, keyword, '新条目关键词写入'));
            }
            for (const section of block.sections) {
                if (/(关键词|触发词|标签|分类)/u.test(section.name))
                    continue;
                if (section.empty) {
                    operations.push(noop(block.title, undefined, section.name, 'AI填写“无”，不执行写入'));
                    continue;
                }
                operations.push(...operationsForNewSection(block.title, section.name, section.lines, policyFor(section.name, settings)));
            }
            continue;
        }
        const entry = target.entry;
        for (const keyword of block.keywords) {
            operations.push(entry.keywords.some((item) => (0, util_1.normalizeFact)(item) === (0, util_1.normalizeFact)(keyword))
                ? noop(entry.title, entry.uid, '关键词', `关键词“${keyword}”已存在`, target.score, target.evidence)
                : op('merge-keywords', entry.title, entry.uid, '关键词', undefined, keyword, '根据本轮信息点补充世界书关键词', target.score, target.evidence));
        }
        for (const section of block.sections) {
            if (/(关键词|触发词|标签|分类)/u.test(section.name))
                continue;
            if (section.empty) {
                operations.push(noop(entry.title, entry.uid, section.name, 'AI填写“无”，不执行写入', target.score, target.evidence));
                continue;
            }
            const lifecycle = lifecycleOperation(entry, section.name, section.lines, target.score, target.evidence);
            if (lifecycle) {
                operations.push(lifecycle);
                continue;
            }
            operations.push(...operationsForExisting(entry, section.name, section.lines, policyFor(section.name, settings), settings, target.score, target.evidence));
        }
    }
    return { blocks, operations, createdAt: Date.now() };
}
function applyPlanToEntries(plan, entries) {
    const output = entries.map((entry) => structuredClone(entry));
    const byUid = new Map(output.map((entry) => [entry.uid, entry]));
    const createdByTitle = new Map();
    for (const operation of plan.operations) {
        if (operation.kind === 'noop')
            continue;
        if (operation.kind === 'create-entry') {
            if (!createdByTitle.has((0, util_1.normalizeTitle)(operation.title))) {
                const split = (0, util_1.splitTitle)(operation.title);
                if (!split)
                    continue;
                const entry = {
                    uid: `new:${(0, util_1.hashText)(operation.title)}`,
                    title: operation.title,
                    normalizedTitle: (0, util_1.normalizeTitle)(operation.title).toLocaleLowerCase(),
                    type: split.type,
                    name: split.name,
                    content: '',
                    sections: { order: [], values: {} },
                    keywords: (0, util_1.unique)([split.name, split.type]),
                    aliases: [],
                    references: [],
                    focus: false,
                    locked: false,
                    managed: true,
                    activation: { constant: false, vectorized: true, preventRecursion: false, depth: 4, order: 400, disabled: false },
                    raw: {},
                };
                output.push(entry);
                createdByTitle.set((0, util_1.normalizeTitle)(operation.title), entry);
                byUid.set(entry.uid, entry);
            }
            continue;
        }
        const target = operation.targetUid ? byUid.get(operation.targetUid) : createdByTitle.get((0, util_1.normalizeTitle)(operation.title));
        if (!target)
            continue;
        applyOne(target, operation);
    }
    return output;
}
function operationsForNewSection(title, section, lines, policy) {
    if (policy === 'merge-keywords') {
        return lines.map((line) => op('merge-keywords', title, undefined, section, undefined, line, '新条目关键词合并'));
    }
    if (policy === 'merge-titles') {
        return lines.map((line) => op('merge-titles', title, undefined, section, undefined, line, '新条目关联标题合并'));
    }
    if (policy === 'replace-section') {
        return [op('replace-section', title, undefined, section, undefined, lines.join('\n'), '新条目整段写入')];
    }
    return lines.map((line) => op('append-line', title, undefined, section, undefined, line, '新条目信息点写入'));
}
function operationsForExisting(entry, section, lines, policy, settings, score, evidence) {
    const current = entry.sections.values[section] ?? [];
    if (policy === 'replace-section') {
        const next = (0, util_1.unique)(lines).join('\n');
        if ((0, util_1.normalizeFact)(current.join('\n')) === (0, util_1.normalizeFact)(next))
            return [noop(entry.title, entry.uid, section, '整段内容未变化', score, evidence)];
        return [op('replace-section', entry.title, entry.uid, section, current.join('\n'), next, '该小标题配置为整段替换', score, evidence)];
    }
    if (policy === 'merge-keywords') {
        return lines.map((line) => entry.keywords.some((item) => (0, util_1.normalizeFact)(item) === (0, util_1.normalizeFact)(line))
            ? noop(entry.title, entry.uid, section, '关键词已存在', score, evidence)
            : op('merge-keywords', entry.title, entry.uid, section, undefined, line, '合并新关键词', score, evidence));
    }
    if (policy === 'merge-titles') {
        return lines.map((line) => entry.references.some((item) => (0, util_1.normalizeTitle)(item) === (0, util_1.normalizeTitle)(line))
            ? noop(entry.title, entry.uid, section, '关联标题已存在', score, evidence)
            : op('merge-titles', entry.title, entry.uid, section, undefined, (0, util_1.normalizeTitle)(line), '合并新关联标题', score, evidence));
    }
    const result = [];
    for (const incomingRaw of lines) {
        const incoming = (0, parser_1.normalizePointLine)(incomingRaw);
        const threshold = policy === 'append-chain' ? settings.chainDuplicateSimilarity : settings.duplicateSimilarity;
        const similar = strongestSimilarity(incoming, current);
        if (similar && similar.score >= threshold) {
            result.push(noop(entry.title, entry.uid, section, `语义相似 ${(similar.score * 100).toFixed(0)}%，跳过重复信息点`, score, evidence));
            continue;
        }
        const anchor = informationAnchor(incoming);
        const anchoredOld = anchor ? current.find((line) => informationAnchor(line) === anchor) : undefined;
        if (policy === 'replace-by-anchor' && anchoredOld) {
            result.push(op('replace-line', entry.title, entry.uid, section, anchoredOld, incoming, `同一信息槽“${anchor}”更新当前值`, score, evidence));
            continue;
        }
        if (policy === 'semantic-upsert' && anchoredOld && (0, util_1.diceSimilarity)(anchoredOld, incoming) < threshold) {
            result.push(op('replace-line', entry.title, entry.uid, section, anchoredOld, incoming, `同一固定信息槽“${anchor}”被新事实替换`, score, evidence));
            continue;
        }
        if (policy === 'replace-by-anchor' && !anchor && current.length === 1) {
            result.push(op('replace-line', entry.title, entry.uid, section, current[0], incoming, '当前值型小标题只有一个旧信息点，直接替换', score, evidence));
            continue;
        }
        result.push(op('append-line', entry.title, entry.uid, section, undefined, incoming, policy === 'append-chain' ? '同一事件/经历的新信息点顺序追加' : '未发现重复或同槽旧值，追加信息点', score, evidence));
    }
    return result;
}
function lifecycleOperation(entry, section, lines, score, evidence) {
    if (!/(沉降处理|条目处理|生命周期|退出处理)/u.test(section))
        return null;
    const value = lines[0]?.trim() ?? '';
    if (KEEP_OPTIONS.has(value))
        return noop(entry.title, entry.uid, section, `沉降选项为“${value}”，保持条目`, score, evidence);
    if (ARCHIVE_OPTIONS.has(value))
        return op('archive-entry', entry.title, entry.uid, section, undefined, value, '总结确认条目完成沉降，归档但保留正文', score, evidence);
    if (DELETE_OPTIONS.has(value))
        return op('delete-entry', entry.title, entry.uid, section, undefined, value, '总结确认持续影响已分发，删除临时条目', score, evidence);
    return noop(entry.title, entry.uid, section, `未知沉降选项“${value}”，不执行`, score, evidence);
}
function policyFor(section, settings) {
    const exact = settings.sectionPolicies[section];
    if (exact)
        return exact;
    if (/(关键词|触发词|别名|称号)/u.test(section))
        return 'merge-keywords';
    if (/(关联条目|关联对象|涉及条目|参与对象|引用)/u.test(section))
        return 'merge-titles';
    if (/(事件进程|事件链|进程|过程|阶段记录|近期经历|行动记录|历史事实|变化记录)/u.test(section))
        return 'append-chain';
    if (/(当前|状态|位置|持有者|所有者|归属|数量|完整性|可用性|阶段|当前结果|活动状态)/u.test(section))
        return 'replace-by-anchor';
    if (/(完整摘要|对象定义|基础定义)/u.test(section))
        return 'replace-section';
    return 'semantic-upsert';
}
function informationAnchor(line) {
    const normalized = (0, util_1.normalizeFact)(line);
    const label = line.match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1]?.trim();
    if (label)
        return `label:${(0, util_1.normalizeFact)(label)}`;
    const patterns = [
        [/^(.{1,24}?)(?:当前)?(?:位于|身处|在)(.+)$/u, '当前位置'],
        [/^(.{1,24}?)(?:当前)?(?:由|归)(.{1,24}?)(?:持有|拥有|保管)$/u, '持有者'],
        [/^(.{1,24}?)(?:当前)?(?:状态为|处于)(.+)$/u, '状态'],
        [/^(.{1,24}?)(?:的)?(?:身份|血统|种族|职业|阵营|关系|能力|所有者|持有者|位置|阶段|结果)(?:是|为|变为|变成)(.+)$/u, '属性'],
        [/^(.{1,24}?)(?:获得|失去|持有|拥有|加入|离开|死亡|受伤|昏迷)(.*)$/u, '变化'],
    ];
    for (const [pattern, relation] of patterns) {
        const match = line.match(pattern);
        if (match)
            return `${(0, util_1.normalizeFact)(match[1] ?? '')}|${relation}`;
    }
    const subject = normalized.match(/^([\p{L}\p{N}_·.-]{1,18})/u)?.[1];
    return subject ? `subject:${subject}` : '';
}
function strongestSimilarity(incoming, current) {
    let best = null;
    for (const line of current) {
        const score = (0, util_1.diceSimilarity)(incoming, line);
        if (!best || score > best.score)
            best = { line, score };
    }
    return best;
}
function applyOne(entry, operation) {
    const section = operation.section ?? '';
    const values = entry.sections.values;
    if (section && !values[section]) {
        values[section] = [];
        entry.sections.order.push(section);
    }
    if (operation.kind === 'append-line' && operation.newValue)
        values[section] = (0, util_1.unique)([...(values[section] ?? []), operation.newValue]);
    if (operation.kind === 'replace-line' && operation.newValue) {
        const previous = values[section] ?? [];
        const index = previous.findIndex((line) => line === operation.oldValue);
        if (index >= 0)
            previous[index] = operation.newValue;
        else
            previous.push(operation.newValue);
        values[section] = (0, util_1.unique)(previous);
    }
    if (operation.kind === 'replace-section')
        values[section] = (0, util_1.unique)(String(operation.newValue ?? '').split('\n'));
    if (operation.kind === 'merge-titles' && operation.newValue) {
        values[section] = (0, util_1.unique)([...(values[section] ?? []), (0, util_1.normalizeTitle)(operation.newValue)]);
        entry.references = (0, util_1.unique)([...entry.references, (0, util_1.normalizeTitle)(operation.newValue)]);
    }
    if (operation.kind === 'merge-keywords' && operation.newValue) {
        values[section] = (0, util_1.unique)([...(values[section] ?? []), operation.newValue]);
        entry.keywords = (0, util_1.unique)([...entry.keywords, operation.newValue]);
    }
    if (operation.kind === 'archive-entry') {
        entry.activation.disabled = true;
        entry.activation.constant = false;
        entry.raw.disable = true;
    }
    if (operation.kind === 'delete-entry')
        entry.raw.__delete = true;
}
function op(kind, title, targetUid, section, oldValue, newValue, reason, score, matchEvidence) {
    return { id: operationId(kind, title, `${section}|${oldValue}|${newValue}`), kind, title, ...(targetUid ? { targetUid } : {}), ...(section ? { section } : {}), ...(oldValue !== undefined ? { oldValue } : {}), ...(newValue !== undefined ? { newValue } : {}), reason, ...(score !== undefined ? { score } : {}), ...(matchEvidence ? { matchEvidence } : {}) };
}
function noop(title, targetUid, section, reason, score, matchEvidence) {
    return op('noop', title, targetUid, section, undefined, undefined, reason, score, matchEvidence);
}
function operationId(kind, title, value) {
    return `${kind}:${(0, util_1.hashText)(`${kind}|${title}|${value}`)}`;
}

},
"parser":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseInformationPoints = parseInformationPoints;
exports.parseEntrySections = parseEntrySections;
exports.serializeEntrySections = serializeEntrySections;
exports.sectionLines = sectionLines;
exports.extractReferences = extractReferences;
exports.sanitizeModelText = sanitizeModelText;
exports.normalizePointLine = normalizePointLine;
const util_1 = require("./util");
const SECTION_PATTERN = /^\s*【\s*([^】]+?)\s*】\s*$/u;
const TITLE_PATTERN = /^\s*(?:#{1,6}\s*)?([^【】\n]+?[｜|丨][^【】\n]+?)\s*$/u;
const BULLET_PATTERN = /^\s*(?:[-*•·]|\d+[.)、])\s*(.*?)\s*$/u;
const EMPTY_PATTERN = /^\s*(?:无|无变化|无新增事实|无可记录事实|没有)\s*[。.]?\s*$/u;
const UID_PATTERN = /(?:｜|\s)[（(]?UID\s*[:：=]\s*([^｜）)\s]+)[）)]?\s*$/iu;
function parseInformationPoints(raw) {
    const text = sanitizeModelText(raw);
    if (EMPTY_PATTERN.test(text.trim()))
        return [];
    const lines = text.replace(/\r/g, '').split('\n');
    const blocks = [];
    let block = null;
    let section = null;
    for (const sourceLine of lines) {
        const line = sourceLine.trimEnd();
        const sectionMatch = line.match(SECTION_PATTERN);
        if (sectionMatch && block) {
            section = { name: sectionMatch[1].trim(), lines: [], empty: false };
            block.sections.push(section);
            continue;
        }
        // 小标题内部的项目符号可能本身是“人物｜莉娅”这类关联标题，必须先作为信息点处理。
        const bulletMatch = line.match(BULLET_PATTERN);
        if (block && section && bulletMatch) {
            const bullet = bulletMatch[1] ?? '';
            if (!bullet)
                continue;
            if (EMPTY_PATTERN.test(bullet)) {
                section.empty = true;
                section.lines = [];
            }
            else
                section.lines.push(normalizePointLine(bullet));
            continue;
        }
        if (block && section && EMPTY_PATTERN.test(line)) {
            section.empty = true;
            section.lines = [];
            continue;
        }
        const titleMatch = line.match(TITLE_PATTERN);
        if (titleMatch && !SECTION_PATTERN.test(line)) {
            const rawTitle = titleMatch[1].trim();
            const uid = rawTitle.match(UID_PATTERN)?.[1]?.trim();
            const titleWithoutUid = rawTitle.replace(UID_PATTERN, '').trim();
            const title = (0, util_1.normalizeTitle)(titleWithoutUid);
            const split = (0, util_1.splitTitle)(title);
            if (!split)
                continue;
            block = { rawTitle, title, type: split.type, name: split.name, ...(uid ? { uid } : {}), keywords: [split.type], sections: [] };
            blocks.push(block);
            section = null;
            continue;
        }
        if (!block || !section || !line.trim())
            continue;
        const bullet = line.match(BULLET_PATTERN)?.[1] ?? line.trim();
        if (!bullet)
            continue;
        if (EMPTY_PATTERN.test(bullet)) {
            section.empty = true;
            section.lines = [];
            continue;
        }
        section.lines.push(normalizePointLine(bullet));
    }
    for (const item of blocks) {
        item.sections = item.sections
            .map((candidate) => ({ ...candidate, lines: (0, util_1.unique)(candidate.lines), empty: candidate.empty || candidate.lines.length === 0 }))
            .filter((candidate) => candidate.name);
        const keywordLines = item.sections
            .filter((candidate) => /(关键词|触发词|标签|分类)/u.test(candidate.name) && !candidate.empty)
            .flatMap((candidate) => candidate.lines);
        item.keywords = (0, util_1.unique)([item.type, ...keywordLines]);
    }
    return blocks.filter((candidate) => candidate.sections.length > 0);
}
function parseEntrySections(content) {
    const order = [];
    const values = {};
    let current = '';
    for (const sourceLine of String(content ?? '').replace(/\r/g, '').split('\n')) {
        const line = sourceLine.trimEnd();
        const match = line.match(SECTION_PATTERN);
        if (match) {
            current = match[1].trim();
            if (!values[current]) {
                values[current] = [];
                order.push(current);
            }
            continue;
        }
        if (!current || !line.trim())
            continue;
        const bullet = line.match(BULLET_PATTERN)?.[1] ?? line.trim();
        if (!bullet || EMPTY_PATTERN.test(bullet))
            continue;
        values[current].push(normalizePointLine(bullet));
    }
    return { order, values };
}
function serializeEntrySections(sections) {
    const order = (0, util_1.unique)([...sections.order, ...Object.keys(sections.values)]);
    return order
        .filter((name) => name && (sections.values[name]?.length ?? 0) > 0)
        .map((name) => `【${name}】\n${(0, util_1.unique)(sections.values[name] ?? []).map((line) => `- ${line}`).join('\n')}`)
        .join('\n\n');
}
function sectionLines(content, names) {
    const parsed = parseEntrySections(content);
    const normalized = new Set(names.map((name) => name.replace(/\s+/g, '').toLocaleLowerCase()));
    return parsed.order.flatMap((name) => normalized.has(name.replace(/\s+/g, '').toLocaleLowerCase()) ? parsed.values[name] ?? [] : []);
}
function extractReferences(content) {
    const parsed = parseEntrySections(content);
    const output = [];
    for (const [name, lines] of Object.entries(parsed.values)) {
        if (!/(关联|关系对象|涉及条目|参与对象|引用)/u.test(name))
            continue;
        for (const line of lines) {
            const title = (0, util_1.normalizeTitle)(line.replace(/^[-*•]\s*/u, ''));
            if ((0, util_1.splitTitle)(title))
                output.push(title);
        }
    }
    return (0, util_1.unique)(output);
}
function sanitizeModelText(raw) {
    return String(raw ?? '')
        .replace(/<think>[\s\S]*?<\/think>/giu, '')
        .replace(/^```(?:text|markdown|md)?\s*/iu, '')
        .replace(/\s*```$/u, '')
        .trim();
}
function normalizePointLine(value) {
    return value
        .replace(/^\s*(?:[-*•·]|\d+[.)、])\s*/u, '')
        .replace(/\s+/gu, ' ')
        .replace(/[。.]\s*$/u, '。')
        .trim();
}

},
"prompts":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractionPrompts = extractionPrompts;
exports.auditPrompts = auditPrompts;
exports.summaryPrompts = summaryPrompts;
exports.keywordTemplate = keywordTemplate;
const util_1 = require("./util");
function extractionPrompts(settings, playerText, assistantText, relevant) {
    const template = keywordTemplate(settings.keywordDefinitions);
    const existing = relevant.map(entryForPrompt).join('\n\n');
    const custom = settings.extractionPrompt.trim();
    const system = `你是“镜渊”的信息点提取器。你不是数据库管理员，也不决定世界书常驻、向量、递归、深度或顺序。

你的唯一任务：阅读本轮玩家输入和最终正文，提取本轮已经明确成立、会影响后续叙事的核心信息点，并按照“条目标题＋关键词＋小标题＋事实行”填写。

固定输出语法：
类型｜稳定名称
【关键词】
- 与该条目匹配的世界书关键词
【小标题】
- 一条核心信息点

没有变化的小标题填写：
【小标题】
无

规则：
1. 已有对象必须沿用提供的稳定标题；同一事件的新进展继续填写到原事件标题下。
2. 标题前缀只用于稳定识别对象；分类、筛选和召回使用【关键词】。一个条目可以拥有多个关键词。
3. 默认关键词只是参考，不是白名单。遇到组织、宗教、法律、血统、货币、技术等未列出的概念，可以填写新的准确关键词。
4. 新条目必须填写【关键词】；已有条目只有关键词新增或需要收紧时才填写，否则写“无”。
5. 人物名称、地点名称、物品名称和事件标题不得随意改写成同义标题。
6. 每行只表达一个主体的一项属性、动作、关系或直接结果，使用简短明确的自然语言。
7. 只提取核心事实；忽略普通动作、瞬时表情、气氛、修辞、服装细节、无后续影响的背景信息。
8. 不得补全正文未发生的内容，不得把可能、计划、推测和主观看法升级为事实。
9. 已有内容已经表达或仅是近义改写时填写“无”，不要重复。
10. 不限制条目数量；在不遗漏核心变化的前提下，只写真正必要的信息点。
11. “基础设定”是世界规则类关键词。插件会自动将含该关键词的条目设为常驻，AI不得填写调度参数。
12. 除填写结果外，不输出解释、前言、结语、JSON、代码块或思考过程。

默认关键词及建议小标题：
${template}${custom ? `\n\n【玩家附加提取要求】\n${custom}` : ''}`;
    const user = `【当前世界书中的少量相关条目】
${existing || '（没有匹配到相关旧条目；确有新对象时可创建结构化标题）'}

【玩家本轮输入】
${playerText || '（空）'}

【本轮最终正文】
${assistantText}

请直接按固定标题、【关键词】和小标题填写。已有标题中没有变化的栏目填写“无”。`;
    return { system, user };
}
function auditPrompts(settings, playerText, assistantText) {
    const system = `你是“镜渊”的正文审核器。只检查正文是否违反玩家给出的硬规则，不续写、不润色、不扩展剧情。

只允许两种输出：
通过

或：
修正文
【正文】
完整修正正文

修正时只改明确违规处，保留时间、地点、事件顺序、NPC已发生行为、物品状态和外部结果。不得增加新事件。`;
    const user = `【玩家硬规则】
${settings.auditPrompt || '（无）'}

【玩家输入】
${playerText || '（空）'}

【待审核正文】
${assistantText}`;
    return { system, user };
}
function summaryPrompts(kind, settings, entries, subject) {
    const isSmall = kind === 'small';
    const custom = (isSmall ? settings.smallSummaryPrompt : settings.largeSummaryPrompt).trim();
    const system = `你是“镜渊”的${isSmall ? '场景级小总结器' : '跨场景大总结器'}。

你只读取世界书中已经存在的信息点链，按相同的“类型｜名称＋【关键词】＋【小标题】＋事实行”格式输出当前最终有效事实。

要求：
1. 同一事件的多个子信息点连起来才是完整事件事实；不要把单个过程片段误当最终结论。
2. 删除重复、被后续结果覆盖的过程，但保留仍影响后续的因果、关系、资源、身份和限制。
3. 将持续影响分别填写到对应人物、地点、物品、组织等条目。
4. 关键词只有新增、删除错误分类或需要收紧时才输出；不得把调度参数当关键词。
5. 临时事件、临时NPC或临时物品完成分发后，可在原条目填写：
【沉降处理】
归档
或
【沉降处理】
删除
6. 焦点对象、基础设定和人工锁定对象不得要求删除。
7. 没有变化填写“无”。不输出JSON、代码块、说明或分析过程。
8. ${isSmall ? '只整理当前场景或当前事件链。' : '只固化跨场景仍成立的长期结果，不逐句缩写小总结。'}${custom ? `\n\n【玩家附加总结要求】\n${custom}` : ''}`;
    const user = `【总结对象】
${subject || '当前相关信息点链'}

【世界书相关条目】
${entries.map(entryForPrompt).join('\n\n') || '（无）'}

请直接输出需要写回世界书的标题、关键词、小标题和核心事实。`;
    return { system, user };
}
function keywordTemplate(definitions) {
    return definitions.filter((item) => item.enabled).map((item) => {
        const aliases = item.aliases.length ? `；近义标签：${item.aliases.join('、')}` : '';
        const activation = item.constant ? '；插件规则：常驻' : '';
        const fields = item.fields.map((field) => {
            const options = field.options?.length ? `；选项：${field.options.join(' / ')}` : '';
            return `- 【${field.label}】：${policyDescription(field.policy)}${options}${field.prompt ? `；${field.prompt}` : ''}`;
        }).join('\n');
        return `关键词：${item.label}${aliases}${activation}\n用途：${item.description}\n${fields || '- 可按事实使用合适的小标题'}`;
    }).join('\n\n');
}
function entryForPrompt(entry) {
    const activation = [entry.focus ? '焦点' : '', entry.activation.constant ? '常驻' : ''].filter(Boolean).join('、');
    return `标题：${entry.title}${activation ? `（${activation}）` : ''}\nUID：${entry.uid}\n关键词：${entry.keywords.join('、') || '无'}\n正文：\n${(0, util_1.truncate)(entry.content || '（空）', 2200)}`;
}
function policyDescription(policy) {
    return {
        'semantic-upsert': '固定事实；相似内容不重复，同一信息槽变化时更新',
        'replace-by-anchor': '当前值；同一主体与属性只保留新值',
        'append-chain': '过程链；同一事件的新信息点顺序追加',
        'replace-section': '完整段落；用当前完整内容替换',
        'merge-titles': '固定标题集合；合并去重',
        'merge-keywords': '关键词或别名集合；合并去重',
    }[policy] ?? '按核心事实填写';
}

},
"settings":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsStore = exports.DEFAULT_SETTINGS = exports.DEFAULT_KEYWORDS = void 0;
exports.parseSettings = parseSettings;
const constants_1 = require("./constants");
const util_1 = require("./util");
const COMMON_LINKS = { key: 'links', label: '关联条目', policy: 'merge-titles' };
const COMMON_ALIASES = { key: 'aliases', label: '别名', policy: 'merge-keywords' };
const FIXED = { key: 'fixed', label: '固定事实', policy: 'semantic-upsert' };
const CURRENT = { key: 'current', label: '当前状态', policy: 'replace-by-anchor' };
exports.DEFAULT_KEYWORDS = [
    keyword('spacetime', '时空', '当前时间、时间推进、总体位置与连续性。', ['时间', '时空状态'], false, [CURRENT, { key: 'history', label: '历史事实', policy: 'append-chain' }, COMMON_LINKS], 620),
    keyword('scene', '场景', '当前实际发生的场景、参与对象、局面和直接限制。', ['当前场景'], false, [CURRENT, { key: 'change', label: '核心变化', policy: 'semantic-upsert' }, COMMON_LINKS], 700),
    keyword('character', '人物', '稳定人物身份、关系、当前状态与连续经历。', ['角色', 'NPC'], false, [FIXED, CURRENT, { key: 'relations', label: '关系状态', policy: 'semantic-upsert' }, { key: 'recent', label: '近期经历', policy: 'append-chain' }, COMMON_LINKS, COMMON_ALIASES], 520),
    keyword('item', '物品', '重要物品的持有、位置、数量、完整性、用途与因果变化。', ['道具', '装备'], false, [FIXED, CURRENT, { key: 'holder', label: '持有关系', policy: 'replace-by-anchor' }, COMMON_LINKS], 500),
    keyword('event', '事件', '事件动作骨架、进展、结果和当前状态。', ['事件链'], false, [{ key: 'status', label: '事件状态', policy: 'replace-by-anchor', options: ['开始', '进行中', '暂停', '结束', '无变化', '无'] }, { key: 'chain', label: '事件进程', policy: 'append-chain' }, { key: 'result', label: '当前结果', policy: 'replace-by-anchor' }, COMMON_LINKS], 680),
    keyword('region', '地点', '地点自身稳定属性、当前变化与重要事件影响。', ['地区', '区域', '场所'], false, [FIXED, CURRENT, COMMON_LINKS, COMMON_ALIASES], 470),
    keyword('global', '全局变化', '组织、制度、阵营、政权、群体格局与全局影响。', ['世界变化', '全局状态'], false, [FIXED, CURRENT, { key: 'history', label: '历史事实', policy: 'append-chain' }, COMMON_LINKS], 610),
    keyword('foundation', '基础设定', '世界规则、物种规则、制度基础、魔法体系等跨场景基础事实。', ['基础规则', '世界设定', '规则', '设定'], true, [{ key: 'definition', label: '规则定义', policy: 'semantic-upsert' }, { key: 'current', label: '现行规则', policy: 'replace-by-anchor' }, { key: 'effect', label: '持续影响', policy: 'semantic-upsert' }, COMMON_LINKS, COMMON_ALIASES], 860, false, 1),
    keyword('ability', '能力', '可稳定识别、会持续影响后续的能力、技能或特性。', ['技能', '特性'], false, [FIXED, CURRENT, { key: 'limits', label: '限制条件', policy: 'semantic-upsert' }, COMMON_LINKS], 540),
    keyword('relationship', '关系', '显著且会影响后续的对象关系与关系变化。', ['显著关系', '关系状态'], false, [FIXED, CURRENT, { key: 'history', label: '关系变化', policy: 'append-chain' }, COMMON_LINKS], 560),
    keyword('organization', '组织', '组织、阵营、机构、政权与其当前行动。', ['阵营', '机构', '政权'], false, [FIXED, CURRENT, { key: 'members', label: '成员关系', policy: 'merge-titles' }, COMMON_LINKS], 560),
    keyword('task', '任务', '明确成立的任务、目标、责任、约束与完成状态。', ['目标', '责任'], false, [CURRENT, { key: 'progress', label: '任务进程', policy: 'append-chain' }, { key: 'result', label: '当前结果', policy: 'replace-by-anchor' }, COMMON_LINKS], 600),
    keyword('contract', '契约', '契约、誓言、承诺、债务及其约束与状态。', ['誓言', '承诺', '债务'], false, [FIXED, CURRENT, { key: 'terms', label: '约束条件', policy: 'semantic-upsert' }, COMMON_LINKS], 580),
    keyword('condition', '状态影响', '疾病、诅咒、伤势和其他持续状态影响。', ['疾病', '诅咒', '伤势'], false, [FIXED, CURRENT, { key: 'effect', label: '持续影响', policy: 'semantic-upsert' }, COMMON_LINKS], 590),
    keyword('resource', '资源', '数量有限且会影响后续的资源、货币、权限或配额。', ['货币', '权限', '配额'], false, [CURRENT, { key: 'change', label: '资源变化', policy: 'append-chain' }, COMMON_LINKS], 490),
    keyword('custom', '自定义对象', '任何未预先举例但可稳定命名、会影响后续的对象。', ['自定义'], false, [FIXED, CURRENT, { key: 'chain', label: '变化记录', policy: 'append-chain' }, COMMON_LINKS, COMMON_ALIASES], 400),
];
function keyword(key, label, description, aliases, constant, fields, order, vectorized = true, depth = 4) {
    return {
        key,
        label,
        description,
        aliases,
        enabled: true,
        constant,
        vectorized,
        preventRecursion: false,
        depth,
        order,
        fields: (0, util_1.clone)(fields),
    };
}
exports.DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    autoProcess: false,
    auditEnabled: false,
    targetLorebook: '',
    autoCreateLorebook: true,
    auditPrompt: '',
    extractionPrompt: '',
    smallSummaryPrompt: '',
    largeSummaryPrompt: '',
    responseTokens: 3072,
    requestTimeoutMs: 90000,
    duplicateSimilarity: 0.86,
    chainDuplicateSimilarity: 0.93,
    bodyMatchThreshold: 0.48,
    smallSummaryTurns: 10,
    largeSummaryCount: 4,
    keywordDefinitions: exports.DEFAULT_KEYWORDS,
    sectionPolicies: {},
    matchWeights: {
        uid: 1200,
        exactTitle: 1000,
        normalizedTitle: 920,
        typeAndName: 900,
        alias: 820,
        keywordExact: 760,
        keywordContains: 620,
        reference: 540,
        bodySimilarity: 420,
        typeMismatchPenalty: -180,
    },
    activationRules: [
        { id: 'focus', label: '玩家焦点常驻', enabled: true, match: 'focus', set: { constant: true, vectorized: false, preventRecursion: false, depth: 1, order: 920 } },
        { id: 'mentioned', label: '本轮直接命中', enabled: true, match: 'mentioned', set: { vectorized: true, preventRecursion: false, depth: 2, order: 720 } },
        { id: 'linked-current', label: '关联当前场景', enabled: true, match: 'linked-current', set: { vectorized: true, preventRecursion: false, depth: 2, order: 680 } },
        { id: 'active-event', label: '活跃事件链', enabled: true, match: 'active-event', set: { vectorized: true, preventRecursion: false, depth: 2, order: 760 } },
        { id: 'default', label: '结构化条目默认召回', enabled: true, match: 'structured-default', set: { vectorized: true, preventRecursion: false, depth: 4, order: 400 } },
    ],
});
class SettingsStore {
    load(context) {
        const root = (context.extensionSettings ?? (context.extensionSettings = {}));
        const namespace = (0, util_1.isPlainObject)(root[constants_1.EXTENSION_NAMESPACE]) ? root[constants_1.EXTENSION_NAMESPACE] : {};
        const settings = parseSettings(namespace.settings);
        root[constants_1.EXTENSION_NAMESPACE] = { ...namespace, settings: (0, util_1.clone)(settings) };
        return settings;
    }
    save(context, patch) {
        const root = (context.extensionSettings ?? (context.extensionSettings = {}));
        const namespace = (0, util_1.isPlainObject)(root[constants_1.EXTENSION_NAMESPACE]) ? root[constants_1.EXTENSION_NAMESPACE] : {};
        const settings = parseSettings({ ...this.load(context), ...patch });
        root[constants_1.EXTENSION_NAMESPACE] = { ...namespace, settings: (0, util_1.clone)(settings) };
        context.saveSettingsDebounced?.();
        return settings;
    }
}
exports.SettingsStore = SettingsStore;
function parseSettings(value) {
    const candidate = (0, util_1.isPlainObject)(value) ? value : {};
    const sectionPolicies = {};
    if ((0, util_1.isPlainObject)(candidate.sectionPolicies)) {
        for (const [key, policy] of Object.entries(candidate.sectionPolicies)) {
            if (isPolicy(policy))
                sectionPolicies[key] = policy;
        }
    }
    return {
        ...(0, util_1.clone)(exports.DEFAULT_SETTINGS),
        enabled: candidate.enabled !== false,
        autoProcess: candidate.autoProcess === true,
        auditEnabled: candidate.auditEnabled === true,
        targetLorebook: String(candidate.targetLorebook ?? ''),
        autoCreateLorebook: candidate.autoCreateLorebook !== false,
        auditPrompt: String(candidate.auditPrompt ?? ''),
        extractionPrompt: String(candidate.extractionPrompt ?? ''),
        smallSummaryPrompt: String(candidate.smallSummaryPrompt ?? ''),
        largeSummaryPrompt: String(candidate.largeSummaryPrompt ?? ''),
        responseTokens: (0, util_1.clampNumber)(candidate.responseTokens, 3072, 256, 16384),
        requestTimeoutMs: (0, util_1.clampNumber)(candidate.requestTimeoutMs, 90000, 10000, 300000),
        duplicateSimilarity: clampFloat(candidate.duplicateSimilarity, 0.86, 0.5, 0.99),
        chainDuplicateSimilarity: clampFloat(candidate.chainDuplicateSimilarity, 0.93, 0.6, 0.999),
        bodyMatchThreshold: clampFloat(candidate.bodyMatchThreshold, 0.48, 0.2, 0.95),
        smallSummaryTurns: (0, util_1.clampNumber)(candidate.smallSummaryTurns, 10, 2, 100),
        largeSummaryCount: (0, util_1.clampNumber)(candidate.largeSummaryCount, 4, 2, 30),
        keywordDefinitions: parseKeywordDefinitions(candidate.keywordDefinitions, candidate.tables),
        sectionPolicies,
        matchWeights: { ...exports.DEFAULT_SETTINGS.matchWeights, ...((0, util_1.isPlainObject)(candidate.matchWeights) ? candidate.matchWeights : {}) },
        activationRules: Array.isArray(candidate.activationRules) ? candidate.activationRules : (0, util_1.clone)(exports.DEFAULT_SETTINGS.activationRules),
    };
}
function parseKeywordDefinitions(value, legacyTables) {
    const source = Array.isArray(value) ? value : legacyKeywords(legacyTables);
    if (!Array.isArray(source) || !source.length)
        return (0, util_1.clone)(exports.DEFAULT_KEYWORDS);
    const output = [];
    for (const raw of source) {
        if (!(0, util_1.isPlainObject)(raw))
            continue;
        const label = String(raw.label ?? '').trim();
        if (!label)
            continue;
        output.push({
            key: String(raw.key ?? (0, util_1.safeId)(label) ?? label),
            label,
            description: String(raw.description ?? raw.prompt ?? ''),
            aliases: (0, util_1.normalizeStringArray)(raw.aliases),
            enabled: raw.enabled !== false,
            constant: raw.constant === true || label === '基础设定',
            vectorized: raw.vectorized !== false && label !== '基础设定',
            preventRecursion: raw.preventRecursion === true,
            depth: (0, util_1.clampNumber)(raw.depth, label === '基础设定' ? 1 : 4, 0, 99),
            order: (0, util_1.clampNumber)(raw.order, label === '基础设定' ? 860 : 400, 0, 9999),
            fields: parseFields(raw.fields),
        });
    }
    // Defaults are templates, not a whitelist. Existing old settings gain every missing
    // keyword, subsection and option while unknown/custom keywords remain untouched.
    const fallbackByLabel = new Map(exports.DEFAULT_KEYWORDS.map((item) => [item.label, item]));
    const merged = output.map((item) => mergeDefaultKeyword(item, fallbackByLabel.get(item.label)));
    const labels = new Set(merged.map((item) => item.label));
    for (const fallback of exports.DEFAULT_KEYWORDS)
        if (!labels.has(fallback.label))
            merged.push((0, util_1.clone)(fallback));
    return merged;
}
function mergeDefaultKeyword(current, fallback) {
    if (!fallback)
        return current;
    const fields = current.fields.map((field) => {
        const defaultField = fallback.fields.find((candidate) => candidate.label === field.label);
        if (!defaultField)
            return field;
        return {
            ...(0, util_1.clone)(defaultField),
            ...field,
            options: field.options?.length ? field.options : (0, util_1.clone)(defaultField.options ?? []),
            prompt: field.prompt || defaultField.prompt || '',
        };
    });
    const fieldLabels = new Set(fields.map((field) => field.label));
    for (const defaultField of fallback.fields)
        if (!fieldLabels.has(defaultField.label))
            fields.push((0, util_1.clone)(defaultField));
    return {
        ...(0, util_1.clone)(fallback),
        ...current,
        description: current.description || fallback.description,
        aliases: (0, util_1.unique)([...fallback.aliases, ...current.aliases]),
        constant: current.label === '基础设定' ? true : current.constant,
        vectorized: current.label === '基础设定' ? false : current.vectorized,
        fields,
    };
}
function legacyKeywords(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((raw) => {
        if (!(0, util_1.isPlainObject)(raw))
            return [];
        return [{ ...raw, description: raw.prompt, aliases: [], enabled: true, constant: String(raw.label ?? '') === '基础设定', vectorized: true, preventRecursion: false, depth: 4, order: 400 }];
    });
}
function parseFields(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((field) => {
        if (!(0, util_1.isPlainObject)(field))
            return [];
        const label = String(field.label ?? '').trim();
        if (!label)
            return [];
        return [{
                key: String(field.key ?? (0, util_1.safeId)(label) ?? label),
                label,
                policy: isPolicy(field.policy) ? field.policy : 'semantic-upsert',
                options: (0, util_1.normalizeStringArray)(field.options),
                prompt: String(field.prompt ?? ''),
            }];
    });
}
function isPolicy(value) {
    return ['semantic-upsert', 'replace-by-anchor', 'append-chain', 'replace-section', 'merge-titles', 'merge-keywords'].includes(String(value));
}
function clampFloat(value, fallback, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

},
"tasks":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskRunner = void 0;
const constants_1 = require("./constants");
const matcher_1 = require("./matcher");
const operations_1 = require("./operations");
const parser_1 = require("./parser");
const prompts_1 = require("./prompts");
const util_1 = require("./util");
class TaskRunner {
    constructor(host, worldbook) {
        this.host = host;
        this.worldbook = worldbook;
        this.status = { phase: 'idle', detail: '等待操作', error: '', rawResult: '', plan: null, lastCompletedMessageKey: '' };
        this.listeners = new Set();
        this.runningByChat = new Map();
    }
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.currentStatus());
        return () => this.listeners.delete(listener);
    }
    currentStatus() { return structuredClone(this.status); }
    processTurn(settings, automatic = false, requestedIndex) {
        const turn = this.host.latestTurn(requestedIndex);
        const previous = this.runningByChat.get(turn.chatKey) ?? Promise.resolve();
        const task = previous.catch(() => undefined).then(() => this.processTurnInternal(settings, automatic, requestedIndex));
        this.runningByChat.set(turn.chatKey, task);
        return task.finally(() => { if (this.runningByChat.get(turn.chatKey) === task)
            this.runningByChat.delete(turn.chatKey); });
    }
    async runTask(kind, settings) {
        if (kind === 'audit') {
            const turn = this.host.latestTurn();
            await this.audit(settings, turn);
            return this.worldbook.list(settings);
        }
        if (kind === 'extraction')
            return this.extract(settings, this.host.latestTurn());
        return this.summarize(kind === 'smallSummary' ? 'small' : 'large', settings, this.host.latestTurn());
    }
    async previewExtraction(settings, raw) {
        const turn = this.host.latestTurn();
        const entries = await this.worldbook.list(settings);
        const blocks = (0, parser_1.parseInformationPoints)(raw);
        const plan = (0, operations_1.buildOperationPlan)(blocks, entries, settings, `${turn.playerText}\n${turn.assistantText}`);
        this.setStatus('matching', `预览完成：${plan.operations.length} 个操作`, '', raw, plan);
        return plan;
    }
    async processTurnInternal(settings, automatic, requestedIndex) {
        let turn = this.host.latestTurn(requestedIndex);
        const cursor = this.host.cursor();
        if (automatic && cursor.lastProcessedMessageKey === turn.messageKey && cursor.lastProcessedHash === turn.contentHash) {
            this.setStatus('complete', '该正文已经处理，跳过重复事件', '', '', null, turn.messageKey);
            return this.worldbook.list(settings);
        }
        try {
            this.setStatus('reading', '读取本轮正文与当前世界书');
            if (settings.auditEnabled && settings.auditPrompt.trim())
                turn = await this.audit(settings, turn);
            const entries = await this.extract(settings, turn);
            const sceneTitle = currentSceneTitle(entries);
            const nextCursor = this.host.cursor();
            nextCursor.lastProcessedMessageKey = turn.messageKey;
            nextCursor.lastProcessedHash = turn.contentHash;
            nextCursor.turnsSinceSmall += 1;
            const sceneChanged = Boolean(sceneTitle && nextCursor.lastSceneTitle && (0, util_1.normalizeTitle)(sceneTitle) !== (0, util_1.normalizeTitle)(nextCursor.lastSceneTitle));
            if (sceneTitle)
                nextCursor.lastSceneTitle = sceneTitle;
            await this.host.saveCursor(nextCursor);
            if (sceneChanged || nextCursor.turnsSinceSmall >= settings.smallSummaryTurns) {
                await this.summarize('small', settings, turn, sceneChanged ? `上一场景：${cursor.lastSceneTitle}` : `当前阶段：${sceneTitle || '未命名场景'}`);
                const afterSmall = this.host.cursor();
                afterSmall.turnsSinceSmall = 0;
                afterSmall.smallCountSinceLarge += 1;
                await this.host.saveCursor(afterSmall);
                if (afterSmall.smallCountSinceLarge >= settings.largeSummaryCount) {
                    await this.summarize('large', settings, turn, '未固化的小总结与长期条目');
                    const afterLarge = this.host.cursor();
                    afterLarge.smallCountSinceLarge = 0;
                    await this.host.saveCursor(afterLarge);
                }
            }
            const finalEntries = await this.worldbook.list(settings);
            this.setStatus('complete', `处理完成：世界书共 ${finalEntries.length} 个结构化条目`, '', this.status.rawResult, this.status.plan, turn.messageKey);
            return finalEntries;
        }
        catch (error) {
            this.setStatus('error', '本轮停止，世界书未强行写入错误结果', (0, util_1.errorText)(error));
            throw error;
        }
    }
    async audit(settings, turn) {
        this.setStatus('audit', '审核当前正文');
        const prompt = (0, prompts_1.auditPrompts)(settings, turn.playerText, turn.assistantText);
        const raw = await this.host.generate(prompt.system, trimPrompt(prompt.user), settings.responseTokens, turn.chatKey, settings.requestTimeoutMs);
        this.status.rawResult = raw;
        if (/^\s*通过\s*[。.]?\s*$/u.test(raw))
            return turn;
        const revised = raw.match(/修正文\s*\n\s*【正文】\s*\n([\s\S]+)$/u)?.[1]?.trim();
        if (!revised)
            throw new Error('审核输出既不是“通过”，也没有合法的修正文');
        return this.host.replaceAssistantText(turn, revised);
    }
    async extract(settings, turn) {
        this.setStatus('extracting', 'AI提取本轮核心信息点');
        const entries = await this.worldbook.list(settings);
        const selected = (0, matcher_1.relevantEntries)(entries, `${turn.playerText}\n${turn.assistantText}`);
        const prompt = (0, prompts_1.extractionPrompts)(settings, turn.playerText, turn.assistantText, selected);
        const raw = await this.host.generate(prompt.system, trimPrompt(prompt.user), settings.responseTokens, turn.chatKey, settings.requestTimeoutMs);
        this.setRaw(raw);
        const blocks = (0, parser_1.parseInformationPoints)(raw);
        if (!blocks.length) {
            this.setStatus('matching', 'AI判定本轮无核心信息点', '', raw, { blocks: [], operations: [], createdAt: Date.now() });
            return entries;
        }
        this.setStatus('matching', '语法、标题、关键词与少量正文匹配');
        const plan = (0, operations_1.buildOperationPlan)(blocks, entries, settings, `${turn.playerText}\n${turn.assistantText}`);
        this.status.plan = plan;
        this.emit();
        return this.apply(settings, plan, turn.messageKey, `${turn.playerText}\n${turn.assistantText}`, '信息点');
    }
    async summarize(kind, settings, turn, subject = '') {
        this.setStatus('summary', `${kind === 'small' ? '小总结' : '大总结'}读取信息点链`);
        const entries = await this.worldbook.list(settings);
        const selected = kind === 'small'
            ? entries.filter((entry) => entry.focus || /(事件|场景|人物|物品|地区)/u.test(entry.type) && /(进行中|当前|近期经历|事件进程)/u.test(entry.content)).slice(-40)
            : entries.filter((entry) => /(小总结|固定事实|历史事实|大总结)/u.test(`${entry.type}\n${entry.content}`)).slice(-60);
        const prompt = (0, prompts_1.summaryPrompts)(kind, settings, selected, subject);
        const raw = await this.host.generate(prompt.system, trimPrompt(prompt.user), settings.responseTokens, turn.chatKey, settings.requestTimeoutMs);
        this.setRaw(raw);
        const blocks = (0, parser_1.parseInformationPoints)(raw);
        if (!blocks.length)
            return entries;
        const plan = (0, operations_1.buildOperationPlan)(blocks, entries, settings, selected.map((entry) => `${entry.title}\n${entry.content}`).join('\n'));
        this.status.plan = plan;
        this.emit();
        return this.apply(settings, plan, turn.messageKey, `${turn.playerText}\n${turn.assistantText}`, kind === 'small' ? '小总结' : '大总结');
    }
    async apply(settings, plan, sourceMessageKey, contextText, label) {
        if (!plan.operations.some((operation) => operation.kind !== 'noop'))
            return this.worldbook.list(settings);
        this.setStatus('worldbook', `${label}匹配结果直接写入世界书`, '', this.status.rawResult, plan);
        return this.worldbook.apply(settings, plan, sourceMessageKey, contextText, this.host.getFocusTitle());
    }
    setRaw(raw) { this.status.rawResult = raw; this.emit(); }
    setStatus(phase, detail, error = '', rawResult = this.status.rawResult, plan = this.status.plan, lastCompletedMessageKey = this.status.lastCompletedMessageKey) {
        this.status = { phase, detail, error, rawResult, plan, lastCompletedMessageKey };
        this.emit();
    }
    emit() { for (const listener of this.listeners)
        listener(this.currentStatus()); }
}
exports.TaskRunner = TaskRunner;
function trimPrompt(value) {
    return value.length <= constants_1.MAX_CONTEXT_CHARS ? value : `${value.slice(0, constants_1.MAX_CONTEXT_CHARS)}\n[已按字符上限截断]`;
}
function currentSceneTitle(entries) {
    return entries.find((entry) => /(场景|时空)/u.test(entry.type) && /(当前场景|当前状态|进行中)/u.test(entry.content))?.title ?? '';
}

},
"ui":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceUi = void 0;
const constants_1 = require("./constants");
const settings_1 = require("./settings");
const util_1 = require("./util");
const parser_1 = require("./parser");
const TABS = [
    ['overview', '总览'], ['entries', '信息表'], ['keywords', '关键词'], ['matching', '匹配'],
    ['graph', '记忆网络'], ['worldbook', '世界书'], ['audit', '审核'], ['settings', '设置'], ['diagnostics', '诊断'],
];
class WorkspaceUi {
    constructor(host, settingsStore, worldbook, tasks) {
        this.host = host;
        this.settingsStore = settingsStore;
        this.worldbook = worldbook;
        this.tasks = tasks;
        this.entries = [];
        this.tab = 'overview';
        this.selectedKeyword = '';
        this.root = null;
        this.opener = null;
        this.settingsEntry = null;
        this.unsubscribe = null;
        this.search = '';
        this.refreshGeneration = 0;
        this.projectionLoading = false;
        this.projectionError = '';
        this.migrationPreview = null;
        this.migrationBusy = false;
        this.migrationMessage = '';
        this.settings = settingsStore.load(host.context());
        this.status = tasks.currentStatus();
    }
    mount() {
        this.ensureWorkspaceRoot();
        this.ensureEntrypoints();
        this.unsubscribe ?? (this.unsubscribe = this.tasks.subscribe((status) => {
            this.status = status;
            this.render();
        }));
        this.render();
        void this.refreshEntries();
    }
    unmount() {
        this.refreshGeneration += 1;
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.root?.remove();
        this.root = null;
        this.opener?.remove();
        this.opener = null;
        this.settingsEntry?.remove();
        this.settingsEntry = null;
        document.body?.classList.remove('maip-workspace-open');
    }
    ensureEntrypoints() {
        const parent = document.body ?? document.documentElement;
        if (!this.opener) {
            this.opener = document.createElement('button');
            this.opener.className = 'maip-opener';
            this.opener.type = 'button';
            this.opener.setAttribute('aria-label', '打开 Mirror Abyss 镜渊');
            this.opener.innerHTML = '<span class="maip-opener-mark">渊</span><span class="maip-opener-text">镜渊</span>';
            this.opener.addEventListener('click', () => this.open());
        }
        if (!this.opener.isConnected)
            parent.appendChild(this.opener);
        const settingsHost = findSettingsHost();
        if (settingsHost) {
            if (!this.settingsEntry) {
                this.settingsEntry = document.createElement('div');
                this.settingsEntry.className = 'maip-settings-entry';
                this.settingsEntry.innerHTML = `
          <div><b>Mirror Abyss｜镜渊</b><small>信息点提取、关键词匹配与世界书映射</small></div>
          <button type="button">打开工作区</button>`;
                this.settingsEntry.querySelector('button')?.addEventListener('click', () => this.open());
            }
            if (!this.settingsEntry.isConnected)
                settingsHost.prepend(this.settingsEntry);
        }
    }
    openTab(tab) {
        const candidate = TABS.some(([key]) => key === tab) ? tab : this.tab;
        this.open(candidate);
    }
    open(tab = this.tab) {
        this.tab = tab;
        this.ensureWorkspaceRoot();
        if (!this.root)
            return;
        this.render();
        document.body?.classList.add('maip-workspace-open');
        try {
            if (!this.root.open && typeof this.root.showModal === 'function')
                this.root.showModal();
            else if (!this.root.open)
                this.root.setAttribute('open', '');
        }
        catch (error) {
            console.warn('[MirrorAbyss] dialog.showModal failed; using open attribute fallback', error);
            this.root.setAttribute('open', '');
        }
        void this.refreshEntries();
    }
    close() {
        if (this.root?.open && typeof this.root.close === 'function')
            this.root.close();
        else
            this.root?.removeAttribute('open');
        document.body?.classList.remove('maip-workspace-open');
    }
    async refreshEntries() {
        const generation = ++this.refreshGeneration;
        this.projectionLoading = true;
        this.projectionError = '';
        this.render();
        try {
            const settings = this.settingsStore.load(this.host.context());
            const entries = await this.worldbook.list(settings);
            if (generation !== this.refreshGeneration)
                return;
            this.settings = settings;
            this.entries = entries;
            const keywords = this.entryKeywords();
            if (this.selectedKeyword && !keywords.includes(this.selectedKeyword))
                this.selectedKeyword = '';
        }
        catch (error) {
            if (generation !== this.refreshGeneration)
                return;
            this.projectionError = error instanceof Error ? error.message : String(error);
        }
        finally {
            if (generation === this.refreshGeneration) {
                this.projectionLoading = false;
                this.render();
            }
        }
    }
    ensureWorkspaceRoot() {
        if (!this.root) {
            const root = document.createElement('dialog');
            root.id = 'maip-workspace';
            root.className = 'maip-shell';
            root.setAttribute('aria-label', constants_1.DISPLAY_NAME);
            root.style.position = 'fixed';
            root.style.inset = '0';
            root.style.width = '100vw';
            root.style.height = '100dvh';
            root.style.maxWidth = 'none';
            root.style.maxHeight = 'none';
            root.style.margin = '0';
            root.style.padding = '0';
            root.style.border = '0';
            root.style.background = 'transparent';
            root.addEventListener('cancel', (event) => { event.preventDefault(); this.close(); });
            root.addEventListener('close', () => document.body?.classList.remove('maip-workspace-open'));
            root.addEventListener('click', (event) => void this.onClick(event));
            root.addEventListener('change', (event) => void this.onChange(event));
            root.addEventListener('input', (event) => this.onInput(event));
            this.root = root;
        }
        const parent = document.body ?? document.documentElement;
        if (!this.root.isConnected)
            parent.appendChild(this.root);
    }
    render() {
        if (!this.root)
            return;
        this.root.innerHTML = `
      <section class="maip-workspace" aria-label="${constants_1.DISPLAY_NAME}">
        <aside class="maip-sidebar">
          <div class="maip-brand">
            <span class="maip-brand-mark">渊</span>
            <div><b>${constants_1.DISPLAY_NAME}</b><small>${constants_1.VERSION}</small></div>
          </div>
          <section class="maip-quick-panel" aria-label="功能开关">
            <h3>功能开关</h3>
            ${settingSwitch('enabled', '启用插件', this.settings.enabled)}
            ${settingSwitch('autoProcess', '自动处理正文', this.settings.autoProcess)}
            ${settingSwitch('auditEnabled', '启用审核', this.settings.auditEnabled)}
            ${settingSwitch('autoCreateLorebook', '自动创建世界书', this.settings.autoCreateLorebook)}
          </section>
          <nav class="maip-tabs">${TABS.map(([key, label]) => `<button data-tab="${key}" class="${this.tab === key ? 'active' : ''}">${label}</button>`).join('')}</nav>
        </aside>
        <section class="maip-content">
          <header class="maip-header">
            <div>
              <div class="maip-kicker">WORLD INFO · INFORMATION POINT MATCHER</div>
              <h2>${TABS.find(([key]) => key === this.tab)?.[1] ?? constants_1.DISPLAY_NAME}</h2>
              <p>信息点提取 → 关键词与正文匹配 → 世界书操作</p>
            </div>
            <div class="maip-header-actions">
              <button class="maip-icon" data-action="refresh" title="刷新" aria-label="刷新">↻</button>
              <button class="maip-icon" data-action="close" title="关闭" aria-label="关闭">×</button>
            </div>
          </header>
          <main class="maip-main">${this.renderTab()}</main>
          <footer class="maip-status ${this.status.phase === 'error' || this.projectionError ? 'error' : ''}">
            <span class="maip-status-dot"></span>
            <b>${phaseLabel(this.status.phase)}</b>
            <span>${(0, util_1.escapeHtml)(this.migrationMessage || this.projectionError || (this.projectionLoading ? '正在读取世界书投影…' : '') || this.status.error || this.status.detail || '已就绪')}</span>
          </footer>
        </section>
      </section>`;
    }
    renderTab() {
        if (this.tab === 'overview')
            return this.renderOverview();
        if (this.tab === 'entries')
            return this.renderEntries();
        if (this.tab === 'keywords')
            return this.renderKeywords();
        if (this.tab === 'matching')
            return this.renderMatching();
        if (this.tab === 'graph')
            return this.renderGraph();
        if (this.tab === 'worldbook')
            return this.renderWorldbook();
        if (this.tab === 'audit')
            return this.renderAudit();
        if (this.tab === 'settings')
            return this.renderSettings();
        return this.renderDiagnostics();
    }
    renderOverview() {
        const changed = this.status.plan?.operations.filter((operation) => operation.kind !== 'noop').length ?? 0;
        const skipped = this.status.plan?.operations.filter((operation) => operation.kind === 'noop').length ?? 0;
        const keywords = this.entryKeywords();
        const foundations = this.entries.filter((entry) => hasKeyword(entry, '基础设定')).length;
        return `
      <section class="maip-hero-grid">
        <article class="maip-card maip-primary-card">
          <div class="maip-card-label">当前世界书</div>
          <div class="maip-big">${(0, util_1.escapeHtml)(this.bookName())}</div>
          <div class="maip-muted">世界书是唯一剧情数据源；信息表和图谱只做即时映射。</div>
          <div class="maip-actions">
            <button class="maip-btn primary" data-action="process">处理最新正文</button>
            <button class="maip-btn" data-action="extract">仅提取</button>
            <button class="maip-btn" data-action="small">小总结</button>
            <button class="maip-btn" data-action="large">大总结</button>
          </div>
        </article>
        <article class="maip-card maip-metric"><span>世界书条目</span><strong>${this.entries.length}</strong><small>${keywords.length} 个实际关键词</small></article>
        <article class="maip-card maip-metric"><span>基础设定</span><strong>${foundations}</strong><small>含“基础设定”关键词即常驻</small></article>
        <article class="maip-card maip-metric"><span>本轮操作</span><strong>${changed}</strong><small>${skipped} 条相似信息已跳过</small></article>
      </section>
      <section class="maip-two-col">
        <article class="maip-card">
          <div class="maip-section-head"><div><h3>最近匹配计划</h3><p>显示匹配依据和准备执行的世界书操作。</p></div><button class="maip-link" data-tab="matching">查看全部</button></div>
          ${this.renderOperationList((this.status.plan?.operations ?? []).slice(0, 8))}
        </article>
        <article class="maip-card">
          <div class="maip-section-head"><div><h3>世界书关键词</h3><p>这些才是分类标签；未预设关键词同样保留。</p></div><button class="maip-link" data-tab="keywords">管理默认规则</button></div>
          <div class="maip-type-cloud">${keywords.slice(0, 36).map((keyword) => `<button data-keyword="${(0, util_1.escapeHtml)(keyword)}" data-tab="entries"><b>${(0, util_1.escapeHtml)(keyword)}</b><span>${this.entries.filter((entry) => hasKeyword(entry, keyword)).length}</span></button>`).join('') || '<span class="maip-empty">暂无关键词</span>'}</div>
        </article>
      </section>`;
    }
    renderEntries() {
        const keywords = this.entryKeywords();
        const filtered = this.entries.filter((entry) => (!this.selectedKeyword || hasKeyword(entry, this.selectedKeyword)) && (!this.search || `${entry.title}\n${entry.content}\n${entry.keywords.join(' ')}`.toLocaleLowerCase().includes(this.search.toLocaleLowerCase())));
        const sectionNames = [...new Set(filtered.flatMap((entry) => entry.sections.order))].slice(0, 7);
        return `
      <section class="maip-toolbar">
        <div class="maip-segment"><button data-keyword="" class="${this.selectedKeyword ? '' : 'active'}">全部 <span>${this.entries.length}</span></button>${keywords.map((keyword) => `<button data-keyword="${(0, util_1.escapeHtml)(keyword)}" class="${this.selectedKeyword === keyword ? 'active' : ''}">${(0, util_1.escapeHtml)(keyword)} <span>${this.entries.filter((entry) => hasKeyword(entry, keyword)).length}</span></button>`).join('')}</div>
        <input class="maip-search" data-input="search" placeholder="搜索标题、关键词或正文" value="${(0, util_1.escapeHtml)(this.search)}">
      </section>
      <section class="maip-card maip-table-card">
        <div class="maip-table-wrap"><table class="maip-table">
          <thead><tr><th>条目</th><th>关键词</th>${sectionNames.map((name) => `<th>${(0, util_1.escapeHtml)(name)}</th>`).join('')}<th>召回</th><th>操作</th></tr></thead>
          <tbody>${filtered.map((entry) => `<tr>
            <td class="maip-title-cell" data-label="条目"><b>${(0, util_1.escapeHtml)(entry.title)}</b><small>UID ${(0, util_1.escapeHtml)(entry.uid)}</small></td>
            <td data-label="关键词"><textarea data-keywords-uid="${(0, util_1.escapeHtml)(entry.uid)}" rows="4">${(0, util_1.escapeHtml)(entry.keywords.join('\n'))}</textarea></td>
            ${sectionNames.map((name) => `<td data-label="${(0, util_1.escapeHtml)(name)}"><textarea data-entry-uid="${(0, util_1.escapeHtml)(entry.uid)}" data-section="${(0, util_1.escapeHtml)(name)}" rows="4">${(0, util_1.escapeHtml)((entry.sections.values[name] ?? []).join('\n'))}</textarea></td>`).join('')}
            <td data-label="召回"><div class="maip-recall"><span>${entry.activation.constant ? '常驻' : entry.activation.vectorized ? '向量' : '关键词'}</span><small>深度 ${entry.activation.depth} · 顺序 ${entry.activation.order}</small></div></td>
            <td data-label="操作"><button class="maip-link" data-action="save-entry" data-uid="${(0, util_1.escapeHtml)(entry.uid)}">保存</button><button class="maip-link ${entry.focus ? 'danger' : ''}" data-action="focus" data-title="${(0, util_1.escapeHtml)(entry.title)}">${entry.focus ? '取消焦点' : '设为焦点'}</button></td>
          </tr>`).join('') || `<tr><td colspan="${sectionNames.length + 5}" class="maip-empty">当前筛选下没有条目</td></tr>`}</tbody>
        </table></div>
      </section>`;
    }
    renderKeywords() {
        return `<section class="maip-keyword-intro maip-card"><div><h3>默认关键词与小标题</h3><p>缺失的默认关键词、小标题和选项会自动补齐；列表外的新关键词仍可正常创建和匹配。</p></div><div class="maip-actions compact"><button class="maip-btn" data-action="reset-keywords">恢复完整默认项</button><button class="maip-btn primary" data-action="add-keyword">＋ 新增关键词规则</button></div></section>
      <section class="maip-template-grid">${this.settings.keywordDefinitions.map((definition, index) => this.renderKeywordDefinition(definition, index)).join('')}</section>`;
    }
    renderKeywordDefinition(definition, index) {
        return `<article class="maip-card maip-template">
      <div class="maip-section-head"><div><h3>${(0, util_1.escapeHtml)(definition.label)}</h3><p>${(0, util_1.escapeHtml)(definition.description)}</p></div><button class="maip-link danger" data-action="delete-keyword" data-index="${index}">删除规则</button></div>
      <div class="maip-keyword-rule-grid">
        <label>关键词<input data-keyword-prop="label" data-index="${index}" value="${(0, util_1.escapeHtml)(definition.label)}"></label>
        <label>近义标签<input data-keyword-prop="aliases" data-index="${index}" value="${(0, util_1.escapeHtml)(definition.aliases.join(' / '))}" placeholder="用 / 分隔"></label>
        <label class="maip-switch"><input type="checkbox" data-keyword-prop="constant" data-index="${index}" ${definition.constant ? 'checked' : ''}><span></span>常驻</label>
        <label class="maip-switch"><input type="checkbox" data-keyword-prop="vectorized" data-index="${index}" ${definition.vectorized ? 'checked' : ''}><span></span>向量</label>
        <label>深度<input type="number" data-keyword-prop="depth" data-index="${index}" value="${definition.depth}"></label>
        <label>顺序<input type="number" data-keyword-prop="order" data-index="${index}" value="${definition.order}"></label>
      </div>
      <label>用途说明<textarea data-keyword-prop="description" data-index="${index}" rows="2">${(0, util_1.escapeHtml)(definition.description)}</textarea></label>
      <div class="maip-fields">${definition.fields.map((field, fieldIndex) => this.renderField(field, index, fieldIndex)).join('')}</div>
      <button class="maip-btn small" data-action="add-field" data-index="${index}">＋ 新增建议小标题</button>
    </article>`;
    }
    renderField(field, keywordIndex, fieldIndex) {
        return `<div class="maip-field-row">
      <input data-field-prop="label" data-keyword-index="${keywordIndex}" data-field-index="${fieldIndex}" value="${(0, util_1.escapeHtml)(field.label)}" aria-label="小标题">
      <select data-field-prop="policy" data-keyword-index="${keywordIndex}" data-field-index="${fieldIndex}">${policyOptions(field.policy)}</select>
      <input data-field-prop="options" data-keyword-index="${keywordIndex}" data-field-index="${fieldIndex}" value="${(0, util_1.escapeHtml)((field.options ?? []).join(' / '))}" placeholder="可选项，用 / 分隔">
      <button class="maip-icon danger" data-action="delete-field" data-keyword-index="${keywordIndex}" data-field-index="${fieldIndex}">×</button>
    </div>`;
    }
    renderMatching() {
        const plan = this.status.plan;
        return `<section class="maip-two-col wide-left">
      <article class="maip-card">
        <div class="maip-section-head"><div><h3>AI 原始填写</h3><p>标题、【关键词】、小标题、信息点和“无”的固定自然语言格式。</p></div></div>
        <textarea class="maip-raw" data-input="raw-preview" rows="22">${(0, util_1.escapeHtml)(this.status.rawResult)}</textarea>
        <div class="maip-actions"><button class="maip-btn" data-action="preview">重新解析预览</button></div>
      </article>
      <article class="maip-card">
        <div class="maip-section-head"><div><h3>匹配与操作</h3><p>${plan ? `${plan.blocks.length} 个标题块 · ${plan.operations.length} 个操作` : '尚无计划'}</p></div></div>
        ${this.renderOperationList(plan?.operations ?? [], true)}
      </article>
    </section>`;
    }
    renderOperationList(operations, detailed = false) {
        if (!operations.length)
            return '<div class="maip-empty">暂无匹配记录</div>';
        return `<div class="maip-ops">${operations.map((operation) => `<div class="maip-op ${operation.kind === 'noop' ? 'muted' : ''}">
      <span class="maip-op-kind">${operationLabel(operation.kind)}</span>
      <div><b>${(0, util_1.escapeHtml)(operation.title)}${operation.section ? ` · ${(0, util_1.escapeHtml)(operation.section)}` : ''}</b><p>${(0, util_1.escapeHtml)(operation.reason)}</p>${detailed && operation.matchEvidence?.length ? `<small>${operation.matchEvidence.map((item) => `${(0, util_1.escapeHtml)(item.kind)} +${item.score}`).join(' · ')}</small>` : ''}${operation.newValue ? `<pre>${(0, util_1.escapeHtml)((0, util_1.truncate)(operation.newValue, 220))}</pre>` : ''}</div>
      ${operation.score !== undefined ? `<em>${operation.score}</em>` : ''}
    </div>`).join('')}</div>`;
    }
    renderGraph() {
        const nodes = this.entries.slice(0, 70);
        if (!nodes.length)
            return '<div class="maip-card maip-empty">暂无可投影条目</div>';
        const width = 900, height = 560, cx = width / 2, cy = height / 2, radius = Math.min(width, height) * 0.38;
        const points = new Map(nodes.map((entry, index) => [entry.title, { x: cx + Math.cos((index / nodes.length) * Math.PI * 2) * radius, y: cy + Math.sin((index / nodes.length) * Math.PI * 2) * radius }]));
        const edges = nodes.flatMap((entry) => entry.references.map((reference) => ({ from: entry.title, to: reference }))).filter((edge) => points.has(edge.to));
        return `<section class="maip-card maip-graph-card"><div class="maip-section-head"><div><h3>世界书关系网络</h3><p>节点来自标题，边来自【关联条目】；没有独立图数据库。</p></div></div>
      <svg class="maip-graph" viewBox="0 0 ${width} ${height}" role="img">
        ${edges.map((edge) => { const a = points.get(edge.from); const b = points.get(edge.to); return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`; }).join('')}
        ${nodes.map((entry) => { const point = points.get(entry.title); return `<g transform="translate(${point.x},${point.y})"><circle r="${entry.focus ? 18 : 12}" class="${entry.focus ? 'focus' : ''}"/><text y="-19" text-anchor="middle">${(0, util_1.escapeHtml)((0, util_1.truncate)(entry.name, 12))}</text><title>${(0, util_1.escapeHtml)(entry.title)}｜${(0, util_1.escapeHtml)(entry.keywords.join('、'))}</title></g>`; }).join('')}
      </svg></section>`;
    }
    renderWorldbook() {
        return `<section class="maip-two-col wide-left">
      <article class="maip-card">
        <div class="maip-section-head"><div><h3>旧世界书格式转换</h3><p>点击后直接扫描当前世界书，并在确认后转换需要调整的旧条目。</p></div></div>
        <div class="maip-callout"><b>不会清空旧内容</b><span>原 UID 和原生字段保留；无法可靠拆分的正文进入【旧格式保留】，无法判断分类的条目使用“自定义对象”关键词。</span></div>
        <div class="maip-actions">
          <button class="maip-btn primary" data-action="migration-apply" ${this.migrationBusy ? 'disabled' : ''}>转换旧世界书</button>
          <button class="maip-btn danger-outline" data-action="migration-undo" ${!this.worldbook.canUndoMigration() || this.migrationBusy ? 'disabled' : ''}>撤销本次转换</button>
        </div>
        <p class="maip-muted">插件会在点击转换后内部扫描；没有需要转换的条目时不会写入。“基础设定”关键词转换后自动常驻。</p>
      </article>
      <article class="maip-card maip-metric"><span>当前绑定</span><strong class="maip-focus-text">${(0, util_1.escapeHtml)(this.bookName())}</strong><small>${(0, util_1.escapeHtml)(this.migrationMessage || '等待操作')}</small></article>
    </section>`;
    }
    renderAudit() {
        return `<section class="maip-two-col">
      <article class="maip-card"><h3>审核规则</h3><p class="maip-muted">审核开关位于左上角；审核只修当前正文，不写世界书。</p><textarea data-setting="auditPrompt" rows="16" placeholder="一条硬规则一行">${(0, util_1.escapeHtml)(this.settings.auditPrompt)}</textarea></article>
      <article class="maip-card"><h3>提取补充要求</h3><p class="maip-muted">核心协议已经内置，这里只放项目特有边界。</p><textarea data-setting="extractionPrompt" rows="16">${(0, util_1.escapeHtml)(this.settings.extractionPrompt)}</textarea></article>
    </section>`;
    }
    renderSettings() {
        return `<section class="maip-settings-grid">
      <article class="maip-card"><h3>基础配置</h3><p class="maip-muted">运行开关已移到左上角。</p>
        <label>目标世界书<input data-setting="targetLorebook" value="${(0, util_1.escapeHtml)(this.settings.targetLorebook)}" placeholder="留空则读取当前聊天绑定"></label>
        <label>响应 Token<input type="number" data-setting="responseTokens" value="${this.settings.responseTokens}"></label>
      </article>
      <article class="maip-card"><h3>信息点相似度</h3>
        <label>普通事实重复阈值<input type="number" step="0.01" min="0.5" max="0.99" data-setting="duplicateSimilarity" value="${this.settings.duplicateSimilarity}"></label>
        <label>事件链重复阈值<input type="number" step="0.01" min="0.6" max="0.999" data-setting="chainDuplicateSimilarity" value="${this.settings.chainDuplicateSimilarity}"></label>
        <label>小总结回合兜底<input type="number" data-setting="smallSummaryTurns" value="${this.settings.smallSummaryTurns}"></label>
        <label>大总结累计小总结数<input type="number" data-setting="largeSummaryCount" value="${this.settings.largeSummaryCount}"></label>
      </article>
      <article class="maip-card span-2"><div class="maip-section-head"><div><h3>通用调度信号</h3><p>常驻优先由关键词规则和玩家焦点决定；这里仅控制提及、关联和活跃事件的原生召回参数。</p></div></div>
        <div class="maip-rule-table">${this.settings.activationRules.map((rule, index) => `<div class="maip-rule-row"><input type="checkbox" data-rule-index="${index}" data-rule-prop="enabled" ${rule.enabled ? 'checked' : ''}><b>${(0, util_1.escapeHtml)(rule.label)}</b><span>${(0, util_1.escapeHtml)(rule.match)}</span><code>${(0, util_1.escapeHtml)(JSON.stringify(rule.set))}</code></div>`).join('')}</div>
      </article>
    </section>`;
    }
    renderDiagnostics() {
        return `<section class="maip-two-col"><article class="maip-card"><h3>宿主能力</h3><pre class="maip-diagnostics">${(0, util_1.escapeHtml)(JSON.stringify(this.host.diagnostics(), null, 2))}</pre></article><article class="maip-card"><h3>运行状态</h3><pre class="maip-diagnostics">${(0, util_1.escapeHtml)(JSON.stringify({ status: this.status, migration: this.migrationPreview && { bookName: this.migrationPreview.bookName, total: this.migrationPreview.total, changed: this.migrationPreview.changed } }, null, 2))}</pre></article></section>`;
    }
    async onClick(event) {
        const target = event.target.closest('[data-action],[data-tab],[data-keyword]');
        if (!target)
            return;
        if (target.dataset.tab) {
            this.tab = target.dataset.tab;
            if (target.dataset.keyword !== undefined)
                this.selectedKeyword = target.dataset.keyword;
            this.render();
            return;
        }
        if (target.dataset.keyword !== undefined) {
            this.selectedKeyword = target.dataset.keyword;
            this.render();
            return;
        }
        const action = target.dataset.action;
        if (action === 'close') {
            this.close();
            return;
        }
        if (action === 'refresh') {
            await this.refreshEntries();
            return;
        }
        if (action === 'process')
            await this.run(() => this.tasks.processTurn(this.settings, false));
        if (action === 'extract')
            await this.run(() => this.tasks.runTask('extraction', this.settings));
        if (action === 'small')
            await this.run(() => this.tasks.runTask('smallSummary', this.settings));
        if (action === 'large')
            await this.run(() => this.tasks.runTask('largeSummary', this.settings));
        if (action === 'preview') {
            const raw = this.root?.querySelector('[data-input="raw-preview"]')?.value ?? '';
            await this.tasks.previewExtraction(this.settings, raw);
        }
        if (action === 'focus') {
            const title = String(target.dataset.title ?? '');
            const next = this.host.getFocusTitle() === title ? '' : title;
            await this.host.setFocusTitle(next);
            await this.worldbook.setFocus(this.settings, next);
            await this.refreshEntries();
        }
        if (action === 'save-entry')
            await this.saveEntry(String(target.dataset.uid ?? ''));
        if (action === 'reset-keywords') {
            const confirmed = globalThis.confirm?.('恢复完整默认关键词、小标题和选项？自定义关键词将被保留。') ?? true;
            if (confirmed) {
                const custom = this.settings.keywordDefinitions.filter((item) => !settings_1.DEFAULT_KEYWORDS.some((fallback) => fallback.label === item.label));
                this.settings.keywordDefinitions = [...structuredClone(settings_1.DEFAULT_KEYWORDS), ...custom];
                this.persistSettings();
            }
        }
        if (action === 'add-keyword') {
            this.settings.keywordDefinitions.push({ key: `custom_${Date.now()}`, label: '新关键词', description: '可稳定识别、会影响后续的信息类别。', aliases: [], enabled: true, constant: false, vectorized: true, preventRecursion: false, depth: 4, order: 400, fields: [{ key: 'fixed', label: '固定事实', policy: 'semantic-upsert' }] });
            this.persistSettings();
        }
        if (action === 'delete-keyword') {
            this.settings.keywordDefinitions.splice(Number(target.dataset.index), 1);
            this.persistSettings();
        }
        if (action === 'add-field') {
            this.settings.keywordDefinitions[Number(target.dataset.index)]?.fields.push({ key: `field_${Date.now()}`, label: '新小标题', policy: 'semantic-upsert' });
            this.persistSettings();
        }
        if (action === 'delete-field') {
            this.settings.keywordDefinitions[Number(target.dataset.keywordIndex)]?.fields.splice(Number(target.dataset.fieldIndex), 1);
            this.persistSettings();
        }
        if (action === 'migration-apply')
            await this.applyMigration();
        if (action === 'migration-undo')
            await this.undoMigration();
    }
    async onChange(event) {
        const target = event.target;
        if (target.dataset.setting) {
            const key = target.dataset.setting;
            const value = target.type === 'checkbox' ? target.checked : target.type === 'number' ? Number(target.value) : target.value;
            this.settings[key] = value;
            this.persistSettings(false);
        }
        if (target.dataset.keywordProp) {
            const definition = this.settings.keywordDefinitions[Number(target.dataset.index)];
            if (definition) {
                const prop = target.dataset.keywordProp;
                const value = target.type === 'checkbox' ? target.checked : target.type === 'number' ? Number(target.value) : target.value;
                if (prop === 'aliases')
                    definition.aliases = String(value).split('/').map((item) => item.trim()).filter(Boolean);
                else
                    definition[prop] = value;
                // Foundation is a default convention, but users may explicitly create other constant keywords.
                if (definition.label === '基础设定')
                    definition.constant = true;
            }
            this.persistSettings(false);
        }
        if (target.dataset.fieldProp) {
            const field = this.settings.keywordDefinitions[Number(target.dataset.keywordIndex)]?.fields[Number(target.dataset.fieldIndex)];
            if (field) {
                if (target.dataset.fieldProp === 'options')
                    field.options = target.value.split('/').map((value) => value.trim()).filter(Boolean);
                else
                    field[target.dataset.fieldProp] = target.value;
            }
            this.persistSettings(false);
        }
        if (target.dataset.ruleProp) {
            const rule = this.settings.activationRules[Number(target.dataset.ruleIndex)];
            if (rule && target.dataset.ruleProp === 'enabled')
                rule.enabled = target.checked;
            this.persistSettings(false);
        }
    }
    onInput(event) {
        const target = event.target;
        if (target.dataset.input === 'search') {
            this.search = target.value;
            this.render();
        }
    }
    async saveEntry(uid) {
        const entry = this.entries.find((candidate) => candidate.uid === uid);
        if (!entry || !this.root)
            return;
        const textareas = Array.from(this.root.querySelectorAll(`textarea[data-entry-uid="${cssEscape(uid)}"]`));
        const sections = structuredClone(entry.sections);
        for (const textarea of textareas) {
            const name = textarea.dataset.section ?? '';
            sections.values[name] = textarea.value.split('\n').map((line) => line.trim()).filter(Boolean);
            if (!sections.order.includes(name))
                sections.order.push(name);
        }
        const keywords = this.root.querySelector(`textarea[data-keywords-uid="${cssEscape(uid)}"]`)?.value.split('\n').map((line) => line.trim()).filter(Boolean) ?? entry.keywords;
        await this.worldbook.updateEntry(this.settings, uid, entry.title, (0, parser_1.serializeEntrySections)(sections), keywords);
        await this.refreshEntries();
    }
    async previewMigration() {
        this.migrationBusy = true;
        this.migrationMessage = '正在扫描旧世界书格式…';
        this.render();
        try {
            this.migrationPreview = await this.worldbook.previewMigration(this.settings);
            this.migrationMessage = `扫描完成：${this.migrationPreview.changed} 条需要转换`;
        }
        catch (error) {
            this.migrationMessage = error instanceof Error ? error.message : String(error);
        }
        finally {
            this.migrationBusy = false;
            this.render();
        }
    }
    async applyMigration() {
        this.migrationBusy = true;
        this.migrationMessage = '正在扫描旧世界书…';
        this.render();
        try {
            const preview = await this.worldbook.previewMigration(this.settings);
            this.migrationPreview = preview;
            if (!preview.changed) {
                this.migrationMessage = `无需转换：${preview.total} 条均已符合当前格式`;
                return;
            }
            const confirmed = globalThis.confirm?.(`检测到世界书“${preview.bookName}”中有 ${preview.changed} 条旧格式条目。

原 UID 和原生字段会保留；无法识别的正文进入【旧格式保留】。是否转换？`) ?? true;
            if (!confirmed) {
                this.migrationMessage = `已取消：检测到 ${preview.changed} 条可转换条目`;
                return;
            }
            this.migrationMessage = `正在转换 ${preview.changed} 条旧格式条目…`;
            this.render();
            const result = await this.worldbook.migrateLegacyFormat(this.settings, preview);
            this.entries = result.entries;
            this.migrationPreview = await this.worldbook.previewMigration(this.settings);
            this.migrationMessage = `转换完成：已处理 ${result.preview.changed} 条，可在刷新页面前撤销`;
        }
        catch (error) {
            this.migrationMessage = error instanceof Error ? error.message : String(error);
        }
        finally {
            this.migrationBusy = false;
            this.render();
        }
    }
    async undoMigration() {
        const confirmed = globalThis.confirm?.('撤销本次世界书格式转换并恢复页面内备份？') ?? true;
        if (!confirmed)
            return;
        this.migrationBusy = true;
        this.migrationMessage = '正在恢复转换前世界书…';
        this.render();
        try {
            this.entries = await this.worldbook.undoMigration(this.settings);
            this.migrationPreview = await this.worldbook.previewMigration(this.settings);
            this.migrationMessage = '已恢复转换前世界书';
        }
        catch (error) {
            this.migrationMessage = error instanceof Error ? error.message : String(error);
        }
        finally {
            this.migrationBusy = false;
            this.render();
        }
    }
    async run(action) {
        try {
            await action();
        }
        finally {
            await this.refreshEntries();
        }
    }
    persistSettings(render = true) {
        this.settingsStore.save(this.host.context(), this.settings);
        this.settings = this.settingsStore.load(this.host.context());
        if (render)
            this.render();
    }
    entryKeywords() {
        const counts = new Map();
        for (const entry of this.entries)
            for (const keyword of entry.keywords)
                counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
        return [...counts.keys()].sort((left, right) => (counts.get(right) ?? 0) - (counts.get(left) ?? 0) || left.localeCompare(right));
    }
    bookName() { return String(this.settings.targetLorebook || this.host.context().chatMetadata?.world_info || '未绑定'); }
}
exports.WorkspaceUi = WorkspaceUi;
function hasKeyword(entry, keyword) {
    const expected = (0, util_1.normalizeFact)(keyword);
    return entry.keywords.some((value) => (0, util_1.normalizeFact)(value) === expected);
}
function phaseLabel(phase) {
    return { idle: '空闲', reading: '读取', audit: '审核', extracting: '提取', matching: '匹配', worldbook: '写入', summary: '总结', complete: '完成', error: '错误' }[phase] ?? phase;
}
function operationLabel(kind) {
    return { 'create-entry': '创建', noop: '跳过', 'append-line': '追加', 'replace-line': '替换', 'replace-section': '整段替换', 'merge-titles': '关联', 'merge-keywords': '关键词', 'archive-entry': '归档', 'delete-entry': '删除' }[kind] ?? kind;
}
function policyOptions(selected) {
    const options = [['semantic-upsert', '事实匹配'], ['replace-by-anchor', '同槽替换'], ['append-chain', '链式追加'], ['replace-section', '整段替换'], ['merge-titles', '标题集合'], ['merge-keywords', '关键词集合']];
    return options.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}
function settingSwitch(key, label, checked) {
    return `<label class="maip-switch"><input type="checkbox" data-setting="${key}" ${checked ? 'checked' : ''}><span></span>${label}</label>`;
}
function cssEscape(value) { return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/["\\]/g, '\\$&'); }
function findSettingsHost() {
    const selectors = ['#extensions_settings2', '#extensions_settings', '.extensions_settings', '#rm_extensions_block', '#extensionsMenu'];
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element)
            return element;
    }
    return null;
}

},
"util":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clone = clone;
exports.hashText = hashText;
exports.errorText = errorText;
exports.isPlainObject = isPlainObject;
exports.normalizeStringArray = normalizeStringArray;
exports.unique = unique;
exports.clampNumber = clampNumber;
exports.normalizeTitle = normalizeTitle;
exports.splitTitle = splitTitle;
exports.normalizeFact = normalizeFact;
exports.bigrams = bigrams;
exports.diceSimilarity = diceSimilarity;
exports.safeId = safeId;
exports.truncate = truncate;
exports.escapeHtml = escapeHtml;
function clone(value) { return value === undefined ? value : structuredClone(value); }
function hashText(value) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}
function errorText(error) {
    if (error instanceof Error)
        return `${error.name}: ${error.message}`;
    try {
        return JSON.stringify(error);
    }
    catch {
        return String(error);
    }
}
function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function normalizeStringArray(value) {
    if (Array.isArray(value))
        return unique(value.map(String));
    if (typeof value === 'string')
        return unique(value.split(/[\n,，]/u));
    return [];
}
function unique(values) {
    return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}
function clampNumber(value, fallback, min, max) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(max, Math.max(min, Math.round(numeric))) : fallback;
}
function normalizeTitle(value) {
    return value
        .replace(/^\s*#{1,6}\s*/u, '')
        .replace(/[|丨]/gu, '｜')
        .replace(/\s*｜\s*/gu, '｜')
        .replace(/[：:]\s*(?=[^｜\n]+$)/u, '｜')
        .replace(/\s+/gu, ' ')
        .trim();
}
function splitTitle(value) {
    const normalized = normalizeTitle(value);
    const index = normalized.indexOf('｜');
    if (index <= 0 || index >= normalized.length - 1)
        return null;
    const type = normalized.slice(0, index).trim();
    const name = normalized.slice(index + 1).replace(/(?:｜|\s)[（(]?UID\s*[:：=]\s*[^）)\s]+[）)]?$/iu, '').trim();
    return type && name ? { type, name } : null;
}
function normalizeFact(value) {
    return value
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[“”‘’"'`]/gu, '')
        .replace(/[，,；;：:。.!！?？、\s]+/gu, '')
        .replace(/目前|当前|此时|现在/gu, '')
        .replace(/已经|已然/gu, '已')
        .replace(/坐落于|身处于|处在|处于|位在/gu, '位于')
        .replace(/取得|拿到|得到/gu, '获得')
        .replace(/拥有着|持有着/gu, '持有')
        .trim();
}
function bigrams(value) {
    const text = normalizeFact(value);
    if (text.length < 2)
        return text ? [text] : [];
    const result = [];
    for (let i = 0; i < text.length - 1; i += 1)
        result.push(text.slice(i, i + 2));
    return result;
}
function diceSimilarity(left, right) {
    const a = bigrams(left);
    const b = bigrams(right);
    if (!a.length && !b.length)
        return 1;
    if (!a.length || !b.length)
        return 0;
    const counts = new Map();
    for (const token of a)
        counts.set(token, (counts.get(token) ?? 0) + 1);
    let intersection = 0;
    for (const token of b) {
        const count = counts.get(token) ?? 0;
        if (count > 0) {
            intersection += 1;
            counts.set(token, count - 1);
        }
    }
    return (2 * intersection) / (a.length + b.length);
}
function safeId(value) {
    return String(value ?? '').trim().replace(/[^\p{L}\p{N}_:.-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 120);
}
function truncate(value, max) {
    return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}

},
"worldbook":function(module,exports,require){
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldbookAdapter = void 0;
exports.parseEntries = parseEntries;
exports.buildMigrationPreview = buildMigrationPreview;
const constants_1 = require("./constants");
const operations_1 = require("./operations");
const parser_1 = require("./parser");
const util_1 = require("./util");
class WorldbookAdapter {
    constructor(context) {
        this.context = context;
        this.apiPromise = null;
        this.migrationBackup = null;
    }
    async list(settings) {
        const { data } = await this.open(settings, false);
        return parseEntries(data);
    }
    async apply(settings, plan, sourceMessageKey, contextText, focusTitle) {
        const opened = await this.open(settings, true);
        const before = parseEntries(opened.data);
        const after = (0, operations_1.applyPlanToEntries)(plan, before);
        const byUid = new Map(before.map((entry) => [entry.uid, entry]));
        const touchedUids = new Set(plan.operations.filter((operation) => operation.kind !== 'noop' && operation.targetUid).map((operation) => String(operation.targetUid)));
        for (const entry of after) {
            if (entry.raw.__delete)
                continue;
            if (entry.uid.startsWith('new:')) {
                const created = this.createEntry(opened.api, opened.name, opened.data);
                hydrateRaw(created, entry, sourceMessageKey);
                entry.uid = String(created.uid);
                entry.raw = created;
            }
            else {
                if (!touchedUids.has(entry.uid))
                    continue;
                const original = byUid.get(entry.uid);
                if (!original)
                    continue;
                hydrateRaw(original.raw, entry, sourceMessageKey);
            }
        }
        // Save additions/replacements before deletion so sedimentation never drops the source first.
        this.applyActivationRules(parseEntries(opened.data), settings, contextText, focusTitle);
        await this.save(opened);
        const verifiedData = await opened.api.loadWorldInfo(opened.name);
        if (!verifiedData)
            throw new Error('世界书写入后回读失败');
        opened.data = verifiedData;
        const deletions = plan.operations.filter((operation) => operation.kind === 'delete-entry');
        if (deletions.length) {
            const protectedTitle = (0, util_1.normalizeTitle)(focusTitle);
            for (const operation of deletions) {
                const target = parseEntries(opened.data).find((entry) => entry.uid === operation.targetUid || entry.normalizedTitle === (0, util_1.normalizeTitle)(operation.title).toLocaleLowerCase());
                const protectedByKeyword = target?.keywords.some((keyword) => keywordMatchesDefinition(keyword, foundationDefinition(settings)));
                if (!target || target.locked || target.focus || protectedByKeyword || (0, util_1.normalizeTitle)(target.title) === protectedTitle)
                    continue;
                delete opened.data.entries[String(target.uid)];
            }
            await this.save(opened);
        }
        const finalData = await opened.api.loadWorldInfo(opened.name);
        if (!finalData)
            throw new Error('世界书最终回读失败');
        return parseEntries(finalData);
    }
    async updateEntry(settings, uid, title, content, keywords) {
        const opened = await this.open(settings, true);
        const raw = opened.data.entries?.[String(uid)];
        if (!raw)
            throw new Error(`世界书条目 UID ${uid} 不存在`);
        const normalizedTitle = (0, util_1.normalizeTitle)(title);
        if (!(0, util_1.splitTitle)(normalizedTitle))
            throw new Error('条目标题必须使用“类型｜稳定名称”');
        raw.comment = normalizedTitle;
        raw.content = String(content ?? '').trim();
        const split = (0, util_1.splitTitle)(normalizedTitle);
        raw.key = (0, util_1.unique)([split.type, split.name, ...keywords]);
        markManaged(raw, '', normalizedTitle);
        this.applyActivationRules(parseEntries(opened.data), settings, '', this.focusTitle());
        await this.save(opened);
        const verified = await opened.api.loadWorldInfo(opened.name);
        if (!verified)
            throw new Error('世界书编辑后回读失败');
        return parseEntries(verified);
    }
    /** Backward-compatible call used by older UI builds. */
    async updateEntryContent(settings, uid, title, content) {
        const existing = (await this.list(settings)).find((entry) => entry.uid === uid);
        return this.updateEntry(settings, uid, title, content, existing?.keywords ?? []);
    }
    async setFocus(settings, title) {
        const opened = await this.open(settings, true);
        const normalized = (0, util_1.normalizeTitle)(title);
        for (const entry of parseEntries(opened.data)) {
            const extension = markManaged(entry.raw, '', entry.title);
            extension.focus = Boolean(normalized && (0, util_1.normalizeTitle)(entry.title) === normalized);
        }
        this.applyActivationRules(parseEntries(opened.data), settings, '', normalized);
        await this.save(opened);
        const verified = await opened.api.loadWorldInfo(opened.name);
        if (!verified)
            throw new Error('焦点写入后回读失败');
        return parseEntries(verified);
    }
    async previewMigration(settings) {
        const opened = await this.open(settings, false);
        return buildMigrationPreview(opened.data, settings, opened.name);
    }
    async migrateLegacyFormat(settings, expected) {
        const opened = await this.open(settings, true);
        const preview = buildMigrationPreview(opened.data, settings, opened.name);
        if (expected && (expected.bookName !== preview.bookName || expected.total !== preview.total)) {
            throw new Error('世界书在预览后已经变化，请重新预览再转换');
        }
        if (!preview.changed)
            return { preview, entries: parseEntries(opened.data) };
        const backup = (0, util_1.clone)(opened.data.entries ?? {});
        this.migrationBackup = { bookName: opened.name, entries: backup, createdAt: Date.now() };
        try {
            for (const item of preview.items) {
                if (!item.changed)
                    continue;
                const raw = findRawEntry(opened.data, item.uid);
                if (!raw)
                    continue;
                raw.comment = item.newTitle;
                raw.content = item.newContent;
                raw.key = (0, util_1.unique)(item.newKeywords);
                markManaged(raw, '', item.newTitle).migratedFromLegacy = true;
            }
            this.applyActivationRules(parseEntries(opened.data), settings, '', this.focusTitle());
            await this.save(opened);
            const verified = await opened.api.loadWorldInfo(opened.name);
            if (!verified)
                throw new Error('旧世界书格式转换后回读失败');
            return { preview, entries: parseEntries(verified) };
        }
        catch (error) {
            opened.data.entries = backup;
            try {
                await this.save(opened);
            }
            catch (rollbackError) {
                console.error('[MirrorAbyss] migration rollback failed', rollbackError);
            }
            throw error;
        }
    }
    canUndoMigration() { return Boolean(this.migrationBackup); }
    async undoMigration(settings) {
        const backup = this.migrationBackup;
        if (!backup)
            throw new Error('当前页面没有可撤销的世界书格式转换');
        const opened = await this.open(settings, true);
        if (opened.name !== backup.bookName)
            throw new Error('当前绑定世界书与备份不一致');
        opened.data.entries = (0, util_1.clone)(backup.entries);
        await this.save(opened);
        const verified = await opened.api.loadWorldInfo(opened.name);
        if (!verified)
            throw new Error('撤销后回读失败');
        this.migrationBackup = null;
        return parseEntries(verified);
    }
    applyActivationRules(entries, settings, contextText, focusTitle) {
        const normalizedContext = (0, util_1.normalizeFact)(contextText);
        const currentScene = entries.find((entry) => entry.keywords.some((keyword) => ['场景', '时空'].some((label) => (0, util_1.normalizeFact)(keyword) === (0, util_1.normalizeFact)(label))) && /(当前场景|进行中|当前)/u.test(entry.content));
        for (const entry of entries) {
            const manualConstant = Boolean(entry.raw.constant && !entry.managed);
            const profiles = matchingKeywordDefinitions(entry, settings.keywordDefinitions);
            const profileBase = profiles.reduce((state, profile) => ({
                constant: state.constant || profile.constant,
                vectorized: profile.constant ? false : state.vectorized || profile.vectorized,
                preventRecursion: state.preventRecursion || profile.preventRecursion,
                depth: Math.min(state.depth, profile.depth),
                order: Math.max(state.order, profile.order),
                disabled: state.disabled,
            }), {
                constant: false,
                vectorized: false,
                preventRecursion: false,
                depth: 99,
                order: 0,
                disabled: Boolean(entry.raw.disable),
            });
            const base = {
                constant: manualConstant || profileBase.constant,
                vectorized: profiles.length ? (profileBase.constant ? false : profileBase.vectorized) : entry.raw.vectorized !== false,
                preventRecursion: profiles.length ? profileBase.preventRecursion : Boolean(entry.raw.preventRecursion),
                depth: profiles.length ? (profileBase.depth === 99 ? 4 : profileBase.depth) : Math.max(0, Number(entry.raw.depth) || 4),
                order: profiles.length ? (profileBase.order || 400) : (Number(entry.raw.order) || 400),
                disabled: Boolean(entry.raw.disable),
            };
            const mentioned = [entry.name, ...entry.keywords, ...entry.aliases]
                .map(util_1.normalizeFact)
                .filter((value) => value.length >= 2)
                .some((value) => normalizedContext.includes(value));
            const linkedCurrent = Boolean(currentScene && entry.references.some((reference) => (0, util_1.normalizeTitle)(reference) === (0, util_1.normalizeTitle)(currentScene.title)));
            const activeEvent = entry.keywords.some((keyword) => (0, util_1.normalizeFact)(keyword) === (0, util_1.normalizeFact)('事件')) && /(开始|进行中|持续中|活跃)/u.test(entry.content) && !/(结束|已结束|归档)/u.test(entry.content);
            const focus = Boolean(focusTitle && (0, util_1.normalizeTitle)(entry.title) === (0, util_1.normalizeTitle)(focusTitle)) || entry.focus;
            const state = { ...base };
            const matches = {
                focus,
                mentioned,
                'linked-current': linkedCurrent,
                'active-event': activeEvent,
                'structured-default': Boolean((0, util_1.splitTitle)(entry.title)),
            };
            const orderedRules = [...settings.activationRules].sort((left, right) => {
                const rank = (value) => value === 'structured-default' ? 0 : value === 'focus' ? 2 : 1;
                return rank(left.match) - rank(right.match);
            });
            for (const rule of orderedRules) {
                if (!rule.enabled)
                    continue;
                let hit = matches[rule.match] ?? false;
                if (rule.match === 'regex' && rule.pattern) {
                    try {
                        hit = new RegExp(rule.pattern, 'iu').test(`${entry.title}\n${entry.keywords.join(' ')}\n${entry.content}`);
                    }
                    catch {
                        hit = false;
                    }
                }
                if (!hit)
                    continue;
                // Generic rules may tune native recall, but constant remains controlled by focus,
                // manual user state, or keyword profiles such as 基础设定.
                const { constant: _ignored, ...rest } = rule.set;
                Object.assign(state, rest);
            }
            if (profiles.some((profile) => profile.constant)) {
                state.constant = true;
                state.vectorized = false;
            }
            if (focus) {
                state.constant = true;
                state.vectorized = false;
                state.depth = 1;
                state.order = Math.max(state.order, 920);
            }
            entry.raw.constant = state.constant;
            entry.raw.vectorized = state.vectorized;
            entry.raw.preventRecursion = state.preventRecursion;
            entry.raw.depth = state.depth;
            entry.raw.order = state.order;
            entry.raw.disable = state.disabled;
            const extension = markManaged(entry.raw, '', entry.title);
            extension.focus = focus;
            extension.activationReason = {
                keywordProfiles: profiles.map((profile) => profile.label),
                mentioned,
                linkedCurrent,
                activeEvent,
                updatedAt: Date.now(),
            };
        }
    }
    focusTitle() {
        const value = this.context().chatMetadata?.mirrorAbyssInfoPoint;
        return value && typeof value === 'object' ? String(value.focusTitle ?? '') : '';
    }
    async open(settings, create) {
        const api = await this.api();
        const context = this.context();
        const metadataKey = String(api.METADATA_KEY ?? 'world_info');
        let name = String(settings.targetLorebook || context.chatMetadata?.[metadataKey] || context.chatMetadata?.world_info || '').trim();
        if (!name && create && settings.autoCreateLorebook) {
            const display = (0, util_1.safeId)(context.name2 || context.name1 || 'Chat') || 'Chat';
            name = `MA_${display}`;
        }
        if (!name)
            throw new Error('未绑定目标世界书，请在设置中选择或填写名称');
        let data = await api.loadWorldInfo(name);
        if (!data && create) {
            if (typeof api.createNewWorldInfo !== 'function')
                throw new Error('SillyTavern 未提供 createNewWorldInfo');
            await api.createNewWorldInfo(name, { interactive: false });
            data = await api.loadWorldInfo(name);
        }
        if (!data)
            throw new Error(`世界书“${name}”不存在`);
        data.entries ?? (data.entries = {});
        if (context.chatMetadata?.[metadataKey] !== name) {
            context.chatMetadata ?? (context.chatMetadata = {});
            context.chatMetadata[metadataKey] = name;
            context.chatMetadata.world_info = name;
            if (typeof context.saveMetadata === 'function')
                await context.saveMetadata();
            else
                context.saveMetadataDebounced?.();
        }
        return { api, name, data };
    }
    createEntry(api, name, data) {
        if (typeof api.createWorldInfoEntry !== 'function')
            throw new Error('SillyTavern 未提供 createWorldInfoEntry');
        const entry = api.createWorldInfoEntry(name, data);
        if (!entry)
            throw new Error('世界书条目创建失败');
        return entry;
    }
    async save(opened) {
        if (typeof opened.api.saveWorldInfo !== 'function')
            throw new Error('SillyTavern 未提供 saveWorldInfo');
        await opened.api.saveWorldInfo(opened.name, opened.data, true);
        const context = this.context();
        await context.updateWorldInfoList?.();
        await context.reloadWorldInfoEditor?.(opened.name, false);
    }
    api() {
        if (globalThis.__MIRROR_ABYSS_WORLD_INFO_API__)
            return Promise.resolve(globalThis.__MIRROR_ABYSS_WORLD_INFO_API__);
        if (globalThis.__MIRROR_ABYSS_LOAD_WORLD_INFO_API__)
            return globalThis.__MIRROR_ABYSS_LOAD_WORLD_INFO_API__();
        const moduleUrl = '/scripts/world-info.js';
        this.apiPromise ?? (this.apiPromise = Promise.resolve(`${moduleUrl}`).then(s => __importStar(require(s))));
        return this.apiPromise;
    }
}
exports.WorldbookAdapter = WorldbookAdapter;
function parseEntries(data) {
    const output = [];
    for (const [mapUid, rawValue] of Object.entries(data?.entries ?? {})) {
        if (!rawValue || typeof rawValue !== 'object')
            continue;
        const raw = rawValue;
        const title = (0, util_1.normalizeTitle)(String(raw.comment ?? raw.name ?? raw.title ?? ''));
        const split = (0, util_1.splitTitle)(title);
        if (!split)
            continue;
        const content = String(raw.content ?? '');
        const sections = (0, parser_1.parseEntrySections)(content);
        const keywords = (0, util_1.normalizeStringArray)(raw.key);
        const aliases = (0, util_1.unique)([
            ...(0, parser_1.sectionLines)(content, ['别名', '称号', '其他名称']),
            ...keywords.filter((key) => (0, util_1.normalizeFact)(key) !== (0, util_1.normalizeFact)(split.name) && (0, util_1.normalizeFact)(key) !== (0, util_1.normalizeFact)(split.type)),
        ]);
        const extension = readExtension(raw);
        output.push({
            uid: String(raw.uid ?? mapUid),
            title,
            normalizedTitle: title.toLocaleLowerCase(),
            type: split.type,
            name: split.name,
            content,
            sections,
            keywords: (0, util_1.unique)([split.type, split.name, ...keywords]),
            aliases,
            references: (0, parser_1.extractReferences)(content),
            focus: extension.focus === true,
            locked: extension.locked === true || raw.locked === true,
            managed: extension.managed === true,
            activation: {
                constant: raw.constant === true,
                vectorized: raw.vectorized !== false,
                preventRecursion: raw.preventRecursion === true,
                depth: Math.max(0, Number(raw.depth) || 4),
                order: Number(raw.order) || 400,
                disabled: raw.disable === true,
            },
            raw,
        });
    }
    return output.sort((left, right) => left.title.localeCompare(right.title));
}
function buildMigrationPreview(data, settings, bookName = '') {
    const items = [];
    const seen = new Set();
    for (const [mapUid, rawValue] of Object.entries(data?.entries ?? {})) {
        if (!rawValue || typeof rawValue !== 'object')
            continue;
        const raw = rawValue;
        const uid = String(raw.uid ?? mapUid);
        const oldTitle = String(raw.comment ?? raw.name ?? raw.title ?? '').trim();
        const oldKeywords = (0, util_1.normalizeStringArray)(raw.key);
        const oldContent = String(raw.content ?? '').trim();
        const inferred = inferLegacyIdentity(oldTitle, oldKeywords, oldContent, settings.keywordDefinitions, uid);
        let newTitle = inferred.title;
        const key = (0, util_1.normalizeTitle)(newTitle).toLocaleLowerCase();
        if (seen.has(key)) {
            const split = (0, util_1.splitTitle)(newTitle);
            newTitle = `${split.type}｜${split.name}（${uid}）`;
            inferred.reasons.push('转换后标题与其他条目重复，保留 UID 后缀以避免误合并');
        }
        seen.add((0, util_1.normalizeTitle)(newTitle).toLocaleLowerCase());
        const newKeywords = (0, util_1.unique)([(0, util_1.splitTitle)(newTitle)?.type ?? '', (0, util_1.splitTitle)(newTitle)?.name ?? '', ...inferred.keywords]);
        const newContent = convertLegacyContent(oldContent, newKeywords);
        const changed = (0, util_1.normalizeTitle)(oldTitle) !== newTitle
            || (0, util_1.normalizeFact)(oldKeywords.join('|')) !== (0, util_1.normalizeFact)(newKeywords.join('|'))
            || oldContent.trim() !== newContent.trim()
            || readExtension(raw).version !== constants_1.MANAGED_VERSION;
        items.push({
            uid,
            oldTitle,
            newTitle,
            oldKeywords,
            newKeywords,
            oldContent,
            newContent,
            changed,
            reason: inferred.reasons.join('；') || (changed ? '补齐新格式元数据' : '已经符合当前格式'),
        });
    }
    return {
        bookName,
        total: items.length,
        changed: items.filter((item) => item.changed).length,
        alreadyCurrent: items.filter((item) => !item.changed).length,
        items,
        createdAt: Date.now(),
    };
}
function inferLegacyIdentity(oldTitle, oldKeywords, content, definitions, uid) {
    const reasons = [];
    const normalized = (0, util_1.normalizeTitle)(oldTitle);
    const existing = (0, util_1.splitTitle)(normalized);
    if (existing) {
        const profile = findDefinition(existing.type, definitions);
        const canonicalType = profile?.label ?? existing.type;
        if (canonicalType !== existing.type)
            reasons.push(`旧标题分类“${existing.type}”归一为关键词分类“${canonicalType}”`);
        return { title: `${canonicalType}｜${existing.name}`, keywords: (0, util_1.unique)([canonicalType, ...oldKeywords]), reasons };
    }
    const legacySplit = oldTitle.match(/^\s*([^：:｜|丨—-]{1,16})\s*[：:｜|丨—-]\s*(.+?)\s*$/u);
    if (legacySplit) {
        const profile = findDefinition(String(legacySplit[1]), definitions);
        if (profile) {
            reasons.push('旧标题中的分类前缀转换为结构化标题');
            return { title: `${profile.label}｜${legacySplit[2].trim()}`, keywords: (0, util_1.unique)([profile.label, ...oldKeywords]), reasons };
        }
    }
    const profile = inferDefinition(oldTitle, oldKeywords, content, definitions);
    const label = profile?.label ?? '自定义对象';
    const name = normalizeLegacyName(oldTitle) || `旧条目_${uid}`;
    reasons.push(profile ? `根据旧关键词或正文识别为“${label}”` : '无法可靠识别旧分类，归入“自定义对象”');
    return { title: `${label}｜${name}`, keywords: (0, util_1.unique)([label, ...oldKeywords]), reasons };
}
function inferDefinition(title, keywords, content, definitions) {
    for (const keyword of keywords) {
        const found = findDefinition(keyword, definitions);
        if (found)
            return found;
    }
    const haystack = `${title}\n${keywords.join(' ')}\n${content}`;
    const heuristic = [
        [/(世界设定|基础设定|规则|法则|物种规律|魔法体系|制度基础)/u, '基础设定'],
        [/(事件|任务进程|追逐|冲突|战争|仪式)/u, '事件'],
        [/(角色|人物|NPC|姓名|身份|性别|年龄)/iu, '人物'],
        [/(地点|地区|区域|城市|村庄|洞穴|房间)/u, '地点'],
        [/(物品|道具|装备|武器|持有者)/u, '物品'],
        [/(场景|当前场景)/u, '场景'],
        [/(时间|时空|日期|季节)/u, '时空'],
        [/(组织|阵营|机构|政权)/u, '组织'],
        [/(技能|能力|特性)/u, '能力'],
        [/(关系|好感|敌对|盟友)/u, '关系'],
        [/(契约|誓言|承诺|债务)/u, '契约'],
        [/(疾病|诅咒|伤势)/u, '状态影响'],
    ];
    for (const [pattern, label] of heuristic)
        if (pattern.test(haystack))
            return findDefinition(label, definitions);
    return null;
}
function convertLegacyContent(content, keywords) {
    const text = String(content ?? '').replace(/\r/g, '').trim();
    if (!text)
        return '';
    const parsed = (0, parser_1.parseEntrySections)(text);
    if (parsed.order.length)
        return (0, parser_1.serializeEntrySections)(parsed);
    const sections = {};
    let current = '';
    const knownSection = /^(对象定义|身份定义|固定事实|现行事实|当前状态|关系状态|能力状态|事件状态|事件进程|当前结果|近期经历|历史事实|关联条目|关键词|别名|规则定义|现行规则|持续影响|限制条件|持有关系|资源变化|旧格式保留)$/u;
    for (const sourceLine of text.split('\n')) {
        const line = sourceLine.trim();
        if (!line)
            continue;
        const heading = line.match(/^#{0,6}\s*([^：:]{1,20})\s*[：:]\s*(.*)$/u);
        if (heading && knownSection.test(heading[1].trim())) {
            current = heading[1].trim();
            sections[current] ?? (sections[current] = []);
            if (heading[2].trim())
                sections[current].push((0, parser_1.normalizePointLine)(heading[2]));
            continue;
        }
        if (!current)
            current = defaultLegacySection(keywords);
        sections[current] ?? (sections[current] = []);
        sections[current].push((0, parser_1.normalizePointLine)(line));
    }
    const order = Object.keys(sections);
    return (0, parser_1.serializeEntrySections)({ order, values: sections });
}
function defaultLegacySection(keywords) {
    if (hasKeyword(keywords, '基础设定'))
        return '规则定义';
    if (hasKeyword(keywords, '事件'))
        return '事件进程';
    if (hasKeyword(keywords, '场景') || hasKeyword(keywords, '时空'))
        return '当前状态';
    if (hasKeyword(keywords, '关系'))
        return '关系状态';
    return '旧格式保留';
}
function normalizeLegacyName(value) {
    return String(value ?? '')
        .replace(/^\s*(角色|人物|事件|场景|物品|地点|地区|基础设定|设定|规则|组织|能力|关系)\s*[：:｜|丨—-]\s*/u, '')
        .replace(/[【】<>]/gu, '')
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, 80);
}
function matchingKeywordDefinitions(entry, definitions) {
    return definitions.filter((definition) => definition.enabled && [entry.type, ...entry.keywords].some((keyword) => keywordMatchesDefinition(keyword, definition)));
}
function findDefinition(value, definitions) {
    return definitions.find((definition) => keywordMatchesDefinition(value, definition)) ?? null;
}
function keywordMatchesDefinition(value, definition) {
    if (!definition)
        return false;
    const normalized = (0, util_1.normalizeFact)(value);
    return [definition.label, ...definition.aliases].some((candidate) => (0, util_1.normalizeFact)(candidate) === normalized);
}
function foundationDefinition(settings) {
    return settings.keywordDefinitions.find((definition) => definition.label === '基础设定') ?? null;
}
function hasKeyword(keywords, expected) {
    return keywords.some((keyword) => (0, util_1.normalizeFact)(keyword) === (0, util_1.normalizeFact)(expected));
}
function findRawEntry(data, uid) {
    if (data.entries?.[String(uid)])
        return data.entries[String(uid)];
    for (const raw of Object.values(data.entries ?? {})) {
        if (raw && typeof raw === 'object' && String(raw.uid ?? '') === uid)
            return raw;
    }
    return null;
}
function hydrateRaw(raw, entry, sourceMessageKey) {
    raw.comment = entry.title;
    raw.content = (0, parser_1.serializeEntrySections)(entry.sections);
    raw.key = (0, util_1.unique)(entry.keywords);
    raw.keysecondary ?? (raw.keysecondary = []);
    raw.constant = entry.activation.constant;
    raw.vectorized = entry.activation.vectorized;
    raw.preventRecursion = entry.activation.preventRecursion;
    raw.depth = entry.activation.depth;
    raw.order = entry.activation.order;
    raw.disable = entry.activation.disabled;
    raw.selective ?? (raw.selective = false);
    raw.position ?? (raw.position = 0);
    raw.useProbability ?? (raw.useProbability = true);
    raw.probability ?? (raw.probability = 100);
    const extension = markManaged(raw, sourceMessageKey, entry.title);
    extension.locked = entry.locked;
    extension.focus = entry.focus;
}
function markManaged(raw, sourceMessageKey, title) {
    const extensions = (raw.extensions ?? (raw.extensions = {}));
    const current = extensions[constants_1.WORLD_INFO_EXTENSION_KEY];
    const extension = current && typeof current === 'object' ? current : {};
    extensions[constants_1.WORLD_INFO_EXTENSION_KEY] = {
        ...extension,
        managed: true,
        version: constants_1.MANAGED_VERSION,
        title,
        ...(sourceMessageKey ? { sourceMessageKey } : {}),
        updatedAt: Date.now(),
    };
    return extensions[constants_1.WORLD_INFO_EXTENSION_KEY];
}
function readExtension(raw) {
    const value = raw.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY];
    return value && typeof value === 'object' ? value : {};
}

}};
var MA_CACHE=Object.create(null);
function maResolve(from,spec){if(!spec.startsWith('.'))return spec;var base=from.split('/');base.pop();for(var part of spec.split('/')){if(!part||part==='.')continue;if(part==='..')base.pop();else base.push(part)}return base.join('/')}
function maRequire(id){if(MA_CACHE[id])return MA_CACHE[id].exports;var factory=MA_MODULES[id];if(!factory)throw new Error('内部模块不存在：'+id);var module={exports:{}};MA_CACHE[id]=module;factory(module,module.exports,function(spec){return maRequire(maResolve(id,spec))});return module.exports}
var MA_ENTRY=maRequire('index');
export const onActivate=()=>MA_ENTRY.onActivate();
export const onEnable=()=>MA_ENTRY.onEnable();
export const onDisable=()=>MA_ENTRY.onDisable();
export const onDelete=()=>MA_ENTRY.onDelete();
export const onInstall=()=>MA_ENTRY.onInstall();
export const onUpdate=()=>MA_ENTRY.onUpdate();
export const onClean=()=>MA_ENTRY.onClean();
export const __testRequire=maRequire;
