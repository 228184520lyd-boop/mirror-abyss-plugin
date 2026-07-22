import { deepClone, hashText, safeText } from './core-utils.js';
export const CORE_FIELD_KEYS = [
    'id', 'title', 'content', 'keywords', 'status', 'factIds', 'eventId', 'recall',
    'baseContent', 'currentFacts', 'currentStates', 'recentHistory', 'solidifiedHistory', 'relatedObjects', 'relatedEvents',
    'absorbedMemory', 'relationshipStates', 'abilityStates', 'presentationStates', 'objectType', 'migrationStatus',
];
/** 玩家可改的是语义表头，不是底层字段身份。 */
export const EDITABLE_HEADER_FIELD_KEYS = ['title', 'content', 'status', 'keywords'];
const EDITABLE_HEADER_FIELD_KEY_SET = new Set(EDITABLE_HEADER_FIELD_KEYS);
const RESERVED_CUSTOM_FIELD_KEYS = new Set([
    ...CORE_FIELD_KEYS,
    'name', 'summary', 'source', 'locked', 'lockMode', 'lifecycle', 'entryLifecycle', 'updatedAt',
    'fact_ids', 'event_id', 'fields', '__proto__', 'prototype', 'constructor',
]);
const COMMON_FIELDS = [
    { key: 'id', label: '稳定ID', description: '同一对象必须沿用稳定ID；不得因场景、状态或总结版本变化重新创建。', type: 'string', required: true },
    { key: 'title', label: '对象', description: '对象的稳定名称或明确标识。', type: 'string', required: true },
    { key: 'content', label: '当前摘要', description: '只概括当前有效状态，不复制基础内容、已固化历史或其他表格内容。', type: 'string', required: true },
    { key: 'keywords', label: '关键词', description: '对象名、别名及可明确触发该对象的词。', type: 'string[]', required: true },
    { key: 'status', label: '状态', description: '对象当前生命周期、阶段或有效性标记。', type: 'string', required: true },
];
const OBJECT_LAYER_FIELDS = [
    { key: 'baseContent', label: '身份与对象定义', description: '对象本身是什么，承担身份锚点。已有非空值不得因外观、称呼、情绪或普通状态变化改写；仅正文明确纠正、重定义、转化、毁灭、重建或人工编辑时变化。', type: 'string', required: false },
    { key: 'currentFacts', label: '长期与现行事实', description: '正文明确成立、持续时间较长但仍可能被后续明确事实替换的属性与事实；不得从单次情绪或行为推断人格。', type: 'string[]', required: false },
    { key: 'currentStates', label: '当前状态', description: '正在发生、短期或阶段性的状态；当前层应保留最多细节，并允许后续更新、关闭或替换。', type: 'string[]', required: false },
    { key: 'recentHistory', label: '近期经历', description: '由小总结归并的近期事件过程、直接因果与尚有后续作用的影响；细节少于当前层、多于历史层。', type: 'string[]', required: false },
    { key: 'solidifiedHistory', label: '历史事实', description: '由大总结长期固化的最精简结果与不可忽略影响；不得把无关事件线混在同一事实中。', type: 'string[]', required: false },
    { key: 'relatedObjects', label: '关联对象', description: '明确参与或受影响的对象稳定名称；不得因同场或围观建立关联。', type: 'string[]', required: false },
    { key: 'relatedEvents', label: '关联事件', description: '直接施加当前状态或长期影响的事件名称。', type: 'string[]', required: false },
    { key: 'absorbedMemory', label: '承接记录', description: '由插件写入：其他临时条目退出前分发到本条目的持续结果。原条目在总结覆盖审计通过后删除；模型不得直接填写。', type: 'string[]', required: false },
];
const CHARACTER_FIELDS = [
    { key: 'presentationStates', label: '外观与表现', description: '当前服装、伪装、称呼、外观与他人明确认知；只记录表象，不得反向改写身份锚点。', type: 'string[]', required: false },
    { key: 'relationshipStates', label: '关系状态', description: '仅记录已明确发生变化且会影响后续的关系；同场、普通对话和推测不得写入。', type: 'string[]', required: false },
    { key: 'abilityStates', label: '能力状态', description: '已确认能力及其当前可用、受限、获得、失去或改变状态；禁止按身份补全。', type: 'string[]', required: false },
];
const CUSTOM_OBJECT_FIELDS = [
    { key: 'objectType', label: '对象类型', description: '玩家定义或待归并对象的类型。', type: 'string', required: false },
    { key: 'migrationStatus', label: '归并状态', description: '独立、待归并、已归并或存在歧义。', type: 'string', required: false },
];
const LIFECYCLE_FIELD = {
    key: 'lifecycle', label: '生命周期', description: '角色存在、活跃、记忆、证据与回流条件。', type: 'lifecycle', required: false,
};
function roleFields(role) {
    const fields = [...deepClone(COMMON_FIELDS), ...deepClone(OBJECT_LAYER_FIELDS)];
    if (role === 'characters' || role === 'state')
        fields.push(...deepClone(CHARACTER_FIELDS), deepClone(LIFECYCLE_FIELD));
    if (role === 'custom')
        fields.push(...deepClone(CUSTOM_OBJECT_FIELDS));
    return fields;
}
function defaults() {
    const definitions = [
        ['spacetime', '时空', '记录当前真实时间、所在场景及影响连续性的空间变化；提及、回忆或背景地点不得写成当前位置。', 'spacetime'],
        ['scenes', '场景', '记录场景自身明确改变的结构、环境、通行、危险与局面；人物、物品和事件变化不在场景条目复述。', 'scenes'],
        ['characters', '角色', '只记录具有持续作用的具体个体角色。外貌、站位、一次动作或一句台词不足以建档；组织、阵营、政权、群体、地点、制度和世界态势不得进入角色表。', 'characters'],
        ['items', '物品', '记录可区分物品自身明确改变的数量、完整度、功能、形态、激活与所在；角色已经表达的获得或失去不在物品条目复述。纯布景不建档。', 'items'],
        ['events', '事件', '事件是组织容器；只记录无法归给单一对象且不与对象结果重叠的独立过程，名称与状态由插件维持。', 'events'],
        ['regions', '地点', '记录真实进入或被明确建立为重要、可复用的地点及其定义、布局、归属、访问条件和持续变化；提及、回忆和模糊背景不建档。', 'regions'],
        ['globalChanges', '全局变化', '记录跨对象或区域持续生效的组织、阵营、政权、机构、群体格局、制度执行和世界态势；即使像角色一样行动也仍属全局。预测和局部波动不写入。', 'globalChanges'],
        ['foundations', '基础设定', '记录正文明确确认、长期稳定并约束世界运行的规则、制度、种族或世界设定；禁止按题材常识补全。', 'foundations'],
        ['customObjects', '自定义对象', '记录玩家主动定义或已满足建档资格但暂时无法安全归类的对象；不作为不确定信息和背景板的兜底。', 'custom'],
    ];
    return definitions.map(([key, name, purpose, role], order) => ({
        key, name, purpose, role, enabled: true, order, isDefault: true, fields: roleFields(role),
    }));
}
export const DEFAULT_TABLE_REGISTRY = Object.freeze(defaults());
/** 直接映射只处理能无歧义迁移的旧表；关系/技能/焦点由 migrateSnapshotTables 进一步处理。 */
export const LEGACY_TABLE_KEY_MAP = {
    spacetime: 'spacetime', scenes: 'scenes', characters: 'characters', state: 'characters', items: 'items',
    events: 'events', regions: 'regions', globalChanges: 'globalChanges', foundations: 'foundations',
    customObjects: 'customObjects',
};
function normalizeField(value, index) {
    const source = value && typeof value === 'object' ? value : {};
    const key = safeText(source.key, 60).trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!key)
        return null;
    const type = ['string', 'string[]', 'lifecycle'].includes(String(source.type)) ? source.type : 'string';
    return {
        key,
        label: safeText(source.label || key, 80).trim() || `字段${index + 1}`,
        description: safeText(source.description, 500).trim(),
        type,
        required: Boolean(source.required),
    };
}
function normalizedRole(value) {
    const allowed = new Set(['spacetime', 'scenes', 'characters', 'items', 'events', 'regions', 'globalChanges', 'foundations', 'custom', 'focus', 'state', 'skills', 'relationships']);
    return allowed.has(String(value)) ? String(value) : 'custom';
}
function mergeRoleFields(role, sourceFields) {
    const fields = roleFields(role);
    const incoming = (Array.isArray(sourceFields) ? sourceFields : []).map(normalizeField).filter((field) => Boolean(field));
    for (const field of incoming) {
        const existingIndex = fields.findIndex((existing) => existing.key === field.key);
        if (existingIndex < 0) {
            fields.push(field);
            continue;
        }
        if (!EDITABLE_HEADER_FIELD_KEY_SET.has(field.key))
            continue;
        const canonical = fields[existingIndex];
        fields[existingIndex] = {
            ...canonical,
            label: field.label || canonical.label,
            description: field.description || canonical.description,
            // key/type/required 永远由 canonical 定义提供，玩家改表头不能改变传输结构。
        };
    }
    return fields;
}
export function normalizeTableRegistry(value) {
    const source = Array.isArray(value) && value.length ? value : DEFAULT_TABLE_REGISTRY;
    const output = [];
    const used = new Set();
    source.forEach((item, index) => {
        const row = item && typeof item === 'object' ? item : {};
        let key = safeText(row.key, 80).trim().replace(/[^a-zA-Z0-9_-]/g, '');
        if (!key)
            key = `custom_${hashText(`${row.name}|${index}`)}`;
        if (used.has(key))
            key = `${key}_${index + 1}`;
        used.add(key);
        const role = normalizedRole(row.role);
        const rawName = safeText(row.name || DEFAULT_TABLE_REGISTRY.find((table) => table.key === key)?.name || `自定义表格 ${index + 1}`, 80).trim();
        const name = key === 'regions' && rawName === '区域' ? '地点' : rawName;
        output.push({
            key,
            name,
            purpose: safeText(row.purpose, 1000).trim() || '记录玩家定义、对后续生成有用的已显影对象与状态。',
            role,
            enabled: row.enabled !== false,
            order: Number.isFinite(Number(row.order)) ? Number(row.order) : index,
            isDefault: Boolean(row.isDefault || DEFAULT_TABLE_REGISTRY.some((table) => table.key === key)),
            fields: mergeRoleFields(role, row.fields),
        });
    });
    return output.sort((a, b) => a.order - b.order).map((table, order) => ({ ...table, order }));
}
/** rc.22 默认十表迁移为对象视图；保留玩家自定义视图和默认表上的自定义字段。 */
export function migrateTableRegistryToObjectViews(value) {
    const old = normalizeTableRegistry(value);
    const next = restoreDefaultTableRegistry();
    const sourceFor = {
        spacetime: ['spacetime'], scenes: ['scenes'], characters: ['characters', 'state'], items: ['items'], events: ['events'],
        regions: ['regions'], globalChanges: ['globalChanges'], foundations: ['foundations'], customObjects: ['customObjects'],
    };
    for (const table of next) {
        const source = old.find((item) => sourceFor[table.key]?.includes(item.key) || sourceFor[table.key]?.includes(item.role));
        if (!source)
            continue;
        table.enabled = source.enabled;
        table.fields = mergeRoleFields(table.role, source.fields);
    }
    const custom = old.filter((table) => !table.isDefault && !next.some((item) => item.key === table.key));
    return normalizeTableRegistry([...next, ...custom.map((table, index) => ({ ...table, order: next.length + index }))]);
}
export function enabledTables(registry) {
    return normalizeTableRegistry(registry).filter((table) => table.enabled);
}
export function tableByKey(registry, key) {
    return normalizeTableRegistry(registry).find((table) => table.key === key);
}
export function tableByRole(registry, role, enabledOnly = true) {
    return normalizeTableRegistry(registry).find((table) => (!enabledOnly || table.enabled) && table.role === role);
}
export function tableKeyForRole(registry, role, fallback = '') {
    return tableByRole(registry, role)?.key || fallback;
}
export function restoreDefaultTableRegistry() { return deepClone(DEFAULT_TABLE_REGISTRY); }
export function registryFingerprint(registry) {
    return hashText(JSON.stringify(normalizeTableRegistry(registry).map(({ key, name, purpose, role, enabled, order, fields }) => ({ key, name, purpose, role, enabled, order, fields }))));
}
export function customizedFieldLabel(table, fieldKey, fallback) {
    const current = table.fields.find((field) => field.key === fieldKey);
    const canonical = roleFields(table.role).find((field) => field.key === fieldKey);
    if (!current?.label || current.label === canonical?.label)
        return fallback;
    return current.label;
}
export function tableColumnHeaders(table) {
    const title = customizedFieldLabel(table, 'title', '对象');
    const content = customizedFieldLabel(table, 'content', '当前记录');
    const status = customizedFieldLabel(table, 'status', '状态');
    const keywords = customizedFieldLabel(table, 'keywords', '关键词');
    return { title, content, state: `${status}与${keywords}` };
}
export function editableHeaderText(table) {
    return EDITABLE_HEADER_FIELD_KEYS.map((key) => {
        const field = table.fields.find((item) => item.key === key)
            ?? roleFields(table.role).find((item) => item.key === key);
        return field ? `${field.label}｜${field.description}` : '';
    }).filter(Boolean).join('\n');
}
function splitVisibleFieldLine(line) {
    const vertical = line.indexOf('｜') >= 0 ? line.indexOf('｜') : line.indexOf('|');
    if (vertical >= 0) {
        return {
            label: safeText(line.slice(0, vertical), 80).trim(),
            description: safeText(line.slice(vertical + 1), 500).trim(),
        };
    }
    const colon = line.search(/[:：]/);
    if (colon >= 0) {
        return {
            label: safeText(line.slice(0, colon), 80).trim(),
            description: safeText(line.slice(colon + 1), 500).trim(),
        };
    }
    return { label: safeText(line, 80).trim(), description: '' };
}
export function updateTableHeaders(registry, key, headerText) {
    const current = normalizeTableRegistry(registry).find((table) => table.key === key);
    if (!current)
        return normalizeTableRegistry(registry);
    const updates = new Map();
    const rows = headerText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    rows.forEach((line, index) => {
        // 兼容旧版“字段键:玩家表头:说明”，新版 UI 不再展示底层字段键。
        const legacyParts = line.split(/[:：]/).map((part) => part.trim());
        const legacyKey = legacyParts[0] || '';
        if (EDITABLE_HEADER_FIELD_KEY_SET.has(legacyKey)) {
            const canonical = roleFields(current.role).find((field) => field.key === legacyKey);
            const label = safeText(legacyParts[1], 80).trim() || canonical?.label || legacyKey;
            const description = safeText(legacyParts.slice(2).join('：'), 500).trim() || canonical?.description || label;
            updates.set(legacyKey, { label, description });
            return;
        }
        const fieldKey = EDITABLE_HEADER_FIELD_KEYS[index];
        if (!fieldKey)
            return;
        const canonical = roleFields(current.role).find((field) => field.key === fieldKey);
        const visible = splitVisibleFieldLine(line);
        updates.set(fieldKey, {
            label: visible.label || canonical?.label || fieldKey,
            description: visible.description || canonical?.description || visible.label || fieldKey,
        });
    });
    const fields = current.fields.map((field) => {
        const update = updates.get(field.key);
        return update ? { ...field, ...update } : field;
    });
    return updateTableDefinition(registry, key, { fields });
}
function normalizedFieldLabel(value) {
    return safeText(value, 120).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}
