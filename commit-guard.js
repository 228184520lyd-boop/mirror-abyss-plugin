import { currentChatKey, getMessage, messageFingerprint } from './context.js';
export class CommitRejectedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CommitRejectedError';
    }
}
export function assertArtifactCommitCurrent(artifact) {
    if (currentChatKey() !== artifact.chatKey) {
        throw new CommitRejectedError('聊天已切换，本次结果不再写入');
    }
    const message = getMessage(artifact.messageIndex);
    if (!message || message.is_user) {
        throw new CommitRejectedError('原AI正文已不存在，请重新整理');
    }
    if (messageFingerprint(artifact.messageIndex) !== artifact.sourceFingerprint) {
        throw new CommitRejectedError('正文已经变化，请重新整理');
    }
}
