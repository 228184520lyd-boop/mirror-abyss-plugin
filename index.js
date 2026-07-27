/** Mirror Abyss 2.0.0-frozen.1 — frozen architecture V1.0. */
var MA_MODULES={"ai/audit-service":function(module,exports,require){
"use strict";
module.exports = require("../audit");

},
"ai/connection-profile-client":function(module,exports,require){
"use strict";
module.exports = require("../host");

},
"ai/extraction-service":function(module,exports,require){
"use strict";
module.exports = require("../memory");

},
"ai/large-summary-service":function(module,exports,require){
"use strict";
module.exports = require("../memory");

},
"ai/migration-service":function(module,exports,require){
"use strict";
module.exports = require("../migration");

},
"ai/revision-service":function(module,exports,require){
"use strict";
module.exports = require("../revision");

},
"ai/small-summary-service":function(module,exports,require){
"use strict";
module.exports = require("../memory");

},
"application":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MirrorAbyssApplication = void 0;
const host_1 = require("./host");
const settings_1 = require("./settings");
const audit_1 = require("./audit");
const memory_1 = require("./memory");
const worldbook_1 = require("./worldbook");
const migration_1 = require("./migration");
const util_1 = require("./util");
const control_panel_1 = require("./control-panel");
class MirrorAbyssApplication {
    constructor() {
        this.host = new host_1.HostAdapter();
        this.settingsStore = new settings_1.SettingsStore();
        this.worldbook = new worldbook_1.WorldbookAdapter(() => this.host.context(), () => this.host.chatKey());
        this.auditRunner = new audit_1.AuditRunner(this.host, () => this.settings());
        this.memoryRunner = new memory_1.MemoryRunner(this.host, this.worldbook, () => this.settings());
        this.migrationService = new migration_1.MigrationService(this.host, this.worldbook, () => this.settings());
        this.controlPanel = new control_panel_1.ControlPanel({
            getSettings: () => this.settings(),
            configure: (patch) => this.configure(patch),
            audit: () => this.audit(),
            extract: () => this.extract(),
            smallSummary: () => this.smallSummary(),
            largeSummary: () => this.largeSummary(),
            cancel: () => this.cancel(),
            loadWorkspace: () => this.loadWorkspace(),
            updateEntry: (uid, patch) => this.updateEntry(uid, patch),
            setFocus: (uid, enabled) => this.setFocus(uid, enabled),
            setLocked: (uid, locked) => this.setLocked(uid, locked),
            migrate: () => this.migrate(),
            undoMigration: () => this.undoMigration(),
            bindProfileDropdown: (selector, selectedId, onChange) => this.host.bindProfileDropdown(selector, selectedId, onChange),
        });
        this.cleanup = [];
        this.runningByChat = new Map();
        this.pendingTaskKeys = new Set();
        this.pendingAutomaticByChat = new Map();
        this.activeSnapshots = new Map();
        this.activeTokens = new Map();
        this.started = false;
    }
    start() {
        if (this.started) return;
        this.host.context();
        this.listen('MESSAGE_RECEIVED', (value) => void this.onMessage(messageIndexFromEvent(value)));
        for (const event of ['CHAT_CHANGED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED']) this.listen(event, (value) => this.onScopeChanged(event, value));
        this.controlPanel.mount();
        this.started = true;
    }
    stop() {
        if (!this.started) return;
        this.started = false;
        this.cancelAll('插件已停止');
        this.cleanup.splice(0).forEach((remove) => { try { remove(); } catch (error) { console.warn('[MirrorAbyss] listener cleanup failed', error); } });
        this.runningByChat.clear();
        this.pendingTaskKeys.clear();
        this.pendingAutomaticByChat.clear();
        this.activeSnapshots.clear();
        this.host.clearInternalMessageMutations();
        this.controlPanel.unmount();
    }
    isStarted() { return this.started; }
    settings() { return this.settingsStore.load(this.host.context()); }
    configure(patch) { return this.settingsStore.save(this.host.context(), patch); }
    audit() { return this.enqueueTask('audit', undefined, false); }
    extract() { return this.enqueueTask('extraction', undefined, false); }
    smallSummary() { return this.enqueueTask('smallSummary', undefined, false); }
    largeSummary() { return this.enqueueTask('largeSummary', undefined, false); }
    migrate() { return this.enqueueTask('migration', undefined, false); }
    undoMigration() { return this.enqueueTask('undoMigration', undefined, false); }
    processLatest() { return this.enqueueTask('full', undefined, false); }
    cancel() {
        const key = this.host.chatKey();
        const token = this.activeTokens.get(key);
        if (!token) {
            this.controlPanel.setStatus('当前聊天没有正在执行的任务');
            return false;
        }
        token.cancelled = true;
        token.reason = '用户已取消任务';
        this.controlPanel.setStatus('已请求取消当前任务');
        return true;
    }
    status() {
        const key = safeChatKey(this.host);
        return { audit: this.auditRunner.currentStatus(key), memory: this.memoryRunner.currentStatus(key), active: this.activeTokens.has(key) };
    }
    async loadWorkspace() {
        const settings = this.settings();
        const worldbook = await this.worldbook.read(settings);
        return {
            entries: worldbook.entries,
            worldbookName: worldbook.name,
            settings,
            focusUid: this.host.getFocusUid(),
            matching: this.memoryRunner.currentStatus(this.host.chatKey()),
            task: this.status(),
            canUndoMigration: this.migrationService.canUndo(),
        };
    }
    updateEntry(uid, patch) {
        return this.enqueueMaintenance('editEntry', async (settings, snapshot) => this.worldbook.updateEntry(settings, uid, patch, snapshot, () => this.host.assertSnapshot(snapshot, this.settings())));
    }
    setLocked(uid, locked) {
        return this.enqueueMaintenance('setLocked', async (settings, snapshot) => this.worldbook.setLocked(settings, uid, locked, snapshot, () => this.host.assertSnapshot(snapshot, this.settings())));
    }
    setFocus(uid, enabled = true) {
        return this.enqueueMaintenance('setFocus', async (settings, snapshot) => {
            const previous = this.host.getFocusUid();
            const next = enabled === false ? '' : String(uid ?? '');
            await this.worldbook.setFocus(settings, previous, next, snapshot, () => this.host.assertSnapshot(snapshot, this.settings()));
            try {
                await this.host.setFocusUid(next);
            }
            catch (error) {
                await this.worldbook.setFocus(settings, next, previous, snapshot, () => this.host.assertSnapshot(snapshot, this.settings()));
                throw error;
            }
            return this.worldbook.list(settings, snapshot, () => this.host.assertSnapshot(snapshot, this.settings()));
        });
    }
    listen(eventName, handler) {
        try { this.cleanup.push(this.host.subscribe(eventName, handler, false)); }
        catch (error) { console.warn(`[MirrorAbyss] 宿主事件 ${eventName} 不可用`, error); }
    }
    async onMessage(index) {
        if (!this.started)
            return;
        if (!Number.isInteger(index)) {
            try { index = this.host.latestTurn().messageIndex; }
            catch { return; }
        }
        if (!this.host.isAssistantIndex(index)) return;
        const settings = this.settings();
        if (!settings.enabled || !settings.autoProcess) return;
        const chatKey = this.host.chatKey();
        if (this.runningByChat.has(chatKey)) {
            const turn = this.host.latestTurn(index);
            const active = this.activeSnapshots.get(chatKey);
            if (active && active.messageKey === turn.messageKey && active.contentHash === turn.contentHash)
                return;
            this.host.bumpScopeRevision(chatKey);
            const token = this.activeTokens.get(chatKey);
            if (token) {
                token.cancelled = true;
                token.reason = '检测到更新的 AI 正文，旧任务已取消';
            }
            this.pendingAutomaticByChat.set(chatKey, { index: turn.messageIndex, messageKey: turn.messageKey, contentHash: turn.contentHash });
            this.controlPanel.setStatus('检测到更新正文；当前任务停止后将处理最新一条');
            return;
        }
        this.host.bumpScopeRevision(chatKey);
        try { await this.enqueueTask('full', index, true); }
        catch (error) { console.error('[MirrorAbyss] automatic core flow failed', error); }
    }
    onScopeChanged(eventName, eventValue) {
        if (this.host.consumeInternalScopeEvent(eventName, eventValue))
            return;
        this.cancelAll(`SillyTavern 事件 ${eventName} 使旧任务失效`);
        this.pendingAutomaticByChat.clear();
        try { this.host.bumpScopeRevision(this.host.chatKey()); } catch { }
        this.controlPanel.setStatus('聊天或正文范围已变化，旧任务已取消');
    }
    enqueueTask(taskType, index, automatic) {
        const settings = this.settings();
        const token = { cancelled: false, reason: '' };
        const maintenance = taskType === 'migration' || taskType === 'undoMigration';
        const snapshot = maintenance
            ? this.host.captureMaintenanceSnapshot(settings, taskType, token)
            : this.host.captureSnapshot(settings, index, taskType, token);
        const taskKey = `${snapshot.chatKey}|${taskType}|${snapshot.messageKey}|${snapshot.contentHash}`;
        if (this.pendingTaskKeys.has(taskKey)) return Promise.reject(new Error('同一任务已经在执行或等待，不重复排队'));
        if (this.runningByChat.has(snapshot.chatKey)) return Promise.reject(new Error('当前聊天已有核心任务正在执行'));
        this.pendingTaskKeys.add(taskKey);
        this.activeTokens.set(snapshot.chatKey, token);
        this.activeSnapshots.set(snapshot.chatKey, snapshot);
        const task = Promise.resolve().then(async () => {
            try {
                if (!this.started || token.cancelled)
                    return [];
                return await this.runTask(taskType, snapshot, automatic, settings);
            }
            finally {
                if (this.activeTokens.get(snapshot.chatKey) === token) this.activeTokens.delete(snapshot.chatKey);
                if (this.activeSnapshots.get(snapshot.chatKey) === snapshot) this.activeSnapshots.delete(snapshot.chatKey);
            }
        });
        this.runningByChat.set(snapshot.chatKey, task);
        return task.finally(() => {
            this.pendingTaskKeys.delete(taskKey);
            if (this.runningByChat.get(snapshot.chatKey) === task) this.runningByChat.delete(snapshot.chatKey);
            this.schedulePendingAutomatic(snapshot.chatKey);
        });
    }
    async runTask(taskType, snapshot, automatic, settings) {
        if (!this.started || snapshot.token?.cancelled)
            return [];
        try {
            this.host.assertSnapshot(snapshot, this.settings());
            const cursor = this.host.cursor();
            if (taskType === 'full' && cursor.lastProcessedMessageKey === snapshot.messageKey && cursor.lastProcessedHash === snapshot.contentHash) {
                this.controlPanel.setStatus('该正文已经完整处理，未重复调用模型');
                if (!automatic) notify('info', '镜渊：该正文已经完整处理');
                return [];
            }
            if (taskType === 'extraction' && cursor.lastFactMessageKey === snapshot.messageKey && cursor.lastFactHash === snapshot.contentHash) {
                this.controlPanel.setStatus('该正文事实已经提交，未重复提取');
                notify('info', '镜渊：该正文事实已经提交');
                return [];
            }
            this.controlPanel.setStatus(taskType === 'full' ? '自动处理中…' : '任务处理中…');
            let activeSnapshot = snapshot;
            let result;
            if (taskType === 'audit') result = await this.auditRunner.process(settings, activeSnapshot);
            else if (taskType === 'extraction') result = await this.memoryRunner.runTask('extraction', settings, activeSnapshot);
            else if (taskType === 'smallSummary') result = await this.memoryRunner.runTask('smallSummary', settings, activeSnapshot);
            else if (taskType === 'largeSummary') result = await this.memoryRunner.runTask('largeSummary', settings, activeSnapshot);
            else if (taskType === 'migration') result = await this.migrationService.migrate(settings, activeSnapshot);
            else if (taskType === 'undoMigration') result = await this.migrationService.undo(settings, activeSnapshot);
            else {
                if (settings.auditEnabled && settings.auditPrompt.trim()) activeSnapshot = await this.auditRunner.process(settings, activeSnapshot);
                this.host.assertSnapshot(activeSnapshot, this.settings());
                result = await this.memoryRunner.processTurn(settings, activeSnapshot);
            }
            this.host.assertSnapshot(activeSnapshot, this.settings());
            this.controlPanel.setStatus('本轮处理完成');
            notify('success', '镜渊：本轮处理完成');
            return result;
        } catch (error) {
            const text = (0, util_1.errorText)(error);
            if (snapshot.token?.cancelled && !/超时/u.test(snapshot.token.reason || '')) {
                this.controlPanel.setStatus(`任务已取消：${snapshot.token.reason || text}`);
                if (!automatic)
                    notify('info', `镜渊：${snapshot.token.reason || '任务已取消'}`);
                return [];
            }
            this.controlPanel.setStatus(`处理失败：${text}`, true);
            notify('error', `镜渊：${text}`);
            throw error;
        }
    }
    enqueueMaintenance(taskType, action) {
        const settings = this.settings();
        const token = { cancelled: false, reason: '' };
        const snapshot = this.host.captureMaintenanceSnapshot(settings, taskType, token);
        if (this.runningByChat.has(snapshot.chatKey))
            return Promise.reject(new Error('当前聊天已有核心任务正在执行'));
        this.activeTokens.set(snapshot.chatKey, token);
        this.activeSnapshots.set(snapshot.chatKey, snapshot);
        const task = Promise.resolve().then(async () => {
            try {
                if (!this.started || token.cancelled)
                    return [];
                this.controlPanel.setStatus('世界书操作中…');
                const result = await action(settings, snapshot);
                this.controlPanel.setStatus('世界书操作完成');
                return result;
            }
            catch (error) {
                this.controlPanel.setStatus(`世界书操作失败：${(0, util_1.errorText)(error)}`, true);
                throw error;
            }
            finally {
                if (this.activeTokens.get(snapshot.chatKey) === token)
                    this.activeTokens.delete(snapshot.chatKey);
                if (this.activeSnapshots.get(snapshot.chatKey) === snapshot)
                    this.activeSnapshots.delete(snapshot.chatKey);
            }
        });
        this.runningByChat.set(snapshot.chatKey, task);
        return task.finally(() => {
            if (this.runningByChat.get(snapshot.chatKey) === task)
                this.runningByChat.delete(snapshot.chatKey);
            this.schedulePendingAutomatic(snapshot.chatKey);
        });
    }
    schedulePendingAutomatic(chatKey) {
        if (!this.started) {
            this.pendingAutomaticByChat.delete(chatKey);
            return;
        }
        const pending = this.pendingAutomaticByChat.get(chatKey);
        if (!pending || this.runningByChat.has(chatKey))
            return;
        this.pendingAutomaticByChat.delete(chatKey);
        globalThis.queueMicrotask?.(() => {
            try {
                if (!this.started)
                    return;
                if (this.host.chatKey() !== chatKey)
                    return;
                const turn = this.host.latestTurn(pending.index);
                if (turn.messageKey !== pending.messageKey || turn.contentHash !== pending.contentHash)
                    return;
                void this.onMessage(pending.index);
            }
            catch (error) {
                console.error('[MirrorAbyss] pending automatic task discarded', error);
            }
        });
    }
    cancelAll(reason) {
        for (const token of this.activeTokens.values()) {
            token.cancelled = true;
            token.reason = reason;
        }
    }
}
exports.MirrorAbyssApplication = MirrorAbyssApplication;
function notify(kind, message) {
    const toast = globalThis.toastr?.[kind];
    if (typeof toast === 'function') toast(message);
    else console[kind === 'error' ? 'error' : 'info'](`[MirrorAbyss] ${message}`);
}
function safeChatKey(host) { try { return host.chatKey(); } catch { return ''; } }
function messageIndexFromEvent(value) {
    if (Number.isInteger(value))
        return value;
    if (value && typeof value === 'object') {
        for (const candidate of [value.messageIndex, value.messageId, value.index, value.id]) {
            const number = Number(candidate);
            if (Number.isInteger(number))
                return number;
        }
    }
    const number = Number(value);
    return Number.isInteger(number) ? number : undefined;
}

},
"audit":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditRunner = void 0;
exports.parseAuditResult = parseAuditResult;
const constants_1 = require("./constants");
const prompts_1 = require("./prompts");
const parser_1 = require("./parser");
const revision_1 = require("./revision");
const util_1 = require("./util");
class AuditRunner {
    constructor(host, getSettings) {
        this.host = host;
        this.getSettings = getSettings;
        this.revisionService = new revision_1.RevisionService(host, getSettings);
        this.statusByChat = new Map();
    }
    currentStatus(chatKey = '') {
        const key = chatKey || safeChatKey(this.host);
        return structuredClone(this.statusByChat.get(key) ?? { phase: 'idle', detail: '等待审核', error: '' });
    }
    async process(settings, snapshot) {
        const cursor = this.host.cursor();
        if (cursor.lastAuditMessageKey === snapshot.messageKey && cursor.lastAuditHash === snapshot.contentHash) {
            this.setStatus(snapshot.chatKey, 'complete', '该正文已经审核，跳过重复调用');
            return snapshot;
        }
        if (!settings.auditEnabled || !settings.auditPrompt.trim()) {
            this.setStatus(snapshot.chatKey, 'complete', '审核未启用');
            return snapshot;
        }
        try {
            this.host.assertSnapshot(snapshot, this.getSettings());
            this.setStatus(snapshot.chatKey, 'audit', '审核正文');
            const prompt = (0, prompts_1.auditPrompts)(settings, snapshot.playerText, snapshot.assistantText);
            const raw = await this.host.generate(prompt.system, trimPrompt(prompt.user), settings.responseTokens, snapshot, settings, settings.requestTimeoutMs, settings.auditProfileId);
            this.host.assertSnapshot(snapshot, this.getSettings());
            const result = parseAuditResult(raw);
            let finalSnapshot = snapshot;
            if (result.decision === 'revision') {
                this.setStatus(snapshot.chatKey, 'revision', '审核不通过，生成一次完整修正版');
                const revisedText = await this.revisionService.revise(settings, snapshot, result.issues);
                finalSnapshot = await this.host.replaceAssistantText(snapshot, revisedText, this.getSettings());
                this.setStatus(snapshot.chatKey, 'revision', '完整修正版正文已落地');
            }
            const nextCursor = this.host.cursor();
            nextCursor.lastAuditMessageKey = finalSnapshot.messageKey;
            nextCursor.lastAuditHash = finalSnapshot.contentHash;
            await this.host.saveCursor(nextCursor, finalSnapshot, this.getSettings());
            this.setStatus(snapshot.chatKey, 'complete', result.decision === 'pass' ? '审核通过' : '审核完成，正文已修正');
            return finalSnapshot;
        } catch (error) {
            this.setStatus(snapshot.chatKey, 'error', '审核停止', (0, util_1.errorText)(error));
            throw error;
        }
    }
    setStatus(chatKey, phase, detail, error = '') {
        this.statusByChat.set(chatKey, { phase, detail, error });
    }
}
exports.AuditRunner = AuditRunner;
function parseAuditResult(raw) {
    const text = (0, parser_1.sanitizeModelText)(raw);
    if (/^通过[。.]?$/u.test(text)) return { decision: 'pass', issues: [] };
    if (/【\s*(?:最小修正版正文|修正版正文|完整正文|正文)\s*】/u.test(text))
        throw new Error('审核模型越权返回了修正版正文');
    const conclusion = text.match(/^\s*(通过|需要修正)\s*[。.]?\s*(?:\n|$)/u)?.[1] || '';
    if (conclusion === '通过')
        throw new Error('审核结论为“通过”时必须只返回“通过”');
    if (conclusion !== '需要修正')
        throw new Error('审核返回缺少明确的“通过”或“需要修正”结论');
    const sections = parseSections(text);
    let issues = ['违反规则', '问题', '违规'].flatMap((name) => nonEmptyLines(sections.get(name))).filter((line) => !isNone(line));
    if (!issues.length) {
        issues = text.split('\n').slice(1)
            .map((line) => line.replace(/^\s*【[^】]+】\s*$/u, '').replace(/^\s*(?:[-*•·]|\d+[.)、])\s*/u, '').trim())
            .filter((line) => line && !isNone(line));
    }
    if (!issues.length) throw new Error('审核要求修正，但没有指出具体问题');
    return { decision: 'revision', issues };
}
function parseSections(text) {
    const map = new Map();
    let current = '';
    for (const rawLine of String(text ?? '').replace(/\r/g, '').split('\n')) {
        const line = rawLine.trimEnd();
        const match = line.match(/^\s*【\s*([^】]+?)\s*】\s*$/u)
            ?? line.match(/^\s*([^：:\n]{1,24})\s*[:：]\s*$/u);
        if (match) {
            current = match[1].replace(/\s+/gu, '').trim();
            if (!map.has(current)) map.set(current, []);
            continue;
        }
        if (current) map.get(current).push(line);
    }
    return map;
}
function nonEmptyLines(lines = []) {
    return lines.map((line) => line.replace(/^\s*(?:[-*•·]|\d+[.)、])\s*/u, '').trim()).filter(Boolean);
}
function isNone(value) { return /^\s*(?:无|没有|无问题)\s*[。.]?\s*$/u.test(String(value ?? '')); }
function trimPrompt(value) { return value.length <= constants_1.MAX_CONTEXT_CHARS ? value : `${value.slice(0, constants_1.MAX_CONTEXT_CHARS)}\n[已按字符上限截断]`; }
function safeChatKey(host) { try { return host.chatKey(); } catch { return ''; } }

},
"bootstrap/event-binding":function(module,exports,require){
"use strict";
exports.bindHostEvent = function bindHostEvent(host, eventName, handler) {
    return host.subscribe(eventName, handler, false);
};

},
"bootstrap/lifecycle":function(module,exports,require){
"use strict";
module.exports = require("../index");

},
"bootstrap/sillytavern-context":function(module,exports,require){
"use strict";
module.exports = require("../host");

},
"constants":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGED_VERSION = exports.MAX_CONTEXT_CHARS = exports.WORLD_INFO_EXTENSION_KEY = exports.EXTENSION_NAMESPACE = exports.DISPLAY_NAME = exports.VERSION = void 0;
exports.VERSION = '2.0.0-frozen.1';
exports.DISPLAY_NAME = 'Mirror Abyss｜镜渊';
exports.EXTENSION_NAMESPACE = 'mirrorAbyssInfoPoint';
exports.WORLD_INFO_EXTENSION_KEY = 'mirrorAbyssInfoPoint';
exports.MAX_CONTEXT_CHARS = 48000;
exports.MANAGED_VERSION = 6;

},
"control-panel":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlPanel = void 0;
const util_1 = require("./util");
const ROOT_ID = 'mirror-abyss-core-control';
const TAB_DEFINITIONS = [
    ['overview', '总览'],
    ['information', '信息表'],
    ['keywords', '关键词'],
    ['matching', '匹配'],
    ['graph', '记忆网络'],
    ['settings', '设置'],
];
const PROFILE_FIELDS = [
    ['auditProfileId', '审核 Profile ID'],
    ['revisionProfileId', '修正 Profile ID'],
    ['extractionProfileId', '提取 Profile ID'],
    ['smallSummaryProfileId', '小总结 Profile ID'],
    ['largeSummaryProfileId', '大总结 Profile ID'],
    ['migrationProfileId', '整理 Profile ID'],
];
const OPERATION_LABELS = {
    noop: '不操作',
    'no-op': '不操作',
    append: '追加',
    'append-section': '追加',
    'append-chain': '追加',
    'replace-slot': '替换状态槽',
    'replace-section': '替换小标题',
    'merge-keywords': '合并关键词',
    create: '创建',
    'create-entry': '创建',
    archive: '归档',
    'archive-entry': '归档',
    delete: '删除',
    'delete-entry': '删除',
};
class ControlPanel {
    constructor(actions) {
        this.actions = actions;
        this.root = null;
        this.launcher = null;
        this.panel = null;
        this.statusNode = null;
        this.autoInput = null;
        this.auditInput = null;
        this.enabledInput = null;
        this.actionButtons = [];
        this.busy = false;
        this.waitingForDom = false;
        this.workspaceLoaded = false;
        this.workspaceLoading = null;
        this.workspaceLoadRevision = 0;
        this.workspace = emptyWorkspace();
        this.currentSettings = {};
        this.activeTab = 'overview';
        this.tabButtons = new Map();
        this.viewNodes = new Map();
        this.selectedEntryUid = '';
        this.settingInputs = {};
        this.graphViewport = null;
        this.graphCanvas = null;
        this.graphDetail = null;
        this.graphLayout = null;
        this.workspaceRevision = 0;
        this.graphRevision = -1;
        this.graphTransform = { scale: 1, x: 0, y: 0 };
        this.graphDrag = null;
        this.onDomReady = () => {
            this.waitingForDom = false;
            this.mount();
        };
    }
    mount() {
        if (typeof document === 'undefined') return;
        if (!document.body) {
            if (!this.waitingForDom) {
                this.waitingForDom = true;
                document.addEventListener('DOMContentLoaded', this.onDomReady, { once: true });
            }
            return;
        }
        const existing = document.getElementById(ROOT_ID);
        if (existing) existing.remove();
        this.actionButtons = [];
        this.tabButtons.clear();
        this.viewNodes.clear();
        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.style.cssText = 'position:fixed!important;inset-inline-end:max(10px,env(safe-area-inset-right,0px))!important;bottom:max(84px,calc(68px + env(safe-area-inset-bottom,0px)))!important;z-index:2147483640!important;max-width:calc(100vw - 20px);visibility:visible!important;opacity:1!important;transform:none!important;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f2f2f2;line-height:1.35;';
        const launcher = document.createElement('button');
        launcher.type = 'button';
        launcher.textContent = '镜渊';
        launcher.title = '打开或收起镜渊工作区';
        launcher.setAttribute('aria-expanded', 'false');
        launcher.style.cssText = 'display:block!important;margin-left:auto;min-width:56px;min-height:44px;padding:0 12px;border:1px solid rgba(255,255,255,.24);border-radius:10px;background:rgba(20,20,24,.96);color:#fff;font-weight:700;font-size:14px;box-shadow:0 3px 12px rgba(0,0,0,.42);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
        const panel = document.createElement('section');
        panel.hidden = true;
        panel.setAttribute('aria-label', '镜渊叙事记忆工作区');
        panel.style.cssText = 'box-sizing:border-box;width:min(920px,calc(100vw - 20px));max-height:calc(100dvh - 150px);overflow-y:auto;overscroll-behavior:contain;margin-top:8px;border:1px solid rgba(255,255,255,.18);border-radius:12px;background:rgba(20,20,24,.985);box-shadow:0 8px 28px rgba(0,0,0,.48);-webkit-overflow-scrolling:touch;';
        const header = document.createElement('div');
        header.style.cssText = 'position:sticky;top:0;z-index:5;padding:12px 12px 9px;background:rgba(20,20,24,.985);border-bottom:1px solid rgba(255,255,255,.1);';
        const headingRow = document.createElement('div');
        headingRow.style.cssText = 'display:flex;align-items:center;gap:10px;';
        const titleWrap = document.createElement('div');
        titleWrap.style.cssText = 'min-width:0;flex:1;';
        const title = document.createElement('div');
        title.textContent = 'Mirror Abyss｜镜渊';
        title.style.cssText = 'font-size:15px;font-weight:750;';
        const subtitle = document.createElement('div');
        subtitle.textContent = '世界书被动映射工作区';
        subtitle.style.cssText = 'margin-top:2px;font-size:11px;color:rgba(255,255,255,.58);';
        titleWrap.append(title, subtitle);
        const closeButton = plainButton('收起');
        closeButton.title = '收起镜渊工作区';
        headingRow.append(titleWrap, closeButton);
        const taskBar = document.createElement('div');
        taskBar.style.cssText = 'display:flex;gap:7px;overflow-x:auto;padding:10px 0 2px;-webkit-overflow-scrolling:touch;';
        taskBar.append(
            this.makeActionButton('审核', () => this.requireAction('audit')(), true, { audit: true }),
            this.makeActionButton('提取', () => this.requireAction('extract')()),
            this.makeActionButton('小总结', () => this.requireAction('smallSummary')()),
            this.makeActionButton('大总结', () => this.requireAction('largeSummary')()),
            this.makeCancelButton(),
        );
        const status = document.createElement('div');
        status.textContent = '就绪；打开工作区后才读取世界书';
        status.setAttribute('aria-live', 'polite');
        status.style.cssText = 'margin-top:8px;min-height:18px;font-size:12px;color:rgba(255,255,255,.72);overflow-wrap:anywhere;';
        this.statusNode = status;
        header.append(headingRow, taskBar, status);
        const tabs = document.createElement('div');
        tabs.setAttribute('role', 'tablist');
        tabs.style.cssText = 'display:flex;gap:6px;overflow-x:auto;padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.025);-webkit-overflow-scrolling:touch;';
        for (const [key, label] of TAB_DEFINITIONS) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.setAttribute('role', 'tab');
            button.dataset.tabKey = key;
            button.style.cssText = tabButtonStyle(key === this.activeTab);
            button.addEventListener('click', () => void this.openTab(key));
            this.tabButtons.set(key, button);
            tabs.append(button);
        }
        const body = document.createElement('div');
        body.style.cssText = 'min-height:280px;padding:12px;';
        for (const [key, label] of TAB_DEFINITIONS) {
            const view = document.createElement('section');
            view.hidden = key !== this.activeTab;
            view.setAttribute('role', 'tabpanel');
            view.setAttribute('aria-label', label);
            this.viewNodes.set(key, view);
            body.append(view);
        }
        panel.append(header, tabs, body);
        root.append(launcher, panel);
        document.body.append(root);
        this.root = root;
        this.launcher = launcher;
        this.panel = panel;
        launcher.addEventListener('click', () => void this.togglePanel());
        closeButton.addEventListener('click', () => this.closePanel());
        this.renderOverview();
        this.renderInformation();
        this.renderKeywords();
        this.renderMatching();
        this.renderSettings();
        this.refresh();
    }
    unmount() {
        if (typeof document !== 'undefined' && this.waitingForDom) {
            document.removeEventListener('DOMContentLoaded', this.onDomReady);
        }
        this.waitingForDom = false;
        this.graphDrag = null;
        this.workspaceLoading = null;
        this.root?.remove();
        this.root = null;
        this.launcher = null;
        this.panel = null;
        this.statusNode = null;
        this.autoInput = null;
        this.auditInput = null;
        this.enabledInput = null;
        this.actionButtons = [];
        this.tabButtons.clear();
        this.viewNodes.clear();
        this.graphViewport = null;
        this.graphCanvas = null;
        this.graphDetail = null;
        this.graphLayout = null;
        this.workspaceRevision = 0;
        this.graphRevision = -1;
        this.busy = false;
        this.workspaceLoaded = false;
        this.workspace = emptyWorkspace();
    }
    async togglePanel() {
        if (!this.panel) return;
        if (!this.panel.hidden) {
            this.closePanel();
            return;
        }
        this.panel.hidden = false;
        this.launcher?.setAttribute('aria-expanded', 'true');
        this.refresh();
        try {
            await this.ensureWorkspaceLoaded();
            if (this.activeTab === 'graph' && !this.panel?.hidden) this.renderGraph();
        }
        catch {
            // ensureWorkspaceLoaded has already exposed the read error in the local status node.
        }
    }
    closePanel() {
        if (!this.panel) return;
        this.panel.hidden = true;
        this.launcher?.setAttribute('aria-expanded', 'false');
        this.graphDrag = null;
        this.graphLayout = null;
        this.workspaceLoadRevision += 1;
        this.workspaceLoading = null;
        this.workspaceLoaded = false;
        this.workspace = emptyWorkspace();
    }
    async openTab(key) {
        if (!this.viewNodes.has(key)) return;
        this.activeTab = key;
        for (const [tabKey, button] of this.tabButtons) {
            const selected = tabKey === key;
            button.style.cssText = tabButtonStyle(selected);
            button.setAttribute('aria-selected', selected ? 'true' : 'false');
        }
        for (const [tabKey, view] of this.viewNodes) view.hidden = tabKey !== key;
        if (key === 'graph') {
            try {
                await this.ensureWorkspaceLoaded();
            }
            catch {
                return;
            }
            if (this.activeTab === 'graph' && !this.panel?.hidden) this.renderGraph(true);
        }
    }
    async ensureWorkspaceLoaded(force = false) {
        if (!force && this.workspaceLoaded) return this.workspace;
        if (this.workspaceLoading) return this.workspaceLoading;
        if (typeof this.actions.loadWorkspace !== 'function') {
            this.workspaceLoaded = true;
            this.setStatus('当前核心未提供 loadWorkspace；工作区以空状态显示', true);
            this.renderDataViews();
            return this.workspace;
        }
        this.setStatus(force ? '正在重新读取世界书…' : '正在读取当前绑定世界书…');
        const loadRevision = this.workspaceLoadRevision;
        const load = Promise.resolve()
            .then(() => this.actions.loadWorkspace())
            .then((raw) => {
            if (!this.root || this.panel?.hidden || loadRevision !== this.workspaceLoadRevision) return this.workspace;
            this.workspace = normalizeWorkspace(raw, this.currentSettings);
            if (this.workspace.settings) this.currentSettings = { ...this.currentSettings, ...this.workspace.settings };
            this.workspaceRevision += 1;
            this.workspaceLoaded = true;
            this.renderDataViews();
            this.setStatus(`世界书映射已读取：${this.workspace.entries.length} 个条目`);
            return this.workspace;
        })
            .catch((error) => {
            this.workspaceLoaded = false;
            this.setStatus(`读取世界书失败：${(0, util_1.errorText)(error)}`, true);
            throw error;
        })
            .finally(() => {
            if (this.workspaceLoading === load) this.workspaceLoading = null;
        });
        this.workspaceLoading = load;
        return load;
    }
    async reloadWorkspace() {
        if (!this.panel || this.panel.hidden) {
            this.workspaceLoaded = false;
            return this.workspace;
        }
        const workspace = await this.ensureWorkspaceLoaded(true);
        if (this.activeTab === 'graph' && !this.panel?.hidden) this.renderGraph();
        return workspace;
    }
    renderDataViews() {
        this.renderOverview();
        this.renderInformation();
        this.renderKeywords();
        this.renderMatching();
        this.renderSettings();
        this.pruneActionButtons();
        this.syncDisabledState();
    }
    refresh() {
        try {
            const settings = this.actions.getSettings?.() ?? this.currentSettings;
            if (settings && typeof settings === 'object') this.currentSettings = { ...this.currentSettings, ...settings };
            if (this.viewNodes.has('settings')) this.renderSettings();
            if (this.viewNodes.has('keywords')) this.renderKeywords();
            this.syncDisabledState();
        }
        catch (error) {
            this.setStatus(`读取设置失败：${(0, util_1.errorText)(error)}`, true);
        }
    }
    setStatus(text, isError = false) {
        if (!this.statusNode) return;
        this.statusNode.textContent = String(text || '');
        this.statusNode.style.color = isError ? '#ffb4b4' : 'rgba(255,255,255,.72)';
    }
    renderOverview() {
        const view = this.viewNodes.get('overview');
        if (!view) return;
        clearNode(view);
        view.append(sectionHeading('总览', '只显示当前已读取世界书的被动映射。'));
        if (!this.workspaceLoaded) {
            view.append(emptyState('首次打开工作区后读取当前绑定世界书。'));
            return;
        }
        const summary = document.createElement('div');
        summary.style.cssText = 'display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px;';
        summary.append(
            pill(`世界书：${this.workspace.worldbookName || '当前绑定'}`),
            pill(`条目：${this.workspace.entries.length}`),
            pill(`处理：${workspaceStatusText(this.workspace)}`),
        );
        view.append(summary);
        if (!this.workspace.entries.length) {
            view.append(emptyState('当前世界书没有可显示条目。'));
            return;
        }
        const list = document.createElement('div');
        list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:9px;';
        for (const entry of this.workspace.entries) {
            const card = document.createElement('article');
            card.style.cssText = cardStyle();
            const heading = document.createElement('button');
            heading.type = 'button';
            heading.textContent = entry.title;
            heading.style.cssText = 'display:block;width:100%;padding:0;border:0;background:transparent;color:#fff;text-align:left;font-size:14px;font-weight:700;cursor:pointer;overflow-wrap:anywhere;';
            heading.addEventListener('click', () => {
                this.selectedEntryUid = entry.uid;
                this.renderInformation();
                void this.openTab('information');
            });
            const keywords = keywordRow(entry.keywords);
            const summaryText = document.createElement('div');
            summaryText.textContent = entry.summary || '暂无摘要';
            summaryText.style.cssText = 'margin-top:8px;color:rgba(255,255,255,.76);font-size:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;';
            const metadata = document.createElement('div');
            metadata.textContent = `${entryStateLabel(entry)} · ${formatUpdatedAt(entry.updatedAt)}`;
            metadata.style.cssText = 'margin-top:8px;font-size:11px;color:rgba(255,255,255,.48);';
            card.append(heading, keywords, summaryText, metadata);
            list.append(card);
        }
        view.append(list);
    }
    renderInformation() {
        const view = this.viewNodes.get('information');
        if (!view) return;
        clearNode(view);
        view.append(sectionHeading('信息表', '关键词与正文信息分区显示；保存后重新读取世界书。'));
        if (!this.workspaceLoaded) {
            view.append(emptyState('尚未读取世界书。'));
            return;
        }
        const entries = this.workspace.entries;
        if (!entries.length) {
            view.append(emptyState('当前没有可编辑条目。'));
            return;
        }
        if (!entries.some((entry) => entry.uid === this.selectedEntryUid)) this.selectedEntryUid = entries[0].uid;
        const layout = document.createElement('div');
        layout.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:10px;';
        const entryList = document.createElement('div');
        entryList.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:520px;overflow:auto;';
        for (const entry of entries) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = entry.title;
            button.style.cssText = `min-height:40px;padding:8px;border:1px solid ${entry.uid === this.selectedEntryUid ? 'rgba(124,194,255,.65)' : 'rgba(255,255,255,.12)'};border-radius:8px;background:${entry.uid === this.selectedEntryUid ? 'rgba(70,139,200,.24)' : 'rgba(255,255,255,.045)'};color:#fff;text-align:left;cursor:pointer;overflow-wrap:anywhere;`;
            button.addEventListener('click', () => {
                this.selectedEntryUid = entry.uid;
                this.renderInformation();
            });
            entryList.append(button);
        }
        const entry = entries.find((item) => item.uid === this.selectedEntryUid);
        const detail = entry ? this.buildEntryEditor(entry) : emptyState('请选择条目。');
        layout.append(entryList, detail);
        view.append(layout);
    }
    buildEntryEditor(entry) {
        const detail = document.createElement('div');
        detail.style.cssText = cardStyle();
        const titleField = fieldControl('条目名称', 'text', entry.title);
        const keywordField = fieldControl('关键词', 'text', entry.keywords.join('、'));
        keywordField.input.placeholder = '只填写关键词，以逗号、顿号或换行分隔';
        const keywordDisplayLabel = document.createElement('div');
        keywordDisplayLabel.textContent = '关键词';
        keywordDisplayLabel.style.cssText = smallLabelStyle();
        const keywords = keywordRow(entry.keywords);
        const sectionsLabel = document.createElement('div');
        sectionsLabel.textContent = '小标题与信息点';
        sectionsLabel.style.cssText = `${smallLabelStyle()}margin-top:12px;`;
        const sections = document.createElement('div');
        sections.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
        const normalizedSections = entry.sections.length ? entry.sections : [{ title: '旧格式保留', points: contentLines(entry.content) }];
        for (const section of normalizedSections) {
            if (!section.points.length) continue;
            const block = document.createElement('div');
            block.style.cssText = 'padding:8px 9px;border-left:3px solid rgba(110,177,233,.72);background:rgba(255,255,255,.035);border-radius:0 7px 7px 0;';
            const heading = document.createElement('div');
            heading.textContent = `【${section.title}】`;
            heading.style.cssText = 'font-size:12px;font-weight:700;color:#bfe2ff;';
            const points = document.createElement('div');
            points.style.cssText = 'margin-top:5px;display:flex;flex-direction:column;gap:4px;';
            for (const point of section.points) {
                const line = document.createElement('div');
                line.textContent = `• ${point}`;
                line.style.cssText = 'font-size:12px;color:rgba(255,255,255,.78);overflow-wrap:anywhere;';
                points.append(line);
            }
            block.append(heading, points);
            sections.append(block);
        }
        if (!sections.children?.length) sections.append(emptyState('正文中没有可解析的信息点。'));
        const contentField = fieldControl('正文编辑', 'textarea', entry.content);
        contentField.input.style.minHeight = '180px';
        const controls = document.createElement('div');
        controls.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;align-items:center;';
        const focusControl = checkControl('玩家焦点', entry.focus);
        const lockedControl = checkControl('手动锁定', entry.locked);
        const saveButton = this.makeActionButton('保存条目', async () => {
            const action = this.requireAction('updateEntry');
            return action(entry.uid, {
                title: String(titleField.input.value ?? '').trim(),
                keywords: splitList(keywordField.input.value),
                content: String(contentField.input.value ?? ''),
            });
        });
        focusControl.input.addEventListener('change', () => void this.runAction('更新玩家焦点', () => this.requireAction('setFocus')(entry.uid, focusControl.input.checked), true));
        lockedControl.input.addEventListener('change', () => void this.runAction('更新手动锁定', () => this.requireAction('setLocked')(entry.uid, lockedControl.input.checked), true));
        controls.append(focusControl.label, lockedControl.label, saveButton);
        detail.append(titleField.label, keywordField.label, keywordDisplayLabel, keywords, sectionsLabel, sections, contentField.label, controls);
        return detail;
    }
    renderKeywords() {
        const view = this.viewNodes.get('keywords');
        if (!view) return;
        clearNode(view);
        view.append(sectionHeading('关键词', '管理名称、近义词、提取范围与建议小标题。'));
        const definitions = Array.isArray(this.currentSettings.keywordDefinitions) ? this.currentSettings.keywordDefinitions : [];
        if (!definitions.length) {
            view.append(emptyState('当前没有关键词模板。可在下方添加自定义关键词。'));
        }
        const list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:9px;';
        definitions.forEach((definition, index) => list.append(this.buildKeywordEditor(definition, index, definitions)));
        view.append(list, this.buildKeywordCreator(definitions));
    }
    buildKeywordEditor(definition, index, definitions) {
        const card = document.createElement('article');
        card.style.cssText = cardStyle();
        const name = fieldControl('关键词名称', 'text', definition.label ?? '');
        const aliases = fieldControl('近义词', 'text', normalizeStringList(definition.aliases).join('、'));
        const description = fieldControl('提取范围', 'textarea', definition.description ?? '');
        description.input.style.minHeight = '58px';
        const fieldLabels = normalizeFieldLabels(definition.fields);
        const subtitles = fieldControl('建议小标题', 'text', fieldLabels.join('、'));
        subtitles.input.placeholder = '用逗号或顿号分隔';
        const compactLabel = document.createElement('div');
        compactLabel.textContent = '当前建议小标题';
        compactLabel.style.cssText = smallLabelStyle();
        const compact = keywordRow(fieldLabels);
        const save = this.makeActionButton('保存关键词', async () => {
            const updated = definitions.map((item, itemIndex) => itemIndex === index
                ? updateKeyword(item, name.input.value, aliases.input.value, description.input.value, subtitles.input.value)
                : item);
            return this.requireAction('configure')({ keywordDefinitions: updated });
        });
        card.append(name.label, aliases.label, description.label, subtitles.label, compactLabel, compact, save);
        return card;
    }
    buildKeywordCreator(definitions) {
        const card = document.createElement('article');
        card.style.cssText = `${cardStyle()}margin-top:10px;border-style:dashed;`;
        const heading = document.createElement('div');
        heading.textContent = '添加自定义关键词';
        heading.style.cssText = 'font-size:13px;font-weight:700;margin-bottom:7px;';
        const name = fieldControl('名称', 'text', '');
        const aliases = fieldControl('近义词', 'text', '');
        const description = fieldControl('提取范围', 'textarea', '');
        const subtitles = fieldControl('建议小标题', 'text', '');
        const add = this.makeActionButton('添加关键词', async () => {
            const label = String(name.input.value ?? '').trim();
            if (!label) throw new Error('关键词名称不能为空');
            if (definitions.some((item) => normalizeLookup(item.label) === normalizeLookup(label))) throw new Error('同名关键词已经存在');
            const created = updateKeyword({ key: safeKey(label), enabled: true, constant: label === '基础设定', vectorized: label !== '基础设定', fields: [] }, label, aliases.input.value, description.input.value, subtitles.input.value);
            return this.requireAction('configure')({ keywordDefinitions: [...definitions, created] });
        });
        card.append(heading, name.label, aliases.label, description.label, subtitles.label, add);
        return card;
    }
    renderMatching() {
        const view = this.viewNodes.get('matching');
        if (!view) return;
        clearNode(view);
        view.append(sectionHeading('匹配', '最近一次处理的只读结果；此页不参与事实判断或提交。'));
        const result = normalizeMatching(this.workspace.matching);
        if (!result.operations.length && !result.rawResult) {
            view.append(emptyState('尚无处理记录。处理后这里会显示“新信息点 → 匹配条目 → 匹配依据 → 最终操作”。'));
            return;
        }
        if (result.rawResult) {
            const raw = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = '模型返回文本';
            summary.style.cssText = 'cursor:pointer;font-size:12px;color:#bfe2ff;';
            const text = document.createElement('pre');
            text.textContent = result.rawResult;
            text.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;padding:8px;background:rgba(0,0,0,.22);border-radius:7px;font-size:11px;color:rgba(255,255,255,.72);';
            raw.append(summary, text);
            view.append(raw);
        }
        if (!result.operations.length) {
            view.append(emptyState('本次处理没有生成世界书操作。'));
            return;
        }
        const list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:9px;';
        for (const operation of result.operations) {
            const row = document.createElement('article');
            row.style.cssText = cardStyle();
            row.append(
                readonlyField('新信息点', operation.information || '—'),
                readonlyField('匹配到的条目', operation.target || '新条目 / 未匹配'),
                readonlyField('匹配依据', operation.evidence || '—'),
                readonlyField('最终操作', OPERATION_LABELS[operation.kind] || operation.kind || '—'),
            );
            list.append(row);
        }
        view.append(list);
    }
    renderGraph(force = false) {
        const view = this.viewNodes.get('graph');
        if (!view || this.activeTab !== 'graph' || this.panel?.hidden) return;
        if (!force && this.graphRevision === this.workspaceRevision && this.graphViewport && belongsTo(this.graphViewport, this.root)) return;
        clearNode(view);
        view.append(sectionHeading('记忆网络', '仅在本页打开时，根据已经读取的世界书条目计算。'));
        if (!this.workspaceLoaded) {
            view.append(emptyState('尚未读取世界书。'));
            return;
        }
        const layout = computeGraph(this.workspace.entries);
        this.graphLayout = layout;
        this.graphRevision = this.workspaceRevision;
        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;gap:7px;flex-wrap:wrap;margin-bottom:8px;';
        const center = plainButton('居中');
        const zoomIn = plainButton('放大');
        const zoomOut = plainButton('缩小');
        const fit = plainButton('适配全部');
        const reset = plainButton('复位');
        toolbar.append(center, zoomIn, zoomOut, fit, reset);
        const viewport = document.createElement('div');
        viewport.style.cssText = 'position:relative;height:min(54vh,470px);min-height:320px;overflow:hidden;border:1px solid rgba(255,255,255,.13);border-radius:9px;background:radial-gradient(circle at center,rgba(80,120,160,.12),rgba(0,0,0,.24));touch-action:none;cursor:grab;user-select:none;';
        const canvas = document.createElement('div');
        canvas.style.cssText = `position:absolute;left:0;top:0;width:${layout.width}px;height:${layout.height}px;transform-origin:0 0;`;
        const svg = createSvg('svg');
        svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
        svg.setAttribute('aria-hidden', 'true');
        svg.style.cssText = `position:absolute;inset:0;width:${layout.width}px;height:${layout.height}px;overflow:visible;pointer-events:none;`;
        for (const edge of layout.edges) {
            const line = createSvg('line');
            line.setAttribute('x1', String(edge.from.x + 70));
            line.setAttribute('y1', String(edge.from.y + 23));
            line.setAttribute('x2', String(edge.to.x + 70));
            line.setAttribute('y2', String(edge.to.y + 23));
            line.setAttribute('stroke', 'rgba(145,196,235,.42)');
            line.setAttribute('stroke-width', '2');
            svg.append(line);
        }
        canvas.append(svg);
        for (const node of layout.nodes) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.graphNode = 'true';
            button.textContent = node.entry.title;
            button.title = `查看 ${node.entry.title}`;
            button.style.cssText = `position:absolute;left:${node.x}px;top:${node.y}px;width:140px;min-height:46px;padding:7px;border:1px solid ${node.entry.focus ? '#ffd37a' : 'rgba(159,207,245,.62)'};border-radius:9px;background:${node.entry.focus ? 'rgba(143,105,31,.94)' : 'rgba(31,63,89,.95)'};color:#fff;font-size:12px;box-shadow:0 3px 10px rgba(0,0,0,.28);cursor:pointer;touch-action:manipulation;overflow:hidden;text-overflow:ellipsis;`;
            button.addEventListener('click', () => this.showGraphEntry(node.entry));
            canvas.append(button);
        }
        viewport.append(canvas);
        const detail = document.createElement('div');
        detail.style.cssText = 'margin-top:9px;';
        detail.append(emptyState('点击节点查看条目。'));
        view.append(toolbar, viewport, detail);
        this.graphViewport = viewport;
        this.graphCanvas = canvas;
        this.graphDetail = detail;
        this.graphTransform = { scale: 1, x: 0, y: 0 };
        center.addEventListener('click', () => this.centerGraph());
        zoomIn.addEventListener('click', () => this.zoomGraph(1.2));
        zoomOut.addEventListener('click', () => this.zoomGraph(1 / 1.2));
        fit.addEventListener('click', () => this.fitGraph());
        reset.addEventListener('click', () => this.resetGraph());
        viewport.addEventListener('pointerdown', (event) => this.beginGraphDrag(event));
        viewport.addEventListener('pointermove', (event) => this.moveGraphDrag(event));
        viewport.addEventListener('pointerup', (event) => this.endGraphDrag(event));
        viewport.addEventListener('pointercancel', (event) => this.endGraphDrag(event));
        viewport.addEventListener('wheel', (event) => {
            event.preventDefault?.();
            this.zoomGraph(Number(event.deltaY) < 0 ? 1.1 : 1 / 1.1);
        });
        this.fitGraph();
    }
    beginGraphDrag(event) {
        if (!this.graphViewport || event?.target?.dataset?.graphNode === 'true') return;
        if (event?.button !== undefined && event.button !== 0) return;
        this.graphDrag = {
            pointerId: event?.pointerId,
            startX: Number(event?.clientX) || 0,
            startY: Number(event?.clientY) || 0,
            baseX: this.graphTransform.x,
            baseY: this.graphTransform.y,
        };
        this.graphViewport.style.cursor = 'grabbing';
        this.graphViewport.setPointerCapture?.(event?.pointerId);
    }
    moveGraphDrag(event) {
        if (!this.graphDrag) return;
        if (this.graphDrag.pointerId !== undefined && event?.pointerId !== undefined && event.pointerId !== this.graphDrag.pointerId) return;
        this.graphTransform.x = this.graphDrag.baseX + (Number(event?.clientX) || 0) - this.graphDrag.startX;
        this.graphTransform.y = this.graphDrag.baseY + (Number(event?.clientY) || 0) - this.graphDrag.startY;
        this.applyGraphTransform();
    }
    endGraphDrag(event) {
        if (!this.graphDrag) return;
        this.graphViewport?.releasePointerCapture?.(event?.pointerId);
        if (this.graphViewport) this.graphViewport.style.cursor = 'grab';
        this.graphDrag = null;
    }
    zoomGraph(multiplier) {
        if (!this.graphCanvas) return;
        this.graphTransform.scale = clamp(this.graphTransform.scale * multiplier, 0.25, 2.5);
        this.applyGraphTransform();
    }
    centerGraph() {
        if (!this.graphViewport || !this.graphLayout) return;
        const width = Number(this.graphViewport.clientWidth) || 760;
        const height = Number(this.graphViewport.clientHeight) || 420;
        this.graphTransform.x = (width - this.graphLayout.width * this.graphTransform.scale) / 2;
        this.graphTransform.y = (height - this.graphLayout.height * this.graphTransform.scale) / 2;
        this.applyGraphTransform();
    }
    fitGraph() {
        if (!this.graphViewport || !this.graphLayout) return;
        const width = Math.max(240, Number(this.graphViewport.clientWidth) || 760);
        const height = Math.max(240, Number(this.graphViewport.clientHeight) || 420);
        const scale = Math.min((width - 32) / this.graphLayout.width, (height - 32) / this.graphLayout.height, 1.25);
        this.graphTransform.scale = clamp(scale, 0.25, 1.25);
        this.centerGraph();
    }
    resetGraph() {
        this.graphTransform = { scale: 1, x: 0, y: 0 };
        this.applyGraphTransform();
    }
    applyGraphTransform() {
        if (!this.graphCanvas) return;
        this.graphCanvas.style.transform = `translate(${this.graphTransform.x}px,${this.graphTransform.y}px) scale(${this.graphTransform.scale})`;
    }
    showGraphEntry(entry) {
        if (!this.graphDetail) return;
        clearNode(this.graphDetail);
        const card = document.createElement('article');
        card.style.cssText = cardStyle();
        const title = document.createElement('div');
        title.textContent = entry.title;
        title.style.cssText = 'font-size:14px;font-weight:700;';
        card.append(title, keywordRow(entry.keywords));
        for (const section of entry.sections.slice(0, 4)) {
            if (!section.points.length) continue;
            const block = document.createElement('div');
            block.textContent = `【${section.title}】${section.points.join('；')}`;
            block.style.cssText = 'margin-top:7px;font-size:12px;color:rgba(255,255,255,.76);overflow-wrap:anywhere;';
            card.append(block);
        }
        const open = plainButton('在信息表中打开');
        open.style.marginTop = '9px';
        open.addEventListener('click', () => {
            this.selectedEntryUid = entry.uid;
            this.renderInformation();
            void this.openTab('information');
        });
        card.append(open);
        this.graphDetail.append(card);
    }
    renderSettings() {
        const view = this.viewNodes.get('settings');
        if (!view) return;
        clearNode(view);
        this.settingInputs = {};
        view.append(sectionHeading('设置', '只暴露玩家需要的开关、连接、规则、频率与世界书维护。'));
        const settings = this.currentSettings ?? {};
        const switches = document.createElement('div');
        switches.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:10px;';
        const enabled = checkControl('插件功能', settings.enabled !== false);
        const auto = checkControl('自动处理', settings.autoProcess === true);
        const audit = checkControl('审核开关', settings.auditEnabled === true);
        this.enabledInput = enabled.input;
        this.autoInput = auto.input;
        this.auditInput = audit.input;
        enabled.input.addEventListener('change', () => void this.saveSwitch('enabled', enabled.input.checked, '插件功能'));
        auto.input.addEventListener('change', () => void this.saveSwitch('autoProcess', auto.input.checked, '自动处理'));
        audit.input.addEventListener('change', () => void this.saveSwitch('auditEnabled', audit.input.checked, '审核'));
        switches.append(enabled.label, auto.label, audit.label);
        const profiles = document.createElement('div');
        profiles.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;';
        for (const [key, label] of PROFILE_FIELDS) {
            const field = fieldControl(label, 'text', settings[key] ?? '');
            field.input.placeholder = '留空使用当前连接';
            this.settingInputs[key] = field.input;
            profiles.append(field.label);
        }
        const auditPrompt = fieldControl('审核规则', 'textarea', settings.auditPrompt ?? '');
        auditPrompt.input.style.minHeight = '92px';
        const extractionPrompt = fieldControl('提取补充要求', 'textarea', settings.extractionPrompt ?? '');
        extractionPrompt.input.style.minHeight = '92px';
        const frequencies = document.createElement('div');
        frequencies.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;';
        const small = fieldControl('小总结触发回合数', 'number', settings.smallSummaryTurns ?? 10);
        small.input.min = '1';
        const large = fieldControl('大总结触发小总结数', 'number', settings.largeSummaryCount ?? 4);
        large.input.min = '1';
        const worldbook = fieldControl('指定世界书', 'text', settings.targetLorebook ?? '');
        worldbook.input.placeholder = '留空使用当前聊天绑定世界书';
        frequencies.append(small.label, large.label);
        this.settingInputs.auditPrompt = auditPrompt.input;
        this.settingInputs.extractionPrompt = extractionPrompt.input;
        this.settingInputs.smallSummaryTurns = small.input;
        this.settingInputs.largeSummaryCount = large.input;
        this.settingInputs.targetLorebook = worldbook.input;
        const save = this.makeActionButton('保存设置', async () => {
            const patch = {
                enabled: this.enabledInput?.checked === true,
                autoProcess: this.autoInput?.checked === true,
                auditEnabled: this.auditInput?.checked === true,
                auditPrompt: String(this.settingInputs.auditPrompt?.value ?? ''),
                extractionPrompt: String(this.settingInputs.extractionPrompt?.value ?? ''),
                smallSummaryTurns: positiveInteger(this.settingInputs.smallSummaryTurns?.value, 10),
                largeSummaryCount: positiveInteger(this.settingInputs.largeSummaryCount?.value, 4),
                targetLorebook: String(this.settingInputs.targetLorebook?.value ?? '').trim(),
            };
            for (const [key] of PROFILE_FIELDS) patch[key] = String(this.settingInputs[key]?.value ?? '').trim();
            const result = await this.requireAction('configure')(patch);
            this.currentSettings = { ...this.currentSettings, ...patch, ...(result && typeof result === 'object' ? result : {}) };
            return result;
        });
        const maintenance = document.createElement('div');
        maintenance.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1);';
        const migrate = this.makeActionButton('整理世界书格式', () => this.callFirstAction(['migrate', 'migrateWorldbook', 'organizeWorldbook', 'formatWorldbook']));
        const undo = this.makeActionButton('撤销上次整理', () => this.callFirstAction(['undoMigration', 'undoWorldbookMigration', 'undoWorldbookFormat']));
        maintenance.append(migrate, undo);
        view.append(switches, profiles, auditPrompt.label, extractionPrompt.label, frequencies, worldbook.label, save, maintenance);
    }
    makeActionButton(label, action, reload = true, metadata = {}) {
        const button = plainButton(label);
        if (metadata.audit) button.dataset.auditAction = 'true';
        button.addEventListener('click', () => void this.runAction(label, action, reload));
        this.actionButtons.push(button);
        return button;
    }
    makeCancelButton() {
        const button = plainButton('取消任务');
        button.dataset.cancelAction = 'true';
        button.addEventListener('click', () => void this.runCancel());
        this.actionButtons.push(button);
        return button;
    }
    async saveSwitch(key, value, label) {
        try {
            const result = await this.requireAction('configure')({ [key]: value });
            this.currentSettings = { ...this.currentSettings, [key]: value, ...(result && typeof result === 'object' ? result : {}) };
            await this.reloadWorkspace();
            this.setStatus(`${label}已${value ? '开启' : '关闭'}`);
            this.refresh();
        }
        catch (error) {
            this.setStatus(`${label}设置失败：${(0, util_1.errorText)(error)}`, true);
            this.refresh();
        }
    }
    async runAction(label, action, reload = true) {
        if (this.busy) return;
        this.busy = true;
        this.syncDisabledState();
        this.setStatus(`${label}中…`);
        try {
            const result = await action();
            if (reload) await this.reloadWorkspace();
            this.setStatus(`${label}完成`);
            notify('success', `镜渊：${label}完成`);
            return result;
        }
        catch (error) {
            const text = (0, util_1.errorText)(error);
            this.setStatus(`${label}失败：${text}`, true);
            notify('error', `镜渊：${label}失败：${text}`);
            return undefined;
        }
        finally {
            this.busy = false;
            this.refresh();
            this.syncDisabledState();
        }
    }
    async runCancel() {
        try {
            const action = this.requireAction('cancel');
            await action();
            this.setStatus('已请求取消当前任务');
        }
        catch (error) {
            this.setStatus(`取消失败：${(0, util_1.errorText)(error)}`, true);
        }
    }
    syncDisabledState() {
        const auditEnabled = this.auditInput?.checked === true;
        this.pruneActionButtons();
        for (const button of this.actionButtons) {
            const cancel = button.dataset?.cancelAction === 'true';
            const disabled = (!cancel && this.busy) || (button.dataset?.auditAction === 'true' && !auditEnabled);
            button.disabled = disabled;
            button.style.opacity = disabled ? '.48' : '1';
            button.style.cursor = disabled ? 'not-allowed' : 'pointer';
        }
        if (this.autoInput) this.autoInput.disabled = this.busy;
        if (this.auditInput) this.auditInput.disabled = this.busy;
        if (this.enabledInput) this.enabledInput.disabled = this.busy;
    }
    pruneActionButtons() {
        this.actionButtons = this.actionButtons.filter((button) => belongsTo(button, this.root));
    }
    requireAction(name) {
        const action = this.actions?.[name];
        if (typeof action !== 'function') throw new Error(`当前核心未提供 ${name} 操作`);
        return action.bind(this.actions);
    }
    callFirstAction(names) {
        for (const name of names) {
            const action = this.actions?.[name];
            if (typeof action === 'function') return action.call(this.actions);
        }
        throw new Error(`当前核心未提供 ${names.join(' / ')} 操作`);
    }
}
exports.ControlPanel = ControlPanel;
function emptyWorkspace() {
    return { entries: [], worldbookName: '', matching: null, status: '', settings: null };
}
function normalizeWorkspace(raw, fallbackSettings) {
    const source = Array.isArray(raw) ? { entries: raw } : (raw && typeof raw === 'object' ? raw : {});
    const entries = Array.isArray(source.entries)
        ? source.entries
        : Array.isArray(source.worldbookEntries)
            ? source.worldbookEntries
            : [];
    return {
        entries: entries.map((entry, index) => normalizeEntry(entry, index)),
        worldbookName: String(source.worldbookName ?? source.name ?? fallbackSettings?.targetLorebook ?? ''),
        matching: source.matching ?? source.lastMatching ?? source.lastMatch ?? source.matchResult ?? source.memoryStatus ?? null,
        status: source.status ?? '',
        settings: source.settings && typeof source.settings === 'object' ? source.settings : null,
    };
}
function normalizeEntry(raw, index) {
    const entry = raw && typeof raw === 'object' ? raw : {};
    const uid = String(entry.uid ?? entry.entryId ?? entry.id ?? index);
    const content = String(entry.content ?? entry.text ?? '');
    const title = String(entry.title ?? entry.comment ?? entry.name ?? `未命名条目 ${index + 1}`).trim() || `未命名条目 ${index + 1}`;
    const keywords = normalizeStringList(entry.keywords ?? entry.key);
    const sections = normalizeSections(entry.sections, content);
    const references = normalizeReferences(entry.references, sections);
    return {
        ...entry,
        uid,
        title,
        name: String(entry.name ?? splitEntryTitle(title).name),
        content,
        keywords,
        sections,
        references,
        summary: String(entry.summary ?? firstInformationPoint(sections) ?? ''),
        focus: entry.focus === true || entry.isFocus === true,
        locked: entry.locked === true || entry.isLocked === true,
        constant: entry.constant === true || entry.activation?.constant === true,
        enabled: entry.enabled !== false && entry.disable !== true && entry.activation?.disabled !== true,
        updatedAt: Number(entry.updatedAt ?? entry.extensions?.mirror_abyss?.updatedAt ?? 0) || 0,
    };
}
function normalizeSections(value, content) {
    const output = [];
    if (value && typeof value === 'object' && !Array.isArray(value) && value.values && typeof value.values === 'object') {
        const order = Array.isArray(value.order) ? value.order : Object.keys(value.values);
        for (const title of [...new Set([...order, ...Object.keys(value.values)])]) {
            const points = normalizeStringList(value.values[title]);
            if (points.length) output.push({ title: String(title), points });
        }
    }
    else if (value instanceof Map) {
        for (const [title, points] of value) output.push({ title: String(title), points: normalizeStringList(points) });
    }
    else if (Array.isArray(value)) {
        for (const section of value) {
            if (section && typeof section === 'object') {
                output.push({
                    title: String(section.title ?? section.heading ?? section.name ?? '未分类').trim() || '未分类',
                    points: normalizeStringList(section.points ?? section.lines ?? section.items),
                });
            }
        }
    }
    else if (value && typeof value === 'object') {
        for (const [title, points] of Object.entries(value)) output.push({ title, points: normalizeStringList(points) });
    }
    if (output.some((section) => section.points.length)) return output.filter((section) => section.points.length);
    return parseContentSections(content);
}
function parseContentSections(content) {
    const sections = [];
    let current = null;
    const preface = [];
    for (const rawLine of String(content ?? '').replace(/\r/g, '').split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        const heading = line.match(/^【\s*([^】]+?)\s*】$/u);
        if (heading) {
            current = { title: heading[1].trim(), points: [] };
            sections.push(current);
            continue;
        }
        const point = line.replace(/^\s*(?:[-*•·]|\d+[.)、])\s*/u, '').trim();
        if (!point) continue;
        if (current) current.points.push(point);
        else preface.push(point);
    }
    if (preface.length) sections.unshift({ title: '旧格式保留', points: preface });
    return sections.filter((section) => section.points.length);
}
function normalizeReferences(value, sections) {
    const output = [];
    const raw = Array.isArray(value) ? value : value ? [value] : [];
    for (const item of raw) {
        if (item && typeof item === 'object') output.push(String(item.uid ?? item.targetUid ?? item.title ?? item.name ?? '').trim());
        else output.push(String(item ?? '').trim());
    }
    for (const section of sections) {
        if (!/关联|关系对象|相关条目/u.test(section.title)) continue;
        for (const point of section.points) output.push(...splitList(point.replace(/[（(].*?[）)]/gu, '')));
    }
    return [...new Set(output.filter(Boolean))];
}
function computeGraph(entries) {
    const nodes = [];
    const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, entries.length) * 1.4)));
    const rows = Math.max(1, Math.ceil(entries.length / columns));
    const width = Math.max(520, columns * 180 + 60);
    const height = Math.max(360, rows * 105 + 70);
    entries.forEach((entry, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        nodes.push({ entry, x: 40 + column * 180, y: 36 + row * 105 });
    });
    const lookup = new Map();
    for (const node of nodes) {
        for (const value of [node.entry.uid, node.entry.title, node.entry.name]) {
            const key = normalizeLookup(value);
            if (key && !lookup.has(key)) lookup.set(key, node);
        }
    }
    const edges = [];
    const seen = new Set();
    for (const from of nodes) {
        for (const reference of from.entry.references) {
            const to = lookup.get(normalizeLookup(reference));
            if (!to || to === from) continue;
            const key = [from.entry.uid, to.entry.uid].sort().join('|');
            if (seen.has(key)) continue;
            seen.add(key);
            edges.push({ from, to });
        }
    }
    return { nodes, edges, width, height };
}
function normalizeMatching(value) {
    const source = value && typeof value === 'object' ? value : {};
    const plan = source.plan && typeof source.plan === 'object' ? source.plan : source;
    const rawOperations = Array.isArray(plan.operations) ? plan.operations : [];
    return {
        rawResult: String(source.rawResult ?? source.raw ?? ''),
        operations: rawOperations.map((operation) => ({
            information: String(operation.newValue ?? operation.information ?? operation.value ?? operation.line ?? ''),
            target: String(operation.targetTitle ?? operation.title ?? operation.targetUid ?? ''),
            evidence: evidenceText(operation.matchEvidence ?? operation.evidence ?? operation.reason ?? operation.matchBasis),
            kind: String(operation.operation ?? operation.kind ?? ''),
        })),
    };
}
function evidenceText(value) {
    if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('；');
    if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}:${String(item)}`).join('；');
    return String(value ?? '');
}
function sectionHeading(titleText, descriptionText) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom:10px;';
    const title = document.createElement('h3');
    title.textContent = titleText;
    title.style.cssText = 'margin:0;font-size:15px;';
    const description = document.createElement('div');
    description.textContent = descriptionText;
    description.style.cssText = 'margin-top:3px;font-size:11px;color:rgba(255,255,255,.56);';
    wrapper.append(title, description);
    return wrapper;
}
function fieldControl(labelText, type, value) {
    const label = document.createElement('label');
    label.style.cssText = 'display:block;margin-bottom:8px;font-size:12px;color:rgba(255,255,255,.68);';
    const caption = document.createElement('span');
    caption.textContent = labelText;
    caption.style.cssText = 'display:block;margin-bottom:4px;';
    const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type;
    input.value = String(value ?? '');
    input.style.cssText = 'box-sizing:border-box;width:100%;min-height:40px;padding:8px;border:1px solid rgba(255,255,255,.15);border-radius:7px;background:rgba(0,0,0,.22);color:#fff;font:inherit;resize:vertical;';
    label.append(caption, input);
    return { label, input };
}
function checkControl(text, checked) {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:7px;min-height:40px;padding:7px 8px;border:1px solid rgba(255,255,255,.12);border-radius:8px;font-size:13px;cursor:pointer;user-select:none;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked === true;
    input.style.cssText = 'margin:0;';
    const caption = document.createElement('span');
    caption.textContent = text;
    label.append(input, caption);
    return { label, input };
}
function readonlyField(labelText, value) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:grid;grid-template-columns:minmax(84px,130px) minmax(0,1fr);gap:8px;padding:4px 0;font-size:12px;';
    const label = document.createElement('div');
    label.textContent = labelText;
    label.style.cssText = 'color:rgba(255,255,255,.5);';
    const text = document.createElement('div');
    text.textContent = value;
    text.style.cssText = 'color:rgba(255,255,255,.82);overflow-wrap:anywhere;';
    wrapper.append(label, text);
    return wrapper;
}
function keywordRow(values) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;';
    const keywords = normalizeStringList(values);
    if (!keywords.length) {
        const empty = document.createElement('span');
        empty.textContent = '无关键词';
        empty.style.cssText = 'font-size:11px;color:rgba(255,255,255,.4);';
        row.append(empty);
        return row;
    }
    for (const keyword of keywords) {
        const tag = document.createElement('span');
        tag.textContent = keyword;
        tag.style.cssText = 'display:inline-flex;align-items:center;min-height:22px;padding:1px 7px;border-radius:999px;background:rgba(88,151,202,.18);border:1px solid rgba(125,190,242,.26);font-size:11px;color:#cbe9ff;';
        row.append(tag);
    }
    return row;
}
function pill(text) {
    const node = document.createElement('span');
    node.textContent = text;
    node.style.cssText = 'display:inline-flex;align-items:center;min-height:25px;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.07);font-size:11px;color:rgba(255,255,255,.72);';
    return node;
}
function emptyState(text) {
    const node = document.createElement('div');
    node.textContent = text;
    node.style.cssText = 'padding:18px 12px;border:1px dashed rgba(255,255,255,.15);border-radius:8px;text-align:center;font-size:12px;color:rgba(255,255,255,.48);';
    return node;
}
function plainButton(label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = 'min-height:44px;padding:6px 10px;border:1px solid rgba(255,255,255,.17);border-radius:8px;background:rgba(255,255,255,.08);color:#fff;font-size:12px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;white-space:nowrap;';
    return button;
}
function createSvg(tag) {
    if (typeof document.createElementNS === 'function') return document.createElementNS('http://www.w3.org/2000/svg', tag);
    return document.createElement(tag);
}
function clearNode(node) {
    if (!node) return;
    if (Array.isArray(node.children)) {
        for (const child of [...node.children]) child.remove?.();
        return;
    }
    while (node.firstChild) node.removeChild(node.firstChild);
}
function belongsTo(node, root) {
    if (!node || !root) return false;
    let current = node;
    while (current) {
        if (current === root) return true;
        current = current.parentNode;
    }
    return false;
}
function normalizeStringList(value) {
    if (Array.isArray(value)) return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))];
    if (value instanceof Set) return normalizeStringList([...value]);
    return splitList(value);
}
function splitList(value) {
    return [...new Set(String(value ?? '').split(/[\n,，、;；|]+/u).map((item) => item.trim()).filter(Boolean))];
}
function contentLines(value) {
    return String(value ?? '').replace(/\r/g, '').split('\n').map((line) => line.replace(/^\s*(?:[-*•·]|\d+[.)、])\s*/u, '').trim()).filter((line) => line && !/^【[^】]+】$/u.test(line));
}
function firstInformationPoint(sections) {
    for (const section of sections) if (section.points.length) return section.points[0];
    return '';
}
function splitEntryTitle(title) {
    const parts = String(title ?? '').split(/[｜|]/u);
    return parts.length > 1 ? { type: parts[0].trim(), name: parts.slice(1).join('｜').trim() } : { type: '', name: String(title ?? '').trim() };
}
function normalizeLookup(value) {
    return String(value ?? '').normalize?.('NFKC').toLocaleLowerCase().replace(/[\s｜|:：_\-—·•"'“”‘’《》【】()[\]{}]/gu, '') || '';
}
function normalizeFieldLabels(fields) {
    if (!Array.isArray(fields)) return [];
    return [...new Set(fields.map((field) => typeof field === 'string' ? field : field?.label ?? field?.name ?? '').map((value) => String(value).trim()).filter(Boolean))];
}
function updateKeyword(original, labelValue, aliasesValue, descriptionValue, subtitlesValue) {
    const label = String(labelValue ?? '').trim();
    if (!label) throw new Error('关键词名称不能为空');
    const labels = splitList(subtitlesValue);
    const existing = Array.isArray(original.fields) ? original.fields : [];
    const fields = labels.map((fieldLabel) => {
        const found = existing.find((field) => typeof field === 'object' && String(field.label ?? '').trim() === fieldLabel);
        return found ? { ...found, label: fieldLabel } : { key: safeKey(fieldLabel), label: fieldLabel, policy: 'semantic-upsert', options: [] };
    });
    return {
        ...original,
        key: String(original.key ?? '').trim() || safeKey(label),
        label,
        aliases: splitList(aliasesValue),
        description: String(descriptionValue ?? '').trim(),
        enabled: original.enabled !== false,
        fields,
    };
}
function safeKey(value) {
    const normalized = String(value ?? '').normalize?.('NFKC').toLocaleLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-+|-+$/gu, '');
    return normalized || `custom-${Date.now()}`;
}
function positiveInteger(value, fallback) {
    const number = Math.round(Number(value));
    return Number.isFinite(number) && number > 0 ? number : fallback;
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || min));
}
function formatUpdatedAt(value) {
    if (!value) return '更新时间未知';
    try {
        return `更新于 ${new Date(value).toLocaleString()}`;
    }
    catch {
        return '更新时间未知';
    }
}
function entryStateLabel(entry) {
    const labels = [];
    if (entry.focus) labels.push('焦点');
    if (entry.locked) labels.push('锁定');
    if (entry.constant && !entry.focus) labels.push('常驻');
    if (!entry.enabled) labels.push('非活跃');
    return labels.join(' / ') || '普通';
}
function workspaceStatusText(workspace) {
    if (typeof workspace.status === 'string' && workspace.status.trim()) return workspace.status.trim();
    if (workspace.status && typeof workspace.status === 'object') return String(workspace.status.detail ?? workspace.status.phase ?? '就绪');
    return '就绪';
}
function cardStyle() {
    return 'box-sizing:border-box;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:rgba(255,255,255,.04);overflow:hidden;';
}
function smallLabelStyle() {
    return 'display:block;margin-bottom:4px;font-size:11px;color:rgba(255,255,255,.5);';
}
function tabButtonStyle(selected) {
    return `flex:0 0 auto;min-height:44px;padding:6px 11px;border:1px solid ${selected ? 'rgba(126,194,247,.56)' : 'rgba(255,255,255,.12)'};border-radius:8px;background:${selected ? 'rgba(68,133,187,.28)' : 'rgba(255,255,255,.04)'};color:${selected ? '#d9efff' : 'rgba(255,255,255,.68)'};font-size:12px;font-weight:${selected ? '700' : '500'};cursor:pointer;touch-action:manipulation;white-space:nowrap;`;
}
function notify(kind, message) {
    const toast = globalThis.toastr?.[kind];
    if (typeof toast === 'function') toast(message);
    else console[kind === 'error' ? 'error' : 'info'](`[MirrorAbyss] ${message}`);
}

},
"domain/entry-section":function(module,exports,require){
"use strict";
const { canonicalSectionName, parseEntrySections, serializeEntrySections } = require("../parser");
exports.canonicalSectionName = canonicalSectionName;
exports.parseEntrySections = parseEntrySections;
exports.serializeEntrySections = serializeEntrySections;

},
"domain/focus":function(module,exports,require){
"use strict";
exports.normalizeFocusUid = (value) => String(value ?? "").trim();
exports.isFocused = (entry, focusUid) => String(entry?.uid ?? "") === String(focusUid ?? "");

},
"domain/information-point":function(module,exports,require){
"use strict";
const { parseInformationPoints, normalizePointLine } = require("../parser");
exports.parseInformationPoints = parseInformationPoints;
exports.normalizeInformationPoint = normalizePointLine;

},
"domain/operation":function(module,exports,require){
"use strict";
module.exports = require("../operations");

},
"domain/protection-rules":function(module,exports,require){
"use strict";
exports.isProtectedEntry = (entry, focusUid, foundationKeywords = []) => {
    const keywords = new Set((entry?.keywords ?? []).map((item) => String(item).trim()));
    return Boolean(entry?.locked || entry?.focus || String(entry?.uid ?? "") === String(focusUid ?? "")
        || foundationKeywords.some((keyword) => keywords.has(String(keyword).trim())));
};

},
"host":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HostAdapter = void 0;
const constants_1 = require("./constants");
const util_1 = require("./util");
class HostAdapter {
    constructor() {
        this.runtimeSessionId = randomId();
        this.scopeRevisions = new Map();
        this.internalMessageMutations = new Map();
    }
    context() {
        const context = globalThis.SillyTavern?.getContext?.();
        if (!context) throw new Error('SillyTavern 上下文尚未就绪');
        return context;
    }
    chatKey() {
        const context = this.context();
        const chatId = context.getCurrentChatId?.() ?? context.chatId ?? context.chat_metadata?.chat_id;
        if (chatId === null || chatId === undefined || String(chatId) === '') return '';
        const scope = context.groupId !== null && context.groupId !== undefined
            ? `group:${context.groupId}`
            : `character:${context.characterId ?? context.name2 ?? 'unknown'}`;
        return `${scope}:${(0, util_1.hashText)(`${scope}|${chatId}`)}`;
    }
    roleKey() {
        const context = this.context();
        return context.groupId !== null && context.groupId !== undefined
            ? `group:${context.groupId}`
            : `character:${context.characterId ?? context.name2 ?? 'unknown'}`;
    }
    targetWorldbookName(settings) {
        const context = this.context();
        const assigned = String(settings.targetLorebook || context.chatMetadata?.world_info || context.chat_metadata?.world_info || '').trim();
        if (assigned || !settings.autoCreateLorebook) return assigned;
        const display = (0, util_1.safeId)(context.name2 || context.name1 || 'Chat') || 'Chat';
        return `MA_${display}`;
    }
    settingsSignature(settings) {
        return (0, util_1.hashText)(JSON.stringify({
            modelSource: settings.modelSource,
            modelProfileId: settings.modelProfileId,
            auditProfileId: settings.auditProfileId,
            revisionProfileId: settings.revisionProfileId,
            extractionProfileId: settings.extractionProfileId,
            smallSummaryProfileId: settings.smallSummaryProfileId,
            largeSummaryProfileId: settings.largeSummaryProfileId,
            migrationProfileId: settings.migrationProfileId,
            responseTokens: settings.responseTokens,
            requestTimeoutMs: settings.requestTimeoutMs,
            targetLorebook: settings.targetLorebook,
            auditEnabled: settings.auditEnabled,
            auditPrompt: settings.auditPrompt,
            revisionPrompt: settings.revisionPrompt,
            extractionPrompt: settings.extractionPrompt,
            smallSummaryPrompt: settings.smallSummaryPrompt,
            largeSummaryPrompt: settings.largeSummaryPrompt,
            smallSummaryTurns: settings.smallSummaryTurns,
            largeSummaryCount: settings.largeSummaryCount,
            keywordDefinitions: settings.keywordDefinitions,
            sectionPolicies: settings.sectionPolicies,
            duplicateSimilarity: settings.duplicateSimilarity,
            chainDuplicateSimilarity: settings.chainDuplicateSimilarity,
            bodyMatchThreshold: settings.bodyMatchThreshold,
            matchWeights: settings.matchWeights,
            connectionState: this.connectionStateSignature(settings),
        }));
    }
    connectionStateSignature(settings) {
        const context = this.context();
        const ids = (0, util_1.unique)([
            settings.auditProfileId,
            settings.revisionProfileId,
            settings.extractionProfileId,
            settings.smallSummaryProfileId,
            settings.largeSummaryProfileId,
            settings.migrationProfileId,
        ]);
        const service = context.ConnectionManagerRequestService;
        const profiles = ids.map((id) => {
            try { return [id, sanitizeConnectionValue(service?.getProfile?.(id))]; }
            catch { return [id, null]; }
        });
        return {
            mainApi: String(context.mainApi ?? context.main_api ?? ''),
            chatCompletionSource: String(context.chatCompletionSettings?.source ?? context.chat_completion_source ?? ''),
            chatCompletionModel: String(context.chatCompletionSettings?.model ?? context.chat_completion_model ?? ''),
            textGenerationType: String(context.textgenerationwebui_settings?.type ?? ''),
            profiles,
        };
    }
    bumpScopeRevision(chatKey = this.chatKey()) {
        if (!chatKey) return 0;
        const next = (this.scopeRevisions.get(chatKey) ?? 0) + 1;
        this.scopeRevisions.set(chatKey, next);
        return next;
    }
    scopeRevision(chatKey = this.chatKey()) { return this.scopeRevisions.get(chatKey) ?? 0; }
    captureSnapshot(settings, requestedIndex, taskType, token) {
        const turn = this.latestTurn(requestedIndex);
        const context = this.context();
        return {
            ...turn,
            runtimeSessionId: this.runtimeSessionId,
            chatInstance: context.chat,
            roleKey: this.roleKey(),
            scopeRevision: this.scopeRevision(turn.chatKey),
            worldbookName: this.targetWorldbookName(settings),
            settingsSignature: this.settingsSignature(settings),
            taskId: randomId(),
            taskType,
            token,
        };
    }
    captureMaintenanceSnapshot(settings, taskType, token) {
        const context = this.context();
        const chatKey = this.chatKey();
        if (!chatKey)
            throw new Error('当前没有活动聊天');
        return {
            maintenance: true,
            chatKey,
            messageIndex: -1,
            messageKey: `maintenance:${taskType}`,
            assistantText: '',
            playerText: '',
            contentHash: '',
            runtimeSessionId: this.runtimeSessionId,
            chatInstance: context.chat,
            roleKey: this.roleKey(),
            scopeRevision: this.scopeRevision(chatKey),
            worldbookName: this.targetWorldbookName(settings),
            settingsSignature: this.settingsSignature(settings),
            taskId: randomId(),
            taskType,
            token,
        };
    }
    assertSnapshot(snapshot, currentSettings) {
        if (!snapshot) throw new Error('任务快照不存在');
        if (snapshot.token?.cancelled) throw new Error(snapshot.token.reason || '任务已取消');
        if (snapshot.runtimeSessionId !== this.runtimeSessionId) throw new Error('运行会话已经变化，旧任务作废');
        if (this.chatKey() !== snapshot.chatKey) throw new Error('聊天已经切换，旧任务作废');
        const context = this.context();
        if (context.chat !== snapshot.chatInstance) throw new Error('聊天实例已经变化，旧任务作废');
        if (this.roleKey() !== snapshot.roleKey) throw new Error('当前角色或群组已经变化，旧任务作废');
        if (this.scopeRevision(snapshot.chatKey) !== snapshot.scopeRevision) throw new Error('聊天作用域版本已经变化，旧任务作废');
        let turn = snapshot;
        if (!snapshot.maintenance) {
            turn = this.latestTurn();
            if (turn.messageIndex !== snapshot.messageIndex)
                throw new Error('当前最新 AI 正文已经变化，旧任务作废');
            if (turn.messageKey !== snapshot.messageKey || turn.contentHash !== snapshot.contentHash) throw new Error('正文版本已经变化，旧任务作废');
            if (turn.playerText !== snapshot.playerText)
                throw new Error('与正文直接相关的玩家输入已经变化，旧任务作废');
        }
        if (currentSettings) {
            if (this.targetWorldbookName(currentSettings) !== snapshot.worldbookName) throw new Error('目标世界书已经变化，旧任务作废');
            if (this.settingsSignature(currentSettings) !== snapshot.settingsSignature) throw new Error('模型或任务设置已经变化，旧任务作废');
        }
        return turn;
    }
    refreshSnapshot(snapshot, turn, currentSettings) {
        return {
            ...snapshot,
            ...turn,
            chatInstance: this.context().chat,
            roleKey: this.roleKey(),
            worldbookName: this.targetWorldbookName(currentSettings),
            settingsSignature: this.settingsSignature(currentSettings),
            scopeRevision: this.scopeRevision(turn.chatKey),
        };
    }
    subscribe(eventName, handler, required = false) {
        const context = this.context();
        const events = context.eventTypes ?? context.event_types ?? {};
        const event = events[eventName];
        if (!event) {
            if (required) throw new Error(`SillyTavern 未提供事件 ${eventName}`);
            return () => undefined;
        }
        context.eventSource.on(event, handler);
        return () => {
            if (typeof context.eventSource.off === 'function') context.eventSource.off(event, handler);
            else context.eventSource.removeListener?.(event, handler);
        };
    }
    consumeInternalScopeEvent(eventName, eventValue) {
        if (eventName !== 'MESSAGE_EDITED' || !this.internalMessageMutations.size)
            return false;
        const chat = this.context().chat ?? [];
        const eventIndex = messageIndexFromEvent(eventValue);
        const currentChatFingerprint = Number.isInteger(eventIndex) ? '' : chatFingerprint(chat);
        const candidates = Number.isInteger(eventIndex)
            ? [[eventIndex, this.internalMessageMutations.get(eventIndex)]]
            : [...this.internalMessageMutations.entries()];
        for (const [index, expected] of candidates) {
            if (!expected)
                continue;
            if (Date.now() > expected.expiresAt) {
                this.clearInternalMessageMutation(index, expected);
                continue;
            }
            const message = chat[index];
            const matches = readMessageKey(message) === expected.messageKey
                && (0, util_1.hashText)(String(message?.mes ?? '')) === expected.contentHash
                && (Number.isInteger(eventIndex) || expected.chatFingerprint === currentChatFingerprint);
            if (matches)
                return true;
            this.clearInternalMessageMutation(index, expected);
        }
        return false;
    }
    clearInternalMessageMutations() {
        for (const [index, expected] of this.internalMessageMutations.entries())
            this.clearInternalMessageMutation(index, expected);
    }
    latestTurn(requestedIndex) {
        const chatKey = this.chatKey();
        if (!chatKey) throw new Error('当前没有活动聊天');
        const chat = this.context().chat ?? [];
        const messageIndex = Number.isInteger(requestedIndex) ? Number(requestedIndex) : findLatestAssistant(chat);
        if (messageIndex < 0 || !isAssistant(chat[messageIndex])) throw new Error('当前聊天没有可处理的 AI 正文');
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
    isAssistantIndex(index) { return isAssistant((this.context().chat ?? [])[index]); }
    recentConversation(snapshot, turnCount) {
        this.assertSnapshot(snapshot);
        const chat = this.context().chat ?? [];
        const end = snapshot.messageIndex >= 0 ? snapshot.messageIndex : chat.length - 1;
        const limit = Math.max(1, Number(turnCount) || 1) * 2;
        const selected = [];
        for (let index = end; index >= 0 && selected.length < limit; index -= 1) {
            const message = chat[index];
            if (!message || message.is_system || typeof message.mes !== 'string' || !message.mes.trim())
                continue;
            selected.push(`${message.is_user ? '玩家' : 'AI'}：${message.mes.trim()}`);
        }
        return selected.reverse().join('\n\n');
    }
    async generate(systemPrompt, prompt, responseLength, snapshot, currentSettings, timeoutMs, profileId = '') {
        this.assertSnapshot(snapshot, currentSettings);
        const context = this.context();
        let request;
        try {
            if (profileId) {
                const service = context.ConnectionManagerRequestService;
                if (!service) throw new Error('Connection Profile 服务不可用');
                request = service.sendRequest(profileId, [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt },
                ], responseLength, { stream: false, extractData: true, includePreset: true });
            } else {
                const generateRaw = context.generateRaw;
                if (typeof generateRaw !== 'function') throw new Error('当前 SillyTavern 未提供 generateRaw');
                request = generateRaw({ systemPrompt, prompt, responseLength });
            }
        } catch (error) {
            throw new Error(`模型请求启动失败：${(0, util_1.errorText)(error)}`);
        }
        let raw;
        try {
            raw = await withTimeout(request, timeoutMs, () => {
                if (snapshot.token) {
                    snapshot.token.cancelled = true;
                    snapshot.token.reason = `模型调用超时（${timeoutMs}ms）`;
                }
            });
        } catch (error) {
            if (snapshot.token?.cancelled) throw new Error(snapshot.token.reason || '任务已取消');
            throw new Error(`模型请求失败：${(0, util_1.errorText)(error)}`);
        }
        this.assertSnapshot(snapshot, currentSettings);
        const text = extractModelText(raw).trim();
        if (!text) throw new Error('模型返回为空或没有文本内容');
        if (looksLikeHtml(text)) throw new Error('模型返回了 HTML 错误页');
        return text;
    }
    connectionProfilesAvailable() {
        const context = this.context();
        return Boolean(context.ConnectionManagerRequestService)
            && !context.extensionSettings?.disabledExtensions?.includes?.('connection-manager');
    }
    profileName(profileId) {
        if (!profileId) return '当前连接';
        try { return this.context().ConnectionManagerRequestService?.getProfile(profileId)?.name || profileId; }
        catch { return profileId; }
    }
    bindProfileDropdown(selector, selectedId, onChange) {
        const service = this.context().ConnectionManagerRequestService;
        if (!service?.handleDropdown) return false;
        service.handleDropdown(selector, selectedId, (profile) => onChange(profile?.id || ''), undefined, undefined, (profile) => { if (profile?.id === selectedId) onChange(''); });
        return true;
    }
    async replaceAssistantText(snapshot, text, currentSettings) {
        this.assertSnapshot(snapshot, currentSettings);
        const chat = this.context().chat ?? [];
        const message = chat[snapshot.messageIndex];
        if (!isAssistant(message)) throw new Error('待修正正文已经不存在');
        if (readMessageKey(message) !== snapshot.messageKey || (0, util_1.hashText)(String(message.mes ?? '')) !== snapshot.contentHash) throw new Error('正文已经变化，拒绝覆盖旧版本');
        const originalText = String(message.mes ?? '');
        const swipeIndex = Array.isArray(message.swipes) && Number.isInteger(message.swipe_id) && Number(message.swipe_id) >= 0
            ? Number(message.swipe_id)
            : -1;
        const originalSwipe = swipeIndex >= 0 ? message.swipes[swipeIndex] : undefined;
        try {
            message.mes = text;
            if (swipeIndex >= 0) message.swipes[swipeIndex] = text;
            this.updateMessageBlock(snapshot.messageIndex, message);
            await this.saveChat();
        }
        catch (error) {
            message.mes = originalText;
            if (swipeIndex >= 0) message.swipes[swipeIndex] = originalSwipe;
            try { this.updateMessageBlock(snapshot.messageIndex, message); }
            catch { }
            throw new Error(`修正版正文保存失败，已恢复原正文：${(0, util_1.errorText)(error)}`);
        }
        const turn = this.latestTurn(snapshot.messageIndex);
        return this.refreshSnapshot(snapshot, turn, currentSettings);
    }
    cursor() {
        const root = this.chatNamespace();
        const value = root.cursor && typeof root.cursor === 'object' ? root.cursor : {};
        return {
            lastProcessedMessageKey: String(value.lastProcessedMessageKey ?? ''),
            lastProcessedHash: String(value.lastProcessedHash ?? ''),
            lastAuditMessageKey: String(value.lastAuditMessageKey ?? ''),
            lastAuditHash: String(value.lastAuditHash ?? ''),
            lastFactMessageKey: String(value.lastFactMessageKey ?? ''),
            lastFactHash: String(value.lastFactHash ?? ''),
            lastSceneTitle: String(value.lastSceneTitle ?? ''),
            turnsSinceSmall: Math.max(0, Number(value.turnsSinceSmall) || 0),
            smallCountSinceLarge: Math.max(0, Number(value.smallCountSinceLarge) || 0),
            pendingSmall: value.pendingSmall === true,
            pendingLarge: value.pendingLarge === true,
        };
    }
    async saveCursor(cursor, snapshot, currentSettings) {
        if (snapshot) this.assertSnapshot(snapshot, currentSettings);
        const root = this.chatNamespace();
        const hadCursor = Object.prototype.hasOwnProperty.call(root, 'cursor');
        const previous = hadCursor ? structuredClone(root.cursor) : undefined;
        root.cursor = structuredClone(cursor);
        try {
            await this.saveMetadata();
            if (snapshot) this.assertSnapshot(snapshot, currentSettings);
        }
        catch (error) {
            if (hadCursor)
                root.cursor = previous;
            else
                delete root.cursor;
            throw error;
        }
    }
    getFocusUid() { return String(this.chatNamespace().focusUid ?? '').trim(); }
    async setFocusUid(uid) {
        const root = this.chatNamespace();
        const hadUid = Object.prototype.hasOwnProperty.call(root, 'focusUid');
        const hadTitle = Object.prototype.hasOwnProperty.call(root, 'focusTitle');
        const previousUid = root.focusUid;
        const previousTitle = root.focusTitle;
        root.focusUid = String(uid ?? '').trim();
        delete root.focusTitle;
        try {
            await this.saveMetadata();
        }
        catch (error) {
            if (hadUid)
                root.focusUid = previousUid;
            else
                delete root.focusUid;
            if (hadTitle)
                root.focusTitle = previousTitle;
            else
                delete root.focusTitle;
            throw error;
        }
    }
    getFocusTitle() { return String(this.chatNamespace().focusTitle ?? '').trim(); }
    async setFocusTitle(title) {
        const root = this.chatNamespace();
        const hadTitle = Object.prototype.hasOwnProperty.call(root, 'focusTitle');
        const previousTitle = root.focusTitle;
        root.focusTitle = String(title ?? '').trim();
        try {
            await this.saveMetadata();
        }
        catch (error) {
            if (hadTitle)
                root.focusTitle = previousTitle;
            else
                delete root.focusTitle;
            throw error;
        }
    }
    async saveMetadata() {
        const context = this.context();
        if (typeof context.saveMetadata === 'function') await context.saveMetadata();
        else context.saveMetadataDebounced?.();
    }
    async saveChat() {
        const context = this.context();
        if (typeof context.saveChat === 'function') await context.saveChat();
        else if (typeof context.saveChatConditional === 'function') await context.saveChatConditional();
    }
    diagnostics() {
        let context = null;
        try { context = this.context(); }
        catch (error) { return { version: 1, error: (0, util_1.errorText)(error) }; }
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
        if (existing) return existing;
        const generated = this.context().uuidv4?.() ?? randomId();
        const extra = (message.extra ?? (message.extra = {}));
        extra[constants_1.EXTENSION_NAMESPACE] = { ...(extra[constants_1.EXTENSION_NAMESPACE] ?? {}), messageKey: generated };
        this.updateMessageBlock(index, message);
        void this.saveChat();
        return generated;
    }
    updateMessageBlock(index, message) {
        const previous = this.internalMessageMutations.get(index);
        if (previous)
            this.clearInternalMessageMutation(index, previous);
        const expected = {
            messageKey: readMessageKey(message),
            contentHash: (0, util_1.hashText)(String(message?.mes ?? '')),
            chatFingerprint: chatFingerprint(this.context().chat ?? []),
            expiresAt: Date.now() + 2000,
            timer: undefined,
        };
        expected.timer = globalThis.setTimeout(() => this.clearInternalMessageMutation(index, expected), 2000);
        expected.timer?.unref?.();
        this.internalMessageMutations.set(index, expected);
        this.context().updateMessageBlock?.(index, message);
    }
    clearInternalMessageMutation(index, expected) {
        if (this.internalMessageMutations.get(index) !== expected)
            return;
        this.internalMessageMutations.delete(index);
        if (expected.timer)
            globalThis.clearTimeout(expected.timer);
    }
    chatNamespace() {
        const metadata = (this.context().chatMetadata ?? (this.context().chatMetadata = {}));
        const current = metadata[constants_1.EXTENSION_NAMESPACE];
        if (!current || typeof current !== 'object' || Array.isArray(current)) metadata[constants_1.EXTENSION_NAMESPACE] = {};
        return metadata[constants_1.EXTENSION_NAMESPACE];
    }
}
exports.HostAdapter = HostAdapter;
function readMessageKey(message) {
    const value = message?.extra?.[constants_1.EXTENSION_NAMESPACE];
    return value && typeof value === 'object' ? String(value.messageKey ?? '') : '';
}
function isAssistant(message) { return Boolean(message && !message.is_user && !message.is_system && typeof message.mes === 'string' && message.mes.trim()); }
function findLatestAssistant(chat) { for (let index = chat.length - 1; index >= 0; index -= 1) if (isAssistant(chat[index])) return index; return -1; }
function previousPlayerText(chat, before) {
    for (let index = before - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (message?.is_user && !message.is_system && typeof message.mes === 'string') return message.mes;
    }
    return '';
}
function messageIndexFromEvent(value) {
    if (Number.isInteger(value))
        return value;
    if (value && typeof value === 'object') {
        for (const candidate of [value.messageIndex, value.messageId, value.index, value.id]) {
            const number = Number(candidate);
            if (Number.isInteger(number))
                return number;
        }
    }
    const number = Number(value);
    return Number.isInteger(number) ? number : undefined;
}
function chatFingerprint(chat) {
    return (0, util_1.hashText)(JSON.stringify(chat.map((message) => ({
        user: message?.is_user === true,
        system: message?.is_system === true,
        text: String(message?.mes ?? ''),
        key: readMessageKey(message),
        swipe: Number.isInteger(message?.swipe_id) ? Number(message.swipe_id) : null,
    }))));
}
function withTimeout(promise, timeoutMs, onTimeout) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = globalThis.setTimeout(() => {
            onTimeout?.();
            reject(new Error(`模型调用超时（${timeoutMs}ms）`));
        }, timeoutMs);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => globalThis.clearTimeout(timer));
}
function extractModelText(raw) {
    if (typeof raw === 'string') return raw;
    if (!raw || typeof raw !== 'object') return '';
    if (typeof raw.content === 'string') return raw.content;
    if (Array.isArray(raw.content)) return raw.content.map((item) => typeof item === 'string' ? item : String(item?.text ?? item?.content ?? '')).join('');
    if (typeof raw.text === 'string') return raw.text;
    if (typeof raw.message?.content === 'string') return raw.message.content;
    if (typeof raw.choices?.[0]?.message?.content === 'string') return raw.choices[0].message.content;
    return '';
}
function looksLikeHtml(text) {
    const value = text.trim().slice(0, 1000).toLocaleLowerCase();
    return /^<!doctype\s+html/u.test(value) || /^<html(?:\s|>)/u.test(value) || (/<body(?:\s|>)/u.test(value) && /<\/body>/u.test(value));
}
function randomId() {
    try { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
    catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
function sanitizeConnectionValue(value, depth = 0) {
    if (value === null || value === undefined)
        return value ?? null;
    if (depth > 5)
        return '[truncated]';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        return value;
    if (Array.isArray(value))
        return value.slice(0, 100).map((item) => sanitizeConnectionValue(item, depth + 1));
    if (typeof value !== 'object')
        return undefined;
    const output = {};
    for (const key of Object.keys(value).sort()) {
        if (/(?:last|timestamp|runtime|status|usage|latency|request)/iu.test(key))
            continue;
        const item = sanitizeConnectionValue(value[key], depth + 1);
        if (item !== undefined)
            output[key] = item;
    }
    return output;
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
let retryAttempts = 0;
const MAX_STARTUP_RETRIES = 120;
const STARTUP_ROOT_ID = 'mirror-abyss-core-control';
let startupDomListener = null;
function mountStartupIndicator() {
    if (typeof document === 'undefined') return;
    if (!document.body) {
        if (!startupDomListener) {
            startupDomListener = () => {
                startupDomListener = null;
                mountStartupIndicator();
            };
            document.addEventListener('DOMContentLoaded', startupDomListener, { once: true });
        }
        return;
    }
    if (document.getElementById(STARTUP_ROOT_ID)) return;
    const root = document.createElement('div');
    root.id = STARTUP_ROOT_ID;
    root.style.cssText = 'position:fixed!important;inset-inline-end:max(10px,env(safe-area-inset-right,0px))!important;bottom:max(84px,calc(68px + env(safe-area-inset-bottom,0px)))!important;z-index:2147483640!important;visibility:visible!important;opacity:1!important;transform:none!important;';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '镜渊…';
    button.title = '镜渊正在等待 SillyTavern 完成初始化';
    button.style.cssText = 'display:block!important;min-width:56px;min-height:44px;padding:0 12px;border:1px solid rgba(255,255,255,.24);border-radius:10px;background:rgba(20,20,24,.96);color:#fff;font-weight:700;font-size:14px;box-shadow:0 3px 12px rgba(0,0,0,.42);touch-action:manipulation;';
    root.append(button);
    document.body.append(root);
}
function removeStartupIndicator() {
    if (typeof document === 'undefined') return;
    if (startupDomListener) document.removeEventListener('DOMContentLoaded', startupDomListener);
    startupDomListener = null;
    document.getElementById(STARTUP_ROOT_ID)?.remove();
}
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
        migrateWorldbook: async () => (await requireApplication()).migrate(),
        undoWorldbookMigration: async () => (await requireApplication()).undoMigration(),
        cancel: async () => (await requireApplication()).cancel(),
        getSettings: async () => (await requireApplication()).settings(),
        configure: async (patch) => (await requireApplication()).configure(patch),
        status: async () => (await requireApplication()).status(),
        restart: async () => { shutdown(false); extensionEnabled = true; await initialize(); },
    };
}
async function initialize() {
    if (!extensionEnabled || initializing || application?.isStarted()) return;
    mountStartupIndicator();
    if (!contextReady()) { scheduleRetry(); return; }
    initializing = true;
    exposeApi();
    try { application ?? (application = new application_1.MirrorAbyssApplication()); application.start(); retryAttempts = 0; console.info(`[MirrorAbyss] ${constants_1.VERSION} ready`); }
    catch (error) { console.error('[MirrorAbyss] initialization failed', error); globalThis.toastr?.error?.(`镜渊启动失败：${error instanceof Error ? error.message : String(error)}`); }
    finally { initializing = false; }
}
function scheduleRetry() {
    if (retryTimer !== undefined || !extensionEnabled) return;
    if (retryAttempts >= MAX_STARTUP_RETRIES) {
        console.error('[MirrorAbyss] SillyTavern 上下文在有限重试内未就绪，停止自动重试');
        globalThis.toastr?.error?.('镜渊启动失败：SillyTavern 上下文未就绪');
        return;
    }
    retryAttempts += 1;
    retryTimer = globalThis.setTimeout(() => { retryTimer = undefined; void initialize(); }, 250);
}
function shutdown(removeApi = true) {
    if (retryTimer !== undefined) globalThis.clearTimeout(retryTimer);
    retryTimer = undefined;
    application?.stop();
    removeStartupIndicator();
    if (removeApi) delete globalThis.MirrorAbyss;
}
function onActivate() { extensionEnabled = true; retryAttempts = 0; mountStartupIndicator(); exposeApi(); void initialize(); }
function onEnable() { extensionEnabled = true; retryAttempts = 0; mountStartupIndicator(); exposeApi(); void initialize(); }
function onDisable() { extensionEnabled = false; shutdown(); }
function onDelete() { extensionEnabled = false; shutdown(); application = null; }
function onInstall() { exposeApi(); }
function onUpdate() { exposeApi(); }
function onClean() { }

// SillyTavern 1.16.x does not invoke manifest lifecycle hooks. Module-load bootstrap keeps one startup path.
if (typeof document !== 'undefined') { mountStartupIndicator(); exposeApi(); void initialize(); }

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
    const byExactTitle = new Map();
    const byTitle = new Map();
    const byAlias = new Map();
    const byKeyword = new Map();
    for (const entry of entries) {
        byUid.set(String(entry.uid), entry);
        add(byExactTitle, entry.title, entry);
        add(byTitle, normalizeTitleLookup(entry.title), entry);
        for (const alias of entry.aliases) add(byAlias, normalizeLookup(alias), entry);
        for (const keyword of entry.keywords) add(byKeyword, normalizeLookup(keyword), entry);
    }
    return { entries, byUid, byExactTitle, byTitle, byAlias, byKeyword };
}
function matchBlock(block, index, contextText, weights, bodyThreshold = 0.48) {
    const tiers = [];
    if (block.uid) {
        const entry = index.byUid.get(String(block.uid));
        tiers.push(entry ? [candidate(entry, weights.uid, 'uid', `UID ${block.uid} 精确命中`, 1)] : []);
    }
    tiers.push(uniqueCandidates(index.byExactTitle.get(block.title) ?? [], weights.exactTitle, 'exact-title', '标题完全相同', 2));
    tiers.push(uniqueCandidates(index.byTitle.get(normalizeTitleLookup(block.title)) ?? [], weights.normalizedTitle, 'normalized-title', '标准化标题相同', 3));
    tiers.push(uniqueCandidates(index.entries.filter((entry) => entry.type === block.type && normalizeLookup(entry.name) === normalizeLookup(block.name)), weights.typeAndName, 'type-name', '类型与名称组合相同', 4));
    tiers.push(uniqueCandidates((index.byAlias.get(normalizeLookup(block.name)) ?? []).filter((entry) => entry.type === block.type), weights.alias, 'alias', `同类型别名“${block.name}”命中`, 5));
    const keywordHits = new Map();
    for (const key of [block.name, ...block.keywords.filter((item) => normalizeLookup(item) !== normalizeLookup(block.type))]) {
        for (const entry of index.byKeyword.get(normalizeLookup(key)) ?? []) {
            const sameName = namesCompatible(entry.name, block.name);
            const aliasName = entry.aliases.some((alias) => normalizeLookup(alias) === normalizeLookup(block.name));
            if (entry.type === block.type && (sameName || aliasName)) keywordHits.set(entry.uid, entry);
        }
    }
    tiers.push(uniqueCandidates([...keywordHits.values()], weights.keywordExact, 'keyword', '名称或类型关键词精确命中', 6));
    const referenceHits = index.entries.filter((entry) => entry.type === block.type
        && namesCompatible(entry.name, block.name)
        && entry.references.some((title) => normalizeTitleLookup(title) === normalizeTitleLookup(block.title)));
    tiers.push(uniqueCandidates(referenceHits, weights.reference, 'reference', '已有条目关联名称命中', 7));
    const blockText = [block.title, ...block.sections.flatMap((section) => section.lines)].join('\n');
    const bodyHits = [];
    for (const entry of index.entries) {
        if (entry.type !== block.type) continue;
        if (!namesCompatible(entry.name, block.name)) continue;
        const similarity = Math.max((0, util_1.diceSimilarity)(blockText, entry.content), ...Object.values(entry.sections.values).flat().map((line) => (0, util_1.diceSimilarity)(blockText, line)), 0);
        if (similarity >= bodyThreshold) bodyHits.push({ entry, score: Math.round(weights.bodySimilarity * similarity), evidence: [{ kind: 'body-similarity', score: Math.round(weights.bodySimilarity * similarity), detail: `小标题与正文相似度 ${(similarity * 100).toFixed(0)}%`, tier: 8 }], tier: 8 });
    }
    tiers.push(bodyHits.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title)));
    return tiers.find((items) => items.length) ?? [];
}
function selectBestCandidate(candidates, _minimumScore) {
    if (candidates.length !== 1) return null;
    return candidates[0];
}
function relevantEntries(entries, text, limit = 24) {
    const normalized = normalizeLookup(text);
    const scored = entries.map((entry) => {
        let score = 0;
        const name = normalizeLookup(entry.name);
        if (name.length >= 2 && normalized.includes(name)) score += 1000;
        for (const keyword of entry.keywords) {
            const key = normalizeLookup(keyword);
            if (key.length >= 2 && normalized.includes(key)) score += 180;
        }
        for (const alias of entry.aliases) {
            const key = normalizeLookup(alias);
            if (key.length >= 2 && normalized.includes(key)) score += 240;
        }
        if (entry.focus) score += 900;
        if (entry.activation.constant) score += 300;
        if (/(进行中|当前场景|当前相关|活跃)/u.test(entry.content)) score += 120;
        return { entry, score };
    });
    const selected = scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score).map((item) => item.entry);
    const fallback = entries
        .filter((entry) => entry.focus || entry.activation.constant
        || /^(?:小总结|大总结)$/u.test(entry.type)
        || /(进行中|当前场景|当前相关|活跃)/u.test(entry.content))
        .sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt))
        .slice(0, 12);
    return [...new Map([...selected, ...fallback].map((entry) => [entry.uid, entry])).values()].slice(0, limit);
}
function titleTokens(value) {
    const split = (0, util_1.splitTitle)(value);
    return (0, util_1.unique)([split?.type, split?.name, value].map((item) => (0, util_1.normalizeFact)(String(item ?? ''))));
}
function uniqueCandidates(entries, score, kind, detail, tier) {
    return [...new Map(entries.map((entry) => [entry.uid, entry])).values()].map((entry) => candidate(entry, score, kind, detail, tier)).sort((a, b) => a.entry.title.localeCompare(b.entry.title));
}
function candidate(entry, score, kind, detail, tier) { return { entry, score, tier, evidence: [{ kind, score, detail, tier }] }; }
function namesCompatible(left, right) {
    const a = normalizeLookup(left);
    const b = normalizeLookup(right);
    if (!a || !b) return false;
    return a === b;
}
function normalizeTitleLookup(value) { return (0, util_1.normalizeTitle)(value).toLocaleLowerCase(); }
function normalizeLookup(value) { return (0, util_1.normalizeFact)(value).replace(/[｜|]/gu, ''); }
function add(map, key, entry) {
    if (!key) return;
    const list = map.get(key) ?? [];
    if (!list.some((candidate) => candidate.uid === entry.uid)) list.push(entry);
    map.set(key, list);
}

},
"matching/alias-matcher":function(module,exports,require){
"use strict";
const { buildEntryIndex, matchBlock } = require("../matcher");
exports.buildEntryIndex = buildEntryIndex;
exports.matchByAlias = (block, entries, contextText, weights, threshold) =>
    matchBlock(block, buildEntryIndex(entries), contextText, weights, threshold)
        .filter((candidate) => candidate.evidence?.some((item) => item.kind === "alias"));

},
"matching/confidence-resolver":function(module,exports,require){
"use strict";
const { selectBestCandidate } = require("../matcher");
exports.selectBestCandidate = selectBestCandidate;

},
"matching/duplicate-detector":function(module,exports,require){
"use strict";
const { normalizeFact, diceSimilarity } = require("../util");
exports.isExactDuplicate = (left, right) => normalizeFact(left) === normalizeFact(right);
exports.similarity = diceSimilarity;

},
"matching/keyword-matcher":function(module,exports,require){
"use strict";
const { buildEntryIndex, matchBlock, relevantEntries } = require("../matcher");
exports.buildEntryIndex = buildEntryIndex;
exports.matchBlock = matchBlock;
exports.relevantEntries = relevantEntries;

},
"matching/section-matcher":function(module,exports,require){
"use strict";
const { informationAnchor } = require("../operations");
const { parseEntrySections } = require("../parser");
exports.informationAnchor = informationAnchor;
exports.parseEntrySections = parseEntrySections;

},
"matching/title-normalizer":function(module,exports,require){
"use strict";
const { normalizeTitle, splitTitle } = require("../util");
exports.normalizeTitle = normalizeTitle;
exports.splitTitle = splitTitle;

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
    constructor(host, worldbook, getSettings) {
        this.host = host;
        this.worldbook = worldbook;
        this.getSettings = getSettings;
        this.statusByChat = new Map();
    }
    currentStatus(chatKey = '') {
        const key = chatKey || safeChatKey(this.host);
        return structuredClone(this.statusByChat.get(key) ?? { phase: 'idle', detail: '等待处理', error: '', rawResult: '', plan: null });
    }
    async processTurn(settings, snapshot) {
        let cursor = this.host.cursor();
        if (cursor.lastProcessedMessageKey === snapshot.messageKey && cursor.lastProcessedHash === snapshot.contentHash) {
            this.setStatus(snapshot.chatKey, 'complete', '该正文已经完整处理，跳过重复任务');
            return [];
        }
        try {
            const factDone = cursor.lastFactMessageKey === snapshot.messageKey && cursor.lastFactHash === snapshot.contentHash;
            if (!factDone) {
                this.setStatus(snapshot.chatKey, 'reading', '读取最终正文与相关世界书条目');
                await this.extract(settings, snapshot);
                cursor = this.host.cursor();
                cursor.lastFactMessageKey = snapshot.messageKey;
                cursor.lastFactHash = snapshot.contentHash;
                cursor.turnsSinceSmall += 1;
                if (cursor.turnsSinceSmall >= settings.smallSummaryTurns) {
                    cursor.turnsSinceSmall = 0;
                    cursor.pendingSmall = true;
                }
                await this.host.saveCursor(cursor, snapshot, this.getSettings());
            }
            cursor = this.host.cursor();
            if (cursor.pendingSmall) {
                const small = await this.summarize('small', settings, snapshot);
                cursor = this.host.cursor();
                cursor.pendingSmall = false;
                if (small.changed) {
                    cursor.smallCountSinceLarge += 1;
                    if (cursor.smallCountSinceLarge >= settings.largeSummaryCount) cursor.pendingLarge = true;
                }
                await this.host.saveCursor(cursor, snapshot, this.getSettings());
            }
            cursor = this.host.cursor();
            if (cursor.pendingLarge) {
                const large = await this.summarize('large', settings, snapshot);
                cursor = this.host.cursor();
                cursor.pendingLarge = false;
                if (large.changed) cursor.smallCountSinceLarge = 0;
                await this.host.saveCursor(cursor, snapshot, this.getSettings());
            }
            cursor = this.host.cursor();
            cursor.lastProcessedMessageKey = snapshot.messageKey;
            cursor.lastProcessedHash = snapshot.contentHash;
            await this.host.saveCursor(cursor, snapshot, this.getSettings());
            this.setStatus(snapshot.chatKey, 'complete', '核心事实已提交，总结调度完成');
            return [];
        } catch (error) {
            this.setStatus(snapshot.chatKey, 'error', '当前步骤失败，后续步骤已停止', (0, util_1.errorText)(error));
            throw error;
        }
    }
    async runTask(kind, settings, snapshot) {
        if (kind === 'extraction') {
            const result = await this.extract(settings, snapshot);
            const cursor = this.host.cursor();
            cursor.lastFactMessageKey = snapshot.messageKey;
            cursor.lastFactHash = snapshot.contentHash;
            cursor.turnsSinceSmall += 1;
            if (cursor.turnsSinceSmall >= settings.smallSummaryTurns) {
                cursor.turnsSinceSmall = 0;
                cursor.pendingSmall = true;
            }
            await this.host.saveCursor(cursor, snapshot, this.getSettings());
            this.setStatus(snapshot.chatKey, 'complete', '提取完成');
            return result.entries;
        }
        if (kind === 'smallSummary') {
            const result = await this.summarize('small', settings, snapshot);
            if (result.changed) {
                const cursor = this.host.cursor();
                cursor.turnsSinceSmall = 0;
                cursor.smallCountSinceLarge += 1;
                if (cursor.smallCountSinceLarge >= settings.largeSummaryCount) cursor.pendingLarge = true;
                await this.host.saveCursor(cursor, snapshot, this.getSettings());
            }
            this.setStatus(snapshot.chatKey, 'complete', result.changed ? '小总结完成' : '小总结无更新');
            return result.entries;
        }
        const result = await this.summarize('large', settings, snapshot);
        if (result.changed) {
            const cursor = this.host.cursor();
            cursor.smallCountSinceLarge = 0;
            cursor.pendingLarge = false;
            await this.host.saveCursor(cursor, snapshot, this.getSettings());
        }
        this.setStatus(snapshot.chatKey, 'complete', result.changed ? '大总结完成' : '大总结无更新');
        return result.entries;
    }
    async extract(settings, snapshot) {
        this.setStatus(snapshot.chatKey, 'extracting', '提取事实与状态');
        this.validate(snapshot);
        const entries = await this.worldbook.list(settings, snapshot, () => this.validate(snapshot));
        this.validate(snapshot);
        const selected = (0, matcher_1.relevantEntries)(entries, `${snapshot.playerText}\n${snapshot.assistantText}`);
        const prompt = (0, prompts_1.extractionPrompts)(settings, snapshot.playerText, snapshot.assistantText, selected);
        const raw = await this.host.generate(prompt.system, trimPrompt(prompt.user), settings.responseTokens, snapshot, settings, settings.requestTimeoutMs, settings.extractionProfileId);
        this.validate(snapshot);
        const blocks = (0, parser_1.parseInformationPoints)(raw);
        if (!blocks.length) {
            this.setStatus(snapshot.chatKey, 'matching', '本轮明确返回“无”，世界书零写入', '', raw, emptyPlan());
            return { entries, changed: false };
        }
        this.setStatus(snapshot.chatKey, 'matching', '匹配条目并去重', '', raw);
        const plan = (0, operations_1.buildOperationPlan)(blocks, entries, settings, `${snapshot.playerText}\n${snapshot.assistantText}`);
        return this.apply(settings, plan, snapshot, `${snapshot.playerText}\n${snapshot.assistantText}`, '提取', raw);
    }
    async summarize(kind, settings, snapshot) {
        const label = kind === 'small' ? '小总结' : '大总结';
        this.setStatus(snapshot.chatKey, kind === 'small' ? 'small-summary' : 'large-summary', label);
        this.validate(snapshot);
        const entries = await this.worldbook.list(settings, snapshot, () => this.validate(snapshot));
        this.validate(snapshot);
        const selected = summaryEntries(kind, entries, snapshot);
        const scope = kind === 'small' ? summaryScope(selected, snapshot) : '当前';
        const expectedTitle = kind === 'small' ? `小总结｜${scope}` : '大总结｜当前';
        const recentConversation = kind === 'small'
            ? (typeof this.host.recentConversation === 'function'
                ? this.host.recentConversation(snapshot, settings.smallSummaryTurns)
                : `${snapshot.playerText || ''}\n${snapshot.assistantText || ''}`.trim())
            : '';
        const prompt = (0, prompts_1.summaryPrompts)(kind, settings, selected, scope, recentConversation);
        const profile = kind === 'small' ? settings.smallSummaryProfileId : settings.largeSummaryProfileId;
        const raw = await this.host.generate(prompt.system, trimPrompt(prompt.user), settings.responseTokens, snapshot, settings, settings.requestTimeoutMs, profile);
        this.validate(snapshot);
        const blocks = (0, parser_1.parseInformationPoints)(raw);
        if (!blocks.length) {
            this.setStatus(snapshot.chatKey, kind === 'small' ? 'small-summary' : 'large-summary', `${label}明确返回“无”`, '', raw, emptyPlan());
            return { entries, changed: false };
        }
        const summaryBlocks = blocks.filter((block) => block.type === label);
        if (summaryBlocks.length !== 1) throw new Error(`${label}必须包含且只包含一个“${expectedTitle}”总结条目`);
        if ((0, util_1.normalizeTitle)(summaryBlocks[0].title) !== (0, util_1.normalizeTitle)(expectedTitle)) throw new Error(`${label}标题必须是“${expectedTitle}”`);
        const plan = (0, operations_1.buildOperationPlan)(blocks, entries, settings, selected.map((entry) => `${entry.title}\n${entry.content}`).join('\n'));
        return this.apply(settings, plan, snapshot, selected.map((entry) => `${entry.title}\n${entry.content}`).join('\n'), label, raw);
    }
    async apply(settings, plan, snapshot, contextText, label, raw) {
        this.setStatus(snapshot.chatKey, 'matching', `${label}生成确定性操作计划`, '', raw, plan);
        if (!plan.operations.some((operation) => operation.kind !== 'noop')) return { entries: [], changed: false };
        this.setStatus(snapshot.chatKey, 'worldbook', `${label}通过唯一提交器写入世界书`, '', raw, plan);
        this.validate(snapshot);
        const focusUid = typeof this.host.getFocusUid === 'function' ? this.host.getFocusUid() : '';
        const entries = await this.worldbook.apply(settings, plan, snapshot.messageKey, contextText, focusUid, snapshot, () => this.validate(snapshot));
        this.validate(snapshot);
        return { entries, changed: true };
    }
    validate(snapshot) { this.host.assertSnapshot(snapshot, this.getSettings()); }
    setStatus(chatKey, phase, detail, error = '', rawResult = '', plan = null) {
        const previous = this.statusByChat.get(chatKey) ?? {};
        this.statusByChat.set(chatKey, { phase, detail, error, rawResult: rawResult || previous.rawResult || '', plan: plan ?? previous.plan ?? null });
    }
}
exports.MemoryRunner = MemoryRunner;
function summaryEntries(kind, entries, snapshot) {
    const active = entries.filter((entry) => !entry.activation.disabled);
    if (kind === 'small') {
        const relevant = (0, matcher_1.relevantEntries)(active.filter((entry) => !/^大总结$/u.test(entry.type)), `${snapshot.playerText}\n${snapshot.assistantText}`, 40);
        const continuity = active
            .filter((entry) => /^(事件|场景|小总结)$/u.test(entry.type))
            .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
            .slice(0, 12);
        return [...new Map([...relevant, ...continuity]
            .filter((entry) => !/^大总结$/u.test(entry.type))
            .map((entry) => [entry.uid, entry])).values()].slice(0, 40);
    }
    const currentLarge = active.filter((entry) => entry.title === '大总结｜当前');
    const small = active.filter((entry) => entry.type === '小总结');
    const longTerm = active.filter((entry) => /(人物|关系|组织|任务|契约|基础设定|全局变化|事件)/u.test(`${entry.type}\n${entry.keywords.join(' ')}`));
    return [...new Map([...currentLarge, ...small, ...longTerm].map((entry) => [entry.uid, entry])).values()].slice(0, 100);
}
function summaryScope(entries, snapshot) {
    const event = entries.find((entry) => entry.type === '事件' && !entry.activation.disabled);
    if (event) return event.name;
    const scene = entries.find((entry) => entry.type === '场景' && !entry.activation.disabled);
    if (scene) return scene.name;
    const existing = entries.find((entry) => entry.type === '小总结');
    if (existing) return existing.name;
    return '当前事件线';
}
function emptyPlan() { return { blocks: [], operations: [], createdAt: Date.now() }; }
function trimPrompt(value) { return value.length <= constants_1.MAX_CONTEXT_CHARS ? value : `${value.slice(0, constants_1.MAX_CONTEXT_CHARS)}\n[已按字符上限截断]`; }
function safeChatKey(host) { try { return host.chatKey(); } catch { return ''; } }

},
"migration":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationService = void 0;
exports.needsMigration = needsMigration;
const constants_1 = require("./constants");
const parser_1 = require("./parser");
const prompts_1 = require("./prompts");
const util_1 = require("./util");

class MigrationService {
    constructor(host, worldbook, getSettings) {
        this.host = host;
        this.worldbook = worldbook;
        this.getSettings = getSettings;
        this.backup = null;
    }
    canUndo() {
        return Boolean(this.backup);
    }
    async migrate(settings, snapshot) {
        const validate = () => this.host.assertSnapshot(snapshot, this.getSettings());
        validate();
        const original = await this.worldbook.readRaw(settings, snapshot, validate);
        const candidates = Object.entries(original.data.entries ?? {})
            .filter(([, raw]) => raw && typeof raw === 'object' && needsMigration(raw));
        if (!candidates.length)
            return { changed: false, converted: [], skipped: 0 };
        const next = (0, util_1.clone)(original.data);
        const converted = [];
        for (const [mapKey, raw] of candidates) {
            validate();
            const title = String(raw.comment ?? raw.name ?? raw.title ?? '');
            const content = String(raw.content ?? '');
            const keywords = (0, util_1.normalizeStringArray)(raw.key);
            const prompt = (0, prompts_1.migrationPrompts)(title, content, keywords);
            const response = await this.host.generate(prompt.system, trimPrompt(prompt.user), settings.responseTokens, snapshot, settings, settings.requestTimeoutMs, settings.migrationProfileId);
            validate();
            const blocks = (0, parser_1.parseInformationPoints)(response);
            if (blocks.length !== 1)
                throw new Error(`旧条目“${title || mapKey}”整理结果必须只有一个条目`);
            const block = blocks[0];
            const migrated = next.entries[mapKey];
            const sections = sectionsWithPreservedOldText(block, content);
            migrated.comment = block.title;
            migrated.content = (0, parser_1.serializeEntrySections)(sections);
            migrated.key = (0, util_1.unique)([...keywords, ...block.keywords]);
            converted.push({ uid: String(migrated.uid ?? mapKey), from: title, to: block.title });
        }
        this.backup = {
            chatKey: snapshot.chatKey,
            worldbookName: original.name,
            data: (0, util_1.clone)(original.data),
            afterData: (0, util_1.clone)(next),
        };
        try {
            await this.worldbook.replaceRaw(settings, original.name, next, snapshot, validate, original.data);
        }
        catch (error) {
            if (/整理期间已被其他操作修改/u.test((0, util_1.errorText)(error))) {
                this.backup = null;
                throw error;
            }
            try {
                await this.worldbook.replaceRaw(settings, original.name, original.data, snapshot, validate);
            }
            catch (rollbackError) {
                this.backup = null;
                throw new Error(`整理失败且恢复备份失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackError)}`);
            }
            this.backup = null;
            throw error;
        }
        return { changed: true, converted, skipped: Object.keys(original.data.entries ?? {}).length - candidates.length };
    }
    async undo(settings, snapshot) {
        if (!this.backup)
            throw new Error('没有可撤销的上次整理');
        if (this.backup.chatKey !== snapshot.chatKey || this.backup.worldbookName !== snapshot.worldbookName)
            throw new Error('上次整理属于其他聊天或世界书，不能在当前范围撤销');
        const validate = () => this.host.assertSnapshot(snapshot, this.getSettings());
        const backup = this.backup;
        await this.worldbook.replaceRaw(settings, backup.worldbookName, backup.data, snapshot, validate, backup.afterData);
        this.backup = null;
        return { changed: true };
    }
}
exports.MigrationService = MigrationService;

function needsMigration(raw) {
    const title = (0, util_1.normalizeTitle)(String(raw?.comment ?? raw?.name ?? raw?.title ?? ''));
    if (!(0, util_1.splitTitle)(title))
        return true;
    const content = String(raw?.content ?? '').trim();
    if (!content)
        return false;
    if (!/【\s*[^】]+\s*】/u.test(content))
        return true;
    const parsed = (0, parser_1.parseEntrySections)(content);
    if (!parsed.order.length)
        return true;
    let insideSection = false;
    for (const rawLine of content.replace(/\r/g, '').split('\n')) {
        const line = rawLine.trim();
        if (!line)
            continue;
        if (/^【\s*[^】]+\s*】$/u.test(line)) {
            insideSection = true;
            continue;
        }
        if (!insideSection)
            return true;
    }
    return false;
}

function sectionsWithPreservedOldText(block, originalContent) {
    const sections = { order: [], values: {} };
    for (const section of block.sections) {
        if (/(关键词|触发词|标签|分类)/u.test(section.name) || section.empty)
            continue;
        sections.order.push(section.name);
        sections.values[section.name] = (0, util_1.unique)(section.lines);
    }
    const migratedLines = Object.values(sections.values).flat();
    const unresolved = originalLines(originalContent).filter((line) => {
        const normalized = (0, util_1.normalizeFact)(line);
        return !migratedLines.some((candidate) => {
            const target = (0, util_1.normalizeFact)(candidate);
            return target === normalized || target.includes(normalized) || normalized.includes(target)
                || (0, util_1.diceSimilarity)(candidate, line) >= 0.82;
        });
    });
    if (unresolved.length) {
        sections.order.push('旧格式保留');
        sections.values['旧格式保留'] = (0, util_1.unique)(unresolved);
    }
    return sections;
}

function originalLines(content) {
    return String(content ?? '').replace(/\r/g, '').split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !/^【\s*[^】]+\s*】$/u.test(line))
        .map((line) => (0, parser_1.normalizePointLine)(line));
}

function trimPrompt(value) {
    return value.length <= constants_1.MAX_CONTEXT_CHARS
        ? value
        : `${value.slice(0, constants_1.MAX_CONTEXT_CHARS)}\n[已按字符上限截断]`;
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
        const candidates = (0, matcher_1.matchBlock)(block, index, contextText, settings.matchWeights, settings.bodyMatchThreshold);
        const target = (0, matcher_1.selectBestCandidate)(candidates, Math.max(300, settings.matchWeights.keywordContains - 80));
        if (!target) {
            const substantive = block.sections.some((section) => isBusinessFactSection(section.name) && !section.empty && section.lines.length > 0);
            if (!substantive) {
                operations.push(noop(block.title, undefined, '', '所有业务小标题均为“无”，不创建空条目'));
                continue;
            }
            operations.push({
                id: operationId('create-entry', block.title, ''),
                kind: 'create-entry',
                operation: 'create',
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
                const lines = linesWithoutCrossSectionDuplicates(block, section);
                if (!lines.length) { operations.push(noop(block.title, undefined, section.name, '该信息已在同一对象的主要归属小标题中表达')); continue; }
                if (/事件进程/u.test(section.name) && block.type !== '事件') { operations.push(noop(block.title, undefined, section.name, '事件进程只能写入事件条目')); continue; }
                operations.push(...operationsForNewSection(block.title, section.name, lines, policyFor(section.name, settings)));
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
            const lines = linesWithoutCrossSectionDuplicates(block, section);
            if (!lines.length) { operations.push(noop(entry.title, entry.uid, section.name, '该信息已在同一对象的主要归属小标题中表达', target.score, target.evidence)); continue; }
            if (/事件进程/u.test(section.name) && block.type !== '事件') { operations.push(noop(entry.title, entry.uid, section.name, '事件进程只能写入事件条目', target.score, target.evidence)); continue; }
            const lifecycle = lifecycleOperation(entry, section.name, lines, target.score, target.evidence, blocks, settings);
            if (lifecycle) {
                operations.push(lifecycle);
                continue;
            }
            operations.push(...operationsForExisting(entry, section.name, lines, policyFor(section.name, settings), settings, target.score, target.evidence));
        }
    }
    operations.push(...preExitCandidateOperations(blocks, entries, settings));
    operations.push(...summaryExitSuggestionOperations(blocks, entries, settings, operations));
    operations.push(...absorbedSmallSummaryOperations(blocks, entries, settings, operations));
    return { blocks, operations: dedupeOperations(operations), createdAt: Date.now() };
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
                    activation: { enabled: true, constant: false, selective: false, vectorized: true, recursive: true, preventRecursion: false, depth: 4, order: 400, position: 0, probability: 100, disabled: false },
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
    const incomingLines = collapseIncomingBySlot(lines, policy);
    const otherFacts = Object.entries(entry.sections.values)
        .filter(([name]) => name !== section && !/(关键词|触发词|标签|分类|别名|称号)/u.test(name))
        .flatMap(([, values]) => values);
    for (const incomingRaw of incomingLines) {
        const incoming = (0, parser_1.normalizePointLine)(incomingRaw);
        const duplicateElsewhere = otherFacts.find((line) => (0, util_1.normalizeFact)(line) === (0, util_1.normalizeFact)(incoming));
        if (duplicateElsewhere) {
            result.push(noop(entry.title, entry.uid, section, '相同事实已存在于该条目的其他主要归属小标题，拒绝重复写入', score, evidence));
            continue;
        }
        const threshold = policy === 'append-chain' ? settings.chainDuplicateSimilarity : settings.duplicateSimilarity;
        const similar = strongestSimilarity(incoming, current);
        const anchor = informationAnchor(incoming);
        const anchoredOld = anchor ? current.find((line) => informationAnchor(line) === anchor) : undefined;
        if (policy === 'replace-by-anchor' && anchoredOld) {
            if ((0, util_1.normalizeFact)(anchoredOld) === (0, util_1.normalizeFact)(incoming)) {
                result.push(noop(entry.title, entry.uid, section, '同一当前状态槽的值未变化', score, evidence));
                continue;
            }
            result.push(op('replace-line', entry.title, entry.uid, section, anchoredOld, incoming, `同一信息槽“${anchor}”更新当前值`, score, evidence));
            continue;
        }
        if (policy === 'semantic-upsert' && anchoredOld) {
            if ((0, util_1.normalizeFact)(anchoredOld) === (0, util_1.normalizeFact)(incoming)
                || (0, util_1.diceSimilarity)(anchoredOld, incoming) >= 0.97) {
                result.push(noop(entry.title, entry.uid, section, '同一固定事实槽没有实质变化', score, evidence));
                continue;
            }
            result.push(op('replace-line', entry.title, entry.uid, section, anchoredOld, incoming, `同一固定信息槽“${anchor}”被新事实替换`, score, evidence));
            if (/固定事实/u.test(section)) result.push(op('append-line', entry.title, entry.uid, '历史事实', undefined, `变更前：${anchoredOld}`, '固定事实发生明确变化，保留旧事实历史', score, evidence));
            continue;
        }
        if (similar && similar.score >= threshold) {
            result.push(noop(entry.title, entry.uid, section, `语义相似 ${(similar.score * 100).toFixed(0)}%，跳过重复信息点`, score, evidence));
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
function collapseIncomingBySlot(lines, policy) {
    if (policy !== 'replace-by-anchor' && policy !== 'semantic-upsert')
        return lines;
    const output = [];
    const positions = new Map();
    for (const line of lines) {
        const anchor = informationAnchor(line);
        if (!anchor) {
            output.push(line);
            continue;
        }
        if (positions.has(anchor))
            output[positions.get(anchor)] = line;
        else {
            positions.set(anchor, output.length);
            output.push(line);
        }
    }
    return output;
}
function lifecycleOperation(entry, section, lines, score, evidence, blocks, settings) {
    if (!/(沉降处理|条目处理|生命周期|退出处理)/u.test(section)) return null;
    const value = lines[0]?.trim() ?? '';
    if (KEEP_OPTIONS.has(value)) return noop(entry.title, entry.uid, section, `生命周期选项为“${value}”，保持条目`, score, evidence);
    const requestedArchive = ARCHIVE_OPTIONS.has(value);
    const requestedDelete = DELETE_OPTIONS.has(value);
    if (!requestedArchive && !requestedDelete) return noop(entry.title, entry.uid, section, `未知生命周期选项“${value}”，不执行`, score, evidence);
    if (isProtected(entry, settings)) return noop(entry.title, entry.uid, section, '焦点、手动锁定或基础设定条目不得自动退出', score, evidence);
    const state = (entry.sections.values['生命周期'] ?? []).join(' ');
    if (!/(预退出|已沉降|已分发影响)/u.test(state)) return op('replace-section', entry.title, entry.uid, '生命周期', state, '预退出', '首次退出建议只标记预退出，不立即归档或删除', score, evidence);
    if (!hasDistributionEvidence(blocks, entry)) return noop(entry.title, entry.uid, section, '未找到与该对象绑定的影响分发证据，拒绝归档或删除', score, evidence);
    return requestedArchive
        ? op('archive-entry', entry.title, entry.uid, section, undefined, value, '对象已预退出且影响已明确分发，进入归档阶段', score, evidence)
        : op('delete-entry', entry.title, entry.uid, section, undefined, value, '对象已预退出且影响已明确分发，可删除临时条目', score, evidence);
}
function preExitCandidateOperations(blocks, entries, settings) {
    const output = [];
    for (const block of blocks) {
        for (const section of block.sections) {
            if (!/预退出候选/u.test(section.name) || section.empty) continue;
            for (const line of section.lines) {
                const entry = suggestedEntry(line, entries);
                if (!entry || isProtected(entry, settings)) continue;
                const current = (entry.sections.values['生命周期'] ?? []).join('\n');
                if (/预退出/u.test(current)) continue;
                output.push(op('replace-section', entry.title, entry.uid, '生命周期', current, '预退出', '小总结提出预退出候选，插件只标记预退出', undefined, [{ kind: 'summary-candidate', score: 0, detail: block.title }]));
            }
        }
    }
    return output;
}
function summaryExitSuggestionOperations(blocks, entries, settings, plannedOperations) {
    const output = [];
    for (const block of blocks) {
        if (!/^(?:小总结|大总结)$/u.test(block.type))
            continue;
        for (const section of block.sections) {
            const archive = /归档建议/u.test(section.name);
            const remove = /删除建议/u.test(section.name);
            if ((!archive && !remove) || section.empty)
                continue;
            for (const line of section.lines) {
                const entry = suggestedEntry(line, entries);
                if (!entry || entry.activation.disabled || isProtected(entry, settings))
                    continue;
                const current = (entry.sections.values['生命周期'] ?? []).join('\n');
                if (!/(预退出|已沉降|已分发影响)/u.test(current)) {
                    output.push(op('replace-section', entry.title, entry.uid, '生命周期', current, '预退出', `${block.type}提出退出建议，插件先标记预退出`, undefined, [{ kind: 'summary-exit-candidate', score: 0, detail: block.title }]));
                    continue;
                }
                if (!hasPlannedDistributionEvidence(plannedOperations, entry)) {
                    output.push(noop(entry.title, entry.uid, section.name, '退出建议缺少影响分发证据，拒绝执行', undefined, [{ kind: 'summary-exit-candidate', score: 0, detail: block.title }]));
                    continue;
                }
                if (remove && !entry.managed) {
                    output.push(noop(entry.title, entry.uid, section.name, '非镜渊管理条目不得自动删除', undefined, [{ kind: 'summary-exit-candidate', score: 0, detail: block.title }]));
                    continue;
                }
                output.push(op(remove ? 'delete-entry' : 'archive-entry', entry.title, entry.uid, section.name, undefined, remove ? '删除' : '归档', `${block.type}建议已通过预退出、影响分发与保护规则校验`, undefined, [{ kind: 'summary-exit-candidate', score: 0, detail: block.title }]));
            }
        }
    }
    return output;
}
function suggestedEntry(line, entries) {
    const uid = String(line ?? '').match(/(?:^|\s)UID\s*[:：=]\s*([^\s）)]+)/iu)?.[1];
    if (uid)
        return entries.find((entry) => entry.uid === uid);
    const title = (0, util_1.normalizeTitle)(String(line ?? '').trim());
    if (!(0, util_1.splitTitle)(title))
        return null;
    const matches = entries.filter((entry) => (0, util_1.normalizeTitle)(entry.title) === title);
    return matches.length === 1 ? matches[0] : null;
}
function absorbedSmallSummaryOperations(blocks, entries, settings, plannedOperations) {
    const output = [];
    for (const block of blocks) {
        if ((0, util_1.normalizeTitle)(block.title) !== (0, util_1.normalizeTitle)('大总结｜当前')) continue;
        const currentLarge = entries.find((entry) => (0, util_1.normalizeTitle)(entry.title) === (0, util_1.normalizeTitle)('大总结｜当前'));
        const existingLongTermFacts = currentLarge
            ? Object.entries(currentLarge.sections.values)
                .filter(([section]) => isBusinessFactSection(section))
                .flatMap(([, lines]) => lines)
            : [];
        const plannedLongTermFacts = plannedOperations
            .filter((operation) => ['append-line', 'replace-line', 'replace-section'].includes(operation.kind)
                && (0, util_1.normalizeTitle)(operation.title) === (0, util_1.normalizeTitle)('大总结｜当前')
                && isBusinessFactSection(operation.section))
            .flatMap((operation) => String(operation.newValue ?? '').split('\n'))
            .filter(Boolean);
        const longTermFacts = [...existingLongTermFacts, ...plannedLongTermFacts];
        for (const section of block.sections) {
            if (!/已吸收小总结/u.test(section.name) || section.empty) continue;
            for (const line of section.lines) {
                const title = (0, util_1.normalizeTitle)(line);
                const entry = entries.find((item) => item.type === '小总结' && (0, util_1.normalizeTitle)(item.title) === title);
                if (!entry || isProtected(entry, settings) || entry.activation.disabled) continue;
                if (!hasSummaryAbsorptionCoverage(entry, longTermFacts)) {
                    output.push(noop(entry.title, entry.uid, '已吸收小总结', '大总结没有可验证的实质长期事实覆盖，拒绝归档小总结'));
                    continue;
                }
                output.push(op('archive-entry', entry.title, entry.uid, '已吸收小总结', undefined, '归档', '大总结已明确吸收该小总结，归档旧的当前召回资格', undefined, [{ kind: 'large-summary-absorption', score: 0, detail: block.title }]));
            }
        }
    }
    return output;
}

function hasDistributionEvidence(blocks, entry) {
    return blocks.some((block) => block.title !== entry.title
        && block.sections.some((section) => isBusinessFactSection(section.name)
            && section.lines.some((line) => hasExplicitEntryReference(line, entry))));
}
function hasPlannedDistributionEvidence(operations, entry) {
    return operations.some((operation) => ['append-line', 'replace-line', 'replace-section'].includes(operation.kind)
        && operation.title !== entry.title
        && isBusinessFactSection(operation.section)
        && hasExplicitEntryReference(operation.newValue, entry));
}
function isControlSection(section) {
    return /(沉降处理|条目处理|生命周期|退出处理|预退出候选|归档建议|删除建议|已吸收小总结|影响对象|关联条目|关联对象|涉及条目|参与对象|引用)/u.test(String(section ?? ''));
}
function isBusinessFactSection(section) {
    return Boolean(String(section ?? '').trim())
        && !isControlSection(section)
        && !/(关键词|触发词|标签|分类|别名|称号|其他名称)/u.test(String(section));
}
function hasExplicitEntryReference(value, entry) {
    const text = String(value ?? '').normalize('NFKC').replace(/[|丨]/gu, '｜');
    const title = String(entry.title ?? '').normalize('NFKC').replace(/[|丨]/gu, '｜').trim();
    if (title && containsDelimited(text, title))
        return true;
    const uid = String(entry.uid ?? '').trim();
    if (!uid)
        return false;
    const matches = [...text.matchAll(/(?:^|[\s（(【])UID\s*[:：=]\s*([^\s，,；;。.!！?？、）)】]+)/giu)];
    return matches.some((match) => String(match[1] ?? '') === uid);
}
function containsDelimited(text, needle) {
    let start = text.indexOf(needle);
    while (start >= 0) {
        const before = start > 0 ? text[start - 1] : '';
        const after = text[start + needle.length] ?? '';
        const leftBoundary = !before || /[\s，,；;：:。.!！?？、（(【“”‘’]/u.test(before);
        const rightBoundary = !after || /[\s，,；;：:。.!！?？、）)】“”‘’]/u.test(after);
        if (leftBoundary && rightBoundary)
            return true;
        start = text.indexOf(needle, start + needle.length);
    }
    return false;
}
function hasSummaryAbsorptionCoverage(entry, longTermFacts) {
    const facts = longTermFacts.map((line) => String(line ?? '').trim()).filter(Boolean);
    if (!facts.length)
        return false;
    const sourceFacts = Object.entries(entry.sections.values)
        .filter(([section]) => isBusinessFactSection(section))
        .flatMap(([, lines]) => lines)
        .map((line) => String(line ?? '').trim())
        .filter(Boolean);
    if (!sourceFacts.length)
        return false;
    const scope = (0, util_1.normalizeFact)(entry.name);
    return facts.some((fact) => sourceFacts.some((source) => (0, util_1.diceSimilarity)(fact, source) >= 0.42
        || (scope.length >= 2 && (0, util_1.normalizeFact)(fact).includes(scope) && (0, util_1.normalizeFact)(source).includes(scope))));
}
function isProtected(entry, settings) {
    if (entry.focus || entry.locked) return true;
    const foundation = settings.keywordDefinitions.find((item) => item.label === '基础设定');
    const names = foundation ? [foundation.label, ...foundation.aliases] : ['基础设定'];
    return entry.keywords.some((keyword) => names.some((name) => (0, util_1.normalizeFact)(keyword) === (0, util_1.normalizeFact)(name)));
}
function linesWithoutCrossSectionDuplicates(block, section) {
    if (!/近期经历/u.test(section.name)) return section.lines;
    const current = block.sections.filter((item) => /当前状态/u.test(item.name)).flatMap((item) => item.lines).map(util_1.normalizeFact);
    return section.lines.filter((line) => !current.includes((0, util_1.normalizeFact)(line)));
}
function dedupeOperations(operations) {
    const seen = new Set();
    return operations.filter((operation) => {
        if (seen.has(operation.id)) return false;
        seen.add(operation.id);
        return true;
    });
}
function policyFor(section, settings) {
    const exact = settings.sectionPolicies[section];
    if (exact)
        return exact;
    if (/(关键词|触发词|别名|称号)/u.test(section))
        return 'merge-keywords';
    if (/(关联条目|关联对象|涉及条目|参与对象|引用|影响对象|已吸收小总结)/u.test(section))
        return 'merge-titles';
    if (/(事件进程|事件链|进程|过程|阶段记录|近期经历|行动记录|历史事实|变化记录)/u.test(section))
        return 'append-chain';
    if (/(当前|状态|位置|持有者|所有者|归属|数量|完整性|可用性|阶段|当前结果|活动状态)/u.test(section))
        return 'replace-by-anchor';
    if (/(完整摘要|当前总结|长期总结|对象定义|基础定义)/u.test(section))
        return 'replace-section';
    return 'semantic-upsert';
}
function informationAnchor(line) {
    const normalized = (0, util_1.normalizeFact)(line);
    const label = line.match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1]?.trim();
    if (label)
        return `label:${(0, util_1.normalizeFact)(label)}`;
    const fieldPattern = /^(.{1,24}?)(?:的)?(身份|血统|种族|职业|阵营|关系|能力|所有者|持有者|位置|阶段|结果|生死状态|身体状况|当前目标)(?:是|为|变为|变成)(.+)$/u;
    const fieldMatch = line.match(fieldPattern);
    if (fieldMatch)
        return `${(0, util_1.normalizeFact)(fieldMatch[1] ?? '')}|${(0, util_1.normalizeFact)(fieldMatch[2] ?? '')}`;
    const patterns = [
        [/^(.{1,24}?)(?:当前)?(?:位于|身处|在)(.+)$/u, '当前位置'],
        [/^(.{1,24}?)(?:当前)?(?:由|归)(.{1,24}?)(?:持有|拥有|保管)$/u, '持有者'],
        [/^(.{1,24}?)(?:当前)?(?:状态为|处于)(.+)$/u, '一般状态'],
        [/^(.{1,24}?)(?:死亡|身亡|存活|复活)(.*)$/u, '生死状态'],
        [/^(.{1,24}?)(?:昏迷|清醒|失去意识|恢复意识)(.*)$/u, '意识状态'],
        [/^(.{1,24}?)(?:受伤|痊愈|中毒|患病|康复)(.*)$/u, '身体状况'],
        [/^(.{1,24}?)(?:加入|离开|背叛)(.*)$/u, '当前阵营'],
        [/^(.{1,24}?)(?:获得|失去|持有|拥有)(.*)$/u, '持有资源'],
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
    const aliasSection = operation.kind === 'merge-keywords' && /(别名|称号|其他名称)/u.test(section);
    if (section && (!['merge-keywords', 'archive-entry', 'delete-entry'].includes(operation.kind) || aliasSection) && !values[section]) {
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
        if (aliasSection) {
            values[section] = (0, util_1.unique)([...(values[section] ?? []), operation.newValue]);
            entry.aliases = (0, util_1.unique)([...entry.aliases, operation.newValue]);
        }
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
    return { id: operationId(kind, title, `${section}|${oldValue}|${newValue}`), kind, operation: businessOperationKind(kind), title, ...(targetUid ? { targetUid } : {}), ...(section ? { section } : {}), ...(oldValue !== undefined ? { oldValue } : {}), ...(newValue !== undefined ? { newValue } : {}), reason, ...(score !== undefined ? { score } : {}), ...(matchEvidence ? { matchEvidence } : {}) };
}
function noop(title, targetUid, section, reason, score, matchEvidence) {
    return op('noop', title, targetUid, section, undefined, undefined, reason, score, matchEvidence);
}
function operationId(kind, title, value) {
    return `${kind}:${(0, util_1.hashText)(`${kind}|${title}|${value}`)}`;
}
function businessOperationKind(kind) {
    return ({
        'append-line': 'append',
        'replace-line': 'replace-slot',
        'replace-section': 'replace-section',
        'merge-keywords': 'merge-keywords',
        'merge-titles': 'append',
        'create-entry': 'create',
        'archive-entry': 'archive',
        'delete-entry': 'delete',
        noop: 'no-op',
    })[kind] ?? kind;
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
const PLAIN_SECTION_PATTERN = /^\s*([^：:\n]{1,24})\s*[:：]\s*$/u;
const TITLE_PATTERN = /^\s*(?:#{1,6}\s*)?([^【】\n]+?[｜|丨][^【】\n]+?)\s*$/u;
const COLON_TITLE_PATTERN = /^\s*(?:#{1,6}\s*)?((?:人物|角色|NPC|事件|地点|场景|物品|组织|关系|能力|任务|契约|资源|状态影响|基础设定|全局变化|时空|自定义对象|小总结|大总结))\s*[:：]\s*([^：:\n]+?)\s*$/u;
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
    if (text.trim() === '无')
        return [];
    const lines = text.replace(/\r/g, '').split('\n');
    const blocks = [];
    let block = null;
    let section = null;
    for (const sourceLine of lines) {
        const line = sourceLine.trimEnd();
        const sectionMatch = line.match(SECTION_PATTERN) ?? (block ? line.match(PLAIN_SECTION_PATTERN) : null);
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
        const titleMatch = line.match(TITLE_PATTERN) ?? line.match(COLON_TITLE_PATTERN);
        if (titleMatch && !SECTION_PATTERN.test(line)) {
            const rawTitle = titleMatch.length >= 3 ? `${titleMatch[1]}｜${titleMatch[2]}` : titleMatch[1].trim();
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
    const valid = blocks.filter((candidate) => candidate.sections.length > 0);
    if (!valid.length) throw new Error('模型返回无法解析：只有精确的“无”才表示无更新');
    return valid;
}
function parseEntrySections(content) {
    const order = [];
    const values = {};
    let current = '';
    for (const sourceLine of String(content ?? '').replace(/\r/g, '').split('\n')) {
        const line = sourceLine.trimEnd();
        const match = line.match(SECTION_PATTERN) ?? line.match(PLAIN_SECTION_PATTERN);
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
"parsing/audit-parser":function(module,exports,require){
"use strict";
const { parseAuditResult } = require("../audit");
exports.parseAuditResult = parseAuditResult;

},
"parsing/information-point-parser":function(module,exports,require){
"use strict";
const { parseInformationPoints, normalizePointLine } = require("../parser");
exports.parseInformationPoints = parseInformationPoints;
exports.normalizePointLine = normalizePointLine;

},
"parsing/summary-parser":function(module,exports,require){
"use strict";
const { parseInformationPoints, parseEntrySections } = require("../parser");
exports.parseSummary = parseInformationPoints;
exports.parseEntrySections = parseEntrySections;

},
"parsing/tolerant-text-cleaner":function(module,exports,require){
"use strict";
const { sanitizeModelText, normalizePointLine } = require("../parser");
exports.sanitizeModelText = sanitizeModelText;
exports.normalizePointLine = normalizePointLine;

},
"prompts":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractionPrompts = extractionPrompts;
exports.auditPrompts = auditPrompts;
exports.revisionPrompts = revisionPrompts;
exports.summaryPrompts = summaryPrompts;
exports.migrationPrompts = migrationPrompts;
exports.keywordTemplate = keywordTemplate;
const util_1 = require("./util");
function auditPrompts(settings, playerText, assistantText) {
    const system = `你是“镜渊”的正文审核脚本。你只判断已经生成的角色正文是否违反玩家规则。