export function parseCustomFields(fieldText = '', previousCustom = []) {
    const used = new Set();
    const usedPrevious = new Set();
    const previousByLabel = new Map(previousCustom.map((field) => [normalizedFieldLabel(field.label), field]));
    const rows = fieldText.split(/\n+/).map((value) => value.trim()).filter(Boolean);
    return rows.map((line, index) => {
        const legacyParts = line.split(/[:：]/).map((part) => part.trim());
        const isLegacy = legacyParts.length >= 3 && /^(?:string|string\[\])$/.test(legacyParts[2] || '');
        if (isLegacy) {
            const rawKey = legacyParts[0] || `field_${index + 1}`;
            let key = safeText(rawKey, 60).trim().replace(/[^a-zA-Z0-9_-]/g, '') || `field_${index + 1}`;
            if (RESERVED_CUSTOM_FIELD_KEYS.has(key))
                throw new Error(`字段“${key}”是系统保留字段，不能用作自定义字段键`);
            while (used.has(key))
                key = `${key}_${index + 1}`;
            used.add(key);
            const label = safeText(legacyParts[1] || key, 80).trim() || key;
            const type = legacyParts[2] === 'string[]' ? 'string[]' : 'string';
            const description = safeText(legacyParts.slice(3).join('：') || label, 500).trim();
            return { key, label, description, type, required: false };
        }
        const visible = splitVisibleFieldLine(line);
        const label = visible.label || `表头${index + 1}`;
        const labelToken = normalizedFieldLabel(label);
        let previous = previousByLabel.get(labelToken);
        if (!previous || usedPrevious.has(previous.key))
            previous = previousCustom[index];
        if (previous && usedPrevious.has(previous.key))
            previous = undefined;
        if (previous)
            usedPrevious.add(previous.key);
        let key = previous?.key || `field_${hashText(`${label}|${index}`)}`;
        if (RESERVED_CUSTOM_FIELD_KEYS.has(key))
            key = `field_${hashText(`${label}|${index}|custom`)}`;
        while (used.has(key))
            key = `${key}_${index + 1}`;
        used.add(key);
        return {
            key,
            label: safeText(label, 80).trim() || `表头${index + 1}`,
            description: safeText(visible.description || previous?.description || label, 500).trim(),
            type: previous?.type === 'string' ? 'string' : 'string[]',
            required: false,
        };
    });
}
export function customFieldText(table) {
    return table.fields.filter((field) => !CORE_FIELD_KEYS.includes(field.key) && field.key !== 'lifecycle')
        .map((field) => `${field.label}｜${field.description}`).join('\n');
}
export function updateTableFields(registry, key, fieldText) {
    const current = normalizeTableRegistry(registry).find((table) => table.key === key);
    if (!current)
        return normalizeTableRegistry(registry);
    const previousCustom = current.fields.filter((field) => !CORE_FIELD_KEYS.includes(field.key) && field.key !== 'lifecycle');
    const rows = fieldText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const legacyMode = rows.length > 0 && rows.every((line) => {
        const parts = line.split(/[:：]/).map((part) => part.trim());
        return parts.length >= 3 && /^(?:string|string\[\])$/.test(parts[2] || '');
    });
    const nextCustom = parseCustomFields(fieldText, previousCustom);
    if (legacyMode) {
        const nextByKey = new Map(nextCustom.map((field) => [field.key, field]));
        const previousKeys = new Set(previousCustom.map((field) => field.key));
        const removedKeys = previousCustom.filter((field) => !nextByKey.has(field.key)).map((field) => field.key);
        const addedKeys = nextCustom.filter((field) => !previousKeys.has(field.key)).map((field) => field.key);
        if (removedKeys.length && addedKeys.length) {
            throw new Error(`字段键是稳定键，不能在同一次表头编辑中把“${removedKeys.join('、')}”改为“${addedKeys.join('、')}”`);
        }
        for (const previous of previousCustom) {
            const next = nextByKey.get(previous.key);
            if (next && next.type !== previous.type)
                throw new Error(`字段“${previous.key}”的字段类型创建后不可直接修改`);
        }
    }
    const coreFields = current.fields.filter((field) => CORE_FIELD_KEYS.includes(field.key) || field.key === 'lifecycle');
    return updateTableDefinition(registry, key, { fields: [...coreFields, ...nextCustom] });
}
export function createCustomTable(registry, name, purpose, fieldText = '') {
    const next = normalizeTableRegistry(registry);
    const key = `custom_${hashText(`${name}|${Date.now()}|${next.length}`)}`;
    next.push({
        key,
        name: safeText(name, 80).trim() || '自定义表格',
        purpose: safeText(purpose, 1000).trim() || '记录玩家定义的对象、基础内容与可变状态。',
        role: 'custom', enabled: true, order: next.length, isDefault: false,
        fields: [...roleFields('custom'), ...parseCustomFields(fieldText)],
    });
    return normalizeTableRegistry(next);
}
export function updateTableDefinition(registry, key, patch) {
    return normalizeTableRegistry(registry).map((table) => table.key === key
        ? { ...table, ...patch, key: table.key, isDefault: table.isDefault, fields: patch.fields ? patch.fields.map((field, index) => normalizeField(field, index)).filter(Boolean) : table.fields }
        : table);
}
export function removeTableDefinition(registry, key) {
    return normalizeTableRegistry(registry).filter((table) => table.key !== key).map((table, order) => ({ ...table, order }));
}
export function moveTableDefinition(registry, key, direction) {
    const next = normalizeTableRegistry(registry);
    const index = next.findIndex((table) => table.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length)
        return next;
    [next[index], next[target]] = [next[target], next[index]];
    return next.map((table, order) => ({ ...table, order }));
}
function normalizedName(value) {
    return safeText(value, 240).toLowerCase().replace(/[\s·•._—–\-|｜:：()（）【】\[\]]+/g, '');
}
function characterNameAliases(value) {
    const raw = safeText(value, 240).trim();
    const stripped = raw
        .replace(/^(?:人物|角色|人物状态|角色状态|档案|信息)\s*[:：|｜-]?\s*/i, '')
        .replace(/\s*(?:人物|角色|人物状态|角色状态|档案|信息|当前状态)$/i, '');
    const candidates = [raw, stripped, ...raw.split(/[|｜:：—–-]/)];
    return [...new Set(candidates.map(normalizedName).filter((name) => name.length >= 2 || /[\u3400-\u9fff]/.test(name)))];
}
function list(value) { return Array.isArray(value) ? value.map((item) => safeText(item, 500).trim()).filter(Boolean) : []; }
function rowText(row) { return `${safeText(row?.title, 240)} ${safeText(row?.content, 4000)} ${list(row?.keywords).join(' ')}`; }
function appendField(row, field, value) {
    row.fields ||= {};
    const current = list(row.fields[field]);
    if (value && !current.includes(value))
        current.push(value);
    row.fields[field] = current;
}
function mergeIds(row, source) {
    row.factIds = [...new Set([...list(row.factIds ?? row.fact_ids), ...list(source.factIds ?? source.fact_ids)])];
    row.keywords = [...new Set([...list(row.keywords), ...list(source.keywords)])];
    if (!row.eventId && (source.eventId || source.event_id))
        row.eventId = safeText(source.eventId || source.event_id, 160);
}
function mergeLegacyCharactersByStableId(rows) {
    const output = [];
    const byId = new Map();
    for (const raw of rows) {
        const row = deepClone(raw);
        const id = safeText(row?.id, 160).trim();
        const existing = id ? byId.get(id) : undefined;
        if (!existing) {
            output.push(row);
            if (id)
                byId.set(id, row);
            continue;
        }
        const existingFields = existing.fields && typeof existing.fields === 'object' ? existing.fields : {};
        const incomingFields = row.fields && typeof row.fields === 'object' ? row.fields : {};
        for (const [key, value] of Object.entries(incomingFields)) {
            if (Array.isArray(value))
                existingFields[key] = [...new Set([...list(existingFields[key]), ...list(value)])];
            else if (!safeText(existingFields[key], 12000).trim() && safeText(value, 12000).trim())
                existingFields[key] = deepClone(value);
        }
        existing.fields = existingFields;
        if (safeText(row.content, 12000).trim())
            existing.content = row.content;
        if (safeText(row.status, 120).trim())
            existing.status = row.status;
        if (safeText(row.updatedAt, 80).trim())
            existing.updatedAt = row.updatedAt;
        existing.source = existing.source === 'manual' || row.source === 'manual' ? 'manual' : existing.source ?? row.source;
        existing.locked = Boolean(existing.locked || row.locked);
        existing.lockMode = existing.locked || existing.lockMode === 'all' || row.lockMode === 'all'
            ? 'all'
            : existing.source === 'manual' || existing.lockMode === 'base' || row.lockMode === 'base'
                ? 'base'
                : undefined;
        mergeIds(existing, row);
    }
    return output;
}
/**
 * 归属不唯一的旧关系、技能或人工焦点先进入待归并对象。
 * 这里保留原 id/正文和玩家锁定语义，不把“不确定归属”伪装成已确认的角色状态。
 */
