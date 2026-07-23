/**
 * 模块职责：定义消息 artifact 与聊天级 ChatState 的存储边界，并迁移 rc.19 事实/总结数据。
 * 维护边界：消息结果附着 message.extra；内部事实与消费标记写入当前 chatMetadata，并在保存前后校验 chatKey。
 */
import { MODULE_NAME } from '../constants.js';
import { currentChatKey, currentChatLocator, getChat, getChatMetadataNamespace, getSettings } from '../core/context.js';
import { assertChatCommitCurrent, CommitRejectedError, persistChatFor, persistMetadataFor } from '../core/commit-guard.js';
import { nowIso } from '../core/utils.js';
import { mergeInternalFacts, migrateLegacyConsumption, normalizeInternalFacts } from '../domain/internal-facts.js';
import { canonicalObjectTitle } from '../domain/object-identity.js';
import { enforceObjectViewAllocation, enforceCurrentSpacetimeSingleton, mergePersistedCharacterDuplicates, normalizeSnapshot, preserveStableObjectIds, rewriteObjectReferences, } from '../domain/snapshot.js';
import { garbageCollectLegacyEntryTombstones, normalizeEntryLifecycleValue } from '../domain/entry-lifecycle.js';
import { mergeDuplicateStateRows } from '../domain/state-text.js';
import { normalizeRecordingBoundary } from '../domain/recording-boundary.js';
import { normalizeLorebookPublication } from '../domain/publication-control.js';
import { emptyRuntimeV2, normalizeRuntimeV2 } from '../runtime-v2/state.js';
export const CURRENT_SCHEMA_VERSION = 6;
/** ChatState 是持久化 JSON 数据；使用 JSON 副本兼容 SillyTavern/插件可能提供的 Proxy 包装对象。 */
function cloneChatState(value) {
    return JSON.parse(JSON.stringify(value));
}
export function emptyChatState(chatKey) {
    return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        memoryStateVersion: 2,
        chatKey,
        processedMessageKeys: [],
        internalFacts: [],
        smallSummaries: [],
        largeSummaries: [],
        lastSyncStatus: 'idle',
        lorebookPublication: normalizeLorebookPublication(),
        runtimeV2: emptyRuntimeV2(),
        migration: { dynamicTablesV23: false, internalFactsV23: false, objectViewsV26: false, objectAllocationV27: false, summaryVersionsV27: false, regionAllocationV28: false, characterMergeV29: false, persistedCharacterMergeV30: false, uniqueObjectNamesV31: false, spacetimeSingletonV32: false, entryLifecycleV33: false, singleAuthorityV34: false, factContractV35: false },
        updatedAt: nowIso(),
    };
}
function normalizeSummaryArrays(value, kind) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => item && typeof item === 'object').map((item) => ({
        ...item,
        kind,
        sourceKeys: Array.isArray(item.sourceKeys) ? [...new Set(item.sourceKeys.map(String))] : [],
        sourceFactIds: Array.isArray(item.sourceFactIds) ? [...new Set(item.sourceFactIds.map(String))] : undefined,
        sourceSummaryIds: Array.isArray(item.sourceSummaryIds) ? [...new Set(item.sourceSummaryIds.map(String))] : undefined,
        eventIds: Array.isArray(item.eventIds) ? [...new Set(item.eventIds.map(String))] : undefined,
        unresolvedItems: Array.isArray(item.unresolvedItems) ? [...new Set(item.unresolvedItems.map(String))] : undefined,
    }));
}
/**
 * rc.23 以前同一 event_id 可能累计留下多条尚未固化的小总结。迁移时把它们整理为一条
 * 可继续更新的累计版本，同时保留旧记录和版本指针，避免世界书残留、再次进入大总结。
 */
