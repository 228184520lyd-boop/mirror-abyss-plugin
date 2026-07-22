/**
 * 模块职责：集中定义版本、任务类型、动态表格设置与默认值。
 * 维护边界：表格数量和名称不得在业务模块中写死，默认表仅用于首次初始化和恢复默认。
 */
export const MODULE_NAME = 'mirrorAbyssV11';
export const LEGACY_MODULE_NAME = 'mirrorAbyss';
export const DISPLAY_NAME = '镜渊';
export const VERSION = '1.3.17';
export const PIPELINE_VERSION = 'ma-pipeline-80';
export const DEFAULT_CONTENT_LIMITS = {
    tables: {
        spacetime: 700,
        scenes: 700,
        characters: 1800,
        items: 800,
        events: 2200,
        regions: 1200,
        globalChanges: 1500,
        foundations: 1500,
        customObjects: 1200,
    },
    smallSummary: 420,
    largeSummary: 900,
};
export const DEFAULT_STATE_PROMPTS = {
    admissionRules: [
        '只记录正文点名并明确成立的新增、改变与失效；没有变化的对象省略。',
        '在不遗漏明确事实的前提下，用最精炼、最简洁的自然表达。',
    ].join('\n'),
    exclusionRules: [
        '正文未提及、未证实或只能依靠常识推断的内容不生成。',
        '不遍历旧对象，不补齐类型，不解释、不铺陈、不重复。',
    ].join('\n'),
    routingRules: [
        '归属看谁发生变化；句中其他对象只作必要关联。',
        '角色承载自身变化；物品承载自身变化；场景与地点承载空间自身变化；全局与基础设定承载其自身变化。',
        '无法归给单一对象且不与对象结果重叠的独立过程才归事件。',
    ].join('\n'),
    evidenceRules: [
        '只依据本轮正文和相关旧记录；新旧冲突时，正文明确替换、结束或推翻才更新。',
    ].join('\n'),
    updateRules: [
        '同一事件可产生多个对象事实；不同对象的不同变化分别记录，同一对象的同一变化只写一次。',
        '各条合读还原完整事实，彼此不概括、不包含、不换词复述。',
        '获得与失去可分别归属不同对象；事件核心仅在有独立过程事实时出现。',
    ].join('\n'),
};
export const DEFAULT_SUMMARY_PROMPTS = {
    small: {
        coreQuestion: '材料中哪些明确事实构成这条事件线当前唯一有效的结果与直接连续性？',
        includeRules: [
            '正文已经明确建立、且仍直接构成当前结果的起因与承诺。',
            '正文明确形成的转折、决定及其结果。',
            '当前阶段已经形成、且未被后续事实替代的结果。',
            '材料中明确仍在持续的状态、限制与资源变化。',
            '正文已经明确建立、且当前仍成立的目标、责任、约束与结果。',
        ].join('\n'),
        excludeRules: [
            '台词复述、连续动作、场面调度、服装外貌、气氛和普通反应。',
            '没有介入或改变事件因果的旁观者、观众、路人。',
            '已经被后续结果覆盖的中间步骤。',
            '没有形成状态、关系、资源或事件结果的临时细节。',
            '已经失效、已经解决或只是重复改写的信息。',
        ].join('\n'),
        updateRules: [
            '上一版小总结只是待修订原料，不得在其后继续追加或机械缩写。',
            '结合新增事实，重写为当前唯一有效版本。',
            '新结果覆盖旧过程时，删除已失效的旧过程；只保留正文明确确认的当前结果。',
            '不同事件槽位绝不能混合人物、地点、因果或结果。',
        ].join('\n'),
        expressionRules: [
            '直接写对象、事实和当前结果，不写分析过程。',
            '每句话只承担一个近期连续性信息，并优先表达“变化后的当前结果”。',
            '相同信息只出现一次；没有内容的字段不要编造。',
            '遵守白盒硬上限；优先删除重复表达和已被新结果覆盖的过程，不新增事实。',
        ].join('\n'),
    },
    large: {
        coreQuestion: '材料中哪些事实被正文明确确认为跨场景、跨阶段持续成立？',
        includeRules: [
            '已经确认并跨阶段有效的结果。',
            '材料明确表述为不可逆、反复出现或长期持续的变化。',
            '长期身份、关系、能力、归属、制度或世界状态变化。',
            '材料明确建立并持续成立的因果结果。',
            '正文明确建立并跨阶段持续成立的责任、目标与约束。',
        ].join('\n'),
        excludeRules: [
            '事件经过、动作过程、台词、神态和气氛。',
            '没有介入或改变长期因果的旁观者、观众、路人。',
            '临时地点移动、短期情绪和即时状态。',
            '已经解决的误会、冲突、任务或普通阶段问题。',
            '只在当前场景成立、或已由当前状态表表达的短期信息。',
            '小总结的逐项缩写、近义改写或同义重复。',
        ].join('\n'),
        updateRules: [
            '不要逐句缩写小总结；只保留材料中已明确说明为长期、持续、不可逆或跨阶段成立的事实。',
            '上一版大总结只是待修订原料。没有新的长期变化时保持原意，不得扩写。',
            '长期事实被新事实推翻、结束或替换时，更新为当前唯一有效版本。',
            '不同事件槽位绝不能混合事实、因果、人物或地点。',
        ].join('\n'),
        expressionRules: [
            '每句话只表达一个已明确成立的长期结果、持续影响或跨阶段约束。',
            '直接写长期成立的对象、事实和因果，不写判断过程。',
            '相同信息只出现一次；材料未明确支持长期持续的内容不写入。',
            '遵守白盒硬上限；压缩重复表述和已被替代过程，不推断长期意义。',
        ].join('\n'),
    },
};
export const DEFAULT_SETTINGS = {
    enabled: true,
    hostControl: { enabled: true, vector: true, recursion: true },
    autoState: true,
    showMessagePanel: true,
    showTopButton: true,
    auditEnabled: false,
    auditPrompt: '',
    auditFailAction: 'revise',
    revisionPrompt: '',
    maxRevisionAttempts: 1,
    stopOnRepeatedViolation: true,
    revisionFallbackAction: 'hide',
    autoSmallSummary: true,
    smallSummaryTurns: 12,
    autoLargeSummary: true,
    largeSummaryCount: 4,
    statePrompts: DEFAULT_STATE_PROMPTS,
    summaryPrompts: DEFAULT_SUMMARY_PROMPTS,
    contentLimits: DEFAULT_CONTENT_LIMITS,
    lorebookSync: true,
    autoCreateLorebook: true,
    lorebookName: '',
    vectorizeRows: true,
    latestContinuityConstant: true,
    lorebookLayout: 'semantic',
    lorebookRecall: { similarityThreshold: 0.72, maxVectorResults: 8, totalCapacity: 24000 },
    requestTimeoutMs: 90000,
    stateContextChars: 18000,
    stateOutputTokens: 3072,
    stateChunkChars: 6000,
    tableRegistry: [],
    connections: {
        audit: { mode: 'current', profileId: '', profile: '' },
        revision: { mode: 'current', profileId: '', profile: '' },
        state: { mode: 'current', profileId: '', profile: '' },
        smallSummary: { mode: 'current', profileId: '', profile: '' },
        largeSummary: { mode: 'current', profileId: '', profile: '' },
    },
    ui: { activeTab: 'overview', activeTable: 'spacetime', graphScope: 'world', graphZoom: 1, memoryView: 'combined' },
    migration: { legacyChecked: false, dynamicTablesV23: false, objectViewsV26: false, sceneTableV33: false, entryRoutingV33: false, stateProtocolV37: false, hostControlV39: false, naturalModulesV39: false, conciseFactsV41: false },
};
