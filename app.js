/** Mirror Abyss 2.0.0-lite.ui.72-fresh-audit-scheduler — layered runtime prompts, optional game-time tracking, deterministic lifecycle settlement, and native recall. */
var MA_MODULES={"application":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MirrorAbyssApplication = void 0;
exports.receiptAffectedBySourceChange = receiptAffectedBySourceChange;
exports.messageIndexFromEvent = messageIndexFromEvent;
const host_1 = require("./host");
const settings_1 = require("./settings");
const audit_1 = require("./audit");
const memory_1 = require("./memory");
const worldbook_1 = require("./worldbook");
const migration_1 = require("./migration");
const world_setting_import_1 = require("./world-setting-import");
const util_1 = require("./util");
const control_panel_1 = require("./control-panel");
const worldbook_management_1 = require("./worldbook-management");
const diagnostics_1 = require("./diagnostics");
class MirrorAbyssApplication {
    constructor() {
        this.host = new host_1.HostAdapter();
        this.settingsStore = new settings_1.SettingsStore();
        this.worldbook = new worldbook_1.WorldbookAdapter(() => this.host.context(), () => this.host.chatKey());
        this.diagnostics = new diagnostics_1.DiagnosticsService(this.host, this.worldbook, () => this.settings(), (progress) => {
            this.controlPanel?.setDiagnosticProgress?.(progress);
        }, {
            executeTurn: (taskType, index, automatic, settings) => this.runDiagnosticTurn(taskType, index, automatic, settings),
            pipelineState: () => (0, util_1.clone)(this.controlPanel?.taskStates ?? {}),
            resetRound: (roundIndex, totalRounds) => this.resetAcceptanceRound(roundIndex, totalRounds),
        });
        this.auditRunner = new audit_1.AuditRunner(this.host, () => this.settings(), (progress) => {
            const snapshot = this.activeSnapshots.get(progress?.chatKey || safeChatKey(this.host));
            const messageIndex = Number.isInteger(snapshot?.messageIndex) ? snapshot.messageIndex : null;
            if (progress?.phase === 'audit') {
                this.controlPanel?.setTaskProgress?.('audit', 'running', progress.detail || '正在审核正文', { messageIndex });
            } else if (progress?.phase === 'revision') {
                this.controlPanel?.setTaskProgress?.('audit', 'warning', '审核未通过，已进入修正', { messageIndex });
                this.controlPanel?.setTaskProgress?.('revision', 'running', progress.detail || '正在生成完整修正版', { messageIndex });
                if (snapshot?.taskType === 'full') this.controlPanel?.setTaskProgress?.('extract', 'queued', '等待修正完成', { messageIndex });
            }
        });
        this.memoryRunner = new memory_1.MemoryRunner(this.host, this.worldbook, () => this.settings(), (progress) => {
            const active = this.activeSnapshots.get(safeChatKey(this.host));
            const phase = progress?.phase === 'write' ? 'write' : 'extract';
            const meta = { ...(progress || {}), messageIndex: progress?.messageIndex ?? active?.messageIndex ?? null };
            if (phase === 'write' && progress?.state === 'running') this.controlPanel?.setTaskProgress?.('extract', 'success', '最终协议已形成，等待写入', meta);
            this.controlPanel?.setTaskProgress?.(phase, progress?.state || 'running', progress?.detail || '', meta);
        });
        this.migrationService = new migration_1.MigrationService(this.host, this.worldbook, () => this.settings(), (progress) => {
            this.controlPanel?.setMigrationProgress?.(progress);
        }, (patch) => this.configure(patch));
        this.worldSettingImportService = new world_setting_import_1.WorldSettingImportService(this.host, this.worldbook, () => this.settings(), (progress) => {
            this.controlPanel?.setWorldSettingProgress?.(progress);
        });
        this.controlPanel = new control_panel_1.ControlPanel({
            getSettings: () => this.settings(),
            configure: (patch) => this.configure(patch),
            getGameTimeAnchor: () => this.host.getCurrentGameTime(),
            setGameTimeAnchor: (value) => this.setGameTimeAnchor(value),
            process: () => this.processLatest(),
            audit: () => this.audit(),
            extract: () => this.extract(),
            smallSummary: () => this.smallSummary(),
            largeSummary: () => this.largeSummary(),
            organizeWorldbook: () => this.organizeWorldbook(),
            testApiProbe: () => this.testApiProbe(),
            cancel: () => this.cancel(),
            taskStatus: () => this.status(),
            loadWorkspace: () => this.loadWorkspace(),
            replanRecall: () => this.replanRecall(),
            updateEntry: (uid, patch) => this.updateEntry(uid, patch),
            setFocus: (uid, enabled) => this.setFocus(uid, enabled),
            setLocked: (uid, locked) => this.setLocked(uid, locked),
            migrate: () => this.migrate(),
            commitMigration: () => this.commitMigration(),
            undoMigration: () => this.undoMigration(),
            migrationPreview: () => this.migrationPreview(),
            previewWorldSettings: (sourceText) => this.previewWorldSettings(sourceText),
            commitWorldSettings: (sourceText) => this.commitWorldSettings(sourceText),
            clearWorldSettingsPreview: () => this.clearWorldSettingsPreview(),
            worldSettingsPreview: () => this.worldSettingsPreview(),
            resetCurrentChat: () => this.resetCurrentChat(),
            resetPlugin: () => this.resetPlugin(),
            runAcceptance: () => this.runAcceptance(),
            exportDiagnostics: () => this.exportDiagnostics(),
            getDiagnostics: () => this.diagnosticsReport(),
            // [MA-APP-API-01] UI 只调用 SillyTavern 官方 Connection Profile 服务，不保存密钥或自建 API 配置。
            bindProfileDropdown: (selector, selectedId, onChange) => this.host.bindProfileDropdown(selector, selectedId, onChange),
            connectionProfilesAvailable: () => this.host.connectionProfilesAvailable(),
            profileName: (profileId) => this.host.profileName(profileId),
            profileSummary: (profileId) => this.host.profileSummary(profileId),
        });
        this.cleanup = [];
        this.runningByChat = new Map();
        this.taskQueues = new Map();
        this.pendingTaskKeys = new Set();
        this.activeSnapshots = new Map();
        this.activeTokens = new Map();
        this.pendingMessageTimers = new Map();
        this.pendingSourceReconcileTimers = new Map();
        this.pendingRecoveryIds = new Set();
        this.acceptanceMode = false;
        this.started = false;
    }
    start() {
        if (this.started) return;
        this.host.context();
        this.listen('MESSAGE_RECEIVED', (value) => this.scheduleMessage(messageIndexFromEvent(value)));
        // SillyTavern 在同一次正文落盘中先发 MESSAGE_RECEIVED，再发 CHARACTER_MESSAGE_RENDERED；
        // 后者不再重复订阅，避免同一消息进入两次稳定检测与队列去重链。
        // [MA-DIALOGUE-01] 优先等待完整生成结束；旧版宿主没有该事件时，由稳定检测兜底。
        this.listen('GENERATION_ENDED', (value) => this.scheduleMessage(messageIndexFromEvent(value), true));
        for (const event of ['CHAT_CHANGED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED']) this.listen(event, (value) => this.onScopeChanged(event, value));
        this.controlPanel.mount();
        this.started = true;
        this.resumeInterruptedMaintenance();
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
        this.pendingRecoveryIds.clear();
        this.clearPendingMessageTimers();
        this.clearPendingSourceReconcileTimers();
        this.host.clearInternalMessageMutations();
        this.controlPanel.unmount();
    }
    isStarted() { return this.started; }
    settings() { return this.settingsStore.load(this.host.context()); }
    configure(patch) { return this.settingsStore.save(this.host.context(), patch); }
    async setGameTimeAnchor(value) {
        const label = String(value ?? '').trim().slice(0, 80);
        await this.host.setCurrentGameTime(label ? { label, sceneTitle: '玩家设置', source: 'player' } : null, null, this.settings());
        return this.host.getCurrentGameTime();
    }
    audit() { return this.enqueueTask('audit', undefined, false); }
    extract() { return this.enqueueTask('extraction', undefined, false); }
    smallSummary() {
        return this.enqueueMaintenance('smallSummary', async (settings, snapshot) => this.memoryRunner.runTask('smallSummary', settings, snapshot, { allowCascade: false }));
    }
    largeSummary() {
        return this.enqueueMaintenance('largeSummary', async (settings, snapshot) => this.memoryRunner.runTask('largeSummary', settings, snapshot, { allowCascade: false }));
    }
    organizeWorldbook() {
        return this.enqueueMaintenance('organizeWorldbook', async (settings, snapshot) => {
            const validate = () => this.host.assertSnapshot(snapshot, this.settings());
            validate();
            const beforeCursor = this.host.cursor();
            const beforeGameTime = this.host.getCurrentGameTime();
            const beforeReceiptIds = (this.host.getCommitReceipts?.() ?? []).map((item) => String(item?.id ?? '')).filter(Boolean);
            const transaction = {
                id: `organize-${snapshot.taskId || Date.now()}-${Math.random().toString(36).slice(2)}`,
                kind: 'organizeWorldbook',
                chatKey: snapshot.chatKey,
                worldbookName: snapshot.worldbookName,
                beforeCursor: (0, util_1.clone)(beforeCursor),
                beforeGameTime: (0, util_1.clone)(beforeGameTime),
                beforeReceiptIds,
                createdAt: Date.now(),
            };
            await this.host.setMaintenanceTransaction?.(transaction, snapshot, this.settings());
            try {
                const small = await this.memoryRunner.runTask('smallSummary', settings, snapshot, { allowCascade: false });
                validate();
                const large = await this.memoryRunner.runTask('largeSummary', settings, snapshot, { allowCascade: false });
                validate();
                const recall = await this.worldbook.replanRecall(settings, snapshot, validate);
                validate();
                await this.host.clearMaintenanceTransaction?.(transaction.id, snapshot, this.settings());
                return {
                    smallEntries: Array.isArray(small) ? small.length : 0,
                    largeEntries: Array.isArray(large) ? large.length : 0,
                    recallEntries: Array.isArray(recall) ? recall.length : 0,
                    transactional: true,
                };
            }
            catch (error) {
                if (safeChatKey(this.host) !== snapshot.chatKey) {
                    const deferred = new Error(`整理世界书已中断；恢复标记保留在原聊天，返回原聊天后会先自动回滚：${(0, util_1.errorText)(error)}`);
                    deferred.code = 'MA_TASK_CANCELLED';
                    throw deferred;
                }
                try {
                    await this.restoreMaintenanceTransaction(transaction, settings, snapshot);
                }
                catch (rollbackError) {
                    throw new Error(`整理世界书失败，且父事务恢复不完整：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackError)}`);
                }
                const cancelled = snapshot.token?.cancelled === true;
                const restored = new Error(`${cancelled ? '整理世界书已取消' : '整理世界书失败'}，已恢复操作前的世界书、游标、回执与游戏时间：${(0, util_1.errorText)(error)}`);
                if (cancelled) restored.code = 'MA_TASK_CANCELLED';
                throw restored;
            }
        });
    }
    async restoreMaintenanceTransaction(transaction, settings, snapshot) {
        if (!transaction || transaction.kind !== 'organizeWorldbook') return false;
        const validate = () => this.host.assertSnapshot(snapshot, this.settings());
        validate();
        if (transaction.chatKey !== snapshot.chatKey || transaction.worldbookName !== snapshot.worldbookName)
            throw new Error('待恢复事务与当前聊天或世界书不一致');
        const beforeIds = new Set((transaction.beforeReceiptIds ?? []).map((value) => String(value ?? '')).filter(Boolean));
        const receipts = (this.host.getCommitReceipts?.() ?? []).filter((receipt) => {
            const id = String(receipt?.id ?? '');
            return id && !beforeIds.has(id) && (!receipt?.worldbookName || receipt.worldbookName === transaction.worldbookName);
        });
        const receiptIds = receipts.map((receipt) => String(receipt.id ?? '')).filter(Boolean);
        if (receipts.length) {
            await this.worldbook.rollbackReceipts(settings, receipts, this.host.getFocusUid(), snapshot, validate);
        }
        await this.host.saveCursor((0, util_1.clone)(transaction.beforeCursor ?? {}), snapshot, this.settings());
        await this.host.setCurrentGameTime((0, util_1.clone)(transaction.beforeGameTime ?? null), snapshot, this.settings());
        if (receiptIds.length) await this.host.removeCommitReceipts(receiptIds);
        await this.host.clearMaintenanceTransaction?.(transaction.id, snapshot, this.settings());
        return true;
    }
    resumeInterruptedMaintenance() {
        if (!this.started || typeof this.host.getMaintenanceTransaction !== 'function') return false;
        let transaction;
        try { transaction = this.host.getMaintenanceTransaction(); }
        catch { return false; }
        if (!transaction?.id || transaction.kind !== 'organizeWorldbook') return false;
        if (this.pendingRecoveryIds.has(transaction.id)) return true;
        this.pendingRecoveryIds.add(transaction.id);
        void this.enqueueMaintenance('organizeWorldbookRecovery', async (settings, snapshot) => {
            try {
                await this.restoreMaintenanceTransaction(transaction, settings, snapshot);
                this.controlPanel.setStatus('检测到中断的世界书整理，已先恢复操作前状态');
                await this.controlPanel.refreshWorldbookPage?.(true);
                return { recovered: true, transactionId: transaction.id };
            }
            finally {
                this.pendingRecoveryIds.delete(transaction.id);
            }
        }).catch((error) => {
            this.pendingRecoveryIds.delete(transaction.id);
            this.controlPanel.setStatus(`中断事务恢复失败：${(0, util_1.errorText)(error)}；未继续执行新的整理`, true);
            console.error('[MirrorAbyss] deferred maintenance recovery failed', error);
        });
        return true;
    }
    migrate() { return this.enqueueTask('migration', undefined, false); }
    commitMigration() { return this.enqueueTask('commitMigration', undefined, false); }
    undoMigration() { return this.enqueueTask('undoMigration', undefined, false); }
    migrationPreview() { return this.migrationService.previewSummary(); }
    previewWorldSettings(sourceText) {
        return this.enqueueMaintenance('worldSettingPreview', async (settings, snapshot) => this.worldSettingImportService.preview(settings, snapshot, sourceText));
    }
    commitWorldSettings(sourceText) {
        return this.enqueueMaintenance('worldSettingCommit', async (settings, snapshot) => this.worldSettingImportService.commit(settings, snapshot, sourceText));
    }
    clearWorldSettingsPreview() { return this.worldSettingImportService.clearPreview(); }
    worldSettingsPreview() { return this.worldSettingImportService.previewSummary(); }
    runAcceptance() {
        return this.enqueueMaintenance('acceptance', async (settings, snapshot) => {
            this.acceptanceMode = true;
            this.clearPendingMessageTimers(snapshot.chatKey);
            try {
                return await this.diagnostics.run(settings, snapshot, () => this.host.assertSnapshot(snapshot, this.settings()));
            }
            finally {
                this.acceptanceMode = false;
                this.clearPendingMessageTimers(snapshot.chatKey);
            }
        });
    }
    testApiProbe() {
        return this.enqueueMaintenance('apiProbe', async (settings, snapshot) => {
            this.host.assertSnapshot(snapshot, this.settings());
            const profileId = settings.modelSource === 'profile' ? String(settings.modelProfileId || '') : '';
            const route = this.host.profileSummary(profileId) || {};
            const startedAt = Date.now();
            const raw = await this.host.generate(
                '职责：API连接探针。只输出 MA_PROBE_OK。',
                '只输出 MA_PROBE_OK。',
                512,
                snapshot,
                settings,
                Math.min(Math.max(5000, Number(settings.requestTimeoutMs || 30000)), 45000),
                profileId,
            );
            this.host.assertSnapshot(snapshot, this.settings());
            const text = String(raw || '').trim();
            if (!/MA_PROBE_OK/u.test(text)) throw new Error(`API 已返回文本，但探针协议不匹配：${text.slice(0, 120) || '空响应'}`);
            return {
                ok: true,
                elapsedMs: Date.now() - startedAt,
                route: {
                    name: route.name || (profileId ? profileId : '当前 SillyTavern 连接'),
                    api: route.api || '未知',
                    model: route.model || '未知',
                    transport: route.transport || '',
                },
            };
        });
    }
    async resetAcceptanceRound(roundIndex, totalRounds) {
        const chatKey = this.host.chatKey();
        this.clearPendingMessageTimers(chatKey);
        this.clearPendingSourceReconcileTimers(chatKey);
        this.auditRunner.resetStatus?.(chatKey);
        this.memoryRunner.resetStatus?.(chatKey);
        this.migrationService.clearPreview?.();
        this.worldSettingImportService.clearPreview?.();
        this.controlPanel?.resetTaskStates?.(`全量验收第 ${roundIndex}/${totalRounds} 轮从头开始`);
    }
    async runDiagnosticTurn(taskType, index, automatic, settings) {
        const token = { cancelled: false, reason: '' };
        const snapshot = this.host.captureSnapshot(settings, index, taskType, token);
        const chatKey = snapshot.chatKey;
        const previousSnapshot = this.activeSnapshots.get(chatKey);
        const previousToken = this.activeTokens.get(chatKey);
        this.activeSnapshots.set(chatKey, snapshot);
        this.activeTokens.set(chatKey, token);
        try {
            return await this.runTask(taskType, snapshot, automatic, settings);
        }
        finally {
            if (previousSnapshot) this.activeSnapshots.set(chatKey, previousSnapshot);
            else this.activeSnapshots.delete(chatKey);
            if (previousToken) this.activeTokens.set(chatKey, previousToken);
            else this.activeTokens.delete(chatKey);
        }
    }
    exportDiagnostics() { return this.diagnostics.exportLast(); }
    diagnosticsReport() { return this.diagnostics.currentReport(); }
    async resetCurrentChat() {
        const chatKey = this.host.chatKey();
        this.clearPendingMessageTimers(chatKey);
        this.clearPendingSourceReconcileTimers(chatKey);
        const token = this.activeTokens.get(chatKey);
        if (token) { token.cancelled = true; token.reason = '当前聊天正在重置'; }
        this.rejectQueuedTasks('当前聊天正在重置', chatKey);
        this.host.bumpScopeRevision(chatKey);
        const running = this.runningByChat.get(chatKey);
        if (running) await Promise.allSettled([running]);
        await this.host.resetCurrentChatState();
        this.auditRunner.resetStatus?.(chatKey);
        this.memoryRunner.resetStatus?.(chatKey);
        this.migrationService.clearPreview?.();
        this.worldSettingImportService.clearPreview();
        this.diagnostics.clear();
        this.controlPanel.renderDiagnosticReport?.(null);
        this.controlPanel.resetTaskStates?.('当前聊天已重置');
        return { chatKey, worldbookPreserved: true };
    }
    async resetPlugin() {
        this.clearPendingMessageTimers();
        this.clearPendingSourceReconcileTimers();
        this.cancelAll('插件正在重置');
        for (const chatKey of this.activeTokens.keys()) this.host.bumpScopeRevision(chatKey);
        const running = [...this.runningByChat.values()];
        if (running.length) await Promise.allSettled(running);
        const chatKey = safeChatKey(this.host);
        const context = this.host.context();
        const settingsSnapshot = this.settingsStore.capture(context);
        let settings;
        try {
            settings = this.settingsStore.reset(context);
            if (chatKey) await this.host.resetCurrentChatState();
        }
        catch (error) {
            try { this.settingsStore.restore(context, settingsSnapshot); }
            catch (rollbackError) {
                throw new Error(`插件重置失败，且旧设置恢复失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackError)}`);
            }
            throw new Error(`插件重置失败，已恢复旧设置：${(0, util_1.errorText)(error)}`);
        }
        this.auditRunner.resetStatus?.();
        this.memoryRunner.resetStatus?.();
        this.migrationService.clearPreview?.();
        this.worldSettingImportService.clearPreview();
        this.diagnostics.clear();
        this.controlPanel.renderDiagnosticReport?.(null);
        this.taskQueues.clear();
        this.pendingTaskKeys.clear();
        this.activeSnapshots.clear();
        this.activeTokens.clear();
        this.runningByChat.clear();
        this.host.clearInternalMessageMutations();
        this.controlPanel.resetTaskStates?.('插件已恢复默认设置');
        return { settings, currentChatReset: Boolean(chatKey), worldbookPreserved: true };
    }
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
        this.publishTaskStatus();
        return true;
    }
    status() {
        const key = safeChatKey(this.host);
        const queue = this.taskQueues.get(key);
        return { audit: this.auditRunner.currentStatus(key), memory: this.memoryRunner.currentStatus(key), active: this.activeTokens.has(key), queued: queue?.items?.length ?? 0 };
    }
    publishTaskStatus() {
        this.controlPanel.setGlobalTaskState?.(this.status());
    }
    async loadWorkspace() {
        const settings = this.settings();
        const token = { cancelled: false, reason: '' };
        const snapshot = this.host.captureMaintenanceSnapshot(settings, 'loadWorkspace', token);
        const validate = () => this.host.assertSnapshot(snapshot, this.settings());
        const worldbook = await this.worldbook.read(settings, snapshot, validate);
        validate();
        const currentGameTime = this.host.getCurrentGameTime();
        const management = (0, worldbook_management_1.buildWorldbookManagementView)(worldbook.entries, currentGameTime, settings);
        return {
            entries: worldbook.entries,
            worldbookName: worldbook.name,
            settings,
            currentGameTime,
            management,
            focusUid: this.host.getFocusUid(),
            matching: this.memoryRunner.currentStatus(this.host.chatKey()),
            task: this.status(),
            canUndoMigration: this.migrationService.canUndo(),
            hasMigrationPreview: this.migrationService.hasPreview(),
            migrationPreview: this.migrationService.previewSummary(),
            worldSettingsPreview: this.worldSettingImportService.previewSummary(),
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
            const committedEntries = await this.worldbook.setFocus(settings, previous, next, snapshot, () => this.host.assertSnapshot(snapshot, this.settings()));
            try {
                await this.host.setFocusUid(next);
            }
            catch (error) {
                try {
                    await this.worldbook.setFocus(settings, next, previous, snapshot, () => this.host.assertSnapshot(snapshot, this.settings()));
                }
                catch (rollbackError) {
                    throw new Error(`焦点元数据保存失败，且世界书焦点恢复失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackError)}`);
                }
                throw new Error(`焦点元数据保存失败，世界书焦点已恢复：${(0, util_1.errorText)(error)}`);
            }
            return committedEntries;
        });
    }
    listen(eventName, handler) {
        try { this.cleanup.push(this.host.subscribe(eventName, handler, false)); }
        catch (error) { console.warn(`[MirrorAbyss] 宿主事件 ${eventName} 不可用`, error); }
    }
    scheduleMessage(index, immediate = false) {
        if (!this.started || this.acceptanceMode) return;
        let turn;
        try { turn = this.host.latestTurn(index); }
        catch { return; }
        const key = `${turn.chatKey}|${turn.messageIndex}`;
        const previous = this.pendingMessageTimers.get(key);
        if (previous) globalThis.clearTimeout(previous);
        const delay = immediate ? 0 : 650;
        const timer = globalThis.setTimeout(async () => {
            if (this.pendingMessageTimers.get(key) !== timer) return;
            this.pendingMessageTimers.delete(key);
            try {
                const first = this.host.latestTurn(turn.messageIndex);
                if (!immediate) {
                    await new Promise((resolve) => globalThis.setTimeout(resolve, 220));
                    const stable = this.host.latestTurn(turn.messageIndex);
                    if (stable.contentHash !== first.contentHash) {
                        this.scheduleMessage(turn.messageIndex, false);
                        return;
                    }
                }
                await this.onMessage(turn.messageIndex);
            }
            catch (error) {
                const message = (0, util_1.errorText)(error);
                if (!/源正文|聊天已经切换|没有可处理/u.test(message)) console.error('[MirrorAbyss] dialogue scheduling failed', error);
            }
        }, delay);
        timer?.unref?.();
        this.pendingMessageTimers.set(key, timer);
    }
    clearPendingMessageTimers(chatKey = '') {
        for (const [key, timer] of this.pendingMessageTimers.entries()) {
            if (chatKey && !key.startsWith(`${chatKey}|`)) continue;
            globalThis.clearTimeout(timer);
            this.pendingMessageTimers.delete(key);
        }
    }
    clearPendingSourceReconcileTimers(chatKey = '') {
        for (const [key, pending] of this.pendingSourceReconcileTimers.entries()) {
            if (chatKey && key !== chatKey) continue;
            globalThis.clearTimeout(pending.timer);
            this.pendingSourceReconcileTimers.delete(key);
        }
    }
    async onMessage(index) {
        if (!this.started || this.acceptanceMode) return;
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
        try {
            const turn = this.host.latestTurn(index);
            // [MA-QUEUE-04] 新正文只追加到当前聊天队列。正在处理的旧正文继续使用固定源快照，
            // 不再因为“出现更新的 AI 正文”而主动取消。聊天切换、源正文编辑/删除和用户取消仍会中断。
            void this.enqueueTask(automaticTaskType, turn.messageIndex, true).catch((error) => {
                const message = (0, util_1.errorText)(error);
                if (!/同一任务已经在执行或等待/u.test(message)) console.error('[MirrorAbyss] automatic core flow failed', error);
            });
        }
        catch (error) { console.error('[MirrorAbyss] automatic task enqueue failed', error); }
    }
    onScopeChanged(eventName, eventValue) {
        if (this.host.consumeInternalScopeEvent(eventName, eventValue)) return;
        this.clearPendingMessageTimers();
        const reason = `SillyTavern 事件 ${eventName} 使源对话失效`;
        if (eventName === 'CHAT_CHANGED') {
            this.clearPendingSourceReconcileTimers();
            this.cancelAll(reason);
            try { this.host.bumpScopeRevision(this.host.chatKey()); } catch { }
            this.migrationService.clearPreview?.();
            this.worldSettingImportService.clearPreview?.();
            this.diagnostics.clear();
            this.controlPanel.renderDiagnosticReport?.(null);
            this.controlPanel.resetTaskStates?.('聊天已经切换');
            this.controlPanel.setStatus('聊天已经切换，旧聊天任务与预览已清理');
            this.controlPanel.rebindHostDom?.();
            this.publishTaskStatus();
            this.resumeInterruptedMaintenance();
            return;
        }
        const index = messageIndexFromEvent(eventValue);
        if (!Number.isInteger(index)) {
            this.cancelAll(reason);
            try { this.host.bumpScopeRevision(this.host.chatKey()); } catch { }
            this.controlPanel.resetTaskStates?.('正文范围发生无法定位的变化');
            this.controlPanel.setStatus('正文范围发生无法定位的变化，旧任务已取消');
            return;
        }
        const affected = this.cancelAffectedMessageTasks(eventName, index, reason);
        if (affected > 0) {
            this.controlPanel.resetTaskStates?.('源正文已被修改、切换或删除');
            this.controlPanel.setStatus(`源正文已变化，已取消${affected}个受影响任务；其他后台任务继续运行`);
        }
        this.scheduleSourceReconcile(eventName, index);
    }

    scheduleSourceReconcile(eventName, index) {
        let chatKey;
        try { chatKey = this.host.chatKey(); }
        catch { return; }
        if (!chatKey || !Number.isInteger(index)) return;
        const previous = this.pendingSourceReconcileTimers.get(chatKey);
        if (previous?.timer) globalThis.clearTimeout(previous.timer);
        const nextIndex = Math.min(index, Number.isInteger(previous?.index) ? previous.index : index);
        const nextEvent = eventName === 'MESSAGE_DELETED' || previous?.eventName === 'MESSAGE_DELETED' ? 'MESSAGE_DELETED' : eventName;
        const timer = globalThis.setTimeout(() => {
            const pending = this.pendingSourceReconcileTimers.get(chatKey);
            if (!pending || pending.timer !== timer) return;
            this.pendingSourceReconcileTimers.delete(chatKey);
            void this.reconcileCommittedSource(nextEvent, nextIndex, chatKey).catch((error) => {
                const text = (0, util_1.errorText)(error);
                this.controlPanel.setStatus(`近期世界书回滚失败：${text}；可使用世界书重建重新收束`, true);
                console.error('[MirrorAbyss] source reconciliation failed', error);
            });
        }, 320);
        timer?.unref?.();
        this.pendingSourceReconcileTimers.set(chatKey, { timer, index: nextIndex, eventName: nextEvent });
    }
    async reconcileCommittedSource(eventName, index, chatKey) {
        if (!this.started || this.host.chatKey() !== chatKey) return;
        const receipts = typeof this.host.getCommitReceipts === 'function' ? this.host.getCommitReceipts() : [];
        const affected = receipts.filter((receipt) => receiptAffectedBySourceChange(receipt, eventName, index));
        if (!affected.length) return;
        await this.waitForChatIdle(chatKey);
        if (!this.started || this.host.chatKey() !== chatKey) return;
        const sourceKeys = [...new Set(affected.map((receipt) => String(receipt.sourceMessageKey ?? '')).filter(Boolean))];
        const ids = affected.map((receipt) => String(receipt.id ?? '')).filter(Boolean);
        await this.enqueueMaintenance('sourceRollback', async (settings, snapshot) => {
            const focusUid = this.host.getFocusUid();
            const result = await this.worldbook.rollbackReceipts(settings, affected, focusUid, snapshot, () => this.host.assertSnapshot(snapshot, this.settings()));
            const cursor = this.host.cursor();
            const ordered = [...affected].sort((left, right) => Number(left?.createdAt || 0) - Number(right?.createdAt || 0));
            const stateBefore = ordered.find((receipt) => receipt?.stateBefore?.cursor || Object.prototype.hasOwnProperty.call(receipt?.stateBefore || {}, 'currentGameTime'))?.stateBefore || null;
            const restoredCursor = stateBefore?.cursor && typeof stateBefore.cursor === 'object'
                ? stateBefore.cursor
                : { ...cursor, lastProcessedMessageKey: '', lastProcessedHash: '' };
            // 回执必须最后清理。游标和游戏时间恢复失败时保留回执，后续可再次执行幂等回滚。
            await this.host.saveCursor(restoredCursor, snapshot, this.settings());
            if (stateBefore && Object.prototype.hasOwnProperty.call(stateBefore, 'currentGameTime'))
                await this.host.setCurrentGameTime(stateBefore.currentGameTime, snapshot, this.settings());
            await this.host.removeCommitReceipts(ids);
            return result;
        });
        this.controlPanel.resetTaskStates?.('源对话已变化，近期写入已回滚');
        this.controlPanel.setStatus(`已回滚${affected.length}次近期世界书提交，正在按当前对话重新排队`);
        await this.controlPanel.refreshRecallMap?.();
        const indexes = sourceKeys
            .map((messageKey) => this.host.assistantIndexByMessageKey(messageKey))
            .filter((value) => Number.isInteger(value) && value >= 0)
            .sort((left, right) => left - right);
        for (const messageIndex of indexes) this.scheduleMessage(messageIndex, false);
    }
    async waitForChatIdle(chatKey) {
        for (let attempt = 0; attempt < 80; attempt += 1) {
            if (!this.activeTokens.has(chatKey) && !this.runningByChat.has(chatKey)) return;
            await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
        }
        throw new Error('受影响的旧任务尚未停止');
    }

    cancelAffectedMessageTasks(eventName, index, reason) {
        const affectedSnapshot = (snapshot) => {
            if (!snapshot || snapshot.maintenance || !Number.isInteger(snapshot.messageIndex)) return false;
            if (eventName === 'MESSAGE_DELETED') return snapshot.messageIndex >= index || snapshot.messageIndex - 1 >= index;
            if (eventName === 'MESSAGE_EDITED') return snapshot.messageIndex === index || snapshot.messageIndex - 1 === index;
            return snapshot.messageIndex === index;
        };
        let count = 0;
        for (const [chatKey, snapshot] of this.activeSnapshots.entries()) {
            if (!affectedSnapshot(snapshot)) continue;
            const token = this.activeTokens.get(chatKey);
            if (token && !token.cancelled) { token.cancelled = true; token.reason = reason; count += 1; }
        }
        for (const [chatKey, queue] of this.taskQueues.entries()) {
            for (let position = queue.items.length - 1; position >= 0; position -= 1) {
                const item = queue.items[position];
                const affected = item.maintenance !== true && Number.isInteger(item.index)
                    && (eventName === 'MESSAGE_DELETED' ? item.index >= index || item.index - 1 >= index
                        : eventName === 'MESSAGE_EDITED' ? item.index === index || item.index - 1 === index
                            : item.index === index);
                if (!affected) continue;
                queue.items.splice(position, 1);
                this.pendingTaskKeys.delete(item.taskKey);
                item.reject(new Error(reason));
                count += 1;
            }
            if (!queue.running && !queue.items.length) this.taskQueues.delete(chatKey);
        }
        return count;
    }
    enqueueTask(taskType, index, automatic) {
        const maintenance = ['migration', 'commitMigration', 'undoMigration'].includes(taskType);
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
        const item = { taskType, index: turn.messageIndex, messageKey: turn.messageKey, contentHash: turn.contentHash, automatic: Boolean(automatic), maintenance, taskKey, promise, resolve: resolveTask, reject: rejectTask, queuedAt: Date.now() };
        queue.items.push(item);
        this.taskQueues.set(chatKey, queue);
        this.pendingTaskKeys.add(taskKey);
        if (automatic) this.compactAutomaticQueue(chatKey, queue, this.settings(), turn);
        const position = queue.items.length + (queue.running ? 1 : 0);
        const queuedDetail = `${automatic ? '自动' : ''}${taskType === 'audit' ? '审核' : taskType === 'extraction' ? '提取' : taskType === 'full' ? '审核与提取' : '任务'}已进入异步队列（第${position}项）`;
        if (taskType === 'audit' || taskType === 'full') {
            this.controlPanel.setTaskProgress?.('audit', 'queued', queuedDetail, { messageIndex: turn.messageIndex, queuePosition: position });
            this.controlPanel.setTaskProgress?.('revision', 'idle', '等待审核结论', { messageIndex: turn.messageIndex, queuePosition: position });
        }
        if (taskType === 'extraction' || taskType === 'full') {
            this.controlPanel.setTaskProgress?.('extract', 'queued', taskType === 'full' ? '等待审核/修正' : queuedDetail, { messageIndex: turn.messageIndex, queuePosition: position });
            this.controlPanel.setTaskProgress?.('write', 'queued', '等待提取协议', { messageIndex: turn.messageIndex, queuePosition: position });
        }
        this.controlPanel.setStatus(queuedDetail);
        this.publishTaskStatus();
        globalThis.setTimeout(() => { void this.drainTaskQueue(chatKey); }, 0);
        return promise;
    }
    async runTask(taskType, snapshot, automatic, settings) {
        let activeSnapshot = snapshot;
        const originalAssistantText = String(snapshot?.assistantText ?? '');
        if (!this.started || snapshot.token?.cancelled) {
            const error = new Error(snapshot.token?.reason || '任务已取消');
            error.code = 'MA_TASK_CANCELLED';
            throw error;
        }
        try {
            this.host.assertSnapshot(snapshot, this.settings());
            const cursor = this.host.cursor();
            if (taskType === 'full' && cursor.lastProcessedMessageKey === snapshot.messageKey && cursor.lastProcessedHash === snapshot.contentHash) {
                this.controlPanel.setStatus('该正文已经完整处理，未重复调用模型');
                if (!automatic) notify('info', '镜渊：该正文已经完整处理');
                return [];
            }
            if (taskType === 'audit' || taskType === 'full') {
                this.controlPanel.setTaskProgress?.('audit', 'running', automatic ? '自动审核处理中' : '审核处理中', { messageIndex: snapshot.messageIndex });
                this.controlPanel.setTaskProgress?.('revision', 'idle', '等待审核结论', { messageIndex: snapshot.messageIndex });
            }
            if (taskType === 'extraction' || taskType === 'diagnosticExtraction') {
                this.controlPanel.setTaskProgress?.('extract', 'running', '提取与协议解析处理中', { messageIndex: snapshot.messageIndex });
                this.controlPanel.setTaskProgress?.('write', 'queued', '等待提取协议', { messageIndex: snapshot.messageIndex });
            }
            this.controlPanel.setStatus(taskType === 'audit' ? '审核处理中…' : taskType === 'extraction' ? '提取、解析与语义合并处理中…' : taskType === 'full' ? '自动处理中…' : '任务处理中…');
            let result;
            const fullShouldExtract = taskType === 'full' && settings.extractionEnabled !== false && (!automatic || settings.autoExtraction === true);
            if (taskType === 'audit') {
                if (settings.auditEnabled === false || !String(settings.auditPrompt || '').trim()) {
                    this.controlPanel.setTaskProgress?.('audit', 'disabled', '审核功能已关闭');
                    this.controlPanel.setTaskProgress?.('revision', 'disabled', '审核未执行');
                    this.controlPanel.setStatus('审核功能已关闭');
                    return [];
                }
                if (automatic && settings.autoAudit !== true) {
                    this.controlPanel.setTaskProgress?.('audit', 'disabled', '自动审核已关闭，已跳过');
                    this.controlPanel.setTaskProgress?.('revision', 'disabled', '审核未执行');
                    this.controlPanel.setStatus('自动审核已关闭，本轮未执行');
                    return [];
                }
                activeSnapshot = await this.auditRunner.process(settings, activeSnapshot);
                result = activeSnapshot;
            }
            else if (taskType === 'extraction' || taskType === 'diagnosticExtraction') {
                if (settings.extractionEnabled === false) {
                    this.controlPanel.setTaskProgress?.('extract', 'disabled', '提取功能已关闭');
                    this.controlPanel.setTaskProgress?.('write', 'disabled', '提取未执行');
                    this.controlPanel.setStatus('提取功能已关闭');
                    return [];
                }
                if (automatic && settings.autoExtraction !== true) {
                    this.controlPanel.setTaskProgress?.('extract', 'disabled', '自动提取已关闭，已跳过');
                    this.controlPanel.setTaskProgress?.('write', 'disabled', '提取未执行');
                    this.controlPanel.setStatus('自动提取已关闭，本轮未执行');
                    return [];
                }
                result = taskType === 'diagnosticExtraction'
                    ? await this.memoryRunner.runExtractionOnly(settings, activeSnapshot)
                    : await this.memoryRunner.runTask('extraction', settings, activeSnapshot);
            }
            else if (taskType === 'smallSummary') result = await this.memoryRunner.runTask('smallSummary', settings, activeSnapshot);
            else if (taskType === 'largeSummary') result = await this.memoryRunner.runTask('largeSummary', settings, activeSnapshot);
            else if (taskType === 'migration') result = await this.migrationService.migrate(settings, activeSnapshot);
            else if (taskType === 'commitMigration') result = await this.migrationService.commit(settings, activeSnapshot);
            else if (taskType === 'undoMigration') result = await this.migrationService.undo(settings, activeSnapshot);
            else {
                const shouldAudit = settings.auditEnabled !== false && settings.auditPrompt.trim() && (!automatic || settings.autoAudit === true);
                const shouldExtract = settings.extractionEnabled !== false && (!automatic || settings.autoExtraction === true);
                if (shouldAudit) {
                    activeSnapshot = await this.auditRunner.process(settings, activeSnapshot);
                    this.controlPanel.setTaskProgress?.('audit', activeSnapshot.auditReplaced ? 'warning' : 'success', activeSnapshot.auditReplaced ? '审核未通过' : '审核通过');
                    this.controlPanel.setTaskProgress?.('revision', activeSnapshot.auditReplaced ? 'success' : 'disabled', activeSnapshot.auditReplaced ? '完整修正版已校验并替换' : '无需修正');
                } else {
                    this.controlPanel.setTaskProgress?.('audit', 'disabled', automatic ? '自动审核已关闭' : '审核功能已关闭');
                    this.controlPanel.setTaskProgress?.('revision', 'disabled', '审核未执行');
                }
                this.host.assertSnapshot(activeSnapshot, this.settings());
                result = shouldExtract ? await this.memoryRunner.runTask('extraction', settings, activeSnapshot) : [];
            }
            this.host.assertSnapshot(activeSnapshot, this.settings());
            if (taskType === 'audit') {
                const detail = activeSnapshot.auditDetail || (activeSnapshot.auditReplaced ? '审核未通过，正文已替换' : '审核通过，正文未修改');
                this.controlPanel.setTaskProgress?.('audit', activeSnapshot.auditReplaced ? 'warning' : 'success', activeSnapshot.auditReplaced ? '审核未通过' : '审核通过');
                this.controlPanel.setTaskProgress?.('revision', activeSnapshot.auditReplaced ? 'success' : 'disabled', activeSnapshot.auditReplaced ? '完整修正版已校验并替换' : '无需修正');
                this.controlPanel.setStatus(detail);
            }
            else if (taskType === 'extraction' || taskType === 'diagnosticExtraction') {
                const completion = extractionCompletion(result, activeSnapshot.worldbookName);
                this.controlPanel.setTaskProgress?.('extract', 'success', '提取协议完成', completion.meta);
                this.controlPanel.setTaskProgress?.('write', 'success', completion.detail, completion.meta);
                this.controlPanel.setStatus(completion.detail);
            }
            else if (taskType === 'smallSummary') {
                this.controlPanel.setTaskProgress?.('extract', 'success', '小总结、分发与召回重排完成');
                this.controlPanel.setStatus('小总结、分发与召回重排完成');
            }
            else if (taskType === 'largeSummary') {
                this.controlPanel.setTaskProgress?.('extract', 'success', '大总结、沉降分发与召回重排完成');
                this.controlPanel.setStatus('大总结、沉降分发与召回重排完成');
            }
            else if (taskType === 'migration') {
                this.controlPanel.setStatus(result?.previewReady ? `世界书重建预览已生成：${result.batches ?? 0}批、请求${result.requests ?? 0}次、失败批次${result.failedBatches ?? 0}个，新条目${result.rebuiltEntries}个、附属并入${result.absorbedEntries ?? 0}个；提交前未修改旧表` : (result?.message || '没有可重建条目'));
            }
            else if (taskType === 'commitMigration') {
                this.controlPanel.setStatus(`世界书重建已提交：旧表删除${result?.deletedOldEntries ?? 0}条，新结构${result?.rebuiltEntries ?? 0}条`);
            }
            else if (taskType === 'undoMigration') {
                this.controlPanel.setStatus('上次世界书重建已撤销，旧表已恢复');
            }
            else {
                if (fullShouldExtract) {
                    const completion = extractionCompletion(result, activeSnapshot.worldbookName);
                    this.controlPanel.setTaskProgress?.('extract', 'success', '提取协议完成', completion.meta);
                    this.controlPanel.setTaskProgress?.('write', 'success', completion.detail, completion.meta);
                    this.controlPanel.setStatus(`${activeSnapshot.auditDetail || '审核已跳过'}；${completion.detail}`);
                }
                else {
                    this.controlPanel.setTaskProgress?.('extract', 'disabled', '自动提取已关闭');
                    this.controlPanel.setTaskProgress?.('write', 'disabled', '提取未执行');
                    this.controlPanel.setStatus(`${activeSnapshot.auditDetail || '自动审核已跳过'}；自动提取已关闭`);
                }
            }
            // [MA-UI-SYNC-02] 只在提取、总结与召回重排全部结束后回读一次世界书，避免 UI 显示中间状态。
            if (['extraction', 'smallSummary', 'largeSummary', 'full', 'migration', 'commitMigration', 'undoMigration'].includes(taskType)) {
                await this.controlPanel.refreshRecallMap?.();
            }
            notify('success', '镜渊：本轮处理完成');
            return result;
        } catch (error) {
            let effectiveError = error;
            if (taskType === 'full' && activeSnapshot?.auditReplacementVerified === true && originalAssistantText) {
                try {
                    const recoveryToken = { cancelled: false, reason: '' };
                    const recoverySnapshot = this.host.captureSnapshot(settings, snapshot.messageIndex, 'fullRevisionRollback', recoveryToken);
                    await this.host.replaceAssistantText(recoverySnapshot, originalAssistantText, settings);
                    activeSnapshot.auditReplacementVerified = false;
                    activeSnapshot.auditReplaced = false;
                }
                catch (rollbackError) {
                    effectiveError = new Error(`完整处理失败，且修正版正文恢复失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackError)}`);
                }
            }
            const text = (0, util_1.errorText)(effectiveError);
            if ((snapshot.token?.cancelled && !/超时/u.test(snapshot.token.reason || '')) || effectiveError?.code === 'MA_TASK_CANCELLED') {
                const reason = snapshot.token?.reason || text || '任务已取消';
                this.controlPanel.setStatus(`任务已取消：${reason}`);
                if (!automatic) notify('info', `镜渊：${reason}`);
                const cancelled = new Error(reason);
                cancelled.code = 'MA_TASK_CANCELLED';
                throw cancelled;
            }
            if (taskType === 'audit' || taskType === 'full') {
                const revisionRunning = this.controlPanel.taskStates?.revision?.state === 'running';
                this.controlPanel.setTaskProgress?.(revisionRunning ? 'revision' : 'audit', 'error', text, { error: text });
            }
            if (taskType === 'extraction' || taskType === 'full') {
                const writeRunning = this.controlPanel.taskStates?.write?.state === 'running';
                this.controlPanel.setTaskProgress?.(writeRunning ? 'write' : 'extract', 'error', text, { error: text });
            }
            const stagePrefix = taskType === 'full' && activeSnapshot?.auditReplacementVerified === true
                ? '审核修正已完成；后续提取或写入失败'
                : '处理失败';
            this.controlPanel.setStatus(`${stagePrefix}：${text}`, true);
            notify('error', `镜渊：${text}`);
            throw effectiveError;
        }
    }
    enqueueMaintenance(taskType, action) {
        const chatKey = this.host.chatKey();
        let resolveTask;
        let rejectTask;
        const promise = new Promise((resolve, reject) => { resolveTask = resolve; rejectTask = reject; });
        const queue = this.taskQueues.get(chatKey) ?? { running: false, items: [] };
        const taskKey = `${chatKey}|maintenance|${taskType}|${Date.now()}|${Math.random().toString(36).slice(2)}`;
        queue.items.push({
            taskType,
            index: -1,
            automatic: false,
            maintenance: true,
            maintenanceAction: action,
            taskKey,
            promise,
            resolve: resolveTask,
            reject: rejectTask,
            queuedAt: Date.now(),
        });
        this.taskQueues.set(chatKey, queue);
        this.pendingTaskKeys.add(taskKey);
        const position = queue.items.length + (queue.running ? 1 : 0);
        const label = taskType === 'apiProbe' ? 'API 探针' : '世界书操作';
        this.controlPanel.setStatus(`${label}已进入异步队列（第${position}项）`);
        this.publishTaskStatus();
        globalThis.setTimeout(() => { void this.drainTaskQueue(chatKey); }, 0);
        return promise;
    }

    async runMaintenanceAction(item, settings, snapshot) {
        if (!this.started || snapshot.token?.cancelled) {
            const error = new Error(snapshot.token?.reason || '任务已取消');
            error.code = 'MA_TASK_CANCELLED';
            throw error;
        }
        const label = item.taskType === 'apiProbe' ? 'API 探针' : '世界书操作';
        try {
            this.controlPanel.setStatus(`${label}处理中…`);
            const result = await item.maintenanceAction(settings, snapshot);
            this.controlPanel.setStatus(`${label}完成`);
            return result;
        }
        catch (error) {
            if (error?.code === 'MA_TASK_CANCELLED' || snapshot.token?.cancelled) {
                const cancelled = new Error(snapshot.token?.reason || (0, util_1.errorText)(error) || '任务已取消');
                cancelled.code = 'MA_TASK_CANCELLED';
                this.controlPanel.setStatus(`${label}已取消`);
                throw cancelled;
            }
            this.controlPanel.setStatus(`${label}失败：${(0, util_1.errorText)(error)}`, true);
            throw error;
        }
    }
    compactAutomaticQueue(chatKey, queue, settings, latestTurn) {
        const candidates = queue.items.filter((item) => item.automatic && ['full', 'extraction'].includes(item.taskType));
        const threshold = Math.max(2, Number(settings.queueCompactThreshold || settings.smallSummaryTurns || 6));
        if (candidates.length < threshold) return;
        // [MA-QUEUE-05] 不再把尚未执行的逐轮提取替换成小总结/大总结。
        // 每个正文回合的事实提取都必须先完成；总结只能由提取完成后的正式总结调度触发。
        // 队列积压时仅提示当前状态，不改变任何任务类型、顺序或处理承诺。
        this.controlPanel.setTaskProgress?.('extract', 'queued', `队列积压${candidates.length}项，逐轮提取按原顺序保留`, { messageIndex: latestTurn.messageIndex, queuePosition: queue.items.length });
        this.controlPanel.setStatus(`异步队列积压${candidates.length}项；逐轮审核/提取按原顺序处理，未改写为总结`);
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
                    this.publishTaskStatus();
                    this.runningByChat.set(chatKey, item.promise);
                    const result = typeof item.maintenanceAction === 'function'
                        ? await this.runMaintenanceAction(item, settings, snapshot)
                        : await this.runTask(item.taskType, snapshot, item.automatic, settings);
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
                    this.publishTaskStatus();
                }
            }
        }
        finally {
            queue.running = false;
            if (!queue.items.length) this.taskQueues.delete(chatKey);
            this.publishTaskStatus();
            if (queue.items.length) globalThis.setTimeout(() => { void this.drainTaskQueue(chatKey); }, 0);
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
        this.publishTaskStatus();
        return count;
    }
    cancelAll(reason) {
        for (const token of this.activeTokens.values()) {
            token.cancelled = true;
            token.reason = reason;
        }
        this.rejectQueuedTasks(reason);
        this.publishTaskStatus();
    }
}
exports.MirrorAbyssApplication = MirrorAbyssApplication;
function extractionCompletion(result, fallbackWorldbookName = '') {
    const worldbookName = String(result?.worldbookName || fallbackWorldbookName || '当前绑定世界书');
    const warehouse = result?.warehouse ?? {};
    const created = Array.isArray(warehouse.created) ? warehouse.created : [];
    const updated = Array.isArray(warehouse.updated) ? warehouse.updated : [];
    const deleted = Array.isArray(warehouse.deleted) ? warehouse.deleted : [];
    const businessWriteCount = created.length + updated.length + deleted.length;
    return {
        detail: businessWriteCount > 0
            ? `已写入世界书“${worldbookName}”：新建${created.length}、更新${updated.length}、删除${deleted.length}`
            : `世界书“${worldbookName}”业务条目零写入`,
        meta: { created, updated, deleted, worldbookName, businessWriteCount },
    };
}

function notify(kind, message) {
    const toast = globalThis.toastr?.[kind];
    if (typeof toast === 'function') toast(message);
    else console[kind === 'error' ? 'error' : 'info'](`[MirrorAbyss] ${message}`);
}
function receiptAffectedBySourceChange(receipt, eventName, index) {
    const assistantIndex = Number(receipt?.messageIndex);
    const playerIndex = Number(receipt?.playerMessageIndex);
    if (!Number.isInteger(index)) return false;
    if (eventName === 'MESSAGE_EDITED') {
        return (Number.isInteger(assistantIndex) && assistantIndex >= index)
            || (Number.isInteger(playerIndex) && playerIndex >= index);
    }
    if (eventName === 'MESSAGE_SWIPED' || eventName === 'MESSAGE_DELETED') {
        return (Number.isInteger(assistantIndex) && assistantIndex >= index)
            || (Number.isInteger(playerIndex) && playerIndex >= index);
    }
    return false;
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
    constructor(host, getSettings, onProgress = () => undefined) {
        this.host = host;
        this.getSettings = getSettings;
        this.onProgress = typeof onProgress === 'function' ? onProgress : () => undefined;
        this.revisionService = new revision_1.RevisionService(host, getSettings);
        this.statusByChat = new Map();
    }
    currentStatus(chatKey = '') {
        const key = chatKey || safeChatKey(this.host);
        return structuredClone(this.statusByChat.get(key) ?? { phase: 'idle', detail: '等待审核', error: '' });
    }

    resetStatus(chatKey = '') {
        if (chatKey) this.statusByChat.delete(chatKey);
        else this.statusByChat.clear();
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
            const prompt = (0, prompts_1.auditPrompts)(settings, snapshot.playerText, snapshot.assistantText, { dialogueContext: snapshot.dialogueContext });
            let raw = await (0, model_request_1.callModel)({
                host: this.host,
                stage: 'audit',
                prompt,
                fallbackPrompt: () => (0, prompts_1.auditPrompts)(settings, snapshot.playerText, snapshot.assistantText, { compact: true, dialogueContext: snapshot.dialogueContext }),
                settings,
                snapshot,
                profileId: settings.auditProfileId,
                sourceText: snapshot.turnText || snapshot.assistantText,
                onRetry: (error) => this.setStatus(snapshot.chatKey, 'audit', (0, model_request_1.describeRetryReason)(error, '审核模型')),
            });
            this.host.assertSnapshot(snapshot, this.getSettings());
            let result;
            try {
                result = parseAuditResult(raw);
            }
            catch (protocolError) {
                if (/越权返回了修正版正文/u.test((0, util_1.errorText)(protocolError))) throw protocolError;
                this.setStatus(snapshot.chatKey, 'audit', '审核结论格式不完整，正在进行一次自然格式重试');
                const repairPrompt = {
                    system: `职责：整理审核结论。
重新检查给定审核规则与本轮回复，只提交最终结论。
通过时只写“审核结论：通过”。
不通过时写“审核结论：需要修正”，随后写“问题：”并列出最多8条具体原因。
禁止输出修正版正文、分析、前言和后记。`,
                    user: `玩家审核规则：
${String(settings.auditPrompt || '（无）').slice(0, 5200)}

本轮玩家输入：
${String(snapshot.playerText || '（空）').slice(0, 3000)}

本轮AI最终回复：
${String(snapshot.assistantText || '').slice(0, 14000)}

上一次未能解析的审核返回：
${String(raw || '').slice(0, 2400)}`,
                };
                raw = await (0, model_request_1.callModel)({
                    host: this.host,
                    stage: 'audit',
                    prompt: repairPrompt,
                    fallbackPrompt: () => repairPrompt,
                    settings,
                    snapshot,
                    profileId: settings.auditProfileId,
                    sourceText: snapshot.turnText || snapshot.assistantText,
                    onRetry: (error) => this.setStatus(snapshot.chatKey, 'audit', (0, model_request_1.describeRetryReason)(error, '审核格式重试')),
                });
                this.host.assertSnapshot(snapshot, this.getSettings());
                result = parseAuditResult(raw);
            }
            let finalSnapshot = snapshot;
            if (result.decision === 'revision') {
                this.setStatus(snapshot.chatKey, 'revision', '审核不通过，生成一次完整修正版');
                const revisedText = await this.revisionService.revise(settings, snapshot, result.issues, (detail) => this.setStatus(snapshot.chatKey, 'revision', detail));
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
        const status = { chatKey, phase, detail, error };
        this.statusByChat.set(chatKey, { phase, detail, error });
        try { this.onProgress(status); }
        catch (callbackError) { console.warn('[MirrorAbyss] audit progress callback failed', callbackError); }
    }
}
exports.AuditRunner = AuditRunner;

/** [MA-AUDIT-02] 审核结果协议：优先使用自然中文结论，同时兼容旧 PASS/FAIL。 */
function parseAuditResult(raw) {
    const text = (0, parser_1.sanitizeModelText)(raw);
    if (!text) throw new Error('审核模型没有返回可识别内容');
    if (/【\s*(?:最小修正版正文|修正版正文|完整正文|正文)\s*】/u.test(text))
        throw new Error('审核模型越权返回了修正版正文');
    const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    let decision = '';
    let decisionLineIndex = -1;
    let inlineReason = '';
    for (let index = 0; index < Math.min(lines.length, 12); index += 1) {
        const clean = (0, parser_1.stripListMarker)(lines[index])
            .replace(/^#{1,6}\s*/u, '')
            .replace(/^\*\*(.*?)\*\*$/u, '$1')
            .trim();
        const match = clean.match(/^(?:(?:审核|检查)?(?:结论|结果|判定)\s*[：:]\s*)?(PASS|FAIL|不通过|未通过|需要修正|通过)(?:\s*[。.!！]?)?(?:\s*[：:]\s*(.*))?$/iu);
        if (!match) continue;
        const token = String(match[1] || '').toUpperCase();
        decision = /^(?:PASS|通过)$/iu.test(token) ? 'pass' : 'revision';
        decisionLineIndex = index;
        inlineReason = String(match[2] || '').trim();
        break;
    }
    const passCue = /(?:未发现|没有发现|不存在)[^。；;\n]{0,28}(?:违规|问题|违反)|(?:符合|满足)[^。；;\n]{0,24}(?:审核规则|规则|要求)|(?:审核|检查)(?:结论|结果)?\s*[：:]?\s*通过|无需(?:修正|修改)/u.test(text);
    const negativeStripped = text
        .replace(/(?:未发现|没有发现|不存在)[^。；;\n]{0,28}(?:违规|问题|违反)/gu, '')
        .replace(/无需(?:修正|修改)/gu, '');
    const failCue = /(?:需要修正|不通过|未通过)|(?:发现|存在|出现)[^。；;\n]{0,20}(?:违规|问题)|违反[^。；;\n]{0,24}(?:规则|要求)|触发[^。；;\n]{0,24}(?:规则|禁止)/u.test(negativeStripped);
    if (!decision) {
        if (passCue && !failCue) decision = 'pass';
        else if (failCue) decision = 'revision';
    }
    if (!decision) throw new Error('审核返回缺少可识别的“通过”或“需要修正”结论');
    if (decision === 'pass') return { decision: 'pass', issues: [] };
    const sections = (0, parser_1.parseLabeledSections)(text);
    let issues = ['原因', '违反规则', '问题', '违规', '需要修正']
        .flatMap((name) => nonEmptyLines(sections.get(name)))
        .filter((line) => !isNone(line));
    if (inlineReason) issues.unshift(inlineReason);
    if (!issues.length) {
        issues = lines
            .filter((_line, index) => index !== decisionLineIndex)
            .map((line) => (0, parser_1.stripListMarker)(line
                .replace(/^#{1,6}\s*/u, '')
                .replace(/^\*\*(.*?)\*\*$/u, '$1')
                .replace(/^\s*【[^】]+】\s*$/u, '')
                .replace(/^\s*(?:原因|问题|违规|违反规则|需要修正)\s*[：:]?\s*$/u, '')).trim())
            .filter((line) => line && !isNone(line) && !/(?:审核|检查)(?:结论|结果|判定)\s*[：:]?\s*(?:需要修正|不通过|未通过|FAIL)/iu.test(line));
    }
    if (!issues.length) {
        issues = text.split(/[。；;\n]/u)
            .map((line) => line.trim())
            .filter((line) => /(?:违规|问题|违反|触发|读心|越权|预设成功|未提供信息)/u.test(line))
            .slice(0, 8);
    }
    issues = [...new Set(issues
        .map((line) => line.replace(/^[：:\-—–\s]+/u, '').trim())
        .filter(Boolean))].slice(0, 8);
    if (!issues.length) throw new Error('审核判断为需要修正，但没有指出具体问题或原因');
    return { decision: 'revision', issues };
}
function nonEmptyLines(lines = []) { return lines.map((line) => (0, parser_1.stripListMarker)(line).trim()).filter(Boolean); }
function isNone(value) { return /^\s*(?:无|没有|无问题)\s*[。.]?\s*$/u.test(String(value ?? '')); }
function safeChatKey(host) { try { return host.chatKey(); } catch { return ''; } }
},"constants":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGED_VERSION = exports.MAX_CONTEXT_CHARS = exports.WORLD_INFO_EXTENSION_KEY = exports.EXTENSION_NAMESPACE = exports.DISPLAY_NAME = exports.VERSION = void 0;
exports.VERSION = '2.0.0-lite.ui.72-fresh-audit-scheduler';
exports.DISPLAY_NAME = 'Mirror Abyss｜镜渊';
exports.EXTENSION_NAMESPACE = 'mirrorAbyssLite';
exports.WORLD_INFO_EXTENSION_KEY = 'mirrorAbyssInfoPoint';
exports.MAX_CONTEXT_CHARS = 48000;
exports.MANAGED_VERSION = 20;
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
const LAUNCHER_POSITION_KEY = 'mirrorAbyssLite.launcherPosition.v1';
const LAUNCHER_SIZE = 44;
const LAUNCHER_MARGIN = 8;
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
        this.managementNode = null;
        this.managementStatusNode = null;
        this.managementRefreshButton = null;
        this.managementLoadSerial = 0;
        this.rebuildNode = null;
        this.rebuildStatusNode = null;
        this.rebuildPreviewButton = null;
        this.rebuildCommitButton = null;
        this.rebuildUndoButton = null;
        this.worldSettingTextarea = null;
        this.worldSettingStatusNode = null;
        this.worldSettingPreviewNode = null;
        this.worldSettingPreviewButton = null;
        this.worldSettingCommitButton = null;
        this.worldSettingClearButton = null;
        this.worldSettingDirty = false;
        this.diagnosticStatusNode = null;
        this.diagnosticReportNode = null;
        this.diagnosticRunButton = null;
        this.diagnosticExportButton = null;
        this.recallLoadSerial = 0;
        this.recallModel = null;
        this.recallWorldbookName = '';
        this.recallPage = 1;
        this.recallPageSize = 12;
        this.pageNodes = {};
        this.pageButtons = {};
        this.activePage = 'run';
        this.apiProfileSelect = null;
        this.apiProfileStatusNode = null;
        this.worldbookQuickStatusNode = null;
        this.globalTaskNode = null;
        this.profileDropdownBound = false;
        this.profileSelectionRevision = 0;
        this.settingsEntry = null;
        this.inputs = {};
        this.buttons = {};
        this.pendingActions = new Set();
        this.globalTaskState = { active: false, queued: 0 };
        this.lastOutcome = null;
        this.taskStates = { audit: freshTaskState('待命'), revision: freshTaskState('待命'), extract: freshTaskState('待命'), write: freshTaskState('待命') };
        this.pipelineNodes = {};
        this.statusText = '就绪';
        this.statusError = false;
        this.observer = null;
        this.hostObserver = null;
        this.observedChat = null;
        this.hostBindFrame = 0;
        this.pendingIndicatorFrame = 0;
        this.messageTaskStates = new Map();
        this.waitingForDom = false;
        this.launcherCleanup = [];
        this.dragState = null;
        this.suppressLauncherClick = false;
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
        launcher.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.suppressLauncherClick) {
                this.suppressLauncherClick = false;
                return;
            }
            this.togglePanel();
        });
        root.append(launcher);
        document.body.append(root);
        const panel = this.buildPanel();
        document.body.append(panel);
        this.root = root;
        this.launcher = launcher;
        this.panel = panel;
        // [MA-UI-DRAG-01] 浮动入口使用 Pointer Events，鼠标和触屏共用同一套拖动逻辑。
        // 拖动位置只保存到浏览器 localStorage，不进入剧情设置，也不耦合审核/提取模块。
        this.applySavedLauncherPosition();
        this.bindLauncherDrag();
        this.bindApiProfileSelector();
        this.ensureHostBindings();
        this.observeHostDom();
        this.refresh();
        this.scheduleIndicatorRefresh();
    }
    unmount(removeStyle = true) {
        if (typeof document === 'undefined') return;
        if (this.waitingForDom) document.removeEventListener('DOMContentLoaded', this.onDomReady);
        this.waitingForDom = false;
        this.observer?.disconnect();
        this.observer = null;
        this.hostObserver?.disconnect();
        this.hostObserver = null;
        this.observedChat = null;
        if (this.hostBindFrame) cancelAnimationFrame(this.hostBindFrame);
        this.hostBindFrame = 0;
        this.launcherCleanup.splice(0).forEach((cleanup) => { try { cleanup(); } catch { } });
        this.dragState = null;
        this.suppressLauncherClick = false;
        if (this.pendingIndicatorFrame) cancelAnimationFrame(this.pendingIndicatorFrame);
        this.pendingIndicatorFrame = 0;
        this.root?.remove();
        this.panel?.remove();
        this.settingsEntry?.remove();
        document.querySelectorAll(`.${INDICATOR_CLASS}`).forEach((node) => node.remove());
        this.messageTaskStates.clear();
        if (removeStyle) document.getElementById(STYLE_ID)?.remove();
        this.root = null;
        this.launcher = null;
        this.panel = null;
        this.statusNode = null;
        this.recallNode = null;
        this.recallStatusNode = null;
        this.recallRefreshButton = null;
        this.recallReplanButton = null;
        this.managementNode = null;
        this.managementStatusNode = null;
        this.managementRefreshButton = null;
        this.managementLoadSerial = 0;
        this.rebuildNode = null;
        this.rebuildStatusNode = null;
        this.rebuildPreviewButton = null;
        this.rebuildCommitButton = null;
        this.rebuildUndoButton = null;
        this.worldSettingTextarea = null;
        this.worldSettingStatusNode = null;
        this.worldSettingPreviewNode = null;
        this.worldSettingPreviewButton = null;
        this.worldSettingCommitButton = null;
        this.worldSettingClearButton = null;
        this.worldSettingDirty = false;
        this.diagnosticStatusNode = null;
        this.diagnosticReportNode = null;
        this.diagnosticRunButton = null;
        this.diagnosticExportButton = null;
        this.recallLoadSerial += 1;
        this.recallModel = null;
        this.recallWorldbookName = '';
        this.recallPage = 1;
        this.pageNodes = {};
        this.pageButtons = {};
        this.activePage = 'run';
        this.apiProfileSelect = null;
        this.apiProfileStatusNode = null;
        this.worldbookQuickStatusNode = null;
        this.globalTaskNode = null;
        this.profileDropdownBound = false;
        this.profileSelectionRevision = 0;
        this.settingsEntry = null;
        this.inputs = {};
        this.buttons = {};
        this.pendingActions = new Set();
    }
    applySavedLauncherPosition() {
        if (!this.root || typeof window === 'undefined') return;
        try {
            const saved = JSON.parse(window.localStorage?.getItem(LAUNCHER_POSITION_KEY) || 'null');
            if (!saved || !Number.isFinite(saved.xRatio) || !Number.isFinite(saved.yRatio)) return;
            const maxLeft = Math.max(LAUNCHER_MARGIN, window.innerWidth - LAUNCHER_SIZE - LAUNCHER_MARGIN);
            const maxTop = Math.max(LAUNCHER_MARGIN, window.innerHeight - LAUNCHER_SIZE - LAUNCHER_MARGIN);
            const left = LAUNCHER_MARGIN + clamp01(saved.xRatio) * Math.max(0, maxLeft - LAUNCHER_MARGIN);
            const top = LAUNCHER_MARGIN + clamp01(saved.yRatio) * Math.max(0, maxTop - LAUNCHER_MARGIN);
            this.setLauncherPosition(left, top, false);
        }
        catch { }
    }
    bindLauncherDrag() {
        const launcher = this.launcher;
        const root = this.root;
        if (!launcher || !root || typeof window === 'undefined') return;
        const onPointerDown = (event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            event.stopPropagation();
            const rect = root.getBoundingClientRect();
            this.dragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                left: rect.left,
                top: rect.top,
                moved: false,
            };
            try { launcher.setPointerCapture?.(event.pointerId); } catch { }
        };
        const onPointerMove = (event) => {
            const state = this.dragState;
            if (!state || state.pointerId !== event.pointerId) return;
            const dx = event.clientX - state.startX;
            const dy = event.clientY - state.startY;
            if (!state.moved && Math.hypot(dx, dy) < 6) return;
            state.moved = true;
            event.preventDefault();
            event.stopPropagation();
            root.classList.add('is-dragging');
            this.setLauncherPosition(state.left + dx, state.top + dy, false);
        };
        const finish = (event) => {
            const state = this.dragState;
            if (!state || state.pointerId !== event.pointerId) return;
            if (state.moved) event.preventDefault();
            event.stopPropagation();
            try { launcher.releasePointerCapture?.(event.pointerId); } catch { }
            root.classList.remove('is-dragging');
            if (state.moved) {
                this.suppressLauncherClick = true;
                window.setTimeout(() => { this.suppressLauncherClick = false; }, 500);
                this.persistLauncherPosition();
            }
            this.dragState = null;
        };
        const onResize = () => {
            if (!this.root || this.dragState) return;
            const rect = this.root.getBoundingClientRect();
            if (this.root.style.left) this.setLauncherPosition(rect.left, rect.top, true);
        };
        launcher.addEventListener('pointerdown', onPointerDown);
        launcher.addEventListener('pointermove', onPointerMove);
        launcher.addEventListener('pointerup', finish);
        launcher.addEventListener('pointercancel', finish);
        window.addEventListener('resize', onResize, { passive: true });
        this.launcherCleanup.push(() => launcher.removeEventListener('pointerdown', onPointerDown));
        this.launcherCleanup.push(() => launcher.removeEventListener('pointermove', onPointerMove));
        this.launcherCleanup.push(() => launcher.removeEventListener('pointerup', finish));
        this.launcherCleanup.push(() => launcher.removeEventListener('pointercancel', finish));
        this.launcherCleanup.push(() => window.removeEventListener('resize', onResize));
    }
    setLauncherPosition(left, top, persist = false) {
        if (!this.root || typeof window === 'undefined') return;
        const maxLeft = Math.max(LAUNCHER_MARGIN, window.innerWidth - LAUNCHER_SIZE - LAUNCHER_MARGIN);
        const maxTop = Math.max(LAUNCHER_MARGIN, window.innerHeight - LAUNCHER_SIZE - LAUNCHER_MARGIN);
        const nextLeft = Math.min(maxLeft, Math.max(LAUNCHER_MARGIN, Number(left) || LAUNCHER_MARGIN));
        const nextTop = Math.min(maxTop, Math.max(LAUNCHER_MARGIN, Number(top) || LAUNCHER_MARGIN));
        this.root.style.left = `${Math.round(nextLeft)}px`;
        this.root.style.top = `${Math.round(nextTop)}px`;
        this.root.style.right = 'auto';
        this.root.style.bottom = 'auto';
        this.root.style.transform = 'none';
        if (persist) this.persistLauncherPosition();
    }
    persistLauncherPosition() {
        if (!this.root || typeof window === 'undefined') return;
        try {
            const rect = this.root.getBoundingClientRect();
            const horizontal = Math.max(1, window.innerWidth - LAUNCHER_SIZE - LAUNCHER_MARGIN * 2);
            const vertical = Math.max(1, window.innerHeight - LAUNCHER_SIZE - LAUNCHER_MARGIN * 2);
            const value = {
                xRatio: clamp01((rect.left - LAUNCHER_MARGIN) / horizontal),
                yRatio: clamp01((rect.top - LAUNCHER_MARGIN) / vertical),
            };
            window.localStorage?.setItem(LAUNCHER_POSITION_KEY, JSON.stringify(value));
        }
        catch { }
    }
    installStyle() {
        document.getElementById(STYLE_ID)?.remove();
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#${ROOT_ID}.ma-lite-floating-entry{position:fixed;right:max(10px,env(safe-area-inset-right));top:50dvh;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;z-index:10050;pointer-events:auto!important;user-select:none;-webkit-user-select:none}
#${ROOT_ID}.ma-lite-floating-entry.is-dragging{transform:none!important}
.ma-lite-launcher{box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.28));border-radius:50%;background:color-mix(in srgb,var(--SmartThemeBlurTintColor,#17171c) 92%,transparent);color:var(--SmartThemeBodyColor,#fff);box-shadow:0 6px 20px rgba(0,0,0,.46);backdrop-filter:blur(10px);font-size:17px;cursor:pointer;touch-action:none;pointer-events:auto!important;-webkit-tap-highlight-color:transparent}
.ma-lite-launcher:hover,.ma-lite-launcher:focus-visible{transform:scale(1.06)}
#${ROOT_ID}.is-dragging .ma-lite-launcher{transform:none!important;cursor:grabbing}
.ma-lite-launcher span{display:none}
#${PANEL_ID}{position:fixed;top:max(8px,env(safe-area-inset-top));right:max(10px,env(safe-area-inset-right));z-index:10051;box-sizing:border-box;width:min(360px,calc(100vw - 20px));max-height:calc(100dvh - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom));overflow:auto;padding:0;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.2));border-radius:12px;background:var(--SmartThemeBlurTintColor,#17171c);color:var(--SmartThemeBodyColor,#fff);box-shadow:0 12px 34px rgba(0,0,0,.48);backdrop-filter:blur(12px);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
#${PANEL_ID}[hidden]{display:none!important}
.ma-lite-header{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:10px;padding:12px;border-bottom:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));background:var(--SmartThemeBlurTintColor,#17171c);backdrop-filter:none;box-shadow:0 4px 10px rgba(0,0,0,.22)}
.ma-lite-title{min-width:0;flex:1}.ma-lite-title strong{display:block;font-size:15px}.ma-lite-title small{display:block;margin-top:2px;opacity:.62;font-size:11px}
.ma-lite-close{min-width:44px;min-height:44px;border:0;border-radius:8px;background:var(--black30a,rgba(255,255,255,.08));color:inherit;cursor:pointer}
.ma-lite-body{display:flex;flex-direction:column;gap:10px;padding:12px}
.ma-lite-page-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding-bottom:2px;background:var(--SmartThemeBlurTintColor,#17171c);backdrop-filter:none}.ma-lite-page-tab{min-height:44px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:8px;background:rgba(0,0,0,.14);color:inherit;cursor:pointer}.ma-lite-page-tab[aria-selected="true"]{border-color:rgba(112,181,255,.55);background:rgba(112,181,255,.14);font-weight:700}.ma-lite-page{display:flex;flex-direction:column;gap:12px}.ma-lite-page[hidden]{display:none!important}
.ma-lite-api{display:flex;flex-direction:column;gap:7px;padding:10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:9px;background:var(--black30a,rgba(255,255,255,.04))}.ma-lite-api-head{display:flex;align-items:center;gap:7px;font-size:13px}.ma-lite-api-head i{opacity:.72}.ma-lite-api-select{box-sizing:border-box;width:100%;min-height:44px;padding:6px 9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.18));border-radius:7px;background:rgba(0,0,0,.22);color:inherit}.ma-lite-api-probe{min-height:44px;border:1px solid rgba(112,181,255,.48);border-radius:8px;background:rgba(112,181,255,.1);color:inherit;cursor:pointer}.ma-lite-api-probe:disabled{opacity:.42;cursor:not-allowed}.ma-lite-api-status{font-size:11px;line-height:1.4;opacity:.72}.ma-lite-api-help{font-size:10px;line-height:1.4;opacity:.52}
.ma-lite-switches{display:grid;grid-template-columns:1fr;gap:8px}
.ma-lite-switch{box-sizing:border-box;display:flex;align-items:center;gap:9px;min-height:44px;padding:9px 10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.04));cursor:pointer}
.ma-lite-switch input{width:18px;height:18px;margin:0;flex:0 0 auto}.ma-lite-switch-text{min-width:0;flex:1}.ma-lite-switch-text b{display:block;font-size:13px}.ma-lite-switch-text small{display:block;margin-top:2px;opacity:.58;font-size:11px;line-height:1.35}
.ma-lite-thresholds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.ma-lite-number{display:flex;flex-direction:column;gap:4px;padding:7px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:8px;font-size:10px}.ma-lite-number input{box-sizing:border-box;width:100%;min-height:30px;padding:4px 6px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.16));border-radius:6px;background:rgba(0,0,0,.2);color:inherit}.ma-lite-text-setting{display:flex;flex-direction:column;gap:5px;padding:9px 10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.04))}.ma-lite-text-setting b{font-size:13px}.ma-lite-text-setting small{font-size:11px;line-height:1.35;opacity:.58}.ma-lite-text-setting input{box-sizing:border-box;width:100%;min-height:40px;padding:7px 9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.18));border-radius:7px;background:rgba(0,0,0,.22);color:inherit}.ma-lite-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ma-lite-action{min-height:46px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.16));border-radius:9px;background:var(--black50a,rgba(255,255,255,.08));color:inherit;font-weight:700;cursor:pointer;touch-action:manipulation;pointer-events:auto!important;-webkit-tap-highlight-color:transparent}.ma-lite-action:disabled{opacity:.42;cursor:not-allowed}.ma-lite-action[data-kind="process"]{grid-column:1/-1;border-color:rgba(111,214,164,.65);background:rgba(111,214,164,.1)}.ma-lite-action[data-kind="audit"]{border-color:rgba(112,181,255,.5)}.ma-lite-action[data-kind="extract"]{border-color:rgba(111,214,164,.5)}.ma-lite-action[data-kind="cancel"]{border-color:rgba(255,150,120,.45);font-weight:500}
.ma-lite-status{min-height:38px;padding:9px 10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.2));border-radius:8px;background:var(--SmartThemeBlurTintColor,#17171c);color:var(--SmartThemeBodyColor,#fff);font-size:12px;font-weight:500;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}.ma-lite-pipeline{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.ma-lite-stage{min-width:0;padding:8px 6px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:8px;background:rgba(0,0,0,.12);text-align:center}.ma-lite-stage-head{display:flex;align-items:center;justify-content:center;gap:5px;font-size:10px;font-weight:700}.ma-lite-stage-detail{margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;opacity:.62}.ma-lite-tool-group{border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:rgba(0,0,0,.08)}.ma-lite-tool-group>summary{box-sizing:border-box;display:flex;align-items:center;min-height:44px;padding:10px;cursor:pointer;font-size:12px;font-weight:700}.ma-lite-tool-group>.ma-lite-tool-content{display:flex;flex-direction:column;gap:10px;padding:0 8px 8px}.ma-lite-status[data-error="true"]{border-color:rgba(255,126,126,.38);border-left:3px solid rgba(255,126,126,.72);background:linear-gradient(90deg,rgba(255,96,96,.10),rgba(0,0,0,.07));color:var(--SmartThemeBodyColor,#fff);font-weight:520;box-shadow:none}.ma-lite-note{font-size:11px;line-height:1.5;opacity:.58}
.ma-lite-reset{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid rgba(255,150,120,.28);border-radius:9px;background:rgba(120,30,20,.08)}.ma-lite-reset-head{font-size:13px}.ma-lite-reset-help{font-size:10px;line-height:1.45;opacity:.65}.ma-lite-reset-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ma-lite-reset-actions button{min-height:44px;border:1px solid rgba(255,150,120,.35);border-radius:8px;background:rgba(80,20,15,.18);color:inherit;cursor:pointer}.ma-lite-reset-actions button:disabled{opacity:.42;cursor:not-allowed}
.ma-lite-diagnostic{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid rgba(111,214,164,.28);border-radius:9px;background:rgba(20,100,70,.07)}.ma-lite-diagnostic-help{font-size:10px;line-height:1.5;opacity:.68}.ma-lite-diagnostic-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ma-lite-diagnostic-actions button{min-height:44px;border:1px solid rgba(111,214,164,.38);border-radius:8px;background:rgba(20,100,70,.12);color:inherit;cursor:pointer}.ma-lite-diagnostic-actions button:disabled{opacity:.42;cursor:not-allowed}.ma-lite-diagnostic-status{font-size:11px;line-height:1.45}.ma-lite-diagnostic-report{margin:0;max-height:220px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:8px;border-radius:7px;background:rgba(0,0,0,.2);font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
.ma-lite-worldbook-quick{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.035))}.ma-lite-worldbook-quick-head{display:flex;flex-direction:column;gap:2px}.ma-lite-worldbook-quick-head strong{font-size:13px}.ma-lite-worldbook-quick-head small{font-size:10px;line-height:1.4;opacity:.62}.ma-lite-worldbook-advanced{border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.1));border-radius:8px}.ma-lite-worldbook-advanced>summary{min-height:44px;box-sizing:border-box;padding:12px;cursor:pointer;font-size:11px}.ma-lite-worldbook-quick-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:0 7px 7px}.ma-lite-worldbook-quick button{min-height:44px;padding:7px 8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.15));border-radius:8px;background:rgba(0,0,0,.16);color:inherit;font-size:10px;cursor:pointer}.ma-lite-worldbook-quick button[data-kind="organizeWorldbook"]{border-color:rgba(111,214,164,.42);background:rgba(40,130,88,.13);font-weight:700}.ma-lite-worldbook-quick button:disabled{opacity:.4;cursor:not-allowed}.ma-lite-worldbook-quick-status{font-size:10px;line-height:1.45;opacity:.76}.ma-lite-worldbook-quick-status[data-error="true"]{color:#ffb4b4;opacity:1}.ma-lite-management{display:flex;flex-direction:column;gap:8px;padding:9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.035))}.ma-lite-management-head{display:flex;align-items:center;gap:8px}.ma-lite-management-head strong{min-width:0;flex:1;font-size:13px}.ma-lite-management-refresh{min-width:44px;min-height:44px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:7px;background:rgba(0,0,0,.16);color:inherit;cursor:pointer}.ma-lite-management-status{font-size:10px;line-height:1.4;opacity:.65}.ma-lite-management-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.ma-lite-management-card{padding:8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.1));border-radius:8px;background:rgba(0,0,0,.12)}.ma-lite-management-card strong{display:block;font-size:11px}.ma-lite-management-card small{display:block;margin-top:3px;font-size:10px;line-height:1.4;opacity:.65}.ma-lite-management-issue{padding:7px 8px;border-radius:7px;background:rgba(255,190,90,.08);font-size:10px;line-height:1.4}.ma-lite-management-issue[data-level="error"]{background:rgba(255,100,100,.1)}.ma-lite-management-relation{padding:6px 8px;border-left:2px solid rgba(120,180,255,.45);font-size:10px;line-height:1.4;opacity:.86}.ma-lite-management-empty{padding:9px;text-align:center;font-size:10px;opacity:.56}
.ma-lite-prompt-editor{display:flex;flex-direction:column;gap:7px;padding:10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:9px;background:var(--black30a,rgba(255,255,255,.04))}.ma-lite-prompt-editor strong{font-size:13px}.ma-lite-prompt-editor small{font-size:10px;line-height:1.45;opacity:.62}.ma-lite-prompt-editor textarea{box-sizing:border-box;width:100%;min-height:180px;resize:vertical;padding:8px 9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.18));border-radius:7px;background:rgba(0,0,0,.22);color:inherit;font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}.ma-lite-prompt-save{align-self:flex-end;min-height:44px;padding:5px 12px;border:1px solid rgba(112,181,255,.48);border-radius:7px;background:rgba(112,181,255,.1);color:inherit;font-weight:700;cursor:pointer}.ma-lite-prompt-save:disabled{opacity:.45;cursor:not-allowed}
.ma-lite-recall{display:flex;flex-direction:column;gap:8px;padding:9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.035))}.ma-lite-recall-head{display:flex;align-items:center;gap:8px}.ma-lite-recall-head strong{min-width:0;flex:1;font-size:13px}.ma-lite-recall-refresh,.ma-lite-recall-replan{min-width:44px;min-height:44px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:7px;background:rgba(0,0,0,.16);color:inherit;cursor:pointer}.ma-lite-recall-status{font-size:10px;line-height:1.35;opacity:.62}.ma-lite-recall-summary{display:flex;flex-wrap:wrap;gap:5px}.ma-lite-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 6px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.13));border-radius:999px;background:rgba(0,0,0,.14);font-size:10px;white-space:nowrap}.ma-lite-recall-list{display:flex;flex-direction:column;gap:6px}.ma-lite-recall-row{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;padding:7px 8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.1));border-radius:8px;background:rgba(0,0,0,.11)}.ma-lite-recall-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:700}.ma-lite-recall-row-head{display:flex;align-items:center;gap:7px;min-width:0}.ma-lite-recall-focus{flex:0 0 auto;min-height:44px;padding:3px 7px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.15));border-radius:6px;background:rgba(0,0,0,.18);color:inherit;font-size:9px;cursor:pointer}.ma-lite-recall-focus[data-active="true"]{border-color:rgba(255,195,74,.55);background:rgba(255,195,74,.13)}.ma-lite-recall-focus:disabled{opacity:.45;cursor:not-allowed}.ma-lite-recall-meta{display:flex;flex-wrap:wrap;gap:4px}.ma-lite-badge{display:inline-flex;padding:2px 5px;border-radius:5px;background:rgba(255,255,255,.07);font-size:9px;line-height:1.3}.ma-lite-badge[data-kind="constant"]{background:rgba(255,195,74,.16)}.ma-lite-badge[data-kind="vector"]{background:rgba(112,181,255,.15)}.ma-lite-badge[data-kind="bridge"]{background:rgba(196,123,255,.16)}.ma-lite-badge[data-kind="terminal"]{background:rgba(111,214,164,.14)}.ma-lite-badge[data-kind="isolated"]{background:rgba(160,160,170,.14)}.ma-lite-badge[data-kind="active"]{background:rgba(92,205,139,.17)}.ma-lite-badge[data-kind="closed"]{background:rgba(170,170,180,.16)}.ma-lite-badge[data-kind="history"]{background:rgba(116,150,210,.14)}.ma-lite-badge[data-kind="scene"]{background:rgba(255,160,100,.14)}.ma-lite-recall-empty{padding:8px;text-align:center;font-size:10px;opacity:.56}.ma-lite-recall-pager{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:7px;margin-top:2px}.ma-lite-recall-page-button{min-height:44px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:7px;background:rgba(0,0,0,.16);color:inherit;cursor:pointer}.ma-lite-recall-page-button:disabled{opacity:.38;cursor:not-allowed}.ma-lite-recall-page-status{font-size:10px;white-space:nowrap;opacity:.68}
.ma-lite-world-setting{display:flex;flex-direction:column;gap:9px;padding:10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.035))}.ma-lite-world-setting-head{font-size:13px}.ma-lite-world-setting-help{font-size:10px;line-height:1.45;opacity:.64}.ma-lite-world-setting textarea{box-sizing:border-box;width:100%;min-height:220px;resize:vertical;padding:8px 9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.18));border-radius:7px;background:rgba(0,0,0,.22);color:inherit;font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}.ma-lite-world-setting-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.ma-lite-world-setting-actions button{min-height:44px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.15));border-radius:8px;background:rgba(0,0,0,.16);color:inherit;cursor:pointer}.ma-lite-world-setting-actions button:first-child{grid-column:1/-1;border-color:rgba(111,214,164,.5)}.ma-lite-world-setting-actions button:disabled{opacity:.4;cursor:not-allowed}.ma-lite-world-setting-status{font-size:10px;line-height:1.45;opacity:.7}.ma-lite-world-setting-preview{display:flex;flex-direction:column;gap:7px}.ma-lite-world-setting-entry{padding:7px 8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.1));border-radius:8px;background:rgba(0,0,0,.11)}.ma-lite-world-setting-entry strong{display:block;font-size:11px}.ma-lite-world-setting-entry pre{margin:5px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;opacity:.72}.ma-lite-world-setting-empty{padding:8px;text-align:center;font-size:10px;opacity:.56}.ma-lite-world-setting-warning{padding:6px 7px;border-radius:7px;background:rgba(255,190,90,.1);font-size:10px;line-height:1.4}
.ma-lite-rebuild{display:flex;flex-direction:column;gap:9px;padding:10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.035))}.ma-lite-rebuild-head{font-size:13px}.ma-lite-rebuild-help{font-size:10px;line-height:1.45;opacity:.64}.ma-lite-rebuild-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.ma-lite-rebuild-actions button{min-height:44px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.15));border-radius:8px;background:rgba(0,0,0,.16);color:inherit;cursor:pointer}.ma-lite-rebuild-actions button:first-child{grid-column:1/-1;border-color:rgba(112,181,255,.5)}.ma-lite-rebuild-actions button:disabled{opacity:.4;cursor:not-allowed}.ma-lite-rebuild-status{font-size:10px;line-height:1.45;opacity:.68}.ma-lite-rebuild-preview{display:flex;flex-direction:column;gap:6px}.ma-lite-rebuild-summary{display:flex;flex-wrap:wrap;gap:5px}.ma-lite-rebuild-warning{padding:6px 7px;border-radius:7px;background:rgba(255,190,90,.1);font-size:10px;line-height:1.4}.ma-lite-rebuild-empty{padding:8px;text-align:center;font-size:10px;opacity:.56}
.${INDICATOR_CLASS}{display:flex!important;visibility:visible!important;align-items:center;gap:8px;width:fit-content;max-width:100%;margin:7px 0 2px;padding:5px 8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.13));border-radius:999px;background:var(--black30a,rgba(0,0,0,.18));font-size:10px;line-height:1.2;color:var(--SmartThemeBodyColor,#fff);opacity:.86!important;position:relative;z-index:1;user-select:none}
.ma-lite-taskbar{min-height:34px;box-sizing:border-box;padding:7px 9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:8px;background:rgba(0,0,0,.12);font-size:10px;line-height:1.4;opacity:.76}
.${INDICATOR_CLASS} .ma-ind-label{font-weight:700}.ma-ind-part{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}.ma-ind-detail{display:none}.ma-ind-dot{width:7px;height:7px;border-radius:50%;background:#777;box-shadow:0 0 0 1px rgba(255,255,255,.14)}.ma-ind-dot[data-state="ready"]{background:#777}.ma-ind-dot[data-state="success"]{background:#5ed18a}.ma-ind-dot[data-state="queued"]{background:#68a7ff}.ma-ind-dot[data-state="running"]{background:#f0bc57;animation:ma-lite-pulse 1s infinite}.ma-ind-dot[data-state="warning"]{background:#f0a94f}.ma-ind-dot[data-state="error"]{background:#ff6868}.ma-ind-dot[data-state="disabled"]{background:#6c6c72}@keyframes ma-lite-pulse{50%{opacity:.35}}
@media (max-width:480px){#${PANEL_ID}{left:max(6px,env(safe-area-inset-left));right:max(6px,env(safe-area-inset-right));width:auto;max-height:calc(100dvh - 12px - env(safe-area-inset-top) - env(safe-area-inset-bottom))}.ma-lite-body{padding:9px}.ma-lite-thresholds,.ma-lite-management-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ma-lite-pipeline{grid-template-columns:repeat(2,minmax(0,1fr))}.${INDICATOR_CLASS}{border-radius:10px;flex-wrap:wrap}.${INDICATOR_CLASS} .ma-ind-detail{display:inline;max-width:15ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.64}}
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
        title.innerHTML = '<strong>Mirror Abyss｜镜渊</strong><small>正文处理、世界书与维护</small>';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'ma-lite-close';
        close.title = '收起';
        close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        close.addEventListener('click', () => this.closePanel());
        header.append(title, close);
        const body = document.createElement('div');
        body.className = 'ma-lite-body';
        const pageNav = document.createElement('nav');
        pageNav.className = 'ma-lite-page-nav';
        pageNav.setAttribute('aria-label', '镜渊面板分页');
        pageNav.append(
            this.makePageButton('run', '运行'),
            this.makePageButton('worldbook', '世界书'),
            this.makePageButton('settings', '设置'),
            this.makePageButton('maintenance', '维护'),
        );
        const globalTask = document.createElement('div');
        globalTask.className = 'ma-lite-taskbar';
        globalTask.setAttribute('aria-live', 'polite');
        globalTask.textContent = '全局任务：待命';
        this.globalTaskNode = globalTask;
        const runPage = this.makePage('run');
        const worldbookPage = this.makePage('worldbook');
        const settingsPage = this.makePage('settings');
        const maintenancePage = this.makePage('maintenance');
        const pipeline = this.buildPipelineSection();
        const actions = document.createElement('div');
        actions.className = 'ma-lite-actions';
        actions.append(
            this.makeActionButton('process', '完整处理当前正文'),
            this.makeActionButton('audit', '仅审核'),
            this.makeActionButton('extract', '仅提取'),
            this.makeActionButton('cancel', '取消当前任务'),
        );
        const status = document.createElement('div');
        status.className = 'ma-lite-status';
        status.setAttribute('aria-live', 'polite');
        this.statusNode = status;
        runPage.append(pipeline, actions, status);

        const worldbookQuickActions = this.buildWorldbookQuickActions();
        const management = this.buildManagementSection();
        const recall = this.buildRecallSection();
        const worldSetting = this.buildWorldSettingSection();
        worldbookPage.append(
            worldbookQuickActions,
            this.wrapToolSection('世界书状态', management, true),
            this.wrapToolSection('召回映射', recall, false),
            this.wrapToolSection('导入世界基础设定', worldSetting, false),
        );

        const apiSection = this.buildApiSection();
        const switches = document.createElement('div');
        switches.className = 'ma-lite-switches';
        switches.append(
            this.makeSwitch('enabled', '总开关', '关闭后镜渊不执行任何处理。'),
            this.makeSwitch('autoAudit', '自动审核', '正文完成后自动审核。'),
            this.makeSwitch('autoExtraction', '自动提取', '审核通过或修正完成后自动提取。'),
            this.makeSwitch('auditEnabled', '审核功能', '控制手动与自动审核。'),
            this.makeSwitch('extractionEnabled', '提取功能', '控制手动与自动提取。'),
            this.makeSwitch('autoSmallSummary', '自动小总结', '按轮数触发；关键变化达到阈值时仍需满足最小回合间隔。'),
            this.makeSwitch('autoLargeSummary', '自动大总结', '累计小总结后沉降。'),
            this.makeSwitch('entryBudgetEnabled', '条目容量防护', '按类型和栏目进行容量治理。'),
        );
        const gameTimeAnchor = this.makeGameTimeInput('游戏时间（可选）', '需要时为当前聊天填写世界内时间锚点，例如“第三日 14:30”或“春季第12日清晨”；留空则当前聊天不启用。后续时间推进由AI判断。', '例如：第三日 14:30');
        const thresholds = document.createElement('div');
        thresholds.className = 'ma-lite-thresholds';
        thresholds.append(
            this.makeNumberInput('smallSummaryTurns', '小总结轮数', 1, 100),
            this.makeNumberInput('smallSummaryMinTurns', '关键变化最小间隔', 1, 100),
            this.makeNumberInput('criticalChangesForSmall', '关键变化阈值', 1, 50),
            this.makeNumberInput('largeSummaryCount', '大总结计数', 1, 30),
            this.makeNumberInput('queueCompactThreshold', '队列压缩阈值', 2, 50),
        );
        const auditPromptEditor = this.makePromptEditor('auditPrompt', '基础审核提示词', '只审核当前可见对话；不读取角色卡或世界书；修正失败或疑似截断时保留原正文。');
        const note = document.createElement('div');
        note.className = 'ma-lite-note';
        note.textContent = '四阶段状态固定为：审核 → 修正 → 提取 → 写入。任一阶段失败都会停止后续步骤，不推进处理游标。';
        settingsPage.append(apiSection, this.wrapToolSection('自动化与功能开关', switches, true), this.wrapToolSection('游戏时间', gameTimeAnchor, false), this.wrapToolSection('审核规则', auditPromptEditor, false), this.wrapToolSection('容量与调度阈值', thresholds, false), note);

        const rebuild = this.buildRebuildSection();
        const diagnostic = this.buildDiagnosticSection();
        const reset = this.buildResetSection();
        maintenancePage.append(this.wrapToolSection('自动验收与诊断', diagnostic, true), this.wrapToolSection('世界书重建', rebuild, false), this.wrapToolSection('重置与故障恢复', reset, false));
        body.append(pageNav, globalTask, runPage, worldbookPage, settingsPage, maintenancePage);
        panel.append(header, body);
        this.showPage('run', false);
        return panel;
    }
    wrapToolSection(title, content, open = false) {
        const details = document.createElement('details');
        details.className = 'ma-lite-tool-group';
        details.open = open;
        const summary = document.createElement('summary');
        summary.textContent = title;
        const body = document.createElement('div');
        body.className = 'ma-lite-tool-content';
        body.append(content);
        details.append(summary, body);
        return details;
    }
    buildPipelineSection() {
        const section = document.createElement('section');
        section.className = 'ma-lite-pipeline';
        for (const [kind, label] of [['audit', '审核'], ['revision', '修正'], ['extract', '提取'], ['write', '写入']]) {
            const card = document.createElement('div');
            card.className = 'ma-lite-stage';
            const head = document.createElement('div');
            head.className = 'ma-lite-stage-head';
            head.innerHTML = `<i class="ma-ind-dot" data-state="ready"></i><span>${label}</span>`;
            const detail = document.createElement('div');
            detail.className = 'ma-lite-stage-detail';
            detail.textContent = '待命';
            card.append(head, detail);
            section.append(card);
            this.pipelineNodes[kind] = { card, dot: head.querySelector('.ma-ind-dot'), detail };
        }
        return section;
    }
    renderPipeline() {
        const settings = this.getSettings();
        const master = settings.enabled !== false;
        const enabled = { audit: master && settings.auditEnabled !== false, revision: master && settings.auditEnabled !== false, extract: master && settings.extractionEnabled !== false, write: master && settings.extractionEnabled !== false };
        for (const kind of ['audit', 'revision', 'extract', 'write']) {
            const nodes = this.pipelineNodes[kind];
            if (!nodes) continue;
            const state = this.indicatorState(kind, enabled[kind]);
            nodes.dot.dataset.state = state;
            nodes.detail.textContent = this.taskStates[kind]?.detail || this.stateLabel(state);
            nodes.card.title = this.taskStates[kind]?.detail || this.stateLabel(state);
        }
    }
    makePage(key) {
        const page = document.createElement('section');
        page.className = 'ma-lite-page';
        page.setAttribute('data-page', key);
        page.hidden = key !== this.activePage;
        this.pageNodes[key] = page;
        return page;
    }
    makePageButton(key, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ma-lite-page-tab';
        button.setAttribute('data-page', key);
        button.setAttribute('aria-selected', key === this.activePage ? 'true' : 'false');
        button.textContent = label;
        button.addEventListener('click', () => this.showPage(key, true));
        this.pageButtons[key] = button;
        return button;
    }
    showPage(key, refresh = true) {
        if (!this.pageNodes[key]) return;
        this.activePage = key;
        for (const [pageKey, page] of Object.entries(this.pageNodes)) page.hidden = pageKey !== key;
        for (const [pageKey, button] of Object.entries(this.pageButtons)) button.setAttribute('aria-selected', pageKey === key ? 'true' : 'false');
        if (refresh && key === 'worldbook') void this.refreshWorldbookPage(true);
        if (refresh && key === 'maintenance') void this.refreshRebuildState();
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
        help.textContent = '连接、模型、地址和密钥仍在 SillyTavern「API Connections → Connection Profiles」中管理。建议选择独立 Profile：镜渊使用“当前连接”时会沿用主聊天全局响应长度，绝不临时覆盖它，以免后台处理影响下一轮正文。推理强度继续由 SillyTavern Reasoning 设置管理。';
        const probe = document.createElement('button');
        probe.type = 'button';
        probe.className = 'ma-lite-api-probe';
        probe.dataset.kind = 'testApiProbe';
        probe.textContent = '测试当前处理 API';
        probe.title = '只测试当前镜渊处理 API，不修改聊天或世界书';
        probe.addEventListener('click', () => void this.runWorldbookQuickAction('testApiProbe'));
        this.buttons.testApiProbe = probe;
        section.append(head, select, status, probe, help);
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
                void this.persistProfileSelection(profile || null);
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
    async persistProfileSelection(profile) {
        const revision = ++this.profileSelectionRevision;
        const previousSettings = this.getSettings();
        const previousId = previousSettings.modelSource === 'profile' ? String(previousSettings.modelProfileId || '') : '';
        const profileId = String(profile?.id || '');
        const select = this.apiProfileSelect;
        if (select) select.disabled = true;
        try {
            await this.actions.configure?.(buildUnifiedProfilePatch(profileId));
            if (revision !== this.profileSelectionRevision) return;
            this.lastOutcome = null;
            if (select) select.value = profileId;
            this.updateApiProfileStatus(profileId, profile?.name || '');
            this.setStatus(profileId ? `镜渊处理 API 已切换为：${profile?.name || profileId}` : '镜渊处理 API 已改为当前 SillyTavern 连接');
        }
        catch (error) {
            if (revision !== this.profileSelectionRevision) return;
            if (select) select.value = previousId;
            this.updateApiProfileStatus(previousId);
            this.setStatus(`保存镜渊处理 API 失败：${(0, util_1.errorText)(error)}`, true);
        }
        finally {
            if (revision === this.profileSelectionRevision && select) select.disabled = false;
        }
    }
    updateApiProfileStatus(profileId, knownName = '') {
        if (!this.apiProfileStatusNode) return;
        let summary = null;
        try { summary = this.actions.profileSummary?.(profileId) || null; }
        catch { summary = null; }
        if (!summary) {
            if (!profileId) {
                this.apiProfileStatusNode.textContent = '当前：跟随 SillyTavern 主连接；沿用主聊天全局响应长度，不执行局部覆盖。';
                return;
            }
            let name = knownName;
            try { name ||= this.actions.profileName?.(profileId) || profileId; }
            catch { name ||= profileId; }
            this.apiProfileStatusNode.textContent = `当前：${name}；实际 API/模型无法读取。`;
            return;
        }
        const model = summary.model || (summary.mode === 'cc' ? '未设置' : '由后端决定');
        const prefix = profileId ? `当前：${summary.name || knownName || profileId}` : '当前：SillyTavern 主连接';
        const invalid = summary.error ? `；不可用：${summary.error}` : '';
        const warning = summary.warning ? `；提示：${summary.warning}` : '';
        const secret = profileId ? `｜密钥：${summary.secretIdBound ? '已绑定' : '未绑定'}` : '';
        const transport = profileId && summary.transport ? `｜请求：${summary.transport}` : '';
        const scope = profileId ? '；仅用于镜渊处理，不切换主聊天 API' : '';
        this.apiProfileStatusNode.textContent = `${prefix}｜API：${summary.api || '未知'}｜模型：${model}${secret}${transport}${invalid}${warning}${scope}`;
    }
    buildDiagnosticSection() {
        const section = document.createElement('section');
        section.className = 'ma-lite-diagnostic';
        const help = document.createElement('div');
        help.className = 'ma-lite-diagnostic-help';
        help.textContent = '全自动验收一次运行两条链：玩家主聊天真实生成链，以及不依赖玩家主 API 的镜渊确定性完整闭环。两条链都会验证审核、修正、提取、写入、世界书召回配置与恢复；主聊天连接失败会单独报告，不会阻止插件闭环继续。诊断报告不包含正文、提示词、密钥或完整模型响应。';
        const actions = document.createElement('div');
        actions.className = 'ma-lite-diagnostic-actions';
        const run = document.createElement('button');
        run.type = 'button';
        run.dataset.kind = 'runAcceptance';
        run.textContent = '运行全自动实机验收';
        run.addEventListener('click', () => void this.runDiagnosticAction());
        const exportButton = document.createElement('button');
        exportButton.type = 'button';
        exportButton.dataset.kind = 'exportDiagnostics';
        exportButton.textContent = '导出诊断';
        exportButton.addEventListener('click', () => this.exportDiagnostics());
        const status = document.createElement('div');
        status.className = 'ma-lite-diagnostic-status';
        status.textContent = '尚未运行';
        const report = document.createElement('pre');
        report.className = 'ma-lite-diagnostic-report';
        report.textContent = '全自动验收连续运行三轮独立完整测试；每轮都从原始聊天、元数据和世界书快照重头开始，并通过 SillyTavern 官方 /trigger 与 Connection Profile 服务调用模型。';
        actions.append(run, exportButton);
        section.append(help, actions, status, report);
        this.diagnosticStatusNode = status;
        this.diagnosticReportNode = report;
        this.diagnosticRunButton = run;
        this.diagnosticExportButton = exportButton;
        this.buttons.runAcceptance = run;
        this.buttons.exportDiagnostics = exportButton;
        this.renderDiagnosticReport(this.actions.getDiagnostics?.());
        return section;
    }
    async runDiagnosticAction() {
        const kind = 'runAcceptance';
        if (this.pendingActions.has(kind)) return;
        const action = this.actions.runAcceptance;
        if (typeof action !== 'function') { this.setStatus('自动验收功能未连接', true); return; }
        this.pendingActions.add(kind);
        this.syncDisabledState();
        this.setDiagnosticProgress({ state: 'running', detail: '正在启动自动验收…' });
        this.setStatus('正在运行全自动端到端实机验收…');
        try {
            const report = await action();
            this.renderDiagnosticReport(report);
            this.setStatus(report?.accepted ? '自动验收通过，可以导出诊断报告' : '自动验收未通过，请导出诊断报告', report?.accepted !== true);
        }
        catch (error) {
            this.setDiagnosticProgress({ state: 'error', detail: `自动验收执行失败：${(0, util_1.errorText)(error)}` });
            this.setStatus(`自动验收执行失败：${(0, util_1.errorText)(error)}`, true);
        }
        finally {
            this.pendingActions.delete(kind);
            this.syncDisabledState();
        }
    }
    exportDiagnostics() {
        try {
            const result = this.actions.exportDiagnostics?.();
            if (!result) throw new Error('诊断导出功能未连接');
            this.setStatus(`诊断报告已导出：${result.filename || 'Mirror Abyss diagnostic'}`);
        }
        catch (error) { this.setStatus(`导出诊断失败：${(0, util_1.errorText)(error)}`, true); }
        this.syncDisabledState();
    }
    setDiagnosticProgress(progress = {}) {
        const detail = String(progress.detail || '').trim();
        if (this.diagnosticStatusNode) {
            this.diagnosticStatusNode.textContent = detail || '自动验收处理中';
            this.diagnosticStatusNode.dataset.state = String(progress.state || 'running');
        }
        if (progress.report) this.renderDiagnosticReport(progress.report);
    }
    renderDiagnosticReport(report) {
        if (!this.diagnosticReportNode) return;
        if (!report) {
            this.diagnosticReportNode.textContent = '全自动验收连续运行三轮独立完整测试；每轮都从原始聊天、元数据和世界书快照重头开始，并通过 SillyTavern 官方 /trigger 与 Connection Profile 服务调用模型。';
            if (this.diagnosticStatusNode) this.diagnosticStatusNode.textContent = '尚未运行';
            return;
        }
        const summary = report.summary || {};
        const failed = (report.checks || []).filter((check) => check.status === 'fail');
        const warnings = (report.checks || []).filter((check) => check.status === 'warn');
        const pluginLabel = report.pluginAccepted === true ? '插件闭环通过' : '插件闭环未通过';
        const mainLabel = report.mainChatAccepted === true ? '主聊天链通过' : report.acceptance?.mainChat === 'unavailable' ? '主聊天链不可用' : '主聊天链未通过';
        const rounds = report.roundSummary || {};
        const lines = [
            `${report.accepted ? '通过' : '未通过'}｜${pluginLabel}｜${mainLabel}`,
            `本次采用 ${rounds.completed || 1}/${rounds.requested || 1} 轮独立全量重启｜插件完整通过 ${rounds.pluginPassRounds ?? (report.pluginAccepted ? 1 : 0)} 轮｜主聊天完整通过 ${rounds.mainPassRounds ?? (report.mainChatAccepted ? 1 : 0)} 轮`,
            `选定第 ${rounds.selectedRound || report.roundIndex || 1} 轮作为最终结果｜通过 ${summary.pass || 0}｜警告 ${summary.warn || 0}｜失败 ${summary.fail || 0}｜跳过 ${summary.skip || 0}`,
            `耗时 ${report.durationMs || 0} ms｜世界书 ${report.scope?.worldbookName || '未绑定'}`,
        ];
        for (const check of failed.slice(0, 4)) lines.push(`失败｜${check.label}：${check.detail}`);
        for (const check of warnings.slice(0, 3)) lines.push(`警告｜${check.label}：${check.detail}`);
        if (!failed.length && !warnings.length) lines.push('三轮独立验收均已收敛；每轮结束后均恢复原始快照。');
        this.diagnosticReportNode.textContent = lines.join('\n');
        if (this.diagnosticStatusNode) this.diagnosticStatusNode.textContent = report.accepted ? (report.acceptance?.pluginClosedLoop === 'stable-pass' ? '三轮插件闭环稳定通过' : '插件闭环重启后通过，存在间歇性失败') : '三轮插件闭环均未完整通过';
    }
    buildResetSection() {
        const section = document.createElement('section');
        section.className = 'ma-lite-reset';
        const head = document.createElement('strong');
        head.className = 'ma-lite-reset-head';
        head.textContent = '重置';
        const help = document.createElement('div');
        help.className = 'ma-lite-reset-help';
        help.textContent = '重置当前聊天会清除该聊天的处理游标、提交回执、焦点和游戏时间；重置插件还会恢复全部插件设置。两者都不会删除或清空世界书正文。';
        const actions = document.createElement('div');
        actions.className = 'ma-lite-reset-actions';
        const chat = document.createElement('button');
        chat.type = 'button';
        chat.textContent = '重置当前聊天';
        chat.addEventListener('click', () => void this.runResetAction('resetCurrentChat'));
        const plugin = document.createElement('button');
        plugin.type = 'button';
        plugin.textContent = '重置插件';
        plugin.addEventListener('click', () => void this.runResetAction('resetPlugin'));
        actions.append(chat, plugin);
        section.append(head, help, actions);
        this.buttons.resetCurrentChat = chat;
        this.buttons.resetPlugin = plugin;
        return section;
    }
    async runResetAction(kind) {
        if (this.pendingActions.has(kind)) return;
        const action = this.actions[kind];
        if (typeof action !== 'function') { this.setStatus('重置功能未连接', true); return; }
        const pluginReset = kind === 'resetPlugin';
        const question = pluginReset
            ? '确定重置 Mirror Abyss 插件设置及当前聊天状态吗？世界书正文不会被删除。'
            : '确定重置当前聊天的镜渊状态吗？世界书正文不会被删除。';
        if (typeof globalThis.confirm === 'function' && !globalThis.confirm(question)) return;
        this.pendingActions.add(kind);
        this.syncDisabledState();
        this.setStatus(pluginReset ? '正在重置插件…' : '正在重置当前聊天…');
        try {
            await action();
            this.resetTaskStates(pluginReset ? '插件已恢复默认设置' : '当前聊天已重置');
            this.setStatus(pluginReset ? '插件设置与当前聊天状态已重置；世界书正文保持不变' : '当前聊天状态已重置；可以重新提取当前正文');
            this.refresh();
            await this.refreshWorldSettingState();
            await this.refreshRebuildState();
            await this.refreshRecallMap(true);
        }
        catch (error) {
            this.setStatus(`重置失败：${(0, util_1.errorText)(error)}`, true);
        }
        finally {
            this.pendingActions.delete(kind);
            this.syncDisabledState();
        }
    }

    buildWorldSettingSection() {
        const section = document.createElement('section');
        section.className = 'ma-lite-world-setting';
        const head = document.createElement('strong');
        head.className = 'ma-lite-world-setting-head';
        head.textContent = '玩家世界设定初始化';
        const help = document.createElement('div');
        help.className = 'ma-lite-world-setting-help';
        help.textContent = '只在玩家明确点击后读取下方文本。普通聊天仍保持防误触：玩家输入只用于理解行动，不会自动写成世界设定。先生成预览，确认后再写入当前绑定世界书。';
        const textarea = document.createElement('textarea');
        textarea.maxLength = 24000;
        textarea.placeholder = '粘贴世界框架、自然规则、种族、能力体系、地区组织、制度、开局地点与已存在人物。写作要求、文风和未来剧情计划不会进入世界书。';
        textarea.setAttribute('aria-label', '玩家世界设定文本');
        textarea.addEventListener('input', () => {
            if (this.actions.worldSettingsPreview?.()) {
                this.worldSettingDirty = true;
                if (this.worldSettingStatusNode) this.worldSettingStatusNode.textContent = '设定文本已修改，旧预览不可提交；请重新生成预览。';
            }
            this.syncDisabledState();
        });
        const actions = document.createElement('div');
        actions.className = 'ma-lite-world-setting-actions';
        const preview = document.createElement('button');
        preview.type = 'button';
        preview.textContent = '生成设定预览';
        preview.addEventListener('click', () => void this.runWorldSettingAction('previewWorldSettings'));
        const commit = document.createElement('button');
        commit.type = 'button';
        commit.textContent = '确认写入世界书';
        commit.addEventListener('click', () => void this.runWorldSettingAction('commitWorldSettings'));
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.textContent = '清空';
        clear.addEventListener('click', () => void this.runWorldSettingAction('clearWorldSettingsPreview'));
        actions.append(preview, commit, clear);
        const status = document.createElement('div');
        status.className = 'ma-lite-world-setting-status';
        status.textContent = '文本只保留在当前面板中，不写入插件设置；预览阶段不会修改世界书。';
        const content = document.createElement('div');
        content.className = 'ma-lite-world-setting-empty';
        content.textContent = '尚未生成设定预览';
        section.append(head, help, textarea, actions, status, content);
        this.worldSettingTextarea = textarea;
        this.worldSettingStatusNode = status;
        this.worldSettingPreviewNode = content;
        this.worldSettingPreviewButton = preview;
        this.worldSettingCommitButton = commit;
        this.worldSettingClearButton = clear;
        return section;
    }
    async runWorldSettingAction(kind) {
        if (this.pendingActions.has(kind)) return;
        const action = this.actions[kind];
        if (typeof action !== 'function') {
            this.setStatus('玩家设定导入功能未连接', true);
            return;
        }
        const source = String(this.worldSettingTextarea?.value || '').trim();
        if (kind !== 'clearWorldSettingsPreview' && !source) {
            this.setStatus('请先粘贴玩家世界设定', true);
            return;
        }
        this.pendingActions.add(kind);
        this.syncDisabledState();
        if (this.worldSettingStatusNode) {
            this.worldSettingStatusNode.textContent = kind === 'previewWorldSettings'
                ? '正在解析玩家设定并生成只读预览…'
                : kind === 'commitWorldSettings'
                    ? '正在原子写入当前绑定世界书并回读校验…'
                    : '正在清空设定文本与预览…';
        }
        try {
            if (kind === 'clearWorldSettingsPreview') {
                await action();
                if (this.worldSettingTextarea) this.worldSettingTextarea.value = '';
                this.worldSettingDirty = false;
                this.renderWorldSettingPreview(null);
                this.setStatus('玩家设定文本与预览已清空');
            }
            else if (kind === 'previewWorldSettings') {
                const result = await action(source);
                this.worldSettingDirty = false;
                this.renderWorldSettingPreview(result);
                this.setStatus(`玩家设定预览已生成：新建${result?.created?.length ?? 0}、更新${result?.updated?.length ?? 0}；世界书尚未修改`);
            }
            else {
                const result = await action(source);
                if (this.worldSettingTextarea) this.worldSettingTextarea.value = '';
                this.worldSettingDirty = false;
                this.renderWorldSettingPreview(null);
                this.setStatus(`玩家设定已写入：新建${result?.created?.length ?? 0}、更新${result?.updated?.length ?? 0}`);
                await this.refreshRecallMap(true);
            }
        }
        catch (error) {
            const text = (0, util_1.errorText)(error);
            this.setStatus(`玩家设定导入失败：${text}`, true);
            if (this.worldSettingStatusNode) this.worldSettingStatusNode.textContent = `失败：${text}`;
        }
        finally {
            this.pendingActions.delete(kind);
            this.syncDisabledState();
        }
    }
    async refreshWorldSettingState() {
        let preview = null;
        try { preview = this.actions.worldSettingsPreview?.() ?? null; }
        catch { }
        this.renderWorldSettingPreview(preview);
        this.syncDisabledState();
    }
    renderWorldSettingPreview(summary) {
        if (!this.worldSettingPreviewNode) return;
        this.worldSettingPreviewNode.replaceChildren();
        if (!summary?.previewReady) {
            this.worldSettingPreviewNode.className = 'ma-lite-world-setting-empty';
            this.worldSettingPreviewNode.textContent = '尚未生成设定预览';
            if (this.worldSettingStatusNode && !this.pendingActions.size) this.worldSettingStatusNode.textContent = '文本只保留在当前面板中，不写入插件设置；预览阶段不会修改世界书。';
            return;
        }
        this.worldSettingPreviewNode.className = 'ma-lite-world-setting-preview';
        const metrics = document.createElement('div');
        metrics.className = 'ma-lite-rebuild-summary';
        for (const [label, value] of [['新建', summary.created?.length ?? 0], ['更新', summary.updated?.length ?? 0], ['条目', summary.entries?.length ?? 0], ['格式修复', summary.repaired ?? 0], ['隔离', summary.skipped?.length ?? 0]]) {
            const chip = document.createElement('span');
            chip.className = 'ma-lite-chip';
            chip.textContent = `${label}：${value}`;
            metrics.append(chip);
        }
        this.worldSettingPreviewNode.append(metrics);
        for (const entry of (summary.entries ?? []).slice(0, 16)) {
            const row = document.createElement('div');
            row.className = 'ma-lite-world-setting-entry';
            const title = document.createElement('strong');
            title.textContent = entry.title;
            const content = document.createElement('pre');
            content.textContent = entry.content;
            row.append(title, content);
            this.worldSettingPreviewNode.append(row);
        }
        for (const skipped of (summary.skipped ?? []).slice(0, 6)) {
            const warning = document.createElement('div');
            warning.className = 'ma-lite-world-setting-warning';
            warning.textContent = `已隔离“${skipped.title}”${skipped.reason ? `：${skipped.reason}` : ''}`;
            this.worldSettingPreviewNode.append(warning);
        }
        for (const warningText of (summary.warnings ?? []).slice(0, 4)) {
            const warning = document.createElement('div');
            warning.className = 'ma-lite-world-setting-warning';
            warning.textContent = warningText;
            this.worldSettingPreviewNode.append(warning);
        }
        if (this.worldSettingStatusNode) this.worldSettingStatusNode.textContent = this.worldSettingDirty
            ? '设定文本已修改，旧预览不可提交；请重新生成预览。'
            : `预览已就绪；目标世界书：${summary.worldbookName || '当前绑定世界书'}。`;
    }
    setWorldSettingProgress(progress = {}) {
        if (!this.worldSettingStatusNode) return;
        const detail = String(progress.detail || '').trim();
        if (detail) this.worldSettingStatusNode.textContent = detail;
    }
    buildRebuildSection() {
        const section = document.createElement('section');
        section.className = 'ma-lite-rebuild';
        const head = document.createElement('strong');
        head.className = 'ma-lite-rebuild-head';
        head.textContent = 'AI辅助世界书重建';
        const help = document.createElement('div');
        help.className = 'ma-lite-rebuild-help';
        help.textContent = '旧表按小批次串行重建；每批完成后记录进度，限流会等待并重试，最终失败时下次从断点继续。提交时才替换镜渊旧表；非镜渊条目与手动锁定条目保持不动。';
        const actions = document.createElement('div');
        actions.className = 'ma-lite-rebuild-actions';
        const preview = document.createElement('button');
        preview.type = 'button';
        preview.textContent = '生成AI重建预览';
        preview.addEventListener('click', () => void this.runRebuildAction('migrate'));
        const commit = document.createElement('button');
        commit.type = 'button';
        commit.textContent = '提交并替换旧表';
        commit.addEventListener('click', () => void this.runRebuildAction('commitMigration'));
        const undo = document.createElement('button');
        undo.type = 'button';
        undo.textContent = '撤销上次重建';
        undo.addEventListener('click', () => void this.runRebuildAction('undoMigration'));
        actions.append(preview, commit, undo);
        const status = document.createElement('div');
        status.className = 'ma-lite-rebuild-status';
        status.textContent = '预览阶段不会修改世界书。提交后会回读校验；失败自动恢复旧表。';
        const content = document.createElement('div');
        content.className = 'ma-lite-rebuild-empty';
        content.textContent = '尚未生成重建预览';
        section.append(head, help, actions, status, content);
        this.rebuildNode = content;
        this.rebuildStatusNode = status;
        this.rebuildPreviewButton = preview;
        this.rebuildCommitButton = commit;
        this.rebuildUndoButton = undo;
        return section;
    }
    async runRebuildAction(kind) {
        if (this.pendingActions.has(kind)) return;
        const action = this.actions[kind];
        if (typeof action !== 'function') {
            this.setStatus('世界书重建功能未连接', true);
            return;
        }
        this.pendingActions.add(kind);
        this.syncDisabledState();
        if (this.rebuildStatusNode) this.rebuildStatusNode.textContent = kind === 'migrate' ? '正在串行处理世界书重建批次…' : kind === 'commitMigration' ? '正在原子提交新结构并回读校验…' : '正在恢复上次重建前的旧表…';
        try {
            const result = await action();
            const summary = kind === 'migrate' ? result : this.actions.migrationPreview?.();
            this.renderRebuildPreview(summary);
            if (kind === 'migrate') this.setStatus(result?.previewReady ? '世界书重建预览已生成，旧表未修改' : (result?.message || '没有可重建条目'));
            else if (kind === 'commitMigration') this.setStatus('世界书重建已提交，旧表已由新结构替换');
            else this.setStatus('上次世界书重建已撤销');
            await this.refreshRecallMap(true);
        }
        catch (error) {
            const text = (0, util_1.errorText)(error);
            this.setStatus(`世界书重建失败：${text}`, true);
            if (this.rebuildStatusNode) this.rebuildStatusNode.textContent = `失败：${text}`;
        }
        finally {
            this.pendingActions.delete(kind);
            this.syncDisabledState();
            void this.refreshRebuildState();
        }
    }
    async refreshRebuildState() {
        let preview = null;
        let workspace = null;
        try {
            preview = this.actions.migrationPreview?.() ?? null;
            workspace = await this.actions.loadWorkspace?.();
        }
        catch { }
        this.renderRebuildPreview(preview);
        if (this.rebuildCommitButton) this.rebuildCommitButton.disabled = !preview || this.pendingActions.size > 0;
        if (this.rebuildUndoButton) { this.rebuildUndoButton.dataset.available = workspace?.canUndoMigration === true ? 'true' : 'false'; this.rebuildUndoButton.disabled = workspace?.canUndoMigration !== true || this.pendingActions.size > 0; }
    }
    renderRebuildPreview(summary) {
        if (!this.rebuildNode) return;
        this.rebuildNode.replaceChildren();
        if (!summary?.previewReady && !summary?.worldbookName) {
            this.rebuildNode.className = 'ma-lite-rebuild-empty';
            this.rebuildNode.textContent = '尚未生成重建预览';
            return;
        }
        this.rebuildNode.className = 'ma-lite-rebuild-preview';
        const metrics = document.createElement('div');
        metrics.className = 'ma-lite-rebuild-summary';
        const items = [
            ['旧表', summary.candidates ?? 0],
            ['批次', summary.batches ?? 0],
            ['模型请求', summary.requests ?? 0],
            ['限流重试', summary.retries ?? 0],
            ['失败批次', summary.failedBatches ?? 0],
            ['覆盖率', `${summary.coveragePercent ?? 0}%`],
            ['未覆盖', summary.uncoveredEntries ?? 0],
            ['关键遗漏', summary.criticalUncoveredEntries ?? 0],
            ['对象簇', summary.semanticClusters ?? 0],
            ['场景锚点', summary.sceneAnchors ?? 0],
            ['时间未知', summary.unknownGameTimeAnchors ?? 0],
            ['事件轮', summary.eventPasses ?? 0],
            ['扩展轮', summary.customPasses ?? summary.organizationPasses ?? 0],
            ['地区轮', summary.regionPasses ?? 0],
            ['设定轮', summary.foundationPasses ?? 0],
            ['新条目', summary.rebuiltEntries ?? 0],
            ['同义收束', summary.convergedEntries ?? 0],
            ['附属并入', summary.absorbedEntries ?? 0],
            ['新增类型', Array.isArray(summary.newTypes) ? summary.newTypes.length : 0],
            ['合并', summary.mergedOldEntries ?? 0],
            ['原样保留', summary.retainedOriginalEntries ?? 0],
            ['既有归档', summary.preservedArchivedEntries ?? 0],
            ['恢复误关闭', summary.recoveredUi20Archives ?? 0],
            ['明确归档', summary.archivedEntries ?? 0],
            ['认知事实', summary.knowledgeLines ?? 0],
            ['保留外部条目', summary.preservedEntries ?? 0],
        ];
        for (const [label, value] of items) {
            const chip = document.createElement('span');
            chip.className = 'ma-lite-chip';
            chip.textContent = `${label}：${value}`;
            metrics.append(chip);
        }
        this.rebuildNode.append(metrics);
        for (const warningText of (summary.warnings ?? []).slice(0, 5)) {
            const warning = document.createElement('div');
            warning.className = 'ma-lite-rebuild-warning';
            warning.textContent = warningText;
            this.rebuildNode.append(warning);
        }
        if (this.rebuildStatusNode) this.rebuildStatusNode.textContent = summary.previewReady === false ? '没有可提交预览。' : '预览已就绪；提交前旧表保持不变。';
    }
    buildWorldbookQuickActions() {
        const section = document.createElement('section');
        section.className = 'ma-lite-worldbook-quick';
        const head = document.createElement('div');
        head.className = 'ma-lite-worldbook-quick-head';
        head.innerHTML = '<strong>世界书控制</strong><small>日常只使用“整理世界书”；单级总结保留为诊断入口。</small>';
        const primary = document.createElement('button');
        primary.type = 'button';
        primary.dataset.kind = 'organizeWorldbook';
        primary.textContent = '整理世界书';
        primary.title = '以一个父事务依次运行小总结、大总结和召回重排；任一步失败会恢复整体状态';
        primary.addEventListener('click', () => void this.runWorldbookQuickAction('organizeWorldbook'));
        this.buttons.organizeWorldbook = primary;
        const advanced = document.createElement('details');
        advanced.className = 'ma-lite-worldbook-advanced';
        const summary = document.createElement('summary');
        summary.textContent = '高级手动总结';
        const actions = document.createElement('div');
        actions.className = 'ma-lite-worldbook-quick-actions';
        for (const [kind, label, title] of [
            ['smallSummary', '仅运行小总结', '只处理当前待小总结工作集，不自动级联大总结'],
            ['largeSummary', '仅运行大总结', '只处理当前待大总结工作集'],
        ]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.kind = kind;
            button.textContent = label;
            button.title = title;
            button.addEventListener('click', () => void this.runWorldbookQuickAction(kind));
            actions.append(button);
            this.buttons[kind] = button;
        }
        advanced.append(summary, actions);
        const status = document.createElement('div');
        status.className = 'ma-lite-worldbook-quick-status';
        status.setAttribute('aria-live', 'polite');
        status.textContent = '整理世界书使用统一父事务；取消或任一步失败会恢复操作前状态，切换聊天时将在返回原聊天后优先恢复。';
        section.append(head, primary, advanced, status);
        this.worldbookQuickStatusNode = status;
        return section;
    }
    async runWorldbookQuickAction(kind) {
        if (this.pendingActions.has(kind)) return;
        const action = this.actions[kind];
        if (typeof action !== 'function') {
            this.setStatus('该操作未连接', true);
            return;
        }
        const settings = this.getSettings();
        if (kind !== 'testApiProbe' && settings.enabled === false) {
            this.setStatus('总开关已关闭', true);
            return;
        }
        const labels = { smallSummary: '小总结', largeSummary: '大总结', organizeWorldbook: '世界书整理', testApiProbe: 'API 探针' };
        const label = labels[kind] || '操作';
        if (kind === 'organizeWorldbook' && typeof globalThis.confirm === 'function') {
            const confirmed = globalThis.confirm('整理世界书将作为一个父事务依次运行小总结、大总结和召回重排。取消或任一步失败会恢复操作前状态；中途切换聊天时，返回原聊天后会先自动恢复。是否继续？');
            if (!confirmed) return;
        }
        this.pendingActions.add(kind);
        this.syncDisabledState();
        if (this.worldbookQuickStatusNode) {
            this.worldbookQuickStatusNode.dataset.error = 'false';
            this.worldbookQuickStatusNode.textContent = `${label}正在运行…`;
        }
        if (kind === 'testApiProbe' && this.apiProfileStatusNode) this.apiProfileStatusNode.textContent = `${label}正在运行…`;
        try {
            const result = await action();
            if (kind === 'testApiProbe') {
                const route = result?.route || {};
                const detail = `API 探针通过｜${Number(result?.elapsedMs || 0)} ms｜${route.name || '当前连接'}｜${route.api || '未知'}｜${route.model || '未知'}${route.transport ? `｜${route.transport}` : ''}`;
                if (this.worldbookQuickStatusNode) this.worldbookQuickStatusNode.textContent = detail;
                if (this.apiProfileStatusNode) this.apiProfileStatusNode.textContent = detail;
                this.setStatus(detail);
            }
            else {
                const detail = kind === 'organizeWorldbook'
                    ? `世界书整理完成｜小总结${Number(result?.smallEntries || 0)}条｜大总结${Number(result?.largeEntries || 0)}条｜召回已重排`
                    : `${label}已完成；世界书状态已回读`;
                if (this.worldbookQuickStatusNode) this.worldbookQuickStatusNode.textContent = detail;
                this.setStatus(detail);
                await this.refreshWorldbookPage(true);
            }
        }
        catch (error) {
            const cancelled = error?.code === 'MA_TASK_CANCELLED';
            const text = cancelled ? `${label}已取消` : `${label}失败：${(0, util_1.errorText)(error)}`;
            if (this.worldbookQuickStatusNode) {
                this.worldbookQuickStatusNode.dataset.error = cancelled ? 'false' : 'true';
                this.worldbookQuickStatusNode.textContent = text;
            }
            if (kind === 'testApiProbe' && this.apiProfileStatusNode) this.apiProfileStatusNode.textContent = text;
            this.setStatus(text, !cancelled);
        }
        finally {
            this.pendingActions.delete(kind);
            this.syncDisabledState();
        }
    }
    buildManagementSection() {
        const section = document.createElement('section');
        section.className = 'ma-lite-management';
        const head = document.createElement('div');
        head.className = 'ma-lite-management-head';
        const title = document.createElement('strong');
        title.textContent = '三维世界书状态';
        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.className = 'ma-lite-management-refresh';
        refresh.title = '刷新世界书管理视图';
        refresh.setAttribute('aria-label', '刷新世界书管理视图');
        refresh.innerHTML = '<i class="fa-solid fa-rotate" aria-hidden="true"></i>';
        refresh.addEventListener('click', () => void this.refreshManagement(true));
        head.append(title, refresh);
        const status = document.createElement('div');
        status.className = 'ma-lite-management-status';
        status.textContent = '只读投影：当前游戏时间、当前场景、人物沉降、容量问题与原生召回配置。';
        const content = document.createElement('div');
        content.className = 'ma-lite-management-empty';
        content.textContent = '尚未读取';
        section.append(head, status, content);
        this.managementNode = content;
        this.managementStatusNode = status;
        this.managementRefreshButton = refresh;
        return section;
    }
    async refreshWorldbookPage(force = false) {
        if (typeof this.actions.loadWorkspace !== 'function') return;
        if (!force && this.panel?.hidden) return;
        const managementSerial = ++this.managementLoadSerial;
        const recallSerial = ++this.recallLoadSerial;
        if (this.managementRefreshButton) this.managementRefreshButton.disabled = true;
        if (this.recallRefreshButton) this.recallRefreshButton.disabled = true;
        if (this.managementStatusNode) this.managementStatusNode.textContent = '正在读取当前绑定世界书…';
        if (this.recallStatusNode) this.recallStatusNode.textContent = '正在读取同一权威快照…';
        try {
            const workspace = await this.actions.loadWorkspace();
            if (managementSerial !== this.managementLoadSerial || recallSerial !== this.recallLoadSerial) return;
            this.renderManagement(workspace?.management ?? null, workspace?.worldbookName || '');
            this.recallModel = workspace?.recall ?? null;
            this.recallWorldbookName = workspace?.worldbookName || '';
            this.recallPage = Math.min(this.recallPage, Math.max(1, Math.ceil((this.recallModel?.entries?.length || 0) / this.recallPageSize)));
            this.renderRecall();
            this.refreshWorldSettingState();
        }
        catch (error) {
            const text = (0, util_1.errorText)(error);
            if (this.managementNode) { this.managementNode.className = 'ma-lite-management-empty'; this.managementNode.textContent = `读取失败：${text}`; }
            if (this.recallNode) { this.recallNode.className = 'ma-lite-recall-empty'; this.recallNode.textContent = `读取失败：${text}`; }
            if (this.managementStatusNode) this.managementStatusNode.textContent = '未修改世界书。';
            if (this.recallStatusNode) this.recallStatusNode.textContent = '未修改世界书。';
        }
        finally {
            if (managementSerial === this.managementLoadSerial && this.managementRefreshButton) this.managementRefreshButton.disabled = false;
            if (recallSerial === this.recallLoadSerial && this.recallRefreshButton) this.recallRefreshButton.disabled = false;
        }
    }
    async refreshManagement(force = false) {
        if (!this.managementNode || typeof this.actions.loadWorkspace !== 'function') return;
        if (!force && this.panel?.hidden) return;
        const serial = ++this.managementLoadSerial;
        if (this.managementRefreshButton) this.managementRefreshButton.disabled = true;
        if (this.managementStatusNode) this.managementStatusNode.textContent = '正在读取世界书管理视图…';
        try {
            const workspace = await this.actions.loadWorkspace();
            if (serial !== this.managementLoadSerial || !this.managementNode) return;
            this.renderManagement(workspace?.management ?? null, workspace?.worldbookName || '');
        }
        catch (error) {
            if (serial !== this.managementLoadSerial || !this.managementNode) return;
            this.managementNode.className = 'ma-lite-management-empty';
            this.managementNode.textContent = `读取失败：${(0, util_1.errorText)(error)}`;
            if (this.managementStatusNode) this.managementStatusNode.textContent = '未修改世界书。';
        }
        finally {
            if (serial === this.managementLoadSerial && this.managementRefreshButton) this.managementRefreshButton.disabled = false;
        }
    }
    renderManagement(model, worldbookName) {
        if (!this.managementNode) return;
        this.managementNode.className = '';
        this.managementNode.replaceChildren();
        if (!model) {
            this.managementNode.className = 'ma-lite-management-empty';
            this.managementNode.textContent = '没有管理数据';
            return;
        }
        if (this.managementStatusNode) this.managementStatusNode.textContent = `${worldbookName ? `世界书：${worldbookName}；` : ''}${model.healthy ? '硬约束未发现阻断问题' : '存在需要处理的硬约束问题'}。`;
        const grid = document.createElement('div');
        grid.className = 'ma-lite-management-grid';
        const cards = [
            ['当前游戏时间', model.gameTime?.label || '未知', model.gameTime?.sceneTitle || '尚未从当前场景取得游戏时间'],
            ['当前场景', model.currentScene?.title || '未识别', `在场${model.currentScene?.present?.length || 0}；固定角色${model.currentScene?.fixedSceneRoles?.length || 0}；固定设施${model.currentScene?.fixedFacilities?.length || 0}`],
            ['活动事件', String(model.counts?.activeEvents || 0), (model.activeEvents || []).map((item) => item.title).slice(0, 3).join('、') || '无'],
            ['人物投影', `当前${model.counts?.currentPeople || 0} / 沉降${model.counts?.settledPeople || 0}`, '按当前场景、事件和焦点生成运行投影'],
            ['镜渊条目', String(model.counts?.managed || 0), `已关闭事件${model.counts?.closedEvents || 0}；直接关联${model.counts?.directRelations || 0}`],
            ['数据健康', model.healthy ? '通过' : model.hasErrors ? '有阻断项' : '有警告', `问题${model.issues?.length || 0}项`],
        ];
        for (const [label, value, detail] of cards) {
            const card = document.createElement('div');
            card.className = 'ma-lite-management-card';
            const strong = document.createElement('strong');
            strong.textContent = `${label}：${value}`;
            const small = document.createElement('small');
            small.textContent = detail;
            card.append(strong, small);
            grid.append(card);
        }
        this.managementNode.append(grid);
        if (model.directRelations?.length) {
            const title = document.createElement('strong');
            title.textContent = '一层直接关联';
            this.managementNode.append(title);
            for (const relation of model.directRelations.slice(0, 12)) {
                const node = document.createElement('div');
                node.className = 'ma-lite-management-relation';
                node.textContent = `${relation.sourceTitle} ↔ ${relation.targetTitle}`;
                this.managementNode.append(node);
            }
        }
        for (const issue of model.issues || []) {
            const node = document.createElement('div');
            node.className = 'ma-lite-management-issue';
            node.dataset.level = issue.level || 'info';
            node.textContent = issue.message;
            if (issue.entries?.length) node.title = issue.entries.join('\n');
            this.managementNode.append(node);
        }
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
        this.recallModel = model;
        this.recallWorldbookName = worldbookName;
        const pageCount = Math.max(1, Math.ceil(Number(model?.total || 0) / this.recallPageSize));
        this.recallPage = Math.min(Math.max(1, this.recallPage), pageCount);
        this.renderRecallPage();
    }
    renderRecallPage() {
        if (!this.recallNode || !this.recallModel) return;
        const model = this.recallModel;
        this.recallNode.className = '';
        this.recallNode.replaceChildren();
        if (this.recallStatusNode) this.recallStatusNode.textContent = `${this.recallWorldbookName ? `世界书：${this.recallWorldbookName}；` : ''}仅显示镜渊管理条目，共 ${model.total} 条。`;
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
        const pageCount = Math.max(1, Math.ceil(model.entries.length / this.recallPageSize));
        this.recallPage = Math.min(Math.max(1, this.recallPage), pageCount);
        const start = (this.recallPage - 1) * this.recallPageSize;
        const visibleEntries = model.entries.slice(start, start + this.recallPageSize);
        const list = document.createElement('div');
        list.className = 'ma-lite-recall-list';
        for (const item of visibleEntries) {
            const row = document.createElement('div');
            row.className = 'ma-lite-recall-row';
            const head = document.createElement('div');
            head.className = 'ma-lite-recall-row-head';
            const title = document.createElement('div');
            title.className = 'ma-lite-recall-title';
            title.textContent = item.title;
            title.title = item.title;
            head.append(title);
            if (item.type === '人物' && typeof this.actions.setFocus === 'function') {
                const focus = document.createElement('button');
                focus.type = 'button';
                focus.className = 'ma-lite-recall-focus';
                focus.dataset.active = item.focus ? 'true' : 'false';
                focus.textContent = item.focus ? '取消焦点' : '设为焦点';
                focus.title = item.focus ? '取消玩家主焦点' : '设为玩家主焦点；只调整召回，不改变事实内容';
                focus.addEventListener('click', async () => {
                    focus.disabled = true;
                    try {
                        await this.actions.setFocus(item.uid, !item.focus);
                        this.setStatus(item.focus ? `已取消主焦点：${item.title}` : `已设为主焦点：${item.title}`);
                        await this.refreshRecallMap(true);
                    }
                    catch (error) { this.setStatus(`焦点设置失败：${(0, util_1.errorText)(error)}`, true); }
                    finally { focus.disabled = false; }
                });
                head.append(focus);
            }
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
            row.append(head, meta);
            list.append(row);
        }
        this.recallNode.append(summary, list);
        if (pageCount > 1) {
            const pager = document.createElement('div');
            pager.className = 'ma-lite-recall-pager';
            const previous = document.createElement('button');
            previous.type = 'button';
            previous.className = 'ma-lite-recall-page-button';
            previous.textContent = '上一页';
            previous.disabled = this.recallPage <= 1;
            previous.addEventListener('click', () => { this.recallPage -= 1; this.renderRecallPage(); });
            const status = document.createElement('span');
            status.className = 'ma-lite-recall-page-status';
            status.textContent = `第 ${this.recallPage} / ${pageCount} 页`;
            const next = document.createElement('button');
            next.type = 'button';
            next.className = 'ma-lite-recall-page-button';
            next.textContent = '下一页';
            next.disabled = this.recallPage >= pageCount;
            next.addEventListener('click', () => { this.recallPage += 1; this.renderRecallPage(); });
            pager.append(previous, status, next);
            this.recallNode.append(pager);
        }
    }
    makePromptEditor(key, labelText, description) {
        const section = document.createElement('section');
        section.className = 'ma-lite-prompt-editor';
        const title = document.createElement('strong');
        title.textContent = labelText;
        const help = document.createElement('small');
        help.textContent = description;
        const textarea = document.createElement('textarea');
        textarea.dataset.setting = key;
        textarea.setAttribute('aria-label', labelText);
        textarea.spellcheck = false;
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'ma-lite-prompt-save';
        save.textContent = '保存审核提示词';
        save.addEventListener('click', async () => {
            const value = String(textarea.value || '').trim();
            if (!value) {
                this.setStatus('审核提示词不能为空；关闭审核请使用审核功能开关', true);
                return;
            }
            const previous = String(this.getSettings()?.[key] || '');
            save.disabled = true;
            try {
                await this.actions.configure?.({ [key]: value });
                this.lastOutcome = null;
                this.setStatus('审核提示词已保存');
            }
            catch (error) {
                textarea.value = previous;
                this.setStatus(`保存审核提示词失败：${(0, util_1.errorText)(error)}`, true);
                this.refresh();
            }
            finally {
                save.disabled = this.pendingActions.size > 0;
            }
        });
        section.append(title, help, textarea, save);
        this.inputs[key] = textarea;
        this.buttons[`${key}Save`] = save;
        return section;
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
        input.addEventListener('change', async () => {
            const requested = input.checked;
            const previous = !requested;
            input.disabled = true;
            try {
                await this.actions.configure?.({ [key]: requested });
                this.lastOutcome = null;
                this.setStatus(`${labelText}已${requested ? '开启' : '关闭'}`);
                this.refresh();
            }
            catch (error) {
                input.checked = previous;
                this.setStatus(`保存设置失败：${(0, util_1.errorText)(error)}`, true);
            }
            finally {
                input.disabled = false;
            }
        });
        this.inputs[key] = input;
        return label;
    }
    makeGameTimeInput(labelText, description, placeholder = '') {
        const wrap = document.createElement('label');
        wrap.className = 'ma-lite-text-setting';
        const title = document.createElement('b');
        title.textContent = labelText;
        const detail = document.createElement('small');
        detail.textContent = description;
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = placeholder;
        input.maxLength = 80;
        input.addEventListener('change', async () => {
            const previous = String(this.actions.getGameTimeAnchor?.()?.label || '');
            const value = String(input.value || '').trim();
            input.disabled = true;
            try {
                await this.actions.setGameTimeAnchor?.(value);
                this.lastOutcome = null;
                this.setStatus(value ? `当前聊天游戏时间已设为：${value}；后续推进交由AI` : '当前聊天游戏时间已清空；该聊天不启用游戏时间');
                this.refresh();
            }
            catch (error) {
                input.value = previous;
                this.setStatus(`保存游戏时间失败：${(0, util_1.errorText)(error)}`, true);
            }
            finally { input.disabled = false; }
        });
        wrap.append(title, detail, input);
        this.gameTimeInput = input;
        return wrap;
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
        input.addEventListener('change', async () => {
            const previous = Number(this.getSettings()?.[key]);
            const value = Math.max(min, Math.min(max, Number(input.value || min)));
            input.disabled = true;
            try {
                await this.actions.configure?.({ [key]: value });
                input.value = String(value);
                this.setStatus(`${labelText}已设为 ${value}`);
            } catch (error) {
                if (Number.isFinite(previous)) input.value = String(previous);
                this.setStatus(`保存设置失败：${(0, util_1.errorText)(error)}`, true);
                this.refresh();
            }
            finally {
                input.disabled = false;
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
        if (kind === 'cancel') {
            try { await this.actions.cancel?.(); this.setStatus('已请求取消当前任务'); }
            catch (error) { this.setStatus(`取消失败：${(0, util_1.errorText)(error)}`, true); }
            return;
        }
        if (!settings.enabled) { this.setStatus('总开关已关闭', true); return; }
        if (kind === 'audit' && settings.auditEnabled === false) { this.setStatus('审核功能已关闭', true); return; }
        if (kind === 'extract' && settings.extractionEnabled === false) { this.setStatus('提取功能已关闭', true); return; }
        const action = this.actions[kind];
        if (typeof action !== 'function') { this.setStatus('该操作未连接', true); return; }
        this.pendingActions.add(kind);
        this.lastOutcome = null;
        this.syncDisabledState();
        if (kind === 'process') {
            this.setTaskProgress('audit', 'queued', '等待处理');
            this.setTaskProgress('revision', 'queued', '等待审核结果');
            this.setTaskProgress('extract', 'queued', '等待审核/修正');
            this.setTaskProgress('write', 'queued', '等待提取结果');
        } else {
            this.setTaskProgress(kind, 'queued', kind === 'audit' ? '等待审核' : '等待提取');
            if (kind === 'extract') this.setTaskProgress('write', 'queued', '等待提取结果');
        }
        this.setStatus(kind === 'process' ? '正在完整处理当前正文…' : kind === 'audit' ? '正在审核当前正文…' : '正在提取当前正文…');
        try {
            await action();
            this.lastOutcome = { kind, state: 'success' };
        } catch (error) {
            this.lastOutcome = { kind, state: 'error' };
            this.setStatus(`处理失败：${(0, util_1.errorText)(error)}`, true);
        } finally {
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
        if (this.inputs.smallSummaryMinTurns) this.inputs.smallSummaryMinTurns.value = String(settings.smallSummaryMinTurns ?? 5);
        if (this.inputs.criticalChangesForSmall) this.inputs.criticalChangesForSmall.value = String(settings.criticalChangesForSmall ?? 6);
        if (this.inputs.largeSummaryCount) this.inputs.largeSummaryCount.value = String(settings.largeSummaryCount ?? 5);
        if (this.inputs.queueCompactThreshold) this.inputs.queueCompactThreshold.value = String(settings.queueCompactThreshold ?? 6);
        if (this.inputs.auditEnabled) this.inputs.auditEnabled.checked = settings.auditEnabled !== false;
        if (this.inputs.extractionEnabled) this.inputs.extractionEnabled.checked = settings.extractionEnabled !== false;
        if (this.gameTimeInput && (typeof document === 'undefined' || document.activeElement !== this.gameTimeInput)) this.gameTimeInput.value = String(this.actions.getGameTimeAnchor?.()?.label || '');
        if (this.inputs.auditPrompt && (typeof document === 'undefined' || document.activeElement !== this.inputs.auditPrompt)) {
            this.inputs.auditPrompt.value = String(settings.auditPrompt || '');
        }
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
        this.renderPipeline();
        this.renderDiagnosticReport(this.actions.getDiagnostics?.());
        this.scheduleIndicatorRefresh();
    }
    setGlobalTaskState(state = {}) {
        this.globalTaskState = { active: state?.active === true, queued: Math.max(0, Number(state?.queued || 0)) };
        this.syncDisabledState();
    }
    syncDisabledState() {
        const settings = this.getSettings();
        const master = settings.enabled !== false;
        const live = this.actions.taskStatus?.() || this.globalTaskState;
        this.globalTaskState = { active: live?.active === true, queued: Math.max(0, Number(live?.queued || 0)) };
        const queueBusy = this.globalTaskState.active || this.globalTaskState.queued > 0;
        const busy = queueBusy || this.pendingActions.size > 0;
        if (this.panel) this.panel.setAttribute('aria-busy', busy ? 'true' : 'false');
        if (this.globalTaskNode) this.globalTaskNode.textContent = this.globalTaskState.active
            ? `全局任务：运行中${this.globalTaskState.queued ? `，另有${this.globalTaskState.queued}项等待` : ''}`
            : this.globalTaskState.queued ? `全局任务：${this.globalTaskState.queued}项等待` : '全局任务：待命';
        if (this.buttons.process) this.buttons.process.disabled = busy || !master || (settings.auditEnabled === false && settings.extractionEnabled === false);
        if (this.buttons.cancel) this.buttons.cancel.disabled = !queueBusy;
        if (this.buttons.audit) this.buttons.audit.disabled = busy || !master || settings.auditEnabled === false;
        if (this.buttons.extract) this.buttons.extract.disabled = busy || !master || settings.extractionEnabled === false;
        if (this.buttons.smallSummary) this.buttons.smallSummary.disabled = busy || !master;
        if (this.buttons.largeSummary) this.buttons.largeSummary.disabled = busy || !master;
        if (this.buttons.organizeWorldbook) this.buttons.organizeWorldbook.disabled = busy || !master;
        if (this.buttons.testApiProbe) this.buttons.testApiProbe.disabled = busy;
        if (this.buttons.auditPromptSave) this.buttons.auditPromptSave.disabled = busy;
        if (this.worldSettingPreviewButton) this.worldSettingPreviewButton.disabled = busy || !master || !String(this.worldSettingTextarea?.value || '').trim();
        if (this.worldSettingCommitButton) this.worldSettingCommitButton.disabled = busy || !master || this.worldSettingDirty || !this.actions.worldSettingsPreview?.();
        if (this.worldSettingClearButton) this.worldSettingClearButton.disabled = busy || (!String(this.worldSettingTextarea?.value || '').trim() && !this.actions.worldSettingsPreview?.());
        if (this.rebuildPreviewButton) this.rebuildPreviewButton.disabled = busy || !master;
        if (this.rebuildCommitButton) this.rebuildCommitButton.disabled = busy || !master || !this.actions.migrationPreview?.();
        if (this.rebuildUndoButton) this.rebuildUndoButton.disabled = busy || this.rebuildUndoButton.dataset.available !== 'true';
        if (this.buttons.resetCurrentChat) this.buttons.resetCurrentChat.disabled = busy;
        if (this.buttons.resetPlugin) this.buttons.resetPlugin.disabled = busy;
        if (this.diagnosticRunButton) this.diagnosticRunButton.disabled = busy || !master;
        if (this.diagnosticExportButton) this.diagnosticExportButton.disabled = busy || !this.actions.getDiagnostics?.();
        for (const input of Object.values(this.inputs)) input.disabled = busy;
        if (this.gameTimeInput) this.gameTimeInput.disabled = busy;
        if (this.apiProfileSelect && this.profileDropdownBound) this.apiProfileSelect.disabled = busy;
    }

    setMigrationProgress(progress = {}) {
        if (!this.rebuildStatusNode) return;
        const detail = String(progress.detail || '').trim();
        const current = Number(progress.current || 0);
        const total = Number(progress.total || 0);
        const requests = Number(progress.requests || 0);
        const retries = Number(progress.retries || 0);
        const prefix = total > 0 ? `${current}/${total}批` : '重建';
        this.rebuildStatusNode.textContent = `${prefix}；请求${requests}次${retries ? `，限流重试${retries}次` : ''}${detail ? `；${detail}` : ''}`;
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
        const next = {
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
            worldbookName: typeof meta.worldbookName === 'string' ? meta.worldbookName : previous.worldbookName,
            businessWriteCount: Number.isFinite(meta.businessWriteCount) ? Number(meta.businessWriteCount) : previous.businessWriteCount,
        };
        this.taskStates[kind] = next;
        if (Number.isInteger(next.messageIndex) && next.messageIndex >= 0) {
            const current = this.messageTaskStates.get(next.messageIndex) || freshMessageTaskStates();
            current[kind] = { ...next };
            this.messageTaskStates.set(next.messageIndex, current);
            while (this.messageTaskStates.size > 24) this.messageTaskStates.delete(this.messageTaskStates.keys().next().value);
        }
        this.renderPipeline();
        this.scheduleIndicatorRefresh();
    }
    resetTaskStates(detail = '待命') {
        this.taskStates = { audit: freshTaskState(detail), revision: freshTaskState(detail), extract: freshTaskState(detail), write: freshTaskState(detail) };
        this.messageTaskStates.clear();
        this.renderPipeline();
        this.lastOutcome = null;
        this.scheduleIndicatorRefresh();
    }
    togglePanel() {
        if (!this.panel) return;
        const opening = this.panel.hidden;
        this.panel.hidden = !opening;
        this.launcher?.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (opening) { this.refresh(); if (this.activePage === 'worldbook') void this.refreshWorldbookPage(true); }
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
        button.style.cssText = 'box-sizing:border-box;width:100%;min-height:44px;padding:8px 10px;text-align:left;';
        button.addEventListener('click', () => {
            if (this.panel) this.panel.hidden = false;
            this.launcher?.setAttribute('aria-expanded', 'true');
            this.refresh();
            if (this.activePage === 'worldbook') void this.refreshWorldbookPage(true);
        });
        entry.append(button);
        container.append(entry);
        this.settingsEntry = entry;
    }
    ensureHostBindings() {
        if (typeof document === 'undefined') return;
        if (!this.settingsEntry?.isConnected || this.settingsEntry.parentElement !== document.getElementById('extensions_settings2')) this.mountOfficialSettingsEntry();
        const chat = document.getElementById('chat');
        if (chat && chat !== this.observedChat && typeof MutationObserver !== 'undefined') {
            this.observer?.disconnect();
            this.observedChat = chat;
            this.observer = new MutationObserver(() => this.scheduleIndicatorRefresh());
            this.observer.observe(chat, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'is_user', 'is_system', 'mesid', 'data-message-id', 'data-mesid', 'id'] });
        }
    }
    observeHostDom() {
        this.hostObserver?.disconnect();
        if (!document.body || typeof MutationObserver === 'undefined') return;
        this.hostObserver = new MutationObserver(() => {
            if (this.hostBindFrame) return;
            this.hostBindFrame = requestAnimationFrame(() => {
                this.hostBindFrame = 0;
                this.ensureHostBindings();
                this.scheduleIndicatorRefresh();
            });
        });
        this.hostObserver.observe(document.body, { childList: true, subtree: true });
    }
    rebindHostDom() {
        this.observer?.disconnect();
        this.observer = null;
        this.observedChat = null;
        this.ensureHostBindings();
        this.scheduleIndicatorRefresh();
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
        const allMessages = [...document.querySelectorAll('#chat .mes')];
        const messages = allMessages.filter((message) => isAssistantDomMessage(message));
        const latest = messages.length ? messages[messages.length - 1] : null;
        const visible = new Set();
        for (const message of messages) {
            const fallbackIndex = allMessages.indexOf(message);
            const index = messageDomIndex(message, fallbackIndex);
            if (!Number.isInteger(index)) continue;
            let states = this.messageTaskStates.get(index);
            if (!states && message === latest) {
                const globalBelongsHere = Object.values(this.taskStates).some((state) => Number.isInteger(state?.messageIndex) && state.messageIndex === index);
                states = globalBelongsHere ? this.taskStates : freshMessageTaskStates();
            }
            if (!states) continue;
            visible.add(index);
            this.renderIndicatorForMessage(message, states, index);
        }
        document.querySelectorAll(`.${INDICATOR_CLASS}`).forEach((node) => {
            const index = Number(node.dataset.messageIndex);
            if (!visible.has(index)) node.remove();
        });
    }
    renderIndicatorForMessage(target, taskStates, resolvedIndex = null) {
        const text = target.querySelector('.mes_text');
        const block = target.querySelector('.mes_block') || target;
        if (!text || !block) return;
        const messageIndex = Number.isInteger(resolvedIndex) ? resolvedIndex : messageDomIndex(target);
        let indicator = block.querySelector(`.${INDICATOR_CLASS}`);
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = INDICATOR_CLASS;
            if (text.parentElement) text.insertAdjacentElement('afterend', indicator);
            else block.append(indicator);
        }
        indicator.dataset.messageIndex = String(messageIndex);
        const settings = this.getSettings();
        const master = settings.enabled !== false;
        const enabled = { audit: master && settings.auditEnabled !== false, revision: master && settings.auditEnabled !== false, extract: master && settings.extractionEnabled !== false, write: master && settings.extractionEnabled !== false };
        const labels = { audit: '审', revision: '修', extract: '提', write: '写' };
        const fullLabels = { audit: '审核', revision: '修正', extract: '提取', write: '写入' };
        const parts = [];
        const titleLines = [`正文 #${messageIndex} 的镜渊处理状态`];
        for (const kind of ['audit', 'revision', 'extract', 'write']) {
            const state = this.indicatorState(kind, enabled[kind], taskStates);
            parts.push(`<span class="ma-ind-part"><i class="ma-ind-dot" data-state="${state}"></i>${labels[kind]}</span>`);
            titleLines.push(`${fullLabels[kind]}：${taskStates[kind]?.detail || this.stateLabel(state)}`);
        }
        const write = taskStates.write || {};
        if (write.worldbookName) titleLines.push(`目标世界书：${write.worldbookName}`);
        if (Number.isFinite(write.businessWriteCount)) titleLines.push(`业务写入：${write.businessWriteCount}条`);
        indicator.title = titleLines.join('\n');
        indicator.innerHTML = `<span class="ma-ind-label">镜渊</span>${parts.join('')}`;
    }
    indicatorState(kind, enabled, taskStates = this.taskStates) {
        if (!enabled) return 'disabled';
        const state = taskStates[kind]?.state;
        if (state === 'queued') return 'queued';
        if (state === 'running') return 'running';
        if (state === 'success') return 'success';
        if (state === 'warning') return 'warning';
        if (state === 'error') return 'error';
        if (state === 'disabled') return 'disabled';
        return 'ready';
    }
    stateLabel(state) {
        return ({ disabled: '关闭', queued: '排队', running: '处理中', warning: '需修正', success: '完成', error: '失败', ready: '待命' })[state] || '待命';
    }
}
function freshTaskState(detail = '待命') {
    return { state: 'idle', detail, titles: [], created: [], updated: [], deleted: [], skipped: [], merged: [], repaired: 0, messageIndex: null, queuePosition: 0, worldbookName: '', businessWriteCount: 0 };
}
function freshMessageTaskStates() {
    return { audit: freshTaskState('待命'), revision: freshTaskState('待命'), extract: freshTaskState('待命'), write: freshTaskState('待命') };
}
function messageDomIndex(node, fallbackIndex = null) {
    for (const name of ['mesid', 'data-message-id', 'data-mesid', 'data-message-index']) {
        const value = node?.getAttribute?.(name);
        if (value !== null && value !== undefined && /^-?\d+$/u.test(String(value))) return Number(value);
    }
    const id = String(node?.id || '');
    const idMatch = id.match(/(?:message|mes)[-_]?(\d+)$/iu);
    if (idMatch) return Number(idMatch[1]);
    return Number.isInteger(fallbackIndex) && fallbackIndex >= 0 ? fallbackIndex : null;
}
function isAssistantDomMessage(node) {
    const user = String(node?.getAttribute?.('is_user') ?? node?.dataset?.isUser ?? '').toLowerCase();
    const system = String(node?.getAttribute?.('is_system') ?? node?.dataset?.isSystem ?? '').toLowerCase();
    if (['true', '1', 'yes'].includes(user) || ['true', '1', 'yes'].includes(system)) return false;
    return Boolean(node?.querySelector?.('.mes_text'));
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
            uid: String(entry.uid ?? ''),
            type: String(entry.type ?? ''),
            focus: entry.focus === true,
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
    return { total: mapped.length, summary, entries: mapped, omitted: 0 };
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
function clamp01(value) {
    return Math.min(1, Math.max(0, Number(value) || 0));
}
exports.ControlPanel = ControlPanel;
},"diagnostics":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagnosticsService = void 0;
exports.buildDiagnosticFilename = buildDiagnosticFilename;
exports.summarizeDiagnosticReport = summarizeDiagnosticReport;
exports.findFreeDiagnosticUid = findFreeDiagnosticUid;
const constants_1 = require("./constants");
const util_1 = require("./util");
const prompts_1 = require("./prompts");
const audit_1 = require("./audit");
const parser_1 = require("./parser");
const model_request_1 = require("./model-request");

/**
 * [MA-DIAG-01] 真实宿主验收与诊断导出。
 * 只读取聊天正文；世界书写入测试使用禁用临时条目并在同一事务内恢复完整快照。
 * 报告只记录结构、计数、哈希与错误，不导出正文、提示词、API Key 或完整模型响应。
 */
class DiagnosticsService {
    constructor(host, worldbook, getSettings, onProgress, hooks = {}) {
        this.host = host;
        this.worldbook = worldbook;
        this.getSettings = getSettings;
        this.onProgress = onProgress;
        this.hooks = hooks && typeof hooks === 'object' ? hooks : {};
        this.lastReport = null;
    }
    currentReport() { return this.lastReport ? (0, util_1.clone)(this.lastReport) : null; }
    clear() { this.lastReport = null; }
    async run(settings, snapshot, validate) {
        const suiteStarted = new Date();
        const totalRounds = 3;
        const rounds = [];
        for (let roundIndex = 1; roundIndex <= totalRounds; roundIndex += 1) {
            await this.hooks.resetRound?.(roundIndex, totalRounds);
            validate?.();
            this.progress({ state: 'running', detail: `全量验收第 ${roundIndex}/${totalRounds} 轮：已回到原始快照，从宿主检查重新开始`, roundIndex, totalRounds });
            const round = await this.runSingleRound(settings, snapshot, validate, { roundIndex, totalRounds, suppressFinal: true });
            rounds.push(round);
            if (!roundSafetyPassed(round)) break;
        }
        const pluginPassRounds = rounds.filter((round) => round.pluginAccepted === true).length;
        const mainPassRounds = rounds.filter((round) => round.mainChatAccepted === true).length;
        const mainAttemptRounds = rounds.filter((round) => round.checks?.some((check) => check.id === 'main-e2e-generation' && check.status !== 'skip')).length;
        const safetyAllPass = rounds.length === totalRounds && rounds.every(roundSafetyPassed);
        const transportAllPass = rounds.every((round) => round.checks?.some((check) => check.id === 'official-transport-integrity' && check.status === 'pass'));
        const selected = rounds.at(-1);
        const report = selected ? (0, util_1.clone)(selected) : {
            schemaVersion: 4,
            plugin: { name: constants_1.DISPLAY_NAME, version: constants_1.VERSION },
            checks: [],
            summary: { pass: 0, warn: 0, fail: 1, skip: 0, total: 1 },
        };
        report.schemaVersion = 4;
        report.startedAt = suiteStarted.toISOString();
        report.finishedAt = new Date().toISOString();
        report.durationMs = Date.now() - suiteStarted.getTime();
        report.executionMode = 'three-independent-full-rounds-real-host-e2e-with-controlled-fault-matrix';
        report.rounds = rounds.map((round) => (0, util_1.clone)(round));
        report.roundSummary = {
            requested: totalRounds,
            completed: rounds.length,
            pluginPassRounds,
            mainPassRounds,
            mainAttemptRounds,
            safetyAllPass,
            transportAllPass,
            selectedRound: Number(selected?.roundIndex || 0),
        };
        report.pluginAccepted = pluginPassRounds === totalRounds && safetyAllPass && transportAllPass;
        report.mainChatAccepted = mainPassRounds === totalRounds ? true : (mainAttemptRounds > 0 ? false : null);
        report.acceptance = {
            pluginClosedLoop: pluginPassRounds === totalRounds ? 'stable-pass' : (pluginPassRounds > 0 ? 'unstable' : 'fail'),
            mainChat: mainPassRounds === totalRounds ? 'stable-pass' : (mainPassRounds > 0 ? 'unstable' : (mainAttemptRounds > 0 ? 'fail' : 'unavailable')),
            transportIntegrity: transportAllPass ? 'pass' : 'fail',
            roundIsolation: safetyAllPass ? 'pass' : 'fail',
        };
        report.accepted = report.pluginAccepted;
        report.checks = Array.isArray(report.checks) ? report.checks.filter((check) => check.id !== 'full-round-aggregate') : [];
        report.checks.push({
            id: 'full-round-aggregate',
            label: '三轮全量重启验收汇总',
            category: '验收轮次',
            status: report.accepted ? (pluginPassRounds === totalRounds && mainPassRounds === totalRounds ? 'pass' : 'warn') : 'fail',
            durationMs: report.durationMs,
            detail: report.accepted
                ? `插件闭环 ${pluginPassRounds}/${totalRounds} 轮稳定通过；每轮均从原快照重头开始`
                : `插件闭环仅 ${pluginPassRounds}/${totalRounds} 轮通过；最终候选要求三轮全部通过且安全恢复、官方传输均通过`,
            evidence: {
                requestedRounds: totalRounds,
                completedRounds: rounds.length,
                pluginPassRounds,
                mainPassRounds,
                mainAttemptRounds,
                safetyAllPass,
                transportAllPass,
                selectedRound: Number(selected?.roundIndex || 0),
            },
        });
        report.summary = countStatuses(report.checks);
        this.lastReport = (0, util_1.clone)(report);
        this.progress({ state: report.accepted ? 'success' : 'error', detail: summarizeDiagnosticReport(report), report: this.currentReport() });
        return this.currentReport();
    }
    async runSingleRound(settings, snapshot, validate, options = {}) {
        const startedAt = new Date();
        const report = {
            schemaVersion: 4,
            roundIndex: Number(options.roundIndex || 1),
            totalRounds: Number(options.totalRounds || 1),
            plugin: { name: constants_1.DISPLAY_NAME, version: constants_1.VERSION },
            startedAt: startedAt.toISOString(),
            finishedAt: '',
            durationMs: 0,
            accepted: false,
            pluginAccepted: false,
            mainChatAccepted: null,
            acceptance: { pluginClosedLoop: 'pending', mainChat: 'pending' },
            executionMode: 'single-independent-full-round-real-host-e2e-with-controlled-fault-matrix',
            summary: { pass: 0, warn: 0, fail: 0, skip: 0, total: 0 },
            environment: {},
            scope: {},
            settings: sanitizeSettings(settings),
            checks: [],
        };
        const runCheck = async (id, label, category, action, options = {}) => {
            const checkStarted = Date.now();
            this.progress({ state: 'running', detail: label, checkId: id });
            try {
                validate?.();
                const evidence = await action();
                validate?.();
                const status = options.status === 'warn' ? 'warn' : 'pass';
                report.checks.push({ id, label, category, status, durationMs: Date.now() - checkStarted, detail: options.detail || '通过', evidence: sanitizeEvidence(evidence) });
                return evidence;
            }
            catch (error) {
                const optional = options.optional === true;
                report.checks.push({ id, label, category, status: optional ? 'warn' : 'fail', durationMs: Date.now() - checkStarted, detail: (0, util_1.errorText)(error), evidence: sanitizeEvidence(error?.diagnosticEvidence) });
                return null;
            }
        };
        const pushSkip = (id, label, category, detail) => {
            report.checks.push({ id, label, category, status: 'skip', durationMs: 0, detail, evidence: null });
        };
        let context = null;
        let transaction = null;
        let rawBefore = null;
        let chatBefore = null;
        let generationStateBefore = null;
        let sandboxRestored = false;
        try {
            context = this.host.context();
            report.environment = collectEnvironment(context);
            report.scope = collectScope(this.host, context, settings);
            chatBefore = chatDigest(context.chat);
            generationStateBefore = collectGenerationState(this.host, context, settings);
            transaction = this.host.captureDiagnosticTransaction();

            await runCheck('host-context', 'SillyTavern 宿主上下文', '宿主', async () => {
                const required = ['eventSource', 'chat', 'saveSettingsDebounced'];
                const missing = required.filter((key) => context[key] == null);
                if (missing.length) throw new Error(`缺少宿主字段：${missing.join('、')}`);
                const APIs = {
                    eventApi: typeof context.eventSource?.on === 'function',
                    stscript: typeof context.executeSlashCommandsWithOptions === 'function',
                    mainTrigger: typeof context.executeSlashCommandsWithOptions === 'function',
                    saveChat: typeof context.saveChat === 'function',
                };
                if (Object.values(APIs).some((value) => !value)) throw new Error(`端到端宿主 API 不完整：${Object.entries(APIs).filter(([, value]) => !value).map(([key]) => key).join('、')}`);
                return { ...APIs, messageCount: Array.isArray(context.chat) ? context.chat.length : 0 };
            });

            await runCheck('chat-scope', '当前聊天作用域', '宿主', async () => {
                const chatKey = this.host.chatKey();
                if (!chatKey) throw new Error('当前没有活动聊天');
                return { chatKeyHash: (0, util_1.hashText)(chatKey), roleKeyHash: (0, util_1.hashText)(this.host.roleKey()), messageCount: context.chat?.length ?? 0 };
            });

            await runCheck('official-transport-integrity', '官方连接与端点原样保持', '连接', async () => {
                const before = collectOfficialTransportEvidence(this.host, context, settings);
                if (before.invalidProfileUrls.length) {
                    throw new Error(`Connection Profile URL 不符合 SillyTavern Custom 端点规则：${before.invalidProfileUrls.join('、')}；应保存基础地址，可含 /v1，但不得包含 /chat/completions`);
                }
                if (!before.mainUsesOfficialGenerate) throw new Error('主聊天验收未连接 SillyTavern 官方 STscript /trigger 接口');
                if (before.profileCount > 0 && !before.profileUsesOfficialService) throw new Error('Connection Profile 验收未连接官方 ConnectionManagerRequestService');
                return before;
            });

            await runCheck('worldbook-binding', '当前聊天世界书绑定', '世界书', async () => {
                const name = this.host.targetWorldbookName(settings);
                if (!name) throw new Error('当前聊天未绑定世界书，且未启用自动创建');
                return { worldbookName: name };
            });

            await runCheck('worldbook-authoritative-read', '世界书后端权威读取', '世界书', async () => {
                rawBefore = await this.worldbook.readRaw(settings, snapshot, validate);
                return {
                    worldbookName: rawBefore.name,
                    entryCount: Object.keys(rawBefore.data?.entries ?? {}).length,
                    digest: digestWorldbook(rawBefore.data),
                };
            });

            const routes = configuredModelRoutes(settings);
            for (const route of routes) {
                await runCheck(`model-route:${route.id || 'current'}`, `模型实机调用：${route.label}`, '模型', async () => {
                    const childToken = { cancelled: false, reason: '' };
                    const modelSnapshot = this.host.captureMaintenanceSnapshot(settings, `acceptanceModel:${route.id || 'current'}`, childToken);
                    const routeBefore = collectGenerationState(this.host, context, settings);
                    const output = await this.host.generate(
                        '你正在执行插件连接验收。不得解释、不得输出推理，只输出指定字符串。',
                        '只输出：MA_ACCEPTANCE_OK',
                        256,
                        modelSnapshot,
                        settings,
                        Math.min(Math.max(10000, Number(settings.requestTimeoutMs) || 90000), 60000),
                        route.id,
                    );
                    const routeAfter = collectGenerationState(this.host, context, settings);
                    if (!/MA_ACCEPTANCE_OK/iu.test(String(output))) {
                        const error = new Error(`模型没有返回验收协议；最终文本长度 ${String(output).length} 字`);
                        error.diagnosticEvidence = { mode: 'real-host', route: route.summary, outputChars: String(output).length, outputHash: (0, util_1.hashText)(String(output)) };
                        throw error;
                    }
                    if (JSON.stringify(routeBefore) !== JSON.stringify(routeAfter)) throw new Error('模型测试后主连接状态发生变化');
                    return { mode: 'real-host', route: route.summary, outputChars: String(output).length, outputHash: (0, util_1.hashText)(String(output)), mainGenerationStatePreserved: true };
                });
            }

            if (settings.auditEnabled !== false) {
                await runCheck('audit-protocol', '审核提示词与 PASS 协议', '业务协议', async () => {
                    const childToken = { cancelled: false, reason: '' };
                    const protocolSnapshot = this.host.captureMaintenanceSnapshot(settings, 'acceptanceAuditProtocol', childToken);
                    const playerText = '我推开大厅的门。';
                    const assistantText = '门向内打开，灯火照亮青石地面。守门人站在远处看向门口。';
                    const prompt = (0, prompts_1.auditPrompts)(settings, playerText, assistantText, { dialogueContext: '' });
                    const raw = await (0, model_request_1.callModel)({
                        host: this.host,
                        stage: 'audit',
                        prompt,
                        fallbackPrompt: () => (0, prompts_1.auditPrompts)(settings, playerText, assistantText, { compact: true, dialogueContext: '', requestTime: snapshot.capturedAt, currentGameTime: host.getCurrentGameTime?.() || null }),
                        settings,
                        snapshot: protocolSnapshot,
                        profileId: settings.auditProfileId,
                        sourceText: `${playerText}\n${assistantText}`,
                    });
                    const parsed = (0, audit_1.parseAuditResult)(raw);
                    if (parsed.decision !== 'pass') throw new Error(`合规样本被判定需要修正：${parsed.issues?.slice(0, 3).join('；') || '未提供原因'}`);
                    return { mode: 'real-model-protocol', decision: parsed.decision, route: settings.auditProfileId ? 'profile' : 'current' };
                });
            }
            else pushSkip('audit-protocol', '审核提示词与 PASS 协议', '业务协议', '审核功能已关闭');

            if (settings.extractionEnabled !== false) {
                await runCheck('extraction-protocol', '提取提示词与条目格式', '业务协议', async () => {
                    const childToken = { cancelled: false, reason: '' };
                    const protocolSnapshot = this.host.captureMaintenanceSnapshot(settings, 'acceptanceExtractionProtocol', childToken);
                    const playerText = '我走进青石大厅。';
                    const assistantText = '青石大厅灯火通明，北侧铁门已经打开。守门人阿洛站在门旁，明确告诉你这里是王城议事厅的入口。';
                    const prompt = (0, prompts_1.extractionPrompts)(settings, playerText, assistantText, [], { dialogueContext: '' });
                    const raw = await (0, model_request_1.callModel)({
                        host: this.host,
                        stage: 'extraction',
                        prompt,
                        fallbackPrompt: () => (0, prompts_1.extractionPrompts)(settings, playerText, assistantText, [], { compact: true, dialogueContext: '' }),
                        settings,
                        snapshot: protocolSnapshot,
                        profileId: settings.extractionProfileId,
                        sourceText: `${playerText}\n${assistantText}`,
                    });
                    const blocks = (0, parser_1.parseExtractionWithRecovery)(raw);
                    if (!blocks.length) {
                        const diagnostics = blocks.diagnostics || {};
                        throw new Error(`合成状态变化未形成可识别条目格式；异常片段${(diagnostics.skipped || []).length}个`);
                    }
                    return { mode: 'real-model-protocol', entryCount: blocks.length, titles: blocks.map((block) => String(block.title || '')).slice(0, 8), repaired: Number(blocks.diagnostics?.repaired || 0), route: settings.extractionProfileId ? 'profile' : 'current' };
                });
            }
            else pushSkip('extraction-protocol', '提取提示词与条目格式', '业务协议', '提取功能已关闭');

            if (rawBefore) {
                await runCheck('worldbook-reversible-write', '世界书写入—回读—回滚', '世界书', async () => {
                    return { mode: 'real-host', ...(await this.reversibleWorldbookWrite(settings, snapshot, rawBefore, validate)) };
                });
            }
            else pushSkip('worldbook-reversible-write', '世界书写入—回读—回滚', '世界书', '权威读取未通过，未执行写入测试');

            let mainSent = null;
            let mainGenerated = null;
            let mainPipeline = null;
            let pluginFixture = null;
            let pluginPipeline = null;
            const verifyPipeline = async (result, mode) => {
                const warehouse = result?.warehouse ?? {};
                const created = Array.isArray(warehouse.created) ? warehouse.created : [];
                const updated = Array.isArray(warehouse.updated) ? warehouse.updated : [];
                const deleted = Array.isArray(warehouse.deleted) ? warehouse.deleted : [];
                const businessWrites = created.length + updated.length + deleted.length;
                const readBack = await this.worldbook.readRaw(settings, snapshot, validate);
                if (settings.extractionEnabled !== false && businessWrites < 1) throw new Error('正文完成提取但业务条目零写入');
                const stages = this.hooks.pipelineState?.() ?? {};
                for (const key of ['audit', 'revision', 'extract', 'write']) {
                    if (!stages[key]) throw new Error(`四阶段状态缺少 ${key}`);
                    if (stages[key].state === 'running' || stages[key].state === 'queued') throw new Error(`阶段 ${key} 未收敛`);
                }
                return {
                    mode,
                    businessWrites,
                    created,
                    updated,
                    deleted,
                    stages,
                };
            };

            if (rawBefore && typeof this.hooks.executeTurn === 'function') {
                mainSent = await runCheck('main-e2e-user-send', '主聊天链：自动发送玩家测试消息', '主聊天端到端', async () => {
                    const result = await this.host.sendDiagnosticUserMessage(
                        '【镜渊自动验收临时消息】请自然回复三段完整叙事，约五百字。正文中明确写出：镜渊验收庭灯火通明，北侧银门已经打开，守门人洛恩站在门旁，并说明这里是王城议事厅入口。不要替玩家行动或决定，结尾必须完整。'
                    );
                    return { mode: 'real-host-main-chat', ...result };
                });

                if (mainSent) {
                    mainGenerated = await runCheck('main-e2e-generation', '主聊天链：主模型真实正文生成', '主聊天端到端', async () => {
                        const before = collectGenerationState(this.host, context, settings);
                        const result = await this.host.generateDiagnosticAssistant(Math.max(60000, Number(settings.requestTimeoutMs) || 90000));
                        const after = collectGenerationState(this.host, context, settings);
                        if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('主正文生成后连接或响应长度状态发生变化');
                        if (result.chars < 120) throw new Error(`主正文仅 ${result.chars} 字，明显过短`);
                        if (!result.completeEnding) throw new Error('主正文结尾不完整，疑似被截断');
                        return { mode: 'real-host-main-generation', ...result, mainGenerationStatePreserved: true };
                    }, { optional: true });
                }

                if (mainGenerated) {
                    mainPipeline = await runCheck('main-e2e-full-pipeline', '主聊天链：真实正文完整处理', '主聊天端到端', async () => {
                        const result = await this.hooks.executeTurn('full', mainGenerated.index, false, settings);
                        return verifyPipeline(result, 'real-host-main-pipeline');
                    }, { optional: true });
                }
                else pushSkip('main-e2e-full-pipeline', '主聊天链：真实正文完整处理', '主聊天端到端', '主正文生成不可用，插件闭环将继续独立验收');

                if (mainPipeline && mainGenerated) {
                    await runCheck('main-e2e-idempotency', '主聊天链：同一正文重复处理幂等性', '主聊天组合', async () => {
                        const before = await this.worldbook.readRaw(settings, snapshot, validate);
                        const beforeDigest = digestWorldbook(before.data);
                        const result = await this.hooks.executeTurn('full', mainGenerated.index, false, settings);
                        const after = await this.worldbook.readRaw(settings, snapshot, validate);
                        const afterDigest = digestWorldbook(after.data);
                        if (beforeDigest !== afterDigest) throw new Error('同一主正文重复处理改变了世界书');
                        return { mode: 'real-host-main-combination', skippedResult: Array.isArray(result) && result.length === 0, beforeDigest, afterDigest };
                    }, { optional: true });
                }
                else pushSkip('main-e2e-idempotency', '主聊天链：同一正文重复处理幂等性', '主聊天组合', '主聊天完整处理未通过');

                // [MA-DIAG-E2E-PLUGIN-01] 无论玩家主 API 是否可用，都创建确定性临时 AI 正文，
                // 使用真实审核/修正/提取/世界书模块跑完整插件闭环。该链是候选包验收的硬门槛。
                pluginFixture = await runCheck('plugin-e2e-fixture', '插件闭环：自动建立完整测试回合', '插件端到端', async () => {
                    const playerText = '我停在镜渊原子校验厅门外，观察大厅与守门人，没有替自己作出决定。';
                    const assistantText = [
                        '当前场景为镜渊原子校验厅，当前在场者只有守门人伊珞。厅内灯火通明，青石地面映着稳定的暖光。',
                        '东侧青铜门已经完全打开。守门人伊珞站在门旁，佩戴刻有镜渊徽记的铜牌。他明确说明这里是原子校验厅的唯一入口。',
                        '伊珞始终保持在门旁的原位，没有提出命令，没有要求来访者行动，也没有替任何人作出选择。大厅中的钟声响过一次，青铜门与伊珞的位置都没有变化。',
                    ].join('\n\n');
                    const turn = await this.host.appendDiagnosticAssistantTurn(playerText, assistantText);
                    return { mode: 'real-host-deterministic-fixture', ...turn, assistantChars: assistantText.length, assistantHash: (0, util_1.hashText)(assistantText) };
                });

                if (pluginFixture) {
                    pluginPipeline = await runCheck('plugin-e2e-full-pipeline', '插件闭环：审核—提取—写入—召回配置', '插件端到端', async () => {
                        // Keep the deterministic commit chain immutable.  The
                        // real audit protocol and real violation/revision
                        // branch are tested as separate hard gates below.
                        const result = await this.hooks.executeTurn('diagnosticExtraction', pluginFixture.assistantIndex, false, settings);
                        return verifyPipeline(result, 'real-host-plugin-full-pipeline');
                    });
                }

                if (pluginPipeline && pluginFixture) {
                    await runCheck('plugin-e2e-idempotency', '插件闭环：重复处理幂等性', '插件组合', async () => {
                        const before = await this.worldbook.readRaw(settings, snapshot, validate);
                        const beforeDigest = digestWorldbook(before.data);
                        const result = await this.hooks.executeTurn('diagnosticExtraction', pluginFixture.assistantIndex, false, settings);
                        const after = await this.worldbook.readRaw(settings, snapshot, validate);
                        const afterDigest = digestWorldbook(after.data);
                        if (beforeDigest !== afterDigest) throw new Error('插件闭环同一正文重复处理改变了世界书');
                        return { mode: 'real-host-plugin-combination', skippedResult: Array.isArray(result) && result.length === 0, beforeDigest, afterDigest };
                    });
                }
                else pushSkip('plugin-e2e-idempotency', '插件闭环：重复处理幂等性', '插件组合', '插件完整处理链未通过');

                if (settings.auditEnabled !== false) {
                    await runCheck('e2e-revision-branch', '审核失败—完整修正—安全替换', '端到端', async () => {
                        const violation = '你立刻拔剑冲进银门，替自己决定接受守门人的命令；你心中已经认定洛恩绝对可信。';
                        const turn = await this.host.appendDiagnosticAssistantTurn('我站在原地观察，没有采取行动。', violation);
                        const result = await this.hooks.executeTurn('audit', turn.assistantIndex, false, settings);
                        const revised = this.host.latestTurn(turn.assistantIndex).assistantText;
                        if (result?.auditReplaced !== true) throw new Error('确定性违规样本未触发正文修正');
                        if (!revised || revised === violation) throw new Error('修正分支没有替换违规正文');
                        if (/你立刻拔剑|你心中已经认定/u.test(revised)) throw new Error('修正版仍保留替玩家行动或心理结论');
                        if (revised.length < Math.max(10, Math.floor(violation.length * 0.25)) || !/[。！？!?]”?’?$/u.test(revised)) throw new Error('修正版异常短或结尾不完整，疑似截断');
                        return { mode: 'real-host-revision', originalChars: violation.length, revisedChars: revised.length, revisedHash: (0, util_1.hashText)(revised) };
                    });
                }
                else pushSkip('e2e-revision-branch', '审核失败—完整修正—安全替换', '端到端', '审核功能已关闭');

                await runCheck('e2e-current-chat-reset', '当前聊天重置作用域', '组合', async () => {
                    const before = await this.worldbook.readRaw(settings, snapshot, validate);
                    const digestBefore = digestWorldbook(before.data);
                    const hadState = await this.host.resetCurrentChatState();
                    const after = await this.worldbook.readRaw(settings, snapshot, validate);
                    const digestAfter = digestWorldbook(after.data);
                    if (digestBefore !== digestAfter) throw new Error('重置当前聊天改变了世界书正文');
                    return { mode: 'real-host-combination', hadPluginState: hadState, worldbookPreserved: true, digestBefore, digestAfter };
                });
            }
            else {
                pushSkip('main-e2e-user-send', '主聊天链：自动发送玩家测试消息', '主聊天端到端', rawBefore ? '完整链执行器未连接' : '世界书未通过权威读取');
                pushSkip('main-e2e-generation', '主聊天链：主模型真实正文生成', '主聊天端到端', '玩家测试消息未发送');
                pushSkip('main-e2e-full-pipeline', '主聊天链：真实正文完整处理', '主聊天端到端', '主正文未生成');
                pushSkip('main-e2e-idempotency', '主聊天链：同一正文重复处理幂等性', '主聊天组合', '完整处理链未执行');
                pushSkip('plugin-e2e-fixture', '插件闭环：自动建立完整测试回合', '插件端到端', '完整链执行器未连接');
                pushSkip('plugin-e2e-full-pipeline', '插件闭环：审核—提取—写入—召回配置', '插件端到端', '完整链执行器未连接');
                pushSkip('plugin-e2e-idempotency', '插件闭环：重复处理幂等性', '插件组合', '完整链执行器未连接');
                pushSkip('e2e-revision-branch', '审核失败—完整修正—安全替换', '端到端', '完整链执行器未连接');
                pushSkip('e2e-current-chat-reset', '当前聊天重置作用域', '组合', '完整链执行器未连接');
            }

            await runCheck('controlled-fault-matrix', '网关与协议故障分类矩阵', '受控故障', async () => {
                const gatewayErrors = [
                    new SyntaxError('Unexpected token \'<\', "<html><h1>504</h1>" is not valid JSON'),
                    new Error('502 Bad Gateway'),
                    new Error('503 upstream unavailable'),
                    new Error('504 Gateway Timeout'),
                    new Error('fetch failed: connection reset'),
                ];
                const failed = gatewayErrors.filter((error) => !(0, model_request_1.isRetryableGatewayError)(error));
                if (failed.length) throw new Error(`未识别${failed.length}类可重试网关错误`);
                let auditRejected = false;
                try { (0, audit_1.parseAuditResult)('这里没有 PASS 或 FAIL'); }
                catch { auditRejected = true; }
                const malformed = (0, parser_1.parseExtractionWithRecovery)('<html>bad gateway</html>');
                if (!auditRejected || malformed.length) throw new Error('协议错误没有被严格拒绝');
                return { mode: 'controlled-fault-injection', gatewayCases: gatewayErrors.length, auditMalformedRejected: auditRejected, extractionMalformedRejected: malformed.length === 0 };
            });

            await runCheck('ui-surface', '插件 UI 与四阶段状态面板', '界面', async () => {
                if (typeof document === 'undefined') return { environment: 'headless', skippedDomInspection: true };
                const panel = document.getElementById('mirror-abyss-lite-panel');
                if (!panel) throw new Error('未找到镜渊面板');
                const requiredActions = ['process', 'audit', 'extract', 'cancel', 'runAcceptance', 'exportDiagnostics'];
                const missing = requiredActions.filter((kind) => !panel.querySelector(`[data-kind="${kind}"]`));
                if (missing.length) throw new Error(`缺少按钮：${missing.join('、')}`);
                const stages = [...panel.querySelectorAll('.ma-lite-stage')].length;
                if (stages !== 4) throw new Error(`四阶段状态数量异常：${stages}`);
                return { mode: 'real-dom', buttonCount: panel.querySelectorAll('button').length, stageCount: stages };
            }, { optional: typeof document === 'undefined' });

            await runCheck('sandbox-restore', '验收沙箱完整恢复', '安全', async () => {
                let worldbookEvidence = { restored: true, changed: false };
                if (rawBefore) {
                    const current = await this.worldbook.readRaw(settings, snapshot, validate);
                    const currentDigest = digestWorldbook(current.data);
                    const originalDigest = digestWorldbook(rawBefore.data);
                    if (currentDigest !== originalDigest) {
                        await this.worldbook.replaceRaw(settings, rawBefore.name, (0, util_1.clone)(rawBefore.data), snapshot, validate, current.data);
                        const restored = await this.worldbook.readRaw(settings, snapshot, validate);
                        if (digestWorldbook(restored.data) !== originalDigest) throw new Error('世界书无法恢复到验收前快照');
                        worldbookEvidence = { restored: true, changed: true, originalDigest };
                    }
                }
                const chatEvidence = transaction ? await this.host.restoreDiagnosticTransaction(transaction) : null;
                sandboxRestored = true;
                return { mode: 'real-host-rollback', worldbook: worldbookEvidence, chat: chatEvidence };
            });

            await runCheck('chat-nonmutation', '聊天正文与元数据已恢复', '安全', async () => {
                const after = chatDigest(this.host.context().chat);
                if (JSON.stringify(chatBefore) !== JSON.stringify(after)) throw new Error('验收结束后聊天正文或消息数量与原快照不一致');
                return after;
            });

            await runCheck('generation-state-nonmutation', '主生成连接状态未被验收污染', '安全', async () => {
                const after = collectGenerationState(this.host, this.host.context(), settings);
                if (JSON.stringify(generationStateBefore) !== JSON.stringify(after)) throw new Error('验收期间主模型连接或生成状态发生变化');
                return after;
            });
        }
        catch (error) {
            report.checks.push({ id: 'diagnostic-runner', label: '自动验收执行器', category: '诊断', status: 'fail', durationMs: Date.now() - startedAt.getTime(), detail: (0, util_1.errorText)(error), evidence: null });
        }
        finally {
            if (!sandboxRestored && context && transaction) {
                let restoreError = '';
                try {
                    if (rawBefore) {
                        const current = await this.worldbook.readRaw(settings, snapshot, undefined);
                        if (digestWorldbook(current.data) !== digestWorldbook(rawBefore.data))
                            await this.worldbook.replaceRaw(settings, rawBefore.name, (0, util_1.clone)(rawBefore.data), snapshot, undefined, current.data);
                    }
                    await this.host.restoreDiagnosticTransaction(transaction);
                    sandboxRestored = true;
                }
                catch (error) { restoreError = (0, util_1.errorText)(error); }
                if (!sandboxRestored) report.checks.push({ id: 'emergency-restore', label: '验收紧急恢复', category: '安全', status: 'fail', durationMs: 0, detail: restoreError || '恢复失败', evidence: null });
            }
            report.finishedAt = new Date().toISOString();
            report.durationMs = Date.now() - startedAt.getTime();
            report.summary = countStatuses(report.checks);
            const requiredPlugin = ['host-context', 'official-transport-integrity', 'worldbook-authoritative-read', 'worldbook-reversible-write', 'audit-protocol', 'plugin-e2e-fixture', 'plugin-e2e-full-pipeline', 'plugin-e2e-idempotency', 'e2e-revision-branch', 'controlled-fault-matrix', 'sandbox-restore', 'chat-nonmutation', 'generation-state-nonmutation'];
            const passed = new Set(report.checks.filter((check) => check.status === 'pass').map((check) => check.id));
            const failed = new Set(report.checks.filter((check) => check.status === 'fail').map((check) => check.id));
            report.pluginAccepted = requiredPlugin.every((id) => passed.has(id)) && !requiredPlugin.some((id) => failed.has(id));
            const mainRequired = ['main-e2e-user-send', 'main-e2e-generation', 'main-e2e-full-pipeline'];
            report.mainChatAccepted = mainRequired.every((id) => passed.has(id));
            report.acceptance = {
                pluginClosedLoop: report.pluginAccepted ? 'pass' : 'fail',
                mainChat: report.mainChatAccepted ? 'pass' : (report.checks.some((check) => mainRequired.includes(check.id) && (check.status === 'warn' || check.status === 'fail')) ? 'fail' : 'unavailable'),
            };
            report.accepted = report.pluginAccepted;
            if (!options.suppressFinal) {
                this.lastReport = (0, util_1.clone)(report);
                this.progress({ state: report.accepted ? 'success' : 'error', detail: summarizeDiagnosticReport(report), report: this.currentReport() });
            }
            else {
                const roundSafe = roundSafetyPassed(report);
                this.progress({
                    state: roundSafe ? 'running' : 'error',
                    detail: roundSafe
                        ? `第 ${report.roundIndex}/${report.totalRounds} 轮结束：插件闭环${report.pluginAccepted ? '通过' : '未通过'}；已完整恢复，下一轮将从头开始`
                        : `第 ${report.roundIndex}/${report.totalRounds} 轮结束：安全恢复未通过，已停止后续轮次`,
                    roundIndex: report.roundIndex,
                    totalRounds: report.totalRounds,
                });
            }
        }
        return (0, util_1.clone)(report);
    }
    async reversibleWorldbookWrite(settings, snapshot, rawBefore, validate) {
        const original = (0, util_1.clone)(rawBefore.data);
        const originalDigest = digestWorldbook(original);
        const testData = (0, util_1.clone)(original);
        testData.entries ?? (testData.entries = {});
        const uid = findFreeDiagnosticUid(testData);
        const mapKey = String(uid);
        const marker = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        testData.entries[mapKey] = diagnosticEntry(uid, marker);
        let writeAttempted = false;
        let mutated = false;
        let restored = false;
        let restoreError = '';
        try {
            writeAttempted = true;
            await this.worldbook.replaceRaw(settings, rawBefore.name, testData, snapshot, validate, original);
            mutated = true;
            const readBack = await this.worldbook.readRaw(settings, snapshot, validate);
            const found = Object.values(readBack.data?.entries ?? {}).find((entry) => String(entry?.comment ?? '') === `诊断｜临时验收-${marker}`);
            if (!found || String(found.content ?? '') !== `Mirror Abyss acceptance ${marker}`) throw new Error('临时验收条目回读不一致');
            await this.worldbook.replaceRaw(settings, rawBefore.name, original, snapshot, validate, readBack.data);
            const restoredRead = await this.worldbook.readRaw(settings, snapshot, validate);
            if (digestWorldbook(restoredRead.data) !== originalDigest) throw new Error('删除临时条目后世界书未恢复到原快照');
            restored = true;
            return { worldbookName: rawBefore.name, temporaryUid: String(uid), writeVerified: true, rollbackVerified: true, originalDigest };
        }
        catch (error) {
            if (writeAttempted && !restored) {
                try {
                    const current = await this.worldbook.readRaw(settings, snapshot, validate);
                    await this.worldbook.replaceRaw(settings, rawBefore.name, original, snapshot, validate, current.data);
                    const emergencyRead = await this.worldbook.readRaw(settings, snapshot, validate);
                    restored = digestWorldbook(emergencyRead.data) === originalDigest;
                    if (!restored) restoreError = '紧急恢复后摘要不一致';
                }
                catch (restoreFailure) { restoreError = (0, util_1.errorText)(restoreFailure); }
            }
            const wrapped = new Error(`${(0, util_1.errorText)(error)}${restored ? '；原世界书已恢复' : `；原世界书恢复失败：${restoreError || '未知错误'}`}`);
            wrapped.diagnosticEvidence = { worldbookName: rawBefore.name, temporaryUid: String(uid), writeAttempted, mutated, restored, originalDigest };
            throw wrapped;
        }
    }
    exportLast() {
        if (!this.lastReport) throw new Error('尚未运行自动验收，没有可导出的诊断报告');
        const filename = buildDiagnosticFilename(this.lastReport);
        const content = JSON.stringify(this.lastReport, null, 2);
        if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
            return { filename, content };
        }
        const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
        return { filename, bytes: blob.size };
    }
    progress(value) {
        try { this.onProgress?.(value); }
        catch (error) { console.warn('[MirrorAbyss] diagnostic progress callback failed', error); }
    }
}
exports.DiagnosticsService = DiagnosticsService;

function configuredModelRoutes(settings) {
    const stages = [
        ['审核', settings.auditEnabled !== false ? settings.auditProfileId : null],
        ['修正', settings.auditEnabled !== false ? settings.revisionProfileId : null],
        ['提取', settings.extractionEnabled !== false ? settings.extractionProfileId : null],
        ['小总结', settings.autoSmallSummary !== false ? settings.smallSummaryProfileId : null],
        ['大总结', settings.autoLargeSummary !== false ? settings.largeSummaryProfileId : null],
        ['重建', settings.migrationProfileId],
    ].filter(([, value]) => value !== null);
    const grouped = new Map();
    for (const [label, idValue] of stages) {
        const id = String(idValue || '');
        const key = id || 'current';
        const current = grouped.get(key) ?? { id, labels: [] };
        current.labels.push(label);
        grouped.set(key, current);
    }
    if (!grouped.size) grouped.set('current', { id: '', labels: ['当前连接'] });
    return [...grouped.values()].map((route) => {
        const label = route.id ? `Profile ${route.id}（${route.labels.join('、')}）` : `当前连接（${route.labels.join('、')}）`;
        return { id: route.id, label, summary: { kind: route.id ? 'profile' : 'current', profileId: route.id, stages: route.labels } };
    });
}
function collectOfficialTransportEvidence(host, context, settings) {
    const signature = host.connectionStateSignature(settings) ?? {};
    const profiles = Array.isArray(signature.profiles) ? signature.profiles : [];
    const invalidProfileUrls = [];
    const routeFingerprints = [];
    for (const pair of profiles) {
        const id = String(pair?.[0] ?? '');
        const profile = pair?.[1] && typeof pair[1] === 'object' ? pair[1] : null;
        const api = String(profile?.api ?? '');
        const mode = String(profile?.mode ?? '');
        const url = String(profile?.['api-url'] ?? '').trim();
        if ((api === 'custom' || mode === 'cc') && /\/chat\/completions\/?(?:[?#].*)?$/iu.test(url)) invalidProfileUrls.push(id || '(未命名 Profile)');
        routeFingerprints.push({
            idHash: id ? (0, util_1.hashText)(id) : '',
            api,
            mode,
            model: String(profile?.model ?? ''),
            endpointHash: url ? (0, util_1.hashText)(url) : '',
            endpointHasV1: /\/v1\/?(?:[?#].*)?$/iu.test(url),
            endpointHasChatCompletions: /\/chat\/completions\/?(?:[?#].*)?$/iu.test(url),
        });
    }
    return {
        mainTransport: 'SillyTavern STscript /trigger',
        profileTransport: 'SillyTavern ChatCompletionService.processRequest（优先）/ ConnectionManagerRequestService.sendRequest（回退）',
        directEndpointFetch: false,
        mainUsesOfficialGenerate: typeof context.executeSlashCommandsWithOptions === 'function',
        profileUsesOfficialService: Boolean(context.ChatCompletionService?.processRequest || context.ConnectionManagerRequestService?.sendRequest),
        profileCount: profiles.length,
        invalidProfileUrls,
        routeFingerprints,
    };
}
function roundSafetyPassed(round) {
    const required = ['sandbox-restore', 'chat-nonmutation', 'generation-state-nonmutation'];
    const passed = new Set((round?.checks ?? []).filter((check) => check.status === 'pass').map((check) => check.id));
    return required.every((id) => passed.has(id));
}
function sanitizeSettings(settings) {
    return {
        enabled: settings.enabled !== false,
        auditEnabled: settings.auditEnabled !== false,
        extractionEnabled: settings.extractionEnabled !== false,
        autoAudit: settings.autoAudit === true,
        autoExtraction: settings.autoExtraction === true,
        entryBudgetEnabled: settings.entryBudgetEnabled !== false,
        responseTokens: Number(settings.responseTokens || 0),
        requestTimeoutMs: Number(settings.requestTimeoutMs || 0),
        routeIds: [...new Set([
            settings.auditProfileId,
            settings.revisionProfileId,
            settings.extractionProfileId,
            settings.smallSummaryProfileId,
            settings.largeSummaryProfileId,
            settings.migrationProfileId,
        ].map((value) => String(value || '')).filter(Boolean))],
    };
}
function collectEnvironment(context) {
    return {
        userAgent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : 'headless',
        language: typeof navigator !== 'undefined' ? String(navigator.language || '') : '',
        locationOrigin: typeof location !== 'undefined' ? String(location.origin || '') : '',
        sillyTavernVersion: String(context.version ?? context.sillyTavernVersion ?? context.appVersion ?? ''),
        hasConnectionManager: Boolean(context.ConnectionManagerRequestService),
        hasChatCompletionService: typeof context.ChatCompletionService?.processRequest === 'function',
        hasTextCompletionService: typeof context.TextCompletionService?.processRequest === 'function',
        hasGenerateRawData: typeof context.generateRawData === 'function',
        hasGenerateRaw: typeof context.generateRaw === 'function',
        hasWorldInfoApi: typeof context.loadWorldInfo === 'function' && typeof context.saveWorldInfo === 'function',
    };
}
function collectScope(host, context, settings) {
    const chatId = context.getCurrentChatId?.() ?? context.chatId ?? '';
    return {
        chatKeyHash: host.chatKey() ? (0, util_1.hashText)(host.chatKey()) : '',
        roleKeyHash: host.roleKey() ? (0, util_1.hashText)(host.roleKey()) : '',
        chatIdHash: chatId ? (0, util_1.hashText)(String(chatId)) : '',
        characterId: String(context.characterId ?? ''),
        groupId: String(context.groupId ?? ''),
        worldbookName: host.targetWorldbookName(settings),
        messageCount: Array.isArray(context.chat) ? context.chat.length : 0,
    };
}
function collectGenerationState(host, context, settings) {
    const summary = host.connectionStateSignature(settings);
    const chatSettings = context.chatCompletionSettings ?? {};
    return {
        connection: summary,
        mainApi: String(context.mainApi ?? ''),
        maxContext: Number(context.maxContext ?? 0),
        chatModel: String(summary.chatCompletionModel ?? ''),
        chatSource: String(summary.chatCompletionSource ?? ''),
        responseLength: finiteValue(chatSettings.openai_max_tokens ?? chatSettings.max_tokens),
    };
}
function chatDigest(chat) {
    const list = Array.isArray(chat) ? chat : [];
    return {
        count: list.length,
        digest: (0, util_1.hashText)(JSON.stringify(list.map((message) => ({
            user: message?.is_user === true,
            system: message?.is_system === true,
            mes: String(message?.mes ?? ''),
            swipeId: Number.isInteger(message?.swipe_id) ? Number(message.swipe_id) : null,
            swipe: Number.isInteger(message?.swipe_id) ? String(message?.swipes?.[message.swipe_id] ?? '') : '',
        })))),
    };
}
function diagnosticEntry(uid, marker) {
    return {
        uid,
        key: [],
        keysecondary: [],
        comment: `诊断｜临时验收-${marker}`,
        content: `Mirror Abyss acceptance ${marker}`,
        constant: false,
        vectorized: false,
        selective: false,
        selectiveLogic: 0,
        addMemo: false,
        order: 0,
        position: 0,
        disable: true,
        ignoreBudget: false,
        excludeRecursion: true,
        preventRecursion: true,
        probability: 100,
        useProbability: true,
        depth: 0,
        scanDepth: null,
        caseSensitive: null,
        matchWholeWords: null,
        useGroupScoring: null,
        triggers: [],
        extensions: { mirrorAbyssDiagnostic: { temporary: true, marker, createdAt: Date.now() } },
    };
}
function findFreeDiagnosticUid(data) {
    const occupied = new Set();
    for (const [key, entry] of Object.entries(data?.entries ?? {})) {
        if (/^\d+$/u.test(String(key))) occupied.add(Number(key));
        if (Number.isInteger(Number(entry?.uid)) && Number(entry.uid) >= 0) occupied.add(Number(entry.uid));
    }
    let uid = 0;
    while (occupied.has(uid)) uid += 1;
    return uid;
}
function digestWorldbook(data) { return (0, util_1.hashText)(JSON.stringify(data?.entries ?? {})); }
function countStatuses(checks) {
    const summary = { pass: 0, warn: 0, fail: 0, skip: 0, total: checks.length };
    for (const check of checks) {
        if (Object.prototype.hasOwnProperty.call(summary, check.status)) summary[check.status] += 1;
    }
    return summary;
}
function summarizeDiagnosticReport(report) {
    const value = report?.summary ?? countStatuses(report?.checks ?? []);
    const plugin = report?.pluginAccepted === true ? '插件闭环通过' : '插件闭环未通过';
    const main = report?.mainChatAccepted === true ? '主聊天链通过' : report?.acceptance?.mainChat === 'unavailable' ? '主聊天链不可用' : '主聊天链未通过';
    return `${report?.accepted ? '自动验收通过' : '自动验收未通过'}｜${plugin}｜${main}：通过${value.pass}，警告${value.warn}，失败${value.fail}，跳过${value.skip}`;
}
function buildDiagnosticFilename(report) {
    const stamp = String(report?.finishedAt || report?.startedAt || new Date().toISOString()).replace(/[:.]/gu, '-');
    return `Mirror-Abyss-${constants_1.VERSION}-diagnostic-${stamp}.json`;
}
function sanitizeEvidence(value) {
    if (value == null) return null;
    try {
        return JSON.parse(JSON.stringify(value, (key, item) => {
            if (/(?:secret|password|api[-_]?key|authorization|cookie)/iu.test(String(key || ''))) return '[redacted]';
            if (/(?:api[-_]?url|endpoint|reverse[-_]?proxy)/iu.test(String(key || '')) && typeof item === 'string')
                return item ? `[redacted:${(0, util_1.hashText)(item)}]` : '';
            if (typeof item === 'string' && item.length > 500) return `${item.slice(0, 240)}…[${item.length} chars]…${item.slice(-120)}`;
            if (typeof item === 'function') return `[Function ${item.name || 'anonymous'}]`;
            return item;
        }));
    }
    catch { return { value: String(value) }; }
}
function finiteValue(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
},"domain/entry-section":function(module,exports,require){

"use strict";
const { parseEntrySections, serializeEntrySections } = require("../parser");
const { canonicalSectionName, mergeCanonicalLines } = require("./information-point");
const { normalizeTitle, splitTitle, unique } = require("../util");

// [MA-SECTION-02] 读取旧世界书正文时按条目类型合并同义小标题。
// 例如人物【当前状态】与【当前】统一为【当前】；场景【当前】统一为【当前状态】。
function normalizeEntrySections(parsed, type = '') {
    const order = [];
    const values = {};
    for (const rawName of parsed.order ?? []) {
        const name = canonicalSectionName(rawName, type);
        if (!name) continue;
        if (!values[name]) {
            values[name] = [];
            order.push(name);
        }
        values[name] = mergeCanonicalLines(name, values[name], parsed.values?.[rawName] ?? []);
    }
    return { order, values };
}
function sectionLines(content, names, type = '') {
    const parsed = normalizeEntrySections(parseEntrySections(content), type);
    const normalized = new Set(names.map((name) => canonicalSectionName(name, type).replace(/\s+/g, '').toLocaleLowerCase()));
    return parsed.order.flatMap((name) => normalized.has(name.replace(/\s+/g, '').toLocaleLowerCase()) ? parsed.values[name] ?? [] : []);
}
function extractReferences(content, type = '') {
    const parsed = normalizeEntrySections(parseEntrySections(content), type);
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
exports.parseEntrySections = (content, type = '') => normalizeEntrySections(parseEntrySections(content), type);
exports.serializeEntrySections = serializeEntrySections;
exports.sectionLines = sectionLines;
exports.extractReferences = extractReferences;
},"domain/information-point":function(module,exports,require){

"use strict";
const { unique } = require("../util");

// [MA-SECTION-01] 小标题必须先按条目类型归一化。
// 同一个语义不能同时保留“当前”和“当前状态”，否则二次提取会把它们当成两个子条目。
const COMMON_SECTION_ALIASES = {
    '其他名称': '别名',
    '称号': '别名',
};
const TYPE_SECTION_ALIASES = {
    人物: {
        '身份定义': '身份',
        '持续经历': '固定事实',
        '近期经历': '固定事实',
        '变化记录': '固定事实',
        '当前状态': '当前',
        '现行事实': '当前',
        '状态': '当前',
        '性格': '性格核心',
        '人格': '性格核心',
        '说话方式': '表达方式',
        '语言风格': '表达方式',
        '阶段性倾向': '行为倾向',
        '行为模式': '行为倾向',
        '判断倾向': '决策倾向',
        '关系态度': '关系立场',
        '人物状态': '当前',
        '近期状态': '当前',
        '短期状态': '当前',
        '即时状态': '当前',
        '当前情况': '当前',
        '长期倾向': '行为倾向',
        '近期行为倾向': '行为倾向',
        '重复行为倾向': '行为倾向',
        '稳定性格': '性格核心',
        '人格核心': '性格核心',
        '核心性格': '性格核心',
        '表达风格': '表达方式',
        '说话风格': '表达方式',
        '语言习惯': '表达方式',
        '决策模式': '决策倾向',
        '判断模式': '决策倾向',
        '选择倾向': '决策倾向',
        '长期关系': '关系',
        '稳定关系': '关系',
        '关系变化': '关系',
        '长期关系立场': '关系立场',
        '稳定关系立场': '关系立场',

    },
    场景: {
        '地点属性': '定义',
        '持续变化': '固定事实',
        '稳定空间': '空间结构',
        '当前': '当前状态',
        '现行事实': '当前状态',
        '状态': '当前状态',
        '局部变化': '固定事实',
        '变化记录': '固定事实',
        '固定人员': '常驻角色',
        '常驻人员': '常驻角色',
        '固定设备': '固定设施',
        '场景设施': '固定设施',
    },
    物品: {
        '对象定义': '定义',
        '持续变化': '固定事实',
        '当前状态': '当前',
        '现行事实': '当前',
        '状态': '当前',
        '变化记录': '固定事实',
        '固定人员': '常驻角色',
        '常驻人员': '常驻角色',
        '固定设备': '固定设施',
        '场景设施': '固定设施',
    },
    事件: {
        '事件进程': '已发生进展',
        '关键进展': '已发生进展',
        '进展': '已发生进展',
        '已发生经过': '已发生进展',
        '未形成进展': '未发生进展',
        '无状态变化': '未发生进展',
        '过程材料': '未发生进展',
        '最终结果': '结果',
        '当前结果': '结果',
        '结束结论': '结果',
    },
    世界: {
        '对象范围': '范围',
        '影响范围': '范围',
        '区域': '地理',
        '势力': '组织',
        '组织格局': '组织',
        '交通': '资源与交通',
        '资源网络': '资源与交通',
        '当前': '公开局势',
        '当前状态': '公开局势',
        '现行事实': '公开局势',
        '状态': '公开局势',
        '全局状态': '公开局势',
        '世界变化': '固定事实',
        '变化记录': '固定事实',
        '固定人员': '常驻角色',
        '常驻人员': '常驻角色',
        '固定设备': '固定设施',
        '场景设施': '固定设施',
    },
    基础设定: {
        '世界规则': '自然规则',
        '基础规则': '自然规则',
        '规则': '自然规则',
        '种族': '种族与生命',
        '生命规则': '种族与生命',
        '魔法与技术': '能力与技术',
        '技术体系': '能力与技术',
        '社会制度': '社会规则',
        '地理': '地理框架',
    },
};

function canonicalSectionName(value, type = '') {
    const raw = String(value ?? '').trim();
    const compact = raw.replace(/\s+/gu, '');
    return TYPE_SECTION_ALIASES[String(type ?? '')]?.[compact]
        ?? COMMON_SECTION_ALIASES[compact]
        ?? raw;
}

function sectionSlot(line) {
    return String(line ?? '').match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1]?.replace(/\s+/gu, '') ?? '';
}

function mergeCanonicalLines(section, oldLines, incomingLines) {
    const replaceBySlot = /^(当前|当前状态|关系)$/u.test(String(section ?? ''));
    // 世界、基础设定和定义类栏目允许并列多条事实；它们不是单值状态槽。
    if (!replaceBySlot) return unique([...(oldLines ?? []), ...(incomingLines ?? [])]);
    const output = [...(oldLines ?? [])];
    const slots = new Map();
    output.forEach((line, index) => {
        const slot = sectionSlot(line);
        if (slot) slots.set(slot, index);
    });
    for (const line of incomingLines ?? []) {
        const slot = sectionSlot(line);
        if (slot && slots.has(slot)) output[slots.get(slot)] = line;
        else {
            if (slot) slots.set(slot, output.length);
            output.push(line);
        }
    }
    return unique(output);
}

function prepareInformationBlocks(parsedBlocks) {
    return parsedBlocks.map((block) => {
        const merged = new Map();
        for (const rawSection of block.sections ?? []) {
            const name = canonicalSectionName(rawSection.name, block.type);
            if (!name) continue;
            const current = merged.get(name) ?? { name, lines: [], empty: true };
            current.lines = mergeCanonicalLines(name, current.lines, rawSection.lines ?? []);
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
exports.mergeCanonicalLines = mergeCanonicalLines;
exports.prepareInformationBlocks = prepareInformationBlocks;
},"governance":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.governInformationBlocks = governInformationBlocks;
exports.sceneSettlementOperations = sceneSettlementOperations;
exports.currentEventState = currentEventState;
exports.canTransitionCurrentEvent = canTransitionCurrentEvent;
exports.deriveCurrentGameTime = deriveCurrentGameTime;
exports.activeContext = activeContext;
exports.isGenericBackgroundPerson = isGenericBackgroundPerson;
exports.isFixedSceneRole = isFixedSceneRole;
exports.buildDirectRelationIndex = buildDirectRelationIndex;
const semantic_1 = require("./semantic");
const util_1 = require("./util");

const EVENT_TRANSITIONS = Object.freeze({
    active: new Set(['active', 'blocked', 'completed', 'terminated']),
    blocked: new Set(['active', 'blocked', 'completed', 'terminated']),
    completed: new Set(['completed', 'archived']),
    terminated: new Set(['terminated', 'archived']),
    archived: new Set(['archived']),
});

const GENERIC_PERSON_PATTERN = /(?:路人|行人|群众|围观者|学生|同学|顾客|客人|乘客|司机|店员|服务员|工作人员|办事员|职员|管理员|门卫|保安|守卫|士兵|侍卫|仆人|侍者|医生|护士|药师|监考|裁判|主持人|接待员|售货员|收银员|快递员|邻居|居民|村民|市民|男人|女人|男子|女子|青年|老人|小孩|孩子|声音|账号)$/u;
const TEMPORARY_MARKER = /(?:临时|一次性|路过|偶遇|无名|不知名|陌生|普通|随机|现场一名|某个|一位|一名)/u;
const FIXED_SCENE_MARKER = /(?:常驻|固定|长期负责|日常负责|值班|驻守|驻场|本店|本楼|本校|该场景|负责此处|管理此处|看守此处)/u;
const INDEPENDENT_MARKER = /(?:独立目标|持续职责|关键证人|核心线索|长期关系|长期任务|持续影响|独立行动线|必须单独追踪)/u;

function governInformationBlocks(sourceBlocks, entries, contextText = '', options = {}) {
    const blocks = (sourceBlocks ?? []).map((block) => structuredClone(block));
    const diagnostics = { attached: [], filtered: [], promoted: [], warnings: [] };
    // ui.69: 历史总结输出已经由【历史分发】协议完成来源、目标、栏目与事实绑定。
    // 这里不能再次套用“本轮正文显式证据”治理，否则长期关系、历史状态等合法分发会被
    // extraction 专用过滤器删掉，随后操作计划为空并触发“结算证明不足”的假失败。
    if (options.sourceKind === 'summary') {
        return { blocks, diagnostics, currentSceneTitle: blocks.find((block) => block.type === '场景')?.title ?? '' };
    }
    const explicitSceneName = explicitCurrentSceneName(contextText);
    if (explicitSceneName && !blocks.some((block) => block.type === '场景')) {
        blocks.unshift({
            type: '场景', name: explicitSceneName, title: `场景｜${explicitSceneName}`,
            keywords: [explicitSceneName], sections: [],
        });
    }
    synthesizeDocumentItemUpdates(blocks, entries, contextText);
    enforceExplicitDialogueFacts(blocks, contextText);
    const currentScene = blocks.find((block) => block.type === '场景') ?? null;
    const output = [];
    for (const block of blocks) {
        if (!/^(?:人物|角色|NPC)$/u.test(String(block.type ?? ''))) {
            output.push(block);
            continue;
        }
        if (!isGenericBackgroundPerson(block)) {
            output.push(block);
            continue;
        }
        if (revealsExistingIdentity(block, entries, contextText)) {
            diagnostics.promoted.push(block.title);
            output.push(block);
            continue;
        }
        const body = blockText(block);
        const independent = INDEPENDENT_MARKER.test(body)
            || hasIndependentPersonMaterial(block)
            || hasStableProperName(block.name);
        if (independent) {
            diagnostics.promoted.push(block.title);
            output.push(block);
            continue;
        }
        if (currentScene && isFixedSceneRole(block, currentScene, contextText)) {
            attachFixedRole(currentScene, block);
            diagnostics.attached.push({ title: block.title, host: currentScene.title });
            continue;
        }
        diagnostics.filtered.push(block.title);
    }
    for (const block of output) if (block.type === '场景') normalizeSceneSnapshot(block, contextText, { gameTimeEnabled: options.gameTimeEnabled !== false });
    return { blocks: output, diagnostics, currentSceneTitle: currentScene?.title ?? '' };
}

function enforceExplicitDialogueFacts(blocks, contextText) {
    const context = String(contextText ?? '');
    const explicitScene = explicitCurrentSceneName(context);
    const hasUndecidedFuture = /(?:明天|明日|次日|未来)[^。；\n]{0,80}(?:提议|计划|调查|前往)[^。；\n]{0,80}(?:尚未.{0,12}(?:决定|定案)|未决定|未定案)|(?:提议|计划)[^。；\n]{0,80}(?:尚未.{0,12}(?:决定|定案)|未决定|未定案)/u.test(context);
    const hasExplicitRelationship = /(?:朋友|同伴|恋人|夫妻|兄弟|姐妹|亲属|盟友|敌人|仇敌|合作关系|隶属|上下级|信任关系|敌对关系|结盟|搭档)/u.test(context);
    const transfer = context.match(/([\p{Script=Han}A-Za-z0-9·]{2,16})把([^，。；;\n]{2,20}?)(?:转交|交给|递给)([\p{Script=Han}A-Za-z0-9·]{2,16})/u);
    if (transfer) {
        const [, from, itemName, to] = transfer.map(value => String(value ?? '').trim());
        let item = blocks.find(block => block.type === '物品' && (0, util_1.normalizeFact)(block.name) === (0, util_1.normalizeFact)(itemName));
        if (!item) {
            item = { type: '物品', name: itemName, title: `物品｜${itemName}`, keywords: [itemName], sections: [] };
            blocks.push(item);
        }
        // A transfer sentence is authoritative only for ownership.  Rebuild
        // the candidate from that evidence so the model cannot invent a
        // material, purpose, condition or duplicate wording around it.
        item.sections = [
            { name: '当前', lines: [`当前持有者：${to}`], empty: false },
            { name: '固定事实', lines: [`${itemName}已由${from}转交给${to}`], empty: false },
        ];
        for (const block of blocks) {
            if (block === item) continue;
            for (const section of block.sections ?? []) {
                section.lines = (section.lines ?? []).filter(line => {
                    const text = String(line ?? '');
                    if (text.includes(itemName)) return false;
                    return true;
                });
                section.empty = !(section.lines ?? []).length;
            }
        }
    }
    const relocation = context.match(/([^，。；;\n]{2,20}?)(?:已经|已)?从([^，。；;\n]{2,20}?)转移到(?:了)?([^，。；;\n]{2,20})/u);
    if (relocation) {
        const [, subject, from, to] = relocation.map(value => String(value ?? '').trim());
        let world = blocks.find(block => block.type === '世界' && (0, util_1.normalizeFact)(block.name) === (0, util_1.normalizeFact)(subject));
        if (!world) {
            world = { type: '世界', name: subject, title: `世界｜${subject}`, keywords: [subject], sections: [] };
            blocks.push(world);
        }
        // The relocation clause likewise defines exactly one current state
        // and one historical transition; unrelated model prose is discarded.
        world.sections = [
            { name: '公开局势', lines: [`${subject}当前位置：${to}`], empty: false },
            { name: '固定事实', lines: [`${subject}已从${from}转移到${to}`], empty: false },
        ];
        for (const block of blocks) {
            if (block === world) continue;
            for (const section of block.sections ?? []) {
                section.lines = (section.lines ?? []).filter(line => {
                    const text = String(line ?? '');
                    if (text.includes(subject) || text.includes(to)) return false;
                    return true;
                });
                section.empty = !(section.lines ?? []).length;
            }
        }
        if (!explicitScene && !new RegExp(`(?:抵达|进入|来到|位于|身处)${escapeRegExp(to)}`, 'u').test(context)) {
            for (let index = blocks.length - 1; index >= 0; index -= 1) {
                if (blocks[index].type === '场景' && (0, util_1.normalizeFact)(blocks[index].name) === (0, util_1.normalizeFact)(to)) blocks.splice(index, 1);
            }
        }
    }
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
        if (hasUndecidedFuture && /^(?:事件|世界)$/u.test(String(blocks[index].type ?? ''))
            && (/(?:行动安排|未来计划|调查计划|后续安排)/u.test(String(blocks[index].name ?? ''))
                || /(?:行动计划|明天|明日|调查北门|尚未.{0,12}(?:决定|定案)|未决定|未定案)/u.test(blockText(blocks[index])))) blocks.splice(index, 1);
        else if (blocks[index].type === '世界' && /^(?:局部局势|当前行动|行动局面|行动链)$/u.test(String(blocks[index].name ?? '').trim())
            && !context.includes(String(blocks[index].name ?? '').trim())) blocks.splice(index, 1);
    }
    for (const block of blocks) {
        for (const section of block.sections ?? []) {
            section.lines = (section.lines ?? []).filter(line => {
                const text = String(line ?? '');
                if (block.type === '人物' && /^(?:关系|关系立场)$/u.test(section.name) && !hasExplicitRelationship) return false;
                if (/^(?:未明|身份未明|未明身份|身份不明|身份未明者|未明身份者)(?:的)?(?:男性|女性|者)?[.。]?$/u.test(text)) return false;
                if ((0, util_1.normalizeFact)(text) === (0, util_1.normalizeFact)(block.name)) return false;
                if (/(?:明天|明日|次日|未来).*(?:提议|计划|调查|前往)|(?:提议|计划).*(?:尚未.{0,12}(?:决定|定案)|未决定|未定案)/u.test(text)) return false;
                if (/(?:尚未.{0,12}(?:决定|定案)|未决定|未定案|后续调查建议|行动计划)/u.test(text) && hasUndecidedFuture) return false;
                if (/(?:下雨|降雨|雨势|雨水)|(?:斗篷|衣物|衣服).*(?:湿透|打湿|淋湿)/u.test(text)
                    && !/(?:导致|阻断|危险|无法|受限|积水|洪水|损坏)/u.test(text)) return false;
                if (/(?:斗篷|衣物|衣服)/u.test(text) && /(?:斗篷|衣物|衣服).*(?:湿透|打湿|淋湿)/u.test(context)
                    && !/(?:导致|阻断|危险|无法|受限|损坏)/u.test(context)) return false;
                if (!explicitScene && block.type === '人物' && section.name === '当前' && /(?:位于|身处|同处)/u.test(text)) return false;
                if (transfer && block.type === '人物' && /^(?:当前|关系|关系立场|持有|固定事实)$/u.test(section.name)
                    && /(?:同行|同伴|钥匙|交付|转交|接收|收到|获得|持有|告知转移|继续商议|当前行动链|接受其说明|继续对话|合作关系)/u.test(text)) return false;
                if (block.type === '人物' && /^(?:身份|关系|关系立场)$/u.test(section.name)
                    && /(?:协作对象|同行者|同伴|对话对象|共同处于|共同使用|共同藏身处|进行协商|参与后续讨论|听取其信息|当前行动链|接受其说明|继续对话|合作关系)/u.test(text)) return false;
                return true;
            });
            section.empty = !(section.lines ?? []).length;
        }
    }
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
        const block = blocks[index];
        if (block.type === '事件' && !eventBlockHasLandedFact(block)) {
            blocks.splice(index, 1);
            continue;
        }
        const preservesExplicitScene = block.type === '场景'
            && explicitScene && (0, util_1.normalizeFact)(block.name) === (0, util_1.normalizeFact)(explicitScene);
        if (!preservesExplicitScene && (block.sections ?? []).every(section => !(section.lines ?? []).length)) blocks.splice(index, 1);
    }
}
function eventBlockHasLandedFact(block) {
    return (block?.sections ?? []).some((section) => /^(?:已发生进展|结果)$/u.test(String(section.name ?? ''))
        && (section.lines ?? []).some((line) => String(line ?? '').trim()));
}

function escapeRegExp(value) {
    return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function synthesizeDocumentItemUpdates(blocks, entries, contextText) {
    const context = String(contextText ?? '');
    if (!/(?:标注|记录|写入|刻入|登记)/u.test(context)) return;
    const quotes = [...context.matchAll(/[“"]([^”"\n]{2,160})[”"]/gu)];
    if (!quotes.length) return;
    for (const item of (entries ?? []).filter((entry) => entry.type === '物品' && entry.name && context.includes(String(entry.name)))) {
        const quote = [...quotes].reverse().find((match) => {
            const tail = context.slice(Number(match.index || 0) + match[0].length, Number(match.index || 0) + match[0].length + 96);
            return /(?:标注|记录|写入|刻入|登记)/u.test(tail) && tail.includes(String(item.name));
        });
        if (!quote) continue;
        let block = blocks.find((candidate) => candidate.type === '物品' && (0, util_1.normalizeFact)(candidate.name) === (0, util_1.normalizeFact)(item.name));
        if (!block) {
            block = { type: '物品', name: item.name, title: item.title, keywords: [item.name], sections: [] };
            blocks.push(block);
        }
        const section = ensureSection(block, '固定事实');
        section.lines = (0, util_1.unique)([...(section.lines ?? []), `已记录：${String(quote[1]).trim()}`]);
        section.empty = false;
    }
}

function explicitCurrentSceneName(contextText) {
    const match = String(contextText ?? '').match(/(?:当前场景|当前地点)[ \t]*(?:为|是|[：:])[ \t]*[“”"']?([^,，。；;\n“”"']+)/u);
    return String(match?.[1] ?? '').trim();
}

// Models occasionally put structured current-scene facts inside one natural
// sentence.  Normalize the two fields that drive the production projection so
// recall and the management panel observe the same state.
function normalizeSceneSnapshot(block, contextText = '', options = {}) {
    const current = (block.sections ?? []).filter((section) => /^(?:当前状态|定义)$/u.test(String(section.name ?? ''))).flatMap((section) => section.lines ?? []);
    const inferred = [];
    for (const line of current) {
        const match = String(line ?? '').match(/(?:当前)?在场(?:者|人物)?\s*(?:为|是|有|包括|包含|：|:)\s*([^，。；;]+)/u);
        if (!match) continue;
        inferred.push(...splitNames(match[1]));
    }
    const context = String(contextText ?? '');
    const currentSceneMatch = context.match(/(?:当前场景|当前地点)[ \t]*(?:为|是|[：:])[ \t]*[“”"']?([^,，。；;\n“”"']+)/u);
    const contextNamesMatch = context.match(/(?:当前)?在场(?:者|人物)?[ \t]*(?:只有|为|是|有|包括|包含|[：:])[ \t]*([^,，。；;\n]+)/u);
    const sceneMatches = currentSceneMatch
        && (0, util_1.normalizeFact)(currentSceneMatch[1]).includes((0, util_1.normalizeFact)(block.name));
    if (sceneMatches && contextNamesMatch) inferred.push(...splitNames(contextNamesMatch[1]));
    let present = (block.sections ?? []).find((section) => String(section.name ?? '') === '在场');
    if (present || inferred.length) {
        present ??= ensureSection(block, '在场');
        present.lines = (0, util_1.unique)([...(present.lines ?? []), ...inferred]);
        present.empty = !(present.lines ?? []).length;
    }
    const gameTimeEnabled = options.gameTimeEnabled !== false;
    if (!gameTimeEnabled) {
        for (const section of (block.sections ?? []).filter((item) => /^(?:当前状态|定义)$/u.test(String(item.name ?? '')))) {
            section.lines = (section.lines ?? []).filter((line) => !/(?:当前游戏时间|游戏时间|当前时间|时间|日期|时段)\s*(?:为|是|[：:])/u.test(String(line ?? '')));
            section.empty = !(section.lines ?? []).length;
        }
    }
    if (!sceneMatches) return;
    const snapshot = ensureSection(block, '当前状态');
    const facts = [
        `当前场景为${block.name}`,
        inferred.length ? `当前在场者为${(0, util_1.unique)(inferred).join('、')}` : '',
    ].filter(Boolean);
    if (facts.length) snapshot.lines = (0, util_1.unique)([...(snapshot.lines ?? []), ...facts]);
    snapshot.empty = !(snapshot.lines ?? []).length;
}

function revealsExistingIdentity(block, entries, contextText) {
    const provisional = String(block?.name ?? '').trim();
    const text = String(contextText ?? '');
    if (!provisional || !text.includes(provisional) || !/(?:就是|原来是|身份(?:为|是)|真实身份|摘下伪装|承认身份)/u.test(text)) return false;
    return (entries ?? []).some((entry) => /^(?:人物|角色|NPC)$/u.test(String(entry?.type ?? ''))
        && entry.name && text.includes(String(entry.name)) && !governanceNameIsGeneric(entry.name));
}
function governanceNameIsGeneric(value) {
    const name = String(value ?? '').replace(/(?:甲|乙|丙|丁|A|B|C|D|\d+)$/iu, '');
    return TEMPORARY_MARKER.test(name) || GENERIC_PERSON_PATTERN.test(name);
}

function hasIndependentPersonMaterial(block) {
    const sections = new Map((block.sections ?? []).map((section) => [String(section.name ?? ''), section.lines ?? []]));
    return ['关系', '已知', '误信', '性格核心', '表达方式', '决策倾向']
        .some((name) => (sections.get(name) ?? []).length > 0)
        || (sections.get('当前') ?? []).some((line) => /(?:当前目标|独立目标|持续任务|关键线索|掌握|追查|调查)/u.test(String(line ?? '')));
}

function hasStableProperName(name) {
    const text = String(name ?? '').trim();
    const roleName = text.replace(/(?:甲|乙|丙|丁|A|B|C|D|\d+)$/iu, '');
    if (!text || TEMPORARY_MARKER.test(text) || GENERIC_PERSON_PATTERN.test(roleName)) return false;
    if (/^身份未明/u.test(text)) return true;
    // 中文专名、账号或编号可独立追踪；纯岗位称呼不算专名。
    return text.length >= 2 && !/(?:老师|主任|经理|队长|老板|店长|管理员|工作人员)$/u.test(text);
}

function isGenericBackgroundPerson(block) {
    if (!block) return false;
    const name = String(block.name ?? '').trim();
    const roleName = name.replace(/(?:甲|乙|丙|丁|A|B|C|D|\d+)$/iu, '');
    const body = blockText(block);
    if (/^身份未明/u.test(name)) return false;
    if (TEMPORARY_MARKER.test(name) || TEMPORARY_MARKER.test(body)) return true;
    return GENERIC_PERSON_PATTERN.test(roleName);
}


function isFixedSceneRole(block, currentScene, _contextText = '') {
    if (!block || !currentScene) return false;
    const body = blockText(block);
    const sceneName = String(currentScene.name ?? '').trim();
    if (FIXED_SCENE_MARKER.test(body)) return true;
    if (sceneName && body.includes(sceneName) && /(?:负责|管理|值班|驻守|工作|看守|经营)/u.test(body)) return true;
    return false;
}

function attachFixedRole(sceneBlock, personBlock) {
    const section = ensureSection(sceneBlock, '常驻角色');
    const identity = firstUsefulLine(personBlock, ['身份', '稳定', '当前']) || '固定承担本场景岗位职责。';
    const line = `${personBlock.name}：${stripSlot(identity)}`;
    section.lines = (0, util_1.unique)([...(section.lines ?? []), line]);
    section.empty = false;
}

function firstUsefulLine(block, names) {
    for (const name of names) {
        const section = (block.sections ?? []).find((item) => String(item.name ?? '') === name);
        const line = (section?.lines ?? []).find((item) => String(item ?? '').trim());
        if (line) return String(line).trim();
    }
    return '';
}
function stripSlot(value) {
    return String(value ?? '').replace(/^\s*[^：:]{1,24}\s*[：:]\s*/u, '').trim();
}
function ensureSection(block, name) {
    let section = (block.sections ?? []).find((item) => String(item.name ?? '') === name);
    if (!section) {
        section = { name, lines: [], empty: true };
        block.sections ??= [];
        block.sections.push(section);
    }
    return section;
}
function blockText(block) {
    return [block?.name, ...(block?.sections ?? []).flatMap((section) => section.lines ?? [])].filter(Boolean).join('\n');
}

function currentEventState(value) {
    if (!value) return 'active';
    if ((0, semantic_1.isEventClosed)(value)) return 'completed';
    const text = eventText(value);
    if (/(?:终止|取消|放弃|失败结束|不再进行)/u.test(text)) return 'terminated';
    if (/(?:受阻|暂停|卡住|无法推进|等待条件)/u.test(text)) return 'blocked';
    return 'active';
}
function canTransitionCurrentEvent(from, to) {
    const source = String(from || 'active');
    const target = String(to || 'active');
    return EVENT_TRANSITIONS[source]?.has(target) === true;
}
function eventText(value) {
    if (Array.isArray(value?.sections)) return value.sections.flatMap((section) => section.lines ?? []).join('\n');
    return Object.values(value?.sections?.values ?? {}).flat().join('\n');
}

function sceneSettlementOperations(blocks, entries) {
    const currentSceneBlock = (blocks ?? []).find((block) => block.type === '场景');
    if (!currentSceneBlock) return [];
    const incomingTitle = (0, util_1.normalizeTitle)(currentSceneBlock.title);
    const previous = previousCurrentScene(entries, incomingTitle);
    if (!previous) return [];
    const operations = [];
    const previousState = previous.sections?.values?.['当前状态'] ?? [];
    const previousPresent = previous.sections?.values?.['在场'] ?? [];
    const historicalLines = (0, util_1.unique)([
        ...previousState.slice(-1).map((line) => `离场时状态：${stripSlot(line)}`),
        ...(previousState.length ? [] : previousPresent.length ? [`离场时在场：${previousPresent.flatMap(splitNames).join('、')}`] : []),
    ]).filter(Boolean);
    for (const line of historicalLines) {
        operations.push({
            id: `scene-settle-history|${previous.uid}|${(0, util_1.hashText)(line)}`,
            kind: 'append-line', operation: 'append', title: previous.title, targetUid: previous.uid,
            section: '固定事实', newValue: line,
            reason: `离开当前场景“${previous.name}”，保留一条过去时场景锚点`,
        });
    }
    for (const section of ['当前状态', '在场', '当前资源', '活动关联', '世界影响', '局部约束']) {
        const current = previous.sections?.values?.[section] ?? [];
        if (!current.length) continue;
        operations.push({
            id: `scene-settle|${previous.uid}|${section}`,
            kind: 'replace-section',
            operation: 'replace',
            title: previous.title,
            targetUid: previous.uid,
            section,
            oldValue: current.join('\n'),
            newValue: '',
            reason: `离开当前场景“${previous.name}”，结算并清除旧场景的活动快照`,
        });
    }
    return operations;
}
function previousCurrentScene(entries, incomingTitle) {
    const scenes = (entries ?? []).filter((entry) => entry?.managed && /^(?:场景|时空)$/u.test(String(entry.type ?? '')));
    const sorted = [...scenes].sort((left, right) => {
        const a = Number(left?.raw?.extensions?.mirrorAbyssInfoPoint?.sceneLastActiveAt || left.updatedAt || 0);
        const b = Number(right?.raw?.extensions?.mirrorAbyssInfoPoint?.sceneLastActiveAt || right.updatedAt || 0);
        return b - a;
    });
    const current = sorted.find((entry) => String(entry.semanticRole ?? '') === 'scene-current') ?? sorted[0];
    if (!current || (0, util_1.normalizeTitle)(current.title) === incomingTitle) return null;
    return current;
}

function deriveCurrentGameTime(blocks, previous = null, contextText = '') {
    const scene = (blocks ?? []).find((block) => block.type === '场景');
    if (!scene) return previous ? structuredClone(previous) : null;
    const lines = (scene.sections ?? [])
        .filter((section) => /^(?:当前状态|定义)$/u.test(String(section.name ?? '')))
        .flatMap((section) => section.lines ?? []);
    const match = lines.map((line) => String(line ?? '').match(/(?:^|[，。；;\s])(?:当前游戏时间|游戏时间|当前时间|时间|日期|时段)\s*(?:为|是|[：:])\s*([^，。；;]+)/u)).find(Boolean);
    const explicitLabel = String(match?.[1] ?? '').trim();
    if (explicitLabel) {
        return {
            label: explicitLabel,
            sceneTitle: scene.title,
            source: /^(?:未知|不明|未说明)$/u.test(explicitLabel) ? 'unknown' : 'model',
        };
    }
    return previous ? structuredClone(previous) : null;
}

function activeContext(entries, focusUid = '', preferredSceneTitle = '') {
    const list = (entries ?? []).filter(Boolean);
    const scenes = list.filter((entry) => /^(?:场景|时空)$/u.test(String(entry.type ?? '')));
    scenes.sort((left, right) => {
        const a = Number(left?.raw?.extensions?.mirrorAbyssInfoPoint?.sceneLastActiveAt || left.updatedAt || 0);
        const b = Number(right?.raw?.extensions?.mirrorAbyssInfoPoint?.sceneLastActiveAt || right.updatedAt || 0);
        return b - a;
    });
    const preferred = preferredSceneTitle
        ? scenes.find((entry) => (0, util_1.normalizeTitle)(entry.title) === (0, util_1.normalizeTitle)(preferredSceneTitle))
        : null;
    // 当前场景以本轮明确标题或真实 sceneLastActiveAt 排序为准；semanticRole 只是由本函数生成的投影，不能反向决定自身。
    const scene = preferred ?? scenes[0] ?? null;
    const names = new Set();
    for (const line of scene?.sections?.values?.['在场'] ?? []) for (const name of splitNames(line)) names.add(name);
    if (!names.size) {
        for (const line of scene?.sections?.values?.['当前状态'] ?? []) {
            const match = String(line ?? '').match(/(?:当前)?在场(?:者|人物)?\s*(?:为|是|有|包括|包含|：|:)\s*([^，。；;]+)/u);
            if (match) for (const name of splitNames(match[1])) names.add(name);
        }
    }
    const openEvents = list.filter((entry) => entry.type === '事件' && !['completed', 'terminated', 'archived'].includes(currentEventState(entry)));
    const activeEvents = selectCurrentEvents(openEvents, scene, names);
    for (const event of activeEvents) for (const line of event.sections?.values?.['参与'] ?? []) for (const name of splitNames(line)) names.add(name);
    const focus = list.find((entry) => String(entry.uid) === String(focusUid || '') || entry.focus === true);
    if (focus && /^(?:人物|角色|NPC)$/u.test(focus.type)) names.add(focus.name);
    const characters = list.filter((entry) => /^(?:人物|角色|NPC)$/u.test(String(entry.type ?? '')) && [...names].some((name) => sameName(entry, name)));
    return { scene, activeEvents, characters, activeNames: names, focus };
}
function selectCurrentEvents(events, scene, presentNames) {
    if (!(events ?? []).length) return [];
    const sceneName = (0, util_1.normalizeFact)(scene?.name ?? '');
    const sceneActivities = new Set((scene?.sections?.values?.['活动关联'] ?? []).map(util_1.normalizeFact));
    const present = new Set([...presentNames].map(util_1.normalizeFact));
    const ranked = events.map((entry) => {
        const text = (0, util_1.normalizeFact)(`${entry.name}
${eventText(entry)}`);
        let relationScore = 0;
        if (sceneName && text.includes(sceneName)) relationScore += 8;
        if ([...sceneActivities].some((name) => name && ((0, util_1.normalizeFact)(entry.name).includes(name) || name.includes((0, util_1.normalizeFact)(entry.name))))) relationScore += 10;
        for (const name of (entry.sections?.values?.['参与'] ?? []).flatMap(splitNames).map(util_1.normalizeFact)) if (present.has(name)) relationScore += 3;
        return { entry, relationScore, updatedAt: Number(entry.updatedAt || 0) };
    }).sort((left, right) => right.relationScore - left.relationScore || right.updatedAt - left.updatedAt || left.entry.title.localeCompare(right.entry.title, 'zh-CN'));
    if (ranked[0]?.relationScore > 0) return [ranked[0].entry];
    // 当前世界只有一个未结束事件时，它就是可接受的当前事件；多个无关联事件不猜测。
    return ranked.length === 1 ? [ranked[0].entry] : [];
}
function splitNames(value) {
    return String(value ?? '').replace(/^\s*[^：:]{1,24}\s*[：:]\s*/u, '').split(/[、,，/与和及]/u).map((item) => item.trim()).filter((item) => item && !/^(?:无|无人)$/u.test(item));
}
function sameName(entry, name) {
    const target = (0, util_1.normalizeFact)(name);
    return [entry.name, ...(entry.aliases ?? []), ...(entry.keywords ?? [])].some((value) => (0, util_1.normalizeFact)(value) === target);
}

// [MA-RELATION-01] 直接关联只从结构化栏目推导，并可随世界书重建；不建立独立图数据库。
function buildDirectRelationIndex(entries) {
    const list = (entries ?? []).filter(Boolean);
    const index = new Map(list.map((entry) => [String(entry.uid), new Set()]));
    const terms = list.map((entry) => ({
        entry,
        terms: (0, util_1.unique)([entry.name, ...(entry.aliases ?? [])])
            .map(util_1.normalizeFact)
            .filter((value) => value && value.length >= 2),
    }));
    for (const source of list) {
        const sourceUid = String(source.uid);
        const text = (0, util_1.normalizeFact)(relationText(source));
        if (!text) continue;
        for (const candidate of terms) {
            const targetUid = String(candidate.entry.uid);
            if (!sourceUid || sourceUid === targetUid) continue;
            if (!candidate.terms.some((term) => text.includes(term))) continue;
            index.get(sourceUid)?.add(targetUid);
            index.get(targetUid)?.add(sourceUid);
        }
    }
    return new Map([...index.entries()].map(([uid, related]) => [uid, new Set([...related].slice(0, 16))]));
}
function relationText(entry) {
    const sections = entry?.sections?.values ?? {};
    const selected = /^(?:人物|角色|NPC)$/u.test(String(entry?.type ?? ''))
        ? ['关系', '关系立场', '当前', '持有', '已知', '误信']
        : /^(?:场景|时空)$/u.test(String(entry?.type ?? ''))
            ? ['在场', '当前资源', '活动关联']
            : entry?.type === '事件'
                ? ['参与', '场景', '已发生进展', '结果']
                : entry?.type === '物品'
                    ? ['当前', '固定事实']
                    : [];
    return selected.flatMap((section) => sections[section] ?? []).join('\n');
}
},"host":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HostAdapter = void 0;
exports.extractModelText = extractModelText;
exports.extractReasoningText = extractReasoningText;
exports.describeModelResponse = describeModelResponse;
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
        const chatId = context.getCurrentChatId?.() ?? context.chatId;
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
        // [MA-WB-SCOPE-01] 当前聊天在 SillyTavern 中绑定的世界书是唯一写入目标。
        // 旧版 targetLorebook 是全局隐藏覆盖项，会把不同聊天分叉到另一本文字同名或旧名称世界书；运行时不再读取它。
        const assigned = String(context.chatMetadata?.world_info || '').trim();
        if (assigned || !settings.autoCreateLorebook) return assigned;
        const display = (0, util_1.safeId)(context.name2 || context.name1 || 'Chat') || 'Chat';
        const suffix = (0, util_1.hashText)(this.chatKey() || `${this.roleKey()}|${context.getCurrentChatId?.() ?? context.chatId ?? ''}`).slice(-6) || 'chat';
        return `MA_${display}_${suffix}`;
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
            auditEnabled: settings.auditEnabled,
            extractionEnabled: settings.extractionEnabled,
            auditPrompt: settings.auditPrompt,
            revisionPrompt: settings.revisionPrompt,
            extractionPrompt: settings.extractionPrompt,
            smallSummaryPrompt: settings.smallSummaryPrompt,
            largeSummaryPrompt: settings.largeSummaryPrompt,
            smallSummaryTurns: settings.smallSummaryTurns,
            smallSummaryMinTurns: settings.smallSummaryMinTurns,
            criticalChangesForSmall: settings.criticalChangesForSmall,
            largeSummaryCount: settings.largeSummaryCount,
            entryBudgetEnabled: settings.entryBudgetEnabled,
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
        const chatSettings = context.chatCompletionSettings ?? {};
        const textSettings = context.textCompletionSettings ?? {};
        return {
            mainApi: String(context.mainApi ?? ''),
            chatCompletionSource: String(chatSettings.chat_completion_source ?? chatSettings.source ?? ''),
            chatCompletionModel: readCurrentModel(context),
            textGenerationType: String(textSettings.type ?? textSettings.api_type ?? ''),
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
            capturedAt: Date.now(),
            taskId: randomId(),
            taskType,
            // [MA-QUEUE-03] 提取、总结和完整后台流程固定到源正文；后续新正文只会排队，不使该源正文任务失效。
            allowNewerTurns: ['extraction', 'smallSummary', 'largeSummary', 'full'].includes(String(taskType ?? '')),
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
            turnText: '',
            dialogueContext: '',
            dialogueHash: '',
            contentHash: '',
            runtimeSessionId: this.runtimeSessionId,
            chatInstance: context.chat,
            roleKey: this.roleKey(),
            scopeRevision: this.scopeRevision(chatKey),
            worldbookName: this.targetWorldbookName(settings),
            settingsSignature: this.settingsSignature(settings),
            capturedAt: Date.now(),
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
        if (context.chat !== snapshot.chatInstance && snapshot.allowNewerTurns !== true) throw new Error('聊天实例已经变化，旧任务作废');
        if (this.roleKey() !== snapshot.roleKey) throw new Error('当前角色或群组已经变化，旧任务作废');
        if (this.scopeRevision(snapshot.chatKey) !== snapshot.scopeRevision) throw new Error('聊天作用域版本已经变化，旧任务作废');
        let turn = snapshot;
        if (!snapshot.maintenance) {
            turn = snapshot.allowNewerTurns === true
                ? this.latestTurn(snapshot.messageIndex)
                : this.latestTurn();
            if (snapshot.allowNewerTurns !== true && turn.messageIndex !== snapshot.messageIndex)
                throw new Error('当前最新 AI 正文已经变化，旧任务作废');
            if (turn.messageKey !== snapshot.messageKey || turn.contentHash !== snapshot.contentHash) throw new Error('源正文版本已经变化，旧任务作废');
            if (turn.playerText !== snapshot.playerText)
                throw new Error('与源正文直接相关的玩家输入已经变化，旧任务作废');
            if (String(turn.dialogueHash ?? '') !== String(snapshot.dialogueHash ?? ''))
                throw new Error('源对话上下文已经变化，旧任务作废');
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
        const events = context.eventTypes ?? {};
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
        const playerInfo = previousPlayerMessage(chat, messageIndex);
        const playerText = playerInfo.text;
        const dialogueContext = dialogueContextBeforeTurn(chat, playerInfo.index, 4);
        const turnText = formatDialogueTurn(playerText, assistantText);
        return {
            chatKey,
            messageIndex,
            messageKey,
            assistantText,
            playerText,
            playerMessageIndex: playerInfo.index,
            turnText,
            dialogueContext,
            dialogueHash: (0, util_1.hashText)(`${dialogueContext}\n---TARGET---\n${turnText}`),
            characterCard: characterCardText(this.context()),
            contentHash: (0, util_1.hashText)(assistantText),
        };
    }
    isAssistantIndex(index) { return isAssistant((this.context().chat ?? [])[index]); }
    assistantIndexByMessageKey(messageKey) {
        const target = String(messageKey ?? '');
        if (!target) return -1;
        const chat = this.context().chat ?? [];
        for (let index = 0; index < chat.length; index += 1) {
            if (isAssistant(chat[index]) && readMessageKey(chat[index]) === target) return index;
        }
        return -1;
    }
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
    async generate(systemPrompt, prompt, responseLength, snapshot, currentSettings, timeoutMs, profileId = '', generationOptions = {}) {
        this.assertSnapshot(snapshot, currentSettings);
        const context = this.context();
        const route = describeModelRoute(context, profileId);
        if (route.error) throw new Error(route.error);
        let request;
        let activeProfile = null;
        let activeProfileUsedDirectService = false;
        try {
            if (profileId) {
                const service = context.ConnectionManagerRequestService;
                if (!service) throw new Error('Connection Profile 服务不可用');
                try { activeProfile = service.getProfile?.(profileId) ?? null; }
                catch (error) { throw new Error(`无法读取 Connection Profile：${(0, util_1.errorText)(error)}`); }
                if (!activeProfile) throw new Error(`所选 Connection Profile 已不存在：${profileId}`);

                const requestController = typeof AbortController === 'function' ? new AbortController() : null;
                const messages = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt },
                ];
                const includePreset = generationOptions?.includePreset !== false;
                const includeInstruct = generationOptions?.includeInstruct !== false;
                let apiMap = null;
                try {
                    apiMap = typeof service.validateProfile === 'function'
                        ? service.validateProfile(activeProfile)
                        : context.CONNECT_API_MAP?.[activeProfile.api] ?? null;
                }
                catch (error) {
                    throw new Error(`Connection Profile 路由无效：${(0, util_1.errorText)(error)}`);
                }

                // [MA-HOST-MODEL-04]
                // SillyTavern 1.18 的官方 ConnectionManagerRequestService 本应把 Profile 的
                // secret-id、模型和自定义 URL 传给 ChatCompletionService。部分云端构建只保留
                // 了包装层入口，却在包装过程中丢失 secret-id，最终表现为 Profile 请求 401，
                // 而手动切换主连接后可以成功。这里优先复用同一个官方 ChatCompletionService，
                // 显式传递 Profile 字段；不读取原始 API Key，不直接 fetch 供应商端点。
                const canUseDirectChatService = apiMap?.selected === 'openai'
                    && Boolean(apiMap?.source)
                    && !activeProfile.proxy
                    && typeof context.ChatCompletionService?.processRequest === 'function';
                if (canUseDirectChatService) {
                    activeProfileUsedDirectService = true;
                    request = context.ChatCompletionService.processRequest({
                        stream: false,
                        messages,
                        max_tokens: responseLength,
                        model: activeProfile.model,
                        chat_completion_source: apiMap.source,
                        secret_id: activeProfile['secret-id'],
                        custom_url: activeProfile['api-url'],
                        vertexai_region: activeProfile['api-url'],
                        zai_endpoint: activeProfile['api-url'],
                        siliconflow_endpoint: activeProfile['api-url'],
                        minimax_endpoint: activeProfile['api-url'],
                        custom_prompt_post_processing: activeProfile['prompt-post-processing'],
                    }, {
                        presetName: includePreset ? activeProfile.preset : undefined,
                    }, true, requestController?.signal ?? null);
                }
                else {
                    if (typeof service.sendRequest !== 'function') {
                        throw new Error('Connection Profile 官方请求接口不可用');
                    }
                    request = service.sendRequest(profileId, messages, responseLength, {
                        stream: false,
                        signal: requestController?.signal ?? null,
                        extractData: true,
                        includePreset,
                        includeInstruct,
                    }, {});
                }
                generationOptions = { ...generationOptions, requestController };
            }
            else {
                // [MA-HOST-MODEL-01] 当前连接优先使用 SillyTavern 官方“原始响应 + 官方解析器”组合。
                // generateRawData 能保留不同 API 的真实返回结构，extractMessageFromData 负责按宿主当前 API 解析，
                // 避免插件自行猜测 OpenAI / Claude / Gemini / Text Completion 等响应格式。
                const generateRawData = context.generateRawData;
                const extractMessageFromData = context.extractMessageFromData;
                if (typeof generateRawData === 'function' && typeof extractMessageFromData === 'function') {
                    // [MA-HOST-MODEL-03] 当前连接绝不传 responseLength。
                    // SillyTavern 官方 generateRawData 会通过 TempResponseLength 临时改写全局响应长度；
                    // 后台审核与下一轮主正文并发时可能产生竞态，导致主正文继承审核/提取的短上限。
                    // 当前连接因此沿用用户的全局响应长度；需要独立阶段预算时必须选择 Connection Profile。
                    request = generateRawData({ systemPrompt, prompt });
                }
                else {
                    const generateRaw = context.generateRaw;
                    if (typeof generateRaw !== 'function') throw new Error('当前 SillyTavern 未提供 generateRawData 或 generateRaw');
                    request = generateRaw({ systemPrompt, prompt });
                }
            }
        }
        catch (error) {
            throw new Error(`模型请求启动失败：${(0, util_1.errorText)(error)}`);
        }
        let raw;
        try {
            raw = await waitForModelRequest(request, {
                timeoutMs,
                token: snapshot.token,
                controller: generationOptions?.requestController ?? null,
            });
        }
        catch (error) {
            if (snapshot.token?.cancelled) throw new Error(snapshot.token.reason || '任务已取消');
            const detail = (0, util_1.errorText)(error);
            if (profileId && isAuthorizationFailure(detail)) {
                const profileName = String(activeProfile?.name || profileId);
                const hasSecretId = Boolean(String(activeProfile?.['secret-id'] ?? '').trim());
                const binding = hasSecretId
                    ? `连接配置“${profileName}”绑定的 Secret ID 已随请求发送，但上游仍拒绝授权。请在 SillyTavern 密钥管理器中确认该 Secret ID 对应的密钥仍有效，并重新保存此 Connection Profile。`
                    : `连接配置“${profileName}”没有绑定 Secret ID。请先在 SillyTavern 中选择或保存 API Key，再更新此 Connection Profile，使其记录 Secret ID。`;
                const transport = activeProfileUsedDirectService
                    ? '请求已走 SillyTavern 官方 ChatCompletionService 直达路径。'
                    : '当前环境回退到 ConnectionManagerRequestService 包装路径。';
                const authError = new Error(`模型请求失败：未授权。${binding}${transport}`);
                authError.code = 'MA_PROFILE_AUTH_FAILED';
                authError.cause = error;
                authError.diagnosticEvidence = {
                    profileIdHash: (0, util_1.hashText)(String(profileId)),
                    hasSecretId,
                    directOfficialService: activeProfileUsedDirectService,
                    route: route.label,
                };
                throw authError;
            }
            throw new Error(`模型请求失败：${detail}`);
        }
        this.assertSnapshot(snapshot, currentSettings);
        const text = extractModelText(raw, context).trim();
        if (!text) {
            const reasoning = extractReasoningText(raw).trim();
            const responseShape = describeModelResponse(raw);
            console.warn('[MirrorAbyss] model response contained no final text', {
                route: route.label,
                responseShape,
                reasoningLength: reasoning.length,
            });
            if (reasoning) {
                const error = new Error(`模型只返回了推理内容，没有最终文本（推理 ${reasoning.length} 字）。${route.label}；返回结构：${responseShape}`);
                error.code = 'MA_REASONING_ONLY';
                error.diagnosticEvidence = { route: route.label, responseShape, reasoningLength: reasoning.length };
                try {
                    Object.defineProperty(error, 'reasoningText', { value: reasoning, enumerable: false, configurable: false });
                }
                catch { error.reasoningText = reasoning; }
                throw error;
            }
            if (route.noModelLikely) {
                throw new Error(`模型连接未识别到可用模型。${route.label}；请在 API Connections 中选择模型并确认连接成功`);
            }
            const error = new Error(`模型请求已完成，但 SillyTavern 未解析出最终文本。${route.label}；返回结构：${responseShape}`);
            error.code = 'MA_EMPTY_MODEL_RESPONSE';
            throw error;
        }
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
    /** [MA-HOST-MODEL-02] 返回 UI 可见的实际请求路由，不包含密钥。 */
    profileSummary(profileId = '') {
        return describeModelRoute(this.context(), profileId);
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
        const expectedChatKey = snapshot.chatKey || this.chatKey();
        const expectedChatInstance = context.chat;
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
            if (this.chatKey() !== expectedChatKey || this.context().chat !== expectedChatInstance)
                throw new Error('正文保存期间聊天作用域已经变化');
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
            try {
                if (this.chatKey() !== expectedChatKey || this.context().chat !== expectedChatInstance)
                    throw new Error('聊天作用域已经变化；已恢复原聊天内存，未向新聊天执行反向保存');
                await this.saveChat();
                throw new Error(`修正版正文保存失败，已恢复并重新保存原正文：${(0, util_1.errorText)(error)}`);
            }
            catch (rollbackError) {
                if (/已恢复并重新保存原正文/u.test(String(rollbackError?.message || ''))) throw rollbackError;
                throw new Error(`修正版正文保存失败，且原正文反向保存失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackError)}`);
            }
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
            smallSummaryRetryCooldown: Math.max(0, Number(value.smallSummaryRetryCooldown) || 0),
            largeSummaryRetryCooldown: Math.max(0, Number(value.largeSummaryRetryCooldown) || 0),
            pendingSmallSummaryUids: [...new Set((Array.isArray(value.pendingSmallSummaryUids) ? value.pendingSmallSummaryUids : []).map((item) => String(item ?? '').trim()).filter(Boolean))],
            pendingLargeSummaryUids: [...new Set((Array.isArray(value.pendingLargeSummaryUids) ? value.pendingLargeSummaryUids : []).map((item) => String(item ?? '').trim()).filter(Boolean))],
        };
    }
    async saveCursor(cursor, snapshot, currentSettings) {
        if (snapshot) this.assertSnapshot(snapshot, currentSettings);
        const root = this.chatNamespace();
        const hadCursor = Object.prototype.hasOwnProperty.call(root, 'cursor');
        const previous = hadCursor ? structuredClone(root.cursor) : undefined;
        root.cursor = structuredClone(cursor);
        await this.persistMetadataMutation(() => {
            if (hadCursor) root.cursor = previous;
            else delete root.cursor;
        }, () => { if (snapshot) this.assertSnapshot(snapshot, currentSettings); }, '处理游标保存');
    }
    getCurrentGameTime() {
        const value = this.chatNamespace().currentGameTime;
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const label = String(value.label ?? '').trim();
        if (!label) return null;
        return { label, sceneTitle: String(value.sceneTitle ?? ''), source: String(value.source ?? 'explicit') };
    }
    async setCurrentGameTime(value, snapshot, currentSettings) {
        const next = value && typeof value === 'object' && String(value.label ?? '').trim()
            ? { label: String(value.label).trim(), sceneTitle: String(value.sceneTitle ?? ''), source: String(value.source ?? 'explicit') }
            : null;
        const previous = this.getCurrentGameTime();
        if (JSON.stringify(previous) === JSON.stringify(next)) return false;
        if (snapshot) this.assertSnapshot(snapshot, currentSettings);
        const root = this.chatNamespace();
        if (next) root.currentGameTime = structuredClone(next);
        else delete root.currentGameTime;
        await this.persistMetadataMutation(() => {
            if (previous) root.currentGameTime = previous;
            else delete root.currentGameTime;
        }, () => { if (snapshot) this.assertSnapshot(snapshot, currentSettings); }, '游戏时间保存');
        return true;
    }
    getCommitReceipts() {
        const receipts = this.chatNamespace().commitReceipts;
        return Array.isArray(receipts) ? structuredClone(receipts) : [];
    }
    getMaintenanceTransaction() {
        const value = this.chatNamespace().maintenanceTransaction;
        return value && typeof value === 'object' && !Array.isArray(value) ? structuredClone(value) : null;
    }
    async setMaintenanceTransaction(value, snapshot, currentSettings) {
        if (!value || typeof value !== 'object' || !String(value.id || '').trim()) throw new Error('维护事务标记无效');
        if (snapshot) this.assertSnapshot(snapshot, currentSettings);
        const root = this.chatNamespace();
        const hadValue = Object.prototype.hasOwnProperty.call(root, 'maintenanceTransaction');
        const previous = hadValue ? structuredClone(root.maintenanceTransaction) : undefined;
        root.maintenanceTransaction = structuredClone(value);
        await this.persistMetadataMutation(() => {
            if (hadValue) root.maintenanceTransaction = previous;
            else delete root.maintenanceTransaction;
        }, () => { if (snapshot) this.assertSnapshot(snapshot, currentSettings); }, '维护事务标记保存');
        return true;
    }
    async clearMaintenanceTransaction(id = '', snapshot, currentSettings) {
        if (snapshot) this.assertSnapshot(snapshot, currentSettings);
        const root = this.chatNamespace();
        const current = root.maintenanceTransaction;
        if (!current || typeof current !== 'object') return false;
        if (id && String(current.id || '') !== String(id)) throw new Error('维护事务标记已经变化，拒绝清理');
        const previous = structuredClone(current);
        delete root.maintenanceTransaction;
        await this.persistMetadataMutation(() => { root.maintenanceTransaction = previous; }, () => { if (snapshot) this.assertSnapshot(snapshot, currentSettings); }, '维护事务标记清理');
        return true;
    }
    async appendCommitReceipt(receipt, limit = 0) {
        if (!receipt || typeof receipt !== 'object' || !Array.isArray(receipt.changes) || !receipt.changes.length) return false;
        const root = this.chatNamespace();
        const previous = Array.isArray(root.commitReceipts) ? structuredClone(root.commitReceipts) : [];
        const merged = [...previous.filter((item) => item?.id !== receipt.id), structuredClone(receipt)];
        const numericLimit = Math.max(0, Number(limit) || 0);
        const next = numericLimit > 0 ? merged.slice(-numericLimit) : merged;
        root.commitReceipts = next;
        await this.persistMetadataMutation(() => {
            if (previous.length) root.commitReceipts = previous;
            else delete root.commitReceipts;
        }, null, '写入回执保存');
        return true;
    }
    async removeCommitReceipts(ids = []) {
        const targets = new Set((Array.isArray(ids) ? ids : [ids]).map((value) => String(value ?? '')).filter(Boolean));
        if (!targets.size) return false;
        const root = this.chatNamespace();
        const previous = Array.isArray(root.commitReceipts) ? structuredClone(root.commitReceipts) : [];
        const next = previous.filter((item) => !targets.has(String(item?.id ?? '')));
        if (next.length === previous.length) return false;
        if (next.length) root.commitReceipts = next;
        else delete root.commitReceipts;
        await this.persistMetadataMutation(() => {
            if (previous.length) root.commitReceipts = previous;
            else delete root.commitReceipts;
        }, null, '写入回执删除');
        return true;
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
        await this.persistMetadataMutation(() => {
            if (hadUid) root.focusUid = previousUid;
            else delete root.focusUid;
            if (hadTitle) root.focusTitle = previousTitle;
            else delete root.focusTitle;
        }, null, '焦点 UID 保存');
    }
    async saveMetadata() {
        const context = this.context();
        if (typeof context.saveMetadata !== 'function') throw new Error('SillyTavern 未提供聊天元数据保存接口 saveMetadata');
        await context.saveMetadata();
    }
    async persistMetadataMutation(rollback, verify, label) {
        const expectedChatKey = this.chatKey();
        const expectedMetadata = this.context().chatMetadata;
        try {
            await this.saveMetadata();
            if (this.chatKey() !== expectedChatKey || this.context().chatMetadata !== expectedMetadata)
                throw new Error('元数据保存期间聊天作用域已经变化');
            verify?.();
        }
        catch (error) {
            try { rollback?.(); }
            catch (rollbackMutationError) {
                throw new Error(`${label}失败，且内存回滚失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackMutationError)}`);
            }
            try {
                if (this.chatKey() !== expectedChatKey || this.context().chatMetadata !== expectedMetadata)
                    throw new Error('聊天作用域已经变化；已恢复原聊天内存，未向新聊天执行反向保存');
                await this.saveMetadata();
            }
            catch (rollbackSaveError) {
                throw new Error(`${label}失败，且旧元数据反向保存失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackSaveError)}`);
            }
            throw new Error(`${label}失败，已恢复并重新保存旧元数据：${(0, util_1.errorText)(error)}`);
        }
    }
    async saveChat() {
        const context = this.context();
        if (typeof context.saveChat !== 'function') throw new Error('SillyTavern 未提供聊天保存接口 saveChat');
        return context.saveChat();
    }

    /**
     * [MA-DIAG-E2E-01] 捕获当前聊天与元数据快照。
     * 端到端验收只在当前聊天末尾追加临时消息，结束后按此快照原位恢复。
     */
    captureDiagnosticTransaction() {
        const context = this.context();
        const metadata = context.chatMetadata ?? {};
        return {
            chatKey: this.chatKey(),
            roleKey: this.roleKey(),
            chat: (0, util_1.clone)(Array.isArray(context.chat) ? context.chat : []),
            metadata: (0, util_1.clone)(metadata),
            messageCount: Array.isArray(context.chat) ? context.chat.length : 0,
            chatDigest: chatFingerprint(Array.isArray(context.chat) ? context.chat : []),
            metadataDigest: (0, util_1.hashText)(JSON.stringify(metadata ?? {})),
        };
    }
    async sendDiagnosticUserMessage(text) {
        const context = this.context();
        const chat = context.chat ?? [];
        const before = chat.length;
        const execute = context.executeSlashCommandsWithOptions;
        if (typeof execute !== 'function') throw new Error('SillyTavern 未提供 STscript 执行接口，无法自动发送测试消息');
        const body = String(text ?? '').replace(/[|\r\n]+/gu, ' ').trim();
        if (!body) throw new Error('自动验收测试消息为空');
        await execute(`/send ${body}`, { handleParserErrors: true, source: 'mirror-abyss-diagnostic' });
        const message = chat[chat.length - 1];
        if (chat.length !== before + 1 || message?.is_user !== true || String(message?.mes ?? '').trim() !== body)
            throw new Error('SillyTavern /send 未按预期追加玩家消息');
        await this.saveChat();
        return { index: chat.length - 1, chars: body.length, hash: (0, util_1.hashText)(body) };
    }
    async generateDiagnosticAssistant(timeoutMs = 120000) {
        const context = this.context();
        const chat = context.chat ?? [];
        const before = chat.length;
        const execute = context.executeSlashCommandsWithOptions;
        if (typeof execute !== 'function') throw new Error('SillyTavern 未提供 STscript /trigger 接口');
        let interval = null;
        const cleanups = [];
        let found = null;
        const inspect = () => {
            for (let index = chat.length - 1; index >= before; index -= 1) {
                if (!isAssistant(chat[index])) continue;
                const text = String(chat[index].mes ?? '');
                found = {
                    index,
                    chars: text.length,
                    hash: (0, util_1.hashText)(text),
                    completeEnding: /[。！？!?…」』）)】]$/u.test(text.trim()),
                };
                return found;
            }
            return null;
        };
        let resolveAssistant;
        let stableHash = '';
        let stableTicks = 0;
        const assistantReady = new Promise((resolve) => { resolveAssistant = resolve; });
        const wake = () => {
            const result = inspect();
            // STscript /trigger may resolve as soon as streaming starts.  A newly
            // inserted "..." message is only a placeholder, not the final reply.
            // Require a plausible complete ending and one second of stable text.
            if (!result || result.chars < 8 || !result.completeEnding) {
                stableHash = '';
                stableTicks = 0;
                return;
            }
            if (result.hash === stableHash) stableTicks += 1;
            else {
                stableHash = result.hash;
                stableTicks = 1;
            }
            if (stableTicks >= 20) resolveAssistant(result);
        };
        try {
            for (const eventName of ['MESSAGE_RECEIVED', 'GENERATION_ENDED']) {
                try { cleanups.push(this.subscribe(eventName, wake, false)); }
                catch { }
            }
            interval = globalThis.setInterval(wake, 50);
            interval?.unref?.();
            wake();
            const trigger = Promise.resolve(execute('/trigger', { handleParserErrors: true, source: 'mirror-abyss-diagnostic' }));
            await withTimeout(Promise.all([trigger, assistantReady]), timeoutMs, () => {
                try { context.stopGeneration?.(); } catch { }
            });
            // Always re-read after both /trigger and the stable-final detector settle.
            const result = inspect();
            if (!result) throw new Error('主正文生成完成后没有形成新的 AI 消息');
            return result;
        }
        catch (error) {
            if (/模型调用超时/u.test(String(error?.message || ''))) {
                throw new Error(`主正文生成在 ${timeoutMs}ms 内没有形成新的 AI 消息`);
            }
            throw error;
        }
        finally {
            if (interval) globalThis.clearInterval(interval);
            for (const cleanup of cleanups.splice(0)) {
                try { cleanup?.(); } catch { }
            }
        }
    }
    async appendDiagnosticAssistantTurn(playerText, assistantText) {
        const player = await this.sendDiagnosticUserMessage(playerText);
        const context = this.context();
        const chat = context.chat ?? [];
        const message = {
            name: String(context.name2 ?? 'AI'),
            is_user: false,
            is_system: false,
            send_date: new Date().toISOString(),
            mes: String(assistantText ?? ''),
            extra: { mirrorAbyssDiagnostic: { synthetic: true, createdAt: Date.now() } },
        };
        chat.push(message);
        try { context.addOneMessage?.(message, { scroll: false }); } catch { }
        await this.saveChat();
        return { playerIndex: player.index, assistantIndex: chat.length - 1, assistantHash: (0, util_1.hashText)(message.mes) };
    }
    async restoreDiagnosticTransaction(transaction) {
        if (!transaction || transaction.chatKey !== this.chatKey() || (transaction.roleKey && transaction.roleKey !== this.roleKey()))
            throw new Error('验收恢复时聊天作用域已经变化');
        // SillyTavern is allowed to replace getContext(), chat and chatMetadata object
        // identities after saveChat/saveMetadata.  Production safety is therefore based
        // on the stable chat/role keys, not JavaScript reference identity.
        const assertOriginalScope = () => {
            if (transaction.chatKey !== this.chatKey() || (transaction.roleKey && transaction.roleKey !== this.roleKey()))
                throw new Error('验收恢复期间聊天作用域已经变化');
        };
        const applySnapshotToCurrentContext = () => {
            assertOriginalScope();
            const current = this.context();
            const chat = current.chat;
            const metadata = current.chatMetadata;
            if (!Array.isArray(chat)) throw new Error('SillyTavern 聊天正文不可写');
            if (!metadata || typeof metadata !== 'object') throw new Error('SillyTavern 聊天元数据不可写');
            chat.splice(0, chat.length, ...(0, util_1.clone)(transaction.chat ?? []));
            for (const key of Object.keys(metadata)) delete metadata[key];
            Object.assign(metadata, (0, util_1.clone)(transaction.metadata ?? {}));
            return { chat, metadata };
        };
        applySnapshotToCurrentContext();
        const persistRestored = async (action, label) => {
            let lastError = null;
            for (let attempt = 1; attempt <= 2; attempt += 1) {
                try {
                    applySnapshotToCurrentContext();
                    await action();
                    assertOriginalScope();
                    return attempt;
                }
                catch (error) {
                    lastError = error;
                    if (attempt < 2) await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
                }
            }
            throw new Error(`${label}连续2次失败：${(0, util_1.errorText)(lastError)}`);
        };
        const chatSaveAttempts = await persistRestored(() => this.saveChat(), '验收聊天快照保存');
        const metadataSaveAttempts = await persistRestored(() => this.saveMetadata(), '验收元数据快照保存');
        const finalState = applySnapshotToCurrentContext();
        if (typeof document !== 'undefined') {
            const originalCount = Number(transaction.messageCount || 0);
            const nodes = [...document.querySelectorAll('#chat .mes, .mes[mesid]')];
            for (const node of nodes) {
                const id = Number(node.getAttribute?.('mesid'));
                if (Number.isInteger(id) && id >= originalCount) node.remove();
            }
        }
        const restoredChatDigest = chatFingerprint(finalState.chat);
        const restoredMetadataDigest = (0, util_1.hashText)(JSON.stringify(finalState.metadata ?? {}));
        if (restoredChatDigest !== transaction.chatDigest) throw new Error('验收结束后聊天正文未恢复到原快照');
        if (restoredMetadataDigest !== transaction.metadataDigest) throw new Error('验收结束后聊天元数据未恢复到原快照');
        return { messageCount: finalState.chat.length, chatDigest: restoredChatDigest, metadataDigest: restoredMetadataDigest, chatSaveAttempts, metadataSaveAttempts };
    }
    async resetCurrentChatState() {
        const context = this.context();
        const metadata = (context.chatMetadata ?? (context.chatMetadata = {}));
        const hadState = Object.prototype.hasOwnProperty.call(metadata, constants_1.EXTENSION_NAMESPACE);
        const previous = hadState ? (0, util_1.clone)(metadata[constants_1.EXTENSION_NAMESPACE]) : undefined;
        delete metadata[constants_1.EXTENSION_NAMESPACE];
        await this.persistMetadataMutation(() => {
            if (hadState) metadata[constants_1.EXTENSION_NAMESPACE] = previous;
        }, null, '当前聊天插件状态重置');
        return hadState;
    }
    diagnostics() {
        let context = null;
        try { context = this.context(); }
        catch (error) { return { version: 1, error: (0, util_1.errorText)(error) }; }
        const events = context.eventTypes ?? {};
        return {
            chatKey: this.chatKey(),
            generateRaw: typeof context.generateRaw === 'function',
            generateRawData: typeof context.generateRawData === 'function',
            extractMessageFromData: typeof context.extractMessageFromData === 'function',
            connectionProfiles: Boolean(context.ConnectionManagerRequestService),
            mainApi: String(context.mainApi ?? ''),
            currentModel: readCurrentModel(context),
            saveChat: typeof context.saveChat === 'function',
            saveMetadata: typeof context.saveMetadata === 'function' || typeof context.saveMetadataDebounced === 'function',
            events: Object.keys(events).filter((key) => /CHAT|MESSAGE|APP_READY/u.test(key)).sort(),
            assignedWorldbook: String(context.chatMetadata?.world_info ?? ''),
        };
    }
    ensureMessageKey(index, message) {
        const existing = readMessageKey(message);
        if (existing) return existing;
        const stableSource = [
            this.chatKey(),
            Number(index),
            String(message?.send_date ?? ''),
            String(message?.name ?? ''),
            String(message?.mes ?? ''),
        ].join('|');
        const generated = `ma-${(0, util_1.hashText)(stableSource)}`;
        const extra = (message.extra ?? (message.extra = {}));
        extra[constants_1.EXTENSION_NAMESPACE] = { ...(extra[constants_1.EXTENSION_NAMESPACE] ?? {}), messageKey: generated };
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
function previousPlayerMessage(chat, before) {
    for (let index = before - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (message?.is_user && !message.is_system && typeof message.mes === 'string') {
            return { index, text: String(message.mes ?? '') };
        }
    }
    return { index: -1, text: '' };
}
function dialogueContextBeforeTurn(chat, playerIndex, maxMessages = 4) {
    if (!Number.isInteger(playerIndex) || playerIndex <= 0) return '';
    const selected = [];
    for (let index = playerIndex - 1; index >= 0 && selected.length < Math.max(0, Number(maxMessages) || 0); index -= 1) {
        const message = chat[index];
        if (!message || message.is_system || typeof message.mes !== 'string' || !message.mes.trim()) continue;
        selected.push(`${message.is_user ? '玩家' : 'AI'}：${message.mes.trim()}`);
    }
    return selected.reverse().join('\n\n');
}
function formatDialogueTurn(playerText, assistantText) {
    return `玩家：${String(playerText || '（空）').trim() || '（空）'}\n\nAI：${String(assistantText || '').trim()}`;
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
function waitForModelRequest(promise, { timeoutMs, token, controller }) {
    let timer;
    let cancelPoll;
    const abortRequest = (reason) => {
        if (!controller || controller.signal?.aborted) return;
        try { controller.abort(reason); }
        catch { try { controller.abort(); } catch { } }
    };
    const control = new Promise((_, reject) => {
        const rejectCancelled = () => {
            const reason = String(token?.reason || '任务已取消');
            abortRequest(reason);
            reject(new Error(reason));
        };
        if (token?.cancelled) {
            rejectCancelled();
            return;
        }
        if (Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0) {
            timer = globalThis.setTimeout(() => {
                const reason = `模型调用超时（${timeoutMs}ms）`;
                if (token) {
                    token.cancelled = true;
                    token.reason = reason;
                }
                abortRequest(reason);
                reject(new Error(reason));
            }, Number(timeoutMs));
        }
        if (token) {
            cancelPoll = globalThis.setInterval(() => {
                if (token.cancelled) rejectCancelled();
            }, 25);
            cancelPoll?.unref?.();
        }
    });
    return Promise.race([Promise.resolve(promise), control]).finally(() => {
        if (timer) globalThis.clearTimeout(timer);
        if (cancelPoll) globalThis.clearInterval(cancelPoll);
    });
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
function extractModelText(raw, context = null) {
    if (typeof raw === 'string') return raw;
    if (raw === null || raw === undefined) return '';
    // [MA-HOST-MODEL-02] 先让 SillyTavern 用当前 API 的官方解析器处理原始响应。
    if (context && typeof context.extractMessageFromData === 'function' && typeof raw === 'object') {
        try {
            const official = context.extractMessageFromData(raw, context.mainApi ?? null);
            const officialText = finalTextValue(official);
            if (officialText.trim()) return officialText;
        }
        catch (error) {
            console.warn('[MirrorAbyss] SillyTavern official response parser failed', (0, util_1.errorText)(error));
        }
    }
    return finalTextValue(raw);
}
function finalTextValue(value, depth = 0) {
    if (depth > 8 || value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return '';
    if (Array.isArray(value)) {
        return value.map((item) => finalTextValue(item, depth + 1)).filter(Boolean).join('');
    }
    if (typeof value !== 'object') return '';
    // 已提取响应、OpenAI Chat Completions、Anthropic content blocks。
    for (const key of ['content', 'text', 'output_text', 'generated_text', 'completion']) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        const text = finalTextValue(value[key], depth + 1);
        if (text.trim()) return text;
    }
    if (value.message) {
        const text = finalTextValue(value.message, depth + 1);
        if (text.trim()) return text;
    }
    if (Array.isArray(value.choices) && value.choices.length) {
        for (const choice of value.choices) {
            const text = finalTextValue(choice?.message ?? choice?.text ?? choice?.delta, depth + 1);
            if (text.trim()) return text;
        }
    }
    // OpenAI Responses API: output[].content[].text；Gemini: candidates[].content.parts[].text。
    for (const key of ['output', 'candidates', 'results', 'parts']) {
        if (!Array.isArray(value[key])) continue;
        const text = finalTextValue(value[key], depth + 1);
        if (text.trim()) return text;
    }
    if (value.data && value.data !== value) {
        const text = finalTextValue(value.data, depth + 1);
        if (text.trim()) return text;
    }
    if (value.response && value.response !== value) {
        const text = finalTextValue(value.response, depth + 1);
        if (text.trim()) return text;
    }
    return '';
}
function extractReasoningText(raw, depth = 0) {
    if (depth > 8 || raw === null || raw === undefined) return '';
    if (Array.isArray(raw)) return raw.map((item) => extractReasoningText(item, depth + 1)).filter(Boolean).join('');
    if (typeof raw !== 'object') return '';
    const output = [];
    for (const key of ['reasoning', 'reasoning_content', 'thinking', 'analysis']) {
        const value = raw[key];
        if (typeof value === 'string' && value.trim()) output.push(value);
        else if (value && typeof value === 'object') {
            const nested = finalTextValue(value, depth + 1);
            if (nested.trim()) output.push(nested);
        }
    }
    if (raw.state?.reasoning) output.push(String(raw.state.reasoning));
    if (Array.isArray(raw.content)) {
        for (const block of raw.content) {
            if (block?.type === 'thinking' || block?.type === 'reasoning') {
                const text = String(block?.thinking ?? block?.reasoning ?? block?.text ?? block?.content ?? '');
                if (text.trim()) output.push(text);
            }
        }
    }
    if (Array.isArray(raw.choices)) {
        for (const choice of raw.choices) {
            const nested = extractReasoningText(choice?.message ?? choice?.delta ?? choice, depth + 1);
            if (nested.trim()) output.push(nested);
        }
    }
    return output.join('\n');
}
function describeModelResponse(raw) {
    if (raw === null) return 'null';
    if (raw === undefined) return 'undefined';
    if (typeof raw === 'string') return `string(${raw.length})`;
    if (Array.isArray(raw)) return `array(${raw.length})`;
    if (typeof raw !== 'object') return typeof raw;
    const ctor = raw?.constructor?.name && raw.constructor.name !== 'Object' ? raw.constructor.name : 'object';
    const keys = Object.keys(raw).slice(0, 12);
    return `${ctor}{${keys.join(',') || '无字段'}}`;
}
function isAuthorizationFailure(value) {
    const text = String(value ?? '').toLocaleLowerCase();
    return /(?:\b401\b|unauthori[sz]ed|invalid[ _-]?(?:api[ _-]?)?key|incorrect[ _-]?(?:api[ _-]?)?key|authentication(?:\s+failed|\s+error)?|api key is not set|密钥无效|未授权|鉴权失败|认证失败)/u.test(text);
}
function describeModelRoute(context, profileId) {
    const mainApi = String(context.mainApi ?? '').trim() || '未知';
    if (profileId) {
        let profile = null;
        try { profile = context.ConnectionManagerRequestService?.getProfile?.(profileId) ?? null; }
        catch (error) {
            return {
                profileId,
                name: profileId,
                api: '未知',
                model: '',
                mode: '',
                label: `连接配置：${profileId}`,
                noModelLikely: false,
                error: `无法读取 Connection Profile“${profileId}”：${(0, util_1.errorText)(error)}`,
            };
        }
        if (!profile) {
            return {
                profileId,
                name: profileId,
                api: '未知',
                model: '',
                mode: '',
                label: `连接配置：${profileId}`,
                noModelLikely: false,
                error: `所选 Connection Profile 已不存在：${profileId}`,
            };
        }
        const name = String(profile?.name ?? profileId);
        const apiValue = String(profile?.api ?? '').trim();
        const api = apiValue || '未设置';
        const mode = String(profile?.mode ?? '').trim();
        const model = readModelFromObject(profile);
        const modelRequired = mode === 'cc';
        const secretIdBound = Boolean(String(profile?.['secret-id'] ?? '').trim());
        let selectedApiMap = null;
        try {
            selectedApiMap = typeof context.ConnectionManagerRequestService?.validateProfile === 'function'
                ? context.ConnectionManagerRequestService.validateProfile(profile)
                : context.CONNECT_API_MAP?.[profile?.api] ?? null;
        }
        catch { selectedApiMap = null; }
        const directOfficialService = selectedApiMap?.selected === 'openai'
            && Boolean(selectedApiMap?.source)
            && !profile?.proxy
            && typeof context.ChatCompletionService?.processRequest === 'function';
        const error = !apiValue ? `处理连接“${name}”没有选择 API` : '';
        const warnings = [];
        if (modelRequired && !model) warnings.push(`连接配置“${name}”未记录模型；部分后端允许由服务器决定模型`);
        if (modelRequired && !secretIdBound) warnings.push('未绑定 Secret ID；无密钥端点可忽略，需要密钥的端点会返回未授权');
        return {
            profileId,
            name,
            api,
            model,
            mode,
            secretIdBound,
            directOfficialService,
            transport: directOfficialService ? 'ChatCompletionService' : 'ConnectionManagerRequestService',
            label: `连接配置：${name}；API：${api}；模型：${model || (modelRequired ? '未设置' : '由后端决定')}；密钥：${secretIdBound ? '已绑定' : '未绑定'}`,
            noModelLikely: modelRequired && !model,
            warning: warnings.join('；'),
            error,
        };
    }
    const model = readCurrentModel(context);
    const api = readCurrentApi(context, mainApi);
    const chatCompletion = mainApi === 'openai';
    return {
        profileId: '',
        name: '当前连接',
        api,
        model,
        mode: chatCompletion ? 'cc' : 'tc',
        label: `当前连接；API：${api}；模型：${model || (chatCompletion ? '未识别' : '由后端决定')}`,
        noModelLikely: chatCompletion && !model,
        warning: chatCompletion && !model ? '当前聊天补全连接未识别到模型；仍将交由 SillyTavern 发起请求' : '',
        error: '',
    };
}
function readCurrentApi(context, mainApi) {
    if (mainApi === 'openai') {
        return String(
            context.chatCompletionSettings?.chat_completion_source
            ?? context.chatCompletionSettings?.source
            ?? mainApi,
        ).trim() || 'openai';
    }
    return String(mainApi || '未知');
}
function readCurrentModel(context) {
    try {
        const direct = context.getChatCompletionModel?.();
        if (direct) return String(direct);
    }
    catch { /* ignore host getter failure */ }
    return String(
        context.chatCompletionSettings?.model
        ?? readModelFromObject(context.textCompletionSettings)
        ?? '',
    ).trim();
}
function readModelFromObject(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 5) return '';
    for (const key of ['model', 'modelId', 'model_id', 'modelName', 'model_name']) {
        const candidate = value[key];
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    for (const key of ['settings', 'config', 'connection', 'api']) {
        const nested = readModelFromObject(value[key], depth + 1);
        if (nested) return nested;
    }
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
    root.style.cssText = 'position:fixed!important;right:max(10px,env(safe-area-inset-right))!important;top:50dvh!important;transform:translateY(-50%)!important;z-index:10052!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;';
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = '<i class="fa-solid fa-circle-nodes" aria-hidden="true"></i>';
    button.setAttribute('aria-label', '启动镜渊');
    button.title = '镜渊正在等待 SillyTavern 完成初始化';
    button.style.cssText = 'display:flex!important;align-items:center!important;justify-content:center!important;width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border:1px solid rgba(255,255,255,.24);border-radius:50%;background:rgba(20,20,24,.96);color:#fff;font-weight:700;font-size:13px;box-shadow:0 3px 12px rgba(0,0,0,.42);touch-action:none;pointer-events:auto!important;cursor:pointer!important;';
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
        organizeWorldbook: async () => (await requireApplication()).organizeWorldbook(),
        replanRecall: async () => (await requireApplication()).replanRecall(),
        previewWorldbookRebuild: async () => (await requireApplication()).migrate(),
        commitWorldbookRebuild: async () => (await requireApplication()).commitMigration(),
        getWorldbookRebuildPreview: async () => (await requireApplication()).migrationPreview(),
        migrateWorldbook: async () => (await requireApplication()).migrate(),
        undoWorldbookMigration: async () => (await requireApplication()).undoMigration(),
        previewWorldSettings: async (text) => (await requireApplication()).previewWorldSettings(text),
        commitWorldSettings: async (text) => (await requireApplication()).commitWorldSettings(text),
        getWorldSettingsPreview: async () => (await requireApplication()).worldSettingsPreview(),
        clearWorldSettingsPreview: async () => (await requireApplication()).clearWorldSettingsPreview(),
        cancel: async () => (await requireApplication()).cancel(),
        getSettings: async () => (await requireApplication()).settings(),
        configure: async (patch) => (await requireApplication()).configure(patch),
        status: async () => (await requireApplication()).status(),
        runAcceptance: async () => (await requireApplication()).runAcceptance(),
        exportDiagnostics: async () => (await requireApplication()).exportDiagnostics(),
        getDiagnostics: async () => (await requireApplication()).diagnosticsReport(),
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
exports.sameEntryIdentity = sameEntryIdentity;
exports.explicitContextIdentity = explicitContextIdentity;
exports.isProvisionalName = isProvisionalName;
exports.isProvisionalEntry = isProvisionalEntry;
exports.sameEventLifecycle = sameEventLifecycle;
exports.eventLifecycleScore = eventLifecycleScore;
exports.identityConflict = identityConflict;
const util_1 = require("./util");
const semantic_1 = require("./semantic");

const DEFAULT_SCORES = Object.freeze({
    uid: 100,
    exactTitle: 95,
    normalizedTitle: 90,
    contextIdentity: 110,
    alias: 85,
    nameVariant: 84,
    typeAndName: 80,
    keyword: 50,
    content: 30,
});
const HONORIFIC_SUFFIXES = Object.freeze([
    '老师', '教授', '医生', '主任', '队长', '会长', '店长', '老板',
    '先生', '女士', '小姐', '大人', '殿下', '陛下', '学姐', '学长',
    '师姐', '师兄', '姐姐', '哥哥', '前辈',
]);

function buildEntryIndex(entries) {
    const byUid = new Map();
    const byExactTitle = new Map();
    const byTitle = new Map();
    const byTypeAndName = new Map();
    const byAlias = new Map();
    const byKeyword = new Map();
    const byVariantName = new Map();
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
        const identityNames = [entry.name, ...(entry.aliases ?? []), ...(entry.triggerKeywords ?? entry.keywords ?? [])];
        for (const identityName of identityNames) {
            if ((0, util_1.isUidKeyword)(identityName)) continue;
            for (const variant of nameVariants(identityName)) add(byVariantName, typedLookup(entry.type, variant), entry);
        }
    }
    return { entries, byUid, byExactTitle, byTitle, byTypeAndName, byAlias, byKeyword, byVariantName };
}

function matchBlock(block, index, contextText, weights = {}) {
    const scores = { ...DEFAULT_SCORES, ...weights };
    const collected = [];
    if (block.uid) {
        const entry = index.byUid.get(String(block.uid));
        if (entry) collected.push(candidate(entry, scores.uid, 'uid', `UID ${block.uid} 精确命中`));
    }
    collected.push(...candidates(index.byExactTitle.get(String(block.title ?? '')) ?? [], scores.exactTitle, 'exact-title', '标题完全相同'));
    collected.push(...candidates(index.byTitle.get(normalizeTitleLookup(block.title)) ?? [], scores.normalizedTitle, 'normalized-title', '标准化标题相同'));
    collected.push(...candidates(index.byTypeAndName.get(typeNameKey(block.type, block.name)) ?? [], scores.typeAndName, 'type-name', '类型与名称相同'));
    const provisionalBlock = canonicalTypeLookup(block.type) === '人物' && isProvisionalName(block.name);
    const identitySafe = (entries) => provisionalBlock ? entries.filter((entry) => isProvisionalEntry(entry)) : entries;
    collected.push(...candidates(identitySafe(index.byAlias.get(typedLookup(block.type, block.name)) ?? []), scores.alias, 'alias', `同类型正式别名“${block.name}”命中`));
    for (const variant of nameVariants(block.name)) {
        collected.push(...candidates(identitySafe(index.byVariantName.get(typedLookup(block.type, variant)) ?? []), scores.nameVariant, 'name-variant', `称谓或标题轻微变化归一为“${variant}”`));
    }
    if (canonicalTypeLookup(block.type) === '场景') {
        for (const entry of index.entries) {
            if (canonicalTypeLookup(entry.type) !== '场景') continue;
            const affinity = sceneNameAffinity(block, entry);
            if (affinity.score >= 82) collected.push(candidate(entry, affinity.score, 'scene-name-affinity', affinity.detail));
        }
    }
    collected.push(...candidates(identitySafe(index.byKeyword.get(typedLookup(block.type, block.name)) ?? []), scores.keyword, 'keyword', `同类型关键词“${block.name}”命中`));

    if (String(contextText ?? '').trim()) {
        for (const entry of index.entries) {
            if (canonicalTypeLookup(entry.type) !== canonicalTypeLookup(block.type)) continue;
            if (explicitContextIdentity(block.name, entry, contextText)) {
                const identityScore = provisionalBlock && !isProvisionalEntry(entry)
                    ? scores.contextIdentity
                    : (!provisionalBlock && isProvisionalEntry(entry) ? 79 : 88);
                collected.push(candidate(entry, identityScore, 'context-identity', `本轮正文明确说明“${block.name}”与“${entry.name}”为同一身份`));
            }
        }
    }

    // [MA-EVENT-01] 事件按同一目标、参与者与场景形成的生命周期匹配，不再只靠每轮标题。
    // 已结束事件不会被新的活动过程重新打开；标题变化只作为辅助证据。
    if (canonicalTypeLookup(block.type) === '事件') {
        for (const entry of index.entries) {
            if (canonicalTypeLookup(entry.type) !== '事件' || (0, semantic_1.isEventClosed)(entry)) continue;
            const lifecycle = eventLifecycleScore(block, entry);
            if (lifecycle.score >= 80) {
                collected.push(candidate(entry, lifecycle.score, 'event-lifecycle', lifecycle.detail));
            }
        }
    }

    const name = normalizeLookup(block.name);
    if (name.length >= 2) {
        for (const entry of index.entries) {
            if (canonicalTypeLookup(entry.type) !== canonicalTypeLookup(block.type)) continue;
            const haystack = normalizeLookup(`${entry.content ?? ''}\n${(entry.keywords ?? []).join(' ')}\n${(entry.aliases ?? []).join(' ')}`);
            if (haystack.includes(name) && (!provisionalBlock || isProvisionalEntry(entry))) collected.push(candidate(entry, scores.content, 'content', `正文或关键词包含名称“${block.name}”，仅作辅助`));
        }
    }

    const byUid = new Map();
    for (const item of collected) {
        const explicitUidMatch = item.evidence.some((evidence) => evidence.kind === 'uid');
        if (canonicalTypeLookup(block.type) === '事件' && (0, semantic_1.isEventClosed)(item.entry) && !explicitUidMatch) continue;
        const hasStrongIdentity = item.evidence.some((evidence) => ['uid', 'context-identity'].includes(evidence.kind));
        if (!hasStrongIdentity && identityConflict(block, item.entry)) {
            item.score = Math.min(Number(item.score), 40);
            item.evidence.push({ kind: 'identity-conflict', score: 0, detail: '稳定区分锚点或多个身份字段冲突，禁止按相似名称覆盖' });
        }
        else if (!hasStrongIdentity && anchorNeedsConfirmation(block, item.entry, item.evidence)) {
            item.score = Math.min(Number(item.score), 60);
            item.evidence.push({ kind: 'anchor-unconfirmed', score: 0, detail: '名称只在去除区分锚点后相同，缺少同一身份确认' });
        }
        const current = byUid.get(item.entry.uid);
        if (!current || item.score > current.score) byUid.set(item.entry.uid, item);
        else if (current && item.score === current.score) current.evidence.push(...item.evidence);
    }
    return [...byUid.values()].sort((a, b) => b.score - a.score || compareEntryPriority(a.entry, b.entry));
}

function selectBestCandidate(candidates, minimumScore = 80) {
    const eligible = candidates.filter((item) => Number(item.score) >= Number(minimumScore));
    if (!eligible.length) return null;
    const topScore = eligible[0].score;
    const top = eligible.filter((item) => item.score === topScore);
    if (top.length === 1) return top[0];
    if (!top.every((item) => sameEntryIdentity(item.entry, top[0].entry) || (canonicalTypeLookup(item.entry.type) === '事件' && canonicalTypeLookup(top[0].entry.type) === '事件' && sameEventLifecycle(item.entry, top[0].entry)))) return null;
    const selected = [...top].sort((left, right) => compareEntryPriority(left.entry, right.entry))[0];
    return {
        ...selected,
        evidence: [...selected.evidence, { kind: 'duplicate-primary', score: Number(topScore), detail: `发现${top.length}个同一身份候选，确定性选择主档 UID ${selected.entry.uid}` }],
    };
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
    const merged = [...new Map([...selected, ...fallback].map((entry) => [entry.uid, entry])).values()];
    if (limit <= 8) {
        // [MA-CONTEXT-01] 逐轮提取的小上下文中固定保留最新世界与基础设定各一条，
        // 防止人物名称命中把全局框架完全挤出模型视野。
        const reserved = ['基础设定', '世界'].map((type) => entries
            .filter((entry) => entry.type === type && !entry.activation?.disabled)
            .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))[0])
            .filter(Boolean);
        const reservedUids = new Set(reserved.map((entry) => entry.uid));
        const ordinary = merged.filter((entry) => !reservedUids.has(entry.uid));
        const budget = Math.max(0, Number(limit) - reserved.length);
        return [...ordinary.slice(0, budget), ...reserved].slice(0, limit);
    }
    return merged.slice(0, limit);
}

function sameEntryIdentity(left, right) {
    if (!left || !right) return false;
    if (String(left.uid ?? '') && String(left.uid ?? '') === String(right.uid ?? '')) return true;
    if (canonicalTypeLookup(left.type) !== canonicalTypeLookup(right.type)) return false;
    if (identityConflict(left, right)) return false;
    if (normalizeTitleLookup(left.title) && normalizeTitleLookup(left.title) === normalizeTitleLookup(right.title)) return true;
    if (canonicalTypeLookup(left.type) === '场景' && sceneNameAffinity(left, right).score >= 82) return true;
    const leftNames = new Set([left.name, ...(left.aliases ?? [])].flatMap(nameVariants));
    const rightNames = [right.name, ...(right.aliases ?? [])].flatMap(nameVariants);
    return rightNames.some((name) => leftNames.has(name));
}
function candidates(entries, score, kind, detail) {
    return [...new Map(entries.map((entry) => [entry.uid, entry])).values()].map((entry) => candidate(entry, score, kind, detail));
}
function candidate(entry, score, kind, detail) {
    return { entry, score: Number(score), evidence: [{ kind, score: Number(score), detail }] };
}
function explicitContextIdentity(blockName, entry, contextText) {
    const context = normalizeLookup(contextText);
    if (!context) return false;
    const leftNames = nameVariants(blockName);
    const rightNames = [entry.name, ...(entry.aliases ?? [])].flatMap(nameVariants);
    for (const left of leftNames) {
        for (const right of rightNames) {
            if (!left || !right || left === right) continue;
            const patterns = [
                `${left}就是${right}`, `${left}其实是${right}`, `${left}正是${right}`, `${left}原来是${right}`,
                `${right}就是${left}`, `${right}其实是${left}`, `${right}正是${left}`, `${right}原来是${left}`,
                `${left}真实身份是${right}`, `${left}的真实身份是${right}`, `${left}身份为${right}`,
                `${right}真实身份是${left}`, `${right}的真实身份是${left}`, `${right}身份为${left}`,
                // 伪装、假扮、冒充只说明表现关系，不能证明两个对象是同一身份。
                `${left}账号属于${right}`, `${left}的账号属于${right}`, `${right}账号属于${left}`, `${right}的账号属于${left}`,
            ];
            if (patterns.some((pattern) => context.includes(pattern))) return true;
        }
    }
    return false;
}


function sameEventLifecycle(left, right) {
    return eventLifecycleScore(left, right).score >= 80;
}

function eventLifecycleScore(left, right) {
    if (canonicalTypeLookup(left?.type) !== '事件' || canonicalTypeLookup(right?.type) !== '事件') return { score: 0, detail: '不是同类型事件' };
    const a = eventSignature(left);
    const b = eventSignature(right);
    const participants = tokenSetsOverlap(a.participants, b.participants);
    const scenes = tokenSetsOverlap(a.scenes, b.scenes);
    const goals = phraseSetsOverlap(a.goals, b.goals);
    const titles = phraseSimilar(a.title, b.title) || tokenSetsOverlap(a.aliases, b.aliases);
    const explicitGoalConflict = a.goals.length > 0 && b.goals.length > 0 && !goals;

    let score = 0;
    const evidence = [];
    if (participants) { score += 35; evidence.push('参与者重合'); }
    if (scenes) { score += 30; evidence.push('场景重合'); }
    if (goals) { score += 35; evidence.push('已发生变化或结果连续'); }
    if (titles) { score += 24; evidence.push('事件名称或别名近似'); }

    // 两边都有明确但不同的目标时，不因人物和地点相同就强行合并。
    if (explicitGoalConflict && !titles) return { score: 0, detail: '参与者或场景相同，但已发生变化完全不同，暂不自动合并' };
    if (participants && scenes && (!explicitGoalConflict || goals)) score = Math.max(score, 88);
    else if (participants && goals) score = Math.max(score, 86);
    else if (scenes && goals) score = Math.max(score, 84);
    else if (titles && (participants || scenes || goals)) score = Math.max(score, 82);
    score = Math.min(92, score);
    return { score, detail: evidence.length ? `同一事件生命周期：${evidence.join('、')}` : '没有足够的事件连续性证据' };
}

function eventSignature(value) {
    const sections = sectionMap(value);
    const participants = splitEventValues(sections.get('参与') ?? []);
    const scenes = splitEventValues(sections.get('场景') ?? []);
    const goals = [
        ...(sections.get('已发生进展') ?? []),
        ...(sections.get('关键进展') ?? []),
        ...(sections.get('结果') ?? []),
        // 仅用于兼容旧条目的内部匹配；不会把旧【目标】重新写回世界书。
        ...(sections.get('目标') ?? []),
    ].map(stripEventLabel).map(cleanEventPhrase).filter(Boolean);
    const aliases = [
        value?.name,
        ...(value?.aliases ?? []),
        ...(value?.keywords ?? []),
        ...(value?.triggerKeywords ?? []),
        ...(sections.get('别名') ?? []),
    ].map(cleanEventPhrase).filter(Boolean);
    return {
        title: cleanEventPhrase(value?.name ?? value?.title ?? ''),
        participants: (0, util_1.unique)(participants),
        scenes: (0, util_1.unique)(scenes),
        goals: (0, util_1.unique)(goals),
        aliases: (0, util_1.unique)(aliases),
    };
}

function sectionMap(value) {
    const map = new Map();
    if (Array.isArray(value?.sections)) {
        for (const section of value.sections) map.set(String(section?.name ?? '').trim(), section?.lines ?? []);
        return map;
    }
    for (const [name, lines] of Object.entries(value?.sections?.values ?? {})) map.set(String(name).trim(), Array.isArray(lines) ? lines : []);
    return map;
}

function stripEventLabel(value) {
    return String(value ?? '').replace(/^\s*[^：:]{1,24}\s*[：:]\s*/u, '').trim();
}
function splitEventValues(lines) {
    const output = [];
    for (const raw of lines ?? []) {
        const text = String(raw ?? '').replace(/^\s*[^：:]{1,24}\s*[：:]\s*/u, '').trim();
        for (const part of text.split(/[、,，/；;]|(?:以及|并且|与|和|及)/u)) {
            const normalized = cleanEventPhrase(part);
            if (!normalized || /^(?:无|未知|未说明|参与者|人物|当前场景|场景)$/u.test(normalized)) continue;
            output.push(normalized);
        }
    }
    return output;
}

function tokenSetsOverlap(left, right) {
    if (!left.length || !right.length) return false;
    return left.some((a) => right.some((b) => a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)))));
}
function phraseSetsOverlap(left, right) {
    if (!left.length || !right.length) return false;
    return left.some((a) => right.some((b) => phraseSimilar(a, b)));
}
function phraseSimilar(left, right) {
    const a = cleanEventPhrase(left);
    const b = cleanEventPhrase(right);
    if (!a || !b) return false;
    if (a === b) return true;
    if (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))) return true;
    const aa = bigrams(a);
    const bb = bigrams(b);
    if (!aa.length || !bb.length) return false;
    const counts = new Map();
    for (const item of aa) counts.set(item, (counts.get(item) ?? 0) + 1);
    let overlap = 0;
    for (const item of bb) {
        const count = counts.get(item) ?? 0;
        if (count > 0) { overlap += 1; counts.set(item, count - 1); }
    }
    return (2 * overlap) / (aa.length + bb.length) >= 0.46;
}
function bigrams(text) {
    if (text.length < 2) return text ? [text] : [];
    const output = [];
    for (let index = 0; index < text.length - 1; index += 1) output.push(text.slice(index, index + 2));
    return output;
}
function cleanEventPhrase(value) {
    return normalizeLookup(String(value ?? ''))
        .replace(/^(?:事件|任务|活动|当前|本轮|相关|进行中|已经|已)/u, '')
        .replace(/(?:事件|任务|活动)$/u, '');
}


function sceneNameAffinity(left, right) {
    const leftNames = [left?.name, ...(left?.aliases ?? []), ...(left?.keywords ?? [])].filter(Boolean);
    const rightNames = [right?.name, ...(right?.aliases ?? []), ...(right?.keywords ?? [])].filter(Boolean);
    let best = { score: 0, detail: '地点名称缺少稳定共同锚点' };
    for (const rawLeft of leftNames) {
        for (const rawRight of rightNames) {
            const a = normalizeSceneName(rawLeft);
            const b = normalizeSceneName(rawRight);
            if (!a || !b) continue;
            const numsA = [...a.matchAll(/\d+/gu)].map((match) => match[0]);
            const numsB = [...b.matchAll(/\d+/gu)].map((match) => match[0]);
            if (numsA.length && numsB.length && !numsA.some((value) => numsB.includes(value))) continue;
            const kindA = sceneKind(a);
            const kindB = sceneKind(b);
            if (a === b) return { score: 90, detail: `地点名称归一后相同：“${rawLeft}”≈“${rawRight}”` };
            if (numsA.some((value) => numsB.includes(value)) && kindA && kindA === kindB) {
                best = { score: 88, detail: `地点编号与类型一致：“${rawLeft}”≈“${rawRight}”` };
                continue;
            }
            if (kindA && kindA === kindB && Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a))) {
                best = { score: Math.max(best.score, 85), detail: `主体地点名称包含关系：“${rawLeft}”≈“${rawRight}”` };
                continue;
            }
            if (kindA && kindA === kindB && Math.min(a.length, b.length) >= 5 && phraseSimilar(a, b)) {
                best = { score: Math.max(best.score, 82), detail: `地点稳定名称高度相似：“${rawLeft}”≈“${rawRight}”` };
            }
        }
    }
    return best;
}
function normalizeSceneName(value) {
    return normalizeLookup(String(value ?? ''))
        .replace(/(?:的|所在|内部|里面|内侧)/gu, '')
        .replace(/(?:中央|中心区域|正中|村中)/gu, '')
        .replace(/祭台/gu, '祭坛')
        .replace(/房间/gu, '房')
        .replace(/门口|门前|床边|桌边|书桌旁|窗边|角落|拐角$/gu, '');
}
function sceneKind(value) {
    const match = String(value ?? '').match(/(宿舍|房|走廊|祭坛|洞穴|山洞|酒馆|教室|办公室|大厅|仓库|港口|村|城|森林|悬崖|街道|广场|车站|机场|遗迹|宫殿|庭院)$/u);
    return match?.[1] ?? '';
}

function isProvisionalName(value) {
    const text = normalizeLookup(value);
    if (!text) return false;
    return /(?:身份未明|身份不明|未知身份|未识别|不明身份|陌生|神秘|匿名|未知)(?:的)?(?:人物|人|男人|女人|男子|女子|少年|少女|老人|孩子|来客|访客|账号|联系人|发信者|来电者|声音|身影)?/u.test(text)
        || /^(?:黑衣|蒙面|戴面具|兜帽|遮脸)(?:人|男人|女人|男子|女子|身影)$/u.test(text);
}
function isProvisionalEntry(entry) {
    if (!entry) return false;
    if (isProvisionalName(entry.name)) return true;
    return [...(entry.keywords ?? []), ...(entry.aliases ?? [])].some((value) => /^(?:身份未明|身份不明|未知身份|临时)$/u.test((0, util_1.normalizeFact)(value)));
}

function nameVariants(value) {
    const full = normalizeLookup(String(value ?? ''));
    const raw = normalizeLookup(String(value ?? '').replace(/[（(][^）)]*[）)]/gu, ''));
    if (!full && !raw) return [];
    const variants = new Set([full, raw].filter(Boolean));
    for (const source of [full, raw]) {
        for (const suffix of HONORIFIC_SUFFIXES) {
            if (!source.endsWith(suffix)) continue;
            const base = source.slice(0, -suffix.length);
            if (base.length >= 2) variants.add(base);
        }
    }
    return [...variants];
}
function identityConflict(left, right) {
    if (!left || !right) return false;
    if (canonicalTypeLookup(left.type) !== canonicalTypeLookup(right.type)) return true;
    const leftForms = identityBodyForms(left);
    const rightForms = identityBodyForms(right);
    if (leftForms.length && rightForms.length && !leftForms.some((value) => rightForms.includes(value))) return true;
    const leftAnchors = parentheticalAnchors(left.name ?? left.title);
    const rightAnchors = parentheticalAnchors(right.name ?? right.title);
    if (leftAnchors.length && rightAnchors.length && !leftAnchors.some((value) => rightAnchors.includes(value))) return true;
    const leftForm = embodimentKind(left);
    const rightForm = embodimentKind(right);
    if (leftForm && rightForm && leftForm !== rightForm) return true;
    const leftSlots = stableIdentitySlots(left);
    const rightSlots = stableIdentitySlots(right);
    let conflicts = 0;
    for (const [key, leftValue] of leftSlots.entries()) {
        const rightValue = rightSlots.get(key);
        if (!rightValue || compatibleIdentityValue(leftValue, rightValue)) continue;
        // 唯一编号、种族、型号和类别属于强区分锚点，单项冲突即可确认不是同一对象。
        if (/^(?:唯一编号|编号|序列号|账号id|id|种族|型号|类别|形态|身份形态|存在形态|身体形态|本体类型|本体关系|载体类型)$/u.test(key)) return true;
        conflicts += 1;
    }
    return conflicts >= 2;
}

function embodimentKind(value) {
    const text = normalizeLookup(`${value?.title ?? ''}
${value?.name ?? ''}
${value?.content ?? ''}`);
    if (!text) return '';
    if (/(?:假身|分身|替身|伪装体|复制体|投影体|傀儡体|化身|冒充身份)/u.test(text)) return 'proxy';
    if (/(?:真身|本体|原身|真实身体|主体意识载体)/u.test(text)) return 'original';
    return '';
}

function anchorNeedsConfirmation(block, entry, evidence = []) {
    if (!evidence.some((item) => ['name-variant', 'type-name'].includes(item.kind))) return false;
    const blockAnchors = parentheticalAnchors(block?.name ?? block?.title);
    const entryAnchors = parentheticalAnchors(entry?.name ?? entry?.title);
    return blockAnchors.length !== entryAnchors.length && (blockAnchors.length > 0 || entryAnchors.length > 0);
}
function identityBodyForms(value) {
    const sections = sectionMap(value);
    const source = [value?.name, value?.title, ...(value?.aliases ?? [])];
    for (const [section, lines] of sections.entries()) {
        if (!/^(?:身份|稳定|定义|当前)$/u.test(section)) continue;
        source.push(...(lines ?? []));
    }
    const forms = [];
    const patterns = [
        ['真身', /(?:真身|本体|本尊|原身|主体)/u],
        ['假身', /(?:假身|替身|伪身|傀儡身|复制体)/u],
        ['分身', /(?:分身|化身|投影|镜像体)/u],
    ];
    for (const raw of source) {
        const text = normalizeLookup(raw);
        for (const [label, pattern] of patterns) if (pattern.test(text)) forms.push(label);
    }
    return (0, util_1.unique)(forms);
}

function parentheticalAnchors(value) {
    return [...String(value ?? '').matchAll(/[（(]([^）)]+)[）)]/gu)]
        .map((match) => normalizeLookup(match[1]))
        .filter(Boolean);
}
function stableIdentitySlots(value) {
    const map = new Map();
    const sections = sectionMap(value);
    for (const [section, lines] of sections.entries()) {
        if (!/^(?:身份|稳定|定义|当前)$/u.test(section)) continue;
        for (const line of lines ?? []) {
            const match = String(line ?? '').match(/^\s*([^：:]{1,24})\s*[：:]\s*(.+)$/u);
            if (!match) continue;
            const key = normalizeLookup(match[1]);
            if (!/^(?:唯一编号|编号|序列号|账号id|id|种族|职业|组织|阵营|身份|型号|类别|形态|身份形态|存在形态|身体形态|本体类型|本体关系|载体类型|载体)$/u.test(key)) continue;
            map.set(key, normalizeLookup(match[2]));
        }
    }
    return map;
}
function compatibleIdentityValue(left, right) {
    if (!left || !right) return true;
    return left === right || (Math.min(left.length, right.length) >= 3 && (left.includes(right) || right.includes(left)));
}
function compareEntryPriority(left, right) {
    const leftScore = entryPriority(left);
    const rightScore = entryPriority(right);
    if (leftScore !== rightScore) return rightScore - leftScore;
    const leftUpdated = Number(left?.updatedAt || 0);
    const rightUpdated = Number(right?.updatedAt || 0);
    if (leftUpdated !== rightUpdated) return leftUpdated - rightUpdated;
    return String(left?.uid ?? '').localeCompare(String(right?.uid ?? ''), 'zh-CN', { numeric: true });
}
function entryPriority(entry) {
    const contentSize = String(entry?.content ?? '').length;
    const sectionCount = Object.values(entry?.sections?.values ?? {}).reduce((sum, lines) => sum + (Array.isArray(lines) ? lines.length : 0), 0);
    return Number(entry?.focus === true) * 10000
        + Number(entry?.locked === true) * 5000
        + Number(entry?.managed === true) * 1000
        + Number(entry?.activation?.disabled !== true && entry?.activation?.enabled !== false) * 200
        + Math.min(150, contentSize)
        + Math.min(50, sectionCount * 5);
}
function typeNameKey(type, name) { return `${canonicalTypeLookup(type)}｜${normalizeLookup(name)}`; }
function typedLookup(type, value) { return `${canonicalTypeLookup(type)}｜${normalizeLookup(value)}`; }
function canonicalTypeLookup(type) {
    const value = normalizeLookup(type);
    return ({ 角色: '人物', npc: '人物', 地点: '场景', 地区: '场景', 区域: '场景', 全局: '世界', 全局状态: '世界', 全局变化: '世界', 当前局势: '世界', 世界局势: '世界', 世界变化: '世界', 基础规则: '基础设定', 世界设定: '基础设定', 设定: '基础设定' })[value] ?? value;
}
function normalizeTitleLookup(value) { return (0, util_1.stripBatchTitleId)(String(value ?? '')).toLocaleLowerCase(); }
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
exports.segmentedExtractionRescue = segmentedExtractionRescue;
exports.splitExtractionSource = splitExtractionSource;
exports.__testSummaryEntries = summaryEntries;
exports.__testAbsorbedSourceOperations = absorbedSourceOperations;
exports.__testParseSummaryWithRecovery = parseSummaryWithRecovery;
exports.__testInspectSummaryProtocol = inspectSummaryProtocol;
exports.__testSummaryRepairPreservesSemantics = summaryRepairPreservesSemantics;
exports.__testHistoricalDistributionPlan = historicalDistributionPlan;
exports.__testResolvedHistoricalSourceUids = resolvedHistoricalSourceUids;
exports.__testMergePendingUids = mergePendingUids;
const matcher_1 = require("./matcher");
const operations_1 = require("./operations");
const parser_1 = require("./parser");
const prompts_1 = require("./prompts");
const semantic_1 = require("./semantic");
const governance_1 = require("./governance");
const model_request_1 = require("./model-request");
const util_1 = require("./util");
const information_point_1 = require("./domain/information-point");
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
    resetStatus(chatKey = '') {
        if (chatKey) this.statusByChat.delete(chatKey);
        else this.statusByChat.clear();
    }
    async runExtractionOnly(settings, snapshot) {
        // The deterministic acceptance chain validates the parser/governance,
        // matcher, transaction and authoritative reread path
        // independently of model formatting variance. Real model ENTRY output
        // is exercised by the separate extraction-protocol hard gate.
        const result = await this.extract(settings, snapshot, { deterministicOnly: true });
        this.setStatus(snapshot.chatKey, 'complete', '诊断提取与写入完成');
        return taskResultEntries(result);
    }
    async runTask(kind, settings, snapshot, options = {}) {
        const summaryRetryInterval = Math.max(1, Math.min(Number(settings.smallSummaryTurns || 30), Number(settings.smallSummaryMinTurns || 5)));
        if (kind === 'extraction') {
            // ui.72: 防线下沉到 MemoryRunner。即使上层 UI/队列漏掉禁用判断，
            // 提取模块关闭时也不得推进处理游标、总结轮数或 pending 工作集。
            if (settings.extractionEnabled === false) {
                const result = await this.extract(settings, snapshot);
                this.setStatus(snapshot.chatKey, 'complete', '提取未启用，本回合未推进处理游标');
                return taskResultEntries(result);
            }
            const cursor = this.host.cursor();
            const result = await this.extract(settings, snapshot);
            const schedule = await this.advanceSummarySchedule(settings, snapshot, cursor, result.criticalChanges || 0, result);
            this.setStatus(snapshot.chatKey, 'complete', schedule?.warning ? `提取完成；${schedule.warning}` : '提取与总结调度完成');
            return taskResultEntries(result);
        }
        if (kind === 'smallSummary') {
            const result = await this.summarize('small', settings, snapshot);
            const committed = [result];
            const cursor = this.host.cursor();
            // 只有“已经结算”的小总结才属于一个完成层级，才能推动大总结。
            // 部分写入但未完成结算时保留 pending，并进入冷却，不得每回合重试或累计大总结次数。
            const completedAndChanged = result.settled === true && result.changed === true;
            const smallCountSinceLarge = cursor.smallCountSinceLarge + (completedAndChanged ? 1 : 0);
            const pendingSmallSummaryUids = subtractPendingUids(cursor.pendingSmallSummaryUids, resultResolvedSourceUids(result));
            const pendingLargeSummaryUids = completedAndChanged
                ? mergePendingUids(cursor.pendingLargeSummaryUids, resultActiveChangedUids(result))
                : [...(cursor.pendingLargeSummaryUids ?? [])];
            try {
                const nextCursor = {
                    ...cursor,
                    turnsSinceSmall: result.settled ? 0 : cursor.turnsSinceSmall,
                    criticalChangesSinceSmall: result.settled ? 0 : cursor.criticalChangesSinceSmall,
                    smallCountSinceLarge,
                    smallSummaryRetryCooldown: result.settled ? 0 : summaryRetryInterval,
                    pendingSmallSummaryUids,
                    pendingLargeSummaryUids,
                };
                await this.host.saveCursor(nextCursor, snapshot, this.getSettings());
                await this.finalizeReceiptStates(committed, nextCursor);
            }
            catch (error) {
                await this.rollbackCommittedResults(settings, snapshot, committed, result.previousGameTime, cursor, error, '小总结回合');
            }
            this.setStatus(snapshot.chatKey, 'complete', result.changed ? (result.settled ? '小总结完成' : `小总结部分写入但未完成结算；${summaryRetryInterval}个正文回合后再尝试`) : (result.settled ? '小总结已结算，无需写入' : '小总结未完成'));
            return taskResultEntries(result);
        }
        const result = await this.summarize('large', settings, snapshot);
        const cursor = this.host.cursor();
        try {
            const nextCursor = {
                ...cursor,
                smallCountSinceLarge: result.settled ? 0 : cursor.smallCountSinceLarge,
                largeSummaryRetryCooldown: result.settled ? 0 : summaryRetryInterval,
                pendingLargeSummaryUids: subtractPendingUids(cursor.pendingLargeSummaryUids, resultResolvedSourceUids(result)),
            };
            await this.host.saveCursor(nextCursor, snapshot, this.getSettings());
            await this.finalizeReceiptStates([result], nextCursor);
        }
        catch (error) {
            await this.rollbackCommittedResults(settings, snapshot, [result], result.previousGameTime, cursor, error, '大总结回合');
        }
        this.setStatus(snapshot.chatKey, 'complete', result.changed ? (result.settled ? '大总结完成' : `大总结部分写入但未完成结算；${summaryRetryInterval}个正文回合后再尝试`) : (result.settled ? '大总结已结算，无需写入' : '大总结未完成'));
        return taskResultEntries(result);
    }
    async advanceSummarySchedule(settings, snapshot, cursor, criticalChanges = 0, rootResult = null) {
        const committed = rootResult ? [rootResult] : [];
        const previousGameTime = rootResult?.previousGameTime ?? (typeof this.host.getCurrentGameTime === 'function' ? this.host.getCurrentGameTime() : null);
        let turnsSinceSmall = Number(cursor.turnsSinceSmall || 0) + 1;
        let criticalChangesSinceSmall = Number(cursor.criticalChangesSinceSmall || 0) + Math.max(0, Number(criticalChanges || 0));
        let smallCountSinceLarge = Number(cursor.smallCountSinceLarge || 0);
        let smallSummaryRetryCooldown = Math.max(0, Number(cursor.smallSummaryRetryCooldown || 0) - 1);
        let largeSummaryRetryCooldown = Math.max(0, Number(cursor.largeSummaryRetryCooldown || 0) - 1);
        let pendingSmallSummaryUids = mergePendingUids(cursor.pendingSmallSummaryUids, resultChangedUids(rootResult));
        let pendingLargeSummaryUids = [...(cursor.pendingLargeSummaryUids ?? [])];
        const largeReadyBeforeTurn = smallCountSinceLarge >= settings.largeSummaryCount;
        const minimumInterval = Math.max(1, Math.min(settings.smallSummaryTurns, Number(settings.smallSummaryMinTurns || 5)));
        let smallRanThisTurn = false;
        let summaryWarning = '';
        try {
            const turnReady = turnsSinceSmall >= settings.smallSummaryTurns;
            const changeReady = turnsSinceSmall >= minimumInterval && criticalChangesSinceSmall >= settings.criticalChangesForSmall;
            const smallEligible = settings.autoSmallSummary !== false && (turnReady || changeReady) && smallSummaryRetryCooldown <= 0;
            if (smallEligible) {
                smallRanThisTurn = true;
                const reason = turnReady ? `达到${settings.smallSummaryTurns}轮` : `经过${turnsSinceSmall}轮并累计${criticalChangesSinceSmall}个关键变化回合`;
                this.progress('running', `${reason}，开始小总结与分发`, { titles: ['总结｜当前事件'], criticalChanges: criticalChangesSinceSmall });
                const beforeReceiptIds = this.currentReceiptIds();
                try {
                    const small = await this.summarize('small', settings, snapshot, { pendingUids: pendingSmallSummaryUids });
                    committed.push(small);
                    pendingSmallSummaryUids = subtractPendingUids(pendingSmallSummaryUids, resultResolvedSourceUids(small));
                    if (small.settled) {
                        turnsSinceSmall = 0;
                        criticalChangesSinceSmall = 0;
                        smallSummaryRetryCooldown = 0;
                        if (small.changed) {
                            smallCountSinceLarge += 1;
                            pendingLargeSummaryUids = mergePendingUids(pendingLargeSummaryUids, resultActiveChangedUids(small));
                        }
                    }
                    else {
                        // 未完成的总结可能已经安全写入一部分事实，但它不是一个“完成的小总结”。
                        // 保留工作集与累计证据，并用最小间隔做重试冷却，避免每正文回合重复请求。
                        smallSummaryRetryCooldown = minimumInterval;
                        summaryWarning = `小总结未完成结算，已保留待处理来源并延后${minimumInterval}个正文回合重试`;
                        this.progress('warning', summaryWarning, { titles: ['总结｜当前事件'], pendingSmallSummaryUids });
                    }
                }
                catch (error) {
                    await this.rollbackSummaryAttemptReceipts(settings, snapshot, beforeReceiptIds, '小总结');
                    smallSummaryRetryCooldown = minimumInterval;
                    summaryWarning = `小总结失败，正文提取已保留；${minimumInterval}个正文回合后重试：${(0, util_1.errorText)(error)}`;
                    this.progress('warning', summaryWarning, { titles: ['总结｜当前事件'], error: (0, util_1.errorText)(error) });
                }
            }
            // 小总结正处于失败/未结算冷却时，不允许大总结跨过这个未完成层级。
            const smallLayerBlocked = smallSummaryRetryCooldown > 0;
            if (settings.autoLargeSummary !== false && !smallRanThisTurn && !smallLayerBlocked && largeReadyBeforeTurn && largeSummaryRetryCooldown <= 0) {
                this.progress('running', `此前已累计${settings.largeSummaryCount}个已结算小总结，开始独立大总结、沉降与分发`, { titles: ['总结｜世界历史'] });
                const beforeReceiptIds = this.currentReceiptIds();
                try {
                    const large = await this.summarize('large', settings, snapshot, { pendingUids: pendingLargeSummaryUids });
                    committed.push(large);
                    pendingLargeSummaryUids = subtractPendingUids(pendingLargeSummaryUids, resultResolvedSourceUids(large));
                    if (large.settled) {
                        smallCountSinceLarge = 0;
                        largeSummaryRetryCooldown = 0;
                    }
                    else {
                        largeSummaryRetryCooldown = minimumInterval;
                        summaryWarning = `大总结未完成结算，已保留待处理来源并延后${minimumInterval}个正文回合重试`;
                        this.progress('warning', summaryWarning, { titles: ['总结｜世界历史'], pendingLargeSummaryUids });
                    }
                }
                catch (error) {
                    await this.rollbackSummaryAttemptReceipts(settings, snapshot, beforeReceiptIds, '大总结');
                    largeSummaryRetryCooldown = minimumInterval;
                    summaryWarning = `大总结失败，正文提取已保留；${minimumInterval}个正文回合后重试：${(0, util_1.errorText)(error)}`;
                    this.progress('warning', summaryWarning, { titles: ['总结｜世界历史'], error: (0, util_1.errorText)(error) });
                }
            }
            const nextCursor = {
                ...cursor,
                lastProcessedMessageKey: snapshot.messageKey,
                lastProcessedHash: snapshot.contentHash,
                turnsSinceSmall,
                criticalChangesSinceSmall,
                smallCountSinceLarge,
                smallSummaryRetryCooldown,
                largeSummaryRetryCooldown,
                pendingSmallSummaryUids,
                pendingLargeSummaryUids,
            };
            await this.host.saveCursor(nextCursor, snapshot, this.getSettings());
            await this.finalizeReceiptStates(committed, nextCursor);
            return { warning: summaryWarning, cursor: nextCursor };
        }
        catch (error) {
            await this.rollbackCommittedResults(settings, snapshot, committed, previousGameTime, cursor, error, '正文处理回合');
        }
    }
    currentReceiptIds() {
        if (typeof this.host.getCommitReceipts !== 'function') return new Set();
        return new Set((this.host.getCommitReceipts() ?? []).map((receipt) => String(receipt?.id ?? '')).filter(Boolean));
    }
    async rollbackSummaryAttemptReceipts(settings, snapshot, beforeIds, label) {
        if (typeof this.host.getCommitReceipts !== 'function' || typeof this.host.removeCommitReceipts !== 'function') return 0;
        const known = beforeIds instanceof Set ? beforeIds : new Set();
        const added = (this.host.getCommitReceipts() ?? []).filter((receipt) => {
            const id = String(receipt?.id ?? '');
            return id && !known.has(id) && (!receipt?.sourceKind || receipt.sourceKind === 'summary');
        });
        if (!added.length) return 0;
        const focusUid = typeof this.host.getFocusUid === 'function' ? this.host.getFocusUid() : '';
        try {
            await this.worldbook.rollbackReceipts(settings, added, focusUid, snapshot, () => this.validate(snapshot));
            await this.host.removeCommitReceipts(added.map((receipt) => String(receipt.id ?? '')).filter(Boolean));
            return added.length;
        }
        catch (error) {
            throw new Error(`${label}失败后的局部事务回滚失败：${(0, util_1.errorText)(error)}`);
        }
    }
    async finalizeReceiptStates(results, cursor) {
        const currentGameTime = typeof this.host.getCurrentGameTime === 'function' ? this.host.getCurrentGameTime() : null;
        for (const result of results ?? []) {
            if (!result?.receipt?.changes?.length || typeof this.host.appendCommitReceipt !== 'function') continue;
            result.receipt.stateAfter = { cursor: structuredClone(cursor), currentGameTime: structuredClone(currentGameTime) };
            await this.host.appendCommitReceipt(result.receipt);
        }
    }
    async rollbackCommittedResults(settings, snapshot, results, previousGameTime, previousCursor, cause, label) {
        const committed = (results ?? []).filter((item) => item?.receipt?.changes?.length);
        const receipts = committed.map((item) => item.receipt);
        const receiptIds = receipts.map((item) => String(item.id ?? '')).filter(Boolean);
        const failures = [];
        const recoverySnapshot = snapshot?.token?.cancelled
            ? this.host.captureMaintenanceSnapshot(settings, `${snapshot.taskType || 'task'}:rollback`, { cancelled: false, reason: '' })
            : snapshot;
        const focusUid = typeof this.host.getFocusUid === 'function' ? this.host.getFocusUid() : '';
        if (receipts.length) {
            let worldbookRestored = false;
            try {
                await this.worldbook.rollbackReceipts(settings, receipts, focusUid, recoverySnapshot, () => this.validate(recoverySnapshot));
                worldbookRestored = true;
            }
            catch (error) { failures.push(`世界书回滚失败：${(0, util_1.errorText)(error)}`); }
            if (worldbookRestored) {
                try { if (receiptIds.length && typeof this.host.removeCommitReceipts === 'function') await this.host.removeCommitReceipts(receiptIds); }
                catch (error) { failures.push(`回执清理失败：${(0, util_1.errorText)(error)}`); }
            }
        }
        try {
            if (previousCursor && typeof this.host.saveCursor === 'function') await this.host.saveCursor(previousCursor, recoverySnapshot, this.getSettings());
        }
        catch (error) { failures.push(`处理游标恢复失败：${(0, util_1.errorText)(error)}`); }
        try {
            if (typeof this.host.setCurrentGameTime === 'function') await this.host.setCurrentGameTime(previousGameTime, recoverySnapshot, this.getSettings());
        }
        catch (error) { failures.push(`游戏时间恢复失败：${(0, util_1.errorText)(error)}`); }
        if (failures.length) throw new Error(`${label}失败，且逆向恢复不完整：${(0, util_1.errorText)(cause)}；${failures.join('；')}`);
        throw new Error(`${label}失败，已回滚本回合世界书、回执、处理游标与游戏时间：${(0, util_1.errorText)(cause)}`);
    }
    async extract(settings, snapshot, options = {}) {
        if (settings.extractionEnabled === false) {
            this.setStatus(snapshot.chatKey, 'complete', '提取未启用');
            return { entries: [], changed: false };
        }
        this.setStatus(snapshot.chatKey, 'extracting', '提取事实与状态');
        this.validate(snapshot);
        const entries = await this.worldbook.list(settings, snapshot, () => this.validate(snapshot));
        this.validate(snapshot);
        const dialogueInput = [snapshot.dialogueContext, snapshot.turnText || `${snapshot.playerText}\n${snapshot.assistantText}`].filter(Boolean).join('\n\n');
        const prompt = (0, prompts_1.extractionPrompts)(settings, snapshot.playerText, snapshot.assistantText, entries, { dialogueContext: snapshot.dialogueContext, requestTime: snapshot.capturedAt, currentGameTime: this.host.getCurrentGameTime?.() || null });
        // [MA-MEMORY-01] 提取只通过通用请求模块调用模型；504 时改用更短的既有条目上下文重试一次。
        let raw = options.deterministicOnly === true ? 'EMPTY' : '';
        try {
            if (options.deterministicOnly !== true) raw = await (0, model_request_1.callModel)({
                host: this.host,
                stage: 'extraction',
                prompt,
                fallbackPrompt: () => (0, prompts_1.extractionPrompts)(settings, snapshot.playerText, snapshot.assistantText, entries, { compact: true, dialogueContext: snapshot.dialogueContext, requestTime: snapshot.capturedAt, currentGameTime: this.host.getCurrentGameTime?.() || null }),
                settings,
                snapshot,
                profileId: settings.extractionProfileId,
                sourceText: snapshot.turnText || snapshot.assistantText,
                onRetry: (error) => this.progress('running', (0, model_request_1.describeRetryReason)(error, '提取模型'), { titles: [], phase: 'extract' }),
            });
        }
        catch (error) {
            if (!isReasoningOrEmptyError(error) || !settings.extractionProfileId) throw error;
            this.progress('running', '提取模型连续只返回推理；切分正文并逐段提交最终协议', { titles: [], phase: 'extract' });
            raw = await segmentedExtractionRescue(this.host, settings, snapshot, entries, this.getSettings, (detail) => this.progress('running', detail, { titles: [], phase: 'extract' }));
        }
        this.validate(snapshot);
        let blocks = (0, parser_1.parseExtractionWithRecovery)(raw);
        let diagnostics = blocks.diagnostics ?? { repaired: 0, merged: [], skipped: [], warnings: [], hadInput: false };
        let repairRaw = '';
        if (!blocks.length && diagnostics.hadInput) {
            this.progress('running', '提取结果不是可识别的条目格式，启动一次格式修复', { titles: [], phase: 'extract' });
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
                onRetry: (error) => this.progress('running', (0, model_request_1.describeRetryReason)(error, '格式修复模型'), { titles: [], phase: 'extract' }),
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
        let explicitNone = /^(?:无|EMPTY)$/u.test(String(raw ?? '').trim());
        if (!blocks.length && explicitNone) {
            const deterministicBlocks = (0, governance_1.governInformationBlocks)([], entries, dialogueInput, { gameTimeEnabled: Boolean(this.host.getCurrentGameTime?.()?.label) }).blocks;
            if (deterministicBlocks.length) blocks = deterministicBlocks;
        }
        if (!blocks.length) {
            const skippedTitles = (diagnostics.skipped || []).map((item) => item.title || '异常片段');
            const detail = explicitNone ? '本轮明确返回“无”，世界书零写入' : `没有可安全提交的条目；已隔离${skippedTitles.length}个异常片段`;
            this.setStatus(snapshot.chatKey, 'matching', detail, '', repairRaw || raw, emptyPlan());
            this.progress(explicitNone ? 'success' : 'error', detail, { titles: [], created: [], updated: [], skipped: skippedTitles, repaired: diagnostics.repaired || 0, phase: 'extract' });
            if (!explicitNone) {
                const reasons = (diagnostics.skipped || []).map((item) => `${item.title || '异常片段'}：${item.reason || '协议不完整'}`).slice(0, 4).join('；');
                throw new Error(`提取未形成可识别的条目格式，世界书未写入且处理游标未推进${reasons ? `：${reasons}` : ''}`);
            }
            return { entries, changed: false, diagnostics };
        }
        const titles = blocks.map((block) => block.title);
        this.setStatus(snapshot.chatKey, 'matching', `已提取 ${titles.length} 个条目：${titles.join('、')}；格式修复${diagnostics.repaired || 0}处`, '', repairRaw || raw);
        this.progress('running', `已提取 ${titles.length} 个，正在匹配；修复${diagnostics.repaired || 0}处`, { phase: 'extract', titles, merged: diagnostics.merged || [], repaired: diagnostics.repaired || 0, skipped: (diagnostics.skipped || []).map((item) => item.title || '异常片段') });
        const plan = (0, operations_1.buildOperationPlan)(blocks, entries, settings, dialogueInput, { sourceKind: 'extraction', gameTimeEnabled: Boolean(this.host.getCurrentGameTime?.()?.label) });
        await this.resolveSemanticDuplicates(plan, entries, settings, snapshot);
        const created = [...new Set(plan.operations.filter((operation) => operation.kind === 'create-entry').map((operation) => operation.title))];
        const updated = [...new Set(plan.operations.filter((operation) => operation.kind !== 'create-entry' && operation.kind !== 'noop').map((operation) => operation.title))];
        const skipped = [...new Set([...(diagnostics.skipped || []).map((item) => item.title || '异常片段'), ...plan.operations.filter((operation) => operation.kind === 'noop').map((operation) => operation.title)])];
        this.progress('running', `准备写入：新建${created.length}、更新${updated.length}、合并${(diagnostics.merged || []).length}、修复${diagnostics.repaired || 0}、跳过${skipped.length}`, { phase: 'write', titles, created, updated, skipped, merged: diagnostics.merged || [], repaired: diagnostics.repaired || 0 });
        const result = await this.apply(settings, plan, snapshot, dialogueInput, '提取', raw);
        result.criticalChanges = (0, semantic_1.countCriticalChanges)(plan);
        const destination = result.worldbookName || snapshot.worldbookName || '当前绑定世界书';
        const actualCreated = result.warehouse?.created ?? [];
        const actualUpdated = result.warehouse?.updated ?? [];
        const actualDeleted = result.warehouse?.deleted ?? [];
        const businessWrites = actualCreated.length + actualUpdated.length + actualDeleted.length;
        const detail = businessWrites > 0
            ? `已写入世界书“${destination}”：新建${actualCreated.length}、更新${actualUpdated.length}、删除${actualDeleted.length}`
            : `世界书“${destination}”业务条目零写入`;
        this.progress('success', detail, { phase: 'write', titles, created: actualCreated, updated: actualUpdated, deleted: actualDeleted, skipped, merged: diagnostics.merged || [], repaired: diagnostics.repaired || 0, criticalChanges: result.criticalChanges, worldbookName: destination, businessWriteCount: businessWrites });
        return result;
    }
    async resolveSemanticDuplicates(plan, entries, settings, snapshot) {
        const byUid = new Map(entries.map((entry) => [String(entry.uid), entry]));
        let skipped = 0;
        for (const operation of plan.operations) {
            if (operation.kind !== 'append-line' || !operation.targetUid || !operation.section || !operation.newValue) continue;
            const entry = byUid.get(String(operation.targetUid));
            const oldLines = entry?.sections?.values?.[operation.section] ?? [];
            const threshold = /(固定事实|关键进展|已发生进展|持续经历|持续变化|世界变化|事件进程|近期经历|变化记录|历史事实)/u.test(operation.section) ? 0.93 : 0.86;
            const best = oldLines.reduce((score, oldValue) => distinctNumericFacts(oldValue, operation.newValue) ? score : Math.max(score, localSemanticSimilarity(oldValue, operation.newValue)), 0);
            if (best >= threshold) {
                operation.kind = 'noop';
                operation.operation = 'no-op';
                operation.reason = `本地语义解析器判定与已有事实相似度 ${(best * 100).toFixed(0)}%，跳过追加`;
                skipped += 1;
            }
        }
        if (skipped) this.setStatus(snapshot.chatKey, 'matching', `本地语义解析器跳过 ${skipped} 条重复事实`);
    }
    async summarize(kind, settings, snapshot, options = {}) {
        const label = kind === 'small' ? '小总结' : '大总结';
        this.setStatus(snapshot.chatKey, kind === 'small' ? 'small-summary' : 'large-summary', label);
        this.validate(snapshot);
        const entries = await this.worldbook.list(settings, snapshot, () => this.validate(snapshot));
        this.validate(snapshot);
        const cursor = this.host.cursor();
        const previousGameTime = typeof this.host.getCurrentGameTime === 'function' ? this.host.getCurrentGameTime() : null;
        const pendingUids = Array.isArray(options.pendingUids)
            ? options.pendingUids
            : (kind === 'small' ? cursor.pendingSmallSummaryUids : cursor.pendingLargeSummaryUids);
        const requestedPendingUids = [...new Set((pendingUids ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean))];
        const existingUids = new Set(entries.map((entry) => String(entry.uid)));
        const stalePendingUids = requestedPendingUids.filter((uid) => !existingUids.has(uid));
        const validPendingUids = requestedPendingUids.filter((uid) => existingUids.has(uid));
        if (requestedPendingUids.length && !validPendingUids.length) {
            const detail = `${label}已停止：待总结工作集中的${stalePendingUids.length}个 UID 已不存在；未回退处理其他近期条目`;
            this.setStatus(snapshot.chatKey, kind === 'small' ? 'small-summary' : 'large-summary', detail, '', '', emptyPlan());
            this.progress('success', detail, { titles: [], skipped: stalePendingUids });
            return { entries, changed: false, settled: true, previousGameTime, stalePendingUids, resolvedSourceUids: stalePendingUids, processedPendingUids: [] };
        }
        const selected = summaryEntries(kind, entries, snapshot, validPendingUids);
        const scope = summaryScope(kind, selected, validPendingUids);
        const expectedTitle = kind === 'small' ? '总结｜当前事件' : '总结｜世界历史';
        const recentConversation = kind === 'small'
            ? (typeof this.host.recentConversation === 'function'
                ? this.host.recentConversation(snapshot, settings.smallSummaryTurns)
                : `${snapshot.playerText || ''}\n${snapshot.assistantText || ''}`.trim())
            : '';
        const prompt = (0, prompts_1.summaryPrompts)(kind, settings, selected, scope, recentConversation, { pendingUids: validPendingUids, allEntries: entries, requestTime: snapshot.capturedAt, currentGameTime: this.host.getCurrentGameTime?.() || null });
        const profile = kind === 'small' ? settings.smallSummaryProfileId : settings.largeSummaryProfileId;
        const raw = await (0, model_request_1.callModel)({
            host: this.host,
            stage: kind === 'small' ? 'smallSummary' : 'largeSummary',
            prompt,
            fallbackPrompt: () => (0, prompts_1.summaryPrompts)(kind, settings, selected, scope, recentConversation, { compact: true, pendingUids: validPendingUids, allEntries: entries, requestTime: snapshot.capturedAt, currentGameTime: this.host.getCurrentGameTime?.() || null }),
            settings,
            snapshot,
            profileId: profile,
            sourceText: recentConversation,
            onRetry: (error) => this.progress('running', (0, model_request_1.describeRetryReason)(error, `${label}模型`), { titles: [expectedTitle], phase: 'extract' }),
        });
        this.validate(snapshot);
        let effectiveRaw = raw;
        let protocol = inspectSummaryProtocol(effectiveRaw, kind, selected, validPendingUids);
        const repairSummaryCandidate = async (candidateRaw, candidateProtocol, candidateSelected, candidatePendingUids, phaseDetail) => {
            this.progress('running', phaseDetail, { titles: [expectedTitle], phase: 'format-repair', error: candidateProtocol.error });
            const pendingSources = candidateSelected.filter((entry) => candidatePendingUids.includes(String(entry.uid))).map((entry) => entry.title);
            const repairPrompt = (0, prompts_1.summaryRepairPrompts)(candidateRaw, kind, pendingSources, candidateProtocol.error);
            const repairedRaw = await (0, model_request_1.callModel)({
                host: this.host,
                stage: 'summaryRepair',
                prompt: repairPrompt,
                fallbackPrompt: () => (0, prompts_1.summaryRepairPrompts)(candidateRaw, kind, pendingSources, candidateProtocol.error, { compact: true }),
                settings,
                snapshot,
                profileId: profile,
                sourceText: candidateRaw,
                responseTokens: kind === 'small' ? 4096 : 6144,
                onRetry: (error) => this.progress('running', (0, model_request_1.describeRetryReason)(error, `${label}格式修复模型`), { titles: [expectedTitle], phase: 'format-repair' }),
            });
            this.validate(snapshot);
            const repairedProtocol = inspectSummaryProtocol(repairedRaw, kind, candidateSelected, candidatePendingUids);
            const preservation = summaryRepairPreservesSemantics(candidateRaw, repairedProtocol);
            if (!preservation.ok) throw new Error(`${label}固定格式修复被拒绝：修复结果改变或补写了原返回语义（${preservation.issues.slice(0, 3).join('；')}）`);
            return { raw: repairedRaw, protocol: repairedProtocol };
        };
        const unresolvedOnly = protocol.unresolvedPendingUids?.length > 0
            && protocol.recovered?.block
            && !(protocol.historyPlan?.invalidLines?.length);
        if (!protocol.ok && !protocol.explicitNone && !unresolvedOnly) {
            const repaired = await repairSummaryCandidate(effectiveRaw, protocol, selected, validPendingUids, `${label}固定格式校验失败，正在执行一次只改格式的专用恢复`);
            effectiveRaw = repaired.raw;
            protocol = repaired.protocol;
            if (!protocol.ok && !protocol.unresolvedPendingUids?.length) throw new Error(`${label}固定格式修复失败：${protocol.error}`);
            this.progress('running', `${label}已通过专用请求恢复固定协议格式`, { titles: [expectedTitle], phase: 'format-repair' });
        }
        // ui.63: 遗漏来源属于语义任务未完成，不允许格式修复器擅自补结论。
        // 只对遗漏来源分批追加带完整来源上下文的定向总结请求，再与首轮协议合并。
        if (!protocol.ok && protocol.unresolvedPendingUids?.length) {
            const missingPendingUids = [...protocol.unresolvedPendingUids];
            const completionBatchSize = kind === 'small' ? 10 : 8;
            const completionRaws = [];
            this.progress('running', `${label}主返回遗漏${missingPendingUids.length}个来源，正在分批定向补齐`, { titles: [expectedTitle], phase: 'source-completion', unresolvedPendingUids: missingPendingUids });
            for (let offset = 0; offset < missingPendingUids.length; offset += completionBatchSize) {
                const batchUids = missingPendingUids.slice(offset, offset + completionBatchSize);
                const missingSelected = summaryEntries(kind, entries, snapshot, batchUids);
                const missingSelectedUids = new Set(missingSelected.map((entry) => String(entry.uid)));
                const internallyMissing = batchUids.filter((uid) => !missingSelectedUids.has(String(uid)));
                if (internallyMissing.length) throw new Error(`${label}内部工作集不完整：${internallyMissing.length}个遗漏来源未进入定向补齐上下文`);
                const missingScope = summaryScope(kind, missingSelected, batchUids);
                const missingPrompt = (0, prompts_1.summaryPrompts)(kind, settings, missingSelected, missingScope, recentConversation, { pendingUids: batchUids, allEntries: entries, requestTime: snapshot.capturedAt, currentGameTime: this.host.getCurrentGameTime?.() || null });
                let completionRaw = await (0, model_request_1.callModel)({
                    host: this.host,
                    stage: kind === 'small' ? 'smallSummary' : 'largeSummary',
                    prompt: missingPrompt,
                    fallbackPrompt: () => (0, prompts_1.summaryPrompts)(kind, settings, missingSelected, missingScope, recentConversation, { compact: true, pendingUids: batchUids, allEntries: entries, requestTime: snapshot.capturedAt, currentGameTime: this.host.getCurrentGameTime?.() || null }),
                    settings,
                    snapshot,
                    profileId: profile,
                    sourceText: recentConversation,
                    onRetry: (error) => this.progress('running', (0, model_request_1.describeRetryReason)(error, `${label}遗漏来源补齐模型`), { titles: [expectedTitle], phase: 'source-completion' }),
                });
                this.validate(snapshot);
                let completionProtocol = inspectSummaryProtocol(completionRaw, kind, missingSelected, batchUids);
                const completionUnresolvedOnly = completionProtocol.unresolvedPendingUids?.length > 0
                    && completionProtocol.recovered?.block
                    && !(completionProtocol.historyPlan?.invalidLines?.length);
                if (!completionProtocol.ok && !completionProtocol.explicitNone && !completionUnresolvedOnly) {
                    const repairedCompletion = await repairSummaryCandidate(completionRaw, completionProtocol, missingSelected, batchUids, `${label}遗漏来源补齐结果格式不合格，正在只改格式`);
                    completionRaw = repairedCompletion.raw;
                    completionProtocol = repairedCompletion.protocol;
                }
                if (!completionProtocol.ok) throw new Error(`${label}遗漏来源补齐失败：${completionProtocol.error}`);
                completionRaws.push(completionRaw.trim());
                this.progress('running', `${label}已补齐遗漏来源 ${Math.min(offset + batchUids.length, missingPendingUids.length)}/${missingPendingUids.length}`, { titles: [expectedTitle], phase: 'source-completion', resolvedPendingUids: batchUids });
            }
            effectiveRaw = [effectiveRaw.trim(), ...completionRaws].filter(Boolean).join('\n\n').trim();
            protocol = inspectSummaryProtocol(effectiveRaw, kind, selected, validPendingUids);
            if (!protocol.ok) throw new Error(`${label}遗漏来源补齐后协议仍不完整：${protocol.error}`);
            this.progress('running', `${label}已补齐全部遗漏来源`, { titles: [expectedTitle], phase: 'source-completion', resolvedPendingUids: missingPendingUids });
        }
        if (!protocol.ok) {
            if (protocol.explicitNone && !validPendingUids.length) return { entries, changed: false, settled: true, previousGameTime, stalePendingUids, resolvedSourceUids: stalePendingUids, processedPendingUids: [] };
            throw new Error(protocol.error);
        }
        const { recovered, summaryBlock, historyPlan } = protocol;
        if (recovered.repaired) this.progress('running', `${label}已本地归一化${recovered.repaired}处表面格式`, { titles: [expectedTitle], repaired: recovered.repaired, skipped: recovered.skipped });
        if (historyPlan.guardRetainedSourceUids?.length) {
            const titles = (historyPlan.guardRetentionReasons ?? []).map((item) => item.sourceTitle).filter(Boolean);
            this.progress('warning', `${label}有${historyPlan.guardRetainedSourceUids.length}个来源已给出“吸收”，但删除被安全闸门拦截；将保留来源并在分发事实回读成功后完成本期结算`, { titles, guardRetainedSourceUids: historyPlan.guardRetainedSourceUids, guardRetentionReasons: historyPlan.guardRetentionReasons });
        }
        if (!historyPlan.distributionBlocks.length && !historyPlan.absorptionOperations.length) {
            const resolvedSourceUids = [...new Set([...historyPlan.directCompletionUids, ...stalePendingUids])];
            const detail = `${label}已完成确定性判断：${historyPlan.directCompletionUids.length}个来源保留完成，无需修改世界书`;
            this.setStatus(snapshot.chatKey, kind === 'small' ? 'small-summary' : 'large-summary', detail, '', effectiveRaw, emptyPlan());
            this.progress('success', detail, { titles: [], resolvedSourceUids });
            return { entries, changed: false, settled: true, previousGameTime, stalePendingUids, resolvedSourceUids, processedPendingUids: validPendingUids, warehouse: { created: [], updated: [], deleted: [] } };
        }
        const sourceContext = selected.map((entry) => `${entry.title}\n${entry.content}`).join('\n');
        // ui.61: “总结”只作为模型协议包；每个 pending 来源必须得到吸收或保留完成的确定结论。
        const plan = (0, operations_1.buildOperationPlan)(historyPlan.distributionBlocks, entries, settings, sourceContext, { sourceKind: 'summary', cleanupTemporaryAfterSummary: false, consumeSmallSummaryAfterLarge: false, compactEventProgressFromSummary: true, gameTimeEnabled: Boolean(this.host.getCurrentGameTime?.()?.label) });
        plan.operations.push(...historyPlan.absorptionOperations);
        const summaryText = historyPlan.records.filter((record) => record.directCompletion !== true).map((record) => `${record.sourceTitle}→${record.targetTitle}【${record.section}】${record.fact}`).join('\n');
        if (!plan.operations.some((operation) => operation.kind !== 'noop')) {
            const completedUids = resolvedHistoricalSourceUids({ entries, warehouse: { created: [], updated: [], deleted: [] } }, historyPlan.completionProofs);
            const resolvedSourceUids = [...new Set([...completedUids, ...historyPlan.directCompletionUids, ...stalePendingUids])];
            const unresolvedAfterProof = validPendingUids.filter((uid) => !resolvedSourceUids.includes(String(uid)));
            if (unresolvedAfterProof.length) throw new Error(`${label}结算证明不足：${unresolvedAfterProof.length}个来源的目标事实未通过权威回读`);
            const detail = `${label}已幂等完成确定性结算，无需重复写入世界书`;
            this.setStatus(snapshot.chatKey, kind === 'small' ? 'small-summary' : 'large-summary', detail, '', effectiveRaw, plan);
            this.progress('success', detail, { titles: historyPlan.distributionBlocks.map((block) => block.title), resolvedSourceUids });
            return { entries, changed: false, settled: true, previousGameTime, stalePendingUids, resolvedSourceUids, processedPendingUids: validPendingUids, warehouse: { created: [], updated: [], deleted: [] } };
        }
        const applied = await this.apply(settings, plan, snapshot, sourceContext, label, effectiveRaw, { rebalanceKind: kind, summaryText });
        const remainingUids = new Set((applied.entries ?? []).map((entry) => String(entry.uid)));
        const absorbedUids = historyPlan.absorptionOperations.map((operation) => String(operation.targetUid ?? '')).filter((uid) => uid && !remainingUids.has(uid));
        const completedUids = resolvedHistoricalSourceUids(applied, historyPlan.completionProofs);
        applied.resolvedSourceUids = [...new Set([...absorbedUids, ...completedUids, ...historyPlan.directCompletionUids, ...stalePendingUids])];
        applied.updatedWorkingUids = completedUids;
        applied.settled = validPendingUids.every((uid) => applied.resolvedSourceUids.includes(String(uid)));
        if (!applied.settled) this.progress('warning', `${label}有来源未通过最终退出或完成证明，已继续保留在待处理工作集`, { unresolvedSourceUids: validPendingUids.filter((uid) => !applied.resolvedSourceUids.includes(String(uid))) });
        applied.stalePendingUids = stalePendingUids;
        applied.processedPendingUids = validPendingUids;
        this.progress('running', `${label}已完成逐来源历史分发，正在重算召回状态`, { titles: historyPlan.distributionBlocks.map((block) => block.title), resolvedSourceUids: applied.resolvedSourceUids });
        return applied;

    }
    async apply(settings, plan, snapshot, contextText, label, raw, options = {}) {
        this.setStatus(snapshot.chatKey, 'matching', `${label}生成确定性操作计划`, '', raw, plan);
        if (!plan.operations.some((operation) => operation.kind !== 'noop')) return {
            entries: [], changed: false, businessChanged: false,
            worldbookName: snapshot.worldbookName || '',
            warehouse: { created: [], updated: [], deleted: [], createdCount: 0, updatedCount: 0, deletedCount: 0, operationCount: 0 },
        };
        this.setStatus(snapshot.chatKey, 'worldbook', `${label}通过唯一提交器写入世界书`, '', raw, plan);
        this.validate(snapshot);
        const focusUid = typeof this.host.getFocusUid === 'function' ? this.host.getFocusUid() : '';
        const previousCursor = typeof this.host.cursor === 'function' ? this.host.cursor() : null;
        const previousGameTime = typeof this.host.getCurrentGameTime === 'function' ? this.host.getCurrentGameTime() : null;
        // ui.68: 游戏时间由玩家为当前聊天提供锚点，并由提取模型显式推进；插件不从正文机械推算时间。
        const gameTimeEnabled = Boolean(previousGameTime?.label);
        const nextGameTime = label === '提取' && gameTimeEnabled
            ? (0, governance_1.deriveCurrentGameTime)(plan.blocks, previousGameTime, '')
            : (previousGameTime ? structuredClone(previousGameTime) : null);
        const entries = await this.worldbook.apply(settings, plan, snapshot.messageKey, contextText, focusUid, snapshot, () => this.validate(snapshot), { sourceKind: label === '提取' ? 'extraction' : 'summary', currentGameTime: nextGameTime, ...options });
        this.validate(snapshot);
        let receiptSaved = false;
        if (entries.receipt && typeof this.host.appendCommitReceipt === 'function') {
            entries.receipt.stateBefore = { cursor: structuredClone(previousCursor), currentGameTime: structuredClone(previousGameTime) };
            try { await this.host.appendCommitReceipt(entries.receipt); receiptSaved = true; }
            catch (error) {
                try {
                    await this.worldbook.rollbackReceipts(settings, [entries.receipt], focusUid, snapshot, () => this.validate(snapshot));
                }
                catch (rollbackError) {
                    throw new Error(`提交回执保存失败，且世界书自动回滚失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackError)}`);
                }
                throw new Error(`提交回执保存失败，世界书已自动恢复提交前状态：${(0, util_1.errorText)(error)}`);
            }
        }
        try {
            if (typeof this.host.setCurrentGameTime === 'function') await this.host.setCurrentGameTime(nextGameTime, snapshot, this.getSettings());
        }
        catch (error) {
            const failures = [];
            let worldbookRestored = !entries.receipt;
            if (entries.receipt) {
                try {
                    await this.worldbook.rollbackReceipts(settings, [entries.receipt], focusUid, snapshot, () => this.validate(snapshot));
                    worldbookRestored = true;
                }
                catch (rollbackError) {
                    failures.push(`世界书回滚失败：${(0, util_1.errorText)(rollbackError)}`);
                }
            }
            if (worldbookRestored && receiptSaved && typeof this.host.removeCommitReceipts === 'function') {
                try { await this.host.removeCommitReceipts([entries.receipt.id]); }
                catch (receiptError) { failures.push(`回执清理失败：${(0, util_1.errorText)(receiptError)}`); }
            }
            if (failures.length)
                throw new Error(`当前游戏时间保存失败，且逆向恢复不完整：${(0, util_1.errorText)(error)}；${failures.join('；')}`);
            throw new Error(`当前游戏时间保存失败，世界书与回执已恢复提交前状态：${(0, util_1.errorText)(error)}`);
        }
        return {
            entries,
            changed: entries.changed === true,
            businessChanged: entries.businessChanged === true,
            worldbookName: entries.worldbookName || snapshot.worldbookName || '',
            warehouse: entries.warehouse ?? { created: [], updated: [], deleted: [], createdCount: 0, updatedCount: 0, deletedCount: 0, operationCount: 0 },
            receipt: entries.receipt ?? null,
            currentGameTime: nextGameTime,
            previousGameTime,
        };
    }
    validate(snapshot) { this.host.assertSnapshot(snapshot, this.getSettings()); }
    setStatus(chatKey, phase, detail, error = '', rawResult = '', plan = null) {
        const previous = this.statusByChat.get(chatKey) ?? {};
        this.statusByChat.set(chatKey, { phase, detail, error, rawResult: rawResult || previous.rawResult || '', plan: plan ?? previous.plan ?? null });
    }
}
exports.MemoryRunner = MemoryRunner;

function taskResultEntries(result) {
    const entries = Array.isArray(result?.entries) ? result.entries : [];
    entries.changed = result?.changed === true;
    entries.businessChanged = result?.businessChanged === true;
    entries.worldbookName = String(result?.worldbookName ?? entries.worldbookName ?? '');
    entries.warehouse = result?.warehouse ?? entries.warehouse ?? { created: [], updated: [], deleted: [], createdCount: 0, updatedCount: 0, deletedCount: 0, operationCount: 0 };
    entries.criticalChanges = Number(result?.criticalChanges || 0);
    return entries;
}

function resultChangedUids(result) {
    return [...new Set((result?.receipt?.changes ?? []).map((change) => String(change?.uid ?? '').trim()).filter(Boolean))];
}
function resultActiveChangedUids(result) {
    const active = new Set((result?.entries ?? [])
        .filter((entry) => !/^总结｜/u.test(String(entry?.title ?? '')))
        .map((entry) => String(entry?.uid ?? '').trim())
        .filter(Boolean));
    return resultChangedUids(result).filter((uid) => active.has(uid));
}
function resultResolvedSourceUids(result) {
    return [...new Set([...(result?.resolvedSourceUids ?? []), ...(result?.stalePendingUids ?? [])].map((uid) => String(uid ?? '').trim()).filter(Boolean))];
}
function subtractPendingUids(source, resolved) {
    const removed = new Set((resolved ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean));
    return [...new Set((source ?? []).map((uid) => String(uid ?? '').trim()).filter((uid) => uid && !removed.has(uid)))];
}
function mergePendingUids(left, right) {
    // ui.61: pending 是尚未完成确定性结算的工作集，禁止因容量上限静默丢弃旧 UID。
    return [...new Set([...(left ?? []), ...(right ?? [])].map((item) => String(item ?? '').trim()).filter(Boolean))];
}

function ensureSummarySnapshotSections(block, kind) {
    const output = structuredClone(block);
    const aliases = kind === 'small'
        ? {
            '关键进展': '已发生进展', '当前进展': '已发生进展', '当前情况': '已发生进展', '关键状态': '已发生进展',
            '未形成进展': '未发生进展', '未解决事项': '未发生进展', '待处理事项': '未发生进展',
            '持续影响': '稳定影响', '逐来源分发': '历史分发', '来源分发': '历史分发', '颗粒度分发': '历史分发',
            '升阶来源': '吸收来源', '来源升阶': '吸收来源', '合并来源': '吸收来源',
        }
        : {
            '长期结果': '长期变化', '重要事件': '重要事件结果', '事件结果': '重要事件结果',
            '关系变化': '长期关系', '世界影响': '稳定世界影响',
            '逐来源分发': '历史分发', '来源分发': '历史分发', '颗粒度分发': '历史分发',
            '升阶来源': '吸收来源', '来源升阶': '吸收来源', '合并来源': '吸收来源',
        };
    const merged = new Map();
    for (const section of output.sections ?? []) {
        const name = aliases[String(section.name ?? '').trim()] ?? String(section.name ?? '').trim();
        if (!name) continue;
        const current = merged.get(name) ?? { name, lines: [], empty: true };
        current.lines = (0, util_1.unique)([...(current.lines ?? []), ...(section.lines ?? [])]);
        current.empty = current.lines.length === 0;
        merged.set(name, current);
    }
    output.sections = [...merged.values()];
    return output;
}

function summarySnapshotHasFacts(block, kind) {
    const history = block.sections?.find((section) => section.name === '历史分发');
    if (history?.lines?.some((line) => parseHistoricalDistributionLine(line))) return true;
    const legacyDistribution = distributionBlocksFromSummary(block);
    if (legacyDistribution.length) return true;
    const expected = new Set(kind === 'small'
        ? ['已发生进展', '未发生进展', '稳定影响']
        : ['长期变化', '重要事件结果', '长期关系', '稳定世界影响']);
    return (block.sections ?? []).some((section) => expected.has(section.name) && (section.lines ?? []).some((line) => {
        const text = String(line ?? '').trim();
        return text && !/^(?:无|没有|暂无)$/u.test(text);
    }));
}

function summaryEntries(kind, entries, snapshot, pendingUids = []) {
    const active = entries.filter((entry) => !entry.activation.disabled);
    const pending = new Set((pendingUids ?? []).map((uid) => String(uid ?? '')).filter(Boolean));
    if (kind === 'small') {
        const candidates = active.filter((entry) => entry.title !== '总结｜世界历史');
        const currentSummary = candidates.filter((entry) => entry.title === '总结｜当前事件');
        let changed = candidates.filter((entry) => pending.has(String(entry.uid)) && entry.title !== '总结｜当前事件');
        if (!changed.length && !pending.size) {
            changed = candidates.filter((entry) => entry.title !== '总结｜当前事件')
                .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0)).slice(0, 16);
        }
        const changedText = changed.map((entry) => `${entry.title}\n${entry.content}`).join('\n\n');
        const context = [changedText, snapshot.playerText, snapshot.assistantText].filter(Boolean).join('\n\n');
        const related = (0, matcher_1.relevantEntries)(candidates.filter((entry) => !pending.has(String(entry.uid)) && entry.title !== '总结｜当前事件'), context, 28);
        const required = [...new Map([...currentSummary, ...changed].map((entry) => [entry.uid, entry])).values()];
        const relatedBudget = Math.max(0, 48 - required.length);
        // ui.63: pending 来源属于强制工作集，不能被关联条目数量上限挤出。
        return [...required, ...related.filter((entry) => !required.some((item) => item.uid === entry.uid)).slice(0, relatedBudget)];
    }
    const currentWorldHistory = active.filter((entry) => entry.title === '总结｜世界历史');
    const currentEvent = active.filter((entry) => entry.title === '总结｜当前事件');
    const requiredUids = new Set([...currentWorldHistory, ...currentEvent].map((entry) => entry.uid));
    let changed = active.filter((entry) => pending.has(String(entry.uid)) && !requiredUids.has(entry.uid));
    if (!changed.length && !pending.size) {
        changed = active.filter(hasStableSummaryMaterial).filter((entry) => !requiredUids.has(entry.uid))
            .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0)).slice(0, 40);
    }
    const changedText = changed.map((entry) => `${entry.title}\n${entry.content}`).join('\n\n');
    const relatedStable = (0, matcher_1.relevantEntries)(active.filter(hasStableSummaryMaterial).filter((entry) => !requiredUids.has(entry.uid) && !pending.has(String(entry.uid))), changedText || '长期稳定结果', 28);
    const required = [...new Map([...currentWorldHistory, ...currentEvent, ...changed].map((entry) => [entry.uid, entry])).values()];
    const relatedBudget = Math.max(0, 72 - required.length);
    // ui.63: 大总结必须保留全部 pending 来源；只裁剪关联上下文。
    return [...required, ...relatedStable.filter((entry) => !required.some((item) => item.uid === entry.uid)).slice(0, relatedBudget)];
}
function hasStableSummaryMaterial(entry) {
    const values = entry?.sections?.values ?? {};
    if (entry.type === '事件') return (values['结果'] ?? []).length > 0 || (values['已发生进展'] ?? []).length > 0;
    if (entry.type === '人物' || entry.type === '角色') return ['身份', '稳定', '行为倾向', '性格核心', '表达方式', '决策倾向', '关系立场', '关系', '固定事实'].some((section) => (values[section] ?? []).length > 0);
    if (entry.type === '场景' || entry.type === '时空') return ['定义', '空间结构', '固定资源', '固定事实', '世界影响'].some((section) => (values[section] ?? []).length > 0);
    if (entry.type === '物品') return ['定义', '功能', '限制', '固定事实', '当前'].some((section) => (values[section] ?? []).length > 0);
    return /^(世界|全局变化|基础设定)$/u.test(entry.type);
}
function summaryScope(kind, entries, pendingUids = []) {
    const count = new Set((pendingUids ?? []).map((uid) => String(uid ?? '')).filter(Boolean)).size;
    if (kind === 'small') return count ? `上次小总结后实际变更的${count}个世界书条目` : '近期实际变更的世界书条目';
    return count ? `最近若干次小总结后实际变更的${count}个运行条目` : '已经整理并趋于稳定的运行条目';
}
function distributionBlocksFromSummary(summaryBlock) {
    const section = summaryBlock.sections.find((item) => /^(分发事实|沉降分发)$/u.test(item.name));
    if (!section || section.empty) return [];
    const blocks = new Map();
    for (const line of section.lines) {
        const match = String(line ?? '').match(/^\s*(人物|角色|场景|地点|物品|事件|世界|全局变化|基础设定|世界设定)\s*[｜|丨]\s*([^｜|丨]+?)\s*[｜|丨]\s*([^｜|丨]+?)\s*[｜|丨]\s*(.+)$/u);
        if (!match) continue;
        const type = (0, parser_1.canonicalExtractionType)(match[1].trim());
        const name = match[2].trim();
        const sectionName = (0, information_point_1.canonicalSectionName)(match[3].trim(), type);
        const fact = match[4].trim();
        if (!name || !sectionName || !fact) continue;
        const explicitEmpty = /^(?:无|没有)$/u.test(fact);
        if (explicitEmpty && !(type === '事件' && sectionName === '未发生进展')) continue;
        mergeDistributionBlock(blocks, { targetType: type, targetName: name, targetTitle: `${type}｜${name}`, section: sectionName, fact, explicitEmpty });
    }
    return [...blocks.values()];
}
function personNeedsPersonalityAbstraction(entry) {
    if (!entry || !/^(?:人物|角色|NPC)$/u.test(String(entry.type ?? ''))) return false;
    const values = entry.sections?.values ?? {};
    const hasTendency = (values['行为倾向'] ?? []).some((line) => String(line ?? '').trim());
    const hasStable = ['性格核心', '表达方式', '决策倾向'].some((section) => (values[section] ?? []).some((line) => String(line ?? '').trim()));
    return hasTendency && !hasStable;
}
function groupHasPersonalityAbstraction(group) {
    if (!group?.source) return false;
    const sourceKey = historySourceIdentityKey('人物', group.source.name);
    return group.records.some((record) => record.directCompletion !== true
        && canonicalHistoryType(record.targetType) === '人物'
        && historySourceIdentityKey('人物', record.targetName) === sourceKey
        && /^(?:性格核心|表达方式|决策倾向)$/u.test(String(record.section ?? ''))
        && String(record.fact ?? '').trim());
}

function historicalDistributionPlan(summaryBlock, selectedEntries, options = {}) {
    const kind = options.kind === 'large' ? 'large' : 'small';
    const pending = new Set((options.pendingUids ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean));
    const selected = selectedEntries ?? [];
    const selectedByTitle = new Map();
    const selectedByIdentity = new Map();
    const registerCandidate = (map, key, entry) => {
        if (!key) return;
        const group = map.get(key) ?? [];
        if (!group.some((item) => String(item.uid) === String(entry.uid))) group.push(entry);
        map.set(key, group);
    };
    const registerIdentity = (entry, type, name) => registerCandidate(selectedByIdentity, historySourceIdentityKey(type, name), entry);
    for (const entry of selected) {
        registerCandidate(selectedByTitle, (0, util_1.normalizeTitle)(entry.title), entry);
        const canonicalType = canonicalHistoryType(entry.type);
        const canonicalName = String(entry.name ?? '').trim();
        if (canonicalType && canonicalName) {
            registerCandidate(selectedByTitle, (0, util_1.normalizeTitle)(`${canonicalType}｜${canonicalName}`), entry);
            registerIdentity(entry, canonicalType, canonicalName);
        }
        for (const alias of [...(entry.aliases ?? []), ...(entry.keywords ?? [])]) registerIdentity(entry, canonicalType, alias);
    }
    const eligibleSource = (entry) => {
        if (!entry || entry.managed !== true) return false;
        if (/^总结｜(?:当前事件|世界历史)$/u.test(String(entry.title ?? ''))) return true;
        return pending.has(String(entry.uid));
    };
    const uniqueEligible = (candidates) => {
        const eligible = (candidates ?? []).filter(eligibleSource);
        return eligible.length === 1 ? eligible[0] : null;
    };
    const resolveSelectedSource = (record) => {
        const exact = uniqueEligible(selectedByTitle.get((0, util_1.normalizeTitle)(record.sourceTitle)));
        if (exact) return exact;
        return uniqueEligible(selectedByIdentity.get(historySourceIdentityKey(record.sourceType, record.sourceName)));
    };
    const sourceMayExit = (entry) => {
        if (!entry || entry.locked === true || entry.focus === true || entry.activation?.disabled === true) return false;
        if (entry.type === '场景' && (entry.sceneStage === 'current' || entry.semanticRole === 'scene-current')) return false;
        return true;
    };
    const historySection = summaryBlock.sections.find((section) => section.name === '历史分发');
    const records = [];
    const invalidLines = [];
    const unmatchedSourceTitles = [];
    for (const raw of historySection?.lines ?? []) {
        const text = String(raw ?? '').trim();
        if (!text || /^(?:无|没有|暂无)$/u.test(text)) continue;
        const record = parseHistoricalDistributionLine(raw);
        if (!record) { invalidLines.push(text); continue; }
        const source = resolveSelectedSource(record);
        if (!eligibleSource(source)) {
            unmatchedSourceTitles.push(record.sourceTitle);
            continue;
        }
        if (record.directCompletion === true) {
            records.push({ ...record, section: '', explicitEmpty: false, sourceUid: String(source.uid), sourceType: canonicalHistoryType(source.type), sourceEntry: source });
            continue;
        }
        const targetSection = (0, information_point_1.canonicalSectionName)(record.section, record.targetType);
        const explicitEmpty = /^(?:无|没有)$/u.test(record.fact);
        if (!targetSection || !record.fact || (explicitEmpty && !(record.targetType === '事件' && targetSection === '未发生进展'))) continue;
        records.push({ ...record, section: targetSection, explicitEmpty, sourceUid: String(source.uid), sourceType: canonicalHistoryType(source.type), sourceEntry: source });
    }
    if (!records.length) {
        if (historySection) return { records: [], distributionBlocks: [], absorptionOperations: [], completionProofs: [], directCompletionUids: [], settledSourceUids: [], guardRetainedSourceUids: [], guardRetentionReasons: [], invalidLines, unmatchedSourceTitles: (0, util_1.unique)(unmatchedSourceTitles) };
        const distributionBlocks = distributionBlocksFromSummary(summaryBlock);
        // 旧协议缺少逐来源事实绑定，只兼容事实写入，不再允许据此删除来源。
        return { records: [], distributionBlocks, absorptionOperations: [], completionProofs: [], directCompletionUids: [], settledSourceUids: [], guardRetainedSourceUids: [], guardRetentionReasons: [], invalidLines: [], unmatchedSourceTitles: [] };
    }
    const grouped = new Map();
    for (const record of records) {
        const group = grouped.get(record.sourceUid) ?? { source: record.sourceEntry, records: [], dispositions: new Set() };
        group.records.push(record); group.dispositions.add(record.disposition); grouped.set(record.sourceUid, group);
    }
    const validGroups = [...grouped.values()].filter((group) => {
        if (group.dispositions.size !== 1) return false;
        // ui.66: 【行为倾向】就是小总结已经完成的抽象证据层。大总结遇到尚无稳定性格栏的人物时，
        // 必须至少生成一条性格核心/表达方式/决策倾向，不能用短格式“保留完成”永久跳过人格固化。
        if (kind === 'large' && personNeedsPersonalityAbstraction(group.source) && !groupHasPersonalityAbstraction(group)) {
            unmatchedSourceTitles.push(group.source.title);
            return false;
        }
        return true;
    });
    const validRecords = validGroups.flatMap((group) => group.records);
    const blocks = new Map();
    for (const record of validRecords) { if (record.directCompletion !== true) mergeDistributionBlock(blocks, record); }
    const absorptionOperations = [];
    const completionProofs = [];
    const directCompletionUids = [];
    const settledSourceUids = [];
    const guardRetainedSourceUids = [];
    const guardRetentionReasons = [];
    for (const group of validGroups) {
        const dispositions = [...group.dispositions];
        const proofs = distributionProofsForRecords(group.records.filter((record) => record.directCompletion !== true));
        if (invalidLines.length) continue;
        if (dispositions[0] === '吸收') {
            // ui.65: “模型已给出结论”与“删除动作是否通过安全闸门”必须分离。
            // 当前场景、锁定/焦点来源、自指吸收或不允许的颗粒度路径都不能删除来源，
            // 但这不代表模型遗漏了来源。保留来源，并在分发事实通过权威回读后完成本期待处理。
            const guardReasons = [];
            if (!proofs.length) guardReasons.push('缺少可验证的目标事实');
            if (!sourceMayExit(group.source)) guardReasons.push('来源受当前场景/锁定/焦点/禁用保护');
            if (group.records.some((record) => (0, util_1.normalizeTitle)(record.sourceTitle) === (0, util_1.normalizeTitle)(record.targetTitle))) guardReasons.push('来源与目标相同');
            if (!historicalAbsorptionAllowed(kind, group.source, group.records)) guardReasons.push('颗粒度吸收路径不允许');
            if (guardReasons.length) {
                if (proofs.length) completionProofs.push({ sourceUid: String(group.source.uid), sourceTitle: group.source.title, proofs });
                else directCompletionUids.push(String(group.source.uid));
                settledSourceUids.push(String(group.source.uid));
                guardRetainedSourceUids.push(String(group.source.uid));
                guardRetentionReasons.push({ sourceUid: String(group.source.uid), sourceTitle: group.source.title, reasons: guardReasons });
                continue;
            }
            absorptionOperations.push({
                id: `history-absorb:${kind}:${group.source.uid}:${(0, util_1.hashText)(group.records.map((record) => `${record.targetTitle}|${record.section}|${record.fact}`).join('|'))}`,
                kind: 'delete-entry', operation: 'delete', title: group.source.title, targetUid: group.source.uid,
                oldValue: group.source.title, newValue: '删除',
                reason: `${kind === 'small' ? '小总结' : '大总结'}已按逐来源协议把该${group.source.type}的必要历史分发到直接宿主`,
                mergedIntoTitle: group.records[0].targetTitle, requiresDistributionProof: true,
                distributionTargets: (0, util_1.unique)(group.records.map((record) => record.targetTitle)),
                distributionProofs: proofs, granularitySourceType: group.source.type,
                granularityTargetType: (0, util_1.unique)(group.records.map((record) => record.targetType)).join('、'),
            });
            settledSourceUids.push(String(group.source.uid));
        } else if (dispositions[0] === '保留完成') {
            if (proofs.length) completionProofs.push({ sourceUid: String(group.source.uid), sourceTitle: group.source.title, proofs });
            else directCompletionUids.push(String(group.source.uid));
            settledSourceUids.push(String(group.source.uid));
        }
    }
    return { records: validRecords, distributionBlocks: [...blocks.values()], absorptionOperations, completionProofs, directCompletionUids, settledSourceUids, guardRetainedSourceUids, guardRetentionReasons, invalidLines, unmatchedSourceTitles: (0, util_1.unique)(unmatchedSourceTitles) };
}
function historySourceIdentityKey(type, name) {
    const canonicalType = canonicalHistoryType(type);
    const canonicalName = String(name ?? '')
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[‐‑‒–—―−﹣－]/gu, '-')
        .replace(/[“”‘’"'`（）()【】\[\]{}《》<>，,。.!！?？：:；;、·•・_\/\s-]+/gu, '')
        .trim();
    return canonicalType && canonicalName ? `${canonicalType}|${canonicalName}` : '';
}

function parseHistoricalDistributionLine(rawLine) {
    const line = String(rawLine ?? '')
        .replace(/^\s*(?:[-*•]+|\d+[.)、])\s*/u, '')
        .replace(/\*\*/gu, '')
        .trim();
    if (!line || /^(?:无|没有|暂无)$/u.test(line)) return null;
    // ui.72: 只归一化标签之间的表面分隔符；标题内部的“｜”只有在后面紧跟已知标签时才会被识别为边界。
    const labelPattern = /(?:^|[；;，,|｜]|(?:->|→|⇒))\s*(来源条目|来源|源|目标条目|目标|宿主|栏目|小标题|字段|事实|内容|处理|来源处理|结论)\s*[:：]\s*/gu;
    const markers = [...line.matchAll(labelPattern)];
    if (!markers.length) return null;
    const fields = new Map();
    const canonicalLabel = (value) => ({
        来源条目: 'source', 来源: 'source', 源: 'source',
        目标条目: 'target', 目标: 'target', 宿主: 'target',
        栏目: 'section', 小标题: 'section', 字段: 'section',
        事实: 'fact', 内容: 'fact',
        处理: 'disposition', 来源处理: 'disposition', 结论: 'disposition',
    })[String(value ?? '').trim()] ?? '';
    for (let index = 0; index < markers.length; index += 1) {
        const marker = markers[index];
        const key = canonicalLabel(marker[1]);
        if (!key) continue;
        const valueStart = Number(marker.index || 0) + marker[0].length;
        const valueEnd = index + 1 < markers.length ? Number(markers[index + 1].index || line.length) : line.length;
        const value = line.slice(valueStart, valueEnd).replace(/^[；;\s]+|[；;\s]+$/gu, '').trim();
        if (value && !fields.has(key)) fields.set(key, value);
    }
    const source = parseHistoryTitle(fields.get('source'), true);
    if (!source) return null;
    const rawDisposition = String(fields.get('disposition') ?? '').trim();
    const disposition = /^(?:吸收|吸收完成|已吸收|并入完成)$/u.test(rawDisposition)
        ? '吸收'
        : /^(?:保留完成|保留|继续保留|保留独立|继续存在)$/u.test(rawDisposition) ? '保留完成' : '';
    if (!disposition) return null;
    const hasDetail = ['target', 'section', 'fact'].some((key) => fields.has(key));
    if (!hasDetail) {
        return disposition === '保留完成'
            ? { sourceTitle: source.title, sourceType: source.type, sourceName: source.name, targetTitle: '', targetType: '', targetName: '', section: '', fact: '', disposition, directCompletion: true }
            : null;
    }
    if (!fields.get('target') || !fields.get('section') || !fields.get('fact')) return null;
    const target = parseHistoryTitle(fields.get('target'), false);
    if (!target) return null;
    const section = String(fields.get('section') ?? '').trim();
    const fact = String(fields.get('fact') ?? '').trim().replace(/[；;]+$/u, '');
    if (!section || !fact) return null;
    return { sourceTitle: source.title, sourceType: source.type, sourceName: source.name, targetTitle: target.title, targetType: target.type, targetName: target.name, section, fact, disposition, directCompletion: false };
}
function parseHistoryTitle(value, allowSummary = false) {
    const cleaned = String(value ?? '').trim().replace(/^[“”"'‘’\s]+|[“”"'‘’。；;，,\s]+$/gu, '');
    const pattern = allowSummary
        ? /^(人物|角色|NPC|场景|地点|地区|区域|物品|道具|装备|事件|事件链|世界|全局变化|基础设定|世界设定|总结)\s*[｜|丨:：]\s*(.+)$/u
        : /^(人物|角色|NPC|场景|地点|地区|区域|物品|道具|装备|事件|事件链|世界|全局变化|基础设定|世界设定)\s*[｜|丨:：]\s*(.+)$/u;
    const match = cleaned.match(pattern); if (!match) return null;
    const type = canonicalHistoryType(match[1]); const name = match[2].trim();
    return name ? { type, name, title: `${type}｜${name}` } : null;
}
function canonicalHistoryType(value) { const raw = String(value ?? '').trim(); return raw === '总结' ? '总结' : (0, parser_1.canonicalExtractionType)(raw); }
function mergeDistributionBlock(blocks, record) {
    const key = (0, util_1.normalizeTitle)(record.targetTitle);
    const block = blocks.get(key) ?? { rawTitle: record.targetTitle, title: record.targetTitle, type: record.targetType, name: record.targetName, keywords: [record.targetName], sections: [] };
    let section = block.sections.find((item) => item.name === record.section);
    if (!section) { section = { name: record.section, lines: [], empty: record.explicitEmpty === true }; block.sections.push(section); }
    if (record.explicitEmpty === true) { section.lines = []; section.empty = true; }
    else { section.lines = (0, util_1.unique)([...section.lines, record.fact]); section.empty = false; }
    blocks.set(key, block);
}
function distributionProofsForRecords(records) {
    const byTarget = new Map();
    for (const record of records) {
        const key = (0, util_1.normalizeTitle)(record.targetTitle);
        const proof = byTarget.get(key) ?? { targetTitle: record.targetTitle, requiredFacts: [], requiredEmptySections: [] };
        if (record.explicitEmpty) proof.requiredEmptySections.push(record.section); else proof.requiredFacts.push(record.fact);
        byTarget.set(key, proof);
    }
    return [...byTarget.values()].map((proof) => ({ targetTitle: proof.targetTitle, requiredFacts: (0, util_1.unique)(proof.requiredFacts), requiredEmptySections: (0, util_1.unique)(proof.requiredEmptySections) }))
        .filter((proof) => proof.requiredFacts.length || proof.requiredEmptySections.length);
}
function historicalAbsorptionAllowed(kind, source, records) {
    const sourceType = canonicalHistoryType(source?.type); const targetTypes = new Set(records.map((record) => canonicalHistoryType(record.targetType)));
    if (!sourceType || sourceType === '基础设定') return false;
    if (sourceType === '总结') return true;
    if (sourceType === '场景') return [...targetTypes].every((type) => ['场景', '世界'].includes(type));
    if (sourceType === '世界') return [...targetTypes].every((type) => type === '世界');
    if (sourceType === '人物') return [...targetTypes].every((type) => ['场景', '事件', '世界'].includes(type));
    if (sourceType === '物品') return [...targetTypes].every((type) => ['人物', '场景', '事件', '世界'].includes(type));
    if (sourceType === '事件') return [...targetTypes].every((type) => ['人物', '场景', '物品', '事件', '世界', '基础设定'].includes(type));
    return false;
}
function resolvedHistoricalSourceUids(applied, completionProofs = []) {
    const byTitle = new Map((applied?.entries ?? []).map((entry) => [(0, util_1.normalizeTitle)(entry.title), entry]));
    const resolved = [];
    for (const group of completionProofs ?? []) {
        const passed = (group.proofs ?? []).length > 0 && group.proofs.every((proof) => {
            const title = (0, util_1.normalizeTitle)(proof.targetTitle); const target = byTitle.get(title);
            if (!target) return false;
            const content = (0, util_1.normalizeFact)(target.content || '');
            const facts = (proof.requiredFacts ?? []).map(util_1.normalizeFact).filter(Boolean);
            const emptySections = (proof.requiredEmptySections ?? []).map((name) => (0, information_point_1.canonicalSectionName)(name, target.type));
            return facts.every((fact) => content.includes(fact)) && emptySections.every((section) => !(target.sections?.values?.[section] ?? []).length);
        });
        if (passed) resolved.push(String(group.sourceUid));
    }
    return [...new Set(resolved.filter(Boolean))];
}


function summaryRepairPreservesSemantics(originalRaw, protocol) {
    const original = (0, util_1.normalizeFact)((0, parser_1.sanitizeModelText)(originalRaw));
    const issues = [];
    for (const record of protocol?.historyPlan?.records ?? []) {
        const sourceName = (0, util_1.splitTitle)(record.sourceTitle)?.name || String(record.sourceTitle ?? '').split('｜').slice(1).join('｜');
        const targetName = (0, util_1.splitTitle)(record.targetTitle)?.name || String(record.targetTitle ?? '').split('｜').slice(1).join('｜');
        if (sourceName && !original.includes((0, util_1.normalizeFact)(sourceName))) issues.push(`来源“${sourceName}”不在原返回中`);
        if (record.directCompletion === true) {
            if (!/(?:保留完成|保留|独立存在|继续存在)/u.test((0, parser_1.sanitizeModelText)(originalRaw))) issues.push(`来源“${sourceName}”缺少原有保留结论`);
            continue;
        }
        if (targetName && !original.includes((0, util_1.normalizeFact)(targetName))) issues.push(`目标“${targetName}”不在原返回中`);
        if (record.section && !original.includes((0, util_1.normalizeFact)(record.section))) issues.push(`栏目“${record.section}”不在原返回中`);
        if (record.fact && !original.includes((0, util_1.normalizeFact)(record.fact))) issues.push(`事实“${record.fact}”不是原返回中的原文事实`);
        if (record.disposition === '吸收' && !/(?:吸收|并入|退出|删除来源)/u.test((0, parser_1.sanitizeModelText)(originalRaw))) issues.push(`来源“${sourceName}”缺少原有吸收结论`);
        if (record.disposition === '保留完成' && !/(?:保留完成|保留|独立存在|继续存在)/u.test((0, parser_1.sanitizeModelText)(originalRaw))) issues.push(`来源“${sourceName}”缺少原有保留结论`);
    }
    return { ok: issues.length === 0, issues: [...new Set(issues)] };
}

function inspectSummaryProtocol(raw, kind, selectedEntries, pendingUids = []) {
    const label = kind === 'small' ? '小总结' : '大总结';
    const expectedTitle = kind === 'small' ? '总结｜当前事件' : '总结｜世界历史';
    const validPendingUids = [...new Set((pendingUids ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean))];
    const recovered = parseSummaryWithRecovery(raw, kind);
    if (!recovered.block) {
        if (recovered.explicitNone) return { ok: false, explicitNone: true, error: `${label}协议不完整：当前有${validPendingUids.length}个待处理来源，模型必须逐一输出“吸收”或“保留完成”，不能返回“无”`, unresolvedPendingUids: validPendingUids };
        return { ok: false, explicitNone: false, error: `${label}无法识别固定标题“${expectedTitle}”及“【历史分发】”协议块` };
    }
    const summaryBlock = ensureSummarySnapshotSections(recovered.block, kind);
    const historyPlan = historicalDistributionPlan(summaryBlock, selectedEntries, { kind, pendingUids: validPendingUids });
    if (historyPlan.invalidLines?.length) return { ok: false, error: `${label}协议不完整：有${historyPlan.invalidLines.length}条历史分发行无法识别`, recovered, summaryBlock, historyPlan };
    const unresolvedPendingUids = validPendingUids.filter((uid) => !historyPlan.settledSourceUids.includes(String(uid)));
    if (unresolvedPendingUids.length) {
        const unresolvedTitles = selectedEntries
            .filter((entry) => unresolvedPendingUids.includes(String(entry.uid)))
            .map((entry) => entry.title);
        const suffix = unresolvedTitles.length ? `（${unresolvedTitles.slice(0, 4).join('、')}${unresolvedTitles.length > 4 ? '等' : ''}）` : '';
        const unmatched = historyPlan.unmatchedSourceTitles?.length
            ? `；模型返回了无法唯一绑定的来源：${historyPlan.unmatchedSourceTitles.slice(0, 4).join('、')}${historyPlan.unmatchedSourceTitles.length > 4 ? '等' : ''}`
            : '';
        return { ok: false, error: `${label}协议不完整：${unresolvedPendingUids.length}个待处理来源没有得到“吸收”或“保留完成”的确定结论${suffix}${unmatched}`, recovered, summaryBlock, historyPlan, unresolvedPendingUids, unresolvedTitles };
    }
    if (!summarySnapshotHasFacts(summaryBlock, kind) || (!historyPlan.distributionBlocks.length && !historyPlan.completionProofs.length && !historyPlan.directCompletionUids.length)) {
        return { ok: false, error: `${label}没有形成可执行的逐来源结算计划`, recovered, summaryBlock, historyPlan };
    }
    return { ok: true, recovered, summaryBlock, historyPlan, unresolvedPendingUids: [] };
}

function normalizeSummarySurfaceProtocol(raw, kind) {
    const expectedTitle = kind === 'small' ? '总结｜当前事件' : '总结｜世界历史';
    const source = (0, parser_1.sanitizeModelText)(raw).replace(/\r/g, '');
    const output = [];
    let inHistoryDistribution = false;
    const fieldOnly = /^(?:来源条目|来源|源|目标条目|目标|宿主|栏目|小标题|字段|事实|内容|处理|来源处理|结论)\s*[:：]/u;
    for (const rawLine of source.split('\n')) {
        let line = String(rawLine ?? '').trim();
        if (!line) { output.push(''); continue; }
        line = line.replace(/^#{1,6}\s*/u, '').replace(/^\*\*(.*?)\*\*$/u, '$1').replace(/^__(.*?)__$/u, '$1').trim();
        const titleText = line.replace(/^(?:标题|总结标题)\s*[：:]\s*/u, '').trim();
        if ((kind === 'small' && /^(?:总结|小总结)[｜|丨:：](?:当前事件|当前事件线|当前阶段)$/u.test(titleText))
            || (kind === 'large' && /^(?:总结|大总结)[｜|丨:：](?:世界历史|长期历史|长期记忆)$/u.test(titleText))) {
            output.push(expectedTitle);
            inHistoryDistribution = false;
            continue;
        }
        const sectionText = line.replace(/^【\s*([^】]+?)\s*】\s*[：:]?$/u, '$1').replace(/[：:]$/u, '').trim();
        if (/^(?:历史分发|逐来源分发|来源分发|颗粒度分发|逐来源结算|来源结算|分发结算)$/u.test(sectionText)) {
            output.push('【历史分发】');
            inHistoryDistribution = true;
            continue;
        }
        if (/^【[^】]+】/u.test(line)) inHistoryDistribution = false;
        // 模型常把一条固定记录拆成多行字段。仅当处于【历史分发】且当前行就是已知字段标签时，
        // 把它机械拼回上一条记录；不读取或改写字段值，因此不产生新语义。
        if (inHistoryDistribution && fieldOnly.test(line) && !/^\s*(?:[-*•]+|\d+[.)、])\s*/u.test(line)) {
            for (let index = output.length - 1; index >= 0; index -= 1) {
                if (!String(output[index] ?? '').trim()) continue;
                if (String(output[index]).includes('【历史分发】')) break;
                if (/^(?:[-*•]+|\d+[.)、])\s*/u.test(String(output[index]).trim()) || /(?:来源条目|来源|源)\s*[:：]/u.test(String(output[index]))) {
                    output[index] = `${String(output[index]).replace(/[；;\s]+$/gu, '')}；${line}`;
                    line = '';
                }
                break;
            }
            if (!line) continue;
        }
        output.push(line);
    }
    return output.join('\n').trim();
}

function parseSummaryWithRecovery(raw, kind) {
    const expectedTitle = kind === 'small' ? '总结｜当前事件' : '总结｜世界历史';
    const sanitized = (0, parser_1.sanitizeModelText)(raw);
    const text = normalizeSummarySurfaceProtocol(raw, kind);
    if (/^(?:无|EMPTY)$/u.test(text.trim())) return { block: null, explicitNone: true, repaired: 0, skipped: [] };
    let repaired = text !== sanitized ? 1 : 0;
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


async function segmentedExtractionRescue(host, settings, snapshot, entries, getSettings, onProgress = () => undefined) {
    const segments = splitExtractionSource(snapshot.assistantText, 420, 6);
    if (!segments.length) throw new Error('提取救援没有可处理的正文片段');
    const outputs = [];
    for (let index = 0; index < segments.length; index += 1) {
        host.assertSnapshot(snapshot, getSettings());
        const segment = segments[index];
        const prompt = (0, prompts_1.extractionPrompts)(settings, index === 0 ? snapshot.playerText : '', segment, entries, { compact: true, dialogueContext: '', requestTime: snapshot.capturedAt, currentGameTime: host.getCurrentGameTime?.() || null });
        try {
            const output = await (0, model_request_1.callModel)({
                host,
                stage: 'extraction',
                prompt,
                fallbackPrompt: () => (0, prompts_1.extractionPrompts)(settings, index === 0 ? snapshot.playerText : '', segment, entries, { compact: true, dialogueContext: '' }),
                settings,
                snapshot,
                profileId: settings.extractionProfileId,
                sourceText: segment,
                responseTokens: 4096,
                onRetry: (error) => onProgress(`分段提取 ${index + 1}/${segments.length}：${(0, model_request_1.describeRetryReason)(error, '模型')}`),
            });
            outputs.push(String(output ?? '').trim());
        }
        catch (error) {
            throw new Error(`分段提取 ${index + 1}/${segments.length} 仍失败：${(0, util_1.errorText)(error)}`);
        }
    }
    const nonEmpty = outputs.filter((value) => value && !/^(?:无|EMPTY)$/u.test(value));
    return nonEmpty.length ? nonEmpty.join('\n\n') : '无';
}

function splitExtractionSource(value, maxChars = 420, maxSegments = 6) {
    const text = String(value ?? '').trim();
    if (!text) return [];
    const units = text.split(/(?<=[。！？!?…])\s*|\n+/u).map((item) => item.trim()).filter(Boolean);
    const segments = [];
    let current = '';
    const flush = () => {
        if (!current.trim()) return;
        segments.push(current.trim());
        current = '';
    };
    for (const unit of units) {
        if (unit.length > maxChars) {
            flush();
            for (let offset = 0; offset < unit.length; offset += maxChars) segments.push(unit.slice(offset, offset + maxChars));
            continue;
        }
        const next = current ? `${current}${unit}` : unit;
        if (next.length > maxChars) flush();
        current += unit;
    }
    flush();
    if (segments.length <= maxSegments) return segments;
    const kept = segments.slice(0, maxSegments - 1);
    kept.push(segments.slice(maxSegments - 1).join('').slice(0, maxChars));
    return kept;
}

function isReasoningOrEmptyError(error) {
    return error?.code === 'MA_REASONING_ONLY' || error?.code === 'MA_EMPTY_MODEL_RESPONSE'
        || /只返回了推理内容|没有最终文本|未解析出最终文本/u.test((0, util_1.errorText)(error));
}


function absorbedSourceOperations(summaryBlock, selectedEntries, distributionBlocks, options = {}) {
    const section = summaryBlock.sections.find((item) => /^(?:吸收来源|升阶来源|来源升阶|合并来源)$/u.test(String(item.name ?? '').trim()));
    if (!section || section.empty) return [];
    const kind = options.kind === 'large' ? 'large' : 'small';
    const pending = new Set((options.pendingUids ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean));
    if (!pending.size) return [];
    const selected = (selectedEntries ?? []).filter((entry) => {
        if (!pending.has(String(entry.uid))) return false;
        if (entry.managed !== true || entry.locked === true || entry.focus === true || entry.activation?.disabled === true) return false;
        if (entry.type === '场景' && (entry.sceneStage === 'current' || entry.semanticRole === 'scene-current')) return false;
        return true;
    });
    const eligible = new Map(selected.map((entry) => [(0, util_1.normalizeTitle)(entry.title), entry]));
    const distributedTargets = new Map((distributionBlocks ?? []).map((block) => [(0, util_1.normalizeTitle)(block.title), block]));
    const operations = [];
    const deleted = new Set();
    for (const rawLine of section.lines ?? []) {
        const pair = parseAbsorptionLine(rawLine);
        if (!pair) continue;
        const source = eligible.get((0, util_1.normalizeTitle)(pair.sourceTitle));
        const normalizedTarget = (0, util_1.normalizeTitle)(pair.targetTitle);
        const targetBlock = distributedTargets.get(normalizedTarget);
        if (!source || !targetBlock || deleted.has(source.uid)) continue;
        if ((0, util_1.normalizeTitle)(source.title) === normalizedTarget) continue;
        if (!granularityMergeAllowed(kind, source.type, targetBlock.type)) continue;
        operations.push({
            id: `summary-absorb:${kind}:${source.uid}:${(0, util_1.hashText)(normalizedTarget)}`,
            kind: 'delete-entry',
            operation: 'delete',
            title: source.title,
            targetUid: source.uid,
            oldValue: source.title,
            newValue: '删除',
            reason: `${kind === 'small' ? '小总结' : '大总结'}已将该${source.type}运行壳的宏观原貌与持续影响完整抽象并分发到“${pair.targetTitle}”`,
            mergedIntoTitle: pair.targetTitle,
            requiresDistributionProof: true,
            distributionTargets: [pair.targetTitle],
            distributionProofs: [{
                targetTitle: pair.targetTitle,
                requiredFacts: (targetBlock.sections ?? []).flatMap((section) => section.lines ?? []).map((line) => String(line ?? '').trim()).filter(Boolean),
            }],
            granularitySourceType: source.type,
            granularityTargetType: targetBlock.type,
        });
        deleted.add(source.uid);
    }
    return operations;
}

function granularityMergeAllowed(kind, sourceType, targetType) {
    const source = (0, parser_1.canonicalExtractionType)(sourceType);
    const target = (0, parser_1.canonicalExtractionType)(targetType);
    const rules = kind === 'large'
        ? {
            '事件': new Set(['事件', '世界']),
            '场景': new Set(['世界']),
            '世界': new Set(['世界']),
        }
        : {
            '事件': new Set(['事件']),
            '场景': new Set(['场景', '世界']),
        };
    return rules[source]?.has(target) === true;
}

function parseAbsorptionLine(rawLine) {
    const line = String(rawLine ?? '').replace(/^\s*[-*•]+\s*/u, '').trim();
    if (!line || /^(?:无|没有|暂无)$/u.test(line)) return null;
    const sourceTarget = line.match(/^来源\s*[:：]\s*(.+?)\s*[；;，,]\s*目标\s*[:：]\s*(.+?)\s*$/u);
    if (sourceTarget) {
        const source = parseAbsorptionTitle(sourceTarget[1]);
        const target = parseAbsorptionTitle(sourceTarget[2]);
        return source && target ? { sourceTitle: source.title, sourceType: source.type, targetTitle: target.title, targetType: target.type } : null;
    }
    const parts = line.split(/\s*并入\s*/u);
    if (parts.length !== 2) return null;
    const source = parseAbsorptionTitle(parts[0].replace(/^将\s*/u, ''));
    const target = parseAbsorptionTitle(parts[1]);
    return source && target ? { sourceTitle: source.title, sourceType: source.type, targetTitle: target.title, targetType: target.type } : null;
}

function parseAbsorptionTitle(value) {
    const cleaned = String(value ?? '')
        .trim()
        .replace(/^[“”"'‘’\s]+|[“”"'‘’。；;，,\s]+$/gu, '')
        .replace(/^[｜|丨\s]+|[｜|丨\s]+$/gu, '')
        .replace(/^(?:来源|目标)\s*[:：]\s*/u, '')
        .trim();
    const match = cleaned.match(/^(人物|角色|NPC|场景|地点|地区|区域|物品|道具|装备|事件|事件链|世界|全局变化|基础设定|世界设定|总结)\s*[｜|丨:：]\s*(.+)$/u);
    if (!match) return null;
    const type = match[1] === '总结' ? '总结' : (0, parser_1.canonicalExtractionType)(match[1]);
    const name = match[2].trim().replace(/[“”"'‘’。；;，,\s]+$/gu, '');
    if (!name || !['人物', '场景', '物品', '事件', '世界', '基础设定', '总结'].includes(type)) return null;
    return { type, name, title: `${type}｜${name}` };
}

function emptyPlan() { return { blocks: [], operations: [], createdAt: Date.now() }; }


function distinctNumericFacts(left, right) {
    const values = (value) => [...String(value ?? '').matchAll(/\d+(?:\.\d+)?/gu)].map((match) => match[0]);
    const leftValues = values(left);
    const rightValues = values(right);
    if (!leftValues.length && !rightValues.length) return false;
    return JSON.stringify(leftValues) !== JSON.stringify(rightValues);
}
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
exports.INFORMATION_BOUNDARY_TITLE = exports.MigrationService = void 0;
exports.isRebuildCandidate = isRebuildCandidate;
exports.parseRebuildResponse = parseRebuildResponse;
exports.mergeRebuildBlocks = mergeRebuildBlocks;
exports.buildRebuildSnapshot = buildRebuildSnapshot;
exports.buildRebuildBatches = buildRebuildBatches;
exports.buildSemanticClusters = buildSemanticClusters;
exports.buildRebuildPlan = buildRebuildPlan;
exports.buildRebuildSourceIndex = buildRebuildSourceIndex;
exports.parseRebuildPlanningResponse = parseRebuildPlanningResponse;
exports.buildPlannedRebuildTasks = buildPlannedRebuildTasks;
exports.packPlannedRebuildTasks = packPlannedRebuildTasks;
exports.buildRebuildReviewCatalog = buildRebuildReviewCatalog;
exports.analyzeRebuildCoverage = analyzeRebuildCoverage;
exports.restoreUncoveredRebuildSourceLines = restoreUncoveredRebuildSourceLines;
exports.applyRebuildTemporalSettlement = applyRebuildTemporalSettlement;
exports.buildRebuildSpacetimeSection = buildRebuildSpacetimeSection;
exports.parseRebuildReviewResponse = parseRebuildReviewResponse;
exports.buildRegionalSynthesisTasks = buildRegionalSynthesisTasks;
exports.buildEventSynthesisTasks = buildEventSynthesisTasks;
exports.buildFoundationSynthesisTasks = buildFoundationSynthesisTasks;
exports.buildWorldSynthesisTasks = buildWorldSynthesisTasks;
exports.buildMigrationSchema = buildMigrationSchema;
exports.buildExtendedSynthesisTasks = buildExtendedSynthesisTasks;
exports.mergeProposedKeywordDefinitions = mergeProposedKeywordDefinitions;
exports.findOverlappingMigrationType = findOverlappingMigrationType;
exports.isMigrationRateLimitError = isMigrationRateLimitError;
exports.preserveSparseRebuildBlocks = preserveSparseRebuildBlocks;
exports.finalizeRebuildBlocks = finalizeRebuildBlocks;
exports.preserveEventPendingFacts = preserveEventPendingFacts;
const constants_1 = require("./constants");
const parser_1 = require("./parser");
const information_point_1 = require("./domain/information-point");
const matcher_1 = require("./matcher");
const prompts_1 = require("./prompts");
const util_1 = require("./util");
const model_request_1 = require("./model-request");

const ALLOWED_TYPES = new Set(['人物', '场景', '物品', '事件', '世界', '基础设定']);
const NON_EVENT_TYPES = new Set(['人物', '场景', '物品', '世界', '基础设定']);
const KNOWLEDGE_SECTIONS = new Set(['已知', '误信']);
const TYPE_ALLOWED_SECTIONS = {
    人物: new Set(['时空锚点', '身份', '稳定', '行为倾向', '性格核心', '表达方式', '决策倾向', '当前', '关系', '关系立场', '持有', '已知', '误信', '固定事实', '别名']),
    场景: new Set(['时空锚点', '定义', '空间结构', '固定资源', '固定事实', '当前状态', '在场', '当前资源', '活动关联', '世界影响', '局部约束', '别名']),
    物品: new Set(['时空锚点', '定义', '功能', '限制', '当前', '关系', '持有', '固定事实', '别名']),
    // [MA-REBUILD-10] 重建后的事件只保存已经发生的参与、场景、进展与结果。
    // 目标和未决只可用于内部聚类，不再写回新事件条目。
    事件: new Set(['时空锚点', '参与', '场景', '已发生进展', '未发生进展', '结果', '别名']),
    世界: new Set(['时空锚点', '范围', '地理', '组织', '权力', '制度', '资源与交通', '公开局势', '固定事实', '持续影响', '别名']),
    基础设定: new Set(['时空锚点', '世界常识', '自然规则', '种族与生命', '能力与技术', '社会规则', '地理框架', '别名']),
};
const MIGRATION_EXCLUSIVE_SECTIONS = new Set(['身份', '当前', '当前状态', '功能']);
const MIGRATION_STRONG_SINGLE_SLOTS = new Set(['唯一编号', '编号', '序列号', '账号id', 'id', '种族', '型号', '类别', '身份形态', '存在形态', '身体形态', '本体关系', '当前位置', '当前持有者', '当前使用者', '所有权', '保管者']);
const SOURCE_MARKER = /(?:〔|【|\[|（|\()\s*(?:证据|来源|证据UID|来源UID|旧UID)\s*[：:]\s*([^〕】\]）)]+)\s*(?:〕|】|\]|）|\))/giu;
const SOURCE_LINE_MARKER = /(?:〔|【|\[|（|\()\s*(?:来源行|证据行|sourceLine)\s*[：:]\s*([^〕】\]）)]+)\s*(?:〕|】|\]|）|\))/giu;
const SOURCE_KIND_PATTERN = /(?:信息来源|认知来源)\s*[：:]\s*(亲眼观察|听到对白|收到消息|查看记录|他人转述|亲身经历|可靠推理|特殊能力|公开信息|自身身份|自身行动|直接告知)/u;
const MIGRATION_BATCH_CATALOG_BUDGET = 1800;
const MIGRATION_BATCH_MAX_RECORDS = 5;
const MIGRATION_CLUSTER_BODY_BUDGET = 6800;
const MIGRATION_DERIVED_BODY_BUDGET = 6800;
const MIGRATION_PLANNED_GROUP_BUDGET = 10500;
const MIGRATION_PLANNED_JOINT_BUDGET = 15000;
const MIGRATION_PLANNED_JOINT_MAX_GROUPS = 4;
const MIGRATION_PLAN_LINE_PREVIEW = 68;
const REGION_SUFFIX_PATTERN = /([\p{Script=Han}A-Za-z0-9·]{2,20}(?:大陆|王国|帝国|公国|领地|地区|区域|州|省|郡|城|镇|村|港|关|岛|群岛|海域|森林|山脉|荒原|边境|北境|南境|东境|西境))/gu;
const ORGANIZATION_SUFFIX_PATTERN = /([\p{Script=Han}A-Za-z0-9·]{2,24}(?:王室|议会|教会|教团|公会|商会|协会|学院|军团|军|卫队|骑士团|调查局|委员会|家族|公司|组织|势力|联盟|同盟|帮派|工坊|研究院))/gu;
const MIGRATION_DEFAULT_INTERVAL_MS = 2200;
const MIGRATION_RATE_LIMIT_BACKOFF_MS = [8000, 20000];
const MIGRATION_MAX_RATE_LIMIT_RETRIES = 2;
const UNIVERSAL_ENTRY_MARKER = '新条目';
const UNIVERSAL_METADATA_NAMES = new Set(['组ID', '名称', '归入类型', '建议类型', '与现有类型区别', '别名', '合并来源', '来源行', '保留方式', '并入条目', '并入栏目', '场景锚点', '游戏时间', '时间来源', '时态']);
const UNIVERSAL_SECTION_NAMES = new Set(['内容', '角色认知', '过去结果', '关键词']);
const TEMPORAL_STATES = new Set(['当前', '持续', '已完成', '已结束', '长期']);
const TIME_SOURCES = new Set(['明确', '推定', '未知']);
const REBUILD_SPACETIME_SECTION = '时空锚点';
const REBUILD_TYPE_CODES = new Map([
    ['人物', 'C'], ['场景', 'L'], ['物品', 'I'], ['事件', 'E'], ['世界', 'W'], ['基础设定', 'R'],
]);
const MIGRATION_TYPE_DECORATION_PATTERN = /(?:档案|信息|记录|条目|资料|表格|表|类型|类别|对象|实体)$/gu;
const MIGRATION_TYPE_SYNONYMS = new Map([
    ['角色', '人物'], ['npc', '人物'], ['人物档案', '人物'], ['角色档案', '人物'], ['人员', '人物'],
    ['地点', '场景'], ['地区', '场景'], ['区域', '场景'], ['场所', '场景'], ['地理区域', '场景'], ['地区规则', '场景'],
    ['道具', '物品'], ['装备', '物品'], ['物件', '物品'], ['物资', '物品'],
    ['事件链', '事件'], ['任务', '事件'], ['行动', '事件'], ['剧情事件', '事件'],
    ['全局', '世界'], ['局势', '世界'], ['世界状态', '世界'], ['全局状态', '世界'],
    ['世界设定', '基础设定'], ['基础规则', '基础设定'], ['世界规则', '基础设定'], ['设定规则', '基础设定'],
]);
const UNIVERSAL_FIELD_ALIASES = {
    人物: {
        身份: ['身份', '姓名', '真名', '职业', '种族', '性别', '年龄', '血统', '阵营', '称号'],
        稳定: ['稳定', '能力', '长期能力', '长期限制', '习惯', '稳定特征', '外貌特征'],
        行为倾向: ['行为倾向', '长期倾向', '近期行为倾向', '重复行为倾向', '行为模式'],
        性格核心: ['性格核心', '稳定性格', '人格核心', '核心性格', '性格'],
        表达方式: ['表达方式', '表达风格', '说话方式', '说话风格', '语言风格', '语言习惯'],
        决策倾向: ['决策倾向', '决策模式', '判断倾向', '判断模式', '选择倾向'],
        当前: ['当前', '人物状态', '近期状态', '短期状态', '位置', '所在地', '当前地点', '目标', '当前目标', '状态', '当前状态', '伤势', '情绪'],
        关系: ['关系', '长期关系', '稳定关系', '关系变化', '关系状态'],
        关系立场: ['关系立场', '长期关系立场', '稳定关系立场', '关系态度', '立场', '态度'],
        持有: ['持有', '装备', '携带', '资源', '持有物'],
        固定事实: ['固定事实', '持续经历', '经历', '过去结果', '历史结果', '近期经历'],
        别名: ['别名', '称呼', '其他名称'],
    },
    场景: {
        定义: ['定义', '性质', '位置', '所属', '地点属性'],
        空间结构: ['空间结构', '空间', '结构', '布局'],
        固定资源: ['固定资源', '设施', '固定设施'],
        固定事实: ['固定事实', '持续变化', '变化', '过去结果', '历史结果'],
        当前状态: ['当前状态', '当前', '状态'],
        在场: ['在场', '在场人物', '人物'],
        当前资源: ['当前资源', '资源'],
        活动关联: ['活动关联', '活动', '关联事件'],
        世界影响: ['世界影响', '影响'],
        局部约束: ['局部约束', '规则', '局部规则', '通行规则', '限制'],
        别名: ['别名', '其他名称'],
    },
    物品: {
        定义: ['定义', '外观', '材质', '类型', '来源'],
        功能: ['功能', '用途', '效果', '能力'],
        当前: ['当前', '状态', '当前状态', '位置', '持有者', '所有者'],
        限制: ['限制', '代价', '条件', '使用条件'],
        固定事实: ['固定事实', '持续变化', '变化', '过去结果', '历史结果'],
        别名: ['别名', '其他名称'],
    },
    事件: {
        参与: ['参与', '参与者', '相关人物'],
        场景: ['场景', '地点', '发生地点'],
        已发生进展: ['已发生进展', '关键进展', '进展', '过程结果', '已发生经过', '阶段结果'],
        未发生进展: ['未发生进展', '未形成进展', '过程动作', '过程细节', '无状态变化'],
        结果: ['结果', '过去结果', '最终结果', '已发生结果'],
        别名: ['别名', '其他名称'],
    },
    世界: {
        范围: ['范围', '影响范围'], 地理: ['地理', '区域', '地区'], 组织: ['组织', '势力'],
        权力: ['权力', '权力结构'], 制度: ['制度', '规则', '法律'], 资源与交通: ['资源与交通', '资源', '交通'],
        公开局势: ['公开局势', '当前局势', '局势', '当前状态'], 固定事实: ['固定事实', '世界变化', '变化', '过去结果'],
        持续影响: ['持续影响', '影响'], 别名: ['别名', '其他名称'],
    },
    基础设定: {
        世界常识: ['世界常识', '常识'], 自然规则: ['自然规则', '基础规则', '世界规则'],
        种族与生命: ['种族与生命', '种族', '生命规则'], 能力与技术: ['能力与技术', '能力体系', '技术体系'],
        社会规则: ['社会规则', '社会制度'], 地理框架: ['地理框架', '地理'], 别名: ['别名', '其他名称'],
    },
};
exports.INFORMATION_BOUNDARY_TITLE = '基础设定｜角色信息边界';

// [MA-REBUILD-07] 重建格式来自当前设置中的表定义，而不是把“组织”写死成唯一扩展类型。
function buildMigrationSchema(keywordDefinitions = [], records = []) {
    const definitions = new Map();
    const aliasToType = new Map();
    const addDefinition = (raw, inferred = false) => {
        const label = String(raw?.label ?? raw?.type ?? '').trim();
        if (!label) return;
        const canonicalBuiltin = (0, parser_1.canonicalExtractionType)(label);
        const type = ALLOWED_TYPES.has(canonicalBuiltin) ? canonicalBuiltin : label;
        const existing = definitions.get(type);
        const fields = (0, util_1.unique)([
            ...((existing?.fields ?? []).map((field) => field.label)),
            ...((raw?.fields ?? []).map((field) => String(field?.label ?? field?.name ?? '').trim()).filter(Boolean)),
            '别名',
        ]).map((labelValue) => ({
            label: labelValue,
            policy: String((raw?.fields ?? []).find((field) => String(field?.label ?? field?.name ?? '').trim() === labelValue)?.policy
                ?? (existing?.fields ?? []).find((field) => field.label === labelValue)?.policy
                ?? 'semantic-upsert'),
        }));
        const aliases = (0, util_1.unique)([
            type,
            label,
            ...(existing?.aliases ?? []),
            ...(0, util_1.normalizeStringArray)(raw?.aliases),
        ]);
        const definition = {
            key: String(raw?.key ?? existing?.key ?? (0, util_1.safeId)(type) ?? type),
            label: type,
            description: String(raw?.description ?? raw?.prompt ?? existing?.description ?? ''),
            aliases,
            fields,
            enabled: raw?.enabled !== false,
            constant: raw?.constant === true || existing?.constant === true,
            vectorized: raw?.vectorized !== false && existing?.vectorized !== false,
            preventRecursion: raw?.preventRecursion === true || existing?.preventRecursion === true,
            depth: Number.isFinite(Number(raw?.depth)) ? Number(raw.depth) : Number(existing?.depth ?? 4),
            order: Number.isFinite(Number(raw?.order)) ? Number(raw.order) : Number(existing?.order ?? 400),
            inferred: Boolean(inferred && !existing),
            modelProposed: raw?.modelProposed === true || existing?.modelProposed === true,
        };
        definitions.set(type, definition);
        for (const alias of aliases) aliasToType.set((0, util_1.normalizeFact)(alias), type);
    };
    for (const [type, sections] of Object.entries(TYPE_ALLOWED_SECTIONS)) {
        addDefinition({ label: type, aliases: [], fields: [...sections].map((label) => ({ label })) });
    }
    for (const raw of Array.isArray(keywordDefinitions) ? keywordDefinitions : []) {
        if (raw?.enabled === false) continue;
        addDefinition(raw);
    }
    // 已由镜渊管理、但设置中已被删掉的旧自定义表仍按旧正文栏目推导格式，避免重建时整表丢失。
    for (const record of Array.isArray(records) ? records : []) {
        const split = (0, util_1.splitTitle)((0, util_1.normalizeTitle)(record.title));
        if (!split || ALLOWED_TYPES.has((0, parser_1.canonicalExtractionType)(split.type))) continue;
        if (definitions.has(split.type) || aliasToType.has((0, util_1.normalizeFact)(split.type))) continue;
        const sections = (0, parser_1.parseEntrySections)(record.content || '');
        addDefinition({ label: split.type, fields: sections.order.map((label) => ({ label })) }, true);
    }
    const allowedSectionsByType = Object.fromEntries([...definitions.entries()].map(([type, definition]) => [type, new Set(definition.fields.map((field) => field.label))]));
    const customDefinitions = [...definitions.values()].filter((definition) => !ALLOWED_TYPES.has(definition.label));
    return { definitions, aliasToType, allowedSectionsByType, customDefinitions };
}

function resolveMigrationType(value, schema) {
    const raw = String(value ?? '').trim();
    const builtin = (0, parser_1.canonicalExtractionType)(raw);
    if (schema?.definitions?.has(builtin)) return builtin;
    return schema?.aliasToType?.get((0, util_1.normalizeFact)(raw)) ?? builtin;
}

function migrationDefinition(schema, type) {
    return schema?.definitions?.get(resolveMigrationType(type, schema)) ?? null;
}


function migrationTypeCore(value) {
    return (0, util_1.normalizeFact)(String(value ?? ''))
        .replace(MIGRATION_TYPE_DECORATION_PATTERN, '')
        .replace(/(?:一览|总览|清单)$/gu, '');
}

function findOverlappingMigrationType(value, schema = buildMigrationSchema()) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const normalized = (0, util_1.normalizeFact)(raw);
    const synonym = MIGRATION_TYPE_SYNONYMS.get(normalized);
    if (synonym && schema?.definitions?.has(synonym)) return synonym;
    const resolved = resolveMigrationType(raw, schema);
    if (schema?.definitions?.has(resolved)) return resolved;
    const core = migrationTypeCore(raw);
    if (!core) return '';
    for (const definition of schema?.definitions?.values?.() ?? []) {
        for (const candidate of [definition.label, ...(definition.aliases ?? [])]) {
            const candidateCore = migrationTypeCore(candidate);
            if (!candidateCore) continue;
            if (candidateCore === core) return definition.label;
            const shorter = Math.min(candidateCore.length, core.length);
            const delta = Math.abs(candidateCore.length - core.length);
            if (shorter >= 2 && delta <= 3 && (candidateCore.includes(core) || core.includes(candidateCore))) return definition.label;
        }
    }
    return '';
}

function sanitizeProposedTypeLabel(value, entryName = '') {
    const label = String(value ?? '').trim().replace(/[｜|丨\r\n]/gu, '').replace(/^【|】$/gu, '');
    if (!label || label.length > 12 || /[：:，,。.!！?？\/\\]/u.test(label)) return '';
    if ((0, util_1.normalizeFact)(label) === (0, util_1.normalizeFact)(entryName)) return '';
    return label;
}

function registerProposedMigrationType(schema, labelValue, sectionNames, description, entryName, diagnostics) {
    const label = sanitizeProposedTypeLabel(labelValue, entryName);
    if (!label) {
        diagnostics.warnings.push(`新类型建议“${String(labelValue ?? '').trim() || '空'}”不是稳定类别名称，已拒绝`);
        return null;
    }
    const overlap = findOverlappingMigrationType(label, schema);
    if (overlap) {
        diagnostics.warnings.push(`新类型建议“${label}”与已有类型“${overlap}”重叠，已归入已有类型`);
        return { type: overlap, created: false, overlapped: true };
    }
    const fields = (0, util_1.unique)((sectionNames ?? [])
        .map((name) => String(name ?? '').trim().replace(/[【】\r\n]/gu, ''))
        .filter((name) => name && !new Set(['内容', '角色认知', '关键词']).has(name) && !UNIVERSAL_METADATA_NAMES.has(name))
        .slice(0, 8));
    if (!fields.length) {
        diagnostics.warnings.push(`新类型建议“${label}”没有可验证栏目，已拒绝`);
        return null;
    }
    if (!fields.includes('别名')) fields.push('别名');
    const definition = {
        key: `model-${(0, util_1.safeId)(label) || label}`,
        label,
        description: String(description ?? '').trim() || `由世界书重建模型根据旧条目证据提出的${label}类型`,
        aliases: [label],
        fields: fields.map((field) => ({ label: field, policy: /(?:当前|状态|阶段|位置|归属|持有者)/u.test(field) ? 'replace-by-anchor' : 'semantic-upsert' })),
        enabled: true,
        constant: false,
        vectorized: true,
        preventRecursion: true,
        depth: 4,
        order: 700,
        inferred: true,
        modelProposed: true,
    };
    schema.definitions.set(label, definition);
    schema.aliasToType.set((0, util_1.normalizeFact)(label), label);
    schema.allowedSectionsByType[label] = new Set(fields);
    schema.customDefinitions.push(definition);
    diagnostics.warnings.push(`模型提出新类型“${label}”，已通过非重叠校验并加入本次重建预览`);
    return { type: label, created: true, overlapped: false };
}

function mergeProposedKeywordDefinitions(currentDefinitions = [], schema = buildMigrationSchema()) {
    const output = (0, util_1.clone)(Array.isArray(currentDefinitions) ? currentDefinitions : []);
    const existing = buildMigrationSchema(output);
    for (const definition of schema?.definitions?.values?.() ?? []) {
        if (definition?.modelProposed !== true) continue;
        if (findOverlappingMigrationType(definition.label, existing)) continue;
        const next = {
            key: definition.key || `model-${(0, util_1.safeId)(definition.label) || definition.label}`,
            label: definition.label,
            description: definition.description || '',
            aliases: (0, util_1.unique)(definition.aliases ?? [definition.label]),
            enabled: true,
            constant: definition.constant === true,
            vectorized: definition.vectorized !== false,
            preventRecursion: definition.preventRecursion !== false,
            depth: Number(definition.depth ?? 4),
            order: Number(definition.order ?? 700),
            fields: (definition.fields ?? []).map((field) => ({ label: field.label, prompt: '', policy: field.policy || 'semantic-upsert', options: [] })),
        };
        output.push(next);
        existing.definitions.set(next.label, next);
        for (const alias of next.aliases) existing.aliasToType.set((0, util_1.normalizeFact)(alias), next.label);
    }
    return output;
}

class MigrationService {
    constructor(host, worldbook, getSettings, onProgress = null, saveSettings = null) {
        this.host = host;
        this.worldbook = worldbook;
        this.getSettings = getSettings;
        this.onProgress = typeof onProgress === 'function' ? onProgress : () => {};
        this.saveSettings = typeof saveSettings === 'function' ? saveSettings : null;
        this.backup = null;
        this.preview = null;
        this.resume = null;
    }
    scopeChatKey() { try { return this.host.chatKey(); } catch { return ''; } }
    canUndo() { return Boolean(this.backup && this.backup.chatKey === this.scopeChatKey()); }
    hasPreview() { return Boolean(this.preview && this.preview.chatKey === this.scopeChatKey()); }
    clearPreview() { this.preview = null; this.resume = null; return true; }
    previewSummary() { return this.hasPreview() ? (0, util_1.clone)(this.preview.summary) : null; }

    // [MA-REBUILD-01] “整理”改为只读扫描与 AI 重建预览。此步骤不写世界书。
    // [MA-REBUILD-05] 重建属于一次性迁移，允许受控多次请求：串行小批次、批次间隔、429退避和断点续跑。
    async migrate(settings, snapshot) {
        const validate = () => this.host.assertSnapshot(snapshot, this.getSettings());
        validate();
        const original = await this.worldbook.readRaw(settings, snapshot, validate);
        const initialSchema = buildMigrationSchema(settings?.keywordDefinitions);
        const records = collectRebuildRecords(original.data, initialSchema);
        const schema = buildMigrationSchema(settings?.keywordDefinitions, records);
        for (const record of records) annotateRecordSchema(record, schema);
        if (!records.length) {
            this.preview = null;
            this.resume = null;
            return { changed: false, previewReady: false, message: '当前世界书没有可重建的镜渊旧条目', candidates: 0 };
        }
        const fingerprint = rebuildFingerprint(original.name, records);
        const canResume = Boolean(this.resume
            && this.resume.chatKey === snapshot.chatKey
            && this.resume.worldbookName === original.name
            && this.resume.fingerprint === fingerprint);
        if (!canResume) {
            const sourceIndex = buildRebuildSourceIndex(records, schema);
            this.resume = {
                chatKey: snapshot.chatKey,
                worldbookName: original.name,
                fingerprint,
                sourceData: (0, util_1.clone)(original.data),
                records,
                schema,
                catalog: records.map((record) => `${record.uid}|${record.title}`).join('\n'),
                sourceIndex,
                planningComplete: false,
                plan: null,
                batches: [],
                totalBatchCount: 0,
                nextBatchIndex: 0,
                parsedBlocks: [],
                reviewComplete: false,
                requests: 0,
                retries: 0,
                lastRequestAt: 0,
                diagnostics: {
                    invalidLines: [],
                    warnings: ['重建将先建立场景锚点与游戏时间，再规划来源行的唯一宿主；同一来源行不会重复发送给多个对象'],
                    modelBatches: 0,
                    modelRequests: 0,
                    parserRepairs: 0,
                    compactedRecords: 0,
                    fragmentedRecords: 0,
                    semanticClusters: 0,
                    eventPasses: 0,
                    organizationPasses: 0,
                    customPasses: 0,
                    regionPasses: 0,
                    foundationPasses: 0,
                    sourceLines: sourceIndex.lines.length,
                },
            };
        }
        const state = this.resume;
        const knownUids = new Set(records.map((record) => record.uid));
        if (!state.planningComplete) {
            validate();
            this.emitProgress({
                state: 'running',
                current: 0,
                total: 1,
                requests: state.requests,
                retries: state.retries,
                detail: `正在规划${state.sourceIndex.lines.length}条旧事实的场景锚点、游戏时间、唯一宿主与事件边界`,
            });
            const prompt = (0, prompts_1.migrationPlanningPrompts)(state.sourceIndex.text, { schema: state.schema });
            let response;
            try {
                response = await this.requestBatch({
                    prompt,
                    batch: state.records,
                    settings,
                    snapshot,
                    validate,
                    state,
                    batchIndex: -1,
                    stage: 'migrationPlan',
                    sourceText: state.sourceIndex.text,
                    progressTotal: 1,
                });
            }
            catch (error) {
                this.emitProgress({ state: 'paused', current: 0, total: 1, requests: state.requests, retries: state.retries, detail: '全局重建规划请求未完成；下次点击将从规划阶段继续' });
                throw new Error(`世界书重建规划失败；尚未发送任何对象正文。${(0, util_1.errorText)(error)}`);
            }
            const plan = parseRebuildPlanningResponse(response, state.sourceIndex, state.schema);
            const groupTasks = buildPlannedRebuildTasks(plan, state.sourceIndex);
            const batches = packPlannedRebuildTasks(groupTasks);
            if (!batches.length) {
                this.resume = null;
                throw new Error('重建规划没有形成任何可处理对象；旧世界书未修改');
            }
            state.plan = plan;
            state.batches = batches;
            state.totalBatchCount = batches.length;
            state.planningComplete = true;
            state.diagnostics.warnings.push(...plan.warnings);
            state.diagnostics.modelBatches = batches.length + 1;
            state.diagnostics.semanticClusters = plan.groups.length;
            state.diagnostics.eventPasses = plan.groups.filter((group) => group.type === '事件').length;
            state.diagnostics.foundationPasses = plan.groups.filter((group) => group.type === '基础设定').length;
            state.diagnostics.customPasses = plan.groups.filter((group) => !ALLOWED_TYPES.has(group.type)).length;
            state.diagnostics.organizationPasses = plan.groups.filter((group) => (0, util_1.normalizeFact)(group.type) === (0, util_1.normalizeFact)('组织')).length;
            state.diagnostics.regionPasses = 0;
            state.diagnostics.planningGroups = plan.groups.length;
            state.diagnostics.sceneAnchors = plan.anchors?.length || 0;
            state.diagnostics.unknownGameTimeAnchors = (plan.anchors ?? []).filter((anchor) => anchor.gameTime === '未知').length;
            state.diagnostics.droppedSourceLines = plan.droppedRefs.length;
            state.diagnostics.fragmentedRecords = groupTasks.filter((batch) => Number(batch.fragmentCount || 1) > 1).length;
            state.diagnostics.jointBatches = batches.filter((batch) => batch.phase === 'planned-joint').length;
            this.emitProgress({ state: 'running', current: 0, total: batches.length, requests: state.requests, retries: state.retries, detail: `规划完成：${plan.groups.length}个候选，已按容量合并为${batches.length}次重建请求` });
        }
        for (; state.nextBatchIndex < state.batches.length;) {
            validate();
            const index = state.nextBatchIndex;
            const batch = state.batches[index];
            this.emitProgress({
                state: 'running',
                current: index + 1,
                total: state.batches.length,
                requests: state.requests,
                retries: state.retries,
                detail: `正在执行${migrationPhaseLabel(batch.phase)} ${index + 1}/${state.batches.length}：${batch.label || batch.clusterId || '未命名簇'}`,
            });
            const prompt = /^(?:planned|planned-joint)$/u.test(batch.phase)
                ? (0, prompts_1.plannedMigrationPrompts)(batch, { schema: state.schema })
                : (0, prompts_1.migrationPrompts)(batch, state.catalog, {
                    batchIndex: index + 1,
                    batchCount: state.batches.length,
                    totalRecords: records.length,
                    catalogBudget: MIGRATION_BATCH_CATALOG_BUDGET,
                    phase: batch.phase || 'entity',
                    clusterId: batch.clusterId || '',
                    stableName: batch.stableName || batch.label || '',
                    priorContext: buildPriorCandidateContext(state.parsedBlocks, batch),
                    schema: state.schema,
                });
            let response;
            try {
                response = await this.requestBatch({
                    prompt,
                    batch,
                    settings,
                    snapshot,
                    validate,
                    state,
                    batchIndex: index,
                    stage: 'migration',
                    sourceText: batch.sourceLineBody || batch.map((record) => record.content || '').join('\n'),
                });
            }
            catch (error) {
                this.emitProgress({
                    state: 'paused',
                    current: index,
                    total: state.batches.length,
                    requests: state.requests,
                    retries: state.retries,
                    detail: `已完成 ${index}/${state.batches.length} 批；下次从第 ${index + 1} 批继续`,
                });
                const reason = (0, util_1.errorText)(error);
                if (isMigrationRateLimitError(error)) {
                    throw new Error(`世界书重建被限流；已完成 ${index}/${state.batches.length} 批，下次点击将从第 ${index + 1} 批继续。${reason}`);
                }
                throw new Error(`世界书重建第 ${index + 1}/${state.batches.length} 批请求失败；已保存批次进度。${reason}`);
            }
            validate();
            try {
                const parsed = parseRebuildResponse(response, knownUids, state.diagnostics, rebuildParsePolicy(batch, records, state.schema));
                const preserved = preserveSparseRebuildBlocks(parsed, records, state.schema, state.diagnostics);
                if (!preserved.length) throw new Error('没有返回带旧UID证据的有效条目');
                const pendingSafe = preserveEventPendingFacts(preserved, records, state.diagnostics);
                // 保留生成阶段，最终全局收束时优先采用后续规则、地区与设定轮的归属判断。
                state.parsedBlocks.push(...pendingSafe.map((block) => ({ ...block, migrationPhase: batch.phase || 'entity', migrationOrder: index })));
            }
            catch (error) {
                // [MA-REBUILD-21] 模型格式或证据校验失败时，旧来源必须保持原状态。
                // 失败批次不得自动禁用、归档或改写；其他批次可继续重建。
                state.failedBatches ?? (state.failedBatches = []);
                state.failedBatches.push({ index, phase: batch.phase || 'entity', label: batch.label || batch.clusterId || '', reason: (0, util_1.errorText)(error) });
                state.diagnostics.warnings.push(`第 ${index + 1} 批未通过证据校验，已跳过；相关旧条目将在预览中原样保留`);
                state.nextBatchIndex += 1;
                this.emitProgress({
                    state: 'running',
                    current: state.nextBatchIndex,
                    total: state.batches.length,
                    requests: state.requests,
                    retries: state.retries,
                    detail: `第 ${index + 1} 批未通过校验，已释放并继续下一批`,
                });
                continue;
            }
            state.nextBatchIndex += 1;
            this.emitProgress({
                state: 'running',
                current: state.nextBatchIndex,
                total: state.batches.length,
                requests: state.requests,
                retries: state.retries,
                detail: `已完成 ${state.nextBatchIndex}/${state.batches.length} 批`,
            });
        }
        if ((state.failedBatches?.length || 0) > 0) {
            const failedLabels = state.failedBatches.slice(0, 8).map((item) => item.label || `第${item.index + 1}批`).join('、');
            state.diagnostics.warnings.push(`${state.failedBatches.length}个联合批次未通过模型格式或证据校验；这些批次涉及的旧条目将在预览中原样保留，不阻止其他结果提交${failedLabels ? `：${failedLabels}` : ''}`);
        }
        if (!state.parsedBlocks.length) {
            const failed = state.failedBatches?.length || 0;
            this.resume = null;
            this.preview = null;
            this.emitProgress({ state: 'failed', current: state.batches.length, total: state.batches.length, requests: state.requests, retries: state.retries, detail: '所有批次均未通过证据校验，已释放重建状态' });
            throw new Error(`模型没有返回可验证重建条目；${failed || state.batches.length}个批次已结束且重建状态已释放，旧表未修改。可重新生成预览，不会卡在原批次`);
        }
        let blocks = preserveEventPendingFacts(mergeRebuildBlocks(state.parsedBlocks, state.diagnostics), records, state.diagnostics);
        blocks = restoreUncoveredRebuildSourceLines(blocks, state.sourceIndex, state.plan?.droppedRefs ?? [], state.schema, state.diagnostics);
        const coverage = analyzeRebuildCoverage(records, blocks, state.schema, state.sourceIndex, state.plan?.droppedRefs ?? []);
        state.diagnostics.coverageEligible = coverage.eligibleCount;
        state.diagnostics.coverageCovered = coverage.coveredCount;
        state.diagnostics.coverageRatio = coverage.ratio;
        state.diagnostics.uncoveredEntries = coverage.uncovered.length;
        state.diagnostics.criticalUncoveredEntries = coverage.criticalUncovered.length;
        state.diagnostics.coverageEligibleLines = coverage.eligibleLineCount || 0;
        state.diagnostics.coverageCoveredLines = coverage.coveredLineCount || 0;
        state.diagnostics.uncoveredSourceLines = coverage.uncoveredLines?.length || 0;
        if (coverage.uncovered.length) {
            const critical = coverage.criticalUncovered.slice(0, 6).map((record) => record.title).join('、');
            state.diagnostics.warnings.push(`${coverage.uncovered.length}个旧条目未被可靠覆盖，将在预览中原样保留${critical ? `；其中关键条目：${critical}` : ''}`);
        }
        // 最终审核改为本地确定性校验：来源覆盖、重复宿主、身份冲突、场景边界与空壳已在解析和全局收束阶段完成。
        state.reviewComplete = true;
        state.diagnostics.reviewPassed = true;
        state.diagnostics.warnings.push('最终候选已完成本地结构校验；不再额外调用模型审核整表');
        const built = buildRebuildSnapshot(state.sourceData, records, blocks, state.diagnostics, state.schema, coverage.coveredUids);
        const summary = {
            previewReady: true,
            submitReady: true,
            worldbookName: original.name,
            candidates: records.length,
            batches: state.totalBatchCount || state.batches.length,
            requests: state.requests,
            retries: state.retries,
            compactedRecords: state.diagnostics.compactedRecords,
            fragmentedRecords: state.diagnostics.fragmentedRecords,
            semanticClusters: state.diagnostics.semanticClusters || 0,
            planningGroups: state.diagnostics.planningGroups || 0,
            sceneAnchors: state.diagnostics.sceneAnchors || 0,
            unknownGameTimeAnchors: state.diagnostics.unknownGameTimeAnchors || 0,
            sourceLines: state.diagnostics.sourceLines || 0,
            droppedSourceLines: state.diagnostics.droppedSourceLines || 0,
            reviewPassed: state.diagnostics.reviewPassed === true,
            eventPasses: state.diagnostics.eventPasses || 0,
            organizationPasses: state.diagnostics.organizationPasses || 0,
            customPasses: state.diagnostics.customPasses || 0,
            regionPasses: state.diagnostics.regionPasses || 0,
            foundationPasses: state.diagnostics.foundationPasses || 0,
            failedBatches: state.failedBatches?.length || 0,
            convergedEntries: Number(state.diagnostics.convergedEntries || 0),
            absorbedEntries: Number(state.diagnostics.absorbedEntries || 0),
            newTypes: [...state.schema.definitions.values()].filter((definition) => definition.modelProposed === true).map((definition) => definition.label),
            rebuildBatchId: built.rebuildBatchId,
            rebuiltEntries: built.rebuiltEntries,
            mergedOldEntries: built.mergedOldEntries,
            archivedEntries: built.archivedEntries,
            retainedOriginalEntries: built.retainedOriginalEntries || 0,
            preservedArchivedEntries: built.preservedArchivedEntries || 0,
            recoveredUi20Archives: built.recoveredUi20Archives || 0,
            coverageEligible: state.diagnostics.coverageEligible || 0,
            coverageCovered: state.diagnostics.coverageCovered || 0,
            coveragePercent: Math.round(Number(state.diagnostics.coverageRatio || 0) * 100),
            uncoveredEntries: state.diagnostics.uncoveredEntries || 0,
            criticalUncoveredEntries: state.diagnostics.criticalUncoveredEntries || 0,
            coverageEligibleLines: state.diagnostics.coverageEligibleLines || 0,
            coverageCoveredLines: state.diagnostics.coverageCoveredLines || 0,
            uncoveredSourceLines: state.diagnostics.uncoveredSourceLines || 0,
            knowledgeLines: built.knowledgeLines,
            deletedOldEntries: records.length - (built.retainedOriginalEntries || 0),
            preservedEntries: built.preservedEntries,
            warnings: state.diagnostics.warnings.slice(0, 12),
        };
        this.preview = {
            chatKey: snapshot.chatKey,
            worldbookName: original.name,
            settingsSignature: typeof this.host.settingsSignature === 'function' ? this.host.settingsSignature(settings) : '',
            sourceData: (0, util_1.clone)(state.sourceData),
            nextData: (0, util_1.clone)(built.data),
            summary,
            nextKeywordDefinitions: mergeProposedKeywordDefinitions(settings?.keywordDefinitions, state.schema),
        };
        this.resume = null;
        this.emitProgress({ state: 'success', current: summary.batches, total: summary.batches, requests: summary.requests, retries: summary.retries, detail: '联合批次处理完成，重建预览已生成；失败来源已原样保留' });
        return { changed: false, previewReady: true, ...summary };
    }

    async requestBatch({ prompt, batch, settings, snapshot, validate, state, batchIndex, stage = 'migration', sourceText = '', progressTotal = 0 }) {
        const retryLimit = migrationRateLimitRetries(settings);
        for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
            validate();
            const interval = migrationBatchIntervalMs(settings);
            const elapsed = Date.now() - Number(state.lastRequestAt || 0);
            if (state.lastRequestAt && elapsed < interval)
                await waitForMigration(interval - elapsed, validate, snapshot);
            try {
                state.requests += 1;
                state.diagnostics.modelRequests = state.requests;
                state.lastRequestAt = Date.now();
                return await (0, model_request_1.callModel)({
                    host: this.host,
                    stage,
                    prompt: { system: prompt.system, user: trimPrompt(prompt.user) },
                    fallbackPrompt: null,
                    settings,
                    snapshot,
                    profileId: settings.migrationProfileId,
                    sourceText: sourceText || batch.map((record) => record.content || '').join('\n'),
                });
            }
            catch (error) {
                if (!isMigrationRateLimitError(error) || attempt >= retryLimit) throw error;
                state.retries += 1;
                const waitMs = migrationRateLimitBackoffMs(settings, attempt);
                state.diagnostics.warnings.push(`第${batchIndex + 1}批触发限流，等待后进行第${attempt + 1}次重试`);
                this.emitProgress({
                    state: 'waiting',
                    current: batchIndex,
                    total: progressTotal || state.batches.length,
                    requests: state.requests,
                    retries: state.retries,
                    detail: `第 ${batchIndex + 1} 批限流，等待 ${Math.ceil(waitMs / 1000)} 秒后重试`,
                });
                await waitForMigration(waitMs, validate, snapshot);
            }
        }
        throw new Error('世界书重建请求未完成');
    }

    emitProgress(progress) {
        try { this.onProgress({ ...(progress || {}) }); }
        catch (error) { console.warn('[MirrorAbyss] migration progress callback failed', error); }
    }

    // [MA-REBUILD-02] 只有预览仍对应当前世界书时才原子提交；提交后重算召回并回读。
    async commit(settings, snapshot) {
        if (!this.preview) throw new Error('没有可提交的世界书重建预览');
        if (this.preview.chatKey !== snapshot.chatKey || this.preview.worldbookName !== snapshot.worldbookName)
            throw new Error('重建预览属于其他聊天或世界书，请重新生成预览');
        const currentSettingsSignature = typeof this.host.settingsSignature === 'function' ? this.host.settingsSignature(settings) : '';
        if (this.preview.settingsSignature && currentSettingsSignature !== this.preview.settingsSignature)
            throw new Error('插件设置在重建预览后已经变化，请重新生成预览');
        const validate = () => this.host.assertSnapshot(snapshot, this.getSettings());
        const preview = this.preview;
        validate();
        try {
            await this.worldbook.replaceRaw(settings, preview.worldbookName, preview.nextData, snapshot, validate, preview.sourceData);
            await this.worldbook.replanRecall(settings, snapshot, validate);
            const verified = await this.worldbook.readRaw(settings, snapshot, validate);
            verifyCommittedSnapshot(verified.data, preview.summary);
            const beforeKeywordDefinitions = (0, util_1.clone)(settings?.keywordDefinitions ?? []);
            const afterKeywordDefinitions = (0, util_1.clone)(preview.nextKeywordDefinitions ?? beforeKeywordDefinitions);
            if (this.saveSettings && JSON.stringify(beforeKeywordDefinitions) !== JSON.stringify(afterKeywordDefinitions)) {
                try {
                    await this.saveSettings({ keywordDefinitions: afterKeywordDefinitions });
                }
                catch (settingsError) {
                    try { await this.saveSettings({ keywordDefinitions: beforeKeywordDefinitions }); }
                    catch (settingsRollbackError) {
                        throw new Error(`重建关键词定义保存失败，且旧定义恢复失败：${(0, util_1.errorText)(settingsError)}；${(0, util_1.errorText)(settingsRollbackError)}`);
                    }
                    throw new Error(`重建关键词定义保存失败，已恢复旧定义：${(0, util_1.errorText)(settingsError)}`);
                }
            }
            this.backup = {
                chatKey: snapshot.chatKey,
                worldbookName: preview.worldbookName,
                data: (0, util_1.clone)(preview.sourceData),
                afterData: (0, util_1.clone)(verified.data),
                beforeKeywordDefinitions,
                afterKeywordDefinitions,
            };
            this.preview = null;
            return { changed: true, committed: true, ...preview.summary };
        }
        catch (error) {
            try {
                const current = await this.worldbook.readRaw(settings, snapshot, validate);
                await this.worldbook.replaceRaw(settings, preview.worldbookName, preview.sourceData, snapshot, validate, current.data);
            }
            catch (rollbackError) {
                this.preview = null;
                this.backup = null;
                throw new Error(`世界书重建失败且恢复旧表失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackError)}`);
            }
            this.preview = null;
            this.backup = null;
            throw error;
        }
    }

    async undo(settings, snapshot) {
        if (!this.backup) throw new Error('没有可撤销的上次世界书重建');
        if (this.backup.chatKey !== snapshot.chatKey || this.backup.worldbookName !== snapshot.worldbookName)
            throw new Error('上次重建属于其他聊天或世界书，不能在当前范围撤销');
        const validate = () => this.host.assertSnapshot(snapshot, this.getSettings());
        const backup = this.backup;
        if (Array.isArray(backup.afterKeywordDefinitions)
            && JSON.stringify(settings?.keywordDefinitions ?? []) !== JSON.stringify(backup.afterKeywordDefinitions))
            throw new Error('重建提交后关键词定义已经再次变化，不能覆盖新设置；请先恢复对应设置或重新重建');
        await this.worldbook.replaceRaw(settings, backup.worldbookName, backup.data, snapshot, validate, backup.afterData);
        try {
            if (this.saveSettings && Array.isArray(backup.beforeKeywordDefinitions)) {
                await this.saveSettings({ keywordDefinitions: backup.beforeKeywordDefinitions });
            }
        }
        catch (settingsError) {
            let settingsRollbackError = null;
            let worldbookRollbackError = null;
            try {
                if (this.saveSettings && Array.isArray(backup.afterKeywordDefinitions)) {
                    await this.saveSettings({ keywordDefinitions: backup.afterKeywordDefinitions });
                }
            }
            catch (error) { settingsRollbackError = error; }
            try {
                const current = await this.worldbook.readRaw(settings, snapshot, validate);
                await this.worldbook.replaceRaw(settings, backup.worldbookName, backup.afterData, snapshot, validate, current.data);
            }
            catch (error) { worldbookRollbackError = error; }
            if (settingsRollbackError || worldbookRollbackError) {
                throw new Error(`撤销重建时关键词定义保存失败，且事务恢复不完整：${(0, util_1.errorText)(settingsError)}${settingsRollbackError ? `；设置恢复失败：${(0, util_1.errorText)(settingsRollbackError)}` : ''}${worldbookRollbackError ? `；世界书恢复失败：${(0, util_1.errorText)(worldbookRollbackError)}` : ''}`);
            }
            throw new Error(`撤销重建时关键词定义保存失败，世界书与设置已恢复撤销前状态：${(0, util_1.errorText)(settingsError)}`);
        }
        this.backup = null;
        this.preview = null;
        this.resume = null;
        return { changed: true, restored: true };
    }
}
exports.MigrationService = MigrationService;

function buildRebuildBatches(records, bodyBudget = MIGRATION_CLUSTER_BODY_BUDGET, maxRecords = MIGRATION_BATCH_MAX_RECORDS) {
    const clusters = buildSemanticClusters(records);
    const batches = [];
    let currentClusters = [];
    let currentRecords = [];
    let currentSize = 0;
    const flush = () => {
        if (!currentRecords.length) return;
        const ids = currentClusters.map((cluster) => cluster.id);
        const labels = currentClusters.map((cluster) => cluster.name);
        batches.push(createMigrationTask('entity', ids.join(','), labels.length === 1 ? labels[0] : `${labels[0]}等${labels.length}个对象`, currentRecords, bodyBudget));
        currentClusters = [];
        currentRecords = [];
        currentSize = 0;
    };
    for (const cluster of clusters) {
        const tagged = cluster.records.map((record) => ({ ...record, semanticClusterId: cluster.id, semanticClusterName: cluster.name }));
        const clusterSize = tagged.reduce((sum, record) => sum + serializeRecord(record).length, 0);
        const wouldExceed = currentRecords.length && (currentRecords.length + tagged.length > maxRecords || currentSize + clusterSize > bodyBudget);
        if (wouldExceed) flush();
        currentClusters.push(cluster);
        currentRecords.push(...tagged);
        currentSize += clusterSize;
        if (tagged.length > maxRecords || clusterSize > bodyBudget) flush();
    }
    flush();
    const compactedRecords = batches.reduce((sum, batch) => sum + Number(batch.compactedRecords || 0), 0);
    const warnings = [];
    if (clusters.length) warnings.push(`旧条目已按对象身份归为${clusters.length}个语义簇；语义簇不会跨请求拆分`);
    if (batches.length < clusters.length) warnings.push(`多个小语义簇已安全合批为${batches.length}次对象请求，簇标记仍独立`);
    if (compactedRecords) warnings.push(`${compactedRecords}个来源正文已按簇内公平预算压缩，但UID、标题和首尾事实均保留`);
    return { batches, compactedRecords, fragmentedRecords: 0, warnings, semanticClusters: clusters.length };
}

function buildRebuildPlan(records, schema = buildMigrationSchema()) {
    const source = Array.isArray(records) ? records : [];
    for (const record of source) annotateRecordSchema(record, schema);
    // 世界与基础设定不再同时进入普通对象轮、地区轮和规则轮，避免同一来源被多角度重复建档。
    const builtinEntityTypes = new Set(['人物', '场景', '物品']);
    // 自定义表不在普通对象轮定型，统一进入扩展类型轮，确保使用其自身栏目与规则。
    const entity = buildRebuildBatches(source.filter((record) => builtinEntityTypes.has(recordType(record, schema))));
    const eventTasks = buildEventSynthesisTasks(source);
    const extendedTasks = buildExtendedSynthesisTasks(source, schema);
    const worldTasks = buildWorldSynthesisTasks(source);
    const regionTasks = worldTasks.length ? [] : buildRegionalSynthesisTasks(source);
    const foundationTasks = buildFoundationSynthesisTasks(source);
    const tasks = [...entity.batches, ...eventTasks, ...extendedTasks, ...worldTasks, ...regionTasks, ...foundationTasks];
    const compactedRecords = tasks.reduce((sum, task) => sum + Number(task.compactedRecords || 0), 0);
    const organizationPasses = extendedTasks.filter((task) => task.extensionKind === 'organization').length;
    const customPasses = extendedTasks.length;
    const warnings = [
        ...entity.warnings,
        eventTasks.length ? `事件轮将对${eventTasks.length}个事件生命周期独立重建` : '',
        customPasses ? `扩展类型轮将按当前表定义重建${customPasses}个组织或自定义实体簇` : '',
        worldTasks.length ? `世界轮将对现有世界条目进行一次全局收束，避免组织、地区与局势重复建档` : '',
        regionTasks.length ? `地区轮将对${regionTasks.length}个地区证据簇提炼局部规则` : '',
        foundationTasks.length ? `基础设定轮将按${foundationTasks.length}个规则主题提出候选` : '',
        '事件、扩展类型、地区和基础设定均必须引用当前任务来源UID；超出当前任务的目录UID不能充当证据',
    ].filter(Boolean);
    return {
        tasks,
        compactedRecords,
        warnings,
        semanticClusters: entity.semanticClusters,
        eventPasses: eventTasks.length,
        organizationPasses,
        customPasses,
        worldPasses: worldTasks.length,
        regionPasses: regionTasks.length,
        foundationPasses: foundationTasks.length,
    };
}

// [MA-REBUILD-11] 建立仅存在于本次重建内存中的来源行索引。
// 规划模型看到的是完整条目目录和每条事实的短预览；后续单组请求再使用该行的完整文本。
function buildRebuildSourceIndex(records, schema = buildMigrationSchema()) {
    const lines = [];
    const entries = [];
    const lineByRef = new Map();
    const source = Array.isArray(records) ? records : [];
    let order = 0;
    for (const record of source) {
        const restoredTitle = archivedSourceTitle(record) || (0, util_1.normalizeTitle)(record.title);
        const restoredSplit = (0, util_1.splitTitle)(restoredTitle);
        const type = resolveMigrationType(restoredSplit?.type || recordType(record, schema), schema);
        const name = restoredSplit?.name || record.name || record.title;
        const parsed = (0, parser_1.parseEntrySections)(record.content || '');
        const existingSpacetime = readExistingRebuildSpacetime(record, parsed);
        const entry = {
            uid: String(record.uid),
            type,
            name,
            title: `${type}｜${name}`,
            keywords: (0, util_1.unique)((record.keywords ?? []).filter(isMeaningfulRebuildKeyword)).slice(0, 6),
            refs: [],
            empty: true,
            existingSpacetime,
        };
        const sectionOrder = parsed.order?.length ? parsed.order : ['旧格式正文'];
        const rawFallback = parsed.order?.length
            ? null
            : String(record.content ?? '').replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
        for (let sectionIndex = 0; sectionIndex < sectionOrder.length; sectionIndex += 1) {
            const section = sectionOrder[sectionIndex];
            // 【时空锚点】不作为剧情事实重复送入模型；旧锚点只以规划元数据提示复用。
            if (section === REBUILD_SPACETIME_SECTION) continue;
            const values = rawFallback ?? (parsed.values?.[section] ?? []);
            let lineIndex = 0;
            for (const rawLine of values) {
                const text = (0, parser_1.normalizePointLine)(String(rawLine ?? '').trim());
                if (!text || /^【\s*[^】]+\s*】$/u.test(text)) continue;
                const ref = `${record.uid}:s${sectionIndex}:l${lineIndex}`;
                lineIndex += 1;
                const item = {
                    ref,
                    uid: String(record.uid),
                    type,
                    name,
                    title: entry.title,
                    section,
                    text,
                    order: order++,
                    priorSceneAnchors: [...existingSpacetime.sceneAnchors],
                    priorGameTime: existingSpacetime.gameTime,
                    priorTimeSource: existingSpacetime.timeSource,
                    priorLocation: existingSpacetime.location,
                    priorTemporalState: existingSpacetime.temporalState,
                };
                lines.push(item);
                lineByRef.set(ref, item);
                entry.refs.push(ref);
                entry.empty = false;
            }
        }
        entries.push(entry);
    }
    const text = entries.map((entry) => {
        const prior = entry.existingSpacetime;
        const priorText = prior.sceneAnchors.length
            ? `|已有时空:${prior.sceneAnchors.join('、')}@${prior.gameTime}@${prior.location}[${prior.timeSource};${prior.temporalState}]`
            : '';
        const header = `ENTRY|${entry.uid}|${entry.type}|${entry.name}|关键词:${entry.keywords.join('、') || '无'}${priorText}`;
        if (!entry.refs.length) return `${header}\nEMPTY|${entry.uid}`;
        const body = entry.refs.map((ref) => {
            const item = lineByRef.get(ref);
            return `${item.ref}|${item.section}|${clipPlanningLine(item.text, MIGRATION_PLAN_LINE_PREVIEW)}`;
        }).join('\n');
        return `${header}\n${body}`;
    }).join('\n\n');
    return { text, lines, entries, lineByRef, refs: new Set(lines.map((line) => line.ref)) };
}


function readExistingRebuildSpacetime(record, parsed) {
    const extension = record?.raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY] ?? {};
    const metadataLines = parsed?.values?.[REBUILD_SPACETIME_SECTION] ?? [];
    const metadata = new Map(metadataLines.map((line) => {
        const match = String(line ?? '').match(/^([^：:]{1,24})\s*[：:]\s*(.*)$/u);
        return match ? [match[1].trim(), match[2].trim()] : ['', ''];
    }).filter(([key]) => key));
    const sceneAnchors = (0, util_1.unique)([
        ...(0, util_1.normalizeStringArray)(extension.sceneAnchors),
        ...parseSceneAnchorList(metadata.get('场景锚点') || ''),
    ]).filter((anchor) => /^S\d{3,6}$/u.test(String(anchor)));
    return {
        sceneAnchors,
        gameTime: normalizeRebuildGameTime(extension.gameTime || metadata.get('游戏时间')),
        timeSource: normalizeRebuildTimeSource(extension.timeSource || metadata.get('时间来源')),
        location: String(extension.anchorLocation || metadata.get('地点') || '未知').trim() || '未知',
        temporalState: normalizeRebuildTemporalState(extension.temporalState || metadata.get('时态'), record?.type),
    };
}

function clipPlanningLine(value, maxChars) {
    const text = String(value ?? '').replace(/\s+/gu, ' ').trim();
    if (text.length <= maxChars) return text;
    return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function parseRebuildPlanningResponse(raw, sourceIndex, schema = buildMigrationSchema()) {
    const knownRefs = sourceIndex?.refs instanceof Set ? sourceIndex.refs : new Set();
    const assigned = new Set();
    const groups = [];
    const rawAnchors = [];
    const droppedRefs = new Set();
    const warnings = [];
    const text = String(raw ?? '').replace(/```(?:text|markdown|md)?/giu, '').replace(/\r/g, '').trim();
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        const parts = line.split('|').map((part) => part.trim());
        if (parts[0] === 'ANCHOR' && parts.length >= 6) {
            const id = parts[1] || `A${rawAnchors.length + 1}`;
            const gameTime = normalizeRebuildGameTime(parts[2]);
            const location = String(parts[3] || '未知').trim() || '未知';
            const timeSource = normalizeRebuildTimeSource(parts[4]);
            const refs = parsePlanningRefs(parts.slice(5).join('|')).filter((ref) => {
                if (!knownRefs.has(ref)) {
                    warnings.push(`场景锚点${id}引用了不存在的来源行${ref}，已忽略`);
                    return false;
                }
                return true;
            });
            if (refs.length) rawAnchors.push({ id, gameTime, location, timeSource, refs, modelOrder: rawAnchors.length });
            continue;
        }
        if (parts[0] === 'GROUP' && parts.length >= 6) {
            const id = parts[1] || `G${groups.length + 1}`;
            const rawType = String(parts[2] || '').trim();
            const proposalMatch = rawType.match(/^新类型建议\s*[：:]\s*(.+)$/u);
            const type = proposalMatch ? String(proposalMatch[1]).trim() : resolveMigrationType(rawType, schema);
            const name = parts[3];
            const mode = parts[4] === '并入' ? 'merge' : 'independent';
            if ((!proposalMatch && !schema?.definitions?.has(type)) || !type || !name) {
                warnings.push(`规划组${id}的类型或名称无效，已忽略`);
                continue;
            }
            const refs = parsePlanningRefs(parts.slice(5).join('|')).filter((ref) => {
                if (!knownRefs.has(ref)) {
                    warnings.push(`规划引用了不存在的来源行${ref}，已忽略`);
                    return false;
                }
                if (assigned.has(ref)) {
                    warnings.push(`来源行${ref}被重复分配，已保留首次归属`);
                    return false;
                }
                assigned.add(ref);
                return true;
            });
            if (refs.length) groups.push({ id, type, name, mode, refs, newTypeProposal: Boolean(proposalMatch) });
            continue;
        }
        if (parts[0] === 'DROP' && parts.length >= 3) {
            for (const ref of parsePlanningRefs(parts.slice(2).join('|'))) {
                if (!knownRefs.has(ref) || assigned.has(ref)) continue;
                assigned.add(ref);
                droppedRefs.add(ref);
            }
            continue;
        }
        warnings.push(`无法识别的规划行已忽略：${line.slice(0, 100)}`);
    }
    // 模型漏掉的来源行不复制到多个批次，而是按原条目建立单一待复核组，确保不丢失且仍只发送一次。
    const missingByEntry = new Map();
    for (const item of sourceIndex?.lines ?? []) {
        if (assigned.has(item.ref)) continue;
        const key = `${item.uid}|${item.type}|${item.name}`;
        const current = missingByEntry.get(key) ?? { id: `F${missingByEntry.size + 1}`, type: item.type, name: item.name, mode: 'independent', refs: [] };
        current.refs.push(item.ref);
        missingByEntry.set(key, current);
        assigned.add(item.ref);
    }
    if (missingByEntry.size) warnings.push(`规划模型遗漏${[...missingByEntry.values()].reduce((sum, group) => sum + group.refs.length, 0)}条来源行，已按原宿主建立单一待复核组`);
    groups.push(...missingByEntry.values());
    const converged = [];
    const byIdentity = new Map();
    for (const group of groups) {
        const key = `${group.type}|${(0, util_1.normalizeFact)(group.name)}|${group.mode}`;
        const existing = byIdentity.get(key);
        if (existing) existing.refs.push(...group.refs);
        else {
            const next = { ...group, refs: [...group.refs] };
            byIdentity.set(key, next);
            converged.push(next);
        }
    }
    const sortedGroups = converged.map((group) => ({ ...group, refs: (0, util_1.unique)(group.refs).sort((a, b) => (sourceIndex.lineByRef.get(a)?.order ?? 0) - (sourceIndex.lineByRef.get(b)?.order ?? 0)) }));
    const anchorResult = canonicalizeRebuildAnchors(rawAnchors, sortedGroups, sourceIndex, warnings);
    const anchorOrder = new Map((anchorResult.anchors ?? []).map((anchor, index) => [anchor.id, index]));
    const anchoredGroups = sortedGroups.map((group) => ({
        ...group,
        sceneAnchors: (0, util_1.unique)((group.refs ?? []).map((ref) => anchorResult.anchorByRef.get(ref)).filter(Boolean))
            .sort((left, right) => Number(anchorOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - Number(anchorOrder.get(right) ?? Number.MAX_SAFE_INTEGER)),
    }));
    return {
        groups: anchoredGroups,
        anchors: anchorResult.anchors,
        anchorByRef: anchorResult.anchorByRef,
        droppedRefs: [...droppedRefs],
        warnings,
        totalRefs: knownRefs.size,
        assignedRefs: assigned.size,
    };
}

function parsePlanningRefs(value) {
    return (0, util_1.unique)(String(value ?? '').split(/[,，、\s]+/u).map((item) => item.trim()).filter((item) => /^.+:s\d+:l\d+$/u.test(item)));
}

function canonicalizeRebuildAnchors(rawAnchors, groups, sourceIndex, warnings) {
    const byRef = new Map();
    const candidates = [];
    for (const anchor of rawAnchors ?? []) {
        const refs = [];
        for (const ref of anchor.refs ?? []) {
            if (byRef.has(ref)) {
                warnings.push(`来源行${ref}被重复分配到多个场景锚点，已保留首次归属`);
                continue;
            }
            byRef.set(ref, anchor.id);
            refs.push(ref);
        }
        if (refs.length) candidates.push({ ...anchor, refs });
    }
    let fallbackCount = 0;
    for (const group of groups ?? []) {
        const missing = (group.refs ?? []).filter((ref) => !byRef.has(ref));
        if (!missing.length) continue;
        fallbackCount += missing.length;
        const buckets = new Map();
        for (const ref of missing) {
            const item = sourceIndex?.lineByRef?.get(ref);
            const prior = (item?.priorSceneAnchors ?? []).length === 1 ? item.priorSceneAnchors[0] : '';
            const key = prior || `AUTO-${group.id}`;
            const current = buckets.get(key) ?? [];
            current.push(ref);
            buckets.set(key, current);
        }
        for (const [key, refs] of buckets.entries()) {
            const priorItems = refs.map((ref) => sourceIndex?.lineByRef?.get(ref)).filter(Boolean);
            const gameTimes = (0, util_1.unique)(priorItems.map((item) => normalizeRebuildGameTime(item.priorGameTime)).filter((value) => value !== '未知'));
            const locations = (0, util_1.unique)(priorItems.map((item) => String(item.priorLocation || '').trim()).filter((value) => value && value !== '未知'));
            const timeSources = priorItems.map((item) => normalizeRebuildTimeSource(item.priorTimeSource));
            const id = /^S\d{3,6}$/u.test(key) ? `EXIST-${key}` : key;
            const fallback = {
                id,
                preferredSceneAnchor: /^S\d{3,6}$/u.test(key) ? key : '',
                gameTime: gameTimes.length === 1 ? gameTimes[0] : '未知',
                location: locations.length === 1 ? locations[0] : (group.type === '场景' ? group.name : '未知'),
                timeSource: gameTimes.length === 1 ? (timeSources.includes('未知') ? '未知' : timeSources.includes('推定') ? '推定' : '明确') : '未知',
                refs,
                modelOrder: (rawAnchors?.length ?? 0) + candidates.length,
            };
            candidates.push(fallback);
            for (const ref of refs) byRef.set(ref, id);
        }
    }
    if (fallbackCount) warnings.push(`规划模型未给${fallbackCount}条来源事实分配游戏时间或地点，已建立“时间未知”的场景锚点，未虚构日期`);
    const merged = [];
    const mergeByKey = new Map();
    for (const anchor of candidates) {
        // 相同地点和时段仍可能存在多个连续事件段；只有规划器明确复用同一锚点ID时才合并。
        const key = String(anchor.id);
        const existing = mergeByKey.get(key);
        if (existing) {
            existing.refs.push(...anchor.refs);
            existing.modelOrder = Math.min(Number(existing.modelOrder ?? Number.MAX_SAFE_INTEGER), Number(anchor.modelOrder ?? Number.MAX_SAFE_INTEGER));
        }
        else {
            const next = { ...anchor, refs: [...anchor.refs] };
            mergeByKey.set(key, next);
            merged.push(next);
        }
    }
    const validated = merged.map((anchor) => ({
        ...anchor,
        preferredSceneAnchor: preferredExistingSceneAnchor(anchor, sourceIndex),
        ...validateRebuildAnchorTime(anchor, anchor.refs, sourceIndex, warnings),
        location: validateRebuildAnchorLocation(anchor, anchor.refs, sourceIndex, warnings),
    }));
    validated.sort((left, right) => compareRebuildGameTime(left.gameTime, right.gameTime)
        || Number(left.modelOrder ?? Number.MAX_SAFE_INTEGER) - Number(right.modelOrder ?? Number.MAX_SAFE_INTEGER)
        || Math.min(...left.refs.map((ref) => sourceIndex?.lineByRef?.get(ref)?.order ?? Number.MAX_SAFE_INTEGER)) - Math.min(...right.refs.map((ref) => sourceIndex?.lineByRef?.get(ref)?.order ?? Number.MAX_SAFE_INTEGER))
        || String(left.id).localeCompare(String(right.id), 'zh-CN', { numeric: true }));
    const existingIds = new Set((sourceIndex?.lines ?? []).flatMap((item) => item.priorSceneAnchors ?? []).filter((anchor) => /^S\d{3,6}$/u.test(String(anchor))));
    let nextAnchorNumber = Math.max(0, ...[...existingIds].map((anchor) => Number(String(anchor).slice(1)) || 0)) + 1;
    const claimedIds = new Set();
    const anchorByRef = new Map();
    const anchors = validated.map((anchor, index) => {
        let sceneAnchor = String(anchor.preferredSceneAnchor || '');
        if (!/^S\d{3,6}$/u.test(sceneAnchor) || claimedIds.has(sceneAnchor)) sceneAnchor = '';
        if (!sceneAnchor) {
            if (!existingIds.size) sceneAnchor = `S${String(index + 1).padStart(3, '0')}`;
            else {
                while (existingIds.has(`S${String(nextAnchorNumber).padStart(3, '0')}`) || claimedIds.has(`S${String(nextAnchorNumber).padStart(3, '0')}`)) nextAnchorNumber += 1;
                sceneAnchor = `S${String(nextAnchorNumber).padStart(3, '0')}`;
                nextAnchorNumber += 1;
            }
        }
        claimedIds.add(sceneAnchor);
        const refs = (0, util_1.unique)(anchor.refs).sort((a, b) => (sourceIndex?.lineByRef?.get(a)?.order ?? 0) - (sourceIndex?.lineByRef?.get(b)?.order ?? 0));
        for (const ref of refs) anchorByRef.set(ref, sceneAnchor);
        return {
            id: sceneAnchor,
            modelId: anchor.id,
            gameTime: anchor.gameTime,
            location: String(anchor.location || '未知').trim() || '未知',
            timeSource: anchor.timeSource,
            refs,
        };
    });
    return { anchors, anchorByRef };
}


function preferredExistingSceneAnchor(anchor, sourceIndex) {
    if (/^S\d{3,6}$/u.test(String(anchor?.preferredSceneAnchor || ''))) return String(anchor.preferredSceneAnchor);
    const perRef = (anchor?.refs ?? []).map((ref) => {
        const anchors = sourceIndex?.lineByRef?.get(ref)?.priorSceneAnchors ?? [];
        return anchors.length === 1 ? anchors[0] : '';
    });
    if (!perRef.length || perRef.some((value) => !value)) return '';
    const unique = (0, util_1.unique)(perRef);
    return unique.length === 1 && /^S\d{3,6}$/u.test(unique[0]) ? unique[0] : '';
}

function validateRebuildAnchorTime(anchor, refs, sourceIndex, warnings) {
    let gameTime = normalizeRebuildGameTime(anchor?.gameTime);
    let timeSource = normalizeRebuildTimeSource(anchor?.timeSource);
    if (gameTime === '未知') return { gameTime, timeSource: '未知' };
    const evidence = (refs ?? []).map((ref) => {
        const item = sourceIndex?.lineByRef?.get(ref);
        return item ? `${item.title}\n${item.section}\n${item.text}\n${item.priorGameTime || ''}` : '';
    }).join('\n');
    const temporalMarker = /(?:第\s*\d+\s*天|\d{4}\s*年|\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|凌晨|黎明|清晨|早晨|上午|中午|下午|傍晚|晚上|夜晚|深夜|当晚|次日|翌日|第二天|几天后|数日后|周后|月后|年后|小时后|分钟后|此前|后来|随后)/u.test(evidence);
    if (!temporalMarker) {
        warnings.push(`场景锚点${anchor.id}缺少可验证的游戏时间线索，模型给出的“${gameTime}”已降级为未知`);
        return { gameTime: '未知', timeSource: '未知' };
    }
    if (timeSource === '明确' && !rebuildExplicitTimeMatches(gameTime, evidence)) {
        timeSource = '推定';
        warnings.push(`场景锚点${anchor.id}的游戏时间只能由相对时间或上下文推出，已从“明确”降级为“推定”`);
    }
    return { gameTime, timeSource };
}

function rebuildExplicitTimeMatches(gameTime, evidence) {
    const time = String(gameTime ?? '');
    const source = String(evidence ?? '');
    const day = time.match(/第\s*(\d+)\s*天/u)?.[1];
    if (day && !new RegExp(`第\\s*${day}\\s*天`, 'u').test(source)) return false;
    const date = time.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/u);
    if (date && !new RegExp(`${date[1]}\\D+${Number(date[2])}\\D+${Number(date[3])}`, 'u').test(source)) return false;
    const dayparts = ['凌晨', '黎明', '清晨', '早晨', '上午', '中午', '下午', '傍晚', '晚上', '夜晚', '深夜'];
    const named = dayparts.find((part) => time.includes(part));
    if (named && !source.includes(named)) return false;
    return Boolean(day || date || named || source.includes(time));
}


function validateRebuildAnchorLocation(anchor, refs, sourceIndex, warnings) {
    const location = String(anchor?.location || '未知').trim() || '未知';
    if (location === '未知') return '未知';
    const evidence = (refs ?? []).map((ref) => {
        const item = sourceIndex?.lineByRef?.get(ref);
        return item ? `${item.title}\n${item.section}\n${item.text}\n${item.priorLocation || ''}` : '';
    }).join('\n');
    const normalizedLocation = normalizeRebuildLocationEvidence(location);
    const normalizedEvidence = normalizeRebuildLocationEvidence(evidence);
    const roomTokens = location.match(/(?:[A-Za-z]?\d{2,6}(?:号|室|房)?)/gu) ?? [];
    const roomMatched = roomTokens.some((token) => evidence.includes(token));
    const directMatched = normalizedLocation.length >= 2 && normalizedEvidence.length >= 2
        && (normalizedEvidence.includes(normalizedLocation) || normalizedLocation.includes(normalizedEvidence));
    if (directMatched || roomMatched) return location;
    warnings.push(`场景锚点${anchor.id}缺少可验证的地点线索，模型给出的“${location}”已降级为未知`);
    return '未知';
}

function normalizeRebuildLocationEvidence(value) {
    return (0, util_1.normalizeFact)(String(value ?? ''))
        .replace(/(?:发生地点|当前地点|所在地|场景|地点|位置)/gu, '')
        .replace(/(?:内部|内|外部|外)$/gu, '');
}

function compareRebuildGameTime(leftValue, rightValue) {
    const left = parseComparableRebuildGameTime(leftValue);
    const right = parseComparableRebuildGameTime(rightValue);
    if (!left || !right || left.kind !== right.kind) return 0;
    return left.value - right.value;
}

function parseComparableRebuildGameTime(value) {
    const text = String(value ?? '').trim();
    let match = text.match(/第\s*(\d{1,6})\s*天/u);
    if (match) return { kind: 'relative-day', value: Number(match[1]) * 10 + rebuildDaypartOrder(text) };
    match = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/u) || text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/u);
    if (match) return { kind: 'date', value: Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000 + rebuildDaypartOrder(text) / 10 };
    return null;
}

function rebuildDaypartOrder(value) {
    const text = String(value ?? '');
    if (/(?:凌晨|黎明)/u.test(text)) return 0;
    if (/(?:清晨|早晨|上午)/u.test(text)) return 1;
    if (/(?:中午|午间)/u.test(text)) return 2;
    if (/(?:下午|傍晚)/u.test(text)) return 3;
    if (/(?:晚上|夜晚|深夜|当晚)/u.test(text)) return 4;
    return 5;
}

function normalizeRebuildGameTime(value) {
    const text = String(value ?? '').replace(/\s+/gu, ' ').trim();
    if (!text || /^(?:无|不明|未知时间|无法确定)$/u.test(text)) return '未知';
    return text.slice(0, 80);
}

function normalizeRebuildTimeSource(value) {
    const text = String(value ?? '').trim();
    return TIME_SOURCES.has(text) ? text : '未知';
}

function normalizeRebuildTemporalState(value, type = '') {
    const text = String(value ?? '').trim();
    if (TEMPORAL_STATES.has(text)) return text;
    if (type === '事件') return '已完成';
    if (type === '基础设定') return '长期';
    return '当前';
}

function buildPlannedRebuildTasks(plan, sourceIndex, bodyBudget = MIGRATION_PLANNED_GROUP_BUDGET) {
    const tasks = [];
    for (const group of plan?.groups ?? []) {
        const chunks = [];
        let current = [];
        let size = 0;
        for (const ref of group.refs ?? []) {
            const item = sourceIndex?.lineByRef?.get(ref);
            if (!item) continue;
            const lineSize = item.text.length + item.section.length + item.ref.length + 12;
            if (current.length && size + lineSize > bodyBudget) {
                chunks.push(current);
                current = [];
                size = 0;
            }
            current.push(item);
            size += lineSize;
        }
        if (current.length) chunks.push(current);
        for (let index = 0; index < chunks.length; index += 1) {
            const chunk = chunks[index];
            const byUid = new Map();
            for (const item of chunk) {
                const currentRecord = byUid.get(item.uid) ?? {
                    uid: item.uid,
                    title: item.title,
                    type: item.type,
                    name: item.name,
                    keywords: [],
                    content: '',
                };
                currentRecord.content += `${currentRecord.content ? '\n' : ''}[${item.ref}][${item.section}] ${item.text}`;
                byUid.set(item.uid, currentRecord);
            }
            const task = [...byUid.values()];
            task.phase = 'planned';
            task.clusterId = `planned:${group.id}`;
            task.label = `${group.type}｜${group.name}`;
            task.stableName = group.name;
            task.outputType = group.type;
            task.newTypeProposal = group.newTypeProposal === true;
            task.retentionMode = group.mode;
            task.planGroupId = group.id;
            task.fragmentIndex = index + 1;
            task.fragmentCount = chunks.length;
            task.sourceRefs = chunk.map((item) => item.ref);
            task.allowedSourceRefs = new Set(task.sourceRefs);
            task.sourceLineByRef = new Map(chunk.map((item) => [item.ref, item]));
            task.sceneAnchors = (0, util_1.unique)(task.sourceRefs.map((ref) => plan?.anchorByRef?.get(ref)).filter(Boolean));
            task.anchorCatalog = (plan?.anchors ?? []).filter((anchor) => task.sceneAnchors.includes(anchor.id));
            task.sourceLineBody = formatPlannedSourceLines(chunk);
            task.compactedRecords = 0;
            tasks.push(task);
        }
    }
    return tasks;
}


function packPlannedRebuildTasks(tasks, bodyBudget = MIGRATION_PLANNED_JOINT_BUDGET, maxGroups = MIGRATION_PLANNED_JOINT_MAX_GROUPS) {
    const output = [];
    let current = [];
    let size = 0;
    const flush = () => {
        if (!current.length) return;
        if (current.length === 1) {
            output.push(current[0]);
            current = [];
            size = 0;
            return;
        }
        const records = [...new Map(current.flatMap((task) => [...task]).map((record) => [String(record.uid), record])).values()];
        const batch = records;
        batch.phase = 'planned-joint';
        batch.clusterId = `joint:${current.map((task) => task.planGroupId).join('+')}`;
        batch.label = current.map((task) => task.label).join('、');
        batch.stableName = '';
        batch.outputTypes = (0, util_1.unique)(current.map((task) => task.outputType));
        batch.newTypeProposal = current.some((task) => task.newTypeProposal === true);
        batch.jointGroups = current.map((task) => ({
            id: task.planGroupId,
            type: task.outputType,
            name: task.stableName,
            newTypeProposal: task.newTypeProposal === true,
            sourceRefs: [...(task.sourceRefs ?? [])],
            sceneAnchors: [...(task.sceneAnchors ?? [])],
            anchorCatalog: (0, util_1.clone)(task.anchorCatalog ?? []),
            sourceLineBody: task.sourceLineBody,
        }));
        batch.sourceRefs = (0, util_1.unique)(current.flatMap((task) => task.sourceRefs ?? []));
        batch.allowedSourceRefs = new Set(batch.sourceRefs);
        batch.sourceLineByRef = new Map(current.flatMap((task) => [...(task.sourceLineByRef ?? new Map()).entries()]));
        batch.sceneAnchors = (0, util_1.unique)(current.flatMap((task) => task.sceneAnchors ?? []));
        batch.anchorCatalog = [...new Map(current.flatMap((task) => task.anchorCatalog ?? []).map((anchor) => [anchor.id, (0, util_1.clone)(anchor)])).values()];
        batch.sourceLineBody = current.map((task) => `===GROUP ${task.planGroupId}|${task.outputType}|${task.stableName}===\n${task.sourceLineBody}`).join('\n\n');
        batch.compactedRecords = current.reduce((sum, task) => sum + Number(task.compactedRecords || 0), 0);
        output.push(batch);
        current = [];
        size = 0;
    };
    for (const task of tasks ?? []) {
        const taskSize = String(task.sourceLineBody || '').length + 300;
        const fragmented = Number(task.fragmentCount || 1) > 1;
        if (fragmented || taskSize > bodyBudget * 0.72) {
            flush();
            output.push(task);
            continue;
        }
        if (current.length && (current.length >= maxGroups || size + taskSize > bodyBudget)) flush();
        current.push(task);
        size += taskSize;
    }
    flush();
    return output;
}

function formatPlannedSourceLines(lines) {
    const groups = new Map();
    for (const item of lines ?? []) {
        const current = groups.get(item.uid) ?? { title: item.title, lines: [] };
        current.lines.push(`[${item.ref}][${item.section}] ${item.text}`);
        groups.set(item.uid, current);
    }
    return [...groups.entries()].map(([uid, group]) => `<<<SOURCE uid=${uid}>>>\n标题：${group.title}\n${group.lines.join('\n')}\n<<<END_SOURCE>>>`).join('\n\n');
}

function buildRebuildReviewCatalog(blocks, sourceIndex = null, maxChars = 22000, coverage = null) {
    const pieces = [];
    if (coverage) {
        const uncovered = coverage.uncovered.slice(0, 20).map((record) => record.title).join('、') || '无';
        pieces.push(`COVERAGE|${coverage.coveredCount}/${coverage.eligibleCount}|未覆盖:${uncovered}`);
    }
    for (const block of blocks ?? []) {
        const refs = (block.sourceRefs ?? []).join(',');
        const header = `ENTRY|${block.type}｜${block.name}|来源行:${refs || '无'}`;
        const sections = (block.sections ?? []).map((section) => `${section.name}:${(section.lines ?? []).map((line) => clipPlanningLine(stripSourceLineMarkers(line), 120)).join('；')}`).join('\n');
        const evidence = sourceIndex?.lineByRef instanceof Map
            ? (block.sourceRefs ?? []).map((ref) => {
                const item = sourceIndex.lineByRef.get(ref);
                return item ? `SRC|${ref}|${item.section}|${clipPlanningLine(item.text, 56)}` : '';
            }).filter(Boolean).join('\n')
            : '';
        pieces.push(`${header}\n${sections}${evidence ? `\n${evidence}` : ''}`);
    }
    const text = pieces.join('\n\n');
    return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n[候选目录已按校验预算截断]`;
}

function rebuildRecordIsPreArchived(record) {
    const extension = record?.raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY];
    return record?.raw?.disable === true || extension?.archive === true;
}

function rebuildRecordIsCritical(record, schema = null) {
    if (rebuildRecordIsPreArchived(record)) return false;
    const type = recordType(record, schema);
    const extension = record?.raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY] ?? {};
    const lifecycle = String(extension.lifecycle ?? '').trim();
    const semanticRole = String(extension.semanticRole ?? '').trim();
    const sceneStage = String(extension.sceneStage ?? '').trim();
    if (type === '基础设定') return true;
    if (extension.focus === true) return true;
    if (/^(?:core|active)$/iu.test(lifecycle)) return true;
    if (/^(?:event-active|scene-current)$/iu.test(semanticRole)) return true;
    if (sceneStage === 'current') return true;
    return false;
}

function analyzeRebuildCoverage(records, blocks, schema = null, sourceIndex = null, droppedRefs = []) {
    const eligible = (records ?? []).filter((record) => !isControlPromptRaw(record.raw) && !rebuildRecordIsPreArchived(record));
    if (!sourceIndex?.lines?.length) {
        const coveredUids = new Set((blocks ?? []).flatMap((block) => block.sourceUids ?? []).map(String));
        const uncovered = eligible.filter((record) => !coveredUids.has(String(record.uid)));
        const criticalUncovered = uncovered.filter((record) => rebuildRecordIsCritical(record, schema));
        const coveredCount = Math.max(0, eligible.length - uncovered.length);
        const ratio = eligible.length ? coveredCount / eligible.length : 1;
        return { coveredUids, eligibleCount: eligible.length, coveredCount, uncovered, criticalUncovered, ratio, eligibleLineCount: 0, coveredLineCount: 0, uncoveredLines: [] };
    }
    const eligibleUids = new Set(eligible.map((record) => String(record.uid)));
    const dropped = new Set((droppedRefs ?? []).map(String));
    const eligibleLines = sourceIndex.lines.filter((item) => eligibleUids.has(String(item.uid)));
    const coveredRefs = new Set();
    const uncoveredLines = [];
    for (const item of eligibleLines) {
        if (isLocallyDiscardableSourceLine(item) || (dropped.has(item.ref) && isSafeApprovedSourceDrop(item))) {
            coveredRefs.add(item.ref);
            continue;
        }
        if (rebuildSourceLineRepresented(item, blocks)) coveredRefs.add(item.ref);
        else uncoveredLines.push(item);
    }
    const refsByUid = new Map();
    for (const item of eligibleLines) {
        const list = refsByUid.get(String(item.uid)) ?? [];
        list.push(item.ref);
        refsByUid.set(String(item.uid), list);
    }
    const coveredUids = new Set();
    for (const record of eligible) {
        const refs = refsByUid.get(String(record.uid)) ?? [];
        if (refs.length ? refs.every((ref) => coveredRefs.has(ref)) : (blocks ?? []).some((block) => (block.sourceUids ?? []).includes(String(record.uid)))) {
            coveredUids.add(String(record.uid));
        }
    }
    const uncovered = eligible.filter((record) => !coveredUids.has(String(record.uid)));
    const criticalUncovered = uncovered.filter((record) => rebuildRecordIsCritical(record, schema));
    const coveredCount = Math.max(0, eligible.length - uncovered.length);
    const ratio = eligible.length ? coveredCount / eligible.length : 1;
    return {
        coveredUids,
        coveredRefs,
        eligibleCount: eligible.length,
        coveredCount,
        uncovered,
        criticalUncovered,
        ratio,
        eligibleLineCount: eligibleLines.length,
        coveredLineCount: coveredRefs.size,
        uncoveredLines,
    };
}

function restoreUncoveredRebuildSourceLines(blocks, sourceIndex, droppedRefs = [], schema = null, diagnostics = { warnings: [] }) {
    const output = (0, util_1.clone)(blocks ?? []);
    if (!sourceIndex?.lines?.length) return output;
    diagnostics.warnings ?? (diagnostics.warnings = []);
    const dropped = new Set((droppedRefs ?? []).map(String));
    let restored = 0;
    let unsafeDrops = 0;
    for (const item of sourceIndex.lines) {
        if (isLocallyDiscardableSourceLine(item)) continue;
        if (dropped.has(item.ref) && isSafeApprovedSourceDrop(item)) continue;
        if (dropped.has(item.ref)) unsafeDrops += 1;
        if (rebuildSourceLineRepresented(item, output)) continue;
        const candidates = output.filter((block) => (block.sourceUids ?? []).includes(String(item.uid)));
        const target = candidates.find((block) => (block.sourceRefs ?? []).includes(String(item.ref)))
            ?? candidates.find((block) => resolveMigrationType(block.type, schema) === resolveMigrationType(item.type, schema))
            ?? candidates[0];
        if (!target) continue;
        const sectionName = safeRebuildRestoreSection(item.section, target.type, schema);
        if (!sectionName) continue;
        let section = (target.sections ?? []).find((current) => current.name === sectionName);
        if (!section) {
            section = { name: sectionName, lines: [], empty: false };
            target.sections ?? (target.sections = []);
            target.sections.push(section);
        }
        const line = (0, parser_1.normalizePointLine)(item.text);
        const before = section.lines.length;
        section.lines = dedupeMigrationLines([...(section.lines ?? []), line]);
        section.empty = section.lines.length === 0;
        if (section.lines.length > before) restored += 1;
        target.sourceRefs = (0, util_1.unique)([...(target.sourceRefs ?? []), item.ref]);
        target.sourceUids = (0, util_1.unique)([...(target.sourceUids ?? []), String(item.uid)]);
    }
    if (restored) diagnostics.warnings.push(`来源行级覆盖校验恢复了${restored}条模型遗漏事实；旧条目只有在全部事实被承接或批准过滤后才会被替换`);
    if (unsafeDrops) diagnostics.warnings.push(`${unsafeDrops}条规划DROP不符合本地安全删除条件，已按来源行重新校验并优先保留`);
    return output;
}

function rebuildSourceLineRepresented(item, blocks) {
    const source = normalizeMigrationEvidenceText(stripGenericFactLabel(item?.text ?? ''));
    if (!source) return true;
    const sourceGrams = migrationBigrams(source);
    const uidCandidates = (blocks ?? []).filter((block) => (block.sourceUids ?? []).includes(String(item.uid)));
    const exactRefCandidates = uidCandidates.filter((block) => (block.sourceRefs ?? []).includes(String(item.ref)));
    const candidates = exactRefCandidates.length ? exactRefCandidates : uidCandidates;
    for (const block of candidates) {
        const explicit = (block.lineEvidence ?? []).some((evidence) => evidence.explicit === true && (evidence.refs ?? []).includes(String(item.ref)));
        if (explicit) return true;
    }
    const metadataMayRepresentSource = /(?:别名|名称|关键词|触发词)/u.test(String(item?.section ?? ''));
    for (const block of candidates) {
        const evidenceLines = [
            ...(metadataMayRepresentSource ? [block?.name, block?.title, ...(Array.isArray(block?.keywords) ? block.keywords : [])] : []),
            ...allBlockFactLines(block),
        ];
        for (const line of evidenceLines) {
            const fact = normalizeMigrationEvidenceText(stripGenericFactLabel(line));
            if (!fact) continue;
            if (fact === source || fact.includes(source) || source.includes(fact)) return true;
            const factGrams = migrationBigrams(fact);
            const shared = [...sourceGrams].filter((gram) => factGrams.has(gram)).length;
            const coverage = sourceGrams.size ? shared / sourceGrams.size : 0;
            const reverseCoverage = factGrams.size ? shared / factGrams.size : 0;
            const anchors = migrationEvidenceAnchors(source);
            const anchorHits = anchors.filter((anchor) => fact.includes(anchor)).length;
            if (Math.max(coverage, reverseCoverage) >= 0.58 || (anchorHits >= 2 && Math.max(coverage, reverseCoverage) >= 0.34)) return true;
        }
    }
    return false;
}

function isLocallyDiscardableSourceLine(item) {
    const text = String(item?.text ?? '').trim();
    if (!text || isTautologicalRebuildLine({ name: item?.name ?? '' }, text)) return true;
    if (item?.type === '事件' && (isPendingEventLine(text) || isLowValueMigrationEventLine(text))) return true;
    return false;
}

function isSafeApprovedSourceDrop(item) {
    const text = String(item?.text ?? '').trim();
    if (isLocallyDiscardableSourceLine(item)) return true;
    return /^(?:暂无|无|未说明|未知|空|不适用)$/u.test((0, util_1.normalizeFact)(text));
}

function safeRebuildRestoreSection(rawSection, type, schema = null) {
    const resolvedType = resolveMigrationType(type, schema);
    const allowed = schema?.allowedSectionsByType?.[resolvedType] ?? TYPE_ALLOWED_SECTIONS[resolvedType];
    const canonical = (0, information_point_1.canonicalSectionName)(rawSection, resolvedType);
    if (!(allowed instanceof Set) || allowed.has(canonical)) return canonical;
    const fallback = ({ 人物: '固定事实', 场景: '固定事实', 物品: '固定事实', 事件: '已发生进展', 世界: '固定事实', 基础设定: '世界常识' })[resolvedType];
    return fallback && (!(allowed instanceof Set) || allowed.has(fallback)) ? fallback : '';
}

function parseRebuildReviewResponse(raw) {
    const text = String(raw ?? '').replace(/```(?:text|markdown|md)?/giu, '').replace(/\r/g, '').trim();
    if (/^PASS$/iu.test(text)) return { passed: true, issues: [] };
    const issues = text.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('FAIL|')).map((line) => {
        const [, code = 'UNKNOWN', entryA = '', detail = ''] = line.split('|');
        return { code: code.trim(), entryA: entryA.trim(), detail: detail.trim(), raw: line };
    });
    return { passed: false, issues: issues.length ? issues : [{ code: 'INVALID_REVIEW', entryA: '', detail: text.slice(0, 200), raw: text }] };
}

function buildSemanticClusters(records) {
    const clusters = [];
    for (const record of Array.isArray(records) ? records : []) {
        const entry = recordAsEntry(record);
        let cluster = clusters.find((candidate) => semanticClusterMatch(candidate.entry, entry));
        if (!cluster) {
            cluster = {
                id: `entity:${entry.type}:${stableClusterName(entry)}`,
                type: entry.type,
                name: entry.name || record.title,
                entry,
                records: [],
            };
            clusters.push(cluster);
        }
        cluster.records.push(record);
        cluster.entry = mergeClusterEntry(cluster.entry, entry);
    }
    return clusters.sort((left, right) => left.id.localeCompare(right.id, 'zh-CN'));
}

function buildEventSynthesisTasks(records) {
    const source = Array.isArray(records) ? records : [];
    const explicitEvents = source.filter((record) => recordType(record) === '事件');
    const clusters = [];
    for (const record of explicitEvents) {
        const entry = recordAsEntry(record);
        let cluster = clusters.find((candidate) => semanticClusterMatch(candidate.entry, entry));
        if (!cluster) {
            cluster = {
                id: `event:${stableClusterName(entry)}`,
                name: entry.name || record.title,
                entry,
                records: [],
            };
            clusters.push(cluster);
        }
        cluster.records.push(record);
        cluster.entry = mergeClusterEntry(cluster.entry, entry);
    }
    // 场景【活动关联】能够恢复旧版本中缺失的显式事件条目，但不会从普通经历句任意造事件。
    for (const record of source.filter((item) => recordType(item) !== '事件')) {
        const entry = recordAsEntry(record);
        for (const rawName of entry.sections?.values?.['活动关联'] ?? []) {
            const name = stripEventField(rawName);
            if (!isStableEventAnchor(name)) continue;
            const synthetic = {
                uid: record.uid,
                title: `事件｜${name}`,
                type: '事件',
                name,
                aliases: [],
                keywords: [name],
                content: record.content,
                sections: { values: { 场景: [entry.name], 已发生进展: [rawName] } },
            };
            let cluster = clusters.find((candidate) => semanticClusterMatch(candidate.entry, synthetic));
            if (!cluster) {
                cluster = { id: `event:${stableClusterName(synthetic)}`, name, entry: synthetic, records: [] };
                clusters.push(cluster);
            }
            if (!cluster.records.some((item) => item.uid === record.uid)) cluster.records.push(record);
            cluster.entry = mergeClusterEntry(cluster.entry, synthetic);
        }
    }
    const convergedClusters = coalesceEventClusters(clusters);
    return convergedClusters
        .map((cluster) => {
            const related = collectEventRelatedRecords(source, cluster);
            return createMigrationTask('event', cluster.id, `事件｜${cluster.name}`, related, MIGRATION_DERIVED_BODY_BUDGET, cluster.name);
        })
        .filter((task) => task.length)
        .sort((left, right) => String(left.stableName).localeCompare(String(right.stableName), 'zh-CN'));
}


function coalesceEventClusters(clusters) {
    const output = [];
    for (const raw of clusters ?? []) {
        const incoming = { ...raw, records: [...(raw.records ?? [])] };
        const target = output.find((candidate) => eventClustersShouldMerge(candidate, incoming));
        if (!target) {
            output.push(incoming);
            continue;
        }
        target.records = [...new Map([...(target.records ?? []), ...(incoming.records ?? [])].map((record) => [String(record.uid), record])).values()];
        target.entry = mergeClusterEntry(target.entry, incoming.entry);
        const targetGeneric = isGenericEventName(target.name);
        if (targetGeneric && !isGenericEventName(incoming.name)) target.name = incoming.name;
    }
    return output;
}

function eventClustersShouldMerge(left, right) {
    if (semanticClusterMatch(left.entry, right.entry)) return true;
    const a = eventClusterSignature(left.entry);
    const b = eventClusterSignature(right.entry);
    const participantHit = a.participants.some((value) => b.participants.includes(value));
    const sceneHit = a.scenes.some((value) => b.scenes.includes(value));
    const nameHit = a.names.some((value) => b.names.some((other) => value === other || (Math.min(value.length, other.length) >= 4 && (value.includes(other) || other.includes(value)))));
    const strongNameHit = a.names.some((value) => b.names.some((other) => eventNameAffinity(value, other)));
    const narrativeA = (0, util_1.normalizeFact)(`${left.entry?.content ?? ''}`);
    const narrativeB = (0, util_1.normalizeFact)(`${right.entry?.content ?? ''}`);
    const narrativeHit = Math.min(narrativeA.length, narrativeB.length) >= 12 && bigramSimilarity(narrativeA, narrativeB) >= 0.5;
    if (participantHit && sceneHit && (nameHit || strongNameHit || narrativeHit)) return true;
    if ((nameHit || strongNameHit) && narrativeHit && (participantHit || sceneHit)) return true;
    // 旧事件经常缺少参与者和场景；标题共享多个稳定二字片段时仍视为同一生命周期。
    if (strongNameHit && !participantHit && !sceneHit) return true;
    return false;
}

function eventNameAffinity(left, right) {
    const a = (0, util_1.normalizeFact)(left);
    const b = (0, util_1.normalizeFact)(right);
    if (!a || !b || Math.min(a.length, b.length) < 4) return false;
    const gramsA = migrationBigrams(a);
    const gramsB = migrationBigrams(b);
    let shared = 0;
    for (const gram of gramsA) if (gramsB.has(gram)) shared += 1;
    return shared >= 3 && bigramSimilarity(a, b) >= 0.44;
}

function isGenericEventName(value) {
    return /^(?:当前事件|相关事件|事件进展|后续事件|活动事件|冲突事件|任务事件|未命名事件)$/u.test((0, util_1.normalizeFact)(value));
}

function collectEventRelatedRecords(records, cluster) {
    const signature = eventClusterSignature(cluster.entry);
    const scored = [];
    for (const record of records) {
        if (cluster.records.some((item) => item.uid === record.uid)) {
            scored.push({ record, score: 1000 });
            continue;
        }
        const text = (0, util_1.normalizeFact)(`${record.title}\n${record.content}\n${record.keywords.join(' ')}`);
        if (!text) continue;
        const nameHit = signature.names.some((value) => value.length >= 3 && text.includes(value));
        const participantHit = signature.participants.some((value) => value.length >= 2 && text.includes(value));
        const sceneHit = signature.scenes.some((value) => value.length >= 2 && text.includes(value));
        const goalHit = signature.goals.some((value) => value.length >= 3 && text.includes(value));
        const groups = [participantHit, sceneHit, goalHit].filter(Boolean).length;
        const eventContext = /【(?:固定事实|持续经历|持续变化|活动关联|世界影响|已发生进展|未发生进展|关键进展|结果|当前状态|当前)】/u.test(record.content || '');
        if (!nameHit && !(eventContext && groups >= 2)) continue;
        scored.push({ record, score: Number(nameHit) * 120 + groups * 35 + Number(eventContext) * 10 });
    }
    return scored.sort((left, right) => right.score - left.score || left.record.uid.localeCompare(right.record.uid, 'zh-CN', { numeric: true })).map((item) => item.record);
}

function eventClusterSignature(entry) {
    const values = entry?.sections?.values ?? {};
    const participants = (0, util_1.unique)((values['参与'] ?? []).flatMap(splitEventFieldValues).map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    const scenes = (0, util_1.unique)((values['场景'] ?? []).flatMap(splitEventFieldValues).map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    const participantSet = new Set(participants);
    const sceneSet = new Set(scenes);
    const eventKeywords = (entry?.keywords ?? []).filter((value) => {
        const key = (0, util_1.normalizeFact)(value);
        return key.length >= 3 && !participantSet.has(key) && !sceneSet.has(key);
    });
    const names = (0, util_1.unique)([
        entry?.name,
        ...(entry?.aliases ?? []),
        ...eventKeywords,
        ...(values['别名'] ?? []),
    ].map((value) => (0, util_1.normalizeFact)(stripEventField(value))).filter(isStableEventAnchor));
    const changes = (0, util_1.unique)([...(values['已发生进展'] ?? []), ...(values['关键进展'] ?? []), ...(values['结果'] ?? [])].map(stripEventField).map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    return { names, participants, scenes, goals: changes, changes };
}

function splitEventFieldValues(value) {
    return stripEventField(value).split(/[、,，/；;]|(?:以及|并且|与|和|及)/u).map((item) => item.trim()).filter(Boolean);
}

function stripEventField(value) {
    return String(value ?? '').replace(/^\s*[-*]?\s*[^：:]{1,24}\s*[：:]\s*/u, '').replace(/[。；;]+$/u, '').trim();
}

function isStableEventAnchor(value) {
    const text = String(value ?? '').trim();
    return text.length >= 3 && text.length <= 48 && !/^(?:无|未知|未说明|活动|事件|当前事件|相关事件|进行中|已结束|暂无)$/u.test(text);
}

function buildExtendedSynthesisTasks(records, schema = buildMigrationSchema()) {
    const source = Array.isArray(records) ? records : [];
    const tasks = [];
    const organizationDefinition = [...(schema?.definitions?.values?.() ?? [])].find((definition) => {
        const names = [definition.label, ...(definition.aliases ?? [])].map((value) => (0, util_1.normalizeFact)(value));
        return names.includes((0, util_1.normalizeFact)('组织'));
    });
    // 没有独立“组织”表定义时，组织事实统一由世界轮收束，不再额外制造世界子条目。
    const organizationTasks = organizationDefinition ? buildAnchorTasks(source, extractOrganizationAnchors, 'organization', '组织', MIGRATION_DERIVED_BODY_BUDGET, (anchor, related) => {
        return related.length >= 2 || related.some((record) => recordType(record, schema) === '世界' && /【(?:组织|权力|制度)】/u.test(record.content));
    }) : [];
    for (const task of organizationTasks) {
        decorateCustomTask(task, organizationDefinition, 'organization');
        tasks.push(task);
    }
    for (const definition of schema?.customDefinitions ?? []) {
        const direct = source.filter((record) => recordType(record, schema) === definition.label);
        if (!direct.length) continue;
        for (const cluster of buildSemanticClusters(direct)) {
            const related = collectCustomRelatedRecords(source, cluster, definition, schema);
            const task = createMigrationTask('custom', `custom:${(0, util_1.safeId)(definition.label)}:${stableClusterName(cluster.entry)}`, `${definition.label}｜${cluster.name}`, related, MIGRATION_DERIVED_BODY_BUDGET, cluster.name);
            decorateCustomTask(task, definition, (0, util_1.normalizeFact)(definition.label) === (0, util_1.normalizeFact)('组织') ? 'organization' : 'custom');
            tasks.push(task);
        }
    }
    const deduped = [];
    const seen = new Set();
    for (const task of tasks.sort((left, right) => String(left.label).localeCompare(String(right.label), 'zh-CN'))) {
        const key = `${task.outputType}|${(0, util_1.normalizeFact)(task.stableName)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(task);
    }
    return deduped;
}

function decorateCustomTask(task, definition, kind = 'custom') {
    const safeDefinition = definition ?? { label: '世界', fields: [...TYPE_ALLOWED_SECTIONS.世界].map((label) => ({ label })) };
    task.outputType = safeDefinition.label;
    task.allowedSections = (safeDefinition.fields ?? []).map((field) => field.label).filter(Boolean);
    task.typeDescription = safeDefinition.description || '';
    task.extensionKind = kind;
    task.schemaDefinition = safeDefinition;
    return task;
}

function collectCustomRelatedRecords(records, cluster, definition, schema) {
    const directUids = new Set(cluster.records.map((record) => record.uid));
    const names = (0, util_1.unique)([cluster.name, cluster.entry?.name, ...(cluster.entry?.aliases ?? []), ...(cluster.entry?.keywords ?? [])]
        .map((value) => (0, util_1.normalizeFact)(value)).filter((value) => value.length >= 2));
    const scored = [];
    for (const record of records) {
        if (directUids.has(record.uid)) {
            scored.push({ record, score: 1000 });
            continue;
        }
        const haystack = (0, util_1.normalizeFact)(`${record.title}\n${record.content}\n${record.keywords.join(' ')}`);
        const hits = names.filter((name) => haystack.includes(name)).length;
        if (!hits) continue;
        const sameType = recordType(record, schema) === definition.label;
        scored.push({ record, score: Number(sameType) * 200 + hits * 60 });
    }
    return scored.sort((left, right) => right.score - left.score || left.record.uid.localeCompare(right.record.uid, 'zh-CN', { numeric: true })).map((item) => item.record);
}

function buildRegionalSynthesisTasks(records) {
    return buildAnchorTasks(records, extractRegionAnchors, 'region', '地区', MIGRATION_DERIVED_BODY_BUDGET, (anchor, related) => {
        if (related.length >= 2) return true;
        const needle = (0, util_1.normalizeFact)(anchor);
        return related.some((record) => {
            const split = (0, util_1.splitTitle)((0, util_1.normalizeTitle)(record.title));
            const titleName = (0, util_1.normalizeFact)(split?.name ?? '');
            const keywordHit = (record.keywords ?? []).some((value) => (0, util_1.normalizeFact)(value) === needle);
            return titleName === needle || keywordHit;
        });
    });
}

function buildWorldSynthesisTasks(records) {
    const source = Array.isArray(records) ? records : [];
    // 旧重建可能把未转换成功的来源暂存为“世界｜重建待确认”；按来源标题恢复原类型，避免基础设定再次污染世界轮。
    const direct = source.filter((record) => recordType(record) === '世界' && !archivedSourceType(record));
    if (!direct.length) return [];
    // 世界事实一次性收束；模型可以输出少量稳定世界条目，但不能按组织/地区/局势重复跑多轮。
    const relatedUids = new Set(direct.map((record) => record.uid));
    const anchors = (0, util_1.unique)(direct.flatMap((record) => [record.name, ...record.keywords, ...extractRegionAnchors(record), ...extractOrganizationAnchors(record)]).filter(Boolean));
    for (const record of source) {
        if (relatedUids.has(record.uid)) continue;
        const text = (0, util_1.normalizeFact)(`${record.title}
${record.content}
${record.keywords.join(' ')}`);
        if (anchors.some((anchor) => {
            const key = (0, util_1.normalizeFact)(anchor);
            return key.length >= 2 && text.includes(key);
        })) relatedUids.add(record.uid);
    }
    const related = source.filter((record) => relatedUids.has(record.uid));
    return [createMigrationTask('world', 'world:global', '世界｜全局收束', related, MIGRATION_DERIVED_BODY_BUDGET, '全局结构')];
}

function buildFoundationSynthesisTasks(records) {
    const source = Array.isArray(records) ? records : [];
    const explicit = source.filter((record) => recordType(record) === '基础设定' || archivedSourceType(record) === '基础设定');
    if (explicit.length) {
        const anchors = (0, util_1.unique)(explicit.flatMap((record) => [record.name, ...record.keywords]).filter(Boolean));
        const related = source.filter((record) => explicit.some((item) => item.uid === record.uid) || anchors.some((anchor) => {
            const key = (0, util_1.normalizeFact)(anchor);
            const text = (0, util_1.normalizeFact)(`${record.title}
${record.content}
${record.keywords.join(' ')}`);
            return key.length >= 2 && text.includes(key);
        }));
        return [createMigrationTask('foundation', 'foundation:global', '基础设定｜规则收束', related, MIGRATION_DERIVED_BODY_BUDGET, '世界运行规则')];
    }
    const themes = [
        ['世界常识', /(?:世界常识|普遍|通常|公认|通用|所有地区|各国|整个世界)/u],
        ['自然规则', /(?:自然规则|自然规律|魔力|能量|时间|空间|死亡|复活|灵魂|昼夜|气候)/u],
        ['种族与生命', /(?:种族|血统|族群|寿命|生育|生命形态|变形|遗传)/u],
        ['能力与技术', /(?:能力|魔法|技术|施法|炼金|武器|媒介|能源|传送|通讯)/u],
        ['社会规则', /(?:社会规则|法律|制度|阶级|货币|婚姻|继承|登记|教育|宗教|贸易)/u],
        ['地理框架', /(?:地理框架|大陆|海洋|山脉|区域关系|气候带|交通网络|边境)/u],
    ];
    const related = (0, util_1.unique)(themes.flatMap(([, pattern]) => source.filter((record) => pattern.test(`${record.title}
${record.content}
${record.keywords.join(' ')}`)).map((record) => record.uid)))
        .map((uid) => source.find((record) => record.uid === uid)).filter(Boolean);
    if (related.length < 3) return [];
    return [createMigrationTask('foundation', 'foundation:derived', '基础设定｜规则候选', related, MIGRATION_DERIVED_BODY_BUDGET, '世界运行规则')];
}

function buildAnchorTasks(records, extractor, phase, labelPrefix, bodyBudget, accept) {
    const anchors = new Map();
    for (const record of records) {
        for (const anchor of extractor(record)) {
            const key = (0, util_1.normalizeFact)(anchor);
            if (!key || key.length < 2) continue;
            if (!anchors.has(key)) anchors.set(key, { anchor, records: [] });
        }
    }
    for (const item of anchors.values()) {
        item.records = records.filter((record) => recordContainsAnchor(record, item.anchor));
    }
    return [...anchors.values()]
        .filter((item) => accept(item.anchor, item.records))
        .sort((left, right) => left.anchor.localeCompare(right.anchor, 'zh-CN'))
        .map((item) => createMigrationTask(phase, `${phase}:${(0, util_1.normalizeFact)(item.anchor)}`, `${labelPrefix}｜${item.anchor}`, item.records, bodyBudget, item.anchor));
}

function createMigrationTask(phase, clusterId, label, records, bodyBudget, stableName = '') {
    const compacted = compactTaskRecords(records, bodyBudget);
    const task = compacted.records;
    task.phase = phase;
    task.clusterId = clusterId;
    task.label = label;
    task.stableName = stableName || label.replace(/^.+?｜/u, '');
    task.compactedRecords = compacted.compactedRecords;
    return task;
}

function compactTaskRecords(records, bodyBudget) {
    const source = [...new Map((records || []).map((record) => [record.uid, record])).values()];
    if (!source.length) return { records: [], compactedRecords: 0 };
    const overhead = source.reduce((sum, record) => sum + serializeRecord({ ...record, content: '' }).length, 0);
    const available = Math.max(1200, bodyBudget - overhead);
    const share = Math.max(260, Math.floor(available / source.length));
    let compactedRecords = 0;
    const output = source.map((record) => {
        const content = String(record.content ?? '').replace(/\r/g, '').trim();
        if (content.length <= share) return { ...record, content };
        compactedRecords += 1;
        return { ...record, content: clipRecordContent(content, share) };
    });
    return { records: output, compactedRecords };
}

function clipRecordContent(content, maxChars) {
    const text = String(content ?? '').trim();
    if (text.length <= maxChars) return text;
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    const priority = lines.filter((line) => /^(?:【(?:身份|定义|稳定|当前|当前状态|关系|目标|阶段|未决|结果|范围|地理|组织|权力|制度|公开局势|世界常识|自然规则|种族与生命|能力与技术|社会规则|地理框架)】|-\s*(?:身份|种族|位置|目标|结果|范围|组织|制度|规则|来源|真相|当前))/u.test(line));
    const ordered = (0, util_1.unique)([...priority, ...lines.slice(0, 8), ...lines.slice(-8)]);
    let out = '';
    for (const line of ordered) {
        if (out && out.length + line.length + 1 > maxChars) continue;
        out += `${out ? '\n' : ''}${line}`;
    }
    if (!out) out = `${text.slice(0, Math.ceil(maxChars * .62))}\n[中间历史已压缩]\n${text.slice(-Math.floor(maxChars * .3))}`;
    return out.slice(0, maxChars);
}

function recordAsEntry(record) {
    const splitRaw = (0, util_1.splitTitle)((0, util_1.normalizeTitle)(record.title)) || { type: record.type || '世界', name: record.name || record.title };
    const split = { type: record.type || splitRaw.type, name: record.name || splitRaw.name };
    const sections = (0, parser_1.parseEntrySections)(record.content || '');
    const rawAliases = (0, util_1.unique)([
        ...(sections.values?.['别名'] || []),
    ].map((value) => String(value).replace(/^\s*[-*]\s*/u, '').trim()).filter(isMeaningfulRebuildKeyword));
    const aliases = safeMigrationIdentityAliases(split.type, split.name, rawAliases);
    return {
        uid: record.uid,
        title: `${split.type}｜${split.name}`,
        type: split.type,
        name: split.name,
        aliases,
        keywords: record.keywords || [],
        content: record.content || '',
        sections,
        _eventIdentityAnchors: record._eventIdentityAnchors ?? [],
    };
}

function safeMigrationIdentityAliases(type, name, aliases) {
    if (type !== '场景') return aliases;
    const base = (0, util_1.normalizeFact)(name);
    return (aliases ?? []).filter((alias) => {
        const value = (0, util_1.normalizeFact)(alias);
        if (!value || !base) return false;
        if (value === base || (Math.min(value.length, base.length) >= 3 && (value.includes(base) || base.includes(value)))) return true;
        return Math.min(value.length, base.length) >= 5 && bigramSimilarity(value, base) >= 0.45;
    });
}

function semanticClusterMatch(clusterEntry, incomingEntry) {
    if (clusterEntry.type === '事件' && incomingEntry.type === '事件') {
        const left = stableClusterName(clusterEntry);
        const right = stableClusterName(incomingEntry);
        return Boolean(left && right && left === right)
            || (0, matcher_1.sameEventLifecycle)(sanitizeEventEntryForLifecycle(clusterEntry), sanitizeEventEntryForLifecycle(incomingEntry));
    }
    if ((0, matcher_1.sameEntryIdentity)(clusterEntry, incomingEntry)) return true;
    if (clusterEntry.type !== incomingEntry.type) return false;
    const left = stableClusterName(clusterEntry);
    const right = stableClusterName(incomingEntry);
    if (left && right && left === right) return true;
    return identityKeywordMatch(clusterEntry, incomingEntry);
}

function sanitizeEventEntryForLifecycle(entry) {
    const values = entry?.sections?.values ?? {};
    const participants = new Set((values['参与'] ?? []).flatMap(splitEventFieldValues).map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    const scenes = new Set((values['场景'] ?? []).flatMap(splitEventFieldValues).map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    const keywords = (entry?.keywords ?? []).filter((value) => {
        const key = (0, util_1.normalizeFact)(value);
        return key.length >= 3 && !participants.has(key) && !scenes.has(key);
    });
    return { ...entry, keywords };
}

function identityKeywordMatch(left, right) {
    const leftNames = (0, util_1.unique)([left?.name, ...(left?.aliases ?? [])].map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    const rightNames = (0, util_1.unique)([right?.name, ...(right?.aliases ?? [])].map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    const leftKeywords = (0, util_1.unique)((left?.keywords ?? []).map((value) => (0, util_1.normalizeFact)(value)).filter((value) => value.length >= 3));
    const rightKeywords = (0, util_1.unique)((right?.keywords ?? []).map((value) => (0, util_1.normalizeFact)(value)).filter((value) => value.length >= 3));
    const anchorMatchesName = leftKeywords.some((keyword) => rightNames.includes(keyword)) || rightKeywords.some((keyword) => leftNames.includes(keyword));
    if (anchorMatchesName) return true;
    const shared = leftKeywords.filter((keyword) => rightKeywords.includes(keyword));
    return shared.some((keyword) => leftNames.some((name) => name.includes(keyword)) && rightNames.some((name) => name.includes(keyword)));
}

function stableClusterName(entry) {
    return (0, util_1.normalizeFact)(String(entry?.name ?? ''))
        .replace(/(?:老师|教授|医生|主任|队长|会长|店长|老板|先生|女士|小姐|大人|殿下|陛下|学姐|学长|师姐|师兄|姐姐|哥哥|前辈)$/u, '')
        .replace(/^(?:人物|角色|物品|道具|事件|场景|世界|基础设定)/u, '') || (0, util_1.normalizeFact)(entry?.title ?? '未命名');
}

function mergeClusterEntry(left, right) {
    return {
        ...left,
        aliases: (0, util_1.unique)([...(left.aliases || []), ...(right.aliases || []), right.name]),
        keywords: (0, util_1.unique)([...(left.keywords || []), ...(right.keywords || [])]),
        content: `${left.content || ''}\n${right.content || ''}`,
    };
}

function archivedSourceTitle(record) {
    const content = String(record?.content ?? '');
    const match = content.match(/【来源条目】[\s\S]*?^\s*-\s*([^\n]+?｜[^\n]+?)\s*$/mu);
    return match?.[1] ? (0, util_1.normalizeTitle)(match[1]) : '';
}

function archivedSourceType(record, schema = null) {
    const title = archivedSourceTitle(record);
    if (!title) return '';
    return resolveMigrationType((0, util_1.splitTitle)(title)?.type || '', schema);
}

function recordType(record, schema = null) {
    if (record?.type) return resolveMigrationType(record.type, schema);
    return resolveMigrationType((0, util_1.splitTitle)((0, util_1.normalizeTitle)(record.title))?.type || '', schema);
}

function annotateRecordSchema(record, schema) {
    const split = (0, util_1.splitTitle)((0, util_1.normalizeTitle)(record.title));
    record.type = resolveMigrationType(split?.type || '', schema);
    record.name = split?.name || record.title;
    return record;
}

function extractRegionAnchors(record) {
    return (0, util_1.unique)(extractAnchors(`${record.title}
${record.content}
${record.keywords.join(' ')}`, REGION_SUFFIX_PATTERN)
        .map(cleanRegionAnchor)
        .filter((value) => value && !/^(?:当前地区|某地区|该地区|世界地区)$/u.test(value)));
}

function cleanRegionAnchor(value) {
    let text = String(value ?? '').trim();
    for (const marker of ['负责', '位于', '坐落于', '属于', '进入', '离开', '抵达', '前往', '通往', '控制', '覆盖']) {
        if (text.includes(marker)) text = text.split(marker).at(-1).trim();
    }
    text = text.replace(/^(?:在|从|向|至|到)/u, '').replace(/地区$/u, '').trim();
    if (/^([东南西北]境)边境$/u.test(text)) text = text.replace(/边境$/u, '');
    return text;
}

function extractOrganizationAnchors(record) {
    return extractAnchors(`${record.title}\n${record.content}\n${record.keywords.join(' ')}`, ORGANIZATION_SUFFIX_PATTERN)
        .filter((value) => !/^(?:某组织|该组织|世界组织|组织势力)$/u.test(value));
}

function extractAnchors(text, pattern) {
    const output = [];
    pattern.lastIndex = 0;
    for (const match of String(text || '').matchAll(pattern)) output.push(String(match[1] || '').trim());
    pattern.lastIndex = 0;
    return (0, util_1.unique)(output);
}

function recordContainsAnchor(record, anchor) {
    const needle = (0, util_1.normalizeFact)(anchor);
    const haystack = (0, util_1.normalizeFact)(`${record.title}\n${record.content}\n${record.keywords.join(' ')}`);
    return Boolean(needle && haystack.includes(needle));
}

function migrationPhaseLabel(phase) {
    return ({ planned: '候选重建', 'planned-joint': '联合重建', entity: '对象重建', event: '事件重建', custom: '通用条目重建', organization: '通用条目重建', world: '世界收束', region: '地区规则', foundation: '基础设定' })[phase] || '世界书重建';
}

function rebuildParsePolicy(batch, records, schema = buildMigrationSchema()) {
    const phase = batch?.phase || 'entity';
    const explicitFoundationUids = new Set(records.filter((record) => recordType(record, schema) === '基础设定').map((record) => record.uid));
    const allowedEvidenceUids = new Set((Array.isArray(batch) ? batch : []).map((record) => String(record.uid)));
    const common = {
        minimumEvidence: 1,
        explicitFoundationUids,
        allowedEvidenceUids,
        evidenceRecordByUid: new Map(records.map((record) => [String(record.uid), record])),
        allowedSectionsByType: schema.allowedSectionsByType,
        sourceLineByRef: batch?.sourceLineByRef instanceof Map ? batch.sourceLineByRef : new Map(),
        defaultSceneAnchors: [...(batch?.sceneAnchors ?? [])],
        allowedSceneAnchors: new Set(batch?.sceneAnchors ?? []),
        anchorCatalog: new Map((batch?.anchorCatalog ?? []).map((anchor) => [anchor.id, anchor])),
        sceneAnchorsByGroup: new Map((batch?.jointGroups ?? []).map((group) => [String(group.id), new Set(group.sceneAnchors ?? [])])),
        schema,
    };
    if (phase === 'planned' || phase === 'planned-joint') {
        return {
            ...common,
            allowedTypes: batch?.phase === 'planned-joint'
                ? new Set([...(batch?.outputTypes ?? [])].filter(Boolean))
                : (batch?.newTypeProposal === true ? new Set([...schema.definitions.keys()]) : new Set([String(batch?.outputType || '')].filter(Boolean))),
            allowNewTypes: batch?.newTypeProposal === true || (batch?.jointGroups ?? []).some((group) => group.newTypeProposal === true),
            allowedSourceRefs: batch?.allowedSourceRefs instanceof Set ? batch.allowedSourceRefs : new Set(batch?.sourceRefs ?? []),
        };
    }
    if (phase === 'event') return { ...common, allowedTypes: new Set(['事件']), allowNewTypes: false };
    if (phase === 'custom' || phase === 'organization') {
        return { ...common, allowedTypes: new Set([...schema.definitions.keys()]), allowNewTypes: true };
    }
    if (phase === 'world') return { ...common, allowedTypes: new Set([...schema.definitions.keys()]), allowNewTypes: true };
    if (phase === 'region') return { ...common, allowedTypes: new Set(['世界']), allowNewTypes: false };
    if (phase === 'foundation') return { ...common, allowedTypes: new Set(['基础设定']), minimumEvidence: 2, allowNewTypes: false };
    return { ...common, allowedTypes: new Set([...NON_EVENT_TYPES, ...schema.customDefinitions.map((definition) => definition.label)]), allowNewTypes: true };
}

function buildPriorCandidateContext(blocks, batch, maxChars = 2600) {
    const phase = batch?.phase || 'entity';
    if (phase === 'entity' || !Array.isArray(blocks) || !blocks.length) return '';
    const preferred = ({
        event: new Set(['人物', '场景', '物品', '世界']),
        custom: new Set(['人物', '场景', '物品', '事件', '世界', '基础设定']),
        organization: new Set(['人物', '场景', '事件', '世界']),
        world: new Set(['世界', '场景', '事件', '基础设定']),
        region: new Set(['场景', '事件', '世界']),
        foundation: new Set(['世界', '基础设定']),
    })[phase] ?? new Set();
    const sourceUids = new Set((Array.isArray(batch) ? batch : []).map((record) => String(record.uid)));
    const anchor = (0, util_1.normalizeFact)(batch?.stableName || batch?.label || '');
    const ranked = blocks.map((block, index) => {
        const serialized = serializeCandidateBlock(block);
        const overlap = (block.sourceUids ?? []).some((uid) => sourceUids.has(String(uid)));
        const anchorHit = Boolean(anchor && (0, util_1.normalizeFact)(serialized).includes(anchor));
        const score = Number(overlap) * 100 + Number(anchorHit) * 60 + Number(preferred.has(block.type)) * 10 + index / 10000;
        return { block, serialized, score };
    }).filter((item) => item.score >= 60 || (phase === 'foundation' && preferred.has(item.block.type)))
        .sort((left, right) => right.score - left.score)
        .slice(0, 12);
    let output = '';
    for (const item of ranked) {
        const next = `${output ? '\n\n' : ''}${item.serialized}`;
        if (output && output.length + next.length > maxChars) continue;
        output += next;
    }
    return output.slice(0, maxChars);
}

function serializeCandidateBlock(block) {
    const sections = (block.sections ?? []).map((section) => `【${section.name}】\n${(section.lines ?? []).map((line) => `- ${line}`).join('\n')}`).join('\n');
    const sources = (block.sourceUids ?? []).join(',') || '无';
    return `${block.title}\n候选来源UID：${sources}\n${sections}`.trim();
}

function rebuildFingerprint(worldbookName, records) {
    const source = [String(worldbookName ?? ''), ...records.map((record) => `${record.uid}|${record.title}|${record.content}|${record.keywords.join(',')}`)].join('\n');
    return (0, util_1.hashText)(source);
}

function isMigrationRateLimitError(error) {
    return /(?:\b429\b|too many requests|rate limit|requests per minute|tokens per minute|请求过多|频率限制|限流)/iu.test((0, util_1.errorText)(error));
}

function migrationBatchIntervalMs(settings) {
    const configured = Number(settings?.migrationBatchIntervalMs);
    if (Number.isFinite(configured)) return Math.min(60000, Math.max(0, Math.round(configured)));
    return MIGRATION_DEFAULT_INTERVAL_MS;
}

function migrationRateLimitRetries(settings) {
    const configured = Number(settings?.migrationRateLimitRetries);
    if (Number.isFinite(configured)) return Math.min(4, Math.max(0, Math.round(configured)));
    return MIGRATION_MAX_RATE_LIMIT_RETRIES;
}

function migrationRateLimitBackoffMs(settings, attempt) {
    const configured = Number(settings?.migrationRateLimitBackoffMs);
    if (Number.isFinite(configured)) return Math.min(120000, Math.max(0, Math.round(configured)));
    return MIGRATION_RATE_LIMIT_BACKOFF_MS[Math.min(Math.max(0, attempt), MIGRATION_RATE_LIMIT_BACKOFF_MS.length - 1)];
}

async function waitForMigration(ms, validate, snapshot) {
    let remaining = Math.max(0, Number(ms) || 0);
    while (remaining > 0) {
        if (snapshot?.token?.cancelled) throw new Error(snapshot.token.reason || '任务已取消');
        const slice = Math.min(250, remaining);
        await new Promise((resolve) => setTimeout(resolve, slice));
        remaining -= slice;
        validate();
    }
}

function isControlPromptRaw(raw) {
    if (!raw || typeof raw !== 'object') return false;
    const extension = raw.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY];
    if (extension?.managed !== true) return false;
    const title = (0, util_1.normalizeTitle)(String(raw.comment ?? raw.name ?? raw.title ?? ''));
    const content = String(raw.content ?? '');
    if (title === (0, util_1.normalizeTitle)(exports.INFORMATION_BOUNDARY_TITLE)) return true;
    if (/【来源条目】[\s\S]{0,120}基础设定[｜|]角色信息边界/u.test(content)) return true;
    const signatures = [
        '世界事实不等于角色已知',
        '未列入角色【已知】',
        '玩家未表达的内心、他人私密认知',
        '仅因世界书中存在某条事实，不代表所有角色知道',
    ];
    return signatures.filter((phrase) => content.includes(phrase)).length >= 2;
}

function collectRebuildRecords(data, schema = buildMigrationSchema()) {
    const output = [];
    for (const [mapKey, raw] of Object.entries(data?.entries ?? {})) {
        if (!raw || typeof raw !== 'object' || !isRebuildCandidate(raw, schema) || isControlPromptRaw(raw)) continue;
        const uid = String(raw.uid ?? mapKey);
        const title = (0, util_1.stripUidSuffix)(String(raw.comment ?? raw.name ?? raw.title ?? '')) || `未命名｜${uid}`;
        const keywords = (0, util_1.normalizeStringArray)(raw.key).filter((item) => !(0, util_1.isUidKeyword)(item));
        const split = (0, util_1.splitTitle)((0, util_1.normalizeTitle)(title));
        output.push({ mapKey: String(mapKey), uid, title, type: resolveMigrationType(split?.type || '', schema), name: split?.name || title, content: String(raw.content ?? ''), keywords, raw: (0, util_1.clone)(raw) });
    }
    return output.sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
}

function isRebuildCandidate(raw, schema = buildMigrationSchema()) {
    if (!raw || typeof raw !== 'object') return false;
    const extension = raw.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY];
    if (extension?.locked === true || raw.locked === true) return false;
    if (extension?.managed === true) return true;
    const title = (0, util_1.stripUidSuffix)((0, util_1.normalizeTitle)(String(raw.comment ?? raw.name ?? raw.title ?? '')));
    const split = (0, util_1.splitTitle)(title);
    if (!split || !schema?.definitions?.has(resolveMigrationType(split.type, schema))) return false;
    const keys = (0, util_1.normalizeStringArray)(raw.key);
    // 非镜渊用户条目即使标题属于六类、正文格式较旧，也不参与重建和删除。
    return keys.some((item) => (0, util_1.isUidKeyword)(item));
}

function serializeRecord(record) {
    const part = Number(record.fragmentCount || 0) > 1 ? ` part=${record.fragmentIndex}/${record.fragmentCount}` : '';
    const cluster = record.semanticClusterId ? ` cluster=${record.semanticClusterId}` : '';
    const clusterName = record.semanticClusterName ? `
对象簇：${record.semanticClusterName}` : '';
    return `<<<SOURCE uid=${record.uid}${part}${cluster}>>>
标题：${record.title}${clusterName}
关键词：${record.keywords.join('、') || '无'}
快照正文：
${record.content || '（空）'}
<<<END_SOURCE>>>`;
}

function migrationLineSlot(line) {
    return String(line ?? '').match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1]?.replace(/\s+/gu, '') ?? '';
}

function removeUnresolvedSlotConflicts(section, lines, diagnostics = { warnings: [] }, title = '') {
    const source = (0, util_1.unique)(lines ?? []);
    if (!MIGRATION_EXCLUSIVE_SECTIONS.has(String(section ?? ''))) return source;
    const bySlot = new Map();
    for (const line of source) {
        const slot = migrationLineSlot(line);
        if (!slot || !isExclusiveMigrationSlot(section, slot)) continue;
        const list = bySlot.get(slot) ?? [];
        list.push(line);
        bySlot.set(slot, list);
    }
    const conflicts = new Set();
    for (const [slot, values] of bySlot.entries()) {
        const distinct = (0, util_1.unique)(values.map((value) => (0, util_1.normalizeFact)(value)));
        if (distinct.length <= 1) continue;
        conflicts.add(slot);
        diagnostics.warnings ?? (diagnostics.warnings = []);
        diagnostics.warnings.push(`${title || '重建条目'}【${section}】“${slot}”存在互斥解释，未自动裁决；请改写为人物【已知/误信】、不同时间状态或待确认事实`);
    }
    if (!conflicts.size) return source;
    return source.filter((line) => !conflicts.has(migrationLineSlot(line)));
}


function isExclusiveMigrationSlot(section, slot) {
    const sectionName = String(section ?? '').trim();
    const slotName = String(slot ?? '').trim().toLocaleLowerCase();
    if (/^(?:当前|当前状态|阶段)$/u.test(sectionName)) return true;
    if (sectionName === '身份') return MIGRATION_STRONG_SINGLE_SLOTS.has(slotName);
    if (sectionName === '功能') return /^(?:用途|功能|主功能)$/u.test(slotName);
    return false;
}

function normalizeEventCompletionBlock(block) {
    if (block?.type !== '事件') return block;
    const output = (0, util_1.clone)(block);
    // 旧【目标】只作为本地聚合身份锚点，绝不写回可召回正文。
    output._eventIdentityAnchors = (0, util_1.unique)([
        ...(block?._eventIdentityAnchors ?? []),
        ...((block?.sections ?? []).filter((section) => /^(?:目标)$/u.test(String(section.name ?? '').trim())).flatMap((section) => section.lines ?? [])),
    ].map((line) => (0, parser_1.sanitizeWorldbookLine)(line)).filter(Boolean));
    output.eventIdentitySections = {
        ...(block?.eventIdentitySections ?? {}),
        ...(output._eventIdentityAnchors.length ? { 目标: output._eventIdentityAnchors } : {}),
    };
    const byName = new Map();
    for (const section of output.sections ?? []) {
        let name = String(section.name ?? '').trim();
        if (name === '关键进展' || name === '事件进程' || name === '进展') name = '已发生进展';
        if (name === '未形成进展' || name === '过程动作' || name === '过程细节') name = '未发生进展';
        // 目标、未决和阶段属于旧任务式生命周期，不再写回可召回正文。
        if (/^(?:目标|未决|阶段|当前阶段)$/u.test(name)) continue;
        if (!/^(?:参与|场景|已发生进展|未发生进展|结果|别名)$/u.test(name)) continue;
        const lines = (section.lines ?? [])
            .map((line) => (0, parser_1.sanitizeWorldbookLine)(line))
            .filter(Boolean)
            .filter((line) => !isPendingEventLine(line))
            .filter((line) => !/^(?:已发生进展|未发生进展)$/u.test(name) || !isLowValueMigrationEventLine(line));
        if (!lines.length) continue;
        const current = byName.get(name) ?? [];
        current.push(...lines);
        byName.set(name, current);
    }
    output.sections = collapseEventNarrativeSections([...byName.entries()].map(([name, lines]) => ({ name, lines, empty: false })));
    return output;
}

function isLowValueMigrationEventLine(value) {
    const text = (0, util_1.normalizeFact)(value);
    if (!text) return true;
    if (/(?:同意|拒绝|决定|确认|发现|得知|获得|失去|交给|拿走|偷走|归还|受伤|死亡|击败|逃脱|暴露|驱逐|建立|解除|改变|完成|取消|终止|签署|达成|破坏|摧毁|掌握|恢复|占领|控制|释放|拘捕|背叛|承诺|公开|宣布|导致|造成|形成|救出|带走|夺取|移交|失踪|中毒|痊愈|晋升|离职|结盟|决裂)/u.test(text)) return false;
    return /(?:走到|走向|来到|进入|离开|坐下|站起|抬头|低头|看向|望向|皱眉|微笑|点头|摇头|开门|关门|翻开|合上|拿起|放下|停下|沉默|寒暄|喝水|吃饭|敲门|转身|回头|挠头)/u.test(text) && text.length <= 36;
}

function isPendingEventLine(value) {
    const text = String(value ?? '').trim();
    if (!text) return true;
    const affirmativeText = text.replace(/(?:尚未|还未|仍未|未能|待解决|待确认|待完成|有待)/gu, '');
    const completedMarker = /(?:已经|已|曾|此前|当时|后来|最终).{0,14}(?:完成|发生|开始|决定|确认|证实|导致|造成|形成|抵达|到达|进入|离开|发出|收到|获得|失去|掌握|恢复|击败|签署|达成|公开|宣布)/u.test(affirmativeText);
    // 纯粹描述尚未发生的内容不写回；同一句中若先记录了明确发生的进展，则保留整条进展。
    if (/(?:尚未|还未|仍未|未能|待解决|待确认|待完成|有待)/u.test(text)) return !completedMarker;
    const futureMarker = /(?:下一步|之后需要|接下来|计划|打算|准备|将会|将要|希望|目标是|目的在于)/u.test(text);
    return futureMarker && !completedMarker;
}

function collapseEventNarrativeSections(sections) {
    const byName = new Map();
    for (const section of sections ?? []) {
        const current = byName.get(section.name) ?? [];
        current.push(...(section.lines ?? []));
        byName.set(section.name, current);
    }
    const resultLines = (0, util_1.unique)(byName.get('结果') ?? []);
    if (resultLines.length && byName.has('已发生进展')) {
        const normalizedResults = resultLines.map((line) => (0, util_1.normalizeFact)(stripGenericFactLabel(line))).filter(Boolean);
        byName.set('已发生进展', (byName.get('已发生进展') ?? []).filter((line) => {
            const fact = (0, util_1.normalizeFact)(stripGenericFactLabel(line));
            return !normalizedResults.some((result) => fact && (result.includes(fact) || fact.includes(result)));
        }));
        // 有稳定结果后，普通过程材料不再长期保留。
        byName.delete('未发生进展');
    }
    if (byName.has('已发生进展')) {
        const lines = dedupeMigrationLines(byName.get('已发生进展')).slice(-4);
        byName.set('已发生进展', lines);
    }
    if (byName.has('未发生进展')) byName.set('未发生进展', dedupeMigrationLines(byName.get('未发生进展')).slice(-2));
    return [...byName.entries()].map(([name, lines]) => ({ name, lines: (0, util_1.unique)(lines), empty: false })).filter((section) => section.lines.length);
}

function parseRebuildResponse(raw, knownUids, diagnostics = { invalidLines: [], warnings: [] }, policy = {}) {
    diagnostics.invalidLines ?? (diagnostics.invalidLines = []);
    diagnostics.warnings ?? (diagnostics.warnings = []);
    const invalidStart = diagnostics.invalidLines.length;
    const allowedTypes = new Set(policy.allowedTypes instanceof Set ? policy.allowedTypes : ALLOWED_TYPES);
    const minimumEvidence = Math.max(1, Number(policy.minimumEvidence || 1));
    const explicitFoundationUids = policy.explicitFoundationUids instanceof Set ? policy.explicitFoundationUids : new Set();
    const allowedEvidenceUids = policy.allowedEvidenceUids instanceof Set ? policy.allowedEvidenceUids : null;
    const allowedSectionsByType = policy.allowedSectionsByType && typeof policy.allowedSectionsByType === 'object' ? policy.allowedSectionsByType : TYPE_ALLOWED_SECTIONS;
    const evidenceRecordByUid = policy.evidenceRecordByUid instanceof Map ? policy.evidenceRecordByUid : null;
    const allowedSourceRefs = policy.allowedSourceRefs instanceof Set ? policy.allowedSourceRefs : null;
    const prepared = parseRebuildEnvelope(raw, diagnostics, policy);
    for (const block of prepared) if (block?.newTypeProposalAccepted === true) allowedTypes.add(block.type);
    const normalizedPrepared = prepared.map((block) => {
        const type = resolveMigrationType(block.type, policy.schema);
        const temporal = resolveBlockTemporalMetadata({
            sceneAnchors: (block.sceneAnchors ?? []).length ? block.sceneAnchors : policy.defaultSceneAnchors,
            gameTime: block.gameTime,
            timeSource: block.timeSource,
            temporalState: block.temporalState,
            type,
        }, policy);
        return { ...block, ...temporal, type, title: `${type}｜${block.name}` };
    });
    const parsed = (0, information_point_1.prepareInformationBlocks)(normalizedPrepared);
    const output = [];
    for (const block of parsed) {
        if (!allowedTypes.has(block.type)) {
            diagnostics.warnings.push(`已丢弃不允许的重建类型：${block.title}`);
            continue;
        }
        const sections = [];
        const sourceUids = new Set();
        const sourceRefs = new Set();
        const lineEvidence = [];
        const entryEvidenceUids = (0, util_1.unique)((block.mergeSourceUids ?? [])
            .map((uid) => String(uid))
            .filter((uid) => knownUids.has(uid) && (!allowedEvidenceUids || allowedEvidenceUids.has(uid))));
        const entrySourceRefs = (0, util_1.unique)((block.sourceRefs ?? [])
            .map((ref) => String(ref))
            .filter((ref) => !allowedSourceRefs || allowedSourceRefs.has(ref)));
        for (const ref of entrySourceRefs) sourceRefs.add(ref);
        for (const ref of entrySourceRefs) {
            const uid = ref.split(':s')[0];
            if (knownUids.has(uid) && (!allowedEvidenceUids || allowedEvidenceUids.has(uid))) sourceUids.add(uid);
        }
        const singleBatchUid = allowedEvidenceUids?.size === 1
            ? [...allowedEvidenceUids].map((uid) => String(uid)).find((uid) => knownUids.has(uid)) || ''
            : '';
        let inheritedEvidenceLines = 0;
        for (const section of block.sections ?? []) {
            if (/(关键词|触发词|标签|分类)/u.test(section.name) || section.empty) continue;
            const allowedSections = allowedSectionsByType?.[block.type];
            if (allowedSections instanceof Set && !allowedSections.has(section.name)) {
                diagnostics.warnings.push(`${block.title}【${section.name}】不属于${block.type}固定格式，已丢弃`);
                continue;
            }
            if (KNOWLEDGE_SECTIONS.has(section.name) && block.type !== '人物') {
                diagnostics.warnings.push(`${block.title}【${section.name}】不是人物认知，已丢弃`);
                continue;
            }
            const lines = [];
            for (const rawLine of section.lines ?? []) {
                const ids = [];
                const lineRefs = [];
                String(rawLine).replace(SOURCE_LINE_MARKER, (_match, group) => {
                    for (const ref of parseSourceRefList(group)) {
                        if (!allowedSourceRefs || allowedSourceRefs.has(ref)) lineRefs.push(ref);
                    }
                    return '';
                });
                SOURCE_LINE_MARKER.lastIndex = 0;
                String(rawLine).replace(SOURCE_MARKER, (_match, group) => {
                    for (const id of String(group).split(/[,，、\s]+/u).map((item) => item.trim()).filter(Boolean)) {
                        if (knownUids.has(id) && (!allowedEvidenceUids || allowedEvidenceUids.has(id))) ids.push(id);
                    }
                    return '';
                });
                SOURCE_MARKER.lastIndex = 0;
                const line = (0, parser_1.sanitizeWorldbookLine)(stripSourceLineMarkers(String(rawLine).replace(SOURCE_MARKER, ''))).trim();
                SOURCE_MARKER.lastIndex = 0;
                if (!line) {
                    diagnostics.invalidLines.push({ title: block.title, section: section.name, line: String(rawLine).slice(0, 160), reason: '检测到模型控制提示词或格式协议，已阻止写入世界书' });
                    continue;
                }
                let uniqueIds = (0, util_1.unique)(ids);
                const explicitLineRefs = (0, util_1.unique)(lineRefs);
                const uniqueRefs = (0, util_1.unique)(explicitLineRefs.length ? explicitLineRefs : entrySourceRefs);
                // [MA-REBUILD-09] 通用格式以“合并来源”为条目级证据。模型若没有在每一行重复UID，
                // 可继承该条目的有效合并来源；单来源批次也可安全继承唯一UID。多来源且没有条目级来源时仍拒绝。
                if (!uniqueIds.length && entryEvidenceUids.length) {
                    uniqueIds = entryEvidenceUids;
                    inheritedEvidenceLines += 1;
                }
                if (!uniqueIds.length && uniqueRefs.length) {
                    uniqueIds = (0, util_1.unique)(uniqueRefs.map((ref) => ref.split(':s')[0])
                        .filter((uid) => knownUids.has(uid) && (!allowedEvidenceUids || allowedEvidenceUids.has(uid))));
                }
                if (!uniqueIds.length && singleBatchUid) {
                    uniqueIds = [singleBatchUid];
                    inheritedEvidenceLines += 1;
                }
                if (allowedSourceRefs && !uniqueRefs.length) {
                    diagnostics.invalidLines.push({ title: block.title, section: section.name, line, reason: '缺少当前规划组的来源行引用' });
                    continue;
                }
                if (!uniqueIds.length) {
                    diagnostics.invalidLines.push({ title: block.title, section: section.name, line, reason: '缺少可追溯旧条目UID，且没有可继承的条目级合并来源' });
                    continue;
                }
                if (uniqueIds.length < minimumEvidence && !uniqueIds.some((id) => explicitFoundationUids.has(id))) {
                    diagnostics.invalidLines.push({ title: block.title, section: section.name, line, reason: `该推导层至少需要${minimumEvidence}个独立旧UID证据` });
                    continue;
                }
                if (KNOWLEDGE_SECTIONS.has(section.name) && !SOURCE_KIND_PATTERN.test(line)) {
                    diagnostics.invalidLines.push({ title: block.title, section: section.name, line, reason: '人物认知缺少明确的信息来源类型' });
                    continue;
                }
                if (evidenceRecordByUid && !migrationLineSupportedBySources(line, uniqueIds, evidenceRecordByUid)) {
                    diagnostics.invalidLines.push({ title: block.title, section: section.name, line, reason: '该行与所引用旧条目缺少足够的词语或事实锚点，已阻止无证据改写' });
                    continue;
                }
                if (explicitLineRefs.length && isGeneralizedRebuildRuleLine(block.type, section.name, line)
                    && !rebuildRuleLineSupported(line, explicitLineRefs, policy)) {
                    diagnostics.invalidLines.push({ title: block.title, section: section.name, line, reason: '单次行为或单一场景证据不足以提炼为长期运行规则' });
                    continue;
                }
                uniqueIds.forEach((id) => sourceUids.add(id));
                uniqueRefs.forEach((ref) => sourceRefs.add(ref));
                const normalizedLine = (0, parser_1.normalizePointLine)(line);
                lines.push(normalizedLine);
                lineEvidence.push({ section: section.name, line: normalizedLine, refs: uniqueRefs, explicit: explicitLineRefs.length > 0 });
            }
            if (lines.length) {
                const safeLines = removeUnresolvedSlotConflicts(section.name, (0, util_1.unique)(lines), diagnostics, block.title);
                if (safeLines.length) sections.push({ name: section.name, lines: safeLines, empty: false });
            }
        }
        if (inheritedEvidenceLines > 0) {
            diagnostics.warnings.push(`${block.title}有${inheritedEvidenceLines}行未逐行标注旧UID，已继承该条目的有效合并来源`);
        }
        if (!sections.length) continue;
        for (const uid of block.mergeSourceUids ?? []) {
            const id = String(uid);
            if (knownUids.has(id) && (!allowedEvidenceUids || allowedEvidenceUids.has(id))) sourceUids.add(id);
        }
        output.push(applyRebuildTemporalSettlement({ ...block, sections, sourceUids: [...sourceUids], sourceRefs: [...sourceRefs], lineEvidence }, diagnostics));
    }
    if (!output.length) {
        const invalid = Math.max(0, (diagnostics.invalidLines?.length || 0) - invalidStart);
        throw new Error(invalid
            ? `已识别条目格式，但本批${invalid}行缺少有效旧UID证据或人物信息来源`
            : '未找到可验证的重建条目');
    }
    return output;
}


function migrationLineSupportedBySources(line, sourceUids, recordByUid) {
    const coreLine = String(line ?? '').replace(/\s*｜\s*(?:信息来源|认知来源)\s*[：:].*$/u, '').trim();
    const fact = normalizeMigrationEvidenceText(stripGenericFactLabel(coreLine));
    if (!fact || fact.length < 4) return true;
    const factGrams = migrationBigrams(fact);
    for (const uid of sourceUids ?? []) {
        const record = recordByUid.get(String(uid));
        if (!record) continue;
        const source = normalizeMigrationEvidenceText(`${record.title}\n${record.content}\n${(record.keywords ?? []).join(' ')}`);
        if (!source) continue;
        if (source.includes(fact) || (fact.length >= 8 && fact.includes(source))) return true;
        const shared = [...factGrams].filter((gram) => source.includes(gram)).length;
        const coverage = factGrams.size ? shared / factGrams.size : 0;
        const anchors = migrationEvidenceAnchors(fact);
        const anchorHits = anchors.filter((anchor) => source.includes(anchor)).length;
        // 短结果允许通过一个明确二字锚点完成同义改写；长句仍要求更高覆盖率，避免无关扩写。
        if ((fact.length <= 12 && shared >= 1) || coverage >= 0.35 || (anchorHits >= 2 && coverage >= 0.2) || (anchorHits >= 1 && coverage >= 0.34)) return true;
    }
    return false;
}

function normalizeMigrationEvidenceText(value) {
    return (0, util_1.normalizeFact)(String(value ?? ''))
        .replace(/(?:已经|目前|当前|仍然|曾经|此前|后来|最终|明确|确认|形成|相关|主要|负责|属于)/gu, '')
        .replace(/[“”‘’"'（）()【】\[\]，,。；;：:\s]/gu, '');
}

function migrationEvidenceAnchors(value) {
    const generic = new Set(['世界', '人物', '角色', '物品', '事件', '场景', '状态', '结果', '情况', '规则', '内容', '相关', '当前', '已经']);
    return (0, util_1.unique)(String(value ?? '').match(/[\p{Script=Han}A-Za-z0-9·-]{2,16}/gu) ?? [])
        .filter((item) => item.length >= 2 && !generic.has(item))
        .slice(0, 12);
}

function migrationBigrams(value) {
    const text = String(value ?? '');
    const out = new Set();
    for (let index = 0; index < text.length - 1; index += 1) out.add(text.slice(index, index + 2));
    return out;
}

function isGeneralizedRebuildRuleLine(type, section, line) {
    const ruleSections = new Set(['自然规则', '社会规则', '制度', '局部约束', '功能', '限制', '稳定', '关系']);
    if (!ruleSections.has(String(section ?? ''))) return false;
    if (!['基础设定', '世界', '场景', '物品', '人物'].includes(String(type ?? ''))) return false;
    return /(?:每当|一旦|只要|必须|不得|只能|固定|通常|会在|持续至|触发|条件|约定|制度|规则|机制|流程|权限|限制)/u.test(String(line ?? ''));
}

function rebuildRuleLineSupported(line, refs, policy = {}) {
    const sourceLineByRef = policy.sourceLineByRef instanceof Map ? policy.sourceLineByRef : null;
    if (!sourceLineByRef?.size) return true;
    const sourceItems = (refs ?? []).map((ref) => sourceLineByRef.get(ref)).filter(Boolean);
    if (!sourceItems.length) return false;
    const explicitRule = sourceItems.some((item) => /(?:每当|一旦|只要|必须|不得|只能|固定|通常|触发|条件|约定|制度|规则|机制|流程|权限|限制)/u.test(String(item.text ?? '')));
    if (explicitRule) return true;
    const refToAnchor = new Map();
    const catalog = policy.anchorCatalog instanceof Map ? [...policy.anchorCatalog.values()] : (policy.anchorCatalog ?? []);
    for (const anchor of catalog) for (const ref of anchor.refs ?? []) refToAnchor.set(ref, anchor.id);
    const anchors = new Set((refs ?? []).map((ref) => refToAnchor.get(ref)).filter(Boolean));
    if (anchors.size < 2) return false;
    const fact = normalizeMigrationEvidenceText(stripGenericFactLabel(line));
    const factAnchors = migrationEvidenceAnchors(fact);
    const factGrams = migrationBigrams(fact);
    const repeatedSupport = sourceItems.filter((item) => {
        const source = normalizeMigrationEvidenceText(item.text);
        const anchorHit = factAnchors.some((anchor) => source.includes(anchor));
        const shared = [...factGrams].filter((gram) => source.includes(gram)).length;
        const coverage = factGrams.size ? shared / factGrams.size : 0;
        return anchorHit || coverage >= 0.28;
    }).length;
    return repeatedSupport >= 2;
}

function applyRebuildTemporalSettlement(rawBlock, diagnostics = { warnings: [] }) {
    const block = (0, util_1.clone)(rawBlock);
    block.temporalState = normalizeRebuildTemporalState(block.temporalState, block.type);
    block.sceneAnchors = (0, util_1.unique)(block.sceneAnchors ?? []);
    block.primarySceneAnchor = block.primarySceneAnchor || block.sceneAnchors[0] || '';
    block.gameTime = normalizeRebuildGameTime(block.gameTime);
    block.timeSource = normalizeRebuildTimeSource(block.timeSource);
    block.anchorLocation = String(block.anchorLocation || '未知').trim() || '未知';
    if (!['已完成', '已结束'].includes(block.temporalState)) return block;
    const dynamicByType = {
        人物: new Set(['当前']),
        场景: new Set(['当前状态', '在场', '当前资源', '活动关联']),
        物品: new Set(['当前']),
    };
    const dynamic = dynamicByType[block.type];
    if (!(dynamic instanceof Set)) return block;
    const retained = [];
    const moved = [];
    const lineMap = new Map();
    for (const section of block.sections ?? []) {
        if (!dynamic.has(section.name)) {
            retained.push(section);
            continue;
        }
        for (const line of section.lines ?? []) {
            const pastLine = toCompletedRebuildFactLine(line, section.name);
            moved.push(pastLine);
            lineMap.set(`${section.name}\u0000${line}`, pastLine);
        }
    }
    if (!moved.length) return block;
    let history = retained.find((section) => section.name === '固定事实');
    if (!history) {
        history = { name: '固定事实', lines: [], empty: false };
        retained.push(history);
    }
    history.lines = dedupeMigrationLines([...(history.lines ?? []), ...moved]);
    history.empty = history.lines.length === 0;
    block.sections = retained.filter((section) => section.lines?.length);
    block.lineEvidence = (block.lineEvidence ?? []).map((evidence) => {
        const replacement = lineMap.get(`${evidence.section}\u0000${evidence.line}`);
        return replacement ? { ...evidence, section: '固定事实', line: replacement } : evidence;
    });
    diagnostics.warnings ?? (diagnostics.warnings = []);
    diagnostics.warnings.push(`${block.title}已标记为${block.temporalState}，${moved.length}条旧动态状态已转为过去完成态，未继续占用当前栏目`);
    return block;
}

function toCompletedRebuildFactLine(value, sourceSection = '') {
    const line = (0, parser_1.normalizePointLine)(String(value ?? '').trim());
    if (/^(?:曾|过去|此前|当时|已结束|已完成|历史状态)/u.test(line)) return line;
    const field = line.match(/^([^：:]{1,24})\s*[：:]\s*(.+)$/u);
    const rawLabel = String(field?.[1] || '').replace(/^当前/u, '').trim();
    const valueText = String(field?.[2] || line)
        .replace(/正在/gu, '曾')
        .replace(/当前/gu, '当时')
        .replace(/仍然|仍在/gu, '当时')
        .trim();
    const label = ({
        在场: '历史在场',
        当前状态: '历史状态',
        当前资源: '历史资源',
        活动关联: '历史关联',
        当前: /位置/u.test(rawLabel) ? '历史位置' : /目标/u.test(rawLabel) ? '历史目标' : /状态|伤势|情绪/u.test(rawLabel) ? '历史状态' : `历史${rawLabel || '事实'}`,
    })[sourceSection] || `历史${rawLabel || '事实'}`;
    return `${label}：${valueText}`;
}

function preserveSparseRebuildBlocks(blocks, records, schema, diagnostics = { warnings: [] }) {
    const recordByUid = new Map((records ?? []).map((record) => [String(record.uid), record]));
    return (blocks ?? []).map((rawBlock) => {
        const block = (0, util_1.clone)(rawBlock);
        block.sections = (block.sections ?? []).map((section) => ({
            ...section,
            lines: dedupeMigrationLines((section.lines ?? []).filter((line) => !isTautologicalRebuildLine(block, line))),
        })).filter((section) => section.lines.length);
        const factCount = allBlockFactLines(block).length;
        if (block.type === '世界' && isGenericWorldName(block.name)) stabilizeGenericWorldBlockName(block, recordByUid);
        const explicitlyCoveredRefs = new Set((block.lineEvidence ?? []).filter((item) => item.explicit === true).flatMap((item) => item.refs ?? []));
        const allPlannedRefsCompressed = (block.sourceRefs ?? []).length > 0 && (block.sourceRefs ?? []).every((ref) => explicitlyCoveredRefs.has(String(ref)));
        if (allPlannedRefsCompressed) return block;
        if (factCount >= 2 || !['世界', '基础设定', '物品', '场景', '人物'].includes(block.type)) return block;
        const allowed = schema?.allowedSectionsByType?.[block.type] ?? TYPE_ALLOWED_SECTIONS[block.type];
        const byName = new Map((block.sections ?? []).map((section) => [section.name, section]));
        let restored = 0;
        for (const uid of block.sourceUids ?? []) {
            const record = recordByUid.get(String(uid));
            if (!record || recordType(record, schema) !== block.type) continue;
            const parsed = (0, parser_1.parseEntrySections)(record.content || '');
            for (const rawName of parsed.order ?? Object.keys(parsed.values ?? {})) {
                const name = (0, information_point_1.canonicalSectionName)(rawName, block.type);
                if (allowed instanceof Set && !allowed.has(name)) continue;
                const sourceLines = (parsed.values?.[rawName] ?? parsed.values?.[name] ?? [])
                    .map(parser_1.normalizePointLine)
                    .filter((line) => line && !isTautologicalRebuildLine(block, line));
                if (!sourceLines.length) continue;
                let section = byName.get(name);
                if (!section) {
                    section = { name, lines: [], empty: false };
                    block.sections.push(section);
                    byName.set(name, section);
                }
                const before = section.lines.length;
                section.lines = dedupeMigrationLines([...(section.lines ?? []), ...sourceLines]).slice(0, 8);
                restored += Math.max(0, section.lines.length - before);
            }
        }
        if (restored) diagnostics.warnings.push(`${block.title}的模型结果过于空泛，已从其旧UID来源恢复${restored}条原有事实，避免生成空壳条目`);
        return block;
    }).filter((block) => (block.sections ?? []).some((section) => section.lines?.length));
}

function stabilizeGenericWorldBlockName(block, recordByUid) {
    const candidates = (block.sourceUids ?? []).map((uid) => recordByUid.get(String(uid)))
        .filter((record) => record && recordType(record) === '世界')
        .map((record) => ({
            record,
            name: (0, util_1.splitTitle)((0, util_1.normalizeTitle)(record.title))?.name || record.name || '',
        }))
        .filter((item) => item.name && !isGenericWorldName(item.name))
        .sort((left, right) => String(right.record.content ?? '').length - String(left.record.content ?? '').length);
    if (!candidates.length) return;
    block.name = candidates[0].name;
    block.title = `世界｜${block.name}`;
}

function isTautologicalRebuildLine(block, line) {
    const fact = (0, util_1.normalizeFact)(stripGenericFactLabel(line));
    const name = (0, util_1.normalizeFact)(block?.name ?? '');
    if (!fact) return true;
    if (name && (fact === name || fact === `${name}${name}`)) return true;
    return /^(?:无|暂无|同名条目|相关内容|具体情况|世界情况|当前局势|暂无更多信息|未说明|<<<endentry>>>|uid[:：]?\d+|重建待确认·?\d*)$/iu.test(fact);
}

function dedupeMigrationLines(lines) {
    const output = [];
    for (const line of lines ?? []) {
        const normalized = (0, util_1.normalizeFact)(stripGenericFactLabel(line));
        if (!normalized) continue;
        const duplicate = output.some((current) => {
            const existing = (0, util_1.normalizeFact)(stripGenericFactLabel(current));
            return existing === normalized
                || (Math.min(existing.length, normalized.length) >= 8 && (existing.includes(normalized) || normalized.includes(existing)))
                || (Math.min(existing.length, normalized.length) >= 12 && bigramSimilarity(existing, normalized) >= 0.82);
        });
        if (!duplicate) output.push(line);
    }
    return output;
}

function parseRebuildEnvelope(raw, diagnostics, policy = {}) {
    const universalBlocks = parseUniversalRebuildFormat(raw, diagnostics, policy);
    if (universalBlocks.length) return universalBlocks;
    const jsonBlocks = parseRebuildJson(raw, diagnostics, policy);
    if (jsonBlocks.length) return jsonBlocks;
    const normalized = normalizeRebuildText(raw, diagnostics, policy);
    if (/^(?:无|EMPTY)$/iu.test(normalized.trim())) return [];
    try {
        if (/<<<\s*ENTRY\s*[:：]/iu.test(normalized)) {
            const strict = parseStrictRebuildBlocks(normalized, policy);
            if (strict.length) return strict;
        }
        return (0, parser_1.parseInformationPoints)(normalized);
    }
    catch (error) {
        const sample = normalized.replace(/\s+/gu, ' ').slice(0, 220);
        throw new Error(`模型返回无法解析；已兼容代码块、Markdown标题、冒号标题和JSON。返回开头：${sample || '（空）'}`);
    }
}


function parseUniversalRebuildFormat(raw, diagnostics, policy = {}) {
    const text = String(raw ?? '')
        .replace(/<think>[\s\S]*?<\/think>/giu, '')
        .replace(/```(?:json|text|markdown|md)?/giu, '')
        .replace(/\r/g, '')
        .trim();
    if (!new RegExp(`^\\s*【\\s*${UNIVERSAL_ENTRY_MARKER}\\s*】\\s*$`, 'mu').test(text)) return [];
    const segments = text.split(new RegExp(`^\\s*【\\s*${UNIVERSAL_ENTRY_MARKER}\\s*】\\s*$`, 'gmu')).slice(1);
    const blocks = [];
    for (const segment of segments) {
        const metadata = {};
        const contentLines = [];
        const knowledgeLines = [];
        const pastLines = [];
        const keywords = [];
        let section = '';
        for (const rawLine of segment.split('\n')) {
            const line = String(rawLine ?? '').trim();
            if (!line) continue;
            const heading = line.match(/^【\s*([^】]+?)\s*】$/u)?.[1]?.trim();
            if (heading && UNIVERSAL_SECTION_NAMES.has(heading)) {
                section = heading;
                continue;
            }
            const plain = (0, parser_1.stripListMarker)(line).trim();
            if (!section) {
                const meta = plain.match(/^([^：:]{1,24})\s*[：:]\s*(.*?)\s*$/u);
                if (meta && UNIVERSAL_METADATA_NAMES.has(meta[1].trim())) metadata[meta[1].trim()] = meta[2].trim();
                continue;
            }
            if (section === '内容') contentLines.push(plain);
            else if (section === '角色认知') knowledgeLines.push(plain);
            else if (section === '过去结果') pastLines.push(plain);
            else if (section === '关键词') keywords.push(...plain.split(/[,，、]/u).map((item) => item.trim()).filter(Boolean));
        }
        const name = String(metadata.名称 ?? '').trim();
        const targetType = String(metadata.归入类型 ?? '').trim();
        if (!name || !targetType) {
            diagnostics.warnings.push('通用新条目缺少“名称”或“归入类型”，已丢弃');
            continue;
        }
        const rawFields = contentLines.map((line) => line.match(/^([^：:]{1,24})\s*[：:]\s*(.+)$/u)?.[1]?.trim()).filter(Boolean);
        if (pastLines.length) rawFields.push('过去结果');
        let type = '';
        let proposalAccepted = false;
        let proposalDescription = '';
        if ((0, util_1.normalizeFact)(targetType) === (0, util_1.normalizeFact)('新类型建议')) {
            if (policy.allowNewTypes !== true) {
                diagnostics.warnings.push(`“${name}”所在重建阶段不允许创建新类型，已丢弃建议`);
                continue;
            }
            proposalDescription = String(metadata.与现有类型区别 ?? '').trim();
            const accepted = registerProposedMigrationType(policy.schema, metadata.建议类型, rawFields, proposalDescription, name, diagnostics);
            if (!accepted) continue;
            type = accepted.type;
            proposalAccepted = accepted.created;
        }
        else {
            type = resolveMigrationType(targetType, policy.schema);
            if (!policy.schema?.definitions?.has(type)) {
                diagnostics.warnings.push(`“${name}”填写了不存在的归入类型“${targetType}”；应使用已有类型或明确写“新类型建议”`);
                continue;
            }
        }
        const allowedTypes = policy.allowedTypes instanceof Set ? policy.allowedTypes : ALLOWED_TYPES;
        if (!proposalAccepted && !allowedTypes.has(type)) {
            diagnostics.warnings.push(`“${name}”归入类型“${type}”不属于当前重建阶段，已丢弃`);
            continue;
        }
        const sectionsByName = new Map();
        const addLine = (sectionName, line) => {
            if (!sectionName || !line) return;
            const current = sectionsByName.get(sectionName) ?? [];
            current.push(line);
            sectionsByName.set(sectionName, current);
        };
        for (const line of contentLines) {
            const field = line.match(/^([^：:]{1,24})\s*[：:]\s*(.+)$/u);
            if (!field) {
                diagnostics.warnings.push(`${type}｜${name}【内容】存在无法识别的行，已丢弃：${line.slice(0, 80)}`);
                continue;
            }
            const rawField = field[1].trim();
            const value = field[2].trim();
            const sectionName = resolveUniversalFieldSection(type, rawField, policy.schema, proposalAccepted);
            if (!sectionName) {
                diagnostics.warnings.push(`${type}｜${name}的栏目“${rawField}”无法归入该类型，已丢弃`);
                continue;
            }
            addLine(sectionName, `${rawField}：${value}`);
        }
        for (const line of knowledgeLines) {
            if (type !== '人物') {
                diagnostics.warnings.push(`${type}｜${name}的【角色认知】不属于人物条目，已丢弃`);
                continue;
            }
            const parsed = parseUniversalKnowledgeLine(line, name, metadata.别名);
            if (!parsed) {
                diagnostics.warnings.push(`人物｜${name}存在无法验证的角色认知行，已丢弃`);
                continue;
            }
            addLine(parsed.section, parsed.line);
        }
        const pastSection = universalPastSection(type, policy.schema, proposalAccepted);
        if (pastSection) for (const line of pastLines) addLine(pastSection, line);
        else if (pastLines.length) diagnostics.warnings.push(`${type}｜${name}没有适合保存【过去结果】的栏目，相关行已丢弃`);
        if (metadata.别名) {
            const marker = sourceMarkerSuffix(metadata.别名);
            const clean = String(metadata.别名).replace(SOURCE_MARKER, '').trim();
            SOURCE_MARKER.lastIndex = 0;
            for (const alias of clean.split(/[,，、]/u).map((item) => item.trim()).filter(Boolean)) addLine('别名', `${alias}${marker}`);
        }
        const sections = [...sectionsByName.entries()].map(([sectionName, lines]) => ({ name: sectionName, lines: (0, util_1.unique)(lines), empty: false })).filter((sectionItem) => sectionItem.lines.length);
        if (!sections.length) continue;
        const groupId = String(metadata.组ID ?? '').trim();
        const groupSceneAnchors = policy.sceneAnchorsByGroup instanceof Map ? policy.sceneAnchorsByGroup.get(groupId) : null;
        const allowedSceneAnchors = groupSceneAnchors instanceof Set
            ? groupSceneAnchors
            : policy.allowedSceneAnchors instanceof Set ? policy.allowedSceneAnchors : null;
        const requestedSceneAnchors = parseSceneAnchorList(metadata.场景锚点);
        const fallbackSceneAnchors = (0, util_1.unique)(groupSceneAnchors instanceof Set ? [...groupSceneAnchors] : policy.defaultSceneAnchors ?? []);
        const sceneAnchors = (0, util_1.unique)((requestedSceneAnchors.length ? requestedSceneAnchors : fallbackSceneAnchors)
            .filter((anchor) => !allowedSceneAnchors || allowedSceneAnchors.has(anchor)));
        if (requestedSceneAnchors.length && !sceneAnchors.length && fallbackSceneAnchors.length) {
            diagnostics.warnings.push(`${type}｜${name}填写了不属于当前规划组的场景锚点，已改用规划阶段锚点`);
            sceneAnchors.push(...fallbackSceneAnchors.filter((anchor) => !allowedSceneAnchors || allowedSceneAnchors.has(anchor)));
        }
        const temporal = resolveBlockTemporalMetadata({
            sceneAnchors,
            gameTime: metadata.游戏时间,
            timeSource: metadata.时间来源,
            temporalState: metadata.时态,
            type,
        }, policy);
        blocks.push({
            rawTitle: `${type}｜${name}`,
            title: `${type}｜${name}`,
            type,
            name,
            sections,
            keywords: (0, util_1.unique)(keywords),
            mergeSourceUids: parseUniversalUidList(metadata.合并来源),
            sourceRefs: parseSourceRefList(metadata.来源行),
            newTypeProposalAccepted: proposalAccepted,
            proposedTypeDescription: proposalDescription,
            planGroupId: groupId,
            retentionMode: String(metadata.保留方式 ?? '').trim(),
            mergeIntoTitle: (0, util_1.normalizeTitle)(String(metadata.并入条目 ?? '').trim()),
            mergeIntoSection: String(metadata.并入栏目 ?? '').trim(),
            sceneAnchors: temporal.sceneAnchors,
            primarySceneAnchor: temporal.primarySceneAnchor,
            gameTime: temporal.gameTime,
            timeSource: temporal.timeSource,
            temporalState: temporal.temporalState,
            anchorLocation: temporal.anchorLocation,
        });
    }
    if (blocks.length) {
        diagnostics.parserRepairs = Number(diagnostics.parserRepairs || 0) + 1;
        diagnostics.warnings.push('模型返回了通用“新条目提案”格式，已在本地转换为世界书条目');
    }
    return blocks;
}

function parseSceneAnchorList(value) {
    return (0, util_1.unique)(String(value ?? '').toUpperCase().match(/S\d{1,6}/gu) ?? [])
        .map((anchor) => `S${String(Number(anchor.slice(1)) || 0).padStart(3, '0')}`)
        .filter((anchor) => anchor !== 'S000');
}

function resolveBlockTemporalMetadata(metadata, policy = {}) {
    const catalog = policy.anchorCatalog instanceof Map
        ? policy.anchorCatalog
        : new Map((policy.anchorCatalog ?? []).map((anchor) => [anchor.id, anchor]));
    const sceneAnchors = (0, util_1.unique)(metadata.sceneAnchors ?? []).filter(Boolean);
    const primarySceneAnchor = sceneAnchors[0] || '';
    const selected = sceneAnchors.map((anchor) => catalog.get(anchor)).filter(Boolean);
    const gameTimes = (0, util_1.unique)(selected.map((anchor) => normalizeRebuildGameTime(anchor.gameTime)).filter((value) => value && value !== '未知'));
    const locations = (0, util_1.unique)(selected.map((anchor) => String(anchor.location || '').trim()).filter((value) => value && value !== '未知'));
    const sources = selected.map((anchor) => normalizeRebuildTimeSource(anchor.timeSource));
    const gameTime = selected.length && gameTimes.length < selected.length
        ? (gameTimes.length ? `${gameTimes[0]} 至 未知` : '未知')
        : gameTimes.length > 1 ? `${gameTimes[0]} 至 ${gameTimes.at(-1)}` : gameTimes[0] || normalizeRebuildGameTime(metadata.gameTime);
    const timeSource = selected.length
        ? (sources.includes('未知') ? '未知' : sources.includes('推定') ? '推定' : '明确')
        : normalizeRebuildTimeSource(metadata.timeSource);
    const anchorLocation = locations.length > 1 ? locations.join('、') : locations[0] || '未知';
    return {
        sceneAnchors,
        primarySceneAnchor,
        gameTime,
        timeSource,
        temporalState: normalizeRebuildTemporalState(metadata.temporalState, metadata.type),
        anchorLocation,
    };
}

function parseUniversalUidList(value) {
    return (0, util_1.unique)(String(value ?? '')
        .replace(SOURCE_MARKER, (_match, group) => String(group ?? ''))
        .split(/[,，、\s]+/u)
        .map((item) => item.replace(/^(?:UID|旧UID|来源)\s*[:：]?/iu, '').trim())
        .filter(Boolean));
}

function parseSourceRefList(value) {
    return (0, util_1.unique)(String(value ?? '')
        .replace(SOURCE_LINE_MARKER, (_match, group) => String(group ?? ''))
        .split(/[,，、\s]+/u)
        .map((item) => item.trim().replace(/^来源行\s*[：:]?/u, ''))
        .filter((item) => /^.+:s\d+:l\d+$/u.test(item)));
}

function stripSourceLineMarkers(value) {
    const text = String(value ?? '').replace(SOURCE_LINE_MARKER, '').trim();
    SOURCE_LINE_MARKER.lastIndex = 0;
    return text;
}

function sourceMarkerSuffix(value) {
    const markers = [];
    String(value ?? '').replace(SOURCE_MARKER, (match) => { markers.push(match); return ''; });
    SOURCE_MARKER.lastIndex = 0;
    return markers.join('');
}

function resolveUniversalFieldSection(type, rawField, schema, proposed = false) {
    const field = String(rawField ?? '').trim().replace(/\s+/gu, '');
    if (!field) return '';
    const allowed = schema?.allowedSectionsByType?.[type];
    if (allowed instanceof Set && allowed.has(field)) return field;
    if (proposed) return field;
    const aliases = UNIVERSAL_FIELD_ALIASES[type] ?? {};
    const normalized = (0, util_1.normalizeFact)(field);
    for (const [section, values] of Object.entries(aliases)) {
        if (values.some((value) => (0, util_1.normalizeFact)(value) === normalized)) return allowed instanceof Set && !allowed.has(section) ? '' : section;
    }
    if (allowed instanceof Set) {
        const candidates = [...allowed].filter((section) => section !== '别名');
        const direct = candidates.find((section) => {
            const left = (0, util_1.normalizeFact)(section);
            return left === normalized || (Math.min(left.length, normalized.length) >= 2 && (left.includes(normalized) || normalized.includes(left)));
        });
        if (direct) return direct;
    }
    return '';
}

function parseUniversalKnowledgeLine(value, entryName, aliasText = '') {
    const marker = sourceMarkerSuffix(value);
    const clean = String(value ?? '').replace(SOURCE_MARKER, '').trim();
    SOURCE_MARKER.lastIndex = 0;
    const match = clean.match(/^([^｜|]+)[｜|](知道|已知|怀疑|认为|推测|判断|误以为|误信|错误相信)\s*[：:]\s*(.*?)\s*[｜|]\s*(?:来源|信息来源|认知来源)\s*[：:]\s*([^｜|]+?)(?:\s*[｜|]\s*(?:证伪|证伪依据|证伪事实)\s*[：:]\s*(.+))?$/u);
    if (!match) return null;
    const observer = match[1].trim();
    const aliases = String(aliasText ?? '').replace(SOURCE_MARKER, '').split(/[,，、]/u).map((item) => item.trim()).filter(Boolean);
    SOURCE_MARKER.lastIndex = 0;
    const validObserver = [entryName, ...aliases].some((name) => (0, util_1.normalizeFact)(name) === (0, util_1.normalizeFact)(observer));
    if (!validObserver) return null;
    const mode = match[2];
    const fact = match[3].trim();
    const source = match[4].trim();
    const disprovedBy = String(match[5] ?? '').trim();
    if (!fact || !source) return null;
    // [MA-EPISTEMIC-03] “怀疑/认为/推测”只是人物当前认知，不代表错误。
    // 只有模型明确写出误信且同时提供证伪依据，才进入【误信】；否则统一进入【已知】。
    const requestedMistaken = /(?:误以为|误信|错误相信)/u.test(mode);
    const mistaken = requestedMistaken && Boolean(disprovedBy);
    return {
        section: mistaken ? '误信' : '已知',
        line: `${fact}｜信息来源：${source}${mistaken ? `｜证伪依据：${disprovedBy}` : ''}${marker}`,
    };
}

function universalPastSection(type, schema, proposed = false) {
    if (proposed) return '过去结果';
    const builtin = ({ 人物: '固定事实', 场景: '固定事实', 物品: '固定事实', 事件: '结果', 世界: '固定事实' })[type];
    if (builtin) return builtin;
    const allowed = schema?.allowedSectionsByType?.[type];
    if (!(allowed instanceof Set)) return '';
    return [...allowed].find((section) => /(?:历史|变化|结果|进展|经历)/u.test(section)) ?? '';
}

function parseStrictRebuildBlocks(raw, policy = {}) {
    const allowedTypes = policy.allowedTypes instanceof Set ? policy.allowedTypes : ALLOWED_TYPES;
    const blocks = [];
    const pattern = /<<<ENTRY\s*[:：]\s*([^:\r\n>]+)\s*[:：]\s*([^>\r\n]+)>>>([\s\S]*?)(?=<<<ENTRY\s*[:：]|$)/giu;
    for (const match of String(raw ?? '').matchAll(pattern)) {
        const type = resolveMigrationType(match[1], policy.schema);
        const name = String(match[2] ?? '').trim();
        if (!allowedTypes.has(type) || !name) continue;
        const segment = String(match[3] ?? '');
        const contentIndex = segment.search(/<<<CONTENT>>>/iu);
        const content = contentIndex >= 0 ? segment.slice(contentIndex + '<<<CONTENT>>>'.length).replace(/<<<END_ENTRY>>>[\s\S]*$/iu, '') : segment;
        const parsed = (0, parser_1.parseEntrySections)(content);
        const allowedSections = policy.allowedSectionsByType?.[type];
        const sections = parsed.order.filter((section) => !(allowedSections instanceof Set) || allowedSections.has(section)).map((section) => ({ name: section, lines: parsed.values[section] ?? [], empty: false })).filter((section) => section.lines.length);
        if (sections.length) blocks.push({ rawTitle: `${type}｜${name}`, title: `${type}｜${name}`, type, name, sections, keywords: [] });
    }
    return blocks;
}

const REBUILD_SECTION_NAMES = new Set([
    '身份', '稳定', '当前', '关系', '持有', '已知', '误信', '固定事实', '持续经历', '别名',
    '定义', '空间结构', '固定资源', '固定事实', '持续变化', '当前状态', '在场', '当前资源', '活动关联', '世界影响', '局部约束',
    '功能', '限制', '参与', '场景', '已发生进展', '未发生进展', '关键进展', '结果',
    '范围', '地理', '组织', '权力', '制度', '资源与交通', '公开局势', '固定事实', '世界变化', '持续影响',
    '世界常识', '自然规则', '种族与生命', '能力与技术', '社会规则', '地理框架',
]);

function normalizeRebuildText(raw, diagnostics, policy = {}) {
    let text = String(raw ?? '')
        .replace(/<think>[\s\S]*?<\/think>/giu, '')
        .replace(/```(?:json|text|markdown|md)?/giu, '')
        .replace(/[＜﹤]/gu, '<')
        .replace(/[＞﹥]/gu, '>')
        .replace(/\r/g, '')
        .trim();
    const lines = [];
    let repairs = 0;
    for (const original of text.split('\n')) {
        let line = original.trimEnd();
        const title = line.match(/^\s*(?:#{1,6}\s*)?(?:\*\*|__|`)?([^｜|丨:：—–\n]{1,32})\s*(?:[｜|丨]|[:：]|[-—–])\s*(.+?)(?:\*\*|__|`)?\s*$/iu);
        if (title) {
            const type = resolveMigrationType(title[1], policy.schema);
            const name = String(title[2] ?? '').replace(/(?:\*\*|__|`)$/u, '').trim().replace(/^[【\[]|[】\]]$/gu, '');
            const allowedTitleTypes = policy.allowedTypes instanceof Set ? policy.allowedTypes : ALLOWED_TYPES;
            if (type && name && allowedTitleTypes.has(type)) {
                const canonical = `${type}｜${name}`;
                if (canonical !== line.trim()) repairs += 1;
                lines.push(canonical);
                continue;
            }
        }
        const headingLine = line.replace(/^\s*#{1,6}\s*/u, '').replace(/\*\*|__/gu, '').replace(/`/gu, '').trim();
        const section = headingLine.match(/^(?:【|\[)?([^】\]\n]{1,24}?)(?:】|\])?\s*[:：]?\s*$/u);
        if (section) {
            const name = String(section[1] ?? '').replace(/\s+/gu, '').trim();
            const allowedSectionNames = new Set([...REBUILD_SECTION_NAMES, ...Object.values(policy.allowedSectionsByType ?? {}).flatMap((value) => value instanceof Set ? [...value] : [])]);
            if (allowedSectionNames.has(name)) {
                const canonical = `【${name}】`;
                if (canonical !== line.trim()) repairs += 1;
                lines.push(canonical);
                continue;
            }
        }
        lines.push(line);
    }
    if (repairs) {
        diagnostics.parserRepairs = Number(diagnostics.parserRepairs || 0) + repairs;
        diagnostics.warnings.push(`本地解析器修复了${repairs}处Markdown或标题格式，不追加模型调用`);
    }
    return lines.join('\n').trim();
}

function parseRebuildJson(raw, diagnostics, policy = {}) {
    const text = String(raw ?? '')
        .replace(/<think>[\s\S]*?<\/think>/giu, '')
        .replace(/```(?:json)?/giu, '')
        .trim();
    const candidates = [text];
    const objectStart = text.indexOf('{');
    const objectEnd = text.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) candidates.push(text.slice(objectStart, objectEnd + 1));
    const arrayStart = text.indexOf('[');
    const arrayEnd = text.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(text.slice(arrayStart, arrayEnd + 1));
    let value = null;
    for (const candidate of candidates) {
        try {
            value = JSON.parse(candidate);
            break;
        }
        catch { }
    }
    if (value == null) return [];
    const entries = jsonEntries(value);
    const blocks = entries.map(([key, entry]) => jsonEntryToBlock(entry, key, policy)).filter(Boolean);
    if (blocks.length) {
        diagnostics.parserRepairs = Number(diagnostics.parserRepairs || 0) + 1;
        diagnostics.warnings.push('模型返回了JSON，已在本地转换为可验证重建条目，未追加模型调用');
    }
    return blocks;
}

function jsonEntries(value) {
    if (Array.isArray(value)) return value.map((entry, index) => [String(index), entry]);
    if (!value || typeof value !== 'object') return [];
    for (const key of ['entries', 'blocks', 'items', 'results', 'data']) {
        const nested = value[key];
        if (Array.isArray(nested)) return nested.map((entry, index) => [String(index), entry]);
        if (nested && typeof nested === 'object') return Object.entries(nested);
    }
    const keys = Object.keys(value);
    if (keys.some((key) => (0, util_1.splitTitle)((0, util_1.normalizeTitle)(key)))) return Object.entries(value);
    return [['0', value]];
}

function jsonEntryToBlock(entry, key = '', policy = {}) {
    if (!entry || typeof entry !== 'object') return null;
    let type = resolveMigrationType(entry.type ?? entry.kind ?? entry.category ?? '', policy.schema);
    let name = String(entry.name ?? entry.entity ?? entry.stableName ?? '').trim();
    const rawTitle = String(entry.title ?? entry.comment ?? key ?? '').trim();
    const split = (0, util_1.splitTitle)((0, util_1.normalizeTitle)(rawTitle));
    if (split) {
        type ||= resolveMigrationType(split.type, policy.schema);
        name ||= split.name;
    }
    const allowedTypes = policy.allowedTypes instanceof Set ? policy.allowedTypes : ALLOWED_TYPES;
    if (!type || !name || !allowedTypes.has(type)) return null;
    const defaultSources = jsonSourceIds(entry.sourceUids ?? entry.evidence ?? entry.sources ?? entry.sourceUid);
    const sections = [];
    const explicitSource = entry.sections ?? entry.fields ?? entry.content;
    const source = explicitSource !== undefined
        ? explicitSource
        : Object.fromEntries(Object.entries(entry).filter(([field]) => {
            const name = String(field).replace(/\s+/gu, '');
            const allowed = policy.allowedSectionsByType?.[type];
            return REBUILD_SECTION_NAMES.has(name) || (allowed instanceof Set && allowed.has(name));
        }));
    if (Array.isArray(source)) {
        for (const section of source) {
            if (!section || typeof section !== 'object') continue;
            const sectionName = String(section.name ?? section.section ?? section.title ?? '').trim();
            const lines = jsonLines(section.lines ?? section.items ?? section.facts ?? section.content ?? section.value, defaultSources);
            if (sectionName && lines.length) sections.push({ name: sectionName, lines, empty: false });
        }
    }
    else if (typeof source === 'string') {
        const parsed = (0, parser_1.parseEntrySections)(source);
        for (const sectionName of parsed.order) {
            const lines = jsonLines(parsed.values[sectionName], defaultSources);
            if (lines.length) sections.push({ name: sectionName, lines, empty: false });
        }
    }
    else if (source && typeof source === 'object') {
        for (const [sectionName, sectionValue] of Object.entries(source)) {
            const lines = jsonLines(sectionValue, defaultSources);
            if (lines.length) sections.push({ name: sectionName, lines, empty: false });
        }
    }
    if (!sections.length && Array.isArray(entry.facts)) {
        const lines = jsonLines(entry.facts, defaultSources);
        if (lines.length) sections.push({ name: type === '事件' ? '已发生进展' : type === '场景' ? '当前状态' : '当前', lines, empty: false });
    }
    if (!sections.length) return null;
    return {
        rawTitle: `${type}｜${name}`,
        title: `${type}｜${name}`,
        type,
        name,
        sections,
        keywords: (0, util_1.normalizeStringArray)(entry.keywords ?? entry.keys),
    };
}

function jsonLines(value, defaultSources = []) {
    const values = Array.isArray(value) ? value : value == null ? [] : [value];
    const lines = [];
    for (const item of values) {
        let text = '';
        let ids = defaultSources;
        if (typeof item === 'string' || typeof item === 'number') text = String(item);
        else if (item && typeof item === 'object') {
            text = String(item.text ?? item.fact ?? item.line ?? item.value ?? item.content ?? '');
            ids = jsonSourceIds(item.sourceUids ?? item.evidence ?? item.sources ?? item.sourceUid);
            if (!ids.length) ids = defaultSources;
        }
        text = text.trim();
        if (!text) continue;
        if (!SOURCE_MARKER.test(text) && ids.length) text = `${text}〔证据:${ids.join(',')}〕`;
        SOURCE_MARKER.lastIndex = 0;
        lines.push(text);
    }
    return lines;
}

function jsonSourceIds(value) {
    const values = Array.isArray(value) ? value : value == null ? [] : String(value).split(/[,，、\s]+/u);
    return (0, util_1.unique)(values.map((item) => String(item).trim()).filter(Boolean));
}



function preserveEventPendingFacts(blocks, records, diagnostics = { warnings: [] }) {
    // 兼容旧函数名：ui.24 不再把“未决/目标”回填进世界书，只规范已经发生的变化。
    let filtered = 0;
    const output = (blocks ?? []).map((block) => {
        if (block?.type !== '事件') return (0, util_1.clone)(block);
        const before = (block.sections ?? []).reduce((sum, section) => sum + (section.lines ?? []).length, 0);
        const normalized = normalizeEventCompletionBlock(block);
        const after = (normalized.sections ?? []).reduce((sum, section) => sum + (section.lines ?? []).length, 0);
        filtered += Math.max(0, before - after);
        return normalized;
    });
    if (filtered) {
        diagnostics.warnings ?? (diagnostics.warnings = []);
        diagnostics.warnings.push(`事件重建已过滤${filtered}条目标、未决、阶段标签或无状态变化的过程材料`);
    }
    return output;
}

function mergeRebuildBlocks(blocks, diagnostics = { warnings: [] }) {
    const output = [];
    diagnostics.convergedEntries ?? (diagnostics.convergedEntries = 0);
    diagnostics.absorbedEntries ?? (diagnostics.absorbedEntries = 0);
    for (const rawIncoming of blocks) {
        const incoming = normalizeEventCompletionBlock(rawIncoming);
        if (!(incoming.sections ?? []).length) continue;
        const candidate = output.find((current) => sameConvergentBlock(current, incoming));
        if (!candidate) {
            const clone = (0, util_1.clone)(incoming);
            clone.sections = (clone.sections ?? []).map((section) => ({
                ...section,
                lines: removeUnresolvedSlotConflicts(section.name, section.lines, diagnostics, clone.title),
            })).filter((section) => section.lines.length);
            if (clone.sections.length) output.push(clone);
            continue;
        }
        if (preferIncomingRebuildIdentity(candidate, incoming)) {
            candidate.name = incoming.name;
            candidate.title = incoming.title;
        }
        candidate.sourceUids = (0, util_1.unique)([...(candidate.sourceUids ?? []), ...(incoming.sourceUids ?? [])]);
        candidate.sourceRefs = (0, util_1.unique)([...(candidate.sourceRefs ?? []), ...(incoming.sourceRefs ?? [])]);
        candidate.lineEvidence = [...(candidate.lineEvidence ?? []), ...(incoming.lineEvidence ?? [])];
        mergeRebuildTemporalMetadata(candidate, incoming);
        candidate.keywords = (0, util_1.unique)([...(candidate.keywords ?? []), ...(incoming.keywords ?? []), incoming.name]);
        const byName = new Map(candidate.sections.map((section) => [section.name, section]));
        if (candidate.type === '事件' && (0, util_1.normalizeFact)(candidate.name) !== (0, util_1.normalizeFact)(incoming.name)) {
            let aliases = byName.get('别名');
            if (!aliases) {
                aliases = { name: '别名', lines: [], empty: false };
                candidate.sections.push(aliases);
                byName.set('别名', aliases);
            }
            aliases.lines = (0, util_1.unique)([...aliases.lines, incoming.name]);
            aliases.empty = false;
        }
        for (const section of incoming.sections ?? []) {
            const current = byName.get(section.name);
            if (!current) {
                const safe = removeUnresolvedSlotConflicts(section.name, section.lines, diagnostics, candidate.title);
                if (safe.length) {
                    candidate.sections.push({ ...(0, util_1.clone)(section), lines: safe });
                    byName.set(section.name, candidate.sections.at(-1));
                }
            }
            else {
                current.lines = removeUnresolvedSlotConflicts(section.name, [...current.lines, ...section.lines], diagnostics, candidate.title);
            }
        }
        const normalized = normalizeEventCompletionBlock(candidate);
        candidate.sections = normalized.sections;
        diagnostics.convergedEntries += 1;
    }
    return finalizeRebuildBlocks(applyAbsorptionProposals(output, diagnostics), diagnostics);
}

function mergeRebuildTemporalMetadata(target, incoming) {
    target.sceneAnchors = (0, util_1.unique)([...(target.sceneAnchors ?? []), ...(incoming.sceneAnchors ?? [])]);
    target.primarySceneAnchor ||= incoming.primarySceneAnchor || target.sceneAnchors[0] || '';
    if ((!target.gameTime || target.gameTime === '未知') && incoming.gameTime) target.gameTime = incoming.gameTime;
    if ((!target.anchorLocation || target.anchorLocation === '未知') && incoming.anchorLocation) target.anchorLocation = incoming.anchorLocation;
    if (target.timeSource === '未知' && incoming.timeSource) target.timeSource = incoming.timeSource;
    const states = new Set([target.temporalState, incoming.temporalState].filter(Boolean));
    if (states.has('长期')) target.temporalState = '长期';
    else if (states.has('持续')) target.temporalState = '持续';
    else if (states.has('当前')) target.temporalState = '当前';
    else if (states.has('已完成')) target.temporalState = '已完成';
    else if (states.has('已结束')) target.temporalState = '已结束';
}

function sameConvergentBlock(leftBlock, rightBlock) {
    const left = blockAsEntry(leftBlock);
    const right = blockAsEntry(rightBlock);
    if (left.type === '人物' && right.type === '人物') {
        const leftAnchor = rebuildIdentityAnchor(leftBlock);
        const rightAnchor = rebuildIdentityAnchor(rightBlock);
        if (leftAnchor && rightAnchor && (0, util_1.normalizeFact)(leftAnchor) !== (0, util_1.normalizeFact)(rightAnchor)) return false;
    }
    if ((0, matcher_1.sameEntryIdentity)(left, right)) return true;
    if (left.type !== right.type) return false;
    if (left.type === '事件') {
        return (0, matcher_1.sameEventLifecycle)(left, right) || sameEventNarrative(leftBlock, rightBlock);
    }
    const sourceOverlap = (leftBlock.sourceUids ?? []).some((uid) => (rightBlock.sourceUids ?? []).includes(uid));
    if (left.type === '世界' && sourceOverlap && (isGenericWorldName(leftBlock.name) || isGenericWorldName(rightBlock.name))) return true;
    const leftBase = convergenceBaseName(leftBlock.name);
    const rightBase = convergenceBaseName(rightBlock.name);
    if (sourceOverlap && leftBase && leftBase === rightBase) return true;
    const nameRelated = convergenceNameRelated(leftBlock, rightBlock);
    const factOverlap = convergenceFactOverlap(leftBlock, rightBlock);
    return (sourceOverlap && (nameRelated || factOverlap)) || (nameRelated && factOverlap);
}


function isGenericWorldName(value) {
    return /^(?:世界|全局|世界状态|全局状态|当前局势|世界局势|总体局势|世界概况|全局概况|世界信息)$/u.test((0, util_1.normalizeFact)(value));
}

function convergenceBaseName(value) {
    return (0, util_1.normalizeFact)(value)
        .replace(/(?:子条目|附属条目|详情|状态|变化|记录|资料|信息|档案|条目|概况|摘要|补充|其一|其二|一|二|三)$/u, '')
        .replace(/[一二三四五六七八九十0-9]+$/u, '');
}

function preferIncomingRebuildIdentity(current, incoming) {
    if (current.type !== incoming.type) return false;
    if (current.type === '世界') return isGenericWorldName(current.name) && !isGenericWorldName(incoming.name);
    if (current.type === '事件') return isGenericEventName(current.name) && !isGenericEventName(incoming.name);
    const currentBase = convergenceBaseName(current.name);
    const incomingBase = convergenceBaseName(incoming.name);
    return currentBase === incomingBase && String(incoming.name ?? '').length < String(current.name ?? '').length;
}

function sameEventNarrative(left, right) {
    const leftValues = Object.fromEntries((left.sections ?? []).map((section) => [section.name, section.lines ?? []]));
    const rightValues = Object.fromEntries((right.sections ?? []).map((section) => [section.name, section.lines ?? []]));
    const participants = listFactOverlap(leftValues['参与'], rightValues['参与']);
    const scenes = listFactOverlap(leftValues['场景'], rightValues['场景']);
    const narrativeLeft = [...(leftValues['已发生进展'] ?? []), ...(leftValues['关键进展'] ?? []), ...(leftValues['结果'] ?? [])];
    const narrativeRight = [...(rightValues['已发生进展'] ?? []), ...(rightValues['关键进展'] ?? []), ...(rightValues['结果'] ?? [])];
    const narrative = listFactOverlap(narrativeLeft, narrativeRight);
    const names = convergenceNameRelated(left, right);
    const sourceOverlap = (left.sourceUids ?? []).some((uid) => (right.sourceUids ?? []).includes(uid));
    if (sourceOverlap && (participants || scenes || narrative || names)) return true;
    if (participants && scenes && (narrative || names)) return true;
    if (narrative && names && (participants || scenes)) return true;
    return false;
}

function convergenceNameRelated(left, right) {
    const leftNames = (0, util_1.unique)([left.name, ...(left.keywords ?? []), ...sectionLines(left, '别名')].map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    const rightNames = (0, util_1.unique)([right.name, ...(right.keywords ?? []), ...sectionLines(right, '别名')].map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    return leftNames.some((a) => rightNames.some((b) => a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)))));
}

function convergenceFactOverlap(left, right) {
    return listFactOverlap(allBlockFactLines(left), allBlockFactLines(right));
}

function listFactOverlap(leftLines = [], rightLines = []) {
    const left = (leftLines ?? []).map((line) => (0, util_1.normalizeFact)(stripGenericFactLabel(line))).filter((line) => line.length >= 4);
    const right = (rightLines ?? []).map((line) => (0, util_1.normalizeFact)(stripGenericFactLabel(line))).filter((line) => line.length >= 4);
    return left.some((a) => right.some((b) => a === b || (Math.min(a.length, b.length) >= 5 && (a.includes(b) || b.includes(a))) || bigramSimilarity(a, b) >= 0.62));
}

function bigramSimilarity(left, right) {
    const grams = (value) => {
        const text = String(value ?? '');
        const out = new Set();
        for (let i = 0; i < text.length - 1; i += 1) out.add(text.slice(i, i + 2));
        return out;
    };
    const a = grams(left);
    const b = grams(right);
    if (!a.size || !b.size) return 0;
    let shared = 0;
    for (const gram of a) if (b.has(gram)) shared += 1;
    return (2 * shared) / (a.size + b.size);
}

function sectionLines(block, name) {
    return (block.sections ?? []).find((section) => section.name === name)?.lines ?? [];
}

function allBlockFactLines(block) {
    return (block.sections ?? []).filter((section) => section.name !== '别名' && section.name !== REBUILD_SPACETIME_SECTION).flatMap((section) => section.lines ?? []);
}

function stripGenericFactLabel(value) {
    return String(value ?? '').replace(/^\s*[^：:]{1,24}\s*[：:]\s*/u, '').trim();
}


function finalizeRebuildBlocks(blocks, diagnostics = { warnings: [] }) {
    const output = disambiguateRebuildIdentities((blocks ?? []).map((block) => applyRebuildTemporalSettlement((0, util_1.clone)(block), diagnostics)), diagnostics);
    diagnostics.removedDuplicateFacts ?? (diagnostics.removedDuplicateFacts = 0);
    for (const block of output) {
        const seen = [];
        const orderedSections = [...(block.sections ?? [])].sort((left, right) => rebuildSectionPriority(block.type, right.name) - rebuildSectionPriority(block.type, left.name));
        for (const section of orderedSections) {
            const next = [];
            for (const line of dedupeMigrationLines(section.lines ?? [])) {
                const fact = normalizeRebuildFact(line);
                if (!fact || isTautologicalRebuildLine(block, line)) continue;
                const duplicate = seen.find((item) => equivalentRebuildFacts(item.fact, fact));
                if (duplicate) {
                    transferBlockLineEvidence(block, section.name, line, block, duplicate.section, duplicate.line);
                    diagnostics.removedDuplicateFacts += 1;
                    continue;
                }
                seen.push({ fact, section: section.name, line });
                next.push(line);
            }
            section.lines = next;
        }
        block.sections = (block.sections ?? []).filter((section) => section.lines?.length);
    }
    const references = [];
    for (const block of output) {
        for (const section of block.sections ?? []) {
            for (const line of section.lines ?? []) references.push({ block, section, line, fact: normalizeRebuildFact(line), removed: false });
        }
    }
    for (let index = 0; index < references.length; index += 1) {
        const left = references[index];
        if (left.removed || !left.fact) continue;
        for (let otherIndex = index + 1; otherIndex < references.length; otherIndex += 1) {
            const right = references[otherIndex];
            if (right.removed || !right.fact || left.block === right.block) continue;
            const sourceOverlap = (left.block.sourceUids ?? []).some((uid) => (right.block.sourceUids ?? []).includes(uid));
            if (!sourceOverlap || !equivalentRebuildFacts(left.fact, right.fact)) continue;
            const leftScore = rebuildFactHostScore(left.block, left.section, left.line);
            const rightScore = rebuildFactHostScore(right.block, right.section, right.line);
            const loser = rightScore > leftScore ? left : right;
            const winner = loser === left ? right : left;
            transferBlockLineEvidence(loser.block, loser.section.name, loser.line, winner.block, winner.section.name, winner.line);
            loser.removed = true;
            diagnostics.removedDuplicateFacts += 1;
        }
    }
    for (const ref of references.filter((item) => item.removed)) {
        ref.section.lines = (ref.section.lines ?? []).filter((line) => line !== ref.line);
    }
    for (const block of output) {
        block.sections = (block.sections ?? []).filter((section) => section.lines?.length);
        block.lineEvidence = normalizeBlockLineEvidence(block);
    }
    if (diagnostics.removedDuplicateFacts) diagnostics.warnings.push(`全局收束已移除${diagnostics.removedDuplicateFacts}条重复子项或跨条目重复事实`);
    return output.filter((block) => block.sections?.length);
}

function transferBlockLineEvidence(fromBlock, fromSection, fromLine, toBlock, toSection, toLine) {
    const source = (fromBlock.lineEvidence ?? []).filter((item) => item.section === fromSection && item.line === fromLine);
    if (!source.length) return;
    const target = (toBlock.lineEvidence ?? []).find((item) => item.section === toSection && item.line === toLine);
    const refs = (0, util_1.unique)(source.flatMap((item) => item.refs ?? []));
    if (target) {
        target.refs = (0, util_1.unique)([...(target.refs ?? []), ...refs]);
        target.explicit = target.explicit === true || source.some((item) => item.explicit === true);
    }
    else {
        toBlock.lineEvidence ?? (toBlock.lineEvidence = []);
        toBlock.lineEvidence.push({ section: toSection, line: toLine, refs, explicit: source.some((item) => item.explicit === true) });
    }
    toBlock.sourceRefs = (0, util_1.unique)([...(toBlock.sourceRefs ?? []), ...refs]);
}

function normalizeBlockLineEvidence(block) {
    const facts = new Map();
    for (const section of block.sections ?? []) {
        for (const line of section.lines ?? []) facts.set(`${section.name}\u0000${line}`, { section: section.name, line });
    }
    const output = new Map();
    for (const evidence of block.lineEvidence ?? []) {
        let key = `${evidence.section}\u0000${evidence.line}`;
        if (!facts.has(key)) {
            const fact = normalizeRebuildFact(evidence.line);
            const match = [...facts.values()].find((item) => equivalentRebuildFacts(normalizeRebuildFact(item.line), fact));
            if (!match) continue;
            key = `${match.section}\u0000${match.line}`;
        }
        const current = output.get(key) ?? { ...facts.get(key), refs: [], explicit: false };
        current.refs = (0, util_1.unique)([...(current.refs ?? []), ...(evidence.refs ?? [])]);
        current.explicit = current.explicit === true || evidence.explicit === true;
        output.set(key, current);
    }
    return [...output.values()];
}

function disambiguateRebuildIdentities(blocks, diagnostics) {
    const groups = new Map();
    for (const block of blocks ?? []) {
        const key = `${block.type}|${(0, util_1.normalizeFact)(block.name)}`;
        const list = groups.get(key) ?? [];
        list.push(block);
        groups.set(key, list);
    }
    for (const list of groups.values()) {
        if (list.length < 2) continue;
        for (const block of list) {
            const anchor = rebuildIdentityAnchor(block);
            if (!anchor) continue;
            const base = String(block.name ?? '').replace(/[（(](?:真身|假身|分身|本体|替身|伪身|复制体|化身|投影|残留配置|匿名载体)[）)]$/u, '');
            block.name = `${base}（${anchor}）`;
            block.title = `${block.type}｜${block.name}`;
            let aliases = block.sections.find((section) => section.name === '别名');
            if (!aliases) {
                aliases = { name: '别名', lines: [], empty: false };
                block.sections.push(aliases);
            }
            aliases.lines = (0, util_1.unique)([...(aliases.lines ?? []), base]);
        }
        diagnostics.warnings.push(`检测到同名但身份形态不同的对象，已使用真身、假身、分身或稳定身份锚点区分标题`);
    }
    return blocks;
}

function rebuildIdentityAnchor(block) {
    const text = (0, util_1.normalizeFact)(`${block.name}\n${allBlockFactLines(block).join('\n')}`);
    if (/(?:真身|本体|本尊|原身|主体)/u.test(text)) return '真身';
    if (/(?:假身|替身|伪身|傀儡身|复制体)/u.test(text)) return '假身';
    if (/(?:分身|化身|投影|镜像体)/u.test(text)) return '分身';
    if (/(?:残留配置|残留人格|遗留配置)/u.test(text)) return '残留配置';
    if (/(?:匿名载体|无名载体|未知载体)/u.test(text)) return '匿名载体';
    for (const line of sectionLines(block, '身份')) {
        const match = String(line ?? '').match(/^\s*(?:种族|职业|组织|阵营|编号|型号|类别)\s*[：:]\s*(.+)$/u);
        if (match?.[1]) return String(match[1]).trim().slice(0, 16);
    }
    return '';
}

function normalizeRebuildFact(line) {
    return (0, util_1.normalizeFact)(stripGenericFactLabel(line))
        .replace(/(?:已经|当前|目前|仍然|明确|确认|相关)/gu, '')
        .replace(/[，,。；;：:\s]/gu, '');
}

function equivalentRebuildFacts(left, right) {
    if (!left || !right) return false;
    if (left === right) return true;
    if (Math.min(left.length, right.length) >= 9 && (left.includes(right) || right.includes(left))) return true;
    return Math.min(left.length, right.length) >= 14 && bigramSimilarity(left, right) >= 0.86;
}

function rebuildSectionPriority(type, section) {
    const role = ({
        人物: { 当前: 100, 身份: 95, 关系: 90, 持有: 85, 固定事实: 75, 稳定: 70, 已知: 65, 误信: 60 },
        场景: { 当前状态: 100, 在场: 95, 当前资源: 90, 空间结构: 85, 固定资源: 80, 固定事实: 75, 定义: 70 },
        物品: { 当前: 100, 功能: 90, 限制: 85, 定义: 80, 固定事实: 75 },
        事件: { 结果: 100, 已发生进展: 95, 未发生进展: 60, 参与: 80, 场景: 75 },
        世界: { 公开局势: 100, 权力: 95, 制度: 90, 组织: 85, 资源与交通: 80, 持续影响: 75, 固定事实: 70, 地理: 65, 范围: 60 },
        基础设定: { 自然规则: 100, 种族与生命: 95, 能力与技术: 90, 社会规则: 85, 地理框架: 80, 世界常识: 75 },
    })[type] ?? {};
    return Number(role[section] ?? (section === '别名' ? 1 : 50));
}

function rebuildFactHostScore(block, section, line) {
    const text = (0, util_1.normalizeFact)(`${line}`);
    let score = rebuildSectionPriority(block.type, section.name);
    const name = (0, util_1.normalizeFact)(block.name);
    if (name && text.includes(name)) score += 20;
    if (block.type === '物品' && /(?:所有权|持有者|使用者|保管者|位置|完整性|功能|限制|损坏|封印)/u.test(text)) score += 80;
    if (block.type === '人物' && /(?:身份|伤势|情绪|关系|信任|敌对|目标|能力|职业|种族)/u.test(text)) score += 70;
    if (block.type === '场景' && /(?:在场|出口|入口|设施|资源|空间|布局|坍塌|封锁)/u.test(text)) score += 70;
    if (block.type === '事件' && /(?:经过|进展|导致|结果|结束|完成|冲突|战斗|调查|行动)/u.test(text)) score += 70;
    if (block.type === '世界' && /(?:组织|权力|制度|法律|局势|资源网络|交通|控制|地区)/u.test(text)) score += 75;
    if (block.type === '基础设定' && /(?:规则|规律|种族|生命|魔法|技术|社会|地理框架|普遍|所有)/u.test(text)) score += 80;
    return score;
}

function applyAbsorptionProposals(blocks, diagnostics) {
    const output = blocks.map((block) => (0, util_1.clone)(block));
    const removed = new Set();
    const ordered = [...output].sort((a, b) => Number(b.migrationOrder ?? 0) - Number(a.migrationOrder ?? 0));
    for (const child of ordered) {
        if (removed.has(child)) continue;
        const explicit = /(?:并入|归并|附属|不独立)/u.test(String(child.retentionMode ?? '')) && child.mergeIntoTitle;
        const inferred = !explicit ? inferDependentTarget(child, output, removed) : null;
        const target = explicit ? findConvergenceTarget(child.mergeIntoTitle, child, output, removed) : inferred;
        if (!target || target === child) {
            if (explicit) diagnostics.warnings.push(`${child.title}要求并入“${child.mergeIntoTitle}”，但没有找到有效目标，已暂时保留独立条目`);
            continue;
        }
        const sectionName = resolveAbsorptionSection(target, child.mergeIntoSection);
        const summary = summarizeAbsorbedBlock(child, target, sectionName);
        if (!summary) continue;
        let section = target.sections.find((item) => item.name === sectionName);
        if (!section) {
            section = { name: sectionName, lines: [], empty: false };
            target.sections.push(section);
        }
        section.lines = (0, util_1.unique)([...(section.lines ?? []), summary]);
        target.sourceUids = (0, util_1.unique)([...(target.sourceUids ?? []), ...(child.sourceUids ?? [])]);
        target.sourceRefs = (0, util_1.unique)([...(target.sourceRefs ?? []), ...(child.sourceRefs ?? [])]);
        target.lineEvidence ?? (target.lineEvidence = []);
        target.lineEvidence.push({
            section: sectionName,
            line: summary,
            refs: (0, util_1.unique)(child.sourceRefs ?? []),
            explicit: (child.lineEvidence ?? []).some((item) => item.explicit === true),
        });
        mergeRebuildTemporalMetadata(target, child);
        target.keywords = (0, util_1.unique)([...(target.keywords ?? []), child.name, ...(child.keywords ?? []), ...sectionLines(child, '别名')]).filter(Boolean);
        removed.add(child);
        diagnostics.absorbedEntries += 1;
        diagnostics.warnings.push(`${child.title}已作为从属信息收束进${target.title}【${sectionName}】，不再保留独立条目`);
    }
    return output.filter((block) => !removed.has(block));
}

function findConvergenceTarget(rawTitle, child, blocks, removed) {
    const normalized = (0, util_1.normalizeTitle)(rawTitle);
    const direct = blocks.find((block) => block !== child && !removed.has(block) && (0, util_1.normalizeTitle)(block.title) === normalized);
    if (direct) return direct;
    const split = (0, util_1.splitTitle)(normalized);
    return blocks.find((block) => block !== child && !removed.has(block)
        && (!split?.type || block.type === split.type)
        && convergenceNameRelated(block, { name: split?.name || rawTitle, keywords: [], sections: [] }));
}

function inferDependentTarget(child, blocks, removed) {
    if (child.type !== '物品') return null;
    const state = migrationItemState(child);
    const locationValue = state.get('当前位置') || '';
    const inferredHolder = inferMigrationHolderFromLocation(locationValue);
    const holder = state.get('当前持有者') || inferredHolder;
    const owner = state.get('所有权') || '';
    const keeper = state.get('保管者') || '';
    const location = locationValue;
    const permission = state.get('使用权限') || '';
    const fullText = (0, util_1.normalizeFact)(`${child.name}；${allBlockFactLines(child).join('；')}；${permission}`);
    const publicItem = /(?:公用|公共|共享|共用|任何人|所有人|全体|组织成员|授权人员|合格学员|固定设施|场地设施)/u.test(fullText)
        || (owner && holder && !migrationIdentityValueMatches(owner, holder))
        || (keeper && holder && !migrationIdentityValueMatches(keeper, holder));
    const independent = isIndependentMigrationItem(child);
    const simplePublicFacility = publicItem && sectionLines(child, '固定事实').length === 0 && sectionLines(child, '限制').length === 0 && sectionLines(child, '功能').length <= 1;
    if (independent && !simplePublicFacility) return null;
    const active = blocks.filter((candidate) => candidate !== child && !removed.has(candidate));
    const personByName = (value) => active.find((candidate) => candidate.type === '人物' && migrationBlockNameMatches(candidate, value));
    const sceneByName = (value) => active.find((candidate) => candidate.type === '场景' && migrationBlockNameMatches(candidate, value));
    const worldByName = (value) => active.find((candidate) => (candidate.type === '世界' || candidate.migrationPhase === 'custom') && migrationBlockNameMatches(candidate, value));
    if (!publicItem) {
        const person = personByName(holder) || personByName(owner) || personByName(keeper);
        if (person) return person;
    }
    const scene = sceneByName(location);
    if (scene) return scene;
    const world = worldByName(owner) || worldByName(keeper) || worldByName(location);
    if (world) return world;
    if (publicItem) {
        const anyScene = active.find((candidate) => candidate.type === '场景' && (child.sourceUids ?? []).some((uid) => (candidate.sourceUids ?? []).includes(uid)));
        if (anyScene) return anyScene;
    }
    // 最后才采用旧的强证据规则：后续规则或地区条目覆盖全部来源并点名该物品。
    const facts = allBlockFactLines(child);
    const sourceUids = child.sourceUids ?? [];
    if (!facts.length || facts.length > 4 || !sourceUids.length) return null;
    const name = (0, util_1.normalizeFact)(child.name);
    return active.find((candidate) => {
        if (!['世界', '基础设定', '场景'].includes(candidate.type) && candidate.migrationPhase !== 'custom') return false;
        if (Number(candidate.migrationOrder ?? -1) <= Number(child.migrationOrder ?? -1)) return false;
        if (!sourceUids.every((uid) => (candidate.sourceUids ?? []).includes(uid))) return false;
        const text = (0, util_1.normalizeFact)(`${candidate.title}\n${allBlockFactLines(candidate).join('\n')}`);
        return Boolean(name && text.includes(name));
    }) || null;
}

function isIndependentMigrationItem(block) {
    const name = String(block?.name ?? '');
    if (/(?:唯一|编号|序列号|型号|专属|核心|封印|神器|遗物|王冠|徽章|日记|信件|契约|钥匙卡|[A-Za-z]*\d+[A-Za-z0-9-]*)/u.test(name)) return true;
    const important = new Set(['功能', '限制', '固定事实']);
    if ((block.sections ?? []).some((section) => important.has(section.name) && (section.lines?.length ?? 0) > 0)) return true;
    const definition = sectionLines(block, '定义');
    if (definition.some((line) => /(?:唯一|编号|序列号|型号|独特|专属|不可替代|跨场景|持续追踪|长期使用|长期携带|重要物品)/u.test(String(line)))) return true;
    const state = migrationItemState(block);
    return [...state.keys()].some((label) => /^(?:完整性|可用性|能力状态|损坏状态|封印状态)$/u.test(label));
}

function migrationItemState(block) {
    const map = new Map();
    for (const line of sectionLines(block, '当前')) {
        const match = String(line ?? '').match(/^\s*([^：:]{1,24})\s*[：:]\s*(.*)$/u);
        if (!match) continue;
        const raw = (0, util_1.normalizeFact)(match[1]);
        const label = [
            [/^(?:所有权|所有者|产权方|归属方)$/u, '所有权'],
            [/^(?:保管者|保管方|管理者)$/u, '保管者'],
            [/^(?:当前持有者|持有者|携带者)$/u, '当前持有者'],
            [/^(?:当前使用者|使用者|操作者)$/u, '当前使用者'],
            [/^(?:使用权限|可使用者|授权对象)$/u, '使用权限'],
            [/^(?:当前位置|位置|所在地)$/u, '当前位置'],
            [/^(?:完整性|损坏状态)$/u, '完整性'],
            [/^(?:可用性)$/u, '可用性'],
            [/^(?:当前状态|状态)$/u, '当前状态'],
            [/^(?:能力状态)$/u, '能力状态'],
            [/^(?:封印状态)$/u, '封印状态'],
        ].find(([pattern]) => pattern.test(raw))?.[1];
        if (label) map.set(label, String(match[2] ?? '').trim());
    }
    return map;
}

function inferMigrationHolderFromLocation(value) {
    const text = String(value ?? '').trim();
    const match = text.match(/(?:被)?([\p{Script=Han}A-Za-z0-9·]{2,16})(?:收回|随身携带|持有|收入(?:背包|卡槽|卡槎|腰侧)|带走)/u);
    return match?.[1] ?? '';
}

function migrationBlockNameMatches(block, value) {
    const target = (0, util_1.normalizeFact)(String(value ?? '').replace(/(?:随身|手中|身上|腰间|背包中|武器架上|仓库中)$/u, ''));
    if (!target) return false;
    return [block.name, ...(block.keywords ?? []), ...sectionLines(block, '别名')]
        .map((item) => (0, util_1.normalizeFact)(item))
        .some((name) => name && (name === target || (Math.min(name.length, target.length) >= 3 && (name.includes(target) || target.includes(name)))));
}

function migrationIdentityValueMatches(left, right) {
    const a = (0, util_1.normalizeFact)(left);
    const b = (0, util_1.normalizeFact)(right);
    return Boolean(a && b && (a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)))));
}

function resolveAbsorptionSection(target, requested) {
    const raw = String(requested ?? '').trim();
    const allowed = TYPE_ALLOWED_SECTIONS[target.type];
    if (raw && (!(allowed instanceof Set) || allowed.has(raw))) return raw;
    if (target.type === '人物') return '持有';
    if (target.type === '基础设定') return '社会规则';
    if (target.type === '世界') return '资源与交通';
    if (target.type === '场景') return '当前资源';
    if (target.type === '事件') return '结果';
    return (target.sections ?? []).find((section) => section.name !== '别名')?.name || '固定事实';
}

function summarizeAbsorbedBlock(block, target, sectionName) {
    if (block.type === '物品' && target?.type === '人物' && sectionName === '持有') return block.name;
    if (block.type === '物品' && target?.type === '场景' && /^(?:当前资源|固定资源)$/u.test(sectionName)) return block.name;
    const lines = dedupeMigrationLines(allBlockFactLines(block).map(stripGenericFactLabel).filter(Boolean));
    if (!lines.length) return block.name || '';
    const summary = lines.slice(0, 3).join('；');
    return `${block.name}：${summary.slice(0, 260)}`;
}

function blockAsEntry(block) {
    const aliases = (block.sections ?? []).filter((section) => section.name === '别名').flatMap((section) => section.lines ?? []);
    return {
        // 重建候选尚未分配世界书UID；不得把标题伪装成UID，否则同名真身/替身会绕过身份冲突检查。
        uid: block.uid ?? '',
        title: block.title,
        type: block.type,
        name: block.name,
        aliases,
        keywords: block.keywords ?? [],
        sections: { values: {
            ...Object.fromEntries((block.sections ?? []).map((section) => [section.name, section.lines ?? []])),
            ...(block.type === '事件' ? (block.eventIdentitySections ?? {}) : {}),
        } },
    };
}

function normalizeRebuildKeyword(value) {
    return (0, parser_1.sanitizeWorldbookLine)(value)
        .replace(/^\s*(?:别名|名称|关键词)\s*[：:]\s*/u, '')
        .trim();
}

function isMeaningfulRebuildKeyword(value) {
    const text = normalizeRebuildKeyword(value);
    if (!text || (0, util_1.isUidKeyword)(text) || /^(?:无|暂无|<<<\s*END_ENTRY\s*>>>|重建待确认·?\d*)$/iu.test(text)) return false;
    return true;
}

function isUi20AutomaticArchive(record) {
    const raw = record?.raw ?? {};
    const extension = raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY] ?? {};
    if (raw.disable !== true || extension.archive !== true || Number(extension.rebuildVersion || 0) !== 4) return false;
    const markers = [record?.title ?? '', ...(0, util_1.normalizeStringArray)(raw.key), record?.content ?? ''].join('\n');
    if (/重建待确认/u.test(markers) || /【来源条目】/u.test(markers)) return false;
    return true;
}

function buildRebuildSnapshot(originalData, records, blocks, diagnostics = { invalidLines: [], warnings: [] }, schema = buildMigrationSchema(), consumableSourceUids = null) {
    const data = (0, util_1.clone)(originalData);
    data.entries ?? (data.entries = {});
    const candidateKeys = new Set(records.map((record) => record.mapKey));
    const preserved = Object.fromEntries(Object.entries(data.entries).filter(([mapKey, raw]) => !candidateKeys.has(String(mapKey)) && !isControlPromptRaw(raw)));
    const preservedEntryCount = Object.keys(preserved).length;
    const removedControlEntries = Object.values(data.entries).filter((raw) => isControlPromptRaw(raw)).length;
    if (removedControlEntries) diagnostics.warnings.push(`已移除${removedControlEntries}个旧版底层提示词控制条目，不再送入模型或保存到世界书`);
    data.entries = preserved;
    const recordByUid = new Map(records.map((record) => [record.uid, record]));
    const usedRecordUids = new Set();
    const usedMapKeys = new Set(Object.keys(data.entries));
    // 新建条目从原世界书最大UID之后分配；旧条目主档仍可复用原mapKey与UID。
    const usedNumericUids = new Set(Object.values(originalData?.entries ?? {}).map((raw) => Number(raw?.uid)).filter(Number.isFinite));
    const rebuildBatchId = nextRebuildBatchId(originalData);
    let rebuildSequence = 0;
    const anchorTypeSequences = new Map();
    let rebuiltEntries = 0;
    let knowledgeLines = 0;
    let mergedOldEntries = 0;
    for (const rawBlock of blocks) {
        const block = enrichRebuildBlockAliases(rawBlock, recordByUid);
        const sourceUids = (block.sourceUids ?? []).filter((uid) => recordByUid.has(uid));
        const consumedSourceUids = sourceUids.filter((uid) => !(consumableSourceUids instanceof Set) || consumableSourceUids.has(String(uid)));
        const primaryUid = consumedSourceUids.find((uid) => !usedRecordUids.has(uid));
        const primary = primaryUid ? recordByUid.get(primaryUid) : null;
        let mapKey;
        let raw;
        if (primary && !usedMapKeys.has(primary.mapKey)) {
            mapKey = primary.mapKey;
            raw = (0, util_1.clone)(primary.raw);
            usedRecordUids.add(primary.uid);
        }
        else {
            const uid = nextNumericUid(usedNumericUids);
            mapKey = String(uid);
            raw = defaultRaw(uid);
        }
        usedMapKeys.add(mapKey);
        raw.uid = Number.isFinite(Number(raw.uid)) ? Number(raw.uid) : Number(mapKey);
        rebuildSequence += 1;
        const primarySceneAnchor = /^S\d{3,6}$/u.test(String(block.primarySceneAnchor ?? '')) ? String(block.primarySceneAnchor) : '';
        const typeCode = rebuildTypeCode(block.type);
        const sequenceKey = `${primarySceneAnchor || rebuildBatchId}|${typeCode}`;
        const anchorSequence = Number(anchorTypeSequences.get(sequenceKey) || 0) + 1;
        anchorTypeSequences.set(sequenceKey, anchorSequence);
        const derivedCode = primarySceneAnchor ? `${primarySceneAnchor}-${typeCode}${String(anchorSequence).padStart(2, '0')}` : `${rebuildBatchId}-${String(rebuildSequence).padStart(2, '0')}`;
        const numberedTitle = `${block.type}｜${derivedCode}｜${block.name}`;
        raw.comment = numberedTitle;
        const spacetimeSection = buildRebuildSpacetimeSection(block);
        const sourceSections = [
            ...(spacetimeSection ? [spacetimeSection] : []),
            ...(block.sections ?? []).filter((section) => section.name !== REBUILD_SPACETIME_SECTION),
        ];
        const safeSections = sourceSections.map((section) => ({
            ...section,
            lines: (0, util_1.unique)((section.lines ?? []).map((line) => (0, parser_1.sanitizeWorldbookLine)(line)).filter(Boolean)),
        })).filter((section) => section.lines.length);
        if (!safeSections.length) {
            diagnostics.warnings.push(`重建候选“${block.title}”只包含模型控制提示词或空内容，已阻止写入`);
            continue;
        }
        raw.content = (0, parser_1.serializeEntrySections)({ order: safeSections.map((section) => section.name), values: Object.fromEntries(safeSections.map((section) => [section.name, section.lines])) });
        const aliases = safeSections.filter((section) => section.name === '别名').flatMap((section) => section.lines);
        raw.key = (0, util_1.unique)([block.name, ...(block.keywords ?? []), ...aliases].map(normalizeRebuildKeyword).filter(isMeaningfulRebuildKeyword));
        raw.keysecondary ?? (raw.keysecondary = []);
        raw.disable = false;
        applyMigrationDefinition(raw, block.type, schema);
        const extensions = raw.extensions ?? (raw.extensions = {});
        const extension = extensions[constants_1.WORLD_INFO_EXTENSION_KEY] && typeof extensions[constants_1.WORLD_INFO_EXTENSION_KEY] === 'object'
            ? extensions[constants_1.WORLD_INFO_EXTENSION_KEY]
            : {};
        extensions[constants_1.WORLD_INFO_EXTENSION_KEY] = {
            ...extension,
            managed: true,
            version: constants_1.MANAGED_VERSION,
            title: numberedTitle,
            semanticTitle: block.title,
            rebuildBatchId,
            rebuildSequence,
            derivedCode,
            rebuilt: true,
            rebuildVersion: 9,
            epistemic: block.type === '人物',
            sourceUids,
            sourceRefs: (0, util_1.unique)(block.sourceRefs ?? []),
            sceneAnchors: (0, util_1.unique)(block.sceneAnchors ?? []),
            primarySceneAnchor: primarySceneAnchor || undefined,
            gameTime: normalizeRebuildGameTime(block.gameTime),
            timeSource: normalizeRebuildTimeSource(block.timeSource),
            temporalState: normalizeRebuildTemporalState(block.temporalState, block.type),
            anchorLocation: String(block.anchorLocation || '未知').trim() || '未知',
            updatedAt: Date.now(),
        };
        // 成功重建后的新主档必须解除旧归档标记，避免“disable=false 但 archive=true”的半归档状态。
        delete extensions[constants_1.WORLD_INFO_EXTENSION_KEY].archive;
        data.entries[mapKey] = raw;
        rebuiltEntries += 1;
        knowledgeLines += block.sections.filter((section) => KNOWLEDGE_SECTIONS.has(section.name)).reduce((sum, section) => sum + section.lines.length, 0);
        if (consumedSourceUids.length > 1) mergedOldEntries += consumedSourceUids.length - 1;
        consumedSourceUids.forEach((uidValue) => usedRecordUids.add(uidValue));
    }
    const uncovered = records.filter((record) => !usedRecordUids.has(record.uid));
    let retainedOriginalEntries = 0;
    let preservedArchivedEntries = 0;
    let recoveredUi20Archives = 0;
    for (const record of uncovered) {
        if (isControlPromptRaw(record.raw)) {
            diagnostics.warnings.push(`已移除旧版底层提示词控制条目“${record.title}”；认知边界仅保留在模型请求中`);
            continue;
        }
        const originalMapKey = String(record.mapKey);
        const canReuse = !usedMapKeys.has(originalMapKey);
        const mapKey = canReuse ? originalMapKey : String(nextNumericUid(usedNumericUids));
        const raw = (0, util_1.clone)(record.raw);
        if (isUi20AutomaticArchive(record)) {
            raw.disable = false;
            const extension = raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY];
            if (extension && typeof extension === 'object') {
                delete extension.archive;
                extension.rebuilt = true;
                extension.rebuildVersion = 9;
                extension.updatedAt = Date.now();
            }
            recoveredUi20Archives += 1;
            diagnostics.warnings.push(`已恢复 ui.20 误关闭条目“${record.title}”；提交后将重新规划召回配置`);
        }
        if (!canReuse) {
            raw.uid = Number(mapKey);
            diagnostics.warnings.push(`旧条目“${record.title}”的原键已被新主档占用，已仅调整UID后原样保留`);
        }
        usedMapKeys.add(mapKey);
        data.entries[mapKey] = raw;
        retainedOriginalEntries += 1;
        if (raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY]?.archive === true || raw.disable === true) preservedArchivedEntries += 1;
        diagnostics.warnings.push(`旧条目“${record.title}”未被AI可靠覆盖，已保持原正文、启用状态和召回配置不变`);
    }
    return {
        data,
        rebuiltEntries,
        mergedOldEntries,
        archivedEntries: 0,
        retainedOriginalEntries,
        preservedArchivedEntries,
        recoveredUi20Archives,
        knowledgeLines,
        preservedEntries: preservedEntryCount,
        rebuildBatchId,
    };
}


function nextRebuildBatchId(data) {
    let max = 0;
    for (const raw of Object.values(data?.entries ?? {})) {
        const title = (0, util_1.normalizeTitle)(String(raw?.comment ?? raw?.name ?? raw?.title ?? ''));
        const match = title.match(/｜R(\d{1,6})-\d{1,4}｜/iu);
        if (match) max = Math.max(max, Number(match[1]) || 0);
        const extensionId = String(raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY]?.rebuildBatchId ?? '');
        const extMatch = extensionId.match(/^R(\d{1,6})$/iu);
        if (extMatch) max = Math.max(max, Number(extMatch[1]) || 0);
    }
    return `R${String(max + 1).padStart(3, '0')}`;
}

function rebuildTypeCode(type) {
    if (REBUILD_TYPE_CODES.has(type)) return REBUILD_TYPE_CODES.get(type);
    const normalized = (0, util_1.safeId)(String(type ?? '')).replace(/[^A-Za-z0-9]/gu, '').toUpperCase();
    return normalized.slice(0, 1) || 'X';
}

function buildRebuildSpacetimeSection(block) {
    const sceneAnchors = (0, util_1.unique)(block?.sceneAnchors ?? []).filter((anchor) => /^S\d{3,6}$/u.test(String(anchor)));
    if (!sceneAnchors.length) return null;
    const lines = [
        `场景锚点：${sceneAnchors.join('、')}`,
        `游戏时间：${normalizeRebuildGameTime(block?.gameTime)}`,
        `地点：${String(block?.anchorLocation || '未知').trim() || '未知'}`,
        `时间来源：${normalizeRebuildTimeSource(block?.timeSource)}`,
        `时态：${normalizeRebuildTemporalState(block?.temporalState, block?.type)}`,
    ];
    return { name: REBUILD_SPACETIME_SECTION, lines, empty: false };
}

function applyMigrationDefinition(raw, type, schema) {
    const definition = migrationDefinition(schema, type);
    if (!definition) return raw;
    raw.constant = definition.constant === true;
    raw.vectorized = definition.vectorized !== false;
    raw.preventRecursion = definition.preventRecursion === true;
    raw.excludeRecursion = definition.preventRecursion === true;
    raw.depth = Math.max(0, Number(definition.depth ?? raw.depth ?? 4));
    raw.order = Math.max(0, Number(definition.order ?? raw.order ?? 400));
    return raw;
}

function enrichRebuildBlockAliases(block, recordByUid) {
    const output = (0, util_1.clone)(block);
    if (output.type !== '事件') return output;
    const names = (0, util_1.unique)((output.sourceUids ?? []).map((uid) => recordByUid.get(uid))
        .filter((record) => record && recordType(record) === '事件')
        .map((record) => (0, util_1.splitTitle)((0, util_1.normalizeTitle)(record.title))?.name)
        .filter((name) => name && (0, util_1.normalizeFact)(name) !== (0, util_1.normalizeFact)(output.name)));
    if (!names.length) return output;
    let aliases = output.sections.find((section) => section.name === '别名');
    if (!aliases) {
        aliases = { name: '别名', lines: [], empty: false };
        output.sections.push(aliases);
    }
    aliases.lines = (0, util_1.unique)([...(aliases.lines ?? []), ...names]);
    aliases.empty = false;
    return output;
}

function verifyCommittedSnapshot(data, summary) {
    const entries = Object.values(data?.entries ?? {}).filter((raw) => raw && typeof raw === 'object');
    if (entries.some((raw) => (0, util_1.normalizeTitle)(String(raw.comment ?? '')) === (0, util_1.normalizeTitle)(exports.INFORMATION_BOUNDARY_TITLE)))
        throw new Error('底层认知提示词不应保存为世界书条目');
    const rebuilt = entries.filter((raw) => raw.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY]?.rebuilt === true);
    if (rebuilt.length < Number(summary.rebuiltEntries || 0)) throw new Error('重建条目回读数量不足');
}

function defaultRaw(uid) {
    return { uid, key: [], keysecondary: [], comment: '', content: '', constant: false, vectorized: true, selective: false, selectiveLogic: 0, addMemo: false, order: 400, position: 0, disable: false, ignoreBudget: false, excludeRecursion: false, preventRecursion: true, probability: 100, useProbability: true, depth: 4, outletName: '', group: '', groupOverride: false, groupWeight: 100, scanDepth: null, caseSensitive: null, matchWholeWords: null, useGroupScoring: null, automationId: '', role: 0, sticky: null, cooldown: null, delay: null, delayUntilRecursion: 0, triggers: [] };
}

function nextNumericUid(used) {
    let uid = 0;
    while (used.has(uid)) uid += 1;
    used.add(uid);
    return uid;
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
exports.isTransientNetworkError = isTransientNetworkError;
exports.gatewayRetryDelayMs = gatewayRetryDelayMs;
exports.limitPromptPair = limitPromptPair;
exports.outputContractForStage = outputContractForStage;
exports.describeRetryReason = describeRetryReason;
exports.salvageStrictFinalProtocol = salvageStrictFinalProtocol;
exports.protocolRescuePrompt = protocolRescuePrompt;
const util_1 = require("./util");

// [MA-MODEL-01] 每个模型阶段只声明输入/输出预算；网关失败使用紧凑请求，瞬时断线最多再退避重放一次。
// 该模块不理解审核、提取或总结业务，也不接触世界书，避免请求控制与业务逻辑耦合。
const INPUT_LIMITS = Object.freeze({
    audit: 24000,
    revision: 30000,
    extraction: 26000,
    extractionRepair: 14000,
    summaryRepair: 18000,
    worldSettingImport: 42000,
    smallSummary: 28000,
    largeSummary: 30000,
    migration: 20000,
    migrationPlan: 28000,
    migrationReview: 24000,
});

/**
 * [MA-MODEL-02] 调用模型；网关失败使用精简提示词，明确的瞬时网络中断最多执行两次有限重试。
 * 模型空正文或仅返回推理时，使用更大的输出预算并保留 Profile 预设重试一次。
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
        responseTokens = 0,
    } = options;
    const configuredOverride = Number(responseTokens || 0);
    const responseLength = configuredOverride > 0
        ? Math.max(256, Math.min(16384, Math.floor(configuredOverride)))
        : stageResponseTokens(stage, settings, sourceText);
    const primary = limitPromptPair(withOutputContract(prompt, stage, responseLength, sourceText), stage);
    let firstError = null;
    let firstGatewayRetry = false;
    try {
        return await host.generate(primary.system, primary.user, responseLength, snapshot, settings, settings.requestTimeoutMs, profileId);
    }
    catch (error) {
        firstError = error;
        const emptyResponse = isEmptyModelResponseError(error);
        firstGatewayRetry = isRetryableGatewayError(error);
        if (snapshot?.token?.cancelled || (!firstGatewayRetry && !emptyResponse))
            throw error;
    }

    const fallbackValue = fallbackPrompt
        ? (typeof fallbackPrompt === 'function' ? fallbackPrompt() : fallbackPrompt)
        : prompt;
    const emptyResponse = isEmptyModelResponseError(firstError);
    const fallbackTokens = emptyResponse
        ? emptyResponseRetryTokens(stage, settings, responseLength)
        : Math.max(256, Math.min(responseLength, Math.floor(responseLength * 0.75)));
    const fallback = limitPromptPair(withOutputContract(fallbackValue, stage, fallbackTokens, sourceText), stage, true);
    try { onRetry?.(firstError); }
    catch (callbackError) { console.warn('[MirrorAbyss] model retry callback failed', callbackError); }
    if (firstGatewayRetry) await waitForGatewayRetry(firstError, 1, settings, snapshot);

    let secondError = null;
    try {
        return await host.generate(
            fallback.system,
            fallback.user,
            fallbackTokens,
            snapshot,
            settings,
            settings.requestTimeoutMs,
            profileId,
            undefined,
        );
    }
    catch (error) {
        secondError = error;
    }

    // [MA-MODEL-NETWORK-RETRY-01]
    // 移动端浏览器与反向代理常把瞬时断线抛成 TypeError: Failed to fetch。
    // 该错误过去没有命中“fetch failed”规则，导致本应重试的请求直接失败。
    // 只对明确的瞬时网络错误增加一次退避重试；协议错误、仅推理和取消不进入此分支。
    if (isTransientNetworkError(secondError) && !snapshot?.token?.cancelled) {
        try { onRetry?.(Object.assign(new Error('瞬时网络错误仍存在，退避后执行最后一次紧凑请求'), { code: 'MA_TRANSIENT_NETWORK_RETRY' })); }
        catch { }
        await waitForGatewayRetry(secondError, 2, settings, snapshot);
        try {
            return await host.generate(
                fallback.system,
                fallback.user,
                fallbackTokens,
                snapshot,
                settings,
                settings.requestTimeoutMs,
                profileId,
                undefined,
            );
        }
        catch (error) {
            if (!isTransientNetworkError(error)) throw error;
            const detail = (0, util_1.errorText)(error);
            const exhausted = new Error(`瞬时网络请求连续3次失败：${detail}`);
            exhausted.code = 'MA_NETWORK_RETRY_EXHAUSTED';
            exhausted.cause = error;
            exhausted.retryAttempts = 3;
            exhausted.diagnosticEvidence = {
                ...(error?.diagnosticEvidence || {}),
                retryAttempts: 3,
                transientNetwork: true,
            };
            secondError = exhausted;
        }
    }

    // [MA-MODEL-REASONING-RESCUE-01]
    // 部分推理模型会把整个响应预算都放进 reasoning 字段。先只从 reasoning 中提取
    // 已经完整出现的严格协议；绝不把自由推理文本当作正文或事实提交。
    const reasoning = String(secondError?.reasoningText || firstError?.reasoningText || '');
    const salvaged = salvageStrictFinalProtocol(stage, reasoning);
    if (salvaged) {
        try { onRetry?.(Object.assign(new Error('已从推理字段隔离出完整最终协议'), { code: 'MA_REASONING_PROTOCOL_SALVAGED' })); }
        catch { }
        return salvaged;
    }

    // 第三次只在独立 Connection Profile 上执行：去掉生成 preset，使用最短最终协议提示。
    // 这不会改写玩家主连接，也不会把供应商私有 reasoning 参数硬编码进请求。
    if (profileId && isEmptyModelResponseError(secondError) && !snapshot?.token?.cancelled) {
        const rescueTokens = reasoningRescueTokens(stage, settings, fallbackTokens);
        const rescue = protocolRescuePrompt(stage, fallbackValue, sourceText, rescueTokens);
        try { onRetry?.(Object.assign(new Error('模型连续只返回推理，切换无 preset 最终协议救援'), { code: 'MA_REASONING_RESCUE' })); }
        catch { }
        try {
            return await host.generate(
                rescue.system,
                rescue.user,
                rescueTokens,
                snapshot,
                settings,
                settings.requestTimeoutMs,
                profileId,
                { includePreset: false },
            );
        }
        catch (rescueError) {
            const finalSalvage = salvageStrictFinalProtocol(stage, String(rescueError?.reasoningText || ''));
            if (finalSalvage) return finalSalvage;
            throw rescueError;
        }
    }
    throw secondError;
}

function isEmptyModelResponseError(error) {
    return error?.code === 'MA_EMPTY_MODEL_RESPONSE' || error?.code === 'MA_REASONING_ONLY';
}
function emptyResponseRetryTokens(stage, settings, firstTokens) {
    const minimums = {
        audit: 3072,
        revision: 6144,
        extraction: 8192,
        extractionRepair: 6144,
        summaryRepair: 6144,
        worldSettingImport: 12288,
        smallSummary: 6144,
        largeSummary: 8192,
        migration: 6144,
        migrationPlan: 12288,
        migrationReview: 3072,
    };
    const configured = Math.max(1024, Number(settings?.responseTokens) || 8192);
    return Math.min(configured, Math.max(Number(firstTokens) * 2, minimums[stage] || 4096));
}

/** [MA-MODEL-03] 阶段预算同时覆盖最终文本与后端可能消耗的推理 token。 */
function stageResponseTokens(stage, settings, sourceText = '') {
    const configured = Math.max(1024, Number(settings?.responseTokens) || 8192);
    if (stage === 'audit') return Math.min(configured, 1536);
    if (stage === 'revision') {
        const estimated = Math.max(3072, Math.ceil(String(sourceText ?? '').length * 1.8) + 1536);
        return Math.min(configured, estimated);
    }
    if (stage === 'extraction') return Math.min(configured, 6144);
    if (stage === 'extractionRepair') return Math.min(configured, 4096);
    if (stage === 'summaryRepair') return Math.min(configured, 4096);
    if (stage === 'worldSettingImport') return Math.min(configured, 8192);
    if (stage === 'smallSummary') return Math.min(configured, 4096);
    if (stage === 'largeSummary') return Math.min(configured, 6144);
    if (stage === 'migration') return Math.min(configured, 1792);
    if (stage === 'migrationPlan') return Math.min(configured, 4096);
    if (stage === 'migrationReview') return Math.min(configured, 1024);
    return configured;
}

/**
 * [MA-MODEL-OUTPUT-01] 提示词中的“字数限制”与请求层 max tokens 分开。
 * 这里统一要求最终答案优先、禁止显式思考，并告诉模型总响应预算会包含推理 token。
 */
function outputContractForStage(stage, responseTokens, sourceText = '') {
    const budget = Math.max(1, Number(responseTokens) || 1);
    const common = [
        '【最终输出纪律】',
        '- 不得输出分析、推理过程、思考草稿、<think> 标签、reasoning、解释、前言或后记；直接输出本阶段规定的最终协议。',
        `- 本次最大响应预算为 ${budget} tokens；该预算可能同时包含后端内部推理与最终文本。即使内部推理无法关闭，也必须为最终答案保留足够额度。`,
        '- 最终协议完成后立即停止，不得为了用满上限重复或扩写。',
    ];
    const sourceLength = String(sourceText ?? '').length;
    const stageRules = {
        audit: ['- 最终结论必须首先出现。通过只输出“审核结论：通过”；不通过先输出“审核结论：需要修正”，再列最多8条短原因；总长度不超过300个中文字符。'],
        revision: [`- 只输出可直接替换的完整正文。必须从原文开头写到原文结尾，不得中途停止、缺段或用省略号代替剩余内容。除删除明确违规内容外，修正版应保留原文至少85%的有效正文；总长度原则上不超过原输入的110%（当前参考长度约${sourceLength || 0}字符）。`],
        extraction: ['- 只输出规定的自然中文条目格式或“无”。最多8条，最终文本总长度不超过5000个中文字符。'],
        extractionRepair: ['- 只输出修复后的自然中文条目格式或“无”。不得补充事实；最终文本总长度不超过5000个中文字符。'],
        summaryRepair: ['- 只输出修复后的固定总结协议。不得新增、删除、改写或重新判断任何事实、来源、目标、栏目和处理结论；最终文本总长度不超过3200个中文字符。'],
        worldSettingImport: ['- 只输出规定的 ENTRY 协议或“无”。最多16条，最终协议总长度不超过8000个中文字符。'],
        smallSummary: ['- 只输出规定的小总结协议。当前存在待处理来源时禁止输出“无”；总长度不超过1800个中文字符。'],
        largeSummary: ['- 只输出规定的大总结协议。当前存在待处理来源时禁止输出“无”；总长度不超过2600个中文字符。'],
        migrationReview: ['- 最终结论必须首先出现。通过只输出 PASS；不通过只输出 FAIL 协议行；总长度不超过800个中文字符。'],
        migrationPlan: ['- 只输出 ANCHOR、GROUP、DROP 协议行；覆盖全部来源后立即停止，不输出说明。'],
        migration: ['- 只输出规定的重建条目协议；完成本批全部对象后立即停止，不输出说明。'],
    };
    return [...common, ...(stageRules[stage] || [])].join('\n');
}

function withOutputContract(prompt, stage, responseTokens, sourceText = '') {
    const contract = outputContractForStage(stage, responseTokens, sourceText);
    return {
        system: `${String(prompt?.system ?? '').trim()}\n\n${contract}`.trim(),
        user: String(prompt?.user ?? ''),
    };
}



function reasoningRescueTokens(stage, settings, previousTokens) {
    const configured = Math.max(2048, Number(settings?.responseTokens) || 8192);
    const minimums = {
        audit: 2048,
        revision: 8192,
        extraction: 6144,
        extractionRepair: 4096,
        summaryRepair: 4096,
        worldSettingImport: 8192,
        smallSummary: 4096,
        largeSummary: 6144,
        migration: 4096,
        migrationPlan: 8192,
        migrationReview: 2048,
    };
    return Math.min(16384, Math.max(Math.min(configured, Number(previousTokens) || 0), minimums[stage] || 4096));
}

function protocolRescuePrompt(stage, fallbackValue, sourceText, responseTokens) {
    const source = String(sourceText ?? '').trim();
    const fallbackSystem = String(fallbackValue?.system ?? '').trim();
    const fallbackUser = String(fallbackValue?.user ?? '').trim();
    const stageInstructions = {
        audit: '判断输入是否违反审核规则。通过只写“审核结论：通过”；不通过写“审核结论：需要修正”并列出短原因。',
        revision: '输出可直接替换的完整修正版正文，从开头写到结尾。',
        extraction: '从输入中提取已经发生的高价值事实，只输出自然中文条目格式或“无”。',
        extractionRepair: '只把已有候选修复为自然中文条目格式，不新增事实。',
        summaryRepair: '只把已有总结候选修复成固定协议格式，不新增、删除、改写或重新判断任何语义内容。',
        worldSettingImport: '只输出完整 ENTRY 协议或“无”。',
        smallSummary: '只输出“总结｜当前事件”完整固定协议；当前存在待处理来源时禁止输出“无”。',
        largeSummary: '只输出“总结｜世界历史”完整固定协议；当前存在待处理来源时禁止输出“无”。',
        migrationReview: '只输出 PASS 或 FAIL 协议。',
        migrationPlan: '只输出 ANCHOR、GROUP、DROP 协议行。',
        migration: '只输出完整重建条目协议。',
    };
    const system = [
        '你是最终答案提交器。上一次请求只产生了内部推理，没有形成最终文本。',
        '禁止继续分析、解释或输出任何思考过程。直接提交最终答案；第一字符就必须属于最终协议。',
        stageInstructions[stage] || '只输出原任务规定的最终协议。',
        outputContractForStage(stage, responseTokens, source),
        fallbackSystem ? `原任务约束摘要：\n${clipMiddle(fallbackSystem, 3200)}` : '',
    ].filter(Boolean).join('\n\n');
    const user = source
        ? `需要处理的原始内容：\n${clipMiddle(source, 7000)}`
        : `原任务输入：\n${clipMiddle(fallbackUser, 7000)}`;
    return limitPromptPair({ system, user }, stage, true);
}

function salvageStrictFinalProtocol(stage, reasoningText) {
    const text = String(reasoningText ?? '').trim();
    if (!text) return '';
    // reasoning 里可能复述提示词示例。只有明确标记为“最终答案/最终协议”的尾部区域
    // 才允许隔离，且只接受能够严格解析的协议；自由叙事正文永不从 reasoning 恢复。
    const markers = [...text.matchAll(/(?:最终(?:答案|协议|输出|结论)|final\s*(?:answer|output))/giu)];
    if (!markers.length) return '';
    const region = text.slice(markers.at(-1).index).trim();
    if (stage === 'audit' || stage === 'migrationReview') {
        const lines = region.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
        for (let index = lines.length - 1; index >= 0; index -= 1) {
            if (/^(?:PASS|通过|审核结论\s*[：:]\s*通过)[。.]?$/iu.test(lines[index])) return lines[index];
            if (/^(?:FAIL|需要修正|不通过|未通过|审核结论\s*[：:]\s*(?:需要修正|不通过|未通过))(?:\s|[：:]|$)/iu.test(lines[index])) {
                const tail = lines.slice(index).join('\n');
                if (tail.length <= 1200) return tail;
            }
        }
        return '';
    }
    if (['extraction', 'extractionRepair', 'worldSettingImport', 'migration'].includes(stage)) {
        const matches = [...region.matchAll(/<<<ENTRY:[\s\S]*?<<<END_ENTRY>>>/gu)].map((match) => ({ text: match[0], end: match.index + match[0].length }));
        if (matches.length) {
            const last = matches.at(-1);
            const trailing = region.slice(last.end).replace(/[\s。.!！?？:：;；"'“”‘’`]+/gu, '');
            if (!trailing) return matches.slice(-16).map((item) => item.text).join('\n\n');
        }
        const naturalIndex = region.search(/^(?:条目|新条目|ENTRY)(?:\s*\d+)?\s*[：:]\s*(?:人物|角色|NPC|场景|地点|地区|区域|物品|道具|装备|事件|事件链|世界|全局|基础设定|基础规则|世界设定|设定)\s*[｜|丨]/imu);
        if (naturalIndex >= 0) return region.slice(naturalIndex).trim();
        const lastLine = region.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).at(-1) || '';
        if (/^(?:无|EMPTY)$/u.test(lastLine)) return lastLine;
        return '';
    }
    if (stage === 'smallSummary') {
        const index = region.lastIndexOf('总结｜当前事件');
        return index >= 0 ? region.slice(index).trim() : '';
    }
    if (stage === 'largeSummary') {
        const index = region.lastIndexOf('总结｜世界历史');
        return index >= 0 ? region.slice(index).trim() : '';
    }
    if (stage === 'summaryRepair') {
        const smallIndex = region.lastIndexOf('总结｜当前事件');
        const largeIndex = region.lastIndexOf('总结｜世界历史');
        const index = Math.max(smallIndex, largeIndex);
        return index >= 0 ? region.slice(index).trim() : '';
    }
    if (stage === 'migrationPlan') {
        const lines = region.split(/\r?\n/u).map((line) => line.trim()).filter((line) => /^(?:ANCHOR|GROUP|DROP)\b/u.test(line));
        return lines.length ? lines.join('\n') : '';
    }
    return '';
}

function describeRetryReason(error, label = '模型请求') {
    const text = (0, util_1.errorText)(error);
    if (error?.code === 'MA_REASONING_ONLY') return `${label}只返回推理，没有最终协议；已扩大输出预算并缩短上下文重试一次`;
    if (error?.code === 'MA_EMPTY_MODEL_RESPONSE') return `${label}请求完成但没有最终正文；已扩大输出预算并缩短上下文重试一次`;
    if (error?.code === 'MA_NETWORK_RETRY_EXHAUSTED') return `${label}连续3次网络请求失败：${text}`;
    if (isTransientNetworkError(error)) return `${label}遇到瞬时网络中断：${text}；已缩短上下文并退避重试，最多3次`;
    if (isRetryableGatewayError(error)) return `${label}遇到网关或网络异常：${text}；已缩短上下文重试一次`;
    return `${label}失败：${text}；已执行一次安全重试`;
}

/** [MA-MODEL-04] 识别常见上游网关失败；本地取消和格式错误不属于此类。 */
function isRetryableGatewayError(error) {
    const text = (0, util_1.errorText)(error).toLocaleLowerCase();
    return /(?:\b502\b|\b503\b|\b504\b|gateway\s*(?:timeout|time-out)|upstream|no message generated|html\s*错误页|returned\s*html|unexpected token ['"]?<['"]?|<html|not valid json|invalid json|json parse|failed to fetch|fetch failed|network request failed|network error|networkerror|load failed|err_network|connection reset|connection aborted|socket hang up)/iu.test(text);
}

/** 仅识别可安全重放的瞬时网络中断，不把 HTTP 400、协议错误或仅推理归入其中。 */
function isTransientNetworkError(error) {
    const text = (0, util_1.errorText)(error).toLocaleLowerCase();
    return /(?:failed to fetch|fetch failed|network request failed|network error|networkerror|load failed|err_network|connection reset|connection aborted|socket hang up)/iu.test(text);
}

/** 网络重试采用短退避；测试可用 requestRetryBaseDelayMs=0 禁用等待。 */
function gatewayRetryDelayMs(attempt, settings = {}) {
    const configured = Number(settings?.requestRetryBaseDelayMs);
    const base = Number.isFinite(configured) ? Math.max(0, Math.min(5000, configured)) : 800;
    return attempt <= 1 ? base : Math.min(5000, Math.max(base, Math.floor(base * 2.5)));
}

async function waitForGatewayRetry(error, attempt, settings, snapshot) {
    if (!isRetryableGatewayError(error)) return;
    const delay = gatewayRetryDelayMs(attempt, settings);
    if (delay <= 0) return;
    const step = 100;
    let elapsed = 0;
    while (elapsed < delay) {
        if (snapshot?.token?.cancelled) throw new Error(snapshot.token.reason || '任务已取消');
        const current = Math.min(step, delay - elapsed);
        await new Promise((resolve) => setTimeout(resolve, current));
        elapsed += current;
    }
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
const governance_1 = require("./governance");
const semantic_1 = require("./semantic");
const util_1 = require("./util");
function buildOperationPlan(blocks, entries, settings, contextText, options = {}) {
    const governed = (0, governance_1.governInformationBlocks)(blocks, entries, contextText, { ...options, gameTimeEnabled: options.gameTimeEnabled === true });
    blocks = coalesceEventBlocks((0, information_point_1.prepareInformationBlocks)(governed.blocks));
    blocks = ensureDisambiguatedTitles(blocks, entries);
    blocks = suppressStateProjectionNarratives(blocks);
    const index = (0, matcher_1.buildEntryIndex)(entries);
    const operations = [];
    for (const block of blocks) {
        // [MA-ITEM-02] 二次防线：即使候选来自总结或迁移，也不允许集合物品创建独立条目。
        if (block.type === '物品' && isCollectiveItemTitle(block.name)) {
            operations.push(noop(block.title, undefined, '', '物品条目只允许单个可追踪实例；同类集合应保留在场景资源'));
            continue;
        }
        const candidates = (0, matcher_1.matchBlock)(block, index, contextText);
        const resolvedProvisionalCandidates = candidates
            .filter((candidate) => (0, matcher_1.isProvisionalEntry)(candidate.entry))
            .filter((candidate) => candidate.evidence?.some((item) => item.kind === 'context-identity'));
        const target = (0, matcher_1.selectBestCandidate)(candidates, 80);
        const exactClosedEvent = block.type === '事件'
            ? entries.find((entry) => entry.type === '事件' && (0, util_1.normalizeTitle)(entry.title) === (0, util_1.normalizeTitle)(block.title) && (0, semantic_1.isEventClosed)(entry))
            : null;
        if (!target && exactClosedEvent && (0, governance_1.currentEventState)(block) !== 'completed') {
            operations.push(noop(exactClosedEvent.title, exactClosedEvent.uid, '事件状态', '已完成事件不能重新变为活动；新的事件必须使用新的事件标题与因果签名'));
            continue;
        }
        if (!target) {
            const auxiliary = candidates[0];
            if (auxiliary && auxiliary.score >= 50 && !resolvedProvisionalCandidates.length) {
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
            if (shouldMarkTemporary(block)) initialKeywords.push('临时', '身份未明');
            for (const keyword of (0, util_1.unique)(initialKeywords)) {
                operations.push(op('merge-keywords', block.title, undefined, '关键词', undefined, keyword, keyword === '临时' ? '插件按身份未明对象规则标记临时条目' : keyword === '身份未明' ? '插件标记该人物身份尚未揭示' : '新条目关键词写入'));
            }
            for (const provisional of [...new Map(resolvedProvisionalCandidates.map((candidate) => [candidate.entry.uid, candidate.entry])).values()]) {
                operations.push({
                    id: operationId('merge-entry', block.title, `new|${provisional.uid}`),
                    kind: 'merge-entry', operation: 'merge', title: block.title, sourceUid: provisional.uid,
                    newValue: provisional.title, reason: `正文已经揭示身份，临时档“${provisional.title}”合并到新主档“${block.title}”`,
                    score: candidates[0]?.score, matchEvidence: candidates[0]?.evidence,
                });
                operations.push({ ...op('delete-entry', provisional.title, provisional.uid, '身份揭示合并', undefined, '删除', `身份已经归入主档“${block.title}”`), mergedIntoTitle: block.title, requiresDistributionProof: false, distributionTargets: [] });
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
                if (/(事件进程|关键进展|已发生进展|未发生进展)/u.test(section.name) && block.type !== '事件') { operations.push(noop(block.title, undefined, section.name, '事件过程只能写入事件条目')); continue; }
                let sectionPolicy = authoritativeSnapshotPolicy(block.type, section.name)
                    ?? (options.compactEventProgressFromSummary === true && block.type === '事件' && /^(已发生进展|未发生进展|结果)$/u.test(section.name)
                        ? 'replace-section'
                        : policyFor(section.name, settings));
                // ui.69: 总结分发的是已经结算过的历史/长期事实。无显式槽标签时不能按
                // extraction 的 replace-by-anchor 规则直接拒绝；降为 semantic-upsert，
                // 有明确锚点时仍会替换同槽事实，无锚点时按事实追加并接受权威回读。
                if (options.sourceKind === 'summary' && block.type === '人物' && section.name === '当前') sectionPolicy = 'semantic-upsert';
                else if (options.sourceKind === 'summary' && sectionPolicy === 'replace-by-anchor') sectionPolicy = 'semantic-upsert';
                operations.push(...operationsForNewSection(block.title, block.type, section.name, lines, sectionPolicy));
            }
            continue;
        }
        const entry = target.entry;
        // [MA-EVENT-SM-01] 状态机只管理当前事件。总结不得把已完成事件重新写成活动进展；
        // 真正的新事件必须拥有不同的参与、场景或因果签名并建立新条目。
        if (block.type === '事件' && (0, semantic_1.isEventClosed)(entry)
            && (0, governance_1.currentEventState)(block) !== 'completed') {
            operations.push(noop(entry.title, entry.uid, '事件状态', '已完成事件不能重新变为活动；新的事件必须使用新的事件标题与因果签名', target.score, target.evidence));
            continue;
        }
        // [MA-MATCH-02] 同一身份出现多个镜渊管理档案时，先把非锁定重复档合并到确定性主档，再删除重复档。
        const duplicates = candidates
            .filter((candidate) => candidate.entry.uid !== entry.uid)
            .filter((candidate) => Number(candidate.score) >= 80 || ((0, matcher_1.isProvisionalEntry)(candidate.entry) && candidate.evidence?.some((item) => item.kind === 'context-identity')))
            .map((candidate) => candidate.entry)
            .filter((candidate) => candidate.managed === true && candidate.locked !== true && candidate.focus !== true)
            .filter((candidate) => (0, matcher_1.sameEntryIdentity)(entry, candidate) || (entry.type === '事件' && candidate.type === '事件' && (0, matcher_1.sameEventLifecycle)(entry, candidate)) || ((0, matcher_1.isProvisionalEntry)(candidate) && !(0, matcher_1.isProvisionalEntry)(entry) && (0, matcher_1.explicitContextIdentity)(block.name, entry, contextText)));
        for (const duplicate of [...new Map(duplicates.map((candidate) => [candidate.uid, candidate])).values()]) {
            operations.push({
                id: operationId('merge-entry', entry.title, `${entry.uid}|${duplicate.uid}`),
                kind: 'merge-entry',
                operation: 'merge',
                title: entry.title,
                targetUid: entry.uid,
                sourceUid: duplicate.uid,
                newValue: duplicate.title,
                reason: `同一身份重复档“${duplicate.title}”合并到主档“${entry.title}”`,
                score: target.score,
                matchEvidence: target.evidence,
            });
            operations.push({
                ...op('delete-entry', duplicate.title, duplicate.uid, '重复档合并', undefined, '删除', `内容已合并到主档“${entry.title}”`),
                mergedIntoUid: entry.uid,
                requiresDistributionProof: false,
                distributionTargets: [],
            });
        }
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
                if (allowsExplicitClear(section.name) || block.type === '总结') {
                    const current = entry.sections.values[section.name] ?? [];
                    operations.push(current.length
                        ? op('replace-section', entry.title, entry.uid, section.name, current.join('\n'), '', '完整快照明确为空，清除旧状态', target.score, target.evidence)
                        : noop(entry.title, entry.uid, section.name, '完整快照已经为空', target.score, target.evidence));
                }
                else operations.push(noop(entry.title, entry.uid, section.name, '非快照栏目填写“无”，不执行写入', target.score, target.evidence));
                continue;
            }
            const lines = linesWithoutCrossSectionDuplicates(block, section);
            if (!lines.length) { operations.push(noop(entry.title, entry.uid, section.name, '该信息已在同一对象的主要归属小标题中表达', target.score, target.evidence)); continue; }
            if (/(事件进程|关键进展|已发生进展|未发生进展)/u.test(section.name) && block.type !== '事件') { operations.push(noop(entry.title, entry.uid, section.name, '事件过程只能写入事件条目', target.score, target.evidence)); continue; }
            let sectionPolicy = authoritativeSnapshotPolicy(block.type, section.name)
                ?? (options.compactEventProgressFromSummary === true && block.type === '事件' && /^(已发生进展|未发生进展|结果)$/u.test(section.name)
                    ? 'replace-section'
                    : policyFor(section.name, settings));
            // ui.71: 正文提取的【当前】是完整快照；总结只携带已结算的局部状态变化。
            // 因此人物总结必须按明确状态槽增量更新，不能用整段替换擦掉未参与本次总结的位置/目标等现状。
            if (options.sourceKind === 'summary' && block.type === '人物' && section.name === '当前') sectionPolicy = 'semantic-upsert';
            else if (options.sourceKind === 'summary' && sectionPolicy === 'replace-by-anchor') sectionPolicy = 'semantic-upsert';
            operations.push(...operationsForExisting(entry, section.name, lines, sectionPolicy, target.score, target.evidence));
        }
        if (options.compactEventProgressFromSummary === true && block.type === '事件') {
            for (const legacySection of ['目标', '阶段', '关键进展', '事件进程', '未决']) {
                const current = entry.sections.values[legacySection] ?? [];
                if (!current.length) continue;
                operations.push(op('replace-section', entry.title, entry.uid, legacySection, current.join('\n'), '', '事件已按状态变化快照压缩，消费旧目标、阶段、未决和过程栏目', target.score, target.evidence));
            }
        }
    }
    // [MA-SCENE-SETTLE-01] 当前场景切换时，结算旧场景的活动快照；固定角色和固定设施继续留在场景主条目。
    operations.push(...(0, governance_1.sceneSettlementOperations)(blocks, entries));
    if (options.cleanupTemporaryAfterSummary === true)
        operations.push(...temporaryCleanupOperations(entries, settings, blocks));
    if (options.consumeSmallSummaryAfterLarge === true)
        operations.push(...consumeSmallSummaryOperations(entries));
    const primaryOperations = dedupeOperations(operations);
    // [MA-REL-01] 独立物品条目是物品状态的权威宿主；人物【持有】与场景【当前资源】只做最短引用。
    // 只对本轮触及的物品做机械一致性校正，不扫描或重写无关条目。
    const projectedEntries = applyPlanToEntries({ operations: primaryOperations }, entries, settings);
    const relationOperations = relationshipConsistencyOperations(blocks, projectedEntries);
    let plannedOperations = dedupeOperations([...primaryOperations, ...relationOperations]);
    // A create operation is emitted before section-level governance finishes.
    // If every candidate fact is later rejected or absorbed, do not leave a
    // newly-created empty shell in the real worldbook.
    const blankCreatedTitles = new Set(applyPlanToEntries({ operations: plannedOperations }, entries, settings)
        .filter((entry) => String(entry.uid ?? '').startsWith('new:'))
        .filter((entry) => !Object.values(entry.sections?.values ?? {}).flat().some((line) => String(line ?? '').trim()))
        .map((entry) => (0, util_1.normalizeTitle)(entry.title)));
    if (blankCreatedTitles.size) plannedOperations = plannedOperations.filter((operation) => !blankCreatedTitles.has((0, util_1.normalizeTitle)(operation.title)));
    const reconciledEntries = applyPlanToEntries({ operations: plannedOperations }, entries, settings);
    const cleanupOperations = emptyEntryCleanupOperations(reconciledEntries, settings);
    return { blocks, operations: dedupeOperations([...plannedOperations, ...cleanupOperations]), governance: governed.diagnostics, currentSceneTitle: governed.currentSceneTitle, createdAt: Date.now() };
}
function ensureDisambiguatedTitles(blocks, entries) {
    return blocks.map((source) => {
        const block = structuredClone(source);
        const collisions = entries.filter((entry) => (0, util_1.normalizeTitle)(entry.title) === (0, util_1.normalizeTitle)(block.title));
        if (!collisions.length || !collisions.some((entry) => (0, matcher_1.identityConflict)(block, entry))) return block;
        if (/[（(][^）)]+[）)]/u.test(block.name)) return block;
        const anchor = disambiguationAnchor(block);
        if (!anchor) return block;
        block.name = `${block.name}（${anchor}）`;
        block.title = `${block.type}｜${block.name}`;
        block.keywords = (0, util_1.unique)([block.name, ...(block.keywords ?? [])]).slice(0, 4);
        return block;
    });
}
function disambiguationAnchor(block) {
    const priority = ['唯一编号', '编号', '序列号', '型号', '种族', '职业', '组织', '阵营', '身份', '类别'];
    const values = new Map();
    for (const section of block.sections ?? []) {
        if (!/^(?:身份|稳定|定义|当前)$/u.test(section.name)) continue;
        for (const line of section.lines ?? []) {
            const match = String(line).match(/^\s*([^：:]{1,24})\s*[：:]\s*(.+)$/u);
            if (!match) continue;
            const label = (0, util_1.normalizeFact)(match[1]).replace(/^所属/u, '');
            const canonical = ({ 账号id: '编号', id: '编号', 所属组织: '组织' })[label] ?? label;
            if (priority.includes(canonical) && !values.has(canonical)) values.set(canonical, String(match[2] ?? '').trim());
        }
    }
    for (const key of priority) {
        const value = values.get(key);
        if (value && !/^(?:无|未知|未说明)$/u.test((0, util_1.normalizeFact)(value))) return value.slice(0, 20);
    }
    return '';
}
function coalesceEventBlocks(blocks) {
    const output = [];
    for (const incoming of blocks) {
        if (String(incoming?.type ?? '') !== '事件') {
            output.push(structuredClone(incoming));
            continue;
        }
        const current = output.find((candidate) => candidate.type === '事件' && (0, matcher_1.sameEventLifecycle)(candidate, incoming));
        if (!current) {
            output.push(structuredClone(incoming));
            continue;
        }
        current.keywords = (0, util_1.unique)([...(current.keywords ?? []), ...(incoming.keywords ?? []), incoming.name].filter(Boolean));
        const byName = new Map(current.sections.map((section) => [section.name, section]));
        for (const section of incoming.sections ?? []) {
            const target = byName.get(section.name);
            if (!target) {
                current.sections.push(structuredClone(section));
                byName.set(section.name, current.sections.at(-1));
            }
            else {
                target.lines = (0, information_point_1.mergeCanonicalLines)(section.name, target.lines, section.lines);
                target.empty = target.lines.length === 0;
            }
        }
        if ((0, util_1.normalizeFact)(current.name) !== (0, util_1.normalizeFact)(incoming.name)) {
            let aliases = byName.get('别名');
            if (!aliases) {
                aliases = { name: '别名', lines: [], empty: false };
                current.sections.push(aliases);
                byName.set('别名', aliases);
            }
            aliases.lines = (0, util_1.unique)([...aliases.lines, incoming.name]);
            aliases.empty = false;
        }
    }
    return output;
}

function applyPlanToEntries(plan, entries, settings = undefined) {
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
        if (operation.kind === 'merge-entry') {
            const source = byUid.get(String(operation.sourceUid ?? ''));
            if (source && source.uid !== target.uid) mergeEntryData(target, source);
        }
        else applyOne(target, operation);
        modifiedEntries.add(target);
    }
    if (settings?.entryBudgetEnabled !== false) for (const entry of modifiedEntries) enforceEntryBudgets(entry);
    return output;
}
// [MA-CONTENT-01] 单条目正文预算：允许场景知识持续补全，但阻止模型把动作流水或重复描述无限写入世界书。
const SECTION_BUDGETS = {
    // 动态对象：当前快照最大，固定事实次之，稳定定义与历史引用依次递减。
    人物: { 身份: 2, 稳定: 3, 行为倾向: 4, 性格核心: 4, 表达方式: 3, 决策倾向: 3, 当前: 8, 固定事实: 6, 关系: 5, 关系立场: 5, 持有: 5, 已知: 6, 误信: 4, 别名: 4 },
    // 常驻角色与固定设施属于场景稳定骨架；在场、当前资源与活动关联只保存当前场景快照，离场即结算清空。
    场景: { 定义: 3, 空间结构: 5, 固定资源: 5, 固定设施: 8, 常驻角色: 5, 当前状态: 8, 在场: 12, 当前资源: 8, 活动关联: 4, 固定事实: 6, 世界影响: 3, 局部约束: 4, 别名: 4 },
    物品: { 定义: 3, 功能: 4, 当前: 8, 限制: 3, 固定事实: 6, 别名: 4 },
    事件: { 参与: 6, 附属人员: 4, 场景: 3, 已发生进展: 4, 未发生进展: 2, 结果: 2, 别名: 4 },
    世界: { 范围: 3, 地理: 5, 组织: 5, 权力: 8, 制度: 8, 资源与交通: 8, 公开局势: 8, 固定事实: 6, 持续影响: 5, 别名: 4 },
    // 基础设定的核心就是稳定规则，因此规则栏目拥有最大预算。
    基础设定: { 世界常识: 8, 自然规则: 8, 种族与生命: 8, 能力与技术: 8, 社会规则: 8, 地理框架: 8, 别名: 4 },
};
const TEMPLATE_SECTION_ORDER = Object.freeze({
    '人物': ['身份', '稳定', '行为倾向', '性格核心', '表达方式', '决策倾向', '当前', '关系', '关系立场', '持有', '已知', '误信', '固定事实', '别名'],
    '场景': ['定义', '空间结构', '固定资源', '固定设施', '常驻角色', '固定事实', '当前状态', '在场', '当前资源', '活动关联', '世界影响', '局部约束', '别名'],
    '物品': ['定义', '功能', '当前', '限制', '固定事实', '别名'],
    '事件': ['参与', '附属人员', '场景', '已发生进展', '未发生进展', '结果', '别名'],
    '世界': ['范围', '地理', '组织', '权力', '制度', '资源与交通', '公开局势', '固定事实', '持续影响', '别名'],
    '基础设定': ['世界常识', '自然规则', '种族与生命', '能力与技术', '社会规则', '地理框架', '别名'],
});
function enforceEntryBudgets(entry) {
    normalizeEntryTemplate(entry);
    const budgets = SECTION_BUDGETS[String(entry?.type ?? '')] ?? {};
    for (const [section, limitValue] of Object.entries(budgets)) {
        const limit = Math.max(1, Number(limitValue || 1));
        let lines = (0, util_1.unique)(entry.sections?.values?.[section] ?? []).map(compactFactLine).filter(Boolean);
        if (entry.type === '场景' && section === '常驻角色') lines = compactFixedSceneRoles(lines);
        if (entry.type === '事件' && section === '附属人员') lines = compactAuxiliaryPeople(lines);
        if (lines.length <= limit) {
            if (entry.sections?.values) entry.sections.values[section] = lines;
            continue;
        }
        // 固定事实超过预算时，把较早结果压缩为一行并保留最新结果；不再简单删除中间经历。
        if (section === '固定事实') {
            entry.sections.values[section] = compressOlderFixedFacts(lines, limit);
            continue;
        }
        // 事件只保存状态变化的高密度结果；较早进展压成一行，未形成进展只保留最近短暂材料。
        if (entry.type === '事件' && section === '已发生进展') {
            entry.sections.values[section] = compressOlderEventProgress(lines, limit);
            continue;
        }
        // 稳定骨架保留早期根基与最新补充；当前快照由整段替换保证不会堆积。
        const preserveEdges = /^(身份|稳定|定义|空间结构|固定资源|世界常识|自然规则|种族与生命|能力与技术|社会规则|地理框架)$/u.test(section);
        if (preserveEdges) {
            const headCount = Math.min(2, Math.ceil(limit / 3));
            const tailCount = Math.max(0, limit - headCount);
            entry.sections.values[section] = (0, util_1.unique)([...lines.slice(0, headCount), ...lines.slice(-tailCount)]).slice(0, limit);
        }
        else entry.sections.values[section] = lines.slice(-limit);
    }
    if (entry.type === '事件' && (entry.sections?.values?.['结果'] ?? []).length) {
        entry.sections.values['未发生进展'] = [];
        const progressed = (0, util_1.unique)(entry.sections.values['已发生进展'] ?? []).filter(Boolean);
        if (progressed.length > 2) entry.sections.values['已发生进展'] = compressOlderEventProgress(progressed, 2);
    }
    enforceTotalCharacterBudget(entry);
    return entry;
}
function normalizeEntryTemplate(entry) {
    const order = TEMPLATE_SECTION_ORDER[String(entry?.type ?? '')];
    if (!order || !entry?.sections?.values) return entry;
    const allowed = new Set(order);
    const next = Object.fromEntries(order.map((name) => [name, []]));
    const append = (section, line) => {
        if (!section || !line) return;
        next[section] = (0, util_1.unique)([...(next[section] ?? []), String(line).trim()]);
    };
    for (const rawName of (0, util_1.unique)([...(entry.sections.order ?? []), ...Object.keys(entry.sections.values)])) {
        const canonical = (0, information_point_1.canonicalSectionName)(rawName, entry.type);
        for (const rawLine of entry.sections.values[rawName] ?? []) {
            const inline = String(rawLine ?? '').match(/^\s*【\s*([^】]+?)\s*】\s*(.+)$/u);
            const inlineSection = inline ? (0, information_point_1.canonicalSectionName)(inline[1], entry.type) : '';
            const target = allowed.has(inlineSection) ? inlineSection : allowed.has(canonical) ? canonical : fallbackTemplateSection(entry.type, rawName);
            append(target, inline ? inline[2] : rawLine);
        }
    }
    entry.sections.order = order.filter((name) => (next[name] ?? []).length);
    entry.sections.values = Object.fromEntries(entry.sections.order.map((name) => [name, next[name]]));
    return entry;
}
function fallbackTemplateSection(type, rawName) {
    const name = String(rawName ?? '');
    if (type === '人物') {
        if (/(?:稳定名称|身份|职业|阵营)/u.test(name)) return '身份';
        if (/(?:立场|关系|同行|盟友|信任|照看|护卫)/u.test(name)) return '关系立场';
        return '固定事实';
    }
    if (type === '场景') return '固定事实';
    if (type === '物品') return '固定事实';
    if (type === '事件') return '已发生进展';
    if (type === '世界') return '固定事实';
    if (type === '基础设定') return '世界常识';
    return '';
}
function compactFixedSceneRoles(lines) {
    const grouped = new Map();
    const named = [];
    for (const line of lines) {
        const [rawName, rawDuty = '固定承担本场景岗位职责。'] = String(line).split(/[:：]/u, 2);
        const role = canonicalBackgroundRole(rawName);
        if (!role) { named.push(line); continue; }
        const duties = grouped.get(role) ?? [];
        duties.push(String(rawDuty).trim());
        grouped.set(role, duties);
    }
    const generic = [...grouped.entries()].map(([role, duties]) => `${role}：${(0, util_1.unique)(duties).slice(0, 2).join('；')}`);
    return (0, util_1.unique)([...named, ...generic]);
}
function compactAuxiliaryPeople(lines) {
    const named = [];
    const generic = new Map();
    for (const line of lines) {
        const [rawName, rawDuty = '参与本次事件。'] = String(line).split(/[:：]/u, 2);
        const role = canonicalBackgroundRole(rawName);
        if (!role) { named.push(line); continue; }
        const duties = generic.get(role) ?? [];
        duties.push(String(rawDuty).trim());
        generic.set(role, duties);
    }
    return (0, util_1.unique)([...named, ...[...generic.entries()].map(([role, duties]) => `${role}：${(0, util_1.unique)(duties).slice(0, 1).join('；')}`)]);
}
function canonicalBackgroundRole(value) {
    const text = String(value ?? '').replace(/(?:甲|乙|丙|丁|A|B|C|D|\d+)$/iu, '').trim();
    const mappings = [
        [/(?:管理员|门卫|保安|守卫)/u, '管理与守卫人员'],
        [/(?:店员|售货员|收银员|服务员|侍者|接待员)/u, '服务人员'],
        [/(?:工作人员|办事员|职员)/u, '工作人员'],
        [/(?:监考|裁判|主持人)/u, '赛务人员'],
        [/(?:医生|护士|药师)/u, '医疗人员'],
        [/(?:士兵|侍卫)/u, '守备人员'],
        [/(?:学生|同学|居民|村民|市民|群众|路人|顾客|客人)/u, '普通在场人员'],
    ];
    return mappings.find(([pattern]) => pattern.test(text))?.[1] || '';
}

function compactFactLine(value) {
    const line = String(value ?? '').replace(/^\s*[-*]\s*/u, '').replace(/\s+/gu, ' ').trim();
    if (!line || line.length <= 140) return line;
    const sentence = line.slice(0, 140).match(/^(.{28,139}?[。；！？!?])/u)?.[1];
    return sentence || `${line.slice(0, 136).replace(/[，、：:；;\s]+$/u, '')}…`;
}

// [MA-BUDGET-02] 总字数预算由条目结构决定，不随旧条目平均长度无限膨胀。
const ENTRY_CHAR_LIMITS = Object.freeze({ 人物: [300, 520], 场景: [260, 520], 物品: [140, 260], 事件: [180, 360], 世界: [300, 620], 基础设定: [320, 680], 运行包: [900, 2200], 总结: [420, 900] });
function dynamicEntryCharLimit(entry) {
    const [base, hard] = ENTRY_CHAR_LIMITS[String(entry?.type ?? '')] ?? [220, 520];
    const values = entry?.sections?.values ?? {};
    let extra = 0;
    if (entry.type === '人物') {
        if ((values['性格核心'] ?? []).length) extra += 45;
        if ((values['表达方式'] ?? []).length) extra += 35;
        if ((values['决策倾向'] ?? []).length) extra += 35;
        extra += Math.min(80, Math.max(0, (values['关系立场'] ?? values['关系'] ?? []).length - 1) * 20);
        if ((values['当前'] ?? []).length >= 4) extra += 25;
    }
    else if (entry.type === '场景') {
        extra += Math.min(80, (values['空间结构'] ?? []).length * 12);
        extra += Math.min(60, (values['固定设施'] ?? []).length * 8);
        extra += Math.min(50, (values['常驻角色'] ?? []).length * 10);
    }
    else if (entry.type === '事件') {
        extra += Math.min(80, Math.max(0, (values['已发生进展'] ?? []).length - 1) * 24);
        if ((values['结果'] ?? []).length) extra += 30;
    }
    return Math.min(hard, base + extra);
}
function measureEntryCharacters(entry) {
    const values = entry?.sections?.values ?? {};
    return String(entry?.title ?? '').length + Object.entries(values).reduce((sum, [section, lines]) => sum + section.length + (lines ?? []).join('\n').length + 4, 0);
}
function enforceTotalCharacterBudget(entry) {
    const limit = dynamicEntryCharLimit(entry);
    const hardLimit = (ENTRY_CHAR_LIMITS[String(entry?.type ?? '')] ?? [220, 520])[1];
    if (measureEntryCharacters(entry) <= limit) return;
    const values = entry.sections?.values ?? {};
    // 先删低价值过程和背景附属，再压缩历史；身份、性格、表达、决策和当前状态受保护。
    const dropOrder = entry.type === '人物'
        ? ['误信', '已知', '固定事实', '持有', '关系', '稳定', '别名']
        : entry.type === '场景'
            ? ['世界影响', '局部约束', '当前资源', '活动关联', '固定事实', '固定资源', '固定设施', '常驻角色', '空间结构']
            : entry.type === '事件'
                ? ['未发生进展', '附属人员']
                : Object.keys(values).reverse();
    for (const section of dropOrder) {
        const lines = values[section] ?? [];
        while (lines.length > protectedMinimum(entry.type, section) && measureEntryCharacters(entry) > limit) lines.shift();
        if (measureEntryCharacters(entry) <= limit) return;
    }
    // The dynamic target is a soft compaction goal.  Stable character and
    // world facts may legitimately exceed it; preserve them up to the fixed
    // per-type hard ceiling instead of blocking every future update.
    if (measureEntryCharacters(entry) <= hardLimit) return;
    // [MA-BUDGET-03] 多个受保护栏目同时过长时，先降低每栏行数，再按标点边界缩短句子。
    // 不从句子中间硬切；若没有可用语义边界而仍超硬上限，则拒绝本次提交。
    shrinkProtectedSections(entry);
    if (measureEntryCharacters(entry) <= hardLimit) return;
    compactProtectedSections(entry, hardLimit);
    if (measureEntryCharacters(entry) > hardLimit) {
        throw new Error(`条目“${entry.title || entry.name || entry.type}”无法在不破坏受保护内容的情况下压缩到硬上限 ${hardLimit} 字以内`);
    }
}
const PRESSURE_SECTION_LIMITS = Object.freeze({
    人物: { 身份: 1, 行为倾向: 2, 性格核心: 2, 表达方式: 1, 决策倾向: 1, 关系立场: 2, 当前: 5 },
    场景: { 定义: 1, 当前状态: 4, 在场: 12 },
    事件: { 参与: 6, 场景: 1, 已发生进展: 2, 结果: 1 },
});
function shrinkProtectedSections(entry) {
    const limits = PRESSURE_SECTION_LIMITS[String(entry?.type ?? '')] ?? {};
    const values = entry.sections?.values ?? {};
    for (const [section, maxLines] of Object.entries(limits)) {
        const lines = values[section] ?? [];
        if (lines.length <= maxLines) continue;
        const preserveRoot = /^(?:身份|性格核心|定义)$/u.test(section);
        if (maxLines <= 1) values[section] = [preserveRoot ? lines[0] : lines.at(-1)].filter(Boolean);
        else {
            const head = preserveRoot ? 1 : 0;
            values[section] = (0, util_1.unique)([...lines.slice(0, head), ...lines.slice(-(maxLines - head))]).slice(0, maxLines);
        }
    }
}
function compactProtectedSections(entry, limit) {
    const limits = PRESSURE_SECTION_LIMITS[String(entry?.type ?? '')] ?? {};
    const values = entry.sections?.values ?? {};
    const protectedSections = Object.keys(limits).filter((section) => (values[section] ?? []).length);
    if (!protectedSections.length) return;
    const lineCount = protectedSections.reduce((sum, section) => sum + (values[section] ?? []).length, 0);
    const structuralCost = String(entry?.title ?? '').length + protectedSections.reduce((sum, section) => sum + section.length + 4, 0) + Math.max(0, lineCount - 1);
    let perLine = Math.max(18, Math.floor((limit - structuralCost) / Math.max(1, lineCount)));
    while (perLine >= 18 && measureEntryCharacters(entry) > limit) {
        for (const section of protectedSections) values[section] = (values[section] ?? []).map((line) => compactAtSemanticBoundary(line, perLine));
        perLine -= 4;
    }
}
function compactAtSemanticBoundary(value, maxLength) {
    const line = compactFactLine(value);
    if (line.length <= maxLength) return line;
    const chunks = line.split(/(?<=[。；！？!?])|[，,、]/u).map((item) => item.trim()).filter(Boolean);
    let result = '';
    for (const chunk of chunks) {
        const candidate = result ? `${result}，${chunk}` : chunk;
        if (candidate.length > maxLength) break;
        result = candidate;
    }
    if (result) return /[。；！？!?]$/u.test(result) ? result : `${result}。`;
    throw new Error(`事实行缺少可安全压缩的语义边界：${line}`);
}
function protectedMinimum(type, section) {
    if (type === '人物' && /^(?:身份|性格核心|表达方式|决策倾向|关系立场|当前)$/u.test(section)) return 1;
    if (type === '场景' && /^(?:定义|当前状态|在场)$/u.test(section)) return 1;
    if (type === '事件' && /^(?:参与|场景|已发生进展|结果)$/u.test(section)) return 1;
    return 0;
}
function mergeEntryData(target, source) {
    target.keywords = (0, util_1.unique)([...(target.keywords ?? []), ...(source.keywords ?? [])]);
    target.aliases = (0, util_1.unique)([...(target.aliases ?? []), ...(source.aliases ?? []), source.name].filter(Boolean));
    target.references = (0, util_1.unique)([...(target.references ?? []), ...(source.references ?? [])]);
    target.sections ??= { order: [], values: {} };
    target.sections.order ??= [];
    target.sections.values ??= {};
    for (const section of source.sections?.order ?? Object.keys(source.sections?.values ?? {})) {
        const incoming = source.sections?.values?.[section] ?? [];
        if (!incoming.length) continue;
        if (!target.sections.values[section]) {
            target.sections.values[section] = [];
            target.sections.order.push(section);
        }
        const current = target.sections.values[section];
        for (const line of incoming) {
            const anchor = informationAnchor(line);
            if (anchor && /^(当前|当前状态|阶段)$/u.test(section) && current.some((item) => informationAnchor(item) === anchor)) continue;
            if (!current.some((item) => (0, util_1.normalizeFact)(item) === (0, util_1.normalizeFact)(line))) current.push(line);
        }
    }
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
        const snapshot = normalizeSnapshotLines(section, lines);
        return [op('replace-section', title, undefined, section, undefined, snapshot.join('\n'), '新条目整段写入')];
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
        const next = normalizeSnapshotLines(section, lines).join('\n');
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
        if (entry.type === '人物' && /^(已知|误信)$/u.test(section) && anchor) {
            const oppositeSection = section === '已知' ? '误信' : '已知';
            const opposite = entry.sections.values[oppositeSection] ?? [];
            for (const oldLine of opposite.filter((line) => informationAnchor(line) === anchor)) {
                result.push(op('delete-line', entry.title, entry.uid, oppositeSection, oldLine, undefined, `人物认知槽“${anchor.replace(/^label:/u, '')}”已转入【${section}】，清除相反认知`, score, evidence));
            }
        }
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
function normalizeSnapshotLines(section, lines) {
    if (!/^(?:当前|当前状态)$/u.test(String(section ?? ''))) return (0, util_1.unique)(lines);
    const output = [];
    const positions = new Map();
    for (const rawLine of lines ?? []) {
        const line = normalizeStateLine(section, (0, parser_1.normalizePointLine)(rawLine));
        const anchor = informationAnchor(line);
        if (anchor && positions.has(anchor)) output[positions.get(anchor)] = line;
        else {
            if (anchor) positions.set(anchor, output.length);
            output.push(line);
        }
    }
    return (0, util_1.unique)(output);
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
function allowsExplicitClear(section) {
    return /^(当前|当前状态|在场|当前资源|活动关联|持有|未发生进展)$/u.test(String(section ?? '').trim());
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
function consumeSmallSummaryOperations(_entries) {
    // ui.60: 当前事件总结容器只有在逐来源吸收计划提供事实级承接证明时才可退出。
    // 通用大总结完成不再机械删除整个容器，避免未被承接的中层事实丢失。
    return [];
}

function temporaryCleanupOperations(_entries, _settings, _summaryBlocks = []) {
    // ui.60: 临时人物退出统一由【历史分发】逐来源协议执行。
    // 插件不再依据标题或关键词独立推断资格，避免与模型上下文判断形成第二套规则。
    return [];
}
function shouldMarkTemporary(block) {
    if (String(block.type ?? '').trim() !== '人物') return false;
    if ((0, matcher_1.isProvisionalName)(block.name)) return true;
    return block.keywords?.some((keyword) => /^(?:身份未明|未知身份|临时)$/u.test((0, util_1.normalizeFact)(keyword))) === true;
}
function isFoundationProtected(entry, settings) {
    const definition = settings.keywordDefinitions.find((item) => item.label === '基础设定');
    const names = definition ? [definition.label, ...definition.aliases] : ['基础设定'];
    return entry.keywords.some((keyword) => names.some((name) => (0, util_1.normalizeFact)(keyword) === (0, util_1.normalizeFact)(name)));
}
function linesWithoutCrossSectionDuplicates(block, section) {
    if (!/(固定事实|持续经历|近期经历|持续变化|世界变化|已发生进展)/u.test(section.name)) return section.lines;
    const current = block.sections.filter((item) => /^(当前|当前状态)$/u.test(item.name)).flatMap((item) => item.lines).map(util_1.normalizeFact);
    return section.lines.filter((line) => !current.includes((0, util_1.normalizeFact)(line)));
}

function compressOlderFixedFacts(lines, limit) {
    if (lines.length <= limit) return lines;
    const recentCount = Math.max(1, limit - 1);
    const older = lines.slice(0, -recentCount)
        .flatMap((line) => String(line).replace(/^较早结果[：:]/u, '').split(/；/u))
        .map((line) => line.trim().replace(/[。；;]+$/u, ''))
        .filter(Boolean);
    const recent = lines.slice(-recentCount);
    const compressed = historicalDigest(older);
    return (0, util_1.unique)([compressed, ...recent]).slice(0, limit);
}
function historicalDigest(lines) {
    const facts = (0, util_1.unique)(lines).map((line) => line.length > 30 ? `${line.slice(0, 29)}…` : line);
    const all = `较早结果：${facts.join('；')}`;
    if (all.length <= 140) return all;
    const head = facts.slice(0, 2);
    const tail = facts.slice(-2);
    return compactFactLine(`较早结果：${head.join('；')}；……（共${facts.length}项）；${tail.join('；')}`);
}

function compressOlderEventProgress(lines, limit) {
    const uniqueLines = (0, util_1.unique)(lines).map((line) => String(line).replace(/^较早进展[：:]/u, '').trim()).filter(Boolean);
    if (uniqueLines.length <= limit) return uniqueLines;
    const recentCount = Math.max(1, limit - 1);
    const older = uniqueLines.slice(0, -recentCount);
    const recent = uniqueLines.slice(-recentCount);
    const digest = compactFactLine(`较早进展：${older.join('；')}`);
    return (0, util_1.unique)([digest, ...recent]).slice(0, limit);
}

function suppressStateProjectionNarratives(blocks) {
    const claims = blocks
        .filter((block) => block.type === '物品')
        .map((block) => ({
            item: block.name,
            holder: blockStateValue(block, '当前持有者'),
            location: blockStateValue(block, '当前位置'),
        }))
        .filter((claim) => claim.item && (claim.holder || claim.location));
    if (!claims.length) return blocks;
    return blocks.map((block) => {
        if (block.type === '物品') return block;
        const next = structuredClone(block);
        for (const section of next.sections ?? []) {
            if (!/^(固定事实|已发生进展|关键进展|结果)$/u.test(section.name)) continue;
            section.lines = (section.lines ?? []).filter((line) => !claims.some((claim) => isPureStateProjection(line, claim)));
            section.empty = section.lines.length === 0;
        }
        return next;
    });
}
function blockStateValue(block, label) {
    const section = (block.sections ?? []).find((item) => /^(当前|当前状态)$/u.test(item.name));
    const line = section?.lines?.find((item) => canonicalInformationLabel(item.match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1] ?? '', section.name) === label);
    return String(line?.match(/^\s*[^：:]{1,24}\s*[：:]\s*(.*)$/u)?.[1] ?? '').trim();
}
function isPureStateProjection(line, claim) {
    const normalized = (0, util_1.normalizeFact)(line);
    const item = (0, util_1.normalizeFact)(claim.item);
    const holder = (0, util_1.normalizeFact)(claim.holder);
    const location = (0, util_1.normalizeFact)(claim.location);
    if (!normalized || !item || !normalized.includes(item)) return false;
    // 含有独立事件结果时保留，只删除“换角度重述物品状态”的短句。
    if (/(击败|杀死|死亡|受伤|获胜|失败|逃离|摧毁|签署|解散|建立|发现|结束战斗|冲突结束)/u.test(normalized)) return false;
    if (normalized.length > item.length + holder.length + location.length + 14) return false;
    if (holder && !isNoneStateValue(holder)) {
        const patterns = [
            `${holder}把${item}收回`, `${holder}将${item}收回`, `${holder}收回${item}`,
            `${holder}拿回${item}`, `${holder}带走${item}`, `${holder}携带${item}`, `${holder}持有${item}`,
            `${item}由${holder}持有`, `${item}由${holder}携带`, `${item}被${holder}收回`,
        ];
        if (patterns.some((value) => normalized === value || normalized.startsWith(value))) return true;
    }
    if (location) {
        const patterns = [`${item}位于${location}`, `${item}留在${location}`, `${item}被放回${location}`, `${item}已归还${location}`];
        if (patterns.some((value) => normalized === value || normalized.startsWith(value))) return true;
    }
    // 即使人物角度写出的动作与最终物品快照矛盾，独立物品当前状态仍是权威宿主。
    const transferVerbs = ['收回', '拿回', '带走', '携带', '持有', '放回', '归还', '交还', '取走'];
    if (transferVerbs.some((verb) => normalized.endsWith(`${verb}${item}`) || normalized.includes(`把${item}${verb}`) || normalized.includes(`将${item}${verb}`))) return true;
    return false;
}

function relationshipConsistencyOperations(blocks, projectedEntries) {
    const directItems = blocks.filter((block) => block.type === '物品').map((block) => block.name).filter(Boolean);
    const referencedItems = projectedEntries
        .filter((entry) => entry.type === '物品')
        .filter((item) => blocks.some((block) => block.sections?.some((section) => /^(?:持有|当前资源)$/u.test(section.name)
            && section.lines?.some((line) => referencesObject(line, item.name)))))
        .map((item) => item.name);
    // Terminal item states are globally authoritative even when the model does
    // not repeat the old scene/person reference in the same extraction block.
    const unavailableItems = projectedEntries.filter((entry) => entry.type === '物品' && itemIsUnavailable(entry)).map((entry) => entry.name);
    const touchedItems = (0, util_1.unique)([...directItems, ...referencedItems, ...unavailableItems]);
    if (!touchedItems.length) return [];
    const operations = [];
    for (const itemName of touchedItems) {
        const item = findEntryByName(projectedEntries, '物品', itemName);
        if (!item || item.locked) continue;
        const unavailable = itemIsUnavailable(item);
        const holderValue = entryStateValue(item, '当前持有者');
        const locationValue = entryStateValue(item, '当前位置');
        const holder = unavailable || isNoneStateValue(holderValue) ? null : findEntryByName(projectedEntries, '人物', holderValue);
        const scene = unavailable || holder ? null : findContainingEntry(projectedEntries, '场景', locationValue);
        const projectToHolder = !unavailable && holder ? itemProjectsToPerson(item, holderValue) : false;

        for (const person of projectedEntries.filter((entry) => entry.type === '人物' && !entry.locked)) {
            const current = [...(person.sections?.values?.['持有'] ?? [])];
            const withoutItem = current.filter((line) => !referencesObject(line, item.name));
            const shouldHold = projectToHolder && holder?.uid === person.uid;
            const next = shouldHold ? (0, util_1.unique)([...withoutItem, item.name]) : withoutItem;
            if ((0, util_1.normalizeFact)(current.join('\n')) !== (0, util_1.normalizeFact)(next.join('\n'))) {
                operations.push(op('replace-section', person.title, person.uid, '持有', current.join('\n'), next.join('\n'), shouldHold
                    ? `独立物品“${item.name}”当前由该人物持有，人物卡只保留最短引用`
                    : `独立物品“${item.name}”的权威持有状态不在该人物，移除旧引用`));
            }
        }

        for (const candidate of projectedEntries.filter((entry) => entry.type === '场景' && !entry.locked)) {
            const current = [...(candidate.sections?.values?.['当前资源'] ?? [])];
            const withoutItem = current.filter((line) => !referencesObject(line, item.name));
            const shouldContain = scene?.uid === candidate.uid;
            const next = shouldContain ? (0, util_1.unique)([...withoutItem, item.name]) : withoutItem;
            if ((0, util_1.normalizeFact)(current.join('\n')) !== (0, util_1.normalizeFact)(next.join('\n'))) {
                operations.push(op('replace-section', candidate.title, candidate.uid, '当前资源', current.join('\n'), next.join('\n'), shouldContain
                    ? `独立物品“${item.name}”无人持有且位于本场景，场景仅保留资源引用`
                    : `独立物品“${item.name}”已不属于本场景当前资源，移除旧引用`));
            }
        }
    }
    return operations;
}
function itemIsUnavailable(item) {
    const text = (0, util_1.normalizeFact)(Object.values(item?.sections?.values ?? {}).flat().join('；'));
    if (!text) return false;
    const terminal = /(?:已消耗|消耗完毕|已经用尽|已用尽|已碎裂|彻底碎裂|已销毁|已经销毁|已失效|碎裂失效|不复存在|已不存在|永久遗失)/u.test(text);
    const restored = /(?:已修复|恢复可用|重新获得|再次持有|找回|重铸|复原)/u.test(text);
    return terminal && !restored;
}
function emptyEntryCleanupOperations(entries, settings) {
    const context = (0, governance_1.activeContext)(entries ?? [], entries.find((entry) => entry.focus)?.uid || '');
    const protectedUids = new Set([
        context.scene?.uid, context.focus?.uid,
        ...(context.characters ?? []).map((entry) => entry.uid),
        ...(context.activeEvents ?? []).map((entry) => entry.uid),
    ].filter(Boolean).map(String));
    const foundationLabels = new Set((settings?.keywordDefinitions ?? []).filter((item) => item?.label === '基础设定').flatMap((item) => [item.label, ...(item.aliases ?? [])]).map(util_1.normalizeFact));
    return (entries ?? []).filter((entry) => {
        if (!entry?.managed || entry.locked || entry.focus) return false;
        if (protectedUids.has(String(entry.uid))) return false;
        if (entry.type === '基础设定' || (entry.keywords ?? []).some((key) => foundationLabels.has((0, util_1.normalizeFact)(key)))) return false;
        return !Object.values(entry.sections?.values ?? {}).flat().some((line) => String(line ?? '').trim());
    }).map((entry) => ({
        id: `empty-entry-cleanup|${entry.uid}`,
        kind: 'delete-entry', operation: 'delete', title: entry.title, targetUid: entry.uid,
        oldValue: entry.title, newValue: '删除', reason: '条目已无任何业务事实且不属于当前活动上下文，清理空仓储占位',
        requiresDistributionProof: false, distributionTargets: [],
    }));
}
function itemProjectsToPerson(item, holderValue) {
    const holder = (0, util_1.normalizeFact)(holderValue);
    if (!holder) return false;
    const owner = (0, util_1.normalizeFact)(entryStateValue(item, '所有权'));
    const keeper = (0, util_1.normalizeFact)(entryStateValue(item, '保管者'));
    const permission = (0, util_1.normalizeFact)(entryStateValue(item, '使用权限'));
    const text = (0, util_1.normalizeFact)(Object.values(item.sections?.values ?? {}).flat().join('；'));
    const shared = /(?:公用|公共|共享|共用|任何人|所有人|全体|合格学员|组织成员|授权人员)/u.test(`${permission}${text}`)
        || Boolean(owner && owner !== holder)
        || Boolean(keeper && keeper !== holder);
    if (!shared) return true;
    if (owner === holder || keeper === holder) return true;
    const escaped = holder.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return new RegExp(`(?:正式分配给|授予|专属(?:于)?|长期由|绑定(?:于)?|归)${escaped}|${escaped}(?:个人所有|长期保管|专属使用)`, 'u').test(text);
}
function entryStateValue(entry, label) {
    const lines = entry.sections?.values?.['当前'] ?? entry.sections?.values?.['当前状态'] ?? [];
    for (const line of lines) {
        const match = String(line).match(/^\s*([^：:]{1,24})\s*[：:]\s*(.*)$/u);
        if (!match) continue;
        if (canonicalInformationLabel(match[1], '当前') === label) return String(match[2] ?? '').trim();
    }
    return '';
}
function findEntryByName(entries, type, value) {
    const target = (0, util_1.normalizeFact)(String(value ?? '').replace(/(?:随身|手中|身上|腰间|背包中)$/u, ''));
    if (!target) return null;
    return entries.find((entry) => entry.type === type && [entry.name, ...(entry.aliases ?? []), ...(entry.keywords ?? [])]
        .some((name) => (0, util_1.normalizeFact)(name) === target)) ?? null;
}
function findContainingEntry(entries, type, value) {
    const target = (0, util_1.normalizeFact)(value);
    if (!target) return null;
    return entries
        .filter((entry) => entry.type === type)
        .sort((left, right) => (0, util_1.normalizeFact)(right.name).length - (0, util_1.normalizeFact)(left.name).length)
        .find((entry) => {
            const names = [entry.name, ...(entry.aliases ?? []), ...(entry.keywords ?? [])].map(util_1.normalizeFact).filter((name) => name.length >= 2);
            return names.some((name) => target.includes(name) || name.includes(target));
        }) ?? null;
}
function referencesObject(line, name) {
    const target = (0, util_1.normalizeFact)(name);
    const value = (0, util_1.normalizeFact)(line);
    return Boolean(target && value && (value === target || value.includes(target)));
}
function isNoneStateValue(value) {
    return /^(?:无|没有|无人|空|未持有|未使用|不适用|null|none)$/iu.test((0, util_1.normalizeFact)(value));
}

function isCollectiveItemTitle(name) {
    const text = String(name ?? '').trim();
    const normalized = (0, util_1.normalizeFact)(text);
    if (!text) return true;
    if (new Set(['物品','道具','装备','武器','工具','家具','桌椅','餐具','衣物','服装','食物','食品','药品','药物','物资','用品','器材','车辆','书籍','文件','货物','资源']).has(normalized)) return true;
    return /[、,，]|(?:若干|多个|数个|几(?:个|件|把|瓶|辆|本|枚|支|套|张)|多(?:个|件|把|瓶|辆|本|枚|支|套|张)|一批|一组|一堆|大量|成排|所有|各种|各类|同类)/u.test(text);
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
    if (/^(未发生进展)$/u.test(section))
        return 'replace-section';
    if (/^(已发生进展)$/u.test(section))
        return 'semantic-upsert';
    if (/(关键进展|事件进程|事件链|进程|过程|阶段记录|行动记录)/u.test(section))
        return 'append-chain';
    if (/^(固定事实|持续经历|近期经历|持续变化|世界变化|变化记录)$/u.test(section))
        return 'semantic-upsert';
    if (/^(已知|误信)$/u.test(section))
        return 'semantic-upsert';
    if (/(当前|状态|位置|持有者|所有者|归属|数量|完整性|可用性|阶段|当前结果|活动状态|范围|地理|组织|权力|制度|资源与交通|公开局势|持续影响)/u.test(section))
        return 'replace-by-anchor';
    if (/(完整摘要|当前总结|长期总结|对象定义|基础定义|在场|当前资源|活动关联|世界影响|局部约束|持有|参与|场景|未发生进展|结果)/u.test(section))
        return 'replace-section';
    return 'semantic-upsert';
}
function authoritativeSnapshotPolicy(type, section) {
    const key = `${String(type ?? '').trim()}|${String(section ?? '').trim()}`;
    if (/^(?:人物|角色|NPC)\|(?:当前|当前状态|持有)$/u.test(key)) return 'replace-section';
    if (/^(?:场景|地点|时空)\|(?:当前状态|在场|当前资源|活动关联)$/u.test(key)) return 'replace-section';
    if (/^(?:物品|道具|装备)\|(?:当前|当前状态)$/u.test(key)) return 'replace-section';
    return null;
}
function normalizeStateLine(section, line) {
    const labelMatch = line.match(/^\s*([^：:]{1,24})\s*[：:]\s*(.*)$/u);
    if (labelMatch) {
        const canonical = canonicalInformationLabel(labelMatch[1], section);
        return canonical ? `${canonical}：${labelMatch[2].trim()}` : line;
    }
    if (informationAnchor(line)) return line;
    const name = String(section ?? '').trim();
    const canonical = canonicalInformationLabel(name, section);
    return canonical ? `${canonical}：${line}` : line;
}
function canonicalInformationLabel(label, section = '') {
    const name = String(label ?? '').trim();
    const normalized = (0, util_1.normalizeFact)(name);
    const mappings = [
        [/^(当前位置|位置|所在地|所在地点|当前地点)$/u, '当前位置'],
        [/^(身体状态|身体情况|健康状态|伤势|受伤|身体)$/u, '身体状态'],
        [/^(当前身份|身份|职位|阵营|职业)$/u, '当前身份'],
        [/^(当前目标|目标|目的|计划)$/u, '当前目标'],
        [/^(所有权|所有者|产权方|归属方)$/u, '所有权'],
        [/^(保管者|保管方|管理者)$/u, '保管者'],
        [/^(当前持有者|持有者|携带者)$/u, '当前持有者'],
        [/^(当前使用者|使用者|操作者)$/u, '当前使用者'],
        [/^(使用权限|可使用者|授权对象)$/u, '使用权限'],
        [/^(事件状态|当前阶段|阶段)$/u, String(section).includes('阶段') || normalized.includes('阶段') ? '当前阶段' : '事件状态'],
        [/^(数量|库存|完整性|可用性|魔力|体力|生命值|金币)$/u, name],
        [/^(关系状态|态度|敌友|合作)$/u, '关系状态'],
        [/^(能力状态|技能状态)$/u, '能力状态'],
        [/^(当前状态|一般状态|状态)$/u, '当前状态'],
    ];
    return mappings.find(([pattern]) => pattern.test(normalized))?.[1] || '';
}
function informationAnchor(line) {
    const label = line.match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1]?.trim();
    if (label) {
        if (isMultiValueLabel(label)) return '';
        const canonical = canonicalInformationLabel(label);
        return `label:${(0, util_1.normalizeFact)(canonical || label)}`;
    }
    if (isMultiValueFact(line)) return '';
    const fieldPattern = /^(.{1,24}?)(?:的)?(身份|血统|种族|职业|阵营|所有权|所有者|保管者|当前持有者|持有者|当前使用者|使用者|使用权限|位置|当前位置|阶段|当前阶段|结果|当前结果|生死状态|意识状态|身体状况|身体状态|健康状态|当前目标|目标|数量|库存|等级|进度|完整性|可用性|魔力|体力|生命值|金币)(?:是|为|变为|变成|升至|降至|增至|减至|恢复至|恢复到|减少到|增加到|只剩|剩余)(.+)$/u;
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
        [/^(.{1,24}?)(?:当前)?由(.{1,24}?)持有$/u, '当前持有者'],
        [/^(.{1,24}?)(?:当前)?由(.{1,24}?)使用$/u, '当前使用者'],
        [/^(.{1,24}?)(?:当前)?由(.{1,24}?)保管$/u, '保管者'],
        [/^(.{1,24}?)(?:归|属于)(.{1,24}?)所有$/u, '所有权'],
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
    if (operation.kind === 'append-line' && operation.newValue) {
        const current = [...(values[section] ?? [])];
        const replaceAtApply = /^(当前|当前状态|关系|阶段|权力|制度|资源与交通|公开局势|持续影响)$/u.test(section);
        const anchor = replaceAtApply ? informationAnchor(operation.newValue) : '';
        const index = anchor ? current.findIndex((line) => informationAnchor(line) === anchor) : -1;
        if (index >= 0) current[index] = operation.newValue;
        else current.push(operation.newValue);
        values[section] = (0, util_1.unique)(current);
    }
    if (operation.kind === 'replace-line' && operation.newValue) {
        const previous = values[section] ?? [];
        const index = previous.findIndex((line) => line === operation.oldValue);
        if (index >= 0)
            previous[index] = operation.newValue;
        else
            previous.push(operation.newValue);
        values[section] = (0, util_1.unique)(previous);
    }
    if (operation.kind === 'delete-line' && operation.oldValue !== undefined) {
        values[section] = (values[section] ?? []).filter((line) => line !== operation.oldValue);
    }
    if (operation.kind === 'replace-section')
        values[section] = (0, util_1.unique)(String(operation.newValue ?? '').split('\n').map((line) => line.trim()).filter(Boolean));
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
        'delete-line': 'delete-line',
        'merge-keywords': 'append',
        'merge-titles': 'append',
        'merge-entry': 'merge',
        'create-entry': 'create',
        'delete-entry': 'delete',
        noop: 'no-op',
    })[kind] ?? kind;
}
},"parser":function(module,exports,require){


"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseInformationPoints = parseInformationPoints;
exports.parseExtractionWithRecovery = parseExtractionWithRecovery;
exports.canonicalExtractionType = canonicalExtractionType;
exports.parseEntrySections = parseEntrySections;
exports.serializeEntrySections = serializeEntrySections;
exports.sanitizeModelText = sanitizeModelText;
exports.sanitizeWorldbookLine = sanitizeWorldbookLine;
exports.normalizePointLine = normalizePointLine;
exports.parseLabeledSections = parseLabeledSections;
exports.stripListMarker = stripListMarker;
const util_1 = require("./util");
const information_point_1 = require("./domain/information-point");
const SECTION_PATTERN = /^\s*【\s*([^】]+?)\s*】\s*$/u;
const PLAIN_SECTION_PATTERN = /^\s*([^：:\n]{1,24})\s*[:：]\s*$/u;
const TITLE_PATTERN = /^\s*(?:#{1,6}\s*)?([^【】\n]+?[｜|丨][^【】\n]+?)\s*$/u;
const COLON_TITLE_PATTERN = /^\s*(?:#{1,6}\s*)?((?:人物|角色|NPC|事件|地点|场景|物品|道具|世界|全局|全局状态|全局变化|基础设定|基础规则|世界设定|总结))\s*[:：]\s*([^：:\n]+?)\s*$/u;
const BULLET_PATTERN = /^\s*(?:[-*]\s+|[•·]\s*|\d+、\s*|\d+[.)]\s+)(.*?)\s*$/u;
const EMPTY_PATTERN = /^\s*(?:无|无变化|无新增事实|无可记录事实|没有)\s*[。.]?\s*$/u;
const EMPTY_VALUE_PATTERN = /^\s*[^：:\n]{1,24}\s*[:：]\s*(?:无|无变化|没有|未知|未说明)\s*[。.]*\s*$/u;
const PLAIN_SECTION_NAMES = new Set([
    '身份', '稳定', '行为倾向', '性格核心', '表达方式', '决策倾向', '当前', '关系', '关系立场', '持有', '已知', '误信', '持续经历',
    '定义', '空间结构', '固定资源', '固定设施', '常驻角色', '持续变化', '当前状态', '在场', '当前资源', '活动关联', '世界影响', '局部约束',
    '功能', '限制', '目标', '参与', '附属人员', '场景', '阶段', '关键进展', '未决', '已发生进展', '未发生进展', '结果',
    '范围', '地理', '组织', '权力', '制度', '资源与交通', '公开局势', '世界变化', '持续影响',
    '世界常识', '自然规则', '种族与生命', '能力与技术', '社会规则', '地理框架', '别名',
    '固定事实', '近期经历', '事件进程', '变化记录', '最终结果', '关联条目', '关键词', '触发词', '标签', '分类',
]);
const STRICT_TYPES = new Set(['人物', '场景', '物品', '事件', '世界', '基础设定']);
// [MA-CONTROL-01] 模型控制层文本不得进入世界书。这里仅过滤插件自身的协议、任务说明和来源标记，
// 不按普通“规则/禁止”字样泛删，避免误伤真实世界设定。
const CONTROL_LINE_PATTERNS = [
    /<<<\s*(?:ENTRY|KEYWORDS|CONTENT|END[_\s-]*ENTRY)\b/iu,
    /<\/?think>/iu,
    /^```/u,
    /^(?:system|developer|assistant|user)\s*[：:]/iu,
    /^(?:你是\s*Mirror\s*Abyss|任务\s*[：:]\s*(?:以一轮完整对话|世界书|只检查候选|只处理一个)|旧世界书精简来源索引|本组来源行|候选目录|结构校验结果|请覆盖索引中的全部来源行|严格输出一个|唯一允许的外层语法|唯一输出格式|只允许六类|组ID使用\s*G1)/iu,
    /^(?:名称|归入类型|建议类型|与现有类型区别|合并来源|来源行|保留方式|并入条目|并入栏目)\s*[：:]/u,
    /^【\s*(?:新条目|内容|角色认知|过去结果|关键词|唯一输出格式|任务说明|重建规则)\s*】$/u,
    /^(?:禁止JSON、代码块|禁止解释、JSON|多个条目连续输出|每个来源行只能出现一次)/u,
];
const STRICT_SECTION_ORDER = {
    人物: ['关键词', '身份', '稳定', '行为倾向', '性格核心', '表达方式', '决策倾向', '当前', '关系', '关系立场', '持有', '已知', '误信', '固定事实', '别名'],
    场景: ['关键词', '定义', '空间结构', '固定资源', '固定设施', '常驻角色', '固定事实', '当前状态', '在场', '当前资源', '活动关联', '世界影响', '局部约束', '别名'],
    物品: ['关键词', '定义', '功能', '当前', '限制', '固定事实', '别名'],
    事件: ['关键词', '参与', '附属人员', '场景', '已发生进展', '未发生进展', '结果', '别名'],
    世界: ['关键词', '范围', '地理', '组织', '权力', '制度', '资源与交通', '公开局势', '固定事实', '持续影响', '别名'],
    基础设定: ['关键词', '世界常识', '自然规则', '种族与生命', '能力与技术', '社会规则', '地理框架', '别名'],
};
function parseExtractionWithRecovery(raw) {
    const diagnostics = { repaired: 0, merged: [], skipped: [], warnings: [], hadInput: false };
    const text = normalizeExtractionEnvelope(raw, diagnostics);
    if (/^(?:无|EMPTY)$/u.test(text.trim())) return attachDiagnostics([], diagnostics);
    diagnostics.hadInput = Boolean(text.trim());
    const starts = [...text.matchAll(/<<<ENTRY\s*[:：]\s*([^:\r\n>]+)\s*[:：]\s*([^>\r\n]+)>>>/giu)];
    if (!starts.length) {
        diagnostics.skipped.push({ title: '未知条目', reason: '缺少可识别的条目起始行（“条目”或旧 ENTRY）', raw: text.slice(0, 600) });
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
        if (!sections.length || !sections.some((section) => section.lines.length || section.empty === true)) {
            diagnostics.skipped.push({ title, reason: '正文没有可写入事实', raw: contentText.slice(0, 600) });
            continue;
        }
        parsedBlocks.push({ rawTitle: title, title, type, name, sections, keywords });
    }
    const merged = mergeDuplicateBlocks(parsedBlocks, diagnostics);
    // [MA-ITEM-01] 物品条目只允许单个可追踪实例；同类集合回收到当前场景资源。
    const collectiveNormalized = relocateCollectiveItemBlocks(merged, diagnostics);
    // [MA-ITEM-03] 普通个人附属物并入人物【持有】；普通公用物并入当前场景资源。
    // 只有具备唯一编号、独特功能、独立状态变化或跨场景追踪价值的单体物品保留独立条目。
    const normalizedBlocks = relocateDependentItemBlocks(collectiveNormalized, diagnostics);
    removeCrossEntryDuplicates(normalizedBlocks, diagnostics);
    let usable = normalizedBlocks.filter((block) => block.sections.some((section) => section.lines.length || section.empty === true));
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
function normalizeNaturalExtractionProtocol(raw, diagnostics) {
    const source = String(raw ?? '').trim();
    if (!source || /<<<\s*ENTRY\s*[:：]/iu.test(source) || /^(?:无|EMPTY)$/iu.test(source)) return source;
    const allowedTypePattern = '(?:人物|角色|NPC|场景|地点|地区|区域|场所|当前场景|物品|道具|装备|事件|事件链|世界|全局|全局状态|全局变化|世界变化|当前局势|世界局势|基础设定|基础规则|世界设定|设定)';
    const sectionNames = new Set(Object.values(STRICT_SECTION_ORDER).flat().filter((name) => name && name !== '关键词'));
    const blocks = [];
    let current = null;
    let mode = '';
    const ensureCurrent = () => {
        if (!current) current = { type: '', name: '', keywords: [], content: [] };
        return current;
    };
    const flush = () => {
        if (!current) return;
        current.type = canonicalExtractionType(current.type);
        current.name = String(current.name || '').trim().replace(/[<>\r\n]/gu, '').replace(/[：:]+/gu, '·');
        current.keywords = [...new Set((current.keywords || []).map((item) => String(item || '').trim()).filter(Boolean))];
        if (STRICT_TYPES.has(current.type) && current.name && current.content.some((line) => String(line || '').trim())) blocks.push(current);
        current = null;
        mode = '';
    };
    for (const originalLine of source
        .replace(/<think>[\s\S]*?<\/think>/giu, '')
        .replace(/```(?:text|markdown|md)?/giu, '')
        .replace(/\r/g, '')
        .split('\n')) {
        const line = String(originalLine || '').trim()
            .replace(/^#{1,6}\s*/u, '')
            .replace(/^\*\*(.*?)\*\*$/u, '$1')
            .trim();
        if (!line) continue;
        const header = line.match(new RegExp(`^(?:条目|新条目|ENTRY)(?:\\s*\\d+)?\\s*[：:]\\s*(${allowedTypePattern})\\s*[｜|丨：:]\\s*(.+?)\\s*$`, 'iu'))
            || line.match(new RegExp(`^(${allowedTypePattern})\\s*[｜|丨：:]\\s*(.+?)\\s*$`, 'iu'));
        if (header) {
            flush();
            current = { type: header[1].trim(), name: header[2].trim(), keywords: [], content: [] };
            mode = '';
            continue;
        }
        const entryTypeOnly = line.match(new RegExp(`^(?:条目|新条目|ENTRY)(?:\\s*\\d+)?\\s*[：:]\\s*(${allowedTypePattern})\\s*$`, 'iu'));
        if (entryTypeOnly) {
            flush();
            current = { type: entryTypeOnly[1].trim(), name: '', keywords: [], content: [] };
            mode = '';
            continue;
        }
        if (/^(?:条目|新条目|条目开始|开始条目)\s*[：:]?$/iu.test(line)) {
            flush();
            current = { type: '', name: '', keywords: [], content: [] };
            continue;
        }
        if (/^(?:条目结束|结束条目)\s*[。.]?$/u.test(line)) {
            flush();
            continue;
        }
        const typeLine = line.match(new RegExp(`^(?:类型|条目类型)\\s*[：:]\\s*(${allowedTypePattern})\\s*$`, 'iu'));
        if (typeLine) {
            if (current && current.type && current.name && current.content.length) flush();
            ensureCurrent().type = typeLine[1].trim();
            mode = '';
            continue;
        }
        const nameLine = line.match(/^(?:名称|稳定名称|条目名称)\s*[：:]\s*(.+?)\s*$/u);
        if (nameLine) {
            ensureCurrent().name = nameLine[1].trim();
            mode = '';
            continue;
        }
        const keywordLine = line.match(/^关键词\s*[：:]\s*(.*?)\s*$/u);
        if (keywordLine) {
            const value = keywordLine[1].trim();
            ensureCurrent();
            if (value) current.keywords.push(...value.split(/[,，、]/u).map((item) => item.trim()).filter(Boolean));
            mode = value ? '' : 'keywords';
            continue;
        }
        if (/^内容\s*[：:]?\s*$/u.test(line)) {
            ensureCurrent();
            mode = 'content';
            continue;
        }
        const bracketSection = line.match(/^【\s*([^】]+?)\s*】\s*$/u)?.[1]?.trim();
        const plainSection = line.match(/^([^：:]{1,16})\s*[：:]\s*$/u)?.[1]?.trim();
        const section = bracketSection && sectionNames.has(bracketSection)
            ? bracketSection
            : plainSection && sectionNames.has(plainSection) ? plainSection : '';
        if (section) {
            ensureCurrent().content.push(`【${section}】`);
            mode = 'content';
            continue;
        }
        if (!current) continue;
        if (mode === 'keywords') {
            current.keywords.push(...stripListMarker(line)
                .split(/[,，、]/u)
                .map((item) => item.trim())
                .filter(Boolean));
            continue;
        }
        current.content.push(line);
        mode = 'content';
    }
    flush();
    if (!blocks.length) return source;
    diagnostics.repaired += 1;
    diagnostics.warnings.push(`已将${blocks.length}个自然中文条目转换为内部 ENTRY 协议`);
    return blocks.map((block) => {
        const keywords = block.keywords.length ? block.keywords : [block.name];
        return `<<<ENTRY:${block.type}:${block.name}>>>\n<<<KEYWORDS>>>\n${keywords.map((item) => `- ${item}`).join('\n')}\n<<<CONTENT>>>\n${block.content.join('\n')}\n<<<END_ENTRY>>>`;
    }).join('\n\n');
}

function normalizeExtractionEnvelope(raw, diagnostics) {
    let text = normalizeNaturalExtractionProtocol(raw, diagnostics)
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
    return ({ 角色: '人物', NPC: '人物', 地点: '场景', 地区: '场景', 区域: '场景', 场所: '场景', 当前场景: '场景', 道具: '物品', 装备: '物品', 事件链: '事件', 全局: '世界', 全局状态: '世界', 全局变化: '世界', 世界变化: '世界', 当前局势: '世界', 世界局势: '世界', 基础规则: '基础设定', 世界设定: '基础设定', 设定: '基础设定' })[raw] ?? raw;
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
            const fallback = type === '事件' ? '已发生进展' : type === '场景' ? '当前状态' : type === '世界' ? '公开局势' : type === '基础设定' ? '世界常识' : '当前';
            aliases.set(fallback, loose);
            diagnostics.repaired += 1;
            diagnostics.warnings.push(`${title}缺少小标题，已归入【${fallback}】`);
        }
    }
    const sections = [];
    for (const name of expected.filter((item) => item !== '关键词')) {
        // 未输出的小标题不等于“明确为空”；只有模型实际给出该标题且内容为“无”时才允许清空旧快照。
        if (!aliases.has(name)) continue;
        let lines = (0, util_1.unique)((aliases.get(name) ?? [])
            .map((line) => sanitizeExtractionLine(line, type, name))
            .filter((line) => line && !EMPTY_PATTERN.test(line) && (!EMPTY_VALUE_PATTERN.test(line) || /^(当前|当前状态|公开局势|未发生进展)$/u.test(name)) && !/完整事实句|稳定名称|甲与乙/u.test(line)));
        const maxLines = sectionLineLimit(type, name);
        if (lines.length > maxLines) {
            diagnostics.repaired += lines.length - maxLines;
            diagnostics.warnings.push(`${title}【${name}】超过${maxLines}行，已保留前${maxLines}行`);
            lines = lines.slice(0, maxLines);
        }
        sections.push({ name, lines, empty: lines.length === 0 });
    }
    normalizeEpistemicSections(type, sections, diagnostics, title);
    return sections;
}
function hasExplicitMisbeliefEvidence(value) {
    return /(?:证伪依据|证伪事实|已(?:被)?证伪|已确认(?:为|是)?错误|与(?:已确认|客观|世界)事实冲突)/u.test(String(value ?? ''));
}
function normalizeEpistemicSections(type, sections, diagnostics, title) {
    if (type !== '人物') return sections;
    const mistaken = sections.find((section) => section.name === '误信');
    if (!mistaken?.lines?.length) return sections;
    let known = sections.find((section) => section.name === '已知');
    const retained = [];
    const moved = [];
    for (const line of mistaken.lines) {
        if (hasExplicitMisbeliefEvidence(line)) retained.push(line);
        else moved.push(line.replace(/\s*｜\s*认知来源\s*[：:]/u, '｜信息来源：'));
    }
    if (moved.length) {
        if (!known) {
            known = { name: '已知', lines: [], empty: false };
            const index = sections.findIndex((section) => section.name === '误信');
            sections.splice(Math.max(0, index), 0, known);
        }
        known.lines = (0, util_1.unique)([...(known.lines ?? []), ...moved]);
        known.empty = known.lines.length === 0;
        diagnostics.repaired += moved.length;
        diagnostics.warnings.push(`${title}有${moved.length}条未被明确证伪的认知，已从【误信】归入【已知】`);
    }
    mistaken.lines = retained;
    mistaken.empty = retained.length === 0;
    if (moved.length && retained.length === 0) {
        const index = sections.indexOf(mistaken);
        if (index >= 0) sections.splice(index, 1);
    }
    return sections;
}
function canonicalExtractionSection(type, value) {
    return (0, information_point_1.canonicalSectionName)(value, type);
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
    const replaceBySlot = /^(当前|当前状态|关系|范围|地理|组织|权力|制度|资源与交通|公开局势|持续影响)$/u.test(section);
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
const COLLECTIVE_ITEM_NAMES = new Set([
    '物品', '道具', '装备', '武器', '工具', '家具', '桌椅', '餐具', '衣物', '服装', '食物', '食品', '药品', '药物', '物资', '用品', '器材', '车辆', '书籍', '文件', '货物', '资源',
]);
function relocateCollectiveItemBlocks(blocks, diagnostics) {
    const scene = blocks.find((block) => block.type === '场景');
    const output = [];
    for (const block of blocks) {
        if (block.type !== '物品' || !isCollectiveItemBlock(block)) {
            output.push(block);
            continue;
        }
        const label = collectiveItemLabel(block);
        if (scene) {
            let section = scene.sections.find((item) => item.name === '当前资源');
            if (!section) {
                section = { name: '当前资源', lines: [], empty: true };
                scene.sections.push(section);
            }
            section.lines = (0, util_1.unique)([...section.lines, label]);
            section.empty = section.lines.length === 0;
            diagnostics.repaired += 1;
            diagnostics.warnings.push(`${block.title}是同类物品集合，已转入${scene.title}【当前资源】`);
        }
        else {
            diagnostics.skipped.push({ title: block.title, reason: '物品条目只允许单个可追踪实例；集合物品需要写入当前场景资源' });
        }
    }
    return output;
}
function isCollectiveItemBlock(block) {
    const name = String(block?.name ?? '').trim();
    const normalized = (0, util_1.normalizeFact)(name);
    if (!name) return true;
    if (COLLECTIVE_ITEM_NAMES.has(normalized)) return true;
    if (/[、,，]|(?:和|与|及)其他/u.test(name)) return true;
    if (/(?:若干|多个|数个|几(?:个|件|把|瓶|辆|本|枚|支|套|张)|多(?:个|件|把|瓶|辆|本|枚|支|套|张)|一批|一组|一堆|大量|成排|所有|各种|各类|同类)/u.test(name)) return true;
    if (/(?:桌椅|刀具|餐具|药品|药物|食品|食物|物资|用品|器材|家具|衣物|服装|武器|装备|工具|车辆|书籍|文件|货物|资源)$/u.test(name)
        && !/(?:的|专用|唯一|编号|号|遗失|染血|破损|封印|核心|钥匙|短剑|长剑|戒指|项链|徽章|信件|日记|手杖|王冠)$/u.test(name)) return true;
    const current = block.sections?.find((section) => section.name === '当前')?.lines ?? [];
    return current.some((line) => {
        const value = String(line ?? '').match(/^\s*数量\s*[：:]\s*(.+)$/u)?.[1] ?? '';
        if (!value) return false;
        const numeric = Number(value.match(/\d+(?:\.\d+)?/u)?.[0]);
        return (Number.isFinite(numeric) && numeric > 1) || /(?:多|数|若干|几|一批|一组|大量)/u.test(value);
    });
}
function collectiveItemLabel(block) {
    const current = block.sections?.find((section) => section.name === '当前')?.lines ?? [];
    const quantity = current.find((line) => /^\s*数量\s*[：:]/u.test(String(line ?? '')));
    return quantity ? `${block.name}（${String(quantity).replace(/^\s*数量\s*[：:]\s*/u, '').replace(/[。.]+$/u, '')}）` : block.name;
}
function relocateDependentItemBlocks(blocks, diagnostics) {
    const output = [];
    const scene = blocks.find((block) => block.type === '场景');
    const people = blocks.filter((block) => block.type === '人物');
    for (const block of blocks) {
        if (block.type !== '物品' || hasIndependentItemValue(block)) {
            output.push(block);
            continue;
        }
        const state = itemStateMap(block);
        const holder = state.get('当前持有者') || '';
        const publicItem = isPublicItemBlock(block, state);
        if (!publicItem && holder) {
            const person = people.find((candidate) => identityNameMatches(candidate, holder));
            if (person) {
                mergeReferenceSection(person, '持有', block.name);
                diagnostics.repaired += 1;
                diagnostics.warnings.push(`${block.title}没有独立追踪价值，已并入${person.title}【持有】`);
                continue;
            }
        }
        if (scene && (publicItem || !holder)) {
            mergeReferenceSection(scene, '当前资源', block.name);
            diagnostics.repaired += 1;
            diagnostics.warnings.push(`${block.title}是普通${publicItem ? '公用' : '场景'}物品，已并入${scene.title}【当前资源】`);
            continue;
        }
        output.push(block);
    }
    return output;
}
function hasIndependentItemValue(block) {
    const name = String(block?.name ?? '');
    if (/(?:唯一|编号|序列号|型号|专属|核心|封印|神器|遗物|王冠|徽章|日记|信件|契约|钥匙卡|[A-Za-z]*\d+[A-Za-z0-9-]*)/u.test(name)) return true;
    const importantSections = new Set(['功能', '限制', '固定事实']);
    if ((block.sections ?? []).some((section) => importantSections.has(section.name) && (section.lines?.length ?? 0) > 0)) return true;
    const definition = (block.sections ?? []).find((section) => section.name === '定义')?.lines ?? [];
    if (definition.some((line) => /(?:唯一|编号|序列号|型号|独特|专属|不可替代|跨场景|持续追踪|长期使用|长期携带|重要物品)/u.test(String(line)))) return true;
    const state = itemStateMap(block);
    return [...state.keys()].some((label) => /^(?:完整性|可用性|当前状态|能力状态|损坏状态|封印状态)$/u.test(label));
}
function itemStateMap(block) {
    const map = new Map();
    const lines = (block.sections ?? []).find((section) => section.name === '当前')?.lines ?? [];
    for (const line of lines) {
        const match = String(line).match(/^\s*([^：:]{1,24})\s*[：:]\s*(.*)$/u);
        if (!match) continue;
        const label = canonicalItemStateLabel(match[1]);
        if (label) map.set(label, String(match[2] ?? '').trim());
    }
    return map;
}
function canonicalItemStateLabel(value) {
    const label = (0, util_1.normalizeFact)(value);
    const mappings = [
        [/^(?:所有权|所有者|产权方|归属方)$/u, '所有权'],
        [/^(?:保管者|保管方|管理者)$/u, '保管者'],
        [/^(?:当前持有者|持有者|携带者)$/u, '当前持有者'],
        [/^(?:当前使用者|使用者|操作者)$/u, '当前使用者'],
        [/^(?:使用权限|可使用者|授权对象)$/u, '使用权限'],
        [/^(?:当前位置|位置|所在地)$/u, '当前位置'],
        [/^(?:完整性|损坏状态)$/u, '完整性'],
        [/^(?:可用性)$/u, '可用性'],
        [/^(?:当前状态|状态)$/u, '当前状态'],
        [/^(?:能力状态)$/u, '能力状态'],
        [/^(?:封印状态)$/u, '封印状态'],
    ];
    return mappings.find(([pattern]) => pattern.test(label))?.[1] || '';
}
function isPublicItemBlock(block, state) {
    const holder = (0, util_1.normalizeFact)(state.get('当前持有者') || '');
    const owner = (0, util_1.normalizeFact)(state.get('所有权') || '');
    const keeper = (0, util_1.normalizeFact)(state.get('保管者') || '');
    const permission = (0, util_1.normalizeFact)(state.get('使用权限') || '');
    const text = (0, util_1.normalizeFact)((block.sections ?? []).flatMap((section) => section.lines ?? []).join('；'));
    if (/(?:公用|公共|共享|共用|任何人|所有人|全体|合格学员|组织成员|授权人员)/u.test(`${permission}${text}`)) return true;
    if (owner && holder && owner !== holder) return true;
    if (keeper && holder && keeper !== holder) return true;
    return false;
}
function identityNameMatches(block, value) {
    const target = (0, util_1.normalizeFact)(String(value ?? '').replace(/(?:随身|手中|身上|腰间|背包中)$/u, ''));
    if (!target) return false;
    return [block.name, ...(block.keywords ?? [])].some((name) => (0, util_1.normalizeFact)(name) === target);
}
function mergeReferenceSection(block, sectionName, value) {
    let section = (block.sections ?? []).find((item) => item.name === sectionName);
    if (!section) {
        section = { name: sectionName, lines: [], empty: false };
        block.sections.push(section);
    }
    section.lines = (0, util_1.unique)([...(section.lines ?? []), value]);
    section.empty = section.lines.length === 0;
}
function removeCrossEntryDuplicates(blocks, diagnostics) {
    const owners = new Map();
    const knownNames = blocks.map((item) => ({ title: item.title, name: (0, util_1.normalizeFact)(item.name) })).filter((item) => item.name);
    for (const block of blocks) {
        for (const section of block.sections) {
            if (['关联条目', '别名'].includes(section.name)) continue;
            section.lines = section.lines.filter((line) => {
                const key = crossEntryFactKey(block, section.name, line, knownNames);
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
function crossEntryFactKey(block, sectionName, line, knownNames) {
    const normalized = (0, util_1.normalizeFact)(line);
    if (!normalized) return '';
    const explicitSubjects = knownNames.filter((item) => normalized.includes(item.name)).map((item) => item.title).sort();
    // 只有正文明确点名对象的完整事实，才允许在不同条目间竞争唯一宿主。
    // “身份：教师”“所有权：学院”这类依赖当前条目主体的槽值必须包含主体和关系。
    if (explicitSubjects.length && !/^\s*[^：:]{1,24}\s*[：:]/u.test(String(line ?? ''))) {
        return `explicit:${normalized}`;
    }
    const label = String(line ?? '').match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1] ?? '';
    return `host:${(0, util_1.normalizeTitle)(block.title)}|section:${(0, util_1.normalizeFact)(sectionName)}|label:${(0, util_1.normalizeFact)(label)}|fact:${normalized}`;
}
function factOwnershipScore(type, section, line) {
    let score = 10;
    if (type === '事件' && /(参与|已发生进展|未发生进展|关键进展|结果|因果|状态变化)/u.test(`${section}${line}`)) score += 40;
    if (type === '人物' && /(身份|稳定|性格|表达|决策|身体|位置|目标|关系|持有|已知|误信|信息来源|认知来源|经历)/u.test(`${section}${line}`)) score += 35;
    if (type === '物品' && /(持有|位置|状态|完整|功能|限制|物品)/u.test(`${section}${line}`)) score += 35;
    if (type === '场景' && /(定义|空间|资源|在场|约束|控制|环境|场景)/u.test(`${section}${line}`)) score += 38;
    if (type === '世界' && /(范围|地理|组织|权力|制度|资源|交通|公开|世界|全局|跨场景|地区)/u.test(`${section}${line}`)) score += 36;
    if (type === '基础设定' && /(常识|自然|规则|种族|生命|能力|技术|社会|地理|世界设定|基础设定)/u.test(`${section}${line}`)) score += 36;
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
function sanitizeWorldbookLine(value) {
    let line = normalizePointLine(value)
        .replace(/〔\s*来源行\s*[：:][^〕]+〕/giu, '')
        .replace(/(?:【|\[|（|\()\s*来源行\s*[：:][^】\]）)]+(?:】|\]|）|\))/giu, '')
        .replace(/\s+/gu, ' ')
        .trim();
    if (!line) return '';
    if (CONTROL_LINE_PATTERNS.some((pattern) => pattern.test(line))) return '';
    if (/(?:这是\s*Mirror\s*Abyss|以下是(?:系统|开发者|底层)提示词|不得把本提示词|本提示词只用于|模型必须使用以下格式)/iu.test(line)) return '';
    return line.replace(/\s+([，。；：])/gu, '$1').trim();
}
function sanitizeExtractionLine(value, type = '', section = '') {
    let line = sanitizeWorldbookLine(value).slice(0, 180).trim();
    if (!line) return '';
    if (/(?:供|给).{0,6}(?:AI|模型).{0,8}(?:参考|推测|判断)|(?:AI|模型)(?:可以|可|应当|应该)|可能意味着|建议后续|便于后续|用于推理|剧情建议/u.test(line)) return '';
    if (type === '事件' && /^(已发生进展|未发生进展)$/u.test(section) && isLowValueEventLine(line)) return '';
    // [MA-EPISTEMIC-02] 正常提取也必须保存角色获得信息的渠道；无来源或无认知槽的内容不进入【已知/误信】。
    if (type === '人物' && /^(已知|误信)$/u.test(section)) {
        const source = line.match(/(?:信息来源|认知来源)\s*[：:]\s*(亲眼观察|听到对白|收到消息|查看记录|他人转述|亲身经历|可靠推理|特殊能力|公开信息|自身身份|自身行动|直接告知)/u);
        const slot = line.match(/^\s*([^：:｜|]{1,24})\s*[：:]/u);
        if (!source || !slot) return '';
        line = line.replace(/认知来源\s*[：:]/u, '信息来源：');
    }
    // [MA-CHAR-01] 只机械移除明确的审美评价词；身份、能力、伤势和可识别特征仍由模型保留。
    if (type === '人物' && /^(身份|稳定|行为倾向|性格核心|表达方式|决策倾向)$/u.test(section)) {
        line = line
            .replace(/(?:绝美|倾国倾城|美若天仙|完美无瑕|惊艳绝伦|极其漂亮|非常漂亮|异常英俊|俊美无双|迷人至极|性感迷人|高贵优雅|冷艳绝伦)/gu, '')
            .replace(/[，,]{2,}/gu, '，')
            .replace(/^\s*[，,；;。.、]+|[，,；;。.、]+\s*$/gu, '')
            .trim();
        const compact = line.replace(/[^\p{L}\p{N}]/gu, '');
        if (!compact || /^(?:的)?(?:脸庞|面容|容貌|气质|身姿|外表)$/u.test(compact)) return '';
    }
    return compactExtractionLine(line, type === '人物' && /^(身份|稳定|行为倾向|性格核心|表达方式|决策倾向)$/u.test(section) ? 110 : 180);
}
function compactExtractionLine(line, limit) {
    const text = String(line ?? '').trim();
    if (text.length <= limit) return text;
    const punctuated = text.slice(0, limit + 1).match(/^(.{24,}?[。；！？!?])/u)?.[1];
    return punctuated || `${text.slice(0, Math.max(1, limit - 4)).replace(/[，、：:；;\s]+$/u, '')}…`;
}
function isLowValueEventLine(value) {
    const text = (0, util_1.normalizeFact)(value);
    if (!text) return true;
    const meaningful = /(?:同意|拒绝|决定|确认|发现|得知|获得|失去|交给|拿走|偷走|归还|受伤|死亡|击败|逃脱|暴露|驱逐|建立|解除|改变|完成|取消|终止|签署|达成|破坏|摧毁|掌握|恢复|占领|控制|释放|拘捕|背叛|承诺|公开|宣布|导致|造成|形成|救出|带走|夺取|移交|失踪|中毒|痊愈|晋升|离职|结盟|决裂)/u.test(text);
    if (meaningful) return false;
    const ordinary = /(?:走到|走向|来到|进入|离开|坐下|站起|抬头|低头|看向|望向|皱眉|微笑|点头|摇头|开门|关门|翻开|合上|拿起|放下|停下|沉默|寒暄|喝水|吃饭|敲门|转身|回头|挠头)/u.test(text);
    return ordinary && text.length <= 36;
}

function sectionLineLimit(type, section) {
    // 当前快照拥有最大输入预算；固定事实次之；稳定定义和关系类依次递减。
    if (/^(?:当前|当前状态)$/u.test(section)) return 8;
    if (type === '场景' && section === '在场') return 12;
    if (type === '场景' && section === '当前资源') return 8;
    if (type === '场景' && section === '常驻角色') return 5;
    if (type === '场景' && section === '固定设施') return 8;
    if (type === '世界' && /^(?:权力|制度|资源与交通|公开局势)$/u.test(section)) return 8;
    if (type === '基础设定') return section === '别名' ? 4 : 8;
    if (section === '固定事实') return 6;
    if (type === '人物' && section === '稳定') return 3;
    if (type === '人物' && section === '行为倾向') return 3;
    if (type === '人物' && section === '性格核心') return 4;
    if (type === '人物' && /^(?:表达方式|决策倾向)$/u.test(section)) return 3;
    if (type === '人物' && section === '关系立场') return 5;
    if (type === '人物' && section === '身份') return 4;
    if (type === '人物' && section === '已知') return 8;
    if (type === '人物' && section === '误信') return 6;
    if (type === '场景' && /^(空间结构|固定资源)$/u.test(section)) return 5;
    if (/^(关系|关系立场|持有|活动关联|局部约束|参与|持续影响)$/u.test(section)) return 5;
    if (type === '事件' && section === '附属人员') return 4;
    if (type === '事件' && section === '已发生进展') return 4;
    if (type === '事件' && section === '未发生进展') return 2;
    if (/^(定义|功能|限制|范围|地理|组织|结果|关键进展)$/u.test(section)) return 4;
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
        const inline = line.match(/^\s*【\s*([^】]+?)\s*】\s*(.+?)\s*$/u);
        if (inline) {
            current = inline[1].trim();
            if (!values[current]) {
                values[current] = [];
                order.push(current);
            }
            const inlineValues = String(inline[2] ?? '').split(/[；;]/u).map(value => value.trim()).filter(Boolean);
            for (const value of inlineValues) {
                if (!EMPTY_PATTERN.test(value)) values[current].push(normalizePointLine(value));
            }
            continue;
        }
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
exports.summaryRepairPrompts = summaryRepairPrompts;
exports.extractionRepairPrompts = extractionRepairPrompts;
exports.worldSettingImportPrompts = worldSettingImportPrompts;
exports.migrationPrompts = migrationPrompts;
exports.migrationPlanningPrompts = migrationPlanningPrompts;
exports.plannedMigrationPrompts = plannedMigrationPrompts;
exports.keywordTemplate = keywordTemplate;
const util_1 = require("./util");

function auditPrompts(settings, playerText, assistantText, optionsOrLegacyCard = {}, legacyOptions = {}) {
    const options = optionsOrLegacyCard && typeof optionsOrLegacyCard === 'object' && !Array.isArray(optionsOrLegacyCard)
        ? optionsOrLegacyCard
        : legacyOptions;
    const compact = options.compact === true;
    const dialogueContext = clipText(String(options.dialogueContext || '').trim(), compact ? 2600 : 5200);
    const system = `职责：基础正文审核。

【输入锚点】
- 审核规则：玩家明确填写的规则。
- 对话上下文：只用于理解指代、承接和已明确事实。
- 审核对象：本轮AI最终回复。

【处理路径】
1. 先读审核规则，再读最近对话和本轮玩家输入。
2. 只检查本轮AI最终回复是否明确触发审核规则。
3. 明确触发时判定“需要修正”；没有明确触发时判定“通过”。

【边界】
- 只审核当前提供的信息，不扩展到角色卡、世界书或隐藏设定。
- 最近对话只用于理解本轮，不重新审核旧消息。
- 审核阶段只给结论和问题，不改写正文。

【重要规则】
- 判定依据只能来自玩家审核规则与当前提供的对话。
- 不确定是否触发时按未触发处理，不自行扩大规则含义。

【固定输出】
- 通过时只写：审核结论：通过
- 不通过时第一行写：审核结论：需要修正
- 随后写“问题：”，再用最多8条短句指出明确触发的规则。
- 不输出分析过程、前言、后记或修正版正文。`;
    const user = `【审核规则】
${clipText(settings.auditPrompt || '（无）', compact ? 2600 : 5200)}

【最近对话】
${dialogueContext || '（无）'}

【本轮玩家输入】
${clipText(playerText || '（空）', compact ? 1800 : 3000)}

【本轮AI最终回复】
${clipText(assistantText, compact ? 10000 : 14000)}`;
    return { system, user };
}

function revisionPrompts(settings, playerText, assistantText, issues, options = {}) {
    const compact = options.compact === true;
    const dialogueContext = clipText(String(options.dialogueContext || '').trim(), compact ? 1800 : 3600);
    const issueLimit = compact ? 5 : 10;
    const issueChars = compact ? 160 : 260;
    const completenessRetry = options.completenessRetry === true;
    const retryReason = String(options.retryReason || '').trim();
    const system = `职责：按审核问题修正本轮正文，并返回可直接替换原消息的完整正文。

【输入锚点】
- 审核问题：本轮必须修正的明确问题。
- 原正文：需要被完整替换的文本。
- 最近对话与玩家输入：只用于保持承接、人物知识和事实一致。

【处理路径】
1. 定位审核指出的违规部分。
2. 只修改这些部分，保留其余有效内容、事件顺序、人物关系、叙事视角和语气。
3. 从原正文第一段重新输出到最后一段，形成完整替换文本。

【边界】
- 不续写原正文之后的内容，不新增人物、秘密、因果或新的剧情结论。
- 不全面重写与审核问题无关的合规内容。
- 不输出标签、解释、审核报告、选项或系统提示。

【重要规则】
- 除明确需要删除或改写的违规内容外，保留原正文至少85%的有效内容。
- 输出必须完整到原正文结尾，不用省略号代替剩余段落。${completenessRetry ? `\n- 上一次修正版被完整性闸门判定为疑似截断（${retryReason || '长度或结尾不完整'}）；本次重新从头输出完整正文。` : ''}

【附加修正规则】
${clipText(settings.revisionPrompt || '（无）', compact ? 1500 : 3000)}`;
    const user = `【审核问题】
${issues.slice(0, issueLimit).map((item) => `- ${clipText(item, issueChars)}`).join('\n')}

【最近对话】
${dialogueContext || '（无）'}

【本轮玩家输入】
${clipText(playerText || '（空）', compact ? 1600 : 3000)}

【需要替换的完整正文】
${clipText(assistantText, compact ? 15000 : 20000)}`;
    return { system, user };
}

function extractionPrompts(settings, playerText, assistantText, relevant, options = {}) {
    const compact = options.compact === true;
    const dialogueContext = clipText(String(options.dialogueContext || '').trim(), compact ? 1600 : 3200);
    const gameTimeEnabled = Boolean(options.currentGameTime?.label);
    const stripTimeLines = (text) => String(text ?? '').split('\n').filter((line) => !/(?:当前游戏时间|游戏时间|当前时间|时间|日期|时段)\s*(?:为|是|[：:])/u.test(line)).join('\n');
    const rawExisting = extractionWorldbookIndex(relevant, compact);
    const existing = gameTimeEnabled ? rawExisting : stripTimeLines(rawExisting);
    const custom = clipText(settings.extractionPrompt.trim(), compact ? 500 : 900);
    const schema = keywordTemplate(settings.keywordDefinitions ?? []).trim();
    const gameTimeClause = gameTimeEnabled ? `\n\n【游戏时间】\n- 【当前已知游戏时间】是本轮世界内部时间锚点。根据本轮正文中实际发生的时间流逝判断正文结束时的游戏时间。\n- 时间发生推进或正文明确了更具体的世界内时间时，在当前场景【当前状态】写“游戏时间：内容”；没有推进时不必重复输出。\n- 只根据当前时间锚点与剧情中明确发生的时间流逝推进，不引入现实时间，不补造没有依据的日期。\n- 游戏时间只进入当前场景，不复制到人物、物品、事件或世界。` : '';
    const system = `职责：世界书差异提取。对照上一轮权威世界书，只输出本轮已经发生的有效变化，并写入最直接的条目宿主候选。

【元词汇与锚点】
- 权威旧条目：上一轮已经存在且当前有效的条目。
- 本轮变化：本轮正文相对于权威旧条目新增、改变、失效、转移、完成或明确揭示的事实。
- 直接宿主：事实真正所属的人物、场景、物品、事件、世界或基础设定。
- 当前状态：此刻成立、后续可能继续变化的信息。
- 稳定事实：能够持续成立，不会因普通动作立即变化的信息。

【处理路径】
1. 先读上一轮权威世界书，再读最近对话、本轮玩家输入和本轮AI最终回复。
2. 识别本轮变化，为每条事实寻找最直接宿主。
3. 属于已有对象时，完整沿用旧类型和旧标题，只填写发生变化的栏目。
4. 同一对象的多项变化合并为一个条目；旧条目未变化内容不重复输出。
5. 没有合适旧宿主时才建立新对象。
6. 场景发生变化时，只输出正文结束时实际所在的当前场景一条，并放在第一条。

【局部边界】
- 人物：身份与正式名称写【身份】；长期能力和持久特征写【稳定】；单轮可观察行为、态度和选择写【固定事实】或对应关系栏目；位置、行动、目标、短期身体状态和持续处境写【当前】；关系、持有、认知和个人结果写对应栏目。一次行为不直接填写【行为倾向】【性格核心】【表达方式】【决策倾向】。
- 场景：固定空间、设施、资源和地点机制写稳定栏目；场景状态、在场人物、当前资源与活动关联写当前快照栏目。只输出正文结束时实际所在的当前场景一条。
- 物品：固定功能、性质与限制写稳定栏目；持有者、位置、使用状态、完整性和本轮变化写【当前】。
- 事件：记录同一因果链已经形成的阶段、进展和结果；人物、场景和物品的详细状态回到各自宿主。
- 世界：记录超出单一人物或单一场景、并会随剧情变化的区域、组织、制度、权力、资源网络和公开局势。
- 基础设定：记录跨场景成立且不随普通剧情变化的世界框架、自然规则、种族共性、能力技术和社会常识。${gameTimeClause}

【重要规则】
- 优先更新已有条目，确认没有宿主后才新建。
- 只输出本轮变化；同一事实只进入一个最直接宿主。
- 匹配旧对象后原样沿用旧类型和旧标题。
- 正式姓名、身份、外形或状态变化继续更新原人物条目。
- 单次行动、短暂情绪和临时表现停留在事实或当前状态层，不升级为稳定人格或长期规则。

【唯一输出格式】
条目
类型：人物、场景、物品、事件、世界或基础设定
名称：稳定名称
关键词：稳定名称、唯一别名
栏目名称：
- 本轮新增或变化的信息

每个条目从单独一行“条目”开始，类型、名称、关键词各写一行；栏目直接写“栏目名：”。下一条目再次写“条目”，不需要结束符。单次最多 8 条，同一对象只输出一个条目。没有世界书变化时只输出“无”。不输出 JSON、代码块、分析过程、前言或后记。

【示范】
条目
类型：人物
名称：披斗篷的商人
关键词：披斗篷的商人、伊莱
身份：
- 正式姓名：伊莱
当前：
- 位置：码头仓库

可用类型与栏目：
${schema || '使用人物、场景、物品、事件、世界、基础设定的现有栏目。'}${custom ? `\n\n【附加要求】\n${custom}` : ''}`;
    const gameTimeAnchor = gameTimeEnabled && options.currentGameTime?.label
        ? `\n\n【当前已知游戏时间】\n${String(options.currentGameTime.label)}${options.currentGameTime?.sceneTitle ? `（${String(options.currentGameTime.sceneTitle)}）` : ''}`
        : '';
    const user = `【上一轮权威世界书】
${existing || '（无）'}${gameTimeAnchor}

【最近对话】
${dialogueContext || '（无）'}

【本轮玩家输入】
${clipText(playerText || '（空）', compact ? 1100 : 1800)}

【本轮AI最终回复】
${clipText(assistantText, compact ? 8500 : 12500)}

按固定格式只填写本轮变化。`;
    return { system, user };
}

function worldSettingImportPrompts(settings, sourceText, relevant, options = {}) {
    const compact = options.compact === true;
    const contextEntries = promptContextEntries(relevant, compact ? 4 : 8);
    const existing = contextEntries.map((entry) => entryForPrompt(entry, compact ? 360 : 620)).join('\n\n');
    const schema = keywordTemplate(settings.keywordDefinitions ?? []).trim();
    const system = `职责：把玩家提交的世界设定结构化为世界书候选。

玩家已经明确点击“导入世界设定”。只把玩家粘贴的设定文档结构化为世界书候选，不处理普通聊天，不把玩家的愿望误当成剧情行动。

允许类型：基础设定、世界、场景、人物、物品、事件。

分流规则：
1. 跨场景稳定成立的自然规律、种族共性、能力技术、社会常识、长期地理框架写入【基础设定】。
2. 初始地区、组织、制度、权力、资源网络和公开局势写入【世界】。
3. 只有设定明确指定的一个实际开局地点写入【场景】；其他地点写入世界或基础设定，不批量建立场景。
4. 只为已有稳定身份、专名或唯一锚点且会持续存在的对象建立【人物】。
5. 只为需要跨场景单独追踪的唯一物品实例建立【物品】；普通装备、批量物资和泛称写入人物持有或场景/世界资源。
6. 只有文档明确说明“已经发生”或“正在发生”的过程才能建立【事件】。计划、可能、将来、希望发生、开局后再发生的内容不得建立事件。
7. 写作要求、文风、视角、输出格式、角色扮演规则、AI/玩家指令、系统提示、审核规则、提示词边界不得进入世界书。
8. 不补全未写出的设定，不创造人物、组织、地点、事件或因果。
9. 与既有条目属于同一稳定对象时复用原题，不因措辞变化重复建档。
10. 同一事实只放在一个权威宿主；禁止把整份设定复制到多个条目。

输出协议：
<<<ENTRY:类型:稳定名称>>>
<<<KEYWORDS>>>
- 稳定名称
- 唯一别名
<<<CONTENT>>>
【小标题】
- 完整事实
<<<END_ENTRY>>>

多个条目连续输出。禁止JSON、代码块、序号、解释、前言、后记和标记外文本。没有可导入事实时只输出“无”。单次最多16条。

可用类型与栏目：
${schema || '使用基础设定、世界、场景、人物、物品、事件的标准栏目。'}`;
    const sourceLimit = 24000;
    const user = `玩家主动提交的世界设定文档（唯一事实来源）：
${clipText(sourceText, sourceLimit)}

可能相关的既有世界书条目（只用于复用稳定对象和避免重复）：
${existing || '（无）'}

请生成可供玩家预览的设定条目。不要把写作要求或未来计划写成世界事实。`;
    return { system, user };
}

function summaryPrompts(kind, settings, entries, subject, recentConversation = '', options = {}) {
    const isSmall = kind === 'small';
    const compact = options.compact === true;
    const pending = new Set((options.pendingUids ?? []).map((uid) => String(uid ?? '')).filter(Boolean));
    const allEntries = Array.isArray(options.allEntries) ? options.allEntries : entries;
    const changedEntries = entries.filter((entry) => pending.has(String(entry.uid)));
    const workingEntries = changedEntries.length ? changedEntries : entries.filter((entry) => !/^总结[｜|丨]/u.test(entry.title));
    const relatedEntries = entries.filter((entry) => !workingEntries.some((changed) => changed.uid === entry.uid));
    const gameTimeEnabled = Boolean(options.currentGameTime?.label);
    const stripTimeLines = (text) => String(text ?? '').split('\n').filter((line) => !/(?:当前游戏时间|游戏时间|当前时间|时间|日期|时段)\s*(?:为|是|[：:])/u.test(line)).join('\n');
    const promptEntry = (entry, limit) => gameTimeEnabled ? entryForPrompt(entry, limit) : stripTimeLines(entryForPrompt(entry, limit));
    const rawIndex = extractionWorldbookIndex(allEntries, compact);
    const index = gameTimeEnabled ? rawIndex : stripTimeLines(rawIndex);
    const custom = clipText((isSmall ? settings.smallSummaryPrompt : settings.largeSummaryPrompt).trim(), compact ? 900 : 1800);
    const system = isSmall
        ? `职责：近期历史分发。逐个结算本期变更来源，把已经发生的事实按合适颗粒度写入直接宿主。

【元词汇与锚点】
- 来源：本期必须结算的权威条目。
- 目标：承接某条历史事实的直接宿主。
- 历史事实：已经发生并在当前结算中仍有保存价值的结果、状态或持续影响。
- 吸收：来源必要事实已完整分发，来源可以退出。
- 保留完成：来源当前仍应独立存在，本期判断已经完成。
- 行为倾向：人物近期重复行为提炼出的“倾向于如何判断、选择、表达或应对”的抽象模式。

【处理路径】
1. 逐个读取本期变更来源、相关权威条目和最近聊天。
2. 先判断来源当前是否仍需独立存在，再确定每条必要历史的直接宿主。
3. 需要分发时写明来源、目标、栏目、事实和处理；没有新事实但来源应继续存在时使用“保留完成”短格式。
4. 每个待处理来源都必须在本轮得到“吸收”或“保留完成”的确定结论。

【局部边界】
- 临时人物资格必须根据上一轮相关世界书与本轮正文语义判断，不只看标题、姓名或“临时”关键词。
- 场景只记录场景自身已经形成的事实，例如完成的核验、通行结果、设施状态、局部秩序和持续影响；人物简历、性格、完整经历和台词留在人物或事件事实层。
- 普通个人用品可沉入人物；设施、零件和地点资源可沉入场景；只服务一次事项的钥匙、证据或媒介可沉入事件或场景；独特且持续发挥作用的物品保留独立条目。
- 局部事件、已离开的小场景和旧总结容器按颗粒度分发；来源只有在必要的宏观原貌、结果、持续影响和后续运行条件完整承接后才可吸收。
- 人物本轮结束时仍成立的位置、身体状态、当前目标、身份状态等短期现状写入人物【当前】，并使用“字段：当前值”的明确状态槽；这类现状不得改写成【固定事实】。人物近期多次、同方向的行为可写入【行为倾向】；行为倾向只写抽象判断、选择、表达或应对模式，不写具体物品名、具体场景名、单次动作或一次性事件细节；小总结不直接固化【性格核心】【表达方式】【决策倾向】。

【重要规则】
- 同一来源可以分发到多个直接宿主，但同一来源的处理值必须一致。
- “吸收”必须覆盖来源全部仍有价值的事实；无法完整覆盖、仍在运行、证据不足、当前场景或受保护时选择“保留完成”。
- 历史事实只写已经发生的内容，不写未来计划、推测、UID或解释。
- 每个待处理来源都必须结算；禁止输出“无”，禁止遗漏来源。

【唯一输出格式】
总结｜当前事件

【历史分发】
- 来源：人物｜来源稳定名称；目标：场景｜目标稳定名称；栏目：固定事实；事实：只属于该场景的已发生结果；处理：吸收
- 来源：物品｜来源稳定名称；目标：人物｜目标稳定名称；栏目：持有；事实：人物当前持有该普通用品；处理：吸收
- 来源：事件｜来源稳定名称；目标：事件｜目标稳定名称；栏目：已发生进展；事实：粗化后的阶段历史；处理：吸收
- 来源：人物｜来源稳定名称；目标：人物｜同一稳定名称；栏目：当前；事实：身体状态：受伤但意识清醒；处理：保留完成
- 来源：人物｜来源稳定名称；目标：人物｜同一稳定名称；栏目：行为倾向；事实：倾向于在压力下优先保护他人；处理：保留完成
- 来源：人物｜仍需独立存在的来源；处理：保留完成

每条必须单行。带事实时固定顺序为“来源；目标；栏目；事实；处理”；无新事实的保留完成使用“来源；处理”。来源必须逐字复制【本次必须逐字复制的来源标题】中的完整标题。不要给标题或栏目增加 Markdown 粗体、编号或额外层级。${custom ? `\n\n【附加要求】\n${custom}` : ''}`
        : `职责：长期历史分发。逐个结算经过小总结整理的来源，把长期有效内容继续抽象并写入长期宿主。

【元词汇与锚点】
- 来源：本期必须结算的中层权威条目。
- 长期宿主：人物、事件、场景、地区、组织、世界或基础设定中的直接承接对象。
- 长期事实：跨阶段持续成立、已经形成结果或明确永久成立的内容。
- 吸收：来源长期必要事实已完整分发，来源可以退出。
- 保留完成：来源仍需独立存在，本期判断已经完成。
- 行为倾向：小总结已经提炼出的抽象行为模式，是性格抽象的直接证据层。

【处理路径】
1. 逐个读取本期来源和相关权威条目。
2. 把过程压缩为长期性质、结果、持续影响或稳定人物模式。
3. 人物已有【行为倾向】且尚无稳定性格栏目时，继续抽象到【性格核心】【表达方式】或【决策倾向】至少一项。
4. 每个待处理来源都必须在本轮得到“吸收”或“保留完成”的确定结论。

【局部边界】
- 事件保留宏观性质、参与范围、最终结果和持续影响，过程流水停留在较低层。
- 已离开场景保留永久结构、设施、资源和长期影响；更宽宿主完整承接后可吸收低层场景壳。
- 【行为倾向】本身就是重复行为提炼后的证据，不要求额外场景锚点或重复动作明细；稳定倾向继续抽象为【性格核心】【表达方式】或【决策倾向】。长期稳定的人际关系写【关系】或【关系立场】；已经结束、只具历史意义的个人经历才写【固定事实】。一次行为、一次情绪或角色自述不直接固化性格；大总结不把短期【当前】状态固化为人格。
- 普通物品在长期归属、消耗、毁坏或历史作用被直接宿主承接后可以退出；独特、持续发挥作用或仍需追踪状态的物品保留。
- 旧总结容器中的历史逐条进入直接宿主，完整分发后可以吸收旧容器。

【重要规则】
- 历史必须按颗粒度完成层级拓宽，不只叠加一层重复摘要。
- 同一来源可分发到多个长期宿主，但同一来源处理值必须一致。
- “吸收”必须完整覆盖来源仍有长期价值的宏观原貌、结果与持续影响。
- 只写长期有效事实，不写当前短期状态、未发生事项、未来目标、推测、UID或解释。
- 每个待处理来源都必须结算；禁止输出“无”，禁止遗漏来源。

【唯一输出格式】
总结｜世界历史

【历史分发】
- 来源：事件｜来源稳定名称；目标：世界｜目标稳定名称；栏目：固定事实；事实：高密度历史结果；处理：吸收
- 来源：场景｜来源稳定名称；目标：世界｜目标稳定名称；栏目：持续影响；事实：跨场景仍成立的长期影响；处理：吸收
- 来源：人物｜来源稳定名称；目标：人物｜同一稳定名称；栏目：性格核心；事实：由已有行为倾向抽象出的长期人格结论；处理：保留完成
- 来源：人物｜来源稳定名称；目标：人物｜同一稳定名称；栏目：关系立场；事实：关系对象：长期保持警惕但愿意合作；处理：保留完成
- 来源：人物｜仍需独立存在的来源；处理：保留完成

每条必须单行。带事实时固定顺序为“来源；目标；栏目；事实；处理”；无新事实的保留完成使用“来源；处理”。来源必须逐字复制【本次必须逐字复制的来源标题】中的完整标题。不要给标题或栏目增加 Markdown 粗体、编号或额外层级。${custom ? `\n\n【附加要求】\n${custom}` : ''}`;
    const changedLabel = isSmall ? '本期实际变更条目' : '本期小总结后实际变更的运行条目';
    const recent = isSmall ? `\n\n【最近聊天】\n${clipText(recentConversation || '（无）', compact ? 7000 : 11000)}` : '';
    const user = `【处理范围】
${subject || (isSmall ? '近期世界书变更整理' : '长期世界结构固化')}

【${changedLabel}】
${workingEntries.map((entry) => promptEntry(entry, compact ? 560 : 920)).join('\n\n') || '（无）'}

【本次必须逐字复制的来源标题】
${workingEntries.map((entry) => `- ${entry.title}`).join('\n') || '（无）'}

【上一轮权威世界书轻量索引】
${index || '（无）'}

【直接关联条目】
${relatedEntries.slice(0, compact ? 8 : 18).map((entry) => promptEntry(entry, compact ? 420 : 680)).join('\n\n') || '（无）'}${recent}

按固定格式逐来源结算。`;
    return { system, user };
}

function summaryRepairPrompts(raw, kind, pendingSources = [], reason = '', options = {}) {
    const compact = options.compact === true;
    const isSmall = kind !== 'large';
    const title = isSmall ? '总结｜当前事件' : '总结｜世界历史';
    const expected = (pendingSources ?? []).map((value) => String(value ?? '').trim()).filter(Boolean);
    const system = `职责：把已有总结返回整理成固定协议格式。

你只负责把“已有模型返回”整理成固定协议格式。不得阅读原剧情，不得新增、删除、改写、压缩、扩写、推测或重新判断任何来源、目标、栏目、事实与处理结论。

固定格式：
${title}

【历史分发】
- 来源：类型｜稳定名称；目标：类型｜稳定名称；栏目：栏目名称；事实：原文已有完整事实；处理：吸收或保留完成
- 来源：类型｜稳定名称；处理：保留完成

格式纪律：
1. 标题必须逐字写为“${title}”，栏目必须逐字写为“【历史分发】”。
2. 每条记录必须单行；字段顺序固定为“来源；目标；栏目；事实；处理”，短格式固定为“来源；处理”。
3. 只允许把中文或英文冒号、分号、换行和 Markdown 列表归一化；不得改变语义内容。
4. 原文没有明确处理结论的来源不得擅自补成“保留完成”；原文缺少来源、目标、栏目或事实时不得猜测。
5. 禁止解释、前言、后记、JSON、代码块与“无”。`;
    const user = `原返回未通过固定格式校验：${clipText(reason || '格式无法识别', 800)}

本次必须覆盖的来源（仅用于核对；不得据此生成原文没有的结论）：
${expected.length ? expected.map((item) => `- ${item}`).join('\n') : '（无）'}

需要仅做格式修复的原返回：
${clipText(String(raw ?? ''), compact ? 9000 : 14000)}`;
    return { system, user };
}

function extractionRepairPrompts(raw, options = {}) {
    const compact = options.compact === true;
    const system = `职责：把已有提取返回整理成固定条目格式。
只修复给定提取结果的语法、重复条目和事实归属，不得阅读原剧情，不得新增、扩写或推测事实。
每个条目使用以下自然中文格式：
条目
类型：人物、场景、物品、事件、世界或基础设定
名称：稳定名称
关键词：稳定名称、唯一别名
栏目名称：
- 已有事实
下一条目再次从单独一行“条目”开始，不需要结束符。
允许类型：人物、场景、物品、事件、世界、基础设定。关系必须并入人物，地点必须并入场景；可变化的全局状态写入世界，不随普通剧情变化的框架写入基础设定。
同名条目必须合并；同一事实只能保留在责任最直接的一个条目中；无法修复的片段删除。
禁止解释、JSON和代码块。没有可保留条目时只输出“无”。`;
    const user = `需要修复的提取结果：
${clipText(String(raw ?? ''), compact ? 8000 : 12000)}`;
    return { system, user };
}

function migrationPrompts(records, catalog, options = {}) {
    const batchIndex = Math.max(1, Number(options.batchIndex || 1));
    const batchCount = Math.max(1, Number(options.batchCount || 1));
    const totalRecords = Math.max(0, Number(options.totalRecords || records.length || 0));
    const catalogBudget = Math.max(800, Number(options.catalogBudget || 1800));
    const phase = String(options.phase || 'entity');
    const clusterId = String(options.clusterId || '');
    const stableName = String(options.stableName || '');
    const priorContext = String(options.priorContext || '').trim();
    const preferredType = String(records?.outputType || '').trim();
    const schema = options.schema;
    const typeCatalog = migrationTypeCatalog(schema);
    const preferred = preferredType ? `\n本批旧条目当前归类为“${preferredType}”，这只是优先参考，不是必须沿用；若其他已有类型更准确，应直接归入该已有类型。` : '';
    const phaseInstructions = ({
        entity: `【本轮：对象重建】\n当前请求可包含一个或多个完整语义簇；同一 cluster 是同一候选对象，不同 cluster 不得仅因同批出现而合并。本轮主要处理人物、场景、物品、世界对象和已有自定义类型。`,
        event: `【本轮：事件重建】\n按完整因果链收束同一事件。标题不同但参与者、稳定场景、状态变化和结果属于同一件事时，应合并成一个条目。只保留【参与】【场景】【已发生进展】【未发生进展】【结果】【别名】；普通动作过滤，旧目标、未决、计划和阶段标签不得写入新条目。`,
        custom: `【本轮：通用条目重建】${preferred}\n先判断能否归入现有类型。不要因为旧标题使用某个类型就机械沿用，也不要创建该类型的近义词。`,
        organization: `【本轮：通用条目重建】${preferred}\n组织只是可能的现有或自定义类型之一；先匹配现有类型，不得把其他内容强行改成组织。`,
        world: `【本轮：世界全局收束】\n本轮统一处理现有世界条目中的地区、组织、权力、制度、资源交通和公开局势，并纠正被误放进世界条目的具体人物、场景、物品或基础规则。不要按同一事实的不同观察角度重复建档；优先归入已有类型和稳定专名，只有确实无法归类时才提出新类型；禁止用“世界”“世界状态”“全局”“公开局势”等泛化词作为唯一标题。`,
        region: `【本轮：地区规则】\n把地区证据归入现有“世界”类型，提炼该地区特有的地理、制度、资源交通、公开局势和持续影响。`,
        foundation: `【本轮：世界基础设定】\n把跨地区、跨组织长期成立的规则归入现有“基础设定”类型。局部制度和单次事件不得升级为基础规则。`,
    })[phase] || '';
    const allowProposal = !['event', 'region', 'foundation'].includes(phase);
    const system = `职责：按当前重建阶段把旧世界书材料收束为候选条目。\n\n${phaseInstructions}

【现有类型】
${typeCatalog}

【分类原则】
1. 每个新条目先从上面的现有类型中选择一个最合适的“归入类型”。
2. 人物、角色、NPC、人物档案属于同一类型；地点、地区、区域属于同一类型；道具、装备、物件属于同一类型；任务与持续事件属于事件。禁止创建这些近义重复类型。
3. ${allowProposal ? '只有所有现有类型都无法合理容纳，而且该类别可以反复用于多个对象时，才写“归入类型：新类型建议”，并填写简短的“建议类型”和“与现有类型区别”。' : '本轮禁止提出新类型，必须归入本轮指定的现有类型。'}
4. 类型是稳定类别，不是具体条目名称。不得把“月誓”“人鱼村”“北境议会”这类专名当成类型。
5. 只写材料中明确存在的内容；没有内容的部分不要输出，不要为了填格式而补全。
6. 【内容】中的每行使用“栏目：事实”，栏目名称应简短、通用；同一含义不要建立多个相似栏目。
7. 当前已经成立的事实写在【内容】；已经发生的经过和结果写在【过去结果】，使用过去时。事件条目禁止输出目标、未决、计划、下一步、阶段标签或尚未发生的内容；事件过程应压缩为已发生的状态变化，普通动作不得独立保留。
8. 角色只能知道自己通过信息来源获得的内容。人物条目的【角色认知】必须写“人物｜知道/误以为/怀疑：内容｜来源：获得方式”。
9. “合并来源”必须填写该新条目使用的全部旧UID，它同时作为整个条目的默认证据。
10. 某一行只使用部分来源或需要特别说明时，才在行末补充〔证据:UID〕；不必在每一行机械重复全部UID。没有合并来源且没有行内证据的内容会被插件丢弃。
11. 同一对象存在不同解释时，区分世界事实、人物已知、人物误信和不同时间，不得按最后一条或多数表述强行覆盖。
12. 真身、本体、假身、分身、替身、伪装体、复制体、投影体和被冒充者是不同对象形态；“A伪装成B”不能据此把A与B合并。只有正文明确说明两个称呼只是同一对象的名称或真实身份，且不存在独立身体时，才可合并。
13. 重建的目标是收束，不是逐条翻写。描述同一件事的同类型来源必须生成一个条目；只承担某条规则、制度、地区设定或其他主体功能的从属对象，不应保留独立条目。
14. 同一事实只能保留一个权威宿主；标题、栏目名和事实正文不得只是同义重复。不要输出“世界｜世界”“公开局势：公开局势”这类空壳内容。
15. 若某对象仍需独立检索，填写“保留方式：独立条目”；若它只是其他条目的附属说明，填写“保留方式：并入其他条目”，并给出“并入条目”和“并入栏目”。
16. 场景条目只代表一个稳定地点；若旧条目混入决斗台、酒馆、遗迹入口等不同地点，必须拆成不同场景。别名只能是同一地点的称呼，不能把其他地点名称当别名。
17. 不输出空栏目，不写“无”，不解释处理过程。

【唯一输出格式】
【新条目】
名称：稳定名称
归入类型：从现有类型中填写一个
别名：仅在有证据时填写
合并来源：旧UID1、旧UID2
保留方式：独立条目

【内容】
- 栏目：明确事实

【角色认知】
- 人物名称｜知道：内容｜来源：亲眼观察/听到对白/收到消息/查看记录/他人转述/亲身经历/可靠推理/特殊能力/公开信息/自身身份/自身行动/直接告知
- 人物名称｜误以为：内容｜来源：信息来源

【过去结果】
- 已经发生并结束的结果

【关键词】
- 稳定名称或别名

从属内容改用以下头部，不再单独保留：
保留方式：并入其他条目
并入条目：类型｜稳定名称
并入栏目：目标条目的栏目名称

没有内容的区块直接省略。多个条目重复以上格式。${allowProposal ? `确实无法归入现有类型时，将头部改为：
归入类型：新类型建议
建议类型：稳定类别名称
与现有类型区别：一句话说明为什么现有类型不能容纳` : ''}

禁止JSON、代码块、前言、后记和思考过程。没有可重建内容时只输出“无”。`;
    const body = records.map((record) => {
        const part = Number(record.fragmentCount || 0) > 1 ? ` part=${record.fragmentIndex}/${record.fragmentCount}` : '';
        const recordCluster = record.semanticClusterId ? ` cluster=${record.semanticClusterId}` : clusterId ? ` cluster=${clusterId}` : '';
        const clusterName = record.semanticClusterName ? `\n对象簇：${record.semanticClusterName}` : '';
        return `<<<SOURCE uid=${record.uid}${part}${recordCluster}>>>\n标题：${record.title}${clusterName}\n关键词：${record.keywords.join('、') || '无'}\n正文：\n${record.content || '（空）'}\n<<<END_SOURCE>>>`;
    }).join('\n\n');
    const prior = priorContext ? `\n\n前序轮候选（只用于名称、关系和层级对齐，不能代替本批UID证据）：\n${clipText(priorContext, 2600)}` : '';
    const user = `这是世界书重建第 ${batchIndex}/${batchCount} 个串行任务；当前阶段：${phase}；语义簇：${clusterId || '未标记'}；建议稳定名称：${stableName || '由证据确定'}；整本旧表共有${totalRecords}个镜渊条目。\n\n旧条目目录（仅用于稳定命名和避免重复类型，不能作为事实证据）：\n${clipText(catalog, catalogBudget)}${prior}\n\n本批原始条目：\n${clipText(body, 7600)}\n\n按通用“新条目”格式输出。先决定最终语义归属：同一件事只建立一个条目，从属内容并入其真正所属的规则、地区、事件或对象；再选择现有类型，确实无法容纳时才提出不重叠的新类型建议。`;
    return { system, user };
}

// [MA-REBUILD-11] 第一阶段只规划归属，不改写正文。索引中的每个来源行必须只出现一次：
// 归入一个候选组，或明确丢弃。这样后续模型请求不会重复解释同一条旧事实。
function migrationPlanningPrompts(sourceIndex, options = {}) {
    const schema = options.schema;
    const typeCatalog = migrationTypeCatalog(schema);
    const system = `职责：规划旧世界书来源行的唯一场景锚点与最终归属。

你只规划旧世界书来源行的最终归属，不重写事实，不生成世界书正文。

【现有类型】
${typeCatalog}

【规划规则】
1. 每个来源行引用只能出现一次：归入一个 GROUP，或进入 DROP。禁止把同一来源行投影到人物、事件、世界等多个组。
2. 先为全部来源行建立最小场景锚点。一个锚点表示同一段连续世界时间与同一稳定地点；相同地点在不同日期、时段或事件阶段必须拆成不同锚点。索引中的“已有时空”是上次重建元数据：没有更强的新证据时优先沿用，但不要把它重复写成剧情事实。
3. 游戏时间只使用材料明确给出的日期、时段、相对时间或可由前后文可靠推定的时间。不得为了完整而虚构日期；无法判断时填写“未知”。
4. 时间来源只允许“明确、推定、未知”。明确是正文直接给出；推定是由“次日、当晚、三天后”等关系确定；没有依据时为未知。
5. 同一稳定对象的来源行归入同一组；不同对象不得因名称相似、同批出现或共享地点而合并。
6. 真身、本体、假身、替身、分身、复制体、投影体、载体是不同身份形态。只有材料明确说明两个称呼是同一独立身体的名称时才合并。
7. 一个事件组对应一条连续的状态变化链。参与者、稳定场景和直接因果连续时，即使动作、段落、标题或地点局部位置变化，也应归入同组；只有变化对象或直接因果明显独立时才分组。普通移动、开门、落座、视线、表情和寒暄不得单独形成事件组。
8. 场景组只对应一个稳定地点。酒馆、决斗台、遗迹入口等不同空间不得互为别名。
9. 世界组只保存跨场景的制度、组织格局、区域网络和公开局势；人物经历、单个物品状态、单场事件不得归入世界组。
10. 基础设定组只保存跨普通剧情长期成立的规则。单次行为不得升级为规则；只有明确约定、制度、条件约束，或多个不同场景反复证明的机制，才可归入规则宿主。
11. 普通随身消耗品、无独立状态的小道具可归入人物组；简单公共设施可归入场景组；唯一、关键、有功能限制或独立状态的物品保留物品组。
12. 标题相同但内容属于不同实体时必须分组并使用区分锚点，例如“绯（真身）”“绯（残留替身）”。
13. 无正文、纯格式残留、标题复述、同义重复、过程性复述和无长期价值的句子进入 DROP；同一事实只保留一份最小表达。

【唯一输出格式】
ANCHOR|锚点ID|游戏时间|地点|明确/推定/未知|来源行1,来源行2,...
GROUP|组ID|类型或新类型建议:类别名|稳定名称|独立/并入|来源行1,来源行2,...
DROP|简短原因|来源行1,来源行2,...

锚点ID使用 A1、A2……，ANCHOR行必须按游戏时间从早到晚排列；时间无法比较时按剧情叙述先后排列。组ID使用 G1、G2……。每个非DROP来源行必须同时出现在一个ANCHOR和一个GROUP中。优先使用现有类型。只有现有类型都无法容纳且该类别可反复用于多个对象时，才使用“新类型建议:类别名”。若“并入”，稳定名称填写真正宿主名称。
禁止解释、JSON、代码块、Markdown标题或其他文本。`;
    const user = `旧世界书精简来源索引：
${String(sourceIndex || '').trim() || '（空）'}

请覆盖索引中的全部来源行。每个来源行只能出现一次。`;
    return { system, user };
}

// [MA-REBUILD-11] 第二阶段按容量联合处理多个规划组。
// 每个组只携带自己的来源行，但同一次请求可以比较相邻候选，减少碎片化和调用次数。
function plannedMigrationPrompts(task, options = {}) {
    const schema = options.schema;
    const jointGroups = Array.isArray(task?.jointGroups) && task.jointGroups.length ? task.jointGroups : null;
    const groups = jointGroups ?? [{
        id: task?.planGroupId || 'G1',
        type: String(task?.outputType || '').trim(),
        name: String(task?.stableName || '').trim(),
        newTypeProposal: task?.newTypeProposal === true,
        sourceRefs: [...(task?.sourceRefs ?? [])],
        sceneAnchors: [...(task?.sceneAnchors ?? [])],
        anchorCatalog: [...(task?.anchorCatalog ?? [])],
        sourceLineBody: String(task?.sourceLineBody || '').trim(),
    }];
    const descriptors = groups.map((group) => {
        const allowed = [...(schema?.allowedSectionsByType?.[group.type] ?? [])].filter((section) => section && section !== '时空锚点');
        const anchorText = (group.anchorCatalog ?? []).map((anchor) => `${anchor.id}=${anchor.gameTime}@${anchor.location}[${anchor.timeSource}]`).join('、') || (group.sceneAnchors ?? []).join('、') || 'S000=未知@未知[未知]';
        return `- 组${group.id}｜类型：${group.newTypeProposal ? `新类型建议:${group.type}` : group.type}｜稳定名称：${group.name}｜允许栏目：${allowed.join('、') || '使用该类型现有栏目'}｜场景锚点：${anchorText}｜来源行：${group.sourceRefs.join('、')}`;
    }).join('\n');
    const system = `职责：按既定分组联合重建世界书候选条目。

本次同时处理${groups.length}个已经完成全局规划的候选组：
${descriptors}

总规则：
1. 每个组只能使用该组列出的来源行；不得在组之间借用证据，不得引用常识或自行补全。
2. 每组最多输出一个最终条目。只有来源确实没有有效事实时可以省略该组。
3. 提炼不是改写旧句。先删除同义重复、包含式重复、过程性复述和低价值措辞，再只保留最小事实集、当前有效状态、完成结果与真正可运行的规则。
4. 场景只代表稳定地点。房门口、床边、桌旁、拐角、区域内移动等并入主体场景的【空间结构】或事件材料，不得单独建场景。
5. 同一地点的名称改写必须归入稳定名称，并把其他真实称呼写入【别名】；不得因模型改名制造新地点。
6. 每个条目必须选择本组已有的场景锚点，并填写游戏时间、时间来源和时态。禁止自造锚点或日期。跨多个锚点时按剧情先后列出，首个填写主要发生或首次成立的锚点。
7. 时态只允许“当前、持续、已完成、已结束、长期”：
   - 当前：在最新锚点仍然成立；
   - 持续：从较早锚点开始，最新材料没有结束；
   - 已完成：行为或事件已经形成结果；
   - 已结束：旧状态已经被后续状态解除或取代；
   - 长期：跨场景稳定成立的制度、机制或规则。
   已离开的场景、结束的行为和被解除的状态必须使用过去时或完成态，不得继续写进人物【当前】、场景【当前状态/在场/当前资源】或物品【当前】。
8. 事件只保存已经发生的变化：
   - 【已发生进展】保存造成状态、关系、资源、控制、能力或直接因果变化的事实；最多4行。
   - 【未发生进展】保存已经发生但没有造成状态变化、且仍有必要解释连续性的材料；不是未来目标、未决事项或计划；最多2行。
   - 【结果】只写已经形成的稳定结果。
   - 目标、待办、未决、下一步、可能和预测不得写回事件。
9. 普通移动、开门、落座、视线、表情、寒暄和当轮恢复的小变化直接过滤；若它是结果不可缺少的直接因果证据，可吸收到一条进展中。
10. 运行规则必须写成“条件/触发—执行或约束—结果或持续范围”。只有来源明确陈述规则、制度、约定或限制，或者至少两个不同场景锚点反复证明相同机制时，才可抽取规则。单次照顾、单次选择、一次偶发反应不得升级为长期规则。
11. 规则必须归入真正宿主：跨世界自然与社会机制归入基础设定；地区制度与组织运行归入世界；地点内规则归入场景【局部约束】；物品机制归入物品【功能/限制】；人物之间明确持续约定归入人物【关系/稳定】。不要仅因出现“规则”二字创建空泛条目。
12. 人物、物品、场景、事件、世界和基础设定各自只保存其权威事实，禁止换角度重复同一句历史。
13. 同一状态槽存在多值时，根据场景锚点与游戏时间保留最终值；无法确认时保留明确冲突，不得猜测。
14. 物品所有权、保管者、当前持有者、当前使用者、使用权限、位置和完整性必须分开。
15. 每条事实必须带本组来源行引用；一条提炼后的事实可以承接多条重复来源，但必须列出被吸收的全部来源行。条目头部“合并来源”必须列出所用旧UID。
16. 不得把提示词、任务说明、来源行协议、输出模板、系统或开发者消息写入正文。
17. 角色只能知道自己通过信息来源获得的内容。世界事实不等于所有角色已知；私密想法只属于本人，未公开远处事件不得写进其他人物认知。
18. 【角色认知】必须写明知道、怀疑、认为或误信及获得方式；没有明确渠道时省略，不得用全知视角补齐。

【每个组的唯一输出格式】
【新条目】
组ID：G1
名称：稳定名称
归入类型：现有类型或新类型建议
合并来源：旧UID1、旧UID2
来源行：来源行1、来源行2
场景锚点：S001、S002
游戏时间：使用所选锚点的游戏时间；跨锚点时写起止范围
时间来源：明确/推定/未知
时态：当前/持续/已完成/已结束/长期
保留方式：独立条目

【内容】
- 栏目：明确事实〔来源行:来源行1,来源行2〕

【角色认知】
- 人物名称｜知道/怀疑/认为：内容｜来源：允许的信息来源〔来源行:来源行1〕
- 人物名称｜误信：错误内容｜来源：允许的信息来源｜证伪：已确认事实〔来源行:来源行1,来源行2〕

【过去结果】
- 已经形成且仍有独立长期价值的最终结果〔来源行:来源行1〕

【关键词】
- 稳定名称

多个组连续输出多个【新条目】。组ID、名称和归入类型必须与上方候选组一致。没有内容的区块省略。禁止JSON、代码块、解释、前言和后记。`;
    const body = groups.map((group) => `===GROUP ${group.id}|${group.type}|${group.name}===\n${group.sourceLineBody || '（空）'}`).join('\n\n');
    const user = `本批候选组与来源行：
${body}

按组逐一输出。不要把一个组拆成多个条目；若两个事件组显然属于同一条状态变化链，应使用一致的稳定名称和等价内容，供插件在全局收束阶段确定性合并。不同对象或不同因果链不得强行合并。`;
    return { system, user };
}

function migrationTypeCatalog(schema) {
    const purpose = {
        人物: '单个可识别角色及其当前状态、关系和个人认知',
        场景: '地点、地区、区域及其空间和局部规则',
        物品: '单个可追踪道具、装备或物件',
        事件: '由参与者、稳定场景和直接因果连续形成的状态变化记录',
        世界: '跨场景的地区局势、组织格局、制度和资源网络',
        基础设定: '长期稳定的自然、种族、能力、社会与地理规则',
    };
    const definitions = [...(schema?.definitions?.values?.() ?? [])].filter((definition) => definition?.enabled !== false);
    return definitions.map((definition) => {
        const aliases = (definition.aliases ?? []).filter((alias) => alias !== definition.label);
        const description = String(definition.description || purpose[definition.label] || '当前世界书已经存在的自定义类型').trim();
        return `- ${definition.label}：${description}${aliases.length ? `；已有别名：${aliases.join('、')}` : ''}`;
    }).join('\n') || '- 当前没有可用类型';
}

function keywordTemplate(definitions) {
    return definitions.filter((item) => item.enabled).map((item) => {
        const aliases = item.aliases.length ? `；近义标签：${item.aliases.join('、')}` : '';
        const fields = item.fields.map((field) => `- 【${field.label}】`).join('\n');
        return `类型：${item.label}${aliases}\n用途：${item.description}\n${fields || '- 使用合适的小标题'}`;
    }).join('\n\n');
}

function extractionWorldbookIndex(entries, compact = false) {
    const allowed = new Set(['人物', '场景', '物品', '事件', '世界', '基础设定']);
    const source = (entries ?? []).filter((entry) => allowed.has(String(entry?.type ?? '').trim()));
    if (!source.length) return '';
    const totalBudget = compact ? 7800 : 13800;
    const fixedCost = source.reduce((sum, entry) => {
        const keywords = (entry.keywords ?? []).filter((item) => !(0, util_1.isUidKeyword)(item)).slice(0, compact ? 3 : 5);
        return sum + String(entry.title ?? '').length + keywords.join('、').length + 22;
    }, 0);
    const contentBudget = Math.max(source.length * 70, totalBudget - fixedCost);
    const perEntry = Math.max(70, Math.min(compact ? 210 : 360, Math.floor(contentBudget / source.length)));
    return source.map((entry) => entryForPrompt(entry, perEntry)).join('\n\n');
}

function promptContextEntries(relevant, limit) {
    const globals = relevant.filter((entry) => /^(基础设定|世界)$/u.test(String(entry?.type ?? '')));
    const ordinary = relevant.filter((entry) => !/^(基础设定|世界)$/u.test(String(entry?.type ?? '')));
    const reservedCount = limit >= 5 ? Math.min(2, globals.length) : Math.min(1, globals.length);
    return [...ordinary.slice(0, Math.max(0, limit - reservedCount)), ...globals.slice(0, reservedCount)].slice(0, limit);
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
    '关系', '男人', '女人', '男孩', '女孩', '少女', '房间', '区域', '地方', '目标', '任务', '规则', '设定', '未知', '无', '当前局势', '世界局势', '世界状态', '世界变化',
]);

function isSceneType(type) {
    return ['场景', '时空'].includes(String(type ?? '').trim());
}
function isWorldType(type) {
    return ['世界', '全局', '全局状态', '全局变化', '当前局势', '世界局势'].includes(String(type ?? '').trim());
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
        .filter((entry) => entry?.managed && isSceneType(entry.type) && !entry.activation?.disabled);
    // 只有正文提取明确刷新过 sceneLastActiveAt 的场景，才有资格成为当前/上一场景。
    // 小总结、大总结和手工编辑创建或更新的大场景属于仓库宿主，不能仅因 updatedAt 较新而抢占当前场景。
    const explicitlyActive = scenes.filter((entry) => sceneExplicitActivityTime(entry) > 0);
    const ranked = (explicitlyActive.length ? explicitlyActive : scenes)
        .slice()
        .sort((left, right) => sceneActivityTime(right) - sceneActivityTime(left)
            || Number(right.updatedAt || 0) - Number(left.updatedAt || 0)
            || String(left.title || '').localeCompare(String(right.title || '')));
    const currentUid = ranked[0] ? String(ranked[0].uid) : '';
    const previousUid = ranked[1] ? String(ranked[1].uid) : '';
    const output = new Map();
    for (const entry of scenes) {
        const uid = String(entry.uid);
        output.set(uid, uid === currentUid ? 'current' : uid === previousUid ? 'previous' : 'remote');
    }
    return output;
}

function sceneExplicitActivityTime(entry) {
    const extension = entry?.raw?.extensions?.mirrorAbyssInfoPoint;
    return Number(extension?.sceneLastActiveAt || 0);
}

function sceneActivityTime(entry) {
    return sceneExplicitActivityTime(entry) || Number(entry?.updatedAt || 0);
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
    const baseOrder = ({ 场景: 700, 时空: 700, 事件: 680, 世界: 610, 全局: 610, 全局状态: 610, 全局变化: 610, 当前局势: 610, 世界局势: 610, 人物: 520, 角色: 520, NPC: 500, 物品: 500 })[type] ?? 400;


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
        // World-state entries may be reached from an explicit scene/world
        // reference, but stop there.  Making them bidirectional bridges lets
        // unrelated world entries recursively awaken one another and can form
        // cycles as the book grows.
        return profile('世界变化终点', tier === 'historical' ? 'long-term' : 'active', 'world-state', 'keyword', false, false, true, false, 6, baseOrder, 4, 6);
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
        const text = String(candidate ?? '').trim().replace(/^\s*(?:别名|名称|关键词)\s*[：:]\s*/u, '');
        const normalized = (0, util_1.normalizeFact)(text);
        if (!text || /<<<\s*END_ENTRY\s*>>>/iu.test(text) || /^(?:来源行|证据行)\s*[：:]/u.test(text) || (0, util_1.isUidKeyword)(text)) continue;
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
exports.assessRevisionCompleteness = assessRevisionCompleteness;
exports.revisionRetryTokens = revisionRetryTokens;
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
    async revise(settings, snapshot, issues, onProgress = () => undefined) {
        this.host.assertSnapshot(snapshot, this.getSettings());
        const prompt = (0, prompts_1.revisionPrompts)(settings, snapshot.playerText, snapshot.assistantText, issues, { dialogueContext: snapshot.dialogueContext });
        const raw = await (0, model_request_1.callModel)({
            host: this.host,
            stage: 'revision',
            prompt,
            fallbackPrompt: () => (0, prompts_1.revisionPrompts)(settings, snapshot.playerText, snapshot.assistantText, issues, { compact: true, dialogueContext: snapshot.dialogueContext }),
            settings,
            snapshot,
            profileId: settings.revisionProfileId,
            sourceText: snapshot.turnText || snapshot.assistantText,
        });
        this.host.assertSnapshot(snapshot, this.getSettings());
        let revisedText = parseRevisionResult(raw);
        let assessment = assessRevisionCompleteness(snapshot.assistantText, revisedText);
        if (!assessment.ok) {
            try { onProgress(`修正版疑似截断：${assessment.reason}；扩大预算重新生成完整正文`); } catch { }
            const retryPrompt = (0, prompts_1.revisionPrompts)(settings, snapshot.playerText, snapshot.assistantText, issues, { dialogueContext: snapshot.dialogueContext, completenessRetry: true, retryReason: assessment.reason });
            const retryRaw = await (0, model_request_1.callModel)({
                host: this.host,
                stage: 'revision',
                prompt: retryPrompt,
                fallbackPrompt: () => (0, prompts_1.revisionPrompts)(settings, snapshot.playerText, snapshot.assistantText, issues, { compact: true, dialogueContext: snapshot.dialogueContext, completenessRetry: true, retryReason: assessment.reason }),
                settings,
                snapshot,
                profileId: settings.revisionProfileId,
                sourceText: snapshot.turnText || snapshot.assistantText,
                responseTokens: revisionRetryTokens(settings, snapshot.assistantText),
            });
            this.host.assertSnapshot(snapshot, this.getSettings());
            revisedText = parseRevisionResult(retryRaw);
            assessment = assessRevisionCompleteness(snapshot.assistantText, revisedText);
        }
        if (!assessment.ok) throw new Error(`修正版疑似截断，已拒绝覆盖并保留原正文：${assessment.reason}`);
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

function revisionRetryTokens(settings, sourceText) {
    const configured = Math.max(8192, Number(settings?.responseTokens) || 8192);
    const estimated = Math.ceil(String(sourceText ?? '').length * 2.2) + 2048;
    return Math.min(16384, Math.max(configured, estimated));
}
function assessRevisionCompleteness(original, candidate) {
    const source = String(original ?? '').trim();
    const next = String(candidate ?? '').trim();
    if (!next) return { ok: false, reason: '修正版为空', ratio: 0 };
    const ratio = source.length ? next.length / source.length : 1;
    const sourceParagraphs = source.split(/\n\s*\n|\n/u).map((x) => x.trim()).filter(Boolean).length;
    const nextParagraphs = next.split(/\n\s*\n|\n/u).map((x) => x.trim()).filter(Boolean).length;
    const dangling = /[，、：:；;（(\[【“‘《〈—-]$/u.test(next);
    const sourceHasEnding = hasRevisionSentenceEnding(source);
    const nextHasEnding = hasRevisionSentenceEnding(next);
    if (dangling) return { ok: false, reason: '结尾停在未完成的标点或结构上', ratio };
    if (source.length >= 300 && ratio < 0.72) return { ok: false, reason: `修正版仅保留原文约${Math.round(ratio * 100)}%`, ratio };
    if (sourceParagraphs >= 4 && nextParagraphs < Math.max(2, Math.ceil(sourceParagraphs * 0.55)) && ratio < 0.88)
        return { ok: false, reason: `段落由${sourceParagraphs}段骤减为${nextParagraphs}段`, ratio };
    // [MA-REVISION-03] 中文正文经常以右引号、书名号或无句号的完整台词收尾。
    // 旧闸门只要“缺终止标点 + 比原文稍短”就判截断，导致完整修正版被稳定误杀。
    // 现在必须同时出现明显缩短或明确的未完成词尾，才把缺句末视为截断证据。
    if (sourceHasEnding && !nextHasEnding && (ratio < 0.84 || revisionTailLooksIncomplete(next)))
        return { ok: false, reason: '修正版结尾不完整且正文有截断迹象', ratio };
    return { ok: true, reason: '', ratio };
}
function hasRevisionSentenceEnding(value) {
    return /[。！？!?…；;」』）)】》〉”’"'~]$/u.test(String(value ?? '').trim());
}
function revisionTailLooksIncomplete(value) {
    const lines = String(value ?? '').trim().split(/\n/u).map((line) => line.trim()).filter(Boolean);
    const tail = lines.at(-1) ?? '';
    if (!tail) return true;
    if (/[，、：:；;（(\[【“‘《〈—-]$/u.test(tail)) return true;
    return /(?:因为|所以|但是|并且|而且|以及|或者|如果|虽然|尽管|由于|随着|为了|通过|随后|然后|并|却|而|把|将|向|从|在|对|与|和|或)$/u.test(tail);
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
    // 事件生命周期必须由当前正文确定，不能永久继承旧的 active/closed 元数据。
    if (entry.type === '事件') {
        const closed = isEventClosed(entry);
        return { lifecycle: closed ? 'closed' : 'active', semanticRole: closed ? 'event-history' : 'event-active' };
    }
    if (storedLifecycle || storedRole) {
        return { lifecycle: storedLifecycle || 'background', semanticRole: storedRole || 'object' };
    }
    if (foundation || focus) return { lifecycle: 'core', semanticRole: foundation ? 'foundation' : 'focus' };
    if (entry.title === '总结｜当前事件') return { lifecycle: 'recent-summary', semanticRole: 'summary-container' };
    if (entry.title === '总结｜世界历史') return { lifecycle: 'historical-summary', semanticRole: 'summary-container' };
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
    const values = entry.sections?.values ?? {};
    const result = [...(values['结果'] ?? []), ...(values['最终结果'] ?? [])].map((line) => String(line ?? '').trim()).filter(Boolean);
    const legacyPending = [...(values['未决'] ?? []), ...(values['目标'] ?? [])].join('\n');
    if (legacyPending && /(?:尚未|未完成|未解决|仍需|待确认|等待|计划)/u.test(legacyPending)) return false;
    if (!result.length) return false;
    const text = result.join('\n');
    // ui.24 的【结果】只允许稳定结果；明确写成阶段性、暂时或待确认时仍不视为最终沉降。
    if (/(?:阶段性|暂时|临时|初步|中间结果|当前结果|待确认|尚未|未完成|仍需)/u.test(text)) return false;
    return true;
}



function countCriticalChanges(plan) {
    // ui.72: 关键变化按“正文回合”计 0/1，而不是按写入操作数量累加。
    // 【当前】等易变快照属于正常流水刷新，不应推动小总结；只有身份、关系、稳定事实、
    // 事件进展/结果、长期世界结构等会跨回合保留的变化才视为关键变化回合。
    const volatileSections = /^(?:当前|当前状态|在场|当前资源|活动关联|局部约束|持有|参与|场景|未发生进展)$/u;
    const durableSections = /(?:身份|稳定|行为倾向|性格核心|表达方式|决策倾向|关系立场|关系|固定事实|持续经历|定义|空间结构|持续变化|常驻角色|固定设施|附属人员|已发生进展|结果|时代|权力|制度|公开局势|世界变化|持续影响|范围|地理|组织|资源与交通|世界常识|自然规则|种族与生命|能力与技术|社会规则|地理框架)/u;
    for (const operation of plan?.operations ?? []) {
        if (!operation || operation.kind === 'noop' || operation.kind === 'merge-keywords' || operation.kind === 'merge-titles') continue;
        if (operation.kind === 'create-entry' || operation.kind === 'delete-entry') return 1;
        const section = String(operation.section ?? '').trim();
        if (!section || volatileSections.test(section)) continue;
        if (durableSections.test(section)) return 1;
    }
    return 0;
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
    keyword('scene', '场景', '稳定空间知识、当前局部条件、固定事实与关联入口；同一地点持续补全同一条目。', ['当前场景'], false, [
        { key: 'definition', label: '定义', policy: 'semantic-upsert' },
        { key: 'space', label: '空间结构', policy: 'semantic-upsert' },
        { key: 'fixedResources', label: '固定资源', policy: 'semantic-upsert' },
        { key: 'fixedFacilities', label: '固定设施', policy: 'semantic-upsert' },
        { key: 'residentRoles', label: '常驻角色', policy: 'semantic-upsert' },
        { key: 'fixedFacts', label: '固定事实', policy: 'semantic-upsert' },
        { key: 'current', label: '当前状态', policy: 'replace-section' },
        { key: 'present', label: '在场', policy: 'replace-section' },
        { key: 'currentResources', label: '当前资源', policy: 'replace-section' },
        { key: 'activities', label: '活动关联', policy: 'replace-section' },
        { key: 'worldImpact', label: '世界影响', policy: 'replace-section' },
        { key: 'constraints', label: '局部约束', policy: 'replace-section' },
        COMMON_ALIASES,
    ], 700, false),
    keyword('character', '人物', '角色身份、稳定能力、当前状态、角色自身关系、关键持有物与固定事实；人物描写只保留少量影响识别或剧情判断的客观特征。', ['角色', 'NPC'], false, [
        { key: 'identity', label: '身份', policy: 'semantic-upsert' },
        { key: 'stable', label: '稳定', policy: 'semantic-upsert' },
        { key: 'behaviorTendency', label: '行为倾向', policy: 'semantic-upsert' },
        { key: 'personality', label: '性格核心', policy: 'semantic-upsert' },
        { key: 'expression', label: '表达方式', policy: 'semantic-upsert' },
        { key: 'decision', label: '决策倾向', policy: 'semantic-upsert' },
        { key: 'current', label: '当前', policy: 'replace-section' },
        { key: 'relations', label: '关系', policy: 'replace-by-anchor' },
        { key: 'relationshipStance', label: '关系立场', policy: 'replace-by-anchor' },
        { key: 'holding', label: '持有', policy: 'replace-section' },
        { key: 'fixedFacts', label: '固定事实', policy: 'semantic-upsert' },
        COMMON_ALIASES,
    ], 520, false),
    keyword('item', '物品', '只记录可单独追踪的具体物品实例；同类集合和批量物资留在场景资源。', ['道具', '装备'], false, [
        { key: 'definition', label: '定义', policy: 'semantic-upsert' },
        { key: 'function', label: '功能', policy: 'semantic-upsert' },
        { key: 'current', label: '当前', policy: 'replace-section' },
        { key: 'limits', label: '限制', policy: 'semantic-upsert' },
        { key: 'fixedFacts', label: '固定事实', policy: 'semantic-upsert' },
        COMMON_ALIASES,
    ], 500, false),
    keyword('event', '事件', '由同一因果链形成的状态变化记录；普通动作过滤，过程压缩，稳定结果分发。', ['事件链'], false, [
        { key: 'participants', label: '参与', policy: 'replace-section' },
        { key: 'auxiliaryPeople', label: '附属人员', policy: 'replace-section' },
        { key: 'scenes', label: '场景', policy: 'replace-section' },
        { key: 'progressed', label: '已发生进展', policy: 'semantic-upsert' },
        { key: 'notProgressed', label: '未发生进展', policy: 'replace-section' },
        { key: 'result', label: '结果', policy: 'replace-section' },
        COMMON_ALIASES,
    ], 680, false),
    keyword('world', '世界', '会随剧情变化、但影响范围超出单一人物或单一场景的全局状态；包括区域、组织、权力、制度、资源网络和公开局势。', ['全局', '全局状态', '世界变化', '当前局势', '世界局势'], false, [
        { key: 'scope', label: '范围', policy: 'semantic-upsert' },
        { key: 'geography', label: '地理', policy: 'semantic-upsert' },
        { key: 'organizations', label: '组织', policy: 'semantic-upsert' },
        { key: 'power', label: '权力', policy: 'replace-by-anchor' },
        { key: 'system', label: '制度', policy: 'replace-by-anchor' },
        { key: 'network', label: '资源与交通', policy: 'replace-by-anchor' },
        { key: 'public', label: '公开局势', policy: 'replace-by-anchor' },
        { key: 'fixedFacts', label: '固定事实', policy: 'semantic-upsert' },
        { key: 'impact', label: '持续影响', policy: 'replace-by-anchor' },
        COMMON_ALIASES,
    ], 610, false),
    keyword('foundation', '基础设定', '跨场景成立且不随普通剧情变化的世界框架、自然规律、种族共性、能力技术与社会常识。', ['基础规则', '世界设定', '规则', '设定'], true, [
        { key: 'common', label: '世界常识', policy: 'semantic-upsert' },
        { key: 'nature', label: '自然规则', policy: 'semantic-upsert' },
        { key: 'species', label: '种族与生命', policy: 'semantic-upsert' },
        { key: 'ability', label: '能力与技术', policy: 'semantic-upsert' },
        { key: 'society', label: '社会规则', policy: 'semantic-upsert' },
        { key: 'geography', label: '地理框架', policy: 'semantic-upsert' },
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
exports.DEFAULT_AUDIT_PROMPT = `只做基础审核；明确触发任一条时判定 FAIL：
1. AI不得替玩家新增玩家未输入的台词、主动行动、重要决定、明确心理结论或价值判断。
2. AI不得把玩家已表达的动作、语言或选择扩大成新的关键决定。
3. AI回复不得与当前可见对话中的明确事实直接矛盾。
4. AI回复不得输出选项栏、行动列表、攻略、内部检查、系统规则、自我解释、管理标签、回合编号或作者总结。
5. 正常叙事描写、NPC主动行动、NPC提问、自然段落和对白换行本身不构成违规。
只依据当前提供的对话上下文审核；不审核角色卡、世界书或未提供的隐藏设定。`;
exports.DEFAULT_REVISION_PROMPT = `只修改审核指出的明确违规部分。保留合规内容、原事件顺序、人物关系、叙事视角、语气和有效信息；不得续写、全面重写、新增人物、秘密、因果或结论。修正版必须是可直接替换原正文的完整自然正文，不得添加标签、解释、审核报告、选项或系统提示。`;
const LEGACY_EXTRACTION_PROMPT_UI66 = `优先更新上一轮权威条目；只输出本轮变化；正式姓名、身份、外形或状态变化继续更新原人物条目；同一事实写入最直接宿主。`;
const LEGACY_SMALL_SUMMARY_PROMPT_UI66 = `以上轮权威世界书、本轮正文和本期实际变更条目为依据，逐来源判断事实应进入哪个直接宿主；总结只生成历史分发计划，不建立总结条目。临时人物、普通物品、局部事件和已离开场景只有在必要事实完整分发后才退出；人物近期重复行为只提炼为不含具体物品和单次情节的抽象行为倾向。`;
const LEGACY_LARGE_SUMMARY_PROMPT_UI66 = `以经过小总结整理的权威条目为依据，把跨场景、跨阶段或永久成立的内容逐来源分发到长期宿主；总结只生成历史分发计划，不建立世界历史容器。已有行为倾向视为小总结提炼后的重复行为证据；大总结应将稳定倾向继续抽象为性格核心、表达方式或决策倾向。`;
const LEGACY_EXTRACTION_PROMPT_UI50 = `严格使用人物、场景、物品、事件、世界、基础设定六类固定格式。插件只负责按模型结果分发和提交，因此模型必须在源头完成唯一宿主分配：同一完整事实只能写入一个详细宿主，其他条目只能保留名称级引用。场景【在场】是当前场景人员存在状态的唯一宿主；在场人物的【当前】不重复普通位置。场景【当前资源】只写公共、无人持有或由场景保管的关键资源，不写人物正在携带、穿戴或持有的物品。人物【持有】只写物品名称引用，不复制功能、位置、完整性或转交流程；独立物品【当前】保存其详细权威状态。场景【活动关联】只写事件名称，事件【场景/参与】只写名称引用；事件【已发生进展】写事项取得的状态变化，不逐字复制人物、场景或物品内部细节。临时NPC、路人和一次性工作人员默认不建立长期人物条目；只有固定属于当前场景的岗位角色可写入场景【常驻角色】，真正拥有独立持续职责、关键认知或长期关系的对象才建立人物条目。关系写入对应人物，地点知识写入场景；可变化的全局状态写入世界，不随普通剧情变化的世界框架写入基础设定。场景当前栏目完整替换，离开场景后由插件结算；事件只记录已经造成状态变化的进展，普通动作过滤。事实必须精简、完整、无推测、无解释且不跨条目复述；物品只建单体实例。`;
const LEGACY_SMALL_SUMMARY_PROMPT_UI55 = `以上次小总结后实际变更的世界书条目为主材料，按对象、目标、因果、时间、场景和规则范围形成语义簇；将细颗粒内容抽象为适合继续游玩的较粗状态、事件进展和局部机制，重新分发到直接宿主，并只吸收已经被目标事件完整承接的细事件壳。`;
exports.DEFAULT_SMALL_SUMMARY_PROMPT = `逐来源结算本期实际变更条目：把本轮结束时仍成立的人物现状写入【当前】明确状态槽，把重复行为提炼为【行为倾向】，把历史结果分发到直接宿主；必要事实完整承接后才吸收来源。`;
const LEGACY_LARGE_SUMMARY_PROMPT_UI55 = `以最近若干次小总结后实际变更的运行条目为主材料，将已经跨场景、跨阶段或明确永久成立的内容继续抽象为长期人物变化、重要事件结果、长期关系、组织制度和系统规则；覆盖旧世界历史，只分发长期有效的较粗结果。`;
exports.DEFAULT_LARGE_SUMMARY_PROMPT = `逐来源结算中层权威条目：把跨阶段或长期成立的内容分发到长期宿主；已有行为倾向继续提炼为【性格核心】【表达方式】【决策倾向】，长期关系进入【关系/关系立场】，历史经历才进入【固定事实】。`;
exports.DEFAULT_EXTRACTION_PROMPT = `优先更新上一轮权威条目；只输出本轮已发生变化；正式姓名、身份、外形或状态变化继续更新原人物条目；同一事实写入最直接宿主。`;
const LEGACY_EXTRACTION_PROMPT_UI23 = `严格使用人物、场景、物品、事件、世界、基础设定六类固定格式。未知人物不得猜成已知人物；身份未揭示时建立身份未明临时档，明确揭示后再合并。关系写入对应人物，地点知识写入场景；可变化的全局状态写入世界，不随普通剧情变化的世界框架写入基础设定。场景稳定知识持续补全，当前栏目完整替换；事件只保存必要过程。事实必须精简、完整、无推测、无解释且不跨条目复述；人物只留少量关键特征，物品只建单体实例。`;
const LEGACY_EXTRACTION_PROMPT_UI46 = `严格使用人物、场景、物品、事件、世界、基础设定六类固定格式。临时NPC、路人和一次性工作人员默认不建立长期人物条目；只有固定属于当前场景的岗位角色可写入场景【常驻角色】，真正拥有独立持续职责、关键认知或长期关系的对象才建立人物条目。关系写入对应人物，地点知识写入场景；可变化的全局状态写入世界，不随普通剧情变化的世界框架写入基础设定。人物必须优先保留性格核心、表达方式、决策倾向与当前状态。场景当前栏目完整替换，离开场景后由插件结算；事件只记录已经造成状态变化的进展，普通动作过滤。当前场景【当前状态】应在正文明确时写“游戏时间：内容”，只表示当前游戏内时间。事实必须精简、完整、无推测、无解释且不跨条目复述；物品只建单体实例。`;
const LEGACY_SMALL_SUMMARY_PROMPT_UI51 = `压缩当前事件已经发生的状态变化；区分已发生进展与未发生进展，过滤普通动作，覆盖旧事件进展，并把稳定影响分发到人物、场景、物品或世界。`;
const LEGACY_LARGE_SUMMARY_PROMPT_UI51 = `将已经压缩完成的事件结果和稳定变化沉降为长期历史；覆盖旧世界历史，不接收普通动作、未发生进展、未来目标或重复过程，只分发长期有效的结果。`;
const LEGACY_SMALL_SUMMARY_PROMPT_UI23 = `结算当前事件线；保留当前场景、人物状态、事件阶段、已成立结果和未决事项，并把持续影响分发到人物、场景、物品或世界。`;
const LEGACY_LARGE_SUMMARY_PROMPT_UI23 = `整理跨场景仍需保留的长期影响；关系并入人物，地点并入场景，可变化的宏观状态进入世界，稳定世界框架进入基础设定，只分发永久变化和重大结果。`;
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
    entryBudgetEnabled: true,
    auditEnabled: true,
    extractionEnabled: true,
    targetLorebook: '',
    autoCreateLorebook: false,
    auditPrompt: exports.DEFAULT_AUDIT_PROMPT,
    revisionPrompt: exports.DEFAULT_REVISION_PROMPT,
    extractionPrompt: exports.DEFAULT_EXTRACTION_PROMPT,
    smallSummaryPrompt: exports.DEFAULT_SMALL_SUMMARY_PROMPT,
    largeSummaryPrompt: exports.DEFAULT_LARGE_SUMMARY_PROMPT,
    responseTokens: 8192,
    requestTimeoutMs: 90000,
    smallSummaryTurns: 10,
    smallSummaryMinTurns: 5,
    criticalChangesForSmall: 6,
    largeSummaryCount: 5,
    queueCompactThreshold: 6,
    keywordDefinitions: exports.DEFAULT_KEYWORDS,
    sectionPolicies: {
        在场: 'replace-section', 当前资源: 'replace-section', 活动关联: 'replace-section', 世界影响: 'replace-section', 局部约束: 'replace-section',
        常驻角色: 'semantic-upsert', 固定设施: 'semantic-upsert',
        持有: 'replace-section', 参与: 'replace-section', 场景: 'replace-section', 结果: 'replace-section',
        当前: 'replace-section', 当前状态: 'replace-section', 关系: 'replace-by-anchor', 关系立场: 'replace-by-anchor',
        固定事实: 'semantic-upsert', 行为倾向: 'semantic-upsert', 性格核心: 'semantic-upsert', 表达方式: 'semantic-upsert', 决策倾向: 'semantic-upsert', 已发生进展: 'semantic-upsert', 未发生进展: 'replace-section',
    },
});
class SettingsStore {
    capture(context) {
        const root = (context.extensionSettings ?? (context.extensionSettings = {}));
        const exists = Object.prototype.hasOwnProperty.call(root, constants_1.EXTENSION_NAMESPACE);
        return { exists, value: exists ? (0, util_1.clone)(root[constants_1.EXTENSION_NAMESPACE]) : undefined };
    }
    restore(context, snapshot) {
        const root = (context.extensionSettings ?? (context.extensionSettings = {}));
        const current = this.capture(context);
        if (snapshot?.exists) root[constants_1.EXTENSION_NAMESPACE] = (0, util_1.clone)(snapshot.value);
        else delete root[constants_1.EXTENSION_NAMESPACE];
        try {
            context.saveSettingsDebounced?.();
        }
        catch (error) {
            if (current.exists) root[constants_1.EXTENSION_NAMESPACE] = (0, util_1.clone)(current.value);
            else delete root[constants_1.EXTENSION_NAMESPACE];
            throw error;
        }
        return this.load(context);
    }
    load(context) {
        const root = (context.extensionSettings ?? (context.extensionSettings = {}));
        const namespace = (0, util_1.isPlainObject)(root[constants_1.EXTENSION_NAMESPACE]) ? root[constants_1.EXTENSION_NAMESPACE] : {};
        const settings = parseSettings(namespace.settings);
        root[constants_1.EXTENSION_NAMESPACE] = { ...namespace, settings: (0, util_1.clone)(settings) };
        return settings;
    }
    save(context, patch) {
        const root = (context.extensionSettings ?? (context.extensionSettings = {}));
        const hadNamespace = Object.prototype.hasOwnProperty.call(root, constants_1.EXTENSION_NAMESPACE);
        const previousNamespace = hadNamespace ? (0, util_1.clone)(root[constants_1.EXTENSION_NAMESPACE]) : undefined;
        const namespace = (0, util_1.isPlainObject)(root[constants_1.EXTENSION_NAMESPACE]) ? root[constants_1.EXTENSION_NAMESPACE] : {};
        const settings = parseSettings({ ...this.load(context), ...patch });
        root[constants_1.EXTENSION_NAMESPACE] = { ...namespace, settings: (0, util_1.clone)(settings) };
        try {
            context.saveSettingsDebounced?.();
        }
        catch (error) {
            if (hadNamespace) root[constants_1.EXTENSION_NAMESPACE] = previousNamespace;
            else delete root[constants_1.EXTENSION_NAMESPACE];
            throw error;
        }
        return settings;
    }
    reset(context) {
        const root = (context.extensionSettings ?? (context.extensionSettings = {}));
        const hadNamespace = Object.prototype.hasOwnProperty.call(root, constants_1.EXTENSION_NAMESPACE);
        const previousNamespace = hadNamespace ? (0, util_1.clone)(root[constants_1.EXTENSION_NAMESPACE]) : undefined;
        delete root[constants_1.EXTENSION_NAMESPACE];
        try {
            context.saveSettingsDebounced?.();
        }
        catch (error) {
            if (hadNamespace) root[constants_1.EXTENSION_NAMESPACE] = previousNamespace;
            throw error;
        }
        return this.load(context);
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
        entryBudgetEnabled: candidate.entryBudgetEnabled !== false,
        auditEnabled: candidate.auditEnabled !== false,
        extractionEnabled: candidate.extractionEnabled !== false,
        // [MA-WB-SCOPE-01] 旧版全局目标世界书字段只保留兼容键，不再允许覆盖当前聊天绑定。
        targetLorebook: '',
        autoCreateLorebook: candidate.autoCreateLorebook === true,
        auditPrompt: String(candidate.auditPrompt ?? exports.DEFAULT_AUDIT_PROMPT) || exports.DEFAULT_AUDIT_PROMPT,
        revisionPrompt: String(candidate.revisionPrompt ?? exports.DEFAULT_REVISION_PROMPT) || exports.DEFAULT_REVISION_PROMPT,
        extractionPrompt: migrateBuiltinPrompt(candidate.extractionPrompt, [LEGACY_EXTRACTION_PROMPT_UI23, LEGACY_EXTRACTION_PROMPT_UI46, LEGACY_EXTRACTION_PROMPT_UI50, LEGACY_EXTRACTION_PROMPT_UI66], exports.DEFAULT_EXTRACTION_PROMPT),
        smallSummaryPrompt: migrateBuiltinPrompt(candidate.smallSummaryPrompt, [LEGACY_SMALL_SUMMARY_PROMPT_UI23, LEGACY_SMALL_SUMMARY_PROMPT_UI51, LEGACY_SMALL_SUMMARY_PROMPT_UI55, LEGACY_SMALL_SUMMARY_PROMPT_UI66], exports.DEFAULT_SMALL_SUMMARY_PROMPT),
        largeSummaryPrompt: migrateBuiltinPrompt(candidate.largeSummaryPrompt, [LEGACY_LARGE_SUMMARY_PROMPT_UI23, LEGACY_LARGE_SUMMARY_PROMPT_UI51, LEGACY_LARGE_SUMMARY_PROMPT_UI55, LEGACY_LARGE_SUMMARY_PROMPT_UI66], exports.DEFAULT_LARGE_SUMMARY_PROMPT),
        responseTokens: (0, util_1.clampNumber)(migrateResponseTokens(candidate.responseTokens), 8192, 1024, 16384),
        requestTimeoutMs: (0, util_1.clampNumber)(candidate.requestTimeoutMs, 90000, 10000, 300000),
        smallSummaryTurns: (0, util_1.clampNumber)(candidate.smallSummaryTurns, 10, 1, 100),
        smallSummaryMinTurns: (0, util_1.clampNumber)(candidate.smallSummaryMinTurns, 5, 1, 100),
        criticalChangesForSmall: (0, util_1.clampNumber)(candidate.criticalChangesForSmall, 6, 1, 50),
        largeSummaryCount: (0, util_1.clampNumber)(candidate.largeSummaryCount, 5, 1, 30),
        queueCompactThreshold: (0, util_1.clampNumber)(candidate.queueCompactThreshold, 6, 2, 50),
        keywordDefinitions: parseKeywordDefinitions(candidate.keywordDefinitions, candidate.tables),
        sectionPolicies,
    };
}

function migrateResponseTokens(value) {
    const numeric = Number(value);
    // ui.33 及更早版本没有暴露该字段，3072 是旧隐藏默认值；升级时迁移到推理模型安全预算。
    if (!Number.isFinite(numeric) || numeric === 3072) return 8192;
    return numeric;
}

function migrateBuiltinPrompt(value, legacyValue, currentDefault) {
    const text = String(value ?? '').trim();
    const legacyValues = Array.isArray(legacyValue) ? legacyValue : [legacyValue];
    if (!text || legacyValues.some((item) => text === String(item ?? '').trim())) return currentDefault;
    return text;
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
    // [MA-SETTINGS-01] 内置六类使用当前固定字段，不把旧版“关系/地点/全局”等字段继续混进新模板。
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
exports.stripBatchTitleId = stripBatchTitleId;
exports.isUidKeyword = isUidKeyword;
exports.splitTitle = splitTitle;
exports.normalizeFact = normalizeFact;
exports.safeId = safeId;
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
    const seen = new Set();
    const render = (value, depth = 0) => {
        if (depth > 4) return '';
        if (value instanceof Error) {
            if (seen.has(value)) return '';
            seen.add(value);
            const head = `${value.name}: ${value.message}`;
            const cause = value.cause ? render(value.cause, depth + 1) : '';
            return cause && cause !== head ? `${head} ← ${cause}` : head;
        }
        if (value && typeof value === 'object') {
            try { return JSON.stringify(value); }
            catch { return String(value); }
        }
        return String(value ?? '');
    };
    return render(error);
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
function isUidKeyword(value) {
    return /^UID\s*[:：=]\s*[^\s]+$/iu.test(String(value ?? '').trim());
}
function splitTitle(value) {
    const normalized = stripUidSuffix(value);
    const parts = normalized.split('｜').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const type = parts[0];
    const batchId = parts.length >= 3 && /^(?:(?:[A-Z]{1,3})?\d{2,5}-\d{2,4}|S\d{3,6}-[A-Z]\d{2,4})$/iu.test(parts[1]) ? parts[1] : '';
    const name = (batchId ? parts.slice(2) : parts.slice(1)).join('｜').trim();
    return type && name ? { type, name, batchId } : null;
}
function stripBatchTitleId(value) {
    const split = splitTitle(value);
    return split ? `${split.type}｜${split.name}` : normalizeTitle(value);
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
},"world-setting-import":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSettingImportService = void 0;
exports.sanitizeWorldSettingBlocks = sanitizeWorldSettingBlocks;
exports.worldSettingPreviewSummary = worldSettingPreviewSummary;
const matcher_1 = require("./matcher");
const model_request_1 = require("./model-request");
const operations_1 = require("./operations");
const parser_1 = require("./parser");
const prompts_1 = require("./prompts");
const util_1 = require("./util");
const ALLOWED_TYPES = new Set(['基础设定', '世界', '场景', '人物', '物品', '事件']);
const MAX_SOURCE_CHARS = 24000;
const MAX_BLOCKS = 16;
const CONTROL_TITLE = /^(?:基础设定|世界|人物|场景|事件|物品)｜(?:角色信息边界|系统提示|开发者消息|写作要求|文风要求|输出格式|提取规则|审核规则|控制提示|控制规则)$/u;
const CONTROL_MARKER = /(?:<<<\s*(?:ENTRY|END_ENTRY)|\bUID\s*:|来源行\s*:|系统提示|开发者消息|提示词模板)/iu;
const FUTURE_ONLY_EVENT = /(?:尚未开始|未开始|计划中|准备开始|将要|未来会|以后会)/u;
class WorldSettingImportService {
    constructor(host, worldbook, getSettings, onProgress = null) {
        this.host = host;
        this.worldbook = worldbook;
        this.getSettings = getSettings;
        this.onProgress = typeof onProgress === 'function' ? onProgress : null;
        this.previewState = null;
    }
    progress(state, detail, meta = {}) {
        try { this.onProgress?.({ state, detail, ...meta }); }
        catch (error) { console.warn('[MirrorAbyss] world setting import progress callback failed', error); }
    }
    scopeChatKey() { try { return this.host.chatKey(); } catch { return ''; } }
    hasPreview() { return Boolean(this.previewState?.previewReady && this.previewState?.chatKey === this.scopeChatKey()); }
    clearPreview() { this.previewState = null; return true; }
    previewSummary() { return this.hasPreview() ? worldSettingPreviewSummary(this.previewState) : null; }
    async preview(settings, snapshot, sourceText) {
        const source = normalizeSource(sourceText);
        validateSource(source);
        this.validate(snapshot, settings);
        this.progress('running', '正在读取当前世界书并整理设定来源');
        const opened = await this.worldbook.readRaw(settings, snapshot, () => this.validate(snapshot, settings));
        const entries = (0, require("./worldbook").parseEntries)(opened.data);
        const selected = (0, matcher_1.relevantEntries)(entries, source, 8);
        const prompt = (0, prompts_1.worldSettingImportPrompts)(settings, source, selected);
        const raw = await (0, model_request_1.callModel)({
            host: this.host,
            stage: 'worldSettingImport',
            prompt,
            fallbackPrompt: () => (0, prompts_1.worldSettingImportPrompts)(settings, source, selected, { compact: true }),
            settings,
            snapshot,
            profileId: settings.extractionProfileId,
            sourceText: source,
            onRetry: (error) => this.progress('running', (0, model_request_1.describeRetryReason)(error, '设定导入模型')),
        });
        this.validate(snapshot, settings);
        let blocks = (0, parser_1.parseExtractionWithRecovery)(raw);
        let diagnostics = blocks.diagnostics ?? { repaired: 0, merged: [], skipped: [], warnings: [], hadInput: false };
        let repairRaw = '';
        if (!blocks.length && diagnostics.hadInput) {
            this.progress('running', '设定返回格式异常，启动一次格式修复');
            repairRaw = await (0, model_request_1.callModel)({
                host: this.host,
                stage: 'extractionRepair',
                prompt: (0, prompts_1.extractionRepairPrompts)(raw),
                fallbackPrompt: () => (0, prompts_1.extractionRepairPrompts)(raw, { compact: true }),
                settings,
                snapshot,
                profileId: settings.extractionProfileId,
                sourceText: raw,
            });
            this.validate(snapshot, settings);
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
        if (!blocks.length) throw new Error('没有从玩家设定中解析出可预览条目');
        const sanitized = sanitizeWorldSettingBlocks(blocks, source, diagnostics);
        if (!sanitized.length) throw new Error('玩家设定只包含写作要求、控制文本或尚未成立的未来事件，没有可导入事实');
        const plan = (0, operations_1.buildOperationPlan)(sanitized, entries, settings, source);
        plan.operations = plan.operations.map((operation) => {
            if (!['delete-entry', 'merge-entry'].includes(operation.kind)) return operation;
            return { ...operation, kind: 'noop', operation: 'no-op', reason: '设定导入只新增或更新，不执行档案合并与删除' };
        });
        const meaningful = plan.operations.filter((operation) => operation.kind !== 'noop');
        if (!meaningful.length) throw new Error('这些设定与当前世界书一致，没有需要提交的变化');
        const sourceHash = (0, util_1.hashText)(source);
        const worldbookHash = digestWorldbook(opened.data);
        const created = [...new Set(meaningful.filter((operation) => operation.kind === 'create-entry').map((operation) => operation.title))];
        const updated = [...new Set(meaningful.filter((operation) => operation.kind !== 'create-entry').map((operation) => operation.title))];
        this.previewState = {
            chatKey: snapshot.chatKey,
            previewReady: true,
            source,
            sourceHash,
            worldbookName: opened.name,
            worldbookHash,
            settingsSignature: typeof this.host.settingsSignature === 'function' ? this.host.settingsSignature(settings) : '',
            plan,
            blocks: sanitized,
            raw: repairRaw || raw,
            diagnostics,
            created,
            updated,
            generatedAt: Date.now(),
        };
        const summary = this.previewSummary();
        this.progress('success', `设定预览已生成：新建${created.length}、更新${updated.length}，世界书尚未修改`, summary);
        return summary;
    }
    async commit(settings, snapshot, sourceText) {
        const preview = this.previewState;
        if (!preview?.previewReady) throw new Error('尚未生成可提交的设定预览');
        const source = normalizeSource(sourceText);
        if ((0, util_1.hashText)(source) !== preview.sourceHash) throw new Error('设定文本已修改，请重新生成预览');
        if (snapshot.chatKey !== preview.chatKey) throw new Error('聊天已经切换，请重新生成设定预览');
        const currentSettingsSignature = typeof this.host.settingsSignature === 'function' ? this.host.settingsSignature(settings) : '';
        if (preview.settingsSignature && currentSettingsSignature !== preview.settingsSignature)
            throw new Error('插件设置在预览后已经变化，请重新生成设定预览');
        this.validate(snapshot, settings);
        const opened = await this.worldbook.readRaw(settings, snapshot, () => this.validate(snapshot, settings));
        if (opened.name !== preview.worldbookName || digestWorldbook(opened.data) !== preview.worldbookHash)
            throw new Error('世界书在预览后已经变化，请重新生成设定预览');
        this.progress('running', '正在原子提交玩家设定并回读校验');
        const focusUid = typeof this.host.getFocusUid === 'function' ? this.host.getFocusUid() : '';
        const result = await this.worldbook.apply(
            settings,
            preview.plan,
            `world-setting:${preview.sourceHash}`,
            source,
            focusUid,
            snapshot,
            () => this.validate(snapshot, settings),
            { sourceKind: 'setting-import' },
        );
        const summary = {
            committed: true,
            changed: result.changed === true,
            created: [...preview.created],
            updated: [...preview.updated],
            writeCount: Number(result.writeCount || 0),
            worldbookName: preview.worldbookName,
        };
        this.previewState = null;
        this.progress('success', `玩家设定已提交：新建${summary.created.length}、更新${summary.updated.length}`, summary);
        return summary;
    }
    validate(snapshot, settings) {
        if (typeof this.host.assertSnapshot === 'function') this.host.assertSnapshot(snapshot, settings ?? this.getSettings?.());
    }
}
exports.WorldSettingImportService = WorldSettingImportService;
function normalizeSource(value) {
    return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}
function validateSource(source) {
    if (source.length < 12) throw new Error('请粘贴更完整的世界设定，至少12个字符');
    if (source.length > MAX_SOURCE_CHARS) throw new Error(`世界设定超过${MAX_SOURCE_CHARS}字符，请分为多次导入`);
}
function sanitizeWorldSettingBlocks(blocks, source, diagnostics = {}) {
    const warnings = diagnostics.warnings ?? (diagnostics.warnings = []);
    const skipped = diagnostics.skipped ?? (diagnostics.skipped = []);
    const output = [];
    let sceneCount = 0;
    for (const original of blocks.slice(0, MAX_BLOCKS)) {
        const block = structuredClone(original);
        if (!ALLOWED_TYPES.has(String(block.type ?? ''))) {
            skipped.push({ title: block.title || '未知条目', reason: '设定导入不支持该类型' });
            continue;
        }
        const title = String(block.title ?? '').trim();
        const content = blockText(block);
        if (!title || CONTROL_TITLE.test(title) || controlContentOnly(content)) {
            skipped.push({ title: title || '控制文本', reason: '写作或控制文本不进入世界书' });
            continue;
        }
        if (block.type === '事件') {
            const occurred = (block.sections ?? [])
                .filter((section) => /^(?:已发生进展|关键进展|事件进程|结果)$/u.test(section.name))
                .flatMap((section) => section.lines ?? [])
                .join(' ');
            const futureOnly = FUTURE_ONLY_EVENT.test(content) && !/(?:已经|已|正在|当前|发生|开始|形成|完成|结束|遭到|成为|抵达|进入|导致|造成)/u.test(occurred);
            if (!occurred.trim() || futureOnly) {
                skipped.push({ title, reason: '尚未发生或没有已发生变化的计划不建立事件条目' });
                continue;
            }
        }
        if (block.type === '场景') {
            sceneCount += 1;
            if (sceneCount > 1) {
                skipped.push({ title, reason: '设定初始化只允许一个明确开局场景；其余地点应归入世界或基础设定' });
                continue;
            }
        }
        block.keywords = (0, util_1.unique)((block.keywords ?? [])
            .map((item) => (0, parser_1.sanitizeWorldbookLine)(item))
            .filter((item) => item && !(0, util_1.isUidKeyword)(item) && !CONTROL_MARKER.test(item)))
            .slice(0, 4);
        if (!block.keywords.length && block.name) block.keywords = [block.name];
        block.sections = (block.sections ?? []).map((section) => ({
            ...section,
            lines: (section.lines ?? []).map((line) => (0, parser_1.sanitizeWorldbookLine)(line)).filter((line) => line && !CONTROL_MARKER.test(line)),
        })).filter((section) => section.lines.length || section.empty === true);
        if (!block.sections.some((section) => (section.lines ?? []).length)) {
            skipped.push({ title, reason: '清理控制文本后没有正文' });
            continue;
        }
        output.push(block);
    }
    if (blocks.length > MAX_BLOCKS) warnings.push(`模型返回${blocks.length}个条目，只保留前${MAX_BLOCKS}个`);
    if (skipped.length) warnings.push(`已隔离${skipped.length}个不应进入世界书的候选`);
    return output;
}
function blockText(block) {
    return (block.sections ?? []).flatMap((section) => (section.lines ?? []).map((line) => `【${section.name}】${line}`)).join('\n');
}
function controlContentOnly(content) {
    const text = String(content ?? '');
    if (!text) return true;
    const controlHits = (text.match(/(?:AI|模型|玩家|提示词|系统消息|开发者消息|写作|文风|输出格式|审核|提取)/giu) || []).length;
    const factualHits = (text.match(/(?:世界|地区|城市|组织|种族|魔法|技术|货币|制度|人物|位于|存在|当前|已经|发生)/gu) || []).length;
    return controlHits >= 2 && factualHits === 0;
}
function digestWorldbook(data) {
    return (0, util_1.hashText)(JSON.stringify(data?.entries ?? {}));
}
function worldSettingPreviewSummary(preview) {
    if (!preview?.previewReady) return null;
    return {
        previewReady: true,
        sourceHash: preview.sourceHash,
        worldbookName: preview.worldbookName,
        created: [...(preview.created ?? [])],
        updated: [...(preview.updated ?? [])],
        entries: (preview.blocks ?? []).map((block) => ({
            title: block.title,
            type: block.type,
            content: blockText(block),
        })),
        repaired: Number(preview.diagnostics?.repaired || 0),
        skipped: (preview.diagnostics?.skipped ?? []).map((item) => ({ title: item.title || '候选', reason: item.reason || '' })),
        warnings: [...(preview.diagnostics?.warnings ?? [])],
        generatedAt: preview.generatedAt,
    };
}
},"worldbook-management":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWorldbookManagementView = buildWorldbookManagementView;
const governance_1 = require("./governance");
const semantic_1 = require("./semantic");

function buildWorldbookManagementView(entries, gameTime = null, settings = {}) {
    const list = Array.isArray(entries) ? entries : [];
    const context = (0, governance_1.activeContext)(list, list.find((entry) => entry.focus)?.uid || '');
    const issues = [];
    const managed = list.filter((entry) => entry?.managed === true);
    const currentScenes = managed.filter((entry) => /^(?:scene-current|scene-current-storage)$/u.test(String(entry.semanticRole ?? '')));
    if (currentScenes.length > 1) issues.push(issue('error', 'multiple-current-scenes', `检测到${currentScenes.length}个当前场景`, currentScenes.map((entry) => entry.title)));
    if (!context.scene) issues.push(issue('warning', 'missing-current-scene', '没有可识别的当前场景', []));
    const gameTimeEnabled = Boolean(gameTime?.label);
    const effectiveGameTime = gameTimeEnabled ? gameTime : null;
    if (gameTimeEnabled && !effectiveGameTime?.label) issues.push(issue('info', 'unknown-game-time', '当前游戏时间尚未由AI记录', []));

    const fixedSceneRoles = lines(context.scene, '常驻角色');
    const fixedFacilities = lines(context.scene, '固定设施');
    const present = managementPresent(context.scene);
    if (fixedSceneRoles.length > 5) issues.push(issue('error', 'scene-role-capacity', `当前场景常驻角色超过5个：${fixedSceneRoles.length}`, [context.scene?.title].filter(Boolean)));
    if (fixedFacilities.length > 8) issues.push(issue('error', 'scene-facility-capacity', `当前场景固定设施超过8个：${fixedFacilities.length}`, [context.scene?.title].filter(Boolean)));

    const activeEvents = context.activeEvents ?? [];
    for (const entry of activeEvents) {
        const participants = lines(entry, '参与');
        const auxiliary = lines(entry, '附属人员');
        if (participants.length > 6) issues.push(issue('error', 'event-participant-capacity', `${entry.title}直接参与者超过6个`, [entry.title]));
        if (auxiliary.length > 4) issues.push(issue('error', 'event-auxiliary-capacity', `${entry.title}附属人员超过4个`, [entry.title]));
    }

    const people = managed.filter((entry) => /^(?:人物|角色|NPC)$/u.test(String(entry.type ?? '')));
    const currentPeople = new Set((context.characters ?? []).map((entry) => String(entry.uid)));
    const settledPeople = people.filter((entry) => !currentPeople.has(String(entry.uid)) && entry.focus !== true);
    for (const entry of people) {
        const stable = ['性格核心', '表达方式', '决策倾向'].some((section) => lines(entry, section).length > 0);
        const tendency = lines(entry, '行为倾向').length > 0;
        if (currentPeople.has(String(entry.uid)) && !stable && tendency) issues.push(issue('info', 'forming-character-style', `${entry.title}已有阶段性行为倾向，尚未形成稳定性格结论`, [entry.title]));
        if ((0, governance_1.isGenericBackgroundPerson)({ type: entry.type, name: entry.name, sections: sectionBlocks(entry) })) {
            issues.push(issue('warning', 'temporary-npc-entry', `${entry.title}看起来仍是临时NPC独立条目`, [entry.title]));
        }
    }

    const closedEvents = managed.filter((entry) => entry.type === '事件' && (0, semantic_1.isEventClosed)(entry));
    const reopened = closedEvents.filter((entry) => /^(?:active|event-active|event-active-storage)$/u.test(String(entry.lifecycle || entry.semanticRole || '')));
    for (const entry of reopened) issues.push(issue('error', 'closed-event-active', `${entry.title}已经完成却仍被标记为活动`, [entry.title]));

    const currentResources = lines(context.scene, '当前资源');
    for (const item of managed.filter((entry) => entry.type === '物品' && managementItemUnavailable(entry))) {
        if (currentResources.some((line) => managementReferences(line, item.name))) {
            issues.push(issue('error', 'unavailable-item-in-current-scene', `${item.title}已不可用但仍列在当前场景资源中`, [item.title, context.scene?.title].filter(Boolean)));
        }
    }
    const emptyEntries = managed.filter((entry) => !Object.values(entry.sections?.values ?? {}).flat().some((line) => String(line ?? '').trim()));
    if (emptyEntries.length) issues.push(issue('warning', 'empty-managed-entries', `发现${emptyEntries.length}个空的镜渊管理条目`, emptyEntries.slice(0, 8).map((entry) => entry.title)));


    const orphanRelations = [];
    const idSet = new Set(managed.map((entry) => String(entry.uid)));
    const titleById = new Map(managed.map((entry) => [String(entry.uid), entry.title]));
    const directRelations = [];
    const relationKeys = new Set();
    for (const entry of managed) {
        const extension = entry.raw?.extensions?.mirrorAbyssInfoPoint ?? {};
        const relatedIds = Array.isArray(entry.relatedIds) ? entry.relatedIds : Array.isArray(extension.relatedIds) ? extension.relatedIds : [];
        for (const related of relatedIds) {
            const relatedId = String(related);
            if (!idSet.has(relatedId)) {
                orphanRelations.push(`${entry.title} → ${relatedId}`);
                continue;
            }
            const pair = [String(entry.uid), relatedId].sort();
            const key = pair.join('|');
            if (relationKeys.has(key)) continue;
            relationKeys.add(key);
            directRelations.push({
                sourceUid: pair[0], sourceTitle: titleById.get(pair[0]) || pair[0],
                targetUid: pair[1], targetTitle: titleById.get(pair[1]) || pair[1],
            });
        }
    }
    if (orphanRelations.length) issues.push(issue('warning', 'orphan-relations', `发现${orphanRelations.length}个孤立关联`, orphanRelations.slice(0, 8)));

    return {
        gameTime: gameTimeEnabled ? (effectiveGameTime ? { ...effectiveGameTime } : null) : { label: '未启用', sceneTitle: '当前聊天未设置游戏时间' },
        currentScene: context.scene ? {
            uid: context.scene.uid,
            title: context.scene.title,
            present,
            fixedSceneRoles,
            fixedFacilities,
        } : null,
        activeEvents: activeEvents.map((entry) => ({ uid: entry.uid, title: entry.title, state: (0, governance_1.currentEventState)(entry) })),
        currentPeople: (context.characters ?? []).map((entry) => ({ uid: entry.uid, title: entry.title })),
        settledPeople: settledPeople.map((entry) => ({ uid: entry.uid, title: entry.title })).slice(0, 50),
        directRelations: directRelations.slice(0, 100),
        counts: {
            managed: managed.length,
            currentPeople: currentPeople.size,
            settledPeople: settledPeople.length,
            activeEvents: activeEvents.length,
            closedEvents: closedEvents.length,
            fixedSceneRoles: fixedSceneRoles.length,
            fixedFacilities: fixedFacilities.length,
            directRelations: directRelations.length,
        },
        issues,
        healthy: issues.length === 0,
        hasErrors: issues.some((item) => item.level === 'error'),
    };
}

function lines(entry, section) {
    return [...(entry?.sections?.values?.[section] ?? [])].map((line) => String(line ?? '').trim()).filter(Boolean);
}
function managementPresent(scene) {
    const explicit = lines(scene, '在场');
    if (explicit.length) return explicit;
    const output = [];
    for (const line of lines(scene, '当前状态')) {
        const match = String(line ?? '').match(/(?:当前)?在场(?:者|人物)?\s*(?:为|是|有|包括|包含|：|:)\s*([^，。；;]+)/u);
        if (!match) continue;
        output.push(...String(match[1]).split(/[、,，/与和及]/u).map((item) => item.trim()).filter(Boolean));
    }
    return [...new Set(output)];
}
function managementGameTimeFromScene(scene) {
    const match = ['当前状态', '定义'].flatMap((section) => lines(scene, section)).map((line) => String(line ?? '').match(/(?:^|[，。；;\s])(?:当前游戏时间|游戏时间|当前时间|时间|日期|时段)\s*(?:为|是|[：:])\s*([^，。；;]+)/u)).find(Boolean);
    const label = String(match?.[1] ?? '').trim();
    return label ? { label, sceneTitle: scene?.title ?? '', source: 'scene-fallback' } : null;
}
function managementItemUnavailable(entry) {
    const text = Object.values(entry?.sections?.values ?? {}).flat().join('；');
    return /(?:已消耗|消耗完毕|已经用尽|已用尽|已碎裂|彻底碎裂|已销毁|已经销毁|已失效|碎裂失效|不复存在|已不存在|永久遗失)/u.test(text)
        && !/(?:已修复|恢复可用|重新获得|再次持有|找回|重铸|复原)/u.test(text);
}
function managementReferences(line, name) {
    const source = String(line ?? '').replace(/\s+/gu, '').toLocaleLowerCase();
    const target = String(name ?? '').replace(/\s+/gu, '').toLocaleLowerCase();
    return Boolean(source && target && source.includes(target));
}
function sectionBlocks(entry) {
    return Object.entries(entry?.sections?.values ?? {}).map(([name, values]) => ({ name, lines: values ?? [], empty: !(values ?? []).length }));
}
function issue(level, code, message, entries) { return { level, code, message, entries }; }
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
const governance_1 = require("./governance");
const entry_section_1 = require("./domain/entry-section");
const util_1 = require("./util");
const LEGACY_RUNTIME_PROJECTION_TITLE = '运行包｜当前活动';
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
        const beforeData = (0, util_1.clone)(opened.data);
        opened.data = (0, util_1.clone)(nextData);
        opened.data.entries ?? (opened.data.entries = {});
        validate?.();
        const intendedDigest = digestWorldbook(opened.data);
        const verified = await this.commitWithRollback(opened, beforeData, validate, (data) => {
            if (digestWorldbook(data) !== intendedDigest)
                throw new Error('世界书完整快照保存后回读不一致');
        }, '世界书完整快照保存', '保存前快照');
        return parseEntries(verified);
    }
    async updateEntry(settings, uid, patch, snapshot, validate) {
        return this.mutate(settings, snapshot, validate, (opened) => {
            const located = findRawEntry(opened.data, uid);
            if (!located)
                throw new Error(`世界书条目 UID ${uid} 不存在`);
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
            const focusedUid = parseEntries(opened.data).find((entry) => entry.focus)?.uid ?? '';
            applySummaryRebalance(this, opened.data, settings, kind, summaryText, focusedUid);
            return {
                verify(data) {
                    const after = parseEntries(data);
                    // 当前事件总结只有在逐来源承接证明成立后才能退出；保留容器不属于提交失败。
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
        const beforeData = (0, util_1.clone)(opened.data);
        removeLegacyRuntimeProjection(opened.data);
        const verifier = mutate(opened) ?? {};
        validate?.();
        const latest = await loadWorldInfoAuthoritative(opened.api, opened.name);
        if (!latest || digestWorldbook(latest) !== beforeVersion)
            throw new Error('世界书在编辑前已被其他操作修改，拒绝覆盖');
        validate?.();
        const verified = await this.commitWithRollback(opened, beforeData, validate, (data) => {
            verifier.verify?.(data);
        }, '世界书编辑', '编辑前快照');
        return parseEntries(verified);
    }
    async apply(settings, plan, sourceMessageKey, contextText, focusUid, snapshot, validate, options = {}) {
        validate?.();
        this.assertChat(snapshot?.chatKey ?? '');
        const opened = await this.open(settings, true, validate, snapshot?.chatKey, snapshot?.worldbookName);
        if (snapshot?.worldbookName && opened.name !== snapshot.worldbookName) throw new Error('目标世界书已经变化，拒绝提交');
        validate?.();
        const beforeVersion = digestWorldbook(opened.data);
        const beforeData = (0, util_1.clone)(opened.data);
        const receiptBefore = snapshotRawEntries(opened.data);
        const legacyProjectionRemoved = removeLegacyRuntimeProjection(opened.data);
        const before = parseEntries(opened.data);
        const writeOperations = plan.operations.filter((operation) => !['noop', 'delete-entry'].includes(operation.kind));
        const exitOperations = plan.operations.filter((operation) => operation.kind === 'delete-entry');
        const operationId = commitOperationId(sourceMessageKey, plan.operations);
        let expectedAfterWrites = before;
        const touchedUids = new Set(writeOperations.filter((operation) => operation.targetUid).map((operation) => String(operation.targetUid)));
        const createdUids = new Set();

        if (writeOperations.length) {
            const phasePlan = { ...plan, operations: writeOperations };
            expectedAfterWrites = (0, operations_1.applyPlanToEntries)(phasePlan, before, settings);
            const byUid = new Map(before.map((entry) => [entry.uid, entry]));
            for (const entry of expectedAfterWrites) {
                if (entry.uid.startsWith('new:')) {
                    const created = this.createEntry(opened.api, opened.name, opened.data);
                    hydrateRaw(created, entry, sourceMessageKey, operationId);
                    entry.uid = String(created.uid);
                    entry.mapKey = findMapKey(opened.data, created);
                    entry.raw = created;
                    createdUids.add(entry.uid);
                }
                else if (touchedUids.has(entry.uid)) {
                    const original = byUid.get(entry.uid);
                    if (!original) throw new Error(`待更新条目 UID ${entry.uid} 不存在`);
                    hydrateRaw(original.raw, entry, sourceMessageKey, operationId);
                    // [MA-SCENE-REAL-01] 后续场景活动时间与扩展字段必须写到真实世界书对象，不能停留在投影副本。
                    entry.raw = original.raw;
                    entry.mapKey = original.mapKey;
                }
            }
            // [MA-SCENE-01] 单轮只有一个正文结束时的当前场景。只给提取结果中的首个场景刷新活动时间。
            if (['extraction', 'setting-import'].includes(options.sourceKind)) {
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
        }

        let deletedCount = 0;
        const deleted = [];
        if (exitOperations.length) {
            const currentEntries = parseEntries(opened.data);
            for (const operation of exitOperations) {
                const target = currentEntries.find((entry) => entry.uid === String(operation.targetUid));
                const foundation = target?.keywords.some((keyword) => isFoundation(keyword, settings));
                if (!target || target.locked || target.focus || foundation || target.uid === String(focusUid ?? '')) continue;
                if (operation.requiresDistributionProof === true) {
                    const requiredTargets = (0, util_1.normalizeStringArray)(operation.distributionTargets).map(util_1.normalizeTitle);
                    if (!requiredTargets.length) continue;
                    const currentEntriesForProof = parseEntries(opened.data);
                    const currentByTitle = new Map(currentEntriesForProof.map((entry) => [(0, util_1.normalizeTitle)(entry.title), entry]));
                    if (requiredTargets.some((title) => !currentByTitle.has(title))) continue;
                    const proofs = Array.isArray(operation.distributionProofs) ? operation.distributionProofs : [];
                    const proofPassed = proofs.length > 0 && proofs.every((proof) => {
                        const normalizedTitle = (0, util_1.normalizeTitle)(proof?.targetTitle || '');
                        const targetEntry = currentByTitle.get(normalizedTitle);
                        if (!targetEntry) return false;
                        const content = (0, util_1.normalizeFact)(targetEntry.content || '');
                        const facts = (proof?.requiredFacts ?? []).map((fact) => (0, util_1.normalizeFact)(fact)).filter(Boolean);
                        const emptySections = (proof?.requiredEmptySections ?? []).map((name) => (0, entry_section_1.canonicalSectionName)(name, targetEntry.type)).filter(Boolean);
                        return (facts.length > 0 || emptySections.length > 0)
                            && facts.every((fact) => content.includes(fact))
                            && emptySections.every((section) => !(targetEntry.sections?.values?.[section] ?? []).length);
                    });
                    if (!proofPassed) continue;
                }
                delete opened.data.entries[target.mapKey];
                deleted.push({ uid: target.uid, title: target.title });
            }
            deletedCount = deleted.length;
        }

        const businessChanged = writeOperations.length > 0 || deletedCount > 0;
        const changed = businessChanged || legacyProjectionRemoved;
        if (!changed) {
            const result = parseEntries(opened.data);
            result.changed = false;
            result.businessChanged = false;
            result.worldbookName = opened.name;
            result.writeCount = 0;
            result.deleteCount = 0;
            result.warehouse = { created: [], updated: [], deleted: [], createdCount: 0, updatedCount: 0, deletedCount: 0, operationCount: 0 };
            result.receipt = null;
            return result;
        }

        if (options.rebalanceKind) {
            applySummaryRebalance(this, opened.data, settings, options.rebalanceKind, options.summaryText || '', focusUid);
        }
        else {
            this.applyNativeFields(parseEntries(opened.data), settings, focusUid, new Set([...touchedUids, ...createdUids]), createdUids);
        }

        validate?.();
        const latest = await loadWorldInfoAuthoritative(opened.api, opened.name);
        if (!latest || digestWorldbook(latest) !== beforeVersion) throw new Error('世界书在提交前已被其他操作修改，拒绝覆盖');
        validate?.();
        const verifiedData = await this.commitWithRollback(opened, beforeData, validate, (data) => {
            // Verify against the complete plan so an entry intentionally
            // settled/deleted after its final write is not falsely required
            // to remain present in the authoritative reread.
            verifyWriteResults(data, expectedAfterWrites, plan.operations, operationId, settings, focusUid);
            verifyExitResults(data, deleted);
        }, '世界书提交后验证', '提交前快照');
        opened.data = verifiedData;

        const result = parseEntries(verifiedData);
        const createdTitles = result
            .filter((entry) => createdUids.has(String(entry.uid)))
            .map((entry) => entry.title);
        const updatedTitles = result
            .filter((entry) => touchedUids.has(String(entry.uid)) && !createdUids.has(String(entry.uid)))
            .map((entry) => entry.title);
        const deletedTitles = deleted.map((entry) => entry.title);
        result.changed = true;
        result.businessChanged = businessChanged;
        result.worldbookName = opened.name;
        result.writeCount = createdTitles.length + updatedTitles.length;
        result.deleteCount = deletedCount;
        result.warehouse = {
            created: [...new Set(createdTitles)],
            updated: [...new Set(updatedTitles)],
            deleted: [...new Set(deletedTitles)],
            createdCount: new Set(createdTitles).size,
            updatedCount: new Set(updatedTitles).size,
            deletedCount,
            operationCount: writeOperations.length,
        };
        result.receipt = buildCommitReceipt(receiptBefore, verifiedData, {
            id: operationId,
            sourceMessageKey,
            messageIndex: snapshot?.messageIndex,
            playerMessageIndex: snapshot?.playerMessageIndex,
            contentHash: snapshot?.contentHash,
            dialogueHash: snapshot?.dialogueHash,
            sourceKind: options.sourceKind || '',
            worldbookName: opened.name,
        });
        return result;
    }
    async rollbackReceipts(settings, receipts, focusUid, snapshot, validate) {
        const ordered = (Array.isArray(receipts) ? receipts : []).filter((item) => item && Array.isArray(item.changes) && item.changes.length);
        if (!ordered.length) return { entries: [], changed: false, rolledBack: 0 };
        validate?.();
        this.assertChat(snapshot?.chatKey ?? '');
        const opened = await this.open(settings, false, validate, snapshot?.chatKey, snapshot?.worldbookName);
        if (snapshot?.worldbookName && opened.name !== snapshot.worldbookName) throw new Error('目标世界书已经变化，拒绝回滚');
        if (ordered.some((item) => item.worldbookName && item.worldbookName !== opened.name)) throw new Error('近期写入回执属于其他世界书');
        const beforeVersion = digestWorldbook(opened.data);
        const beforeData = (0, util_1.clone)(opened.data);
        const touchedUids = new Set();
        let changedCount = 0;
        let alreadyRolledBack = 0;
        for (const receipt of [...ordered].reverse()) {
            for (const change of [...receipt.changes].reverse()) {
                const uid = String(change.uid ?? '');
                if (!uid) continue;
                const current = findRawEntry(opened.data, uid);
                const currentDigest = current ? semanticRawDigest(current.raw) : '';
                const beforeDigest = change.before ? semanticRawDigest(change.before) : '';
                if (currentDigest === beforeDigest) {
                    alreadyRolledBack += 1;
                    continue;
                }
                if (String(change.afterDigest ?? '') !== currentDigest) {
                    throw new Error(`条目 UID ${uid} 在写入回执后又被修改，已停止自动回滚`);
                }
                if (!change.before) {
                    if (!current) continue;
                    const extension = readExtension(current.raw);
                    if (extension.focus === true || extension.locked === true || current.raw.locked === true)
                        throw new Error(`条目“${current.raw.comment || uid}”已被设为焦点或锁定，不能自动删除`);
                    delete opened.data.entries[current.mapKey];
                    changedCount += 1;
                    continue;
                }
                const restored = structuredClone(change.before);
                if (current) {
                    // ui.72: 回滚应尽可能恢复写入前的原始快照。过去这里调用 markManaged() 会刷新 updatedAt，
                    // 并无条件写入 locked:false，导致“业务内容已回滚、内部生命周期却被当成刚更新”。
                    // 只有玩家在提交后确实手工改变了焦点/锁定时，才把这两个交互状态带回恢复快照。
                    const currentExtension = readExtension(current.raw);
                    const beforeExtension = readExtension(change.before);
                    const ensureRestoredExtension = () => {
                        restored.extensions ?? (restored.extensions = {});
                        const existing = restored.extensions[constants_1.WORLD_INFO_EXTENSION_KEY];
                        if (!existing || typeof existing !== 'object') restored.extensions[constants_1.WORLD_INFO_EXTENSION_KEY] = structuredClone(beforeExtension || {});
                        return restored.extensions[constants_1.WORLD_INFO_EXTENSION_KEY];
                    };
                    if ((currentExtension.focus === true) !== (beforeExtension.focus === true)) ensureRestoredExtension().focus = currentExtension.focus === true;
                    if ((currentExtension.locked === true) !== (beforeExtension.locked === true)) ensureRestoredExtension().locked = currentExtension.locked === true;
                    if ((current.raw.locked === true) !== (change.before.locked === true)) restored.locked = current.raw.locked === true;
                }
                const mapKey = current?.mapKey || String(change.beforeMapKey ?? restored.uid ?? uid);
                opened.data.entries[mapKey] = restored;
                touchedUids.add(String(restored.uid ?? uid));
                changedCount += 1;
            }
        }
        if (!changedCount) {
            const unchanged = parseEntries(opened.data);
            unchanged.changed = false;
            unchanged.rolledBack = 0;
            unchanged.alreadyRolledBack = alreadyRolledBack;
            return unchanged;
        }
        const restoredEntries = parseEntries(opened.data);
        this.applyNativeFields(restoredEntries, settings, focusUid, touchedUids);
        validate?.();
        const latest = await loadWorldInfoAuthoritative(opened.api, opened.name);
        if (!latest || digestWorldbook(latest) !== beforeVersion) throw new Error('世界书在回滚前已被其他操作修改，拒绝覆盖');
        validate?.();
        const verified = await this.commitWithRollback(opened, beforeData, validate, (data) => {
            if (!data) throw new Error('世界书回滚后回读失败');
        }, '世界书回滚', '回滚前快照');
        const result = parseEntries(verified);
        result.changed = true;
        result.rolledBack = ordered.length;
        result.alreadyRolledBack = alreadyRolledBack;
        return result;
    }
    async commitWithRollback(opened, beforeData, validate, verify, failureLabel, snapshotLabel) {
        const beforeDigest = digestWorldbook(beforeData);
        const intendedDigest = digestWorldbook(opened.data);
        let saveError = null;
        let verified = null;
        try {
            await this.save(opened);
        }
        catch (error) {
            saveError = error;
        }
        try {
            validate?.();
            verified = await loadWorldInfoAuthoritative(opened.api, opened.name);
            if (!verified) throw new Error(`${failureLabel}后权威回读失败`);
            validate?.();
            const actualDigest = digestWorldbook(verified);
            if (saveError && actualDigest !== intendedDigest) throw saveError;
            verify?.(verified);
            return verified;
        }
        catch (error) {
            let current = verified;
            if (!current) {
                try { current = await loadWorldInfoAuthoritative(opened.api, opened.name); }
                catch { }
            }
            if (current && digestWorldbook(current) === beforeDigest) {
                const primary = saveError || error;
                throw new Error(`${failureLabel}失败，后端保持${snapshotLabel}：${(0, util_1.errorText)(primary)}`);
            }
            opened.data = (0, util_1.clone)(beforeData);
            try {
                await this.save(opened);
                const restored = await loadWorldInfoAuthoritative(opened.api, opened.name);
                if (!restored || digestWorldbook(restored) !== beforeDigest)
                    throw new Error('恢复后快照不一致');
            }
            catch (rollbackError) {
                throw new Error(`${failureLabel}失败，且${snapshotLabel}恢复失败：${(0, util_1.errorText)(saveError || error)}；${(0, util_1.errorText)(rollbackError)}`);
            }
            throw new Error(`${failureLabel}失败，已恢复${snapshotLabel}：${(0, util_1.errorText)(saveError || error)}`);
        }
    }
    applyNativeFields(entries, settings, focusUid, touchedUids, _createdUids = new Set()) {
        const normalizedFocusUid = String(focusUid ?? '');
        const recall = (0, recall_policy_1.buildRecallPlan)(entries, settings, normalizedFocusUid);
        const relationIndex = (0, governance_1.buildDirectRelationIndex)(entries);
        // 原生召回字段只是对现有业务状态的投影，不能再次刷新业务 updatedAt。
        // 否则同批次触及多个场景时，循环顺序会改变场景新旧排序：
        // 规划时还是“上一场景”的条目，落盘后可能因更晚的 Date.now() 变成“当前场景”，
        // 从而出现“非关键词条目仍保留触发词”的回读失败。
        const projectionTimestamp = Date.now();
        for (const entry of entries) {
            const focus = normalizedFocusUid ? entry.uid === normalizedFocusUid : entry.focus;
            const managed = entry.managed || touchedUids.has(entry.uid) || focus;
            if (!managed) continue;
            const profile = recall.profiles.get(String(entry.uid));
            if (!profile) continue;
            const previousUpdatedAt = Number(readExtension(entry.raw).updatedAt) || 0;
            applyNativeProfile(entry.raw, profile);
            const extension = markManaged(entry.raw, '', entry.title, '');
            extension.updatedAt = previousUpdatedAt || projectionTimestamp;
            applyKeywordPolicy(entry.raw, entry, profile, extension);
            extension.focus = focus;
            extension.chatKey = this.chatKey();
            extension.recallProfile = profile.name;
            extension.lifecycle = profile.lifecycle;
            extension.semanticRole = profile.semanticRole;
            extension.storageRole = 'warehouse';
            extension.entityClass = /^(?:人物|角色|NPC)$/u.test(String(entry.type ?? ''))
                ? (profile.lifecycle === 'settled' ? 'settled-character' : 'character')
                : /^(?:场景|时空)$/u.test(String(entry.type ?? '')) ? 'scene'
                    : entry.type === '事件' ? 'event' : String(entry.type ?? 'object');
            extension.hostSceneTitle = profile.lifecycle === 'current' && /^(?:人物|角色|NPC)$/u.test(String(entry.type ?? ''))
                ? (entries.find((candidate) => /^(?:scene-current|scene-current-storage)$/u.test(String(candidate.semanticRole ?? '')))?.title || '')
                : String(extension.hostSceneTitle || '');
            extension.relatedIds = [...(relationIndex.get(String(entry.uid)) ?? new Set())];
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
        const chatMetadata = context.chatMetadata ?? {};
        // [MA-WB-SCOPE-01] 唯一目标来自当前聊天绑定；禁止插件全局名称覆盖宿主绑定。
        let name = String(chatMetadata?.[metadataKey] || chatMetadata?.world_info || '').trim();
        let generatedName = false;
        if (!name && settings.autoCreateLorebook) {
            const display = (0, util_1.safeId)(context.name2 || context.name1 || 'Chat') || 'Chat';
            const suffix = (0, util_1.hashText)(expectedChatKey || this.chatKey() || `${context.characterId ?? context.name2 ?? 'chat'}|${context.getCurrentChatId?.() ?? context.chatId ?? ''}`).slice(-6) || 'chat';
            name = `MA_${display}_${suffix}`;
            generatedName = true;
        }
        if (!name) throw new Error('当前聊天未绑定世界书');
        if (expectedName && name !== expectedName)
            throw new Error('目标世界书已经变化，拒绝继续');
        validate?.();
        let data = await loadWorldInfoAuthoritative(api, name);
        validate?.();
        this.assertChat(expectedChatKey);
        if (!data && create) {
            if (typeof api.createNewWorldInfo !== 'function') throw new Error('SillyTavern 未提供 createNewWorldInfo');
            validate?.();
            await api.createNewWorldInfo(name, { interactive: false });
            validate?.();
            this.assertChat(expectedChatKey);
            data = await loadWorldInfoAuthoritative(api, name);
            validate?.();
        }
        if (!data && !create && generatedName)
            data = { entries: {} };
        if (!data) throw new Error(`世界书“${name}”不存在`);
        data.entries ?? (data.entries = {});
        if (create && String(chatMetadata?.[metadataKey] || chatMetadata?.world_info || '') !== name) {
            validate?.();
            this.assertChat(expectedChatKey);
            context.chatMetadata ?? (context.chatMetadata = chatMetadata);
            const metadataRef = context.chatMetadata;
            const bindingChatKey = expectedChatKey || this.chatKey();
            const hadMetadataKey = Object.prototype.hasOwnProperty.call(metadataRef, metadataKey);
            const hadWorldInfo = Object.prototype.hasOwnProperty.call(metadataRef, 'world_info');
            const previousMetadataKey = metadataRef[metadataKey];
            const previousWorldInfo = metadataRef.world_info;
            metadataRef[metadataKey] = name;
            metadataRef.world_info = name;
            if (typeof context.saveMetadata !== 'function') {
                restoreWorldbookBinding(metadataRef, metadataKey, hadMetadataKey, previousMetadataKey, hadWorldInfo, previousWorldInfo);
                throw new Error('SillyTavern 未提供聊天元数据保存接口 saveMetadata');
            }
            try {
                await context.saveMetadata();
                validate?.();
                this.assertChat(bindingChatKey);
                if (this.context().chatMetadata !== metadataRef)
                    throw new Error('世界书绑定保存期间聊天元数据对象已经变化');
            }
            catch (error) {
                restoreWorldbookBinding(metadataRef, metadataKey, hadMetadataKey, previousMetadataKey, hadWorldInfo, previousWorldInfo);
                if (this.chatKey() !== bindingChatKey || this.context().chatMetadata !== metadataRef)
                    throw new Error(`世界书已经创建，但聊天绑定保存失败；已恢复原聊天内存，未向新聊天反向保存：${(0, util_1.errorText)(error)}`);
                try { await context.saveMetadata(); }
                catch (rollbackError) {
                    throw new Error(`世界书已经创建，但聊天绑定保存失败，且旧绑定反向保存失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackError)}`);
                }
                throw new Error(`世界书已经创建，但聊天绑定保存失败；已恢复并重新保存旧绑定：${(0, util_1.errorText)(error)}`);
            }
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
function applySummaryRebalance(adapter, data, settings, kind, summaryText, focusUid = '') {
    const entries = parseEntries(data);
    const normalizedSummary = (0, util_1.normalizeFact)(summaryText);
    const recall = (0, recall_policy_1.buildRecallPlan)(entries, settings, focusUid || entries.find((entry) => entry.focus)?.uid || '');
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
    adapter.applyNativeFields(parseEntries(data), settings, focusUid, new Set());
}
function buildContextWorldInfoApi(context) {
    const headers = () => context.getRequestHeaders?.() ?? { 'Content-Type': 'application/json' };
    const cachedLoadWorldInfo = typeof context.loadWorldInfo === 'function' ? context.loadWorldInfo.bind(context) : null;
    const loadWorldInfoFresh = async (name) => {
        if (typeof globalThis.fetch !== 'function' || typeof globalThis.location === 'undefined') {
            return cachedLoadWorldInfo ? cachedLoadWorldInfo(name) : null;
        }
        const response = await globalThis.fetch('/api/worldinfo/get', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ name }),
            cache: 'no-cache',
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`世界书权威读取失败：HTTP ${response.status}`);
        return response.json();
    };
    if (!cachedLoadWorldInfo) throw new Error('SillyTavern 未提供官方 loadWorldInfo');
    if (typeof context.saveWorldInfo !== 'function') throw new Error('SillyTavern 未提供官方 saveWorldInfo');
    const loadWorldInfo = cachedLoadWorldInfo;
    const saveWorldInfo = context.saveWorldInfo.bind(context);
    return {
        METADATA_KEY: 'world_info', loadWorldInfo, loadWorldInfoFresh, saveWorldInfo,
        async createNewWorldInfo(name) { await saveWorldInfo(name, { entries: {} }, true); await context.updateWorldInfoList?.(); return true; },
        createWorldInfoEntry(_name, data) {
            data.entries ?? (data.entries = {});
            let uid = 0; while (Object.prototype.hasOwnProperty.call(data.entries, String(uid))) uid += 1;
            const entry = createDefaultWorldInfoEntry(uid); data.entries[String(uid)] = entry; return entry;
        },
    };
}

function restoreWorldbookBinding(metadata, metadataKey, hadMetadataKey, previousMetadataKey, hadWorldInfo, previousWorldInfo) {
    if (hadMetadataKey) metadata[metadataKey] = previousMetadataKey;
    else delete metadata[metadataKey];
    if (hadWorldInfo) metadata.world_info = previousWorldInfo;
    else delete metadata.world_info;
}
function loadWorldInfoAuthoritative(api, name) {
    if (typeof api?.loadWorldInfoFresh === 'function') return api.loadWorldInfoFresh(name);
    if (typeof api?.loadWorldInfo === 'function') return api.loadWorldInfo(name);
    throw new Error('SillyTavern 未提供 loadWorldInfo');
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
        const sections = (0, entry_section_1.parseEntrySections)(content, split.type);
        const triggerKeywords = (0, util_1.normalizeStringArray)(raw.key).filter((item) => !(0, util_1.isUidKeyword)(item));
        const aliases = (0, util_1.unique)((0, entry_section_1.sectionLines)(content, ['别名', '称号', '其他名称'], split.type));
        const extension = readExtension(raw);
        const storedKeywords = (0, util_1.normalizeStringArray)(extension.recallKeywords);
        output.push({ uid: String(raw.uid ?? mapUid), mapKey: String(mapUid), title, normalizedTitle: title.toLocaleLowerCase(), type: split.type, name: split.name, content, sections, keywords: (0, util_1.unique)([split.name, ...triggerKeywords, ...storedKeywords]), triggerKeywords, aliases, references: (0, entry_section_1.extractReferences)(content, split.type), focus: extension.focus === true, locked: extension.locked === true || raw.locked === true, managed: extension.managed === true, updatedAt: Number(extension.updatedAt) || 0, memoryTier: String(extension.memoryTier ?? ''), lifecycle: String(extension.lifecycle ?? ''), semanticRole: String(extension.semanticRole ?? ''), storageRole: String(extension.storageRole ?? ''), entityClass: String(extension.entityClass ?? ''), hostSceneTitle: String(extension.hostSceneTitle ?? ''), relatedIds: Array.isArray(extension.relatedIds) ? extension.relatedIds.map(String) : [], sceneStage: String(extension.sceneStage ?? ''), chatKey: String(extension.chatKey ?? ''), recallProfile: String(extension.recallProfile ?? ''), activation: { enabled: raw.disable !== true, constant: raw.constant === true, selective: raw.selective === true, vectorized: raw.vectorized === true, recursive: raw.recursive === true || (raw.preventRecursion !== true && raw.excludeRecursion !== true), preventRecursion: raw.preventRecursion === true, excludeRecursion: raw.excludeRecursion === true, delayUntilRecursion: finiteNumber(raw.delayUntilRecursion, 0), depth: Math.max(0, finiteNumber(raw.depth, 4)), order: finiteNumber(raw.order, 400), position: finiteNumber(raw.position, 0), role: finiteNumber(raw.role, 0), scanDepth: raw.scanDepth == null ? null : finiteNumber(raw.scanDepth, null), probability: finiteNumber(raw.probability, 100), useProbability: raw.useProbability !== false, disabled: raw.disable === true }, raw });
    }
    return output.sort((left, right) => left.title.localeCompare(right.title));
}
function hydrateRaw(raw, entry, sourceMessageKey, operationId) {
    const split = (0, util_1.splitTitle)(entry.title);
    raw.comment = entry.title;
    const safeSections = {
        order: entry.sections.order ?? [],
        values: Object.fromEntries(Object.entries(entry.sections.values ?? {}).map(([section, lines]) => [section, (0, util_1.unique)((lines ?? []).map((line) => (0, parser_1.sanitizeWorldbookLine)(line)).filter(Boolean))])),
    };
    raw.content = (0, parser_1.serializeEntrySections)(safeSections);
    raw.key = (0, util_1.unique)([
        split?.name,
        ...entry.keywords.map((item) => (0, parser_1.sanitizeWorldbookLine)(item)).filter((item) => item && !(0, util_1.isUidKeyword)(item) && (0, util_1.normalizeFact)(item) !== (0, util_1.normalizeFact)(split?.type ?? '')),
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
    raw.key = (0, util_1.unique)(candidates);
}
function verifyRecallConstraints(entries) {
    const currentScenes = entries.filter((entry) => entry.managed && /^(?:scene-current|scene-current-storage)$/u.test(entry.semanticRole));
    if (currentScenes.length > 1) throw new Error('当前场景超过一条');
    for (const entry of entries.filter((item) => item.managed)) {
        if (entry.focus && (!entry.activation.constant || !entry.activation.preventRecursion || !entry.activation.excludeRecursion)) throw new Error(`长期焦点未保持常驻递归隔离：${entry.title}`);
        if (entry.activation.vectorized && entry.triggerKeywords?.length) throw new Error(`纯向量条目仍保留关键词：${entry.title}`);
        const maySpread = /^(scene-|world-state)/u.test(entry.semanticRole || '');
        if (!maySpread && entry.activation.preventRecursion !== true) throw new Error(`非场景/世界条目仍可继续递归：${entry.title}`);
    }
}

function removeLegacyRuntimeProjection(data) {
    let removed = false;
    for (const [mapKey, raw] of Object.entries(data?.entries ?? {})) {
        if (!raw || typeof raw !== 'object') continue;
        const extension = readExtension(raw);
        const legacy = String(raw.comment ?? '') === LEGACY_RUNTIME_PROJECTION_TITLE
            || String(extension.semanticRole ?? '') === 'activity-pack';
        if (!legacy) continue;
        delete data.entries[mapKey];
        removed = true;
    }
    return removed;
}
function ensureUidIdentity(raw, uid, logicalTitle) {
    const title = (0, util_1.stripUidSuffix)(logicalTitle || String(raw.comment ?? raw.name ?? raw.title ?? ''));
    const split = (0, util_1.splitTitle)(title);
    if (title) raw.comment = title;
    raw.key = (0, util_1.unique)([
        split?.name,
        ...(0, util_1.normalizeStringArray)(raw.key).filter((item) => !(0, util_1.isUidKeyword)(item) && (0, util_1.normalizeFact)(item) !== (0, util_1.normalizeFact)(split?.type ?? '')),
    ]);
}
function snapshotRawEntries(data) {
    const output = new Map();
    for (const [mapKey, raw] of Object.entries(data?.entries ?? {})) {
        if (!raw || typeof raw !== 'object') continue;
        const uid = String(raw.uid ?? mapKey);
        output.set(uid, { mapKey: String(mapKey), raw: structuredClone(raw), digest: semanticRawDigest(raw) });
    }
    return output;
}
function buildCommitReceipt(before, data, meta = {}) {
    const after = snapshotRawEntries(data);
    const changes = [];
    const uids = new Set([...before.keys(), ...after.keys()]);
    for (const uid of uids) {
        const previous = before.get(uid);
        const current = after.get(uid);
        const beforeDigest = previous?.digest ?? '';
        const afterDigest = current?.digest ?? '';
        if (beforeDigest === afterDigest) continue;
        changes.push({
            uid,
            beforeMapKey: previous?.mapKey ?? '',
            before: previous ? previous.raw : null,
            afterDigest,
        });
    }
    if (!changes.length) return null;
    return {
        id: String(meta.id || (0, util_1.hashText)(`${meta.sourceMessageKey || ''}|${Date.now()}`)),
        sourceMessageKey: String(meta.sourceMessageKey ?? ''),
        messageIndex: Number.isInteger(meta.messageIndex) ? meta.messageIndex : -1,
        playerMessageIndex: Number.isInteger(meta.playerMessageIndex) ? meta.playerMessageIndex : -1,
        contentHash: String(meta.contentHash ?? ''),
        dialogueHash: String(meta.dialogueHash ?? ''),
        sourceKind: String(meta.sourceKind ?? ''),
        worldbookName: String(meta.worldbookName ?? ''),
        createdAt: Date.now(),
        changes,
    };
}
function semanticRawDigest(raw) {
    if (!raw || typeof raw !== 'object') return '';
    const extension = readExtension(raw);
    return (0, util_1.hashText)(JSON.stringify({
        uid: String(raw.uid ?? ''),
        title: String(raw.comment ?? raw.name ?? raw.title ?? ''),
        content: String(raw.content ?? ''),
        sourceMessageKey: String(extension.sourceMessageKey ?? ''),
        lastOperationId: String(extension.lastOperationId ?? ''),
    }));
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
function verifyWriteResults(data, expectedEntries, operations, operationId, settings, focusUid) {
    const writes = operations.filter((operation) => !['noop', 'delete-entry'].includes(operation.kind));
    if (!writes.length) return;
    const actual = parseEntries(data);
    const touched = new Set(writes.filter((operation) => operation.kind !== 'create-entry' && operation.targetUid).map((operation) => String(operation.targetUid)));
    const createdTitles = new Set(writes.filter((operation) => operation.kind === 'create-entry').map((operation) => (0, util_1.normalizeTitle)(operation.title)));
    const deletedUids = new Set(operations.filter((operation) => operation.kind === 'delete-entry' && operation.targetUid).map((operation) => String(operation.targetUid)));
    const deletedTitles = new Set(operations.filter((operation) => operation.kind === 'delete-entry').map((operation) => (0, util_1.normalizeTitle)(operation.title)));
    const expected = expectedEntries.filter((entry) => (touched.has(entry.uid) || createdTitles.has((0, util_1.normalizeTitle)(entry.title)))
        && !deletedUids.has(String(entry.uid)) && !deletedTitles.has((0, util_1.normalizeTitle)(entry.title)));
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
    for (const record of deleted) {
        const uid = String(record?.uid ?? record ?? '');
        const title = String(record?.title ?? '');
        const sameOldEntry = entries.some((item) => item.uid === uid && (!title || (0, util_1.normalizeTitle)(item.title) === (0, util_1.normalizeTitle)(title)));
        if (sameOldEntry) throw new Error(`条目删除未正确落盘：${title || `UID ${uid}`}`);
    }
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
