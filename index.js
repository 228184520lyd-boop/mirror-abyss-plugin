/** Mirror Abyss 2.0.0-core.3 fixed-baseline V1.0 build. */
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
const control_panel_1 = require("./control-panel");
class MirrorAbyssApplication {
    constructor() {
        this.host = new host_1.HostAdapter();
        this.settingsStore = new settings_1.SettingsStore();
        this.worldbook = new worldbook_1.WorldbookAdapter(() => this.host.context(), () => this.host.chatKey());
        this.auditRunner = new audit_1.AuditRunner(this.host, () => this.settings());
        this.memoryRunner = new memory_1.MemoryRunner(this.host, this.worldbook, () => this.settings());
        this.controlPanel = new control_panel_1.ControlPanel({
            getSettings: () => this.settings(),
            configure: (patch) => this.configure(patch),
            audit: () => this.audit(),
            extract: () => this.extract(),
            smallSummary: () => this.smallSummary(),
            largeSummary: () => this.largeSummary(),
            cancel: () => this.cancel(),
        });
        this.cleanup = [];
        this.runningByChat = new Map();
        this.pendingTaskKeys = new Set();
        this.activeTokens = new Map();
        this.started = false;
    }
    start() {
        if (this.started) return;
        this.host.context();
        this.listen('MESSAGE_RECEIVED', (value) => void this.onMessage(Number(value)));
        for (const event of ['CHAT_CHANGED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED']) this.listen(event, () => this.onScopeChanged(event));
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
        this.controlPanel.unmount();
    }
    isStarted() { return this.started; }
    settings() { return this.settingsStore.load(this.host.context()); }
    configure(patch) { return this.settingsStore.save(this.host.context(), patch); }
    audit() { return this.enqueueTask('audit', undefined, false); }
    extract() { return this.enqueueTask('extraction', undefined, false); }
    smallSummary() { return this.enqueueTask('smallSummary', undefined, false); }
    largeSummary() { return this.enqueueTask('largeSummary', undefined, false); }
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
    listen(eventName, handler) {
        try { this.cleanup.push(this.host.subscribe(eventName, handler, false)); }
        catch (error) { console.warn(`[MirrorAbyss] 宿主事件 ${eventName} 不可用`, error); }
    }
    async onMessage(index) {
        if (!Number.isInteger(index) || !this.host.isAssistantIndex(index)) return;
        const settings = this.settings();
        if (!settings.enabled || !settings.autoProcess) return;
        this.host.bumpScopeRevision(this.host.chatKey());
        try { await this.enqueueTask('full', index, true); }
        catch (error) { console.error('[MirrorAbyss] automatic core flow failed', error); }
    }
    onScopeChanged(eventName) {
        this.cancelAll(`SillyTavern 事件 ${eventName} 使旧任务失效`);
        try { this.host.bumpScopeRevision(this.host.chatKey()); } catch { }
        this.controlPanel.setStatus('聊天或正文范围已变化，旧任务已取消');
    }
    enqueueTask(taskType, index, automatic) {
        const settings = this.settings();
        const token = { cancelled: false, reason: '' };
        const snapshot = this.host.captureSnapshot(settings, index, taskType, token);
        const taskKey = `${snapshot.chatKey}|${taskType}|${snapshot.messageKey}|${snapshot.contentHash}`;
        if (this.pendingTaskKeys.has(taskKey)) return Promise.reject(new Error('同一任务已经在执行或等待，不重复排队'));
        this.pendingTaskKeys.add(taskKey);
        const previous = this.runningByChat.get(snapshot.chatKey) ?? Promise.resolve();
        const task = previous.catch(() => undefined).then(async () => {
            this.activeTokens.set(snapshot.chatKey, token);
            try { return await this.runTask(taskType, snapshot, automatic, settings); }
            finally { if (this.activeTokens.get(snapshot.chatKey) === token) this.activeTokens.delete(snapshot.chatKey); }
        });
        this.runningByChat.set(snapshot.chatKey, task);
        return task.finally(() => {
            this.pendingTaskKeys.delete(taskKey);
            if (this.runningByChat.get(snapshot.chatKey) === task) this.runningByChat.delete(snapshot.chatKey);
        });
    }
    async runTask(taskType, snapshot, automatic, settings) {
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
            this.controlPanel.setStatus(`处理失败：${text}`, true);
            notify('error', `镜渊：${text}`);
            throw error;
        }
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

},
"audit":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditRunner = void 0;
exports.parseAuditResult = parseAuditResult;
const constants_1 = require("./constants");
const prompts_1 = require("./prompts");
const parser_1 = require("./parser");
const util_1 = require("./util");
class AuditRunner {
    constructor(host, getSettings) {
        this.host = host;
        this.getSettings = getSettings;
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
            this.setStatus(snapshot.chatKey, 'audit', '审核正文并生成必要的最小修正版');
            const prompt = (0, prompts_1.auditPrompts)(settings, snapshot.playerText, snapshot.assistantText);
            const raw = await this.host.generate(prompt.system, trimPrompt(prompt.user), settings.responseTokens, snapshot, settings, settings.requestTimeoutMs, profileId(settings));
            this.host.assertSnapshot(snapshot, this.getSettings());
            const result = parseAuditResult(raw);
            let finalSnapshot = snapshot;
            if (result.decision === 'revision') {
                if (result.revisedText === snapshot.assistantText) throw new Error('审核要求修正，但修正版与原正文完全相同');
                finalSnapshot = await this.host.replaceAssistantText(snapshot, result.revisedText, this.getSettings());
                this.setStatus(snapshot.chatKey, 'revision', '最小修正版正文已落地');
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
    const sections = parseSections(text);
    const conclusion = firstNonEmpty(sections.get('结论')) || text.match(/^\s*(通过|需要修正)/u)?.[1] || '';
    const issueNames = ['替玩家发言', '替玩家作出重要选择', '虚构未发生事实', '明显逻辑冲突', '问题', '违反规则'];
    const issues = issueNames.flatMap((name) => nonEmptyLines(sections.get(name))).filter((line) => !isNone(line));
    const revised = sectionText(sections.get('最小修正版正文') ?? sections.get('正文'));
    if (/^通过[。.]?$/u.test(conclusion)) {
        if (issues.length) throw new Error('审核结论为“通过”，但问题字段并非“无”');
        if (revised && !isNone(revised)) throw new Error('审核结论为“通过”，但返回了修正版正文');
        return { decision: 'pass', issues: [] };
    }
    if (!/^需要修正[。.]?$/u.test(conclusion)) throw new Error('审核返回缺少明确的“通过”或“需要修正”结论');
    if (!issues.length) throw new Error('审核要求修正，但没有指出具体问题');
    if (!revised || isNone(revised)) throw new Error('审核要求修正，但没有返回完整最小修正版正文');
    if (/^(?:修改建议|局部补丁|将.+改为|删除.+|替换.+)[：:：]?/u.test(revised.trim())) throw new Error('审核返回的是说明或局部补丁，不是完整正文');
    return { decision: 'revision', issues, revisedText: revised.trim() };
}
function parseSections(text) {
    const map = new Map();
    let current = '';
    for (const rawLine of String(text ?? '').replace(/\r/g, '').split('\n')) {
        const line = rawLine.trimEnd();
        const match = line.match(/^\s*【\s*([^】]+?)\s*】\s*$/u);
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
function firstNonEmpty(lines = []) { return nonEmptyLines(lines)[0] ?? ''; }
function sectionText(lines = []) { return lines.join('\n').trim(); }
function isNone(value) { return /^\s*(?:无|没有|无问题)\s*[。.]?\s*$/u.test(String(value ?? '')); }
function profileId(settings) { return settings.modelSource === 'profile' ? settings.modelProfileId : ''; }
function trimPrompt(value) { return value.length <= constants_1.MAX_CONTEXT_CHARS ? value : `${value.slice(0, constants_1.MAX_CONTEXT_CHARS)}\n[已按字符上限截断]`; }
function safeChatKey(host) { try { return host.chatKey(); } catch { return ''; } }

},
"constants":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGED_VERSION = exports.MAX_CONTEXT_CHARS = exports.WORLD_INFO_EXTENSION_KEY = exports.EXTENSION_NAMESPACE = exports.DISPLAY_NAME = exports.VERSION = void 0;
exports.VERSION = '2.0.0-core.3';
exports.DISPLAY_NAME = 'Mirror Abyss｜镜渊 Core';
exports.EXTENSION_NAMESPACE = 'mirrorAbyssInfoPoint';
exports.WORLD_INFO_EXTENSION_KEY = 'mirrorAbyssInfoPoint';
exports.MAX_CONTEXT_CHARS = 48000;
exports.MANAGED_VERSION = 5;

},
"control-panel":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlPanel = void 0;
const util_1 = require("./util");
const ROOT_ID = 'mirror-abyss-core-control';
class ControlPanel {
    constructor(actions) {
        this.actions = actions;
        this.root = null;
        this.panel = null;
        this.statusNode = null;
        this.autoInput = null;
        this.auditInput = null;
        this.actionButtons = [];
        this.busy = false;
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
        const existing = document.getElementById(ROOT_ID);
        if (existing) existing.remove();
        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.style.cssText = 'position:fixed;right:12px;bottom:86px;z-index:2147482000;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f2f2f2;line-height:1.35;';
        const launcher = document.createElement('button');
        launcher.type = 'button';
        launcher.textContent = '镜渊';
        launcher.title = '打开或收起镜渊控制面板';
        launcher.style.cssText = 'display:block;margin-left:auto;width:48px;height:36px;border:1px solid rgba(255,255,255,.24);border-radius:9px;background:rgba(20,20,24,.94);color:#fff;font-weight:700;box-shadow:0 3px 12px rgba(0,0,0,.35);cursor:pointer;';
        const panel = document.createElement('section');
        panel.hidden = true;
        panel.setAttribute('aria-label', '镜渊核心控制面板');
        panel.style.cssText = 'box-sizing:border-box;width:min(286px,calc(100vw - 24px));margin-top:8px;padding:12px;border:1px solid rgba(255,255,255,.18);border-radius:11px;background:rgba(20,20,24,.97);box-shadow:0 8px 28px rgba(0,0,0,.45);';
        const title = document.createElement('div');
        title.textContent = 'Mirror Abyss｜核心控制';
        title.style.cssText = 'font-size:14px;font-weight:700;margin-bottom:10px;';
        const switches = document.createElement('div');
        switches.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;';
        const autoControl = this.makeSwitch('自动处理');
        const auditControl = this.makeSwitch('审核开关');
        this.autoInput = autoControl.input;
        this.auditInput = auditControl.input;
        switches.append(autoControl.label, auditControl.label);
        const actions = document.createElement('div');
        actions.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:7px;';
        const auditButton = this.makeActionButton('审核', () => this.actions.audit());
        auditButton.dataset.auditAction = 'true';
        actions.append(
            auditButton,
            this.makeActionButton('提取', () => this.actions.extract()),
            this.makeActionButton('小总结', () => this.actions.smallSummary()),
            this.makeActionButton('大总结', () => this.actions.largeSummary()),
            this.makeActionButton('取消任务', () => this.actions.cancel()),
        );
        const status = document.createElement('div');
        status.textContent = '就绪';
        status.style.cssText = 'margin-top:9px;min-height:18px;font-size:12px;color:rgba(255,255,255,.72);overflow-wrap:anywhere;';
        this.statusNode = status;
        panel.append(title, switches, actions, status);
        root.append(launcher, panel);
        document.body.append(root);
        this.root = root;
        this.panel = panel;
        launcher.addEventListener('click', () => {
            panel.hidden = !panel.hidden;
            if (!panel.hidden) this.refresh();
        });
        this.autoInput.addEventListener('change', () => void this.saveSwitch('autoProcess', this.autoInput.checked, '自动处理'));
        this.auditInput.addEventListener('change', () => void this.saveSwitch('auditEnabled', this.auditInput.checked, '审核'));
        this.refresh();
    }
    unmount() {
        if (typeof document !== 'undefined' && this.waitingForDom) {
            document.removeEventListener('DOMContentLoaded', this.onDomReady);
        }
        this.waitingForDom = false;
        this.root?.remove();
        this.root = null;
        this.panel = null;
        this.statusNode = null;
        this.autoInput = null;
        this.auditInput = null;
        this.actionButtons = [];
        this.busy = false;
    }
    refresh() {
        try {
            const settings = this.actions.getSettings();
            if (this.autoInput) this.autoInput.checked = settings.autoProcess === true;
            if (this.auditInput) this.auditInput.checked = settings.auditEnabled === true;
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
    makeSwitch(text) {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex;align-items:center;gap:7px;padding:7px 8px;border:1px solid rgba(255,255,255,.12);border-radius:8px;font-size:13px;cursor:pointer;user-select:none;';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.style.cssText = 'margin:0;';
        const caption = document.createElement('span');
        caption.textContent = text;
        label.append(input, caption);
        return { label, input };
    }
    makeActionButton(label, action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.style.cssText = 'min-height:34px;border:1px solid rgba(255,255,255,.17);border-radius:8px;background:rgba(255,255,255,.08);color:#fff;font-size:13px;cursor:pointer;';
        button.addEventListener('click', () => void this.runAction(label, action));
        this.actionButtons.push(button);
        return button;
    }
    async saveSwitch(key, value, label) {
        try {
            await this.actions.configure({ [key]: value });
            this.setStatus(`${label}已${value ? '开启' : '关闭'}`);
            this.refresh();
        }
        catch (error) {
            this.setStatus(`${label}设置失败：${(0, util_1.errorText)(error)}`, true);
            this.refresh();
        }
    }
    async runAction(label, action) {
        if (this.busy) return;
        this.busy = true;
        this.syncDisabledState();
        this.setStatus(`${label}中…`);
        try {
            await action();
            this.setStatus(`${label}完成`);
            notify('success', `镜渊：${label}完成`);
        }
        catch (error) {
            const text = (0, util_1.errorText)(error);
            this.setStatus(`${label}失败：${text}`, true);
            notify('error', `镜渊：${label}失败：${text}`);
        }
        finally {
            this.busy = false;
            this.refresh();
        }
    }
    syncDisabledState() {
        const auditEnabled = this.auditInput?.checked === true;
        for (const button of this.actionButtons) {
            const disabled = this.busy || (button.dataset.auditAction === 'true' && !auditEnabled);
            button.disabled = disabled;
            button.style.opacity = disabled ? '.48' : '1';
            button.style.cursor = disabled ? 'not-allowed' : 'pointer';
        }
        if (this.autoInput) this.autoInput.disabled = this.busy;
        if (this.auditInput) this.auditInput.disabled = this.busy;
    }
}
exports.ControlPanel = ControlPanel;
function notify(kind, message) {
    const toast = globalThis.toastr?.[kind];
    if (typeof toast === 'function') toast(message);
    else console[kind === 'error' ? 'error' : 'info'](`[MirrorAbyss] ${message}`);
}

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
            responseTokens: settings.responseTokens,
            requestTimeoutMs: settings.requestTimeoutMs,
            targetLorebook: settings.targetLorebook,
            auditPrompt: settings.auditPrompt,
            extractionPrompt: settings.extractionPrompt,
            smallSummaryPrompt: settings.smallSummaryPrompt,
            largeSummaryPrompt: settings.largeSummaryPrompt,
        }));
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
    assertSnapshot(snapshot, currentSettings) {
        if (!snapshot) throw new Error('任务快照不存在');
        if (snapshot.token?.cancelled) throw new Error(snapshot.token.reason || '任务已取消');
        if (snapshot.runtimeSessionId !== this.runtimeSessionId) throw new Error('运行会话已经变化，旧任务作废');
        if (this.chatKey() !== snapshot.chatKey) throw new Error('聊天已经切换，旧任务作废');
        const context = this.context();
        if (context.chat !== snapshot.chatInstance) throw new Error('聊天实例已经变化，旧任务作废');
        if (this.roleKey() !== snapshot.roleKey) throw new Error('当前角色或群组已经变化，旧任务作废');
        if (this.scopeRevision(snapshot.chatKey) !== snapshot.scopeRevision) throw new Error('聊天作用域版本已经变化，旧任务作废');
        const turn = this.latestTurn(snapshot.messageIndex);
        if (turn.messageKey !== snapshot.messageKey || turn.contentHash !== snapshot.contentHash) throw new Error('正文版本已经变化，旧任务作废');
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
        message.mes = text;
        if (Array.isArray(message.swipes) && Number.isInteger(message.swipe_id) && Number(message.swipe_id) >= 0) message.swipes[Number(message.swipe_id)] = text;
        this.context().updateMessageBlock?.(snapshot.messageIndex, message);
        await this.saveChat();
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
        root.cursor = structuredClone(cursor);
        await this.saveMetadata();
        if (snapshot) this.assertSnapshot(snapshot, currentSettings);
    }
    getFocusTitle() { return String(this.chatNamespace().focusTitle ?? '').trim(); }
    async setFocusTitle(title) {
        const root = this.chatNamespace();
        root.focusTitle = String(title ?? '').trim();
        await this.saveMetadata();
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
        this.context().updateMessageBlock?.(index, message);
        void this.saveChat();
        return generated;
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
        cancel: async () => (await requireApplication()).cancel(),
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
    if (removeApi) delete globalThis.MirrorAbyss;
}
function onActivate() { extensionEnabled = true; retryAttempts = 0; exposeApi(); void initialize(); }
function onEnable() { extensionEnabled = true; retryAttempts = 0; exposeApi(); void initialize(); }
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
    tiers.push(uniqueCandidates(index.byAlias.get(normalizeLookup(block.name)) ?? [], weights.alias, 'alias', `别名“${block.name}”命中`, 5));
    const keywordHits = new Map();
    for (const key of [block.name, ...block.keywords]) {
        for (const entry of index.byKeyword.get(normalizeLookup(key)) ?? []) keywordHits.set(entry.uid, entry);
    }
    tiers.push(uniqueCandidates([...keywordHits.values()], weights.keywordExact, 'keyword', '名称或类型关键词精确命中', 6));
    const referenceHits = index.entries.filter((entry) => entry.references.some((title) => normalizeTitleLookup(title) === normalizeTitleLookup(block.title))
        || block.sections.some((section) => section.lines.some((line) => normalizeTitleLookup(line) === normalizeTitleLookup(entry.title))));
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
    const fallback = entries.filter((entry) => /(小总结|大总结|事件|场景)/u.test(entry.type)).slice(-12);
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
    return a === b || a.includes(b) || b.includes(a);
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
        const raw = await this.host.generate(prompt.system, trimPrompt(prompt.user), settings.responseTokens, snapshot, settings, settings.requestTimeoutMs, profileId(settings));
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
        const prompt = (0, prompts_1.summaryPrompts)(kind, settings, selected, scope);
        const raw = await this.host.generate(prompt.system, trimPrompt(prompt.user), settings.responseTokens, snapshot, settings, settings.requestTimeoutMs, profileId(settings));
        this.validate(snapshot);
        const blocks = (0, parser_1.parseInformationPoints)(raw);
        if (!blocks.length) {
            this.setStatus(snapshot.chatKey, kind === 'small' ? 'small-summary' : 'large-summary', `${label}明确返回“无”`, '', raw, emptyPlan());
            return { entries, changed: false };
        }
        const summaryBlocks = blocks.filter((block) => block.type === label);
        if (summaryBlocks.length !== 1 || blocks.length !== 1) throw new Error(`${label}必须只返回一个“${expectedTitle}”条目`);
        if ((0, util_1.normalizeTitle)(summaryBlocks[0].title) !== (0, util_1.normalizeTitle)(expectedTitle)) throw new Error(`${label}标题必须是“${expectedTitle}”`);
        const plan = (0, operations_1.buildOperationPlan)(summaryBlocks, entries, settings, selected.map((entry) => `${entry.title}\n${entry.content}`).join('\n'));
        return this.apply(settings, plan, snapshot, selected.map((entry) => `${entry.title}\n${entry.content}`).join('\n'), label, raw);
    }
    async apply(settings, plan, snapshot, contextText, label, raw) {
        this.setStatus(snapshot.chatKey, 'matching', `${label}生成确定性操作计划`, '', raw, plan);
        if (!plan.operations.some((operation) => operation.kind !== 'noop')) return { entries: [], changed: false };
        this.setStatus(snapshot.chatKey, 'worldbook', `${label}通过唯一提交器写入世界书`, '', raw, plan);
        this.validate(snapshot);
        const entries = await this.worldbook.apply(settings, plan, snapshot.messageKey, contextText, this.host.getFocusTitle(), snapshot, () => this.validate(snapshot));
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
        return relevant.filter((entry) => !/^大总结$/u.test(entry.type));
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
function profileId(settings) { return settings.modelSource === 'profile' ? settings.modelProfileId : ''; }
function trimPrompt(value) { return value.length <= constants_1.MAX_CONTEXT_CHARS ? value : `${value.slice(0, constants_1.MAX_CONTEXT_CHARS)}\n[已按字符上限截断]`; }
function safeChatKey(host) { try { return host.chatKey(); } catch { return ''; } }

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
            const substantive = block.sections.some((section) => !/(关键词|触发词|标签|分类)/u.test(section.name) && !section.empty && section.lines.length > 0);
            if (!substantive) {
                operations.push(noop(block.title, undefined, '', '所有业务小标题均为“无”，不创建空条目'));
                continue;
            }
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
    operations.push(...absorbedSmallSummaryOperations(blocks, entries, settings));
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
            if (/固定事实/u.test(section)) result.push(op('append-line', entry.title, entry.uid, '历史事实', undefined, `变更前：${anchoredOld}`, '固定事实发生明确变化，保留旧事实历史', score, evidence));
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
                const normalized = (0, util_1.normalizeTitle)(line);
                const entry = entries.find((item) => (0, util_1.normalizeTitle)(item.title) === normalized || (0, util_1.normalizeFact)(item.name) === (0, util_1.normalizeFact)(line));
                if (!entry || isProtected(entry, settings)) continue;
                const current = (entry.sections.values['生命周期'] ?? []).join('\n');
                if (/预退出/u.test(current)) continue;
                output.push(op('replace-section', entry.title, entry.uid, '生命周期', current, '预退出', '小总结提出预退出候选，插件只标记预退出', undefined, [{ kind: 'summary-candidate', score: 0, detail: block.title }]));
            }
        }
    }
    return output;
}
function absorbedSmallSummaryOperations(blocks, entries, settings) {
    const output = [];
    for (const block of blocks) {
        if ((0, util_1.normalizeTitle)(block.title) !== (0, util_1.normalizeTitle)('大总结｜当前')) continue;
        for (const section of block.sections) {
            if (!/已吸收小总结/u.test(section.name) || section.empty) continue;
            for (const line of section.lines) {
                const title = (0, util_1.normalizeTitle)(line);
                const entry = entries.find((item) => item.type === '小总结' && (0, util_1.normalizeTitle)(item.title) === title);
                if (!entry || isProtected(entry, settings) || entry.activation.disabled) continue;
                output.push(op('archive-entry', entry.title, entry.uid, '已吸收小总结', undefined, '归档', '大总结已明确吸收该小总结，归档旧的当前召回资格', undefined, [{ kind: 'large-summary-absorption', score: 0, detail: block.title }]));
            }
        }
    }
    return output;
}

