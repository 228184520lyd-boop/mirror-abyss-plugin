/* Generated from src/host/silly-tavern.ts for esm.sh — do not edit dist directly. */
/** SillyTavern 公共上下文的唯一入口；其他模块不得缓存宿主可变对象。 */
export class SillyTavernGateway {
    getContext() {
        const context = globalThis.SillyTavern?.getContext?.();
        if (!context)
            throw new Error('SillyTavern 上下文尚未就绪');
        return context;
    }
    getCurrentChatKey() {
        const context = this.getContext();
        const chatId = context.getCurrentChatId?.() ?? context.chatId ?? context.chat_metadata?.chat_id ?? null;
        if (chatId === null || chatId === undefined || String(chatId) === '')
            return null;
        const scope = this.getScopeKey(context);
        return `${scope}:${hashText(`${scope}|${String(chatId)}`)}`;
    }
    isCurrentChat(chatKey) { return this.getCurrentChatKey() === chatKey; }
    subscribeChatChanged(handler) { return this.subscribe('CHAT_CHANGED', handler); }
    subscribeMessageReceived(handler) {
        return this.subscribe('MESSAGE_RECEIVED', (value) => handler(Number(value)));
    }
    subscribeMessageChanged(handler) {
        const removers = ['MESSAGE_UPDATED', 'MESSAGE_EDITED', 'MESSAGE_SWIPED']
            .map((name) => this.subscribe(name, (value) => handler(Number(value)), false))
            .filter((value) => Boolean(value));
        return () => removers.forEach((remove) => remove());
    }
    async saveCurrentChatMetadata() {
        const save = this.getContext().saveMetadata;
        if (typeof save !== 'function')
            throw new Error('当前 SillyTavern 未提供 saveMetadata');
        await save();
    }
    async saveCurrentChat() {
        const save = this.getContext().saveChat;
        if (typeof save !== 'function')
            throw new Error('当前 SillyTavern 未提供 saveChat');
        await save();
    }
    subscribe(name, handler, required = true) {
        const context = this.getContext();
        // FACT-HOST-001：官方当前接口提供 eventTypes，同时保留 event_types 兼容别名。
        const events = context.eventTypes ?? context.event_types ?? {};
        const event = events[name];
        if (!event) {
            if (required)
                throw new Error(`当前 SillyTavern 未提供 ${name} 事件`);
            return null;
        }
        context.eventSource.on(event, handler);
        return () => {
            if (typeof context.eventSource.off === 'function')
                context.eventSource.off(event, handler);
            else
                context.eventSource.removeListener?.(event, handler);
        };
    }
    getScopeKey(context) {
        if (context.groupId !== null && context.groupId !== undefined)
            return `group:${String(context.groupId)}`;
        if (context.characterId !== null && context.characterId !== undefined)
            return `character:${String(context.characterId)}`;
        return `character-name:${context.name2 || 'unknown'}`;
    }
}
function hashText(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}
