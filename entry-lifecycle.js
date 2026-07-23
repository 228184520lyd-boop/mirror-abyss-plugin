import { nowIso, safeText } from '../core/utils.js';
import { canonicalObjectTitle, rewriteObjectReferences } from './object-identity.js';
import { dedupeStrongStateRows } from './state-text.js';
import { normalizeTableRegistry } from './table-registry.js';
function stringList(value, limit = 80, itemLimit = 180) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => safeText(item, itemLimit).trim()).filter(Boolean))].slice(0, limit);
}
/** 旧 absorbed/retired 只作为迁移输入；任何新写入统一收敛为 settling。 */
export function normalizeEntryLifecycleValue(value, previous) {
    const source = value && typeof value === 'object' ? value : {};
    const rawState = safeText(source.state ?? previous?.state, 24).trim();
    const rawAction = safeText(source.action ?? previous?.action, 24).trim();
    const action = rawAction === 'absorb' || rawState === 'absorbed'
        ? 'absorb'
        : rawAction === 'retire' || rawState === 'retired'
            ? 'retire'
            : undefined;
    if (rawState !== 'settling' && rawState !== 'absorbed' && rawState !== 'retired')
        return undefined;
    if (!action)
        return undefined;
    return {
        state: 'settling',
        legacyState: rawState === 'absorbed' || rawState === 'retired' ? rawState : previous?.legacyState,
        action,
        targetTable: safeText(source.targetTable ?? previous?.targetTable, 100).trim() || undefined,
        targetId: safeText(source.targetId ?? previous?.targetId, 160).trim() || undefined,
        targetTitle: safeText(source.targetTitle ?? previous?.targetTitle, 240).trim() || undefined,
        trigger: safeText(source.trigger ?? previous?.trigger, 40).trim() || undefined,
        triggerEventIds: stringList(source.triggerEventIds ?? previous?.triggerEventIds, 20, 180),
        note: safeText(source.note ?? previous?.note, 1200).trim(),
        reason: safeText(source.reason ?? previous?.reason, 800).trim(),
        updatedAt: safeText(source.updatedAt ?? previous?.updatedAt ?? nowIso(), 80).trim() || nowIso(),
    };
}
export function entryState(row) {
    return row?.entryLifecycle ? 'settling' : 'active';
}
/** 仅用于识别尚未经过归一化的 1.3.4 旧数据。 */
export function isLegacyEntryLifecycle(row) {
    const state = safeText(row?.entryLifecycle?.state, 24);
    return state === 'absorbed' || state === 'retired';
}
/** 兼容旧 API：旧墓碑在归一化前隐藏；新 settling 条目保持可见但暂停参与。 */
export function isEntryLifecycleHidden(row) {
    return isLegacyEntryLifecycle(row);
}
export function isEntryParticipationPaused(row) {
    return entryState(row) === 'settling' || isLegacyEntryLifecycle(row);
}
export function visibleStateRows(rows) {
    return (rows ?? []).filter((row) => !isEntryLifecycleHidden(row));
}
function protectedRow(row, focusObjectId) {
    return row.source === 'manual'
        || row.locked
        || row.lockMode === 'all'
        || row.lockMode === 'base'
        || row.id === focusObjectId;
}
function rowEventIds(row) {
    return [...new Set([...(row.eventIds ?? []), row.eventId].map((item) => safeText(item, 180).trim()).filter(Boolean))];
}
function appendUniqueText(value, text, limit = 60) {
    const current = Array.isArray(value) ? value.map((item) => safeText(item, 1200).trim()).filter(Boolean) : [];
    return [...new Set([...current, safeText(text, 1200).trim()].filter(Boolean))].slice(-limit);
}
function findTarget(snapshot, directive) {
    const targetTable = safeText(directive.targetTable, 100).trim();
    const targetTitle = canonicalObjectTitle(safeText(directive.targetTitle, 240));
    if (!targetTable || !targetTitle)
        return undefined;
    const matches = (snapshot[targetTable] ?? []).filter((row) => entryState(row) === 'active' && canonicalObjectTitle(row.title) === targetTitle);
    return matches.length === 1 ? { tableKey: targetTable, row: matches[0] } : undefined;
}
/**
 * 只执行插件产生的结构化指令。active 只能进入 settling；restore 只能在物理删除前恢复同一 ID。
 */