只能返回以下两种结果之一：
通过

或者：
需要修正
【违反规则】
- 逐条指出违反的玩家规则

要求：
1. 只依据玩家规则、玩家输入和待审核正文判断。
2. 没有明确违规时只返回“通过”。
3. 需要修正时只说明违反的规则；不得在本次审核回复中提供修正文、补丁或改写建议。
4. 不读取或操作世界书，不提取事实，不生成总结，不输出 JSON、代码块或思考过程。`;
    const user = `【玩家审核规则】\n${settings.auditPrompt || '（无）'}\n\n【玩家输入】\n${playerText || '（空）'}\n\n【待审核正文】\n${assistantText}`;
    return { system, user };
}
function revisionPrompts(settings, playerText, assistantText, issues) {
    const system = `你是“镜渊”审核模块内部的正文修正脚本。审核脚本已经确认正文需要修正。

输出规则：
1. 只返回完整修正版正文。
2. 不返回解释、分析、标题、前言、结语、修改建议、差异或局部补丁。
3. 只修正已指出的违规处；保留其余内容和原有文风。
4. 不扩写剧情，不添加未发生事实、动作、对白、心理或结论。
5. 不读取或操作世界书，不提取事实，不生成总结，不输出 JSON、代码块或思考过程。

【玩家修正要求】
${settings.revisionPrompt || '（无附加要求）'}`;
    const user = `【玩家审核规则】\n${settings.auditPrompt || '（无）'}\n\n【玩家输入】\n${playerText || '（空）'}\n\n【审核确认的违规】\n${issues.map((item) => `- ${item}`).join('\n')}\n\n【原 AI 正文】\n${assistantText}\n\n请直接返回完整修正版正文。`;
    return { system, user };
}
function extractionPrompts(settings, playerText, assistantText, relevant) {
    const template = keywordTemplate(settings.keywordDefinitions);
    const existing = relevant.map(entryForPrompt).join('\n\n');
    const custom = settings.extractionPrompt.trim();
    const system = `你是“镜渊”的事实与状态提取脚本。你只输出候选事实，不管理数据库，也不决定世界书 UID、创建、覆盖、删除、常驻、向量、递归、深度、顺序或概率。

