/**
 * 模块职责：镜渊业务主链：触发、审核、修正、状态提交、派生排队、历史失效与重算。
 * 维护边界：事实与状态必须先提交；总结和世界书失败不得回滚核心结果。
 */
import { LEGACY_MODULE_NAME, MODULE_NAME, PIPELINE_VERSION } from '../constants.js';
import { assertArtifactCommitCurrent, assertHistoryRevisionCurrent, bindArtifactHistoryRevision, bindArtifactTaskGuard, CommitRejectedError, currentHistoryRevision, invalidateHistoryRevision, persistChatFor, persistMetadataFor, unbindArtifactHistoryRevision, unbindArtifactTaskGuard, } from '../core/commit-guard.js';
import { currentChatKey, getChat, getChatMetadataNamespace, getContext, getMessage, getSettings, isProcessableAssistantMessage, latestAssistantIndex, messageFingerprint, messageIdentity, toast, } from '../core/context.js';
import { nowIso, toErrorMessage } from '../core/utils.js';
import { abortActiveAutomaticSummaryRequests, abortActiveBusinessRequests, abortActiveRequests } from '../core/requests.js';
import { attachArtifactToMessage, createArtifact, getAttachedArtifact, markStage } from '../domain/artifact.js';
import { firstInconsistentArtifactIndex } from '../domain/history.js';
import { beginHistoryRecovery, chooseHistoryRecalculationStart as chooseHistoryWorkflowStart, completeHistoryWorkflow, failHistoryRecovery, historyBlockedMessage, interruptHistoryRecovery, invalidateHistoryWorkflow, markHistoryRecoveryPartial, readHistoryWorkflow, resolveLatestHistoryInvalidation as resolveLatestHistoryLock, setHistoryPauseError, updateHistoryRecovery, } from '../workflow/history-workflow.js';
import { invalidateFactsAfterMessages, mergeInternalFacts, normalizeInternalFacts } from '../domain/internal-facts.js';
import { applyAuditFailureAction, runAudit } from './audit.js';
import { runRevisionFlow } from './revision.js';
import { applyLorebookMaintenance as applyLorebookMaintenanceForArtifact, clearCurrentChatLorebookEntries, pauseCurrentChatLorebookEntries, previewLorebookMaintenance as previewLorebookMaintenanceForArtifact, syncLorebook, } from './lorebook.js';
import { hasEligibleLargeSummary, hasEligibleSmallSummary, maybeRunSummaries, rebuildEligibleSummaries, runSummaryStage } from './summary.js';
import { runStateExtraction } from './state.js';
import { TaskBlockedError, TaskSkippedError, taskQueue } from './task-queue.js';
import { getChatState, putArtifact, putChatState } from '../storage/repository.js';
import { resolveHostControl } from '../domain/host-control.js';
const listeners = new Set();
const scheduledMessageTimers = new Map();
function removeSourceListener(source, event, handler) {
    if (typeof source?.off === 'function')
        source.off(event, handler);
    else
        source?.removeListener?.(event, handler);
}
function cancelScheduledMessagesForChat(chatKey) {
    let cancelled = 0;
    for (const [key, timer] of scheduledMessageTimers) {
        if (!key.startsWith(`${chatKey}:`))
            continue;
        window.clearTimeout(timer);
        scheduledMessageTimers.delete(key);
        cancelled += 1;
    }
    return cancelled;
}
function cancelScheduledMessagesOutsideChat(chatKey) {
    let cancelled = 0;
    for (const [key, timer] of scheduledMessageTimers) {
        if (key.startsWith(`${chatKey}:`))
            continue;
        window.clearTimeout(timer);
        scheduledMessageTimers.delete(key);
        cancelled += 1;
    }
    return cancelled;
}
const INTERRUPTED_STAGE_MESSAGE = '页面刷新、插件重启或聊天切换中断了旧任务，请从失败阶段继续';
/**
 * 运行时任务不会跨页面刷新或插件重启继续执行。进入一个聊天时，把持久化的 queued/running
 * 还原为可重试终态，避免 UI 永久显示“正在处理”；正式事实、状态和世界书凭证保持不变。
 */
export async function reconcileInterruptedRuntimeState(reason = INTERRUPTED_STAGE_MESSAGE) {
    const chatKey = currentChatKey();
    const chat = getChat();
    let changedArtifacts = 0;
    let firstChangedIndex = chat.length;
    for (let index = 0; index < chat.length; index += 1) {
        const artifact = getAttachedArtifact(chat[index]);
        if (!artifact || artifact.chatKey !== chatKey)
            continue;
        let changed = false;
        for (const stage of ['audit', 'revision', 'state', 'summary', 'sync']) {
            const status = artifact.stages?.[stage]?.status;
            if (status !== 'queued' && status !== 'running')
                continue;
            markStage(artifact, stage, 'cancelled', reason);
            changed = true;
        }
        if (changed) {
            changedArtifacts += 1;
            firstChangedIndex = Math.min(firstChangedIndex, index);
        }
    }
    if (changedArtifacts) {
        await persistChatFor(chatKey);
        notifyFrom(firstChangedIndex);
    }
    const chatState = await getChatState(chatKey);
    const interruptedRecovery = interruptHistoryRecovery(chatState, reason);
    if (interruptedRecovery)
        await putChatState(chatState);
    return { artifacts: changedArtifacts, historyRecovery: interruptedRecovery };
}
export function subscribePipeline(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
function notify(index, artifact) {
    for (const listener of listeners) {
        try {
            listener(index, artifact);
        }
        catch (error) {
            console.warn('[MirrorAbyss] pipeline listener failed', error);
        }
    }
}
function notifyFrom(startIndex) {
    for (let index = Math.max(0, startIndex); index < getChat().length; index += 1) {
        notify(index, getAttachedArtifact(getMessage(index)));
    }
}
function resolveMessageIndex(payload) {
    if (Number.isInteger(payload))
        return Number(payload);
    const candidates = [payload?.messageId, payload?.message_id, payload?.mesId, payload?.mesid, payload?.index];
    for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && Number.isInteger(Number(candidate)))
            return Number(candidate);
    }
    const chat = getChat();
    const direct = chat.indexOf(payload);
    if (direct >= 0)
        return direct;
    const nested = payload?.message;
    const nestedIndex = nested ? chat.indexOf(nested) : -1;
    return nestedIndex >= 0 ? nestedIndex : -1;
}
function resolveChangedIndex(payload) {
    if (Number.isInteger(payload))
        return Number(payload);
    const candidates = [payload?.messageId, payload?.message_id, payload?.mesId, payload?.mesid, payload?.index];
    for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && Number.isInteger(Number(candidate)))
            return Number(candidate);
    }
    const chat = getChat();
    const direct = chat.indexOf(payload);
    if (direct >= 0)
        return direct;
    const nested = payload?.message;
    const nestedIndex = nested ? chat.indexOf(nested) : -1;
    return nestedIndex >= 0 ? nestedIndex : null;
}
/**
 * SillyTavern 可能在正文后插入非叙事系统消息。自动恢复判断只看是否还有后续玩家/角色正文，
 * 不能机械要求目标消息恰好是 chat 数组最后一项。
 */
