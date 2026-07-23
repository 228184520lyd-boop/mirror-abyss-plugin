import { enabledTables, normalizeTableRegistry } from './table-registry.js';
import { isEntryParticipationPaused } from './entry-lifecycle.js';
import { tableByRole } from './table-registry.js';
const CLOSED_STATUS_RE = /(已完成|完成|已结束|结束|已关闭|关闭|已解决|解决|已归档|归档|closed|completed|resolved|ended|archived)/i;
const ITEM_TERMINAL_RE = /(已出售|出售完成|已赠出|已交付|已消耗|耗尽|已损毁|已销毁|已丢弃|已遗失|不再持有|sold|transferred|delivered|consumed|destroyed|discarded|lost)/i;
const ITEM_TRANSFER_RE = /(已出售|出售完成|已赠出|已交付|已遗失|不再持有|sold|transferred|delivered|lost)/i;
const ITEM_DISPOSABLE_RE = /(普通|制式|可替代|消耗品|一次性|空瓶|废弃|无特殊|common|ordinary|disposable|consumable)/i;
const ITEM_INDEPENDENT_RE = /(唯一|神器|圣器|圣剑|证物|任务|关键|不可替代|传家|王室|核心|unique|artifact|evidence|quest|key item)/i;
const SCENE_TERMINAL_RE = /(已结束|已离开|离开场景|场景结束|已关闭|ended|left|closed)/i;
function text(value) {
    return String(value ?? '').trim();
}
function list(value) {
    return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}
function identity(value) {
    return text(value).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}
function factEventId(fact) {
    return text(fact.event_id ?? fact.eventId ?? fact.entity_id ?? fact.entityId);
}
function factId(fact) {
    return text(fact.fact_id ?? fact.factId ?? fact.id);
}
function factClosed(fact) {
    const operation = text(fact.operation).toLowerCase();
    return operation === 'close' || CLOSED_STATUS_RE.test(text(fact.status));
}
function rowEventIds(row) {
    return [...new Set([...(row.eventIds ?? []), row.eventId].map(text).filter(Boolean))];
}
function activeRow(row) {
    return !isEntryParticipationPaused(row)
        && !CLOSED_STATUS_RE.test(rowText(row));
}
function currentSpacetime(snapshot, registry) {
    const table = tableByRole(registry, 'spacetime', false);
    return table ? (snapshot[table.key] ?? []).filter(activeRow).at(-1) : undefined;
}
/**
 * 场景边界只由前后两个已提交时空快照的稳定身份变化产生。
 * 地点被提及、回忆或模型只改写描述时不会触发。
 */
export function deriveSceneBoundary(previous, next, registryValue) {
    const registry = normalizeTableRegistry(registryValue);
    const before = currentSpacetime(previous, registry);
    const after = currentSpacetime(next, registry);
    if (!before || !after || identity(before.title) === identity(after.title))
        return undefined;
    const sceneTable = tableByRole(registry, 'scenes', false);
    const previousScenes = sceneTable ? previous[sceneTable.key] ?? [] : [];
    const oldScene = previousScenes.find((row) => identity(row.title) === identity(before.title))
        ?? previousScenes.filter(activeRow).at(-1);
    return {
        previousTitle: before.title,
        currentTitle: after.title,
        previousSceneId: oldScene?.id,
        relatedObjectTokens: [...new Set(list(oldScene?.fields?.relatedObjects).map(identity).filter(Boolean))],
        eventIds: [...new Set([
                ...rowEventIds(before),
                ...rowEventIds(oldScene),
            ].filter(Boolean))],
    };
}
function rowText(row) {
    const fields = row.fields ?? {};
    return [
        row.status,
        row.content,
        fields.baseContent,
        ...list(fields.currentFacts),
        ...list(fields.currentStates),
    ].map(text).filter(Boolean).join(' ');
}
function explicitTerminal(role, row) {
    const source = rowText(row);
    if (role === 'events')
        return CLOSED_STATUS_RE.test(source);
    if (role === 'scenes')
        return SCENE_TERMINAL_RE.test(source);
    if (role === 'items') {
        if (!ITEM_TERMINAL_RE.test(source))
            return false;
        if (ITEM_INDEPENDENT_RE.test(source))
            return false;
        if (ITEM_TRANSFER_RE.test(source))
            return ITEM_DISPOSABLE_RE.test(source);
        return true;
    }
    return false;
}
function eventHost(snapshot, registry, eventId) {
    for (const table of enabledTables(registry).filter((item) => item.role === 'events')) {
        const exact = (snapshot[table.key] ?? []).find((row) => rowEventIds(row).includes(eventId));
        if (exact)
            return { table: table.key, row: exact };
    }
    return undefined;
}
function rowFactText(row, facts, eventId) {
    const rowIds = new Set(row.factIds ?? []);
    const aliases = new Set([row.id, row.title, ...(row.keywords ?? [])].map(identity).filter(Boolean));
    const matched = facts.filter((fact) => {
        if (factEventId(fact) !== eventId)
            return false;
        if (rowIds.has(factId(fact)))
            return true;
        return list(fact.related_entities ?? fact.relatedEntities).map(identity).some((value) => aliases.has(value));
    });
    return [...new Set(matched.flatMap((fact) => list(fact.occurred ?? fact.occurredFacts).concat(text(fact.content))).map(text).filter(Boolean))]
        .join('；')
        .slice(0, 1200);
}
/**
 * 只检查本轮返回的行。事件是否结束来自本轮明确事实；条目是否可进入待结算来自固定表类型与显式终态。
 */
