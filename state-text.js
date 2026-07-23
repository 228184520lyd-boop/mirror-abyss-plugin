import { hashText, makeId, nowIso, safeText } from '../core/utils.js';
import { parseFixedTextBlocks } from './fixed-text.js';
import { canonicalObjectTitle } from './object-identity.js';
import { applyFactContractGate } from './fact-contract.js';
import { enabledTables, normalizeTableRegistry, tableByRole } from './table-registry.js';
import { resolveStateLayer } from './state-semantics.js';
export const STATE_TEXT_MARKERS = {
    turnStart: '<MA_TURN>',
    turnEnd: '</MA_TURN>',
    changeStart: '<MA_CHANGE>',
    changeEnd: '</MA_CHANGE>',
};
const CHANGE_OPERATIONS = new Set(['set', 'replace', 'add', 'remove', 'close']);
const FACT_CONFIDENCE = new Set(['confirmed', 'recorded', 'reported', 'uncertain']);
const KEY_ALIASES = {
    '摘要': 'summary',
    '事件': 'event',
    '对象类型': 'kind', '类型': 'kind',
    '表格': 'table',
    '对象': 'object', '名称': 'object',
    '变化层': 'layer',
    '动作': 'operation',
    '内容': 'value',
    '事实结果': 'result', '结果': 'result',
    '置信度': 'confidence',
    '关联对象': 'related',
    '关键词': 'keyword',
    '开始时间': 'time_start',
    '结束时间': 'time_end',
    '时间标签': 'time_label',
};
const KIND_ROLE = {
    spacetime: 'spacetime',
    scene: 'scenes',
    character: 'characters',
    item: 'items',
    event: 'events',
    region: 'regions',
    global: 'globalChanges',
    foundation: 'foundations',
    custom: 'custom',
};
const KIND_ALIASES = {
    spacetime: 'spacetime', timeandspace: 'spacetime', 时空: 'spacetime',
    scene: 'scene', scenes: 'scene', 场景: 'scene', 局面: 'scene',
    character: 'character', characters: 'character', person: 'character', individual: 'character', 角色: 'character', 人物: 'character', 个体: 'character',
    item: 'item', items: 'item', object: 'item', prop: 'item', 物品: 'item', 道具: 'item', 装备: 'item',
    event: 'event', events: 'event', 事件: 'event',
    region: 'region', regions: 'region', place: 'region', location: 'region', 地点: 'region', 区域: 'region', 建筑: 'region',
    global: 'global', globalchange: 'global', globalchanges: 'global', organization: 'global', faction: 'global', institution: 'global', polity: 'global', 全局: 'global', 全局变化: 'global', 组织: 'global', 阵营: 'global', 政权: 'global', 机构: 'global',
    foundation: 'foundation', foundations: 'foundation', rule: 'foundation', setting: 'foundation', 基础设定: 'foundation', 规则: 'foundation', 设定: 'foundation',
    custom: 'custom', customobject: 'custom', customobjects: 'custom', 自定义: 'custom', 自定义对象: 'custom',
};
function identity(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s·•._—–\-|｜:：()（）【】\[\]<>《》“”"'`]+/gu, '');
}
function rowKind(value) {
    return KIND_ALIASES[identity(value)];
}
function semanticTable(kind, active) {
    return kind ? tableByRole(active, KIND_ROLE[kind], false) : undefined;
}
function unique(values, limit = 40, chars = 800) {
    return [...new Set(values.map((item) => safeText(item, chars).trim()).filter(Boolean))].slice(0, limit);
}
function normalizeKey(raw) {
    const trimmed = raw.trim();
    return KEY_ALIASES[trimmed] || trimmed;
}
function addField(block, key, value) {
    const normalized = normalizeKey(key);
    if (!normalized)
        return;
    block.fields.set(normalized, [...(block.fields.get(normalized) ?? []), value.trim()]);
}
function fieldValues(block, ...keys) {
    return unique(keys.flatMap((key) => block.fields.get(key) ?? []));
}
function fieldValue(block, ...keys) {
    return fieldValues(block, ...keys).at(-1) ?? '';
}
const STATE_BLOCK_MARKERS = [
    { kind: 'turn', start: STATE_TEXT_MARKERS.turnStart, end: STATE_TEXT_MARKERS.turnEnd },
    { kind: 'change', start: STATE_TEXT_MARKERS.changeStart, end: STATE_TEXT_MARKERS.changeEnd },
];
function safelyCloseTrailingStateBlock(raw) {
    const source = String(raw ?? '').replace(/^\uFEFF/, '').trim();
    if (!source)
        return source;
    const candidates = STATE_BLOCK_MARKERS
        .map((item) => ({ ...item, index: source.toUpperCase().lastIndexOf(item.start.toUpperCase()) }))
        .filter((item) => item.index >= 0)
        .sort((a, b) => b.index - a.index);
    const last = candidates[0];
    if (!last)
        return source;
    const tail = source.slice(last.index);
    if (tail.toUpperCase().includes(last.end.toUpperCase()))
        return source;
    const body = tail.slice(last.start.length);
    const hasCompleteLine = /(^|\n)\s*[^=＝:：\n]+\s*[=＝:：]\s*\S[^\n]*\s*$/u.test(body);
    if (!hasCompleteLine)
        return source;
    if (last.kind === 'turn' && !/(^|\n)\s*(?:摘要|summary)\s*[=＝:：]\s*\S/iu.test(body))
        return source;
    if (last.kind === 'change') {
        const required = ['事件', '对象类型', '对象', '变化层', '动作'];
        if (!required.every((key) => new RegExp(`(^|\\n)\\s*${key}\\s*[=＝:：]\\s*\\S`, 'u').test(body)))
            return source;
        if (!/(^|\n)\s*(?:内容|事实结果)\s*[=＝:：]\s*\S/u.test(body))
            return source;
    }
    return `${source}\n${last.end}`;
}
function parseLegacyStateTextBlocks(raw) {
    const source = String(raw ?? '');
    if (/<MA_(?:FACT|ROW)>|<\/MA_(?:FACT|ROW)>|【(?:事实|条目)(?:结束)?】|(^|\n)\s*(?:field|字段)(?:\.|\s*[=＝:：])/iu.test(source)) {
        throw new Error('状态模型返回了已停用旧协议；只接受 <MA_TURN>/<MA_CHANGE> 与“变化层”');
    }
    const parsed = parseFixedTextBlocks(safelyCloseTrailingStateBlock(source), STATE_BLOCK_MARKERS);
    if (!parsed.length)
        throw new Error('状态模型未返回固定文本块（缺少 <MA_TURN>/<MA_CHANGE>）');
    return parsed.map((source) => {
        const block = { ...source, kind: source.kind, fields: new Map() };
        for (const [key, values] of source.fields.entries())
            for (const value of values)
                addField(block, key, value);
        return block;
    });
}
function rowTokens(row) {
    return new Set([row.title, ...(row.keywords ?? [])].map(identity).filter(Boolean));
}
function intersection(left, right) {
    const rightSet = right instanceof Set ? right : new Set(right);
    return [...left].filter((item) => rightSet.has(item));
}
function mergeFieldValues(left, right) {
    if (Array.isArray(left) || Array.isArray(right))
        return unique([...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])], 60, 1200);
    const rightText = safeText(right, 12000).trim();
    return rightText || left;
}
function rowProtectionRank(row) {
    if (row.locked || row.lockMode === 'all')
        return 3;
    if (row.source === 'manual' || row.lockMode === 'base')
        return 2;
    return 1;
}
function canonicalRow(left, right) {
    const rankDiff = rowProtectionRank(right) - rowProtectionRank(left);
    if (rankDiff)
        return rankDiff > 0 ? right : left;
    const leftTime = String(left.updatedAt || '');
    const rightTime = String(right.updatedAt || '');
    if (leftTime && rightTime && leftTime !== rightTime)
        return leftTime < rightTime ? left : right;
    if (leftTime !== rightTime)
        return leftTime ? left : right;
    return String(left.id || '').localeCompare(String(right.id || '')) <= 0 ? left : right;
}
function fresherRow(left, right) {
    const leftTime = String(left.updatedAt || '');
    const rightTime = String(right.updatedAt || '');
    if (leftTime !== rightTime)
        return rightTime > leftTime ? right : left;
    return String(right.id || '').localeCompare(String(left.id || '')) > 0 ? right : left;
}
function mergeRows(left, right) {
    const canonical = canonicalRow(left, right);
    const secondary = canonical === left ? right : left;
    const newer = fresherRow(left, right);
    const fields = { ...(canonical.fields ?? {}) };
    for (const [key, value] of Object.entries(secondary.fields ?? {})) {
        if (Array.isArray(fields[key]) || Array.isArray(value)) {
            fields[key] = mergeFieldValues(fields[key], value);
            continue;
        }
        const currentText = safeText(fields[key], 12000).trim();
        const incomingText = safeText(value, 12000).trim();
        if (!currentText && incomingText)
            fields[key] = value;
        else if (rowProtectionRank(canonical) === 1 && newer === secondary && incomingText)
            fields[key] = value;
    }
    const fullyLocked = rowProtectionRank(canonical) === 3;
    if (!fullyLocked) {
        const revisionRow = right.baseRevisionEvidence ? right : left.baseRevisionEvidence ? left : undefined;
        const revisionBase = safeText(revisionRow?.fields?.baseContent, 12000).trim();
        if (revisionRow?.baseRevisionEvidence?.eventId && revisionRow.baseRevisionEvidence.factId && revisionBase) {
            fields.baseContent = structuredClone(revisionRow.fields?.baseContent);
        }
    }
    const recall = canonical.recall || secondary.recall ? {
        any: unique([...(canonical.recall?.any ?? []), ...(secondary.recall?.any ?? [])], 40, 120),
        all: unique([...(canonical.recall?.all ?? []), ...(secondary.recall?.all ?? [])], 30, 120),
        exclude: unique([...(canonical.recall?.exclude ?? []), ...(secondary.recall?.exclude ?? [])], 30, 120),
    } : undefined;
    return {
        ...canonical,
        content: fullyLocked ? canonical.content : newer.content || canonical.content || secondary.content,
        status: fullyLocked ? canonical.status : newer.status || canonical.status,
        keywords: unique([...(canonical.keywords ?? []), ...(secondary.keywords ?? [])], 24, 100),
        fields,
        factIds: unique([...(canonical.factIds ?? []), ...(secondary.factIds ?? [])], 80, 160),
        eventIds: unique([...(canonical.eventIds ?? []), canonical.eventId, ...(secondary.eventIds ?? []), secondary.eventId], 80, 160),
        eventId: fullyLocked ? canonical.eventId || secondary.eventId : newer.eventId || canonical.eventId || secondary.eventId,
        lifecycle: fullyLocked ? canonical.lifecycle ?? secondary.lifecycle : newer.lifecycle ?? canonical.lifecycle ?? secondary.lifecycle,
        entryLifecycle: fullyLocked ? canonical.entryLifecycle ?? secondary.entryLifecycle : newer.entryLifecycle ?? canonical.entryLifecycle ?? secondary.entryLifecycle,
        baseRevisionEvidence: fullyLocked
            ? canonical.baseRevisionEvidence ?? secondary.baseRevisionEvidence
            : newer.baseRevisionEvidence ?? canonical.baseRevisionEvidence ?? secondary.baseRevisionEvidence,
        recall,
        updatedAt: fullyLocked ? canonical.updatedAt : newer.updatedAt || canonical.updatedAt,
    };
}
export function mergeDuplicateStateRows(snapshot, registry, onlyTableKeys) {
    const tables = normalizeTableRegistry(registry);
    const output = structuredClone(snapshot);
    const idRemap = new Map();
    let mergedCount = 0;
    for (const table of tables) {
        if (onlyTableKeys && !onlyTableKeys.has(table.key))
            continue;
        const rows = output[table.key] ?? [];
        const groups = new Map();
        const order = [];
        for (const row of rows) {
            const token = canonicalObjectTitle(row.title) || `@id:${row.id}`;
            if (!groups.has(token))
                order.push(token);
            groups.set(token, [...(groups.get(token) ?? []), row]);
        }
        output[table.key] = order.map((token) => {
            const group = [...(groups.get(token) ?? [])].sort((left, right) => {
                const time = String(left.updatedAt || '').localeCompare(String(right.updatedAt || ''));
                return time || String(left.id || '').localeCompare(String(right.id || ''));
            });
            const merged = group.slice(1).reduce((current, row) => mergeRows(current, row), group[0]);
            if (group.length > 1)
                mergedCount += group.length - 1;
            for (const row of group) {
                if (row.id && row.id !== merged.id)
                    idRemap.set(row.id, merged.id);
            }
            return merged;
        });
    }
    if (idRemap.size) {
        for (const rows of Object.values(output)) {
            if (!Array.isArray(rows))
                continue;
            for (const row of rows) {
                const related = Array.isArray(row.fields?.relatedObjects) ? row.fields.relatedObjects : [];
                if (!related.length)
                    continue;
                row.fields ||= {};
                row.fields.relatedObjects = unique(related.map((value) => idRemap.get(String(value)) ?? value), 60, 240);
            }
        }
    }
    return { snapshot: output, idRemap, mergedCount };
}
export function dedupeStrongStateRows(snapshot, registry) {
    return mergeDuplicateStateRows(snapshot, registry).snapshot;
}
function findExistingRow(tableKey, objectName, keywords, previous) {
    const rows = previous[tableKey] ?? [];
    const objectToken = canonicalObjectTitle(objectName);
    const exactTitle = rows.filter((row) => canonicalObjectTitle(row.title) === objectToken);
    if (exactTitle.length === 1)
        return exactTitle[0];
    if (exactTitle.length > 1) {
        return exactTitle.slice(1).reduce((current, row) => mergeRows(current, row), exactTitle[0]);
    }
    const wanted = new Set([objectName, ...keywords].map(identity).filter(Boolean));
    const aliasMatches = rows.filter((row) => intersection(rowTokens(row), wanted).length > 0);
    if (aliasMatches.length === 1)
        return aliasMatches[0];
    if (aliasMatches.length > 1)
        throw new Error(`表格 ${tableKey} 中有多个条目命中对象别名：${objectName}`);
    return undefined;
}
function resolveTable(raw, active) {
    const token = identity(raw);
    const matches = active.filter((table) => identity(table.name) === token);
    if (matches.length === 1)
        return matches[0];
    if (!matches.length)
        throw new Error(`固定文本条目使用了未注册或已停用表格：${raw || '空'}`);
    throw new Error(`固定文本表格名称存在歧义：${raw}`);
}
/**
 * 同一稳定对象一旦已经存在于某张表，模型后续误选表格时优先沿用原表。
 * 这里只接受跨表唯一的规范标题命中；别名或多表同名不自动迁移，避免把同名人物与地点错误合并。
 */
