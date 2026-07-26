/* Generated from src/features/processing/reducer.ts for esm.sh — do not edit dist directly. */
import { DEFAULT_TABLE_KEYS } from '../../constants.js';
import { hashText, normalizedIdentity } from '../../shared/hash.js';
export function ensureMessageRecord(document, input) {
    const existing = document.messages[input.messageKey];
    if (existing && existing.visibleContentHash === input.contentHash) {
        existing.messageIndex = input.messageIndex;
        return existing;
    }
    // FACT-CONTENT-003：若修正文已写入 SillyTavern、但 appliedContentHash 的 metadata 保存失败，
    // 用已持久化候选正文与当前可见正文对照恢复，不重新调用审核或修正模型。
    const revisionResult = existing?.stages.revision?.result;
    if (existing && revisionResult && typeof revisionResult === 'object') {
        const revisedText = 'text' in revisionResult && typeof revisionResult.text === 'string'
            ? revisionResult.text
            : '';
        if (revisedText && hashText(revisedText) === input.contentHash) {
            existing.messageIndex = input.messageIndex;
            existing.visibleContentHash = input.contentHash;
            const revisionStage = existing.stages.revision;
            if (!revisionStage)
                return existing;
            existing.stages.revision = {
                inputHash: revisionStage.inputHash,
                ...(revisionStage.completedAt !== undefined ? { completedAt: revisionStage.completedAt } : {}),
                ...(revisionStage.error !== undefined ? { error: revisionStage.error } : {}),
                result: { ...revisionResult, appliedContentHash: input.contentHash },
            };
            return existing;
        }
    }
    const record = {
        messageKey: input.messageKey,
        messageIndex: input.messageIndex,
        sourceText: input.text,
        sourceContentHash: input.contentHash,
        visibleContentHash: input.contentHash,
        stages: {},
    };
    document.messages[input.messageKey] = record;
    return record;
}
/**
 * FACT-DATA-004 / FACT-DATA-006：事实 ID 确定；重处理同一消息时替换该消息的事实贡献，
 * 九张表随后由完整事实账本重新投影，禁止新旧正文事实叠加。
 */
export function applyExtraction(document, messageKey, result, now = Date.now()) {
    for (const [factId, fact] of Object.entries(document.facts)) {
        if (fact.sourceMessageKey === messageKey)
            delete document.facts[factId];
    }
    for (const fact of result.facts) {
        const objectToken = normalizedIdentity(fact.objectName) || hashText(fact.objectName);
        const objectId = fact.tableKey === 'spacetime' ? 'spacetime:current' : `${fact.tableKey}:${hashText(objectToken)}`;
        const factId = `fact:${hashText([messageKey, fact.eventName, fact.tableKey, objectToken, fact.semanticLayer, fact.fact].join('|'))}`;
        document.facts[factId] = {
            id: factId,
            tableKey: fact.tableKey,
            objectId,
            sourceMessageKey: messageKey,
            value: structuredClone(fact),
            updatedAt: now,
        };
    }
    rebuildTablesFromFacts(document);
    document.lastTurnSummary = result.turnSummary;
}
/** 仅事实账本驱动模型行；人工行和锁定行原样保留。 */
export function rebuildTablesFromFacts(document) {
    const tableKeys = new Set([...DEFAULT_TABLE_KEYS, ...Object.keys(document.tables)]);
    const nextTables = {};
    for (const key of tableKeys) {
        nextTables[key] = (document.tables[key] ?? [])
            .filter((row) => row.source !== 'model' || row.locked === true)
            .map((row) => structuredClone(row));
    }
    const facts = Object.values(document.facts).sort((left, right) => left.updatedAt - right.updatedAt || left.id.localeCompare(right.id));
    for (const factRecord of facts) {
        const fact = readExtractedFact(factRecord);
        if (!fact)
            continue;
        const rows = (nextTables[fact.tableKey] ??= []);
        const existing = rows.find((row) => row.id === factRecord.objectId);
        if (existing && (existing.locked === true || existing.source !== 'model'))
            continue;
        const incoming = {
            id: factRecord.objectId,
            title: fact.objectName,
            content: fact.fact,
            status: 'current',
            keywords: unique([fact.objectName, fact.eventName]),
            fields: { [fact.semanticLayer || '现行事实']: [fact.fact] },
            factIds: [factRecord.id],
            source: 'model',
            locked: false,
            updatedAt: factRecord.updatedAt,
        };
        const merged = mergeRow(existing, incoming);
        if (existing)
            Object.assign(existing, merged);
        else
            rows.push(merged);
    }
    document.tables = nextTables;
}
function readExtractedFact(record) {
    const value = record.value;
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const candidate = value;
    const eventName = typeof candidate.eventName === 'string' ? candidate.eventName : '';
    const tableKey = typeof candidate.tableKey === 'string' ? candidate.tableKey : '';
    const objectName = typeof candidate.objectName === 'string' ? candidate.objectName : '';
    const semanticLayer = typeof candidate.semanticLayer === 'string' ? candidate.semanticLayer : '';
    const fact = typeof candidate.fact === 'string' ? candidate.fact : '';
    return tableKey && objectName && fact ? { eventName, tableKey, objectName, semanticLayer, fact } : null;
}
function mergeRow(existing, incoming) {
    if (!existing)
        return incoming;
    const fields = { ...(existing.fields ?? {}) };
    for (const [key, value] of Object.entries(incoming.fields ?? {})) {
        fields[key] = unique([
            ...(Array.isArray(fields[key]) ? fields[key] : []),
            ...(Array.isArray(value) ? value.map(String) : [String(value)]),
        ]);
    }
    return {
        ...existing,
        ...incoming,
        keywords: unique([
            ...(Array.isArray(existing.keywords) ? existing.keywords.map(String) : []),
            ...incoming.keywords,
        ]),
        factIds: unique([
            ...(Array.isArray(existing.factIds) ? existing.factIds.map(String) : []),
            ...incoming.factIds,
        ]),
        fields,
    };
}
function unique(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