export function applyEntryLifecycleDirectives(snapshot, directives, registry, focusObjectId) {
    const tables = normalizeTableRegistry(registry);
    const next = structuredClone(snapshot);
    const applied = [];
    const ignored = [];
    for (const directive of directives ?? []) {
        const source = (next[directive.sourceTable] ?? []).find((row) => row.id === directive.sourceId);
        if (!source || protectedRow(source, focusObjectId)) {
            ignored.push(directive.sourceId);
            continue;
        }
        if (directive.action === 'restore') {
            if (entryState(source) !== 'settling') {
                ignored.push(source.id);
                continue;
            }
            delete source.entryLifecycle;
            if (/^(待结算|已并入|已退出|absorbed|retired)/i.test(source.status))
                source.status = 'active';
            source.updatedAt = nowIso();
            applied.push(source.id);
            continue;
        }
        // 新状态机禁止 active -> physical delete；这里只能打开 settling。
        if (entryState(source) !== 'active') {
            ignored.push(source.id);
            continue;
        }
        const note = safeText(directive.note, 1200).trim();
        const reason = safeText(directive.reason, 800).trim();
        if (directive.action === 'absorb') {
            const target = findTarget(next, directive);
            if (!target || target.row.id === source.id || target.row.locked || target.row.lockMode === 'all') {
                ignored.push(source.id);
                continue;
            }
            const memory = note || `${source.title}不再作为独立条目保留，其有效后果已并入${target.row.title}。`;
            target.row.fields ||= {};
            target.row.fields.absorbedMemory = appendUniqueText(target.row.fields.absorbedMemory, memory);
            target.row.factIds = [...new Set([...(target.row.factIds ?? []), ...(source.factIds ?? [])])];
            target.row.eventIds = [...new Set([
                    ...(target.row.eventIds ?? (target.row.eventId ? [target.row.eventId] : [])),
                    ...(source.eventIds ?? (source.eventId ? [source.eventId] : [])),
                ])];
            target.row.eventId ||= target.row.eventIds[0];
            target.row.recall ||= { any: [], all: [], exclude: [] };
            target.row.recall.any = [...new Set([...(target.row.recall.any ?? []), source.title, ...(source.keywords ?? [])])].slice(0, 32);
            target.row.updatedAt = nowIso();
            source.entryLifecycle = {
                state: 'settling',
                action: 'absorb',
                targetTable: target.tableKey,
                targetId: target.row.id,
                targetTitle: target.row.title,
                note: memory,
                reason,
                updatedAt: nowIso(),
            };
            source.status = `待结算：并入${target.row.title}`;
            source.updatedAt = nowIso();
            applied.push(source.id);
            continue;
        }
        if (directive.action === 'retire') {
            const terminalText = `${source.status} ${source.content} ${note} ${reason}`;
            const terminal = /(已出售|已赠出|已消耗|耗尽|已损毁|已销毁|已丢弃|已遗失|已结束|已关闭|已失效|已解决|已解散|已退出|已离开场景|已离开当前场景|预退出|不再有效|无后续价值|sold|consumed|destroyed|discarded|lost|closed|ended|resolved|retired|obsolete)/i.test(terminalText);
            if (!terminal) {
                ignored.push(source.id);
                continue;
            }
            source.entryLifecycle = {
                state: 'settling',
                action: 'retire',
                trigger: safeText(directive.trigger, 40).trim() || undefined,
                triggerEventIds: stringList(directive.triggerEventIds, 20, 180),
                note: note || `${source.title}已失去独立追踪价值。`,
                reason,
                updatedAt: nowIso(),
            };
            source.status = '待结算：退出独立条目';
            source.updatedAt = nowIso();
            applied.push(source.id);
        }
    }
    const finalized = dedupeStrongStateRows(next, tables);
    // 去重可能把同 ID 的旧视图状态文本重新合回结果；恢复必须在最终快照上原子清除待结算痕迹。
    if (applied.length) {
        const restoredIds = new Set((directives ?? [])
            .filter((item) => item.action === 'restore' && applied.includes(item.sourceId))
            .map((item) => item.sourceId));
        for (const table of tables) {
            for (const row of finalized[table.key] ?? []) {
                if (!restoredIds.has(row.id))
                    continue;
                delete row.entryLifecycle;
                if (!safeText(row.status, 120).trim()
                    || /^(待结算|已并入|已退出|absorbed|retired)/i.test(row.status)) {
                    row.status = 'active';
                }
                row.updatedAt = nowIso();
            }
        }
    }
    return {
        snapshot: finalized,
        appliedSourceIds: [...new Set(applied)],
        ignoredSourceIds: [...new Set(ignored)],
    };
}
function findLifecycleTarget(snapshot, row) {
    const lifecycle = row.entryLifecycle;
    if (!lifecycle || lifecycle.action !== 'absorb')
        return undefined;
    const rows = lifecycle.targetTable ? snapshot[lifecycle.targetTable] ?? [] : [];
    return rows.find((candidate) => candidate.id === lifecycle.targetId)
        ?? rows.find((candidate) => canonicalObjectTitle(candidate.title) === canonicalObjectTitle(lifecycle.targetTitle));
}
function targetHasDistribution(snapshot, row, eventId) {
    if (row.entryLifecycle?.action === 'retire') {
        const sourceFactIds = new Set(row.factIds ?? []);
        for (const rows of Object.values(snapshot)) {
            if (!Array.isArray(rows))
                continue;
            for (const candidate of rows) {
                if (!candidate || candidate.id === row.id || entryState(candidate) !== 'active')
                    continue;
                const fields = candidate.fields ?? {};
                const hasDurableMemory = ['recentHistory', 'solidifiedHistory', 'absorbedMemory']
                    .some((key) => Array.isArray(fields[key]) && fields[key].some((item) => safeText(item, 1200).trim()));
                if (!hasDurableMemory)
                    continue;
                const sameEvent = rowEventIds(candidate).includes(eventId);
                const carriesSourceFact = (candidate.factIds ?? []).some((id) => sourceFactIds.has(id));
                if (sameEvent || carriesSourceFact)
                    return true;
            }
        }
        // retire 不带目标宿主；若没有另一个活动对象明确承接总结，必须保留原容器。
        return false;
    }
    if (row.entryLifecycle?.action !== 'absorb')
        return false;
    const target = findLifecycleTarget(snapshot, row);
    if (!target)
        return false;
    const absorbed = Array.isArray(target.fields?.absorbedMemory)
        ? target.fields.absorbedMemory.map((item) => safeText(item, 1200).trim())
        : [];
    const note = safeText(row.entryLifecycle.note, 1200).trim();
    const sourceFacts = new Set(row.factIds ?? []);
    const targetHasFacts = [...sourceFacts].every((id) => (target.factIds ?? []).includes(id));
    return (!note || absorbed.includes(note)) && targetHasFacts;
}
/**
 * 总结覆盖审计。只有 settling 可以物理删除；summary coverage 必须先写入事务副本再调用本函数。
 */
