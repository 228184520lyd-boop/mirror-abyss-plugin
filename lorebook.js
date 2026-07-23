/**
 * 模块职责：解析当前聊天世界书并差异化发布、暂停或清理镜渊条目。
 * 维护边界：普通同步只按当前 chatKey 的 managedKey / logicalKey 匹配；备注、精确签名
 * 与旧 small/large 键只在玩家主动维护时检查，禁止影响人工条目、其他插件或其他聊天。
 */
import { VERSION } from '../constants.js';
import { assertArtifactCommitCurrent, assertChatCommitCurrent, persistMetadataFor } from '../core/commit-guard.js';
import { currentChatKey, getChatMetadataNamespace, getContext, getSettings } from '../core/context.js';
import { hashText, sanitizeBookName, toErrorMessage } from '../core/utils.js';
import { markStage } from '../domain/artifact.js';
import { getChatState, putArtifact, putChatState } from '../storage/repository.js';
import { TaskBlockedError } from './task-queue.js';
import { buildLorebookDocuments } from '../domain/lorebook-publish.js';
import { resolveHostControl } from '../domain/host-control.js';
import { readHistoryWorkflow } from '../workflow/history-workflow.js';
import { applyLorebookSuppressions, detectPlayerDeletedLorebookEntries, restoreLorebookSuppression, updateLorebookPublicationLedger } from '../domain/publication-control.js';
let worldInfoModulePromise = null;
let worldInfoApiForTests = null;
const lorebookMutationLocks = new Map();
export function resetLorebookRuntime() {
    worldInfoModulePromise = null;
    worldInfoApiForTests = null;
    // 正在执行的物理世界书写入不会因插件重启而瞬间停止。清空锁表会让新实例
    // 与旧保存并发写同一本书；保留 Promise 链，待旧写入真正结束后由 finally 自行释放。
}
/** Node 集成测试使用；生产环境未设置时仍只加载 SillyTavern 的 world-info 模块。 */
export function setLorebookWorldInfoApiForTests(api) {
    worldInfoApiForTests = api;
    worldInfoModulePromise = null;
}
async function worldInfoApi() {
    if (worldInfoApiForTests)
        return worldInfoApiForTests;
    if (!worldInfoModulePromise) {
        const moduleUrl = '/scripts/world-info.js';
        worldInfoModulePromise = import(/* @vite-ignore */ moduleUrl);
    }
    return worldInfoModulePromise;
}
async function withLorebookMutation(name, action) {
    const lockKey = sanitizeBookName(name);
    if (!lockKey)
        return action();
    const previous = lorebookMutationLocks.get(lockKey) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(action);
    lorebookMutationLocks.set(lockKey, current);
    try {
        return await current;
    }
    finally {
        if (lorebookMutationLocks.get(lockKey) === current)
            lorebookMutationLocks.delete(lockKey);
    }
}
/** 多本物理世界书迁移时按规范化书名固定顺序取锁，避免两个聊天反向迁移形成死锁。 */
async function withLorebookMutations(names, action) {
    const ordered = [...new Set(names.map(sanitizeBookName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const acquire = (index) => index >= ordered.length
        ? action()
        : withLorebookMutation(ordered[index], () => acquire(index + 1));
    return acquire(0);
}
function generatedBookName(chatKey = currentChatKey()) {
    const context = getContext();
    const display = sanitizeBookName(context.name2 || context.name1 || 'Chat') || 'Chat';
    return sanitizeBookName(`MA_${display}_${hashText(chatKey).slice(0, 8)}`);
}
function isDedicatedGeneratedBook(name, chatKey) {
    return !sanitizeBookName(getSettings().lorebookName) && name === generatedBookName(chatKey);
}
function resolveTargetBookName(create, chatKey = currentChatKey()) {
    const settings = getSettings();
    const meta = getChatMetadataNamespace();
    const context = getContext();
    let name = sanitizeBookName(settings.lorebookName || meta.lorebookName || context.chatMetadata?.world_info || '');
    if (!name && create && settings.autoCreateLorebook)
        name = generatedBookName(chatKey);
    return name;
}
async function ensureLorebook(name, chatKey, artifact) {
    const assertCurrent = () => {
        if (artifact)
            assertArtifactCommitCurrent(artifact);
        else
            assertChatCommitCurrent(chatKey);
    };
    assertCurrent();
    const wi = await worldInfoApi();
    assertCurrent();
    let data = await wi.loadWorldInfo(name);
    assertCurrent();
    if (!data && typeof wi.createNewWorldInfo === 'function') {
        assertCurrent();
        await wi.createNewWorldInfo(name, { interactive: false });
        assertCurrent();
        data = await wi.loadWorldInfo(name);
        assertCurrent();
    }
    if (!data) {
        data = { entries: {} };
        assertCurrent();
        await wi.saveWorldInfo(name, data, true);
        assertCurrent();
    }
    const context = getContext();
    const meta = getChatMetadataNamespace();
    assertCurrent();
    context.chatMetadata ||= {};
    context.chatMetadata[wi.METADATA_KEY || 'world_info'] = name;
    meta.lorebookName = name;
    await persistMetadataFor(chatKey);
    assertCurrent();
    refreshChatLorebookIndicator(name);
    return wi;
}
/** 只有带当前模块 managed 元数据的条目才属于镜渊管理范围。 */
function managedInfo(entry) {
    return entry?.extensions?.mirrorAbyssV11 ?? null;
}
function removeManagedEntriesForChat(data, chatKey) {
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
    return removed;
}
/**
 * 目标书迁移完成后，只清理旧物理书中明确属于当前 chatKey 的镜渊托管条目。
 * 人工条目、owner 未知条目和其他聊天条目均不进入删除集合。
 */
async function cleanupPreviousLorebook(wi, name, chatKey, artifact) {
    assertArtifactCommitCurrent(artifact);
    const data = await wi.loadWorldInfo(name);
    assertArtifactCommitCurrent(artifact);
    if (!data?.entries)
        return 0;
    let removed = removeManagedEntriesForChat(data, chatKey);
    if (!removed)
        return 0;
    await wi.saveWorldInfo(name, data, true);
    assertArtifactCommitCurrent(artifact);
    // 保存后回读，防止旧缓存把当前聊天条目重新写回旧书。
    const verifiedData = (await wi.loadWorldInfo(name)) || data;
    assertArtifactCommitCurrent(artifact);
    const verifiedRemoved = removeManagedEntriesForChat(verifiedData, chatKey);
    removed += verifiedRemoved;
    if (verifiedRemoved) {
        await wi.saveWorldInfo(name, verifiedData, true);
        assertArtifactCommitCurrent(artifact);
    }
    const rendered = await reloadWorldInfoEditor(wi, name, false);
    assertArtifactCommitCurrent(artifact);
    if (rendered) {
        const postReloadData = (await wi.loadWorldInfo(name)) || verifiedData;
        assertArtifactCommitCurrent(artifact);
        const postReloadRemoved = removeManagedEntriesForChat(postReloadData, chatKey);
        removed += postReloadRemoved;
        if (postReloadRemoved) {
            await wi.saveWorldInfo(name, postReloadData, true);
            assertArtifactCommitCurrent(artifact);
            await reloadWorldInfoEditor(wi, name, true);
            assertArtifactCommitCurrent(artifact);
            const finalData = (await wi.loadWorldInfo(name)) || postReloadData;
            const finalRemoved = removeManagedEntriesForChat(finalData, chatKey);
            removed += finalRemoved;
            if (finalRemoved) {
                await wi.saveWorldInfo(name, finalData, true);
                assertArtifactCommitCurrent(artifact);
                throw new Error('旧世界书清理刷新后持续回写旧缓存，已修正入库但界面未能稳定刷新');
            }
        }
    }
    return removed;
}
function managedContentIdentity(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}
function managedCommentIdentity(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}
/**
 * 世界书条目的逻辑名称。SillyTavern 用 comment 作为条目名称/备注；镜渊生成的同一聊天条目
 * 约定名称唯一。这里只统一 Unicode、分隔符、大小写和空白，不读取正文，避免正文更新后失去身份。
 */
export function mirrorAbyssManagedNameIdentity(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/^\s*\[MA11\]\s*/i, '')
        .replace(/[|｜]+/g, '|')
        .split('|')
        .map((part) => part.replace(/\s+/g, ' ').trim().toLocaleLowerCase())
        .filter(Boolean)
        .join('|');
}
/** 只把带镜渊固定备注前缀的条目视为可识别旧副本，普通人工条目不参与精确清理。 */
export function isMirrorAbyssGeneratedEntry(entry) {
    return /^\[MA11\]\s+MA[｜|]/.test(managedCommentIdentity(entry?.comment));
}
/** 备注与正文共同组成精确签名；仅正文相似不会触发删除。 */
export function mirrorAbyssExactIdentity(comment, content) {
    const normalizedComment = managedCommentIdentity(comment);
    const normalizedContent = managedContentIdentity(content);
    return normalizedComment && normalizedContent ? `${normalizedComment}\n${normalizedContent}` : '';
}
/**
 * 逻辑键是刷新/迁移后的第二身份。优先读托管元数据；旧摘要再从正文事件线恢复，
 * 对象条目最后才从完整备注恢复。不能只凭相似正文推断，否则共享世界书会误接管其他聊天。
 */
function legacyLogicalKey(entry, info) {
    const explicit = String(info?.logicalKey || '').trim();
    if (explicit)
        return explicit;
    const comment = managedCommentIdentity(entry?.comment);
    const content = managedContentIdentity(entry?.content);
    if (/^\[MA11\]\s+MA[｜|]大总结(?:[｜|]|$)/.test(comment)) {
        const eventId = content.match(/\[长期事件线[：:]\s*([^\]\n]+)\]/)?.[1]?.trim();
        return eventId ? `large:event:${eventId}` : 'large:current';
    }
    if (/^\[MA11\]\s+MA[｜|]小总结(?:[｜|]|$)/.test(comment)) {
        const eventId = content.match(/\[事件线[：:]\s*([^\]\n]+)\]/)?.[1]?.trim();
        if (eventId)
            return `small:event:${eventId}`;
    }
    return '';
}
/** 等待 SillyTavern 完成一轮编辑器 DOM 提交；测试环境没有 rAF 时退回计时器。 */
async function waitForWorldInfoEditorPaint() {
    const raf = typeof window?.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : null;
    if (!raf) {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        return;
    }
    await new Promise((resolve) => raf(() => raf(() => resolve())));
}
/**
 * 刷新 SillyTavern 世界书列表和编辑器。
 *
 * saveWorldInfo 会更新 SillyTavern 的世界书缓存，但不会保证当前编辑器 DOM 立即重绘。
 * reloadEditor 只触发异步 change；showWorldEditor 才执行实际列表重建。两者同时调用会形成
 * 两条并发刷新链，后完成的旧 change 渲染可能覆盖新列表。因此：
 * - 目标书正在显示或人工强制刷新时，只走一条可等待的 showWorldEditor 路径；
 * - 后台书未显示时，才使用 reloadEditor 通知选择器。
 */