固定输出语法：
类型｜稳定名称
【关键词】
- 关键词
【小标题】
- 一条明确事实

本轮没有任何值得记录的信息时，只返回：
无

规则：
1. 只提取最终可见正文中已经明确发生、能够被正文直接支持、会影响后续叙事的事实。
2. 已有对象沿用提供的稳定标题；人物、地点、事件和物品不得自行改名。
3. 每行只表达一个主体的一项事实、状态、关系、动作或直接结果。
4. 当前状态写最新值；不要重复旧当前位置、旧持有者、旧阶段或已存在事实。
5. 可提取明确的事件结束、预退出或待沉降候选，但只能作为语义候选，不能命令插件删除条目；若其他对象的信息点承接其长期影响，须用“类型｜名称：影响”或明确 UID 引用来源。
6. 普通服装、纯修辞、瞬时表情、气氛、一次性背景细节和无后续意义的信息不记录。
7. 不得补全未发生内容，不得把计划、可能、推测、未来预测或角色不知道的信息升级为事实。
8. 可选字段没有内容时写“无”；不得用旧事实补齐。
9. 默认关键词不是白名单；必要时可使用准确的新关键词。
10. 完整关系事实只写入一个“关系｜稳定关系名称”条目；人物等其他条目只在【关联条目】引用它。
11. 【事件进程】只用于事件条目；人物条目只记录事件对人物造成的持续影响。
12. 【当前状态】只写仍成立的最新值；【近期经历】不得复制同一句当前状态。
13. 除结果外不输出解释、前言、结语、JSON、代码块或思考过程。