export function migrateLegacySmallSummaryVersions(small, large) {
    const consumedByLarge = new Set(large.flatMap((item) => item.sourceSummaryIds ?? item.sourceKeys));
    const groups = new Map();
    small.forEach((item, index) => {
        if (item.solidifiedByLargeSummaryId || item.supersededBySmallSummaryId || consumedByLarge.has(item.id))
            return;
        // 缺少 event_id 的旧摘要无法可靠判断是否属于同一事件，保持独立，不按同名标题猜测合并。
        const eventKey = String(item.eventId || '').trim();
        if (!eventKey)
            return;
        const rows = groups.get(eventKey) ?? [];
        rows.push({ item, index });
        groups.set(eventKey, rows);
    });
    let changed = false;
    for (const rows of groups.values()) {
        if (rows.length < 2)
            continue;
        rows.sort((a, b) => String(a.item.createdAt || '').localeCompare(String(b.item.createdAt || '')) || a.index - b.index);
        const latest = rows.at(-1).item;
        const older = rows.slice(0, -1).map(({ item }) => item);
        const summaries = [...new Set(rows.map(({ item }) => String(item.summary || '').trim()).filter(Boolean))];
        const unresolved = [...new Set(rows.flatMap(({ item }) => item.unresolvedItems ?? []))];
        const sourceFactIds = [...new Set(rows.flatMap(({ item }) => item.sourceFactIds ?? item.sourceKeys))];
        const sourceKeys = [...new Set(rows.flatMap(({ item }) => item.sourceKeys ?? []))];
        latest.summary = summaries.join('\n');
        latest.unresolvedItems = unresolved;
        latest.sourceFactIds = sourceFactIds;
        latest.sourceKeys = sourceKeys.length ? sourceKeys : sourceFactIds;
        latest.previousSmallSummaryId ||= older.at(-1)?.id;
        latest.rollupCount = Math.max(Number(latest.rollupCount) || 1, rows.length);
        for (const item of older)
            item.supersededBySmallSummaryId = latest.id;
        changed = true;
    }
    return changed;
}
function currentCharacterIds(chatKey, registry) {
    const characterTable = registry.find((table) => table.enabled && table.role === 'characters');
    if (!characterTable)
        return new Set();
    const chat = getChat();
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const artifact = chat[index]?.extra?.[MODULE_NAME];
        if (!artifact || artifact.chatKey !== chatKey || !artifact.snapshot)
            continue;
        const rows = artifact.snapshot[characterTable.key];
        return new Set((Array.isArray(rows) ? rows : [])
            .map((row) => String(row?.id ?? '').trim())
            .filter(Boolean));
    }
    return new Set();
}
function validateCurrentFocus(state, registry) {
    const hadFocus = Object.prototype.hasOwnProperty.call(state, 'focusObjectId');
    const focusObjectId = String(state.focusObjectId ?? '').trim();
    if (!focusObjectId) {
        delete state.focusObjectId;
        return hadFocus;
    }
    if (!currentCharacterIds(state.chatKey, registry).has(focusObjectId)) {
        delete state.focusObjectId;
        return true;
    }
    return false;
}
/**
 * rc.38 及更早版本曾把“历史暂停/重建进度”写入 lastSyncStatus/lastSyncError。
 * lastSync* 只应描述真实世界书写入结果；控制流状态由 historyInvalidation/historyRecovery 表达。
 */
