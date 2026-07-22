/**
 * 模块职责：把承载当前、近期与历史层的对象/事件表格条目转换为 constant / trigger / vector 三种世界书文档。
 * 维护边界：不使用数值权重决定记忆进入上下文；不同信息点可共享 fact_id/event_id，去重只按条目身份与完全相同内容，再按总容量裁剪。
 */
import { DEFAULT_CONTENT_LIMITS } from './constants.js';
import { customizedFieldLabel, DEFAULT_TABLE_REGISTRY, enabledTables, normalizeTableRegistry } from './domain-table-registry.js';
import { isEntryLifecycleHidden, isEntryParticipationPaused } from './domain-entry-lifecycle.js';
import { safeText } from './core-utils.js';
import { canonicalObjectTitle } from './domain-object-identity.js';
function registry(options) {
    return normalizeTableRegistry(options?.registry?.length ? options.registry : DEFAULT_TABLE_REGISTRY);
}
function uniq(values, limit = 40) {
    return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, limit);
}
function lifecycleLines(lifecycle) {
    if (!lifecycle)
        return [];
    const lines = [`存在状态：${lifecycle.existence}`, `活跃状态：${lifecycle.activity}`, `记忆状态：${lifecycle.memory}`, `证据等级：${lifecycle.evidenceLevel}`];
    if (lifecycle.evidence)
        lines.push(`判断依据：${lifecycle.evidence}`);
    if (lifecycle.returnConditions.length)
        lines.push(`可能回流条件：${lifecycle.returnConditions.join('；')}`);
    if (lifecycle.returnBlockers.length)
        lines.push(`阻止回流条件：${lifecycle.returnBlockers.join('；')}`);
    return lines;
}
function boundedLine(label, value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item ?? '').trim()).filter(Boolean).map((item) => `${label}：${item}`);
    }
    const text = String(value ?? '').trim();
    return text ? [`${label}：${text}`] : [];
}
function fitWholeLines(lines, maxChars) {
    const limit = Math.max(200, Math.round(Number(maxChars) || 1200));
    const output = [];
    let used = 0;
    for (const rawLine of lines) {
        const line = String(rawLine || '').trim();
        if (!line)
            continue;
        const separator = output.length ? 1 : 0;
        if (used + separator + line.length <= limit) {
            output.push(line);
            used += separator + line.length;
            continue;
        }
        // 优先丢弃完整的低优先级事实，不从中间硬截断；只有首个身份行本身过长时才安全截断。
        if (!output.length)
            return line.slice(0, Math.max(1, limit - 1)) + (line.length > limit ? '…' : '');
    }
    return output.join('\n');
}
function uniqueContentLines(lines) {
    const seen = new Set();
    const output = [];
    for (const raw of lines) {
        const line = String(raw || '').trim();
        const token = line.normalize('NFKC').replace(/\s+/g, ' ').trim();
        if (!line || seen.has(token))
            continue;
        seen.add(token);
        output.push(line);
    }
    return output;
}
function rowContent(table, row, maxChars) {
    const titleLabel = customizedFieldLabel(table, 'title', '');
    const statusLabel = customizedFieldLabel(table, 'status', '当前状态');
    const contentLabel = customizedFieldLabel(table, 'content', '当前记录');
    const keywordsLabel = customizedFieldLabel(table, 'keywords', '触发词');
    const heading = titleLabel
        ? `[${table.name}｜${titleLabel}：${row.title}]`
        : `[${table.name}：${row.title}]`;
    const fields = row.fields ?? {};
    const fieldByKey = new Map(table.fields.map((field) => [field.key, field]));
    const prioritizedKeys = [
        'baseContent', 'currentFacts', 'currentStates', 'presentationStates', 'relationshipStates', 'abilityStates',
        'relatedObjects', 'relatedEvents', 'recentHistory', 'solidifiedHistory',
    ];
    const lines = [heading];
    const baseField = fieldByKey.get('baseContent');
    if (baseField && 'baseContent' in fields)
        lines.push(...boundedLine(baseField.label, fields.baseContent));
    if (row.status && !/^(active|进行中)$/i.test(row.status.trim()))
        lines.push(`${statusLabel}：${row.status}`);
    if (row.content && canonicalObjectTitle(row.content) !== canonicalObjectTitle(row.title))
        lines.push(`${contentLabel}：${row.content}`);
    for (const key of prioritizedKeys.filter((key) => key !== 'baseContent')) {
        const field = fieldByKey.get(key);
        if (field && key in fields)
            lines.push(...boundedLine(field.label, fields[key]));
    }
    for (const field of table.fields) {
        if (prioritizedKeys.includes(field.key) || !(field.key in fields))
            continue;
        lines.push(...boundedLine(field.label, fields[field.key]));
    }
    lines.push(...lifecycleLines(row.lifecycle));
    if (row.keywords.length)
        lines.push(`${keywordsLabel}：${row.keywords.join('、')}`);
    // 事实 ID、事件 ID 与维护权限只保留在插件元数据中，不注入正文模型。
    return fitWholeLines(uniqueContentLines(lines), maxChars);
}
function rowSearchText(row) {
    const fieldText = safeText(JSON.stringify(row.fields ?? {}), 12000).trim();
    return `${row.title} ${row.content} ${row.status} ${row.keywords.join(' ')} ${fieldText}`;
}
function normalizedName(value) { return canonicalObjectTitle(value); }
/**
 * 世界书是成功状态表的直接投影，不在发布阶段再次判断“是否相关”。
 * 准入、归属和旁观者排除已经由状态提取与快照提交完成；这里仅排除禁用表和生命周期隐藏行。
 */
