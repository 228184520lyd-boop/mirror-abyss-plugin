import { VERSION } from '../constants.js';
import { assertArtifactCommitCurrent } from '../core/commit-guard.js';
import { currentChatKey, getChatMetadataNamespace, getContext, getSettings, persistMetadata } from '../core/context.js';
import { hashText, sanitizeBookName, toErrorMessage } from '../core/utils.js';
import { markStage } from '../domain/artifact.js';
import { getChatState, putArtifact, putChatState } from '../storage/repository.js';
import { buildLorebookDocuments } from '../domain/lorebook-publish.js';
let worldInfoModulePromise = null;
export function resetLorebookRuntime() {
    worldInfoModulePromise = null;
}
async function worldInfoApi() {
    if (!worldInfoModulePromise) {
        const moduleUrl = '/scripts/world-info.js';
        worldInfoModulePromise = import(/* @vite-ignore */ moduleUrl);
    }
    return worldInfoModulePromise;
}
function generatedBookName(chatKey = currentChatKey()) {
    const context = getContext();
    const display = sanitizeBookName(context.name2 || context.name1 || 'Chat') || 'Chat';
    return sanitizeBookName(`MA_${display}_${hashText(chatKey).slice(0, 8)}`);
}
async function resolveBookName(create, artifact) {
    if (artifact)
        assertArtifactCommitCurrent(artifact);
    const settings = getSettings();
    const meta = getChatMetadataNamespace();
    const context = getContext();
    let name = sanitizeBookName(settings.lorebookName || meta.lorebookName || context.chatMetadata?.world_info || '');
    if (!name && create && settings.autoCreateLorebook)
        name = generatedBookName(artifact?.chatKey);
    if (!name)
        return '';
    if (create) {
        const wi = await worldInfoApi();
        let data = await wi.loadWorldInfo(name);
        if (!data && typeof wi.createNewWorldInfo === 'function') {
            if (artifact)
                assertArtifactCommitCurrent(artifact);
            await wi.createNewWorldInfo(name, { interactive: false });
            data = await wi.loadWorldInfo(name);
        }
        if (!data) {
            data = { entries: {} };
            if (artifact)
                assertArtifactCommitCurrent(artifact);
            await wi.saveWorldInfo(name, data, true);
        }
        if (artifact)
            assertArtifactCommitCurrent(artifact);
        context.chatMetadata ||= {};
        context.chatMetadata[wi.METADATA_KEY || 'world_info'] = name;
        meta.lorebookName = name;
        await persistMetadata();
    }
    return name;
}
function managedInfo(entry) {
    return entry?.extensions?.mirrorAbyssV11 ?? null;
}
function reloadWorldInfoEditor(wi, name) {
    const reload = wi.reloadEditor ?? wi.reloadWorldInfoEditor;
    if (typeof reload === 'function')
        reload.call(wi, name, true);
}
function verifyManagedSpecs(data, chatKey, desired) {
    if (!data?.entries)
        throw new Error('世界书保存后无法重新读取条目');
    const saved = new Set();
    for (const entry of Object.values(data.entries)) {
        const info = managedInfo(entry);
        if (info?.managed && info.chatKey === chatKey && info.key)
            saved.add(info.key);
    }
    const missing = [...desired.keys()].filter((key) => !saved.has(key));
    if (missing.length)
        throw new Error(`世界书保存校验失败，缺少 ${missing.length} 个托管条目`);
}
function applyEntry(entry, chatKey, key, spec, wi) {
    entry.comment = spec.comment;
    entry.content = spec.content;
    entry.key = spec.keywords;
    entry.constant = Boolean(spec.constant);
    entry.vectorized = Boolean(spec.vectorized);
    entry.selective = !entry.constant;
    entry.disable = false;
    entry.addMemo = true;
    entry.position = wi.world_info_position?.after ?? 1;
    entry.order = spec.order;
    entry.preventRecursion = false;
    entry.excludeRecursion = false;
    entry.delayUntilRecursion = 0;
    entry.extensions ||= {};
    entry.extensions.mirrorAbyssV11 = {
        managed: true,
        chatKey,
        key,
        kind: spec.kind,
        version: VERSION,
    };
}
async function desiredSpecs(artifact) {
    const settings = getSettings();
    const state = await getChatState(artifact.chatKey);
    const documents = buildLorebookDocuments(artifact.snapshot, state.smallSummaries, state.largeSummaries, {
        layout: settings.lorebookLayout,
        vectorize: settings.vectorizeRows,
        latestContinuityConstant: settings.latestContinuityConstant,
    });
    return new Map(documents.map((document) => [document.key, document]));
}
export async function syncLorebook(artifact, force = false) {
    assertArtifactCommitCurrent(artifact);
    if (!artifact.snapshot || artifact.stages.state.status !== 'success') {
        throw new Error('没有成功状态表，停止世界书同步');
    }
    const settings = getSettings();
    if (!settings.lorebookSync && !force) {
        markStage(artifact, 'sync', 'skipped');
        await putArtifact(artifact);
        return;
    }
    markStage(artifact, 'sync', 'running');
    await putArtifact(artifact);
    const chatState = await getChatState(artifact.chatKey);
    if (chatState.historyInvalidation) {
        markStage(artifact, 'sync', 'blocked', '历史消息已变化，等待历史重建');
        chatState.lastSyncStatus = 'failed';
        chatState.lastSyncError = chatState.historyInvalidation.startIndex === undefined
            ? '历史删除位置未知，正在等待自动判断或手动选择重算起点'
            : `第 ${chatState.historyInvalidation.startIndex + 1} 条消息之后的数据需要重算`;
        await putArtifact(artifact);
        await putChatState(chatState);
        return;
    }
    try {
        const wi = await worldInfoApi();
        const name = await resolveBookName(true, artifact);
        if (!name)
            throw new Error('没有可用的聊天世界书');
        const data = (await wi.loadWorldInfo(name)) || { entries: {} };
        data.entries ||= {};
        const desired = await desiredSpecs(artifact);
        const existing = new Map();
        for (const [uid, entry] of Object.entries(data.entries)) {
            const info = managedInfo(entry);
            if (info?.managed && info.chatKey === artifact.chatKey && info.key) {
                existing.set(info.key, { uid, entry });
            }
        }
        let changed = false;
        const entryIds = [];
        for (const [key, spec] of desired) {
            let pair = existing.get(key);
            let entry = pair?.entry;
            if (!entry) {
                entry = wi.createWorldInfoEntry(name, data);
                if (!entry)
                    throw new Error(`世界书条目创建失败：${key}`);
                pair = { uid: String(entry.uid), entry };
                changed = true;
            }
            const before = JSON.stringify(entry);
            applyEntry(entry, artifact.chatKey, key, spec, wi);
            if (before !== JSON.stringify(entry))
                changed = true;
            existing.delete(key);
            if (Number.isFinite(Number(entry.uid)))
                entryIds.push(Number(entry.uid));
        }
        for (const { uid } of existing.values()) {
            delete data.entries[uid];
            changed = true;
        }
        assertArtifactCommitCurrent(artifact);
        if (changed) {
            await wi.saveWorldInfo(name, data, true);
            const verified = await wi.loadWorldInfo(name);
            verifyManagedSpecs(verified, artifact.chatKey, desired);
            reloadWorldInfoEditor(wi, name);
        }
        else {
            verifyManagedSpecs(data, artifact.chatKey, desired);
            reloadWorldInfoEditor(wi, name);
        }
        assertArtifactCommitCurrent(artifact);
        artifact.lorebookEntryIds = entryIds;
        markStage(artifact, 'sync', 'success');
        chatState.lastLorebookName = name;
        chatState.lastSyncAt = new Date().toISOString();
        chatState.lastSyncStatus = 'success';
        chatState.lastSyncError = undefined;
        await putArtifact(artifact);
        await putChatState(chatState);
    }
    catch (error) {
        if (error instanceof Error && error.name === 'CommitRejectedError')
            throw error;
        const message = toErrorMessage(error);
        markStage(artifact, 'sync', 'failed', message);
        chatState.lastSyncStatus = 'failed';
        chatState.lastSyncError = message;
        await putArtifact(artifact);
        await putChatState(chatState);
        throw error;
    }
}
export async function clearCurrentChatLorebookEntries(chatKey = currentChatKey()) {
    if (currentChatKey() !== chatKey)
        throw new Error('聊天已切换，停止清理旧聊天世界书');
    const name = await resolveBookName(false);
    if (!name)
        return 0;
    const wi = await worldInfoApi();
    const data = await wi.loadWorldInfo(name);
    if (currentChatKey() !== chatKey)
        throw new Error('聊天已切换，停止清理旧聊天世界书');
    if (!data?.entries)
        return 0;
    let removed = 0;
    for (const [uid, entry] of Object.entries(data.entries)) {
        const info = managedInfo(entry);
        if (info?.managed && info.chatKey === chatKey) {
            delete data.entries[uid];
            removed += 1;
        }
    }
    if (removed) {
        if (currentChatKey() !== chatKey)
            throw new Error('聊天已切换，停止清理旧聊天世界书');
        await wi.saveWorldInfo(name, data, true);
        reloadWorldInfoEditor(wi, name);
    }
    return removed;
}
export async function pauseCurrentChatLorebookEntries(chatKey = currentChatKey()) {
    if (currentChatKey() !== chatKey)
        throw new Error('聊天已切换，停止暂停旧聊天世界书');
    const name = await resolveBookName(false);
    if (!name)
        return 0;
    const wi = await worldInfoApi();
    const data = await wi.loadWorldInfo(name);
    if (currentChatKey() !== chatKey)
        throw new Error('聊天已切换，停止暂停旧聊天世界书');
    if (!data?.entries)
        return 0;
    let managed = 0;
    let changed = false;
    for (const entry of Object.values(data.entries)) {
        const info = managedInfo(entry);
        if (info?.managed && info.chatKey === chatKey) {
            managed += 1;
            if (!entry.disable) {
                entry.disable = true;
                changed = true;
            }
        }
    }
    if (changed) {
        if (currentChatKey() !== chatKey)
            throw new Error('聊天已切换，停止暂停旧聊天世界书');
        await wi.saveWorldInfo(name, data, true);
        reloadWorldInfoEditor(wi, name);
    }
    return managed;
}
