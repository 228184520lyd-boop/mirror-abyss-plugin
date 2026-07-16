import { getContext, getMessage, messageFingerprint, messageIdentity, persistChat } from './context.js';
import { assertArtifactCommitCurrent } from './commit-guard.js';
import { attachArtifactToMessage } from '../domain/artifact.js';
function updateActiveSwipe(message, text) {
    if (!Array.isArray(message?.swipes))
        return;
    const id = Number(message.swipe_id);
    if (Number.isInteger(id) && id >= 0 && id < message.swipes.length)
        message.swipes[id] = text;
}
export async function refreshMessageDisplay(index) {
    const context = getContext();
    if (typeof context.reloadCurrentChat === 'function')
        await context.reloadCurrentChat();
    else if (context.event_types?.MESSAGE_UPDATED) {
        context.eventSource?.emit?.(context.event_types.MESSAGE_UPDATED, index);
    }
}
export async function replaceMessageInPlace(artifact, text) {
    assertArtifactCommitCurrent(artifact);
    const message = getMessage(artifact.messageIndex);
    if (!message || message.is_user)
        throw new Error('原AI消息已不存在');
    const finalText = String(text || '').trim();
    if (!finalText)
        throw new Error('审核模型返回的修正版正文为空');
    message.mes = finalText;
    updateActiveSwipe(message, finalText);
    artifact.assistantText = finalText;
    artifact.sourceFingerprint = messageFingerprint(artifact.messageIndex);
    artifact.messageKey = messageIdentity(artifact.messageIndex);
    artifact.approvedFingerprint = artifact.sourceFingerprint;
    artifact.hiddenByAudit = false;
    attachArtifactToMessage(message, artifact);
    await persistChat();
    await refreshMessageDisplay(artifact.messageIndex);
    return artifact.sourceFingerprint;
}