function isNarrativeTail(index) {
    if (index < 0 || index !== latestAssistantIndex())
        return false;
    return !getChat().slice(index + 1).some((message) => message?.is_user === true || isProcessableAssistantMessage(message));
}
async function pauseLorebookForHistoryChange(chatKey) {
    try {
        await pauseCurrentChatLorebookEntries(chatKey);
        const state = await getChatState(chatKey);
        if (readHistoryWorkflow(state).pauseError) {
            setHistoryPauseError(state);
            await putChatState(state);
        }
    }
    catch (error) {
        const detail = toErrorMessage(error);
        console.warn('[MirrorAbyss] failed to pause stale lorebook entries', error);
        const state = await getChatState(chatKey);
        if (readHistoryWorkflow(state).invalidation) {
            setHistoryPauseError(state, detail);
            await putChatState(state);
        }
        toast('warning', `历史数据已暂停，但世界书条目暂停失败：${detail}。请避免继续生成并手动重试历史重算`);
    }
}
async function saveArtifactToMessage(index, artifact) {
    assertArtifactCommitCurrent(artifact);
    const message = getMessage(index);
    if (!message || message.is_user)
        throw new Error('原AI正文已不存在，请重新整理');
    attachArtifactToMessage(message, artifact);
    await putArtifact(artifact);
    await persistChatFor(artifact.chatKey);
    notify(index, artifact);
}
async function loadOrCreateArtifact(index, _force, historyRevision, taskGuard) {
    const message = getMessage(index);
    if (!isProcessableAssistantMessage(message))
        throw new Error('目标不是有效AI正文');
    const fingerprint = messageFingerprint(index);
    let artifact = getAttachedArtifact(message);
    try {
        if (!artifact || artifact.chatKey !== currentChatKey() || artifact.sourceFingerprint !== fingerprint) {
            artifact = createArtifact(message, index);
        }
        if (historyRevision !== undefined)
            bindArtifactHistoryRevision(artifact, historyRevision);
        if (taskGuard)
            bindArtifactTaskGuard(artifact, taskGuard);
        assertArtifactCommitCurrent(artifact);
        attachArtifactToMessage(message, artifact);
        // 创建/绑定 artifact 不是业务提交点。失败与成功终态由后续检查点统一保存，
        // 避免模型调用前先写入一个没有新增业务结果的空壳 artifact。
        artifact.stages.revision ||= { status: 'idle', attempts: 0 };
        return artifact;
    }
    catch (error) {
        if (artifact && historyRevision !== undefined)
            unbindArtifactHistoryRevision(artifact, historyRevision);
        if (artifact && taskGuard)
            unbindArtifactTaskGuard(artifact, taskGuard);
        throw error;
    }
}
/**
 * 核心提交只包含内部事实、动态可见视图及消息 artifact。该步骤成功后才允许排队总结和世界书。
 */
async function commitCoreState(artifact, resolveLatestHistoryInvalidation = false) {
    if (!artifact.snapshot || artifact.stages.state.status !== 'success') {
        throw new Error('状态表尚未成功，不能提交核心结果');
    }
    assertArtifactCommitCurrent(artifact);
    const chatState = await getChatState(artifact.chatKey);
    if (!chatState.processedMessageKeys.includes(artifact.messageKey)) {
        chatState.processedMessageKeys.push(artifact.messageKey);
    }
    if (artifact.factPackage?.facts?.length) {
        const incomingFacts = normalizeInternalFacts(artifact.factPackage.facts, artifact.messageKey);
        chatState.internalFacts = mergeInternalFacts(chatState.internalFacts ?? [], incomingFacts, artifact.factPackage.facts);
    }
    chatState.latestSnapshotMessageKey = artifact.messageKey;
    if (resolveLatestHistoryInvalidation && isNarrativeTail(artifact.messageIndex)) {
        resolveLatestHistoryLock(chatState, artifact.messageIndex);
    }
    chatState.updatedAt = nowIso();
    assertArtifactCommitCurrent(artifact);
    await putChatState(chatState);
    // 状态 artifact 已在进入核心提交前保存；这里仅提交 ChatState，
    // 避免同一状态结果连续保存两次聊天，并把已提交状态直接传给派生计划。
    return chatState;
}
/**
 * 状态表成功后立即把派生阶段标成 queued/skipped，避免 UI 在后台任务已经排队时仍显示 idle。
 */
function invalidateDerivedForValidMessages(chatState, validMessageIds) {
    const currentFacts = Array.isArray(chatState.internalFacts) ? chatState.internalFacts : [];
    const allFactIds = new Set(currentFacts.map((fact) => String(fact.factId || '')));
    const invalidated = invalidateFactsAfterMessages(currentFacts, validMessageIds);
    chatState.internalFacts = invalidated.facts;
    const invalidSmallIds = new Set();
    for (const summary of chatState.smallSummaries ?? []) {
        const sourceFactIds = Array.isArray(summary.sourceFactIds) ? summary.sourceFactIds : [];
        const factInvalid = sourceFactIds.some((id) => invalidated.removedFactIds.has(id));
        const legacyInvalid = (summary.sourceKeys ?? []).some((key) => {
            if (allFactIds.has(key))
                return invalidated.removedFactIds.has(key);
            return !validMessageIds.has(key);
        });
        if (factInvalid || legacyInvalid)
            invalidSmallIds.add(summary.id);
    }
    chatState.smallSummaries = (chatState.smallSummaries ?? []).filter((summary) => !invalidSmallIds.has(summary.id));
    const invalidLargeIds = new Set();
    for (const summary of chatState.largeSummaries ?? []) {
        const sources = summary.sourceSummaryIds ?? summary.sourceKeys ?? [];
        if (sources.some((id) => invalidSmallIds.has(id)) || (summary.previousLargeSummaryId && invalidLargeIds.has(summary.previousLargeSummaryId))) {
            invalidLargeIds.add(summary.id);
        }
    }
    chatState.largeSummaries = (chatState.largeSummaries ?? []).filter((summary) => !invalidLargeIds.has(summary.id));
    for (const summary of chatState.smallSummaries ?? []) {
        if (summary.solidifiedByLargeSummaryId && invalidLargeIds.has(summary.solidifiedByLargeSummaryId))
            delete summary.solidifiedByLargeSummaryId;
    }
    for (const fact of chatState.internalFacts) {
        if (fact.consumedBySmallSummaryId && invalidSmallIds.has(fact.consumedBySmallSummaryId))
            delete fact.consumedBySmallSummaryId;
        if (fact.solidifiedByLargeSummaryId && invalidLargeIds.has(fact.solidifiedByLargeSummaryId))
            delete fact.solidifiedByLargeSummaryId;
    }
}
async function prepareDerivedStageStatuses(artifact, chatState) {
    const settings = getSettings();
    const plan = {
        small: Boolean(settings.autoSmallSummary && hasEligibleSmallSummary(
            chatState.internalFacts ?? [],
            settings.smallSummaryTurns,
            artifact.sceneBoundary?.eventIds ?? [],
        )),
        large: Boolean(settings.autoLargeSummary && hasEligibleLargeSummary(chatState.smallSummaries ?? [], chatState.largeSummaries ?? [], settings.largeSummaryCount)),
    };
    markStage(artifact, 'summary', plan.small || plan.large ? 'queued' : 'skipped');
    const historyWorkflow = readHistoryWorkflow(chatState);
    if (historyWorkflow.blocked) {
        const automatic = historyWorkflow.automatic;
        markStage(artifact, 'sync', 'blocked', automatic ? '最新正文正在自动重建，完成后将继续同步' : '历史消息已变化，等待手动重算');
    }
    else {
        markStage(artifact, 'sync', resolveHostControl(settings).lorebook ? 'queued' : 'skipped');
    }
    await saveArtifactToMessage(artifact.messageIndex, artifact);
    return plan;
}
/**
 * 只允许“最新一条 AI 正文自身发生编辑/swipe”在用户显式重新整理成功后解除历史暂停。
 * 更早位置、删除位置未知或当前消息后仍有新消息时，继续要求完整历史重算。
 */
/**
 * 正文被单独修正后，旧状态与旧总结已不再对应当前正文；先清除并暂停世界书，等待用户点击“生成表格”。
 */
