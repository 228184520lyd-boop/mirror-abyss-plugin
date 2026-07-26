/* Generated from src/app/chat-task-executor.ts for esm.sh — do not edit dist directly. */
import PQueue from 'https://esm.sh/p-queue@9.3.1?target=es2022';
/**
 * 每个聊天只允许一个改变业务状态的任务运行。
 * 不提供优先级、租约、心跳、恢复或第二套状态机。
 */
export class ChatTaskExecutor {
    session;
    queues = new Map();
    constructor(session) {
        this.session = session;
    }
    async run(token, operation) {
        if (!token.chatKey) {
            throw new Error('没有活动聊天，无法执行聊天任务');
        }
        const queue = this.getQueue(token.chatKey);
        const result = await queue.add(async () => {
            this.session.assertCurrent(token);
            const value = await operation(token.signal);
            this.session.assertCurrent(token);
            return value;
        }, { signal: token.signal });
        return result;
    }
    clearExcept(chatKey) {
        for (const [key, queue] of this.queues) {
            if (key !== chatKey) {
                queue.clear();
                this.queues.delete(key);
            }
        }
    }
    clearAll() {
        for (const queue of this.queues.values()) {
            queue.clear();
        }
        this.queues.clear();
    }
    getQueue(chatKey) {
        const existing = this.queues.get(chatKey);
        if (existing)
            return existing;
        const queue = new PQueue({ concurrency: 1 });
        this.queues.set(chatKey, queue);
        return queue;
    }
}
