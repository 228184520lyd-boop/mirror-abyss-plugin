/**
 * 模块职责：集中定义版本、任务类型、动态表格设置与默认值。
 * 维护边界：表格数量和名称不得在业务模块中写死，默认表仅用于首次初始化和恢复默认。
 */
export const MODULE_NAME = 'mirrorAbyssV11';
export const LEGACY_MODULE_NAME = 'mirrorAbyss';
export const DISPLAY_NAME = '镜渊';
export const VERSION = '1.3.14';
export const PIPELINE_VERSION = 'ma-pipeline-77';
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
        '当前事件中已经明确建立、且下一轮连续性需要读取的对象可建临时条目；建档不等于永久保存，后续由插件按事实状态结算。',
        '具体个体角色至少满足一项明确事实：主动造成事件结果；形成持续关系；承担正文已明确的目标、责任或约束；获得或失去持续有效的身份、能力、归属或状态；在多次出现中形成稳定作用。',
        '物品名称或身份可区分，且所有权、持有位置、数量、完整性、可用性、隐藏状态、证据状态、任务用途或独特功能中的任一项被正文明确建立或改变时，应建档；不要求已经多次出现。',
        '当前实际发生的叙事场景必须建立或更新场景条目；场景条目记录本次场景的参与对象、核心局面、直接限制与明确结果，不等同于地点本身。',
        '地点、区域、建筑或空间满足至少一项即可建档：当前正文真实进入并成为明确场景；被正文明确命名、定义或重复进入的空间；具有离开当前场景后仍成立的名称、功能、布局、归属、访问条件或持续变化。仅被提及、回忆或作为模糊背景时不建档。',
        '组织、阵营、制度、规则或其他对象必须具有离开当前场景后仍成立的定义、归属、状态、规则作用或持续变化。',
        '新对象应能被稳定命名并与已有对象区分；无法确认身份边界时暂不建档。',
    ].join('\n'),
    exclusionRules: [
        '仅被看见、经过、提到、描写姓名、服装、外貌、站位、情绪或短动作，不足以建立条目。',
        '路人、宾客、观众、侍卫、仆从、店员、士兵、村民、围观者等一次性功能角色默认排除，即使有姓名、外貌描写、动作或一句台词也不建档。',
        '匿名群体、职业称谓、临时称呼、场景陈设和只服务单次动作的对象默认排除。',
        '普通对话对象、短暂冲突对象、递交物品者、通报者、引路者和仅提供背景信息者默认排除。',
        '只有后续正文明确赋予其独立因果作用、持续关系或承接价值时，才可从背景对象升级为正式条目。',
    ].join('\n'),
    routingRules: [
        '分类看对象本质和事实作用域，不看是否有名字、目标、关系、行动或拟人化叙述；角色表不是兜底。',
        '角色：仅具体人物、独立人格生物或意识体；组织、阵营、政权、机构、群体、地点、制度和规则不得进入。',
        '场景：场景是“本次局面切片”，记录参与者、限制与承接点；结束后标记已结束或已离开，结果已分发且无独立后续时可结算删除。',
        '地点：可稳定定位的地点、区域、建筑、房间、道路或秘境；当前所在位置可同时更新时空。',
        '全局变化：组织、阵营、政权、机构、群体格局、制度执行与世界态势；即使像角色一样行动也属全局变化。',
        '物品：记录可区分的具体物件、装备、文件、材料、容器、货币批次或关键资源；不要把多个有独立归属或状态的命名物品合并成一行。',
        '基础设定记录稳定世界规则；事件与时空分别记录事件线和当前时空；只有确实无法安全归类时才用自定义对象。',
        '已有对象必须沿用原表，不得因本轮措辞变化改投角色表或新建重复条目。',
    ].join('\n'),
    evidenceRules: [
        '只使用本次正文明确出现的事实与插件提供的旧记录，不按常识、身份模板、文风暗示或可能性补全。',
        '亲历并明确发生的内容可标为确认；他人陈述、传闻或主观判断必须保留转述或不确定，不得自动升级。',
        '新旧内容冲突时，只有正文明确推翻、结束或替换旧事实才更新；证据不足时保留旧记录并省略本次更新。',
        '同名、近名或同职业对象没有明确别名、关系或连续上下文时不得合并；身份不清时宁可不写，也不要错误归并。',
        '正文未明确建立持续事实时，默认不新建；无法确认变化或身份时，省略对应事实和条目。',
    ].join('\n'),
    updateRules: [
        '只输出本轮新增、结束、被替换或发生实质变化的语义层；再次出现、重复描述和措辞变化不算更新。',
        '提交前逐项复查所有可区分物品：所有权、位置、数量、完整性、可用性、隐藏状态、用途或后续可取得性被建立或改变时，每件独立输出，不能只挑最显眼的一件。',
        '提交前必须确认当前真实场景有场景条目；发生场景切换时，新场景设为当前，旧场景更新为已结束或已离开。',
        '基础定义只有在正文明确重定义、毁灭、重建、转让或人工编辑时才改变；普通状态变化不得覆盖基础定义。',
        '当前状态写当前唯一有效版本：新状态替换旧状态，已解决未决事项应关闭，不把完整过程持续追加到当前状态。',
        '关系只有在正文明确形成承诺、归属、冲突、合作、支配、依赖或其他持续关系变化时才更新；明确关系变化写入角色的关系状态；同场、普通交谈和单次帮助不建立关系。',
        '每条事实只表达一个主体、一个变化和一个当前结果；相同信息只保留一次。',
        '只记录正文明确建立的变化，不评价重要性、不推测未来、不提出合并、删除、归档、结算或长期价值建议。',
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
    migration: { legacyChecked: false, dynamicTablesV23: false, objectViewsV26: false, sceneTableV33: false, entryRoutingV33: false, stateProtocolV37: false, hostControlV39: false, naturalModulesV39: false },
};
//# sourceMappingURL=constants.js.map