/* Generated from src/repository/chat-document-repository.ts for esm.sh — do not edit dist directly. */
import { EXTENSION_NAMESPACE } from '../constants.js';
import { createEmptyChatDocument } from '../model/chat-document.js';
import { parseChatDocument } from '../model/schemas.js';
/**
 * ChatDocument 的唯一物理持久化边界。
 * 它只允许读写当前聊天，禁止后台任务通过“当前上下文”猜测旧聊天目标。
 */
export class ChatDocumentRepository {
    host;
    session;
    constructor(host, session) {
        this.host = host;
        this.session = session;
    }
    async loadCurrent(token) {
        this.assertWritableTarget(token);
        const context = this.host.getContext();
        const namespace = this.readNamespace(context);
        if (namespace.document === undefined) {
            return createEmptyChatDocument(token.chatKey);
        }
        const document = parseChatDocument(namespace.document);
        if (document.chatKey !== token.chatKey) {
            throw new Error('聊天元数据中的 ChatDocument 与当前聊天身份不一致');
        }
        this.assertWritableTarget(token);
        return document;
    }
    async saveCurrent(token, document) {
        this.assertWritableTarget(token);
        if (document.chatKey !== token.chatKey) {
            throw new Error('拒绝把 ChatDocument 写入其他聊天');
        }
        const validated = parseChatDocument(document);
        const context = this.host.getContext();
        const metadata = (context.chatMetadata ??= {});
        const previous = metadata[EXTENSION_NAMESPACE];
        metadata[EXTENSION_NAMESPACE] = {
            document: structuredClone(validated),
        };
        try {
            this.assertWritableTarget(token);
            await this.host.saveCurrentChatMetadata();
            this.assertWritableTarget(token);
        }
        catch (error) {
            // 保存失败时恢复当前内存引用，避免 UI 误读未持久化数据。
            if (previous === undefined) {
                delete metadata[EXTENSION_NAMESPACE];
            }
            else {
                metadata[EXTENSION_NAMESPACE] = previous;
            }
            throw error;
        }
    }
    readNamespace(context) {
        const value = context.chatMetadata?.[EXTENSION_NAMESPACE];
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value;
    }
    assertWritableTarget(token) {
        this.session.assertCurrent(token);
        if (!token.chatKey || !this.host.isCurrentChat(token.chatKey)) {
            throw new Error('当前 SillyTavern 聊天已变化，拒绝继续读写');
        }
    }
}
