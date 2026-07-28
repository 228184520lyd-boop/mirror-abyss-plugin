/** Mirror Abyss 2.0.0-lite.ui.11 — scene-centered recall, five entry types, event settlement and low-coupling requests. */
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
            const active = this.activeSnapshots.get(safeChatKey(this.host));
            this.controlPanel?.setTaskProgress?.('extract', progress?.state || 'running', progress?.detail || '', { ...(progress || {}), messageIndex: progress?.messageIndex ?? active?.messageIndex ?? null });
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
            replanRecall: () => this.replanRecall(),
            updateEntry: (uid, patch) => this.updateEntry(uid, patch),
            setFocus: (uid, enabled) => this.setFocus(uid, enabled),
            setLocked: (uid, locked) => this.setLocked(uid, locked),
            migrate: () => this.migrate(),
            undoMigration: () => this.undoMigration(),
            // [MA-APP-API-01] UI 只调用 SillyTavern 官方 Connection Profile 服务，不保存密钥或自建 API 配置。
            bindProfileDropdown: (selector, selectedId, onChange) => this.host.bindProfileDropdown(selector, selectedId, onChange),
            connectionProfilesAvailable: () => this.host.connectionProfilesAvailable(),
            profileName: (profileId) => this.host.profileName(profileId),
        });
        this.cleanup = [];
        this.runningByChat = new Map();
        this.taskQueues = new Map();
        this.pendingTaskKeys = new Set();
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
        this.taskQueues.clear();
        this.pendingTaskKeys.clear();
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
        const queued = this.rejectQueuedTasks('用户已取消排队任务', key);
        if (!token && !queued) {
            this.controlPanel.setStatus('当前聊天没有正在执行或排队的任务');
            return false;
        }
        if (token) {
            token.cancelled = true;
            token.reason = '用户已取消任务';
        }
        this.controlPanel.setStatus(`已取消${token ? '当前任务' : ''}${token && queued ? '及' : ''}${queued ? `${queued}个排队任务` : ''}`);
        return true;
    }
    status() {
        const key = safeChatKey(this.host);
        const queue = this.taskQueues.get(key);
        return { audit: this.auditRunner.currentStatus(key), memory: this.memoryRunner.currentStatus(key), active: this.activeTokens.has(key), queued: queue?.items?.length ?? 0 };
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
    replanRecall() {
        return this.enqueueMaintenance('replanRecall', async (settings, snapshot) => this.worldbook.replanRecall(settings, snapshot, () => this.host.assertSnapshot(snapshot, this.settings())));
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
        if (!this.started) return;
        if (!Number.isInteger(index)) {
            try { index = this.host.latestTurn().messageIndex; }
            catch { return; }
        }
        if (!this.host.isAssistantIndex(index)) return;
        const settings = this.settings();
        if (!settings.enabled) return;
        const autoAudit = settings.autoAudit === true && settings.auditEnabled !== false;
        const autoExtraction = settings.autoExtraction === true && settings.extractionEnabled !== false;
        if (!autoAudit && !autoExtraction) return;
        const automaticTaskType = autoAudit && autoExtraction ? 'full' : autoAudit ? 'audit' : 'extraction';
        const chatKey = this.host.chatKey();
        try {
            const turn = this.host.latestTurn(index);
            const active = this.activeSnapshots.get(chatKey);
            if (active && (active.messageKey !== turn.messageKey || active.contentHash !== turn.contentHash)) {
                const token = this.activeTokens.get(chatKey);
                if (token) {
                    token.cancelled = true;
                    token.reason = '检测到更新的 AI 正文，旧任务已取消';
                }
            }
            void this.enqueueTask(automaticTaskType, turn.messageIndex, true).catch((error) => {
                const message = (0, util_1.errorText)(error);
                if (!/同一任务已经在执行或等待/u.test(message)) console.error('[MirrorAbyss] automatic core flow failed', error);
            });
        }
        catch (error) { console.error('[MirrorAbyss] automatic task enqueue failed', error); }
    }
    onScopeChanged(eventName, eventValue) {
        if (this.host.consumeInternalScopeEvent(eventName, eventValue))
            return;
        this.cancelAll(`SillyTavern 事件 ${eventName} 使旧任务失效`);
        try { this.host.bumpScopeRevision(this.host.chatKey()); } catch { }
        this.controlPanel.resetTaskStates?.('聊天或正文范围已变化');
        this.controlPanel.setStatus('聊天或正文范围已变化，旧任务已取消');
    }
    enqueueTask(taskType, index, automatic) {
        const maintenance = taskType === 'migration' || taskType === 'undoMigration';
        const chatKey = this.host.chatKey();
        const turn = maintenance
            ? { messageIndex: -1, messageKey: `maintenance:${taskType}`, contentHash: '' }
            : this.host.latestTurn(index);
        const taskKey = `${chatKey}|${taskType}|${turn.messageKey}|${turn.contentHash}`;
        if (this.pendingTaskKeys.has(taskKey)) return Promise.reject(new Error('同一任务已经在执行或等待，不重复排队'));
        let resolveTask;
        let rejectTask;
        const promise = new Promise((resolve, reject) => { resolveTask = resolve; rejectTask = reject; });
        const queue = this.taskQueues.get(chatKey) ?? { running: false, items: [] };
        const item = { taskType, index: turn.messageIndex, automatic: Boolean(automatic), maintenance, taskKey, promise, resolve: resolveTask, reject: rejectTask, queuedAt: Date.now() };
        queue.items.push(item);
        this.taskQueues.set(chatKey, queue);
        this.pendingTaskKeys.add(taskKey);
        if (automatic) this.compactAutomaticQueue(chatKey, queue, this.settings(), turn);
        const position = queue.items.length + (queue.running ? 1 : 0);
        const queuedDetail = `${automatic ? '自动' : ''}${taskType === 'audit' ? '审核' : taskType === 'extraction' ? '提取' : taskType === 'full' ? '审核与提取' : '任务'}已进入异步队列（第${position}项）`;
        if (taskType === 'audit' || taskType === 'full') this.controlPanel.setTaskProgress?.('audit', 'queued', queuedDetail, { messageIndex: turn.messageIndex, queuePosition: position });
        if (taskType === 'extraction' || taskType === 'full') this.controlPanel.setTaskProgress?.('extract', 'queued', queuedDetail, { messageIndex: turn.messageIndex, queuePosition: position });
        this.controlPanel.setStatus(queuedDetail);
        globalThis.setTimeout(() => { void this.drainTaskQueue(chatKey); }, 0);
        return promise;
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
            if (taskType === 'audit' || taskType === 'full') this.controlPanel.setTaskProgress?.('audit', 'running', automatic ? '自动审核处理中' : '审核处理中', { messageIndex: snapshot.messageIndex });
            if (taskType === 'extraction' || taskType === 'full') this.controlPanel.setTaskProgress?.('extract', 'running', automatic ? '等待审核后自动提取' : '提取、解析与语义合并处理中', { messageIndex: snapshot.messageIndex });
            this.controlPanel.setStatus(taskType === 'audit' ? '审核处理中…' : taskType === 'extraction' ? '提取、解析与语义合并处理中…' : taskType === 'full' ? '自动处理中…' : '任务处理中…');
            let activeSnapshot = snapshot;
            let result;
            if (taskType === 'audit') {
                if (automatic && settings.autoAudit !== true) {
                    this.controlPanel.setTaskProgress?.('audit', 'disabled', '自动审核已关闭，已跳过');
                    return [];
                }
                activeSnapshot = await this.auditRunner.process(settings, activeSnapshot);
                result = activeSnapshot;
            }
            else if (taskType === 'extraction') {
                if (automatic && settings.autoExtraction !== true) {
                    this.controlPanel.setTaskProgress?.('extract', 'disabled', '自动提取已关闭，已跳过');
                    return [];
                }
                result = await this.memoryRunner.runTask('extraction', settings, activeSnapshot);
            }
            else if (taskType === 'smallSummary') result = await this.memoryRunner.runTask('smallSummary', settings, activeSnapshot);
            else if (taskType === 'largeSummary') result = await this.memoryRunner.runTask('largeSummary', settings, activeSnapshot);
            else if (taskType === 'migration') result = await this.migrationService.migrate(settings, activeSnapshot);
            else if (taskType === 'undoMigration') result = await this.migrationService.undo(settings, activeSnapshot);
            else {
                const shouldAudit = settings.auditEnabled !== false && settings.auditPrompt.trim() && (!automatic || settings.autoAudit === true);
                const shouldExtract = settings.extractionEnabled !== false && (!automatic || settings.autoExtraction === true);
                if (shouldAudit) {
                    activeSnapshot = await this.auditRunner.process(settings, activeSnapshot);
                    this.controlPanel.setTaskProgress?.('audit', 'success', activeSnapshot.auditDetail || (activeSnapshot.auditReplaced ? '自动审核完成，正文已替换' : '自动审核通过，正文未修改'));
                } else {
                    this.controlPanel.setTaskProgress?.('audit', 'disabled', automatic ? '自动审核已关闭，完全跳过' : '审核功能已关闭');
                }
                this.host.assertSnapshot(activeSnapshot, this.settings());
                result = shouldExtract ? await this.memoryRunner.runTask('extraction', settings, activeSnapshot) : [];
            }
            this.host.assertSnapshot(activeSnapshot, this.settings());
            if (taskType === 'audit') {
                const detail = activeSnapshot.auditDetail || (activeSnapshot.auditReplaced ? '审核未通过，正文已替换' : '审核通过，正文未修改');
                this.controlPanel.setTaskProgress?.('audit', 'success', detail);
                this.controlPanel.setStatus(detail);
            }
            else if (taskType === 'extraction') this.controlPanel.setStatus('提取、总结调度与世界书合并完成');
            else if (taskType === 'smallSummary') this.controlPanel.setStatus('小总结、分发与召回重排完成');
            else if (taskType === 'largeSummary') this.controlPanel.setStatus('大总结、沉降分发与召回重排完成');
            else this.controlPanel.setStatus(`${activeSnapshot.auditDetail || '自动审核已跳过'}；${settings.autoExtraction === true ? '自动提取完成' : '自动提取已关闭'}`);
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
        });
    }
    compactAutomaticQueue(chatKey, queue, settings, latestTurn) {
        const candidates = queue.items.filter((item) => item.automatic && ['full', 'extraction'].includes(item.taskType));
        const threshold = Math.max(2, Number(settings.queueCompactThreshold || settings.smallSummaryTurns || 6));
        if (candidates.length < threshold) return;
        let collapsed = 0;
        for (const item of [...candidates]) {
            if (item.taskType === 'full' && settings.autoAudit === true && settings.auditEnabled !== false) {
                item.taskType = 'audit';
                collapsed += 1;
                continue;
            }
            const index = queue.items.indexOf(item);
            if (index >= 0) queue.items.splice(index, 1);
            this.pendingTaskKeys.delete(item.taskKey);
            item.resolve({ superseded: true, reason: '队列积压，逐轮提取已由总结压缩替代' });
            collapsed += 1;
        }
        const cursor = this.host.cursor();
        const pendingSmall = queue.items.filter((item) => item.taskType === 'smallSummary').length;
        const summaryType = settings.autoLargeSummary !== false && Number(cursor.smallCountSinceLarge || 0) + pendingSmall >= Number(settings.largeSummaryCount || 5)
            ? 'largeSummary'
            : 'smallSummary';
        const summaryKey = `${chatKey}|${summaryType}|${latestTurn.messageKey}|compact`;
        if (!this.pendingTaskKeys.has(summaryKey) && !queue.items.some((item) => item.taskType === summaryType)) {
            let resolveTask;
            let rejectTask;
            const promise = new Promise((resolve, reject) => { resolveTask = resolve; rejectTask = reject; });
            queue.items.push({ taskType: summaryType, index: latestTurn.messageIndex, automatic: true, maintenance: false, taskKey: summaryKey, promise, resolve: resolveTask, reject: rejectTask, queuedAt: Date.now(), compacted: true });
            this.pendingTaskKeys.add(summaryKey);
            promise.catch((error) => console.warn('[MirrorAbyss] compacted summary failed', error));
        }
        const label = summaryType === 'largeSummary' ? '大总结' : '小总结';
        this.controlPanel.setTaskProgress?.('extract', 'queued', `队列积压${candidates.length}项，已压缩逐轮提取并改为${label}`, { messageIndex: latestTurn.messageIndex, compacted: collapsed });
        this.controlPanel.setStatus(`异步队列已压缩：保留审核，逐轮提取改为${label}`);
    }
    async drainTaskQueue(chatKey) {
        const queue = this.taskQueues.get(chatKey);
        if (!queue || queue.running) return;
        queue.running = true;
        try {
            while (this.started && queue.items.length) {
                const item = queue.items.shift();
                const token = { cancelled: false, reason: '' };
                let snapshot = null;
                try {
                    if (this.host.chatKey() !== chatKey) throw new Error('聊天已经切换，排队任务取消');
                    const settings = this.settings();
                    snapshot = item.maintenance
                        ? this.host.captureMaintenanceSnapshot(settings, item.taskType, token)
                        : this.host.captureSnapshot(settings, item.index, item.taskType, token);
                    this.activeTokens.set(chatKey, token);
                    this.activeSnapshots.set(chatKey, snapshot);
                    this.runningByChat.set(chatKey, item.promise);
                    const result = await this.runTask(item.taskType, snapshot, item.automatic, settings);
                    item.resolve(result);
                }
                catch (error) {
                    item.reject(error);
                }
                finally {
                    this.pendingTaskKeys.delete(item.taskKey);
                    if (this.activeTokens.get(chatKey) === token) this.activeTokens.delete(chatKey);
                    if (snapshot && this.activeSnapshots.get(chatKey) === snapshot) this.activeSnapshots.delete(chatKey);
                    if (this.runningByChat.get(chatKey) === item.promise) this.runningByChat.delete(chatKey);
                }
            }
        }
        finally {
            queue.running = false;
            if (!queue.items.length) this.taskQueues.delete(chatKey);
            else globalThis.setTimeout(() => { void this.drainTaskQueue(chatKey); }, 0);
        }
    }
    rejectQueuedTasks(reason, onlyChatKey = '') {
        let count = 0;
        for (const [chatKey, queue] of this.taskQueues.entries()) {
            if (onlyChatKey && chatKey !== onlyChatKey) continue;
            for (const item of queue.items.splice(0)) {
                this.pendingTaskKeys.delete(item.taskKey);
                item.reject(new Error(reason));
                count += 1;
            }
            if (!queue.running) this.taskQueues.delete(chatKey);
        }
        return count;
    }
    cancelAll(reason) {
        for (const token of this.activeTokens.values()) {
            token.cancelled = true;
            token.reason = reason;
        }
        this.rejectQueuedTasks(reason);
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
},"audit":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditRunner = void 0;
exports.parseAuditResult = parseAuditResult;
const prompts_1 = require("./prompts");
const parser_1 = require("./parser");
const revision_1 = require("./revision");
const model_request_1 = require("./model-request");
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

    /**
     * [MA-AUDIT-01] 审核只负责“判定”。FAIL 时交给 RevisionService 生成完整正文，
     * 最后由 HostAdapter 原子式替换并保存。审核模块不接触 DOM 和世界书。
     */
    async process(settings, snapshot) {
        if (!settings.auditEnabled || !settings.auditPrompt.trim()) {
            this.setStatus(snapshot.chatKey, 'complete', '审核未启用');
            return snapshot;
        }
        try {
            this.host.assertSnapshot(snapshot, this.getSettings());
            this.setStatus(snapshot.chatKey, 'audit', '审核正文');
            const prompt = (0, prompts_1.auditPrompts)(settings, snapshot.playerText, snapshot.assistantText, snapshot.characterCard);
            const raw = await (0, model_request_1.callModel)({
                host: this.host,
                stage: 'audit',
                prompt,
                fallbackPrompt: () => (0, prompts_1.auditPrompts)(settings, snapshot.playerText, snapshot.assistantText, snapshot.characterCard, { compact: true }),
                settings,
                snapshot,
                profileId: settings.auditProfileId,
                sourceText: snapshot.assistantText,
                onRetry: () => this.setStatus(snapshot.chatKey, 'audit', '审核网关异常，已缩短上下文并重试一次'),
            });
            this.host.assertSnapshot(snapshot, this.getSettings());
            const result = parseAuditResult(raw);
            let finalSnapshot = snapshot;
            if (result.decision === 'revision') {
                this.setStatus(snapshot.chatKey, 'revision', '审核不通过，生成一次完整修正版');
                const revisedText = await this.revisionService.revise(settings, snapshot, result.issues);
                finalSnapshot = await this.host.replaceAssistantText(snapshot, revisedText, this.getSettings());
                this.setStatus(snapshot.chatKey, 'revision', '完整修正版正文已替换并保存');
            }
            const auditReplaced = result.decision === 'revision';
            const auditDetail = auditReplaced ? '审核未通过，正文已替换并保存' : '审核通过，正文未修改';
            this.setStatus(snapshot.chatKey, 'complete', auditDetail);
            return { ...finalSnapshot, auditDecision: result.decision, auditReplaced, auditDetail };
        }
        catch (error) {
            this.setStatus(snapshot.chatKey, 'error', '审核停止', (0, util_1.errorText)(error));
            throw error;
        }
    }
    setStatus(chatKey, phase, detail, error = '') {
        this.statusByChat.set(chatKey, { phase, detail, error });
    }
}
exports.AuditRunner = AuditRunner;

