/**
 * 模块职责：创建、读取、附着消息级 artifact，并维护阶段状态。
 * 维护边界：artifact 是单条正文的规范结果，必须与 chatKey、messageIdentity 和 sourceFingerprint 绑定。
 */
import { MODULE_NAME } from './constants.js';
import { currentChatKey, messageFingerprint, messageIdentity, previousUserText } from './core-context.js';
import { nowIso, safeText } from './core-utils.js';
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
            revision: idleStage(),
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
    const terminal = ['success', 'failed', 'cancelled', 'skipped', 'blocked'].includes(status);
    const enteringRunning = status === 'running' && current.status !== 'running';
    artifact.stages[stage] = {
        ...current,
        status,
        attempts: enteringRunning ? current.attempts + 1 : current.attempts,
        // queued/idle 代表一轮尚未开始；直接 blocked/skipped 也不能继承上一轮执行时间。
        startedAt: status === 'running'
            ? (enteringRunning ? now : current.startedAt)
            : terminal && current.status === 'running'
                ? current.startedAt
                : undefined,
        finishedAt: terminal ? now : undefined,
        error: error || undefined,
    };
    artifact.updatedAt = now;
}
