/**
 * 模块职责：封装 SillyTavern 上下文、设置迁移、聊天身份与消息身份。
 * 维护边界：自动链只接受明确的非系统角色正文；不要为兼容含糊事件而放宽边界。
 */
import { DEFAULT_CONTENT_LIMITS, DEFAULT_SETTINGS, DISPLAY_NAME, LEGACY_MODULE_NAME, MODULE_NAME } from '../constants.js';
import { deepClone, hashText, mergeDefaults, nowIso, safeText } from './utils.js';
import { migrateTableRegistryToObjectViews, normalizeTableRegistry, restoreDefaultTableRegistry, tableByKey } from '../domain/table-registry.js';
export function getContext() {
    const context = globalThis.SillyTavern?.getContext?.();
    if (!context)
        throw new Error('SillyTavern上下文尚未就绪');
    return context;
}
export function tryGetContext() {
    try {
        return globalThis.SillyTavern?.getContext?.() ?? null;
    }
    catch {
        return null;
    }
}
export function getSettings() {
    const context = getContext();
    context.extensionSettings ||= {};
    const legacy = context.extensionSettings[LEGACY_MODULE_NAME];
    const current = context.extensionSettings[MODULE_NAME];
    const migrated = current ?? migrateLegacySettings(legacy);
    context.extensionSettings[MODULE_NAME] = mergeDefaults(DEFAULT_SETTINGS, migrated);
    const settings = context.extensionSettings[MODULE_NAME];
    settings.hostControl ||= structuredClone(DEFAULT_SETTINGS.hostControl);
    settings.hostControl.enabled = settings.hostControl.enabled !== false;
    settings.hostControl.vector = settings.hostControl.vector !== false;
    settings.hostControl.recursion = settings.hostControl.recursion !== false;
    if (String(settings.lorebookLayout) === 'compact')
        settings.lorebookLayout = 'semantic';
    const auditFailAction = String(settings.auditFailAction || 'revise');
    settings.auditFailAction = auditFailAction === 'delete' || auditFailAction === 'withdraw'
        ? 'hide'
        : ['revise', 'mark', 'hide'].includes(auditFailAction)
            ? auditFailAction
            : 'revise';
    settings.revisionFallbackAction = String(settings.revisionFallbackAction) === 'mark' ? 'mark' : 'hide';
    settings.maxRevisionAttempts = Math.min(2, Math.max(1, Math.round(Number(settings.maxRevisionAttempts) || 1)));
    settings.smallSummaryTurns = Math.min(100, Math.max(1, Math.round(Number(settings.smallSummaryTurns) || 12)));
    settings.largeSummaryCount = Math.min(50, Math.max(1, Math.round(Number(settings.largeSummaryCount) || 4)));
    settings.statePrompts.admissionRules = safeText(settings.statePrompts.admissionRules, 8000).trim();
    settings.statePrompts.exclusionRules = safeText(settings.statePrompts.exclusionRules, 8000).trim();
    settings.statePrompts.routingRules = safeText(settings.statePrompts.routingRules, 8000).trim();
    settings.statePrompts.evidenceRules = safeText(settings.statePrompts.evidenceRules, 8000).trim();
    settings.statePrompts.updateRules = safeText(settings.statePrompts.updateRules, 8000).trim();
    for (const kind of ['small', 'large']) {
        const section = settings.summaryPrompts[kind];
        section.coreQuestion = safeText(section.coreQuestion, 1200).trim();
        section.includeRules = safeText(section.includeRules, 6000).trim();
        section.excludeRules = safeText(section.excludeRules, 6000).trim();
        section.updateRules = safeText(section.updateRules, 6000).trim();
        section.expressionRules = safeText(section.expressionRules, 6000).trim();
    }
    settings.contentLimits ||= structuredClone(DEFAULT_CONTENT_LIMITS);
    settings.contentLimits.tables ||= {};
    for (const [key, fallback] of Object.entries(DEFAULT_CONTENT_LIMITS.tables)) {
        const current = Number(settings.contentLimits.tables[key]);
        settings.contentLimits.tables[key] = Math.min(20000, Math.max(200, Math.round(current || fallback)));
    }
    for (const table of settings.tableRegistry ?? []) {
        const fallback = DEFAULT_CONTENT_LIMITS.tables[table.key] ?? DEFAULT_CONTENT_LIMITS.tables.customObjects;
        const current = Number(settings.contentLimits.tables[table.key]);
        settings.contentLimits.tables[table.key] = Math.min(20000, Math.max(200, Math.round(current || fallback)));
    }
    settings.contentLimits.smallSummary = Math.min(10000, Math.max(200, Math.round(Number(settings.contentLimits.smallSummary) || DEFAULT_CONTENT_LIMITS.smallSummary)));
    settings.contentLimits.largeSummary = Math.min(20000, Math.max(300, Math.round(Number(settings.contentLimits.largeSummary) || DEFAULT_CONTENT_LIMITS.largeSummary)));
    settings.requestTimeoutMs = Math.min(300000, Math.max(10000, Math.round(Number(settings.requestTimeoutMs) || 90000)));
    settings.stateContextChars = Math.min(60000, Math.max(6000, Math.round(Number(settings.stateContextChars) || 18000)));
    settings.stateOutputTokens = Math.min(8192, Math.max(768, Math.round(Number(settings.stateOutputTokens) || 3072)));
    settings.stateChunkChars = Math.min(16000, Math.max(1800, Math.round(Number(settings.stateChunkChars) || 6000)));
    settings.ui ||= structuredClone(DEFAULT_SETTINGS.ui);
    settings.ui.graphScope = settings.ui.graphScope === 'relations' ? 'relations' : 'world';
    settings.ui.graphZoom = Math.min(2.5, Math.max(0.5, Number(settings.ui.graphZoom) || 1));
    settings.ui.memoryView = ['combined', 'events', 'graph'].includes(String(settings.ui.memoryView))
        ? settings.ui.memoryView
        : 'combined';
    delete settings.compatibilityMode;
    delete settings.repairInvalidJsonOnce;
    settings.migration ||= { legacyChecked: false, dynamicTablesV23: false, objectViewsV26: false };
    if (!settings.migration.memoryNetworkV38) {
        settings.ui.memoryView = 'combined';
        settings.ui.graphScope = 'world';
        settings.migration.memoryNetworkV38 = true;
    }
    if (!settings.migration.hostControlV39) {
        settings.hostControl = { enabled: true, vector: true, recursion: true };
        settings.migration.hostControlV39 = true;
    }
    settings.migration.naturalModulesV39 ??= false;
    settings.migration.objectViewsV26 ??= false;
    settings.migration.sceneTableV33 ??= false;
    settings.migration.entryRoutingV33 ??= false;
    settings.lorebookRecall ||= { similarityThreshold: 0.72, maxVectorResults: 8, totalCapacity: 24000 };
    settings.lorebookRecall.similarityThreshold = Math.min(0.99, Math.max(0, Number(settings.lorebookRecall.similarityThreshold) || 0.72));
    settings.lorebookRecall.maxVectorResults = Math.min(100, Math.max(1, Math.round(Number(settings.lorebookRecall.maxVectorResults) || 8)));
    settings.lorebookRecall.totalCapacity = Math.min(200000, Math.max(2000, Math.round(Number(settings.lorebookRecall.totalCapacity) || 24000)));
    if (!settings.migration.dynamicTablesV23 || !Array.isArray(settings.tableRegistry) || !settings.tableRegistry.length) {
        settings.tableRegistry = restoreDefaultTableRegistry();
        settings.vectorizeRows = true;
        settings.migration.dynamicTablesV23 = true;
    }
    else {
        settings.tableRegistry = normalizeTableRegistry(settings.tableRegistry);
    }
    if (!settings.migration.objectViewsV26) {
        settings.tableRegistry = migrateTableRegistryToObjectViews(settings.tableRegistry);
        settings.migration.objectViewsV26 = true;
        const legacyActive = settings.ui?.activeTable || '';
        if (['focus', 'state', 'characters', 'skills', 'relationships'].includes(legacyActive))
            settings.ui.activeTable = 'characters';
        if (legacyActive === 'regions')
            settings.ui.activeTable = 'regions';
        if (legacyActive === 'foundations')
            settings.ui.activeTable = 'foundations';
    }
    if (!settings.migration.sceneTableV33) {
        const hasSceneTable = settings.tableRegistry.some((table) => table.key === 'scenes' || table.role === 'scenes');
        if (!hasSceneTable) {
            const sceneTable = restoreDefaultTableRegistry().find((table) => table.key === 'scenes');
            if (sceneTable) {
                const spacetimeIndex = settings.tableRegistry.findIndex((table) => table.role === 'spacetime');
                const insertAt = spacetimeIndex >= 0 ? spacetimeIndex + 1 : 0;
                settings.tableRegistry.splice(insertAt, 0, sceneTable);
                settings.tableRegistry = normalizeTableRegistry(settings.tableRegistry.map((table, order) => ({ ...table, order })));
            }
        }
        settings.migration.sceneTableV33 = true;
    }
    if (!settings.migration.entryRoutingV33) {
        const appendRule = (current, rule, marker) => current.includes(marker)
            ? current
            : `${current.trim()}${current.trim() ? '\n' : ''}${rule}`;
        settings.statePrompts.admissionRules = appendRule(settings.statePrompts.admissionRules, '物品只要其身份可区分，且所有权、位置、数量、完整性、可用性、隐藏状态、用途或后续能否取得会影响下一轮，就应建档；不要求已经多次出现。', '后续能否取得');
        settings.statePrompts.admissionRules = appendRule(settings.statePrompts.admissionRules, '当前实际发生的叙事场景必须建立或更新场景条目；场景条目记录参与对象、核心局面、直接限制与未决承接，不等同于地点本身。', '不等同于地点本身');
        settings.statePrompts.routingRules = appendRule(settings.statePrompts.routingRules, 'scenes（场景）：一次真实发生的叙事场景或局面切片；场景结束后改为已结束/已离开，不删除。', 'scenes（场景）');
        settings.statePrompts.routingRules = appendRule(settings.statePrompts.routingRules, '分类时先判断对象本质：具体个体才是角色；组织、阵营、政权、机构、群体格局和制度执行即使具有名称、目标、关系或行动，也归入全局变化。', '具体个体才是角色');
        settings.statePrompts.updateRules = appendRule(settings.statePrompts.updateRules, '提交前逐项复查正文中的可区分物品，凡所有权、位置、数量、完整性、可用性、隐藏状态、用途或后续可取得性被建立或改变，均需输出独立物品条目。', '逐项复查正文中的可区分物品');
        settings.statePrompts.updateRules = appendRule(settings.statePrompts.updateRules, '提交前确认当前真实场景有场景条目；发生场景切换时，新场景设为当前，旧场景更新为已结束或已离开。', '当前真实场景有场景条目');
        settings.migration.entryRoutingV33 = true;
    }
    for (const table of settings.tableRegistry) {
        const fallback = DEFAULT_CONTENT_LIMITS.tables[table.key] ?? DEFAULT_CONTENT_LIMITS.tables.customObjects;
        const current = Number(settings.contentLimits.tables[table.key]);
        settings.contentLimits.tables[table.key] = Math.min(20000, Math.max(200, Math.round(current || fallback)));
    }
    if (!settings.migration.factOnlyV36) {
        settings.migration.factOnlyV36 = true;
    }
    if (!settings.migration.contentLimitsV36) {
        settings.migration.contentLimitsV36 = true;
    }
    if (!settings.migration.stateProtocolV37) {
        settings.migration.stateProtocolV37 = true;
    }
    if (!tableByKey(settings.tableRegistry, settings.ui?.activeTable || '') || !tableByKey(settings.tableRegistry, settings.ui.activeTable)?.enabled) {
        settings.ui.activeTable = settings.tableRegistry.find((table) => table.enabled)?.key || settings.tableRegistry[0]?.key || 'spacetime';
    }
    const savedProfiles = Array.isArray(context.extensionSettings?.connectionManager?.profiles)
        ? context.extensionSettings.connectionManager.profiles
        : [];
    for (const connection of Object.values(settings.connections ?? {})) {
        connection.profileId ||= '';
        connection.profile ||= '';
        if (connection.mode === 'independent')
            connection.mode = 'current';
        if (!connection.profileId && connection.profile) {
            const matched = savedProfiles.find((profile) => safeText(profile?.name, 160).trim() === safeText(connection.profile, 160).trim());
            if (matched?.id)
                connection.profileId = String(matched.id);
        }
    }
    return settings;
}
function migrateLegacySettings(legacy) {
    if (!legacy || typeof legacy !== 'object')
        return undefined;
    return {
        enabled: legacy.enabled ?? true,
        hostControl: { enabled: true, vector: true, recursion: true },
        autoState: legacy.autoState ?? true,
        showMessagePanel: legacy.showMessagePanels ?? true,
        showTopButton: legacy.showTopButton ?? true,
        auditEnabled: legacy.ruleAuditEnabled ?? false,
        auditPrompt: safeText(legacy.ruleAuditPrompt ?? ''),
        auditFailAction: legacy.ruleAuditFailAction === 'withdraw' ? 'hide' : 'mark',
        revisionPrompt: safeText(legacy.revisionPrompt ?? ''),
        maxRevisionAttempts: Number(legacy.maxRevisionAttempts) || 1,
        stopOnRepeatedViolation: legacy.stopOnRepeatedViolation ?? true,
        revisionFallbackAction: legacy.revisionFallbackAction === 'mark' ? 'mark' : 'hide',
        autoSmallSummary: legacy.autoSmallSummary ?? true,
        smallSummaryTurns: Number(legacy.smallSummaryTurns) || 15,
        autoLargeSummary: legacy.autoLargeSummary ?? true,
        largeSummaryCount: Number(legacy.largeSummaryCount) || 6,
        lorebookSync: legacy.lorebookSync ?? true,
        autoCreateLorebook: legacy.autoCreateChatLorebook ?? true,
        lorebookName: safeText(legacy.lorebookName ?? '', 80),
        vectorizeRows: legacy.vectorizeStateRows ?? false,
        latestContinuityConstant: legacy.latestContinuityConstant ?? true,
        connections: {
            audit: { mode: legacy.auditProfile ? 'profile' : 'current', profileId: '', profile: safeText(legacy.auditProfile ?? '', 120) },
            revision: { mode: legacy.revisionProfile ? 'profile' : 'current', profileId: '', profile: safeText(legacy.revisionProfile ?? legacy.auditProfile ?? '', 120) },
            state: { mode: legacy.stateProfile ? 'profile' : 'current', profileId: '', profile: safeText(legacy.stateProfile ?? '', 120) },
            smallSummary: { mode: legacy.smallSummaryProfile ? 'profile' : 'current', profileId: '', profile: safeText(legacy.smallSummaryProfile ?? '', 120) },
            largeSummary: { mode: legacy.largeSummaryProfile ? 'profile' : 'current', profileId: '', profile: safeText(legacy.largeSummaryProfile ?? '', 120) },
        },
    };
}
export function saveSettings() {
    getContext().saveSettingsDebounced?.();
}
export function getChat() {
    return (getContext().chat ?? []);
}
export function getMessage(index) {
    return getChat()[index] ?? null;
}
/** 自动触发的唯一消息入口边界：必须是明确角色消息，且不能是系统消息或空正文。 */
export function isProcessableAssistantMessage(message) {
    return Boolean(message
        && message.is_user === false
        && message.is_system !== true
        && message.extra?.type !== 'system'
        && safeText(message.mes).trim());
}
export function latestAssistantIndex() {
    const chat = getChat();
    for (let i = chat.length - 1; i >= 0; i -= 1) {
        if (isProcessableAssistantMessage(chat[i]))
            return i;
    }
    return -1;
}
export function previousUserText(beforeIndex) {
    const chat = getChat();
    for (let i = beforeIndex - 1; i >= 0; i -= 1) {
        if (chat[i]?.is_user)
            return safeText(chat[i]?.mes).trim();
    }
    return '';
}
function chatLocator(context) {
    const chatId = context.getCurrentChatId?.() ?? context.chatId ?? context.chat_metadata?.chat_id ?? '';
    const scope = context.groupId ? `group:${context.groupId}` : `character:${context.characterId ?? context.name2 ?? 'unknown'}`;
    return chatId ? `${scope}|${String(chatId)}` : '';
}
/** 用稳定角色/群组 ID 与聊天 ID 绑定已保存 chatKey；角色显示名变化不能改变同一聊天身份。 */
export function currentChatLocator() {
    return chatLocator(getContext());
}
/** chatKey 同时包含角色/群组作用域与聊天标识，不能用消息索引代替。 */
export function currentChatKey() {
    const context = getContext();
    const locator = chatLocator(context);
    const storedState = context.chatMetadata?.[MODULE_NAME]?.state;
    if (locator && storedState?.chatLocator === locator && safeText(storedState.chatKey, 240).trim()) {
        return safeText(storedState.chatKey, 240).trim();
    }
    const chatId = context.getCurrentChatId?.() ?? context.chatId ?? context.chat_metadata?.chat_id ?? '';
    const scope = context.groupId ? `group:${context.groupId}` : `character:${context.characterId ?? context.name2 ?? 'unknown'}`;
    const seed = `${scope}|${chatId || context.name1 || 'chat'}|${context.name2 || ''}`;
    return `${scope}:${hashText(seed)}`;
}
export function messageFingerprint(index) {
    const message = getMessage(index);
    return hashText(`${previousUserText(index)}\n---MA11---\n${safeText(message?.mes)}`);
}
export function messageIdentity(index) {
    const message = getMessage(index);
    const stable = message?.id ?? message?.send_date ?? message?.extra?.gen_id ?? index;
    return `${String(stable)}:${messageFingerprint(index)}`;
}
export function getChatMetadataNamespace() {
    const context = getContext();
    context.chatMetadata ||= {};
    context.chatMetadata[MODULE_NAME] ||= {
        schemaVersion: 1,
        createdAt: nowIso(),
        updatedAt: nowIso(),
    };
    return context.chatMetadata[MODULE_NAME];
}
export async function persistMetadata() {
    const context = getContext();
    if (typeof context.saveMetadata === 'function') {
        await context.saveMetadata();
        return;
    }
    context.saveMetadataDebounced?.();
}
export async function persistChat() {
    const context = getContext();
    if (typeof context.saveChat === 'function') {
        await context.saveChat();
        return;
    }
    if (typeof context.saveChatConditional === 'function') {
        await context.saveChatConditional();
    }
}
export function toast(kind, message) {
    const toastr = globalThis.toastr;
    if (toastr?.[kind])
        toastr[kind](message, DISPLAY_NAME);
    else
        console[kind === 'error' ? 'error' : 'log'](`[${DISPLAY_NAME}] ${message}`);
}
export function cloneSettings() {
    return deepClone(getSettings());
}
//# sourceMappingURL=context.js.map