/** [MA-AUDIT-02] 审核结果协议：PASS 只能单独出现；FAIL 必须附具体问题。 */
function parseAuditResult(raw) {
    const text = (0, parser_1.sanitizeModelText)(raw);
    if (/^(?:PASS|通过)[。.]?$/iu.test(text)) return { decision: 'pass', issues: [] };
    if (/【\s*(?:最小修正版正文|修正版正文|完整正文|正文)\s*】/u.test(text))
        throw new Error('审核模型越权返回了修正版正文');
    const rawConclusion = text.match(/^\s*(PASS|FAIL|通过|需要修正)\s*[。.]?\s*(?:\n|$)/iu)?.[1] || '';
    const conclusion = /^(?:PASS|通过)$/iu.test(rawConclusion) ? 'PASS' : /^(?:FAIL|需要修正)$/iu.test(rawConclusion) ? 'FAIL' : '';
    if (conclusion === 'PASS') throw new Error('审核结论为 PASS 时必须只返回 PASS');
    if (conclusion !== 'FAIL') throw new Error('审核返回缺少明确的 PASS 或 FAIL 结论');
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
function nonEmptyLines(lines = []) { return lines.map((line) => (0, parser_1.stripListMarker)(line).trim()).filter(Boolean); }
function isNone(value) { return /^\s*(?:无|没有|无问题)\s*[。.]?\s*$/u.test(String(value ?? '')); }
function safeChatKey(host) { try { return host.chatKey(); } catch { return ''; } }
},"constants":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGED_VERSION = exports.MAX_CONTEXT_CHARS = exports.WORLD_INFO_EXTENSION_KEY = exports.EXTENSION_NAMESPACE = exports.DISPLAY_NAME = exports.VERSION = void 0;
exports.VERSION = '2.0.0-lite.ui.11';
exports.DISPLAY_NAME = 'Mirror Abyss｜镜渊';
exports.EXTENSION_NAMESPACE = 'mirrorAbyssLite';
exports.WORLD_INFO_EXTENSION_KEY = 'mirrorAbyssInfoPoint';
exports.MAX_CONTEXT_CHARS = 48000;
exports.MANAGED_VERSION = 11;
},"control-panel":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlPanel = void 0;
exports.buildRecallViewModel = buildRecallViewModel;
exports.buildUnifiedProfilePatch = buildUnifiedProfilePatch;
const util_1 = require("./util");
const ROOT_ID = 'mirror-abyss-core-control';
const PANEL_ID = 'mirror-abyss-lite-panel';
const SETTINGS_ID = 'mirror-abyss-lite-settings-entry';
const STYLE_ID = 'mirror-abyss-lite-style';
const INDICATOR_CLASS = 'mirror-abyss-message-indicator';
const PROFILE_SELECT_ID = 'mirror-abyss-lite-profile-select';
class ControlPanel {
    constructor(actions) {
        this.actions = actions;
        this.root = null;
        this.launcher = null;
        this.panel = null;
        this.statusNode = null;
        this.recallNode = null;
        this.recallStatusNode = null;
        this.recallRefreshButton = null;
        this.recallReplanButton = null;
        this.recallLoadSerial = 0;
        this.apiProfileSelect = null;
        this.apiProfileStatusNode = null;
        this.profileDropdownBound = false;
        this.settingsEntry = null;
        this.inputs = {};
        this.buttons = {};
        this.pendingActions = new Set();
        this.lastOutcome = null;
        this.taskStates = {
            audit: { state: 'idle', detail: '待命', titles: [], created: [], updated: [], skipped: [], merged: [], repaired: 0, messageIndex: null, queuePosition: 0 },
            extract: { state: 'idle', detail: '待命', titles: [], created: [], updated: [], skipped: [], merged: [], repaired: 0, messageIndex: null, queuePosition: 0 },
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
        document.getElementById('mirror-abyss-loader-control')?.remove();
        document.getElementById('mirror-abyss-startup-control')?.remove();
        document.getElementById(ROOT_ID)?.remove();
        this.installStyle();
        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'ma-lite-floating-entry';
        const launcher = document.createElement('button');
        launcher.type = 'button';
        launcher.className = 'ma-lite-launcher';
        launcher.setAttribute('aria-label', '打开镜渊面板');
        launcher.setAttribute('aria-expanded', 'false');
        launcher.title = 'Mirror Abyss｜审核与提取';
        launcher.innerHTML = '<i class="fa-solid fa-circle-nodes" aria-hidden="true"></i><span>镜渊</span>';
        launcher.addEventListener('pointerdown', (event) => event.stopPropagation());
        launcher.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); this.togglePanel(); });
        root.append(launcher);
        document.body.append(root);
        const panel = this.buildPanel();
        document.body.append(panel);
        this.root = root;
        this.launcher = launcher;
        this.panel = panel;
        this.bindApiProfileSelector();
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
        this.recallNode = null;
        this.recallStatusNode = null;
        this.recallRefreshButton = null;
        this.recallReplanButton = null;
        this.recallLoadSerial += 1;
        this.apiProfileSelect = null;
        this.apiProfileStatusNode = null;
        this.profileDropdownBound = false;
        this.settingsEntry = null;
        this.inputs = {};
        this.buttons = {};
        this.pendingActions = new Set();
    }
    installStyle() {
        document.getElementById(STYLE_ID)?.remove();
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#${ROOT_ID}.ma-lite-floating-entry{position:fixed;right:max(10px,env(safe-area-inset-right));top:50dvh;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;z-index:2147483638;pointer-events:auto!important}
.ma-lite-launcher{box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.28));border-radius:50%;background:color-mix(in srgb,var(--SmartThemeBlurTintColor,#17171c) 92%,transparent);color:var(--SmartThemeBodyColor,#fff);box-shadow:0 6px 20px rgba(0,0,0,.46);backdrop-filter:blur(10px);font-size:17px;cursor:pointer;touch-action:manipulation;pointer-events:auto!important;-webkit-tap-highlight-color:transparent}
.ma-lite-launcher:hover,.ma-lite-launcher:focus-visible{transform:scale(1.06)}
.ma-lite-launcher span{display:none}
#${PANEL_ID}{position:fixed;top:max(58px,calc(48px + env(safe-area-inset-top)));right:max(10px,env(safe-area-inset-right));z-index:2147483639;box-sizing:border-box;width:min(360px,calc(100vw - 20px));max-height:calc(100dvh - 78px);overflow:auto;padding:0;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.2));border-radius:12px;background:color-mix(in srgb,var(--SmartThemeBlurTintColor,#17171c) 94%,transparent);color:var(--SmartThemeBodyColor,#fff);box-shadow:0 12px 34px rgba(0,0,0,.48);backdrop-filter:blur(12px);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
#${PANEL_ID}[hidden]{display:none!important}
.ma-lite-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:12px;border-bottom:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));background:inherit}
.ma-lite-title{min-width:0;flex:1}.ma-lite-title strong{display:block;font-size:15px}.ma-lite-title small{display:block;margin-top:2px;opacity:.62;font-size:11px}
.ma-lite-close{min-width:34px;min-height:34px;border:0;border-radius:8px;background:var(--black30a,rgba(255,255,255,.08));color:inherit;cursor:pointer}
.ma-lite-body{display:flex;flex-direction:column;gap:12px;padding:12px}
.ma-lite-api{display:flex;flex-direction:column;gap:7px;padding:10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:9px;background:var(--black30a,rgba(255,255,255,.04))}.ma-lite-api-head{display:flex;align-items:center;gap:7px;font-size:13px}.ma-lite-api-head i{opacity:.72}.ma-lite-api-select{box-sizing:border-box;width:100%;min-height:38px;padding:6px 9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.18));border-radius:7px;background:rgba(0,0,0,.22);color:inherit}.ma-lite-api-status{font-size:11px;line-height:1.4;opacity:.72}.ma-lite-api-help{font-size:10px;line-height:1.4;opacity:.52}
.ma-lite-switches{display:grid;grid-template-columns:1fr;gap:8px}
.ma-lite-switch{display:flex;align-items:center;gap:9px;padding:9px 10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.04));cursor:pointer}
.ma-lite-switch input{width:18px;height:18px;margin:0;flex:0 0 auto}.ma-lite-switch-text{min-width:0;flex:1}.ma-lite-switch-text b{display:block;font-size:13px}.ma-lite-switch-text small{display:block;margin-top:2px;opacity:.58;font-size:11px;line-height:1.35}
.ma-lite-thresholds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.ma-lite-number{display:flex;flex-direction:column;gap:4px;padding:7px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:8px;font-size:10px}.ma-lite-number input{box-sizing:border-box;width:100%;min-height:30px;padding:4px 6px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.16));border-radius:6px;background:rgba(0,0,0,.2);color:inherit}.ma-lite-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}.ma-lite-action{min-height:46px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.16));border-radius:9px;background:var(--black50a,rgba(255,255,255,.08));color:inherit;font-weight:700;cursor:pointer;touch-action:manipulation;pointer-events:auto!important;-webkit-tap-highlight-color:transparent}.ma-lite-action:disabled{opacity:.42;cursor:not-allowed}.ma-lite-action[data-kind="audit"]{border-color:rgba(112,181,255,.5)}.ma-lite-action[data-kind="extract"]{border-color:rgba(111,214,164,.5)}
.ma-lite-status{min-height:38px;padding:9px 10px;border-radius:8px;background:rgba(0,0,0,.18);font-size:12px;line-height:1.45;overflow-wrap:anywhere}.ma-lite-status[data-error="true"]{color:#ffb4b4}.ma-lite-note{font-size:11px;line-height:1.5;opacity:.58}
.ma-lite-recall{display:flex;flex-direction:column;gap:8px;padding:9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.035))}.ma-lite-recall-head{display:flex;align-items:center;gap:8px}.ma-lite-recall-head strong{min-width:0;flex:1;font-size:13px}.ma-lite-recall-refresh,.ma-lite-recall-replan{min-width:32px;min-height:30px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:7px;background:rgba(0,0,0,.16);color:inherit;cursor:pointer}.ma-lite-recall-status{font-size:10px;line-height:1.35;opacity:.62}.ma-lite-recall-summary{display:flex;flex-wrap:wrap;gap:5px}.ma-lite-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 6px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.13));border-radius:999px;background:rgba(0,0,0,.14);font-size:10px;white-space:nowrap}.ma-lite-recall-list{display:flex;flex-direction:column;gap:6px}.ma-lite-recall-row{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;padding:7px 8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.1));border-radius:8px;background:rgba(0,0,0,.11)}.ma-lite-recall-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:700}.ma-lite-recall-meta{display:flex;flex-wrap:wrap;gap:4px}.ma-lite-badge{display:inline-flex;padding:2px 5px;border-radius:5px;background:rgba(255,255,255,.07);font-size:9px;line-height:1.3}.ma-lite-badge[data-kind="constant"]{background:rgba(255,195,74,.16)}.ma-lite-badge[data-kind="vector"]{background:rgba(112,181,255,.15)}.ma-lite-badge[data-kind="bridge"]{background:rgba(196,123,255,.16)}.ma-lite-badge[data-kind="terminal"]{background:rgba(111,214,164,.14)}.ma-lite-badge[data-kind="isolated"]{background:rgba(160,160,170,.14)}.ma-lite-badge[data-kind="active"]{background:rgba(92,205,139,.17)}.ma-lite-badge[data-kind="closed"]{background:rgba(170,170,180,.16)}.ma-lite-badge[data-kind="history"]{background:rgba(116,150,210,.14)}.ma-lite-badge[data-kind="scene"]{background:rgba(255,160,100,.14)}.ma-lite-recall-empty{padding:8px;text-align:center;font-size:10px;opacity:.56}
.${INDICATOR_CLASS}{display:flex;flex-wrap:wrap;align-items:center;gap:6px 9px;width:max-content;max-width:100%;margin-top:7px;padding:5px 8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.13));border-radius:999px;background:var(--black30a,rgba(0,0,0,.18));font-size:10px;line-height:1.2;color:var(--SmartThemeBodyColor,#fff);opacity:.78;user-select:none}
.${INDICATOR_CLASS} .ma-ind-label{font-weight:700}.ma-ind-part{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}.ma-ind-detail{flex-basis:100%;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.72}.ma-ind-dot{width:7px;height:7px;border-radius:50%;background:#777;box-shadow:0 0 0 1px rgba(255,255,255,.14)}.ma-ind-dot[data-state="ready"],.ma-ind-dot[data-state="success"]{background:#5ed18a}.ma-ind-dot[data-state="queued"]{background:#68a7ff}.ma-ind-dot[data-state="running"]{background:#f0bc57;animation:ma-lite-pulse 1s infinite}.ma-ind-dot[data-state="error"]{background:#ff6868}.ma-ind-dot[data-state="disabled"]{background:#6c6c72}@keyframes ma-lite-pulse{50%{opacity:.35}}
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
        title.innerHTML = '<strong>Mirror Abyss｜镜渊</strong><small>审核、提取、总结调度与召回状态映射</small>';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'ma-lite-close';
        close.title = '收起';
        close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        close.addEventListener('click', () => this.closePanel());
        header.append(title, close);
        const body = document.createElement('div');
        body.className = 'ma-lite-body';
        const apiSection = this.buildApiSection();
        const switches = document.createElement('div');
        switches.className = 'ma-lite-switches';
        switches.append(
            this.makeSwitch('enabled', '总开关', '关闭后两个功能都不能执行。'),
            this.makeSwitch('autoAudit', '自动审核', 'AI 正文生成完成后自动审核；不通过时自动替换正文。'),
            this.makeSwitch('autoExtraction', '自动提取', 'AI 正文生成完成后，在审核完成或被跳过后提取最终正文。'),
            this.makeSwitch('autoSmallSummary', '自动小总结', '达到轮数或异步队列积压时，压缩近期正文并分发事实。'),
            this.makeSwitch('autoLargeSummary', '自动大总结', '累计小总结后沉降为长期历史并重新调度条目。'),
            this.makeSwitch('auditEnabled', '审核功能', '控制手动与自动审核是否可用。'),
            this.makeSwitch('extractionEnabled', '提取功能', '控制手动与自动提取是否可用。'),
        );
        const thresholds = document.createElement('div');
        thresholds.className = 'ma-lite-thresholds';
        thresholds.append(
            this.makeNumberInput('smallSummaryTurns', '小总结轮数', 1, 100),
            this.makeNumberInput('criticalChangesForSmall', '关键变化阈值', 1, 50),
            this.makeNumberInput('largeSummaryCount', '大总结计数', 1, 30),
            this.makeNumberInput('queueCompactThreshold', '队列压缩阈值', 2, 50),
        );
        const recall = this.buildRecallSection();
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
        note.textContent = '提取异常会先本地修复、合并重复条目并部分提交；仍无法解析时只修复一次异常输出。自动流程严格按“审核→正文替换落地→提取→总结”执行。';
        body.append(apiSection, switches, thresholds, recall, actions, status, note);
        panel.append(header, body);
        return panel;
    }
    /** [MA-UI-API-01] 只创建一个轻量下拉框；选项由 SillyTavern 官方服务负责填充。 */
    buildApiSection() {
        const section = document.createElement('section');
        section.className = 'ma-lite-api';
        const head = document.createElement('div');
        head.className = 'ma-lite-api-head';
        head.innerHTML = '<i class="fa-solid fa-plug" aria-hidden="true"></i><strong>镜渊处理 API</strong>';
        const select = document.createElement('select');
        select.id = PROFILE_SELECT_ID;
        select.className = 'ma-lite-api-select';
        select.setAttribute('aria-label', '选择镜渊审核、提取和总结使用的连接配置');
        const loading = document.createElement('option');
        loading.value = '';
        loading.textContent = '正在读取 SillyTavern Connection Profiles…';
        select.append(loading);
        const status = document.createElement('div');
        status.className = 'ma-lite-api-status';
        status.textContent = '默认跟随当前 SillyTavern 连接。';
        const help = document.createElement('div');
        help.className = 'ma-lite-api-help';
        help.textContent = '连接、模型、地址和密钥仍在 SillyTavern「API Connections → Connection Profiles」中管理；镜渊不保存密钥。';
        section.append(head, select, status, help);
        this.apiProfileSelect = select;
        this.apiProfileStatusNode = status;
        return section;
    }
    /**
     * [MA-UI-API-02] 绑定官方 Connection Profile 下拉框。
     * 选中一个 Profile 时，同一 Profile 统一用于审核、修正、提取和两级总结，避免增加多套 API UI。
     */
    bindApiProfileSelector() {
        const select = this.apiProfileSelect;
        if (!select || this.profileDropdownBound) return;
        const settings = this.getSettings();
        const selectedId = settings.modelSource === 'profile' ? String(settings.modelProfileId || '') : '';
        if (this.actions.connectionProfilesAvailable?.() === false) {
            select.replaceChildren(new Option('当前 SillyTavern 连接', ''));
            select.disabled = true;
            if (this.apiProfileStatusNode) this.apiProfileStatusNode.textContent = 'Connection Profiles 已禁用或不可用，镜渊继续使用当前连接。';
            return;
        }
        try {
            const bound = this.actions.bindProfileDropdown?.(`#${PROFILE_SELECT_ID}`, selectedId, (profile) => {
                const profileId = String(profile?.id || '');
                this.actions.configure?.(buildUnifiedProfilePatch(profileId));
                this.lastOutcome = null;
                this.updateApiProfileStatus(profileId, profile?.name || '');
                this.setStatus(profileId ? `镜渊处理 API 已切换为：${profile?.name || profileId}` : '镜渊处理 API 已改为当前 SillyTavern 连接');
            });
            if (!bound) throw new Error('官方 Connection Profile 下拉服务不可用');
            this.profileDropdownBound = true;
            const defaultOption = select.querySelector('option[value=""]');
            if (defaultOption) defaultOption.textContent = '当前 SillyTavern 连接';
            select.value = selectedId;
            this.updateApiProfileStatus(selectedId);
        }
        catch (error) {
            select.replaceChildren(new Option('当前 SillyTavern 连接', ''));
            select.disabled = true;
            if (this.apiProfileStatusNode) this.apiProfileStatusNode.textContent = `无法读取 Connection Profiles：${(0, util_1.errorText)(error)}`;
        }
    }
    updateApiProfileStatus(profileId, knownName = '') {
        if (!this.apiProfileStatusNode) return;
        if (!profileId) {
            this.apiProfileStatusNode.textContent = '当前：跟随 SillyTavern 主连接；不会改变聊天正文使用的 API。';
            return;
        }
        let name = knownName;
        try { name ||= this.actions.profileName?.(profileId) || profileId; }
        catch { name ||= profileId; }
        this.apiProfileStatusNode.textContent = `当前：${name}；仅用于镜渊审核、修正、提取和总结，不切换主聊天 API。`;
    }
    buildRecallSection() {
        const section = document.createElement('section');
        section.className = 'ma-lite-recall';
        const head = document.createElement('div');
        head.className = 'ma-lite-recall-head';
        const title = document.createElement('strong');
        title.textContent = '世界书语义与召回状态';
        const replan = document.createElement('button');
        replan.type = 'button';
        replan.className = 'ma-lite-recall-replan';
        replan.title = '按场景中心规则重新规划镜渊管理条目';
        replan.setAttribute('aria-label', '重新规划世界书召回状态');
        replan.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>';
        replan.addEventListener('click', () => void this.replanRecallMap());
        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.className = 'ma-lite-recall-refresh';
        refresh.title = '刷新召回状态';
        refresh.setAttribute('aria-label', '刷新世界书召回状态');
        refresh.innerHTML = '<i class="fa-solid fa-rotate" aria-hidden="true"></i>';
        refresh.addEventListener('click', () => void this.refreshRecallMap(true));
        head.append(title, replan, refresh);
        const status = document.createElement('div');
        status.className = 'ma-lite-recall-status';
        status.textContent = '读取场景阶段与原生召回字段；“重新规划”只修改镜渊管理条目的召回设置，不改正文。';
        const content = document.createElement('div');
        content.className = 'ma-lite-recall-empty';
        content.textContent = '尚未读取';
        section.append(head, status, content);
        this.recallNode = content;
        this.recallStatusNode = status;
        this.recallRefreshButton = refresh;
        this.recallReplanButton = replan;
        return section;
    }
    async replanRecallMap() {
        if (typeof this.actions.replanRecall !== 'function') {
            this.setStatus('重新规划功能未连接', true);
            return;
        }
        if (this.recallReplanButton) this.recallReplanButton.disabled = true;
        if (this.recallRefreshButton) this.recallRefreshButton.disabled = true;
        if (this.recallReplanButton) this.recallReplanButton.disabled = true;
        if (this.recallStatusNode) this.recallStatusNode.textContent = '正在按场景中心规则重新规划召回字段…';
        try {
            await this.actions.replanRecall();
            this.setStatus('召回状态已重新规划');
            await this.refreshRecallMap(true);
        }
        catch (error) {
            const text = (0, util_1.errorText)(error);
            this.setStatus(`重新规划失败：${text}`, true);
            if (this.recallStatusNode) this.recallStatusNode.textContent = `重新规划失败：${text}`;
        }
        finally {
            if (this.recallReplanButton) this.recallReplanButton.disabled = false;
            if (this.recallRefreshButton) this.recallRefreshButton.disabled = false;
        }
    }
    async refreshRecallMap(force = false) {
        if (!this.recallNode || typeof this.actions.loadWorkspace !== 'function') return;
        if (!force && this.panel?.hidden) return;
        const serial = ++this.recallLoadSerial;
        if (this.recallRefreshButton) this.recallRefreshButton.disabled = true;
        if (this.recallReplanButton) this.recallReplanButton.disabled = true;
        if (this.recallStatusNode) this.recallStatusNode.textContent = '正在读取当前世界书…';
        try {
            const workspace = await this.actions.loadWorkspace();
            if (serial !== this.recallLoadSerial || !this.recallNode) return;
            const model = buildRecallViewModel(workspace?.entries ?? []);
            this.renderRecallMap(model, workspace?.worldbookName || '');
        }
        catch (error) {
            if (serial !== this.recallLoadSerial || !this.recallNode) return;
            this.recallNode.className = 'ma-lite-recall-empty';
            this.recallNode.textContent = `读取失败：${(0, util_1.errorText)(error)}`;
            if (this.recallStatusNode) this.recallStatusNode.textContent = '未修改任何世界书字段。';
        }
        finally {
            if (serial === this.recallLoadSerial && this.recallRefreshButton) this.recallRefreshButton.disabled = false;
            if (serial === this.recallLoadSerial && this.recallReplanButton) this.recallReplanButton.disabled = false;
        }
    }
    renderRecallMap(model, worldbookName) {
        if (!this.recallNode) return;
        this.recallNode.className = '';
        this.recallNode.replaceChildren();
        if (this.recallStatusNode) this.recallStatusNode.textContent = `${worldbookName ? `世界书：${worldbookName}；` : ''}仅显示镜渊管理条目，共 ${model.total} 条。`;
        if (!model.total) {
            this.recallNode.className = 'ma-lite-recall-empty';
            this.recallNode.textContent = '当前世界书没有镜渊管理条目';
            return;
        }
        const summary = document.createElement('div');
        summary.className = 'ma-lite-recall-summary';
        for (const item of model.summary) {
            const chip = document.createElement('span');
            chip.className = 'ma-lite-chip';
            chip.textContent = `${item.label} ${item.count}`;
            chip.title = item.description;
            summary.append(chip);
        }
        const list = document.createElement('div');
        list.className = 'ma-lite-recall-list';
        for (const item of model.entries) {
            const row = document.createElement('div');
            row.className = 'ma-lite-recall-row';
            const title = document.createElement('div');
            title.className = 'ma-lite-recall-title';
            title.textContent = item.title;
            title.title = item.title;
            const meta = document.createElement('div');
            meta.className = 'ma-lite-recall-meta';
            for (const badge of item.badges) {
                const node = document.createElement('span');
                node.className = 'ma-lite-badge';
                node.dataset.kind = badge.kind;
                node.textContent = badge.label;
                meta.append(node);
            }
            if (item.lifecycleLabel) {
                const node = document.createElement('span');
                node.className = 'ma-lite-badge';
                node.dataset.kind = item.lifecycleKind;
                node.textContent = item.lifecycleLabel;
                meta.append(node);
            }
            for (const text of [item.position, `顺序 ${item.order}`, item.scanDepth == null ? '扫描 继承' : `扫描 ${item.scanDepth}`]) {
                const node = document.createElement('span');
                node.className = 'ma-lite-badge';
                node.textContent = text;
                meta.append(node);
            }
            row.append(title, meta);
            list.append(row);
        }
        this.recallNode.append(summary, list);
        if (model.omitted > 0) {
            const omitted = document.createElement('div');
            omitted.className = 'ma-lite-recall-status';
            omitted.textContent = `另有 ${model.omitted} 条未展开；统计已包含。`;
            this.recallNode.append(omitted);
        }
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
    makeNumberInput(key, labelText, min, max) {
        const label = document.createElement('label');
        label.className = 'ma-lite-number';
        const text = document.createElement('span');
        text.textContent = labelText;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = String(min);
        input.max = String(max);
        input.step = '1';
        input.dataset.setting = key;
        input.addEventListener('change', () => {
            const value = Math.max(min, Math.min(max, Number(input.value || min)));
            try {
                this.actions.configure?.({ [key]: value });
                input.value = String(value);
                this.setStatus(`${labelText}已设为 ${value}`);
            } catch (error) {
                this.setStatus(`保存设置失败：${(0, util_1.errorText)(error)}`, true);
                this.refresh();
            }
        });
        label.append(text, input);
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
        if (this.pendingActions.has(kind)) return;
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
        this.pendingActions.add(kind);
        this.lastOutcome = null;
        this.syncDisabledState();
        this.setTaskProgress(kind, 'queued', kind === 'audit' ? '审核已进入异步队列' : '提取已进入异步队列', { titles: [], created: [], updated: [], skipped: [] });
        try {
            await action();
            this.lastOutcome = { kind, state: 'success' };
            if (kind === 'extract') void this.refreshRecallMap();
            if (['queued', 'running'].includes(this.taskStates[kind]?.state)) this.setTaskProgress(kind, 'success', kind === 'audit' ? '审核完成' : '提取完成');
        }
        catch (error) {
            this.lastOutcome = { kind, state: 'error' };
            this.setTaskProgress(kind, 'error', `${(0, util_1.errorText)(error)}`, { error: (0, util_1.errorText)(error) });
            this.setStatus(`${kind === 'audit' ? '审核' : '提取'}失败：${(0, util_1.errorText)(error)}`, true);
        }
        finally {
            this.pendingActions.delete(kind);
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
        if (this.inputs.autoAudit) this.inputs.autoAudit.checked = settings.autoAudit === true;
        if (this.inputs.autoExtraction) this.inputs.autoExtraction.checked = settings.autoExtraction === true;
        if (this.inputs.autoSmallSummary) this.inputs.autoSmallSummary.checked = settings.autoSmallSummary !== false;
        if (this.inputs.autoLargeSummary) this.inputs.autoLargeSummary.checked = settings.autoLargeSummary !== false;
        if (this.inputs.smallSummaryTurns) this.inputs.smallSummaryTurns.value = String(settings.smallSummaryTurns ?? 10);
        if (this.inputs.criticalChangesForSmall) this.inputs.criticalChangesForSmall.value = String(settings.criticalChangesForSmall ?? 6);
        if (this.inputs.largeSummaryCount) this.inputs.largeSummaryCount.value = String(settings.largeSummaryCount ?? 5);
        if (this.inputs.queueCompactThreshold) this.inputs.queueCompactThreshold.value = String(settings.queueCompactThreshold ?? 6);
        if (this.inputs.auditEnabled) this.inputs.auditEnabled.checked = settings.auditEnabled !== false;
        if (this.inputs.extractionEnabled) this.inputs.extractionEnabled.checked = settings.extractionEnabled !== false;
        if (this.apiProfileSelect && this.profileDropdownBound) {
            const selectedId = settings.modelSource === 'profile' ? String(settings.modelProfileId || '') : '';
            this.apiProfileSelect.value = selectedId;
            this.updateApiProfileStatus(selectedId);
        }
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
        if (this.buttons.audit) this.buttons.audit.disabled = this.pendingActions.has('audit') || !master || settings.auditEnabled === false;
        if (this.buttons.extract) this.buttons.extract.disabled = this.pendingActions.has('extract') || !master || settings.extractionEnabled === false;
        for (const input of Object.values(this.inputs)) input.disabled = false;
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
            merged: Array.isArray(meta.merged) ? [...meta.merged] : previous.merged,
            repaired: Number.isFinite(meta.repaired) ? Number(meta.repaired) : previous.repaired,
            messageIndex: Number.isInteger(meta.messageIndex) ? meta.messageIndex : previous.messageIndex,
            queuePosition: Number.isFinite(meta.queuePosition) ? Number(meta.queuePosition) : previous.queuePosition,
        };
        if (kind === 'extract' && state === 'success') void this.refreshRecallMap();
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
        this.taskStates.audit = { state: 'idle', detail, titles: [], created: [], updated: [], skipped: [], merged: [], repaired: 0, messageIndex: null, queuePosition: 0 };
        this.taskStates.extract = { state: 'idle', detail, titles: [], created: [], updated: [], skipped: [], merged: [], repaired: 0, messageIndex: null, queuePosition: 0 };
        this.lastOutcome = null;
        this.scheduleIndicatorRefresh();
    }
    togglePanel() {
        if (!this.panel) return;
        const opening = this.panel.hidden;
        this.panel.hidden = !opening;
        this.launcher?.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (opening) { this.refresh(); void this.refreshRecallMap(true); }
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
            void this.refreshRecallMap(true);
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
        const compactList = (label, values) => {
            const list = Array.isArray(values) ? values : [];
            if (!list.length) return '';
            const shown = list.slice(0, 4).join('、');
            return `${label}：${shown}${list.length > 4 ? ` 等${list.length}条` : ''}`;
        };
        const resultParts = [
            compactList('新建', extract.created),
            compactList('更新', extract.updated),
            compactList('合并', extract.merged),
            extract.repaired ? `修复：${extract.repaired}处` : '',
            compactList('跳过', extract.skipped),
        ].filter(Boolean);
        const titleDetail = compactList(extract.state === 'running' ? '处理中' : '条目', extract.titles);
        const detail = resultParts.length ? resultParts.join('；') : titleDetail;
        const fullDetail = [
            compactList('提取条目', extract.titles),
            compactList('新建', extract.created),
            compactList('更新', extract.updated),
            compactList('合并', extract.merged),
            extract.repaired ? `修复：${extract.repaired}处` : '',
            compactList('跳过', extract.skipped),
        ].filter(Boolean).join('\n');
        indicator.title = [this.statusText, fullDetail].filter(Boolean).join('\n') || '镜渊状态';
        indicator.innerHTML = `<span class="ma-ind-label">镜渊</span><span class="ma-ind-part"><i class="ma-ind-dot" data-state="${auditState}"></i>审核：${escapeHtml(auditText)}</span><span class="ma-ind-part"><i class="ma-ind-dot" data-state="${extractState}"></i>提取：${escapeHtml(extractText)}</span>${detail ? `<span class="ma-ind-detail">${escapeHtml(detail)}</span>` : ''}`;
    }
    indicatorState(kind, enabled) {
        if (!enabled) return 'disabled';
        const state = this.taskStates[kind]?.state;
        if (state === 'queued') return 'queued';
        if (state === 'running') return 'running';
        if (state === 'success') return 'success';
        if (state === 'error') return 'error';
        if (state === 'disabled') return 'disabled';
        return 'ready';
    }
    stateLabel(state) {
        return ({ disabled: '关闭', queued: '排队', running: '处理中', success: '完成', error: '失败', ready: '待命' })[state] || '待命';
    }
}
/** [MA-UI-API-03] 一个 Profile 统一覆盖所有模型阶段；空值恢复当前连接。 */
function buildUnifiedProfilePatch(profileId) {
    const id = String(profileId || '');
    return {
        modelSource: id ? 'profile' : 'current',
        modelProfileId: id,
        auditProfileId: id,
        revisionProfileId: id,
        extractionProfileId: id,
        smallSummaryProfileId: id,
        largeSummaryProfileId: id,
        migrationProfileId: id,
    };
}
function buildRecallViewModel(entries) {
    const managed = (Array.isArray(entries) ? entries : []).filter((entry) => entry?.managed === true);
    const mapped = managed.map((entry) => {
        const activation = entry.activation ?? {};
        const constant = activation.constant === true;
        // [MA-UI-RECALL-01] 关键词统计只读取 raw.key 的真实非 UID 触发词，不能用用于匹配的逻辑关键词冒充触发。
        const trigger = !constant && (entry.triggerKeywords ?? []).some((keyword) => !(0, util_1.isUidKeyword)(keyword));
        const vector = activation.vectorized === true;
        const prevent = activation.preventRecursion === true;
        const exclude = activation.excludeRecursion === true;
        let recursion = { key: 'source', label: '关联入口', kind: 'bridge' };
        if (!prevent && !exclude) recursion = { key: 'bridge', label: '双向关联', kind: 'bridge' };
        else if (prevent && !exclude) recursion = { key: 'terminal', label: '关联终点', kind: 'terminal' };
        else if (prevent && exclude) recursion = { key: 'isolated', label: '递归隔离', kind: 'isolated' };
        const lifecycle = String(entry.lifecycle || entry.memoryTier || 'background');
        const lifecycleInfo = lifecycleBadge(lifecycle);
        const semanticRole = String(entry.semanticRole || '');
        const sceneStage = String(entry.sceneStage || '');
        const position = Number(activation.position ?? 0);
        const depth = Math.max(0, Number(activation.depth ?? 0));
        const positionLabel = position === 0 ? '角色定义前' : position === 1 ? '角色定义后' : position === 4 ? `对话深度 ${depth}` : `位置 ${position}${depth ? ` / 深度 ${depth}` : ''}`;
        const badges = [];
        if (activation.disabled === true || activation.enabled === false) badges.push({ label: '停用', kind: 'isolated' });
        if (constant) badges.push({ label: '常驻', kind: 'constant' });
        else if (trigger) badges.push({ label: '关键词触发', kind: 'trigger' });
        if (vector) badges.push({ label: '纯向量', kind: 'vector' });
        if (sceneStage) badges.push({ label: sceneStage === 'current' ? '当前场景' : sceneStage === 'previous' ? '上一场景' : '远期场景', kind: 'scene' });
        if (semanticRole === 'world-state') badges.push({ label: '世界变化', kind: 'scene' });
        if (Number(activation.delayUntilRecursion || 0) > 0) badges.push({ label: `仅递归 ${activation.delayUntilRecursion}`, kind: 'bridge' });
        badges.push({ label: recursion.label, kind: recursion.kind });
        return {
            title: String(entry.title || entry.name || entry.uid || '未命名条目'),
            lifecycle,
            lifecycleLabel: lifecycleInfo.label,
            lifecycleKind: lifecycleInfo.kind,
            semanticRole,
            sceneStage,
            constant,
            trigger,
            vector,
            recursion: recursion.key,
            disabled: activation.disabled === true || activation.enabled === false,
            badges,
            position: positionLabel,
            depth,
            order: Number(activation.order ?? 400),
            scanDepth: activation.scanDepth == null ? null : Number(activation.scanDepth),
            updatedAt: Number(entry.updatedAt || 0),
        };
    });
    mapped.sort((left, right) => Number(left.disabled) - Number(right.disabled) || Number(right.constant) - Number(left.constant) || Number(right.sceneStage === 'current') - Number(left.sceneStage === 'current') || Number(right.recursion === 'bridge') - Number(left.recursion === 'bridge') || right.order - left.order || right.updatedAt - left.updatedAt || left.title.localeCompare(right.title, 'zh-CN'));
    const summary = [
        { label: '当前场景', count: mapped.filter((item) => item.sceneStage === 'current').length, description: '常驻并负责关联当前局部世界' },
        { label: '上一场景', count: mapped.filter((item) => item.sceneStage === 'previous').length, description: '通过稳定场景名触发并恢复关联' },
        { label: '远期场景', count: mapped.filter((item) => item.sceneStage === 'remote').length, description: '通过纯向量召回并恢复场景关联' },
        { label: '焦点/基础', count: mapped.filter((item) => ['focus', 'foundation'].includes(item.semanticRole)).length, description: '长期常驻且完全递归隔离' },
        { label: '世界变化', count: mapped.filter((item) => item.semanticRole === 'world-state').length, description: '跨场景整体变化，可被场景关联并继续关联' },
        { label: '关键词', count: mapped.filter((item) => item.trigger).length, description: '真实存在非 UID 关键词的触发条目' },
        { label: '纯向量', count: mapped.filter((item) => item.vector && !item.trigger).length, description: '只通过 Vector Storage 语义召回' },
        { label: '关联入口', count: mapped.filter((item) => ['source', 'bridge'].includes(item.recursion)).length, description: '场景与世界变化可以继续带出关联条目' },
        { label: '关联终点', count: mapped.filter((item) => item.recursion === 'terminal').length, description: '人物、物品和活动事件被带出后停止' },
        { label: '隔离', count: mapped.filter((item) => item.recursion === 'isolated').length, description: '基础设定、焦点与历史容器不参与递归' },
    ];
    const limit = 60;
    return { total: mapped.length, summary, entries: mapped.slice(0, limit), omitted: Math.max(0, mapped.length - limit) };
}

function lifecycleBadge(value) {
    return ({
        core: { label: '核心', kind: 'constant' },
        active: { label: '活动', kind: 'active' },
        recent: { label: '近期', kind: 'active' },
        'recent-summary': { label: '近期总结', kind: 'active' },
        'long-term': { label: '长期', kind: 'history' },
        historical: { label: '历史', kind: 'history' },
        'historical-summary': { label: '历史总结', kind: 'history' },
        closed: { label: '已关闭', kind: 'closed' },
        settled: { label: '已离场', kind: 'closed' },
        temporary: { label: '临时', kind: 'closed' },
        background: { label: '背景', kind: 'isolated' },
    })[String(value ?? '')] ?? { label: String(value || '背景'), kind: 'isolated' };
}
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
exports.ControlPanel = ControlPanel;
},"domain/entry-section":function(module,exports,require){

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
},"domain/information-point":function(module,exports,require){

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
},"host":function(module,exports,require){

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
            extractionEnabled: settings.extractionEnabled,
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
    /** [MA-HOST-03] 宿主模型调用原语；重试和阶段预算由 model-request.js 负责。 */
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
    /**
     * [MA-HOST-API-01] 把 UI 下拉框交给 SillyTavern 官方 ConnectionManagerRequestService 填充和维护。
     * 插件不读取、不保存 API Key；回调只返回官方 profile 对象。
     */
    bindProfileDropdown(selector, selectedId, onChange) {
        const service = this.context().ConnectionManagerRequestService;
        if (!service?.handleDropdown) return false;
        service.handleDropdown(
            selector,
            selectedId,
            (profile) => onChange(profile || null),
            undefined,
            undefined,
            (profile) => { if (profile?.id === selectedId) onChange(null); },
        );
        return true;
    }
    /**
     * [MA-HOST-01] 正文替换的唯一写入口。
     * 顺序固定为：校验旧版本 → 修改 mes/当前 swipe → 清除 display_text → 刷新 UI → 保存聊天 → 回读校验。
     */
    async replaceAssistantText(snapshot, text, currentSettings) {
        this.assertSnapshot(snapshot, currentSettings);
        const context = this.context();
        const chat = context.chat ?? [];
        const message = chat[snapshot.messageIndex];
        if (!isAssistant(message)) throw new Error('待修正正文已经不存在');
        if (readMessageKey(message) !== snapshot.messageKey || (0, util_1.hashText)(String(message.mes ?? '')) !== snapshot.contentHash)
            throw new Error('正文已经变化，拒绝覆盖旧版本');
        const nextText = String(text ?? '').trim();
        const originalText = String(message.mes ?? '');
        if (!nextText) throw new Error('修正版正文为空，拒绝替换');
        if ((0, util_1.normalizeFact)(nextText) === (0, util_1.normalizeFact)(originalText))
            throw new Error('修正版与原正文没有实质变化，未执行替换');
        const swipeIndex = Array.isArray(message.swipes) && Number.isInteger(message.swipe_id) && Number(message.swipe_id) >= 0
            ? Number(message.swipe_id)
            : -1;
        const originalSwipe = swipeIndex >= 0 ? message.swipes[swipeIndex] : undefined;
        const extra = message.extra && typeof message.extra === 'object' ? message.extra : null;
        const hadDisplayText = Boolean(extra && Object.prototype.hasOwnProperty.call(extra, 'display_text'));
        const originalDisplayText = hadDisplayText ? extra.display_text : undefined;
        try {
            message.mes = nextText;
            if (swipeIndex >= 0) message.swipes[swipeIndex] = nextText;
            if (extra && hadDisplayText) delete extra.display_text;
            this.updateMessageBlock(snapshot.messageIndex, message);
            await this.saveChat();
            await Promise.resolve();
            const persisted = this.verifyAssistantReplacement(snapshot.messageIndex, nextText, swipeIndex);
            this.updateMessageBlock(snapshot.messageIndex, persisted);
        }
        catch (error) {
            message.mes = originalText;
            if (swipeIndex >= 0) message.swipes[swipeIndex] = originalSwipe;
            if (extra && hadDisplayText) extra.display_text = originalDisplayText;
            try { this.updateMessageBlock(snapshot.messageIndex, message); }
            catch { }
            throw new Error(`修正版正文保存失败，已恢复原正文：${(0, util_1.errorText)(error)}`);
        }
        const turn = this.latestTurn(snapshot.messageIndex);
        return {
            ...this.refreshSnapshot(snapshot, turn, currentSettings),
            auditReplacementVerified: true,
            auditReplacementDetail: `消息${snapshot.messageIndex}正文、当前 swipe 与显示缓存已同步`,
        };
    }

    /** [MA-HOST-02] 保存完成后的单点回读校验，不负责写入。 */
    verifyAssistantReplacement(messageIndex, expectedText, swipeIndex = -1) {
        const persisted = this.context().chat?.[messageIndex];
        if (!persisted || String(persisted.mes ?? '') !== expectedText)
            throw new Error('聊天正文回读校验未通过');
        if (swipeIndex >= 0 && String(persisted.swipes?.[swipeIndex] ?? '') !== expectedText)
            throw new Error('当前 swipe 回读校验未通过');
        if (persisted.extra && Object.prototype.hasOwnProperty.call(persisted.extra, 'display_text'))
            throw new Error('旧 display_text 仍存在，可能遮挡修正版正文');
        return persisted;
    }
    cursor() {
        const root = this.chatNamespace();
        const value = root.cursor && typeof root.cursor === 'object' ? root.cursor : {};
        return {
            lastProcessedMessageKey: String(value.lastProcessedMessageKey ?? ''),
            lastProcessedHash: String(value.lastProcessedHash ?? ''),
            turnsSinceSmall: Math.max(0, Number(value.turnsSinceSmall) || 0),
            criticalChangesSinceSmall: Math.max(0, Number(value.criticalChangesSinceSmall) || 0),
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
        if (typeof context.saveChat === 'function') return context.saveChat();
        if (typeof context.saveChatConditional === 'function') return context.saveChatConditional();
        throw new Error('SillyTavern 未提供聊天保存接口');
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
        const update = this.context().updateMessageBlock;
        if (typeof update !== 'function') throw new Error('SillyTavern 未提供正文刷新接口 updateMessageBlock');
        update(index, message);
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
},"index":function(module,exports,require){

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
const STARTUP_ROOT_ID = 'mirror-abyss-startup-control';
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
    root.style.cssText = 'position:fixed!important;right:max(10px,env(safe-area-inset-right))!important;top:50dvh!important;transform:translateY(-50%)!important;z-index:2147483640!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;';
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = '<i class="fa-solid fa-circle-nodes" aria-hidden="true"></i>';
    button.setAttribute('aria-label', '启动镜渊');
    button.title = '镜渊正在等待 SillyTavern 完成初始化';
    button.style.cssText = 'display:flex!important;align-items:center!important;justify-content:center!important;width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border:1px solid rgba(255,255,255,.24);border-radius:50%;background:rgba(20,20,24,.96);color:#fff;font-weight:700;font-size:13px;box-shadow:0 3px 12px rgba(0,0,0,.42);touch-action:manipulation;pointer-events:auto!important;cursor:pointer!important;';
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); void initialize(); });
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
async function waitForContext(timeoutMs = 20000) {
    const startedAt = Date.now();
    while (!contextReady()) {
        if (!extensionEnabled) throw new Error('镜渊插件当前已禁用');
        if (Date.now() - startedAt >= timeoutMs) throw new Error('等待 SillyTavern 上下文超时，点击镜渊图标可重试');
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}
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
        replanRecall: async () => (await requireApplication()).replanRecall(),
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
    if (!extensionEnabled || application?.isStarted()) return;
    if (initializing) {
        while (initializing) await new Promise((resolve) => setTimeout(resolve, 50));
        if (application?.isStarted()) return;
    }
    initializing = true;
    mountStartupIndicator();
    exposeApi();
    try {
        await waitForContext();
        application ?? (application = new application_1.MirrorAbyssApplication());
        application.start();
        removeStartupIndicator();
        console.info(`[MirrorAbyss] ${constants_1.VERSION} ready`);
    }
    catch (error) {
        console.error('[MirrorAbyss] initialization failed', error);
        globalThis.toastr?.error?.(`镜渊启动失败：${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
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
},"matcher":function(module,exports,require){

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
        for (const keyword of entry.triggerKeywords ?? entry.keywords ?? []) {
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
            if (canonicalTypeLookup(entry.type) !== canonicalTypeLookup(block.type)) continue;
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
        for (const keyword of entry.triggerKeywords ?? entry.keywords ?? []) {
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
function typeNameKey(type, name) { return `${canonicalTypeLookup(type)}｜${normalizeLookup(name)}`; }
function typedLookup(type, value) { return `${canonicalTypeLookup(type)}｜${normalizeLookup(value)}`; }
function canonicalTypeLookup(type) {
    const value = normalizeLookup(type);
    return ({ 角色: '人物', npc: '人物', 地点: '场景', 地区: '场景', 区域: '场景', 全局变化: '世界', 世界变化: '世界' })[value] ?? value;
}
function normalizeTitleLookup(value) { return (0, util_1.normalizeTitle)(String(value ?? '')).toLocaleLowerCase(); }
function normalizeLookup(value) { return (0, util_1.normalizeFact)(String(value ?? '')).replace(/[｜|]/gu, '').toLocaleLowerCase(); }
function add(map, key, entry) {
    if (!key) return;
    const list = map.get(key) ?? [];
    if (!list.some((candidate) => candidate.uid === entry.uid)) list.push(entry);
    map.set(key, list);
}
},"memory":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryRunner = void 0;
const matcher_1 = require("./matcher");
const operations_1 = require("./operations");
const parser_1 = require("./parser");
const prompts_1 = require("./prompts");
const semantic_1 = require("./semantic");
const model_request_1 = require("./model-request");
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
            const extraction = await this.extract(settings, snapshot);
            await this.advanceSummarySchedule(settings, snapshot, cursor, extraction.criticalChanges || 0);
            this.setStatus(snapshot.chatKey, 'complete', '核心事实已提交，总结调度完成');
            return extraction.entries;
        } catch (error) {
            this.setStatus(snapshot.chatKey, 'error', '当前步骤失败，后续步骤已停止', (0, util_1.errorText)(error));
            throw error;
        }
    }
    async runTask(kind, settings, snapshot) {
        if (kind === 'extraction') {
            const cursor = this.host.cursor();
            const result = await this.extract(settings, snapshot);
            await this.advanceSummarySchedule(settings, snapshot, cursor, result.criticalChanges || 0);
            this.setStatus(snapshot.chatKey, 'complete', '提取与总结调度完成');
            return result.entries;
        }
        if (kind === 'smallSummary') {
            const result = await this.summarize('small', settings, snapshot);
            const cursor = this.host.cursor();
            let smallCountSinceLarge = cursor.smallCountSinceLarge + (result.changed ? 1 : 0);
            if (settings.autoLargeSummary !== false && smallCountSinceLarge >= settings.largeSummaryCount) {
                await this.summarize('large', settings, snapshot);
                smallCountSinceLarge = 0;
            }
            await this.host.saveCursor({ ...cursor, turnsSinceSmall: 0, criticalChangesSinceSmall: 0, smallCountSinceLarge }, snapshot, this.getSettings());
            this.setStatus(snapshot.chatKey, 'complete', result.changed ? '小总结完成' : '小总结无更新');
            return result.entries;
        }
        const result = await this.summarize('large', settings, snapshot);
        const cursor = this.host.cursor();
        await this.host.saveCursor({ ...cursor, smallCountSinceLarge: 0 }, snapshot, this.getSettings());
        this.setStatus(snapshot.chatKey, 'complete', result.changed ? '大总结完成' : '大总结无更新');
        return result.entries;
    }
    async advanceSummarySchedule(settings, snapshot, cursor, criticalChanges = 0) {
        let turnsSinceSmall = Number(cursor.turnsSinceSmall || 0) + 1;
        let criticalChangesSinceSmall = Number(cursor.criticalChangesSinceSmall || 0) + Math.max(0, Number(criticalChanges || 0));
        let smallCountSinceLarge = Number(cursor.smallCountSinceLarge || 0);
        const turnReady = turnsSinceSmall >= settings.smallSummaryTurns;
        const changeReady = criticalChangesSinceSmall >= settings.criticalChangesForSmall;
        if (settings.autoSmallSummary !== false && (turnReady || changeReady)) {
            const reason = turnReady ? `达到${settings.smallSummaryTurns}轮` : `累计${criticalChangesSinceSmall}个关键变化`;
            this.progress('running', `${reason}，开始小总结与分发`, { titles: ['总结｜当前事件'], criticalChanges: criticalChangesSinceSmall });
            const small = await this.summarize('small', settings, snapshot);
            turnsSinceSmall = 0;
            criticalChangesSinceSmall = 0;
            if (small.changed) smallCountSinceLarge += 1;
        }
        if (settings.autoLargeSummary !== false && smallCountSinceLarge >= settings.largeSummaryCount) {
            this.progress('running', `累计${settings.largeSummaryCount}个小总结，开始大总结、沉降与分发`, { titles: ['总结｜世界历史'] });
            await this.summarize('large', settings, snapshot);
            smallCountSinceLarge = 0;
        }
        await this.host.saveCursor({
            ...cursor,
            lastProcessedMessageKey: snapshot.messageKey,
            lastProcessedHash: snapshot.contentHash,
            turnsSinceSmall,
            criticalChangesSinceSmall,
            smallCountSinceLarge,
        }, snapshot, this.getSettings());
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
        const selected = (0, matcher_1.relevantEntries)(entries, `${snapshot.playerText}\n${snapshot.assistantText}`, 6);
        const prompt = (0, prompts_1.extractionPrompts)(settings, snapshot.playerText, snapshot.assistantText, selected);
        // [MA-MEMORY-01] 提取只通过通用请求模块调用模型；504 时改用更短的既有条目上下文重试一次。
        const raw = await (0, model_request_1.callModel)({
            host: this.host,
            stage: 'extraction',
            prompt,
            fallbackPrompt: () => (0, prompts_1.extractionPrompts)(settings, snapshot.playerText, snapshot.assistantText, selected, { compact: true }),
            settings,
            snapshot,
            profileId: settings.extractionProfileId,
            sourceText: snapshot.assistantText,
            onRetry: () => this.progress('running', '提取网关异常，已缩短上下文并重试一次', { titles: [] }),
        });
        this.validate(snapshot);
        let blocks = (0, parser_1.parseExtractionWithRecovery)(raw);
        let diagnostics = blocks.diagnostics ?? { repaired: 0, merged: [], skipped: [], warnings: [], hadInput: false };
        let repairRaw = '';
        if (!blocks.length && diagnostics.hadInput) {
            this.progress('running', '首次格式无法提交，启动一次格式修复后手', { titles: [] });
            const repairPrompt = (0, prompts_1.extractionRepairPrompts)(raw);
            repairRaw = await (0, model_request_1.callModel)({
                host: this.host,
                stage: 'extractionRepair',
                prompt: repairPrompt,
                fallbackPrompt: () => (0, prompts_1.extractionRepairPrompts)(raw, { compact: true }),
                settings,
                snapshot,
                profileId: settings.extractionProfileId,
                sourceText: raw,
                onRetry: () => this.progress('running', '格式修复网关异常，缩短异常文本后重试一次', { titles: [] }),
            });
            this.validate(snapshot);
            blocks = (0, parser_1.parseExtractionWithRecovery)(repairRaw);
            const next = blocks.diagnostics ?? {};
            diagnostics = {
                repaired: Number(diagnostics.repaired || 0) + Number(next.repaired || 0) + 1,
                merged: [...(diagnostics.merged || []), ...(next.merged || [])],
                skipped: [...(diagnostics.skipped || []), ...(next.skipped || [])],
                warnings: [...(diagnostics.warnings || []), '已执行一次模型格式修复', ...(next.warnings || [])],
                hadInput: true,
            };
        }
        if (!blocks.length) {
            const explicitNone = /^(?:无|EMPTY)$/u.test(String(raw ?? '').trim());
            const skippedTitles = (diagnostics.skipped || []).map((item) => item.title || '异常片段');
            const detail = explicitNone ? '本轮明确返回“无”，世界书零写入' : `没有可安全提交的条目；已隔离${skippedTitles.length}个异常片段`;
            this.setStatus(snapshot.chatKey, 'matching', detail, '', repairRaw || raw, emptyPlan());
            this.progress(explicitNone ? 'success' : 'error', detail, { titles: [], created: [], updated: [], skipped: skippedTitles, repaired: diagnostics.repaired || 0 });
            return { entries, changed: false, diagnostics };
        }
        const titles = blocks.map((block) => block.title);
        this.setStatus(snapshot.chatKey, 'matching', `已提取 ${titles.length} 个条目：${titles.join('、')}；格式修复${diagnostics.repaired || 0}处`, '', repairRaw || raw);
        this.progress('running', `已提取 ${titles.length} 个，正在匹配；修复${diagnostics.repaired || 0}处`, { titles, merged: diagnostics.merged || [], repaired: diagnostics.repaired || 0, skipped: (diagnostics.skipped || []).map((item) => item.title || '异常片段') });
        const plan = (0, operations_1.buildOperationPlan)(blocks, entries, settings, `${snapshot.playerText}\n${snapshot.assistantText}`);
        await this.resolveSemanticDuplicates(plan, entries, settings, snapshot);
        const created = [...new Set(plan.operations.filter((operation) => operation.kind === 'create-entry').map((operation) => operation.title))];
        const updated = [...new Set(plan.operations.filter((operation) => operation.kind !== 'create-entry' && operation.kind !== 'noop').map((operation) => operation.title))];
        const skipped = [...new Set([...(diagnostics.skipped || []).map((item) => item.title || '异常片段'), ...plan.operations.filter((operation) => operation.kind === 'noop').map((operation) => operation.title)])];
        this.progress('running', `准备写入：新建${created.length}、更新${updated.length}、合并${(diagnostics.merged || []).length}、修复${diagnostics.repaired || 0}、跳过${skipped.length}`, { titles, created, updated, skipped, merged: diagnostics.merged || [], repaired: diagnostics.repaired || 0 });
        const result = await this.apply(settings, plan, snapshot, `${snapshot.playerText}\n${snapshot.assistantText}`, '提取', raw);
        result.criticalChanges = (0, semantic_1.countCriticalChanges)(plan);
        this.progress('success', `完成：新建${created.length}、更新${updated.length}、关键变化${result.criticalChanges}、合并${(diagnostics.merged || []).length}、修复${diagnostics.repaired || 0}、跳过${skipped.length}`, { titles, created, updated, skipped, merged: diagnostics.merged || [], repaired: diagnostics.repaired || 0, criticalChanges: result.criticalChanges });
        return result;
    }
    async resolveSemanticDuplicates(plan, entries, settings, snapshot) {
        const byUid = new Map(entries.map((entry) => [String(entry.uid), entry]));
        let skipped = 0;
        for (const operation of plan.operations) {
            if (operation.kind !== 'append-line' || !operation.targetUid || !operation.section || !operation.newValue) continue;
            const entry = byUid.get(String(operation.targetUid));
            const oldLines = entry?.sections?.values?.[operation.section] ?? [];
            const threshold = /(关键进展|持续经历|持续变化|世界变化|事件进程|近期经历|变化记录|历史事实)/u.test(operation.section) ? 0.93 : 0.86;
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
        const raw = await (0, model_request_1.callModel)({
            host: this.host,
            stage: kind === 'small' ? 'smallSummary' : 'largeSummary',
            prompt,
            fallbackPrompt: () => (0, prompts_1.summaryPrompts)(kind, settings, selected, scope, recentConversation, { compact: true }),
            settings,
            snapshot,
            profileId: profile,
            sourceText: recentConversation,
            onRetry: () => this.progress('running', `${label}网关异常，缩短上下文后重试一次`, { titles: [expectedTitle] }),
        });
        this.validate(snapshot);
        const recovered = parseSummaryWithRecovery(raw, kind);
        if (!recovered.block) {
            if (recovered.explicitNone) {
                this.setStatus(snapshot.chatKey, kind === 'small' ? 'small-summary' : 'large-summary', `${label}明确返回“无”`, '', raw, emptyPlan());
                return { entries, changed: false };
            }
            throw new Error(`${label}无法从模型返回中恢复“${expectedTitle}”`);
        }
        const summaryBlock = recovered.block;
        if (recovered.repaired) this.progress('running', `${label}已本地修复${recovered.repaired}处格式问题`, { titles: [expectedTitle], repaired: recovered.repaired, skipped: recovered.skipped });
        const distribution = distributionBlocksFromSummary(summaryBlock);
        summaryBlock.sections = summaryBlock.sections.filter((section) => !/^(分发事实|沉降分发)$/u.test(section.name));
        const plan = (0, operations_1.buildOperationPlan)([summaryBlock, ...distribution], entries, settings, selected.map((entry) => `${entry.title}\n${entry.content}`).join('\n'), { cleanupTemporaryAfterSummary: true, consumeSmallSummaryAfterLarge: kind === 'large' });
        const applied = await this.apply(settings, plan, snapshot, selected.map((entry) => `${entry.title}\n${entry.content}`).join('\n'), label, raw);
        await this.worldbook.rebalance(settings, kind, `${summaryBlock.title}\n${summaryBlock.sections.flatMap((section) => section.lines).join('\n')}`, snapshot, () => this.validate(snapshot));
        this.progress('running', `${label}已完成分发，正在重算召回状态`, { titles: [summaryBlock.title, ...distribution.map((block) => block.title)] });
        return applied;

    }
    async apply(settings, plan, snapshot, contextText, label, raw) {
        this.setStatus(snapshot.chatKey, 'matching', `${label}生成确定性操作计划`, '', raw, plan);
        if (!plan.operations.some((operation) => operation.kind !== 'noop')) return { entries: [], changed: false };
        this.setStatus(snapshot.chatKey, 'worldbook', `${label}通过唯一提交器写入世界书`, '', raw, plan);
        this.validate(snapshot);
        const focusUid = typeof this.host.getFocusUid === 'function' ? this.host.getFocusUid() : '';
        const entries = await this.worldbook.apply(settings, plan, snapshot.messageKey, contextText, focusUid, snapshot, () => this.validate(snapshot), { sourceKind: label === '提取' ? 'extraction' : 'summary' });
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
    const longTerm = active.filter((entry) => /(人物|角色|基础设定|世界|全局变化|事件|场景|时空|物品)/u.test(`${entry.type}\n${entry.keywords.join(' ')}`));
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
function distributionBlocksFromSummary(summaryBlock) {
    const section = summaryBlock.sections.find((item) => /^(分发事实|沉降分发)$/u.test(item.name));
    if (!section || section.empty) return [];
    const blocks = new Map();
    for (const line of section.lines) {
        const match = String(line ?? '').match(/^\s*(人物|角色|场景|地点|物品|事件|世界|全局变化)\s*[｜|丨]\s*([^｜|丨]+?)\s*[｜|丨]\s*([^｜|丨]+?)\s*[｜|丨]\s*(.+)$/u);
        if (!match) continue;
        const type = (0, parser_1.canonicalExtractionType)(match[1].trim());
        const name = match[2].trim();
        const sectionName = match[3].trim();
        const fact = match[4].trim();
        if (!name || !sectionName || !fact || /^(?:无|没有)$/u.test(fact)) continue;
        const title = `${type}｜${name}`;
        const block = blocks.get(title) ?? { rawTitle: title, title, type, name, keywords: [name], sections: [] };
        let target = block.sections.find((item) => item.name === sectionName);
        if (!target) {
            target = { name: sectionName, lines: [], empty: false };
            block.sections.push(target);
        }
        target.lines = (0, util_1.unique)([...target.lines, fact]);
        blocks.set(title, block);
    }
    return [...blocks.values()];
}

function parseSummaryWithRecovery(raw, kind) {
    const expectedTitle = kind === 'small' ? '总结｜当前事件' : '总结｜世界历史';
    const text = (0, parser_1.sanitizeModelText)(raw);
    if (/^(?:无|EMPTY)$/u.test(text.trim())) return { block: null, explicitNone: true, repaired: 0, skipped: [] };
    let repaired = 0;
    let blocks = [];
    try { blocks = (0, parser_1.parseInformationPoints)(text); }
    catch {
        if (/【[^】]+】/u.test(text) && !/(?:总结|小总结|大总结)[｜|丨]/u.test(text)) {
            try {
                blocks = (0, parser_1.parseInformationPoints)(`${expectedTitle}\n\n${text}`);
                repaired += 1;
            }
            catch { blocks = []; }
        }
    }
    const candidates = blocks.filter((block) => {
        const normalized = (0, util_1.normalizeTitle)(block.title);
        if (normalized === (0, util_1.normalizeTitle)(expectedTitle)) return true;
        if (kind === 'small') return /^(?:总结|小总结)[｜|丨](?:当前事件|当前事件线|当前阶段)$/u.test(normalized);
        return /^(?:总结|大总结)[｜|丨](?:世界历史|长期历史|长期记忆)$/u.test(normalized);
    });
    if (!candidates.length && blocks.length === 1 && blocks[0].sections?.length) {
        candidates.push(blocks[0]);
        repaired += 1;
    }
    if (!candidates.length) return { block: null, explicitNone: false, repaired, skipped: blocks.map((block) => block.title) };
    const merged = { rawTitle: expectedTitle, title: expectedTitle, type: '总结', name: kind === 'small' ? '当前事件' : '世界历史', keywords: [kind === 'small' ? '当前事件' : '世界历史', '总结'], sections: [] };
    const sectionMap = new Map();
    for (const block of candidates) {
        if ((0, util_1.normalizeTitle)(block.title) !== (0, util_1.normalizeTitle)(expectedTitle)) repaired += 1;
        for (const section of block.sections ?? []) {
            const name = String(section.name ?? '').trim();
            if (!name) continue;
            const target = sectionMap.get(name) ?? { name, lines: [], empty: false };
            target.lines = (0, util_1.unique)([...target.lines, ...(section.lines ?? [])]);
            target.empty = target.lines.length === 0;
            sectionMap.set(name, target);
        }
    }
    merged.sections = [...sectionMap.values()];
    if (candidates.length > 1) repaired += candidates.length - 1;
    return { block: merged, explicitNone: false, repaired, skipped: blocks.filter((block) => !candidates.includes(block)).map((block) => block.title) };
}

function emptyPlan() { return { blocks: [], operations: [], createdAt: Date.now() }; }

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
},"migration":function(module,exports,require){

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
},"model-request":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callModel = callModel;
exports.stageResponseTokens = stageResponseTokens;
exports.isRetryableGatewayError = isRetryableGatewayError;
exports.limitPromptPair = limitPromptPair;
const util_1 = require("./util");

// [MA-MODEL-01] 每个模型阶段只声明输入/输出预算和一次网关重试。
// 该模块不理解审核、提取或总结业务，也不接触世界书，避免请求控制与业务逻辑耦合。
const INPUT_LIMITS = Object.freeze({
    audit: 24000,
    revision: 30000,
    extraction: 26000,
    extractionRepair: 14000,
    smallSummary: 28000,
    largeSummary: 30000,
    migration: 24000,
});

/**
 * [MA-MODEL-02] 调用模型；仅在 502/503/504、HTML 网关页或 No message generated 时，
 * 使用调用方提供的精简提示词再试一次。解析错误和业务校验错误绝不重试。
 */
async function callModel(options) {
    const {
        host,
        stage,
        prompt,
        fallbackPrompt,
        settings,
        snapshot,
        profileId = '',
        sourceText = '',
        onRetry,
    } = options;
    const responseLength = stageResponseTokens(stage, settings, sourceText);
    const primary = limitPromptPair(prompt, stage);
    try {
        return await host.generate(primary.system, primary.user, responseLength, snapshot, settings, settings.requestTimeoutMs, profileId);
    }
    catch (error) {
        if (snapshot?.token?.cancelled || !fallbackPrompt || !isRetryableGatewayError(error))
            throw error;
        const fallbackValue = typeof fallbackPrompt === 'function' ? fallbackPrompt() : fallbackPrompt;
        const fallback = limitPromptPair(fallbackValue, stage, true);
        const fallbackTokens = Math.max(256, Math.min(responseLength, Math.floor(responseLength * 0.75)));
        try { onRetry?.(error); }
        catch (callbackError) { console.warn('[MirrorAbyss] model retry callback failed', callbackError); }
        return host.generate(fallback.system, fallback.user, fallbackTokens, snapshot, settings, settings.requestTimeoutMs, profileId);
    }
}

/** [MA-MODEL-03] 不同任务不再共用 3072 输出上限。 */
function stageResponseTokens(stage, settings, sourceText = '') {
    const configured = Math.max(256, Number(settings?.responseTokens) || 3072);
    if (stage === 'audit') return Math.min(configured, 384);
    if (stage === 'revision') {
        const estimated = Math.max(1024, Math.ceil(String(sourceText ?? '').length * 1.15) + 256);
        return Math.min(configured, Math.min(4096, estimated));
    }
    if (stage === 'extraction') return Math.min(configured, 2560);
    if (stage === 'extractionRepair') return Math.min(configured, 1536);
    if (stage === 'smallSummary') return Math.min(configured, 1792);
    if (stage === 'largeSummary') return Math.min(configured, 2304);
    return configured;
}

/** [MA-MODEL-04] 识别常见上游网关失败；本地取消和格式错误不属于此类。 */
function isRetryableGatewayError(error) {
    const text = (0, util_1.errorText)(error).toLocaleLowerCase();
    return /(?:\b502\b|\b503\b|\b504\b|gateway\s*(?:timeout|time-out)|upstream|no message generated|html\s*错误页|returned\s*html|fetch failed|network error|connection reset)/iu.test(text);
}

/**
 * [MA-MODEL-05] 最后的硬上限保护。业务提示词应先自行裁剪；这里仅防止异常配置把请求再次膨胀。
 */
function limitPromptPair(prompt, stage, retry = false) {
    const system = String(prompt?.system ?? '');
    const user = String(prompt?.user ?? '');
    const baseLimit = INPUT_LIMITS[stage] ?? 30000;
    const totalLimit = retry ? Math.floor(baseLimit * 0.72) : baseLimit;
    const userLimit = Math.max(2000, totalLimit - system.length);
    return { system, user: clipMiddle(user, userLimit) };
}

function clipMiddle(value, maxChars) {
    const text = String(value ?? '');
    if (text.length <= maxChars) return text;
    const marker = '\n[中间内容因请求预算被省略]\n';
    const remaining = Math.max(0, maxChars - marker.length);
    const head = Math.ceil(remaining * 0.62);
    const tail = Math.floor(remaining * 0.38);
    return `${text.slice(0, head)}${marker}${text.slice(text.length - tail)}`;
}
},"operations":function(module,exports,require){


"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOperationPlan = buildOperationPlan;
exports.applyPlanToEntries = applyPlanToEntries;
exports.informationAnchor = informationAnchor;
exports.enforceEntryBudgets = enforceEntryBudgets;
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
                if (/(事件进程|关键进展)/u.test(section.name) && block.type !== '事件') { operations.push(noop(block.title, undefined, section.name, '事件过程只能写入事件条目')); continue; }
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
            if (/(事件进程|关键进展)/u.test(section.name) && block.type !== '事件') { operations.push(noop(entry.title, entry.uid, section.name, '事件过程只能写入事件条目', target.score, target.evidence)); continue; }
            operations.push(...operationsForExisting(entry, section.name, lines, policyFor(section.name, settings), target.score, target.evidence));
        }
    }
    if (options.cleanupTemporaryAfterSummary === true)
        operations.push(...temporaryCleanupOperations(entries, settings, blocks));
    if (options.consumeSmallSummaryAfterLarge === true)
        operations.push(...consumeSmallSummaryOperations(entries));
    return { blocks, operations: dedupeOperations(operations), createdAt: Date.now() };
}
function applyPlanToEntries(plan, entries) {
    const output = entries.map((entry) => structuredClone(entry));
    const byUid = new Map(output.map((entry) => [entry.uid, entry]));
    const createdByTitle = new Map();
    const modifiedEntries = new Set();
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
                    activation: { enabled: true, constant: false, selective: false, vectorized: true, recursive: false, preventRecursion: true, excludeRecursion: false, depth: 4, order: 400, position: 4, probability: 100, disabled: false },
                    raw: {},
                };
                output.push(entry);
                createdByTitle.set((0, util_1.normalizeTitle)(operation.title), entry);
                byUid.set(entry.uid, entry);
                modifiedEntries.add(entry);
            }
            continue;
        }
        const target = operation.targetUid ? byUid.get(operation.targetUid) : createdByTitle.get((0, util_1.normalizeTitle)(operation.title));
        if (!target)
            continue;
        applyOne(target, operation);
        modifiedEntries.add(target);
    }
    for (const entry of modifiedEntries) enforceEntryBudgets(entry);
    return output;
}
// [MA-CONTENT-01] 单条目正文预算：允许场景知识持续补全，但阻止模型把动作流水或重复描述无限写入世界书。
const SECTION_BUDGETS = {
    人物: { 身份: 8, 稳定: 12, 当前: 8, 关系: 16, 持有: 10, 持续经历: 16, 别名: 4 },
    场景: { 定义: 8, 空间结构: 24, 固定资源: 16, 持续变化: 20, 当前状态: 8, 在场: 12, 当前资源: 12, 活动关联: 8, 世界影响: 6, 局部约束: 16, 别名: 4 },
    物品: { 定义: 8, 功能: 10, 当前: 8, 限制: 10, 持续变化: 12, 别名: 4 },
    事件: { 目标: 6, 参与: 12, 场景: 8, 阶段: 2, 关键进展: 16, 未决: 12, 结果: 8, 别名: 4 },
    世界: { 时代: 10, 权力: 14, 制度: 14, 公开局势: 14, 世界变化: 20, 持续影响: 16, 别名: 4 },
};
function enforceEntryBudgets(entry) {
    const budgets = SECTION_BUDGETS[String(entry?.type ?? '')] ?? {};
    for (const [section, limitValue] of Object.entries(budgets)) {
        const limit = Math.max(1, Number(limitValue || 1));
        const lines = (0, util_1.unique)(entry.sections?.values?.[section] ?? []);
        if (lines.length <= limit) {
            if (entry.sections?.values) entry.sections.values[section] = lines;
            continue;
        }
        // 场景稳定知识保留最早的定义骨架与最新发现；过程、状态和经历只保留最近有效内容。
        const preserveEdges = entry.type === '场景' && /^(定义|空间结构|固定资源)$/u.test(section);
        if (preserveEdges) {
            const headCount = Math.ceil(limit / 2);
            const tailCount = limit - headCount;
            entry.sections.values[section] = (0, util_1.unique)([...lines.slice(0, headCount), ...lines.slice(-tailCount)]).slice(0, limit);
        }
        else {
            entry.sections.values[section] = lines.slice(-limit);
        }
    }
    return entry;
}

function operationsForNewSection(title, type, section, lines, policy, normalized = false) {
    if (type === '总结') policy = 'replace-section';
    if (!normalized && type === '人物' && /^(当前|当前状态)$/u.test(section)) {
        const multiValue = lines.filter(isMultiValueFact);
        const scalar = lines.filter((line) => !isMultiValueFact(line));
        return [
            ...multiValue.map(() => noop(title, undefined, section, '该事实应写入人物【关系】、【持有】或【稳定】，不写入人物【当前】状态槽')),
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
        if (entry.type === '人物' && /^(当前|当前状态)$/u.test(section) && isMultiValueFact(point)) {
            result.push(noop(entry.title, entry.uid, section, '该事实应写入人物【关系】、【持有】或【稳定】，不写入人物【当前】状态槽', score, evidence));
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
function consumeSmallSummaryOperations(entries) {
    return entries
        .filter((entry) => entry.title === '总结｜当前事件' && !entry.locked && !entry.focus)
        .map((entry) => ({
            ...op('delete-entry', entry.title, entry.uid, '大总结沉降', undefined, '删除', '大总结已承接并分发当前事件小总结，消费旧小总结容器'),
            requiresDistributionProof: false,
            distributionTargets: [],
        }));
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
            return /(身份|稳定|关系|持有|持续经历)/u.test(section);
        });
        if (protectedSection) return [];
        return [{
            ...op('delete-entry', entry.title, entry.uid, '临时条目清理', undefined, '删除', '总结未继续承接该一次性背景人物，且没有身份、稳定能力、关系、持有物或持续经历；插件机械退出'),
            requiresDistributionProof: false,
            distributionTargets: [],
        }];
    });
}
function shouldMarkTemporary(block) {
    // “临时”是插件根据明确的 NPC 类型打出的管理标记，不根据姓名猜测人物重要性。
    if (String(block.type ?? '').trim() !== 'NPC') return false;
    const longTerm = block.sections.some((section) => !section.empty && /(身份|稳定|关系|持有|持续经历)/u.test(section.name));
    return !longTerm;
}
function isFoundationProtected(entry, settings) {
    const definition = settings.keywordDefinitions.find((item) => item.label === '基础设定');
    const names = definition ? [definition.label, ...definition.aliases] : ['基础设定'];
    return entry.keywords.some((keyword) => names.some((name) => (0, util_1.normalizeFact)(keyword) === (0, util_1.normalizeFact)(name)));
}
function linesWithoutCrossSectionDuplicates(block, section) {
    if (!/(持续经历|近期经历)/u.test(section.name)) return section.lines;
    const current = block.sections.filter((item) => /^(当前|当前状态)$/u.test(item.name)).flatMap((item) => item.lines).map(util_1.normalizeFact);
    return section.lines.filter((line) => !current.includes((0, util_1.normalizeFact)(line)));
}

function isMultiValueLabel(label) {
    return /^(持有物|物品|装备|关系|关联对象|关联条目|资源列表|成员)$/u.test(String(label ?? '').trim());
}
function isMultiValueFact(line) {
    const text = String(line ?? '');
    const label = text.match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1]?.trim();
    return (label ? isMultiValueLabel(label) : false)
        || /(?:获得|失去|持有|拥有|建立关系|结为|成为盟友|成为敌人)/u.test(text);
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
    if (/(关键进展|事件进程|事件链|进程|过程|阶段记录|持续经历|近期经历|行动记录|持续变化|世界变化|变化记录)/u.test(section))
        return 'append-chain';
    if (/(当前|状态|位置|持有者|所有者|归属|数量|完整性|可用性|阶段|当前结果|活动状态)/u.test(section))
        return 'replace-by-anchor';
    if (/(完整摘要|当前总结|长期总结|对象定义|基础定义|在场|当前资源|活动关联|世界影响|局部约束|持有|参与|场景|未决|结果|目标)/u.test(section))
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
},"parser":function(module,exports,require){


"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseInformationPoints = parseInformationPoints;
exports.parseStrictExtractionBlocks = parseStrictExtractionBlocks;
exports.parseExtractionWithRecovery = parseExtractionWithRecovery;
exports.canonicalExtractionType = canonicalExtractionType;
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
const COLON_TITLE_PATTERN = /^\s*(?:#{1,6}\s*)?((?:人物|角色|NPC|事件|地点|场景|物品|道具|世界|全局变化|基础设定|总结))\s*[:：]\s*([^：:\n]+?)\s*$/u;
const BULLET_PATTERN = /^\s*(?:[-*]\s+|[•·]\s*|\d+、\s*|\d+[.)]\s+)(.*?)\s*$/u;
const EMPTY_PATTERN = /^\s*(?:无|无变化|无新增事实|无可记录事实|没有)\s*[。.]?\s*$/u;
const EMPTY_VALUE_PATTERN = /^\s*[^：:\n]{1,24}\s*[:：]\s*(?:无|无变化|没有|未知|未说明)\s*[。.]*\s*$/u;
const PLAIN_SECTION_NAMES = new Set([
    '身份', '稳定', '当前', '关系', '持有', '持续经历',
    '定义', '空间结构', '固定资源', '持续变化', '当前状态', '在场', '当前资源', '活动关联', '世界影响', '局部约束',
    '功能', '限制', '目标', '参与', '场景', '阶段', '关键进展', '未决', '结果',
    '时代', '权力', '制度', '公开局势', '世界变化', '持续影响', '别名',
    '固定事实', '近期经历', '事件进程', '变化记录', '最终结果', '关联条目', '关键词', '触发词', '标签', '分类',
]);
const STRICT_ENTRY_PATTERN = /<<<ENTRY:([^:\r\n>]+):([^>\r\n]+)>>>\s*<<<KEYWORDS>>>\s*([\s\S]*?)\s*<<<CONTENT>>>\s*([\s\S]*?)\s*<<<END_ENTRY>>>/gu;
const STRICT_TYPES = new Set(['人物', '场景', '物品', '事件', '世界']);
const STRICT_SECTION_ORDER = {
    人物: ['关键词', '身份', '稳定', '当前', '关系', '持有', '持续经历', '别名'],
    场景: ['关键词', '定义', '空间结构', '固定资源', '持续变化', '当前状态', '在场', '当前资源', '活动关联', '世界影响', '局部约束', '别名'],
    物品: ['关键词', '定义', '功能', '当前', '限制', '持续变化', '别名'],
    事件: ['关键词', '目标', '参与', '场景', '阶段', '关键进展', '未决', '结果', '别名'],
    世界: ['关键词', '时代', '权力', '制度', '公开局势', '世界变化', '持续影响', '别名'],
};
function parseStrictExtractionBlocks(raw) {
    return parseExtractionWithRecovery(raw);
}
function parseExtractionWithRecovery(raw) {
    const diagnostics = { repaired: 0, merged: [], skipped: [], warnings: [], hadInput: false };
    const text = normalizeExtractionEnvelope(raw, diagnostics);
    if (/^(?:无|EMPTY)$/u.test(text.trim())) return attachDiagnostics([], diagnostics);
    diagnostics.hadInput = Boolean(text.trim());
    const starts = [...text.matchAll(/<<<ENTRY\s*[:：]\s*([^:\r\n>]+)\s*[:：]\s*([^>\r\n]+)>>>/giu)];
    if (!starts.length) {
        diagnostics.skipped.push({ title: '未知条目', reason: '缺少 ENTRY 标记', raw: text.slice(0, 600) });
        return attachDiagnostics([], diagnostics);
    }
    const parsedBlocks = [];
    for (let index = 0; index < starts.length; index += 1) {
        const match = starts[index];
        const segmentStart = match.index ?? 0;
        const segmentEnd = index + 1 < starts.length ? (starts[index + 1].index ?? text.length) : text.length;
        const segment = text.slice(segmentStart, segmentEnd);
        const type = canonicalExtractionType(match[1]);
        const name = String(match[2] ?? '').trim().replace(/[<>\r\n]/gu, '').replace(/[：:]+/gu, '·');
        const title = `${type || String(match[1] ?? '').trim()}｜${name || '未命名'}`;
        if (!STRICT_TYPES.has(type)) {
            diagnostics.skipped.push({ title, reason: `不允许的条目类型 ${type || '空'}`, raw: segment.slice(0, 600) });
            continue;
        }
        if (!name || /^未命名$/u.test(name)) {
            diagnostics.skipped.push({ title, reason: '缺少稳定名称', raw: segment.slice(0, 600) });
            continue;
        }
        const keywordsStart = segment.search(/<<<KEYWORDS>>>/iu);
        const contentStart = segment.search(/<<<CONTENT>>>/iu);
        if (contentStart < 0) {
            diagnostics.skipped.push({ title, reason: '缺少 CONTENT 标记', raw: segment.slice(0, 600) });
            continue;
        }
        let keywordText = '';
        if (keywordsStart >= 0 && keywordsStart < contentStart) {
            keywordText = segment.slice(keywordsStart + '<<<KEYWORDS>>>'.length, contentStart);
        } else {
            diagnostics.repaired += 1;
            diagnostics.warnings.push(`${title}缺少 KEYWORDS 标记，已从稳定名称和类型补齐`);
        }
        let contentText = segment.slice(contentStart + '<<<CONTENT>>>'.length);
        const endIndex = contentText.search(/<<<END_ENTRY>>>/iu);
        if (endIndex >= 0) contentText = contentText.slice(0, endIndex);
        else {
            diagnostics.repaired += 1;
            diagnostics.warnings.push(`${title}缺少 END_ENTRY，已按下一条目边界补齐`);
        }
        keywordText = keywordText.replace(/<<<(?:KEYWORDS|CONTENT|END_ENTRY)>>>/giu, '\n');
        contentText = contentText.replace(/<<<(?:KEYWORDS|CONTENT|END_ENTRY)>>>/giu, '\n');
        let keywords = keywordText.replace(/\r/g, '').split('\n')
            .flatMap((line) => stripListMarker(line).split(/[,，]/u))
            .map((item) => item.trim()).filter(Boolean);
        const originalKeywordCount = keywords.length;
        keywords = sanitizeExtractionKeywords(name, type, keywords);
        if (originalKeywordCount > 4) {
            diagnostics.repaired += 1;
            diagnostics.warnings.push(`${title}关键词超过四个，已截取为稳定专名`);
        }
        const sections = recoverSections(type, contentText, diagnostics, title);
        if (!sections.length || !sections.some((section) => section.lines.length)) {
            diagnostics.skipped.push({ title, reason: '正文没有可写入事实', raw: contentText.slice(0, 600) });
            continue;
        }
        parsedBlocks.push({ rawTitle: title, title, type, name, sections, keywords });
    }
    const merged = mergeDuplicateBlocks(parsedBlocks, diagnostics);
    removeCrossEntryDuplicates(merged, diagnostics);
    let usable = merged.filter((block) => block.sections.some((section) => section.lines.length));
    // [MA-SCENE-02] 单轮正文只有一个“正文结束时当前场景”。模型误报多个场景时只保留首个，
    // 其他地点不会被误标为当前场景；历史场景由事件分发或后续实际进入时补全。
    const sceneBlocks = usable.filter((block) => block.type === '场景');
    if (sceneBlocks.length > 1) {
        const currentScene = sceneBlocks[0];
        for (const extra of sceneBlocks.slice(1)) diagnostics.skipped.push({ title: extra.title, reason: `单轮只允许一个当前场景，已保留 ${currentScene.title}` });
        usable = usable.filter((block) => block.type !== '场景' || block === currentScene);
        diagnostics.repaired += sceneBlocks.length - 1;
    }
    if (usable.length > 8) {
        diagnostics.skipped.push(...usable.slice(8).map((block) => ({ title: block.title, reason: '超过单次八条上限' })));
        usable.length = 8;
    }
    return attachDiagnostics(usable, diagnostics);
}
function normalizeExtractionEnvelope(raw, diagnostics) {
    let text = String(raw ?? '')
        .replace(/<think>[\s\S]*?<\/think>/giu, '')
        .replace(/```(?:text|markdown|md)?/giu, '')
        .replace(/[＜﹤]/gu, '<')
        .replace(/[＞﹥]/gu, '>')
        .replace(/<<<\s*ENTRY\s*[：:]/giu, '<<<ENTRY:')
        .replace(/<<<\s*KEYWORDS\s*>>>/giu, '<<<KEYWORDS>>>')
        .replace(/<<<\s*CONTENT\s*>>>/giu, '<<<CONTENT>>>')
        .replace(/<<<\s*END[_\s-]*ENTRY\s*>>>/giu, '<<<END_ENTRY>>>')
        .replace(/\r/g, '')
        .trim();
    const first = text.search(/<<<ENTRY\s*:/iu);
    if (first > 0) {
        diagnostics.repaired += 1;
        diagnostics.warnings.push('已移除第一条目之前的解释文字');
        text = text.slice(first);
    }
    const lastEnd = text.lastIndexOf('<<<END_ENTRY>>>');
    if (lastEnd >= 0 && text.slice(lastEnd + '<<<END_ENTRY>>>'.length).trim()) {
        diagnostics.repaired += 1;
        diagnostics.warnings.push('已移除最后条目之后的解释文字');
        text = text.slice(0, lastEnd + '<<<END_ENTRY>>>'.length);
    }
    return text.trim();
}
function canonicalExtractionType(value) {
    const raw = String(value ?? '').trim();
    return ({ 角色: '人物', NPC: '人物', 地点: '场景', 地区: '场景', 区域: '场景', 场所: '场景', 当前场景: '场景', 道具: '物品', 装备: '物品', 事件链: '事件', 全局变化: '世界', 世界变化: '世界', 当前局势: '世界' })[raw] ?? raw;
}
function recoverSections(type, content, diagnostics, title) {
    const expected = STRICT_SECTION_ORDER[type] ?? [];
    const parsed = parseEntrySections(content);
    const aliases = new Map();
    for (const rawName of parsed.order) {
        const canonical = canonicalExtractionSection(type, rawName);
        if (!canonical || canonical === '关键词') continue;
        if (!expected.includes(canonical)) {
            diagnostics.repaired += 1;
            diagnostics.skipped.push({ title, reason: `已丢弃未规划小标题【${rawName}】` });
            continue;
        }
        const current = aliases.get(canonical) ?? [];
        current.push(...(parsed.values[rawName] ?? []));
        aliases.set(canonical, current);
        if (canonical !== rawName) diagnostics.repaired += 1;
    }
    if (!parsed.order.length) {
        const loose = String(content ?? '').split('\n').map((line) => stripListMarker(line).trim()).filter((line) => line && !/^<<<.+>>>$/u.test(line));
        if (loose.length) {
            const fallback = type === '事件' ? '关键进展' : type === '场景' ? '当前状态' : type === '世界' ? '公开局势' : '当前';
            aliases.set(fallback, loose);
            diagnostics.repaired += 1;
            diagnostics.warnings.push(`${title}缺少小标题，已归入【${fallback}】`);
        }
    }
    const sections = [];
    for (const name of expected.filter((item) => item !== '关键词')) {
        let lines = (0, util_1.unique)((aliases.get(name) ?? [])
            .map(sanitizeExtractionLine)
            .filter((line) => line && !EMPTY_PATTERN.test(line) && !EMPTY_VALUE_PATTERN.test(line) && !/完整事实句|稳定名称|甲与乙/u.test(line)));
        const maxLines = sectionLineLimit(type, name);
        if (lines.length > maxLines) {
            diagnostics.repaired += lines.length - maxLines;
            diagnostics.warnings.push(`${title}【${name}】超过${maxLines}行，已保留前${maxLines}行`);
            lines = lines.slice(0, maxLines);
        }
        sections.push({ name, lines, empty: lines.length === 0 });
    }
    return sections;
}
function canonicalExtractionSection(type, value) {
    const raw = String(value ?? '').replace(/\s+/gu, '').trim();
    const common = { 其他名称: '别名', 称号: '别名' };
    const legacy = {
        人物: { 固定事实: '稳定', 身份定义: '身份', 当前状态: '当前', 近期经历: '持续经历', 变化记录: '持续经历' },
        场景: { 固定事实: '定义', 地点属性: '定义', 稳定空间: '空间结构', 局部变化: '持续变化', 变化记录: '持续变化' },
        物品: { 固定事实: '定义', 对象定义: '定义', 当前状态: '当前', 变化记录: '持续变化' },
        事件: { 当前状态: '阶段', 事件状态: '阶段', 事件进程: '关键进展', 最终结果: '结果', 当前结果: '结果', 结束结论: '结果' },
        世界: { 当前状态: '公开局势', 变化记录: '世界变化', 全局状态: '公开局势' },
    };
    return legacy[type]?.[raw] ?? common[raw] ?? raw;
}
function mergeDuplicateBlocks(blocks, diagnostics) {
    const map = new Map();
    for (const block of blocks) {
        const key = (0, util_1.normalizeTitle)(block.title);
        const current = map.get(key);
        if (!current) {
            map.set(key, structuredClone(block));
            continue;
        }
        diagnostics.repaired += 1;
        diagnostics.merged.push(block.title);
        current.keywords = sanitizeExtractionKeywords(current.name, current.type, [...current.keywords, ...block.keywords]).slice(0, 4);
        for (const incoming of block.sections) {
            const target = current.sections.find((section) => section.name === incoming.name);
            if (!target) current.sections.push(structuredClone(incoming));
            else {
                target.lines = mergeSectionLines(incoming.name, target.lines, incoming.lines);
                target.empty = target.lines.length === 0;
            }
        }
    }
    return [...map.values()];
}
function mergeSectionLines(section, oldLines, newLines) {
    const replaceBySlot = /^(当前|当前状态|关系|阶段|时代|权力|制度|公开局势|持续影响)$/u.test(section);
    if (!replaceBySlot) return (0, util_1.unique)([...oldLines, ...newLines]);
    const output = [...oldLines];
    const slots = new Map();
    output.forEach((line, index) => { const slot = extractionSlot(line); if (slot) slots.set(slot, index); });
    for (const line of newLines) {
        const slot = extractionSlot(line);
        if (slot && slots.has(slot)) output[slots.get(slot)] = line;
        else {
            if (slot) slots.set(slot, output.length);
            output.push(line);
        }
    }
    return (0, util_1.unique)(output);
}
function extractionSlot(line) {
    return String(line ?? '').match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1]?.replace(/\s+/gu, '') ?? '';
}
function removeCrossEntryDuplicates(blocks, diagnostics) {
    const owners = new Map();
    for (const block of blocks) {
        for (const section of block.sections) {
            if (['关联条目', '别名'].includes(section.name)) continue;
            section.lines = section.lines.filter((line) => {
                const normalized = (0, util_1.normalizeFact)(line);
                const core = (0, util_1.normalizeFact)(line.replace(/^\s*[^：:]{1,24}\s*[：:]\s*/u, ''));
                const key = core || normalized;
                if (!key) return false;
                const score = factOwnershipScore(block.type, section.name, line);
                const existing = owners.get(key);
                if (!existing) {
                    owners.set(key, { block, section, line, score });
                    return true;
                }
                if (score > existing.score) {
                    existing.section.lines = existing.section.lines.filter((item) => item !== existing.line);
                    owners.set(key, { block, section, line, score });
                    diagnostics.repaired += 1;
                    diagnostics.warnings.push(`重复事实改归属到 ${block.title}`);
                    return true;
                }
                diagnostics.repaired += 1;
                diagnostics.skipped.push({ title: block.title, reason: `与${existing.block.title}重复，已保留直接归属`, fact: line });
                return false;
            });
            section.empty = section.lines.length === 0;
        }
    }
}
function factOwnershipScore(type, section, line) {
    let score = 10;
    if (type === '事件' && /(目标|参与|阶段|关键进展|未决|结果|因果)/u.test(`${section}${line}`)) score += 40;
    if (type === '人物' && /(身份|稳定|身体|位置|目标|关系|持有|经历)/u.test(`${section}${line}`)) score += 35;
    if (type === '物品' && /(持有|位置|状态|完整|功能|限制|物品)/u.test(`${section}${line}`)) score += 35;
    if (type === '场景' && /(定义|空间|资源|在场|约束|控制|环境|场景)/u.test(`${section}${line}`)) score += 38;
    if (type === '世界' && /(时代|权力|制度|公开|世界|跨场景|地区)/u.test(`${section}${line}`)) score += 36;
    return score;
}