function pendingCustom(row, objectType) {
    return {
        ...deepClone(row),
        id: safeText(row?.id, 160).trim() || `legacy_${objectType}_${hashText(rowText(row))}`,
        fields: { ...(row?.fields && typeof row.fields === 'object' ? deepClone(row.fields) : {}), objectType, migrationStatus: '待归并' },
    };
}
/**
 * 将旧角色/状态直接迁入角色对象；旧关系与技能只在对象匹配明确时分发到角色状态，否则保留为待归并自定义对象。
 * 旧自动焦点不迁移为事实；玩家人工/锁定焦点保留到自定义对象，避免数据丢失。
 */
export function migrateSnapshotTables(value, registry) {
    const source = value && typeof value === 'object' ? value : {};
    const tables = normalizeTableRegistry(registry);
    const output = Object.fromEntries(tables.map((table) => [table.key, []]));
    const characterKey = tableByRole(tables, 'characters', false)?.key || tableByRole(tables, 'state', false)?.key || 'characters';
    const customKey = tableByRole(tables, 'custom', false)?.key || 'customObjects';
    for (const [sourceKey, rawRows] of Object.entries(source)) {
        if (!Array.isArray(rawRows))
            continue;
        const targetKey = LEGACY_TABLE_KEY_MAP[sourceKey] ?? sourceKey;
        // 旧 characters/state 必须脱离 JSON 键顺序单独处理；characters 提供身份，
        // state 随后只覆盖当前正文、状态和更新时间。
        if (targetKey === characterKey && ['characters', 'state'].includes(sourceKey))
            continue;
        if (targetKey in output)
            output[targetKey].push(...deepClone(rawRows));
    }
    for (const sourceKey of ['characters', 'state']) {
        const rawRows = source[sourceKey];
        if (Array.isArray(rawRows))
            output[characterKey].push(...deepClone(rawRows));
    }
    const characters = mergeLegacyCharactersByStableId(output[characterKey] ?? []);
    output[characterKey] = characters;
    const characterNames = characters
        .map((row) => ({ row, names: characterNameAliases(row?.title) }))
        .filter((item) => item.names.length);
    // 关系允许一至两个明确角色；技能只允许唯一所有者。匹配数量超出边界时宁可待归并，也不猜测分发对象。
    const distribute = (rows, field, objectType) => {
        if (!Array.isArray(rows))
            return;
        for (const raw of rows) {
            const row = deepClone(raw);
            const text = normalizedName(rowText(row));
            const matches = characterNames.filter((item) => item.names.some((name) => text.includes(name)));
            const allowed = field === 'relationshipStates'
                ? (matches.length >= 1 && matches.length <= 2 ? matches : [])
                : (matches.length === 1 ? matches : []);
            if (!allowed.length) {
                if (customKey in output)
                    output[customKey].push(pendingCustom(row, objectType));
                continue;
            }
            const statement = `${safeText(row.title, 240).trim()}${safeText(row.content, 4000).trim() ? `：${safeText(row.content, 4000).trim()}` : ''}`;
            for (const match of allowed) {
                appendField(match.row, field, statement);
                if (row.eventId || row.event_id)
                    appendField(match.row, 'relatedEvents', safeText(row.eventId || row.event_id, 160));
                mergeIds(match.row, row);
            }
            // 人工/锁定旧行保留为迁移凭据，标记已归并；它们留在 UI 中但不再重复发布世界书。
            if ((row.source === 'manual' || row.locked) && customKey in output) {
                const migrated = pendingCustom(row, objectType);
                migrated.fields.migrationStatus = '已归并';
                migrated.fields.relatedObjects = allowed.map((match) => safeText(match.row.id || match.row.title, 240)).filter(Boolean);
                output[customKey].push(migrated);
            }
        }
    };
    distribute(source.relationships, 'relationshipStates', 'legacy_relationship');
    distribute(source.skills, 'abilityStates', 'legacy_skill');
    if (Array.isArray(source.focus) && customKey in output) {
        for (const row of source.focus) {
            if (row?.source === 'manual' || row?.locked)
                output[customKey].push(pendingCustom(row, 'legacy_focus_note'));
        }
    }
    return output;
}