export async function reloadWorldInfoEditor(wi, name, loadIfNotSelected = false) {
    const context = getContext();
    const contextUpdateList = context.updateWorldInfoList;
    const moduleUpdateList = wi.updateWorldInfoList;
    const updateList = contextUpdateList ?? moduleUpdateList;
    if (typeof updateList === 'function') {
        await Promise.resolve(updateList.call(contextUpdateList ? context : wi));
    }
    const names = typeof context.getWorldInfoNames === 'function'
        ? context.getWorldInfoNames()
        : Array.isArray(wi.world_names)
            ? [...wi.world_names]
            : [];
    // 新建书偶尔会晚一拍进入下拉列表。直接 showWorldEditor 仍可按书名读取缓存。
    const listed = !names.length || names.includes(name);
    const editorSelect = document.querySelector('#world_editor_select');
    const selectedName = editorSelect?.selectedOptions?.[0]?.textContent?.trim() ?? '';
    const shouldRenderTarget = loadIfNotSelected || selectedName === name;
    const contextShow = context.showWorldEditor;
    const moduleShow = wi.showWorldEditor;
    const show = contextShow ?? moduleShow;
    if (shouldRenderTarget && typeof show === 'function') {
        // 只更新选择框值，不触发 change，避免再次排入一条异步旧渲染。
        if (editorSelect && listed && editorSelect.options) {
            const targetOption = Array.from(editorSelect.options).find((option) => option.textContent?.trim() === name);
            if (targetOption)
                editorSelect.value = targetOption.value;
        }
        // showWorldEditor 会从 saveWorldInfo 已更新的缓存重建列表；这里不再并发触发 reloadEditor。
        await Promise.resolve(show.call(contextShow ? context : wi, name));
        await waitForWorldInfoEditorPaint();
        return true;
    }
    const contextReload = context.reloadWorldInfoEditor;
    const moduleReload = wi.reloadEditor ?? wi.reloadWorldInfoEditor;
    const reload = contextReload ?? moduleReload;
    if (typeof reload === 'function' && listed) {
        await Promise.resolve(reload.call(contextReload ? context : wi, name, loadIfNotSelected));
        await waitForWorldInfoEditorPaint();
    }
    return false;
}
/** 聊天世界书关联写入后立即刷新按钮状态，不再等待下一次 CHAT_CHANGED。 */
function refreshChatLorebookIndicator(name) {
    if (typeof document?.querySelectorAll !== 'function')
        return;
    const linked = Boolean(name);
    document.querySelectorAll('.chat_lorebook_button').forEach((button) => {
        button.classList.toggle('world_set', linked);
    });
}
function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function triggerKeys(spec) {
    const trigger = spec.trigger ?? { any: spec.keywords ?? [], all: [], exclude: [] };
    const any = Array.isArray(trigger.any) ? trigger.any.filter(Boolean) : [];
    const all = Array.isArray(trigger.all) ? trigger.all.filter(Boolean) : [];
    const exclude = Array.isArray(trigger.exclude) ? trigger.exclude.filter(Boolean) : [];
    if (!all.length && !exclude.length)
        return any;
    const anyLookahead = any.length ? `(?=[\\s\\S]*(?:${any.map(escapeRegex).join('|')}))` : '';
    const allLookaheads = all.map((item) => `(?=[\\s\\S]*${escapeRegex(item)})`).join('');
    const excludeLookahead = exclude.length ? `(?![\\s\\S]*(?:${exclude.map(escapeRegex).join('|')}))` : '';
    return [`/${excludeLookahead}${allLookaheads}${anyLookahead}[\\s\\S]*/i`];
}
function applyEntry(entry, chatKey, key, spec, wi) {
    entry.comment = spec.comment;
    entry.content = spec.content;
    const disabled = spec.disabled === true;
    entry.constant = !disabled && spec.constant === true;
    entry.vectorized = !disabled && spec.vectorized === true;
    entry.key = !disabled && !entry.constant && (spec.keywords?.length || spec.trigger?.any?.length) ? triggerKeys(spec) : [];
    entry.keysecondary = [];
    entry.selective = false;
    entry.disable = disabled;
    entry.addMemo = true;
    entry.position = wi.world_info_position?.after ?? 1;
    // order 仅用于世界书编辑器显示顺序，不参与镜渊的记忆取舍。
    entry.order = spec.order;
    entry.preventRecursion = !spec.allowRecursion;
    entry.excludeRecursion = !spec.allowRecursion;
    entry.delayUntilRecursion = 0;
    entry.extensions ||= {};
    entry.extensions.mirrorAbyssV11 = {
        managed: true,
        chatKey,
        key,
        logicalKey: spec.logicalKey || key,
        kind: spec.kind,
        version: VERSION,
        recallMode: spec.recallMode,
        trigger: spec.trigger,
        vector: spec.vector,
        factIds: spec.factIds,
        eventIds: spec.eventIds,
        disabled,
        allowRecursion: spec.allowRecursion !== false,
    };
}
function summaryEventKey(item) {
    return String(item?.eventId || item?.id || '').trim();
}
async function desiredSpecs(artifact, committedState) {
    const settings = getSettings();
    const control = resolveHostControl(settings);
    const state = committedState ?? await getChatState(artifact.chatKey);
    const documents = buildLorebookDocuments(artifact.snapshot, state.smallSummaries, state.largeSummaries, {
        layout: settings.lorebookLayout,
        vectorize: control.vector && settings.vectorizeRows,
        recursion: control.recursion,
        latestContinuityConstant: settings.latestContinuityConstant,
        registry: settings.tableRegistry,
        internalFacts: state.internalFacts,
        similarityThreshold: settings.lorebookRecall.similarityThreshold,
        maxVectorResults: settings.lorebookRecall.maxVectorResults,
        totalCapacity: settings.lorebookRecall.totalCapacity,
        focusObjectId: state.focusObjectId,
        narrativeContext: state.runtimeV2?.narrativeContext,
        entryLimits: settings.contentLimits.tables,
    });
    const desired = normalizeDesiredLorebookSpecs(new Map(documents.map((document) => [document.key, document])));
    return { desired };
}
async function legacyCleanupScope(artifact) {
    const state = await getChatState(artifact.chatKey);
    const logicalKeys = new Set();
    const legacyKeys = new Set();
    const comments = new Set();
    for (const item of state.smallSummaries) {
        const eventKey = summaryEventKey(item);
        if (eventKey)
            logicalKeys.add(`small:event:${eventKey}`);
        legacyKeys.add(`small:${item.id}`);
        comments.add(managedCommentIdentity(`[MA11] MA｜小总结｜${item.title}`));
    }
    for (const item of state.largeSummaries) {
        const eventKey = summaryEventKey(item);
        if (eventKey)
            logicalKeys.add(`large:event:${eventKey}`);
        logicalKeys.add('large:current');
        legacyKeys.add(`large:${item.id}`);
        comments.add(managedCommentIdentity(`[MA11] MA｜大总结｜${item.title}`));
    }
    return { logicalKeys, legacyKeys, comments };
}
function legacyManagedKey(key) {
    return (key.startsWith('small:') && !key.startsWith('small:event:'))
        || (key.startsWith('large:') && key !== 'large:current' && !key.startsWith('large:event:'));
}
function appendPair(index, key, pair) {
    if (!key)
        return;
    index.set(key, [...(index.get(key) ?? []), pair]);
}
function uniqueSpecStrings(values, limit = 120) {
    return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value])
            .map((value) => String(value ?? '').trim()).filter(Boolean))].slice(0, limit);
}
function recallModePriority(value) {
    return value === 'constant' ? 0 : value === 'trigger' ? 1 : 2;
}
function mergeDesiredLorebookSpec(left, right) {
    const rightIsNewer = String(right?.updatedAt || '') > String(left?.updatedAt || '');
    const primary = rightIsNewer ? right : left;
    const secondary = primary === left ? right : left;
    const mode = recallModePriority(left?.recallMode) <= recallModePriority(right?.recallMode)
        ? left?.recallMode
        : right?.recallMode;
    return {
        ...secondary,
        ...primary,
        // 正文是对象当前完整视图，不能把两份完整条目逐行拼接成重复切面。
        // 事实与事件通过下方 ID 集合合并；正文采用较新的完整视图。
        content: String(primary?.content || secondary?.content || '').trim(),
        recallMode: mode,
        constant: Boolean(left?.constant || right?.constant || mode === 'constant'),
        vectorized: Boolean(left?.vectorized || right?.vectorized || mode === 'hybrid' || mode === 'vector')
            && !(left?.disabled === true && right?.disabled === true),
        keywords: uniqueSpecStrings([left?.keywords, right?.keywords, left?.trigger?.any, right?.trigger?.any], 48),
        disabled: left?.disabled === true && right?.disabled === true,
        trigger: {
            any: uniqueSpecStrings([left?.trigger?.any, right?.trigger?.any], 48),
            all: uniqueSpecStrings([left?.trigger?.all, right?.trigger?.all], 32),
            exclude: uniqueSpecStrings([left?.trigger?.exclude, right?.trigger?.exclude], 32),
        },
        factIds: uniqueSpecStrings([left?.factIds, right?.factIds], 160),
        eventIds: uniqueSpecStrings([left?.eventIds, right?.eventIds], 120),
        updatedAt: String(primary?.updatedAt || secondary?.updatedAt || ''),
    };
}
/**
 * 世界书发布计划的最终唯一闸门。
 *
 * 同一聊天、同一完整条目名称只允许存在一条。不同事实、事件和时间切面全部并入同一条目，
 * 不再保留“同名但证据不足”的分支；该情况属于上游对象唯一性失效，必须在这里收拢。
 */