export function deriveIncrementalSettlementDirectives(input) {
    const registry = normalizeTableRegistry(input.registry);
    const tableByKey = new Map(registry.map((table) => [table.key, table]));
    const touched = new Map();
    for (const [tableKey, patches] of Object.entries(input.patchSnapshot ?? {})) {
        const table = tableByKey.get(tableKey);
        if (!table || !Array.isArray(patches))
            continue;
        for (const patch of patches) {
            const row = (input.snapshot[tableKey] ?? []).find((candidate) => candidate.id === patch.id);
            if (row)
                touched.set(row.id, { table, patch, row });
        }
    }
    const closedEventIds = new Set(input.facts.filter(factClosed).map(factEventId).filter(Boolean));
    const activeEventIds = new Set(input.facts.filter((fact) => !factClosed(fact)).map(factEventId).filter(Boolean));
    const sceneBoundary = input.sceneBoundary;
    const currentPatchObjectTokens = new Set();
    for (const [tableKey, patches] of Object.entries(input.patchSnapshot ?? {})) {
        const table = tableByKey.get(tableKey);
        if (!table || !['characters', 'state'].includes(table.role) || !Array.isArray(patches))
            continue;
        for (const patch of patches)
            for (const value of [patch?.id, patch?.title, ...(patch?.keywords ?? [])]) {
                const token = identity(value);
                if (token)
                    currentPatchObjectTokens.add(token);
            }
    }
    // 事件结束后只扫描绑定该事件的局部对象，不扫描整个仓库内容。
    for (const table of enabledTables(registry)) {
        for (const row of input.snapshot[table.key] ?? []) {
            if (touched.has(row.id))
                continue;
            if (!rowEventIds(row).some((eventId) => closedEventIds.has(eventId)))
                continue;
            touched.set(row.id, { table, patch: row, row });
        }
    }
    // 场景切换只加入旧场景及其明确关联的临时角色；本轮继续出现的对象不预退出。
    if (sceneBoundary) {
        const related = new Set(sceneBoundary.relatedObjectTokens ?? []);
        for (const table of enabledTables(registry)) {
            for (const row of input.snapshot[table.key] ?? []) {
                const rowTokens = [row.id, row.title, ...(row.keywords ?? [])].map(identity).filter(Boolean);
                const oldScene = table.role === 'scenes'
                    && (row.id === sceneBoundary.previousSceneId || identity(row.title) === identity(sceneBoundary.previousTitle));
                const relatedCharacter = ['characters', 'state'].includes(table.role)
                    && rowTokens.some((token) => related.has(token))
                    && !rowTokens.some((token) => currentPatchObjectTokens.has(token));
                if (oldScene || relatedCharacter)
                    touched.set(row.id, { table, patch: row, row, sceneBoundary: true });
            }
        }
    }
    const output = new Map();
    for (const { table, patch, row, sceneBoundary: fromSceneBoundary } of touched.values()) {
        const protectedEntry = row.source === 'manual' || row.locked || row.lockMode === 'all' || row.lockMode === 'base' || row.id === input.focusObjectId;
        if (protectedEntry)
            continue;
        const events = rowEventIds(row);
        const patchEvents = rowEventIds(patch);
        const touchedActive = [...new Set([...events, ...patchEvents])].some((eventId) => activeEventIds.has(eventId));
        const explicitlyReturned = touched.has(row.id) && patch !== row;
        if (isEntryParticipationPaused(row)
            && (touchedActive || explicitlyReturned)
            && !explicitTerminal(table.role, patch)) {
            output.set(row.id, { sourceId: row.id, sourceTable: table.key, sourceTitle: row.title, action: 'restore' });
            continue;
        }
        if (fromSceneBoundary) {
            if (table.role === 'scenes') {
                output.set(row.id, {
                    sourceId: row.id,
                    sourceTable: table.key,
                    sourceTitle: row.title,
                    action: 'retire',
                    trigger: 'scene-boundary',
                    triggerEventIds: sceneBoundary.eventIds,
                    note: `${row.title}已离开场景，等待本场景事实完成分发。`,
                    reason: `场景已切换至${sceneBoundary.currentTitle}；旧场景进入预退出。`,
                });
                continue;
            }
            const hasOpenCrossSceneEvent = events.some((eventId) => {
                if (closedEventIds.has(eventId))
                    return false;
                const host = eventHost(input.snapshot, registry, eventId);
                return host ? activeRow(host.row) : true;
            });
            const fields = row.fields ?? {};
            const persistentCharacter = Boolean(text(fields.baseContent)
                || list(fields.relationshipStates).length
                || list(fields.abilityStates).length
                || events.length > 1);
            if (!hasOpenCrossSceneEvent && !persistentCharacter) {
                output.set(row.id, {
                    sourceId: row.id,
                    sourceTable: table.key,
                    sourceTitle: row.title,
                    action: 'retire',
                    trigger: 'scene-boundary',
                    triggerEventIds: sceneBoundary.eventIds,
                    note: `${row.title}已离开当前场景，等待其短期影响完成分发。`,
                    reason: `场景已切换至${sceneBoundary.currentTitle}；临时 NPC 进入预退出。`,
                });
            }
            continue;
        }
        const closedEventId = events.find((eventId) => closedEventIds.has(eventId));
        if (!closedEventId)
            continue;
        const note = rowFactText(row, input.facts, closedEventId)
            || `${row.title}在该事件中的明确结果已写入对象事实。`;
        // 事件状态只由插件根据正文与自然事实模块中的明确终局证据确定。
        if (table.role === 'events') {
            output.set(row.id, {
                sourceId: row.id,
                sourceTable: table.key,
                sourceTitle: row.title,
                action: 'retire',
                note,
                reason: '事件已结束且不存在未决模块；等待小总结完成对象分发后删除事件容器。',
            });
            continue;
        }
        // 没有基础定义、关系或能力层，且只服务于本事件的自动角色，视为临时 NPC。
        const fields = row.fields ?? {};
        const persistentCharacter = Boolean(text(fields.baseContent)
            || list(fields.relationshipStates).length
            || list(fields.abilityStates).length
            || events.length > 1);
        if ((table.role === 'characters' || table.role === 'state') && !persistentCharacter) {
            output.set(row.id, {
                sourceId: row.id,
                sourceTable: table.key,
                sourceTitle: row.title,
                action: 'retire',
                note,
                reason: '临时 NPC 仅参与已结束事件，持续结果由事件或相关对象承接，原条目无后续独立追踪价值。',
            });
            continue;
        }
        // 场景与物品必须有明确终态，防止关闭一场事件时误删仍长期存在的地点和关键物品。
        if ((table.role === 'scenes' || table.role === 'items') && explicitTerminal(table.role, row)) {
            output.set(row.id, {
                sourceId: row.id,
                sourceTable: table.key,
                sourceTitle: row.title,
                action: 'retire',
                note,
                reason: `${table.role === 'items' ? '物品' : '场景'}已形成明确终态；等待总结覆盖后删除临时容器。`,
            });
        }
    }
    return [...output.values()];
}
//# sourceMappingURL=incremental-settlement.js.map
