import { LEGACY_MODULE_NAME, MODULE_NAME, PIPELINE_VERSION } from '../constants.js';
import { assertArtifactCommitCurrent, CommitRejectedError } from '../core/commit-guard.js';
import { currentChatKey, getChat, getChatMetadataNamespace, getContext, getMessage, getSettings, latestAssistantIndex, messageFingerprint, messageIdentity, persistChat, persistMetadata, toast, } from '../core/context.js';
import { nowIso, toErrorMessage } from '../core/utils.js';
import { abortActiveRequests } from '../core/requests.js';
import { attachArtifactToMessage, createArtifact, getAttachedArtifact, markStage } from '../domain/artifact.js';
import { firstInconsistentArtifactIndex } from '../domain/history.js';
import { runAudit } from './audit.js';
import { clearCurrentChatLorebookEntries, pauseCurrentChatLorebookEntries, syncLorebook } from './lorebook.js';
import { maybeRunSummaries } from './summary.js';
import { runStateExtraction } from './state.js';
import { taskQueue } from './task-queue.js';
import { getChatState, putArtifact, putChatState } from '../storage/repository.js';
const listeners = new Set();
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
    for (const candidate of candidates)
        if (Number.isInteger(Number(candidate)))
            return Number(candidate);
    const chat = getChat();
    return chat.length ? chat.length - 1 : -1;
}
function resolveChangedIndex(payload) {
    if (Number.isInteger(payload))
        return Number(payload);
    const candidates = [payload?.messageId, payload?.message_id, payload?.mesId, payload?.mesid, payload?.index];
    for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && Number.isInteger(Number(candidate)))
            return Number(candidate);
    }
    return null;
}
async function pauseLorebookForHistoryChange(chatKey) {
    try {
        await pauseCurrentChatLorebookEntries(chatKey);
    }
    catch (error) {
        console.warn('[MirrorAbyss] failed to pause stale lorebook entries', error);
        toast('warning', `历史数据已暂停，但世界书条目暂停失败：${toErrorMessage(error)}。请避免继续生成并手动重试历史重算`);
    }
}
async function saveArtifactToMessage(index, artifact) {
    assertArtifactCommitCurrent(artifact);
    const message = getMessage(index);
    if (!message || message.is_user)
        throw new Error('原AI正文已不存在，请重新整理');
    attachArtifactToMessage(message, artifact);
    await putArtifact(artifact);
    await persistChat();
    notify(index, artifact);
}
async function loadOrCreateArtifact(index, _force) {
    const message = getMessage(index);
    if (!message || message.is_user || !String(message.mes || '').trim())
        throw new Error('目标不是有效AI正文');
    const fingerprint = messageFingerprint(index);
    let artifact = getAttachedArtifact(message);
    if (!artifact || artifact.chatKey !== currentChatKey() || artifact.sourceFingerprint !== fingerprint) {
        artifact = createArtifact(message, index);
        attachArtifactToMessage(message, artifact);
        assertArtifactCommitCurrent(artifact);
        await persistChat();
        await putArtifact(artifact);
    }
    // Remove obsolete rc.11 revision state without touching tables or summaries.
    if (artifact.stages?.revision)
        delete artifact.stages.revision;
    if (artifact.revision)
        delete artifact.revision;
    artifact.hiddenByAudit = false;
    return artifact;
}
async function finishStatePipeline(index, artifact, publishLorebook = true) {
    if (!artifact.snapshot || artifact.stages.state.status !== 'success') {
        throw new Error('状态表尚未成功，不能继续总结和世界书同步');
    }
    assertArtifactCommitCurrent(artifact);
    const chatState = await getChatState(artifact.chatKey);
    if (!chatState.processedMessageKeys.includes(artifact.messageKey)) {
        chatState.processedMessageKeys.push(artifact.messageKey);
    }
    chatState.latestSnapshotMessageKey = artifact.messageKey;
    chatState.updatedAt = nowIso();
    await putChatState(chatState);
    await maybeRunSummaries(artifact);
    await saveArtifactToMessage(index, artifact);
    if (publishLorebook) {
        await syncLorebook(artifact);
        await saveArtifactToMessage(index, artifact);
    }
}
let automaticRecoveryPromise = null;
let automaticRecoveryChatKey = '';
function assistantHistoryIndexes() {
    return getChat()
        .map((message, index) => ({ message, index }))
        .filter(({ message }) => Boolean(message
        && !message.is_user
        && !message.is_system
        && String(message.mes || '').trim()))
        .map(({ index }) => index);
}
async function rebuildMessageState(index) {
    const message = getMessage(index);
    if (!message || message.is_user || message.is_system || !String(message.mes || '').trim())
        return null;
    const chatKey = currentChatKey();
    const identity = messageIdentity(index);
    const key = `${PIPELINE_VERSION}:history-rebuild:${chatKey}:${identity}`;
    return taskQueue.run(key, `重建第 ${index + 1} 条历史状态`, 'state', async () => {
        if (currentChatKey() !== chatKey)
            throw new Error('聊天已切换，历史重建已停止');
        const artifact = await loadOrCreateArtifact(index, true);
        await runStateExtraction(artifact, true);
        await saveArtifactToMessage(index, artifact);
        await finishStatePipeline(index, artifact, false);
        return artifact;
    });
}
function inferAutomaticRecoveryStart(state) {
    if (state.historyInvalidation?.startIndex !== undefined)
        return state.historyInvalidation.startIndex;
    const indexes = assistantHistoryIndexes();
    if (!indexes.length)
        return undefined;
    const inconsistent = firstInconsistentArtifactIndex(getChat(), MODULE_NAME, messageIdentity, messageFingerprint);
    if (inconsistent >= 0)
        return inconsistent;
    if (state.historyInvalidation)
        return indexes[0];
    if (!latestSnapshotArtifact() && indexes.length >= 2)
        return indexes[0];
    return undefined;
}
/**
 * Attempts one automatic history recovery for the current chat. On failure the
 * invalidation marker is retained so the existing manual controls remain available.
 */