export function normalizeDesiredLorebookSpecs(desired) {
    const output = new Map([...desired.entries()].map(([key, spec]) => [key, structuredClone(spec)]));
    const groups = new Map();
    for (const [key, spec] of output) {
        const nameIdentity = mirrorAbyssManagedNameIdentity(spec?.comment);
        if (!nameIdentity)
            continue;
        groups.set(nameIdentity, [...(groups.get(nameIdentity) ?? []), { key, spec }]);
    }
    for (const group of groups.values()) {
        if (group.length < 2)
            continue;
        const ordered = [...group].sort((left, right) => {
            const mode = recallModePriority(left.spec?.recallMode) - recallModePriority(right.spec?.recallMode);
            if (mode)
                return mode;
            const time = String(right.spec?.updatedAt || '').localeCompare(String(left.spec?.updatedAt || ''));
            return time || left.key.localeCompare(right.key);
        });
        const survivor = ordered[0];
        let merged = structuredClone(survivor.spec);
        for (const item of ordered.slice(1)) {
            merged = mergeDesiredLorebookSpec(merged, item.spec);
            output.delete(item.key);
        }
        merged.comment = survivor.spec.comment;
        merged.logicalKey = String(survivor.spec.logicalKey || survivor.key);
        output.set(survivor.key, merged);
    }
    return output;
}
/**
 * 普通同步的唯一身份顺序：
 *
 * 1. 当前 chatKey + managedKey；
 * 2. 当前 chatKey + 规范化条目名称；同名多条时确定性保留一个 UID 并删除其余；
 * 3. 当前 chatKey + 两侧唯一 logicalKey；
 * 4. 否则创建。
 *
 * owner 未知与其他 chatKey 条目完全不进入普通同步候选。旧键和歧义 logicalKey 留给
 * 玩家主动维护，避免热路径中的历史猜测和顺序接管。
 */
