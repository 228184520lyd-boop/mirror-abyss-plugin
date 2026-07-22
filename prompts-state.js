/**
 * 模块职责：依据动态表格注册表构造内部事实与行级状态固定文本协议。
 * 维护边界：只提取已发生、已显影内容；未返回行由插件保留，禁止模型重写完整旧快照。
 */
import { DEFAULT_CONTENT_LIMITS, DEFAULT_STATE_PROMPTS } from './constants.js';
import { DEFAULT_TABLE_REGISTRY, enabledTables, normalizeTableRegistry } from './domain-table-registry.js';
import { stateLayerLabelForField, writableStateLayers } from './domain-state-semantics.js';
const ACTIVE_STATUS_RE = /current|active|进行|当前|活跃|未决|持续|开放|受限|暂停/i;
const DIRECTORY_CHAR_BUDGET = 1600;
const MAX_DIRECTORY_ALIASES = 6;
const MAX_FULL_ROWS = 6;
const MAX_FULL_ROWS_PER_TABLE = 2;
const MAX_FACTS = 6;
function tables(registry) {
    return enabledTables(normalizeTableRegistry(registry?.length ? registry : DEFAULT_TABLE_REGISTRY));
}
const COMMON_STATE_LAYER_LABELS = new Set([
    '当前摘要', '条目状态', '检索词', '身份定义', '现行事实', '当前状态', '关联对象', '关联事件',
]);
function compactRegistryDescription(active) {
    const defaults = normalizeTableRegistry(DEFAULT_TABLE_REGISTRY);
    return active.map((table, index) => {
        const layers = writableStateLayers(table);
        const defaultTable = defaults.find((item) => item.key === table.key || (table.isDefault && item.role === table.role));
        const defaultLayers = new Map((defaultTable ? writableStateLayers(defaultTable) : []).map((layer) => [layer.label, layer]));
        const dedicated = layers.filter((layer) => !COMMON_STATE_LAYER_LABELS.has(layer.label));
        const overrides = defaultTable
            ? layers.filter((layer) => COMMON_STATE_LAYER_LABELS.has(layer.label) && defaultLayers.get(layer.label)?.description !== layer.description)
            : [];
        const title = table.fields.find((field) => field.key === 'title');
        const defaultTitle = defaultTable?.fields.find((field) => field.key === 'title');
        const notes = [];
        if (dedicated.length)
            notes.push(`专属层：${dedicated.map((layer) => `${layer.label}：${layer.description}`).join('；')}`);
        if (overrides.length)
            notes.push(`语义覆盖：${overrides.map((layer) => `${layer.label}：${layer.description}`).join('；')}`);
        if (title?.description && defaultTitle && title.description !== defaultTitle.description)
            notes.push(`对象命名：${title.description}`);
        const purpose = table.isDefault ? '' : `｜用途：${table.purpose}`;
        return `${index + 1}. ${table.name}｜类型：${kindLabel(table)}${purpose}${notes.length ? `｜${notes.join('｜')}` : ''}`;
    }).join('\n');
}
function kindLabel(table) {
    const labels = {
        spacetime: '时空', scenes: '场景', characters: '角色', items: '物品', events: '事件',
        regions: '地点', globalChanges: '全局', foundations: '基础设定', custom: '自定义对象',
    };
    return labels[table.role] || '自定义对象';
}
const MODEL_VISIBLE_RULE_REPLACEMENTS = [
    [/relationshipStates/gi, '关系状态'],
    [/presentationStates/gi, '外观表现'],
    [/solidifiedHistory/gi, '历史事实'],
    [/absorbedMemory/gi, '承接记录'],
    [/globalChanges/gi, '全局变化'],
    [/customObjects/gi, '自定义对象'],
    [/currentStates/gi, '当前状态'],
    [/currentFacts/gi, '现行事实'],
    [/recentHistory/gi, '近期经历'],
    [/relatedObjects/gi, '关联对象'],
    [/relatedEvents/gi, '关联事件'],
    [/abilityStates/gi, '能力状态'],
    [/baseContent/gi, '身份定义'],
    [/characters/gi, '角色'],
    [/character/gi, '角色'],
    [/foundations/gi, '基础设定'],
    [/spacetime/gi, '时空'],
    [/global/gi, '全局'],
    [/regions/gi, '地点'],
    [/region/gi, '地点'],
    [/scenes/gi, '场景'],
    [/scene/gi, '场景'],
    [/items/gi, '物品'],
    [/item/gi, '物品'],
    [/events/gi, '事件'],
    [/event/gi, '事件'],
    [/confirmed/gi, '确认'],
    [/reported/gi, '转述'],
    [/uncertain/gi, '不确定'],
];
function modelVisibleRuleText(value, fallback) {
    let text = String(value ?? '').trim() || fallback;
    for (const [pattern, replacement] of MODEL_VISIBLE_RULE_REPLACEMENTS)
        text = text.replace(pattern, replacement);
    return text;
}
export function stateSystemPrompt(registry, promptSettings = DEFAULT_STATE_PROMPTS, contentLimits = DEFAULT_CONTENT_LIMITS) {
    const active = tables(registry);
    const names = active.map((table) => table.name).join('、');
    const admissionRules = modelVisibleRuleText(promptSettings?.admissionRules, DEFAULT_STATE_PROMPTS.admissionRules);
    const exclusionRules = modelVisibleRuleText(promptSettings?.exclusionRules, DEFAULT_STATE_PROMPTS.exclusionRules);
    const routingRules = modelVisibleRuleText(promptSettings?.routingRules, DEFAULT_STATE_PROMPTS.routingRules);
    const evidenceRules = modelVisibleRuleText(promptSettings?.evidenceRules, DEFAULT_STATE_PROMPTS.evidenceRules);
    const updateRules = modelVisibleRuleText(promptSettings?.updateRules, DEFAULT_STATE_PROMPTS.updateRules);
    void contentLimits;
    return `“镜渊”事实书记｜稀疏自然事实

只记录本轮正文点名并明确成立的新增、改变与失效。
以“对象—变化范围”为单位：归属看谁发生变化；同一事件可有多个对象变化；同一对象的同一变化只写一次。各条合读还原完整事实，彼此不概括、不包含、不换词复述。

【输出】
使用 <MA_EVENT> 组织同一事件。第一行事件名，第二行只能是“进行中”或“已结束”。
对象模块第一行写对象稳定名称，后续直接写变化谓语，不重复对象名。只输出实际出现的模块，不补齐类型。用最精炼、最简洁的自然表达，保留必要对象、变化与结果，不解释、不铺陈。
<MA_CORE> 可省略；仅在存在无法归给单一对象、且不与对象结果重叠的过程事实时使用。
无新增事实时只输出：<MA_TURN>无新增事实</MA_TURN>

示例：
<MA_EVENT>
短剑交接
已结束
<MA_CHARACTER_STATE>
莉娅
失去短剑。
</MA_CHARACTER_STATE>
<MA_CHARACTER_STATE>
凯厄斯
获得短剑。
</MA_CHARACTER_STATE>
</MA_EVENT>

可用标签：
事件 <MA_CORE> <MA_EVENT_RESULT> <MA_EVENT_STATE> <MA_UNRESOLVED>
角色 <MA_CHARACTER_IDENTITY> <MA_CHARACTER_FACT> <MA_CHARACTER_STATE> <MA_CHARACTER_APPEARANCE> <MA_CHARACTER_RELATION> <MA_CHARACTER_ABILITY>
物品 <MA_ITEM_IDENTITY> <MA_ITEM_FACT> <MA_ITEM_STATE>
场景 <MA_SCENE_IDENTITY> <MA_SCENE_FACT> <MA_SCENE_STATE>
地点 <MA_REGION_IDENTITY> <MA_REGION_FACT> <MA_REGION_STATE>
全局 <MA_GLOBAL_IDENTITY> <MA_GLOBAL_FACT> <MA_GLOBAL_STATE>
基础设定 <MA_FOUNDATION_IDENTITY> <MA_FOUNDATION_FACT> <MA_FOUNDATION_STATE>
时空 <MA_SPACETIME_STATE>
自定义 <MA_CUSTOM>：表名、对象名、语义层、具体事实各一行。

【锚点】
${routingRules}

【准入】
${admissionRules}

【证据】
${evidenceRules}

【更新】
${updateRules}

【边界】
${exclusionRules}
不输出 JSON、键值、等号、代码块、判断过程、数据库字段、稳定 ID、事件 ID、事实 ID、删除或结算建议。
事件有未决事项时写“进行中”；结果已形成且没有未决事项时写“已结束”。
当前启用表：${names || '（无）'}。

【启用对象表】
${compactRegistryDescription(active) || '当前没有启用表格。'}

输出前只检查：是否明确、是否精炼、归属是否唯一、各条是否互不重叠、标签是否闭合。`;
}
function normalizeSearchText(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}
function stringList(value) {
    return Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : [];
}
function boundedList(value, count, chars) {
    return stringList(value).slice(-count).map((item) => item.slice(0, chars));
}
function compactLifecycle(row) {
    if (!row.lifecycle)
        return undefined;
    return {
        existence: row.lifecycle.existence,
        activity: row.lifecycle.activity,
        memory: row.lifecycle.memory,
        evidenceLevel: row.lifecycle.evidenceLevel,
        evidence: String(row.lifecycle.evidence || '').slice(0, 160),
        returnConditions: boundedList(row.lifecycle.returnConditions, 4, 100),
        returnBlockers: boundedList(row.lifecycle.returnBlockers, 4, 100),
    };
}
/**
 * 只给高相关对象发送“工作副本”，不是完整持久化行。
 * direct 允许更多当前切面；support 仅保留帮助代词、事件延续和身份判断的必要内容。
 */
