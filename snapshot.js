import { TABLE_KEYS, TABLE_LABELS } from '../constants.js';
import { makeId, nowIso, safeText } from '../core/utils.js';
const EXISTENCE_STATES = new Set([
    '存活', '死亡已确认', '存在未知', '失踪', '身份存疑', '虚构或误认已确认', '存在被抹除', '未标注', '不适用',
]);
const ACTIVITY_STATES = new Set([
    '当前在场', '当前相关', '离场但仍活跃', '休眠', '长期休眠', '已归档', '未标注', '不适用',
]);
const MEMORY_STATES = new Set([
    '广泛记得', '部分人物记得', '仅记录留存', '仅痕迹留存', '无人可确认记得', '记忆被篡改', '记忆被抹除', '未标注', '不适用',
]);
const EVIDENCE_LEVELS = new Set(['已确认', '可靠记录', '多方陈述', '单方陈述', '推测', '未知']);
export function emptySnapshot() {
    return Object.fromEntries(TABLE_KEYS.map((key) => [key, []]));
}
export function normalizeKeywords(value) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => safeText(item, 80).trim()).filter(Boolean))].slice(0, 16);
}
function normalizeStringList(value, limit = 12) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => safeText(item, 240).trim()).filter(Boolean))].slice(0, limit);
}
function enumValue(value, allowed, fallback) {
    const text = safeText(value, 80).trim();
    return allowed.has(text) ? text : fallback;
}
export function defaultLifecycle() {
    return {
        existence: '未标注',
        activity: '未标注',
        memory: '未标注',
        evidenceLevel: '未知',
        evidence: '',
        returnConditions: [],
        returnBlockers: [],
    };
}
export function normalizeLifecycle(value, previous) {
    const source = value && typeof value === 'object' ? value : {};
    const base = previous ?? defaultLifecycle();
    return {
        existence: enumValue(source.existence ?? base.existence, EXISTENCE_STATES, base.existence),
        activity: enumValue(source.activity ?? base.activity, ACTIVITY_STATES, base.activity),
        memory: enumValue(source.memory ?? base.memory, MEMORY_STATES, base.memory),
        evidenceLevel: enumValue(source.evidenceLevel ?? base.evidenceLevel, EVIDENCE_LEVELS, base.evidenceLevel),
        evidence: safeText(source.evidence ?? base.evidence, 4000).trim(),
        returnConditions: normalizeStringList(source.returnConditions ?? base.returnConditions),
        returnBlockers: normalizeStringList(source.returnBlockers ?? base.returnBlockers),
    };
}
export function normalizeRow(value, tableKey, index, previous) {
    const source = value && typeof value === 'object' ? value : {};
    const now = nowIso();
    const id = safeText(source.id || previous?.id || makeId(tableKey), 160).trim() || makeId(tableKey);
    const manual = source.source === 'manual' || previous?.source === 'manual';
    const supportsLifecycle = tableKey === 'characters' || tableKey === 'focus';
    const lifecycleInput = source.lifecycle ?? previous?.lifecycle;
    return {
        id,
        title: safeText(source.title || source.name || previous?.title || `${TABLE_LABELS[tableKey]} ${index + 1}`, 240).trim(),
        content: safeText(source.content || source.summary || previous?.content || '', 12000).trim(),
        keywords: normalizeKeywords(source.keywords ?? previous?.keywords ?? []),
        status: safeText(source.status || previous?.status || 'active', 120).trim() || 'active',
        source: manual ? 'manual' : 'auto',
        locked: Boolean(source.locked ?? previous?.locked ?? manual),
        lifecycle: supportsLifecycle && lifecycleInput ? normalizeLifecycle(lifecycleInput, previous?.lifecycle) : undefined,
        updatedAt: safeText(source.updatedAt || previous?.updatedAt || now, 80) || now,
    };
}
export function normalizeSnapshot(value, previousSnapshot) {
    const source = value && typeof value === 'object' ? value : {};
    const output = emptySnapshot();
    for (const key of TABLE_KEYS) {
        const rows = Array.isArray(source[key]) ? source[key] : [];
        const previousMap = new Map((previousSnapshot?.[key] ?? []).map((row) => [row.id, row]));
        const used = new Set();
        output[key] = rows.map((row, index) => {
            const rawId = row && typeof row === 'object' ? safeText(row.id, 160) : '';
            const normalized = normalizeRow(row, key, index, rawId ? previousMap.get(rawId) : undefined);
            if (used.has(normalized.id))
                normalized.id = makeId(key);
            used.add(normalized.id);
            return normalized;
        });
    }
    return enforceSnapshotConsistency(output);
}
function identityTitle(value) {
    return String(value || '').toLowerCase().replace(/[\s·•._—–\-|｜:：()（）【】\[\]<>《》“”"'，,。.!！?？]+/g, '');
}
function relationIdentity(value) {
    const parts = String(value || '').split(/↔|<->|⇄|与|和/).map(identityTitle).filter(Boolean);
    return parts.length === 2 ? parts.sort().join('↔') : identityTitle(value);
}
function rowIdentity(tableKey, row) {
    return tableKey === 'relationships' ? relationIdentity(row.title) : identityTitle(row.title);
}
function rowScore(row) {
    const protectedScore = row.source === 'manual' || row.locked ? 100000 : 0;
    const currentScore = /(当前|进行中|active|开放|有效)/i.test(row.status) ? 1000 : 0;
    return protectedScore + currentScore + row.content.length + row.keywords.length * 20 + (row.lifecycle?.evidence?.length ?? 0);
}
function mergeRows(preferred, other) {
    return {
        ...preferred,
        keywords: normalizeKeywords([...(preferred.keywords ?? []), ...(other.keywords ?? [])]),
        lifecycle: preferred.lifecycle ?? other.lifecycle,
        source: preferred.source === 'manual' || other.source === 'manual' ? 'manual' : 'auto',
        locked: Boolean(preferred.locked || other.locked),
    };
}
function dedupeRows(tableKey, rows) {
    const output = [];
    const indexes = new Map();
    for (const row of rows) {
        const key = rowIdentity(tableKey, row) || `id:${row.id}`;
        const existingIndex = indexes.get(key);
        if (existingIndex === undefined) {
            indexes.set(key, output.length);
            output.push(row);
            continue;
        }
        const existing = output[existingIndex];
        const preferred = rowScore(row) > rowScore(existing) ? row : existing;
        const other = preferred === row ? existing : row;
        output[existingIndex] = mergeRows(preferred, other);
    }
    return output;
}
function chooseCurrentRow(rows) {
    if (!rows.length)
        return [];
    return [rows.reduce((best, row) => {
            const bestTime = Date.parse(best.updatedAt || '') || 0;
            const rowTime = Date.parse(row.updatedAt || '') || 0;
            if (rowTime !== bestTime)
                return rowTime > bestTime ? row : best;
            return rowScore(row) >= rowScore(best) ? row : best;
        })];
}
export function enforceSnapshotConsistency(snapshot) {
    const output = emptySnapshot();
    for (const key of TABLE_KEYS)
        output[key] = dedupeRows(key, [...(snapshot[key] ?? [])]);
    output.focus = chooseCurrentRow(output.focus);
    output.spacetime = chooseCurrentRow(output.spacetime);
    const focusNames = new Set(output.focus.map((row) => identityTitle(row.title)).filter(Boolean));
    output.characters = output.characters.filter((row) => !focusNames.has(identityTitle(row.title)));
    return output;
}
/**
 * Complete snapshots carry automatic character persistence. Only player-owned
 * rows receive hard protection elsewhere; mistaken background rows may now be removed.
 */
export function preservePersistentCharacters(_previous, next) {
    return enforceSnapshotConsistency(next);
}
export function snapshotRowCount(snapshot) {
    if (!snapshot)
        return 0;
    return TABLE_KEYS.reduce((sum, key) => sum + (snapshot[key]?.length ?? 0), 0);
}
export function upsertManualRow(snapshot, tableKey, row) {
    const next = normalizeSnapshot(snapshot, snapshot);
    const index = next[tableKey].findIndex((item) => item.id === row.id);
    const normalized = normalizeRow({ ...row, source: 'manual', locked: row.locked ?? true, updatedAt: nowIso() }, tableKey, index >= 0 ? index : next[tableKey].length, index >= 0 ? next[tableKey][index] : undefined);
    if (index >= 0)
        next[tableKey][index] = normalized;
    else
        next[tableKey].push(normalized);
    return enforceSnapshotConsistency(next);
}
export function deleteRow(snapshot, tableKey, rowId) {
    const next = normalizeSnapshot(snapshot, snapshot);
    next[tableKey] = next[tableKey].filter((row) => row.id !== rowId);
    return enforceSnapshotConsistency(next);
}
export function stateSchemaDescription() {
    return JSON.stringify({
        focus: [{
                id: 'focus-linwan',
                title: '林晚',
                content: '身份：学生\n具体位置：急诊大厅分诊台前\n外部状态：等待检查\n持有资源：随身包/手机\n当前限制：尚未完成检查',
                keywords: ['林晚'],
                status: '当前焦点',
                lifecycle: {
                    existence: '存活', activity: '当前在场', memory: '广泛记得', evidenceLevel: '已确认',
                    evidence: '当前可观察', returnConditions: [], returnBlockers: [],
                },
            }],
        spacetime: [{
                id: 'spacetime-current', title: '急诊大厅分诊区',
                content: '日期时间：2026-07-17 08:20\n具体地点：急诊大厅分诊台前\n在场主体：林晚/值班医护\n当前场景/接口：医疗登记\n时间窗口：等待叫号',
                keywords: ['急诊大厅', '分诊台'], status: '当前',
            }],
        characters: [{
                id: 'character-zhoulan', title: '周岚',
                content: '稳定身份：值班护士\n当前位置/去向：急诊分诊台\n当前持续事务：负责后续检查安排\n已显影状态：正在值班\n重要已知事实：持有焦点的登记记录',
                keywords: ['周岚', '值班护士'], status: '当前相关',
                lifecycle: {
                    existence: '存活', activity: '当前相关', memory: '部分人物记得', evidenceLevel: '已确认',
                    evidence: '姓名牌与当前行为', returnConditions: ['医疗流程继续'], returnBlockers: [],
                },
            }],
        relationships: [{
                id: 'relationship-linwan-zhoulan', title: '林晚 ↔ 周岚',
                content: '关系性质：医疗服务接触\n当前状态：登记完成/等待后续安排\n持续影响：周岚负责转交检查流程\n显影依据：登记记录与公开交接',
                keywords: ['林晚', '周岚'], status: '流程性接触',
            }],
        items: [{
                id: 'items-linwan', title: '林晚｜物品与资源',
                content: '持有者：林晚\n精确位置：随身包\n数量/状态：手机可用/证件已完成登记\n关键用途：通讯/身份核验\n追踪价值：登记流程仍在继续',
                keywords: ['林晚', '手机', '证件'], status: '持有中',
            }],
        skills: [{
                id: 'skills-linwan', title: '林晚｜技能与权限',
                content: '技能/权限：已确认的校园门禁权限\n确认表现：曾通过本人凭证进入教学楼\n使用条件：有效凭证/开放时段\n消耗/限制：权限范围仅限授权区域',
                keywords: ['林晚', '门禁权限'], status: '有效',
            }],
        events: [{
                id: 'event-medical', title: '流程｜因伤就医',
                content: '参与主体：林晚/医护人员\n起因：手臂受伤\n当前阶段：登记完成/等待检查\n未解决状态：治疗流程尚未完成\n推进或结束条件：叫号/检查结果/离院\n外部载体：挂号记录',
                keywords: ['就医', '检查', '挂号记录'], status: '进行中',
            }],
        regions: [{
                id: 'region-emergency', title: '急诊大厅',
                content: '持续状态：正常开放\n活跃流程：分诊与叫号\n限制/风险：需完成登记后进入检查\n设施/控制状态：分诊台与号码屏运行中\n未来进入时的影响：仍需按医疗流程排队',
                keywords: ['急诊大厅', '分诊'], status: '开放',
            }],
        foundations: [{
                id: 'foundation-medical-access', title: '医疗登记规则',
                content: '适用范围：该地区公共医疗机构\n稳定内容：检查前需完成身份登记与分诊\n确认依据：公开流程与现场执行\n例外/限制：急救处置可先行',
                keywords: ['医疗登记', '分诊'], status: '长期有效',
            }],
    }, null, 2);
}
