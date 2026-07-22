import { makeId, nowIso, safeText } from './core-utils.js';
import { canonicalObjectTitle, canonicalizeObjectIdentities, rewriteObjectReferences } from './domain-object-identity.js';
import { isEntryLifecycleHidden, normalizeEntryLifecycleValue, visibleStateRows, } from './domain-entry-lifecycle.js';
import { enforceSpacetimeSingleton, isHistoricalSceneRow } from './domain-special-table-rules.js';
import { isPurePassiveObserverText } from './domain-observer.js';
import { dedupeStrongStateRows, mergeDuplicateStateRows } from './domain-state-text.js';
import { DEFAULT_TABLE_REGISTRY, migrateSnapshotTables, normalizeTableRegistry, tableByKey, tableByRole } from './domain-table-registry.js';
export { rewriteObjectReferences } from './domain-object-identity.js';
// 生命周期写操作只允许从 entry-lifecycle / memory-state-machine 进入。
// snapshot 仅保留只读参与状态辅助函数，避免形成第二个写入入口。
export { isEntryLifecycleHidden, isEntryParticipationPaused, visibleStateRows, } from './domain-entry-lifecycle.js';
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
const STANDARD_FIELDS = new Set(['id', 'title', 'name', 'content', 'summary', 'keywords', 'status', 'source', 'locked', 'lockMode', 'lifecycle', 'entryLifecycle', 'updatedAt', 'factIds', 'fact_ids', 'eventId', 'event_id', 'eventIds', 'event_ids', 'recall', 'fields']);
function registryOrDefault(registry) {
    return normalizeTableRegistry(registry?.length ? registry : DEFAULT_TABLE_REGISTRY);
}
/** 非枚举 characters 别名只用于 rc.19 测试/API 兼容，不会进入模型输出。 */
function characterTableKey(registry) {
    return tableByRole(registry, 'characters', false)?.key || tableByRole(registry, 'state', false)?.key;
}
function attachLegacyAliases(snapshot, registry) {
    const key = characterTableKey(registry);
    if (!key || !(key in snapshot))
        return snapshot;
    for (const alias of ['characters', 'state']) {
        if (alias === key || Object.prototype.hasOwnProperty.call(snapshot, alias))
            continue;
        Object.defineProperty(snapshot, alias, {
            configurable: true, enumerable: false,
            get: () => snapshot[key],
            set: (value) => { snapshot[key] = Array.isArray(value) ? value : []; },
        });
    }
    return snapshot;
}
export function emptySnapshot(registry, includeDisabled = true) {
    const tables = registryOrDefault(registry).filter((table) => includeDisabled || table.enabled);
    return attachLegacyAliases(Object.fromEntries(tables.map((table) => [table.key, []])), tables);
}
export function normalizeKeywords(value) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => safeText(item, 80).trim()).filter(Boolean))].slice(0, 24);
}
function normalizeStringList(value, limit = 20, itemLimit = 240) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => safeText(item, itemLimit).trim()).filter(Boolean))].slice(0, limit);
}
function enumValue(value, allowed, fallback) {
    const text = safeText(value, 80).trim();
    return allowed.has(text) ? text : fallback;
}
export function defaultLifecycle() {
    return { existence: '未标注', activity: '未标注', memory: '未标注', evidenceLevel: '未知', evidence: '', returnConditions: [], returnBlockers: [] };
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
function normalizeRecall(value, title, keywords) {
    const source = value && typeof value === 'object' ? value : {};
    const any = normalizeStringList(source.any, 24, 100);
    return {
        any: any.length ? any : normalizeKeywords([title, ...keywords]),
        all: normalizeStringList(source.all, 16, 100),
        exclude: normalizeStringList(source.exclude, 16, 100),
    };
}
function normalizeCustomFields(source, table, previous) {
    const prior = previous?.fields && typeof previous.fields === 'object' ? previous.fields : {};
    const nested = source.fields && typeof source.fields === 'object' ? source.fields : {};
    const output = {};
    for (const field of table.fields) {
        if (STANDARD_FIELDS.has(field.key) || field.key === 'lifecycle')
            continue;
        const raw = source[field.key] ?? nested[field.key] ?? prior[field.key];
        if (field.type === 'string[]')
            output[field.key] = normalizeStringList(raw, 30, 500);
        else
            output[field.key] = safeText(raw, 4000).trim();
    }
    return output;
}
export function normalizeRow(value, tableKey, index, previous, registry) {
    const tables = registryOrDefault(registry);
    const table = tableByKey(tables, tableKey) ?? { key: tableKey, name: tableKey, role: 'custom', fields: [] };
    const source = value && typeof value === 'object' ? value : {};
    const now = nowIso();
    const id = safeText(source.id || previous?.id || makeId(tableKey), 160).trim() || makeId(tableKey);
    const manual = source.source === 'manual' || previous?.source === 'manual';
    const locked = Boolean(source.locked ?? previous?.locked ?? false);
    const rawLockMode = safeText(source.lockMode ?? previous?.lockMode, 20).trim();
    const lockMode = locked || rawLockMode === 'all' ? 'all' : manual || rawLockMode === 'base' ? 'base' : undefined;
    const incomingTitle = safeText(source.title || source.name || previous?.title || `${table.name} ${index + 1}`, 240).trim();
    const previousTitle = safeText(previous?.title, 240).trim();
    // 同一稳定 ID 的自动归一化必须沿用首次名称；只有玩家手动编辑可显式改名。
    const title = !manual && previousTitle ? previousTitle : incomingTitle;
    const keywords = manual
        ? normalizeKeywords(source.keywords ?? previous?.keywords ?? [])
        : normalizeKeywords([
            ...(previous?.keywords ?? []),
            ...normalizeKeywords(source.keywords ?? []),
            ...(incomingTitle && identityTitle(incomingTitle) !== identityTitle(title) ? [incomingTitle] : []),
        ]);
    const supportsLifecycle = ['characters', 'state'].includes(table.role) || table.fields.some((field) => field.type === 'lifecycle');
    const lifecycleInput = source.lifecycle ?? previous?.lifecycle;
    const entryLifecycle = normalizeEntryLifecycleValue(source.entryLifecycle ?? previous?.entryLifecycle, previous?.entryLifecycle);
    const factIds = normalizeStringList(source.factIds ?? source.fact_ids ?? previous?.factIds, 40, 160);
    const eventId = safeText(source.eventId ?? source.event_id ?? previous?.eventId, 160).trim() || undefined;
    const eventIds = normalizeStringList(source.eventIds ?? source.event_ids ?? previous?.eventIds ?? (eventId ? [eventId] : []), 60, 160);
    if (eventId && !eventIds.includes(eventId))
        eventIds.unshift(eventId);
    const content = safeText(source.content || source.summary || previous?.content || '', 12000).trim();
    const fields = normalizeCustomFields(source, table, previous);
    if (manual && !safeText(fields.baseContent, 12000).trim() && content)
        fields.baseContent = content;
    return {
        id,
        title,
        content,
        keywords,
        status: safeText(source.status || previous?.status || 'active', 120).trim() || 'active',
        source: manual ? 'manual' : 'auto',
        locked: lockMode === 'all',
        lockMode,
        lifecycle: supportsLifecycle && lifecycleInput ? normalizeLifecycle(lifecycleInput, previous?.lifecycle) : undefined,
        updatedAt: safeText(source.updatedAt || previous?.updatedAt || now, 80) || now,
        fields,
        factIds,
        eventId: eventId || eventIds[0],
        eventIds,
        recall: normalizeRecall(source.recall ?? previous?.recall, title, keywords),
        semanticRole: table.role,
        entryLifecycle,
    };
}
export function normalizeSnapshot(value, previousSnapshot, registry, includeDisabled = true) {
    const tables = registryOrDefault(registry).filter((table) => includeDisabled || table.enabled);
    const source = migrateSnapshotTables(value, tables);
    const previous = previousSnapshot ? migrateSnapshotTables(previousSnapshot, tables) : {};
    const output = emptySnapshot(tables, true);
    for (const table of tables) {
        const key = table.key;
        const rows = Array.isArray(source[key]) ? source[key] : [];
        const previousMap = new Map((previous[key] ?? []).map((row) => [row.id, row]));
        const used = new Set();
        output[key] = rows.map((row, index) => {
            const rawId = row && typeof row === 'object' ? safeText(row.id, 160) : '';
            const normalized = normalizeRow(row, key, index, rawId ? previousMap.get(rawId) : undefined, tables);
            if (used.has(normalized.id))
                normalized.id = makeId(key);
            used.add(normalized.id);
            return normalized;
        });
    }
    return attachLegacyAliases(dedupeStrongStateRows(output, tables), tables);
}
function identityTitle(value) {
    return canonicalObjectTitle(value);
}
function stateRows(snapshot, registry) {
    const key = characterTableKey(registry);
    return key ? snapshot[key] ?? [] : [];
}
/** 保留已建立主体，人工/锁定行优先；仅视图层维护，不代表自动创建人物卡。 */
export function preservePersistentCharacters(previous, next, registry) {
    const tables = registryOrDefault(registry);
    previous = dedupeStrongStateRows(previous, tables);
    next = dedupeStrongStateRows(next, tables);
    const key = characterTableKey(tables);
    if (!key)
        return next;
    const nextRows = next[key] ?? (next[key] = []);
    const oldRows = previous[key] ?? previous.characters ?? [];
    const byId = new Map(nextRows.map((row) => [row.id, row]));
    const idRemap = new Map();
    const nextByTitle = new Map();
    for (const row of nextRows) {
        const title = identityTitle(row.title);
        if (title)
            nextByTitle.set(title, [...(nextByTitle.get(title) ?? []), row]);
    }
    for (const oldRow of oldRows) {
        if (byId.has(oldRow.id))
            continue;
        const title = identityTitle(oldRow.title);
        const titleMatches = title ? nextByTitle.get(title) ?? [] : [];
        const titleMatch = titleMatches[0];
        if (titleMatch) {
            const replacedId = titleMatch.id;
            titleMatch.id = oldRow.id;
            if (replacedId && replacedId !== oldRow.id)
                idRemap.set(replacedId, oldRow.id);
            if (oldRow.locked || oldRow.lockMode === 'all') {
                Object.assign(titleMatch, structuredClone(oldRow));
            }
            else if (oldRow.source === 'manual' || oldRow.lockMode === 'base') {
                const generatedFields = titleMatch.fields ?? {};
                const oldFields = oldRow.fields ?? {};
                titleMatch.title = oldRow.title;
                titleMatch.source = 'manual';
                titleMatch.locked = false;
                titleMatch.lockMode = 'base';
                titleMatch.fields = {
                    ...structuredClone(oldFields),
                    currentStates: structuredClone(generatedFields.currentStates ?? oldFields.currentStates ?? []),
                    relationshipStates: structuredClone(generatedFields.relationshipStates ?? oldFields.relationshipStates ?? []),
                    abilityStates: structuredClone(generatedFields.abilityStates ?? oldFields.abilityStates ?? []),
                    relatedObjects: structuredClone(generatedFields.relatedObjects ?? oldFields.relatedObjects ?? []),
                    relatedEvents: structuredClone(generatedFields.relatedEvents ?? oldFields.relatedEvents ?? []),
                };
            }
            else if (!titleMatch.lifecycle && oldRow.lifecycle) {
                titleMatch.lifecycle = structuredClone(oldRow.lifecycle);
            }
            byId.set(oldRow.id, titleMatch);
            continue;
        }
        const restored = structuredClone(oldRow);
        nextRows.push(restored);
        byId.set(restored.id, restored);
        if (title)
            nextByTitle.set(title, [...(nextByTitle.get(title) ?? []), restored]);
    }
    next[key] = nextRows;
    rewriteObjectReferences(next, idRemap);
    return attachLegacyAliases(dedupeStrongStateRows(next, tables), tables);
}
/** 基础内容与已固化历史不是状态提取的可写区；已有值始终由上一快照覆盖回去。 */
export function preserveObjectBaseLayers(previous, next, registry) {
    const tables = registryOrDefault(registry);
    previous = dedupeStrongStateRows(previous, tables);
    next = dedupeStrongStateRows(next, tables);
    for (const table of tables) {
        const previousRows = previous[table.key] ?? [];
        const byId = new Map(previousRows.map((row) => [row.id, row]));
        const previousByTitle = new Map();
        for (const row of previousRows) {
            const title = identityTitle(row.title);
            if (title)
                previousByTitle.set(title, [...(previousByTitle.get(title) ?? []), row]);
        }
        for (const row of next[table.key] ?? []) {
            const title = identityTitle(row.title);
            const titleMatches = title ? previousByTitle.get(title) ?? [] : [];
            const old = byId.get(row.id) ?? titleMatches[0];
            if (!old)
                continue;
            row.fields ||= {};
            const oldFields = old.fields ?? {};
            const existingBase = safeText(oldFields.baseContent, 12000).trim();
            const incomingBase = safeText(row.fields.baseContent, 12000).trim();
            const explicitRevision = Boolean(row.baseRevisionEvidence?.eventId
                && row.baseRevisionEvidence?.factId
                && incomingBase
                && incomingBase !== existingBase);
            if (existingBase && !explicitRevision)
                row.fields.baseContent = structuredClone(oldFields.baseContent);
            // 空基础层可以初始化；已有基础层只有携带插件生成的事件证据时才允许替换。
            if ('recentHistory' in oldFields)
                row.fields.recentHistory = structuredClone(oldFields.recentHistory);
            else
                delete row.fields.recentHistory;
            if ('solidifiedHistory' in oldFields)
                row.fields.solidifiedHistory = structuredClone(oldFields.solidifiedHistory);
            else
                delete row.fields.solidifiedHistory;
        }
    }
    return attachLegacyAliases(dedupeStrongStateRows(next, tables), tables);
}
function characterTitleAliases(title) {
    const raw = String(title || '').trim();
    const parts = raw.split(/[｜|:：—–-]/).map(identityTitle).filter(Boolean);
    const stripped = identityTitle(raw.replace(/(?:人物|角色|人物状态|角色状态|档案|信息|当前状态)$/g, ''));
    return [...new Set([identityTitle(raw), stripped, ...parts].filter(Boolean))];
}
export function removeFocusCharacterDuplicates(snapshot, registry) {
    const tables = registryOrDefault(registry);
    const focusKey = tableByRole(tables, 'focus', false)?.key;
    if (!focusKey)
        return snapshot;
    const characters = stateRows(snapshot, tables);
    const aliases = new Set(characters.flatMap((row) => characterTitleAliases(row.title)));
    const contents = new Set(characters.map((row) => identityTitle(row.content)).filter((value) => value.length >= 12));
    snapshot[focusKey] = (snapshot[focusKey] ?? []).filter((row) => {
        if (row.source === 'manual' || row.locked)
            return true;
        const title = identityTitle(row.title);
        const content = identityTitle(row.content);
        return !(title && aliases.has(title)) && !(content.length >= 12 && contents.has(content));
    });
    return snapshot;
}
function rowArray(value) {
    return Array.isArray(value) ? value.map((item) => safeText(item, 500).trim()).filter(Boolean) : [];
}
const LEGACY_CHARACTER_STATE_FIELDS = ['currentFacts', 'currentStates', 'recentHistory', 'relationshipStates', 'abilityStates', 'presentationStates'];
function legacyCharacterTitle(value) {
    const original = safeText(value, 240).trim();
    let title = original
        .replace(/^(?:人物|角色)(?:的)?(?:当前)?状态\s*[:：|｜-]\s*/i, '')
        .replace(/^(?:人物|角色|档案|信息)\s*[:：|｜-]\s*/i, '')
        .replace(/\s*(?:的)?(?:人物|角色)?(?:当前)?状态\s*$/i, '')
        .replace(/\s*(?:人物|角色)?(?:档案|信息)\s*$/i, '')
        .trim();
    if (!title)
        title = original;
    const token = identityTitle(title);
    return new Set(['角色', '人物', '未知', '未命名', 'unknown', 'unknowncharacter']).has(token) ? '' : title;
}
function explicitLegacyStateTitle(value) {
    const title = safeText(value, 240).trim();
    return /^(?:人物|角色)(?:的)?(?:当前)?状态\s*[:：|｜-]/i.test(title)
        || /(?:的)?(?:人物|角色)?(?:当前)?状态\s*$/i.test(title);
}
function legacyBaseSignal(row) {
    const baseContent = safeText(row.fields?.baseContent, 12000).trim();
    return Boolean(baseContent || row.source === 'manual' || row.locked || row.lockMode === 'base' || row.lockMode === 'all');
}
function legacyStateSignal(row) {
    const generatedId = /^characters(?:_|$)/i.test(safeText(row.id, 160).trim());
    const mutableState = LEGACY_CHARACTER_STATE_FIELDS.some((field) => rowArray(row.fields?.[field]).length > 0);
    return explicitLegacyStateTitle(row.title) || (generatedId && mutableState);
}
function mergedRecall(base, state) {
    if (!base && !state)
        return undefined;
    return {
        any: [...new Set([...(base?.any ?? []), ...(state?.any ?? [])])],
        all: [...new Set([...(base?.all ?? []), ...(state?.all ?? [])])],
        exclude: [...new Set([...(base?.exclude ?? []), ...(state?.exclude ?? [])])],
    };
}
/**
 * 已建立对象的 title 是长期身份锚点。自动状态提取只能更新内容与别名，不能改名。
 * 模型若对同一稳定对象换了称呼，将新称呼并入 keywords / recall.any，继续沿用旧 title。
 * 玩家手动编辑不经过本函数，仍可显式修改条目名称。
 */
function preserveAnchoredTitle(existing, incoming) {
    const incomingTitle = safeText(incoming.title, 240).trim();
    const anchoredTitle = safeText(existing.title, 240).trim() || incomingTitle;
    const alias = incomingTitle && identityTitle(incomingTitle) !== identityTitle(anchoredTitle)
        ? incomingTitle
        : '';
    const keywords = normalizeKeywords([
        ...(existing.keywords ?? []),
        ...(incoming.keywords ?? []),
        ...(alias ? [alias] : []),
    ]);
    const recall = mergedRecall(existing.recall, incoming.recall);
    if (recall)
        recall.any = normalizeKeywords([...(recall.any ?? []), anchoredTitle, ...keywords]);
    return {
        ...incoming,
        id: existing.id,
        title: anchoredTitle,
        keywords,
        recall,
    };
}
/**
 * 仅供 V30 一次性升级使用：旧版本可能已把同一角色的多个切面保存为同名不同 ID。
 * 现在同一 characters 表内同一规范名称必须收拢为一个对象，其他 ID 引用同步改写。
 */
export function mergePersistedCharacterDuplicates(snapshot, registry) {
    const tables = registryOrDefault(registry);
    const key = characterTableKey(tables);
    const idRemap = new Map();
    if (!key)
        return { snapshot, idRemap, mergedCount: 0 };
    // 尚保留可枚举旧 state 表时应交给 V29 的确定性双表迁移，V30 不参与猜测。
    if (key !== 'state' && Object.prototype.propertyIsEnumerable.call(snapshot, 'state') && Array.isArray(snapshot.state)) {
        return { snapshot, idRemap, mergedCount: 0 };
    }
    const working = structuredClone(snapshot);
    const groups = new Map();
    for (const row of working[key] ?? []) {
        const displayTitle = legacyCharacterTitle(row.title);
        const token = identityTitle(displayTitle);
        if (!token)
            continue;
        groups.set(token, [...(groups.get(token) ?? []), row]);
    }
    for (const rows of groups.values()) {
        if (rows.length < 2)
            continue;
        const protectedRows = rows.filter(legacyBaseSignal);
        const canonical = protectedRows.find((row) => row.locked || row.lockMode === 'all')
            ?? protectedRows[0]
            ?? rows[0];
        const title = legacyCharacterTitle(canonical.title) || canonical.title;
        const stateRows = rows.filter(legacyStateSignal);
        const freshestState = [...stateRows].sort((left, right) => {
            const time = String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
            return time || String(right.id || '').localeCompare(String(left.id || ''));
        })[0];
        if (freshestState) {
            canonical.content = freshestState.content || canonical.content;
            canonical.status = freshestState.status || canonical.status;
            canonical.updatedAt = freshestState.updatedAt || canonical.updatedAt;
            canonical.lifecycle = structuredClone(freshestState.lifecycle ?? canonical.lifecycle);
            canonical.eventId = freshestState.eventId || canonical.eventId;
        }
        const suppliedStateFields = new Set();
        for (const row of stateRows) {
            for (const field of LEGACY_CHARACTER_STATE_FIELDS) {
                if (Object.prototype.hasOwnProperty.call(row.fields ?? {}, field))
                    suppliedStateFields.add(field);
            }
        }
        for (const row of protectedRows) {
            if (!suppliedStateFields.size)
                continue;
            row.fields ||= {};
            for (const field of suppliedStateFields)
                delete row.fields[field];
        }
        for (const row of rows) {
            const originalTitle = safeText(row.title, 240).trim();
            row.title = title;
            if (originalTitle && identityTitle(originalTitle) !== identityTitle(title)) {
                row.keywords = normalizeKeywords([...(row.keywords ?? []), originalTitle]);
            }
        }
    }
    const result = mergeDuplicateStateRows(working, tables, new Set([key]));
    return {
        snapshot: attachLegacyAliases(result.snapshot, tables),
        idRemap: result.idRemap,
        mergedCount: result.mergedCount,
    };
}
/**
 * 兼容旧 API：执行集中对象身份模块，并保留传入 next 的原位更新语义。
 */
export function preserveStableObjectIds(previous, next, registry) {
    const tables = registryOrDefault(registry);
    const target = next;
    const result = canonicalizeObjectIdentities(previous, next, tables).snapshot;
    for (const key of Object.keys(target))
        delete target[key];
    for (const [key, rows] of Object.entries(result))
        target[key] = rows;
    return attachLegacyAliases(target, tables);
}
function regionStateText(row) {
    const fields = row.fields ?? {};
    return [row.title, row.content, row.status, ...rowArray(fields.currentFacts), ...rowArray(fields.currentStates), ...rowArray(fields.recentHistory), ...rowArray(fields.solidifiedHistory)].join(' ');
}
/**
 * 区域不是“当前位置”的副本。仅因进入、停留或提及地点产生的自动区域行会被剔除；
 * 有基础定义、长期历史或离开场景后仍成立的区域变化继续保留。
 */
export function enforceObjectViewAllocation(snapshot, registry) {
    const tables = registryOrDefault(registry);
    const spacetimeKey = tableByRole(tables, 'spacetime', false)?.key;
    const regionKey = tableByRole(tables, 'regions', false)?.key;
    if (!spacetimeKey || !regionKey)
        return snapshot;
    const spacetimeRows = snapshot[spacetimeKey] ?? [];
    const activeRows = spacetimeRows.filter((row) => !isEntryLifecycleHidden(row) && !/(已离开|历史场景|过去场景|非当前|已结束|已关闭|已归档|inactive|closed|ended|archived)/i.test(`${row.status} ${row.content}`));
    const current = activeRows.at(-1);
    if (!current)
        return snapshot;
    const currentIdentity = identityTitle(current.title);
    // 自动区域必须证明自己是独立对象：有稳定基础定义、已固化历史，或离开当前场景后仍成立的变化。
    // 纯进入/停留、设施列举、路径说明和一次性提及既不能复制当前时空，也不能以“另一个地点”名义残留。
    const persistentChangeSignal = /(封锁|解封|开放|关闭|停用|启用|损坏|损毁|坍塌|重建|占领|失守|戒严|污染|净化|改造|沦陷|恢复|摧毁|建成|归属改变|控制权|驻军撤离|驻军进驻|灾害|危机解除|永久|长期持续)/i;
    const sceneOnlySignal = /(当前|进入|来到|抵达|停留|正在|位于|设有|用于|用作|配备|包含|连接|通往|内部有|内有|可供)/i;
    const stableDefinitionSignal = /(属于|隶属|管辖|地处|坐落|是一座|是一个|是一处|是一片|区域类型|建筑类型|辖区|边界|常年|主要居民|主要产业|地貌|气候|历史上)/i;
    snapshot[regionKey] = (snapshot[regionKey] ?? []).filter((row) => {
        if (row.source === 'manual' || row.locked || row.lockMode === 'all')
            return true;
        const fields = row.fields ?? {};
        const baseContent = safeText(fields.baseContent, 12000).trim();
        const hasHistory = rowArray(fields.solidifiedHistory).length > 0;
        const text = regionStateText(row);
        if (hasHistory || persistentChangeSignal.test(text))
            return true;
        // 没有基础层或持续变化的自动行只是一次性场景记录，不应进入区域对象视图。
        if (!baseContent)
            return false;
        const regionIdentity = identityTitle(row.title);
        const duplicatesCurrentPath = Boolean(regionIdentity && currentIdentity && (currentIdentity.includes(regionIdentity) || regionIdentity.includes(currentIdentity)));
        if (!duplicatesCurrentPath)
            return true;
        // 当前路径上的区域只有明确稳定定义才保留；“设有某设施/用于某功能”仍属于时空描述。
        return stableDefinitionSignal.test(baseContent) && !sceneOnlySignal.test(baseContent.replace(stableDefinitionSignal, ''));
    });
    return attachLegacyAliases(snapshot, tables);
}
/**
 * 兼容旧 API：时空单例由 special-table-rules 统一执行。
 */
export function enforceCurrentSpacetimeSingleton(snapshot, registry) {
    const tables = registryOrDefault(registry);
    return attachLegacyAliases(enforceSpacetimeSingleton(snapshot, tables).snapshot, tables);
}
export function ensureCurrentSceneEntry(snapshot, registry) {
    const tables = registryOrDefault(registry);
    const spacetimeKey = tableByRole(tables, 'spacetime', false)?.key;
    const sceneKey = tableByRole(tables, 'scenes', false)?.key;
    if (!spacetimeKey || !sceneKey)
        return snapshot;
    const currentSpacetime = (snapshot[spacetimeKey] ?? []).filter((row) => !isHistoricalSceneRow(row)).at(-1);
    if (!currentSpacetime)
        return snapshot;
    const sceneRows = snapshot[sceneKey] ?? (snapshot[sceneKey] = []);
    if (sceneRows.some((row) => !isHistoricalSceneRow(row)))
        return snapshot;
    const titleToken = identityTitle(currentSpacetime.title);
    const existing = titleToken ? sceneRows.find((row) => identityTitle(row.title) === titleToken) : undefined;
    if (existing) {
        existing.content = currentSpacetime.content || existing.content;
        existing.status = '当前场景';
        existing.keywords = [...new Set([...(existing.keywords ?? []), currentSpacetime.title, ...(currentSpacetime.keywords ?? [])])];
        existing.semanticRole = 'scenes';
        existing.updatedAt = currentSpacetime.updatedAt || nowIso();
        return snapshot;
    }
    sceneRows.push(normalizeRow({
        id: `scene_${currentSpacetime.id}`,
        title: currentSpacetime.title,
        content: currentSpacetime.content || `当前场景位于${currentSpacetime.title}`,
        status: '当前场景',
        keywords: [currentSpacetime.title, ...(currentSpacetime.keywords ?? [])],
        fields: {
            currentFacts: Array.isArray(currentSpacetime.fields?.currentFacts) ? currentSpacetime.fields?.currentFacts : [],
            currentStates: Array.isArray(currentSpacetime.fields?.currentStates) ? currentSpacetime.fields?.currentStates : [],
            relatedObjects: Array.isArray(currentSpacetime.fields?.relatedObjects) ? currentSpacetime.fields?.relatedObjects : [],
            relatedEvents: Array.isArray(currentSpacetime.fields?.relatedEvents) ? currentSpacetime.fields?.relatedEvents : [],
        },
        updatedAt: currentSpacetime.updatedAt || nowIso(),
    }, sceneKey, sceneRows.length, undefined, tables));
    return snapshot;
}
export function snapshotRowCount(snapshot, registry, enabledOnly = false) {
    if (!snapshot)
        return 0;
    const tables = registryOrDefault(registry).filter((table) => !enabledOnly || table.enabled);
    return tables.reduce((sum, table) => sum + visibleStateRows(snapshot[table.key]).length, 0);
}
/**
 * UI 新增/编辑默认创建“人工基础保护”对象；只有显式 locked=true 才升级为完全锁定。
 * 这保证玩家写下的基础不被模型改写，同时允许后续明确事实更新状态层。
 */
export function upsertManualRow(snapshot, tableKey, row, registry) {
    const tables = registryOrDefault(registry);
    const next = normalizeSnapshot(snapshot, snapshot, tables);
    next[tableKey] ||= [];
    const idIndex = next[tableKey].findIndex((item) => item.id === row.id);
    const titleToken = identityTitle(safeText(row.title, 240));
    const titleIndex = titleToken
        ? next[tableKey].findIndex((item, index) => index !== idIndex && identityTitle(item.title) === titleToken)
        : -1;
    const targetIndex = titleIndex >= 0 ? titleIndex : idIndex;
    const target = targetIndex >= 0 ? next[tableKey][targetIndex] : undefined;
    const edited = idIndex >= 0 ? next[tableKey][idIndex] : undefined;
    const fields = {
        ...(target?.fields ?? {}),
        ...(edited?.fields ?? {}),
        ...(row.fields ?? {}),
    };
    const normalized = normalizeRow({
        ...target,
        ...edited,
        ...row,
        id: target?.id || edited?.id || row.id,
        keywords: [...new Set([...(target?.keywords ?? []), ...(edited?.keywords ?? []), ...(row.keywords ?? [])])],
        factIds: [...new Set([...(target?.factIds ?? []), ...(edited?.factIds ?? []), ...(row.factIds ?? [])])],
        eventIds: [...new Set([
                ...(target?.eventIds ?? (target?.eventId ? [target.eventId] : [])),
                ...(edited?.eventIds ?? (edited?.eventId ? [edited.eventId] : [])),
                ...(row.eventIds ?? (row.eventId ? [row.eventId] : [])),
            ])],
        fields,
        source: 'manual',
        locked: row.locked ?? edited?.locked ?? target?.locked ?? false,
        updatedAt: nowIso(),
    }, tableKey, targetIndex >= 0 ? targetIndex : next[tableKey].length, target, tables);
    if (targetIndex >= 0)
        next[tableKey][targetIndex] = normalized;
    else
        next[tableKey].push(normalized);
    if (idIndex >= 0 && idIndex !== targetIndex) {
        const removedId = edited?.id;
        next[tableKey].splice(idIndex, 1);
        if (removedId && removedId !== normalized.id)
            rewriteObjectReferences(next, new Map([[removedId, normalized.id]]));
    }
    return dedupeStrongStateRows(next, tables);
}
/**
 * 人工修正对象归属表格。保留稳定 ID、事实/事件引用与人工保护语义；
 * 目标表不支持的角色生命周期字段会在归一化时自然移除。
 */
export function moveManualRow(snapshot, sourceTableKey, targetTableKey, rowId, row, registry) {
    const tables = registryOrDefault(registry);
    if (sourceTableKey === targetTableKey)
        return upsertManualRow(snapshot, sourceTableKey, { ...row, id: rowId }, tables);
    const next = normalizeSnapshot(snapshot, snapshot, tables);
    const source = (next[sourceTableKey] ?? []).find((item) => item.id === rowId);
    if (!source)
        throw new Error('要移动的条目不存在或已被更新');
    const title = safeText(row.title ?? source.title, 240).trim();
    const sameTitle = (next[targetTableKey] ?? []).find((item) => canonicalObjectTitle(item.title) === canonicalObjectTitle(title));
    const previousId = source.id;
    const targetId = sameTitle?.id || previousId;
    const mergedFields = { ...(source.fields ?? {}), ...(row.fields ?? {}) };
    let moved = upsertManualRow(next, targetTableKey, {
        ...source,
        ...row,
        id: targetId,
        fields: mergedFields,
        source: 'manual',
    }, tables);
    moved[sourceTableKey] = (moved[sourceTableKey] ?? []).filter((item) => item.id !== previousId);
    if (targetId !== previousId)
        moved = rewriteObjectReferences(moved, new Map([[previousId, targetId]]));
    return dedupeStrongStateRows(moved, tables);
}
export function deleteRow(snapshot, tableKey, rowId, registry) {
    const rawTitle = (snapshot[tableKey] ?? []).find((row) => row.id === rowId)?.title;
    const next = normalizeSnapshot(snapshot, snapshot, registry);
    const titleToken = identityTitle(rawTitle || '');
    next[tableKey] = (next[tableKey] ?? []).filter((row) => row.id !== rowId && (!titleToken || identityTitle(row.title) !== titleToken));
    return next;
}
function relevanceText(row) {
    return `${row.title} ${row.content} ${row.status} ${row.keywords.join(' ')}`;
}
function isPassiveObserver(row) {
    if (row.source === 'manual' || row.locked)
        return false;
    return isPurePassiveObserverText(relevanceText(row));
}
/** 最后一层确定性过滤：纯旁观者及其临时反应不得留在活跃视图。 */
export function filterPassiveObservers(snapshot, registry) {
    const tables = registryOrDefault(registry);
    for (const table of tables) {
        if (!table.enabled)
            continue;
        snapshot[table.key] = (snapshot[table.key] ?? []).filter((row) => !isPassiveObserver(row));
    }
    return snapshot;
}