function findUniqueExactRowAcrossTables(requestedTableKey, objectName, previous, active) {
    const token = canonicalObjectTitle(objectName);
    if (!token)
        return undefined;
    const matches = [];
    for (const table of active) {
        if (table.key === requestedTableKey)
            continue;
        for (const row of previous[table.key] ?? []) {
            if (canonicalObjectTitle(row.title) === token)
                matches.push({ table, row });
        }
    }
    return matches.length === 1 ? matches[0] : undefined;
}
function mergePatchRows(left, right) {
    return {
        ...left,
        ...right,
        id: left.id || right.id,
        title: left.title || right.title,
        content: right.content || left.content,
        status: right.status || left.status,
        keywords: unique([...(left.keywords ?? []), ...(right.keywords ?? [])], 24, 100),
        fields: { ...(left.fields ?? {}), ...(right.fields ?? {}) },
        lifecycle: right.lifecycle ?? left.lifecycle,
        baseRevisionEvidence: right.baseRevisionEvidence ?? left.baseRevisionEvidence,
    };
}
function activeEventMatch(eventName, activeFacts) {
    const token = identity(eventName);
    if (!token)
        return undefined;
    const matches = new Set(activeFacts.filter((fact) => {
        const terms = [
            fact.eventId,
            fact.title,
            fact.view?.eventName,
            fact.view?.objectTitle,
            ...fact.keywords,
        ].map(identity).filter(Boolean);
        return terms.includes(token);
    }).map((fact) => fact.eventId));
    return matches.size === 1 ? [...matches][0] : undefined;
}
function snapshotEventMatch(eventName, previous, active) {
    const token = identity(eventName);
    if (!token)
        return undefined;
    const matches = new Set();
    for (const table of active.filter((item) => item.role === 'events')) {
        for (const row of previous[table.key] ?? []) {
            const terms = [row.title, ...(row.keywords ?? [])].map(identity).filter(Boolean);
            if (!terms.includes(token))
                continue;
            for (const eventId of [...(row.eventIds ?? []), row.eventId].filter(Boolean))
                matches.add(eventId);
        }
    }
    return matches.size === 1 ? [...matches][0] : undefined;
}
function rowSingleEventMatch(row) {
    if (!row)
        return undefined;
    const values = [...new Set([...(row.eventIds ?? []), row.eventId].filter(Boolean))];
    return values.length === 1 ? values[0] : undefined;
}
function rowEventIds(row) {
    return [...new Set([...(row?.eventIds ?? []), row?.eventId].map((value) => String(value || '').trim()).filter(Boolean))];
}
function eventRowById(snapshot, active, eventId) {
    if (!eventId)
        return undefined;
    const matches = [];
    for (const table of active.filter((item) => item.role === 'events')) {
        for (const row of snapshot[table.key] ?? []) {
            if (rowEventIds(row).includes(eventId))
                matches.push(row);
        }
    }
    return matches.length === 1 ? matches[0] : undefined;
}
function eventCandidateOpen(eventId, snapshot, active, activeFacts) {
    const row = eventRowById(snapshot, active, eventId);
    if (row?.entryLifecycle?.state === 'settling'
        || /(已结束|结束|已完成|完成|已解决|已关闭|已归档|closed|completed|resolved|ended|archived)/i.test(String(row?.status || ''))) {
        return false;
    }
    const statusFacts = activeFacts.filter((fact) => fact.eventId === eventId
        && (fact.view?.moduleTag === 'MA_EVENT_STATUS' || /事件状态$/u.test(String(fact.title || ''))));
    const latest = statusFacts.at(-1);
    return !latest || latest.active !== false;
}
function canonicalEventName(eventId, fallback, snapshot, active, activeFacts) {
    const row = eventRowById(snapshot, active, eventId);
    if (row?.title)
        return row.title;
    const fact = [...activeFacts].reverse().find((item) => item.eventId === eventId
        && item.view?.semanticRole === 'events'
        && item.view?.objectTitle);
    return fact?.view?.objectTitle || fallback;
}
const GENERIC_EVENT_CONTEXT_TOKENS = new Set([
    '事件', '任务', '状态', '当前', '已经', '开始', '继续', '进行', '完成', '结束',
    '结果', '目标', '行动', '阶段', '成功', '失败', '仍在', '正在',
]);
function eventContextTokens(value, omitted = []) {
    let token = identity(value);
    for (const item of omitted.map(identity).filter((item) => item.length >= 2))
        token = token.split(item).join('');
    const output = new Set();
    for (let index = 0; index + 1 < token.length; index += 1) {
        const part = token.slice(index, index + 2);
        if (!GENERIC_EVENT_CONTEXT_TOKENS.has(part))
            output.add(part);
    }
    return output;
}
function contextualEventMatches(event, snapshot, active, activeFacts, allowedIds) {
    const matches = new Set();
    const currentText = [event.eventName, ...event.modules.map((item) => item.content)].join(' ');
    const currentIdentity = identity(currentText);
    for (const table of active.filter((item) => item.role === 'events')) {
        for (const row of snapshot[table.key] ?? []) {
            const eventIds = rowEventIds(row).filter((eventId) => (!allowedIds || allowedIds.has(eventId))
                && eventCandidateOpen(eventId, snapshot, active, activeFacts));
            if (!eventIds.length)
                continue;
            const anchors = unique(row.fields?.relatedObjects ?? [], 40, 240)
                .filter((item) => identity(item).length >= 2);
            if (!anchors.some((item) => currentIdentity.includes(identity(item))))
                continue;
            const currentTokens = eventContextTokens(currentText, anchors);
            const previousTokens = eventContextTokens([
                row.title,
                row.content,
                ...(row.keywords ?? []),
            ].join(' '), anchors);
            if (![...currentTokens].some((item) => previousTokens.has(item)))
                continue;
            for (const eventId of eventIds)
                matches.add(eventId);
        }
    }
    return matches;
}
function freshEventId(eventName, snapshot, active, activeFacts) {
    const token = identity(eventName);
    const base = `event_${hashText(token)}`;
    const used = new Set(activeFacts.map((fact) => String(fact.eventId || '').trim()).filter(Boolean));
    for (const table of active.filter((item) => item.role === 'events'))
        for (const row of snapshot[table.key] ?? [])
            for (const eventId of rowEventIds(row))
                used.add(eventId);
    if (!used.has(base))
        return base;
    return `event_${hashText(`${token}|new-after|${[...used].sort().join('|')}`)}`;
}
/**
 * 一个 <MA_EVENT> 是事件身份解析的最小事务边界。先按事件名精确复用；名称漂移时，
 * 优先接受本块明确对象行共同指向的唯一、仍开放 event_id；对象模块缺失或多线并存时，
 * 还必须同时命中旧事件的明确关联对象与非通用文本片段。多候选或已结束候选都不猜测。
 */
