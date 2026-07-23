/**
 * 模块职责：统一解释和推进历史失效/恢复工作流。
 * 维护边界：本模块只管理流程状态，不修改事实、快照、总结或世界书内容。
 *
 * 当前持久化仍沿用 historyInvalidation/historyRecovery 两个旧字段；所有业务代码应通过
 * 本模块读写，避免两个字段在不同调用点各自演化。后续可在不改调用方的前提下收敛为单字段。
 */
import { nowIso } from '../core/utils.js';
export function readHistoryWorkflow(state) {
    const invalidation = state?.historyInvalidation;
    const recovery = state?.historyRecovery;
    if (recovery) {
        const status = recovery.phase === 'failed'
            ? 'failed'
            : recovery.phase === 'partial'
                ? 'partial'
                : 'rebuilding';
        return {
            status,
            blocked: true,
            running: status === 'rebuilding',
            invalidation,
            recovery,
            startIndex: invalidation?.startIndex ?? recovery.startIndex,
            phase: recovery.phase,
            automatic: Boolean(invalidation?.automatic),
            pauseError: invalidation?.pauseError,
            error: recovery.error,
        };
    }
    if (invalidation) {
        return {
            status: 'invalid',
            blocked: true,
            running: false,
            invalidation,
            startIndex: invalidation.startIndex,
            automatic: Boolean(invalidation.automatic),
            pauseError: invalidation.pauseError,
        };
    }
    return { status: 'clean', blocked: false, running: false, automatic: false };
}
export function historyWorkflowBlocked(state) {
    return readHistoryWorkflow(state).blocked;
}
export function historyRecoveryRunning(state) {
    return readHistoryWorkflow(state).running;
}
export function historyBlockedMessage(state) {
    const workflow = readHistoryWorkflow(state);
    return workflow.startIndex === undefined
        ? '历史数据已失效，请先选择历史重算起点'
        : `历史数据已失效，请从第 ${workflow.startIndex + 1} 条消息开始重算`;
}
export function invalidateHistoryWorkflow(state, input) {
    delete state.historyRecovery;
    state.historyInvalidation = {
        ...input,
        detectedAt: input.detectedAt || nowIso(),
    };
    return state.historyInvalidation;
}
export function setHistoryPauseError(state, error) {
    if (!state.historyInvalidation)
        return;
    if (error)
        state.historyInvalidation.pauseError = error;
    else
        delete state.historyInvalidation.pauseError;
}
export function resolveLatestHistoryInvalidation(state, messageIndex) {
    const invalidation = state.historyInvalidation;
    if (!invalidation || invalidation.startIndex !== messageIndex || invalidation.reason === 'deleted')
        return false;
    delete state.historyInvalidation;
    return true;
}
export function beginHistoryRecovery(state, input) {
    state.historyRecovery = {
        ...input,
        updatedAt: input.updatedAt || nowIso(),
    };
    return state.historyRecovery;
}
export function updateHistoryRecovery(state, patch) {
    if (!state.historyRecovery)
        return undefined;
    Object.assign(state.historyRecovery, patch, { updatedAt: patch.updatedAt || nowIso() });
    return state.historyRecovery;
}
export function failHistoryRecovery(state, error, patch = {}) {
    return updateHistoryRecovery(state, { ...patch, phase: 'failed', error });
}
export function markHistoryRecoveryPartial(state, error) {
    return updateHistoryRecovery(state, { phase: 'partial', error });
}
export function interruptHistoryRecovery(state, reason) {
    const workflow = readHistoryWorkflow(state);
    if (!workflow.running)
        return false;
    failHistoryRecovery(state, reason);
    return true;
}
export function chooseHistoryRecalculationStart(state, startIndex) {
    if (!state.historyInvalidation)
        throw new Error('当前没有待处理的历史失效');
    state.historyInvalidation.startIndex = startIndex;
    delete state.historyRecovery;
}
export function completeHistoryWorkflow(state) {
    delete state.historyInvalidation;
    delete state.historyRecovery;
}
