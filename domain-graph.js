import { DEFAULT_TABLE_REGISTRY, enabledTables, normalizeTableRegistry } from './domain-table-registry.js';
import { isEntryLifecycleHidden } from './domain-entry-lifecycle.js';
function nodeTypeFor(role) {
    if (role === 'characters' || role === 'state')
        return 'character';
    if (role === 'items' || role === 'skills')
        return 'item';
    if (role === 'events')
        return 'event';
    if (role === 'regions' || role === 'scenes' || role === 'spacetime' || role === 'globalChanges')
        return 'region';
    return null;
}
function compactLabel(value) {
    const text = String(value || '').trim();
    return text.length > 24 ? `${text.slice(0, 23)}…` : text;
}
function stringList(value) {
    return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}
function normalizeReference(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}
function rowAliases(row) {
    return [...new Set([row.title, ...(row.keywords ?? [])]
            .map(normalizeReference)
            .filter((value) => value.length >= 2))];
}
function relationText(row) {
    const fields = row.fields ?? {};
    return [row.title, row.content, row.status, ...row.keywords, ...stringList(fields.relationshipStates)]
        .join(' ')
        .toLowerCase();
}
function uniquePairKey(a, b, kind) {
    const [left, right] = [a, b].sort();
    return `${left}|${right}|${kind}`;
}
function referenceMatches(reference, aliases) {
    const normalized = normalizeReference(reference);
    if (!normalized)
        return false;
    return aliases.some((alias) => normalized === alias || normalized.includes(alias) || alias.includes(normalized));
}
function relationshipLineFor(row, aliases) {
    return stringList(row.fields?.relationshipStates)
        .find((line) => aliases.some((alias) => normalizeReference(line).includes(alias))) || '';
}
function edgeKindFor(target, relationshipLine) {
    if (relationshipLine)
        return 'relationship';
    if (target.type === 'event')
        return 'event';
    return 'object';
}
function edgeLabelFor(target, relationshipLine) {
    if (relationshipLine)
        return compactLabel(relationshipLine);
    if (target.type === 'event')
        return '参与事件';
    if (target.type === 'region')
        return '关联区域';
    if (target.type === 'item')
        return '关联物品';
    return '关联对象';
}
export function buildRelationshipGraph(snapshot, scope = 'relations', customRegistry) {
    if (!snapshot)
        return { nodes: [], edges: [] };
    const registry = normalizeTableRegistry(customRegistry?.length ? customRegistry : DEFAULT_TABLE_REGISTRY);
    const nodes = [];
    const rowsByNode = new Map();
    const aliasesByNode = new Map();
    const roles = scope === 'relations'
        ? ['characters', 'state']
        : ['characters', 'state', 'items', 'events', 'regions', 'scenes', 'spacetime', 'globalChanges'];
    for (const table of enabledTables(registry).filter((item) => roles.includes(item.role))) {
        const type = nodeTypeFor(table.role);
        if (!type)
            continue;
        for (const row of snapshot[table.key] ?? []) {
            if (isEntryLifecycleHidden(row))
                continue;
            const id = `${table.key}:${row.id}`;
            nodes.push({
                id,
                label: String(row.title || '未命名').trim(),
                type,
                detail: row.content,
                status: row.status,
                existence: row.lifecycle?.existence,
                activity: row.lifecycle?.activity,
                memory: row.lifecycle?.memory,
            });
            rowsByNode.set(id, row);
            aliasesByNode.set(id, rowAliases(row));
        }
    }
    const edges = [];
    const seen = new Set();
    for (const source of nodes) {
        const row = rowsByNode.get(source.id);
        if (!row)
            continue;
        const relatedObjects = stringList(row.fields?.relatedObjects);
        const relatedEvents = stringList(row.fields?.relatedEvents);
        const relationshipStates = stringList(row.fields?.relationshipStates);
        const hasExplicitLinks = relatedObjects.length > 0 || relatedEvents.length > 0 || relationshipStates.length > 0;
        const legacyText = relationText(row);
        for (const target of nodes) {
            if (target.id === source.id)
                continue;
            if (scope === 'relations' && (source.type !== 'character' || target.type !== 'character'))
                continue;
            const targetAliases = aliasesByNode.get(target.id) ?? [];
            if (!targetAliases.length)
                continue;
            const relationshipLine = relationshipLineFor(row, targetAliases);
            const objectReference = relatedObjects.find((item) => referenceMatches(item, targetAliases)) || '';
            const eventReference = relatedEvents.find((item) => referenceMatches(item, targetAliases)) || '';
            const legacyMention = !hasExplicitLinks && targetAliases.some((alias) => legacyText.includes(alias));
            if (!relationshipLine && !objectReference && !eventReference && !legacyMention)
                continue;
            const kind = legacyMention ? 'legacy' : edgeKindFor(target, relationshipLine);
            const key = uniquePairKey(source.id, target.id, kind);
            if (seen.has(key))
                continue;
            seen.add(key);
            const evidence = relationshipLine || objectReference || eventReference || row.content;
            edges.push({
                id: `edge:${source.id}:${target.id}:${kind}`,
                source: source.id,
                target: target.id,
                label: legacyMention ? '旧记录关联' : edgeLabelFor(target, relationshipLine),
                detail: evidence,
                kind,
                explicit: !legacyMention,
            });
        }
    }
    return { nodes, edges };
}
/**
 * 将事件画像的明确事件—对象关联叠加到只读图谱。
 * 只生成派生节点/边，不写回快照，也不反向创建事实。
 */
export function enrichRelationshipGraphWithEventProfiles(source, profiles) {
    const nodes = source.nodes.map((node) => ({ ...node }));
    const edges = source.edges.map((edge) => ({ ...edge }));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const edgePairs = new Set(edges.map((edge) => [edge.source, edge.target].sort().join('|')));
    const nodeForEntry = (tableKey, entryId) => nodeById.get(`${tableKey}:${entryId}`)
        ?? nodes.find((node) => node.id.endsWith(`:${entryId}`));
    for (const profile of profiles) {
        let eventNode = profile.eventEntryId
            ? nodes.find((node) => node.type === 'event' && node.id.endsWith(`:${profile.eventEntryId}`))
            : undefined;
        eventNode ??= nodes.find((node) => node.type === 'event' && (node.id.endsWith(`:${profile.eventId}`) || node.label === profile.title));
        if (!eventNode) {
            eventNode = {
                id: `event-profile:${profile.eventId}`,
                label: profile.title,
                type: 'event',
                detail: profile.currentResults.join('；') || '由已提交事实派生的事件画像',
                status: profile.status === 'closed' ? '已形成结果' : '进行中',
            };
            nodes.push(eventNode);
            nodeById.set(eventNode.id, eventNode);
        }
        for (const entry of profile.relatedEntries) {
            const target = nodeForEntry(entry.tableKey, entry.id);
            if (!target || target.id === eventNode.id)
                continue;
            const pair = [eventNode.id, target.id].sort().join('|');
            if (edgePairs.has(pair))
                continue;
            edgePairs.add(pair);
            edges.push({
                id: `event-profile-edge:${profile.eventId}:${target.id}`,
                source: eventNode.id,
                target: target.id,
                label: '事件关联',
                detail: `${target.label}参与或受到“${profile.title}”影响`,
                kind: 'event',
                explicit: true,
            });
        }
    }
    return { nodes, edges };
}