async function invalidateCoreAfterManualRevision(artifact, previousMessageKey) {
    const chatState = await getChatState(artifact.chatKey);
    const validMessageIds = new Set(chatState.processedMessageKeys.filter((key) => key !== previousMessageKey));
    invalidateDerivedForValidMessages(chatState, validMessageIds);
    chatState.processedMessageKeys = [...validMessageIds];
    if (chatState.latestSnapshotMessageKey === previousMessageKey) {
        chatState.latestSnapshotMessageKey = chatState.processedMessageKeys.at(-1);
    }
    artifact.factPackage = undefined;
    artifact.snapshot = undefined;
    markStage(artifact, 'state', 'idle');
    markStage(artifact, 'summary', 'idle');
    markStage(artifact, 'sync', 'blocked', '正文已修正，等待重新生成表格');
    await putChatState(chatState);
    await saveArtifactToMessage(artifact.messageIndex, artifact);
    try {
        await pauseCurrentChatLorebookEntries(artifact.chatKey);
    }
    catch (error) {
        const detail = toErrorMessage(error);
        console.warn('[MirrorAbyss] revised text saved but stale lorebook pause failed', error);
        markStage(artifact, 'sync', 'failed', `旧世界书条目暂停失败：${detail}`);
        await saveArtifactToMessage(artifact.messageIndex, artifact);
        toast('warning', `正文已修正，但旧世界书条目暂停失败：${detail}。请在生成表格后手动同步世界书`);
    }
}
function derivedTaskError(error) {
    return error instanceof CommitRejectedError
        || error instanceof TaskBlockedError
        || error instanceof TaskSkippedError
        || (error instanceof Error && ['AbortError', 'TaskBlockedError', 'TaskSkippedError'].includes(error.name));
}
function cancelledDerivedCanFallBackToSync(error, chatKey, historyRevision) {
    return error instanceof Error
        && error.name === 'AbortError'
        && currentChatKey() === chatKey
        && currentHistoryRevision(chatKey) === historyRevision
        && getSettings().enabled;
}
/**
 * 派生链按小总结 → 大总结 → 世界书单向排队。每一段独立失败，不回滚核心状态。
 */
function queueAutomaticDerived(index, artifact, historyRevision, summaryPlan) {
    const settings = getSettings();
    const chatKey = artifact.chatKey;
    const messageKey = artifact.messageKey;
    const runWithGuards = async (guard, work) => {
        if (currentChatKey() !== chatKey)
            throw new CommitRejectedError('聊天已切换，旧派生任务不再运行');
        assertHistoryRevisionCurrent(chatKey, historyRevision);
        bindArtifactHistoryRevision(artifact, historyRevision);
        bindArtifactTaskGuard(artifact, guard);
        try {
            assertArtifactCommitCurrent(artifact);
            await work();
            assertArtifactCommitCurrent(artifact);
        }
        finally {
            unbindArtifactTaskGuard(artifact, guard);
            unbindArtifactHistoryRevision(artifact, historyRevision);
        }
    };
    const queueSync = () => {
        if (currentChatKey() !== chatKey || currentHistoryRevision(chatKey) !== historyRevision || !getSettings().enabled)
            return;
        if (!resolveHostControl(getSettings()).lorebook)
            return;
        const key = `${PIPELINE_VERSION}:derived:sync:${chatKey}:${messageKey}`;
        void taskQueue.run(key, `后台同步第 ${index + 1} 条正文世界书`, 'sync', async (guard) => {
            await runWithGuards(guard, async () => {
                try {
                    await syncLorebook(artifact);
                }
                finally {
                    await saveArtifactToMessage(index, artifact);
                }
            });
        }, {
            priority: 40,
            chatKey,
            triggerSource: 'derived-sync',
            messageKey,
            messageFingerprint: artifact.sourceFingerprint,
            historyRevisionAtEnqueue: historyRevision,
            automatic: true,
        }).catch((error) => {
            if (derivedTaskError(error))
                return;
            console.warn('[MirrorAbyss] derived lorebook sync failed', error);
            toast('warning', `核心状态已保存，但世界书同步失败：${toErrorMessage(error)}`);
        });
    };
    const queueLarge = (shouldRun) => {
        if (currentChatKey() !== chatKey || currentHistoryRevision(chatKey) !== historyRevision || !getSettings().enabled)
            return;
        if (!getSettings().autoLargeSummary || !shouldRun) {
            queueSync();
            return;
        }
        const key = `${PIPELINE_VERSION}:derived:large:${chatKey}:${messageKey}`;
        void taskQueue.run(key, `后台生成第 ${index + 1} 条正文大总结`, 'largeSummary', async (guard) => {
            await runWithGuards(guard, async () => {
                try {
                    await runSummaryStage(artifact, 'large');
                }
                finally {
                    await saveArtifactToMessage(index, artifact);
                }
            });
        }, {
            priority: 10,
            chatKey,
            triggerSource: 'derived-large-summary',
            messageKey,
            messageFingerprint: artifact.sourceFingerprint,
            historyRevisionAtEnqueue: historyRevision,
            automatic: true,
        }).then(queueSync, (error) => {
            if (derivedTaskError(error)) {
                if (cancelledDerivedCanFallBackToSync(error, chatKey, historyRevision))
                    queueSync();
                return;
            }
            console.warn('[MirrorAbyss] derived large summary failed', error);
            toast('warning', `核心状态已保存，但大总结失败：${toErrorMessage(error)}`);
            if (currentChatKey() === chatKey && currentHistoryRevision(chatKey) === historyRevision && getSettings().enabled)
                queueSync();
        });
    };
    const queueLargeFromCurrentState = () => {
        void (async () => {
            if (currentChatKey() !== chatKey || currentHistoryRevision(chatKey) !== historyRevision || !getSettings().enabled)
                return;
            const currentSettings = getSettings();
            const currentState = await getChatState(chatKey);
            const eligible = Boolean(currentSettings.autoLargeSummary
                && hasEligibleLargeSummary(currentState.smallSummaries ?? [], currentState.largeSummaries ?? [], currentSettings.largeSummaryCount));
            queueLarge(eligible);
        })().catch((error) => {
            console.warn('[MirrorAbyss] failed to recheck large-summary eligibility', error);
            if (currentChatKey() === chatKey && currentHistoryRevision(chatKey) === historyRevision && getSettings().enabled)
                queueSync();
        });
    };
    if (!settings.autoSmallSummary || !summaryPlan.small) {
        queueLarge(summaryPlan.large);
        return;
    }
    const key = `${PIPELINE_VERSION}:derived:small:${chatKey}:${messageKey}`;
    void taskQueue.run(key, `后台生成第 ${index + 1} 条正文小总结`, 'smallSummary', async (guard) => {
        await runWithGuards(guard, async () => {
            try {
                await runSummaryStage(artifact, 'small');
            }
            finally {
                await saveArtifactToMessage(index, artifact);
            }
        });
    }, {
        priority: 30,
        chatKey,
        triggerSource: 'derived-small-summary',
        messageKey,
        messageFingerprint: artifact.sourceFingerprint,
        historyRevisionAtEnqueue: historyRevision,
        automatic: true,
    }).then(queueLargeFromCurrentState, (error) => {
        if (derivedTaskError(error)) {
            if (cancelledDerivedCanFallBackToSync(error, chatKey, historyRevision))
                queueSync();
            return;
        }
        console.warn('[MirrorAbyss] derived small summary failed', error);
        toast('warning', `核心状态已保存，但小总结失败：${toErrorMessage(error)}`);
        if (currentChatKey() === chatKey && currentHistoryRevision(chatKey) === historyRevision && getSettings().enabled)
            queueLargeFromCurrentState();
    });
}
function isAutomaticLatestHistoryRecovery(index, chatState) {
    const workflow = readHistoryWorkflow(chatState);
    return Boolean(workflow.invalidation
        && workflow.automatic
        && workflow.startIndex === index
        && workflow.invalidation.reason !== 'deleted'
        && isNarrativeTail(index));
}
/**
 * 处理单条角色正文。force 仅表示显式重新整理，不绕过聊天、历史、任务代次和正文指纹守卫。
 */