function hasDistributionEvidence(blocks, entry) {
    const needles = [(0, util_1.normalizeFact)(entry.title), (0, util_1.normalizeFact)(entry.name), (0, util_1.normalizeFact)(entry.uid)].filter(Boolean);
    return blocks.some((block) => block.title !== entry.title && block.sections.some((section) => !/(沉降处理|条目处理|生命周期|退出处理|预退出候选)/u.test(section.name) && section.lines.some((line) => {
        const value = (0, util_1.normalizeFact)(line);
        return needles.some((needle) => needle.length >= 2 && value.includes(needle));
    })));
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
exports.summaryPrompts = summaryPrompts;
exports.keywordTemplate = keywordTemplate;
const util_1 = require("./util");
function auditPrompts(settings, playerText, assistantText) {
    const system = `你是“镜渊”的正文审核脚本。你只审核已经生成的角色正文，并在确有问题时于同一次回复中给出最小修正版。

固定输出格式：
【结论】
通过 或 需要修正
【替玩家发言】
无 或 具体问题
【替玩家作出重要选择】
无 或 具体问题
【虚构未发生事实】
无 或 具体问题
【明显逻辑冲突】
无 或 具体问题
【最小修正版正文】
通过时填写：无
需要修正时填写：完整修正版正文

要求：
1. 只依据玩家规则、玩家输入和待审核正文判断。
2. 没有问题的字段必须填写“无”，不得为了填满格式制造问题。
3. 需要修正时必须返回完整正文，不得返回局部补丁、修改建议或解释。
4. 只改明确违规处；不得扩写剧情，不得增加新动作、新对白、新心理、新结论。
5. 保留原正文风格、时间、地点、事件顺序、NPC 已发生行为、物品状态和叙事目的。
6. 不读取或操作世界书，不提取事实，不生成总结，不输出 JSON、代码块或思考过程。`;
    const user = `【玩家审核规则】\n${settings.auditPrompt || '（无）'}\n\n【玩家输入】\n${playerText || '（空）'}\n\n【待审核正文】\n${assistantText}`;
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
5. 可提取明确的事件结束、预退出或待沉降候选，但只能作为语义候选，不能命令插件删除条目。
6. 普通服装、纯修辞、瞬时表情、气氛、一次性背景细节和无后续意义的信息不记录。
7. 不得补全未发生内容，不得把计划、可能、推测、未来预测或角色不知道的信息升级为事实。
8. 可选字段没有内容时写“无”；不得用旧事实补齐。
9. 默认关键词不是白名单；必要时可使用准确的新关键词。
10. 除结果外不输出解释、前言、结语、JSON、代码块或思考过程。

默认关键词及建议小标题：
${template}${custom ? `\n\n【玩家附加提取要求】\n${custom}` : ''}`;
    const user = `【当前世界书中的直接相关条目】\n${existing || '（无）'}\n\n【玩家本轮输入】\n${playerText || '（空）'}\n\n【本轮最终可见正文】\n${assistantText}\n\n请直接填写；没有核心变化时只返回“无”。`;
    return { system, user };
}
function summaryPrompts(kind, settings, entries, subject) {
    const isSmall = kind === 'small';
    const custom = (isSmall ? settings.smallSummaryPrompt : settings.largeSummaryPrompt).trim();
    const format = isSmall
        ? `小总结｜稳定事件名称\n【关键词】\n- 小总结\n- 事件\n【当前总结】\n- 事件级必要事实\n【未解决事项】\n- 明确仍未解决的事项，若无则写“无”\n【影响对象】\n- 类型｜名称，若无则写“无”\n【预退出候选】\n- 类型｜名称，若无则写“无”`
        : `大总结｜当前\n【关键词】\n- 大总结\n【长期总结】\n- 跨场景仍必须保留的长期事实\n【已吸收小总结】\n- 小总结｜稳定事件名称，若无则写“无”`;
    const system = `你是“镜渊”的${isSmall ? '小总结脚本' : '大总结脚本'}。只使用已经写入世界书的确认事实，不直接使用未经验证的原始正文。

固定输出格式：
${format}

没有可更新内容时只返回：
无

要求：
1. ${isSmall ? '以同一事件或阶段为范围，回答“继续当前事件线必须知道什么”。' : '使用上一版大总结、尚未固化的小总结和已确认的重要长期变化，生成新的增量大总结。'}
2. ${isSmall ? '保留重要因果、直接后果、明确未解决事项以及对人物、关系、地点、物品和组织的持续影响。' : '保留长周期剧情变化、核心关系与立场、任务契约、长期冲突结果和世界状态。'}
3. ${isSmall ? '删除重复表述和无持续价值的过程描写，不复述整段正文。' : '信息颗粒度必须明显低于小总结；不得堆积所有场景细节。'}
4. 不补充未发生动机，不把推测写成事实，不自行改变基础事实。
5. 只输出总结候选内容和引用对象；不得直接决定条目 UID、删除、召回字段或 SillyTavern 原生参数。
6. ${isSmall ? '同一事件范围只允许一个当前小总结标题。' : '标题必须是“大总结｜当前”，用于替换上一版当前大总结；不得生成多个并行当前版本。'}
7. 不输出 JSON、代码块、说明或分析过程。${custom ? `\n\n【玩家附加总结要求】\n${custom}` : ''}`;
    const user = `【总结范围】\n${subject || (isSmall ? '当前事件线' : '长期叙事')}\n\n【已确认的世界书条目】\n${entries.map(entryForPrompt).join('\n\n') || '（无）'}\n\n请直接输出结果；没有变化只返回“无”。`;
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
        autoProcess: candidate.autoProcess !== false,
        auditEnabled: candidate.auditEnabled !== false,
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
    async list(settings, snapshot, validate) {
        validate?.();
        const { data, name } = await this.open(settings, false);
        if (snapshot?.worldbookName && name !== snapshot.worldbookName) throw new Error('读取到的世界书与任务快照不一致');
        validate?.();
        return parseEntries(data);
    }
    async apply(settings, plan, sourceMessageKey, contextText, focusTitle, snapshot, validate) {
        validate?.();
        this.assertChat(snapshot?.chatKey ?? '');
        const opened = await this.open(settings, true);
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
            this.applyNativeFields(parseEntries(opened.data), settings, focusTitle, new Set([...touchedUids, ...expectedAfterWrites.filter((entry) => entry.raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY]?.lastOperationId === operationId).map((entry) => entry.uid)]));
            validate?.();
            const latest = await opened.api.loadWorldInfo(opened.name);
            if (!latest || digestWorldbook(latest) !== beforeVersion) throw new Error('世界书在提交前已被其他操作修改，拒绝覆盖');
            validate?.();
            await this.save(opened);
        }
        validate?.();
        const verifiedData = await opened.api.loadWorldInfo(opened.name);
        if (!verifiedData) throw new Error('世界书写入后回读失败');
        verifyWriteResults(verifiedData, expectedAfterWrites, writeOperations, operationId, settings, focusTitle);
        opened.data = verifiedData;
        validate?.();
        if (exitOperations.length) {
            const currentEntries = parseEntries(opened.data);
            const protectedTitle = (0, util_1.normalizeTitle)(focusTitle);
            const archived = [];
            const deleted = [];
            for (const operation of exitOperations) {
                const target = currentEntries.find((entry) => entry.uid === String(operation.targetUid));
                const foundation = target?.keywords.some((keyword) => isFoundation(keyword, settings));
                if (!target || target.locked || target.focus || foundation || (0, util_1.normalizeTitle)(target.title) === protectedTitle) continue;
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
    applyNativeFields(entries, settings, focusTitle, touchedUids) {
        const normalizedFocus = (0, util_1.normalizeTitle)(focusTitle);
        for (const entry of entries) {
            const focus = Boolean(normalizedFocus && (0, util_1.normalizeTitle)(entry.title) === normalizedFocus) || entry.focus;
            if (!touchedUids.has(entry.uid) && !focus) continue;
            const definition = matchingDefinition(entry, settings);
            if (definition) {
                entry.raw.constant = definition.constant === true;
                entry.raw.vectorized = definition.vectorized !== false;
                entry.raw.preventRecursion = definition.preventRecursion === true;
                entry.raw.depth = definition.depth;
                entry.raw.order = definition.order;
            }
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
        output.push({ uid: String(raw.uid ?? mapUid), mapKey: String(mapUid), title, normalizedTitle: title.toLocaleLowerCase(), type: split.type, name: split.name, content, sections, keywords: (0, util_1.unique)([split.type, split.name, ...keywords]), aliases, references: (0, parser_1.extractReferences)(content), focus: extension.focus === true, locked: extension.locked === true || raw.locked === true, managed: extension.managed === true, updatedAt: Number(extension.updatedAt) || 0, activation: { constant: raw.constant === true, vectorized: raw.vectorized !== false, preventRecursion: raw.preventRecursion === true, depth: Math.max(0, Number(raw.depth) || 4), order: Number(raw.order) || 400, disabled: raw.disable === true }, raw });
    }
    return output.sort((left, right) => left.title.localeCompare(right.title));
}
function hydrateRaw(raw, entry, sourceMessageKey, operationId) {
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
function verifyWriteResults(data, expectedEntries, operations, operationId, settings, focusTitle) {
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
        const definition = matchingDefinition(found, settings);
        const focus = Boolean(focusTitle && (0, util_1.normalizeTitle)(found.title) === (0, util_1.normalizeTitle)(focusTitle));
        if (definition) {
            const expectedConstant = isFoundationEntry(found, settings) || focus ? true : definition.constant === true;
            const expectedVectorized = isFoundationEntry(found, settings) ? false : definition.vectorized !== false;
            if (found.activation.constant !== expectedConstant || found.activation.vectorized !== expectedVectorized || found.activation.preventRecursion !== (definition.preventRecursion === true) || found.activation.depth !== definition.depth || found.activation.order !== definition.order) throw new Error(`SillyTavern 原生字段未正确落盘：${item.title}`);
        }
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