function resolveNaturalEventIdentity(event, snapshot, active, activeFacts) {
    const exact = activeEventMatch(event.eventName, activeFacts)
        || snapshotEventMatch(event.eventName, snapshot, active);
    if (exact && eventCandidateOpen(exact, snapshot, active, activeFacts)) {
        return {
            eventId: exact,
            canonicalName: canonicalEventName(exact, event.eventName, snapshot, active, activeFacts),
        };
    }
    const candidates = new Set();
    for (const module of event.modules.filter((item) => !item.eventModule)) {
        const token = canonicalObjectTitle(module.objectName);
        if (!token)
            continue;
        const matches = [];
        for (const table of active.filter((item) => item.role !== 'events')) {
            for (const row of snapshot[table.key] ?? []) {
                if (canonicalObjectTitle(row.title) === token)
                    matches.push(row);
            }
        }
        if (matches.length !== 1)
            continue;
        for (const eventId of rowEventIds(matches[0])) {
            if (eventCandidateOpen(eventId, snapshot, active, activeFacts))
                candidates.add(eventId);
        }
    }
    if (candidates.size === 1) {
        const eventId = [...candidates][0];
        return {
            eventId,
            canonicalName: canonicalEventName(eventId, event.eventName, snapshot, active, activeFacts),
        };
    }
    const contextual = contextualEventMatches(event, snapshot, active, activeFacts, candidates.size ? candidates : undefined);
    if (contextual.size === 1) {
        const eventId = [...contextual][0];
        return {
            eventId,
            canonicalName: canonicalEventName(eventId, event.eventName, snapshot, active, activeFacts),
        };
    }
    return {
        eventId: freshEventId(event.eventName, snapshot, active, activeFacts),
        canonicalName: event.eventName,
    };
}
function changeOperation(value) {
    const token = identity(value);
    if (['replace', '替换', '覆盖'].includes(token))
        return 'replace';
    if (['add', 'append', '新增', '添加', '追加'].includes(token))
        return 'add';
    if (['remove', 'delete', '移除', '删除', '解除'].includes(token))
        return 'remove';
    if (['close', 'closed', '结束', '关闭', '完成', '解决'].includes(token))
        return 'close';
    return 'set';
}
function arrayAfterChange(existing, values, operation) {
    const current = Array.isArray(existing) ? existing.map((item) => safeText(item, 1200).trim()).filter(Boolean) : [];
    if (operation === 'add')
        return unique([...current, ...values], 40, 1200);
    if (operation === 'remove') {
        const removed = new Set(values.map(identity).filter(Boolean));
        return current.filter((item) => !removed.has(identity(item)));
    }
    return unique(values, 40, 1200);
}
function confidenceFromValue(value) {
    const raw = String(value ?? '').trim();
    const normalized = identity(raw);
    if (['confirmed', '确认', '已确认'].map(identity).includes(normalized))
        return 'confirmed';
    if (['recorded', '记录', '已记录'].map(identity).includes(normalized))
        return 'recorded';
    if (['reported', '转述', '传闻', '报告'].map(identity).includes(normalized))
        return 'reported';
    if (['uncertain', '不确定', '存疑'].map(identity).includes(normalized))
        return 'uncertain';
    return FACT_CONFIDENCE.has(raw) ? raw : 'confirmed';
}
function changeFromBlock(block, active, previous, activeFacts) {
    const kind = rowKind(fieldValue(block, 'kind'));
    const explicitTable = fieldValue(block, 'table').trim();
    let table = explicitTable ? resolveTable(explicitTable, active) : semanticTable(kind, active);
    if (!table)
        throw new Error(`第 ${block.line} 行开始的 <MA_CHANGE> 无法确定对象表；请修正“对象类型”${explicitTable ? `或“表格=${explicitTable}”` : ''}`);
    const semantic = semanticTable(kind, active);
    if (semantic && table.role !== semantic.role)
        table = semantic;
    const objectName = fieldValue(block, 'object').trim();
    if (!objectName)
        throw new Error(`第 ${block.line} 行开始的 <MA_CHANGE> 缺少“对象”`);
    const keywords = unique([objectName, ...fieldValues(block, 'keyword')], 24, 100);
    let existing = findExistingRow(table.key, objectName, keywords, previous);
    let relocation;
    if (!existing) {
        const anchored = findUniqueExactRowAcrossTables(table.key, objectName, previous, active);
        if (anchored) {
            const protectedPlacement = anchored.row.source === 'manual' || anchored.row.locked || anchored.row.lockMode === 'all' || anchored.row.lockMode === 'base';
            const explicitSemanticMove = Boolean(kind && semantic?.key === table.key && anchored.table.key !== table.key && !(table.role === 'characters' && anchored.table.role !== 'characters'));
            if (explicitSemanticMove && !protectedPlacement) {
                existing = anchored.row;
                relocation = { id: anchored.row.id, title: anchored.row.title, fromTable: anchored.table.key, toTable: table.key };
            }
            else {
                table = anchored.table;
                existing = anchored.row;
            }
        }
    }
    const rawLayer = fieldValue(block, 'layer').trim();
    if (!rawLayer)
        throw new Error(`第 ${block.line} 行开始的 <MA_CHANGE> 缺少“变化层”`);
    const layer = resolveStateLayer(table, rawLayer);
    const values = fieldValues(block, 'value');
    const result = fieldValue(block, 'result').trim() || values.join('；').trim();
    if (!values.length && !result)
        throw new Error(`第 ${block.line} 行开始的 <MA_CHANGE> 缺少“内容”或“事实结果”`);
    const operation = changeOperation(fieldValue(block, 'operation'));
    if (!CHANGE_OPERATIONS.has(operation))
        throw new Error(`第 ${block.line} 行开始的 <MA_CHANGE> 动作不合法`);
    const fields = {};
    let content = existing?.content || objectName;
    let status = existing?.status || 'active';
    let rowKeywords = [...(existing?.keywords ?? []), ...keywords];
    if (layer.kind === 'content') {
        if (operation !== 'remove')
            content = values.at(-1) || result || content;
    }
    else if (layer.kind === 'status') {
        status = operation === 'remove' ? 'active' : values.at(-1) || result || (operation === 'close' ? 'closed' : status);
    }
    else if (layer.kind === 'keywords') {
        rowKeywords = operation === 'remove'
            ? rowKeywords.filter((item) => !new Set(values.map(identity)).has(identity(item)))
            : unique([...rowKeywords, ...values], 24, 100);
    }
    else {
        const prior = existing?.fields?.[layer.key];
        if (layer.definition.type === 'string[]')
            fields[layer.key] = arrayAfterChange(prior, values.length ? values : [result], operation);
        else
            fields[layer.key] = operation === 'remove' ? '' : values.at(-1) || result;
    }
    if (operation === 'close')
        status = layer.kind === 'status' ? (values.at(-1) || result || 'closed') : 'closed';
    const rowContent = layer.kind === 'content' ? content : existing?.content || result || objectName;
    const row = {
        id: existing?.id || makeId(table.key),
        title: existing?.title || objectName,
        content: rowContent,
        keywords: unique(rowKeywords, 24, 100),
        status,
        source: existing?.source ?? 'auto',
        locked: existing?.locked ?? false,
        lockMode: existing?.lockMode,
        lifecycle: existing?.lifecycle,
        // 待结算对象再次出现时，必须把状态机标记带到事务入口，由 restore 指令原子恢复；
        // 不能在模型投影阶段静默丢失，否则会留下“无 lifecycle 但状态仍待结算”的半恢复行。
        entryLifecycle: existing?.entryLifecycle ? structuredClone(existing.entryLifecycle) : undefined,
        updatedAt: nowIso(),
        fields: relocation ? { ...(existing?.fields ?? {}), ...fields } : fields,
        semanticRole: table.role,
    };
    const eventName = fieldValue(block, 'event').trim() || objectName;
    const eventId = activeEventMatch(eventName, activeFacts)
        || snapshotEventMatch(eventName, previous, active)
        || rowSingleEventMatch(existing)
        || `event_${hashText(identity(eventName))}`;
    const factTitle = `${objectName}·${layer.label}`;
    const previousMatches = activeFacts.filter((fact) => fact.eventId === eventId && identity(fact.title) === identity(factTitle));
    const factId = previousMatches.length === 1
        ? previousMatches[0].factId
        : `fact_${hashText(`${eventId}|${identity(factTitle)}`)}`;
    const confidence = confidenceFromValue(fieldValue(block, 'confidence'));
    const explicitClosed = operation === 'close'
        || (layer.kind === 'status' && /(完成|结束|关闭|解决|归档|closed|completed|resolved|ended|archived)/i.test(status));
    const factOperation = explicitClosed ? 'close' : operation === 'add' ? 'append' : previousMatches.length ? 'update' : 'create';
    const occurred = unique([result || `${objectName}：${values.join('；')}`], 8, 1200);
    const fact = {
        fact_id: factId,
        event_id: eventId,
        entity_id: eventId,
        type: kind || table.role || 'event',
        title: factTitle,
        content: occurred.join('；'),
        occurred,
        unresolved: [],
        status: explicitClosed ? 'closed' : 'active',
        time_range: {
            start: fieldValue(block, 'time_start'),
            end: fieldValue(block, 'time_end'),
            label: fieldValue(block, 'time_label'),
        },
        related_entities: unique([objectName, ...fieldValues(block, 'related')], 40, 240),
        keywords: unique([objectName, eventName, factTitle, ...fieldValues(block, 'keyword')], 24, 100),
        operation: factOperation,
        confidence,
    };
    return {
        fact,
        patch: { table: table.key, row, matchKey: existing?.id || `new:${identity(objectName)}`, relocation },
    };
}
function mergeFacts(left, right) {
    return {
        ...left,
        ...right,
        content: unique([left.content, right.content], 20, 1200).join('；'),
        occurred: unique([...(left.occurred ?? []), ...(right.occurred ?? [])], 40, 1200),
        unresolved: unique([...(left.unresolved ?? []), ...(right.unresolved ?? [])], 40, 1200),
        related_entities: unique([...(left.related_entities ?? []), ...(right.related_entities ?? [])], 40, 240),
        keywords: unique([...(left.keywords ?? []), ...(right.keywords ?? [])], 24, 100),
    };
}
function applyPatchToWorkingSnapshot(working, patch) {
    if (patch.relocation) {
        working[patch.relocation.fromTable] = (working[patch.relocation.fromTable] ?? []).filter((row) => row.id !== patch.relocation.id);
    }
    const rows = working[patch.table] ?? [];
    const index = rows.findIndex((row) => row.id === patch.row.id);
    if (index < 0)
        working[patch.table] = [...rows, structuredClone(patch.row)];
    else {
        const next = [...rows];
        next[index] = mergePatchRows(next[index], patch.row);
        working[patch.table] = next;
    }
}
const NATURAL_MODULES = {
    MA_CORE: { role: 'events', layer: '当前摘要', event: true },
    MA_EVENT_RESULT: { role: 'events', layer: '现行事实', event: true },
    MA_EVENT_STATE: { role: 'events', layer: '当前状态', event: true },
    MA_UNRESOLVED: { role: 'events', layer: '当前状态', event: true, unresolved: true },
    MA_CHARACTER_IDENTITY: { role: 'characters', layer: '身份定义' },
    MA_CHARACTER_FACT: { role: 'characters', layer: '现行事实' },
    MA_CHARACTER_STATE: { role: 'characters', layer: '当前状态' },
    MA_CHARACTER_APPEARANCE: { role: 'characters', layer: '外观表现' },
    MA_CHARACTER_RELATION: { role: 'characters', layer: '关系状态' },
    MA_CHARACTER_ABILITY: { role: 'characters', layer: '能力状态' },
    MA_ITEM_IDENTITY: { role: 'items', layer: '身份定义' },
    MA_ITEM_FACT: { role: 'items', layer: '现行事实' },
    MA_ITEM_STATE: { role: 'items', layer: '当前状态' },
    MA_SCENE_IDENTITY: { role: 'scenes', layer: '身份定义' },
    MA_SCENE_FACT: { role: 'scenes', layer: '现行事实' },
    MA_SCENE_STATE: { role: 'scenes', layer: '当前状态' },
    MA_REGION_IDENTITY: { role: 'regions', layer: '身份定义' },
    MA_REGION_FACT: { role: 'regions', layer: '现行事实' },
    MA_REGION_STATE: { role: 'regions', layer: '当前状态' },
    MA_GLOBAL_IDENTITY: { role: 'globalChanges', layer: '身份定义' },
    MA_GLOBAL_FACT: { role: 'globalChanges', layer: '现行事实' },
    MA_GLOBAL_STATE: { role: 'globalChanges', layer: '当前状态' },
    MA_FOUNDATION_IDENTITY: { role: 'foundations', layer: '身份定义' },
    MA_FOUNDATION_FACT: { role: 'foundations', layer: '现行事实' },
    MA_FOUNDATION_STATE: { role: 'foundations', layer: '当前状态' },
    MA_SPACETIME_STATE: { role: 'spacetime', layer: '当前状态' },
    MA_CUSTOM: { layer: '', custom: true },
};
function moduleLines(value) {
    return String(value || '')
        .replace(/^\s+|\s+$/g, '')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
}
function lineOf(source, index) {
    return source.slice(0, index).split('\n').length;
}
function compactFactText(value, limit = 220, label = '事实模块') {
    const text = safeText(value, Math.max(limit * 4, 1200)).replace(/\s+/g, ' ').trim();
    if (!text)
        return '';
    if (text.length > limit)
        throw new Error(`${label}过长：${text.length}/${limit} 字；只写一到两句具体事实`);
    return text;
}
// 事件关闭只接受正文和事实模块共同出现的明确终局表达。单个动作完成、到达、开门、
// 交付一件物品等原子结果都不能据此关闭整条事件线。
const EXPLICIT_EVENT_TERMINAL_RE = /(?:事件|任务|目标|委托|调查|案件|战斗|冲突|谈判|交易|仪式|行动|计划|追捕|危机|救援|审判|比赛|旅程|会面|婚礼).{0,16}(?:已结束|已经结束|结束了|已完成|已经完成|完成了|已解决|已经解决|已关闭|已经关闭|已达成|已经达成|宣告结束|告一段落|结案|告破)|(?:任务完成|目标达成|危机解除|战斗结束|谈判结束|交易完成|仪式完成|追捕结束|调查结案|案件告破|救援完成|比赛结束|婚礼结束)|(?:此事|此案|争端|纠纷).{0,8}(?:作罢|了结|终结|不再追究)|(?:对方|双方|一方).{0,12}(?:认输|投降).{0,12}(?:不再追究|退出争端|停止争斗)/iu;
function explicitlyClosedEvent(event, sourceText) {
    if (event.modules.some((module) => module.unresolved))
        return false;
    const eventEvidence = event.modules
        .filter((module) => module.tag === 'MA_EVENT_RESULT' || module.tag === 'MA_EVENT_STATE' || module.tag === 'MA_CORE')
        .map((module) => module.content)
        .join(' ');
    const source = String(sourceText ?? '').trim();
    return Boolean(source
        && EXPLICIT_EVENT_TERMINAL_RE.test(eventEvidence)
        && EXPLICIT_EVENT_TERMINAL_RE.test(source));
}
/**
 * 1.3.14 自然模块协议。模块正文使用位置而非 key=value：对象模块第一行是对象名，后续是最短事实。
 */
