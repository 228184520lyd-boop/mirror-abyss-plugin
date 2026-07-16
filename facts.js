import { hashText, nowIso, safeText } from '../core/utils.js';
const FACT_TYPES = new Set([
    'focus', 'spacetime', 'character', 'relationship', 'item', 'skill',
    'event', 'region', 'foundation', 'historical', 'trace',
]);
const OPERATIONS = new Set(['create', 'update', 'append', 'close', 'supersede', 'delete']);
const CONFIDENCE = new Set(['confirmed', 'recorded', 'reported', 'uncertain']);
function list(value, limit = 16) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => safeText(item, 80).trim()).filter(Boolean))].slice(0, limit);
}
export function normalizeFacts(value) {
    if (!Array.isArray(value))
        return [];
    return value.map((item) => item && typeof item === 'object' ? item : {})
        .map((item, index) => {
        const type = safeText(item.type, 40).trim();
        const operation = safeText(item.operation, 40).trim();
        const confidence = safeText(item.confidence, 40).trim();
        const entityId = safeText(item.entityId, 160).trim();
        const title = safeText(item.title, 240).trim();
        const content = safeText(item.content, 4000).trim();
        return {
            id: safeText(item.id, 160).trim() || `fact_${hashText(`${entityId}|${title}|${content}|${index}`)}`,
            type: FACT_TYPES.has(type) ? type : 'event',
            entityId: entityId || `entity_${hashText(`${title}|${content}`)}`,
            title: title || `事实 ${index + 1}`,
            content,
            status: safeText(item.status, 120).trim() || 'active',
            keywords: list(item.keywords),
            operation: OPERATIONS.has(operation) ? operation : 'update',
            confidence: CONFIDENCE.has(confidence) ? confidence : 'uncertain',
        };
    })
        .filter((fact) => fact.content)
        .slice(0, 40);
}
export function normalizeFactPackage(value, sourceMessageKey) {
    return {
        schemaVersion: 1,
        sourceMessageKey,
        turnSummary: safeText(value.turnSummary, 4000).trim(),
        facts: normalizeFacts(value.facts),
        createdAt: nowIso(),
    };
}
