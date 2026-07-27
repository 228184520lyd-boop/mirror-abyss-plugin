/** Mirror Abyss 2.0.0-lite.ui.2 — audit/extraction UI mapping build. */
var MA_MODULES={"application":function(module,exports,require){
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
        this.memoryRunner = new memory_1.MemoryRunner(this.host, this.worldbook, () => this.settings(), (progress) => {
            this.controlPanel?.setTaskProgress?.('extract', progress?.state || 'running', progress?.detail || '', progress || {});
        });
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
        this.listen('CHARACTER_MESSAGE_RENDERED', (value) => void this.onMessage(messageIndexFromEvent(value)));
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
        this.controlPanel.resetTaskStates?.('聊天或正文范围已变化');
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
            if (taskType === 'audit' || taskType === 'full') this.controlPanel.setTaskProgress?.('audit', 'running', automatic ? '自动审核处理中' : '审核处理中');
            if (taskType === 'extraction' || taskType === 'full') this.controlPanel.setTaskProgress?.('extract', 'running', automatic ? '等待审核后自动提取' : '提取、解析与语义合并处理中');
            this.controlPanel.setStatus(taskType === 'audit' ? '审核处理中…' : taskType === 'extraction' ? '提取、解析与语义合并处理中…' : taskType === 'full' ? '自动处理中…' : '任务处理中…');
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
            if (taskType === 'audit') this.controlPanel.setTaskProgress?.('audit', 'success', '审核完成');
            if (taskType === 'full') this.controlPanel.setTaskProgress?.('audit', 'success', '自动审核完成');
            this.controlPanel.setStatus(taskType === 'audit' ? '审核完成' : taskType === 'extraction' ? '提取与世界书合并完成' : '本轮处理完成');
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
            if (taskType === 'audit' || taskType === 'full') this.controlPanel.setTaskProgress?.('audit', 'error', text, { error: text });
            if (taskType === 'extraction' || taskType === 'full') this.controlPanel.setTaskProgress?.('extract', 'error', text, { error: text });
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
        if (!settings.auditEnabled || !settings.auditPrompt.trim()) {
            this.setStatus(snapshot.chatKey, 'complete', '审核未启用');
            return snapshot;
        }
        try {
            this.host.assertSnapshot(snapshot, this.getSettings());
            this.setStatus(snapshot.chatKey, 'audit', '审核正文');
            const prompt = (0, prompts_1.auditPrompts)(settings, snapshot.playerText, snapshot.assistantText, snapshot.characterCard);
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
    if (/^(?:PASS|通过)[。.]?$/iu.test(text)) return { decision: 'pass', issues: [] };
    if (/【\s*(?:最小修正版正文|修正版正文|完整正文|正文)\s*】/u.test(text))
        throw new Error('审核模型越权返回了修正版正文');
    const rawConclusion = text.match(/^\s*(PASS|FAIL|通过|需要修正)\s*[。.]?\s*(?:\n|$)/iu)?.[1] || '';
    const conclusion = /^(?:PASS|通过)$/iu.test(rawConclusion) ? 'PASS' : /^(?:FAIL|需要修正)$/iu.test(rawConclusion) ? 'FAIL' : '';
    if (conclusion === 'PASS')
        throw new Error('审核结论为 PASS 时必须只返回 PASS');
    if (conclusion !== 'FAIL')
        throw new Error('审核返回缺少明确的 PASS 或 FAIL 结论');
    const sections = (0, parser_1.parseLabeledSections)(text);
    let issues = ['原因', '违反规则', '问题', '违规'].flatMap((name) => nonEmptyLines(sections.get(name))).filter((line) => !isNone(line));
    if (!issues.length) {
        issues = text.split('\n').slice(1)
            .map((line) => (0, parser_1.stripListMarker)(line.replace(/^\s*【[^】]+】\s*$/u, '').replace(/^\s*原因\s*[:：]?\s*$/u, '')).trim())
            .filter((line) => line && !isNone(line));
    }
    if (!issues.length) throw new Error('审核返回 FAIL，但没有指出具体问题或原因');
    return { decision: 'revision', issues };
}
function nonEmptyLines(lines = []) {
    return lines.map((line) => (0, parser_1.stripListMarker)(line).trim()).filter(Boolean);
}
function isNone(value) { return /^\s*(?:无|没有|无问题)\s*[。.]?\s*$/u.test(String(value ?? '')); }
function trimPrompt(value) { return value.length <= constants_1.MAX_CONTEXT_CHARS ? value : `${value.slice(0, constants_1.MAX_CONTEXT_CHARS)}\n[已按字符上限截断]`; }
function safeChatKey(host) { try { return host.chatKey(); } catch { return ''; } }

},
"constants":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGED_VERSION = exports.MAX_CONTEXT_CHARS = exports.WORLD_INFO_EXTENSION_KEY = exports.EXTENSION_NAMESPACE = exports.DISPLAY_NAME = exports.VERSION = void 0;
exports.VERSION = '2.0.0-lite.ui.2';
exports.DISPLAY_NAME = 'Mirror Abyss｜镜渊';
exports.EXTENSION_NAMESPACE = 'mirrorAbyssLite';
exports.WORLD_INFO_EXTENSION_KEY = 'mirrorAbyssInfoPoint';
exports.MAX_CONTEXT_CHARS = 48000;
exports.MANAGED_VERSION = 8;

},
"control-panel":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlPanel = void 0;
const util_1 = require("./util");
const ROOT_ID = 'mirror-abyss-core-control';
const PANEL_ID = 'mirror-abyss-lite-panel';
const SETTINGS_ID = 'mirror-abyss-lite-settings-entry';
const STYLE_ID = 'mirror-abyss-lite-style';
const INDICATOR_CLASS = 'mirror-abyss-message-indicator';
class ControlPanel {
    constructor(actions) {
        this.actions = actions;
        this.root = null;
        this.launcher = null;
        this.panel = null;
        this.statusNode = null;
        this.settingsEntry = null;
        this.inputs = {};
        this.buttons = {};
        this.busy = false;
        this.busyKind = '';
        this.lastOutcome = null;
        this.taskStates = {
            audit: { state: 'idle', detail: '待命', titles: [], created: [], updated: [], skipped: [] },
            extract: { state: 'idle', detail: '待命', titles: [], created: [], updated: [], skipped: [] },
        };
        this.statusText = '就绪';
        this.statusError = false;
        this.observer = null;
        this.pendingIndicatorFrame = 0;
        this.waitingForDom = false;
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
        this.unmount(false);
        this.installStyle();
        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'ma-lite-top-entry';
        const launcher = document.createElement('button');
        launcher.type = 'button';
        launcher.className = 'ma-lite-launcher interactable';
        launcher.setAttribute('aria-label', '打开镜渊面板');
        launcher.setAttribute('aria-expanded', 'false');
        launcher.title = 'Mirror Abyss｜审核与提取';
        launcher.innerHTML = '<i class="fa-solid fa-circle-nodes" aria-hidden="true"></i><span>镜渊</span>';
        launcher.addEventListener('click', () => this.togglePanel());
        root.append(launcher);
        root.classList.add('ma-lite-edge-entry');
        document.body.append(root);
        const panel = this.buildPanel();
        document.body.append(panel);
        this.root = root;
        this.launcher = launcher;
        this.panel = panel;
        this.mountOfficialSettingsEntry();
        this.observeChat();
        this.refresh();
        this.scheduleIndicatorRefresh();
    }
    unmount(removeStyle = true) {
        if (typeof document === 'undefined') return;
        if (this.waitingForDom) document.removeEventListener('DOMContentLoaded', this.onDomReady);
        this.waitingForDom = false;
        this.observer?.disconnect();
        this.observer = null;
        if (this.pendingIndicatorFrame) cancelAnimationFrame(this.pendingIndicatorFrame);
        this.pendingIndicatorFrame = 0;
        this.root?.remove();
        this.panel?.remove();
        this.settingsEntry?.remove();
        document.querySelectorAll(`.${INDICATOR_CLASS}`).forEach((node) => node.remove());
        if (removeStyle) document.getElementById(STYLE_ID)?.remove();
        this.root = null;
        this.launcher = null;
        this.panel = null;
        this.statusNode = null;
        this.settingsEntry = null;
        this.inputs = {};
        this.buttons = {};
        this.busy = false;
        this.busyKind = '';
    }
    installStyle() {
        document.getElementById(STYLE_ID)?.remove();
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#${ROOT_ID}.ma-lite-top-entry{display:flex;align-items:center;justify-content:center;z-index:2147483638}
#${ROOT_ID}.ma-lite-edge-entry{position:fixed;top:max(calc(var(--topBarBlockSize,44px) + 6px),calc(env(safe-area-inset-top) + 48px));right:max(4px,env(safe-area-inset-right));}
.ma-lite-launcher{box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:0;width:34px;height:34px;min-width:34px;min-height:34px;padding:0;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.22));border-radius:8px;background:var(--black50a,rgba(20,20,24,.82));color:var(--SmartThemeBodyColor,#fff);cursor:pointer;touch-action:manipulation}
.ma-lite-launcher span{display:none}
#${PANEL_ID}{position:fixed;top:max(58px,calc(48px + env(safe-area-inset-top)));right:max(10px,env(safe-area-inset-right));z-index:2147483639;box-sizing:border-box;width:min(360px,calc(100vw - 20px));max-height:calc(100dvh - 78px);overflow:auto;padding:0;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.2));border-radius:12px;background:color-mix(in srgb,var(--SmartThemeBlurTintColor,#17171c) 94%,transparent);color:var(--SmartThemeBodyColor,#fff);box-shadow:0 12px 34px rgba(0,0,0,.48);backdrop-filter:blur(12px);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
#${PANEL_ID}[hidden]{display:none!important}
.ma-lite-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:12px;border-bottom:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));background:inherit}
.ma-lite-title{min-width:0;flex:1}.ma-lite-title strong{display:block;font-size:15px}.ma-lite-title small{display:block;margin-top:2px;opacity:.62;font-size:11px}
.ma-lite-close{min-width:34px;min-height:34px;border:0;border-radius:8px;background:var(--black30a,rgba(255,255,255,.08));color:inherit;cursor:pointer}
.ma-lite-body{display:flex;flex-direction:column;gap:12px;padding:12px}
.ma-lite-switches{display:grid;grid-template-columns:1fr;gap:8px}
.ma-lite-switch{display:flex;align-items:center;gap:9px;padding:9px 10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.04));cursor:pointer}
.ma-lite-switch input{width:18px;height:18px;margin:0;flex:0 0 auto}.ma-lite-switch-text{min-width:0;flex:1}.ma-lite-switch-text b{display:block;font-size:13px}.ma-lite-switch-text small{display:block;margin-top:2px;opacity:.58;font-size:11px;line-height:1.35}
.ma-lite-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}.ma-lite-action{min-height:46px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.16));border-radius:9px;background:var(--black50a,rgba(255,255,255,.08));color:inherit;font-weight:700;cursor:pointer;touch-action:manipulation}.ma-lite-action:disabled{opacity:.42;cursor:not-allowed}.ma-lite-action[data-kind="audit"]{border-color:rgba(112,181,255,.5)}.ma-lite-action[data-kind="extract"]{border-color:rgba(111,214,164,.5)}
.ma-lite-status{min-height:38px;padding:9px 10px;border-radius:8px;background:rgba(0,0,0,.18);font-size:12px;line-height:1.45;overflow-wrap:anywhere}.ma-lite-status[data-error="true"]{color:#ffb4b4}.ma-lite-note{font-size:11px;line-height:1.5;opacity:.58}
.${INDICATOR_CLASS}{display:flex;flex-wrap:wrap;align-items:center;gap:6px 9px;width:max-content;max-width:100%;margin-top:7px;padding:5px 8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.13));border-radius:999px;background:var(--black30a,rgba(0,0,0,.18));font-size:10px;line-height:1.2;color:var(--SmartThemeBodyColor,#fff);opacity:.78;user-select:none}
.${INDICATOR_CLASS} .ma-ind-label{font-weight:700}.ma-ind-part{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}.ma-ind-detail{flex-basis:100%;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.72}.ma-ind-dot{width:7px;height:7px;border-radius:50%;background:#777;box-shadow:0 0 0 1px rgba(255,255,255,.14)}.ma-ind-dot[data-state="ready"],.ma-ind-dot[data-state="success"]{background:#5ed18a}.ma-ind-dot[data-state="running"]{background:#f0bc57;animation:ma-lite-pulse 1s infinite}.ma-ind-dot[data-state="error"]{background:#ff6868}.ma-ind-dot[data-state="disabled"]{background:#6c6c72}@keyframes ma-lite-pulse{50%{opacity:.35}}
`;
        document.head.append(style);
    }
    buildPanel() {
        const panel = document.createElement('section');
        panel.id = PANEL_ID;
        panel.hidden = true;
        panel.setAttribute('aria-label', '镜渊操作面板');
        const header = document.createElement('div');
        header.className = 'ma-lite-header';
        const title = document.createElement('div');
        title.className = 'ma-lite-title';
        title.innerHTML = '<strong>Mirror Abyss｜镜渊</strong><small>UI 只映射审核、提取与独立开关</small>';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'ma-lite-close';
        close.title = '收起';
        close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        close.addEventListener('click', () => this.closePanel());
        header.append(title, close);
        const body = document.createElement('div');
        body.className = 'ma-lite-body';
        const switches = document.createElement('div');
        switches.className = 'ma-lite-switches';
        switches.append(
            this.makeSwitch('enabled', '总开关', '关闭后两个功能都不能执行。'),
            this.makeSwitch('autoProcess', '自动审核与提取', 'AI 正文生成完成后，自动依次执行审核和提取。'),
            this.makeSwitch('auditEnabled', '审核开关', '审核不通过时生成完整修正版并替换正文。'),
            this.makeSwitch('extractionEnabled', '提取开关', '固定格式解析、语义合并后写入当前聊天世界书。'),
        );
        const actions = document.createElement('div');
        actions.className = 'ma-lite-actions';
        const audit = this.makeActionButton('audit', '审核');
        const extract = this.makeActionButton('extract', '提取');
        actions.append(audit, extract);
        const status = document.createElement('div');
        status.className = 'ma-lite-status';
        status.setAttribute('aria-live', 'polite');
        this.statusNode = status;
        const note = document.createElement('div');
        note.className = 'ma-lite-note';
        note.textContent = '提取解析和语义去重已内置，不再依赖外部 Regex 脚本。按钮只处理当前聊天中最新一条 AI 正文。';
        body.append(switches, actions, status, note);
        panel.append(header, body);
        return panel;
    }
    makeSwitch(key, labelText, description) {
        const label = document.createElement('label');
        label.className = 'ma-lite-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.setting = key;
        const text = document.createElement('span');
        text.className = 'ma-lite-switch-text';
        const title = document.createElement('b');
        title.textContent = labelText;
        const detail = document.createElement('small');
        detail.textContent = description;
        text.append(title, detail);
        label.append(input, text);
        input.addEventListener('change', () => {
            try {
                this.actions.configure?.({ [key]: input.checked });
                this.lastOutcome = null;
                this.setStatus(`${labelText}已${input.checked ? '开启' : '关闭'}`);
                this.refresh();
            }
            catch (error) {
                input.checked = !input.checked;
                this.setStatus(`保存设置失败：${(0, util_1.errorText)(error)}`, true);
            }
        });
        this.inputs[key] = input;
        return label;
    }
    makeActionButton(kind, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ma-lite-action';
        button.dataset.kind = kind;
        button.textContent = label;
        button.addEventListener('click', () => void this.runAction(kind));
        this.buttons[kind] = button;
        return button;
    }
    async runAction(kind) {
        if (this.busy) return;
        const settings = this.getSettings();
        if (!settings.enabled) {
            this.setStatus('总开关已关闭', true);
            return;
        }
        if (kind === 'audit' && settings.auditEnabled === false) {
            this.setStatus('审核开关已关闭', true);
            return;
        }
        if (kind === 'extract' && settings.extractionEnabled === false) {
            this.setStatus('提取开关已关闭', true);
            return;
        }
        const action = this.actions[kind];
        if (typeof action !== 'function') {
            this.setStatus(`${kind === 'audit' ? '审核' : '提取'}功能未连接`, true);
            return;
        }
        this.busy = true;
        this.busyKind = kind;
        this.lastOutcome = null;
        this.syncDisabledState();
        this.setTaskProgress(kind, 'running', kind === 'audit' ? '审核处理中' : '提取、解析与语义合并处理中', { titles: [], created: [], updated: [], skipped: [] });
        try {
            await action();
            this.lastOutcome = { kind, state: 'success' };
            if (this.taskStates[kind]?.state === 'running') this.setTaskProgress(kind, 'success', kind === 'audit' ? '审核完成' : '提取完成');
        }
        catch (error) {
            this.lastOutcome = { kind, state: 'error' };
            this.setTaskProgress(kind, 'error', `${(0, util_1.errorText)(error)}`, { error: (0, util_1.errorText)(error) });
            this.setStatus(`${kind === 'audit' ? '审核' : '提取'}失败：${(0, util_1.errorText)(error)}`, true);
        }
        finally {
            this.busy = false;
            this.busyKind = '';
            this.syncDisabledState();
            this.scheduleIndicatorRefresh();
        }
    }
    getSettings() {
        try { return this.actions.getSettings?.() ?? {}; }
        catch { return {}; }
    }
    refresh() {
        const settings = this.getSettings();
        if (this.inputs.enabled) this.inputs.enabled.checked = settings.enabled !== false;
        if (this.inputs.autoProcess) this.inputs.autoProcess.checked = settings.autoProcess === true;
        if (this.inputs.auditEnabled) this.inputs.auditEnabled.checked = settings.auditEnabled !== false;
        if (this.inputs.extractionEnabled) this.inputs.extractionEnabled.checked = settings.extractionEnabled !== false;
        this.syncDisabledState();
        if (this.statusNode) {
            this.statusNode.textContent = this.statusText;
            this.statusNode.dataset.error = this.statusError ? 'true' : 'false';
        }
        this.scheduleIndicatorRefresh();
    }
    syncDisabledState() {
        const settings = this.getSettings();
        const master = settings.enabled !== false;
        if (this.buttons.audit) this.buttons.audit.disabled = this.busy || !master || settings.auditEnabled === false;
        if (this.buttons.extract) this.buttons.extract.disabled = this.busy || !master || settings.extractionEnabled === false;
        for (const input of Object.values(this.inputs)) input.disabled = this.busy;
    }
    setStatus(text, isError = false) {
        this.statusText = String(text || '');
        this.statusError = Boolean(isError);
        if (this.statusNode) {
            this.statusNode.textContent = this.statusText;
            this.statusNode.dataset.error = this.statusError ? 'true' : 'false';
        }
        this.scheduleIndicatorRefresh();
    }
    setTaskProgress(kind, state, detail = '', meta = {}) {
        if (!this.taskStates[kind]) return;
        const previous = this.taskStates[kind];
        this.taskStates[kind] = {
            ...previous,
            state: state || previous.state || 'idle',
            detail: String(detail || previous.detail || ''),
            titles: Array.isArray(meta.titles) ? [...meta.titles] : previous.titles,
            created: Array.isArray(meta.created) ? [...meta.created] : previous.created,
            updated: Array.isArray(meta.updated) ? [...meta.updated] : previous.updated,
            skipped: Array.isArray(meta.skipped) ? [...meta.skipped] : previous.skipped,
        };
        if (detail) {
            this.statusText = `${kind === 'audit' ? '审核' : '提取'}：${detail}`;
            this.statusError = state === 'error';
            if (this.statusNode) {
                this.statusNode.textContent = this.statusText;
                this.statusNode.dataset.error = this.statusError ? 'true' : 'false';
            }
        }
        this.scheduleIndicatorRefresh();
    }
    resetTaskStates(detail = '待命') {
        this.taskStates.audit = { state: 'idle', detail, titles: [], created: [], updated: [], skipped: [] };
        this.taskStates.extract = { state: 'idle', detail, titles: [], created: [], updated: [], skipped: [] };
        this.lastOutcome = null;
        this.scheduleIndicatorRefresh();
    }
    togglePanel() {
        if (!this.panel) return;
        const opening = this.panel.hidden;
        this.panel.hidden = !opening;
        this.launcher?.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (opening) this.refresh();
    }
    closePanel() {
        if (!this.panel) return;
        this.panel.hidden = true;
        this.launcher?.setAttribute('aria-expanded', 'false');
    }
    mountOfficialSettingsEntry() {
        const container = document.getElementById('extensions_settings2');
        if (!container) return;
        document.getElementById(SETTINGS_ID)?.remove();
        const entry = document.createElement('div');
        entry.id = SETTINGS_ID;
        entry.className = 'inline-drawer';
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Mirror Abyss｜打开审核与提取面板';
        button.style.cssText = 'box-sizing:border-box;width:100%;min-height:42px;padding:8px 10px;text-align:left;';
        button.addEventListener('click', () => {
            if (this.panel) this.panel.hidden = false;
            this.launcher?.setAttribute('aria-expanded', 'true');
            this.refresh();
        });
        entry.append(button);
        container.append(entry);
        this.settingsEntry = entry;
    }
    observeChat() {
        this.observer?.disconnect();
        const chat = document.getElementById('chat');
        if (!chat || typeof MutationObserver === 'undefined') return;
        this.observer = new MutationObserver(() => this.scheduleIndicatorRefresh());
        this.observer.observe(chat, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'is_user', 'is_system', 'mesid'] });
    }
    scheduleIndicatorRefresh() {
        if (typeof document === 'undefined') return;
        if (this.pendingIndicatorFrame) return;
        this.pendingIndicatorFrame = requestAnimationFrame(() => {
            this.pendingIndicatorFrame = 0;
            this.renderIndicator();
        });
    }
    renderIndicator() {
        const messages = [...document.querySelectorAll('#chat .mes[is_user="false"][is_system="false"]')];
        const target = messages.at(-1);
        document.querySelectorAll(`.${INDICATOR_CLASS}`).forEach((node) => {
            if (!target || !target.contains(node)) node.remove();
        });
        if (!target) return;
        const text = target.querySelector('.mes_text');
        const block = target.querySelector('.mes_block') || target;
        if (!text || !block) return;
        let indicator = block.querySelector(`.${INDICATOR_CLASS}`);
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = INDICATOR_CLASS;
            text.insertAdjacentElement('afterend', indicator);
        }
        const settings = this.getSettings();
        const master = settings.enabled !== false;
        const auditState = this.indicatorState('audit', master && settings.auditEnabled !== false);
        const extractState = this.indicatorState('extract', master && settings.extractionEnabled !== false);
        const audit = this.taskStates.audit;
        const extract = this.taskStates.extract;
        const auditText = audit.detail || this.stateLabel(auditState);
        const extractText = extract.detail || this.stateLabel(extractState);
        const titleText = (extract.titles || []).slice(0, 4).join('、');
        const extraCount = Math.max(0, (extract.titles || []).length - 4);
        const detail = titleText ? `${titleText}${extraCount ? ` 等${extract.titles.length}条` : ''}` : '';
        indicator.title = [this.statusText, detail].filter(Boolean).join('\n') || '镜渊状态';
        indicator.innerHTML = `<span class="ma-ind-label">镜渊</span><span class="ma-ind-part"><i class="ma-ind-dot" data-state="${auditState}"></i>审核：${escapeHtml(auditText)}</span><span class="ma-ind-part"><i class="ma-ind-dot" data-state="${extractState}"></i>提取：${escapeHtml(extractText)}</span>${detail ? `<span class="ma-ind-detail">${escapeHtml(detail)}</span>` : ''}`;
    }
    indicatorState(kind, enabled) {
        if (!enabled) return 'disabled';
        const state = this.taskStates[kind]?.state;
        if (state === 'running') return 'running';
        if (state === 'success') return 'success';
        if (state === 'error') return 'error';
        return 'ready';
    }
    stateLabel(state) {
        return ({ disabled: '关闭', running: '处理中', success: '完成', error: '失败', ready: '待命' })[state] || '待命';
    }
}
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
exports.ControlPanel = ControlPanel;

},
"domain/entry-section":function(module,exports,require){
"use strict";
const { parseEntrySections, serializeEntrySections } = require("../parser");
const { canonicalSectionName } = require("./information-point");
const { normalizeTitle, splitTitle, unique } = require("../util");
function normalizeEntrySections(parsed) {
    const order = [];
    const values = {};
    for (const rawName of parsed.order ?? []) {
        const name = canonicalSectionName(rawName);
        if (!name) continue;
        if (!values[name]) {
            values[name] = [];
            order.push(name);
        }
        values[name] = unique([...values[name], ...(parsed.values?.[rawName] ?? [])]);
    }
    return { order, values };
}
function sectionLines(content, names) {
    const parsed = normalizeEntrySections(parseEntrySections(content));
    const normalized = new Set(names.map((name) => canonicalSectionName(name).replace(/\s+/g, '').toLocaleLowerCase()));
    return parsed.order.flatMap((name) => normalized.has(name.replace(/\s+/g, '').toLocaleLowerCase()) ? parsed.values[name] ?? [] : []);
}
function extractReferences(content) {
    const parsed = normalizeEntrySections(parseEntrySections(content));
    const output = [];
    for (const [name, lines] of Object.entries(parsed.values)) {
        if (!/(关联|关系对象|涉及条目|参与对象|引用)/u.test(name)) continue;
        for (const line of lines) {
            const title = normalizeTitle(line.replace(/^[-*•]\s*/u, ''));
            if (splitTitle(title)) output.push(title);
        }
    }
    return unique(output);
}
exports.canonicalSectionName = canonicalSectionName;
exports.normalizeEntrySections = normalizeEntrySections;
exports.parseEntrySections = (content) => normalizeEntrySections(parseEntrySections(content));
exports.serializeEntrySections = serializeEntrySections;
exports.sectionLines = sectionLines;
exports.extractReferences = extractReferences;

},
"domain/information-point":function(module,exports,require){
"use strict";
const { unique } = require("../util");
const SECTION_ALIASES = {
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
    '当前结果': '最终结果',
    '结束结论': '最终结果',
};
function canonicalSectionName(value) {
    const raw = String(value ?? '').trim();
    const compact = raw.replace(/\s+/gu, '');
    return SECTION_ALIASES[compact] ?? raw;
}
function prepareInformationBlocks(parsedBlocks) {
    return parsedBlocks.map((block) => {
        const merged = new Map();
        for (const rawSection of block.sections ?? []) {
            const name = canonicalSectionName(rawSection.name);
            if (!name) continue;
            const current = merged.get(name) ?? { name, lines: [], empty: true };
            current.lines = unique([...current.lines, ...(rawSection.lines ?? [])]);
            current.empty = current.lines.length === 0 && (current.empty || rawSection.empty === true);
            merged.set(name, current);
        }
        const sections = [...merged.values()];
        const keywordLines = sections
            .filter((section) => /(关键词|触发词|标签|分类)/u.test(section.name) && !section.empty)
            .flatMap((section) => section.lines);
        return { ...block, sections, keywords: unique(keywordLines) };
    });
}
exports.canonicalSectionName = canonicalSectionName;
exports.prepareInformationBlocks = prepareInformationBlocks;

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
            characterCard: characterCardText(this.context()),
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
            turnsSinceSmall: Math.max(0, Number(value.turnsSinceSmall) || 0),
            smallCountSinceLarge: Math.max(0, Number(value.smallCountSinceLarge) || 0),
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
function characterCardText(context) {
    const character = context?.characters?.[context.characterId] ?? context?.character ?? null;
    if (!character || typeof character !== 'object') return '';
    return [
        character.name ? `名称：${character.name}` : '',
        character.description ? `描述：${character.description}` : '',
        character.personality ? `性格：${character.personality}` : '',
        character.scenario ? `场景：${character.scenario}` : '',
        character.system_prompt ? `系统规则：${character.system_prompt}` : '',
    ].filter(Boolean).join('\n\n');
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
    if (!contextReady()) throw new Error('SillyTavern 上下文尚未就绪');
    initializing = true;
    exposeApi();
    try { application ?? (application = new application_1.MirrorAbyssApplication()); application.start(); console.info(`[MirrorAbyss] ${constants_1.VERSION} ready`); }
    catch (error) { console.error('[MirrorAbyss] initialization failed', error); globalThis.toastr?.error?.(`镜渊启动失败：${error instanceof Error ? error.message : String(error)}`); }
    finally { initializing = false; }
}
function shutdown(removeApi = true) {
    application?.stop();
    removeStartupIndicator();
    if (removeApi) delete globalThis.MirrorAbyss;
}
function onActivate() { extensionEnabled = true; mountStartupIndicator(); exposeApi(); return initialize(); }
function onEnable() { extensionEnabled = true; mountStartupIndicator(); exposeApi(); return initialize(); }
function onDisable() { extensionEnabled = false; shutdown(); }
function onDelete() { extensionEnabled = false; shutdown(); application = null; }
function onInstall() { exposeApi(); }
function onUpdate() { exposeApi(); }
function onClean() { }

// SillyTavern 1.18 loads this module, then invokes the manifest activate hook.

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

const DEFAULT_SCORES = Object.freeze({
    uid: 100,
    exactTitle: 95,
    normalizedTitle: 90,
    typeAndName: 80,
    alias: 70,
    keyword: 50,
    content: 30,
});

function buildEntryIndex(entries) {
    const byUid = new Map();
    const byExactTitle = new Map();
    const byTitle = new Map();
    const byTypeAndName = new Map();
    const byAlias = new Map();
    const byKeyword = new Map();
    for (const entry of entries) {
        byUid.set(String(entry.uid), entry);
        add(byExactTitle, String(entry.title ?? ''), entry);
        add(byTitle, normalizeTitleLookup(entry.title), entry);
        add(byTypeAndName, typeNameKey(entry.type, entry.name), entry);
        for (const alias of entry.aliases ?? []) add(byAlias, typedLookup(entry.type, alias), entry);
        for (const keyword of entry.keywords ?? []) {
            if ((0, util_1.isUidKeyword)(keyword)) continue;
            add(byKeyword, typedLookup(entry.type, keyword), entry);
        }
    }
    return { entries, byUid, byExactTitle, byTitle, byTypeAndName, byAlias, byKeyword };
}

function matchBlock(block, index, _contextText, weights = {}) {
    const scores = { ...DEFAULT_SCORES, ...weights };
    const collected = [];
    if (block.uid) {
        const entry = index.byUid.get(String(block.uid));
        if (entry) collected.push(candidate(entry, scores.uid, 'uid', `UID ${block.uid} 精确命中`));
    }
    collected.push(...candidates(index.byExactTitle.get(String(block.title ?? '')) ?? [], scores.exactTitle, 'exact-title', '标题完全相同'));
    collected.push(...candidates(index.byTitle.get(normalizeTitleLookup(block.title)) ?? [], scores.normalizedTitle, 'normalized-title', '标准化标题相同'));
    collected.push(...candidates(index.byTypeAndName.get(typeNameKey(block.type, block.name)) ?? [], scores.typeAndName, 'type-name', '类型与名称相同'));
    collected.push(...candidates(index.byAlias.get(typedLookup(block.type, block.name)) ?? [], scores.alias, 'alias', `同类型别名“${block.name}”命中`));
    collected.push(...candidates(index.byKeyword.get(typedLookup(block.type, block.name)) ?? [], scores.keyword, 'keyword', `同类型关键词“${block.name}”命中`));

    const name = normalizeLookup(block.name);
    if (name.length >= 2) {
        for (const entry of index.entries) {
            if (normalizeLookup(entry.type) !== normalizeLookup(block.type)) continue;
            const haystack = normalizeLookup(`${entry.content}\n${entry.keywords.join(' ')}\n${entry.aliases.join(' ')}`);
            if (haystack.includes(name)) collected.push(candidate(entry, scores.content, 'content', `正文或关键词包含名称“${block.name}”，仅作辅助`));
        }
    }

    const byUid = new Map();
    for (const item of collected) {
        const current = byUid.get(item.entry.uid);
        if (!current || item.score > current.score) byUid.set(item.entry.uid, item);
        else if (current && item.score === current.score) current.evidence.push(...item.evidence);
    }
    return [...byUid.values()].sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));
}

function selectBestCandidate(candidates, minimumScore = 80) {
    const eligible = candidates.filter((item) => Number(item.score) >= Number(minimumScore));
    if (!eligible.length) return null;
    const topScore = eligible[0].score;
    const top = eligible.filter((item) => item.score === topScore);
    return top.length === 1 ? top[0] : null;
}

function relevantEntries(entries, text, limit = 24) {
    const normalized = normalizeLookup(text);
    const scored = entries.map((entry) => {
        let score = 0;
        const name = normalizeLookup(entry.name);
        if (name.length >= 2 && normalized.includes(name)) score += 1000;
        for (const keyword of entry.keywords ?? []) {
            if ((0, util_1.isUidKeyword)(keyword)) continue;
            const key = normalizeLookup(keyword);
            if (key.length >= 2 && normalized.includes(key)) score += 180;
        }
        for (const alias of entry.aliases ?? []) {
            const key = normalizeLookup(alias);
            if (key.length >= 2 && normalized.includes(key)) score += 240;
        }
        if (entry.focus) score += 900;
        if (entry.activation?.constant) score += 300;
        if (/(进行中|当前场景|当前相关|活跃)/u.test(entry.content ?? '')) score += 120;
        return { entry, score };
    });
    const selected = scored
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || Number(b.entry.updatedAt || 0) - Number(a.entry.updatedAt || 0))
        .map((item) => item.entry);
    const fallback = entries
        .filter((entry) => entry.focus || entry.activation?.constant || entry.type === '总结' || /(进行中|当前场景|当前相关|活跃)/u.test(entry.content ?? ''))
        .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
        .slice(0, 12);
    return [...new Map([...selected, ...fallback].map((entry) => [entry.uid, entry])).values()].slice(0, limit);
}

function titleTokens(value) {
    const split = (0, util_1.splitTitle)(value);
    return (0, util_1.unique)([split?.type, split?.name, value].map((item) => (0, util_1.normalizeFact)(String(item ?? ''))));
}
function candidates(entries, score, kind, detail) {
    return [...new Map(entries.map((entry) => [entry.uid, entry])).values()].map((entry) => candidate(entry, score, kind, detail));
}
function candidate(entry, score, kind, detail) {
    return { entry, score: Number(score), evidence: [{ kind, score: Number(score), detail }] };
}
function typeNameKey(type, name) { return `${normalizeLookup(type)}｜${normalizeLookup(name)}`; }
function typedLookup(type, value) { return `${normalizeLookup(type)}｜${normalizeLookup(value)}`; }
function normalizeTitleLookup(value) { return (0, util_1.normalizeTitle)(String(value ?? '')).toLocaleLowerCase(); }
function normalizeLookup(value) { return (0, util_1.normalizeFact)(String(value ?? '')).replace(/[｜|]/gu, '').toLocaleLowerCase(); }
function add(map, key, entry) {
    if (!key) return;
    const list = map.get(key) ?? [];
    if (!list.some((candidate) => candidate.uid === entry.uid)) list.push(entry);
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
    constructor(host, worldbook, getSettings, onProgress = null) {
        this.host = host;
        this.worldbook = worldbook;
        this.getSettings = getSettings;
        this.onProgress = typeof onProgress === 'function' ? onProgress : null;
        this.statusByChat = new Map();
    }
    progress(state, detail, meta = {}) {
        try { this.onProgress?.({ state, detail, ...meta }); }
        catch (error) { console.warn('[MirrorAbyss] progress callback failed', error); }
    }
    currentStatus(chatKey = '') {
        const key = chatKey || safeChatKey(this.host);
        return structuredClone(this.statusByChat.get(key) ?? { phase: 'idle', detail: '等待处理', error: '', rawResult: '', plan: null });
    }
    async processTurn(settings, snapshot) {
        const cursor = this.host.cursor();
        if (cursor.lastProcessedMessageKey === snapshot.messageKey && cursor.lastProcessedHash === snapshot.contentHash) {
            this.setStatus(snapshot.chatKey, 'complete', '该正文已经完整处理，跳过重复任务');
            return [];
        }
        try {
            this.setStatus(snapshot.chatKey, 'reading', '读取最终正文与相关世界书条目');
            await this.extract(settings, snapshot);
            let turnsSinceSmall = cursor.turnsSinceSmall + 1;
            let smallCountSinceLarge = cursor.smallCountSinceLarge;
            if (turnsSinceSmall >= settings.smallSummaryTurns) {
                const small = await this.summarize('small', settings, snapshot);
                turnsSinceSmall = 0;
                if (small.changed)
                    smallCountSinceLarge += 1;
            }
            if (smallCountSinceLarge >= settings.largeSummaryCount) {
                await this.summarize('large', settings, snapshot);
                smallCountSinceLarge = 0;
            }
            await this.host.saveCursor({
                lastProcessedMessageKey: snapshot.messageKey,
                lastProcessedHash: snapshot.contentHash,
                turnsSinceSmall,
                smallCountSinceLarge,
            }, snapshot, this.getSettings());
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
            await this.host.saveCursor({
                ...cursor,
                turnsSinceSmall: cursor.turnsSinceSmall + 1,
            }, snapshot, this.getSettings());
            this.setStatus(snapshot.chatKey, 'complete', '提取完成');
            return result.entries;
        }
        if (kind === 'smallSummary') {
            const result = await this.summarize('small', settings, snapshot);
            const cursor = this.host.cursor();
            await this.host.saveCursor({
                ...cursor,
                turnsSinceSmall: 0,
                smallCountSinceLarge: cursor.smallCountSinceLarge + (result.changed ? 1 : 0),
            }, snapshot, this.getSettings());
            this.setStatus(snapshot.chatKey, 'complete', result.changed ? '小总结完成' : '小总结无更新');
            return result.entries;
        }
        const result = await this.summarize('large', settings, snapshot);
        const cursor = this.host.cursor();
        await this.host.saveCursor({
            ...cursor,
            smallCountSinceLarge: 0,
        }, snapshot, this.getSettings());
        this.setStatus(snapshot.chatKey, 'complete', result.changed ? '大总结完成' : '大总结无更新');
        return result.entries;
    }
    async extract(settings, snapshot) {
        if (settings.extractionEnabled === false) {
            this.setStatus(snapshot.chatKey, 'complete', '提取未启用');
            return { entries: [], changed: false };
        }
        this.setStatus(snapshot.chatKey, 'extracting', '提取事实与状态');
        this.validate(snapshot);
        const entries = await this.worldbook.list(settings, snapshot, () => this.validate(snapshot));
        this.validate(snapshot);
        const selected = (0, matcher_1.relevantEntries)(entries, `${snapshot.playerText}\n${snapshot.assistantText}`);
        const prompt = (0, prompts_1.extractionPrompts)(settings, snapshot.playerText, snapshot.assistantText, selected);
        const raw = await this.host.generate(prompt.system, trimPrompt(prompt.user), settings.responseTokens, snapshot, settings, settings.requestTimeoutMs, settings.extractionProfileId);
        this.validate(snapshot);
        const blocks = (0, parser_1.parseStrictExtractionBlocks)(raw);
        if (!blocks.length) {
            this.setStatus(snapshot.chatKey, 'matching', '本轮明确返回“无”，世界书零写入', '', raw, emptyPlan());
            this.progress('success', '无可记录条目', { titles: [], created: [], updated: [], skipped: [] });
            return { entries, changed: false };
        }
        const titles = blocks.map((block) => block.title);
        this.setStatus(snapshot.chatKey, 'matching', `已提取 ${titles.length} 个条目：${titles.join('、')}`, '', raw);
        this.progress('running', `已提取 ${titles.length} 个，正在匹配`, { titles });
        const plan = (0, operations_1.buildOperationPlan)(blocks, entries, settings, `${snapshot.playerText}\n${snapshot.assistantText}`);
        await this.resolveSemanticDuplicates(plan, entries, settings, snapshot);
        const created = [...new Set(plan.operations.filter((operation) => operation.kind === 'create-entry').map((operation) => operation.title))];
        const updated = [...new Set(plan.operations.filter((operation) => operation.kind !== 'create-entry' && operation.kind !== 'noop').map((operation) => operation.title))];
        const skipped = [...new Set(plan.operations.filter((operation) => operation.kind === 'noop').map((operation) => operation.title))];
        this.progress('running', `准备写入：新建${created.length}、更新${updated.length}、跳过${skipped.length}`, { titles, created, updated, skipped });
        const result = await this.apply(settings, plan, snapshot, `${snapshot.playerText}\n${snapshot.assistantText}`, '提取', raw);
        this.progress('success', `完成：新建${created.length}、更新${updated.length}、跳过${skipped.length}`, { titles, created, updated, skipped });
        return result;
    }
    async resolveSemanticDuplicates(plan, entries, settings, snapshot) {
        const byUid = new Map(entries.map((entry) => [String(entry.uid), entry]));
        let skipped = 0;
        for (const operation of plan.operations) {
            if (operation.kind !== 'append-line' || !operation.targetUid || !operation.section || !operation.newValue) continue;
            const entry = byUid.get(String(operation.targetUid));
            const oldLines = entry?.sections?.values?.[operation.section] ?? [];
            const threshold = /(事件进程|近期经历|变化记录|历史事实)/u.test(operation.section) ? 0.93 : 0.86;
            const best = oldLines.reduce((score, oldValue) => Math.max(score, localSemanticSimilarity(oldValue, operation.newValue)), 0);
            if (best >= threshold) {
                operation.kind = 'noop';
                operation.operation = 'no-op';
                operation.reason = `本地语义解析器判定与已有事实相似度 ${(best * 100).toFixed(0)}%，跳过追加`;
                skipped += 1;
            }
        }
        if (skipped) this.setStatus(snapshot.chatKey, 'matching', `本地语义解析器跳过 ${skipped} 条重复事实`);
    }
    async summarize(kind, settings, snapshot) {
        const label = kind === 'small' ? '小总结' : '大总结';
        this.setStatus(snapshot.chatKey, kind === 'small' ? 'small-summary' : 'large-summary', label);
        this.validate(snapshot);
        const entries = await this.worldbook.list(settings, snapshot, () => this.validate(snapshot));
        this.validate(snapshot);
        const selected = summaryEntries(kind, entries, snapshot);
        const scope = kind === 'small' ? summaryScope(selected, snapshot) : '当前';
        const expectedTitle = kind === 'small' ? '总结｜当前事件' : '总结｜世界历史';
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
        const summaryBlocks = blocks.filter((block) => block.type === '总结');
        if (blocks.length !== 1 || summaryBlocks.length !== 1) throw new Error(`${label}必须包含且只包含一个“${expectedTitle}”总结条目`);
        if ((0, util_1.normalizeTitle)(summaryBlocks[0].title) !== (0, util_1.normalizeTitle)(expectedTitle)) throw new Error(`${label}标题必须是“${expectedTitle}”`);
        const plan = (0, operations_1.buildOperationPlan)(summaryBlocks, entries, settings, selected.map((entry) => `${entry.title}\n${entry.content}`).join('\n'), { cleanupTemporaryAfterSummary: true });
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
        return { entries, changed: entries.changed === true };
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
        const candidates = active.filter((entry) => entry.title !== '总结｜世界历史');
        const relevant = (0, matcher_1.relevantEntries)(candidates, `${snapshot.playerText}\n${snapshot.assistantText}`, 40);
        const continuity = candidates
            .filter((entry) => /^(事件|场景|时空)$/u.test(entry.type) || entry.title === '总结｜当前事件')
            .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
            .slice(0, 12);
        return [...new Map([...relevant, ...continuity].map((entry) => [entry.uid, entry])).values()].slice(0, 40);
    }
    const currentWorldHistory = active.filter((entry) => entry.title === '总结｜世界历史');
    const currentEvent = active.filter((entry) => entry.title === '总结｜当前事件');
    const longTerm = active.filter((entry) => /(人物|关系|组织|任务|契约|基础设定|全局变化|事件|地点|物品)/u.test(`${entry.type}\n${entry.keywords.join(' ')}`));
    return [...new Map([...currentWorldHistory, ...currentEvent, ...longTerm].map((entry) => [entry.uid, entry])).values()].slice(0, 100);
}
function summaryScope(entries, snapshot) {
    const event = entries.find((entry) => entry.type === '事件' && !entry.activation.disabled);
    if (event) return event.name;
    const scene = entries.find((entry) => entry.type === '场景' && !entry.activation.disabled);
    if (scene) return scene.name;
    const existing = entries.find((entry) => entry.title === '总结｜当前事件');
    if (existing) return existing.name;
    return '当前事件线';
}
function emptyPlan() { return { blocks: [], operations: [], createdAt: Date.now() }; }
function trimPrompt(value) { return value.length <= constants_1.MAX_CONTEXT_CHARS ? value : `${value.slice(0, constants_1.MAX_CONTEXT_CHARS)}\n[已按字符上限截断]`; }

function localSemanticSimilarity(left, right) {
    const a = localBigrams(left);
    const b = localBigrams(right);
    if (!a.length || !b.length) return localNormalizeSemantic(left) === localNormalizeSemantic(right) ? 1 : 0;
    const counts = new Map();
    for (const value of a) counts.set(value, (counts.get(value) ?? 0) + 1);
    let overlap = 0;
    for (const value of b) {
        const count = counts.get(value) ?? 0;
        if (count > 0) {
            overlap += 1;
            counts.set(value, count - 1);
        }
    }
    return (2 * overlap) / (a.length + b.length);
}
function localBigrams(value) {
    const text = localNormalizeSemantic(value);
    if (text.length < 2) return text ? [text] : [];
    const output = [];
    for (let index = 0; index < text.length - 1; index += 1) output.push(text.slice(index, index + 2));
    return output;
}
function localNormalizeSemantic(value) {
    return String(value ?? '')
        .toLocaleLowerCase()
        .replace(/(?:目前|当前|此时|现在)/gu, '')
        .replace(/(?:取得|拿到|得到)/gu, '获得')
        .replace(/(?:拥有着|持有着)/gu, '持有')
        .replace(/(?:身处于|处在|位在)/gu, '位于')
        .replace(/[\s，。！？；：、“”‘’（）()《》〈〉【】\[\]—…·,.!?:;'"`~|｜]/gu, '');
}
function safeChatKey(host) { try { return host.chatKey(); } catch { return ''; } }

},
"migration":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationService = void 0;
exports.needsMigration = needsMigration;
const constants_1 = require("./constants");
const parser_1 = require("./parser");
const information_point_1 = require("./domain/information-point");
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
            const uid = String(raw.uid ?? mapKey);
            const title = (0, util_1.stripUidSuffix)(String(raw.comment ?? raw.name ?? raw.title ?? ''));
            const content = String(raw.content ?? '');
            const keywords = (0, util_1.normalizeStringArray)(raw.key).filter((item) => !(0, util_1.isUidKeyword)(item));
            const prompt = (0, prompts_1.migrationPrompts)(title, content, keywords);
            const response = await this.host.generate(prompt.system, trimPrompt(prompt.user), settings.responseTokens, snapshot, settings, settings.requestTimeoutMs, settings.migrationProfileId);
            validate();
            const blocks = (0, information_point_1.prepareInformationBlocks)((0, parser_1.parseInformationPoints)(response));
            if (blocks.length !== 1)
                throw new Error(`旧条目“${title || mapKey}”整理结果必须只有一个条目`);
            const block = blocks[0];
            const migrated = next.entries[mapKey];
            const sections = sectionsWithPreservedOldText(block, content);
            migrated.comment = block.title;
            migrated.content = (0, parser_1.serializeEntrySections)(sections);
            migrated.key = (0, util_1.unique)([...keywords, ...block.keywords.filter((item) => !(0, util_1.isUidKeyword)(item)), (0, util_1.uidKeyword)(uid)]);
            converted.push({ uid, from: title, to: block.title });
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
            return target === normalized || target.includes(normalized) || normalized.includes(target);
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
const information_point_1 = require("./domain/information-point");
const util_1 = require("./util");
function buildOperationPlan(blocks, entries, settings, contextText, options = {}) {
    blocks = (0, information_point_1.prepareInformationBlocks)(blocks);
    const index = (0, matcher_1.buildEntryIndex)(entries);
    const operations = [];
    for (const block of blocks) {
        const candidates = (0, matcher_1.matchBlock)(block, index, contextText);
        const target = (0, matcher_1.selectBestCandidate)(candidates, 80);
        if (!target) {
            const auxiliary = candidates[0];
            if (auxiliary && auxiliary.score >= 50) {
                operations.push(noop(block.title, auxiliary.entry.uid, '', `仅得到 ${auxiliary.score} 分辅助匹配，低于自动覆盖阈值 80；保留世界书并等待人工确认`, auxiliary.score, auxiliary.evidence));
                continue;
            }
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
            const initialKeywords = [...block.keywords];
            if (shouldMarkTemporary(block)) initialKeywords.push('临时');
            for (const keyword of (0, util_1.unique)(initialKeywords)) {
                operations.push(op('merge-keywords', block.title, undefined, '关键词', undefined, keyword, keyword === '临时' ? '插件按一次性背景对象规则标记临时条目' : '新条目关键词写入'));
            }
            for (const section of block.sections) {
                if (/(关键词|触发词|标签|分类)/u.test(section.name))
                    continue;
                if (isLifecycleCommandSection(section.name))
                    continue;
                if (section.empty) {
                    operations.push(noop(block.title, undefined, section.name, 'AI填写“无”，不执行写入'));
                    continue;
                }
                const lines = linesWithoutCrossSectionDuplicates(block, section);
                if (!lines.length) { operations.push(noop(block.title, undefined, section.name, '该信息已在同一对象的主要归属小标题中表达')); continue; }
                if (/事件进程/u.test(section.name) && block.type !== '事件') { operations.push(noop(block.title, undefined, section.name, '事件进程只能写入事件条目')); continue; }
                operations.push(...operationsForNewSection(block.title, block.type, section.name, lines, policyFor(section.name, settings)));
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
            if (isLifecycleCommandSection(section.name))
                continue;
            if (section.empty) {
                operations.push(noop(entry.title, entry.uid, section.name, 'AI填写“无”，不执行写入', target.score, target.evidence));
                continue;
            }
            const lines = linesWithoutCrossSectionDuplicates(block, section);
            if (!lines.length) { operations.push(noop(entry.title, entry.uid, section.name, '该信息已在同一对象的主要归属小标题中表达', target.score, target.evidence)); continue; }
            if (/事件进程/u.test(section.name) && block.type !== '事件') { operations.push(noop(entry.title, entry.uid, section.name, '事件进程只能写入事件条目', target.score, target.evidence)); continue; }
            operations.push(...operationsForExisting(entry, section.name, lines, policyFor(section.name, settings), target.score, target.evidence));
        }
    }
    if (options.cleanupTemporaryAfterSummary === true)
        operations.push(...temporaryCleanupOperations(entries, settings, blocks));
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
function operationsForNewSection(title, type, section, lines, policy, normalized = false) {
    if (type === '总结') policy = 'replace-section';
    if (!normalized && type === '人物' && /当前状态/u.test(section)) {
        const multiValue = lines.filter(isMultiValueFact);
        const scalar = lines.filter((line) => !isMultiValueFact(line));
        return [
            ...multiValue.map(() => noop(title, undefined, section, '人物的物品、能力、任务或关系必须使用独立对象条目，不写入人物单值状态槽')),
            ...operationsForNewSection(title, type, section, scalar, policy, true),
        ];
    }
    if (policy === 'merge-keywords') {
        return lines.map((line) => op('merge-keywords', title, undefined, section, undefined, line, '新条目关键词合并'));
    }
    if (policy === 'merge-titles') {
        return lines.map((line) => op('merge-titles', title, undefined, section, undefined, line, '新条目关联标题合并'));
    }
    if (policy === 'replace-section') {
        return [op('replace-section', title, undefined, section, undefined, lines.join('\n'), '新条目整段写入')];
    }
    if (policy === 'replace-by-anchor') {
        return collapseIncomingBySlot(lines, policy).map((rawLine) => {
            const line = normalizeStateLine(section, (0, parser_1.normalizePointLine)(rawLine));
            const anchor = informationAnchor(line);
            return anchor
                ? op('append-line', title, undefined, section, undefined, line, `新条目写入明确状态槽“${anchor}”`)
                : noop(title, undefined, section, '当前状态缺少明确字段标签，拒绝写入可能无法更新的冲突状态');
        });
    }
    return lines.map((line) => op('append-line', title, undefined, section, undefined, line, '新条目信息点写入'));
}
function operationsForExisting(entry, section, lines, policy, score, evidence) {
    if (entry.type === '总结') policy = 'replace-section';
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
        const point = (0, parser_1.normalizePointLine)(incomingRaw);
        const incoming = policy === 'replace-by-anchor' ? normalizeStateLine(section, point) : point;
        if (entry.type === '人物' && /当前状态/u.test(section) && isMultiValueFact(point)) {
            result.push(noop(entry.title, entry.uid, section, '人物的物品、能力、任务或关系必须使用独立对象条目，不写入人物单值状态槽', score, evidence));
            continue;
        }
        const normalizedIncoming = (0, util_1.normalizeFact)(point);
        const duplicateElsewhere = otherFacts.find((line) => (0, util_1.normalizeFact)(line) === normalizedIncoming);
        if (duplicateElsewhere) {
            result.push(noop(entry.title, entry.uid, section, '相同事实已存在于该条目的其他主要归属小标题，拒绝重复写入', score, evidence));
            continue;
        }
        const exactOld = current.find((line) => (0, util_1.normalizeFact)(line) === normalizedIncoming || (0, util_1.normalizeFact)(normalizeStateLine(section, line)) === (0, util_1.normalizeFact)(incoming));
        if (exactOld) {
            result.push(noop(entry.title, entry.uid, section, '标准化后完全相同，跳过重复信息点', score, evidence));
            continue;
        }
        const anchor = informationAnchor(incoming);
        const anchoredOld = anchor ? current.find((line) => informationAnchor(line) === anchor) : undefined;
        if (policy === 'replace-by-anchor') {
            if (!anchor) {
                result.push(noop(entry.title, entry.uid, section, '当前状态缺少明确字段标签，拒绝追加可能冲突的状态；应使用“字段：当前值”格式', score, evidence));
                continue;
            }
            if (anchoredOld) {
                result.push(op('replace-line', entry.title, entry.uid, section, anchoredOld, incoming, `同一信息槽“${anchor}”更新当前值`, score, evidence));
            }
            else {
                result.push(op('append-line', entry.title, entry.uid, section, undefined, incoming, `首次写入明确状态槽“${anchor}”`, score, evidence));
            }
            continue;
        }
        if (policy === 'semantic-upsert' && anchoredOld) {
            result.push(op('replace-line', entry.title, entry.uid, section, anchoredOld, incoming, `同一固定信息槽“${anchor}”被新事实替换`, score, evidence));
            if (/固定事实/u.test(section))
                result.push(op('append-line', entry.title, entry.uid, '历史事实', undefined, `变更前：${anchoredOld}`, '固定事实发生明确变化，保留旧事实历史', score, evidence));
            continue;
        }
        result.push(op('append-line', entry.title, entry.uid, section, undefined, incoming, policy === 'append-chain' ? '非完全重复，按时间顺序追加事件或经历' : '非完全重复且无同槽旧值，追加信息点', score, evidence));
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
function isLifecycleCommandSection(section) {
    return /(沉降处理|条目处理|生命周期|退出处理|退出建议|分发目标|长期影响)/u.test(String(section ?? ''));
}
function isControlSection(section) {
    return /(沉降处理|条目处理|生命周期|退出处理|退出建议|分发目标|长期影响|影响对象|关联条目|关联对象|涉及条目|参与对象|引用)/u.test(String(section ?? ''));
}

function isBusinessFactSection(section) {
    return Boolean(String(section ?? '').trim())
        && !isControlSection(section)
        && !/(关键词|触发词|标签|分类|别名|称号|其他名称)/u.test(String(section));
}
function temporaryCleanupOperations(entries, settings, summaryBlocks = []) {
    const temporaryNames = new Set(['临时', '临时对象', '临时条目']);
    const summaryText = summaryBlocks.map((block) => [block.title, ...block.sections.flatMap((section) => section.lines)].join('\n')).join('\n');
    const normalizedSummary = (0, util_1.normalizeFact)(summaryText);
    return entries.flatMap((entry) => {
        const temporary = entry.keywords.some((keyword) => temporaryNames.has((0, util_1.normalizeFact)(keyword)));
        if (!temporary || !entry.managed || entry.locked || entry.focus || isFoundationProtected(entry, settings)) return [];
        if (!/^(人物|角色|NPC)$/u.test(entry.type)) return [];
        const name = (0, util_1.normalizeFact)(entry.name);
        if (name && normalizedSummary.includes(name)) return [];
        if (entry.references?.length) return [];
        const protectedSection = Object.entries(entry.sections.values ?? {}).some(([section, lines]) => {
            if (!lines?.length) return false;
            return /(固定事实|关系状态|能力状态|任务|契约|长期目标|历史事实)/u.test(section);
        });
        if (protectedSection) return [];
        return [{
            ...op('delete-entry', entry.title, entry.uid, '临时条目清理', undefined, '删除', '总结未继续承接该一次性背景对象，且没有长期关系、任务、契约、能力或历史绑定；插件机械退出'),
            requiresDistributionProof: false,
            distributionTargets: [],
        }];
    });
}
function shouldMarkTemporary(block) {
    // “临时”是插件根据明确的 NPC 类型打出的管理标记，不根据姓名猜测人物重要性。
    if (String(block.type ?? '').trim() !== 'NPC') return false;
    const longTerm = block.sections.some((section) => !section.empty && /(固定事实|关系状态|能力状态|任务|契约|长期目标|历史事实)/u.test(section.name));
    return !longTerm;
}
function isFoundationProtected(entry, settings) {
    const definition = settings.keywordDefinitions.find((item) => item.label === '基础设定');
    const names = definition ? [definition.label, ...definition.aliases] : ['基础设定'];
    return entry.keywords.some((keyword) => names.some((name) => (0, util_1.normalizeFact)(keyword) === (0, util_1.normalizeFact)(name)));
}
function linesWithoutCrossSectionDuplicates(block, section) {
    if (!/近期经历/u.test(section.name)) return section.lines;
    const current = block.sections.filter((item) => /当前状态/u.test(item.name)).flatMap((item) => item.lines).map(util_1.normalizeFact);
    return section.lines.filter((line) => !current.includes((0, util_1.normalizeFact)(line)));
}

function isMultiValueLabel(label) {
    return /^(持有物|物品|装备|能力|技能|任务|关系|关联对象|关联条目|资源列表|成员)$/u.test(String(label ?? '').trim());
}
function isMultiValueFact(line) {
    const text = String(line ?? '');
    const label = text.match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1]?.trim();
    return (label ? isMultiValueLabel(label) : false)
        || /(?:获得|失去|持有|拥有|学会|掌握|领取任务|接受任务|建立关系|结为|成为盟友|成为敌人)/u.test(text);
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
    if (/(关联条目|关联对象|涉及条目|参与对象|引用|影响对象)/u.test(section))
        return 'merge-titles';
    if (/(事件进程|事件链|进程|过程|阶段记录|近期经历|行动记录|历史事实|变化记录)/u.test(section))
        return 'append-chain';
    if (/(当前|状态|位置|持有者|所有者|归属|数量|完整性|可用性|阶段|当前结果|活动状态)/u.test(section))
        return 'replace-by-anchor';
    if (/(完整摘要|当前总结|长期总结|对象定义|基础定义)/u.test(section))
        return 'replace-section';
    return 'semantic-upsert';
}
function normalizeStateLine(section, line) {
    if (/^\s*[^：:]{1,24}\s*[：:]/u.test(line)) return line;
    if (informationAnchor(line)) return line;
    const name = String(section ?? '').trim();
    const canonical = [
        [/^(当前位置|位置|所在地|所在地点|当前地点)$/u, '当前位置'],
        [/^(身体状态|身体情况|健康状态|伤势|受伤)$/u, '身体状态'],
        [/^(当前身份|身份|职位|阵营|职业)$/u, '当前身份'],
        [/^(当前目标|目标|目的|计划)$/u, '当前目标'],
        [/^(当前持有者|持有者|所有者|归属)$/u, '当前持有者'],
        [/^(事件状态|当前阶段|阶段)$/u, name.includes('阶段') ? '当前阶段' : '事件状态'],
        [/^(数量|库存|完整性|可用性|魔力|体力|生命值|金币)$/u, name],
        [/^(关系状态|关系|态度|敌友|合作)$/u, '关系状态'],
        [/^(能力状态|能力|技能状态)$/u, '能力状态'],
        [/^(当前状态|状态)$/u, '当前状态'],
    ].find(([pattern]) => pattern.test(name))?.[1];
    return canonical ? `${canonical}：${line}` : line;
}
function informationAnchor(line) {
    const normalized = (0, util_1.normalizeFact)(line);
    const label = line.match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1]?.trim();
    if (label) {
        if (isMultiValueLabel(label)) return '';
        return `label:${(0, util_1.normalizeFact)(label)}`;
    }
    if (isMultiValueFact(line)) return '';
    const fieldPattern = /^(.{1,24}?)(?:的)?(身份|血统|种族|职业|阵营|所有者|持有者|位置|当前位置|阶段|当前阶段|结果|当前结果|生死状态|意识状态|身体状况|身体状态|健康状态|当前目标|目标|数量|库存|等级|进度|完整性|可用性|魔力|体力|生命值|金币)(?:是|为|变为|变成|升至|降至|增至|减至|恢复至|恢复到|减少到|增加到|只剩|剩余)(.+)$/u;
    const fieldMatch = line.match(fieldPattern);
    if (fieldMatch)
        return `${(0, util_1.normalizeFact)(fieldMatch[1] ?? '')}|${(0, util_1.normalizeFact)(fieldMatch[2] ?? '')}`;
    const possessiveFieldMatch = line.match(/^(.{1,24}?)的(.{1,24}?)(?:是|为|变为|变成|升至|降至|增至|减至|恢复至|恢复到|减少到|增加到|只剩|剩余)(.+)$/u);
    if (possessiveFieldMatch)
        return `${(0, util_1.normalizeFact)(possessiveFieldMatch[1] ?? '')}|${(0, util_1.normalizeFact)(possessiveFieldMatch[2] ?? '')}`;
    const resourceCountMatch = line.match(/^(.{1,24}?)(?:拥有|持有|剩余|只剩)(\d+(?:\.\d+)?)(枚|个|件|点|单位)(.{1,16})$/u);
    if (resourceCountMatch)
        return `${(0, util_1.normalizeFact)(resourceCountMatch[1] ?? '')}|${(0, util_1.normalizeFact)(resourceCountMatch[4] ?? '')}数量`;
    const patterns = [
        [/^(.{1,24}?)(?:当前)?(?:位于|身处|在)(.+)$/u, '当前位置'],
        [/^(.{1,24}?)(?:当前)?(?:由|归)(.{1,24}?)(?:持有|拥有|保管)$/u, '持有者'],
        [/^(.{1,24}?)(?:当前)?(?:状态为|处于)(.+)$/u, '一般状态'],
        [/^(.{1,24}?)(?:死亡|身亡|存活|复活)(.*)$/u, '生死状态'],
        [/^(.{1,24}?)(?:昏迷|清醒|失去意识|恢复意识)(.*)$/u, '意识状态'],
        [/^(.{1,24}?)(?:受伤|痊愈|中毒|患病|康复)(.*)$/u, '身体状况'],
    ];
    for (const [pattern, relation] of patterns) {
        const match = line.match(pattern);
        if (match)
            return `${(0, util_1.normalizeFact)(match[1] ?? '')}|${relation}`;
    }
    return '';
}
function applyOne(entry, operation) {
    const section = operation.section ?? '';
    const values = entry.sections.values;
    const aliasSection = operation.kind === 'merge-keywords' && /(别名|称号|其他名称)/u.test(section);
    if (section && (operation.kind !== 'merge-keywords' || aliasSection) && !values[section]) {
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
        'merge-keywords': 'append',
        'merge-titles': 'append',
        'create-entry': 'create',
        'delete-entry': 'delete',
        noop: 'no-op',
    })[kind] ?? kind;
}

},
"parser":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseInformationPoints = parseInformationPoints;
exports.parseStrictExtractionBlocks = parseStrictExtractionBlocks;
exports.parseEntrySections = parseEntrySections;
exports.serializeEntrySections = serializeEntrySections;
exports.sanitizeModelText = sanitizeModelText;
exports.normalizePointLine = normalizePointLine;
exports.parseLabeledSections = parseLabeledSections;
exports.stripListMarker = stripListMarker;
const util_1 = require("./util");
const SECTION_PATTERN = /^\s*【\s*([^】]+?)\s*】\s*$/u;
const PLAIN_SECTION_PATTERN = /^\s*([^：:\n]{1,24})\s*[:：]\s*$/u;
const TITLE_PATTERN = /^\s*(?:#{1,6}\s*)?([^【】\n]+?[｜|丨][^【】\n]+?)\s*$/u;
const COLON_TITLE_PATTERN = /^\s*(?:#{1,6}\s*)?((?:人物|角色|NPC|事件|地点|场景|物品|组织|关系|能力|任务|契约|资源|状态影响|基础设定|全局变化|时空|自定义对象|小总结|大总结|总结))\s*[:：]\s*([^：:\n]+?)\s*$/u;
const BULLET_PATTERN = /^\s*(?:[-*]\s+|[•·]\s*|\d+、\s*|\d+[.)]\s+)(.*?)\s*$/u;
const EMPTY_PATTERN = /^\s*(?:无|无变化|无新增事实|无可记录事实|没有)\s*[。.]?\s*$/u;
const EMPTY_VALUE_PATTERN = /^\s*[^：:\n]{1,24}\s*[:：]\s*(?:无|无变化|没有|未知|未说明)\s*[。.]*\s*$/u;
const PLAIN_SECTION_NAMES = new Set([
    '固定事实', '当前状态', '近期经历', '事件进程', '关系状态', '能力状态', '历史事实', '关联条目',
    '变化记录', '最终结果', '关键词', '触发词', '标签', '分类', '别名',
    '身份定义', '对象定义', '规则定义', '能力定义', '关系定义', '契约定义', '影响定义',
    '现行事实', '状态', '事件状态', '当前结果', '结束结论',
]);
const STRICT_ENTRY_PATTERN = /<<<ENTRY:([^:\r\n>]+):([^>\r\n]+)>>>\s*<<<KEYWORDS>>>\s*([\s\S]*?)\s*<<<CONTENT>>>\s*([\s\S]*?)\s*<<<END_ENTRY>>>/gu;
const STRICT_TYPES = new Set(['人物', '地点', '物品', '事件', '关系']);
const STRICT_SECTION_ORDER = {
    人物: ['关键词', '固定事实', '当前状态', '近期经历', '关联条目', '别名'],
    地点: ['关键词', '固定事实', '当前状态', '变化记录', '关联条目', '别名'],
    物品: ['关键词', '固定事实', '当前状态', '变化记录', '关联条目', '别名'],
    事件: ['关键词', '当前状态', '事件进程', '最终结果', '关联条目', '别名'],
    关系: ['关键词', '固定事实', '当前状态', '变化记录', '关联条目', '别名'],
};
function parseStrictExtractionBlocks(raw) {
    const text = sanitizeModelText(raw);
    if (/^(?:无|EMPTY)$/u.test(text.trim())) return [];
    const matches = [...text.matchAll(STRICT_ENTRY_PATTERN)];
    if (!matches.length) throw new Error('提取格式错误：缺少严格 ENTRY 标记');
    const residue = text.replace(STRICT_ENTRY_PATTERN, '').trim();
    if (residue) throw new Error('提取格式错误：条目标记外存在多余文本');
    const output = [];
    const titles = new Set();
    for (const match of matches) {
        const type = String(match[1] ?? '').trim();
        const name = String(match[2] ?? '').trim();
        if (!STRICT_TYPES.has(type)) throw new Error(`提取格式错误：不允许的条目类型 ${type || '空'}`);
        if (!name || /[:：<>\r\n]/u.test(name)) throw new Error(`提取格式错误：${type}条目缺少稳定名称`);
        const title = `${type}｜${name}`;
        const normalizedTitle = (0, util_1.normalizeTitle)(title);
        if (titles.has(normalizedTitle)) throw new Error(`提取格式错误：重复条目 ${title}`);
        titles.add(normalizedTitle);
        const keywords = String(match[3] ?? '').replace(/\r/g, '').split('\n').flatMap((line) => stripListMarker(line).split(/[,，]/u)).map((item) => item.trim()).filter(Boolean);
        if (!keywords.length) throw new Error(`提取格式错误：${title}缺少关键词`);
        if ((0, util_1.normalizeFact)(keywords[0]) !== (0, util_1.normalizeFact)(name)) throw new Error(`提取格式错误：${title}的第一个关键词必须是稳定名称`);
        const content = String(match[4] ?? '').trim();
        if (!content || /<<<(?:ENTRY|KEYWORDS|CONTENT|END_ENTRY)/u.test(content)) throw new Error(`提取格式错误：${title}正文为空或含非法标记`);
        if (/^(?:人物|地点|物品|事件|关系)[｜|丨]/mu.test(content) || /【\s*关键词\s*】/u.test(content)) throw new Error(`提取格式错误：${title}正文重复了标题或关键词栏目`);
        const composed = `${title}\n【关键词】\n${keywords.map((keyword) => `- ${keyword}`).join('\n')}\n\n${content}`;
        const parsed = parseInformationPoints(composed);
        if (parsed.length !== 1) throw new Error(`提取格式错误：${title}无法解析为单一条目`);
        const block = parsed[0];
        const actual = block.sections.map((section) => section.name);
        const expected = STRICT_SECTION_ORDER[type];
        if (actual.join('|') !== expected.join('|')) throw new Error(`提取格式错误：${title}小标题顺序必须是 ${expected.join('→')}`);
        const seenFacts = new Set();
        for (const section of block.sections) {
            if (['关键词', '关联条目', '别名'].includes(section.name)) continue;
            for (const line of section.lines) {
                if (/完整事实句|稳定名称|甲与乙/u.test(line)) throw new Error(`提取格式错误：${title}仍包含模板占位词`);
                const normalized = (0, util_1.normalizeFact)(line);
                if (seenFacts.has(normalized)) throw new Error(`提取格式错误：${title}内部存在重复事实：${line}`);
                seenFacts.add(normalized);
            }
        }
        output.push(block);
    }
    if (output.length > 12) throw new Error('提取格式错误：单次最多允许十二个条目');
    return output;
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
        const sectionMatch = line.match(SECTION_PATTERN) ?? (block ? matchPlainSection(line) : null);
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
            if (EMPTY_PATTERN.test(bullet) || EMPTY_VALUE_PATTERN.test(bullet)) {
                if (!section.lines.length) section.empty = true;
            }
            else {
                section.empty = false;
                section.lines.push(normalizePointLine(bullet));
            }
            continue;
        }
        if (block && section && (EMPTY_PATTERN.test(line) || EMPTY_VALUE_PATTERN.test(line))) {
            if (!section.lines.length) section.empty = true;
            continue;
        }
        // 冒号形式与“契约要求：”等事实天然歧义，只允许它开启首个条目。
        // 后续条目必须使用无歧义的“类型｜名称”标题。
        const titleMatch = line.match(TITLE_PATTERN) ?? (!block ? line.match(COLON_TITLE_PATTERN) : null);
        if (titleMatch && !SECTION_PATTERN.test(line)) {
            const rawTitle = titleMatch.length >= 3 ? `${titleMatch[1]}｜${titleMatch[2]}` : titleMatch[1].trim();
            // 模型没有 UID 权限。即使模型误带 UID，也只剥离为普通标题，绝不用于匹配。
            const title = (0, util_1.stripUidSuffix)(rawTitle);
            const split = (0, util_1.splitTitle)(title);
            if (!split)
                continue;
            block = { rawTitle, title, type: split.type, name: split.name, sections: [] };
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
        const match = line.match(SECTION_PATTERN) ?? matchPlainSection(line);
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
        if (!bullet || EMPTY_PATTERN.test(bullet) || EMPTY_VALUE_PATTERN.test(bullet))
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
function sanitizeModelText(raw) {
    return String(raw ?? '')
        .replace(/<think>[\s\S]*?<\/think>/giu, '')
        .replace(/^```(?:text|markdown|md)?\s*/iu, '')
        .replace(/\s*```$/u, '')
        .trim();
}
function normalizePointLine(value) {
    return stripListMarker(value)
        .replace(/\s+/gu, ' ')
        .replace(/[。.]\s*$/u, '。')
        .trim();
}
function stripListMarker(value) {
    return String(value ?? '').replace(/^\s*(?:[-*]\s+|[•·]\s*|\d+、\s*|\d+[.)]\s+)/u, '');
}
function matchPlainSection(line) {
    const match = String(line ?? '').match(PLAIN_SECTION_PATTERN);
    if (!match) return null;
    const compact = match[1].replace(/\s+/gu, '').trim();
    return PLAIN_SECTION_NAMES.has(compact) ? match : null;
}
function parseLabeledSections(text) {
    const map = new Map();
    let current = '';
    for (const rawLine of String(text ?? '').replace(/\r/g, '').split('\n')) {
        const line = rawLine.trimEnd();
        const match = line.match(SECTION_PATTERN) ?? matchPlainSection(line);
        if (match) {
            current = match[1].trim();
            if (!map.has(current)) map.set(current, []);
            continue;
        }
        if (current) map.get(current).push(line);
    }
    return map;
}

},
"prompts":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractionPrompts = extractionPrompts;
exports.auditPrompts = auditPrompts;
exports.revisionPrompts = revisionPrompts;
exports.summaryPrompts = summaryPrompts;
exports.duplicatePrompts = duplicatePrompts;
exports.migrationPrompts = migrationPrompts;
exports.keywordTemplate = keywordTemplate;
const util_1 = require("./util");