export function reconcileLorebookEntries(data, desired, chatKey, wi, name, dedicatedBook = false, _cleanup = {}) {
    desired = normalizeDesiredLorebookSpecs(desired);
    data.entries ||= {};
    const pairs = [];
    const currentByKey = new Map();
    const currentByName = new Map();
    const currentByLogical = new Map();
    for (const [uid, entry] of Object.entries(data.entries)) {
        const info = managedInfo(entry);
        const ownedByCurrentChat = Boolean(info?.managed && info.chatKey === chatKey);
        const generated = isMirrorAbyssGeneratedEntry(entry);
        const ownerUnknown = generated && (!info?.managed || !info?.chatKey);
        const currentScope = ownedByCurrentChat || Boolean(dedicatedBook && ownerUnknown);
        if (!currentScope)
            continue;
        const pair = {
            uid,
            entry,
            info,
            key: String(info?.key || ''),
            logicalKey: legacyLogicalKey(entry, info),
            nameIdentity: mirrorAbyssManagedNameIdentity(entry.comment),
            commentIdentity: managedCommentIdentity(entry.comment),
            exactIdentity: mirrorAbyssExactIdentity(entry.comment, entry.content),
            currentScope,
            generated,
        };
        pairs.push(pair);
        appendPair(currentByKey, pair.key, pair);
        appendPair(currentByName, pair.nameIdentity, pair);
        appendPair(currentByLogical, pair.logicalKey, pair);
    }
    let changed = false;
    let created = 0;
    let adoptedLegacy = 0;
    let removed = 0;
    const claimed = new Set();
    const duplicateManaged = new Set();
    const protectedAmbiguous = new Set();
    const entryIds = [];
    const desiredNameCounts = new Map();
    const desiredLogicalCounts = new Map();
    for (const [key, spec] of desired) {
        const nameIdentity = mirrorAbyssManagedNameIdentity(spec.comment);
        if (nameIdentity)
            desiredNameCounts.set(nameIdentity, (desiredNameCounts.get(nameIdentity) ?? 0) + 1);
        const logicalKey = String(spec.logicalKey || key);
        desiredLogicalCounts.set(logicalKey, (desiredLogicalCounts.get(logicalKey) ?? 0) + 1);
    }
    const stablePairOrder = (left, right) => {
        const leftNumber = Number(left.uid);
        const rightNumber = Number(right.uid);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
            return leftNumber - rightNumber;
        }
        return left.uid.localeCompare(right.uid);
    };
    const desiredItems = [...desired.entries()].map(([key, spec]) => ({
        key,
        spec,
        logicalKey: String(spec.logicalKey || key),
        nameIdentity: mirrorAbyssManagedNameIdentity(spec.comment),
        commentIdentity: managedCommentIdentity(spec.comment),
        exactIdentity: mirrorAbyssExactIdentity(spec.comment, spec.content),
        pair: undefined,
    }));
    // 第一遍先预留所有 managedKey 命中，避免 desired Map 顺序让 logicalKey 抢走稳定 UID。
    for (const item of desiredItems) {
        const keyCandidates = (currentByKey.get(item.key) ?? [])
            .filter((pair) => !claimed.has(pair.uid))
            .sort(stablePairOrder);
        item.pair = keyCandidates[0];
        if (item.pair)
            claimed.add(item.pair.uid);
        if (item.pair && keyCandidates.length > 1) {
            for (const duplicate of keyCandidates.slice(1))
                duplicateManaged.add(duplicate.uid);
        }
    }
    // 第二遍按当前聊天中的唯一条目名称锁定 UID。同名多条属于重复发布：优先保留 managedKey
    // 已命中的 UID；否则保留最小 UID，并删除其余当前聊天托管副本。desired 已在入口强制归并为唯一名称。
    for (const item of desiredItems) {
        if (!item.nameIdentity || desiredNameCounts.get(item.nameIdentity) !== 1)
            continue;
        const nameCandidates = (currentByName.get(item.nameIdentity) ?? [])
            .filter((candidate) => !duplicateManaged.has(candidate.uid))
            .sort(stablePairOrder);
        if (item.pair) {
            for (const candidate of nameCandidates) {
                if (candidate.uid !== item.pair.uid && !claimed.has(candidate.uid))
                    duplicateManaged.add(candidate.uid);
            }
            continue;
        }
        const available = nameCandidates.filter((candidate) => !claimed.has(candidate.uid));
        if (!available.length)
            continue;
        item.pair = available[0];
        claimed.add(item.pair.uid);
        for (const duplicate of available.slice(1))
            duplicateManaged.add(duplicate.uid);
    }
    // 第三遍只允许新旧两侧均唯一、且未被 managedKey/名称预留的 logicalKey 接管。
    for (const item of desiredItems) {
        if (item.pair)
            continue;
        const logicalCandidates = (currentByLogical.get(item.logicalKey) ?? [])
            .filter((candidate) => !claimed.has(candidate.uid) && !duplicateManaged.has(candidate.uid));
        const logicalUniqueOnBothSides = logicalCandidates.length === 1
            && desiredLogicalCounts.get(item.logicalKey) === 1;
        if (logicalUniqueOnBothSides) {
            item.pair = logicalCandidates[0];
            claimed.add(item.pair.uid);
        }
        else if (logicalCandidates.length) {
            for (const candidate of logicalCandidates)
                protectedAmbiguous.add(candidate.uid);
        }
    }
    for (const item of desiredItems) {
        let pair = item.pair;
        const adoptedExistingLegacy = Boolean(pair && (!pair.info?.managed || !pair.info?.chatKey));
        let entry = pair?.entry;
        if (!entry) {
            entry = wi.createWorldInfoEntry(name, data);
            if (!entry)
                throw new Error(`世界书条目创建失败：${item.key}`);
            const createdUid = String(entry.uid ?? Object.entries(data.entries).find(([, value]) => value === entry)?.[0] ?? '');
            if (!createdUid)
                throw new Error(`世界书条目缺少UID：${item.key}`);
            pair = {
                uid: createdUid,
                entry,
                info: null,
                key: item.key,
                logicalKey: item.logicalKey,
                nameIdentity: item.nameIdentity,
                commentIdentity: item.commentIdentity,
                exactIdentity: item.exactIdentity,
                currentScope: true,
                generated: true,
            };
            created += 1;
            changed = true;
        }
        claimed.add(pair.uid);
        if (adoptedExistingLegacy)
            adoptedLegacy += 1;
        const before = JSON.stringify(entry);
        applyEntry(entry, chatKey, item.key, item.spec, wi);
        if (before !== JSON.stringify(entry))
            changed = true;
        if (Number.isFinite(Number(entry.uid)))
            entryIds.push(Number(entry.uid));
    }
    for (const pair of pairs) {
        if (claimed.has(pair.uid))
            continue;
        if (duplicateManaged.has(pair.uid)) {
            delete data.entries[pair.uid];
            removed += 1;
            changed = true;
            continue;
        }
        if (protectedAmbiguous.has(pair.uid))
            continue;
        if (legacyManagedKey(pair.key))
            continue;
        if (!pair.currentScope)
            continue;
        delete data.entries[pair.uid];
        removed += 1;
        changed = true;
    }
    return { changed, entryIds, created, adoptedLegacy, removed };
}
/**
 * 玩家主动维护使用的历史归并器。它保留备注、精确签名和旧键考古，但共享书里 owner
 * 未知的条目只统计、不接管、不删除；明确属于其他 chatKey 的条目始终不可写。
 */
