/* Generated from src/host/message-gateway.ts for esm.sh — do not edit dist directly. */
import { MirrorAbyssError } from '../shared/errors.js';
import { hashText } from '../shared/hash.js';
const MESSAGE_NAMESPACE = 'mirrorAbyssV2';
/**
 * 正文读取和替换的唯一边界。
 * FACT-RUN-001 / FACT-CONTENT-002：每次操作固定 chatKey；替换后必须重新读取并校验哈希。
 */
export class MessageGateway {
    host;
    session;
    constructor(host, session) {
        this.host = host;
        this.session = session;
    }
    async getAssistantMessage(token, requestedIndex) {
        this.assertTarget(token);
        const context = this.host.getContext();
        const chat = context.chat ?? [];
        const index = requestedIndex ?? findLatestAssistantIndex(chat);
        if (index < 0)
            throw new MirrorAbyssError('NO_ASSISTANT_MESSAGE', '当前聊天没有可处理的 AI 正文');
        const message = chat[index];
        if (!isAssistantMessage(message))
            throw new MirrorAbyssError('NO_ASSISTANT_MESSAGE', `第 ${index} 条不是可处理的 AI 正文`);
        const messageKey = await this.ensureMessageKey(token, index, message);
        this.assertTarget(token);
        return {
            messageKey,
            messageIndex: index,
            text: String(message.mes ?? ''),
            contentHash: hashText(String(message.mes ?? '')),
            playerText: previousPlayerText(chat, index),
        };
    }
    async replaceText(token, snapshot, text) {
        this.assertTarget(token);
        const context = this.host.getContext();
        const message = context.chat?.[snapshot.messageIndex];
        if (!isAssistantMessage(message))
            throw new MirrorAbyssError('MESSAGE_CHANGED', '待修正消息已不存在');
        if (readMessageKey(message) !== snapshot.messageKey || hashText(String(message.mes ?? '')) !== snapshot.contentHash) {
            throw new MirrorAbyssError('MESSAGE_CHANGED', '修正前正文已经变化，拒绝覆盖');
        }
        message.mes = text;
        if (Array.isArray(message.swipes) && Number.isInteger(message.swipe_id) && message.swipe_id >= 0) {
            message.swipes[message.swipe_id] = text;
        }
        context.updateMessageBlock?.(snapshot.messageIndex, message);
        await this.host.saveCurrentChat();
        this.assertTarget(token);
        const verified = context.chat?.[snapshot.messageIndex];
        if (!isAssistantMessage(verified) || readMessageKey(verified) !== snapshot.messageKey) {
            throw new MirrorAbyssError('MESSAGE_CHANGED', '修正后无法重新定位正文');
        }
        const verifiedText = String(verified.mes ?? '');
        const verifiedHash = hashText(verifiedText);
        if (verifiedHash !== hashText(text)) {
            throw new MirrorAbyssError('MESSAGE_CHANGED', 'SillyTavern 回读正文与修正结果不一致');
        }
        return { ...snapshot, text: verifiedText, contentHash: verifiedHash };
    }
    async ensureMessageKey(token, index, message) {
        const existing = readMessageKey(message);
        if (existing)
            return existing;
        const context = this.host.getContext();
        const generated = context.uuidv4?.() ?? crypto.randomUUID();
        const extra = (message.extra ??= {});
        extra[MESSAGE_NAMESPACE] = { messageKey: generated };
        context.updateMessageBlock?.(index, message);
        await this.host.saveCurrentChat();
        this.assertTarget(token);
        return generated;
    }
    assertTarget(token) {
        this.session.assertCurrent(token);
        if (!token.chatKey || !this.host.isCurrentChat(token.chatKey)) {
            throw new MirrorAbyssError('STALE_CHAT', '聊天已经切换，拒绝继续操作');
        }
    }
}
function readMessageKey(message) {
    const value = message.extra?.[MESSAGE_NAMESPACE];
    return value && typeof value === 'object' && typeof value.messageKey === 'string' ? value.messageKey : '';
}
function isAssistantMessage(message) {
    return Boolean(message && !message.is_user && !message.is_system && typeof message.mes === 'string' && message.mes.trim());
}
function findLatestAssistantIndex(chat) {
    for (let index = chat.length - 1; index >= 0; index -= 1)
        if (isAssistantMessage(chat[index]))
            return index;
    return -1;
}
function previousPlayerText(chat, before) {
    for (let index = before - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (message?.is_user && !message.is_system && typeof message.mes === 'string')
            return message.mes;
    }
    return '';
}