export function filterSnapshotForLorebook(snapshot, customRegistry) {
    const tables = normalizeTableRegistry(customRegistry?.length ? customRegistry : DEFAULT_TABLE_REGISTRY);
    const next = structuredClone(snapshot ?? {});
    const enabledKeys = new Set(enabledTables(tables).map((table) => table.key));
    for (const table of tables) {
        const rows = Array.isArray(next[table.key]) ? next[table.key] : [];
        next[table.key] = enabledKeys.has(table.key)
            ? rows.filter((row) => row && !isEntryLifecycleHidden(row))
            : [];
    }
    return next;
}
/** 表格成功后应当进入发布计划的可见对象数量。 */
export function countLorebookSourceRows(snapshot, customRegistry) {
    const tables = normalizeTableRegistry(customRegistry?.length ? customRegistry : DEFAULT_TABLE_REGISTRY);
    const filtered = filterSnapshotForLorebook(snapshot, tables);
    return enabledTables(tables).reduce((total, table) => total + (filtered[table.key]?.length ?? 0), 0);
}
function defaultTrigger(row) {
    const recall = row.recall ?? { any: [], all: [], exclude: [] };
    const any = uniq([...(recall.any ?? []), row.title, ...row.keywords], 32);
    return { any, all: uniq(recall.all ?? [], 20), exclude: uniq(recall.exclude ?? [], 20) };
}
function isEssentialState(row) {
    return /(不可缺失|昏迷|重伤|濒死|死亡|失踪|被拘禁|封印|当前在场|当前相关|核心参与)/i.test(rowSearchText(row));
}
function isHistoricalSpacetime(row) {
    return /(已离开|离开场景|历史场景|过去场景|非当前|已结束|已关闭|已归档|inactive|closed|ended|archived)/i.test(rowSearchText(row));
}
function currentSpacetimeRowId(rows) {
    const active = rows.filter((row) => !isHistoricalSpacetime(row));
    if (!active.length)
        return undefined;
    const explicit = active.filter((row) => /(当前场景|当前位置|当前地点|当前时空|正在此处|当前所在|current|active)/i.test(rowSearchText(row)));
    return (explicit.at(-1) ?? active.at(-1))?.id;
}
function recallModeFor(role, row, options, currentSpacetimeId) {
    // 玩家手动焦点只授予该对象 constant；不依赖连续性常驻开关，也不改变其他召回规则。
    if ((role === 'characters' || role === 'state') && row.id === options.focusObjectId)
        return 'constant';
    // 总结已沉降回独立事件条目；启用语义召回时，由事件条目承接整条事件线的当前、近期与历史语义。
    // 人物、地区、物品等对象仍使用名称/别名触发，保证每个世界书条目只有一种召回方式。
    if (role === 'events' && options.vectorize)
        return 'vector';
    if (!options.latestContinuityConstant)
        return 'trigger';
    if (role === 'globalChanges')
        return 'constant';
    if (role === 'spacetime')
        return row.id === currentSpacetimeId ? 'constant' : 'trigger';
    if (role === 'scenes')
        return row.id === currentSpacetimeId ? 'constant' : 'trigger';
    // 角色是否常驻只由玩家设置的唯一焦点决定；伤势等状态仍由 SillyTavern 触发机制召回。
    if (role === 'characters' || role === 'state')
        return 'trigger';
    if (role === 'foundations' && /(必要|规则|制度|禁止|必须|不可)/i.test(rowSearchText(row)))
        return 'constant';
    return 'trigger';
}
function makeDocument(key, logicalKey, comment, content, kind, mode, trigger, factIds, eventIds, updatedAt, options, disabled = false) {
    // 单条目只采用一种召回方式：constant、关键词 trigger 或事件线 vector。
    const actualMode = mode;
    return {
        key,
        logicalKey,
        comment: `[MA11] ${comment}`,
        content,
        keywords: actualMode === 'trigger' ? trigger.any : [],
        constant: !disabled && actualMode === 'constant',
        vectorized: !disabled && actualMode === 'vector',
        disabled,
        order: 0,
        updatedAt,
        kind,
        recallMode: actualMode,
        trigger,
        // SillyTavern 的相似度门槛和 Max Entries 是 Vector Storage 全局设置；这里只保存镜渊托管元数据。
        vector: { similarityThreshold: Math.min(0.99, Math.max(0, Number(options.similarityThreshold) || 0.72)), maxResults: Math.max(1, Math.round(Number(options.maxVectorResults) || 8)) },
        factIds: uniq(factIds, 100),
        eventIds: uniq(eventIds, 60),
        allowRecursion: options.recursion !== false,
    };
}
export function unconsumedSmallSummaries(small, large) {
    const legacy = new Set(large.flatMap((item) => item.sourceSummaryIds ?? item.sourceKeys));
    return small.filter((item) => !item.solidifiedByLargeSummaryId && !item.supersededBySmallSummaryId && !legacy.has(item.id));
}
function tableDocuments(snapshot, options) {
    if (!snapshot)
        return [];
    const tables = registry(options);
    const filtered = filterSnapshotForLorebook(snapshot, tables);
    const docs = [];
    for (const table of enabledTables(tables)) {
        const rows = filtered[table.key] ?? [];
        const currentSpacetimeId = table.role === 'spacetime' || table.role === 'scenes' ? currentSpacetimeRowId(rows) : undefined;
        for (const row of rows) {
            const mode = recallModeFor(table.role, row, options, currentSpacetimeId);
            const trigger = defaultTrigger(row);
            const titleToken = normalizedName(row.title) || row.id;
            docs.push(makeDocument(`view:${table.key}:${row.id}`, `view:${table.key}:${titleToken}`, `MA｜${table.name}｜${row.title}`, rowContent(table, row, Math.max(200, Number(options.entryLimits?.[table.key]) || Number(DEFAULT_CONTENT_LIMITS.tables[table.key]) || 1200)), `view:${table.role}`, mode, trigger, row.factIds ?? [], row.eventIds ?? (row.eventId ? [row.eventId] : []), row.updatedAt, options, isEntryParticipationPaused(row)));
        }
    }
    return docs;
}
/** 常驻→明确触发→向量；不同信息点即使共享 fact_id/event_id 也必须保留，仅按条目身份与完全相同内容去重后按总容量裁剪。 */
export function selectLorebookDocuments(documents, options) {
    const modeRank = { constant: 0, trigger: 1, vector: 2 };
    const selectionMode = (document) => {
        const focusedCharacter = Boolean(options.focusObjectId
            && ['view:characters', 'view:state'].includes(document.kind)
            && document.key.endsWith(`:${options.focusObjectId}`));
        // 焦点只改变入选角色的召回模式；选择、排序与容量裁剪仍按普通角色处理。
        return focusedCharacter ? 'trigger' : document.recallMode;
    };
    // 模式顺序来自产品召回流程；同一模式按事实更新时间和稳定键排序，绝不使用 UI order、importance 或权重裁剪记忆。
    const ordered = [...documents].sort((a, b) => {
        if (a.disabled !== b.disabled)
            return Number(a.disabled) - Number(b.disabled);
        const modeDifference = modeRank[selectionMode(a)] - modeRank[selectionMode(b)];
        if (modeDifference)
            return modeDifference;
        const timeDifference = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        return timeDifference || a.key.localeCompare(b.key);
    });
    const seenKeys = new Set();
    const seenContents = new Set();
    const output = [];
    let used = 0;
    let vectorCount = 0;
    const capacity = Math.max(2000, Math.round(Number(options.totalCapacity) || 24000));
    const maxVector = Math.max(1, Math.round(Number(options.maxVectorResults) || 8));
    for (const doc of ordered) {
        if (seenKeys.has(doc.key))
            continue;
        // disable 条目不进入主模型上下文预算，但必须留在期望计划中，确保 ST 原条目被真正暂停而非提前删除。
        if (doc.disabled) {
            output.push({ ...doc, constant: false, vectorized: false, keywords: [], order: output.length + 100 });
            seenKeys.add(doc.key);
            continue;
        }
        if (doc.recallMode === 'vector' && vectorCount >= maxVector)
            continue;
        const contentIdentity = doc.content.replace(/\s+/g, ' ').trim();
        if (contentIdentity && seenContents.has(contentIdentity))
            continue;
        const size = doc.content.length;
        if (used + size > capacity && output.length)
            continue;
        output.push({ ...doc, order: output.length + 100 });
        used += size;
        if (doc.recallMode === 'vector')
            vectorCount += 1;
        seenKeys.add(doc.key);
        if (contentIdentity)
            seenContents.add(contentIdentity);
    }
    return output;
}
export function buildSemanticLorebookDocuments(snapshot, _small, _large, options) {
    // 小总结/大总结是内部处理凭证，正文已经沉降进对象和事件条目的 recentHistory / solidifiedHistory。
    return selectLorebookDocuments(tableDocuments(snapshot, options), options);
}
export function buildDetailedLorebookDocuments(snapshot, _small, _large, options) {
    return selectLorebookDocuments(tableDocuments(snapshot, options), options);
}
export function buildLorebookDocuments(snapshot, small, large, options) {
    return options.layout === 'detailed' ? buildDetailedLorebookDocuments(snapshot, small, large, options) : buildSemanticLorebookDocuments(snapshot, small, large, options);
}