export function parseStateTextBlocks(raw) {
    const source = String(raw ?? '').replace(/^\uFEFF/, '').trim();
    if (!source)
        throw new Error('状态模型返回为空');
    if (/<MA_CHANGE>|<MA_(?:FACT|ROW)>|(^|\n)\s*[^\n]+\s*[=＝]\s*\S/iu.test(source)) {
        throw new Error('状态模型返回了已停用键值协议；只接受 <MA_EVENT> 内的自然事实模块');
    }
    const output = [];
    const turnRe = /<MA_TURN>([\s\S]*?)<\/MA_TURN>/giu;
    for (const match of source.matchAll(turnRe)) {
        const summary = compactFactText(match[1], 320, '<MA_TURN>');
        if (summary)
            output.push({ kind: 'turn', line: lineOf(source, match.index ?? 0), summary });
    }
    const eventRe = /<MA_EVENT>([\s\S]*?)<\/MA_EVENT>/giu;
    for (const match of source.matchAll(eventRe)) {
        const body = match[1];
        const line = lineOf(source, match.index ?? 0);
        const moduleRe = /<(MA_[A-Z_]+)>([\s\S]*?)<\/\1>/gu;
        const modules = [];
        let firstModuleIndex = body.length;
        for (const moduleMatch of body.matchAll(moduleRe)) {
            firstModuleIndex = Math.min(firstModuleIndex, moduleMatch.index ?? body.length);
            const tag = moduleMatch[1].toUpperCase();
            const spec = NATURAL_MODULES[tag];
            if (!spec)
                throw new Error(`第 ${lineOf(source, (match.index ?? 0) + (moduleMatch.index ?? 0))} 行使用了未注册模块 <${tag}>`);
            const lines = moduleLines(moduleMatch[2]);
            let objectName = '';
            let tableName = '';
            let layerLabel = spec.layer;
            let contentLines = [];
            if (spec.event) {
                contentLines = lines;
            }
            else if (spec.custom) {
                if (lines.length < 4)
                    throw new Error(`第 ${line} 行的 <MA_CUSTOM> 至少需要“表名、对象、语义层、事实”四行`);
                [tableName, objectName, layerLabel] = lines;
                contentLines = lines.slice(3);
            }
            else {
                objectName = lines[0] || '';
                contentLines = lines.slice(1);
            }
            const contentLimit = tag === 'MA_CORE' ? 320 : 220;
            const content = compactFactText(contentLines.join(' '), contentLimit, `<${tag}>`);
            if (!content)
                throw new Error(`第 ${line} 行的 <${tag}> 缺少具体事实`);
            if (!spec.event && !objectName)
                throw new Error(`第 ${line} 行的 <${tag}> 缺少对象名`);
            modules.push({
                tag,
                line,
                objectName: objectName || undefined,
                tableName: tableName || undefined,
                layerLabel,
                content,
                role: spec.role,
                eventModule: Boolean(spec.event),
                unresolved: Boolean(spec.unresolved),
            });
        }
        const prelude = moduleLines(body.slice(0, firstModuleIndex));
        const eventName = safeText(prelude[0], 240).trim();
        if (!eventName)
            throw new Error(`第 ${line} 行的 <MA_EVENT> 缺少事件名称`);
        // 兼容 1.3.14 已保存的模型输出：旧第二行可以读取，但只作为迁移输入，
        // 不再拥有事件关闭权。新协议在事件名之后直接进入事实模块。
        const legacyStatus = prelude[1] || '';
        if (legacyStatus && !/^(进行中|已结束)$/u.test(legacyStatus))
            throw new Error(`事件“${eventName}”在事件名后出现未知文本；新协议应直接写事实模块`);
        if (prelude.length > (legacyStatus ? 2 : 1))
            throw new Error(`事件“${eventName}”在事实模块前包含多余文本`);
        if (!modules.length)
            throw new Error(`事件“${eventName}”没有事实模块`);
        if (!modules.some((module) => module.tag === 'MA_CORE'))
            throw new Error(`事件“${eventName}”缺少唯一的 <MA_CORE> 动作骨架`);
        const moduleKeys = new Set();
        for (const module of modules) {
            const key = module.eventModule
                ? module.tag
                : `${module.tag}|${canonicalObjectTitle(module.objectName)}|${module.tableName || ''}|${module.layerLabel}`;
            if (moduleKeys.has(key))
                throw new Error(`事件“${eventName}”重复返回同一事实模块：${module.eventModule ? `<${module.tag}>` : module.objectName}`);
            moduleKeys.add(key);
        }
        output.push({ kind: 'event', line, eventName, reportedClosed: legacyStatus === '已结束', closed: false, modules });
    }
    if (!output.some((block) => block.kind === 'turn' || block.kind === 'event')) {
        throw new Error('状态模型未返回 <MA_TURN> 或 <MA_EVENT>');
    }
    return output.sort((a, b) => a.line - b.line);
}
function naturalTable(module, active) {
    if (module.tableName)
        return resolveTable(module.tableName, active);
    if (!module.role)
        throw new Error(`<${module.tag}> 无法确定对象表`);
    const table = tableByRole(active, module.role, false);
    if (!table)
        throw new Error(`<${module.tag}> 对应的表格未启用`);
    return table;
}
function arrayLayerOperation(layerKey) {
    return ['currentFacts', 'relatedObjects', 'relatedEvents'].includes(layerKey) ? 'add' : 'replace';
}
function eventCoreText(event) {
    return event.modules.find((module) => module.tag === 'MA_CORE')?.content
        || event.modules.find((module) => module.tag === 'MA_EVENT_RESULT')?.content
        || `${event.eventName}${event.closed ? '已结束' : '正在进行'}`;
}
function projectionPatchForFact(fact, working) {
    const view = fact.view;
    if (!view)
        return undefined;
    const rows = working[view.table] ?? [];
    const existing = rows.find((row) => row.id === view.rowId)
        ?? rows.find((row) => canonicalObjectTitle(row.title) === canonicalObjectTitle(view.objectTitle));
    const fields = { ...(existing?.fields ?? {}) };
    let content = existing?.content || '';
    let status = existing?.status || 'active';
    let rowKeywords = unique([...(existing?.keywords ?? []), ...(view.keywords ?? [])], 24, 100);
    if (view.layerKind === 'content')
        content = view.value;
    else if (view.layerKind === 'status')
        status = view.value;
    else if (view.layerKind === 'keywords')
        rowKeywords = unique([...rowKeywords, view.value], 24, 100);
    else if (view.layerType === 'string[]')
        fields[view.layerKey] = arrayAfterChange(fields[view.layerKey], [view.value], view.arrayOperation || 'replace');
    else if (view.layerKey)
        fields[view.layerKey] = view.value;
    if (!content && !(view.layerKind === 'field' && view.layerKey === 'baseContent'))
        content = view.objectTitle;
    if (view.moduleTag === 'MA_CORE')
        content = view.value;
    if (view.semanticRole === 'events')
        status = view.eventClosed ? '已结束' : '进行中';
    fields.relatedEvents = arrayAfterChange(fields.relatedEvents, [view.eventName], 'add');
    if (view.semanticRole === 'events' && view.relatedObjects?.length)
        fields.relatedObjects = arrayAfterChange(fields.relatedObjects, view.relatedObjects, 'add');
    const row = {
        id: existing?.id || view.rowId,
        title: existing?.title || view.objectTitle,
        content,
        keywords: rowKeywords,
        status,
        source: existing?.source ?? 'auto',
        locked: existing?.locked ?? false,
        lockMode: existing?.lockMode,
        lifecycle: existing?.lifecycle,
        entryLifecycle: existing?.entryLifecycle ? structuredClone(existing.entryLifecycle) : undefined,
        updatedAt: nowIso(),
        fields,
        semanticRole: view.semanticRole,
        eventId: fact.event_id,
        eventIds: unique([...(existing?.eventIds ?? []), existing?.eventId, fact.event_id], 80, 160),
        factIds: unique([...(existing?.factIds ?? []), fact.fact_id], 200, 180),
    };
    if (view.baseRevisionStatement)
        row.baseRevisionEvidence = { eventId: fact.event_id, factId: fact.fact_id, statement: view.baseRevisionStatement };
    return {
        table: view.table,
        row,
        matchKey: existing?.id || `new:${identity(view.objectTitle)}`,
        relocation: view.relocation,
    };
}
function naturalChange(event, module, active, previous, activeFacts, allObjectNames) {
    const table = naturalTable(module, active);
    const stableEventName = event.canonicalName || event.eventName;
    const objectName = module.eventModule ? stableEventName : module.objectName;
    const keywords = unique([objectName], 24, 100);
    let targetTable = table;
    let existing = findExistingRow(table.key, objectName, keywords, previous);
    let relocation;
    if (!existing) {
        const anchored = findUniqueExactRowAcrossTables(table.key, objectName, previous, active);
        if (anchored) {
            const protectedPlacement = anchored.row.source === 'manual' || anchored.row.locked || anchored.row.lockMode === 'all' || anchored.row.lockMode === 'base';
            const explicitSemanticMove = anchored.table.key !== table.key && !(table.role === 'characters' && anchored.table.role !== 'characters');
            if (explicitSemanticMove && !protectedPlacement) {
                existing = anchored.row;
                relocation = { id: anchored.row.id, title: anchored.row.title, fromTable: anchored.table.key, toTable: table.key };
            }
            else {
                targetTable = anchored.table;
                existing = anchored.row;
            }
        }
    }
    const layer = resolveStateLayer(targetTable, module.layerLabel);
    const eventId = event.eventId;
    const factTitle = `${objectName}·${layer.label}`;
    const previousMatches = activeFacts.filter((fact) => fact.eventId === eventId && identity(fact.title) === identity(factTitle));
    const replacementLayer = !module.eventModule && arrayLayerOperation(layer.key) === 'replace';
    const hostId = existing?.id;
    const currentHostFact = replacementLayer && hostId
        ? [...activeFacts].reverse().find((fact) => fact.active !== false
            && !fact.supersededByFactId
            && (fact.primaryHost?.id === hostId || fact.view?.rowId === hostId)
            && (fact.view?.layerKey === layer.key || identity(fact.title) === identity(factTitle)))
        : undefined;
    const sameCurrentValue = currentHostFact
        && identity(currentHostFact.content) === identity(module.content);
    const factId = sameCurrentValue
        ? currentHostFact.factId
        : currentHostFact
            ? `fact_${hashText(`${hostId}|${layer.key}|${currentHostFact.factId}|${identity(module.content)}`)}`
            : previousMatches.length === 1
                ? previousMatches[0].factId
                : `fact_${hashText(`${eventId}|${identity(factTitle)}`)}`;
    const relatedObjects = module.eventModule ? allObjectNames : [objectName];
    const previousBase = safeText(existing?.fields?.baseContent, 12000).trim();
    const fact = {
        fact_id: factId,
        event_id: eventId,
        entity_id: eventId,
        type: targetTable.role,
        title: factTitle,
        content: module.content,
        occurred: module.unresolved ? [] : [module.content],
        unresolved: module.unresolved ? [module.content] : [],
        status: module.unresolved ? 'active' : 'active',
        time_range: {},
        related_entities: unique([...relatedObjects, stableEventName, event.eventName], 40, 240),
        keywords: unique([objectName, stableEventName, event.eventName, factTitle], 24, 100),
        operation: sameCurrentValue || previousMatches.some((fact) => fact.factId === factId) ? 'update' : 'create',
        confidence: 'confirmed',
        supersedes_fact_id: currentHostFact && !sameCurrentValue ? currentHostFact.factId : undefined,
        view: {
            table: targetTable.key,
            rowId: existing?.id || makeId(targetTable.key),
            objectTitle: existing?.title || objectName,
            semanticRole: targetTable.role,
            layerKind: layer.kind,
            layerKey: layer.key,
            layerType: layer.definition?.type,
            arrayOperation: arrayLayerOperation(layer.key),
            value: module.content,
            keywords: unique([...keywords, stableEventName, event.eventName], 24, 100),
            eventName: stableEventName,
            eventClosed: event.closed,
            relatedObjects: module.eventModule ? allObjectNames : [],
            moduleTag: module.tag,
            relocation,
            baseRevisionStatement: layer.kind === 'field' && layer.key === 'baseContent' && existing && previousBase !== module.content
                ? eventCoreText(event)
                : undefined,
        },
    };
    return {
        ...fact,
        ...applyFactContractGate(fact, { existingObject: Boolean(existing) }),
    };
}
export function parseStateTextOutput(raw, previousSnapshot, registry, activeFacts = [], options = {}) {
    const active = enabledTables(normalizeTableRegistry(registry));
    const previous = dedupeStrongStateRows(previousSnapshot, registry);
    const working = structuredClone(previous);
    const blocks = parseStateTextBlocks(raw);
    const turnSummary = blocks.filter((block) => block.kind === 'turn').map((block) => block.summary).at(-1) ?? '';
    const factsById = new Map();
    const snapshot = {};
    const rowsByIdentity = new Map();
    const relocationsById = new Map();
    for (const event of blocks.filter((block) => block.kind === 'event')) {
        event.closed = explicitlyClosedEvent(event, options.sourceText);
        const eventIdentity = resolveNaturalEventIdentity(event, working, active, activeFacts);
        event.eventId = eventIdentity.eventId;
        event.canonicalName = eventIdentity.canonicalName;
        const allObjectNames = unique(event.modules.filter((module) => !module.eventModule).map((module) => module.objectName), 40, 240);
        for (const module of event.modules) {
            const fact = naturalChange(event, module, active, working, activeFacts, allObjectNames);
            const id = String(fact.fact_id);
            factsById.set(id, factsById.has(id) ? mergeFacts(factsById.get(id), fact) : fact);
            const patch = projectionPatchForFact(fact, working);
            if (!patch)
                continue;
            applyPatchToWorkingSnapshot(working, patch);
            const key = `${patch.table}|${canonicalObjectTitle(patch.row.title) || patch.matchKey}`;
            const current = rowsByIdentity.get(key);
            rowsByIdentity.set(key, current ? {
                table: patch.table,
                row: mergePatchRows(current.row, patch.row),
                matchKey: patch.matchKey,
                relocation: current.relocation ?? patch.relocation,
            } : patch);
            if (patch.relocation)
                relocationsById.set(patch.relocation.id, patch.relocation);
        }
        // 事件状态由插件生成稳定事实，永远最后提交，确保已结束事件不会被后续对象模块重新判为 active。
        const eventId = event.eventId;
        const stableEventName = event.canonicalName || event.eventName;
        const statusFactId = `fact_${hashText(`${eventId}|event-status`)}`;
        const previousStatus = activeFacts.find((fact) => fact.factId === statusFactId);
        const eventTable = tableByRole(active, 'events', false);
        const existingEventRow = eventTable
            ? eventRowById(working, active, eventId)
                || findExistingRow(eventTable.key, stableEventName, [stableEventName, event.eventName], working)
            : undefined;
        const statusFact = {
            fact_id: statusFactId,
            event_id: eventId,
            entity_id: eventId,
            type: 'events',
            title: `${stableEventName}·事件状态`,
            content: event.closed ? `${stableEventName}已结束。` : `${stableEventName}正在进行。`,
            occurred: [event.closed ? `${stableEventName}已结束。` : `${stableEventName}正在进行。`],
            unresolved: event.modules.filter((module) => module.unresolved).map((module) => module.content),
            status: event.closed ? 'closed' : 'active',
            time_range: {},
            related_entities: unique([stableEventName, event.eventName, ...allObjectNames], 40, 240),
            keywords: unique([stableEventName, event.eventName], 24, 100),
            operation: event.closed ? 'close' : previousStatus ? 'update' : 'create',
            confidence: 'confirmed',
            view: eventTable ? {
                table: eventTable.key,
                rowId: existingEventRow?.id || makeId(eventTable.key),
                objectTitle: existingEventRow?.title || stableEventName,
                semanticRole: 'events',
                layerKind: 'status',
                value: event.closed ? '已结束' : '进行中',
                keywords: unique([stableEventName, event.eventName], 24, 100),
                eventName: stableEventName,
                eventClosed: event.closed,
                relatedObjects: allObjectNames,
                moduleTag: 'MA_EVENT_STATUS',
            } : undefined,
        };
        const routedStatusFact = {
            ...statusFact,
            ...applyFactContractGate(statusFact, { existingObject: Boolean(existingEventRow) }),
        };
        factsById.set(statusFactId, routedStatusFact);
        const statusPatch = projectionPatchForFact(routedStatusFact, working);
        if (statusPatch) {
            applyPatchToWorkingSnapshot(working, statusPatch);
            const key = `${statusPatch.table}|${canonicalObjectTitle(statusPatch.row.title) || statusPatch.matchKey}`;
            const current = rowsByIdentity.get(key);
            rowsByIdentity.set(key, current ? {
                table: statusPatch.table,
                row: mergePatchRows(current.row, statusPatch.row),
                matchKey: statusPatch.matchKey,
                relocation: current.relocation ?? statusPatch.relocation,
            } : statusPatch);
        }
    }
    for (const { table, row } of rowsByIdentity.values())
        (snapshot[table] ||= []).push(row);
    return {
        turnSummary,
        facts: [...factsById.values()],
        snapshot,
        relocations: [...relocationsById.values()],
        entryLifecycleDirectives: [],
    };
}
