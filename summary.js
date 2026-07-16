import { makeId, nowIso, safeText } from '../core/utils.js';
function stringList(value, limit = 40, itemLimit = 300) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => safeText(item, itemLimit).trim()).filter(Boolean))].slice(0, limit);
}
function normalizeActivityUpdates(value) {
    if (!Array.isArray(value))
        return [];
    const allowed = new Set(['休眠', '长期休眠', '已归档']);
    return value
        .map((item) => item && typeof item === 'object' ? item : {})
        .map((item) => ({
        rowId: safeText(item.rowId, 160).trim(),
        activity: safeText(item.activity, 40).trim(),
        reason: safeText(item.reason, 500).trim(),
    }))
        .filter((item) => item.rowId && allowed.has(item.activity))
        .slice(0, 30);
}
function normalizeSedimentation(value) {
    if (!value || typeof value !== 'object')
        return undefined;
    const source = value;
    return {
        removeRowIds: stringList(source.removeRowIds, 50, 160),
        characterActivityUpdates: normalizeActivityUpdates(source.characterActivityUpdates),
        notes: stringList(source.notes, 30, 500),
    };
}
export function normalizeSummary(value, kind, sourceKeys, previousLargeSummaryId) {
    return {
        id: makeId(kind),
        kind,
        title: safeText(value.title || (kind === 'small' ? '阶段沉降' : '长期沉降'), 240).trim(),
        summary: safeText(value.summary || '', 30000).trim(),
        keywords: Array.isArray(value.keywords)
            ? [...new Set(value.keywords.map((item) => safeText(item, 80).trim()).filter(Boolean))].slice(0, 24)
            : [],
        sourceKeys,
        createdAt: nowIso(),
        sedimentation: kind === 'small' ? normalizeSedimentation(value.sedimentation) : undefined,
        previousLargeSummaryId: kind === 'large' ? previousLargeSummaryId : undefined,
    };
}
