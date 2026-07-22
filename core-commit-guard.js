/**
 * 模块职责：所有异步结果提交前的聊天、历史修订、任务代次与正文指纹守卫。
 * 维护边界：任何新增异步写入点都应复用这些守卫，不能只依赖 messageIndex。
 */
import { currentChatKey, getContext, getMessage, messageFingerprint } from './core-context.js';
// 这些修订号只存在于当前页面运行期，用于让历史变化后的旧异步任务失效；不写入持久数据结构。
const historyRevisions = new Map();
const artifactHistoryRevisions = new WeakMap();
const artifactTaskGuards = new WeakMap();
export class CommitRejectedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CommitRejectedError';
    }
}
export function assertChatCommitCurrent(chatKey, message = '聊天已切换，本次结果不再写入') {
    if (currentChatKey() !== chatKey) {
        throw new CommitRejectedError(message);
    }
}
/**
 * 使用发起操作时的 chatKey 包围一次聊天保存。
 * 保存前后都校验，是为了覆盖 saveChat 内部存在 await 的切换聊天空窗。
 */
export async function persistChatFor(chatKey) {
    assertChatCommitCurrent(chatKey);
    const context = getContext();
    assertChatCommitCurrent(chatKey);
    if (typeof context.saveChat === 'function') {
        await context.saveChat.call(context);
    }
    else if (typeof context.saveChatConditional === 'function') {
        await context.saveChatConditional.call(context);
    }
    assertChatCommitCurrent(chatKey);
}
export async function persistMetadataFor(chatKey) {
    assertChatCommitCurrent(chatKey, '聊天已切换，本次元数据不再写入');
    const context = getContext();
    assertChatCommitCurrent(chatKey, '聊天已切换，本次元数据不再写入');
    if (typeof context.saveMetadata === 'function') {
        await context.saveMetadata.call(context);
    }
    else {
        context.saveMetadataDebounced?.call(context);
    }
    assertChatCommitCurrent(chatKey, '聊天已切换，本次元数据不再写入');
}
export function currentHistoryRevision(chatKey) {
    return historyRevisions.get(chatKey) ?? 0;
}
export function invalidateHistoryRevision(chatKey) {
    const next = currentHistoryRevision(chatKey) + 1;
    historyRevisions.set(chatKey, next);
    return next;
}
export function assertHistoryRevisionCurrent(chatKey, expectedRevision) {
    if (currentHistoryRevision(chatKey) !== expectedRevision) {
        throw new CommitRejectedError('历史消息已经变化，本次旧任务结果不再写入');
    }
}
export function bindArtifactHistoryRevision(artifact, revision) {
    artifactHistoryRevisions.set(artifact, revision);
}
export function unbindArtifactHistoryRevision(artifact, revision) {
    if (revision === undefined || artifactHistoryRevisions.get(artifact) === revision) {
        artifactHistoryRevisions.delete(artifact);
    }
}
export function bindArtifactTaskGuard(artifact, guard) {
    artifactTaskGuards.set(artifact, guard);
}
export function unbindArtifactTaskGuard(artifact, guard) {
    if (!guard || artifactTaskGuards.get(artifact) === guard)
        artifactTaskGuards.delete(artifact);
}
/**
 * artifact 最终提交守卫：任务代次、历史修订、聊天身份和正文指纹必须同时有效。
 */
export function assertArtifactCommitCurrent(artifact) {
    artifactTaskGuards.get(artifact)?.assertCurrent();
    const expectedRevision = artifactHistoryRevisions.get(artifact);
    if (expectedRevision !== undefined) {
        assertHistoryRevisionCurrent(artifact.chatKey, expectedRevision);
    }
    assertChatCommitCurrent(artifact.chatKey);
    const message = getMessage(artifact.messageIndex);
    if (!message || message.is_user) {
        throw new CommitRejectedError('原AI正文已不存在，请重新整理');
    }
    if (messageFingerprint(artifact.messageIndex) !== artifact.sourceFingerprint) {
        throw new CommitRejectedError('正文已经变化，请重新整理');
    }
}
