import { alignPatchRowsToCanonicalSnapshot, canonicalObjectTitle, canonicalizeObjectIdentities } from './object-identity.js';
import { deriveIncrementalSettlementDirectives, deriveSceneBoundary } from './incremental-settlement.js';
import { applyEntryLifecycleDirectives, finalizeSettlingEntries, } from './entry-lifecycle.js';
import { ensureCurrentSceneEntry, enforceObjectViewAllocation, filterPassiveObservers, preserveObjectBaseLayers, preservePersistentCharacters, removeFocusCharacterDuplicates, } from './snapshot.js';
import { enforceSpacetimeSingleton } from './special-table-rules.js';
import { dedupeStrongStateRows } from './state-text.js';
import { normalizeTableRegistry, tableByRole } from './table-registry.js';
const MEMORY_STATE_VERSION = 2;
function cloneProtectedRow(row) {
    return structuredClone(row);
}
/**
 * 完全锁定行整行恢复；普通人工行只保护身份、基础内容和已固化历史。
 * 当前状态、关系与能力仍允许依据明确事实更新。
 */
export function preserveProtectedRows(previous, next, registryValue) {
    const registry = normalizeTableRegistry(registryValue);
    previous = dedupeStrongStateRows(previous, registry);
    next = dedupeStrongStateRows(next, registry);
    const mutableFields = new Set([
        'currentFacts', 'currentStates', 'recentHistory', 'relationshipStates', 'abilityStates',
        'presentationStates', 'relatedObjects', 'relatedEvents', 'migrationStatus',
    ]);
    for (const table of registry) {
        const key = table.key;
        next[key] ||= [];
        const nextIndexById = new Map(next[key].map((row, index) => [row.id, index]));
        const nextIndexesByTitle = new Map();
        next[key].forEach((row, index) => {
            const title = canonicalObjectTitle(row.title);
            if (title)
                nextIndexesByTitle.set(title, [...(nextIndexesByTitle.get(title) ?? []), index]);
        });
        for (const row of previous[key] ?? []) {
            if (row.source !== 'manual' && !row.locked && row.lockMode !== 'all' && row.lockMode !== 'base')
                continue;
            const protectedRow = cloneProtectedRow(row);
            const title = canonicalObjectTitle(row.title);
            const titleIndexes = title ? nextIndexesByTitle.get(title) ?? [] : [];
            const existingIndex = nextIndexById.get(row.id) ?? titleIndexes[0];
            if (existingIndex === undefined) {
                nextIndexById.set(row.id, next[key].length);
                next[key].push(protectedRow);
                continue;
            }
            if (row.locked || row.lockMode === 'all') {
                next[key][existingIndex] = protectedRow;
                continue;
            }
            const generated = next[key][existingIndex];
            const oldFields = row.fields ?? {};
            const generatedFields = generated.fields ?? {};
            const mergedFields = { ...structuredClone(oldFields) };
            for (const field of mutableFields)
                if (field in generatedFields)
                    mergedFields[field] = structuredClone(generatedFields[field]);
            // 人工基础行仍可被正文中有事件证据的本质变化更新；完全锁定行在上方已整行恢复。
            // 这允许“原为男性，明确手术后成为女性”更新当前基础定义，同时保留稳定 ID 与变化事实。
            const oldBase = String(oldFields.baseContent ?? '').trim();
            const generatedBase = String(generatedFields.baseContent ?? '').trim();
            const explicitBaseRevision = Boolean(generated.baseRevisionEvidence?.eventId
                && generated.baseRevisionEvidence?.factId
                && generatedBase
                && generatedBase !== oldBase);
            if (explicitBaseRevision)
                mergedFields.baseContent = structuredClone(generatedFields.baseContent);
            next[key][existingIndex] = {
                ...generated,
                id: row.id,
                title: row.title,
                source: 'manual',
                locked: false,
                lockMode: 'base',
                fields: mergedFields,
                factIds: [...new Set([...(row.factIds ?? []), ...(generated.factIds ?? [])])],
                baseRevisionEvidence: explicitBaseRevision ? generated.baseRevisionEvidence : row.baseRevisionEvidence,
            };
        }
    }
    return dedupeStrongStateRows(next, registry);
}
/**
 * 已提交记忆状态的硬约束。生产链中只允许 active（无 entryLifecycle）或 settling。
 * 旧 absorbed/retired 必须在 repository 迁移阶段消化，不能流入普通游玩状态机。
 */
export function assertCommittedMemoryState(snapshot, registryValue) {
    const registry = normalizeTableRegistry(registryValue);
    for (const table of registry) {
        const ids = new Set();
        for (const row of snapshot[table.key] ?? []) {
            if (ids.has(row.id))
                throw new Error(`已提交快照包含重复对象 ID：${table.key}/${row.id}`);
            ids.add(row.id);
            if (row.entryLifecycle && row.entryLifecycle.state !== 'settling') {
                throw new Error(`生产状态包含旧生命周期：${table.key}/${row.id}/${row.entryLifecycle.state}`);
            }
        }
    }
}
/**
 * 状态事实阶段的唯一编排入口。
 * 顺序固定：identity -> protected/base -> special tables -> lifecycle -> legacy migration -> observers。
 */