export function finalizeSettlingEntries(snapshot, options) {
    const tables = normalizeTableRegistry(options.registry);
    const next = structuredClone(snapshot);
    const coveredFactIds = new Set(stringList(options.sourceFactIds, 200, 180));
    for (const fact of options.internalFacts ?? []) {
        if (fact.consumedBySmallSummaryId || fact.solidifiedByLargeSummaryId)
            coveredFactIds.add(fact.factId);
    }
    const retained = [];
    const deleted = [];
    // 先基于同一个事务副本做完整判定，再统一删除，支持源和宿主同批级联结算。
    for (const table of tables) {
        for (const row of next[table.key] ?? []) {
            if (entryState(row) !== 'settling')
                continue;
            const linkedByEvent = rowEventIds(row).includes(options.eventId);
            const rowFacts = stringList(row.factIds, 200, 180);
            const linkedByFacts = rowFacts.some((id) => coveredFactIds.has(id));
            const allKnownFactsCovered = rowFacts.length > 0 && rowFacts.every((id) => coveredFactIds.has(id));
            const sceneBoundarySettlement = row.entryLifecycle?.trigger === 'scene-boundary'
                && (row.entryLifecycle.triggerEventIds ?? []).includes(options.eventId);
            // 事件容器和依附事件终局的对象仍要求事件关闭；场景边界临时容器则按自身承接状态退出。
            const lifecycleCanClose = options.eventClosed || sceneBoundarySettlement;
            const ready = !protectedRow(row, options.focusObjectId)
                && lifecycleCanClose
                && (linkedByEvent || linkedByFacts)
                && allKnownFactsCovered
                && targetHasDistribution(next, row, options.eventId);
            if (!ready) {
                retained.push(row.id);
                continue;
            }
            deleted.push({
                tableKey: table.key,
                id: row.id,
                title: row.title,
                targetId: row.entryLifecycle?.action === 'absorb' ? row.entryLifecycle.targetId : undefined,
            });
        }
    }
    if (deleted.length) {
        const deletedIds = new Set(deleted.map((item) => item.id));
        const remap = new Map();
        for (const item of deleted) {
            if (item.targetId && !deletedIds.has(item.targetId))
                remap.set(item.id, item.targetId);
        }
        for (const table of tables)
            next[table.key] = (next[table.key] ?? []).filter((row) => !deletedIds.has(row.id));
        rewriteObjectReferences(next, remap, deletedIds);
    }
    return {
        snapshot: dedupeStrongStateRows(next, tables),
        deletedRowIds: [...new Set(deleted.map((item) => item.id))],
        deletedEntries: deleted,
        retainedRowIds: [...new Set(retained)],
    };
}
/** 幂等迁移：旧 absorbed/retired 先转换为 settling，再按已有覆盖事实进入正常结算。 */
export function garbageCollectLegacyEntryTombstones(snapshot, internalFacts, registry, focusObjectId) {
    const tables = normalizeTableRegistry(registry);
    const hasLegacyRows = tables.some((table) => (snapshot[table.key] ?? []).some((row) => {
        const state = safeText(row.entryLifecycle?.state, 24);
        return state === 'absorbed' || state === 'retired' || Boolean(row.entryLifecycle?.legacyState);
    }));
    // 没有旧墓碑时必须保持引用和序列化内容完全不变；迁移扫描不能顺带重排正常快照。
    if (!hasLegacyRows)
        return { snapshot, deletedRowIds: [] };
    const next = structuredClone(snapshot);
    const factsById = new Map((internalFacts ?? []).map((fact) => [fact.factId, fact]));
    const deleted = new Set();
    for (const table of tables) {
        for (const row of next[table.key] ?? []) {
            const rawState = safeText(row.entryLifecycle?.state, 24);
            const legacyState = row.entryLifecycle?.legacyState || (rawState === 'absorbed' || rawState === 'retired' ? rawState : undefined);
            if (!legacyState)
                continue;
            row.entryLifecycle = normalizeEntryLifecycleValue({ ...row.entryLifecycle, state: legacyState }, row.entryLifecycle);
            if (!row.entryLifecycle || protectedRow(row, focusObjectId))
                continue;
            const rowFacts = stringList(row.factIds, 200, 180).map((id) => factsById.get(id)).filter((fact) => Boolean(fact));
            const allCovered = rowFacts.length > 0 && rowFacts.every((fact) => Boolean(fact.consumedBySmallSummaryId || fact.solidifiedByLargeSummaryId));
            const stillActive = rowFacts.some((fact) => fact.active);
            if (allCovered && !stillActive && targetHasDistribution(next, row))
                deleted.add(row.id);
        }
    }
    if (deleted.size) {
        for (const table of tables)
            next[table.key] = (next[table.key] ?? []).filter((row) => !deleted.has(row.id));
        rewriteObjectReferences(next, new Map(), deleted);
    }
    return { snapshot: dedupeStrongStateRows(next, tables), deletedRowIds: [...deleted] };
}
//# sourceMappingURL=entry-lifecycle.js.map