const EXTRACTION_GENERIC_KEYWORDS = new Set(['人物','角色','npc','场景','地点','事件','活动','物品','道具','世界','当前','状态','关系','房间','区域','地方','男人','女人','男孩','女孩','少女','主角','配角','当前局势','世界局势','世界状态','世界变化']);
function sanitizeExtractionKeywords(name, type, values) {
    const output = [];
    for (const value of (0, util_1.unique)([name, ...(values ?? [])])) {
        const text = String(value ?? '').trim();
        const normalized = (0, util_1.normalizeFact)(text);
        if (!text || normalized === (0, util_1.normalizeFact)(type) || EXTRACTION_GENERIC_KEYWORDS.has(normalized)) continue;
        if (normalized !== (0, util_1.normalizeFact)(name) && /(?:男人|女人|男孩|女孩|少女|青年|老人|村民|士兵|角色|人物)$/u.test(normalized)) continue;
        if (output.some((item) => (0, util_1.normalizeFact)(item) === normalized)) continue;
        output.push(text);
        if (output.length >= 4) break;
    }
    return output.length ? output : [String(name ?? '').trim()].filter(Boolean);
}
function sanitizeExtractionLine(value) {
    const line = normalizePointLine(value).slice(0, 180).trim();
    if (!line) return '';
    if (/(?:供|给).{0,6}(?:AI|模型).{0,8}(?:参考|推测|判断)|(?:AI|模型)(?:可以|可|应当|应该)|可能意味着|建议后续|便于后续|用于推理|剧情建议/u.test(line)) return '';
    return line;
}
function sectionLineLimit(type, section) {
    if (type === '场景' && /^(空间结构|固定资源|持续变化)$/u.test(section)) return 8;
    if (/^(在场|当前资源|活动关联|世界影响|局部约束|参与|未决|持有)$/u.test(section)) return 6;
    return 6;
}
function attachDiagnostics(blocks, diagnostics) {
    Object.defineProperty(blocks, 'diagnostics', { value: diagnostics, enumerable: false, configurable: true });
    return blocks;
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
},"prompts":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractionPrompts = extractionPrompts;
exports.auditPrompts = auditPrompts;
exports.revisionPrompts = revisionPrompts;
exports.summaryPrompts = summaryPrompts;
exports.duplicatePrompts = duplicatePrompts;
exports.extractionRepairPrompts = extractionRepairPrompts;
exports.migrationPrompts = migrationPrompts;
exports.keywordTemplate = keywordTemplate;
const util_1 = require("./util");