export function transitionStateSnapshot(input) {
    const registry = normalizeTableRegistry(input.registry);
    const diagnostics = [];
    // spacetime_current 是固定槽位，地点切换必须在通用对象身份继承把标题收回旧值之前判定。
    const sceneBoundary = deriveSceneBoundary(input.previous, input.incoming, registry);
    const identity = canonicalizeObjectIdentities(input.previous, input.incoming, registry);
    if (identity.idRemap.size)
        diagnostics.push({
            stage: 'identity', code: 'id-remap', detail: `继承并改写 ${identity.idRemap.size} 个对象 ID`,
        });
    const protectedMerged = preserveProtectedRows(input.previous, identity.snapshot, registry);
    const persistent = preservePersistentCharacters(input.previous, protectedMerged, registry);
    const basePreserved = preserveObjectBaseLayers(input.previous, persistent, registry);
    diagnostics.push({ stage: 'protected', code: 'protected-layers-applied', detail: '人工/锁定与基础历史层已恢复' });
    let prepared = removeFocusCharacterDuplicates(basePreserved, registry);
    if (sceneBoundary) {
        const spacetimeTable = tableByRole(registry, 'spacetime', false);
        const incomingCurrent = spacetimeTable
            ? (input.incoming[spacetimeTable.key] ?? []).find((row) => canonicalObjectTitle(row.title) === canonicalObjectTitle(sceneBoundary.currentTitle))
            : undefined;
        const preparedCurrent = spacetimeTable ? (prepared[spacetimeTable.key] ?? []).at(-1) : undefined;
        if (incomingCurrent && preparedCurrent) {
            // 当前时空是固定发布槽位，不是永久地点对象；切换时接受新内容但继续沿用固定 ID。
            Object.assign(preparedCurrent, structuredClone(incomingCurrent), { id: 'spacetime_current' });
        }
    }
    prepared = enforceObjectViewAllocation(prepared, registry);
    const spacetime = enforceSpacetimeSingleton(prepared, registry);
    prepared = ensureCurrentSceneEntry(spacetime.snapshot, registry);
    if (spacetime.mergedRowIds.length)
        diagnostics.push({
            stage: 'special-tables', code: 'spacetime-singleton', detail: `合并 ${spacetime.mergedRowIds.length} 条旧时空行`,
        });
    const alignedPatch = alignPatchRowsToCanonicalSnapshot(input.patchSnapshot, prepared, identity.idRemap, registry);
    if (alignedPatch.alignedRowCount)
        diagnostics.push({
            stage: 'identity', code: 'patch-id-aligned', detail: `将 ${alignedPatch.alignedRowCount} 条本轮补丁绑定到稳定对象 ID`,
        });
    const directives = deriveIncrementalSettlementDirectives({
        snapshot: prepared,
        patchSnapshot: alignedPatch.patchSnapshot,
        facts: input.facts,
        registry,
        focusObjectId: input.focusObjectId,
        sceneBoundary,
    });
    const lifecycle = applyEntryLifecycleDirectives(prepared, directives, registry, input.focusObjectId);
    if (lifecycle.appliedSourceIds.length || lifecycle.ignoredSourceIds.length)
        diagnostics.push({
            stage: 'lifecycle',
            code: 'settlement-transitions',
            detail: `应用 ${lifecycle.appliedSourceIds.length}，忽略 ${lifecycle.ignoredSourceIds.length}`,
        });
    const committed = filterPassiveObservers(lifecycle.snapshot, registry);
    assertCommittedMemoryState(committed, registry);
    return {
        snapshot: committed,
        memoryStateVersion: MEMORY_STATE_VERSION,
        lifecycleAppliedIds: lifecycle.appliedSourceIds,
        lifecycleIgnoredIds: lifecycle.ignoredSourceIds,
        sceneBoundary,
        // 字段仅保留 API 兼容；旧墓碑清理由 repository 的一次性迁移负责。
        legacyDeletedIds: [],
        diagnostics,
    };
}
function assertCoverageCommitted(input) {
    const byId = new Map(input.internalFacts.map((fact) => [fact.factId, fact]));
    for (const factId of input.sourceFactIds) {
        const fact = byId.get(factId);
        if (!fact)
            continue; // 旧总结可能只保留历史 source key，不能凭缺失记录阻塞迁移。
        const covered = input.coverageKind === 'small'
            ? Boolean(fact.consumedBySmallSummaryId || fact.solidifiedByLargeSummaryId)
            : Boolean(fact.solidifiedByLargeSummaryId);
        if (!covered)
            throw new Error(`${input.coverageKind === 'small' ? '小总结' : '大总结'}覆盖标记尚未提交：${factId}`);
    }
}
/**
 * 总结事务的结算入口。调用前必须已在同一事务副本写入 coverage 标记与总结层文本。
 */
export function finalizeSummarySettlement(input) {
    assertCoverageCommitted(input);
    assertCommittedMemoryState(input.snapshot, input.registry);
    const result = finalizeSettlingEntries(input.snapshot, {
        eventId: input.eventId,
        sourceFactIds: input.sourceFactIds,
        eventClosed: input.eventClosed,
        internalFacts: input.internalFacts,
        registry: input.registry,
        focusObjectId: input.focusObjectId,
    });
    assertCommittedMemoryState(result.snapshot, input.registry);
    return {
        ...result,
        diagnostics: [{
                stage: 'summary-settlement',
                code: result.deletedRowIds.length ? 'physical-delete' : 'retained',
                detail: result.deletedRowIds.length
                    ? `总结覆盖后物理删除 ${result.deletedRowIds.length} 个容器`
                    : `本次保留 ${result.retainedRowIds.length} 个待结算容器`,
            }],
    };
}
//# sourceMappingURL=memory-state-machine.js.map