function auditPrompts(settings, playerText, assistantText, characterCard = '') {
    const system = `你是 Mirror Abyss 正文审核脚本。

你的职责只有一个：
判断 AI 生成文本是否违反用户设定。

你不是作者。
你不能：
- 改写剧情
- 添加剧情
- 补充背景
- 推测未来
- 优化文风
- 判断剧情是否精彩

你需要检查：

【玩家控制】
禁止 AI 替玩家决定动作、语言、思考、情绪和选择。

【知识限制】
角色只能知道自己看到、听到或已经公开的信息，禁止突然知道隐藏事实。

【世界规则】
检查能力限制、世界规则、种族规则和时间线。

【角色一致性】
检查身份、性格、能力和目标。

返回格式：
没有违规时只输出：
PASS

存在违规时输出：
FAIL

原因:
1. xxx
2. xxx

只能输出以上内容。`;
    const user = `审核规则：
${settings.auditPrompt || '（无）'}

角色设定：
${characterCard || '（无）'}

玩家输入：
${playerText || '（空）'}

需要审核正文：
${assistantText}`;
    return { system, user };
}

function revisionPrompts(settings, playerText, assistantText, issues) {
    const system = `你是 Mirror Abyss 正文修正脚本。

你的任务：
修正违反规则的正文。

必须保持：
1. 原剧情方向。
2. 原事件结果。
3. 原人物关系。
4. 原角色身份。

禁止：
1. 添加新的事件。
2. 删除已有事件。
3. 改变人物目标。
4. 修改世界规则。
5. 替玩家决定行动。
6. 输出解释。

你的输出只能是修正后的完整正文。
不要输出分析、原因、说明或修改记录。

用户附加修正规则：
${settings.revisionPrompt || '（无）'}`;
    const user = `违规原因：
${issues.map((item) => `- ${item}`).join('\n')}

玩家输入：
${playerText || '（空）'}

原正文：
${assistantText}`;
    return { system, user };
}

