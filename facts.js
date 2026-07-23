/**
 * 模块职责：归一化模型返回的事实包与事实操作。
 * 维护边界：只整理已显影事实，不在领域层补写隐私、隐藏关系、能力或未来结果。
 */
import { hashText, nowIso, safeText } from '../core/utils.js';
import { isPurePassiveObserverText } from './observer.js';
import { applyFactContractGate } from './fact-contract.js';
const OPERATIONS = new Set(['create', 'update', 'append', 'close', 'supersede']);
const CONFIDENCE = new Set(['confirmed', 'recorded', 'reported', 'uncertain']);
function list(value, limit = 24, itemLimit = 500) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => safeText(item, itemLimit).trim()).filter(Boolean))].slice(0, limit);
}
function normalizeTimeRange(value) {
    const source = value && typeof value === 'object' ? value : {};
    return { start: safeText(source.start, 120).trim() || undefined, end: safeText(source.end, 120).trim() || undefined, label: safeText(source.label, 240).trim() || undefined };
}
function normalizeFactView(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const table = safeText(source.table, 100).trim();
    const rowId = safeText(source.rowId, 160).trim();
    const objectTitle = safeText(source.objectTitle, 240).trim();
    if (!table || !rowId || !objectTitle)
        return undefined;
    const relocation = source.relocation && typeof source.relocation === 'object' ? {
        id: safeText(source.relocation.id, 160).trim(),
        title: safeText(source.relocation.title, 240).trim(),
        fromTable: safeText(source.relocation.fromTable, 100).trim(),
        toTable: safeText(source.relocation.toTable, 100).trim(),
    } : undefined;
    return {
        table,
        rowId,
        objectTitle,
        semanticRole: safeText(source.semanticRole, 80).trim(),
        layerKind: safeText(source.layerKind, 40).trim(),
        layerKey: safeText(source.layerKey, 100).trim() || undefined,
        layerType: safeText(source.layerType, 40).trim() || undefined,
        arrayOperation: safeText(source.arrayOperation, 24).trim() || undefined,
        value: safeText(source.value, 6000).trim(),
        keywords: list(source.keywords, 24, 100),
        eventName: safeText(source.eventName, 240).trim(),
        eventClosed: source.eventClosed === true,
        relatedObjects: list(source.relatedObjects, 40, 240),
        moduleTag: safeText(source.moduleTag, 80).trim(),
        relocation: relocation?.id && relocation.fromTable && relocation.toTable ? relocation : undefined,
        baseRevisionStatement: safeText(source.baseRevisionStatement, 1200).trim() || undefined,
    };
}
export function normalizeFacts(value, options = {}) {
    if (!Array.isArray(value))
        return [];
    return value.map((item) => item && typeof item === 'object' ? item : {})
        .map((item, index) => {
        const operation = safeText(item.operation, 40).trim();
        const confidence = safeText(item.confidence, 40).trim();
        const entityId = safeText(item.entityId ?? item.entity_id, 160).trim();
        const title = safeText(item.title, 240).trim();
        const content = safeText(item.content, 6000).trim();
        const id = safeText(item.factId ?? item.fact_id ?? item.id, 160).trim() || `fact_${hashText(`${entityId}|${title}|${content}|${index}`)}`;
        const occurred = list(item.occurred ?? item.occurredFacts ?? (content ? [content] : []), 30, 1000);
        const unresolved = list(item.unresolved ?? item.unresolvedItems, 30, 1000);
        const view = normalizeFactView(item.view);
        const contract = applyFactContractGate({
            ...item,
            factId: id,
            type: safeText(item.type, 80).trim() || 'fact',
            entityId: entityId || undefined,
            eventId: safeText(item.eventId ?? item.event_id, 160).trim() || undefined,
            title: title || `事实 ${index + 1}`,
            content: content || occurred.join('；'),
            confidence: CONFIDENCE.has(confidence) ? confidence : 'uncertain',
            view,
        }, {
            index,
            sourceMessageId: options.sourceMessageId,
            existingObject: item.admission?.objectQualified === true,
        });
        return {
            id,
            factId: id,
            type: safeText(item.type, 80).trim() || 'fact',
            entityId: entityId || undefined,
            eventId: contract.eventId,
            title: title || `事实 ${index + 1}`,
            content: content || occurred.join('；'),
            occurred,
            unresolved,
            status: safeText(item.status, 120).trim() || 'active',
            timeRange: normalizeTimeRange(item.timeRange ?? item.time_range),
            relatedEntities: list(item.relatedEntities ?? item.related_entities, 30, 240),
            keywords: list(item.keywords, 24, 100),
            operation: OPERATIONS.has(operation) ? operation : 'update',
            confidence: CONFIDENCE.has(confidence) ? confidence : 'uncertain',
            evidenceKind: contract.evidenceKind,
            subjectRef: contract.subjectRef,
            primaryHost: contract.primaryHost,
            facet: contract.facet,
            storageClass: contract.storageClass,
            validFrom: contract.validFrom,
            validTo: contract.validTo,
            supersedesFactId: contract.supersedesFactId,
            supersededByFactId: contract.supersededByFactId,
            projectionHint: contract.projectionHint,
            admission: contract.admission,
            view: contract.view,
        };
    })
        .filter((fact) => fact.content)
        .slice(0, 80);
}
/** 模型即使误报，也不允许纯围观、喝彩、议论及其附属物进入内部活跃事实层。 */
export function filterPassiveObserverFacts(facts) {
    return facts.filter((fact) => {
        const text = [
            fact.type, fact.title, fact.content, fact.status,
            ...(fact.occurred ?? []), ...(fact.unresolved ?? []),
            ...(fact.relatedEntities ?? []), ...fact.keywords,
        ].join(' ');
        return !isPurePassiveObserverText(text);
    });
}
export function normalizeFactPackage(value, sourceMessageKey) {
    return {
        schemaVersion: 3,
        sourceMessageKey,
        turnSummary: safeText(value.turnSummary, 4000).trim(),
        facts: filterPassiveObserverFacts(normalizeFacts(value.facts, { sourceMessageId: sourceMessageKey })),
        createdAt: nowIso(),
    };
}
//# sourceMappingURL=facts.js.map
