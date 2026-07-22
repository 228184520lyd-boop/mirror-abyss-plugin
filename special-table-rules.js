import { safeText } from '../core/utils.js';
import { isEntryLifecycleHidden } from './entry-lifecycle.js';
import { rewriteObjectReferences } from './object-identity.js';
import { normalizeTableRegistry, tableByRole } from './table-registry.js';
function stringArray(value) {
    return Array.isArray(value) ? value.map((item) => safeText(item, 500).trim()).filter(Boolean) : [];
}
export function isHistoricalSceneRow(row) {
    return isEntryLifecycleHidden(row)
        || /(已离开|离开场景|历史场景|过去场景|非当前|已结束|已关闭|已归档|inactive|closed|ended|archived)/i.test(`${row.status} ${row.content}`);
}
/**
 * 每个聊天只保留一个当前时空条目，固定 ID 为 spacetime_current。
 * 旧重复行只合并明确结构字段，不推测缺失事实。
 */
export function enforceSpacetimeSingleton(snapshot, registry) {
    const tables = normalizeTableRegistry(registry);
    const spacetimeKey = tableByRole(tables, 'spacetime', false)?.key;
    if (!spacetimeKey)
        return { snapshot, idRemap: new Map(), mergedRowIds: [] };
    const rows = snapshot[spacetimeKey] ?? [];
    if (!rows.length)
        return { snapshot, idRemap: new Map(), mergedRowIds: [] };
    const active = rows.filter((row) => !isHistoricalSceneRow(row));
    const candidates = active.length ? active : rows;
    const selectedSource = candidates.map((row, index) => ({ row, index })).reduce((current, candidate) => {
        const currentTime = Date.parse(current.row.updatedAt || '') || 0;
        const candidateTime = Date.parse(candidate.row.updatedAt || '') || 0;
        return candidateTime > currentTime || (candidateTime === currentTime && candidate.index > current.index) ? candidate : current;
    }).row;
    const selected = structuredClone(selectedSource);
    const mergeListField = (key, limit = 60) => [...new Set(rows.flatMap((row) => stringArray(row.fields?.[key])))].slice(-limit);
    selected.id = 'spacetime_current';
    selected.semanticRole = 'spacetime';
    selected.keywords = [...new Set([selected.title, ...(selected.keywords ?? [])].filter(Boolean))].slice(0, 24);
    selected.factIds = [...new Set(rows.flatMap((row) => row.factIds ?? []))].slice(0, 80);
    selected.eventIds = [...new Set(rows.flatMap((row) => row.eventIds ?? (row.eventId ? [row.eventId] : [])))].slice(0, 80);
    selected.eventId = selected.eventId || selected.eventIds[0];
    selected.fields ||= {};
    for (const key of ['recentHistory', 'solidifiedHistory', 'relatedObjects', 'relatedEvents']) {
        const merged = mergeListField(key, key.includes('History') ? 40 : 80);
        if (merged.length)
            selected.fields[key] = merged;
    }
    const idRemap = new Map(rows
        .map((row) => [row.id, selected.id])
        .filter(([oldId]) => oldId && oldId !== selected.id));
    const mergedRowIds = rows.map((row) => row.id).filter((id) => id !== selected.id);
    snapshot[spacetimeKey] = [selected];
    rewriteObjectReferences(snapshot, idRemap);
    return { snapshot, idRemap, mergedRowIds };
}
//# sourceMappingURL=special-table-rules.js.map