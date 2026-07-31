/** Mirror Abyss 2.0.0-lite.ui.30 — governed worldbook storage, current game time, scene settlement, activity-pack projection, and hard content budgets. */
var MA_MODULES={"activity-pack":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileActivityPack = compileActivityPack;
exports.activityPackSections = activityPackSections;
exports.activityPackBudget = activityPackBudget;
const governance_1 = require("./governance");
const util_1 = require("./util");

const SECTION_LIMITS = Object.freeze({
    核心规则: 260,
    当前时空: 180,
    当前场景: 260,
    现场人物: 900,
    当前事件: 300,
    生效规则: 220,
    必要历史: 260,
});

function compileActivityPack(entries, options = {}) {
    const list = (entries ?? []).filter((entry) => entry?.title !== governance_1.ACTIVITY_PACK_TITLE);
    const focusUid = String(options.focusUid ?? '');
    const context = (0, governance_1.activeContext)(list, focusUid, options.currentSceneTitle || '');
    const gameTime = options.gameTime ?? null;
    const budget = activityPackBudget(context.characters.length);
    if (Number(options.hardMax) > 0) {
        budget.hardMax = Math.max(600, Math.min(4000, Number(options.hardMax)));
        budget.target = Math.min(budget.target, budget.hardMax);
    }
    const sections = activityPackSections(list, context, gameTime, budget);
    const contentLength = measureSerializedSections(sections);
    const diagnostics = activityDiagnostics(list, context, sections, budget, contentLength);
    return {
        rawTitle: governance_1.ACTIVITY_PACK_TITLE,
        title: governance_1.ACTIVITY_PACK_TITLE,
        type: '运行包',
        name: '当前活动',
        keywords: ['当前活动'],
        sections,
        budget,
        contentLength,
        diagnostics,
    };
}

function activityPackBudget(characterCount) {
    const characters = Math.max(0, Math.min(6, Number(characterCount || 0)));
    return {
        target: Math.min(1800, 760 + characters * 180),
        hardMax: Math.min(2200, 980 + characters * 210),
        characterCount: characters,
    };
}

function activityPackSections(entries, context, gameTime, budget) {
    const foundations = entries.filter((entry) => entry.type === '基础设定');
    const currentScene = context.scene;
    const activeEvent = selectActiveEvent(context.activeEvents, currentScene, context.characters);
    const characters = prioritizeCharacters(context.characters, context.focus, activeEvent);
    const relationIndex = (0, governance_1.buildDirectRelationIndex)(entries);
    const history = selectNecessaryHistory(entries, activeEvent, currentScene, characters, relationIndex);
    const sections = [];
    pushSection(sections, '核心规则', compactEntries(foundations, ['世界常识', '自然规则', '社会规则', '能力与技术'], SECTION_LIMITS.核心规则, 4));
    const timeLines = [];
    if (gameTime?.label) timeLines.push(`当前游戏时间：${gameTime.label}`);
    if (currentScene?.name) timeLines.push(`当前场景：${currentScene.name}`);
    pushSection(sections, '当前时空', timeLines);
    pushSection(sections, '当前场景', compactScene(currentScene));
    pushSection(sections, '现场人物', compactCharacters(characters, SECTION_LIMITS.现场人物));
    pushSection(sections, '当前事件', compactEvent(activeEvent, SECTION_LIMITS.当前事件));
    pushSection(sections, '生效规则', compactApplicableRules(entries, currentScene, activeEvent));
    pushSection(sections, '必要历史', history.map((entry) => compactHistory(entry)).filter(Boolean));
    return trimSectionsToBudget(sections, budget.hardMax);
}

function pushSection(sections, name, lines) {
    const clean = (0, util_1.unique)((lines ?? []).map(cleanLine).filter(Boolean));
    if (!clean.length) return;
    sections.push({ name, lines: clean, empty: false });
}
function cleanLine(value) {
    return String(value ?? '').replace(/^\s*[-*]\s*/u, '').replace(/\s+/gu, ' ').trim();
}
function compactEntries(entries, sectionNames, maxChars, maxLines) {
    const lines = [];
    for (const entry of entries) {
        for (const section of sectionNames) {
            for (const line of entry.sections?.values?.[section] ?? []) {
                const cleaned = cleanLine(line);
                if (!cleaned) continue;
                lines.push(cleaned);
                if (lines.length >= maxLines) return fitLines(lines, maxChars);
            }
        }
    }
    return fitLines(lines, maxChars);
}
function compactScene(scene) {
    if (!scene) return [];
    const lines = [];
    for (const section of ['定义', '当前状态', '在场', '活动关联', '局部约束']) {
        for (const line of scene.sections?.values?.[section] ?? []) {
            if (section === '在场') lines.push(`在场：${stripLabel(line)}`);
            else if (section === '活动关联') lines.push(`活动：${stripLabel(line)}`);
            else lines.push(cleanLine(line));
        }
    }
    const fixedRoles = scene.sections?.values?.['常驻角色'] ?? [];
    if (fixedRoles.length) lines.push(`场景固定角色：${fixedRoles.slice(0, 3).map(stripLabel).join('；')}`);
    return fitLines(lines, SECTION_LIMITS.当前场景);
}
function compactCharacters(characters, maxChars) {
    const output = [];
    let used = 0;
    const selected = characters.slice(0, 6);
    const perCharacter = Math.max(140, Math.floor(maxChars / Math.max(1, selected.length)));
    for (const entry of selected) {
        const parts = [];
        for (const [label, section, cap] of [
            ['身份', '身份', 1],
            ['性格', '性格核心', 2],
            ['表达', '表达方式', 2],
            ['决策', '决策倾向', 2],
            ['关系', '关系立场', 2],
            ['当前', '当前', 3],
        ]) {
            const lines = (entry.sections?.values?.[section] ?? []).slice(0, cap).map(stripLabel).filter(Boolean);
            if (lines.length) parts.push({ label, lines });
        }
        if (!parts.some((item) => item.label === '性格')) {
            const stable = (entry.sections?.values?.['稳定'] ?? []).slice(0, 2).map(stripLabel).filter(Boolean);
            if (stable.length) parts.push({ label: '稳定', lines: stable });
        }
        if (!parts.length) continue;
        let line = renderCharacterLine(entry.name, parts);
        if (line.length > perCharacter) line = compressCharacterLine(entry.name, parts, perCharacter);
        if (!line) continue;
        if (used + line.length > maxChars && output.length) break;
        if (line.length > maxChars) continue;
        output.push(line);
        used += line.length;
    }
    return output;
}
function renderCharacterLine(name, parts) {
    return `${name}｜${parts.map((item) => `${item.label}：${item.lines.join('；')}`).join('｜')}`;
}
function compressCharacterLine(name, parts, maxLength) {
    const required = ['身份', '性格', '表达', '决策', '当前'];
    const ordered = [...parts].sort((left, right) => {
        const a = required.includes(left.label) ? required.indexOf(left.label) : required.length + 1;
        const b = required.includes(right.label) ? required.indexOf(right.label) : required.length + 1;
        return a - b;
    });
    for (const partMax of [34, 28, 22, 18]) {
        const compacted = ordered.map((item) => {
            const value = compactPackLine(item.lines.join('；'), partMax);
            return value ? { label: item.label, lines: [value] } : null;
        }).filter(Boolean);
        const line = renderCharacterLine(name, compacted);
        if (line.length <= maxLength) return line;
    }
    // 关系是条件信息；硬预算下最后移除关系，但五个生成约束栏目不主动删除。
    const core = ordered.filter((item) => item.label !== '关系').map((item) => {
        const value = compactPackLine(item.lines.join('；'), 18);
        return value ? { label: item.label, lines: [value] } : null;
    }).filter(Boolean);
    const line = renderCharacterLine(name, core);
    return line.length <= maxLength ? line : '';
}
function compactEvent(event, maxChars) {
    if (!event) return [];
    const lines = [];
    const participants = (event.sections?.values?.['参与'] ?? []).flatMap(splitNames);
    if (participants.length) lines.push(`参与：${(0, util_1.unique)(participants).join('、')}`);
    for (const section of ['已发生进展', '结果']) {
        for (const line of event.sections?.values?.[section] ?? []) lines.push(cleanLine(line));
    }
    return fitLines(lines, maxChars);
}
function compactApplicableRules(entries, scene, event) {
    const names = new Set([scene?.name, event?.name, ...eventNames(event)].filter(Boolean).map(util_1.normalizeFact));
    const rules = entries.filter((entry) => /^(?:世界|基础设定)$/u.test(entry.type) && entry.type !== '基础设定');
    const selected = rules.filter((entry) => {
        const text = (0, util_1.normalizeFact)(`${entry.title}\n${entry.content}`);
        return [...names].some((name) => name && text.includes(name));
    });
    return compactEntries(selected, ['制度', '固定事实', '持续影响', '公开局势'], SECTION_LIMITS.生效规则, 3);
}
function compactHistory(entry) {
    const results = (entry.sections?.values?.['结果'] ?? []).slice(0, 1).map(cleanLine);
    const progress = (entry.sections?.values?.['已发生进展'] ?? []).slice(-1).map(cleanLine);
    const body = [...results, ...progress].filter(Boolean).slice(0, 1)[0];
    return body ? `${entry.name}：${body}` : '';
}
function selectActiveEvent(events, scene, characters) {
    const names = new Set(characters.map((entry) => (0, util_1.normalizeFact)(entry.name)));
    const sceneName = (0, util_1.normalizeFact)(scene?.name ?? '');
    return [...(events ?? [])].sort((left, right) => {
        const score = (entry) => {
            const text = (0, util_1.normalizeFact)(`${entry.content}\n${entry.name}`);
            let value = Number(entry.updatedAt || 0) / 1e13;
            if (sceneName && text.includes(sceneName)) value += 4;
            for (const name of names) if (name && text.includes(name)) value += 2;
            return value;
        };
        return score(right) - score(left);
    })[0] ?? null;
}
function prioritizeCharacters(characters, focus, event) {
    const participants = new Set(eventNames(event).map(util_1.normalizeFact));
    return [...characters].sort((left, right) => {
        const score = (entry) => Number(entry === focus || entry.focus === true) * 10 + Number(participants.has((0, util_1.normalizeFact)(entry.name))) * 5 + Number(entry.updatedAt || 0) / 1e13;
        return score(right) - score(left) || left.title.localeCompare(right.title, 'zh-CN');
    });
}
function selectNecessaryHistory(entries, event, scene, characters, relationIndex = new Map()) {
    if (!event) return [];
    const activeNames = new Set([...eventNames(event), ...characters.map((entry) => entry.name)].map(util_1.normalizeFact));
    const sceneName = (0, util_1.normalizeFact)(scene?.name ?? '');
    const seedUids = new Set([event?.uid, scene?.uid, ...characters.map((entry) => entry.uid)].filter(Boolean).map(String));
    return entries
        .filter((entry) => entry.type === '事件' && (0, governance_1.currentEventState)(entry) === 'completed' && entry.uid !== event.uid)
        .map((entry) => {
            const text = (0, util_1.normalizeFact)(`${entry.name}\n${entry.content}`);
            let score = 0;
            for (const name of activeNames) if (name && text.includes(name)) score += 1;
            if (sceneName && text.includes(sceneName)) score += 1;
            const related = relationIndex.get(String(entry.uid)) ?? new Set();
            if ([...related].some((uid) => seedUids.has(String(uid)))) score += 3;
            return { entry, score };
        })
        .filter((item) => item.score >= 2)
        .sort((left, right) => right.score - left.score || Number(right.entry.updatedAt || 0) - Number(left.entry.updatedAt || 0))
        .slice(0, 2)
        .map((item) => item.entry);
}
function eventNames(event) {
    return (event?.sections?.values?.['参与'] ?? []).flatMap(splitNames);
}
function splitNames(value) {
    return String(value ?? '').replace(/^\s*[^：:]{1,24}\s*[：:]\s*/u, '').split(/[、,，/与和及]/u).map((item) => item.trim()).filter(Boolean);
}
function stripLabel(value) {
    return cleanLine(value).replace(/^\s*[^：:]{1,24}\s*[：:]\s*/u, '').trim();
}
function fitLines(lines, maxChars) {
    const output = [];
    let used = 0;
    for (const source of (0, util_1.unique)(lines.map(cleanLine).filter(Boolean))) {
        const line = compactPackLine(source, Math.min(120, maxChars));
        if (!line) continue;
        if (used + line.length > maxChars && output.length) break;
        if (line.length > maxChars) continue;
        output.push(line);
        used += line.length;
    }
    return output;
}
function compactPackLine(value, maxLength) {
    const line = cleanLine(value);
    if (line.length <= maxLength) return line;
    const chunks = line.split(/(?<=[。；！？!?])|[，,、｜]/u).map((item) => item.trim()).filter(Boolean);
    let result = '';
    for (const chunk of chunks) {
        const candidate = result ? `${result}，${chunk}` : chunk;
        if (candidate.length > maxLength) break;
        result = candidate;
    }
    return result ? (/[。；！？!?]$/u.test(result) ? result : `${result}。`) : '';
}
function measureSerializedSections(sections) {
    return sections.map((section) => `【${section.name}】\n${section.lines.map((line) => `- ${line}`).join('\n')}`).join('\n\n').length;
}
function trimSectionsToBudget(sections, hardMax) {
    const priority = ['核心规则', '当前时空', '当前场景', '现场人物', '当前事件', '生效规则', '必要历史'];
    const byName = new Map(sections.map((section) => [section.name, structuredClone(section)]));
    const output = priority.map((name) => byName.get(name)).filter(Boolean);
    const measure = () => measureSerializedSections(output);
    for (const name of ['必要历史', '生效规则']) {
        const section = output.find((item) => item.name === name);
        while (section?.lines?.length && measure() > hardMax) section.lines.pop();
    }
    for (const name of ['当前场景', '当前事件', '核心规则']) {
        const section = output.find((item) => item.name === name);
        while (section?.lines?.length > 1 && measure() > hardMax) section.lines.pop();
    }
    if (measure() > hardMax) {
        const lineCount = output.reduce((sum, section) => sum + section.lines.length, 0);
        const structural = output.reduce((sum, section) => sum + section.name.length + 5 + Math.max(0, section.lines.length - 1) * 3, 0) + Math.max(0, output.length - 1) * 2;
        let perLine = Math.max(18, Math.floor((hardMax - structural) / Math.max(1, lineCount)));
        while (perLine >= 18 && measure() > hardMax) {
            for (const section of output) section.lines = section.lines.map((line) => compactPackLine(line, perLine)).filter(Boolean);
            perLine -= 4;
        }
    }
    const cleaned = output.filter((section) => section.lines.length > 0);
    if (measureSerializedSections(cleaned) > hardMax) throw new Error(`当前活动包无法在不破坏核心内容的情况下压缩到 ${hardMax} 字以内`);
    return cleaned;
}
function activityDiagnostics(entries, context, sections, budget, contentLength) {
    const includedTitles = new Set();
    if (context.scene) includedTitles.add(context.scene.title);
    for (const entry of context.characters) includedTitles.add(entry.title);
    for (const entry of context.activeEvents) includedTitles.add(entry.title);
    return {
        currentScene: context.scene?.title ?? '',
        activeCharacters: context.characters.map((entry) => entry.title),
        activeEvents: context.activeEvents.map((entry) => entry.title),
        includedEntries: [...includedTitles],
        excludedWarehouseEntries: Math.max(0, entries.length - includedTitles.size),
        sectionChars: Object.fromEntries(sections.map((section) => [section.name, section.lines.join('\n').length])),
        contentLength,
        target: budget.target,
        hardMax: budget.hardMax,
        overTarget: contentLength > budget.target,
        overHardMax: contentLength > budget.hardMax,
    };
}
},"application":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MirrorAbyssApplication = void 0;
const host_1 = require("./host");
const settings_1 = require("./settings");
const audit_1 = require("./audit");
const memory_1 = require("./memory");
const worldbook_1 = require("./worldbook");
const migration_1 = require("./migration");
const world_setting_import_1 = require("./world-setting-import");
const util_1 = require("./util");
const control_panel_1 = require("./control-panel");
const worldbook_management_1 = require("./worldbook-management");
class MirrorAbyssApplication {
    constructor() {
        this.host = new host_1.HostAdapter();
        this.settingsStore = new settings_1.SettingsStore();
        this.worldbook = new worldbook_1.WorldbookAdapter(() => this.host.context(), () => this.host.chatKey());
        this.auditRunner = new audit_1.AuditRunner(this.host, () => this.settings(), (progress) => {
            const snapshot = this.activeSnapshots.get(progress?.chatKey || safeChatKey(this.host));
            const messageIndex = Number.isInteger(snapshot?.messageIndex) ? snapshot.messageIndex : null;
            if (progress?.phase === 'revision') {
                const detail = progress.detail || '审核未通过，正在生成修正版';
                this.controlPanel?.setTaskProgress?.('audit', 'running', detail, { messageIndex });
                if (snapshot?.taskType === 'full') {
                    this.controlPanel?.setTaskProgress?.('extract', 'queued', '上一轮审核未通过，等待修正版后提取', { messageIndex });
                }
                this.controlPanel?.setStatus?.(detail);
            }
        });
        this.memoryRunner = new memory_1.MemoryRunner(this.host, this.worldbook, () => this.settings(), (progress) => {
            const active = this.activeSnapshots.get(safeChatKey(this.host));
            this.controlPanel?.setTaskProgress?.('extract', progress?.state || 'running', progress?.detail || '', { ...(progress || {}), messageIndex: progress?.messageIndex ?? active?.messageIndex ?? null });
        });
        this.migrationService = new migration_1.MigrationService(this.host, this.worldbook, () => this.settings(), (progress) => {
            this.controlPanel?.setMigrationProgress?.(progress);
        }, (patch) => this.configure(patch));
        this.worldSettingImportService = new world_setting_import_1.WorldSettingImportService(this.host, this.worldbook, () => this.settings(), (progress) => {
            this.controlPanel?.setWorldSettingProgress?.(progress);
        });
        this.controlPanel = new control_panel_1.ControlPanel({
            getSettings: () => this.settings(),
            configure: (patch) => this.configure(patch),
            audit: () => this.audit(),
            extract: () => this.extract(),
            smallSummary: () => this.smallSummary(),
            largeSummary: () => this.largeSummary(),
            cancel: () => this.cancel(),
            loadWorkspace: () => this.loadWorkspace(),
            replanRecall: () => this.replanRecall(),
            updateEntry: (uid, patch) => this.updateEntry(uid, patch),
            setFocus: (uid, enabled) => this.setFocus(uid, enabled),
            setLocked: (uid, locked) => this.setLocked(uid, locked),
            migrate: () => this.migrate(),
            commitMigration: () => this.commitMigration(),
            undoMigration: () => this.undoMigration(),
            migrationPreview: () => this.migrationPreview(),
            previewWorldSettings: (sourceText) => this.previewWorldSettings(sourceText),
            commitWorldSettings: (sourceText) => this.commitWorldSettings(sourceText),
            clearWorldSettingsPreview: () => this.clearWorldSettingsPreview(),
            worldSettingsPreview: () => this.worldSettingsPreview(),
            // [MA-APP-API-01] UI 只调用 SillyTavern 官方 Connection Profile 服务，不保存密钥或自建 API 配置。
            bindProfileDropdown: (selector, selectedId, onChange) => this.host.bindProfileDropdown(selector, selectedId, onChange),
            connectionProfilesAvailable: () => this.host.connectionProfilesAvailable(),
            profileName: (profileId) => this.host.profileName(profileId),
        });
        this.cleanup = [];
        this.runningByChat = new Map();
        this.taskQueues = new Map();
        this.pendingTaskKeys = new Set();
        this.activeSnapshots = new Map();
        this.activeTokens = new Map();
        this.pendingMessageTimers = new Map();
        this.pendingSourceReconcileTimers = new Map();
        this.scopeRecoveryGeneration = 0;
        this.started = false;
    }
    start() {
        if (this.started) return;
        this.host.context();
        this.listen('MESSAGE_RECEIVED', (value) => this.scheduleMessage(messageIndexFromEvent(value)));
        this.listen('CHARACTER_MESSAGE_RENDERED', (value) => this.scheduleMessage(messageIndexFromEvent(value)));
        // [MA-DIALOGUE-01] 优先等待完整生成结束；旧版宿主没有该事件时，由稳定检测兜底。
        this.listen('GENERATION_ENDED', (value) => this.scheduleMessage(messageIndexFromEvent(value), true));
        for (const event of ['CHAT_CHANGED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED']) this.listen(event, (value) => this.onScopeChanged(event, value));
        this.controlPanel.mount();
        this.started = true;
    }
    stop() {
        if (!this.started) return;
        this.started = false;
        this.cancelAll('插件已停止');
        this.cleanup.splice(0).forEach((remove) => { try { remove(); } catch (error) { console.warn('[MirrorAbyss] listener cleanup failed', error); } });
        this.runningByChat.clear();
        this.taskQueues.clear();
        this.pendingTaskKeys.clear();
        this.activeSnapshots.clear();
        this.clearPendingMessageTimers();
        this.clearPendingSourceReconcileTimers();
        this.scopeRecoveryGeneration += 1;
        this.host.clearInternalMessageMutations();
        this.controlPanel.unmount();
    }
    isStarted() { return this.started; }
    settings() { return this.settingsStore.load(this.host.context()); }
    configure(patch) { return this.settingsStore.save(this.host.context(), patch); }
    audit() { return this.enqueueTask('audit', undefined, false); }
    extract() { return this.enqueueTask('extraction', undefined, false); }
    smallSummary() { return this.enqueueTask('smallSummary', undefined, false); }
    largeSummary() { return this.enqueueTask('largeSummary', undefined, false); }
    migrate() { return this.enqueueTask('migration', undefined, false); }
    commitMigration() { return this.enqueueTask('commitMigration', undefined, false); }
    undoMigration() { return this.enqueueTask('undoMigration', undefined, false); }
    migrationPreview() { return this.migrationService.previewSummary(); }
    previewWorldSettings(sourceText) {
        return this.enqueueMaintenance('worldSettingPreview', async (settings, snapshot) => this.worldSettingImportService.preview(settings, snapshot, sourceText));
    }
    commitWorldSettings(sourceText) {
        return this.enqueueMaintenance('worldSettingCommit', async (settings, snapshot) => this.worldSettingImportService.commit(settings, snapshot, sourceText));
    }
    clearWorldSettingsPreview() { return this.worldSettingImportService.clearPreview(); }
    worldSettingsPreview() { return this.worldSettingImportService.previewSummary(); }
    processLatest() { return this.enqueueTask('full', undefined, false); }
    cancel() {
        const key = this.host.chatKey();
        const token = this.activeTokens.get(key);
        const queued = this.rejectQueuedTasks('用户已取消排队任务', key);
        if (!token && !queued) {
            this.controlPanel.setStatus('当前聊天没有正在执行或排队的任务');
            return false;
        }
        if (token) {
            token.cancelled = true;
            token.reason = '用户已取消任务';
        }
        this.controlPanel.setStatus(`已取消${token ? '当前任务' : ''}${token && queued ? '及' : ''}${queued ? `${queued}个排队任务` : ''}`);
        return true;
    }
    status() {
        const key = safeChatKey(this.host);
        const queue = this.taskQueues.get(key);
        return { audit: this.auditRunner.currentStatus(key), memory: this.memoryRunner.currentStatus(key), active: this.activeTokens.has(key), queued: queue?.items?.length ?? 0 };
    }
    async loadWorkspace() {
        const settings = this.settings();
        const worldbook = await this.worldbook.read(settings);
        const currentGameTime = this.host.getCurrentGameTime();
        const management = (0, worldbook_management_1.buildWorldbookManagementView)(worldbook.entries, currentGameTime, settings);
        return {
            entries: worldbook.entries,
            worldbookName: worldbook.name,
            settings,
            currentGameTime,
            management,
            focusUid: this.host.getFocusUid(),
            matching: this.memoryRunner.currentStatus(this.host.chatKey()),
            task: this.status(),
            canUndoMigration: this.migrationService.canUndo(),
            hasMigrationPreview: this.migrationService.hasPreview(),
            migrationPreview: this.migrationService.previewSummary(),
            worldSettingsPreview: this.worldSettingImportService.previewSummary(),
        };
    }
    updateEntry(uid, patch) {
        return this.enqueueMaintenance('editEntry', async (settings, snapshot) => this.worldbook.updateEntry(settings, uid, patch, snapshot, () => this.host.assertSnapshot(snapshot, this.settings())));
    }
    setLocked(uid, locked) {
        return this.enqueueMaintenance('setLocked', async (settings, snapshot) => this.worldbook.setLocked(settings, uid, locked, snapshot, () => this.host.assertSnapshot(snapshot, this.settings())));
    }
    replanRecall() {
        return this.enqueueMaintenance('replanRecall', async (settings, snapshot) => this.worldbook.replanRecall(settings, snapshot, () => this.host.assertSnapshot(snapshot, this.settings())));
    }
    setFocus(uid, enabled = true) {
        return this.enqueueMaintenance('setFocus', async (settings, snapshot) => {
            const previous = this.host.getFocusUid();
            const next = enabled === false ? '' : String(uid ?? '');
            await this.worldbook.setFocus(settings, previous, next, snapshot, () => this.host.assertSnapshot(snapshot, this.settings()));
            try {
                await this.host.setFocusUid(next);
            }
            catch (error) {
                await this.worldbook.setFocus(settings, next, previous, snapshot, () => this.host.assertSnapshot(snapshot, this.settings()));
                throw error;
            }
            return this.worldbook.list(settings, snapshot, () => this.host.assertSnapshot(snapshot, this.settings()));
        });
    }
    listen(eventName, handler) {
        try { this.cleanup.push(this.host.subscribe(eventName, handler, false)); }
        catch (error) { console.warn(`[MirrorAbyss] 宿主事件 ${eventName} 不可用`, error); }
    }
    scheduleMessage(index, immediate = false) {
        if (!this.started) return;
        let turn;
        try { turn = this.host.latestTurn(index); }
        catch { return; }
        const key = `${turn.chatKey}|${turn.messageIndex}`;
        const previous = this.pendingMessageTimers.get(key);
        if (previous?.timer) globalThis.clearTimeout(previous.timer);
        const delay = immediate ? 0 : 650;
        const source = { ...turn, roleKey: safeRoleKey(this.host) };
        const timer = globalThis.setTimeout(async () => {
            if (this.pendingMessageTimers.get(key)?.timer !== timer) return;
            this.pendingMessageTimers.delete(key);
            try {
                const first = this.host.latestTurn(turn.messageIndex);
                if (!immediate) {
                    await new Promise((resolve) => globalThis.setTimeout(resolve, 220));
                    const stable = this.host.latestTurn(turn.messageIndex);
                    if (stable.contentHash !== first.contentHash) {
                        this.scheduleMessage(turn.messageIndex, false);
                        return;
                    }
                }
                await this.onMessage(turn.messageIndex);
            }
            catch (error) {
                const message = (0, util_1.errorText)(error);
                if (!/源正文|聊天已经切换|没有可处理/u.test(message)) console.error('[MirrorAbyss] dialogue scheduling failed', error);
            }
        }, delay);
        timer?.unref?.();
        this.pendingMessageTimers.set(key, { timer, source, immediate: Boolean(immediate) });
    }
    clearPendingMessageTimers() {
        for (const pending of this.pendingMessageTimers.values()) if (pending?.timer) globalThis.clearTimeout(pending.timer);
        this.pendingMessageTimers.clear();
    }
    clearPendingSourceReconcileTimers() {
        for (const pending of this.pendingSourceReconcileTimers.values()) globalThis.clearTimeout(pending.timer);
        this.pendingSourceReconcileTimers.clear();
    }
    async onMessage(index) {
        if (!this.started) return;
        if (!Number.isInteger(index)) {
            try { index = this.host.latestTurn().messageIndex; }
            catch { return; }
        }
        if (!this.host.isAssistantIndex(index)) return;
        const settings = this.settings();
        if (!settings.enabled) return;
        const autoAudit = settings.autoAudit === true && settings.auditEnabled !== false;
        const autoExtraction = settings.autoExtraction === true && settings.extractionEnabled !== false;
        if (!autoAudit && !autoExtraction) return;
        const automaticTaskType = autoAudit && autoExtraction ? 'full' : autoAudit ? 'audit' : 'extraction';
        const chatKey = this.host.chatKey();
        try {
            const turn = this.host.latestTurn(index);
            // [MA-QUEUE-04] 新正文只追加到当前聊天队列。正在处理的旧正文继续使用固定源快照，
            // 不再因为“出现更新的 AI 正文”而主动取消。聊天切换、源正文编辑/删除和用户取消仍会中断。
            void this.enqueueTask(automaticTaskType, turn.messageIndex, true).catch((error) => {
                const message = (0, util_1.errorText)(error);
                if (!/同一任务已经在执行或等待/u.test(message)) console.error('[MirrorAbyss] automatic core flow failed', error);
            });
        }
        catch (error) { console.error('[MirrorAbyss] automatic task enqueue failed', error); }
    }
    onScopeChanged(eventName, eventValue) {
        if (this.host.consumeInternalScopeEvent(eventName, eventValue)) return;
        const interruptedSources = eventName === 'CHAT_CHANGED' ? this.captureInterruptedAutomaticSources() : [];
        const interruptedRuns = eventName === 'CHAT_CHANGED' ? [...this.runningByChat.values()] : [];
        this.clearPendingMessageTimers();
        const reason = `SillyTavern 事件 ${eventName} 使源对话失效`;
        if (eventName === 'CHAT_CHANGED') {
            const recoveryGeneration = ++this.scopeRecoveryGeneration;
            this.clearPendingSourceReconcileTimers();
            this.cancelAll(reason);
            try { this.host.bumpScopeRevision(this.host.chatKey()); } catch { }
            this.controlPanel.resetTaskStates?.('聊天已经切换');
            this.controlPanel.setStatus('聊天已经切换，旧聊天任务已取消');
            void this.recoverInterruptedAutomaticSources(interruptedSources, interruptedRuns, recoveryGeneration);
            return;
        }
        const index = messageIndexFromEvent(eventValue);
        if (!Number.isInteger(index)) {
            this.cancelAll(reason);
            try { this.host.bumpScopeRevision(this.host.chatKey()); } catch { }
            this.controlPanel.resetTaskStates?.('正文范围发生无法定位的变化');
            this.controlPanel.setStatus('正文范围发生无法定位的变化，旧任务已取消');
            return;
        }
        const affected = this.cancelAffectedMessageTasks(eventName, index, reason);
        if (affected > 0) {
            this.controlPanel.resetTaskStates?.('源正文已被修改、切换或删除');
            this.controlPanel.setStatus(`源正文已变化，已取消${affected}个受影响任务；其他后台任务继续运行`);
        }
        this.scheduleSourceReconcile(eventName, index);
    }

    captureInterruptedAutomaticSources() {
        const candidates = [];
        const add = (source) => {
            if (!source || !Number.isInteger(source.messageIndex) || !source.messageKey || !source.contentHash) return;
            candidates.push({ ...source, roleKey: source.roleKey || safeRoleKey(this.host) });
        };
        for (const pending of this.pendingMessageTimers.values()) add(pending?.source);
        for (const queue of this.taskQueues.values()) {
            for (const item of queue.items) {
                if (item?.automatic !== true || item?.maintenance === true) continue;
                if (!['audit', 'extraction', 'full'].includes(String(item.taskType ?? ''))) continue;
                add(item.sourceTurn);
            }
        }
        for (const snapshot of this.activeSnapshots.values()) {
            if (snapshot?.automatic !== true || snapshot?.maintenance === true) continue;
            if (!['audit', 'extraction', 'full'].includes(String(snapshot.taskType ?? ''))) continue;
            add(snapshot);
        }
        const unique = new Map();
        for (const candidate of candidates) unique.set(`${candidate.messageKey}|${candidate.contentHash}`, candidate);
        return [...unique.values()];
    }
    matchingInterruptedSource(candidate) {
        if (!candidate || candidate.roleKey !== safeRoleKey(this.host)) return null;
        let turn;
        try { turn = this.host.latestTurn(candidate.messageIndex); }
        catch { return null; }
        if (turn.messageKey !== candidate.messageKey || turn.contentHash !== candidate.contentHash) return null;
        if (String(turn.playerText ?? '') !== String(candidate.playerText ?? '')) return null;
        if (String(turn.dialogueHash ?? '') !== String(candidate.dialogueHash ?? '')) return null;
        return { ...turn, roleKey: candidate.roleKey };
    }
    async recoverInterruptedAutomaticSources(candidates, interruptedRuns, recoveryGeneration) {
        if (!this.started || !Array.isArray(candidates) || !candidates.length) return;
        await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
        if (!this.started || recoveryGeneration !== this.scopeRecoveryGeneration) return;
        let matched = candidates.map((candidate) => this.matchingInterruptedSource(candidate)).filter(Boolean);
        if (!matched.length) return;
        if (Array.isArray(interruptedRuns) && interruptedRuns.length) await Promise.allSettled(interruptedRuns);
        if (!this.started || recoveryGeneration !== this.scopeRecoveryGeneration) return;
        matched = matched.map((turn) => this.matchingInterruptedSource(turn)).filter(Boolean);
        if (!matched.length) return;
        const uniqueIndexes = [...new Set(matched.map((turn) => turn.messageIndex))].sort((left, right) => left - right);
        this.controlPanel.setStatus('新存档已完成首次落盘，正在恢复被聊天切换中断的首轮正文处理');
        for (const messageIndex of uniqueIndexes) this.scheduleMessage(messageIndex, false);
    }

    scheduleSourceReconcile(eventName, index) {
        let chatKey;
        try { chatKey = this.host.chatKey(); }
        catch { return; }
        if (!chatKey || !Number.isInteger(index)) return;
        const previous = this.pendingSourceReconcileTimers.get(chatKey);
        if (previous?.timer) globalThis.clearTimeout(previous.timer);
        const nextIndex = Math.min(index, Number.isInteger(previous?.index) ? previous.index : index);
        const nextEvent = eventName === 'MESSAGE_DELETED' || previous?.eventName === 'MESSAGE_DELETED' ? 'MESSAGE_DELETED' : eventName;
        const timer = globalThis.setTimeout(() => {
            const pending = this.pendingSourceReconcileTimers.get(chatKey);
            if (!pending || pending.timer !== timer) return;
            this.pendingSourceReconcileTimers.delete(chatKey);
            void this.reconcileCommittedSource(nextEvent, nextIndex, chatKey).catch((error) => {
                const text = (0, util_1.errorText)(error);
                this.controlPanel.setStatus(`近期世界书回滚失败：${text}；可使用世界书重建重新收束`, true);
                console.error('[MirrorAbyss] source reconciliation failed', error);
            });
        }, 320);
        timer?.unref?.();
        this.pendingSourceReconcileTimers.set(chatKey, { timer, index: nextIndex, eventName: nextEvent });
    }
    async reconcileCommittedSource(eventName, index, chatKey) {
        if (!this.started || this.host.chatKey() !== chatKey) return;
        const receipts = typeof this.host.getCommitReceipts === 'function' ? this.host.getCommitReceipts() : [];
        const affected = receipts.filter((receipt) => receiptAffectedBySourceChange(receipt, eventName, index));
        if (!affected.length) return;
        await this.waitForChatIdle(chatKey);
        if (!this.started || this.host.chatKey() !== chatKey) return;
        const sourceKeys = [...new Set(affected.map((receipt) => String(receipt.sourceMessageKey ?? '')).filter(Boolean))];
        const ids = affected.map((receipt) => String(receipt.id ?? '')).filter(Boolean);
        await this.enqueueMaintenance('sourceRollback', async (settings, snapshot) => {
            const focusUid = this.host.getFocusUid();
            const result = await this.worldbook.rollbackReceipts(settings, affected, focusUid, snapshot, () => this.host.assertSnapshot(snapshot, this.settings()));
            await this.host.removeCommitReceipts(ids);
            const cursor = this.host.cursor();
            await this.host.saveCursor({ ...cursor, lastProcessedMessageKey: '', lastProcessedHash: '' }, snapshot, this.settings());
            return result;
        });
        this.controlPanel.resetTaskStates?.('源对话已变化，近期写入已回滚');
        this.controlPanel.setStatus(`已回滚${affected.length}次近期世界书提交，正在按当前对话重新排队`);
        await this.controlPanel.refreshRecallMap?.();
        const indexes = sourceKeys
            .map((messageKey) => this.host.assistantIndexByMessageKey(messageKey))
            .filter((value) => Number.isInteger(value) && value >= 0)
            .sort((left, right) => left - right);
        for (const messageIndex of indexes) this.scheduleMessage(messageIndex, false);
    }
    async waitForChatIdle(chatKey) {
        for (let attempt = 0; attempt < 80; attempt += 1) {
            if (!this.activeTokens.has(chatKey) && !this.runningByChat.has(chatKey)) return;
            await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
        }
        throw new Error('受影响的旧任务尚未停止');
    }

    cancelAffectedMessageTasks(eventName, index, reason) {
        const affectedSnapshot = (snapshot) => {
            if (!snapshot || snapshot.maintenance || !Number.isInteger(snapshot.messageIndex)) return false;
            if (eventName === 'MESSAGE_DELETED') return snapshot.messageIndex >= index || snapshot.messageIndex - 1 >= index;
            if (eventName === 'MESSAGE_EDITED') return snapshot.messageIndex === index || snapshot.messageIndex - 1 === index;
            return snapshot.messageIndex === index;
        };
        let count = 0;
        for (const [chatKey, snapshot] of this.activeSnapshots.entries()) {
            if (!affectedSnapshot(snapshot)) continue;
            const token = this.activeTokens.get(chatKey);
            if (token && !token.cancelled) { token.cancelled = true; token.reason = reason; count += 1; }
        }
        for (const [chatKey, queue] of this.taskQueues.entries()) {
            for (let position = queue.items.length - 1; position >= 0; position -= 1) {
                const item = queue.items[position];
                const affected = item.maintenance !== true && Number.isInteger(item.index)
                    && (eventName === 'MESSAGE_DELETED' ? item.index >= index || item.index - 1 >= index
                        : eventName === 'MESSAGE_EDITED' ? item.index === index || item.index - 1 === index
                            : item.index === index);
                if (!affected) continue;
                queue.items.splice(position, 1);
                this.pendingTaskKeys.delete(item.taskKey);
                item.reject(new Error(reason));
                count += 1;
            }
            if (!queue.running && !queue.items.length) this.taskQueues.delete(chatKey);
        }
        return count;
    }
    enqueueTask(taskType, index, automatic) {
        const maintenance = ['migration', 'commitMigration', 'undoMigration'].includes(taskType);
        const chatKey = this.host.chatKey();
        const turn = maintenance
            ? { messageIndex: -1, messageKey: `maintenance:${taskType}`, contentHash: '' }
            : this.host.latestTurn(index);
        const taskKey = `${chatKey}|${taskType}|${turn.messageKey}|${turn.contentHash}`;
        if (this.pendingTaskKeys.has(taskKey)) return Promise.reject(new Error('同一任务已经在执行或等待，不重复排队'));
        let resolveTask;
        let rejectTask;
        const promise = new Promise((resolve, reject) => { resolveTask = resolve; rejectTask = reject; });
        const queue = this.taskQueues.get(chatKey) ?? { running: false, items: [] };
        const item = { taskType, index: turn.messageIndex, automatic: Boolean(automatic), maintenance, sourceTurn: maintenance ? null : { ...turn, roleKey: safeRoleKey(this.host) }, taskKey, promise, resolve: resolveTask, reject: rejectTask, queuedAt: Date.now() };
        queue.items.push(item);
        this.taskQueues.set(chatKey, queue);
        this.pendingTaskKeys.add(taskKey);
        if (automatic) this.compactAutomaticQueue(chatKey, queue, this.settings(), turn);
        const position = queue.items.length + (queue.running ? 1 : 0);
        const queuedDetail = `${automatic ? '自动' : ''}${taskType === 'audit' ? '审核' : taskType === 'extraction' ? '提取' : taskType === 'full' ? '审核与提取' : '任务'}已进入异步队列（第${position}项）`;
        if (taskType === 'audit' || taskType === 'full') this.controlPanel.setTaskProgress?.('audit', 'queued', queuedDetail, { messageIndex: turn.messageIndex, queuePosition: position });
        if (taskType === 'extraction' || taskType === 'full') this.controlPanel.setTaskProgress?.('extract', 'queued', queuedDetail, { messageIndex: turn.messageIndex, queuePosition: position });
        this.controlPanel.setStatus(queuedDetail);
        globalThis.setTimeout(() => { void this.drainTaskQueue(chatKey); }, 0);
        return promise;
    }
    async runTask(taskType, snapshot, automatic, settings) {
        if (!this.started || snapshot.token?.cancelled)
            return [];
        try {
            this.host.assertSnapshot(snapshot, this.settings());
            const cursor = this.host.cursor();
            if (taskType === 'full' && cursor.lastProcessedMessageKey === snapshot.messageKey && cursor.lastProcessedHash === snapshot.contentHash) {
                this.controlPanel.setStatus('该正文已经完整处理，未重复调用模型');
                if (!automatic) notify('info', '镜渊：该正文已经完整处理');
                return [];
            }
            if (taskType === 'audit' || taskType === 'full') this.controlPanel.setTaskProgress?.('audit', 'running', automatic ? '自动审核处理中' : '审核处理中', { messageIndex: snapshot.messageIndex });
            if (taskType === 'extraction' || taskType === 'full') this.controlPanel.setTaskProgress?.('extract', 'running', automatic ? '等待审核后自动提取' : '提取、解析与语义合并处理中', { messageIndex: snapshot.messageIndex });
            this.controlPanel.setStatus(taskType === 'audit' ? '审核处理中…' : taskType === 'extraction' ? '提取、解析与语义合并处理中…' : taskType === 'full' ? '自动处理中…' : '任务处理中…');
            let activeSnapshot = snapshot;
            let result;
            if (taskType === 'audit') {
                if (automatic && settings.autoAudit !== true) {
                    this.controlPanel.setTaskProgress?.('audit', 'disabled', '自动审核已关闭，已跳过');
                    return [];
                }
                activeSnapshot = await this.auditRunner.process(settings, activeSnapshot);
                result = activeSnapshot;
            }
            else if (taskType === 'extraction') {
                if (automatic && settings.autoExtraction !== true) {
                    this.controlPanel.setTaskProgress?.('extract', 'disabled', '自动提取已关闭，已跳过');
                    return [];
                }
                result = await this.memoryRunner.runTask('extraction', settings, activeSnapshot);
            }
            else if (taskType === 'smallSummary') result = await this.memoryRunner.runTask('smallSummary', settings, activeSnapshot);
            else if (taskType === 'largeSummary') result = await this.memoryRunner.runTask('largeSummary', settings, activeSnapshot);
            else if (taskType === 'migration') result = await this.migrationService.migrate(settings, activeSnapshot);
            else if (taskType === 'commitMigration') result = await this.migrationService.commit(settings, activeSnapshot);
            else if (taskType === 'undoMigration') result = await this.migrationService.undo(settings, activeSnapshot);
            else {
                const shouldAudit = settings.auditEnabled !== false && settings.auditPrompt.trim() && (!automatic || settings.autoAudit === true);
                const shouldExtract = settings.extractionEnabled !== false && (!automatic || settings.autoExtraction === true);
                if (shouldAudit) {
                    activeSnapshot = await this.auditRunner.process(settings, activeSnapshot);
                    this.controlPanel.setTaskProgress?.('audit', 'success', activeSnapshot.auditDetail || (activeSnapshot.auditReplaced ? '自动审核完成，正文已替换' : '自动审核通过，正文未修改'));
                } else {
                    this.controlPanel.setTaskProgress?.('audit', 'disabled', automatic ? '自动审核已关闭，完全跳过' : '审核功能已关闭');
                }
                this.host.assertSnapshot(activeSnapshot, this.settings());
                result = shouldExtract ? await this.memoryRunner.runTask('extraction', settings, activeSnapshot) : [];
            }
            this.host.assertSnapshot(activeSnapshot, this.settings());
            if (taskType === 'audit') {
                const detail = activeSnapshot.auditDetail || (activeSnapshot.auditReplaced ? '审核未通过，正文已替换' : '审核通过，正文未修改');
                this.controlPanel.setTaskProgress?.('audit', 'success', detail);
                this.controlPanel.setStatus(detail);
            }
            else if (taskType === 'extraction') {
                const detail = extractionOutcomeDetail(result, false);
                this.controlPanel.setTaskProgress?.('extract', 'success', detail, extractionOutcomeMeta(result));
                this.controlPanel.setStatus(detail);
            }
            else if (taskType === 'smallSummary') {
                this.controlPanel.setTaskProgress?.('extract', 'success', '小总结、分发与召回重排完成');
                this.controlPanel.setStatus('小总结、分发与召回重排完成');
            }
            else if (taskType === 'largeSummary') {
                this.controlPanel.setTaskProgress?.('extract', 'success', '大总结、沉降分发与召回重排完成');
                this.controlPanel.setStatus('大总结、沉降分发与召回重排完成');
            }
            else if (taskType === 'migration') {
                this.controlPanel.setStatus(result?.previewReady ? `世界书重建预览已生成：${result.batches ?? 0}批、请求${result.requests ?? 0}次、失败批次${result.failedBatches ?? 0}个，新条目${result.rebuiltEntries}个、附属并入${result.absorbedEntries ?? 0}个；提交前未修改旧表` : (result?.message || '没有可重建条目'));
            }
            else if (taskType === 'commitMigration') {
                this.controlPanel.setStatus(`世界书重建已提交：旧表删除${result?.deletedOldEntries ?? 0}条，新结构${result?.rebuiltEntries ?? 0}条`);
            }
            else if (taskType === 'undoMigration') {
                this.controlPanel.setStatus('上次世界书重建已撤销，旧表已恢复');
            }
            else {
                if (settings.autoExtraction === true && settings.extractionEnabled !== false) {
                    const detail = extractionOutcomeDetail(result, true);
                    this.controlPanel.setTaskProgress?.('extract', 'success', detail, extractionOutcomeMeta(result));
                    this.controlPanel.setStatus(`${activeSnapshot.auditDetail || '自动审核已跳过'}；${detail}`);
                }
                else {
                    this.controlPanel.setTaskProgress?.('extract', 'disabled', '自动提取已关闭');
                    this.controlPanel.setStatus(`${activeSnapshot.auditDetail || '自动审核已跳过'}；自动提取已关闭`);
                }
            }
            // [MA-UI-SYNC-02] 只在提取、总结与召回重排全部结束后回读一次世界书，避免 UI 显示中间状态。
            if (['extraction', 'smallSummary', 'largeSummary', 'full', 'migration', 'commitMigration', 'undoMigration'].includes(taskType)) {
                await this.controlPanel.refreshRecallMap?.();
            }
            notify('success', '镜渊：本轮处理完成');
            return result;
        } catch (error) {
            const text = (0, util_1.errorText)(error);
            if (snapshot.token?.cancelled && !/超时/u.test(snapshot.token.reason || '')) {
                this.controlPanel.setStatus(`任务已取消：${snapshot.token.reason || text}`);
                if (!automatic)
                    notify('info', `镜渊：${snapshot.token.reason || '任务已取消'}`);
                return [];
            }
            if (taskType === 'audit' || taskType === 'full') this.controlPanel.setTaskProgress?.('audit', 'error', text, { error: text });
            if (taskType === 'extraction' || taskType === 'full') this.controlPanel.setTaskProgress?.('extract', 'error', text, { error: text });
            this.controlPanel.setStatus(`处理失败：${text}`, true);
            notify('error', `镜渊：${text}`);
            throw error;
        }
    }
    enqueueMaintenance(taskType, action) {
        const chatKey = this.host.chatKey();
        let resolveTask;
        let rejectTask;
        const promise = new Promise((resolve, reject) => { resolveTask = resolve; rejectTask = reject; });
        const queue = this.taskQueues.get(chatKey) ?? { running: false, items: [] };
        const taskKey = `${chatKey}|maintenance|${taskType}|${Date.now()}|${Math.random().toString(36).slice(2)}`;
        queue.items.push({
            taskType,
            index: -1,
            automatic: false,
            maintenance: true,
            maintenanceAction: action,
            taskKey,
            promise,
            resolve: resolveTask,
            reject: rejectTask,
            queuedAt: Date.now(),
        });
        this.taskQueues.set(chatKey, queue);
        this.pendingTaskKeys.add(taskKey);
        const position = queue.items.length + (queue.running ? 1 : 0);
        this.controlPanel.setStatus(`世界书操作已进入异步队列（第${position}项）`);
        globalThis.setTimeout(() => { void this.drainTaskQueue(chatKey); }, 0);
        return promise;
    }

    async runMaintenanceAction(item, settings, snapshot) {
        if (!this.started || snapshot.token?.cancelled) return [];
        try {
            this.controlPanel.setStatus('世界书操作中…');
            const result = await item.maintenanceAction(settings, snapshot);
            this.controlPanel.setStatus('世界书操作完成');
            return result;
        }
        catch (error) {
            this.controlPanel.setStatus(`世界书操作失败：${(0, util_1.errorText)(error)}`, true);
            throw error;
        }
    }
    compactAutomaticQueue(chatKey, queue, settings, latestTurn) {
        const candidates = queue.items.filter((item) => item.automatic && ['full', 'extraction'].includes(item.taskType));
        const threshold = Math.max(2, Number(settings.queueCompactThreshold || settings.smallSummaryTurns || 6));
        if (candidates.length < threshold) return;
        let collapsed = 0;
        for (const item of [...candidates]) {
            if (item.taskType === 'full' && settings.autoAudit === true && settings.auditEnabled !== false) {
                item.taskType = 'audit';
                collapsed += 1;
                continue;
            }
            const index = queue.items.indexOf(item);
            if (index >= 0) queue.items.splice(index, 1);
            this.pendingTaskKeys.delete(item.taskKey);
            item.resolve({ superseded: true, reason: '队列积压，逐轮提取已由总结压缩替代' });
            collapsed += 1;
        }
        const cursor = this.host.cursor();
        const pendingSmall = queue.items.filter((item) => item.taskType === 'smallSummary').length;
        const summaryType = settings.autoLargeSummary !== false && Number(cursor.smallCountSinceLarge || 0) + pendingSmall >= Number(settings.largeSummaryCount || 5)
            ? 'largeSummary'
            : 'smallSummary';
        const summaryKey = `${chatKey}|${summaryType}|${latestTurn.messageKey}|compact`;
        if (!this.pendingTaskKeys.has(summaryKey) && !queue.items.some((item) => item.taskType === summaryType)) {
            let resolveTask;
            let rejectTask;
            const promise = new Promise((resolve, reject) => { resolveTask = resolve; rejectTask = reject; });
            queue.items.push({ taskType: summaryType, index: latestTurn.messageIndex, automatic: true, maintenance: false, taskKey: summaryKey, promise, resolve: resolveTask, reject: rejectTask, queuedAt: Date.now(), compacted: true });
            this.pendingTaskKeys.add(summaryKey);
            promise.catch((error) => console.warn('[MirrorAbyss] compacted summary failed', error));
        }
        const label = summaryType === 'largeSummary' ? '大总结' : '小总结';
        this.controlPanel.setTaskProgress?.('extract', 'queued', `队列积压${candidates.length}项，已压缩逐轮提取并改为${label}`, { messageIndex: latestTurn.messageIndex, compacted: collapsed });
        this.controlPanel.setStatus(`异步队列已压缩：保留审核，逐轮提取改为${label}`);
    }
    async drainTaskQueue(chatKey) {
        const queue = this.taskQueues.get(chatKey);
        if (!queue || queue.running) return;
        queue.running = true;
        try {
            while (this.started && queue.items.length) {
                const item = queue.items.shift();
                const token = { cancelled: false, reason: '' };
                let snapshot = null;
                try {
                    if (this.host.chatKey() !== chatKey) throw new Error('聊天已经切换，排队任务取消');
                    const settings = this.settings();
                    snapshot = item.maintenance
                        ? this.host.captureMaintenanceSnapshot(settings, item.taskType, token)
                        : this.host.captureSnapshot(settings, item.index, item.taskType, token);
                    snapshot.automatic = Boolean(item.automatic);
                    this.activeTokens.set(chatKey, token);
                    this.activeSnapshots.set(chatKey, snapshot);
                    this.runningByChat.set(chatKey, item.promise);
                    const result = typeof item.maintenanceAction === 'function'
                        ? await this.runMaintenanceAction(item, settings, snapshot)
                        : await this.runTask(item.taskType, snapshot, item.automatic, settings);
                    item.resolve(result);
                }
                catch (error) {
                    item.reject(error);
                }
                finally {
                    this.pendingTaskKeys.delete(item.taskKey);
                    if (this.activeTokens.get(chatKey) === token) this.activeTokens.delete(chatKey);
                    if (snapshot && this.activeSnapshots.get(chatKey) === snapshot) this.activeSnapshots.delete(chatKey);
                    if (this.runningByChat.get(chatKey) === item.promise) this.runningByChat.delete(chatKey);
                }
            }
        }
        finally {
            queue.running = false;
            if (!queue.items.length) this.taskQueues.delete(chatKey);
            else globalThis.setTimeout(() => { void this.drainTaskQueue(chatKey); }, 0);
        }
    }
    rejectQueuedTasks(reason, onlyChatKey = '') {
        let count = 0;
        for (const [chatKey, queue] of this.taskQueues.entries()) {
            if (onlyChatKey && chatKey !== onlyChatKey) continue;
            for (const item of queue.items.splice(0)) {
                this.pendingTaskKeys.delete(item.taskKey);
                item.reject(new Error(reason));
                count += 1;
            }
            if (!queue.running) this.taskQueues.delete(chatKey);
        }
        return count;
    }
    cancelAll(reason) {
        for (const token of this.activeTokens.values()) {
            token.cancelled = true;
            token.reason = reason;
        }
        this.rejectQueuedTasks(reason);
    }
}
exports.MirrorAbyssApplication = MirrorAbyssApplication;
function extractionOutcomeDetail(result, automatic = false) {
    const prefix = automatic ? '自动提取完成' : '提取完成';
    if (!result || Array.isArray(result) || typeof result !== 'object') return `${prefix}：总结调度与世界书合并完成`;
    if (result.outcome === 'explicit-none') return `${prefix}：本轮无可记录事实，世界书零写入`;
    if (result.outcome === 'verified-no-change') return `${prefix}：首次重复候选已经过AI正文差量复核，确认本轮没有新增状态变化，世界书零写入`;
    if (result.outcome === 'no-change' || result.changed === false) {
        return `${prefix}：候选均为已有事实或无状态变化，世界书零写入${result.skipped?.length ? `；整条跳过${result.skipped.length}条` : ''}`;
    }
    return `${prefix}：新建${result.created?.length || 0}、更新${result.updated?.length || 0}、关键变化${result.criticalChanges || 0}、合并${result.merged?.length || 0}、格式恢复${result.repaired || 0}、跳过${result.skipped?.length || 0}`;
}
function extractionOutcomeMeta(result) {
    if (!result || Array.isArray(result) || typeof result !== 'object') return {};
    return {
        titles: Array.isArray(result.titles) ? result.titles : [],
        created: Array.isArray(result.created) ? result.created : [],
        updated: Array.isArray(result.updated) ? result.updated : [],
        skipped: Array.isArray(result.skipped) ? result.skipped : [],
        merged: Array.isArray(result.merged) ? result.merged : [],
        repaired: Number(result.repaired || 0),
        skippedDetails: Array.isArray(result.skippedDetails) ? result.skippedDetails : [],
        deltaRechecked: result.deltaRechecked === true,
    };
}

function notify(kind, message) {
    const toast = globalThis.toastr?.[kind];
    if (typeof toast === 'function') toast(message);
    else console[kind === 'error' ? 'error' : 'info'](`[MirrorAbyss] ${message}`);
}
function receiptAffectedBySourceChange(receipt, eventName, index) {
    const assistantIndex = Number(receipt?.messageIndex);
    const playerIndex = Number(receipt?.playerMessageIndex);
    if (!Number.isInteger(index)) return false;
    if (eventName === 'MESSAGE_EDITED') {
        return (Number.isInteger(assistantIndex) && assistantIndex >= index)
            || (Number.isInteger(playerIndex) && playerIndex >= index);
    }
    if (eventName === 'MESSAGE_SWIPED' || eventName === 'MESSAGE_DELETED') {
        return (Number.isInteger(assistantIndex) && assistantIndex >= index)
            || (Number.isInteger(playerIndex) && playerIndex >= index);
    }
    return false;
}
function safeChatKey(host) { try { return host.chatKey(); } catch { return ''; } }
function safeRoleKey(host) { try { return host.roleKey(); } catch { return ''; } }
function messageIndexFromEvent(value) {
    if (Number.isInteger(value))
        return value;
    if (value && typeof value === 'object') {
        for (const candidate of [value.messageIndex, value.messageId, value.index, value.id]) {
            const number = Number(candidate);
            if (Number.isInteger(number))
                return number;
        }
    }
    const number = Number(value);
    return Number.isInteger(number) ? number : undefined;
}
},"audit":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditRunner = void 0;
exports.parseAuditResult = parseAuditResult;
const prompts_1 = require("./prompts");
const parser_1 = require("./parser");
const revision_1 = require("./revision");
const model_request_1 = require("./model-request");
const util_1 = require("./util");

class AuditRunner {
    constructor(host, getSettings, onProgress = () => undefined) {
        this.host = host;
        this.getSettings = getSettings;
        this.onProgress = typeof onProgress === 'function' ? onProgress : () => undefined;
        this.revisionService = new revision_1.RevisionService(host, getSettings);
        this.statusByChat = new Map();
    }
    currentStatus(chatKey = '') {
        const key = chatKey || safeChatKey(this.host);
        return structuredClone(this.statusByChat.get(key) ?? { phase: 'idle', detail: '等待审核', error: '' });
    }

    /**
     * [MA-AUDIT-01] 审核只负责“判定”。FAIL 时交给 RevisionService 生成完整正文，
     * 最后由 HostAdapter 原子式替换并保存。审核模块不接触 DOM 和世界书。
     */
    async process(settings, snapshot) {
        if (!settings.auditEnabled || !settings.auditPrompt.trim()) {
            this.setStatus(snapshot.chatKey, 'complete', '审核未启用');
            return snapshot;
        }
        try {
            this.host.assertSnapshot(snapshot, this.getSettings());
            this.setStatus(snapshot.chatKey, 'audit', '审核正文');
            const prompt = (0, prompts_1.auditPrompts)(settings, snapshot.playerText, snapshot.assistantText, { dialogueContext: snapshot.dialogueContext });
            const raw = await (0, model_request_1.callModel)({
                host: this.host,
                stage: 'audit',
                prompt,
                fallbackPrompt: () => (0, prompts_1.auditPrompts)(settings, snapshot.playerText, snapshot.assistantText, { compact: true, dialogueContext: snapshot.dialogueContext }),
                settings,
                snapshot,
                profileId: settings.auditProfileId,
                sourceText: snapshot.turnText || snapshot.assistantText,
                onRetry: () => this.setStatus(snapshot.chatKey, 'audit', '审核网关异常，已缩短上下文并重试一次'),
            });
            this.host.assertSnapshot(snapshot, this.getSettings());
            const result = parseAuditResult(raw);
            let finalSnapshot = snapshot;
            if (result.decision === 'revision') {
                this.setStatus(snapshot.chatKey, 'revision', '审核不通过，生成一次完整修正版');
                const revisedText = await this.revisionService.revise(settings, snapshot, result.issues);
                finalSnapshot = await this.host.replaceAssistantText(snapshot, revisedText, this.getSettings());
                this.setStatus(snapshot.chatKey, 'revision', '完整修正版正文已替换并保存');
            }
            const auditReplaced = result.decision === 'revision';
            const auditDetail = auditReplaced ? '审核未通过，正文已替换并保存' : '审核通过，正文未修改';
            this.setStatus(snapshot.chatKey, 'complete', auditDetail);
            return { ...finalSnapshot, auditDecision: result.decision, auditReplaced, auditDetail };
        }
        catch (error) {
            this.setStatus(snapshot.chatKey, 'error', '审核停止', (0, util_1.errorText)(error));
            throw error;
        }
    }
    setStatus(chatKey, phase, detail, error = '') {
        const status = { chatKey, phase, detail, error };
        this.statusByChat.set(chatKey, { phase, detail, error });
        try { this.onProgress(status); }
        catch (callbackError) { console.warn('[MirrorAbyss] audit progress callback failed', callbackError); }
    }
}
exports.AuditRunner = AuditRunner;

/** [MA-AUDIT-02] 审核结果协议：PASS 只能单独出现；FAIL 必须附具体问题。 */
function parseAuditResult(raw) {
    const text = (0, parser_1.sanitizeModelText)(raw);
    if (/^(?:PASS|通过)[。.]?$/iu.test(text)) return { decision: 'pass', issues: [] };
    if (/【\s*(?:最小修正版正文|修正版正文|完整正文|正文)\s*】/u.test(text))
        throw new Error('审核模型越权返回了修正版正文');
    const rawConclusion = text.match(/^\s*(PASS|FAIL|通过|需要修正)\s*[。.]?\s*(?:\n|$)/iu)?.[1] || '';
    const conclusion = /^(?:PASS|通过)$/iu.test(rawConclusion) ? 'PASS' : /^(?:FAIL|需要修正)$/iu.test(rawConclusion) ? 'FAIL' : '';
    if (conclusion === 'PASS') throw new Error('审核结论为 PASS 时必须只返回 PASS');
    if (conclusion !== 'FAIL') throw new Error('审核返回缺少明确的 PASS 或 FAIL 结论');
    const sections = (0, parser_1.parseLabeledSections)(text);
    let issues = ['原因', '违反规则', '问题', '违规'].flatMap((name) => nonEmptyLines(sections.get(name))).filter((line) => !isNone(line));
    if (!issues.length) {
        issues = text.split('\n').slice(1)
            .map((line) => (0, parser_1.stripListMarker)(line.replace(/^\s*【[^】]+】\s*$/u, '').replace(/^\s*原因\s*[:：]?\s*$/u, '')).trim())
            .filter((line) => line && !isNone(line));
    }
    if (!issues.length) throw new Error('审核返回 FAIL，但没有指出具体问题或原因');
    return { decision: 'revision', issues };
}
function nonEmptyLines(lines = []) { return lines.map((line) => (0, parser_1.stripListMarker)(line).trim()).filter(Boolean); }
function isNone(value) { return /^\s*(?:无|没有|无问题)\s*[。.]?\s*$/u.test(String(value ?? '')); }
function safeChatKey(host) { try { return host.chatKey(); } catch { return ''; } }
},"constants":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGED_VERSION = exports.MAX_CONTEXT_CHARS = exports.WORLD_INFO_EXTENSION_KEY = exports.EXTENSION_NAMESPACE = exports.DISPLAY_NAME = exports.VERSION = void 0;
exports.VERSION = '2.0.0-lite.ui.30';
exports.DISPLAY_NAME = 'Mirror Abyss｜镜渊';
exports.EXTENSION_NAMESPACE = 'mirrorAbyssLite';
exports.WORLD_INFO_EXTENSION_KEY = 'mirrorAbyssInfoPoint';
exports.MAX_CONTEXT_CHARS = 48000;
exports.MANAGED_VERSION = 19;
},"control-panel":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlPanel = void 0;
exports.buildRecallViewModel = buildRecallViewModel;
exports.buildUnifiedProfilePatch = buildUnifiedProfilePatch;
const util_1 = require("./util");
const ROOT_ID = 'mirror-abyss-core-control';
const PANEL_ID = 'mirror-abyss-lite-panel';
const SETTINGS_ID = 'mirror-abyss-lite-settings-entry';
const STYLE_ID = 'mirror-abyss-lite-style';
const INDICATOR_CLASS = 'mirror-abyss-message-indicator';
const PROFILE_SELECT_ID = 'mirror-abyss-lite-profile-select';
const LAUNCHER_POSITION_KEY = 'mirrorAbyssLite.launcherPosition.v1';
const LAUNCHER_SIZE = 44;
const LAUNCHER_MARGIN = 8;
class ControlPanel {
    constructor(actions) {
        this.actions = actions;
        this.root = null;
        this.launcher = null;
        this.panel = null;
        this.statusNode = null;
        this.recallNode = null;
        this.recallStatusNode = null;
        this.recallRefreshButton = null;
        this.recallReplanButton = null;
        this.managementNode = null;
        this.managementStatusNode = null;
        this.managementRefreshButton = null;
        this.managementLoadSerial = 0;
        this.rebuildNode = null;
        this.rebuildStatusNode = null;
        this.rebuildPreviewButton = null;
        this.rebuildCommitButton = null;
        this.rebuildUndoButton = null;
        this.worldSettingTextarea = null;
        this.worldSettingStatusNode = null;
        this.worldSettingPreviewNode = null;
        this.worldSettingPreviewButton = null;
        this.worldSettingCommitButton = null;
        this.worldSettingClearButton = null;
        this.worldSettingDirty = false;
        this.recallLoadSerial = 0;
        this.recallModel = null;
        this.recallWorldbookName = '';
        this.recallPage = 1;
        this.recallPageSize = 12;
        this.pageNodes = {};
        this.pageButtons = {};
        this.activePage = 'run';
        this.apiProfileSelect = null;
        this.apiProfileStatusNode = null;
        this.profileDropdownBound = false;
        this.settingsEntry = null;
        this.inputs = {};
        this.buttons = {};
        this.pendingActions = new Set();
        this.lastOutcome = null;
        this.taskStates = {
            audit: { state: 'idle', detail: '待命', titles: [], created: [], updated: [], skipped: [], merged: [], repaired: 0, messageIndex: null, queuePosition: 0 },
            extract: { state: 'idle', detail: '待命', titles: [], created: [], updated: [], skipped: [], merged: [], repaired: 0, messageIndex: null, queuePosition: 0 },
        };
        this.statusText = '就绪';
        this.statusError = false;
        this.observer = null;
        this.pendingIndicatorFrame = 0;
        this.waitingForDom = false;
        this.launcherCleanup = [];
        this.dragState = null;
        this.suppressLauncherClick = false;
        this.onDomReady = () => {
            this.waitingForDom = false;
            this.mount();
        };
    }
    mount() {
        if (typeof document === 'undefined') return;
        if (!document.body) {
            if (!this.waitingForDom) {
                this.waitingForDom = true;
                document.addEventListener('DOMContentLoaded', this.onDomReady, { once: true });
            }
            return;
        }
        this.unmount(false);
        document.getElementById('mirror-abyss-loader-control')?.remove();
        document.getElementById('mirror-abyss-startup-control')?.remove();
        document.getElementById(ROOT_ID)?.remove();
        this.installStyle();
        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'ma-lite-floating-entry';
        const launcher = document.createElement('button');
        launcher.type = 'button';
        launcher.className = 'ma-lite-launcher';
        launcher.setAttribute('aria-label', '打开镜渊面板');
        launcher.setAttribute('aria-expanded', 'false');
        launcher.title = 'Mirror Abyss｜审核与提取';
        launcher.innerHTML = '<i class="fa-solid fa-circle-nodes" aria-hidden="true"></i><span>镜渊</span>';
        launcher.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.suppressLauncherClick) {
                this.suppressLauncherClick = false;
                return;
            }
            this.togglePanel();
        });
        root.append(launcher);
        document.body.append(root);
        const panel = this.buildPanel();
        document.body.append(panel);
        this.root = root;
        this.launcher = launcher;
        this.panel = panel;
        // [MA-UI-DRAG-01] 浮动入口使用 Pointer Events，鼠标和触屏共用同一套拖动逻辑。
        // 拖动位置只保存到浏览器 localStorage，不进入剧情设置，也不耦合审核/提取模块。
        this.applySavedLauncherPosition();
        this.bindLauncherDrag();
        this.bindApiProfileSelector();
        this.mountOfficialSettingsEntry();
        this.observeChat();
        this.refresh();
        this.scheduleIndicatorRefresh();
    }
    unmount(removeStyle = true) {
        if (typeof document === 'undefined') return;
        if (this.waitingForDom) document.removeEventListener('DOMContentLoaded', this.onDomReady);
        this.waitingForDom = false;
        this.observer?.disconnect();
        this.observer = null;
        this.launcherCleanup.splice(0).forEach((cleanup) => { try { cleanup(); } catch { } });
        this.dragState = null;
        this.suppressLauncherClick = false;
        if (this.pendingIndicatorFrame) cancelAnimationFrame(this.pendingIndicatorFrame);
        this.pendingIndicatorFrame = 0;
        this.root?.remove();
        this.panel?.remove();
        this.settingsEntry?.remove();
        document.querySelectorAll(`.${INDICATOR_CLASS}`).forEach((node) => node.remove());
        if (removeStyle) document.getElementById(STYLE_ID)?.remove();
        this.root = null;
        this.launcher = null;
        this.panel = null;
        this.statusNode = null;
        this.recallNode = null;
        this.recallStatusNode = null;
        this.recallRefreshButton = null;
        this.recallReplanButton = null;
        this.managementNode = null;
        this.managementStatusNode = null;
        this.managementRefreshButton = null;
        this.managementLoadSerial = 0;
        this.rebuildNode = null;
        this.rebuildStatusNode = null;
        this.rebuildPreviewButton = null;
        this.rebuildCommitButton = null;
        this.rebuildUndoButton = null;
        this.worldSettingTextarea = null;
        this.worldSettingStatusNode = null;
        this.worldSettingPreviewNode = null;
        this.worldSettingPreviewButton = null;
        this.worldSettingCommitButton = null;
        this.worldSettingClearButton = null;
        this.worldSettingDirty = false;
        this.recallLoadSerial += 1;
        this.recallModel = null;
        this.recallWorldbookName = '';
        this.recallPage = 1;
        this.pageNodes = {};
        this.pageButtons = {};
        this.activePage = 'run';
        this.apiProfileSelect = null;
        this.apiProfileStatusNode = null;
        this.profileDropdownBound = false;
        this.settingsEntry = null;
        this.inputs = {};
        this.buttons = {};
        this.pendingActions = new Set();
    }
    applySavedLauncherPosition() {
        if (!this.root || typeof window === 'undefined') return;
        try {
            const saved = JSON.parse(window.localStorage?.getItem(LAUNCHER_POSITION_KEY) || 'null');
            if (!saved || !Number.isFinite(saved.xRatio) || !Number.isFinite(saved.yRatio)) return;
            const maxLeft = Math.max(LAUNCHER_MARGIN, window.innerWidth - LAUNCHER_SIZE - LAUNCHER_MARGIN);
            const maxTop = Math.max(LAUNCHER_MARGIN, window.innerHeight - LAUNCHER_SIZE - LAUNCHER_MARGIN);
            const left = LAUNCHER_MARGIN + clamp01(saved.xRatio) * Math.max(0, maxLeft - LAUNCHER_MARGIN);
            const top = LAUNCHER_MARGIN + clamp01(saved.yRatio) * Math.max(0, maxTop - LAUNCHER_MARGIN);
            this.setLauncherPosition(left, top, false);
        }
        catch { }
    }
    bindLauncherDrag() {
        const launcher = this.launcher;
        const root = this.root;
        if (!launcher || !root || typeof window === 'undefined') return;
        const onPointerDown = (event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            event.stopPropagation();
            const rect = root.getBoundingClientRect();
            this.dragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                left: rect.left,
                top: rect.top,
                moved: false,
            };
            try { launcher.setPointerCapture?.(event.pointerId); } catch { }
        };
        const onPointerMove = (event) => {
            const state = this.dragState;
            if (!state || state.pointerId !== event.pointerId) return;
            const dx = event.clientX - state.startX;
            const dy = event.clientY - state.startY;
            if (!state.moved && Math.hypot(dx, dy) < 6) return;
            state.moved = true;
            event.preventDefault();
            event.stopPropagation();
            root.classList.add('is-dragging');
            this.setLauncherPosition(state.left + dx, state.top + dy, false);
        };
        const finish = (event) => {
            const state = this.dragState;
            if (!state || state.pointerId !== event.pointerId) return;
            if (state.moved) event.preventDefault();
            event.stopPropagation();
            try { launcher.releasePointerCapture?.(event.pointerId); } catch { }
            root.classList.remove('is-dragging');
            if (state.moved) {
                this.suppressLauncherClick = true;
                window.setTimeout(() => { this.suppressLauncherClick = false; }, 500);
                this.persistLauncherPosition();
            }
            this.dragState = null;
        };
        const onResize = () => {
            if (!this.root || this.dragState) return;
            const rect = this.root.getBoundingClientRect();
            if (this.root.style.left) this.setLauncherPosition(rect.left, rect.top, true);
        };
        launcher.addEventListener('pointerdown', onPointerDown);
        launcher.addEventListener('pointermove', onPointerMove);
        launcher.addEventListener('pointerup', finish);
        launcher.addEventListener('pointercancel', finish);
        window.addEventListener('resize', onResize, { passive: true });
        this.launcherCleanup.push(() => launcher.removeEventListener('pointerdown', onPointerDown));
        this.launcherCleanup.push(() => launcher.removeEventListener('pointermove', onPointerMove));
        this.launcherCleanup.push(() => launcher.removeEventListener('pointerup', finish));
        this.launcherCleanup.push(() => launcher.removeEventListener('pointercancel', finish));
        this.launcherCleanup.push(() => window.removeEventListener('resize', onResize));
    }
    setLauncherPosition(left, top, persist = false) {
        if (!this.root || typeof window === 'undefined') return;
        const maxLeft = Math.max(LAUNCHER_MARGIN, window.innerWidth - LAUNCHER_SIZE - LAUNCHER_MARGIN);
        const maxTop = Math.max(LAUNCHER_MARGIN, window.innerHeight - LAUNCHER_SIZE - LAUNCHER_MARGIN);
        const nextLeft = Math.min(maxLeft, Math.max(LAUNCHER_MARGIN, Number(left) || LAUNCHER_MARGIN));
        const nextTop = Math.min(maxTop, Math.max(LAUNCHER_MARGIN, Number(top) || LAUNCHER_MARGIN));
        this.root.style.left = `${Math.round(nextLeft)}px`;
        this.root.style.top = `${Math.round(nextTop)}px`;
        this.root.style.right = 'auto';
        this.root.style.bottom = 'auto';
        this.root.style.transform = 'none';
        if (persist) this.persistLauncherPosition();
    }
    persistLauncherPosition() {
        if (!this.root || typeof window === 'undefined') return;
        try {
            const rect = this.root.getBoundingClientRect();
            const horizontal = Math.max(1, window.innerWidth - LAUNCHER_SIZE - LAUNCHER_MARGIN * 2);
            const vertical = Math.max(1, window.innerHeight - LAUNCHER_SIZE - LAUNCHER_MARGIN * 2);
            const value = {
                xRatio: clamp01((rect.left - LAUNCHER_MARGIN) / horizontal),
                yRatio: clamp01((rect.top - LAUNCHER_MARGIN) / vertical),
            };
            window.localStorage?.setItem(LAUNCHER_POSITION_KEY, JSON.stringify(value));
        }
        catch { }
    }
    installStyle() {
        document.getElementById(STYLE_ID)?.remove();
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#${ROOT_ID}.ma-lite-floating-entry{position:fixed;right:max(10px,env(safe-area-inset-right));top:50dvh;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;z-index:2147483638;pointer-events:auto!important;user-select:none;-webkit-user-select:none}
#${ROOT_ID}.ma-lite-floating-entry.is-dragging{transform:none!important}
.ma-lite-launcher{box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.28));border-radius:50%;background:color-mix(in srgb,var(--SmartThemeBlurTintColor,#17171c) 92%,transparent);color:var(--SmartThemeBodyColor,#fff);box-shadow:0 6px 20px rgba(0,0,0,.46);backdrop-filter:blur(10px);font-size:17px;cursor:pointer;touch-action:none;pointer-events:auto!important;-webkit-tap-highlight-color:transparent}
.ma-lite-launcher:hover,.ma-lite-launcher:focus-visible{transform:scale(1.06)}
#${ROOT_ID}.is-dragging .ma-lite-launcher{transform:none!important;cursor:grabbing}
.ma-lite-launcher span{display:none}
#${PANEL_ID}{position:fixed;top:max(58px,calc(48px + env(safe-area-inset-top)));right:max(10px,env(safe-area-inset-right));z-index:2147483639;box-sizing:border-box;width:min(360px,calc(100vw - 20px));max-height:calc(100dvh - 78px);overflow:auto;padding:0;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.2));border-radius:12px;background:var(--SmartThemeBlurTintColor,#17171c);color:var(--SmartThemeBodyColor,#fff);box-shadow:0 12px 34px rgba(0,0,0,.48);backdrop-filter:blur(12px);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
#${PANEL_ID}[hidden]{display:none!important}
.ma-lite-header{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:10px;padding:12px;border-bottom:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));background:var(--SmartThemeBlurTintColor,#17171c);backdrop-filter:none;box-shadow:0 4px 10px rgba(0,0,0,.22)}
.ma-lite-title{min-width:0;flex:1}.ma-lite-title strong{display:block;font-size:15px}.ma-lite-title small{display:block;margin-top:2px;opacity:.62;font-size:11px}
.ma-lite-close{min-width:34px;min-height:34px;border:0;border-radius:8px;background:var(--black30a,rgba(255,255,255,.08));color:inherit;cursor:pointer}
.ma-lite-body{display:flex;flex-direction:column;gap:10px;padding:12px}
.ma-lite-page-nav{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;position:sticky;top:59px;z-index:1;padding-bottom:2px;background:var(--SmartThemeBlurTintColor,#17171c);backdrop-filter:none}.ma-lite-page-tab{min-height:36px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:8px;background:rgba(0,0,0,.14);color:inherit;cursor:pointer}.ma-lite-page-tab[aria-selected="true"]{border-color:rgba(112,181,255,.55);background:rgba(112,181,255,.14);font-weight:700}.ma-lite-page{display:flex;flex-direction:column;gap:12px}.ma-lite-page[hidden]{display:none!important}
.ma-lite-api{display:flex;flex-direction:column;gap:7px;padding:10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:9px;background:var(--black30a,rgba(255,255,255,.04))}.ma-lite-api-head{display:flex;align-items:center;gap:7px;font-size:13px}.ma-lite-api-head i{opacity:.72}.ma-lite-api-select{box-sizing:border-box;width:100%;min-height:38px;padding:6px 9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.18));border-radius:7px;background:rgba(0,0,0,.22);color:inherit}.ma-lite-api-status{font-size:11px;line-height:1.4;opacity:.72}.ma-lite-api-help{font-size:10px;line-height:1.4;opacity:.52}
.ma-lite-switches{display:grid;grid-template-columns:1fr;gap:8px}
.ma-lite-switch{display:flex;align-items:center;gap:9px;padding:9px 10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.04));cursor:pointer}
.ma-lite-switch input{width:18px;height:18px;margin:0;flex:0 0 auto}.ma-lite-switch-text{min-width:0;flex:1}.ma-lite-switch-text b{display:block;font-size:13px}.ma-lite-switch-text small{display:block;margin-top:2px;opacity:.58;font-size:11px;line-height:1.35}
.ma-lite-thresholds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.ma-lite-number{display:flex;flex-direction:column;gap:4px;padding:7px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:8px;font-size:10px}.ma-lite-number input{box-sizing:border-box;width:100%;min-height:30px;padding:4px 6px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.16));border-radius:6px;background:rgba(0,0,0,.2);color:inherit}.ma-lite-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}.ma-lite-action{min-height:46px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.16));border-radius:9px;background:var(--black50a,rgba(255,255,255,.08));color:inherit;font-weight:700;cursor:pointer;touch-action:manipulation;pointer-events:auto!important;-webkit-tap-highlight-color:transparent}.ma-lite-action:disabled{opacity:.42;cursor:not-allowed}.ma-lite-action[data-kind="audit"]{border-color:rgba(112,181,255,.5)}.ma-lite-action[data-kind="extract"]{border-color:rgba(111,214,164,.5)}
.ma-lite-status{min-height:38px;padding:9px 10px;border-radius:8px;background:rgba(0,0,0,.18);font-size:12px;line-height:1.45;overflow-wrap:anywhere}.ma-lite-status[data-error="true"]{color:#ffb4b4}.ma-lite-note{font-size:11px;line-height:1.5;opacity:.58}
.ma-lite-management{display:flex;flex-direction:column;gap:8px;padding:9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.035))}.ma-lite-management-head{display:flex;align-items:center;gap:8px}.ma-lite-management-head strong{min-width:0;flex:1;font-size:13px}.ma-lite-management-refresh{min-width:32px;min-height:30px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:7px;background:rgba(0,0,0,.16);color:inherit;cursor:pointer}.ma-lite-management-status{font-size:10px;line-height:1.4;opacity:.65}.ma-lite-management-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.ma-lite-management-card{padding:8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.1));border-radius:8px;background:rgba(0,0,0,.12)}.ma-lite-management-card strong{display:block;font-size:11px}.ma-lite-management-card small{display:block;margin-top:3px;font-size:10px;line-height:1.4;opacity:.65}.ma-lite-management-pack{margin:0;max-height:250px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:8px;border-radius:7px;background:rgba(0,0,0,.2);font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}.ma-lite-management-issue{padding:7px 8px;border-radius:7px;background:rgba(255,190,90,.08);font-size:10px;line-height:1.4}.ma-lite-management-issue[data-level="error"]{background:rgba(255,100,100,.1)}.ma-lite-management-relation{padding:6px 8px;border-left:2px solid rgba(120,180,255,.45);font-size:10px;line-height:1.4;opacity:.86}.ma-lite-management-empty{padding:9px;text-align:center;font-size:10px;opacity:.56}
.ma-lite-prompt-editor{display:flex;flex-direction:column;gap:7px;padding:10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:9px;background:var(--black30a,rgba(255,255,255,.04))}.ma-lite-prompt-editor strong{font-size:13px}.ma-lite-prompt-editor small{font-size:10px;line-height:1.45;opacity:.62}.ma-lite-prompt-editor textarea{box-sizing:border-box;width:100%;min-height:180px;resize:vertical;padding:8px 9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.18));border-radius:7px;background:rgba(0,0,0,.22);color:inherit;font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}.ma-lite-prompt-save{align-self:flex-end;min-height:34px;padding:5px 12px;border:1px solid rgba(112,181,255,.48);border-radius:7px;background:rgba(112,181,255,.1);color:inherit;font-weight:700;cursor:pointer}.ma-lite-prompt-save:disabled{opacity:.45;cursor:not-allowed}
.ma-lite-recall{display:flex;flex-direction:column;gap:8px;padding:9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.035))}.ma-lite-recall-head{display:flex;align-items:center;gap:8px}.ma-lite-recall-head strong{min-width:0;flex:1;font-size:13px}.ma-lite-recall-refresh,.ma-lite-recall-replan{min-width:32px;min-height:30px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:7px;background:rgba(0,0,0,.16);color:inherit;cursor:pointer}.ma-lite-recall-status{font-size:10px;line-height:1.35;opacity:.62}.ma-lite-recall-summary{display:flex;flex-wrap:wrap;gap:5px}.ma-lite-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 6px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.13));border-radius:999px;background:rgba(0,0,0,.14);font-size:10px;white-space:nowrap}.ma-lite-recall-list{display:flex;flex-direction:column;gap:6px}.ma-lite-recall-row{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;padding:7px 8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.1));border-radius:8px;background:rgba(0,0,0,.11)}.ma-lite-recall-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:700}.ma-lite-recall-row-head{display:flex;align-items:center;gap:7px;min-width:0}.ma-lite-recall-focus{flex:0 0 auto;min-height:26px;padding:3px 7px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.15));border-radius:6px;background:rgba(0,0,0,.18);color:inherit;font-size:9px;cursor:pointer}.ma-lite-recall-focus[data-active="true"]{border-color:rgba(255,195,74,.55);background:rgba(255,195,74,.13)}.ma-lite-recall-focus:disabled{opacity:.45;cursor:not-allowed}.ma-lite-recall-meta{display:flex;flex-wrap:wrap;gap:4px}.ma-lite-badge{display:inline-flex;padding:2px 5px;border-radius:5px;background:rgba(255,255,255,.07);font-size:9px;line-height:1.3}.ma-lite-badge[data-kind="constant"]{background:rgba(255,195,74,.16)}.ma-lite-badge[data-kind="vector"]{background:rgba(112,181,255,.15)}.ma-lite-badge[data-kind="bridge"]{background:rgba(196,123,255,.16)}.ma-lite-badge[data-kind="terminal"]{background:rgba(111,214,164,.14)}.ma-lite-badge[data-kind="isolated"]{background:rgba(160,160,170,.14)}.ma-lite-badge[data-kind="active"]{background:rgba(92,205,139,.17)}.ma-lite-badge[data-kind="closed"]{background:rgba(170,170,180,.16)}.ma-lite-badge[data-kind="history"]{background:rgba(116,150,210,.14)}.ma-lite-badge[data-kind="scene"]{background:rgba(255,160,100,.14)}.ma-lite-recall-empty{padding:8px;text-align:center;font-size:10px;opacity:.56}.ma-lite-recall-pager{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:7px;margin-top:2px}.ma-lite-recall-page-button{min-height:32px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.14));border-radius:7px;background:rgba(0,0,0,.16);color:inherit;cursor:pointer}.ma-lite-recall-page-button:disabled{opacity:.38;cursor:not-allowed}.ma-lite-recall-page-status{font-size:10px;white-space:nowrap;opacity:.68}
.ma-lite-world-setting{display:flex;flex-direction:column;gap:9px;padding:10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.035))}.ma-lite-world-setting-head{font-size:13px}.ma-lite-world-setting-help{font-size:10px;line-height:1.45;opacity:.64}.ma-lite-world-setting textarea{box-sizing:border-box;width:100%;min-height:220px;resize:vertical;padding:8px 9px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.18));border-radius:7px;background:rgba(0,0,0,.22);color:inherit;font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}.ma-lite-world-setting-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.ma-lite-world-setting-actions button{min-height:40px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.15));border-radius:8px;background:rgba(0,0,0,.16);color:inherit;cursor:pointer}.ma-lite-world-setting-actions button:first-child{grid-column:1/-1;border-color:rgba(111,214,164,.5)}.ma-lite-world-setting-actions button:disabled{opacity:.4;cursor:not-allowed}.ma-lite-world-setting-status{font-size:10px;line-height:1.45;opacity:.7}.ma-lite-world-setting-preview{display:flex;flex-direction:column;gap:7px}.ma-lite-world-setting-entry{padding:7px 8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.1));border-radius:8px;background:rgba(0,0,0,.11)}.ma-lite-world-setting-entry strong{display:block;font-size:11px}.ma-lite-world-setting-entry pre{margin:5px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;opacity:.72}.ma-lite-world-setting-empty{padding:8px;text-align:center;font-size:10px;opacity:.56}.ma-lite-world-setting-warning{padding:6px 7px;border-radius:7px;background:rgba(255,190,90,.1);font-size:10px;line-height:1.4}
.ma-lite-rebuild{display:flex;flex-direction:column;gap:9px;padding:10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.12));border-radius:9px;background:var(--black30a,rgba(255,255,255,.035))}.ma-lite-rebuild-head{font-size:13px}.ma-lite-rebuild-help{font-size:10px;line-height:1.45;opacity:.64}.ma-lite-rebuild-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.ma-lite-rebuild-actions button{min-height:40px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.15));border-radius:8px;background:rgba(0,0,0,.16);color:inherit;cursor:pointer}.ma-lite-rebuild-actions button:first-child{grid-column:1/-1;border-color:rgba(112,181,255,.5)}.ma-lite-rebuild-actions button:disabled{opacity:.4;cursor:not-allowed}.ma-lite-rebuild-status{font-size:10px;line-height:1.45;opacity:.68}.ma-lite-rebuild-preview{display:flex;flex-direction:column;gap:6px}.ma-lite-rebuild-summary{display:flex;flex-wrap:wrap;gap:5px}.ma-lite-rebuild-warning{padding:6px 7px;border-radius:7px;background:rgba(255,190,90,.1);font-size:10px;line-height:1.4}.ma-lite-rebuild-empty{padding:8px;text-align:center;font-size:10px;opacity:.56}
.${INDICATOR_CLASS}{display:flex;flex-wrap:wrap;align-items:center;gap:6px 9px;width:max-content;max-width:100%;margin-top:7px;padding:5px 8px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.13));border-radius:999px;background:var(--black30a,rgba(0,0,0,.18));font-size:10px;line-height:1.2;color:var(--SmartThemeBodyColor,#fff);opacity:.78;user-select:none}
.${INDICATOR_CLASS} .ma-ind-label{font-weight:700}.ma-ind-part{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}.ma-ind-detail{flex-basis:100%;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.72}.ma-ind-dot{width:7px;height:7px;border-radius:50%;background:#777;box-shadow:0 0 0 1px rgba(255,255,255,.14)}.ma-ind-dot[data-state="ready"],.ma-ind-dot[data-state="success"]{background:#5ed18a}.ma-ind-dot[data-state="queued"]{background:#68a7ff}.ma-ind-dot[data-state="running"]{background:#f0bc57;animation:ma-lite-pulse 1s infinite}.ma-ind-dot[data-state="error"]{background:#ff6868}.ma-ind-dot[data-state="disabled"]{background:#6c6c72}@keyframes ma-lite-pulse{50%{opacity:.35}}
`;
        document.head.append(style);
    }
    buildPanel() {
        const panel = document.createElement('section');
        panel.id = PANEL_ID;
        panel.hidden = true;
        panel.setAttribute('aria-label', '镜渊操作面板');
        const header = document.createElement('div');
        header.className = 'ma-lite-header';
        const title = document.createElement('div');
        title.className = 'ma-lite-title';
        title.innerHTML = '<strong>Mirror Abyss｜镜渊</strong><small>审核、提取、总结调度与召回状态映射</small>';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'ma-lite-close';
        close.title = '收起';
        close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        close.addEventListener('click', () => this.closePanel());
        header.append(title, close);
        const body = document.createElement('div');
        body.className = 'ma-lite-body';
        const pageNav = document.createElement('nav');
        pageNav.className = 'ma-lite-page-nav';
        pageNav.setAttribute('aria-label', '镜渊面板分页');
        pageNav.append(
            this.makePageButton('run', '运行'),
            this.makePageButton('recall', '召回'),
            this.makePageButton('management', '管理'),
            this.makePageButton('settings', '设置'),
            this.makePageButton('worldSetting', '设定'),
            this.makePageButton('rebuild', '重建'),
        );
        const runPage = this.makePage('run');
        const recallPage = this.makePage('recall');
        const managementPage = this.makePage('management');
        const settingsPage = this.makePage('settings');
        const worldSettingPage = this.makePage('worldSetting');
        const rebuildPage = this.makePage('rebuild');
        const apiSection = this.buildApiSection();
        const switches = document.createElement('div');
        switches.className = 'ma-lite-switches';
        switches.append(
            this.makeSwitch('enabled', '总开关', '关闭后两个功能都不能执行。'),
            this.makeSwitch('autoAudit', '自动审核', 'AI 正文生成完成后自动审核；不通过时自动替换正文。'),
            this.makeSwitch('autoExtraction', '自动提取', 'AI 正文生成完成后，在审核完成或被跳过后提取最终正文。'),
            this.makeSwitch('autoSmallSummary', '自动小总结', '达到轮数或异步队列积压时，压缩近期正文并分发事实。'),
            this.makeSwitch('autoLargeSummary', '自动大总结', '累计小总结后沉降为长期历史并重新调度条目。'),
            this.makeSwitch('auditEnabled', '审核功能', '控制手动与自动审核是否可用。'),
            this.makeSwitch('extractionEnabled', '提取功能', '控制手动与自动提取是否可用。'),
            this.makeSwitch('activityPackEnabled', '活动包发送', '镜渊条目作为仓库，只由唯一活动包进入正文。'),
            this.makeSwitch('entryBudgetEnabled', '条目容量防护', '按类型和栏目压缩超长条目，不使用字符串硬截断。'),
        );
        const thresholds = document.createElement('div');
        thresholds.className = 'ma-lite-thresholds';
        thresholds.append(
            this.makeNumberInput('smallSummaryTurns', '小总结轮数', 1, 100),
            this.makeNumberInput('criticalChangesForSmall', '关键变化阈值', 1, 50),
            this.makeNumberInput('largeSummaryCount', '大总结计数', 1, 30),
            this.makeNumberInput('queueCompactThreshold', '队列压缩阈值', 2, 50),
            this.makeNumberInput('activityPackHardMax', '活动包硬上限', 600, 4000),
        );
        const auditPromptEditor = this.makePromptEditor(
            'auditPrompt',
            '基础审核提示词',
            '审核只读取这里的规则、最近完整对话、本轮玩家输入和本轮AI回复；不读取角色卡或世界书。',
        );
        const recall = this.buildRecallSection();
        const management = this.buildManagementSection();
        const worldSetting = this.buildWorldSettingSection();
        const rebuild = this.buildRebuildSection();
        const actions = document.createElement('div');
        actions.className = 'ma-lite-actions';
        const audit = this.makeActionButton('audit', '审核');
        const extract = this.makeActionButton('extract', '提取');
        actions.append(audit, extract);
        const status = document.createElement('div');
        status.className = 'ma-lite-status';
        status.setAttribute('aria-live', 'polite');
        this.statusNode = status;
        const note = document.createElement('div');
        note.className = 'ma-lite-note';
        note.textContent = '提取异常会先本地修复、合并重复条目并部分提交；仍无法解析时只修复一次异常输出。自动流程严格按“审核→正文替换落地→提取→总结”执行。';
        runPage.append(actions, status);
        recallPage.append(recall);
        managementPage.append(management);
        settingsPage.append(apiSection, switches, auditPromptEditor, thresholds, note);
        worldSettingPage.append(worldSetting);
        rebuildPage.append(rebuild);
        body.append(pageNav, runPage, recallPage, managementPage, settingsPage, worldSettingPage, rebuildPage);
        panel.append(header, body);
        this.showPage('run', false);
        return panel;
    }
    makePage(key) {
        const page = document.createElement('section');
        page.className = 'ma-lite-page';
        page.setAttribute('data-page', key);
        page.hidden = key !== this.activePage;
        this.pageNodes[key] = page;
        return page;
    }
    makePageButton(key, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ma-lite-page-tab';
        button.setAttribute('data-page', key);
        button.setAttribute('aria-selected', key === this.activePage ? 'true' : 'false');
        button.textContent = label;
        button.addEventListener('click', () => this.showPage(key, true));
        this.pageButtons[key] = button;
        return button;
    }
    showPage(key, refresh = true) {
        if (!this.pageNodes[key]) return;
        this.activePage = key;
        for (const [pageKey, page] of Object.entries(this.pageNodes)) page.hidden = pageKey !== key;
        for (const [pageKey, button] of Object.entries(this.pageButtons)) button.setAttribute('aria-selected', pageKey === key ? 'true' : 'false');
        if (refresh && key === 'recall') void this.refreshRecallMap(true);
        if (refresh && key === 'management') void this.refreshManagement(true);
        if (refresh && key === 'worldSetting') void this.refreshWorldSettingState();
        if (refresh && key === 'rebuild') void this.refreshRebuildState();
    }
    /** [MA-UI-API-01] 只创建一个轻量下拉框；选项由 SillyTavern 官方服务负责填充。 */
    buildApiSection() {
        const section = document.createElement('section');
        section.className = 'ma-lite-api';
        const head = document.createElement('div');
        head.className = 'ma-lite-api-head';
        head.innerHTML = '<i class="fa-solid fa-plug" aria-hidden="true"></i><strong>镜渊处理 API</strong>';
        const select = document.createElement('select');
        select.id = PROFILE_SELECT_ID;
        select.className = 'ma-lite-api-select';
        select.setAttribute('aria-label', '选择镜渊审核、提取和总结使用的连接配置');
        const loading = document.createElement('option');
        loading.value = '';
        loading.textContent = '正在读取 SillyTavern Connection Profiles…';
        select.append(loading);
        const status = document.createElement('div');
        status.className = 'ma-lite-api-status';
        status.textContent = '默认跟随当前 SillyTavern 连接。';
        const help = document.createElement('div');
        help.className = 'ma-lite-api-help';
        help.textContent = '连接、模型、地址和密钥仍在 SillyTavern「API Connections → Connection Profiles」中管理；镜渊不保存密钥。';
        section.append(head, select, status, help);
        this.apiProfileSelect = select;
        this.apiProfileStatusNode = status;
        return section;
    }
    /**
     * [MA-UI-API-02] 绑定官方 Connection Profile 下拉框。
     * 选中一个 Profile 时，同一 Profile 统一用于审核、修正、提取和两级总结，避免增加多套 API UI。
     */
    bindApiProfileSelector() {
        const select = this.apiProfileSelect;
        if (!select || this.profileDropdownBound) return;
        const settings = this.getSettings();
        const selectedId = settings.modelSource === 'profile' ? String(settings.modelProfileId || '') : '';
        if (this.actions.connectionProfilesAvailable?.() === false) {
            select.replaceChildren(new Option('当前 SillyTavern 连接', ''));
            select.disabled = true;
            if (this.apiProfileStatusNode) this.apiProfileStatusNode.textContent = 'Connection Profiles 已禁用或不可用，镜渊继续使用当前连接。';
            return;
        }
        try {
            const bound = this.actions.bindProfileDropdown?.(`#${PROFILE_SELECT_ID}`, selectedId, (profile) => {
                const profileId = String(profile?.id || '');
                this.actions.configure?.(buildUnifiedProfilePatch(profileId));
                this.lastOutcome = null;
                this.updateApiProfileStatus(profileId, profile?.name || '');
                this.setStatus(profileId ? `镜渊处理 API 已切换为：${profile?.name || profileId}` : '镜渊处理 API 已改为当前 SillyTavern 连接');
            });
            if (!bound) throw new Error('官方 Connection Profile 下拉服务不可用');
            this.profileDropdownBound = true;
            const defaultOption = select.querySelector('option[value=""]');
            if (defaultOption) defaultOption.textContent = '当前 SillyTavern 连接';
            select.value = selectedId;
            this.updateApiProfileStatus(selectedId);
        }
        catch (error) {
            select.replaceChildren(new Option('当前 SillyTavern 连接', ''));
            select.disabled = true;
            if (this.apiProfileStatusNode) this.apiProfileStatusNode.textContent = `无法读取 Connection Profiles：${(0, util_1.errorText)(error)}`;
        }
    }
    updateApiProfileStatus(profileId, knownName = '') {
        if (!this.apiProfileStatusNode) return;
        if (!profileId) {
            this.apiProfileStatusNode.textContent = '当前：跟随 SillyTavern 主连接；不会改变聊天正文使用的 API。';
            return;
        }
        let name = knownName;
        try { name ||= this.actions.profileName?.(profileId) || profileId; }
        catch { name ||= profileId; }
        this.apiProfileStatusNode.textContent = `当前：${name}；仅用于镜渊审核、修正、提取和总结，不切换主聊天 API。`;
    }
    buildWorldSettingSection() {
        const section = document.createElement('section');
        section.className = 'ma-lite-world-setting';
        const head = document.createElement('strong');
        head.className = 'ma-lite-world-setting-head';
        head.textContent = '玩家世界设定初始化';
        const help = document.createElement('div');
        help.className = 'ma-lite-world-setting-help';
        help.textContent = '只在玩家明确点击后读取下方文本。普通聊天仍保持防误触：玩家输入只用于理解行动，不会自动写成世界设定。先生成预览，确认后再写入当前绑定世界书。';
        const textarea = document.createElement('textarea');
        textarea.maxLength = 24000;
        textarea.placeholder = '粘贴世界框架、自然规则、种族、能力体系、地区组织、制度、开局地点与已存在人物。写作要求、文风和未来剧情计划不会进入世界书。';
        textarea.setAttribute('aria-label', '玩家世界设定文本');
        textarea.addEventListener('input', () => {
            if (this.actions.worldSettingsPreview?.()) {
                this.worldSettingDirty = true;
                if (this.worldSettingStatusNode) this.worldSettingStatusNode.textContent = '设定文本已修改，旧预览不可提交；请重新生成预览。';
            }
            this.syncDisabledState();
        });
        const actions = document.createElement('div');
        actions.className = 'ma-lite-world-setting-actions';
        const preview = document.createElement('button');
        preview.type = 'button';
        preview.textContent = '生成设定预览';
        preview.addEventListener('click', () => void this.runWorldSettingAction('previewWorldSettings'));
        const commit = document.createElement('button');
        commit.type = 'button';
        commit.textContent = '确认写入世界书';
        commit.addEventListener('click', () => void this.runWorldSettingAction('commitWorldSettings'));
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.textContent = '清空';
        clear.addEventListener('click', () => void this.runWorldSettingAction('clearWorldSettingsPreview'));
        actions.append(preview, commit, clear);
        const status = document.createElement('div');
        status.className = 'ma-lite-world-setting-status';
        status.textContent = '文本只保留在当前面板中，不写入插件设置；预览阶段不会修改世界书。';
        const content = document.createElement('div');
        content.className = 'ma-lite-world-setting-empty';
        content.textContent = '尚未生成设定预览';
        section.append(head, help, textarea, actions, status, content);
        this.worldSettingTextarea = textarea;
        this.worldSettingStatusNode = status;
        this.worldSettingPreviewNode = content;
        this.worldSettingPreviewButton = preview;
        this.worldSettingCommitButton = commit;
        this.worldSettingClearButton = clear;
        return section;
    }
    async runWorldSettingAction(kind) {
        if (this.pendingActions.has(kind)) return;
        const action = this.actions[kind];
        if (typeof action !== 'function') {
            this.setStatus('玩家设定导入功能未连接', true);
            return;
        }
        const source = String(this.worldSettingTextarea?.value || '').trim();
        if (kind !== 'clearWorldSettingsPreview' && !source) {
            this.setStatus('请先粘贴玩家世界设定', true);
            return;
        }
        this.pendingActions.add(kind);
        this.syncDisabledState();
        if (this.worldSettingStatusNode) {
            this.worldSettingStatusNode.textContent = kind === 'previewWorldSettings'
                ? '正在解析玩家设定并生成只读预览…'
                : kind === 'commitWorldSettings'
                    ? '正在原子写入当前绑定世界书并回读校验…'
                    : '正在清空设定文本与预览…';
        }
        try {
            if (kind === 'clearWorldSettingsPreview') {
                await action();
                if (this.worldSettingTextarea) this.worldSettingTextarea.value = '';
                this.worldSettingDirty = false;
                this.renderWorldSettingPreview(null);
                this.setStatus('玩家设定文本与预览已清空');
            }
            else if (kind === 'previewWorldSettings') {
                const result = await action(source);
                this.worldSettingDirty = false;
                this.renderWorldSettingPreview(result);
                this.setStatus(`玩家设定预览已生成：新建${result?.created?.length ?? 0}、更新${result?.updated?.length ?? 0}；世界书尚未修改`);
            }
            else {
                const result = await action(source);
                if (this.worldSettingTextarea) this.worldSettingTextarea.value = '';
                this.worldSettingDirty = false;
                this.renderWorldSettingPreview(null);
                this.setStatus(`玩家设定已写入：新建${result?.created?.length ?? 0}、更新${result?.updated?.length ?? 0}`);
                await this.refreshRecallMap(true);
            }
        }
        catch (error) {
            const text = (0, util_1.errorText)(error);
            this.setStatus(`玩家设定导入失败：${text}`, true);
            if (this.worldSettingStatusNode) this.worldSettingStatusNode.textContent = `失败：${text}`;
        }
        finally {
            this.pendingActions.delete(kind);
            this.syncDisabledState();
        }
    }
    async refreshWorldSettingState() {
        let preview = null;
        try { preview = this.actions.worldSettingsPreview?.() ?? null; }
        catch { }
        this.renderWorldSettingPreview(preview);
        this.syncDisabledState();
    }
    renderWorldSettingPreview(summary) {
        if (!this.worldSettingPreviewNode) return;
        this.worldSettingPreviewNode.replaceChildren();
        if (!summary?.previewReady) {
            this.worldSettingPreviewNode.className = 'ma-lite-world-setting-empty';
            this.worldSettingPreviewNode.textContent = '尚未生成设定预览';
            if (this.worldSettingStatusNode && !this.pendingActions.size) this.worldSettingStatusNode.textContent = '文本只保留在当前面板中，不写入插件设置；预览阶段不会修改世界书。';
            return;
        }
        this.worldSettingPreviewNode.className = 'ma-lite-world-setting-preview';
        const metrics = document.createElement('div');
        metrics.className = 'ma-lite-rebuild-summary';
        for (const [label, value] of [['新建', summary.created?.length ?? 0], ['更新', summary.updated?.length ?? 0], ['条目', summary.entries?.length ?? 0], ['格式修复', summary.repaired ?? 0], ['隔离', summary.skipped?.length ?? 0]]) {
            const chip = document.createElement('span');
            chip.className = 'ma-lite-chip';
            chip.textContent = `${label}：${value}`;
            metrics.append(chip);
        }
        this.worldSettingPreviewNode.append(metrics);
        for (const entry of (summary.entries ?? []).slice(0, 16)) {
            const row = document.createElement('div');
            row.className = 'ma-lite-world-setting-entry';
            const title = document.createElement('strong');
            title.textContent = entry.title;
            const content = document.createElement('pre');
            content.textContent = entry.content;
            row.append(title, content);
            this.worldSettingPreviewNode.append(row);
        }
        for (const skipped of (summary.skipped ?? []).slice(0, 6)) {
            const warning = document.createElement('div');
            warning.className = 'ma-lite-world-setting-warning';
            warning.textContent = `已隔离“${skipped.title}”${skipped.reason ? `：${skipped.reason}` : ''}`;
            this.worldSettingPreviewNode.append(warning);
        }
        for (const warningText of (summary.warnings ?? []).slice(0, 4)) {
            const warning = document.createElement('div');
            warning.className = 'ma-lite-world-setting-warning';
            warning.textContent = warningText;
            this.worldSettingPreviewNode.append(warning);
        }
        if (this.worldSettingStatusNode) this.worldSettingStatusNode.textContent = this.worldSettingDirty
            ? '设定文本已修改，旧预览不可提交；请重新生成预览。'
            : `预览已就绪；目标世界书：${summary.worldbookName || '当前绑定世界书'}。`;
    }
    setWorldSettingProgress(progress = {}) {
        if (!this.worldSettingStatusNode) return;
        const detail = String(progress.detail || '').trim();
        if (detail) this.worldSettingStatusNode.textContent = detail;
    }
    buildRebuildSection() {
        const section = document.createElement('section');
        section.className = 'ma-lite-rebuild';
        const head = document.createElement('strong');
        head.className = 'ma-lite-rebuild-head';
        head.textContent = 'AI辅助世界书重建';
        const help = document.createElement('div');
        help.className = 'ma-lite-rebuild-help';
        help.textContent = '旧表按小批次串行重建；每批完成后记录进度，限流会等待并重试，最终失败时下次从断点继续。提交时才替换镜渊旧表；非镜渊条目与手动锁定条目保持不动。';
        const actions = document.createElement('div');
        actions.className = 'ma-lite-rebuild-actions';
        const preview = document.createElement('button');
        preview.type = 'button';
        preview.textContent = '生成AI重建预览';
        preview.addEventListener('click', () => void this.runRebuildAction('migrate'));
        const commit = document.createElement('button');
        commit.type = 'button';
        commit.textContent = '提交并替换旧表';
        commit.addEventListener('click', () => void this.runRebuildAction('commitMigration'));
        const undo = document.createElement('button');
        undo.type = 'button';
        undo.textContent = '撤销上次重建';
        undo.addEventListener('click', () => void this.runRebuildAction('undoMigration'));
        actions.append(preview, commit, undo);
        const status = document.createElement('div');
        status.className = 'ma-lite-rebuild-status';
        status.textContent = '预览阶段不会修改世界书。提交后会回读校验；失败自动恢复旧表。';
        const content = document.createElement('div');
        content.className = 'ma-lite-rebuild-empty';
        content.textContent = '尚未生成重建预览';
        section.append(head, help, actions, status, content);
        this.rebuildNode = content;
        this.rebuildStatusNode = status;
        this.rebuildPreviewButton = preview;
        this.rebuildCommitButton = commit;
        this.rebuildUndoButton = undo;
        return section;
    }
    async runRebuildAction(kind) {
        if (this.pendingActions.has(kind)) return;
        const action = this.actions[kind];
        if (typeof action !== 'function') {
            this.setStatus('世界书重建功能未连接', true);
            return;
        }
        this.pendingActions.add(kind);
        this.syncDisabledState();
        if (this.rebuildStatusNode) this.rebuildStatusNode.textContent = kind === 'migrate' ? '正在串行处理世界书重建批次…' : kind === 'commitMigration' ? '正在原子提交新结构并回读校验…' : '正在恢复上次重建前的旧表…';
        try {
            const result = await action();
            const summary = kind === 'migrate' ? result : this.actions.migrationPreview?.();
            this.renderRebuildPreview(summary);
            if (kind === 'migrate') this.setStatus(result?.previewReady ? '世界书重建预览已生成，旧表未修改' : (result?.message || '没有可重建条目'));
            else if (kind === 'commitMigration') this.setStatus('世界书重建已提交，旧表已由新结构替换');
            else this.setStatus('上次世界书重建已撤销');
            await this.refreshRecallMap(true);
        }
        catch (error) {
            const text = (0, util_1.errorText)(error);
            this.setStatus(`世界书重建失败：${text}`, true);
            if (this.rebuildStatusNode) this.rebuildStatusNode.textContent = `失败：${text}`;
        }
        finally {
            this.pendingActions.delete(kind);
            this.syncDisabledState();
            void this.refreshRebuildState();
        }
    }
    async refreshRebuildState() {
        let preview = null;
        let workspace = null;
        try {
            preview = this.actions.migrationPreview?.() ?? null;
            workspace = await this.actions.loadWorkspace?.();
        }
        catch { }
        this.renderRebuildPreview(preview);
        if (this.rebuildCommitButton) this.rebuildCommitButton.disabled = !preview || this.pendingActions.size > 0;
        if (this.rebuildUndoButton) this.rebuildUndoButton.disabled = workspace?.canUndoMigration !== true || this.pendingActions.size > 0;
    }
    renderRebuildPreview(summary) {
        if (!this.rebuildNode) return;
        this.rebuildNode.replaceChildren();
        if (!summary?.previewReady && !summary?.worldbookName) {
            this.rebuildNode.className = 'ma-lite-rebuild-empty';
            this.rebuildNode.textContent = '尚未生成重建预览';
            return;
        }
        this.rebuildNode.className = 'ma-lite-rebuild-preview';
        const metrics = document.createElement('div');
        metrics.className = 'ma-lite-rebuild-summary';
        const items = [
            ['旧表', summary.candidates ?? 0],
            ['批次', summary.batches ?? 0],
            ['模型请求', summary.requests ?? 0],
            ['限流重试', summary.retries ?? 0],
            ['失败批次', summary.failedBatches ?? 0],
            ['覆盖率', `${summary.coveragePercent ?? 0}%`],
            ['未覆盖', summary.uncoveredEntries ?? 0],
            ['关键遗漏', summary.criticalUncoveredEntries ?? 0],
            ['对象簇', summary.semanticClusters ?? 0],
            ['场景锚点', summary.sceneAnchors ?? 0],
            ['时间未知', summary.unknownGameTimeAnchors ?? 0],
            ['事件轮', summary.eventPasses ?? 0],
            ['扩展轮', summary.customPasses ?? summary.organizationPasses ?? 0],
            ['地区轮', summary.regionPasses ?? 0],
            ['设定轮', summary.foundationPasses ?? 0],
            ['新条目', summary.rebuiltEntries ?? 0],
            ['同义收束', summary.convergedEntries ?? 0],
            ['附属并入', summary.absorbedEntries ?? 0],
            ['新增类型', Array.isArray(summary.newTypes) ? summary.newTypes.length : 0],
            ['合并', summary.mergedOldEntries ?? 0],
            ['原样保留', summary.retainedOriginalEntries ?? 0],
            ['既有归档', summary.preservedArchivedEntries ?? 0],
            ['恢复误关闭', summary.recoveredUi20Archives ?? 0],
            ['明确归档', summary.archivedEntries ?? 0],
            ['认知事实', summary.knowledgeLines ?? 0],
            ['保留外部条目', summary.preservedEntries ?? 0],
        ];
        for (const [label, value] of items) {
            const chip = document.createElement('span');
            chip.className = 'ma-lite-chip';
            chip.textContent = `${label}：${value}`;
            metrics.append(chip);
        }
        this.rebuildNode.append(metrics);
        for (const warningText of (summary.warnings ?? []).slice(0, 5)) {
            const warning = document.createElement('div');
            warning.className = 'ma-lite-rebuild-warning';
            warning.textContent = warningText;
            this.rebuildNode.append(warning);
        }
        if (this.rebuildStatusNode) this.rebuildStatusNode.textContent = summary.previewReady === false ? '没有可提交预览。' : '预览已就绪；提交前旧表保持不变。';
    }
    buildManagementSection() {
        const section = document.createElement('section');
        section.className = 'ma-lite-management';
        const head = document.createElement('div');
        head.className = 'ma-lite-management-head';
        const title = document.createElement('strong');
        title.textContent = '三维世界书与活动包';
        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.className = 'ma-lite-management-refresh';
        refresh.title = '刷新世界书管理视图';
        refresh.setAttribute('aria-label', '刷新世界书管理视图');
        refresh.innerHTML = '<i class="fa-solid fa-rotate" aria-hidden="true"></i>';
        refresh.addEventListener('click', () => void this.refreshManagement(true));
        head.append(title, refresh);
        const status = document.createElement('div');
        status.className = 'ma-lite-management-status';
        status.textContent = '只读投影：当前游戏时间、当前场景、人物沉降、容量问题与最终活动包。';
        const content = document.createElement('div');
        content.className = 'ma-lite-management-empty';
        content.textContent = '尚未读取';
        section.append(head, status, content);
        this.managementNode = content;
        this.managementStatusNode = status;
        this.managementRefreshButton = refresh;
        return section;
    }
    async refreshManagement(force = false) {
        if (!this.managementNode || typeof this.actions.loadWorkspace !== 'function') return;
        if (!force && this.panel?.hidden) return;
        const serial = ++this.managementLoadSerial;
        if (this.managementRefreshButton) this.managementRefreshButton.disabled = true;
        if (this.managementStatusNode) this.managementStatusNode.textContent = '正在读取世界书管理视图…';
        try {
            const workspace = await this.actions.loadWorkspace();
            if (serial !== this.managementLoadSerial || !this.managementNode) return;
            this.renderManagement(workspace?.management ?? null, workspace?.worldbookName || '');
        }
        catch (error) {
            if (serial !== this.managementLoadSerial || !this.managementNode) return;
            this.managementNode.className = 'ma-lite-management-empty';
            this.managementNode.textContent = `读取失败：${(0, util_1.errorText)(error)}`;
            if (this.managementStatusNode) this.managementStatusNode.textContent = '未修改世界书。';
        }
        finally {
            if (serial === this.managementLoadSerial && this.managementRefreshButton) this.managementRefreshButton.disabled = false;
        }
    }
    renderManagement(model, worldbookName) {
        if (!this.managementNode) return;
        this.managementNode.className = '';
        this.managementNode.replaceChildren();
        if (!model) {
            this.managementNode.className = 'ma-lite-management-empty';
            this.managementNode.textContent = '没有管理数据';
            return;
        }
        if (this.managementStatusNode) this.managementStatusNode.textContent = `${worldbookName ? `世界书：${worldbookName}；` : ''}${model.healthy ? '硬约束未发现阻断问题' : '存在需要处理的硬约束问题'}。`;
        const grid = document.createElement('div');
        grid.className = 'ma-lite-management-grid';
        const cards = [
            ['当前游戏时间', model.gameTime?.label || '未知', model.gameTime?.sceneTitle || '只保存当前值'],
            ['当前场景', model.currentScene?.title || '未识别', `在场${model.currentScene?.present?.length || 0}；固定角色${model.currentScene?.fixedSceneRoles?.length || 0}；固定设施${model.currentScene?.fixedFacilities?.length || 0}`],
            ['当前事件', String(model.counts?.activeEvents || 0), (model.activeEvents || []).map((item) => item.title).slice(0, 3).join('、') || '无'],
            ['人物投影', `当前${model.counts?.currentPeople || 0} / 沉降${model.counts?.settledPeople || 0}`, '人物不使用全局状态机；按当前场景、事件和焦点投影'],
            ['活动包', model.activityPack ? `${model.activityPack.length}/${model.activityPack.hardMax}字` : '未生成', `排除仓储条目${model.activityPack?.excludedWarehouseEntries || 0}条`],
            ['直接关联', String(model.counts?.directRelations || 0), (model.directRelations || []).slice(0, 2).map((item) => `${item.sourceTitle}↔${item.targetTitle}`).join('；') || '无'],
            ['数据健康', model.healthy ? '通过' : '有阻断项', `问题${model.issues?.length || 0}项`],
        ];
        for (const [label, value, detail] of cards) {
            const card = document.createElement('div');
            card.className = 'ma-lite-management-card';
            const strong = document.createElement('strong');
            strong.textContent = `${label}：${value}`;
            const small = document.createElement('small');
            small.textContent = detail;
            card.append(strong, small);
            grid.append(card);
        }
        this.managementNode.append(grid);
        if (model.directRelations?.length) {
            const title = document.createElement('strong');
            title.textContent = '一层直接关联';
            this.managementNode.append(title);
            for (const relation of model.directRelations.slice(0, 12)) {
                const node = document.createElement('div');
                node.className = 'ma-lite-management-relation';
                node.textContent = `${relation.sourceTitle} ↔ ${relation.targetTitle}`;
                this.managementNode.append(node);
            }
        }
        for (const issue of model.issues || []) {
            const node = document.createElement('div');
            node.className = 'ma-lite-management-issue';
            node.dataset.level = issue.level || 'info';
            node.textContent = issue.message;
            if (issue.entries?.length) node.title = issue.entries.join('\n');
            this.managementNode.append(node);
        }
        if (model.activityPack?.content) {
            const title = document.createElement('strong');
            title.textContent = '最终发送活动包';
            const pack = document.createElement('pre');
            pack.className = 'ma-lite-management-pack';
            pack.textContent = model.activityPack.content;
            this.managementNode.append(title, pack);
        }
    }

    buildRecallSection() {
        const section = document.createElement('section');
        section.className = 'ma-lite-recall';
        const head = document.createElement('div');
        head.className = 'ma-lite-recall-head';
        const title = document.createElement('strong');
        title.textContent = '世界书语义与召回状态';
        const replan = document.createElement('button');
        replan.type = 'button';
        replan.className = 'ma-lite-recall-replan';
        replan.title = '按场景中心规则重新规划镜渊管理条目';
        replan.setAttribute('aria-label', '重新规划世界书召回状态');
        replan.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>';
        replan.addEventListener('click', () => void this.replanRecallMap());
        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.className = 'ma-lite-recall-refresh';
        refresh.title = '刷新召回状态';
        refresh.setAttribute('aria-label', '刷新世界书召回状态');
        refresh.innerHTML = '<i class="fa-solid fa-rotate" aria-hidden="true"></i>';
        refresh.addEventListener('click', () => void this.refreshRecallMap(true));
        head.append(title, replan, refresh);
        const status = document.createElement('div');
        status.className = 'ma-lite-recall-status';
        status.textContent = '读取场景阶段与原生召回字段；“重新规划”只修改镜渊管理条目的召回设置，不改正文。';
        const content = document.createElement('div');
        content.className = 'ma-lite-recall-empty';
        content.textContent = '尚未读取';
        section.append(head, status, content);
        this.recallNode = content;
        this.recallStatusNode = status;
        this.recallRefreshButton = refresh;
        this.recallReplanButton = replan;
        return section;
    }
    async replanRecallMap() {
        if (typeof this.actions.replanRecall !== 'function') {
            this.setStatus('重新规划功能未连接', true);
            return;
        }
        if (this.recallReplanButton) this.recallReplanButton.disabled = true;
        if (this.recallRefreshButton) this.recallRefreshButton.disabled = true;
        if (this.recallReplanButton) this.recallReplanButton.disabled = true;
        if (this.recallStatusNode) this.recallStatusNode.textContent = '正在按场景中心规则重新规划召回字段…';
        try {
            await this.actions.replanRecall();
            this.setStatus('召回状态已重新规划');
            await this.refreshRecallMap(true);
        }
        catch (error) {
            const text = (0, util_1.errorText)(error);
            this.setStatus(`重新规划失败：${text}`, true);
            if (this.recallStatusNode) this.recallStatusNode.textContent = `重新规划失败：${text}`;
        }
        finally {
            if (this.recallReplanButton) this.recallReplanButton.disabled = false;
            if (this.recallRefreshButton) this.recallRefreshButton.disabled = false;
        }
    }
    async refreshRecallMap(force = false) {
        if (!this.recallNode || typeof this.actions.loadWorkspace !== 'function') return;
        if (!force && this.panel?.hidden) return;
        const serial = ++this.recallLoadSerial;
        if (this.recallRefreshButton) this.recallRefreshButton.disabled = true;
        if (this.recallReplanButton) this.recallReplanButton.disabled = true;
        if (this.recallStatusNode) this.recallStatusNode.textContent = '正在读取当前世界书…';
        try {
            const workspace = await this.actions.loadWorkspace();
            if (serial !== this.recallLoadSerial || !this.recallNode) return;
            const model = buildRecallViewModel(workspace?.entries ?? []);
            this.renderRecallMap(model, workspace?.worldbookName || '');
        }
        catch (error) {
            if (serial !== this.recallLoadSerial || !this.recallNode) return;
            this.recallNode.className = 'ma-lite-recall-empty';
            this.recallNode.textContent = `读取失败：${(0, util_1.errorText)(error)}`;
            if (this.recallStatusNode) this.recallStatusNode.textContent = '未修改任何世界书字段。';
        }
        finally {
            if (serial === this.recallLoadSerial && this.recallRefreshButton) this.recallRefreshButton.disabled = false;
            if (serial === this.recallLoadSerial && this.recallReplanButton) this.recallReplanButton.disabled = false;
        }
    }
    renderRecallMap(model, worldbookName) {
        this.recallModel = model;
        this.recallWorldbookName = worldbookName;
        const pageCount = Math.max(1, Math.ceil(Number(model?.total || 0) / this.recallPageSize));
        this.recallPage = Math.min(Math.max(1, this.recallPage), pageCount);
        this.renderRecallPage();
    }
    renderRecallPage() {
        if (!this.recallNode || !this.recallModel) return;
        const model = this.recallModel;
        this.recallNode.className = '';
        this.recallNode.replaceChildren();
        if (this.recallStatusNode) this.recallStatusNode.textContent = `${this.recallWorldbookName ? `世界书：${this.recallWorldbookName}；` : ''}仅显示镜渊管理条目，共 ${model.total} 条。`;
        if (!model.total) {
            this.recallNode.className = 'ma-lite-recall-empty';
            this.recallNode.textContent = '当前世界书没有镜渊管理条目';
            return;
        }
        const summary = document.createElement('div');
        summary.className = 'ma-lite-recall-summary';
        for (const item of model.summary) {
            const chip = document.createElement('span');
            chip.className = 'ma-lite-chip';
            chip.textContent = `${item.label} ${item.count}`;
            chip.title = item.description;
            summary.append(chip);
        }
        const pageCount = Math.max(1, Math.ceil(model.entries.length / this.recallPageSize));
        this.recallPage = Math.min(Math.max(1, this.recallPage), pageCount);
        const start = (this.recallPage - 1) * this.recallPageSize;
        const visibleEntries = model.entries.slice(start, start + this.recallPageSize);
        const list = document.createElement('div');
        list.className = 'ma-lite-recall-list';
        for (const item of visibleEntries) {
            const row = document.createElement('div');
            row.className = 'ma-lite-recall-row';
            const head = document.createElement('div');
            head.className = 'ma-lite-recall-row-head';
            const title = document.createElement('div');
            title.className = 'ma-lite-recall-title';
            title.textContent = item.title;
            title.title = item.title;
            head.append(title);
            if (item.type === '人物' && typeof this.actions.setFocus === 'function') {
                const focus = document.createElement('button');
                focus.type = 'button';
                focus.className = 'ma-lite-recall-focus';
                focus.dataset.active = item.focus ? 'true' : 'false';
                focus.textContent = item.focus ? '取消焦点' : '设为焦点';
                focus.title = item.focus ? '取消玩家主焦点' : '设为玩家主焦点；只调整召回，不改变事实内容';
                focus.addEventListener('click', async () => {
                    focus.disabled = true;
                    try {
                        await this.actions.setFocus(item.uid, !item.focus);
                        this.setStatus(item.focus ? `已取消主焦点：${item.title}` : `已设为主焦点：${item.title}`);
                        await this.refreshRecallMap(true);
                    }
                    catch (error) { this.setStatus(`焦点设置失败：${(0, util_1.errorText)(error)}`, true); }
                    finally { focus.disabled = false; }
                });
                head.append(focus);
            }
            const meta = document.createElement('div');
            meta.className = 'ma-lite-recall-meta';
            for (const badge of item.badges) {
                const node = document.createElement('span');
                node.className = 'ma-lite-badge';
                node.dataset.kind = badge.kind;
                node.textContent = badge.label;
                meta.append(node);
            }
            if (item.lifecycleLabel) {
                const node = document.createElement('span');
                node.className = 'ma-lite-badge';
                node.dataset.kind = item.lifecycleKind;
                node.textContent = item.lifecycleLabel;
                meta.append(node);
            }
            for (const text of [item.position, `顺序 ${item.order}`, item.scanDepth == null ? '扫描 继承' : `扫描 ${item.scanDepth}`]) {
                const node = document.createElement('span');
                node.className = 'ma-lite-badge';
                node.textContent = text;
                meta.append(node);
            }
            row.append(head, meta);
            list.append(row);
        }
        this.recallNode.append(summary, list);
        if (pageCount > 1) {
            const pager = document.createElement('div');
            pager.className = 'ma-lite-recall-pager';
            const previous = document.createElement('button');
            previous.type = 'button';
            previous.className = 'ma-lite-recall-page-button';
            previous.textContent = '上一页';
            previous.disabled = this.recallPage <= 1;
            previous.addEventListener('click', () => { this.recallPage -= 1; this.renderRecallPage(); });
            const status = document.createElement('span');
            status.className = 'ma-lite-recall-page-status';
            status.textContent = `第 ${this.recallPage} / ${pageCount} 页`;
            const next = document.createElement('button');
            next.type = 'button';
            next.className = 'ma-lite-recall-page-button';
            next.textContent = '下一页';
            next.disabled = this.recallPage >= pageCount;
            next.addEventListener('click', () => { this.recallPage += 1; this.renderRecallPage(); });
            pager.append(previous, status, next);
            this.recallNode.append(pager);
        }
    }
    makePromptEditor(key, labelText, description) {
        const section = document.createElement('section');
        section.className = 'ma-lite-prompt-editor';
        const title = document.createElement('strong');
        title.textContent = labelText;
        const help = document.createElement('small');
        help.textContent = description;
        const textarea = document.createElement('textarea');
        textarea.dataset.setting = key;
        textarea.setAttribute('aria-label', labelText);
        textarea.spellcheck = false;
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'ma-lite-prompt-save';
        save.textContent = '保存审核提示词';
        save.addEventListener('click', () => {
            const value = String(textarea.value || '').trim();
            if (!value) {
                this.setStatus('审核提示词不能为空；关闭审核请使用审核功能开关', true);
                return;
            }
            try {
                this.actions.configure?.({ [key]: value });
                this.lastOutcome = null;
                this.setStatus('审核提示词已保存');
            }
            catch (error) {
                this.setStatus(`保存审核提示词失败：${(0, util_1.errorText)(error)}`, true);
                this.refresh();
            }
        });
        section.append(title, help, textarea, save);
        this.inputs[key] = textarea;
        this.buttons[`${key}Save`] = save;
        return section;
    }
    makeSwitch(key, labelText, description) {
        const label = document.createElement('label');
        label.className = 'ma-lite-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.setting = key;
        const text = document.createElement('span');
        text.className = 'ma-lite-switch-text';
        const title = document.createElement('b');
        title.textContent = labelText;
        const detail = document.createElement('small');
        detail.textContent = description;
        text.append(title, detail);
        label.append(input, text);
        input.addEventListener('change', () => {
            try {
                this.actions.configure?.({ [key]: input.checked });
                this.lastOutcome = null;
                this.setStatus(`${labelText}已${input.checked ? '开启' : '关闭'}`);
                this.refresh();
            }
            catch (error) {
                input.checked = !input.checked;
                this.setStatus(`保存设置失败：${(0, util_1.errorText)(error)}`, true);
            }
        });
        this.inputs[key] = input;
        return label;
    }
    makeNumberInput(key, labelText, min, max) {
        const label = document.createElement('label');
        label.className = 'ma-lite-number';
        const text = document.createElement('span');
        text.textContent = labelText;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = String(min);
        input.max = String(max);
        input.step = '1';
        input.dataset.setting = key;
        input.addEventListener('change', () => {
            const value = Math.max(min, Math.min(max, Number(input.value || min)));
            try {
                this.actions.configure?.({ [key]: value });
                input.value = String(value);
                this.setStatus(`${labelText}已设为 ${value}`);
            } catch (error) {
                this.setStatus(`保存设置失败：${(0, util_1.errorText)(error)}`, true);
                this.refresh();
            }
        });
        label.append(text, input);
        this.inputs[key] = input;
        return label;
    }
    makeActionButton(kind, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ma-lite-action';
        button.dataset.kind = kind;
        button.textContent = label;
        button.addEventListener('click', () => void this.runAction(kind));
        this.buttons[kind] = button;
        return button;
    }
    async runAction(kind) {
        if (this.pendingActions.has(kind)) return;
        const settings = this.getSettings();
        if (!settings.enabled) {
            this.setStatus('总开关已关闭', true);
            return;
        }
        if (kind === 'audit' && settings.auditEnabled === false) {
            this.setStatus('审核开关已关闭', true);
            return;
        }
        if (kind === 'extract' && settings.extractionEnabled === false) {
            this.setStatus('提取开关已关闭', true);
            return;
        }
        const action = this.actions[kind];
        if (typeof action !== 'function') {
            this.setStatus(`${kind === 'audit' ? '审核' : '提取'}功能未连接`, true);
            return;
        }
        this.pendingActions.add(kind);
        this.lastOutcome = null;
        this.syncDisabledState();
        this.setTaskProgress(kind, 'queued', kind === 'audit' ? '审核已进入异步队列' : '提取已进入异步队列', { titles: [], created: [], updated: [], skipped: [] });
        try {
            await action();
            this.lastOutcome = { kind, state: 'success' };
            if (['queued', 'running'].includes(this.taskStates[kind]?.state)) this.setTaskProgress(kind, 'success', kind === 'audit' ? '审核完成' : '提取完成');
        }
        catch (error) {
            this.lastOutcome = { kind, state: 'error' };
            this.setTaskProgress(kind, 'error', `${(0, util_1.errorText)(error)}`, { error: (0, util_1.errorText)(error) });
            this.setStatus(`${kind === 'audit' ? '审核' : '提取'}失败：${(0, util_1.errorText)(error)}`, true);
        }
        finally {
            this.pendingActions.delete(kind);
            this.syncDisabledState();
            this.scheduleIndicatorRefresh();
        }
    }
    getSettings() {
        try { return this.actions.getSettings?.() ?? {}; }
        catch { return {}; }
    }
    refresh() {
        const settings = this.getSettings();
        if (this.inputs.enabled) this.inputs.enabled.checked = settings.enabled !== false;
        if (this.inputs.autoAudit) this.inputs.autoAudit.checked = settings.autoAudit === true;
        if (this.inputs.autoExtraction) this.inputs.autoExtraction.checked = settings.autoExtraction === true;
        if (this.inputs.autoSmallSummary) this.inputs.autoSmallSummary.checked = settings.autoSmallSummary !== false;
        if (this.inputs.autoLargeSummary) this.inputs.autoLargeSummary.checked = settings.autoLargeSummary !== false;
        if (this.inputs.smallSummaryTurns) this.inputs.smallSummaryTurns.value = String(settings.smallSummaryTurns ?? 10);
        if (this.inputs.criticalChangesForSmall) this.inputs.criticalChangesForSmall.value = String(settings.criticalChangesForSmall ?? 6);
        if (this.inputs.largeSummaryCount) this.inputs.largeSummaryCount.value = String(settings.largeSummaryCount ?? 5);
        if (this.inputs.queueCompactThreshold) this.inputs.queueCompactThreshold.value = String(settings.queueCompactThreshold ?? 6);
        if (this.inputs.auditEnabled) this.inputs.auditEnabled.checked = settings.auditEnabled !== false;
        if (this.inputs.extractionEnabled) this.inputs.extractionEnabled.checked = settings.extractionEnabled !== false;
        if (this.inputs.auditPrompt && (typeof document === 'undefined' || document.activeElement !== this.inputs.auditPrompt)) {
            this.inputs.auditPrompt.value = String(settings.auditPrompt || '');
        }
        if (this.apiProfileSelect && this.profileDropdownBound) {
            const selectedId = settings.modelSource === 'profile' ? String(settings.modelProfileId || '') : '';
            this.apiProfileSelect.value = selectedId;
            this.updateApiProfileStatus(selectedId);
        }
        this.syncDisabledState();
        if (this.statusNode) {
            this.statusNode.textContent = this.statusText;
            this.statusNode.dataset.error = this.statusError ? 'true' : 'false';
        }
        this.scheduleIndicatorRefresh();
    }
    syncDisabledState() {
        const settings = this.getSettings();
        const master = settings.enabled !== false;
        if (this.buttons.audit) this.buttons.audit.disabled = this.pendingActions.has('audit') || !master || settings.auditEnabled === false;
        if (this.buttons.extract) this.buttons.extract.disabled = this.pendingActions.has('extract') || !master || settings.extractionEnabled === false;
        if (this.buttons.auditPromptSave) this.buttons.auditPromptSave.disabled = this.pendingActions.size > 0;
        if (this.worldSettingPreviewButton) this.worldSettingPreviewButton.disabled = this.pendingActions.size > 0 || !master || !String(this.worldSettingTextarea?.value || '').trim();
        if (this.worldSettingCommitButton) this.worldSettingCommitButton.disabled = this.pendingActions.size > 0 || !master || this.worldSettingDirty || !this.actions.worldSettingsPreview?.();
        if (this.worldSettingClearButton) this.worldSettingClearButton.disabled = this.pendingActions.size > 0 || (!String(this.worldSettingTextarea?.value || '').trim() && !this.actions.worldSettingsPreview?.());
        if (this.rebuildPreviewButton) this.rebuildPreviewButton.disabled = this.pendingActions.size > 0 || !master;
        if (this.rebuildCommitButton) this.rebuildCommitButton.disabled = this.pendingActions.size > 0 || !master || !this.actions.migrationPreview?.();
        if (this.rebuildUndoButton && this.pendingActions.size > 0) this.rebuildUndoButton.disabled = true;
        for (const input of Object.values(this.inputs)) input.disabled = false;
    }

    setMigrationProgress(progress = {}) {
        if (!this.rebuildStatusNode) return;
        const detail = String(progress.detail || '').trim();
        const current = Number(progress.current || 0);
        const total = Number(progress.total || 0);
        const requests = Number(progress.requests || 0);
        const retries = Number(progress.retries || 0);
        const prefix = total > 0 ? `${current}/${total}批` : '重建';
        this.rebuildStatusNode.textContent = `${prefix}；请求${requests}次${retries ? `，限流重试${retries}次` : ''}${detail ? `；${detail}` : ''}`;
    }
    setStatus(text, isError = false) {
        this.statusText = String(text || '');
        this.statusError = Boolean(isError);
        if (this.statusNode) {
            this.statusNode.textContent = this.statusText;
            this.statusNode.dataset.error = this.statusError ? 'true' : 'false';
        }
        this.scheduleIndicatorRefresh();
    }
    setTaskProgress(kind, state, detail = '', meta = {}) {
        if (!this.taskStates[kind]) return;
        const previous = this.taskStates[kind];
        this.taskStates[kind] = {
            ...previous,
            state: state || previous.state || 'idle',
            detail: String(detail || previous.detail || ''),
            titles: Array.isArray(meta.titles) ? [...meta.titles] : previous.titles,
            created: Array.isArray(meta.created) ? [...meta.created] : previous.created,
            updated: Array.isArray(meta.updated) ? [...meta.updated] : previous.updated,
            skipped: Array.isArray(meta.skipped) ? [...meta.skipped] : previous.skipped,
            merged: Array.isArray(meta.merged) ? [...meta.merged] : previous.merged,
            repaired: Number.isFinite(meta.repaired) ? Number(meta.repaired) : previous.repaired,
            messageIndex: Number.isInteger(meta.messageIndex) ? meta.messageIndex : previous.messageIndex,
            queuePosition: Number.isFinite(meta.queuePosition) ? Number(meta.queuePosition) : previous.queuePosition,
        };
        if (detail) {
            this.statusText = `${kind === 'audit' ? '审核' : '提取'}：${detail}`;
            this.statusError = state === 'error';
            if (this.statusNode) {
                this.statusNode.textContent = this.statusText;
                this.statusNode.dataset.error = this.statusError ? 'true' : 'false';
            }
        }
        this.scheduleIndicatorRefresh();
    }
    resetTaskStates(detail = '待命') {
        this.taskStates.audit = { state: 'idle', detail, titles: [], created: [], updated: [], skipped: [], merged: [], repaired: 0, messageIndex: null, queuePosition: 0 };
        this.taskStates.extract = { state: 'idle', detail, titles: [], created: [], updated: [], skipped: [], merged: [], repaired: 0, messageIndex: null, queuePosition: 0 };
        this.lastOutcome = null;
        this.scheduleIndicatorRefresh();
    }
    togglePanel() {
        if (!this.panel) return;
        const opening = this.panel.hidden;
        this.panel.hidden = !opening;
        this.launcher?.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (opening) { this.refresh(); void this.refreshRecallMap(true); }
    }
    closePanel() {
        if (!this.panel) return;
        this.panel.hidden = true;
        this.launcher?.setAttribute('aria-expanded', 'false');
    }
    mountOfficialSettingsEntry() {
        const container = document.getElementById('extensions_settings2');
        if (!container) return;
        document.getElementById(SETTINGS_ID)?.remove();
        const entry = document.createElement('div');
        entry.id = SETTINGS_ID;
        entry.className = 'inline-drawer';
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Mirror Abyss｜打开审核与提取面板';
        button.style.cssText = 'box-sizing:border-box;width:100%;min-height:42px;padding:8px 10px;text-align:left;';
        button.addEventListener('click', () => {
            if (this.panel) this.panel.hidden = false;
            this.launcher?.setAttribute('aria-expanded', 'true');
            this.refresh();
            void this.refreshRecallMap(true);
        });
        entry.append(button);
        container.append(entry);
        this.settingsEntry = entry;
    }
    observeChat() {
        this.observer?.disconnect();
        const chat = document.getElementById('chat');
        if (!chat || typeof MutationObserver === 'undefined') return;
        this.observer = new MutationObserver(() => this.scheduleIndicatorRefresh());
        this.observer.observe(chat, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'is_user', 'is_system', 'mesid'] });
    }
    scheduleIndicatorRefresh() {
        if (typeof document === 'undefined') return;
        if (this.pendingIndicatorFrame) return;
        this.pendingIndicatorFrame = requestAnimationFrame(() => {
            this.pendingIndicatorFrame = 0;
            this.renderIndicator();
        });
    }
    renderIndicator() {
        const messages = [...document.querySelectorAll('#chat .mes[is_user="false"][is_system="false"]')];
        const target = messages.at(-1);
        document.querySelectorAll(`.${INDICATOR_CLASS}`).forEach((node) => {
            if (!target || !target.contains(node)) node.remove();
        });
        if (!target) return;
        const text = target.querySelector('.mes_text');
        const block = target.querySelector('.mes_block') || target;
        if (!text || !block) return;
        let indicator = block.querySelector(`.${INDICATOR_CLASS}`);
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = INDICATOR_CLASS;
            text.insertAdjacentElement('afterend', indicator);
        }
        const settings = this.getSettings();
        const master = settings.enabled !== false;
        const auditState = this.indicatorState('audit', master && settings.auditEnabled !== false);
        const extractState = this.indicatorState('extract', master && settings.extractionEnabled !== false);
        const audit = this.taskStates.audit;
        const extract = this.taskStates.extract;
        const auditText = audit.detail || this.stateLabel(auditState);
        const extractText = extract.detail || this.stateLabel(extractState);
        const compactList = (label, values) => {
            const list = Array.isArray(values) ? values : [];
            if (!list.length) return '';
            const shown = list.slice(0, 4).join('、');
            return `${label}：${shown}${list.length > 4 ? ` 等${list.length}条` : ''}`;
        };
        const resultParts = [
            compactList('新建', extract.created),
            compactList('更新', extract.updated),
            compactList('合并', extract.merged),
            extract.repaired ? `修复：${extract.repaired}处` : '',
            compactList('跳过', extract.skipped),
        ].filter(Boolean);
        const titleDetail = compactList(extract.state === 'running' ? '处理中' : '条目', extract.titles);
        const detail = resultParts.length ? resultParts.join('；') : titleDetail;
        const fullDetail = [
            compactList('提取条目', extract.titles),
            compactList('新建', extract.created),
            compactList('更新', extract.updated),
            compactList('合并', extract.merged),
            extract.repaired ? `修复：${extract.repaired}处` : '',
            compactList('跳过', extract.skipped),
        ].filter(Boolean).join('\n');
        indicator.title = [this.statusText, fullDetail].filter(Boolean).join('\n') || '镜渊状态';
        indicator.innerHTML = `<span class="ma-ind-label">镜渊</span><span class="ma-ind-part"><i class="ma-ind-dot" data-state="${auditState}"></i>审核：${escapeHtml(auditText)}</span><span class="ma-ind-part"><i class="ma-ind-dot" data-state="${extractState}"></i>提取：${escapeHtml(extractText)}</span>${detail ? `<span class="ma-ind-detail">${escapeHtml(detail)}</span>` : ''}`;
    }
    indicatorState(kind, enabled) {
        if (!enabled) return 'disabled';
        const state = this.taskStates[kind]?.state;
        if (state === 'queued') return 'queued';
        if (state === 'running') return 'running';
        if (state === 'success') return 'success';
        if (state === 'error') return 'error';
        if (state === 'disabled') return 'disabled';
        return 'ready';
    }
    stateLabel(state) {
        return ({ disabled: '关闭', queued: '排队', running: '处理中', success: '完成', error: '失败', ready: '待命' })[state] || '待命';
    }
}
/** [MA-UI-API-03] 一个 Profile 统一覆盖所有模型阶段；空值恢复当前连接。 */
function buildUnifiedProfilePatch(profileId) {
    const id = String(profileId || '');
    return {
        modelSource: id ? 'profile' : 'current',
        modelProfileId: id,
        auditProfileId: id,
        revisionProfileId: id,
        extractionProfileId: id,
        smallSummaryProfileId: id,
        largeSummaryProfileId: id,
        migrationProfileId: id,
    };
}
function buildRecallViewModel(entries) {
    const managed = (Array.isArray(entries) ? entries : []).filter((entry) => entry?.managed === true);
    const mapped = managed.map((entry) => {
        const activation = entry.activation ?? {};
        const constant = activation.constant === true;
        // [MA-UI-RECALL-01] 关键词统计只读取 raw.key 的真实非 UID 触发词，不能用用于匹配的逻辑关键词冒充触发。
        const trigger = !constant && (entry.triggerKeywords ?? []).some((keyword) => !(0, util_1.isUidKeyword)(keyword));
        const vector = activation.vectorized === true;
        const prevent = activation.preventRecursion === true;
        const exclude = activation.excludeRecursion === true;
        let recursion = { key: 'source', label: '关联入口', kind: 'bridge' };
        if (!prevent && !exclude) recursion = { key: 'bridge', label: '双向关联', kind: 'bridge' };
        else if (prevent && !exclude) recursion = { key: 'terminal', label: '关联终点', kind: 'terminal' };
        else if (prevent && exclude) recursion = { key: 'isolated', label: '递归隔离', kind: 'isolated' };
        const lifecycle = String(entry.lifecycle || entry.memoryTier || 'background');
        const lifecycleInfo = lifecycleBadge(lifecycle);
        const semanticRole = String(entry.semanticRole || '');
        const sceneStage = String(entry.sceneStage || '');
        const position = Number(activation.position ?? 0);
        const depth = Math.max(0, Number(activation.depth ?? 0));
        const positionLabel = position === 0 ? '角色定义前' : position === 1 ? '角色定义后' : position === 4 ? `对话深度 ${depth}` : `位置 ${position}${depth ? ` / 深度 ${depth}` : ''}`;
        const badges = [];
        if (activation.disabled === true || activation.enabled === false) badges.push({ label: '停用', kind: 'isolated' });
        if (constant) badges.push({ label: '常驻', kind: 'constant' });
        else if (trigger) badges.push({ label: '关键词触发', kind: 'trigger' });
        if (vector) badges.push({ label: '纯向量', kind: 'vector' });
        if (sceneStage) badges.push({ label: sceneStage === 'current' ? '当前场景' : sceneStage === 'previous' ? '上一场景' : '远期场景', kind: 'scene' });
        if (semanticRole === 'world-state') badges.push({ label: '世界变化', kind: 'scene' });
        if (Number(activation.delayUntilRecursion || 0) > 0) badges.push({ label: `仅递归 ${activation.delayUntilRecursion}`, kind: 'bridge' });
        badges.push({ label: recursion.label, kind: recursion.kind });
        return {
            uid: String(entry.uid ?? ''),
            type: String(entry.type ?? ''),
            focus: entry.focus === true,
            title: String(entry.title || entry.name || entry.uid || '未命名条目'),
            lifecycle,
            lifecycleLabel: lifecycleInfo.label,
            lifecycleKind: lifecycleInfo.kind,
            semanticRole,
            sceneStage,
            constant,
            trigger,
            vector,
            recursion: recursion.key,
            disabled: activation.disabled === true || activation.enabled === false,
            badges,
            position: positionLabel,
            depth,
            order: Number(activation.order ?? 400),
            scanDepth: activation.scanDepth == null ? null : Number(activation.scanDepth),
            updatedAt: Number(entry.updatedAt || 0),
        };
    });
    mapped.sort((left, right) => Number(left.disabled) - Number(right.disabled) || Number(right.constant) - Number(left.constant) || Number(right.sceneStage === 'current') - Number(left.sceneStage === 'current') || Number(right.recursion === 'bridge') - Number(left.recursion === 'bridge') || right.order - left.order || right.updatedAt - left.updatedAt || left.title.localeCompare(right.title, 'zh-CN'));
    const summary = [
        { label: '当前场景', count: mapped.filter((item) => item.sceneStage === 'current').length, description: '常驻并负责关联当前局部世界' },
        { label: '上一场景', count: mapped.filter((item) => item.sceneStage === 'previous').length, description: '通过稳定场景名触发并恢复关联' },
        { label: '远期场景', count: mapped.filter((item) => item.sceneStage === 'remote').length, description: '通过纯向量召回并恢复场景关联' },
        { label: '焦点/基础', count: mapped.filter((item) => ['focus', 'foundation'].includes(item.semanticRole)).length, description: '长期常驻且完全递归隔离' },
        { label: '世界变化', count: mapped.filter((item) => item.semanticRole === 'world-state').length, description: '跨场景整体变化，可被场景关联并继续关联' },
        { label: '关键词', count: mapped.filter((item) => item.trigger).length, description: '真实存在非 UID 关键词的触发条目' },
        { label: '纯向量', count: mapped.filter((item) => item.vector && !item.trigger).length, description: '只通过 Vector Storage 语义召回' },
        { label: '关联入口', count: mapped.filter((item) => ['source', 'bridge'].includes(item.recursion)).length, description: '场景与世界变化可以继续带出关联条目' },
        { label: '关联终点', count: mapped.filter((item) => item.recursion === 'terminal').length, description: '人物、物品和活动事件被带出后停止' },
        { label: '隔离', count: mapped.filter((item) => item.recursion === 'isolated').length, description: '基础设定、焦点与历史容器不参与递归' },
    ];
    return { total: mapped.length, summary, entries: mapped, omitted: 0 };
}

function lifecycleBadge(value) {
    return ({
        core: { label: '核心', kind: 'constant' },
        active: { label: '活动', kind: 'active' },
        recent: { label: '近期', kind: 'active' },
        'recent-summary': { label: '近期总结', kind: 'active' },
        'long-term': { label: '长期', kind: 'history' },
        historical: { label: '历史', kind: 'history' },
        'historical-summary': { label: '历史总结', kind: 'history' },
        closed: { label: '已关闭', kind: 'closed' },
        settled: { label: '已离场', kind: 'closed' },
        temporary: { label: '临时', kind: 'closed' },
        background: { label: '背景', kind: 'isolated' },
    })[String(value ?? '')] ?? { label: String(value || '背景'), kind: 'isolated' };
}
function clamp01(value) {
    return Math.min(1, Math.max(0, Number(value) || 0));
}
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
exports.ControlPanel = ControlPanel;
},"domain/entry-section":function(module,exports,require){

"use strict";
const { parseEntrySections, serializeEntrySections } = require("../parser");
const { canonicalSectionName, mergeCanonicalLines } = require("./information-point");
const { normalizeTitle, splitTitle, unique } = require("../util");

// [MA-SECTION-02] 读取旧世界书正文时按条目类型合并同义小标题。
// 例如人物【当前状态】与【当前】统一为【当前】；场景【当前】统一为【当前状态】。
function normalizeEntrySections(parsed, type = '') {
    const order = [];
    const values = {};
    for (const rawName of parsed.order ?? []) {
        const name = canonicalSectionName(rawName, type);
        if (!name) continue;
        if (!values[name]) {
            values[name] = [];
            order.push(name);
        }
        values[name] = mergeCanonicalLines(name, values[name], parsed.values?.[rawName] ?? []);
    }
    return { order, values };
}
function sectionLines(content, names, type = '') {
    const parsed = normalizeEntrySections(parseEntrySections(content), type);
    const normalized = new Set(names.map((name) => canonicalSectionName(name, type).replace(/\s+/g, '').toLocaleLowerCase()));
    return parsed.order.flatMap((name) => normalized.has(name.replace(/\s+/g, '').toLocaleLowerCase()) ? parsed.values[name] ?? [] : []);
}
function extractReferences(content, type = '') {
    const parsed = normalizeEntrySections(parseEntrySections(content), type);
    const output = [];
    for (const [name, lines] of Object.entries(parsed.values)) {
        if (!/(关联|关系对象|涉及条目|参与对象|引用)/u.test(name)) continue;
        for (const line of lines) {
            const title = normalizeTitle(line.replace(/^[-*•]\s*/u, ''));
            if (splitTitle(title)) output.push(title);
        }
    }
    return unique(output);
}
exports.canonicalSectionName = canonicalSectionName;
exports.normalizeEntrySections = normalizeEntrySections;
exports.parseEntrySections = (content, type = '') => normalizeEntrySections(parseEntrySections(content), type);
exports.serializeEntrySections = serializeEntrySections;
exports.sectionLines = sectionLines;
exports.extractReferences = extractReferences;
},"domain/information-point":function(module,exports,require){

"use strict";
const { unique } = require("../util");

// [MA-SECTION-01] 小标题必须先按条目类型归一化。
// 同一个语义不能同时保留“当前”和“当前状态”，否则二次提取会把它们当成两个子条目。
const COMMON_SECTION_ALIASES = {
    '其他名称': '别名',
    '称号': '别名',
};
const TYPE_SECTION_ALIASES = {
    人物: {
        '身份定义': '身份',
        '持续经历': '固定事实',
        '近期经历': '固定事实',
        '变化记录': '固定事实',
        '当前状态': '当前',
        '现行事实': '当前',
        '状态': '当前',
        '性格': '性格核心',
        '人格': '性格核心',
        '说话方式': '表达方式',
        '语言风格': '表达方式',
        '行为倾向': '决策倾向',
        '判断倾向': '决策倾向',
        '关系态度': '关系立场',

    },
    场景: {
        '地点属性': '定义',
        '持续变化': '固定事实',
        '稳定空间': '空间结构',
        '当前': '当前状态',
        '现行事实': '当前状态',
        '状态': '当前状态',
        '局部变化': '固定事实',
        '变化记录': '固定事实',
        '固定人员': '常驻角色',
        '常驻人员': '常驻角色',
        '固定设备': '固定设施',
        '场景设施': '固定设施',
    },
    物品: {
        '对象定义': '定义',
        '持续变化': '固定事实',
        '当前状态': '当前',
        '现行事实': '当前',
        '状态': '当前',
        '变化记录': '固定事实',
        '固定人员': '常驻角色',
        '常驻人员': '常驻角色',
        '固定设备': '固定设施',
        '场景设施': '固定设施',
    },
    事件: {
        '事件进程': '已发生进展',
        '关键进展': '已发生进展',
        '进展': '已发生进展',
        '已发生经过': '已发生进展',
        '未形成进展': '未发生进展',
        '无状态变化': '未发生进展',
        '过程材料': '未发生进展',
        '最终结果': '结果',
        '当前结果': '结果',
        '结束结论': '结果',
    },
    世界: {
        '对象范围': '范围',
        '影响范围': '范围',
        '区域': '地理',
        '势力': '组织',
        '组织格局': '组织',
        '交通': '资源与交通',
        '资源网络': '资源与交通',
        '当前': '公开局势',
        '当前状态': '公开局势',
        '现行事实': '公开局势',
        '状态': '公开局势',
        '全局状态': '公开局势',
        '世界变化': '固定事实',
        '变化记录': '固定事实',
        '固定人员': '常驻角色',
        '常驻人员': '常驻角色',
        '固定设备': '固定设施',
        '场景设施': '固定设施',
    },
    基础设定: {
        '世界规则': '自然规则',
        '基础规则': '自然规则',
        '规则': '自然规则',
        '种族': '种族与生命',
        '生命规则': '种族与生命',
        '魔法与技术': '能力与技术',
        '技术体系': '能力与技术',
        '社会制度': '社会规则',
        '地理': '地理框架',
    },
};

function canonicalSectionName(value, type = '') {
    const raw = String(value ?? '').trim();
    const compact = raw.replace(/\s+/gu, '');
    return TYPE_SECTION_ALIASES[String(type ?? '')]?.[compact]
        ?? COMMON_SECTION_ALIASES[compact]
        ?? raw;
}

function sectionSlot(line) {
    return String(line ?? '').match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1]?.replace(/\s+/gu, '') ?? '';
}

function mergeCanonicalLines(section, oldLines, incomingLines) {
    const replaceBySlot = /^(当前|当前状态|关系)$/u.test(String(section ?? ''));
    // 世界、基础设定和定义类栏目允许并列多条事实；它们不是单值状态槽。
    if (!replaceBySlot) return unique([...(oldLines ?? []), ...(incomingLines ?? [])]);
    const output = [...(oldLines ?? [])];
    const slots = new Map();
    output.forEach((line, index) => {
        const slot = sectionSlot(line);
        if (slot) slots.set(slot, index);
    });
    for (const line of incomingLines ?? []) {
        const slot = sectionSlot(line);
        if (slot && slots.has(slot)) output[slots.get(slot)] = line;
        else {
            if (slot) slots.set(slot, output.length);
            output.push(line);
        }
    }
    return unique(output);
}

function prepareInformationBlocks(parsedBlocks) {
    return parsedBlocks.map((block) => {
        const merged = new Map();
        for (const rawSection of block.sections ?? []) {
            const name = canonicalSectionName(rawSection.name, block.type);
            if (!name) continue;
            const current = merged.get(name) ?? { name, lines: [], empty: true };
            current.lines = mergeCanonicalLines(name, current.lines, rawSection.lines ?? []);
            current.empty = current.lines.length === 0 && (current.empty || rawSection.empty === true);
            merged.set(name, current);
        }
        const sections = [...merged.values()];
        const keywordLines = sections
            .filter((section) => /(关键词|触发词|标签|分类)/u.test(section.name) && !section.empty)
            .flatMap((section) => section.lines);
        return { ...block, sections, keywords: unique(keywordLines) };
    });
}
exports.canonicalSectionName = canonicalSectionName;
exports.mergeCanonicalLines = mergeCanonicalLines;
exports.prepareInformationBlocks = prepareInformationBlocks;
},"governance":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVITY_PACK_TITLE = void 0;
exports.governInformationBlocks = governInformationBlocks;
exports.sceneSettlementOperations = sceneSettlementOperations;
exports.currentEventState = currentEventState;
exports.canTransitionCurrentEvent = canTransitionCurrentEvent;
exports.deriveCurrentGameTime = deriveCurrentGameTime;
exports.activeContext = activeContext;
exports.isGenericBackgroundPerson = isGenericBackgroundPerson;
exports.isFixedSceneRole = isFixedSceneRole;
exports.buildDirectRelationIndex = buildDirectRelationIndex;
const semantic_1 = require("./semantic");
const util_1 = require("./util");

exports.ACTIVITY_PACK_TITLE = '运行包｜当前活动';

const EVENT_TRANSITIONS = Object.freeze({
    active: new Set(['active', 'blocked', 'completed', 'terminated']),
    blocked: new Set(['active', 'blocked', 'completed', 'terminated']),
    completed: new Set(['completed', 'archived']),
    terminated: new Set(['terminated', 'archived']),
    archived: new Set(['archived']),
});

const GENERIC_PERSON_PATTERN = /(?:路人|行人|群众|围观者|学生|同学|顾客|客人|乘客|司机|店员|服务员|工作人员|办事员|职员|管理员|门卫|保安|守卫|士兵|侍卫|仆人|侍者|医生|护士|药师|监考|裁判|主持人|接待员|售货员|收银员|快递员|邻居|居民|村民|市民|男人|女人|男子|女子|青年|老人|小孩|孩子|声音|账号)$/u;
const TEMPORARY_MARKER = /(?:临时|一次性|路过|偶遇|无名|不知名|陌生|普通|随机|现场一名|某个|一位|一名)/u;
const FIXED_SCENE_MARKER = /(?:常驻|固定|长期负责|日常负责|值班|驻守|驻场|本店|本楼|本校|该场景|负责此处|管理此处|看守此处)/u;
const INDEPENDENT_MARKER = /(?:独立目标|持续职责|关键证人|核心线索|长期关系|长期任务|持续影响|独立行动线|必须单独追踪)/u;

function governInformationBlocks(sourceBlocks, entries, contextText = '', options = {}) {
    const blocks = (sourceBlocks ?? []).map((block) => structuredClone(block));
    const diagnostics = { attached: [], filtered: [], promoted: [], warnings: [] };
    const currentScene = blocks.find((block) => block.type === '场景') ?? null;
    const output = [];
    for (const block of blocks) {
        if (!/^(?:人物|角色|NPC)$/u.test(String(block.type ?? ''))) {
            output.push(block);
            continue;
        }
        if (!isGenericBackgroundPerson(block)) {
            output.push(block);
            continue;
        }
        if (revealsExistingIdentity(block, entries, contextText)) {
            diagnostics.promoted.push(block.title);
            output.push(block);
            continue;
        }
        const body = blockText(block);
        const independent = INDEPENDENT_MARKER.test(body)
            || hasIndependentPersonMaterial(block)
            || hasStableProperName(block.name);
        if (independent) {
            diagnostics.promoted.push(block.title);
            output.push(block);
            continue;
        }
        if (currentScene && isFixedSceneRole(block, currentScene, contextText)) {
            attachFixedRole(currentScene, block);
            diagnostics.attached.push({ title: block.title, host: currentScene.title });
            continue;
        }
        diagnostics.filtered.push(block.title);
    }
    return { blocks: output, diagnostics, currentSceneTitle: currentScene?.title ?? '' };
}

function revealsExistingIdentity(block, entries, contextText) {
    const provisional = String(block?.name ?? '').trim();
    const text = String(contextText ?? '');
    if (!provisional || !text.includes(provisional) || !/(?:就是|原来是|身份(?:为|是)|真实身份|摘下伪装|承认身份)/u.test(text)) return false;
    return (entries ?? []).some((entry) => /^(?:人物|角色|NPC)$/u.test(String(entry?.type ?? ''))
        && entry.name && text.includes(String(entry.name)) && !governanceNameIsGeneric(entry.name));
}
function governanceNameIsGeneric(value) {
    const name = String(value ?? '').replace(/(?:甲|乙|丙|丁|A|B|C|D|\d+)$/iu, '');
    return TEMPORARY_MARKER.test(name) || GENERIC_PERSON_PATTERN.test(name);
}

function hasIndependentPersonMaterial(block) {
    const sections = new Map((block.sections ?? []).map((section) => [String(section.name ?? ''), section.lines ?? []]));
    return ['关系', '已知', '误信', '性格核心', '表达方式', '决策倾向']
        .some((name) => (sections.get(name) ?? []).length > 0)
        || (sections.get('当前') ?? []).some((line) => /(?:当前目标|独立目标|持续任务|关键线索|掌握|追查|调查)/u.test(String(line ?? '')));
}

function hasStableProperName(name) {
    const text = String(name ?? '').trim();
    const roleName = text.replace(/(?:甲|乙|丙|丁|A|B|C|D|\d+)$/iu, '');
    if (!text || TEMPORARY_MARKER.test(text) || GENERIC_PERSON_PATTERN.test(roleName)) return false;
    if (/^身份未明/u.test(text)) return true;
    // 中文专名、账号或编号可独立追踪；纯岗位称呼不算专名。
    return text.length >= 2 && !/(?:老师|主任|经理|队长|老板|店长|管理员|工作人员)$/u.test(text);
}

function isGenericBackgroundPerson(block) {
    if (!block) return false;
    const name = String(block.name ?? '').trim();
    const roleName = name.replace(/(?:甲|乙|丙|丁|A|B|C|D|\d+)$/iu, '');
    const body = blockText(block);
    if (/^身份未明/u.test(name)) return false;
    if (TEMPORARY_MARKER.test(name) || TEMPORARY_MARKER.test(body)) return true;
    return GENERIC_PERSON_PATTERN.test(roleName);
}


function isFixedSceneRole(block, currentScene, _contextText = '') {
    if (!block || !currentScene) return false;
    const body = blockText(block);
    const sceneName = String(currentScene.name ?? '').trim();
    if (FIXED_SCENE_MARKER.test(body)) return true;
    if (sceneName && body.includes(sceneName) && /(?:负责|管理|值班|驻守|工作|看守|经营)/u.test(body)) return true;
    return false;
}

function attachFixedRole(sceneBlock, personBlock) {
    const section = ensureSection(sceneBlock, '常驻角色');
    const identity = firstUsefulLine(personBlock, ['身份', '稳定', '当前']) || '固定承担本场景岗位职责。';
    const line = `${personBlock.name}：${stripSlot(identity)}`;
    section.lines = (0, util_1.unique)([...(section.lines ?? []), line]);
    section.empty = false;
}

function firstUsefulLine(block, names) {
    for (const name of names) {
        const section = (block.sections ?? []).find((item) => String(item.name ?? '') === name);
        const line = (section?.lines ?? []).find((item) => String(item ?? '').trim());
        if (line) return String(line).trim();
    }
    return '';
}
function stripSlot(value) {
    return String(value ?? '').replace(/^\s*[^：:]{1,24}\s*[：:]\s*/u, '').trim();
}
function ensureSection(block, name) {
    let section = (block.sections ?? []).find((item) => String(item.name ?? '') === name);
    if (!section) {
        section = { name, lines: [], empty: true };
        block.sections ??= [];
        block.sections.push(section);
    }
    return section;
}
function blockText(block) {
    return [block?.name, ...(block?.sections ?? []).flatMap((section) => section.lines ?? [])].filter(Boolean).join('\n');
}

function currentEventState(value) {
    if (!value) return 'active';
    if ((0, semantic_1.isEventClosed)(value)) return 'completed';
    const text = eventText(value);
    if (/(?:终止|取消|放弃|失败结束|不再进行)/u.test(text)) return 'terminated';
    if (/(?:受阻|暂停|卡住|无法推进|等待条件)/u.test(text)) return 'blocked';
    return 'active';
}
function canTransitionCurrentEvent(from, to) {
    const source = String(from || 'active');
    const target = String(to || 'active');
    return EVENT_TRANSITIONS[source]?.has(target) === true;
}
function eventText(value) {
    if (Array.isArray(value?.sections)) return value.sections.flatMap((section) => section.lines ?? []).join('\n');
    return Object.values(value?.sections?.values ?? {}).flat().join('\n');
}

function sceneSettlementOperations(blocks, entries) {
    const currentSceneBlock = (blocks ?? []).find((block) => block.type === '场景');
    if (!currentSceneBlock) return [];
    const incomingTitle = (0, util_1.normalizeTitle)(currentSceneBlock.title);
    const previous = previousCurrentScene(entries, incomingTitle);
    if (!previous) return [];
    const operations = [];
    for (const section of ['当前状态', '在场', '当前资源', '活动关联', '世界影响', '局部约束']) {
        const current = previous.sections?.values?.[section] ?? [];
        if (!current.length) continue;
        operations.push({
            id: `scene-settle|${previous.uid}|${section}`,
            kind: 'replace-section',
            operation: 'replace',
            title: previous.title,
            targetUid: previous.uid,
            section,
            oldValue: current.join('\n'),
            newValue: '',
            reason: `离开当前场景“${previous.name}”，结算并清除旧场景的活动快照`,
        });
    }
    return operations;
}
function previousCurrentScene(entries, incomingTitle) {
    const scenes = (entries ?? []).filter((entry) => entry?.managed && /^(?:场景|时空)$/u.test(String(entry.type ?? '')));
    const sorted = [...scenes].sort((left, right) => {
        const a = Number(left?.raw?.extensions?.mirrorAbyssInfoPoint?.sceneLastActiveAt || left.updatedAt || 0);
        const b = Number(right?.raw?.extensions?.mirrorAbyssInfoPoint?.sceneLastActiveAt || right.updatedAt || 0);
        return b - a;
    });
    const current = sorted.find((entry) => String(entry.semanticRole ?? '') === 'scene-current') ?? sorted[0];
    if (!current || (0, util_1.normalizeTitle)(current.title) === incomingTitle) return null;
    return current;
}

function deriveCurrentGameTime(blocks, previous = null) {
    const scene = (blocks ?? []).find((block) => block.type === '场景');
    if (!scene) return previous ? structuredClone(previous) : null;
    const lines = (scene.sections ?? [])
        .filter((section) => /^(?:当前状态|定义)$/u.test(String(section.name ?? '')))
        .flatMap((section) => section.lines ?? []);
    const match = lines.map((line) => String(line ?? '').match(/^\s*(?:当前游戏时间|游戏时间|当前时间|时间|日期|时段)\s*[：:]\s*(.+)$/u)).find(Boolean);
    if (!match) return previous ? structuredClone(previous) : null;
    const label = String(match[1] ?? '').trim();
    if (!label) return previous ? structuredClone(previous) : null;
    return {
        label,
        sceneTitle: scene.title,
        source: /^(?:未知|不明|未说明)$/u.test(label) ? 'unknown' : 'explicit',
    };
}

function activeContext(entries, focusUid = '', preferredSceneTitle = '') {
    const list = (entries ?? []).filter((entry) => entry?.title !== exports.ACTIVITY_PACK_TITLE);
    const scenes = list.filter((entry) => /^(?:场景|时空)$/u.test(String(entry.type ?? '')));
    scenes.sort((left, right) => {
        const a = Number(left?.raw?.extensions?.mirrorAbyssInfoPoint?.sceneLastActiveAt || left.updatedAt || 0);
        const b = Number(right?.raw?.extensions?.mirrorAbyssInfoPoint?.sceneLastActiveAt || right.updatedAt || 0);
        return b - a;
    });
    const preferred = preferredSceneTitle
        ? scenes.find((entry) => (0, util_1.normalizeTitle)(entry.title) === (0, util_1.normalizeTitle)(preferredSceneTitle))
        : null;
    // 当前场景以本轮明确标题或真实 sceneLastActiveAt 排序为准；semanticRole 只是由本函数生成的投影，不能反向决定自身。
    const scene = preferred ?? scenes[0] ?? null;
    const names = new Set();
    for (const line of scene?.sections?.values?.['在场'] ?? []) for (const name of splitNames(line)) names.add(name);
    const openEvents = list.filter((entry) => entry.type === '事件' && !['completed', 'terminated', 'archived'].includes(currentEventState(entry)));
    const activeEvents = selectCurrentEvents(openEvents, scene, names);
    for (const event of activeEvents) for (const line of event.sections?.values?.['参与'] ?? []) for (const name of splitNames(line)) names.add(name);
    const focus = list.find((entry) => String(entry.uid) === String(focusUid || '') || entry.focus === true);
    if (focus && /^(?:人物|角色|NPC)$/u.test(focus.type)) names.add(focus.name);
    const characters = list.filter((entry) => /^(?:人物|角色|NPC)$/u.test(String(entry.type ?? '')) && [...names].some((name) => sameName(entry, name)));
    return { scene, activeEvents, characters, activeNames: names, focus };
}
function selectCurrentEvents(events, scene, presentNames) {
    if (!(events ?? []).length) return [];
    const sceneName = (0, util_1.normalizeFact)(scene?.name ?? '');
    const sceneActivities = new Set((scene?.sections?.values?.['活动关联'] ?? []).map(util_1.normalizeFact));
    const present = new Set([...presentNames].map(util_1.normalizeFact));
    const ranked = events.map((entry) => {
        const text = (0, util_1.normalizeFact)(`${entry.name}
${eventText(entry)}`);
        let relationScore = 0;
        if (sceneName && text.includes(sceneName)) relationScore += 8;
        if ([...sceneActivities].some((name) => name && ((0, util_1.normalizeFact)(entry.name).includes(name) || name.includes((0, util_1.normalizeFact)(entry.name))))) relationScore += 10;
        for (const name of (entry.sections?.values?.['参与'] ?? []).flatMap(splitNames).map(util_1.normalizeFact)) if (present.has(name)) relationScore += 3;
        return { entry, relationScore, updatedAt: Number(entry.updatedAt || 0) };
    }).sort((left, right) => right.relationScore - left.relationScore || right.updatedAt - left.updatedAt || left.entry.title.localeCompare(right.entry.title, 'zh-CN'));
    if (ranked[0]?.relationScore > 0) return [ranked[0].entry];
    // 当前世界只有一个未结束事件时，它就是可接受的当前事件；多个无关联事件不猜测。
    return ranked.length === 1 ? [ranked[0].entry] : [];
}
function splitNames(value) {
    return String(value ?? '').replace(/^\s*[^：:]{1,24}\s*[：:]\s*/u, '').split(/[、,，/与和及]/u).map((item) => item.trim()).filter((item) => item && !/^(?:无|无人)$/u.test(item));
}
function sameName(entry, name) {
    const target = (0, util_1.normalizeFact)(name);
    return [entry.name, ...(entry.aliases ?? []), ...(entry.keywords ?? [])].some((value) => (0, util_1.normalizeFact)(value) === target);
}

// [MA-RELATION-01] 直接关联只从结构化栏目推导，并可随世界书重建；不建立独立图数据库。
function buildDirectRelationIndex(entries) {
    const list = (entries ?? []).filter((entry) => entry && entry.title !== exports.ACTIVITY_PACK_TITLE);
    const index = new Map(list.map((entry) => [String(entry.uid), new Set()]));
    const terms = list.map((entry) => ({
        entry,
        terms: (0, util_1.unique)([entry.name, ...(entry.aliases ?? [])])
            .map(util_1.normalizeFact)
            .filter((value) => value && value.length >= 2),
    }));
    for (const source of list) {
        const sourceUid = String(source.uid);
        const text = (0, util_1.normalizeFact)(relationText(source));
        if (!text) continue;
        for (const candidate of terms) {
            const targetUid = String(candidate.entry.uid);
            if (!sourceUid || sourceUid === targetUid) continue;
            if (!candidate.terms.some((term) => text.includes(term))) continue;
            index.get(sourceUid)?.add(targetUid);
            index.get(targetUid)?.add(sourceUid);
        }
    }
    return new Map([...index.entries()].map(([uid, related]) => [uid, new Set([...related].slice(0, 16))]));
}
function relationText(entry) {
    const sections = entry?.sections?.values ?? {};
    const selected = /^(?:人物|角色|NPC)$/u.test(String(entry?.type ?? ''))
        ? ['关系', '关系立场', '当前', '持有', '已知', '误信']
        : /^(?:场景|时空)$/u.test(String(entry?.type ?? ''))
            ? ['在场', '当前资源', '活动关联']
            : entry?.type === '事件'
                ? ['参与', '场景', '已发生进展', '结果']
                : entry?.type === '物品'
                    ? ['当前', '固定事实']
                    : [];
    return selected.flatMap((section) => sections[section] ?? []).join('\n');
}
},"host":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HostAdapter = void 0;
const constants_1 = require("./constants");
const util_1 = require("./util");
class HostAdapter {
    constructor() {
        this.runtimeSessionId = randomId();
        this.scopeRevisions = new Map();
        this.internalMessageMutations = new Map();
    }
    context() {
        const context = globalThis.SillyTavern?.getContext?.();
        if (!context) throw new Error('SillyTavern 上下文尚未就绪');
        return context;
    }
    chatKey() {
        const context = this.context();
        const chatId = context.getCurrentChatId?.() ?? context.chatId ?? context.chat_metadata?.chat_id;
        if (chatId === null || chatId === undefined || String(chatId) === '') return '';
        const scope = context.groupId !== null && context.groupId !== undefined
            ? `group:${context.groupId}`
            : `character:${context.characterId ?? context.name2 ?? 'unknown'}`;
        return `${scope}:${(0, util_1.hashText)(`${scope}|${chatId}`)}`;
    }
    roleKey() {
        const context = this.context();
        return context.groupId !== null && context.groupId !== undefined
            ? `group:${context.groupId}`
            : `character:${context.characterId ?? context.name2 ?? 'unknown'}`;
    }
    targetWorldbookName(settings) {
        const context = this.context();
        const assigned = String(settings.targetLorebook || context.chatMetadata?.world_info || context.chat_metadata?.world_info || '').trim();
        if (assigned || !settings.autoCreateLorebook) return assigned;
        const display = (0, util_1.safeId)(context.name2 || context.name1 || 'Chat') || 'Chat';
        return `MA_${display}`;
    }
    settingsSignature(settings) {
        return (0, util_1.hashText)(JSON.stringify({
            modelSource: settings.modelSource,
            modelProfileId: settings.modelProfileId,
            auditProfileId: settings.auditProfileId,
            revisionProfileId: settings.revisionProfileId,
            extractionProfileId: settings.extractionProfileId,
            smallSummaryProfileId: settings.smallSummaryProfileId,
            largeSummaryProfileId: settings.largeSummaryProfileId,
            migrationProfileId: settings.migrationProfileId,
            responseTokens: settings.responseTokens,
            requestTimeoutMs: settings.requestTimeoutMs,
            targetLorebook: settings.targetLorebook,
            auditEnabled: settings.auditEnabled,
            extractionEnabled: settings.extractionEnabled,
            auditPrompt: settings.auditPrompt,
            revisionPrompt: settings.revisionPrompt,
            extractionPrompt: settings.extractionPrompt,
            smallSummaryPrompt: settings.smallSummaryPrompt,
            largeSummaryPrompt: settings.largeSummaryPrompt,
            smallSummaryTurns: settings.smallSummaryTurns,
            largeSummaryCount: settings.largeSummaryCount,
            activityPackEnabled: settings.activityPackEnabled,
            activityPackHardMax: settings.activityPackHardMax,
            entryBudgetEnabled: settings.entryBudgetEnabled,
            keywordDefinitions: settings.keywordDefinitions,
            sectionPolicies: settings.sectionPolicies,
            bodyMatchThreshold: settings.bodyMatchThreshold,
            matchWeights: settings.matchWeights,
            connectionState: this.connectionStateSignature(settings),
        }));
    }
    connectionStateSignature(settings) {
        const context = this.context();
        const ids = (0, util_1.unique)([
            settings.auditProfileId,
            settings.revisionProfileId,
            settings.extractionProfileId,
            settings.smallSummaryProfileId,
            settings.largeSummaryProfileId,
            settings.migrationProfileId,
        ]);
        const service = context.ConnectionManagerRequestService;
        const profiles = ids.map((id) => {
            try { return [id, sanitizeConnectionValue(service?.getProfile?.(id))]; }
            catch { return [id, null]; }
        });
        return {
            mainApi: String(context.mainApi ?? context.main_api ?? ''),
            chatCompletionSource: String(context.chatCompletionSettings?.source ?? context.chat_completion_source ?? ''),
            chatCompletionModel: String(context.chatCompletionSettings?.model ?? context.chat_completion_model ?? ''),
            textGenerationType: String(context.textgenerationwebui_settings?.type ?? ''),
            profiles,
        };
    }
    bumpScopeRevision(chatKey = this.chatKey()) {
        if (!chatKey) return 0;
        const next = (this.scopeRevisions.get(chatKey) ?? 0) + 1;
        this.scopeRevisions.set(chatKey, next);
        return next;
    }
    scopeRevision(chatKey = this.chatKey()) { return this.scopeRevisions.get(chatKey) ?? 0; }
    captureSnapshot(settings, requestedIndex, taskType, token) {
        const turn = this.latestTurn(requestedIndex);
        const context = this.context();
        return {
            ...turn,
            runtimeSessionId: this.runtimeSessionId,
            chatInstance: context.chat,
            roleKey: this.roleKey(),
            scopeRevision: this.scopeRevision(turn.chatKey),
            worldbookName: this.targetWorldbookName(settings),
            settingsSignature: this.settingsSignature(settings),
            taskId: randomId(),
            taskType,
            // [MA-QUEUE-03] 提取、总结和完整后台流程固定到源正文；后续新正文只会排队，不使该源正文任务失效。
            allowNewerTurns: ['extraction', 'smallSummary', 'largeSummary', 'full'].includes(String(taskType ?? '')),
            token,
        };
    }
    captureMaintenanceSnapshot(settings, taskType, token) {
        const context = this.context();
        const chatKey = this.chatKey();
        if (!chatKey)
            throw new Error('当前没有活动聊天');
        return {
            maintenance: true,
            chatKey,
            messageIndex: -1,
            messageKey: `maintenance:${taskType}`,
            assistantText: '',
            playerText: '',
            turnText: '',
            dialogueContext: '',
            dialogueHash: '',
            contentHash: '',
            runtimeSessionId: this.runtimeSessionId,
            chatInstance: context.chat,
            roleKey: this.roleKey(),
            scopeRevision: this.scopeRevision(chatKey),
            worldbookName: this.targetWorldbookName(settings),
            settingsSignature: this.settingsSignature(settings),
            taskId: randomId(),
            taskType,
            token,
        };
    }
    assertSnapshot(snapshot, currentSettings) {
        if (!snapshot) throw new Error('任务快照不存在');
        if (snapshot.token?.cancelled) throw new Error(snapshot.token.reason || '任务已取消');
        if (snapshot.runtimeSessionId !== this.runtimeSessionId) throw new Error('运行会话已经变化，旧任务作废');
        if (this.chatKey() !== snapshot.chatKey) throw new Error('聊天已经切换，旧任务作废');
        const context = this.context();
        if (context.chat !== snapshot.chatInstance && snapshot.allowNewerTurns !== true) throw new Error('聊天实例已经变化，旧任务作废');
        if (this.roleKey() !== snapshot.roleKey) throw new Error('当前角色或群组已经变化，旧任务作废');
        if (this.scopeRevision(snapshot.chatKey) !== snapshot.scopeRevision) throw new Error('聊天作用域版本已经变化，旧任务作废');
        let turn = snapshot;
        if (!snapshot.maintenance) {
            turn = snapshot.allowNewerTurns === true
                ? this.latestTurn(snapshot.messageIndex)
                : this.latestTurn();
            if (snapshot.allowNewerTurns !== true && turn.messageIndex !== snapshot.messageIndex)
                throw new Error('当前最新 AI 正文已经变化，旧任务作废');
            if (turn.messageKey !== snapshot.messageKey || turn.contentHash !== snapshot.contentHash) throw new Error('源正文版本已经变化，旧任务作废');
            if (turn.playerText !== snapshot.playerText)
                throw new Error('与源正文直接相关的玩家输入已经变化，旧任务作废');
            if (String(turn.dialogueHash ?? '') !== String(snapshot.dialogueHash ?? ''))
                throw new Error('源对话上下文已经变化，旧任务作废');
        }
        if (currentSettings) {
            if (this.targetWorldbookName(currentSettings) !== snapshot.worldbookName) throw new Error('目标世界书已经变化，旧任务作废');
            if (this.settingsSignature(currentSettings) !== snapshot.settingsSignature) throw new Error('模型或任务设置已经变化，旧任务作废');
        }
        return turn;
    }
    refreshSnapshot(snapshot, turn, currentSettings) {
        return {
            ...snapshot,
            ...turn,
            chatInstance: this.context().chat,
            roleKey: this.roleKey(),
            worldbookName: this.targetWorldbookName(currentSettings),
            settingsSignature: this.settingsSignature(currentSettings),
            scopeRevision: this.scopeRevision(turn.chatKey),
        };
    }
    subscribe(eventName, handler, required = false) {
        const context = this.context();
        const events = context.eventTypes ?? context.event_types ?? {};
        const event = events[eventName];
        if (!event) {
            if (required) throw new Error(`SillyTavern 未提供事件 ${eventName}`);
            return () => undefined;
        }
        context.eventSource.on(event, handler);
        return () => {
            if (typeof context.eventSource.off === 'function') context.eventSource.off(event, handler);
            else context.eventSource.removeListener?.(event, handler);
        };
    }
    consumeInternalScopeEvent(eventName, eventValue) {
        if (eventName !== 'MESSAGE_EDITED' || !this.internalMessageMutations.size)
            return false;
        const chat = this.context().chat ?? [];
        const eventIndex = messageIndexFromEvent(eventValue);
        const currentChatFingerprint = Number.isInteger(eventIndex) ? '' : chatFingerprint(chat);
        const candidates = Number.isInteger(eventIndex)
            ? [[eventIndex, this.internalMessageMutations.get(eventIndex)]]
            : [...this.internalMessageMutations.entries()];
        for (const [index, expected] of candidates) {
            if (!expected)
                continue;
            if (Date.now() > expected.expiresAt) {
                this.clearInternalMessageMutation(index, expected);
                continue;
            }
            const message = chat[index];
            const matches = readMessageKey(message) === expected.messageKey
                && (0, util_1.hashText)(String(message?.mes ?? '')) === expected.contentHash
                && (Number.isInteger(eventIndex) || expected.chatFingerprint === currentChatFingerprint);
            if (matches)
                return true;
            this.clearInternalMessageMutation(index, expected);
        }
        return false;
    }
    clearInternalMessageMutations() {
        for (const [index, expected] of this.internalMessageMutations.entries())
            this.clearInternalMessageMutation(index, expected);
    }
    latestTurn(requestedIndex) {
        const chatKey = this.chatKey();
        if (!chatKey) throw new Error('当前没有活动聊天');
        const chat = this.context().chat ?? [];
        const messageIndex = Number.isInteger(requestedIndex) ? Number(requestedIndex) : findLatestAssistant(chat);
        if (messageIndex < 0 || !isAssistant(chat[messageIndex])) throw new Error('当前聊天没有可处理的 AI 正文');
        const message = chat[messageIndex];
        const assistantText = String(message.mes ?? '');
        const messageKey = this.ensureMessageKey(messageIndex, message);
        const playerInfo = previousPlayerMessage(chat, messageIndex);
        const playerText = playerInfo.text;
        const dialogueContext = dialogueContextBeforeTurn(chat, playerInfo.index, 4);
        const turnText = formatDialogueTurn(playerText, assistantText);
        return {
            chatKey,
            messageIndex,
            messageKey,
            assistantText,
            playerText,
            playerMessageIndex: playerInfo.index,
            turnText,
            dialogueContext,
            dialogueHash: (0, util_1.hashText)(`${dialogueContext}\n---TARGET---\n${turnText}`),
            characterCard: characterCardText(this.context()),
            contentHash: (0, util_1.hashText)(assistantText),
        };
    }
    isAssistantIndex(index) { return isAssistant((this.context().chat ?? [])[index]); }
    assistantIndexByMessageKey(messageKey) {
        const target = String(messageKey ?? '');
        if (!target) return -1;
        const chat = this.context().chat ?? [];
        for (let index = 0; index < chat.length; index += 1) {
            if (isAssistant(chat[index]) && readMessageKey(chat[index]) === target) return index;
        }
        return -1;
    }
    recentConversation(snapshot, turnCount) {
        this.assertSnapshot(snapshot);
        const chat = this.context().chat ?? [];
        const end = snapshot.messageIndex >= 0 ? snapshot.messageIndex : chat.length - 1;
        const limit = Math.max(1, Number(turnCount) || 1) * 2;
        const selected = [];
        for (let index = end; index >= 0 && selected.length < limit; index -= 1) {
            const message = chat[index];
            if (!message || message.is_system || typeof message.mes !== 'string' || !message.mes.trim())
                continue;
            selected.push(`${message.is_user ? '玩家' : 'AI'}：${message.mes.trim()}`);
        }
        return selected.reverse().join('\n\n');
    }
    /** [MA-HOST-03] 宿主模型调用原语；重试和阶段预算由 model-request.js 负责。 */
    async generate(systemPrompt, prompt, responseLength, snapshot, currentSettings, timeoutMs, profileId = '') {
        this.assertSnapshot(snapshot, currentSettings);
        const context = this.context();
        let request;
        try {
            if (profileId) {
                const service = context.ConnectionManagerRequestService;
                if (!service) throw new Error('Connection Profile 服务不可用');
                request = service.sendRequest(profileId, [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt },
                ], responseLength, { stream: false, extractData: true, includePreset: true });
            } else {
                const generateRaw = context.generateRaw;
                if (typeof generateRaw !== 'function') throw new Error('当前 SillyTavern 未提供 generateRaw');
                request = generateRaw({ systemPrompt, prompt, responseLength });
            }
        } catch (error) {
            throw new Error(`模型请求启动失败：${(0, util_1.errorText)(error)}`);
        }
        let raw;
        try {
            raw = await withTimeout(request, timeoutMs, () => {
                if (snapshot.token) {
                    snapshot.token.cancelled = true;
                    snapshot.token.reason = `模型调用超时（${timeoutMs}ms）`;
                }
            });
        } catch (error) {
            if (snapshot.token?.cancelled) throw new Error(snapshot.token.reason || '任务已取消');
            throw new Error(`模型请求失败：${(0, util_1.errorText)(error)}`);
        }
        this.assertSnapshot(snapshot, currentSettings);
        const text = extractModelText(raw).trim();
        if (!text) throw new Error('模型返回为空或没有文本内容');
        if (looksLikeHtml(text)) throw new Error('模型返回了 HTML 错误页');
        return text;
    }
    connectionProfilesAvailable() {
        const context = this.context();
        return Boolean(context.ConnectionManagerRequestService)
            && !context.extensionSettings?.disabledExtensions?.includes?.('connection-manager');
    }
    profileName(profileId) {
        if (!profileId) return '当前连接';
        try { return this.context().ConnectionManagerRequestService?.getProfile(profileId)?.name || profileId; }
        catch { return profileId; }
    }
    /**
     * [MA-HOST-API-01] 把 UI 下拉框交给 SillyTavern 官方 ConnectionManagerRequestService 填充和维护。
     * 插件不读取、不保存 API Key；回调只返回官方 profile 对象。
     */
    bindProfileDropdown(selector, selectedId, onChange) {
        const service = this.context().ConnectionManagerRequestService;
        if (!service?.handleDropdown) return false;
        service.handleDropdown(
            selector,
            selectedId,
            (profile) => onChange(profile || null),
            undefined,
            undefined,
            (profile) => { if (profile?.id === selectedId) onChange(null); },
        );
        return true;
    }
    /**
     * [MA-HOST-01] 正文替换的唯一写入口。
     * 顺序固定为：校验旧版本 → 修改 mes/当前 swipe → 清除 display_text → 刷新 UI → 保存聊天 → 回读校验。
     */
    async replaceAssistantText(snapshot, text, currentSettings) {
        this.assertSnapshot(snapshot, currentSettings);
        const context = this.context();
        const chat = context.chat ?? [];
        const message = chat[snapshot.messageIndex];
        if (!isAssistant(message)) throw new Error('待修正正文已经不存在');
        if (readMessageKey(message) !== snapshot.messageKey || (0, util_1.hashText)(String(message.mes ?? '')) !== snapshot.contentHash)
            throw new Error('正文已经变化，拒绝覆盖旧版本');
        const nextText = String(text ?? '').trim();
        const originalText = String(message.mes ?? '');
        if (!nextText) throw new Error('修正版正文为空，拒绝替换');
        if ((0, util_1.normalizeFact)(nextText) === (0, util_1.normalizeFact)(originalText))
            throw new Error('修正版与原正文没有实质变化，未执行替换');
        const swipeIndex = Array.isArray(message.swipes) && Number.isInteger(message.swipe_id) && Number(message.swipe_id) >= 0
            ? Number(message.swipe_id)
            : -1;
        const originalSwipe = swipeIndex >= 0 ? message.swipes[swipeIndex] : undefined;
        const extra = message.extra && typeof message.extra === 'object' ? message.extra : null;
        const hadDisplayText = Boolean(extra && Object.prototype.hasOwnProperty.call(extra, 'display_text'));
        const originalDisplayText = hadDisplayText ? extra.display_text : undefined;
        try {
            message.mes = nextText;
            if (swipeIndex >= 0) message.swipes[swipeIndex] = nextText;
            if (extra && hadDisplayText) delete extra.display_text;
            this.updateMessageBlock(snapshot.messageIndex, message);
            await this.saveChat();
            await Promise.resolve();
            const persisted = this.verifyAssistantReplacement(snapshot.messageIndex, nextText, swipeIndex);
            this.updateMessageBlock(snapshot.messageIndex, persisted);
        }
        catch (error) {
            message.mes = originalText;
            if (swipeIndex >= 0) message.swipes[swipeIndex] = originalSwipe;
            if (extra && hadDisplayText) extra.display_text = originalDisplayText;
            try { this.updateMessageBlock(snapshot.messageIndex, message); }
            catch { }
            throw new Error(`修正版正文保存失败，已恢复原正文：${(0, util_1.errorText)(error)}`);
        }
        const turn = this.latestTurn(snapshot.messageIndex);
        return {
            ...this.refreshSnapshot(snapshot, turn, currentSettings),
            auditReplacementVerified: true,
            auditReplacementDetail: `消息${snapshot.messageIndex}正文、当前 swipe 与显示缓存已同步`,
        };
    }

    /** [MA-HOST-02] 保存完成后的单点回读校验，不负责写入。 */
    verifyAssistantReplacement(messageIndex, expectedText, swipeIndex = -1) {
        const persisted = this.context().chat?.[messageIndex];
        if (!persisted || String(persisted.mes ?? '') !== expectedText)
            throw new Error('聊天正文回读校验未通过');
        if (swipeIndex >= 0 && String(persisted.swipes?.[swipeIndex] ?? '') !== expectedText)
            throw new Error('当前 swipe 回读校验未通过');
        if (persisted.extra && Object.prototype.hasOwnProperty.call(persisted.extra, 'display_text'))
            throw new Error('旧 display_text 仍存在，可能遮挡修正版正文');
        return persisted;
    }
    cursor() {
        const root = this.chatNamespace();
        const value = root.cursor && typeof root.cursor === 'object' ? root.cursor : {};
        return {
            lastProcessedMessageKey: String(value.lastProcessedMessageKey ?? ''),
            lastProcessedHash: String(value.lastProcessedHash ?? ''),
            turnsSinceSmall: Math.max(0, Number(value.turnsSinceSmall) || 0),
            criticalChangesSinceSmall: Math.max(0, Number(value.criticalChangesSinceSmall) || 0),
            smallCountSinceLarge: Math.max(0, Number(value.smallCountSinceLarge) || 0),
        };
    }
    async saveCursor(cursor, snapshot, currentSettings) {
        if (snapshot) this.assertSnapshot(snapshot, currentSettings);
        const root = this.chatNamespace();
        const hadCursor = Object.prototype.hasOwnProperty.call(root, 'cursor');
        const previous = hadCursor ? structuredClone(root.cursor) : undefined;
        root.cursor = structuredClone(cursor);
        try {
            await this.saveMetadata();
            if (snapshot) this.assertSnapshot(snapshot, currentSettings);
        }
        catch (error) {
            if (hadCursor)
                root.cursor = previous;
            else
                delete root.cursor;
            throw error;
        }
    }
    getCurrentGameTime() {
        const value = this.chatNamespace().currentGameTime;
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const label = String(value.label ?? '').trim();
        if (!label) return null;
        return { label, sceneTitle: String(value.sceneTitle ?? ''), source: String(value.source ?? 'explicit') };
    }
    async setCurrentGameTime(value, snapshot, currentSettings) {
        const next = value && typeof value === 'object' && String(value.label ?? '').trim()
            ? { label: String(value.label).trim(), sceneTitle: String(value.sceneTitle ?? ''), source: String(value.source ?? 'explicit') }
            : null;
        const previous = this.getCurrentGameTime();
        if (JSON.stringify(previous) === JSON.stringify(next)) return false;
        if (snapshot) this.assertSnapshot(snapshot, currentSettings);
        const root = this.chatNamespace();
        if (next) root.currentGameTime = structuredClone(next);
        else delete root.currentGameTime;
        try {
            await this.saveMetadata();
            if (snapshot) this.assertSnapshot(snapshot, currentSettings);
            return true;
        }
        catch (error) {
            if (previous) root.currentGameTime = previous;
            else delete root.currentGameTime;
            throw error;
        }
    }
    getCommitReceipts() {
        const receipts = this.chatNamespace().commitReceipts;
        return Array.isArray(receipts) ? structuredClone(receipts) : [];
    }
    async appendCommitReceipt(receipt, limit = 0) {
        if (!receipt || typeof receipt !== 'object' || !Array.isArray(receipt.changes) || !receipt.changes.length) return false;
        const root = this.chatNamespace();
        const previous = Array.isArray(root.commitReceipts) ? structuredClone(root.commitReceipts) : [];
        const merged = [...previous.filter((item) => item?.id !== receipt.id), structuredClone(receipt)];
        const numericLimit = Math.max(0, Number(limit) || 0);
        const next = numericLimit > 0 ? merged.slice(-numericLimit) : merged;
        root.commitReceipts = next;
        try { await this.saveMetadata(); return true; }
        catch (error) {
            if (previous.length) root.commitReceipts = previous;
            else delete root.commitReceipts;
            throw error;
        }
    }
    async removeCommitReceipts(ids = []) {
        const targets = new Set((Array.isArray(ids) ? ids : [ids]).map((value) => String(value ?? '')).filter(Boolean));
        if (!targets.size) return false;
        const root = this.chatNamespace();
        const previous = Array.isArray(root.commitReceipts) ? structuredClone(root.commitReceipts) : [];
        const next = previous.filter((item) => !targets.has(String(item?.id ?? '')));
        if (next.length === previous.length) return false;
        if (next.length) root.commitReceipts = next;
        else delete root.commitReceipts;
        try { await this.saveMetadata(); return true; }
        catch (error) {
            if (previous.length) root.commitReceipts = previous;
            else delete root.commitReceipts;
            throw error;
        }
    }
    getFocusUid() { return String(this.chatNamespace().focusUid ?? '').trim(); }
    async setFocusUid(uid) {
        const root = this.chatNamespace();
        const hadUid = Object.prototype.hasOwnProperty.call(root, 'focusUid');
        const hadTitle = Object.prototype.hasOwnProperty.call(root, 'focusTitle');
        const previousUid = root.focusUid;
        const previousTitle = root.focusTitle;
        root.focusUid = String(uid ?? '').trim();
        delete root.focusTitle;
        try {
            await this.saveMetadata();
        }
        catch (error) {
            if (hadUid)
                root.focusUid = previousUid;
            else
                delete root.focusUid;
            if (hadTitle)
                root.focusTitle = previousTitle;
            else
                delete root.focusTitle;
            throw error;
        }
    }
    getFocusTitle() { return String(this.chatNamespace().focusTitle ?? '').trim(); }
    async setFocusTitle(title) {
        const root = this.chatNamespace();
        const hadTitle = Object.prototype.hasOwnProperty.call(root, 'focusTitle');
        const previousTitle = root.focusTitle;
        root.focusTitle = String(title ?? '').trim();
        try {
            await this.saveMetadata();
        }
        catch (error) {
            if (hadTitle)
                root.focusTitle = previousTitle;
            else
                delete root.focusTitle;
            throw error;
        }
    }
    async saveMetadata() {
        const context = this.context();
        if (typeof context.saveMetadata === 'function') await context.saveMetadata();
        else context.saveMetadataDebounced?.();
    }
    async saveChat() {
        const context = this.context();
        if (typeof context.saveChat === 'function') return context.saveChat();
        if (typeof context.saveChatConditional === 'function') return context.saveChatConditional();
        throw new Error('SillyTavern 未提供聊天保存接口');
    }
    diagnostics() {
        let context = null;
        try { context = this.context(); }
        catch (error) { return { version: 1, error: (0, util_1.errorText)(error) }; }
        const events = context.eventTypes ?? context.event_types ?? {};
        return {
            chatKey: this.chatKey(),
            generateRaw: typeof context.generateRaw === 'function',
            connectionProfiles: Boolean(context.ConnectionManagerRequestService),
            saveChat: typeof context.saveChat === 'function' || typeof context.saveChatConditional === 'function',
            saveMetadata: typeof context.saveMetadata === 'function' || typeof context.saveMetadataDebounced === 'function',
            events: Object.keys(events).filter((key) => /CHAT|MESSAGE|APP_READY/u.test(key)).sort(),
            assignedWorldbook: String(context.chatMetadata?.world_info ?? ''),
        };
    }
    ensureMessageKey(index, message) {
        const existing = readMessageKey(message);
        if (existing) return existing;
        const generated = this.context().uuidv4?.() ?? randomId();
        const extra = (message.extra ?? (message.extra = {}));
        extra[constants_1.EXTENSION_NAMESPACE] = { ...(extra[constants_1.EXTENSION_NAMESPACE] ?? {}), messageKey: generated };
        this.updateMessageBlock(index, message);
        void this.saveChat();
        return generated;
    }
    updateMessageBlock(index, message) {
        const previous = this.internalMessageMutations.get(index);
        if (previous)
            this.clearInternalMessageMutation(index, previous);
        const expected = {
            messageKey: readMessageKey(message),
            contentHash: (0, util_1.hashText)(String(message?.mes ?? '')),
            chatFingerprint: chatFingerprint(this.context().chat ?? []),
            expiresAt: Date.now() + 2000,
            timer: undefined,
        };
        expected.timer = globalThis.setTimeout(() => this.clearInternalMessageMutation(index, expected), 2000);
        expected.timer?.unref?.();
        this.internalMessageMutations.set(index, expected);
        const update = this.context().updateMessageBlock;
        if (typeof update !== 'function') throw new Error('SillyTavern 未提供正文刷新接口 updateMessageBlock');
        update(index, message);
    }
    clearInternalMessageMutation(index, expected) {
        if (this.internalMessageMutations.get(index) !== expected)
            return;
        this.internalMessageMutations.delete(index);
        if (expected.timer)
            globalThis.clearTimeout(expected.timer);
    }
    chatNamespace() {
        const metadata = (this.context().chatMetadata ?? (this.context().chatMetadata = {}));
        const current = metadata[constants_1.EXTENSION_NAMESPACE];
        if (!current || typeof current !== 'object' || Array.isArray(current)) metadata[constants_1.EXTENSION_NAMESPACE] = {};
        return metadata[constants_1.EXTENSION_NAMESPACE];
    }
}
exports.HostAdapter = HostAdapter;
function readMessageKey(message) {
    const value = message?.extra?.[constants_1.EXTENSION_NAMESPACE];
    return value && typeof value === 'object' ? String(value.messageKey ?? '') : '';
}
function characterCardText(context) {
    const character = context?.characters?.[context.characterId] ?? context?.character ?? null;
    if (!character || typeof character !== 'object') return '';
    return [
        character.name ? `名称：${character.name}` : '',
        character.description ? `描述：${character.description}` : '',
        character.personality ? `性格：${character.personality}` : '',
        character.scenario ? `场景：${character.scenario}` : '',
        character.system_prompt ? `系统规则：${character.system_prompt}` : '',
    ].filter(Boolean).join('\n\n');
}
function isAssistant(message) { return Boolean(message && !message.is_user && !message.is_system && typeof message.mes === 'string' && message.mes.trim()); }
function findLatestAssistant(chat) { for (let index = chat.length - 1; index >= 0; index -= 1) if (isAssistant(chat[index])) return index; return -1; }
function previousPlayerMessage(chat, before) {
    for (let index = before - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (message?.is_user && !message.is_system && typeof message.mes === 'string') {
            return { index, text: String(message.mes ?? '') };
        }
    }
    return { index: -1, text: '' };
}
function previousPlayerText(chat, before) { return previousPlayerMessage(chat, before).text; }
function dialogueContextBeforeTurn(chat, playerIndex, maxMessages = 4) {
    if (!Number.isInteger(playerIndex) || playerIndex <= 0) return '';
    const selected = [];
    for (let index = playerIndex - 1; index >= 0 && selected.length < Math.max(0, Number(maxMessages) || 0); index -= 1) {
        const message = chat[index];
        if (!message || message.is_system || typeof message.mes !== 'string' || !message.mes.trim()) continue;
        selected.push(`${message.is_user ? '玩家' : 'AI'}：${message.mes.trim()}`);
    }
    return selected.reverse().join('\n\n');
}
function formatDialogueTurn(playerText, assistantText) {
    return `玩家：${String(playerText || '（空）').trim() || '（空）'}\n\nAI：${String(assistantText || '').trim()}`;
}
function messageIndexFromEvent(value) {
    if (Number.isInteger(value))
        return value;
    if (value && typeof value === 'object') {
        for (const candidate of [value.messageIndex, value.messageId, value.index, value.id]) {
            const number = Number(candidate);
            if (Number.isInteger(number))
                return number;
        }
    }
    const number = Number(value);
    return Number.isInteger(number) ? number : undefined;
}
function chatFingerprint(chat) {
    return (0, util_1.hashText)(JSON.stringify(chat.map((message) => ({
        user: message?.is_user === true,
        system: message?.is_system === true,
        text: String(message?.mes ?? ''),
        key: readMessageKey(message),
        swipe: Number.isInteger(message?.swipe_id) ? Number(message.swipe_id) : null,
    }))));
}
function withTimeout(promise, timeoutMs, onTimeout) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = globalThis.setTimeout(() => {
            onTimeout?.();
            reject(new Error(`模型调用超时（${timeoutMs}ms）`));
        }, timeoutMs);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => globalThis.clearTimeout(timer));
}
function extractModelText(raw) {
    if (typeof raw === 'string') return raw;
    if (!raw || typeof raw !== 'object') return '';
    if (typeof raw.content === 'string') return raw.content;
    if (Array.isArray(raw.content)) return raw.content.map((item) => typeof item === 'string' ? item : String(item?.text ?? item?.content ?? '')).join('');
    if (typeof raw.text === 'string') return raw.text;
    if (typeof raw.message?.content === 'string') return raw.message.content;
    if (typeof raw.choices?.[0]?.message?.content === 'string') return raw.choices[0].message.content;
    return '';
}
function looksLikeHtml(text) {
    const value = text.trim().slice(0, 1000).toLocaleLowerCase();
    return /^<!doctype\s+html/u.test(value) || /^<html(?:\s|>)/u.test(value) || (/<body(?:\s|>)/u.test(value) && /<\/body>/u.test(value));
}
function randomId() {
    try { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
    catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
function sanitizeConnectionValue(value, depth = 0) {
    if (value === null || value === undefined)
        return value ?? null;
    if (depth > 5)
        return '[truncated]';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        return value;
    if (Array.isArray(value))
        return value.slice(0, 100).map((item) => sanitizeConnectionValue(item, depth + 1));
    if (typeof value !== 'object')
        return undefined;
    const output = {};
    for (const key of Object.keys(value).sort()) {
        if (/(?:last|timestamp|runtime|status|usage|latency|request)/iu.test(key))
            continue;
        const item = sanitizeConnectionValue(value[key], depth + 1);
        if (item !== undefined)
            output[key] = item;
    }
    return output;
}
},"index":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onActivate = onActivate;
exports.onEnable = onEnable;
exports.onDisable = onDisable;
exports.onDelete = onDelete;
exports.onInstall = onInstall;
exports.onUpdate = onUpdate;
exports.onClean = onClean;
const application_1 = require("./application");
const constants_1 = require("./constants");
let application = null;
let extensionEnabled = true;
let initializing = false;
const STARTUP_ROOT_ID = 'mirror-abyss-startup-control';
let startupDomListener = null;
function mountStartupIndicator() {
    if (typeof document === 'undefined') return;
    if (!document.body) {
        if (!startupDomListener) {
            startupDomListener = () => {
                startupDomListener = null;
                mountStartupIndicator();
            };
            document.addEventListener('DOMContentLoaded', startupDomListener, { once: true });
        }
        return;
    }
    if (document.getElementById(STARTUP_ROOT_ID)) return;
    const root = document.createElement('div');
    root.id = STARTUP_ROOT_ID;
    root.style.cssText = 'position:fixed!important;right:max(10px,env(safe-area-inset-right))!important;top:50dvh!important;transform:translateY(-50%)!important;z-index:2147483640!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;';
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = '<i class="fa-solid fa-circle-nodes" aria-hidden="true"></i>';
    button.setAttribute('aria-label', '启动镜渊');
    button.title = '镜渊正在等待 SillyTavern 完成初始化';
    button.style.cssText = 'display:flex!important;align-items:center!important;justify-content:center!important;width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border:1px solid rgba(255,255,255,.24);border-radius:50%;background:rgba(20,20,24,.96);color:#fff;font-weight:700;font-size:13px;box-shadow:0 3px 12px rgba(0,0,0,.42);touch-action:none;pointer-events:auto!important;cursor:pointer!important;';
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); void initialize(); });
    root.append(button);
    document.body.append(root);
}
function removeStartupIndicator() {
    if (typeof document === 'undefined') return;
    if (startupDomListener) document.removeEventListener('DOMContentLoaded', startupDomListener);
    startupDomListener = null;
    document.getElementById(STARTUP_ROOT_ID)?.remove();
}
function contextReady() { try { return Boolean(globalThis.SillyTavern?.getContext?.()); } catch { return false; } }
async function waitForContext(timeoutMs = 20000) {
    const startedAt = Date.now();
    while (!contextReady()) {
        if (!extensionEnabled) throw new Error('镜渊插件当前已禁用');
        if (Date.now() - startedAt >= timeoutMs) throw new Error('等待 SillyTavern 上下文超时，点击镜渊图标可重试');
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}
async function requireApplication() {
    if (!extensionEnabled) throw new Error('镜渊插件当前已禁用');
    await initialize();
    if (!application?.isStarted()) throw new Error('镜渊尚未完成启动');
    return application;
}
function exposeApi() {
    globalThis.MirrorAbyss = {
        version: constants_1.VERSION,
        processLatest: async () => (await requireApplication()).processLatest(),
        audit: async () => (await requireApplication()).audit(),
        extract: async () => (await requireApplication()).extract(),
        smallSummary: async () => (await requireApplication()).smallSummary(),
        largeSummary: async () => (await requireApplication()).largeSummary(),
        replanRecall: async () => (await requireApplication()).replanRecall(),
        previewWorldbookRebuild: async () => (await requireApplication()).migrate(),
        commitWorldbookRebuild: async () => (await requireApplication()).commitMigration(),
        getWorldbookRebuildPreview: async () => (await requireApplication()).migrationPreview(),
        migrateWorldbook: async () => (await requireApplication()).migrate(),
        undoWorldbookMigration: async () => (await requireApplication()).undoMigration(),
        previewWorldSettings: async (text) => (await requireApplication()).previewWorldSettings(text),
        commitWorldSettings: async (text) => (await requireApplication()).commitWorldSettings(text),
        getWorldSettingsPreview: async () => (await requireApplication()).worldSettingsPreview(),
        clearWorldSettingsPreview: async () => (await requireApplication()).clearWorldSettingsPreview(),
        cancel: async () => (await requireApplication()).cancel(),
        getSettings: async () => (await requireApplication()).settings(),
        configure: async (patch) => (await requireApplication()).configure(patch),
        status: async () => (await requireApplication()).status(),
        restart: async () => { shutdown(false); extensionEnabled = true; await initialize(); },
    };
}
async function initialize() {
    if (!extensionEnabled || application?.isStarted()) return;
    if (initializing) {
        while (initializing) await new Promise((resolve) => setTimeout(resolve, 50));
        if (application?.isStarted()) return;
    }
    initializing = true;
    mountStartupIndicator();
    exposeApi();
    try {
        await waitForContext();
        application ?? (application = new application_1.MirrorAbyssApplication());
        application.start();
        removeStartupIndicator();
        console.info(`[MirrorAbyss] ${constants_1.VERSION} ready`);
    }
    catch (error) {
        console.error('[MirrorAbyss] initialization failed', error);
        globalThis.toastr?.error?.(`镜渊启动失败：${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
    finally { initializing = false; }
}
function shutdown(removeApi = true) {
    application?.stop();
    removeStartupIndicator();
    if (removeApi) delete globalThis.MirrorAbyss;
}
function onActivate() { extensionEnabled = true; mountStartupIndicator(); exposeApi(); return initialize(); }
function onEnable() { extensionEnabled = true; mountStartupIndicator(); exposeApi(); return initialize(); }
function onDisable() { extensionEnabled = false; shutdown(); }
function onDelete() { extensionEnabled = false; shutdown(); application = null; }
function onInstall() { exposeApi(); }
function onUpdate() { exposeApi(); }
function onClean() { }

// SillyTavern 1.18 loads this module, then invokes the manifest activate hook.
},"matcher":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEntryIndex = buildEntryIndex;
exports.matchBlock = matchBlock;
exports.selectBestCandidate = selectBestCandidate;
exports.relevantEntries = relevantEntries;
exports.titleTokens = titleTokens;
exports.sameEntryIdentity = sameEntryIdentity;
exports.explicitContextIdentity = explicitContextIdentity;
exports.isProvisionalName = isProvisionalName;
exports.isProvisionalEntry = isProvisionalEntry;
exports.sameEventLifecycle = sameEventLifecycle;
exports.eventLifecycleScore = eventLifecycleScore;
exports.identityConflict = identityConflict;
const util_1 = require("./util");
const semantic_1 = require("./semantic");

const DEFAULT_SCORES = Object.freeze({
    uid: 100,
    exactTitle: 95,
    normalizedTitle: 90,
    contextIdentity: 110,
    alias: 85,
    nameVariant: 84,
    typeAndName: 80,
    keyword: 50,
    content: 30,
});
const HONORIFIC_SUFFIXES = Object.freeze([
    '老师', '教授', '医生', '主任', '队长', '会长', '店长', '老板',
    '先生', '女士', '小姐', '大人', '殿下', '陛下', '学姐', '学长',
    '师姐', '师兄', '姐姐', '哥哥', '前辈',
]);

function buildEntryIndex(entries) {
    const byUid = new Map();
    const byExactTitle = new Map();
    const byTitle = new Map();
    const byTypeAndName = new Map();
    const byAlias = new Map();
    const byKeyword = new Map();
    const byVariantName = new Map();
    for (const entry of entries) {
        byUid.set(String(entry.uid), entry);
        add(byExactTitle, String(entry.title ?? ''), entry);
        add(byTitle, normalizeTitleLookup(entry.title), entry);
        add(byTypeAndName, typeNameKey(entry.type, entry.name), entry);
        for (const alias of entry.aliases ?? []) add(byAlias, typedLookup(entry.type, alias), entry);
        for (const keyword of entry.triggerKeywords ?? entry.keywords ?? []) {
            if ((0, util_1.isUidKeyword)(keyword)) continue;
            add(byKeyword, typedLookup(entry.type, keyword), entry);
        }
        const identityNames = [entry.name, ...(entry.aliases ?? []), ...(entry.triggerKeywords ?? entry.keywords ?? [])];
        for (const identityName of identityNames) {
            if ((0, util_1.isUidKeyword)(identityName)) continue;
            for (const variant of nameVariants(identityName)) add(byVariantName, typedLookup(entry.type, variant), entry);
        }
    }
    return { entries, byUid, byExactTitle, byTitle, byTypeAndName, byAlias, byKeyword, byVariantName };
}

function matchBlock(block, index, contextText, weights = {}) {
    const scores = { ...DEFAULT_SCORES, ...weights };
    const collected = [];
    if (block.uid) {
        const entry = index.byUid.get(String(block.uid));
        if (entry) collected.push(candidate(entry, scores.uid, 'uid', `UID ${block.uid} 精确命中`));
    }
    collected.push(...candidates(index.byExactTitle.get(String(block.title ?? '')) ?? [], scores.exactTitle, 'exact-title', '标题完全相同'));
    collected.push(...candidates(index.byTitle.get(normalizeTitleLookup(block.title)) ?? [], scores.normalizedTitle, 'normalized-title', '标准化标题相同'));
    collected.push(...candidates(index.byTypeAndName.get(typeNameKey(block.type, block.name)) ?? [], scores.typeAndName, 'type-name', '类型与名称相同'));
    const provisionalBlock = canonicalTypeLookup(block.type) === '人物' && isProvisionalName(block.name);
    const identitySafe = (entries) => provisionalBlock ? entries.filter((entry) => isProvisionalEntry(entry)) : entries;
    collected.push(...candidates(identitySafe(index.byAlias.get(typedLookup(block.type, block.name)) ?? []), scores.alias, 'alias', `同类型正式别名“${block.name}”命中`));
    for (const variant of nameVariants(block.name)) {
        collected.push(...candidates(identitySafe(index.byVariantName.get(typedLookup(block.type, variant)) ?? []), scores.nameVariant, 'name-variant', `称谓或标题轻微变化归一为“${variant}”`));
    }
    if (canonicalTypeLookup(block.type) === '场景') {
        for (const entry of index.entries) {
            if (canonicalTypeLookup(entry.type) !== '场景') continue;
            const affinity = sceneNameAffinity(block, entry);
            if (affinity.score >= 82) collected.push(candidate(entry, affinity.score, 'scene-name-affinity', affinity.detail));
        }
    }
    collected.push(...candidates(identitySafe(index.byKeyword.get(typedLookup(block.type, block.name)) ?? []), scores.keyword, 'keyword', `同类型关键词“${block.name}”命中`));

    if (String(contextText ?? '').trim()) {
        for (const entry of index.entries) {
            if (canonicalTypeLookup(entry.type) !== canonicalTypeLookup(block.type)) continue;
            if (explicitContextIdentity(block.name, entry, contextText)) {
                const identityScore = provisionalBlock && !isProvisionalEntry(entry)
                    ? scores.contextIdentity
                    : (!provisionalBlock && isProvisionalEntry(entry) ? 79 : 88);
                collected.push(candidate(entry, identityScore, 'context-identity', `本轮正文明确说明“${block.name}”与“${entry.name}”为同一身份`));
            }
        }
    }

    // [MA-EVENT-01] 事件按同一目标、参与者与场景形成的生命周期匹配，不再只靠每轮标题。
    // 已结束事件不会被新的活动过程重新打开；标题变化只作为辅助证据。
    if (canonicalTypeLookup(block.type) === '事件') {
        for (const entry of index.entries) {
            if (canonicalTypeLookup(entry.type) !== '事件' || (0, semantic_1.isEventClosed)(entry)) continue;
            const lifecycle = eventLifecycleScore(block, entry);
            if (lifecycle.score >= 80) {
                collected.push(candidate(entry, lifecycle.score, 'event-lifecycle', lifecycle.detail));
            }
        }
    }

    const name = normalizeLookup(block.name);
    if (name.length >= 2) {
        for (const entry of index.entries) {
            if (canonicalTypeLookup(entry.type) !== canonicalTypeLookup(block.type)) continue;
            const haystack = normalizeLookup(`${entry.content ?? ''}\n${(entry.keywords ?? []).join(' ')}\n${(entry.aliases ?? []).join(' ')}`);
            if (haystack.includes(name) && (!provisionalBlock || isProvisionalEntry(entry))) collected.push(candidate(entry, scores.content, 'content', `正文或关键词包含名称“${block.name}”，仅作辅助`));
        }
    }

    const byUid = new Map();
    for (const item of collected) {
        const explicitUidMatch = item.evidence.some((evidence) => evidence.kind === 'uid');
        if (canonicalTypeLookup(block.type) === '事件' && (0, semantic_1.isEventClosed)(item.entry) && !explicitUidMatch) continue;
        const hasStrongIdentity = item.evidence.some((evidence) => ['uid', 'context-identity'].includes(evidence.kind));
        if (!hasStrongIdentity && identityConflict(block, item.entry)) {
            item.score = Math.min(Number(item.score), 40);
            item.evidence.push({ kind: 'identity-conflict', score: 0, detail: '稳定区分锚点或多个身份字段冲突，禁止按相似名称覆盖' });
        }
        else if (!hasStrongIdentity && anchorNeedsConfirmation(block, item.entry, item.evidence)) {
            item.score = Math.min(Number(item.score), 60);
            item.evidence.push({ kind: 'anchor-unconfirmed', score: 0, detail: '名称只在去除区分锚点后相同，缺少同一身份确认' });
        }
        const current = byUid.get(item.entry.uid);
        if (!current || item.score > current.score) byUid.set(item.entry.uid, item);
        else if (current && item.score === current.score) current.evidence.push(...item.evidence);
    }
    return [...byUid.values()].sort((a, b) => b.score - a.score || compareEntryPriority(a.entry, b.entry));
}

function selectBestCandidate(candidates, minimumScore = 80) {
    const eligible = candidates.filter((item) => Number(item.score) >= Number(minimumScore));
    if (!eligible.length) return null;
    const topScore = eligible[0].score;
    const top = eligible.filter((item) => item.score === topScore);
    if (top.length === 1) return top[0];
    if (!top.every((item) => sameEntryIdentity(item.entry, top[0].entry) || (canonicalTypeLookup(item.entry.type) === '事件' && canonicalTypeLookup(top[0].entry.type) === '事件' && sameEventLifecycle(item.entry, top[0].entry)))) return null;
    const selected = [...top].sort((left, right) => compareEntryPriority(left.entry, right.entry))[0];
    return {
        ...selected,
        evidence: [...selected.evidence, { kind: 'duplicate-primary', score: Number(topScore), detail: `发现${top.length}个同一身份候选，确定性选择主档 UID ${selected.entry.uid}` }],
    };
}

function relevantEntries(entries, text, limit = 24) {
    const normalized = normalizeLookup(text);
    const scored = entries.map((entry) => {
        let score = 0;
        const name = normalizeLookup(entry.name);
        if (name.length >= 2 && normalized.includes(name)) score += 1000;
        for (const keyword of entry.triggerKeywords ?? entry.keywords ?? []) {
            if ((0, util_1.isUidKeyword)(keyword)) continue;
            const key = normalizeLookup(keyword);
            if (key.length >= 2 && normalized.includes(key)) score += 180;
        }
        for (const alias of entry.aliases ?? []) {
            const key = normalizeLookup(alias);
            if (key.length >= 2 && normalized.includes(key)) score += 240;
        }
        if (entry.focus) score += 900;
        if (entry.activation?.constant) score += 300;
        if (/(进行中|当前场景|当前相关|活跃)/u.test(entry.content ?? '')) score += 120;
        return { entry, score };
    });
    const selected = scored
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || Number(b.entry.updatedAt || 0) - Number(a.entry.updatedAt || 0))
        .map((item) => item.entry);
    const fallback = entries
        .filter((entry) => entry.focus || entry.activation?.constant || entry.type === '总结' || /(进行中|当前场景|当前相关|活跃)/u.test(entry.content ?? ''))
        .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
        .slice(0, 12);
    const merged = [...new Map([...selected, ...fallback].map((entry) => [entry.uid, entry])).values()];
    if (limit <= 8) {
        // [MA-CONTEXT-01] 逐轮提取的小上下文中固定保留最新世界与基础设定各一条，
        // 防止人物名称命中把全局框架完全挤出模型视野。
        const reserved = ['基础设定', '世界'].map((type) => entries
            .filter((entry) => entry.type === type && !entry.activation?.disabled)
            .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))[0])
            .filter(Boolean);
        const reservedUids = new Set(reserved.map((entry) => entry.uid));
        const ordinary = merged.filter((entry) => !reservedUids.has(entry.uid));
        const budget = Math.max(0, Number(limit) - reserved.length);
        return [...ordinary.slice(0, budget), ...reserved].slice(0, limit);
    }
    return merged.slice(0, limit);
}

function titleTokens(value) {
    const split = (0, util_1.splitTitle)(value);
    return (0, util_1.unique)([split?.type, split?.name, value].map((item) => (0, util_1.normalizeFact)(String(item ?? ''))));
}
function sameEntryIdentity(left, right) {
    if (!left || !right) return false;
    if (String(left.uid ?? '') && String(left.uid ?? '') === String(right.uid ?? '')) return true;
    if (canonicalTypeLookup(left.type) !== canonicalTypeLookup(right.type)) return false;
    if (identityConflict(left, right)) return false;
    if (normalizeTitleLookup(left.title) && normalizeTitleLookup(left.title) === normalizeTitleLookup(right.title)) return true;
    if (canonicalTypeLookup(left.type) === '场景' && sceneNameAffinity(left, right).score >= 82) return true;
    const leftNames = new Set([left.name, ...(left.aliases ?? [])].flatMap(nameVariants));
    const rightNames = [right.name, ...(right.aliases ?? [])].flatMap(nameVariants);
    return rightNames.some((name) => leftNames.has(name));
}
function candidates(entries, score, kind, detail) {
    return [...new Map(entries.map((entry) => [entry.uid, entry])).values()].map((entry) => candidate(entry, score, kind, detail));
}
function candidate(entry, score, kind, detail) {
    return { entry, score: Number(score), evidence: [{ kind, score: Number(score), detail }] };
}
function explicitContextIdentity(blockName, entry, contextText) {
    const context = normalizeLookup(contextText);
    if (!context) return false;
    const leftNames = nameVariants(blockName);
    const rightNames = [entry.name, ...(entry.aliases ?? [])].flatMap(nameVariants);
    for (const left of leftNames) {
        for (const right of rightNames) {
            if (!left || !right || left === right) continue;
            const patterns = [
                `${left}就是${right}`, `${left}其实是${right}`, `${left}正是${right}`, `${left}原来是${right}`,
                `${right}就是${left}`, `${right}其实是${left}`, `${right}正是${left}`, `${right}原来是${left}`,
                `${left}真实身份是${right}`, `${left}的真实身份是${right}`, `${left}身份为${right}`,
                `${right}真实身份是${left}`, `${right}的真实身份是${left}`, `${right}身份为${left}`,
                // 伪装、假扮、冒充只说明表现关系，不能证明两个对象是同一身份。
                `${left}账号属于${right}`, `${left}的账号属于${right}`, `${right}账号属于${left}`, `${right}的账号属于${left}`,
            ];
            if (patterns.some((pattern) => context.includes(pattern))) return true;
        }
    }
    return false;
}


function sameEventLifecycle(left, right) {
    return eventLifecycleScore(left, right).score >= 80;
}

function eventLifecycleScore(left, right) {
    if (canonicalTypeLookup(left?.type) !== '事件' || canonicalTypeLookup(right?.type) !== '事件') return { score: 0, detail: '不是同类型事件' };
    const a = eventSignature(left);
    const b = eventSignature(right);
    const participants = tokenSetsOverlap(a.participants, b.participants);
    const scenes = tokenSetsOverlap(a.scenes, b.scenes);
    const goals = phraseSetsOverlap(a.goals, b.goals);
    const titles = phraseSimilar(a.title, b.title) || tokenSetsOverlap(a.aliases, b.aliases);
    const explicitGoalConflict = a.goals.length > 0 && b.goals.length > 0 && !goals;

    let score = 0;
    const evidence = [];
    if (participants) { score += 35; evidence.push('参与者重合'); }
    if (scenes) { score += 30; evidence.push('场景重合'); }
    if (goals) { score += 35; evidence.push('已发生变化或结果连续'); }
    if (titles) { score += 24; evidence.push('事件名称或别名近似'); }

    // 两边都有明确但不同的目标时，不因人物和地点相同就强行合并。
    if (explicitGoalConflict && !titles) return { score: 0, detail: '参与者或场景相同，但已发生变化完全不同，暂不自动合并' };
    if (participants && scenes && (!explicitGoalConflict || goals)) score = Math.max(score, 88);
    else if (participants && goals) score = Math.max(score, 86);
    else if (scenes && goals) score = Math.max(score, 84);
    else if (titles && (participants || scenes || goals)) score = Math.max(score, 82);
    score = Math.min(92, score);
    return { score, detail: evidence.length ? `同一事件生命周期：${evidence.join('、')}` : '没有足够的事件连续性证据' };
}

function eventSignature(value) {
    const sections = sectionMap(value);
    const participants = splitEventValues(sections.get('参与') ?? []);
    const scenes = splitEventValues(sections.get('场景') ?? []);
    const goals = [
        ...(sections.get('已发生进展') ?? []),
        ...(sections.get('关键进展') ?? []),
        ...(sections.get('结果') ?? []),
        // 仅用于兼容旧条目的内部匹配；不会把旧【目标】重新写回世界书。
        ...(sections.get('目标') ?? []),
    ].map(stripEventLabel).map(cleanEventPhrase).filter(Boolean);
    const aliases = [
        value?.name,
        ...(value?.aliases ?? []),
        ...(value?.keywords ?? []),
        ...(value?.triggerKeywords ?? []),
        ...(sections.get('别名') ?? []),
    ].map(cleanEventPhrase).filter(Boolean);
    return {
        title: cleanEventPhrase(value?.name ?? value?.title ?? ''),
        participants: (0, util_1.unique)(participants),
        scenes: (0, util_1.unique)(scenes),
        goals: (0, util_1.unique)(goals),
        aliases: (0, util_1.unique)(aliases),
    };
}

function sectionMap(value) {
    const map = new Map();
    if (Array.isArray(value?.sections)) {
        for (const section of value.sections) map.set(String(section?.name ?? '').trim(), section?.lines ?? []);
        return map;
    }
    for (const [name, lines] of Object.entries(value?.sections?.values ?? {})) map.set(String(name).trim(), Array.isArray(lines) ? lines : []);
    return map;
}

function stripEventLabel(value) {
    return String(value ?? '').replace(/^\s*[^：:]{1,24}\s*[：:]\s*/u, '').trim();
}
function splitEventValues(lines) {
    const output = [];
    for (const raw of lines ?? []) {
        const text = String(raw ?? '').replace(/^\s*[^：:]{1,24}\s*[：:]\s*/u, '').trim();
        for (const part of text.split(/[、,，/；;]|(?:以及|并且|与|和|及)/u)) {
            const normalized = cleanEventPhrase(part);
            if (!normalized || /^(?:无|未知|未说明|参与者|人物|当前场景|场景)$/u.test(normalized)) continue;
            output.push(normalized);
        }
    }
    return output;
}

function tokenSetsOverlap(left, right) {
    if (!left.length || !right.length) return false;
    return left.some((a) => right.some((b) => a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)))));
}
function phraseSetsOverlap(left, right) {
    if (!left.length || !right.length) return false;
    return left.some((a) => right.some((b) => phraseSimilar(a, b)));
}
function phraseSimilar(left, right) {
    const a = cleanEventPhrase(left);
    const b = cleanEventPhrase(right);
    if (!a || !b) return false;
    if (a === b) return true;
    if (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))) return true;
    const aa = bigrams(a);
    const bb = bigrams(b);
    if (!aa.length || !bb.length) return false;
    const counts = new Map();
    for (const item of aa) counts.set(item, (counts.get(item) ?? 0) + 1);
    let overlap = 0;
    for (const item of bb) {
        const count = counts.get(item) ?? 0;
        if (count > 0) { overlap += 1; counts.set(item, count - 1); }
    }
    return (2 * overlap) / (aa.length + bb.length) >= 0.46;
}
function bigrams(text) {
    if (text.length < 2) return text ? [text] : [];
    const output = [];
    for (let index = 0; index < text.length - 1; index += 1) output.push(text.slice(index, index + 2));
    return output;
}
function cleanEventPhrase(value) {
    return normalizeLookup(String(value ?? ''))
        .replace(/^(?:事件|任务|活动|当前|本轮|相关|进行中|已经|已)/u, '')
        .replace(/(?:事件|任务|活动)$/u, '');
}


function sceneNameAffinity(left, right) {
    const leftNames = [left?.name, ...(left?.aliases ?? []), ...(left?.keywords ?? [])].filter(Boolean);
    const rightNames = [right?.name, ...(right?.aliases ?? []), ...(right?.keywords ?? [])].filter(Boolean);
    let best = { score: 0, detail: '地点名称缺少稳定共同锚点' };
    for (const rawLeft of leftNames) {
        for (const rawRight of rightNames) {
            const a = normalizeSceneName(rawLeft);
            const b = normalizeSceneName(rawRight);
            if (!a || !b) continue;
            const numsA = [...a.matchAll(/\d+/gu)].map((match) => match[0]);
            const numsB = [...b.matchAll(/\d+/gu)].map((match) => match[0]);
            if (numsA.length && numsB.length && !numsA.some((value) => numsB.includes(value))) continue;
            const kindA = sceneKind(a);
            const kindB = sceneKind(b);
            if (a === b) return { score: 90, detail: `地点名称归一后相同：“${rawLeft}”≈“${rawRight}”` };
            if (numsA.some((value) => numsB.includes(value)) && kindA && kindA === kindB) {
                best = { score: 88, detail: `地点编号与类型一致：“${rawLeft}”≈“${rawRight}”` };
                continue;
            }
            if (kindA && kindA === kindB && Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a))) {
                best = { score: Math.max(best.score, 85), detail: `主体地点名称包含关系：“${rawLeft}”≈“${rawRight}”` };
                continue;
            }
            if (kindA && kindA === kindB && Math.min(a.length, b.length) >= 5 && phraseSimilar(a, b)) {
                best = { score: Math.max(best.score, 82), detail: `地点稳定名称高度相似：“${rawLeft}”≈“${rawRight}”` };
            }
        }
    }
    return best;
}
function normalizeSceneName(value) {
    return normalizeLookup(String(value ?? ''))
        .replace(/(?:的|所在|内部|里面|内侧)/gu, '')
        .replace(/(?:中央|中心区域|正中|村中)/gu, '')
        .replace(/祭台/gu, '祭坛')
        .replace(/房间/gu, '房')
        .replace(/门口|门前|床边|桌边|书桌旁|窗边|角落|拐角$/gu, '');
}
function sceneKind(value) {
    const match = String(value ?? '').match(/(宿舍|房|走廊|祭坛|洞穴|山洞|酒馆|教室|办公室|大厅|仓库|港口|村|城|森林|悬崖|街道|广场|车站|机场|遗迹|宫殿|庭院)$/u);
    return match?.[1] ?? '';
}

function isProvisionalName(value) {
    const text = normalizeLookup(value);
    if (!text) return false;
    return /(?:身份未明|身份不明|未知身份|未识别|不明身份|陌生|神秘|匿名|未知)(?:的)?(?:人物|人|男人|女人|男子|女子|少年|少女|老人|孩子|来客|访客|账号|联系人|发信者|来电者|声音|身影)?/u.test(text)
        || /^(?:黑衣|蒙面|戴面具|兜帽|遮脸)(?:人|男人|女人|男子|女子|身影)$/u.test(text);
}
function isProvisionalEntry(entry) {
    if (!entry) return false;
    if (isProvisionalName(entry.name)) return true;
    return [...(entry.keywords ?? []), ...(entry.aliases ?? [])].some((value) => /^(?:身份未明|身份不明|未知身份|临时)$/u.test((0, util_1.normalizeFact)(value)));
}

function nameVariants(value) {
    const full = normalizeLookup(String(value ?? ''));
    const raw = normalizeLookup(String(value ?? '').replace(/[（(][^）)]*[）)]/gu, ''));
    if (!full && !raw) return [];
    const variants = new Set([full, raw].filter(Boolean));
    for (const source of [full, raw]) {
        for (const suffix of HONORIFIC_SUFFIXES) {
            if (!source.endsWith(suffix)) continue;
            const base = source.slice(0, -suffix.length);
            if (base.length >= 2) variants.add(base);
        }
    }
    return [...variants];
}
function identityConflict(left, right) {
    if (!left || !right) return false;
    if (canonicalTypeLookup(left.type) !== canonicalTypeLookup(right.type)) return true;
    const leftForms = identityBodyForms(left);
    const rightForms = identityBodyForms(right);
    if (leftForms.length && rightForms.length && !leftForms.some((value) => rightForms.includes(value))) return true;
    const leftAnchors = parentheticalAnchors(left.name ?? left.title);
    const rightAnchors = parentheticalAnchors(right.name ?? right.title);
    if (leftAnchors.length && rightAnchors.length && !leftAnchors.some((value) => rightAnchors.includes(value))) return true;
    const leftForm = embodimentKind(left);
    const rightForm = embodimentKind(right);
    if (leftForm && rightForm && leftForm !== rightForm) return true;
    const leftSlots = stableIdentitySlots(left);
    const rightSlots = stableIdentitySlots(right);
    let conflicts = 0;
    for (const [key, leftValue] of leftSlots.entries()) {
        const rightValue = rightSlots.get(key);
        if (!rightValue || compatibleIdentityValue(leftValue, rightValue)) continue;
        // 唯一编号、种族、型号和类别属于强区分锚点，单项冲突即可确认不是同一对象。
        if (/^(?:唯一编号|编号|序列号|账号id|id|种族|型号|类别|形态|身份形态|存在形态|身体形态|本体类型|本体关系|载体类型)$/u.test(key)) return true;
        conflicts += 1;
    }
    return conflicts >= 2;
}

function embodimentKind(value) {
    const text = normalizeLookup(`${value?.title ?? ''}
${value?.name ?? ''}
${value?.content ?? ''}`);
    if (!text) return '';
    if (/(?:假身|分身|替身|伪装体|复制体|投影体|傀儡体|化身|冒充身份)/u.test(text)) return 'proxy';
    if (/(?:真身|本体|原身|真实身体|主体意识载体)/u.test(text)) return 'original';
    return '';
}

function anchorNeedsConfirmation(block, entry, evidence = []) {
    if (!evidence.some((item) => ['name-variant', 'type-name'].includes(item.kind))) return false;
    const blockAnchors = parentheticalAnchors(block?.name ?? block?.title);
    const entryAnchors = parentheticalAnchors(entry?.name ?? entry?.title);
    return blockAnchors.length !== entryAnchors.length && (blockAnchors.length > 0 || entryAnchors.length > 0);
}
function identityBodyForms(value) {
    const sections = sectionMap(value);
    const source = [value?.name, value?.title, ...(value?.aliases ?? [])];
    for (const [section, lines] of sections.entries()) {
        if (!/^(?:身份|稳定|定义|当前)$/u.test(section)) continue;
        source.push(...(lines ?? []));
    }
    const forms = [];
    const patterns = [
        ['真身', /(?:真身|本体|本尊|原身|主体)/u],
        ['假身', /(?:假身|替身|伪身|傀儡身|复制体)/u],
        ['分身', /(?:分身|化身|投影|镜像体)/u],
    ];
    for (const raw of source) {
        const text = normalizeLookup(raw);
        for (const [label, pattern] of patterns) if (pattern.test(text)) forms.push(label);
    }
    return (0, util_1.unique)(forms);
}

function parentheticalAnchors(value) {
    return [...String(value ?? '').matchAll(/[（(]([^）)]+)[）)]/gu)]
        .map((match) => normalizeLookup(match[1]))
        .filter(Boolean);
}
function stableIdentitySlots(value) {
    const map = new Map();
    const sections = sectionMap(value);
    for (const [section, lines] of sections.entries()) {
        if (!/^(?:身份|稳定|定义|当前)$/u.test(section)) continue;
        for (const line of lines ?? []) {
            const match = String(line ?? '').match(/^\s*([^：:]{1,24})\s*[：:]\s*(.+)$/u);
            if (!match) continue;
            const key = normalizeLookup(match[1]);
            if (!/^(?:唯一编号|编号|序列号|账号id|id|种族|职业|组织|阵营|身份|型号|类别|形态|身份形态|存在形态|身体形态|本体类型|本体关系|载体类型|载体)$/u.test(key)) continue;
            map.set(key, normalizeLookup(match[2]));
        }
    }
    return map;
}
function compatibleIdentityValue(left, right) {
    if (!left || !right) return true;
    return left === right || (Math.min(left.length, right.length) >= 3 && (left.includes(right) || right.includes(left)));
}
function compareEntryPriority(left, right) {
    const leftScore = entryPriority(left);
    const rightScore = entryPriority(right);
    if (leftScore !== rightScore) return rightScore - leftScore;
    const leftUpdated = Number(left?.updatedAt || 0);
    const rightUpdated = Number(right?.updatedAt || 0);
    if (leftUpdated !== rightUpdated) return leftUpdated - rightUpdated;
    return String(left?.uid ?? '').localeCompare(String(right?.uid ?? ''), 'zh-CN', { numeric: true });
}
function entryPriority(entry) {
    const contentSize = String(entry?.content ?? '').length;
    const sectionCount = Object.values(entry?.sections?.values ?? {}).reduce((sum, lines) => sum + (Array.isArray(lines) ? lines.length : 0), 0);
    return Number(entry?.focus === true) * 10000
        + Number(entry?.locked === true) * 5000
        + Number(entry?.managed === true) * 1000
        + Number(entry?.activation?.disabled !== true && entry?.activation?.enabled !== false) * 200
        + Math.min(150, contentSize)
        + Math.min(50, sectionCount * 5);
}
function typeNameKey(type, name) { return `${canonicalTypeLookup(type)}｜${normalizeLookup(name)}`; }
function typedLookup(type, value) { return `${canonicalTypeLookup(type)}｜${normalizeLookup(value)}`; }
function canonicalTypeLookup(type) {
    const value = normalizeLookup(type);
    return ({ 角色: '人物', npc: '人物', 地点: '场景', 地区: '场景', 区域: '场景', 全局: '世界', 全局状态: '世界', 全局变化: '世界', 当前局势: '世界', 世界局势: '世界', 世界变化: '世界', 基础规则: '基础设定', 世界设定: '基础设定', 设定: '基础设定' })[value] ?? value;
}
function normalizeTitleLookup(value) { return (0, util_1.stripBatchTitleId)(String(value ?? '')).toLocaleLowerCase(); }
function normalizeLookup(value) { return (0, util_1.normalizeFact)(String(value ?? '')).replace(/[｜|]/gu, '').toLocaleLowerCase(); }
function add(map, key, entry) {
    if (!key) return;
    const list = map.get(key) ?? [];
    if (!list.some((candidate) => candidate.uid === entry.uid)) list.push(entry);
    map.set(key, list);
}
},"memory":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryRunner = void 0;
const matcher_1 = require("./matcher");
const operations_1 = require("./operations");
const parser_1 = require("./parser");
const prompts_1 = require("./prompts");
const semantic_1 = require("./semantic");
const governance_1 = require("./governance");
const model_request_1 = require("./model-request");
const util_1 = require("./util");
class MemoryRunner {
    constructor(host, worldbook, getSettings, onProgress = null) {
        this.host = host;
        this.worldbook = worldbook;
        this.getSettings = getSettings;
        this.onProgress = typeof onProgress === 'function' ? onProgress : null;
        this.statusByChat = new Map();
    }
    progress(state, detail, meta = {}) {
        try { this.onProgress?.({ state, detail, ...meta }); }
        catch (error) { console.warn('[MirrorAbyss] progress callback failed', error); }
    }
    currentStatus(chatKey = '') {
        const key = chatKey || safeChatKey(this.host);
        return structuredClone(this.statusByChat.get(key) ?? { phase: 'idle', detail: '等待处理', error: '', rawResult: '', plan: null });
    }
    async processTurn(settings, snapshot) {
        const cursor = this.host.cursor();
        if (cursor.lastProcessedMessageKey === snapshot.messageKey && cursor.lastProcessedHash === snapshot.contentHash) {
            this.setStatus(snapshot.chatKey, 'complete', '该正文已经完整处理，跳过重复任务');
            return [];
        }
        try {
            this.setStatus(snapshot.chatKey, 'reading', '读取最终正文与相关世界书条目');
            const extraction = await this.extract(settings, snapshot);
            await this.advanceSummarySchedule(settings, snapshot, cursor, extraction.criticalChanges || 0);
            this.setStatus(snapshot.chatKey, 'complete', '核心事实已提交，总结调度完成');
            return extraction.entries;
        } catch (error) {
            this.setStatus(snapshot.chatKey, 'error', '当前步骤失败，后续步骤已停止', (0, util_1.errorText)(error));
            throw error;
        }
    }
    async runTask(kind, settings, snapshot) {
        if (kind === 'extraction') {
            const cursor = this.host.cursor();
            const result = await this.extract(settings, snapshot);
            await this.advanceSummarySchedule(settings, snapshot, cursor, result.criticalChanges || 0);
            this.setStatus(snapshot.chatKey, 'complete', extractionCompletionDetail(result));
            return result;
        }
        if (kind === 'smallSummary') {
            const result = await this.summarize('small', settings, snapshot);
            const cursor = this.host.cursor();
            let smallCountSinceLarge = cursor.smallCountSinceLarge + (result.changed ? 1 : 0);
            if (settings.autoLargeSummary !== false && smallCountSinceLarge >= settings.largeSummaryCount) {
                const large = await this.summarize('large', settings, snapshot);
                if (large.changed) smallCountSinceLarge = 0;
            }
            await this.host.saveCursor({
                ...cursor,
                turnsSinceSmall: result.changed ? 0 : cursor.turnsSinceSmall,
                criticalChangesSinceSmall: result.changed ? 0 : cursor.criticalChangesSinceSmall,
                smallCountSinceLarge,
            }, snapshot, this.getSettings());
            this.setStatus(snapshot.chatKey, 'complete', result.changed ? '小总结完成' : '小总结无更新');
            return result.entries;
        }
        const result = await this.summarize('large', settings, snapshot);
        const cursor = this.host.cursor();
        await this.host.saveCursor({ ...cursor, smallCountSinceLarge: result.changed ? 0 : cursor.smallCountSinceLarge }, snapshot, this.getSettings());
        this.setStatus(snapshot.chatKey, 'complete', result.changed ? '大总结完成' : '大总结无更新');
        return result.entries;
    }
    async advanceSummarySchedule(settings, snapshot, cursor, criticalChanges = 0) {
        let turnsSinceSmall = Number(cursor.turnsSinceSmall || 0) + 1;
        let criticalChangesSinceSmall = Number(cursor.criticalChangesSinceSmall || 0) + Math.max(0, Number(criticalChanges || 0));
        let smallCountSinceLarge = Number(cursor.smallCountSinceLarge || 0);
        const turnReady = turnsSinceSmall >= settings.smallSummaryTurns;
        const changeReady = criticalChangesSinceSmall >= settings.criticalChangesForSmall;
        if (settings.autoSmallSummary !== false && (turnReady || changeReady)) {
            const reason = turnReady ? `达到${settings.smallSummaryTurns}轮` : `累计${criticalChangesSinceSmall}个关键变化`;
            this.progress('running', `${reason}，开始小总结与分发`, { titles: ['总结｜当前事件'], criticalChanges: criticalChangesSinceSmall });
            const small = await this.summarize('small', settings, snapshot);
            if (small.changed) {
                turnsSinceSmall = 0;
                criticalChangesSinceSmall = 0;
                smallCountSinceLarge += 1;
            }
        }
        if (settings.autoLargeSummary !== false && smallCountSinceLarge >= settings.largeSummaryCount) {
            this.progress('running', `累计${settings.largeSummaryCount}个小总结，开始大总结、沉降与分发`, { titles: ['总结｜世界历史'] });
            const large = await this.summarize('large', settings, snapshot);
            if (large.changed) smallCountSinceLarge = 0;
        }
        await this.host.saveCursor({
            ...cursor,
            lastProcessedMessageKey: snapshot.messageKey,
            lastProcessedHash: snapshot.contentHash,
            turnsSinceSmall,
            criticalChangesSinceSmall,
            smallCountSinceLarge,
        }, snapshot, this.getSettings());
    }
    async extract(settings, snapshot) {
        if (settings.extractionEnabled === false) {
            this.setStatus(snapshot.chatKey, 'complete', '提取未启用');
            return { entries: [], changed: false };
        }
        this.setStatus(snapshot.chatKey, 'extracting', '提取事实与状态');
        this.validate(snapshot);
        const entries = await this.worldbook.list(settings, snapshot, () => this.validate(snapshot));
        this.validate(snapshot);
        const dialogueInput = [snapshot.dialogueContext, snapshot.turnText || `${snapshot.playerText}\n${snapshot.assistantText}`].filter(Boolean).join('\n\n');
        const selected = (0, matcher_1.relevantEntries)(entries.filter((entry) => entry.title !== governance_1.ACTIVITY_PACK_TITLE), dialogueInput, 6);
        const prompt = (0, prompts_1.extractionPrompts)(settings, snapshot.playerText, snapshot.assistantText, selected, { dialogueContext: snapshot.dialogueContext });
        // [MA-MEMORY-01] 提取只通过通用请求模块调用模型；504 时改用更短的既有条目上下文重试一次。
        const raw = await (0, model_request_1.callModel)({
            host: this.host,
            stage: 'extraction',
            prompt,
            fallbackPrompt: () => (0, prompts_1.extractionPrompts)(settings, snapshot.playerText, snapshot.assistantText, selected, { compact: true, dialogueContext: snapshot.dialogueContext }),
            settings,
            snapshot,
            profileId: settings.extractionProfileId,
            sourceText: snapshot.turnText || snapshot.assistantText,
            onRetry: () => this.progress('running', '提取网关异常，已缩短上下文并重试一次', { titles: [] }),
        });
        this.validate(snapshot);
        let parsedRaw = raw;
        let deltaRechecked = false;
        let blocks = (0, parser_1.parseExtractionWithRecovery)(parsedRaw);
        let diagnostics = blocks.diagnostics ?? { repaired: 0, merged: [], skipped: [], warnings: [], hadInput: false };
        const initialExplicitNone = isExplicitNone(raw);
        let recoveryAttempts = 0;
        let repairRaw = '';
        let retryRaw = '';
        if (!blocks.length && diagnostics.hadInput) {
            const initialDiagnostics = diagnostics;
            recoveryAttempts += 1;
            this.progress('running', '首次格式无法提交，启动一次格式修复后手', { titles: [], created: [], updated: [], skipped: [], repaired: 0 });
            const repairPrompt = (0, prompts_1.extractionRepairPrompts)(raw);
            repairRaw = await (0, model_request_1.callModel)({
                host: this.host,
                stage: 'extractionRepair',
                prompt: repairPrompt,
                fallbackPrompt: () => (0, prompts_1.extractionRepairPrompts)(raw, { compact: true }),
                settings,
                snapshot,
                profileId: settings.extractionProfileId,
                sourceText: raw,
                onRetry: () => this.progress('running', '格式修复网关异常，缩短异常文本后重试一次', { titles: [] }),
            });
            this.validate(snapshot);
            parsedRaw = repairRaw;
            blocks = (0, parser_1.parseExtractionWithRecovery)(parsedRaw);
            const next = blocks.diagnostics ?? {};
            diagnostics = successfulRecoveryDiagnostics(next, initialDiagnostics, recoveryAttempts, '已执行一次模型格式修复');
        }
        if (!blocks.length && !initialExplicitNone) {
            const failedRepairDiagnostics = diagnostics;
            recoveryAttempts += 1;
            this.progress('running', '格式修复仍无可提交条目，重新依据本轮正文执行一次精简提取', { titles: [], created: [], updated: [], skipped: [], repaired: recoveryAttempts - 1 });
            retryRaw = await (0, model_request_1.callModel)({
                host: this.host,
                stage: 'extraction',
                prompt: (0, prompts_1.extractionPrompts)(settings, snapshot.playerText, snapshot.assistantText, selected, { compact: true, dialogueContext: snapshot.dialogueContext }),
                settings,
                snapshot,
                profileId: settings.extractionProfileId,
                sourceText: snapshot.turnText || snapshot.assistantText,
            });
            this.validate(snapshot);
            parsedRaw = retryRaw;
            blocks = (0, parser_1.parseExtractionWithRecovery)(parsedRaw);
            const next = blocks.diagnostics ?? {};
            diagnostics = successfulRecoveryDiagnostics(next, failedRepairDiagnostics, recoveryAttempts, '格式修复失败后已重新执行一次精简提取');
        }
        if (!blocks.length) {
            const explicitNone = initialExplicitNone || isExplicitNone(parsedRaw);
            const skippedTitles = (diagnostics.skipped || []).map((item) => item.title || '异常片段');
            if (!explicitNone) {
                const reason = diagnosticReason(diagnostics);
                const detail = `提取结果连续恢复失败，世界书未写入，且本轮不会标记为已处理${reason ? `：${reason}` : ''}`;
                this.setStatus(snapshot.chatKey, 'error', detail, detail, parsedRaw || repairRaw || raw, emptyPlan());
                this.progress('error', detail, { titles: [], created: [], updated: [], skipped: skippedTitles, repaired: diagnostics.repaired || recoveryAttempts });
                throw new Error(detail);
            }
            const detail = '本轮明确返回“无”，世界书零写入';
            this.setStatus(snapshot.chatKey, 'complete', detail, '', parsedRaw || raw, emptyPlan());
            this.progress('success', detail, { titles: [], created: [], updated: [], skipped: [], repaired: diagnostics.repaired || recoveryAttempts });
            return { entries, changed: false, completed: true, outcome: 'explicit-none', diagnostics, titles: [], created: [], updated: [], skipped: [], merged: [], repaired: diagnostics.repaired || recoveryAttempts, criticalChanges: 0 };
        }
        let titles = blocks.map((block) => block.title);
        this.setStatus(snapshot.chatKey, 'matching', `已提取 ${titles.length} 个条目：${titles.join('、')}；格式恢复${diagnostics.repaired || recoveryAttempts}处`, '', parsedRaw);
        this.progress('running', `已提取 ${titles.length} 个，正在匹配；修复${diagnostics.repaired || 0}处`, { titles, merged: diagnostics.merged || [], repaired: diagnostics.repaired || 0, skipped: (diagnostics.skipped || []).map((item) => item.title || '异常片段') });
        let plan = (0, operations_1.buildOperationPlan)(blocks, entries, settings, dialogueInput, { sourceKind: 'extraction' });
        await this.resolveSemanticDuplicates(plan, entries, settings, snapshot);
        if (!hasWriteOperations(plan)) {
            const firstNoChangeDetails = noOpDetails(plan);
            deltaRechecked = true;
            this.progress('running', `首次${titles.length}个候选全部为已有事实或无状态变化，启动一次AI正文差量复核`, { titles, created: [], updated: [], skipped: [], merged: diagnostics.merged || [], repaired: diagnostics.repaired || 0 });
            const deltaRaw = await (0, model_request_1.callModel)({
                host: this.host,
                stage: 'extraction',
                prompt: (0, prompts_1.extractionDeltaPrompts)(settings, snapshot.assistantText, selected, firstNoChangeDetails, { compact: true }),
                settings,
                snapshot,
                profileId: settings.extractionProfileId,
                sourceText: snapshot.assistantText,
            });
            this.validate(snapshot);
            const deltaExplicitNone = isExplicitNone(deltaRaw);
            let deltaBlocks = (0, parser_1.parseExtractionWithRecovery)(deltaRaw);
            const deltaDiagnostics = deltaBlocks.diagnostics ?? { repaired: 0, merged: [], skipped: [], warnings: [], hadInput: false };
            if (!deltaBlocks.length && !deltaExplicitNone) {
                const reason = diagnosticReason(deltaDiagnostics);
                const detail = `首次候选全部零写入，AI正文差量复核格式异常，世界书未写入，且本轮不会标记为已处理${reason ? `：${reason}` : ''}`;
                this.setStatus(snapshot.chatKey, 'error', detail, detail, deltaRaw, plan);
                this.progress('error', detail, { titles, created: [], updated: [], skipped: [], repaired: diagnostics.repaired || recoveryAttempts });
                throw new Error(detail);
            }
            if (deltaExplicitNone) {
                const detail = '首次候选全部重复；AI正文差量复核确认本轮没有新增状态变化，世界书零写入';
                this.setStatus(snapshot.chatKey, 'complete', detail, '', deltaRaw, plan);
                this.progress('success', detail, { titles, created: [], updated: [], skipped: [], merged: [], repaired: diagnostics.repaired || recoveryAttempts });
                return {
                    entries,
                    changed: false,
                    completed: true,
                    outcome: 'verified-no-change',
                    diagnostics,
                    titles,
                    created: [],
                    updated: [],
                    skipped: [],
                    skippedDetails: firstNoChangeDetails,
                    merged: [],
                    repaired: diagnostics.repaired || recoveryAttempts,
                    criticalChanges: 0,
                    deltaRechecked: true,
                };
            }
            const deltaTitles = deltaBlocks.map((block) => block.title);
            const deltaPlan = (0, operations_1.buildOperationPlan)(deltaBlocks, entries, settings, snapshot.assistantText, { sourceKind: 'extraction' });
            await this.resolveSemanticDuplicates(deltaPlan, entries, settings, snapshot);
            if (!hasWriteOperations(deltaPlan)) {
                const detail = `AI正文差量复核仍确认${deltaTitles.length}个候选均为已有事实或无状态变化，世界书零写入`;
                const deltaNoChangeDetails = noOpDetails(deltaPlan);
                this.setStatus(snapshot.chatKey, 'complete', detail, '', deltaRaw, deltaPlan);
                this.progress('success', detail, { titles: deltaTitles, created: [], updated: [], skipped: [], merged: deltaDiagnostics.merged || [], repaired: Number(diagnostics.repaired || recoveryAttempts) + Number(deltaDiagnostics.repaired || 0) });
                return {
                    entries,
                    changed: false,
                    completed: true,
                    outcome: 'verified-no-change',
                    diagnostics: deltaDiagnostics,
                    titles: deltaTitles,
                    created: [],
                    updated: [],
                    skipped: [],
                    skippedDetails: deltaNoChangeDetails,
                    merged: deltaDiagnostics.merged || [],
                    repaired: Number(diagnostics.repaired || recoveryAttempts) + Number(deltaDiagnostics.repaired || 0),
                    criticalChanges: 0,
                    deltaRechecked: true,
                };
            }
            parsedRaw = deltaRaw;
            blocks = deltaBlocks;
            diagnostics = successfulRecoveryDiagnostics(deltaDiagnostics, diagnostics, 0, '首次候选零写入后已执行一次AI正文差量复核');
            titles = deltaTitles;
            plan = deltaPlan;
        }
        const created = [...new Set(plan.operations.filter((operation) => operation.kind === 'create-entry').map((operation) => operation.title))];
        const updated = [...new Set(plan.operations.filter((operation) => operation.kind !== 'create-entry' && operation.kind !== 'noop').map((operation) => operation.title))];
        const skipped = [...new Set([...(diagnostics.skipped || []).map((item) => item.title || '异常片段'), ...fullySkippedTitles(plan)])];
        const skippedDetails = noOpDetails(plan).filter((item) => skipped.includes(item.title));
        this.progress('running', `准备写入：新建${created.length}、更新${updated.length}、合并${(diagnostics.merged || []).length}、修复${diagnostics.repaired || 0}、整条跳过${skipped.length}`, { titles, created, updated, skipped, merged: diagnostics.merged || [], repaired: diagnostics.repaired || 0 });
        const result = await this.apply(settings, plan, snapshot, dialogueInput, '提取', parsedRaw);
        result.criticalChanges = (0, semantic_1.countCriticalChanges)(plan);
        result.completed = true;
        result.outcome = result.changed ? 'written' : 'no-change';
        result.diagnostics = diagnostics;
        result.titles = titles;
        result.created = created;
        result.updated = updated;
        result.skipped = skipped;
        result.skippedDetails = skippedDetails;
        result.merged = diagnostics.merged || [];
        result.repaired = diagnostics.repaired || recoveryAttempts;
        result.deltaRechecked = deltaRechecked;
        const detail = extractionCompletionDetail(result);
        this.progress('success', detail, { titles, created, updated, skipped, merged: diagnostics.merged || [], repaired: result.repaired, criticalChanges: result.criticalChanges });
        return result;
    }
    async resolveSemanticDuplicates(plan, entries, settings, snapshot) {
        const byUid = new Map(entries.map((entry) => [String(entry.uid), entry]));
        let skipped = 0;
        for (const operation of plan.operations) {
            if (operation.kind !== 'append-line' || !operation.targetUid || !operation.section || !operation.newValue) continue;
            const entry = byUid.get(String(operation.targetUid));
            const oldLines = entry?.sections?.values?.[operation.section] ?? [];
            const threshold = /(固定事实|关键进展|已发生进展|持续经历|持续变化|世界变化|事件进程|近期经历|变化记录|历史事实)/u.test(operation.section) ? 0.93 : 0.86;
            const best = oldLines.reduce((score, oldValue) => distinctNumericFacts(oldValue, operation.newValue) ? score : Math.max(score, localSemanticSimilarity(oldValue, operation.newValue)), 0);
            if (best >= threshold) {
                operation.kind = 'noop';
                operation.operation = 'no-op';
                operation.reason = `本地语义解析器判定与已有事实相似度 ${(best * 100).toFixed(0)}%，跳过追加`;
                skipped += 1;
            }
        }
        if (skipped) this.setStatus(snapshot.chatKey, 'matching', `本地语义解析器跳过 ${skipped} 条重复事实`);
    }
    async summarize(kind, settings, snapshot) {
        const label = kind === 'small' ? '小总结' : '大总结';
        this.setStatus(snapshot.chatKey, kind === 'small' ? 'small-summary' : 'large-summary', label);
        this.validate(snapshot);
        const entries = await this.worldbook.list(settings, snapshot, () => this.validate(snapshot));
        this.validate(snapshot);
        const selected = summaryEntries(kind, entries, snapshot);
        const scope = kind === 'small' ? summaryScope(selected, snapshot) : '当前';
        const expectedTitle = kind === 'small' ? '总结｜当前事件' : '总结｜世界历史';
        const recentConversation = kind === 'small'
            ? (typeof this.host.recentConversation === 'function'
                ? this.host.recentConversation(snapshot, settings.smallSummaryTurns)
                : `${snapshot.playerText || ''}\n${snapshot.assistantText || ''}`.trim())
            : '';
        const prompt = (0, prompts_1.summaryPrompts)(kind, settings, selected, scope, recentConversation);
        const profile = kind === 'small' ? settings.smallSummaryProfileId : settings.largeSummaryProfileId;
        const raw = await (0, model_request_1.callModel)({
            host: this.host,
            stage: kind === 'small' ? 'smallSummary' : 'largeSummary',
            prompt,
            fallbackPrompt: () => (0, prompts_1.summaryPrompts)(kind, settings, selected, scope, recentConversation, { compact: true }),
            settings,
            snapshot,
            profileId: profile,
            sourceText: recentConversation,
            onRetry: () => this.progress('running', `${label}网关异常，缩短上下文后重试一次`, { titles: [expectedTitle] }),
        });
        this.validate(snapshot);
        const recovered = parseSummaryWithRecovery(raw, kind);
        if (!recovered.block) {
            if (recovered.explicitNone) {
                this.setStatus(snapshot.chatKey, kind === 'small' ? 'small-summary' : 'large-summary', `${label}明确返回“无”`, '', raw, emptyPlan());
                return { entries, changed: false };
            }
            throw new Error(`${label}无法从模型返回中恢复“${expectedTitle}”`);
        }
        const summaryBlock = ensureSummarySnapshotSections(recovered.block, kind);
        if (recovered.repaired) this.progress('running', `${label}已本地修复${recovered.repaired}处格式问题`, { titles: [expectedTitle], repaired: recovered.repaired, skipped: recovered.skipped });
        if (!summarySnapshotHasFacts(summaryBlock, kind)) {
            const detail = `${label}返回了空快照，已按零写入处理；旧总结与旧条目均未修改`;
            this.setStatus(snapshot.chatKey, kind === 'small' ? 'small-summary' : 'large-summary', detail, '', raw, emptyPlan());
            this.progress('success', detail, { titles: [expectedTitle], created: [], updated: [], skipped: [expectedTitle] });
            return { entries, changed: false };
        }
        const distribution = distributionBlocksFromSummary(summaryBlock);
        summaryBlock.sections = summaryBlock.sections.filter((section) => !/^(分发事实|沉降分发)$/u.test(section.name));
        const plan = (0, operations_1.buildOperationPlan)([summaryBlock, ...distribution], entries, settings, selected.map((entry) => `${entry.title}\n${entry.content}`).join('\n'), { sourceKind: 'summary', cleanupTemporaryAfterSummary: true, consumeSmallSummaryAfterLarge: kind === 'large', compactEventProgressFromSummary: true });
        const summaryText = `${summaryBlock.title}\n${summaryBlock.sections.flatMap((section) => section.lines).join('\n')}`;
        const applied = await this.apply(settings, plan, snapshot, selected.map((entry) => `${entry.title}\n${entry.content}`).join('\n'), label, raw, { rebalanceKind: kind, summaryText });
        this.progress('running', `${label}已完成分发，正在重算召回状态`, { titles: [summaryBlock.title, ...distribution.map((block) => block.title)] });
        return applied;

    }
    async apply(settings, plan, snapshot, contextText, label, raw, options = {}) {
        this.setStatus(snapshot.chatKey, 'matching', `${label}生成确定性操作计划`, '', raw, plan);
        if (!plan.operations.some((operation) => operation.kind !== 'noop')) return { entries: [], changed: false };
        this.setStatus(snapshot.chatKey, 'worldbook', `${label}通过唯一提交器写入世界书`, '', raw, plan);
        this.validate(snapshot);
        const focusUid = typeof this.host.getFocusUid === 'function' ? this.host.getFocusUid() : '';
        const previousGameTime = typeof this.host.getCurrentGameTime === 'function' ? this.host.getCurrentGameTime() : null;
        const nextGameTime = (0, governance_1.deriveCurrentGameTime)(plan.blocks, previousGameTime);
        const entries = await this.worldbook.apply(settings, plan, snapshot.messageKey, contextText, focusUid, snapshot, () => this.validate(snapshot), { sourceKind: label === '提取' ? 'extraction' : 'summary', currentGameTime: nextGameTime, ...options });
        this.validate(snapshot);
        let receiptSaved = false;
        if (entries.receipt && typeof this.host.appendCommitReceipt === 'function') {
            try { await this.host.appendCommitReceipt(entries.receipt); receiptSaved = true; }
            catch (error) {
                try {
                    await this.worldbook.rollbackReceipts(settings, [entries.receipt], focusUid, snapshot, () => this.validate(snapshot));
                }
                catch (rollbackError) {
                    throw new Error(`提交回执保存失败，且世界书自动回滚失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackError)}`);
                }
                throw new Error(`提交回执保存失败，世界书已自动恢复提交前状态：${(0, util_1.errorText)(error)}`);
            }
        }
        try {
            if (typeof this.host.setCurrentGameTime === 'function') await this.host.setCurrentGameTime(nextGameTime, snapshot, this.getSettings());
        }
        catch (error) {
            try {
                if (entries.receipt) await this.worldbook.rollbackReceipts(settings, [entries.receipt], focusUid, snapshot, () => this.validate(snapshot));
                if (receiptSaved && typeof this.host.removeCommitReceipts === 'function') await this.host.removeCommitReceipts([entries.receipt.id]);
            }
            catch (rollbackError) {
                throw new Error(`当前游戏时间保存失败，且世界书恢复失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackError)}`);
            }
            throw new Error(`当前游戏时间保存失败，世界书已恢复提交前状态：${(0, util_1.errorText)(error)}`);
        }
        return { entries, changed: entries.changed === true, receipt: entries.receipt ?? null, activityPack: entries.activityPack ?? null, currentGameTime: nextGameTime };
    }
    validate(snapshot) { this.host.assertSnapshot(snapshot, this.getSettings()); }
    setStatus(chatKey, phase, detail, error = '', rawResult = '', plan = null) {
        const previous = this.statusByChat.get(chatKey) ?? {};
        this.statusByChat.set(chatKey, { phase, detail, error, rawResult: rawResult || previous.rawResult || '', plan: plan ?? previous.plan ?? null });
    }
}
exports.MemoryRunner = MemoryRunner;

function isExplicitNone(value) {
    return /^(?:无|EMPTY)$/u.test(String(value ?? '').trim());
}
function successfulRecoveryDiagnostics(current, previous, recoveryAttempts, message) {
    const currentDiagnostics = current ?? {};
    const previousReasons = (previous?.skipped || []).map((item) => item?.reason).filter(Boolean);
    return {
        repaired: Number(currentDiagnostics.repaired || 0) + Math.max(0, Number(recoveryAttempts || 0)),
        merged: [...(currentDiagnostics.merged || [])],
        // 前一次失败输出不是最终候选，不能继续显示为本轮“跳过条目”。
        skipped: [...(currentDiagnostics.skipped || [])],
        warnings: [...(previous?.warnings || []), ...previousReasons.map((reason) => `前一次输出未采用：${reason}`), message, ...(currentDiagnostics.warnings || [])],
        hadInput: currentDiagnostics.hadInput === true,
    };
}
function diagnosticReason(diagnostics) {
    const reasons = (diagnostics?.skipped || []).map((item) => String(item?.reason || '').trim()).filter(Boolean);
    return [...new Set(reasons)].slice(0, 3).join('；');
}
function hasWriteOperations(plan) {
    return Boolean(plan?.operations?.some((operation) => operation.kind !== 'noop'));
}
function noOpDetails(plan) {
    const seen = new Set();
    const output = [];
    for (const operation of plan?.operations ?? []) {
        if (operation.kind !== 'noop') continue;
        const item = {
            title: String(operation.title || '候选'),
            section: String(operation.section || ''),
            reason: String(operation.reason || '没有形成可提交变化'),
        };
        const key = `${item.title}|${item.section}|${item.reason}`;
        if (seen.has(key)) continue;
        seen.add(key);
        output.push(item);
    }
    return output;
}
function fullySkippedTitles(plan) {
    const grouped = new Map();
    for (const operation of plan?.operations ?? []) {
        const title = String(operation.title || '').trim();
        if (!title) continue;
        const state = grouped.get(title) ?? { total: 0, writes: 0 };
        state.total += 1;
        if (operation.kind !== 'noop') state.writes += 1;
        grouped.set(title, state);
    }
    return [...grouped.entries()].filter(([, state]) => state.total > 0 && state.writes === 0).map(([title]) => title);
}
function extractionCompletionDetail(result) {
    if (result?.outcome === 'explicit-none') return '提取完成：本轮无可记录事实，世界书零写入';
    if (result?.outcome === 'verified-no-change') return '提取完成：首次重复候选已经过AI正文差量复核，确认本轮没有新增状态变化，世界书零写入';
    if (result?.outcome === 'no-change' || result?.changed === false) return `提取完成：候选均为已有事实或无状态变化，世界书零写入${result?.skipped?.length ? `；整条跳过${result.skipped.length}条` : ''}`;
    return `提取完成：新建${result?.created?.length || 0}、更新${result?.updated?.length || 0}、关键变化${result?.criticalChanges || 0}、合并${result?.merged?.length || 0}、格式恢复${result?.repaired || 0}、跳过${result?.skipped?.length || 0}`;
}

function ensureSummarySnapshotSections(block, kind) {
    const output = structuredClone(block);
    const expected = kind === 'small'
        ? ['已发生进展', '未发生进展', '稳定影响']
        : ['长期变化', '重要事件结果', '长期关系', '稳定世界影响'];
    const aliases = kind === 'small'
        ? {
            '关键进展': '已发生进展',
            '当前进展': '已发生进展',
            '当前情况': '已发生进展',
            '关键状态': '已发生进展',
            '未形成进展': '未发生进展',
            '未解决事项': '未发生进展',
            '待处理事项': '未发生进展',
            '持续影响': '稳定影响',
        }
        : { '长期结果': '长期变化', '重要事件': '重要事件结果', '事件结果': '重要事件结果', '关系变化': '长期关系', '世界影响': '稳定世界影响' };
    const merged = new Map();
    for (const section of output.sections ?? []) {
        const name = aliases[String(section.name ?? '').trim()] ?? String(section.name ?? '').trim();
        if (!name) continue;
        const current = merged.get(name) ?? { name, lines: [], empty: true };
        current.lines = (0, util_1.unique)([...(current.lines ?? []), ...(section.lines ?? [])]);
        current.empty = current.lines.length === 0;
        merged.set(name, current);
    }
    for (const name of expected) {
        if (!merged.has(name)) merged.set(name, { name, lines: [], empty: true });
    }
    const passthrough = ['分发事实', '沉降分发'].map((name) => merged.get(name)).filter(Boolean);
    output.sections = [...expected.map((name) => merged.get(name)), ...passthrough];
    return output;
}

function summarySnapshotHasFacts(block, kind) {
    const expected = new Set(kind === 'small'
        ? ['已发生进展', '未发生进展', '稳定影响']
        : ['长期变化', '重要事件结果', '长期关系', '稳定世界影响']);
    return (block.sections ?? []).some((section) => expected.has(section.name) && (section.lines ?? []).some((line) => {
        const text = String(line ?? '').trim();
        return text && !/^(?:无|没有|暂无)$/u.test(text);
    }));
}

function summaryEntries(kind, entries, snapshot) {
    const active = entries.filter((entry) => !entry.activation.disabled && entry.title !== governance_1.ACTIVITY_PACK_TITLE);
    if (kind === 'small') {
        const candidates = active.filter((entry) => entry.title !== '总结｜世界历史');
        const required = [
            ...candidates.filter((entry) => entry.title === '总结｜当前事件'),
            ...candidates.filter((entry) => entry.type === '事件' && !(0, semantic_1.isEventClosed)(entry))
                .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0)),
        ];
        const continuity = candidates
            .filter((entry) => /^(事件|场景|时空)$/u.test(entry.type) || entry.title === '总结｜当前事件')
            .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
            .slice(0, 10);
        const relevant = (0, matcher_1.relevantEntries)(candidates, `${snapshot.playerText}\n${snapshot.assistantText}`, 36);
        return [...new Map([...required, ...continuity, ...relevant].map((entry) => [entry.uid, entry])).values()].slice(0, 36);
    }
    const currentWorldHistory = active.filter((entry) => entry.title === '总结｜世界历史');
    const currentEvent = active.filter((entry) => entry.title === '总结｜当前事件');
    const requiredUids = new Set([...currentWorldHistory, ...currentEvent].map((entry) => entry.uid));
    const stable = active.filter(hasStableSummaryMaterial)
        .filter((entry) => !requiredUids.has(entry.uid))
        .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
    return [...new Map([...currentWorldHistory, ...currentEvent, ...stable].map((entry) => [entry.uid, entry])).values()].slice(0, 72);
}
function hasStableSummaryMaterial(entry) {
    const values = entry?.sections?.values ?? {};
    if (entry.type === '事件') return (values['结果'] ?? []).length > 0;
    if (entry.type === '人物' || entry.type === '角色') return ['身份', '稳定', '性格核心', '表达方式', '决策倾向', '关系立场', '关系', '固定事实'].some((section) => (values[section] ?? []).length > 0);
    if (entry.type === '场景' || entry.type === '时空') return ['定义', '空间结构', '固定资源', '固定事实', '世界影响'].some((section) => (values[section] ?? []).length > 0);
    if (entry.type === '物品') return ['定义', '功能', '限制', '固定事实'].some((section) => (values[section] ?? []).length > 0);
    return /^(世界|全局变化|基础设定)$/u.test(entry.type);
}

function summaryScope(entries, snapshot) {
    const event = entries.find((entry) => entry.type === '事件' && !entry.activation.disabled);
    if (event) return event.name;
    const scene = entries.find((entry) => entry.type === '场景' && !entry.activation.disabled);
    if (scene) return scene.name;
    const existing = entries.find((entry) => entry.title === '总结｜当前事件');
    if (existing) return existing.name;
    return '当前事件线';
}
function distributionBlocksFromSummary(summaryBlock) {
    const section = summaryBlock.sections.find((item) => /^(分发事实|沉降分发)$/u.test(item.name));
    if (!section || section.empty) return [];
    const blocks = new Map();
    for (const line of section.lines) {
        const match = String(line ?? '').match(/^\s*(人物|角色|场景|地点|物品|事件|世界|全局变化|基础设定|世界设定)\s*[｜|丨]\s*([^｜|丨]+?)\s*[｜|丨]\s*([^｜|丨]+?)\s*[｜|丨]\s*(.+)$/u);
        if (!match) continue;
        const type = (0, parser_1.canonicalExtractionType)(match[1].trim());
        const name = match[2].trim();
        const sectionName = match[3].trim();
        const fact = match[4].trim();
        if (!name || !sectionName || !fact) continue;
        const explicitEmpty = /^(?:无|没有)$/u.test(fact);
        if (explicitEmpty && !(type === '事件' && sectionName === '未发生进展')) continue;
        const title = `${type}｜${name}`;
        const block = blocks.get(title) ?? { rawTitle: title, title, type, name, keywords: [name], sections: [] };
        let target = block.sections.find((item) => item.name === sectionName);
        if (!target) {
            target = { name: sectionName, lines: [], empty: explicitEmpty };
            block.sections.push(target);
        }
        if (explicitEmpty) {
            target.lines = [];
            target.empty = true;
        }
        else {
            target.lines = (0, util_1.unique)([...target.lines, fact]);
            target.empty = false;
        }
        blocks.set(title, block);
    }
    return [...blocks.values()];
}

function parseSummaryWithRecovery(raw, kind) {
    const expectedTitle = kind === 'small' ? '总结｜当前事件' : '总结｜世界历史';
    const text = (0, parser_1.sanitizeModelText)(raw);
    if (/^(?:无|EMPTY)$/u.test(text.trim())) return { block: null, explicitNone: true, repaired: 0, skipped: [] };
    let repaired = 0;
    let blocks = [];
    try { blocks = (0, parser_1.parseInformationPoints)(text); }
    catch {
        if (/【[^】]+】/u.test(text) && !/(?:总结|小总结|大总结)[｜|丨]/u.test(text)) {
            try {
                blocks = (0, parser_1.parseInformationPoints)(`${expectedTitle}\n\n${text}`);
                repaired += 1;
            }
            catch { blocks = []; }
        }
    }
    const candidates = blocks.filter((block) => {
        const normalized = (0, util_1.normalizeTitle)(block.title);
        if (normalized === (0, util_1.normalizeTitle)(expectedTitle)) return true;
        if (kind === 'small') return /^(?:总结|小总结)[｜|丨](?:当前事件|当前事件线|当前阶段)$/u.test(normalized);
        return /^(?:总结|大总结)[｜|丨](?:世界历史|长期历史|长期记忆)$/u.test(normalized);
    });
    if (!candidates.length && blocks.length === 1 && blocks[0].sections?.length) {
        candidates.push(blocks[0]);
        repaired += 1;
    }
    if (!candidates.length) return { block: null, explicitNone: false, repaired, skipped: blocks.map((block) => block.title) };
    const merged = { rawTitle: expectedTitle, title: expectedTitle, type: '总结', name: kind === 'small' ? '当前事件' : '世界历史', keywords: [kind === 'small' ? '当前事件' : '世界历史', '总结'], sections: [] };
    const sectionMap = new Map();
    for (const block of candidates) {
        if ((0, util_1.normalizeTitle)(block.title) !== (0, util_1.normalizeTitle)(expectedTitle)) repaired += 1;
        for (const section of block.sections ?? []) {
            const name = String(section.name ?? '').trim();
            if (!name) continue;
            const target = sectionMap.get(name) ?? { name, lines: [], empty: false };
            target.lines = (0, util_1.unique)([...target.lines, ...(section.lines ?? [])]);
            target.empty = target.lines.length === 0;
            sectionMap.set(name, target);
        }
    }
    merged.sections = [...sectionMap.values()];
    if (candidates.length > 1) repaired += candidates.length - 1;
    return { block: merged, explicitNone: false, repaired, skipped: blocks.filter((block) => !candidates.includes(block)).map((block) => block.title) };
}

function emptyPlan() { return { blocks: [], operations: [], createdAt: Date.now() }; }


function distinctNumericFacts(left, right) {
    const values = (value) => [...String(value ?? '').matchAll(/\d+(?:\.\d+)?/gu)].map((match) => match[0]);
    const leftValues = values(left);
    const rightValues = values(right);
    if (!leftValues.length && !rightValues.length) return false;
    return JSON.stringify(leftValues) !== JSON.stringify(rightValues);
}
function localSemanticSimilarity(left, right) {
    const a = localBigrams(left);
    const b = localBigrams(right);
    if (!a.length || !b.length) return localNormalizeSemantic(left) === localNormalizeSemantic(right) ? 1 : 0;
    const counts = new Map();
    for (const value of a) counts.set(value, (counts.get(value) ?? 0) + 1);
    let overlap = 0;
    for (const value of b) {
        const count = counts.get(value) ?? 0;
        if (count > 0) {
            overlap += 1;
            counts.set(value, count - 1);
        }
    }
    return (2 * overlap) / (a.length + b.length);
}
function localBigrams(value) {
    const text = localNormalizeSemantic(value);
    if (text.length < 2) return text ? [text] : [];
    const output = [];
    for (let index = 0; index < text.length - 1; index += 1) output.push(text.slice(index, index + 2));
    return output;
}
function localNormalizeSemantic(value) {
    return String(value ?? '')
        .toLocaleLowerCase()
        .replace(/(?:目前|当前|此时|现在)/gu, '')
        .replace(/(?:取得|拿到|得到)/gu, '获得')
        .replace(/(?:拥有着|持有着)/gu, '持有')
        .replace(/(?:身处于|处在|位在)/gu, '位于')
        .replace(/[\s，。！？；：、“”‘’（）()《》〈〉【】\[\]—…·,.!?:;'"`~|｜]/gu, '');
}
function safeChatKey(host) { try { return host.chatKey(); } catch { return ''; } }
},"migration":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INFORMATION_BOUNDARY_TITLE = exports.MigrationService = void 0;
exports.needsMigration = needsMigration;
exports.isRebuildCandidate = isRebuildCandidate;
exports.parseRebuildResponse = parseRebuildResponse;
exports.mergeRebuildBlocks = mergeRebuildBlocks;
exports.buildRebuildSnapshot = buildRebuildSnapshot;
exports.buildRebuildBatches = buildRebuildBatches;
exports.buildSemanticClusters = buildSemanticClusters;
exports.buildRebuildPlan = buildRebuildPlan;
exports.buildRebuildSourceIndex = buildRebuildSourceIndex;
exports.parseRebuildPlanningResponse = parseRebuildPlanningResponse;
exports.buildPlannedRebuildTasks = buildPlannedRebuildTasks;
exports.packPlannedRebuildTasks = packPlannedRebuildTasks;
exports.buildRebuildReviewCatalog = buildRebuildReviewCatalog;
exports.analyzeRebuildCoverage = analyzeRebuildCoverage;
exports.restoreUncoveredRebuildSourceLines = restoreUncoveredRebuildSourceLines;
exports.applyRebuildTemporalSettlement = applyRebuildTemporalSettlement;
exports.buildRebuildSpacetimeSection = buildRebuildSpacetimeSection;
exports.parseRebuildReviewResponse = parseRebuildReviewResponse;
exports.buildRegionalSynthesisTasks = buildRegionalSynthesisTasks;
exports.buildOrganizationSynthesisTasks = buildOrganizationSynthesisTasks;
exports.buildEventSynthesisTasks = buildEventSynthesisTasks;
exports.buildFoundationSynthesisTasks = buildFoundationSynthesisTasks;
exports.buildWorldSynthesisTasks = buildWorldSynthesisTasks;
exports.buildMigrationSchema = buildMigrationSchema;
exports.buildExtendedSynthesisTasks = buildExtendedSynthesisTasks;
exports.mergeProposedKeywordDefinitions = mergeProposedKeywordDefinitions;
exports.findOverlappingMigrationType = findOverlappingMigrationType;
exports.isMigrationRateLimitError = isMigrationRateLimitError;
exports.preserveSparseRebuildBlocks = preserveSparseRebuildBlocks;
exports.finalizeRebuildBlocks = finalizeRebuildBlocks;
exports.preserveEventPendingFacts = preserveEventPendingFacts;
const constants_1 = require("./constants");
const parser_1 = require("./parser");
const information_point_1 = require("./domain/information-point");
const matcher_1 = require("./matcher");
const prompts_1 = require("./prompts");
const util_1 = require("./util");
const model_request_1 = require("./model-request");
const semantic_1 = require("./semantic");

const ALLOWED_TYPES = new Set(['人物', '场景', '物品', '事件', '世界', '基础设定']);
const NON_EVENT_TYPES = new Set(['人物', '场景', '物品', '世界', '基础设定']);
const KNOWLEDGE_SECTIONS = new Set(['已知', '误信']);
const TYPE_ALLOWED_SECTIONS = {
    人物: new Set(['时空锚点', '身份', '稳定', '当前', '关系', '持有', '已知', '误信', '固定事实', '别名']),
    场景: new Set(['时空锚点', '定义', '空间结构', '固定资源', '固定事实', '当前状态', '在场', '当前资源', '活动关联', '世界影响', '局部约束', '别名']),
    物品: new Set(['时空锚点', '定义', '功能', '限制', '当前', '关系', '持有', '固定事实', '别名']),
    // [MA-REBUILD-10] 重建后的事件只保存已经发生的参与、场景、进展与结果。
    // 目标和未决只可用于内部聚类，不再写回新事件条目。
    事件: new Set(['时空锚点', '参与', '场景', '已发生进展', '未发生进展', '结果', '别名']),
    世界: new Set(['时空锚点', '范围', '地理', '组织', '权力', '制度', '资源与交通', '公开局势', '固定事实', '持续影响', '别名']),
    基础设定: new Set(['时空锚点', '世界常识', '自然规则', '种族与生命', '能力与技术', '社会规则', '地理框架', '别名']),
};
const MIGRATION_EXCLUSIVE_SECTIONS = new Set(['身份', '当前', '当前状态', '功能']);
const MIGRATION_STRONG_SINGLE_SLOTS = new Set(['唯一编号', '编号', '序列号', '账号id', 'id', '种族', '型号', '类别', '身份形态', '存在形态', '身体形态', '本体关系', '当前位置', '当前持有者', '当前使用者', '所有权', '保管者']);
const SOURCE_MARKER = /(?:〔|【|\[|（|\()\s*(?:证据|来源|证据UID|来源UID|旧UID)\s*[：:]\s*([^〕】\]）)]+)\s*(?:〕|】|\]|）|\))/giu;
const SOURCE_LINE_MARKER = /(?:〔|【|\[|（|\()\s*(?:来源行|证据行|sourceLine)\s*[：:]\s*([^〕】\]）)]+)\s*(?:〕|】|\]|）|\))/giu;
const SOURCE_KIND_PATTERN = /(?:信息来源|认知来源)\s*[：:]\s*(亲眼观察|听到对白|收到消息|查看记录|他人转述|亲身经历|可靠推理|特殊能力|公开信息|自身身份|自身行动|直接告知)/u;
const MIGRATION_BATCH_BODY_BUDGET = 7200;
const MIGRATION_BATCH_CATALOG_BUDGET = 1800;
const MIGRATION_FRAGMENT_BUDGET = 3200;
const MIGRATION_BATCH_MAX_RECORDS = 5;
const MIGRATION_CLUSTER_BODY_BUDGET = 6800;
const MIGRATION_DERIVED_BODY_BUDGET = 6800;
const MIGRATION_PLANNED_GROUP_BUDGET = 10500;
const MIGRATION_PLANNED_JOINT_BUDGET = 15000;
const MIGRATION_PLANNED_JOINT_MAX_GROUPS = 4;
const MIGRATION_PLAN_LINE_PREVIEW = 68;
const REGION_SUFFIX_PATTERN = /([\p{Script=Han}A-Za-z0-9·]{2,20}(?:大陆|王国|帝国|公国|领地|地区|区域|州|省|郡|城|镇|村|港|关|岛|群岛|海域|森林|山脉|荒原|边境|北境|南境|东境|西境))/gu;
const ORGANIZATION_SUFFIX_PATTERN = /([\p{Script=Han}A-Za-z0-9·]{2,24}(?:王室|议会|教会|教团|公会|商会|协会|学院|军团|军|卫队|骑士团|调查局|委员会|家族|公司|组织|势力|联盟|同盟|帮派|工坊|研究院))/gu;
const MIGRATION_DEFAULT_INTERVAL_MS = 2200;
const MIGRATION_RATE_LIMIT_BACKOFF_MS = [8000, 20000];
const MIGRATION_MAX_RATE_LIMIT_RETRIES = 2;
const UNIVERSAL_ENTRY_MARKER = '新条目';
const UNIVERSAL_METADATA_NAMES = new Set(['组ID', '名称', '归入类型', '建议类型', '与现有类型区别', '别名', '合并来源', '来源行', '保留方式', '并入条目', '并入栏目', '场景锚点', '游戏时间', '时间来源', '时态']);
const UNIVERSAL_SECTION_NAMES = new Set(['内容', '角色认知', '过去结果', '关键词']);
const TEMPORAL_STATES = new Set(['当前', '持续', '已完成', '已结束', '长期']);
const TIME_SOURCES = new Set(['明确', '推定', '未知']);
const REBUILD_SPACETIME_SECTION = '时空锚点';
const REBUILD_TYPE_CODES = new Map([
    ['人物', 'C'], ['场景', 'L'], ['物品', 'I'], ['事件', 'E'], ['世界', 'W'], ['基础设定', 'R'],
]);
const MIGRATION_TYPE_DECORATION_PATTERN = /(?:档案|信息|记录|条目|资料|表格|表|类型|类别|对象|实体)$/gu;
const MIGRATION_TYPE_SYNONYMS = new Map([
    ['角色', '人物'], ['npc', '人物'], ['人物档案', '人物'], ['角色档案', '人物'], ['人员', '人物'],
    ['地点', '场景'], ['地区', '场景'], ['区域', '场景'], ['场所', '场景'], ['地理区域', '场景'], ['地区规则', '场景'],
    ['道具', '物品'], ['装备', '物品'], ['物件', '物品'], ['物资', '物品'],
    ['事件链', '事件'], ['任务', '事件'], ['行动', '事件'], ['剧情事件', '事件'],
    ['全局', '世界'], ['局势', '世界'], ['世界状态', '世界'], ['全局状态', '世界'],
    ['世界设定', '基础设定'], ['基础规则', '基础设定'], ['世界规则', '基础设定'], ['设定规则', '基础设定'],
]);
const UNIVERSAL_FIELD_ALIASES = {
    人物: {
        身份: ['身份', '姓名', '真名', '职业', '种族', '性别', '年龄', '血统', '阵营', '称号'],
        稳定: ['稳定', '性格', '能力', '长期能力', '长期限制', '习惯', '稳定特征', '外貌特征'],
        当前: ['当前', '位置', '所在地', '当前地点', '目标', '当前目标', '状态', '当前状态', '伤势', '情绪'],
        关系: ['关系', '关系状态', '立场', '态度'],
        持有: ['持有', '装备', '携带', '资源', '持有物'],
        固定事实: ['固定事实', '持续经历', '经历', '过去结果', '历史结果', '近期经历'],
        别名: ['别名', '称呼', '其他名称'],
    },
    场景: {
        定义: ['定义', '性质', '位置', '所属', '地点属性'],
        空间结构: ['空间结构', '空间', '结构', '布局'],
        固定资源: ['固定资源', '设施', '固定设施'],
        固定事实: ['固定事实', '持续变化', '变化', '过去结果', '历史结果'],
        当前状态: ['当前状态', '当前', '状态'],
        在场: ['在场', '在场人物', '人物'],
        当前资源: ['当前资源', '资源'],
        活动关联: ['活动关联', '活动', '关联事件'],
        世界影响: ['世界影响', '影响'],
        局部约束: ['局部约束', '规则', '局部规则', '通行规则', '限制'],
        别名: ['别名', '其他名称'],
    },
    物品: {
        定义: ['定义', '外观', '材质', '类型', '来源'],
        功能: ['功能', '用途', '效果', '能力'],
        当前: ['当前', '状态', '当前状态', '位置', '持有者', '所有者'],
        限制: ['限制', '代价', '条件', '使用条件'],
        固定事实: ['固定事实', '持续变化', '变化', '过去结果', '历史结果'],
        别名: ['别名', '其他名称'],
    },
    事件: {
        参与: ['参与', '参与者', '相关人物'],
        场景: ['场景', '地点', '发生地点'],
        已发生进展: ['已发生进展', '关键进展', '进展', '过程结果', '已发生经过', '阶段结果'],
        未发生进展: ['未发生进展', '未形成进展', '过程动作', '过程细节', '无状态变化'],
        结果: ['结果', '过去结果', '最终结果', '已发生结果'],
        别名: ['别名', '其他名称'],
    },
    世界: {
        范围: ['范围', '影响范围'], 地理: ['地理', '区域', '地区'], 组织: ['组织', '势力'],
        权力: ['权力', '权力结构'], 制度: ['制度', '规则', '法律'], 资源与交通: ['资源与交通', '资源', '交通'],
        公开局势: ['公开局势', '当前局势', '局势', '当前状态'], 固定事实: ['固定事实', '世界变化', '变化', '过去结果'],
        持续影响: ['持续影响', '影响'], 别名: ['别名', '其他名称'],
    },
    基础设定: {
        世界常识: ['世界常识', '常识'], 自然规则: ['自然规则', '基础规则', '世界规则'],
        种族与生命: ['种族与生命', '种族', '生命规则'], 能力与技术: ['能力与技术', '能力体系', '技术体系'],
        社会规则: ['社会规则', '社会制度'], 地理框架: ['地理框架', '地理'], 别名: ['别名', '其他名称'],
    },
};
exports.INFORMATION_BOUNDARY_TITLE = '基础设定｜角色信息边界';

// [MA-REBUILD-07] 重建格式来自当前设置中的表定义，而不是把“组织”写死成唯一扩展类型。
function buildMigrationSchema(keywordDefinitions = [], records = []) {
    const definitions = new Map();
    const aliasToType = new Map();
    const addDefinition = (raw, inferred = false) => {
        const label = String(raw?.label ?? raw?.type ?? '').trim();
        if (!label) return;
        const canonicalBuiltin = (0, parser_1.canonicalExtractionType)(label);
        const type = ALLOWED_TYPES.has(canonicalBuiltin) ? canonicalBuiltin : label;
        const existing = definitions.get(type);
        const fields = (0, util_1.unique)([
            ...((existing?.fields ?? []).map((field) => field.label)),
            ...((raw?.fields ?? []).map((field) => String(field?.label ?? field?.name ?? '').trim()).filter(Boolean)),
            '别名',
        ]).map((labelValue) => ({
            label: labelValue,
            policy: String((raw?.fields ?? []).find((field) => String(field?.label ?? field?.name ?? '').trim() === labelValue)?.policy
                ?? (existing?.fields ?? []).find((field) => field.label === labelValue)?.policy
                ?? 'semantic-upsert'),
        }));
        const aliases = (0, util_1.unique)([
            type,
            label,
            ...(existing?.aliases ?? []),
            ...(0, util_1.normalizeStringArray)(raw?.aliases),
        ]);
        const definition = {
            key: String(raw?.key ?? existing?.key ?? (0, util_1.safeId)(type) ?? type),
            label: type,
            description: String(raw?.description ?? raw?.prompt ?? existing?.description ?? ''),
            aliases,
            fields,
            enabled: raw?.enabled !== false,
            constant: raw?.constant === true || existing?.constant === true,
            vectorized: raw?.vectorized !== false && existing?.vectorized !== false,
            preventRecursion: raw?.preventRecursion === true || existing?.preventRecursion === true,
            depth: Number.isFinite(Number(raw?.depth)) ? Number(raw.depth) : Number(existing?.depth ?? 4),
            order: Number.isFinite(Number(raw?.order)) ? Number(raw.order) : Number(existing?.order ?? 400),
            inferred: Boolean(inferred && !existing),
            modelProposed: raw?.modelProposed === true || existing?.modelProposed === true,
        };
        definitions.set(type, definition);
        for (const alias of aliases) aliasToType.set((0, util_1.normalizeFact)(alias), type);
    };
    for (const [type, sections] of Object.entries(TYPE_ALLOWED_SECTIONS)) {
        addDefinition({ label: type, aliases: [], fields: [...sections].map((label) => ({ label })) });
    }
    for (const raw of Array.isArray(keywordDefinitions) ? keywordDefinitions : []) {
        if (raw?.enabled === false) continue;
        addDefinition(raw);
    }
    // 已由镜渊管理、但设置中已被删掉的旧自定义表仍按旧正文栏目推导格式，避免重建时整表丢失。
    for (const record of Array.isArray(records) ? records : []) {
        const split = (0, util_1.splitTitle)((0, util_1.normalizeTitle)(record.title));
        if (!split || ALLOWED_TYPES.has((0, parser_1.canonicalExtractionType)(split.type))) continue;
        if (definitions.has(split.type) || aliasToType.has((0, util_1.normalizeFact)(split.type))) continue;
        const sections = (0, parser_1.parseEntrySections)(record.content || '');
        addDefinition({ label: split.type, fields: sections.order.map((label) => ({ label })) }, true);
    }
    const allowedSectionsByType = Object.fromEntries([...definitions.entries()].map(([type, definition]) => [type, new Set(definition.fields.map((field) => field.label))]));
    const customDefinitions = [...definitions.values()].filter((definition) => !ALLOWED_TYPES.has(definition.label));
    return { definitions, aliasToType, allowedSectionsByType, customDefinitions };
}

function resolveMigrationType(value, schema) {
    const raw = String(value ?? '').trim();
    const builtin = (0, parser_1.canonicalExtractionType)(raw);
    if (schema?.definitions?.has(builtin)) return builtin;
    return schema?.aliasToType?.get((0, util_1.normalizeFact)(raw)) ?? builtin;
}

function migrationDefinition(schema, type) {
    return schema?.definitions?.get(resolveMigrationType(type, schema)) ?? null;
}


function migrationTypeCore(value) {
    return (0, util_1.normalizeFact)(String(value ?? ''))
        .replace(MIGRATION_TYPE_DECORATION_PATTERN, '')
        .replace(/(?:一览|总览|清单)$/gu, '');
}

function findOverlappingMigrationType(value, schema = buildMigrationSchema()) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const normalized = (0, util_1.normalizeFact)(raw);
    const synonym = MIGRATION_TYPE_SYNONYMS.get(normalized);
    if (synonym && schema?.definitions?.has(synonym)) return synonym;
    const resolved = resolveMigrationType(raw, schema);
    if (schema?.definitions?.has(resolved)) return resolved;
    const core = migrationTypeCore(raw);
    if (!core) return '';
    for (const definition of schema?.definitions?.values?.() ?? []) {
        for (const candidate of [definition.label, ...(definition.aliases ?? [])]) {
            const candidateCore = migrationTypeCore(candidate);
            if (!candidateCore) continue;
            if (candidateCore === core) return definition.label;
            const shorter = Math.min(candidateCore.length, core.length);
            const delta = Math.abs(candidateCore.length - core.length);
            if (shorter >= 2 && delta <= 3 && (candidateCore.includes(core) || core.includes(candidateCore))) return definition.label;
        }
    }
    return '';
}

function sanitizeProposedTypeLabel(value, entryName = '') {
    const label = String(value ?? '').trim().replace(/[｜|丨\r\n]/gu, '').replace(/^【|】$/gu, '');
    if (!label || label.length > 12 || /[：:，,。.!！?？\/\\]/u.test(label)) return '';
    if ((0, util_1.normalizeFact)(label) === (0, util_1.normalizeFact)(entryName)) return '';
    return label;
}

function registerProposedMigrationType(schema, labelValue, sectionNames, description, entryName, diagnostics) {
    const label = sanitizeProposedTypeLabel(labelValue, entryName);
    if (!label) {
        diagnostics.warnings.push(`新类型建议“${String(labelValue ?? '').trim() || '空'}”不是稳定类别名称，已拒绝`);
        return null;
    }
    const overlap = findOverlappingMigrationType(label, schema);
    if (overlap) {
        diagnostics.warnings.push(`新类型建议“${label}”与已有类型“${overlap}”重叠，已归入已有类型`);
        return { type: overlap, created: false, overlapped: true };
    }
    const fields = (0, util_1.unique)((sectionNames ?? [])
        .map((name) => String(name ?? '').trim().replace(/[【】\r\n]/gu, ''))
        .filter((name) => name && !new Set(['内容', '角色认知', '关键词']).has(name) && !UNIVERSAL_METADATA_NAMES.has(name))
        .slice(0, 8));
    if (!fields.length) {
        diagnostics.warnings.push(`新类型建议“${label}”没有可验证栏目，已拒绝`);
        return null;
    }
    if (!fields.includes('别名')) fields.push('别名');
    const definition = {
        key: `model-${(0, util_1.safeId)(label) || label}`,
        label,
        description: String(description ?? '').trim() || `由世界书重建模型根据旧条目证据提出的${label}类型`,
        aliases: [label],
        fields: fields.map((field) => ({ label: field, policy: /(?:当前|状态|阶段|位置|归属|持有者)/u.test(field) ? 'replace-by-anchor' : 'semantic-upsert' })),
        enabled: true,
        constant: false,
        vectorized: true,
        preventRecursion: true,
        depth: 4,
        order: 700,
        inferred: true,
        modelProposed: true,
    };
    schema.definitions.set(label, definition);
    schema.aliasToType.set((0, util_1.normalizeFact)(label), label);
    schema.allowedSectionsByType[label] = new Set(fields);
    schema.customDefinitions.push(definition);
    diagnostics.warnings.push(`模型提出新类型“${label}”，已通过非重叠校验并加入本次重建预览`);
    return { type: label, created: true, overlapped: false };
}

function mergeProposedKeywordDefinitions(currentDefinitions = [], schema = buildMigrationSchema()) {
    const output = (0, util_1.clone)(Array.isArray(currentDefinitions) ? currentDefinitions : []);
    const existing = buildMigrationSchema(output);
    for (const definition of schema?.definitions?.values?.() ?? []) {
        if (definition?.modelProposed !== true) continue;
        if (findOverlappingMigrationType(definition.label, existing)) continue;
        const next = {
            key: definition.key || `model-${(0, util_1.safeId)(definition.label) || definition.label}`,
            label: definition.label,
            description: definition.description || '',
            aliases: (0, util_1.unique)(definition.aliases ?? [definition.label]),
            enabled: true,
            constant: definition.constant === true,
            vectorized: definition.vectorized !== false,
            preventRecursion: definition.preventRecursion !== false,
            depth: Number(definition.depth ?? 4),
            order: Number(definition.order ?? 700),
            fields: (definition.fields ?? []).map((field) => ({ label: field.label, prompt: '', policy: field.policy || 'semantic-upsert', options: [] })),
        };
        output.push(next);
        existing.definitions.set(next.label, next);
        for (const alias of next.aliases) existing.aliasToType.set((0, util_1.normalizeFact)(alias), next.label);
    }
    return output;
}

class MigrationService {
    constructor(host, worldbook, getSettings, onProgress = null, saveSettings = null) {
        this.host = host;
        this.worldbook = worldbook;
        this.getSettings = getSettings;
        this.onProgress = typeof onProgress === 'function' ? onProgress : () => {};
        this.saveSettings = typeof saveSettings === 'function' ? saveSettings : null;
        this.backup = null;
        this.preview = null;
        this.resume = null;
    }
    canUndo() { return Boolean(this.backup); }
    hasPreview() { return Boolean(this.preview); }
    previewSummary() { return this.preview ? (0, util_1.clone)(this.preview.summary) : null; }

    // [MA-REBUILD-01] “整理”改为只读扫描与 AI 重建预览。此步骤不写世界书。
    // [MA-REBUILD-05] 重建属于一次性迁移，允许受控多次请求：串行小批次、批次间隔、429退避和断点续跑。
    async migrate(settings, snapshot) {
        const validate = () => this.host.assertSnapshot(snapshot, this.getSettings());
        validate();
        const original = await this.worldbook.readRaw(settings, snapshot, validate);
        const initialSchema = buildMigrationSchema(settings?.keywordDefinitions);
        const records = collectRebuildRecords(original.data, initialSchema);
        const schema = buildMigrationSchema(settings?.keywordDefinitions, records);
        for (const record of records) annotateRecordSchema(record, schema);
        if (!records.length) {
            this.preview = null;
            this.resume = null;
            return { changed: false, previewReady: false, message: '当前世界书没有可重建的镜渊旧条目', candidates: 0 };
        }
        const fingerprint = rebuildFingerprint(original.name, records);
        const canResume = Boolean(this.resume
            && this.resume.chatKey === snapshot.chatKey
            && this.resume.worldbookName === original.name
            && this.resume.fingerprint === fingerprint);
        if (!canResume) {
            const sourceIndex = buildRebuildSourceIndex(records, schema);
            this.resume = {
                chatKey: snapshot.chatKey,
                worldbookName: original.name,
                fingerprint,
                sourceData: (0, util_1.clone)(original.data),
                records,
                schema,
                catalog: records.map((record) => `${record.uid}|${record.title}`).join('\n'),
                sourceIndex,
                planningComplete: false,
                plan: null,
                batches: [],
                totalBatchCount: 0,
                nextBatchIndex: 0,
                parsedBlocks: [],
                reviewComplete: false,
                requests: 0,
                retries: 0,
                lastRequestAt: 0,
                diagnostics: {
                    invalidLines: [],
                    warnings: ['重建将先建立场景锚点与游戏时间，再规划来源行的唯一宿主；同一来源行不会重复发送给多个对象'],
                    modelBatches: 0,
                    modelRequests: 0,
                    parserRepairs: 0,
                    compactedRecords: 0,
                    fragmentedRecords: 0,
                    semanticClusters: 0,
                    eventPasses: 0,
                    organizationPasses: 0,
                    customPasses: 0,
                    regionPasses: 0,
                    foundationPasses: 0,
                    sourceLines: sourceIndex.lines.length,
                },
            };
        }
        const state = this.resume;
        const knownUids = new Set(records.map((record) => record.uid));
        if (!state.planningComplete) {
            validate();
            this.emitProgress({
                state: 'running',
                current: 0,
                total: 1,
                requests: state.requests,
                retries: state.retries,
                detail: `正在规划${state.sourceIndex.lines.length}条旧事实的场景锚点、游戏时间、唯一宿主与事件边界`,
            });
            const prompt = (0, prompts_1.migrationPlanningPrompts)(state.sourceIndex.text, { schema: state.schema });
            let response;
            try {
                response = await this.requestBatch({
                    prompt,
                    batch: state.records,
                    settings,
                    snapshot,
                    validate,
                    state,
                    batchIndex: -1,
                    stage: 'migrationPlan',
                    sourceText: state.sourceIndex.text,
                    progressTotal: 1,
                });
            }
            catch (error) {
                this.emitProgress({ state: 'paused', current: 0, total: 1, requests: state.requests, retries: state.retries, detail: '全局重建规划请求未完成；下次点击将从规划阶段继续' });
                throw new Error(`世界书重建规划失败；尚未发送任何对象正文。${(0, util_1.errorText)(error)}`);
            }
            const plan = parseRebuildPlanningResponse(response, state.sourceIndex, state.schema);
            const groupTasks = buildPlannedRebuildTasks(plan, state.sourceIndex);
            const batches = packPlannedRebuildTasks(groupTasks);
            if (!batches.length) {
                this.resume = null;
                throw new Error('重建规划没有形成任何可处理对象；旧世界书未修改');
            }
            state.plan = plan;
            state.batches = batches;
            state.totalBatchCount = batches.length;
            state.planningComplete = true;
            state.diagnostics.warnings.push(...plan.warnings);
            state.diagnostics.modelBatches = batches.length + 1;
            state.diagnostics.semanticClusters = plan.groups.length;
            state.diagnostics.eventPasses = plan.groups.filter((group) => group.type === '事件').length;
            state.diagnostics.foundationPasses = plan.groups.filter((group) => group.type === '基础设定').length;
            state.diagnostics.customPasses = plan.groups.filter((group) => !ALLOWED_TYPES.has(group.type)).length;
            state.diagnostics.organizationPasses = plan.groups.filter((group) => (0, util_1.normalizeFact)(group.type) === (0, util_1.normalizeFact)('组织')).length;
            state.diagnostics.regionPasses = 0;
            state.diagnostics.planningGroups = plan.groups.length;
            state.diagnostics.sceneAnchors = plan.anchors?.length || 0;
            state.diagnostics.unknownGameTimeAnchors = (plan.anchors ?? []).filter((anchor) => anchor.gameTime === '未知').length;
            state.diagnostics.droppedSourceLines = plan.droppedRefs.length;
            state.diagnostics.fragmentedRecords = groupTasks.filter((batch) => Number(batch.fragmentCount || 1) > 1).length;
            state.diagnostics.jointBatches = batches.filter((batch) => batch.phase === 'planned-joint').length;
            this.emitProgress({ state: 'running', current: 0, total: batches.length, requests: state.requests, retries: state.retries, detail: `规划完成：${plan.groups.length}个候选，已按容量合并为${batches.length}次重建请求` });
        }
        for (; state.nextBatchIndex < state.batches.length;) {
            validate();
            const index = state.nextBatchIndex;
            const batch = state.batches[index];
            this.emitProgress({
                state: 'running',
                current: index + 1,
                total: state.batches.length,
                requests: state.requests,
                retries: state.retries,
                detail: `正在执行${migrationPhaseLabel(batch.phase)} ${index + 1}/${state.batches.length}：${batch.label || batch.clusterId || '未命名簇'}`,
            });
            const prompt = /^(?:planned|planned-joint)$/u.test(batch.phase)
                ? (0, prompts_1.plannedMigrationPrompts)(batch, { schema: state.schema })
                : (0, prompts_1.migrationPrompts)(batch, state.catalog, {
                    batchIndex: index + 1,
                    batchCount: state.batches.length,
                    totalRecords: records.length,
                    catalogBudget: MIGRATION_BATCH_CATALOG_BUDGET,
                    phase: batch.phase || 'entity',
                    clusterId: batch.clusterId || '',
                    stableName: batch.stableName || batch.label || '',
                    priorContext: buildPriorCandidateContext(state.parsedBlocks, batch),
                    schema: state.schema,
                });
            let response;
            try {
                response = await this.requestBatch({
                    prompt,
                    batch,
                    settings,
                    snapshot,
                    validate,
                    state,
                    batchIndex: index,
                    stage: 'migration',
                    sourceText: batch.sourceLineBody || batch.map((record) => record.content || '').join('\n'),
                });
            }
            catch (error) {
                this.emitProgress({
                    state: 'paused',
                    current: index,
                    total: state.batches.length,
                    requests: state.requests,
                    retries: state.retries,
                    detail: `已完成 ${index}/${state.batches.length} 批；下次从第 ${index + 1} 批继续`,
                });
                const reason = (0, util_1.errorText)(error);
                if (isMigrationRateLimitError(error)) {
                    throw new Error(`世界书重建被限流；已完成 ${index}/${state.batches.length} 批，下次点击将从第 ${index + 1} 批继续。${reason}`);
                }
                throw new Error(`世界书重建第 ${index + 1}/${state.batches.length} 批请求失败；已保存批次进度。${reason}`);
            }
            validate();
            try {
                const parsed = parseRebuildResponse(response, knownUids, state.diagnostics, rebuildParsePolicy(batch, records, state.schema));
                const preserved = preserveSparseRebuildBlocks(parsed, records, state.schema, state.diagnostics);
                if (!preserved.length) throw new Error('没有返回带旧UID证据的有效条目');
                const pendingSafe = preserveEventPendingFacts(preserved, records, state.diagnostics);
                // 保留生成阶段，最终全局收束时优先采用后续规则、地区与设定轮的归属判断。
                state.parsedBlocks.push(...pendingSafe.map((block) => ({ ...block, migrationPhase: batch.phase || 'entity', migrationOrder: index })));
            }
            catch (error) {
                // [MA-REBUILD-21] 模型格式或证据校验失败时，旧来源必须保持原状态。
                // 失败批次不得自动禁用、归档或改写；其他批次可继续重建。
                state.failedBatches ?? (state.failedBatches = []);
                state.failedBatches.push({ index, phase: batch.phase || 'entity', label: batch.label || batch.clusterId || '', reason: (0, util_1.errorText)(error) });
                state.diagnostics.warnings.push(`第 ${index + 1} 批未通过证据校验，已跳过；相关旧条目将在预览中原样保留`);
                state.nextBatchIndex += 1;
                this.emitProgress({
                    state: 'running',
                    current: state.nextBatchIndex,
                    total: state.batches.length,
                    requests: state.requests,
                    retries: state.retries,
                    detail: `第 ${index + 1} 批未通过校验，已释放并继续下一批`,
                });
                continue;
            }
            state.nextBatchIndex += 1;
            this.emitProgress({
                state: 'running',
                current: state.nextBatchIndex,
                total: state.batches.length,
                requests: state.requests,
                retries: state.retries,
                detail: `已完成 ${state.nextBatchIndex}/${state.batches.length} 批`,
            });
        }
        if ((state.failedBatches?.length || 0) > 0) {
            const failedLabels = state.failedBatches.slice(0, 8).map((item) => item.label || `第${item.index + 1}批`).join('、');
            state.diagnostics.warnings.push(`${state.failedBatches.length}个联合批次未通过模型格式或证据校验；这些批次涉及的旧条目将在预览中原样保留，不阻止其他结果提交${failedLabels ? `：${failedLabels}` : ''}`);
        }
        if (!state.parsedBlocks.length) {
            const failed = state.failedBatches?.length || 0;
            this.resume = null;
            this.preview = null;
            this.emitProgress({ state: 'failed', current: state.batches.length, total: state.batches.length, requests: state.requests, retries: state.retries, detail: '所有批次均未通过证据校验，已释放重建状态' });
            throw new Error(`模型没有返回可验证重建条目；${failed || state.batches.length}个批次已结束且重建状态已释放，旧表未修改。可重新生成预览，不会卡在原批次`);
        }
        let blocks = preserveEventPendingFacts(mergeRebuildBlocks(state.parsedBlocks, state.diagnostics), records, state.diagnostics);
        blocks = restoreUncoveredRebuildSourceLines(blocks, state.sourceIndex, state.plan?.droppedRefs ?? [], state.schema, state.diagnostics);
        const coverage = analyzeRebuildCoverage(records, blocks, state.schema, state.sourceIndex, state.plan?.droppedRefs ?? []);
        state.diagnostics.coverageEligible = coverage.eligibleCount;
        state.diagnostics.coverageCovered = coverage.coveredCount;
        state.diagnostics.coverageRatio = coverage.ratio;
        state.diagnostics.uncoveredEntries = coverage.uncovered.length;
        state.diagnostics.criticalUncoveredEntries = coverage.criticalUncovered.length;
        state.diagnostics.coverageEligibleLines = coverage.eligibleLineCount || 0;
        state.diagnostics.coverageCoveredLines = coverage.coveredLineCount || 0;
        state.diagnostics.uncoveredSourceLines = coverage.uncoveredLines?.length || 0;
        if (coverage.uncovered.length) {
            const critical = coverage.criticalUncovered.slice(0, 6).map((record) => record.title).join('、');
            state.diagnostics.warnings.push(`${coverage.uncovered.length}个旧条目未被可靠覆盖，将在预览中原样保留${critical ? `；其中关键条目：${critical}` : ''}`);
        }
        // 最终审核改为本地确定性校验：来源覆盖、重复宿主、身份冲突、场景边界与空壳已在解析和全局收束阶段完成。
        state.reviewComplete = true;
        state.diagnostics.reviewPassed = true;
        state.diagnostics.warnings.push('最终候选已完成本地结构校验；不再额外调用模型审核整表');
        const built = buildRebuildSnapshot(state.sourceData, records, blocks, state.diagnostics, state.schema, coverage.coveredUids);
        const summary = {
            previewReady: true,
            submitReady: true,
            worldbookName: original.name,
            candidates: records.length,
            batches: state.totalBatchCount || state.batches.length,
            requests: state.requests,
            retries: state.retries,
            compactedRecords: state.diagnostics.compactedRecords,
            fragmentedRecords: state.diagnostics.fragmentedRecords,
            semanticClusters: state.diagnostics.semanticClusters || 0,
            planningGroups: state.diagnostics.planningGroups || 0,
            sceneAnchors: state.diagnostics.sceneAnchors || 0,
            unknownGameTimeAnchors: state.diagnostics.unknownGameTimeAnchors || 0,
            sourceLines: state.diagnostics.sourceLines || 0,
            droppedSourceLines: state.diagnostics.droppedSourceLines || 0,
            reviewPassed: state.diagnostics.reviewPassed === true,
            eventPasses: state.diagnostics.eventPasses || 0,
            organizationPasses: state.diagnostics.organizationPasses || 0,
            customPasses: state.diagnostics.customPasses || 0,
            regionPasses: state.diagnostics.regionPasses || 0,
            foundationPasses: state.diagnostics.foundationPasses || 0,
            failedBatches: state.failedBatches?.length || 0,
            convergedEntries: Number(state.diagnostics.convergedEntries || 0),
            absorbedEntries: Number(state.diagnostics.absorbedEntries || 0),
            newTypes: [...state.schema.definitions.values()].filter((definition) => definition.modelProposed === true).map((definition) => definition.label),
            rebuildBatchId: built.rebuildBatchId,
            rebuiltEntries: built.rebuiltEntries,
            mergedOldEntries: built.mergedOldEntries,
            archivedEntries: built.archivedEntries,
            retainedOriginalEntries: built.retainedOriginalEntries || 0,
            preservedArchivedEntries: built.preservedArchivedEntries || 0,
            recoveredUi20Archives: built.recoveredUi20Archives || 0,
            coverageEligible: state.diagnostics.coverageEligible || 0,
            coverageCovered: state.diagnostics.coverageCovered || 0,
            coveragePercent: Math.round(Number(state.diagnostics.coverageRatio || 0) * 100),
            uncoveredEntries: state.diagnostics.uncoveredEntries || 0,
            criticalUncoveredEntries: state.diagnostics.criticalUncoveredEntries || 0,
            coverageEligibleLines: state.diagnostics.coverageEligibleLines || 0,
            coverageCoveredLines: state.diagnostics.coverageCoveredLines || 0,
            uncoveredSourceLines: state.diagnostics.uncoveredSourceLines || 0,
            knowledgeLines: built.knowledgeLines,
            deletedOldEntries: records.length - (built.retainedOriginalEntries || 0),
            preservedEntries: built.preservedEntries,
            warnings: state.diagnostics.warnings.slice(0, 12),
        };
        this.preview = {
            chatKey: snapshot.chatKey,
            worldbookName: original.name,
            sourceData: (0, util_1.clone)(state.sourceData),
            nextData: (0, util_1.clone)(built.data),
            summary,
            nextKeywordDefinitions: mergeProposedKeywordDefinitions(settings?.keywordDefinitions, state.schema),
        };
        this.resume = null;
        this.emitProgress({ state: 'success', current: summary.batches, total: summary.batches, requests: summary.requests, retries: summary.retries, detail: '联合批次处理完成，重建预览已生成；失败来源已原样保留' });
        return { changed: false, previewReady: true, ...summary };
    }

    async requestBatch({ prompt, batch, settings, snapshot, validate, state, batchIndex, stage = 'migration', sourceText = '', progressTotal = 0 }) {
        const retryLimit = migrationRateLimitRetries(settings);
        for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
            validate();
            const interval = migrationBatchIntervalMs(settings);
            const elapsed = Date.now() - Number(state.lastRequestAt || 0);
            if (state.lastRequestAt && elapsed < interval)
                await waitForMigration(interval - elapsed, validate, snapshot);
            try {
                state.requests += 1;
                state.diagnostics.modelRequests = state.requests;
                state.lastRequestAt = Date.now();
                return await (0, model_request_1.callModel)({
                    host: this.host,
                    stage,
                    prompt: { system: prompt.system, user: trimPrompt(prompt.user) },
                    fallbackPrompt: null,
                    settings,
                    snapshot,
                    profileId: settings.migrationProfileId,
                    sourceText: sourceText || batch.map((record) => record.content || '').join('\n'),
                });
            }
            catch (error) {
                if (!isMigrationRateLimitError(error) || attempt >= retryLimit) throw error;
                state.retries += 1;
                const waitMs = migrationRateLimitBackoffMs(settings, attempt);
                state.diagnostics.warnings.push(`第${batchIndex + 1}批触发限流，等待后进行第${attempt + 1}次重试`);
                this.emitProgress({
                    state: 'waiting',
                    current: batchIndex,
                    total: progressTotal || state.batches.length,
                    requests: state.requests,
                    retries: state.retries,
                    detail: `第 ${batchIndex + 1} 批限流，等待 ${Math.ceil(waitMs / 1000)} 秒后重试`,
                });
                await waitForMigration(waitMs, validate, snapshot);
            }
        }
        throw new Error('世界书重建请求未完成');
    }

    emitProgress(progress) {
        try { this.onProgress({ ...(progress || {}) }); }
        catch (error) { console.warn('[MirrorAbyss] migration progress callback failed', error); }
    }

    // [MA-REBUILD-02] 只有预览仍对应当前世界书时才原子提交；提交后重算召回并回读。
    async commit(settings, snapshot) {
        if (!this.preview) throw new Error('没有可提交的世界书重建预览');
        if (this.preview.chatKey !== snapshot.chatKey || this.preview.worldbookName !== snapshot.worldbookName)
            throw new Error('重建预览属于其他聊天或世界书，请重新生成预览');
        const validate = () => this.host.assertSnapshot(snapshot, this.getSettings());
        const preview = this.preview;
        validate();
        try {
            await this.worldbook.replaceRaw(settings, preview.worldbookName, preview.nextData, snapshot, validate, preview.sourceData);
            await this.worldbook.replanRecall(settings, snapshot, validate);
            const verified = await this.worldbook.readRaw(settings, snapshot, validate);
            verifyCommittedSnapshot(verified.data, preview.summary);
            const beforeKeywordDefinitions = (0, util_1.clone)(settings?.keywordDefinitions ?? []);
            const afterKeywordDefinitions = (0, util_1.clone)(preview.nextKeywordDefinitions ?? beforeKeywordDefinitions);
            if (this.saveSettings && JSON.stringify(beforeKeywordDefinitions) !== JSON.stringify(afterKeywordDefinitions)) {
                this.saveSettings({ keywordDefinitions: afterKeywordDefinitions });
            }
            this.backup = {
                chatKey: snapshot.chatKey,
                worldbookName: preview.worldbookName,
                data: (0, util_1.clone)(preview.sourceData),
                afterData: (0, util_1.clone)(verified.data),
                beforeKeywordDefinitions,
                afterKeywordDefinitions,
            };
            this.preview = null;
            return { changed: true, committed: true, ...preview.summary };
        }
        catch (error) {
            try {
                const current = await this.worldbook.readRaw(settings, snapshot, validate);
                await this.worldbook.replaceRaw(settings, preview.worldbookName, preview.sourceData, snapshot, validate, current.data);
            }
            catch (rollbackError) {
                this.preview = null;
                this.backup = null;
                throw new Error(`世界书重建失败且恢复旧表失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackError)}`);
            }
            this.preview = null;
            this.backup = null;
            throw error;
        }
    }

    async undo(settings, snapshot) {
        if (!this.backup) throw new Error('没有可撤销的上次世界书重建');
        if (this.backup.chatKey !== snapshot.chatKey || this.backup.worldbookName !== snapshot.worldbookName)
            throw new Error('上次重建属于其他聊天或世界书，不能在当前范围撤销');
        const validate = () => this.host.assertSnapshot(snapshot, this.getSettings());
        const backup = this.backup;
        await this.worldbook.replaceRaw(settings, backup.worldbookName, backup.data, snapshot, validate, backup.afterData);
        if (this.saveSettings && Array.isArray(backup.beforeKeywordDefinitions)) this.saveSettings({ keywordDefinitions: backup.beforeKeywordDefinitions });
        this.backup = null;
        this.preview = null;
        this.resume = null;
        return { changed: true, restored: true };
    }
}
exports.MigrationService = MigrationService;

function buildRebuildBatches(records, bodyBudget = MIGRATION_CLUSTER_BODY_BUDGET, maxRecords = MIGRATION_BATCH_MAX_RECORDS) {
    const clusters = buildSemanticClusters(records);
    const batches = [];
    let currentClusters = [];
    let currentRecords = [];
    let currentSize = 0;
    const flush = () => {
        if (!currentRecords.length) return;
        const ids = currentClusters.map((cluster) => cluster.id);
        const labels = currentClusters.map((cluster) => cluster.name);
        batches.push(createMigrationTask('entity', ids.join(','), labels.length === 1 ? labels[0] : `${labels[0]}等${labels.length}个对象`, currentRecords, bodyBudget));
        currentClusters = [];
        currentRecords = [];
        currentSize = 0;
    };
    for (const cluster of clusters) {
        const tagged = cluster.records.map((record) => ({ ...record, semanticClusterId: cluster.id, semanticClusterName: cluster.name }));
        const clusterSize = tagged.reduce((sum, record) => sum + serializeRecord(record).length, 0);
        const wouldExceed = currentRecords.length && (currentRecords.length + tagged.length > maxRecords || currentSize + clusterSize > bodyBudget);
        if (wouldExceed) flush();
        currentClusters.push(cluster);
        currentRecords.push(...tagged);
        currentSize += clusterSize;
        if (tagged.length > maxRecords || clusterSize > bodyBudget) flush();
    }
    flush();
    const compactedRecords = batches.reduce((sum, batch) => sum + Number(batch.compactedRecords || 0), 0);
    const warnings = [];
    if (clusters.length) warnings.push(`旧条目已按对象身份归为${clusters.length}个语义簇；语义簇不会跨请求拆分`);
    if (batches.length < clusters.length) warnings.push(`多个小语义簇已安全合批为${batches.length}次对象请求，簇标记仍独立`);
    if (compactedRecords) warnings.push(`${compactedRecords}个来源正文已按簇内公平预算压缩，但UID、标题和首尾事实均保留`);
    return { batches, compactedRecords, fragmentedRecords: 0, warnings, semanticClusters: clusters.length };
}

function buildRebuildPlan(records, schema = buildMigrationSchema()) {
    const source = Array.isArray(records) ? records : [];
    for (const record of source) annotateRecordSchema(record, schema);
    // 世界与基础设定不再同时进入普通对象轮、地区轮和规则轮，避免同一来源被多角度重复建档。
    const builtinEntityTypes = new Set(['人物', '场景', '物品']);
    // 自定义表不在普通对象轮定型，统一进入扩展类型轮，确保使用其自身栏目与规则。
    const entity = buildRebuildBatches(source.filter((record) => builtinEntityTypes.has(recordType(record, schema))));
    const eventTasks = buildEventSynthesisTasks(source);
    const extendedTasks = buildExtendedSynthesisTasks(source, schema);
    const worldTasks = buildWorldSynthesisTasks(source);
    const regionTasks = worldTasks.length ? [] : buildRegionalSynthesisTasks(source);
    const foundationTasks = buildFoundationSynthesisTasks(source);
    const tasks = [...entity.batches, ...eventTasks, ...extendedTasks, ...worldTasks, ...regionTasks, ...foundationTasks];
    const compactedRecords = tasks.reduce((sum, task) => sum + Number(task.compactedRecords || 0), 0);
    const organizationPasses = extendedTasks.filter((task) => task.extensionKind === 'organization').length;
    const customPasses = extendedTasks.length;
    const warnings = [
        ...entity.warnings,
        eventTasks.length ? `事件轮将对${eventTasks.length}个事件生命周期独立重建` : '',
        customPasses ? `扩展类型轮将按当前表定义重建${customPasses}个组织或自定义实体簇` : '',
        worldTasks.length ? `世界轮将对现有世界条目进行一次全局收束，避免组织、地区与局势重复建档` : '',
        regionTasks.length ? `地区轮将对${regionTasks.length}个地区证据簇提炼局部规则` : '',
        foundationTasks.length ? `基础设定轮将按${foundationTasks.length}个规则主题提出候选` : '',
        '事件、扩展类型、地区和基础设定均必须引用当前任务来源UID；超出当前任务的目录UID不能充当证据',
    ].filter(Boolean);
    return {
        tasks,
        compactedRecords,
        warnings,
        semanticClusters: entity.semanticClusters,
        eventPasses: eventTasks.length,
        organizationPasses,
        customPasses,
        worldPasses: worldTasks.length,
        regionPasses: regionTasks.length,
        foundationPasses: foundationTasks.length,
    };
}

// [MA-REBUILD-11] 建立仅存在于本次重建内存中的来源行索引。
// 规划模型看到的是完整条目目录和每条事实的短预览；后续单组请求再使用该行的完整文本。
function buildRebuildSourceIndex(records, schema = buildMigrationSchema()) {
    const lines = [];
    const entries = [];
    const lineByRef = new Map();
    const source = Array.isArray(records) ? records : [];
    let order = 0;
    for (const record of source) {
        const restoredTitle = archivedSourceTitle(record) || (0, util_1.normalizeTitle)(record.title);
        const restoredSplit = (0, util_1.splitTitle)(restoredTitle);
        const type = resolveMigrationType(restoredSplit?.type || recordType(record, schema), schema);
        const name = restoredSplit?.name || record.name || record.title;
        const parsed = (0, parser_1.parseEntrySections)(record.content || '');
        const existingSpacetime = readExistingRebuildSpacetime(record, parsed);
        const entry = {
            uid: String(record.uid),
            type,
            name,
            title: `${type}｜${name}`,
            keywords: (0, util_1.unique)((record.keywords ?? []).filter(isMeaningfulRebuildKeyword)).slice(0, 6),
            refs: [],
            empty: true,
            existingSpacetime,
        };
        const sectionOrder = parsed.order?.length ? parsed.order : ['旧格式正文'];
        const rawFallback = parsed.order?.length
            ? null
            : String(record.content ?? '').replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
        for (let sectionIndex = 0; sectionIndex < sectionOrder.length; sectionIndex += 1) {
            const section = sectionOrder[sectionIndex];
            // 【时空锚点】不作为剧情事实重复送入模型；旧锚点只以规划元数据提示复用。
            if (section === REBUILD_SPACETIME_SECTION) continue;
            const values = rawFallback ?? (parsed.values?.[section] ?? []);
            let lineIndex = 0;
            for (const rawLine of values) {
                const text = (0, parser_1.normalizePointLine)(String(rawLine ?? '').trim());
                if (!text || /^【\s*[^】]+\s*】$/u.test(text)) continue;
                const ref = `${record.uid}:s${sectionIndex}:l${lineIndex}`;
                lineIndex += 1;
                const item = {
                    ref,
                    uid: String(record.uid),
                    type,
                    name,
                    title: entry.title,
                    section,
                    text,
                    order: order++,
                    priorSceneAnchors: [...existingSpacetime.sceneAnchors],
                    priorGameTime: existingSpacetime.gameTime,
                    priorTimeSource: existingSpacetime.timeSource,
                    priorLocation: existingSpacetime.location,
                    priorTemporalState: existingSpacetime.temporalState,
                };
                lines.push(item);
                lineByRef.set(ref, item);
                entry.refs.push(ref);
                entry.empty = false;
            }
        }
        entries.push(entry);
    }
    const text = entries.map((entry) => {
        const prior = entry.existingSpacetime;
        const priorText = prior.sceneAnchors.length
            ? `|已有时空:${prior.sceneAnchors.join('、')}@${prior.gameTime}@${prior.location}[${prior.timeSource};${prior.temporalState}]`
            : '';
        const header = `ENTRY|${entry.uid}|${entry.type}|${entry.name}|关键词:${entry.keywords.join('、') || '无'}${priorText}`;
        if (!entry.refs.length) return `${header}\nEMPTY|${entry.uid}`;
        const body = entry.refs.map((ref) => {
            const item = lineByRef.get(ref);
            return `${item.ref}|${item.section}|${clipPlanningLine(item.text, MIGRATION_PLAN_LINE_PREVIEW)}`;
        }).join('\n');
        return `${header}\n${body}`;
    }).join('\n\n');
    return { text, lines, entries, lineByRef, refs: new Set(lines.map((line) => line.ref)) };
}


function readExistingRebuildSpacetime(record, parsed) {
    const extension = record?.raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY] ?? {};
    const metadataLines = parsed?.values?.[REBUILD_SPACETIME_SECTION] ?? [];
    const metadata = new Map(metadataLines.map((line) => {
        const match = String(line ?? '').match(/^([^：:]{1,24})\s*[：:]\s*(.*)$/u);
        return match ? [match[1].trim(), match[2].trim()] : ['', ''];
    }).filter(([key]) => key));
    const sceneAnchors = (0, util_1.unique)([
        ...(0, util_1.normalizeStringArray)(extension.sceneAnchors),
        ...parseSceneAnchorList(metadata.get('场景锚点') || ''),
    ]).filter((anchor) => /^S\d{3,6}$/u.test(String(anchor)));
    return {
        sceneAnchors,
        gameTime: normalizeRebuildGameTime(extension.gameTime || metadata.get('游戏时间')),
        timeSource: normalizeRebuildTimeSource(extension.timeSource || metadata.get('时间来源')),
        location: String(extension.anchorLocation || metadata.get('地点') || '未知').trim() || '未知',
        temporalState: normalizeRebuildTemporalState(extension.temporalState || metadata.get('时态'), record?.type),
    };
}

function clipPlanningLine(value, maxChars) {
    const text = String(value ?? '').replace(/\s+/gu, ' ').trim();
    if (text.length <= maxChars) return text;
    return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function parseRebuildPlanningResponse(raw, sourceIndex, schema = buildMigrationSchema()) {
    const knownRefs = sourceIndex?.refs instanceof Set ? sourceIndex.refs : new Set();
    const assigned = new Set();
    const groups = [];
    const rawAnchors = [];
    const droppedRefs = new Set();
    const warnings = [];
    const text = String(raw ?? '').replace(/```(?:text|markdown|md)?/giu, '').replace(/\r/g, '').trim();
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        const parts = line.split('|').map((part) => part.trim());
        if (parts[0] === 'ANCHOR' && parts.length >= 6) {
            const id = parts[1] || `A${rawAnchors.length + 1}`;
            const gameTime = normalizeRebuildGameTime(parts[2]);
            const location = String(parts[3] || '未知').trim() || '未知';
            const timeSource = normalizeRebuildTimeSource(parts[4]);
            const refs = parsePlanningRefs(parts.slice(5).join('|')).filter((ref) => {
                if (!knownRefs.has(ref)) {
                    warnings.push(`场景锚点${id}引用了不存在的来源行${ref}，已忽略`);
                    return false;
                }
                return true;
            });
            if (refs.length) rawAnchors.push({ id, gameTime, location, timeSource, refs, modelOrder: rawAnchors.length });
            continue;
        }
        if (parts[0] === 'GROUP' && parts.length >= 6) {
            const id = parts[1] || `G${groups.length + 1}`;
            const rawType = String(parts[2] || '').trim();
            const proposalMatch = rawType.match(/^新类型建议\s*[：:]\s*(.+)$/u);
            const type = proposalMatch ? String(proposalMatch[1]).trim() : resolveMigrationType(rawType, schema);
            const name = parts[3];
            const mode = parts[4] === '并入' ? 'merge' : 'independent';
            if ((!proposalMatch && !schema?.definitions?.has(type)) || !type || !name) {
                warnings.push(`规划组${id}的类型或名称无效，已忽略`);
                continue;
            }
            const refs = parsePlanningRefs(parts.slice(5).join('|')).filter((ref) => {
                if (!knownRefs.has(ref)) {
                    warnings.push(`规划引用了不存在的来源行${ref}，已忽略`);
                    return false;
                }
                if (assigned.has(ref)) {
                    warnings.push(`来源行${ref}被重复分配，已保留首次归属`);
                    return false;
                }
                assigned.add(ref);
                return true;
            });
            if (refs.length) groups.push({ id, type, name, mode, refs, newTypeProposal: Boolean(proposalMatch) });
            continue;
        }
        if (parts[0] === 'DROP' && parts.length >= 3) {
            for (const ref of parsePlanningRefs(parts.slice(2).join('|'))) {
                if (!knownRefs.has(ref) || assigned.has(ref)) continue;
                assigned.add(ref);
                droppedRefs.add(ref);
            }
            continue;
        }
        warnings.push(`无法识别的规划行已忽略：${line.slice(0, 100)}`);
    }
    // 模型漏掉的来源行不复制到多个批次，而是按原条目建立单一待复核组，确保不丢失且仍只发送一次。
    const missingByEntry = new Map();
    for (const item of sourceIndex?.lines ?? []) {
        if (assigned.has(item.ref)) continue;
        const key = `${item.uid}|${item.type}|${item.name}`;
        const current = missingByEntry.get(key) ?? { id: `F${missingByEntry.size + 1}`, type: item.type, name: item.name, mode: 'independent', refs: [] };
        current.refs.push(item.ref);
        missingByEntry.set(key, current);
        assigned.add(item.ref);
    }
    if (missingByEntry.size) warnings.push(`规划模型遗漏${[...missingByEntry.values()].reduce((sum, group) => sum + group.refs.length, 0)}条来源行，已按原宿主建立单一待复核组`);
    groups.push(...missingByEntry.values());
    const converged = [];
    const byIdentity = new Map();
    for (const group of groups) {
        const key = `${group.type}|${(0, util_1.normalizeFact)(group.name)}|${group.mode}`;
        const existing = byIdentity.get(key);
        if (existing) existing.refs.push(...group.refs);
        else {
            const next = { ...group, refs: [...group.refs] };
            byIdentity.set(key, next);
            converged.push(next);
        }
    }
    const sortedGroups = converged.map((group) => ({ ...group, refs: (0, util_1.unique)(group.refs).sort((a, b) => (sourceIndex.lineByRef.get(a)?.order ?? 0) - (sourceIndex.lineByRef.get(b)?.order ?? 0)) }));
    const anchorResult = canonicalizeRebuildAnchors(rawAnchors, sortedGroups, sourceIndex, warnings);
    const anchorOrder = new Map((anchorResult.anchors ?? []).map((anchor, index) => [anchor.id, index]));
    const anchoredGroups = sortedGroups.map((group) => ({
        ...group,
        sceneAnchors: (0, util_1.unique)((group.refs ?? []).map((ref) => anchorResult.anchorByRef.get(ref)).filter(Boolean))
            .sort((left, right) => Number(anchorOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - Number(anchorOrder.get(right) ?? Number.MAX_SAFE_INTEGER)),
    }));
    return {
        groups: anchoredGroups,
        anchors: anchorResult.anchors,
        anchorByRef: anchorResult.anchorByRef,
        droppedRefs: [...droppedRefs],
        warnings,
        totalRefs: knownRefs.size,
        assignedRefs: assigned.size,
    };
}

function parsePlanningRefs(value) {
    return (0, util_1.unique)(String(value ?? '').split(/[,，、\s]+/u).map((item) => item.trim()).filter((item) => /^.+:s\d+:l\d+$/u.test(item)));
}

function canonicalizeRebuildAnchors(rawAnchors, groups, sourceIndex, warnings) {
    const byRef = new Map();
    const candidates = [];
    for (const anchor of rawAnchors ?? []) {
        const refs = [];
        for (const ref of anchor.refs ?? []) {
            if (byRef.has(ref)) {
                warnings.push(`来源行${ref}被重复分配到多个场景锚点，已保留首次归属`);
                continue;
            }
            byRef.set(ref, anchor.id);
            refs.push(ref);
        }
        if (refs.length) candidates.push({ ...anchor, refs });
    }
    let fallbackCount = 0;
    for (const group of groups ?? []) {
        const missing = (group.refs ?? []).filter((ref) => !byRef.has(ref));
        if (!missing.length) continue;
        fallbackCount += missing.length;
        const buckets = new Map();
        for (const ref of missing) {
            const item = sourceIndex?.lineByRef?.get(ref);
            const prior = (item?.priorSceneAnchors ?? []).length === 1 ? item.priorSceneAnchors[0] : '';
            const key = prior || `AUTO-${group.id}`;
            const current = buckets.get(key) ?? [];
            current.push(ref);
            buckets.set(key, current);
        }
        for (const [key, refs] of buckets.entries()) {
            const priorItems = refs.map((ref) => sourceIndex?.lineByRef?.get(ref)).filter(Boolean);
            const gameTimes = (0, util_1.unique)(priorItems.map((item) => normalizeRebuildGameTime(item.priorGameTime)).filter((value) => value !== '未知'));
            const locations = (0, util_1.unique)(priorItems.map((item) => String(item.priorLocation || '').trim()).filter((value) => value && value !== '未知'));
            const timeSources = priorItems.map((item) => normalizeRebuildTimeSource(item.priorTimeSource));
            const id = /^S\d{3,6}$/u.test(key) ? `EXIST-${key}` : key;
            const fallback = {
                id,
                preferredSceneAnchor: /^S\d{3,6}$/u.test(key) ? key : '',
                gameTime: gameTimes.length === 1 ? gameTimes[0] : '未知',
                location: locations.length === 1 ? locations[0] : (group.type === '场景' ? group.name : '未知'),
                timeSource: gameTimes.length === 1 ? (timeSources.includes('未知') ? '未知' : timeSources.includes('推定') ? '推定' : '明确') : '未知',
                refs,
                modelOrder: (rawAnchors?.length ?? 0) + candidates.length,
            };
            candidates.push(fallback);
            for (const ref of refs) byRef.set(ref, id);
        }
    }
    if (fallbackCount) warnings.push(`规划模型未给${fallbackCount}条来源事实分配游戏时间或地点，已建立“时间未知”的场景锚点，未虚构日期`);
    const merged = [];
    const mergeByKey = new Map();
    for (const anchor of candidates) {
        // 相同地点和时段仍可能存在多个连续事件段；只有规划器明确复用同一锚点ID时才合并。
        const key = String(anchor.id);
        const existing = mergeByKey.get(key);
        if (existing) {
            existing.refs.push(...anchor.refs);
            existing.modelOrder = Math.min(Number(existing.modelOrder ?? Number.MAX_SAFE_INTEGER), Number(anchor.modelOrder ?? Number.MAX_SAFE_INTEGER));
        }
        else {
            const next = { ...anchor, refs: [...anchor.refs] };
            mergeByKey.set(key, next);
            merged.push(next);
        }
    }
    const validated = merged.map((anchor) => ({
        ...anchor,
        preferredSceneAnchor: preferredExistingSceneAnchor(anchor, sourceIndex),
        ...validateRebuildAnchorTime(anchor, anchor.refs, sourceIndex, warnings),
        location: validateRebuildAnchorLocation(anchor, anchor.refs, sourceIndex, warnings),
    }));
    validated.sort((left, right) => compareRebuildGameTime(left.gameTime, right.gameTime)
        || Number(left.modelOrder ?? Number.MAX_SAFE_INTEGER) - Number(right.modelOrder ?? Number.MAX_SAFE_INTEGER)
        || Math.min(...left.refs.map((ref) => sourceIndex?.lineByRef?.get(ref)?.order ?? Number.MAX_SAFE_INTEGER)) - Math.min(...right.refs.map((ref) => sourceIndex?.lineByRef?.get(ref)?.order ?? Number.MAX_SAFE_INTEGER))
        || String(left.id).localeCompare(String(right.id), 'zh-CN', { numeric: true }));
    const existingIds = new Set((sourceIndex?.lines ?? []).flatMap((item) => item.priorSceneAnchors ?? []).filter((anchor) => /^S\d{3,6}$/u.test(String(anchor))));
    let nextAnchorNumber = Math.max(0, ...[...existingIds].map((anchor) => Number(String(anchor).slice(1)) || 0)) + 1;
    const claimedIds = new Set();
    const anchorByRef = new Map();
    const anchors = validated.map((anchor, index) => {
        let sceneAnchor = String(anchor.preferredSceneAnchor || '');
        if (!/^S\d{3,6}$/u.test(sceneAnchor) || claimedIds.has(sceneAnchor)) sceneAnchor = '';
        if (!sceneAnchor) {
            if (!existingIds.size) sceneAnchor = `S${String(index + 1).padStart(3, '0')}`;
            else {
                while (existingIds.has(`S${String(nextAnchorNumber).padStart(3, '0')}`) || claimedIds.has(`S${String(nextAnchorNumber).padStart(3, '0')}`)) nextAnchorNumber += 1;
                sceneAnchor = `S${String(nextAnchorNumber).padStart(3, '0')}`;
                nextAnchorNumber += 1;
            }
        }
        claimedIds.add(sceneAnchor);
        const refs = (0, util_1.unique)(anchor.refs).sort((a, b) => (sourceIndex?.lineByRef?.get(a)?.order ?? 0) - (sourceIndex?.lineByRef?.get(b)?.order ?? 0));
        for (const ref of refs) anchorByRef.set(ref, sceneAnchor);
        return {
            id: sceneAnchor,
            modelId: anchor.id,
            gameTime: anchor.gameTime,
            location: String(anchor.location || '未知').trim() || '未知',
            timeSource: anchor.timeSource,
            refs,
        };
    });
    return { anchors, anchorByRef };
}


function preferredExistingSceneAnchor(anchor, sourceIndex) {
    if (/^S\d{3,6}$/u.test(String(anchor?.preferredSceneAnchor || ''))) return String(anchor.preferredSceneAnchor);
    const perRef = (anchor?.refs ?? []).map((ref) => {
        const anchors = sourceIndex?.lineByRef?.get(ref)?.priorSceneAnchors ?? [];
        return anchors.length === 1 ? anchors[0] : '';
    });
    if (!perRef.length || perRef.some((value) => !value)) return '';
    const unique = (0, util_1.unique)(perRef);
    return unique.length === 1 && /^S\d{3,6}$/u.test(unique[0]) ? unique[0] : '';
}

function validateRebuildAnchorTime(anchor, refs, sourceIndex, warnings) {
    let gameTime = normalizeRebuildGameTime(anchor?.gameTime);
    let timeSource = normalizeRebuildTimeSource(anchor?.timeSource);
    if (gameTime === '未知') return { gameTime, timeSource: '未知' };
    const evidence = (refs ?? []).map((ref) => {
        const item = sourceIndex?.lineByRef?.get(ref);
        return item ? `${item.title}\n${item.section}\n${item.text}\n${item.priorGameTime || ''}` : '';
    }).join('\n');
    const temporalMarker = /(?:第\s*\d+\s*天|\d{4}\s*年|\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|凌晨|黎明|清晨|早晨|上午|中午|下午|傍晚|晚上|夜晚|深夜|当晚|次日|翌日|第二天|几天后|数日后|周后|月后|年后|小时后|分钟后|此前|后来|随后)/u.test(evidence);
    if (!temporalMarker) {
        warnings.push(`场景锚点${anchor.id}缺少可验证的游戏时间线索，模型给出的“${gameTime}”已降级为未知`);
        return { gameTime: '未知', timeSource: '未知' };
    }
    if (timeSource === '明确' && !rebuildExplicitTimeMatches(gameTime, evidence)) {
        timeSource = '推定';
        warnings.push(`场景锚点${anchor.id}的游戏时间只能由相对时间或上下文推出，已从“明确”降级为“推定”`);
    }
    return { gameTime, timeSource };
}

function rebuildExplicitTimeMatches(gameTime, evidence) {
    const time = String(gameTime ?? '');
    const source = String(evidence ?? '');
    const day = time.match(/第\s*(\d+)\s*天/u)?.[1];
    if (day && !new RegExp(`第\\s*${day}\\s*天`, 'u').test(source)) return false;
    const date = time.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/u);
    if (date && !new RegExp(`${date[1]}\\D+${Number(date[2])}\\D+${Number(date[3])}`, 'u').test(source)) return false;
    const dayparts = ['凌晨', '黎明', '清晨', '早晨', '上午', '中午', '下午', '傍晚', '晚上', '夜晚', '深夜'];
    const named = dayparts.find((part) => time.includes(part));
    if (named && !source.includes(named)) return false;
    return Boolean(day || date || named || source.includes(time));
}


function validateRebuildAnchorLocation(anchor, refs, sourceIndex, warnings) {
    const location = String(anchor?.location || '未知').trim() || '未知';
    if (location === '未知') return '未知';
    const evidence = (refs ?? []).map((ref) => {
        const item = sourceIndex?.lineByRef?.get(ref);
        return item ? `${item.title}\n${item.section}\n${item.text}\n${item.priorLocation || ''}` : '';
    }).join('\n');
    const normalizedLocation = normalizeRebuildLocationEvidence(location);
    const normalizedEvidence = normalizeRebuildLocationEvidence(evidence);
    const roomTokens = location.match(/(?:[A-Za-z]?\d{2,6}(?:号|室|房)?)/gu) ?? [];
    const roomMatched = roomTokens.some((token) => evidence.includes(token));
    const directMatched = normalizedLocation.length >= 2 && normalizedEvidence.length >= 2
        && (normalizedEvidence.includes(normalizedLocation) || normalizedLocation.includes(normalizedEvidence));
    if (directMatched || roomMatched) return location;
    warnings.push(`场景锚点${anchor.id}缺少可验证的地点线索，模型给出的“${location}”已降级为未知`);
    return '未知';
}

function normalizeRebuildLocationEvidence(value) {
    return (0, util_1.normalizeFact)(String(value ?? ''))
        .replace(/(?:发生地点|当前地点|所在地|场景|地点|位置)/gu, '')
        .replace(/(?:内部|内|外部|外)$/gu, '');
}

function compareRebuildGameTime(leftValue, rightValue) {
    const left = parseComparableRebuildGameTime(leftValue);
    const right = parseComparableRebuildGameTime(rightValue);
    if (!left || !right || left.kind !== right.kind) return 0;
    return left.value - right.value;
}

function parseComparableRebuildGameTime(value) {
    const text = String(value ?? '').trim();
    let match = text.match(/第\s*(\d{1,6})\s*天/u);
    if (match) return { kind: 'relative-day', value: Number(match[1]) * 10 + rebuildDaypartOrder(text) };
    match = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/u) || text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/u);
    if (match) return { kind: 'date', value: Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000 + rebuildDaypartOrder(text) / 10 };
    return null;
}

function rebuildDaypartOrder(value) {
    const text = String(value ?? '');
    if (/(?:凌晨|黎明)/u.test(text)) return 0;
    if (/(?:清晨|早晨|上午)/u.test(text)) return 1;
    if (/(?:中午|午间)/u.test(text)) return 2;
    if (/(?:下午|傍晚)/u.test(text)) return 3;
    if (/(?:晚上|夜晚|深夜|当晚)/u.test(text)) return 4;
    return 5;
}

function normalizeRebuildGameTime(value) {
    const text = String(value ?? '').replace(/\s+/gu, ' ').trim();
    if (!text || /^(?:无|不明|未知时间|无法确定)$/u.test(text)) return '未知';
    return text.slice(0, 80);
}

function normalizeRebuildTimeSource(value) {
    const text = String(value ?? '').trim();
    return TIME_SOURCES.has(text) ? text : '未知';
}

function normalizeRebuildTemporalState(value, type = '') {
    const text = String(value ?? '').trim();
    if (TEMPORAL_STATES.has(text)) return text;
    if (type === '事件') return '已完成';
    if (type === '基础设定') return '长期';
    return '当前';
}

function buildPlannedRebuildTasks(plan, sourceIndex, bodyBudget = MIGRATION_PLANNED_GROUP_BUDGET) {
    const tasks = [];
    for (const group of plan?.groups ?? []) {
        const chunks = [];
        let current = [];
        let size = 0;
        for (const ref of group.refs ?? []) {
            const item = sourceIndex?.lineByRef?.get(ref);
            if (!item) continue;
            const lineSize = item.text.length + item.section.length + item.ref.length + 12;
            if (current.length && size + lineSize > bodyBudget) {
                chunks.push(current);
                current = [];
                size = 0;
            }
            current.push(item);
            size += lineSize;
        }
        if (current.length) chunks.push(current);
        for (let index = 0; index < chunks.length; index += 1) {
            const chunk = chunks[index];
            const byUid = new Map();
            for (const item of chunk) {
                const currentRecord = byUid.get(item.uid) ?? {
                    uid: item.uid,
                    title: item.title,
                    type: item.type,
                    name: item.name,
                    keywords: [],
                    content: '',
                };
                currentRecord.content += `${currentRecord.content ? '\n' : ''}[${item.ref}][${item.section}] ${item.text}`;
                byUid.set(item.uid, currentRecord);
            }
            const task = [...byUid.values()];
            task.phase = 'planned';
            task.clusterId = `planned:${group.id}`;
            task.label = `${group.type}｜${group.name}`;
            task.stableName = group.name;
            task.outputType = group.type;
            task.newTypeProposal = group.newTypeProposal === true;
            task.retentionMode = group.mode;
            task.planGroupId = group.id;
            task.fragmentIndex = index + 1;
            task.fragmentCount = chunks.length;
            task.sourceRefs = chunk.map((item) => item.ref);
            task.allowedSourceRefs = new Set(task.sourceRefs);
            task.sourceLineByRef = new Map(chunk.map((item) => [item.ref, item]));
            task.sceneAnchors = (0, util_1.unique)(task.sourceRefs.map((ref) => plan?.anchorByRef?.get(ref)).filter(Boolean));
            task.anchorCatalog = (plan?.anchors ?? []).filter((anchor) => task.sceneAnchors.includes(anchor.id));
            task.sourceLineBody = formatPlannedSourceLines(chunk);
            task.compactedRecords = 0;
            tasks.push(task);
        }
    }
    return tasks;
}


function packPlannedRebuildTasks(tasks, bodyBudget = MIGRATION_PLANNED_JOINT_BUDGET, maxGroups = MIGRATION_PLANNED_JOINT_MAX_GROUPS) {
    const output = [];
    let current = [];
    let size = 0;
    const flush = () => {
        if (!current.length) return;
        if (current.length === 1) {
            output.push(current[0]);
            current = [];
            size = 0;
            return;
        }
        const records = [...new Map(current.flatMap((task) => [...task]).map((record) => [String(record.uid), record])).values()];
        const batch = records;
        batch.phase = 'planned-joint';
        batch.clusterId = `joint:${current.map((task) => task.planGroupId).join('+')}`;
        batch.label = current.map((task) => task.label).join('、');
        batch.stableName = '';
        batch.outputTypes = (0, util_1.unique)(current.map((task) => task.outputType));
        batch.newTypeProposal = current.some((task) => task.newTypeProposal === true);
        batch.jointGroups = current.map((task) => ({
            id: task.planGroupId,
            type: task.outputType,
            name: task.stableName,
            newTypeProposal: task.newTypeProposal === true,
            sourceRefs: [...(task.sourceRefs ?? [])],
            sceneAnchors: [...(task.sceneAnchors ?? [])],
            anchorCatalog: (0, util_1.clone)(task.anchorCatalog ?? []),
            sourceLineBody: task.sourceLineBody,
        }));
        batch.sourceRefs = (0, util_1.unique)(current.flatMap((task) => task.sourceRefs ?? []));
        batch.allowedSourceRefs = new Set(batch.sourceRefs);
        batch.sourceLineByRef = new Map(current.flatMap((task) => [...(task.sourceLineByRef ?? new Map()).entries()]));
        batch.sceneAnchors = (0, util_1.unique)(current.flatMap((task) => task.sceneAnchors ?? []));
        batch.anchorCatalog = [...new Map(current.flatMap((task) => task.anchorCatalog ?? []).map((anchor) => [anchor.id, (0, util_1.clone)(anchor)])).values()];
        batch.sourceLineBody = current.map((task) => `===GROUP ${task.planGroupId}|${task.outputType}|${task.stableName}===\n${task.sourceLineBody}`).join('\n\n');
        batch.compactedRecords = current.reduce((sum, task) => sum + Number(task.compactedRecords || 0), 0);
        output.push(batch);
        current = [];
        size = 0;
    };
    for (const task of tasks ?? []) {
        const taskSize = String(task.sourceLineBody || '').length + 300;
        const fragmented = Number(task.fragmentCount || 1) > 1;
        if (fragmented || taskSize > bodyBudget * 0.72) {
            flush();
            output.push(task);
            continue;
        }
        if (current.length && (current.length >= maxGroups || size + taskSize > bodyBudget)) flush();
        current.push(task);
        size += taskSize;
    }
    flush();
    return output;
}

function formatPlannedSourceLines(lines) {
    const groups = new Map();
    for (const item of lines ?? []) {
        const current = groups.get(item.uid) ?? { title: item.title, lines: [] };
        current.lines.push(`[${item.ref}][${item.section}] ${item.text}`);
        groups.set(item.uid, current);
    }
    return [...groups.entries()].map(([uid, group]) => `<<<SOURCE uid=${uid}>>>\n标题：${group.title}\n${group.lines.join('\n')}\n<<<END_SOURCE>>>`).join('\n\n');
}

function buildRebuildReviewCatalog(blocks, sourceIndex = null, maxChars = 22000, coverage = null) {
    const pieces = [];
    if (coverage) {
        const uncovered = coverage.uncovered.slice(0, 20).map((record) => record.title).join('、') || '无';
        pieces.push(`COVERAGE|${coverage.coveredCount}/${coverage.eligibleCount}|未覆盖:${uncovered}`);
    }
    for (const block of blocks ?? []) {
        const refs = (block.sourceRefs ?? []).join(',');
        const header = `ENTRY|${block.type}｜${block.name}|来源行:${refs || '无'}`;
        const sections = (block.sections ?? []).map((section) => `${section.name}:${(section.lines ?? []).map((line) => clipPlanningLine(stripSourceLineMarkers(line), 120)).join('；')}`).join('\n');
        const evidence = sourceIndex?.lineByRef instanceof Map
            ? (block.sourceRefs ?? []).map((ref) => {
                const item = sourceIndex.lineByRef.get(ref);
                return item ? `SRC|${ref}|${item.section}|${clipPlanningLine(item.text, 56)}` : '';
            }).filter(Boolean).join('\n')
            : '';
        pieces.push(`${header}\n${sections}${evidence ? `\n${evidence}` : ''}`);
    }
    const text = pieces.join('\n\n');
    return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n[候选目录已按校验预算截断]`;
}

function rebuildRecordIsPreArchived(record) {
    const extension = record?.raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY];
    return record?.raw?.disable === true || extension?.archive === true;
}

function rebuildRecordIsCritical(record, schema = null) {
    if (rebuildRecordIsPreArchived(record)) return false;
    const type = recordType(record, schema);
    const extension = record?.raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY] ?? {};
    const lifecycle = String(extension.lifecycle ?? '').trim();
    const semanticRole = String(extension.semanticRole ?? '').trim();
    const sceneStage = String(extension.sceneStage ?? '').trim();
    if (type === '基础设定') return true;
    if (extension.focus === true) return true;
    if (/^(?:core|active)$/iu.test(lifecycle)) return true;
    if (/^(?:event-active|scene-current)$/iu.test(semanticRole)) return true;
    if (sceneStage === 'current') return true;
    return false;
}

function analyzeRebuildCoverage(records, blocks, schema = null, sourceIndex = null, droppedRefs = []) {
    const eligible = (records ?? []).filter((record) => !isControlPromptRaw(record.raw) && !rebuildRecordIsPreArchived(record));
    if (!sourceIndex?.lines?.length) {
        const coveredUids = new Set((blocks ?? []).flatMap((block) => block.sourceUids ?? []).map(String));
        const uncovered = eligible.filter((record) => !coveredUids.has(String(record.uid)));
        const criticalUncovered = uncovered.filter((record) => rebuildRecordIsCritical(record, schema));
        const coveredCount = Math.max(0, eligible.length - uncovered.length);
        const ratio = eligible.length ? coveredCount / eligible.length : 1;
        return { coveredUids, eligibleCount: eligible.length, coveredCount, uncovered, criticalUncovered, ratio, eligibleLineCount: 0, coveredLineCount: 0, uncoveredLines: [] };
    }
    const eligibleUids = new Set(eligible.map((record) => String(record.uid)));
    const dropped = new Set((droppedRefs ?? []).map(String));
    const eligibleLines = sourceIndex.lines.filter((item) => eligibleUids.has(String(item.uid)));
    const coveredRefs = new Set();
    const uncoveredLines = [];
    for (const item of eligibleLines) {
        if (isLocallyDiscardableSourceLine(item) || (dropped.has(item.ref) && isSafeApprovedSourceDrop(item))) {
            coveredRefs.add(item.ref);
            continue;
        }
        if (rebuildSourceLineRepresented(item, blocks)) coveredRefs.add(item.ref);
        else uncoveredLines.push(item);
    }
    const refsByUid = new Map();
    for (const item of eligibleLines) {
        const list = refsByUid.get(String(item.uid)) ?? [];
        list.push(item.ref);
        refsByUid.set(String(item.uid), list);
    }
    const coveredUids = new Set();
    for (const record of eligible) {
        const refs = refsByUid.get(String(record.uid)) ?? [];
        if (refs.length ? refs.every((ref) => coveredRefs.has(ref)) : (blocks ?? []).some((block) => (block.sourceUids ?? []).includes(String(record.uid)))) {
            coveredUids.add(String(record.uid));
        }
    }
    const uncovered = eligible.filter((record) => !coveredUids.has(String(record.uid)));
    const criticalUncovered = uncovered.filter((record) => rebuildRecordIsCritical(record, schema));
    const coveredCount = Math.max(0, eligible.length - uncovered.length);
    const ratio = eligible.length ? coveredCount / eligible.length : 1;
    return {
        coveredUids,
        coveredRefs,
        eligibleCount: eligible.length,
        coveredCount,
        uncovered,
        criticalUncovered,
        ratio,
        eligibleLineCount: eligibleLines.length,
        coveredLineCount: coveredRefs.size,
        uncoveredLines,
    };
}

function restoreUncoveredRebuildSourceLines(blocks, sourceIndex, droppedRefs = [], schema = null, diagnostics = { warnings: [] }) {
    const output = (0, util_1.clone)(blocks ?? []);
    if (!sourceIndex?.lines?.length) return output;
    diagnostics.warnings ?? (diagnostics.warnings = []);
    const dropped = new Set((droppedRefs ?? []).map(String));
    let restored = 0;
    let unsafeDrops = 0;
    for (const item of sourceIndex.lines) {
        if (isLocallyDiscardableSourceLine(item)) continue;
        if (dropped.has(item.ref) && isSafeApprovedSourceDrop(item)) continue;
        if (dropped.has(item.ref)) unsafeDrops += 1;
        if (rebuildSourceLineRepresented(item, output)) continue;
        const candidates = output.filter((block) => (block.sourceUids ?? []).includes(String(item.uid)));
        const target = candidates.find((block) => (block.sourceRefs ?? []).includes(String(item.ref)))
            ?? candidates.find((block) => resolveMigrationType(block.type, schema) === resolveMigrationType(item.type, schema))
            ?? candidates[0];
        if (!target) continue;
        const sectionName = safeRebuildRestoreSection(item.section, target.type, schema);
        if (!sectionName) continue;
        let section = (target.sections ?? []).find((current) => current.name === sectionName);
        if (!section) {
            section = { name: sectionName, lines: [], empty: false };
            target.sections ?? (target.sections = []);
            target.sections.push(section);
        }
        const line = (0, parser_1.normalizePointLine)(item.text);
        const before = section.lines.length;
        section.lines = dedupeMigrationLines([...(section.lines ?? []), line]);
        section.empty = section.lines.length === 0;
        if (section.lines.length > before) restored += 1;
        target.sourceRefs = (0, util_1.unique)([...(target.sourceRefs ?? []), item.ref]);
        target.sourceUids = (0, util_1.unique)([...(target.sourceUids ?? []), String(item.uid)]);
    }
    if (restored) diagnostics.warnings.push(`来源行级覆盖校验恢复了${restored}条模型遗漏事实；旧条目只有在全部事实被承接或批准过滤后才会被替换`);
    if (unsafeDrops) diagnostics.warnings.push(`${unsafeDrops}条规划DROP不符合本地安全删除条件，已按来源行重新校验并优先保留`);
    return output;
}

function rebuildSourceLineRepresented(item, blocks) {
    const source = normalizeMigrationEvidenceText(stripGenericFactLabel(item?.text ?? ''));
    if (!source) return true;
    const sourceGrams = migrationBigrams(source);
    const uidCandidates = (blocks ?? []).filter((block) => (block.sourceUids ?? []).includes(String(item.uid)));
    const exactRefCandidates = uidCandidates.filter((block) => (block.sourceRefs ?? []).includes(String(item.ref)));
    const candidates = exactRefCandidates.length ? exactRefCandidates : uidCandidates;
    for (const block of candidates) {
        const explicit = (block.lineEvidence ?? []).some((evidence) => evidence.explicit === true && (evidence.refs ?? []).includes(String(item.ref)));
        if (explicit) return true;
    }
    const metadataMayRepresentSource = /(?:别名|名称|关键词|触发词)/u.test(String(item?.section ?? ''));
    for (const block of candidates) {
        const evidenceLines = [
            ...(metadataMayRepresentSource ? [block?.name, block?.title, ...(Array.isArray(block?.keywords) ? block.keywords : [])] : []),
            ...allBlockFactLines(block),
        ];
        for (const line of evidenceLines) {
            const fact = normalizeMigrationEvidenceText(stripGenericFactLabel(line));
            if (!fact) continue;
            if (fact === source || fact.includes(source) || source.includes(fact)) return true;
            const factGrams = migrationBigrams(fact);
            const shared = [...sourceGrams].filter((gram) => factGrams.has(gram)).length;
            const coverage = sourceGrams.size ? shared / sourceGrams.size : 0;
            const reverseCoverage = factGrams.size ? shared / factGrams.size : 0;
            const anchors = migrationEvidenceAnchors(source);
            const anchorHits = anchors.filter((anchor) => fact.includes(anchor)).length;
            if (Math.max(coverage, reverseCoverage) >= 0.58 || (anchorHits >= 2 && Math.max(coverage, reverseCoverage) >= 0.34)) return true;
        }
    }
    return false;
}

function isLocallyDiscardableSourceLine(item) {
    const text = String(item?.text ?? '').trim();
    if (!text || isTautologicalRebuildLine({ name: item?.name ?? '' }, text)) return true;
    if (item?.type === '事件' && (isPendingEventLine(text) || isLowValueMigrationEventLine(text))) return true;
    return false;
}

function isSafeApprovedSourceDrop(item) {
    const text = String(item?.text ?? '').trim();
    if (isLocallyDiscardableSourceLine(item)) return true;
    return /^(?:暂无|无|未说明|未知|空|不适用)$/u.test((0, util_1.normalizeFact)(text));
}

function safeRebuildRestoreSection(rawSection, type, schema = null) {
    const resolvedType = resolveMigrationType(type, schema);
    const allowed = schema?.allowedSectionsByType?.[resolvedType] ?? TYPE_ALLOWED_SECTIONS[resolvedType];
    const canonical = (0, information_point_1.canonicalSectionName)(rawSection, resolvedType);
    if (!(allowed instanceof Set) || allowed.has(canonical)) return canonical;
    const fallback = ({ 人物: '固定事实', 场景: '固定事实', 物品: '固定事实', 事件: '已发生进展', 世界: '固定事实', 基础设定: '世界常识' })[resolvedType];
    return fallback && (!(allowed instanceof Set) || allowed.has(fallback)) ? fallback : '';
}

function parseRebuildReviewResponse(raw) {
    const text = String(raw ?? '').replace(/```(?:text|markdown|md)?/giu, '').replace(/\r/g, '').trim();
    if (/^PASS$/iu.test(text)) return { passed: true, issues: [] };
    const issues = text.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('FAIL|')).map((line) => {
        const [, code = 'UNKNOWN', entryA = '', detail = ''] = line.split('|');
        return { code: code.trim(), entryA: entryA.trim(), detail: detail.trim(), raw: line };
    });
    return { passed: false, issues: issues.length ? issues : [{ code: 'INVALID_REVIEW', entryA: '', detail: text.slice(0, 200), raw: text }] };
}

function buildSemanticClusters(records) {
    const clusters = [];
    for (const record of Array.isArray(records) ? records : []) {
        const entry = recordAsEntry(record);
        let cluster = clusters.find((candidate) => semanticClusterMatch(candidate.entry, entry));
        if (!cluster) {
            cluster = {
                id: `entity:${entry.type}:${stableClusterName(entry)}`,
                type: entry.type,
                name: entry.name || record.title,
                entry,
                records: [],
            };
            clusters.push(cluster);
        }
        cluster.records.push(record);
        cluster.entry = mergeClusterEntry(cluster.entry, entry);
    }
    return clusters.sort((left, right) => left.id.localeCompare(right.id, 'zh-CN'));
}

function buildEventSynthesisTasks(records) {
    const source = Array.isArray(records) ? records : [];
    const explicitEvents = source.filter((record) => recordType(record) === '事件');
    const clusters = [];
    for (const record of explicitEvents) {
        const entry = recordAsEntry(record);
        let cluster = clusters.find((candidate) => semanticClusterMatch(candidate.entry, entry));
        if (!cluster) {
            cluster = {
                id: `event:${stableClusterName(entry)}`,
                name: entry.name || record.title,
                entry,
                records: [],
            };
            clusters.push(cluster);
        }
        cluster.records.push(record);
        cluster.entry = mergeClusterEntry(cluster.entry, entry);
    }
    // 场景【活动关联】能够恢复旧版本中缺失的显式事件条目，但不会从普通经历句任意造事件。
    for (const record of source.filter((item) => recordType(item) !== '事件')) {
        const entry = recordAsEntry(record);
        for (const rawName of entry.sections?.values?.['活动关联'] ?? []) {
            const name = stripEventField(rawName);
            if (!isStableEventAnchor(name)) continue;
            const synthetic = {
                uid: record.uid,
                title: `事件｜${name}`,
                type: '事件',
                name,
                aliases: [],
                keywords: [name],
                content: record.content,
                sections: { values: { 场景: [entry.name], 已发生进展: [rawName] } },
            };
            let cluster = clusters.find((candidate) => semanticClusterMatch(candidate.entry, synthetic));
            if (!cluster) {
                cluster = { id: `event:${stableClusterName(synthetic)}`, name, entry: synthetic, records: [] };
                clusters.push(cluster);
            }
            if (!cluster.records.some((item) => item.uid === record.uid)) cluster.records.push(record);
            cluster.entry = mergeClusterEntry(cluster.entry, synthetic);
        }
    }
    const convergedClusters = coalesceEventClusters(clusters);
    return convergedClusters
        .map((cluster) => {
            const related = collectEventRelatedRecords(source, cluster);
            return createMigrationTask('event', cluster.id, `事件｜${cluster.name}`, related, MIGRATION_DERIVED_BODY_BUDGET, cluster.name);
        })
        .filter((task) => task.length)
        .sort((left, right) => String(left.stableName).localeCompare(String(right.stableName), 'zh-CN'));
}


function coalesceEventClusters(clusters) {
    const output = [];
    for (const raw of clusters ?? []) {
        const incoming = { ...raw, records: [...(raw.records ?? [])] };
        const target = output.find((candidate) => eventClustersShouldMerge(candidate, incoming));
        if (!target) {
            output.push(incoming);
            continue;
        }
        target.records = [...new Map([...(target.records ?? []), ...(incoming.records ?? [])].map((record) => [String(record.uid), record])).values()];
        target.entry = mergeClusterEntry(target.entry, incoming.entry);
        const targetGeneric = isGenericEventName(target.name);
        if (targetGeneric && !isGenericEventName(incoming.name)) target.name = incoming.name;
    }
    return output;
}

function eventClustersShouldMerge(left, right) {
    if (semanticClusterMatch(left.entry, right.entry)) return true;
    const a = eventClusterSignature(left.entry);
    const b = eventClusterSignature(right.entry);
    const participantHit = a.participants.some((value) => b.participants.includes(value));
    const sceneHit = a.scenes.some((value) => b.scenes.includes(value));
    const nameHit = a.names.some((value) => b.names.some((other) => value === other || (Math.min(value.length, other.length) >= 4 && (value.includes(other) || other.includes(value)))));
    const strongNameHit = a.names.some((value) => b.names.some((other) => eventNameAffinity(value, other)));
    const narrativeA = (0, util_1.normalizeFact)(`${left.entry?.content ?? ''}`);
    const narrativeB = (0, util_1.normalizeFact)(`${right.entry?.content ?? ''}`);
    const narrativeHit = Math.min(narrativeA.length, narrativeB.length) >= 12 && bigramSimilarity(narrativeA, narrativeB) >= 0.5;
    if (participantHit && sceneHit && (nameHit || strongNameHit || narrativeHit)) return true;
    if ((nameHit || strongNameHit) && narrativeHit && (participantHit || sceneHit)) return true;
    // 旧事件经常缺少参与者和场景；标题共享多个稳定二字片段时仍视为同一生命周期。
    if (strongNameHit && !participantHit && !sceneHit) return true;
    return false;
}

function eventNameAffinity(left, right) {
    const a = (0, util_1.normalizeFact)(left);
    const b = (0, util_1.normalizeFact)(right);
    if (!a || !b || Math.min(a.length, b.length) < 4) return false;
    const gramsA = migrationBigrams(a);
    const gramsB = migrationBigrams(b);
    let shared = 0;
    for (const gram of gramsA) if (gramsB.has(gram)) shared += 1;
    return shared >= 3 && bigramSimilarity(a, b) >= 0.44;
}

function isGenericEventName(value) {
    return /^(?:当前事件|相关事件|事件进展|后续事件|活动事件|冲突事件|任务事件|未命名事件)$/u.test((0, util_1.normalizeFact)(value));
}

function collectEventRelatedRecords(records, cluster) {
    const signature = eventClusterSignature(cluster.entry);
    const scored = [];
    for (const record of records) {
        if (cluster.records.some((item) => item.uid === record.uid)) {
            scored.push({ record, score: 1000 });
            continue;
        }
        const text = (0, util_1.normalizeFact)(`${record.title}\n${record.content}\n${record.keywords.join(' ')}`);
        if (!text) continue;
        const nameHit = signature.names.some((value) => value.length >= 3 && text.includes(value));
        const participantHit = signature.participants.some((value) => value.length >= 2 && text.includes(value));
        const sceneHit = signature.scenes.some((value) => value.length >= 2 && text.includes(value));
        const goalHit = signature.goals.some((value) => value.length >= 3 && text.includes(value));
        const groups = [participantHit, sceneHit, goalHit].filter(Boolean).length;
        const eventContext = /【(?:固定事实|持续经历|持续变化|活动关联|世界影响|已发生进展|未发生进展|关键进展|结果|当前状态|当前)】/u.test(record.content || '');
        if (!nameHit && !(eventContext && groups >= 2)) continue;
        scored.push({ record, score: Number(nameHit) * 120 + groups * 35 + Number(eventContext) * 10 });
    }
    return scored.sort((left, right) => right.score - left.score || left.record.uid.localeCompare(right.record.uid, 'zh-CN', { numeric: true })).map((item) => item.record);
}

function eventClusterSignature(entry) {
    const values = entry?.sections?.values ?? {};
    const participants = (0, util_1.unique)((values['参与'] ?? []).flatMap(splitEventFieldValues).map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    const scenes = (0, util_1.unique)((values['场景'] ?? []).flatMap(splitEventFieldValues).map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    const participantSet = new Set(participants);
    const sceneSet = new Set(scenes);
    const eventKeywords = (entry?.keywords ?? []).filter((value) => {
        const key = (0, util_1.normalizeFact)(value);
        return key.length >= 3 && !participantSet.has(key) && !sceneSet.has(key);
    });
    const names = (0, util_1.unique)([
        entry?.name,
        ...(entry?.aliases ?? []),
        ...eventKeywords,
        ...(values['别名'] ?? []),
    ].map((value) => (0, util_1.normalizeFact)(stripEventField(value))).filter(isStableEventAnchor));
    const changes = (0, util_1.unique)([...(values['已发生进展'] ?? []), ...(values['关键进展'] ?? []), ...(values['结果'] ?? [])].map(stripEventField).map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    return { names, participants, scenes, goals: changes, changes };
}

function splitEventFieldValues(value) {
    return stripEventField(value).split(/[、,，/；;]|(?:以及|并且|与|和|及)/u).map((item) => item.trim()).filter(Boolean);
}

function stripEventField(value) {
    return String(value ?? '').replace(/^\s*[-*]?\s*[^：:]{1,24}\s*[：:]\s*/u, '').replace(/[。；;]+$/u, '').trim();
}

function isStableEventAnchor(value) {
    const text = String(value ?? '').trim();
    return text.length >= 3 && text.length <= 48 && !/^(?:无|未知|未说明|活动|事件|当前事件|相关事件|进行中|已结束|暂无)$/u.test(text);
}

function buildOrganizationSynthesisTasks(records, schema = buildMigrationSchema()) {
    return buildExtendedSynthesisTasks(records, schema).filter((task) => task.extensionKind === 'organization');
}

function buildExtendedSynthesisTasks(records, schema = buildMigrationSchema()) {
    const source = Array.isArray(records) ? records : [];
    const tasks = [];
    const organizationDefinition = [...(schema?.definitions?.values?.() ?? [])].find((definition) => {
        const names = [definition.label, ...(definition.aliases ?? [])].map((value) => (0, util_1.normalizeFact)(value));
        return names.includes((0, util_1.normalizeFact)('组织'));
    });
    // 没有独立“组织”表定义时，组织事实统一由世界轮收束，不再额外制造世界子条目。
    const organizationTasks = organizationDefinition ? buildAnchorTasks(source, extractOrganizationAnchors, 'organization', '组织', MIGRATION_DERIVED_BODY_BUDGET, (anchor, related) => {
        return related.length >= 2 || related.some((record) => recordType(record, schema) === '世界' && /【(?:组织|权力|制度)】/u.test(record.content));
    }) : [];
    for (const task of organizationTasks) {
        decorateCustomTask(task, organizationDefinition, 'organization');
        tasks.push(task);
    }
    for (const definition of schema?.customDefinitions ?? []) {
        const direct = source.filter((record) => recordType(record, schema) === definition.label);
        if (!direct.length) continue;
        for (const cluster of buildSemanticClusters(direct)) {
            const related = collectCustomRelatedRecords(source, cluster, definition, schema);
            const task = createMigrationTask('custom', `custom:${(0, util_1.safeId)(definition.label)}:${stableClusterName(cluster.entry)}`, `${definition.label}｜${cluster.name}`, related, MIGRATION_DERIVED_BODY_BUDGET, cluster.name);
            decorateCustomTask(task, definition, (0, util_1.normalizeFact)(definition.label) === (0, util_1.normalizeFact)('组织') ? 'organization' : 'custom');
            tasks.push(task);
        }
    }
    const deduped = [];
    const seen = new Set();
    for (const task of tasks.sort((left, right) => String(left.label).localeCompare(String(right.label), 'zh-CN'))) {
        const key = `${task.outputType}|${(0, util_1.normalizeFact)(task.stableName)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(task);
    }
    return deduped;
}

function decorateCustomTask(task, definition, kind = 'custom') {
    const safeDefinition = definition ?? { label: '世界', fields: [...TYPE_ALLOWED_SECTIONS.世界].map((label) => ({ label })) };
    task.outputType = safeDefinition.label;
    task.allowedSections = (safeDefinition.fields ?? []).map((field) => field.label).filter(Boolean);
    task.typeDescription = safeDefinition.description || '';
    task.extensionKind = kind;
    task.schemaDefinition = safeDefinition;
    return task;
}

function collectCustomRelatedRecords(records, cluster, definition, schema) {
    const directUids = new Set(cluster.records.map((record) => record.uid));
    const names = (0, util_1.unique)([cluster.name, cluster.entry?.name, ...(cluster.entry?.aliases ?? []), ...(cluster.entry?.keywords ?? [])]
        .map((value) => (0, util_1.normalizeFact)(value)).filter((value) => value.length >= 2));
    const scored = [];
    for (const record of records) {
        if (directUids.has(record.uid)) {
            scored.push({ record, score: 1000 });
            continue;
        }
        const haystack = (0, util_1.normalizeFact)(`${record.title}\n${record.content}\n${record.keywords.join(' ')}`);
        const hits = names.filter((name) => haystack.includes(name)).length;
        if (!hits) continue;
        const sameType = recordType(record, schema) === definition.label;
        scored.push({ record, score: Number(sameType) * 200 + hits * 60 });
    }
    return scored.sort((left, right) => right.score - left.score || left.record.uid.localeCompare(right.record.uid, 'zh-CN', { numeric: true })).map((item) => item.record);
}

function buildRegionalSynthesisTasks(records) {
    return buildAnchorTasks(records, extractRegionAnchors, 'region', '地区', MIGRATION_DERIVED_BODY_BUDGET, (anchor, related) => {
        if (related.length >= 2) return true;
        const needle = (0, util_1.normalizeFact)(anchor);
        return related.some((record) => {
            const split = (0, util_1.splitTitle)((0, util_1.normalizeTitle)(record.title));
            const titleName = (0, util_1.normalizeFact)(split?.name ?? '');
            const keywordHit = (record.keywords ?? []).some((value) => (0, util_1.normalizeFact)(value) === needle);
            return titleName === needle || keywordHit;
        });
    });
}

function buildWorldSynthesisTasks(records) {
    const source = Array.isArray(records) ? records : [];
    // 旧重建可能把未转换成功的来源暂存为“世界｜重建待确认”；按来源标题恢复原类型，避免基础设定再次污染世界轮。
    const direct = source.filter((record) => recordType(record) === '世界' && !archivedSourceType(record));
    if (!direct.length) return [];
    // 世界事实一次性收束；模型可以输出少量稳定世界条目，但不能按组织/地区/局势重复跑多轮。
    const relatedUids = new Set(direct.map((record) => record.uid));
    const anchors = (0, util_1.unique)(direct.flatMap((record) => [record.name, ...record.keywords, ...extractRegionAnchors(record), ...extractOrganizationAnchors(record)]).filter(Boolean));
    for (const record of source) {
        if (relatedUids.has(record.uid)) continue;
        const text = (0, util_1.normalizeFact)(`${record.title}
${record.content}
${record.keywords.join(' ')}`);
        if (anchors.some((anchor) => {
            const key = (0, util_1.normalizeFact)(anchor);
            return key.length >= 2 && text.includes(key);
        })) relatedUids.add(record.uid);
    }
    const related = source.filter((record) => relatedUids.has(record.uid));
    return [createMigrationTask('world', 'world:global', '世界｜全局收束', related, MIGRATION_DERIVED_BODY_BUDGET, '全局结构')];
}

function buildFoundationSynthesisTasks(records) {
    const source = Array.isArray(records) ? records : [];
    const explicit = source.filter((record) => recordType(record) === '基础设定' || archivedSourceType(record) === '基础设定');
    if (explicit.length) {
        const anchors = (0, util_1.unique)(explicit.flatMap((record) => [record.name, ...record.keywords]).filter(Boolean));
        const related = source.filter((record) => explicit.some((item) => item.uid === record.uid) || anchors.some((anchor) => {
            const key = (0, util_1.normalizeFact)(anchor);
            const text = (0, util_1.normalizeFact)(`${record.title}
${record.content}
${record.keywords.join(' ')}`);
            return key.length >= 2 && text.includes(key);
        }));
        return [createMigrationTask('foundation', 'foundation:global', '基础设定｜规则收束', related, MIGRATION_DERIVED_BODY_BUDGET, '世界运行规则')];
    }
    const themes = [
        ['世界常识', /(?:世界常识|普遍|通常|公认|通用|所有地区|各国|整个世界)/u],
        ['自然规则', /(?:自然规则|自然规律|魔力|能量|时间|空间|死亡|复活|灵魂|昼夜|气候)/u],
        ['种族与生命', /(?:种族|血统|族群|寿命|生育|生命形态|变形|遗传)/u],
        ['能力与技术', /(?:能力|魔法|技术|施法|炼金|武器|媒介|能源|传送|通讯)/u],
        ['社会规则', /(?:社会规则|法律|制度|阶级|货币|婚姻|继承|登记|教育|宗教|贸易)/u],
        ['地理框架', /(?:地理框架|大陆|海洋|山脉|区域关系|气候带|交通网络|边境)/u],
    ];
    const related = (0, util_1.unique)(themes.flatMap(([, pattern]) => source.filter((record) => pattern.test(`${record.title}
${record.content}
${record.keywords.join(' ')}`)).map((record) => record.uid)))
        .map((uid) => source.find((record) => record.uid === uid)).filter(Boolean);
    if (related.length < 3) return [];
    return [createMigrationTask('foundation', 'foundation:derived', '基础设定｜规则候选', related, MIGRATION_DERIVED_BODY_BUDGET, '世界运行规则')];
}

function buildAnchorTasks(records, extractor, phase, labelPrefix, bodyBudget, accept) {
    const anchors = new Map();
    for (const record of records) {
        for (const anchor of extractor(record)) {
            const key = (0, util_1.normalizeFact)(anchor);
            if (!key || key.length < 2) continue;
            if (!anchors.has(key)) anchors.set(key, { anchor, records: [] });
        }
    }
    for (const item of anchors.values()) {
        item.records = records.filter((record) => recordContainsAnchor(record, item.anchor));
    }
    return [...anchors.values()]
        .filter((item) => accept(item.anchor, item.records))
        .sort((left, right) => left.anchor.localeCompare(right.anchor, 'zh-CN'))
        .map((item) => createMigrationTask(phase, `${phase}:${(0, util_1.normalizeFact)(item.anchor)}`, `${labelPrefix}｜${item.anchor}`, item.records, bodyBudget, item.anchor));
}

function createMigrationTask(phase, clusterId, label, records, bodyBudget, stableName = '') {
    const compacted = compactTaskRecords(records, bodyBudget);
    const task = compacted.records;
    task.phase = phase;
    task.clusterId = clusterId;
    task.label = label;
    task.stableName = stableName || label.replace(/^.+?｜/u, '');
    task.compactedRecords = compacted.compactedRecords;
    return task;
}

function compactTaskRecords(records, bodyBudget) {
    const source = [...new Map((records || []).map((record) => [record.uid, record])).values()];
    if (!source.length) return { records: [], compactedRecords: 0 };
    const overhead = source.reduce((sum, record) => sum + serializeRecord({ ...record, content: '' }).length, 0);
    const available = Math.max(1200, bodyBudget - overhead);
    const share = Math.max(260, Math.floor(available / source.length));
    let compactedRecords = 0;
    const output = source.map((record) => {
        const content = String(record.content ?? '').replace(/\r/g, '').trim();
        if (content.length <= share) return { ...record, content };
        compactedRecords += 1;
        return { ...record, content: clipRecordContent(content, share) };
    });
    return { records: output, compactedRecords };
}

function clipRecordContent(content, maxChars) {
    const text = String(content ?? '').trim();
    if (text.length <= maxChars) return text;
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    const priority = lines.filter((line) => /^(?:【(?:身份|定义|稳定|当前|当前状态|关系|目标|阶段|未决|结果|范围|地理|组织|权力|制度|公开局势|世界常识|自然规则|种族与生命|能力与技术|社会规则|地理框架)】|-\s*(?:身份|种族|位置|目标|结果|范围|组织|制度|规则|来源|真相|当前))/u.test(line));
    const ordered = (0, util_1.unique)([...priority, ...lines.slice(0, 8), ...lines.slice(-8)]);
    let out = '';
    for (const line of ordered) {
        if (out && out.length + line.length + 1 > maxChars) continue;
        out += `${out ? '\n' : ''}${line}`;
    }
    if (!out) out = `${text.slice(0, Math.ceil(maxChars * .62))}\n[中间历史已压缩]\n${text.slice(-Math.floor(maxChars * .3))}`;
    return out.slice(0, maxChars);
}

function recordAsEntry(record) {
    const splitRaw = (0, util_1.splitTitle)((0, util_1.normalizeTitle)(record.title)) || { type: record.type || '世界', name: record.name || record.title };
    const split = { type: record.type || splitRaw.type, name: record.name || splitRaw.name };
    const sections = (0, parser_1.parseEntrySections)(record.content || '');
    const rawAliases = (0, util_1.unique)([
        ...(sections.values?.['别名'] || []),
    ].map((value) => String(value).replace(/^\s*[-*]\s*/u, '').trim()).filter(isMeaningfulRebuildKeyword));
    const aliases = safeMigrationIdentityAliases(split.type, split.name, rawAliases);
    return {
        uid: record.uid,
        title: `${split.type}｜${split.name}`,
        type: split.type,
        name: split.name,
        aliases,
        keywords: record.keywords || [],
        content: record.content || '',
        sections,
        _eventIdentityAnchors: record._eventIdentityAnchors ?? [],
    };
}

function safeMigrationIdentityAliases(type, name, aliases) {
    if (type !== '场景') return aliases;
    const base = (0, util_1.normalizeFact)(name);
    return (aliases ?? []).filter((alias) => {
        const value = (0, util_1.normalizeFact)(alias);
        if (!value || !base) return false;
        if (value === base || (Math.min(value.length, base.length) >= 3 && (value.includes(base) || base.includes(value)))) return true;
        return Math.min(value.length, base.length) >= 5 && bigramSimilarity(value, base) >= 0.45;
    });
}

function semanticClusterMatch(clusterEntry, incomingEntry) {
    if (clusterEntry.type === '事件' && incomingEntry.type === '事件') {
        const left = stableClusterName(clusterEntry);
        const right = stableClusterName(incomingEntry);
        return Boolean(left && right && left === right)
            || (0, matcher_1.sameEventLifecycle)(sanitizeEventEntryForLifecycle(clusterEntry), sanitizeEventEntryForLifecycle(incomingEntry));
    }
    if ((0, matcher_1.sameEntryIdentity)(clusterEntry, incomingEntry)) return true;
    if (clusterEntry.type !== incomingEntry.type) return false;
    const left = stableClusterName(clusterEntry);
    const right = stableClusterName(incomingEntry);
    if (left && right && left === right) return true;
    return identityKeywordMatch(clusterEntry, incomingEntry);
}

function sanitizeEventEntryForLifecycle(entry) {
    const values = entry?.sections?.values ?? {};
    const participants = new Set((values['参与'] ?? []).flatMap(splitEventFieldValues).map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    const scenes = new Set((values['场景'] ?? []).flatMap(splitEventFieldValues).map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    const keywords = (entry?.keywords ?? []).filter((value) => {
        const key = (0, util_1.normalizeFact)(value);
        return key.length >= 3 && !participants.has(key) && !scenes.has(key);
    });
    return { ...entry, keywords };
}

function identityKeywordMatch(left, right) {
    const leftNames = (0, util_1.unique)([left?.name, ...(left?.aliases ?? [])].map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    const rightNames = (0, util_1.unique)([right?.name, ...(right?.aliases ?? [])].map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    const leftKeywords = (0, util_1.unique)((left?.keywords ?? []).map((value) => (0, util_1.normalizeFact)(value)).filter((value) => value.length >= 3));
    const rightKeywords = (0, util_1.unique)((right?.keywords ?? []).map((value) => (0, util_1.normalizeFact)(value)).filter((value) => value.length >= 3));
    const anchorMatchesName = leftKeywords.some((keyword) => rightNames.includes(keyword)) || rightKeywords.some((keyword) => leftNames.includes(keyword));
    if (anchorMatchesName) return true;
    const shared = leftKeywords.filter((keyword) => rightKeywords.includes(keyword));
    return shared.some((keyword) => leftNames.some((name) => name.includes(keyword)) && rightNames.some((name) => name.includes(keyword)));
}

function stableClusterName(entry) {
    return (0, util_1.normalizeFact)(String(entry?.name ?? ''))
        .replace(/(?:老师|教授|医生|主任|队长|会长|店长|老板|先生|女士|小姐|大人|殿下|陛下|学姐|学长|师姐|师兄|姐姐|哥哥|前辈)$/u, '')
        .replace(/^(?:人物|角色|物品|道具|事件|场景|世界|基础设定)/u, '') || (0, util_1.normalizeFact)(entry?.title ?? '未命名');
}

function mergeClusterEntry(left, right) {
    return {
        ...left,
        aliases: (0, util_1.unique)([...(left.aliases || []), ...(right.aliases || []), right.name]),
        keywords: (0, util_1.unique)([...(left.keywords || []), ...(right.keywords || [])]),
        content: `${left.content || ''}\n${right.content || ''}`,
    };
}

function archivedSourceTitle(record) {
    const content = String(record?.content ?? '');
    const match = content.match(/【来源条目】[\s\S]*?^\s*-\s*([^\n]+?｜[^\n]+?)\s*$/mu);
    return match?.[1] ? (0, util_1.normalizeTitle)(match[1]) : '';
}

function archivedSourceType(record, schema = null) {
    const title = archivedSourceTitle(record);
    if (!title) return '';
    return resolveMigrationType((0, util_1.splitTitle)(title)?.type || '', schema);
}

function recordType(record, schema = null) {
    if (record?.type) return resolveMigrationType(record.type, schema);
    return resolveMigrationType((0, util_1.splitTitle)((0, util_1.normalizeTitle)(record.title))?.type || '', schema);
}

function annotateRecordSchema(record, schema) {
    const split = (0, util_1.splitTitle)((0, util_1.normalizeTitle)(record.title));
    record.type = resolveMigrationType(split?.type || '', schema);
    record.name = split?.name || record.title;
    return record;
}

function extractRegionAnchors(record) {
    return (0, util_1.unique)(extractAnchors(`${record.title}
${record.content}
${record.keywords.join(' ')}`, REGION_SUFFIX_PATTERN)
        .map(cleanRegionAnchor)
        .filter((value) => value && !/^(?:当前地区|某地区|该地区|世界地区)$/u.test(value)));
}

function cleanRegionAnchor(value) {
    let text = String(value ?? '').trim();
    for (const marker of ['负责', '位于', '坐落于', '属于', '进入', '离开', '抵达', '前往', '通往', '控制', '覆盖']) {
        if (text.includes(marker)) text = text.split(marker).at(-1).trim();
    }
    text = text.replace(/^(?:在|从|向|至|到)/u, '').replace(/地区$/u, '').trim();
    if (/^([东南西北]境)边境$/u.test(text)) text = text.replace(/边境$/u, '');
    return text;
}

function extractOrganizationAnchors(record) {
    return extractAnchors(`${record.title}\n${record.content}\n${record.keywords.join(' ')}`, ORGANIZATION_SUFFIX_PATTERN)
        .filter((value) => !/^(?:某组织|该组织|世界组织|组织势力)$/u.test(value));
}

function extractAnchors(text, pattern) {
    const output = [];
    pattern.lastIndex = 0;
    for (const match of String(text || '').matchAll(pattern)) output.push(String(match[1] || '').trim());
    pattern.lastIndex = 0;
    return (0, util_1.unique)(output);
}

function recordContainsAnchor(record, anchor) {
    const needle = (0, util_1.normalizeFact)(anchor);
    const haystack = (0, util_1.normalizeFact)(`${record.title}\n${record.content}\n${record.keywords.join(' ')}`);
    return Boolean(needle && haystack.includes(needle));
}

function migrationPhaseLabel(phase) {
    return ({ planned: '候选重建', 'planned-joint': '联合重建', entity: '对象重建', event: '事件重建', custom: '通用条目重建', organization: '通用条目重建', world: '世界收束', region: '地区规则', foundation: '基础设定' })[phase] || '世界书重建';
}

function rebuildParsePolicy(batch, records, schema = buildMigrationSchema()) {
    const phase = batch?.phase || 'entity';
    const explicitFoundationUids = new Set(records.filter((record) => recordType(record, schema) === '基础设定').map((record) => record.uid));
    const allowedEvidenceUids = new Set((Array.isArray(batch) ? batch : []).map((record) => String(record.uid)));
    const common = {
        minimumEvidence: 1,
        explicitFoundationUids,
        allowedEvidenceUids,
        evidenceRecordByUid: new Map(records.map((record) => [String(record.uid), record])),
        allowedSectionsByType: schema.allowedSectionsByType,
        sourceLineByRef: batch?.sourceLineByRef instanceof Map ? batch.sourceLineByRef : new Map(),
        defaultSceneAnchors: [...(batch?.sceneAnchors ?? [])],
        allowedSceneAnchors: new Set(batch?.sceneAnchors ?? []),
        anchorCatalog: new Map((batch?.anchorCatalog ?? []).map((anchor) => [anchor.id, anchor])),
        sceneAnchorsByGroup: new Map((batch?.jointGroups ?? []).map((group) => [String(group.id), new Set(group.sceneAnchors ?? [])])),
        schema,
    };
    if (phase === 'planned' || phase === 'planned-joint') {
        return {
            ...common,
            allowedTypes: batch?.phase === 'planned-joint'
                ? new Set([...(batch?.outputTypes ?? [])].filter(Boolean))
                : (batch?.newTypeProposal === true ? new Set([...schema.definitions.keys()]) : new Set([String(batch?.outputType || '')].filter(Boolean))),
            allowNewTypes: batch?.newTypeProposal === true || (batch?.jointGroups ?? []).some((group) => group.newTypeProposal === true),
            allowedSourceRefs: batch?.allowedSourceRefs instanceof Set ? batch.allowedSourceRefs : new Set(batch?.sourceRefs ?? []),
        };
    }
    if (phase === 'event') return { ...common, allowedTypes: new Set(['事件']), allowNewTypes: false };
    if (phase === 'custom' || phase === 'organization') {
        return { ...common, allowedTypes: new Set([...schema.definitions.keys()]), allowNewTypes: true };
    }
    if (phase === 'world') return { ...common, allowedTypes: new Set([...schema.definitions.keys()]), allowNewTypes: true };
    if (phase === 'region') return { ...common, allowedTypes: new Set(['世界']), allowNewTypes: false };
    if (phase === 'foundation') return { ...common, allowedTypes: new Set(['基础设定']), minimumEvidence: 2, allowNewTypes: false };
    return { ...common, allowedTypes: new Set([...NON_EVENT_TYPES, ...schema.customDefinitions.map((definition) => definition.label)]), allowNewTypes: true };
}

function buildPriorCandidateContext(blocks, batch, maxChars = 2600) {
    const phase = batch?.phase || 'entity';
    if (phase === 'entity' || !Array.isArray(blocks) || !blocks.length) return '';
    const preferred = ({
        event: new Set(['人物', '场景', '物品', '世界']),
        custom: new Set(['人物', '场景', '物品', '事件', '世界', '基础设定']),
        organization: new Set(['人物', '场景', '事件', '世界']),
        world: new Set(['世界', '场景', '事件', '基础设定']),
        region: new Set(['场景', '事件', '世界']),
        foundation: new Set(['世界', '基础设定']),
    })[phase] ?? new Set();
    const sourceUids = new Set((Array.isArray(batch) ? batch : []).map((record) => String(record.uid)));
    const anchor = (0, util_1.normalizeFact)(batch?.stableName || batch?.label || '');
    const ranked = blocks.map((block, index) => {
        const serialized = serializeCandidateBlock(block);
        const overlap = (block.sourceUids ?? []).some((uid) => sourceUids.has(String(uid)));
        const anchorHit = Boolean(anchor && (0, util_1.normalizeFact)(serialized).includes(anchor));
        const score = Number(overlap) * 100 + Number(anchorHit) * 60 + Number(preferred.has(block.type)) * 10 + index / 10000;
        return { block, serialized, score };
    }).filter((item) => item.score >= 60 || (phase === 'foundation' && preferred.has(item.block.type)))
        .sort((left, right) => right.score - left.score)
        .slice(0, 12);
    let output = '';
    for (const item of ranked) {
        const next = `${output ? '\n\n' : ''}${item.serialized}`;
        if (output && output.length + next.length > maxChars) continue;
        output += next;
    }
    return output.slice(0, maxChars);
}

function serializeCandidateBlock(block) {
    const sections = (block.sections ?? []).map((section) => `【${section.name}】\n${(section.lines ?? []).map((line) => `- ${line}`).join('\n')}`).join('\n');
    const sources = (block.sourceUids ?? []).join(',') || '无';
    return `${block.title}\n候选来源UID：${sources}\n${sections}`.trim();
}

function splitRecordContent(content, maxChars) {
    const text = String(content ?? '').trim();
    if (!text || text.length <= maxChars) return [text];
    const lines = text.split('\n');
    const fragments = [];
    let current = [];
    let size = 0;
    for (const rawLine of lines) {
        const line = String(rawLine ?? '');
        if (line.length > maxChars) {
            if (current.length) {
                fragments.push(current.join('\n'));
                current = [];
                size = 0;
            }
            for (let offset = 0; offset < line.length; offset += maxChars)
                fragments.push(line.slice(offset, offset + maxChars));
            continue;
        }
        const next = size + line.length + (current.length ? 1 : 0);
        if (current.length && next > maxChars) {
            fragments.push(current.join('\n'));
            current = [];
            size = 0;
        }
        current.push(line);
        size += line.length + (current.length > 1 ? 1 : 0);
    }
    if (current.length) fragments.push(current.join('\n'));
    return fragments.filter(Boolean);
}

function rebuildFingerprint(worldbookName, records) {
    const source = [String(worldbookName ?? ''), ...records.map((record) => `${record.uid}|${record.title}|${record.content}|${record.keywords.join(',')}`)].join('\n');
    return (0, util_1.hashText)(source);
}

function isMigrationRateLimitError(error) {
    return /(?:\b429\b|too many requests|rate limit|requests per minute|tokens per minute|请求过多|频率限制|限流)/iu.test((0, util_1.errorText)(error));
}

function migrationBatchIntervalMs(settings) {
    const configured = Number(settings?.migrationBatchIntervalMs);
    if (Number.isFinite(configured)) return Math.min(60000, Math.max(0, Math.round(configured)));
    return MIGRATION_DEFAULT_INTERVAL_MS;
}

function migrationRateLimitRetries(settings) {
    const configured = Number(settings?.migrationRateLimitRetries);
    if (Number.isFinite(configured)) return Math.min(4, Math.max(0, Math.round(configured)));
    return MIGRATION_MAX_RATE_LIMIT_RETRIES;
}

function migrationRateLimitBackoffMs(settings, attempt) {
    const configured = Number(settings?.migrationRateLimitBackoffMs);
    if (Number.isFinite(configured)) return Math.min(120000, Math.max(0, Math.round(configured)));
    return MIGRATION_RATE_LIMIT_BACKOFF_MS[Math.min(Math.max(0, attempt), MIGRATION_RATE_LIMIT_BACKOFF_MS.length - 1)];
}

async function waitForMigration(ms, validate, snapshot) {
    let remaining = Math.max(0, Number(ms) || 0);
    while (remaining > 0) {
        if (snapshot?.token?.cancelled) throw new Error(snapshot.token.reason || '任务已取消');
        const slice = Math.min(250, remaining);
        await new Promise((resolve) => setTimeout(resolve, slice));
        remaining -= slice;
        validate();
    }
}

function isControlPromptRaw(raw) {
    if (!raw || typeof raw !== 'object') return false;
    const extension = raw.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY];
    if (extension?.managed !== true) return false;
    const title = (0, util_1.normalizeTitle)(String(raw.comment ?? raw.name ?? raw.title ?? ''));
    const content = String(raw.content ?? '');
    if (title === (0, util_1.normalizeTitle)(exports.INFORMATION_BOUNDARY_TITLE)) return true;
    if (/【来源条目】[\s\S]{0,120}基础设定[｜|]角色信息边界/u.test(content)) return true;
    const signatures = [
        '世界事实不等于角色已知',
        '未列入角色【已知】',
        '玩家未表达的内心、他人私密认知',
        '仅因世界书中存在某条事实，不代表所有角色知道',
    ];
    return signatures.filter((phrase) => content.includes(phrase)).length >= 2;
}

function collectRebuildRecords(data, schema = buildMigrationSchema()) {
    const output = [];
    for (const [mapKey, raw] of Object.entries(data?.entries ?? {})) {
        if (!raw || typeof raw !== 'object' || !isRebuildCandidate(raw, schema) || isControlPromptRaw(raw)) continue;
        const uid = String(raw.uid ?? mapKey);
        const title = (0, util_1.stripUidSuffix)(String(raw.comment ?? raw.name ?? raw.title ?? '')) || `未命名｜${uid}`;
        const keywords = (0, util_1.normalizeStringArray)(raw.key).filter((item) => !(0, util_1.isUidKeyword)(item));
        const split = (0, util_1.splitTitle)((0, util_1.normalizeTitle)(title));
        output.push({ mapKey: String(mapKey), uid, title, type: resolveMigrationType(split?.type || '', schema), name: split?.name || title, content: String(raw.content ?? ''), keywords, raw: (0, util_1.clone)(raw) });
    }
    return output.sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
}

function isRebuildCandidate(raw, schema = buildMigrationSchema()) {
    if (!raw || typeof raw !== 'object') return false;
    const extension = raw.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY];
    if (extension?.locked === true || raw.locked === true) return false;
    if (extension?.managed === true) return true;
    const title = (0, util_1.stripUidSuffix)((0, util_1.normalizeTitle)(String(raw.comment ?? raw.name ?? raw.title ?? '')));
    const split = (0, util_1.splitTitle)(title);
    if (!split || !schema?.definitions?.has(resolveMigrationType(split.type, schema))) return false;
    const keys = (0, util_1.normalizeStringArray)(raw.key);
    // 非镜渊用户条目即使标题属于六类、正文格式较旧，也不参与重建和删除。
    return keys.some((item) => (0, util_1.isUidKeyword)(item));
}

function serializeRecord(record) {
    const part = Number(record.fragmentCount || 0) > 1 ? ` part=${record.fragmentIndex}/${record.fragmentCount}` : '';
    const cluster = record.semanticClusterId ? ` cluster=${record.semanticClusterId}` : '';
    const clusterName = record.semanticClusterName ? `
对象簇：${record.semanticClusterName}` : '';
    return `<<<SOURCE uid=${record.uid}${part}${cluster}>>>
标题：${record.title}${clusterName}
关键词：${record.keywords.join('、') || '无'}
快照正文：
${record.content || '（空）'}
<<<END_SOURCE>>>`;
}

function migrationLineSlot(line) {
    return String(line ?? '').match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1]?.replace(/\s+/gu, '') ?? '';
}

function removeUnresolvedSlotConflicts(section, lines, diagnostics = { warnings: [] }, title = '') {
    const source = (0, util_1.unique)(lines ?? []);
    if (!MIGRATION_EXCLUSIVE_SECTIONS.has(String(section ?? ''))) return source;
    const bySlot = new Map();
    for (const line of source) {
        const slot = migrationLineSlot(line);
        if (!slot || !isExclusiveMigrationSlot(section, slot)) continue;
        const list = bySlot.get(slot) ?? [];
        list.push(line);
        bySlot.set(slot, list);
    }
    const conflicts = new Set();
    for (const [slot, values] of bySlot.entries()) {
        const distinct = (0, util_1.unique)(values.map((value) => (0, util_1.normalizeFact)(value)));
        if (distinct.length <= 1) continue;
        conflicts.add(slot);
        diagnostics.warnings ?? (diagnostics.warnings = []);
        diagnostics.warnings.push(`${title || '重建条目'}【${section}】“${slot}”存在互斥解释，未自动裁决；请改写为人物【已知/误信】、不同时间状态或待确认事实`);
    }
    if (!conflicts.size) return source;
    return source.filter((line) => !conflicts.has(migrationLineSlot(line)));
}


function isExclusiveMigrationSlot(section, slot) {
    const sectionName = String(section ?? '').trim();
    const slotName = String(slot ?? '').trim().toLocaleLowerCase();
    if (/^(?:当前|当前状态|阶段)$/u.test(sectionName)) return true;
    if (sectionName === '身份') return MIGRATION_STRONG_SINGLE_SLOTS.has(slotName);
    if (sectionName === '功能') return /^(?:用途|功能|主功能)$/u.test(slotName);
    return false;
}

function normalizeEventCompletionBlock(block) {
    if (block?.type !== '事件') return block;
    const output = (0, util_1.clone)(block);
    // 旧【目标】只作为本地聚合身份锚点，绝不写回可召回正文。
    output._eventIdentityAnchors = (0, util_1.unique)([
        ...(block?._eventIdentityAnchors ?? []),
        ...((block?.sections ?? []).filter((section) => /^(?:目标)$/u.test(String(section.name ?? '').trim())).flatMap((section) => section.lines ?? [])),
    ].map((line) => (0, parser_1.sanitizeWorldbookLine)(line)).filter(Boolean));
    output.eventIdentitySections = {
        ...(block?.eventIdentitySections ?? {}),
        ...(output._eventIdentityAnchors.length ? { 目标: output._eventIdentityAnchors } : {}),
    };
    const byName = new Map();
    for (const section of output.sections ?? []) {
        let name = String(section.name ?? '').trim();
        if (name === '关键进展' || name === '事件进程' || name === '进展') name = '已发生进展';
        if (name === '未形成进展' || name === '过程动作' || name === '过程细节') name = '未发生进展';
        // 目标、未决和阶段属于旧任务式生命周期，不再写回可召回正文。
        if (/^(?:目标|未决|阶段|当前阶段)$/u.test(name)) continue;
        if (!/^(?:参与|场景|已发生进展|未发生进展|结果|别名)$/u.test(name)) continue;
        const lines = (section.lines ?? [])
            .map((line) => (0, parser_1.sanitizeWorldbookLine)(line))
            .filter(Boolean)
            .filter((line) => !isPendingEventLine(line))
            .filter((line) => !/^(?:已发生进展|未发生进展)$/u.test(name) || !isLowValueMigrationEventLine(line));
        if (!lines.length) continue;
        const current = byName.get(name) ?? [];
        current.push(...lines);
        byName.set(name, current);
    }
    output.sections = collapseEventNarrativeSections([...byName.entries()].map(([name, lines]) => ({ name, lines, empty: false })));
    return output;
}

function isLowValueMigrationEventLine(value) {
    const text = (0, util_1.normalizeFact)(value);
    if (!text) return true;
    if (/(?:同意|拒绝|决定|确认|发现|得知|获得|失去|交给|拿走|偷走|归还|受伤|死亡|击败|逃脱|暴露|驱逐|建立|解除|改变|完成|取消|终止|签署|达成|破坏|摧毁|掌握|恢复|占领|控制|释放|拘捕|背叛|承诺|公开|宣布|导致|造成|形成|救出|带走|夺取|移交|失踪|中毒|痊愈|晋升|离职|结盟|决裂)/u.test(text)) return false;
    return /(?:走到|走向|来到|进入|离开|坐下|站起|抬头|低头|看向|望向|皱眉|微笑|点头|摇头|开门|关门|翻开|合上|拿起|放下|停下|沉默|寒暄|喝水|吃饭|敲门|转身|回头|挠头)/u.test(text) && text.length <= 36;
}

function isPendingEventLine(value) {
    const text = String(value ?? '').trim();
    if (!text) return true;
    const affirmativeText = text.replace(/(?:尚未|还未|仍未|未能|待解决|待确认|待完成|有待)/gu, '');
    const completedMarker = /(?:已经|已|曾|此前|当时|后来|最终).{0,14}(?:完成|发生|开始|决定|确认|证实|导致|造成|形成|抵达|到达|进入|离开|发出|收到|获得|失去|掌握|恢复|击败|签署|达成|公开|宣布)/u.test(affirmativeText);
    // 纯粹描述尚未发生的内容不写回；同一句中若先记录了明确发生的进展，则保留整条进展。
    if (/(?:尚未|还未|仍未|未能|待解决|待确认|待完成|有待)/u.test(text)) return !completedMarker;
    const futureMarker = /(?:下一步|之后需要|接下来|计划|打算|准备|将会|将要|希望|目标是|目的在于)/u.test(text);
    return futureMarker && !completedMarker;
}

function collapseEventNarrativeSections(sections) {
    const byName = new Map();
    for (const section of sections ?? []) {
        const current = byName.get(section.name) ?? [];
        current.push(...(section.lines ?? []));
        byName.set(section.name, current);
    }
    const resultLines = (0, util_1.unique)(byName.get('结果') ?? []);
    if (resultLines.length && byName.has('已发生进展')) {
        const normalizedResults = resultLines.map((line) => (0, util_1.normalizeFact)(stripGenericFactLabel(line))).filter(Boolean);
        byName.set('已发生进展', (byName.get('已发生进展') ?? []).filter((line) => {
            const fact = (0, util_1.normalizeFact)(stripGenericFactLabel(line));
            return !normalizedResults.some((result) => fact && (result.includes(fact) || fact.includes(result)));
        }));
        // 有稳定结果后，普通过程材料不再长期保留。
        byName.delete('未发生进展');
    }
    if (byName.has('已发生进展')) {
        const lines = dedupeMigrationLines(byName.get('已发生进展')).slice(-4);
        byName.set('已发生进展', lines);
    }
    if (byName.has('未发生进展')) byName.set('未发生进展', dedupeMigrationLines(byName.get('未发生进展')).slice(-2));
    return [...byName.entries()].map(([name, lines]) => ({ name, lines: (0, util_1.unique)(lines), empty: false })).filter((section) => section.lines.length);
}

function parseRebuildResponse(raw, knownUids, diagnostics = { invalidLines: [], warnings: [] }, policy = {}) {
    diagnostics.invalidLines ?? (diagnostics.invalidLines = []);
    diagnostics.warnings ?? (diagnostics.warnings = []);
    const invalidStart = diagnostics.invalidLines.length;
    const allowedTypes = new Set(policy.allowedTypes instanceof Set ? policy.allowedTypes : ALLOWED_TYPES);
    const minimumEvidence = Math.max(1, Number(policy.minimumEvidence || 1));
    const explicitFoundationUids = policy.explicitFoundationUids instanceof Set ? policy.explicitFoundationUids : new Set();
    const allowedEvidenceUids = policy.allowedEvidenceUids instanceof Set ? policy.allowedEvidenceUids : null;
    const allowedSectionsByType = policy.allowedSectionsByType && typeof policy.allowedSectionsByType === 'object' ? policy.allowedSectionsByType : TYPE_ALLOWED_SECTIONS;
    const evidenceRecordByUid = policy.evidenceRecordByUid instanceof Map ? policy.evidenceRecordByUid : null;
    const allowedSourceRefs = policy.allowedSourceRefs instanceof Set ? policy.allowedSourceRefs : null;
    const prepared = parseRebuildEnvelope(raw, diagnostics, policy);
    for (const block of prepared) if (block?.newTypeProposalAccepted === true) allowedTypes.add(block.type);
    const normalizedPrepared = prepared.map((block) => {
        const type = resolveMigrationType(block.type, policy.schema);
        const temporal = resolveBlockTemporalMetadata({
            sceneAnchors: (block.sceneAnchors ?? []).length ? block.sceneAnchors : policy.defaultSceneAnchors,
            gameTime: block.gameTime,
            timeSource: block.timeSource,
            temporalState: block.temporalState,
            type,
        }, policy);
        return { ...block, ...temporal, type, title: `${type}｜${block.name}` };
    });
    const parsed = (0, information_point_1.prepareInformationBlocks)(normalizedPrepared);
    const output = [];
    for (const block of parsed) {
        if (!allowedTypes.has(block.type)) {
            diagnostics.warnings.push(`已丢弃不允许的重建类型：${block.title}`);
            continue;
        }
        const sections = [];
        const sourceUids = new Set();
        const sourceRefs = new Set();
        const lineEvidence = [];
        const entryEvidenceUids = (0, util_1.unique)((block.mergeSourceUids ?? [])
            .map((uid) => String(uid))
            .filter((uid) => knownUids.has(uid) && (!allowedEvidenceUids || allowedEvidenceUids.has(uid))));
        const entrySourceRefs = (0, util_1.unique)((block.sourceRefs ?? [])
            .map((ref) => String(ref))
            .filter((ref) => !allowedSourceRefs || allowedSourceRefs.has(ref)));
        for (const ref of entrySourceRefs) sourceRefs.add(ref);
        for (const ref of entrySourceRefs) {
            const uid = ref.split(':s')[0];
            if (knownUids.has(uid) && (!allowedEvidenceUids || allowedEvidenceUids.has(uid))) sourceUids.add(uid);
        }
        const singleBatchUid = allowedEvidenceUids?.size === 1
            ? [...allowedEvidenceUids].map((uid) => String(uid)).find((uid) => knownUids.has(uid)) || ''
            : '';
        let inheritedEvidenceLines = 0;
        for (const section of block.sections ?? []) {
            if (/(关键词|触发词|标签|分类)/u.test(section.name) || section.empty) continue;
            const allowedSections = allowedSectionsByType?.[block.type];
            if (allowedSections instanceof Set && !allowedSections.has(section.name)) {
                diagnostics.warnings.push(`${block.title}【${section.name}】不属于${block.type}固定格式，已丢弃`);
                continue;
            }
            if (KNOWLEDGE_SECTIONS.has(section.name) && block.type !== '人物') {
                diagnostics.warnings.push(`${block.title}【${section.name}】不是人物认知，已丢弃`);
                continue;
            }
            const lines = [];
            for (const rawLine of section.lines ?? []) {
                const ids = [];
                const lineRefs = [];
                String(rawLine).replace(SOURCE_LINE_MARKER, (_match, group) => {
                    for (const ref of parseSourceRefList(group)) {
                        if (!allowedSourceRefs || allowedSourceRefs.has(ref)) lineRefs.push(ref);
                    }
                    return '';
                });
                SOURCE_LINE_MARKER.lastIndex = 0;
                String(rawLine).replace(SOURCE_MARKER, (_match, group) => {
                    for (const id of String(group).split(/[,，、\s]+/u).map((item) => item.trim()).filter(Boolean)) {
                        if (knownUids.has(id) && (!allowedEvidenceUids || allowedEvidenceUids.has(id))) ids.push(id);
                    }
                    return '';
                });
                SOURCE_MARKER.lastIndex = 0;
                const line = (0, parser_1.sanitizeWorldbookLine)(stripSourceLineMarkers(String(rawLine).replace(SOURCE_MARKER, ''))).trim();
                SOURCE_MARKER.lastIndex = 0;
                if (!line) {
                    diagnostics.invalidLines.push({ title: block.title, section: section.name, line: String(rawLine).slice(0, 160), reason: '检测到模型控制提示词或格式协议，已阻止写入世界书' });
                    continue;
                }
                let uniqueIds = (0, util_1.unique)(ids);
                const explicitLineRefs = (0, util_1.unique)(lineRefs);
                const uniqueRefs = (0, util_1.unique)(explicitLineRefs.length ? explicitLineRefs : entrySourceRefs);
                // [MA-REBUILD-09] 通用格式以“合并来源”为条目级证据。模型若没有在每一行重复UID，
                // 可继承该条目的有效合并来源；单来源批次也可安全继承唯一UID。多来源且没有条目级来源时仍拒绝。
                if (!uniqueIds.length && entryEvidenceUids.length) {
                    uniqueIds = entryEvidenceUids;
                    inheritedEvidenceLines += 1;
                }
                if (!uniqueIds.length && uniqueRefs.length) {
                    uniqueIds = (0, util_1.unique)(uniqueRefs.map((ref) => ref.split(':s')[0])
                        .filter((uid) => knownUids.has(uid) && (!allowedEvidenceUids || allowedEvidenceUids.has(uid))));
                }
                if (!uniqueIds.length && singleBatchUid) {
                    uniqueIds = [singleBatchUid];
                    inheritedEvidenceLines += 1;
                }
                if (allowedSourceRefs && !uniqueRefs.length) {
                    diagnostics.invalidLines.push({ title: block.title, section: section.name, line, reason: '缺少当前规划组的来源行引用' });
                    continue;
                }
                if (!uniqueIds.length) {
                    diagnostics.invalidLines.push({ title: block.title, section: section.name, line, reason: '缺少可追溯旧条目UID，且没有可继承的条目级合并来源' });
                    continue;
                }
                if (uniqueIds.length < minimumEvidence && !uniqueIds.some((id) => explicitFoundationUids.has(id))) {
                    diagnostics.invalidLines.push({ title: block.title, section: section.name, line, reason: `该推导层至少需要${minimumEvidence}个独立旧UID证据` });
                    continue;
                }
                if (KNOWLEDGE_SECTIONS.has(section.name) && !SOURCE_KIND_PATTERN.test(line)) {
                    diagnostics.invalidLines.push({ title: block.title, section: section.name, line, reason: '人物认知缺少明确的信息来源类型' });
                    continue;
                }
                if (evidenceRecordByUid && !migrationLineSupportedBySources(line, uniqueIds, evidenceRecordByUid)) {
                    diagnostics.invalidLines.push({ title: block.title, section: section.name, line, reason: '该行与所引用旧条目缺少足够的词语或事实锚点，已阻止无证据改写' });
                    continue;
                }
                if (explicitLineRefs.length && isGeneralizedRebuildRuleLine(block.type, section.name, line)
                    && !rebuildRuleLineSupported(line, explicitLineRefs, policy)) {
                    diagnostics.invalidLines.push({ title: block.title, section: section.name, line, reason: '单次行为或单一场景证据不足以提炼为长期运行规则' });
                    continue;
                }
                uniqueIds.forEach((id) => sourceUids.add(id));
                uniqueRefs.forEach((ref) => sourceRefs.add(ref));
                const normalizedLine = (0, parser_1.normalizePointLine)(line);
                lines.push(normalizedLine);
                lineEvidence.push({ section: section.name, line: normalizedLine, refs: uniqueRefs, explicit: explicitLineRefs.length > 0 });
            }
            if (lines.length) {
                const safeLines = removeUnresolvedSlotConflicts(section.name, (0, util_1.unique)(lines), diagnostics, block.title);
                if (safeLines.length) sections.push({ name: section.name, lines: safeLines, empty: false });
            }
        }
        if (inheritedEvidenceLines > 0) {
            diagnostics.warnings.push(`${block.title}有${inheritedEvidenceLines}行未逐行标注旧UID，已继承该条目的有效合并来源`);
        }
        if (!sections.length) continue;
        for (const uid of block.mergeSourceUids ?? []) {
            const id = String(uid);
            if (knownUids.has(id) && (!allowedEvidenceUids || allowedEvidenceUids.has(id))) sourceUids.add(id);
        }
        output.push(applyRebuildTemporalSettlement({ ...block, sections, sourceUids: [...sourceUids], sourceRefs: [...sourceRefs], lineEvidence }, diagnostics));
    }
    if (!output.length) {
        const invalid = Math.max(0, (diagnostics.invalidLines?.length || 0) - invalidStart);
        throw new Error(invalid
            ? `已识别条目格式，但本批${invalid}行缺少有效旧UID证据或人物信息来源`
            : '未找到可验证的重建条目');
    }
    return output;
}


function migrationLineSupportedBySources(line, sourceUids, recordByUid) {
    const coreLine = String(line ?? '').replace(/\s*｜\s*(?:信息来源|认知来源)\s*[：:].*$/u, '').trim();
    const fact = normalizeMigrationEvidenceText(stripGenericFactLabel(coreLine));
    if (!fact || fact.length < 4) return true;
    const factGrams = migrationBigrams(fact);
    for (const uid of sourceUids ?? []) {
        const record = recordByUid.get(String(uid));
        if (!record) continue;
        const source = normalizeMigrationEvidenceText(`${record.title}\n${record.content}\n${(record.keywords ?? []).join(' ')}`);
        if (!source) continue;
        if (source.includes(fact) || (fact.length >= 8 && fact.includes(source))) return true;
        const shared = [...factGrams].filter((gram) => source.includes(gram)).length;
        const coverage = factGrams.size ? shared / factGrams.size : 0;
        const anchors = migrationEvidenceAnchors(fact);
        const anchorHits = anchors.filter((anchor) => source.includes(anchor)).length;
        // 短结果允许通过一个明确二字锚点完成同义改写；长句仍要求更高覆盖率，避免无关扩写。
        if ((fact.length <= 12 && shared >= 1) || coverage >= 0.35 || (anchorHits >= 2 && coverage >= 0.2) || (anchorHits >= 1 && coverage >= 0.34)) return true;
    }
    return false;
}

function normalizeMigrationEvidenceText(value) {
    return (0, util_1.normalizeFact)(String(value ?? ''))
        .replace(/(?:已经|目前|当前|仍然|曾经|此前|后来|最终|明确|确认|形成|相关|主要|负责|属于)/gu, '')
        .replace(/[“”‘’"'（）()【】\[\]，,。；;：:\s]/gu, '');
}

function migrationEvidenceAnchors(value) {
    const generic = new Set(['世界', '人物', '角色', '物品', '事件', '场景', '状态', '结果', '情况', '规则', '内容', '相关', '当前', '已经']);
    return (0, util_1.unique)(String(value ?? '').match(/[\p{Script=Han}A-Za-z0-9·-]{2,16}/gu) ?? [])
        .filter((item) => item.length >= 2 && !generic.has(item))
        .slice(0, 12);
}

function migrationBigrams(value) {
    const text = String(value ?? '');
    const out = new Set();
    for (let index = 0; index < text.length - 1; index += 1) out.add(text.slice(index, index + 2));
    return out;
}

function isGeneralizedRebuildRuleLine(type, section, line) {
    const ruleSections = new Set(['自然规则', '社会规则', '制度', '局部约束', '功能', '限制', '稳定', '关系']);
    if (!ruleSections.has(String(section ?? ''))) return false;
    if (!['基础设定', '世界', '场景', '物品', '人物'].includes(String(type ?? ''))) return false;
    return /(?:每当|一旦|只要|必须|不得|只能|固定|通常|会在|持续至|触发|条件|约定|制度|规则|机制|流程|权限|限制)/u.test(String(line ?? ''));
}

function rebuildRuleLineSupported(line, refs, policy = {}) {
    const sourceLineByRef = policy.sourceLineByRef instanceof Map ? policy.sourceLineByRef : null;
    if (!sourceLineByRef?.size) return true;
    const sourceItems = (refs ?? []).map((ref) => sourceLineByRef.get(ref)).filter(Boolean);
    if (!sourceItems.length) return false;
    const explicitRule = sourceItems.some((item) => /(?:每当|一旦|只要|必须|不得|只能|固定|通常|触发|条件|约定|制度|规则|机制|流程|权限|限制)/u.test(String(item.text ?? '')));
    if (explicitRule) return true;
    const refToAnchor = new Map();
    const catalog = policy.anchorCatalog instanceof Map ? [...policy.anchorCatalog.values()] : (policy.anchorCatalog ?? []);
    for (const anchor of catalog) for (const ref of anchor.refs ?? []) refToAnchor.set(ref, anchor.id);
    const anchors = new Set((refs ?? []).map((ref) => refToAnchor.get(ref)).filter(Boolean));
    if (anchors.size < 2) return false;
    const fact = normalizeMigrationEvidenceText(stripGenericFactLabel(line));
    const factAnchors = migrationEvidenceAnchors(fact);
    const factGrams = migrationBigrams(fact);
    const repeatedSupport = sourceItems.filter((item) => {
        const source = normalizeMigrationEvidenceText(item.text);
        const anchorHit = factAnchors.some((anchor) => source.includes(anchor));
        const shared = [...factGrams].filter((gram) => source.includes(gram)).length;
        const coverage = factGrams.size ? shared / factGrams.size : 0;
        return anchorHit || coverage >= 0.28;
    }).length;
    return repeatedSupport >= 2;
}

function applyRebuildTemporalSettlement(rawBlock, diagnostics = { warnings: [] }) {
    const block = (0, util_1.clone)(rawBlock);
    block.temporalState = normalizeRebuildTemporalState(block.temporalState, block.type);
    block.sceneAnchors = (0, util_1.unique)(block.sceneAnchors ?? []);
    block.primarySceneAnchor = block.primarySceneAnchor || block.sceneAnchors[0] || '';
    block.gameTime = normalizeRebuildGameTime(block.gameTime);
    block.timeSource = normalizeRebuildTimeSource(block.timeSource);
    block.anchorLocation = String(block.anchorLocation || '未知').trim() || '未知';
    if (!['已完成', '已结束'].includes(block.temporalState)) return block;
    const dynamicByType = {
        人物: new Set(['当前']),
        场景: new Set(['当前状态', '在场', '当前资源', '活动关联']),
        物品: new Set(['当前']),
    };
    const dynamic = dynamicByType[block.type];
    if (!(dynamic instanceof Set)) return block;
    const retained = [];
    const moved = [];
    const lineMap = new Map();
    for (const section of block.sections ?? []) {
        if (!dynamic.has(section.name)) {
            retained.push(section);
            continue;
        }
        for (const line of section.lines ?? []) {
            const pastLine = toCompletedRebuildFactLine(line, section.name);
            moved.push(pastLine);
            lineMap.set(`${section.name}\u0000${line}`, pastLine);
        }
    }
    if (!moved.length) return block;
    let history = retained.find((section) => section.name === '固定事实');
    if (!history) {
        history = { name: '固定事实', lines: [], empty: false };
        retained.push(history);
    }
    history.lines = dedupeMigrationLines([...(history.lines ?? []), ...moved]);
    history.empty = history.lines.length === 0;
    block.sections = retained.filter((section) => section.lines?.length);
    block.lineEvidence = (block.lineEvidence ?? []).map((evidence) => {
        const replacement = lineMap.get(`${evidence.section}\u0000${evidence.line}`);
        return replacement ? { ...evidence, section: '固定事实', line: replacement } : evidence;
    });
    diagnostics.warnings ?? (diagnostics.warnings = []);
    diagnostics.warnings.push(`${block.title}已标记为${block.temporalState}，${moved.length}条旧动态状态已转为过去完成态，未继续占用当前栏目`);
    return block;
}

function toCompletedRebuildFactLine(value, sourceSection = '') {
    const line = (0, parser_1.normalizePointLine)(String(value ?? '').trim());
    if (/^(?:曾|过去|此前|当时|已结束|已完成|历史状态)/u.test(line)) return line;
    const field = line.match(/^([^：:]{1,24})\s*[：:]\s*(.+)$/u);
    const rawLabel = String(field?.[1] || '').replace(/^当前/u, '').trim();
    const valueText = String(field?.[2] || line)
        .replace(/正在/gu, '曾')
        .replace(/当前/gu, '当时')
        .replace(/仍然|仍在/gu, '当时')
        .trim();
    const label = ({
        在场: '历史在场',
        当前状态: '历史状态',
        当前资源: '历史资源',
        活动关联: '历史关联',
        当前: /位置/u.test(rawLabel) ? '历史位置' : /目标/u.test(rawLabel) ? '历史目标' : /状态|伤势|情绪/u.test(rawLabel) ? '历史状态' : `历史${rawLabel || '事实'}`,
    })[sourceSection] || `历史${rawLabel || '事实'}`;
    return `${label}：${valueText}`;
}

function preserveSparseRebuildBlocks(blocks, records, schema, diagnostics = { warnings: [] }) {
    const recordByUid = new Map((records ?? []).map((record) => [String(record.uid), record]));
    return (blocks ?? []).map((rawBlock) => {
        const block = (0, util_1.clone)(rawBlock);
        block.sections = (block.sections ?? []).map((section) => ({
            ...section,
            lines: dedupeMigrationLines((section.lines ?? []).filter((line) => !isTautologicalRebuildLine(block, line))),
        })).filter((section) => section.lines.length);
        const factCount = allBlockFactLines(block).length;
        if (block.type === '世界' && isGenericWorldName(block.name)) stabilizeGenericWorldBlockName(block, recordByUid);
        const explicitlyCoveredRefs = new Set((block.lineEvidence ?? []).filter((item) => item.explicit === true).flatMap((item) => item.refs ?? []));
        const allPlannedRefsCompressed = (block.sourceRefs ?? []).length > 0 && (block.sourceRefs ?? []).every((ref) => explicitlyCoveredRefs.has(String(ref)));
        if (allPlannedRefsCompressed) return block;
        if (factCount >= 2 || !['世界', '基础设定', '物品', '场景', '人物'].includes(block.type)) return block;
        const allowed = schema?.allowedSectionsByType?.[block.type] ?? TYPE_ALLOWED_SECTIONS[block.type];
        const byName = new Map((block.sections ?? []).map((section) => [section.name, section]));
        let restored = 0;
        for (const uid of block.sourceUids ?? []) {
            const record = recordByUid.get(String(uid));
            if (!record || recordType(record, schema) !== block.type) continue;
            const parsed = (0, parser_1.parseEntrySections)(record.content || '');
            for (const rawName of parsed.order ?? Object.keys(parsed.values ?? {})) {
                const name = (0, information_point_1.canonicalSectionName)(rawName, block.type);
                if (allowed instanceof Set && !allowed.has(name)) continue;
                const sourceLines = (parsed.values?.[rawName] ?? parsed.values?.[name] ?? [])
                    .map(parser_1.normalizePointLine)
                    .filter((line) => line && !isTautologicalRebuildLine(block, line));
                if (!sourceLines.length) continue;
                let section = byName.get(name);
                if (!section) {
                    section = { name, lines: [], empty: false };
                    block.sections.push(section);
                    byName.set(name, section);
                }
                const before = section.lines.length;
                section.lines = dedupeMigrationLines([...(section.lines ?? []), ...sourceLines]).slice(0, 8);
                restored += Math.max(0, section.lines.length - before);
            }
        }
        if (restored) diagnostics.warnings.push(`${block.title}的模型结果过于空泛，已从其旧UID来源恢复${restored}条原有事实，避免生成空壳条目`);
        return block;
    }).filter((block) => (block.sections ?? []).some((section) => section.lines?.length));
}

function stabilizeGenericWorldBlockName(block, recordByUid) {
    const candidates = (block.sourceUids ?? []).map((uid) => recordByUid.get(String(uid)))
        .filter((record) => record && recordType(record) === '世界')
        .map((record) => ({
            record,
            name: (0, util_1.splitTitle)((0, util_1.normalizeTitle)(record.title))?.name || record.name || '',
        }))
        .filter((item) => item.name && !isGenericWorldName(item.name))
        .sort((left, right) => String(right.record.content ?? '').length - String(left.record.content ?? '').length);
    if (!candidates.length) return;
    block.name = candidates[0].name;
    block.title = `世界｜${block.name}`;
}

function isTautologicalRebuildLine(block, line) {
    const fact = (0, util_1.normalizeFact)(stripGenericFactLabel(line));
    const name = (0, util_1.normalizeFact)(block?.name ?? '');
    if (!fact) return true;
    if (name && (fact === name || fact === `${name}${name}`)) return true;
    return /^(?:无|暂无|同名条目|相关内容|具体情况|世界情况|当前局势|暂无更多信息|未说明|<<<endentry>>>|uid[:：]?\d+|重建待确认·?\d*)$/iu.test(fact);
}

function dedupeMigrationLines(lines) {
    const output = [];
    for (const line of lines ?? []) {
        const normalized = (0, util_1.normalizeFact)(stripGenericFactLabel(line));
        if (!normalized) continue;
        const duplicate = output.some((current) => {
            const existing = (0, util_1.normalizeFact)(stripGenericFactLabel(current));
            return existing === normalized
                || (Math.min(existing.length, normalized.length) >= 8 && (existing.includes(normalized) || normalized.includes(existing)))
                || (Math.min(existing.length, normalized.length) >= 12 && bigramSimilarity(existing, normalized) >= 0.82);
        });
        if (!duplicate) output.push(line);
    }
    return output;
}

function parseRebuildEnvelope(raw, diagnostics, policy = {}) {
    const universalBlocks = parseUniversalRebuildFormat(raw, diagnostics, policy);
    if (universalBlocks.length) return universalBlocks;
    const jsonBlocks = parseRebuildJson(raw, diagnostics, policy);
    if (jsonBlocks.length) return jsonBlocks;
    const normalized = normalizeRebuildText(raw, diagnostics, policy);
    if (/^(?:无|EMPTY)$/iu.test(normalized.trim())) return [];
    try {
        if (/<<<\s*ENTRY\s*[:：]/iu.test(normalized)) {
            const strict = parseStrictRebuildBlocks(normalized, policy);
            if (strict.length) return strict;
        }
        return (0, parser_1.parseInformationPoints)(normalized);
    }
    catch (error) {
        const sample = normalized.replace(/\s+/gu, ' ').slice(0, 220);
        throw new Error(`模型返回无法解析；已兼容代码块、Markdown标题、冒号标题和JSON。返回开头：${sample || '（空）'}`);
    }
}


function parseUniversalRebuildFormat(raw, diagnostics, policy = {}) {
    const text = String(raw ?? '')
        .replace(/<think>[\s\S]*?<\/think>/giu, '')
        .replace(/```(?:json|text|markdown|md)?/giu, '')
        .replace(/\r/g, '')
        .trim();
    if (!new RegExp(`^\\s*【\\s*${UNIVERSAL_ENTRY_MARKER}\\s*】\\s*$`, 'mu').test(text)) return [];
    const segments = text.split(new RegExp(`^\\s*【\\s*${UNIVERSAL_ENTRY_MARKER}\\s*】\\s*$`, 'gmu')).slice(1);
    const blocks = [];
    for (const segment of segments) {
        const metadata = {};
        const contentLines = [];
        const knowledgeLines = [];
        const pastLines = [];
        const keywords = [];
        let section = '';
        for (const rawLine of segment.split('\n')) {
            const line = String(rawLine ?? '').trim();
            if (!line) continue;
            const heading = line.match(/^【\s*([^】]+?)\s*】$/u)?.[1]?.trim();
            if (heading && UNIVERSAL_SECTION_NAMES.has(heading)) {
                section = heading;
                continue;
            }
            const plain = (0, parser_1.stripListMarker)(line).trim();
            if (!section) {
                const meta = plain.match(/^([^：:]{1,24})\s*[：:]\s*(.*?)\s*$/u);
                if (meta && UNIVERSAL_METADATA_NAMES.has(meta[1].trim())) metadata[meta[1].trim()] = meta[2].trim();
                continue;
            }
            if (section === '内容') contentLines.push(plain);
            else if (section === '角色认知') knowledgeLines.push(plain);
            else if (section === '过去结果') pastLines.push(plain);
            else if (section === '关键词') keywords.push(...plain.split(/[,，、]/u).map((item) => item.trim()).filter(Boolean));
        }
        const name = String(metadata.名称 ?? '').trim();
        const targetType = String(metadata.归入类型 ?? '').trim();
        if (!name || !targetType) {
            diagnostics.warnings.push('通用新条目缺少“名称”或“归入类型”，已丢弃');
            continue;
        }
        const rawFields = contentLines.map((line) => line.match(/^([^：:]{1,24})\s*[：:]\s*(.+)$/u)?.[1]?.trim()).filter(Boolean);
        if (pastLines.length) rawFields.push('过去结果');
        let type = '';
        let proposalAccepted = false;
        let proposalDescription = '';
        if ((0, util_1.normalizeFact)(targetType) === (0, util_1.normalizeFact)('新类型建议')) {
            if (policy.allowNewTypes !== true) {
                diagnostics.warnings.push(`“${name}”所在重建阶段不允许创建新类型，已丢弃建议`);
                continue;
            }
            proposalDescription = String(metadata.与现有类型区别 ?? '').trim();
            const accepted = registerProposedMigrationType(policy.schema, metadata.建议类型, rawFields, proposalDescription, name, diagnostics);
            if (!accepted) continue;
            type = accepted.type;
            proposalAccepted = accepted.created;
        }
        else {
            type = resolveMigrationType(targetType, policy.schema);
            if (!policy.schema?.definitions?.has(type)) {
                diagnostics.warnings.push(`“${name}”填写了不存在的归入类型“${targetType}”；应使用已有类型或明确写“新类型建议”`);
                continue;
            }
        }
        const allowedTypes = policy.allowedTypes instanceof Set ? policy.allowedTypes : ALLOWED_TYPES;
        if (!proposalAccepted && !allowedTypes.has(type)) {
            diagnostics.warnings.push(`“${name}”归入类型“${type}”不属于当前重建阶段，已丢弃`);
            continue;
        }
        const sectionsByName = new Map();
        const addLine = (sectionName, line) => {
            if (!sectionName || !line) return;
            const current = sectionsByName.get(sectionName) ?? [];
            current.push(line);
            sectionsByName.set(sectionName, current);
        };
        for (const line of contentLines) {
            const field = line.match(/^([^：:]{1,24})\s*[：:]\s*(.+)$/u);
            if (!field) {
                diagnostics.warnings.push(`${type}｜${name}【内容】存在无法识别的行，已丢弃：${line.slice(0, 80)}`);
                continue;
            }
            const rawField = field[1].trim();
            const value = field[2].trim();
            const sectionName = resolveUniversalFieldSection(type, rawField, policy.schema, proposalAccepted);
            if (!sectionName) {
                diagnostics.warnings.push(`${type}｜${name}的栏目“${rawField}”无法归入该类型，已丢弃`);
                continue;
            }
            addLine(sectionName, `${rawField}：${value}`);
        }
        for (const line of knowledgeLines) {
            if (type !== '人物') {
                diagnostics.warnings.push(`${type}｜${name}的【角色认知】不属于人物条目，已丢弃`);
                continue;
            }
            const parsed = parseUniversalKnowledgeLine(line, name, metadata.别名);
            if (!parsed) {
                diagnostics.warnings.push(`人物｜${name}存在无法验证的角色认知行，已丢弃`);
                continue;
            }
            addLine(parsed.section, parsed.line);
        }
        const pastSection = universalPastSection(type, policy.schema, proposalAccepted);
        if (pastSection) for (const line of pastLines) addLine(pastSection, line);
        else if (pastLines.length) diagnostics.warnings.push(`${type}｜${name}没有适合保存【过去结果】的栏目，相关行已丢弃`);
        if (metadata.别名) {
            const marker = sourceMarkerSuffix(metadata.别名);
            const clean = String(metadata.别名).replace(SOURCE_MARKER, '').trim();
            SOURCE_MARKER.lastIndex = 0;
            for (const alias of clean.split(/[,，、]/u).map((item) => item.trim()).filter(Boolean)) addLine('别名', `${alias}${marker}`);
        }
        const sections = [...sectionsByName.entries()].map(([sectionName, lines]) => ({ name: sectionName, lines: (0, util_1.unique)(lines), empty: false })).filter((sectionItem) => sectionItem.lines.length);
        if (!sections.length) continue;
        const groupId = String(metadata.组ID ?? '').trim();
        const groupSceneAnchors = policy.sceneAnchorsByGroup instanceof Map ? policy.sceneAnchorsByGroup.get(groupId) : null;
        const allowedSceneAnchors = groupSceneAnchors instanceof Set
            ? groupSceneAnchors
            : policy.allowedSceneAnchors instanceof Set ? policy.allowedSceneAnchors : null;
        const requestedSceneAnchors = parseSceneAnchorList(metadata.场景锚点);
        const fallbackSceneAnchors = (0, util_1.unique)(groupSceneAnchors instanceof Set ? [...groupSceneAnchors] : policy.defaultSceneAnchors ?? []);
        const sceneAnchors = (0, util_1.unique)((requestedSceneAnchors.length ? requestedSceneAnchors : fallbackSceneAnchors)
            .filter((anchor) => !allowedSceneAnchors || allowedSceneAnchors.has(anchor)));
        if (requestedSceneAnchors.length && !sceneAnchors.length && fallbackSceneAnchors.length) {
            diagnostics.warnings.push(`${type}｜${name}填写了不属于当前规划组的场景锚点，已改用规划阶段锚点`);
            sceneAnchors.push(...fallbackSceneAnchors.filter((anchor) => !allowedSceneAnchors || allowedSceneAnchors.has(anchor)));
        }
        const temporal = resolveBlockTemporalMetadata({
            sceneAnchors,
            gameTime: metadata.游戏时间,
            timeSource: metadata.时间来源,
            temporalState: metadata.时态,
            type,
        }, policy);
        blocks.push({
            rawTitle: `${type}｜${name}`,
            title: `${type}｜${name}`,
            type,
            name,
            sections,
            keywords: (0, util_1.unique)(keywords),
            mergeSourceUids: parseUniversalUidList(metadata.合并来源),
            sourceRefs: parseSourceRefList(metadata.来源行),
            newTypeProposalAccepted: proposalAccepted,
            proposedTypeDescription: proposalDescription,
            planGroupId: groupId,
            retentionMode: String(metadata.保留方式 ?? '').trim(),
            mergeIntoTitle: (0, util_1.normalizeTitle)(String(metadata.并入条目 ?? '').trim()),
            mergeIntoSection: String(metadata.并入栏目 ?? '').trim(),
            sceneAnchors: temporal.sceneAnchors,
            primarySceneAnchor: temporal.primarySceneAnchor,
            gameTime: temporal.gameTime,
            timeSource: temporal.timeSource,
            temporalState: temporal.temporalState,
            anchorLocation: temporal.anchorLocation,
        });
    }
    if (blocks.length) {
        diagnostics.parserRepairs = Number(diagnostics.parserRepairs || 0) + 1;
        diagnostics.warnings.push('模型返回了通用“新条目提案”格式，已在本地转换为世界书条目');
    }
    return blocks;
}

function parseSceneAnchorList(value) {
    return (0, util_1.unique)(String(value ?? '').toUpperCase().match(/S\d{1,6}/gu) ?? [])
        .map((anchor) => `S${String(Number(anchor.slice(1)) || 0).padStart(3, '0')}`)
        .filter((anchor) => anchor !== 'S000');
}

function resolveBlockTemporalMetadata(metadata, policy = {}) {
    const catalog = policy.anchorCatalog instanceof Map
        ? policy.anchorCatalog
        : new Map((policy.anchorCatalog ?? []).map((anchor) => [anchor.id, anchor]));
    const sceneAnchors = (0, util_1.unique)(metadata.sceneAnchors ?? []).filter(Boolean);
    const primarySceneAnchor = sceneAnchors[0] || '';
    const selected = sceneAnchors.map((anchor) => catalog.get(anchor)).filter(Boolean);
    const gameTimes = (0, util_1.unique)(selected.map((anchor) => normalizeRebuildGameTime(anchor.gameTime)).filter((value) => value && value !== '未知'));
    const locations = (0, util_1.unique)(selected.map((anchor) => String(anchor.location || '').trim()).filter((value) => value && value !== '未知'));
    const sources = selected.map((anchor) => normalizeRebuildTimeSource(anchor.timeSource));
    const gameTime = selected.length && gameTimes.length < selected.length
        ? (gameTimes.length ? `${gameTimes[0]} 至 未知` : '未知')
        : gameTimes.length > 1 ? `${gameTimes[0]} 至 ${gameTimes.at(-1)}` : gameTimes[0] || normalizeRebuildGameTime(metadata.gameTime);
    const timeSource = selected.length
        ? (sources.includes('未知') ? '未知' : sources.includes('推定') ? '推定' : '明确')
        : normalizeRebuildTimeSource(metadata.timeSource);
    const anchorLocation = locations.length > 1 ? locations.join('、') : locations[0] || '未知';
    return {
        sceneAnchors,
        primarySceneAnchor,
        gameTime,
        timeSource,
        temporalState: normalizeRebuildTemporalState(metadata.temporalState, metadata.type),
        anchorLocation,
    };
}

function parseUniversalUidList(value) {
    return (0, util_1.unique)(String(value ?? '')
        .replace(SOURCE_MARKER, (_match, group) => String(group ?? ''))
        .split(/[,，、\s]+/u)
        .map((item) => item.replace(/^(?:UID|旧UID|来源)\s*[:：]?/iu, '').trim())
        .filter(Boolean));
}

function parseSourceRefList(value) {
    return (0, util_1.unique)(String(value ?? '')
        .replace(SOURCE_LINE_MARKER, (_match, group) => String(group ?? ''))
        .split(/[,，、\s]+/u)
        .map((item) => item.trim().replace(/^来源行\s*[：:]?/u, ''))
        .filter((item) => /^.+:s\d+:l\d+$/u.test(item)));
}

function stripSourceLineMarkers(value) {
    const text = String(value ?? '').replace(SOURCE_LINE_MARKER, '').trim();
    SOURCE_LINE_MARKER.lastIndex = 0;
    return text;
}

function sourceMarkerSuffix(value) {
    const markers = [];
    String(value ?? '').replace(SOURCE_MARKER, (match) => { markers.push(match); return ''; });
    SOURCE_MARKER.lastIndex = 0;
    return markers.join('');
}

function resolveUniversalFieldSection(type, rawField, schema, proposed = false) {
    const field = String(rawField ?? '').trim().replace(/\s+/gu, '');
    if (!field) return '';
    const allowed = schema?.allowedSectionsByType?.[type];
    if (allowed instanceof Set && allowed.has(field)) return field;
    if (proposed) return field;
    const aliases = UNIVERSAL_FIELD_ALIASES[type] ?? {};
    const normalized = (0, util_1.normalizeFact)(field);
    for (const [section, values] of Object.entries(aliases)) {
        if (values.some((value) => (0, util_1.normalizeFact)(value) === normalized)) return allowed instanceof Set && !allowed.has(section) ? '' : section;
    }
    if (allowed instanceof Set) {
        const candidates = [...allowed].filter((section) => section !== '别名');
        const direct = candidates.find((section) => {
            const left = (0, util_1.normalizeFact)(section);
            return left === normalized || (Math.min(left.length, normalized.length) >= 2 && (left.includes(normalized) || normalized.includes(left)));
        });
        if (direct) return direct;
    }
    return '';
}

function parseUniversalKnowledgeLine(value, entryName, aliasText = '') {
    const marker = sourceMarkerSuffix(value);
    const clean = String(value ?? '').replace(SOURCE_MARKER, '').trim();
    SOURCE_MARKER.lastIndex = 0;
    const match = clean.match(/^([^｜|]+)[｜|](知道|已知|怀疑|认为|推测|判断|误以为|误信|错误相信)\s*[：:]\s*(.*?)\s*[｜|]\s*(?:来源|信息来源|认知来源)\s*[：:]\s*([^｜|]+?)(?:\s*[｜|]\s*(?:证伪|证伪依据|证伪事实)\s*[：:]\s*(.+))?$/u);
    if (!match) return null;
    const observer = match[1].trim();
    const aliases = String(aliasText ?? '').replace(SOURCE_MARKER, '').split(/[,，、]/u).map((item) => item.trim()).filter(Boolean);
    SOURCE_MARKER.lastIndex = 0;
    const validObserver = [entryName, ...aliases].some((name) => (0, util_1.normalizeFact)(name) === (0, util_1.normalizeFact)(observer));
    if (!validObserver) return null;
    const mode = match[2];
    const fact = match[3].trim();
    const source = match[4].trim();
    const disprovedBy = String(match[5] ?? '').trim();
    if (!fact || !source) return null;
    // [MA-EPISTEMIC-03] “怀疑/认为/推测”只是人物当前认知，不代表错误。
    // 只有模型明确写出误信且同时提供证伪依据，才进入【误信】；否则统一进入【已知】。
    const requestedMistaken = /(?:误以为|误信|错误相信)/u.test(mode);
    const mistaken = requestedMistaken && Boolean(disprovedBy);
    return {
        section: mistaken ? '误信' : '已知',
        line: `${fact}｜信息来源：${source}${mistaken ? `｜证伪依据：${disprovedBy}` : ''}${marker}`,
    };
}

function universalPastSection(type, schema, proposed = false) {
    if (proposed) return '过去结果';
    const builtin = ({ 人物: '固定事实', 场景: '固定事实', 物品: '固定事实', 事件: '结果', 世界: '固定事实' })[type];
    if (builtin) return builtin;
    const allowed = schema?.allowedSectionsByType?.[type];
    if (!(allowed instanceof Set)) return '';
    return [...allowed].find((section) => /(?:历史|变化|结果|进展|经历)/u.test(section)) ?? '';
}

function parseStrictRebuildBlocks(raw, policy = {}) {
    const allowedTypes = policy.allowedTypes instanceof Set ? policy.allowedTypes : ALLOWED_TYPES;
    const blocks = [];
    const pattern = /<<<ENTRY\s*[:：]\s*([^:\r\n>]+)\s*[:：]\s*([^>\r\n]+)>>>([\s\S]*?)(?=<<<ENTRY\s*[:：]|$)/giu;
    for (const match of String(raw ?? '').matchAll(pattern)) {
        const type = resolveMigrationType(match[1], policy.schema);
        const name = String(match[2] ?? '').trim();
        if (!allowedTypes.has(type) || !name) continue;
        const segment = String(match[3] ?? '');
        const contentIndex = segment.search(/<<<CONTENT>>>/iu);
        const content = contentIndex >= 0 ? segment.slice(contentIndex + '<<<CONTENT>>>'.length).replace(/<<<END_ENTRY>>>[\s\S]*$/iu, '') : segment;
        const parsed = (0, parser_1.parseEntrySections)(content);
        const allowedSections = policy.allowedSectionsByType?.[type];
        const sections = parsed.order.filter((section) => !(allowedSections instanceof Set) || allowedSections.has(section)).map((section) => ({ name: section, lines: parsed.values[section] ?? [], empty: false })).filter((section) => section.lines.length);
        if (sections.length) blocks.push({ rawTitle: `${type}｜${name}`, title: `${type}｜${name}`, type, name, sections, keywords: [] });
    }
    return blocks;
}

const REBUILD_SECTION_NAMES = new Set([
    '身份', '稳定', '当前', '关系', '持有', '已知', '误信', '固定事实', '持续经历', '别名',
    '定义', '空间结构', '固定资源', '固定事实', '持续变化', '当前状态', '在场', '当前资源', '活动关联', '世界影响', '局部约束',
    '功能', '限制', '参与', '场景', '已发生进展', '未发生进展', '关键进展', '结果',
    '范围', '地理', '组织', '权力', '制度', '资源与交通', '公开局势', '固定事实', '世界变化', '持续影响',
    '世界常识', '自然规则', '种族与生命', '能力与技术', '社会规则', '地理框架',
]);

function normalizeRebuildText(raw, diagnostics, policy = {}) {
    let text = String(raw ?? '')
        .replace(/<think>[\s\S]*?<\/think>/giu, '')
        .replace(/```(?:json|text|markdown|md)?/giu, '')
        .replace(/[＜﹤]/gu, '<')
        .replace(/[＞﹥]/gu, '>')
        .replace(/\r/g, '')
        .trim();
    const lines = [];
    let repairs = 0;
    for (const original of text.split('\n')) {
        let line = original.trimEnd();
        const title = line.match(/^\s*(?:#{1,6}\s*)?(?:\*\*|__|`)?([^｜|丨:：—–\n]{1,32})\s*(?:[｜|丨]|[:：]|[-—–])\s*(.+?)(?:\*\*|__|`)?\s*$/iu);
        if (title) {
            const type = resolveMigrationType(title[1], policy.schema);
            const name = String(title[2] ?? '').replace(/(?:\*\*|__|`)$/u, '').trim().replace(/^[【\[]|[】\]]$/gu, '');
            const allowedTitleTypes = policy.allowedTypes instanceof Set ? policy.allowedTypes : ALLOWED_TYPES;
            if (type && name && allowedTitleTypes.has(type)) {
                const canonical = `${type}｜${name}`;
                if (canonical !== line.trim()) repairs += 1;
                lines.push(canonical);
                continue;
            }
        }
        const headingLine = line.replace(/^\s*#{1,6}\s*/u, '').replace(/\*\*|__/gu, '').replace(/`/gu, '').trim();
        const section = headingLine.match(/^(?:【|\[)?([^】\]\n]{1,24}?)(?:】|\])?\s*[:：]?\s*$/u);
        if (section) {
            const name = String(section[1] ?? '').replace(/\s+/gu, '').trim();
            const allowedSectionNames = new Set([...REBUILD_SECTION_NAMES, ...Object.values(policy.allowedSectionsByType ?? {}).flatMap((value) => value instanceof Set ? [...value] : [])]);
            if (allowedSectionNames.has(name)) {
                const canonical = `【${name}】`;
                if (canonical !== line.trim()) repairs += 1;
                lines.push(canonical);
                continue;
            }
        }
        lines.push(line);
    }
    if (repairs) {
        diagnostics.parserRepairs = Number(diagnostics.parserRepairs || 0) + repairs;
        diagnostics.warnings.push(`本地解析器修复了${repairs}处Markdown或标题格式，不追加模型调用`);
    }
    return lines.join('\n').trim();
}

function parseRebuildJson(raw, diagnostics, policy = {}) {
    const text = String(raw ?? '')
        .replace(/<think>[\s\S]*?<\/think>/giu, '')
        .replace(/```(?:json)?/giu, '')
        .trim();
    const candidates = [text];
    const objectStart = text.indexOf('{');
    const objectEnd = text.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) candidates.push(text.slice(objectStart, objectEnd + 1));
    const arrayStart = text.indexOf('[');
    const arrayEnd = text.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(text.slice(arrayStart, arrayEnd + 1));
    let value = null;
    for (const candidate of candidates) {
        try {
            value = JSON.parse(candidate);
            break;
        }
        catch { }
    }
    if (value == null) return [];
    const entries = jsonEntries(value);
    const blocks = entries.map(([key, entry]) => jsonEntryToBlock(entry, key, policy)).filter(Boolean);
    if (blocks.length) {
        diagnostics.parserRepairs = Number(diagnostics.parserRepairs || 0) + 1;
        diagnostics.warnings.push('模型返回了JSON，已在本地转换为可验证重建条目，未追加模型调用');
    }
    return blocks;
}

function jsonEntries(value) {
    if (Array.isArray(value)) return value.map((entry, index) => [String(index), entry]);
    if (!value || typeof value !== 'object') return [];
    for (const key of ['entries', 'blocks', 'items', 'results', 'data']) {
        const nested = value[key];
        if (Array.isArray(nested)) return nested.map((entry, index) => [String(index), entry]);
        if (nested && typeof nested === 'object') return Object.entries(nested);
    }
    const keys = Object.keys(value);
    if (keys.some((key) => (0, util_1.splitTitle)((0, util_1.normalizeTitle)(key)))) return Object.entries(value);
    return [['0', value]];
}

function jsonEntryToBlock(entry, key = '', policy = {}) {
    if (!entry || typeof entry !== 'object') return null;
    let type = resolveMigrationType(entry.type ?? entry.kind ?? entry.category ?? '', policy.schema);
    let name = String(entry.name ?? entry.entity ?? entry.stableName ?? '').trim();
    const rawTitle = String(entry.title ?? entry.comment ?? key ?? '').trim();
    const split = (0, util_1.splitTitle)((0, util_1.normalizeTitle)(rawTitle));
    if (split) {
        type ||= resolveMigrationType(split.type, policy.schema);
        name ||= split.name;
    }
    const allowedTypes = policy.allowedTypes instanceof Set ? policy.allowedTypes : ALLOWED_TYPES;
    if (!type || !name || !allowedTypes.has(type)) return null;
    const defaultSources = jsonSourceIds(entry.sourceUids ?? entry.evidence ?? entry.sources ?? entry.sourceUid);
    const sections = [];
    const explicitSource = entry.sections ?? entry.fields ?? entry.content;
    const source = explicitSource !== undefined
        ? explicitSource
        : Object.fromEntries(Object.entries(entry).filter(([field]) => {
            const name = String(field).replace(/\s+/gu, '');
            const allowed = policy.allowedSectionsByType?.[type];
            return REBUILD_SECTION_NAMES.has(name) || (allowed instanceof Set && allowed.has(name));
        }));
    if (Array.isArray(source)) {
        for (const section of source) {
            if (!section || typeof section !== 'object') continue;
            const sectionName = String(section.name ?? section.section ?? section.title ?? '').trim();
            const lines = jsonLines(section.lines ?? section.items ?? section.facts ?? section.content ?? section.value, defaultSources);
            if (sectionName && lines.length) sections.push({ name: sectionName, lines, empty: false });
        }
    }
    else if (typeof source === 'string') {
        const parsed = (0, parser_1.parseEntrySections)(source);
        for (const sectionName of parsed.order) {
            const lines = jsonLines(parsed.values[sectionName], defaultSources);
            if (lines.length) sections.push({ name: sectionName, lines, empty: false });
        }
    }
    else if (source && typeof source === 'object') {
        for (const [sectionName, sectionValue] of Object.entries(source)) {
            const lines = jsonLines(sectionValue, defaultSources);
            if (lines.length) sections.push({ name: sectionName, lines, empty: false });
        }
    }
    if (!sections.length && Array.isArray(entry.facts)) {
        const lines = jsonLines(entry.facts, defaultSources);
        if (lines.length) sections.push({ name: type === '事件' ? '已发生进展' : type === '场景' ? '当前状态' : '当前', lines, empty: false });
    }
    if (!sections.length) return null;
    return {
        rawTitle: `${type}｜${name}`,
        title: `${type}｜${name}`,
        type,
        name,
        sections,
        keywords: (0, util_1.normalizeStringArray)(entry.keywords ?? entry.keys),
    };
}

function jsonLines(value, defaultSources = []) {
    const values = Array.isArray(value) ? value : value == null ? [] : [value];
    const lines = [];
    for (const item of values) {
        let text = '';
        let ids = defaultSources;
        if (typeof item === 'string' || typeof item === 'number') text = String(item);
        else if (item && typeof item === 'object') {
            text = String(item.text ?? item.fact ?? item.line ?? item.value ?? item.content ?? '');
            ids = jsonSourceIds(item.sourceUids ?? item.evidence ?? item.sources ?? item.sourceUid);
            if (!ids.length) ids = defaultSources;
        }
        text = text.trim();
        if (!text) continue;
        if (!SOURCE_MARKER.test(text) && ids.length) text = `${text}〔证据:${ids.join(',')}〕`;
        SOURCE_MARKER.lastIndex = 0;
        lines.push(text);
    }
    return lines;
}

function jsonSourceIds(value) {
    const values = Array.isArray(value) ? value : value == null ? [] : String(value).split(/[,，、\s]+/u);
    return (0, util_1.unique)(values.map((item) => String(item).trim()).filter(Boolean));
}


const EVENT_PENDING_FACT_PATTERN = /(?:等待|尚未|未完成|未回复|未解决|未见面|尚待|还未|仍需|待确认|目标尚未|双方尚未)/u;
const EVENT_EXPLICIT_CLOSED_PATTERN = /(?:阶段|状态|当前状态)\s*[：:]\s*(?:结束|已结束|完成|已完成|关闭|已关闭)/u;

function preserveEventPendingFacts(blocks, records, diagnostics = { warnings: [] }) {
    // 兼容旧函数名：ui.24 不再把“未决/目标”回填进世界书，只规范已经发生的变化。
    let filtered = 0;
    const output = (blocks ?? []).map((block) => {
        if (block?.type !== '事件') return (0, util_1.clone)(block);
        const before = (block.sections ?? []).reduce((sum, section) => sum + (section.lines ?? []).length, 0);
        const normalized = normalizeEventCompletionBlock(block);
        const after = (normalized.sections ?? []).reduce((sum, section) => sum + (section.lines ?? []).length, 0);
        filtered += Math.max(0, before - after);
        return normalized;
    });
    if (filtered) {
        diagnostics.warnings ?? (diagnostics.warnings = []);
        diagnostics.warnings.push(`事件重建已过滤${filtered}条目标、未决、阶段标签或无状态变化的过程材料`);
    }
    return output;
}

function mergeRebuildBlocks(blocks, diagnostics = { warnings: [] }) {
    const output = [];
    diagnostics.convergedEntries ?? (diagnostics.convergedEntries = 0);
    diagnostics.absorbedEntries ?? (diagnostics.absorbedEntries = 0);
    for (const rawIncoming of blocks) {
        const incoming = normalizeEventCompletionBlock(rawIncoming);
        if (!(incoming.sections ?? []).length) continue;
        const candidate = output.find((current) => sameConvergentBlock(current, incoming));
        if (!candidate) {
            const clone = (0, util_1.clone)(incoming);
            clone.sections = (clone.sections ?? []).map((section) => ({
                ...section,
                lines: removeUnresolvedSlotConflicts(section.name, section.lines, diagnostics, clone.title),
            })).filter((section) => section.lines.length);
            if (clone.sections.length) output.push(clone);
            continue;
        }
        if (preferIncomingRebuildIdentity(candidate, incoming)) {
            candidate.name = incoming.name;
            candidate.title = incoming.title;
        }
        candidate.sourceUids = (0, util_1.unique)([...(candidate.sourceUids ?? []), ...(incoming.sourceUids ?? [])]);
        candidate.sourceRefs = (0, util_1.unique)([...(candidate.sourceRefs ?? []), ...(incoming.sourceRefs ?? [])]);
        candidate.lineEvidence = [...(candidate.lineEvidence ?? []), ...(incoming.lineEvidence ?? [])];
        mergeRebuildTemporalMetadata(candidate, incoming);
        candidate.keywords = (0, util_1.unique)([...(candidate.keywords ?? []), ...(incoming.keywords ?? []), incoming.name]);
        const byName = new Map(candidate.sections.map((section) => [section.name, section]));
        if (candidate.type === '事件' && (0, util_1.normalizeFact)(candidate.name) !== (0, util_1.normalizeFact)(incoming.name)) {
            let aliases = byName.get('别名');
            if (!aliases) {
                aliases = { name: '别名', lines: [], empty: false };
                candidate.sections.push(aliases);
                byName.set('别名', aliases);
            }
            aliases.lines = (0, util_1.unique)([...aliases.lines, incoming.name]);
            aliases.empty = false;
        }
        for (const section of incoming.sections ?? []) {
            const current = byName.get(section.name);
            if (!current) {
                const safe = removeUnresolvedSlotConflicts(section.name, section.lines, diagnostics, candidate.title);
                if (safe.length) {
                    candidate.sections.push({ ...(0, util_1.clone)(section), lines: safe });
                    byName.set(section.name, candidate.sections.at(-1));
                }
            }
            else {
                current.lines = removeUnresolvedSlotConflicts(section.name, [...current.lines, ...section.lines], diagnostics, candidate.title);
            }
        }
        const normalized = normalizeEventCompletionBlock(candidate);
        candidate.sections = normalized.sections;
        diagnostics.convergedEntries += 1;
    }
    return finalizeRebuildBlocks(applyAbsorptionProposals(output, diagnostics), diagnostics);
}

function mergeRebuildTemporalMetadata(target, incoming) {
    target.sceneAnchors = (0, util_1.unique)([...(target.sceneAnchors ?? []), ...(incoming.sceneAnchors ?? [])]);
    target.primarySceneAnchor ||= incoming.primarySceneAnchor || target.sceneAnchors[0] || '';
    if ((!target.gameTime || target.gameTime === '未知') && incoming.gameTime) target.gameTime = incoming.gameTime;
    if ((!target.anchorLocation || target.anchorLocation === '未知') && incoming.anchorLocation) target.anchorLocation = incoming.anchorLocation;
    if (target.timeSource === '未知' && incoming.timeSource) target.timeSource = incoming.timeSource;
    const states = new Set([target.temporalState, incoming.temporalState].filter(Boolean));
    if (states.has('长期')) target.temporalState = '长期';
    else if (states.has('持续')) target.temporalState = '持续';
    else if (states.has('当前')) target.temporalState = '当前';
    else if (states.has('已完成')) target.temporalState = '已完成';
    else if (states.has('已结束')) target.temporalState = '已结束';
}

function sameConvergentBlock(leftBlock, rightBlock) {
    const left = blockAsEntry(leftBlock);
    const right = blockAsEntry(rightBlock);
    if (left.type === '人物' && right.type === '人物') {
        const leftAnchor = rebuildIdentityAnchor(leftBlock);
        const rightAnchor = rebuildIdentityAnchor(rightBlock);
        if (leftAnchor && rightAnchor && (0, util_1.normalizeFact)(leftAnchor) !== (0, util_1.normalizeFact)(rightAnchor)) return false;
    }
    if ((0, matcher_1.sameEntryIdentity)(left, right)) return true;
    if (left.type !== right.type) return false;
    if (left.type === '事件') {
        return (0, matcher_1.sameEventLifecycle)(left, right) || sameEventNarrative(leftBlock, rightBlock);
    }
    const sourceOverlap = (leftBlock.sourceUids ?? []).some((uid) => (rightBlock.sourceUids ?? []).includes(uid));
    if (left.type === '世界' && sourceOverlap && (isGenericWorldName(leftBlock.name) || isGenericWorldName(rightBlock.name))) return true;
    const leftBase = convergenceBaseName(leftBlock.name);
    const rightBase = convergenceBaseName(rightBlock.name);
    if (sourceOverlap && leftBase && leftBase === rightBase) return true;
    const nameRelated = convergenceNameRelated(leftBlock, rightBlock);
    const factOverlap = convergenceFactOverlap(leftBlock, rightBlock);
    return (sourceOverlap && (nameRelated || factOverlap)) || (nameRelated && factOverlap);
}


function isGenericWorldName(value) {
    return /^(?:世界|全局|世界状态|全局状态|当前局势|世界局势|总体局势|世界概况|全局概况|世界信息)$/u.test((0, util_1.normalizeFact)(value));
}

function convergenceBaseName(value) {
    return (0, util_1.normalizeFact)(value)
        .replace(/(?:子条目|附属条目|详情|状态|变化|记录|资料|信息|档案|条目|概况|摘要|补充|其一|其二|一|二|三)$/u, '')
        .replace(/[一二三四五六七八九十0-9]+$/u, '');
}

function preferIncomingRebuildIdentity(current, incoming) {
    if (current.type !== incoming.type) return false;
    if (current.type === '世界') return isGenericWorldName(current.name) && !isGenericWorldName(incoming.name);
    if (current.type === '事件') return isGenericEventName(current.name) && !isGenericEventName(incoming.name);
    const currentBase = convergenceBaseName(current.name);
    const incomingBase = convergenceBaseName(incoming.name);
    return currentBase === incomingBase && String(incoming.name ?? '').length < String(current.name ?? '').length;
}

function sameEventNarrative(left, right) {
    const leftValues = Object.fromEntries((left.sections ?? []).map((section) => [section.name, section.lines ?? []]));
    const rightValues = Object.fromEntries((right.sections ?? []).map((section) => [section.name, section.lines ?? []]));
    const participants = listFactOverlap(leftValues['参与'], rightValues['参与']);
    const scenes = listFactOverlap(leftValues['场景'], rightValues['场景']);
    const narrativeLeft = [...(leftValues['已发生进展'] ?? []), ...(leftValues['关键进展'] ?? []), ...(leftValues['结果'] ?? [])];
    const narrativeRight = [...(rightValues['已发生进展'] ?? []), ...(rightValues['关键进展'] ?? []), ...(rightValues['结果'] ?? [])];
    const narrative = listFactOverlap(narrativeLeft, narrativeRight);
    const names = convergenceNameRelated(left, right);
    const sourceOverlap = (left.sourceUids ?? []).some((uid) => (right.sourceUids ?? []).includes(uid));
    if (sourceOverlap && (participants || scenes || narrative || names)) return true;
    if (participants && scenes && (narrative || names)) return true;
    if (narrative && names && (participants || scenes)) return true;
    return false;
}

function convergenceNameRelated(left, right) {
    const leftNames = (0, util_1.unique)([left.name, ...(left.keywords ?? []), ...sectionLines(left, '别名')].map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    const rightNames = (0, util_1.unique)([right.name, ...(right.keywords ?? []), ...sectionLines(right, '别名')].map((value) => (0, util_1.normalizeFact)(value)).filter(Boolean));
    return leftNames.some((a) => rightNames.some((b) => a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)))));
}

function convergenceFactOverlap(left, right) {
    return listFactOverlap(allBlockFactLines(left), allBlockFactLines(right));
}

function listFactOverlap(leftLines = [], rightLines = []) {
    const left = (leftLines ?? []).map((line) => (0, util_1.normalizeFact)(stripGenericFactLabel(line))).filter((line) => line.length >= 4);
    const right = (rightLines ?? []).map((line) => (0, util_1.normalizeFact)(stripGenericFactLabel(line))).filter((line) => line.length >= 4);
    return left.some((a) => right.some((b) => a === b || (Math.min(a.length, b.length) >= 5 && (a.includes(b) || b.includes(a))) || bigramSimilarity(a, b) >= 0.62));
}

function bigramSimilarity(left, right) {
    const grams = (value) => {
        const text = String(value ?? '');
        const out = new Set();
        for (let i = 0; i < text.length - 1; i += 1) out.add(text.slice(i, i + 2));
        return out;
    };
    const a = grams(left);
    const b = grams(right);
    if (!a.size || !b.size) return 0;
    let shared = 0;
    for (const gram of a) if (b.has(gram)) shared += 1;
    return (2 * shared) / (a.size + b.size);
}

function sectionLines(block, name) {
    return (block.sections ?? []).find((section) => section.name === name)?.lines ?? [];
}

function allBlockFactLines(block) {
    return (block.sections ?? []).filter((section) => section.name !== '别名' && section.name !== REBUILD_SPACETIME_SECTION).flatMap((section) => section.lines ?? []);
}

function stripGenericFactLabel(value) {
    return String(value ?? '').replace(/^\s*[^：:]{1,24}\s*[：:]\s*/u, '').trim();
}


function finalizeRebuildBlocks(blocks, diagnostics = { warnings: [] }) {
    const output = disambiguateRebuildIdentities((blocks ?? []).map((block) => applyRebuildTemporalSettlement((0, util_1.clone)(block), diagnostics)), diagnostics);
    diagnostics.removedDuplicateFacts ?? (diagnostics.removedDuplicateFacts = 0);
    for (const block of output) {
        const seen = [];
        const orderedSections = [...(block.sections ?? [])].sort((left, right) => rebuildSectionPriority(block.type, right.name) - rebuildSectionPriority(block.type, left.name));
        for (const section of orderedSections) {
            const next = [];
            for (const line of dedupeMigrationLines(section.lines ?? [])) {
                const fact = normalizeRebuildFact(line);
                if (!fact || isTautologicalRebuildLine(block, line)) continue;
                const duplicate = seen.find((item) => equivalentRebuildFacts(item.fact, fact));
                if (duplicate) {
                    transferBlockLineEvidence(block, section.name, line, block, duplicate.section, duplicate.line);
                    diagnostics.removedDuplicateFacts += 1;
                    continue;
                }
                seen.push({ fact, section: section.name, line });
                next.push(line);
            }
            section.lines = next;
        }
        block.sections = (block.sections ?? []).filter((section) => section.lines?.length);
    }
    const references = [];
    for (const block of output) {
        for (const section of block.sections ?? []) {
            for (const line of section.lines ?? []) references.push({ block, section, line, fact: normalizeRebuildFact(line), removed: false });
        }
    }
    for (let index = 0; index < references.length; index += 1) {
        const left = references[index];
        if (left.removed || !left.fact) continue;
        for (let otherIndex = index + 1; otherIndex < references.length; otherIndex += 1) {
            const right = references[otherIndex];
            if (right.removed || !right.fact || left.block === right.block) continue;
            const sourceOverlap = (left.block.sourceUids ?? []).some((uid) => (right.block.sourceUids ?? []).includes(uid));
            if (!sourceOverlap || !equivalentRebuildFacts(left.fact, right.fact)) continue;
            const leftScore = rebuildFactHostScore(left.block, left.section, left.line);
            const rightScore = rebuildFactHostScore(right.block, right.section, right.line);
            const loser = rightScore > leftScore ? left : right;
            const winner = loser === left ? right : left;
            transferBlockLineEvidence(loser.block, loser.section.name, loser.line, winner.block, winner.section.name, winner.line);
            loser.removed = true;
            diagnostics.removedDuplicateFacts += 1;
        }
    }
    for (const ref of references.filter((item) => item.removed)) {
        ref.section.lines = (ref.section.lines ?? []).filter((line) => line !== ref.line);
    }
    for (const block of output) {
        block.sections = (block.sections ?? []).filter((section) => section.lines?.length);
        block.lineEvidence = normalizeBlockLineEvidence(block);
    }
    if (diagnostics.removedDuplicateFacts) diagnostics.warnings.push(`全局收束已移除${diagnostics.removedDuplicateFacts}条重复子项或跨条目重复事实`);
    return output.filter((block) => block.sections?.length);
}

function transferBlockLineEvidence(fromBlock, fromSection, fromLine, toBlock, toSection, toLine) {
    const source = (fromBlock.lineEvidence ?? []).filter((item) => item.section === fromSection && item.line === fromLine);
    if (!source.length) return;
    const target = (toBlock.lineEvidence ?? []).find((item) => item.section === toSection && item.line === toLine);
    const refs = (0, util_1.unique)(source.flatMap((item) => item.refs ?? []));
    if (target) {
        target.refs = (0, util_1.unique)([...(target.refs ?? []), ...refs]);
        target.explicit = target.explicit === true || source.some((item) => item.explicit === true);
    }
    else {
        toBlock.lineEvidence ?? (toBlock.lineEvidence = []);
        toBlock.lineEvidence.push({ section: toSection, line: toLine, refs, explicit: source.some((item) => item.explicit === true) });
    }
    toBlock.sourceRefs = (0, util_1.unique)([...(toBlock.sourceRefs ?? []), ...refs]);
}

function normalizeBlockLineEvidence(block) {
    const facts = new Map();
    for (const section of block.sections ?? []) {
        for (const line of section.lines ?? []) facts.set(`${section.name}\u0000${line}`, { section: section.name, line });
    }
    const output = new Map();
    for (const evidence of block.lineEvidence ?? []) {
        let key = `${evidence.section}\u0000${evidence.line}`;
        if (!facts.has(key)) {
            const fact = normalizeRebuildFact(evidence.line);
            const match = [...facts.values()].find((item) => equivalentRebuildFacts(normalizeRebuildFact(item.line), fact));
            if (!match) continue;
            key = `${match.section}\u0000${match.line}`;
        }
        const current = output.get(key) ?? { ...facts.get(key), refs: [], explicit: false };
        current.refs = (0, util_1.unique)([...(current.refs ?? []), ...(evidence.refs ?? [])]);
        current.explicit = current.explicit === true || evidence.explicit === true;
        output.set(key, current);
    }
    return [...output.values()];
}

function disambiguateRebuildIdentities(blocks, diagnostics) {
    const groups = new Map();
    for (const block of blocks ?? []) {
        const key = `${block.type}|${(0, util_1.normalizeFact)(block.name)}`;
        const list = groups.get(key) ?? [];
        list.push(block);
        groups.set(key, list);
    }
    for (const list of groups.values()) {
        if (list.length < 2) continue;
        for (const block of list) {
            const anchor = rebuildIdentityAnchor(block);
            if (!anchor) continue;
            const base = String(block.name ?? '').replace(/[（(](?:真身|假身|分身|本体|替身|伪身|复制体|化身|投影|残留配置|匿名载体)[）)]$/u, '');
            block.name = `${base}（${anchor}）`;
            block.title = `${block.type}｜${block.name}`;
            let aliases = block.sections.find((section) => section.name === '别名');
            if (!aliases) {
                aliases = { name: '别名', lines: [], empty: false };
                block.sections.push(aliases);
            }
            aliases.lines = (0, util_1.unique)([...(aliases.lines ?? []), base]);
        }
        diagnostics.warnings.push(`检测到同名但身份形态不同的对象，已使用真身、假身、分身或稳定身份锚点区分标题`);
    }
    return blocks;
}

function rebuildIdentityAnchor(block) {
    const text = (0, util_1.normalizeFact)(`${block.name}\n${allBlockFactLines(block).join('\n')}`);
    if (/(?:真身|本体|本尊|原身|主体)/u.test(text)) return '真身';
    if (/(?:假身|替身|伪身|傀儡身|复制体)/u.test(text)) return '假身';
    if (/(?:分身|化身|投影|镜像体)/u.test(text)) return '分身';
    if (/(?:残留配置|残留人格|遗留配置)/u.test(text)) return '残留配置';
    if (/(?:匿名载体|无名载体|未知载体)/u.test(text)) return '匿名载体';
    for (const line of sectionLines(block, '身份')) {
        const match = String(line ?? '').match(/^\s*(?:种族|职业|组织|阵营|编号|型号|类别)\s*[：:]\s*(.+)$/u);
        if (match?.[1]) return String(match[1]).trim().slice(0, 16);
    }
    return '';
}

function normalizeRebuildFact(line) {
    return (0, util_1.normalizeFact)(stripGenericFactLabel(line))
        .replace(/(?:已经|当前|目前|仍然|明确|确认|相关)/gu, '')
        .replace(/[，,。；;：:\s]/gu, '');
}

function equivalentRebuildFacts(left, right) {
    if (!left || !right) return false;
    if (left === right) return true;
    if (Math.min(left.length, right.length) >= 9 && (left.includes(right) || right.includes(left))) return true;
    return Math.min(left.length, right.length) >= 14 && bigramSimilarity(left, right) >= 0.86;
}

function rebuildSectionPriority(type, section) {
    const role = ({
        人物: { 当前: 100, 身份: 95, 关系: 90, 持有: 85, 固定事实: 75, 稳定: 70, 已知: 65, 误信: 60 },
        场景: { 当前状态: 100, 在场: 95, 当前资源: 90, 空间结构: 85, 固定资源: 80, 固定事实: 75, 定义: 70 },
        物品: { 当前: 100, 功能: 90, 限制: 85, 定义: 80, 固定事实: 75 },
        事件: { 结果: 100, 已发生进展: 95, 未发生进展: 60, 参与: 80, 场景: 75 },
        世界: { 公开局势: 100, 权力: 95, 制度: 90, 组织: 85, 资源与交通: 80, 持续影响: 75, 固定事实: 70, 地理: 65, 范围: 60 },
        基础设定: { 自然规则: 100, 种族与生命: 95, 能力与技术: 90, 社会规则: 85, 地理框架: 80, 世界常识: 75 },
    })[type] ?? {};
    return Number(role[section] ?? (section === '别名' ? 1 : 50));
}

function rebuildFactHostScore(block, section, line) {
    const text = (0, util_1.normalizeFact)(`${line}`);
    let score = rebuildSectionPriority(block.type, section.name);
    const name = (0, util_1.normalizeFact)(block.name);
    if (name && text.includes(name)) score += 20;
    if (block.type === '物品' && /(?:所有权|持有者|使用者|保管者|位置|完整性|功能|限制|损坏|封印)/u.test(text)) score += 80;
    if (block.type === '人物' && /(?:身份|伤势|情绪|关系|信任|敌对|目标|能力|职业|种族)/u.test(text)) score += 70;
    if (block.type === '场景' && /(?:在场|出口|入口|设施|资源|空间|布局|坍塌|封锁)/u.test(text)) score += 70;
    if (block.type === '事件' && /(?:经过|进展|导致|结果|结束|完成|冲突|战斗|调查|行动)/u.test(text)) score += 70;
    if (block.type === '世界' && /(?:组织|权力|制度|法律|局势|资源网络|交通|控制|地区)/u.test(text)) score += 75;
    if (block.type === '基础设定' && /(?:规则|规律|种族|生命|魔法|技术|社会|地理框架|普遍|所有)/u.test(text)) score += 80;
    return score;
}

function applyAbsorptionProposals(blocks, diagnostics) {
    const output = blocks.map((block) => (0, util_1.clone)(block));
    const removed = new Set();
    const ordered = [...output].sort((a, b) => Number(b.migrationOrder ?? 0) - Number(a.migrationOrder ?? 0));
    for (const child of ordered) {
        if (removed.has(child)) continue;
        const explicit = /(?:并入|归并|附属|不独立)/u.test(String(child.retentionMode ?? '')) && child.mergeIntoTitle;
        const inferred = !explicit ? inferDependentTarget(child, output, removed) : null;
        const target = explicit ? findConvergenceTarget(child.mergeIntoTitle, child, output, removed) : inferred;
        if (!target || target === child) {
            if (explicit) diagnostics.warnings.push(`${child.title}要求并入“${child.mergeIntoTitle}”，但没有找到有效目标，已暂时保留独立条目`);
            continue;
        }
        const sectionName = resolveAbsorptionSection(target, child.mergeIntoSection);
        const summary = summarizeAbsorbedBlock(child, target, sectionName);
        if (!summary) continue;
        let section = target.sections.find((item) => item.name === sectionName);
        if (!section) {
            section = { name: sectionName, lines: [], empty: false };
            target.sections.push(section);
        }
        section.lines = (0, util_1.unique)([...(section.lines ?? []), summary]);
        target.sourceUids = (0, util_1.unique)([...(target.sourceUids ?? []), ...(child.sourceUids ?? [])]);
        target.sourceRefs = (0, util_1.unique)([...(target.sourceRefs ?? []), ...(child.sourceRefs ?? [])]);
        target.lineEvidence ?? (target.lineEvidence = []);
        target.lineEvidence.push({
            section: sectionName,
            line: summary,
            refs: (0, util_1.unique)(child.sourceRefs ?? []),
            explicit: (child.lineEvidence ?? []).some((item) => item.explicit === true),
        });
        mergeRebuildTemporalMetadata(target, child);
        target.keywords = (0, util_1.unique)([...(target.keywords ?? []), child.name, ...(child.keywords ?? []), ...sectionLines(child, '别名')]).filter(Boolean);
        removed.add(child);
        diagnostics.absorbedEntries += 1;
        diagnostics.warnings.push(`${child.title}已作为从属信息收束进${target.title}【${sectionName}】，不再保留独立条目`);
    }
    return output.filter((block) => !removed.has(block));
}

function findConvergenceTarget(rawTitle, child, blocks, removed) {
    const normalized = (0, util_1.normalizeTitle)(rawTitle);
    const direct = blocks.find((block) => block !== child && !removed.has(block) && (0, util_1.normalizeTitle)(block.title) === normalized);
    if (direct) return direct;
    const split = (0, util_1.splitTitle)(normalized);
    return blocks.find((block) => block !== child && !removed.has(block)
        && (!split?.type || block.type === split.type)
        && convergenceNameRelated(block, { name: split?.name || rawTitle, keywords: [], sections: [] }));
}

function inferDependentTarget(child, blocks, removed) {
    if (child.type !== '物品') return null;
    const state = migrationItemState(child);
    const locationValue = state.get('当前位置') || '';
    const inferredHolder = inferMigrationHolderFromLocation(locationValue);
    const holder = state.get('当前持有者') || inferredHolder;
    const owner = state.get('所有权') || '';
    const keeper = state.get('保管者') || '';
    const location = locationValue;
    const permission = state.get('使用权限') || '';
    const fullText = (0, util_1.normalizeFact)(`${child.name}；${allBlockFactLines(child).join('；')}；${permission}`);
    const publicItem = /(?:公用|公共|共享|共用|任何人|所有人|全体|组织成员|授权人员|合格学员|固定设施|场地设施)/u.test(fullText)
        || (owner && holder && !migrationIdentityValueMatches(owner, holder))
        || (keeper && holder && !migrationIdentityValueMatches(keeper, holder));
    const independent = isIndependentMigrationItem(child);
    const simplePublicFacility = publicItem && sectionLines(child, '固定事实').length === 0 && sectionLines(child, '限制').length === 0 && sectionLines(child, '功能').length <= 1;
    if (independent && !simplePublicFacility) return null;
    const active = blocks.filter((candidate) => candidate !== child && !removed.has(candidate));
    const personByName = (value) => active.find((candidate) => candidate.type === '人物' && migrationBlockNameMatches(candidate, value));
    const sceneByName = (value) => active.find((candidate) => candidate.type === '场景' && migrationBlockNameMatches(candidate, value));
    const worldByName = (value) => active.find((candidate) => (candidate.type === '世界' || candidate.migrationPhase === 'custom') && migrationBlockNameMatches(candidate, value));
    if (!publicItem) {
        const person = personByName(holder) || personByName(owner) || personByName(keeper);
        if (person) return person;
    }
    const scene = sceneByName(location);
    if (scene) return scene;
    const world = worldByName(owner) || worldByName(keeper) || worldByName(location);
    if (world) return world;
    if (publicItem) {
        const anyScene = active.find((candidate) => candidate.type === '场景' && (child.sourceUids ?? []).some((uid) => (candidate.sourceUids ?? []).includes(uid)));
        if (anyScene) return anyScene;
    }
    // 最后才采用旧的强证据规则：后续规则或地区条目覆盖全部来源并点名该物品。
    const facts = allBlockFactLines(child);
    const sourceUids = child.sourceUids ?? [];
    if (!facts.length || facts.length > 4 || !sourceUids.length) return null;
    const name = (0, util_1.normalizeFact)(child.name);
    return active.find((candidate) => {
        if (!['世界', '基础设定', '场景'].includes(candidate.type) && candidate.migrationPhase !== 'custom') return false;
        if (Number(candidate.migrationOrder ?? -1) <= Number(child.migrationOrder ?? -1)) return false;
        if (!sourceUids.every((uid) => (candidate.sourceUids ?? []).includes(uid))) return false;
        const text = (0, util_1.normalizeFact)(`${candidate.title}\n${allBlockFactLines(candidate).join('\n')}`);
        return Boolean(name && text.includes(name));
    }) || null;
}

function isIndependentMigrationItem(block) {
    const name = String(block?.name ?? '');
    if (/(?:唯一|编号|序列号|型号|专属|核心|封印|神器|遗物|王冠|徽章|日记|信件|契约|钥匙卡|[A-Za-z]*\d+[A-Za-z0-9-]*)/u.test(name)) return true;
    const important = new Set(['功能', '限制', '固定事实']);
    if ((block.sections ?? []).some((section) => important.has(section.name) && (section.lines?.length ?? 0) > 0)) return true;
    const definition = sectionLines(block, '定义');
    if (definition.some((line) => /(?:唯一|编号|序列号|型号|独特|专属|不可替代|跨场景|持续追踪|长期使用|长期携带|重要物品)/u.test(String(line)))) return true;
    const state = migrationItemState(block);
    return [...state.keys()].some((label) => /^(?:完整性|可用性|能力状态|损坏状态|封印状态)$/u.test(label));
}

function migrationItemState(block) {
    const map = new Map();
    for (const line of sectionLines(block, '当前')) {
        const match = String(line ?? '').match(/^\s*([^：:]{1,24})\s*[：:]\s*(.*)$/u);
        if (!match) continue;
        const raw = (0, util_1.normalizeFact)(match[1]);
        const label = [
            [/^(?:所有权|所有者|产权方|归属方)$/u, '所有权'],
            [/^(?:保管者|保管方|管理者)$/u, '保管者'],
            [/^(?:当前持有者|持有者|携带者)$/u, '当前持有者'],
            [/^(?:当前使用者|使用者|操作者)$/u, '当前使用者'],
            [/^(?:使用权限|可使用者|授权对象)$/u, '使用权限'],
            [/^(?:当前位置|位置|所在地)$/u, '当前位置'],
            [/^(?:完整性|损坏状态)$/u, '完整性'],
            [/^(?:可用性)$/u, '可用性'],
            [/^(?:当前状态|状态)$/u, '当前状态'],
            [/^(?:能力状态)$/u, '能力状态'],
            [/^(?:封印状态)$/u, '封印状态'],
        ].find(([pattern]) => pattern.test(raw))?.[1];
        if (label) map.set(label, String(match[2] ?? '').trim());
    }
    return map;
}

function inferMigrationHolderFromLocation(value) {
    const text = String(value ?? '').trim();
    const match = text.match(/(?:被)?([\p{Script=Han}A-Za-z0-9·]{2,16})(?:收回|随身携带|持有|收入(?:背包|卡槽|卡槎|腰侧)|带走)/u);
    return match?.[1] ?? '';
}

function migrationBlockNameMatches(block, value) {
    const target = (0, util_1.normalizeFact)(String(value ?? '').replace(/(?:随身|手中|身上|腰间|背包中|武器架上|仓库中)$/u, ''));
    if (!target) return false;
    return [block.name, ...(block.keywords ?? []), ...sectionLines(block, '别名')]
        .map((item) => (0, util_1.normalizeFact)(item))
        .some((name) => name && (name === target || (Math.min(name.length, target.length) >= 3 && (name.includes(target) || target.includes(name)))));
}

function migrationIdentityValueMatches(left, right) {
    const a = (0, util_1.normalizeFact)(left);
    const b = (0, util_1.normalizeFact)(right);
    return Boolean(a && b && (a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)))));
}

function resolveAbsorptionSection(target, requested) {
    const raw = String(requested ?? '').trim();
    const allowed = TYPE_ALLOWED_SECTIONS[target.type];
    if (raw && (!(allowed instanceof Set) || allowed.has(raw))) return raw;
    if (target.type === '人物') return '持有';
    if (target.type === '基础设定') return '社会规则';
    if (target.type === '世界') return '资源与交通';
    if (target.type === '场景') return '当前资源';
    if (target.type === '事件') return '结果';
    return (target.sections ?? []).find((section) => section.name !== '别名')?.name || '固定事实';
}

function summarizeAbsorbedBlock(block, target, sectionName) {
    if (block.type === '物品' && target?.type === '人物' && sectionName === '持有') return block.name;
    if (block.type === '物品' && target?.type === '场景' && /^(?:当前资源|固定资源)$/u.test(sectionName)) return block.name;
    const lines = dedupeMigrationLines(allBlockFactLines(block).map(stripGenericFactLabel).filter(Boolean));
    if (!lines.length) return block.name || '';
    const summary = lines.slice(0, 3).join('；');
    return `${block.name}：${summary.slice(0, 260)}`;
}

function blockAsEntry(block) {
    const aliases = (block.sections ?? []).filter((section) => section.name === '别名').flatMap((section) => section.lines ?? []);
    return {
        // 重建候选尚未分配世界书UID；不得把标题伪装成UID，否则同名真身/替身会绕过身份冲突检查。
        uid: block.uid ?? '',
        title: block.title,
        type: block.type,
        name: block.name,
        aliases,
        keywords: block.keywords ?? [],
        sections: { values: {
            ...Object.fromEntries((block.sections ?? []).map((section) => [section.name, section.lines ?? []])),
            ...(block.type === '事件' ? (block.eventIdentitySections ?? {}) : {}),
        } },
    };
}

function normalizeRebuildKeyword(value) {
    return (0, parser_1.sanitizeWorldbookLine)(value)
        .replace(/^\s*(?:别名|名称|关键词)\s*[：:]\s*/u, '')
        .trim();
}

function isMeaningfulRebuildKeyword(value) {
    const text = normalizeRebuildKeyword(value);
    if (!text || (0, util_1.isUidKeyword)(text) || /^(?:无|暂无|<<<\s*END_ENTRY\s*>>>|重建待确认·?\d*)$/iu.test(text)) return false;
    return true;
}

function isUi20AutomaticArchive(record) {
    const raw = record?.raw ?? {};
    const extension = raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY] ?? {};
    if (raw.disable !== true || extension.archive !== true || Number(extension.rebuildVersion || 0) !== 4) return false;
    const markers = [record?.title ?? '', ...(0, util_1.normalizeStringArray)(raw.key), record?.content ?? ''].join('\n');
    if (/重建待确认/u.test(markers) || /【来源条目】/u.test(markers)) return false;
    return true;
}

function buildRebuildSnapshot(originalData, records, blocks, diagnostics = { invalidLines: [], warnings: [] }, schema = buildMigrationSchema(), consumableSourceUids = null) {
    const data = (0, util_1.clone)(originalData);
    data.entries ?? (data.entries = {});
    const candidateKeys = new Set(records.map((record) => record.mapKey));
    const preserved = Object.fromEntries(Object.entries(data.entries).filter(([mapKey, raw]) => !candidateKeys.has(String(mapKey)) && !isControlPromptRaw(raw)));
    const preservedEntryCount = Object.keys(preserved).length;
    const removedControlEntries = Object.values(data.entries).filter((raw) => isControlPromptRaw(raw)).length;
    if (removedControlEntries) diagnostics.warnings.push(`已移除${removedControlEntries}个旧版底层提示词控制条目，不再送入模型或保存到世界书`);
    data.entries = preserved;
    const recordByUid = new Map(records.map((record) => [record.uid, record]));
    const usedRecordUids = new Set();
    const usedMapKeys = new Set(Object.keys(data.entries));
    // 新建条目从原世界书最大UID之后分配；旧条目主档仍可复用原mapKey与UID。
    const usedNumericUids = new Set(Object.values(originalData?.entries ?? {}).map((raw) => Number(raw?.uid)).filter(Number.isFinite));
    const rebuildBatchId = nextRebuildBatchId(originalData);
    let rebuildSequence = 0;
    const anchorTypeSequences = new Map();
    let rebuiltEntries = 0;
    let knowledgeLines = 0;
    let mergedOldEntries = 0;
    for (const rawBlock of blocks) {
        const block = enrichRebuildBlockAliases(rawBlock, recordByUid);
        const sourceUids = (block.sourceUids ?? []).filter((uid) => recordByUid.has(uid));
        const consumedSourceUids = sourceUids.filter((uid) => !(consumableSourceUids instanceof Set) || consumableSourceUids.has(String(uid)));
        const primaryUid = consumedSourceUids.find((uid) => !usedRecordUids.has(uid));
        const primary = primaryUid ? recordByUid.get(primaryUid) : null;
        let mapKey;
        let raw;
        if (primary && !usedMapKeys.has(primary.mapKey)) {
            mapKey = primary.mapKey;
            raw = (0, util_1.clone)(primary.raw);
            usedRecordUids.add(primary.uid);
        }
        else {
            const uid = nextNumericUid(usedNumericUids);
            mapKey = String(uid);
            raw = defaultRaw(uid);
        }
        usedMapKeys.add(mapKey);
        const uid = String(raw.uid ?? mapKey);
        raw.uid = Number.isFinite(Number(raw.uid)) ? Number(raw.uid) : Number(mapKey);
        rebuildSequence += 1;
        const primarySceneAnchor = /^S\d{3,6}$/u.test(String(block.primarySceneAnchor ?? '')) ? String(block.primarySceneAnchor) : '';
        const typeCode = rebuildTypeCode(block.type);
        const sequenceKey = `${primarySceneAnchor || rebuildBatchId}|${typeCode}`;
        const anchorSequence = Number(anchorTypeSequences.get(sequenceKey) || 0) + 1;
        anchorTypeSequences.set(sequenceKey, anchorSequence);
        const derivedCode = primarySceneAnchor ? `${primarySceneAnchor}-${typeCode}${String(anchorSequence).padStart(2, '0')}` : `${rebuildBatchId}-${String(rebuildSequence).padStart(2, '0')}`;
        const numberedTitle = `${block.type}｜${derivedCode}｜${block.name}`;
        raw.comment = numberedTitle;
        const spacetimeSection = buildRebuildSpacetimeSection(block);
        const sourceSections = [
            ...(spacetimeSection ? [spacetimeSection] : []),
            ...(block.sections ?? []).filter((section) => section.name !== REBUILD_SPACETIME_SECTION),
        ];
        const safeSections = sourceSections.map((section) => ({
            ...section,
            lines: (0, util_1.unique)((section.lines ?? []).map((line) => (0, parser_1.sanitizeWorldbookLine)(line)).filter(Boolean)),
        })).filter((section) => section.lines.length);
        if (!safeSections.length) {
            diagnostics.warnings.push(`重建候选“${block.title}”只包含模型控制提示词或空内容，已阻止写入`);
            continue;
        }
        raw.content = (0, parser_1.serializeEntrySections)({ order: safeSections.map((section) => section.name), values: Object.fromEntries(safeSections.map((section) => [section.name, section.lines])) });
        const aliases = safeSections.filter((section) => section.name === '别名').flatMap((section) => section.lines);
        raw.key = (0, util_1.unique)([block.name, ...(block.keywords ?? []), ...aliases].map(normalizeRebuildKeyword).filter(isMeaningfulRebuildKeyword));
        raw.keysecondary ?? (raw.keysecondary = []);
        raw.disable = false;
        applyMigrationDefinition(raw, block.type, schema);
        const extensions = raw.extensions ?? (raw.extensions = {});
        const extension = extensions[constants_1.WORLD_INFO_EXTENSION_KEY] && typeof extensions[constants_1.WORLD_INFO_EXTENSION_KEY] === 'object'
            ? extensions[constants_1.WORLD_INFO_EXTENSION_KEY]
            : {};
        extensions[constants_1.WORLD_INFO_EXTENSION_KEY] = {
            ...extension,
            managed: true,
            version: constants_1.MANAGED_VERSION,
            title: numberedTitle,
            semanticTitle: block.title,
            rebuildBatchId,
            rebuildSequence,
            derivedCode,
            rebuilt: true,
            rebuildVersion: 9,
            epistemic: block.type === '人物',
            sourceUids,
            sourceRefs: (0, util_1.unique)(block.sourceRefs ?? []),
            sceneAnchors: (0, util_1.unique)(block.sceneAnchors ?? []),
            primarySceneAnchor: primarySceneAnchor || undefined,
            gameTime: normalizeRebuildGameTime(block.gameTime),
            timeSource: normalizeRebuildTimeSource(block.timeSource),
            temporalState: normalizeRebuildTemporalState(block.temporalState, block.type),
            anchorLocation: String(block.anchorLocation || '未知').trim() || '未知',
            updatedAt: Date.now(),
        };
        // 成功重建后的新主档必须解除旧归档标记，避免“disable=false 但 archive=true”的半归档状态。
        delete extensions[constants_1.WORLD_INFO_EXTENSION_KEY].archive;
        data.entries[mapKey] = raw;
        rebuiltEntries += 1;
        knowledgeLines += block.sections.filter((section) => KNOWLEDGE_SECTIONS.has(section.name)).reduce((sum, section) => sum + section.lines.length, 0);
        if (consumedSourceUids.length > 1) mergedOldEntries += consumedSourceUids.length - 1;
        consumedSourceUids.forEach((uidValue) => usedRecordUids.add(uidValue));
    }
    const uncovered = records.filter((record) => !usedRecordUids.has(record.uid));
    let retainedOriginalEntries = 0;
    let preservedArchivedEntries = 0;
    let recoveredUi20Archives = 0;
    for (const record of uncovered) {
        if (isControlPromptRaw(record.raw)) {
            diagnostics.warnings.push(`已移除旧版底层提示词控制条目“${record.title}”；认知边界仅保留在模型请求中`);
            continue;
        }
        const originalMapKey = String(record.mapKey);
        const canReuse = !usedMapKeys.has(originalMapKey);
        const mapKey = canReuse ? originalMapKey : String(nextNumericUid(usedNumericUids));
        const raw = (0, util_1.clone)(record.raw);
        if (isUi20AutomaticArchive(record)) {
            raw.disable = false;
            const extension = raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY];
            if (extension && typeof extension === 'object') {
                delete extension.archive;
                extension.rebuilt = true;
                extension.rebuildVersion = 9;
                extension.updatedAt = Date.now();
            }
            recoveredUi20Archives += 1;
            diagnostics.warnings.push(`已恢复 ui.20 误关闭条目“${record.title}”；提交后将重新规划召回配置`);
        }
        if (!canReuse) {
            raw.uid = Number(mapKey);
            diagnostics.warnings.push(`旧条目“${record.title}”的原键已被新主档占用，已仅调整UID后原样保留`);
        }
        usedMapKeys.add(mapKey);
        data.entries[mapKey] = raw;
        retainedOriginalEntries += 1;
        if (raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY]?.archive === true || raw.disable === true) preservedArchivedEntries += 1;
        diagnostics.warnings.push(`旧条目“${record.title}”未被AI可靠覆盖，已保持原正文、启用状态和召回配置不变`);
    }
    return {
        data,
        rebuiltEntries,
        mergedOldEntries,
        archivedEntries: 0,
        retainedOriginalEntries,
        preservedArchivedEntries,
        recoveredUi20Archives,
        knowledgeLines,
        preservedEntries: preservedEntryCount,
        rebuildBatchId,
    };
}


function nextRebuildBatchId(data) {
    let max = 0;
    for (const raw of Object.values(data?.entries ?? {})) {
        const title = (0, util_1.normalizeTitle)(String(raw?.comment ?? raw?.name ?? raw?.title ?? ''));
        const match = title.match(/｜R(\d{1,6})-\d{1,4}｜/iu);
        if (match) max = Math.max(max, Number(match[1]) || 0);
        const extensionId = String(raw?.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY]?.rebuildBatchId ?? '');
        const extMatch = extensionId.match(/^R(\d{1,6})$/iu);
        if (extMatch) max = Math.max(max, Number(extMatch[1]) || 0);
    }
    return `R${String(max + 1).padStart(3, '0')}`;
}

function rebuildTypeCode(type) {
    if (REBUILD_TYPE_CODES.has(type)) return REBUILD_TYPE_CODES.get(type);
    const normalized = (0, util_1.safeId)(String(type ?? '')).replace(/[^A-Za-z0-9]/gu, '').toUpperCase();
    return normalized.slice(0, 1) || 'X';
}

function buildRebuildSpacetimeSection(block) {
    const sceneAnchors = (0, util_1.unique)(block?.sceneAnchors ?? []).filter((anchor) => /^S\d{3,6}$/u.test(String(anchor)));
    if (!sceneAnchors.length) return null;
    const lines = [
        `场景锚点：${sceneAnchors.join('、')}`,
        `游戏时间：${normalizeRebuildGameTime(block?.gameTime)}`,
        `地点：${String(block?.anchorLocation || '未知').trim() || '未知'}`,
        `时间来源：${normalizeRebuildTimeSource(block?.timeSource)}`,
        `时态：${normalizeRebuildTemporalState(block?.temporalState, block?.type)}`,
    ];
    return { name: REBUILD_SPACETIME_SECTION, lines, empty: false };
}

function applyMigrationDefinition(raw, type, schema) {
    const definition = migrationDefinition(schema, type);
    if (!definition) return raw;
    raw.constant = definition.constant === true;
    raw.vectorized = definition.vectorized !== false;
    raw.preventRecursion = definition.preventRecursion === true;
    raw.excludeRecursion = definition.preventRecursion === true;
    raw.depth = Math.max(0, Number(definition.depth ?? raw.depth ?? 4));
    raw.order = Math.max(0, Number(definition.order ?? raw.order ?? 400));
    return raw;
}

function enrichRebuildBlockAliases(block, recordByUid) {
    const output = (0, util_1.clone)(block);
    if (output.type !== '事件') return output;
    const names = (0, util_1.unique)((output.sourceUids ?? []).map((uid) => recordByUid.get(uid))
        .filter((record) => record && recordType(record) === '事件')
        .map((record) => (0, util_1.splitTitle)((0, util_1.normalizeTitle)(record.title))?.name)
        .filter((name) => name && (0, util_1.normalizeFact)(name) !== (0, util_1.normalizeFact)(output.name)));
    if (!names.length) return output;
    let aliases = output.sections.find((section) => section.name === '别名');
    if (!aliases) {
        aliases = { name: '别名', lines: [], empty: false };
        output.sections.push(aliases);
    }
    aliases.lines = (0, util_1.unique)([...(aliases.lines ?? []), ...names]);
    aliases.empty = false;
    return output;
}

function ensureInformationBoundary(blocks) {
    // [MA-CONTROL-02] 认知边界只属于请求控制层，不再写入世界书。
    return blocks.map((block) => (0, util_1.clone)(block));
}

function verifyCommittedSnapshot(data, summary) {
    const entries = Object.values(data?.entries ?? {}).filter((raw) => raw && typeof raw === 'object');
    if (entries.some((raw) => (0, util_1.normalizeTitle)(String(raw.comment ?? '')) === (0, util_1.normalizeTitle)(exports.INFORMATION_BOUNDARY_TITLE)))
        throw new Error('底层认知提示词不应保存为世界书条目');
    const rebuilt = entries.filter((raw) => raw.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY]?.rebuilt === true);
    if (rebuilt.length < Number(summary.rebuiltEntries || 0)) throw new Error('重建条目回读数量不足');
}

function defaultRaw(uid) {
    return { uid, key: [], keysecondary: [], comment: '', content: '', constant: false, vectorized: true, selective: false, selectiveLogic: 0, addMemo: false, order: 400, position: 0, disable: false, ignoreBudget: false, excludeRecursion: false, preventRecursion: true, probability: 100, useProbability: true, depth: 4, outletName: '', group: '', groupOverride: false, groupWeight: 100, scanDepth: null, caseSensitive: null, matchWholeWords: null, useGroupScoring: null, automationId: '', role: 0, sticky: null, cooldown: null, delay: null, delayUntilRecursion: 0, triggers: [] };
}

function nextNumericUid(used) {
    let uid = 0;
    while (used.has(uid)) uid += 1;
    used.add(uid);
    return uid;
}

function needsMigration(raw) {
    const title = (0, util_1.normalizeTitle)(String(raw?.comment ?? raw?.name ?? raw?.title ?? ''));
    if (!(0, util_1.splitTitle)(title)) return true;
    const content = String(raw?.content ?? '').trim();
    if (!content) return false;
    if (!/【\s*[^】]+\s*】/u.test(content)) return true;
    const parsed = (0, parser_1.parseEntrySections)(content);
    if (!parsed.order.length) return true;
    let insideSection = false;
    for (const rawLine of content.replace(/\r/g, '').split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        if (/^【\s*[^】]+\s*】$/u.test(line)) { insideSection = true; continue; }
        if (!insideSection) return true;
    }
    return false;
}

function originalLines(content) {
    return String(content ?? '').replace(/\r/g, '').split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !/^【\s*[^】]+\s*】$/u.test(line))
        .map((line) => (0, parser_1.normalizePointLine)(line));
}

function trimPrompt(value) {
    return value.length <= constants_1.MAX_CONTEXT_CHARS
        ? value
        : `${value.slice(0, constants_1.MAX_CONTEXT_CHARS)}\n[已按字符上限截断]`;
}
},"model-request":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callModel = callModel;
exports.stageResponseTokens = stageResponseTokens;
exports.isRetryableGatewayError = isRetryableGatewayError;
exports.limitPromptPair = limitPromptPair;
const util_1 = require("./util");

// [MA-MODEL-01] 每个模型阶段只声明输入/输出预算和一次网关重试。
// 该模块不理解审核、提取或总结业务，也不接触世界书，避免请求控制与业务逻辑耦合。
const INPUT_LIMITS = Object.freeze({
    audit: 24000,
    revision: 30000,
    extraction: 26000,
    extractionRepair: 14000,
    worldSettingImport: 42000,
    smallSummary: 28000,
    largeSummary: 30000,
    migration: 20000,
    migrationPlan: 28000,
    migrationReview: 24000,
});

/**
 * [MA-MODEL-02] 调用模型；仅在 502/503/504、HTML 网关页或 No message generated 时，
 * 使用调用方提供的精简提示词再试一次。解析错误和业务校验错误绝不重试。
 */
async function callModel(options) {
    const {
        host,
        stage,
        prompt,
        fallbackPrompt,
        settings,
        snapshot,
        profileId = '',
        sourceText = '',
        onRetry,
    } = options;
    const responseLength = stageResponseTokens(stage, settings, sourceText);
    const primary = limitPromptPair(prompt, stage);
    try {
        return await host.generate(primary.system, primary.user, responseLength, snapshot, settings, settings.requestTimeoutMs, profileId);
    }
    catch (error) {
        if (snapshot?.token?.cancelled || !fallbackPrompt || !isRetryableGatewayError(error))
            throw error;
        const fallbackValue = typeof fallbackPrompt === 'function' ? fallbackPrompt() : fallbackPrompt;
        const fallback = limitPromptPair(fallbackValue, stage, true);
        const fallbackTokens = Math.max(256, Math.min(responseLength, Math.floor(responseLength * 0.75)));
        try { onRetry?.(error); }
        catch (callbackError) { console.warn('[MirrorAbyss] model retry callback failed', callbackError); }
        return host.generate(fallback.system, fallback.user, fallbackTokens, snapshot, settings, settings.requestTimeoutMs, profileId);
    }
}

/** [MA-MODEL-03] 不同任务不再共用 3072 输出上限。 */
function stageResponseTokens(stage, settings, sourceText = '') {
    const configured = Math.max(256, Number(settings?.responseTokens) || 3072);
    if (stage === 'audit') return Math.min(configured, 384);
    if (stage === 'revision') {
        const estimated = Math.max(1024, Math.ceil(String(sourceText ?? '').length * 1.15) + 256);
        return Math.min(configured, Math.min(4096, estimated));
    }
    if (stage === 'extraction') return Math.min(configured, 2560);
    if (stage === 'extractionRepair') return Math.min(configured, 1536);
    if (stage === 'worldSettingImport') return Math.min(Math.max(configured, 3072), 4096);
    if (stage === 'smallSummary') return Math.min(configured, 1792);
    if (stage === 'largeSummary') return Math.min(configured, 2304);
    if (stage === 'migration') return Math.min(configured, 1792);
    if (stage === 'migrationPlan') return Math.min(Math.max(configured, 3072), 4096);
    if (stage === 'migrationReview') return Math.min(configured, 1024);
    return configured;
}

/** [MA-MODEL-04] 识别常见上游网关失败；本地取消和格式错误不属于此类。 */
function isRetryableGatewayError(error) {
    const text = (0, util_1.errorText)(error).toLocaleLowerCase();
    return /(?:\b502\b|\b503\b|\b504\b|gateway\s*(?:timeout|time-out)|upstream|no message generated|html\s*错误页|returned\s*html|fetch failed|network error|connection reset)/iu.test(text);
}

/**
 * [MA-MODEL-05] 最后的硬上限保护。业务提示词应先自行裁剪；这里仅防止异常配置把请求再次膨胀。
 */
function limitPromptPair(prompt, stage, retry = false) {
    const system = String(prompt?.system ?? '');
    const user = String(prompt?.user ?? '');
    const baseLimit = INPUT_LIMITS[stage] ?? 30000;
    const totalLimit = retry ? Math.floor(baseLimit * 0.72) : baseLimit;
    const userLimit = Math.max(2000, totalLimit - system.length);
    return { system, user: clipMiddle(user, userLimit) };
}

function clipMiddle(value, maxChars) {
    const text = String(value ?? '');
    if (text.length <= maxChars) return text;
    const marker = '\n[中间内容因请求预算被省略]\n';
    const remaining = Math.max(0, maxChars - marker.length);
    const head = Math.ceil(remaining * 0.62);
    const tail = Math.floor(remaining * 0.38);
    return `${text.slice(0, head)}${marker}${text.slice(text.length - tail)}`;
}
},"operations":function(module,exports,require){


"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOperationPlan = buildOperationPlan;
exports.applyPlanToEntries = applyPlanToEntries;
exports.informationAnchor = informationAnchor;
exports.enforceEntryBudgets = enforceEntryBudgets;
const matcher_1 = require("./matcher");
const parser_1 = require("./parser");
const information_point_1 = require("./domain/information-point");
const governance_1 = require("./governance");
const semantic_1 = require("./semantic");
const util_1 = require("./util");
function buildOperationPlan(blocks, entries, settings, contextText, options = {}) {
    const governed = (0, governance_1.governInformationBlocks)(blocks, entries, contextText, options);
    blocks = coalesceEventBlocks((0, information_point_1.prepareInformationBlocks)(governed.blocks));
    blocks = ensureDisambiguatedTitles(blocks, entries);
    blocks = suppressStateProjectionNarratives(blocks);
    const index = (0, matcher_1.buildEntryIndex)(entries);
    const operations = [];
    for (const block of blocks) {
        // [MA-ITEM-02] 二次防线：即使候选来自总结或迁移，也不允许集合物品创建独立条目。
        if (block.type === '物品' && isCollectiveItemTitle(block.name)) {
            operations.push(noop(block.title, undefined, '', '物品条目只允许单个可追踪实例；同类集合应保留在场景资源'));
            continue;
        }
        const candidates = (0, matcher_1.matchBlock)(block, index, contextText);
        const resolvedProvisionalCandidates = candidates
            .filter((candidate) => (0, matcher_1.isProvisionalEntry)(candidate.entry))
            .filter((candidate) => candidate.evidence?.some((item) => item.kind === 'context-identity'));
        const target = (0, matcher_1.selectBestCandidate)(candidates, 80);
        const exactClosedEvent = block.type === '事件'
            ? entries.find((entry) => entry.type === '事件' && (0, util_1.normalizeTitle)(entry.title) === (0, util_1.normalizeTitle)(block.title) && (0, semantic_1.isEventClosed)(entry))
            : null;
        if (!target && exactClosedEvent && (0, governance_1.currentEventState)(block) !== 'completed') {
            operations.push(noop(exactClosedEvent.title, exactClosedEvent.uid, '事件状态', '已完成事件不能重新变为活动；新的事件必须使用新的事件标题与因果签名'));
            continue;
        }
        if (!target) {
            const auxiliary = candidates[0];
            if (auxiliary && auxiliary.score >= 50 && !resolvedProvisionalCandidates.length) {
                operations.push(noop(block.title, auxiliary.entry.uid, '', `仅得到 ${auxiliary.score} 分辅助匹配，低于自动覆盖阈值 80；保留世界书并等待人工确认`, auxiliary.score, auxiliary.evidence));
                continue;
            }
            const substantive = block.sections.some((section) => isBusinessFactSection(section.name) && !section.empty && section.lines.length > 0);
            if (!substantive) {
                operations.push(noop(block.title, undefined, '', '所有业务小标题均为“无”，不创建空条目'));
                continue;
            }
            operations.push({
                id: operationId('create-entry', block.title, ''),
                kind: 'create-entry',
                operation: 'create',
                title: block.title,
                newValue: block.title,
                reason: '未找到可信候选，按结构化标题创建新条目',
                score: candidates[0]?.score,
                matchEvidence: candidates[0]?.evidence,
            });
            const initialKeywords = [...block.keywords];
            if (shouldMarkTemporary(block)) initialKeywords.push('临时', '身份未明');
            for (const keyword of (0, util_1.unique)(initialKeywords)) {
                operations.push(op('merge-keywords', block.title, undefined, '关键词', undefined, keyword, keyword === '临时' ? '插件按身份未明对象规则标记临时条目' : keyword === '身份未明' ? '插件标记该人物身份尚未揭示' : '新条目关键词写入'));
            }
            for (const provisional of [...new Map(resolvedProvisionalCandidates.map((candidate) => [candidate.entry.uid, candidate.entry])).values()]) {
                operations.push({
                    id: operationId('merge-entry', block.title, `new|${provisional.uid}`),
                    kind: 'merge-entry', operation: 'merge', title: block.title, sourceUid: provisional.uid,
                    newValue: provisional.title, reason: `正文已经揭示身份，临时档“${provisional.title}”合并到新主档“${block.title}”`,
                    score: candidates[0]?.score, matchEvidence: candidates[0]?.evidence,
                });
                operations.push({ ...op('delete-entry', provisional.title, provisional.uid, '身份揭示合并', undefined, '删除', `身份已经归入主档“${block.title}”`), mergedIntoTitle: block.title, requiresDistributionProof: false, distributionTargets: [] });
            }
            for (const section of block.sections) {
                if (/(关键词|触发词|标签|分类)/u.test(section.name))
                    continue;
                if (isLifecycleCommandSection(section.name))
                    continue;
                if (section.empty) {
                    operations.push(noop(block.title, undefined, section.name, 'AI填写“无”，不执行写入'));
                    continue;
                }
                const lines = linesWithoutCrossSectionDuplicates(block, section);
                if (!lines.length) { operations.push(noop(block.title, undefined, section.name, '该信息已在同一对象的主要归属小标题中表达')); continue; }
                if (/(事件进程|关键进展|已发生进展|未发生进展)/u.test(section.name) && block.type !== '事件') { operations.push(noop(block.title, undefined, section.name, '事件过程只能写入事件条目')); continue; }
                const sectionPolicy = authoritativeSnapshotPolicy(block.type, section.name)
                    ?? (options.compactEventProgressFromSummary === true && block.type === '事件' && /^(已发生进展|未发生进展|结果)$/u.test(section.name)
                        ? 'replace-section'
                        : policyFor(section.name, settings));
                operations.push(...operationsForNewSection(block.title, block.type, section.name, lines, sectionPolicy));
            }
            continue;
        }
        const entry = target.entry;
        // [MA-EVENT-SM-01] 状态机只管理当前事件。总结不得把已完成事件重新写成活动进展；
        // 真正的新事件必须拥有不同的参与、场景或因果签名并建立新条目。
        if (block.type === '事件' && (0, semantic_1.isEventClosed)(entry)
            && (0, governance_1.currentEventState)(block) !== 'completed') {
            operations.push(noop(entry.title, entry.uid, '事件状态', '已完成事件不能重新变为活动；新的事件必须使用新的事件标题与因果签名', target.score, target.evidence));
            continue;
        }
        // [MA-MATCH-02] 同一身份出现多个镜渊管理档案时，先把非锁定重复档合并到确定性主档，再删除重复档。
        const duplicates = candidates
            .filter((candidate) => candidate.entry.uid !== entry.uid)
            .filter((candidate) => Number(candidate.score) >= 80 || ((0, matcher_1.isProvisionalEntry)(candidate.entry) && candidate.evidence?.some((item) => item.kind === 'context-identity')))
            .map((candidate) => candidate.entry)
            .filter((candidate) => candidate.managed === true && candidate.locked !== true && candidate.focus !== true)
            .filter((candidate) => (0, matcher_1.sameEntryIdentity)(entry, candidate) || (entry.type === '事件' && candidate.type === '事件' && (0, matcher_1.sameEventLifecycle)(entry, candidate)) || ((0, matcher_1.isProvisionalEntry)(candidate) && !(0, matcher_1.isProvisionalEntry)(entry) && (0, matcher_1.explicitContextIdentity)(block.name, entry, contextText)));
        for (const duplicate of [...new Map(duplicates.map((candidate) => [candidate.uid, candidate])).values()]) {
            operations.push({
                id: operationId('merge-entry', entry.title, `${entry.uid}|${duplicate.uid}`),
                kind: 'merge-entry',
                operation: 'merge',
                title: entry.title,
                targetUid: entry.uid,
                sourceUid: duplicate.uid,
                newValue: duplicate.title,
                reason: `同一身份重复档“${duplicate.title}”合并到主档“${entry.title}”`,
                score: target.score,
                matchEvidence: target.evidence,
            });
            operations.push({
                ...op('delete-entry', duplicate.title, duplicate.uid, '重复档合并', undefined, '删除', `内容已合并到主档“${entry.title}”`),
                mergedIntoUid: entry.uid,
                requiresDistributionProof: false,
                distributionTargets: [],
            });
        }
        for (const keyword of block.keywords) {
            operations.push(entry.keywords.some((item) => (0, util_1.normalizeFact)(item) === (0, util_1.normalizeFact)(keyword))
                ? noop(entry.title, entry.uid, '关键词', `关键词“${keyword}”已存在`, target.score, target.evidence)
                : op('merge-keywords', entry.title, entry.uid, '关键词', undefined, keyword, '根据本轮信息点补充世界书关键词', target.score, target.evidence));
        }
        for (const section of block.sections) {
            if (/(关键词|触发词|标签|分类)/u.test(section.name))
                continue;
            if (isLifecycleCommandSection(section.name))
                continue;
            if (section.empty) {
                if (allowsExplicitClear(section.name) || block.type === '总结') {
                    const current = entry.sections.values[section.name] ?? [];
                    operations.push(current.length
                        ? op('replace-section', entry.title, entry.uid, section.name, current.join('\n'), '', '完整快照明确为空，清除旧状态', target.score, target.evidence)
                        : noop(entry.title, entry.uid, section.name, '完整快照已经为空', target.score, target.evidence));
                }
                else operations.push(noop(entry.title, entry.uid, section.name, '非快照栏目填写“无”，不执行写入', target.score, target.evidence));
                continue;
            }
            const lines = linesWithoutCrossSectionDuplicates(block, section);
            if (!lines.length) { operations.push(noop(entry.title, entry.uid, section.name, '该信息已在同一对象的主要归属小标题中表达', target.score, target.evidence)); continue; }
            if (/(事件进程|关键进展|已发生进展|未发生进展)/u.test(section.name) && block.type !== '事件') { operations.push(noop(entry.title, entry.uid, section.name, '事件过程只能写入事件条目', target.score, target.evidence)); continue; }
            const sectionPolicy = authoritativeSnapshotPolicy(block.type, section.name)
                ?? (options.compactEventProgressFromSummary === true && block.type === '事件' && /^(已发生进展|未发生进展|结果)$/u.test(section.name)
                    ? 'replace-section'
                    : policyFor(section.name, settings));
            operations.push(...operationsForExisting(entry, section.name, lines, sectionPolicy, target.score, target.evidence));
        }
        if (options.compactEventProgressFromSummary === true && block.type === '事件') {
            for (const legacySection of ['目标', '阶段', '关键进展', '事件进程', '未决']) {
                const current = entry.sections.values[legacySection] ?? [];
                if (!current.length) continue;
                operations.push(op('replace-section', entry.title, entry.uid, legacySection, current.join('\n'), '', '事件已按状态变化快照压缩，消费旧目标、阶段、未决和过程栏目', target.score, target.evidence));
            }
        }
    }
    // [MA-SCENE-SETTLE-01] 当前场景切换时，结算旧场景的活动快照；固定角色和固定设施继续留在场景主条目。
    operations.push(...(0, governance_1.sceneSettlementOperations)(blocks, entries));
    if (options.cleanupTemporaryAfterSummary === true)
        operations.push(...temporaryCleanupOperations(entries, settings, blocks));
    if (options.consumeSmallSummaryAfterLarge === true)
        operations.push(...consumeSmallSummaryOperations(entries));
    const primaryOperations = dedupeOperations(operations);
    // [MA-REL-01] 独立物品条目是物品状态的权威宿主；人物【持有】与场景【当前资源】只做最短引用。
    // 只对本轮触及的物品做机械一致性校正，不扫描或重写无关条目。
    const projectedEntries = applyPlanToEntries({ operations: primaryOperations }, entries, settings);
    const relationOperations = relationshipConsistencyOperations(blocks, projectedEntries);
    return { blocks, operations: dedupeOperations([...primaryOperations, ...relationOperations]), governance: governed.diagnostics, currentSceneTitle: governed.currentSceneTitle, createdAt: Date.now() };
}
function ensureDisambiguatedTitles(blocks, entries) {
    return blocks.map((source) => {
        const block = structuredClone(source);
        const collisions = entries.filter((entry) => (0, util_1.normalizeTitle)(entry.title) === (0, util_1.normalizeTitle)(block.title));
        if (!collisions.length || !collisions.some((entry) => (0, matcher_1.identityConflict)(block, entry))) return block;
        if (/[（(][^）)]+[）)]/u.test(block.name)) return block;
        const anchor = disambiguationAnchor(block);
        if (!anchor) return block;
        block.name = `${block.name}（${anchor}）`;
        block.title = `${block.type}｜${block.name}`;
        block.keywords = (0, util_1.unique)([block.name, ...(block.keywords ?? [])]).slice(0, 4);
        return block;
    });
}
function disambiguationAnchor(block) {
    const priority = ['唯一编号', '编号', '序列号', '型号', '种族', '职业', '组织', '阵营', '身份', '类别'];
    const values = new Map();
    for (const section of block.sections ?? []) {
        if (!/^(?:身份|稳定|定义|当前)$/u.test(section.name)) continue;
        for (const line of section.lines ?? []) {
            const match = String(line).match(/^\s*([^：:]{1,24})\s*[：:]\s*(.+)$/u);
            if (!match) continue;
            const label = (0, util_1.normalizeFact)(match[1]).replace(/^所属/u, '');
            const canonical = ({ 账号id: '编号', id: '编号', 所属组织: '组织' })[label] ?? label;
            if (priority.includes(canonical) && !values.has(canonical)) values.set(canonical, String(match[2] ?? '').trim());
        }
    }
    for (const key of priority) {
        const value = values.get(key);
        if (value && !/^(?:无|未知|未说明)$/u.test((0, util_1.normalizeFact)(value))) return value.slice(0, 20);
    }
    return '';
}
function coalesceEventBlocks(blocks) {
    const output = [];
    for (const incoming of blocks) {
        if (String(incoming?.type ?? '') !== '事件') {
            output.push(structuredClone(incoming));
            continue;
        }
        const current = output.find((candidate) => candidate.type === '事件' && (0, matcher_1.sameEventLifecycle)(candidate, incoming));
        if (!current) {
            output.push(structuredClone(incoming));
            continue;
        }
        current.keywords = (0, util_1.unique)([...(current.keywords ?? []), ...(incoming.keywords ?? []), incoming.name].filter(Boolean));
        const byName = new Map(current.sections.map((section) => [section.name, section]));
        for (const section of incoming.sections ?? []) {
            const target = byName.get(section.name);
            if (!target) {
                current.sections.push(structuredClone(section));
                byName.set(section.name, current.sections.at(-1));
            }
            else {
                target.lines = (0, information_point_1.mergeCanonicalLines)(section.name, target.lines, section.lines);
                target.empty = target.lines.length === 0;
            }
        }
        if ((0, util_1.normalizeFact)(current.name) !== (0, util_1.normalizeFact)(incoming.name)) {
            let aliases = byName.get('别名');
            if (!aliases) {
                aliases = { name: '别名', lines: [], empty: false };
                current.sections.push(aliases);
                byName.set('别名', aliases);
            }
            aliases.lines = (0, util_1.unique)([...aliases.lines, incoming.name]);
            aliases.empty = false;
        }
    }
    return output;
}

function applyPlanToEntries(plan, entries, settings = undefined) {
    const output = entries.map((entry) => structuredClone(entry));
    const byUid = new Map(output.map((entry) => [entry.uid, entry]));
    const createdByTitle = new Map();
    const modifiedEntries = new Set();
    for (const operation of plan.operations) {
        if (operation.kind === 'noop')
            continue;
        if (operation.kind === 'create-entry') {
            if (!createdByTitle.has((0, util_1.normalizeTitle)(operation.title))) {
                const split = (0, util_1.splitTitle)(operation.title);
                if (!split)
                    continue;
                const entry = {
                    uid: `new:${(0, util_1.hashText)(operation.title)}`,
                    title: operation.title,
                    normalizedTitle: (0, util_1.normalizeTitle)(operation.title).toLocaleLowerCase(),
                    type: split.type,
                    name: split.name,
                    content: '',
                    sections: { order: [], values: {} },
                    keywords: (0, util_1.unique)([split.name, split.type]),
                    aliases: [],
                    references: [],
                    focus: false,
                    locked: false,
                    managed: true,
                    activation: { enabled: true, constant: false, selective: false, vectorized: true, recursive: false, preventRecursion: true, excludeRecursion: false, depth: 4, order: 400, position: 4, probability: 100, disabled: false },
                    raw: {},
                };
                output.push(entry);
                createdByTitle.set((0, util_1.normalizeTitle)(operation.title), entry);
                byUid.set(entry.uid, entry);
                modifiedEntries.add(entry);
            }
            continue;
        }
        const target = operation.targetUid ? byUid.get(operation.targetUid) : createdByTitle.get((0, util_1.normalizeTitle)(operation.title));
        if (!target)
            continue;
        if (operation.kind === 'merge-entry') {
            const source = byUid.get(String(operation.sourceUid ?? ''));
            if (source && source.uid !== target.uid) mergeEntryData(target, source);
        }
        else applyOne(target, operation);
        modifiedEntries.add(target);
    }
    if (settings?.entryBudgetEnabled !== false) for (const entry of modifiedEntries) enforceEntryBudgets(entry);
    return output;
}
// [MA-CONTENT-01] 单条目正文预算：允许场景知识持续补全，但阻止模型把动作流水或重复描述无限写入世界书。
const SECTION_BUDGETS = {
    // 动态对象：当前快照最大，固定事实次之，稳定定义与历史引用依次递减。
    人物: { 身份: 2, 稳定: 3, 性格核心: 4, 表达方式: 3, 决策倾向: 3, 当前: 8, 固定事实: 6, 关系: 5, 关系立场: 5, 持有: 5, 已知: 6, 误信: 4, 别名: 4 },
    // 常驻角色与固定设施属于场景稳定骨架；在场、当前资源与活动关联只保存当前场景快照，离场即结算清空。
    场景: { 定义: 3, 空间结构: 5, 固定资源: 5, 固定设施: 8, 常驻角色: 5, 当前状态: 8, 在场: 12, 当前资源: 8, 活动关联: 4, 固定事实: 6, 世界影响: 3, 局部约束: 4, 别名: 4 },
    物品: { 定义: 3, 功能: 4, 当前: 8, 限制: 3, 固定事实: 6, 别名: 4 },
    事件: { 参与: 6, 附属人员: 4, 场景: 3, 已发生进展: 4, 未发生进展: 2, 结果: 2, 别名: 4 },
    世界: { 范围: 3, 地理: 5, 组织: 5, 权力: 8, 制度: 8, 资源与交通: 8, 公开局势: 8, 固定事实: 6, 持续影响: 5, 别名: 4 },
    // 基础设定的核心就是稳定规则，因此规则栏目拥有最大预算。
    基础设定: { 世界常识: 8, 自然规则: 8, 种族与生命: 8, 能力与技术: 8, 社会规则: 8, 地理框架: 8, 别名: 4 },
};
function enforceEntryBudgets(entry) {
    const budgets = SECTION_BUDGETS[String(entry?.type ?? '')] ?? {};
    for (const [section, limitValue] of Object.entries(budgets)) {
        const limit = Math.max(1, Number(limitValue || 1));
        let lines = (0, util_1.unique)(entry.sections?.values?.[section] ?? []).map(compactFactLine).filter(Boolean);
        if (entry.type === '场景' && section === '常驻角色') lines = compactFixedSceneRoles(lines);
        if (entry.type === '事件' && section === '附属人员') lines = compactAuxiliaryPeople(lines);
        if (lines.length <= limit) {
            if (entry.sections?.values) entry.sections.values[section] = lines;
            continue;
        }
        // 固定事实超过预算时，把较早结果压缩为一行并保留最新结果；不再简单删除中间经历。
        if (section === '固定事实') {
            entry.sections.values[section] = compressOlderFixedFacts(lines, limit);
            continue;
        }
        // 事件只保存状态变化的高密度结果；较早进展压成一行，未形成进展只保留最近短暂材料。
        if (entry.type === '事件' && section === '已发生进展') {
            entry.sections.values[section] = compressOlderEventProgress(lines, limit);
            continue;
        }
        // 稳定骨架保留早期根基与最新补充；当前快照由整段替换保证不会堆积。
        const preserveEdges = /^(身份|稳定|定义|空间结构|固定资源|世界常识|自然规则|种族与生命|能力与技术|社会规则|地理框架)$/u.test(section);
        if (preserveEdges) {
            const headCount = Math.min(2, Math.ceil(limit / 3));
            const tailCount = Math.max(0, limit - headCount);
            entry.sections.values[section] = (0, util_1.unique)([...lines.slice(0, headCount), ...lines.slice(-tailCount)]).slice(0, limit);
        }
        else entry.sections.values[section] = lines.slice(-limit);
    }
    if (entry.type === '事件' && (entry.sections?.values?.['结果'] ?? []).length) {
        entry.sections.values['未发生进展'] = [];
        const progressed = (0, util_1.unique)(entry.sections.values['已发生进展'] ?? []).filter(Boolean);
        if (progressed.length > 2) entry.sections.values['已发生进展'] = compressOlderEventProgress(progressed, 2);
    }
    enforceTotalCharacterBudget(entry);
    return entry;
}
function compactFixedSceneRoles(lines) {
    const grouped = new Map();
    const named = [];
    for (const line of lines) {
        const [rawName, rawDuty = '固定承担本场景岗位职责。'] = String(line).split(/[:：]/u, 2);
        const role = canonicalBackgroundRole(rawName);
        if (!role) { named.push(line); continue; }
        const duties = grouped.get(role) ?? [];
        duties.push(String(rawDuty).trim());
        grouped.set(role, duties);
    }
    const generic = [...grouped.entries()].map(([role, duties]) => `${role}：${(0, util_1.unique)(duties).slice(0, 2).join('；')}`);
    return (0, util_1.unique)([...named, ...generic]);
}
function compactAuxiliaryPeople(lines) {
    const named = [];
    const generic = new Map();
    for (const line of lines) {
        const [rawName, rawDuty = '参与本次事件。'] = String(line).split(/[:：]/u, 2);
        const role = canonicalBackgroundRole(rawName);
        if (!role) { named.push(line); continue; }
        const duties = generic.get(role) ?? [];
        duties.push(String(rawDuty).trim());
        generic.set(role, duties);
    }
    return (0, util_1.unique)([...named, ...[...generic.entries()].map(([role, duties]) => `${role}：${(0, util_1.unique)(duties).slice(0, 1).join('；')}`)]);
}
function canonicalBackgroundRole(value) {
    const text = String(value ?? '').replace(/(?:甲|乙|丙|丁|A|B|C|D|\d+)$/iu, '').trim();
    const mappings = [
        [/(?:管理员|门卫|保安|守卫)/u, '管理与守卫人员'],
        [/(?:店员|售货员|收银员|服务员|侍者|接待员)/u, '服务人员'],
        [/(?:工作人员|办事员|职员)/u, '工作人员'],
        [/(?:监考|裁判|主持人)/u, '赛务人员'],
        [/(?:医生|护士|药师)/u, '医疗人员'],
        [/(?:士兵|侍卫)/u, '守备人员'],
        [/(?:学生|同学|居民|村民|市民|群众|路人|顾客|客人)/u, '普通在场人员'],
    ];
    return mappings.find(([pattern]) => pattern.test(text))?.[1] || '';
}

function compactFactLine(value) {
    const line = String(value ?? '').replace(/^\s*[-*]\s*/u, '').replace(/\s+/gu, ' ').trim();
    if (!line || line.length <= 140) return line;
    const sentence = line.slice(0, 140).match(/^(.{28,139}?[。；！？!?])/u)?.[1];
    return sentence || `${line.slice(0, 136).replace(/[，、：:；;\s]+$/u, '')}…`;
}

// [MA-BUDGET-02] 总字数预算由条目结构决定，不随旧条目平均长度无限膨胀。
const ENTRY_CHAR_LIMITS = Object.freeze({ 人物: [300, 520], 场景: [260, 520], 物品: [140, 260], 事件: [180, 360], 世界: [300, 620], 基础设定: [320, 680], 运行包: [900, 2200], 总结: [420, 900] });
function dynamicEntryCharLimit(entry) {
    const [base, hard] = ENTRY_CHAR_LIMITS[String(entry?.type ?? '')] ?? [220, 520];
    const values = entry?.sections?.values ?? {};
    let extra = 0;
    if (entry.type === '人物') {
        if ((values['性格核心'] ?? []).length) extra += 45;
        if ((values['表达方式'] ?? []).length) extra += 35;
        if ((values['决策倾向'] ?? []).length) extra += 35;
        extra += Math.min(80, Math.max(0, (values['关系立场'] ?? values['关系'] ?? []).length - 1) * 20);
        if ((values['当前'] ?? []).length >= 4) extra += 25;
    }
    else if (entry.type === '场景') {
        extra += Math.min(80, (values['空间结构'] ?? []).length * 12);
        extra += Math.min(60, (values['固定设施'] ?? []).length * 8);
        extra += Math.min(50, (values['常驻角色'] ?? []).length * 10);
    }
    else if (entry.type === '事件') {
        extra += Math.min(80, Math.max(0, (values['已发生进展'] ?? []).length - 1) * 24);
        if ((values['结果'] ?? []).length) extra += 30;
    }
    return Math.min(hard, base + extra);
}
function measureEntryCharacters(entry) {
    const values = entry?.sections?.values ?? {};
    return String(entry?.title ?? '').length + Object.entries(values).reduce((sum, [section, lines]) => sum + section.length + (lines ?? []).join('\n').length + 4, 0);
}
function enforceTotalCharacterBudget(entry) {
    const limit = dynamicEntryCharLimit(entry);
    if (measureEntryCharacters(entry) <= limit) return;
    const values = entry.sections?.values ?? {};
    // 先删低价值过程和背景附属，再压缩历史；身份、性格、表达、决策和当前状态受保护。
    const dropOrder = entry.type === '人物'
        ? ['误信', '已知', '固定事实', '持有', '关系', '稳定', '别名']
        : entry.type === '场景'
            ? ['世界影响', '局部约束', '当前资源', '活动关联', '固定事实', '固定资源', '固定设施', '常驻角色', '空间结构']
            : entry.type === '事件'
                ? ['未发生进展', '附属人员']
                : Object.keys(values).reverse();
    for (const section of dropOrder) {
        const lines = values[section] ?? [];
        while (lines.length > protectedMinimum(entry.type, section) && measureEntryCharacters(entry) > limit) lines.shift();
        if (measureEntryCharacters(entry) <= limit) return;
    }
    // [MA-BUDGET-03] 多个受保护栏目同时过长时，先降低每栏行数，再按标点边界缩短句子。
    // 不从句子中间硬切；若没有可用语义边界而仍超限，则拒绝本次提交。
    shrinkProtectedSections(entry);
    if (measureEntryCharacters(entry) <= limit) return;
    compactProtectedSections(entry, limit);
    if (measureEntryCharacters(entry) > limit) {
        throw new Error(`条目“${entry.title || entry.name || entry.type}”无法在不破坏受保护内容的情况下压缩到 ${limit} 字以内`);
    }
}
const PRESSURE_SECTION_LIMITS = Object.freeze({
    人物: { 身份: 1, 性格核心: 2, 表达方式: 1, 决策倾向: 1, 关系立场: 2, 当前: 5 },
    场景: { 定义: 1, 当前状态: 4, 在场: 12 },
    事件: { 参与: 6, 场景: 1, 已发生进展: 2, 结果: 1 },
});
function shrinkProtectedSections(entry) {
    const limits = PRESSURE_SECTION_LIMITS[String(entry?.type ?? '')] ?? {};
    const values = entry.sections?.values ?? {};
    for (const [section, maxLines] of Object.entries(limits)) {
        const lines = values[section] ?? [];
        if (lines.length <= maxLines) continue;
        const preserveRoot = /^(?:身份|性格核心|定义)$/u.test(section);
        if (maxLines <= 1) values[section] = [preserveRoot ? lines[0] : lines.at(-1)].filter(Boolean);
        else {
            const head = preserveRoot ? 1 : 0;
            values[section] = (0, util_1.unique)([...lines.slice(0, head), ...lines.slice(-(maxLines - head))]).slice(0, maxLines);
        }
    }
}
function compactProtectedSections(entry, limit) {
    const limits = PRESSURE_SECTION_LIMITS[String(entry?.type ?? '')] ?? {};
    const values = entry.sections?.values ?? {};
    const protectedSections = Object.keys(limits).filter((section) => (values[section] ?? []).length);
    if (!protectedSections.length) return;
    const lineCount = protectedSections.reduce((sum, section) => sum + (values[section] ?? []).length, 0);
    const structuralCost = String(entry?.title ?? '').length + protectedSections.reduce((sum, section) => sum + section.length + 4, 0) + Math.max(0, lineCount - 1);
    let perLine = Math.max(18, Math.floor((limit - structuralCost) / Math.max(1, lineCount)));
    while (perLine >= 18 && measureEntryCharacters(entry) > limit) {
        for (const section of protectedSections) values[section] = (values[section] ?? []).map((line) => compactAtSemanticBoundary(line, perLine));
        perLine -= 4;
    }
}
function compactAtSemanticBoundary(value, maxLength) {
    const line = compactFactLine(value);
    if (line.length <= maxLength) return line;
    const chunks = line.split(/(?<=[。；！？!?])|[，,、]/u).map((item) => item.trim()).filter(Boolean);
    let result = '';
    for (const chunk of chunks) {
        const candidate = result ? `${result}，${chunk}` : chunk;
        if (candidate.length > maxLength) break;
        result = candidate;
    }
    if (result) return /[。；！？!?]$/u.test(result) ? result : `${result}。`;
    throw new Error(`事实行缺少可安全压缩的语义边界：${line}`);
}
function protectedMinimum(type, section) {
    if (type === '人物' && /^(?:身份|性格核心|表达方式|决策倾向|关系立场|当前)$/u.test(section)) return 1;
    if (type === '场景' && /^(?:定义|当前状态|在场)$/u.test(section)) return 1;
    if (type === '事件' && /^(?:参与|场景|已发生进展|结果)$/u.test(section)) return 1;
    return 0;
}
function mergeEntryData(target, source) {
    target.keywords = (0, util_1.unique)([...(target.keywords ?? []), ...(source.keywords ?? [])]);
    target.aliases = (0, util_1.unique)([...(target.aliases ?? []), ...(source.aliases ?? []), source.name].filter(Boolean));
    target.references = (0, util_1.unique)([...(target.references ?? []), ...(source.references ?? [])]);
    target.sections ??= { order: [], values: {} };
    target.sections.order ??= [];
    target.sections.values ??= {};
    for (const section of source.sections?.order ?? Object.keys(source.sections?.values ?? {})) {
        const incoming = source.sections?.values?.[section] ?? [];
        if (!incoming.length) continue;
        if (!target.sections.values[section]) {
            target.sections.values[section] = [];
            target.sections.order.push(section);
        }
        const current = target.sections.values[section];
        for (const line of incoming) {
            const anchor = informationAnchor(line);
            if (anchor && /^(当前|当前状态|阶段)$/u.test(section) && current.some((item) => informationAnchor(item) === anchor)) continue;
            if (!current.some((item) => (0, util_1.normalizeFact)(item) === (0, util_1.normalizeFact)(line))) current.push(line);
        }
    }
}

function operationsForNewSection(title, type, section, lines, policy, normalized = false) {
    if (type === '总结') policy = 'replace-section';
    if (!normalized && type === '人物' && /^(当前|当前状态)$/u.test(section)) {
        const multiValue = lines.filter(isMultiValueFact);
        const scalar = lines.filter((line) => !isMultiValueFact(line));
        return [
            ...multiValue.map(() => noop(title, undefined, section, '该事实应写入人物【关系】、【持有】或【稳定】，不写入人物【当前】状态槽')),
            ...operationsForNewSection(title, type, section, scalar, policy, true),
        ];
    }
    if (policy === 'merge-keywords') {
        return lines.map((line) => op('merge-keywords', title, undefined, section, undefined, line, '新条目关键词合并'));
    }
    if (policy === 'merge-titles') {
        return lines.map((line) => op('merge-titles', title, undefined, section, undefined, line, '新条目关联标题合并'));
    }
    if (policy === 'replace-section') {
        const snapshot = normalizeSnapshotLines(section, lines);
        return [op('replace-section', title, undefined, section, undefined, snapshot.join('\n'), '新条目整段写入')];
    }
    if (policy === 'replace-by-anchor') {
        return collapseIncomingBySlot(lines, policy).map((rawLine) => {
            const line = normalizeStateLine(section, (0, parser_1.normalizePointLine)(rawLine));
            const anchor = informationAnchor(line);
            return anchor
                ? op('append-line', title, undefined, section, undefined, line, `新条目写入明确状态槽“${anchor}”`)
                : noop(title, undefined, section, '当前状态缺少明确字段标签，拒绝写入可能无法更新的冲突状态');
        });
    }
    return lines.map((line) => op('append-line', title, undefined, section, undefined, line, '新条目信息点写入'));
}
function operationsForExisting(entry, section, lines, policy, score, evidence) {
    if (entry.type === '总结') policy = 'replace-section';
    const current = entry.sections.values[section] ?? [];
    if (policy === 'replace-section') {
        const next = normalizeSnapshotLines(section, lines).join('\n');
        if ((0, util_1.normalizeFact)(current.join('\n')) === (0, util_1.normalizeFact)(next))
            return [noop(entry.title, entry.uid, section, '整段内容未变化', score, evidence)];
        return [op('replace-section', entry.title, entry.uid, section, current.join('\n'), next, '该小标题配置为整段替换', score, evidence)];
    }
    if (policy === 'merge-keywords') {
        return lines.map((line) => entry.keywords.some((item) => (0, util_1.normalizeFact)(item) === (0, util_1.normalizeFact)(line))
            ? noop(entry.title, entry.uid, section, '关键词已存在', score, evidence)
            : op('merge-keywords', entry.title, entry.uid, section, undefined, line, '合并新关键词', score, evidence));
    }
    if (policy === 'merge-titles') {
        return lines.map((line) => entry.references.some((item) => (0, util_1.normalizeTitle)(item) === (0, util_1.normalizeTitle)(line))
            ? noop(entry.title, entry.uid, section, '关联标题已存在', score, evidence)
            : op('merge-titles', entry.title, entry.uid, section, undefined, (0, util_1.normalizeTitle)(line), '合并新关联标题', score, evidence));
    }
    const result = [];
    const incomingLines = collapseIncomingBySlot(lines, policy);
    const otherFacts = Object.entries(entry.sections.values)
        .filter(([name]) => name !== section && !/(关键词|触发词|标签|分类|别名|称号)/u.test(name))
        .flatMap(([, values]) => values);
    for (const incomingRaw of incomingLines) {
        const point = (0, parser_1.normalizePointLine)(incomingRaw);
        const incoming = policy === 'replace-by-anchor' ? normalizeStateLine(section, point) : point;
        if (entry.type === '人物' && /^(当前|当前状态)$/u.test(section) && isMultiValueFact(point)) {
            result.push(noop(entry.title, entry.uid, section, '该事实应写入人物【关系】、【持有】或【稳定】，不写入人物【当前】状态槽', score, evidence));
            continue;
        }
        const normalizedIncoming = (0, util_1.normalizeFact)(point);
        const duplicateElsewhere = otherFacts.find((line) => (0, util_1.normalizeFact)(line) === normalizedIncoming);
        if (duplicateElsewhere) {
            result.push(noop(entry.title, entry.uid, section, '相同事实已存在于该条目的其他主要归属小标题，拒绝重复写入', score, evidence));
            continue;
        }
        const exactOld = current.find((line) => (0, util_1.normalizeFact)(line) === normalizedIncoming || (0, util_1.normalizeFact)(normalizeStateLine(section, line)) === (0, util_1.normalizeFact)(incoming));
        if (exactOld) {
            result.push(noop(entry.title, entry.uid, section, '标准化后完全相同，跳过重复信息点', score, evidence));
            continue;
        }
        const anchor = informationAnchor(incoming);
        if (entry.type === '人物' && /^(已知|误信)$/u.test(section) && anchor) {
            const oppositeSection = section === '已知' ? '误信' : '已知';
            const opposite = entry.sections.values[oppositeSection] ?? [];
            for (const oldLine of opposite.filter((line) => informationAnchor(line) === anchor)) {
                result.push(op('delete-line', entry.title, entry.uid, oppositeSection, oldLine, undefined, `人物认知槽“${anchor.replace(/^label:/u, '')}”已转入【${section}】，清除相反认知`, score, evidence));
            }
        }
        const anchoredOld = anchor ? current.find((line) => informationAnchor(line) === anchor) : undefined;
        if (policy === 'replace-by-anchor') {
            if (!anchor) {
                result.push(noop(entry.title, entry.uid, section, '当前状态缺少明确字段标签，拒绝追加可能冲突的状态；应使用“字段：当前值”格式', score, evidence));
                continue;
            }
            if (anchoredOld) {
                result.push(op('replace-line', entry.title, entry.uid, section, anchoredOld, incoming, `同一信息槽“${anchor}”更新当前值`, score, evidence));
            }
            else {
                result.push(op('append-line', entry.title, entry.uid, section, undefined, incoming, `首次写入明确状态槽“${anchor}”`, score, evidence));
            }
            continue;
        }
        if (policy === 'semantic-upsert' && anchoredOld) {
            result.push(op('replace-line', entry.title, entry.uid, section, anchoredOld, incoming, `同一固定信息槽“${anchor}”被新事实替换`, score, evidence));
            continue;
        }
        result.push(op('append-line', entry.title, entry.uid, section, undefined, incoming, policy === 'append-chain' ? '非完全重复，按时间顺序追加事件或经历' : '非完全重复且无同槽旧值，追加信息点', score, evidence));
    }
    return result;
}
function normalizeSnapshotLines(section, lines) {
    if (!/^(?:当前|当前状态)$/u.test(String(section ?? ''))) return (0, util_1.unique)(lines);
    const output = [];
    const positions = new Map();
    for (const rawLine of lines ?? []) {
        const line = normalizeStateLine(section, (0, parser_1.normalizePointLine)(rawLine));
        const anchor = informationAnchor(line);
        if (anchor && positions.has(anchor)) output[positions.get(anchor)] = line;
        else {
            if (anchor) positions.set(anchor, output.length);
            output.push(line);
        }
    }
    return (0, util_1.unique)(output);
}
function collapseIncomingBySlot(lines, policy) {
    if (policy !== 'replace-by-anchor' && policy !== 'semantic-upsert')
        return lines;
    const output = [];
    const positions = new Map();
    for (const line of lines) {
        const anchor = informationAnchor(line);
        if (!anchor) {
            output.push(line);
            continue;
        }
        if (positions.has(anchor))
            output[positions.get(anchor)] = line;
        else {
            positions.set(anchor, output.length);
            output.push(line);
        }
    }
    return output;
}
function allowsExplicitClear(section) {
    return /^(当前|当前状态|在场|当前资源|活动关联|持有|未发生进展)$/u.test(String(section ?? '').trim());
}
function isLifecycleCommandSection(section) {
    return /(沉降处理|条目处理|生命周期|退出处理|退出建议|分发目标|长期影响)/u.test(String(section ?? ''));
}
function isControlSection(section) {
    return /(沉降处理|条目处理|生命周期|退出处理|退出建议|分发目标|长期影响|影响对象|关联条目|关联对象|涉及条目|参与对象|引用)/u.test(String(section ?? ''));
}

function isBusinessFactSection(section) {
    return Boolean(String(section ?? '').trim())
        && !isControlSection(section)
        && !/(关键词|触发词|标签|分类|别名|称号|其他名称)/u.test(String(section));
}
function consumeSmallSummaryOperations(entries) {
    return entries
        .filter((entry) => entry.title === '总结｜当前事件' && !entry.locked && !entry.focus)
        .map((entry) => ({
            ...op('delete-entry', entry.title, entry.uid, '大总结沉降', undefined, '删除', '大总结已承接并分发当前事件小总结，消费旧小总结容器'),
            requiresDistributionProof: false,
            distributionTargets: [],
        }));
}

function temporaryCleanupOperations(entries, settings, summaryBlocks = []) {
    const temporaryNames = new Set(['临时', '临时对象', '临时条目']);
    const summaryText = summaryBlocks.map((block) => [block.title, ...block.sections.flatMap((section) => section.lines)].join('\n')).join('\n');
    const normalizedSummary = (0, util_1.normalizeFact)(summaryText);
    return entries.flatMap((entry) => {
        const temporary = entry.keywords.some((keyword) => temporaryNames.has((0, util_1.normalizeFact)(keyword)));
        if (!temporary || !entry.managed || entry.locked || entry.focus || isFoundationProtected(entry, settings)) return [];
        if (!/^(人物|角色|NPC)$/u.test(entry.type)) return [];
        const name = (0, util_1.normalizeFact)(entry.name);
        if (name && normalizedSummary.includes(name)) return [];
        if (entry.references?.length) return [];
        const protectedSection = Object.entries(entry.sections.values ?? {}).some(([section, lines]) => {
            if (!lines?.length) return false;
            return /(身份|稳定|关系|持有|已知|误信|固定事实)/u.test(section);
        });
        if (protectedSection) return [];
        return [{
            ...op('delete-entry', entry.title, entry.uid, '临时条目清理', undefined, '删除', '总结未继续承接该一次性背景人物，且没有身份、稳定能力、关系、持有物或固定事实；插件机械退出'),
            requiresDistributionProof: false,
            distributionTargets: [],
        }];
    });
}
function shouldMarkTemporary(block) {
    if (String(block.type ?? '').trim() !== '人物') return false;
    if ((0, matcher_1.isProvisionalName)(block.name)) return true;
    return block.keywords?.some((keyword) => /^(?:身份未明|未知身份|临时)$/u.test((0, util_1.normalizeFact)(keyword))) === true;
}
function isFoundationProtected(entry, settings) {
    const definition = settings.keywordDefinitions.find((item) => item.label === '基础设定');
    const names = definition ? [definition.label, ...definition.aliases] : ['基础设定'];
    return entry.keywords.some((keyword) => names.some((name) => (0, util_1.normalizeFact)(keyword) === (0, util_1.normalizeFact)(name)));
}
function linesWithoutCrossSectionDuplicates(block, section) {
    if (!/(固定事实|持续经历|近期经历|持续变化|世界变化|已发生进展)/u.test(section.name)) return section.lines;
    const current = block.sections.filter((item) => /^(当前|当前状态)$/u.test(item.name)).flatMap((item) => item.lines).map(util_1.normalizeFact);
    return section.lines.filter((line) => !current.includes((0, util_1.normalizeFact)(line)));
}

function compressOlderFixedFacts(lines, limit) {
    if (lines.length <= limit) return lines;
    const recentCount = Math.max(1, limit - 1);
    const older = lines.slice(0, -recentCount)
        .flatMap((line) => String(line).replace(/^较早结果[：:]/u, '').split(/；/u))
        .map((line) => line.trim().replace(/[。；;]+$/u, ''))
        .filter(Boolean);
    const recent = lines.slice(-recentCount);
    const compressed = historicalDigest(older);
    return (0, util_1.unique)([compressed, ...recent]).slice(0, limit);
}
function historicalDigest(lines) {
    const facts = (0, util_1.unique)(lines).map((line) => line.length > 30 ? `${line.slice(0, 29)}…` : line);
    const all = `较早结果：${facts.join('；')}`;
    if (all.length <= 140) return all;
    const head = facts.slice(0, 2);
    const tail = facts.slice(-2);
    return compactFactLine(`较早结果：${head.join('；')}；……（共${facts.length}项）；${tail.join('；')}`);
}

function compressOlderEventProgress(lines, limit) {
    const uniqueLines = (0, util_1.unique)(lines).map((line) => String(line).replace(/^较早进展[：:]/u, '').trim()).filter(Boolean);
    if (uniqueLines.length <= limit) return uniqueLines;
    const recentCount = Math.max(1, limit - 1);
    const older = uniqueLines.slice(0, -recentCount);
    const recent = uniqueLines.slice(-recentCount);
    const digest = compactFactLine(`较早进展：${older.join('；')}`);
    return (0, util_1.unique)([digest, ...recent]).slice(0, limit);
}

function suppressStateProjectionNarratives(blocks) {
    const claims = blocks
        .filter((block) => block.type === '物品')
        .map((block) => ({
            item: block.name,
            holder: blockStateValue(block, '当前持有者'),
            location: blockStateValue(block, '当前位置'),
        }))
        .filter((claim) => claim.item && (claim.holder || claim.location));
    if (!claims.length) return blocks;
    return blocks.map((block) => {
        if (block.type === '物品') return block;
        const next = structuredClone(block);
        for (const section of next.sections ?? []) {
            if (!/^(固定事实|已发生进展|关键进展|结果)$/u.test(section.name)) continue;
            section.lines = (section.lines ?? []).filter((line) => !claims.some((claim) => isPureStateProjection(line, claim)));
            section.empty = section.lines.length === 0;
        }
        return next;
    });
}
function blockStateValue(block, label) {
    const section = (block.sections ?? []).find((item) => /^(当前|当前状态)$/u.test(item.name));
    const line = section?.lines?.find((item) => canonicalInformationLabel(item.match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1] ?? '', section.name) === label);
    return String(line?.match(/^\s*[^：:]{1,24}\s*[：:]\s*(.*)$/u)?.[1] ?? '').trim();
}
function isPureStateProjection(line, claim) {
    const normalized = (0, util_1.normalizeFact)(line);
    const item = (0, util_1.normalizeFact)(claim.item);
    const holder = (0, util_1.normalizeFact)(claim.holder);
    const location = (0, util_1.normalizeFact)(claim.location);
    if (!normalized || !item || !normalized.includes(item)) return false;
    // 含有独立事件结果时保留，只删除“换角度重述物品状态”的短句。
    if (/(击败|杀死|死亡|受伤|获胜|失败|逃离|摧毁|签署|解散|建立|发现|结束战斗|冲突结束)/u.test(normalized)) return false;
    if (normalized.length > item.length + holder.length + location.length + 14) return false;
    if (holder && !isNoneStateValue(holder)) {
        const patterns = [
            `${holder}把${item}收回`, `${holder}将${item}收回`, `${holder}收回${item}`,
            `${holder}拿回${item}`, `${holder}带走${item}`, `${holder}携带${item}`, `${holder}持有${item}`,
            `${item}由${holder}持有`, `${item}由${holder}携带`, `${item}被${holder}收回`,
        ];
        if (patterns.some((value) => normalized === value || normalized.startsWith(value))) return true;
    }
    if (location) {
        const patterns = [`${item}位于${location}`, `${item}留在${location}`, `${item}被放回${location}`, `${item}已归还${location}`];
        if (patterns.some((value) => normalized === value || normalized.startsWith(value))) return true;
    }
    // 即使人物角度写出的动作与最终物品快照矛盾，独立物品当前状态仍是权威宿主。
    const transferVerbs = ['收回', '拿回', '带走', '携带', '持有', '放回', '归还', '交还', '取走'];
    if (transferVerbs.some((verb) => normalized.endsWith(`${verb}${item}`) || normalized.includes(`把${item}${verb}`) || normalized.includes(`将${item}${verb}`))) return true;
    return false;
}

function relationshipConsistencyOperations(blocks, projectedEntries) {
    const directItems = blocks.filter((block) => block.type === '物品').map((block) => block.name).filter(Boolean);
    const referencedItems = projectedEntries
        .filter((entry) => entry.type === '物品')
        .filter((item) => blocks.some((block) => block.sections?.some((section) => /^(?:持有|当前资源)$/u.test(section.name)
            && section.lines?.some((line) => referencesObject(line, item.name)))))
        .map((item) => item.name);
    const touchedItems = (0, util_1.unique)([...directItems, ...referencedItems]);
    if (!touchedItems.length) return [];
    const operations = [];
    for (const itemName of touchedItems) {
        const item = findEntryByName(projectedEntries, '物品', itemName);
        if (!item || item.locked) continue;
        const holderValue = entryStateValue(item, '当前持有者');
        const locationValue = entryStateValue(item, '当前位置');
        const holder = isNoneStateValue(holderValue) ? null : findEntryByName(projectedEntries, '人物', holderValue);
        const scene = holder ? null : findContainingEntry(projectedEntries, '场景', locationValue);
        const projectToHolder = holder ? itemProjectsToPerson(item, holderValue) : false;

        for (const person of projectedEntries.filter((entry) => entry.type === '人物' && !entry.locked)) {
            const current = [...(person.sections?.values?.['持有'] ?? [])];
            const withoutItem = current.filter((line) => !referencesObject(line, item.name));
            const shouldHold = projectToHolder && holder?.uid === person.uid;
            const next = shouldHold ? (0, util_1.unique)([...withoutItem, item.name]) : withoutItem;
            if ((0, util_1.normalizeFact)(current.join('\n')) !== (0, util_1.normalizeFact)(next.join('\n'))) {
                operations.push(op('replace-section', person.title, person.uid, '持有', current.join('\n'), next.join('\n'), shouldHold
                    ? `独立物品“${item.name}”当前由该人物持有，人物卡只保留最短引用`
                    : `独立物品“${item.name}”的权威持有状态不在该人物，移除旧引用`));
            }
        }

        for (const candidate of projectedEntries.filter((entry) => entry.type === '场景' && !entry.locked)) {
            const current = [...(candidate.sections?.values?.['当前资源'] ?? [])];
            const withoutItem = current.filter((line) => !referencesObject(line, item.name));
            const shouldContain = scene?.uid === candidate.uid;
            const next = shouldContain ? (0, util_1.unique)([...withoutItem, item.name]) : withoutItem;
            if ((0, util_1.normalizeFact)(current.join('\n')) !== (0, util_1.normalizeFact)(next.join('\n'))) {
                operations.push(op('replace-section', candidate.title, candidate.uid, '当前资源', current.join('\n'), next.join('\n'), shouldContain
                    ? `独立物品“${item.name}”无人持有且位于本场景，场景仅保留资源引用`
                    : `独立物品“${item.name}”已不属于本场景当前资源，移除旧引用`));
            }
        }
    }
    return operations;
}
function itemProjectsToPerson(item, holderValue) {
    const holder = (0, util_1.normalizeFact)(holderValue);
    if (!holder) return false;
    const owner = (0, util_1.normalizeFact)(entryStateValue(item, '所有权'));
    const keeper = (0, util_1.normalizeFact)(entryStateValue(item, '保管者'));
    const permission = (0, util_1.normalizeFact)(entryStateValue(item, '使用权限'));
    const text = (0, util_1.normalizeFact)(Object.values(item.sections?.values ?? {}).flat().join('；'));
    const shared = /(?:公用|公共|共享|共用|任何人|所有人|全体|合格学员|组织成员|授权人员)/u.test(`${permission}${text}`)
        || Boolean(owner && owner !== holder)
        || Boolean(keeper && keeper !== holder);
    if (!shared) return true;
    if (owner === holder || keeper === holder) return true;
    const escaped = holder.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return new RegExp(`(?:正式分配给|授予|专属(?:于)?|长期由|绑定(?:于)?|归)${escaped}|${escaped}(?:个人所有|长期保管|专属使用)`, 'u').test(text);
}
function entryStateValue(entry, label) {
    const lines = entry.sections?.values?.['当前'] ?? entry.sections?.values?.['当前状态'] ?? [];
    for (const line of lines) {
        const match = String(line).match(/^\s*([^：:]{1,24})\s*[：:]\s*(.*)$/u);
        if (!match) continue;
        if (canonicalInformationLabel(match[1], '当前') === label) return String(match[2] ?? '').trim();
    }
    return '';
}
function findEntryByName(entries, type, value) {
    const target = (0, util_1.normalizeFact)(String(value ?? '').replace(/(?:随身|手中|身上|腰间|背包中)$/u, ''));
    if (!target) return null;
    return entries.find((entry) => entry.type === type && [entry.name, ...(entry.aliases ?? []), ...(entry.keywords ?? [])]
        .some((name) => (0, util_1.normalizeFact)(name) === target)) ?? null;
}
function findContainingEntry(entries, type, value) {
    const target = (0, util_1.normalizeFact)(value);
    if (!target) return null;
    return entries
        .filter((entry) => entry.type === type)
        .sort((left, right) => (0, util_1.normalizeFact)(right.name).length - (0, util_1.normalizeFact)(left.name).length)
        .find((entry) => {
            const names = [entry.name, ...(entry.aliases ?? []), ...(entry.keywords ?? [])].map(util_1.normalizeFact).filter((name) => name.length >= 2);
            return names.some((name) => target.includes(name) || name.includes(target));
        }) ?? null;
}
function referencesObject(line, name) {
    const target = (0, util_1.normalizeFact)(name);
    const value = (0, util_1.normalizeFact)(line);
    return Boolean(target && value && (value === target || value.includes(target)));
}
function isNoneStateValue(value) {
    return /^(?:无|没有|无人|空|未持有|未使用|不适用|null|none)$/iu.test((0, util_1.normalizeFact)(value));
}

function isCollectiveItemTitle(name) {
    const text = String(name ?? '').trim();
    const normalized = (0, util_1.normalizeFact)(text);
    if (!text) return true;
    if (new Set(['物品','道具','装备','武器','工具','家具','桌椅','餐具','衣物','服装','食物','食品','药品','药物','物资','用品','器材','车辆','书籍','文件','货物','资源']).has(normalized)) return true;
    return /[、,，]|(?:若干|多个|数个|几(?:个|件|把|瓶|辆|本|枚|支|套|张)|多(?:个|件|把|瓶|辆|本|枚|支|套|张)|一批|一组|一堆|大量|成排|所有|各种|各类|同类)/u.test(text);
}
function isMultiValueLabel(label) {
    return /^(持有物|物品|装备|关系|关联对象|关联条目|资源列表|成员)$/u.test(String(label ?? '').trim());
}
function isMultiValueFact(line) {
    const text = String(line ?? '');
    const label = text.match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1]?.trim();
    return (label ? isMultiValueLabel(label) : false)
        || /(?:获得|失去|持有|拥有|建立关系|结为|成为盟友|成为敌人)/u.test(text);
}
function dedupeOperations(operations) {
    const seen = new Set();
    return operations.filter((operation) => {
        if (seen.has(operation.id)) return false;
        seen.add(operation.id);
        return true;
    });
}
function policyFor(section, settings) {
    const exact = settings.sectionPolicies[section];
    if (exact)
        return exact;
    if (/(关键词|触发词|别名|称号)/u.test(section))
        return 'merge-keywords';
    if (/(关联条目|关联对象|涉及条目|参与对象|引用|影响对象)/u.test(section))
        return 'merge-titles';
    if (/^(未发生进展)$/u.test(section))
        return 'replace-section';
    if (/^(已发生进展)$/u.test(section))
        return 'semantic-upsert';
    if (/(关键进展|事件进程|事件链|进程|过程|阶段记录|行动记录)/u.test(section))
        return 'append-chain';
    if (/^(固定事实|持续经历|近期经历|持续变化|世界变化|变化记录)$/u.test(section))
        return 'semantic-upsert';
    if (/^(已知|误信)$/u.test(section))
        return 'semantic-upsert';
    if (/(当前|状态|位置|持有者|所有者|归属|数量|完整性|可用性|阶段|当前结果|活动状态|范围|地理|组织|权力|制度|资源与交通|公开局势|持续影响)/u.test(section))
        return 'replace-by-anchor';
    if (/(完整摘要|当前总结|长期总结|对象定义|基础定义|在场|当前资源|活动关联|世界影响|局部约束|持有|参与|场景|未发生进展|结果)/u.test(section))
        return 'replace-section';
    return 'semantic-upsert';
}
function authoritativeSnapshotPolicy(type, section) {
    const key = `${String(type ?? '').trim()}|${String(section ?? '').trim()}`;
    if (/^(?:人物|角色|NPC)\|(?:当前|当前状态|持有)$/u.test(key)) return 'replace-section';
    if (/^(?:场景|地点|时空)\|(?:当前状态|在场|当前资源|活动关联)$/u.test(key)) return 'replace-section';
    if (/^(?:物品|道具|装备)\|(?:当前|当前状态)$/u.test(key)) return 'replace-section';
    return null;
}
function normalizeStateLine(section, line) {
    const labelMatch = line.match(/^\s*([^：:]{1,24})\s*[：:]\s*(.*)$/u);
    if (labelMatch) {
        const canonical = canonicalInformationLabel(labelMatch[1], section);
        return canonical ? `${canonical}：${labelMatch[2].trim()}` : line;
    }
    if (informationAnchor(line)) return line;
    const name = String(section ?? '').trim();
    const canonical = canonicalInformationLabel(name, section);
    return canonical ? `${canonical}：${line}` : line;
}
function canonicalInformationLabel(label, section = '') {
    const name = String(label ?? '').trim();
    const normalized = (0, util_1.normalizeFact)(name);
    const mappings = [
        [/^(当前位置|位置|所在地|所在地点|当前地点)$/u, '当前位置'],
        [/^(身体状态|身体情况|健康状态|伤势|受伤|身体)$/u, '身体状态'],
        [/^(当前身份|身份|职位|阵营|职业)$/u, '当前身份'],
        [/^(当前目标|目标|目的|计划)$/u, '当前目标'],
        [/^(所有权|所有者|产权方|归属方)$/u, '所有权'],
        [/^(保管者|保管方|管理者)$/u, '保管者'],
        [/^(当前持有者|持有者|携带者)$/u, '当前持有者'],
        [/^(当前使用者|使用者|操作者)$/u, '当前使用者'],
        [/^(使用权限|可使用者|授权对象)$/u, '使用权限'],
        [/^(事件状态|当前阶段|阶段)$/u, String(section).includes('阶段') || normalized.includes('阶段') ? '当前阶段' : '事件状态'],
        [/^(数量|库存|完整性|可用性|魔力|体力|生命值|金币)$/u, name],
        [/^(关系状态|态度|敌友|合作)$/u, '关系状态'],
        [/^(能力状态|技能状态)$/u, '能力状态'],
        [/^(当前状态|一般状态|状态)$/u, '当前状态'],
    ];
    return mappings.find(([pattern]) => pattern.test(normalized))?.[1] || '';
}
function informationAnchor(line) {
    const normalized = (0, util_1.normalizeFact)(line);
    const label = line.match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1]?.trim();
    if (label) {
        if (isMultiValueLabel(label)) return '';
        const canonical = canonicalInformationLabel(label);
        return `label:${(0, util_1.normalizeFact)(canonical || label)}`;
    }
    if (isMultiValueFact(line)) return '';
    const fieldPattern = /^(.{1,24}?)(?:的)?(身份|血统|种族|职业|阵营|所有权|所有者|保管者|当前持有者|持有者|当前使用者|使用者|使用权限|位置|当前位置|阶段|当前阶段|结果|当前结果|生死状态|意识状态|身体状况|身体状态|健康状态|当前目标|目标|数量|库存|等级|进度|完整性|可用性|魔力|体力|生命值|金币)(?:是|为|变为|变成|升至|降至|增至|减至|恢复至|恢复到|减少到|增加到|只剩|剩余)(.+)$/u;
    const fieldMatch = line.match(fieldPattern);
    if (fieldMatch)
        return `${(0, util_1.normalizeFact)(fieldMatch[1] ?? '')}|${(0, util_1.normalizeFact)(fieldMatch[2] ?? '')}`;
    const possessiveFieldMatch = line.match(/^(.{1,24}?)的(.{1,24}?)(?:是|为|变为|变成|升至|降至|增至|减至|恢复至|恢复到|减少到|增加到|只剩|剩余)(.+)$/u);
    if (possessiveFieldMatch)
        return `${(0, util_1.normalizeFact)(possessiveFieldMatch[1] ?? '')}|${(0, util_1.normalizeFact)(possessiveFieldMatch[2] ?? '')}`;
    const resourceCountMatch = line.match(/^(.{1,24}?)(?:拥有|持有|剩余|只剩)(\d+(?:\.\d+)?)(枚|个|件|点|单位)(.{1,16})$/u);
    if (resourceCountMatch)
        return `${(0, util_1.normalizeFact)(resourceCountMatch[1] ?? '')}|${(0, util_1.normalizeFact)(resourceCountMatch[4] ?? '')}数量`;
    const patterns = [
        [/^(.{1,24}?)(?:当前)?(?:位于|身处|在)(.+)$/u, '当前位置'],
        [/^(.{1,24}?)(?:当前)?由(.{1,24}?)持有$/u, '当前持有者'],
        [/^(.{1,24}?)(?:当前)?由(.{1,24}?)使用$/u, '当前使用者'],
        [/^(.{1,24}?)(?:当前)?由(.{1,24}?)保管$/u, '保管者'],
        [/^(.{1,24}?)(?:归|属于)(.{1,24}?)所有$/u, '所有权'],
        [/^(.{1,24}?)(?:当前)?(?:状态为|处于)(.+)$/u, '一般状态'],
        [/^(.{1,24}?)(?:死亡|身亡|存活|复活)(.*)$/u, '生死状态'],
        [/^(.{1,24}?)(?:昏迷|清醒|失去意识|恢复意识)(.*)$/u, '意识状态'],
        [/^(.{1,24}?)(?:受伤|痊愈|中毒|患病|康复)(.*)$/u, '身体状况'],
    ];
    for (const [pattern, relation] of patterns) {
        const match = line.match(pattern);
        if (match)
            return `${(0, util_1.normalizeFact)(match[1] ?? '')}|${relation}`;
    }
    return '';
}
function applyOne(entry, operation) {
    const section = operation.section ?? '';
    const values = entry.sections.values;
    const aliasSection = operation.kind === 'merge-keywords' && /(别名|称号|其他名称)/u.test(section);
    if (section && (operation.kind !== 'merge-keywords' || aliasSection) && !values[section]) {
        values[section] = [];
        entry.sections.order.push(section);
    }
    if (operation.kind === 'append-line' && operation.newValue) {
        const current = [...(values[section] ?? [])];
        const replaceAtApply = /^(当前|当前状态|关系|阶段|权力|制度|资源与交通|公开局势|持续影响)$/u.test(section);
        const anchor = replaceAtApply ? informationAnchor(operation.newValue) : '';
        const index = anchor ? current.findIndex((line) => informationAnchor(line) === anchor) : -1;
        if (index >= 0) current[index] = operation.newValue;
        else current.push(operation.newValue);
        values[section] = (0, util_1.unique)(current);
    }
    if (operation.kind === 'replace-line' && operation.newValue) {
        const previous = values[section] ?? [];
        const index = previous.findIndex((line) => line === operation.oldValue);
        if (index >= 0)
            previous[index] = operation.newValue;
        else
            previous.push(operation.newValue);
        values[section] = (0, util_1.unique)(previous);
    }
    if (operation.kind === 'delete-line' && operation.oldValue !== undefined) {
        values[section] = (values[section] ?? []).filter((line) => line !== operation.oldValue);
    }
    if (operation.kind === 'replace-section')
        values[section] = (0, util_1.unique)(String(operation.newValue ?? '').split('\n').map((line) => line.trim()).filter(Boolean));
    if (operation.kind === 'merge-titles' && operation.newValue) {
        values[section] = (0, util_1.unique)([...(values[section] ?? []), (0, util_1.normalizeTitle)(operation.newValue)]);
        entry.references = (0, util_1.unique)([...entry.references, (0, util_1.normalizeTitle)(operation.newValue)]);
    }
    if (operation.kind === 'merge-keywords' && operation.newValue) {
        if (aliasSection) {
            values[section] = (0, util_1.unique)([...(values[section] ?? []), operation.newValue]);
            entry.aliases = (0, util_1.unique)([...entry.aliases, operation.newValue]);
        }
        entry.keywords = (0, util_1.unique)([...entry.keywords, operation.newValue]);
    }
}
function op(kind, title, targetUid, section, oldValue, newValue, reason, score, matchEvidence) {
    return { id: operationId(kind, title, `${section}|${oldValue}|${newValue}`), kind, operation: businessOperationKind(kind), title, ...(targetUid ? { targetUid } : {}), ...(section ? { section } : {}), ...(oldValue !== undefined ? { oldValue } : {}), ...(newValue !== undefined ? { newValue } : {}), reason, ...(score !== undefined ? { score } : {}), ...(matchEvidence ? { matchEvidence } : {}) };
}
function noop(title, targetUid, section, reason, score, matchEvidence) {
    return op('noop', title, targetUid, section, undefined, undefined, reason, score, matchEvidence);
}
function operationId(kind, title, value) {
    return `${kind}:${(0, util_1.hashText)(`${kind}|${title}|${value}`)}`;
}
function businessOperationKind(kind) {
    return ({
        'append-line': 'append',
        'replace-line': 'replace-slot',
        'replace-section': 'replace-section',
        'delete-line': 'delete-line',
        'merge-keywords': 'append',
        'merge-titles': 'append',
        'merge-entry': 'merge',
        'create-entry': 'create',
        'delete-entry': 'delete',
        noop: 'no-op',
    })[kind] ?? kind;
}
},"parser":function(module,exports,require){


"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseInformationPoints = parseInformationPoints;
exports.parseStrictExtractionBlocks = parseStrictExtractionBlocks;
exports.parseExtractionWithRecovery = parseExtractionWithRecovery;
exports.canonicalExtractionType = canonicalExtractionType;
exports.parseEntrySections = parseEntrySections;
exports.serializeEntrySections = serializeEntrySections;
exports.sanitizeModelText = sanitizeModelText;
exports.sanitizeWorldbookLine = sanitizeWorldbookLine;
exports.normalizePointLine = normalizePointLine;
exports.parseLabeledSections = parseLabeledSections;
exports.stripListMarker = stripListMarker;
const util_1 = require("./util");
const information_point_1 = require("./domain/information-point");
const SECTION_PATTERN = /^\s*【\s*([^】]+?)\s*】\s*$/u;
const PLAIN_SECTION_PATTERN = /^\s*([^：:\n]{1,24})\s*[:：]\s*$/u;
const TITLE_PATTERN = /^\s*(?:#{1,6}\s*)?([^【】\n]+?[｜|丨][^【】\n]+?)\s*$/u;
const COLON_TITLE_PATTERN = /^\s*(?:#{1,6}\s*)?((?:人物|角色|NPC|事件|地点|场景|物品|道具|世界|全局|全局状态|全局变化|基础设定|基础规则|世界设定|总结))\s*[:：]\s*([^：:\n]+?)\s*$/u;
const BULLET_PATTERN = /^\s*(?:[-*]\s+|[•·]\s*|\d+、\s*|\d+[.)]\s+)(.*?)\s*$/u;
const EMPTY_PATTERN = /^\s*(?:无|无变化|无新增事实|无可记录事实|没有)\s*[。.]?\s*$/u;
const EMPTY_VALUE_PATTERN = /^\s*[^：:\n]{1,24}\s*[:：]\s*(?:无|无变化|没有|未知|未说明)\s*[。.]*\s*$/u;
const PLAIN_SECTION_NAMES = new Set([
    '身份', '稳定', '性格核心', '表达方式', '决策倾向', '当前', '关系', '关系立场', '持有', '已知', '误信', '持续经历',
    '定义', '空间结构', '固定资源', '固定设施', '常驻角色', '持续变化', '当前状态', '在场', '当前资源', '活动关联', '世界影响', '局部约束',
    '功能', '限制', '目标', '参与', '附属人员', '场景', '阶段', '关键进展', '未决', '已发生进展', '未发生进展', '结果',
    '范围', '地理', '组织', '权力', '制度', '资源与交通', '公开局势', '世界变化', '持续影响',
    '世界常识', '自然规则', '种族与生命', '能力与技术', '社会规则', '地理框架', '别名',
    '固定事实', '近期经历', '事件进程', '变化记录', '最终结果', '关联条目', '关键词', '触发词', '标签', '分类',
]);
const STRICT_ENTRY_PATTERN = /<<<ENTRY:([^:\r\n>]+):([^>\r\n]+)>>>\s*<<<KEYWORDS>>>\s*([\s\S]*?)\s*<<<CONTENT>>>\s*([\s\S]*?)\s*<<<END_ENTRY>>>/gu;
const STRICT_TYPES = new Set(['人物', '场景', '物品', '事件', '世界', '基础设定']);
// [MA-CONTROL-01] 模型控制层文本不得进入世界书。这里仅过滤插件自身的协议、任务说明和来源标记，
// 不按普通“规则/禁止”字样泛删，避免误伤真实世界设定。
const CONTROL_LINE_PATTERNS = [
    /<<<\s*(?:ENTRY|KEYWORDS|CONTENT|END[_\s-]*ENTRY)\b/iu,
    /<\/?think>/iu,
    /^```/u,
    /^(?:system|developer|assistant|user)\s*[：:]/iu,
    /^(?:你是\s*Mirror\s*Abyss|任务\s*[：:]\s*(?:以一轮完整对话|世界书|只检查候选|只处理一个)|旧世界书精简来源索引|本组来源行|候选目录|结构校验结果|请覆盖索引中的全部来源行|严格输出一个|唯一允许的外层语法|唯一输出格式|只允许六类|组ID使用\s*G1)/iu,
    /^(?:名称|归入类型|建议类型|与现有类型区别|合并来源|来源行|保留方式|并入条目|并入栏目)\s*[：:]/u,
    /^【\s*(?:新条目|内容|角色认知|过去结果|关键词|唯一输出格式|任务说明|重建规则)\s*】$/u,
    /^(?:禁止JSON、代码块|禁止解释、JSON|多个条目连续输出|每个来源行只能出现一次)/u,
];
const STRICT_SECTION_ORDER = {
    人物: ['关键词', '身份', '稳定', '性格核心', '表达方式', '决策倾向', '当前', '关系', '关系立场', '持有', '已知', '误信', '固定事实', '别名'],
    场景: ['关键词', '定义', '空间结构', '固定资源', '固定设施', '常驻角色', '固定事实', '当前状态', '在场', '当前资源', '活动关联', '世界影响', '局部约束', '别名'],
    物品: ['关键词', '定义', '功能', '当前', '限制', '固定事实', '别名'],
    事件: ['关键词', '参与', '附属人员', '场景', '已发生进展', '未发生进展', '结果', '别名'],
    世界: ['关键词', '范围', '地理', '组织', '权力', '制度', '资源与交通', '公开局势', '固定事实', '持续影响', '别名'],
    基础设定: ['关键词', '世界常识', '自然规则', '种族与生命', '能力与技术', '社会规则', '地理框架', '别名'],
};
function parseStrictExtractionBlocks(raw) {
    return parseExtractionWithRecovery(raw);
}
function parseExtractionWithRecovery(raw) {
    const diagnostics = { repaired: 0, merged: [], skipped: [], warnings: [], hadInput: false };
    const text = normalizeExtractionEnvelope(raw, diagnostics);
    if (/^(?:无|EMPTY)$/u.test(text.trim())) return attachDiagnostics([], diagnostics);
    diagnostics.hadInput = Boolean(text.trim());
    const starts = [...text.matchAll(/<<<ENTRY\s*[:：]\s*([^:\r\n>]+)\s*[:：]\s*([^>\r\n]+)>>>/giu)];
    if (!starts.length) {
        diagnostics.skipped.push({ title: '未知条目', reason: '缺少 ENTRY 标记', raw: text.slice(0, 600) });
        return attachDiagnostics([], diagnostics);
    }
    const parsedBlocks = [];
    for (let index = 0; index < starts.length; index += 1) {
        const match = starts[index];
        const segmentStart = match.index ?? 0;
        const segmentEnd = index + 1 < starts.length ? (starts[index + 1].index ?? text.length) : text.length;
        const segment = text.slice(segmentStart, segmentEnd);
        const type = canonicalExtractionType(match[1]);
        const name = String(match[2] ?? '').trim().replace(/[<>\r\n]/gu, '').replace(/[：:]+/gu, '·');
        const title = `${type || String(match[1] ?? '').trim()}｜${name || '未命名'}`;
        if (!STRICT_TYPES.has(type)) {
            diagnostics.skipped.push({ title, reason: `不允许的条目类型 ${type || '空'}`, raw: segment.slice(0, 600) });
            continue;
        }
        if (!name || /^未命名$/u.test(name)) {
            diagnostics.skipped.push({ title, reason: '缺少稳定名称', raw: segment.slice(0, 600) });
            continue;
        }
        const keywordsStart = segment.search(/<<<KEYWORDS>>>/iu);
        const contentStart = segment.search(/<<<CONTENT>>>/iu);
        if (contentStart < 0) {
            diagnostics.skipped.push({ title, reason: '缺少 CONTENT 标记', raw: segment.slice(0, 600) });
            continue;
        }
        let keywordText = '';
        if (keywordsStart >= 0 && keywordsStart < contentStart) {
            keywordText = segment.slice(keywordsStart + '<<<KEYWORDS>>>'.length, contentStart);
        } else {
            diagnostics.repaired += 1;
            diagnostics.warnings.push(`${title}缺少 KEYWORDS 标记，已从稳定名称和类型补齐`);
        }
        let contentText = segment.slice(contentStart + '<<<CONTENT>>>'.length);
        const endIndex = contentText.search(/<<<END_ENTRY>>>/iu);
        if (endIndex >= 0) contentText = contentText.slice(0, endIndex);
        else {
            diagnostics.repaired += 1;
            diagnostics.warnings.push(`${title}缺少 END_ENTRY，已按下一条目边界补齐`);
        }
        keywordText = keywordText.replace(/<<<(?:KEYWORDS|CONTENT|END_ENTRY)>>>/giu, '\n');
        contentText = contentText.replace(/<<<(?:KEYWORDS|CONTENT|END_ENTRY)>>>/giu, '\n');
        let keywords = keywordText.replace(/\r/g, '').split('\n')
            .flatMap((line) => stripListMarker(line).split(/[,，]/u))
            .map((item) => item.trim()).filter(Boolean);
        const originalKeywordCount = keywords.length;
        keywords = sanitizeExtractionKeywords(name, type, keywords);
        if (originalKeywordCount > 4) {
            diagnostics.repaired += 1;
            diagnostics.warnings.push(`${title}关键词超过四个，已截取为稳定专名`);
        }
        const sections = recoverSections(type, contentText, diagnostics, title);
        if (!sections.length || !sections.some((section) => section.lines.length || section.empty === true)) {
            diagnostics.skipped.push({ title, reason: '正文没有可写入事实', raw: contentText.slice(0, 600) });
            continue;
        }
        parsedBlocks.push({ rawTitle: title, title, type, name, sections, keywords });
    }
    const merged = mergeDuplicateBlocks(parsedBlocks, diagnostics);
    // [MA-ITEM-01] 物品条目只允许单个可追踪实例；同类集合回收到当前场景资源。
    const collectiveNormalized = relocateCollectiveItemBlocks(merged, diagnostics);
    // [MA-ITEM-03] 普通个人附属物并入人物【持有】；普通公用物并入当前场景资源。
    // 只有具备唯一编号、独特功能、独立状态变化或跨场景追踪价值的单体物品保留独立条目。
    const normalizedBlocks = relocateDependentItemBlocks(collectiveNormalized, diagnostics);
    removeCrossEntryDuplicates(normalizedBlocks, diagnostics);
    let usable = normalizedBlocks.filter((block) => block.sections.some((section) => section.lines.length || section.empty === true));
    // [MA-SCENE-02] 单轮正文只有一个“正文结束时当前场景”。模型误报多个场景时只保留首个，
    // 其他地点不会被误标为当前场景；历史场景由事件分发或后续实际进入时补全。
    const sceneBlocks = usable.filter((block) => block.type === '场景');
    if (sceneBlocks.length > 1) {
        const currentScene = sceneBlocks[0];
        for (const extra of sceneBlocks.slice(1)) diagnostics.skipped.push({ title: extra.title, reason: `单轮只允许一个当前场景，已保留 ${currentScene.title}` });
        usable = usable.filter((block) => block.type !== '场景' || block === currentScene);
        diagnostics.repaired += sceneBlocks.length - 1;
    }
    if (usable.length > 8) {
        diagnostics.skipped.push(...usable.slice(8).map((block) => ({ title: block.title, reason: '超过单次八条上限' })));
        usable.length = 8;
    }
    return attachDiagnostics(usable, diagnostics);
}
function normalizeExtractionEnvelope(raw, diagnostics) {
    let text = String(raw ?? '')
        .replace(/<think>[\s\S]*?<\/think>/giu, '')
        .replace(/```(?:text|markdown|md)?/giu, '')
        .replace(/[＜﹤]/gu, '<')
        .replace(/[＞﹥]/gu, '>')
        .replace(/<<<\s*ENTRY\s*[：:]/giu, '<<<ENTRY:')
        .replace(/<<<\s*KEYWORDS\s*>>>/giu, '<<<KEYWORDS>>>')
        .replace(/<<<\s*CONTENT\s*>>>/giu, '<<<CONTENT>>>')
        .replace(/<<<\s*END[_\s-]*ENTRY\s*>>>/giu, '<<<END_ENTRY>>>')
        .replace(/\r/g, '')
        .trim();
    const first = text.search(/<<<ENTRY\s*:/iu);
    if (first > 0) {
        diagnostics.repaired += 1;
        diagnostics.warnings.push('已移除第一条目之前的解释文字');
        text = text.slice(first);
    }
    const lastEnd = text.lastIndexOf('<<<END_ENTRY>>>');
    if (lastEnd >= 0 && text.slice(lastEnd + '<<<END_ENTRY>>>'.length).trim()) {
        diagnostics.repaired += 1;
        diagnostics.warnings.push('已移除最后条目之后的解释文字');
        text = text.slice(0, lastEnd + '<<<END_ENTRY>>>'.length);
    }
    return text.trim();
}
function canonicalExtractionType(value) {
    const raw = String(value ?? '').trim();
    return ({ 角色: '人物', NPC: '人物', 地点: '场景', 地区: '场景', 区域: '场景', 场所: '场景', 当前场景: '场景', 道具: '物品', 装备: '物品', 事件链: '事件', 全局: '世界', 全局状态: '世界', 全局变化: '世界', 世界变化: '世界', 当前局势: '世界', 世界局势: '世界', 基础规则: '基础设定', 世界设定: '基础设定', 设定: '基础设定' })[raw] ?? raw;
}
function recoverSections(type, content, diagnostics, title) {
    const expected = STRICT_SECTION_ORDER[type] ?? [];
    const parsed = parseEntrySections(content);
    const aliases = new Map();
    for (const rawName of parsed.order) {
        const canonical = canonicalExtractionSection(type, rawName);
        if (!canonical || canonical === '关键词') continue;
        if (!expected.includes(canonical)) {
            diagnostics.repaired += 1;
            diagnostics.skipped.push({ title, reason: `已丢弃未规划小标题【${rawName}】` });
            continue;
        }
        const current = aliases.get(canonical) ?? [];
        current.push(...(parsed.values[rawName] ?? []));
        aliases.set(canonical, current);
        if (canonical !== rawName) diagnostics.repaired += 1;
    }
    if (!parsed.order.length) {
        const loose = String(content ?? '').split('\n').map((line) => stripListMarker(line).trim()).filter((line) => line && !/^<<<.+>>>$/u.test(line));
        if (loose.length) {
            const fallback = type === '事件' ? '已发生进展' : type === '场景' ? '当前状态' : type === '世界' ? '公开局势' : type === '基础设定' ? '世界常识' : '当前';
            aliases.set(fallback, loose);
            diagnostics.repaired += 1;
            diagnostics.warnings.push(`${title}缺少小标题，已归入【${fallback}】`);
        }
    }
    const sections = [];
    for (const name of expected.filter((item) => item !== '关键词')) {
        // 未输出的小标题不等于“明确为空”；只有模型实际给出该标题且内容为“无”时才允许清空旧快照。
        if (!aliases.has(name)) continue;
        let lines = (0, util_1.unique)((aliases.get(name) ?? [])
            .map((line) => sanitizeExtractionLine(line, type, name))
            .filter((line) => line && !EMPTY_PATTERN.test(line) && (!EMPTY_VALUE_PATTERN.test(line) || /^(当前|当前状态|公开局势|未发生进展)$/u.test(name)) && !/完整事实句|稳定名称|甲与乙/u.test(line)));
        const maxLines = sectionLineLimit(type, name);
        if (lines.length > maxLines) {
            diagnostics.repaired += lines.length - maxLines;
            diagnostics.warnings.push(`${title}【${name}】超过${maxLines}行，已保留前${maxLines}行`);
            lines = lines.slice(0, maxLines);
        }
        sections.push({ name, lines, empty: lines.length === 0 });
    }
    normalizeEpistemicSections(type, sections, diagnostics, title);
    return sections;
}
function hasExplicitMisbeliefEvidence(value) {
    return /(?:证伪依据|证伪事实|已(?:被)?证伪|已确认(?:为|是)?错误|与(?:已确认|客观|世界)事实冲突)/u.test(String(value ?? ''));
}
function normalizeEpistemicSections(type, sections, diagnostics, title) {
    if (type !== '人物') return sections;
    const mistaken = sections.find((section) => section.name === '误信');
    if (!mistaken?.lines?.length) return sections;
    let known = sections.find((section) => section.name === '已知');
    const retained = [];
    const moved = [];
    for (const line of mistaken.lines) {
        if (hasExplicitMisbeliefEvidence(line)) retained.push(line);
        else moved.push(line.replace(/\s*｜\s*认知来源\s*[：:]/u, '｜信息来源：'));
    }
    if (moved.length) {
        if (!known) {
            known = { name: '已知', lines: [], empty: false };
            const index = sections.findIndex((section) => section.name === '误信');
            sections.splice(Math.max(0, index), 0, known);
        }
        known.lines = (0, util_1.unique)([...(known.lines ?? []), ...moved]);
        known.empty = known.lines.length === 0;
        diagnostics.repaired += moved.length;
        diagnostics.warnings.push(`${title}有${moved.length}条未被明确证伪的认知，已从【误信】归入【已知】`);
    }
    mistaken.lines = retained;
    mistaken.empty = retained.length === 0;
    if (moved.length && retained.length === 0) {
        const index = sections.indexOf(mistaken);
        if (index >= 0) sections.splice(index, 1);
    }
    return sections;
}
function canonicalExtractionSection(type, value) {
    return (0, information_point_1.canonicalSectionName)(value, type);
}

function mergeDuplicateBlocks(blocks, diagnostics) {
    const map = new Map();
    for (const block of blocks) {
        const key = (0, util_1.normalizeTitle)(block.title);
        const current = map.get(key);
        if (!current) {
            map.set(key, structuredClone(block));
            continue;
        }
        diagnostics.repaired += 1;
        diagnostics.merged.push(block.title);
        current.keywords = sanitizeExtractionKeywords(current.name, current.type, [...current.keywords, ...block.keywords]).slice(0, 4);
        for (const incoming of block.sections) {
            const target = current.sections.find((section) => section.name === incoming.name);
            if (!target) current.sections.push(structuredClone(incoming));
            else {
                target.lines = mergeSectionLines(incoming.name, target.lines, incoming.lines);
                target.empty = target.lines.length === 0;
            }
        }
    }
    return [...map.values()];
}
function mergeSectionLines(section, oldLines, newLines) {
    const replaceBySlot = /^(当前|当前状态|关系|范围|地理|组织|权力|制度|资源与交通|公开局势|持续影响)$/u.test(section);
    if (!replaceBySlot) return (0, util_1.unique)([...oldLines, ...newLines]);
    const output = [...oldLines];
    const slots = new Map();
    output.forEach((line, index) => { const slot = extractionSlot(line); if (slot) slots.set(slot, index); });
    for (const line of newLines) {
        const slot = extractionSlot(line);
        if (slot && slots.has(slot)) output[slots.get(slot)] = line;
        else {
            if (slot) slots.set(slot, output.length);
            output.push(line);
        }
    }
    return (0, util_1.unique)(output);
}
function extractionSlot(line) {
    return String(line ?? '').match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1]?.replace(/\s+/gu, '') ?? '';
}
const COLLECTIVE_ITEM_NAMES = new Set([
    '物品', '道具', '装备', '武器', '工具', '家具', '桌椅', '餐具', '衣物', '服装', '食物', '食品', '药品', '药物', '物资', '用品', '器材', '车辆', '书籍', '文件', '货物', '资源',
]);
function relocateCollectiveItemBlocks(blocks, diagnostics) {
    const scene = blocks.find((block) => block.type === '场景');
    const output = [];
    for (const block of blocks) {
        if (block.type !== '物品' || !isCollectiveItemBlock(block)) {
            output.push(block);
            continue;
        }
        const label = collectiveItemLabel(block);
        if (scene) {
            let section = scene.sections.find((item) => item.name === '当前资源');
            if (!section) {
                section = { name: '当前资源', lines: [], empty: true };
                scene.sections.push(section);
            }
            section.lines = (0, util_1.unique)([...section.lines, label]);
            section.empty = section.lines.length === 0;
            diagnostics.repaired += 1;
            diagnostics.warnings.push(`${block.title}是同类物品集合，已转入${scene.title}【当前资源】`);
        }
        else {
            diagnostics.skipped.push({ title: block.title, reason: '物品条目只允许单个可追踪实例；集合物品需要写入当前场景资源' });
        }
    }
    return output;
}
function isCollectiveItemBlock(block) {
    const name = String(block?.name ?? '').trim();
    const normalized = (0, util_1.normalizeFact)(name);
    if (!name) return true;
    if (COLLECTIVE_ITEM_NAMES.has(normalized)) return true;
    if (/[、,，]|(?:和|与|及)其他/u.test(name)) return true;
    if (/(?:若干|多个|数个|几(?:个|件|把|瓶|辆|本|枚|支|套|张)|多(?:个|件|把|瓶|辆|本|枚|支|套|张)|一批|一组|一堆|大量|成排|所有|各种|各类|同类)/u.test(name)) return true;
    if (/(?:桌椅|刀具|餐具|药品|药物|食品|食物|物资|用品|器材|家具|衣物|服装|武器|装备|工具|车辆|书籍|文件|货物|资源)$/u.test(name)
        && !/(?:的|专用|唯一|编号|号|遗失|染血|破损|封印|核心|钥匙|短剑|长剑|戒指|项链|徽章|信件|日记|手杖|王冠)$/u.test(name)) return true;
    const current = block.sections?.find((section) => section.name === '当前')?.lines ?? [];
    return current.some((line) => {
        const value = String(line ?? '').match(/^\s*数量\s*[：:]\s*(.+)$/u)?.[1] ?? '';
        if (!value) return false;
        const numeric = Number(value.match(/\d+(?:\.\d+)?/u)?.[0]);
        return (Number.isFinite(numeric) && numeric > 1) || /(?:多|数|若干|几|一批|一组|大量)/u.test(value);
    });
}
function collectiveItemLabel(block) {
    const current = block.sections?.find((section) => section.name === '当前')?.lines ?? [];
    const quantity = current.find((line) => /^\s*数量\s*[：:]/u.test(String(line ?? '')));
    return quantity ? `${block.name}（${String(quantity).replace(/^\s*数量\s*[：:]\s*/u, '').replace(/[。.]+$/u, '')}）` : block.name;
}
function relocateDependentItemBlocks(blocks, diagnostics) {
    const output = [];
    const scene = blocks.find((block) => block.type === '场景');
    const people = blocks.filter((block) => block.type === '人物');
    for (const block of blocks) {
        if (block.type !== '物品' || hasIndependentItemValue(block)) {
            output.push(block);
            continue;
        }
        const state = itemStateMap(block);
        const holder = state.get('当前持有者') || '';
        const publicItem = isPublicItemBlock(block, state);
        if (!publicItem && holder) {
            const person = people.find((candidate) => identityNameMatches(candidate, holder));
            if (person) {
                mergeReferenceSection(person, '持有', block.name);
                diagnostics.repaired += 1;
                diagnostics.warnings.push(`${block.title}没有独立追踪价值，已并入${person.title}【持有】`);
                continue;
            }
        }
        if (scene && (publicItem || !holder)) {
            mergeReferenceSection(scene, '当前资源', block.name);
            diagnostics.repaired += 1;
            diagnostics.warnings.push(`${block.title}是普通${publicItem ? '公用' : '场景'}物品，已并入${scene.title}【当前资源】`);
            continue;
        }
        output.push(block);
    }
    return output;
}
function hasIndependentItemValue(block) {
    const name = String(block?.name ?? '');
    if (/(?:唯一|编号|序列号|型号|专属|核心|封印|神器|遗物|王冠|徽章|日记|信件|契约|钥匙卡|[A-Za-z]*\d+[A-Za-z0-9-]*)/u.test(name)) return true;
    const importantSections = new Set(['功能', '限制', '固定事实']);
    if ((block.sections ?? []).some((section) => importantSections.has(section.name) && (section.lines?.length ?? 0) > 0)) return true;
    const definition = (block.sections ?? []).find((section) => section.name === '定义')?.lines ?? [];
    if (definition.some((line) => /(?:唯一|编号|序列号|型号|独特|专属|不可替代|跨场景|持续追踪|长期使用|长期携带|重要物品)/u.test(String(line)))) return true;
    const state = itemStateMap(block);
    return [...state.keys()].some((label) => /^(?:完整性|可用性|当前状态|能力状态|损坏状态|封印状态)$/u.test(label));
}
function itemStateMap(block) {
    const map = new Map();
    const lines = (block.sections ?? []).find((section) => section.name === '当前')?.lines ?? [];
    for (const line of lines) {
        const match = String(line).match(/^\s*([^：:]{1,24})\s*[：:]\s*(.*)$/u);
        if (!match) continue;
        const label = canonicalItemStateLabel(match[1]);
        if (label) map.set(label, String(match[2] ?? '').trim());
    }
    return map;
}
function canonicalItemStateLabel(value) {
    const label = (0, util_1.normalizeFact)(value);
    const mappings = [
        [/^(?:所有权|所有者|产权方|归属方)$/u, '所有权'],
        [/^(?:保管者|保管方|管理者)$/u, '保管者'],
        [/^(?:当前持有者|持有者|携带者)$/u, '当前持有者'],
        [/^(?:当前使用者|使用者|操作者)$/u, '当前使用者'],
        [/^(?:使用权限|可使用者|授权对象)$/u, '使用权限'],
        [/^(?:当前位置|位置|所在地)$/u, '当前位置'],
        [/^(?:完整性|损坏状态)$/u, '完整性'],
        [/^(?:可用性)$/u, '可用性'],
        [/^(?:当前状态|状态)$/u, '当前状态'],
        [/^(?:能力状态)$/u, '能力状态'],
        [/^(?:封印状态)$/u, '封印状态'],
    ];
    return mappings.find(([pattern]) => pattern.test(label))?.[1] || '';
}
function isPublicItemBlock(block, state) {
    const holder = (0, util_1.normalizeFact)(state.get('当前持有者') || '');
    const owner = (0, util_1.normalizeFact)(state.get('所有权') || '');
    const keeper = (0, util_1.normalizeFact)(state.get('保管者') || '');
    const permission = (0, util_1.normalizeFact)(state.get('使用权限') || '');
    const text = (0, util_1.normalizeFact)((block.sections ?? []).flatMap((section) => section.lines ?? []).join('；'));
    if (/(?:公用|公共|共享|共用|任何人|所有人|全体|合格学员|组织成员|授权人员)/u.test(`${permission}${text}`)) return true;
    if (owner && holder && owner !== holder) return true;
    if (keeper && holder && keeper !== holder) return true;
    return false;
}
function identityNameMatches(block, value) {
    const target = (0, util_1.normalizeFact)(String(value ?? '').replace(/(?:随身|手中|身上|腰间|背包中)$/u, ''));
    if (!target) return false;
    return [block.name, ...(block.keywords ?? [])].some((name) => (0, util_1.normalizeFact)(name) === target);
}
function mergeReferenceSection(block, sectionName, value) {
    let section = (block.sections ?? []).find((item) => item.name === sectionName);
    if (!section) {
        section = { name: sectionName, lines: [], empty: false };
        block.sections.push(section);
    }
    section.lines = (0, util_1.unique)([...(section.lines ?? []), value]);
    section.empty = section.lines.length === 0;
}
function removeCrossEntryDuplicates(blocks, diagnostics) {
    const owners = new Map();
    const knownNames = blocks.map((item) => ({ title: item.title, name: (0, util_1.normalizeFact)(item.name) })).filter((item) => item.name);
    for (const block of blocks) {
        for (const section of block.sections) {
            if (['关联条目', '别名'].includes(section.name)) continue;
            section.lines = section.lines.filter((line) => {
                const key = crossEntryFactKey(block, section.name, line, knownNames);
                if (!key) return false;
                const score = factOwnershipScore(block.type, section.name, line);
                const existing = owners.get(key);
                if (!existing) {
                    owners.set(key, { block, section, line, score });
                    return true;
                }
                if (score > existing.score) {
                    existing.section.lines = existing.section.lines.filter((item) => item !== existing.line);
                    owners.set(key, { block, section, line, score });
                    diagnostics.repaired += 1;
                    diagnostics.warnings.push(`重复事实改归属到 ${block.title}`);
                    return true;
                }
                diagnostics.repaired += 1;
                diagnostics.skipped.push({ title: block.title, reason: `与${existing.block.title}重复，已保留直接归属`, fact: line });
                return false;
            });
            section.empty = section.lines.length === 0;
        }
    }
}
function crossEntryFactKey(block, sectionName, line, knownNames) {
    const normalized = (0, util_1.normalizeFact)(line);
    if (!normalized) return '';
    const explicitSubjects = knownNames.filter((item) => normalized.includes(item.name)).map((item) => item.title).sort();
    // 只有正文明确点名对象的完整事实，才允许在不同条目间竞争唯一宿主。
    // “身份：教师”“所有权：学院”这类依赖当前条目主体的槽值必须包含主体和关系。
    if (explicitSubjects.length && !/^\s*[^：:]{1,24}\s*[：:]/u.test(String(line ?? ''))) {
        return `explicit:${normalized}`;
    }
    const label = String(line ?? '').match(/^\s*([^：:]{1,24})\s*[：:]/u)?.[1] ?? '';
    return `host:${(0, util_1.normalizeTitle)(block.title)}|section:${(0, util_1.normalizeFact)(sectionName)}|label:${(0, util_1.normalizeFact)(label)}|fact:${normalized}`;
}
function factOwnershipScore(type, section, line) {
    let score = 10;
    if (type === '事件' && /(参与|已发生进展|未发生进展|关键进展|结果|因果|状态变化)/u.test(`${section}${line}`)) score += 40;
    if (type === '人物' && /(身份|稳定|性格|表达|决策|身体|位置|目标|关系|持有|已知|误信|信息来源|认知来源|经历)/u.test(`${section}${line}`)) score += 35;
    if (type === '物品' && /(持有|位置|状态|完整|功能|限制|物品)/u.test(`${section}${line}`)) score += 35;
    if (type === '场景' && /(定义|空间|资源|在场|约束|控制|环境|场景)/u.test(`${section}${line}`)) score += 38;
    if (type === '世界' && /(范围|地理|组织|权力|制度|资源|交通|公开|世界|全局|跨场景|地区)/u.test(`${section}${line}`)) score += 36;
    if (type === '基础设定' && /(常识|自然|规则|种族|生命|能力|技术|社会|地理|世界设定|基础设定)/u.test(`${section}${line}`)) score += 36;
    return score;
}

const EXTRACTION_GENERIC_KEYWORDS = new Set(['人物','角色','npc','场景','地点','事件','活动','物品','道具','世界','当前','状态','关系','房间','区域','地方','男人','女人','男孩','女孩','少女','主角','配角','当前局势','世界局势','世界状态','世界变化']);
function sanitizeExtractionKeywords(name, type, values) {
    const output = [];
    for (const value of (0, util_1.unique)([name, ...(values ?? [])])) {
        const text = String(value ?? '').trim();
        const normalized = (0, util_1.normalizeFact)(text);
        if (!text || normalized === (0, util_1.normalizeFact)(type) || EXTRACTION_GENERIC_KEYWORDS.has(normalized)) continue;
        if (normalized !== (0, util_1.normalizeFact)(name) && /(?:男人|女人|男孩|女孩|少女|青年|老人|村民|士兵|角色|人物)$/u.test(normalized)) continue;
        if (output.some((item) => (0, util_1.normalizeFact)(item) === normalized)) continue;
        output.push(text);
        if (output.length >= 4) break;
    }
    return output.length ? output : [String(name ?? '').trim()].filter(Boolean);
}
function sanitizeWorldbookLine(value) {
    let line = normalizePointLine(value)
        .replace(/〔\s*来源行\s*[：:][^〕]+〕/giu, '')
        .replace(/(?:【|\[|（|\()\s*来源行\s*[：:][^】\]）)]+(?:】|\]|）|\))/giu, '')
        .replace(/\s+/gu, ' ')
        .trim();
    if (!line) return '';
    if (CONTROL_LINE_PATTERNS.some((pattern) => pattern.test(line))) return '';
    if (/(?:这是\s*Mirror\s*Abyss|以下是(?:系统|开发者|底层)提示词|不得把本提示词|本提示词只用于|模型必须使用以下格式)/iu.test(line)) return '';
    return line.replace(/\s+([，。；：])/gu, '$1').trim();
}
function sanitizeExtractionLine(value, type = '', section = '') {
    let line = sanitizeWorldbookLine(value).slice(0, 180).trim();
    if (!line) return '';
    if (/(?:供|给).{0,6}(?:AI|模型).{0,8}(?:参考|推测|判断)|(?:AI|模型)(?:可以|可|应当|应该)|可能意味着|建议后续|便于后续|用于推理|剧情建议/u.test(line)) return '';
    if (type === '事件' && /^(已发生进展|未发生进展)$/u.test(section) && isLowValueEventLine(line)) return '';
    // [MA-EPISTEMIC-02] 正常提取也必须保存角色获得信息的渠道；无来源或无认知槽的内容不进入【已知/误信】。
    if (type === '人物' && /^(已知|误信)$/u.test(section)) {
        const source = line.match(/(?:信息来源|认知来源)\s*[：:]\s*(亲眼观察|听到对白|收到消息|查看记录|他人转述|亲身经历|可靠推理|特殊能力|公开信息|自身身份|自身行动|直接告知)/u);
        const slot = line.match(/^\s*([^：:｜|]{1,24})\s*[：:]/u);
        if (!source || !slot) return '';
        line = line.replace(/认知来源\s*[：:]/u, '信息来源：');
    }
    // [MA-CHAR-01] 只机械移除明确的审美评价词；身份、能力、伤势和可识别特征仍由模型保留。
    if (type === '人物' && /^(身份|稳定|性格核心|表达方式|决策倾向)$/u.test(section)) {
        line = line
            .replace(/(?:绝美|倾国倾城|美若天仙|完美无瑕|惊艳绝伦|极其漂亮|非常漂亮|异常英俊|俊美无双|迷人至极|性感迷人|高贵优雅|冷艳绝伦)/gu, '')
            .replace(/[，,]{2,}/gu, '，')
            .replace(/^\s*[，,；;。.、]+|[，,；;。.、]+\s*$/gu, '')
            .trim();
        const compact = line.replace(/[^\p{L}\p{N}]/gu, '');
        if (!compact || /^(?:的)?(?:脸庞|面容|容貌|气质|身姿|外表)$/u.test(compact)) return '';
    }
    return compactExtractionLine(line, type === '人物' && /^(身份|稳定|性格核心|表达方式|决策倾向)$/u.test(section) ? 110 : 180);
}
function compactExtractionLine(line, limit) {
    const text = String(line ?? '').trim();
    if (text.length <= limit) return text;
    const punctuated = text.slice(0, limit + 1).match(/^(.{24,}?[。；！？!?])/u)?.[1];
    return punctuated || `${text.slice(0, Math.max(1, limit - 4)).replace(/[，、：:；;\s]+$/u, '')}…`;
}
function isLowValueEventLine(value) {
    const text = (0, util_1.normalizeFact)(value);
    if (!text) return true;
    const meaningful = /(?:同意|拒绝|决定|确认|发现|得知|获得|失去|交给|拿走|偷走|归还|受伤|死亡|击败|逃脱|暴露|驱逐|建立|解除|改变|完成|取消|终止|签署|达成|破坏|摧毁|掌握|恢复|占领|控制|释放|拘捕|背叛|承诺|公开|宣布|导致|造成|形成|救出|带走|夺取|移交|失踪|中毒|痊愈|晋升|离职|结盟|决裂)/u.test(text);
    if (meaningful) return false;
    const ordinary = /(?:走到|走向|来到|进入|离开|坐下|站起|抬头|低头|看向|望向|皱眉|微笑|点头|摇头|开门|关门|翻开|合上|拿起|放下|停下|沉默|寒暄|喝水|吃饭|敲门|转身|回头|挠头)/u.test(text);
    return ordinary && text.length <= 36;
}

function sectionLineLimit(type, section) {
    // 当前快照拥有最大输入预算；固定事实次之；稳定定义和关系类依次递减。
    if (/^(?:当前|当前状态)$/u.test(section)) return 8;
    if (type === '场景' && section === '在场') return 12;
    if (type === '场景' && section === '当前资源') return 8;
    if (type === '场景' && section === '常驻角色') return 5;
    if (type === '场景' && section === '固定设施') return 8;
    if (type === '世界' && /^(?:权力|制度|资源与交通|公开局势)$/u.test(section)) return 8;
    if (type === '基础设定') return section === '别名' ? 4 : 8;
    if (section === '固定事实') return 6;
    if (type === '人物' && section === '稳定') return 3;
    if (type === '人物' && section === '性格核心') return 4;
    if (type === '人物' && /^(?:表达方式|决策倾向)$/u.test(section)) return 3;
    if (type === '人物' && section === '关系立场') return 5;
    if (type === '人物' && section === '身份') return 4;
    if (type === '人物' && section === '已知') return 8;
    if (type === '人物' && section === '误信') return 6;
    if (type === '场景' && /^(空间结构|固定资源)$/u.test(section)) return 5;
    if (/^(关系|关系立场|持有|活动关联|局部约束|参与|持续影响)$/u.test(section)) return 5;
    if (type === '事件' && section === '附属人员') return 4;
    if (type === '事件' && section === '已发生进展') return 4;
    if (type === '事件' && section === '未发生进展') return 2;
    if (/^(定义|功能|限制|范围|地理|组织|结果|关键进展)$/u.test(section)) return 4;
    return 6;
}
function attachDiagnostics(blocks, diagnostics) {
    Object.defineProperty(blocks, 'diagnostics', { value: diagnostics, enumerable: false, configurable: true });
    return blocks;
}
function parseInformationPoints(raw) {
    const text = sanitizeModelText(raw);
    if (text.trim() === '无')
        return [];
    const lines = text.replace(/\r/g, '').split('\n');
    const blocks = [];
    let block = null;
    let section = null;
    for (const sourceLine of lines) {
        const line = sourceLine.trimEnd();
        const sectionMatch = line.match(SECTION_PATTERN) ?? (block ? matchPlainSection(line) : null);
        if (sectionMatch && block) {
            section = { name: sectionMatch[1].trim(), lines: [], empty: false };
            block.sections.push(section);
            continue;
        }
        // 小标题内部的项目符号可能本身是“人物｜莉娅”这类关联标题，必须先作为信息点处理。
        const bulletMatch = line.match(BULLET_PATTERN);
        if (block && section && bulletMatch) {
            const bullet = bulletMatch[1] ?? '';
            if (!bullet)
                continue;
            if (EMPTY_PATTERN.test(bullet) || EMPTY_VALUE_PATTERN.test(bullet)) {
                if (!section.lines.length) section.empty = true;
            }
            else {
                section.empty = false;
                section.lines.push(normalizePointLine(bullet));
            }
            continue;
        }
        if (block && section && (EMPTY_PATTERN.test(line) || EMPTY_VALUE_PATTERN.test(line))) {
            if (!section.lines.length) section.empty = true;
            continue;
        }
        // 冒号形式与“契约要求：”等事实天然歧义，只允许它开启首个条目。
        // 后续条目必须使用无歧义的“类型｜名称”标题。
        const titleMatch = line.match(TITLE_PATTERN) ?? (!block ? line.match(COLON_TITLE_PATTERN) : null);
        if (titleMatch && !SECTION_PATTERN.test(line)) {
            const rawTitle = titleMatch.length >= 3 ? `${titleMatch[1]}｜${titleMatch[2]}` : titleMatch[1].trim();
            // 模型没有 UID 权限。即使模型误带 UID，也只剥离为普通标题，绝不用于匹配。
            const title = (0, util_1.stripUidSuffix)(rawTitle);
            const split = (0, util_1.splitTitle)(title);
            if (!split)
                continue;
            block = { rawTitle, title, type: split.type, name: split.name, sections: [] };
            blocks.push(block);
            section = null;
            continue;
        }
        if (!block || !section || !line.trim())
            continue;
        const bullet = line.match(BULLET_PATTERN)?.[1] ?? line.trim();
        if (!bullet)
            continue;
        if (EMPTY_PATTERN.test(bullet)) {
            section.empty = true;
            section.lines = [];
            continue;
        }
        section.lines.push(normalizePointLine(bullet));
    }
    const valid = blocks.filter((candidate) => candidate.sections.length > 0);
    if (!valid.length) throw new Error('模型返回无法解析：只有精确的“无”才表示无更新');
    return valid;
}
function parseEntrySections(content) {
    const order = [];
    const values = {};
    let current = '';
    for (const sourceLine of String(content ?? '').replace(/\r/g, '').split('\n')) {
        const line = sourceLine.trimEnd();
        const match = line.match(SECTION_PATTERN) ?? matchPlainSection(line);
        if (match) {
            current = match[1].trim();
            if (!values[current]) {
                values[current] = [];
                order.push(current);
            }
            continue;
        }
        if (!current || !line.trim())
            continue;
        const bullet = line.match(BULLET_PATTERN)?.[1] ?? line.trim();
        if (!bullet || EMPTY_PATTERN.test(bullet))
            continue;
        values[current].push(normalizePointLine(bullet));
    }
    for (const name of Object.keys(values))
        values[name] = (0, util_1.unique)(values[name] ?? []);
    return { order: (0, util_1.unique)(order), values };
}
function serializeEntrySections(sections) {
    const order = (0, util_1.unique)([...sections.order, ...Object.keys(sections.values)]);
    return order
        .filter((name) => name && (sections.values[name]?.length ?? 0) > 0)
        .map((name) => `【${name}】\n${(0, util_1.unique)(sections.values[name] ?? []).map((line) => `- ${line}`).join('\n')}`)
        .join('\n\n');
}
function sanitizeModelText(raw) {
    return String(raw ?? '')
        .replace(/<think>[\s\S]*?<\/think>/giu, '')
        .replace(/^```(?:text|markdown|md)?\s*/iu, '')
        .replace(/\s*```$/u, '')
        .trim();
}
function normalizePointLine(value) {
    return stripListMarker(value)
        .replace(/\s+/gu, ' ')
        .replace(/[。.]\s*$/u, '。')
        .trim();
}
function stripListMarker(value) {
    return String(value ?? '').replace(/^\s*(?:[-*]\s+|[•·]\s*|\d+、\s*|\d+[.)]\s+)/u, '');
}
function matchPlainSection(line) {
    const match = String(line ?? '').match(PLAIN_SECTION_PATTERN);
    if (!match) return null;
    const compact = match[1].replace(/\s+/gu, '').trim();
    return PLAIN_SECTION_NAMES.has(compact) ? match : null;
}
function parseLabeledSections(text) {
    const map = new Map();
    let current = '';
    for (const rawLine of String(text ?? '').replace(/\r/g, '').split('\n')) {
        const line = rawLine.trimEnd();
        const match = line.match(SECTION_PATTERN) ?? matchPlainSection(line);
        if (match) {
            current = match[1].trim();
            if (!map.has(current)) map.set(current, []);
            continue;
        }
        if (current) map.get(current).push(line);
    }
    return map;
}
},"prompts":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractionPrompts = extractionPrompts;
exports.extractionDeltaPrompts = extractionDeltaPrompts;
exports.auditPrompts = auditPrompts;
exports.revisionPrompts = revisionPrompts;
exports.summaryPrompts = summaryPrompts;
exports.duplicatePrompts = duplicatePrompts;
exports.extractionRepairPrompts = extractionRepairPrompts;
exports.worldSettingImportPrompts = worldSettingImportPrompts;
exports.migrationPrompts = migrationPrompts;
exports.migrationPlanningPrompts = migrationPlanningPrompts;
exports.plannedMigrationPrompts = plannedMigrationPrompts;
exports.migrationReviewPrompts = migrationReviewPrompts;
exports.keywordTemplate = keywordTemplate;
const util_1 = require("./util");

function auditPrompts(settings, playerText, assistantText, optionsOrLegacyCard = {}, legacyOptions = {}) {
    // 兼容旧调用签名，但审核不再读取角色卡。第四个参数为对象时直接作为 options；
    // 旧代码即使仍传入角色卡字符串，也会被明确忽略。
    const options = optionsOrLegacyCard && typeof optionsOrLegacyCard === 'object' && !Array.isArray(optionsOrLegacyCard)
        ? optionsOrLegacyCard
        : legacyOptions;
    const compact = options.compact === true;
    const dialogueContext = clipText(String(options.dialogueContext || '').trim(), compact ? 2600 : 5200);
    const system = `你是 Mirror Abyss 基础正文审核器。

只依据玩家填写的审核规则和提供的对话上下文，检查本轮AI最终回复。
不要读取、补全或假设角色卡、世界书、隐藏设定和未提供的信息。
你不是作者，不得改写、续写、补充背景、优化文风或扩大审核范围。

输出协议：
- 通过：只能输出 PASS。
- 不通过：第一行输出 FAIL，随后用简短条目指出明确触发的规则。
- 禁止输出修正版正文。`;
    const user = `玩家填写的审核规则：
${clipText(settings.auditPrompt || '（无）', compact ? 2600 : 5200)}

最近完整对话（仅用于理解指代与承接；不得重新审核旧消息）：
${dialogueContext || '（无）'}

本轮玩家输入：
${clipText(playerText || '（空）', compact ? 1800 : 3000)}

需要审核的本轮AI最终回复：
${clipText(assistantText, compact ? 10000 : 14000)}`;
    return { system, user };
}

function revisionPrompts(settings, playerText, assistantText, issues, options = {}) {
    const compact = options.compact === true;
    const dialogueContext = clipText(String(options.dialogueContext || '').trim(), compact ? 1800 : 3600);
    const issueLimit = compact ? 5 : 10;
    const issueChars = compact ? 160 : 260;
    const system = `你是 Mirror Abyss 正文修正脚本。

只修正审核指出的明确违规部分，保留原剧情方向、事件结果、人物关系、角色身份、叙事视角和合规内容。
禁止添加新事件、删除已有事件、改变人物目标、修改世界规则、替玩家决定行动、续写或输出解释。
你的输出只能是可直接替换原消息的完整正文。

用户附加修正规则：
${clipText(settings.revisionPrompt || '（无）', compact ? 1500 : 3000)}`;
    const user = `违规原因：
${issues.slice(0, issueLimit).map((item) => `- ${clipText(item, issueChars)}`).join('\n')}

最近完整对话（只用于保持承接与角色知识，不得改写旧消息）：
${dialogueContext || '（无）'}

本轮玩家输入：
${clipText(playerText || '（空）', compact ? 1600 : 3000)}

需要替换的本轮AI完整回复：
${clipText(assistantText, compact ? 15000 : 20000)}`;
    return { system, user };
}

function extractionPrompts(settings, playerText, assistantText, relevant, options = {}) {
    const compact = options.compact === true;
    const dialogueContext = clipText(String(options.dialogueContext || '').trim(), compact ? 2200 : 4600);
    const contextEntries = promptContextEntries(relevant, compact ? 3 : 5);
    const existing = contextEntries.map((entry) => entryForPrompt(entry, compact ? 420 : 650)).join('\n\n');
    const custom = clipText(settings.extractionPrompt.trim(), compact ? 800 : 1600);
    const system = `你是 Mirror Abyss 严格语法事实提取器。

任务：以一轮完整对话为单位，把审核后的本轮AI最终回复转为精简世界书更新。最近对话只用于理解指代、承接、身份与因果；只提取本轮已经发生的状态变化、稳定结果和必要因果证据，不重抄旧轮内容。普通动作、短暂姿态和没有改变状态的细节优先过滤；不续写、不解释、不评价、不预测。

【只允许六类】
1. 人物：身份、稳定能力、性格核心、表达方式、决策倾向、当前状态、关系与关系立场、关键持有物、具有信息来源的已知、极少量已被明确证伪但人物仍相信的误信、固定事实。
2. 场景：同一稳定地点持续更新同一条目；保存稳定空间知识、当前局部条件和关联名称。
3. 物品：只记录一个可单独追踪的具体物品实例；同类物品集合、批量物资和泛称只写入场景资源。
4. 事件：由同一组参与者、场景和直接因果连续形成的状态变化。普通移动、开门、落座、视线、表情和没有形成变化的对话不得独立建事件。
5. 世界：会随剧情变化、但影响范围超出单一人物或单一场景的全局状态；包括区域、组织、权力、制度、资源网络和公开局势。
6. 基础设定：跨场景成立且不随普通剧情变化的世界框架、自然规则、种族共性、能力技术、社会常识和地理框架。

关系不得单独建条目，写入对应人物的【关系】。
地点不得单独建条目，写入对应【场景】。
组织、制度、政权、战争、区域关系、资源网络和公开局势只要明确会影响场景外对象或后续多个地点，就写入【世界】；不要求本轮已经跨越多个场景。
不随普通剧情变化的自然规律、种族共性、能力体系、技术边界、社会常识和地理框架写入【基础设定】。

【事实分流】
- 已经成立且宿主明确的事实，直接写人物、场景、物品、世界或基础设定。
- 每轮都检查是否出现新的全局状态或世界设定；事实明确时主动创建或更新，不得等待小总结或大总结。
- 事件只保存对状态变化有解释力的因果；人物伤势、物品位置、场景损坏和世界变化应直接进入各自宿主，事件只保留最短变化链，不得复制同一句长叙述。
- 同一批次中，只要参与者、场景和直接因果连续，就属于同一个事件；动作变化、地点内移动、叙述段落变化和标题措辞变化不得拆成新事件条目。
- 若“可能相关的既有世界书条目”中已有同一变化链，必须复用其稳定标题；只有参与者、状态变化对象或直接因果明显独立时才建立新事件。
- 场景不保存事件流水。场景稳定知识持续补全；当前栏目必须给出正文结束时的完整快照。
- 单轮最多输出一个场景条目，并把它放在第一条；它必须是正文结束时人物实际所在的当前场景。只被提及但未进入的地点不得另建场景条目。
- 同一事实只能有一个权威宿主。其他条目只保留最短引用或该事实对自身形成的独立结果，禁止换角度重复叙述。
- 物品的所有权、保管者、当前持有者、当前使用者、使用权限和当前位置是不同关系，不得互相替代。公共物品被某人临时使用，不等于归该人物所有或长期持有。

【身份未明人物】
- 正文没有明确说明陌生人、匿名账号、蒙面者或未知声音是谁时，不得猜成任何已知人物。
- 只有该对象已经产生会持续影响后续的状态、关系、持有物或行动结果时，才建立人物临时档。
- 稳定名称使用“身份未明的可观察类型（唯一可观察锚点）”；例如“身份未明的女人（银色耳坠）”或“身份未明的账号（夜航）”。没有唯一锚点时使用正文中的稳定称呼，但不得添加真实身份。
- 关键词必须包含“身份未明”；相同对象后续继续使用既有临时档标题。存在两个无法区分的陌生对象时分别建档，不得强行合并。
- 后续正文明确揭示身份后，输出已知人物主档；插件会把对应临时档合并并删除。
- 同名或近似名称不是同一身份的证明。两个对象的职业、组织、编号、种族、来源或括号区分锚点冲突时，必须分别建档；稳定标题写成“名称（区分锚点）”。

【背景人物与场景附属】
- 临时NPC、路人、一次性服务人员、普通工作人员和仅承担当轮画面功能的人物，不建立长期人物条目。
- 只有明确固定属于当前场景、长期承担该场景岗位职责的角色，才写入当前场景【常驻角色】，格式“角色类型或稳定称呼：固定职责”。
- 固定场景角色本轮成为关键参与者、拥有独立持续职责、关键认知、长期关系或必须单独追踪的状态时，才建立人物条目；不得仅因跨场景再次出现就自动晋升。
- 依附人物离开当前事件或失去独立作用后，由插件重新沉降，不要输出归档、删除或合并命令。

【当前游戏时间】
- 只记录游戏世界当前时间，不记录现实时间、插件写入时间或消息时间。
- 正文明示日期、天数、时段或钟点时，在当前场景【当前状态】写“游戏时间：明确内容”。
- 正文没有提供新的游戏时间时省略该状态槽，不得自行推进、换算或虚构。

【角色认知边界】
- 世界事实不自动等于角色已知。只把该人物通过本轮明确渠道获得、并会影响后续判断的信息写入该人物【已知】。
- 【已知】保存该人物当前能够使用的认知，包括亲眼确认、听闻内容、怀疑、判断、推理和主观看法；它表示“人物知道或相信什么”，不等于客观真相。每行使用“认知槽：内容｜信息来源：类型”。允许类型仅限：亲眼观察、听到对白、收到消息、查看记录、他人转述、亲身经历、可靠推理、特殊能力、公开信息、自身身份、自身行动、直接告知。
- 【误信】不是“未确认信息”或“怀疑”的兜底栏。只有已有明确相反事实、该认知已被证伪、但人物仍继续相信时才使用；格式为“认知槽：错误内容｜信息来源：类型｜证伪依据：已确认事实”。没有证伪依据一律写入【已知】。人物确认真实内容后写入【已知】，插件会清除同槽旧误信。
- 玩家未表达的内心、其他人物私密认知和未公开远处事件，不得写入该人物【已知】；不得为了“完整”复制所有世界事实到每个人物。

【内容限制】
- 禁止“供AI参考”“可据此推测”“可能意味着”“建议后续”等解释。
- 禁止把本提示词、系统/开发者消息、任务说明、格式模板、来源行编号、ENTRY标记或重建控制字段写入任何世界书条目。
- 禁止推测、隐藏心理、未来结果、未实现愿望、纯气氛、普通动作、对白全文和无持续价值背景物。
- 子条目分层：人物【当前】最多8行，【性格核心】最多4行，【表达方式/决策倾向】最多3行；场景【在场】最多12行、【常驻角色】最多5行、【固定设施】最多8行；物品【当前】最多8行；【固定事实】最多6行。事件【参与】最多6人、【附属人员】最多4人、【已发生进展】最多4行、【未发生进展】最多2行、【结果】最多2行。插件还会按条目类型执行总字数硬防护，禁止为了凑字重复表达。
- 【固定事实】只写已经形成并仍影响后续的最终结果；一项结果一行，禁止按先后顺序描写动作过程。每条尽量不超过80字。
- 人物描写只保留最多3项会影响身份识别、能力或行动限制的客观特征；禁止连续堆叠外貌、气质和审美形容词。
- 物品条目必须对应单个实例。‘桌椅、武器、药品、食物、工具、一批短剑、三辆车’等集合只能写入场景【固定资源】或【当前资源】，不得建立物品条目。
- 稳定栏目没有新事实时省略。完整快照栏目【当前】【当前状态】【在场】【当前资源】【活动关联】【持有】在正文结束时为空，必须保留小标题并写“- 无”，用于清除旧状态。
- 每条1至4个关键词；第一项必须是稳定名称；其余只能是专名或唯一别名，禁止“人物、角色、场景、事件、物品、世界、当前、活动”等泛词。
- 单次最多8条；其中场景最多1条。同一轮同一因果链最多建立或更新一个事件条目。

【输出密度】
- 每个事实必须是一条可独立成立的短句；同义、包含式和过程复述只保留信息密度最高的一条。
- 人物候选优先控制在约300至520个中文字符以内；场景约260至520；事件约180至360；物品约140至260。信息不足时允许更短，不得补写虚构内容。
- 超出范围时先删除普通过程、重复说明和无持续价值背景；不得牺牲人物性格、表达方式、决策倾向和当前状态。

【唯一允许的外层语法】
<<<ENTRY:类型:稳定名称>>>
<<<KEYWORDS>>>
- 稳定名称
- 唯一别名
<<<CONTENT>>>
固定小标题正文
<<<END_ENTRY>>>

多个条目连续输出，条目间只空一行。禁止JSON、代码块、序号、解释、前言、后记和标记外文本。没有可记录事实时只输出“无”。

【人物正文固定顺序】
【身份】职业、种族、组织或家庭身份
【稳定】稳定能力、持续限制，以及最多3项会影响识别或剧情判断的客观特征；不写审美评价和形容词堆砌
【性格核心】已经明确设定或经多次稳定表现确认的人格原则；单次情绪和例外行为不得写入
【表达方式】稳定的语言、情绪表达和沟通方式
【决策倾向】面对风险、冲突、关系和资源时反复成立的选择偏好
【当前】位置、身体、目标、情绪和当轮立场等明确状态槽
【关系】对方名称：客观长期关系
【关系立场】对方名称：该人物当前持续成立的态度与互动边界
【持有】当前关键物品完整列表
【已知】该人物当前能够使用的认知，包括怀疑、判断和推理；格式“认知槽：内容｜信息来源：允许类型”
【误信】仅保存已有明确证伪依据、但人物仍相信的错误认知；格式“认知槽：错误内容｜信息来源：允许类型｜证伪依据：已确认事实”
【固定事实】已经形成并仍影响后续的个人结果，一项结果一行，不写过程
【别名】

【场景正文固定顺序】
【定义】地点是什么、位置、用途或归属
【空间结构】入口、出口、区域连接、障碍和影响行动的布局
【固定资源】长期存在且可利用的资源
【固定设施】固定属于本场景并影响行动的设施，最多8项
【常驻角色】固定属于本场景并长期承担岗位职责的角色类型或稳定称呼，最多5项；临时NPC不得写入
【固定事实】已确认的新发现、永久损坏、控制权或访问条件变化，一项结果一行
【当前状态】时间、环境、控制、危险等状态槽
【在场】正文结束时确认在场的人物完整列表
【当前资源】正文结束时可使用、争夺或影响结果的关键物品完整列表
【活动关联】仍在本场运行的事件名称完整列表
【世界影响】最多一句过去时结果，概括直接作用于本场的世界整体变化
【局部约束】模型不能忽略的可见限制完整列表
【别名】

【物品建立条件】
只为一个可单独追踪的具体实例建立条目：有稳定专名或唯一编号，存在独特功能、独立状态变化，或确实需要跨场景持续追踪。仅有明确所有者、临时持有者或普通位置不足以单独建档。
人物普通随身物、证件、服装和一般工具可写入人物【持有】；公共物品、固定设施和同类集合写入场景【固定资源】或【当前资源】；组织跨场景资源写入【世界】。
公共物品归还后不得继续写入人物【持有】；正文结束时无人持有应写“当前持有者：无”。

【物品正文固定顺序】
【定义】该单个实例的稳定身份和必要识别特征
【功能】已确认用途或能力
【当前】当前位置、所有权、保管者、当前持有者、当前使用者、使用权限、状态、完整性等独立状态槽；单体物品不写大于1的数量
【限制】使用、访问或能力限制
【固定事实】会影响后续的最终变化，一项结果一行
【别名】

【事件正文固定顺序】
【参与】直接推动当前事件的参与者完整列表，最多6人
【附属人员】只承担当前事件辅助作用、无需独立人物条目的人员，最多4人
【场景】事件涉及的稳定场景名称；门口、床边、桌旁、走廊拐角等局部位置不得独立建场景
【已发生进展】已经造成状态、关系、控制、资源、能力或因果变化的事实；使用过去时，最多4行；被更完整结果覆盖的动作不得单独保留
【未发生进展】已经发生但没有造成状态变化、且仍有必要解释当前连续性的过程材料；不是未来事项、目标或计划，最多2行；普通动作直接省略
【结果】已经形成的稳定结果，最多2行；没有明确结果时省略
【别名】

【世界正文固定顺序】
【范围】该条目覆盖的区域、组织、群体、网络或全局问题
【地理】跨场景区域关系、边界、通路和公开地理条件
【组织】组织性质、职能、成员结构、公开关系与稳定存在状态
【权力】地区、组织或群体的控制格局；使用“对象：当前控制或地位”
【制度】正在跨场景执行的法律、政策、程序与公开规则；使用“制度名：现行内容”
【资源与交通】跨场景资源供应、贸易、通信、交通与封锁网络；使用“对象：当前状态”
【公开局势】公众可知的战争、灾害、经济、外交、治安与社会整体状态；使用“对象：当前状态”
【固定事实】重大且持续的整体变化，一项结果一行
【持续影响】最多4行，格式为“明确对象或区域：已形成的持续影响”
【别名】

【基础设定正文固定顺序】
【世界常识】世界内普遍成立、角色通常可以知道的稳定常识
【自然规则】物理、超自然、时间、空间、因果和不可违背的运行规则
【种族与生命】种族共性、生理、寿命、繁衍、弱点和生命形态规则
【能力与技术】魔法、能力、科技、制作、使用条件与能力上限
【社会规则】长期文化、身份制度、货币、教育、婚姻、礼法和通行惯例
【地理框架】跨场景稳定存在的区域层级、方位、连接与环境框架
【别名】

人物【当前】、人物【关系】、物品【当前】、场景【当前状态】以及世界【权力/制度/资源与交通/公开局势/持续影响】必须使用“状态槽：内容”形式。${custom ? `

用户附加要求：
${custom}` : ''}`;
    const user = `最近完整对话（只用于解析指代、承接与因果；禁止从旧轮重复提取）：
${dialogueContext || '（无）'}

本轮玩家输入：
${clipText(playerText || '（空）', compact ? 1300 : 2200)}

本轮AI最终回复（唯一提取目标；无论包含多少段正文都视为同一完整回复）：
${clipText(assistantText, compact ? 9000 : 13000)}

可能相关的既有世界书条目：
${existing || '（无）'}

只输出本轮新事实或需要替换的完整当前快照。若正文明确存在当前场景，场景条目必须排在第一条。稳定栏目只补充新发现或修正，不得重抄已有内容；固定事实只输出本轮新形成或被修正的最终结果，不重抄已有结果。必须主动检查并输出本轮明确出现的世界或基础设定事实。`;
    return { system, user };
}


function extractionDeltaPrompts(settings, assistantText, relevant, noChangeDetails = [], options = {}) {
    const compact = options.compact !== false;
    const base = extractionPrompts(settings, '', assistantText, relevant, { compact, dialogueContext: '' });
    const rejected = (noChangeDetails ?? []).slice(0, 16).map((item) => {
        const section = String(item?.section || '').trim();
        const reason = String(item?.reason || '').trim();
        return `- ${String(item?.title || '候选')}${section ? `【${section}】` : ''}${reason ? `：${reason}` : ''}`;
    }).join('\n');
    return {
        system: `${base.system}\n\n【零写入差量复核】\n上一次提取已经成功解析，但本地确定性规划确认所有候选都与世界书相同或没有形成状态变化。现在只重新检查“本轮AI最终回复”本身，寻找上一次遗漏的新增状态、替换后的完整当前快照、稳定结果或必要因果。\n- 玩家输入中的世界基础设定已经由独立设定初始化链处理，禁止再次提取、改写或复制。\n- 不得仅换一种说法重抄既有条目。\n- 普通动作、短暂姿态、气氛与没有造成状态变化的对白仍然过滤。\n- 确实没有新增事实时只能输出“无”。`,
        user: `${base.user}\n\n上一次被本地规划为零写入的候选：\n${rejected || '（没有可展示的候选原因）'}\n\n只依据本轮AI最终回复做一次差量复核。`,
    };
}

function worldSettingImportPrompts(settings, sourceText, relevant, options = {}) {
    const compact = options.compact === true;
    const contextEntries = promptContextEntries(relevant, compact ? 4 : 8);
    const existing = contextEntries.map((entry) => entryForPrompt(entry, compact ? 360 : 620)).join('\n\n');
    const schema = keywordTemplate(settings.keywordDefinitions ?? []).trim();
    const system = `你是 Mirror Abyss 玩家设定初始化器。

玩家已经明确点击“导入世界设定”。只把玩家粘贴的设定文档结构化为世界书候选，不处理普通聊天，不把玩家的愿望误当成剧情行动。

允许类型：基础设定、世界、场景、人物、物品、事件。

分流规则：
1. 跨场景稳定成立的自然规律、种族共性、能力技术、社会常识、长期地理框架写入【基础设定】。
2. 初始地区、组织、制度、权力、资源网络和公开局势写入【世界】。
3. 只有设定明确指定的一个实际开局地点写入【场景】；其他地点写入世界或基础设定，不批量建立场景。
4. 只为已有稳定身份、专名或唯一锚点且会持续存在的对象建立【人物】。
5. 只为需要跨场景单独追踪的唯一物品实例建立【物品】；普通装备、批量物资和泛称写入人物持有或场景/世界资源。
6. 只有文档明确说明“已经发生”或“正在发生”的过程才能建立【事件】。计划、可能、将来、希望发生、开局后再发生的内容不得建立事件。
7. 写作要求、文风、视角、输出格式、角色扮演规则、AI/玩家指令、系统提示、审核规则、提示词边界不得进入世界书。
8. 不补全未写出的设定，不创造人物、组织、地点、事件或因果。
9. 与既有条目属于同一稳定对象时复用原题，不因措辞变化重复建档。
10. 同一事实只放在一个权威宿主；禁止把整份设定复制到多个条目。

输出协议：
<<<ENTRY:类型:稳定名称>>>
<<<KEYWORDS>>>
- 稳定名称
- 唯一别名
<<<CONTENT>>>
【小标题】
- 完整事实
<<<END_ENTRY>>>

多个条目连续输出。禁止JSON、代码块、序号、解释、前言、后记和标记外文本。没有可导入事实时只输出“无”。单次最多16条。

可用类型与栏目：
${schema || '使用基础设定、世界、场景、人物、物品、事件的标准栏目。'}`;
    const sourceLimit = 24000;
    const user = `玩家主动提交的世界设定文档（唯一事实来源）：
${clipText(sourceText, sourceLimit)}

可能相关的既有世界书条目（只用于复用稳定对象和避免重复）：
${existing || '（无）'}

请生成可供玩家预览的设定条目。不要把写作要求或未来计划写成世界事实。`;
    return { system, user };
}

function summaryPrompts(kind, settings, entries, subject, recentConversation = '', options = {}) {
    const isSmall = kind === 'small';
    const compact = options.compact === true;
    const custom = clipText((isSmall ? settings.smallSummaryPrompt : settings.largeSummaryPrompt).trim(), compact ? 900 : 1800);
    const system = isSmall
        ? `你是 Mirror Abyss 当前事件压缩器。

你的任务不是续写、安排剧情或判断未来，而是把已经发生的同一变化链压缩，并把稳定影响分发回权威宿主。

判断标准：
1. 【已发生进展】只保留已经造成状态、关系、控制、资源、能力或直接因果变化的事实。
2. 【未发生进展】只表示“已经发生但没有造成状态变化”的必要过程材料；它不是未完成目标、待办、未决事项或未来计划。
3. 普通移动、开门、落座、视线、表情、寒暄、重复确认和当轮立即恢复的轻微状态直接过滤。
4. 小动作若是后续结果不可缺少的直接因果证据，可以吸收到一条进展中，但不得独立保存。
5. 同一参与者、稳定场景和直接因果连续的内容必须合并；不得按动作、段落或地点局部区域拆成多个事件。
6. 已有活动事件的进展必须压缩覆盖旧进展，不得把旧过程重新抄一遍后继续追加；已经有明确【结果】的完成事件不得重新写入活动进展或重新打开。
7. 不得输出“下一步、仍需、等待、是否、可能、计划、目标、未决”等未来导向内容。
8. 不得输出 UID、删除、归档、退出或操作命令。

严格输出：
总结｜当前事件

【已发生进展】
- 最多4条压缩后的状态变化

【未发生进展】
- 最多2条尚未被吸收、但对当前连续性仍必要的已发生材料；没有则写“- 无”

【稳定影响】
- 已经持续成立并需要写回人物、场景、物品、世界或基础设定的结果；没有则写“- 无”

【分发事实】
- 类型｜稳定名称｜小标题｜完整事实句

分发规则：
- 只允许把压缩后的活动事件完整快照写回对应事件：事件｜稳定名称｜已发生进展｜完整压缩事实。已完成事件不得重新写入进展。
- 若存在必要的未发生进展，写：事件｜稳定名称｜未发生进展｜完整事实；若当前没有必要材料，仍写：事件｜稳定名称｜未发生进展｜无，用于覆盖旧的暂存过程。
- 稳定影响写回人物、场景、物品、世界或基础设定的权威栏目。
- 同一事实只分发一次，不得同时保留长事件叙述和对象固定事实的同义复述。
- 没有分发事实时写“- 无”。

没有可压缩内容时只输出“无”。${custom ? `\n\n用户附加要求：\n${custom}` : ''}`
        : `你是 Mirror Abyss 长期历史沉降器。

你的输入只能视为已经压缩过的历史材料。你的任务是用更短的长期结果覆盖旧世界历史，并把尚未写入权威宿主的稳定影响分发出去。

只保留：
- 已经形成并持续成立的人物变化、长期关系和身份结果；
- 已经形成明确结果且具有长期检索价值的重要事件；
- 已经改变场景、物品、组织、制度、权力、资源网络或世界规则的稳定结果。

必须过滤：
- 【未发生进展】中的全部材料；
- 普通动作、过程流水、场景内移动、普通对话和短暂情绪；
- 未来目标、未决事项、推测和计划；
- 已经被更高密度结果完整覆盖的旧叙述；
- 已经在当前“总结｜世界历史”中以同义表达存在的内容。

严格输出：
总结｜世界历史

【长期变化】
- 人物、场景、物品或世界已经形成的长期变化

【重要事件结果】
- 只写形成明确结果且值得长期召回的事件；不写过程

【长期关系】
- 已经成立并持续影响后续的关系变化

【稳定世界影响】
- 组织、制度、权力、资源网络、公开局势或基础规则的稳定变化

【分发事实】
- 类型｜稳定名称｜小标题｜完整事实句

分发规则：
- 只分发稳定结果，不分发过程。
- 已经存在于权威宿主的同义事实不得再次分发。
- 若事件已经形成结果，可写回事件【结果】和一条压缩后的【已发生进展】；不得分发【未发生进展】。
- 不得输出 UID、删除、归档、退出或操作命令。
- 没有分发事实时写“- 无”。

本次输出必须覆盖旧“总结｜世界历史”的对应栏目，不得追加一套重复历史。没有新的长期结果时只输出“无”。${custom ? `\n\n用户附加要求：\n${custom}` : ''}`;
    const recent = isSmall ? `\n\n最近聊天（只用于确认本轮已经发生的变化，不得提取未来）：\n${clipText(recentConversation || '（无）', compact ? 7000 : 11000)}` : '';
    const user = `处理范围：
${subject || (isSmall ? '当前事件压缩' : '长期历史沉降')}${recent}

相关世界书：
${entries.slice(0, compact ? (isSmall ? 8 : 14) : (isSmall ? 16 : 30)).map((entry) => entryForPrompt(entry, compact ? 500 : 820)).join('\n\n') || '（无）'}`;
    return { system, user };
}

function extractionRepairPrompts(raw, options = {}) {
    const compact = options.compact === true;
    const system = `你是 Mirror Abyss 提取格式修复器。
只修复给定提取结果的语法、重复条目和事实归属，不得阅读原剧情，不得新增、扩写或推测事实。
必须使用 <<<ENTRY:类型:稳定名称>>>、<<<KEYWORDS>>>、<<<CONTENT>>>、<<<END_ENTRY>>>。
允许类型：人物、场景、物品、事件、世界、基础设定。关系必须并入人物，地点必须并入场景；可变化的全局状态写入世界，不随普通剧情变化的框架写入基础设定。
同名条目必须合并；同一事实只能保留在责任最直接的一个条目中；无法修复的片段删除。
禁止解释、JSON和代码块。没有可保留条目时只输出“无”。`;
    const user = `需要修复的提取结果：
${clipText(String(raw ?? ''), compact ? 8000 : 12000)}`;
    return { system, user };
}

function duplicatePrompts(pairs) {
    const system = `你是 Mirror Abyss 重复事实判断器。

判断每一组事实是否表达同一件事。
否定、失去、不再、身份改变、关系改变、位置改变、数值升降和状态变化必须判为 DIFFERENT。

只按以下格式逐行返回：
序号|SAME
或
序号|DIFFERENT

禁止输出解释、JSON、代码块或其他内容。`;
    const user = pairs.map((pair, index) => `${index + 1}
事实A：${pair.oldValue}
事实B：${pair.newValue}`).join('\n\n');
    return { system, user };
}

function migrationPrompts(records, catalog, options = {}) {
    const batchIndex = Math.max(1, Number(options.batchIndex || 1));
    const batchCount = Math.max(1, Number(options.batchCount || 1));
    const totalRecords = Math.max(0, Number(options.totalRecords || records.length || 0));
    const catalogBudget = Math.max(800, Number(options.catalogBudget || 1800));
    const phase = String(options.phase || 'entity');
    const clusterId = String(options.clusterId || '');
    const stableName = String(options.stableName || '');
    const priorContext = String(options.priorContext || '').trim();
    const preferredType = String(records?.outputType || '').trim();
    const schema = options.schema;
    const typeCatalog = migrationTypeCatalog(schema);
    const preferred = preferredType ? `\n本批旧条目当前归类为“${preferredType}”，这只是优先参考，不是必须沿用；若其他已有类型更准确，应直接归入该已有类型。` : '';
    const phaseInstructions = ({
        entity: `【本轮：对象重建】\n当前请求可包含一个或多个完整语义簇；同一 cluster 是同一候选对象，不同 cluster 不得仅因同批出现而合并。本轮主要处理人物、场景、物品、世界对象和已有自定义类型。`,
        event: `【本轮：事件重建】\n按完整因果链收束同一事件。标题不同但参与者、稳定场景、状态变化和结果属于同一件事时，应合并成一个条目。只保留【参与】【场景】【已发生进展】【未发生进展】【结果】【别名】；普通动作过滤，旧目标、未决、计划和阶段标签不得写入新条目。`,
        custom: `【本轮：通用条目重建】${preferred}\n先判断能否归入现有类型。不要因为旧标题使用某个类型就机械沿用，也不要创建该类型的近义词。`,
        organization: `【本轮：通用条目重建】${preferred}\n组织只是可能的现有或自定义类型之一；先匹配现有类型，不得把其他内容强行改成组织。`,
        world: `【本轮：世界全局收束】\n本轮统一处理现有世界条目中的地区、组织、权力、制度、资源交通和公开局势，并纠正被误放进世界条目的具体人物、场景、物品或基础规则。不要按同一事实的不同观察角度重复建档；优先归入已有类型和稳定专名，只有确实无法归类时才提出新类型；禁止用“世界”“世界状态”“全局”“公开局势”等泛化词作为唯一标题。`,
        region: `【本轮：地区规则】\n把地区证据归入现有“世界”类型，提炼该地区特有的地理、制度、资源交通、公开局势和持续影响。`,
        foundation: `【本轮：世界基础设定】\n把跨地区、跨组织长期成立的规则归入现有“基础设定”类型。局部制度和单次事件不得升级为基础规则。`,
    })[phase] || '';
    const allowProposal = !['event', 'region', 'foundation'].includes(phase);
    const system = `你是 Mirror Abyss 世界书重建规划模型。\n\n${phaseInstructions}

【现有类型】
${typeCatalog}

【分类原则】
1. 每个新条目先从上面的现有类型中选择一个最合适的“归入类型”。
2. 人物、角色、NPC、人物档案属于同一类型；地点、地区、区域属于同一类型；道具、装备、物件属于同一类型；任务与持续事件属于事件。禁止创建这些近义重复类型。
3. ${allowProposal ? '只有所有现有类型都无法合理容纳，而且该类别可以反复用于多个对象时，才写“归入类型：新类型建议”，并填写简短的“建议类型”和“与现有类型区别”。' : '本轮禁止提出新类型，必须归入本轮指定的现有类型。'}
4. 类型是稳定类别，不是具体条目名称。不得把“月誓”“人鱼村”“北境议会”这类专名当成类型。
5. 只写材料中明确存在的内容；没有内容的部分不要输出，不要为了填格式而补全。
6. 【内容】中的每行使用“栏目：事实”，栏目名称应简短、通用；同一含义不要建立多个相似栏目。
7. 当前已经成立的事实写在【内容】；已经发生的经过和结果写在【过去结果】，使用过去时。事件条目禁止输出目标、未决、计划、下一步、阶段标签或尚未发生的内容；事件过程应压缩为已发生的状态变化，普通动作不得独立保留。
8. 角色只能知道自己通过信息来源获得的内容。人物条目的【角色认知】必须写“人物｜知道/误以为/怀疑：内容｜来源：获得方式”。
9. “合并来源”必须填写该新条目使用的全部旧UID，它同时作为整个条目的默认证据。
10. 某一行只使用部分来源或需要特别说明时，才在行末补充〔证据:UID〕；不必在每一行机械重复全部UID。没有合并来源且没有行内证据的内容会被插件丢弃。
11. 同一对象存在不同解释时，区分世界事实、人物已知、人物误信和不同时间，不得按最后一条或多数表述强行覆盖。
12. 真身、本体、假身、分身、替身、伪装体、复制体、投影体和被冒充者是不同对象形态；“A伪装成B”不能据此把A与B合并。只有正文明确说明两个称呼只是同一对象的名称或真实身份，且不存在独立身体时，才可合并。
13. 重建的目标是收束，不是逐条翻写。描述同一件事的同类型来源必须生成一个条目；只承担某条规则、制度、地区设定或其他主体功能的从属对象，不应保留独立条目。
14. 同一事实只能保留一个权威宿主；标题、栏目名和事实正文不得只是同义重复。不要输出“世界｜世界”“公开局势：公开局势”这类空壳内容。
15. 若某对象仍需独立检索，填写“保留方式：独立条目”；若它只是其他条目的附属说明，填写“保留方式：并入其他条目”，并给出“并入条目”和“并入栏目”。
16. 场景条目只代表一个稳定地点；若旧条目混入决斗台、酒馆、遗迹入口等不同地点，必须拆成不同场景。别名只能是同一地点的称呼，不能把其他地点名称当别名。
17. 不输出空栏目，不写“无”，不解释处理过程。

【唯一输出格式】
【新条目】
名称：稳定名称
归入类型：从现有类型中填写一个
别名：仅在有证据时填写
合并来源：旧UID1、旧UID2
保留方式：独立条目

【内容】
- 栏目：明确事实

【角色认知】
- 人物名称｜知道：内容｜来源：亲眼观察/听到对白/收到消息/查看记录/他人转述/亲身经历/可靠推理/特殊能力/公开信息/自身身份/自身行动/直接告知
- 人物名称｜误以为：内容｜来源：信息来源

【过去结果】
- 已经发生并结束的结果

【关键词】
- 稳定名称或别名

从属内容改用以下头部，不再单独保留：
保留方式：并入其他条目
并入条目：类型｜稳定名称
并入栏目：目标条目的栏目名称

没有内容的区块直接省略。多个条目重复以上格式。${allowProposal ? `确实无法归入现有类型时，将头部改为：
归入类型：新类型建议
建议类型：稳定类别名称
与现有类型区别：一句话说明为什么现有类型不能容纳` : ''}

禁止JSON、代码块、前言、后记和思考过程。没有可重建内容时只输出“无”。`;
    const body = records.map((record) => {
        const part = Number(record.fragmentCount || 0) > 1 ? ` part=${record.fragmentIndex}/${record.fragmentCount}` : '';
        const recordCluster = record.semanticClusterId ? ` cluster=${record.semanticClusterId}` : clusterId ? ` cluster=${clusterId}` : '';
        const clusterName = record.semanticClusterName ? `\n对象簇：${record.semanticClusterName}` : '';
        return `<<<SOURCE uid=${record.uid}${part}${recordCluster}>>>\n标题：${record.title}${clusterName}\n关键词：${record.keywords.join('、') || '无'}\n正文：\n${record.content || '（空）'}\n<<<END_SOURCE>>>`;
    }).join('\n\n');
    const prior = priorContext ? `\n\n前序轮候选（只用于名称、关系和层级对齐，不能代替本批UID证据）：\n${clipText(priorContext, 2600)}` : '';
    const user = `这是世界书重建第 ${batchIndex}/${batchCount} 个串行任务；当前阶段：${phase}；语义簇：${clusterId || '未标记'}；建议稳定名称：${stableName || '由证据确定'}；整本旧表共有${totalRecords}个镜渊条目。\n\n旧条目目录（仅用于稳定命名和避免重复类型，不能作为事实证据）：\n${clipText(catalog, catalogBudget)}${prior}\n\n本批原始条目：\n${clipText(body, 7600)}\n\n按通用“新条目”格式输出。先决定最终语义归属：同一件事只建立一个条目，从属内容并入其真正所属的规则、地区、事件或对象；再选择现有类型，确实无法容纳时才提出不重叠的新类型建议。`;
    return { system, user };
}

// [MA-REBUILD-11] 第一阶段只规划归属，不改写正文。索引中的每个来源行必须只出现一次：
// 归入一个候选组，或明确丢弃。这样后续模型请求不会重复解释同一条旧事实。
function migrationPlanningPrompts(sourceIndex, options = {}) {
    const schema = options.schema;
    const typeCatalog = migrationTypeCatalog(schema);
    const system = `你是 Mirror Abyss 世界书重建规划器。

你只规划旧世界书来源行的最终归属，不重写事实，不生成世界书正文。

【现有类型】
${typeCatalog}

【规划规则】
1. 每个来源行引用只能出现一次：归入一个 GROUP，或进入 DROP。禁止把同一来源行投影到人物、事件、世界等多个组。
2. 先为全部来源行建立最小场景锚点。一个锚点表示同一段连续世界时间与同一稳定地点；相同地点在不同日期、时段或事件阶段必须拆成不同锚点。索引中的“已有时空”是上次重建元数据：没有更强的新证据时优先沿用，但不要把它重复写成剧情事实。
3. 游戏时间只使用材料明确给出的日期、时段、相对时间或可由前后文可靠推定的时间。不得为了完整而虚构日期；无法判断时填写“未知”。
4. 时间来源只允许“明确、推定、未知”。明确是正文直接给出；推定是由“次日、当晚、三天后”等关系确定；没有依据时为未知。
5. 同一稳定对象的来源行归入同一组；不同对象不得因名称相似、同批出现或共享地点而合并。
6. 真身、本体、假身、替身、分身、复制体、投影体、载体是不同身份形态。只有材料明确说明两个称呼是同一独立身体的名称时才合并。
7. 一个事件组对应一条连续的状态变化链。参与者、稳定场景和直接因果连续时，即使动作、段落、标题或地点局部位置变化，也应归入同组；只有变化对象或直接因果明显独立时才分组。普通移动、开门、落座、视线、表情和寒暄不得单独形成事件组。
8. 场景组只对应一个稳定地点。酒馆、决斗台、遗迹入口等不同空间不得互为别名。
9. 世界组只保存跨场景的制度、组织格局、区域网络和公开局势；人物经历、单个物品状态、单场事件不得归入世界组。
10. 基础设定组只保存跨普通剧情长期成立的规则。单次行为不得升级为规则；只有明确约定、制度、条件约束，或多个不同场景反复证明的机制，才可归入规则宿主。
11. 普通随身消耗品、无独立状态的小道具可归入人物组；简单公共设施可归入场景组；唯一、关键、有功能限制或独立状态的物品保留物品组。
12. 标题相同但内容属于不同实体时必须分组并使用区分锚点，例如“绯（真身）”“绯（残留替身）”。
13. 无正文、纯格式残留、标题复述、同义重复、过程性复述和无长期价值的句子进入 DROP；同一事实只保留一份最小表达。

【唯一输出格式】
ANCHOR|锚点ID|游戏时间|地点|明确/推定/未知|来源行1,来源行2,...
GROUP|组ID|类型或新类型建议:类别名|稳定名称|独立/并入|来源行1,来源行2,...
DROP|简短原因|来源行1,来源行2,...

锚点ID使用 A1、A2……，ANCHOR行必须按游戏时间从早到晚排列；时间无法比较时按剧情叙述先后排列。组ID使用 G1、G2……。每个非DROP来源行必须同时出现在一个ANCHOR和一个GROUP中。优先使用现有类型。只有现有类型都无法容纳且该类别可反复用于多个对象时，才使用“新类型建议:类别名”。若“并入”，稳定名称填写真正宿主名称。
禁止解释、JSON、代码块、Markdown标题或其他文本。`;
    const user = `旧世界书精简来源索引：
${String(sourceIndex || '').trim() || '（空）'}

请覆盖索引中的全部来源行。每个来源行只能出现一次。`;
    return { system, user };
}

// [MA-REBUILD-11] 第二阶段按容量联合处理多个规划组。
// 每个组只携带自己的来源行，但同一次请求可以比较相邻候选，减少碎片化和调用次数。
function plannedMigrationPrompts(task, options = {}) {
    const schema = options.schema;
    const jointGroups = Array.isArray(task?.jointGroups) && task.jointGroups.length ? task.jointGroups : null;
    const groups = jointGroups ?? [{
        id: task?.planGroupId || 'G1',
        type: String(task?.outputType || '').trim(),
        name: String(task?.stableName || '').trim(),
        newTypeProposal: task?.newTypeProposal === true,
        sourceRefs: [...(task?.sourceRefs ?? [])],
        sceneAnchors: [...(task?.sceneAnchors ?? [])],
        anchorCatalog: [...(task?.anchorCatalog ?? [])],
        sourceLineBody: String(task?.sourceLineBody || '').trim(),
    }];
    const descriptors = groups.map((group) => {
        const allowed = [...(schema?.allowedSectionsByType?.[group.type] ?? [])].filter((section) => section && section !== '时空锚点');
        const anchorText = (group.anchorCatalog ?? []).map((anchor) => `${anchor.id}=${anchor.gameTime}@${anchor.location}[${anchor.timeSource}]`).join('、') || (group.sceneAnchors ?? []).join('、') || 'S000=未知@未知[未知]';
        return `- 组${group.id}｜类型：${group.newTypeProposal ? `新类型建议:${group.type}` : group.type}｜稳定名称：${group.name}｜允许栏目：${allowed.join('、') || '使用该类型现有栏目'}｜场景锚点：${anchorText}｜来源行：${group.sourceRefs.join('、')}`;
    }).join('\n');
    const system = `你是 Mirror Abyss 联合世界书重建器。

本次同时处理${groups.length}个已经完成全局规划的候选组：
${descriptors}

总规则：
1. 每个组只能使用该组列出的来源行；不得在组之间借用证据，不得引用常识或自行补全。
2. 每组最多输出一个最终条目。只有来源确实没有有效事实时可以省略该组。
3. 提炼不是改写旧句。先删除同义重复、包含式重复、过程性复述和低价值措辞，再只保留最小事实集、当前有效状态、完成结果与真正可运行的规则。
4. 场景只代表稳定地点。房门口、床边、桌旁、拐角、区域内移动等并入主体场景的【空间结构】或事件材料，不得单独建场景。
5. 同一地点的名称改写必须归入稳定名称，并把其他真实称呼写入【别名】；不得因模型改名制造新地点。
6. 每个条目必须选择本组已有的场景锚点，并填写游戏时间、时间来源和时态。禁止自造锚点或日期。跨多个锚点时按剧情先后列出，首个填写主要发生或首次成立的锚点。
7. 时态只允许“当前、持续、已完成、已结束、长期”：
   - 当前：在最新锚点仍然成立；
   - 持续：从较早锚点开始，最新材料没有结束；
   - 已完成：行为或事件已经形成结果；
   - 已结束：旧状态已经被后续状态解除或取代；
   - 长期：跨场景稳定成立的制度、机制或规则。
   已离开的场景、结束的行为和被解除的状态必须使用过去时或完成态，不得继续写进人物【当前】、场景【当前状态/在场/当前资源】或物品【当前】。
8. 事件只保存已经发生的变化：
   - 【已发生进展】保存造成状态、关系、资源、控制、能力或直接因果变化的事实；最多4行。
   - 【未发生进展】保存已经发生但没有造成状态变化、且仍有必要解释连续性的材料；不是未来目标、未决事项或计划；最多2行。
   - 【结果】只写已经形成的稳定结果。
   - 目标、待办、未决、下一步、可能和预测不得写回事件。
9. 普通移动、开门、落座、视线、表情、寒暄和当轮恢复的小变化直接过滤；若它是结果不可缺少的直接因果证据，可吸收到一条进展中。
10. 运行规则必须写成“条件/触发—执行或约束—结果或持续范围”。只有来源明确陈述规则、制度、约定或限制，或者至少两个不同场景锚点反复证明相同机制时，才可抽取规则。单次照顾、单次选择、一次偶发反应不得升级为长期规则。
11. 规则必须归入真正宿主：跨世界自然与社会机制归入基础设定；地区制度与组织运行归入世界；地点内规则归入场景【局部约束】；物品机制归入物品【功能/限制】；人物之间明确持续约定归入人物【关系/稳定】。不要仅因出现“规则”二字创建空泛条目。
12. 人物、物品、场景、事件、世界和基础设定各自只保存其权威事实，禁止换角度重复同一句历史。
13. 同一状态槽存在多值时，根据场景锚点与游戏时间保留最终值；无法确认时保留明确冲突，不得猜测。
14. 物品所有权、保管者、当前持有者、当前使用者、使用权限、位置和完整性必须分开。
15. 每条事实必须带本组来源行引用；一条提炼后的事实可以承接多条重复来源，但必须列出被吸收的全部来源行。条目头部“合并来源”必须列出所用旧UID。
16. 不得把提示词、任务说明、来源行协议、输出模板、系统或开发者消息写入正文。
17. 角色只能知道自己通过信息来源获得的内容。世界事实不等于所有角色已知；私密想法只属于本人，未公开远处事件不得写进其他人物认知。
18. 【角色认知】必须写明知道、怀疑、认为或误信及获得方式；没有明确渠道时省略，不得用全知视角补齐。

【每个组的唯一输出格式】
【新条目】
组ID：G1
名称：稳定名称
归入类型：现有类型或新类型建议
合并来源：旧UID1、旧UID2
来源行：来源行1、来源行2
场景锚点：S001、S002
游戏时间：使用所选锚点的游戏时间；跨锚点时写起止范围
时间来源：明确/推定/未知
时态：当前/持续/已完成/已结束/长期
保留方式：独立条目

【内容】
- 栏目：明确事实〔来源行:来源行1,来源行2〕

【角色认知】
- 人物名称｜知道/怀疑/认为：内容｜来源：允许的信息来源〔来源行:来源行1〕
- 人物名称｜误信：错误内容｜来源：允许的信息来源｜证伪：已确认事实〔来源行:来源行1,来源行2〕

【过去结果】
- 已经形成且仍有独立长期价值的最终结果〔来源行:来源行1〕

【关键词】
- 稳定名称

多个组连续输出多个【新条目】。组ID、名称和归入类型必须与上方候选组一致。没有内容的区块省略。禁止JSON、代码块、解释、前言和后记。`;
    const body = groups.map((group) => `===GROUP ${group.id}|${group.type}|${group.name}===\n${group.sourceLineBody || '（空）'}`).join('\n\n');
    const user = `本批候选组与来源行：
${body}

按组逐一输出。不要把一个组拆成多个条目；若两个事件组显然属于同一条状态变化链，应使用一致的稳定名称和等价内容，供插件在全局收束阶段确定性合并。不同对象或不同因果链不得强行合并。`;
    return { system, user };
}

// [MA-REBUILD-11] 第三阶段只做结构覆盖校验，不再自由改写候选正文。
function migrationReviewPrompts(candidateCatalog, options = {}) {
    const system = `你是 Mirror Abyss 世界书重建结构校验器。

只检查候选目录是否存在以下结构性错误：
1. 同一来源行被两个条目占用。
2. 同一对象或同一事件生命周期被重复建档。
3. 真身、假身、替身、分身、载体被错误合并。
4. 不同稳定地点被合并为同一场景。
5. 事件正文包含未来目标、未决事项、计划、阶段标签，或把普通动作误当作独立进展。
6. 条目只有标题、别名或标题复述，没有有效事实。
7. 具体人物、物品、场景或事件事实被错误放入世界或基础设定。

通过时只能输出 PASS。
不通过时逐行输出：
FAIL|错误代码|条目A|条目B或简短原因

禁止改写正文、输出建议方案、JSON、代码块或解释。`;
    const user = `重建候选精简目录：
${String(candidateCatalog || '').trim() || '（空）'}

只做结构校验。`;
    return { system, user };
}

function migrationTypeCatalog(schema) {
    const purpose = {
        人物: '单个可识别角色及其当前状态、关系和个人认知',
        场景: '地点、地区、区域及其空间和局部规则',
        物品: '单个可追踪道具、装备或物件',
        事件: '由参与者、稳定场景和直接因果连续形成的状态变化记录',
        世界: '跨场景的地区局势、组织格局、制度和资源网络',
        基础设定: '长期稳定的自然、种族、能力、社会与地理规则',
    };
    const definitions = [...(schema?.definitions?.values?.() ?? [])].filter((definition) => definition?.enabled !== false);
    return definitions.map((definition) => {
        const aliases = (definition.aliases ?? []).filter((alias) => alias !== definition.label);
        const description = String(definition.description || purpose[definition.label] || '当前世界书已经存在的自定义类型').trim();
        return `- ${definition.label}：${description}${aliases.length ? `；已有别名：${aliases.join('、')}` : ''}`;
    }).join('\n') || '- 当前没有可用类型';
}

function keywordTemplate(definitions) {
    return definitions.filter((item) => item.enabled).map((item) => {
        const aliases = item.aliases.length ? `；近义标签：${item.aliases.join('、')}` : '';
        const fields = item.fields.map((field) => `- 【${field.label}】`).join('\n');
        return `类型：${item.label}${aliases}\n用途：${item.description}\n${fields || '- 使用合适的小标题'}`;
    }).join('\n\n');
}

function promptContextEntries(relevant, limit) {
    const globals = relevant.filter((entry) => /^(基础设定|世界)$/u.test(String(entry?.type ?? '')));
    const ordinary = relevant.filter((entry) => !/^(基础设定|世界)$/u.test(String(entry?.type ?? '')));
    const reservedCount = limit >= 5 ? Math.min(2, globals.length) : Math.min(1, globals.length);
    return [...ordinary.slice(0, Math.max(0, limit - reservedCount)), ...globals.slice(0, reservedCount)].slice(0, limit);
}
function entryForPrompt(entry, contentLimit = 1000) {
    const keywords = (entry.keywords ?? []).filter((item) => !(0, util_1.isUidKeyword)(item));
    return `标题：${entry.title}\n关键词：${keywords.join('、') || '无'}\n正文：\n${clipText(entry.content || '（空）', contentLimit)}`;
}

// [MA-PROMPT-01] 保留文本开头与结尾，避免简单截断丢失结论或最终状态。
function clipText(value, maxChars) {
    const text = String(value ?? '');
    if (!Number.isFinite(maxChars) || maxChars <= 0 || text.length <= maxChars) return text;
    const marker = '\n[中间内容已按请求预算省略]\n';
    const remaining = Math.max(0, maxChars - marker.length);
    const head = Math.ceil(remaining * 0.62);
    const tail = Math.floor(remaining * 0.38);
    return `${text.slice(0, head)}${marker}${text.slice(text.length - tail)}`;
}
},"recall-policy":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRecallPlan = buildRecallPlan;
exports.sceneStageMap = sceneStageMap;
exports.isSceneType = isSceneType;
exports.isWorldType = isWorldType;
exports.isRoleType = isRoleType;
exports.isFoundationEntry = isFoundationEntry;
exports.sanitizeRecallKeywords = sanitizeRecallKeywords;
const semantic_1 = require("./semantic");
const governance_1 = require("./governance");
const util_1 = require("./util");

// [MA-RECALL-01] 召回策略是纯函数：只读取世界书条目，返回原生字段规划，不执行任何写入。
const GENERIC_KEYWORDS = new Set([
    '人物', '角色', 'npc', '物品', '道具', '装备', '事件', '活动', '场景', '地点', '世界', '当前', '状态',
    '关系', '男人', '女人', '男孩', '女孩', '少女', '房间', '区域', '地方', '目标', '任务', '未知', '无', '当前局势', '世界局势', '世界状态', '世界变化',
]);

function isSceneType(type) {
    return ['场景', '时空'].includes(String(type ?? '').trim());
}
function isWorldType(type) {
    return ['世界', '全局', '全局状态', '全局变化', '当前局势', '世界局势'].includes(String(type ?? '').trim());
}
function isRoleType(type) {
    return ['人物', '角色', 'NPC'].includes(String(type ?? '').trim());
}

function isFoundationEntry(entry, settings) {
    if (!entry) return false;
    if (String(entry.type ?? '') === '基础设定') return true;
    const definition = settings?.keywordDefinitions?.find?.((item) => item.label === '基础设定');
    const names = definition ? [definition.label, ...(definition.aliases ?? [])] : ['基础设定'];
    return (entry.keywords ?? []).some((keyword) => names.some((name) => (0, util_1.normalizeFact)(keyword) === (0, util_1.normalizeFact)(name)));
}

// 场景阶段由“最后一次作为实际当前场景被正文提取”的时间决定；普通编辑与总结分发不会抢占当前场景。
function sceneStageMap(entries) {
    const scenes = (entries ?? [])
        .filter((entry) => entry?.managed && isSceneType(entry.type) && !entry.activation?.disabled)
        .sort((left, right) => sceneActivityTime(right) - sceneActivityTime(left) || Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
    const output = new Map();
    scenes.forEach((entry, index) => output.set(String(entry.uid), index === 0 ? 'current' : index === 1 ? 'previous' : 'remote'));
    return output;
}

function sceneActivityTime(entry) {
    const extension = entry?.raw?.extensions?.mirrorAbyssInfoPoint;
    const activeAt = Number(extension?.sceneLastActiveAt || 0);
    return activeAt || Number(entry?.updatedAt || 0);
}

function buildRecallPlan(entries, settings, focusUid = '') {
    const stages = sceneStageMap(entries);
    const profiles = new Map();
    const context = (0, governance_1.activeContext)(entries ?? [], focusUid);
    const activeUids = new Set([
        context.scene?.uid,
        ...context.characters.map((entry) => entry.uid),
        ...context.activeEvents.map((entry) => entry.uid),
        context.focus?.uid,
    ].filter(Boolean).map(String));
    for (const entry of entries ?? []) {
        const focus = String(focusUid || '') ? String(entry.uid) === String(focusUid) : entry.focus === true;
        profiles.set(String(entry.uid), profileFor(entry, settings, stages.get(String(entry.uid)) || '', focus, activeUids));
    }
    return { profiles, sceneStages: stages, activeUids };
}

function profileFor(entry, settings, sceneStage, focus, activeUids = new Set()) {
    const type = String(entry.type ?? '');
    const tier = String(entry.memoryTier ?? entry.raw?.extensions?.mirrorAbyssInfoPoint?.memoryTier ?? 'background');
    const baseOrder = ({ 场景: 700, 时空: 700, 事件: 680, 世界: 610, 全局: 610, 全局状态: 610, 全局变化: 610, 当前局势: 610, 世界局势: 610, 人物: 520, 角色: 520, NPC: 500, 物品: 500 })[type] ?? 400;

    if (entry.title === governance_1.ACTIVITY_PACK_TITLE) {
        return settings?.activityPackEnabled !== false
            ? profile('当前活动包', 'active', 'activity-pack', 'none', true, false, true, true, 0, 900, 1, null)
            : profile('活动包关闭', 'background', 'activity-pack-disabled', 'none', false, false, true, true, 0, 100, 4, null);
    }
    // [MA-PACK-RECALL-01] 活动包模式下，完整条目退回仓储态；ST只负责发送已经编译好的唯一活动包。
    if (settings?.activityPackEnabled !== false) {
        const active = activeUids.has(String(entry.uid));
        if (isFoundationEntry(entry, settings)) return profile('核心仓储', 'core', 'foundation-storage', 'none', false, false, true, true, 0, 860, 0, null);
        if (isSceneType(type)) return profile(active ? '当前场景仓储' : '历史场景仓储', active ? 'current' : 'historical', active ? 'scene-current-storage' : 'scene-history-storage', 'none', false, false, true, true, 0, baseOrder, 4, null);
        if (type === '事件') {
            const closed = (0, semantic_1.isEventClosed)(entry);
            return profile(active && !closed ? '活动事件仓储' : '历史事件仓储', active && !closed ? 'active' : closed ? 'closed' : 'settled', active && !closed ? 'event-active-storage' : 'event-history-storage', 'none', false, false, true, true, 0, baseOrder, 4, null);
        }
        if (isRoleType(type)) return profile(active || focus ? '现场人物仓储' : '人物沉降仓储', active || focus ? 'current' : 'settled', active || focus ? 'role-current-storage' : 'role-settled-storage', 'none', false, false, true, true, 0, baseOrder, 4, null);
        if (type === '物品') return profile(active ? '活动物品仓储' : '物品仓储', active ? 'current' : 'settled', active ? 'item-current-storage' : 'item-storage', 'none', false, false, true, true, 0, baseOrder, 4, null);
        return profile('世界书仓储', active ? 'current' : tierLifecycle(tier), 'warehouse-object', 'none', false, false, true, true, 0, baseOrder, 4, null);
    }

    if (isFoundationEntry(entry, settings)) {
        return profile('基础设定', 'core', 'foundation', 'none', true, false, true, true, 0, 860, 0, null);
    }
    if (focus) {
        return profile('长期焦点', 'core', 'focus', 'none', true, false, true, true, 0, 840, 1, null);
    }
    if (entry.title === '总结｜当前事件') {
        return profile('小总结向量', 'recent-summary', 'summary-container', 'vector', false, true, true, true, 6, 450, 4, null, true);
    }
    if (entry.title === '总结｜世界历史') {
        return profile('大总结向量', 'historical-summary', 'summary-container', 'vector', false, true, true, true, 8, 360, 4, null, true);
    }
    if (isSceneType(type)) {
        if (sceneStage === 'current') return profile('当前场景常驻', 'active', 'scene-current', 'none', true, false, false, true, 2, 760, 4, null);
        if (sceneStage === 'previous') return profile('上一场景关键词', 'recent', 'scene-previous', 'keyword', false, false, false, true, 5, 620, 4, 4);
        return profile('远期场景向量', 'historical', 'scene-remote', 'vector', false, true, false, true, 8, 380, 4, null, true);
    }
    if (type === '事件') {
        if ((0, semantic_1.isEventClosed)(entry)) return profile('历史事件向量', 'closed', 'event-history', 'vector', false, true, true, true, 8, 340, 4, null, true);
        return profile('活动事件关键词', 'active', 'event-active', 'keyword', false, false, true, false, 4, baseOrder, 4, 4);
    }
    if (isWorldType(type)) {
        return profile('世界变化关联', tier === 'historical' ? 'long-term' : 'active', 'world-state', 'keyword', false, false, false, false, 6, baseOrder, 4, 6);
    }
    if (isRoleType(type)) {
        const longTerm = tier === 'long-term';
        return profile(longTerm ? '长期角色关键词' : '角色关键词', longTerm ? 'long-term' : tierLifecycle(tier), 'role-object', 'keyword', false, false, true, false, longTerm ? 0 : 4, baseOrder, longTerm ? 1 : 4, longTerm ? 6 : 4);
    }
    if (type === '物品') {
        return profile('物品关键词', tierLifecycle(tier), 'item-object', 'keyword', false, false, true, false, 4, baseOrder, 4, 4);
    }
    // 旧版遗留类型不再扩散，也不默认开启向量；等待后续人工或总结迁移。
    return profile('旧类型关键词终点', tierLifecycle(tier), 'legacy-object', 'keyword', false, false, true, false, 5, baseOrder, 4, 4);
}

function profile(name, lifecycle, semanticRole, keywordMode, constant, vectorized, preventRecursion, excludeRecursion, depth, order, position, scanDepth, pureVector = false) {
    return {
        name,
        lifecycle,
        semanticRole,
        keywordMode,
        pureVector,
        constant,
        vectorized,
        preventRecursion,
        excludeRecursion,
        delayUntilRecursion: 0,
        depth,
        order,
        position,
        scanDepth,
    };
}

function tierLifecycle(value) {
    return ({ core: 'core', active: 'active', recent: 'recent', 'long-term': 'long-term', historical: 'historical', background: 'background' })[String(value ?? '')] ?? 'background';
}

// [MA-RECALL-02] 关键词只保留稳定专名；常驻与纯向量条目会把该列表暂存在扩展字段中，而不是继续参与触发。
function sanitizeRecallKeywords(name, values, type = '', max = 4) {
    const normalizedName = String(name ?? '').trim();
    const normalizedType = (0, util_1.normalizeFact)(String(type ?? ''));
    const candidates = (0, util_1.unique)([normalizedName, ...(values ?? [])]);
    const output = [];
    for (const candidate of candidates) {
        const text = String(candidate ?? '').trim().replace(/^\s*(?:别名|名称|关键词)\s*[：:]\s*/u, '');
        const normalized = (0, util_1.normalizeFact)(text);
        if (!text || /<<<\s*END_ENTRY\s*>>>/iu.test(text) || /^(?:来源行|证据行)\s*[：:]/u.test(text) || (0, util_1.isUidKeyword)(text)) continue;
        if (normalized === normalizedType) continue;
        if (GENERIC_KEYWORDS.has(normalized)) continue;
        if (normalized !== (0, util_1.normalizeFact)(normalizedName) && /(?:男人|女人|男孩|女孩|少女|青年|老人|村民|士兵|角色|人物)$/u.test(normalized)) continue;
        if (normalized.length < 2 && normalized !== (0, util_1.normalizeFact)(normalizedName)) continue;
        if (output.some((item) => (0, util_1.normalizeFact)(item) === normalized)) continue;
        output.push(text);
        if (output.length >= Math.max(1, Number(max || 4))) break;
    }
    if (!output.length && normalizedName) output.push(normalizedName);
    return output;
}
},"revision":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevisionService = void 0;
exports.parseRevisionResult = parseRevisionResult;
const parser_1 = require("./parser");
const prompts_1 = require("./prompts");
const model_request_1 = require("./model-request");

class RevisionService {
    constructor(host, getSettings) {
        this.host = host;
        this.getSettings = getSettings;
    }

    /**
     * [MA-REVISION-01] 修正服务只生成完整替换文本，不直接修改聊天。
     * 这样正文落地仍由 HostAdapter 单点负责，避免审核与宿主写入高耦合。
     */
    async revise(settings, snapshot, issues) {
        this.host.assertSnapshot(snapshot, this.getSettings());
        const prompt = (0, prompts_1.revisionPrompts)(settings, snapshot.playerText, snapshot.assistantText, issues, { dialogueContext: snapshot.dialogueContext });
        const raw = await (0, model_request_1.callModel)({
            host: this.host,
            stage: 'revision',
            prompt,
            fallbackPrompt: () => (0, prompts_1.revisionPrompts)(settings, snapshot.playerText, snapshot.assistantText, issues, { compact: true, dialogueContext: snapshot.dialogueContext }),
            settings,
            snapshot,
            profileId: settings.revisionProfileId,
            sourceText: snapshot.turnText || snapshot.assistantText,
        });
        this.host.assertSnapshot(snapshot, this.getSettings());
        const revisedText = parseRevisionResult(raw);
        if (revisedText === snapshot.assistantText)
            throw new Error('修正模型返回的正文与原正文完全相同');
        return revisedText;
    }
}
exports.RevisionService = RevisionService;

/** [MA-REVISION-02] 只接受可直接替换的完整自然正文。 */
function parseRevisionResult(raw) {
    const text = (0, parser_1.sanitizeModelText)(raw).trim();
    if (!text) throw new Error('修正模型没有返回完整正文');
    if (/^\s*(?:以下是|这是|修正版|修改后|完整修正版|修改说明|修改建议|局部补丁)\s*[：:]/u.test(text)
        || /^\s*【\s*(?:结论|问题|违反规则|修正版正文|修改说明)\s*】/u.test(text))
        throw new Error('修正模型返回了解释或包装标题，不是纯完整正文');
    if (/^(?:将|把).{0,80}(?:改为|替换为|删除)/u.test(text) && text.split('\n').length <= 3)
        throw new Error('修正模型返回了局部补丁，不是完整正文');
    return text;
}
},"semantic":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.describeEntry = describeEntry;
exports.isEventClosed = isEventClosed;
exports.countCriticalChanges = countCriticalChanges;
const util_1 = require("./util");

function describeEntry(entry, settings, currentContinuityUids = new Set(), focus = false) {
    const extension = entry?.raw?.extensions?.mirrorAbyssInfoPoint ?? {};
    const foundation = entry.type === '基础设定' || isFoundationEntry(entry, settings);
    const storedLifecycle = String(extension.lifecycle ?? entry.lifecycle ?? '');
    const storedRole = String(extension.semanticRole ?? entry.semanticRole ?? '');
    // 事件生命周期必须由当前正文确定，不能永久继承旧的 active/closed 元数据。
    if (entry.type === '事件') {
        const closed = isEventClosed(entry);
        return { lifecycle: closed ? 'closed' : 'active', semanticRole: closed ? 'event-history' : 'event-active' };
    }
    if (storedLifecycle || storedRole) {
        return { lifecycle: storedLifecycle || 'background', semanticRole: storedRole || 'object' };
    }
    if (foundation || focus) return { lifecycle: 'core', semanticRole: foundation ? 'foundation' : 'focus' };
    if (entry.title === '总结｜当前事件') return { lifecycle: 'recent-summary', semanticRole: 'summary-container' };
    if (entry.title === '总结｜世界历史') return { lifecycle: 'historical-summary', semanticRole: 'summary-container' };
    if (['场景', '时空'].includes(entry.type)) return { lifecycle: currentContinuityUids.has(entry.uid) ? 'active' : 'historical', semanticRole: 'scene-container' };
    if (['世界', '全局变化'].includes(entry.type)) return { lifecycle: 'active', semanticRole: 'world-state' };
    return { lifecycle: tierName(entry.memoryTier), semanticRole: /^(人物|角色|NPC)$/u.test(entry.type) ? 'role-object' : 'object' };
}

function tierName(value) {
    return ({
        core: 'core',
        active: 'active',
        recent: 'recent',
        'recent-summary': 'recent-summary',
        'long-term': 'long-term',
        historical: 'historical',
        'historical-summary': 'historical-summary',
        background: 'background',
    })[String(value ?? '')] ?? 'background';
}

function isEventClosed(entry) {
    if (!entry || entry.type !== '事件') return false;
    const values = entry.sections?.values ?? {};
    const result = [...(values['结果'] ?? []), ...(values['最终结果'] ?? [])].map((line) => String(line ?? '').trim()).filter(Boolean);
    const legacyPending = [...(values['未决'] ?? []), ...(values['目标'] ?? [])].join('\n');
    if (legacyPending && /(?:尚未|未完成|未解决|仍需|待确认|等待|计划)/u.test(legacyPending)) return false;
    if (!result.length) return false;
    const text = result.join('\n');
    // ui.24 的【结果】只允许稳定结果；明确写成阶段性、暂时或待确认时仍不视为最终沉降。
    if (/(?:阶段性|暂时|临时|初步|中间结果|当前结果|待确认|尚未|未完成|仍需)/u.test(text)) return false;
    return true;
}



function countCriticalChanges(plan) {
    const keys = new Set();
    for (const operation of plan?.operations ?? []) {
        if (!operation || operation.kind === 'noop' || operation.kind === 'merge-keywords' || operation.kind === 'merge-titles') continue;
        const section = String(operation.section ?? '');
        const important = operation.kind === 'create-entry'
            || operation.kind === 'delete-entry'
            || operation.kind === 'replace-line'
            || operation.kind === 'replace-section'
            || /(身份|稳定|性格核心|表达方式|决策倾向|关系立场|当前|当前状态|关系|持有|固定事实|持续经历|定义|空间结构|持续变化|在场|常驻角色|固定设施|当前资源|活动关联|局部约束|参与|附属人员|已发生进展|未发生进展|结果|时代|权力|制度|公开局势|世界变化|持续影响)/u.test(section);
        if (!important) continue;
        keys.add(`${operation.title}|${section}|${operation.kind}`);
    }
    return keys.size;
}

function isFoundationEntry(entry, settings) {
    const definition = settings?.keywordDefinitions?.find?.((item) => item.label === '基础设定');
    const names = definition ? [definition.label, ...(definition.aliases ?? [])] : ['基础设定'];
    return (entry.keywords ?? []).some((keyword) => names.some((name) => (0, util_1.normalizeFact)(keyword) === (0, util_1.normalizeFact)(name)));
}
},"settings":function(module,exports,require){


"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsStore = exports.DEFAULT_SETTINGS = exports.DEFAULT_LARGE_SUMMARY_PROMPT = exports.DEFAULT_SMALL_SUMMARY_PROMPT = exports.DEFAULT_EXTRACTION_PROMPT = exports.DEFAULT_REVISION_PROMPT = exports.DEFAULT_AUDIT_PROMPT = exports.DEFAULT_KEYWORDS = void 0;
exports.parseSettings = parseSettings;
const constants_1 = require("./constants");
const util_1 = require("./util");
const COMMON_ALIASES = { key: 'aliases', label: '别名', policy: 'merge-keywords' };
exports.DEFAULT_KEYWORDS = [
    keyword('scene', '场景', '稳定空间知识、当前局部条件、固定事实与关联入口；同一地点持续补全同一条目。', ['当前场景'], false, [
        { key: 'definition', label: '定义', policy: 'semantic-upsert' },
        { key: 'space', label: '空间结构', policy: 'semantic-upsert' },
        { key: 'fixedResources', label: '固定资源', policy: 'semantic-upsert' },
        { key: 'fixedFacilities', label: '固定设施', policy: 'semantic-upsert' },
        { key: 'residentRoles', label: '常驻角色', policy: 'semantic-upsert' },
        { key: 'fixedFacts', label: '固定事实', policy: 'semantic-upsert' },
        { key: 'current', label: '当前状态', policy: 'replace-section' },
        { key: 'present', label: '在场', policy: 'replace-section' },
        { key: 'currentResources', label: '当前资源', policy: 'replace-section' },
        { key: 'activities', label: '活动关联', policy: 'replace-section' },
        { key: 'worldImpact', label: '世界影响', policy: 'replace-section' },
        { key: 'constraints', label: '局部约束', policy: 'replace-section' },
        COMMON_ALIASES,
    ], 700, false),
    keyword('character', '人物', '角色身份、稳定能力、当前状态、角色自身关系、关键持有物与固定事实；人物描写只保留少量影响识别或剧情判断的客观特征。', ['角色', 'NPC'], false, [
        { key: 'identity', label: '身份', policy: 'semantic-upsert' },
        { key: 'stable', label: '稳定', policy: 'semantic-upsert' },
        { key: 'personality', label: '性格核心', policy: 'semantic-upsert' },
        { key: 'expression', label: '表达方式', policy: 'semantic-upsert' },
        { key: 'decision', label: '决策倾向', policy: 'semantic-upsert' },
        { key: 'current', label: '当前', policy: 'replace-section' },
        { key: 'relations', label: '关系', policy: 'replace-by-anchor' },
        { key: 'relationshipStance', label: '关系立场', policy: 'replace-by-anchor' },
        { key: 'holding', label: '持有', policy: 'replace-section' },
        { key: 'fixedFacts', label: '固定事实', policy: 'semantic-upsert' },
        COMMON_ALIASES,
    ], 520, false),
    keyword('item', '物品', '只记录可单独追踪的具体物品实例；同类集合和批量物资留在场景资源。', ['道具', '装备'], false, [
        { key: 'definition', label: '定义', policy: 'semantic-upsert' },
        { key: 'function', label: '功能', policy: 'semantic-upsert' },
        { key: 'current', label: '当前', policy: 'replace-section' },
        { key: 'limits', label: '限制', policy: 'semantic-upsert' },
        { key: 'fixedFacts', label: '固定事实', policy: 'semantic-upsert' },
        COMMON_ALIASES,
    ], 500, false),
    keyword('event', '事件', '由同一因果链形成的状态变化记录；普通动作过滤，过程压缩，稳定结果分发。', ['事件链'], false, [
        { key: 'participants', label: '参与', policy: 'replace-section' },
        { key: 'auxiliaryPeople', label: '附属人员', policy: 'replace-section' },
        { key: 'scenes', label: '场景', policy: 'replace-section' },
        { key: 'progressed', label: '已发生进展', policy: 'semantic-upsert' },
        { key: 'notProgressed', label: '未发生进展', policy: 'replace-section' },
        { key: 'result', label: '结果', policy: 'replace-section' },
        COMMON_ALIASES,
    ], 680, false),
    keyword('world', '世界', '会随剧情变化、但影响范围超出单一人物或单一场景的全局状态；包括区域、组织、权力、制度、资源网络和公开局势。', ['全局', '全局状态', '世界变化', '当前局势', '世界局势'], false, [
        { key: 'scope', label: '范围', policy: 'semantic-upsert' },
        { key: 'geography', label: '地理', policy: 'semantic-upsert' },
        { key: 'organizations', label: '组织', policy: 'semantic-upsert' },
        { key: 'power', label: '权力', policy: 'replace-by-anchor' },
        { key: 'system', label: '制度', policy: 'replace-by-anchor' },
        { key: 'network', label: '资源与交通', policy: 'replace-by-anchor' },
        { key: 'public', label: '公开局势', policy: 'replace-by-anchor' },
        { key: 'fixedFacts', label: '固定事实', policy: 'semantic-upsert' },
        { key: 'impact', label: '持续影响', policy: 'replace-by-anchor' },
        COMMON_ALIASES,
    ], 610, false),
    keyword('foundation', '基础设定', '跨场景成立且不随普通剧情变化的世界框架、自然规律、种族共性、能力技术与社会常识。', ['基础规则', '世界设定', '规则', '设定'], true, [
        { key: 'common', label: '世界常识', policy: 'semantic-upsert' },
        { key: 'nature', label: '自然规则', policy: 'semantic-upsert' },
        { key: 'species', label: '种族与生命', policy: 'semantic-upsert' },
        { key: 'ability', label: '能力与技术', policy: 'semantic-upsert' },
        { key: 'society', label: '社会规则', policy: 'semantic-upsert' },
        { key: 'geography', label: '地理框架', policy: 'semantic-upsert' },
        COMMON_ALIASES,
    ], 860, false, 0),
];
function keyword(key, label, description, aliases, constant, fields, order, vectorized = true, depth = 4) {
    return {
        key,
        label,
        description,
        aliases,
        enabled: true,
        constant,
        vectorized,
        preventRecursion: true,
        depth,
        order,
        fields: fields.map((field) => ({
            ...(0, util_1.clone)(field),
            options: (0, util_1.normalizeStringArray)(field.options),
            prompt: String(field.prompt ?? ''),
        })),
    };
}
exports.DEFAULT_AUDIT_PROMPT = `只做基础审核；明确触发任一条时判定 FAIL：
1. AI不得替玩家新增玩家未输入的台词、主动行动、重要决定、明确心理结论或价值判断。
2. AI不得把玩家已表达的动作、语言或选择扩大成新的关键决定。
3. AI回复不得与当前可见对话中的明确事实直接矛盾。
4. AI回复不得输出选项栏、行动列表、攻略、内部检查、系统规则、自我解释、管理标签、回合编号或作者总结。
5. 正常叙事描写、NPC主动行动、NPC提问、自然段落和对白换行本身不构成违规。
只依据当前提供的对话上下文审核；不审核角色卡、世界书或未提供的隐藏设定。`;
exports.DEFAULT_REVISION_PROMPT = `只修改审核指出的明确违规部分。保留合规内容、原事件顺序、人物关系、叙事视角、语气和有效信息；不得续写、全面重写、新增人物、秘密、因果或结论。修正版必须是可直接替换原正文的完整自然正文，不得添加标签、解释、审核报告、选项或系统提示。`;
exports.DEFAULT_EXTRACTION_PROMPT = `严格使用人物、场景、物品、事件、世界、基础设定六类固定格式。临时NPC、路人和一次性工作人员默认不建立长期人物条目；只有固定属于当前场景的岗位角色可写入场景【常驻角色】，真正拥有独立持续职责、关键认知或长期关系的对象才建立人物条目。关系写入对应人物，地点知识写入场景；可变化的全局状态写入世界，不随普通剧情变化的世界框架写入基础设定。人物必须优先保留性格核心、表达方式、决策倾向与当前状态。场景当前栏目完整替换，离开场景后由插件结算；事件只记录已经造成状态变化的进展，普通动作过滤。当前场景【当前状态】应在正文明确时写“游戏时间：内容”，只表示当前游戏内时间。事实必须精简、完整、无推测、无解释且不跨条目复述；物品只建单体实例。`;
exports.DEFAULT_SMALL_SUMMARY_PROMPT = `压缩当前事件已经发生的状态变化；区分已发生进展与未发生进展，过滤普通动作，覆盖旧事件进展，并把稳定影响分发到人物、场景、物品或世界。`;
exports.DEFAULT_LARGE_SUMMARY_PROMPT = `将已经压缩完成的事件结果和稳定变化沉降为长期历史；覆盖旧世界历史，不接收普通动作、未发生进展、未来目标或重复过程，只分发长期有效的结果。`;
const LEGACY_EXTRACTION_PROMPT_UI23 = `严格使用人物、场景、物品、事件、世界、基础设定六类固定格式。未知人物不得猜成已知人物；身份未揭示时建立身份未明临时档，明确揭示后再合并。关系写入对应人物，地点知识写入场景；可变化的全局状态写入世界，不随普通剧情变化的世界框架写入基础设定。场景稳定知识持续补全，当前栏目完整替换；事件只保存必要过程。事实必须精简、完整、无推测、无解释且不跨条目复述；人物只留少量关键特征，物品只建单体实例。`;
const LEGACY_SMALL_SUMMARY_PROMPT_UI23 = `结算当前事件线；保留当前场景、人物状态、事件阶段、已成立结果和未决事项，并把持续影响分发到人物、场景、物品或世界。`;
const LEGACY_LARGE_SUMMARY_PROMPT_UI23 = `整理跨场景仍需保留的长期影响；关系并入人物，地点并入场景，可变化的宏观状态进入世界，稳定世界框架进入基础设定，只分发永久变化和重大结果。`;
exports.DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    modelSource: 'current',
    modelProfileId: '',
    auditProfileId: '',
    revisionProfileId: '',
    extractionProfileId: '',
    smallSummaryProfileId: '',
    largeSummaryProfileId: '',
    migrationProfileId: '',
    autoAudit: false,
    autoExtraction: false,
    autoSmallSummary: true,
    autoLargeSummary: true,
    activityPackEnabled: true,
    entryBudgetEnabled: true,
    auditEnabled: true,
    extractionEnabled: true,
    targetLorebook: '',
    autoCreateLorebook: false,
    auditPrompt: exports.DEFAULT_AUDIT_PROMPT,
    revisionPrompt: exports.DEFAULT_REVISION_PROMPT,
    extractionPrompt: exports.DEFAULT_EXTRACTION_PROMPT,
    smallSummaryPrompt: exports.DEFAULT_SMALL_SUMMARY_PROMPT,
    largeSummaryPrompt: exports.DEFAULT_LARGE_SUMMARY_PROMPT,
    responseTokens: 3072,
    requestTimeoutMs: 90000,
    smallSummaryTurns: 10,
    criticalChangesForSmall: 6,
    largeSummaryCount: 5,
    queueCompactThreshold: 6,
    activityPackHardMax: 1800,
    keywordDefinitions: exports.DEFAULT_KEYWORDS,
    sectionPolicies: {
        在场: 'replace-section', 当前资源: 'replace-section', 活动关联: 'replace-section', 世界影响: 'replace-section', 局部约束: 'replace-section',
        常驻角色: 'semantic-upsert', 固定设施: 'semantic-upsert',
        持有: 'replace-section', 参与: 'replace-section', 场景: 'replace-section', 结果: 'replace-section',
        当前: 'replace-section', 当前状态: 'replace-section', 关系: 'replace-by-anchor', 关系立场: 'replace-by-anchor',
        固定事实: 'semantic-upsert', 已发生进展: 'semantic-upsert', 未发生进展: 'replace-section',
    },
});
class SettingsStore {
    load(context) {
        const root = (context.extensionSettings ?? (context.extensionSettings = {}));
        const namespace = (0, util_1.isPlainObject)(root[constants_1.EXTENSION_NAMESPACE]) ? root[constants_1.EXTENSION_NAMESPACE] : {};
        const settings = parseSettings(namespace.settings);
        root[constants_1.EXTENSION_NAMESPACE] = { ...namespace, settings: (0, util_1.clone)(settings) };
        return settings;
    }
    save(context, patch) {
        const root = (context.extensionSettings ?? (context.extensionSettings = {}));
        const namespace = (0, util_1.isPlainObject)(root[constants_1.EXTENSION_NAMESPACE]) ? root[constants_1.EXTENSION_NAMESPACE] : {};
        const settings = parseSettings({ ...this.load(context), ...patch });
        root[constants_1.EXTENSION_NAMESPACE] = { ...namespace, settings: (0, util_1.clone)(settings) };
        context.saveSettingsDebounced?.();
        return settings;
    }
}
exports.SettingsStore = SettingsStore;
function parseSettings(value) {
    const candidate = (0, util_1.isPlainObject)(value) ? value : {};
    const sectionPolicies = { ...(0, util_1.clone)(exports.DEFAULT_SETTINGS.sectionPolicies) };
    if ((0, util_1.isPlainObject)(candidate.sectionPolicies)) {
        for (const [key, policy] of Object.entries(candidate.sectionPolicies)) {
            if (isPolicy(policy))
                sectionPolicies[key] = policy;
        }
    }
    return {
        ...(0, util_1.clone)(exports.DEFAULT_SETTINGS),
        enabled: candidate.enabled !== false,
        modelSource: candidate.modelSource === 'profile' ? 'profile' : 'current',
        modelProfileId: String(candidate.modelProfileId ?? ''),
        auditProfileId: profileValue(candidate, 'auditProfileId'),
        revisionProfileId: profileValue(candidate, 'revisionProfileId'),
        extractionProfileId: profileValue(candidate, 'extractionProfileId'),
        smallSummaryProfileId: profileValue(candidate, 'smallSummaryProfileId'),
        largeSummaryProfileId: profileValue(candidate, 'largeSummaryProfileId'),
        migrationProfileId: profileValue(candidate, 'migrationProfileId'),
        autoAudit: candidate.autoAudit === true || (candidate.autoProcess === true && candidate.auditEnabled !== false),
        autoExtraction: candidate.autoExtraction === true || (candidate.autoProcess === true && candidate.extractionEnabled !== false),
        autoSmallSummary: candidate.autoSmallSummary !== false,
        autoLargeSummary: candidate.autoLargeSummary !== false,
        activityPackEnabled: candidate.activityPackEnabled !== false,
        entryBudgetEnabled: candidate.entryBudgetEnabled !== false,
        auditEnabled: candidate.auditEnabled !== false,
        extractionEnabled: candidate.extractionEnabled !== false,
        targetLorebook: String(candidate.targetLorebook ?? ''),
        autoCreateLorebook: candidate.autoCreateLorebook === true,
        auditPrompt: String(candidate.auditPrompt ?? exports.DEFAULT_AUDIT_PROMPT) || exports.DEFAULT_AUDIT_PROMPT,
        revisionPrompt: String(candidate.revisionPrompt ?? exports.DEFAULT_REVISION_PROMPT) || exports.DEFAULT_REVISION_PROMPT,
        extractionPrompt: migrateBuiltinPrompt(candidate.extractionPrompt, LEGACY_EXTRACTION_PROMPT_UI23, exports.DEFAULT_EXTRACTION_PROMPT),
        smallSummaryPrompt: migrateBuiltinPrompt(candidate.smallSummaryPrompt, LEGACY_SMALL_SUMMARY_PROMPT_UI23, exports.DEFAULT_SMALL_SUMMARY_PROMPT),
        largeSummaryPrompt: migrateBuiltinPrompt(candidate.largeSummaryPrompt, LEGACY_LARGE_SUMMARY_PROMPT_UI23, exports.DEFAULT_LARGE_SUMMARY_PROMPT),
        responseTokens: (0, util_1.clampNumber)(candidate.responseTokens, 3072, 256, 16384),
        requestTimeoutMs: (0, util_1.clampNumber)(candidate.requestTimeoutMs, 90000, 10000, 300000),
        smallSummaryTurns: (0, util_1.clampNumber)(candidate.smallSummaryTurns, 10, 1, 100),
        criticalChangesForSmall: (0, util_1.clampNumber)(candidate.criticalChangesForSmall, 6, 1, 50),
        largeSummaryCount: (0, util_1.clampNumber)(candidate.largeSummaryCount, 5, 1, 30),
        queueCompactThreshold: (0, util_1.clampNumber)(candidate.queueCompactThreshold, 6, 2, 50),
        activityPackHardMax: (0, util_1.clampNumber)(candidate.activityPackHardMax, 1800, 600, 4000),
        keywordDefinitions: parseKeywordDefinitions(candidate.keywordDefinitions, candidate.tables),
        sectionPolicies,
    };
}
function migrateBuiltinPrompt(value, legacyValue, currentDefault) {
    const text = String(value ?? '').trim();
    if (!text || text === String(legacyValue).trim()) return currentDefault;
    return text;
}
function profileValue(candidate, key) {
    if (Object.prototype.hasOwnProperty.call(candidate, key))
        return String(candidate[key] ?? '');
    return candidate.modelSource === 'profile' ? String(candidate.modelProfileId ?? '') : '';
}
function parseKeywordDefinitions(value, legacyTables) {
    const source = Array.isArray(value) ? value : legacyKeywords(legacyTables);
    const retiredBuiltins = new Set(['spacetime', 'region', 'global', 'ability', 'relationship', 'organization', 'task', 'contract', 'condition', 'resource', 'custom']);
    if (!Array.isArray(source) || !source.length)
        return (0, util_1.clone)(exports.DEFAULT_KEYWORDS);
    const output = [];
    for (const raw of source) {
        if (!(0, util_1.isPlainObject)(raw))
            continue;
        if (retiredBuiltins.has(String(raw.key ?? '')))
            continue;
        const label = String(raw.label ?? '').trim();
        if (!label)
            continue;
        output.push({
            key: String(raw.key ?? (0, util_1.safeId)(label) ?? label),
            label,
            description: String(raw.description ?? raw.prompt ?? ''),
            aliases: (0, util_1.normalizeStringArray)(raw.aliases),
            enabled: raw.enabled !== false,
            constant: raw.constant === true || label === '基础设定',
            vectorized: raw.vectorized !== false && label !== '基础设定',
            preventRecursion: raw.preventRecursion === true,
            depth: (0, util_1.clampNumber)(raw.depth, label === '基础设定' ? 1 : 4, 0, 99),
            order: (0, util_1.clampNumber)(raw.order, label === '基础设定' ? 860 : 400, 0, 9999),
            fields: parseFields(raw.fields),
        });
    }
    // Defaults are templates, not a whitelist. Existing old settings gain every missing
    // keyword, subsection and option while unknown/custom keywords remain untouched.
    const fallbackByLabel = new Map(exports.DEFAULT_KEYWORDS.map((item) => [item.label, item]));
    const merged = output.map((item) => mergeDefaultKeyword(item, fallbackByLabel.get(item.label)));
    const labels = new Set(merged.map((item) => item.label));
    for (const fallback of exports.DEFAULT_KEYWORDS)
        if (!labels.has(fallback.label))
            merged.push((0, util_1.clone)(fallback));
    return merged;
}
function mergeDefaultKeyword(current, fallback) {
    if (!fallback)
        return current;
    // [MA-SETTINGS-01] 内置六类使用当前固定字段，不把旧版“关系/地点/全局”等字段继续混进新模板。
    // 同名字段只继承用户填写的 prompt/options；未知自定义类型仍由上层原样保留。
    const currentByLabel = new Map((current.fields ?? []).map((field) => [field.label, field]));
    const fields = fallback.fields.map((defaultField) => {
        const saved = currentByLabel.get(defaultField.label);
        if (!saved)
            return (0, util_1.clone)(defaultField);
        return {
            ...(0, util_1.clone)(defaultField),
            prompt: saved.prompt || defaultField.prompt || '',
            options: saved.options?.length ? (0, util_1.clone)(saved.options) : (0, util_1.clone)(defaultField.options ?? []),
        };
    });
    return {
        ...(0, util_1.clone)(fallback),
        ...current,
        description: current.description || fallback.description,
        aliases: (0, util_1.unique)([...fallback.aliases, ...current.aliases]),
        constant: current.label === '基础设定' ? true : current.constant,
        vectorized: current.label === '基础设定' ? false : current.vectorized,
        fields,
    };
}

function legacyKeywords(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((raw) => {
        if (!(0, util_1.isPlainObject)(raw))
            return [];
        return [{ ...raw, description: raw.prompt, aliases: [], enabled: true, constant: String(raw.label ?? '') === '基础设定', vectorized: true, preventRecursion: false, depth: 4, order: 400 }];
    });
}
function parseFields(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((field) => {
        if (!(0, util_1.isPlainObject)(field))
            return [];
        const label = String(field.label ?? '').trim();
        if (!label)
            return [];
        return [{
                key: String(field.key ?? (0, util_1.safeId)(label) ?? label),
                label,
                policy: isPolicy(field.policy) ? field.policy : 'semantic-upsert',
                options: (0, util_1.normalizeStringArray)(field.options),
                prompt: String(field.prompt ?? ''),
            }];
    });
}
function isPolicy(value) {
    return ['semantic-upsert', 'replace-by-anchor', 'append-chain', 'replace-section', 'merge-titles', 'merge-keywords'].includes(String(value));
}
},"util":function(module,exports,require){


"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clone = clone;
exports.hashText = hashText;
exports.errorText = errorText;
exports.isPlainObject = isPlainObject;
exports.normalizeStringArray = normalizeStringArray;
exports.unique = unique;
exports.clampNumber = clampNumber;
exports.normalizeTitle = normalizeTitle;
exports.stripUidSuffix = stripUidSuffix;
exports.stripBatchTitleId = stripBatchTitleId;
exports.uidKeyword = uidKeyword;
exports.titleWithUid = titleWithUid;
exports.isUidKeyword = isUidKeyword;
exports.splitTitle = splitTitle;
exports.normalizeFact = normalizeFact;
exports.safeId = safeId;
exports.truncate = truncate;
exports.escapeHtml = escapeHtml;
function clone(value) { return value === undefined ? value : structuredClone(value); }
function hashText(value) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}
function errorText(error) {
    if (error instanceof Error)
        return `${error.name}: ${error.message}`;
    try {
        return JSON.stringify(error);
    }
    catch {
        return String(error);
    }
}
function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function normalizeStringArray(value) {
    if (Array.isArray(value))
        return unique(value.map(String));
    if (typeof value === 'string')
        return unique(value.split(/[\n,，]/u));
    return [];
}
function unique(values) {
    return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}
function clampNumber(value, fallback, min, max) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(max, Math.max(min, Math.round(numeric))) : fallback;
}
function normalizeTitle(value) {
    return String(value ?? '')
        .replace(/^\s*#{1,6}\s*/u, '')
        .replace(/[|丨]/gu, '｜')
        .replace(/\s*｜\s*/gu, '｜')
        .replace(/[：:]\s*(?=[^｜\n]+$)/u, '｜')
        .replace(/\s+/gu, ' ')
        .trim();
}
function stripUidSuffix(value) {
    return normalizeTitle(value)
        .replace(/(?:｜|\s)[（(]?UID\s*[:：=]\s*[^｜）)\s]+[）)]?\s*$/iu, '')
        .trim();
}
function uidKeyword(uid) {
    const value = String(uid ?? '').trim();
    return value ? `UID:${value}` : '';
}
function titleWithUid(title, uid) {
    const logical = stripUidSuffix(title);
    const token = uidKeyword(uid);
    return token ? `${logical}｜${token}` : logical;
}
function isUidKeyword(value) {
    return /^UID\s*[:：=]\s*[^\s]+$/iu.test(String(value ?? '').trim());
}
function splitTitle(value) {
    const normalized = stripUidSuffix(value);
    const parts = normalized.split('｜').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const type = parts[0];
    const batchId = parts.length >= 3 && /^(?:(?:[A-Z]{1,3})?\d{2,5}-\d{2,4}|S\d{3,6}-[A-Z]\d{2,4})$/iu.test(parts[1]) ? parts[1] : '';
    const name = (batchId ? parts.slice(2) : parts.slice(1)).join('｜').trim();
    return type && name ? { type, name, batchId } : null;
}
function stripBatchTitleId(value) {
    const split = splitTitle(value);
    return split ? `${split.type}｜${split.name}` : normalizeTitle(value);
}
function normalizeFact(value) {
    return value
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[“”‘’"'`]/gu, '')
        .replace(/[，,；;：:。.!！?？、\s]+/gu, '')
        .replace(/目前|当前|此时|现在/gu, '')
        .replace(/已经|已然/gu, '已')
        .replace(/坐落于|身处于|处在|处于|位在/gu, '位于')
        .replace(/取得|拿到|得到/gu, '获得')
        .replace(/拥有着|持有着/gu, '持有')
        .trim();
}
function safeId(value) {
    return String(value ?? '').trim().replace(/[^\p{L}\p{N}_:.-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 120);
}
function truncate(value, max) {
    return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}
},"world-setting-import":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSettingImportService = void 0;
exports.sanitizeWorldSettingBlocks = sanitizeWorldSettingBlocks;
exports.worldSettingPreviewSummary = worldSettingPreviewSummary;
const matcher_1 = require("./matcher");
const model_request_1 = require("./model-request");
const operations_1 = require("./operations");
const parser_1 = require("./parser");
const prompts_1 = require("./prompts");
const util_1 = require("./util");
const ALLOWED_TYPES = new Set(['基础设定', '世界', '场景', '人物', '物品', '事件']);
const MAX_SOURCE_CHARS = 24000;
const MAX_BLOCKS = 16;
const CONTROL_TITLE = /^(?:基础设定|世界|人物|场景|事件|物品)｜(?:角色信息边界|系统提示|开发者消息|写作要求|文风要求|输出格式|提取规则|审核规则|控制提示|控制规则)$/u;
const CONTROL_MARKER = /(?:<<<\s*(?:ENTRY|END_ENTRY)|\bUID\s*:|来源行\s*:|系统提示|开发者消息|提示词模板)/iu;
const FUTURE_ONLY_EVENT = /(?:尚未开始|未开始|计划中|准备开始|将要|未来会|以后会)/u;
class WorldSettingImportService {
    constructor(host, worldbook, getSettings, onProgress = null) {
        this.host = host;
        this.worldbook = worldbook;
        this.getSettings = getSettings;
        this.onProgress = typeof onProgress === 'function' ? onProgress : null;
        this.previewState = null;
    }
    progress(state, detail, meta = {}) {
        try { this.onProgress?.({ state, detail, ...meta }); }
        catch (error) { console.warn('[MirrorAbyss] world setting import progress callback failed', error); }
    }
    hasPreview() { return Boolean(this.previewState?.previewReady); }
    clearPreview() { this.previewState = null; return true; }
    previewSummary() { return worldSettingPreviewSummary(this.previewState); }
    async preview(settings, snapshot, sourceText) {
        const source = normalizeSource(sourceText);
        validateSource(source);
        this.validate(snapshot, settings);
        this.progress('running', '正在读取当前世界书并整理设定来源');
        const opened = await this.worldbook.readRaw(settings, snapshot, () => this.validate(snapshot, settings));
        const entries = (0, require("./worldbook").parseEntries)(opened.data);
        const selected = (0, matcher_1.relevantEntries)(entries, source, 8);
        const prompt = (0, prompts_1.worldSettingImportPrompts)(settings, source, selected);
        const raw = await (0, model_request_1.callModel)({
            host: this.host,
            stage: 'worldSettingImport',
            prompt,
            fallbackPrompt: () => (0, prompts_1.worldSettingImportPrompts)(settings, source, selected, { compact: true }),
            settings,
            snapshot,
            profileId: settings.extractionProfileId,
            sourceText: source,
            onRetry: () => this.progress('running', '设定导入网关异常，已缩短既有条目上下文并重试一次'),
        });
        this.validate(snapshot, settings);
        let blocks = (0, parser_1.parseExtractionWithRecovery)(raw);
        let diagnostics = blocks.diagnostics ?? { repaired: 0, merged: [], skipped: [], warnings: [], hadInput: false };
        let repairRaw = '';
        if (!blocks.length && diagnostics.hadInput) {
            this.progress('running', '设定返回格式异常，启动一次格式修复');
            repairRaw = await (0, model_request_1.callModel)({
                host: this.host,
                stage: 'extractionRepair',
                prompt: (0, prompts_1.extractionRepairPrompts)(raw),
                fallbackPrompt: () => (0, prompts_1.extractionRepairPrompts)(raw, { compact: true }),
                settings,
                snapshot,
                profileId: settings.extractionProfileId,
                sourceText: raw,
            });
            this.validate(snapshot, settings);
            blocks = (0, parser_1.parseExtractionWithRecovery)(repairRaw);
            const next = blocks.diagnostics ?? {};
            diagnostics = {
                repaired: Number(diagnostics.repaired || 0) + Number(next.repaired || 0) + 1,
                merged: [...(diagnostics.merged || []), ...(next.merged || [])],
                skipped: [...(diagnostics.skipped || []), ...(next.skipped || [])],
                warnings: [...(diagnostics.warnings || []), '已执行一次模型格式修复', ...(next.warnings || [])],
                hadInput: true,
            };
        }
        if (!blocks.length) throw new Error('没有从玩家设定中解析出可预览条目');
        const sanitized = sanitizeWorldSettingBlocks(blocks, source, diagnostics);
        if (!sanitized.length) throw new Error('玩家设定只包含写作要求、控制文本或尚未成立的未来事件，没有可导入事实');
        const plan = (0, operations_1.buildOperationPlan)(sanitized, entries, settings, source);
        plan.operations = plan.operations.map((operation) => {
            if (!['delete-entry', 'merge-entry'].includes(operation.kind)) return operation;
            return { ...operation, kind: 'noop', operation: 'no-op', reason: '设定导入只新增或更新，不执行档案合并与删除' };
        });
        const meaningful = plan.operations.filter((operation) => operation.kind !== 'noop');
        if (!meaningful.length) throw new Error('这些设定与当前世界书一致，没有需要提交的变化');
        const sourceHash = (0, util_1.hashText)(source);
        const worldbookHash = digestWorldbook(opened.data);
        const created = [...new Set(meaningful.filter((operation) => operation.kind === 'create-entry').map((operation) => operation.title))];
        const updated = [...new Set(meaningful.filter((operation) => operation.kind !== 'create-entry').map((operation) => operation.title))];
        this.previewState = {
            previewReady: true,
            source,
            sourceHash,
            worldbookName: opened.name,
            worldbookHash,
            chatKey: snapshot.chatKey,
            plan,
            blocks: sanitized,
            raw: repairRaw || raw,
            diagnostics,
            created,
            updated,
            generatedAt: Date.now(),
        };
        const summary = this.previewSummary();
        this.progress('success', `设定预览已生成：新建${created.length}、更新${updated.length}，世界书尚未修改`, summary);
        return summary;
    }
    async commit(settings, snapshot, sourceText) {
        const preview = this.previewState;
        if (!preview?.previewReady) throw new Error('尚未生成可提交的设定预览');
        const source = normalizeSource(sourceText);
        if ((0, util_1.hashText)(source) !== preview.sourceHash) throw new Error('设定文本已修改，请重新生成预览');
        if (snapshot.chatKey !== preview.chatKey) throw new Error('聊天已经切换，请重新生成设定预览');
        this.validate(snapshot, settings);
        const opened = await this.worldbook.readRaw(settings, snapshot, () => this.validate(snapshot, settings));
        if (opened.name !== preview.worldbookName || digestWorldbook(opened.data) !== preview.worldbookHash)
            throw new Error('世界书在预览后已经变化，请重新生成设定预览');
        this.progress('running', '正在原子提交玩家设定并回读校验');
        const focusUid = typeof this.host.getFocusUid === 'function' ? this.host.getFocusUid() : '';
        const result = await this.worldbook.apply(
            settings,
            preview.plan,
            `world-setting:${preview.sourceHash}`,
            source,
            focusUid,
            snapshot,
            () => this.validate(snapshot, settings),
            { sourceKind: 'setting-import' },
        );
        const summary = {
            committed: true,
            changed: result.changed === true,
            created: [...preview.created],
            updated: [...preview.updated],
            writeCount: Number(result.writeCount || 0),
            worldbookName: preview.worldbookName,
        };
        this.previewState = null;
        this.progress('success', `玩家设定已提交：新建${summary.created.length}、更新${summary.updated.length}`, summary);
        return summary;
    }
    validate(snapshot, settings) {
        if (typeof this.host.assertSnapshot === 'function') this.host.assertSnapshot(snapshot, settings ?? this.getSettings?.());
    }
}
exports.WorldSettingImportService = WorldSettingImportService;
function normalizeSource(value) {
    return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}
function validateSource(source) {
    if (source.length < 12) throw new Error('请粘贴更完整的世界设定，至少12个字符');
    if (source.length > MAX_SOURCE_CHARS) throw new Error(`世界设定超过${MAX_SOURCE_CHARS}字符，请分为多次导入`);
}
function sanitizeWorldSettingBlocks(blocks, source, diagnostics = {}) {
    const warnings = diagnostics.warnings ?? (diagnostics.warnings = []);
    const skipped = diagnostics.skipped ?? (diagnostics.skipped = []);
    const output = [];
    let sceneCount = 0;
    for (const original of blocks.slice(0, MAX_BLOCKS)) {
        const block = structuredClone(original);
        if (!ALLOWED_TYPES.has(String(block.type ?? ''))) {
            skipped.push({ title: block.title || '未知条目', reason: '设定导入不支持该类型' });
            continue;
        }
        const title = String(block.title ?? '').trim();
        const content = blockText(block);
        if (!title || CONTROL_TITLE.test(title) || controlContentOnly(content)) {
            skipped.push({ title: title || '控制文本', reason: '写作或控制文本不进入世界书' });
            continue;
        }
        if (block.type === '事件') {
            const occurred = (block.sections ?? [])
                .filter((section) => /^(?:已发生进展|关键进展|事件进程|结果)$/u.test(section.name))
                .flatMap((section) => section.lines ?? [])
                .join(' ');
            const futureOnly = FUTURE_ONLY_EVENT.test(content) && !/(?:已经|已|正在|当前|发生|开始|形成|完成|结束|遭到|成为|抵达|进入|导致|造成)/u.test(occurred);
            if (!occurred.trim() || futureOnly) {
                skipped.push({ title, reason: '尚未发生或没有已发生变化的计划不建立事件条目' });
                continue;
            }
        }
        if (block.type === '场景') {
            sceneCount += 1;
            if (sceneCount > 1) {
                skipped.push({ title, reason: '设定初始化只允许一个明确开局场景；其余地点应归入世界或基础设定' });
                continue;
            }
        }
        block.keywords = (0, util_1.unique)((block.keywords ?? [])
            .map((item) => (0, parser_1.sanitizeWorldbookLine)(item))
            .filter((item) => item && !(0, util_1.isUidKeyword)(item) && !CONTROL_MARKER.test(item)))
            .slice(0, 4);
        if (!block.keywords.length && block.name) block.keywords = [block.name];
        block.sections = (block.sections ?? []).map((section) => ({
            ...section,
            lines: (section.lines ?? []).map((line) => (0, parser_1.sanitizeWorldbookLine)(line)).filter((line) => line && !CONTROL_MARKER.test(line)),
        })).filter((section) => section.lines.length || section.empty === true);
        if (!block.sections.some((section) => (section.lines ?? []).length)) {
            skipped.push({ title, reason: '清理控制文本后没有正文' });
            continue;
        }
        output.push(block);
    }
    if (blocks.length > MAX_BLOCKS) warnings.push(`模型返回${blocks.length}个条目，只保留前${MAX_BLOCKS}个`);
    if (skipped.length) warnings.push(`已隔离${skipped.length}个不应进入世界书的候选`);
    return output;
}
function blockText(block) {
    return (block.sections ?? []).flatMap((section) => (section.lines ?? []).map((line) => `【${section.name}】${line}`)).join('\n');
}
function controlContentOnly(content) {
    const text = String(content ?? '');
    if (!text) return true;
    const controlHits = (text.match(/(?:AI|模型|玩家|提示词|系统消息|开发者消息|写作|文风|输出格式|审核|提取)/giu) || []).length;
    const factualHits = (text.match(/(?:世界|地区|城市|组织|种族|魔法|技术|货币|制度|人物|位于|存在|当前|已经|发生)/gu) || []).length;
    return controlHits >= 2 && factualHits === 0;
}
function digestWorldbook(data) {
    return (0, util_1.hashText)(JSON.stringify(data?.entries ?? {}));
}
function worldSettingPreviewSummary(preview) {
    if (!preview?.previewReady) return null;
    return {
        previewReady: true,
        sourceHash: preview.sourceHash,
        worldbookName: preview.worldbookName,
        created: [...(preview.created ?? [])],
        updated: [...(preview.updated ?? [])],
        entries: (preview.blocks ?? []).map((block) => ({
            title: block.title,
            type: block.type,
            content: blockText(block),
        })),
        repaired: Number(preview.diagnostics?.repaired || 0),
        skipped: (preview.diagnostics?.skipped ?? []).map((item) => ({ title: item.title || '候选', reason: item.reason || '' })),
        warnings: [...(preview.diagnostics?.warnings ?? [])],
        generatedAt: preview.generatedAt,
    };
}
},"worldbook-management":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWorldbookManagementView = buildWorldbookManagementView;
const activity_pack_1 = require("./activity-pack");
const governance_1 = require("./governance");
const semantic_1 = require("./semantic");

function buildWorldbookManagementView(entries, gameTime = null, settings = {}) {
    const list = Array.isArray(entries) ? entries : [];
    const pack = list.find((entry) => entry.title === governance_1.ACTIVITY_PACK_TITLE) ?? null;
    const context = (0, governance_1.activeContext)(list, list.find((entry) => entry.focus)?.uid || '');
    const issues = [];
    const managed = list.filter((entry) => entry?.managed === true && entry.title !== governance_1.ACTIVITY_PACK_TITLE);
    const currentScenes = managed.filter((entry) => /^(?:scene-current|scene-current-storage)$/u.test(String(entry.semanticRole ?? '')));
    if (currentScenes.length > 1) issues.push(issue('error', 'multiple-current-scenes', `检测到${currentScenes.length}个当前场景`, currentScenes.map((entry) => entry.title)));
    if (!context.scene) issues.push(issue('warning', 'missing-current-scene', '没有可识别的当前场景', []));
    if (!gameTime?.label) issues.push(issue('info', 'unknown-game-time', '当前游戏时间尚未记录', []));

    const fixedSceneRoles = lines(context.scene, '常驻角色');
    const fixedFacilities = lines(context.scene, '固定设施');
    const present = lines(context.scene, '在场');
    if (fixedSceneRoles.length > 5) issues.push(issue('error', 'scene-role-capacity', `当前场景常驻角色超过5个：${fixedSceneRoles.length}`, [context.scene?.title].filter(Boolean)));
    if (fixedFacilities.length > 8) issues.push(issue('error', 'scene-facility-capacity', `当前场景固定设施超过8个：${fixedFacilities.length}`, [context.scene?.title].filter(Boolean)));

    const activeEvents = context.activeEvents ?? [];
    for (const entry of activeEvents) {
        const participants = lines(entry, '参与');
        const auxiliary = lines(entry, '附属人员');
        if (participants.length > 6) issues.push(issue('error', 'event-participant-capacity', `${entry.title}直接参与者超过6个`, [entry.title]));
        if (auxiliary.length > 4) issues.push(issue('error', 'event-auxiliary-capacity', `${entry.title}附属人员超过4个`, [entry.title]));
    }

    const people = managed.filter((entry) => /^(?:人物|角色|NPC)$/u.test(String(entry.type ?? '')));
    const currentPeople = new Set((context.characters ?? []).map((entry) => String(entry.uid)));
    const settledPeople = people.filter((entry) => !currentPeople.has(String(entry.uid)) && entry.focus !== true);
    for (const entry of people) {
        const stable = ['性格核心', '表达方式', '决策倾向'].some((section) => lines(entry, section).length > 0);
        if (currentPeople.has(String(entry.uid)) && !stable) issues.push(issue('warning', 'missing-character-style', `${entry.title}进入当前活动包但缺少性格/表达/决策信息`, [entry.title]));
        if ((0, governance_1.isGenericBackgroundPerson)({ type: entry.type, name: entry.name, sections: sectionBlocks(entry) })) {
            issues.push(issue('warning', 'temporary-npc-entry', `${entry.title}看起来仍是临时NPC独立条目`, [entry.title]));
        }
    }

    const closedEvents = managed.filter((entry) => entry.type === '事件' && (0, semantic_1.isEventClosed)(entry));
    const reopened = closedEvents.filter((entry) => /^(?:active|event-active|event-active-storage)$/u.test(String(entry.lifecycle || entry.semanticRole || '')));
    for (const entry of reopened) issues.push(issue('error', 'closed-event-active', `${entry.title}已经完成却仍被标记为活动`, [entry.title]));

    const hardMax = Math.max(600, Number(settings?.activityPackHardMax || 1800));
    const packLength = String(pack?.content ?? '').length;
    if (!pack) issues.push(issue(settings?.activityPackEnabled === false ? 'info' : 'error', 'missing-activity-pack', '当前活动包不存在', []));
    else if (packLength > hardMax) issues.push(issue('error', 'activity-pack-over-budget', `活动包${packLength}字，超过硬上限${hardMax}`, [pack.title]));

    const orphanRelations = [];
    const idSet = new Set(managed.map((entry) => String(entry.uid)));
    const titleById = new Map(managed.map((entry) => [String(entry.uid), entry.title]));
    const directRelations = [];
    const relationKeys = new Set();
    for (const entry of managed) {
        const extension = entry.raw?.extensions?.mirrorAbyssInfoPoint ?? {};
        const relatedIds = Array.isArray(entry.relatedIds) ? entry.relatedIds : Array.isArray(extension.relatedIds) ? extension.relatedIds : [];
        for (const related of relatedIds) {
            const relatedId = String(related);
            if (!idSet.has(relatedId)) {
                orphanRelations.push(`${entry.title} → ${relatedId}`);
                continue;
            }
            const pair = [String(entry.uid), relatedId].sort();
            const key = pair.join('|');
            if (relationKeys.has(key)) continue;
            relationKeys.add(key);
            directRelations.push({
                sourceUid: pair[0], sourceTitle: titleById.get(pair[0]) || pair[0],
                targetUid: pair[1], targetTitle: titleById.get(pair[1]) || pair[1],
            });
        }
    }
    if (orphanRelations.length) issues.push(issue('warning', 'orphan-relations', `发现${orphanRelations.length}个孤立关联`, orphanRelations.slice(0, 8)));

    const diagnostics = pack?.activityPackDiagnostics ?? null;
    const sectionChars = diagnostics?.sectionChars ?? sectionCharCounts(pack);
    return {
        gameTime: gameTime ? { ...gameTime } : null,
        currentScene: context.scene ? {
            uid: context.scene.uid,
            title: context.scene.title,
            present,
            fixedSceneRoles,
            fixedFacilities,
        } : null,
        activeEvents: activeEvents.map((entry) => ({ uid: entry.uid, title: entry.title, state: (0, governance_1.currentEventState)(entry) })),
        currentPeople: (context.characters ?? []).map((entry) => ({ uid: entry.uid, title: entry.title })),
        settledPeople: settledPeople.map((entry) => ({ uid: entry.uid, title: entry.title })).slice(0, 50),
        directRelations: directRelations.slice(0, 100),
        activityPack: pack ? {
            uid: pack.uid,
            title: pack.title,
            content: pack.content,
            length: packLength,
            target: Number(diagnostics?.target || 0),
            hardMax: Number(diagnostics?.hardMax || hardMax),
            sectionChars,
            includedEntries: diagnostics?.includedEntries ?? [],
            excludedWarehouseEntries: Number(diagnostics?.excludedWarehouseEntries || 0),
        } : null,
        counts: {
            managed: managed.length,
            currentPeople: currentPeople.size,
            settledPeople: settledPeople.length,
            activeEvents: activeEvents.length,
            closedEvents: closedEvents.length,
            fixedSceneRoles: fixedSceneRoles.length,
            fixedFacilities: fixedFacilities.length,
            directRelations: directRelations.length,
        },
        issues,
        healthy: !issues.some((item) => item.level === 'error'),
        budget: (0, activity_pack_1.activityPackBudget)(context.characters?.length ?? 0, { hardMax }),
    };
}

function lines(entry, section) {
    return [...(entry?.sections?.values?.[section] ?? [])].map((line) => String(line ?? '').trim()).filter(Boolean);
}
function sectionBlocks(entry) {
    return Object.entries(entry?.sections?.values ?? {}).map(([name, values]) => ({ name, lines: values ?? [], empty: !(values ?? []).length }));
}
function sectionCharCounts(pack) {
    const output = {};
    for (const [name, values] of Object.entries(pack?.sections?.values ?? {})) output[name] = (values ?? []).join('\n').length;
    return output;
}
function issue(level, code, message, entries) { return { level, code, message, entries }; }
},"worldbook":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldbookAdapter = void 0;
exports.parseEntries = parseEntries;
const constants_1 = require("./constants");
const operations_1 = require("./operations");
const parser_1 = require("./parser");
const semantic_1 = require("./semantic");
const recall_policy_1 = require("./recall-policy");
const activity_pack_1 = require("./activity-pack");
const governance_1 = require("./governance");
const entry_section_1 = require("./domain/entry-section");
const util_1 = require("./util");
class WorldbookAdapter {
    constructor(context, chatKey) {
        this.context = context;
        this.chatKey = chatKey ?? (() => '');
        this.apiPromise = null;
    }
    async list(settings, snapshot, validate) {
        return (await this.read(settings, snapshot, validate)).entries;
    }
    // [MA-RECALL-03] 只按现有世界书内容重算原生召回字段，不调用模型、不改写条目正文。
    async replanRecall(settings, snapshot, validate) {
        return this.mutate(settings, snapshot, validate, (opened) => {
            const entries = parseEntries(opened.data);
            const focusUid = entries.find((entry) => entry.focus)?.uid ?? '';
            this.upsertActivityPack(opened, settings, focusUid, { operationId: 'activity-pack-replan' });
            this.applyNativeFields(parseEntries(opened.data), settings, focusUid, new Set());
            return {
                verify(data) {
                    verifyRecallConstraints(parseEntries(data));
                    verifyActivityPack(data, settings);
                },
            };
        });
    }
    async read(settings, snapshot, validate) {
        validate?.();
        const { data, name } = await this.open(settings, false, validate, snapshot?.chatKey, snapshot?.worldbookName);
        if (snapshot?.worldbookName && name !== snapshot.worldbookName) throw new Error('读取到的世界书与任务快照不一致');
        validate?.();
        return { name, entries: parseEntries(data) };
    }
    async readRaw(settings, snapshot, validate) {
        validate?.();
        this.assertChat(snapshot?.chatKey ?? '');
        const opened = await this.open(settings, false, validate, snapshot?.chatKey, snapshot?.worldbookName);
        if (snapshot?.worldbookName && opened.name !== snapshot.worldbookName)
            throw new Error('读取到的世界书与任务快照不一致');
        validate?.();
        return { name: opened.name, data: (0, util_1.clone)(opened.data) };
    }
    async replaceRaw(settings, expectedName, nextData, snapshot, validate, expectedCurrentData) {
        validate?.();
        this.assertChat(snapshot?.chatKey ?? '');
        const opened = await this.open(settings, false, validate, snapshot?.chatKey, snapshot?.worldbookName);
        if (opened.name !== expectedName || (snapshot?.worldbookName && opened.name !== snapshot.worldbookName))
            throw new Error('目标世界书已经变化，拒绝恢复或整理');
        if (expectedCurrentData && digestWorldbook(opened.data) !== digestWorldbook(expectedCurrentData))
            throw new Error('世界书在整理期间已被其他操作修改，拒绝覆盖');
        opened.data = (0, util_1.clone)(nextData);
        opened.data.entries ?? (opened.data.entries = {});
        validate?.();
        await this.save(opened);
        validate?.();
        const verified = await opened.api.loadWorldInfo(opened.name);
        if (!verified || digestWorldbook(verified) !== digestWorldbook(opened.data))
            throw new Error('世界书完整快照保存后回读不一致');
        return parseEntries(verified);
    }
    async updateEntry(settings, uid, patch, snapshot, validate) {
        return this.mutate(settings, snapshot, validate, (opened) => {
            const located = findRawEntry(opened.data, uid);
            if (!located)
                throw new Error(`世界书条目 UID ${uid} 不存在`);
            const effectiveUid = String(located.raw.uid ?? uid);
            let logicalTitle = (0, util_1.stripUidSuffix)(String(located.raw.comment ?? ''));
            if (patch.title !== undefined) {
                logicalTitle = (0, util_1.stripUidSuffix)(String(patch.title ?? ''));
                if (!(0, util_1.splitTitle)(logicalTitle))
                    throw new Error('条目标题必须使用“类型｜名称”格式');
            }
            if (patch.content !== undefined)
                located.raw.content = String(patch.content ?? '').trim();
            const requestedKeywords = patch.keywords !== undefined
                ? (0, util_1.normalizeStringArray)(patch.keywords)
                : (0, util_1.normalizeStringArray)(located.raw.key);
            const split = (0, util_1.splitTitle)(logicalTitle);
            located.raw.comment = logicalTitle;
            located.raw.key = (0, util_1.unique)([
                split?.name,
                ...requestedKeywords.filter((item) => !(0, util_1.isUidKeyword)(item) && (0, util_1.normalizeFact)(item) !== (0, util_1.normalizeFact)(split?.type ?? '')),
            ]);
            markManaged(located.raw, '', logicalTitle, '');
            let parsed = parseEntries(opened.data);
            const focusedUid = parsed.find((entry) => entry.focus)?.uid ?? '';
            this.upsertActivityPack(opened, settings, focusedUid, { operationId: 'activity-pack-edit' });
            parsed = parseEntries(opened.data);
            this.applyNativeFields(parsed, settings, focusedUid, new Set([String(uid)]));
            return {
                verify(data) {
                    const result = findRawEntry(data, uid);
                    if (!result)
                        throw new Error(`条目 UID ${uid} 保存后丢失`);
                    const expectedLogicalTitle = patch.title !== undefined
                        ? (0, util_1.stripUidSuffix)(String(patch.title ?? ''))
                        : logicalTitle;
                    if ((0, util_1.normalizeTitle)(String(result.raw.comment ?? '')) !== (0, util_1.normalizeTitle)(expectedLogicalTitle))
                        throw new Error(`条目 UID ${uid} 的标题保存失败`);
                    const parsedAfter = parseEntries(data);
                    const foundAfter = parsedAfter.find((entry) => entry.uid === String(uid));
                    if (!foundAfter) throw new Error(`条目 UID ${uid} 保存后无法解析`);
                    const focusedUid = parsedAfter.find((entry) => entry.focus)?.uid ?? '';
                    const profile = (0, recall_policy_1.buildRecallPlan)(parsedAfter, settings, focusedUid).profiles.get(String(uid));
                    if (profile?.keywordMode === 'keyword' && !(result.raw.key ?? []).length)
                        throw new Error(`条目 UID ${uid} 的稳定关键词保存失败`);
                    if (patch.content !== undefined && normalizeContent(result.raw.content) !== normalizeContent(patch.content))
                        throw new Error(`条目 UID ${uid} 正文保存失败`);
                },
            };
        });
    }
    async setLocked(settings, uid, locked, snapshot, validate) {
        return this.mutate(settings, snapshot, validate, (opened) => {
            const located = findRawEntry(opened.data, uid);
            if (!located)
                throw new Error(`世界书条目 UID ${uid} 不存在`);
            ensureUidIdentity(located.raw, String(located.raw.uid ?? uid), (0, util_1.stripUidSuffix)(String(located.raw.comment ?? '')));
            const previousUpdatedAt = Number(readExtension(located.raw).updatedAt) || 0;
            const extension = markManaged(located.raw, '', (0, util_1.stripUidSuffix)(String(located.raw.comment ?? '')), '');
            if (previousUpdatedAt) extension.updatedAt = previousUpdatedAt;
            extension.locked = locked === true;
            let parsed = parseEntries(opened.data);
            const focusedUid = parsed.find((entry) => entry.focus)?.uid ?? '';
            this.upsertActivityPack(opened, settings, focusedUid, { operationId: 'activity-pack-lock' });
            parsed = parseEntries(opened.data);
            this.applyNativeFields(parsed, settings, focusedUid, new Set());
            return {
                verify(data) {
                    const result = findRawEntry(data, uid);
                    if (!result || readExtension(result.raw).locked !== (locked === true))
                        throw new Error(`条目 UID ${uid} 的手动锁定状态保存失败`);
                },
            };
        });
    }
    async setFocus(settings, oldUid, nextUid, snapshot, validate) {
        return this.mutate(settings, snapshot, validate, (opened) => {
            const next = nextUid ? findRawEntry(opened.data, nextUid) : null;
            if (nextUid && !next)
                throw new Error(`焦点条目 UID ${nextUid} 不存在`);
            for (const [mapKey, raw] of Object.entries(opened.data.entries ?? {})) {
                if (!raw || typeof raw !== 'object')
                    continue;
                const effectiveUid = String(raw.uid ?? mapKey);
                const logicalTitle = (0, util_1.stripUidSuffix)(String(raw.comment ?? raw.name ?? raw.title ?? ''));
                const extension = readExtension(raw);
                if (extension.focus === true || (oldUid && effectiveUid === String(oldUid))) {
                    const previousUpdatedAt = Number(extension.updatedAt) || 0;
                    const marked = markManaged(raw, '', logicalTitle, '');
                    if (previousUpdatedAt) marked.updatedAt = previousUpdatedAt;
                    marked.focus = false;
                    delete marked.focusPreviousConstant;
                }
                if (nextUid && effectiveUid === String(nextUid)) {
                    const previousUpdatedAt = Number(readExtension(raw).updatedAt) || 0;
                    const marked = markManaged(raw, '', logicalTitle, '');
                    if (previousUpdatedAt) marked.updatedAt = previousUpdatedAt;
                    marked.focus = true;
                }
            }
            this.upsertActivityPack(opened, settings, nextUid, { operationId: 'activity-pack-focus' });
            const parsed = parseEntries(opened.data);
            this.applyNativeFields(parsed, settings, nextUid, new Set());
            return {
                verify(data) {
                    const focused = Object.entries(data.entries ?? {})
                        .filter(([, raw]) => readExtension(raw).focus === true)
                        .map(([mapKey, raw]) => ({ uid: String(raw.uid ?? mapKey), raw }));
                    if (nextUid && (focused.length !== 1 || focused[0].uid !== String(nextUid)))
                        throw new Error('玩家焦点保存后未保持唯一');
                    if (!nextUid && focused.length)
                        throw new Error('玩家焦点清除失败');
                    if (nextUid && settings.activityPackEnabled === false && findRawEntry(data, nextUid)?.raw.constant !== true)
                        throw new Error('焦点条目未设置为 constant');
                    if (nextUid && settings.activityPackEnabled !== false && findRawEntry(data, nextUid)?.raw.constant === true)
                        throw new Error('活动包模式下焦点原条目不应直接常驻');
                },
            };
        });
    }
    async rebalance(settings, kind, summaryText, snapshot, validate) {
        return this.mutate(settings, snapshot, validate, (opened) => {
            const focusedUid = parseEntries(opened.data).find((entry) => entry.focus)?.uid ?? '';
            applySummaryRebalance(this, opened.data, settings, kind, summaryText, focusedUid);
            this.upsertActivityPack(opened, settings, focusedUid, { operationId: `activity-pack-${kind}` });
            return {
                verify(data) {
                    const after = parseEntries(data);
                    if (kind === 'large' && after.some((entry) => entry.title === '总结｜当前事件')) throw new Error('大总结沉降后小总结容器仍存在');
                    verifyRecallConstraints(after);
                },
            };
        });
    }
    async mutate(settings, snapshot, validate, mutate) {
        validate?.();
        this.assertChat(snapshot?.chatKey ?? '');
        const opened = await this.open(settings, false, validate, snapshot?.chatKey, snapshot?.worldbookName);
        if (snapshot?.worldbookName && opened.name !== snapshot.worldbookName)
            throw new Error('目标世界书已经变化，拒绝编辑');
        const beforeVersion = digestWorldbook(opened.data);
        const verifier = mutate(opened) ?? {};
        validate?.();
        const latest = await opened.api.loadWorldInfo(opened.name);
        if (!latest || digestWorldbook(latest) !== beforeVersion)
            throw new Error('世界书在编辑前已被其他操作修改，拒绝覆盖');
        validate?.();
        await this.save(opened);
        validate?.();
        const verified = await opened.api.loadWorldInfo(opened.name);
        if (!verified)
            throw new Error('世界书编辑后回读失败');
        verifier.verify?.(verified);
        return parseEntries(verified);
    }
    async apply(settings, plan, sourceMessageKey, contextText, focusUid, snapshot, validate, options = {}) {
        validate?.();
        this.assertChat(snapshot?.chatKey ?? '');
        const opened = await this.open(settings, true, validate, snapshot?.chatKey, snapshot?.worldbookName);
        if (snapshot?.worldbookName && opened.name !== snapshot.worldbookName) throw new Error('目标世界书已经变化，拒绝提交');
        validate?.();
        const beforeVersion = digestWorldbook(opened.data);
        const beforeData = (0, util_1.clone)(opened.data);
        const receiptBefore = snapshotRawEntries(opened.data);
        const before = parseEntries(opened.data);
        const writeOperations = plan.operations.filter((operation) => !['noop', 'delete-entry'].includes(operation.kind));
        const exitOperations = plan.operations.filter((operation) => operation.kind === 'delete-entry');
        const operationId = commitOperationId(sourceMessageKey, plan.operations);
        let expectedAfterWrites = before;
        const touchedUids = new Set(writeOperations.filter((operation) => operation.targetUid).map((operation) => String(operation.targetUid)));
        const createdUids = new Set();

        if (writeOperations.length) {
            const phasePlan = { ...plan, operations: writeOperations };
            expectedAfterWrites = (0, operations_1.applyPlanToEntries)(phasePlan, before, settings);
            const byUid = new Map(before.map((entry) => [entry.uid, entry]));
            for (const entry of expectedAfterWrites) {
                if (entry.uid.startsWith('new:')) {
                    const created = this.createEntry(opened.api, opened.name, opened.data);
                    hydrateRaw(created, entry, sourceMessageKey, operationId);
                    entry.uid = String(created.uid);
                    entry.mapKey = findMapKey(opened.data, created);
                    entry.raw = created;
                    createdUids.add(entry.uid);
                }
                else if (touchedUids.has(entry.uid)) {
                    const original = byUid.get(entry.uid);
                    if (!original) throw new Error(`待更新条目 UID ${entry.uid} 不存在`);
                    hydrateRaw(original.raw, entry, sourceMessageKey, operationId);
                    // [MA-SCENE-REAL-01] 后续场景活动时间与扩展字段必须写到真实世界书对象，不能停留在投影副本。
                    entry.raw = original.raw;
                    entry.mapKey = original.mapKey;
                }
            }
            // [MA-SCENE-01] 单轮只有一个正文结束时的当前场景。只给提取结果中的首个场景刷新活动时间。
            if (['extraction', 'setting-import'].includes(options.sourceKind)) {
                const currentSceneTitle = plan.blocks?.find?.((block) => (0, recall_policy_1.isSceneType)(block.type))?.title || '';
                const activeAt = Date.now();
                for (const entry of expectedAfterWrites) {
                    if (!(0, recall_policy_1.isSceneType)(entry.type)) continue;
                    if ((0, util_1.normalizeTitle)(entry.title) !== (0, util_1.normalizeTitle)(currentSceneTitle)) continue;
                    if (!touchedUids.has(String(entry.uid)) && !createdUids.has(String(entry.uid))) continue;
                    const extension = markManaged(entry.raw, sourceMessageKey, entry.title, operationId);
                    extension.sceneLastActiveAt = activeAt;
                    break;
                }
            }
        }

        let deletedCount = 0;
        const deleted = [];
        if (exitOperations.length) {
            const currentEntries = parseEntries(opened.data);
            for (const operation of exitOperations) {
                const target = currentEntries.find((entry) => entry.uid === String(operation.targetUid));
                const foundation = target?.keywords.some((keyword) => isFoundation(keyword, settings));
                if (!target || target.locked || target.focus || foundation || target.uid === String(focusUid ?? '')) continue;
                if (operation.requiresDistributionProof === true) {
                    const requiredTargets = (0, util_1.normalizeStringArray)(operation.distributionTargets).map(util_1.normalizeTitle);
                    if (!requiredTargets.length) continue;
                    const currentTitles = new Set(parseEntries(opened.data).map((entry) => (0, util_1.normalizeTitle)(entry.title)));
                    if (requiredTargets.some((title) => !currentTitles.has(title))) continue;
                }
                delete opened.data.entries[target.mapKey];
                deleted.push({ uid: target.uid, title: target.title });
            }
            deletedCount = deleted.length;
        }

        const packResult = this.upsertActivityPack(opened, settings, focusUid, {
            operationId,
            currentSceneTitle: plan.currentSceneTitle || plan.blocks?.find?.((block) => (0, recall_policy_1.isSceneType)(block.type))?.title || '',
            gameTime: options.currentGameTime,
        });
        if (packResult.uid) touchedUids.add(String(packResult.uid));
        const changed = writeOperations.length > 0 || deletedCount > 0 || packResult.changed === true;
        if (!changed) {
            const result = parseEntries(opened.data);
            result.changed = false;
            result.writeCount = 0;
            result.deleteCount = 0;
            result.receipt = null;
            result.activityPack = packResult;
            return result;
        }

        if (options.rebalanceKind) {
            applySummaryRebalance(this, opened.data, settings, options.rebalanceKind, options.summaryText || '', focusUid);
        }
        else {
            this.applyNativeFields(parseEntries(opened.data), settings, focusUid, new Set([...touchedUids, ...createdUids]), createdUids);
        }

        validate?.();
        const latest = await opened.api.loadWorldInfo(opened.name);
        if (!latest || digestWorldbook(latest) !== beforeVersion) throw new Error('世界书在提交前已被其他操作修改，拒绝覆盖');
        validate?.();
        await this.save(opened);
        validate?.();
        let verifiedData;
        try {
            verifiedData = await opened.api.loadWorldInfo(opened.name);
            if (!verifiedData) throw new Error('世界书提交后回读失败');
            verifyWriteResults(verifiedData, expectedAfterWrites, writeOperations, operationId, settings, focusUid);
            verifyExitResults(verifiedData, deleted);
            verifyActivityPack(verifiedData, settings);
        }
        catch (error) {
            // [MA-ATOMIC-02] 保存后的验证也属于提交事务。验证失败必须恢复完整旧快照，不能留下半成功写入。
            opened.data = (0, util_1.clone)(beforeData);
            try {
                await this.save(opened);
                const restored = await opened.api.loadWorldInfo(opened.name);
                if (!restored || digestWorldbook(restored) !== digestWorldbook(beforeData)) throw new Error('恢复后快照不一致');
            }
            catch (rollbackError) {
                throw new Error(`世界书提交后验证失败，且旧快照恢复失败：${(0, util_1.errorText)(error)}；${(0, util_1.errorText)(rollbackError)}`);
            }
            throw new Error(`世界书提交后验证失败，已恢复提交前快照：${(0, util_1.errorText)(error)}`);
        }
        opened.data = verifiedData;

        const result = parseEntries(verifiedData);
        result.changed = true;
        result.writeCount = writeOperations.length + Number(packResult.changed === true);
        result.deleteCount = deletedCount;
        result.activityPack = packResult;
        result.receipt = buildCommitReceipt(receiptBefore, verifiedData, {
            id: operationId,
            sourceMessageKey,
            messageIndex: snapshot?.messageIndex,
            playerMessageIndex: snapshot?.playerMessageIndex,
            contentHash: snapshot?.contentHash,
            dialogueHash: snapshot?.dialogueHash,
            sourceKind: options.sourceKind || '',
            worldbookName: opened.name,
        });
        return result;
    }
    async rollbackReceipts(settings, receipts, focusUid, snapshot, validate) {
        const ordered = (Array.isArray(receipts) ? receipts : []).filter((item) => item && Array.isArray(item.changes) && item.changes.length);
        if (!ordered.length) return { entries: [], changed: false, rolledBack: 0 };
        validate?.();
        this.assertChat(snapshot?.chatKey ?? '');
        const opened = await this.open(settings, false, validate, snapshot?.chatKey, snapshot?.worldbookName);
        if (snapshot?.worldbookName && opened.name !== snapshot.worldbookName) throw new Error('目标世界书已经变化，拒绝回滚');
        if (ordered.some((item) => item.worldbookName && item.worldbookName !== opened.name)) throw new Error('近期写入回执属于其他世界书');
        const beforeVersion = digestWorldbook(opened.data);
        const touchedUids = new Set();
        for (const receipt of [...ordered].reverse()) {
            for (const change of [...receipt.changes].reverse()) {
                const uid = String(change.uid ?? '');
                if (!uid) continue;
                const current = findRawEntry(opened.data, uid);
                const currentDigest = current ? semanticRawDigest(current.raw) : '';
                if (String(change.afterDigest ?? '') !== currentDigest) {
                    throw new Error(`条目 UID ${uid} 在写入回执后又被修改，已停止自动回滚`);
                }
                if (!change.before) {
                    if (!current) continue;
                    const extension = readExtension(current.raw);
                    const isRuntimePack = String(current.raw.comment || '') === governance_1.ACTIVITY_PACK_TITLE
                        || String(extension.semanticRole || '') === 'activity-pack'
                        || String(extension.storageRole || '') === 'runtime';
                    // 活动包是本次事务生成的可重建投影。回执证明它在事务前不存在时，
                    // 即使运行态为了防误改而被锁定，也必须允许随事务一起删除。
                    if (!isRuntimePack && (extension.focus === true || extension.locked === true || current.raw.locked === true))
                        throw new Error(`条目“${current.raw.comment || uid}”已被设为焦点或锁定，不能自动删除`);
                    delete opened.data.entries[current.mapKey];
                    continue;
                }
                const restored = structuredClone(change.before);
                if (current) {
                    const currentExtension = readExtension(current.raw);
                    const restoredExtension = markManaged(restored, '', String(restored.comment ?? ''), '');
                    restoredExtension.focus = currentExtension.focus === true;
                    restoredExtension.locked = currentExtension.locked === true;
                    restored.locked = current.raw.locked === true;
                }
                const mapKey = current?.mapKey || String(change.beforeMapKey ?? restored.uid ?? uid);
                opened.data.entries[mapKey] = restored;
                touchedUids.add(String(restored.uid ?? uid));
            }
        }
        const restoredEntries = parseEntries(opened.data);
        this.applyNativeFields(restoredEntries, settings, focusUid, touchedUids);
        validate?.();
        const latest = await opened.api.loadWorldInfo(opened.name);
        if (!latest || digestWorldbook(latest) !== beforeVersion) throw new Error('世界书在回滚前已被其他操作修改，拒绝覆盖');
        validate?.();
        await this.save(opened);
        validate?.();
        const verified = await opened.api.loadWorldInfo(opened.name);
        if (!verified) throw new Error('世界书回滚后回读失败');
        const result = parseEntries(verified);
        result.changed = true;
        result.rolledBack = ordered.length;
        return result;
    }
    upsertActivityPack(opened, settings, focusUid = '', options = {}) {
        const existingEntries = parseEntries(opened.data);
        if (settings?.activityPackEnabled === false) {
            const existingPack = existingEntries.find((entry) => entry.title === governance_1.ACTIVITY_PACK_TITLE);
            if (existingPack?.mapKey != null) delete opened.data.entries[existingPack.mapKey];
            return { changed: Boolean(existingPack), disabled: true, title: governance_1.ACTIVITY_PACK_TITLE, contentLength: 0, budget: null };
        }
        const gameTime = options.gameTime ?? currentGameTimeFromContext(this.context());
        const block = (0, activity_pack_1.compileActivityPack)(existingEntries, {
            focusUid,
            currentSceneTitle: options.currentSceneTitle || '',
            gameTime,
            hardMax: settings.activityPackHardMax,
        });
        let located = existingEntries.find((entry) => entry.title === governance_1.ACTIVITY_PACK_TITLE);
        let raw = located?.raw;
        if (!raw) {
            raw = this.createEntry(opened.api, opened.name, opened.data);
            located = null;
        }
        const sections = {
            order: block.sections.map((section) => section.name),
            values: Object.fromEntries(block.sections.map((section) => [section.name, section.lines])),
        };
        const entry = located ? structuredClone(located) : {
            uid: String(raw.uid ?? ''), mapKey: findMapKey(opened.data, raw), title: block.title,
            normalizedTitle: (0, util_1.normalizeTitle)(block.title).toLocaleLowerCase(), type: block.type, name: block.name,
            content: '', sections, keywords: block.keywords, aliases: [], references: [], focus: false, locked: true,
            managed: true, activation: {}, raw,
        };
        entry.title = block.title;
        entry.type = block.type;
        entry.name = block.name;
        entry.sections = sections;
        entry.keywords = block.keywords;
        entry.locked = true;
        const nextContent = (0, parser_1.serializeEntrySections)(sections);
        const hash = (0, util_1.hashText)(`${nextContent}|${gameTime?.label || ''}|${block.diagnostics.currentScene || ''}`);
        const oldExtension = readExtension(raw);
        const changed = String(raw.content ?? '') !== nextContent || String(oldExtension.activityPackHash ?? '') !== hash || raw.comment !== block.title;
        if (changed) hydrateRaw(raw, entry, '', String(options.operationId || 'activity-pack'));
        const extension = markManaged(raw, '', block.title, changed ? String(options.operationId || 'activity-pack') : '');
        if (!changed && Number(oldExtension.updatedAt || 0)) extension.updatedAt = Number(oldExtension.updatedAt);
        extension.locked = true;
        extension.storageRole = 'runtime';
        extension.lifecycle = 'active';
        extension.semanticRole = 'activity-pack';
        extension.activityPackHash = hash;
        extension.activityPackDiagnostics = block.diagnostics;
        raw.locked = true;
        return { changed, uid: String(raw.uid ?? ''), title: block.title, diagnostics: block.diagnostics, contentLength: block.contentLength, budget: block.budget };
    }
    applyNativeFields(entries, settings, focusUid, touchedUids, _createdUids = new Set()) {
        const normalizedFocusUid = String(focusUid ?? '');
        const recall = (0, recall_policy_1.buildRecallPlan)(entries, settings, normalizedFocusUid);
        const relationIndex = (0, governance_1.buildDirectRelationIndex)(entries);
        for (const entry of entries) {
            const focus = normalizedFocusUid ? entry.uid === normalizedFocusUid : entry.focus;
            const managed = entry.managed || touchedUids.has(entry.uid) || focus;
            if (!managed) continue;
            const profile = recall.profiles.get(String(entry.uid));
            if (!profile) continue;
            const previousUpdatedAt = Number(readExtension(entry.raw).updatedAt) || 0;
            applyNativeProfile(entry.raw, profile);
            const extension = markManaged(entry.raw, '', entry.title, '');
            if (!touchedUids.has(entry.uid) && previousUpdatedAt) extension.updatedAt = previousUpdatedAt;
            applyKeywordPolicy(entry.raw, entry, profile, extension);
            extension.focus = focus;
            extension.chatKey = this.chatKey();
            extension.recallProfile = profile.name;
            extension.lifecycle = profile.lifecycle;
            extension.semanticRole = profile.semanticRole;
            extension.storageRole = entry.title === governance_1.ACTIVITY_PACK_TITLE ? 'runtime' : 'warehouse';
            extension.entityClass = /^(?:人物|角色|NPC)$/u.test(String(entry.type ?? ''))
                ? (profile.lifecycle === 'settled' ? 'settled-character' : 'character')
                : /^(?:场景|时空)$/u.test(String(entry.type ?? '')) ? 'scene'
                    : entry.type === '事件' ? 'event' : String(entry.type ?? 'object');
            extension.hostSceneTitle = profile.lifecycle === 'current' && /^(?:人物|角色|NPC)$/u.test(String(entry.type ?? ''))
                ? (entries.find((candidate) => /^(?:scene-current|scene-current-storage)$/u.test(String(candidate.semanticRole ?? '')))?.title || '')
                : String(extension.hostSceneTitle || '');
            extension.relatedIds = [...(relationIndex.get(String(entry.uid)) ?? new Set())];
            extension.sceneStage = recall.sceneStages.get(String(entry.uid)) || '';
            delete extension.evidence;
        }
    }
    assertChat(expected) { if (expected && this.chatKey() !== expected) throw new Error('聊天已经切换，拒绝写入世界书'); }
    async open(settings, create, validate, expectedChatKey = '', expectedName = '') {
        validate?.();
        this.assertChat(expectedChatKey);
        const api = await this.api();
        validate?.();
        this.assertChat(expectedChatKey);
        const context = this.context();
        const metadataKey = String(api.METADATA_KEY ?? 'world_info');
        let name = String(settings.targetLorebook || context.chatMetadata?.[metadataKey] || context.chatMetadata?.world_info || '').trim();
        let generatedName = false;
        if (!name && settings.autoCreateLorebook) {
            const display = (0, util_1.safeId)(context.name2 || context.name1 || 'Chat') || 'Chat';
            name = `MA_${display}`;
            generatedName = true;
        }
        if (!name) throw new Error('当前聊天未绑定世界书');
        if (expectedName && name !== expectedName)
            throw new Error('目标世界书已经变化，拒绝继续');
        validate?.();
        let data = await api.loadWorldInfo(name);
        validate?.();
        this.assertChat(expectedChatKey);
        if (!data && create) {
            if (typeof api.createNewWorldInfo !== 'function') throw new Error('SillyTavern 未提供 createNewWorldInfo');
            validate?.();
            await api.createNewWorldInfo(name, { interactive: false });
            validate?.();
            this.assertChat(expectedChatKey);
            data = await api.loadWorldInfo(name);
            validate?.();
        }
        if (!data && !create && generatedName)
            data = { entries: {} };
        if (!data) throw new Error(`世界书“${name}”不存在`);
        data.entries ?? (data.entries = {});
        if (create && context.chatMetadata?.[metadataKey] !== name) {
            validate?.();
            this.assertChat(expectedChatKey);
            context.chatMetadata ?? (context.chatMetadata = {});
            context.chatMetadata[metadataKey] = name;
            context.chatMetadata.world_info = name;
            if (typeof context.saveMetadata === 'function') await context.saveMetadata();
            else context.saveMetadataDebounced?.();
            validate?.();
            this.assertChat(expectedChatKey);
        }
        return { api, name, data };
    }
    createEntry(api, name, data) {
        if (typeof api.createWorldInfoEntry !== 'function') throw new Error('SillyTavern 未提供 createWorldInfoEntry');
        const entry = api.createWorldInfoEntry(name, data);
        if (!entry) throw new Error('世界书条目创建失败');
        return entry;
    }
    async save(opened) {
        if (typeof opened.api.saveWorldInfo !== 'function') throw new Error('SillyTavern 未提供 saveWorldInfo');
        await opened.api.saveWorldInfo(opened.name, opened.data, true);
        const context = this.context();
        await context.updateWorldInfoList?.();
        await context.reloadWorldInfoEditor?.(opened.name, false);
    }
    api() {
        if (globalThis.__MIRROR_ABYSS_WORLD_INFO_API__) return Promise.resolve(globalThis.__MIRROR_ABYSS_WORLD_INFO_API__);
        if (globalThis.__MIRROR_ABYSS_LOAD_WORLD_INFO_API__) return globalThis.__MIRROR_ABYSS_LOAD_WORLD_INFO_API__();
        if (this.apiPromise) return this.apiPromise;
        this.apiPromise = Promise.resolve(buildContextWorldInfoApi(this.context()));
        return this.apiPromise;
    }
}
exports.WorldbookAdapter = WorldbookAdapter;
function applySummaryRebalance(adapter, data, settings, kind, summaryText, focusUid = '') {
    const entries = parseEntries(data);
    const normalizedSummary = (0, util_1.normalizeFact)(summaryText);
    const recall = (0, recall_policy_1.buildRecallPlan)(entries, settings, focusUid || entries.find((entry) => entry.focus)?.uid || '');
    for (const entry of entries) {
        if (!entry.managed && !entry.focus) continue;
        const previousUpdatedAt = Number(readExtension(entry.raw).updatedAt) || 0;
        const extension = markManaged(entry.raw, '', entry.title, '');
        if (previousUpdatedAt) extension.updatedAt = previousUpdatedAt;
        const profile = recall.profiles.get(String(entry.uid));
        const mentioned = normalizedSummary.includes((0, util_1.normalizeFact)(entry.name)) || normalizedSummary.includes((0, util_1.normalizeFact)(entry.title));
        if (profile?.lifecycle === 'core') extension.memoryTier = 'core';
        else if (profile?.semanticRole === 'scene-current') extension.memoryTier = 'active';
        else if (profile?.semanticRole === 'scene-previous') extension.memoryTier = 'recent';
        else if (profile?.semanticRole === 'scene-remote') extension.memoryTier = 'historical';
        else if (entry.title === '总结｜当前事件') extension.memoryTier = 'recent-summary';
        else if (entry.title === '总结｜世界历史') extension.memoryTier = 'historical-summary';
        else if (entry.type === '事件' && !(0, semantic_1.isEventClosed)(entry)) extension.memoryTier = 'active';
        else if (mentioned) extension.memoryTier = kind === 'small' ? 'recent' : 'long-term';
        else if (kind === 'large' && entry.type === '事件') extension.memoryTier = 'historical';
        else if (!extension.memoryTier) extension.memoryTier = 'background';
    }
    adapter.applyNativeFields(parseEntries(data), settings, focusUid, new Set());
}
function buildContextWorldInfoApi(context) {
    const headers = () => context.getRequestHeaders?.() ?? { 'Content-Type': 'application/json' };
    const loadWorldInfo = typeof context.loadWorldInfo === 'function' ? context.loadWorldInfo.bind(context) : async (name) => {
        const response = await fetch('/api/worldinfo/get', { method: 'POST', headers: headers(), body: JSON.stringify({ name }), cache: 'no-cache' });
        if (!response.ok) return null;
        return response.json();
    };
    const saveWorldInfo = typeof context.saveWorldInfo === 'function' ? context.saveWorldInfo.bind(context) : async (name, data) => {
        const response = await fetch('/api/worldinfo/edit', { method: 'POST', headers: headers(), body: JSON.stringify({ name, data }) });
        if (!response.ok) throw new Error(`世界书保存失败：HTTP ${response.status}`);
    };
    return {
        METADATA_KEY: 'world_info', loadWorldInfo, saveWorldInfo,
        async createNewWorldInfo(name) { await saveWorldInfo(name, { entries: {} }, true); await context.updateWorldInfoList?.(); return true; },
        createWorldInfoEntry(_name, data) {
            data.entries ?? (data.entries = {});
            let uid = 0; while (Object.prototype.hasOwnProperty.call(data.entries, String(uid))) uid += 1;
            const entry = createDefaultWorldInfoEntry(uid); data.entries[String(uid)] = entry; return entry;
        },
    };
}
function createDefaultWorldInfoEntry(uid) {
    return { uid, key: [], keysecondary: [], comment: '', content: '', constant: false, vectorized: true, selective: false, selectiveLogic: 0, addMemo: false, order: 400, position: 0, disable: false, ignoreBudget: false, excludeRecursion: false, preventRecursion: true, probability: 100, useProbability: true, depth: 4, outletName: '', group: '', groupOverride: false, groupWeight: 100, scanDepth: null, caseSensitive: null, matchWholeWords: null, useGroupScoring: null, automationId: '', role: 0, sticky: null, cooldown: null, delay: null, delayUntilRecursion: 0, triggers: [] };
}
function parseEntries(data) {
    const output = [];
    for (const [mapUid, rawValue] of Object.entries(data?.entries ?? {})) {
        if (!rawValue || typeof rawValue !== 'object') continue;
        const raw = rawValue;
        const rawTitle = (0, util_1.normalizeTitle)(String(raw.comment ?? raw.name ?? raw.title ?? ''));
        const title = (0, util_1.stripUidSuffix)(rawTitle);
        const split = (0, util_1.splitTitle)(title);
        if (!split) continue;
        const content = String(raw.content ?? '');
        const sections = (0, entry_section_1.parseEntrySections)(content, split.type);
        const triggerKeywords = (0, util_1.normalizeStringArray)(raw.key).filter((item) => !(0, util_1.isUidKeyword)(item));
        const aliases = (0, util_1.unique)((0, entry_section_1.sectionLines)(content, ['别名', '称号', '其他名称'], split.type));
        const extension = readExtension(raw);
        const storedKeywords = (0, util_1.normalizeStringArray)(extension.recallKeywords);
        output.push({ uid: String(raw.uid ?? mapUid), mapKey: String(mapUid), title, normalizedTitle: title.toLocaleLowerCase(), type: split.type, name: split.name, content, sections, keywords: (0, util_1.unique)([split.name, ...triggerKeywords, ...storedKeywords]), triggerKeywords, aliases, references: (0, entry_section_1.extractReferences)(content, split.type), focus: extension.focus === true, locked: extension.locked === true || raw.locked === true, managed: extension.managed === true, updatedAt: Number(extension.updatedAt) || 0, memoryTier: String(extension.memoryTier ?? ''), lifecycle: String(extension.lifecycle ?? ''), semanticRole: String(extension.semanticRole ?? ''), storageRole: String(extension.storageRole ?? ''), entityClass: String(extension.entityClass ?? ''), hostSceneTitle: String(extension.hostSceneTitle ?? ''), relatedIds: Array.isArray(extension.relatedIds) ? extension.relatedIds.map(String) : [], activityPackDiagnostics: extension.activityPackDiagnostics && typeof extension.activityPackDiagnostics === 'object' ? structuredClone(extension.activityPackDiagnostics) : null, sceneStage: String(extension.sceneStage ?? ''), chatKey: String(extension.chatKey ?? ''), recallProfile: String(extension.recallProfile ?? ''), activation: { enabled: raw.disable !== true, constant: raw.constant === true, selective: raw.selective === true, vectorized: raw.vectorized === true, recursive: raw.recursive === true || (raw.preventRecursion !== true && raw.excludeRecursion !== true), preventRecursion: raw.preventRecursion === true, excludeRecursion: raw.excludeRecursion === true, delayUntilRecursion: finiteNumber(raw.delayUntilRecursion, 0), depth: Math.max(0, finiteNumber(raw.depth, 4)), order: finiteNumber(raw.order, 400), position: finiteNumber(raw.position, 0), role: finiteNumber(raw.role, 0), scanDepth: raw.scanDepth == null ? null : finiteNumber(raw.scanDepth, null), probability: finiteNumber(raw.probability, 100), useProbability: raw.useProbability !== false, disabled: raw.disable === true }, raw });
    }
    return output.sort((left, right) => left.title.localeCompare(right.title));
}
function hydrateRaw(raw, entry, sourceMessageKey, operationId) {
    const uid = String(raw.uid ?? entry.uid ?? '');
    const split = (0, util_1.splitTitle)(entry.title);
    raw.comment = entry.title;
    const safeSections = {
        order: entry.sections.order ?? [],
        values: Object.fromEntries(Object.entries(entry.sections.values ?? {}).map(([section, lines]) => [section, (0, util_1.unique)((lines ?? []).map((line) => (0, parser_1.sanitizeWorldbookLine)(line)).filter(Boolean))])),
    };
    raw.content = (0, parser_1.serializeEntrySections)(safeSections);
    raw.key = (0, util_1.unique)([
        split?.name,
        ...entry.keywords.map((item) => (0, parser_1.sanitizeWorldbookLine)(item)).filter((item) => item && !(0, util_1.isUidKeyword)(item) && (0, util_1.normalizeFact)(item) !== (0, util_1.normalizeFact)(split?.type ?? '')),
    ]);
    raw.keysecondary ?? (raw.keysecondary = []);
    const extension = markManaged(raw, sourceMessageKey, entry.title, operationId);
    extension.locked = entry.locked;
    extension.focus = entry.focus;
}
function markManaged(raw, sourceMessageKey, title, operationId) {
    const extensions = (raw.extensions ?? (raw.extensions = {}));
    const current = extensions[constants_1.WORLD_INFO_EXTENSION_KEY];
    const extension = current && typeof current === 'object' ? current : {};
    extensions[constants_1.WORLD_INFO_EXTENSION_KEY] = { ...extension, managed: true, version: constants_1.MANAGED_VERSION, title, ...(sourceMessageKey ? { sourceMessageKey } : {}), ...(operationId ? { lastOperationId: operationId } : {}), updatedAt: Date.now() };
    return extensions[constants_1.WORLD_INFO_EXTENSION_KEY];
}
function readExtension(raw) { const value = raw.extensions?.[constants_1.WORLD_INFO_EXTENSION_KEY]; return value && typeof value === 'object' ? value : {}; }
function isFoundation(keyword, settings) {
    const normalized = (0, util_1.normalizeFact)(keyword);
    const definition = settings.keywordDefinitions.find((item) => item.label === '基础设定');
    return definition ? [definition.label, ...definition.aliases].some((item) => (0, util_1.normalizeFact)(item) === normalized) : normalized === (0, util_1.normalizeFact)('基础设定');
}
function isFoundationEntry(entry, settings) { return entry.keywords.some((keyword) => isFoundation(keyword, settings)); }
function applyNativeProfile(raw, profile) {
    raw.constant = profile.constant === true;
    raw.vectorized = profile.vectorized === true;
    raw.preventRecursion = profile.preventRecursion !== false;
    raw.excludeRecursion = profile.excludeRecursion === true;
    raw.delayUntilRecursion = Number(profile.delayUntilRecursion || 0);
    raw.depth = Math.max(0, Number(profile.depth || 0));
    raw.order = Number(profile.order || 400);
    raw.position = Number(profile.position ?? 4);
    raw.scanDepth = profile.scanDepth == null ? null : Number(profile.scanDepth);
    raw.selective = false;
    raw.keysecondary = [];
    raw.caseSensitive = false;
    raw.matchWholeWords = false;
    raw.probability = 100;
    raw.useProbability = true;
    if ('recursive' in raw) raw.recursive = raw.preventRecursion !== true && raw.excludeRecursion !== true;
}

function applyKeywordPolicy(raw, entry, profile, extension) {
    const current = (0, util_1.normalizeStringArray)(raw.key).filter((item) => !(0, util_1.isUidKeyword)(item));
    const stored = (0, util_1.normalizeStringArray)(extension.recallKeywords);
    const candidates = (0, recall_policy_1.sanitizeRecallKeywords)(entry.name, [...current, ...stored, ...(entry.aliases ?? [])], entry.type, 4);
    extension.recallKeywords = candidates;
    if (profile.keywordMode !== 'keyword') {
        raw.key = [];
        raw.keysecondary = [];
        return;
    }
    raw.key = (0, util_1.unique)(candidates);
}
function verifyRecallConstraints(entries) {
    const currentScenes = entries.filter((entry) => entry.managed && /^(?:scene-current|scene-current-storage)$/u.test(entry.semanticRole));
    if (currentScenes.length > 1) throw new Error('当前场景超过一条');
    const pack = entries.find((entry) => entry.title === governance_1.ACTIVITY_PACK_TITLE && entry.activation.constant === true);
    for (const entry of entries.filter((item) => item.managed)) {
        if (entry.focus && !pack && (!entry.activation.constant || !entry.activation.preventRecursion || !entry.activation.excludeRecursion)) throw new Error(`长期焦点未保持常驻递归隔离：${entry.title}`);
        if (pack && entry.title !== governance_1.ACTIVITY_PACK_TITLE && (entry.activation.constant || entry.activation.vectorized || entry.triggerKeywords?.length)) throw new Error(`活动包模式下仓储条目仍可直接召回：${entry.title}`);
        if (entry.activation.vectorized && entry.triggerKeywords?.length) throw new Error(`纯向量条目仍保留关键词：${entry.title}`);
        const maySpread = /^(scene-|world-state)/u.test(entry.semanticRole || '');
        if (!maySpread && entry.activation.preventRecursion !== true) throw new Error(`非场景/世界条目仍可继续递归：${entry.title}`);
    }
}

function currentGameTimeFromContext(context) {
    const root = context?.chatMetadata?.[constants_1.EXTENSION_NAMESPACE];
    const value = root?.currentGameTime;
    return value && typeof value === 'object' ? structuredClone(value) : null;
}
function verifyActivityPack(data, settings) {
    const entries = parseEntries(data);
    const packs = entries.filter((entry) => entry.title === governance_1.ACTIVITY_PACK_TITLE);
    if (settings?.activityPackEnabled !== false) {
        if (packs.length !== 1) throw new Error(`当前活动包数量异常：${packs.length}`);
        if (!packs[0].activation.constant || !packs[0].activation.preventRecursion || !packs[0].activation.excludeRecursion) throw new Error('当前活动包没有保持常驻递归隔离');
        const hardMax = Math.max(600, Number(settings?.activityPackHardMax || 1800));
        if (String(packs[0].content ?? '').length > hardMax + 240) throw new Error('当前活动包超过硬预算');
    }
}
function ensureUidIdentity(raw, uid, logicalTitle) {
    const effectiveUid = String(uid ?? raw.uid ?? '').trim();
    const title = (0, util_1.stripUidSuffix)(logicalTitle || String(raw.comment ?? raw.name ?? raw.title ?? ''));
    const split = (0, util_1.splitTitle)(title);
    if (title) raw.comment = title;
    raw.key = (0, util_1.unique)([
        split?.name,
        ...(0, util_1.normalizeStringArray)(raw.key).filter((item) => !(0, util_1.isUidKeyword)(item) && (0, util_1.normalizeFact)(item) !== (0, util_1.normalizeFact)(split?.type ?? '')),
    ]);
}
function snapshotRawEntries(data) {
    const output = new Map();
    for (const [mapKey, raw] of Object.entries(data?.entries ?? {})) {
        if (!raw || typeof raw !== 'object') continue;
        const uid = String(raw.uid ?? mapKey);
        output.set(uid, { mapKey: String(mapKey), raw: structuredClone(raw), digest: semanticRawDigest(raw) });
    }
    return output;
}
function buildCommitReceipt(before, data, meta = {}) {
    const after = snapshotRawEntries(data);
    const changes = [];
    const uids = new Set([...before.keys(), ...after.keys()]);
    for (const uid of uids) {
        const previous = before.get(uid);
        const current = after.get(uid);
        const beforeDigest = previous?.digest ?? '';
        const afterDigest = current?.digest ?? '';
        if (beforeDigest === afterDigest) continue;
        changes.push({
            uid,
            beforeMapKey: previous?.mapKey ?? '',
            before: previous ? previous.raw : null,
            afterDigest,
        });
    }
    if (!changes.length) return null;
    return {
        id: String(meta.id || (0, util_1.hashText)(`${meta.sourceMessageKey || ''}|${Date.now()}`)),
        sourceMessageKey: String(meta.sourceMessageKey ?? ''),
        messageIndex: Number.isInteger(meta.messageIndex) ? meta.messageIndex : -1,
        playerMessageIndex: Number.isInteger(meta.playerMessageIndex) ? meta.playerMessageIndex : -1,
        contentHash: String(meta.contentHash ?? ''),
        dialogueHash: String(meta.dialogueHash ?? ''),
        sourceKind: String(meta.sourceKind ?? ''),
        worldbookName: String(meta.worldbookName ?? ''),
        createdAt: Date.now(),
        changes,
    };
}
function semanticRawDigest(raw) {
    if (!raw || typeof raw !== 'object') return '';
    const extension = readExtension(raw);
    return (0, util_1.hashText)(JSON.stringify({
        uid: String(raw.uid ?? ''),
        title: String(raw.comment ?? raw.name ?? raw.title ?? ''),
        content: String(raw.content ?? ''),
        sourceMessageKey: String(extension.sourceMessageKey ?? ''),
        lastOperationId: String(extension.lastOperationId ?? ''),
    }));
}
function digestWorldbook(data) { return (0, util_1.hashText)(JSON.stringify(data?.entries ?? {})); }
function commitOperationId(sourceMessageKey, operations) { return (0, util_1.hashText)(`${sourceMessageKey}|${operations.map((operation) => operation.id).sort().join('|')}`); }
function findMapKey(data, raw) {
    for (const [key, value] of Object.entries(data.entries ?? {})) if (value === raw || String(value?.uid ?? '') === String(raw?.uid ?? '')) return String(key);
    return String(raw?.uid ?? '');
}
function findRawEntry(data, uid) {
    for (const [mapKey, raw] of Object.entries(data?.entries ?? {})) {
        if (raw && typeof raw === 'object' && String(raw.uid ?? mapKey) === String(uid))
            return { mapKey: String(mapKey), raw };
    }
    return null;
}
function preservedNativeSnapshot(raw) {
    const copy = (0, util_1.clone)(raw ?? {});
    delete copy.comment;
    delete copy.name;
    delete copy.title;
    delete copy.content;
    delete copy.key;
    if (copy.extensions && typeof copy.extensions === 'object')
        delete copy.extensions[constants_1.WORLD_INFO_EXTENSION_KEY];
    return copy;
}
function verifyWriteResults(data, expectedEntries, operations, operationId, settings, focusUid) {
    if (!operations.length) return;
    const actual = parseEntries(data);
    const touched = new Set(operations.filter((operation) => operation.kind !== 'create-entry' && operation.targetUid).map((operation) => String(operation.targetUid)));
    const createdTitles = new Set(operations.filter((operation) => operation.kind === 'create-entry').map((operation) => (0, util_1.normalizeTitle)(operation.title)));
    const expected = expectedEntries.filter((entry) => touched.has(entry.uid) || createdTitles.has((0, util_1.normalizeTitle)(entry.title)));
    for (const item of expected) {
        const found = actual.find((entry) => entry.uid === item.uid) ?? actual.find((entry) => (0, util_1.normalizeTitle)(entry.title) === (0, util_1.normalizeTitle)(item.title));
        if (!found) throw new Error(`世界书回读未找到已提交条目：${item.title}`);
        if ((0, util_1.normalizeTitle)(found.title) !== (0, util_1.normalizeTitle)(item.title)) throw new Error(`世界书逻辑标题未正确落盘：${item.title}`);
        if ((0, util_1.normalizeTitle)(String(found.raw.comment ?? '')) !== (0, util_1.normalizeTitle)(item.title)) throw new Error(`世界书标题未正确落盘：${item.title}`);
        if (normalizeContent(found.content) !== normalizeContent((0, parser_1.serializeEntrySections)(item.sections))) throw new Error(`世界书正文未正确落盘：${item.title}`);
        const actualKeys = [...new Set((found.triggerKeywords ?? []).map(util_1.normalizeFact))].sort();
        const extension = readExtension(found.raw);
        if (extension.lastOperationId !== operationId) throw new Error(`世界书操作 ID 未正确落盘：${item.title}`);
        const profile = (0, recall_policy_1.buildRecallPlan)(actual, settings, focusUid).profiles.get(String(found.uid));
        if (profile.keywordMode !== 'keyword' && actualKeys.length) throw new Error(`非关键词条目仍保留触发词：${item.title}`);
        if (profile.keywordMode === 'keyword' && !actualKeys.length) throw new Error(`关键词条目没有稳定触发词：${item.title}`);
        if (found.activation.constant !== profile.constant) throw new Error(`constant 字段未按条目类型落盘：${item.title}`);
        if (found.activation.vectorized !== profile.vectorized) throw new Error(`vectorized 字段未按条目类型落盘：${item.title}`);
        if (found.activation.preventRecursion !== profile.preventRecursion) throw new Error(`preventRecursion 字段未按语义落盘：${item.title}`);
        if (found.activation.excludeRecursion !== profile.excludeRecursion) throw new Error(`excludeRecursion 字段未按语义落盘：${item.title}`);
        if (found.activation.depth !== profile.depth) throw new Error(`depth 字段未按语义落盘：${item.title}`);
        if (found.activation.order !== profile.order) throw new Error(`order 字段未按语义落盘：${item.title}`);
        if (found.activation.position !== profile.position) throw new Error(`position 字段未按语义落盘：${item.title}`);
    }
}
function verifyExitResults(data, deleted) {
    const entries = parseEntries(data);
    for (const record of deleted) {
        const uid = String(record?.uid ?? record ?? '');
        const title = String(record?.title ?? '');
        const sameOldEntry = entries.some((item) => item.uid === uid && (!title || (0, util_1.normalizeTitle)(item.title) === (0, util_1.normalizeTitle)(title)));
        if (sameOldEntry) throw new Error(`条目删除未正确落盘：${title || `UID ${uid}`}`);
    }
}
function normalizeContent(value) { return String(value ?? '').replace(/\r/g, '').trim(); }
function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
}};
var MA_CACHE=Object.create(null);
function maResolve(from,spec){if(!spec.startsWith('.'))return spec;var base=from.split('/');base.pop();for(var part of spec.split('/')){if(!part||part==='.')continue;if(part==='..')base.pop();else base.push(part)}return base.join('/')}
function maRequire(id){if(MA_CACHE[id])return MA_CACHE[id].exports;var factory=MA_MODULES[id];if(!factory)throw new Error('内部模块不存在：'+id);var module={exports:{}};MA_CACHE[id]=module;factory(module,module.exports,function(spec){return maRequire(maResolve(id,spec))});return module.exports}
var MA_ENTRY=maRequire('index');
export const onActivate=()=>MA_ENTRY.onActivate();
export const onEnable=()=>MA_ENTRY.onEnable();
export const onDisable=()=>MA_ENTRY.onDisable();
export const onDelete=()=>MA_ENTRY.onDelete();
export const onInstall=()=>MA_ENTRY.onInstall();
export const onUpdate=()=>MA_ENTRY.onUpdate();
export const onClean=()=>MA_ENTRY.onClean();
export const __testRequire=maRequire;