默认关键词及建议小标题：
${template}${custom ? `\n\n【玩家附加提取要求】\n${custom}` : ''}`;
    const user = `【当前世界书中的直接相关条目】\n${existing || '（无）'}\n\n【玩家本轮输入】\n${playerText || '（空）'}\n\n【本轮最终可见正文】\n${assistantText}\n\n请直接填写；没有核心变化时只返回“无”。`;
    return { system, user };
}
function summaryPrompts(kind, settings, entries, subject, recentConversation = '') {
    const isSmall = kind === 'small';
    const custom = (isSmall ? settings.smallSummaryPrompt : settings.largeSummaryPrompt).trim();
    const format = isSmall
        ? `小总结｜稳定事件名称\n【关键词】\n- 小总结\n- 事件\n【当前场景】\n- 当前继续叙事必须知道的场景状态\n【当前参与者】\n- 类型｜名称\n【关键行动与后果】\n- 已经明确发生的行动和后果\n【未解决事项】\n- 已经客观存在但仍未解决的问题，若无则写“无”\n【关系与资源变化】\n- 下一轮必须连续的关系、资源或状态，若无则写“无”\n【预退出候选】\n- 类型｜名称，若无则写“无”\n【归档建议】\n- 类型｜名称，若无则写“无”\n【删除建议】\n- 类型｜名称，若无则写“无”`
        : `大总结｜当前\n【关键词】\n- 大总结\n【长期关系变化】\n- 跨场景仍成立的关系与立场\n【永久影响】\n- 已完成事件及其永久后果\n【长期目标与约束】\n- 目标、组织、制度、契约、承诺和世界规则\n【重要资源变化】\n- 对未来仍有影响的资源变化\n【已吸收小总结】\n- 小总结｜稳定事件名称，若无则写“无”\n【归档建议】\n- 类型｜名称，若无则写“无”\n【删除建议】\n- 类型｜名称，若无则写“无”`;
    const system = `你是“镜渊”的${isSmall ? '小总结脚本' : '大总结脚本'}。你整理叙事连续性候选，不直接操作世界书。

