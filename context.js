import { DEFAULT_SETTINGS, DISPLAY_NAME, LEGACY_MODULE_NAME, MODULE_NAME } from '../constants.js';
import { deepClone, hashText, mergeDefaults, nowIso, safeText } from './utils.js';
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
    if (String(settings.lorebookLayout) === 'compact')
        settings.lorebookLayout = 'semantic';
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
        autoState: legacy.autoState ?? true,
        showMessagePanel: legacy.showMessagePanels ?? true,
        showTopButton: legacy.showTopButton ?? true,
        auditEnabled: legacy.ruleAuditEnabled ?? false,
        auditPrompt: safeText(legacy.ruleAuditPrompt ?? ''),
        auditFailAction: legacy.ruleAuditFailAction === 'withdraw' ? 'hide' : 'mark',
        revisionPrompt: safeText(legacy.revisionPrompt ?? ''),
        maxRevisionAttempts: Number(legacy.maxRevisionAttempts) || 1,
        stopOnRepeatedViolation: legacy.stopOnRepeatedViolation ?? true,
        revisionFallbackAction: 'hide',
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
            revision: { mode: legacy.revisionProfile ? 'profile' : 'current', profileId: '', profile: safeText(legacy.revisionProfile ?? '', 120) },
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
export function latestAssistantIndex() {
    const chat = getChat();
    for (let i = chat.length - 1; i >= 0; i -= 1) {
        if (!chat[i]?.is_user && safeText(chat[i]?.mes).trim())
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
export function currentChatKey() {
    const context = getContext();
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