export function reconcileLorebookMaintenanceEntries(data, desired, chatKey, wi, name, dedicatedBook = false, cleanup = {}) {
    desired = normalizeDesiredLorebookSpecs(desired);
    data.entries ||= {};
    const pairs = [];
    const currentByKey = new Map();
    const currentByName = new Map();
    const currentByLogical = new Map();
    const currentByComment = new Map();
    const currentByExact = new Map();
    const adoptableByName = new Map();
    const adoptableByLogical = new Map();
    const adoptableByComment = new Map();
    const adoptableByExact = new Map();
    for (const [uid, entry] of Object.entries(data.entries)) {
        const info = managedInfo(entry);
        const currentScope = Boolean(info?.managed && info.chatKey === chatKey);
        const generated = isMirrorAbyssGeneratedEntry(entry);
        const ownerUnknown = generated && (!info?.managed || !info?.chatKey);
        if (!currentScope && !(dedicatedBook && ownerUnknown))
            continue;
        const pair = {
            uid,
            entry,
            info,
            key: String(info?.key || ''),
            logicalKey: legacyLogicalKey(entry, info),
            nameIdentity: mirrorAbyssManagedNameIdentity(entry.comment),
            commentIdentity: managedCommentIdentity(entry.comment),
            exactIdentity: mirrorAbyssExactIdentity(entry.comment, entry.content),
            currentScope,
            generated,
        };
        pairs.push(pair);
        if (currentScope) {
            appendPair(currentByKey, pair.key, pair);
            appendPair(currentByName, pair.nameIdentity, pair);
            appendPair(currentByLogical, pair.logicalKey, pair);
            appendPair(currentByComment, pair.commentIdentity, pair);
            appendPair(currentByExact, pair.exactIdentity, pair);
        }
        if (dedicatedBook && ownerUnknown) {
            appendPair(adoptableByName, pair.nameIdentity, pair);
            appendPair(adoptableByLogical, pair.logicalKey, pair);
            appendPair(adoptableByComment, pair.commentIdentity, pair);
            appendPair(adoptableByExact, pair.exactIdentity, pair);
        }
    }
    let changed = false;
    let created = 0;
    let adoptedLegacy = 0;
    let removed = 0;
    const claimed = new Set();
    const duplicateManaged = new Set();
    const entryIds = [];
    const stablePairOrder = (left, right) => {
        const leftNumber = Number(left.uid);
        const rightNumber = Number(right.uid);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
            return leftNumber - rightNumber;
        }
        return left.uid.localeCompare(right.uid);
    };
    const takeUnique = (items) => {
        const available = (items ?? []).filter((pair) => !claimed.has(pair.uid));
        return available.length === 1 ? available[0] : undefined;
    };
    const desiredNameCounts = new Map();
    for (const [key, spec] of desired) {
        const nameIdentity = mirrorAbyssManagedNameIdentity(spec.comment);
        if (nameIdentity)
            desiredNameCounts.set(nameIdentity, (desiredNameCounts.get(nameIdentity) ?? 0) + 1);
    }
    for (const [key, spec] of desired) {
        const logicalKey = String(spec.logicalKey || key);
        const nameIdentity = mirrorAbyssManagedNameIdentity(spec.comment);
        const commentIdentity = managedCommentIdentity(spec.comment);
        const exactIdentity = mirrorAbyssExactIdentity(spec.comment, spec.content);
        const keyCandidates = (currentByKey.get(key) ?? [])
            .filter((candidate) => !claimed.has(candidate.uid))
            .sort(stablePairOrder);
        let pair = keyCandidates[0];
        if (pair) {
            for (const duplicate of keyCandidates.slice(1))
                duplicateManaged.add(duplicate.uid);
        }
        if (nameIdentity && desiredNameCounts.get(nameIdentity) === 1) {
            const nameCandidates = (currentByName.get(nameIdentity) ?? [])
                .filter((candidate) => !claimed.has(candidate.uid) && !duplicateManaged.has(candidate.uid))
                .sort(stablePairOrder);
            if (!pair && nameCandidates.length)
                pair = nameCandidates[0];
            if (pair) {
                for (const duplicate of nameCandidates) {
                    if (duplicate.uid !== pair.uid)
                        duplicateManaged.add(duplicate.uid);
                }
            }
        }
        pair ??= takeUnique(currentByLogical.get(logicalKey))
            ?? takeUnique(currentByComment.get(commentIdentity))
            ?? takeUnique(currentByExact.get(exactIdentity));
        if (!pair && dedicatedBook) {
            pair = (nameIdentity && desiredNameCounts.get(nameIdentity) === 1
                ? takeUnique(adoptableByName.get(nameIdentity))
                : undefined)
                ?? takeUnique(adoptableByLogical.get(logicalKey))
                ?? takeUnique(adoptableByComment.get(commentIdentity))
                ?? takeUnique(adoptableByExact.get(exactIdentity));
            if (pair)
                adoptedLegacy += 1;
        }
        let entry = pair?.entry;
        if (!entry) {
            entry = wi.createWorldInfoEntry(name, data);
            if (!entry)
                throw new Error(`世界书条目创建失败：${key}`);
            const createdUid = String(entry.uid ?? Object.entries(data.entries).find(([, value]) => value === entry)?.[0] ?? '');
            if (!createdUid)
                throw new Error(`世界书条目缺少UID：${key}`);
            pair = {
                uid: createdUid,
                entry,
                info: null,
                key,
                logicalKey,
                nameIdentity,
                commentIdentity,
                exactIdentity,
                currentScope: true,
                generated: true,
            };
            created += 1;
            changed = true;
        }
        claimed.add(pair.uid);
        const before = JSON.stringify(entry);
        applyEntry(entry, chatKey, key, spec, wi);
        if (before !== JSON.stringify(entry))
            changed = true;
        if (Number.isFinite(Number(entry.uid)))
            entryIds.push(Number(entry.uid));
    }
    for (const pair of pairs) {
        if (claimed.has(pair.uid))
            continue;
        if (duplicateManaged.has(pair.uid) && pair.currentScope) {
            delete data.entries[pair.uid];
            removed += 1;
            changed = true;
            continue;
        }
        const ownerUnknown = pair.generated && (!pair.info?.managed || !pair.info?.chatKey);
        const oldKeyInScope = pair.currentScope && (legacyManagedKey(pair.key)
            || Boolean(pair.key && cleanup.legacyKeys?.has(pair.key))
            || Boolean(pair.logicalKey && cleanup.logicalKeys?.has(pair.logicalKey))
            || Boolean(pair.commentIdentity && cleanup.comments?.has(pair.commentIdentity)));
        if (!oldKeyInScope && !(dedicatedBook && ownerUnknown))
            continue;
        delete data.entries[pair.uid];
        removed += 1;
        changed = true;
    }
    return { changed, entryIds, created, adoptedLegacy, removed };
}
async function refreshTargetLorebookAndConfirm(wi, name, desired, artifact, dedicatedBook, force, entryIds) {
    const renderedTarget = await reloadWorldInfoEditor(wi, name, force);
    assertArtifactCommitCurrent(artifact);
    if (!renderedTarget)
        return entryIds;
    // showWorldEditor 可能把打开前的旧缓存延迟写回。重绘后必须重新加载并按当前 desired 对账。
    const postReloadData = (await wi.loadWorldInfo(name)) || { entries: {} };
    postReloadData.entries ||= {};
    const postReloadVerification = reconcileLorebookEntries(postReloadData, desired, artifact.chatKey, wi, name, dedicatedBook);
    entryIds = postReloadVerification.entryIds;
    if (!postReloadVerification.changed)
        return entryIds;
    assertArtifactCommitCurrent(artifact);
    await wi.saveWorldInfo(name, postReloadData, true);
    assertArtifactCommitCurrent(artifact);
    // 修正保存后再次重绘，确保当前编辑器看到的是最终入库版本，而不是刚被修掉的旧缓存。
    await reloadWorldInfoEditor(wi, name, true);
    assertArtifactCommitCurrent(artifact);
    const finalData = (await wi.loadWorldInfo(name)) || postReloadData;
    finalData.entries ||= {};
    const finalVerification = reconcileLorebookEntries(finalData, desired, artifact.chatKey, wi, name, dedicatedBook);
    entryIds = finalVerification.entryIds;
    if (finalVerification.changed) {
        await wi.saveWorldInfo(name, finalData, true);
        assertArtifactCommitCurrent(artifact);
        throw new Error('世界书编辑器刷新后持续回写旧缓存，已修正入库但界面未能稳定刷新');
    }
    return entryIds;
}
/**
 * 基于最新成功状态及总结执行差异同步；写入前后持续校验 artifact 是否仍然有效。
 */