function extractionPrompts(settings, playerText, assistantText, relevant) {
    const existing = relevant.map(entryForPrompt).join('\n\n');
    const custom = settings.extractionPrompt.trim();
    const system = `你是 Mirror Abyss 严格语法事实提取器。

任务：把已经生成的剧情正文压缩为世界书事实条目。你不续写、不改写剧情、不复制正文段落。

只允许五类条目：人物、地点、物品、事件、关系。同一对象最多一条，单次最多十二条。
只提取明确发生、明确表达、明确确认，或正文结束时仍成立并会影响后续的事实。
不得提取NPC未表达心理、幕后计划、隐藏原因、未来结果、无载体远处事件、玩家未实现愿望、纯气氛、普通动作、对白全文、一次性背景人物和无持续价值物品。

【事实归属规则】
1. 人物条目只记录该人物的稳定事实、当前状态和个人经历。
2. 地点条目只记录地点自身结构、环境、控制与功能变化。
3. 物品条目只记录物品性质、持有、位置、完整性和用途变化。
4. 事件的发生过程只写入事件条目；其他条目只通过【关联条目】引用事件，不得复述事件经过。
5. 关系变化只写入关系条目；人物条目不得重复展开关系事实。
6. 同一事实不得出现在两个条目中，也不得换词复述。
7. 当前状态与变化过程不得重复。没有信息的栏目保留并填写“- 无”。“无”表示本轮没有新信息，不表示删除旧事实。

【唯一允许的外层语法】
每个条目必须严格使用：
<<<ENTRY:类型:稳定名称>>>
<<<KEYWORDS>>>
- 稳定名称
- 别名或高识别度关键词
<<<CONTENT>>>
固定小标题正文
<<<END_ENTRY>>>

多个条目连续输出，条目之间只空一行。禁止JSON、代码块、序号、解释、前言、后记和标记外文本。没有可记录事实时只输出“无”。

【人物正文固定顺序】
【固定事实】
- 身份：完整事实句。
- 稳定特征：完整事实句。
【当前状态】
- 位置：完整事实句。
- 身体状态：完整事实句。
- 当前事务：完整事实句。
【近期经历】
- 完整事实句。
【关联条目】
- 类型｜稳定名称
【别名】
- 别名

【地点正文固定顺序】
【固定事实】
- 地点属性：完整事实句。
- 稳定结构：完整事实句。
【当前状态】
- 环境状态：完整事实句。
- 在场情况：完整事实句。
- 当前功能：完整事实句。
【变化记录】
- 完整事实句。
【关联条目】
- 类型｜稳定名称
【别名】
- 别名

【物品正文固定顺序】
【固定事实】
- 物品性质：完整事实句。
- 已知用途：完整事实句。
【当前状态】
- 持有者：完整事实句。
- 所在位置：完整事实句。
- 完整性：完整事实句。
- 当前用途：完整事实句。
【变化记录】
- 完整事实句。
【关联条目】
- 类型｜稳定名称
【别名】
- 别名

【事件正文固定顺序】
【当前状态】
- 阶段：开始、进行中、暂停或结束。
- 当前局面：完整事实句。
【事件进程】
- 完整事实句。
【最终结果】
- 完整事实句。
【关联条目】
- 类型｜稳定名称
【别名】
- 别名

【关系正文固定顺序】
【固定事实】
- 关系对象：该关系连接甲与乙。
- 关系基础：完整事实句。
【当前状态】
- 关系性质：完整事实句。
- 双方立场：完整事实句。
- 当前互动条件：完整事实句。
【变化记录】
- 完整事实句。
【关联条目】
- 人物｜甲
- 人物｜乙
【别名】
- 无

每条事实必须是完整句：明确主体＋状态或变化＋对象、结果或必要条件。禁止碎片词。当前状态必须有明确状态槽。
输出前检查：标记完整、类型合法、名称明确、关键词第一项等于稳定名称、小标题顺序完全正确、正文不含标题和关键词、没有跨条目重复。${custom ? `\n\n用户附加要求：\n${custom}` : ''}`;
    const user = `玩家本轮输入：
${playerText || '（空）'}

AI最终正文：
${assistantText}

可能相关的既有世界书条目：
${existing || '（无）'}

只输出本轮新出现或发生变化的事实。已有条目中没有变化的内容不得重抄。`;
    return { system, user };
}