function auditPrompts(settings, playerText, assistantText, characterCard = '', options = {}) {
    const compact = options.compact === true;
    const system = `你是 Mirror Abyss 正文审核脚本。

你的职责只有一个：判断 AI 生成文本是否明确违反用户设定。
你不是作者，不得改写、续写、补充背景、推测未来或优化文风。

检查：
1. 玩家控制：不得替玩家决定动作、语言、思考、情绪和选择。
2. 知识限制：角色不得突然知道隐藏事实。
3. 世界规则：不得违反能力、种族、时间线和既有事实。
4. 角色一致性：不得无依据改变身份、性格、能力和目标。

返回格式：无明确违规只输出 PASS；存在明确违规时输出 FAIL，随后列出简短原因。禁止输出修正版正文。`;
    const user = `审核规则：
${clipText(settings.auditPrompt || '（无）', compact ? 2200 : 3500)}

角色设定：
${clipText(characterCard || '（无）', compact ? 2200 : 3500)}

玩家输入：
${clipText(playerText || '（空）', compact ? 1500 : 2000)}

需要审核正文：
${clipText(assistantText, compact ? 10000 : 14000)}`;
    return { system, user };
}

function revisionPrompts(settings, playerText, assistantText, issues, options = {}) {
    const compact = options.compact === true;
    const issueLimit = compact ? 5 : 10;
    const issueChars = compact ? 160 : 260;
    const system = `你是 Mirror Abyss 正文修正脚本。

只修正审核指出的明确违规部分，保留原剧情方向、事件结果、人物关系、角色身份、叙事视角和合规内容。
禁止添加新事件、删除已有事件、改变人物目标、修改世界规则、替玩家决定行动、续写或输出解释。
你的输出只能是可直接替换原消息的完整正文。

用户附加修正规则：
${clipText(settings.revisionPrompt || '（无）', compact ? 1500 : 3000)}`;
    const user = `违规原因：
${issues.slice(0, issueLimit).map((item) => `- ${clipText(item, issueChars)}`).join('\n')}

玩家输入：
${clipText(playerText || '（空）', compact ? 1600 : 3000)}

原正文：
${clipText(assistantText, compact ? 15000 : 20000)}`;
    return { system, user };
}

