/**
 * 模块职责：镜渊完整工作区：总览、动态表格、图谱、总结、审核、同步、设置与诊断。
 * 维护边界：人工表格编辑必须保存 source=manual/locked 语义；UI 操作通过 pipeline 公开函数执行。
 */
import { VERSION, DEFAULT_STATE_PROMPTS, DEFAULT_SUMMARY_PROMPTS, } from "./constants.js";
import { getChat, currentChatKey, getMessage, getSettings, latestAssistantIndex, saveSettings, toast, } from "./core-context.js";
import { assertArtifactCommitCurrent, persistChatFor } from "./core-commit-guard.js";
import { escapeHtml, safeText, toErrorMessage } from "./core-utils.js";
import { attachArtifactToMessage } from "./domain-artifact.js";
import { canonicalObjectTitle } from "./domain-object-identity.js";
import { buildEventProfiles } from "./domain-event-profile.js";
import { deleteRow, moveManualRow, snapshotRowCount, upsertManualRow, } from "./domain-snapshot.js";
import { visibleStateRows } from "./domain-entry-lifecycle.js";
import { createCustomTable, customFieldText, customizedFieldLabel, editableHeaderText, enabledTables, moveTableDefinition, normalizeTableRegistry, removeTableDefinition, restoreDefaultTableRegistry, tableColumnHeaders, tableByKey, updateTableDefinition, updateTableFields, updateTableHeaders, } from "./domain-table-registry.js";
import { buildRelationshipGraph, enrichRelationshipGraphWithEventProfiles, } from "./domain-graph.js";
import { listSupportedConnectionProfiles, testConnection } from "./llm-generator.js";
import { applyLorebookMaintenance, forceSummary, getArtifactAt, latestArtifact, latestSnapshotArtifact, previewLorebookMaintenance, processMessage, recalculateInvalidatedHistory, resetCurrentGame, chooseHistoryRecalculationStart, retryStage, subscribePipeline, } from "./pipeline-pipeline.js";
import { taskQueue } from "./pipeline-task-queue.js";
import { pendingSmallSummaries } from "./pipeline-summary.js";
import { largeSummarySystemPrompt, smallSummarySystemPrompt } from "./prompts-summary.js";
import { stateSystemPrompt } from "./prompts-state.js";
import { auditSystemPrompt } from "./prompts-audit.js";
import { revisionSystemPrompt } from "./prompts-revision.js";
import { getChatState, putArtifact, putChatState } from "./storage-repository.js";
import { diagnosticReport, runDiagnostics } from "./ui-diagnostics.js";
import { renderAllMessagePanels } from "./ui-message-panel.js";
import { abortActiveRequests, setRequestAcceptance } from "./core-requests.js";
import { readHistoryWorkflow } from "./workflow-history-workflow.js";
let selectedMessageIndex = null;
let rendering = false;
let renderAgain = false;
let queueUnsubscribe = null;
let pipelineUnsubscribe = null;
let workspaceRenderScheduled = false;
let workspaceRenderDeferred = false;
let selectedGraphNodeId = null;
let editorChatKey = null;
let editorMessageKey = null;
let savingRow = false;
let workspacePipelineActionPending = false;
let workspaceViewportBound = false;
let tableSearchQuery = "";
let graphSearchQuery = "";
let diagnosticPromptKind = "state";
function updateWorkspaceViewportHeight() {
    const height = Math.max(320, Math.round(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight));
    document.documentElement.style.setProperty("--ma11-viewport-height", `${height}px`);
}
function lockWorkspaceViewport() {
    document.documentElement.classList.add("ma11-workspace-open");
    document.body.classList.add("ma11-workspace-open");
    updateWorkspaceViewportHeight();
    if (workspaceViewportBound)
        return;
    workspaceViewportBound = true;
    window.addEventListener("resize", updateWorkspaceViewportHeight, { passive: true });
    window.visualViewport?.addEventListener("resize", updateWorkspaceViewportHeight, { passive: true });
}
function unlockWorkspaceViewport() {
    document.documentElement.classList.remove("ma11-workspace-open");
    document.body.classList.remove("ma11-workspace-open");
    if (!workspaceViewportBound)
        return;
    workspaceViewportBound = false;
    window.removeEventListener("resize", updateWorkspaceViewportHeight);
    window.visualViewport?.removeEventListener("resize", updateWorkspaceViewportHeight);
    document.documentElement.style.removeProperty("--ma11-viewport-height");
}
/** 单一映射同时供按钮渲染测试和点击处理使用，避免 UI 文案存在但后端动作接错。 */
export function resolveWorkspaceStageCommand(action) {
    const commands = {
        'run-audit': { kind: 'retry', stage: 'audit' },
        'run-revision': { kind: 'retry', stage: 'revision' },
        'run-state': { kind: 'retry', stage: 'state' },
        'force-small': { kind: 'summary', summary: 'small' },
        'force-large': { kind: 'summary', summary: 'large' },
    };
    return commands[action] ?? null;
}
function clampGraphZoom(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric))
        return 1;
    return Math.min(2.5, Math.max(0.5, Math.round(numeric * 20) / 20));
}
function ensureWorkspaceSubscriptions() {
    queueUnsubscribe ||= taskQueue.subscribe(handleQueueChange);
    pipelineUnsubscribe ||= subscribePipeline(() => handlePipelineChange());
}
const WORKSPACE_NAVIGATION = [
    { key: "overview", label: "总览", icon: "fa-gauge-high", description: "流程状态、最近任务与快捷操作" },
    { key: "tables", label: "表格", icon: "fa-table-cells-large", description: "查看角色、场景、事件、物品与地点记忆" },
    { key: "tableManager", label: "规则", icon: "fa-sliders", description: "状态表、小总结、大总结与表格字段规则" },
    { key: "summaries", label: "总结", icon: "fa-layer-group", description: "查看小总结与大总结" },
    { key: "graph", label: "记忆网络", icon: "fa-diagram-project", description: "融合事件画像与对象关系图谱" },
    { key: "audit", label: "审核", icon: "fa-shield-halved", description: "审核规则、修正策略与结果" },
    { key: "sync", label: "世界书", icon: "fa-book-atlas", description: "发布、清理与召回设置" },
    { key: "settings", label: "设置", icon: "fa-gears", description: "连接分配、自动化与维护" },
    { key: "diagnostics", label: "诊断", icon: "fa-stethoscope", description: "检查入口、模型、存储与同步" },
];
function workspaceTabMeta(tab) {
    const key = String(tab || "overview");
    const item = WORKSPACE_NAVIGATION.find((candidate) => candidate.key === key);
    if (item)
        return { key: item.key, label: item.label, description: item.description };
    return { key: "overview", label: "总览", description: "流程状态、最近任务与快捷操作" };
}
function workspaceNavigationHtml() {
    return WORKSPACE_NAVIGATION.map((item) => `
    <button type="button" role="tab" aria-selected="false" aria-controls="ma11-workspace-content" data-ma11-tab="${item.key}" title="${item.description}">
      <i class="ma11-nav-icon fa-solid ${item.icon}" aria-hidden="true"></i>
      <span>${item.label}</span>
    </button>`).join("");
}
function scrollActiveWorkspaceTabIntoView(workspace, key) {
    const tabs = workspace.querySelector("[data-ma11-scroll-tabs]");
    const active = workspace.querySelector(`[role="tab"][data-ma11-tab="${key}"]`);
    if (!tabs || !active)
        return;
    active.scrollIntoView({ block: "nearest", inline: "nearest" });
    window.requestAnimationFrame(() => {
        if (!tabs.isConnected || !active.isConnected)
            return;
        // Chromium 在小数 CSS 像素下可能仍把末端标签裁掉不足 1px；按最终布局边界留出 8px。
        const tabRect = tabs.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        if (activeRect.right > tabRect.right - 8)
            tabs.scrollLeft += activeRect.right - tabRect.right + 8;
        if (activeRect.left < tabRect.left + 8)
            tabs.scrollLeft -= tabRect.left - activeRect.left + 8;
    });
}
function root() {
    let element = document.querySelector("#ma11-workspace");
    if (element) {
        ensureWorkspaceSubscriptions();
        return element;
    }
    document.body.insertAdjacentHTML("beforeend", `
    <div id="ma11-workspace" class="ma11-workspace" hidden>
      <div class="ma11-shell" role="dialog" aria-modal="true" aria-label="镜渊控制中心">
        <section class="ma11-main">
          <header class="ma11-header">
            <div class="ma11-header-brand">
              <div class="ma11-brand-mark" aria-hidden="true">渊</div>
              <div class="ma11-header-brand-copy">
                <div class="ma11-brand">镜渊</div>
                <div class="ma11-subtitle">长期叙事记忆</div>
              </div>
            </div>
            <div class="ma11-header-actions">
              <span class="ma11-chat-status"><span aria-hidden="true"></span>当前聊天</span>
              <span class="ma11-version">${VERSION}</span>
              <button class="ma11-icon-button" type="button" data-ma11-action="close" aria-label="关闭镜渊">×</button>
            </div>
          </header>
          <nav class="ma11-tabs" role="tablist" aria-label="镜渊功能" data-ma11-scroll-tabs>${workspaceNavigationHtml()}</nav>
          <main id="ma11-workspace-content" class="ma11-content" role="tabpanel"></main>
          <div class="ma11-live-region" role="status" aria-live="polite" aria-atomic="true" data-ma11-live></div>
        </section>
      </div>
      <div class="ma11-editor-backdrop" hidden>
        <form class="ma11-editor" id="ma11-row-editor">
          <header><b>编辑对象条目</b><button type="button" data-ma11-action="close-editor">×</button></header>
          <input type="hidden" name="tableKey" />
          <input type="hidden" name="rowId" />
          <label>归属表格<select name="targetTableKey" aria-label="条目归属表格"></select><small>按对象本质选择；修改后会保留稳定 ID 并移动到目标表格。</small></label>
          <label><span data-ma11-row-field-label="title">对象</span><input name="title" required maxlength="240" /></label>
          <label><span data-ma11-row-field-label="content">当前事实</span><textarea name="content" rows="6" maxlength="12000"></textarea></label>
          <label><span data-ma11-row-field-label="status">状态</span><input name="status" maxlength="120" /></label>
          <label><span data-ma11-row-field-label="keywords">关键词（逗号分隔）</span><input name="keywords" maxlength="800" /></label>
          <label class="ma11-switch"><input type="checkbox" name="locked" /><span>完全锁定（基础和状态均不自动修改）</span></label>
          <p class="ma11-help">普通人工条目默认只保护基础内容；当前状态、关系和能力仍可依据明确事实更新。</p>
          <fieldset class="ma11-object-editor">
            <legend>对象分层内容</legend>
            <label>基础内容<textarea name="baseContent" rows="4" maxlength="12000" placeholder="稳定定义；后续总结不得改写"></textarea></label>
            <label>已固化历史（每行一项）<textarea name="solidifiedHistory" rows="3" maxlength="8000"></textarea></label>
            <label>当前状态（每行一项）<textarea name="currentStates" rows="4" maxlength="8000"></textarea></label>
            <label>关联对象（每行一项）<textarea name="relatedObjects" rows="3" maxlength="4000"></textarea></label>
            <label>关联事件（每行一项）<textarea name="relatedEvents" rows="3" maxlength="4000"></textarea></label>
          </fieldset>
          <fieldset class="ma11-character-object-editor" data-ma11-character-object-fields hidden>
            <legend>角色可变信息</legend>
            <label>关系状态（每行一项）<textarea name="relationshipStates" rows="3" maxlength="6000"></textarea></label>
            <label>能力状态（每行一项）<textarea name="abilityStates" rows="3" maxlength="6000"></textarea></label>
          </fieldset>
          <fieldset class="ma11-lifecycle-editor" data-ma11-lifecycle-fields hidden>
            <legend>人物生命周期</legend>
            <div class="ma11-editor-grid">
              <label>存在状态<select name="existence">
                ${["存活", "死亡已确认", "存在未知", "失踪", "身份存疑", "虚构或误认已确认", "存在被抹除", "未标注"].map((value) => `<option value="${value}">${value}</option>`).join("")}
              </select></label>
              <label>活跃状态<select name="activity">
                ${["当前在场", "当前相关", "离场但仍活跃", "休眠", "长期休眠", "已归档", "未标注"].map((value) => `<option value="${value}">${value}</option>`).join("")}
              </select></label>
              <label>记忆状态<select name="memory">
                ${["广泛记得", "部分人物记得", "仅记录留存", "仅痕迹留存", "无人可确认记得", "记忆被篡改", "记忆被抹除", "未标注"].map((value) => `<option value="${value}">${value}</option>`).join("")}
              </select></label>
              <label>证据等级<select name="evidenceLevel">
                ${["已确认", "可靠记录", "多方陈述", "单方陈述", "推测", "未知"].map((value) => `<option value="${value}">${value}</option>`).join("")}
              </select></label>
            </div>
            <label>判断依据<textarea name="evidence" rows="3" maxlength="4000"></textarea></label>
            <label>可能回流条件（每行一项）<textarea name="returnConditions" rows="3" maxlength="3000"></textarea></label>
            <label>阻止回流条件（每行一项）<textarea name="returnBlockers" rows="3" maxlength="3000"></textarea></label>
          </fieldset>
          <footer><button type="button" data-ma11-action="close-editor">取消</button><button type="submit">保存</button></footer>
        </form>
      </div>
    </div>`);
    element = document.querySelector("#ma11-workspace");
    bindWorkspace(element);
    ensureWorkspaceSubscriptions();
    return element;
}
function currentArtifact() {
    if (selectedMessageIndex !== null) {
        const artifact = getArtifactAt(selectedMessageIndex);
        if (artifact)
            return { index: selectedMessageIndex, artifact };
        return null;
    }
    return latestArtifact();
}
/** 当前工作区是否已有业务链在排队或执行。工作区动作不得在该状态下重复提交。 */
export function workspacePipelineBusy(artifactInfo = currentArtifact()) {
    const artifact = artifactInfo?.artifact;
    const chatKey = artifact?.chatKey || currentChatKey();
    const liveTasks = taskQueue.list().filter((task) => Boolean((task.state === "queued" || task.state === "running")
        && (!task.chatKey || task.chatKey === chatKey)
        && (!artifact || !task.messageKey || task.messageKey === artifact.messageKey)));
    const queueBusy = liveTasks.length > 0;
    const stageBusy = Boolean(artifact && Object.entries(artifact.stages).some(([stageName, stage]) => {
        if (stage.status !== "queued" && stage.status !== "running")
            return false;
        // summary/sync 的 queued/running 只代表运行时；真实队列已无对应任务时不能形成永久 UI 锁。
        if (stageName === "summary")
            return liveTasks.some((task) => ["smallSummary", "largeSummary"].includes(String(task.kind)));
        if (stageName === "sync")
            return liveTasks.some((task) => String(task.kind) === "sync");
        return true;
    }));
    return workspacePipelineActionPending || stageBusy || queueBusy;
}
function workspaceHasFocusedEditor(workspace) {
    const active = document.activeElement;
    return Boolean(workspace.contains(active) && active?.matches("input, textarea, select, [contenteditable='true']"));
}
function workspaceHasUnsavedSurface(workspace) {
    const editor = workspace.querySelector(".ma11-editor-backdrop");
    return editor?.hidden === false || getSettings().ui.activeTab === "tableManager";
}
function scheduleWorkspaceRender() {
    const workspace = document.querySelector("#ma11-workspace");
    if (!workspace || workspace.hidden)
        return;
    if (workspaceHasFocusedEditor(workspace) || workspaceHasUnsavedSurface(workspace)) {
        workspaceRenderDeferred = true;
        return;
    }
    if (workspaceRenderScheduled)
        return;
    workspaceRenderScheduled = true;
    queueMicrotask(() => {
        workspaceRenderScheduled = false;
        void renderWorkspace();
    });
}
function handlePipelineChange() {
    refreshTaskList();
    scheduleWorkspaceRender();
}
function statusText(value) {
    const map = {
        idle: "等待",
        queued: "排队",
        running: "处理中",
        success: "成功",
        failed: "失败",
        cancelled: "已取消",
        skipped: "跳过",
        blocked: "阻断",
    };
    return map[value] || value;
}
function statusClass(value) {
    if (value === "success" || value === "skipped")
        return "success";
    if (value === "failed" || value === "blocked")
        return "danger";
    if (value === "cancelled")
        return "neutral";
    if (value === "running" || value === "queued")
        return "working";
    return "neutral";
}
function workflowState(artifact) {
    if (!artifact)
        return { label: "尚未整理", detail: "生成一条 AI 正文后会自动开始", tone: "neutral", completed: 0, total: 5 };
    const stages = [artifact.stages.audit, artifact.stages.revision, artifact.stages.state, artifact.stages.summary, artifact.stages.sync];
    const failed = stages.find((stage) => ["failed", "blocked"].includes(stage.status));
    const running = stages.find((stage) => ["queued", "running"].includes(stage.status));
    const completed = stages.filter((stage) => ["success", "skipped"].includes(stage.status)).length;
    if (failed)
        return { label: "需要处理", detail: failed.error || "某个阶段未完成", tone: "danger", completed, total: 5 };
    if (running)
        return { label: "自动处理中", detail: "流程会按顺序继续", tone: "working", completed, total: 5 };
    if (artifact.stages.state.status === "success"
        && ["success", "skipped"].includes(artifact.stages.summary.status)
        && ["success", "skipped"].includes(artifact.stages.sync.status)) {
        return { label: "本轮已完成", detail: "状态、总结与世界书已更新", tone: "success", completed, total: 5 };
    }
    return { label: "等待继续", detail: "将从第一个未完成阶段继续", tone: "neutral", completed, total: 5 };
}
function stageStripHtml(artifact) {
    const stages = artifact?.stages;
    const rows = [
        ["audit", "审核"],
        ["revision", "修正"],
        ["state", "表格"],
        ["summary", "总结"],
        ["sync", "世界书"],
    ];
    return `<div class="ma11-stage-strip">${rows
        .map(([key, label]) => {
        const stage = stages?.[key] ?? { status: "idle", attempts: 0 };
        return `<div class="ma11-stage-step ${statusClass(stage.status)}" title="${stage.error ? escapeHtml(stage.error) : `${label}：${statusText(stage.status)}`}">
        <span aria-hidden="true"></span><b>${label}</b><small>${statusText(stage.status)}</small>
      </div>`;
    })
        .join("")}</div>`;
}
function stageActionButtonsHtml(artifactInfo) {
    const settings = getSettings();
    const latestIndex = latestAssistantIndex();
    const isLatestText = artifactInfo
        ? artifactInfo.index === latestIndex
        : selectedMessageIndex === null && latestIndex >= 0;
    const artifact = artifactInfo?.artifact;
    const latestSnapshot = latestSnapshotArtifact();
    const busy = workspacePipelineBusy(artifactInfo);
    const canAudit = Boolean(settings.enabled && !busy && settings.hostControl.enabled && settings.auditEnabled && settings.auditPrompt.trim() && isLatestText);
    const canRevise = Boolean(settings.enabled
        && !busy
        && isLatestText
        && artifact?.audit
        && !artifact.audit.passed
        && artifact.audit.decision !== 'block');
    const canState = Boolean(settings.enabled
        && !busy
        && isLatestText
        && (!settings.hostControl.enabled || !settings.auditEnabled || artifact?.audit?.passed));
    const canSummarize = Boolean(settings.enabled
        && !busy
        && latestSnapshot
        && artifactInfo?.artifact.messageKey === latestSnapshot.artifact.messageKey);
    return `<div class="ma11-actions ma11-stage-actions">
    <button data-ma11-action="run-audit" ${canAudit ? '' : 'disabled'}>审核正文</button>
    <button data-ma11-action="run-revision" ${canRevise ? '' : 'disabled'}>定向修正</button>
    <button data-ma11-action="run-state" ${canState ? '' : 'disabled'}>生成表格</button>
    <button data-ma11-action="force-small" ${canSummarize ? '' : 'disabled'}>小总结</button>
    <button data-ma11-action="force-large" ${canSummarize ? '' : 'disabled'}>大总结</button>
  </div>`;
}
function recentTasksHtml() {
    const chatKey = currentChatKey();
    const jobs = taskQueue.list()
        .filter((task) => !task.chatKey || task.chatKey === chatKey)
        .slice(0, 5);
    return {
        count: jobs.length,
        html: jobs.length
            ? jobs.map((task) => {
                const timing = [
                    Number.isFinite(task.queueWaitMs) ? `排队 ${task.queueWaitMs}ms` : "",
                    Number.isFinite(task.runMs) ? `执行 ${task.runMs}ms` : "",
                ].filter(Boolean).join(" · ");
                return `<div><span>${escapeHtml(task.label)}${timing ? `<small>${escapeHtml(timing)}</small>` : ""}</span><em class="${task.state}">${escapeHtml(statusText(task.state))}</em></div>`;
            }).join("")
            : '<p class="ma11-empty">暂无最近任务。</p>',
    };
}
function refreshTaskList() {
    const workspace = document.querySelector("#ma11-workspace");
    const list = workspace?.querySelector("[data-ma11-task-list]");
    const count = workspace?.querySelector("[data-ma11-task-count]");
    if (!list || !count)
        return;
    const tasks = recentTasksHtml();
    count.textContent = tasks.count ? `${tasks.count} 条最近任务` : "空闲";
    list.innerHTML = tasks.html;
}
function handleQueueChange() {
    refreshTaskList();
    scheduleWorkspaceRender();
}
function historyRecoveryHtml(chatState, busy = false) {
    const workflow = readHistoryWorkflow(chatState);
    const recovery = workflow.recovery;
    if (!recovery)
        return "";
    const pauseError = workflow.pauseError;
    const current = Number.isInteger(recovery.currentIndex) ? `第 ${recovery.currentIndex + 1} 条消息` : "当前历史";
    const progress = recovery.totalCount ? `${recovery.completedCount ?? 0}/${recovery.totalCount}` : "检查中";
    if (recovery.phase === "failed") {
        const failedDetail = `${recovery.error || "状态提取失败"}${pauseError ? `；旧世界书条目暂停失败：${pauseError}` : ""}`;
        return `<section class="ma11-card ma11-history-warning"><header><b>历史重建未完成</b><span>${escapeHtml(current)}</span></header><p>${escapeHtml(failedDetail)}</p><div class="ma11-actions"><button data-ma11-action="recalculate-history" ${busy ? "disabled" : ""}>从失败位置继续</button></div></section>`;
    }
    const labels = {
        "rebuilding-core": "正在重建核心状态",
        "rebuilding-derived": "正在恢复总结",
        "publishing-lorebook": "正在发布世界书",
        partial: "核心状态已恢复，派生恢复不完整",
    };
    const detail = pauseError
        ? `旧世界书条目暂停失败：${pauseError}`
        : recovery.phase === "partial" ? (recovery.error || "请重试未完成的派生阶段") : current;
    return `<section class="ma11-card ma11-history-warning"><header><b>${escapeHtml(labels[recovery.phase] || "正在恢复历史")}</b><span>${escapeHtml(progress)}</span></header><p>${escapeHtml(detail)}</p></section>`;
}
function promptSettingsAreStandard() {
    const settings = getSettings();
    return JSON.stringify(settings.statePrompts) === JSON.stringify(DEFAULT_STATE_PROMPTS)
        && JSON.stringify(settings.summaryPrompts) === JSON.stringify(DEFAULT_SUMMARY_PROMPTS);
}
function setupReadinessHtml(artifact, chatState) {
    const settings = getSettings();
    const enabledCount = enabledTables(settings.tableRegistry).length;
    const checks = [
        { ok: settings.enabled, label: "插件已启用", action: "settings" },
        { ok: settings.autoState, label: "自动整理已开启", action: "settings" },
        { ok: enabledCount > 0, label: `${enabledCount} 个记忆视图可用`, action: "tableManager" },
        { ok: promptSettingsAreStandard(), label: "标准规则未被改写", action: "tableManager" },
        { ok: Boolean(artifact?.snapshot), label: "当前聊天已有记忆快照", action: "tables" },
        { ok: settings.lorebookSync && !readHistoryWorkflow(chatState).blocked, label: "世界书同步可用", action: "sync" },
    ];
    const completed = checks.filter((item) => item.ok).length;
    const percent = Math.round((completed / checks.length) * 100);
    return `<section class="ma11-card ma11-readiness-card">
    <header><div><b>开箱检查</b><span>不需要理解内部协议，按未完成项处理即可</span></div><strong>${completed}/${checks.length}</strong></header>
    <div class="ma11-progress-track" aria-label="开箱检查完成度 ${percent}%"><span style="width:${percent}%"></span></div>
    <div class="ma11-readiness-grid">${checks.map((item) => `<button class="${item.ok ? "ready" : "pending"}" data-ma11-tab="${item.action}"><i class="fa-solid ${item.ok ? "fa-check" : "fa-arrow-right"}" aria-hidden="true"></i><span>${escapeHtml(item.label)}</span></button>`).join("")}</div>
  </section>`;
}
async function overviewHtml(artifactInfo) {
    const enabled = getSettings().enabled;
    const artifact = artifactInfo?.artifact;
    const chatState = await getChatState(currentChatKey());
    const historyWorkflow = readHistoryWorkflow(chatState);
    const rows = snapshotRowCount(artifact?.snapshot, getSettings().tableRegistry, true);
    const tasks = recentTasksHtml();
    const busy = workspacePipelineBusy(artifactInfo);
    const flow = workflowState(artifact);
    const syncText = chatState.lastSyncAt
        ? `世界书 ${new Date(chatState.lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "世界书未同步";
    return `
    ${historyRecoveryHtml(chatState, busy) || (historyWorkflow.invalidation ? (historyWorkflow.automatic ? `<section class="ma11-card ma11-history-warning"><header><b>最新正文正在自动恢复</b><span>世界书暂缓同步</span></header><p>检测到最新正文发生编辑或换页。镜渊会复用仍有效的审核结果，并从第一个失效阶段继续。</p></section>` : `<section class="ma11-card ma11-history-warning"><header><b>较早历史需要重算</b><span>世界书同步已暂停</span></header><p>${historyWorkflow.startIndex === undefined ? "检测到历史删除，但无法自动判断删除位置。" : `第 ${historyWorkflow.startIndex + 1} 条消息发生了${historyWorkflow.invalidation.reason === "edited" ? "编辑" : historyWorkflow.invalidation.reason === "swiped" ? "换页" : "删除"}。`}</p><div class="ma11-actions"><button data-ma11-action="recalculate-history" ${busy ? "disabled" : ""}>${historyWorkflow.startIndex === undefined ? "选择起点并重算" : "继续重建"}</button></div></section>`) : "")}
    <section class="ma11-dashboard-status ${flow.tone}">
      <div class="ma11-dashboard-status-icon" aria-hidden="true"><i class="fa-solid ${flow.tone === "success" ? "fa-check" : flow.tone === "danger" ? "fa-triangle-exclamation" : flow.tone === "working" ? "fa-spinner" : "fa-circle"}"></i></div>
      <div class="ma11-dashboard-status-copy">
        <small>当前流程</small>
        <h2>${escapeHtml(flow.label)}</h2>
        <p>${escapeHtml(flow.detail)}</p>
        <div class="ma11-dashboard-meta"><span>${artifact ? `第 ${artifact.messageIndex + 1} 条正文` : "当前聊天"}</span><span>${rows} 个对象</span><span>${escapeHtml(syncText)}</span></div>
      </div>
      <button data-ma11-action="process-latest" ${enabled && latestAssistantIndex() >= 0 && !busy ? "" : "disabled"}>${artifact ? "重新整理" : "整理最新正文"}</button>
    </section>
    ${setupReadinessHtml(artifact, chatState)}
    <section class="ma11-card ma11-progress-card">
      <header><b>处理进度</b><span>${flow.completed}/${flow.total}</span></header>
      <div class="ma11-progress-track" aria-label="处理进度 ${Math.round((flow.completed / flow.total) * 100)}%"><span style="width:${Math.round((flow.completed / flow.total) * 100)}%"></span></div>
      ${stageStripHtml(artifact)}
    </section>
    <nav class="ma11-dashboard-links" aria-label="常用功能">
      <button data-ma11-action="open-tables" ${artifact?.snapshot ? "" : "disabled"}><i class="fa-solid fa-table-cells-large" aria-hidden="true"></i><span><b>表格</b><small>查看状态表</small></span></button>
      <button data-ma11-tab="summaries" ${artifact?.snapshot ? "" : "disabled"}><i class="fa-solid fa-layer-group" aria-hidden="true"></i><span><b>总结</b><small>近期与长期</small></span></button>
      <button data-ma11-tab="sync" ${artifact?.snapshot ? "" : "disabled"}><i class="fa-solid fa-book-atlas" aria-hidden="true"></i><span><b>世界书</b><small>发布与召回</small></span></button>
    </nav>
    <section class="ma11-card ma11-task-card">
      <header><b>任务</b><span data-ma11-task-count>${tasks.count ? `${tasks.count} 条最近任务` : "当前空闲"}</span></header>
      <div class="ma11-task-list" data-ma11-task-list>${tasks.html}</div>
    </section>`;
}
function lifecycleHtml(row) {
    const life = row.lifecycle;
    if (!life)
        return "";
    const chips = [
        ["存在", life.existence],
        ["活跃", life.activity],
        ["记忆", life.memory],
        ["证据", life.evidenceLevel],
    ].map(([label, value]) => `<span class="ma11-life-chip"><small>${label}</small>${escapeHtml(value)}</span>`).join("");
    const conditions = [
        life.returnConditions.length ? `<p><b>回流：</b>${escapeHtml(life.returnConditions.join("；"))}</p>` : "",
        life.returnBlockers.length ? `<p><b>阻止：</b>${escapeHtml(life.returnBlockers.join("；"))}</p>` : "",
    ].join("");
    return `<div class="ma11-lifecycle-inline">${chips}${conditions}</div>`;
}
function rowCustomFieldsHtml(row, table) {
    if (!table || !row.fields)
        return "";
    const lines = table.fields.filter((field) => field.key in (row.fields ?? {})).map((field) => {
        const raw = row.fields?.[field.key];
        const value = Array.isArray(raw) ? raw.join("、") : String(raw ?? "");
        return value.trim() ? `<div><small>${escapeHtml(field.label)}</small>${escapeHtml(value)}</div>` : "";
    }).filter(Boolean);
    return lines.length ? `<div class="ma11-custom-fields">${lines.join("")}</div>` : "";
}
function searchableRowText(row) {
    return [
        row.title,
        row.content,
        row.status,
        ...(row.keywords ?? []),
        ...Object.values(row.fields ?? {}).flatMap((value) => Array.isArray(value) ? value.map(String) : [String(value ?? "")]),
    ].join(" ").toLocaleLowerCase();
}
async function tableHtml(artifactInfo) {
    const settings = getSettings();
    const registry = normalizeTableRegistry(settings.tableRegistry);
    const visibleTables = enabledTables(registry);
    const artifact = artifactInfo?.artifact;
    const latest = latestSnapshotArtifact();
    const chatState = await getChatState(currentChatKey());
    const focusObjectId = chatState.focusObjectId || '';
    const busy = workspacePipelineBusy(artifactInfo);
    const editable = Boolean(settings.enabled && !busy && artifactInfo && latest && latest.artifact.messageKey === artifactInfo.artifact.messageKey);
    if (!visibleTables.length) {
        return `<section class="ma11-empty-panel"><h2>没有启用的可见表格</h2><p>内部事实层仍会保存事件线和总结消费状态。请在“表格管理”中启用或新增视图。</p><button data-ma11-action="open-table-manager">打开表格管理</button></section>`;
    }
    let active = settings.ui.activeTable;
    let activeDefinition = visibleTables.find((table) => table.key === active);
    if (!activeDefinition) {
        activeDefinition = visibleTables[0];
        active = activeDefinition.key;
        settings.ui.activeTable = active;
    }
    const rows = visibleStateRows(artifact?.snapshot?.[active]);
    const columnHeaders = tableColumnHeaders(activeDefinition);
    const mobileCards = artifact?.snapshot ? (rows.length ? rows.map((row, index) => {
        const searchText = searchableRowText(row);
        const hidden = tableSearchQuery && !searchText.includes(tableSearchQuery.toLocaleLowerCase());
        const visibleFields = activeDefinition.fields.filter((field) => {
            const value = row.fields?.[field.key];
            return Array.isArray(value) ? value.length > 0 : String(value ?? '').trim();
        }).slice(0, 6);
        const fieldHtml = visibleFields.map((field) => {
            const raw = row.fields?.[field.key];
            const value = Array.isArray(raw) ? raw.join('；') : String(raw ?? '');
            return `<div class="ma11-mobile-field"><small>${escapeHtml(field.label)}</small><span>${escapeHtml(value)}</span></div>`;
        }).join('');
        const focusButton = ['characters', 'state'].includes(activeDefinition.role)
            ? (row.id === focusObjectId
                ? `<button data-ma11-action="clear-focus" data-ma11-focus-row="${escapeHtml(row.id)}" ${editable ? '' : 'disabled'}>取消焦点</button>`
                : `<button data-ma11-action="set-focus" data-ma11-focus-row="${escapeHtml(row.id)}" ${editable ? '' : 'disabled'}>设为焦点</button>`)
            : '';
        return `<article class="ma11-mobile-row-card" data-ma11-table-card-search="${escapeHtml(searchText)}" ${hidden ? 'hidden' : ''}>
      <header><span class="ma11-mobile-row-index">${index + 1}</span><div><b>${escapeHtml(row.title)}</b>${row.id === focusObjectId ? '<span class="ma11-badge">常驻焦点</span>' : ''}</div><span class="ma11-source ${row.source}">${row.locked ? '完全锁定' : row.source === 'manual' ? '人工基础' : '自动'}</span></header>
      ${row.content ? `<p class="ma11-mobile-row-summary">${escapeHtml(row.content)}</p>` : ''}
      ${row.status ? `<div class="ma11-mobile-row-status">${escapeHtml(row.status)}</div>` : ''}
      ${fieldHtml ? `<div class="ma11-mobile-row-fields">${fieldHtml}</div>` : ''}
      <footer><time>${escapeHtml(new Date(row.updatedAt).toLocaleString())}</time><div class="ma11-row-actions">${focusButton}<button data-ma11-edit-row="${escapeHtml(row.id)}" ${editable ? '' : 'disabled'}>编辑</button><button class="danger" data-ma11-delete-row="${escapeHtml(row.id)}" ${editable ? '' : 'disabled'}>删除</button></div></footer>
    </article>`;
    }).join('') : '<div class="ma11-empty-panel">该视图暂无记录。</div>') : '<div class="ma11-empty-panel">尚无状态表。点击“整理最新正文”。</div>';
    return `
    <section class="ma11-toolbar ma11-table-toolbar">
      <div>
        <div class="ma11-table-heading"><h2>记忆表格</h2><p>状态表记录当前事实，小总结写入近期经历，大总结写入历史事实。</p></div>
        <div class="ma11-table-tabs">${visibleTables.map((table) => `<button class="${table.key === active ? "active" : ""}" data-ma11-table="${escapeHtml(table.key)}">${escapeHtml(table.name)} <span>${visibleStateRows(artifact?.snapshot?.[table.key]).length}</span></button>`).join("")}</div>
        <p class="ma11-table-purpose"><b>${escapeHtml(activeDefinition.name)}</b>：${escapeHtml(activeDefinition.purpose)}</p>
      </div>
      <div class="ma11-table-tools">
        <label class="ma11-search-field"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input data-ma11-table-search value="${escapeHtml(tableSearchQuery)}" placeholder="搜索当前表格" aria-label="搜索当前表格"/><output data-ma11-table-visible-count>${rows.length} / ${rows.length}</output></label>
        <div class="ma11-actions"><button data-ma11-action="add-row" ${editable ? "" : "disabled"}>＋ 添加</button><button data-ma11-action="run-state" ${settings.enabled && !busy && artifactInfo?.index === latestAssistantIndex() && (!settings.hostControl.enabled || !settings.auditEnabled || artifact?.audit?.passed) ? "" : "disabled"}>生成/更新</button><button data-ma11-action="open-table-manager">规则与字段</button></div>
      </div>
    </section>
    <section class="ma11-memory-layer-map" aria-label="表格与总结写入关系">
      <div><span>01</span><b>状态表</b><small>当前摘要、现行事实、当前状态</small></div>
      <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
      <div><span>02</span><b>小总结</b><small>归并到“近期经历”</small></div>
      <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
      <div><span>03</span><b>大总结</b><small>固化到“历史事实”</small></div>
    </section>
    <p class="ma11-table-hint">只显示启用视图。手机端使用对象卡片，只展示当前必要信息；完整内容通过编辑器查看和修改。</p>
    <section class="ma11-table-wrap" role="region" aria-label="${escapeHtml(activeDefinition.name)}状态表" tabindex="0">
      ${artifact?.snapshot ? `<table class="ma11-table">
        <colgroup><col class="ma11-col-index"/><col class="ma11-col-title"/><col class="ma11-col-content"/><col class="ma11-col-state"/><col class="ma11-col-meta"/><col class="ma11-col-actions"/></colgroup>
        <thead><tr><th>序号</th><th>${escapeHtml(columnHeaders.title)}</th><th>${escapeHtml(columnHeaders.content)}</th><th>${escapeHtml(columnHeaders.state)}</th><th>来源与更新时间</th><th>操作</th></tr></thead>
        <tbody>${rows.length ? rows.map((row, index) => {
        const searchText = searchableRowText(row);
        const hidden = tableSearchQuery && !searchText.includes(tableSearchQuery.toLocaleLowerCase());
        return `<tr data-ma11-table-row-search="${escapeHtml(searchText)}" ${hidden ? "hidden" : ""}>
          <td data-label="序号">${index + 1}</td>
          <td class="ma11-cell-title" data-label="${escapeHtml(columnHeaders.title)}"><b>${escapeHtml(row.title)}</b>${row.id === focusObjectId ? `<span class="ma11-badge">常驻焦点</span>` : ""}</td>
          <td class="ma11-cell-content" data-label="${escapeHtml(columnHeaders.content)}">${escapeHtml(row.content)}${rowCustomFieldsHtml(row, activeDefinition)}</td>
          <td data-label="${escapeHtml(columnHeaders.state)}"><div class="ma11-cell-status">${row.status ? `<span class="ma11-status-text">${escapeHtml(row.status)}</span>` : ""}${lifecycleHtml(row)}<div class="ma11-keyword-list">${row.keywords.map((word) => `<span class="ma11-keyword">${escapeHtml(word)}</span>`).join("")}</div></div></td>
          <td data-label="来源与更新时间"><div class="ma11-cell-meta"><span class="ma11-source ${row.source}">${row.locked ? "完全锁定" : row.source === "manual" ? "人工基础" : "自动"}</span><time>${escapeHtml(new Date(row.updatedAt).toLocaleString())}</time></div></td>
          <td data-label="操作"><div class="ma11-row-actions">${['characters', 'state'].includes(activeDefinition.role) ? (row.id === focusObjectId ? `<button data-ma11-action="clear-focus" data-ma11-focus-row="${escapeHtml(row.id)}" ${editable ? "" : "disabled"}>取消焦点</button>` : `<button data-ma11-action="set-focus" data-ma11-focus-row="${escapeHtml(row.id)}" ${editable ? "" : "disabled"}>设为焦点</button>`) : ""}<button data-ma11-edit-row="${escapeHtml(row.id)}" ${editable ? "" : "disabled"}>编辑</button><button class="danger" data-ma11-delete-row="${escapeHtml(row.id)}" ${editable ? "" : "disabled"}>删除</button></div></td>
        </tr>`;
    }).join("") : `<tr class="ma11-empty-row"><td colspan="6" class="ma11-empty">该视图暂无记录。</td></tr>`}</tbody>
      </table>` : '<div class="ma11-empty-panel">尚无状态表。点击“整理最新正文”。</div>'}
      <div class="ma11-mobile-table-cards">${mobileCards}</div>
    </section>`;
}
function statePromptEditorHtml(registry) {
    const settings = getSettings();
    const prompt = settings.statePrompts;
    return `<section class="ma11-card ma11-form-card ma11-rule-card" id="ma11-rule-state">
    <header><div><b>状态表规则</b><span>决定谁能进入表格、进入哪张表、哪些事实可信以及已有记录如何更新</span></div><span class="ma11-badge ${JSON.stringify(prompt) === JSON.stringify(DEFAULT_STATE_PROMPTS) ? "success" : "working"}">${JSON.stringify(prompt) === JSON.stringify(DEFAULT_STATE_PROMPTS) ? "标准" : "已自定义"}</span></header>
    <div class="ma11-guidance-banner"><i class="fa-solid fa-filter-circle-xmark" aria-hidden="true"></i><div><b>默认采用严格准入</b><p>姓名、服装、外貌、一句台词或短暂出场都不足以建档；真正改变因果或形成持续关系后再升级为正式对象。</p></div></div>
    <div class="ma11-rule-grid">
      <label>允许建档条件 <small>描述对象何时具有长期记录价值。</small><textarea rows="8" data-ma11-state-prompt="admissionRules">${escapeHtml(prompt.admissionRules)}</textarea></label>
      <label>默认排除条件 <small>命中这些情况时默认不新建条目。</small><textarea rows="8" data-ma11-state-prompt="exclusionRules">${escapeHtml(prompt.exclusionRules)}</textarea></label>
      <label>类型与表格分流 <small>决定人物、地点、全局变化和基础设定分别进入哪张表。</small><textarea rows="10" data-ma11-state-prompt="routingRules">${escapeHtml(prompt.routingRules)}</textarea></label>
      <label>证据与不确定性 <small>决定传闻、冲突和身份不清时如何处理。</small><textarea rows="8" data-ma11-state-prompt="evidenceRules">${escapeHtml(prompt.evidenceRules)}</textarea></label>
      <label>更新与冲突处理 <small>决定何时修改旧记录、关闭未决和建立关系。</small><textarea rows="8" data-ma11-state-prompt="updateRules">${escapeHtml(prompt.updateRules)}</textarea></label>
    </div>
    <div class="ma11-actions">
      <button data-ma11-action="save-state-prompt">保存状态表规则</button>
      <button data-ma11-action="restore-state-prompt">恢复标准规则</button>
    </div>
    <p class="ma11-help">模型只负责判断和填写自然语言内容；对象身份、稳定 ID、合并去重、历史保留和固定传输格式仍由插件维护。</p>
  </section>`;
}
function tableManagerHtml(artifactInfo) {
    const settings = getSettings();
    const registry = normalizeTableRegistry(settings.tableRegistry);
    const snapshot = artifactInfo?.artifact.snapshot;
    const rows = registry.map((table, index) => {
        const fields = customFieldText(table);
        const headers = editableHeaderText(table);
        return `<article class="ma11-table-manager-row" data-ma11-table-card="${escapeHtml(table.key)}">
      <div class="ma11-table-manager-head">
        <span class="ma11-order-number">${index + 1}</span>
        <label class="ma11-switch"><input type="checkbox" data-ma11-table-enabled="${escapeHtml(table.key)}" ${table.enabled ? "checked" : ""}/><span>${table.enabled ? "启用" : "停用"}</span></label>
        <span class="ma11-badge">${table.isDefault ? "默认视图" : "自定义视图"}</span>
        <span>${visibleStateRows(snapshot?.[table.key]).length} 行</span>
      </div>
      <div class="ma11-table-manager-fields">
        <label>名称<input data-ma11-table-name="${escapeHtml(table.key)}" value="${escapeHtml(table.name)}" maxlength="80" /></label>
        <label>用途说明<textarea data-ma11-table-purpose="${escapeHtml(table.key)}" rows="3" maxlength="1000">${escapeHtml(table.purpose)}</textarea></label>
        <label class="ma11-table-header-editor">基础表头 <small>每行：表头名称｜记录要求。内部字段身份由插件维护。</small><textarea data-ma11-table-headers="${escapeHtml(table.key)}" rows="6">${escapeHtml(headers)}</textarea></label>
        <label>附加表头 <small>每行：表头名称｜记录要求。调整行序即可调整表头顺序。</small><textarea data-ma11-table-fields="${escapeHtml(table.key)}" rows="3" placeholder="战斗风格｜记录长期稳定的战斗方式和武器偏好">${escapeHtml(fields)}</textarea></label>
      </div>
      <div class="ma11-actions ma11-table-manager-actions">
        <button data-ma11-action="save-table" data-ma11-table-key="${escapeHtml(table.key)}">保存修改</button>
        <button data-ma11-action="move-table-up" data-ma11-table-key="${escapeHtml(table.key)}" ${index === 0 ? "disabled" : ""}>上移</button>
        <button data-ma11-action="move-table-down" data-ma11-table-key="${escapeHtml(table.key)}" ${index === registry.length - 1 ? "disabled" : ""}>下移</button>
        <button class="danger" data-ma11-action="delete-table" data-ma11-table-key="${escapeHtml(table.key)}">删除视图</button>
      </div>
      <p class="ma11-help">全局表格定义，适用于所有聊天。名称、用途、语义表头与字段说明会进入下一次状态提取提示词；改名不会破坏已有数据或对象身份。</p>
    </article>`;
    }).join("");
    const standard = promptSettingsAreStandard();
    return `<section class="ma11-toolbar ma11-rules-toolbar"><div><h2>记忆规则与表格</h2><p>按“状态表 → 小总结 → 大总结 → 表格字段”的顺序配置；普通使用保留标准值即可。</p></div><div class="ma11-actions"><button data-ma11-action="restore-standard-rules">应用标准规则</button><button data-ma11-action="open-prompt-diagnostics">查看调试预览</button></div></section>
    <section class="ma11-card ma11-standard-card ${standard ? "is-standard" : "is-custom"}">
      <div><span class="ma11-standard-orb" aria-hidden="true"><i class="fa-solid ${standard ? "fa-check" : "fa-pen"}"></i></span><div><b>${standard ? "当前使用标准记忆规则" : "当前包含自定义规则"}</b><p>${standard ? "可直接使用；背景板 NPC、传闻、不确定身份和重复信息均采用保守写入。" : "自定义会从下一次对应任务开始生效；随时可恢复标准规则。"}</p></div></div>
      <nav class="ma11-rule-jump" aria-label="规则页面导航"><a href="#ma11-rule-state">状态表</a><a href="#ma11-rule-small">小总结</a><a href="#ma11-rule-large">大总结</a><a href="#ma11-rule-tables">表格字段</a></nav>
    </section>
    <section class="ma11-memory-rule-flow" aria-label="记忆规则流程">
      <a href="#ma11-rule-state"><span>01</span><b>状态表规则</b><small>筛选对象并更新当前事实</small></a>
      <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      <a href="#ma11-rule-small"><span>02</span><b>小总结规则</b><small>整理近期经历</small></a>
      <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      <a href="#ma11-rule-large"><span>03</span><b>大总结规则</b><small>固化历史事实</small></a>
      <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      <a href="#ma11-rule-tables"><span>04</span><b>表格字段</b><small>决定各层写到哪里</small></a>
    </section>
    ${statePromptEditorHtml(registry)}
    <section class="ma11-summary-prompt-grid">${summaryPromptEditorHtml('small')}${summaryPromptEditorHtml('large')}</section>
    <section class="ma11-card ma11-form-card ma11-new-table">
      <header><b>新增自定义表格</b><span>新增后自动进入下一次状态文本协议</span></header>
      <label>名称<input data-ma11-new-table-name maxlength="80" placeholder="例如：组织状态" /></label>
      <label>用途说明<textarea data-ma11-new-table-purpose rows="3" maxlength="1000" placeholder="说明只应记录什么，以及不应记录什么。"></textarea></label>
      <label>附加表头 <small>可留空；每行：表头名称｜记录要求</small><textarea data-ma11-new-table-fields rows="3" placeholder="组织层级｜记录已经明确的组织层级"></textarea></label>
      <div class="ma11-actions"><button data-ma11-action="create-table">新增表格</button></div>
    </section>
    <section class="ma11-section-heading" id="ma11-rule-tables"><div><span>04</span><div><h3>表格字段与用途</h3><p>状态表更新当前字段，小总结写入近期经历，大总结写入历史事实。</p></div></div><button data-ma11-action="restore-default-tables">恢复默认八表</button></section>
    <section class="ma11-table-manager-list">${rows || '<div class="ma11-empty-panel">当前没有表格定义。</div>'}</section>
    <section class="ma11-card ma11-note"><b>删除说明</b><p>删除默认表格只删除可见视图，不删除聊天级内部事实、event_id、小总结、大总结或历史重建依据。人工世界书条目也不会被镜渊操作。</p></section>`;
}
function graphNodePositions(graph, preferredId) {
    const width = 1000;
    const height = 760;
    const center = { x: width / 2, y: height / 2 };
    if (!graph.nodes.length)
        return [];
    const degree = new Map();
    const adjacency = new Map();
    for (const node of graph.nodes)
        adjacency.set(node.id, new Set());
    for (const edge of graph.edges) {
        adjacency.get(edge.source)?.add(edge.target);
        adjacency.get(edge.target)?.add(edge.source);
        degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
        degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
    const preferred = graph.nodes.find((node) => node.id === preferredId)
        ?? graph.nodes.find((node) => node.type === 'focus')
        ?? [...graph.nodes].filter((node) => node.type === 'event').sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))[0]
        ?? [...graph.nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.label.localeCompare(b.label))[0];
    const distance = new Map([[preferred.id, 0]]);
    const queue = [preferred.id];
    while (queue.length) {
        const id = queue.shift();
        const nextDistance = (distance.get(id) ?? 0) + 1;
        for (const neighbor of adjacency.get(id) ?? []) {
            if (distance.has(neighbor))
                continue;
            distance.set(neighbor, nextDistance);
            queue.push(neighbor);
        }
    }
    const byLayer = new Map();
    for (const node of graph.nodes) {
        const layer = Math.min(3, distance.get(node.id) ?? 3);
        byLayer.set(layer, [...(byLayer.get(layer) ?? []), node]);
    }
    for (const nodes of byLayer.values())
        nodes.sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.type.localeCompare(b.type) || a.label.localeCompare(b.label));
    const output = [{ ...preferred, x: center.x, y: center.y }];
    const placeColumns = (nodes, leftX, rightX, top, bottom) => {
        const filtered = nodes.filter((node) => node.id !== preferred.id);
        const left = filtered.filter((_, index) => index % 2 === 0);
        const right = filtered.filter((_, index) => index % 2 === 1);
        const place = (items, x, phase) => items.forEach((node, index) => {
            const step = (bottom - top) / Math.max(items.length, 1);
            const y = top + step * (index + .5) + (index % 2 ? phase : -phase);
            output.push({ ...node, x, y: Math.max(65, Math.min(height - 65, y)) });
        });
        place(left, leftX, 14);
        place(right, rightX, 14);
    };
    placeColumns(byLayer.get(1) ?? [], 320, 680, 120, 640);
    placeColumns(byLayer.get(2) ?? [], 145, 855, 80, 680);
    const outer = (byLayer.get(3) ?? []).filter((node) => node.id !== preferred.id);
    outer.forEach((node, index) => {
        const columns = 5;
        const col = index % columns;
        const row = Math.floor(index / columns);
        output.push({ ...node, x: 100 + col * 200, y: 700 - row * 72 });
    });
    return output;
}
function graphTypeLabel(type) {
    const labels = {
        focus: "焦点",
        character: "人物",
        relationship: "关系",
        item: "物品",
        event: "事件",
        region: "区域",
    };
    return labels[type];
}
function graphLifecycleClass(node) {
    if (node.existence === "死亡已确认")
        return "dead";
    if (node.existence === "存在未知" || node.existence === "身份存疑" || node.existence === "失踪")
        return "uncertain";
    if (node.activity === "已归档")
        return "archived";
    if (node.activity === "长期休眠")
        return "long-dormant";
    if (node.activity === "休眠")
        return "dormant";
    return "";
}
function graphHtml(artifactInfo, profiles = [], graphOverride) {
    const settings = getSettings();
    const snapshot = artifactInfo?.artifact.snapshot;
    const graph = graphOverride ?? buildRelationshipGraph(snapshot, settings.ui.graphScope, settings.tableRegistry);
    const positioned = graphNodePositions(graph, selectedGraphNodeId);
    const positions = new Map(positioned.map((node) => [node.id, node]));
    const degree = new Map();
    for (const edge of graph.edges) {
        degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
        degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
    const graphQuery = graphSearchQuery.trim().toLocaleLowerCase();
    const matchingNodeIds = new Set(positioned
        .filter((node) => !graphQuery || `${node.label} ${node.detail} ${node.status}`.toLocaleLowerCase().includes(graphQuery))
        .map((node) => node.id));
    const selected = positioned.find((node) => node.id === selectedGraphNodeId) ?? positioned[0];
    if (selected && !selectedGraphNodeId)
        selectedGraphNodeId = selected.id;
    const selectedEventProfile = selected?.type === "event"
        ? profiles.find((profile) => (profile.eventEntryId && selected.id.endsWith(`:${profile.eventEntryId}`))
            || profile.eventId === selected.label
            || profile.title === selected.label)
        : undefined;
    const zoom = clampGraphZoom(settings.ui.graphZoom);
    settings.ui.graphZoom = zoom;
    const edgeSvg = graph.edges
        .map((edge) => {
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target)
            return "";
        const mx = (source.x + target.x) / 2;
        const my = (source.y + target.y) / 2;
        const dimmed = graphQuery && !matchingNodeIds.has(edge.source) && !matchingNodeIds.has(edge.target);
        return `<g class="ma11-graph-edge ${edge.kind || "object"} ${edge.explicit === false ? "legacy" : "explicit"} ${dimmed ? "dimmed" : ""}" data-ma11-graph-edge-source="${escapeHtml(edge.source)}" data-ma11-graph-edge-target="${escapeHtml(edge.target)}"><line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"><title>${escapeHtml(`${edge.label}：${edge.detail}`)}</title></line>${graph.edges.length <= 18 ? `<text x="${mx}" y="${my}">${escapeHtml(edge.label)}</text>` : ""}</g>`;
    })
        .join("");
    const nodeSvg = positioned
        .map((node) => {
        const searchText = `${node.label} ${node.detail} ${node.status}`.toLocaleLowerCase();
        const matches = !graphQuery || matchingNodeIds.has(node.id);
        const radius = Math.min(44, 31 + (degree.get(node.id) ?? 0) * 2);
        return `<g class="ma11-graph-node ${node.type} ${graphLifecycleClass(node)} ${selected?.id === node.id ? "selected" : ""} ${graphQuery ? (matches ? "search-match" : "dimmed") : ""}" data-ma11-graph-node="${escapeHtml(node.id)}" data-ma11-graph-search-text="${escapeHtml(searchText)}" transform="translate(${node.x} ${node.y})" tabindex="0" role="button"><circle r="${radius}"></circle><text text-anchor="middle" y="4">${escapeHtml(node.label.length > 10 ? `${node.label.slice(0, 9)}…` : node.label)}</text><title>${escapeHtml(`${node.label}\n${node.detail}`)}</title></g>`;
    })
        .join("");
    const graphWidth = Math.round(1000 * zoom);
    const graphHeight = Math.round(760 * zoom);
    const compactGraph = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 900px)').matches;
    const graphStyle = compactGraph
        ? `width:${Math.max(100, Math.round(zoom * 100))}%;height:100%;min-height:100%;`
        : `width:${graphWidth}px;height:${graphHeight}px`;
    return `
    <section class="ma11-toolbar ma11-graph-toolbar">
      <div><h2>对象图谱</h2><p>优先使用明确的关联对象、关联事件和关系状态；旧数据缺少显式关联时才使用兼容推断。</p></div>
      <div class="ma11-graph-toolbar-actions">
        <div class="ma11-segmented"><button class="${settings.ui.graphScope === "relations" ? "active" : ""}" data-ma11-graph-scope="relations">人物关系</button><button class="${settings.ui.graphScope === "world" ? "active" : ""}" data-ma11-graph-scope="world">全局网络</button></div>
        <label class="ma11-search-field ma11-graph-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input data-ma11-graph-search value="${escapeHtml(graphSearchQuery)}" placeholder="查找并高亮节点" aria-label="查找图谱节点"/><output data-ma11-graph-match-count>${matchingNodeIds.size} / ${graph.nodes.length}</output></label>
        <div class="ma11-graph-zoom" aria-label="图谱缩放">
          <button type="button" data-ma11-graph-zoom="out" title="缩小">−</button>
          <input type="range" min="50" max="250" step="5" value="${Math.round(zoom * 100)}" data-ma11-graph-zoom-range aria-label="缩放比例" />
          <button type="button" data-ma11-graph-zoom="in" title="放大">＋</button>
          <button type="button" data-ma11-graph-zoom="reset">100%</button>
          <button type="button" data-ma11-graph-zoom="fit">适应</button>
          <output>${Math.round(zoom * 100)}%</output>
        </div>
      </div>
    </section>
    <section class="ma11-graph-stats"><span><b>${graph.nodes.length}</b>节点</span><span><b>${graph.edges.length}</b>关系</span><span><b>${graph.edges.filter((edge) => edge.explicit !== false).length}</b>明确关联</span><span><b>${graph.edges.filter((edge) => edge.explicit === false).length}</b>兼容关联</span></section>
    ${graph.nodes.length ? `<section class="ma11-graph-layout"><div><div class="ma11-graph-legend"><span><i class="character"></i>人物</span><span><i class="item"></i>物品</span><span><i class="event"></i>事件</span><span><i class="region"></i>地点 / 场景 / 全局</span><span><i class="legacy"></i>旧记录推断</span></div><div class="ma11-graph-canvas"><svg viewBox="0 0 1000 760" width="${graphWidth}" height="${graphHeight}" style="${graphStyle}" preserveAspectRatio="xMidYMid meet" aria-label="镜渊对象图谱">${edgeSvg}${nodeSvg}</svg></div></div><aside class="ma11-graph-detail">${selected ? `<span class="ma11-graph-type ${selected.type}">${escapeHtml(graphTypeLabel(selected.type))}</span><h3>${escapeHtml(selected.label)}</h3><p>${escapeHtml(selected.detail || "暂无详细记录")}</p><dl><dt>直接关系</dt><dd>${degree.get(selected.id) ?? 0}</dd><dt>状态</dt><dd>${escapeHtml(selected.status || "未标注")}</dd>${selected.existence ? `<dt>存在</dt><dd>${escapeHtml(selected.existence)}</dd>` : ""}${selected.activity ? `<dt>活跃</dt><dd>${escapeHtml(selected.activity)}</dd>` : ""}${selected.memory ? `<dt>记忆</dt><dd>${escapeHtml(selected.memory)}</dd>` : ""}${selectedEventProfile ? `<dt>事件事实</dt><dd>${selectedEventProfile.factCount}</dd><dt>总结层</dt><dd>${selectedEventProfile.hasLargeSummary ? "已有大总结" : selectedEventProfile.smallSummaryCount ? `${selectedEventProfile.smallSummaryCount} 个小总结` : "尚无总结"}</dd><dt>待结算</dt><dd>${selectedEventProfile.settlingEntryCount}</dd>` : ""}</dl>${selectedEventProfile?.currentResults.length ? `<div class="ma11-event-results ma11-graph-event-results"><b>明确结果</b><ul>${selectedEventProfile.currentResults.map((result) => `<li>${escapeHtml(result)}</li>`).join("")}</ul></div>` : ""}` : '<p class="ma11-empty">点击节点查看详情。</p>'}</aside></section>` : '<section class="ma11-empty-panel">当前状态表没有可绘制的关系节点。先在角色或事件条目中建立明确关联。</section>'}`;
}
function summaryPromptEditorHtml(kind) {
    const settings = getSettings();
    const prompt = settings.summaryPrompts[kind];
    const label = kind === 'small' ? '小总结规则' : '大总结规则';
    const description = kind === 'small'
        ? '把同一事件线整理成下一步必须承接的最小事实集合，并写入表格的“近期经历”。'
        : '重新审查小总结，只保留跨场景、跨阶段仍会改变未来的事实，并写入表格的“历史事实”。';
    const standard = JSON.stringify(prompt) === JSON.stringify(DEFAULT_SUMMARY_PROMPTS[kind]);
    const field = (key, title, rows, help) => `<label>${title}<small>${help}</small><textarea rows="${rows}" data-ma11-summary-prompt="${kind}" data-ma11-summary-section="${key}">${escapeHtml(prompt[key])}</textarea></label>`;
    return `<section class="ma11-card ma11-form-card ma11-summary-prompt-card" id="ma11-rule-${kind}">
    <header><div><b>${label}</b><span>${description}</span></div><span class="ma11-badge ${standard ? "success" : "working"}">${standard ? "标准" : "已自定义"}</span></header>
    ${field('coreQuestion', '核心判断', 3, '每次总结先回答这个问题，而不是按字数截断。')}
    <div class="ma11-rule-grid">
      ${field('includeRules', '必须保留', 8, '只列真正影响后续连续性的内容。')}
      ${field('excludeRules', '必须删除', 8, '排除过程、重复、背景板和已失效信息。')}
      ${field('updateRules', '版本更新', 7, '上一版是待修订原料，不是继续追加的正文。')}
      ${field('expressionRules', '表达方式', 7, '控制粒度、去重与最终可读性。')}
    </div>
    <div class="ma11-actions">
      <button data-ma11-action="save-summary-prompt" data-ma11-summary-kind="${kind}">保存${label}</button>
      <button data-ma11-action="restore-summary-prompt" data-ma11-summary-kind="${kind}">恢复标准规则</button>
    </div>
    <p class="ma11-help">事件分组、事实消费、版本继承、沉淀到对象和世界书同步由插件负责；这里仅调整模型筛选与表达。</p>
  </section>`;
}
async function summariesHtml() {
    const info = latestSnapshotArtifact();
    const enabled = getSettings().enabled;
    const busy = workspacePipelineBusy(info);
    const state = info ? await getChatState(info.artifact.chatKey) : null;
    const allSmall = state?.smallSummaries ?? [];
    const large = state?.largeSummaries ?? [];
    const small = pendingSmallSummaries(allSmall, large);
    return `
    <section class="ma11-toolbar"><div><h2>小总结与大总结</h2><p>小总结写入近期经历；大总结重新审查并写入历史事实。</p></div><div class="ma11-actions"><button data-ma11-action="force-small" ${enabled && info && !busy ? "" : "disabled"}>立即小总结</button><button data-ma11-action="force-large" ${enabled && info && !busy ? "" : "disabled"}>立即大总结</button></div></section>
    <div class="ma11-summary-columns">
      <section class="ma11-card"><header><b>小总结</b><span>${small.length}</span></header>${small.length
        ? small
            .slice()
            .reverse()
            .map((item) => `<article class="ma11-summary"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>${item.unresolvedItems?.length ? `<div class="ma11-summary-unresolved"><b>未决</b><span>${escapeHtml(item.unresolvedItems.join('；'))}</span></div>` : ''}${item.sedimentation ? `<div class="ma11-summary-settlement"><span>已应用 ${item.sedimentation.appliedRowIds?.length ?? 0}</span><span>保护/忽略 ${item.sedimentation.ignoredRowIds?.length ?? 0}</span></div>` : ""}<small>${escapeHtml(new Date(item.createdAt).toLocaleString())}</small></article>`)
            .join("")
        : '<p class="ma11-empty">尚无小总结。</p>'}</section>
      <section class="ma11-card"><header><b>大总结</b><span>${large.length}</span></header>${large.length
        ? large
            .slice()
            .reverse()
            .map((item) => `<article class="ma11-summary"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>${item.unresolvedItems?.length ? `<div class="ma11-summary-unresolved"><b>长期未决</b><span>${escapeHtml(item.unresolvedItems.join('；'))}</span></div>` : ''}${item.sedimentation ? `<div class="ma11-summary-settlement"><span>已应用 ${item.sedimentation.appliedRowIds?.length ?? 0}</span><span>保护/忽略 ${item.sedimentation.ignoredRowIds?.length ?? 0}</span></div>` : ""}<small>${escapeHtml(new Date(item.createdAt).toLocaleString())}</small></article>`)
            .join("")
        : '<p class="ma11-empty">尚无大总结。</p>'}</section>
    </div>`;
}
function auditHtml() {
    const settings = getSettings();
    const info = currentArtifact();
    const audit = info?.artifact.audit;
    const revision = info?.artifact.revision;
    const violationHtml = audit && !audit.passed && audit.violations.length
        ? `<ol class="ma11-violation-list">${audit.violations.map((item) => `<li><b>${escapeHtml(item.rule)}</b><p>${escapeHtml(item.evidence)}</p><small>修改：${escapeHtml(item.action)}</small></li>`).join("")}</ol>`
        : "";
    const latestIndex = latestAssistantIndex();
    const isLatest = info
        ? info.index === latestIndex
        : selectedMessageIndex === null && latestIndex >= 0;
    const busy = workspacePipelineBusy(info);
    const canAudit = Boolean(settings.enabled && !busy && settings.hostControl.enabled && settings.auditEnabled && settings.auditPrompt.trim() && isLatest);
    const canRevise = Boolean(settings.enabled && !busy && isLatest && audit && !audit.passed && audit.decision !== "block");
    return `
    <section class="ma11-toolbar"><div><h2>审核与修正</h2><p>审核和修正分开执行；修正通过后再点击“生成表格”。</p></div><div class="ma11-actions"><button data-ma11-action="run-audit" ${canAudit ? "" : "disabled"}>立即审核</button><button data-ma11-action="run-revision" ${canRevise ? "" : "disabled"}>执行修正</button></div></section>
    <section class="ma11-card ma11-form-card">
      <header><b>规则审核与定向修正</b><span>最终通过的正文才进入状态表与世界书</span></header>
      <div class="ma11-guidance-banner"><span aria-hidden="true">✓</span><div><b>只填写可以明确判定的硬规则</b><p>推荐写“必须/禁止/仅当”的可验证条件。文风偏好、模糊审美和互相冲突的要求不适合作为自动阻断规则。</p></div></div>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="auditEnabled" ${settings.auditEnabled ? "checked" : ""}/><span>启用规则审核</span></label>
      <label>审核失败处理<select data-ma11-setting="auditFailAction">
        <option value="revise" ${settings.auditFailAction === "revise" ? "selected" : ""}>定向修正并原位替换（推荐）</option>
        <option value="mark" ${settings.auditFailAction === "mark" ? "selected" : ""}>保留并标红</option>
        <option value="hide" ${settings.auditFailAction === "hide" ? "selected" : ""}>隐藏，等待人工处理</option>
      </select></label>
      <label>自动修正仍失败后的处理<select data-ma11-setting="revisionFallbackAction">
        <option value="hide" ${settings.revisionFallbackAction === "hide" ? "selected" : ""}>隐藏并等待人工处理（推荐）</option>
        <option value="mark" ${settings.revisionFallbackAction === "mark" ? "selected" : ""}>保留并标红</option>
      </select></label>
      <label>最大自动修正次数<input type="number" min="1" max="2" data-ma11-setting="maxRevisionAttempts" value="${settings.maxRevisionAttempts}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="stopOnRepeatedViolation" ${settings.stopOnRepeatedViolation ? "checked" : ""}/><span>相同违规重复出现时立即停止，防止循环</span></label>
      <label>审核规则 <small>一条规则一行，写明触发条件与允许的最小修正范围</small><textarea rows="14" data-ma11-setting="auditPrompt" placeholder="示例：禁止替玩家决定是否接受交易；若出现，只删除代替玩家作出的决定，不改动其他正文。">${escapeHtml(settings.auditPrompt)}</textarea></label>
      <label>附加修正要求（可选）<textarea rows="6" data-ma11-setting="revisionPrompt" placeholder="例如：只做最小改动；保留原有文风和段落长度。">${escapeHtml(settings.revisionPrompt)}</textarea></label>
      <p class="ma11-help">审核说明和修正指令不会作为聊天消息写入上下文。修正通过后原位更新正文；插件不会锁定酒馆生成按钮，也不会自动删除消息。</p>
    </section>
    ${audit ? `<section class="ma11-card"><header><b>最近审核结果</b><span class="ma11-badge ${audit.passed ? "success" : "danger"}">${audit.passed ? "通过" : audit.decision === "block" ? "阻断" : "需修正"}</span></header><p>${escapeHtml(audit.reason)}</p>${violationHtml}${revision ? `<dl class="ma11-meta"><dt>修正状态</dt><dd>${escapeHtml(revision.status)}</dd><dt>修正次数</dt><dd>${revision.attempts.length}</dd><dt>停止原因</dt><dd>${escapeHtml(revision.stoppedReason || "—")}</dd></dl>` : ""}</section>` : ""}`;
}
async function syncHtml() {
    const info = latestSnapshotArtifact();
    const state = await getChatState(currentChatKey());
    const settings = getSettings();
    const historyWorkflow = readHistoryWorkflow(state);
    const syncPaused = historyWorkflow.blocked;
    const busy = workspacePipelineBusy(info);
    const syncDisplayStatus = syncPaused ? "blocked" : (state?.lastSyncStatus || "idle");
    const syncDisplayText = syncPaused ? "暂停" : statusText(syncDisplayStatus);
    return `
    <section class="ma11-card ma11-form-card">
      <header><b>聊天世界书</b><span class="ma11-badge ${statusClass(syncDisplayStatus)}">${syncDisplayText}</span></header>
      ${historyWorkflow.recovery ? `<div class="ma11-error-box">${escapeHtml(historyWorkflow.error || "正在恢复历史；最近同步结果保持不变")}</div>` : ""}
      ${historyWorkflow.invalidation ? `<div class="ma11-error-box">${historyWorkflow.pauseError ? `旧世界书条目暂停失败：${escapeHtml(historyWorkflow.pauseError)}。请先完成历史重建并重新发布。` : historyWorkflow.automatic ? "最新正文正在自动重新整理，完成后会自行恢复世界书同步。" : historyWorkflow.startIndex === undefined ? "历史删除位置未知，请先选择重算起点。完成前不会发布世界书。" : `第 ${historyWorkflow.startIndex + 1} 条消息之后的数据已失效。按依赖重建完成前不会发布世界书。`}</div>` : ""}
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="lorebookSync" ${settings.lorebookSync ? "checked" : ""}/><span>自动同步世界书</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-host-control="vector" ${settings.hostControl.vector ? "checked" : ""}/><span>允许镜渊托管条目使用 ST 向量召回</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-host-control="recursion" ${settings.hostControl.recursion ? "checked" : ""}/><span>允许镜渊托管条目参与 ST 递归触发</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoCreateLorebook" ${settings.autoCreateLorebook ? "checked" : ""}/><span>自动创建每聊天独立世界书</span></label>
      <label>发布模式<select data-ma11-setting="lorebookLayout"><option value="semantic" ${settings.lorebookLayout === "semantic" ? "selected" : ""}>按对象整理（推荐）</option><option value="detailed" ${settings.lorebookLayout === "detailed" ? "selected" : ""}>逐条排错</option></select></label>
      <div class="ma11-guidance-banner ma11-recall-guide"><span aria-hidden="true">↗</span><div><b>镜渊会自动分配三种召回方式</b><p>极少量当前连续性始终携带；有明确关键词的内容按条件出现；其余长期记忆按语义相关性召回。普通使用无需理解底层字段或手工配置发布顺序。</p></div></div>
      <label>世界书名称（留空自动生成）<input data-ma11-setting="lorebookName" value="${escapeHtml(settings.lorebookName)}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="latestContinuityConstant" ${settings.latestContinuityConstant ? "checked" : ""}/><span>将极少量当前焦点、时空、必要规则、不可缺失状态和直接相关全局变化设为常驻</span></label>
      <div class="ma11-editor-grid ma11-recall-grid">
        <label>语义召回参考门槛 <small>越高越严格；默认值适合多数剧情</small><input type="number" min="0" max="0.99" step="0.01" data-ma11-recall-setting="similarityThreshold" value="${settings.lorebookRecall.similarityThreshold}" /></label>
        <label>单次最多召回条目 <small>用于限制无关信息和上下文占用</small><input type="number" min="1" max="100" data-ma11-recall-setting="maxVectorResults" value="${settings.lorebookRecall.maxVectorResults}" /></label>
        <label>长期记忆发布上限（字符）<small>达到上限时优先保留更直接相关的内容</small><input type="number" min="2000" max="200000" step="1000" data-ma11-recall-setting="totalCapacity" value="${settings.lorebookRecall.totalCapacity}" /></label>
      </div>
      <div class="ma11-actions ma11-sync-actions">
        <button data-ma11-action="sync-now" ${settings.enabled && info && !busy && !historyWorkflow.blocked ? "" : "disabled"}>立即同步</button>
        ${settings.lorebookLayout === "semantic" ? `<button data-ma11-action="maintain-lorebook" ${settings.enabled && info && !busy && !historyWorkflow.blocked ? "" : "disabled"}>按对象清理并重新发布</button>` : ""}
        <button data-ma11-action="open-graph" ${info?.artifact.snapshot ? "" : "disabled"}>查看记忆网络</button>
      </div>
      <p class="ma11-help ma11-maintenance-note"><b>维护操作：</b>“按对象清理并重新发布”会先检查可安全删除的镜渊旧条目，并在一次确认后发布当前真实快照；不会处理人工条目或其他聊天条目。</p>
      ${state?.lastSyncError ? `<div class="ma11-error-box">${escapeHtml(state.lastSyncError)}</div>` : ""}
      <dl class="ma11-meta"><dt>当前世界书</dt><dd>${escapeHtml(state?.lastLorebookName || "未建立")}</dd><dt>最近同步</dt><dd>${escapeHtml(state?.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString() : "尚未同步")}</dd></dl>
    </section>`;
}
function eventGraphNodeId(profile, graph) {
    const candidates = [profile.eventEntryId, profile.eventId].filter(Boolean);
    return graph.nodes.find((node) => node.id === `event-profile:${profile.eventId}`)?.id
        ?? graph.nodes.find((node) => node.type === "event" && candidates.some((id) => node.id.endsWith(`:${id}`)))?.id
        ?? graph.nodes.find((node) => node.type === "event" && node.label === profile.title)?.id
        ?? null;
}
function eventProfileSectionHtml(profiles, graph, compact = false) {
    const active = profiles.filter((profile) => profile.status === "active").length;
    const closed = profiles.length - active;
    const facts = profiles.reduce((sum, profile) => sum + profile.factCount, 0);
    const settling = profiles.reduce((sum, profile) => sum + profile.settlingEntryCount, 0);
    const query = graphSearchQuery.trim().toLocaleLowerCase();
    const visibleCount = profiles.filter((profile) => !query || [profile.title, profile.eventId, ...profile.relatedEntities, ...profile.currentResults].join(" ").toLocaleLowerCase().includes(query)).length;
    const cards = profiles.map((profile) => {
        const searchText = [profile.title, profile.eventId, ...profile.relatedEntities, ...profile.currentResults].join(" ").toLocaleLowerCase();
        const summaryState = profile.hasLargeSummary
            ? "已有大总结"
            : profile.smallSummaryCount
                ? `${profile.smallSummaryCount} 个有效小总结`
                : "尚无总结";
        const graphNodeId = eventGraphNodeId(profile, graph);
        return `<article class="ma11-card ma11-event-profile-card ${graphNodeId && selectedGraphNodeId === graphNodeId ? "selected" : ""}" data-ma11-event-profile data-ma11-event-profile-search="${escapeHtml(searchText)}">
      <header><div><b>${escapeHtml(profile.title)}</b><span>${escapeHtml(profile.eventId)}</span></div><span class="ma11-badge ${profile.status === "closed" ? "success" : "warning"}">${profile.status === "closed" ? "已形成结果" : "进行中"}</span></header>
      <div class="ma11-event-profile-metrics">
        <span><b>${profile.factCount}</b> 条事实</span><span><b>${profile.messageCount}</b> 条来源消息</span><span><b>${profile.relatedEntries.length}</b> 个关联条目</span><span><b>${profile.contentChars}</b> 字符材料</span>
      </div>
      <p><b>总结层：</b>${escapeHtml(summaryState)}${profile.settlingEntryCount ? ` · ${profile.settlingEntryCount} 个条目待结算` : ""}</p>
      ${profile.relatedEntities.length ? `<p><b>关联对象：</b>${escapeHtml(profile.relatedEntities.join("、"))}</p>` : ""}
      ${profile.currentResults.length ? `<div class="ma11-event-results"><b>明确结果</b><ul>${profile.currentResults.map((result) => `<li>${escapeHtml(result)}</li>`).join("")}</ul></div>` : `<p class="ma11-muted">尚未提取到明确结果；画像不会补全未知信息。</p>`}
      <footer><span>${profile.updatedAt ? `最近更新：${escapeHtml(profile.updatedAt)}` : "仅由现有事实派生"}</span>${graphNodeId ? `<button type="button" data-ma11-locate-graph-node="${escapeHtml(graphNodeId)}">在图谱中定位</button>` : ""}</footer>
    </article>`;
    }).join("");
    return `
    <section class="ma11-toolbar ma11-event-profile-toolbar"><div><h2>${compact ? "事件画像" : "事件画像"}</h2><p>由已提交事实、对象关联和总结版本实时派生；不调用模型，也不建立第二份记忆仓库。</p></div></section>
    <section class="ma11-card ma11-event-profile-overview">
      <div class="ma11-event-profile-stats"><span><b>${active}</b>进行中</span><span><b>${closed}</b>已形成结果</span><span><b>${facts}</b>事实</span><span><b>${settling}</b>待结算条目</span></div>
      <label class="ma11-search-field"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input data-ma11-event-profile-search-input value="${escapeHtml(graphSearchQuery)}" placeholder="搜索事件、对象或明确结果"/><output data-ma11-event-profile-match-count>${visibleCount} / ${profiles.length}</output></label>
    </section>
    <section class="ma11-event-profile-grid ${compact ? "compact" : ""}">${cards || `<article class="ma11-card ma11-empty-state"><b>暂无事件画像</b><p>完成状态提取后，事件画像会从现有事实自动出现。</p></article>`}</section>`;
}
async function memoryNetworkHtml(artifactInfo) {
    const settings = getSettings();
    const state = await getChatState(currentChatKey());
    // 记忆网络是聊天级当前视图，必须读取最近一次成功状态快照。
    // 当前选中消息可能只有审核/修正记录而没有 snapshot，直接使用它会把已有图谱误显示为空。
    const snapshotArtifact = latestSnapshotArtifact()
        ?? (artifactInfo?.artifact.snapshot ? artifactInfo : null);
    const snapshot = snapshotArtifact?.artifact.snapshot;
    const profiles = buildEventProfiles(snapshot, state.internalFacts, state.smallSummaries, state.largeSummaries, settings.tableRegistry);
    const baseGraph = buildRelationshipGraph(snapshot, settings.ui.graphScope, settings.tableRegistry);
    const graph = settings.ui.graphScope === "world"
        ? enrichRelationshipGraphWithEventProfiles(baseGraph, profiles)
        : baseGraph;
    const view = settings.ui.memoryView;
    return `
    <section class="ma11-toolbar ma11-memory-network-toolbar">
      <div><h2>记忆网络</h2><p>事件画像负责时间与结算，关系图谱负责对象联系；两者读取同一份事实和对象数据，不建立重复记忆。</p></div>
      <div class="ma11-segmented ma11-memory-view-switch" role="tablist" aria-label="记忆网络视图">
        <button type="button" class="${view === "combined" ? "active" : ""}" data-ma11-memory-view="combined">融合视图</button>
        <button type="button" class="${view === "events" ? "active" : ""}" data-ma11-memory-view="events">事件画像</button>
        <button type="button" class="${view === "graph" ? "active" : ""}" data-ma11-memory-view="graph">关系图谱</button>
      </div>
    </section>
    ${view === "events" ? eventProfileSectionHtml(profiles, graph) : ""}
    ${view === "graph" ? graphHtml(snapshotArtifact, profiles, graph) : ""}
    ${view === "combined" ? `<div class="ma11-memory-combined"><section class="ma11-memory-events-pane">${eventProfileSectionHtml(profiles, graph, true)}</section><section class="ma11-memory-graph-pane">${graphHtml(snapshotArtifact, profiles, graph)}</section></div>` : ""}`;
}
function connectionProfiles() {
    try {
        return listSupportedConnectionProfiles();
    }
    catch {
        return [];
    }
}
function connectionBlock(task, label) {
    const value = getSettings().connections[task];
    const profiles = connectionProfiles();
    const profileOptions = profiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${profile.id === value.profileId ? "selected" : ""}>${escapeHtml(profile.name)}${profile.model ? ` · ${escapeHtml(profile.model)}` : ""}</option>`).join("");
    const missingProfile = value.profileId && !profiles.some((profile) => profile.id === value.profileId)
        ? `<option value="${escapeHtml(value.profileId)}" selected>已删除或不受支持的配置</option>`
        : "";
    return `<div class="ma11-connection-row" data-ma11-connection="${task}">
    <b>${label}</b>
    <select data-ma11-connection-mode="${task}">
      <option value="current" ${value.mode === "current" ? "selected" : ""}>沿用当前聊天模型</option>
      <option value="profile" ${value.mode === "profile" ? "selected" : ""}>使用独立模型配置</option>
    </select>
    <select data-ma11-connection-profile-id="${task}" ${value.mode === "profile" ? "" : "hidden disabled"}><option value="">请选择Connection Profile</option>${missingProfile}${profileOptions}</select>
    <button data-ma11-test="${task}">测试</button>
  </div>`;
}
function settingsHtml() {
    const settings = getSettings();
    const tableLimitFields = enabledTables(settings.tableRegistry).map((table) => `
    <label>${escapeHtml(table.name)}单条上限 <small>发布到世界书的完整字符硬上限</small><input type="number" min="200" max="20000" step="50" data-ma11-entry-limit="${escapeHtml(table.key)}" value="${settings.contentLimits.tables[table.key] ?? 1200}" /></label>`).join("");
    return `
    <section class="ma11-toolbar"><div><h2>设置</h2><p>普通使用只需确认自动整理和模型分配；规则细节统一放在“规则”页。</p></div><div class="ma11-actions"><button data-ma11-action="open-rule-center">打开规则中心</button><button data-ma11-tab="diagnostics">运行诊断</button></div></section>
    <section class="ma11-card ma11-form-card ma11-quick-settings">
      <header><div><b>自动化与显示</b><span>推荐项已按开箱使用配置</span></div><span class="ma11-badge success">推荐</span></header>
      <div class="ma11-setting-tile-grid">
        <label class="ma11-setting-tile"><input type="checkbox" data-ma11-setting="enabled" ${settings.enabled ? "checked" : ""}/><span><b>启用镜渊</b><small>控制所有自动任务</small></span></label>
        <label class="ma11-setting-tile"><input type="checkbox" data-ma11-host-control="enabled" ${settings.hostControl.enabled ? "checked" : ""}/><span><b>统一接管 ST 记忆外围</b><small>默认由镜渊控制托管世界书、向量与递归</small></span></label>
        <label class="ma11-setting-tile"><input type="checkbox" data-ma11-host-control="vector" ${settings.hostControl.vector ? "checked" : ""}/><span><b>托管向量召回</b><small>关闭后事件条目退回关键词触发</small></span></label>
        <label class="ma11-setting-tile"><input type="checkbox" data-ma11-host-control="recursion" ${settings.hostControl.recursion ? "checked" : ""}/><span><b>托管递归触发</b><small>关闭后镜渊世界书条目禁止递归激活</small></span></label>
        <label class="ma11-setting-tile"><input type="checkbox" data-ma11-setting="autoState" ${settings.autoState ? "checked" : ""}/><span><b>自动状态表</b><small>每条新 AI 正文后更新当前事实</small></span></label>
        <label class="ma11-setting-tile"><input type="checkbox" data-ma11-setting="autoSmallSummary" ${settings.autoSmallSummary ? "checked" : ""}/><span><b>自动小总结</b><small>整理并写入近期经历</small></span></label>
        <label class="ma11-setting-tile"><input type="checkbox" data-ma11-setting="autoLargeSummary" ${settings.autoLargeSummary ? "checked" : ""}/><span><b>自动大总结</b><small>固化并写入历史事实</small></span></label>
        <label class="ma11-setting-tile"><input type="checkbox" data-ma11-setting="showMessagePanel" ${settings.showMessagePanel ? "checked" : ""}/><span><b>正文状态条</b><small>显示每条正文的处理状态</small></span></label>
      </div>
      <div class="ma11-editor-grid ma11-setting-number-grid">
        <label>小总结新增回合阈值 <small>只统计上次成功总结后的新回合</small><input type="number" min="8" max="30" data-ma11-setting="smallSummaryTurns" value="${settings.smallSummaryTurns}" /></label>
        <label>大总结所需小总结数 <small>达到后重新审查长期资格</small><input type="number" min="1" max="30" data-ma11-setting="largeSummaryCount" value="${settings.largeSummaryCount}" /></label>
        <label>模型请求超时 <small>单位：毫秒</small><input type="number" min="10000" max="300000" step="1000" data-ma11-setting="requestTimeoutMs" value="${settings.requestTimeoutMs}" /></label>
        <label>状态请求字符预算 <small>提示词与本轮上下文合计；超出后自动分段</small><input type="number" min="6000" max="60000" step="1000" data-ma11-setting="stateContextChars" value="${settings.stateContextChars}" /></label>
        <label>状态输出 Token 上限 <small>中模型或慢网关建议 2048–3072</small><input type="number" min="768" max="8192" step="256" data-ma11-setting="stateOutputTokens" value="${settings.stateOutputTokens}" /></label>
        <label>状态失败分段长度 <small>仅在超时或格式失败时拆分本轮正文</small><input type="number" min="1800" max="16000" step="200" data-ma11-setting="stateChunkChars" value="${settings.stateChunkChars}" /></label>
      </div>
    </section>
    <section class="ma11-card ma11-form-card ma11-content-limit-settings">
      <header><div><b>记忆正文硬上限</b><span>白盒配置；超限内容必须先压缩或分层，不允许无条件继续膨胀</span></div></header>
      <p class="ma11-help">对象上限控制发布到世界书的单条正文；小总结和大总结上限控制模型返回正文。内部事实不会从中间硬截断，也不会为此扫描整个仓库。</p>
      <div class="ma11-editor-grid ma11-setting-number-grid">
        ${tableLimitFields}
        <label>小总结单条上限 <small>每个事件当前有效的小总结正文</small><input type="number" min="200" max="10000" step="50" data-ma11-summary-limit="smallSummary" value="${settings.contentLimits.smallSummary}" /></label>
        <label>大总结单条上限 <small>每个事件长期固化正文</small><input type="number" min="300" max="20000" step="50" data-ma11-summary-limit="largeSummary" value="${settings.contentLimits.largeSummary}" /></label>
      </div>
    </section>
    <section class="ma11-card ma11-form-card ma11-model-settings">
      <header><div><b>任务模型分配</b><span>默认沿用当前聊天模型；需要隔离时再指定独立配置</span></div></header>
      ${connectionBlock("audit", "规则审核")}
      ${connectionBlock("revision", "定向修正")}
      ${connectionBlock("state", "状态表提取")}
      ${connectionBlock("smallSummary", "小总结")}
      ${connectionBlock("largeSummary", "大总结")}
      <p class="ma11-help">“测试”会验证连接与固定文本遵循情况。API 地址和密钥仍由 SillyTavern 管理，镜渊不单独保存。</p>
    </section>
    <section class="ma11-card ma11-form-card ma11-maintenance-card">
      <header><b>维护</b><span>不会影响其他聊天</span></header>
      <div class="ma11-actions">
        <button data-ma11-action="restart-plugin">重建插件缓存</button>
        <button class="danger" data-ma11-action="reset-current-game">重置当前聊天记忆</button>
      </div>
      <p class="ma11-help">重建缓存不会删除数据。重置当前聊天会删除本聊天的镜渊表格、总结、审核记录及镜渊世界书条目，之后需要重新整理。</p>
    </section>`;
}
async function diagnosticsHtml() {
    const checks = await runDiagnostics();
    const info = currentArtifact();
    const settings = getSettings();
    const promptMap = {
        state: stateSystemPrompt(settings.tableRegistry, settings.statePrompts, settings.contentLimits),
        small: smallSummarySystemPrompt(settings.summaryPrompts.small, settings.contentLimits.smallSummary),
        large: largeSummarySystemPrompt(settings.summaryPrompts.large, settings.contentLimits.largeSummary),
        audit: `${auditSystemPrompt()}

【玩家审核规则】
${settings.auditPrompt || "（未填写）"}`,
        revision: revisionSystemPrompt(settings.revisionPrompt),
    };
    const selectedPrompt = promptMap[diagnosticPromptKind];
    return `
    <section class="ma11-toolbar"><div><h2>运行诊断</h2><p>先看检查结论；只有定位具体阶段时才使用下方调试工具。</p></div><div class="ma11-actions"><button data-ma11-action="refresh-diagnostics">刷新</button><button data-ma11-action="copy-diagnostics">复制诊断</button></div></section>
    <section class="ma11-check-grid">${checks.map((check) => `<article class="ma11-check ${check.status}"><span></span><div><b>${escapeHtml(check.label)}</b><p>${escapeHtml(check.detail)}</p></div></article>`).join("")}</section>
    <section class="ma11-card ma11-debug-tools">
      <header><b>单阶段排错</b><span>不会改变其他阶段的设置</span></header>
      ${stageActionButtonsHtml(info)}
    </section>
    <section class="ma11-card ma11-form-card ma11-prompt-inspector">
      <header><div><b>提示词调试预览</b><span>只读显示实际发送的系统规则；普通设置页不暴露固定协议</span></div><button data-ma11-action="copy-current-prompt">复制当前提示词</button></header>
      <label>选择任务<select data-ma11-prompt-inspector>
        <option value="state" ${diagnosticPromptKind === "state" ? "selected" : ""}>事实提取与表格</option>
        <option value="small" ${diagnosticPromptKind === "small" ? "selected" : ""}>近期事件总结</option>
        <option value="large" ${diagnosticPromptKind === "large" ? "selected" : ""}>长期事实固化</option>
        <option value="audit" ${diagnosticPromptKind === "audit" ? "selected" : ""}>规则审核</option>
        <option value="revision" ${diagnosticPromptKind === "revision" ? "selected" : ""}>定向修正</option>
      </select></label>
      <textarea readonly rows="24" data-ma11-current-prompt>${escapeHtml(selectedPrompt)}</textarea>
    </section>`;
}
async function renderWorkspace() {
    const workspace = document.querySelector("#ma11-workspace");
    if (!workspace || workspace.hidden)
        return;
    if (rendering) {
        renderAgain = true;
        return;
    }
    rendering = true;
    workspaceRenderDeferred = false;
    const renderChatKey = currentChatKey();
    try {
        const settings = getSettings();
        const info = currentArtifact();
        const activeMeta = workspaceTabMeta(settings.ui.activeTab);
        const contentPanel = workspace.querySelector("#ma11-workspace-content");
        contentPanel?.setAttribute("aria-label", `${activeMeta.label}：${activeMeta.description}`);
        workspace
            .querySelectorAll("[data-ma11-tab]")
            .forEach((button) => {
            const active = button.dataset.ma11Tab === activeMeta.key;
            button.classList.toggle("active", active);
            button.setAttribute("aria-selected", String(active));
            if (active)
                button.setAttribute("aria-current", "page");
            else
                button.removeAttribute("aria-current");
        });
        scrollActiveWorkspaceTabIntoView(workspace, activeMeta.key);
        let html = "";
        if (settings.ui.activeTab === "overview")
            html = await overviewHtml(info);
        if (settings.ui.activeTab === "tables")
            html = await tableHtml(info);
        if (settings.ui.activeTab === "tableManager")
            html = tableManagerHtml(info);
        if (settings.ui.activeTab === "graph")
            html = await memoryNetworkHtml(info);
        if (settings.ui.activeTab === "summaries")
            html = await summariesHtml();
        if (settings.ui.activeTab === "audit")
            html = auditHtml();
        if (settings.ui.activeTab === "sync")
            html = await syncHtml();
        if (settings.ui.activeTab === "settings")
            html = settingsHtml();
        if (settings.ui.activeTab === "diagnostics")
            html = await diagnosticsHtml();
        if (!workspace.isConnected || currentChatKey() !== renderChatKey) {
            renderAgain = true;
            return;
        }
        const content = workspace.querySelector("#ma11-workspace-content");
        if (content) {
            const scrollTop = content.scrollTop;
            const tableScrollLeft = content.querySelector(".ma11-table-wrap")?.scrollLeft ?? 0;
            content.innerHTML = html;
            content.scrollTop = scrollTop;
            const tableWrap = content.querySelector(".ma11-table-wrap");
            if (tableWrap)
                tableWrap.scrollLeft = tableScrollLeft;
            if (settings.ui.activeTab === "tables")
                applyTableSearch(workspace, tableSearchQuery);
            if (settings.ui.activeTab === "graph") {
                applyEventProfileSearch(workspace, graphSearchQuery);
                applyGraphSearch(workspace, graphSearchQuery);
            }
        }
    }
    catch (error) {
        if (currentChatKey() !== renderChatKey) {
            renderAgain = true;
            return;
        }
        const message = toErrorMessage(error);
        const content = workspace.querySelector("#ma11-workspace-content");
        if (content) {
            content.innerHTML = `<section class="ma11-card"><header><b>界面加载失败</b></header><p class="ma11-message-error">${escapeHtml(message)}</p><div class="ma11-actions"><button data-ma11-action="refresh-diagnostics">重新加载</button></div></section>`;
        }
        console.error("[MirrorAbyss] workspace render failed", error);
    }
    finally {
        rendering = false;
        if (renderAgain) {
            renderAgain = false;
            queueMicrotask(() => void renderWorkspace());
        }
    }
}
function setTab(tab) {
    const settings = getSettings();
    settings.ui.activeTab = tab;
    saveSettings();
    void renderWorkspace();
}
function editableArtifact() {
    if (!getSettings().enabled)
        throw new Error("镜渊已关闭，请先启用");
    if (editorChatKey && currentChatKey() !== editorChatKey) {
        throw new Error("聊天已切换，本次编辑不再保存");
    }
    const info = currentArtifact();
    if (workspacePipelineBusy(info))
        throw new Error("镜渊仍有任务在处理，请完成后再编辑");
    const latest = latestSnapshotArtifact();
    if (!info?.artifact.snapshot || !latest || info.artifact.messageKey !== latest.artifact.messageKey) {
        throw new Error("历史状态表只读，只能编辑最新成功状态表");
    }
    if (editorMessageKey && info.artifact.messageKey !== editorMessageKey) {
        throw new Error("编辑目标已经变化，请重新打开编辑器");
    }
    assertArtifactCommitCurrent(info.artifact);
    return info;
}
function applyRowEditorTable(form, tableKey) {
    const tableDefinition = tableByKey(getSettings().tableRegistry, tableKey);
    if (tableDefinition) {
        const labels = {
            title: customizedFieldLabel(tableDefinition, "title", "对象"),
            content: customizedFieldLabel(tableDefinition, "content", "当前事实"),
            status: customizedFieldLabel(tableDefinition, "status", "状态"),
            keywords: `${customizedFieldLabel(tableDefinition, "keywords", "关键词")}（逗号分隔）`,
        };
        for (const [fieldKey, label] of Object.entries(labels)) {
            const target = form.querySelector(`[data-ma11-row-field-label="${fieldKey}"]`);
            if (target)
                target.textContent = label;
        }
    }
    const supportsLifecycle = ["characters", "state"].includes(tableDefinition?.role || "");
    const characterObjectFields = form.querySelector("[data-ma11-character-object-fields]");
    const lifecycleFields = form.querySelector("[data-ma11-lifecycle-fields]");
    if (characterObjectFields)
        characterObjectFields.hidden = !supportsLifecycle;
    if (lifecycleFields)
        lifecycleFields.hidden = !supportsLifecycle;
}
function openRowEditor(tableKey, row) {
    const info = currentArtifact();
    editorChatKey = currentChatKey();
    editorMessageKey = info?.artifact.messageKey ?? null;
    const workspace = root();
    const backdrop = workspace.querySelector(".ma11-editor-backdrop");
    const form = workspace.querySelector("#ma11-row-editor");
    const tableDefinition = tableByKey(getSettings().tableRegistry, tableKey);
    const targetTable = form.elements.namedItem("targetTableKey");
    targetTable.innerHTML = enabledTables(getSettings().tableRegistry)
        .map((table) => `<option value="${escapeHtml(table.key)}">${escapeHtml(table.name)}</option>`)
        .join("");
    targetTable.value = tableKey;
    applyRowEditorTable(form, tableKey);
    form.elements.namedItem("tableKey").value = tableKey;
    form.elements.namedItem("rowId").value = row?.id || "";
    form.elements.namedItem("title").value =
        row?.title || "";
    form.elements.namedItem("content").value =
        row?.content || "";
    form.elements.namedItem("status").value =
        row?.status || "active";
    form.elements.namedItem("keywords").value =
        row?.keywords.join(", ") || "";
    form.elements.namedItem("locked").checked = row?.locked ?? false;
    const objectFields = row?.fields ?? {};
    const setList = (name, value) => {
        form.elements.namedItem(name).value = Array.isArray(value) ? value.join("\n") : String(value ?? "");
    };
    setList("baseContent", objectFields.baseContent);
    setList("solidifiedHistory", objectFields.solidifiedHistory);
    setList("currentStates", objectFields.currentStates);
    setList("relatedObjects", objectFields.relatedObjects);
    setList("relatedEvents", objectFields.relatedEvents);
    setList("relationshipStates", objectFields.relationshipStates);
    setList("abilityStates", objectFields.abilityStates);
    const life = row?.lifecycle;
    form.elements.namedItem("existence").value = life?.existence || "未标注";
    form.elements.namedItem("activity").value = life?.activity || "未标注";
    form.elements.namedItem("memory").value = life?.memory || "未标注";
    form.elements.namedItem("evidenceLevel").value = life?.evidenceLevel || "未知";
    form.elements.namedItem("evidence").value = life?.evidence || "";
    form.elements.namedItem("returnConditions").value = life?.returnConditions.join("\n") || "";
    form.elements.namedItem("returnBlockers").value = life?.returnBlockers.join("\n") || "";
    backdrop.hidden = false;
    form.elements.namedItem("title").focus();
}
function closeEditor() {
    const workspace = document.querySelector("#ma11-workspace");
    const backdrop = workspace?.querySelector(".ma11-editor-backdrop");
    if (backdrop)
        backdrop.hidden = true;
    editorChatKey = null;
    editorMessageKey = null;
}
async function saveRow(form) {
    const info = editableArtifact();
    const sourceTableKey = form.elements.namedItem("tableKey")
        .value;
    const tableKey = form.elements.namedItem("targetTableKey")
        .value;
    const rowId = form.elements.namedItem("rowId").value;
    const title = form.elements.namedItem("title").value.trim();
    const content = form.elements.namedItem("content").value.trim();
    const status = form.elements.namedItem("status").value.trim();
    const keywords = form.elements.namedItem("keywords").value
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
    const locked = form.elements.namedItem("locked").checked;
    const supportsLifecycle = ["characters", "state"].includes(tableByKey(getSettings().tableRegistry, tableKey)?.role || "");
    const listFrom = (name) => form.elements.namedItem(name).value
        .split(/\n|[；;]/)
        .map((item) => item.trim())
        .filter(Boolean);
    const lifecycle = supportsLifecycle ? {
        existence: form.elements.namedItem("existence").value,
        activity: form.elements.namedItem("activity").value,
        memory: form.elements.namedItem("memory").value,
        evidenceLevel: form.elements.namedItem("evidenceLevel").value,
        evidence: form.elements.namedItem("evidence").value.trim(),
        returnConditions: listFrom("returnConditions"),
        returnBlockers: listFrom("returnBlockers"),
    } : undefined;
    const fields = {
        baseContent: form.elements.namedItem("baseContent").value.trim(),
        solidifiedHistory: listFrom("solidifiedHistory"),
        currentStates: listFrom("currentStates"),
        relatedObjects: listFrom("relatedObjects"),
        relatedEvents: listFrom("relatedEvents"),
    };
    if (supportsLifecycle) {
        fields.relationshipStates = listFrom("relationshipStates");
        fields.abilityStates = listFrom("abilityStates");
    }
    // 未勾选“完全锁定”时写成 base 锁：玩家基础保留，后续明确事实仍可更新 currentStates 等可变层。
    const rowPatch = {
        id: rowId || undefined,
        title,
        content,
        status,
        keywords,
        locked,
        lockMode: locked ? "all" : "base",
        lifecycle,
        fields,
    };
    info.artifact.snapshot = rowId && sourceTableKey !== tableKey
        ? moveManualRow(info.artifact.snapshot, sourceTableKey, tableKey, rowId, rowPatch, getSettings().tableRegistry)
        : upsertManualRow(info.artifact.snapshot, tableKey, rowPatch, getSettings().tableRegistry);
    if (rowId) {
        const canonical = (info.artifact.snapshot[tableKey] ?? []).find((row) => canonicalObjectTitle(row.title) === canonicalObjectTitle(title));
        if (canonical && canonical.id !== rowId) {
            const chatState = await getChatState(info.artifact.chatKey);
            if (chatState.focusObjectId === rowId) {
                chatState.focusObjectId = canonical.id;
                await putChatState(chatState);
            }
        }
    }
    const message = getMessage(info.index);
    if (message)
        attachArtifactToMessage(message, info.artifact);
    await putArtifact(info.artifact);
    await persistChatFor(info.artifact.chatKey);
    assertArtifactCommitCurrent(info.artifact);
    if (getSettings().lorebookSync)
        await retryStage(info.index, "sync");
    closeEditor();
    await renderWorkspace();
}
async function deleteRowAction(rowId) {
    const info = editableArtifact();
    const tableKey = getSettings().ui.activeTable;
    if (!confirm("确定删除这条状态吗？"))
        return;
    info.artifact.snapshot = deleteRow(info.artifact.snapshot, tableKey, rowId, getSettings().tableRegistry);
    const chatState = await getChatState(info.artifact.chatKey);
    if (chatState.focusObjectId === rowId) {
        chatState.focusObjectId = undefined;
        await putChatState(chatState);
    }
    const message = getMessage(info.index);
    if (message)
        attachArtifactToMessage(message, info.artifact);
    await putArtifact(info.artifact);
    await persistChatFor(info.artifact.chatKey);
    assertArtifactCommitCurrent(info.artifact);
    if (getSettings().lorebookSync)
        await retryStage(info.index, "sync");
    await renderWorkspace();
}
async function updateTableRegistryAndSync(registry) {
    const settings = getSettings();
    settings.tableRegistry = normalizeTableRegistry(registry);
    const active = enabledTables(settings.tableRegistry);
    if (!active.some((table) => table.key === settings.ui.activeTable))
        settings.ui.activeTable = active[0]?.key || "";
    settings.migration.dynamicTablesV23 = true;
    saveSettings();
    renderAllMessagePanels();
    const latest = latestSnapshotArtifact();
    if (settings.lorebookSync && latest && !readHistoryWorkflow(await getChatState(latest.artifact.chatKey)).blocked) {
        try {
            await retryStage(latest.index, "sync");
        }
        catch (error) {
            toast("warning", `表格设置已保存，但世界书刷新失败：${toErrorMessage(error)}`);
        }
    }
    await renderWorkspace();
}
function valueFromWorkspace(workspace, selector) {
    return workspace.querySelector(selector)?.value.trim() || "";
}
function applyTableSearch(workspace, value) {
    tableSearchQuery = value.trim().toLocaleLowerCase();
    const mobile = typeof window !== "undefined" && window.matchMedia?.("(max-width: 700px)").matches;
    const rows = Array.from(workspace.querySelectorAll(mobile ? "[data-ma11-table-card-search]" : "[data-ma11-table-row-search]"));
    let visible = 0;
    for (const row of rows) {
        const matches = !tableSearchQuery || String(mobile ? row.dataset.ma11TableCardSearch || "" : row.dataset.ma11TableRowSearch || "").includes(tableSearchQuery);
        row.hidden = !matches;
        if (matches)
            visible += 1;
    }
    const output = workspace.querySelector("[data-ma11-table-visible-count]");
    if (output)
        output.value = `${visible} / ${rows.length}`;
}
function applyEventProfileSearch(workspace, value) {
    graphSearchQuery = value.trim().toLocaleLowerCase();
    const cards = Array.from(workspace.querySelectorAll("[data-ma11-event-profile]"));
    let visible = 0;
    for (const card of cards) {
        const matches = !graphSearchQuery || String(card.dataset.ma11EventProfileSearch || "").includes(graphSearchQuery);
        card.hidden = !matches;
        if (matches)
            visible += 1;
    }
    const output = workspace.querySelector("[data-ma11-event-profile-match-count]");
    if (output)
        output.value = `${visible} / ${cards.length}`;
}
function applyGraphSearch(workspace, value) {
    graphSearchQuery = value.trim().toLocaleLowerCase();
    const matched = new Set();
    const nodes = Array.from(workspace.querySelectorAll("[data-ma11-graph-node]"));
    for (const node of nodes) {
        const matches = !graphSearchQuery || String(node.dataset.ma11GraphSearchText || "").includes(graphSearchQuery);
        node.classList.toggle("dimmed", Boolean(graphSearchQuery && !matches));
        node.classList.toggle("search-match", Boolean(graphSearchQuery && matches));
        if (matches && node.dataset.ma11GraphNode)
            matched.add(node.dataset.ma11GraphNode);
    }
    const edges = Array.from(workspace.querySelectorAll("[data-ma11-graph-edge-source]"));
    for (const edge of edges) {
        const connected = matched.has(String(edge.dataset.ma11GraphEdgeSource || "")) || matched.has(String(edge.dataset.ma11GraphEdgeTarget || ""));
        edge.classList.toggle("dimmed", Boolean(graphSearchQuery && !connected));
    }
    const output = workspace.querySelector("[data-ma11-graph-match-count]");
    if (output)
        output.value = `${matched.size} / ${nodes.length}`;
}
function announceWorkspace(workspace, message) {
    const live = workspace.querySelector("[data-ma11-live]");
    if (live)
        live.textContent = message;
}
function updateSetting(target) {
    const key = target.dataset.ma11Setting;
    if (!key)
        return;
    const settings = getSettings();
    const value = target instanceof HTMLInputElement && target.type === "checkbox"
        ? target.checked
        : target instanceof HTMLInputElement && target.type === "number"
            ? Number(target.value)
            : target.value;
    settings[key] = value;
    saveSettings();
    if (key === "enabled") {
        setRequestAcceptance(Boolean(value));
        taskQueue.setAccepting(Boolean(value));
        if (!value)
            abortActiveRequests();
        const quick = document.querySelector('[data-ma11-quick-setting="enabled"]');
        if (quick)
            quick.checked = Boolean(value);
        renderAllMessagePanels();
        void renderWorkspace();
    }
    if (key === "showMessagePanel")
        renderAllMessagePanels();
    if (key === "lorebookLayout")
        void renderWorkspace();
}
function updateHostControl(target) {
    const key = target.dataset.ma11HostControl;
    if (!key)
        return;
    getSettings().hostControl[key] = target.checked;
    saveSettings();
    void renderWorkspace();
}
function updateConnection(target) {
    const modeTask = target.dataset.ma11ConnectionMode;
    const profileTask = target.dataset.ma11ConnectionProfileId;
    const settings = getSettings();
    let shouldRender = false;
    if (modeTask) {
        settings.connections[modeTask].mode = target.value;
        shouldRender = true;
    }
    if (profileTask) {
        settings.connections[profileTask].profileId = safeText(target.value, 160).trim();
        const selected = connectionProfiles().find((profile) => profile.id === settings.connections[profileTask].profileId);
        settings.connections[profileTask].profile = selected?.name || '';
    }
    saveSettings();
    if (shouldRender)
        void renderWorkspace();
}
function bindWorkspace(workspace) {
    workspace.addEventListener("click", async (event) => {
        const target = event.target;
        const tab = target.closest("[data-ma11-tab]")?.dataset.ma11Tab;
        if (tab)
            return setTab(tab);
        const action = target.closest("[data-ma11-action]")?.dataset.ma11Action;
        const actionButton = action ? target.closest("[data-ma11-action]") : null;
        const testButton = target.closest("[data-ma11-test]");
        const busyButton = actionButton ?? testButton;
        const originalButtonText = busyButton?.textContent ?? "";
        const pipelineAction = [
            "process-latest", "recalculate-history", "run-audit", "run-revision", "run-state",
            "force-small", "force-large", "sync-now", "maintain-lorebook", "set-focus", "clear-focus",
        ].includes(action || "");
        if (pipelineAction && workspacePipelineBusy())
            return;
        if (pipelineAction) {
            workspacePipelineActionPending = true;
            scheduleWorkspaceRender();
        }
        try {
            if (busyButton && !["close", "open-tables", "open-graph", "close-editor"].includes(action || "")) {
                busyButton.disabled = true;
                busyButton.setAttribute("aria-busy", "true");
                busyButton.textContent = "处理中…";
            }
            if (action === "close") {
                closeWorkspace();
                return;
            }
            if (action === "open-tables")
                setTab("tables");
            if (action === "open-graph")
                setTab("graph");
            if (action === "open-table-manager")
                setTab("tableManager");
            if (action === "open-rule-center")
                setTab("tableManager");
            if (action === "open-prompt-diagnostics") {
                diagnosticPromptKind = "state";
                setTab("diagnostics");
            }
            if (action === "process-latest") {
                if (!getSettings().enabled)
                    throw new Error("镜渊已关闭，请先启用");
                const index = latestAssistantIndex();
                if (index < 0)
                    throw new Error("没有可整理的AI正文");
                selectedMessageIndex = index;
                await processMessage(index, false);
                await renderWorkspace();
            }
            if (action === "recalculate-history") {
                const state = await getChatState(currentChatKey());
                if (readHistoryWorkflow(state).startIndex === undefined) {
                    const answer = window.prompt(`请输入重算起点（1-${Math.max(1, getChat().length)}）`, "1");
                    if (answer === null)
                        return;
                    const start = Number(answer);
                    if (!Number.isInteger(start) || start < 1 || start > Math.max(1, getChat().length)) {
                        throw new Error("重算起点必须是当前聊天范围内的消息序号");
                    }
                    await chooseHistoryRecalculationStart(start - 1);
                }
                await recalculateInvalidatedHistory();
                selectedMessageIndex = null;
                await renderWorkspace();
            }
            const stageCommand = action ? resolveWorkspaceStageCommand(action) : null;
            if (stageCommand?.kind === "retry") {
                const index = latestAssistantIndex();
                if (index < 0)
                    throw new Error("没有可处理的AI正文");
                selectedMessageIndex = index;
                await retryStage(index, stageCommand.stage);
                await renderWorkspace();
            }
            if (stageCommand?.kind === "summary") {
                const info = latestSnapshotArtifact();
                if (!info)
                    throw new Error("尚无可总结的状态");
                await forceSummary(info.index, stageCommand.summary);
                await renderWorkspace();
            }
            if (action === "sync-now") {
                const info = latestSnapshotArtifact();
                if (!info)
                    throw new Error("尚无可同步的状态");
                await retryStage(info.index, "sync");
                await renderWorkspace();
            }
            if (action === "maintain-lorebook") {
                const info = latestSnapshotArtifact();
                if (!info)
                    throw new Error("尚无可同步的状态");
                const preview = await previewLorebookMaintenance(info.index);
                const warning = [
                    `检测到 ${preview.legacyCandidates} 个历史候选，其中 ${preview.removable} 个可安全处理。`,
                    `将保留 ${preview.protectedForeign} 个其他聊天条目和 ${preview.protectedUnknown} 个共享书 owner 未知条目。`,
                    "确认后将按对象清理并重新发布当前真实快照。",
                ].join("\n");
                if (!window.confirm(warning))
                    return;
                await applyLorebookMaintenance(info.index);
                await renderWorkspace();
            }
            if (action === "save-summary-prompt" || action === "restore-summary-prompt") {
                const kind = actionButton?.dataset.ma11SummaryKind;
                if (!kind)
                    throw new Error("无法确定总结提示词类型");
                const settings = getSettings();
                if (action === "restore-summary-prompt") {
                    settings.summaryPrompts[kind] = structuredClone(DEFAULT_SUMMARY_PROMPTS[kind]);
                    saveSettings();
                    toast("success", `${kind === 'small' ? '小总结' : '大总结'}提示词已恢复默认`);
                    await renderWorkspace();
                }
                else {
                    const next = { ...settings.summaryPrompts[kind] };
                    for (const section of ['coreQuestion', 'includeRules', 'excludeRules', 'updateRules', 'expressionRules']) {
                        const input = workspace.querySelector(`[data-ma11-summary-prompt="${kind}"][data-ma11-summary-section="${section}"]`);
                        const value = safeText(input?.value, 6000).trim();
                        if (!value)
                            throw new Error(`${kind === 'small' ? '小总结' : '大总结'}的“${section}”不能为空`);
                        next[section] = value;
                    }
                    settings.summaryPrompts[kind] = next;
                    saveSettings();
                    toast("success", `${kind === 'small' ? '小总结' : '大总结'}提示词已保存`);
                    await renderWorkspace();
                }
            }
            if (action === "save-state-prompt" || action === "restore-state-prompt") {
                const settings = getSettings();
                if (action === "restore-state-prompt") {
                    settings.statePrompts = structuredClone(DEFAULT_STATE_PROMPTS);
                    saveSettings();
                    toast("success", "事实提取规则已恢复标准值");
                    await renderWorkspace();
                }
                else {
                    const admissionRules = safeText(workspace.querySelector('[data-ma11-state-prompt="admissionRules"]')?.value, 8000).trim();
                    const exclusionRules = safeText(workspace.querySelector('[data-ma11-state-prompt="exclusionRules"]')?.value, 8000).trim();
                    const routingRules = safeText(workspace.querySelector('[data-ma11-state-prompt="routingRules"]')?.value, 8000).trim();
                    const evidenceRules = safeText(workspace.querySelector('[data-ma11-state-prompt="evidenceRules"]')?.value, 8000).trim();
                    const updateRules = safeText(workspace.querySelector('[data-ma11-state-prompt="updateRules"]')?.value, 8000).trim();
                    if (!admissionRules || !exclusionRules || !routingRules || !evidenceRules || !updateRules)
                        throw new Error("五个事实提取规则区都不能为空");
                    settings.statePrompts = { admissionRules, exclusionRules, routingRules, evidenceRules, updateRules };
                    saveSettings();
                    toast("success", "事实提取规则已保存，将从下一次状态提取开始生效");
                    await renderWorkspace();
                }
            }
            if (action === "restore-standard-rules") {
                const settings = getSettings();
                settings.statePrompts = structuredClone(DEFAULT_STATE_PROMPTS);
                settings.summaryPrompts = structuredClone(DEFAULT_SUMMARY_PROMPTS);
                saveSettings();
                toast("success", "已应用标准记忆规则");
                announceWorkspace(workspace, "标准记忆规则已应用");
                await renderWorkspace();
            }
            const tableDefinitionKey = actionButton?.dataset.ma11TableKey || "";
            if (action === "create-table") {
                const name = valueFromWorkspace(workspace, "[data-ma11-new-table-name]");
                const purpose = valueFromWorkspace(workspace, "[data-ma11-new-table-purpose]");
                const fields = valueFromWorkspace(workspace, "[data-ma11-new-table-fields]");
                if (!name)
                    throw new Error("请填写表格名称");
                await updateTableRegistryAndSync(createCustomTable(getSettings().tableRegistry, name, purpose, fields));
                toast("success", "自定义表格已新增，将从下一次状态提取开始生效");
            }
            if (action === "save-table" && tableDefinitionKey) {
                const name = valueFromWorkspace(workspace, `[data-ma11-table-name="${tableDefinitionKey}"]`);
                const purpose = valueFromWorkspace(workspace, `[data-ma11-table-purpose="${tableDefinitionKey}"]`);
                const headers = valueFromWorkspace(workspace, `[data-ma11-table-headers="${tableDefinitionKey}"]`);
                const fields = valueFromWorkspace(workspace, `[data-ma11-table-fields="${tableDefinitionKey}"]`);
                if (!name || !purpose)
                    throw new Error("表格名称和用途说明不能为空");
                let registry = updateTableDefinition(getSettings().tableRegistry, tableDefinitionKey, { name, purpose });
                registry = updateTableHeaders(registry, tableDefinitionKey, headers);
                registry = updateTableFields(registry, tableDefinitionKey, fields);
                await updateTableRegistryAndSync(registry);
                toast("success", "表格定义已更新，将从下一次状态提取开始生效");
            }
            if (action === "move-table-up" && tableDefinitionKey)
                await updateTableRegistryAndSync(moveTableDefinition(getSettings().tableRegistry, tableDefinitionKey, -1));
            if (action === "move-table-down" && tableDefinitionKey)
                await updateTableRegistryAndSync(moveTableDefinition(getSettings().tableRegistry, tableDefinitionKey, 1));
            if (action === "delete-table" && tableDefinitionKey) {
                const definition = tableByKey(getSettings().tableRegistry, tableDefinitionKey);
                const warning = definition?.isDefault
                    ? `确定删除默认视图“${definition.name}”吗？只会删除可见视图，不会删除内部事实、事件线、小总结、大总结或历史重建数据。`
                    : `确定删除自定义视图“${definition?.name || tableDefinitionKey}”吗？内部事实和总结不会删除。`;
                if (window.confirm(warning))
                    await updateTableRegistryAndSync(removeTableDefinition(getSettings().tableRegistry, tableDefinitionKey));
            }
            if (action === "restore-default-tables") {
                if (window.confirm("恢复默认八表会替换当前表格注册表；自定义视图将退出，但内部事实、总结和人工世界书条目不会删除。是否继续？")) {
                    await updateTableRegistryAndSync(restoreDefaultTableRegistry());
                    toast("success", "已恢复默认八表");
                }
            }
            if (action === "set-focus" || action === "clear-focus") {
                const rowId = actionButton?.dataset.ma11FocusRow || "";
                const info = latestSnapshotArtifact();
                if (!info?.artifact.snapshot)
                    throw new Error("尚无可设置焦点的角色视图");
                const registry = normalizeTableRegistry(getSettings().tableRegistry);
                const characterTable = registry.find((table) => ["characters", "state"].includes(table.role));
                if (!characterTable)
                    throw new Error("当前没有角色视图");
                const row = (info.artifact.snapshot[characterTable.key] ?? []).find((item) => item.id === rowId);
                if (action === "set-focus" && !row)
                    throw new Error("焦点目标不是当前角色条目");
                const state = await getChatState(info.artifact.chatKey);
                // 焦点只是聊天级 constant 开关：不写角色正文、不改状态、不触发任何模型任务。
                state.focusObjectId = action === "set-focus" ? rowId : undefined;
                await putChatState(state);
                if (getSettings().lorebookSync)
                    await retryStage(info.index, "sync");
                toast("success", action === "set-focus" ? `已将“${row?.title || "角色"}”设为唯一常驻焦点` : "已取消常驻焦点");
                await renderWorkspace();
            }
            if (action === "add-row")
                openRowEditor(getSettings().ui.activeTable);
            if (action === "close-editor")
                closeEditor();
            if (action === "refresh-diagnostics")
                await renderWorkspace();
            if (action === "copy-diagnostics") {
                const report = await diagnosticReport();
                await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
                toast("success", "诊断信息已复制");
            }
            if (action === "copy-current-prompt") {
                const prompt = workspace.querySelector("[data-ma11-current-prompt]")?.value || "";
                if (!prompt)
                    throw new Error("当前没有可复制的提示词");
                await navigator.clipboard.writeText(prompt);
                toast("success", "当前提示词已复制");
            }
            if (action === "restart-plugin") {
                const restart = globalThis.MirrorAbyss?.restart;
                if (typeof restart !== "function")
                    throw new Error("插件重置入口不可用");
                toast("info", "正在重置镜渊插件…");
                await restart();
                return;
            }
            if (action === "reset-current-game") {
                if (!window.confirm("这会删除当前聊天的镜渊表格、总结、审核记录和镜渊世界书条目。其他聊天和插件设置不受影响；删除后只能重新调用模型整理，无法自动恢复。是否继续？"))
                    return;
                const result = await resetCurrentGame();
                resetWorkspaceContext();
                renderAllMessagePanels();
                toast("success", `当前游戏已重置：清除 ${result.messages} 条消息记录、${result.lorebookEntries} 个世界书条目`);
                await renderWorkspace();
            }
            const memoryView = target.closest("[data-ma11-memory-view]")
                ?.dataset.ma11MemoryView;
            if (memoryView) {
                getSettings().ui.memoryView = memoryView;
                saveSettings();
                await renderWorkspace();
            }
            const locateGraphNodeId = target.closest("[data-ma11-locate-graph-node]")
                ?.dataset.ma11LocateGraphNode;
            if (locateGraphNodeId) {
                selectedGraphNodeId = locateGraphNodeId;
                getSettings().ui.memoryView = "combined";
                getSettings().ui.graphScope = "world";
                saveSettings();
                await renderWorkspace();
                workspace.querySelector(".ma11-memory-graph-pane")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }
            const graphScope = target.closest("[data-ma11-graph-scope]")
                ?.dataset.ma11GraphScope;
            if (graphScope) {
                getSettings().ui.graphScope = graphScope;
                selectedGraphNodeId = null;
                saveSettings();
                await renderWorkspace();
            }
            const graphZoomAction = target.closest("[data-ma11-graph-zoom]")
                ?.dataset.ma11GraphZoom;
            if (graphZoomAction) {
                const settings = getSettings();
                const current = clampGraphZoom(settings.ui.graphZoom);
                if (graphZoomAction === "in")
                    settings.ui.graphZoom = clampGraphZoom(current + 0.15);
                if (graphZoomAction === "out")
                    settings.ui.graphZoom = clampGraphZoom(current - 0.15);
                if (graphZoomAction === "reset")
                    settings.ui.graphZoom = 1;
                if (graphZoomAction === "fit") {
                    const canvas = workspace.querySelector(".ma11-graph-canvas");
                    const availableWidth = Math.max(320, canvas?.clientWidth || 760);
                    const availableHeight = Math.max(280, canvas?.clientHeight || 560);
                    settings.ui.graphZoom = clampGraphZoom(Math.min(availableWidth / 1000, availableHeight / 680));
                }
                saveSettings();
                await renderWorkspace();
            }
            const graphNodeId = target.closest("[data-ma11-graph-node]")
                ?.dataset.ma11GraphNode;
            if (graphNodeId) {
                selectedGraphNodeId = graphNodeId;
                await renderWorkspace();
            }
            const table = target.closest("[data-ma11-table]")?.dataset
                .ma11Table;
            if (table) {
                getSettings().ui.activeTable = table;
                saveSettings();
                await renderWorkspace();
            }
            const editId = target.closest("[data-ma11-edit-row]")
                ?.dataset.ma11EditRow;
            if (editId) {
                const info = currentArtifact();
                const key = getSettings().ui.activeTable;
                const row = info?.artifact.snapshot?.[key].find((item) => item.id === editId);
                if (row)
                    openRowEditor(key, row);
            }
            const deleteId = target.closest("[data-ma11-delete-row]")
                ?.dataset.ma11DeleteRow;
            if (deleteId)
                await deleteRowAction(deleteId);
            const testTask = target.closest("[data-ma11-test]")?.dataset
                .ma11Test;
            if (testTask) {
                const result = await testConnection(testTask);
                const detail = `${result.method}；耗时${result.elapsedMs}ms；连接${result.connected ? "成功" : "失败"}；固定文本${result.protocolValid ? "有效" : "无效"}；精确遵循${result.instructionFollowed ? "通过" : "未通过"}`;
                const diagnostic = result.protocolDetail ? `；协议诊断：${result.protocolDetail}` : "";
                toast(result.instructionFollowed ? "success" : "warning", result.instructionFollowed ? `${detail}${diagnostic}` : `${detail}${diagnostic}；返回：${result.responsePreview}`);
            }
        }
        catch (error) {
            toast("error", toErrorMessage(error));
        }
        finally {
            if (pipelineAction) {
                workspacePipelineActionPending = false;
                scheduleWorkspaceRender();
            }
            if (busyButton?.isConnected) {
                if (!pipelineAction)
                    busyButton.disabled = false;
                busyButton.removeAttribute("aria-busy");
                busyButton.textContent = originalButtonText;
            }
        }
    });
    workspace.addEventListener("change", (event) => {
        const target = event.target;
        if (target instanceof HTMLSelectElement && target.name === "targetTableKey") {
            const form = target.closest("#ma11-row-editor");
            if (form)
                applyRowEditorTable(form, target.value);
        }
        if (target.dataset.ma11Setting)
            updateSetting(target);
        if (target instanceof HTMLInputElement && target.dataset.ma11HostControl)
            updateHostControl(target);
        if (target.dataset.ma11RecallSetting) {
            const key = target.dataset.ma11RecallSetting;
            const value = Number(target.value);
            getSettings().lorebookRecall[key] = value;
            saveSettings();
        }
        if (target.dataset.ma11EntryLimit) {
            const key = target.dataset.ma11EntryLimit;
            const value = Math.min(20000, Math.max(200, Math.round(Number(target.value) || 1200)));
            getSettings().contentLimits.tables[key] = value;
            target.value = String(value);
            saveSettings();
        }
        if (target.dataset.ma11SummaryLimit) {
            const key = target.dataset.ma11SummaryLimit;
            const minimum = key === "largeSummary" ? 300 : 200;
            const maximum = key === "largeSummary" ? 20000 : 10000;
            const value = Math.min(maximum, Math.max(minimum, Math.round(Number(target.value) || (key === "largeSummary" ? 1800 : 700))));
            getSettings().contentLimits[key] = value;
            target.value = String(value);
            saveSettings();
        }
        if (target.dataset.ma11TableEnabled) {
            const key = target.dataset.ma11TableEnabled;
            const checked = target instanceof HTMLInputElement ? target.checked : false;
            void updateTableRegistryAndSync(updateTableDefinition(getSettings().tableRegistry, key, { enabled: checked }))
                .catch((error) => toast("error", toErrorMessage(error)));
        }
        if (target.dataset.ma11ConnectionMode ||
            target.dataset.ma11ConnectionProfileId)
            updateConnection(target);
        if (target.dataset.ma11PromptInspector !== undefined) {
            diagnosticPromptKind = target.value;
            void renderWorkspace();
        }
    });
    workspace.addEventListener("input", (event) => {
        const target = event.target;
        if (target.dataset.ma11TableSearch !== undefined) {
            applyTableSearch(workspace, target.value);
            return;
        }
        if (target.dataset.ma11EventProfileSearchInput !== undefined) {
            applyEventProfileSearch(workspace, target.value);
            return;
        }
        if (target.dataset.ma11GraphSearch !== undefined) {
            applyGraphSearch(workspace, target.value);
            return;
        }
        if (target.dataset.ma11GraphZoomRange !== undefined) {
            getSettings().ui.graphZoom = clampGraphZoom(Number(target.value) / 100);
            saveSettings();
            const output = workspace.querySelector(".ma11-graph-zoom output");
            if (output)
                output.value = `${Math.round(getSettings().ui.graphZoom * 100)}%`;
            const svg = workspace.querySelector(".ma11-graph-canvas svg");
            if (svg) {
                const zoom = getSettings().ui.graphZoom;
                svg.setAttribute("width", String(Math.round(1000 * zoom)));
                svg.setAttribute("height", String(Math.round(760 * zoom)));
                const compact = window.matchMedia?.("(max-width: 900px)").matches;
                svg.setAttribute("style", compact
                    ? `width:${Math.max(100, Math.round(zoom * 100))}%;height:100%;min-height:100%;`
                    : `width:${Math.round(1000 * zoom)}px;height:${Math.round(760 * zoom)}px`);
            }
            return;
        }
        if (target.dataset.ma11Setting === "auditPrompt" ||
            target.dataset.ma11Setting === "revisionPrompt" ||
            target.dataset.ma11Setting === "lorebookName")
            updateSetting(target);
        if (target.dataset.ma11ConnectionProfileId)
            updateConnection(target);
    });
    workspace.addEventListener("focusout", () => {
        window.setTimeout(() => {
            if (!workspaceRenderDeferred || workspaceHasFocusedEditor(workspace) || workspaceHasUnsavedSurface(workspace))
                return;
            workspaceRenderDeferred = false;
            scheduleWorkspaceRender();
        }, 0);
    });
    workspace
        .querySelector("#ma11-row-editor")
        ?.addEventListener("submit", (event) => {
        event.preventDefault();
        if (savingRow)
            return;
        savingRow = true;
        const form = event.currentTarget;
        const submit = form.querySelector('button[type="submit"]');
        if (submit) {
            submit.disabled = true;
            submit.textContent = "保存中…";
        }
        void saveRow(form)
            .catch((error) => toast("error", toErrorMessage(error)))
            .finally(() => {
            savingRow = false;
            if (submit?.isConnected) {
                submit.disabled = false;
                submit.textContent = "保存";
            }
        });
    });
}
export function resolveWorkspaceMessageSelection(messageIndex) {
    return Number.isInteger(messageIndex) ? Number(messageIndex) : null;
}
export function openWorkspace(tab, messageIndex) {
    const workspace = root();
    selectedMessageIndex = resolveWorkspaceMessageSelection(messageIndex);
    if (tab)
        getSettings().ui.activeTab = tab;
    workspace.hidden = false;
    lockWorkspaceViewport();
    void renderWorkspace();
}
export function closeWorkspace() {
    closeEditor();
    const workspace = document.querySelector("#ma11-workspace");
    if (workspace)
        workspace.hidden = true;
    unlockWorkspaceViewport();
}
export function resetWorkspaceContext() {
    selectedMessageIndex = null;
    selectedGraphNodeId = null;
    closeEditor();
}
export function disposeWorkspace() {
    resetWorkspaceContext();
    queueUnsubscribe?.();
    queueUnsubscribe = null;
    pipelineUnsubscribe?.();
    pipelineUnsubscribe = null;
    savingRow = false;
    workspacePipelineActionPending = false;
    workspaceRenderScheduled = false;
    workspaceRenderDeferred = false;
    renderAgain = false;
    unlockWorkspaceViewport();
    document.querySelector("#ma11-workspace")?.remove();
}
export function refreshWorkspace() {
    void renderWorkspace();
}
