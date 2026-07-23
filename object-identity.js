import { safeText } from '../core/utils.js';
import { dedupeStrongStateRows } from './state-text.js';
import { normalizeTableRegistry } from './table-registry.js';
export function canonicalObjectTitle(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .trim()
        .toLocaleLowerCase()
        .replace(/[\s·•._—–\-|｜:：()（）【】\[\]<>《》“”"'`]+/gu, '');
}
function stringArray(value, itemLimit = 500) {
    return Array.isArray(value) ? value.map((item) => safeText(item, itemLimit).trim()).filter(Boolean) : [];
}
function replaceExactValue(value, idRemap, deletedIds) {
    if (typeof value === 'string') {
        const token = value.trim();
        if (idRemap.has(token))
            return idRemap.get(token);
        if (deletedIds.has(token))
            return undefined;
        return value;
    }
    if (Array.isArray(value)) {
        return [...new Set(value
                .map((item) => replaceExactValue(item, idRemap, deletedIds))
                .filter((item) => item !== undefined))];
    }
    return value;
}
/** 精确改写对象 ID 引用；不按标题、正文或子串猜测。 */
export function rewriteObjectReferences(snapshot, idRemap, deletedIds = new Set()) {
    if (!idRemap.size && !deletedIds.size)
        return snapshot;
    for (const rows of Object.values(snapshot)) {
        if (!Array.isArray(rows))
            continue;
        for (const row of rows) {
            if (!row.fields || typeof row.fields !== 'object')
                continue;
            for (const key of ['relatedObjects', 'relatedObjectIds', 'relatedEntities', 'participantIds', 'ownerId', 'holderId', 'hostId']) {
                if (!(key in row.fields))
                    continue;
                const replaced = replaceExactValue(row.fields[key], idRemap, deletedIds);
                if (replaced === undefined)
                    delete row.fields[key];
                else
                    row.fields[key] = replaced;
            }
        }
    }
    return snapshot;
}
function preserveAnchoredTitle(existing, incoming) {
    const incomingTitle = safeText(incoming.title, 240).trim();
    const anchoredTitle = safeText(existing.title, 240).trim() || incomingTitle;
    const alias = incomingTitle && canonicalObjectTitle(incomingTitle) !== canonicalObjectTitle(anchoredTitle) ? incomingTitle : '';
    return {
        ...incoming,
        id: existing.id,
        title: anchoredTitle,
        keywords: [...new Set([...(existing.keywords ?? []), ...(incoming.keywords ?? []), ...(alias ? [alias] : [])])].slice(0, 24),
        recall: {
            any: [...new Set([...(existing.recall?.any ?? []), ...(incoming.recall?.any ?? []), ...(alias ? [alias] : [])])].slice(0, 32),
            all: [...new Set([...(existing.recall?.all ?? []), ...(incoming.recall?.all ?? [])])].slice(0, 20),
            exclude: [...new Set([...(existing.recall?.exclude ?? []), ...(incoming.recall?.exclude ?? [])])].slice(0, 20),
        },
    };
}
function mergeRowsByIdentity(existing, incoming) {
    const fields = { ...(existing.fields ?? {}) };
    for (const [key, value] of Object.entries(incoming.fields ?? {})) {
        if (Array.isArray(value))
            fields[key] = [...new Set([...stringArray(fields[key]), ...stringArray(value)])];
        else if (safeText(value, 4000).trim())
            fields[key] = structuredClone(value);
    }
    return preserveAnchoredTitle(existing, {
        ...existing,
        ...incoming,
        id: existing.id,
        content: incoming.content || existing.content,
        keywords: [...new Set([...(existing.keywords ?? []), ...(incoming.keywords ?? [])])],
        factIds: [...new Set([...(existing.factIds ?? []), ...(incoming.factIds ?? [])])],
        eventId: incoming.eventId || existing.eventId,
        eventIds: [...new Set([
                ...(existing.eventIds ?? (existing.eventId ? [existing.eventId] : [])),
                ...(incoming.eventIds ?? (incoming.eventId ? [incoming.eventId] : [])),
            ])],
        fields,
        source: existing.source === 'manual' || incoming.source === 'manual' ? 'manual' : 'auto',
        locked: Boolean(existing.locked || incoming.locked),
        lockMode: existing.lockMode === 'all' || incoming.lockMode === 'all'
            ? 'all'
            : existing.lockMode === 'base' || incoming.lockMode === 'base'
                ? 'base'
                : undefined,
        entryLifecycle: incoming.entryLifecycle ?? existing.entryLifecycle,
        baseRevisionEvidence: incoming.baseRevisionEvidence ?? existing.baseRevisionEvidence,
    });
}
/**
 * 将模型本轮补丁重新绑定到唯一化后的稳定对象。
 * 只使用确定性唯一键；避免补丁仍携带临时 ID，导致后续生命周期阶段漏掉本轮触及行。
 */
export function alignPatchRowsToCanonicalSnapshot(patchSnapshot, canonicalSnapshot, idRemap, registry) {
    const tables = normalizeTableRegistry(registry);
    const next = {};
    let alignedRowCount = 0;
    const eventIds = (row) => [...new Set([...(row.eventIds ?? []), row.eventId].map((item) => String(item || '').trim()).filter(Boolean))];
    for (const table of tables) {
        const canonicalRows = canonicalSnapshot[table.key] ?? [];
        const rows = structuredClone(patchSnapshot?.[table.key] ?? []);
        const byId = new Map(canonicalRows.map((row) => [row.id, row]));
        const byTitle = new Map();
        const byEvent = new Map();
        const byFact = new Map();
        for (const row of canonicalRows) {
            const title = canonicalObjectTitle(row.title);
            if (title)
                byTitle.set(title, [...(byTitle.get(title) ?? []), row]);
            for (const eventId of eventIds(row))
                byEvent.set(eventId, [...(byEvent.get(eventId) ?? []), row]);
            for (const factId of new Set(row.factIds ?? []))
                byFact.set(factId, [...(byFact.get(factId) ?? []), row]);
        }
        for (const row of rows) {
            const originalId = String(row.id || '').trim();
            const remappedId = idRemap.get(originalId);
            let matched = (remappedId && byId.get(remappedId)) || byId.get(originalId);
            if (!matched) {
                const candidates = new Set();
                const title = canonicalObjectTitle(row.title);
                if (title && byTitle.get(title)?.length === 1)
                    candidates.add(byTitle.get(title)[0]);
                for (const eventId of eventIds(row))
                    if (byEvent.get(eventId)?.length === 1)
                        candidates.add(byEvent.get(eventId)[0]);
                for (const factId of new Set(row.factIds ?? []))
                    if (byFact.get(factId)?.length === 1)
                        candidates.add(byFact.get(factId)[0]);
                if (candidates.size === 1)
                    matched = [...candidates][0];
            }
            if (matched && row.id !== matched.id) {
                row.id = matched.id;
                alignedRowCount += 1;
            }
        }
        if (rows.length)
            next[table.key] = rows;
    }
    return { patchSnapshot: next, alignedRowCount };
}
/**
 * 根据已有稳定 ID、唯一 event_id、唯一规范标题和唯一 fact_id 继承对象身份。
 * 所有匹配都要求在当前表中唯一，不做模糊语义猜测。
 */
export function canonicalizeObjectIdentities(previous, incoming, registry) {
    const tables = normalizeTableRegistry(registry);
    const next = dedupeStrongStateRows(incoming, tables);
    const old = dedupeStrongStateRows(previous, tables);
    const idRemap = new Map();
    for (const table of tables) {
        const oldRows = old[table.key] ?? [];
        const newRows = next[table.key] ?? [];
        const oldById = new Map(oldRows.map((row) => [row.id, row]));
        const oldByEvent = new Map();
        const oldByTitle = new Map();
        const oldByFact = new Map();
        const newEventCounts = new Map();
        const newTitleCounts = new Map();
        const newFactCounts = new Map();
        const eventIds = (row) => [...new Set([...(row.eventIds ?? []), row.eventId].map((item) => String(item || '').trim()).filter(Boolean))];
        for (const row of newRows) {
            for (const eventId of eventIds(row))
                newEventCounts.set(eventId, (newEventCounts.get(eventId) ?? 0) + 1);
            const title = canonicalObjectTitle(row.title);
            if (title)
                newTitleCounts.set(title, (newTitleCounts.get(title) ?? 0) + 1);
            for (const factId of new Set(row.factIds ?? []))
                newFactCounts.set(factId, (newFactCounts.get(factId) ?? 0) + 1);
        }
        for (const row of oldRows) {
            for (const eventId of eventIds(row))
                oldByEvent.set(eventId, [...(oldByEvent.get(eventId) ?? []), row]);
            const title = canonicalObjectTitle(row.title);
            if (title)
                oldByTitle.set(title, [...(oldByTitle.get(title) ?? []), row]);
            for (const factId of new Set(row.factIds ?? []))
                oldByFact.set(factId, [...(oldByFact.get(factId) ?? []), row]);
        }
        const claimed = new Set();
        const uniqueUnclaimed = (rows) => rows?.length === 1 && !claimed.has(rows[0].id) ? rows[0] : undefined;
        for (const row of newRows) {
            let matched = oldById.get(row.id);
            if (matched && claimed.has(matched.id))
                matched = undefined;
            if (!matched) {
                const candidates = new Set();
                for (const eventId of eventIds(row)) {
                    if (newEventCounts.get(eventId) !== 1)
                        continue;
                    const candidate = uniqueUnclaimed(oldByEvent.get(eventId));
                    if (candidate)
                        candidates.add(candidate);
                }
                if (candidates.size === 1)
                    matched = [...candidates][0];
            }
            const title = canonicalObjectTitle(row.title);
            if (!matched && title && newTitleCounts.get(title) === 1)
                matched = uniqueUnclaimed(oldByTitle.get(title));
            if (!matched) {
                const candidates = new Set();
                for (const factId of new Set(row.factIds ?? [])) {
                    if (newFactCounts.get(factId) !== 1)
                        continue;
                    const candidate = uniqueUnclaimed(oldByFact.get(factId));
                    if (candidate)
                        candidates.add(candidate);
                }
                if (candidates.size === 1)
                    matched = [...candidates][0];
            }
            if (!matched)
                continue;
            const replacedId = row.id;
            Object.assign(row, preserveAnchoredTitle(matched, row));
            if (replacedId && replacedId !== matched.id)
                idRemap.set(replacedId, matched.id);
            claimed.add(matched.id);
        }
        const merged = new Map();
        for (const row of newRows) {
            const current = merged.get(row.id);
            merged.set(row.id, current ? mergeRowsByIdentity(current, row) : row);
        }
        next[table.key] = [...merged.values()];
    }
    rewriteObjectReferences(next, idRemap);
    return { snapshot: dedupeStrongStateRows(next, tables), idRemap };
}