export async function attemptAutomaticHistoryRecovery() {
    if (!getSettings().enabled || !getSettings().autoState)
        return false;
    const chatKey = currentChatKey();
    if (automaticRecoveryPromise && automaticRecoveryChatKey === chatKey)
        return automaticRecoveryPromise;
    automaticRecoveryChatKey = chatKey;
    automaticRecoveryPromise = (async () => {
        const state = await getChatState(chatKey);
        if (currentChatKey() !== chatKey)
            return false;
        const startIndex = inferAutomaticRecoveryStart(state);
        if (startIndex === undefined)
            return false;
        state.historyInvalidation = {
            startIndex,
            reason: state.historyInvalidation?.reason ?? 'edited',
            detectedAt: state.historyInvalidation?.detectedAt ?? nowIso(),
        };
        state.lastSyncStatus = 'failed';
        state.lastSyncError = `正在自动从第 ${startIndex + 1} 条消息重建历史`;
        await putChatState(state);
        await pauseLorebookForHistoryChange(chatKey);
        toast('info', `检测到历史状态缺失或变化，正在自动从第 ${startIndex + 1} 条消息重建`);
        try {
            await recalculateInvalidatedHistory();
            return true;
        }
        catch (error) {
            const message = toErrorMessage(error);
            const failedState = await getChatState(chatKey);
            failedState.lastSyncStatus = 'failed';
            failedState.lastSyncError = `自动历史重建失败：${message}`;
            await putChatState(failedState);
            console.error('[MirrorAbyss] automatic history recovery failed', error);
            toast('warning', `自动历史重建失败：${message}。现有记忆已保留，请在镜渊中手动选择重建范围`);
            return false;
        }
    })();
    try {
        return await automaticRecoveryPromise;
    }
    finally {
        automaticRecoveryPromise = null;
        automaticRecoveryChatKey = '';
    }
}
export async function processMessage(index, force = false) {
    if (!getSettings().enabled)
        return null;
    const message = getMessage(index);
    if (!message || message.is_user || !String(message.mes || '').trim())
        return null;
    const identity = messageIdentity(index);
    const scheduledChatKey = currentChatKey();
    const key = `${PIPELINE_VERSION}:${scheduledChatKey}:${identity}`;
    return taskQueue.run(key, `处理第 ${index + 1} 条AI正文`, 'state', async () => {
        const settings = getSettings();
        if (!settings.enabled)
            return null;
        if (currentChatKey() !== scheduledChatKey)
            return null;
        const artifact = await loadOrCreateArtifact(index, force);
        notify(index, artifact);
        try {
            await runAudit(artifact, force);
            await saveArtifactToMessage(index, artifact);
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
                await finishStatePipeline(index, artifact);
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
            if (error instanceof Error && error.name === 'AbortError') {
                throw error;
            }
            await saveArtifactToMessage(index, artifact);
            throw error;
        }
    });
}
export function scheduleMessage(payload, force = false, delay = 0) {
    if (!getSettings().enabled)
        return;
    const index = resolveMessageIndex(payload);
    if (index < 0)
        return;
    const scheduledChatKey = currentChatKey();
    window.setTimeout(() => {
        void (async () => {
            if (!getSettings().enabled)
                return;
            if (currentChatKey() !== scheduledChatKey)
                return;
            const state = await getChatState(currentChatKey());
            if (!force && state.historyInvalidation)
                return;
            await processMessage(index, force);
        })().catch((error) => {
            if (error instanceof CommitRejectedError || (error instanceof Error && error.name === 'AbortError'))
                return;
            if (toErrorMessage(error).includes('镜渊已禁用，任务已停止'))
                return;
            console.error('[MirrorAbyss] scheduled processing failed', error);
            toast('error', `自动整理失败：${toErrorMessage(error)}`);
        });
    }, delay);
}
async function invalidateHistory(payload, reason) {
    if (!getSettings().enabled)
        return;
    const eventIndex = resolveChangedIndex(payload);
    const scannedIndex = reason === 'deleted'
        ? firstInconsistentArtifactIndex(getChat(), MODULE_NAME, messageIdentity, messageFingerprint)
        : null;
    const detectedIndex = reason === 'deleted'
        ? (scannedIndex === -1 ? null : scannedIndex)
        : eventIndex;
    const chatKey = currentChatKey();
    const state = await getChatState(chatKey);
    if (currentChatKey() !== chatKey)
        throw new Error('聊天已切换，历史变化不再写入');
    if (detectedIndex === null) {
        state.historyInvalidation = { reason, detectedAt: nowIso() };
        state.lastSyncStatus = 'failed';
        state.lastSyncError = '检测到历史删除，但无法判断位置；请选择重算起点';
        await putChatState(state);
        await pauseLorebookForHistoryChange(chatKey);
        notifyFrom(0);
        await attemptAutomaticHistoryRecovery();
        return;
    }
    const index = Math.max(0, detectedIndex);
    const startIndex = Math.min(index, state.historyInvalidation?.startIndex ?? index);
    state.historyInvalidation = { startIndex, reason, detectedAt: nowIso() };
    state.lastSyncStatus = 'failed';
    state.lastSyncError = `历史消息发生变化，请从第 ${startIndex + 1} 条开始重算`;
    const validPrefixKeys = new Set();
    for (let i = 0; i < startIndex; i += 1) {
        const attached = getAttachedArtifact(getMessage(i));
        if (attached)
            validPrefixKeys.add(attached.messageKey);
    }
    for (let i = startIndex; i < getChat().length; i += 1) {
        const message = getMessage(i);
        if (message?.extra?.[MODULE_NAME])
            delete message.extra[MODULE_NAME];
    }
    const invalidSmallIds = new Set(state.smallSummaries
        .filter((summary) => summary.sourceKeys.some((key) => !validPrefixKeys.has(key)))
        .map((summary) => summary.id));
    state.smallSummaries = state.smallSummaries.filter((summary) => !invalidSmallIds.has(summary.id));
    state.largeSummaries = state.largeSummaries.filter((summary) => !summary.sourceKeys.some((key) => invalidSmallIds.has(key)));
    state.processedMessageKeys = state.processedMessageKeys.filter((key) => validPrefixKeys.has(key));
    state.latestSnapshotMessageKey = state.processedMessageKeys.at(-1);
    await persistChat();
    await putChatState(state);
    await pauseLorebookForHistoryChange(chatKey);
    notifyFrom(index);
    await attemptAutomaticHistoryRecovery();
}
export async function recalculateInvalidatedHistory() {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const chatKey = currentChatKey();
    const state = await getChatState(chatKey);
    const startIndex = state.historyInvalidation?.startIndex;
    if (startIndex === undefined)
        throw new Error('尚未选择历史重算起点');
    const endIndex = getChat().length;
    let latest = null;
    for (let index = startIndex; index < endIndex; index += 1) {
        if (currentChatKey() !== chatKey)
            throw new Error('聊天已切换，历史重算已停止');
        const message = getMessage(index);
        if (!message || message.is_user || message.is_system || !String(message.mes || '').trim())
            continue;
        latest = await rebuildMessageState(index);
        if (currentChatKey() !== chatKey)
            throw new Error('聊天已切换，历史重算已停止');
        if (!latest || latest.stages.state.status === 'failed' || latest.stages.state.status === 'blocked') {
            throw new Error(`第 ${index + 1} 条消息重算失败，世界书仍保持暂停`);
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
        delete freshState.historyInvalidation;
        freshState.lastSyncError = undefined;
        freshState.lastSyncStatus = 'success';
        freshState.lastSyncAt = nowIso();
        await putChatState(freshState);
        toast('success', '历史数据重算完成；当前没有可发布状态，已清除本聊天的镜渊世界书条目');
        return null;
    }
    delete freshState.historyInvalidation;
    freshState.lastSyncError = undefined;
    freshState.lastSyncStatus = 'idle';
    await putChatState(freshState);
    const shouldSync = getSettings().lorebookSync;
    if (shouldSync)
        await syncLorebook(recoveryInfo.artifact);
    await saveArtifactToMessage(recoveryInfo.index, recoveryInfo.artifact);
    toast('success', shouldSync ? '历史数据重算完成，世界书同步已恢复' : '历史数据重算完成；自动世界书同步当前已关闭');
    return recoveryInfo.artifact;
}
export async function chooseHistoryRecalculationStart(startIndex) {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const chatKey = currentChatKey();
    const state = await getChatState(chatKey);
    if (currentChatKey() !== chatKey)
        throw new Error('聊天已切换，不再修改历史重算范围');
    if (!state.historyInvalidation)
        throw new Error('当前没有待处理的历史失效');
    const index = Math.max(0, Math.min(Math.trunc(startIndex), Math.max(0, getChat().length - 1)));
    state.historyInvalidation.startIndex = index;
    const validPrefixKeys = new Set();
    for (let i = 0; i < index; i += 1) {
        const attached = getAttachedArtifact(getMessage(i));
        if (attached)
            validPrefixKeys.add(attached.messageKey);
    }
    for (let i = index; i < getChat().length; i += 1) {
        const message = getMessage(i);
        if (message?.extra?.[MODULE_NAME])
            delete message.extra[MODULE_NAME];
    }
    const invalidSmallIds = new Set(state.smallSummaries
        .filter((summary) => summary.sourceKeys.some((key) => !validPrefixKeys.has(key)))
        .map((summary) => summary.id));
    state.smallSummaries = state.smallSummaries.filter((summary) => !invalidSmallIds.has(summary.id));
    state.largeSummaries = state.largeSummaries.filter((summary) => !summary.sourceKeys.some((key) => invalidSmallIds.has(key)));
    state.processedMessageKeys = state.processedMessageKeys.filter((key) => validPrefixKeys.has(key));
    state.latestSnapshotMessageKey = state.processedMessageKeys.at(-1);
    state.lastSyncError = `已选择从第 ${index + 1} 条消息开始重算`;
    await persistChat();
    await putChatState(state);
    notifyFrom(index);
}
export async function retryStage(index, stage) {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const latestSnapshot = latestSnapshotArtifact();
    if (['audit', 'state'].includes(stage) && index !== latestAssistantIndex()) {
        throw new Error('普通重试只适用于最新AI正文；旧正文请通过历史变更提示从该条开始重算');
    }
    if (['summary', 'sync'].includes(stage) && latestSnapshot?.index !== index) {
        throw new Error('总结和世界书只能基于最新成功状态表');
    }
    if (stage === 'audit')
        return processMessage(index, true);
    const artifact = latestSnapshot?.index === index
        ? latestSnapshot.artifact
        : await loadOrCreateArtifact(index, false);
    const key = `${PIPELINE_VERSION}:retry:${stage}:${artifact.chatKey}:${artifact.messageKey}`;
    return taskQueue.run(key, `重试${stage}`, stage === 'sync' ? 'sync' : stage === 'summary' ? 'smallSummary' : stage, async () => {
        if (currentChatKey() !== artifact.chatKey)
            return null;
        if (stage === 'state') {
            await runStateExtraction(artifact, true);
            await saveArtifactToMessage(index, artifact);
            await finishStatePipeline(index, artifact);
        }
        if (stage === 'summary') {
            await maybeRunSummaries(artifact);
            await saveArtifactToMessage(index, artifact);
            await syncLorebook(artifact);
            await saveArtifactToMessage(index, artifact);
        }
        if (stage === 'sync') {
            await syncLorebook(artifact, true);
            await saveArtifactToMessage(index, artifact);
        }
        return artifact;
    });
}
export async function forceSummary(_index, kind) {
    if (!getSettings().enabled)
        throw new Error('镜渊已关闭，请先启用');
    const latest = latestSnapshotArtifact();
    if (!latest)
        throw new Error('没有成功状态表，不能生成总结');
    const { index, artifact } = latest;
    const key = `${PIPELINE_VERSION}:force-summary:${kind}:${artifact.chatKey}:${artifact.messageKey}`;
    return taskQueue.run(key, `立即${kind === 'small' ? '小' : '大'}总结`, kind === 'small' ? 'smallSummary' : 'largeSummary', async () => {
        if (currentChatKey() !== artifact.chatKey)
            return null;
        await maybeRunSummaries(artifact, kind === 'small', kind === 'large');
        await saveArtifactToMessage(index, artifact);
        if (getSettings().lorebookSync) {
            await syncLorebook(artifact);
            await saveArtifactToMessage(index, artifact);
        }
        return artifact;
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
        await persistChat();
        if (currentChatKey() !== sourceChatKey)
            throw new Error('聊天已切换，已停止重置当前游戏');
        await persistMetadata();
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
    const onReceived = (payload) => scheduleMessage(payload, false);
    const handleInvalidation = (payload, reason) => {
        if (!getSettings().enabled)
            return;
        void invalidateHistory(payload, reason).catch((error) => {
            console.error('[MirrorAbyss] history invalidation failed', error);
            toast('error', `历史变化处理失败：${toErrorMessage(error)}`);
        });
    };
    const onEdited = (payload) => handleInvalidation(payload, 'edited');
    const onSwiped = (payload) => handleInvalidation(payload, 'swiped');
    const onDeleted = (payload) => handleInvalidation(payload, 'deleted');
    const onChatChanged = () => {
        abortActiveRequests();
        window.setTimeout(() => {
            void attemptAutomaticHistoryRecovery();
        }, 300);
    };
    eventSource.on(event_types.MESSAGE_RECEIVED, onReceived);
    eventSource.on(event_types.MESSAGE_EDITED, onEdited);
    eventSource.on(event_types.MESSAGE_SWIPED, onSwiped);
    eventSource.on(event_types.MESSAGE_DELETED, onDeleted);
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    return () => {
        eventSource.removeListener?.(event_types.MESSAGE_RECEIVED, onReceived);
        eventSource.removeListener?.(event_types.MESSAGE_EDITED, onEdited);
        eventSource.removeListener?.(event_types.MESSAGE_SWIPED, onSwiped);
        eventSource.removeListener?.(event_types.MESSAGE_DELETED, onDeleted);
        eventSource.removeListener?.(event_types.CHAT_CHANGED, onChatChanged);
    };
}