固定输出格式：
${format}

没有可更新内容时只返回：
无

要求：
1. ${isSmall ? '结合最近若干轮正文、当前事件相关条目和上一次小总结，回答“接下来继续当前事件线必须知道什么”。' : '使用上一版大总结、已完成的小总结和已确认的重要长期条目，回答“即使近期过程被遗忘，跨场景继续仍必须知道什么”。'}
2. ${isSmall ? '保留重要因果、直接后果、明确未解决事项以及对人物、关系、地点、物品和组织的持续影响。' : '保留长周期剧情变化、核心关系与立场、任务契约、长期冲突结果和世界状态。'}
3. ${isSmall ? '删除重复表述和无持续价值的过程描写，不复述整段正文。' : '信息颗粒度必须明显低于小总结；不得堆积所有场景细节。'}
4. 不补充未发生动机，不把推测写成事实，不自行改变基础事实。
5. 只输出总结候选内容和引用对象；不得直接决定条目 UID、删除、召回字段或 SillyTavern 原生参数。
6. ${isSmall ? '同一事件范围只允许一个当前小总结标题。' : '标题必须是“大总结｜当前”，用于替换上一版当前大总结；不得生成多个并行当前版本。'}
7. 如需更新其他世界书对象，可在总结条目之后继续输出“类型｜名称＋小标题＋信息点”；归档或删除只能写成建议，由插件校验。用于证明影响已经分发的信息点必须以“类型｜名称：影响”或明确 UID 引用来源，关键词、别名和关联列表不算分发。
8. 不输出 JSON、代码块、说明或分析过程。${custom ? `\n\n【玩家附加总结要求】\n${custom}` : ''}`;
    const recent = isSmall ? `\n\n【最近若干轮玩家与 AI 正文】\n${recentConversation || '（无）'}` : '';
    const user = `【总结范围】\n${subject || (isSmall ? '当前事件线' : '长期叙事')}${recent}\n\n【已确认的世界书条目】\n${entries.map(entryForPrompt).join('\n\n') || '（无）'}\n\n请直接输出结果；没有变化只返回“无”。`;
    return { system, user };
}
function migrationPrompts(title, content, keywords) {
    const system = `你是“镜渊”的世界书格式整理脚本。只整理给定旧条目的文字格式，不改变事实，不补充推测。

