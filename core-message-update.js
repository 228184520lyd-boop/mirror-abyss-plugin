/**
 * 模块职责：将定向修正结果原位写回当前活动 swipe，并刷新 SillyTavern 消息显示。
 * 维护边界：只允许修改仍与 artifact 指纹一致的当前正文，不新增重复消息。
 */
import { getContext, getMessage, messageFingerprint, messageIdentity } from './core-context.js';
import { assertArtifactCommitCurrent, persistChatFor } from './core-commit-guard.js';
import { attachArtifactToMessage } from './domain-artifact.js';
function updateActiveSwipe(message, text) {
    if (!Array.isArray(message?.swipes))
        return;
    const id = Number(message.swipe_id);
    if (Number.isInteger(id) && id >= 0 && id < message.swipes.length)
        message.swipes[id] = text;
}
export async function refreshMessageDisplay(index) {
    const context = getContext();
    const message = getMessage(index);
    // 原位修正只需要重绘这一条消息。reloadCurrentChat 会触发聊天级生命周期事件，
    // 可能把仍在运行的“修正 → 表格”主链误当成聊天切换而取消。
    if (typeof context.updateMessageBlock === 'function') {
        await context.updateMessageBlock(index, message);
        return;
    }
    if (context.event_types?.MESSAGE_UPDATED) {
        context.eventSource?.emit?.(context.event_types.MESSAGE_UPDATED, index);
        return;
    }
    // 仅旧版 SillyTavern 缺少单消息重绘能力时才退回整聊天刷新。
    if (typeof context.reloadCurrentChat === 'function')
        await context.reloadCurrentChat();
}
export async function replaceMessageInPlace(artifact, text) {
    assertArtifactCommitCurrent(artifact);
    const message = getMessage(artifact.messageIndex);
    if (!message || message.is_user)
        throw new Error('原AI消息已不存在');
    const finalText = String(text || '').trim();
    if (!finalText)
        throw new Error('修正文模型返回空正文');
    message.mes = finalText;
    updateActiveSwipe(message, finalText);
    artifact.assistantText = finalText;
    artifact.sourceFingerprint = messageFingerprint(artifact.messageIndex);
    artifact.messageKey = messageIdentity(artifact.messageIndex);
    artifact.approvedFingerprint = artifact.sourceFingerprint;
    artifact.hiddenByAudit = false;
    attachArtifactToMessage(message, artifact);
    await persistChatFor(artifact.chatKey);
    await refreshMessageDisplay(artifact.messageIndex);
    return artifact.sourceFingerprint;
}