function extractionPrompts(settings, playerText, assistantText, relevant, options = {}) {
    const compact = options.compact === true;
    const contextEntries = relevant.slice(0, compact ? 3 : 5);
    const existing = contextEntries.map((entry) => entryForPrompt(entry, compact ? 420 : 650)).join('\n\n');
    const custom = clipText(settings.extractionPrompt.trim(), compact ? 800 : 1600);
    const system = `你是 Mirror Abyss 严格语法事实提取器。

任务：把审核后的最终正文转为精简世界书更新。只记录已经成立、仍会影响后续的事实；不续写、不解释、不评价、不预测。

【只允许五类】
1. 人物：身份、稳定能力、当前状态、该人物自身的关系、关键持有物、持续经历。
2. 场景：同一稳定地点持续更新同一条目；保存稳定空间知识、当前局部条件和关联名称。
3. 物品：会持续存在且影响后续的关键物品。
4. 事件：尚在发展的多对象过程、必要因果节点、未决事项和结果。
5. 世界：跨多个场景持续生效的世界整体变化。

关系不得单独建条目，写入对应人物的【关系】。
地点不得单独建条目，写入对应【场景】。
组织、制度、政权、战争和公开局势只有影响跨越多个场景时才写入【世界】。

【事实分流】
- 已经成立且宿主明确的事实，直接写人物、场景、物品或世界。
- 事件只保存过程与因果；人物伤势、物品位置、场景损坏和世界变化应同时直接进入各自宿主，但不得复制同一句长叙述。
- 场景不保存事件流水。场景稳定知识持续补全；当前栏目必须给出正文结束时的完整快照。
- 单轮最多输出一个场景条目，并把它放在第一条；它必须是正文结束时人物实际所在的当前场景。只被提及但未进入的地点不得另建场景条目。
- 同一事实只能有一个主要宿主。其他条目只保留必要名称或因果联系。

【内容限制】
- 禁止“供AI参考”“可据此推测”“可能意味着”“建议后续”等解释。
- 禁止推测、隐藏心理、未来结果、未实现愿望、纯气氛、普通动作、对白全文和无持续价值背景物。
- 每条事实一行，尽量不超过80字；每个小标题最多6行。
- 不写空栏目，不写“- 无”。
- 每条1至4个关键词；第一项必须是稳定名称；其余只能是专名或唯一别名，禁止“人物、角色、场景、事件、物品、世界、当前、活动”等泛词。
- 单次最多8条；其中场景最多1条。

【唯一允许的外层语法】
<<<ENTRY:类型:稳定名称>>>
<<<KEYWORDS>>>
- 稳定名称
- 唯一别名
<<<CONTENT>>>
固定小标题正文
<<<END_ENTRY>>>

多个条目连续输出，条目间只空一行。禁止JSON、代码块、序号、解释、前言、后记和标记外文本。没有可记录事实时只输出“无”。

【人物正文固定顺序】
【身份】职业、种族、组织或家庭身份
【稳定】稳定能力、长期特征、持续限制
【当前】位置、身体、目标、立场等明确状态槽
【关系】对方名称：该人物自身的长期关系或当前立场
【持有】当前关键物品完整列表
【持续经历】产生后续影响的经历
【别名】

【场景正文固定顺序】
【定义】地点是什么、位置、用途或归属
【空间结构】入口、出口、区域连接、障碍和影响行动的布局
【固定资源】长期存在且可利用的资源
【持续变化】已确认的新发现、永久损坏、控制权或访问条件变化
【当前状态】时间、环境、控制、危险等状态槽
【在场】正文结束时确认在场的人物完整列表
【当前资源】正文结束时可使用、争夺或影响结果的关键物品完整列表
【活动关联】仍在本场运行的事件名称完整列表
【世界影响】直接作用于本场的世界整体变化名称
【局部约束】模型不能忽略的可见限制完整列表
【别名】

【物品正文固定顺序】
【定义】稳定身份和识别特征
【功能】已确认用途或能力
【当前】位置、持有者、状态、数量、完整性等状态槽
【限制】使用、访问或能力限制
【持续变化】会影响后续的变化
【别名】

【事件正文固定顺序】
【目标】各方目标
【参与】参与者完整列表
【场景】事件涉及的场景名称
【阶段】阶段：开始/进行中/暂停/结束
【关键进展】只写改变目标、阶段或因果的节点
【未决】尚未解决的明确事项完整列表
【结果】形成明确结果后填写
【别名】

【世界正文固定顺序】
【时代】长期时代条件
【权力】地区或组织控制格局
【制度】跨场景执行的制度与公开规则
【公开局势】公众可知的整体状态
【世界变化】重大且持续的整体变化
【持续影响】明确对象或区域：持续影响
【别名】

人物【当前】、人物【关系】、物品【当前】、事件【阶段】和场景【当前状态】必须使用“状态槽：内容”形式。${custom ? `

用户附加要求：
${custom}` : ''}`;
    const user = `玩家本轮输入：
${clipText(playerText || '（空）', compact ? 1300 : 2200)}

AI最终正文：
${clipText(assistantText, compact ? 9000 : 13000)}

可能相关的既有世界书条目：
${existing || '（无）'}

只输出本轮新事实或需要替换的完整当前快照。若正文明确存在当前场景，场景条目必须排在第一条。稳定栏目只补充新发现或修正，不得重抄已有内容。`;
    return { system, user };
}

