/* Generated from src/app/chat-session.ts for esm.sh — do not edit dist directly. */
export class StaleChatSessionError extends Error {
    constructor() {
        super('聊天会话已经切换，旧任务结果已丢弃');
        this.name = 'StaleChatSessionError';
    }
}
/**
 * 当前聊天会话控制器。
 * 切换聊天时只做三件事：递增代次、取消旧请求、建立新信号。
 */
export class ChatSessionController {
    chatKey = null;
    generation = 0;
    controller = new AbortController();
    switchTo(chatKey) {
        this.controller.abort('chat-changed');
        this.generation += 1;
        this.chatKey = chatKey;
        this.controller = new AbortController();
        return this.capture();
    }
    capture() {
        return Object.freeze({
            chatKey: this.chatKey,
            generation: this.generation,
            signal: this.controller.signal,
        });
    }
    assertCurrent(token) {
        if (token.signal.aborted ||
            token.generation !== this.generation ||
            token.chatKey !== this.chatKey) {
            throw new StaleChatSessionError();
        }
    }
    isCurrent(token) {
        try {
            this.assertCurrent(token);
            return true;
        }
        catch {
            return false;
        }
    }
    stop() {
        this.controller.abort('extension-stopped');
        this.generation += 1;
        this.chatKey = null;
    }
}
