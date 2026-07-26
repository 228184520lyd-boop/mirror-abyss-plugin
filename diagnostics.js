/* Generated from src/shared/diagnostics.ts — do not edit dist directly. */
import { VERSION, DEFAULT_TABLE_KEYS } from '../constants.js';
/**
 * 只输出宿主能力、阶段状态和数量，不包含正文、事实内容、规则文本或角色名称。
 * 该 JSON 用于实机留证，避免用户只能依赖截图描述错误。
 */
export function createDiagnosticReport(input) {
    const host = readHostCapabilities();
    const document = input.document;
    const tableCounts = Object.fromEntries(DEFAULT_TABLE_KEYS.map((key) => [key, document?.tables[key]?.length ?? 0]));
    return {
        version: VERSION,
        generatedAt: new Date().toISOString(),
        runtimeProvider: globalThis.__MIRROR_ABYSS_RUNTIME_PROVIDER__ ?? null,
        dependencyProviders: globalThis.__MIRROR_ABYSS_DEPENDENCY_PROVIDERS__ ?? {},
        bootstrap: globalThis.__MIRROR_ABYSS_BOOTSTRAP__ ?? null,
        environment: {
            userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
            location: typeof location === 'undefined' ? null : location.href,
        },
        host,
        session: {
            status: input.session.status,
            activeChatKey: input.session.activeChatKey,
            generation: input.session.generation,
            error: input.session.error,
        },
        processing: {
            status: input.processing.status,
            source: input.processing.source,
            messageIndex: input.processing.messageIndex,
            messageKey: input.processing.messageKey,
            detail: input.processing.detail,
            error: input.processing.error,
            lastCompletedAt: input.processing.lastCompletedAt,
        },
        document: document ? {
            schemaVersion: document.schemaVersion,
            chatKey: document.chatKey,
            revision: document.revision,
            updatedAt: document.updatedAt,
            messageRecordCount: Object.keys(document.messages).length,
            factCount: Object.keys(document.facts).length,
            tableCounts,
            publication: document.publication,
        } : null,
    };
}
function readHostCapabilities() {
    const getContext = globalThis.SillyTavern?.getContext;
    if (typeof getContext !== 'function') {
        return { getContext: false };
    }
    try {
        const context = getContext();
        const events = context?.eventTypes ?? context?.event_types ?? {};
        return {
            getContext: true,
            eventSource: Boolean(context?.eventSource && typeof context.eventSource.on === 'function'),
            eventTypes: Boolean(context?.eventTypes ?? context?.event_types),
            events: {
                CHAT_CHANGED: Boolean(events.CHAT_CHANGED),
                MESSAGE_RECEIVED: Boolean(events.MESSAGE_RECEIVED),
                MESSAGE_UPDATED: Boolean(events.MESSAGE_UPDATED),
                MESSAGE_EDITED: Boolean(events.MESSAGE_EDITED),
                MESSAGE_SWIPED: Boolean(events.MESSAGE_SWIPED),
            },
            chatArray: Array.isArray(context?.chat),
            chatMetadata: Boolean(context?.chatMetadata && typeof context.chatMetadata === 'object'),
            saveMetadata: typeof context?.saveMetadata === 'function',
            saveChat: typeof context?.saveChat === 'function',
            generateRaw: typeof context?.generateRaw === 'function',
            updateMessageBlock: typeof context?.updateMessageBlock === 'function',
        };
    }
    catch (error) {
        return {
            getContext: true,
            contextReadError: error instanceof Error ? error.message : String(error),
        };
    }
}