function summaryPrompts(kind, settings, entries, subject, recentConversation = '') {
    const isSmall = kind === 'small';
    const custom = (isSmall ? settings.smallSummaryPrompt : settings.largeSummaryPrompt).trim();
    const system = isSmall
        ? `你是 Mirror Abyss 小总结模块。

目标：
生成继续当前剧情必须知道的信息。

保留：
1. 当前场景。
2. 当前人物。
3. 当前目标。
4. 当前冲突。
5. 已发生结果。
6. 未解决事项。

禁止：
- 复述全部聊天。
- 文学化。
- 添加推测。
- 创造未来。
- 不得输出 UID、关键词、分发目标、删除、退出、归档或任何操作命令。

严格输出：
总结｜当前事件

【当前情况】

内容

【关键状态】

内容

【未解决事项】

内容

没有可总结内容时只输出“无”。${custom ? `\n\n用户附加要求：\n${custom}` : ''}`
        : `你是 Mirror Abyss 长期世界记录员。

目标：
提取跨场景继续剧情需要的信息。

保留：
- 长期关系
- 永久变化
- 重大事件结果
- 世界规则
- 长期目标

删除：
- 临时动作
- 普通对话
- 无影响细节

不得输出 UID、关键词、分发目标、删除、退出、归档或任何操作命令。

严格输出：
总结｜世界历史

【长期变化】

内容

【重要事件】

内容

【长期关系】

内容

没有可总结内容时只输出“无”。${custom ? `\n\n用户附加要求：\n${custom}` : ''}`;
    const recent = isSmall ? `\n\n最近聊天：\n${recentConversation || '（无）'}` : '';
    const user = `总结范围：
${subject || (isSmall ? '当前事件' : '世界历史')}${recent}

相关世界书：
${entries.map(entryForPrompt).join('\n\n') || '（无）'}`;
    return { system, user };
}