export async function processMessage(index, force = false, options = {}) {
    if (!getSettings().enabled)
        return null;
    const message = getMessage(index);
    if (!isProcessableAssistantMessage(message))
        return null;
    const identity = messageIdentity(index);
    const scheduledFingerprint = messageFingerprint(index);
    const scheduledChatKey = currentChatKey();
    const scheduledHistoryRevision = currentHistoryRevision(scheduledChatKey);
    const enqueueState = await getChatState(scheduledChatKey);
    const enqueueWorkflow = readHistoryWorkflow(enqueueState);
    if (enqueueWorkflow.running && !options.historyRecovery && !options.automatic) {
        const detail = `历史恢复正在执行（${enqueueWorkflow.phase}），本次手动任务未入队`;
        throw new TaskBlockedError(detail);
    }
    const triggerSource = options.triggerSource
        || (options.historyRecovery ? 'history-recovery' : options.automatic ? 'automatic' : force ? 'manual-force' : 'manual');
    const key = `${PIPELINE_VERSION}:${scheduledChatKey}:${identity}`;
    const attachedAtEnqueue = getAttachedArtifact(message);
    const duplicateCommittedAutomatic = Boolean(options.automatic
        && !force
        && !options.historyRecovery
        && attachedAtEnqueue
        && attachedAtEnqueue.chatKey === scheduledChatKey
        && attachedAtEnqueue.sourceFingerprint === scheduledFingerprint
        && attachedAtEnqueue.messageKey === identity
        && attachedAtEnqueue.snapshot
        && attachedAtEnqueue.stages.state.status === 'success'
        && enqueueState.processedMessageKeys.includes(attachedAtEnqueue.messageKey));
    if (!options.historyRecovery && !duplicateCommittedAutomatic) {
        const preempted = taskQueue.cancelActiveMatching((task) => Boolean(task.chatKey === scheduledChatKey
            && task.automatic === true
            && ['smallSummary', 'largeSummary'].includes(String(task.kind))), '检测到新的正文，旧自动总结已暂停并等待后续重新归并');
        if (preempted)
            abortActiveAutomaticSummaryRequests();
    }
    return taskQueue.run(key, `处理第 ${index + 1} 条AI正文`, 'state', async (guard) => {
        const settings = getSettings();
        if (!settings.enabled)
            throw new TaskSkippedError('镜渊已关闭，本次排队任务不再处理');
        if (currentChatKey() !== scheduledChatKey)
            throw new TaskSkippedError('聊天已切换，本次排队任务不再处理');
        guard.assertCurrent();
        assertHistoryRevisionCurrent(scheduledChatKey, scheduledHistoryRevision);
        if (!isProcessableAssistantMessage(getMessage(index)))
            throw new TaskSkippedError('目标正文已不存在或不再符合处理条件');
        if (messageFingerprint(index) !== scheduledFingerprint) {
            throw new CommitRejectedError('正文已经变化，本次排队任务不再处理');
        }
        const processingState = await getChatState(scheduledChatKey);
        const processingWorkflow = readHistoryWorkflow(processingState);
        if (processingWorkflow.running && !options.historyRecovery) {
            const detail = `历史恢复正在执行（${processingWorkflow.phase}），本次普通任务已跳过`;
            if (options.automatic)
                throw new TaskSkippedError(detail);
            throw new TaskBlockedError(detail);
        }
        if (processingWorkflow.blocked) {
            const recoveryAuthorized = Boolean(options.historyRecovery
                && processingWorkflow.recovery
                && index >= Number(processingWorkflow.startIndex ?? index));
            if (!recoveryAuthorized && !isAutomaticLatestHistoryRecovery(index, processingState)) {
                throw new TaskBlockedError(historyBlockedMessage(processingState));
            }
        }
        const attached = getAttachedArtifact(getMessage(index));
        const alreadyCommitted = Boolean(options.automatic
            && !force
            && !options.historyRecovery
            && attached
            && attached.chatKey === scheduledChatKey
            && attached.sourceFingerprint === scheduledFingerprint
            && attached.messageKey === identity
            && attached.snapshot
            && attached.stages.state.status === 'success'
            && processingState.processedMessageKeys.includes(attached.messageKey));
        if (alreadyCommitted) {
            throw new TaskSkippedError('相同正文已由当前流水线正式提交，本次自动任务不再重复处理');
        }
        const artifact = await loadOrCreateArtifact(index, force, scheduledHistoryRevision, guard);
        notify(index, artifact);
        try {
            let audit = await runAudit(artifact, force);
            await saveArtifactToMessage(index, artifact);
            if (!audit.passed && settings.auditFailAction === 'revise') {
                const revised = await runRevisionFlow(artifact);
                audit = revised.audit;
                await saveArtifactToMessage(index, artifact);
            }
            if (!audit.passed) {
                const failureAction = settings.auditFailAction === 'revise'
                    ? settings.revisionFallbackAction
                    : settings.auditFailAction;
                await applyAuditFailureAction(artifact, failureAction);
                markStage(artifact, 'state', 'blocked', '规则审核未通过');
                markStage(artifact, 'summary', 'blocked', '规则审核未通过');
                markStage(artifact, 'sync', 'blocked', '规则审核未通过');
                await saveArtifactToMessage(index, artifact);
                return artifact;
            }
            if (settings.autoState || force) {
                await runStateExtraction(artifact, force);
                await saveArtifactToMessage(index, artifact);
            }
            else {
                if (!artifact.snapshot || artifact.stages.state.status !== 'success') {
                    markStage(artifact, 'state', 'skipped');
                    markStage(artifact, 'summary', 'skipped');
                    markStage(artifact, 'sync', 'skipped');
                }
                await saveArtifactToMessage(index, artifact);
            }
            if (artifact.snapshot && artifact.stages.state.status === 'success') {
                const committedState = await commitCoreState(artifact, !options.historyRecovery);
                const summaryPlan = await prepareDerivedStageStatuses(artifact, committedState);
                if (!options.skipDerived) {
                    taskQueue.cancelPendingDerivedByChatKey(artifact.chatKey);
                    queueAutomaticDerived(index, artifact, scheduledHistoryRevision, summaryPlan);
                }
            }
            return artifact;
        }
        catch (error) {
            const messageText = toErrorMessage(error);
            console.error('[MirrorAbyss] pipeline failed', error);
            if (error instanceof CommitRejectedError) {
                toast('warning', messageText);
                throw error;
            }
            if (error instanceof Error && error.name === 'AbortError')
                throw error;
            // 先把失败阶段推送给 UI，再等待宿主保存；移动端 saveChat 卡顿时不再长时间显示“处理中”。
            notify(index, artifact);
            await saveArtifactToMessage(index, artifact);
            throw error;
        }
        finally {
            unbindArtifactTaskGuard(artifact, guard);
            unbindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
        }
    }, {
        priority: 90,
        chatKey: scheduledChatKey,
        triggerSource,
        messageKey: identity,
        messageFingerprint: scheduledFingerprint,
        historyRevisionAtEnqueue: scheduledHistoryRevision,
        historyRecoveryPhaseAtEnqueue: enqueueWorkflow.phase,
        automatic: options.automatic === true,
    });
}
export function scheduleMessage(payload, force = false, delay = 0, triggerSource = 'automatic-event') {
    if (!getSettings().enabled)
        return;
    const index = resolveMessageIndex(payload);
    if (index < 0)
        return;
    const message = getMessage(index);
    if (!isProcessableAssistantMessage(message))
        return;
    const scheduledChatKey = currentChatKey();
    const scheduledIdentity = messageIdentity(index);
    const scheduledFingerprint = messageFingerprint(index);
    const scheduleKey = `${scheduledChatKey}:${scheduledIdentity}`;
    const existingTimer = scheduledMessageTimers.get(scheduleKey);
    if (existingTimer !== undefined)
        window.clearTimeout(existingTimer);
    const timer = window.setTimeout(() => {
        scheduledMessageTimers.delete(scheduleKey);
        void (async () => {
            if (!getSettings().enabled)
                return;
            if (currentChatKey() !== scheduledChatKey)
                return;
            const current = getMessage(index);
            if (!isProcessableAssistantMessage(current))
                return;
            if (messageIdentity(index) !== scheduledIdentity || messageFingerprint(index) !== scheduledFingerprint)
                return;
            const state = await getChatState(scheduledChatKey);
            const workflow = readHistoryWorkflow(state);
            if (workflow.running)
                return;
            const latestOnlyInvalidation = Boolean(workflow.invalidation
                && workflow.startIndex === index
                && workflow.invalidation.reason !== 'deleted'
                && isNarrativeTail(index));
            if (!force && workflow.blocked && !latestOnlyInvalidation)
                return;
            await processMessage(index, force, { automatic: true, triggerSource });
        })().catch((error) => {
            if (error instanceof CommitRejectedError
                || error instanceof TaskSkippedError
                || (error instanceof Error && ['AbortError', 'TaskSkippedError'].includes(error.name)))
                return;
            console.error('[MirrorAbyss] scheduled processing failed', error);
            toast('error', `自动整理失败：${toErrorMessage(error)}`);
        });
    }, delay);
    scheduledMessageTimers.set(scheduleKey, timer);
}
/**
 * 历史变化后保留仍可复用的审核/修正检查点，只把依赖上游连续性的状态、总结和同步标为待重建。
 */
