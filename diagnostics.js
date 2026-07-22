/**
 * 模块职责：生成任务、请求、设置与运行状态诊断。
 * 维护边界：诊断不得包含提示词、玩家正文、角色正文、总结全文、完整响应或密钥。
 */
import { VERSION } from '../constants.js';
import { enabledTables, normalizeTableRegistry } from '../domain/table-registry.js';
import { currentChatKey, getSettings, tryGetContext } from '../core/context.js';
import { getChatState } from '../storage/repository.js';
import { taskQueue } from '../pipeline/task-queue.js';
import { requestTraceReport } from '../llm/generator.js';
import { readHistoryWorkflow } from '../workflow/history-workflow.js';
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
export async function runDiagnostics() {
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
export async function diagnosticReport() {
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
//# sourceMappingURL=diagnostics.js.map