function normalizeLegacySyncControlState(state) {
    const error = String(state.lastSyncError ?? '').trim();
    if (!error || state.lastSyncStatus !== 'failed')
        return false;
    const controlOnly = /^(?:正在重建|历史核心状态已重建|历史核心状态与总结已恢复|历史消息发生变化|最新正文已变化|检测到历史删除|已选择从第|历史恢复被中断|正文已修正|历史重建未完成)/.test(error)
        || (/^历史核心状态已恢复，但部分派生失败/.test(error) && !error.includes('世界书：'));
    if (!controlOnly)
        return false;
    state.lastSyncStatus = state.lastSyncAt ? 'success' : 'idle';
    delete state.lastSyncError;
    return true;
}
function aliasMapFrom(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return new Map();
    return new Map(Object.entries(value)
        .map(([oldId, stableId]) => [String(oldId).trim(), String(stableId ?? '').trim()])
        .filter(([oldId, stableId]) => Boolean(oldId && stableId && oldId !== stableId)));
}
function resolveIdAlias(value, aliases) {
    let current = String(value || '').trim();
    const seen = new Set();
    while (current && aliases.has(current) && !seen.has(current)) {
        seen.add(current);
        current = String(aliases.get(current) || '').trim() || current;
    }
    return current;
}
function flattenAliasMap(aliases) {
    const flattened = new Map();
    for (const oldId of aliases.keys()) {
        const stableId = resolveIdAlias(oldId, aliases);
        if (oldId && stableId && oldId !== stableId)
            flattened.set(oldId, stableId);
    }
    return flattened;
}
function applyObjectIdAliases(snapshot, aliases, registry) {
    if (!aliases.size)
        return false;
    aliases = flattenAliasMap(aliases);
    let changed = false;
    for (const table of registry) {
        for (const row of snapshot[table.key] ?? []) {
            const stableId = resolveIdAlias(row.id, aliases);
            if (stableId && stableId !== row.id) {
                row.id = stableId;
                changed = true;
            }
        }
    }
    rewriteObjectReferences(snapshot, aliases);
    return changed;
}
/** 将旧 artifact 事实包与旧固定视图迁入聊天级内部事实层和当前对象视图。 */
function migrateChatState(raw, chatKey) {
    const state = raw && raw.chatKey === chatKey ? cloneChatState(raw) : emptyChatState(chatKey);
    const metadataBefore = JSON.stringify(raw ?? null);
    const previousSchema = Number(state.schemaVersion) || 1;
    const needsViewMigration = state.migration?.dynamicTablesV23 !== true;
    const needsFactMigration = state.migration?.internalFactsV23 !== true;
    const needsObjectViewMigration = state.migration?.objectViewsV26 !== true;
    const needsObjectAllocationMigration = state.migration?.objectAllocationV27 !== true;
    const needsSummaryVersionMigration = state.migration?.summaryVersionsV27 !== true;
    // rc.24 只清理了与当前时空路径重叠的临时区域；rc.25 重新跑一次对象分配，清理其他无依据自动区域。
    const needsRegionAllocationMigration = state.migration?.regionAllocationV28 !== true;
    // rc.26 固定 characters/state 合并优先级；已执行旧迁移的聊天也必须重新归一化一次。
    const needsCharacterMergeMigration = state.migration?.characterMergeV29 !== true;
    // rc.27 专门修复已经被 rc.25 保存为 characters 单表、且重复行 ID 已分裂的聊天。
    const needsPersistedCharacterMergeMigration = state.migration?.persistedCharacterMergeV30 !== true;
    // rc.53 将“同表同名唯一”提升为全表硬约束；旧迁移完成的聊天也必须重新扫描全部历史快照。
    const needsUniqueObjectNamesMigration = state.migration?.uniqueObjectNamesV31 !== true;
    // 1.3.7 将时空表收敛为每聊天唯一的当前时空单例。
    const needsSpacetimeSingletonMigration = state.migration?.spacetimeSingletonV32 !== true;
    // 1.3.9 将 absorbed/retired 统一迁移为 settling，并用同一覆盖闸门回收已完成旧墓碑。
    const needsEntryLifecycleMigration = state.migration?.entryLifecycleV33 !== true;
    const needsSingleAuthorityMigration = state.migration?.singleAuthorityV34 !== true;
    // core.4 为旧事实补齐主宿主、切面、保存层级和有效区间；无法确认对象时保留 legacy 宿主，不猜测归并。
    const needsFactContractMigration = state.migration?.factContractV35 !== true;
    const needsFullSnapshotMigration = needsViewMigration || needsObjectViewMigration
        || needsObjectAllocationMigration || needsRegionAllocationMigration || needsCharacterMergeMigration;
    let artifactViewsChanged = false;
    state.schemaVersion = CURRENT_SCHEMA_VERSION;
    state.runtimeV2 = normalizeRuntimeV2(state.runtimeV2);
    state.memoryStateVersion = 2;
    state.chatLocator = currentChatLocator() || state.chatLocator;
    state.processedMessageKeys = Array.isArray(state.processedMessageKeys) ? [...new Set(state.processedMessageKeys.map(String))] : [];
    state.recordingBoundary = normalizeRecordingBoundary(state.recordingBoundary);
    state.lorebookPublication = normalizeLorebookPublication(state.lorebookPublication);
    if (!state.recordingBoundary && state.processedMessageKeys.length) {
        const processed = new Set(state.processedMessageKeys);
        const firstIndex = getChat().findIndex((message) => {
            const artifact = message?.extra?.[MODULE_NAME];
            return Boolean(artifact?.chatKey === chatKey && processed.has(String(artifact.messageKey || '')));
        });
        if (firstIndex >= 0) {
            state.recordingBoundary = {
                startIndex: firstIndex,
                setAt: state.updatedAt || nowIso(),
                source: 'legacy',
            };
        }
    }
    state.smallSummaries = normalizeSummaryArrays(state.smallSummaries, 'small');
    state.largeSummaries = normalizeSummaryArrays(state.largeSummaries, 'large');
    const summaryVersionsChanged = needsSummaryVersionMigration
        ? migrateLegacySmallSummaryVersions(state.smallSummaries, state.largeSummaries)
        : false;
    let facts = normalizeInternalFacts(state.internalFacts);
    const registry = getSettings().tableRegistry;
    let previousMigratedSnapshot;
    let persistedCharactersChanged = false;
    let uniqueObjectNamesChanged = false;
    const uniqueNameAliases = new Map();
    const canonicalIdsByTableTitle = new Map();
    for (const message of getChat()) {
        const artifact = message?.extra?.[MODULE_NAME];
        if (!artifact || artifact.chatKey !== chatKey)
            continue;
        if ((needsFullSnapshotMigration || needsPersistedCharacterMergeMigration || needsUniqueObjectNamesMigration || needsSpacetimeSingletonMigration || needsEntryLifecycleMigration || needsSingleAuthorityMigration) && artifact.snapshot) {
            const before = JSON.stringify({
                snapshot: artifact.snapshot,
                aliases: artifact.persistedCharacterIdAliasesV30,
                uniqueAliases: artifact.uniqueObjectIdAliasesV31,
                sync: artifact.stages?.sync,
                lorebookEntryIds: artifact.lorebookEntryIds,
            });
            let migrated = needsFullSnapshotMigration
                ? normalizeSnapshot(artifact.snapshot, previousMigratedSnapshot ?? artifact.snapshot, registry)
                : structuredClone(artifact.snapshot);
            if (needsFullSnapshotMigration && previousMigratedSnapshot) {
                migrated = preserveStableObjectIds(previousMigratedSnapshot, migrated, registry);
            }
            if (needsPersistedCharacterMergeMigration) {
                const savedAliases = artifact.persistedCharacterIdAliasesV30
                    && typeof artifact.persistedCharacterIdAliasesV30 === 'object'
                    ? artifact.persistedCharacterIdAliasesV30
                    : {};
                const aliasMap = new Map(Object.entries(savedAliases)
                    .map(([oldId, stableId]) => [String(oldId), String(stableId)])
                    .filter(([oldId, stableId]) => Boolean(oldId && stableId)));
                if (aliasMap.size)
                    persistedCharactersChanged = true;
                rewriteObjectReferences(migrated, aliasMap);
                const persisted = mergePersistedCharacterDuplicates(migrated, registry);
                migrated = persisted.snapshot;
                if (persisted.idRemap.size) {
                    artifact.persistedCharacterIdAliasesV30 = {
                        ...Object.fromEntries(aliasMap),
                        ...Object.fromEntries(persisted.idRemap),
                    };
                    persistedCharactersChanged = true;
                    if (artifact.stages?.sync) {
                        artifact.stages.sync = {
                            ...artifact.stages.sync,
                            status: 'idle',
                            error: undefined,
                            startedAt: undefined,
                            finishedAt: undefined,
                        };
                    }
                    delete artifact.lorebookEntryIds;
                }
            }
            if (needsUniqueObjectNamesMigration) {
                const savedAliases = aliasMapFrom(artifact.uniqueObjectIdAliasesV31);
                if (savedAliases.size) {
                    applyObjectIdAliases(migrated, savedAliases, registry);
                    for (const [oldId, stableId] of savedAliases)
                        uniqueNameAliases.set(oldId, stableId);
                    uniqueObjectNamesChanged = true;
                }
                const unique = mergeDuplicateStateRows(migrated, registry);
                migrated = unique.snapshot;
                const artifactAliases = new Map(savedAliases);
                for (const [oldId, stableId] of unique.idRemap)
                    artifactAliases.set(oldId, stableId);
                // 跨历史快照也必须沿用同一对象 ID：首次出现的规范名称确定稳定 ID，后续切面不得换 ID。
                const crossSnapshotAliases = new Map();
                for (const table of registry) {
                    const rows = migrated[table.key] ?? [];
                    const occupied = new Map(rows.map((row) => [row.id, row]));
                    for (const row of rows) {
                        const titleToken = canonicalObjectTitle(row.title);
                        if (!titleToken)
                            continue;
                        const identityKey = `${table.key}\u0000${titleToken}`;
                        const stableId = canonicalIdsByTableTitle.get(identityKey);
                        if (!stableId) {
                            canonicalIdsByTableTitle.set(identityKey, row.id);
                            continue;
                        }
                        if (stableId === row.id)
                            continue;
                        const collision = occupied.get(stableId);
                        if (collision && collision !== row) {
                            throw new Error(`对象唯一化迁移检测到 ID 冲突：${table.key}/${row.title}/${stableId}`);
                        }
                        const oldId = row.id;
                        row.id = stableId;
                        occupied.delete(oldId);
                        occupied.set(stableId, row);
                        crossSnapshotAliases.set(oldId, stableId);
                        artifactAliases.set(oldId, stableId);
                    }
                }
                if (crossSnapshotAliases.size)
                    rewriteObjectReferences(migrated, crossSnapshotAliases);
                const flattenedAliases = flattenAliasMap(artifactAliases);
                if (flattenedAliases.size) {
                    artifact.uniqueObjectIdAliasesV31 = Object.fromEntries(flattenedAliases);
                    for (const [oldId, stableId] of flattenedAliases)
                        uniqueNameAliases.set(oldId, stableId);
                }
                if (unique.mergedCount || crossSnapshotAliases.size || savedAliases.size) {
                    uniqueObjectNamesChanged = true;
                    if (artifact.stages?.sync) {
                        artifact.stages.sync = {
                            ...artifact.stages.sync,
                            status: 'idle',
                            error: undefined,
                            startedAt: undefined,
                            finishedAt: undefined,
                        };
                    }
                    delete artifact.lorebookEntryIds;
                }
            }
            if (needsEntryLifecycleMigration || needsSingleAuthorityMigration) {
                for (const table of registry) {
                    for (const row of migrated[table.key] ?? []) {
                        if (!row.entryLifecycle)
                            continue;
                        const normalizedLifecycle = normalizeEntryLifecycleValue(row.entryLifecycle, row.entryLifecycle);
                        if (normalizedLifecycle)
                            row.entryLifecycle = normalizedLifecycle;
                        else
                            delete row.entryLifecycle;
                    }
                }
            }
            if (needsFullSnapshotMigration)
                migrated = enforceObjectViewAllocation(migrated, registry);
            if (needsSpacetimeSingletonMigration)
                migrated = enforceCurrentSpacetimeSingleton(migrated, registry);
            artifact.snapshot = migrated;
            if (needsFullSnapshotMigration)
                previousMigratedSnapshot = migrated;
            const after = JSON.stringify({
                snapshot: artifact.snapshot,
                aliases: artifact.persistedCharacterIdAliasesV30,
                uniqueAliases: artifact.uniqueObjectIdAliasesV31,
                sync: artifact.stages?.sync,
                lorebookEntryIds: artifact.lorebookEntryIds,
            });
            if (after !== before)
                artifactViewsChanged = true;
        }
        else if (artifact.snapshot) {
            if (needsFullSnapshotMigration)
                previousMigratedSnapshot = normalizeSnapshot(artifact.snapshot, artifact.snapshot, registry);
        }
        if (!needsFactMigration || !artifact.factPackage?.facts?.length)
            continue;
        const incoming = normalizeInternalFacts(artifact.factPackage.facts, artifact.messageKey);
        facts = mergeInternalFacts(facts, incoming, artifact.factPackage.facts);
    }
    if (state.focusObjectId) {
        const stableFocusId = resolveIdAlias(state.focusObjectId, flattenAliasMap(uniqueNameAliases));
        if (stableFocusId && stableFocusId !== state.focusObjectId) {
            state.focusObjectId = stableFocusId;
            uniqueObjectNamesChanged = true;
        }
    }
    validateCurrentFocus(state, registry);
    normalizeLegacySyncControlState(state);
    if (persistedCharactersChanged || uniqueObjectNamesChanged) {
        state.lastSyncStatus = 'idle';
        state.lastSyncError = undefined;
    }
    if (needsFactMigration || needsSummaryVersionMigration || needsFactContractMigration) {
        migrateLegacyConsumption(facts, state.smallSummaries, state.largeSummaries);
    }
    state.internalFacts = facts;
    if (needsEntryLifecycleMigration) {
        for (const message of getChat()) {
            const artifact = message?.extra?.[MODULE_NAME];
            if (!artifact || artifact.chatKey !== chatKey || !artifact.snapshot)
                continue;
            const gc = garbageCollectLegacyEntryTombstones(artifact.snapshot, facts, registry, state.focusObjectId);
            if (gc.deletedRowIds.length || JSON.stringify(gc.snapshot) !== JSON.stringify(artifact.snapshot)) {
                artifact.snapshot = gc.snapshot;
                artifactViewsChanged = true;
                if (artifact.stages?.sync)
                    artifact.stages.sync = { ...artifact.stages.sync, status: 'idle', error: undefined };
                delete artifact.lorebookEntryIds;
            }
        }
    }
    state.migration = {
        ...(state.migration ?? {}),
        dynamicTablesV23: true,
        internalFactsV23: true,
        objectViewsV26: true,
        objectAllocationV27: true,
        summaryVersionsV27: true,
        regionAllocationV28: true,
        characterMergeV29: true,
        persistedCharacterMergeV30: true,
        uniqueObjectNamesV31: true,
        spacetimeSingletonV32: true,
        entryLifecycleV33: true,
        singleAuthorityV34: true,
        factContractV35: true,
    };
    state.updatedAt ||= nowIso();
    return {
        state,
        artifactViewsChanged,
        metadataChanged: metadataBefore !== JSON.stringify(state)
            || previousSchema !== CURRENT_SCHEMA_VERSION
            || summaryVersionsChanged,
    };
}
/** Canonical message artifacts live on message.extra. */
export async function putArtifact(_artifact) {
    // The live artifact object is already attached to the SillyTavern message.
}
const chatStateReads = new Map();
const REQUIRED_MIGRATIONS = [
    'dynamicTablesV23',
    'internalFactsV23',
    'objectViewsV26',
    'objectAllocationV27',
    'summaryVersionsV27',
    'regionAllocationV28',
    'characterMergeV29',
    'persistedCharacterMergeV30',
    'uniqueObjectNamesV31',
    'spacetimeSingletonV32',
    'entryLifecycleV33',
    'singleAuthorityV34',
    'factContractV35',
];
function currentStateStructure(raw, chatKey) {
    if (!raw || typeof raw !== 'object')
        return false;
    const state = raw;
    if (state.schemaVersion !== CURRENT_SCHEMA_VERSION || state.memoryStateVersion !== 2 || state.chatKey !== chatKey)
        return false;
    if (!Array.isArray(state.processedMessageKeys)
        || !Array.isArray(state.internalFacts)
        || !Array.isArray(state.smallSummaries)
        || !Array.isArray(state.largeSummaries))
        return false;
    if (!state.processedMessageKeys.every((key) => typeof key === 'string'))
        return false;
    if (new Set(state.processedMessageKeys).size !== state.processedMessageKeys.length)
        return false;
    if (!['idle', 'success', 'failed'].includes(state.lastSyncStatus))
        return false;
    if (typeof state.updatedAt !== 'string')
        return false;
    if (state.focusObjectId !== undefined && typeof state.focusObjectId !== 'string')
        return false;
    if (state.recordingBoundary !== undefined && !normalizeRecordingBoundary(state.recordingBoundary))
        return false;
    if (JSON.stringify(state.lorebookPublication) !== JSON.stringify(normalizeLorebookPublication(state.lorebookPublication)))
        return false;
    if (JSON.stringify(state.runtimeV2) !== JSON.stringify(normalizeRuntimeV2(state.runtimeV2)))
        return false;
    return REQUIRED_MIGRATIONS.every((key) => state.migration?.[key] === true);
}
async function readCurrentChatStateFast(namespace, state, chatKey) {
    const next = { ...state };
    const focusChanged = Object.prototype.hasOwnProperty.call(state, 'focusObjectId')
        ? validateCurrentFocus(next, getSettings().tableRegistry)
        : false;
    const syncStateChanged = normalizeLegacySyncControlState(next);
    if (!focusChanged && !syncStateChanged)
        return cloneChatState(state);
    namespace.state = next;
    try {
        await persistMetadataFor(chatKey);
        return cloneChatState(next);
    }
    catch (error) {
        namespace.state = state;
        throw error;
    }
}
async function readChatState(chatKey) {
    assertChatCommitCurrent(chatKey, '聊天已切换，不读取旧聊天状态');
    const namespace = getChatMetadataNamespace();
    if (currentStateStructure(namespace.state, chatKey)) {
        return readCurrentChatStateFast(namespace, namespace.state, chatKey);
    }
    const hadState = Object.prototype.hasOwnProperty.call(namespace, 'state');
    const previousState = namespace.state;
    const backups = [];
    for (const message of getChat()) {
        const artifact = message?.extra?.[MODULE_NAME];
        if (!artifact || artifact.chatKey !== chatKey)
            continue;
        backups.push({
            artifact,
            snapshot: artifact.snapshot,
            aliases: artifact.persistedCharacterIdAliasesV30,
            hadAliases: Object.prototype.hasOwnProperty.call(artifact, 'persistedCharacterIdAliasesV30'),
            uniqueAliases: artifact.uniqueObjectIdAliasesV31,
            hadUniqueAliases: Object.prototype.hasOwnProperty.call(artifact, 'uniqueObjectIdAliasesV31'),
            sync: artifact.stages?.sync,
            hadSync: Boolean(artifact.stages && Object.prototype.hasOwnProperty.call(artifact.stages, 'sync')),
            lorebookEntryIds: artifact.lorebookEntryIds,
            hadLorebookEntryIds: Object.prototype.hasOwnProperty.call(artifact, 'lorebookEntryIds'),
        });
    }
    const migration = migrateChatState(namespace.state, chatKey);
    let chatPersisted = false;
    try {
        if (migration.artifactViewsChanged) {
            await persistChatFor(chatKey);
            chatPersisted = true;
        }
        namespace.state = migration.state;
        if (migration.metadataChanged)
            await persistMetadataFor(chatKey);
        // 调用方拿到工作副本，只有 putChatState 成功后才进入聊天 metadata。
        // 避免保存失败时，未落盘修改仍污染当前运行期的规范状态。
        return cloneChatState(namespace.state);
    }
    catch (error) {
        if (hadState)
            namespace.state = previousState;
        else
            delete namespace.state;
        // 若聊天尚未确认保存，恢复所有内存 artifact；若聊天已保存而 metadata 失败，
        // 保留随聊天落盘的 V30/V31 ID 别名，让下一次读取能修复旧 focusObjectId 与对象引用后完成迁移位。
        if (!chatPersisted) {
            for (const backup of backups) {
                backup.artifact.snapshot = backup.snapshot;
                if (backup.hadAliases)
                    backup.artifact.persistedCharacterIdAliasesV30 = backup.aliases;
                else
                    delete backup.artifact.persistedCharacterIdAliasesV30;
                if (backup.hadUniqueAliases)
                    backup.artifact.uniqueObjectIdAliasesV31 = backup.uniqueAliases;
                else
                    delete backup.artifact.uniqueObjectIdAliasesV31;
                if (backup.artifact.stages) {
                    if (backup.hadSync)
                        backup.artifact.stages.sync = backup.sync;
                    else
                        delete backup.artifact.stages.sync;
                }
                if (backup.hadLorebookEntryIds)
                    backup.artifact.lorebookEntryIds = backup.lorebookEntryIds;
                else
                    delete backup.artifact.lorebookEntryIds;
            }
        }
        throw error;
    }
}
export function getChatState(chatKey) {
    const running = chatStateReads.get(chatKey);
    if (running)
        return running;
    const pending = readChatState(chatKey).finally(() => {
        if (chatStateReads.get(chatKey) === pending)
            chatStateReads.delete(chatKey);
    });
    chatStateReads.set(chatKey, pending);
    return pending;
}
/** ChatState 只能写入其自身 chatKey 对应的当前聊天 metadata。 */
export async function putChatState(state) {
    assertChatCommitCurrent(state.chatKey, '聊天已切换，不写入旧聊天状态');
    const namespace = getChatMetadataNamespace();
    const hadState = Object.prototype.hasOwnProperty.call(namespace, 'state');
    const previousState = hadState ? cloneChatState(namespace.state) : undefined;
    const hadUpdatedAt = Object.prototype.hasOwnProperty.call(namespace, 'updatedAt');
    const previousUpdatedAt = namespace.updatedAt;
    const next = cloneChatState(state);
    next.schemaVersion = CURRENT_SCHEMA_VERSION;
    next.chatLocator = currentChatLocator() || next.chatLocator;
    next.internalFacts = normalizeInternalFacts(next.internalFacts);
    next.recordingBoundary = normalizeRecordingBoundary(next.recordingBoundary);
    next.lorebookPublication = normalizeLorebookPublication(next.lorebookPublication);
    next.runtimeV2 = normalizeRuntimeV2(next.runtimeV2);
    if (next.migration?.internalFactsV23 !== true || next.migration?.summaryVersionsV27 !== true) {
        migrateLegacyConsumption(next.internalFacts, next.smallSummaries, next.largeSummaries);
    }
    next.updatedAt = nowIso();
    namespace.state = next;
    namespace.updatedAt = next.updatedAt;
    try {
        await persistMetadataFor(next.chatKey);
        // 保持调用方后续继续使用同一工作对象时能看到规范化后的成功版本。
        Object.assign(state, cloneChatState(next));
    }
    catch (error) {
        // 保存本身失败时回滚；若物理保存已完成、仅因随后切换聊天而拒绝继续提交，
        // 源聊天对象必须保留已经落盘的状态，不能反向制造内存/磁盘分歧。
        if (!(error instanceof CommitRejectedError)) {
            if (hadState)
                namespace.state = previousState;
            else
                delete namespace.state;
            if (hadUpdatedAt)
                namespace.updatedAt = previousUpdatedAt;
            else
                delete namespace.updatedAt;
        }
        throw error;
    }
}
export async function clearAllStorage(chatKey = currentChatKey()) {
    assertChatCommitCurrent(chatKey, '聊天已切换，不清理旧聊天状态');
    const namespace = getChatMetadataNamespace();
    const hadState = Object.prototype.hasOwnProperty.call(namespace, 'state');
    const previousState = hadState ? cloneChatState(namespace.state) : undefined;
    const hadLorebookName = Object.prototype.hasOwnProperty.call(namespace, 'lorebookName');
    const previousLorebookName = namespace.lorebookName;
    const hadUpdatedAt = Object.prototype.hasOwnProperty.call(namespace, 'updatedAt');
    const previousUpdatedAt = namespace.updatedAt;
    delete namespace.state;
    delete namespace.lorebookName;
    namespace.updatedAt = nowIso();
    try {
        await persistMetadataFor(chatKey);
    }
    catch (error) {
        if (!(error instanceof CommitRejectedError)) {
            if (hadState)
                namespace.state = previousState;
            else
                delete namespace.state;
            if (hadLorebookName)
                namespace.lorebookName = previousLorebookName;
            else
                delete namespace.lorebookName;
            if (hadUpdatedAt)
                namespace.updatedAt = previousUpdatedAt;
            else
                delete namespace.updatedAt;
        }
        throw error;
    }
}
