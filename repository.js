import { currentChatKey, getChatMetadataNamespace, persistMetadata } from '../core/context.js';
import { nowIso } from '../core/utils.js';
function emptyChatState(chatKey) {
    return {
        schemaVersion: 1,
        chatKey,
        processedMessageKeys: [],
        smallSummaries: [],
        largeSummaries: [],
        lastSyncStatus: 'idle',
        updatedAt: nowIso(),
    };
}
/**
 * Canonical message artifacts live on message.extra. This function remains as
 * a pipeline boundary so stages do not need to know where the artifact lives.
 */
export async function putArtifact(_artifact) {
    // The live artifact object is already attached to the SillyTavern message.
}
export async function getChatState(chatKey) {
    if (currentChatKey() !== chatKey)
        throw new Error('聊天已切换，不读取旧聊天状态');
    const namespace = getChatMetadataNamespace();
    const current = namespace.state;
    if (!current || current.chatKey !== chatKey) {
        namespace.state = emptyChatState(chatKey);
    }
    return namespace.state;
}
export async function putChatState(state) {
    if (currentChatKey() !== state.chatKey)
        throw new Error('聊天已切换，不写入旧聊天状态');
    state.updatedAt = nowIso();
    const namespace = getChatMetadataNamespace();
    namespace.state = state;
    namespace.updatedAt = state.updatedAt;
    await persistMetadata();
}
export async function clearAllStorage() {
    const namespace = getChatMetadataNamespace();
    delete namespace.state;
    delete namespace.lorebookName;
    namespace.updatedAt = nowIso();
    await persistMetadata();
}