async function syncLorebookOnce(artifact, name, force = false, options = {}) {
    assertArtifactCommitCurrent(artifact);
    if (!artifact.snapshot || artifact.stages.state.status !== 'success') {
        throw new Error('没有成功状态表，停止世界书同步');
    }
    const settings = getSettings();
    const retryingFailedSync = artifact.stages.sync.status === 'failed';
    if (!resolveHostControl(settings).lorebook && !force) {
        markStage(artifact, 'sync', 'skipped');
        await putArtifact(artifact);
        return;
    }
    markStage(artifact, 'sync', 'running');
    await putArtifact(artifact);
    const chatState = await getChatState(artifact.chatKey);
    const historyWorkflow = readHistoryWorkflow(chatState);
    if (historyWorkflow.blocked) {
        const recoveryAuthorized = Boolean(options.allowHistoryRecovery
            && historyWorkflow.phase === 'publishing-lorebook'
            && chatState.latestSnapshotMessageKey === artifact.messageKey);
        if (!recoveryAuthorized) {
            const blockedReason = historyWorkflow.startIndex === undefined
                ? '历史删除位置未知，请先选择重算起点'
                : `第 ${historyWorkflow.startIndex + 1} 条消息之后的数据需要重算`;
            markStage(artifact, 'sync', 'blocked', blockedReason);
            await putArtifact(artifact);
            throw new TaskBlockedError(blockedReason);
        }
    }
    try {
        const wi = await ensureLorebook(name, artifact.chatKey, artifact);
        if (!name)
            throw new Error('没有可用的聊天世界书');
        const data = (await wi.loadWorldInfo(name)) || { entries: {} };
        data.entries ||= {};
        const plan = await desiredSpecs(artifact, chatState);
        const detectedDeletions = detectPlayerDeletedLorebookEntries(chatState, data, plan.desired, artifact.chatKey, name);
        if (detectedDeletions.length) {
            // 玩家删除属于持久化发布否决，必须在任何可能失败的后续写入前先保存墓碑。
            await putChatState(chatState);
            assertArtifactCommitCurrent(artifact);
        }
        const desired = applyLorebookSuppressions(plan.desired, chatState);
        const dedicatedBook = isDedicatedGeneratedBook(name, artifact.chatKey);
        const reconciliation = reconcileLorebookEntries(data, desired, artifact.chatKey, wi, name, dedicatedBook);
        const changed = reconciliation.changed;
        let entryIds = reconciliation.entryIds;
        assertArtifactCommitCurrent(artifact);
        if (changed) {
            await wi.saveWorldInfo(name, data, true);
            assertArtifactCommitCurrent(artifact);
            // 只有实际保存后做一次回读确认，清除保存路径回流的同 managedKey 副本。
            const verifiedData = (await wi.loadWorldInfo(name)) || data;
            const verification = reconcileLorebookEntries(verifiedData, desired, artifact.chatKey, wi, name, dedicatedBook);
            entryIds = verification.entryIds;
            if (verification.changed) {
                assertArtifactCommitCurrent(artifact);
                await wi.saveWorldInfo(name, verifiedData, true);
                assertArtifactCommitCurrent(artifact);
            }
        }
        // 普通同步只在数据变化后刷新；强制同步或上一轮刷新失败的重试即使无变化也必须重绘。
        if (changed || force || retryingFailedSync || chatState.lastSyncStatus === 'failed') {
            entryIds = await refreshTargetLorebookAndConfirm(wi, name, desired, artifact, dedicatedBook, force, entryIds);
        }
        const previousLorebookName = sanitizeBookName(chatState.lastLorebookName || '');
        if (previousLorebookName && previousLorebookName !== name) {
            // 新目标书已经成功入库后再清旧书，避免目标发布失败时先丢失原有长期记忆。
            await cleanupPreviousLorebook(wi, previousLorebookName, artifact.chatKey, artifact);
        }
        assertArtifactCommitCurrent(artifact);
        const finalPublicationData = (await wi.loadWorldInfo(name)) || data;
        assertArtifactCommitCurrent(artifact);
        updateLorebookPublicationLedger(chatState, finalPublicationData, artifact.chatKey, name);
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
        if (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name)) {
            markStage(artifact, 'sync', 'cancelled', toErrorMessage(error));
            await putArtifact(artifact);
            throw error;
        }
        const message = toErrorMessage(error);
        markStage(artifact, 'sync', 'failed', message);
        chatState.lastSyncStatus = 'failed';
        chatState.lastSyncError = message;
        await putArtifact(artifact);
        await putChatState(chatState);
        throw error;
    }
}
/** 所有世界书写操作按最终物理书名串行；chatKey 只定义条目归属，不作为物理锁。 */
export async function syncLorebook(artifact, force = false, options = {}) {
    assertArtifactCommitCurrent(artifact);
    const settings = getSettings();
    const name = resolveTargetBookName(true, artifact.chatKey);
    if (!resolveHostControl(settings).lorebook && !force) {
        await syncLorebookOnce(artifact, name, force, options);
        return;
    }
    if (!name)
        throw new Error('没有可用的聊天世界书');
    const persisted = await getChatState(artifact.chatKey);
    const previousLorebookName = sanitizeBookName(persisted.lastLorebookName || '');
    await withLorebookMutations([name, previousLorebookName], async () => {
        assertArtifactCommitCurrent(artifact);
        await syncLorebookOnce(artifact, name, force, options);
    });
}
function maintenancePreviewFromData(data, name, chatKey, dedicatedBook) {
    let currentManaged = 0;
    let protectedUnknown = 0;
    let protectedForeign = 0;
    const candidateUids = new Set();
    const removableUids = new Set();
    const currentByName = new Map();
    for (const [uid, entry] of Object.entries(data?.entries ?? {})) {
        const info = managedInfo(entry);
        const generated = isMirrorAbyssGeneratedEntry(entry);
        if (info?.managed && info.chatKey === chatKey) {
            currentManaged += 1;
            const nameIdentity = mirrorAbyssManagedNameIdentity(entry.comment);
            if (nameIdentity)
                currentByName.set(nameIdentity, [...(currentByName.get(nameIdentity) ?? []), uid]);
            const key = String(info.key || '');
            if (!key || legacyManagedKey(key)) {
                candidateUids.add(uid);
                removableUids.add(uid);
            }
            continue;
        }
        if (info?.managed && info.chatKey && info.chatKey !== chatKey) {
            protectedForeign += 1;
            continue;
        }
        if (generated && (!info?.managed || !info?.chatKey)) {
            candidateUids.add(uid);
            if (dedicatedBook)
                removableUids.add(uid);
            else
                protectedUnknown += 1;
        }
    }
    for (const uids of currentByName.values()) {
        if (uids.length < 2)
            continue;
        // 预览只需要准确报告重复数量；实际执行会优先保留当前 managedKey 命中的 UID。
        for (const uid of uids.slice(1)) {
            candidateUids.add(uid);
            removableUids.add(uid);
        }
    }
    return {
        applied: false,
        name,
        dedicatedBook,
        currentManaged,
        legacyCandidates: candidateUids.size,
        removable: removableUids.size,
        protectedUnknown,
        protectedForeign,
        removed: 0,
    };
}
/**
 * 玩家维护的只读预览。不创建世界书、不保存、不写聊天 metadata。
 */
