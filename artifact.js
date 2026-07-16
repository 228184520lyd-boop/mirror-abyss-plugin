import { MODULE_NAME } from '../constants.js';
import { currentChatKey, messageFingerprint, messageIdentity, previousUserText } from '../core/context.js';
import { nowIso, safeText } from '../core/utils.js';
function idleStage() {
    return { status: 'idle', attempts: 0 };
}
export function createArtifact(message, messageIndex) {
    const now = nowIso();
    return {
        schemaVersion: 1,
        chatKey: currentChatKey(),
        messageKey: messageIdentity(messageIndex),
        messageIndex,
        sourceFingerprint: messageFingerprint(messageIndex),
        playerText: previousUserText(messageIndex),
        assistantText: safeText(message.mes),
        createdAt: now,
        updatedAt: now,
        stages: {
            audit: idleStage(),
            state: idleStage(),
            summary: idleStage(),
            sync: idleStage(),
        },
    };
}
export function attachArtifactToMessage(message, artifact) {
    message.extra ||= {};
    message.extra[MODULE_NAME] = artifact;
}
export function getAttachedArtifact(message) {
    const value = message?.extra?.[MODULE_NAME];
    return value && typeof value === 'object' ? value : null;
}
export function markStage(artifact, stage, status, error) {
    const current = artifact.stages[stage] ?? idleStage();
    const now = nowIso();
    artifact.stages[stage] = {
        ...current,
        status,
        attempts: status === 'running' ? current.attempts + 1 : current.attempts,
        startedAt: status === 'running' ? now : current.startedAt,
        finishedAt: ['success', 'failed', 'skipped', 'blocked'].includes(status) ? now : undefined,
        error: error || undefined,
    };
    artifact.updatedAt = now;
}