function summaryPrompts(kind, settings, entries, subject, recentConversation = '', options = {}) {
    const isSmall = kind === 'small';
    const compact = options.compact === true;
    const custom = clipText((isSmall ? settings.smallSummaryPrompt : settings.largeSummaryPrompt).trim(), compact ? 1200 : 2500);
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
- 不得输出 UID、关键词、删除、退出、归档或任何操作命令；只允许在【分发事实】中按指定四段格式列出事实归属。
- 事件只有明确结束且形成可陈述结果时，才在分发事实中写入“阶段：结束”或最终结果。

严格输出：
总结｜当前事件

【当前情况】

内容

【关键状态】

内容

【未解决事项】

内容

【分发事实】

- 类型｜稳定名称｜小标题｜完整事实句

“分发事实”只写需要更新回人物、场景、物品、事件或世界条目的事实；关系写入人物【关系】，地点写入场景。不得写操作命令。没有分发事实时写“- 无”。

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

不得输出 UID、关键词、删除、退出、归档或任何操作命令；只允许在【分发事实】中按指定四段格式列出事实归属。
长期未出现不等于死亡、结束或退出。

严格输出：
总结｜世界历史

【长期变化】

内容

【重要事件】

内容

【长期关系】

内容

【分发事实】

- 类型｜稳定名称｜小标题｜完整事实句

“分发事实”用于把永久变化、长期关系、事件结果和所有权变化回写到人物、场景、物品、事件或世界；长期关系写入人物【关系】。不得写删除、状态字段或操作命令。没有分发事实时写“- 无”。

没有可总结内容时只输出“无”。${custom ? `\n\n用户附加要求：\n${custom}` : ''}`;
    const recent = isSmall ? `\n\n最近聊天：\n${clipText(recentConversation || '（无）', compact ? 9000 : 14000)}` : '';
    const user = `总结范围：
${subject || (isSmall ? '当前事件' : '世界历史')}${recent}

相关世界书：
${entries.slice(0, compact ? (isSmall ? 8 : 12) : (isSmall ? 16 : 24)).map((entry) => entryForPrompt(entry, compact ? 550 : 900)).join('\n\n') || '（无）'}`;
    return { system, user };
}

function extractionRepairPrompts(raw, options = {}) {
    const compact = options.compact === true;
    const system = `你是 Mirror Abyss 提取格式修复器。
只修复给定提取结果的语法、重复条目和事实归属，不得阅读原剧情，不得新增、扩写或推测事实。
必须使用 <<<ENTRY:类型:稳定名称>>>、<<<KEYWORDS>>>、<<<CONTENT>>>、<<<END_ENTRY>>>。
允许类型：人物、场景、物品、事件、世界。关系必须并入人物，地点必须并入场景。
同名条目必须合并；同一事实只能保留在责任最直接的一个条目中；无法修复的片段删除。
禁止解释、JSON和代码块。没有可保留条目时只输出“无”。`;
    const user = `需要修复的提取结果：
${clipText(String(raw ?? ''), compact ? 8000 : 12000)}`;
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

function entryForPrompt(entry, contentLimit = 1000) {
    const keywords = (entry.keywords ?? []).filter((item) => !(0, util_1.isUidKeyword)(item));
    return `标题：${entry.title}\n关键词：${keywords.join('、') || '无'}\n正文：\n${clipText(entry.content || '（空）', contentLimit)}`;
}

// [MA-PROMPT-01] 保留文本开头与结尾，避免简单截断丢失结论或最终状态。
function clipText(value, maxChars) {
    const text = String(value ?? '');
    if (!Number.isFinite(maxChars) || maxChars <= 0 || text.length <= maxChars) return text;
    const marker = '\n[中间内容已按请求预算省略]\n';
    const remaining = Math.max(0, maxChars - marker.length);
    const head = Math.ceil(remaining * 0.62);
    const tail = Math.floor(remaining * 0.38);
    return `${text.slice(0, head)}${marker}${text.slice(text.length - tail)}`;
}
},"recall-policy":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRecallPlan = buildRecallPlan;
exports.sceneStageMap = sceneStageMap;
exports.isSceneType = isSceneType;
exports.isWorldType = isWorldType;
exports.isRoleType = isRoleType;
exports.isFoundationEntry = isFoundationEntry;
exports.sanitizeRecallKeywords = sanitizeRecallKeywords;
const semantic_1 = require("./semantic");
const util_1 = require("./util");

// [MA-RECALL-01] 召回策略是纯函数：只读取世界书条目，返回原生字段规划，不执行任何写入。
const GENERIC_KEYWORDS = new Set([
    '人物', '角色', 'npc', '物品', '道具', '装备', '事件', '活动', '场景', '地点', '世界', '当前', '状态',
    '关系', '男人', '女人', '男孩', '女孩', '少女', '房间', '区域', '地方', '目标', '任务', '未知', '无', '当前局势', '世界局势', '世界状态', '世界变化',
]);

function isSceneType(type) {
    return ['场景', '时空'].includes(String(type ?? '').trim());
}
function isWorldType(type) {
    return ['世界', '全局变化'].includes(String(type ?? '').trim());
}
function isRoleType(type) {
    return ['人物', '角色', 'NPC'].includes(String(type ?? '').trim());
}

function isFoundationEntry(entry, settings) {
    if (!entry) return false;
    if (String(entry.type ?? '') === '基础设定') return true;
    const definition = settings?.keywordDefinitions?.find?.((item) => item.label === '基础设定');
    const names = definition ? [definition.label, ...(definition.aliases ?? [])] : ['基础设定'];
    return (entry.keywords ?? []).some((keyword) => names.some((name) => (0, util_1.normalizeFact)(keyword) === (0, util_1.normalizeFact)(name)));
}

// 场景阶段由“最后一次作为实际当前场景被正文提取”的时间决定；普通编辑与总结分发不会抢占当前场景。
function sceneStageMap(entries) {
    const scenes = (entries ?? [])
        .filter((entry) => entry?.managed && isSceneType(entry.type) && !entry.activation?.disabled)
        .sort((left, right) => sceneActivityTime(right) - sceneActivityTime(left) || Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
    const output = new Map();
    scenes.forEach((entry, index) => output.set(String(entry.uid), index === 0 ? 'current' : index === 1 ? 'previous' : 'remote'));
    return output;
}

function sceneActivityTime(entry) {
    const extension = entry?.raw?.extensions?.mirrorAbyssInfoPoint;
    const activeAt = Number(extension?.sceneLastActiveAt || 0);
    return activeAt || Number(entry?.updatedAt || 0);
}

function buildRecallPlan(entries, settings, focusUid = '') {
    const stages = sceneStageMap(entries);
    const profiles = new Map();
    for (const entry of entries ?? []) {
        const focus = String(focusUid || '') ? String(entry.uid) === String(focusUid) : entry.focus === true;
        profiles.set(String(entry.uid), profileFor(entry, settings, stages.get(String(entry.uid)) || '', focus));
    }
    return { profiles, sceneStages: stages };
}

function profileFor(entry, settings, sceneStage, focus) {
    const type = String(entry.type ?? '');
    const tier = String(entry.memoryTier ?? entry.raw?.extensions?.mirrorAbyssInfoPoint?.memoryTier ?? 'background');
    const baseOrder = ({ 场景: 700, 时空: 700, 事件: 680, 世界: 610, 全局变化: 610, 人物: 520, 角色: 520, NPC: 500, 物品: 500 })[type] ?? 400;

    if (isFoundationEntry(entry, settings)) {
        return profile('基础设定', 'core', 'foundation', 'none', true, false, true, true, 0, 860, 0, null);
    }
    if (focus) {
        return profile('长期焦点', 'core', 'focus', 'none', true, false, true, true, 0, 840, 1, null);
    }
    if (entry.title === '总结｜当前事件') {
        return profile('小总结向量', 'recent-summary', 'summary-container', 'vector', false, true, true, true, 6, 450, 4, null, true);
    }
    if (entry.title === '总结｜世界历史') {
        return profile('大总结向量', 'historical-summary', 'summary-container', 'vector', false, true, true, true, 8, 360, 4, null, true);
    }
    if (isSceneType(type)) {
        if (sceneStage === 'current') return profile('当前场景常驻', 'active', 'scene-current', 'none', true, false, false, true, 2, 760, 4, null);
        if (sceneStage === 'previous') return profile('上一场景关键词', 'recent', 'scene-previous', 'keyword', false, false, false, true, 5, 620, 4, 4);
        return profile('远期场景向量', 'historical', 'scene-remote', 'vector', false, true, false, true, 8, 380, 4, null, true);
    }
    if (type === '事件') {
        if ((0, semantic_1.isEventClosed)(entry)) return profile('历史事件向量', 'closed', 'event-history', 'vector', false, true, true, true, 8, 340, 4, null, true);
        return profile('活动事件关键词', 'active', 'event-active', 'keyword', false, false, true, false, 4, baseOrder, 4, 4);
    }
    if (isWorldType(type)) {
        return profile('世界变化关联', tier === 'historical' ? 'long-term' : 'active', 'world-state', 'keyword', false, false, false, false, 6, baseOrder, 4, 6);
    }
    if (isRoleType(type)) {
        const longTerm = tier === 'long-term';
        return profile(longTerm ? '长期角色关键词' : '角色关键词', longTerm ? 'long-term' : tierLifecycle(tier), 'role-object', 'keyword', false, false, true, false, longTerm ? 0 : 4, baseOrder, longTerm ? 1 : 4, longTerm ? 6 : 4);
    }
    if (type === '物品') {
        return profile('物品关键词', tierLifecycle(tier), 'item-object', 'keyword', false, false, true, false, 4, baseOrder, 4, 4);
    }
    // 旧版遗留类型不再扩散，也不默认开启向量；等待后续人工或总结迁移。
    return profile('旧类型关键词终点', tierLifecycle(tier), 'legacy-object', 'keyword', false, false, true, false, 5, baseOrder, 4, 4);
}

function profile(name, lifecycle, semanticRole, keywordMode, constant, vectorized, preventRecursion, excludeRecursion, depth, order, position, scanDepth, pureVector = false) {
    return {
        name,
        lifecycle,
        semanticRole,
        keywordMode,
        pureVector,
        constant,
        vectorized,
        preventRecursion,
        excludeRecursion,
        delayUntilRecursion: 0,
        depth,
        order,
        position,
        scanDepth,
    };
}

function tierLifecycle(value) {
    return ({ core: 'core', active: 'active', recent: 'recent', 'long-term': 'long-term', historical: 'historical', background: 'background' })[String(value ?? '')] ?? 'background';
}

// [MA-RECALL-02] 关键词只保留稳定专名；常驻与纯向量条目会把该列表暂存在扩展字段中，而不是继续参与触发。
function sanitizeRecallKeywords(name, values, type = '', max = 4) {
    const normalizedName = String(name ?? '').trim();
    const normalizedType = (0, util_1.normalizeFact)(String(type ?? ''));
    const candidates = (0, util_1.unique)([normalizedName, ...(values ?? [])]);
    const output = [];
    for (const candidate of candidates) {
        const text = String(candidate ?? '').trim();
        const normalized = (0, util_1.normalizeFact)(text);
        if (!text || (0, util_1.isUidKeyword)(text)) continue;
        if (normalized === normalizedType) continue;
        if (GENERIC_KEYWORDS.has(normalized)) continue;
        if (normalized !== (0, util_1.normalizeFact)(normalizedName) && /(?:男人|女人|男孩|女孩|少女|青年|老人|村民|士兵|角色|人物)$/u.test(normalized)) continue;
        if (normalized.length < 2 && normalized !== (0, util_1.normalizeFact)(normalizedName)) continue;
        if (output.some((item) => (0, util_1.normalizeFact)(item) === normalized)) continue;
        output.push(text);
        if (output.length >= Math.max(1, Number(max || 4))) break;
    }
    if (!output.length && normalizedName) output.push(normalizedName);
    return output;
}
},"revision":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevisionService = void 0;
exports.parseRevisionResult = parseRevisionResult;
const parser_1 = require("./parser");
const prompts_1 = require("./prompts");
const model_request_1 = require("./model-request");

class RevisionService {
    constructor(host, getSettings) {
        this.host = host;
        this.getSettings = getSettings;
    }

    /**
     * [MA-REVISION-01] 修正服务只生成完整替换文本，不直接修改聊天。
     * 这样正文落地仍由 HostAdapter 单点负责，避免审核与宿主写入高耦合。
     */
    async revise(settings, snapshot, issues) {
        this.host.assertSnapshot(snapshot, this.getSettings());
        const prompt = (0, prompts_1.revisionPrompts)(settings, snapshot.playerText, snapshot.assistantText, issues);
        const raw = await (0, model_request_1.callModel)({
            host: this.host,
            stage: 'revision',
            prompt,
            fallbackPrompt: () => (0, prompts_1.revisionPrompts)(settings, snapshot.playerText, snapshot.assistantText, issues, { compact: true }),
            settings,
            snapshot,
            profileId: settings.revisionProfileId,
            sourceText: snapshot.assistantText,
        });
        this.host.assertSnapshot(snapshot, this.getSettings());
        const revisedText = parseRevisionResult(raw);
        if (revisedText === snapshot.assistantText)
            throw new Error('修正模型返回的正文与原正文完全相同');
        return revisedText;
    }
}
exports.RevisionService = RevisionService;

/** [MA-REVISION-02] 只接受可直接替换的完整自然正文。 */
function parseRevisionResult(raw) {
    const text = (0, parser_1.sanitizeModelText)(raw).trim();
    if (!text) throw new Error('修正模型没有返回完整正文');
    if (/^\s*(?:以下是|这是|修正版|修改后|完整修正版|修改说明|修改建议|局部补丁)\s*[：:]/u.test(text)
        || /^\s*【\s*(?:结论|问题|违反规则|修正版正文|修改说明)\s*】/u.test(text))
        throw new Error('修正模型返回了解释或包装标题，不是纯完整正文');
    if (/^(?:将|把).{0,80}(?:改为|替换为|删除)/u.test(text) && text.split('\n').length <= 3)
        throw new Error('修正模型返回了局部补丁，不是完整正文');
    return text;
}
},"semantic":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.describeEntry = describeEntry;
exports.isEventClosed = isEventClosed;
exports.countCriticalChanges = countCriticalChanges;
const util_1 = require("./util");

function describeEntry(entry, settings, currentContinuityUids = new Set(), focus = false) {
    const extension = entry?.raw?.extensions?.mirrorAbyssInfoPoint ?? {};
    const foundation = entry.type === '基础设定' || isFoundationEntry(entry, settings);
    const storedLifecycle = String(extension.lifecycle ?? entry.lifecycle ?? '');
    const storedRole = String(extension.semanticRole ?? entry.semanticRole ?? '');
    if (storedLifecycle || storedRole) {
        return { lifecycle: storedLifecycle || 'background', semanticRole: storedRole || 'object' };
    }
    if (foundation || focus) return { lifecycle: 'core', semanticRole: foundation ? 'foundation' : 'focus' };
    if (entry.title === '总结｜当前事件') return { lifecycle: 'recent-summary', semanticRole: 'summary-container' };
    if (entry.title === '总结｜世界历史') return { lifecycle: 'historical-summary', semanticRole: 'summary-container' };
    if (entry.type === '事件') return { lifecycle: isEventClosed(entry) ? 'closed' : 'active', semanticRole: isEventClosed(entry) ? 'event-history' : 'event-active' };
    if (['场景', '时空'].includes(entry.type)) return { lifecycle: currentContinuityUids.has(entry.uid) ? 'active' : 'historical', semanticRole: 'scene-container' };
    if (['世界', '全局变化'].includes(entry.type)) return { lifecycle: 'active', semanticRole: 'world-state' };
    return { lifecycle: tierName(entry.memoryTier), semanticRole: /^(人物|角色|NPC)$/u.test(entry.type) ? 'role-object' : 'object' };
}

function tierName(value) {
    return ({
        core: 'core',
        active: 'active',
        recent: 'recent',
        'recent-summary': 'recent-summary',
        'long-term': 'long-term',
        historical: 'historical',
        'historical-summary': 'historical-summary',
        background: 'background',
    })[String(value ?? '')] ?? 'background';
}

function isEventClosed(entry) {
    if (!entry || entry.type !== '事件') return false;
    const current = [...(entry.sections?.values?.['阶段'] ?? []), ...(entry.sections?.values?.['当前状态'] ?? [])];
    const result = [...(entry.sections?.values?.['结果'] ?? []), ...(entry.sections?.values?.['最终结果'] ?? [])];
    const text = `${current.join('\n')}\n${result.join('\n')}\n${entry.content ?? ''}`;
    if (/阶段\s*[：:]\s*(?:结束|已结束|完成|已完成|关闭|已关闭)/u.test(text)) return true;
    if (/(?:事件|任务|追逐|冲突|调查|战斗|谈判|仪式)(?:已经|已|正式)?(?:结束|完成|关闭)/u.test(text)) return true;
    return result.some((line) => line && !/^(?:无|未知|未说明|尚未结束)/u.test(String(line).trim()));
}


function countCriticalChanges(plan) {
    const keys = new Set();
    for (const operation of plan?.operations ?? []) {
        if (!operation || operation.kind === 'noop' || operation.kind === 'merge-keywords' || operation.kind === 'merge-titles') continue;
        const section = String(operation.section ?? '');
        const important = operation.kind === 'create-entry'
            || operation.kind === 'delete-entry'
            || operation.kind === 'replace-line'
            || operation.kind === 'replace-section'
            || /(身份|稳定|当前|当前状态|关系|持有|持续经历|定义|空间结构|持续变化|在场|当前资源|活动关联|局部约束|目标|参与|阶段|关键进展|未决|结果|时代|权力|制度|公开局势|世界变化|持续影响)/u.test(section);
        if (!important) continue;
        keys.add(`${operation.title}|${section}|${operation.kind}`);
    }
    return keys.size;
}

function isFoundationEntry(entry, settings) {
    const definition = settings?.keywordDefinitions?.find?.((item) => item.label === '基础设定');
    const names = definition ? [definition.label, ...(definition.aliases ?? [])] : ['基础设定'];
    return (entry.keywords ?? []).some((keyword) => names.some((name) => (0, util_1.normalizeFact)(keyword) === (0, util_1.normalizeFact)(name)));
}
},"settings":function(module,exports,require){


"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsStore = exports.DEFAULT_SETTINGS = exports.DEFAULT_LARGE_SUMMARY_PROMPT = exports.DEFAULT_SMALL_SUMMARY_PROMPT = exports.DEFAULT_EXTRACTION_PROMPT = exports.DEFAULT_REVISION_PROMPT = exports.DEFAULT_AUDIT_PROMPT = exports.DEFAULT_KEYWORDS = void 0;
exports.parseSettings = parseSettings;
const constants_1 = require("./constants");
const util_1 = require("./util");
const COMMON_ALIASES = { key: 'aliases', label: '别名', policy: 'merge-keywords' };
exports.DEFAULT_KEYWORDS = [
    keyword('scene', '场景', '稳定空间知识、当前局部条件与关联入口；同一地点持续补全同一条目。', ['当前场景'], false, [
        { key: 'definition', label: '定义', policy: 'semantic-upsert' },
        { key: 'space', label: '空间结构', policy: 'semantic-upsert' },
        { key: 'fixedResources', label: '固定资源', policy: 'semantic-upsert' },
        { key: 'persistentChanges', label: '持续变化', policy: 'append-chain' },
        { key: 'current', label: '当前状态', policy: 'replace-by-anchor' },
        { key: 'present', label: '在场', policy: 'replace-section' },
        { key: 'currentResources', label: '当前资源', policy: 'replace-section' },
        { key: 'activities', label: '活动关联', policy: 'replace-section' },
        { key: 'worldImpact', label: '世界影响', policy: 'replace-section' },
        { key: 'constraints', label: '局部约束', policy: 'replace-section' },
        COMMON_ALIASES,
    ], 700, false),
    keyword('character', '人物', '角色身份、稳定能力、当前状态、角色自身关系、关键持有物与持续经历。', ['角色', 'NPC'], false, [
        { key: 'identity', label: '身份', policy: 'semantic-upsert' },
        { key: 'stable', label: '稳定', policy: 'semantic-upsert' },
        { key: 'current', label: '当前', policy: 'replace-by-anchor' },
        { key: 'relations', label: '关系', policy: 'replace-by-anchor' },
        { key: 'holding', label: '持有', policy: 'replace-section' },
        { key: 'experience', label: '持续经历', policy: 'append-chain' },
        COMMON_ALIASES,
    ], 520, false),
    keyword('item', '物品', '会持续存在并影响后续的关键物品、功能、位置、持有、状态与限制。', ['道具', '装备'], false, [
        { key: 'definition', label: '定义', policy: 'semantic-upsert' },
        { key: 'function', label: '功能', policy: 'semantic-upsert' },
        { key: 'current', label: '当前', policy: 'replace-by-anchor' },
        { key: 'limits', label: '限制', policy: 'semantic-upsert' },
        { key: 'changes', label: '持续变化', policy: 'append-chain' },
        COMMON_ALIASES,
    ], 500, false),
    keyword('event', '事件', '尚在发展的多对象过程、阶段、必要因果节点、未决事项与结果。', ['事件链'], false, [
        { key: 'goal', label: '目标', policy: 'replace-section' },
        { key: 'participants', label: '参与', policy: 'replace-section' },
        { key: 'scenes', label: '场景', policy: 'replace-section' },
        { key: 'stage', label: '阶段', policy: 'replace-by-anchor', options: ['开始', '进行中', '暂停', '结束'] },
        { key: 'progress', label: '关键进展', policy: 'append-chain' },
        { key: 'unresolved', label: '未决', policy: 'replace-section' },
        { key: 'result', label: '结果', policy: 'replace-section' },
        COMMON_ALIASES,
    ], 680, false),
    keyword('world', '世界', '跨多个场景持续生效的世界整体变化、权力、制度、公开局势与长期影响。', ['世界变化', '当前局势'], false, [
        { key: 'era', label: '时代', policy: 'replace-by-anchor' },
        { key: 'power', label: '权力', policy: 'replace-by-anchor' },
        { key: 'system', label: '制度', policy: 'replace-by-anchor' },
        { key: 'public', label: '公开局势', policy: 'replace-by-anchor' },
        { key: 'changes', label: '世界变化', policy: 'append-chain' },
        { key: 'impact', label: '持续影响', policy: 'replace-by-anchor' },
        COMMON_ALIASES,
    ], 610, false),
    keyword('foundation', '基础设定', '跨场景成立且不随剧情变化的世界运行规则。', ['基础规则', '世界设定', '规则', '设定'], true, [
        { key: 'rules', label: '规则', policy: 'semantic-upsert' },
        { key: 'current', label: '现行规则', policy: 'replace-by-anchor' },
        COMMON_ALIASES,
    ], 860, false, 0),
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
        preventRecursion: true,
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
exports.DEFAULT_EXTRACTION_PROMPT = `严格使用人物、场景、物品、事件、世界五类固定格式。关系写入对应人物，地点知识写入场景，跨场景整体变化写入世界。场景稳定知识持续补全，当前栏目完整替换；事件只保存必要过程。事实必须精简、完整、无推测、无解释且不跨条目复述。`;
exports.DEFAULT_SMALL_SUMMARY_PROMPT = `结算当前事件线；保留当前场景、人物状态、事件阶段、已成立结果和未决事项，并把持续影响分发到人物、场景、物品或世界。`;
exports.DEFAULT_LARGE_SUMMARY_PROMPT = `整理跨场景仍需保留的长期影响；关系并入人物，地点并入场景，宏观变化进入世界，只分发永久变化和重大结果。`;
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
    autoAudit: false,
    autoExtraction: false,
    autoSmallSummary: true,
    autoLargeSummary: true,
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
    criticalChangesForSmall: 6,
    largeSummaryCount: 5,
    queueCompactThreshold: 6,
    keywordDefinitions: exports.DEFAULT_KEYWORDS,
    sectionPolicies: {
        在场: 'replace-section', 当前资源: 'replace-section', 活动关联: 'replace-section', 世界影响: 'replace-section', 局部约束: 'replace-section',
        持有: 'replace-section', 目标: 'replace-section', 参与: 'replace-section', 场景: 'replace-section', 未决: 'replace-section', 结果: 'replace-section',
        当前: 'replace-by-anchor', 当前状态: 'replace-by-anchor', 关系: 'replace-by-anchor', 阶段: 'replace-by-anchor',
        持续经历: 'append-chain', 持续变化: 'append-chain', 关键进展: 'append-chain', 世界变化: 'append-chain',
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
    const sectionPolicies = { ...(0, util_1.clone)(exports.DEFAULT_SETTINGS.sectionPolicies) };
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
        autoAudit: candidate.autoAudit === true || (candidate.autoProcess === true && candidate.auditEnabled !== false),
        autoExtraction: candidate.autoExtraction === true || (candidate.autoProcess === true && candidate.extractionEnabled !== false),
        autoSmallSummary: candidate.autoSmallSummary !== false,
        autoLargeSummary: candidate.autoLargeSummary !== false,
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
        criticalChangesForSmall: (0, util_1.clampNumber)(candidate.criticalChangesForSmall, 6, 1, 50),
        largeSummaryCount: (0, util_1.clampNumber)(candidate.largeSummaryCount, 5, 1, 30),
        queueCompactThreshold: (0, util_1.clampNumber)(candidate.queueCompactThreshold, 6, 2, 50),
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
    const retiredBuiltins = new Set(['spacetime', 'region', 'global', 'ability', 'relationship', 'organization', 'task', 'contract', 'condition', 'resource', 'custom']);
    if (!Array.isArray(source) || !source.length)
        return (0, util_1.clone)(exports.DEFAULT_KEYWORDS);
    const output = [];
    for (const raw of source) {
        if (!(0, util_1.isPlainObject)(raw))
            continue;
        if (retiredBuiltins.has(String(raw.key ?? '')))
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
    // [MA-SETTINGS-01] 内置五类使用当前固定字段，不把旧版“关系/地点/全局”等字段继续混进新模板。
    // 同名字段只继承用户填写的 prompt/options；未知自定义类型仍由上层原样保留。
    const currentByLabel = new Map((current.fields ?? []).map((field) => [field.label, field]));
    const fields = fallback.fields.map((defaultField) => {
        const saved = currentByLabel.get(defaultField.label);
        if (!saved)
            return (0, util_1.clone)(defaultField);
        return {
            ...(0, util_1.clone)(defaultField),
            prompt: saved.prompt || defaultField.prompt || '',
            options: saved.options?.length ? (0, util_1.clone)(saved.options) : (0, util_1.clone)(defaultField.options ?? []),
        };
    });
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
},"util":function(module,exports,require){


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
},"worldbook":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldbookAdapter = void 0;
exports.parseEntries = parseEntries;
const constants_1 = require("./constants");
const operations_1 = require("./operations");
const parser_1 = require("./parser");
const semantic_1 = require("./semantic");
const recall_policy_1 = require("./recall-policy");
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
    // [MA-RECALL-03] 只按现有世界书内容重算原生召回字段，不调用模型、不改写条目正文。
    async replanRecall(settings, snapshot, validate) {
        return this.mutate(settings, snapshot, validate, (opened) => {
            const entries = parseEntries(opened.data);
            const focusUid = entries.find((entry) => entry.focus)?.uid ?? '';
            this.applyNativeFields(entries, settings, focusUid, new Set());
            return {
                verify(data) {
                    verifyRecallConstraints(parseEntries(data));
                },
            };
        });
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
                    const parsedAfter = parseEntries(data);
                    const foundAfter = parsedAfter.find((entry) => entry.uid === String(uid));
                    if (!foundAfter) throw new Error(`条目 UID ${uid} 保存后无法解析`);
                    const focusedUid = parsedAfter.find((entry) => entry.focus)?.uid ?? '';
                    const profile = (0, recall_policy_1.buildRecallPlan)(parsedAfter, settings, focusedUid).profiles.get(String(uid));
                    if (profile?.keywordMode === 'keyword' && !(result.raw.key ?? []).length)
                        throw new Error(`条目 UID ${uid} 的稳定关键词保存失败`);
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
    async rebalance(settings, kind, summaryText, snapshot, validate) {
        return this.mutate(settings, snapshot, validate, (opened) => {
            if (kind === 'large') {
                for (const [mapKey, raw] of Object.entries(opened.data.entries ?? {})) {
                    const title = (0, util_1.stripUidSuffix)((0, util_1.normalizeTitle)(String(raw?.comment ?? '')));
                    const extension = readExtension(raw ?? {});
                    if (title === '总结｜当前事件' && extension.locked !== true && extension.focus !== true) delete opened.data.entries[mapKey];
                }
            }
            const entries = parseEntries(opened.data);
            const normalizedSummary = (0, util_1.normalizeFact)(summaryText);
            const recall = (0, recall_policy_1.buildRecallPlan)(entries, settings, entries.find((entry) => entry.focus)?.uid ?? '');
            for (const entry of entries) {
                if (!entry.managed && !entry.focus) continue;
                const previousUpdatedAt = Number(readExtension(entry.raw).updatedAt) || 0;
                const extension = markManaged(entry.raw, '', entry.title, '');
                if (previousUpdatedAt) extension.updatedAt = previousUpdatedAt;
                const profile = recall.profiles.get(String(entry.uid));
                const mentioned = normalizedSummary.includes((0, util_1.normalizeFact)(entry.name)) || normalizedSummary.includes((0, util_1.normalizeFact)(entry.title));
                if (profile?.lifecycle === 'core') extension.memoryTier = 'core';
                else if (profile?.semanticRole === 'scene-current') extension.memoryTier = 'active';
                else if (profile?.semanticRole === 'scene-previous') extension.memoryTier = 'recent';
                else if (profile?.semanticRole === 'scene-remote') extension.memoryTier = 'historical';
                else if (entry.title === '总结｜当前事件') extension.memoryTier = 'recent-summary';
                else if (entry.title === '总结｜世界历史') extension.memoryTier = 'historical-summary';
                else if (entry.type === '事件' && !(0, semantic_1.isEventClosed)(entry)) extension.memoryTier = 'active';
                else if (mentioned) extension.memoryTier = kind === 'small' ? 'recent' : 'long-term';
                else if (kind === 'large' && entry.type === '事件') extension.memoryTier = 'historical';
                else if (!extension.memoryTier) extension.memoryTier = 'background';
            }
            const focusedUid = entries.find((entry) => entry.focus)?.uid ?? '';
            this.applyNativeFields(parseEntries(opened.data), settings, focusedUid, new Set());
            return {
                verify(data) {
                    const after = parseEntries(data);
                    if (kind === 'large' && after.some((entry) => entry.title === '总结｜当前事件')) throw new Error('大总结沉降后小总结容器仍存在');
                    verifyRecallConstraints(after);
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
    async apply(settings, plan, sourceMessageKey, contextText, focusUid, snapshot, validate, options = {}) {
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
            // [MA-SCENE-01] 单轮只有一个正文结束时的当前场景。只给提取结果中的首个场景刷新活动时间；
            // 事件分发、总结或对其他场景的补全不会误抢当前场景。
            if (options.sourceKind === 'extraction') {
                const currentSceneTitle = plan.blocks?.find?.((block) => (0, recall_policy_1.isSceneType)(block.type))?.title || '';
                const activeAt = Date.now();
                for (const entry of expectedAfterWrites) {
                    if (!(0, recall_policy_1.isSceneType)(entry.type)) continue;
                    if ((0, util_1.normalizeTitle)(entry.title) !== (0, util_1.normalizeTitle)(currentSceneTitle)) continue;
                    if (!touchedUids.has(String(entry.uid)) && !createdUids.has(String(entry.uid))) continue;
                    const extension = markManaged(entry.raw, sourceMessageKey, entry.title, operationId);
                    extension.sceneLastActiveAt = activeAt;
                    break;
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
        const recall = (0, recall_policy_1.buildRecallPlan)(entries, settings, normalizedFocusUid);
        for (const entry of entries) {
            const focus = normalizedFocusUid ? entry.uid === normalizedFocusUid : entry.focus;
            const managed = entry.managed || touchedUids.has(entry.uid) || focus;
            if (!managed) continue;
            const profile = recall.profiles.get(String(entry.uid));
            if (!profile) continue;
            const previousUpdatedAt = Number(readExtension(entry.raw).updatedAt) || 0;
            applyNativeProfile(entry.raw, profile);
            const extension = markManaged(entry.raw, '', entry.title, '');
            if (!touchedUids.has(entry.uid) && previousUpdatedAt) extension.updatedAt = previousUpdatedAt;
            applyKeywordPolicy(entry.raw, entry, profile, extension);
            extension.focus = focus;
            extension.chatKey = this.chatKey();
            extension.recallProfile = profile.name;
            extension.lifecycle = profile.lifecycle;
            extension.semanticRole = profile.semanticRole;
            extension.sceneStage = recall.sceneStages.get(String(entry.uid)) || '';
            delete extension.evidence;
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
    return { uid, key: [], keysecondary: [], comment: '', content: '', constant: false, vectorized: true, selective: false, selectiveLogic: 0, addMemo: false, order: 400, position: 0, disable: false, ignoreBudget: false, excludeRecursion: false, preventRecursion: true, probability: 100, useProbability: true, depth: 4, outletName: '', group: '', groupOverride: false, groupWeight: 100, scanDepth: null, caseSensitive: null, matchWholeWords: null, useGroupScoring: null, automationId: '', role: 0, sticky: null, cooldown: null, delay: null, delayUntilRecursion: 0, triggers: [] };
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
        const triggerKeywords = (0, util_1.normalizeStringArray)(raw.key).filter((item) => !(0, util_1.isUidKeyword)(item));
        const aliases = (0, util_1.unique)((0, entry_section_1.sectionLines)(content, ['别名', '称号', '其他名称']));
        const extension = readExtension(raw);
        const storedKeywords = (0, util_1.normalizeStringArray)(extension.recallKeywords);
        output.push({ uid: String(raw.uid ?? mapUid), mapKey: String(mapUid), title, normalizedTitle: title.toLocaleLowerCase(), type: split.type, name: split.name, content, sections, keywords: (0, util_1.unique)([split.name, ...triggerKeywords, ...storedKeywords]), triggerKeywords, aliases, references: (0, entry_section_1.extractReferences)(content), focus: extension.focus === true, locked: extension.locked === true || raw.locked === true, managed: extension.managed === true, updatedAt: Number(extension.updatedAt) || 0, memoryTier: String(extension.memoryTier ?? ''), lifecycle: String(extension.lifecycle ?? ''), semanticRole: String(extension.semanticRole ?? ''), sceneStage: String(extension.sceneStage ?? ''), chatKey: String(extension.chatKey ?? ''), recallProfile: String(extension.recallProfile ?? ''), activation: { enabled: raw.disable !== true, constant: raw.constant === true, selective: raw.selective === true, vectorized: raw.vectorized === true, recursive: raw.recursive === true || (raw.preventRecursion !== true && raw.excludeRecursion !== true), preventRecursion: raw.preventRecursion === true, excludeRecursion: raw.excludeRecursion === true, delayUntilRecursion: finiteNumber(raw.delayUntilRecursion, 0), depth: Math.max(0, finiteNumber(raw.depth, 4)), order: finiteNumber(raw.order, 400), position: finiteNumber(raw.position, 0), role: finiteNumber(raw.role, 0), scanDepth: raw.scanDepth == null ? null : finiteNumber(raw.scanDepth, null), probability: finiteNumber(raw.probability, 100), useProbability: raw.useProbability !== false, disabled: raw.disable === true }, raw });
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
function applyNativeProfile(raw, profile) {
    raw.constant = profile.constant === true;
    raw.vectorized = profile.vectorized === true;
    raw.preventRecursion = profile.preventRecursion !== false;
    raw.excludeRecursion = profile.excludeRecursion === true;
    raw.delayUntilRecursion = Number(profile.delayUntilRecursion || 0);
    raw.depth = Math.max(0, Number(profile.depth || 0));
    raw.order = Number(profile.order || 400);
    raw.position = Number(profile.position ?? 4);
    raw.scanDepth = profile.scanDepth == null ? null : Number(profile.scanDepth);
    raw.selective = false;
    raw.keysecondary = [];
    raw.caseSensitive = false;
    raw.matchWholeWords = false;
    raw.probability = 100;
    raw.useProbability = true;
    if ('recursive' in raw) raw.recursive = raw.preventRecursion !== true && raw.excludeRecursion !== true;
}

function applyKeywordPolicy(raw, entry, profile, extension) {
    const current = (0, util_1.normalizeStringArray)(raw.key).filter((item) => !(0, util_1.isUidKeyword)(item));
    const stored = (0, util_1.normalizeStringArray)(extension.recallKeywords);
    const candidates = (0, recall_policy_1.sanitizeRecallKeywords)(entry.name, [...current, ...stored, ...(entry.aliases ?? [])], entry.type, 4);
    extension.recallKeywords = candidates;
    if (profile.keywordMode !== 'keyword') {
        raw.key = [];
        raw.keysecondary = [];
        return;
    }
    raw.key = (0, util_1.unique)([...candidates, (0, util_1.uidKeyword)(entry.uid)]);
}
function verifyRecallConstraints(entries) {
    const currentScenes = entries.filter((entry) => entry.managed && entry.semanticRole === 'scene-current');
    if (currentScenes.length > 1) throw new Error('当前场景常驻超过一条');
    for (const entry of entries.filter((item) => item.managed)) {
        if (entry.focus && (!entry.activation.constant || !entry.activation.preventRecursion || !entry.activation.excludeRecursion)) throw new Error(`长期焦点未保持常驻递归隔离：${entry.title}`);
        if (entry.activation.vectorized && entry.triggerKeywords?.length) throw new Error(`纯向量条目仍保留关键词：${entry.title}`);
        const maySpread = /^(scene-|world-state)/u.test(entry.semanticRole || '');
        if (!maySpread && entry.activation.preventRecursion !== true) throw new Error(`非场景/世界条目仍可继续递归：${entry.title}`);
    }
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
        const actualKeys = [...new Set((found.triggerKeywords ?? []).map(util_1.normalizeFact))].sort();
        const extension = readExtension(found.raw);
        if (extension.lastOperationId !== operationId) throw new Error(`世界书操作 ID 未正确落盘：${item.title}`);
        const profile = (0, recall_policy_1.buildRecallPlan)(actual, settings, focusUid).profiles.get(String(found.uid));
        if (profile.keywordMode !== 'keyword' && actualKeys.length) throw new Error(`非关键词条目仍保留触发词：${item.title}`);
        if (profile.keywordMode === 'keyword' && !actualKeys.length) throw new Error(`关键词条目没有稳定触发词：${item.title}`);
        if (found.activation.constant !== profile.constant) throw new Error(`constant 字段未按条目类型落盘：${item.title}`);
        if (found.activation.vectorized !== profile.vectorized) throw new Error(`vectorized 字段未按条目类型落盘：${item.title}`);
        if (found.activation.preventRecursion !== profile.preventRecursion) throw new Error(`preventRecursion 字段未按语义落盘：${item.title}`);
        if (found.activation.excludeRecursion !== profile.excludeRecursion) throw new Error(`excludeRecursion 字段未按语义落盘：${item.title}`);
        if (found.activation.depth !== profile.depth) throw new Error(`depth 字段未按语义落盘：${item.title}`);
        if (found.activation.order !== profile.order) throw new Error(`order 字段未按语义落盘：${item.title}`);
        if (found.activation.position !== profile.position) throw new Error(`position 字段未按语义落盘：${item.title}`);
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
