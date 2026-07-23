import { enabledTables, normalizeTableRegistry, tableByRole } from './table-registry.js';
import { isEntryParticipationPaused } from './entry-lifecycle.js';
function unique(values, limit = 80) {
    return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, limit);
}
function eventIdsOf(row) {
    return unique([...(row.eventIds ?? []), row.eventId ?? '']);
}
function normalizeEntityReference(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}
function rowReferenceKeys(row) {
    return unique([row.title, ...(row.keywords ?? [])]
        .map(normalizeEntityReference)
        .filter((value) => value.length >= 2));
}
function factClosed(fact) {
    return !fact.active || /已结束|已完成|已关闭|已结算|完成|结束|关闭|closed|completed|ended|settled/i.test(String(fact.status || ''));
}
function rowClosed(row) {
    return Boolean(row && /已结束|已完成|已关闭|已结算|完成|结束|关闭|closed|completed|ended|settled/i.test(`${row.status} ${row.content}`));
}
function summaryEventId(summary) {
    return String(summary.eventId || summary.eventIds?.[0] || '').trim();
}
export function buildEventProfiles(snapshot, facts, smallSummaries, largeSummaries, registry) {
    const tables = normalizeTableRegistry(registry);
    const eventTable = tableByRole(tables, 'events', false);
    const eventRows = eventTable ? (snapshot?.[eventTable.key] ?? []) : [];
    const eventRowById = new Map();
    for (const row of eventRows) {
        eventRowById.set(row.id, row);
        for (const eventId of eventIdsOf(row))
            eventRowById.set(eventId, row);
    }
    const ids = new Set();
    facts.filter((fact) => fact.storageClass !== 'episodic')
        .forEach((fact) => ids.add(String(fact.eventId || '').trim()));
    eventRows.forEach((row) => {
        const linked = eventIdsOf(row);
        (linked.length ? linked : [row.id]).forEach((id) => ids.add(String(id || '').trim()));
    });
    smallSummaries.forEach((summary) => ids.add(summaryEventId(summary)));
    largeSummaries.forEach((summary) => ids.add(summaryEventId(summary)));
    ids.delete('');
    const enabled = enabledTables(tables);
    const profiles = [];
    for (const eventId of ids) {
        const eventFacts = facts.filter((fact) => fact.storageClass !== 'episodic'
            && String(fact.eventId || '').trim() === eventId);
        const eventRow = eventRowById.get(eventId);
        // 新数据优先使用 eventIds；旧存档缺少该元数据时，只使用事实中明确列出的 relatedEntities 做精确回挂。
        // 不扫描正文、不进行模糊推断，避免把同名或背景对象错误接入事件。
        const explicitRelatedKeys = new Set(eventFacts
            .flatMap((fact) => fact.relatedEntities ?? [])
            .map(normalizeEntityReference)
            .filter((value) => value.length >= 2));
        const relatedEntries = [];
        const seenRelatedEntries = new Set();
        for (const table of enabled) {
            for (const row of snapshot?.[table.key] ?? []) {
                const linkedByEventId = eventIdsOf(row).includes(eventId) || row.id === eventId;
                const linkedByExplicitEntity = rowReferenceKeys(row).some((key) => explicitRelatedKeys.has(key));
                if (!linkedByEventId && !linkedByExplicitEntity)
                    continue;
                const relatedKey = `${table.key}:${row.id}`;
                if (seenRelatedEntries.has(relatedKey))
                    continue;
                seenRelatedEntries.add(relatedKey);
                relatedEntries.push({
                    id: row.id,
                    title: row.title,
                    table: table.name,
                    tableKey: table.key,
                    settling: isEntryParticipationPaused(row),
                });
            }
        }
        const small = smallSummaries.filter((summary) => summaryEventId(summary) === eventId && !summary.supersededBySmallSummaryId);
        const large = largeSummaries.filter((summary) => summaryEventId(summary) === eventId);
        const latestFact = [...eventFacts].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
        const latestSummary = [...large, ...small].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
        const updatedAt = [eventRow?.updatedAt, latestFact?.updatedAt, latestSummary?.createdAt].filter(Boolean).sort().at(-1) ?? '';
        const relatedEntities = unique([
            ...eventFacts.flatMap((fact) => fact.relatedEntities ?? []),
            ...relatedEntries.map((entry) => entry.title),
        ], 24);
        const currentResults = unique(eventFacts.flatMap((fact) => fact.occurredFacts ?? []).filter(Boolean), 8);
        const allFactsClosed = eventFacts.length > 0 && eventFacts.every(factClosed);
        const closed = Boolean(eventRow ? rowClosed(eventRow) : allFactsClosed || small.some((summary) => summary.eventClosed));
        profiles.push({
            eventId,
            title: eventRow?.title || latestFact?.title || latestSummary?.title || eventId,
            eventEntryId: eventRow?.id,
            status: closed ? 'closed' : 'active',
            factCount: eventFacts.length,
            messageCount: unique(eventFacts.flatMap((fact) => fact.sourceMessageIds ?? []), 10000).length,
            relatedEntities,
            relatedEntries,
            smallSummaryCount: small.length,
            hasLargeSummary: large.length > 0,
            settlingEntryCount: relatedEntries.filter((entry) => entry.settling).length,
            contentChars: eventFacts.reduce((sum, fact) => sum + (fact.occurredFacts ?? []).join('').length + String(fact.content || '').length, 0)
                + small.reduce((sum, summary) => sum + summary.summary.length, 0)
                + large.reduce((sum, summary) => sum + summary.summary.length, 0),
            updatedAt,
            currentResults,
        });
    }
    return profiles.sort((a, b) => {
        if (a.status !== b.status)
            return a.status === 'active' ? -1 : 1;
        return String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.title.localeCompare(b.title);
    });
}
//# sourceMappingURL=event-profile.js.map
