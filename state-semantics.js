const FORBIDDEN_FIELD_KEYS = new Set([
    'id', 'title', 'content', 'keywords', 'status',
    'recentHistory', 'solidifiedHistory', 'absorbedMemory',
    'factIds', 'eventId', 'eventIds', 'recall', 'lifecycle',
]);
const FIXED_FIELD_LAYERS = [
    { key: 'baseContent', label: '身份定义', aliases: ['身份定义', '身份与对象定义', '对象定义', '身份锚点'] },
    { key: 'currentFacts', label: '现行事实', aliases: ['现行事实', '长期与现行事实', '持续事实'] },
    { key: 'currentStates', label: '当前状态', aliases: ['当前状态', '当前现实', '即时状态', '阶段状态'] },
    { key: 'presentationStates', label: '外观表现', aliases: ['外观表现', '外观与表现', '表象状态'] },
    { key: 'relationshipStates', label: '关系状态', aliases: ['关系状态', '持续关系'] },
    { key: 'abilityStates', label: '能力状态', aliases: ['能力状态', '能力变化'] },
    { key: 'relatedObjects', label: '关联对象', aliases: ['关联对象', '直接关联对象'] },
    { key: 'relatedEvents', label: '关联事件', aliases: ['关联事件', '直接关联事件'] },
];
const PSEUDO_LAYERS = [
    { kind: 'content', label: '当前摘要', aliases: ['当前摘要', '摘要', '当前记录'] },
    { kind: 'status', label: '条目状态', aliases: ['条目状态', '存续状态', '生命周期状态'] },
    { kind: 'keywords', label: '检索词', aliases: ['检索词', '关键词', '别名'] },
];
function token(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s·•._—–\-|｜:：()（）【】\[\]<>《》“”"'`]+/gu, '');
}
function fieldByKey(table, key) {
    return table.fields.find((field) => field.key === key);
}
function customWritableFields(table) {
    const fixedKeys = new Set(FIXED_FIELD_LAYERS.map((item) => item.key));
    return table.fields.filter((field) => (!FORBIDDEN_FIELD_KEYS.has(field.key)
        && !fixedKeys.has(field.key)
        && field.type !== 'lifecycle'));
}
export function resolveStateLayer(table, raw) {
    const normalized = token(raw);
    if (!normalized)
        throw new Error(`变化层为空（${table.name}）`);
    for (const layer of PSEUDO_LAYERS) {
        if (layer.aliases.some((alias) => token(alias) === normalized))
            return { kind: layer.kind, label: layer.label };
    }
    for (const layer of FIXED_FIELD_LAYERS) {
        if (!layer.aliases.some((alias) => token(alias) === normalized))
            continue;
        const definition = fieldByKey(table, layer.key);
        if (!definition)
            throw new Error(`变化层“${layer.label}”不适用于${table.name}`);
        return { kind: 'field', key: definition.key, label: layer.label, definition };
    }
    const matches = customWritableFields(table).filter((field) => token(field.label) === normalized);
    if (matches.length === 1) {
        const definition = matches[0];
        return { kind: 'field', key: definition.key, label: definition.label, definition };
    }
    if (matches.length > 1)
        throw new Error(`变化层名称存在歧义（${table.name}）：${raw}`);
    throw new Error(`变化层未注册于${table.name}：${raw}`);
}
export function stateLayerLabelForField(table, key) {
    const fixed = FIXED_FIELD_LAYERS.find((item) => item.key === key);
    if (fixed)
        return fixed.label;
    return customWritableFields(table).find((field) => field.key === key)?.label;
}
export function writableStateLayers(table) {
    const content = fieldByKey(table, 'content');
    const status = fieldByKey(table, 'status');
    const keywords = fieldByKey(table, 'keywords');
    const output = [
        { label: '当前摘要', description: content?.description || '对象当前唯一有效概括。', multiple: false },
        { label: '条目状态', description: status?.description || '对象当前生命周期或有效性状态。', multiple: false },
        { label: '检索词', description: keywords?.description || '对象名、别名及检索触发词。', multiple: true },
    ];
    for (const layer of FIXED_FIELD_LAYERS) {
        const field = fieldByKey(table, layer.key);
        if (!field)
            continue;
        output.push({ label: layer.label, description: field.description || layer.label, multiple: field.type === 'string[]' });
    }
    for (const field of customWritableFields(table)) {
        output.push({ label: field.label, description: field.description || field.label, multiple: field.type === 'string[]' });
    }
    const seen = new Set();
    return output.filter((item) => {
        const normalized = token(item.label);
        if (!normalized || seen.has(normalized))
            return false;
        seen.add(normalized);
        return true;
    });
}
//# sourceMappingURL=state-semantics.js.map