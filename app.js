/**
 * Mirror Abyss deployment bundle.
 * Generated from src; business logic must be edited in src and rebundled.
 */
var MA_MODULES={"application":function(module,exports,require){
/**
 * Mirror Abyss — application
 *
 * 职责：应用入口与主流程编排（审核→修正→提取→SceneGroup/小总结调度）。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
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
        this.gameTimeAnchorCache = null;
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
            const phase = String(progress?.phase || '');
            const meta = { ...(progress || {}), messageIndex: progress?.messageIndex ?? active?.messageIndex ?? null };
            // ui.73: 四阶段正文指示器只接收真正的提取/写入阶段。
            // 小总结、大总结、来源补齐和生命周期 warning 都属于后台记忆维护，
            // 不能再伪装成“提取”状态，更不能把上一条正文染成需修正/失败。
            if (phase === 'write') {
                if (progress?.state === 'running') this.controlPanel?.setTaskProgress?.('extract', 'success', '最终协议已形成，等待写入', meta);
                this.controlPanel?.setTaskProgress?.('write', progress?.state || 'running', progress?.detail || '', meta);
                return;
            }
            if (phase === 'extract') {
                this.controlPanel?.setTaskProgress?.('extract', progress?.state || 'running', progress?.detail || '', meta);
                return;
            }
            const detail = String(progress?.detail || '').trim();
            if (detail) this.controlPanel?.setStatus?.(detail, progress?.state === 'error');
            if (progress?.autoRetryStopped === true) this.controlPanel?.refreshSummaryFailures?.();
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
            getGameTimeAnchor: () => this.gameTimeAnchorCache ?? null,
            setGameTimeAnchor: (value) => this.setGameTimeAnchor(value),
            process: () => this.processLatest(),
            audit: () => this.audit(),
            extract: () => this.extract(),
            smallSummary: () => this.smallSummary(),
            largeSummary: () => this.largeSummary(),
            retryFailedSmallSummary: (taskId = '') => this.retryFailedSmallSummary(taskId),
            summaryFailureState: () => this.memoryRunner.summaryFailureState(),
            summarizeEntries: (kind, uids) => this.summarizeEntries(kind, uids),
            mergeEntries: (uids) => this.mergeEntries(uids),
            deleteEntries: (uids) => this.deleteEntries(uids),
            testApiProbe: () => this.testApiProbe(),
            cancel: () => this.cancel(),
            taskStatus: () => this.status(),
            loadWorkspace: () => this.loadWorkspace(),
            replanRecall: () => this.replanRecall(),
            updateEntry: (uid, patch) => this.updateEntry(uid, patch),
            setFocus: (uid, enabled) => this.setFocus(uid, enabled),
            setBedrockLocked: (uid, locked) => this.setBedrockLocked(uid, locked),
            migrate: () => this.migrate(),
            commitMigration: () => this.commitMigration(),
            undoMigration: () => this.undoMigration(),
            migrationPreview: () => this.migrationPreview(),
            previewWorldSettings: (sourceText) => this.previewWorldSettings(sourceText),
            commitWorldSettings: (sourceText) => this.commitWorldSettings(sourceText),
            clearWorldSettingsPreview: () => this.clearWorldSettingsPreview(),
            worldSettingsPreview: () => this.worldSettingsPreview(),
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
        // [MA-ROLLBACK-RESET-01] Edit / Swipe / Delete 回滚期间，当前聊天只允许恢复世界书，不允许产生新的旧链任务。
        // 这是回滚事务的单一冻结边界；回滚完成后立即解除，不建立第二套任务状态机。
        this.reconcilingChats = new Set();
        this.acceptanceMode = false;
        this.started = false;
    }
    // [MA-UID-BASELINE-01] 首次进入当前聊天时只扫描世界书此刻真实存在的 UID，直接作为新运行结构的起点。
    // 不推断过去是否做过小/大总结，也不修改现有世界书条目；从本版本之后重新记录 S/L、场景组、计数器与回滚快照。
    async initializeUidRuntimeState() {
        const chatKey = safeChatKey(this.host);
        if (!chatKey) return { initialized: false, reason: 'no-chat' };
        if (this.host.uidRuntimeStateReady?.()) return { initialized: false, reason: 'ready' };
        const settings = this.settings();
        const token = { cancelled: false, reason: '' };
        const snapshot = this.host.captureMaintenanceSnapshot(settings, 'uidRuntimeBootstrap', token);
        const validate = () => this.host.assertSnapshot(snapshot, this.settings());
        let worldbook = { entries: [] };
        if (String(snapshot.worldbookName || '').trim()) {
            worldbook = await this.worldbook.read(settings, snapshot, validate);
            validate();
        }
        const baselineEntries = (worldbook.entries ?? []).map((entry) => structuredClone(entry));
        const baselineUids = [...new Set(baselineEntries.map((entry) => String(entry?.uid ?? '').trim()).filter(Boolean))];
        await this.host.initializeUidRuntimeState(baselineEntries, snapshot, this.settings());
        return { initialized: true, uidCount: baselineUids.length };
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
        this.clearPendingMessageTimers();
        this.clearPendingSourceReconcileTimers();
        this.reconcilingChats.clear();
        this.host.clearInternalMessageMutations();
        this.controlPanel.unmount();
    }
    isStarted() { return this.started; }
    settings() { return this.settingsStore.load(this.host.context()); }
    configure(patch) { return this.settingsStore.save(this.host.context(), patch); }
    async setGameTimeAnchor(value) {
        const label = String(value ?? '').trim().slice(0, 80);
        const settings = this.settings();
        const snapshot = this.host.captureMaintenanceSnapshot(settings, 'gameTimeWorldbook', { cancelled: false, reason: '' });
        const validate = () => this.host.assertSnapshot(snapshot, this.settings());
        const entries = await this.worldbook.list(settings, snapshot, validate);
        const title = '基础设定｜游戏时间';
        const current = entries.find((entry) => String(entry.title || '') === title);
        if (!label) {
            if (current) {
                if (current.bedrockLocked === true || current.locked === true) await this.worldbook.setBedrockLocked(settings, current.uid, false, snapshot, validate);
                await this.worldbook.deleteEntries(settings, [current.uid], snapshot, validate);
            }
            this.gameTimeAnchorCache = null;
            return null;
        }
        const content = `【世界常识】
- 当前游戏时间：${label}`;
        if (current) {
            if (current.bedrockLocked === true || current.locked === true) await this.worldbook.setBedrockLocked(settings, current.uid, false, snapshot, validate);
            await this.worldbook.updateEntry(settings, current.uid, { title, content }, snapshot, validate);
        } else {
            const plan = { operations: [
                { id: 'game-time:create', kind: 'create-entry', operation: 'create', title, reason: '玩家设置游戏时间常驻条目' },
                { id: 'game-time:content', kind: 'replace-entry', operation: 'replace-entry', title, newValue: content, reason: '写入游戏时间常驻条目' },
            ] };
            await this.worldbook.apply(settings, plan, 'manual:game-time', content, this.host.getFocusUid?.() || '', snapshot, validate, { sourceKind: 'manual-merge' });
        }
        this.gameTimeAnchorCache = { label, source: 'worldbook' };
        return this.gameTimeAnchorCache;
    }
    audit() { return this.enqueueTask('audit', undefined, false); }
    extract() { return this.enqueueTask('extraction', undefined, false); }
    smallSummary() {
        return this.enqueueMaintenance('smallSummary', async (settings, snapshot) => this.memoryRunner.runTask('smallSummary', settings, snapshot, { allowCascade: false }));
    }
    largeSummary() {
        return this.enqueueMaintenance('largeSummary', async (settings, snapshot) => this.memoryRunner.runTask('largeSummary', settings, snapshot, { allowCascade: false }));
    }
    retryFailedSmallSummary(taskId = '') {
        const targetId = String(taskId ?? '').trim();
        return this.enqueueMaintenance('retrySmallSummary', async (settings, snapshot) => this.memoryRunner.retryFailedSmallSummary(settings, snapshot, targetId));
    }
    summarizeEntries(kind, uids) {
        const summaryKind = kind === 'large' ? 'large' : 'small';
        const selectedUids = [...new Set((uids ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean))];
        if (!selectedUids.length) throw new Error('至少选择一个条目才能总结');
        const taskType = summaryKind === 'large' ? 'selectedLargeSummary' : 'selectedSmallSummary';
        return this.enqueueMaintenance(taskType, async (settings, snapshot) => this.memoryRunner.summarizeSelected(summaryKind, settings, snapshot, selectedUids));
    }
    async unlockSelectedEntries(settings, snapshot, selectedUids) {
        const validate = () => this.host.assertSnapshot(snapshot, this.settings());
        const entries = await this.worldbook.list(settings, snapshot, validate);
        const selected = new Set(selectedUids.map(String));
        for (const entry of entries) {
            if (!selected.has(String(entry.uid))) continue;
            if (entry.bedrockLocked === true || entry.locked === true) await this.worldbook.setBedrockLocked(settings, entry.uid, false, snapshot, validate);
        }
    }
    mergeEntries(uids) {
        const selectedUids = [...new Set((uids ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean))];
        if (selectedUids.length < 2) throw new Error('至少选择两个条目才能合并');
        return this.enqueueMaintenance('mergeEntries', async (settings, snapshot) => {
            await this.unlockSelectedEntries(settings, snapshot, selectedUids);
            return this.memoryRunner.mergeSelected(settings, snapshot, selectedUids);
        });
    }
    deleteEntries(uids) {
        const selectedUids = [...new Set((uids ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean))];
        if (!selectedUids.length) throw new Error('至少选择一个条目才能删除');
        return this.enqueueMaintenance('deleteEntries', async (settings, snapshot) => {
            const validate = () => this.host.assertSnapshot(snapshot, this.settings());
            await this.unlockSelectedEntries(settings, snapshot, selectedUids);
            const result = await this.worldbook.deleteEntries(settings, selectedUids, snapshot, validate);
            const deletedUids = (result?.deletedEntries ?? []).map((entry) => String(entry.uid ?? '')).filter(Boolean);
            if (deletedUids.length) {
                const cursor = this.host.cursor();
                const nextCursor = (0, memory_1.reconcileCursorSceneUids)(cursor, deletedUids, []);
                await this.host.saveCursor(nextCursor, snapshot, this.settings());
            }
            return result;
        });
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
            const profileId = String(settings.modelProfileId || '');
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
        const liveSettings = this.settings();
        let worldbookBackup = null;
        let resetSnapshot = null;
        try {
            if (chatKey) {
                resetSnapshot = this.host.captureMaintenanceSnapshot(liveSettings, 'resetPluginWorldbook', { cancelled: false, reason: '' });
                worldbookBackup = await this.worldbook.readRaw(liveSettings, resetSnapshot, () => this.host.assertSnapshot(resetSnapshot, this.settings()));
                const cleared = (0, util_1.clone)(worldbookBackup.data);
                cleared.entries = {};
                await this.worldbook.replaceRaw(liveSettings, worldbookBackup.name, cleared, resetSnapshot, () => this.host.assertSnapshot(resetSnapshot, this.settings()));
            }
            const settings = this.settingsStore.reset(context);
            if (chatKey) await this.host.resetCurrentChatState();
            this.gameTimeAnchorCache = null;
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
            this.reconcilingChats.clear();
            this.host.clearInternalMessageMutations();
            this.controlPanel.resetTaskStates?.('插件与当前世界书已重置');
            return { settings, currentChatReset: Boolean(chatKey), worldbookPreserved: false };
        } catch (error) {
            try { this.settingsStore.restore(context, settingsSnapshot); } catch {}
            if (worldbookBackup && resetSnapshot) {
                try { await this.worldbook.replaceRaw(liveSettings, worldbookBackup.name, worldbookBackup.data, resetSnapshot, null); } catch {}
            }
            throw new Error(`插件重置失败：${(0, util_1.errorText)(error)}`);
        }
    }
    processLatest() { return this.enqueueTask('full', undefined, false); }
    cancel() {
        const key = this.host.chatKey();
        const cancelled = this.cancelAndClearChatTasks('用户已取消任务', key);
        if (!cancelled) {
            this.controlPanel.setStatus('当前聊天没有正在执行或排队的任务');
            return false;
        }
        this.controlPanel.setStatus('当前聊天任务已取消并清空');
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
        const gameTimeEntry = worldbook.entries.find((entry) => String(entry.title || '') === '基础设定｜游戏时间');
        const gameTimeMatch = String(gameTimeEntry?.content || '').match(/当前游戏时间[：:]\s*(.+)/u);
        const currentGameTime = gameTimeMatch ? { label: String(gameTimeMatch[1] || '').trim(), source: 'worldbook' } : null;
        this.gameTimeAnchorCache = currentGameTime;
        const management = (0, worldbook_management_1.buildWorldbookManagementView)(worldbook.entries, currentGameTime, settings);
        // [MA-ENTRY-UPDATED-BADGE] 只标记最近一次已经完整处理完的剧情回合真正改动过的 UID。
        // 如果最近完成的回合没有世界书变化，则返回空集合，不沿用上一回合的“更新”标记。
        const updatedEntryUids = typeof this.host.getLatestProcessedTurnUpdatedUids === 'function'
            ? this.host.getLatestProcessedTurnUpdatedUids()
            : [];
        return {
            entries: worldbook.entries,
            updatedEntryUids,
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
    setBedrockLocked(uid, locked) {
        return this.enqueueMaintenance('setBedrockLocked', async (settings, snapshot) => this.worldbook.setBedrockLocked(settings, uid, locked, snapshot, () => this.host.assertSnapshot(snapshot, this.settings())));
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
        // [MA-ROLLBACK-RESET-02] 回滚事务未完成时不接收任何正文重排；恢复完成后由回滚入口统一重新调度。
        if (this.reconcilingChats.has(String(turn.chatKey ?? ''))) return;
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
        // 角色开场白会在新聊天建立时触发 MESSAGE_RECEIVED，但此时还没有真实玩家回合，
        // 聊天文件也可能尚未持久化。自动送审会把角色卡开场误当成模型正文，甚至尝试
        // 修正一条没有玩家输入可供约束的消息。手动处理仍通过 enqueueTask 保持可用。
        if (this.host.latestTurn(index).playerMessageIndex < 0) return;
        const settings = this.settings();
        if (!settings.enabled) return;
        const autoAudit = settings.autoAudit === true;
        const autoExtraction = settings.autoExtraction === true;
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
        const reason = `SillyTavern 事件 ${eventName} 使源对话失效`;
        if (eventName === 'CHAT_CHANGED') {
            this.clearPendingMessageTimers();
            this.clearPendingSourceReconcileTimers();
            this.reconcilingChats.clear();
            this.cancelAll(reason);
            try { this.host.bumpScopeRevision(this.host.chatKey()); } catch { }
            this.migrationService.clearPreview?.();
            this.worldSettingImportService.clearPreview?.();
            this.diagnostics.clear();
            this.controlPanel.renderDiagnosticReport?.(null);
            this.controlPanel.resetTaskStates?.('聊天已经切换');
            const nextChatKey = safeChatKey(this.host);
            if (nextChatKey && !this.host.uidRuntimeStateReady?.()) {
                this.reconcilingChats.add(nextChatKey);
                this.controlPanel.setStatus('聊天已经切换，正在以当前世界书 UID 建立新运行基线');
                void this.initializeUidRuntimeState().then((result) => {
                    if (result?.initialized) this.controlPanel.setStatus(`新运行基线已建立（${result.uidCount}个 UID）`);
                }).catch((error) => {
                    this.controlPanel.setStatus(`UID 运行基线初始化失败：${(0, util_1.errorText)(error)}`, true);
                    console.error('[MirrorAbyss] UID runtime bootstrap failed', error);
                }).finally(() => {
                    this.reconcilingChats.delete(nextChatKey);
                    this.publishTaskStatus();
                });
            } else {
                this.controlPanel.setStatus('聊天已经切换，旧聊天任务与预览已清理');
            }
            this.controlPanel.rebindHostDom?.();
            this.publishTaskStatus();
            return;
        }

        const index = messageIndexFromEvent(eventValue);
        const chatKey = safeChatKey(this.host);
        if (!Number.isInteger(index) || !chatKey) {
            this.cancelAndClearChatTasks(reason, chatKey);
            try { this.host.bumpScopeRevision(chatKey); } catch { }
            this.controlPanel.resetTaskStates?.('正文范围发生无法定位的变化');
            this.controlPanel.setStatus('正文范围发生无法定位的变化，当前聊天任务已取消并清空');
            return;
        }

        // [MA-ROLLBACK-RESET-05] Edit / Swipe / Delete 的唯一任务动作：当前聊天任务域整体取消并清空。
        // 不再判断“小总结是否受影响”“某个排队任务属于哪一回合”；旧对话链上的任务全部失效。
        this.reconcilingChats.add(chatKey);
        this.cancelAndClearChatTasks(reason, chatKey);
        this.controlPanel.resetTaskStates?.('源正文已变化，当前聊天任务已取消并清空');
        this.controlPanel.setStatus('源正文已变化，当前聊天任务已取消并清空；准备按 UID 回合快照恢复世界书');
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
        }, 80);
        timer?.unref?.();
        this.pendingSourceReconcileTimers.set(chatKey, { timer, index: nextIndex, eventName: nextEvent });
    }
    async reconcileCommittedSource(eventName, index, chatKey) {
        if (!this.started || this.host.chatKey() !== chatKey) {
            this.reconcilingChats.delete(chatKey);
            return;
        }
        try {
            // 回滚只做一件事：按受影响回合的 UID 快照恢复世界书，并清理这些失效历史。
            await this.waitForChatIdle(chatKey);
            if (!this.started || this.host.chatKey() !== chatKey) return;

            const affected = this.host.getTurnRollbackSnapshots()
                .filter((snapshot) => receiptAffectedBySourceChange(snapshot, eventName, index));
            if (!affected.length) return;

            const ids = affected.map((snapshot) => String(snapshot.id ?? '')).filter(Boolean);
            const receiptIds = [...new Set(affected.flatMap((snapshot) => snapshot.receiptIds ?? []).map((value) => String(value ?? '')).filter(Boolean))];
            const settings = this.settings();
            const rollbackSnapshot = this.host.captureMaintenanceSnapshot(settings, 'sourceRollback', { cancelled: false, reason: '' });
            const validate = () => this.host.assertSnapshot(rollbackSnapshot, this.settings());

            await this.worldbook.rollbackReceipts(settings, affected, this.host.getFocusUid(), rollbackSnapshot, validate);

            const cursor = this.host.cursor();
            const ordered = [...affected].sort((left, right) => Number(left?.createdAt || 0) - Number(right?.createdAt || 0));
            const stateBefore = ordered.find((receipt) => receipt?.stateBefore?.cursor)?.stateBefore || null;
            const restoredCursor = stateBefore?.cursor && typeof stateBefore.cursor === 'object'
                ? stateBefore.cursor
                : { ...cursor, lastProcessedMessageKey: '', lastProcessedHash: '' };
            await this.host.applySourceRollbackMetadata(restoredCursor, receiptIds, ids, rollbackSnapshot, this.settings());

            this.controlPanel.resetTaskStates?.('源对话已变化，UID 回合快照已恢复');
            this.controlPanel.setStatus(`已恢复${affected.length}个近期回合涉及的 UID`);
            await this.controlPanel.refreshRecallMap?.();
        } finally {
            this.reconcilingChats.delete(chatKey);
        }
    }
    async waitForChatIdle(chatKey) {
        for (let attempt = 0; attempt < 80; attempt += 1) {
            if (!this.activeTokens.has(chatKey) && !this.runningByChat.has(chatKey)) return;
            await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
        }
        throw new Error('当前聊天旧任务尚未停止');
    }

    // [MA-ROLLBACK-RESET-06] 当前聊天任务域的唯一“取消并清空”入口。
    // 运行中的任务收到同一个取消信号，等待中的任务直接从队列移除；调用方不再按消息、总结类型或影响范围拆分判断。
    cancelAndClearChatTasks(reason, chatKey = '') {
        const key = String(chatKey || safeChatKey(this.host));
        let count = 0;
        const token = this.activeTokens.get(key);
        if (token && !token.cancelled) {
            token.cancelled = true;
            token.reason = reason;
            count += 1;
        }
        count += this.rejectQueuedTasks(reason, key);
        this.clearPendingMessageTimers(key);
        this.publishTaskStatus();
        return count;
    }
    enqueueTask(taskType, index, automatic) {
        const maintenance = ['migration', 'commitMigration', 'undoMigration'].includes(taskType);
        const chatKey = this.host.chatKey();
        // [MA-ROLLBACK-RESET-03] 当前聊天处于 Edit / Swipe / Delete 恢复阶段时，旧任务域已经被取消并清空；禁止新任务插入恢复事务。
        if (this.reconcilingChats.has(chatKey)) return Promise.reject(new Error('当前聊天正在回滚世界书，暂不接受新任务'));
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
        if (maintenance) this.controlPanel.resetLiveTaskStates?.('后台维护任务，不属于正文四阶段');
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
            const fullShouldExtract = taskType === 'full' && (!automatic || settings.autoExtraction === true);
            if (taskType === 'audit') {
                if (!String(settings.auditPrompt || '').trim()) throw new Error('审核提示词为空');
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
                const shouldAudit = Boolean(settings.auditPrompt.trim()) && (!automatic || settings.autoAudit === true);
                const shouldExtract = !automatic || settings.autoExtraction === true;
                if (shouldAudit) {
                    activeSnapshot = await this.auditRunner.process(settings, activeSnapshot);
                    this.controlPanel.setTaskProgress?.('audit', activeSnapshot.auditReplaced ? 'warning' : 'success', activeSnapshot.auditReplaced ? '审核未通过' : '审核通过');
                    this.controlPanel.setTaskProgress?.('revision', activeSnapshot.auditReplaced ? 'success' : 'disabled', activeSnapshot.auditReplaced ? '完整修正版已校验并替换' : '无需修正');
                } else {
                    this.controlPanel.setTaskProgress?.('audit', 'disabled', '自动审核已关闭');
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
                this.controlPanel.setStatus('小总结完成');
            }
            else if (taskType === 'largeSummary') {
                this.controlPanel.setStatus('大总结完成');
            }
            else if (taskType === 'migration') {
                this.controlPanel.setStatus(result?.previewReady ? `整本世界书整理预览已生成：${result.candidates ?? 0}条 → ${result.rebuiltEntries ?? 0}条；更新${result.updatedEntries ?? 0}、新建${result.createdEntries ?? 0}、删除${result.deletedEntries ?? 0}；提交前未修改旧表` : (result?.message || '没有可整理条目'));
            }
            else if (taskType === 'commitMigration') {
                this.controlPanel.setStatus(`整本世界书整理已提交：最终${result?.rebuiltEntries ?? 0}条`);
            }
            else if (taskType === 'undoMigration') {
                this.controlPanel.setStatus('上次整本世界书整理已撤销，旧表已恢复');
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
        // [MA-ROLLBACK-RESET-04] 回滚期间世界书恢复本身不走普通维护队列；其他维护请求统一拒绝，保证任务系统保持空。
        if (this.reconcilingChats.has(chatKey)) return Promise.reject(new Error('当前聊天正在回滚世界书，暂不接受维护任务'));
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
        this.controlPanel.resetLiveTaskStates?.('后台维护任务，不属于正文四阶段');
        const position = queue.items.length + (queue.running ? 1 : 0);
        const label = maintenanceTaskLabel(taskType);
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
        const label = maintenanceTaskLabel(item.taskType);
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
        const threshold = Math.max(2, Number(settings.queueCompactThreshold || 6));
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

function maintenanceTaskLabel(taskType) {
    return ({
        apiProbe: 'API 探针',
        smallSummary: '小总结',
        largeSummary: '大总结',
        retrySmallSummary: '失败小总结重试',
        sourceRollback: '来源回滚',
        editEntry: '世界书条目编辑',
        setFocus: '焦点更新',
        replanRecall: '召回重排',
        worldSettingPreview: '世界设定预览',
        worldSettingCommit: '世界设定提交',
        acceptance: '自动验收',
    })[taskType] || '世界书操作';
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
/**
 * Mirror Abyss — audit
 *
 * 职责：正文审核：固定协议解析与结论判定。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditRunner = void 0;
exports.parseAuditResult = parseAuditResult;
const prompts_1 = require("./prompts");
const parser_1 = require("./parser");
const revision_1 = require("./revision");
const model_request_1 = require("./model-request");
const util_1 = require("./util");
const protocols_1 = require("./protocols");

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
        if (!String(settings.auditPrompt || '').trim()) throw new Error('审核提示词为空');
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
                profileId: settings.modelProfileId,
                sourceText: snapshot.turnText || snapshot.assistantText,
                onRetry: (error) => this.setStatus(snapshot.chatKey, 'audit', (0, model_request_1.describeRetryReason)(error, '审核模型')),
            });
            this.host.assertSnapshot(snapshot, this.getSettings());
            // [MA-SOURCE-FIRST-01] 审核模型只负责一次语义判定；格式宽容由本地 parser 负责。
            // 若仍无法解析，明确失败，不再启动第二个“审核格式修复”模型重新理解同一正文。
            const result = parseAuditResult(raw);
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

/** [MA-AUDIT-02] 审核只有一套固定协议；parser 不再从自由自然语言推断结论。 */
function parseAuditResult(raw) {
    const text = (0, parser_1.sanitizeModelText)(raw).replace(/\r/g, '').trim();
    if (!text) throw new Error('审核模型没有返回可识别内容');
    if (/【\s*(?:最小修正版正文|修正版正文|完整正文|正文)\s*】/u.test(text)) throw new Error('审核模型越权返回了修正版正文');
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 1 && lines[0] === protocols_1.AUDIT.pass) return { decision: 'pass', issues: [] };
    if (lines[0] !== protocols_1.AUDIT.revision) throw new Error(`审核返回不符合唯一协议；第一行必须是“${protocols_1.AUDIT.pass}”或“${protocols_1.AUDIT.revision}”`);
    if (lines[1] !== protocols_1.AUDIT.issues) throw new Error(`审核返回不符合唯一协议；需要修正时第二行必须是“${protocols_1.AUDIT.issues}”`);
    const issueLines = lines.slice(2);
    if (!issueLines.length || issueLines.some((line) => !line.startsWith(protocols_1.AUDIT.issuePrefix))) throw new Error('审核返回不符合唯一协议；问题必须逐行使用“- 明确问题”格式');
    const issues = [...new Set(issueLines.map((line) => line.slice(protocols_1.AUDIT.issuePrefix.length).trim()).filter(Boolean))].slice(0, 8);
    if (!issues.length) throw new Error('审核判断为需要修正，但没有按协议给出问题');
    return { decision: 'revision', issues };
}
function safeChatKey(host) { try { return host.chatKey(); } catch { return ''; } }

},"constants":function(module,exports,require){
/**
 * Mirror Abyss — constants
 *
 * 职责：全局常量与稳定标识符。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGED_VERSION = exports.MAX_CONTEXT_CHARS = exports.WORLD_INFO_EXTENSION_KEY = exports.EXTENSION_NAMESPACE = exports.DISPLAY_NAME = exports.VERSION = void 0;
exports.VERSION = '3.0.0-lite.ui.1-event-timeline';
exports.DISPLAY_NAME = 'Mirror Abyss｜镜渊';
exports.EXTENSION_NAMESPACE = 'mirrorAbyssLite';
exports.WORLD_INFO_EXTENSION_KEY = 'mirrorAbyssInfoPoint';
exports.MAX_CONTEXT_CHARS = 48000;
exports.MANAGED_VERSION = 21;

},"control-panel":function(module,exports,require){
/**
 * Mirror Abyss — control-panel
 *
 * 职责：控制面板 UI：设置、任务状态、召回与世界书治理入口。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
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
        this.recallEditButton = null;
        this.recallEditActionsNode = null;
        this.recallLockHelpNode = null;
        this.recallEditMode = false;
        this.recallSelectedUids = new Set();
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
        this.recallQuery = '';
        this.recallFilter = 'all';
        this.pageNodes = {};
        this.pageButtons = {};
        this.activePage = 'run';
        this.apiProfileSelect = null;
        this.apiProfileStatusNode = null;
        this.worldbookQuickStatusNode = null;
        this.summaryFailureNode = null;
        this.summaryFailureCountNode = null;
        this.summaryFailureListNode = null;
        this.summaryFailureSmallButton = null;
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
        this.recallEditButton = null;
        this.recallEditActionsNode = null;
        this.recallLockHelpNode = null;
        this.recallEditMode = false;
        this.recallSelectedUids = new Set();
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
        this.recallQuery = '';
        this.recallFilter = 'all';
        this.pageNodes = {};
        this.pageButtons = {};
        this.activePage = 'run';
        this.apiProfileSelect = null;
        this.apiProfileStatusNode = null;
        this.worldbookQuickStatusNode = null;
        this.summaryFailureNode = null;
        this.summaryFailureCountNode = null;
        this.summaryFailureListNode = null;
        this.summaryFailureSmallButton = null;
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
#${PANEL_ID}{position:fixed;top:max(8px,env(safe-area-inset-top));right:max(10px,env(safe-area-inset-right));z-index:10051;box-sizing:border-box;width:min(396px,calc(100vw - 20px));max-height:calc(100dvh - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom));overflow:auto;padding:0;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.2));border-radius:12px;background:var(--SmartThemeBlurTintColor,#17171c);color:var(--SmartThemeBodyColor,#fff);box-shadow:0 12px 34px rgba(0,0,0,.48);backdrop-filter:blur(12px);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
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
.ma-lite-thresholds{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.ma-lite-thresholds-single{grid-template-columns:1fr}.ma-lite-number{display:flex;flex-direction:column;gap:4px;padding:7px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:8px;font-size:10px}.ma-lite-number input{box-sizing:border-box;width:100%;min-height:30px;padding:4px 6px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.16));border-radius:6px;background:rgba(0,0,0,.2);color:inherit}.ma-lite-text-setting{display:flex;flex-direction:column;gap:5px;padding:9px 10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.04))}.ma-lite-text-setting b{font-size:13px}.ma-lite-text-setting small{font-size:11px;line-height:1.35;opacity:.58}.ma-lite-text-setting input{box-sizing:border-box;width:100%;min-height:40px;padding:7px 9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.18));border-radius:7px;background:rgba(0,0,0,.22);color:inherit}.ma-lite-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ma-lite-action{min-height:46px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.16));border-radius:9px;background:var(--black50a,rgba(255,255,255,.08));color:inherit;font-weight:700;cursor:pointer;touch-action:manipulation;pointer-events:auto!important;-webkit-tap-highlight-color:transparent}.ma-lite-action:disabled{opacity:.42;cursor:not-allowed}.ma-lite-action[data-kind="process"]{grid-column:1/-1;border-color:rgba(111,214,164,.65);background:rgba(111,214,164,.1)}.ma-lite-action[data-kind="audit"]{border-color:rgba(112,181,255,.5)}.ma-lite-action[data-kind="extract"]{border-color:rgba(111,214,164,.5)}.ma-lite-action[data-kind="cancel"]{border-color:rgba(255,150,120,.45);font-weight:500}
.ma-lite-status{min-height:38px;padding:9px 10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.2));border-radius:8px;background:var(--SmartThemeBlurTintColor,#17171c);color:var(--SmartThemeBodyColor,#fff);font-size:12px;font-weight:500;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}.ma-lite-pipeline{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.ma-lite-stage{min-width:0;padding:8px 6px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:8px;background:rgba(0,0,0,.12);text-align:center}.ma-lite-stage-head{display:flex;align-items:center;justify-content:center;gap:5px;font-size:10px;font-weight:700}.ma-lite-stage-detail{margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;opacity:.62}.ma-lite-tool-group{border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:rgba(0,0,0,.08)}.ma-lite-tool-group>summary{box-sizing:border-box;display:flex;align-items:center;min-height:44px;padding:10px;cursor:pointer;font-size:12px;font-weight:700}.ma-lite-tool-group>.ma-lite-tool-content{display:flex;flex-direction:column;gap:10px;padding:0 8px 8px}.ma-lite-status[data-error="true"]{border-color:rgba(255,126,126,.38);border-left:3px solid rgba(255,126,126,.72);background:linear-gradient(90deg,rgba(255,96,96,.10),rgba(0,0,0,.07));color:var(--SmartThemeBodyColor,#fff);font-weight:520;box-shadow:none}.ma-lite-note{font-size:11px;line-height:1.5;opacity:.58}
.ma-lite-reset{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid rgba(255,150,120,.28);border-radius:9px;background:rgba(120,30,20,.08)}.ma-lite-reset-head{font-size:13px}.ma-lite-reset-help{font-size:10px;line-height:1.45;opacity:.65}.ma-lite-reset-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ma-lite-reset-actions button{min-height:44px;border:1px solid rgba(255,150,120,.35);border-radius:8px;background:rgba(80,20,15,.18);color:inherit;cursor:pointer}.ma-lite-reset-actions button:disabled{opacity:.42;cursor:not-allowed}
.ma-lite-diagnostic{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid rgba(111,214,164,.28);border-radius:9px;background:rgba(20,100,70,.07)}.ma-lite-diagnostic-help{font-size:10px;line-height:1.5;opacity:.68}.ma-lite-diagnostic-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ma-lite-diagnostic-actions button{min-height:44px;border:1px solid rgba(111,214,164,.38);border-radius:8px;background:rgba(20,100,70,.12);color:inherit;cursor:pointer}.ma-lite-diagnostic-actions button:disabled{opacity:.42;cursor:not-allowed}.ma-lite-diagnostic-status{font-size:11px;line-height:1.45}.ma-lite-diagnostic-report{margin:0;max-height:220px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:8px;border-radius:7px;background:rgba(0,0,0,.2);font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
.ma-lite-worldbook-quick{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.035))}.ma-lite-worldbook-quick-head{display:flex;flex-direction:column;gap:2px}.ma-lite-worldbook-quick-head strong{font-size:13px}.ma-lite-worldbook-quick-head small{font-size:10px;line-height:1.4;opacity:.62}.ma-lite-worldbook-advanced{border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.1));border-radius:8px}.ma-lite-worldbook-advanced>summary{min-height:44px;box-sizing:border-box;padding:12px;cursor:pointer;font-size:11px}.ma-lite-worldbook-quick-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:0 7px 7px}.ma-lite-worldbook-quick button{min-height:44px;padding:7px 8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.15));border-radius:8px;background:rgba(0,0,0,.16);color:inherit;font-size:10px;cursor:pointer}.ma-lite-worldbook-quick button:disabled{opacity:.4;cursor:not-allowed}.ma-lite-worldbook-quick-status{font-size:10px;line-height:1.45;opacity:.76}.ma-lite-worldbook-quick-status[data-error="true"]{color:#ffb4b4;opacity:1}.ma-lite-summary-failures{display:flex;flex-direction:column;gap:7px;padding:8px;border:1px solid rgba(255,164,84,.25);border-radius:8px;background:rgba(255,164,84,.055)}.ma-lite-summary-failures[hidden]{display:none!important}.ma-lite-summary-failure-head{display:flex;align-items:center;gap:8px}.ma-lite-summary-failure-head strong{min-width:0;flex:1;font-size:11px}.ma-lite-summary-failure-count{font-size:10px;opacity:.68}.ma-lite-summary-failure-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.ma-lite-summary-failure-actions button{min-height:40px;padding:6px 7px;border:1px solid rgba(255,164,84,.34);border-radius:7px;background:rgba(255,164,84,.09);color:inherit;font-size:10px;cursor:pointer}.ma-lite-summary-failure-actions button:disabled{opacity:.4;cursor:not-allowed}.ma-lite-summary-failure-detail{border-top:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.08));padding-top:6px}.ma-lite-summary-failure-detail>summary{min-height:34px;display:flex;align-items:center;cursor:pointer;font-size:10px;opacity:.8}.ma-lite-summary-failure-list{display:flex;flex-direction:column;gap:5px;padding-top:5px}.ma-lite-summary-failure-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center;padding:6px 7px;border-radius:7px;background:rgba(0,0,0,.12)}.ma-lite-summary-failure-main{min-width:0}.ma-lite-summary-failure-main strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.ma-lite-summary-failure-main small{display:block;margin-top:2px;font-size:9px;line-height:1.35;opacity:.62;overflow-wrap:anywhere}.ma-lite-summary-failure-row button{min-width:52px;min-height:36px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:6px;background:rgba(0,0,0,.16);color:inherit;font-size:9px;cursor:pointer}.ma-lite-summary-failure-row button:disabled{opacity:.4;cursor:not-allowed}.ma-lite-management{display:flex;flex-direction:column;gap:8px;padding:9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.035))}.ma-lite-management-head{display:flex;align-items:center;gap:8px}.ma-lite-management-head strong{min-width:0;flex:1;font-size:13px}.ma-lite-section-spacer{min-width:0;flex:1}.ma-lite-management-refresh{min-width:44px;min-height:44px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:7px;background:rgba(0,0,0,.16);color:inherit;cursor:pointer}.ma-lite-management-status{font-size:10px;line-height:1.4;opacity:.65}.ma-lite-management-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.ma-lite-management-card{padding:8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.1));border-radius:8px;background:rgba(0,0,0,.12)}.ma-lite-management-card strong{display:block;font-size:11px}.ma-lite-management-card small{display:block;margin-top:3px;font-size:10px;line-height:1.4;opacity:.65}.ma-lite-management-card[data-kind="primary"]{grid-column:1/-1;border-color:rgba(112,181,255,.34);background:rgba(112,181,255,.08)}.ma-lite-management-card[data-kind="update"]{border-color:rgba(111,214,164,.34);background:rgba(111,214,164,.07)}.ma-lite-management-issue{padding:7px 8px;border-radius:7px;background:rgba(255,190,90,.08);font-size:10px;line-height:1.4}.ma-lite-management-issue[data-level="error"]{background:rgba(255,100,100,.1)}.ma-lite-management-relation{padding:6px 8px;border-left:2px solid rgba(120,180,255,.45);font-size:10px;line-height:1.4;opacity:.86}.ma-lite-management-empty{padding:9px;text-align:center;font-size:10px;opacity:.56}.ma-lite-management .ma-lite-worldbook-quick-actions{padding:0}.ma-lite-management .ma-lite-worldbook-quick-actions button{min-height:40px;padding:7px 8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.15));border-radius:8px;background:rgba(0,0,0,.16);color:inherit;font-size:10px;cursor:pointer}.ma-lite-management .ma-lite-worldbook-quick-actions button:disabled{opacity:.4;cursor:not-allowed}.ma-lite-management-entry-list{display:flex;flex-direction:column;gap:4px;max-height:280px;overflow:auto;padding:4px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.09));border-radius:8px}.ma-lite-management-entry{display:flex;align-items:flex-start;gap:7px;padding:6px;border-radius:6px;font-size:10px;line-height:1.35;cursor:pointer}.ma-lite-management-entry:hover{background:rgba(255,255,255,.05)}.ma-lite-management-entry input{margin-top:1px;flex:0 0 auto}
.ma-lite-prompt-editor{display:flex;flex-direction:column;gap:7px;padding:10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:9px;background:var(--black30a,rgba(255,255,255,.04))}.ma-lite-prompt-editor strong{font-size:13px}.ma-lite-prompt-editor small{font-size:10px;line-height:1.45;opacity:.62}.ma-lite-prompt-editor textarea{box-sizing:border-box;width:100%;min-height:180px;resize:vertical;padding:8px 9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.18));border-radius:7px;background:rgba(0,0,0,.22);color:inherit;font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}.ma-lite-prompt-save{align-self:flex-end;min-height:44px;padding:5px 12px;border:1px solid rgba(112,181,255,.48);border-radius:7px;background:rgba(112,181,255,.1);color:inherit;font-weight:700;cursor:pointer}.ma-lite-prompt-save:disabled{opacity:.45;cursor:not-allowed}
.ma-lite-recall{display:flex;flex-direction:column;gap:8px;padding:9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.035))}.ma-lite-recall-head{display:flex;align-items:center;gap:8px}.ma-lite-recall-head strong{min-width:0;flex:1;font-size:13px}.ma-lite-recall-refresh,.ma-lite-recall-replan,.ma-lite-recall-edit{min-width:44px;min-height:44px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:7px;background:rgba(0,0,0,.16);color:inherit;cursor:pointer}.ma-lite-recall-status{font-size:10px;line-height:1.35;opacity:.62}.ma-lite-lock-help{padding:7px 8px;border:1px dashed var(--SmartThemeBorderColor,rgba(255,255,255,.13));border-radius:7px;font-size:10px;line-height:1.45;opacity:.78}.ma-lite-lock-help strong{opacity:1}.ma-lite-recall-locks{display:flex;flex-wrap:wrap;gap:5px;margin-left:auto}.ma-lite-recall-lock{flex:0 0 auto;min-height:36px;padding:3px 7px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.15));border-radius:6px;background:rgba(0,0,0,.18);color:inherit;font-size:9px;cursor:pointer}.ma-lite-recall-lock[data-active="true"]{border-color:rgba(255,195,74,.62);background:rgba(255,195,74,.15);font-weight:700}.ma-lite-recall-lock[data-mode="bedrock"][data-active="true"]{border-color:rgba(232,126,126,.62);background:rgba(232,126,126,.14)}.ma-lite-recall-lock:disabled{opacity:.45;cursor:not-allowed}.ma-lite-badge[data-kind="bedrock"]{background:rgba(232,126,126,.16)}.ma-lite-recall-edit[data-active="true"]{border-color:rgba(255,195,74,.55);background:rgba(255,195,74,.13);font-weight:700}.ma-lite-recall-edit-actions[hidden]{display:none!important}.ma-lite-recall-summary{display:flex;flex-wrap:wrap;gap:5px}.ma-lite-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 6px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.13));border-radius:999px;background:rgba(0,0,0,.14);font-size:10px;white-space:nowrap}.ma-lite-recall-list{display:flex;flex-direction:column;gap:6px}.ma-lite-recall-row{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;padding:7px 8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.1));border-radius:8px;background:rgba(0,0,0,.11)}.ma-lite-recall-title{flex:1 1 160px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:700}.ma-lite-recall-row-head{display:flex;align-items:center;flex-wrap:wrap;gap:7px;min-width:0}.ma-lite-recall-focus{flex:0 0 auto;min-height:44px;padding:3px 7px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.15));border-radius:6px;background:rgba(0,0,0,.18);color:inherit;font-size:9px;cursor:pointer}.ma-lite-recall-focus[data-active="true"]{border-color:rgba(255,195,74,.55);background:rgba(255,195,74,.13)}.ma-lite-recall-focus:disabled{opacity:.45;cursor:not-allowed}.ma-lite-recall-meta{display:flex;flex-wrap:wrap;gap:4px}.ma-lite-badge{display:inline-flex;padding:2px 5px;border-radius:5px;background:rgba(255,255,255,.07);font-size:9px;line-height:1.3}.ma-lite-badge[data-kind="constant"]{background:rgba(255,195,74,.16)}.ma-lite-badge[data-kind="vector"]{background:rgba(112,181,255,.15)}.ma-lite-badge[data-kind="bridge"]{background:rgba(196,123,255,.16)}.ma-lite-badge[data-kind="terminal"]{background:rgba(111,214,164,.14)}.ma-lite-badge[data-kind="isolated"]{background:rgba(160,160,170,.14)}.ma-lite-badge[data-kind="active"]{background:rgba(92,205,139,.17)}.ma-lite-badge[data-kind="closed"]{background:rgba(170,170,180,.16)}.ma-lite-badge[data-kind="history"]{background:rgba(116,150,210,.14)}.ma-lite-badge[data-kind="scene"]{background:rgba(255,160,100,.14)}.ma-lite-badge[data-kind="update"]{font-weight:700}.ma-lite-recall-empty{padding:8px;text-align:center;font-size:10px;opacity:.56}.ma-lite-recall-pager{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:7px;margin-top:2px}.ma-lite-recall-page-button{min-height:44px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:7px;background:rgba(0,0,0,.16);color:inherit;cursor:pointer}.ma-lite-recall-page-button:disabled{opacity:.38;cursor:not-allowed}.ma-lite-recall-page-status{font-size:10px;white-space:nowrap;opacity:.68}
.ma-lite-recall-toolbar{display:grid;grid-template-columns:minmax(0,1fr) 112px;gap:7px}.ma-lite-recall-search,.ma-lite-recall-filter{box-sizing:border-box;width:100%;min-height:40px;padding:6px 8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.15));border-radius:7px;background:rgba(0,0,0,.18);color:inherit;font-size:10px}.ma-lite-recall-summary-chip{cursor:pointer;color:inherit}.ma-lite-recall-summary-chip[data-active="true"]{border-color:rgba(112,181,255,.55);background:rgba(112,181,255,.14);font-weight:700}.ma-lite-recall-main{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:start;gap:7px}.ma-lite-recall-mode{display:inline-flex;align-items:center;min-height:22px;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,.07);font-size:9px;font-weight:700;white-space:nowrap}.ma-lite-recall-mode[data-kind="constant"]{background:rgba(255,195,74,.16)}.ma-lite-recall-mode[data-kind="vector"]{background:rgba(112,181,255,.15)}.ma-lite-recall-mode[data-kind="active"]{background:rgba(92,205,139,.17)}.ma-lite-recall-mode[data-kind="bridge"]{background:rgba(196,123,255,.16)}.ma-lite-recall-mode[data-kind="isolated"]{background:rgba(160,160,170,.14)}.ma-lite-recall-reason{min-width:0;font-size:10px;line-height:1.45;opacity:.76}.ma-lite-recall-relations{padding:5px 7px;border-radius:6px;background:rgba(112,181,255,.07);font-size:9px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ma-lite-recall-details{border-top:1px dashed var(--SmartThemeBorderColor,rgba(255,255,255,.1));padding-top:3px}.ma-lite-recall-details>summary{min-height:30px;display:flex;align-items:center;cursor:pointer;font-size:9px;opacity:.6}.ma-lite-recall-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;padding:3px 0 2px}.ma-lite-recall-detail-grid>div{min-width:0;padding:5px 6px;border-radius:6px;background:rgba(0,0,0,.12)}.ma-lite-recall-detail-grid span{display:block;font-size:8px;opacity:.5}.ma-lite-recall-detail-grid b{display:block;margin-top:2px;font-size:9px;font-weight:500;line-height:1.35;overflow-wrap:anywhere}

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
        title.innerHTML = '<strong>Mirror Abyss｜镜渊</strong><small>运行 · 条目 · 设置 · 维护</small>';
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
            this.makePageButton('worldbook', '条目'),
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
        const worldbookQuickActions = this.buildWorldbookQuickActions();
        runPage.append(globalTask, pipeline, status, actions, this.wrapToolSection('总结操作', worldbookQuickActions, true));

        const management = this.buildManagementSection();
        const recall = this.buildRecallSection();
        const worldSetting = this.buildWorldSettingSection();
        worldbookPage.append(
            this.wrapToolSection('当前状态', management, true),
            this.wrapToolSection('世界书条目', recall, true),
            this.wrapToolSection('导入基础设定', worldSetting, false),
        );

        const apiSection = this.buildApiSection();
        const runSwitches = document.createElement('div');
        runSwitches.className = 'ma-lite-switches';
        runSwitches.append(
            this.makeSwitch('enabled', '总开关', '关闭后镜渊不执行任何处理。'),
            this.makeSwitch('autoAudit', '自动审核', '正文完成后自动审核；关闭后仍可手动审核。'),
            this.makeSwitch('autoExtraction', '自动提取', '正文完成后自动提取；开启审核时会在审核/修正完成后再提取。'),
        );
        const gameTimeAnchor = this.makeGameTimeInput('游戏时间（可选）', '需要时为当前聊天填写世界内时间锚点；留空则不启用。后续时间推进由 AI 根据正文判断。', '例如：第三日 14:30');
        const thresholds = document.createElement('div');
        thresholds.className = 'ma-lite-thresholds ma-lite-thresholds-single';
        thresholds.append(
            this.makeNumberInput('largeSummaryCount', '大总结累计场景组数', 2, 30),
        );
        const auditPromptEditor = this.makePromptEditor('auditPrompt', '审核附加规则', '只在需要时补充审核边界；默认审核规则由插件内置。');
        const note = document.createElement('div');
        note.className = 'ma-lite-note';
        note.textContent = '固定流程：审核（可选）→ 提取 → 写入 → 场景组 → 小总结 S → 若干场景组 → 大总结 L。';
        settingsPage.append(this.wrapToolSection('运行设置', runSwitches, true), this.wrapToolSection('总结设置', thresholds, true), this.wrapToolSection('游戏时间', gameTimeAnchor, false), this.wrapToolSection('模型连接', apiSection, false), this.wrapToolSection('审核附加规则', auditPromptEditor, false), note);

        const rebuild = this.buildRebuildSection();
        const diagnostic = this.buildDiagnosticSection();
        const reset = this.buildResetSection();
        maintenancePage.append(this.wrapToolSection('世界书整体整理', rebuild, true), this.wrapToolSection('诊断', diagnostic, false), this.wrapToolSection('重置与故障恢复', reset, false));
        body.append(pageNav, runPage, worldbookPage, settingsPage, maintenancePage);
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
        const enabled = { audit: master, revision: master, extract: master, write: master };
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
        const selectedId = String(settings.modelProfileId || '');
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
        const previousId = String(previousSettings.modelProfileId || '');
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
        help.textContent = '重置会恢复插件默认设置、清除当前聊天的镜渊状态，并清空当前绑定世界书。';
        const actions = document.createElement('div');
        actions.className = 'ma-lite-reset-actions';
        const plugin = document.createElement('button');
        plugin.type = 'button';
        plugin.textContent = '重置插件和世界书';
        plugin.addEventListener('click', () => void this.runResetAction('resetPlugin'));
        actions.append(plugin);
        section.append(head, help, actions);
        this.buttons.resetPlugin = plugin;
        return section;
    }
    async runResetAction(kind) {
        if (this.pendingActions.has(kind)) return;
        const action = this.actions[kind];
        if (typeof action !== 'function') { this.setStatus('重置功能未连接', true); return; }
        const question = '确定重置 Mirror Abyss 插件吗？这会恢复默认设置、清除当前聊天状态，并清空当前绑定世界书。';
        if (typeof globalThis.confirm === 'function' && !globalThis.confirm(question)) return;
        this.pendingActions.add(kind);
        this.syncDisabledState();
        this.setStatus('正在重置插件和世界书…');
        try {
            await action();
            this.resetTaskStates('插件与世界书已重置');
            this.setStatus('插件设置、当前聊天状态与当前绑定世界书已重置');
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
        head.textContent = '导入基础设定';
        const help = document.createElement('div');
        help.className = 'ma-lite-world-setting-help';
        help.textContent = '只在玩家明确点击后读取下方文本。确认写入后，导入的基础设定作为初始基石锁保存；普通聊天不会自动把玩家输入写成基础设定。';
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
        head.textContent = '世界书整体整理';
        const help = document.createElement('div');
        help.className = 'ma-lite-rebuild-help';
        help.textContent = '整本当前世界书一次交给模型，按信息归属与颗粒度整理；预览阶段不修改世界书，确认后再提交。';
        const actions = document.createElement('div');
        actions.className = 'ma-lite-rebuild-actions';
        const preview = document.createElement('button');
        preview.type = 'button';
        preview.textContent = '生成整理预览';
        preview.addEventListener('click', () => void this.runRebuildAction('migrate'));
        const commit = document.createElement('button');
        commit.type = 'button';
        commit.textContent = '提交新结构';
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
        content.textContent = '尚未生成整本整理预览';
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
        if (this.rebuildStatusNode) this.rebuildStatusNode.textContent = kind === 'migrate' ? '正在把整本世界书交给模型整理…' : kind === 'commitMigration' ? '正在原子提交新结构并回读校验…' : '正在恢复上次重建前的旧表…';
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
            this.rebuildNode.textContent = '尚未生成整本整理预览';
            return;
        }
        this.rebuildNode.className = 'ma-lite-rebuild-preview';
        const metrics = document.createElement('div');
        metrics.className = 'ma-lite-rebuild-summary';
        const items = [
            ['整理前', summary.candidates ?? 0],
            ['整理后', summary.rebuiltEntries ?? 0],
            ['更新', summary.updatedEntries ?? 0],
            ['新建', summary.createdEntries ?? 0],
            ['删除', summary.deletedEntries ?? 0],
            ['重试', summary.retried === true ? '是' : '否'],
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
        head.innerHTML = '<small>小总结整理一个已结束场景留下的长期有效结果；大总结立刻收拢当前累计的小总结组，形成或更新基础设定。</small>';
        const actions = document.createElement('div');
        actions.className = 'ma-lite-worldbook-quick-actions';
        for (const [kind, label, title] of [
            ['smallSummary', '立即小总结', '优先处理最早一个已关闭场景组；整理该场景已经形成并会继续影响后续的有效结果'],
            ['largeSummary', '立即大总结', '不等待阈值，立刻收拢当前大组集里已经累计的全部小总结组，并抽象为基础设定'],
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
        const status = document.createElement('div');
        status.className = 'ma-lite-worldbook-quick-status';
        status.setAttribute('aria-live', 'polite');
        status.textContent = '换场后自动小总结；累计的小总结组达到阈值后立即自动大总结。点击“立即大总结”则不等阈值，直接收拢当前大组集。';
        const failures = this.buildSummaryFailureSection();
        section.append(head, actions, status, failures);
        this.worldbookQuickStatusNode = status;
        return section;
    }

    buildSummaryFailureSection() {
        const section = document.createElement('section');
        section.className = 'ma-lite-summary-failures';
        section.hidden = true;
        const head = document.createElement('div');
        head.className = 'ma-lite-summary-failure-head';
        const title = document.createElement('strong');
        title.textContent = '自动小总结失败';
        const count = document.createElement('span');
        count.className = 'ma-lite-summary-failure-count';
        head.append(title, count);
        const actions = document.createElement('div');
        actions.className = 'ma-lite-summary-failure-actions';
        const small = document.createElement('button');
        small.type = 'button';
        small.textContent = '重试失败小总结';
        small.addEventListener('click', () => void this.runSummaryRetryAction('small'));
        actions.append(small);
        const details = document.createElement('details');
        details.className = 'ma-lite-summary-failure-detail';
        const summary = document.createElement('summary');
        summary.textContent = '查看失败明细';
        const list = document.createElement('div');
        list.className = 'ma-lite-summary-failure-list';
        details.append(summary, list);
        section.append(head, actions, details);
        this.summaryFailureNode = section;
        this.summaryFailureCountNode = count;
        this.summaryFailureListNode = list;
        this.summaryFailureSmallButton = small;
        return section;
    }

    refreshSummaryFailures() {
        if (!this.summaryFailureNode || typeof this.actions.summaryFailureState !== 'function') return;
        let state = null;
        try { state = this.actions.summaryFailureState(); }
        catch { state = null; }
        const smallTasks = Array.isArray(state?.small) ? state.small : [];
        this.summaryFailureNode.hidden = smallTasks.length === 0;
        if (this.summaryFailureCountNode) this.summaryFailureCountNode.textContent = `${smallTasks.length}项`;
        if (this.summaryFailureSmallButton) {
            this.summaryFailureSmallButton.hidden = smallTasks.length === 0;
            this.summaryFailureSmallButton.textContent = `重试失败小总结（${smallTasks.length}）`;
        }
        if (!this.summaryFailureListNode) return;
        this.summaryFailureListNode.replaceChildren();
        const formatTime = (value) => {
            const time = Number(value || 0);
            if (!time) return '失败时间未记录';
            try { return new Date(time).toLocaleString(); } catch { return '失败时间未记录'; }
        };
        const appendTask = (kind, task, index) => {
            const row = document.createElement('div');
            row.className = 'ma-lite-summary-failure-row';
            const main = document.createElement('div');
            main.className = 'ma-lite-summary-failure-main';
            const strong = document.createElement('strong');
            const label = String(task?.label || task?.sceneTitle || task?.sceneGroup || '').trim() || `失败场景 ${index + 1}`;
            strong.textContent = `小总结｜${label}`;
            const small = document.createElement('small');
            const count = Math.max(0, Number(task?.entryCount || 0));
            const reason = String(task?.error || '').trim();
            small.textContent = `${count}个条目 · ${formatTime(task?.failedAt)}${reason ? ` · ${reason}` : ''}`;
            main.append(strong, small);
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.textContent = '重试';
            retry.addEventListener('click', () => void this.runSummaryRetryAction(kind, String(task?.id || '')));
            row.append(main, retry);
            this.summaryFailureListNode.append(row);
        };
        smallTasks.forEach((task, index) => appendTask('small', task, index));
        this.syncDisabledState();
    }

    async runSummaryRetryAction(kind, taskId = '') {
        const actionKey = 'retryFailedSmallSummary';
        if (kind !== 'small') return;
        if (this.pendingActions.has(actionKey)) return;
        const action = this.actions[actionKey];
        if (typeof action !== 'function') { this.setStatus('失败小总结重试功能未连接', true); return; }
        if (this.getSettings().enabled === false) { this.setStatus('总开关已关闭', true); return; }
        const label = '失败小总结';
        this.pendingActions.add(actionKey);
        this.syncDisabledState();
        if (this.worldbookQuickStatusNode) {
            this.worldbookQuickStatusNode.dataset.error = 'false';
            this.worldbookQuickStatusNode.textContent = `${label}正在重试…`;
        }
        try {
            await action(taskId);
            const detail = `${label}重试完成；失败状态已更新`;
            if (this.worldbookQuickStatusNode) this.worldbookQuickStatusNode.textContent = detail;
            this.setStatus(detail);
            await this.refreshWorldbookPage(true);
        }
        catch (error) {
            const cancelled = error?.code === 'MA_TASK_CANCELLED';
            const text = cancelled ? `${label}重试已取消` : `${label}重试失败：${(0, util_1.errorText)(error)}`;
            if (this.worldbookQuickStatusNode) {
                this.worldbookQuickStatusNode.dataset.error = cancelled ? 'false' : 'true';
                this.worldbookQuickStatusNode.textContent = text;
            }
            this.setStatus(text, !cancelled);
        }
        finally {
            this.pendingActions.delete(actionKey);
            this.refreshSummaryFailures();
            this.syncDisabledState();
        }
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
        const labels = { smallSummary: '小总结', largeSummary: '大总结', testApiProbe: 'API 探针' };
        const label = labels[kind] || '操作';
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
                const detail = `${label}已完成；世界书状态已回读`;
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
            this.refreshSummaryFailures();
            this.syncDisabledState();
        }
    }
    buildManagementSection() {
        const section = document.createElement('section');
        section.className = 'ma-lite-management';
        const head = document.createElement('div');
        head.className = 'ma-lite-management-head';
        const title = document.createElement('span');
        title.className = 'ma-lite-section-spacer';
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
        status.textContent = '当前场景、条目和总结层级。';
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
            const workspace = await this.actions.loadWorkspace(force);
            if (managementSerial !== this.managementLoadSerial || recallSerial !== this.recallLoadSerial) return;
            this.renderManagement(workspace?.management ?? null, workspace?.worldbookName || '', workspace?.entries ?? [], workspace?.updatedEntryUids ?? []);
            const recallModel = buildRecallViewModel(workspace?.entries ?? [], workspace?.updatedEntryUids ?? []);
            this.renderRecallMap(recallModel, workspace?.worldbookName || '');
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
            const workspace = await this.actions.loadWorkspace(force);
            if (serial !== this.managementLoadSerial || !this.managementNode) return;
            this.renderManagement(workspace?.management ?? null, workspace?.worldbookName || '', workspace?.entries ?? [], workspace?.updatedEntryUids ?? []);
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
    renderManagement(model, worldbookName, entries = [], updatedEntryUids = []) {
        if (!this.managementNode) return;
        this.managementNode.className = '';
        this.managementNode.replaceChildren();
        if (!model) {
            this.managementNode.className = 'ma-lite-management-empty';
            this.managementNode.textContent = '没有管理数据';
            return;
        }
        const currentEntries = Array.isArray(entries) ? entries : [];
        const managedEntries = currentEntries.filter((entry) => entry?.managed === true);
        const updatedUidSet = new Set((updatedEntryUids ?? []).map((uid) => String(uid ?? '')).filter(Boolean));
        const updatedCount = managedEntries.filter((entry) => updatedUidSet.has(String(entry?.uid ?? ''))).length;
        const smallCount = managedEntries.filter((entry) => String(entry?.summaryMark || '') === 'S').length;
        const largeCount = managedEntries.filter((entry) => String(entry?.summaryMark || '') === 'L').length;
        const foundationCount = managedEntries.filter((entry) => String(entry?.type || '') === '基础设定').length;
        const bedrockCount = managedEntries.filter((entry) => entry?.bedrockLocked === true || entry?.locked === true).length;
        if (this.managementStatusNode) this.managementStatusNode.textContent = `${worldbookName ? `世界书：${worldbookName}；` : ''}${managedEntries.length} 条镜渊条目`;
        const grid = document.createElement('div');
        grid.className = 'ma-lite-management-grid';
        const cards = [
            ['当前场景', model.currentScene?.title || '未识别', '换场后自动开启新的场景组', 'primary'],
            ['本轮更新', String(updatedCount), updatedCount ? '对应条目列表中显示“更新”' : '本轮没有世界书变化', updatedCount ? 'update' : ''],
            ['世界书条目', String(managedEntries.length), '世界书是当前正文唯一事实源', ''],
            ['总结层级', `S ${smallCount} / L ${largeCount}`, 'S=已小总结；L=已大总结', ''],
            ['基础设定', String(foundationCount), '大总结形成或更新的整体运行规律', ''],
            ['基石锁', String(bedrockCount), '锁定条目只由玩家明确操作', ''],
        ];
        for (const [label, value, detail, kind] of cards) {
            const card = document.createElement('div');
            card.className = 'ma-lite-management-card';
            if (kind) card.dataset.kind = kind;
            const strong = document.createElement('strong');
            strong.textContent = `${label}：${value}`;
            const small = document.createElement('small');
            small.textContent = detail;
            card.append(strong, small);
            grid.append(card);
        }
        this.managementNode.append(grid);
        this.managementEntries = currentEntries;
    }

    selectedManagementUids() {
        const valid = new Set((this.recallModel?.entries ?? []).map((entry) => String(entry?.uid ?? '').trim()).filter(Boolean));
        for (const uid of [...this.recallSelectedUids]) {
            if (!valid.has(uid)) this.recallSelectedUids.delete(uid);
        }
        return [...this.recallSelectedUids];
    }
    async summarizeSelectedEntries(kind) {
        const uids = this.selectedManagementUids();
        if (!uids.length) { this.setStatus('至少选择一个条目才能总结', true); return; }
        const summaryKind = kind === 'large' ? 'large' : 'small';
        const actionKey = summaryKind === 'large' ? 'selectedLargeSummary' : 'selectedSmallSummary';
        const label = summaryKind === 'large' ? '大总结' : '小总结';
        if (this.pendingActions.has(actionKey)) return;
        this.pendingActions.add(actionKey); this.syncDisabledState();
        if (this.recallStatusNode) this.recallStatusNode.textContent = `正在对玩家选中的${uids.length}个条目执行${label}…`;
        try {
            const result = await this.actions.summarizeEntries?.(summaryKind, uids);
            const settlement = result?.summarySettlement || {};
            const writes = Number(result?.warehouse?.createdCount || 0) + Number(result?.warehouse?.updatedCount || 0);
            const deleted = Number(result?.warehouse?.deletedCount || settlement.deletedEntries || 0);
            const detail = result?.changed
                ? `选中${label}完成：处理${Number(result?.processedPendingUids?.length || 0)}个条目，写入${writes}，删除${deleted}`
                : `选中${label}完成，但本批没有产生世界书变化`;
            this.setStatus(detail); if (this.recallStatusNode) this.recallStatusNode.textContent = detail;
            this.recallSelectedUids.clear();
            await this.refreshWorldbookPage(true);
        } catch (error) {
            const text = `选中${label}失败：${(0, util_1.errorText)(error)}`;
            this.setStatus(text, true); if (this.recallStatusNode) this.recallStatusNode.textContent = `${text}；已保留当前选择，可调整后重试。`;
        } finally { this.pendingActions.delete(actionKey); this.syncDisabledState(); }
    }

    async mergeSelectedEntries() {
        const uids = this.selectedManagementUids();
        if (uids.length < 2) { this.setStatus('至少选择两个条目才能合并', true); return; }
        if (this.pendingActions.has('mergeEntries')) return;
        this.pendingActions.add('mergeEntries'); this.syncDisabledState();
        if (this.recallStatusNode) this.recallStatusNode.textContent = `正在整理${uids.length}个玩家选中条目之间的结构关系…`;
        try {
            const result = await this.actions.mergeEntries?.(uids);
            const detail = `合并完成：写入${Number(result?.warehouse?.createdCount || 0) + Number(result?.warehouse?.updatedCount || 0)}，删除${Number(result?.warehouse?.deletedCount || 0)}`;
            this.setStatus(detail); if (this.recallStatusNode) this.recallStatusNode.textContent = detail;
            this.recallSelectedUids.clear();
            await this.refreshWorldbookPage(true);
        } catch (error) {
            const text = `合并失败：${(0, util_1.errorText)(error)}`; this.setStatus(text, true); if (this.recallStatusNode) this.recallStatusNode.textContent = text;
        } finally { this.pendingActions.delete('mergeEntries'); this.syncDisabledState(); }
    }
    async deleteSelectedEntries() {
        const uids = this.selectedManagementUids();
        if (!uids.length) { this.setStatus('至少选择一个条目才能删除', true); return; }
        if (typeof globalThis.confirm === 'function' && !globalThis.confirm(`确定删除选中的${uids.length}个世界书条目吗？`)) return;
        if (this.pendingActions.has('deleteEntries')) return;
        this.pendingActions.add('deleteEntries'); this.syncDisabledState();
        try {
            const result = await this.actions.deleteEntries?.(uids);
            const detail = `已删除${Number(result?.deletedCount || result?.warehouse?.deletedCount || 0)}个条目`;
            this.setStatus(detail); if (this.recallStatusNode) this.recallStatusNode.textContent = detail;
            this.recallSelectedUids.clear();
            await this.refreshWorldbookPage(true);
        } catch (error) {
            const text = `删除失败：${(0, util_1.errorText)(error)}`; this.setStatus(text, true); if (this.recallStatusNode) this.recallStatusNode.textContent = text;
        } finally { this.pendingActions.delete('deleteEntries'); this.syncDisabledState(); }
    }

    buildRecallSection() {
        const section = document.createElement('section');
        section.className = 'ma-lite-recall';
        const head = document.createElement('div');
        head.className = 'ma-lite-recall-head';
        const title = document.createElement('span');
        title.className = 'ma-lite-section-spacer';
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'ma-lite-recall-edit';
        edit.textContent = '修改';
        edit.title = '进入条目修改模式后再显示选择框、合并与删除';
        edit.setAttribute('aria-label', '修改世界书条目');
        edit.addEventListener('click', () => this.toggleRecallEditMode());
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
        head.append(title, edit, replan, refresh);
        const status = document.createElement('div');
        status.className = 'ma-lite-recall-status';
        status.textContent = '查看当前镜渊世界书条目；人工维护时进入“修改”模式。';
        const lockHelp = document.createElement('div');
        lockHelp.className = 'ma-lite-lock-help';
        lockHelp.innerHTML = '<strong>基石锁：</strong>开启后该条目对自动流程完全只读；玩家可手动解除。人工合并或删除视为本次明确授权。';
        lockHelp.hidden = true;
        this.recallLockHelpNode = lockHelp;
        const manageActions = document.createElement('div');
        manageActions.className = 'ma-lite-worldbook-quick-actions ma-lite-recall-edit-actions';
        manageActions.hidden = true;
        const selectedSmall = document.createElement('button');
        selectedSmall.type = 'button'; selectedSmall.textContent = '选中小总结'; selectedSmall.title = '只处理玩家当前选中的世界书条目；不影响其他场景组或自动总结进度';
        selectedSmall.addEventListener('click', () => void this.summarizeSelectedEntries('small'));
        const selectedLarge = document.createElement('button');
        selectedLarge.type = 'button'; selectedLarge.textContent = '选中大总结'; selectedLarge.title = '只处理玩家当前选中的世界书条目；不影响其他场景组或自动总结进度';
        selectedLarge.addEventListener('click', () => void this.summarizeSelectedEntries('large'));
        const merge = document.createElement('button');
        merge.type = 'button'; merge.textContent = '合并'; merge.title = '把玩家选中的完整条目直接交给模型合并整理';
        merge.addEventListener('click', () => void this.mergeSelectedEntries());
        const remove = document.createElement('button');
        remove.type = 'button'; remove.textContent = '删除'; remove.title = '批量删除玩家明确选中的条目';
        remove.addEventListener('click', () => void this.deleteSelectedEntries());
        manageActions.append(selectedSmall, selectedLarge, merge, remove);
        this.buttons.selectedSmallSummary = selectedSmall;
        this.buttons.selectedLargeSummary = selectedLarge;
        this.buttons.mergeEntries = merge;
        this.buttons.deleteEntries = remove;
        const content = document.createElement('div');
        content.className = 'ma-lite-recall-empty';
        content.textContent = '尚未读取';
        section.append(head, status, lockHelp, manageActions, content);
        this.recallNode = content;
        this.recallStatusNode = status;
        this.recallRefreshButton = refresh;
        this.recallReplanButton = replan;
        this.recallEditButton = edit;
        this.recallEditActionsNode = manageActions;
        return section;
    }
    toggleRecallEditMode(force = null) {
        this.recallEditMode = force == null ? !this.recallEditMode : Boolean(force);
        if (this.recallEditButton) {
            this.recallEditButton.textContent = this.recallEditMode ? '完成' : '修改';
            this.recallEditButton.dataset.active = this.recallEditMode ? 'true' : 'false';
            this.recallEditButton.setAttribute('aria-pressed', this.recallEditMode ? 'true' : 'false');
        }
        if (this.recallEditActionsNode) this.recallEditActionsNode.hidden = !this.recallEditMode;
        if (this.recallLockHelpNode) this.recallLockHelpNode.hidden = !this.recallEditMode;
        if (this.recallStatusNode) this.recallStatusNode.textContent = this.recallEditMode
            ? '修改模式：可选择条目执行小总结/大总结、合并或删除，也可逐条设置基石锁。'
            : `${this.recallWorldbookName ? `世界书：${this.recallWorldbookName}；` : ''}仅显示镜渊管理条目，共 ${Number(this.recallModel?.total || 0)} 条。`;
        this.renderRecallPage();
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
            const workspace = await this.actions.loadWorkspace(force);
            if (serial !== this.recallLoadSerial || !this.recallNode) return;
            const model = buildRecallViewModel(workspace?.entries ?? [], workspace?.updatedEntryUids ?? []);
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
        const validUids = new Set((model?.entries ?? []).map((entry) => String(entry?.uid ?? '').trim()).filter(Boolean));
        for (const uid of [...this.recallSelectedUids]) {
            if (!validUids.has(uid)) this.recallSelectedUids.delete(uid);
        }
        const pageCount = Math.max(1, Math.ceil(Number(model?.total || 0) / this.recallPageSize));
        this.recallPage = Math.min(Math.max(1, this.recallPage), pageCount);
        this.renderRecallPage();
    }
    renderRecallPage() {
        if (!this.recallNode || !this.recallModel) return;
        const model = this.recallModel;
        this.recallNode.className = '';
        this.recallNode.replaceChildren();
        const normalizedQuery = (0, util_1.normalizeFact)(String(this.recallQuery || ''));
        const filteredEntries = model.entries.filter((item) => recallFilterMatches(item, this.recallFilter) && (!normalizedQuery || String(item.searchText || '').includes(normalizedQuery)));
        if (this.recallStatusNode) this.recallStatusNode.textContent = this.recallEditMode
            ? '修改模式：选择条目后可执行小总结/大总结、合并或删除，也可逐条设置基石锁。'
            : `${this.recallWorldbookName ? `世界书：${this.recallWorldbookName}；` : ''}显示 ${filteredEntries.length} / ${model.total} 条。显示当前条目与召回状态。`;
        if (!model.total) {
            this.recallNode.className = 'ma-lite-recall-empty';
            this.recallNode.textContent = '当前世界书没有镜渊管理条目';
            return;
        }

        const toolbar = document.createElement('div');
        toolbar.className = 'ma-lite-recall-toolbar';
        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'ma-lite-recall-search';
        search.placeholder = '搜索条目、关键词或关联对象';
        search.value = this.recallQuery;
        search.setAttribute('aria-label', '搜索世界书条目');
        search.addEventListener('input', () => {
            this.recallQuery = search.value;
            this.recallPage = 1;
            this.renderRecallPage();
            const next = this.recallNode?.querySelector?.('.ma-lite-recall-search');
            next?.focus?.();
            try { next?.setSelectionRange?.(this.recallQuery.length, this.recallQuery.length); } catch { }
        });
        const filter = document.createElement('select');
        filter.className = 'ma-lite-recall-filter';
        filter.setAttribute('aria-label', '筛选世界书条目');
        for (const [value, label] of [
            ['all', '全部条目'], ['current', '当前'], ['recent', '近期'], ['history', '历史'],
            ['constant', '常驻'], ['keyword', '关键词'], ['vector', '含向量'], ['related', '有关联'], ['disabled', '停用'],
        ]) {
            const option = document.createElement('option');
            option.value = value; option.textContent = label; option.selected = this.recallFilter === value;
            filter.append(option);
        }
        filter.addEventListener('change', () => { this.recallFilter = filter.value; this.recallPage = 1; this.renderRecallPage(); });
        toolbar.append(search, filter);

        const summary = document.createElement('div');
        summary.className = 'ma-lite-recall-summary';
        for (const item of model.summary) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'ma-lite-chip ma-lite-recall-summary-chip';
            chip.dataset.active = this.recallFilter === item.key ? 'true' : 'false';
            chip.textContent = `${item.label} ${item.count}`;
            chip.title = `${item.description}；点击筛选`;
            chip.addEventListener('click', () => {
                this.recallFilter = this.recallFilter === item.key ? 'all' : item.key;
                this.recallPage = 1;
                this.renderRecallPage();
            });
            summary.append(chip);
        }

        this.recallNode.append(toolbar, summary);
        if (!filteredEntries.length) {
            const empty = document.createElement('div');
            empty.className = 'ma-lite-recall-empty';
            empty.textContent = '当前搜索或筛选条件下没有条目';
            this.recallNode.append(empty);
            return;
        }

        const pageCount = Math.max(1, Math.ceil(filteredEntries.length / this.recallPageSize));
        this.recallPage = Math.min(Math.max(1, this.recallPage), pageCount);
        const start = (this.recallPage - 1) * this.recallPageSize;
        const visibleEntries = filteredEntries.slice(start, start + this.recallPageSize);
        const list = document.createElement('div');
        list.className = 'ma-lite-recall-list';
        for (const item of visibleEntries) {
            const row = document.createElement('div');
            row.className = 'ma-lite-recall-row';
            row.dataset.mode = item.mappingKind;
            const head = document.createElement('div');
            head.className = 'ma-lite-recall-row-head';
            const title = document.createElement('div');
            title.className = 'ma-lite-recall-title';
            title.textContent = item.title;
            title.title = item.title;
            if (this.recallEditMode) {
                const select = document.createElement('input');
                select.type = 'checkbox';
                select.dataset.entryUid = String(item.uid || '');
                select.checked = this.recallSelectedUids.has(String(item.uid || ''));
                select.setAttribute('aria-label', `选择${item.title}`);
                select.addEventListener('change', () => {
                    const uid = String(item.uid || '').trim();
                    if (!uid) return;
                    if (select.checked) this.recallSelectedUids.add(uid);
                    else this.recallSelectedUids.delete(uid);
                });
                head.append(select);
            }
            head.append(title);
            if (this.recallEditMode && typeof this.actions.setBedrockLocked === 'function') {
                const locks = document.createElement('div');
                locks.className = 'ma-lite-recall-locks';
                const bedrock = document.createElement('button');
                bedrock.type = 'button';
                bedrock.className = 'ma-lite-recall-lock';
                bedrock.dataset.mode = 'bedrock';
                bedrock.dataset.active = item.bedrockLocked ? 'true' : 'false';
                bedrock.textContent = item.bedrockLocked ? '基石锁✓' : '基石锁';
                bedrock.title = item.bedrockLocked ? '已开启基石锁：系统完全只读；点击解除' : '开启基石锁：系统对该条目完全只读';
                bedrock.addEventListener('click', async () => {
                    bedrock.disabled = true;
                    try {
                        await this.actions.setBedrockLocked(item.uid, !item.bedrockLocked);
                        this.setStatus(item.bedrockLocked ? `已解除基石锁：${item.title}` : `已开启基石锁：${item.title}`);
                        await this.refreshRecallMap(true);
                    } catch (error) { this.setStatus(`基石锁设置失败：${(0, util_1.errorText)(error)}`, true); }
                    finally { bedrock.disabled = false; }
                });
                locks.append(bedrock);
                head.append(locks);
            }
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

            const main = document.createElement('div');
            main.className = 'ma-lite-recall-main';
            const mapping = document.createElement('span');
            mapping.className = 'ma-lite-recall-mode';
            mapping.dataset.kind = item.mappingKind;
            mapping.textContent = item.mappingMode;
            const reason = document.createElement('span');
            reason.className = 'ma-lite-recall-reason';
            reason.textContent = item.reason;
            main.append(mapping, reason);

            const meta = document.createElement('div');
            meta.className = 'ma-lite-recall-meta';
            for (const badge of item.badges.slice(1)) {
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

            let relations = null;
            if (item.relationCount > 0) {
                relations = document.createElement('div');
                relations.className = 'ma-lite-recall-relations';
                const shown = item.relationTitles.slice(0, 3);
                relations.textContent = `直接关联：${shown.join(' · ')}${item.relationCount > shown.length ? ` ＋${item.relationCount - shown.length}` : ''}`;
                relations.title = item.relationTitles.join('\n');
            }

            const details = document.createElement('details');
            details.className = 'ma-lite-recall-details';
            const detailsSummary = document.createElement('summary');
            detailsSummary.textContent = '映射参数';
            const detailBody = document.createElement('div');
            detailBody.className = 'ma-lite-recall-detail-grid';
            const technical = [
                ['规则', item.profileName || '未记录'],
                ['触发词', item.triggerKeywords.length ? item.triggerKeywords.join('、') : '无'],
                ['递归', item.recursionLabel],
                ['位置', item.position],
                ['顺序', String(item.order)],
                ['深度', String(item.depth)],
                ['扫描', item.scanDepth == null ? '继承' : String(item.scanDepth)],
            ];
            for (const [label, value] of technical) {
                const cell = document.createElement('div');
                const key = document.createElement('span'); key.textContent = label;
                const val = document.createElement('b'); val.textContent = value;
                cell.append(key, val); detailBody.append(cell);
            }
            details.append(detailsSummary, detailBody);
            row.append(head, main, meta);
            if (relations) row.append(relations);
            row.append(details);
            list.append(row);
        }
        this.recallNode.append(list);
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
                this.setStatus(value ? `游戏时间常驻条目已设为：${value}` : '游戏时间常驻条目已删除');
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
            const raw = String(input.value ?? '').trim();
            const numeric = Number(raw);
            if (!raw || !Number.isFinite(numeric)) {
                if (Number.isFinite(previous)) input.value = String(previous);
                this.setStatus(`${labelText}未修改：请输入 ${min}-${max} 的整数`);
                return;
            }
            const value = Math.max(min, Math.min(max, numeric));
            input.disabled = true;
            try {
                const saved = await this.actions.configure?.({ [key]: value });
                const normalized = Number(saved?.[key] ?? this.getSettings()?.[key] ?? value);
                input.value = String(Number.isFinite(normalized) ? normalized : value);
                this.setStatus(`${labelText}已设为 ${input.value}`);
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
        if (this.inputs.largeSummaryCount) this.inputs.largeSummaryCount.value = String(settings.largeSummaryCount ?? 4);
        if (this.gameTimeInput && (typeof document === 'undefined' || document.activeElement !== this.gameTimeInput)) this.gameTimeInput.value = String(this.actions.getGameTimeAnchor?.()?.label || '');
        if (this.inputs.auditPrompt && (typeof document === 'undefined' || document.activeElement !== this.inputs.auditPrompt)) {
            this.inputs.auditPrompt.value = String(settings.auditPrompt || '');
        }
        if (this.apiProfileSelect && this.profileDropdownBound) {
            const selectedId = String(settings.modelProfileId || '');
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
        this.refreshSummaryFailures();
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
        if (this.buttons.process) this.buttons.process.disabled = busy || !master;
        if (this.buttons.cancel) this.buttons.cancel.disabled = !queueBusy;
        if (this.buttons.audit) this.buttons.audit.disabled = busy || !master;
        if (this.buttons.extract) this.buttons.extract.disabled = busy || !master;
        if (this.buttons.smallSummary) this.buttons.smallSummary.disabled = busy || !master;
        if (this.buttons.largeSummary) this.buttons.largeSummary.disabled = busy || !master;
        if (this.summaryFailureSmallButton) this.summaryFailureSmallButton.disabled = busy || !master;
        if (this.summaryFailureListNode) this.summaryFailureListNode.querySelectorAll('button').forEach((button) => { button.disabled = busy || !master; });
        if (this.buttons.selectedSmallSummary) this.buttons.selectedSmallSummary.disabled = busy || !master;
        if (this.buttons.selectedLargeSummary) this.buttons.selectedLargeSummary.disabled = busy || !master;
        if (this.buttons.mergeEntries) this.buttons.mergeEntries.disabled = busy || !master;
        if (this.buttons.deleteEntries) this.buttons.deleteEntries.disabled = busy || !master;
        if (this.recallEditButton) this.recallEditButton.disabled = busy || !master;
        if (this.buttons.testApiProbe) this.buttons.testApiProbe.disabled = busy;
        if (this.buttons.auditPromptSave) this.buttons.auditPromptSave.disabled = busy;
        if (this.worldSettingPreviewButton) this.worldSettingPreviewButton.disabled = busy || !master || !String(this.worldSettingTextarea?.value || '').trim();
        if (this.worldSettingCommitButton) this.worldSettingCommitButton.disabled = busy || !master || this.worldSettingDirty || !this.actions.worldSettingsPreview?.();
        if (this.worldSettingClearButton) this.worldSettingClearButton.disabled = busy || (!String(this.worldSettingTextarea?.value || '').trim() && !this.actions.worldSettingsPreview?.());
        if (this.rebuildPreviewButton) this.rebuildPreviewButton.disabled = busy || !master;
        if (this.rebuildCommitButton) this.rebuildCommitButton.disabled = busy || !master || !this.actions.migrationPreview?.();
        if (this.rebuildUndoButton) this.rebuildUndoButton.disabled = busy || this.rebuildUndoButton.dataset.available !== 'true';
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
        this.rebuildStatusNode.textContent = detail || '整本世界书整理';
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
            messageIndex: Object.prototype.hasOwnProperty.call(meta, 'messageIndex')
                ? (Number.isInteger(meta.messageIndex) && meta.messageIndex >= 0 ? meta.messageIndex : null)
                : previous.messageIndex,
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
    resetLiveTaskStates(detail = '待命') {
        // ui.73: 后台维护（小/大总结、整理、迁移等）没有正文 messageIndex，
        // 只重置面板上的“当前四阶段”，保留每条正文已经完成的消息级状态。
        this.taskStates = { audit: freshTaskState(detail), revision: freshTaskState(detail), extract: freshTaskState(detail), write: freshTaskState(detail) };
        this.renderPipeline();
        this.scheduleIndicatorRefresh();
    }
    resetTaskStates(detail = '待命') {
        this.resetLiveTaskStates(detail);
        this.messageTaskStates.clear();
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
        const enabled = { audit: master, revision: master, extract: master, write: master };
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
    return { modelProfileId: String(profileId || '') };
}
function buildRecallViewModel(entries, updatedEntryUids = []) {
    // [MA-ENTRY-UPDATED-BADGE] UI 只消费系统内部给出的 UID 集合；不新增日志，也不把 UID 暴露给模型。
    const updatedUidSet = new Set((Array.isArray(updatedEntryUids) ? updatedEntryUids : []).map((uid) => String(uid ?? '').trim()).filter(Boolean));
    const managed = (Array.isArray(entries) ? entries : []).filter((entry) => entry?.managed === true);
    const byUid = new Map(managed.map((entry) => [String(entry.uid ?? ''), entry]));
    const byTitle = new Map(managed.map((entry) => [(0, util_1.normalizeTitle)(String(entry.title ?? '')).toLocaleLowerCase(), entry]));
    const directRelations = new Map(managed.map((entry) => [String(entry.uid ?? ''), new Set()]));
    const addRelation = (sourceUid, targetUid) => {
        const source = String(sourceUid ?? '').trim();
        const target = String(targetUid ?? '').trim();
        if (!source || !target || source === target || !byUid.has(source) || !byUid.has(target)) return;
        directRelations.get(source)?.add(target);
        directRelations.get(target)?.add(source);
    };
    for (const entry of managed) {
        const sourceUid = String(entry.uid ?? '');
        for (const targetUid of [entry.parentUid, ...(entry.childUids ?? []), ...(entry.relatedIds ?? [])]) addRelation(sourceUid, targetUid);
        for (const reference of entry.references ?? []) {
            const target = byTitle.get((0, util_1.normalizeTitle)(String(reference ?? '')).toLocaleLowerCase());
            if (target) addRelation(sourceUid, target.uid);
        }
    }
    const mapped = managed.map((entry) => {
        const activation = entry.activation ?? {};
        const constant = activation.constant === true;
        // [MA-UI-RECALL-01] 关键词统计只读取 raw.key 的真实非 UID 触发词，不能用用于匹配的逻辑关键词冒充触发。
        const triggerKeywords = (entry.triggerKeywords ?? []).filter((keyword) => !(0, util_1.isUidKeyword)(keyword));
        const trigger = !constant && triggerKeywords.length > 0;
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
        const disabled = activation.disabled === true || activation.enabled === false;
        const mappingMode = disabled ? '停用' : constant ? '常驻' : trigger && vector ? '关键词 + 向量' : trigger ? '关键词召回' : vector ? '向量召回' : '被关联召回';
        const mappingKind = disabled ? 'isolated' : constant ? 'constant' : trigger ? 'active' : vector ? 'vector' : 'bridge';
        const profileName = String(entry.recallProfile || '');
        const reason = recallReason({ disabled, constant, trigger, vector, semanticRole, sceneStage, recursion: recursion.key, profileName, lifecycle });
        const relationTitles = [...(directRelations.get(String(entry.uid ?? '')) ?? [])]
            .map((uid) => byUid.get(uid)?.title)
            .filter(Boolean)
            .sort((left, right) => String(left).localeCompare(String(right), 'zh-CN'));
        const badges = [{ label: mappingMode, kind: mappingKind }];
        // [MA-ENTRY-UPDATED-BADGE] 最近一次完整处理回合真正改过该 UID 时，只显示“更新”二字。
        if (updatedUidSet.has(String(entry.uid ?? ''))) badges.push({ label: '更新', kind: 'update' });
        // [MA-SUMMARY-UID-MARK-02] UI 只显示处理痕迹；S/L 不生成新 UID，也不改变条目身份。
        if (entry.summaryMark === 'S') badges.push({ label: 'S', kind: 'summary' });
        else if (entry.summaryMark === 'L') badges.push({ label: 'L', kind: 'summary' });
        if (sceneStage) badges.push({ label: sceneStage === 'current' ? '当前场景' : sceneStage === 'previous' ? '上一场景' : '远期场景', kind: 'scene' });
        if (semanticRole === 'world-state') badges.push({ label: '世界变化', kind: 'scene' });
        if (entry.bedrockLocked === true) badges.push({ label: '基石锁', kind: 'bedrock' });
        badges.push({ label: recursion.label, kind: recursion.kind });
        const searchText = (0, util_1.normalizeFact)([
            entry.title, entry.type, mappingMode, lifecycleInfo.label, profileName, reason,
            ...triggerKeywords, ...relationTitles,
        ].filter(Boolean).join(' '));
        return {
            uid: String(entry.uid ?? ''),
            type: String(entry.type ?? ''),
            focus: entry.focus === true,
            bedrockLocked: entry.bedrockLocked === true,
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
            recursionLabel: recursion.label,
            disabled,
            mappingMode,
            mappingKind,
            profileName,
            reason,
            badges,
            relationTitles,
            relationCount: relationTitles.length,
            triggerKeywords,
            searchText,
            position: positionLabel,
            depth,
            order: Number(activation.order ?? 400),
            scanDepth: activation.scanDepth == null ? null : Number(activation.scanDepth),
            updatedAt: Number(entry.updatedAt || 0),
        };
    });
    mapped.sort((left, right) => Number(left.disabled) - Number(right.disabled) || Number(right.constant) - Number(left.constant) || Number(right.sceneStage === 'current') - Number(left.sceneStage === 'current') || Number(right.sceneStage === 'previous') - Number(left.sceneStage === 'previous') || right.order - left.order || right.updatedAt - left.updatedAt || left.title.localeCompare(right.title, 'zh-CN'));
    const summary = [
        { key: 'current', label: '当前', count: mapped.filter((item) => item.sceneStage === 'current' || item.lifecycle === 'active').length, description: '当前场景或当前活动条目' },
        { key: 'recent', label: '近期', count: mapped.filter((item) => item.sceneStage === 'previous' || item.lifecycle === 'recent').length, description: '上一场景或近期记忆' },
        { key: 'history', label: '历史', count: mapped.filter((item) => item.sceneStage === 'remote' || ['long-term', 'historical', 'closed'].includes(item.lifecycle)).length, description: '远期、长期或已经关闭的记忆' },
        { key: 'constant', label: '常驻', count: mapped.filter((item) => item.constant && !item.disabled).length, description: '直接进入上下文的条目' },
        { key: 'keyword', label: '关键词', count: mapped.filter((item) => item.trigger && !item.disabled).length, description: '依靠稳定关键词触发的条目' },
        { key: 'vector', label: '纯向量', count: mapped.filter((item) => item.vector && !item.trigger && !item.constant && !item.disabled).length, description: '主要依靠 Vector Storage 语义召回的条目' },
        { key: 'related', label: '有关联', count: mapped.filter((item) => item.relationCount > 0).length, description: '存在确定性直接关联的条目' },
        { key: 'disabled', label: '停用', count: mapped.filter((item) => item.disabled).length, description: '当前不参与召回的条目' },
    ];
    return { total: mapped.length, summary, entries: mapped, omitted: 0 };
}

function recallReason(item) {
    if (item.disabled) return '条目已停用，不参与当前召回。';
    if (item.semanticRole === 'foundation') return '基础设定长期常驻，并与递归链隔离。';
    if (item.semanticRole === 'focus') return '玩家焦点长期常驻，只改变可见性，不改变事实内容。';
    if (item.semanticRole === 'scene-current' || item.sceneStage === 'current') return '当前场景直接常驻，作为当前局部世界的召回入口。';
    if (item.semanticRole === 'scene-previous' || item.sceneStage === 'previous') return '上一场景由稳定场景关键词触发，用于恢复最近的局部关联。';
    if (item.semanticRole === 'scene-remote' || item.sceneStage === 'remote') return '远期场景主要通过向量语义回忆，需要时再恢复场景关联。';
    if (item.semanticRole === 'event-active') return '活动事件由稳定关键词触发，被召回后停止继续扩散。';
    if (item.semanticRole === 'event-history') return '已结束事件降为历史向量记忆，不占用当前关键词入口。';
    if (item.semanticRole === 'world-state') return '世界变化通过稳定关键词进入，并作为关联终点避免世界条目互相递归扩散。';
    if (item.semanticRole === 'role-object') return '人物由稳定名称或关键词召回；被场景带出后不继续扩散。';
    if (item.semanticRole === 'item-object') return '物品由稳定名称或关键词召回；被场景带出后不继续扩散。';
    if (item.semanticRole === 'legacy-object') return '旧类型仅保留稳定关键词入口，不参与自动扩散。';
    if (item.profileName) return `当前采用“${item.profileName}”映射规则。`;
    if (item.constant) return '该条目当前直接常驻。';
    if (item.trigger && item.vector) return '该条目可由稳定关键词或向量语义召回。';
    if (item.trigger) return '该条目由稳定关键词触发。';
    if (item.vector) return '该条目主要通过向量语义召回。';
    return '该条目只能通过已有确定性关联进入上下文。';
}

function recallFilterMatches(item, filter) {
    switch (String(filter || 'all')) {
        case 'current': return item.sceneStage === 'current' || item.lifecycle === 'active';
        case 'recent': return item.sceneStage === 'previous' || item.lifecycle === 'recent';
        case 'history': return item.sceneStage === 'remote' || ['long-term', 'historical', 'closed'].includes(item.lifecycle);
        case 'constant': return item.constant && !item.disabled;
        case 'keyword': return item.trigger && !item.disabled;
        case 'vector': return item.vector && !item.constant && !item.disabled;
        case 'related': return item.relationCount > 0;
        case 'disabled': return item.disabled;
        default: return true;
    }
}

function lifecycleBadge(value) {
    return ({
        core: { label: '核心', kind: 'constant' },
        active: { label: '活动', kind: 'active' },
        recent: { label: '近期', kind: 'active' },
        'long-term': { label: '长期', kind: 'history' },
        historical: { label: '历史', kind: 'history' },
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
/**
 * Mirror Abyss — diagnostics
 *
 * 职责：诊断与验收探针。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
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

            {
                await runCheck('audit-protocol', '审核提示词与固定结论协议', '业务协议', async () => {
                    const childToken = { cancelled: false, reason: '' };
                    const protocolSnapshot = this.host.captureMaintenanceSnapshot(settings, 'acceptanceAuditProtocol', childToken);
                    const playerText = '我推开大厅的门。';
                    const assistantText = '门向内打开，灯火照亮青石地面。守门人站在远处看向门口。';
                    const prompt = (0, prompts_1.auditPrompts)(settings, playerText, assistantText, { dialogueContext: '' });
                    const raw = await (0, model_request_1.callModel)({
                        host: this.host,
                        stage: 'audit',
                        prompt,
                        fallbackPrompt: () => (0, prompts_1.auditPrompts)(settings, playerText, assistantText, { compact: true }),
                        settings,
                        snapshot: protocolSnapshot,
                        profileId: settings.modelProfileId,
                        sourceText: `${playerText}\n${assistantText}`,
                    });
                    const parsed = (0, audit_1.parseAuditResult)(raw);
                    if (parsed.decision !== 'pass') throw new Error(`合规样本被判定需要修正：${parsed.issues?.slice(0, 3).join('；') || '未提供原因'}`);
                    return { mode: 'real-model-protocol', decision: parsed.decision, route: settings.modelProfileId ? 'profile' : 'current' };
                });
            }

            {
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
                        profileId: settings.modelProfileId,
                        sourceText: `${playerText}\n${assistantText}`,
                    });
                    const blocks = (0, parser_1.parseExtractionProtocol)(raw);
                    if (!blocks.length) {
                        const diagnostics = blocks.diagnostics || {};
                        throw new Error(`合成状态变化未形成可识别条目格式；异常片段${(diagnostics.skipped || []).length}个`);
                    }
                    return { mode: 'real-model-protocol', entryCount: blocks.length, titles: blocks.map((block) => String(block.title || '')).slice(0, 8), repaired: Number(blocks.diagnostics?.repaired || 0), route: settings.modelProfileId ? 'profile' : 'current' };
                });
            }

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
                const resultEntries = Array.isArray(result?.entries) ? result.entries : Array.isArray(result) ? result : [];
                const expectedDiagnosticTitles = mode === 'real-host-plugin-full-pipeline'
                    ? ['场景｜镜渊原子校验厅', '人物｜伊珞']
                    : mode === 'real-host-main-pipeline'
                        ? ['场景｜镜渊验收庭', '人物｜洛恩']
                        : [];
                const hasExpectedDiagnosticEntry = expectedDiagnosticTitles.length > 0 && expectedDiagnosticTitles.some((title) =>
                    resultEntries.some((entry) => entry?.managed === true && String(entry?.title || '') === title));
                if (businessWrites < 1 && !hasExpectedDiagnosticEntry) throw new Error('正文完成提取但业务条目零写入，且未回读到本次验收目标条目');
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

                {
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
                try { (0, audit_1.parseAuditResult)('这里没有固定审核结论'); }
                catch { auditRejected = true; }
                const malformed = (0, parser_1.parseExtractionProtocol)('<html>bad gateway</html>');
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
    const id = String(settings.modelProfileId || '');
    const labels = ['审核', '修正', '提取', '小总结', '大总结', '重建'];
    const label = id ? `Profile ${id}（${labels.join('、')}）` : `当前连接（${labels.join('、')}）`;
    return [{ id, label, summary: { kind: id ? 'profile' : 'current', profileId: id, stages: labels } }];
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
        autoAudit: settings.autoAudit === true,
        autoExtraction: settings.autoExtraction === true,
        autoSmallSummary: settings.autoSmallSummary !== false,
        responseTokens: Number(settings.responseTokens || 0),
        requestTimeoutMs: Number(settings.requestTimeoutMs || 0),
        modelProfileId: String(settings.modelProfileId || ''),
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
/**
 * Mirror Abyss — domain/entry-section
 *
 * 职责：世界书条目栏目结构的确定性读写。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
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
/**
 * Mirror Abyss — domain/information-point
 *
 * 职责：TYPE_SECTION_ORDER 与信息点投影；栏目 schema 唯一来源。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
"use strict";

const { unique } = require("../util");

// [MA-SECTION-01] 小标题必须先按条目类型归一化。
// 同一个语义不能同时保留“当前”和“当前状态”，否则二次提取会把它们当成两个子条目。
const COMMON_SECTION_ALIASES = {
    '其他名称': '别名',
    '称号': '别名',
};
const TYPE_SECTION_ORDER = Object.freeze({
    人物: Object.freeze(['身份', '稳定', '行为倾向', '表达方式', '当前', '关系', '关系立场', '持有', '已知', '误信', '固定事实', '别名']),
    场景: Object.freeze(['定义', '空间结构', '固定资源', '固定设施', '常驻角色', '固定事实', '当前状态', '在场', '当前资源', '活动关联', '世界影响', '局部约束', '别名']),
    物品: Object.freeze(['定义', '功能', '当前', '限制', '固定事实', '别名']),
    事件: Object.freeze(['参与', '附属人员', '场景', '已发生进展', '未发生进展', '结果', '别名']),
    世界: Object.freeze(['范围', '地理', '组织', '权力', '制度', '资源与交通', '公开局势', '固定事实', '持续影响', '别名']),
    基础设定: Object.freeze(['世界常识', '自然规则', '种族与生命', '能力与技术', '社会规则', '地理框架', '别名']),
});
function isCanonicalSectionName(type, section) {
    return (TYPE_SECTION_ORDER[String(type ?? '').trim()] ?? []).includes(String(section ?? '').trim());
}

const TYPE_SECTION_ALIASES = {
    人物: {
        '身份定义': '身份',
        '持续经历': '固定事实',
        '近期经历': '固定事实',
        '变化记录': '固定事实',
        '当前状态': '当前',
        '现行事实': '当前',
        '状态': '当前',
        '性格': '',
        '人格': '',
        '性格核心': '',
        '决策倾向': '',
        '说话方式': '表达方式',
        '语言风格': '表达方式',
        '阶段性倾向': '行为倾向',
        '行为模式': '行为倾向',
        '判断倾向': '',
        '关系态度': '关系立场',
        '人物状态': '当前',
        '近期状态': '当前',
        '短期状态': '当前',
        '即时状态': '当前',
        '当前情况': '当前',
        '长期倾向': '行为倾向',
        '近期行为倾向': '行为倾向',
        '重复行为倾向': '行为倾向',
        '稳定性格': '',
        '人格核心': '',
        '核心性格': '',
        '表达风格': '表达方式',
        '说话风格': '表达方式',
        '语言习惯': '表达方式',
        '决策模式': '',
        '判断模式': '',
        '选择倾向': '',
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
exports.TYPE_SECTION_ORDER = TYPE_SECTION_ORDER;
exports.isCanonicalSectionName = isCanonicalSectionName;
exports.canonicalSectionName = canonicalSectionName;
exports.mergeCanonicalLines = mergeCanonicalLines;
exports.prepareInformationBlocks = prepareInformationBlocks;

},"governance":function(module,exports,require){
/**
 * Mirror Abyss — governance
 *
 * 职责：基石锁、焦点保护与人工治理边界。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.governInformationBlocks = governInformationBlocks;
exports.currentEventState = currentEventState;
exports.activeContext = activeContext;
exports.isGenericBackgroundPerson = isGenericBackgroundPerson;
exports.buildDirectRelationIndex = buildDirectRelationIndex;
const semantic_1 = require("./semantic");
const util_1 = require("./util");

const GENERIC_PERSON_PATTERN = /(?:路人|行人|群众|围观者|学生|同学|顾客|客人|乘客|司机|店员|服务员|工作人员|办事员|职员|管理员|门卫|保安|守卫|士兵|侍卫|仆人|侍者|医生|护士|药师|监考|裁判|主持人|接待员|售货员|收银员|快递员|邻居|居民|村民|市民|男人|女人|男子|女子|青年|老人|小孩|孩子|声音|账号)$/u;
const TEMPORARY_MARKER = /(?:临时|一次性|路过|偶遇|无名|不知名|陌生|普通|随机|现场一名|某个|一位|一名)/u;
const FIXED_SCENE_MARKER = /(?:常驻|固定|长期负责|日常负责|值班|驻守|驻场|本店|本楼|本校|该场景|负责此处|管理此处|看守此处)/u;
const INDEPENDENT_MARKER = /(?:独立目标|持续职责|关键证人|核心线索|长期关系|长期任务|持续影响|独立行动线|必须单独追踪)/u;

function governInformationBlocks(sourceBlocks, entries, contextText = '', options = {}) {
    const blocks = (sourceBlocks ?? []).map((block) => structuredClone(block));
    const diagnostics = { attached: [], filtered: [], promoted: [], warnings: [] };
    // Summary output is already a system-selected higher-level distribution.
    if (options.sourceKind === 'summary') {
        return { blocks, diagnostics, currentSceneTitle: blocks.find((block) => block.type === '场景')?.title ?? '' };
    }
    // [MA-ARCH-02] 场景语义只由主预设“地点：”字段决定。插件不再用正文正则二次理解
    // 人物、转交、关系、计划等剧情含义。若模型返回了场景块，只把其稳定身份机械对齐到地点栏，
    // 保留模型已经提取出的场景事实；没有场景事实时不凭空制造业务条目。
    const explicitSceneName = explicitCurrentSceneName(contextText);
    // [MA-SCENE-BOUNDARY-LOCK] 没有权威“地点：”时不得从模型返回的场景块猜当前地点；模型场景块仍作为普通业务事实保留。
    // 提取层不改写、合并或删除模型已经输出的场景事实；地点字段只作为当前场景标签使用。
    return {
        blocks,
        diagnostics,
        currentSceneTitle: explicitSceneName ? `场景｜${explicitSceneName}` : '',
    };
}


function explicitCurrentSceneName(contextText) {
    return (0, util_1.extractLatestSceneLocation)(contextText);
}

// Models occasionally put structured current-scene facts inside one natural
// sentence.  Normalize the two fields that drive the production projection so
// recall and the management panel observe the same state.

function isGenericBackgroundPerson(block) {
    if (!block) return false;
    const name = String(block.name ?? '').trim();
    const roleName = name.replace(/(?:甲|乙|丙|丁|A|B|C|D|\d+)$/iu, '');
    const body = blockText(block);
    if (/^身份未明/u.test(name)) return false;
    if (TEMPORARY_MARKER.test(name) || TEMPORARY_MARKER.test(body)) return true;
    return GENERIC_PERSON_PATTERN.test(roleName);
}


function blockText(block) {
    return [block?.name, ...(block?.sections ?? []).flatMap((section) => section.lines ?? [])].filter(Boolean).join('\n');
}

function currentEventState(value) {
    if (!value || String(value.type ?? '') !== '事件') return 'active';
    // 唯一语义权威：提取模型明确给出的“结束”只在结构化 factRows 中判断；
    // 已提交世界书事件只看【结果】结构，不再从自然语言关键词猜“终止/受阻/暂停”。
    if (Array.isArray(value.factRows) && value.factRows.some((row) => String(row?.change ?? '') === '结束')) return 'completed';
    return (0, semantic_1.isEventClosed)(value) ? 'completed' : 'active';
}
function eventText(value) {
    if (Array.isArray(value?.sections)) return value.sections.flatMap((section) => section.lines ?? []).join('\n');
    return Object.values(value?.sections?.values ?? {}).flat().join('\n');
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
    const openEvents = list.filter((entry) => entry.type === '事件' && currentEventState(entry) !== 'completed');
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
/**
 * Mirror Abyss — host
 *
 * 职责：SillyTavern 宿主适配：聊天、世界书、连接与事件边界。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
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
    chatLocator() {
        const context = this.context();
        const chatIdRaw = context.getCurrentChatId?.() ?? context.chatId;
        const chatId = String(chatIdRaw ?? '').replace(/\.jsonl$/iu, '').trim();
        if (!chatId) return null;
        if (context.groupId !== null && context.groupId !== undefined) {
            return { kind: 'group', id: chatId, groupId: String(context.groupId) };
        }
        const character = context.characters?.[context.characterId] ?? null;
        const avatar = String(character?.avatar ?? '').trim();
        if (!avatar) return null;
        return {
            kind: 'character',
            fileName: chatId,
            avatarUrl: avatar,
            chName: String(character?.name ?? context.name2 ?? ''),
            characterId: String(context.characterId ?? ''),
        };
    }
    transactionMetadataState() {
        const root = this.chatNamespace();
        const pick = (key) => Object.prototype.hasOwnProperty.call(root, key)
            ? { present: true, value: structuredClone(root[key]) }
            : { present: false, value: null };
        return {
            commitReceipts: pick('commitReceipts'),
            turnRollbackSnapshots: pick('turnRollbackSnapshots'),
            cursor: pick('cursor'),
        };
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
            modelProfileId: settings.modelProfileId,
            responseTokens: settings.responseTokens,
            requestTimeoutMs: settings.requestTimeoutMs,
            autoAudit: settings.autoAudit,
            autoExtraction: settings.autoExtraction,
            autoSmallSummary: settings.autoSmallSummary,
            auditPrompt: settings.auditPrompt,
            revisionPrompt: settings.revisionPrompt,
            extractionPrompt: settings.extractionPrompt,
            smallSummaryPrompt: settings.smallSummaryPrompt,
            largeSummaryPrompt: settings.largeSummaryPrompt,
            keywordDefinitions: settings.keywordDefinitions,
            sectionPolicies: settings.sectionPolicies,
            connectionState: this.connectionStateSignature(settings),
        }));
    }
    connectionStateSignature(settings) {
        const context = this.context();
        const ids = (0, util_1.unique)([
            settings.modelProfileId,
            settings.modelProfileId,
            settings.modelProfileId,
            settings.modelProfileId,
            settings.modelProfileId,
            settings.modelProfileId,
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
            chatLocator: this.chatLocator(),
            transactionMetadataBefore: this.transactionMetadataState(),
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
            chatLocator: this.chatLocator(),
            transactionMetadataBefore: this.transactionMetadataState(),
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
            await this.verifyPersistedAssistantReplacement(snapshot.messageIndex, nextText, swipeIndex);
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
                await this.verifyPersistedAssistantOriginal(snapshot.messageIndex, originalText, swipeIndex, originalSwipe, hadDisplayText, originalDisplayText);
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
    async verifyPersistedAssistantReplacement(messageIndex, expectedText, swipeIndex = -1) {
        const chatData = await this.readPersistedChatByLocator(this.chatLocator());
        if (chatData === null) return false;
        const persisted = chatData?.[Number(messageIndex) + 1];
        if (!persisted || String(persisted.mes ?? '') !== expectedText)
            throw new Error('聊天正文保存后权威回读未找到修正版');
        if (swipeIndex >= 0 && String(persisted.swipes?.[swipeIndex] ?? '') !== expectedText)
            throw new Error('当前 swipe 保存后权威回读未找到修正版');
        if (persisted.extra && Object.prototype.hasOwnProperty.call(persisted.extra, 'display_text'))
            throw new Error('聊天文件中旧 display_text 仍存在，可能遮挡修正版正文');
        return true;
    }
    async verifyPersistedAssistantOriginal(messageIndex, expectedText, swipeIndex, expectedSwipe, hadDisplayText, expectedDisplayText) {
        const chatData = await this.readPersistedChatByLocator(this.chatLocator());
        if (chatData === null) return false;
        const persisted = chatData?.[Number(messageIndex) + 1];
        if (!persisted || String(persisted.mes ?? '') !== expectedText)
            throw new Error('原正文反向保存后权威回读不一致');
        if (swipeIndex >= 0 && String(persisted.swipes?.[swipeIndex] ?? '') !== String(expectedSwipe ?? ''))
            throw new Error('原 swipe 反向保存后权威回读不一致');
        const hasDisplay = Boolean(persisted.extra && Object.prototype.hasOwnProperty.call(persisted.extra, 'display_text'));
        if (hasDisplay !== Boolean(hadDisplayText)) throw new Error('原 display_text 反向保存后权威回读不一致');
        if (hadDisplayText && JSON.stringify(persisted.extra.display_text) !== JSON.stringify(expectedDisplayText))
            throw new Error('原 display_text 内容反向保存后权威回读不一致');
        return true;
    }
    // [MA-LARGE-GROUP-BASELINE] 当前运行结构只认 runtimeStateVersion 4：场景小总结组直接归入一个当前大组集；
    // 大组集保存当前基础设定、玩家手动维护的基石锁记录，以及已完成小总结的组集；自动大总结只读取基础设定与小总结组。旧运行结构不做兼容推断。
    uidRuntimeStateReady() {
        return Number(this.chatNamespace()?.cursor?.runtimeStateVersion || 0) === 4 && this.chatNamespace()?.cursor?.oneTimeBaselineMigrationCompleted === true;
    }
    // 一次性建立新运行基线：当前世界书 UID 是事实起点；基础设定与玩家手动维护的基石锁记录进入当前大组集，
    // 不推断旧 S/L，不修改任何世界书条目。
    async initializeUidRuntimeState(baselineEntries, snapshot, currentSettings) {
        if (snapshot) this.assertSnapshot(snapshot, currentSettings);
        const root = this.chatNamespace();
        if (Number(root?.cursor?.runtimeStateVersion || 0) === 4 && root?.cursor?.oneTimeBaselineMigrationCompleted === true) return false;
        const previous = {
            cursor: Object.prototype.hasOwnProperty.call(root, 'cursor') ? structuredClone(root.cursor) : undefined,
            commitReceipts: Object.prototype.hasOwnProperty.call(root, 'commitReceipts') ? structuredClone(root.commitReceipts) : undefined,
            turnRollbackSnapshots: Object.prototype.hasOwnProperty.call(root, 'turnRollbackSnapshots') ? structuredClone(root.turnRollbackSnapshots) : undefined,
        };
        const sourceEntries = (Array.isArray(baselineEntries) ? baselineEntries : []).filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
        const uids = [...new Set(sourceEntries.map((entry) => String(entry?.uid ?? '').trim()).filter(Boolean))];
        const bedrockMap = new Map();
        const foundationMap = new Map();
        for (const entry of sourceEntries) {
            const uid = String(entry?.uid ?? '').trim();
            if (!uid) continue;
            if (entry.bedrockLocked === true || entry.locked === true) {
                bedrockMap.set(uid, structuredClone(entry));
                continue;
            }
            if (String(entry.type ?? '').trim() === '基础设定') foundationMap.set(uid, structuredClone(entry));
        }
        const capturedAt = Date.now();
        // [MA-ONE-TIME-BASELINE] 升级迁移只执行一次：旧世界书 UID 只是事实基线；当前聊天最后一个明确“地点：”只负责建立空的当前场景组起点。
        // 不把旧 UID 塞进当前场景组，也不推断旧 S/L。完成后由 oneTimeBaselineMigrationCompleted 永久跳过后续启动初始化。
        const chat = this.context()?.chat ?? [];
        let currentSceneName = '';
        let currentSceneMessageKey = '';
        for (let index = chat.length - 1; index >= 0; index -= 1) {
            const message = chat[index];
            if (!isAssistant(message)) continue;
            const sceneName = (0, util_1.extractLatestSceneLocation)(String(message?.mes ?? ''));
            if (!sceneName) continue;
            currentSceneName = sceneName;
            currentSceneMessageKey = readMessageKey(message);
            break;
        }
        const currentSceneGroup = currentSceneName ? (0, util_1.normalizeSceneLocation)(currentSceneName) : '';
        const initialSceneUid = currentSceneGroup || currentSceneName
            ? `SG-${(0, util_1.hashText)(`${this.chatKey()}|baseline|${currentSceneGroup || currentSceneName}`).slice(0, 10)}`
            : '';
        const initialSceneTimeline = initialSceneUid ? {
            id: initialSceneUid,
            groupUid: initialSceneUid,
            sceneGroup: currentSceneGroup,
            sceneTitle: `场景｜${currentSceneName}`,
            memberUids: [],
            summaryStatus: 'active',
            openedAtMessageKey: currentSceneMessageKey,
            closedAtMessageKey: '',
        } : null;
        root.cursor = {
            runtimeStateVersion: 4,
            oneTimeBaselineMigrationCompleted: true,
            baselineUids: uids,
            baselineCapturedAt: capturedAt,
            lastProcessedMessageKey: '',
            lastProcessedHash: '',
            lastExtractionUids: [],
            failedLargeSummaryGroupUids: [],
            activeEventTimeline: initialSceneTimeline,
            closedEventTimelines: [],
            activeLargeSummaryGroup: {
                id: `LG-${capturedAt.toString(36)}`,
                groupUid: `LG-${capturedAt.toString(36)}`,
                foundationUids: [...foundationMap.keys()],
                bedrockUids: [...bedrockMap.keys()],
                sceneGroups: [],
                openedAt: capturedAt,
            },
            smallSummarySceneCounter: 0,
        };
        delete root.commitReceipts;
        delete root.turnRollbackSnapshots;
        await this.persistMetadataMutation(() => {
            if (previous.cursor !== undefined) root.cursor = previous.cursor; else delete root.cursor;
            if (previous.commitReceipts !== undefined) root.commitReceipts = previous.commitReceipts; else delete root.commitReceipts;
            if (previous.turnRollbackSnapshots !== undefined) root.turnRollbackSnapshots = previous.turnRollbackSnapshots; else delete root.turnRollbackSnapshots;
        }, () => { if (snapshot) this.assertSnapshot(snapshot, currentSettings); }, 'UID运行基线初始化', ['cursor', 'commitReceipts', 'turnRollbackSnapshots']);
        return true;
    }
    // [MA-REBUILD-BASELINE] 这是玩家显式整本重建后的新起点，不是升级迁移；可显式再次执行，但不会重新触发一次性升级迁移。
    async resetUidRuntimeStateAfterRebuild(baselineEntries, snapshot, currentSettings) {
        if (snapshot) this.assertSnapshot(snapshot, currentSettings);
        const root = this.chatNamespace();
        const previous = {
            cursor: Object.prototype.hasOwnProperty.call(root, 'cursor') ? structuredClone(root.cursor) : undefined,
            commitReceipts: Object.prototype.hasOwnProperty.call(root, 'commitReceipts') ? structuredClone(root.commitReceipts) : undefined,
            turnRollbackSnapshots: Object.prototype.hasOwnProperty.call(root, 'turnRollbackSnapshots') ? structuredClone(root.turnRollbackSnapshots) : undefined,
        };
        const sourceEntries = (Array.isArray(baselineEntries) ? baselineEntries : []).filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
        const uids = [...new Set(sourceEntries.map((entry) => String(entry?.uid ?? '').trim()).filter(Boolean))];
        const foundationEntries = sourceEntries.filter((entry) => String(entry?.type ?? '').trim() === '基础设定').map((entry) => structuredClone(entry));
        const bedrockEntries = sourceEntries.filter((entry) => entry?.bedrockLocked === true || entry?.locked === true).map((entry) => structuredClone(entry));
        const chat = this.context()?.chat ?? [];
        let currentSceneName = '';
        let currentSceneMessageKey = '';
        for (let index = chat.length - 1; index >= 0; index -= 1) {
            const message = chat[index];
            if (!isAssistant(message)) continue;
            const sceneName = (0, util_1.extractLatestSceneLocation)(String(message?.mes ?? ''));
            if (!sceneName) continue;
            currentSceneName = sceneName;
            currentSceneMessageKey = readMessageKey(message);
            break;
        }
        const currentSceneGroup = currentSceneName ? (0, util_1.normalizeSceneLocation)(currentSceneName) : '';
        const capturedAt = Date.now();
        const sceneUid = currentSceneGroup || currentSceneName
            ? `SG-${(0, util_1.hashText)(`${this.chatKey()}|rebuild|${currentSceneGroup || currentSceneName}|${capturedAt}`).slice(0, 10)}`
            : '';
        root.cursor = {
            runtimeStateVersion: 4,
            oneTimeBaselineMigrationCompleted: true,
            baselineUids: uids,
            baselineCapturedAt: capturedAt,
            lastProcessedMessageKey: '',
            lastProcessedHash: '',
            lastExtractionUids: [],
            failedLargeSummaryGroupUids: [],
            activeEventTimeline: sceneUid ? {
                id: sceneUid, groupUid: sceneUid, sceneGroup: currentSceneGroup, sceneTitle: `场景｜${currentSceneName}`,
                memberUids: [], summaryStatus: 'active', openedAtMessageKey: currentSceneMessageKey, closedAtMessageKey: '',
            } : null,
            closedEventTimelines: [],
            activeLargeSummaryGroup: {
                id: `LG-${capturedAt.toString(36)}`, groupUid: `LG-${capturedAt.toString(36)}`,
                foundationUids: foundationEntries.map((entry) => String(entry.uid)), bedrockUids: bedrockEntries.map((entry) => String(entry.uid)), sceneGroups: [], openedAt: capturedAt,
            },
            smallSummarySceneCounter: 0,
        };
        delete root.commitReceipts;
        delete root.turnRollbackSnapshots;
        await this.persistMetadataMutation(() => {
            if (previous.cursor !== undefined) root.cursor = previous.cursor; else delete root.cursor;
            if (previous.commitReceipts !== undefined) root.commitReceipts = previous.commitReceipts; else delete root.commitReceipts;
            if (previous.turnRollbackSnapshots !== undefined) root.turnRollbackSnapshots = previous.turnRollbackSnapshots; else delete root.turnRollbackSnapshots;
        }, () => { if (snapshot) this.assertSnapshot(snapshot, currentSettings); }, '整本重建运行基线重置', ['cursor', 'commitReceipts', 'turnRollbackSnapshots']);
        return true;
    }
    cursor() {
        const root = this.chatNamespace();
        const value = root.cursor && typeof root.cursor === 'object' && !Array.isArray(root.cursor) ? root.cursor : {};
        // 旧运行结构不再兼容。没有 runtimeStateVersion 4 的一次性迁移完成标记时，只返回空的新结构；启动初始化负责从当前世界书建立事实基线。
        if (Number(value.runtimeStateVersion || 0) !== 4 || value.oneTimeBaselineMigrationCompleted !== true) {
            return {
                runtimeStateVersion: 4,
                oneTimeBaselineMigrationCompleted: false,
                baselineUids: [],
                baselineCapturedAt: 0,
                lastProcessedMessageKey: '',
                lastProcessedHash: '',
                lastExtractionUids: [],
                failedLargeSummaryGroupUids: [],
                activeEventTimeline: null,
                closedEventTimelines: [],
                activeLargeSummaryGroup: {
                    id: '',
                    groupUid: '',
                    foundationUids: [],
                    bedrockUids: [],
                    sceneGroups: [],
                    openedAt: 0,
                },
                smallSummarySceneCounter: 0,
            };
        }
        const normalizeTimeline = (raw, defaultStatus = 'pending') => {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
            const memberUids = [...new Set((Array.isArray(raw.memberUids) ? raw.memberUids : [])
                .map((uid) => String(uid ?? '').trim()).filter(Boolean))];
            const sceneGroup = String(raw.sceneGroup ?? '').trim();
            const sceneTitle = String(raw.sceneTitle ?? '').trim();
            const groupUid = String(raw.groupUid ?? raw.id ?? '').trim();
            if (!groupUid && !sceneGroup && !sceneTitle && !memberUids.length) return null;
            const rawStatus = String(raw.summaryStatus ?? '').trim();
            const summaryStatus = /^(?:active|pending|failed)$/u.test(rawStatus) ? rawStatus : defaultStatus;
            return {
                id: groupUid,
                groupUid,
                sceneGroup,
                sceneTitle,
                memberUids,
                summaryStatus,
                openedAtMessageKey: String(raw.openedAtMessageKey ?? ''),
                closedAtMessageKey: String(raw.closedAtMessageKey ?? ''),
                failedAt: Math.max(0, Number(raw.failedAt || 0)),
                summaryError: String(raw.summaryError ?? '').trim().slice(0, 800),
            };
        };
        const activeEventTimeline = normalizeTimeline(value.activeEventTimeline, 'active');
        const closedEventTimelines = (Array.isArray(value.closedEventTimelines) ? value.closedEventTimelines : [])
            .map((item) => normalizeTimeline(item, 'pending')).filter(Boolean);
        const rawLarge = value.activeLargeSummaryGroup && typeof value.activeLargeSummaryGroup === 'object' && !Array.isArray(value.activeLargeSummaryGroup)
            ? value.activeLargeSummaryGroup : {};
        const largeId = String(rawLarge.groupUid ?? rawLarge.id ?? '').trim() || `LG-${Math.max(0, Number(value.baselineCapturedAt || 0)).toString(36)}`;
        const sceneGroups = (Array.isArray(rawLarge.sceneGroups) ? rawLarge.sceneGroups : [])
            .map((item) => normalizeTimeline(item, 'pending')).filter((item) => item?.memberUids?.length);
        const bedrockUids = [...new Set((rawLarge.bedrockUids ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean))];
        const bedrockSet = new Set(bedrockUids);
        const foundationUids = [...new Set((rawLarge.foundationUids ?? []).map((uid) => String(uid ?? '').trim()).filter((uid) => uid && !bedrockSet.has(uid)))];
        const activeLargeSummaryGroup = {
            id: largeId,
            groupUid: largeId,
            foundationUids,
            bedrockUids,
            sceneGroups,
            openedAt: Math.max(0, Number(rawLarge.openedAt || value.baselineCapturedAt || 0)),
        };
        const failedLargeSummaryGroupUids = [...new Set((value.failedLargeSummaryGroupUids ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))];
        return {
            runtimeStateVersion: 4,
            oneTimeBaselineMigrationCompleted: true,
            baselineUids: [...new Set((value.baselineUids ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean))],
            baselineCapturedAt: Math.max(0, Number(value.baselineCapturedAt || 0)),
            lastProcessedMessageKey: String(value.lastProcessedMessageKey ?? ''),
            lastProcessedHash: String(value.lastProcessedHash ?? ''),
            lastExtractionUids: [...new Set((value.lastExtractionUids ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean))],
            failedLargeSummaryGroupUids,
            activeEventTimeline,
            closedEventTimelines,
            activeLargeSummaryGroup,
            smallSummarySceneCounter: sceneGroups.length,
        };
    }
    async saveCursor(cursor, snapshot, currentSettings) {
        if (snapshot) this.assertSnapshot(snapshot, currentSettings);
        const root = this.chatNamespace();
        const hadCursor = Object.prototype.hasOwnProperty.call(root, 'cursor');
        const previous = hadCursor ? structuredClone(root.cursor) : undefined;
        const canonicalCursor = structuredClone(cursor);
        canonicalCursor.runtimeStateVersion = 4;
        canonicalCursor.oneTimeBaselineMigrationCompleted = true;
        const rawLarge = canonicalCursor.activeLargeSummaryGroup && typeof canonicalCursor.activeLargeSummaryGroup === 'object' && !Array.isArray(canonicalCursor.activeLargeSummaryGroup)
            ? canonicalCursor.activeLargeSummaryGroup : {};
        rawLarge.sceneGroups = Array.isArray(rawLarge.sceneGroups) ? rawLarge.sceneGroups : [];
        rawLarge.foundationUids = Array.isArray(rawLarge.foundationUids) ? rawLarge.foundationUids : [];
        rawLarge.bedrockUids = Array.isArray(rawLarge.bedrockUids) ? rawLarge.bedrockUids : [];
        canonicalCursor.activeLargeSummaryGroup = rawLarge;
        canonicalCursor.smallSummarySceneCounter = rawLarge.sceneGroups.length;
        root.cursor = canonicalCursor;
        await this.persistMetadataMutation(() => {
            if (hadCursor) root.cursor = previous;
            else delete root.cursor;
        }, () => { if (snapshot) this.assertSnapshot(snapshot, currentSettings); }, '处理游标保存', ['cursor']);
    }
    getCommitReceipts() {
        const receipts = this.chatNamespace().commitReceipts;
        return Array.isArray(receipts) ? structuredClone(receipts) : [];
    }

    // [MA-TURN-UID-ROLLBACK] 历史撤回只保存最近 20 个真实剧情回合的 UID 前态；不保存整本世界书快照。
    // 同一回合内提取/小总结/大总结多次触及同一 UID 时，回滚只需要该 UID 在本回合第一次修改前的内容。
    turnRollbackKey(receipt) {
        const assistantIndex = Number(receipt?.messageIndex);
        const playerIndex = Number(receipt?.playerMessageIndex);
        const sourceMessageKey = String(receipt?.sourceMessageKey ?? '').trim();
        if (!Number.isInteger(assistantIndex) || assistantIndex < 0) return '';
        return sourceMessageKey ? `message:${sourceMessageKey}` : `index:${assistantIndex}|player:${Number.isInteger(playerIndex) ? playerIndex : -1}`;
    }
    turnRollbackChanges(snapshot) {
        const byUid = new Map();
        const contributions = Array.isArray(snapshot?.contributions) ? snapshot.contributions : [];
        for (const contribution of contributions) {
            for (const change of contribution?.changes ?? []) {
                const uid = String(change?.uid ?? '');
                if (!uid) continue;
                if (!byUid.has(uid)) byUid.set(uid, structuredClone(change));
            }
        }
        return [...byUid.values()];
    }
    getTurnRollbackSnapshots() {
        const root = this.chatNamespace();
        // [MA-UID-BASELINE-06] 回滚历史只认本版本之后真实建立的回合 UID 快照；不再从旧 commitReceipts 推导兼容历史。
        const stored = Array.isArray(root.turnRollbackSnapshots) ? structuredClone(root.turnRollbackSnapshots) : [];
        return stored.slice(-20).map((snapshot) => ({
            ...structuredClone(snapshot),
            changes: this.turnRollbackChanges(snapshot),
            receiptIds: [...new Set((snapshot.contributions ?? []).map((item) => String(item?.receiptId ?? '')).filter(Boolean))],
        }));
    }
    // [MA-ENTRY-UPDATED-BADGE] 返回最近一次已经完整处理完的剧情回合实际改动过的 UID。
    // cursor 决定“最近完成回合”；如果该回合没有产生 UID 快照，则返回空数组，避免上一回合标记残留。
    getLatestProcessedTurnUpdatedUids() {
        const root = this.chatNamespace();
        const processedKey = String(root?.cursor?.lastProcessedMessageKey ?? '').trim();
        if (!processedKey) return [];
        const snapshots = this.getTurnRollbackSnapshots();
        const turn = [...snapshots].reverse().find((item) => String(item?.sourceMessageKey ?? '').trim() === processedKey);
        if (!turn) return [];
        return [...new Set((turn.changes ?? []).map((change) => String(change?.uid ?? '').trim()).filter(Boolean))];
    }
    async appendTurnRollbackSnapshot(receipt, limit = 20) {
        const turnKey = this.turnRollbackKey(receipt);
        if (!turnKey || !Array.isArray(receipt?.changes) || !receipt.changes.length) return false;
        const root = this.chatNamespace();
        const previousSnapshots = Array.isArray(root.turnRollbackSnapshots) ? structuredClone(root.turnRollbackSnapshots) : [];
        const previousReceipts = Array.isArray(root.commitReceipts) ? structuredClone(root.commitReceipts) : [];
        const snapshots = previousSnapshots.length ? structuredClone(previousSnapshots) : this.getTurnRollbackSnapshots().map((item) => {
            const copy = structuredClone(item);
            delete copy.changes;
            delete copy.receiptIds;
            return copy;
        });
        let turn = snapshots.find((item) => item.turnKey === turnKey);
        if (!turn) {
            turn = {
                id: `turn:${turnKey}`,
                turnKey,
                sourceMessageKey: String(receipt.sourceMessageKey ?? ''),
                messageIndex: Number(receipt.messageIndex),
                playerMessageIndex: Number(receipt.playerMessageIndex),
                worldbookName: String(receipt.worldbookName ?? ''),
                createdAt: Number(receipt.createdAt) || Date.now(),
                stateBefore: receipt?.stateBefore ? structuredClone(receipt.stateBefore) : null,
                contributions: [],
            };
            snapshots.push(turn);
        }
        turn.stateBefore ||= receipt?.stateBefore ? structuredClone(receipt.stateBefore) : null;
        turn.worldbookName ||= String(receipt.worldbookName ?? '');
        turn.sourceMessageKey ||= String(receipt.sourceMessageKey ?? '');
        turn.messageIndex = Number.isInteger(Number(turn.messageIndex)) ? Number(turn.messageIndex) : Number(receipt.messageIndex);
        turn.playerMessageIndex = Number.isInteger(Number(turn.playerMessageIndex)) ? Number(turn.playerMessageIndex) : Number(receipt.playerMessageIndex);
        turn.contributions ??= [];
        const receiptId = String(receipt.id ?? '');
        const contribution = {
            receiptId,
            createdAt: Number(receipt.createdAt) || Date.now(),
            changes: structuredClone(receipt.changes),
        };
        const oldContribution = turn.contributions.findIndex((item) => String(item?.receiptId ?? '') === receiptId && receiptId);
        if (oldContribution >= 0) turn.contributions[oldContribution] = contribution;
        else turn.contributions.push(contribution);
        turn.updatedAt = Date.now();
        const numericLimit = Math.max(1, Number(limit) || 20);
        const next = snapshots.slice(-numericLimit);
        root.turnRollbackSnapshots = next;
        // commitReceipts 只保留这 20 个回合对应的内部提交，避免旧回执无限增长；手动维护回执不进入回合历史。
        const allowedTurnKeys = new Set(next.map((item) => String(item.turnKey ?? '')).filter(Boolean));
        const prunedReceipts = previousReceipts.filter((item) => {
            const key = this.turnRollbackKey(item);
            return !key || allowedTurnKeys.has(key);
        });
        root.commitReceipts = prunedReceipts;
        await this.persistMetadataMutation(() => {
            if (previousSnapshots.length) root.turnRollbackSnapshots = previousSnapshots;
            else delete root.turnRollbackSnapshots;
            if (previousReceipts.length) root.commitReceipts = previousReceipts;
            else delete root.commitReceipts;
        }, null, '20回合UID快照保存', ['turnRollbackSnapshots', 'commitReceipts']);
        return true;
    }
    async removeTurnRollbackContributions(receiptIds = []) {
        const targets = new Set((Array.isArray(receiptIds) ? receiptIds : [receiptIds]).map((value) => String(value ?? '')).filter(Boolean));
        if (!targets.size) return false;
        const root = this.chatNamespace();
        const previous = Array.isArray(root.turnRollbackSnapshots) ? structuredClone(root.turnRollbackSnapshots) : [];
        if (!previous.length) return false;
        const next = previous.map((snapshot) => ({
            ...snapshot,
            contributions: (snapshot.contributions ?? []).filter((item) => !targets.has(String(item?.receiptId ?? ''))),
        })).filter((snapshot) => (snapshot.contributions ?? []).length);
        if (JSON.stringify(next) === JSON.stringify(previous)) return false;
        if (next.length) root.turnRollbackSnapshots = next;
        else delete root.turnRollbackSnapshots;
        await this.persistMetadataMutation(() => {
            if (previous.length) root.turnRollbackSnapshots = previous;
            else delete root.turnRollbackSnapshots;
        }, null, '回合UID快照贡献清理', ['turnRollbackSnapshots']);
        return true;
    }
    async removeTurnRollbackSnapshots(ids = []) {
        const targets = new Set((Array.isArray(ids) ? ids : [ids]).map((value) => String(value ?? '')).filter(Boolean));
        if (!targets.size) return false;
        const root = this.chatNamespace();
        const previous = Array.isArray(root.turnRollbackSnapshots) ? structuredClone(root.turnRollbackSnapshots) : [];
        if (!previous.length) return false;
        const next = previous.filter((item) => !targets.has(String(item?.id ?? '')));
        if (next.length === previous.length) return false;
        if (next.length) root.turnRollbackSnapshots = next;
        else delete root.turnRollbackSnapshots;
        await this.persistMetadataMutation(() => {
            if (previous.length) root.turnRollbackSnapshots = previous;
            else delete root.turnRollbackSnapshots;
        }, null, '回合UID快照删除', ['turnRollbackSnapshots']);
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
        }, null, '写入回执保存', ['commitReceipts']);
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
        }, null, '写入回执删除', ['commitReceipts']);
        return true;
    }
    // [MA-ROLLBACK-FAST] 源对话回滚后的 cursor / commitReceipts / turnRollbackSnapshots 一次性保存，避免三次元数据 I/O。
    async applySourceRollbackMetadata(restoredCursor, receiptIds = [], rollbackSnapshotIds = [], snapshot = null, currentSettings = null) {
        const root = this.chatNamespace();
        const previous = {
            cursor: Object.prototype.hasOwnProperty.call(root, 'cursor') ? structuredClone(root.cursor) : undefined,
            commitReceipts: Object.prototype.hasOwnProperty.call(root, 'commitReceipts') ? structuredClone(root.commitReceipts) : undefined,
            turnRollbackSnapshots: Object.prototype.hasOwnProperty.call(root, 'turnRollbackSnapshots') ? structuredClone(root.turnRollbackSnapshots) : undefined,
        };
        const receiptSet = new Set((receiptIds ?? []).map((value) => String(value ?? '')).filter(Boolean));
        const snapshotSet = new Set((rollbackSnapshotIds ?? []).map((value) => String(value ?? '')).filter(Boolean));
        root.cursor = structuredClone(restoredCursor ?? this.cursor());
        root.cursor.runtimeStateVersion = 4;
        root.cursor.oneTimeBaselineMigrationCompleted = true;
        const receipts = (Array.isArray(root.commitReceipts) ? root.commitReceipts : [])
            .filter((item) => !receiptSet.has(String(item?.id ?? '')));
        if (receipts.length) root.commitReceipts = receipts; else delete root.commitReceipts;
        const snapshots = (Array.isArray(root.turnRollbackSnapshots) ? root.turnRollbackSnapshots : [])
            .filter((item) => !snapshotSet.has(String(item?.id ?? '')));
        if (snapshots.length) root.turnRollbackSnapshots = snapshots; else delete root.turnRollbackSnapshots;
        await this.persistMetadataMutation(() => {
            if (previous.cursor !== undefined) root.cursor = previous.cursor; else delete root.cursor;
            if (previous.commitReceipts !== undefined) root.commitReceipts = previous.commitReceipts; else delete root.commitReceipts;
            if (previous.turnRollbackSnapshots !== undefined) root.turnRollbackSnapshots = previous.turnRollbackSnapshots; else delete root.turnRollbackSnapshots;
        }, () => { if (snapshot) this.assertSnapshot(snapshot, currentSettings); }, '源对话回滚元数据提交', ['cursor', 'commitReceipts', 'turnRollbackSnapshots']);
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
        }, null, '焦点 UID 保存', ['focusUid', 'focusTitle']);
    }
    async saveMetadata() {
        const context = this.context();
        if (typeof context.saveMetadata !== 'function') throw new Error('SillyTavern 未提供聊天元数据保存接口 saveMetadata');
        await context.saveMetadata();
    }
    async readPersistedChatByLocator(locator) {
        const context = this.context();
        if (!locator || typeof globalThis.fetch !== 'function' || typeof context.getRequestHeaders !== 'function') return null;
        const endpoint = locator.kind === 'group' ? '/api/chats/group/get' : '/api/chats/get';
        const body = locator.kind === 'group'
            ? { id: locator.id }
            : { ch_name: locator.chName, file_name: locator.fileName, avatar_url: locator.avatarUrl };
        const response = await globalThis.fetch(endpoint, {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify(body),
            cache: 'no-cache',
        });
        if (!response?.ok) throw new Error(`聊天权威回读失败：HTTP ${response?.status ?? 'unknown'}`);
        const data = await response.json();
        if (!Array.isArray(data) || !data.length) throw new Error('聊天权威回读为空');
        return data;
    }
    async savePersistedChatByLocator(locator, chatData) {
        const context = this.context();
        if (!locator || typeof globalThis.fetch !== 'function' || typeof context.getRequestHeaders !== 'function')
            throw new Error('SillyTavern 未提供脱离当前聊天的持久化接口');
        const endpoint = locator.kind === 'group' ? '/api/chats/group/save' : '/api/chats/save';
        const body = locator.kind === 'group'
            ? { id: locator.id, chat: chatData }
            : { ch_name: locator.chName, file_name: locator.fileName, avatar_url: locator.avatarUrl, chat: chatData };
        const response = await globalThis.fetch(endpoint, {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify(body),
            cache: 'no-cache',
        });
        if (!response?.ok) throw new Error(`聊天脱离当前作用域保存失败：HTTP ${response?.status ?? 'unknown'}`);
        return true;
    }
    async readPersistedChatMetadata() {
        const data = await this.readPersistedChatByLocator(this.chatLocator());
        if (data === null) return null;
        const header = data[0] && typeof data[0] === 'object' ? data[0] : {};
        return header.chat_metadata && typeof header.chat_metadata === 'object' ? header.chat_metadata : {};
    }
    async restoreTransactionMetadataForSnapshot(snapshot) {
        const locator = snapshot?.chatLocator;
        const before = snapshot?.transactionMetadataBefore;
        if (!locator || !before) throw new Error('原聊天事务元数据快照不足，无法跨聊天恢复');
        const chatData = await this.readPersistedChatByLocator(locator);
        if (!Array.isArray(chatData) || !chatData.length) throw new Error('原聊天不存在，无法恢复事务元数据');
        const header = chatData[0] && typeof chatData[0] === 'object' ? chatData[0] : (chatData[0] = {});
        const metadata = header.chat_metadata && typeof header.chat_metadata === 'object' ? header.chat_metadata : (header.chat_metadata = {});
        const root = metadata[constants_1.EXTENSION_NAMESPACE] && typeof metadata[constants_1.EXTENSION_NAMESPACE] === 'object'
            ? structuredClone(metadata[constants_1.EXTENSION_NAMESPACE])
            : {};
        const restoreField = (key, state) => {
            if (state?.present) root[key] = structuredClone(state.value);
            else delete root[key];
        };
        restoreField('commitReceipts', before.commitReceipts);
        restoreField('turnRollbackSnapshots', before.turnRollbackSnapshots);
        restoreField('cursor', before.cursor);
        if (Object.keys(root).length) metadata[constants_1.EXTENSION_NAMESPACE] = root;
        else delete metadata[constants_1.EXTENSION_NAMESPACE];
        await this.savePersistedChatByLocator(locator, chatData);
        const verified = await this.readPersistedChatByLocator(locator);
        const verifiedMeta = verified?.[0]?.chat_metadata ?? {};
        const actual = verifiedMeta?.[constants_1.EXTENSION_NAMESPACE] ?? null;
        const expected = metadata?.[constants_1.EXTENSION_NAMESPACE] ?? null;
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('原聊天事务元数据恢复后权威回读不一致');
        return true;
    }
    async verifyPersistedExtensionNamespace(expectedNamespace, persistedFields = null, softMismatch = false) {
        const persisted = await this.readPersistedChatMetadata();
        // 某些宿主/临时聊天没有可用的权威回读接口；保持与旧行为一致，此时只能依赖 ST 自身 saveMetadata。
        if (persisted === null) return null;
        const actual = persisted?.[constants_1.EXTENSION_NAMESPACE];
        const expected = expectedNamespace && typeof expectedNamespace === 'object' ? expectedNamespace : undefined;
        const normalizeNamespace = (value) => value && typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length
            ? null
            : (value === undefined ? null : value);
        const fieldState = (namespace, key) => {
            const source = namespace && typeof namespace === 'object' && !Array.isArray(namespace) ? namespace : {};
            return Object.prototype.hasOwnProperty.call(source, key)
                ? { present: true, value: source[key] }
                : { present: false };
        };
        const fields = Array.isArray(persistedFields) && persistedFields.length ? [...new Set(persistedFields.map(String))] : null;
        const actualComparable = fields ? fields.map((key) => [key, fieldState(actual, key)]) : normalizeNamespace(actual);
        const expectedComparable = fields ? fields.map((key) => [key, fieldState(expected, key)]) : normalizeNamespace(expected);
        const actualText = JSON.stringify(actualComparable);
        const expectedText = JSON.stringify(expectedComparable);
        if (actualText !== expectedText) {
            if (softMismatch) return false;
            throw new Error(fields
                ? `聊天元数据保存后字段权威回读不一致：${fields.join(', ')}`
                : '聊天元数据保存后权威回读不一致');
        }
        return true;
    }
    async persistMetadataMutation(rollback, verify, label, persistedFields = null) {
        const expectedChatKey = this.chatKey();
        const expectedMetadata = this.context().chatMetadata;
        const ensureSameScope = () => {
            if (this.chatKey() !== expectedChatKey || this.context().chatMetadata !== expectedMetadata)
                throw new Error('元数据保存期间聊天作用域已经变化');
        };
        const persistAndConfirm = async (expectedNamespace, phaseLabel) => {
            const attempts = 3;
            for (let attempt = 1; attempt <= attempts; attempt++) {
                ensureSameScope();
                await this.saveMetadata();
                ensureSameScope();
                verify?.();
                const confirmed = await this.verifyPersistedExtensionNamespace(expectedNamespace, persistedFields, true);
                // null 表示宿主无法权威回读；沿用 ST 自身保存契约，不额外制造失败。
                if (confirmed !== false) return true;
                if (attempt < attempts)
                    await new Promise((resolve) => globalThis.setTimeout(resolve, 100 * attempt));
            }
            const detail = Array.isArray(persistedFields) && persistedFields.length
                ? `字段 ${persistedFields.join(', ')}`
                : '镜渊元数据命名空间';
            throw new Error(`${phaseLabel}后${detail}连续${attempts}次未通过权威回读确认`);
        };
        const expectedNamespace = structuredClone(expectedMetadata?.[constants_1.EXTENSION_NAMESPACE] ?? null);
        try {
            await persistAndConfirm(expectedNamespace, label);
        }
        catch (error) {
            try { rollback?.(); }
            catch (rollbackMutationError) {
                throw new Error(`${label}失败，且内存回滚失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackMutationError)}`);
            }
            try {
                ensureSameScope();
                const rollbackNamespace = structuredClone(expectedMetadata?.[constants_1.EXTENSION_NAMESPACE] ?? null);
                await persistAndConfirm(rollbackNamespace, `${label}回滚保存`);
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
/**
 * Mirror Abyss — index
 *
 * 职责：扩展生命周期钩子导出。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
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
        summarizeEntries: async (kind, uids) => (await requireApplication()).summarizeEntries(kind, uids),
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
        await application.initializeUidRuntimeState();
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
/**
 * Mirror Abyss — matcher
 *
 * 职责：条目身份的确定性匹配。
 *
 * 当前规则：
 * - UID 命中即为原条目；
 * - 否则只按稳定标题（原始/规范化完整标题）命中；
 * - 标题未命中即新建；
 * - 不根据正文、身份字段、事件生命周期、场景相似度、别名或称谓猜测“其实是同一条目”。
 */
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEntryIndex = buildEntryIndex;
exports.matchBlock = matchBlock;
exports.selectBestCandidate = selectBestCandidate;
exports.relevantEntries = relevantEntries;
exports.isProvisionalName = isProvisionalName;
const util_1 = require("./util");

const DEFAULT_SCORES = Object.freeze({
    uid: 100,
    exactTitle: 95,
    normalizedTitle: 90,
});

function buildEntryIndex(entries) {
    const byUid = new Map();
    const byExactTitle = new Map();
    const byTitle = new Map();
    for (const entry of entries) {
        byUid.set(String(entry.uid), entry);
        add(byExactTitle, String(entry.title ?? ''), entry);
        add(byTitle, normalizeTitleLookup(entry.title), entry);
    }
    return { entries, byUid, byExactTitle, byTitle };
}

function matchBlock(block, index, _contextText, weights = {}) {
    const scores = { ...DEFAULT_SCORES, ...weights };
    const collected = [];
    if (block.uid) {
        const entry = index.byUid.get(String(block.uid));
        if (entry) collected.push(candidate(entry, scores.uid, 'uid', `UID ${block.uid} 精确命中`));
    }
    collected.push(...candidates(index.byExactTitle.get(String(block.title ?? '')) ?? [], scores.exactTitle, 'exact-title', '标题完全相同'));
    collected.push(...candidates(index.byTitle.get(normalizeTitleLookup(block.title)) ?? [], scores.normalizedTitle, 'normalized-title', '规范化完整标题相同'));

    const byUid = new Map();
    for (const item of collected) {
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
    // 稳定标题原则上应唯一；若旧数据已有重复标题，只做确定性主档选择，不再进行语义消歧。
    if (!top.every((item) => normalizeTitleLookup(item.entry.title) === normalizeTitleLookup(top[0].entry.title))) return null;
    const selected = [...top].sort((left, right) => compareEntryPriority(left.entry, right.entry))[0];
    return {
        ...selected,
        evidence: [...selected.evidence, { kind: 'duplicate-primary', score: Number(topScore), detail: `发现${top.length}个同标题候选，确定性选择主档 UID ${selected.entry.uid}` }],
    };
}

// 仅供世界设定导入挑选少量上下文；不参与正常提取的 UID 身份匹配。
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
        return { entry, score };
    });
    const selected = scored
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || Number(b.entry.updatedAt || 0) - Number(a.entry.updatedAt || 0))
        .map((item) => item.entry);
    return [...new Map(selected.map((entry) => [entry.uid, entry])).values()].slice(0, limit);
}

function isProvisionalName(value) {
    const text = normalizeLookup(value);
    if (!text) return false;
    return /(?:身份未明|身份不明|未知身份|未识别|不明身份|陌生|神秘|匿名|未知)(?:的)?(?:人物|人|男人|女人|男子|女子|少年|少女|老人|孩子|来客|访客|账号|联系人|发信者|来电者|声音|身影)?/u.test(text)
        || /^(?:黑衣|蒙面|戴面具|兜帽|遮脸)(?:人|男人|女人|男子|女子|身影)$/u.test(text);
}

function candidates(entries, score, kind, detail) {
    return [...new Map(entries.map((entry) => [entry.uid, entry])).values()].map((entry) => candidate(entry, score, kind, detail));
}
function candidate(entry, score, kind, detail) {
    return { entry, score: Number(score), evidence: [{ kind, score: Number(score), detail }] };
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
function normalizeTitleLookup(value) { return (0, util_1.stripBatchTitleId)(String(value ?? '')).toLocaleLowerCase(); }
function normalizeLookup(value) { return (0, util_1.normalizeFact)(String(value ?? '')).replace(/[｜|]/gu, '').toLocaleLowerCase(); }
function add(map, key, entry) {
    if (!key) return;
    const list = map.get(key) ?? [];
    if (!list.some((candidate) => candidate.uid === entry.uid)) list.push(entry);
    map.set(key, list);
}

},"memory":function(module,exports,require){
/**
 * Mirror Abyss — memory
 *
 * 职责：MemoryRunner：提取结算、SceneGroup 时间线、小/大总结队列。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryRunner = void 0;
exports.reconcileCursorSceneUids = reconcileCursorSceneUids;
const matcher_1 = require("./matcher");
const operations_1 = require("./operations");
const parser_1 = require("./parser");
const prompts_1 = require("./prompts");
const semantic_1 = require("./semantic");
const governance_1 = require("./governance");
const model_request_1 = require("./model-request");
const util_1 = require("./util");
const information_point_1 = require("./domain/information-point");
const protocols_1 = require("./protocols");
function summaryNotify(kind, message) {
    const toast = globalThis.toastr?.[kind];
    if (typeof toast === 'function') toast(message);
    else console[kind === 'error' ? 'error' : 'info'](`[MirrorAbyss] ${message}`);
}
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
        // independently of model formatting variance. Real model fixed-fact output
        // is exercised by the separate extraction-protocol hard gate.
        const result = await this.extract(settings, snapshot, { deterministicOnly: true });
        this.setStatus(snapshot.chatKey, 'complete', '诊断提取与写入完成');
        return taskResultEntries(result);
    }
    summaryFailureState() {
        const cursor = this.host.cursor();
        const small = (cursor.closedEventTimelines ?? []).map((timeline) => normalizeEventTimeline(timeline, 'pending')).filter((timeline) => timeline?.summaryStatus === 'failed').map((timeline) => ({
            id: timeline.groupUid || timeline.id,
            sceneGroup: timeline.sceneGroup,
            sceneTitle: timeline.sceneTitle,
            label: timeline.sceneTitle || timeline.sceneGroup || '未命名场景',
            entryCount: timelineUids(timeline).length,
            failedAt: Math.max(0, Number(timeline.failedAt || 0)),
            error: String(timeline.summaryError || '').trim(),
        }));
        return { small };
    }
    async retryFailedSmallSummary(settings, snapshot, taskId = '') {
        // [MA-SUMMARY-COUNTER] 失败小总结重试仍然只处理原关闭场景；成功后进入新的 S 场景累计组，不再进入 settled/archive。
        const cursor = this.host.cursor();
        const failed = (cursor.closedEventTimelines ?? []).map((timeline) => normalizeEventTimeline(timeline, 'pending')).filter((timeline) => timeline?.summaryStatus === 'failed');
        const target = taskId ? failed.find((timeline) => (timeline.groupUid || timeline.id) === taskId) : failed[0];
        if (!target) throw new Error('当前没有可重试的失败小总结');
        const marks = timelineUids(target).map((uid) => ({ uid }));
        if (!marks.length) throw new Error('该失败小总结没有可处理条目');
        const label = target.sceneTitle || target.sceneGroup || '未命名场景';
        summaryNotify('info', `镜渊：重试失败小总结“${label}”（${marks.length}个条目）${target.summaryError ? `；上次失败：${String(target.summaryError).slice(0, 240)}` : ''}`);
        let result;
        try {
            result = await this.summarize('small', settings, snapshot, { marks, timeline: target, previousFailureReason: target.summaryError || '' });
        } catch (error) {
            const failedAt = Date.now();
            const summaryError = String((0, util_1.errorText)(error) || '').trim();
            const nextClosed = (cursor.closedEventTimelines ?? []).map((timeline) => {
                const normalized = normalizeEventTimeline(timeline, 'pending');
                if (!normalized || (normalized.groupUid || normalized.id) !== (target.groupUid || target.id)) return normalized;
                return normalizeEventTimeline({ ...normalized, summaryStatus: 'failed', failedAt, summaryError }, 'failed');
            }).filter(Boolean);
            try { await this.host.saveCursor({ ...cursor, closedEventTimelines: nextClosed }, snapshot, this.getSettings()); } catch { }
            summaryNotify('error', `镜渊：失败小总结重试仍失败：${summaryError}`);
            throw error;
        }
        const summaryOutputUids = result.summaryOutputUids ?? summaryOutputUidsFromResult(result, marks.map((mark) => mark.uid));
        const processed = result.processedPendingUids ?? [];
        const closedEventTimelines = (cursor.closedEventTimelines ?? []).map((timeline) => normalizeEventTimeline(timeline, 'pending')).filter(Boolean)
            .filter((timeline) => (timeline.groupUid || timeline.id) !== (target.groupUid || target.id));
        let activeLargeSummaryGroup = refreshLargeSummaryGroupReferences(cursor.activeLargeSummaryGroup, result.entries);
        let accumulatedSceneGroups = activeLargeSummaryGroup.sceneGroups.map((group) => structuredClone(group));
        const summarizedGroup = summarizedSceneGroupFolder(target, summaryOutputUids);
        if (summarizedGroup?.memberUids?.length) {
            const targetId = String(summarizedGroup.groupUid || summarizedGroup.id);
            accumulatedSceneGroups = [...accumulatedSceneGroups.filter((group) => String(group.groupUid || group.id) !== targetId), summarizedGroup];
        }
        activeLargeSummaryGroup = { ...activeLargeSummaryGroup, sceneGroups: accumulatedSceneGroups };
        const nextCursor = {
            ...cursor,
            closedEventTimelines,
            activeLargeSummaryGroup,
            smallSummarySceneCounter: accumulatedSceneGroups.length,
        };
        try {
            await this.host.saveCursor(nextCursor, snapshot, this.getSettings());
            await this.finalizeReceiptStates([result], nextCursor);
        } catch (error) {
            await this.rollbackCommittedResults(settings, snapshot, [result], cursor, error, '失败小总结重试');
        }
        this.setStatus(snapshot.chatKey, 'complete', result.changed ? '失败小总结重试完成' : '失败小总结重试完成，本批无结构变化');
        summaryNotify(result.changed ? 'success' : 'info', result.changed
            ? `镜渊：失败小总结重试完成（处理${processed.length}个条目；S场景计数${accumulatedSceneGroups.length}）`
            : `镜渊：失败小总结重试已处理，但本批没有形成结构变化（处理${processed.length}个条目；S场景计数${accumulatedSceneGroups.length}）`);
        const threshold = Math.max(2, Math.min(30, Number(settings.largeSummaryCount || 4)));
        const failedSet = new Set((nextCursor.failedLargeSummaryGroupUids ?? []).map(String));
        const oldestBatch = accumulatedSceneGroups.slice(0, threshold);
        if (settings.autoLargeSummary !== false && accumulatedSceneGroups.length >= threshold
            && !oldestBatch.some((group) => failedSet.has(String(group.groupUid || group.id)))) {
            try { await this.runTask('largeSummary', settings, snapshot, { fromCounter: true }); }
            catch (error) { summaryNotify('error', `镜渊：S场景计数达到阈值，但大总结失败并保留当前累计组：${(0, util_1.errorText)(error)}`); }
        }
        return taskResultEntries(result);
    }
    async runTask(kind, settings, snapshot, options = {}) {
        if (kind === 'extraction') {
            const cursor = this.host.cursor();
            const result = await this.extract(settings, snapshot);
            const schedule = await this.advanceSummarySchedule(settings, snapshot, cursor, result);
            const completionDetail = schedule?.warning
                ? `提取完成；${schedule.warning}`
                : schedule?.ranSmall
                    ? '提取完成；本回合已执行小总结'
                    : '提取完成';
            this.setStatus(snapshot.chatKey, 'complete', completionDetail);
            return taskResultEntries(result);
        }

        if (kind === 'smallSummary') {
            // [MA-SUMMARY-COUNTER] 手动小总结仍然处理最早一个已关闭场景组；成功后直接进入 S 场景累计组。
            const cursor = this.host.cursor();
            const targetGroup = nextPendingSceneGroup(cursor.closedEventTimelines, false);
            if (!targetGroup) {
                if ((cursor.closedEventTimelines ?? []).some((timeline) => normalizeEventTimeline(timeline, 'pending')?.summaryStatus === 'failed'))
                    throw new Error('当前只有失败小总结任务，请使用“重试失败小总结”');
                throw new Error('当前没有待处理的已关闭 SceneGroup');
            }
            const marks = timelineUids(targetGroup).map((uid) => ({ uid }));
            const targetGroupLabel = targetGroup.sceneTitle || targetGroup.sceneGroup || '未命名场景';
            summaryNotify('info', `镜渊：开始手动小总结（${marks.length}个条目，${targetGroupLabel}）`);
            const result = await this.summarize('small', settings, snapshot, { marks, timeline: targetGroup });
            const summaryOutputUids = result.summaryOutputUids ?? summaryOutputUidsFromResult(result, marks.map((mark) => mark.uid));
            const processed = result.processedPendingUids ?? [];
            const closedEventTimelines = (cursor.closedEventTimelines ?? []).map((timeline) => normalizeEventTimeline(timeline, 'pending')).filter(Boolean)
                .filter((timeline) => (timeline.groupUid || timeline.id) !== (targetGroup.groupUid || targetGroup.id));
            let activeLargeSummaryGroup = refreshLargeSummaryGroupReferences(cursor.activeLargeSummaryGroup, result.entries);
            let accumulatedSceneGroups = activeLargeSummaryGroup.sceneGroups.map((group) => structuredClone(group));
            const summarizedGroup = summarizedSceneGroupFolder(targetGroup, summaryOutputUids);
            if (summarizedGroup?.memberUids?.length) {
                const groupId = String(summarizedGroup.groupUid || summarizedGroup.id);
                accumulatedSceneGroups = [...accumulatedSceneGroups.filter((group) => String(group.groupUid || group.id) !== groupId), summarizedGroup];
            }
            activeLargeSummaryGroup = { ...activeLargeSummaryGroup, sceneGroups: accumulatedSceneGroups };
            const nextCursor = {
                ...cursor,
                closedEventTimelines,
                activeLargeSummaryGroup,
                smallSummarySceneCounter: accumulatedSceneGroups.length,
            };
            try {
                await this.host.saveCursor(nextCursor, snapshot, this.getSettings());
                await this.finalizeReceiptStates([result], nextCursor);
            } catch (error) {
                await this.rollbackCommittedResults(settings, snapshot, [result], cursor, error, '小总结回合');
            }
            const smallWrites = Number(result?.warehouse?.createdCount || 0) + Number(result?.warehouse?.updatedCount || 0);
            const smallDeleted = Number(result?.warehouse?.deletedCount || 0);
            this.setStatus(snapshot.chatKey, 'complete', result.changed
                ? `小总结完成：写入${smallWrites}，删除${smallDeleted}；S场景计数${accumulatedSceneGroups.length}`
                : `小总结结算完成；S场景计数${accumulatedSceneGroups.length}`);
            summaryNotify(result.changed ? 'success' : 'info', result.changed
                ? `镜渊：手动小总结完成（处理${processed.length}个条目，S场景计数${accumulatedSceneGroups.length}）`
                : `镜渊：手动小总结结算完成（处理${processed.length}个条目，S场景计数${accumulatedSceneGroups.length}）`);

            // 手动小总结也遵守同一个计数器；达到阈值且自动大总结开启时立即上卷，不等下一正文回合。
            const threshold = Math.max(2, Math.min(30, Number(settings.largeSummaryCount || 4)));
            const failedSet = new Set((nextCursor.failedLargeSummaryGroupUids ?? []).map(String));
            const oldestBatch = accumulatedSceneGroups.slice(0, threshold);
            if (settings.autoLargeSummary !== false && accumulatedSceneGroups.length >= threshold
                && !oldestBatch.some((group) => failedSet.has(String(group.groupUid || group.id)))) {
                try { await this.runTask('largeSummary', settings, snapshot, { fromCounter: true }); }
                catch (error) { summaryNotify('error', `镜渊：S场景计数达到阈值，但大总结失败并保留当前累计组：${(0, util_1.errorText)(error)}`); }
            }
            return taskResultEntries(result);
        }

        // [MA-LARGE-GROUP] 大总结只处理当前大组集：若干已完成小总结的组集作为新材料，已有基础设定作为长期层。基石锁由玩家手动治理，不自动进入大总结提示词。
        const cursor = this.host.cursor();
        const latestEntries = await this.worldbook.list(settings, snapshot, () => this.validate(snapshot));
        this.validate(snapshot);
        let activeLargeSummaryGroup = refreshLargeSummaryGroupReferences(cursor.activeLargeSummaryGroup, latestEntries);
        const accumulatedGroups = activeLargeSummaryGroup.sceneGroups;
        // 自动触发只收拢达到阈值的最早一批；玩家点击“立即大总结”时不看阈值、不缩成失败子集，直接收拢当前大组集的全部小总结组。
        let targetGroups = accumulatedGroups;
        if (options.fromCounter === true) {
            const threshold = Math.max(2, Math.min(30, Number(settings.largeSummaryCount || 4)));
            targetGroups = accumulatedGroups.slice(0, threshold);
        }
        if (!targetGroups.length) throw new Error('当前大组集没有待大总结的 S 场景组');
        const marks = largeSummaryMarksFromGroups(targetGroups);
        if (!marks.length) throw new Error('当前大组集的 S 场景组没有可用条目');
        const largeGroupForRun = { ...activeLargeSummaryGroup, sceneGroups: targetGroups.map((group) => structuredClone(group)) };
        summaryNotify('info', `镜渊：开始大总结（收拢${targetGroups.length}个小总结组；已有基础设定${largeGroupForRun.foundationUids.length}）`);
        let result;
        try {
            result = await this.summarize('large', settings, snapshot, { marks, timelines: targetGroups, largeGroup: largeGroupForRun });
        } catch (error) {
            // 自动触发失败只记录本批场景组，避免下一正文回合反复自动请求；大组集本身保持原样。
            if (options.fromCounter === true) {
                const failedIds = [...new Set([...(cursor.failedLargeSummaryGroupUids ?? []).map(String), ...targetGroups.map((group) => String(group.groupUid || group.id))])];
                try { await this.host.saveCursor({ ...cursor, activeLargeSummaryGroup, failedLargeSummaryGroupUids: failedIds }, snapshot, this.getSettings()); } catch { }
            }
            throw error;
        }
        const processed = result.processedPendingUids ?? [];
        const processedGroupIds = new Set(targetGroups.map((group) => String(group.groupUid || group.id)));
        const remainingSceneGroups = accumulatedGroups.filter((group) => !processedGroupIds.has(String(group.groupUid || group.id)));
        const refreshedReferences = refreshLargeSummaryGroupReferences(activeLargeSummaryGroup, result.entries);
        const nextLargeId = `LG-${Date.now().toString(36)}`;
        activeLargeSummaryGroup = {
            ...refreshedReferences,
            id: nextLargeId,
            groupUid: nextLargeId,
            sceneGroups: remainingSceneGroups.map((group) => structuredClone(group)),
            openedAt: Date.now(),
        };
        const nextFailedLarge = (cursor.failedLargeSummaryGroupUids ?? []).map(String).filter((id) => !processedGroupIds.has(id));
        const nextCursor = {
            ...cursor,
            activeLargeSummaryGroup,
            smallSummarySceneCounter: remainingSceneGroups.length,
            failedLargeSummaryGroupUids: nextFailedLarge,
        };
        try {
            await this.host.saveCursor(nextCursor, snapshot, this.getSettings());
            await this.finalizeReceiptStates([result], nextCursor);
        } catch (error) {
            await this.rollbackCommittedResults(settings, snapshot, [result], cursor, error, '大总结回合');
        }
        this.setStatus(snapshot.chatKey, 'complete', '大总结完成；本轮大组集已结算');
        summaryNotify(result.changed ? 'success' : 'info', `镜渊：大总结完成（基础设定写入完成；${targetGroups.length}个场景组 S→L；下一大组集场景计数${remainingSceneGroups.length}）`);
        return taskResultEntries(result);
    }


    async advanceSummarySchedule(settings, snapshot, cursor, rootResult = null) {
        const committed = rootResult ? [rootResult] : [];
        let activeEventTimeline = normalizeEventTimeline(cursor.activeEventTimeline, 'active');
        let closedEventTimelines = (cursor.closedEventTimelines ?? []).map((timeline) => normalizeEventTimeline(timeline, 'pending')).filter(Boolean);
        let activeLargeSummaryGroup = refreshLargeSummaryGroupReferences(cursor.activeLargeSummaryGroup, rootResult?.entries ?? []);
        let accumulatedSceneGroups = activeLargeSummaryGroup.sceneGroups.map((group) => structuredClone(group));
        let failedLargeSummaryGroupUids = [...new Set((cursor.failedLargeSummaryGroupUids ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))];

        // S 只代表 UID 当前状态。正常提取再次改动 UID 时，该 UID 立即从等待大总结的旧场景组退出。
        const changedByCurrentExtraction = (rootResult?.businessChanges ?? []).map((change) => String(change?.uid ?? '').trim()).filter(Boolean);
        accumulatedSceneGroups = invalidateAccumulatedSummaryUids(accumulatedSceneGroups, changedByCurrentExtraction);
        activeLargeSummaryGroup = { ...activeLargeSummaryGroup, sceneGroups: accumulatedSceneGroups };
        const survivingAccumulatorIds = new Set(accumulatedSceneGroups.map((group) => String(group.groupUid || group.id)));
        failedLargeSummaryGroupUids = failedLargeSummaryGroupUids.filter((id) => survivingAccumulatorIds.has(String(id)));

        const currentGroup = String(rootResult?.currentSceneGroup || activeEventTimeline?.sceneGroup || '').trim();
        const currentTitle = String(rootResult?.currentSceneTitle || activeEventTimeline?.sceneTitle || '').trim();
        const sceneBoundary = rootResult?.sceneBoundaryChanged === true;

        // 当前场景组只保存当前连续场景的 UID 归属；换场时关闭旧组并立即创建新组。
        if (sceneBoundary && activeEventTimeline) {
            if (timelineUids(activeEventTimeline).length) {
                const closed = normalizeEventTimeline({
                    ...activeEventTimeline,
                    summaryStatus: 'pending',
                    closedAtMessageKey: String(snapshot.messageKey ?? ''),
                }, 'pending');
                if (closed) closedEventTimelines.push(closed);
            }
            activeEventTimeline = null;
        }
        if (!activeEventTimeline) {
            const seed = `${snapshot.chatKey}|${currentGroup || currentTitle || 'scene'}|${snapshot.messageKey}`;
            const groupUid = `SG-${(0, util_1.hashText)(seed).slice(0, 10)}`;
            activeEventTimeline = {
                id: groupUid,
                groupUid,
                sceneGroup: currentGroup,
                sceneTitle: currentTitle,
                memberUids: [],
                summaryStatus: 'active',
                openedAtMessageKey: String(snapshot.messageKey ?? ''),
                closedAtMessageKey: '',
            };
        }
        activeEventTimeline.sceneGroup ||= currentGroup;
        activeEventTimeline.sceneTitle ||= currentTitle;
        activeEventTimeline.summaryStatus = 'active';
        activeEventTimeline = appendSceneGroupMembers(activeEventTimeline, rootResult, snapshot);
        closedEventTimelines = closedEventTimelines.map((timeline) => normalizeEventTimeline(timeline, 'pending')).filter(Boolean);

        let smallRanThisTurn = false;
        let summaryWarning = '';
        try {
            // 真实换场后，刚关闭的场景组 UID 作为小总结范围；正文只在请求前从当前世界书按 UID 读取。
            const summaryGroup = sceneBoundary && settings.autoSmallSummary !== false
                ? nextPendingSceneGroup(closedEventTimelines, false)
                : null;
            if (summaryGroup) {
                const marks = timelineUids(summaryGroup).map((uid) => ({ uid }));
                if (marks.length) {
                    smallRanThisTurn = true;
                    const groupLabel = summaryGroup.sceneTitle || summaryGroup.sceneGroup || '未命名场景';
                    this.progress('running', `场景组“${groupLabel}”开始小总结：${marks.length}个条目`, { titles: ['小总结'], sceneBoundary: true, sceneGroupUid: summaryGroup.groupUid });
                    summaryNotify('info', `镜渊：场景组结束，开始小总结（${marks.length}个条目）`);
                                try {
                        const small = await this.summarize('small', settings, snapshot, { marks, timeline: summaryGroup });
                        committed.push(small);
                        const processed = small.processedPendingUids ?? [];
                        const summaryOutputUids = small.summaryOutputUids ?? summaryOutputUidsFromResult(small, marks.map((mark) => mark.uid));
                        const summarizedGroup = summarizedSceneGroupFolder(summaryGroup, summaryOutputUids);
                        activeLargeSummaryGroup = refreshLargeSummaryGroupReferences(activeLargeSummaryGroup, small.entries);
                        accumulatedSceneGroups = activeLargeSummaryGroup.sceneGroups.map((group) => structuredClone(group));
                        if (summarizedGroup?.memberUids?.length) {
                            const groupId = String(summarizedGroup.groupUid || summarizedGroup.id);
                            accumulatedSceneGroups = [...accumulatedSceneGroups.filter((group) => String(group.groupUid || group.id) !== groupId), summarizedGroup];
                        }
                        activeLargeSummaryGroup = { ...activeLargeSummaryGroup, sceneGroups: accumulatedSceneGroups };
                        closedEventTimelines = closedEventTimelines.filter((timeline) => (timeline.groupUid || timeline.id) !== (summaryGroup.groupUid || summaryGroup.id));
                        const smallWrites = Number(small?.warehouse?.createdCount || 0) + Number(small?.warehouse?.updatedCount || 0);
                        const smallDeleted = Number(small?.warehouse?.deletedCount || 0);
                        summaryNotify(small?.changed ? 'success' : 'info',
                            `镜渊：小总结完成（${groupLabel}，处理${processed.length}个条目，写入${smallWrites}，删除${smallDeleted}；大组集场景计数${accumulatedSceneGroups.length}）`);
                    } catch (error) {
                        closedEventTimelines = closedEventTimelines.map((timeline) => {
                            if ((timeline.groupUid || timeline.id) !== (summaryGroup.groupUid || summaryGroup.id)) return timeline;
                            return normalizeEventTimeline({ ...timeline, summaryStatus: 'failed', failedAt: Date.now(), summaryError: (0, util_1.errorText)(error) }, 'failed');
                        }).filter(Boolean);
                        summaryWarning = `小总结失败；场景“${groupLabel}”已保留给手动处理：${(0, util_1.errorText)(error)}`;
                        this.progress('warning', summaryWarning, { titles: ['小总结'], error: (0, util_1.errorText)(error), autoRetryStopped: true, sceneGroupUid: summaryGroup.groupUid });
                        summaryNotify('error', `镜渊：小总结失败：${(0, util_1.errorText)(error)}`);
                    }
                }
            }

            // 当前大组集累计的小总结场景达到阈值后立即大总结。
            if (settings.autoLargeSummary !== false) {
                const threshold = Math.max(2, Math.min(30, Number(settings.largeSummaryCount || 4)));
                if (accumulatedSceneGroups.length >= threshold) {
                    const batch = accumulatedSceneGroups.slice(0, threshold);
                    const failedSet = new Set(failedLargeSummaryGroupUids.map(String));
                    const blockedByPreviousFailure = batch.some((group) => failedSet.has(String(group.groupUid || group.id)));
                    if (!blockedByPreviousFailure) {
                        const marks = largeSummaryMarksFromGroups(batch);
                        if (marks.length) {
                            this.progress('running', `大组集场景计数达到${threshold}：开始大总结`, { titles: ['基础设定'], phase: 'large-summary', sceneGroupUids: batch.map((item) => item.groupUid) });
                            summaryNotify('info', `镜渊：大组集达到${threshold}个小总结场景，开始自动大总结`);
                                                try {
                                const largeGroupForRun = { ...activeLargeSummaryGroup, sceneGroups: batch.map((group) => structuredClone(group)) };
                                const large = await this.summarize('large', settings, snapshot, { marks, timelines: batch, largeGroup: largeGroupForRun });
                                committed.push(large);
                                const batchIds = new Set(batch.map((group) => String(group.groupUid || group.id)));
                                accumulatedSceneGroups = accumulatedSceneGroups.filter((group) => !batchIds.has(String(group.groupUid || group.id)));
                                failedLargeSummaryGroupUids = failedLargeSummaryGroupUids.filter((id) => !batchIds.has(String(id)));
                                const refreshed = refreshLargeSummaryGroupReferences(activeLargeSummaryGroup, large.entries);
                                const nextLargeId = `LG-${Date.now().toString(36)}`;
                                activeLargeSummaryGroup = {
                                    ...refreshed,
                                    id: nextLargeId,
                                    groupUid: nextLargeId,
                                    sceneGroups: accumulatedSceneGroups.map((group) => structuredClone(group)),
                                    openedAt: Date.now(),
                                };
                                const largeWrites = Number(large?.warehouse?.createdCount || 0) + Number(large?.warehouse?.updatedCount || 0);
                                summaryNotify(large?.changed ? 'success' : 'info',
                                    `镜渊：自动大总结完成（${batch.length}个场景组 S→L；基础设定写入${largeWrites}；下一大组集场景计数${accumulatedSceneGroups.length}）`);
                            } catch (error) {
                                failedLargeSummaryGroupUids = [...new Set([...failedLargeSummaryGroupUids, ...batch.map((group) => String(group.groupUid || group.id))])];
                                const warning = `自动大总结失败；当前大组集保持原样，等待手动大总结：${(0, util_1.errorText)(error)}`;
                                summaryWarning = summaryWarning ? `${summaryWarning}；${warning}` : warning;
                                this.progress('warning', warning, { titles: ['基础设定'], error: (0, util_1.errorText)(error), autoRetryStopped: true, sceneGroupUids: batch.map((item) => item.groupUid) });
                                summaryNotify('error', `镜渊：自动大总结失败，大组集计数未清零：${(0, util_1.errorText)(error)}`);
                            }
                        }
                    }
                }
            }

            activeLargeSummaryGroup = { ...activeLargeSummaryGroup, sceneGroups: accumulatedSceneGroups };
            const writtenThisExtraction = [...new Set((rootResult?.businessChanges ?? [])
                .filter((change) => change?.action === 'create' || change?.action === 'update')
                .map((change) => String(change?.uid ?? '').trim()).filter(Boolean))];
            const nextCursor = {
                ...cursor,
                lastProcessedMessageKey: snapshot.messageKey,
                lastProcessedHash: snapshot.contentHash,
                lastExtractionUids: writtenThisExtraction.length ? writtenThisExtraction : [...new Set((cursor.lastExtractionUids ?? []).map(String).filter(Boolean))],
                activeEventTimeline,
                closedEventTimelines,
                activeLargeSummaryGroup,
                smallSummarySceneCounter: accumulatedSceneGroups.length,
                failedLargeSummaryGroupUids,
            };
            await this.host.saveCursor(nextCursor, snapshot, this.getSettings());
            await this.finalizeReceiptStates(committed, nextCursor);
            return { warning: summaryWarning, cursor: nextCursor, ranSmall: smallRanThisTurn };
        } catch (error) {
            await this.rollbackCommittedResults(settings, snapshot, committed, cursor, error, '正文处理回合');
        }
    }

    async finalizeReceiptStates(results, cursor) {
        for (const result of results ?? []) {
            if (!result?.receipt?.changes?.length || typeof this.host.appendCommitReceipt !== 'function') continue;
            result.receipt.stateAfter = { cursor: structuredClone(cursor) };
            await this.host.appendCommitReceipt(result.receipt);
        }
    }
    recoverySnapshotForRollback(settings, snapshot, suffix = 'rollback') {
        // 逆向恢复的职责是撤销已经提交的事务。源正文、任务 token 或模型设置在提交后发生变化，
        // 恰恰是需要回滚的常见原因，不能继续用前向快照把回滚自己拦住。
        // 这里改用当前 maintenance 快照，只保留“同聊天 + 同世界书”的硬边界；若作用域已切走则安全失败。
        try {
            const liveSettings = typeof this.getSettings === 'function' ? this.getSettings() : settings;
            const recovery = this.host.captureMaintenanceSnapshot(liveSettings, `${snapshot.taskType || 'task'}:${suffix}`, { cancelled: false, reason: '' });
            if (recovery?.chatKey !== snapshot.chatKey || recovery?.worldbookName !== snapshot.worldbookName) return snapshot;
            return recovery;
        }
        catch {
            return snapshot;
        }
    }
    async rollbackCommittedResults(settings, snapshot, results, previousCursor, cause, label) {
        const committed = (results ?? []).filter((item) => item?.receipt?.changes?.length);
        const receipts = committed.map((item) => item.receipt);
        const receiptIds = receipts.map((item) => String(item.id ?? '')).filter(Boolean);
        const failures = [];
        let detached = false;
        try { detached = typeof this.host.chatKey === 'function' ? this.host.chatKey() !== snapshot.chatKey : false; } catch { detached = true; }
        const recoverySnapshot = detached ? snapshot : this.recoverySnapshotForRollback(settings, snapshot, 'rollback');
        const focusUid = detached ? '' : (typeof this.host.getFocusUid === 'function' ? this.host.getFocusUid() : '');
        let worldbookRestored = !receipts.length;
        if (receipts.length) {
            try {
                await this.worldbook.rollbackReceipts(
                    settings, receipts, focusUid, recoverySnapshot,
                    detached ? null : () => this.validate(recoverySnapshot),
                    { detached },
                );
                worldbookRestored = true;
            }
            catch (error) { failures.push(`世界书回滚失败：${(0, util_1.errorText)(error)}`); }
        }
        if (detached) {
            if (worldbookRestored) {
                try {
                    if (typeof this.host.restoreTransactionMetadataForSnapshot !== 'function')
                        throw new Error('宿主不支持原聊天事务元数据恢复');
                    await this.host.restoreTransactionMetadataForSnapshot(snapshot);
                }
                catch (error) { failures.push(`原聊天事务元数据恢复失败：${(0, util_1.errorText)(error)}`); }
            }
        }
        else {
            if (worldbookRestored && receiptIds.length) {
                try {
                    if (typeof this.host.removeCommitReceipts === 'function') await this.host.removeCommitReceipts(receiptIds);
                    if (typeof this.host.removeTurnRollbackContributions === 'function') await this.host.removeTurnRollbackContributions(receiptIds);
                }
                catch (error) { failures.push(`回执/回合UID快照清理失败：${(0, util_1.errorText)(error)}`); }
            }
            try {
                const liveCursor = typeof this.host.cursor === 'function' ? this.host.cursor() : null;
                if (previousCursor && typeof this.host.saveCursor === 'function' && JSON.stringify(liveCursor) !== JSON.stringify(previousCursor))
                    await this.host.saveCursor(previousCursor, recoverySnapshot, this.getSettings());
            }
            catch (error) { failures.push(`处理游标恢复失败：${(0, util_1.errorText)(error)}`); }
        }
        if (failures.length) throw new Error(`${label}失败，且逆向恢复不完整：${(0, util_1.errorText)(cause)}；${failures.join('；')}`);
        throw new Error(`${label}失败，已回滚本回合世界书、回执与处理游标：${(0, util_1.errorText)(cause)}`);
    }
    async extract(settings, snapshot, options = {}) {
        this.setStatus(snapshot.chatKey, 'extracting', '提取事实与状态');
        this.validate(snapshot);
        // [MA-EXTRACT-CONTEXT] 提取不再筛“上一批 UID / 当前场景 UID”。
        // 每轮只从当前世界书读取一次，并把当前全部业务条目的最新正文交给提取模型；UID 仍只留在插件内部。
        const entries = await this.worldbook.list(settings, snapshot, () => this.validate(snapshot));
        this.validate(snapshot);
        const extractionEntries = entries.map((entry) => structuredClone(entry));
        const dialogueInput = [snapshot.playerText, snapshot.assistantText].filter(Boolean).join('\n\n');
        const promptOptions = { requestTime: snapshot.capturedAt };
        let raw = options.deterministicOnly === true ? '无' : '';
        let blocks = [];
        let diagnostics = { repaired: 0, merged: [], skipped: [], warnings: [], hadInput: false };
        let explicitNone = options.deterministicOnly === true;
        let lastError = null;
        // [MA-PROTOCOL-RETRY-DIAGNOSTIC] 只保存第一次尝试得到的确定性“为何没形成固定协议”说明，供第二次干净重试。
        // 不保存/回灌第一次模型正文或 reasoning；网络错误也不伪装成协议缺字段。
        let extractionRetryReason = '';
        if (options.deterministicOnly !== true) {
            // [MA-ARCH-05] 提取只允许两次明确尝试：正常请求 + 一次干净紧凑重开。
            // 语法恢复全部在本地 parser；不再分段救援、不再调用第二个“格式修复模型”。
            for (let attempt = 0; attempt < 2; attempt += 1) {
                const compact = attempt === 1;
                const requestPrompt = (0, prompts_1.extractionPrompts)(settings, snapshot.playerText, snapshot.assistantText, extractionEntries, { ...promptOptions, compact, retryReason: compact ? extractionRetryReason : '' });
                try {
                    raw = await (0, model_request_1.callModel)({
                        host: this.host,
                        stage: 'extraction',
                        prompt: requestPrompt,
                        fallbackPrompt: requestPrompt,
                        settings,
                        snapshot,
                        profileId: settings.modelProfileId,
                        sourceText: snapshot.turnText || snapshot.assistantText,
                        singleAttempt: true,
                        generationOptions: compact && settings.modelProfileId ? { includePreset: false } : undefined,
                    });
                    this.validate(snapshot);
                    blocks = (0, parser_1.parseExtractionProtocol)(raw);
                    diagnostics = blocks.diagnostics ?? diagnostics;
                    explicitNone = (0, parser_1.sanitizeModelText)(raw).trim() === protocols_1.NONE;
                    if (blocks.length || explicitNone) break;
                    extractionRetryReason = (diagnostics.skipped || []).map((item) => item.reason).filter(Boolean).slice(0, 3).join('；') || '最终文本未形成固定事实协议';
                    lastError = new Error(extractionRetryReason);
                } catch (error) {
                    lastError = error;
                    // 只有“没有最终协议文本”这一类确定性响应形态可告诉模型；HTTP/网关错误不属于模型格式错误。
                    if (error?.code === 'MA_REASONING_ONLY') extractionRetryReason = '上一次只返回推理内容，没有最终固定协议';
                    else if (error?.code === 'MA_EMPTY_MODEL_RESPONSE') extractionRetryReason = '上一次最终文本为空，没有任何固定协议行';
                }
                if (attempt === 0) {
                    this.progress('running', `提取首次未形成可提交协议，使用同一正文干净重开一次：${(0, util_1.errorText)(lastError)}`, { titles: [], phase: 'extract-retry' });
                }
            }
            if (!blocks.length && !explicitNone && lastError && !diagnostics.hadInput) throw lastError;
        }
        if (!blocks.length) {
            const skippedTitles = (diagnostics.skipped || []).map((item) => item.title || '异常片段');
            const detail = explicitNone ? '本轮明确无有效变化，世界书零写入' : `没有可安全提交的固定事实；已隔离${skippedTitles.length}个异常片段`;
            this.setStatus(snapshot.chatKey, 'matching', detail, '', raw, emptyPlan());
            this.progress(explicitNone ? 'success' : 'error', detail, { titles: [], created: [], updated: [], skipped: skippedTitles, repaired: diagnostics.repaired || 0, phase: 'extract' });
            if (!explicitNone) {
                const reasons = (diagnostics.skipped || []).map((item) => `${item.title || '异常片段'}：${item.reason || '协议不完整'}`).slice(0, 4).join('；');
                throw new Error(`提取连续两次未形成可识别的固定事实协议，世界书未写入且处理游标未推进${reasons ? `：${reasons}` : ''}`);
            }
            return { entries, changed: false, diagnostics, extractionPoints: [] };
        }
        const titles = blocks.map((block) => block.title);
        this.setStatus(snapshot.chatKey, 'matching', `已提取 ${titles.length} 个条目：${titles.join('、')}；本地语法修复${diagnostics.repaired || 0}处`, '', raw);
        this.progress('running', `已提取 ${titles.length} 个，正在精确匹配；本地修复${diagnostics.repaired || 0}处`, { phase: 'extract', titles, repaired: diagnostics.repaired || 0, skipped: (diagnostics.skipped || []).map((item) => item.title || '异常片段') });
        const plan = (0, operations_1.buildOperationPlan)(blocks, entries, settings, dialogueInput, { sourceKind: 'extraction' });
        const created = [...new Set(plan.operations.filter((operation) => operation.kind === 'create-entry').map((operation) => operation.title))];
        const updated = [...new Set(plan.operations.filter((operation) => operation.kind !== 'create-entry' && operation.kind !== 'noop').map((operation) => operation.title))];
        const skipped = [...new Set([...(diagnostics.skipped || []).map((item) => item.title || '异常片段'), ...plan.operations.filter((operation) => operation.kind === 'noop').map((operation) => operation.title)])];
        this.progress('running', `准备写入：新建${created.length}、更新${updated.length}、本地修复${diagnostics.repaired || 0}、跳过${skipped.length}`, { phase: 'write', titles, created, updated, skipped, repaired: diagnostics.repaired || 0 });
        const previousCursor = typeof this.host.cursor === 'function' ? this.host.cursor() : null;
        const result = await this.apply(settings, plan, snapshot, dialogueInput, '提取', raw);
        const beforeGroup = String(previousCursor?.activeEventTimeline?.sceneGroup || '').trim();
        // [MA-SCENE-BOUNDARY-LOCK] 换场比较只使用当前 active SceneGroup；禁止从世界书里的场景条目反推上一地点。
        const explicitSceneTitle = String(plan.currentSceneTitle || '').trim();
        const splitScene = (0, util_1.splitTitle)(explicitSceneTitle);
        const explicitGroup = explicitSceneTitle ? (0, util_1.normalizeSceneLocation)(splitScene?.name || explicitSceneTitle) : '';
        result.currentSceneGroup = explicitGroup || beforeGroup;
        // [MA-SCENE-BOUNDARY-LOCK] 本轮没有权威“地点：”时沿用当前组；禁止用提取出的场景条目制造场景切换。
        result.currentSceneTitle = explicitSceneTitle || String(previousCursor?.activeEventTimeline?.sceneTitle || '').trim();
        result.sceneBoundaryChanged = Boolean(beforeGroup && result.currentSceneGroup && beforeGroup !== result.currentSceneGroup);
        result.extractionPoints = extractionPointsFromBlocks(blocks, result.entries, result.businessChanges);
        result.criticalChanges = (0, semantic_1.countCriticalChanges)(plan);
        const destination = result.worldbookName || snapshot.worldbookName || '当前绑定世界书';
        const actualCreated = result.warehouse?.created ?? [];
        const actualUpdated = result.warehouse?.updated ?? [];
        const actualDeleted = result.warehouse?.deleted ?? [];
        const businessWrites = actualCreated.length + actualUpdated.length + actualDeleted.length;
        const noopReasons = [...new Set((plan.operations ?? [])
            .filter((operation) => operation.kind === 'noop')
            .map((operation) => String(operation.reason || '').trim())
            .filter(Boolean))].slice(0, 4);
        const actionableCount = (plan.operations ?? []).filter((operation) => operation.kind !== 'noop').length;
        const detail = businessWrites > 0
            ? `已写入世界书“${destination}”：新建${actualCreated.length}、更新${actualUpdated.length}、删除${actualDeleted.length}`
            : actionableCount === 0
                ? `提取完成但没有新的业务变化${noopReasons.length ? `：${noopReasons.join('；')}` : ''}`
                : `世界书“${destination}”提交后业务写入为0，操作计划与权威回读不一致`;
        this.progress('success', detail, { phase: 'write', titles, created: actualCreated, updated: actualUpdated, deleted: actualDeleted, skipped, repaired: diagnostics.repaired || 0, criticalChanges: result.criticalChanges, worldbookName: destination, businessWriteCount: businessWrites });
        return result;
    }


    async summarizeSelected(kind, settings, snapshot, selectedUids) {
        const summaryKind = kind === 'large' ? 'large' : 'small';
        const label = summaryKind === 'large' ? '选中大总结' : '选中小总结';
        const marks = normalizeSummaryMarks((selectedUids ?? []).map((uid) => ({ uid: String(uid ?? '').trim() })).filter((mark) => mark.uid));
        if (!marks.length) throw new Error(`${label}至少需要一个有效条目`);
        summaryNotify('info', `镜渊：开始${label}（${marks.length}个条目）`);
        const result = await this.summarize(summaryKind, settings, snapshot, { marks, manualSelection: true });
        const writes = Number(result?.warehouse?.createdCount || 0) + Number(result?.warehouse?.updatedCount || 0);
        const deleted = Number(result?.warehouse?.deletedCount || 0);
        this.setStatus(snapshot.chatKey, 'complete', `${label}完成：写入${writes}，删除${deleted}`);
        summaryNotify('success', `镜渊：${label}完成（写入${writes}，删除${deleted}）`);
        return result;
    }

    async summarize(kind, settings, snapshot, options = {}) {
        if (kind === 'large') return this.summarizeLargeGroup(settings, snapshot, options);
        const label = kind === 'small' ? '小总结' : '人工合并';
        const stage = kind === 'small' ? 'smallSummary' : 'manualMerge';
        this.setStatus(snapshot.chatKey, kind === 'large' ? 'large-summary' : 'small-summary', label);
        this.validate(snapshot);
        // [MA-UID-ONLY-GROUPS] 场景组只保存 UID。每次总结只权威读取一次当前世界书，再按组内 UID 直接取得最新正文。
        const authoritativeEntries = await this.worldbook.list(settings, snapshot, () => this.validate(snapshot));
        this.validate(snapshot);
        const smallDirectEntries = kind === 'small' ? timelineEntries(options.timeline, authoritativeEntries) : [];
        const largeGroups = kind === 'large' && Array.isArray(options.timelines) ? options.timelines.map((item) => normalizeEventTimeline(item)).filter(Boolean) : [];
        const largeDirectEntries = largeGroups.length
            ? [...new Map(largeGroups.flatMap((group) => timelineEntries(group, authoritativeEntries)).map((entry) => [String(entry.uid), structuredClone(entry)])).values()]
            : [];
        const sceneFolderSummary = (kind === 'small' && options.timeline) || (kind === 'large' && Array.isArray(options.timelines));
        const directSceneEntries = smallDirectEntries.length ? smallDirectEntries : largeDirectEntries;
        if (sceneFolderSummary && !directSceneEntries.length) throw new Error(`${label}场景组没有可处理的当前条目`);
        const entries = sceneFolderSummary ? directSceneEntries : authoritativeEntries;
        const cursor = this.host.cursor();
        const defaultMarks = kind === 'small'
            ? timelineUids(nextPendingSceneGroup(cursor.closedEventTimelines, false)).map((uid) => ({ uid }))
            : largeSummaryMarksFromGroups(pendingLargeSceneGroups(cursor));
        const requestedMarks = normalizeSummaryMarks(Array.isArray(options.marks) ? options.marks : defaultMarks);
        const entryByUid = new Map(entries.map((entry) => [String(entry.uid), entry]));
        const existingUids = new Set(entryByUid.keys());
        const stalePendingUids = requestedMarks.filter((mark) => !existingUids.has(mark.uid)).map((mark) => mark.uid);
        // [MA-SUMMARY-UID-MARK-04] 同一 UID 当前状态只总结一次：小总结只接收无 S/L 的状态；大总结只接收 S 状态；L 不重复大总结。
        // 正常提取再次改动该 UID 时写入层会清除旧标记，它会重新成为可总结材料。
        const eligibleMarks = requestedMarks.filter((mark) => {
            const entry = entryByUid.get(mark.uid);
            if (!entry) return false;
            if (kind === 'small') return entry.summaryMark !== 'S' && entry.summaryMark !== 'L';
            if (kind === 'large') return entry.summaryMark === 'S';
            return true;
        });
        const selected = summaryEntries(entries, eligibleMarks);
        const selectedPendingUids = selected.map((entry) => String(entry.uid));
        if (!selected.length) {
            const alreadyProcessed = requestedMarks.filter((mark) => {
                const entry = entryByUid.get(mark.uid);
                if (!entry) return false;
                return kind === 'small' ? (entry.summaryMark === 'S' || entry.summaryMark === 'L') : kind === 'large' ? entry.summaryMark === 'L' : false;
            }).map((mark) => mark.uid);
            if (alreadyProcessed.length) {
                return {
                    entries, changed: false, businessChanged: false, worldbookName: snapshot.worldbookName || '',
                    warehouse: { created: [], updated: [], deleted: [], createdCount: 0, updatedCount: 0, deletedCount: 0, operationCount: 0 },
                    businessChanges: [], receipt: null, processedPendingUids: alreadyProcessed, stalePendingUids, retiredSourceUids: [],
                    summaryOutputUids: [...new Set(alreadyProcessed)], summaryRetryUsed: false, summarySkippedAlreadyProcessed: true,
                };
            }
            throw new Error(`${label}当前没有待整理条目`);
        }

        const basePrompt = kind === 'merge'
            ? (0, prompts_1.manualMergePrompts)(settings, selected, {})
            : (0, prompts_1.summaryPrompts)(kind, settings, selected, '', '', {});
        const sourceContext = selected.map((entry, index) => `【条目${index + 1}】\n${entry.title}\n${entry.content}`).join('\n\n');
        const responseTokens = (0, model_request_1.stageResponseTokens)(stage, settings, sourceContext);
        const previousFailureReason = String(options.previousFailureReason || '').trim();
        let parsed = null;
        let raw = '';
        let retryUsed = false;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const reason = attempt === 0 ? previousFailureReason : String(parsed?.error || '上一次返回格式不完整').trim();
            const prompt = reason ? {
                system: `${basePrompt.system}\n\n【上一次失败原因】\n${reason.slice(0, 1200)}\n请根据同一批原始条目重新输出完整最终条目。`,
                user: basePrompt.user,
            } : basePrompt;
            try {
                raw = await (0, model_request_1.callModel)({
                    host: this.host,
                    stage,
                    prompt,
                    fallbackPrompt: prompt,
                    settings,
                    snapshot,
                    profileId: settings.modelProfileId,
                    sourceText: sourceContext,
                    responseTokens,
                    singleAttempt: true,
                    generationOptions: attempt > 0 && settings.modelProfileId ? { includePreset: false } : undefined,
                });
            } catch (error) {
                const requestReason = error?.code === 'MA_REASONING_ONLY'
                    ? '上一次只有推理，没有最终条目'
                    : error?.code === 'MA_EMPTY_MODEL_RESPONSE'
                        ? '上一次最终文本为空'
                        : (0, util_1.errorText)(error);
                parsed = { error: requestReason };
                if (attempt === 1) throw error;
                retryUsed = true;
                continue;
            }
            this.validate(snapshot);
            parsed = parseWholeEntrySummaryProtocol(raw, selected);
            if (!parsed.error) break;
            if (attempt === 0) retryUsed = true;
        }
        if (!parsed || parsed.error) throw new Error(`${label}连续两次未返回可执行的完整条目：${parsed?.error || '未知格式错误'}`);

        const plan = wholeEntrySummaryPlan(parsed, selected, kind === 'small' || kind === 'large');
        this.setStatus(snapshot.chatKey, kind === 'large' ? 'large-summary' : 'small-summary', `${label}写入中`, '', raw, plan);
        const applyOptions = {
            sourceKind: kind === 'merge' ? 'manual-merge' : 'summary',
            rebalanceKind: kind === 'merge' ? '' : kind,
            manualAuthorizedUids: kind === 'merge' ? selectedPendingUids : [],
            summaryText: `${label}完整条目整理`,
        };
        const applied = await this.apply(settings, plan, snapshot, sourceContext, label, raw, applyOptions);
        const createdUids = (applied?.businessChanges ?? []).filter((item) => item?.action === 'create').map((item) => String(item.uid || '')).filter(Boolean);
        const deletedUids = (applied?.businessChanges ?? []).filter((item) => item?.action === 'delete').map((item) => String(item.uid || '')).filter(Boolean);
        const retainedUids = parsed.entries.filter((item) => item.kind === 'existing').map((item) => selected[item.sourceIndex]?.uid).filter(Boolean).map(String);
        applied.processedPendingUids = selectedPendingUids;
        applied.stalePendingUids = stalePendingUids;
        applied.retiredSourceUids = deletedUids;
        applied.summaryOutputUids = [...new Set([...retainedUids.filter((uid) => !deletedUids.includes(uid)), ...createdUids])];
        applied.summaryRetryUsed = retryUsed;
        return applied;
    }


    // [MA-LARGE-GROUP] 大总结从当前大组集里的若干个已完成小总结继续向上抽象；正式写回只允许基础设定。
    // 基石锁由玩家手动治理，不自动进入大总结；成功后来源 S UID 在同一世界书事务中统一改成 L。
    async summarizeLargeGroup(settings, snapshot, options = {}) {
        const label = '大总结';
        const stage = 'largeSummary';
        this.setStatus(snapshot.chatKey, 'large-summary', label);
        this.validate(snapshot);

        const authoritativeEntries = await this.worldbook.list(settings, snapshot, () => this.validate(snapshot));
        this.validate(snapshot);
        const cursor = this.host.cursor();
        const requestedMarks = normalizeSummaryMarks(Array.isArray(options.marks)
            ? options.marks
            : largeSummaryMarksFromGroups(pendingLargeSceneGroups(cursor)));

        let sourceSceneGroups = [];
        if (options.largeGroup && typeof options.largeGroup === 'object') {
            sourceSceneGroups = (Array.isArray(options.largeGroup.sceneGroups) ? options.largeGroup.sceneGroups : [])
                .map((group) => normalizeEventTimeline(group, 'pending')).filter(Boolean);
        } else if (Array.isArray(options.timelines)) {
            sourceSceneGroups = options.timelines.map((group) => normalizeEventTimeline(group, 'pending')).filter(Boolean);
        }

        const groupEntries = [...new Map(sourceSceneGroups
            .flatMap((group) => timelineEntries(group, authoritativeEntries))
            .map((entry) => [String(entry?.uid ?? ''), structuredClone(entry)])
            .filter(([uid]) => uid)).values()];
        const groupEntryByUid = new Map(groupEntries.map((entry) => [String(entry.uid), entry]));
        const authoritativeByUid = new Map(authoritativeEntries.map((entry) => [String(entry.uid), entry]));

        // 自动/立即大总结直接使用大组集里的 S 场景组 UID；手动选中大总结仍只使用玩家选中的当前 S UID。
        const sourceEntries = requestedMarks.map((mark) => groupEntryByUid.get(mark.uid) ?? authoritativeByUid.get(mark.uid))
            .filter((entry) => entry && entry.summaryMark === 'S');
        const sourceUidSet = new Set(sourceEntries.map((entry) => String(entry.uid)));
        const stalePendingUids = requestedMarks.filter((mark) => !sourceUidSet.has(mark.uid)).map((mark) => mark.uid);
        if (!sourceEntries.length) {
            const alreadyLarge = requestedMarks.filter((mark) => authoritativeByUid.get(mark.uid)?.summaryMark === 'L').map((mark) => mark.uid);
            if (alreadyLarge.length) {
                return {
                    entries: authoritativeEntries, changed: false, businessChanged: false, worldbookName: snapshot.worldbookName || '',
                    warehouse: { created: [], updated: [], deleted: [], createdCount: 0, updatedCount: 0, deletedCount: 0, operationCount: 0 },
                    businessChanges: [], receipt: null, processedPendingUids: alreadyLarge, stalePendingUids,
                    retiredSourceUids: [], summaryOutputUids: [], summaryRetryUsed: false, summarySkippedAlreadyProcessed: true,
                };
            }
            throw new Error('大总结当前没有可处理的 S 场景条目');
        }

        const baseLargeGroup = options.largeGroup && typeof options.largeGroup === 'object'
            ? options.largeGroup
            : { sceneGroups: sourceSceneGroups };
        const largeGroup = refreshLargeSummaryGroupReferences(baseLargeGroup, authoritativeEntries);
        largeGroup.sceneGroups = sourceSceneGroups.length
            ? sourceSceneGroups.map((group) => structuredClone(group))
            : [{
                id: `SG-MANUAL-${Date.now().toString(36)}`,
                groupUid: `SG-MANUAL-${Date.now().toString(36)}`,
                sceneGroup: '手动选中',
                sceneTitle: '手动选中',
                memberUids: sourceEntries.map((entry) => String(entry.uid)),
                summaryStatus: 'pending',
                openedAtMessageKey: '',
                closedAtMessageKey: '',
            }];

        // 大总结只改写基础设定；S 小总结组只做向上抽象材料。基石锁不自动进入本次大总结。
        const authoritativeByUidForLarge = new Map(authoritativeEntries.map((entry) => [String(entry.uid), entry]));
        const foundationEntries = largeGroup.foundationUids.map((uid) => authoritativeByUidForLarge.get(String(uid))).filter((entry) => entry && String(entry.type ?? '') === '基础设定').map((entry) => structuredClone(entry));
        const promptLargeGroup = {
            ...largeGroup,
            sceneGroups: largeGroup.sceneGroups.map((group) => ({ ...group, memberEntries: timelineEntries(group, authoritativeEntries) })),
        };
        const basePrompt = (0, prompts_1.summaryPrompts)('large', settings, foundationEntries, '', '', { largeGroup: promptLargeGroup });
        const sourceContext = [
            ...foundationEntries.map((entry, index) => `【基础设定条目${index + 1}】\n${entry.title}\n${entry.content}`),
            ...largeGroup.sceneGroups.flatMap((group, index) => [
                `【小总结组${index + 1}】${group.sceneTitle || group.sceneGroup || group.groupUid || ''}`,
                ...timelineEntries(group, authoritativeEntries).map((entry) => `${entry.title}\n${entry.content}`),
            ]),
        ].join('\n\n');
        const responseTokens = (0, model_request_1.stageResponseTokens)(stage, settings, sourceContext);

        let parsed = null;
        let raw = '';
        let retryUsed = false;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const reason = attempt === 0 ? '' : String(parsed?.error || '上一次返回格式不完整').trim();
            const prompt = reason ? {
                system: `${basePrompt.system}\n\n【上一次失败原因】\n${reason.slice(0, 1200)}\n请重新根据同一个大组集输出基础设定最终协议。`,
                user: basePrompt.user,
            } : basePrompt;
            try {
                raw = await (0, model_request_1.callModel)({
                    host: this.host,
                    stage,
                    prompt,
                    fallbackPrompt: prompt,
                    settings,
                    snapshot,
                    profileId: settings.modelProfileId,
                    sourceText: sourceContext,
                    responseTokens,
                    singleAttempt: true,
                    generationOptions: attempt > 0 && settings.modelProfileId ? { includePreset: false } : undefined,
                });
            } catch (error) {
                const requestReason = error?.code === 'MA_REASONING_ONLY'
                    ? '上一次只有推理，没有最终基础设定条目'
                    : error?.code === 'MA_EMPTY_MODEL_RESPONSE'
                        ? '上一次最终文本为空'
                        : (0, util_1.errorText)(error);
                parsed = { error: requestReason };
                if (attempt === 1) throw error;
                retryUsed = true;
                continue;
            }
            this.validate(snapshot);
            parsed = parseWholeEntrySummaryProtocol(raw, foundationEntries);
            if (!parsed.error) {
                const invalid = (parsed.entries ?? []).find((item) => String(item?.type ?? '') !== '基础设定');
                if (invalid) parsed = { entries: [], error: `大总结正式产物只允许“基础设定”，不能输出“${invalid.type || '未知类型'}”` };
            }
            if (!parsed.error) break;
            if (attempt === 0) retryUsed = true;
        }
        if (!parsed || parsed.error) throw new Error(`大总结连续两次未返回可执行的基础设定：${parsed?.error || '未知格式错误'}`);

        const plan = wholeEntrySummaryPlan(parsed, foundationEntries, true);
        this.setStatus(snapshot.chatKey, 'large-summary', '大总结写入基础设定', '', raw, plan);
        const applyOptions = {
            sourceKind: 'summary',
            rebalanceKind: 'large',
            manualAuthorizedUids: [],
            summaryText: '大总结：S 场景组抽象为基础设定',
            largeSummarySourceUids: [...sourceUidSet],
        };
        const applied = await this.apply(settings, plan, snapshot, sourceContext, label, raw, applyOptions);
        const createdUids = (applied?.businessChanges ?? []).filter((item) => item?.action === 'create').map((item) => String(item.uid || '')).filter(Boolean);
        const deletedUids = (applied?.businessChanges ?? []).filter((item) => item?.action === 'delete').map((item) => String(item.uid || '')).filter(Boolean);
        const retainedUids = parsed.entries.filter((item) => item.kind === 'existing')
            .map((item) => foundationEntries[item.sourceIndex]?.uid).filter(Boolean).map(String);

        applied.processedPendingUids = [...sourceUidSet];
        applied.stalePendingUids = stalePendingUids;
        applied.retiredSourceUids = deletedUids;
        applied.summaryOutputUids = [...new Set([...retainedUids.filter((uid) => !deletedUids.includes(uid)), ...createdUids])];
        applied.summaryRetryUsed = retryUsed;
        return applied;
    }

    async mergeSelected(settings, snapshot, selectedUids) {
        const selectedIds = [...new Set((selectedUids ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean))];
        if (selectedIds.length < 2) throw new Error('人工合并至少需要两个条目');
        summaryNotify('info', `镜渊：开始人工合并（${selectedIds.length}个条目）`);
        const result = await this.summarize('merge', settings, snapshot, { marks: selectedIds.map((uid) => ({ uid })), manualSelection: true });
        const writes = Number(result?.warehouse?.createdCount || 0) + Number(result?.warehouse?.updatedCount || 0);
        const deleted = Number(result?.warehouse?.deletedCount || 0);
        this.setStatus(snapshot.chatKey, 'complete', `人工合并完成：写入${writes}，删除${deleted}`);
        summaryNotify('success', `镜渊：人工合并完成（写入${writes}，删除${deleted}）`);
        return result;
    }

    async apply(settings, plan, snapshot, contextText, label, raw, options = {}) {
        this.setStatus(snapshot.chatKey, 'matching', `${label}生成确定性操作计划`, '', raw, plan);
        if (!plan.operations.some((operation) => operation.kind !== 'noop')) return {
            entries: [], changed: false, businessChanged: false,
            worldbookName: snapshot.worldbookName || '',
            warehouse: { created: [], updated: [], deleted: [], createdCount: 0, updatedCount: 0, deletedCount: 0, operationCount: 0 },
        };
        this.setStatus(snapshot.chatKey, 'worldbook', `${label}写入世界书`, '', raw, plan);
        this.validate(snapshot);
        const focusUid = typeof this.host.getFocusUid === 'function' ? this.host.getFocusUid() : '';
        const previousCursor = typeof this.host.cursor === 'function' ? this.host.cursor() : null;
        let entries = null;
        try {
            entries = await this.worldbook.apply(
                settings, plan, snapshot.messageKey, contextText, focusUid, snapshot,
                () => this.validate(snapshot),
                { sourceKind: label === '提取' ? 'extraction' : 'summary', ...options },
            );
            // [MA-TURN-UID-ROLLBACK] worldbook.apply 一旦返回，说明世界书已经正式提交并生成 UID 前态 receipt。
            // 先保存回滚记录，再检查源正文是否刚好被撤回；这样被打断也不会留下“已写入但没有回滚依据”的孤儿写入。
            if (entries.receipt && typeof this.host.appendCommitReceipt === 'function') {
                entries.receipt.stateBefore = { cursor: structuredClone(previousCursor) };
                await this.host.appendCommitReceipt(entries.receipt);
                if (typeof this.host.appendTurnRollbackSnapshot === 'function') await this.host.appendTurnRollbackSnapshot(entries.receipt, 20);
            }
            this.validate(snapshot);
        } catch (error) {
            if (entries?.receipt?.changes?.length) {
                let detached = false;
                try { detached = typeof this.host.chatKey === 'function' ? this.host.chatKey() !== snapshot.chatKey : false; } catch { detached = true; }
                const recoverySnapshot = detached ? snapshot : this.recoverySnapshotForRollback(settings, snapshot, 'interrupted-write-rollback');
                try {
                    await this.worldbook.rollbackReceipts(settings, [entries.receipt], detached ? '' : focusUid, recoverySnapshot, detached ? null : () => this.validate(recoverySnapshot), { detached });
                    const receiptId = String(entries.receipt.id ?? '');
                    if (!detached && receiptId && typeof this.host.removeCommitReceipts === 'function') await this.host.removeCommitReceipts([receiptId]);
                    if (!detached && receiptId && typeof this.host.removeTurnRollbackContributions === 'function') await this.host.removeTurnRollbackContributions([receiptId]);
                    if (detached && typeof this.host.restoreTransactionMetadataForSnapshot === 'function') await this.host.restoreTransactionMetadataForSnapshot(snapshot);
                } catch (rollbackError) {
                    throw new Error(`${label}被打断或提交记录保存失败，且本次 UID 前态恢复失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackError)}`);
                }
                throw new Error(`${label}被打断或提交记录保存失败，本次涉及 UID 已恢复到修改前：${(0, util_1.errorText)(error)}`);
            }
            throw error;
        }
        return {
            entries,
            changed: entries.changed === true,
            businessChanged: entries.businessChanged === true,
            worldbookName: entries.worldbookName || snapshot.worldbookName || '',
            warehouse: entries.warehouse ?? { created: [], updated: [], deleted: [], createdCount: 0, updatedCount: 0, deletedCount: 0, operationCount: 0 },
            businessChanges: Array.isArray(entries.businessChanges) ? entries.businessChanges : [],
            receipt: entries.receipt ?? null,
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
    entries.businessChanges = Array.isArray(result?.businessChanges) ? result.businessChanges : [];
    entries.criticalChanges = Number(result?.criticalChanges || 0);
    return entries;
}


function extractionPointsFromBlocks(blocks, entries, businessChanges = []) {
    if (!Array.isArray(entries)) throw new TypeError('extractionPointsFromBlocks: entries 必须是世界书条目数组');
    const byTitle = new Map(entries.map((entry) => [(0, util_1.normalizeTitle)(entry.title), entry]));
    const byName = new Map();
    for (const entry of entries ?? []) {
        const key = (0, util_1.normalizeFact)(entry.name || '');
        if (key && !byName.has(key)) byName.set(key, []);
        if (key) byName.get(key).push(entry);
    }
    // Timeline 只接收“模型语义 + 最终成功提交宿主”的交集：模型决定建立/变化/结束与关联对象，
    // 插件只验证该宿主确实进入本次权威 commit，并把稳定名称精确映射成 UID。
    const committedUids = new Set((businessChanges ?? []).map((change) => String(change?.uid ?? '')).filter(Boolean));
    const points = [];
    for (const block of blocks ?? []) {
        const entry = byTitle.get((0, util_1.normalizeTitle)(block.title));
        if (!entry || !committedUids.has(String(entry.uid))) continue;
        for (const row of Array.isArray(block.factRows) ? block.factRows : []) {
            const fact = String(row?.fact ?? '').trim();
            const change = String(row?.change ?? '').trim();
            if (!fact || !/^(?:建立|变化|结束)$/u.test(change)) continue;
            // [MA-GRANULARITY-LADDER][提取栏目契约] Timeline 使用提取模型明确给出的栏目，不再把所有非事件回退到【固定事实】。
            const section = String(row?.section ?? '').trim();
            if (!section) continue;
            const committedLines = entry.sections?.values?.[section] ?? [];
            if (!committedLines.some((line) => (0, util_1.normalizeFact)(line) === (0, util_1.normalizeFact)(fact))) continue;
            const relatedUids = [];
            for (const name of row?.relations ?? []) {
                const matches = byName.get((0, util_1.normalizeFact)(name)) ?? [];
                if (matches.length === 1) relatedUids.push(String(matches[0].uid));
            }
            points.push({
                uid: String(entry.uid),
                section,
                factHash: (0, util_1.hashText)((0, util_1.normalizeFact)(fact)),
                change,
                relatedUids: (0, util_1.unique)(relatedUids.filter((uid) => uid && uid !== String(entry.uid))),
            });
        }
    }
    return points;
}

function normalizeEventTimeline(value, defaultStatus = 'pending') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const memberUids = [...new Set((Array.isArray(value.memberUids) ? value.memberUids : [])
        .map((uid) => String(uid ?? '').trim()).filter(Boolean))];
    const sceneGroup = String(value.sceneGroup ?? '').trim();
    const sceneTitle = String(value.sceneTitle ?? '').trim();
    const groupUid = String(value.groupUid ?? value.id ?? '').trim();
    if (!groupUid && !sceneGroup && !sceneTitle && !memberUids.length) return null;
    const rawStatus = String(value.summaryStatus ?? '').trim();
    const summaryStatus = /^(?:active|pending|failed)$/u.test(rawStatus) ? rawStatus : defaultStatus;
    return {
        id: groupUid,
        groupUid,
        sceneGroup,
        sceneTitle,
        memberUids,
        summaryStatus,
        openedAtMessageKey: String(value.openedAtMessageKey ?? ''),
        closedAtMessageKey: String(value.closedAtMessageKey ?? ''),
        failedAt: Math.max(0, Number(value.failedAt || 0)),
        summaryError: String(value.summaryError ?? '').trim().slice(0, 800),
    };
}
// [MA-UID-ONLY-GROUPS] 场景组只保存 UID；需要正文时从本次世界书权威回读建立的 UID 索引直接取得。
function timelineEntries(timeline, referenceEntries = []) {
    const normalized = normalizeEventTimeline(timeline);
    if (!normalized) return [];
    const byUid = new Map((Array.isArray(referenceEntries) ? referenceEntries : [])
        .map((entry) => [String(entry?.uid ?? '').trim(), entry]).filter(([uid]) => uid));
    return normalized.memberUids.map((uid) => byUid.get(uid)).filter(Boolean).map((entry) => structuredClone(entry));
}
function timelineUids(timeline) {
    const normalized = normalizeEventTimeline(timeline);
    return normalized ? [...normalized.memberUids] : [];
}
// [MA-UID-ONLY-GROUPS] 正常写入只维护当前场景组的 UID 归属，不复制世界书正文。
function appendSceneGroupMembers(timeline, rootResult, snapshot) {
    const base = normalizeEventTimeline(timeline, 'active') ?? {
        id: `SG-${(0, util_1.hashText)(`${snapshot.chatKey}|${rootResult?.currentSceneGroup || rootResult?.currentSceneTitle || 'scene'}|${snapshot.messageKey}`).slice(0, 10)}`,
        groupUid: `SG-${(0, util_1.hashText)(`${snapshot.chatKey}|${rootResult?.currentSceneGroup || rootResult?.currentSceneTitle || 'scene'}|${snapshot.messageKey}`).slice(0, 10)}`,
        sceneGroup: String(rootResult?.currentSceneGroup ?? ''),
        sceneTitle: String(rootResult?.currentSceneTitle ?? ''),
        memberUids: [],
        summaryStatus: 'active',
        openedAtMessageKey: String(snapshot.messageKey ?? ''),
        closedAtMessageKey: '',
    };
    base.summaryStatus = 'active';
    base.sceneGroup ||= String(rootResult?.currentSceneGroup ?? '');
    base.sceneTitle ||= String(rootResult?.currentSceneTitle ?? '');
    const members = new Set(base.memberUids ?? []);
    for (const change of Array.isArray(rootResult?.businessChanges) ? rootResult.businessChanges : []) {
        const uid = String(change?.uid ?? '').trim();
        if (!uid) continue;
        if (change?.action === 'delete') members.delete(uid);
        else if (change?.action === 'create' || change?.action === 'update') members.add(uid);
    }
    base.memberUids = [...members];
    return base;
}
function nextPendingSceneGroup(closedTimelines = [], includeFailed = false) {
    for (const raw of Array.isArray(closedTimelines) ? closedTimelines : []) {
        const timeline = normalizeEventTimeline(raw, 'pending');
        if (!timeline || !timelineUids(timeline).length) continue;
        if (timeline.summaryStatus === 'pending' || (includeFailed && timeline.summaryStatus === 'failed')) return timeline;
    }
    return null;
}


// [MA-LARGE-GROUP] 当前大组集是大总结唯一运行容器：基础设定 + 已完成小总结的组集；基石锁记录保留在组内但不自动进入大总结提示词。
function normalizeLargeSummaryGroup(value, referenceEntries = null) {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    let bedrockUids = [...new Set((raw.bedrockUids ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean))];
    let foundationUids = [...new Set((raw.foundationUids ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean))];
    if (Array.isArray(referenceEntries)) {
        bedrockUids = [];
        foundationUids = [];
        for (const entry of referenceEntries) {
            const uid = String(entry?.uid ?? '').trim();
            if (!uid) continue;
            if (entry.bedrockLocked === true || entry.locked === true) { bedrockUids.push(uid); continue; }
            if (String(entry.type ?? '').trim() === '基础设定') foundationUids.push(uid);
        }
        bedrockUids = [...new Set(bedrockUids)];
        foundationUids = [...new Set(foundationUids)];
    }
    const bedrockSet = new Set(bedrockUids);
    foundationUids = foundationUids.filter((uid) => !bedrockSet.has(uid));
    const sceneGroups = (Array.isArray(raw.sceneGroups) ? raw.sceneGroups : [])
        .map((timeline) => normalizeEventTimeline(timeline, 'pending'))
        .filter((timeline) => timeline?.memberUids?.length);
    const id = String(raw.groupUid ?? raw.id ?? '').trim() || `LG-${Date.now().toString(36)}`;
    return { id, groupUid: id, foundationUids, bedrockUids, sceneGroups, openedAt: Math.max(0, Number(raw.openedAt || Date.now())) };
}
function pendingLargeSceneGroups(cursor) { return normalizeLargeSummaryGroup(cursor?.activeLargeSummaryGroup).sceneGroups; }
function refreshLargeSummaryGroupReferences(group, entries) { return normalizeLargeSummaryGroup(group, Array.isArray(entries) ? entries : []); }
function largeSummaryMarksFromGroups(groups) {
    return normalizeSummaryMarks([...new Set((groups ?? [])
        .flatMap((timeline) => timelineUids(timeline))
        .map(String).filter(Boolean))]
        .map((uid) => ({ uid })));
}
// [MA-SUMMARY-COUNTER] 小总结成功后只保留其输出 UID 归属；大总结请求前再从当前世界书按 UID 读取最新正文。
function summarizedSceneGroupFolder(timeline, outputUids = []) {
    const normalized = normalizeEventTimeline(timeline, 'pending');
    if (!normalized) return null;
    const memberUids = [...new Set((outputUids ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean))];
    return {
        id: normalized.groupUid || normalized.id,
        groupUid: normalized.groupUid || normalized.id,
        sceneGroup: normalized.sceneGroup,
        sceneTitle: normalized.sceneTitle,
        memberUids,
        openedAtMessageKey: normalized.openedAtMessageKey,
        closedAtMessageKey: normalized.closedAtMessageKey,
    };
}
function invalidateAccumulatedSummaryUids(groups, changedUids = []) {
    const changed = new Set((changedUids ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean));
    if (!changed.size) return (groups ?? []).map((group) => structuredClone(group));
    const output = [];
    for (const raw of groups ?? []) {
        const normalized = normalizeEventTimeline(raw, 'pending');
        if (!normalized) continue;
        const memberUids = normalized.memberUids.filter((uid) => !changed.has(uid));
        if (!memberUids.length) continue;
        output.push({
            id: normalized.groupUid || normalized.id,
            groupUid: normalized.groupUid || normalized.id,
            sceneGroup: normalized.sceneGroup,
            sceneTitle: normalized.sceneTitle,
            memberUids,
            openedAtMessageKey: normalized.openedAtMessageKey,
            closedAtMessageKey: normalized.closedAtMessageKey,
        });
    }
    return output;
}
function reconcileCursorSceneUids(cursor, removedUids = [], replacementUids = []) {
    const removed = new Set((removedUids ?? []).map((uid) => String(uid ?? '').trim()).filter(Boolean));
    if (!removed.size) return { ...cursor };
    const cleanTimeline = (raw, status) => {
        const timeline = normalizeEventTimeline(raw, status);
        if (!timeline) return null;
        const memberUids = timeline.memberUids.filter((uid) => !removed.has(uid));
        if (!memberUids.length) return null;
        return normalizeEventTimeline({ ...timeline, memberUids }, status);
    };
    const nextActive = cleanTimeline(cursor?.activeEventTimeline, 'active');
    const nextClosed = (cursor?.closedEventTimelines ?? []).map((raw) => cleanTimeline(raw, 'pending')).filter(Boolean);
    const largeGroup = normalizeLargeSummaryGroup(cursor?.activeLargeSummaryGroup);
    const sceneGroups = invalidateAccumulatedSummaryUids(largeGroup.sceneGroups, [...removed]);
    const foundationUids = largeGroup.foundationUids.filter((uid) => !removed.has(uid));
    const bedrockUids = largeGroup.bedrockUids.filter((uid) => !removed.has(uid));
    return {
        ...cursor,
        activeEventTimeline: nextActive,
        closedEventTimelines: nextClosed,
        activeLargeSummaryGroup: { ...largeGroup, foundationUids, bedrockUids, sceneGroups },
        smallSummarySceneCounter: sceneGroups.length,
    };
}


function summaryMarkKey(mark) { return String(typeof mark === 'string' ? mark : mark?.uid ?? '').trim(); }
function normalizeSummaryMarks(value) {
    const output = new Map();
    for (const item of Array.isArray(value) ? value : []) {
        const uid = summaryMarkKey(item);
        if (uid) output.set(uid, { uid });
    }
    return [...output.values()];
}
function summaryMarksFromResult(result) {
    const existing = new Set((result?.entries ?? []).map((entry) => String(entry?.uid ?? '').trim()).filter(Boolean));
    const changed = new Set();
    for (const change of Array.isArray(result?.businessChanges) ? result.businessChanges : []) {
        const uid = String(change?.uid ?? '').trim();
        if (uid && existing.has(uid)) changed.add(uid);
    }
    if (!changed.size) {
        for (const change of result?.receipt?.changes ?? []) {
            const uid = String(change?.uid ?? '').trim();
            if (uid && existing.has(uid)) changed.add(uid);
        }
    }
    return [...changed].map((uid) => ({ uid }));
}
// [MA-SUMMARY-LINEAGE] 模型不接触 UID。系统只根据提交后仍存在的来源 UID 与本次真实创建/更新 UID 计算下一层材料。
function summaryOutputUidsFromResult(result, selectedSourceUids = []) {
    const postEntries = Array.isArray(result?.entries) ? result.entries : [];
    const existing = new Set(postEntries.map((entry) => String(entry?.uid ?? '').trim()).filter(Boolean));
    const output = new Set();
    for (const uid of selectedSourceUids ?? []) {
        const key = String(uid ?? '').trim();
        if (key && existing.has(key)) output.add(key);
    }
    for (const mark of summaryMarksFromResult(result)) if (existing.has(mark.uid)) output.add(mark.uid);
    return [...output];
}
// [MA-SUMMARY-WHOLE-ENTRY][冻结] 小/大总结只使用本次请求的临时“条目N”编号，模型看不到真实 UID。
// 返回的原条目按系统内部映射更新；未返回的原条目删除；“新条目N”由系统创建新 UID。
function parseWholeEntrySummaryProtocol(raw, selectedEntries = []) {
    const source = (0, parser_1.sanitizeModelText)(raw).replace(/\r/g, '').trim();
    if (!source) return { entries: [], error: '模型没有返回最终条目' };
    const lines = source.split('\n');
    const output = [];
    const seenExisting = new Set();
    const seenNew = new Set();
    const allowedTypes = new Set(protocols_1.SUMMARY_TYPES);
    for (let index = 0; index < lines.length;) {
        const line = String(lines[index] ?? '').trim();
        if (!line) { index += 1; continue; }
        const header = line.match(/^(条目|新条目)(\d+)｜([^｜]+)｜(.+)$/u);
        if (!header) return { entries: [], error: `无法识别的总结行：${line.slice(0, 160)}` };
        const kind = header[1] === '新条目' ? 'new' : 'existing';
        const number = Number(header[2]);
        const type = header[3].trim();
        const name = header[4].trim();
        if (!Number.isInteger(number) || number <= 0) return { entries: [], error: `临时条目编号不合法：${header[2]}` };
        if (kind === 'existing') {
            if (number > selectedEntries.length) return { entries: [], error: `条目${number}不属于本批输入` };
            if (seenExisting.has(number)) return { entries: [], error: `条目${number}重复返回` };
            seenExisting.add(number);
        } else {
            if (seenNew.has(number)) return { entries: [], error: `新条目${number}重复返回` };
            seenNew.add(number);
        }
        if (!allowedTypes.has(type)) return { entries: [], error: `${kind === 'new' ? '新条目' : '条目'}${number}的类型“${type}”不合法` };
        if (!name) return { entries: [], error: `${kind === 'new' ? '新条目' : '条目'}${number}缺少稳定名称` };
        index += 1;
        const body = [];
        while (index < lines.length && String(lines[index] ?? '').trim() !== '结束条目') {
            body.push(lines[index]); index += 1;
        }
        if (index >= lines.length) return { entries: [], error: `${kind === 'new' ? '新条目' : '条目'}${number}缺少“结束条目”` };
        index += 1;
        const parsed = (0, parser_1.parseEntrySections)(body.join('\n'));
        const allowedSections = new Set(information_point_1.TYPE_SECTION_ORDER[type] ?? []);
        const order = [];
        const values = {};
        for (const rawSection of parsed.order ?? []) {
            const section = (0, information_point_1.canonicalSectionName)(rawSection, type);
            if (!section || !allowedSections.has(section)) return { entries: [], error: `${kind === 'new' ? '新条目' : '条目'}${number}的栏目“${rawSection}”不属于${type}` };
            if (!values[section]) { values[section] = []; order.push(section); }
            for (const rawFact of parsed.values?.[rawSection] ?? []) {
                const fact = (0, parser_1.sanitizeWorldbookLine)(rawFact);
                if (fact) values[section].push(fact);
            }
            values[section] = (0, util_1.unique)(values[section]);
        }
        const content = (0, parser_1.serializeEntrySections)({ order, values }).trim();
        if (!content) return { entries: [], error: `${kind === 'new' ? '新条目' : '条目'}${number}没有完整最终正文` };
        output.push({ kind, number, sourceIndex: kind === 'existing' ? number - 1 : -1, type, name, title: `${type}｜${name}`, content });
    }
    if (!output.length) return { entries: [], error: '模型没有返回任何完整最终条目' };
    return { entries: output, error: '' };
}

function wholeEntrySummaryPlan(parsed, entries, touchReturned = false) {
    const operations = [];
    const returnedSourceIndexes = new Set();
    for (const item of parsed.entries ?? []) {
        if (item.kind === 'existing') {
            const current = entries[item.sourceIndex];
            if (!current) continue;
            returnedSourceIndexes.add(item.sourceIndex);
            if (current.bedrockLocked === true) continue;
            const sameTitle = (0, util_1.normalizeTitle)(current.title) === (0, util_1.normalizeTitle)(item.title);
            const sameContent = String(current.content ?? '').trim() === String(item.content ?? '').trim();
            if (sameTitle && sameContent && !touchReturned) continue;
            operations.push({
                id: `replace-entry:${current.uid}:${(0, util_1.hashText)(`${item.title}|${item.content}|${touchReturned ? 'summary-touch' : 'content'}`)}`,
                kind: 'replace-entry', operation: 'replace-entry', targetUid: String(current.uid), title: item.title,
                oldValue: current.content, newValue: item.content, reason: sameTitle && sameContent ? '总结已处理该 UID，仅写入 S/L 处理标记' : '模型返回该临时条目的完整最终内容',
            });
            continue;
        }
        operations.push({ id: `create-entry:${item.number}:${(0, util_1.hashText)(item.title)}`, kind: 'create-entry', operation: 'create', title: item.title, reason: '模型明确返回新条目' });
        operations.push({ id: `replace-entry:new:${item.number}:${(0, util_1.hashText)(item.content)}`, kind: 'replace-entry', operation: 'replace-entry', title: item.title, newValue: item.content, reason: '写入模型返回的新条目完整正文' });
    }
    for (let index = 0; index < (entries ?? []).length; index += 1) {
        if (returnedSourceIndexes.has(index)) continue;
        const current = entries[index];
        if (!current || current.bedrockLocked === true) continue;
        operations.push({ id: `delete-entry:${current.uid}`, kind: 'delete-entry', operation: 'delete', targetUid: String(current.uid), title: current.title, reason: '模型未返回该临时条目，本批最终状态中删除' });
    }
    return { blocks: [], operations, createdAt: Date.now() };
}


function summaryEntries(entries, marks = []) {
    const wanted = new Set(normalizeSummaryMarks(marks).map((mark) => mark.uid));
    const uidSort = (left, right) => {
        const a = String(left.uid ?? '');
        const b = String(right.uid ?? '');
        const an = Number(a), bn = Number(b);
        if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
        return a.localeCompare(b, 'en');
    };
    return (entries ?? [])
        .filter((entry) => wanted.has(String(entry.uid)))
        .sort((left, right) => Number(left.updatedAt || 0) - Number(right.updatedAt || 0) || uidSort(left, right));
}


function emptyPlan() { return { blocks: [], operations: [], createdAt: Date.now() }; }


function safeChatKey(host) { try { return host.chatKey(); } catch { return ''; } }

},"migration":function(module,exports,require){
/**
 * Mirror Abyss — whole-worldbook organizer
 * 玩家显式维护时：整本世界书一次交给模型，按信息归属与颗粒度重新整理。
 * UID 永远只在系统内部；模型只看临时“条目N”。
 */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationService = void 0;

const util_1 = require("./util");
const parser_1 = require("./parser");
const protocols_1 = require("./protocols");
const information_point_1 = require("./domain/information-point");
const model_request_1 = require("./model-request");

class MigrationService {
    constructor(host, worldbook, getSettings, onProgress = null, saveSettings = null) {
        this.host = host;
        this.worldbook = worldbook;
        this.getSettings = getSettings;
        this.onProgress = typeof onProgress === 'function' ? onProgress : () => {};
        this.saveSettings = typeof saveSettings === 'function' ? saveSettings : null;
        this.preview = null;
        this.backup = null;
    }
    scopeChatKey() { try { return this.host.chatKey(); } catch { return ''; } }
    canUndo() { return Boolean(this.backup && this.backup.chatKey === this.scopeChatKey()); }
    hasPreview() { return Boolean(this.preview && this.preview.chatKey === this.scopeChatKey()); }
    clearPreview() { this.preview = null; return true; }
    previewSummary() { return this.hasPreview() ? (0, util_1.clone)(this.preview.summary) : null; }
    emitProgress(progress) { try { this.onProgress({ ...(progress || {}) }); } catch {} }

    async migrate(settings, snapshot) {
        const validate = () => this.host.assertSnapshot(snapshot, this.getSettings());
        validate();
        const original = await this.worldbook.readRaw(settings, snapshot, validate);
        const listed = await this.worldbook.list(settings, snapshot, validate);
        const entries = sortEntries(listed);
        if (!entries.length) {
            this.preview = null;
            return { changed: false, previewReady: false, message: '当前世界书为空', candidates: 0 };
        }
        this.emitProgress({ state: 'running', current: 0, total: 1, detail: `正在把整本世界书（${entries.length}条）交给模型整理` });
        let parsed = null;
        let raw = '';
        let failure = '';
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const prompt = wholeBookPrompt(settings, entries, attempt === 1 ? failure : '');
            try {
                raw = await (0, model_request_1.callModel)({
                    host: this.host,
                    stage: 'migration',
                    prompt,
                    fallbackPrompt: prompt,
                    settings,
                    snapshot,
                    profileId: settings.modelProfileId,
                    sourceText: entries.map((entry) => `${entry.title}\n${entry.content}`).join('\n\n'),
                    singleAttempt: true,
                });
                parsed = parseOrganizerResult(raw, entries);
                if (!parsed.error) break;
                failure = parsed.error;
            } catch (error) {
                failure = (0, util_1.errorText)(error);
            }
            if (attempt === 0) this.emitProgress({ state: 'running', current: 0, total: 1, detail: `首次整理失败，带上失败原因重新请求一次：${failure}` });
        }
        if (!parsed || parsed.error) throw new Error(`整本世界书整理连续两次失败：${parsed?.error || failure || '未知错误'}`);
        // [MA-REBUILD-BEDROCK] 预览阶段也按基石锁生成计划，避免预览显示“会删除/改写”而提交时又不一致。
        const plan = buildPlan(parsed, entries, true);
        const deleted = plan.operations.filter((item) => item.kind === 'delete-entry').length;
        const created = plan.operations.filter((item) => item.kind === 'create-entry').length;
        const updated = plan.operations.filter((item) => item.kind === 'replace-entry' && item.targetUid).length;
        const finalCount = Math.max(0, entries.length - deleted + created);
        const summary = {
            previewReady: true,
            worldbookName: original.name,
            candidates: entries.length,
            rebuiltEntries: finalCount,
            updatedEntries: updated,
            deletedEntries: deleted,
            createdEntries: created,
            retried: Boolean(failure),
        };
        this.preview = {
            chatKey: snapshot.chatKey,
            worldbookName: original.name,
            sourceData: (0, util_1.clone)(original.data),
            sourceUids: entries.map((entry) => String(entry.uid)),
            plan,
            summary,
        };
        this.emitProgress({ state: 'complete', current: 1, total: 1, detail: `整本整理预览完成：${entries.length}条 → ${finalCount}条` });
        return { changed: plan.operations.length > 0, ...summary };
    }

    async commit(settings, snapshot) {
        if (!this.preview) throw new Error('没有可提交的世界书整理预览');
        if (this.preview.chatKey !== snapshot.chatKey || this.preview.worldbookName !== snapshot.worldbookName) throw new Error('整理预览属于其他聊天或世界书，请重新生成');
        const validate = () => this.host.assertSnapshot(snapshot, this.getSettings());
        const preview = this.preview;
        const before = await this.worldbook.readRaw(settings, snapshot, validate);
        // [MA-REBUILD-BEDROCK] 整本重建尊重玩家手动基石锁：不自动解锁、不允许重建删除或改写锁定条目。
        const result = await this.worldbook.apply(
            settings,
            preview.plan,
            'manual:whole-worldbook-organize',
            '整本世界书整理',
            this.host.getFocusUid?.() || '',
            snapshot,
            validate,
            { sourceKind: 'manual-merge', manualAuthorizedUids: preview.sourceUids },
        );
        // 整本重建改变了 UID 结构，旧 S/L 与旧场景/大组集关系全部失效。先清 S/L，再以权威世界书建立显式新基线。
        await this.worldbook.clearSummaryMarks(settings, snapshot, validate);
        await this.worldbook.replanRecall(settings, snapshot, validate);
        const after = await this.worldbook.readRaw(settings, snapshot, validate);
        const rebuiltEntries = await this.worldbook.list(settings, snapshot, validate);
        await this.host.resetUidRuntimeStateAfterRebuild(rebuiltEntries, snapshot, this.getSettings());
        this.backup = { chatKey: snapshot.chatKey, worldbookName: preview.worldbookName, data: before.data, afterData: after.data };
        this.preview = null;
        return { changed: result.changed === true, committed: true, ...preview.summary };
    }

    async undo(settings, snapshot) {
        if (!this.backup) throw new Error('没有可撤销的上次世界书整理');
        if (this.backup.chatKey !== snapshot.chatKey || this.backup.worldbookName !== snapshot.worldbookName) throw new Error('上次整理属于其他聊天或世界书');
        const validate = () => this.host.assertSnapshot(snapshot, this.getSettings());
        const backup = this.backup;
        await this.worldbook.replaceRaw(settings, backup.worldbookName, backup.data, snapshot, validate);
        await this.worldbook.clearSummaryMarks(settings, snapshot, validate);
        await this.worldbook.replanRecall(settings, snapshot, validate);
        const restoredEntries = await this.worldbook.list(settings, snapshot, validate);
        await this.host.resetUidRuntimeStateAfterRebuild(restoredEntries, snapshot, this.getSettings());
        this.backup = null;
        return { changed: true, restored: true };
    }
}
exports.MigrationService = MigrationService;

function sortEntries(entries) {
    return [...(entries || [])].sort((left, right) => {
        const time = Number(left?.updatedAt || 0) - Number(right?.updatedAt || 0);
        if (time) return time;
        const a = String(left?.uid ?? '');
        const b = String(right?.uid ?? '');
        const an = Number(a), bn = Number(b);
        if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
        return a.localeCompare(b, 'zh-CN');
    });
}

function wholeBookPrompt(settings, entries, retryReason = '') {
    const schema = Object.entries(information_point_1.TYPE_SECTION_ORDER)
        .map(([type, sections]) => `${type}：${sections.join('、')}`).join('\n');
    const protocol = (0, protocols_1.protocolTextForStage)('migration');
    const input = entries.map((entry, index) => `【条目${index + 1}】\n${entry.title}\n${entry.content}`).join('\n\n');
    return {
        system: `职责：整理整本世界书的信息归属与颗粒度，使每条信息处在合适层级，并保留所有仍然具有长期影响的有效内容。目标不是缩短字数。\n\n整理原则：\n- 同一件事被拆成多个过碎条目时，可以合并到更合适的主体条目。\n- 某条信息只是另一条长期事实或规则的附属时，可以收回到更合适的宿主。\n- 一个条目混入多个不同颗粒度或不同主体的信息时，可以在确有必要时拆分成更清楚的独立条目。\n- 具体过程可以整理为已经形成并会继续影响后续的结果，但不能因为追求简短而丢掉仍然有效的事实。\n- 已经能够自然形成更高层规律的内容可以向上整理；材料不足时不要强行拔高。\n- 不编造、不预测、不为了变少而合并本来应该独立存在的信息。\n\n你看到的“条目1、条目2……”只是本次请求用于对应输入条目的临时编号。\n原条目保留或改写：使用原临时编号返回完整最终条目。\n原条目被其他条目完整吸收后不再需要独立存在：不要返回它。\n确实需要拆出或形成新的独立条目：使用“新条目N”。\n返回什么系统保存什么，未返回的原条目会删除。\n不要输出删除命令，不要解释过程，不要编造。\n\n【合法类型与栏目】\n${schema}\n\n【输出格式】\n${protocol}${retryReason ? `\n\n【上一次失败原因】\n${retryReason}\n请使用同一整本世界书重新输出正确最终协议。` : ''}`,
        user: `【完整世界书】\n${input}\n\n直接输出按信息归属与颗粒度整理后的整本世界书最终条目。`,
    };
}

function parseOrganizerResult(raw, selectedEntries) {
    const source = (0, parser_1.sanitizeModelText)(raw).replace(/\r/g, '').trim();
    if (!source) return { entries: [], error: '模型没有返回最终条目' };
    const lines = source.split('\n');
    const output = [];
    const seenExisting = new Set();
    const seenNew = new Set();
    const allowedTypes = new Set(protocols_1.SUMMARY_TYPES);
    for (let index = 0; index < lines.length;) {
        const line = String(lines[index] ?? '').trim();
        if (!line) { index += 1; continue; }
        const header = line.match(/^(条目|新条目)(\d+)｜([^｜]+)｜(.+)$/u);
        if (!header) return { entries: [], error: `无法识别的整理行：${line.slice(0,160)}` };
        const kind = header[1] === '新条目' ? 'new' : 'existing';
        const number = Number(header[2]);
        const type = header[3].trim();
        const name = header[4].trim();
        if (!Number.isInteger(number) || number <= 0) return { entries: [], error: `临时条目编号不合法：${header[2]}` };
        if (kind === 'existing') {
            if (number > selectedEntries.length) return { entries: [], error: `条目${number}不属于整本输入` };
            if (seenExisting.has(number)) return { entries: [], error: `条目${number}重复返回` };
            seenExisting.add(number);
        } else {
            if (seenNew.has(number)) return { entries: [], error: `新条目${number}重复返回` };
            seenNew.add(number);
        }
        if (!allowedTypes.has(type)) return { entries: [], error: `条目${number}类型“${type}”不合法` };
        if (!name) return { entries: [], error: `条目${number}缺少稳定名称` };
        index += 1;
        const body = [];
        while (index < lines.length && String(lines[index] ?? '').trim() !== '结束条目') { body.push(lines[index]); index += 1; }
        if (index >= lines.length) return { entries: [], error: `条目${number}缺少“结束条目”` };
        index += 1;
        const parsed = (0, parser_1.parseEntrySections)(body.join('\n'));
        const allowedSections = new Set(information_point_1.TYPE_SECTION_ORDER[type] ?? []);
        const order = [];
        const values = {};
        for (const rawSection of parsed.order ?? []) {
            const section = (0, information_point_1.canonicalSectionName)(rawSection, type);
            if (!section || !allowedSections.has(section)) return { entries: [], error: `条目${number}栏目“${rawSection}”不属于${type}` };
            if (!values[section]) { values[section] = []; order.push(section); }
            for (const rawFact of parsed.values?.[rawSection] ?? []) {
                const fact = (0, parser_1.sanitizeWorldbookLine)(rawFact);
                if (fact) values[section].push(fact);
            }
            values[section] = (0, util_1.unique)(values[section]);
        }
        const content = (0, parser_1.serializeEntrySections)({ order, values }).trim();
        if (!content) return { entries: [], error: `条目${number}没有完整最终正文` };
        output.push({ kind, number, sourceIndex: kind === 'existing' ? number - 1 : -1, title: `${type}｜${name}`, content });
    }
    if (!output.length) return { entries: [], error: '模型没有返回任何完整最终条目' };
    return { entries: output, error: '' };
}

function buildPlan(parsed, entries, honorLocks = true) {
    const operations = [];
    const returned = new Set();
    for (const item of parsed.entries || []) {
        if (item.kind === 'existing') {
            const current = entries[item.sourceIndex];
            if (!current) continue;
            returned.add(item.sourceIndex);
            if (honorLocks && current.bedrockLocked === true) continue;
            if ((0, util_1.normalizeTitle)(current.title) === (0, util_1.normalizeTitle)(item.title) && String(current.content || '').trim() === String(item.content || '').trim()) continue;
            operations.push({ id: `whole:replace:${current.uid}:${(0, util_1.hashText)(item.title + '|' + item.content)}`, kind: 'replace-entry', operation: 'replace-entry', targetUid: String(current.uid), title: item.title, oldValue: current.content, newValue: item.content, reason: '整本整理返回的完整最终条目' });
        } else {
            operations.push({ id: `whole:create:${item.number}:${(0, util_1.hashText)(item.title)}`, kind: 'create-entry', operation: 'create', title: item.title, reason: '整本整理明确形成新条目' });
            operations.push({ id: `whole:new-content:${item.number}:${(0, util_1.hashText)(item.content)}`, kind: 'replace-entry', operation: 'replace-entry', title: item.title, newValue: item.content, reason: '写入新条目完整正文' });
        }
    }
    for (let index = 0; index < entries.length; index += 1) {
        if (returned.has(index)) continue;
        const current = entries[index];
        if (!current || current.focus === true) continue;
        if (honorLocks && current.bedrockLocked === true) continue;
        operations.push({ id: `whole:delete:${current.uid}`, kind: 'delete-entry', operation: 'delete', targetUid: String(current.uid), title: current.title, reason: '整本整理最终结果未返回该原条目' });
    }
    return { blocks: [], operations, createdAt: Date.now() };
}

},"model-request":function(module,exports,require){
/**
 * Mirror Abyss — model-request
 *
 * 职责：模型请求层：首轮 + 最多一次受控重试。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
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
const util_1 = require("./util");
const protocols_1 = require("./protocols");

// [MA-MODEL-01] 每个模型阶段只声明输入/输出预算；网关失败使用紧凑请求，瞬时断线最多再退避重放一次。
// 该模块不理解审核、提取或总结业务，也不接触世界书，避免请求控制与业务逻辑耦合。
const INPUT_LIMITS = Object.freeze({
    audit: 24000,
    revision: 30000,
    extraction: 160000,
    worldSettingImport: 42000,
    smallSummary: 160000,
    largeSummary: 160000,
    manualMerge: 160000,
    migration: 160000,
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
        singleAttempt = false,
        generationOptions = undefined,
    } = options;
    const configuredOverride = Number(responseTokens || 0);
    const responseLength = configuredOverride > 0
        ? Math.max(256, Math.min(16384, Math.floor(configuredOverride)))
        : stageResponseTokens(stage, settings, sourceText);
    const primary = limitPromptPair(withOutputContract(prompt, stage, responseLength, sourceText), stage);
    let firstError = null;
    try {
        return await host.generate(primary.system, primary.user, responseLength, snapshot, settings, settings.requestTimeoutMs, profileId, generationOptions);
    }
    catch (error) {
        firstError = error;
        if (singleAttempt) throw error;
        const retryable = isRetryableGatewayError(error) || isEmptyModelResponseError(error);
        if (snapshot?.token?.cancelled || !retryable) throw error;
    }

    const fallbackValue = fallbackPrompt
        ? (typeof fallbackPrompt === 'function' ? fallbackPrompt() : fallbackPrompt)
        : prompt;
    const emptyResponse = isEmptyModelResponseError(firstError);
    const fallbackTokens = emptyResponse
        ? emptyResponseRetryTokens(stage, settings, responseLength)
        : Math.max(256, Math.min(responseLength, Math.floor(responseLength * 0.75)));
    const restartBase = emptyResponse
        ? {
            system: `${String(fallbackValue?.system ?? '').trim()}\n\n【重新开始】这是一次全新的请求。不要承接、复述或继续上一次内部推理；直接形成最终固定协议。`.trim(),
            user: String(fallbackValue?.user ?? ''),
        }
        : fallbackValue;
    const fallback = limitPromptPair(withOutputContract(restartBase, stage, fallbackTokens, sourceText), stage, true);
    try { onRetry?.(firstError); }
    catch (callbackError) { console.warn('[MirrorAbyss] model retry callback failed', callbackError); }
    if (isRetryableGatewayError(firstError)) await waitForGatewayRetry(firstError, 1, settings, snapshot);

    try {
        return await host.generate(
            fallback.system,
            fallback.user,
            fallbackTokens,
            snapshot,
            settings,
            settings.requestTimeoutMs,
            profileId,
            emptyResponse && profileId ? { includePreset: false } : undefined,
        );
    }
    catch (secondError) {
        throw secondError;
    }
}

function isEmptyModelResponseError(error) {
    return error?.code === 'MA_EMPTY_MODEL_RESPONSE' || error?.code === 'MA_REASONING_ONLY';
}
function emptyResponseRetryTokens(stage, settings, firstTokens) {
    const minimums = {
        audit: 3072,
        revision: 6144,
        extraction: 8192,
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
    if (stage === 'worldSettingImport') return Math.min(configured, 8192);
    if (stage === 'smallSummary') {
        const chars = String(sourceText ?? '').length;
        const estimated = chars >= 18000 ? 8192 : chars >= 9000 ? 6144 : 4096;
        return Math.min(configured, estimated);
    }
    if (stage === 'largeSummary') {
        const chars = String(sourceText ?? '').length;
        const estimated = chars >= 22000 ? 10240 : chars >= 12000 ? 8192 : 6144;
        return Math.min(configured, estimated);
    }
    if (stage === 'manualMerge') return Math.min(configured, 6144);
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
        audit: [`- 唯一输出协议：\n${(0, protocols_1.protocolTextForStage)('audit')}\n总长度不超过300个中文字符。`],
        revision: [`- 只输出可直接替换的完整正文。必须从原文开头写到原文结尾，不得中途停止、缺段或用省略号代替剩余内容。除删除明确违规内容外，修正版应保留原文至少85%的有效正文；总长度原则上不超过原输入的110%（当前参考长度约${sourceLength || 0}字符）。`],
        extraction: [`- 唯一输出协议：\n${(0, protocols_1.protocolTextForStage)('extraction')}\n最多32个事实宿主；不得输出旧 ENTRY 外壳。`],
        worldSettingImport: ['- 只输出规定的 ENTRY 协议或“无”。最多16条，最终协议总长度不超过8000个中文字符。'],
        smallSummary: [`- 唯一输出协议：\n${(0, protocols_1.protocolTextForStage)('smallSummary')}\n“保留”不是输出动作；无需修改的来源不输出任何行，整批无执行动作时只输出“无”。分隔符必须使用全角“｜”。以完整表达本场景形成的局部规律为准。`],
        largeSummary: [`- 唯一输出协议：\n${(0, protocols_1.protocolTextForStage)('largeSummary')}\n以完整表达长期整体规律为准。`],
        manualMerge: [`- 唯一输出协议：\n${(0, protocols_1.protocolTextForStage)('manualMerge')}\n模型只做语义抽象，不决定 UID、目标类型或包含关系。`],
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


function describeRetryReason(error, label = '模型请求') {
    const text = (0, util_1.errorText)(error);
    if (error?.code === 'MA_REASONING_ONLY') return `${label}只返回推理，没有最终协议；将从干净请求重试一次`;
    if (error?.code === 'MA_EMPTY_MODEL_RESPONSE') return `${label}没有最终正文；将从干净请求重试一次`;
    if (isTransientNetworkError(error)) return `${label}遇到瞬时网络中断：${text}；将退避并重试一次`;
    if (isRetryableGatewayError(error)) return `${label}遇到网关异常：${text}；将缩短上下文并重试一次`;
    return `${label}失败：${text}`;
}

/** 仅识别可安全重放的网关/网络异常；取消、400 与协议错误不属于此类。 */
function isRetryableGatewayError(error) {
    const text = (0, util_1.errorText)(error).toLocaleLowerCase();
    return /(?:\b502\b|\b503\b|\b504\b|gateway\s*(?:timeout|time-out)|upstream|no message generated|html\s*错误页|returned\s*html|unexpected token ['"]?<['"]?|<html|not valid json|invalid json|json parse|failed to fetch|fetch failed|network request failed|network error|networkerror|load failed|err_network|connection reset|connection aborted|socket hang up)/iu.test(text);
}

function isTransientNetworkError(error) {
    const text = (0, util_1.errorText)(error).toLocaleLowerCase();
    return /(?:failed to fetch|fetch failed|network request failed|network error|networkerror|load failed|err_network|connection reset|connection aborted|socket hang up)/iu.test(text);
}

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
/**
 * Mirror Abyss — operations
 *
 * 职责：写入事务、回执与回滚。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOperationPlan = buildOperationPlan;
exports.applyPlanToEntries = applyPlanToEntries;
exports.informationAnchor = informationAnchor;
const matcher_1 = require("./matcher");
const parser_1 = require("./parser");
const information_point_1 = require("./domain/information-point");
const governance_1 = require("./governance");
const util_1 = require("./util");
function buildOperationPlan(blocks, entries, settings, contextText, options = {}) {
    const governed = (0, governance_1.governInformationBlocks)(blocks, entries, contextText, options);
    blocks = (0, information_point_1.prepareInformationBlocks)(governed.blocks);
    // [MA-EXACT-MATCH-02] 正常提取/总结不自动改标题；标题变化只来自显式合并/总结治理结果。
    const index = (0, matcher_1.buildEntryIndex)(entries);
    const operations = [];
    for (const block of blocks) {
        const candidates = (0, matcher_1.matchBlock)(block, index, contextText);
        const target = (0, matcher_1.selectBestCandidate)(candidates, 80);
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
            const initialKeywords = [...block.keywords];
            if (shouldMarkTemporary(block)) initialKeywords.push('临时', '身份未明');
            for (const keyword of (0, util_1.unique)(initialKeywords)) {
                operations.push(op('merge-keywords', block.title, undefined, '关键词', undefined, keyword, keyword === '临时' ? '插件按身份未明对象规则标记临时条目' : keyword === '身份未明' ? '插件标记该人物身份尚未揭示' : '新条目关键词写入'));
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
                const lines = options.sourceKind === 'extraction' ? section.lines : linesWithoutCrossSectionDuplicates(block, section);
                if (!lines.length) { operations.push(noop(block.title, undefined, section.name, '该信息已在同一对象的主要归属小标题中表达')); continue; }
                if (/(事件进程|关键进展|已发生进展|未发生进展)/u.test(section.name) && block.type !== '事件') { operations.push(noop(block.title, undefined, section.name, '事件过程只能写入事件条目')); continue; }
                let sectionPolicy = authoritativeSnapshotPolicy(block.type, section.name)
                    ?? policyFor(section.name, settings);
                // [MA-GRANULARITY-LADDER][总结栏目重写]
                // 总结模型对某栏目输出的全部“写回”行，就是该栏目粗化后的完整最终内容；普通业务栏目必须整栏替换，
                // 才能真正实现“多条细事实 → 少量中/粗颗粒事实”，而不是把概括继续追加在旧细节后。
                // 只有当前/持有/关系等明确状态槽继续使用 semantic-upsert，避免历史总结擦除同栏未参与本次粗化的最新槽位。
                if (options.sourceKind === 'summary') {
                    const snapshotPolicy = authoritativeSnapshotPolicy(block.type, section.name);
                    if (snapshotPolicy || sectionPolicy === 'replace-by-anchor') sectionPolicy = 'semantic-upsert';
                    else sectionPolicy = 'replace-section';
                }
                operations.push(...operationsForNewSection(block.title, block.type, section.name, lines, sectionPolicy, false, options.sourceKind === 'extraction'));
            }
            continue;
        }
        const entry = target.entry;
        // [MA-EVENT-SM-01] 状态机只管理当前事件。总结不得把已完成事件重新写成活动进展；
        // 真正的新事件必须拥有不同的参与、场景或因果签名并建立新条目。
        // [MA-EXACT-MATCH-03] 自动流程不再按相似身份合并重复档；合并只由总结/人工显式操作产生。
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
            const lines = options.sourceKind === 'extraction' ? section.lines : linesWithoutCrossSectionDuplicates(block, section);
            if (!lines.length) { operations.push(noop(entry.title, entry.uid, section.name, '该信息已在同一对象的主要归属小标题中表达', target.score, target.evidence)); continue; }
            if (/(事件进程|关键进展|已发生进展|未发生进展)/u.test(section.name) && block.type !== '事件') { operations.push(noop(entry.title, entry.uid, section.name, '事件过程只能写入事件条目', target.score, target.evidence)); continue; }
            let sectionPolicy = authoritativeSnapshotPolicy(block.type, section.name)
                ?? policyFor(section.name, settings);
            // [MA-GRANULARITY-LADDER][总结栏目重写]
            // 写回到已有业务栏目时，普通栏目把模型给出的全部写回行视为“粗化后的完整最终栏目”并整栏替换。
            // 当前/持有/关系等状态槽仍做 semantic-upsert，只更新模型明确触及的槽位，保护未参与本次历史粗化的最新状态。
            if (options.sourceKind === 'summary') {
                const snapshotPolicy = authoritativeSnapshotPolicy(block.type, section.name);
                if (snapshotPolicy || sectionPolicy === 'replace-by-anchor') sectionPolicy = 'semantic-upsert';
                else sectionPolicy = 'replace-section';
            }
            operations.push(...operationsForExisting(entry, section.name, lines, sectionPolicy, target.score, target.evidence, options.sourceKind === 'extraction'));
        }
    }
    const primaryOperations = dedupeOperations(operations);
    // 用户已取消场景离开清理与物品持有/位置投影。提取结果按模型明确栏目直接写入。
    let plannedOperations = primaryOperations;
    // A create operation is emitted before section-level governance finishes.
    // If every candidate fact is later rejected or absorbed, do not leave a
    // newly-created empty shell in the real worldbook.
    const blankCreatedTitles = new Set(applyPlanToEntries({ operations: plannedOperations }, entries, settings)
        .filter((entry) => String(entry.uid ?? '').startsWith('new:'))
        .filter((entry) => !Object.values(entry.sections?.values ?? {}).flat().some((line) => String(line ?? '').trim()))
        .map((entry) => (0, util_1.normalizeTitle)(entry.title)));
    if (blankCreatedTitles.size) plannedOperations = plannedOperations.filter((operation) => !blankCreatedTitles.has((0, util_1.normalizeTitle)(operation.title)));
    return { blocks, operations: dedupeOperations(plannedOperations), governance: governed.diagnostics, currentSceneTitle: governed.currentSceneTitle, createdAt: Date.now() };
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
        // [MA-SUMMARY-WHOLE-ENTRY][冻结] 总结只允许按既有 UID 整条替换。
        // targetUid 是唯一身份；operation.title 只是替换后的展示标题，不参与目标匹配。
        if (operation.kind === 'replace-entry') {
            const split = (0, util_1.splitTitle)(String(operation.title ?? ''));
            if (!split || target.bedrockLocked === true) continue;
            target.title = `${split.type}｜${split.name}`;
            target.normalizedTitle = (0, util_1.normalizeTitle)(target.title).toLocaleLowerCase();
            target.type = split.type;
            target.name = split.name;
            target.content = String(operation.newValue ?? '').trim();
            target.sections = (0, parser_1.parseEntrySections)(target.content);
            target.keywords = (0, util_1.unique)([split.name, ...(target.keywords ?? []).filter((item) => (0, util_1.normalizeFact)(item) !== (0, util_1.normalizeFact)(target.type))]);
        }
        else if (operation.kind === 'merge-entry') {
            const source = byUid.get(String(operation.sourceUid ?? ''));
            if (!target.bedrockLocked && source && source.uid !== target.uid) mergeEntryData(target, source);
        }
        else applyOne(target, operation);
        modifiedEntries.add(target);
    }
    for (const entry of modifiedEntries) {
        if (entry.bedrockLocked === true) continue;
        normalizeEntryTemplate(entry);
    }
    return output;
}
// 条目长期老化只由 SceneGroup 总结负责；运行层不再执行第二套自动压缩/删除预算。
function normalizeEntryTemplate(entry) {
    const order = information_point_1.TYPE_SECTION_ORDER[String(entry?.type ?? '')];
    if (!order || !entry?.sections?.values) return entry;
    const allowed = new Set(order);
    const next = Object.fromEntries(order.map((name) => [name, []]));
    const append = (section, line) => {
        if (!section || !line) return;
        next[section] = (0, util_1.unique)([...(next[section] ?? []), String(line).trim()]);
    };
    for (const rawName of (0, util_1.unique)([...(entry.sections.order ?? []), ...Object.keys(entry.sections.values)])) {
        const canonical = (0, information_point_1.canonicalSectionName)(rawName, entry.type);
        // ui.89: retired person columns are intentionally discarded, never migrated into 【固定事实】.
        if (entry.type === '人物' && !canonical && /^(?:性格核心|决策倾向|性格|人格|稳定性格|人格核心|核心性格|决策模式|判断倾向|判断模式|选择倾向)$/u.test(String(rawName ?? '').trim())) continue;
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

function operationsForNewSection(title, type, section, lines, policy, normalized = false, trustModelWrite = false) {
    if (type === '总结') policy = 'replace-section';
    if (!trustModelWrite && !normalized && type === '人物' && /^(当前|当前状态)$/u.test(section)) {
        const multiValue = lines.filter(isMultiValueFact);
        const scalar = lines.filter((line) => !isMultiValueFact(line));
        return [
            ...multiValue.map(() => noop(title, undefined, section, '该事实应写入人物【关系】、【持有】或【稳定】，不写入人物【当前】状态槽')),
            ...operationsForNewSection(title, type, section, scalar, policy, true, trustModelWrite),
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
                : trustModelWrite
                    ? op('append-line', title, undefined, section, undefined, line, '模型事实直接写入')
                    : noop(title, undefined, section, '当前状态缺少明确字段标签，拒绝写入可能无法更新的冲突状态');
        });
    }
    return lines.map((line) => op('append-line', title, undefined, section, undefined, line, '新条目信息点写入'));
}
function operationsForExisting(entry, section, lines, policy, score, evidence, trustModelWrite = false) {
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
        if (!trustModelWrite && entry.type === '人物' && /^(当前|当前状态)$/u.test(section) && isMultiValueFact(point)) {
            result.push(noop(entry.title, entry.uid, section, '该事实应写入人物【关系】、【持有】或【稳定】，不写入人物【当前】状态槽', score, evidence));
            continue;
        }
        const normalizedIncoming = (0, util_1.normalizeFact)(point);
        const duplicateElsewhere = otherFacts.find((line) => (0, util_1.normalizeFact)(line) === normalizedIncoming);
        if (!trustModelWrite && duplicateElsewhere) {
            result.push(noop(entry.title, entry.uid, section, '相同事实已存在于该条目的其他主要归属小标题，拒绝重复写入', score, evidence));
            continue;
        }
        const exactOld = current.find((line) => (0, util_1.normalizeFact)(line) === normalizedIncoming || (0, util_1.normalizeFact)(normalizeStateLine(section, line)) === (0, util_1.normalizeFact)(incoming));
        if (exactOld) {
            result.push(noop(entry.title, entry.uid, section, '标准化后完全相同，跳过重复信息点', score, evidence));
            continue;
        }
        const anchor = informationAnchor(incoming);
        if (!trustModelWrite && entry.type === '人物' && /^(已知|误信)$/u.test(section) && anchor) {
            const oppositeSection = section === '已知' ? '误信' : '已知';
            const opposite = entry.sections.values[oppositeSection] ?? [];
            for (const oldLine of opposite.filter((line) => informationAnchor(line) === anchor)) {
                result.push(op('delete-line', entry.title, entry.uid, oppositeSection, oldLine, undefined, `人物认知槽“${anchor.replace(/^label:/u, '')}”已转入【${section}】，清除相反认知`, score, evidence));
            }
        }
        const anchoredOld = anchor ? current.find((line) => informationAnchor(line) === anchor) : undefined;
        if (policy === 'replace-by-anchor') {
            if (!anchor) {
                if (trustModelWrite) result.push(op('append-line', entry.title, entry.uid, section, undefined, incoming, '模型事实直接写入', score, evidence));
                else result.push(noop(entry.title, entry.uid, section, '当前状态缺少明确字段标签，拒绝追加可能冲突的状态；应使用“字段：当前值”格式', score, evidence));
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
function shouldMarkTemporary(block) {
    if (String(block.type ?? '').trim() !== '人物') return false;
    if ((0, matcher_1.isProvisionalName)(block.name)) return true;
    return block.keywords?.some((keyword) => /^(?:身份未明|未知身份|临时)$/u.test((0, util_1.normalizeFact)(keyword))) === true;
}
function linesWithoutCrossSectionDuplicates(block, section) {
    if (!/(固定事实|持续经历|近期经历|持续变化|世界变化|已发生进展)/u.test(section.name)) return section.lines;
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
    if (entry?.bedrockLocked === true) return;
    const section = operation.section ?? '';
    const values = entry.sections.values;
    const aliasSection = operation.kind === 'merge-keywords' && /(别名|称号|其他名称)/u.test(section);
    if (section && (operation.kind !== 'merge-keywords' || aliasSection) && !values[section]) {
        values[section] = [];
        entry.sections.order.push(section);
    }
    if (operation.kind === 'append-line' && operation.newValue) {
        const current = [...(values[section] ?? [])];
        const anchor = informationAnchor(operation.newValue);
        const replaceAtApply = /^(当前|当前状态|关系|阶段|权力|制度|资源与交通|公开局势|持续影响)$/u.test(section);
        const index = replaceAtApply && anchor ? current.findIndex((line) => informationAnchor(line) === anchor) : -1;
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
        'replace-entry': 'replace-entry',
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
/**
 * Mirror Abyss — parser
 *
 * 职责：固定协议解析器；失败报告行级错误。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.parseExtractionProtocol = parseExtractionProtocol;
exports.parseWorldSettingImportProtocol = parseWorldSettingImportProtocol;
exports.canonicalExtractionType = canonicalExtractionType;
exports.parseEntrySections = parseEntrySections;
exports.serializeEntrySections = serializeEntrySections;
exports.sanitizeModelText = sanitizeModelText;
exports.sanitizeWorldbookLine = sanitizeWorldbookLine;
exports.normalizePointLine = normalizePointLine;
exports.stripListMarker = stripListMarker;
const util_1 = require("./util");
const information_point_1 = require("./domain/information-point");
const protocols_1 = require("./protocols");
const SECTION_PATTERN = /^\s*【\s*([^】]+?)\s*】\s*$/u;
const PLAIN_SECTION_PATTERN = /^\s*([^：:\n]{1,24})\s*[:：]\s*$/u;
const TITLE_PATTERN = /^\s*(?:#{1,6}\s*)?([^【】\n]+?[｜|丨][^【】\n]+?)\s*$/u;
const COLON_TITLE_PATTERN = /^\s*(?:#{1,6}\s*)?((?:人物|角色|NPC|事件|地点|场景|物品|道具|世界|全局|全局状态|全局变化|基础设定|基础规则|世界设定|总结))\s*[:：]\s*([^：:\n]+?)\s*$/u;
const BULLET_PATTERN = /^\s*(?:[-*]\s+|[•·]\s*|\d+、\s*|\d+[.)]\s+)(.*?)\s*$/u;
const EMPTY_PATTERN = /^\s*(?:无|无变化|无新增事实|无可记录事实|没有)\s*[。.]?\s*$/u;
const EMPTY_VALUE_PATTERN = /^\s*[^：:\n]{1,24}\s*[:：]\s*(?:无|无变化|没有|未知|未说明)\s*[。.]*\s*$/u;
const PLAIN_SECTION_NAMES = new Set([
    '身份', '稳定', '行为倾向', '表达方式', '当前', '关系', '关系立场', '持有', '已知', '误信', '持续经历',
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
// [MA-GRANULARITY-LADDER][提取栏目契约] 固定事实协议包含栏目：模型决定语义栏目，parser 只做机械合法性校验。
const FIXED_FACT_LINE_PATTERN = /^事实｜(人物|场景|物品|事件|世界)｜([^｜]+)｜([^｜]+)｜(建立|变化|结束)｜([^｜]*)｜(.+)$/u;
// [MA-PROTOCOL-RETRY-DIAGNOSTIC] 这里只诊断固定协议的机械字段错误，供唯一一次干净重试使用。
// 诊断只能回答“哪一个协议字段缺失/非法”，不得从失败文本推断剧情语义、自动补事实或改写模型答案。
function diagnoseFixedFactLine(line) {
    const text = String(line ?? '').trim();
    if (!text) return '协议行为空';
    if (!text.includes('｜') && text.includes('|')) return '分隔符必须使用全角竖线“｜”，不能使用半角“|”';
    const parts = text.split('｜');
    const errors = [];
    const action = String(parts[0] ?? '').trim();
    const type = String(parts[1] ?? '').trim();
    const name = String(parts[2] ?? '').trim();
    const section = String(parts[3] ?? '').trim();
    const change = String(parts[4] ?? '').trim();
    const fact = String(parts[6] ?? '').trim();
    if (action !== '事实') errors.push(`第1字段必须是“事实”，当前为“${action || '（空）'}”`);
    if (parts.length > 1 && !protocols_1.EXTRACTION_TYPES.includes(type)) errors.push(`第2字段类型“${type || '（空）'}”不合法；允许：${protocols_1.EXTRACTION_TYPES.join('、')}`);
    if (parts.length > 2 && !name) errors.push('缺少稳定名称（第3字段）');
    if (parts.length > 3 && !section) errors.push('缺少栏目名称（第4字段）');
    if (parts.length > 3 && section && protocols_1.EXTRACTION_TYPES.includes(type) && !(0, information_point_1.isCanonicalSectionName)(type, section)) {
        const allowedSections = information_point_1.TYPE_SECTION_ORDER[type] ?? [];
        errors.push(`${type}不允许栏目“${section}”；合法栏目：${allowedSections.join('、') || '（无）'}`);
    }
    if (parts.length > 4 && !['建立', '变化', '结束'].includes(change)) errors.push(`第5字段必须是“建立”“变化”或“结束”，当前为“${change || '（空）'}”`);
    // 关联对象字段沿用现有解析契约：空字符串仍可被 parser 接受，不在诊断阶段偷偷收紧协议。
    if (parts.length > 6 && !fact) errors.push('缺少完整事实（第7字段）');
    if (parts.length < 7) {
        const names = ['动作“事实”', '类型', '稳定名称', '栏目', '建立/变化/结束', '关联对象', '完整事实'];
        errors.push(`固定事实协议字段不足（当前${parts.length}段，应为7段）；缺少后续字段：${names.slice(parts.length).join('、')}`);
    } else if (parts.length > 7) {
        errors.push(`固定事实协议字段过多（当前${parts.length}段，应为7段）`);
    }
    return errors.join('；') || '不符合唯一固定事实协议；必须严格使用“事实｜类型｜稳定名称｜栏目｜建立/变化/结束｜关联对象｜完整事实”';
}
function parseFixedFactExtractionProtocol(raw, diagnostics) {
    const source = sanitizeModelText(raw).replace(/\r/g, '').trim();
    if (source === protocols_1.NONE) { diagnostics.hadInput = true; return attachDiagnostics([], diagnostics); }
    if (!source) return null;
    diagnostics.hadInput = true;
    const rows = [];
    const lines = source.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return null;
    for (const line of lines) {
        const match = line.match(FIXED_FACT_LINE_PATTERN);
        if (!match) {
            diagnostics.skipped.push({ title: '协议错误', reason: diagnoseFixedFactLine(line), raw: line.slice(0, 600) });
            return attachDiagnostics([], diagnostics);
        }
        const type = match[1];
        const name = String(match[2] ?? '').trim();
        const sectionName = (0, information_point_1.canonicalSectionName)(String(match[3] ?? '').trim(), type);
        const change = String(match[4] ?? '').trim();
        const relations = String(match[5] ?? '').split('、').map((item) => item.trim()).filter((item) => item && item !== protocols_1.NONE);
        const fact = sanitizeWorldbookLine(String(match[6] ?? '').trim()).trim();
        if (!protocols_1.EXTRACTION_TYPES.includes(type) || !name || !sectionName || !(0, information_point_1.isCanonicalSectionName)(type, sectionName) || !fact) {
            diagnostics.skipped.push({ title: `${type || '未知'}｜${name || '未命名'}`, reason: '固定事实行缺少合法类型、名称、栏目或内容', raw: line.slice(0, 600) });
            return attachDiagnostics([], diagnostics);
        }
        rows.push({ type, name, section: sectionName, change, relations, fact });
    }
    const grouped = new Map();
    for (const row of rows) {
        const title = `${row.type}｜${row.name}`;
        const key = (0, util_1.normalizeFact)(title);
        // [MA-GRANULARITY-LADDER][提取栏目契约] 使用模型明确给出的合法栏目；禁止把非事件重新挤回【固定事实】。
        const sectionName = row.section;
        const block = grouped.get(key) ?? { rawTitle: title, title, type: row.type, name: row.name, sections: [], keywords: [row.name], factRows: [] };
        let section = block.sections.find((item) => item.name === sectionName);
        if (!section) { section = { name: sectionName, lines: [], empty: false }; block.sections.push(section); }
        section.lines = (0, util_1.unique)([...section.lines, row.fact]);
        section.empty = section.lines.length === 0;
        block.factRows.push({ section: row.section, change: row.change, relations: row.relations, fact: row.fact });
        grouped.set(key, block);
    }
    const blocks = [...grouped.values()];
    return attachDiagnostics(blocks, diagnostics);
}
function parseExtractionProtocol(raw) {
    const diagnostics = { repaired: 0, merged: [], skipped: [], warnings: [], hadInput: false };
    const fixed = parseFixedFactExtractionProtocol(raw, diagnostics);
    if (fixed) return fixed;
    const text = sanitizeModelText(raw).replace(/\r/g, '').trim();
    diagnostics.hadInput = Boolean(text);
    if (text) diagnostics.skipped.push({ title: '协议错误', reason: '缺少唯一事实协议（事实｜类型｜稳定名称｜栏目｜建立/变化/结束｜关联对象｜完整事实）', raw: text.slice(0, 600) });
    return attachDiagnostics([], diagnostics);
}
function parseWorldSettingImportProtocol(raw) {
    const diagnostics = { repaired: 0, merged: [], skipped: [], warnings: [], hadInput: false };
    const text = sanitizeModelText(raw).replace(/\r/g, '').trim();
    if (text === protocols_1.NONE) return attachDiagnostics([], diagnostics);
    diagnostics.hadInput = Boolean(text);
    if (!text) return attachDiagnostics([], diagnostics);
    const blocks = [];
    const blockPattern = /<<<ENTRY:([^:\n>]+):([^>\n]+)>>>\n<<<KEYWORDS>>>\n([\s\S]*?)\n<<<CONTENT>>>\n([\s\S]*?)\n<<<END_ENTRY>>>/gu;
    let cursor = 0;
    let match;
    while ((match = blockPattern.exec(text))) {
        if (text.slice(cursor, match.index).trim()) {
            diagnostics.skipped.push({ title: '协议错误', reason: 'ENTRY 区块之间存在协议外文本', raw: text.slice(cursor, match.index).slice(0, 600) });
            return attachDiagnostics([], diagnostics);
        }
        cursor = blockPattern.lastIndex;
        const type = String(match[1] ?? '').trim();
        const name = String(match[2] ?? '').trim();
        const title = `${type}｜${name}`;
        if (!STRICT_TYPES.has(type) || !name || /[<>\r\n]/u.test(name)) {
            diagnostics.skipped.push({ title: title || '未知条目', reason: 'ENTRY 类型或稳定名称不符合唯一协议', raw: match[0].slice(0, 600) });
            return attachDiagnostics([], diagnostics);
        }
        const keywordLines = String(match[3] ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
        if (!keywordLines.length || keywordLines.some((line) => !/^-\s+\S/u.test(line))) {
            diagnostics.skipped.push({ title, reason: 'KEYWORDS 必须逐行使用“- 关键词”', raw: match[3].slice(0, 600) });
            return attachDiagnostics([], diagnostics);
        }
        const keywords = (0, util_1.unique)(keywordLines.map((line) => line.replace(/^-\s+/u, '').trim()).filter(Boolean));
        const allowedSections = new Set(information_point_1.TYPE_SECTION_ORDER[type] ?? []);
        const sections = [];
        let current = null;
        for (const rawLine of String(match[4] ?? '').split('\n')) {
            const line = rawLine.trim();
            if (!line) continue;
            const heading = line.match(/^【([^】]+)】$/u)?.[1]?.trim();
            if (heading) {
                if (!allowedSections.has(heading)) {
                    diagnostics.skipped.push({ title, reason: `栏目“${heading}”不属于 ${type} 的唯一栏目模板`, raw: match[4].slice(0, 600) });
                    return attachDiagnostics([], diagnostics);
                }
                current = { name: heading, lines: [], empty: false };
                sections.push(current);
                continue;
            }
            const fact = line.match(/^-\s+(.+)$/u)?.[1]?.trim();
            if (!fact || !current) {
                diagnostics.skipped.push({ title, reason: 'CONTENT 必须使用“【栏目】”后接“- 完整事实”', raw: match[4].slice(0, 600) });
                return attachDiagnostics([], diagnostics);
            }
            current.lines.push(fact);
        }
        if (!sections.length || sections.some((section) => !section.lines.length)) {
            diagnostics.skipped.push({ title, reason: 'CONTENT 缺少完整栏目事实', raw: match[4].slice(0, 600) });
            return attachDiagnostics([], diagnostics);
        }
        blocks.push({ rawTitle: title, title, type, name, sections, keywords });
        if (blocks.length > 16) {
            diagnostics.skipped.push({ title, reason: '超过世界设定导入单次16条上限' });
            return attachDiagnostics([], diagnostics);
        }
    }
    if (!blocks.length || text.slice(cursor).trim()) {
        diagnostics.skipped.push({ title: '协议错误', reason: '世界设定导入只接受唯一 ENTRY 协议', raw: text.slice(cursor).slice(0, 600) || text.slice(0, 600) });
        return attachDiagnostics([], diagnostics);
    }
    return attachDiagnostics(blocks, diagnostics);
}
function canonicalExtractionType(value) {
    const raw = String(value ?? '').trim();
    return ({ 角色: '人物', NPC: '人物', 地点: '场景', 地区: '场景', 区域: '场景', 场所: '场景', 当前场景: '场景', 道具: '物品', 装备: '物品', 事件链: '事件', 全局: '世界', 全局状态: '世界', 全局变化: '世界', 世界变化: '世界', 当前局势: '世界', 世界局势: '世界', 基础规则: '基础设定', 世界设定: '基础设定' })[raw] ?? raw;
}
const EXTRACTION_GENERIC_KEYWORDS = new Set(['人物','角色','npc','场景','地点','事件','活动','物品','道具','世界','当前','状态','关系','房间','区域','地方','男人','女人','男孩','女孩','少女','主角','配角','当前局势','世界局势','世界状态','世界变化']);
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
function attachDiagnostics(blocks, diagnostics) {
    Object.defineProperty(blocks, 'diagnostics', { value: diagnostics, enumerable: false, configurable: true });
    return blocks;
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

},"prompts":function(module,exports,require){
/**
 * Mirror Abyss — prompts
 *
 * 职责：各阶段系统/用户提示词构造。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.extractionPrompts = extractionPrompts;
exports.manualMergePrompts = manualMergePrompts;
exports.auditPrompts = auditPrompts;
exports.revisionPrompts = revisionPrompts;
exports.summaryPrompts = summaryPrompts;
exports.worldSettingImportPrompts = worldSettingImportPrompts;
exports.keywordTemplate = keywordTemplate;
const util_1 = require("./util");
const protocols_1 = require("./protocols");
const information_point_1 = require("./domain/information-point");

function summarySectionSchemaText() {
    return protocols_1.SUMMARY_TYPES
        .map((type) => `${type}：${(information_point_1.TYPE_SECTION_ORDER[type] ?? []).join('、')}`)
        .join('\n');
}

function auditPrompts(settings, playerText, assistantText, options = {}) {
    const compact = options.compact === true;
    const system = `职责：只审核当前AI正文是否明确触发玩家提供的审核规则。

只看本次提供的AI正文。不要读取、推断或引用玩家输入、聊天历史、世界书、角色卡或隐藏设定。
没有明确触发规则时判定通过；明确触发时指出问题。审核阶段不改正文。

【唯一输出协议】
${(0, protocols_1.protocolTextForStage)('audit')}`;
    const user = `【审核规则】
${clipText(settings.auditPrompt || '（无）', compact ? 2600 : 5200)}

【当前AI正文】
${clipText(assistantText || '（空）', compact ? 10000 : 16000)}`;
    return { system, user };
}

function revisionPrompts(settings, playerText, assistantText, issues, options = {}) {
    const compact = options.compact === true;
    const system = `职责：按审核指出的问题修正当前正文，并返回可直接替换原消息的完整正文。

只修正明确问题，不续写，不解释，不输出标题或报告。

【附加修正规则】
${clipText(settings.revisionPrompt || '（无）', compact ? 1500 : 3000)}`;
    const user = `【需要修正的问题】
${(issues ?? []).slice(0, compact ? 5 : 10).map((item) => `- ${clipText(item, compact ? 160 : 260)}`).join('\n')}

【当前正文】
${clipText(assistantText || '（空）', compact ? 15000 : 22000)}

只返回修正后的正文。`;
    return { system, user };
}

function extractionPrompts(settings, playerText, assistantText, relevant, options = {}) {
    const compact = options.compact === true;
    const retryReason = String(options.retryReason || '').trim();
    const existing = extractionWorldbookIndex(relevant, compact);
    const custom = clipText(String(settings.extractionPrompt || '').trim(), compact ? 420 : 760);
    const system = `职责：比较本轮处理前的当前世界书、玩家本轮回复和当前AI正文，提取当前正文已经明确建立、变化或结束的事实。

玩家回复只代表玩家做了什么或表达了什么；事实是否真正成立，以当前AI正文为准。
不要总结，不要提前粗化，不要预测，不要把可能性写成事实。

【唯一输出协议】
${(0, protocols_1.protocolTextForStage)('extraction')}

格式要求：
- 类型只能写：人物、场景、物品、事件、世界。
- 栏目必须使用对应类型的合法栏目。
- 完整快照栏目发生变化时，输出该栏目在本轮结束时仍成立的完整当前值。
- 只输出规定的事实协议，不输出标题、关键词、JSON、代码块或解释。

【合法栏目】
${summarySectionSchemaText()}${retryReason ? `

【上一次失败原因】
${clipText(retryReason, 1200)}
请根据同一份原始材料重新输出正确协议。` : ''}${custom ? `

【附加要求】
${custom}` : ''}`;
    const user = `【本轮处理前的当前世界书】
${existing || '（无）'}

【玩家本轮回复】
${playerText || '（空）'}

【当前AI正文】
${assistantText || '（空）'}

只输出当前正文实际造成的事实变化。`;
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
1. 【基础设定】只提炼这个世界长期如何运行：从玩家明确给出的材料中总结稳定的运行规律，不把局部状态、一次性结果或具体对象说明升级成基础规律。
2. 初始地区、组织、制度、权力、资源网络和公开局势写入【世界】。
3. 只有设定明确指定的一个实际开局地点写入【场景】；其他地点与地区资料写入【世界】，不因地点描述本身升级为基础设定，也不批量建立场景。
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

// [MA-SUMMARY-WHOLE-ENTRY][冻结] 完整条目协议外壳：
// 1. 小总结/人工合并：模型看到本批完整条目和临时“条目N”，未返回的原条目删除。
// 2. 大总结：使用下方大组集专用分支；只有“已有基础设定”获得条目N，若干 S 小总结组只做向上抽象材料，基石锁不自动进入提示词。
// 3. UID 永远留在插件内部；模型只返回完整最终条目，不输出 UID。
// 4. 不做标题身份匹配、逐栏目 patch、逐句移除、沉降推断或语义覆盖检查。
function summaryPrompts(kind, settings, entries, subject, recentConversation = '', options = {}) {
    const compact = options.compact === true;

    // [MA-SUMMARY-PROMPTS] 小总结与大总结各自只有一套独立提示词；不再存在第三套共享核心提示词。
    // 两者都不向模型解释内部组集结构，也不枚举可选类型；插件只负责临时编号、UID 映射和最终提交边界。
    const smallSummaryRules = `整理当前内容，提炼这个局部阶段已经形成、并且会继续影响后续的有效结果。

规则：
- 不复述流水账，不把动作过程换一种说法重新写一遍。
- 保留已经形成且会长期影响后续的人物变化、关系变化、事件后果、资源与权限变化、持续环境条件以及其他仍然有效的结果。
- 一次性过程、已经失去后续影响的细节可以不再保留；但不要为了变短而删除仍然有长期作用的信息。
- 不强行总结；没有自然形成可整理结果的内容时，可以保留现状，不新增。
- 不把局部结果继续拔高成世界整体规律。
- 不编造、不预测、不增加当前内容中没有的事实。
- 带“条目N”编号的内容需要保留或改写时，用原编号返回完整最终条目；被其他内容完整吸收后可以不返回。
- 真正需要新增独立结果时，使用“新条目1、新条目2……”。
- 每个返回条目都必须给出完整最终正文，不是补丁。

【错误示范】
原内容是某人进入封锁区域、经过核验后取得长期通行权限。错误写法：“某人进入区域并通过核验。”这只是复述过程，丢失了以后仍然有效的“长期通行权限”。另一个错误是直接写成“这个世界所有地区都实行统一通行制度”，这是把局部结果强行拔高。`;

    const largeSummaryRules = `整理当前内容，在已有结果之上继续抽象、提炼更基础、更整体、更稳定的世界运行规律。

规则：
- 不复述具体剧情，不把若干局部结果简单拼接或换一种说法重写。
- 只在材料自然支持时形成或修正更基础的整体规律；材料不足时不强行提取、不为了凑数量新增。
- 保留会长期决定世界如何继续运行的机制、约束、关系和稳定规律。
- 不把一次性、偶然或单个局部现象直接扩大成普遍规则。
- 不编造、不预测、不增加当前内容中没有的事实。
- 带“条目N”编号的内容需要保留或改写时，用原编号返回完整最终条目；被其他内容完整吸收后可以不返回。
- 真正需要新增独立结果时，使用“新条目1、新条目2……”。
- 每个返回条目都必须给出完整最终正文，不是补丁。

【错误示范】
若材料只是某个地点一次核验失败，错误写法：“这个世界实行严格身份许可制度。”这把单次局部现象强行提升成整体规律。若材料不足以支持更基础的规律，应当不新增。`;

    // [MA-LARGE-GROUP-PROMPT] 大总结使用当前大组集的数据契约，但只使用上面的独立大总结提示词。
    if (kind === 'large' && options.largeGroup && typeof options.largeGroup === 'object') {
        const largeGroup = options.largeGroup;
        const foundationEntries = entries ?? [];
        const summaryGroups = Array.isArray(largeGroup.sceneGroups) ? largeGroup.sceneGroups : [];
        const custom = String(settings.largeSummaryPrompt || '').trim();
        const system = `${largeSummaryRules}\n\n没有编号的内容只作为继续抽象的依据，不直接照抄成最终结果。正式结果写成基础设定。\n\n【输出格式】\n${(0, protocols_1.protocolTextForStage)('largeSummary')}${custom ? `\n\n【附加要求】\n${clipText(custom, compact ? 1000 : 2200)}` : ''}`;

        const foundationInput = foundationEntries.length
            ? foundationEntries.map((entry, index) => `【条目${index + 1}】\n${entry.title}\n${entry.content}`).join('\n\n')
            : '';
        const summaryInput = summaryGroups.length
            ? summaryGroups.map((group, groupIndex) => {
                const groupTitle = String(group?.sceneTitle || group?.sceneGroup || group?.groupUid || `内容${groupIndex + 1}`);
                const members = Array.isArray(group?.memberEntries) ? group.memberEntries : [];
                const body = members.length
                    ? members.map((entry) => `${entry.title}\n${entry.content}`).join('\n\n')
                    : '（空）';
                return `【内容${groupIndex + 1}｜${groupTitle}】\n${body}`;
            }).join('\n\n')
            : '';
        const combinedInput = [foundationInput, summaryInput].filter(Boolean).join('\n\n');
        const user = `【本次内容】\n${combinedInput || '（无）'}\n\n直接输出整理后的完整最终条目。`;
        return { system, user };
    }

    const custom = kind === 'small'
        ? String(settings.smallSummaryPrompt || '').trim()
        : kind === 'large'
            ? String(settings.largeSummaryPrompt || '').trim()
            : '';
    const stageName = kind === 'small' ? 'smallSummary' : kind === 'large' ? 'largeSummary' : 'manualMerge';
    const system = kind === 'small'
        ? `${smallSummaryRules}\n\n【输出格式】\n${(0, protocols_1.protocolTextForStage)(stageName)}${custom ? `\n\n【附加要求】\n${clipText(custom, compact ? 1000 : 2200)}` : ''}`
        : `职责：把玩家选中的内容直接合并整理成更少、更完整的最终条目。

你看到的“条目1、条目2……”只是本次请求用于对应输入条目的临时编号。
直接整理内容，不解释过程。

规则：
- 原条目需要保留或改写：用原临时编号返回它的完整最终条目。
- 原条目被其他内容完全合并、不再需要独立存在：不要返回它。
- 真正需要新增一个新条目：使用“新条目1、新条目2……”。
- 返回什么，系统就保存什么；本批原条目中没有返回的，系统会删除。
- 不输出删除命令。
- 不编造，不预测，不增加材料里没有的事实。
- 每个返回条目都必须给出完整最终正文，不是补丁。

【合法类型与栏目】
${summarySectionSchemaText()}

【输出格式】
${(0, protocols_1.protocolTextForStage)(stageName)}`;
    const input = (entries ?? []).map((entry, index) => `【条目${index + 1}】\n${entry.title}\n${entry.content}`).join('\n\n');
    const user = `【本次内容】\n${input}\n\n直接输出整理后的完整最终条目。`;
    return { system, user };
}

function manualMergePrompts(settings, selectedEntries, options = {}) {
    return summaryPrompts('merge', settings, selectedEntries, '', '', options);
}

// 整本世界书整理已收缩为 src/migration.js 的单次“整本输入 → 颗粒度与归属整理 → 完整最终条目”链。
// 旧的规划、分批、覆盖率、锚点与多轮重建提示词已删除。

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
    return source.map((entry) => `标题：${entry.title}\n正文：\n${String(entry.content || '（空）')}`).join('\n\n');
}

function promptContextEntries(relevant, limit) {
    const globals = relevant.filter((entry) => /^(基础设定|世界)$/u.test(String(entry?.type ?? '')));
    const ordinary = relevant.filter((entry) => !/^(基础设定|世界)$/u.test(String(entry?.type ?? '')));
    const reservedCount = limit >= 5 ? Math.min(2, globals.length) : Math.min(1, globals.length);
    return [...ordinary.slice(0, Math.max(0, limit - reservedCount)), ...globals.slice(0, reservedCount)].slice(0, limit);
}
function entryForPrompt(entry, contentLimit = 1000) {
    const keywords = (entry.keywords ?? []).filter((item) => !(0, util_1.isUidKeyword)(item));
    const lockNote = entry.bedrockLocked === true
        ? '系统权限：基石锁（系统完全只读；只有玩家主动操作可改变）'
        : '';
    return `标题：${entry.title}\n关键词：${keywords.join('、') || '无'}${lockNote ? `\n${lockNote}` : ''}\n正文：\n${clipText(entry.content || '（空）', contentLimit)}`;
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

},"protocols":function(module,exports,require){
/**
 * Mirror Abyss — protocols
 *
 * 职责：唯一模型输出协议文本。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.NONE = exports.SUMMARY_TYPES = exports.EXTRACTION_TYPES = exports.WORLD_TYPES = exports.AUDIT = exports.EXTRACTION = exports.SUMMARY = exports.SUMMARY_REWRITE = void 0;
exports.protocolTextForStage = protocolTextForStage;
exports.NONE = '无';
exports.WORLD_TYPES = Object.freeze(['人物', '场景', '物品', '事件', '世界', '基础设定']);
exports.EXTRACTION_TYPES = Object.freeze(['人物', '场景', '物品', '事件', '世界']);
exports.SUMMARY_TYPES = exports.WORLD_TYPES;
exports.AUDIT = Object.freeze({ pass: '审核结论：通过', revision: '审核结论：需要修正', issues: '问题：', issuePrefix: '- ' });
exports.EXTRACTION = Object.freeze({
    // [MA-GRANULARITY-LADDER][提取栏目契约] 细颗粒事实必须由模型直接声明语义栏目；插件只校验合法栏目，禁止下游再猜。
    establish: '事实｜类型｜稳定名称｜栏目｜建立｜关联对象｜完整事实',
    change: '事实｜类型｜稳定名称｜栏目｜变化｜关联对象｜完整事实',
    end: '事实｜类型｜稳定名称｜栏目｜结束｜关联对象｜完整事实',
});
// [MA-SUMMARY-SLOT] 总结、人工合并和整本整理都只让模型看到本次请求的临时“条目N”编号。
// UID 永远留在插件内部；模型不输出 UID、不输出删除命令。未返回的原条目由系统按临时编号删除。
exports.SUMMARY_REWRITE = Object.freeze({
    existing: '条目N｜类型｜稳定名称',
    created: '新条目N｜类型｜稳定名称',
    end: '结束条目',
});
// 人工合并、小总结与大总结共用“完整条目”输出外壳；大总结的可写范围由大组集提示词和提交层限制为基础设定。
exports.SUMMARY = exports.SUMMARY_REWRITE;

function protocolTextForStage(stage) {
    if (stage === 'audit') return `${exports.AUDIT.pass}\n或\n${exports.AUDIT.revision}\n${exports.AUDIT.issues}\n${exports.AUDIT.issuePrefix}明确问题`;
    if (stage === 'extraction') return `${exports.EXTRACTION.establish}\n${exports.EXTRACTION.change}\n${exports.EXTRACTION.end}\n或\n${exports.NONE}`;
    if (['smallSummary', 'largeSummary', 'manualMerge', 'migration'].includes(stage)) return `${exports.SUMMARY_REWRITE.existing}
【合法栏目】
- 完整最终事实
${exports.SUMMARY_REWRITE.end}

需要新建时：
${exports.SUMMARY_REWRITE.created}
【合法栏目】
- 完整最终事实
${exports.SUMMARY_REWRITE.end}`;
    return '';
}

},"recall-policy":function(module,exports,require){
/**
 * Mirror Abyss — recall-policy
 *
 * 职责：召回映射与生命周期投影。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
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
    return Number(entry?.sceneLastActiveAt || entry?.raw?.extensions?.mirrorAbyssInfoPoint?.sceneLastActiveAt || 0);
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
/**
 * Mirror Abyss — revision
 *
 * 职责：根据审核问题生成一次完整替换正文。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
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
    async revise(settings, snapshot, issues, onProgress = () => undefined) {
        this.host.assertSnapshot(snapshot, this.getSettings());
        const prompt = (0, prompts_1.revisionPrompts)(settings, snapshot.playerText, snapshot.assistantText, issues);
        const raw = await (0, model_request_1.callModel)({
            host: this.host,
            stage: 'revision',
            prompt,
            fallbackPrompt: () => (0, prompts_1.revisionPrompts)(settings, snapshot.playerText, snapshot.assistantText, issues, { compact: true }),
            settings,
            snapshot,
            profileId: settings.modelProfileId,
            sourceText: snapshot.assistantText,
        });
        this.host.assertSnapshot(snapshot, this.getSettings());
        const revisedText = parseRevisionResult(raw);
        if (revisedText === snapshot.assistantText) throw new Error('修正模型返回的正文与原正文完全相同');
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
/**
 * Mirror Abyss — semantic
 *
 * 职责：轻量语义标签与规范化辅助。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.isEventClosed = isEventClosed;
exports.countCriticalChanges = countCriticalChanges;
const util_1 = require("./util");

function isEventClosed(entry) {
    if (!entry || entry.type !== '事件') return false;
    const values = entry.sections?.values ?? {};
    // 唯一结构标准：事件存在已提交【结果】即为 closed；运行层不重新解释结果文本语义。
    return (values['结果'] ?? []).some((line) => Boolean(String(line ?? '').trim()));
}


function countCriticalChanges(plan) {
    // ui.72: 关键变化按“正文回合”计 0/1，而不是按写入操作数量累加。
    // 【当前】等易变快照属于正常流水刷新，不应推动小总结；只有身份、关系、稳定事实、
    // 事件进展/结果、长期世界结构等会跨回合保留的变化才视为关键变化回合。
    const volatileSections = /^(?:当前|当前状态|在场|当前资源|活动关联|局部约束|持有|参与|场景|未发生进展)$/u;
    const durableSections = /(?:身份|稳定|行为倾向|表达方式|关系立场|关系|固定事实|持续经历|定义|空间结构|持续变化|常驻角色|固定设施|附属人员|已发生进展|结果|时代|权力|制度|公开局势|世界变化|持续影响|范围|地理|组织|资源与交通|世界常识|自然规则|种族与生命|能力与技术|社会规则|地理框架)/u;
    for (const operation of plan?.operations ?? []) {
        if (!operation || operation.kind === 'noop' || operation.kind === 'merge-keywords' || operation.kind === 'merge-titles') continue;
        if (operation.kind === 'create-entry' || operation.kind === 'delete-entry') return 1;
        const section = String(operation.section ?? '').trim();
        if (!section || volatileSections.test(section)) continue;
        if (durableSections.test(section)) return 1;
    }
    return 0;
}


},"settings":function(module,exports,require){
/**
 * Mirror Abyss — settings
 *
 * 职责：设置存储、默认值与一次性旧提示词迁移。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
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
        { key: 'expression', label: '表达方式', policy: 'semantic-upsert' },
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
    keyword('foundation', '基础设定', '长期稳定的世界运行规律：说明这个世界通常如何运作，而不是记录某个局部当前发生了什么。', ['基础规则', '世界设定'], true, [
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
exports.DEFAULT_AUDIT_PROMPT = `只审核当前AI正文；不要读取或推断玩家回复、世界书、角色卡或其他上下文。明确触发任一条时判定 FAIL：
1. AI正文替玩家新增玩家未输入的台词、主动行动、重要决定、明确心理结论或价值判断。
2. AI正文输出选项栏、行动列表、攻略、内部检查、系统规则、自我解释、管理标签、回合编号或作者总结。
3. 正常叙事描写、NPC主动行动、NPC提问、自然段落和对白换行本身不构成违规。`;
exports.DEFAULT_REVISION_PROMPT = `只修改审核指出的明确违规部分。保留合规内容、原事件顺序、人物关系、叙事视角、语气和有效信息；不得续写、全面重写、新增人物、秘密、因果或结论。修正版必须是可直接替换原正文的完整自然正文，不得添加标签、解释、审核报告、选项或系统提示。`;
// 只兼容紧邻上一个部署包的默认提示词；更早历史版本不再迁移。
const PREVIOUS_AUDIT_PROMPT = `只做基础审核；明确触发任一条时判定 FAIL：
1. AI不得替玩家新增玩家未输入的台词、主动行动、重要决定、明确心理结论或价值判断。
2. AI不得把玩家已表达的动作、语言或选择扩大成新的关键决定。
3. AI回复不得与当前可见对话中的明确事实直接矛盾。
4. AI回复不得输出选项栏、行动列表、攻略、内部检查、系统规则、自我解释、管理标签、回合编号或作者总结。
5. 正常叙事描写、NPC主动行动、NPC提问、自然段落和对白换行本身不构成违规。
只依据当前提供的对话上下文审核；不审核角色卡、世界书或未提供的隐藏设定。`;
// [MA-SUMMARY-PROMPTS] 总结系统只有小总结和大总结两套核心提示词；这里的设置项只保留玩家可选附加要求。
// 紧邻上一部署包的旧默认值会迁移为空；玩家自己修改过的附加要求保持不动。
const PREVIOUS_SMALL_SUMMARY_PROMPT = [
    `把本场细颗粒事实整理成更少、更完整的中颗粒结果；保留继续游玩需要的已成立状态、结果与必要历史锚点。`,
    `优先抽象局部稳定结果，压缩重复与过程细节；没有可自然收束的内容时不强行总结。`,
];
exports.DEFAULT_SMALL_SUMMARY_PROMPT = ``;
const PREVIOUS_LARGE_SUMMARY_PROMPT = [
    `把多个中颗粒结果继续整理成更少、更完整的粗颗粒长期结果；保留跨阶段仍成立的变化、关系、结果与影响。`,
    `根据当前大组集中的若干个已完成小总结，继续向上抽象这个世界已经稳定形成的整体运行逻辑；只建立或更新基础设定，不复述具体剧情。`,
    `继续抽象更基础、更整体、更稳定的运行规律；材料不足时不新增，不把局部现象硬拔高成整体规律。`,
];
exports.DEFAULT_LARGE_SUMMARY_PROMPT = ``;
exports.DEFAULT_EXTRACTION_PROMPT = `按唯一协议提取本轮正文已经明确建立、变化或结束的事实；不总结、不抽象、不按长期价值筛选。`;
exports.DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    modelProfileId: '',
    autoAudit: false,
    autoExtraction: false,
    autoSmallSummary: true,
    // [MA-AUTO-LARGE-RESTORE] 最新产品决定恢复 SceneGroup 自动大总结；默认开启，按已完成小总结的场景组数量触发。
    autoLargeSummary: true,
    automationPolicyVersion: 2,
    largeSummaryCount: 4,
    autoCreateLorebook: false,
    auditPrompt: exports.DEFAULT_AUDIT_PROMPT,
    revisionPrompt: exports.DEFAULT_REVISION_PROMPT,
    extractionPrompt: exports.DEFAULT_EXTRACTION_PROMPT,
    smallSummaryPrompt: exports.DEFAULT_SMALL_SUMMARY_PROMPT,
    largeSummaryPrompt: exports.DEFAULT_LARGE_SUMMARY_PROMPT,
    responseTokens: 8192,
    requestTimeoutMs: 90000,
    queueCompactThreshold: 6,
    keywordDefinitions: exports.DEFAULT_KEYWORDS,
    sectionPolicies: {
        在场: 'replace-section', 当前资源: 'replace-section', 活动关联: 'replace-section', 世界影响: 'replace-section', 局部约束: 'replace-section',
        常驻角色: 'semantic-upsert', 固定设施: 'semantic-upsert',
        持有: 'replace-section', 参与: 'replace-section', 场景: 'replace-section', 结果: 'replace-section',
        当前: 'replace-section', 当前状态: 'replace-section', 关系: 'replace-by-anchor', 关系立场: 'replace-by-anchor',
        固定事实: 'semantic-upsert', 行为倾向: 'semantic-upsert', 表达方式: 'semantic-upsert', 已发生进展: 'semantic-upsert', 未发生进展: 'replace-section',
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
        // 单一模型路由：空值=当前 SillyTavern 连接；非空=唯一 Connection Profile。
        modelProfileId: String(candidate.modelProfileId ?? '').trim(),
        autoAudit: candidate.autoAudit === true,
        autoExtraction: candidate.autoExtraction === true,
        autoSmallSummary: true,
        autoLargeSummary: true,
        automationPolicyVersion: 2,
        largeSummaryCount: (0, util_1.clampNumber)(candidate.largeSummaryCount, 4, 2, 30),
        autoCreateLorebook: candidate.autoCreateLorebook === true,
        auditPrompt: migrateBuiltinPrompt(candidate.auditPrompt, PREVIOUS_AUDIT_PROMPT, exports.DEFAULT_AUDIT_PROMPT),
        revisionPrompt: String(candidate.revisionPrompt ?? exports.DEFAULT_REVISION_PROMPT) || exports.DEFAULT_REVISION_PROMPT,
        extractionPrompt: String(candidate.extractionPrompt ?? exports.DEFAULT_EXTRACTION_PROMPT) || exports.DEFAULT_EXTRACTION_PROMPT,
        smallSummaryPrompt: migrateBuiltinPrompt(candidate.smallSummaryPrompt, PREVIOUS_SMALL_SUMMARY_PROMPT, exports.DEFAULT_SMALL_SUMMARY_PROMPT),
        largeSummaryPrompt: migrateBuiltinPrompt(candidate.largeSummaryPrompt, PREVIOUS_LARGE_SUMMARY_PROMPT, exports.DEFAULT_LARGE_SUMMARY_PROMPT),
        responseTokens: (0, util_1.clampNumber)(candidate.responseTokens, 8192, 1024, 16384),
        requestTimeoutMs: (0, util_1.clampNumber)(candidate.requestTimeoutMs, 90000, 10000, 300000),
        queueCompactThreshold: (0, util_1.clampNumber)(candidate.queueCompactThreshold, 6, 2, 50),
        keywordDefinitions: parseKeywordDefinitions(candidate.keywordDefinitions),
        sectionPolicies,
    };
}

function migrateBuiltinPrompt(value, legacyValue, currentDefault) {
    const text = String(value ?? '').trim();
    const legacyValues = Array.isArray(legacyValue) ? legacyValue : [legacyValue];
    if (!text || legacyValues.some((item) => text === String(item ?? '').trim())) return currentDefault;
    return text;
}
function parseKeywordDefinitions(value) {
    const source = Array.isArray(value) ? value : [];
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
/**
 * Mirror Abyss — util
 *
 * 职责：通用确定性工具函数。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
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
exports.normalizeSceneLocation = normalizeSceneLocation;
exports.sceneLocationSimilarity = sceneLocationSimilarity;
exports.extractLatestSceneLocation = extractLatestSceneLocation;
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

function cleanSceneLocationText(value) {
    let text = String(value ?? '').normalize('NFKC').trim();
    if (!text) return '';
    const titled = splitTitle(text);
    if (titled && /^(?:场景|地点|地区|区域|当前场景|当前地点)$/u.test(String(titled.type ?? ''))) text = String(titled.name ?? '').trim();
    text = text
        .replace(/^#{1,6}\s*/u, '')
        .replace(/^\s*(?:[-*•·]+|\d+[.)、])\s*/u, '')
        .replace(/^\*{1,3}|\*{1,3}$/gu, '')
        .replace(/^<(?:当前场景|当前地点|当前位置|场景|地点)>\s*/u, '')
        .replace(/\s*<\/(?:当前场景|当前地点|当前位置|场景|地点)>$/u, '')
        .trim();
    // 【当前场景：A】 / [地点:B] / 【当前场景】A / （转场）A→B。
    text = text
        .replace(/^[【\[（(<「『]\s*(当前场景|当前地点|当前位置|场景切换|地点切换|场景转换|地点转换|转场|场景|地点|位置)\s*[:：]\s*(.*?)\s*[】\]）)>」』]$/u, '$2')
        .replace(/^[【\[（(<「『]\s*(当前场景|当前地点|当前位置|场景切换|地点切换|场景转换|地点转换|转场|场景|地点|位置)\s*[】\]）)>」』]\s*/u, '$1：');
    text = text.replace(/^(?:当前场景|当前地点|当前位置|场景切换|地点切换|场景转换|地点转换|转场|场景|地点|位置)\s*(?:为|是)?\s*(?:[:：|｜]|[-—―]{1,}|→|->|=>|⇒|⟶|⟹|＞|>)\s*/u, '');
    // 箭头/双破折号/竖线表示明确转换时，最终地点在最后一段；普通单连字符保留为地点名称的一部分。
    const transitionParts = text.split(/\s*(?:→|->|=>|⇒|⟶|⟹|＞|>|——+|――+|--+|｜|\|)\s*/u).map((part) => part.trim()).filter(Boolean);
    if (transitionParts.length > 1) text = transitionParts.at(-1) || text;
    let previous = '';
    while (text && previous !== text) {
        previous = text;
        text = text
            .replace(/^[【\[（(<「『《〈“”"'`]+/u, '')
            .replace(/[】\]）)>」』》〉“”"'`]+$/u, '')
            .trim();
    }
    text = text.replace(/^[：:、，,；;。.!！?？\s]+|[：:、，,；;。.!！?？\s]+$/gu, '').trim();
    // [MA-SCENE-IDENTITY-01] 场景字段允许“稳定地点，动态描述/时段/状态”。
    // 逗号后的字段变化不改变场景身份；明确箭头/转场已在上方先取最终地点。
    const stableField = text.split(/[，,]/u).map((part) => part.trim()).filter(Boolean)[0] || text;
    return stableField.slice(0, 120);
}
function normalizeSceneLocation(value) {
    return normalizeFact(cleanSceneLocationText(value))
        .replace(/[【】\[\]（）()<>《》〈〉「」『』_~]+/gu, '')
        .replace(/(?:的|所在|内部|里面|内侧)/gu, '')
        .replace(/祭台/gu, '祭坛')
        .replace(/房间/gu, '房')
        .replace(/(?:门口|门前|床边|桌边|书桌旁|窗边|角落|拐角)$/gu, '');
}
function sceneLocationSimilarity(left, right) {
    const a = normalizeSceneLocation(left);
    const b = normalizeSceneLocation(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const numsA = [...a.matchAll(/\d+/gu)].map((match) => match[0]);
    const numsB = [...b.matchAll(/\d+/gu)].map((match) => match[0]);
    // 两边都带明确地点编号时，完整编号序列必须一致；B4-01 与 B4-02 不能仅因共享“4”被判成同地点。
    if (numsA.length && numsB.length && numsA.join('|') !== numsB.join('|')) return 0;
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length > b.length ? a : b;
    if (shorter.length >= 2 && longer.includes(shorter) && shorter.length / Math.max(1, longer.length) >= 0.55) return 0.9;
    const grams = (text) => text.length < 2 ? [text] : Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2));
    const aa = grams(a);
    const bb = grams(b);
    const counts = new Map();
    for (const item of aa) counts.set(item, (counts.get(item) ?? 0) + 1);
    let overlap = 0;
    for (const item of bb) {
        const count = counts.get(item) ?? 0;
        if (count > 0) { overlap += 1; counts.set(item, count - 1); }
    }
    return aa.length && bb.length ? (2 * overlap) / (aa.length + bb.length) : 0;
}
function extractLatestSceneLocation(contextText) {
    // [MA-SCENE-BOUNDARY-LOCK] 场景边界唯一权威：只读取主预设稳定字段“地点：”。
    // 禁止把“当前地点/当前位置/场景/位置/转场/箭头行/场景条目”等任何其他文本解释为换场。
    // 本函数只做机械标签读取，不做语义猜测；没有“地点：”时返回空字符串，由上层沿用当前 SceneGroup。
    const source = String(contextText ?? '').normalize('NFKC').replace(/\r/g, '');
    if (!source.trim()) return '';
    let latest = '';
    for (const rawLine of source.split('\n')) {
        let line = String(rawLine ?? '').trim();
        if (!line) continue;
        // 只去掉纯 Markdown 外壳；字段名本身必须仍然是“地点”。
        line = line.replace(/^#{1,6}\s*/u, '').replace(/^\s*(?:[-*•·]+)\s*/u, '').replace(/^\*{1,3}|\*{1,3}$/gu, '').trim();
        const match = line.match(/^地点\s*[:：]\s*(.{1,120})$/u);
        if (!match) continue;
        const value = cleanSceneLocationText(match[1]);
        if (value) latest = value;
    }
    return latest;
}

function safeId(value) {
    return String(value ?? '').trim().replace(/[^\p{L}\p{N}_:.-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 120);
}

},"world-setting-import":function(module,exports,require){
/**
 * Mirror Abyss — world-setting-import
 *
 * 职责：玩家世界设定导入（独立 ENTRY 协议）。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
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
        let raw = '';
        let blocks = [];
        let diagnostics = { repaired: 0, merged: [], skipped: [], warnings: [], hadInput: false };
        let lastError = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const prompt = (0, prompts_1.worldSettingImportPrompts)(settings, source, selected, { compact: attempt === 1 });
            if (attempt === 1) prompt.system = `${prompt.system}\n\n上一次请求没有形成可执行的唯一 ENTRY 协议。本次从头重新读取同一份设定，只输出规定协议，不修补或引用上一次答案。`;
            try {
                raw = await (0, model_request_1.callModel)({
                    host: this.host,
                    stage: 'worldSettingImport',
                    prompt,
                    settings,
                    snapshot,
                    profileId: settings.modelProfileId,
                    sourceText: source,
                    singleAttempt: true,
                });
                this.validate(snapshot, settings);
                blocks = (0, parser_1.parseWorldSettingImportProtocol)(raw);
                diagnostics = blocks.diagnostics ?? diagnostics;
                if (blocks.length || String(raw || '').trim() === '无') break;
                lastError = new Error('世界设定导入返回不符合唯一 ENTRY 协议');
            }
            catch (error) {
                lastError = error;
            }
            if (attempt === 0) this.progress('running', (0, model_request_1.describeRetryReason)(lastError, '设定导入') + '；从同一材料干净重试一次');
        }
        if (!blocks.length) throw lastError || new Error('没有从玩家设定中解析出可预览条目');
        const sanitized = sanitizeWorldSettingBlocks(blocks, source, diagnostics);
        if (!sanitized.length) throw new Error('玩家设定没有形成可导入的有效事实条目');
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
            raw,
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
    const output = (Array.isArray(blocks) ? blocks : []).slice(0, MAX_BLOCKS).map((block) => structuredClone(block));
    for (const block of output) {
        if (!ALLOWED_TYPES.has(String(block?.type ?? ''))) throw new Error(`设定导入出现不允许的类型：${block?.type || '空'}`);
        if (!String(block?.name ?? '').trim()) throw new Error('设定导入出现缺少稳定名称的条目');
        if (!(block.sections ?? []).some((section) => (section.lines ?? []).length)) throw new Error(`设定条目“${block.title || block.name}”没有事实正文`);
        block.keywords = (0, util_1.unique)((block.keywords ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)).slice(0, 4);
        if (!block.keywords.length) block.keywords = [String(block.name)];
    }
    if (output.filter((block) => block.type === '场景').length > 1) throw new Error('设定导入协议一次只能建立一个开局场景');
    return output;
}
function blockText(block) {
    return (block.sections ?? []).flatMap((section) => (section.lines ?? []).map((line) => `【${section.name}】${line}`)).join('\n');
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
/**
 * Mirror Abyss — worldbook-management
 *
 * 职责：世界书管理视图与人工合并/删除。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
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
/**
 * Mirror Abyss — worldbook
 *
 * 职责：世界书读写、事务提交与权威回读校验。
 *
 * 架构约束：
 * - 世界书是唯一长期剧情事实源
 * - 模型是唯一主要语义解释层
 * - 插件只做确定性校验、精确匹配、事务提交与宿主边界保护
 * - 禁止相似度/包含式猜测同一对象；禁止本地推断从属吸收目标
 */
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
function entryReadProjection(entry) {
    const { raw: _raw, ...projected } = entry ?? {};
    return projected;
}
class WorldbookAdapter {
    constructor(context, chatKey) {
        this.context = context;
        this.chatKey = chatKey ?? (() => '');
        this.apiPromise = null;
    }
    async list(settings, snapshot, validate) {
        return (await this.read(settings, snapshot, validate)).entries;
    }
    // [MA-REBUILD-BASELINE] 整本世界书显式重建后，旧 S/L 属于旧组集生命周期，必须一次性清除后再建立新基线。
    async clearSummaryMarks(settings, snapshot, validate) {
        return this.mutate(settings, snapshot, validate, (opened) => {
            for (const raw of Object.values(opened.data?.entries ?? {})) {
                if (!raw || typeof raw !== 'object') continue;
                const extension = readExtension(raw);
                delete extension.summaryMark;
            }
            return { verify(data) {
                const marked = parseEntries(data).filter((entry) => entry.summaryMark === 'S' || entry.summaryMark === 'L');
                if (marked.length) throw new Error(`整本重建新基线仍残留${marked.length}个 S/L 标记`);
            } };
        });
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
        this.assertChat(snapshot?.chatKey ?? '');
        const { data, name } = await this.open(settings, false, validate, snapshot?.chatKey, snapshot?.worldbookName);
        if (snapshot?.worldbookName && name !== snapshot.worldbookName) throw new Error('读取到的世界书与任务快照不一致');
        validate?.();
        return { name, entries: parseEntries(data).map(entryReadProjection) };
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
    async replaceRaw(settings, expectedName, nextData, snapshot, validate) {
        validate?.();
        this.assertChat(snapshot?.chatKey ?? '');
        const opened = await this.open(settings, false, validate, snapshot?.chatKey, snapshot?.worldbookName);
        if (opened.name !== expectedName || (snapshot?.worldbookName && opened.name !== snapshot.worldbookName))
            throw new Error('目标世界书已经变化，拒绝恢复或整理');

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
            if (!located) throw new Error(`世界书条目 UID ${uid} 不存在`);
            if (patch.title !== undefined) located.raw.comment = String(patch.title ?? '').trim();
            if (patch.content !== undefined) located.raw.content = String(patch.content ?? '');
            if (patch.keywords !== undefined) located.raw.key = (0, util_1.normalizeStringArray)(patch.keywords);
            return { verify(data) {
                const result = findRawEntry(data, uid);
                if (!result) throw new Error(`条目 UID ${uid} 保存后丢失`);
                if (patch.title !== undefined && String(result.raw.comment ?? '') !== String(patch.title ?? '').trim()) throw new Error(`条目 UID ${uid} 的标题保存失败`);
                if (patch.content !== undefined && String(result.raw.content ?? '') !== String(patch.content ?? '')) throw new Error(`条目 UID ${uid} 正文保存失败`);
            } };
        });
    }
    // 玩家直接编辑只按原 UID 保存，不再替玩家校验标题语义或重新规划该条目的召回。
    async deleteEntries(settings, uids, snapshot, validate) {
        const requested = new Set((uids ?? []).map((uid) => String(uid ?? '')).filter(Boolean));
        if (!requested.size) return { entries: [], changed: false, deletedCount: 0, warehouse: { created: [], updated: [], deleted: [], createdCount: 0, updatedCount: 0, deletedCount: 0, operationCount: 0 } };
        let deletedTitles = [];
        let deletedEntries = [];
        const result = await this.mutate(settings, snapshot, validate, (opened) => {
            deletedTitles = [];
            deletedEntries = [];
            for (const [mapKey, raw] of Object.entries(opened.data.entries ?? {})) {
                const uid = String(raw?.uid ?? mapKey);
                if (!requested.has(uid)) continue;
                const parsed = parseEntries({ ...opened.data, entries: { [mapKey]: raw } })[0];
                if (!parsed || parsed.focus === true) continue;
                deletedTitles.push(parsed.title);
                deletedEntries.push({ uid: String(parsed.uid), title: String(parsed.title), type: String(parsed.type || '') });
                delete opened.data.entries[mapKey];
            }
            return { verify(data) {
                const remaining = new Set(parseEntries(data).map((entry) => String(entry.uid)));
                for (const uid of requested) {
                    if (remaining.has(uid)) {
                        const original = parseEntries(data).find((entry) => String(entry.uid) === uid);
                        if (original?.focus === true) continue;
                        throw new Error(`条目 UID ${uid} 删除后仍存在`);
                    }
                }
            } };
        });
        result.deletedCount = deletedTitles.length;
        result.deletedEntries = deletedEntries;
        result.warehouse = { ...(result.warehouse ?? {}), deleted: deletedTitles, deletedCount: deletedTitles.length };
        return result;
    }
    async setBedrockLocked(settings, uid, locked, snapshot, validate) {
        return this.mutate(settings, snapshot, validate, (opened) => {
            const located = findRawEntry(opened.data, uid);
            if (!located) throw new Error(`世界书条目 UID ${uid} 不存在`);
            ensureUidIdentity(located.raw, String(located.raw.uid ?? uid), (0, util_1.stripUidSuffix)(String(located.raw.comment ?? '')));
            const previousUpdatedAt = Number(readExtension(located.raw).updatedAt) || 0;
            const extension = markManaged(located.raw, '', (0, util_1.stripUidSuffix)(String(located.raw.comment ?? '')), '');
            if (previousUpdatedAt) extension.updatedAt = previousUpdatedAt;
            extension.bedrockLocked = locked === true;
            delete extension.locked;
            const parsed = parseEntries(opened.data);
            const focusedUid = parsed.find((entry) => entry.focus)?.uid ?? '';
            this.applyNativeFields(parsed, settings, focusedUid, new Set());
            return {
                verify(data) {
                    const result = findRawEntry(data, uid);
                    if (!result || readExtension(result.raw).bedrockLocked !== (locked === true))
                        throw new Error(`条目 UID ${uid} 的基石锁状态保存失败`);
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
        const beforeData = (0, util_1.clone)(opened.data);
        const verifier = mutate(opened) ?? {};
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
        const beforeData = (0, util_1.clone)(opened.data);
        const receiptBefore = snapshotRawEntries(opened.data);
        const before = parseEntries(opened.data);
        plan = { ...plan, operations: guardSystemOperations(plan.operations, before, options) };
        const writeOperations = plan.operations.filter((operation) => !['noop', 'delete-entry'].includes(operation.kind));
        const exitOperations = plan.operations.filter((operation) => operation.kind === 'delete-entry');
        const operationId = commitOperationId(sourceMessageKey, plan.operations);
        let expectedAfterWrites = before;
        const touchedUids = new Set(writeOperations.filter((operation) => operation.targetUid).map((operation) => String(operation.targetUid)));
        const createdUids = new Set();
        // [MA-SUMMARY-UID-MARK-03] 正常提取更新代表 UID 内容进入了新剧情状态，因此清除旧 S/L；
        // 小总结把本次实际输出标为 S，大总结把本次实际输出标为 L。其他人工维护不擅自改处理痕迹。
        const summaryWriteMark = options.rebalanceKind === 'small' ? 'S' : options.rebalanceKind === 'large' ? 'L' : '';
        const clearSummaryMarkOnWrite = options.sourceKind === 'extraction';
        // [MA-LARGE-GROUP-MARK] 大总结来源 S 场景条目不参与正文改写；只在本次基础设定提交事务里统一 S→L。
        const largeSummarySourceUids = new Set((options.largeSummarySourceUids ?? [])
            .map((uid) => String(uid ?? '').trim()).filter(Boolean));
        const applySummaryMarkToRaw = (raw) => {
            const extension = readExtension(raw);
            if (summaryWriteMark) extension.summaryMark = summaryWriteMark;
            else if (clearSummaryMarkOnWrite) delete extension.summaryMark;
        };

        if (writeOperations.length) {
            const phasePlan = { ...plan, operations: writeOperations };
            // v3：正文提取阶段先保留可连线事实点，不在大场景结束前提前压缩固定事实。
            // 容量治理后移到小/大总结与显式整理，避免时间线 factHash 在结算前失去宿主。
            const projectionSettings = settings;
            const manualAuthorized = new Set((options.manualAuthorizedUids ?? []).map((uid) => String(uid ?? '')).filter(Boolean));
            const projectionEntries = options.sourceKind === 'manual-merge'
                ? before.map((entry) => manualAuthorized.has(String(entry.uid)) ? { ...entry, bedrockLocked: false, locked: false } : entry)
                : before;
            expectedAfterWrites = (0, operations_1.applyPlanToEntries)(phasePlan, projectionEntries, projectionSettings);
            const byUid = new Map(before.map((entry) => [entry.uid, entry]));
            for (const entry of expectedAfterWrites) {
                if (entry.uid.startsWith('new:')) {
                    const created = this.createEntry(opened.api, opened.name, opened.data);
                    hydrateRaw(created, entry, sourceMessageKey, operationId);
                    applySummaryMarkToRaw(created);
                    entry.uid = String(created.uid);
                    entry.mapKey = findMapKey(opened.data, created);
                    entry.raw = created;
                    createdUids.add(entry.uid);
                }
                else if (touchedUids.has(entry.uid)) {
                    const original = byUid.get(entry.uid);
                    if (!original) throw new Error(`待更新条目 UID ${entry.uid} 不存在`);
                    hydrateRaw(original.raw, entry, sourceMessageKey, operationId);
                    applySummaryMarkToRaw(original.raw);
                    // [MA-SCENE-REAL-01] 后续场景活动时间与扩展字段必须写到真实世界书对象，不能停留在投影副本。
                    entry.raw = original.raw;
                    entry.mapKey = original.mapKey;
                }
            }


            // ui.98: 玩家通过“世界设定”入口建立的初始基础设定默认基石锁；其他条目不自动锁。
            if (options.sourceKind === 'setting-import') {
                for (const entry of expectedAfterWrites) {
                    const uid = String(entry.uid ?? '');
                    if (!createdUids.has(uid) && !touchedUids.has(uid)) continue;
                    const extension = markManaged(entry.raw, sourceMessageKey, entry.title, operationId);
                    extension.settingImportSource = true;
                    delete extension.locked;
                    if (String(entry.type ?? '') === '基础设定') {
                        extension.initialFoundation = true;
                        extension.bedrockLocked = true;
                        entry.initialFoundation = true;
                        entry.bedrockLocked = true;
                        entry.locked = true;
                    }
                }
            }
            // ui.98: 大总结产生/更新的非初始基础设定标记为演化型基础设定。
            if (options.sourceKind === 'summary' && options.rebalanceKind === 'large') {
                for (const entry of expectedAfterWrites) {
                    const uid = String(entry.uid ?? '');
                    if ((!createdUids.has(uid) && !touchedUids.has(uid)) || String(entry.type ?? '') !== '基础设定' || entry.initialFoundation === true) continue;
                    const extension = markManaged(entry.raw, sourceMessageKey, entry.title, operationId);
                    extension.evolvedFoundation = true;
                    entry.evolvedFoundation = true;
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
                const manualAuthorized = options.sourceKind === 'manual-merge' && (options.manualAuthorizedUids ?? []).map(String).includes(String(target?.uid ?? ''));
                if (!target || target.focus || target.uid === String(focusUid ?? '')) continue;
                if (!manualAuthorized && target.bedrockLocked) continue;
                delete opened.data.entries[target.mapKey];
                deleted.push({ uid: target.uid, title: target.title, type: String(target.type || '') });
            }
            deletedCount = deleted.length;
        }

        // [MA-LARGE-GROUP-MARK] 大总结成功写基础设定时，同一事务把本轮材料的当前 S 状态改成 L。
        // 这里不碰标题/正文，也不把来源场景条目塞进大总结写回计划。
        let largeSummaryMarkedCount = 0;
        if (largeSummarySourceUids.size) {
            const currentEntries = parseEntries(opened.data);
            for (const entry of currentEntries) {
                if (!largeSummarySourceUids.has(String(entry.uid ?? ''))) continue;
                const extension = readExtension(entry.raw);
                if (String(extension.summaryMark || '') !== 'S') continue;
                extension.summaryMark = 'L';
                largeSummaryMarkedCount += 1;
            }
        }

        const businessChanged = writeOperations.length > 0 || deletedCount > 0 || largeSummaryMarkedCount > 0;
        const changed = businessChanged;
        if (!changed) {
            const result = parseEntries(opened.data);
            result.changed = false;
            result.businessChanged = false;
            result.worldbookName = opened.name;
            result.writeCount = 0;
            result.deleteCount = 0;
            result.warehouse = { created: [], updated: [], deleted: [], createdCount: 0, updatedCount: 0, deletedCount: 0, operationCount: 0 };
            result.businessChanges = [];
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
        const verifiedData = await this.commitWithRollback(opened, beforeData, validate, (data) => {
            // Verify against the complete plan so an entry intentionally
            // settled/deleted after its final write is not falsely required
            // to remain present in the authoritative reread.
            verifyWriteResults(data, expectedAfterWrites, plan.operations);
            verifyExitResults(data, deleted);
            if (largeSummarySourceUids.size) {
                const verifiedByUid = new Map(parseEntries(data).map((entry) => [String(entry.uid), entry]));
                for (const uid of largeSummarySourceUids) {
                    const sourceEntry = verifiedByUid.get(uid);
                    if (!sourceEntry) throw new Error(`大总结来源 UID ${uid} 在提交后不存在`);
                    if (String(sourceEntry.summaryMark || '') !== 'L') throw new Error(`大总结来源 UID ${uid} 未完成 S→L`);
                }
            }
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
        result.businessChanges = [
            ...result.filter((entry) => createdUids.has(String(entry.uid))).map((entry) => ({ uid: String(entry.uid), action: 'create', title: String(entry.title), type: String(entry.type || '') })),
            ...result.filter((entry) => touchedUids.has(String(entry.uid)) && !createdUids.has(String(entry.uid))).map((entry) => ({ uid: String(entry.uid), action: 'update', title: String(entry.title), type: String(entry.type || '') })),
            ...deleted.map((entry) => ({ uid: String(entry.uid), action: 'delete', title: String(entry.title), type: String(entry.type || '') })),
        ];
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
    async rollbackReceipts(settings, receipts, focusUid, snapshot, validate, options = {}) {
        const ordered = (Array.isArray(receipts) ? receipts : []).filter((item) => item && Array.isArray(item.changes) && item.changes.length);
        if (!ordered.length) return { entries: [], changed: false, rolledBack: 0 };
        const detached = options.detached === true;
        if (!detached) {
            validate?.();
            this.assertChat(snapshot?.chatKey ?? '');
        }
        let opened;
        if (detached) {
            const name = String(snapshot?.worldbookName ?? ordered.find((item) => item?.worldbookName)?.worldbookName ?? '').trim();
            if (!name) throw new Error('脱离当前聊天回滚缺少原世界书名称');
            const api = await this.api();
            const data = await loadWorldInfoAuthoritative(api, name);
            if (!data) throw new Error(`世界书“${name}”不存在，无法执行脱离当前聊天回滚`);
            data.entries ?? (data.entries = {});
            opened = { api, name, data };
        }
        else {
            opened = await this.open(settings, false, validate, snapshot?.chatKey, snapshot?.worldbookName);
        }
        if (snapshot?.worldbookName && opened.name !== snapshot.worldbookName) throw new Error('目标世界书已经变化，拒绝回滚');
        if (ordered.some((item) => item.worldbookName && item.worldbookName !== opened.name)) throw new Error('近期写入回执属于其他世界书');
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
                // [MA-TURN-UID-ROLLBACK] 玩家撤回剧情时，历史 UID 前态就是回滚权威。
                // 不再要求当前条目必须等于当时的 afterDigest；玩家后来手改过同一个 UID 也直接恢复该回合之前的快照。
                if (!change.before) {
                    // 本回合之前不存在这个 UID：撤回时直接删除，不再受后来锁定/焦点状态阻挡。
                    if (!current) { alreadyRolledBack += 1; continue; }
                    delete opened.data.entries[current.mapKey];
                    changedCount += 1;
                    continue;
                }
                const restored = structuredClone(change.before);
                // [MA-TURN-UID-ROLLBACK] 恢复该 UID 在本回合第一次修改前的完整原始条目；不保留后来人为改动的锁/焦点/正文。
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
        // UID 前态是完整原始条目快照；回滚不再二次重算召回字段，否则就不是“恢复到回合前”。
        const restoredEntries = parseEntries(opened.data);
        if (!detached) validate?.();
        // [MA-ROLLBACK-FAST] 回滚入口已经取消并清空当前聊天任务；opened.data 本身就是本次唯一权威读取。
        // 不再在保存前重复完整回读一次世界书，避免 UID 恢复被额外宿主 I/O 拖慢。
        if (!detached) validate?.();
        let verified = null;
        try {
            await this.save(opened, { refreshEditor: false });
            if (!detached) validate?.();
            verified = await loadWorldInfoAuthoritative(opened.api, opened.name);
            if (!verified || digestWorldbook(verified) !== digestWorldbook(opened.data)) throw new Error('世界书回滚后权威回读不一致');
        } catch (error) {
            opened.data = (0, util_1.clone)(beforeData);
            try { await this.save(opened, { refreshEditor: false }); } catch { }
            throw new Error(`世界书回滚失败：${(0, util_1.errorText)(error)}`);
        }
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
            extension.relatedIds = (0, util_1.unique)([
                ...(relationIndex.get(String(entry.uid)) ?? new Set()),
                ...(entry.parentUid ? [String(entry.parentUid)] : []),
                ...(Array.isArray(entry.childUids) ? entry.childUids.map(String) : []),
            ]).filter((uid) => uid && uid !== String(entry.uid));
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
                await verifyPersistedWorldbookBinding(context, metadataKey, name, name);
            }
            catch (error) {
                restoreWorldbookBinding(metadataRef, metadataKey, hadMetadataKey, previousMetadataKey, hadWorldInfo, previousWorldInfo);
                if (this.chatKey() !== bindingChatKey || this.context().chatMetadata !== metadataRef)
                    throw new Error(`世界书已经创建，但聊天绑定保存失败；已恢复原聊天内存，未向新聊天反向保存：${(0, util_1.errorText)(error)}`);
                try {
                    await context.saveMetadata();
                    await verifyPersistedWorldbookBinding(
                        context, metadataKey,
                        hadMetadataKey ? previousMetadataKey : undefined,
                        hadWorldInfo ? previousWorldInfo : undefined,
                    );
                }
                catch (rollbackError) {
                    throw new Error(`世界书已经创建，但聊天绑定保存失败，且旧绑定反向保存失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackError)}`);
                }
                throw new Error(`世界书已经创建，但聊天绑定保存失败；已恢复并重新保存旧绑定：${(0, util_1.errorText)(error)}`);
            }
        }
        return { api, name, data, chatKey: String(expectedChatKey || this.chatKey() || '') };
    }
    createEntry(api, name, data) {
        if (typeof api.createWorldInfoEntry !== 'function') throw new Error('SillyTavern 未提供 createWorldInfoEntry');
        const entry = api.createWorldInfoEntry(name, data);
        if (!entry) throw new Error('世界书条目创建失败');
        return entry;
    }
    async save(opened, options = {}) {
        if (typeof opened.api.saveWorldInfo !== 'function') throw new Error('SillyTavern 未提供 saveWorldInfo');
        await opened.api.saveWorldInfo(opened.name, opened.data, true);
        const context = this.context();
        // 世界书运行态必须立即同步给 SillyTavern；只允许后台回滚跳过耗时的编辑器 DOM 重载。
        await context.updateWorldInfoList?.();
        if (options.refreshEditor !== false) await context.reloadWorldInfoEditor?.(opened.name, false);
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
function guardSystemOperations(operations, entries, options = {}) {
    const sourceKind = String(options?.sourceKind ?? '');
    const summaryKind = String(options?.rebalanceKind ?? '');
    const manualAuthorized = new Set((options?.manualAuthorizedUids ?? []).map((uid) => String(uid ?? '')).filter(Boolean));
    const byUid = new Map((entries ?? []).map((entry) => [String(entry.uid ?? ''), entry]));
    const asNoop = (operation, reason) => ({ ...operation, kind: 'noop', operation: 'no-op', reason });
    return (operations ?? []).map((operation) => {
        if (!operation || operation.kind === 'noop') return operation;
        const split = (0, util_1.splitTitle)(String(operation.title ?? ''));
        const existing = operation.targetUid ? byUid.get(String(operation.targetUid)) : null;
        const type = String(existing?.type ?? split?.type ?? '');
        const playerSettingImport = sourceKind === 'setting-import';
        const playerManualMerge = sourceKind === 'manual-merge' && existing && manualAuthorized.has(String(existing.uid));
        if (!playerSettingImport && type === '基础设定' && (sourceKind === 'extraction' || summaryKind === 'small')) {
            return asNoop(operation, '基础设定只允许玩家设定导入或大总结处理');
        }
        if (playerSettingImport || !existing || playerManualMerge) return operation;
        if (existing.bedrockLocked === true) return asNoop(operation, '基石锁：系统完全只读');
        return operation;
    });
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
        // [MA-SUMMARY-UID-MARK-01] S/L 只是 UID 当前内容的处理痕迹：S=当前状态已小总结，L=当前状态已大总结。
        // 标记不改变真实 UID，不进入模型正文；完整条目快照回滚时会随原始扩展字段一起恢复。
        const summaryMark = /^(?:S|L)$/u.test(String(extension.summaryMark ?? '').trim()) ? String(extension.summaryMark).trim() : '';
        const storedKeywords = (0, util_1.normalizeStringArray)(extension.recallKeywords);
        output.push({ uid: String(raw.uid ?? mapUid), mapKey: String(mapUid), title, normalizedTitle: title.toLocaleLowerCase(), type: split.type, name: split.name, content, sections, keywords: (0, util_1.unique)([split.name, ...triggerKeywords, ...storedKeywords]), triggerKeywords, aliases, references: (0, entry_section_1.extractReferences)(content, split.type), focus: extension.focus === true, bedrockLocked: extension.bedrockLocked === true, locked: extension.bedrockLocked === true, initialFoundation: extension.initialFoundation === true, settingImportLocked: extension.settingImportLocked === true, evolvedFoundation: extension.evolvedFoundation === true, managed: extension.managed === true, summaryMark, updatedAt: Number(extension.updatedAt) || 0, memoryTier: String(extension.memoryTier ?? ''), lifecycle: String(extension.lifecycle ?? ''), semanticRole: String(extension.semanticRole ?? ''), storageRole: String(extension.storageRole ?? ''), entityClass: String(extension.entityClass ?? ''), hostSceneTitle: String(extension.hostSceneTitle ?? ''), sceneLastActiveAt: Number(extension.sceneLastActiveAt) || 0, parentUid: String(extension.parentUid ?? ''), childUids: Array.isArray(extension.childUids) ? extension.childUids.map(String) : [], relatedIds: Array.isArray(extension.relatedIds) ? extension.relatedIds.map(String) : [], sceneStage: String(extension.sceneStage ?? ''), chatKey: String(extension.chatKey ?? ''), recallProfile: String(extension.recallProfile ?? ''), activation: { enabled: raw.disable !== true, constant: raw.constant === true, selective: raw.selective === true, vectorized: raw.vectorized === true, recursive: raw.recursive === true || (raw.preventRecursion !== true && raw.excludeRecursion !== true), preventRecursion: raw.preventRecursion === true, excludeRecursion: raw.excludeRecursion === true, delayUntilRecursion: finiteNumber(raw.delayUntilRecursion, 0), depth: Math.max(0, finiteNumber(raw.depth, 4)), order: finiteNumber(raw.order, 400), position: finiteNumber(raw.position, 0), role: finiteNumber(raw.role, 0), scanDepth: raw.scanDepth == null ? null : finiteNumber(raw.scanDepth, null), probability: finiteNumber(raw.probability, 100), useProbability: raw.useProbability !== false, disabled: raw.disable === true }, raw });
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
    delete extension.locked;
    extension.bedrockLocked = entry.bedrockLocked === true;
    extension.focus = entry.focus;
    if (entry.initialFoundation === true) extension.initialFoundation = true;
    if (entry.settingImportLocked === true) extension.settingImportLocked = true;
    if (entry.evolvedFoundation === true) extension.evolvedFoundation = true;
    if (entry.parentUid) extension.parentUid = String(entry.parentUid);
    if (Array.isArray(entry.childUids)) extension.childUids = (0, util_1.unique)(entry.childUids.map(String).filter(Boolean));
}
function markManaged(raw, sourceMessageKey, title, operationId) {
    const extensions = (raw.extensions ?? (raw.extensions = {}));
    const current = extensions[constants_1.WORLD_INFO_EXTENSION_KEY];
    const extension = current && typeof current === 'object' ? current : {};
    extensions[constants_1.WORLD_INFO_EXTENSION_KEY] = { ...extension, managed: true, version: constants_1.MANAGED_VERSION, title, ...(sourceMessageKey ? { sourceMessageKey } : {}), ...(operationId ? { lastOperationId: operationId } : {}), updatedAt: Date.now() };
    return extensions[constants_1.WORLD_INFO_EXTENSION_KEY];
}
function readExtension(raw) { const value = raw.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY]; return value && typeof value === 'object' ? value : {}; }
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
        // [MA-SUMMARY-UID-MARK-05] S/L 属于 UID 当前版本的一部分；快照比较必须能看到标记变化，回滚才能恢复对应时点的处理状态。
        summaryMark: /^(?:S|L)$/u.test(String(extension.summaryMark ?? '').trim()) ? String(extension.summaryMark).trim() : '',
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
function verifyWriteResults(data, expectedEntries, operations) {
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
        if ((0, util_1.normalizeTitle)(found.title) !== (0, util_1.normalizeTitle)(item.title)) throw new Error(`世界书标题未正确落盘：${item.title}`);
        if (normalizeContent(found.content) !== normalizeContent((0, parser_1.serializeEntrySections)(item.sections))) throw new Error(`世界书正文未正确落盘：${item.title}`);
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
async function readPersistedWorldbookChatMetadata(context) {
    if (typeof globalThis.fetch !== 'function' || typeof context?.getRequestHeaders !== 'function') return null;
    const chatIdRaw = context.getCurrentChatId?.() ?? context.chatId;
    const chatId = String(chatIdRaw ?? '').replace(/\.jsonl$/iu, '').trim();
    if (!chatId) return null;
    const isGroup = context.groupId !== null && context.groupId !== undefined;
    const character = !isGroup ? context.characters?.[context.characterId] ?? null : null;
    const avatar = !isGroup ? String(character?.avatar ?? '').trim() : '';
    if (!isGroup && !avatar) return null;
    const endpoint = isGroup ? '/api/chats/group/get' : '/api/chats/get';
    const body = isGroup
        ? { id: chatId }
        : { ch_name: String(character?.name ?? context.name2 ?? ''), file_name: chatId, avatar_url: avatar };
    const response = await globalThis.fetch(endpoint, { method: 'POST', headers: context.getRequestHeaders(), body: JSON.stringify(body), cache: 'no-cache' });
    if (!response?.ok) throw new Error(`世界书绑定权威回读失败：HTTP ${response?.status ?? 'unknown'}`);
    const data = await response.json();
    if (!Array.isArray(data) || !data.length) throw new Error('世界书绑定权威回读为空');
    return data[0]?.chat_metadata && typeof data[0].chat_metadata === 'object' ? data[0].chat_metadata : {};
}
async function verifyPersistedWorldbookBinding(context, metadataKey, expectedMetadataKey, expectedWorldInfo) {
    const metadata = await readPersistedWorldbookChatMetadata(context);
    if (metadata === null) return false;
    const normalize = (value) => value === undefined || value === null ? '' : String(value);
    if (normalize(metadata?.[metadataKey]) !== normalize(expectedMetadataKey) || normalize(metadata?.world_info) !== normalize(expectedWorldInfo))
        throw new Error('世界书绑定保存后权威回读不一致');
    return true;
}
function normalizeContent(value) { return String(value ?? '').replace(/\r/g, '').trim(); }
function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

}};
var MA_CACHE=Object.create(null);
function maResolve(from,spec){if(!spec.startsWith('.'))return spec;var base=from.split('/');base.pop();for(var part of spec.split('/')){if(!part||part==='.')continue;if(part==='..')base.pop();else base.push(part)}var id=base.join('/');return id.endsWith('.js')?id.slice(0,-3):id}
function maRequire(id){if(MA_CACHE[id])return MA_CACHE[id].exports;var factory=MA_MODULES[id];if(!factory)throw new Error('内部模块不存在：'+id);var module={exports:{}};MA_CACHE[id]=module;factory(module,module.exports,function(spec){return maRequire(maResolve(id,spec))});return module.exports}
var MA_ENTRY=maRequire('index');
export const onActivate=()=>MA_ENTRY.onActivate();
export const onEnable=()=>MA_ENTRY.onEnable();
export const onDisable=()=>MA_ENTRY.onDisable();
export const onDelete=()=>MA_ENTRY.onDelete();
export const onInstall=()=>MA_ENTRY.onInstall();
export const onUpdate=()=>MA_ENTRY.onUpdate();
export const onClean=()=>MA_ENTRY.onClean();