export async function previewLorebookMaintenance(artifact) {
    assertArtifactCommitCurrent(artifact);
    const name = resolveTargetBookName(false, artifact.chatKey);
    if (!name)
        return maintenancePreviewFromData(null, '', artifact.chatKey, false);
    return withLorebookMutation(name, async () => {
        assertArtifactCommitCurrent(artifact);
        const wi = await worldInfoApi();
        assertArtifactCommitCurrent(artifact);
        const data = await wi.loadWorldInfo(name);
        assertArtifactCommitCurrent(artifact);
        return maintenancePreviewFromData(data, name, artifact.chatKey, isDedicatedGeneratedBook(name, artifact.chatKey));
    });
}
/**
 * 玩家确认后的维护执行。共享书 owner 未知条目不会进入写集合；执行时重新加载和规划，
 * 不信任预览阶段的 UID。调用者随后仍应执行一次普通 sync 来提交同步状态。
 */
export async function applyLorebookMaintenance(artifact) {
    assertArtifactCommitCurrent(artifact);
    if (!artifact.snapshot || artifact.stages.state.status !== 'success') {
        throw new Error('没有成功状态表，停止世界书维护');
    }
    const name = resolveTargetBookName(true, artifact.chatKey);
    if (!name)
        throw new Error('没有可用的聊天世界书');
    return withLorebookMutation(name, async () => {
        assertArtifactCommitCurrent(artifact);
        const wi = await ensureLorebook(name, artifact.chatKey, artifact);
        assertArtifactCommitCurrent(artifact);
        const data = (await wi.loadWorldInfo(name)) || { entries: {} };
        assertArtifactCommitCurrent(artifact);
        data.entries ||= {};
        const dedicatedBook = isDedicatedGeneratedBook(name, artifact.chatKey);
        const preview = maintenancePreviewFromData(data, name, artifact.chatKey, dedicatedBook);
        const state = await getChatState(artifact.chatKey);
        const plan = await desiredSpecs(artifact, state);
        const detectedDeletions = detectPlayerDeletedLorebookEntries(state, data, plan.desired, artifact.chatKey, name);
        if (detectedDeletions.length) {
            await putChatState(state);
            assertArtifactCommitCurrent(artifact);
        }
        const desired = applyLorebookSuppressions(plan.desired, state);
        const cleanup = await legacyCleanupScope(artifact);
        assertArtifactCommitCurrent(artifact);
        const first = reconcileLorebookMaintenanceEntries(data, desired, artifact.chatKey, wi, name, dedicatedBook, cleanup);
        let removed = first.removed;
        if (first.changed) {
            assertArtifactCommitCurrent(artifact);
            await wi.saveWorldInfo(name, data, true);
            assertArtifactCommitCurrent(artifact);
            const verifiedData = (await wi.loadWorldInfo(name)) || data;
            assertArtifactCommitCurrent(artifact);
            const verification = reconcileLorebookMaintenanceEntries(verifiedData, desired, artifact.chatKey, wi, name, dedicatedBook, cleanup);
            removed += verification.removed;
            if (verification.changed) {
                await wi.saveWorldInfo(name, verifiedData, true);
                assertArtifactCommitCurrent(artifact);
            }
            const renderedTarget = await reloadWorldInfoEditor(wi, name, true);
            assertArtifactCommitCurrent(artifact);
            if (renderedTarget) {
                const postReloadData = (await wi.loadWorldInfo(name)) || verifiedData;
                assertArtifactCommitCurrent(artifact);
                const postReloadVerification = reconcileLorebookMaintenanceEntries(postReloadData, desired, artifact.chatKey, wi, name, dedicatedBook, cleanup);
                removed += postReloadVerification.removed;
                if (postReloadVerification.changed) {
                    await wi.saveWorldInfo(name, postReloadData, true);
                    assertArtifactCommitCurrent(artifact);
                    await reloadWorldInfoEditor(wi, name, true);
                    assertArtifactCommitCurrent(artifact);
                    const finalData = (await wi.loadWorldInfo(name)) || postReloadData;
                    assertArtifactCommitCurrent(artifact);
                    const finalVerification = reconcileLorebookMaintenanceEntries(finalData, desired, artifact.chatKey, wi, name, dedicatedBook, cleanup);
                    removed += finalVerification.removed;
                    if (finalVerification.changed) {
                        await wi.saveWorldInfo(name, finalData, true);
                        assertArtifactCommitCurrent(artifact);
                        throw new Error('世界书维护刷新后持续回写旧缓存，已修正入库但界面未能稳定刷新');
                    }
                }
            }
        }
        return { ...preview, applied: true, removed };
    });
}
export async function restoreSuppressedLorebookEntry(artifact, key) {
    assertArtifactCommitCurrent(artifact);
    const state = await getChatState(artifact.chatKey);
    if (!restoreLorebookSuppression(state, key))
        return false;
    await putChatState(state);
    assertArtifactCommitCurrent(artifact);
    await syncLorebook(artifact, true);
    return true;
}

