/**
 * 模块职责：维护与可见表格数量无关的聊天级内部事实层。
 * 维护边界：表格删除、停用或重命名不得删除这里的事件线、消费标记或历史来源。
 */
import { hashText, nowIso, safeText } from '../core/utils.js';
const CONFIDENCE = new Set(['confirmed', 'recorded', 'reported', 'uncertain']);
function stringList(value, limit = 40, itemLimit = 500) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => safeText(item, itemLimit).trim()).filter(Boolean))].slice(0, limit);
}
function timeRange(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        start: safeText(source.start, 120).trim() || undefined,
        end: safeText(source.end, 120).trim() || undefined,
        label: safeText(source.label, 240).trim() || undefined,
    };
}
function eventIdFor(source, factId) {
    const explicit = safeText(source.eventId ?? source.event_id, 160).trim();
    if (explicit)
        return explicit;
    const entity = safeText(source.entityId ?? source.entity_id, 160).trim();
    const type = safeText(source.type, 80).trim();
    if (type === 'event' && entity)
        return entity;
    return `event_${hashText(`${entity}|${source.title}|${factId}`)}`;
}
export function normalizeInternalFact(value, sourceMessageId = '', index = 0) {
    const source = value && typeof value === 'object' ? value : {};
    const content = safeText(source.content, 6000).trim();
    const occurred = stringList(source.occurredFacts ?? source.occurred ?? (content ? [content] : []), 30, 1000);
    if (!content && !occurred.length)
        return null;
    const title = safeText(source.title, 240).trim() || `事实 ${index + 1}`;
    const explicitFactId = safeText(source.factId ?? source.fact_id ?? source.id, 160).trim();
    const factId = explicitFactId || `fact_${hashText(`${title}|${content}|${index}`)}`;
    const status = safeText(source.status, 160).trim() || 'active';
    const confidenceText = safeText(source.confidence, 40).trim();
    const sourceIds = stringList(source.sourceMessageIds ?? source.source_message_ids, 40, 200);
    if (sourceMessageId && !sourceIds.includes(sourceMessageId))
        sourceIds.push(sourceMessageId);
    return {
        factId,
        eventId: eventIdFor(source, factId),
        sourceMessageIds: sourceIds,
        pendingSourceMessageIds: stringList(source.pendingSourceMessageIds ?? source.pending_source_message_ids, 40, 200),
        occurredFacts: occurred,
        unresolvedItems: stringList(source.unresolvedItems ?? source.unresolved ?? source.openItems, 30, 1000),
        status,
        timeRange: timeRange(source.timeRange ?? source.time_range),
        relatedEntities: stringList(source.relatedEntities ?? source.related_entities, 30, 240),
        title,
        content: content || occurred.join('；'),
        type: safeText(source.type, 80).trim() || 'event',
        keywords: stringList(source.keywords, 24, 100),
        confidence: CONFIDENCE.has(confidenceText) ? confidenceText : 'uncertain',
        active: source.active !== false && !/(closed|resolved|ended|archived|结束|已解决|已关闭|已归档)/i.test(status),
        supersededByFactId: safeText(source.supersededByFactId ?? source.superseded_by_fact_id, 160).trim() || undefined,
        consumedBySmallSummaryId: safeText(source.consumedBySmallSummaryId, 160).trim() || undefined,
        solidifiedByLargeSummaryId: safeText(source.solidifiedByLargeSummaryId, 160).trim() || undefined,
        createdAt: safeText(source.createdAt, 80).trim() || nowIso(),
        updatedAt: safeText(source.updatedAt, 80).trim() || nowIso(),
    };
}
export function normalizeInternalFacts(value, sourceMessageId = '') {
    if (!Array.isArray(value))
        return [];
    const output = [];
    const seen = new Set();
    value.forEach((item, index) => {
        const normalized = normalizeInternalFact(item, sourceMessageId, index);
        if (!normalized)
            return;
        if (seen.has(normalized.factId)) {
            normalized.factId = `${normalized.factId}_${index + 1}`;
        }
        if (!normalized.pendingSourceMessageIds?.length && !normalized.consumedBySmallSummaryId) {
            normalized.pendingSourceMessageIds = [...normalized.sourceMessageIds];
        }
        seen.add(normalized.factId);
        output.push(normalized);
    });
    return output.slice(0, 2000);
}
function mergeList(left, right, limit = 60) {
    return [...new Set([...left, ...right].map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}
function mergeTimeRange(previous, next) {
    return {
        start: next.start || previous.start,
        end: next.end || previous.end,
        label: next.label || previous.label,
    };
}
function semanticFingerprint(fact) {
    return JSON.stringify({
        eventId: fact.eventId,
        occurredFacts: fact.occurredFacts,
        unresolvedItems: fact.unresolvedItems,
        status: fact.status,
        timeRange: fact.timeRange,
        relatedEntities: fact.relatedEntities,
        title: fact.title,
        content: fact.content,
        type: fact.type,
        keywords: fact.keywords,
        confidence: fact.confidence,
        active: fact.active,
        supersededByFactId: fact.supersededByFactId,
    });
}
/** 合并本轮事实操作；close/supersede 只改变事实状态，不删除历史来源。 */
export function mergeInternalFacts(existing, incoming, rawFacts = []) {
    const output = existing.map((fact) => ({
        ...fact,
        sourceMessageIds: [...fact.sourceMessageIds],
        pendingSourceMessageIds: [...(fact.pendingSourceMessageIds ?? (fact.consumedBySmallSummaryId ? [] : fact.sourceMessageIds))],
        occurredFacts: [...fact.occurredFacts],
        unresolvedItems: [...fact.unresolvedItems],
        relatedEntities: [...fact.relatedEntities],
        keywords: [...fact.keywords],
        timeRange: { ...fact.timeRange },
    }));
    const byId = new Map(output.map((fact, index) => [fact.factId, index]));
    const rawById = new Map(rawFacts.map((fact) => [fact.factId || fact.id, fact]));
    for (const next of incoming) {
        const index = byId.get(next.factId);
        if (index === undefined) {
            next.pendingSourceMessageIds = [...new Set(next.pendingSourceMessageIds?.length ? next.pendingSourceMessageIds : next.sourceMessageIds)];
            byId.set(next.factId, output.length);
            output.push(next);
            continue;
        }
        const previous = output[index];
        const raw = rawById.get(next.factId);
        const operation = raw?.operation ?? 'update';
        const unresolved = operation === 'close' ? [] : operation === 'append'
            ? mergeList(previous.unresolvedItems, next.unresolvedItems)
            : next.unresolvedItems.length ? next.unresolvedItems : previous.unresolvedItems;
        const merged = {
            ...previous,
            ...next,
            sourceMessageIds: mergeList(previous.sourceMessageIds, next.sourceMessageIds),
            pendingSourceMessageIds: [...(previous.pendingSourceMessageIds ?? [])],
            occurredFacts: mergeList(previous.occurredFacts, next.occurredFacts),
            unresolvedItems: unresolved,
            relatedEntities: mergeList(previous.relatedEntities, next.relatedEntities),
            keywords: mergeList(previous.keywords, next.keywords),
            timeRange: mergeTimeRange(previous.timeRange, next.timeRange),
            active: operation === 'close' || operation === 'supersede' ? false : next.active,
            supersededByFactId: operation === 'supersede' ? (next.supersededByFactId || previous.supersededByFactId) : previous.supersededByFactId,
            consumedBySmallSummaryId: previous.consumedBySmallSummaryId,
            solidifiedByLargeSummaryId: previous.solidifiedByLargeSummaryId,
            createdAt: previous.createdAt,
            updatedAt: nowIso(),
        };
        if (semanticFingerprint(merged) !== semanticFingerprint(previous)) {
            // 同一 fact_id 出现新的已发生内容、未决变化或关闭结果时，必须重新进入该 event_id 的小总结。
            delete merged.consumedBySmallSummaryId;
            delete merged.solidifiedByLargeSummaryId;
            merged.pendingSourceMessageIds = mergeList(previous.pendingSourceMessageIds ?? [], next.sourceMessageIds);
        }
        output[index] = merged;
    }
    return output.slice(-2000);
}
export function pendingFactsByEvent(facts) {
    const groups = new Map();
    for (const fact of facts) {
        if (fact.consumedBySmallSummaryId)
            continue;
        const list = groups.get(fact.eventId) ?? [];
        list.push(fact);
        groups.set(fact.eventId, list);
    }
    return groups;
}
export function markFactsConsumed(facts, factIds, summaryId) {
    const selected = new Set(factIds);
    for (const fact of facts) {
        if (!selected.has(fact.factId))
            continue;
        fact.consumedBySmallSummaryId = summaryId;
        fact.pendingSourceMessageIds = [];
    }
}
export function markFactsSolidified(facts, factIds, largeSummaryId) {
    const selected = new Set(factIds);
    for (const fact of facts)
        if (selected.has(fact.factId))
            fact.solidifiedByLargeSummaryId = largeSummaryId;
}
export function migrateLegacyConsumption(facts, smallSummaries, largeSummaries) {
    for (const summary of smallSummaries) {
        const directFactIds = new Set(summary.sourceFactIds ?? []);
        for (const fact of facts) {
            if (directFactIds.has(fact.factId) || summary.sourceKeys.includes(fact.factId) || fact.sourceMessageIds.some((id) => summary.sourceKeys.includes(id))) {
                fact.consumedBySmallSummaryId ||= summary.id;
            }
        }
    }
    const largeBySmall = new Map();
    for (const large of largeSummaries)
        for (const smallId of large.sourceSummaryIds ?? large.sourceKeys)
            largeBySmall.set(smallId, large.id);
    for (const small of smallSummaries) {
        const largeId = small.solidifiedByLargeSummaryId || largeBySmall.get(small.id);
        if (!largeId)
            continue;
        small.solidifiedByLargeSummaryId = largeId;
        for (const fact of facts)
            if (fact.consumedBySmallSummaryId === small.id)
                fact.solidifiedByLargeSummaryId ||= largeId;
    }
}
export function invalidateFactsAfterMessages(facts, validMessageIds) {
    const removedFactIds = new Set();
    const kept = facts.filter((fact) => {
        const valid = fact.sourceMessageIds.length > 0 && fact.sourceMessageIds.every((id) => validMessageIds.has(id));
        if (!valid)
            removedFactIds.add(fact.factId);
        return valid;
    });
    return { facts: kept, removedFactIds };
}
//# sourceMappingURL=internal-facts.js.map