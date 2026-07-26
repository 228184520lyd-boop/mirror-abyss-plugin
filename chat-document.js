/* Generated from src/model/chat-document.ts — do not edit dist directly. */
import { CHAT_DOCUMENT_SCHEMA_VERSION, DEFAULT_TABLE_KEYS } from '../constants.js';
export function createEmptyChatDocument(chatKey, now = Date.now()) {
    const tables = Object.fromEntries(DEFAULT_TABLE_KEYS.map((key) => [key, []]));
    return {
        schemaVersion: CHAT_DOCUMENT_SCHEMA_VERSION,
        chatKey, revision: 0, createdAt: now, updatedAt: now,
        recordingBoundary: null, focusObjectId: null, lastTurnSummary: '',
        messages: {}, facts: {}, tables,
        summaries: { small: [], large: [] }, rebuildDraft: null,
        publication: { targetRevision: 0, publishedRevision: 0, lastError: null },
    };
}