async function knownLorebookNamesForChat(chatKey) {
    const state = await getChatState(chatKey);
    return [...new Set([
            sanitizeBookName(state.lastLorebookName || ''),
            resolveTargetBookName(false, chatKey),
        ].filter(Boolean))];
}
async function clearManagedEntriesInBook(wi, name, chatKey) {
    const assertCurrent = () => assertChatCommitCurrent(chatKey, '聊天已切换，停止清理旧聊天世界书');
    assertCurrent();
    const data = await wi.loadWorldInfo(name);
    assertCurrent();
    if (!data?.entries)
        return 0;
    const removed = removeManagedEntriesForChat(data, chatKey);
    if (!removed)
        return 0;
    await wi.saveWorldInfo(name, data, true);
    assertCurrent();
    const verifiedData = (await wi.loadWorldInfo(name)) || data;
    assertCurrent();
    const verifiedRemoved = removeManagedEntriesForChat(verifiedData, chatKey);
    if (verifiedRemoved) {
        await wi.saveWorldInfo(name, verifiedData, true);
        assertCurrent();
    }
    const rendered = await reloadWorldInfoEditor(wi, name);
    assertCurrent();
    if (rendered) {
        const postReloadData = (await wi.loadWorldInfo(name)) || verifiedData;
        assertCurrent();
        const postReloadRemoved = removeManagedEntriesForChat(postReloadData, chatKey);
        if (postReloadRemoved) {
            await wi.saveWorldInfo(name, postReloadData, true);
            assertCurrent();
            await reloadWorldInfoEditor(wi, name, true);
            assertCurrent();
            const finalData = (await wi.loadWorldInfo(name)) || postReloadData;
            const finalRemoved = removeManagedEntriesForChat(finalData, chatKey);
            if (finalRemoved) {
                await wi.saveWorldInfo(name, finalData, true);
                assertCurrent();
                throw new Error('世界书清理刷新后持续回写旧缓存，已修正入库但界面未能稳定刷新');
            }
        }
    }
    return removed;
}
function pauseManagedEntries(data, chatKey) {
    let managed = 0;
    let changed = false;
    for (const entry of Object.values(data?.entries ?? {})) {
        const info = managedInfo(entry);
        if (info?.managed && info.chatKey === chatKey) {
            managed += 1;
            if (!entry.disable) {
                entry.disable = true;
                changed = true;
            }
        }
    }
    return { managed, changed };
}
async function pauseManagedEntriesInBook(wi, name, chatKey) {
    const assertCurrent = () => assertChatCommitCurrent(chatKey, '聊天已切换，停止暂停旧聊天世界书');
    assertCurrent();
    const data = await wi.loadWorldInfo(name);
    assertCurrent();
    if (!data?.entries)
        return 0;
    const first = pauseManagedEntries(data, chatKey);
    if (!first.changed)
        return first.managed;
    await wi.saveWorldInfo(name, data, true);
    assertCurrent();
    const verifiedData = (await wi.loadWorldInfo(name)) || data;
    const verification = pauseManagedEntries(verifiedData, chatKey);
    if (verification.changed) {
        await wi.saveWorldInfo(name, verifiedData, true);
        assertCurrent();
    }
    const rendered = await reloadWorldInfoEditor(wi, name);
    assertCurrent();
    if (rendered) {
        const postReloadData = (await wi.loadWorldInfo(name)) || verifiedData;
        const postReloadVerification = pauseManagedEntries(postReloadData, chatKey);
        if (postReloadVerification.changed) {
            await wi.saveWorldInfo(name, postReloadData, true);
            assertCurrent();
            await reloadWorldInfoEditor(wi, name, true);
            assertCurrent();
            const finalData = (await wi.loadWorldInfo(name)) || postReloadData;
            const finalVerification = pauseManagedEntries(finalData, chatKey);
            if (finalVerification.changed) {
                await wi.saveWorldInfo(name, finalData, true);
                assertCurrent();
                throw new Error('世界书暂停刷新后持续回写旧缓存，已修正入库但界面未能稳定刷新');
            }
        }
    }
    return first.managed;
}
export async function clearCurrentChatLorebookEntries(chatKey = currentChatKey()) {
    assertChatCommitCurrent(chatKey, '聊天已切换，停止清理旧聊天世界书');
    const names = await knownLorebookNamesForChat(chatKey);
    if (!names.length)
        return 0;
    return withLorebookMutations(names, async () => {
        const wi = await worldInfoApi();
        let removed = 0;
        for (const name of names)
            removed += await clearManagedEntriesInBook(wi, name, chatKey);
        return removed;
    });
}
export async function pauseCurrentChatLorebookEntries(chatKey = currentChatKey()) {
    assertChatCommitCurrent(chatKey, '聊天已切换，停止暂停旧聊天世界书');
    const names = await knownLorebookNamesForChat(chatKey);
    if (!names.length)
        return 0;
    return withLorebookMutations(names, async () => {
        const wi = await worldInfoApi();
        let managed = 0;
        for (const name of names)
            managed += await pauseManagedEntriesInBook(wi, name, chatKey);
        return managed;
    });
}
//# sourceMappingURL=lorebook.js.map