function duplicatePrompts(pairs) {
    const system = `你是 Mirror Abyss 重复事实判断器。

判断每一组事实是否表达同一件事。
否定、失去、不再、身份改变、关系改变、位置改变、数值升降和状态变化必须判为 DIFFERENT。

只按以下格式逐行返回：
序号|SAME
或
序号|DIFFERENT

禁止输出解释、JSON、代码块或其他内容。`;
    const user = pairs.map((pair, index) => `${index + 1}
事实A：${pair.oldValue}
事实B：${pair.newValue}`).join('\n\n');
    return { system, user };
}

function migrationPrompts(title, content, keywords) {
    const system = `你是 Mirror Abyss 世界书格式整理模块。
只整理给定旧条目的文字格式，不改变事实，不补充推测。

输出：
类型｜稳定名称

【合适的小标题】

原有信息点

要求：
1. 保留所有原有事实、限定词、否定、时间关系和不确定性。
2. 不输出 UID，不决定常驻、向量、递归、深度、顺序、位置或概率。
3. 无法可靠归类的原文放入【旧格式保留】，不得删除。
4. 不输出解释、JSON、代码块或思考过程。`;
    const user = `原标题：
${title || '（空）'}

原关键词：
${keywords.join('、') || '（无）'}

原正文：
${content || '（空）'}`;
    return { system, user };
}