function markArtifactsForHistoryRebuild(startIndex, changedIndex = startIndex) {
    for (let i = startIndex; i < getChat().length; i += 1) {
        const message = getMessage(i);
        const artifact = getAttachedArtifact(message);
        if (!artifact)
            continue;
        if (i === changedIndex && artifact.sourceFingerprint !== messageFingerprint(i)) {
            markStage(artifact, 'audit', 'idle');
            markStage(artifact, 'revision', 'idle');
            artifact.approvedFingerprint = undefined;
        }
        markStage(artifact, 'state', 'blocked', '上游历史已变化，等待按依赖重建');
        markStage(artifact, 'summary', 'blocked', '上游历史已变化，等待按依赖重建');
        markStage(artifact, 'sync', 'blocked', '上游历史已变化，等待按依赖重建');
    }
}
/**
 * 编辑、swipe 或删除会提升历史修订号、取消旧任务并暂停派生发布，等待明确重算。
 */
export async function invalidateHistory(payload, reason) {
    if (!getSettings().enabled)
        return;
    const chatKey = currentChatKey();
    const eventIndex = resolveChangedIndex(payload);
    // 新生成的正文没有镜渊检查点，MESSAGE_SWIPED/EDITED 只代表酒馆完成了消息落盘，
    // 不应被误判成“旧历史变化”。否则会先暂停世界书，再与 MESSAGE_RECEIVED 重复启动整条模型链。
    if (reason !== 'deleted' && eventIndex !== null) {
        const message = getMessage(eventIndex);
        const attached = getAttachedArtifact(message);
        if (!attached)
            return;
        if (attached.sourceFingerprint === messageFingerprint(eventIndex))
            return;
    }
    const scannedIndex = firstInconsistentArtifactIndex(getChat(), MODULE_NAME, messageIdentity, messageFingerprint);
    const detectedIndex = eventIndex ?? (scannedIndex === -1 ? null : scannedIndex);
    if (detectedIndex === null && reason !== 'deleted') {
        // 编辑/swipe 事件没有可定位消息，且一致性扫描也未发现旧 artifact 失配；
        // 必须在提升修订号或取消请求之前退出，避免无效事件打断正在运行的自动链。
        console.warn('[MirrorAbyss] ignored unlocatable history event without artifact mismatch', reason, payload);
        return;
    }
    invalidateHistoryRevision(chatKey);
    abortActiveBusinessRequests();
    taskQueue.cancelPendingByChatKey(chatKey, '历史消息已变化，旧排队任务已取消');
    const state = await getChatState(chatKey);
    if (currentChatKey() !== chatKey)
        throw new Error('聊天已切换，历史变化不再写入');
    if (detectedIndex === null) {
        invalidateHistoryWorkflow(state, { reason });
        await putChatState(state);
        await pauseLorebookForHistoryChange(chatKey);
        toast('warning', '检测到历史消息删除，但无法判断位置。现有记忆已保留，世界书同步暂停；请在镜渊中选择重算起点');
        notifyFrom(0);
        return;
    }
    const index = Math.max(0, detectedIndex);
    const startIndex = Math.min(index, readHistoryWorkflow(state).startIndex ?? index);
    const latestOnly = Boolean(reason !== 'deleted'
        && startIndex === index
        && isNarrativeTail(index));
    invalidateHistoryWorkflow(state, { startIndex, reason, automatic: latestOnly });
    const validPrefixKeys = new Set();
    for (let i = 0; i < startIndex; i += 1) {
        const attached = getAttachedArtifact(getMessage(i));
        if (attached)
            validPrefixKeys.add(attached.messageKey);
    }
    markArtifactsForHistoryRebuild(startIndex, index);
    invalidateDerivedForValidMessages(state, validPrefixKeys);
    state.processedMessageKeys = state.processedMessageKeys.filter((key) => validPrefixKeys.has(key));
    state.latestSnapshotMessageKey = state.processedMessageKeys.at(-1);
    await persistChatFor(chatKey);
    await putChatState(state);
    await pauseLorebookForHistoryChange(chatKey);
    notifyFrom(index);
    if (latestOnly) {
        toast('info', '最新正文已变化，镜渊将自动从审核继续处理；世界书在完成前暂时停用');
    }
    else {
        toast('warning', `历史消息已变化，世界书同步已暂停；请在镜渊中从第 ${startIndex + 1} 条开始重算`);
    }
}
export async function recalculateInvalidatedHistory() {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const chatKey = currentChatKey();
    cancelScheduledMessagesForChat(chatKey);
    const state = await getChatState(chatKey);
    const workflow = readHistoryWorkflow(state);
    const startIndex = workflow.startIndex;
    if (startIndex === undefined || !workflow.invalidation)
        throw new Error('尚未选择历史重算起点');
    const endIndex = getChat().length;
    const processableIndexes = Array.from({ length: Math.max(0, endIndex - startIndex) }, (_, offset) => startIndex + offset)
        .filter((index) => isProcessableAssistantMessage(getMessage(index)));
    const previousRecovery = workflow.recovery;
    const canResumeCore = Boolean(previousRecovery
        && previousRecovery.startIndex === startIndex
        && ['failed', 'rebuilding-core'].includes(previousRecovery.phase)
        && Number.isInteger(previousRecovery.currentIndex)
        && processableIndexes.includes(Number(previousRecovery.currentIndex)));
    const resumeOffset = canResumeCore
        ? processableIndexes.indexOf(Number(previousRecovery?.currentIndex))
        : previousRecovery
            && previousRecovery.startIndex === startIndex
            && ['rebuilding-derived', 'publishing-lorebook', 'partial'].includes(previousRecovery.phase)
            ? processableIndexes.length
            : 0;
    // currentIndex 指向下一条待处理/本次失败消息；其在当前可处理序列中的位置
    // 就是已经成功固化的数量。不要重新使用 startIndex，否则重试会重复调用前缀消息。
    const completedBeforeRun = resumeOffset;
    const remainingIndexes = processableIndexes.slice(resumeOffset);
    beginHistoryRecovery(state, {
        startIndex,
        endIndex,
        currentIndex: remainingIndexes[0] ?? processableIndexes.at(-1),
        completedCount: completedBeforeRun,
        totalCount: processableIndexes.length,
        phase: remainingIndexes.length ? 'rebuilding-core' : 'rebuilding-derived',
    });
    await putChatState(state);
    let latest = null;
    const recoveredMessageKeys = new Set();
    for (const index of processableIndexes.slice(0, completedBeforeRun)) {
        const attached = getAttachedArtifact(getMessage(index));
        if (attached?.messageKey)
            recoveredMessageKeys.add(attached.messageKey);
    }
    for (const [runPosition, index] of remainingIndexes.entries()) {
        const absolutePosition = completedBeforeRun + runPosition;
        if (currentChatKey() !== chatKey)
            throw new Error('聊天已切换，历史重算已停止');
        try {
            latest = await processMessage(index, false, { skipDerived: true, historyRecovery: true });
            if (latest?.messageKey)
                recoveredMessageKeys.add(latest.messageKey);
            if (currentChatKey() !== chatKey)
                throw new Error('聊天已切换，历史重算已停止');
            if (!latest || latest.stages.state.status === 'failed' || latest.stages.state.status === 'blocked') {
                const stageError = latest?.stages.state.error || '状态表未成功';
                throw new Error(stageError);
            }
            const completedState = await getChatState(chatKey);
            updateHistoryRecovery(completedState, {
                completedCount: absolutePosition + 1,
                currentIndex: processableIndexes[absolutePosition + 1] ?? index,
                phase: 'rebuilding-core',
                error: undefined,
            });
            await putChatState(completedState);
        }
        catch (error) {
            const detail = toErrorMessage(error);
            const failedState = await getChatState(chatKey);
            const failedWorkflow = readHistoryWorkflow(failedState);
            if (!failedWorkflow.recovery && workflow.recovery) {
                beginHistoryRecovery(failedState, workflow.recovery);
            }
            failHistoryRecovery(failedState, detail, { currentIndex: index, completedCount: absolutePosition });
            await putChatState(failedState);
            throw new Error(`历史重建未完成：第 ${index + 1} 条消息的状态提取失败。${detail}`);
        }
    }
    if (currentChatKey() !== chatKey)
        throw new Error('聊天已切换，历史重算已停止');
    const recoveryInfo = latest
        ? { index: latest.messageIndex, artifact: latest }
        : latestSnapshotArtifact();
    const freshState = await getChatState(chatKey);
    if (!recoveryInfo) {
        await clearCurrentChatLorebookEntries(chatKey);
        completeHistoryWorkflow(freshState);
        freshState.lastSyncError = undefined;
        freshState.lastSyncStatus = 'success';
        freshState.lastSyncAt = nowIso();
        await putChatState(freshState);
        toast('success', '历史数据重算完成；当前没有可发布状态，已清除本聊天的镜渊世界书条目');
        return null;
    }
    updateHistoryRecovery(freshState, {
        phase: 'rebuilding-derived',
        currentIndex: recoveryInfo.index,
    });
    await putChatState(freshState);
    const artifact = recoveryInfo.artifact;
    const revision = currentHistoryRevision(chatKey);
    const errors = [];
    try {
        await taskQueue.run(`${PIPELINE_VERSION}:history-recovery-derived:${chatKey}:${artifact.messageKey}`, '恢复历史总结与世界书', 'smallSummary', async (guard) => {
            bindArtifactHistoryRevision(artifact, revision);
            bindArtifactTaskGuard(artifact, guard);
            try {
                try {
                    // 不 force；只排空因本次历史变化而重新达到条件的 event_id 与未固化小总结。
                    await rebuildEligibleSummaries(artifact);
                }
                catch (error) {
                    if (derivedTaskError(error))
                        throw error;
                    errors.push(`总结：${toErrorMessage(error)}`);
                }
                await saveArtifactToMessage(recoveryInfo.index, artifact);
                if (resolveHostControl(getSettings()).lorebook && errors.length === 0) {
                    const publishingState = await getChatState(chatKey);
                    updateHistoryRecovery(publishingState, { phase: 'publishing-lorebook' });
                    await putChatState(publishingState);
                    try {
                        await syncLorebook(artifact, false, { allowHistoryRecovery: true });
                    }
                    catch (error) {
                        if (error instanceof CommitRejectedError || (error instanceof Error && error.name === 'AbortError'))
                            throw error;
                        errors.push(`世界书：${toErrorMessage(error)}`);
                    }
                    await saveArtifactToMessage(recoveryInfo.index, artifact);
                }
                if (errors.length)
                    throw new Error(errors.join('；'));
                // 恢复提交成功前，清理恢复期间由宿主保存事件产生的陈旧自动任务。
                cancelScheduledMessagesForChat(chatKey);
                taskQueue.cancelPendingMatching((task) => Boolean(task.chatKey === chatKey
                    && task.automatic === true
                    && recoveredMessageKeys.has(String(task.messageKey || ''))
                    && task.triggerSource !== 'history-recovery'), '历史恢复已提交相同正文，陈旧自动任务已取消');
            }
            finally {
                unbindArtifactTaskGuard(artifact, guard);
                unbindArtifactHistoryRevision(artifact, revision);
            }
        }, { priority: 70, chatKey });
    }
    catch (error) {
        if (derivedTaskError(error))
            throw error;
        if (errors.length === 0)
            errors.push(toErrorMessage(error));
    }
    const finalState = await getChatState(chatKey);
    if (errors.length) {
        markHistoryRecoveryPartial(finalState, errors.join('；'));
        await putChatState(finalState);
        toast('warning', `历史核心状态已重算完成，但部分派生恢复失败：${errors.join('；')}`);
    }
    else {
        completeHistoryWorkflow(finalState);
        if (!resolveHostControl(getSettings()).lorebook) {
            finalState.lastSyncStatus = 'idle';
            finalState.lastSyncError = undefined;
        }
        await putChatState(finalState);
        toast('success', resolveHostControl(getSettings()).lorebook ? '历史数据重算完成，世界书同步已恢复' : '历史数据重算完成；自动世界书同步当前已关闭');
    }
    return artifact;
}
export async function chooseHistoryRecalculationStart(startIndex) {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const chatKey = currentChatKey();
    const state = await getChatState(chatKey);
    if (currentChatKey() !== chatKey)
        throw new Error('聊天已切换，不再修改历史重算范围');
    if (!readHistoryWorkflow(state).invalidation)
        throw new Error('当前没有待处理的历史失效');
    const index = Math.max(0, Math.min(Math.trunc(startIndex), Math.max(0, getChat().length - 1)));
    chooseHistoryWorkflowStart(state, index);
    const validPrefixKeys = new Set();
    for (let i = 0; i < index; i += 1) {
        const attached = getAttachedArtifact(getMessage(i));
        if (attached)
            validPrefixKeys.add(attached.messageKey);
    }
    markArtifactsForHistoryRebuild(index, index);
    invalidateDerivedForValidMessages(state, validPrefixKeys);
    state.processedMessageKeys = state.processedMessageKeys.filter((key) => validPrefixKeys.has(key));
    state.latestSnapshotMessageKey = state.processedMessageKeys.at(-1);
    await persistChatFor(chatKey);
    await putChatState(state);
    notifyFrom(index);
}
/**
 * 人工重试仍受最新正文/最新成功快照边界限制，避免旧结果覆盖当前连续性。
 */
