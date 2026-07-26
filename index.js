/** Mirror Abyss 2.0.0-core.1 no-UI core build. */
var MA_MODULES={"application":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MirrorAbyssApplication = void 0;
const host_1 = require("./host");
const settings_1 = require("./settings");
const audit_1 = require("./audit");
const memory_1 = require("./memory");
const worldbook_1 = require("./worldbook");
const util_1 = require("./util");
class MirrorAbyssApplication {
    constructor() {
        this.host = new host_1.HostAdapter();
        this.settingsStore = new settings_1.SettingsStore();
        this.worldbook = new worldbook_1.WorldbookAdapter(() => this.host.context(), () => this.host.chatKey());
        this.auditRunner = new audit_1.AuditRunner(this.host);
        this.memoryRunner = new memory_1.MemoryRunner(this.host, this.worldbook);
        this.cleanup = [];
        this.runningByChat = new Map();
        this.started = false;
    }
    start() {
        if (this.started) return;
        this.host.context();
        this.listen('MESSAGE_RECEIVED', (value) => void this.onMessage(Number(value)));
        this.started = true;
    }
    stop() {
        if (!this.started) return;
        this.started = false;
        this.cleanup.splice(0).forEach((remove) => { try { remove(); } catch (error) { console.warn('[MirrorAbyss] listener cleanup failed', error); } });
        this.runningByChat.clear();
    }
    isStarted() { return this.started; }
    settings() { return this.settingsStore.load(this.host.context()); }
    configure(patch) { return this.settingsStore.save(this.host.context(), patch); }
    audit() { return this.auditRunner.process(this.settings(), false); }
    extract() { return this.memoryRunner.runTask('extraction', this.settings()); }
    smallSummary() { return this.memoryRunner.runTask('smallSummary', this.settings()); }
    largeSummary() { return this.memoryRunner.runTask('largeSummary', this.settings()); }
    processLatest() { return this.enqueue(undefined, false); }
    status() { return { audit: this.auditRunner.currentStatus(), memory: this.memoryRunner.currentStatus() }; }
    listen(eventName, handler) {
        try { this.cleanup.push(this.host.subscribe(eventName, handler, false)); }
        catch (error) { console.warn(`[MirrorAbyss] 宿主事件 ${eventName} 不可用`, error); }
    }
    async onMessage(index) {
        if (!Number.isInteger(index) || !this.host.isAssistantIndex(index)) return;
        const settings = this.settings();
        if (!settings.enabled || !settings.autoProcess) return;
        try { await this.enqueue(index, true); }
        catch (error) { console.error('[MirrorAbyss] automatic core flow failed', error); }
    }
    enqueue(index, automatic) {
        const turn = this.host.latestTurn(index);
        const previous = this.runningByChat.get(turn.chatKey) ?? Promise.resolve();
        const task = previous.catch(() => undefined).then(() => this.runCore(index, automatic));
        this.runningByChat.set(turn.chatKey, task);
        return task.finally(() => { if (this.runningByChat.get(turn.chatKey) === task) this.runningByChat.delete(turn.chatKey); });
    }
    async runCore(index, automatic) {
        const settings = this.settings();
        try {
            if (settings.auditEnabled && settings.auditPrompt.trim()) await this.auditRunner.process(settings, automatic, index);
            const result = await this.memoryRunner.processTurn(settings, automatic, index);
            notify('success', '镜渊：本轮处理完成');
            return result;
        } catch (error) {
            notify('error', `镜渊：${(0, util_1.errorText)(error)}`);
            throw error;
        }
    }
}
exports.MirrorAbyssApplication = MirrorAbyssApplication;
function notify(kind, message) {
    const toast = globalThis.toastr?.[kind];
    if (typeof toast === 'function') toast(message);
    else console[kind === 'error' ? 'error' : 'info'](`[MirrorAbyss] ${message}`);
}
},
"audit":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditRunner = void 0;
const constants_1 = require("./constants");
const prompts_1 = require("./prompts");
const util_1 = require("./util");
class AuditRunner {
    constructor(host) {
        this.host = host;
        this.status = { phase: 'idle', detail: '等待审核', error: '' };
        this.runningByChat = new Map();
    }
    currentStatus() { return structuredClone(this.status); }
    process(settings, automatic = false, requestedIndex) {
        const turn = this.host.latestTurn(requestedIndex);
        const previous = this.runningByChat.get(turn.chatKey) ?? Promise.resolve();
        const task = previous.catch(() => undefined).then(() => this.processInternal(settings, automatic, requestedIndex));
        this.runningByChat.set(turn.chatKey, task);
        return task.finally(() => { if (this.runningByChat.get(turn.chatKey) === task) this.runningByChat.delete(turn.chatKey); });
    }
    async processInternal(settings, automatic, requestedIndex) {
        const turn = this.host.latestTurn(requestedIndex);
        const cursor = this.host.cursor();
        if (automatic && cursor.lastProcessedMessageKey === turn.messageKey && cursor.lastProcessedHash === turn.contentHash) {
            this.status = { phase: 'complete', detail: '正文已经完整处理，跳过重复审核', error: '' };
            return turn;
        }
        if (!settings.auditEnabled || !settings.auditPrompt.trim()) {
            this.status = { phase: 'complete', detail: '审核未启用', error: '' };
            return turn;
        }
        try {
            this.status = { phase: 'audit', detail: '审核正文', error: '' };
            const prompt = (0, prompts_1.auditPrompts)(settings, turn.playerText, turn.assistantText);
            const raw = await this.host.generate(prompt.system, trimPrompt(prompt.user), settings.responseTokens, turn.chatKey, settings.requestTimeoutMs, profileId(settings));
            const decision = clean(raw);
            if (/^通过[。.]?$/u.test(decision)) {
                this.status = { phase: 'complete', detail: '审核通过', error: '' };
                return turn;
            }
            if (!/^需要修正(?:\s|$)/u.test(decision)) throw new Error('审核返回既不是“通过”，也不是“需要修正”');
            this.status = { phase: 'revision', detail: '生成一次完整修正版', error: '' };
            const revisionPrompt = (0, prompts_1.revisionPrompts)(settings, turn.playerText, turn.assistantText, decision);
            const revisionRaw = await this.host.generate(revisionPrompt.system, trimPrompt(revisionPrompt.user), settings.responseTokens, turn.chatKey, settings.requestTimeoutMs, profileId(settings));
            const revised = parseRevision(revisionRaw);
            if (!revised) throw new Error('修正模型没有返回完整正文');
            if (revised === turn.assistantText) {
                this.status = { phase: 'complete', detail: '修正文与原文相同，正文未替换', error: '' };
                return turn;
            }
            const updated = await this.host.replaceAssistantText(turn, revised);
            this.status = { phase: 'complete', detail: '正文已修正', error: '' };
            return updated;
        } catch (error) {
            this.status = { phase: 'error', detail: '审核停止', error: (0, util_1.errorText)(error) };
            throw error;
        }
    }
}
exports.AuditRunner = AuditRunner;
function profileId(settings) { return settings.modelSource === 'profile' ? settings.modelProfileId : ''; }
function trimPrompt(value) { return value.length <= constants_1.MAX_CONTEXT_CHARS ? value : `${value.slice(0, constants_1.MAX_CONTEXT_CHARS)}\n[已按字符上限截断]`; }
function clean(value) {
    return String(value ?? '').replace(/^```(?:text|markdown)?\s*/iu, '').replace(/\s*```$/u, '').trim();
}
function parseRevision(value) {
    let text = clean(value);
    text = text.replace(/^\s*(?:完整修正版|修正版|修正文)\s*[：:]?\s*/u, '');
    text = text.replace(/^\s*【正文】\s*/u, '');
    return text.trim();
}
},
"constants":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGED_VERSION = exports.MAX_CONTEXT_CHARS = exports.WORLD_INFO_EXTENSION_KEY = exports.EXTENSION_NAMESPACE = exports.DISPLAY_NAME = exports.VERSION = void 0;
exports.VERSION = '2.0.0-core.1';
exports.DISPLAY_NAME = 'Mirror Abyss｜镜渊 Core';
exports.EXTENSION_NAMESPACE = 'mirrorAbyssInfoPoint';
exports.WORLD_INFO_EXTENSION_KEY = 'mirrorAbyssInfoPoint';
exports.MAX_CONTEXT_CHARS = 48000;
exports.MANAGED_VERSION = 4;
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
    async generate(systemPrompt, prompt, responseLength, chatKey, timeoutMs, profileId = '') {
        const run = async () => {
            if (this.chatKey() !== chatKey)
                throw new Error('聊天已经切换，本次模型调用作废');
            const context = this.context();
            const startedAt = Date.now();
            let raw;
            if (profileId) {
                const service = context.ConnectionManagerRequestService;
                if (!service)
                    throw new Error('SillyTavern Connection Profiles 服务不可用，请启用 Connection Manager 或改用当前连接');
                const result = await withTimeout(service.sendRequest(profileId, [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt },
                ], responseLength, { stream: false, extractData: true, includePreset: true }), timeoutMs);
                raw = typeof result === 'string' ? result : result?.content;
            }
            else {
                const generateRaw = context.generateRaw;
                if (typeof generateRaw !== 'function')
                    throw new Error('当前 SillyTavern 未提供 generateRaw');
                raw = await withTimeout(generateRaw({ systemPrompt, prompt, responseLength }), timeoutMs);
            }
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
    connectionProfilesAvailable() {
        const context = this.context();
        return Boolean(context.ConnectionManagerRequestService)
            && !context.extensionSettings?.disabledExtensions?.includes?.('connection-manager');
    }
    profileName(profileId) {
        if (!profileId)
            return '当前连接';
        try {
            return this.context().ConnectionManagerRequestService?.getProfile(profileId)?.name || profileId;
        }
        catch {
            return profileId;
        }
    }
    bindProfileDropdown(selector, selectedId, onChange) {
        const service = this.context().ConnectionManagerRequestService;
        if (!service?.handleDropdown)
            return false;
        service.handleDropdown(selector, selectedId, (profile) => onChange(profile?.id || ''), undefined, undefined, (profile) => { if (profile?.id === selectedId)
            onChange(''); });
        return true;
    }
    async testProfile(profileId) {
        if (!profileId)
            throw new Error('请先选择 Connection Profile');
        const service = this.context().ConnectionManagerRequestService;
        if (!service)
            throw new Error('ConnectionManagerRequestService 不可用');
        const result = await service.sendRequest(profileId, [{ role: 'user', content: '只回复：MIRROR_ABYSS_PROFILE_OK' }], 32, { stream: false, extractData: true });
        const text = (typeof result === 'string' ? result : result?.content || '').trim();
        if (!text)
            throw new Error('Connection Profile 返回为空');
        return text;
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
            connectionProfiles: Boolean(context.ConnectionManagerRequestService),
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


function withTimeout(promise, timeoutMs) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = globalThis.setTimeout(() => reject(new Error(`模型调用超时（${timeoutMs}ms）`)), timeoutMs); });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => globalThis.clearTimeout(timer));
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
let extensionEnabled = true;
let initializing = false;
let retryTimer;
function contextReady() { try { return Boolean(globalThis.SillyTavern?.getContext?.()); } catch { return false; } }
async function requireApplication() {
    if (!extensionEnabled) throw new Error('镜渊插件当前已禁用');
    await initialize();
    if (!application?.isStarted()) throw new Error('镜渊尚未完成启动');
    return application;
}
function exposeApi() {
    globalThis.MirrorAbyss = {
        version: constants_1.VERSION,
        processLatest: async () => (await requireApplication()).processLatest(),
        audit: async () => (await requireApplication()).audit(),
        extract: async () => (await requireApplication()).extract(),
        smallSummary: async () => (await requireApplication()).smallSummary(),
        largeSummary: async () => (await requireApplication()).largeSummary(),
        getSettings: async () => (await requireApplication()).settings(),
        configure: async (patch) => (await requireApplication()).configure(patch),
        status: async () => (await requireApplication()).status(),
        restart: async () => { shutdown(false); extensionEnabled = true; await initialize(); },
    };
}
async function initialize() {
    if (!extensionEnabled || initializing || application?.isStarted()) return;
    if (!contextReady()) { scheduleRetry(); return; }
    initializing = true;
    exposeApi();
    try { application ?? (application = new application_1.MirrorAbyssApplication()); application.start(); console.info(`[MirrorAbyss] ${constants_1.VERSION} ready`); }
    catch (error) { console.error('[MirrorAbyss] initialization failed', error); globalThis.toastr?.error?.(`镜渊启动失败：${error instanceof Error ? error.message : String(error)}`); }
    finally { initializing = false; }
}
function scheduleRetry() {
    if (retryTimer !== undefined || !extensionEnabled) return;
    retryTimer = globalThis.setTimeout(() => { retryTimer = undefined; void initialize(); }, 250);
}
function shutdown(removeApi = true) {
    if (retryTimer !== undefined) globalThis.clearTimeout(retryTimer);
    retryTimer = undefined;
    application?.stop();
    if (removeApi) delete globalThis.MirrorAbyss;
}
function onActivate() { extensionEnabled = true; exposeApi(); void initialize(); }
function onEnable() { extensionEnabled = true; exposeApi(); void initialize(); }
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
"memory":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryRunner = void 0;
const constants_1 = require("./constants");
const matcher_1 = require("./matcher");
const operations_1 = require("./operations");
const parser_1 = require("./parser");
const prompts_1 = require("./prompts");
const util_1 = require("./util");
class MemoryRunner {
    constructor(host, worldbook) {
        this.host = host;
        this.worldbook = worldbook;
        this.status = { phase: 'idle', detail: '等待处理', error: '', rawResult: '', plan: null };
        this.runningByChat = new Map();
    }
    currentStatus() { return structuredClone(this.status); }
    processTurn(settings, automatic = false, requestedIndex) {
        const turn = this.host.latestTurn(requestedIndex);
        const previous = this.runningByChat.get(turn.chatKey) ?? Promise.resolve();
        const task = previous.catch(() => undefined).then(() => this.processTurnInternal(settings, automatic, requestedIndex));
        this.runningByChat.set(turn.chatKey, task);
        return task.finally(() => { if (this.runningByChat.get(turn.chatKey) === task) this.runningByChat.delete(turn.chatKey); });
    }
    async runTask(kind, settings) {
        const turn = this.host.latestTurn();
        if (kind === 'extraction') {
            const result = await this.extract(settings, turn);
            this.setStatus('complete', '提取完成');
            return result;
        }
        if (kind === 'smallSummary') {
            const result = await this.summarize('small', settings, turn);
            const cursor = this.host.cursor();
            cursor.turnsSinceSmall = 0;
            cursor.smallCountSinceLarge += 1;
            await this.assertChat(turn.chatKey);
            await this.host.saveCursor(cursor);
            this.setStatus('complete', '小总结完成');
            return result;
        }
        const result = await this.summarize('large', settings, turn);
        const cursor = this.host.cursor();
        cursor.smallCountSinceLarge = 0;
        await this.assertChat(turn.chatKey);
        await this.host.saveCursor(cursor);
        this.setStatus('complete', '大总结完成');
        return result;
    }
    async processTurnInternal(settings, automatic, requestedIndex) {
        const turn = this.host.latestTurn(requestedIndex);
        const cursor = this.host.cursor();
        if (automatic && cursor.lastProcessedMessageKey === turn.messageKey && cursor.lastProcessedHash === turn.contentHash) {
            this.setStatus('complete', '该正文已经处理，跳过重复事件');
            return [];
        }
        try {
            this.setStatus('reading', '读取最终正文与相关世界书条目');
            await this.extract(settings, turn);
            const nextCursor = { ...cursor, turnsSinceSmall: cursor.turnsSinceSmall + 1 };
            if (nextCursor.turnsSinceSmall >= settings.smallSummaryTurns) {
                await this.summarize('small', settings, turn, '当前事件线');
                nextCursor.turnsSinceSmall = 0;
                nextCursor.smallCountSinceLarge += 1;
                if (nextCursor.smallCountSinceLarge >= settings.largeSummaryCount) {
                    await this.summarize('large', settings, turn, '跨场景长期连续性');
                    nextCursor.smallCountSinceLarge = 0;
                }
            }
            await this.assertChat(turn.chatKey);
            nextCursor.lastProcessedMessageKey = turn.messageKey;
            nextCursor.lastProcessedHash = turn.contentHash;
            await this.host.saveCursor(nextCursor);
            this.setStatus('complete', '提取与总结调度完成');
            return [];
        } catch (error) {
            this.setStatus('error', '当前步骤失败，后续步骤已停止', (0, util_1.errorText)(error));
            throw error;
        }
    }
    async extract(settings, turn) {
        this.setStatus('extracting', '提取事实与状态');
        const entries = await this.worldbook.list(settings);
        await this.assertChat(turn.chatKey);
        const selected = (0, matcher_1.relevantEntries)(entries, `${turn.playerText}\n${turn.assistantText}`);
        const prompt = (0, prompts_1.extractionPrompts)(settings, turn.playerText, turn.assistantText, selected);
        const raw = await this.host.generate(prompt.system, trimPrompt(prompt.user), settings.responseTokens, turn.chatKey, settings.requestTimeoutMs, profileId(settings));
        this.status.rawResult = raw;
        const blocks = (0, parser_1.parseInformationPoints)(raw);
        if (!blocks.length) {
            this.setStatus('matching', '本轮无可写入信息', '', raw, { blocks: [], operations: [], createdAt: Date.now() });
            return entries;
        }
        this.setStatus('matching', '匹配条目并去重');
        const plan = (0, operations_1.buildOperationPlan)(blocks, entries, settings, `${turn.playerText}\n${turn.assistantText}`);
        return this.apply(settings, plan, turn, `${turn.playerText}\n${turn.assistantText}`, '提取');
    }
    async summarize(kind, settings, turn, subject = '') {
        const label = kind === 'small' ? '小总结' : '大总结';
        this.setStatus(kind === 'small' ? 'small-summary' : 'large-summary', label);
        const entries = await this.worldbook.list(settings);
        await this.assertChat(turn.chatKey);
        const selected = kind === 'small'
            ? entries.filter((entry) => entry.focus || /(事件|场景|时空|人物|物品|地点)/u.test(`${entry.type}\n${entry.keywords.join(' ')}`)).slice(-50)
            : entries.filter((entry) => /(小总结|大总结|固定事实|历史事实|事件|关系|组织|契约|基础设定)/u.test(`${entry.type}\n${entry.keywords.join(' ')}\n${entry.content}`)).slice(-80);
        const recent = kind === 'small' ? recentConversation(this.host, turn.messageIndex, Math.max(8, settings.smallSummaryTurns * 2 + 2)) : '';
        const prompt = (0, prompts_1.summaryPrompts)(kind, settings, selected, subject, recent);
        const raw = await this.host.generate(prompt.system, trimPrompt(prompt.user), settings.responseTokens, turn.chatKey, settings.requestTimeoutMs, profileId(settings));
        this.status.rawResult = raw;
        const blocks = (0, parser_1.parseInformationPoints)(raw);
        if (!blocks.length) {
            this.setStatus(kind === 'small' ? 'small-summary' : 'large-summary', `${label}无更新`, '', raw, { blocks: [], operations: [], createdAt: Date.now() });
            return entries;
        }
        const plan = (0, operations_1.buildOperationPlan)(blocks, entries, settings, selected.map((entry) => `${entry.title}\n${entry.content}`).join('\n'));
        return this.apply(settings, plan, turn, recent || `${turn.playerText}\n${turn.assistantText}`, label);
    }
    async apply(settings, plan, turn, contextText, label) {
        this.status.plan = plan;
        if (!plan.operations.some((operation) => operation.kind !== 'noop')) return [];
        this.setStatus('worldbook', `${label}写入世界书`, '', this.status.rawResult, plan);
        await this.assertChat(turn.chatKey);
        return this.worldbook.apply(settings, plan, turn.messageKey, contextText, this.host.getFocusTitle(), turn.chatKey);
    }
    async assertChat(expected) {
        if (this.host.chatKey() !== expected) throw new Error('聊天已经切换，本次结果作废');
    }
    setStatus(phase, detail, error = '', rawResult = this.status.rawResult, plan = this.status.plan) {
        this.status = { phase, detail, error, rawResult, plan };
    }
}
exports.MemoryRunner = MemoryRunner;
function profileId(settings) { return settings.modelSource === 'profile' ? settings.modelProfileId : ''; }
function trimPrompt(value) { return value.length <= constants_1.MAX_CONTEXT_CHARS ? value : `${value.slice(0, constants_1.MAX_CONTEXT_CHARS)}\n[已按字符上限截断]`; }
function recentConversation(host, messageIndex, maxMessages) {
    const chat = host.context().chat ?? [];
    const start = Math.max(0, messageIndex - maxMessages + 1);
    return chat.slice(start, messageIndex + 1).map((message) => {
        const role = message?.is_user === true || message?.isUser === true ? '玩家' : 'AI';
        return `${role}：${String(message?.mes ?? '').trim()}`;
    }).filter((line) => !/：\s*$/u.test(line)).join('\n\n');
}
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
exports.canonicalSectionName = canonicalSectionName;
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
const SECTION_ALIASES = {
    '固定事实': '固定事实',
    '身份定义': '固定事实',
    '对象定义': '固定事实',
    '规则定义': '固定事实',
    '能力定义': '固定事实',
    '关系定义': '固定事实',
    '契约定义': '固定事实',
    '影响定义': '固定事实',
    '现行事实': '当前状态',
    '状态': '当前状态',
    '事件状态': '当前状态',
    '历史事实': '变化记录',
    '核心变化': '变化记录',
    '资源变化': '变化记录',
    '关系变化': '变化记录',
    '关系状态': '当前状态',
    '当前结果': '最终结果',
    '结束结论': '最终结果',
};
function canonicalSectionName(value) {
    const name = String(value ?? '').replace(/\s+/gu, '').trim();
    return SECTION_ALIASES[name] ?? String(value ?? '').trim();
}
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
            section = { name: canonicalSectionName(sectionMatch[1]), lines: [], empty: false };
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
        const mergedSections = new Map();
        for (const candidate of item.sections) {
            const name = canonicalSectionName(candidate.name);
            const current = mergedSections.get(name) ?? { name, lines: [], empty: true };
            current.lines = (0, util_1.unique)([...current.lines, ...candidate.lines]);
            current.empty = current.lines.length === 0 && (current.empty || candidate.empty);
            mergedSections.set(name, current);
        }
        item.sections = [...mergedSections.values()].filter((candidate) => candidate.name);
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
            current = canonicalSectionName(match[1]);
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
    for (const name of Object.keys(values))
        values[name] = (0, util_1.unique)(values[name] ?? []);
    return { order: (0, util_1.unique)(order), values };
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
exports.revisionPrompts = revisionPrompts;
exports.summaryPrompts = summaryPrompts;
exports.keywordTemplate = keywordTemplate;
const util_1 = require("./util");
function auditPrompts(settings, playerText, assistantText) {
    const system = `你是“镜渊”的正文审核器。你只判断待审核正文是否违反玩家硬规则，不续写、不润色、不修正文。

只允许返回以下两种格式之一：

通过

或：
需要修正
【违反规则】
- 具体违反的规则

要求：
1. 只依据玩家硬规则和待审核正文判断。
2. 不把偏好当硬规则，不扩大规则含义。
3. 不输出修正版正文，不输出分析过程、JSON或代码块。`;
    const user = `【玩家硬规则】\n${settings.auditPrompt || '（无）'}\n\n【玩家输入】\n${playerText || '（空）'}\n\n【待审核正文】\n${assistantText}`;
    return { system, user };
}
function revisionPrompts(settings, playerText, assistantText, auditResult) {
    const system = `你是“镜渊”的正文修正器。只根据审核结果修正明确违规处。

固定输出格式：
【正文】
完整修正版正文

要求：
1. 必须返回完整正文，不返回局部补丁。
2. 保留原有时间、地点、事件顺序、NPC已发生行为、物品状态和外部结果。
3. 不增加新事件，不扩写，不解释，不输出JSON或代码块。
4. 只做满足玩家硬规则所需的最小修改。`;
    const user = `【玩家硬规则】\n${settings.auditPrompt || '（无）'}\n\n【玩家输入】\n${playerText || '（空）'}\n\n【审核结果】\n${auditResult}\n\n【原正文】\n${assistantText}`;
    return { system, user };
}
function extractionPrompts(settings, playerText, assistantText, relevant) {
    const template = keywordTemplate(settings.keywordDefinitions);
    const existing = relevant.map(entryForPrompt).join('\n\n');
    const custom = settings.extractionPrompt.trim();
    const system = `你是“镜渊”的事实与状态提取器。你不管理数据库，也不决定世界书常驻、向量、递归、深度、顺序或概率。

固定输出语法：
类型｜稳定名称
【关键词】
- 关键词
【小标题】
- 一条明确事实

本轮没有任何值得写入世界书的信息时，只返回：
无

规则：
1. 只提取最终可见正文中已经明确形成、会影响后续叙事的事实。
2. 已有对象沿用提供的稳定标题；不得随意改名。
3. 每行只表达一个主体的一项事实、状态、动作、关系或直接结果。
4. 当前状态写最新值；不要重复旧当前位置、旧持有者或旧阶段。
5. 普通动作、瞬时表情、气氛、修辞、服装细节和无后续影响的背景信息不记录。
6. 不得补全未发生内容，不得把计划、可能、推测或角色不知道的信息升级为事实。
7. 已有内容已经表达或只是近义改写时填写“无”。
8. 默认关键词不是白名单；必要时可以使用准确的新关键词。
9. 除结果外不输出解释、前言、结语、JSON、代码块或思考过程。

默认关键词及建议小标题：
${template}${custom ? `\n\n【玩家附加提取要求】\n${custom}` : ''}`;
    const user = `【当前世界书中的直接相关条目】\n${existing || '（无）'}\n\n【玩家本轮输入】\n${playerText || '（空）'}\n\n【本轮最终可见正文】\n${assistantText}\n\n请直接填写；没有核心变化时只返回“无”。`;
    return { system, user };
}
function summaryPrompts(kind, settings, entries, subject, recentConversation = '') {
    const isSmall = kind === 'small';
    const custom = (isSmall ? settings.smallSummaryPrompt : settings.largeSummaryPrompt).trim();
    const system = `你是“镜渊”的${isSmall ? '小总结器' : '大总结器'}。只整理已经明确存在的叙事事实。

输出仍使用：类型｜名称＋【关键词】＋【小标题】＋事实行。没有更新只返回“无”。

要求：
1. ${isSmall ? '回答“继续当前事件线必须知道什么”，保留当前场景、参与者、关键行动、直接后果、客观存在的未解决问题及必须连续的状态。' : '回答“跨场景继续叙事仍必须知道什么”，保留长期关系、永久后果、长期目标立场、重要资源、组织制度变化、契约承诺和世界规则变化。'}
2. ${isSmall ? '不得只是压缩全文。' : '不得把小总结简单缩短。'}
3. 删除重复和被后续事实覆盖的过程，但不得删除仍有约束力的因果。
4. 临时条目影响完成分发后，可填写【沉降处理】归档或【沉降处理】删除。
5. 焦点、基础设定和手动锁定条目不得要求删除。
6. 不补全、不推测、不输出JSON、代码块、说明或分析过程。${custom ? `\n\n【玩家附加总结要求】\n${custom}` : ''}`;
    const recent = isSmall ? `\n\n【最近对话】\n${recentConversation || '（无）'}` : '';
    const user = `【总结范围】\n${subject || (isSmall ? '当前事件线' : '长期叙事')}\n${recent}\n\n【世界书相关条目】\n${entries.map(entryForPrompt).join('\n\n') || '（无）'}\n\n请直接输出需要写回世界书的事实；没有变化只返回“无”。`;
    return { system, user };
}
function keywordTemplate(definitions) {
    return definitions.filter((item) => item.enabled).map((item) => {
        const aliases = item.aliases.length ? `；近义标签：${item.aliases.join('、')}` : '';
        const fields = item.fields.map((field) => {
            const options = field.options?.length ? `；选项：${field.options.join(' / ')}` : '';
            return `- 【${field.label}】${options}${field.prompt ? `；${field.prompt}` : ''}`;
        }).join('\n');
        return `关键词：${item.label}${aliases}\n用途：${item.description}\n${fields || '- 可按事实使用合适的小标题'}`;
    }).join('\n\n');
}
function entryForPrompt(entry) {
    return `标题：${entry.title}\nUID：${entry.uid}\n关键词：${entry.keywords.join('、') || '无'}\n正文：\n${(0, util_1.truncate)(entry.content || '（空）', 2200)}`;
}
},
"settings":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsStore = exports.DEFAULT_SETTINGS = exports.DEFAULT_LARGE_SUMMARY_PROMPT = exports.DEFAULT_SMALL_SUMMARY_PROMPT = exports.DEFAULT_EXTRACTION_PROMPT = exports.DEFAULT_AUDIT_PROMPT = exports.DEFAULT_KEYWORDS = void 0;
exports.parseSettings = parseSettings;
const constants_1 = require("./constants");
const util_1 = require("./util");
const COMMON_LINKS = { key: 'links', label: '关联条目', policy: 'merge-titles' };
const COMMON_ALIASES = { key: 'aliases', label: '别名', policy: 'merge-keywords' };
const FIXED = { key: 'fixed', label: '固定事实', policy: 'semantic-upsert' };
const CURRENT = { key: 'current', label: '当前状态', policy: 'replace-by-anchor' };
exports.DEFAULT_KEYWORDS = [
    keyword('spacetime', '时空', '当前时间、总体位置和时间推进。', ['时间', '时空状态'], false, [
        CURRENT,
        { key: 'history', label: '变化记录', policy: 'append-chain' },
        COMMON_LINKS,
    ], 620),
    keyword('scene', '场景', '当前场景、参与对象、核心局面和直接限制。', ['当前场景'], false, [
        CURRENT,
        { key: 'progress', label: '场景进展', policy: 'append-chain' },
        COMMON_LINKS,
    ], 700),
    keyword('character', '人物', '稳定身份、当前状态和会影响后续的连续经历。', ['角色', 'NPC'], false, [
        FIXED,
        CURRENT,
        { key: 'recent', label: '近期经历', policy: 'append-chain' },
        COMMON_LINKS,
        COMMON_ALIASES,
    ], 520),
    keyword('item', '物品', '重要物品的归属、位置、数量、完整性、用途和变化。', ['道具', '装备'], false, [
        FIXED,
        CURRENT,
        { key: 'history', label: '变化记录', policy: 'append-chain' },
        COMMON_LINKS,
    ], 500),
    keyword('event', '事件', '事件进展、当前状态和最终结果。', ['事件链'], false, [
        { key: 'status', label: '当前状态', policy: 'replace-by-anchor', options: ['开始', '进行中', '暂停', '结束', '无变化', '无'] },
        { key: 'chain', label: '事件进程', policy: 'append-chain' },
        { key: 'result', label: '最终结果', policy: 'replace-section' },
        COMMON_LINKS,
    ], 680),
    keyword('region', '地点', '地点自身稳定属性、当前状态和重要变化。', ['地区', '区域', '场所'], false, [
        FIXED,
        CURRENT,
        { key: 'history', label: '变化记录', policy: 'append-chain' },
        COMMON_LINKS,
        COMMON_ALIASES,
    ], 470),
    keyword('global', '全局变化', '组织、制度、阵营、政权和群体格局的变化。', ['世界变化', '全局状态'], false, [
        CURRENT,
        { key: 'history', label: '变化记录', policy: 'append-chain' },
        COMMON_LINKS,
    ], 610),
    keyword('foundation', '基础设定', '跨场景成立的世界规则、物种规则、制度基础和魔法体系。', ['基础规则', '世界设定', '规则', '设定'], true, [
        FIXED,
        { key: 'current', label: '现行规则', policy: 'replace-by-anchor' },
        COMMON_LINKS,
        COMMON_ALIASES,
    ], 860, false, 1),
    keyword('ability', '能力', '会持续影响后续的能力、技能、特性和限制。', ['技能', '特性'], false, [
        FIXED,
        CURRENT,
        COMMON_LINKS,
    ], 540),
    keyword('relationship', '关系', '显著且会影响后续的对象关系。', ['显著关系', '关系状态'], false, [
        FIXED,
        CURRENT,
        { key: 'history', label: '变化记录', policy: 'append-chain' },
        COMMON_LINKS,
    ], 560),
    keyword('organization', '组织', '组织、阵营、机构、政权及其当前行动。', ['阵营', '机构', '政权'], false, [
        FIXED,
        CURRENT,
        { key: 'history', label: '变化记录', policy: 'append-chain' },
        COMMON_LINKS,
    ], 560),
    keyword('task', '任务', '明确成立的任务、责任、约束和完成状态。', ['目标', '责任'], false, [
        CURRENT,
        { key: 'progress', label: '任务进程', policy: 'append-chain' },
        { key: 'result', label: '最终结果', policy: 'replace-section' },
        COMMON_LINKS,
    ], 600),
    keyword('contract', '契约', '契约、誓言、承诺、债务及其约束。', ['誓言', '承诺', '债务'], false, [
        FIXED,
        CURRENT,
        { key: 'history', label: '变化记录', policy: 'append-chain' },
        COMMON_LINKS,
    ], 580),
    keyword('condition', '状态影响', '疾病、诅咒、伤势和其他持续影响。', ['疾病', '诅咒', '伤势'], false, [
        FIXED,
        CURRENT,
        { key: 'history', label: '变化记录', policy: 'append-chain' },
        COMMON_LINKS,
    ], 590),
    keyword('resource', '资源', '数量有限且会影响后续的资源、货币、权限或配额。', ['货币', '权限', '配额'], false, [
        CURRENT,
        { key: 'history', label: '变化记录', policy: 'append-chain' },
        COMMON_LINKS,
    ], 490),
    keyword('custom', '自定义对象', '未预先举例但可稳定命名、会影响后续的对象。', ['自定义'], false, [
        FIXED,
        CURRENT,
        { key: 'history', label: '变化记录', policy: 'append-chain' },
        COMMON_LINKS,
        COMMON_ALIASES,
    ], 400),
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
exports.DEFAULT_AUDIT_PROMPT = `- 不替玩家决定行动、态度、判断、目标或心理。
- 不把未发生、未确认、仅被计划或推测的内容写成事实。
- 不擅自改变已经成立的时间、地点、人物关系、物品状态和事件顺序。
- 发现明确违规时只做最小修正，不扩写剧情。`;
exports.DEFAULT_EXTRACTION_PROMPT = `- 只提取本轮已经明确成立、会影响后续叙事的信息点。
- 普通动作、表情、气氛、修辞、服装和无后续影响的背景信息不记录。
- 同一对象沿用已有标题；同一事件的新进展继续写入原事件。
- 没有核心变化的小标题填写“无”，不得用旧事实补齐。`;
exports.DEFAULT_SMALL_SUMMARY_PROMPT = `整理当前场景或当前事件链，保留仍会影响后续的结果、关系、资源、身份和限制；已分发的临时过程可以沉降。`;
exports.DEFAULT_LARGE_SUMMARY_PROMPT = `只固化跨场景仍成立的长期事实，合并重复内容，删除已被最终结果覆盖的临时过程。`;
exports.DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    modelSource: 'current',
    modelProfileId: '',
    autoProcess: true,
    auditEnabled: true,
    targetLorebook: '',
    autoCreateLorebook: true,
    auditPrompt: exports.DEFAULT_AUDIT_PROMPT,
    extractionPrompt: exports.DEFAULT_EXTRACTION_PROMPT,
    smallSummaryPrompt: exports.DEFAULT_SMALL_SUMMARY_PROMPT,
    largeSummaryPrompt: exports.DEFAULT_LARGE_SUMMARY_PROMPT,
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
        modelSource: candidate.modelSource === 'profile' ? 'profile' : 'current',
        modelProfileId: String(candidate.modelProfileId ?? ''),
        autoProcess: candidate.autoProcess === true,
        auditEnabled: candidate.auditEnabled === true,
        targetLorebook: String(candidate.targetLorebook ?? ''),
        autoCreateLorebook: candidate.autoCreateLorebook !== false,
        auditPrompt: String(candidate.auditPrompt ?? exports.DEFAULT_AUDIT_PROMPT) || exports.DEFAULT_AUDIT_PROMPT,
        extractionPrompt: String(candidate.extractionPrompt ?? exports.DEFAULT_EXTRACTION_PROMPT) || exports.DEFAULT_EXTRACTION_PROMPT,
        smallSummaryPrompt: String(candidate.smallSummaryPrompt ?? exports.DEFAULT_SMALL_SUMMARY_PROMPT) || exports.DEFAULT_SMALL_SUMMARY_PROMPT,
        largeSummaryPrompt: String(candidate.largeSummaryPrompt ?? exports.DEFAULT_LARGE_SUMMARY_PROMPT) || exports.DEFAULT_LARGE_SUMMARY_PROMPT,
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldbookAdapter = void 0;
exports.parseEntries = parseEntries;
const constants_1 = require("./constants");
const operations_1 = require("./operations");
const parser_1 = require("./parser");
const util_1 = require("./util");
class WorldbookAdapter {
    constructor(context, chatKey) {
        this.context = context;
        this.chatKey = chatKey ?? (() => '');
        this.apiPromise = null;
    }
    async list(settings) {
        const { data } = await this.open(settings, false);
        return parseEntries(data);
    }
    async apply(settings, plan, sourceMessageKey, contextText, focusTitle, expectedChatKey = '') {
        this.assertChat(expectedChatKey);
        const opened = await this.open(settings, true);
        this.assertChat(expectedChatKey);
        const before = parseEntries(opened.data);
        const after = (0, operations_1.applyPlanToEntries)(plan, before);
        const byUid = new Map(before.map((entry) => [entry.uid, entry]));
        const touchedUids = new Set(plan.operations.filter((operation) => operation.kind !== 'noop' && operation.targetUid).map((operation) => String(operation.targetUid)));
        for (const entry of after) {
            if (entry.raw.__delete) continue;
            if (entry.uid.startsWith('new:')) {
                const created = this.createEntry(opened.api, opened.name, opened.data);
                hydrateRaw(created, entry, sourceMessageKey);
                entry.uid = String(created.uid);
                entry.raw = created;
            } else {
                if (!touchedUids.has(entry.uid)) continue;
                const original = byUid.get(entry.uid);
                if (!original) continue;
                hydrateRaw(original.raw, entry, sourceMessageKey);
            }
        }
        this.applyProtectedNativeFields(parseEntries(opened.data), settings, focusTitle);
        this.assertChat(expectedChatKey);
        await this.save(opened);
        this.assertChat(expectedChatKey);
        const verifiedData = await opened.api.loadWorldInfo(opened.name);
        if (!verifiedData) throw new Error('世界书写入后回读失败');
        opened.data = verifiedData;
        const deletions = plan.operations.filter((operation) => operation.kind === 'delete-entry' && operation.targetUid);
        if (deletions.length) {
            const protectedTitle = (0, util_1.normalizeTitle)(focusTitle);
            for (const operation of deletions) {
                const target = parseEntries(opened.data).find((entry) => entry.uid === String(operation.targetUid));
                const foundation = target?.keywords.some((keyword) => isFoundation(keyword, settings));
                if (!target || target.locked || target.focus || foundation || (0, util_1.normalizeTitle)(target.title) === protectedTitle) continue;
                delete opened.data.entries[String(target.uid)];
            }
            this.assertChat(expectedChatKey);
            await this.save(opened);
        }
        this.assertChat(expectedChatKey);
        const finalData = await opened.api.loadWorldInfo(opened.name);
        if (!finalData) throw new Error('世界书最终回读失败');
        return parseEntries(finalData);
    }
    applyProtectedNativeFields(entries, settings, focusTitle) {
        const normalizedFocus = (0, util_1.normalizeTitle)(focusTitle);
        for (const entry of entries) {
            const foundation = entry.keywords.some((keyword) => isFoundation(keyword, settings));
            const focus = Boolean(normalizedFocus && (0, util_1.normalizeTitle)(entry.title) === normalizedFocus) || entry.focus;
            if (foundation) {
                entry.raw.constant = true;
                entry.raw.vectorized = false;
            }
            if (focus) entry.raw.constant = true;
            const extension = markManaged(entry.raw, '', entry.title);
            extension.focus = focus;
        }
    }
    assertChat(expected) {
        if (expected && this.chatKey() !== expected) throw new Error('聊天已经切换，拒绝写入世界书');
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
        if (!name) throw new Error('当前聊天未绑定世界书');
        let data = await api.loadWorldInfo(name);
        if (!data && create) {
            if (typeof api.createNewWorldInfo !== 'function') throw new Error('SillyTavern 未提供 createNewWorldInfo');
            await api.createNewWorldInfo(name, { interactive: false });
            data = await api.loadWorldInfo(name);
        }
        if (!data) throw new Error(`世界书“${name}”不存在`);
        data.entries ?? (data.entries = {});
        if (context.chatMetadata?.[metadataKey] !== name) {
            context.chatMetadata ?? (context.chatMetadata = {});
            context.chatMetadata[metadataKey] = name;
            context.chatMetadata.world_info = name;
            if (typeof context.saveMetadata === 'function') await context.saveMetadata();
            else context.saveMetadataDebounced?.();
        }
        return { api, name, data };
    }
    createEntry(api, name, data) {
        if (typeof api.createWorldInfoEntry !== 'function') throw new Error('SillyTavern 未提供 createWorldInfoEntry');
        const entry = api.createWorldInfoEntry(name, data);
        if (!entry) throw new Error('世界书条目创建失败');
        return entry;
    }
    async save(opened) {
        if (typeof opened.api.saveWorldInfo !== 'function') throw new Error('SillyTavern 未提供 saveWorldInfo');
        await opened.api.saveWorldInfo(opened.name, opened.data, true);
        const context = this.context();
        await context.updateWorldInfoList?.();
        await context.reloadWorldInfoEditor?.(opened.name, false);
    }
    api() {
        if (globalThis.__MIRROR_ABYSS_WORLD_INFO_API__) return Promise.resolve(globalThis.__MIRROR_ABYSS_WORLD_INFO_API__);
        if (globalThis.__MIRROR_ABYSS_LOAD_WORLD_INFO_API__) return globalThis.__MIRROR_ABYSS_LOAD_WORLD_INFO_API__();
        if (this.apiPromise) return this.apiPromise;
        this.apiPromise = Promise.resolve(buildContextWorldInfoApi(this.context()));
        return this.apiPromise;
    }
}
exports.WorldbookAdapter = WorldbookAdapter;
function buildContextWorldInfoApi(context) {
    const headers = () => context.getRequestHeaders?.() ?? { 'Content-Type': 'application/json' };
    const loadWorldInfo = typeof context.loadWorldInfo === 'function' ? context.loadWorldInfo.bind(context) : async (name) => {
        const response = await fetch('/api/worldinfo/get', { method: 'POST', headers: headers(), body: JSON.stringify({ name }), cache: 'no-cache' });
        if (!response.ok) return null;
        return response.json();
    };
    const saveWorldInfo = typeof context.saveWorldInfo === 'function' ? context.saveWorldInfo.bind(context) : async (name, data) => {
        const response = await fetch('/api/worldinfo/edit', { method: 'POST', headers: headers(), body: JSON.stringify({ name, data }) });
        if (!response.ok) throw new Error(`世界书保存失败：HTTP ${response.status}`);
    };
    return {
        METADATA_KEY: 'world_info', loadWorldInfo, saveWorldInfo,
        async createNewWorldInfo(name) { await saveWorldInfo(name, { entries: {} }, true); await context.updateWorldInfoList?.(); return true; },
        createWorldInfoEntry(_name, data) {
            data.entries ?? (data.entries = {});
            let uid = 0; while (Object.prototype.hasOwnProperty.call(data.entries, String(uid))) uid += 1;
            const entry = createDefaultWorldInfoEntry(uid); data.entries[String(uid)] = entry; return entry;
        },
    };
}
function createDefaultWorldInfoEntry(uid) {
    return { uid, key: [], keysecondary: [], comment: '', content: '', constant: false, vectorized: true, selective: false, selectiveLogic: 0, addMemo: false, order: 400, position: 0, disable: false, ignoreBudget: false, excludeRecursion: false, preventRecursion: false, probability: 100, useProbability: true, depth: 4, outletName: '', group: '', groupOverride: false, groupWeight: 100, scanDepth: null, caseSensitive: null, matchWholeWords: null, useGroupScoring: null, automationId: '', role: 0, sticky: null, cooldown: null, delay: null, delayUntilRecursion: 0, triggers: [] };
}
function parseEntries(data) {
    const output = [];
    for (const [mapUid, rawValue] of Object.entries(data?.entries ?? {})) {
        if (!rawValue || typeof rawValue !== 'object') continue;
        const raw = rawValue;
        const title = (0, util_1.normalizeTitle)(String(raw.comment ?? raw.name ?? raw.title ?? ''));
        const split = (0, util_1.splitTitle)(title);
        if (!split) continue;
        const content = String(raw.content ?? '');
        const sections = (0, parser_1.parseEntrySections)(content);
        const keywords = (0, util_1.normalizeStringArray)(raw.key);
        const aliases = (0, util_1.unique)([...(0, parser_1.sectionLines)(content, ['别名', '称号', '其他名称']), ...keywords.filter((key) => (0, util_1.normalizeFact)(key) !== (0, util_1.normalizeFact)(split.name) && (0, util_1.normalizeFact)(key) !== (0, util_1.normalizeFact)(split.type))]);
        const extension = readExtension(raw);
        output.push({ uid: String(raw.uid ?? mapUid), title, normalizedTitle: title.toLocaleLowerCase(), type: split.type, name: split.name, content, sections, keywords: (0, util_1.unique)([split.type, split.name, ...keywords]), aliases, references: (0, parser_1.extractReferences)(content), focus: extension.focus === true, locked: extension.locked === true || raw.locked === true, managed: extension.managed === true, activation: { constant: raw.constant === true, vectorized: raw.vectorized !== false, preventRecursion: raw.preventRecursion === true, depth: Math.max(0, Number(raw.depth) || 4), order: Number(raw.order) || 400, disabled: raw.disable === true }, raw });
    }
    return output.sort((left, right) => left.title.localeCompare(right.title));
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
    extensions[constants_1.WORLD_INFO_EXTENSION_KEY] = { ...extension, managed: true, version: constants_1.MANAGED_VERSION, title, ...(sourceMessageKey ? { sourceMessageKey } : {}), updatedAt: Date.now() };
    return extensions[constants_1.WORLD_INFO_EXTENSION_KEY];
}
function readExtension(raw) { const value = raw.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY]; return value && typeof value === 'object' ? value : {}; }
function isFoundation(keyword, settings) {
    const normalized = (0, util_1.normalizeFact)(keyword);
    const definition = settings.keywordDefinitions.find((item) => item.label === '基础设定');
    return definition ? [definition.label, ...definition.aliases].some((item) => (0, util_1.normalizeFact)(item) === normalized) : normalized === (0, util_1.normalizeFact)('基础设定');
}
}
};
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
