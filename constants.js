export const MODULE_NAME = 'mirrorAbyssV11';
export const LEGACY_MODULE_NAME = 'mirrorAbyss';
export const DISPLAY_NAME = '镜渊';
export const VERSION = '1.2.0-rc.13';
export const PIPELINE_VERSION = 'ma-pipeline-17';
export const TABLE_KEYS = [
    'focus',
    'spacetime',
    'characters',
    'relationships',
    'items',
    'skills',
    'events',
    'regions',
    'foundations',
];
export const TABLE_LABELS = {
    focus: '当前焦点',
    spacetime: '时间与地点',
    characters: '人物',
    relationships: '关系',
    items: '物品',
    skills: '技能与能力',
    events: '事件与流程',
    regions: '区域状态',
    foundations: '基础设定',
};
export const DEFAULT_SETTINGS = {
    enabled: true,
    autoState: true,
    showMessagePanel: true,
    showTopButton: true,
    auditEnabled: false,
    auditPrompt: '',
    // Compatibility-only rc.11 fields. The rc.13 pipeline does not use them,
    // but keeping them prevents mixed cached modules from failing during upgrade.
    auditFailAction: 'revise',
    revisionPrompt: '',
    maxRevisionAttempts: 1,
    stopOnRepeatedViolation: true,
    revisionFallbackAction: 'hide',
    autoSmallSummary: true,
    smallSummaryTurns: 12,
    autoLargeSummary: true,
    largeSummaryCount: 4,
    lorebookSync: true,
    autoCreateLorebook: true,
    lorebookName: '',
    vectorizeRows: false,
    latestContinuityConstant: true,
    lorebookLayout: 'semantic',
    repairInvalidJsonOnce: true,
    requestTimeoutMs: 90000,
    connections: {
        audit: { mode: 'current', profileId: '', profile: '' },
        // Compatibility-only; no revision request is issued by the rc.13 pipeline.
        revision: { mode: 'current', profileId: '', profile: '' },
        state: { mode: 'current', profileId: '', profile: '' },
        smallSummary: { mode: 'current', profileId: '', profile: '' },
        largeSummary: { mode: 'current', profileId: '', profile: '' },
    },
    ui: {
        activeTab: 'overview',
        activeTable: 'focus',
        graphScope: 'relations',
        graphZoom: 1,
    },
    migration: {
        legacyChecked: false,
    },
};