export async function retryStage(index, stage) {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const latestSnapshot = latestSnapshotArtifact();
    if (['audit', 'revision', 'state'].includes(stage) && index !== latestAssistantIndex()) {
        throw new Error('普通重试只适用于最新AI正文；旧正文请通过历史变更提示从该条开始重算');
    }
    if (['summary', 'sync'].includes(stage) && latestSnapshot?.index !== index) {
        throw new Error('总结和世界书只能基于最新成功状态表');
    }
    const chatKey = currentChatKey();
    const scheduledHistoryRevision = currentHistoryRevision(chatKey);
    const identity = messageIdentity(index);
    const key = `${PIPELINE_VERSION}:retry:${stage}:${chatKey}:${identity}`;
    const queueKind = stage === 'sync' ? 'sync' : stage === 'summary' ? 'smallSummary' : stage;
    return taskQueue.run(key, `重试${stage}`, queueKind, async (guard) => {
        if (currentChatKey() !== chatKey)
            throw new TaskSkippedError('聊天已切换，本次阶段重试不再处理');
        assertHistoryRevisionCurrent(chatKey, scheduledHistoryRevision);
        const currentState = await getChatState(chatKey);
        if (readHistoryWorkflow(currentState).blocked && ['state', 'summary', 'sync'].includes(stage)) {
            throw new TaskBlockedError(historyBlockedMessage(currentState));
        }
        const artifact = latestSnapshot?.index === index
            ? latestSnapshot.artifact
            : await loadOrCreateArtifact(index, false, scheduledHistoryRevision, guard);
        bindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
        bindArtifactTaskGuard(artifact, guard);
        try {
            if (stage === 'audit') {
                const audit = await runAudit(artifact, true);
                if (!audit.passed) {
                    markStage(artifact, 'state', 'blocked', '规则审核未通过');
                    markStage(artifact, 'summary', 'blocked', '规则审核未通过');
                    markStage(artifact, 'sync', 'blocked', '规则审核未通过');
                    const action = getSettings().auditFailAction;
                    if (action !== 'revise')
                        await applyAuditFailureAction(artifact, action);
                    try {
                        await pauseCurrentChatLorebookEntries(artifact.chatKey);
                    }
                    catch (error) {
                        console.warn('[MirrorAbyss] audit blocked but lorebook pause failed', error);
                        toast('warning', `审核已阻断正文，但旧世界书条目暂停失败：${toErrorMessage(error)}`);
                    }
                }
                else if (!artifact.snapshot || artifact.stages.state.status !== 'success') {
                    markStage(artifact, 'state', 'idle');
                    markStage(artifact, 'summary', 'idle');
                    markStage(artifact, 'sync', 'idle');
                }
                await saveArtifactToMessage(index, artifact);
            }
            if (stage === 'revision') {
                if (!artifact.audit || artifact.audit.passed)
                    throw new Error('当前正文没有待修正的审核违规');
                const previousMessageKey = artifact.messageKey;
                const result = await runRevisionFlow(artifact);
                await saveArtifactToMessage(index, artifact);
                if (result.approved) {
                    await invalidateCoreAfterManualRevision(artifact, previousMessageKey);
                }
                else {
                    await applyAuditFailureAction(artifact, getSettings().revisionFallbackAction);
                    await saveArtifactToMessage(index, artifact);
                }
            }
            if (stage === 'state') {
                if (resolveHostControl(getSettings()).audit && !artifact.audit?.passed) {
                    throw new Error('规则审核尚未通过，不能生成状态表');
                }
                await runStateExtraction(artifact, true);
                await saveArtifactToMessage(index, artifact);
                const committedState = await commitCoreState(artifact, true);
                const summaryPlan = await prepareDerivedStageStatuses(artifact, committedState);
                taskQueue.cancelPendingDerivedByChatKey(artifact.chatKey);
                queueAutomaticDerived(index, artifact, scheduledHistoryRevision, summaryPlan);
            }
            if (stage === 'summary') {
                const errors = [];
                try {
                    await maybeRunSummaries(artifact, true, true);
                }
                catch (error) {
                    if (derivedTaskError(error))
                        throw error;
                    errors.push(`总结：${toErrorMessage(error)}`);
                }
                await saveArtifactToMessage(index, artifact);
                if (resolveHostControl(getSettings()).lorebook) {
                    try {
                        await syncLorebook(artifact);
                    }
                    catch (error) {
                        if (derivedTaskError(error))
                            throw error;
                        errors.push(`世界书：${toErrorMessage(error)}`);
                    }
                    await saveArtifactToMessage(index, artifact);
                }
                if (errors.length)
                    throw new Error(errors.join('；'));
            }
            if (stage === 'sync') {
                await syncLorebook(artifact, true);
                await saveArtifactToMessage(index, artifact);
            }
            return artifact;
        }
        finally {
            unbindArtifactTaskGuard(artifact, guard);
            unbindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
        }
    }, { priority: 70, chatKey });
}
/** 玩家主动维护先只读预览；普通自动/手动 sync 不会进入历史考古。 */
export async function previewLorebookMaintenance(index) {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const latest = latestSnapshotArtifact();
    if (!latest || latest.index !== index)
        throw new Error('世界书维护只能基于最新成功状态表');
    return previewLorebookMaintenanceForArtifact(latest.artifact);
}
/** 玩家确认后在独立队列任务中执行维护，再用普通同步提交状态和条目 ID。 */
export async function applyLorebookMaintenance(index) {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const latest = latestSnapshotArtifact();
    if (!latest || latest.index !== index)
        throw new Error('世界书维护只能基于最新成功状态表');
    const artifact = latest.artifact;
    const scheduledHistoryRevision = currentHistoryRevision(artifact.chatKey);
    const key = `${PIPELINE_VERSION}:maintain-lorebook:${artifact.chatKey}:${artifact.messageKey}`;
    return taskQueue.run(key, '清理并重新发布世界书', 'sync', async (guard) => {
        if (currentChatKey() !== artifact.chatKey)
            throw new TaskSkippedError('聊天已切换，本次世界书维护不再处理');
        assertHistoryRevisionCurrent(artifact.chatKey, scheduledHistoryRevision);
        bindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
        bindArtifactTaskGuard(artifact, guard);
        try {
            const result = await applyLorebookMaintenanceForArtifact(artifact);
            await syncLorebook(artifact, true);
            await saveArtifactToMessage(index, artifact);
            return result;
        }
        finally {
            unbindArtifactTaskGuard(artifact, guard);
            unbindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
        }
    }, { priority: 70, chatKey: artifact.chatKey });
}
export async function forceSummary(requestedIndex, kind) {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const latest = latestSnapshotArtifact();
    if (!latest)
        throw new Error('没有成功状态表，不能生成总结');
    if (Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex !== latest.index) {
        throw new Error('总结只能基于最新成功状态表');
    }
    const { index, artifact } = latest;
    const scheduledHistoryRevision = currentHistoryRevision(artifact.chatKey);
    // 玩家手动重试必须接管同聊天的陈旧自动派生任务。否则上游空响应后，旧自动总结/同步
    // 仍可能短暂占住全局执行器，让“立即小总结”长期停留在排队外观。
    taskQueue.cancelPendingMatching((task) => Boolean(task.chatKey === artifact.chatKey
        && task.automatic === true
        && ['smallSummary', 'largeSummary', 'sync'].includes(String(task.kind))), '玩家已手动提交总结，旧自动派生任务已取消');
    const cancelledActiveSummary = taskQueue.cancelActiveMatching((task) => Boolean(task.chatKey === artifact.chatKey
        && task.automatic === true
        && ['smallSummary', 'largeSummary'].includes(String(task.kind))), '玩家已手动提交总结，旧自动总结已请求取消');
    if (cancelledActiveSummary)
        abortActiveAutomaticSummaryRequests();
    // queued/running 是运行时状态，不能在真实任务已经结束后继续作为持久化锁。
    const hasLiveSummaryTask = taskQueue.list().some((task) => Boolean(['queued', 'running'].includes(String(task.state))
        && task.chatKey === artifact.chatKey
        && ['smallSummary', 'largeSummary'].includes(String(task.kind))
        && (!task.messageKey || task.messageKey === artifact.messageKey)));
    if (['queued', 'running'].includes(artifact.stages.summary.status) && !hasLiveSummaryTask) {
        markStage(artifact, 'summary', 'failed', '上次总结任务已结束但状态未收尾，已释放并允许重新提交');
        await saveArtifactToMessage(index, artifact);
    }
    const key = `${PIPELINE_VERSION}:force-summary:${kind}:${artifact.chatKey}:${artifact.messageKey}`;
    return taskQueue.run(key, `立即${kind === 'small' ? '小' : '大'}总结`, kind === 'small' ? 'smallSummary' : 'largeSummary', async (guard) => {
        if (currentChatKey() !== artifact.chatKey)
            throw new TaskSkippedError('聊天已切换，本次总结任务不再处理');
        assertHistoryRevisionCurrent(artifact.chatKey, scheduledHistoryRevision);
        bindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
        bindArtifactTaskGuard(artifact, guard);
        const errors = [];
        try {
            try {
                await runSummaryStage(artifact, kind, true);
            }
            catch (error) {
                if (derivedTaskError(error))
                    throw error;
                errors.push(`${kind === 'small' ? '小总结' : '大总结'}：${toErrorMessage(error)}`);
            }
            await saveArtifactToMessage(index, artifact);
            if (resolveHostControl(getSettings()).lorebook) {
                try {
                    await syncLorebook(artifact);
                }
                catch (error) {
                    if (derivedTaskError(error))
                        throw error;
                    errors.push(`世界书：${toErrorMessage(error)}`);
                }
                await saveArtifactToMessage(index, artifact);
            }
            if (errors.length)
                throw new Error(errors.join('；'));
            return artifact;
        }
        finally {
            unbindArtifactTaskGuard(artifact, guard);
            unbindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
        }
    }, {
        priority: 70,
        chatKey: artifact.chatKey,
        triggerSource: 'manual-summary',
        messageKey: artifact.messageKey,
        messageFingerprint: artifact.sourceFingerprint,
        historyRevisionAtEnqueue: scheduledHistoryRevision,
        automatic: false,
    });
}
export function getArtifactAt(index) {
    return getAttachedArtifact(getMessage(index));
}
export async function resetCurrentGame() {
    const sourceChatKey = currentChatKey();
    taskQueue.setAccepting(false);
    abortActiveRequests();
    taskQueue.resetRuntime();
    try {
        await taskQueue.whenIdle();
        if (currentChatKey() !== sourceChatKey)
            throw new Error('聊天已切换，已停止重置当前游戏');
        const lorebookEntries = await clearCurrentChatLorebookEntries(sourceChatKey);
        if (currentChatKey() !== sourceChatKey)
            throw new Error('聊天已切换，已停止重置当前游戏');
        let messages = 0;
        for (const message of getChat()) {
            const extra = message?.extra;
            const hadCurrent = Boolean(extra?.[MODULE_NAME]);
            const hadLegacy = Boolean(extra?.[LEGACY_MODULE_NAME]);
            if (hadCurrent) {
                delete extra[MODULE_NAME];
            }
            if (hadLegacy) {
                delete extra[LEGACY_MODULE_NAME];
            }
            if (hadCurrent || hadLegacy) {
                messages += 1;
            }
        }
        const namespace = getChatMetadataNamespace();
        delete namespace.state;
        delete namespace.lorebookName;
        namespace.updatedAt = nowIso();
        const context = getContext();
        if (context.chatMetadata?.[LEGACY_MODULE_NAME])
            delete context.chatMetadata[LEGACY_MODULE_NAME];
        await persistChatFor(sourceChatKey);
        if (currentChatKey() !== sourceChatKey)
            throw new Error('聊天已切换，已停止重置当前游戏');
        await persistMetadataFor(sourceChatKey);
        notifyFrom(0);
        return { messages, lorebookEntries };
    }
    finally {
        taskQueue.setAccepting(getSettings().enabled);
    }
}
export function latestArtifact() {
    const chat = getChat();
    const chatKey = currentChatKey();
    for (let i = chat.length - 1; i >= 0; i -= 1) {
        const artifact = getAttachedArtifact(chat[i]);
        if (artifact?.chatKey === chatKey)
            return { index: i, artifact };
    }
    return null;
}
export function latestSnapshotArtifact() {
    const chat = getChat();
    const chatKey = currentChatKey();
    for (let i = chat.length - 1; i >= 0; i -= 1) {
        const artifact = getAttachedArtifact(chat[i]);
        if (artifact?.chatKey === chatKey && artifact.snapshot && artifact.stages.state.status === 'success') {
            return { index: i, artifact };
        }
    }
    return null;
}
export function installPipelineEventHandlers() {
    const context = globalThis.SillyTavern.getContext();
    const { eventSource, event_types } = context;
    const onReceived = (payload) => scheduleMessage(payload, false, 180, 'message-received');
    const handleInvalidation = (payload, reason) => {
        if (!getSettings().enabled)
            return;
        const changedIndex = resolveChangedIndex(payload);
        void invalidateHistory(payload, reason).then(() => {
            if (reason !== 'deleted'
                && changedIndex !== null
                && isNarrativeTail(changedIndex)) {
                // 最新正文的编辑或 swipe 没有后续依赖，自动从审核继续跑完整链，不要求人工历史重建。
                scheduleMessage(changedIndex, false, 120, `history-${reason}`);
            }
        }).catch((error) => {
            console.error('[MirrorAbyss] history invalidation failed', error);
            toast('error', `历史变化处理失败：${toErrorMessage(error)}`);
        });
    };
    const onEdited = (payload) => handleInvalidation(payload, 'edited');
    const onSwiped = (payload) => handleInvalidation(payload, 'swiped');
    const onDeleted = (payload) => handleInvalidation(payload, 'deleted');
    const onChatChanged = () => {
        const chatKey = currentChatKey();
        // chatKey 单独不能识别 A → B → A：不受 AbortController 控制的宿主保存或世界书
        // I/O 可能在玩家切回 A 后才返回。给当前 active job 留下永久取消标记，使既有
        // task guard 在下一提交点拒绝迟到结果。
        taskQueue.cancelActiveMatching(() => true, '聊天已切换，旧聊天运行任务已取消');
        abortActiveRequests();
        taskQueue.cancelPendingOutsideChat(chatKey);
        cancelScheduledMessagesOutsideChat(chatKey);
        void reconcileInterruptedRuntimeState().catch((error) => {
            console.warn('[MirrorAbyss] interrupted runtime reconciliation failed', error);
        });
    };
    eventSource.on(event_types.MESSAGE_RECEIVED, onReceived);
    eventSource.on(event_types.MESSAGE_EDITED, onEdited);
    eventSource.on(event_types.MESSAGE_SWIPED, onSwiped);
    eventSource.on(event_types.MESSAGE_DELETED, onDeleted);
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    return () => {
        removeSourceListener(eventSource, event_types.MESSAGE_RECEIVED, onReceived);
        removeSourceListener(eventSource, event_types.MESSAGE_EDITED, onEdited);
        removeSourceListener(eventSource, event_types.MESSAGE_SWIPED, onSwiped);
        removeSourceListener(eventSource, event_types.MESSAGE_DELETED, onDeleted);
        removeSourceListener(eventSource, event_types.CHAT_CHANGED, onChatChanged);
    };
}
//# sourceMappingURL=pipeline.js.map
