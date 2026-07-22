import { makeId, nowIso, safeText } from './core-utils.js';
function stringList(value, limit = 60, itemLimit = 600) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => safeText(item, itemLimit).trim()).filter(Boolean))].slice(0, limit);
}
function normalizeActivityUpdates(value) {
    if (!Array.isArray(value))
        return [];
    const allowed = new Set(['休眠', '长期休眠', '已归档']);
    return value.map((item) => item && typeof item === 'object' ? item : {}).map((item) => ({
        rowId: safeText(item.rowId, 160).trim(), activity: safeText(item.activity, 40).trim(), reason: safeText(item.reason, 500).trim(),
    })).filter((item) => item.rowId && allowed.has(item.activity)).slice(0, 30);
}
function normalizeSedimentation(value) {
    if (!value || typeof value !== 'object')
        return undefined;
    const source = value;
    return {
        removeRowIds: stringList(source.removeRowIds, 50, 160),
        characterActivityUpdates: normalizeActivityUpdates(source.characterActivityUpdates),
        notes: stringList(source.notes, 30, 500),
        appliedRowIds: stringList(source.appliedRowIds, 80, 160),
        ignoredRowIds: stringList(source.ignoredRowIds, 80, 160),
    };
}
export function normalizeSummary(value, kind, sourceKeys, previousLargeSummaryId, metadata = {}) {
    return {
        id: makeId(kind),
        kind,
        title: safeText(value.title || (kind === 'small' ? '事件线小总结' : '长期因果总结'), 240).trim(),
        summary: safeText(value.summary || '', 30000).trim(),
        keywords: stringList(value.keywords, 32, 100),
        sourceKeys: [...new Set(sourceKeys)],
        sourceFactIds: metadata.sourceFactIds ? [...new Set(metadata.sourceFactIds)] : (kind === 'small' ? [...new Set(sourceKeys)] : undefined),
        sourceSummaryIds: kind === 'large' ? [...new Set(metadata.sourceSummaryIds ?? sourceKeys)] : undefined,
        eventId: safeText(metadata.eventId || value.event_id || value.eventId, 160).trim() || undefined,
        eventIds: kind === 'large' ? [...new Set(metadata.eventIds ?? (metadata.eventId ? [metadata.eventId] : []))] : undefined,
        unresolvedItems: stringList(value.unresolved ?? value.unresolvedItems, 40, 1000),
        createdAt: nowIso(),
        // 兼容字段现在只保存统一状态机的结算报告，不再反向修改快照。
        sedimentation: normalizeSedimentation(value.sedimentation),
        previousLargeSummaryId: kind === 'large' ? previousLargeSummaryId : undefined,
    };
}