输出一个条目，格式为：
类型｜稳定名称
【关键词】
- 关键词
【合适的小标题】
- 原有信息点

要求：
1. 保留所有原有事实、限定词、否定、时间关系和不确定性。
2. 不输出 UID，不决定常驻、向量、递归、深度、顺序、位置或概率。
3. 无法可靠归类的原文放入【旧格式保留】，不得删除。
4. 不输出解释、JSON、代码块或思考过程。`;
    const user = `【原标题】\n${title || '（空）'}\n\n【原关键词】\n${keywords.join('、') || '（无）'}\n\n【原正文】\n${content || '（空）'}\n\n请直接输出整理后的完整条目。`;
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
"revision":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevisionService = void 0;
exports.parseRevisionResult = parseRevisionResult;
const constants_1 = require("./constants");
const parser_1 = require("./parser");
const prompts_1 = require("./prompts");

class RevisionService {
    constructor(host, getSettings) {
        this.host = host;
        this.getSettings = getSettings;
    }
    async revise(settings, snapshot, issues) {
        this.host.assertSnapshot(snapshot, this.getSettings());
        const prompt = (0, prompts_1.revisionPrompts)(settings, snapshot.playerText, snapshot.assistantText, issues);
        const raw = await this.host.generate(prompt.system, trimPrompt(prompt.user), settings.responseTokens, snapshot, settings, settings.requestTimeoutMs, settings.revisionProfileId);
        this.host.assertSnapshot(snapshot, this.getSettings());
        const revisedText = parseRevisionResult(raw);
        if (revisedText === snapshot.assistantText)
            throw new Error('修正模型返回的正文与原正文完全相同');
        return revisedText;
    }
}
exports.RevisionService = RevisionService;

function parseRevisionResult(raw) {
    const text = (0, parser_1.sanitizeModelText)(raw).trim();
    if (!text)
        throw new Error('修正模型没有返回完整正文');
    if (/^\s*(?:以下是|这是|修正版|修改后|完整修正版|修改说明|修改建议|局部补丁)\s*[：:]/u.test(text)
        || /^\s*【\s*(?:结论|问题|违反规则|修正版正文|修改说明)\s*】/u.test(text))
        throw new Error('修正模型返回了解释或包装标题，不是纯完整正文');
    if (/^(?:将|把).{0,80}(?:改为|替换为|删除)/u.test(text) && text.split('\n').length <= 3)
        throw new Error('修正模型返回了局部补丁，不是完整正文');
    return text;
}

function trimPrompt(value) {
    return value.length <= constants_1.MAX_CONTEXT_CHARS
        ? value
        : `${value.slice(0, constants_1.MAX_CONTEXT_CHARS)}\n[已按字符上限截断]`;
}

},
"runtime/cancellation":function(module,exports,require){
"use strict";
exports.createCancellationToken = () => ({ cancelled: false, reason: "" });
exports.cancelToken = (token, reason) => { token.cancelled = true; token.reason = String(reason || "任务已取消"); };
exports.assertNotCancelled = (token) => { if (token?.cancelled) throw new Error(token.reason || "任务已取消"); };

},
"runtime/chat-snapshot":function(module,exports,require){
"use strict";
exports.captureChatSnapshot = (host, settings, index, taskType, token) => host.captureSnapshot(settings, index, taskType, token);
exports.captureMaintenanceSnapshot = (host, settings, taskType, token) => host.captureMaintenanceSnapshot(settings, taskType, token);

},
"runtime/per-chat-lock":function(module,exports,require){
"use strict";
class PerChatLock {
    constructor() { this.active = new Set(); }
    acquire(chatKey) {
        if (this.active.has(chatKey)) return false;
        this.active.add(chatKey);
        return true;
    }
    release(chatKey) { this.active.delete(chatKey); }
    has(chatKey) { return this.active.has(chatKey); }
}
exports.PerChatLock = PerChatLock;

},
"runtime/task-status":function(module,exports,require){
"use strict";
class TaskStatus {
    constructor() { this.byChat = new Map(); }
    get(chatKey) { return structuredClone(this.byChat.get(chatKey) ?? { phase: "idle", detail: "", error: "" }); }
    set(chatKey, value) { this.byChat.set(chatKey, structuredClone(value)); }
    clear(chatKey) { this.byChat.delete(chatKey); }
}
exports.TaskStatus = TaskStatus;

},
"settings":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsStore = exports.DEFAULT_SETTINGS = exports.DEFAULT_LARGE_SUMMARY_PROMPT = exports.DEFAULT_SMALL_SUMMARY_PROMPT = exports.DEFAULT_EXTRACTION_PROMPT = exports.DEFAULT_REVISION_PROMPT = exports.DEFAULT_AUDIT_PROMPT = exports.DEFAULT_KEYWORDS = void 0;
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
        fields: fields.map((field) => ({
            ...(0, util_1.clone)(field),
            options: (0, util_1.normalizeStringArray)(field.options),
            prompt: String(field.prompt ?? ''),
        })),
    };
}
exports.DEFAULT_AUDIT_PROMPT = `- 不替玩家决定行动、态度、判断、目标或心理。
- 不把未发生、未确认、仅被计划或推测的内容写成事实。
- 不擅自改变已经成立的时间、地点、人物关系、物品状态和事件顺序。
- 发现明确违规时指出对应规则，不在审核回复中重写正文。`;
exports.DEFAULT_REVISION_PROMPT = `- 只修正审核已经指出的违规处。
- 必须返回完整修正版正文，不返回解释、分析、前言、结语或局部补丁。
- 保留原文风格、时间、地点、事件顺序和所有未违规内容。
- 不扩写剧情，不添加新事实、动作、对白、心理或结论。`;
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
    auditProfileId: '',
    revisionProfileId: '',
    extractionProfileId: '',
    smallSummaryProfileId: '',
    largeSummaryProfileId: '',
    migrationProfileId: '',
    autoProcess: true,
    auditEnabled: true,
    targetLorebook: '',
    autoCreateLorebook: false,
    auditPrompt: exports.DEFAULT_AUDIT_PROMPT,
    revisionPrompt: exports.DEFAULT_REVISION_PROMPT,
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
        auditProfileId: profileValue(candidate, 'auditProfileId'),
        revisionProfileId: profileValue(candidate, 'revisionProfileId'),
        extractionProfileId: profileValue(candidate, 'extractionProfileId'),
        smallSummaryProfileId: profileValue(candidate, 'smallSummaryProfileId'),
        largeSummaryProfileId: profileValue(candidate, 'largeSummaryProfileId'),
        migrationProfileId: profileValue(candidate, 'migrationProfileId'),
        autoProcess: candidate.autoProcess !== false,
        auditEnabled: candidate.auditEnabled !== false,
        targetLorebook: String(candidate.targetLorebook ?? ''),
        autoCreateLorebook: candidate.autoCreateLorebook === true,
        auditPrompt: String(candidate.auditPrompt ?? exports.DEFAULT_AUDIT_PROMPT) || exports.DEFAULT_AUDIT_PROMPT,
        revisionPrompt: String(candidate.revisionPrompt ?? exports.DEFAULT_REVISION_PROMPT) || exports.DEFAULT_REVISION_PROMPT,
        extractionPrompt: String(candidate.extractionPrompt ?? exports.DEFAULT_EXTRACTION_PROMPT) || exports.DEFAULT_EXTRACTION_PROMPT,
        smallSummaryPrompt: String(candidate.smallSummaryPrompt ?? exports.DEFAULT_SMALL_SUMMARY_PROMPT) || exports.DEFAULT_SMALL_SUMMARY_PROMPT,
        largeSummaryPrompt: String(candidate.largeSummaryPrompt ?? exports.DEFAULT_LARGE_SUMMARY_PROMPT) || exports.DEFAULT_LARGE_SUMMARY_PROMPT,
        responseTokens: (0, util_1.clampNumber)(candidate.responseTokens, 3072, 256, 16384),
        requestTimeoutMs: (0, util_1.clampNumber)(candidate.requestTimeoutMs, 90000, 10000, 300000),
        duplicateSimilarity: clampFloat(candidate.duplicateSimilarity, 0.86, 0.5, 0.99),
        chainDuplicateSimilarity: clampFloat(candidate.chainDuplicateSimilarity, 0.93, 0.6, 0.999),
        bodyMatchThreshold: clampFloat(candidate.bodyMatchThreshold, 0.48, 0.2, 0.95),
        smallSummaryTurns: (0, util_1.clampNumber)(candidate.smallSummaryTurns, 10, 1, 100),
        largeSummaryCount: (0, util_1.clampNumber)(candidate.largeSummaryCount, 4, 1, 30),
        keywordDefinitions: parseKeywordDefinitions(candidate.keywordDefinitions, candidate.tables),
        sectionPolicies,
        matchWeights: { ...exports.DEFAULT_SETTINGS.matchWeights, ...((0, util_1.isPlainObject)(candidate.matchWeights) ? candidate.matchWeights : {}) },
    };
}
function profileValue(candidate, key) {
    if (Object.prototype.hasOwnProperty.call(candidate, key))
        return String(candidate[key] ?? '');
    return candidate.modelSource === 'profile' ? String(candidate.modelProfileId ?? '') : '';
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
"ui/graph-view":function(module,exports,require){
"use strict";
module.exports = require("../control-panel");

},
"ui/information-view":function(module,exports,require){
"use strict";
module.exports = require("../control-panel");

},
"ui/keyword-view":function(module,exports,require){
"use strict";
module.exports = require("../control-panel");

},
"ui/matching-view":function(module,exports,require){
"use strict";
module.exports = require("../control-panel");

},
"ui/overview-view":function(module,exports,require){
"use strict";
module.exports = require("../control-panel");

},
"ui/settings-view":function(module,exports,require){
"use strict";
module.exports = require("../control-panel");

},
"ui/workspace-shell":function(module,exports,require){
"use strict";
module.exports = require("../control-panel");

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
    async list(settings, snapshot, validate) {
        return (await this.read(settings, snapshot, validate)).entries;
    }
    async read(settings, snapshot, validate) {
        validate?.();
        const { data, name } = await this.open(settings, false, validate, snapshot?.chatKey, snapshot?.worldbookName);
        if (snapshot?.worldbookName && name !== snapshot.worldbookName) throw new Error('读取到的世界书与任务快照不一致');
        validate?.();
        return { name, entries: parseEntries(data) };
    }
    async readRaw(settings, snapshot, validate) {
        validate?.();
        this.assertChat(snapshot?.chatKey ?? '');
        const opened = await this.open(settings, false, validate, snapshot?.chatKey, snapshot?.worldbookName);
        if (snapshot?.worldbookName && opened.name !== snapshot.worldbookName)
            throw new Error('读取到的世界书与任务快照不一致');
        validate?.();
        return { name: opened.name, data: (0, util_1.clone)(opened.data) };
    }
    async replaceRaw(settings, expectedName, nextData, snapshot, validate, expectedCurrentData) {
        validate?.();
        this.assertChat(snapshot?.chatKey ?? '');
        const opened = await this.open(settings, false, validate, snapshot?.chatKey, snapshot?.worldbookName);
        if (opened.name !== expectedName || (snapshot?.worldbookName && opened.name !== snapshot.worldbookName))
            throw new Error('目标世界书已经变化，拒绝恢复或整理');
        if (expectedCurrentData && digestWorldbook(opened.data) !== digestWorldbook(expectedCurrentData))
            throw new Error('世界书在整理期间已被其他操作修改，拒绝覆盖');
        opened.data = (0, util_1.clone)(nextData);
        opened.data.entries ?? (opened.data.entries = {});
        validate?.();
        await this.save(opened);
        validate?.();
        const verified = await opened.api.loadWorldInfo(opened.name);
        if (!verified || digestWorldbook(verified) !== digestWorldbook(opened.data))
            throw new Error('世界书完整快照保存后回读不一致');
        return parseEntries(verified);
    }
    async updateEntry(settings, uid, patch, snapshot, validate) {
        return this.mutate(settings, snapshot, validate, (opened) => {
            const located = findRawEntry(opened.data, uid);
            if (!located)
                throw new Error(`世界书条目 UID ${uid} 不存在`);
            const beforeNative = preservedNativeSnapshot(located.raw);
            if (patch.title !== undefined) {
                const title = (0, util_1.normalizeTitle)(String(patch.title ?? ''));
                if (!(0, util_1.splitTitle)(title))
                    throw new Error('条目标题必须使用“类型｜名称”格式');
                located.raw.comment = title;
            }
            if (patch.content !== undefined)
                located.raw.content = String(patch.content ?? '').trim();
            if (patch.keywords !== undefined)
                located.raw.key = (0, util_1.normalizeStringArray)(patch.keywords);
            markManaged(located.raw, '', String(located.raw.comment ?? ''), '');
            return {
                verify(data) {
                    const result = findRawEntry(data, uid);
                    if (!result)
                        throw new Error(`条目 UID ${uid} 保存后丢失`);
                    if (JSON.stringify(preservedNativeSnapshot(result.raw)) !== JSON.stringify(beforeNative))
                        throw new Error(`条目 UID ${uid} 的 SillyTavern 原生字段发生意外变化`);
                    if (patch.title !== undefined && (0, util_1.normalizeTitle)(String(result.raw.comment ?? '')) !== (0, util_1.normalizeTitle)(String(patch.title ?? '')))
                        throw new Error(`条目 UID ${uid} 标题保存失败`);
                    if (patch.content !== undefined && normalizeContent(result.raw.content) !== normalizeContent(patch.content))
                        throw new Error(`条目 UID ${uid} 正文保存失败`);
                },
            };
        });
    }
    async setLocked(settings, uid, locked, snapshot, validate) {
        return this.mutate(settings, snapshot, validate, (opened) => {
            const located = findRawEntry(opened.data, uid);
            if (!located)
                throw new Error(`世界书条目 UID ${uid} 不存在`);
            const extension = markManaged(located.raw, '', String(located.raw.comment ?? ''), '');
            extension.locked = locked === true;
            return {
                verify(data) {
                    const result = findRawEntry(data, uid);
                    if (!result || readExtension(result.raw).locked !== (locked === true))
                        throw new Error(`条目 UID ${uid} 的手动锁定状态保存失败`);
                },
            };
        });
    }
    async setFocus(settings, oldUid, nextUid, snapshot, validate) {
        return this.mutate(settings, snapshot, validate, (opened) => {
            const next = nextUid ? findRawEntry(opened.data, nextUid) : null;
            if (nextUid && !next)
                throw new Error(`焦点条目 UID ${nextUid} 不存在`);
            for (const [mapKey, raw] of Object.entries(opened.data.entries ?? {})) {
                if (!raw || typeof raw !== 'object')
                    continue;
                const extension = readExtension(raw);
                const effectiveUid = String(raw.uid ?? mapKey);
                const isOld = extension.focus === true || (oldUid && effectiveUid === String(oldUid));
                if (isOld && effectiveUid !== String(nextUid ?? '')) {
                    raw.constant = extension.focusPreviousConstant === true;
                    const marked = markManaged(raw, '', String(raw.comment ?? ''), '');
                    marked.focus = false;
                    delete marked.focusPreviousConstant;
                }
            }
            if (next) {
                const extension = markManaged(next.raw, '', String(next.raw.comment ?? ''), '');
                if (extension.focus !== true)
                    extension.focusPreviousConstant = next.raw.constant === true;
                extension.focus = true;
                next.raw.constant = true;
            }
            return {
                verify(data) {
                    const focused = Object.entries(data.entries ?? {})
                        .filter(([, raw]) => readExtension(raw).focus === true)
                        .map(([mapKey, raw]) => ({ uid: String(raw.uid ?? mapKey), raw }));
                    if (nextUid && (focused.length !== 1 || focused[0].uid !== String(nextUid)))
                        throw new Error('玩家焦点保存后未保持唯一');
                    if (!nextUid && focused.length)
                        throw new Error('玩家焦点清除失败');
                    if (nextUid && next && findRawEntry(data, nextUid)?.raw.constant !== true)
                        throw new Error('焦点条目未设置为 constant');
                },
            };
        });
    }
    async mutate(settings, snapshot, validate, mutate) {
        validate?.();
        this.assertChat(snapshot?.chatKey ?? '');
        const opened = await this.open(settings, false, validate, snapshot?.chatKey, snapshot?.worldbookName);
        if (snapshot?.worldbookName && opened.name !== snapshot.worldbookName)
            throw new Error('目标世界书已经变化，拒绝编辑');
        const beforeVersion = digestWorldbook(opened.data);
        const verifier = mutate(opened) ?? {};
        validate?.();
        const latest = await opened.api.loadWorldInfo(opened.name);
        if (!latest || digestWorldbook(latest) !== beforeVersion)
            throw new Error('世界书在编辑前已被其他操作修改，拒绝覆盖');
        validate?.();
        await this.save(opened);
        validate?.();
        const verified = await opened.api.loadWorldInfo(opened.name);
        if (!verified)
            throw new Error('世界书编辑后回读失败');
        verifier.verify?.(verified);
        return parseEntries(verified);
    }
    async apply(settings, plan, sourceMessageKey, contextText, focusUid, snapshot, validate) {
        validate?.();
        this.assertChat(snapshot?.chatKey ?? '');
        const opened = await this.open(settings, true, validate, snapshot?.chatKey, snapshot?.worldbookName);
        if (snapshot?.worldbookName && opened.name !== snapshot.worldbookName) throw new Error('目标世界书已经变化，拒绝提交');
        validate?.();
        const beforeVersion = digestWorldbook(opened.data);
        const before = parseEntries(opened.data);
        const writeOperations = plan.operations.filter((operation) => !['noop', 'archive-entry', 'delete-entry'].includes(operation.kind));
        const exitOperations = plan.operations.filter((operation) => ['archive-entry', 'delete-entry'].includes(operation.kind));
        const operationId = commitOperationId(sourceMessageKey, plan.operations);
        let expectedAfterWrites = before;
        if (writeOperations.length) {
            const phasePlan = { ...plan, operations: writeOperations };
            expectedAfterWrites = (0, operations_1.applyPlanToEntries)(phasePlan, before);
            const byUid = new Map(before.map((entry) => [entry.uid, entry]));
            const touchedUids = new Set(writeOperations.filter((operation) => operation.targetUid).map((operation) => String(operation.targetUid)));
            for (const entry of expectedAfterWrites) {
                if (entry.uid.startsWith('new:')) {
                    const created = this.createEntry(opened.api, opened.name, opened.data);
                    hydrateRaw(created, entry, sourceMessageKey, operationId);
                    entry.uid = String(created.uid);
                    entry.mapKey = findMapKey(opened.data, created);
                    entry.raw = created;
                } else if (touchedUids.has(entry.uid)) {
                    const original = byUid.get(entry.uid);
                    if (!original) throw new Error(`待更新条目 UID ${entry.uid} 不存在`);
                    hydrateRaw(original.raw, entry, sourceMessageKey, operationId);
                }
            }
            this.applyNativeFields(parseEntries(opened.data), settings, focusUid, new Set([...touchedUids, ...expectedAfterWrites.filter((entry) => entry.raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY]?.lastOperationId === operationId).map((entry) => entry.uid)]));
            validate?.();
            const latest = await opened.api.loadWorldInfo(opened.name);
            if (!latest || digestWorldbook(latest) !== beforeVersion) throw new Error('世界书在提交前已被其他操作修改，拒绝覆盖');
            validate?.();
            await this.save(opened);
        }
        validate?.();
        const verifiedData = await opened.api.loadWorldInfo(opened.name);
        if (!verifiedData) throw new Error('世界书写入后回读失败');
        verifyWriteResults(verifiedData, expectedAfterWrites, writeOperations, operationId, settings, focusUid);
        opened.data = verifiedData;
        validate?.();
        if (exitOperations.length) {
            const exitBaseVersion = digestWorldbook(opened.data);
            const currentEntries = parseEntries(opened.data);
            const archived = [];
            const deleted = [];
            for (const operation of exitOperations) {
                const target = currentEntries.find((entry) => entry.uid === String(operation.targetUid));
                const foundation = target?.keywords.some((keyword) => isFoundation(keyword, settings));
                if (!target || target.locked || target.focus || foundation || target.uid === String(focusUid ?? '')) continue;
                if (operation.kind === 'archive-entry') {
                    target.raw.disable = true;
                    target.raw.constant = false;
                    const extension = markManaged(target.raw, sourceMessageKey, target.title, operationId);
                    extension.lifecycle = 'archived';
                    archived.push(target.uid);
                } else {
                    delete opened.data.entries[target.mapKey];
                    deleted.push(target.uid);
                }
            }
            if (archived.length || deleted.length) {
                validate?.();
                const latestBeforeExit = await opened.api.loadWorldInfo(opened.name);
                if (!latestBeforeExit || digestWorldbook(latestBeforeExit) !== exitBaseVersion)
                    throw new Error('世界书在归档或删除前已被其他操作修改，拒绝覆盖');
                validate?.();
                await this.save(opened);
                validate?.();
                const finalData = await opened.api.loadWorldInfo(opened.name);
                if (!finalData) throw new Error('世界书归档或删除后回读失败');
                verifyExitResults(finalData, archived, deleted);
                opened.data = finalData;
            }
        }
        validate?.();
        return parseEntries(opened.data);
    }
    applyNativeFields(entries, settings, focusUid, touchedUids) {
        const normalizedFocusUid = String(focusUid ?? '');
        for (const entry of entries) {
            const focus = normalizedFocusUid ? entry.uid === normalizedFocusUid : entry.focus;
            if (!touchedUids.has(entry.uid) && !focus) continue;
            if (isFoundationEntry(entry, settings)) {
                entry.raw.constant = true;
                entry.raw.vectorized = false;
            }
            if (focus) entry.raw.constant = true;
            const extension = markManaged(entry.raw, '', entry.title, '');
            extension.focus = focus;
        }
    }
    assertChat(expected) { if (expected && this.chatKey() !== expected) throw new Error('聊天已经切换，拒绝写入世界书'); }
    async open(settings, create, validate, expectedChatKey = '', expectedName = '') {
        validate?.();
        this.assertChat(expectedChatKey);
        const api = await this.api();
        validate?.();
        this.assertChat(expectedChatKey);
        const context = this.context();
        const metadataKey = String(api.METADATA_KEY ?? 'world_info');
        let name = String(settings.targetLorebook || context.chatMetadata?.[metadataKey] || context.chatMetadata?.world_info || '').trim();
        let generatedName = false;
        if (!name && settings.autoCreateLorebook) {
            const display = (0, util_1.safeId)(context.name2 || context.name1 || 'Chat') || 'Chat';
            name = `MA_${display}`;
            generatedName = true;
        }
        if (!name) throw new Error('当前聊天未绑定世界书');
        if (expectedName && name !== expectedName)
            throw new Error('目标世界书已经变化，拒绝继续');
        validate?.();
        let data = await api.loadWorldInfo(name);
        validate?.();
        this.assertChat(expectedChatKey);
        if (!data && create) {
            if (typeof api.createNewWorldInfo !== 'function') throw new Error('SillyTavern 未提供 createNewWorldInfo');
            validate?.();
            await api.createNewWorldInfo(name, { interactive: false });
            validate?.();
            this.assertChat(expectedChatKey);
            data = await api.loadWorldInfo(name);
            validate?.();
        }
        if (!data && !create && generatedName)
            data = { entries: {} };
        if (!data) throw new Error(`世界书“${name}”不存在`);
        data.entries ?? (data.entries = {});
        if (create && context.chatMetadata?.[metadataKey] !== name) {
            validate?.();
            this.assertChat(expectedChatKey);
            context.chatMetadata ?? (context.chatMetadata = {});
            context.chatMetadata[metadataKey] = name;
            context.chatMetadata.world_info = name;
            if (typeof context.saveMetadata === 'function') await context.saveMetadata();
            else context.saveMetadataDebounced?.();
            validate?.();
            this.assertChat(expectedChatKey);
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
        const aliases = (0, util_1.unique)((0, parser_1.sectionLines)(content, ['别名', '称号', '其他名称']));
        const extension = readExtension(raw);
        output.push({ uid: String(raw.uid ?? mapUid), mapKey: String(mapUid), title, normalizedTitle: title.toLocaleLowerCase(), type: split.type, name: split.name, content, sections, keywords: (0, util_1.unique)([split.type, split.name, ...keywords]), aliases, references: (0, parser_1.extractReferences)(content), focus: extension.focus === true, locked: extension.locked === true || raw.locked === true, managed: extension.managed === true, updatedAt: Number(extension.updatedAt) || 0, activation: { enabled: raw.disable !== true, constant: raw.constant === true, selective: raw.selective === true, vectorized: raw.vectorized !== false, recursive: raw.recursive === true || (raw.preventRecursion !== true && raw.excludeRecursion !== true), preventRecursion: raw.preventRecursion === true, depth: Math.max(0, finiteNumber(raw.depth, 4)), order: finiteNumber(raw.order, 400), position: finiteNumber(raw.position, 0), probability: finiteNumber(raw.probability, 100), disabled: raw.disable === true }, raw });
    }
    return output.sort((left, right) => left.title.localeCompare(right.title));
}
function hydrateRaw(raw, entry, sourceMessageKey, operationId) {
    raw.comment = entry.title;
    raw.content = (0, parser_1.serializeEntrySections)(entry.sections);
    raw.key = (0, util_1.unique)(entry.keywords);
    raw.keysecondary ?? (raw.keysecondary = []);
    raw.constant = entry.activation.constant;
    raw.selective = entry.activation.selective === true;
    raw.vectorized = entry.activation.vectorized;
    raw.preventRecursion = entry.activation.preventRecursion;
    raw.depth = entry.activation.depth;
    raw.order = entry.activation.order;
    raw.position = Number(entry.activation.position) || 0;
    raw.probability = Number.isFinite(Number(entry.activation.probability)) ? Number(entry.activation.probability) : 100;
    raw.disable = entry.activation.disabled;
    raw.selective ?? (raw.selective = false);
    raw.position ?? (raw.position = 0);
    raw.useProbability ?? (raw.useProbability = true);
    raw.probability ?? (raw.probability = 100);
    const extension = markManaged(raw, sourceMessageKey, entry.title, operationId);
    extension.locked = entry.locked;
    extension.focus = entry.focus;
}
function markManaged(raw, sourceMessageKey, title, operationId) {
    const extensions = (raw.extensions ?? (raw.extensions = {}));
    const current = extensions[constants_1.WORLD_INFO_EXTENSION_KEY];
    const extension = current && typeof current === 'object' ? current : {};
    extensions[constants_1.WORLD_INFO_EXTENSION_KEY] = { ...extension, managed: true, version: constants_1.MANAGED_VERSION, title, ...(sourceMessageKey ? { sourceMessageKey } : {}), ...(operationId ? { lastOperationId: operationId } : {}), updatedAt: Date.now() };
    return extensions[constants_1.WORLD_INFO_EXTENSION_KEY];
}
function readExtension(raw) { const value = raw.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY]; return value && typeof value === 'object' ? value : {}; }
function isFoundation(keyword, settings) {
    const normalized = (0, util_1.normalizeFact)(keyword);
    const definition = settings.keywordDefinitions.find((item) => item.label === '基础设定');
    return definition ? [definition.label, ...definition.aliases].some((item) => (0, util_1.normalizeFact)(item) === normalized) : normalized === (0, util_1.normalizeFact)('基础设定');
}
function isFoundationEntry(entry, settings) { return entry.keywords.some((keyword) => isFoundation(keyword, settings)); }
function matchingDefinition(entry, settings) {
    return settings.keywordDefinitions.find((definition) => [definition.label, ...definition.aliases].some((name) => entry.keywords.some((keyword) => (0, util_1.normalizeFact)(keyword) === (0, util_1.normalizeFact)(name)))) ?? null;
}
function digestWorldbook(data) { return (0, util_1.hashText)(JSON.stringify(data?.entries ?? {})); }
function commitOperationId(sourceMessageKey, operations) { return (0, util_1.hashText)(`${sourceMessageKey}|${operations.map((operation) => operation.id).sort().join('|')}`); }
function findMapKey(data, raw) {
    for (const [key, value] of Object.entries(data.entries ?? {})) if (value === raw || String(value?.uid ?? '') === String(raw?.uid ?? '')) return String(key);
    return String(raw?.uid ?? '');
}
function findRawEntry(data, uid) {
    for (const [mapKey, raw] of Object.entries(data?.entries ?? {})) {
        if (raw && typeof raw === 'object' && String(raw.uid ?? mapKey) === String(uid))
            return { mapKey: String(mapKey), raw };
    }
    return null;
}
function preservedNativeSnapshot(raw) {
    const copy = (0, util_1.clone)(raw ?? {});
    delete copy.comment;
    delete copy.name;
    delete copy.title;
    delete copy.content;
    delete copy.key;
    if (copy.extensions && typeof copy.extensions === 'object')
        delete copy.extensions[constants_1.WORLD_INFO_EXTENSION_KEY];
    return copy;
}
function verifyWriteResults(data, expectedEntries, operations, operationId, settings, focusUid) {
    if (!operations.length) return;
    const actual = parseEntries(data);
    const touched = new Set(operations.filter((operation) => operation.kind !== 'create-entry' && operation.targetUid).map((operation) => String(operation.targetUid)));
    const createdTitles = new Set(operations.filter((operation) => operation.kind === 'create-entry').map((operation) => (0, util_1.normalizeTitle)(operation.title)));
    const expected = expectedEntries.filter((entry) => touched.has(entry.uid) || createdTitles.has((0, util_1.normalizeTitle)(entry.title)));
    for (const item of expected) {
        const found = actual.find((entry) => entry.uid === item.uid) ?? actual.find((entry) => (0, util_1.normalizeTitle)(entry.title) === (0, util_1.normalizeTitle)(item.title));
        if (!found) throw new Error(`世界书回读未找到已提交条目：${item.title}`);
        if ((0, util_1.normalizeTitle)(found.title) !== (0, util_1.normalizeTitle)(item.title)) throw new Error(`世界书标题未正确落盘：${item.title}`);
        if (normalizeContent(found.content) !== normalizeContent((0, parser_1.serializeEntrySections)(item.sections))) throw new Error(`世界书正文未正确落盘：${item.title}`);
        const actualKeys = [...new Set(found.keywords.map(util_1.normalizeFact))].sort();
        const expectedKeys = [...new Set(item.keywords.map(util_1.normalizeFact))].sort();
        if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) throw new Error(`世界书关键词未正确落盘：${item.title}`);
        const extension = readExtension(found.raw);
        if (extension.lastOperationId !== operationId) throw new Error(`世界书操作 ID 未正确落盘：${item.title}`);
        const focus = Boolean(focusUid && found.uid === String(focusUid));
        if ((isFoundationEntry(found, settings) || focus) && found.activation.constant !== true)
            throw new Error(`SillyTavern constant 字段未正确落盘：${item.title}`);
        if (isFoundationEntry(found, settings) && found.activation.vectorized !== false)
            throw new Error(`基础设定条目的 vectorized 字段未正确落盘：${item.title}`);
    }
}
function verifyExitResults(data, archived, deleted) {
    const entries = parseEntries(data);
    for (const uid of archived) {
        const entry = entries.find((item) => item.uid === uid);
        if (!entry || !entry.activation.disabled) throw new Error(`条目归档未正确落盘：UID ${uid}`);
    }
    for (const uid of deleted) if (entries.some((item) => item.uid === uid)) throw new Error(`条目删除未正确落盘：UID ${uid}`);
}
function normalizeContent(value) { return String(value ?? '').replace(/\r/g, '').trim(); }
function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

},
"worldbook/adapter":function(module,exports,require){
"use strict";
module.exports = require("../worldbook");

},
"worldbook/entry-builder":function(module,exports,require){
"use strict";
const { applyPlanToEntries } = require("../operations");
exports.applyPlanToEntries = applyPlanToEntries;

},
"worldbook/entry-updater":function(module,exports,require){
"use strict";
const { buildOperationPlan, applyPlanToEntries } = require("../operations");
exports.buildOperationPlan = buildOperationPlan;
exports.applyPlanToEntries = applyPlanToEntries;

},
"worldbook/lifecycle-manager":function(module,exports,require){
"use strict";
const { buildOperationPlan } = require("../operations");
exports.buildLifecyclePlan = buildOperationPlan;

},
"worldbook/migration":function(module,exports,require){
"use strict";
module.exports = require("../migration");

},
"worldbook/reader":function(module,exports,require){
"use strict";
const { WorldbookAdapter, parseEntries } = require("../worldbook");
exports.WorldbookAdapter = WorldbookAdapter;
exports.parseEntries = parseEntries;

},
"worldbook/rollback":function(module,exports,require){
"use strict";
const { MigrationService } = require("../migration");
exports.RollbackService = MigrationService;

},
"worldbook/transaction":function(module,exports,require){
"use strict";
const { WorldbookAdapter } = require("../worldbook");
exports.WorldbookTransaction = WorldbookAdapter;

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