function keywordTemplate(definitions) {
    return definitions.filter((item) => item.enabled).map((item) => {
        const aliases = item.aliases.length ? `；近义标签：${item.aliases.join('、')}` : '';
        const fields = item.fields.map((field) => `- 【${field.label}】`).join('\n');
        return `类型：${item.label}${aliases}\n用途：${item.description}\n${fields || '- 使用合适的小标题'}`;
    }).join('\n\n');
}

function entryForPrompt(entry) {
    const keywords = (entry.keywords ?? []).filter((item) => !(0, util_1.isUidKeyword)(item));
    return `标题：${entry.title}\n关键词：${keywords.join('、') || '无'}\n正文：\n${(0, util_1.truncate)(entry.content || '（空）', 2200)}`;
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
    keyword('scene', '场景', '场景自身的环境状态、临时布局、空间限制和可交互条件。', ['当前场景'], false, [
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
exports.DEFAULT_AUDIT_PROMPT = `只在存在明确违规时判定失败。检查：
1. 不得替焦点增加玩家未输入的台词、主动行动、重要决定、目标、价值判断或心理结论。
2. 玩家已声明的动作和语言按原意承接，不得顺势扩展为新决定。
3. 玩家无法单方面控制的外部结果，应依据人物意愿、能力、资源、权限、环境和既有事实判定。
4. 不得直接确认NPC未表达的真实心理、幕后计划、隐藏原因、无载体远处事件或玩家尚未获得的最终答案。
5. 记录、传闻、公告和人物说法不得自动升级为完整真相，也不得仅因表面相似强行建立因果。
6. NPC与世界应保持合理主动性；已完成流程不得无理由重复，重要场景应有具体反馈，但短对话与过渡场景不必强行制造重大变化。
7. 正文不得包含选项栏、行动列表、下一步建议、攻略、规则说明、自我解释、内部检查、属性面板、管理标签、回合编号或作者总结。
8. 自然段落、对白换行、正常标点、简短场景标题、文学性描写和NPC正常提问本身不构成违规。
有疑问但没有明确违规证据时判定通过。`;
exports.DEFAULT_REVISION_PROMPT = `只修改审核指出的明确违规部分。保留合规内容、原事件顺序、人物关系、叙事视角、语气和有效信息；不得续写、全面重写、新增人物、秘密、因果或结论。修正版必须是可直接替换原正文的完整自然正文，不得添加标签、解释、审核报告、选项或系统提示。`;
exports.DEFAULT_EXTRACTION_PROMPT = `严格使用人物、地点、物品、事件、关系五类固定格式；标题、关键词和事实正文必须分离；事实必须是完整句，不复制叙事正文，不跨栏目重复。`;
exports.DEFAULT_SMALL_SUMMARY_PROMPT = `生成下一阶段继续当前剧情必须知道的信息；保留当前地点、当前人物、当前目标、当前冲突、已经发生的结果和未解决事项。`;
exports.DEFAULT_LARGE_SUMMARY_PROMPT = `整理跨场景继续剧情仍需保留的长期影响；保留永久关系、重大事件结果、世界变化、长期规则和长期目标。`;
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
    autoProcess: false,
    auditEnabled: true,
    extractionEnabled: true,
    targetLorebook: '',
    autoCreateLorebook: false,
    auditPrompt: exports.DEFAULT_AUDIT_PROMPT,
    revisionPrompt: exports.DEFAULT_REVISION_PROMPT,
    extractionPrompt: exports.DEFAULT_EXTRACTION_PROMPT,
    smallSummaryPrompt: exports.DEFAULT_SMALL_SUMMARY_PROMPT,
    largeSummaryPrompt: exports.DEFAULT_LARGE_SUMMARY_PROMPT,
    responseTokens: 3072,
    requestTimeoutMs: 90000,
    smallSummaryTurns: 10,
    largeSummaryCount: 5,
    keywordDefinitions: exports.DEFAULT_KEYWORDS,
    sectionPolicies: {},
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
        autoProcess: candidate.autoProcess === true,
        auditEnabled: candidate.auditEnabled !== false,
        extractionEnabled: candidate.extractionEnabled !== false,
        targetLorebook: String(candidate.targetLorebook ?? ''),
        autoCreateLorebook: candidate.autoCreateLorebook === true,
        auditPrompt: String(candidate.auditPrompt ?? exports.DEFAULT_AUDIT_PROMPT) || exports.DEFAULT_AUDIT_PROMPT,
        revisionPrompt: String(candidate.revisionPrompt ?? exports.DEFAULT_REVISION_PROMPT) || exports.DEFAULT_REVISION_PROMPT,
        extractionPrompt: String(candidate.extractionPrompt ?? exports.DEFAULT_EXTRACTION_PROMPT) || exports.DEFAULT_EXTRACTION_PROMPT,
        smallSummaryPrompt: String(candidate.smallSummaryPrompt ?? exports.DEFAULT_SMALL_SUMMARY_PROMPT) || exports.DEFAULT_SMALL_SUMMARY_PROMPT,
        largeSummaryPrompt: String(candidate.largeSummaryPrompt ?? exports.DEFAULT_LARGE_SUMMARY_PROMPT) || exports.DEFAULT_LARGE_SUMMARY_PROMPT,
        responseTokens: (0, util_1.clampNumber)(candidate.responseTokens, 3072, 256, 16384),
        requestTimeoutMs: (0, util_1.clampNumber)(candidate.requestTimeoutMs, 90000, 10000, 300000),
        smallSummaryTurns: (0, util_1.clampNumber)(candidate.smallSummaryTurns, 10, 1, 100),
        largeSummaryCount: (0, util_1.clampNumber)(candidate.largeSummaryCount, 5, 1, 30),
        keywordDefinitions: parseKeywordDefinitions(candidate.keywordDefinitions, candidate.tables),
        sectionPolicies,
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
exports.stripUidSuffix = stripUidSuffix;
exports.uidKeyword = uidKeyword;
exports.titleWithUid = titleWithUid;
exports.isUidKeyword = isUidKeyword;
exports.splitTitle = splitTitle;
exports.normalizeFact = normalizeFact;
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
    return String(value ?? '')
        .replace(/^\s*#{1,6}\s*/u, '')
        .replace(/[|丨]/gu, '｜')
        .replace(/\s*｜\s*/gu, '｜')
        .replace(/[：:]\s*(?=[^｜\n]+$)/u, '｜')
        .replace(/\s+/gu, ' ')
        .trim();
}
function stripUidSuffix(value) {
    return normalizeTitle(value)
        .replace(/(?:｜|\s)[（(]?UID\s*[:：=]\s*[^｜）)\s]+[）)]?\s*$/iu, '')
        .trim();
}
function uidKeyword(uid) {
    const value = String(uid ?? '').trim();
    return value ? `UID:${value}` : '';
}
function titleWithUid(title, uid) {
    const logical = stripUidSuffix(title);
    const token = uidKeyword(uid);
    return token ? `${logical}｜${token}` : logical;
}
function isUidKeyword(value) {
    return /^UID\s*[:：=]\s*[^\s]+$/iu.test(String(value ?? '').trim());
}
function splitTitle(value) {
    const normalized = stripUidSuffix(value);
    const index = normalized.indexOf('｜');
    if (index <= 0 || index >= normalized.length - 1)
        return null;
    const type = normalized.slice(0, index).trim();
    const name = normalized.slice(index + 1).trim();
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
const entry_section_1 = require("./domain/entry-section");
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
            const effectiveUid = String(located.raw.uid ?? uid);
            let logicalTitle = (0, util_1.stripUidSuffix)(String(located.raw.comment ?? ''));
            if (patch.title !== undefined) {
                logicalTitle = (0, util_1.stripUidSuffix)(String(patch.title ?? ''));
                if (!(0, util_1.splitTitle)(logicalTitle))
                    throw new Error('条目标题必须使用“类型｜名称”格式');
            }
            if (patch.content !== undefined)
                located.raw.content = String(patch.content ?? '').trim();
            const requestedKeywords = patch.keywords !== undefined
                ? (0, util_1.normalizeStringArray)(patch.keywords)
                : (0, util_1.normalizeStringArray)(located.raw.key);
            const split = (0, util_1.splitTitle)(logicalTitle);
            located.raw.comment = logicalTitle;
            located.raw.key = (0, util_1.unique)([
                split?.name,
                ...requestedKeywords.filter((item) => !(0, util_1.isUidKeyword)(item) && (0, util_1.normalizeFact)(item) !== (0, util_1.normalizeFact)(split?.type ?? '')),
                (0, util_1.uidKeyword)(effectiveUid),
            ]);
            markManaged(located.raw, '', logicalTitle, '');
            const parsed = parseEntries(opened.data);
            const focusedUid = parsed.find((entry) => entry.focus)?.uid ?? '';
            this.applyNativeFields(parsed, settings, focusedUid, new Set([String(uid)]));
            return {
                verify(data) {
                    const result = findRawEntry(data, uid);
                    if (!result)
                        throw new Error(`条目 UID ${uid} 保存后丢失`);
                    const expectedLogicalTitle = patch.title !== undefined
                        ? (0, util_1.stripUidSuffix)(String(patch.title ?? ''))
                        : logicalTitle;
                    if ((0, util_1.normalizeTitle)(String(result.raw.comment ?? '')) !== (0, util_1.normalizeTitle)(expectedLogicalTitle))
                        throw new Error(`条目 UID ${uid} 的标题保存失败`);
                    if (!(0, util_1.normalizeStringArray)(result.raw.key).some((item) => (0, util_1.normalizeFact)(item) === (0, util_1.normalizeFact)((0, util_1.uidKeyword)(effectiveUid))))
                        throw new Error(`条目 UID ${uid} 的 UID 关键词保存失败`);
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
            ensureUidIdentity(located.raw, String(located.raw.uid ?? uid), (0, util_1.stripUidSuffix)(String(located.raw.comment ?? '')));
            const previousUpdatedAt = Number(readExtension(located.raw).updatedAt) || 0;
            const extension = markManaged(located.raw, '', (0, util_1.stripUidSuffix)(String(located.raw.comment ?? '')), '');
            if (previousUpdatedAt) extension.updatedAt = previousUpdatedAt;
            extension.locked = locked === true;
            const parsed = parseEntries(opened.data);
            const focusedUid = parsed.find((entry) => entry.focus)?.uid ?? '';
            this.applyNativeFields(parsed, settings, focusedUid, new Set());
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
                const effectiveUid = String(raw.uid ?? mapKey);
                const logicalTitle = (0, util_1.stripUidSuffix)(String(raw.comment ?? raw.name ?? raw.title ?? ''));
                const extension = readExtension(raw);
                if (extension.focus === true || (oldUid && effectiveUid === String(oldUid))) {
                    const previousUpdatedAt = Number(extension.updatedAt) || 0;
                    const marked = markManaged(raw, '', logicalTitle, '');
                    if (previousUpdatedAt) marked.updatedAt = previousUpdatedAt;
                    marked.focus = false;
                    delete marked.focusPreviousConstant;
                }
                if (nextUid && effectiveUid === String(nextUid)) {
                    const previousUpdatedAt = Number(readExtension(raw).updatedAt) || 0;
                    const marked = markManaged(raw, '', logicalTitle, '');
                    if (previousUpdatedAt) marked.updatedAt = previousUpdatedAt;
                    marked.focus = true;
                }
            }
            const parsed = parseEntries(opened.data);
            this.applyNativeFields(parsed, settings, nextUid, new Set());
            return {
                verify(data) {
                    const focused = Object.entries(data.entries ?? {})
                        .filter(([, raw]) => readExtension(raw).focus === true)
                        .map(([mapKey, raw]) => ({ uid: String(raw.uid ?? mapKey), raw }));
                    if (nextUid && (focused.length !== 1 || focused[0].uid !== String(nextUid)))
                        throw new Error('玩家焦点保存后未保持唯一');
                    if (!nextUid && focused.length)
                        throw new Error('玩家焦点清除失败');
                    if (nextUid && findRawEntry(data, nextUid)?.raw.constant !== true)
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
        const writeOperations = plan.operations.filter((operation) => !['noop', 'delete-entry'].includes(operation.kind));
        const exitOperations = plan.operations.filter((operation) => operation.kind === 'delete-entry');
        const operationId = commitOperationId(sourceMessageKey, plan.operations);
        let expectedAfterWrites = before;
        if (writeOperations.length) {
            const phasePlan = { ...plan, operations: writeOperations };
            expectedAfterWrites = (0, operations_1.applyPlanToEntries)(phasePlan, before);
            const byUid = new Map(before.map((entry) => [entry.uid, entry]));
            const touchedUids = new Set(writeOperations.filter((operation) => operation.targetUid).map((operation) => String(operation.targetUid)));
            const createdUids = new Set();
            for (const entry of expectedAfterWrites) {
                if (entry.uid.startsWith('new:')) {
                    const created = this.createEntry(opened.api, opened.name, opened.data);
                    hydrateRaw(created, entry, sourceMessageKey, operationId);
                    entry.uid = String(created.uid);
                    entry.mapKey = findMapKey(opened.data, created);
                    entry.raw = created;
                    createdUids.add(entry.uid);
                } else if (touchedUids.has(entry.uid)) {
                    const original = byUid.get(entry.uid);
                    if (!original) throw new Error(`待更新条目 UID ${entry.uid} 不存在`);
                    hydrateRaw(original.raw, entry, sourceMessageKey, operationId);
                }
            }
            this.applyNativeFields(parseEntries(opened.data), settings, focusUid, new Set([...touchedUids, ...expectedAfterWrites.filter((entry) => entry.raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY]?.lastOperationId === operationId).map((entry) => entry.uid)]), createdUids);
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
        let deletedCount = 0;
        if (exitOperations.length) {
            const exitBaseVersion = digestWorldbook(opened.data);
            const currentEntries = parseEntries(opened.data);
            const deleted = [];
            for (const operation of exitOperations) {
                const target = currentEntries.find((entry) => entry.uid === String(operation.targetUid));
                const foundation = target?.keywords.some((keyword) => isFoundation(keyword, settings));
                if (!target || target.locked || target.focus || foundation || target.uid === String(focusUid ?? '')) continue;
                if (operation.requiresDistributionProof === true) {
                    const requiredTargets = (0, util_1.normalizeStringArray)(operation.distributionTargets).map(util_1.normalizeTitle);
                    if (!requiredTargets.length) continue;
                    const currentTitles = new Set(currentEntries.map((entry) => (0, util_1.normalizeTitle)(entry.title)));
                    if (requiredTargets.some((title) => !currentTitles.has(title))) continue;
                }
                delete opened.data.entries[target.mapKey];
                deleted.push(target.uid);
            }
            deletedCount = deleted.length;
            if (deleted.length) {
                validate?.();
                const latestBeforeExit = await opened.api.loadWorldInfo(opened.name);
                if (!latestBeforeExit || digestWorldbook(latestBeforeExit) !== exitBaseVersion)
                    throw new Error('世界书在删除前已被其他操作修改，拒绝覆盖');
                validate?.();
                await this.save(opened);
                validate?.();
                const finalData = await opened.api.loadWorldInfo(opened.name);
                if (!finalData) throw new Error('世界书删除后回读失败');
                verifyExitResults(finalData, deleted);
                opened.data = finalData;
            }
        }
        validate?.();
        const result = parseEntries(opened.data);
        result.changed = writeOperations.length > 0 || deletedCount > 0;
        result.writeCount = writeOperations.length;
        result.deleteCount = deletedCount;
        return result;
    }
    applyNativeFields(entries, settings, focusUid, touchedUids, _createdUids = new Set()) {
        const normalizedFocusUid = String(focusUid ?? '');
        const currentContinuityUids = selectCurrentContinuityUids(entries);
        for (const entry of entries) {
            const focus = normalizedFocusUid ? entry.uid === normalizedFocusUid : entry.focus;
            const managed = entry.managed || touchedUids.has(entry.uid) || focus;
            if (!managed) continue;
            const profile = nativeProfileFor(entry, settings, currentContinuityUids, focus);
            const previousUpdatedAt = Number(readExtension(entry.raw).updatedAt) || 0;
            applyNativeProfile(entry.raw, profile);
            ensureUidIdentity(entry.raw, entry.uid, entry.title);
            const extension = markManaged(entry.raw, '', entry.title, '');
            if (!touchedUids.has(entry.uid) && previousUpdatedAt) extension.updatedAt = previousUpdatedAt;
            extension.focus = focus;
            extension.recallProfile = profile.name;
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
        const rawTitle = (0, util_1.normalizeTitle)(String(raw.comment ?? raw.name ?? raw.title ?? ''));
        const title = (0, util_1.stripUidSuffix)(rawTitle);
        const split = (0, util_1.splitTitle)(title);
        if (!split) continue;
        const content = String(raw.content ?? '');
        const sections = (0, entry_section_1.parseEntrySections)(content);
        const keywords = (0, util_1.normalizeStringArray)(raw.key);
        const aliases = (0, util_1.unique)((0, entry_section_1.sectionLines)(content, ['别名', '称号', '其他名称']));
        const extension = readExtension(raw);
        output.push({ uid: String(raw.uid ?? mapUid), mapKey: String(mapUid), title, normalizedTitle: title.toLocaleLowerCase(), type: split.type, name: split.name, content, sections, keywords: (0, util_1.unique)([split.name, ...keywords]), aliases, references: (0, entry_section_1.extractReferences)(content), focus: extension.focus === true, locked: extension.locked === true || raw.locked === true, managed: extension.managed === true, updatedAt: Number(extension.updatedAt) || 0, activation: { enabled: raw.disable !== true, constant: raw.constant === true, selective: raw.selective === true, vectorized: raw.vectorized === true, recursive: raw.recursive === true || (raw.preventRecursion !== true && raw.excludeRecursion !== true), preventRecursion: raw.preventRecursion === true, excludeRecursion: raw.excludeRecursion === true, delayUntilRecursion: finiteNumber(raw.delayUntilRecursion, 0), depth: Math.max(0, finiteNumber(raw.depth, 4)), order: finiteNumber(raw.order, 400), position: finiteNumber(raw.position, 0), role: finiteNumber(raw.role, 0), scanDepth: raw.scanDepth == null ? null : finiteNumber(raw.scanDepth, null), probability: finiteNumber(raw.probability, 100), useProbability: raw.useProbability !== false, disabled: raw.disable === true }, raw });
    }
    return output.sort((left, right) => left.title.localeCompare(right.title));
}
function hydrateRaw(raw, entry, sourceMessageKey, operationId) {
    const uid = String(raw.uid ?? entry.uid ?? '');
    const split = (0, util_1.splitTitle)(entry.title);
    raw.comment = entry.title;
    raw.content = (0, parser_1.serializeEntrySections)(entry.sections);
    raw.key = (0, util_1.unique)([
        split?.name,
        ...entry.keywords.filter((item) => !(0, util_1.isUidKeyword)(item) && (0, util_1.normalizeFact)(item) !== (0, util_1.normalizeFact)(split?.type ?? '')),
        (0, util_1.uidKeyword)(uid),
    ]);
    raw.keysecondary ?? (raw.keysecondary = []);
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
function selectCurrentContinuityUids(entries) {
    const output = new Set();
    for (const type of ['时空', '场景']) {
        const current = entries
            .filter((entry) => entry.managed && entry.type === type && !entry.activation.disabled)
            .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))[0];
        if (current) output.add(current.uid);
    }
    return output;
}
function nativeProfileFor(entry, settings, _currentContinuityUids, focus = false) {
    const foundation = isFoundationEntry(entry, settings) || entry.type === '基础设定';
    return {
        name: focus ? '玩家焦点' : (foundation ? '基础设定' : '普通条目'),
        constant: focus || foundation,
        vectorized: !foundation,
    };
}
function applyNativeProfile(raw, profile) {
    // 只映射规格明确授权的常驻与向量字段。
    // 递归、深度、顺序、位置、选择性、概率等均保留用户在 SillyTavern 中的原设置。
    raw.constant = profile.constant === true;
    raw.vectorized = profile.vectorized === true;
}
function ensureUidIdentity(raw, uid, logicalTitle) {
    const effectiveUid = String(uid ?? raw.uid ?? '').trim();
    const title = (0, util_1.stripUidSuffix)(logicalTitle || String(raw.comment ?? raw.name ?? raw.title ?? ''));
    const split = (0, util_1.splitTitle)(title);
    if (title) raw.comment = title;
    raw.key = (0, util_1.unique)([
        split?.name,
        ...(0, util_1.normalizeStringArray)(raw.key).filter((item) => !(0, util_1.isUidKeyword)(item) && (0, util_1.normalizeFact)(item) !== (0, util_1.normalizeFact)(split?.type ?? '')),
        (0, util_1.uidKeyword)(effectiveUid),
    ]);
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
        if ((0, util_1.normalizeTitle)(found.title) !== (0, util_1.normalizeTitle)(item.title)) throw new Error(`世界书逻辑标题未正确落盘：${item.title}`);
        if ((0, util_1.normalizeTitle)(String(found.raw.comment ?? '')) !== (0, util_1.normalizeTitle)(item.title)) throw new Error(`世界书标题未正确落盘：${item.title}`);
        if (normalizeContent(found.content) !== normalizeContent((0, parser_1.serializeEntrySections)(item.sections))) throw new Error(`世界书正文未正确落盘：${item.title}`);
        const actualKeys = [...new Set(found.keywords.map(util_1.normalizeFact))].sort();
        const expectedKeys = [...new Set([found.name, ...item.keywords.filter((key) => (0, util_1.normalizeFact)(key) !== (0, util_1.normalizeFact)(found.type)), (0, util_1.uidKeyword)(found.uid)].map(util_1.normalizeFact))].sort();
        if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) throw new Error(`世界书关键词未正确落盘：${item.title}`);
        const extension = readExtension(found.raw);
        if (extension.lastOperationId !== operationId) throw new Error(`世界书操作 ID 未正确落盘：${item.title}`);
        const focus = Boolean(focusUid && found.uid === String(focusUid));
        const currentContinuityUids = selectCurrentContinuityUids(actual);
        const profile = nativeProfileFor(found, settings, currentContinuityUids, focus);
        if (found.activation.constant !== profile.constant) throw new Error(`constant 字段未按条目类型落盘：${item.title}`);
        if (found.activation.vectorized !== profile.vectorized) throw new Error(`vectorized 字段未按条目类型落盘：${item.title}`);
    }
}
function verifyExitResults(data, deleted) {
    const entries = parseEntries(data);
    for (const uid of deleted) if (entries.some((item) => item.uid === uid)) throw new Error(`条目删除未正确落盘：UID ${uid}`);
}
function normalizeContent(value) { return String(value ?? '').replace(/\r/g, '').trim(); }
function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
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