function modelRow(row, detail) {
    const direct = detail === 'direct';
    const output = {
        title: row.title,
        content: String(row.content || '').slice(0, direct ? 240 : 160),
        keywords: (row.keywords ?? []).slice(0, direct ? 8 : 5).map((item) => String(item).slice(0, 60)),
        status: String(row.status || '').slice(0, 80),
    };
    const fields = row.fields && typeof row.fields === 'object' ? row.fields : {};
    for (const [key, value] of Object.entries(fields)) {
        if (key === 'baseContent')
            output[key] = String(value ?? '').slice(0, direct ? 240 : 160);
        else if (key === 'currentFacts' || key === 'currentStates')
            output[key] = boundedList(value, direct ? 6 : 3, direct ? 100 : 80);
        else if (key === 'relationshipStates' || key === 'abilityStates' || key === 'presentationStates')
            output[key] = boundedList(value, direct ? 4 : 2, direct ? 100 : 80);
        else if (key === 'relatedObjects' || key === 'relatedEvents')
            output[key] = boundedList(value, direct ? 6 : 4, 70);
        else if (Array.isArray(value))
            output[key] = boundedList(value, direct ? 4 : 2, direct ? 90 : 70);
        else
            output[key] = String(value ?? '').slice(0, direct ? 200 : 140);
    }
    return output;
}
function directoryEntry(item) {
    const titleToken = normalizeSearchText(item.row.title);
    const keywords = [...new Set((item.row.keywords ?? [])
            .map((value) => String(value ?? '').trim())
            .filter(Boolean)
            .filter((value) => normalizeSearchText(value) !== titleToken))]
        .slice(0, MAX_DIRECTORY_ALIASES)
        .map((value) => value.slice(0, 60));
    return { table: item.table.name, kind: kindLabel(item.table), title: String(item.row.title || '').slice(0, 100), keywords };
}
function directoryLine(entry) {
    const safe = (value) => contextValue(value).replace(/[｜|]/g, '／');
    const aliases = entry.keywords.map(safe).filter(Boolean).join('、');
    return `${safe(entry.kind)}｜${safe(entry.table)}｜${safe(entry.title)}${aliases ? `｜${aliases}` : ''}`;
}
function rowTerms(row) {
    return [row.id, row.title, ...(row.keywords ?? [])]
        .map(normalizeSearchText)
        .filter((term) => term.length >= 2);
}
function rowMatches(row, source) {
    return rowTerms(row).some((term) => source.includes(term));
}
function relatedTokens(row) {
    const fields = row.fields && typeof row.fields === 'object' ? row.fields : {};
    return [
        ...stringList(fields.relatedObjects),
        ...stringList(fields.relatedEvents),
    ].map(normalizeSearchText).filter(Boolean);
}
function compactSnapshotContext(previous, active, sourceText) {
    const source = normalizeSearchText(sourceText);
    const all = [];
    let order = 0;
    for (const table of active) {
        for (const row of previous[table.key] ?? []) {
            const direct = rowMatches(row, source);
            const statusActive = ACTIVE_STATUS_RE.test(row.status);
            all.push({
                table,
                row,
                direct,
                active: statusActive,
                spacetime: table.role === 'spacetime',
                activeEvent: table.role === 'events' && statusActive,
                activeCharacter: table.role === 'characters' && statusActive,
                order: order += 1,
            });
        }
    }
    const directTerms = new Set();
    const directReferences = new Set();
    for (const item of all) {
        if (!item.direct)
            continue;
        for (const term of rowTerms(item.row))
            directTerms.add(term);
        for (const term of relatedTokens(item.row))
            directReferences.add(term);
    }
    const related = (item) => (rowTerms(item.row).some((term) => directReferences.has(term))
        || relatedTokens(item.row).some((term) => directTerms.has(term)));
    const priority = (item) => item.direct ? 100
        : item.spacetime ? 90
            : item.activeEvent ? 80
                : related(item) ? 70
                    : item.activeCharacter ? 60
                        : item.active ? 30
                            : 0;
    const sorted = [...all].sort((a, b) => priority(b) - priority(a)
        || String(b.row.updatedAt || '').localeCompare(String(a.row.updatedAt || ''))
        || a.order - b.order);
    // 目录只发送本轮直接命中、显式关联与当前连续性对象；插件不把完整仓库交给模型扫描。
    const directory = [];
    let directoryChars = '<MA_DIRECTORY>\n</MA_DIRECTORY>'.length;
    let directoryOmitted = 0;
    for (const item of sorted.filter((candidate) => priority(candidate) > 0).slice(0, 32)) {
        const entry = directoryEntry(item);
        const line = directoryLine(entry);
        if (directoryChars + line.length + 1 > DIRECTORY_CHAR_BUDGET) {
            directoryOmitted += 1;
            continue;
        }
        directory.push(entry);
        directoryChars += line.length + 1;
    }
    const relevant = {};
    let total = 0;
    const perTable = new Map();
    for (const item of sorted) {
        if (priority(item) <= 0)
            continue;
        if (total >= MAX_FULL_ROWS)
            break;
        const count = perTable.get(item.table.key) ?? 0;
        if (count >= MAX_FULL_ROWS_PER_TABLE)
            continue;
        const detail = item.direct ? 'direct' : 'support';
        (relevant[item.table.key] ||= []).push(modelRow(item.row, detail));
        perTable.set(item.table.key, count + 1);
        total += 1;
    }
    return { directory, directoryOmitted, relevant };
}
function factMatches(fact, source) {
    const terms = [fact.factId, fact.eventId, fact.title, ...fact.keywords, ...fact.relatedEntities]
        .map(normalizeSearchText)
        .filter((term) => term.length >= 2);
    return terms.some((term) => source.includes(term));
}
function activeFactPayload(facts, sourceText) {
    const source = normalizeSearchText(sourceText);
    const scored = facts.map((fact, index) => ({
        fact,
        index,
        score: (factMatches(fact, source) ? 100 : 0) + (fact.active ? 20 : 0),
    })).sort((a, b) => b.score - a.score
        || String(b.fact.updatedAt || '').localeCompare(String(a.fact.updatedAt || ''))
        || b.index - a.index);
    const selected = scored.filter((item) => item.score > 0).slice(0, MAX_FACTS).map((item) => item.fact);
    return selected.map((fact) => ({
        occurred: boundedList(fact.occurredFacts, 3, 140),
        status: String(fact.status || '').slice(0, 60),
        time_range: {
            start: String(fact.timeRange?.start || '').slice(0, 80),
            end: String(fact.timeRange?.end || '').slice(0, 80),
            label: String(fact.timeRange?.label || '').slice(0, 100),
        },
        related_entities: boundedList(fact.relatedEntities, 8, 80),
        title: String(fact.title || '').slice(0, 120),
        type: String(fact.type || '').slice(0, 60),
        keywords: boundedList(fact.keywords, 6, 60),
        confidence: fact.confidence,
        active: fact.active,
    }));
}
function contextValue(value) {
    return String(value ?? '')
        .replace(/<\/?MA_[A-Z_]+>/gi, (tag) => tag.replace(/</g, '＜').replace(/>/g, '＞'))
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function pushContextField(lines, key, value) {
    if (Array.isArray(value)) {
        for (const item of value)
            pushContextField(lines, key, item);
        return;
    }
    if (value && typeof value === 'object') {
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
            pushContextField(lines, `${key}.${nestedKey}`, nestedValue);
        }
        return;
    }
    const text = contextValue(value);
    if (text)
        lines.push(`${key}：${text}`);
}
function contextFactBlocks(payload) {
    if (!payload.length)
        return '（无）';
    return payload.map((fact) => {
        const lines = ['<MA_CONTEXT_FACT>'];
        pushContextField(lines, 'title', fact.title);
        pushContextField(lines, 'type', fact.type);
        pushContextField(lines, 'status', fact.status);
        pushContextField(lines, 'confidence', fact.confidence);
        pushContextField(lines, 'active', fact.active);
        const time = fact.time_range && typeof fact.time_range === 'object'
            ? fact.time_range
            : {};
        pushContextField(lines, 'time_start', time.start);
        pushContextField(lines, 'time_end', time.end);
        pushContextField(lines, 'time_label', time.label);
        pushContextField(lines, 'occurred', fact.occurred);
        pushContextField(lines, 'related', fact.related_entities);
        pushContextField(lines, 'keyword', fact.keywords);
        lines.push('</MA_CONTEXT_FACT>');
        return lines.join('\n');
    }).join('\n');
}
function contextDirectoryBlock(directory, omitted) {
    const lines = ['<MA_DIRECTORY>'];
    for (const entry of directory)
        lines.push(directoryLine(entry));
    if (omitted > 0)
        lines.push(`省略对象：${omitted}`);
    lines.push('</MA_DIRECTORY>');
    return lines.join('\n');
}
function contextRowBlocks(relevant, active) {
    const blocks = [];
    for (const [tableKey, rows] of Object.entries(relevant)) {
        const table = active.find((item) => item.key === tableKey);
        if (!table)
            continue;
        for (const source of rows) {
            const row = source && typeof source === 'object' ? source : {};
            const lines = ['<MA_CONTEXT_ROW>'];
            pushContextField(lines, '对象类型', kindLabel(table));
            pushContextField(lines, '表格', table.name);
            pushContextField(lines, '对象', row.title);
            pushContextField(lines, '当前摘要', row.content);
            pushContextField(lines, '条目状态', row.status);
            pushContextField(lines, '检索词', row.keywords);
            for (const [key, value] of Object.entries(row)) {
                if (['title', 'content', 'status', 'keywords', 'lifecycle'].includes(key))
                    continue;
                const label = stateLayerLabelForField(table, key);
                if (label)
                    pushContextField(lines, label, value);
            }
            lines.push('</MA_CONTEXT_ROW>');
            blocks.push(lines.join('\n'));
        }
    }
    return blocks.join('\n') || '（无）';
}
export function stateUserPrompt(previous, playerText, assistantText, registry, internalFacts = [], repair = false) {
    const active = tables(registry);
    const sourceText = `${playerText}\n${assistantText}`;
    const context = compactSnapshotContext(previous, active, sourceText);
    return `【相关既有事实｜只用于识别同一对象与事件】\n${contextFactBlocks(activeFactPayload(internalFacts, sourceText))}

【相关对象短目录】\n${contextDirectoryBlock(context.directory, context.directoryOmitted)}

【相关对象当前工作副本】\n${contextRowBlocks(context.relevant, active)}

【玩家输入】\n${playerText || '（空）'}

【本轮正文】\n${assistantText}

只返回 <MA_TURN> 与按需出现的 <MA_EVENT>。对象模块第一行写对象名，后续直接写该对象的变化，不重复对象名。正文未点名或未明确证实就不生成；不补齐类型。<MA_CORE> 仅在存在无法归给单一对象且不与对象结果重叠的过程时使用，可省略。不同对象的不同变化可分别记录；同一对象的同一变化只写一次。${repair ? '\n上一次返回格式不完整：只整理标签与事件前两行，不改写、不补充事实。' : ''}`;
}
export function stateTextProtocolDescription(registry) {
    const active = tables(registry);
    return `自然事实模块：<MA_TURN>、<MA_EVENT> 及角色/物品/场景等对象模块。启用对象表：${active.map((table) => table.name).join('、')}。模型只写短事实；插件负责识别对象、映射语义层、分发、稳定 ID、总结窗口与结算。`;
}
