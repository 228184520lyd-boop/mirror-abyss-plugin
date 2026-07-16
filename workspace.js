import { TABLE_KEYS, TABLE_LABELS, VERSION, } from "../constants.js";
import { getChat, currentChatKey, getMessage, getSettings, latestAssistantIndex, persistChat, saveSettings, toast, } from "../core/context.js";
import { assertArtifactCommitCurrent } from "../core/commit-guard.js";
import { escapeHtml, safeText, toErrorMessage } from "../core/utils.js";
import { attachArtifactToMessage } from "../domain/artifact.js";
import { deleteRow, snapshotRowCount, upsertManualRow, } from "../domain/snapshot.js";
import { buildRelationshipGraph, } from "../domain/graph.js";
import { listSupportedConnectionProfiles, testConnection } from "../llm/generator.js";
import { forceSummary, getArtifactAt, latestArtifact, latestSnapshotArtifact, processMessage, recalculateInvalidatedHistory, resetCurrentGame, chooseHistoryRecalculationStart, retryStage, } from "../pipeline/pipeline.js";
import { taskQueue } from "../pipeline/task-queue.js";
import { getChatState, putArtifact } from "../storage/repository.js";
import { diagnosticReport, runDiagnostics } from "./diagnostics.js";
import { renderAllMessagePanels } from "./message-panel.js";
import { abortActiveRequests, setRequestAcceptance } from "../core/requests.js";
let selectedMessageIndex = null;
let rendering = false;
let renderAgain = false;
let queueUnsubscribe = null;
let selectedGraphNodeId = null;
let editorChatKey = null;
let editorMessageKey = null;
let savingRow = false;
function clampGraphZoom(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric))
        return 1;
    return Math.min(2.5, Math.max(0.5, Math.round(numeric * 20) / 20));
}
function root() {
    let element = document.querySelector("#ma11-workspace");
    if (element)
        return element;
    document.body.insertAdjacentHTML("beforeend", `
    <div id="ma11-workspace" class="ma11-workspace" hidden>
      <div class="ma11-shell" role="dialog" aria-modal="true" aria-label="镜渊控制中心">
        <header class="ma11-header">
          <div>
            <div class="ma11-brand">镜渊 <span>${VERSION}</span></div>
            <div class="ma11-subtitle">结构化状态、分层总结与世界书发布</div>
          </div>
          <button class="ma11-icon-button" data-ma11-action="close" aria-label="关闭">×</button>
        </header>
        <nav class="ma11-tabs" aria-label="镜渊功能">
          ${[
        ["overview", "总览"],
        ["tables", "状态表"],
        ["graph", "关系图谱"],
        ["summaries", "总结"],
        ["audit", "规则审核"],
        ["sync", "世界书"],
        ["settings", "模型与设置"],
        ["diagnostics", "诊断"],
    ]
        .map(([key, label]) => `<button data-ma11-tab="${key}">${label}</button>`)
        .join("")}
        </nav>
        <main id="ma11-workspace-content" class="ma11-content"></main>
      </div>
      <div class="ma11-editor-backdrop" hidden>
        <form class="ma11-editor" id="ma11-row-editor">
          <header><b>编辑状态行</b><button type="button" data-ma11-action="close-editor">×</button></header>
          <input type="hidden" name="tableKey" />
          <input type="hidden" name="rowId" />
          <label>对象<input name="title" required maxlength="240" /></label>
          <label>当前事实<textarea name="content" rows="6" maxlength="12000"></textarea></label>
          <label>状态<input name="status" maxlength="120" /></label>
          <label>关键词（逗号分隔）<input name="keywords" maxlength="800" /></label>
          <label class="ma11-switch"><input type="checkbox" name="locked" /><span>玩家锁定（自动整理不得覆盖）</span></label>
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
    queueUnsubscribe ||= taskQueue.subscribe(handleQueueChange);
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
function statusText(value) {
    const map = {
        idle: "等待",
        queued: "排队",
        running: "处理中",
        success: "成功",
        failed: "失败",
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
    if (value === "running" || value === "queued")
        return "working";
    return "neutral";
}
function stageCards(artifact) {
    const stages = artifact?.stages;
    const rows = [
        ["audit", "规则审核"],
        ["state", "状态提取"],
        ["summary", "分层总结"],
        ["sync", "世界书同步"],
    ];
    return `<div class="ma11-stage-grid">${rows
        .map(([key, label]) => {
        const stage = stages?.[key] ?? { status: "idle", attempts: 0 };
        return `<article class="ma11-stage-card ${statusClass(stage.status)}">
      <div><b>${label}</b><span>${statusText(stage.status)}</span></div>
      <small>尝试 ${stage.attempts || 0} 次</small>
      ${stage.error ? `<p>${escapeHtml(stage.error)}</p>` : ""}
    </article>`;
    })
        .join("")}</div>`;
}
function recentTasksHtml() {
    const jobs = taskQueue.list().slice(0, 5);
    return {
        count: jobs.length,
        html: jobs.length
            ? jobs.map((task) => `<div><span>${escapeHtml(task.label)}</span><em class="${task.state}">${escapeHtml(task.state)}</em></div>`).join("")
            : '<p class="ma11-empty">没有运行中的任务。</p>',
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
    if (taskQueue.list().some((task) => task.state === "queued" || task.state === "running"))
        return;
    const workspace = document.querySelector("#ma11-workspace");
    const active = document.activeElement;
    if (workspace?.contains(active) && active?.matches("input, textarea, select, button"))
        return;
    void renderWorkspace();
}
async function overviewHtml(artifactInfo) {
    const enabled = getSettings().enabled;
    const artifact = artifactInfo?.artifact;
    const chatState = await getChatState(currentChatKey());
    const rows = snapshotRowCount(artifact?.snapshot);
    const tasks = recentTasksHtml();
    return `
    ${chatState.historyInvalidation ? `<section class="ma11-card ma11-history-warning"><header><b>历史数据需要重算</b><span>世界书同步已暂停</span></header><p>${chatState.historyInvalidation.startIndex === undefined ? "检测到历史删除，但无法自动判断删除位置。现有派生记忆尚未清除，请选择重算起点。" : `第 ${chatState.historyInvalidation.startIndex + 1} 条消息发生了${chatState.historyInvalidation.reason === "edited" ? "编辑" : chatState.historyInvalidation.reason === "swiped" ? "换页" : "删除"}。镜渊会先尝试自动重建；自动重建失败时可从这里手动重算。`}</p><div class="ma11-actions"><button data-ma11-action="recalculate-history">${chatState.historyInvalidation.startIndex === undefined ? "选择起点并重算" : "从变更位置开始重算"}</button></div></section>` : ""}
    <section class="ma11-hero">
      <div>
        <h2>${artifact ? `第 ${artifact.messageIndex + 1} 条正文` : "当前聊天尚无镜渊记录"}</h2>
        <p>${artifact ? `状态表 ${rows} 条 · 更新时间 ${escapeHtml(new Date(artifact.updatedAt).toLocaleString())}` : "生成一条AI正文，或手动整理最新正文。"}</p>
      </div>
      <div class="ma11-actions">
        <button data-ma11-action="process-latest" ${enabled ? "" : "disabled"}>整理最新正文</button>
        <button data-ma11-action="open-tables" ${artifact?.snapshot ? "" : "disabled"}>查看状态表</button>
        <button data-ma11-action="open-graph" ${artifact?.snapshot ? "" : "disabled"}>关系图谱</button>
      </div>
    </section>
    ${stageCards(artifact)}
    <section class="ma11-card">
      <header><b>任务队列</b><span data-ma11-task-count>${tasks.count ? `${tasks.count} 条最近任务` : "空闲"}</span></header>
      <div class="ma11-task-list" data-ma11-task-list>
        ${tasks.html}
      </div>
    </section>
    <section class="ma11-card ma11-note">
      <b>本版架构原则</b>
      <p>每条AI正文只创建一个唯一任务；审核、表格、总结、同步分阶段保存。单一阶段失败时只重试该阶段，不重新调用整条管线。</p>
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
function tableHtml(artifactInfo) {
    const settings = getSettings();
    const artifact = artifactInfo?.artifact;
    const latest = latestSnapshotArtifact();
    const editable = Boolean(settings.enabled
        && artifactInfo
        && latest
        && latest.artifact.messageKey === artifactInfo.artifact.messageKey);
    const active = settings.ui.activeTable;
    const rows = artifact?.snapshot?.[active] ?? [];
    return `
    <section class="ma11-toolbar ma11-table-toolbar">
      <div class="ma11-table-tabs">${TABLE_KEYS.map((key) => `<button class="${key === active ? "active" : ""}" data-ma11-table="${key}">${TABLE_LABELS[key]} <span>${artifact?.snapshot?.[key]?.length ?? 0}</span></button>`).join("")}</div>
      <div class="ma11-actions"><button data-ma11-action="add-row" ${editable ? "" : "disabled"}>＋ 添加</button><button data-ma11-action="retry-state" ${settings.enabled && artifactInfo?.index === latestAssistantIndex() ? "" : "disabled"}>重新整理</button></div>
    </section>
    <p class="ma11-table-hint">表格保持横向排版。手机端请在表格区域左右滑动，不会再把中文压成竖排。</p>
    <section class="ma11-table-wrap" role="region" aria-label="${TABLE_LABELS[active]}状态表" tabindex="0">
      ${artifact?.snapshot
        ? `<table class="ma11-table">
        <colgroup><col class="ma11-col-index"/><col class="ma11-col-title"/><col class="ma11-col-content"/><col class="ma11-col-state"/><col class="ma11-col-meta"/><col class="ma11-col-actions"/></colgroup>
        <thead><tr><th>序号</th><th>对象</th><th>当前记录</th><th>状态与关键词</th><th>来源与更新时间</th><th>操作</th></tr></thead>
        <tbody>${rows.length
            ? rows
                .map((row, index) => `<tr>
          <td>${index + 1}</td>
          <td class="ma11-cell-title"><b>${escapeHtml(row.title)}</b></td>
          <td class="ma11-cell-content">${escapeHtml(row.content)}</td>
          <td><div class="ma11-cell-status">${row.status ? `<span class="ma11-status-text">${escapeHtml(row.status)}</span>` : ""}${lifecycleHtml(row)}<div class="ma11-keyword-list">${row.keywords.map((word) => `<span class="ma11-keyword">${escapeHtml(word)}</span>`).join("")}</div></div></td>
          <td><div class="ma11-cell-meta"><span class="ma11-source ${row.source}">${row.source === "manual" || row.locked ? "玩家锁定" : "自动"}</span><time>${escapeHtml(new Date(row.updatedAt).toLocaleString())}</time></div></td>
          <td><div class="ma11-row-actions"><button data-ma11-edit-row="${escapeHtml(row.id)}" ${editable ? "" : "disabled"}>编辑</button><button class="danger" data-ma11-delete-row="${escapeHtml(row.id)}" ${editable ? "" : "disabled"}>删除</button></div></td>
        </tr>`)
                .join("")
            : `<tr><td colspan="6" class="ma11-empty">该分类暂无记录。</td></tr>`}</tbody>
      </table>`
        : '<div class="ma11-empty-panel">尚无状态表。点击“整理最新正文”。</div>'}
    </section>`;
}
function graphNodePositions(graph) {
    const width = 1000;
    const height = 680;
    const center = { x: width / 2, y: height / 2 };
    const groups = new Map();
    for (const node of graph.nodes) {
        const key = node.type === "focus"
            ? "focus"
            : node.type === "character"
                ? "character"
                : node.type === "relationship"
                    ? "relationship"
                    : "world";
        if (!groups.has(key))
            groups.set(key, []);
        groups.get(key).push(node);
    }
    const output = [];
    const focus = groups.get("focus") ?? [];
    focus.forEach((node, index) => output.push({ ...node, x: center.x + index * 56, y: center.y }));
    const ring = (key, radiusX, radiusY, offset = 0) => {
        const nodes = groups.get(key) ?? [];
        nodes.forEach((node, index) => {
            const angle = offset + (Math.PI * 2 * index) / Math.max(nodes.length, 1);
            output.push({
                ...node,
                x: center.x + Math.cos(angle) * radiusX,
                y: center.y + Math.sin(angle) * radiusY,
            });
        });
    };
    ring("character", 250, 185, -Math.PI / 2);
    ring("relationship", 365, 250, Math.PI / 6);
    ring("world", 455, 300, 0);
    if (!focus.length && output.length) {
        output[0].x = center.x;
        output[0].y = center.y;
    }
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
function graphHtml(artifactInfo) {
    const settings = getSettings();
    const snapshot = artifactInfo?.artifact.snapshot;
    const graph = buildRelationshipGraph(snapshot, settings.ui.graphScope);
    const positioned = graphNodePositions(graph);
    const positions = new Map(positioned.map((node) => [node.id, node]));
    const selected = positioned.find((node) => node.id === selectedGraphNodeId) ?? positioned[0];
    if (selected && !selectedGraphNodeId)
        selectedGraphNodeId = selected.id;
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
        return `<g class="ma11-graph-edge"><line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"><title>${escapeHtml(`${edge.label}：${edge.detail}`)}</title></line>${graph.edges.length <= 18 ? `<text x="${mx}" y="${my}">${escapeHtml(edge.label)}</text>` : ""}</g>`;
    })
        .join("");
    const nodeSvg = positioned
        .map((node) => `<g class="ma11-graph-node ${node.type} ${graphLifecycleClass(node)} ${selected?.id === node.id ? "selected" : ""}" data-ma11-graph-node="${escapeHtml(node.id)}" transform="translate(${node.x} ${node.y})" tabindex="0" role="button"><circle r="34"></circle><text text-anchor="middle" y="4">${escapeHtml(node.label.length > 10 ? `${node.label.slice(0, 9)}…` : node.label)}</text><title>${escapeHtml(`${node.label}\n${node.detail}`)}</title></g>`)
        .join("");
    const graphWidth = Math.round(1000 * zoom);
    const graphHeight = Math.round(680 * zoom);
    return `
    <section class="ma11-toolbar ma11-graph-toolbar">
      <div><h2>关系图谱</h2><p>由当前状态表生成，只读展示，不额外调用模型。</p></div>
      <div class="ma11-graph-toolbar-actions">
        <div class="ma11-segmented"><button class="${settings.ui.graphScope === "relations" ? "active" : ""}" data-ma11-graph-scope="relations">人物关系</button><button class="${settings.ui.graphScope === "world" ? "active" : ""}" data-ma11-graph-scope="world">全局网络</button></div>
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
    ${graph.nodes.length ? `<section class="ma11-graph-layout"><div class="ma11-graph-canvas"><svg viewBox="0 0 1000 680" width="${graphWidth}" height="${graphHeight}" style="width:${graphWidth}px;height:${graphHeight}px" preserveAspectRatio="xMidYMid meet" aria-label="镜渊关系图谱">${edgeSvg}${nodeSvg}</svg></div><aside class="ma11-graph-detail">${selected ? `<span class="ma11-graph-type ${selected.type}">${escapeHtml(graphTypeLabel(selected.type))}</span><h3>${escapeHtml(selected.label)}</h3><p>${escapeHtml(selected.detail || "暂无详细记录")}</p><dl><dt>状态</dt><dd>${escapeHtml(selected.status || "未标注")}</dd>${selected.existence ? `<dt>存在</dt><dd>${escapeHtml(selected.existence)}</dd>` : ""}${selected.activity ? `<dt>活跃</dt><dd>${escapeHtml(selected.activity)}</dd>` : ""}${selected.memory ? `<dt>记忆</dt><dd>${escapeHtml(selected.memory)}</dd>` : ""}</dl>` : '<p class="ma11-empty">点击节点查看详情。</p>'}</aside></section>` : '<section class="ma11-empty-panel">当前状态表没有可绘制的关系节点。先在“人物”和“关系”表中生成或添加记录。</section>'}`;
}
async function summariesHtml() {
    const info = latestSnapshotArtifact();
    const enabled = getSettings().enabled;
    const state = info ? await getChatState(info.artifact.chatKey) : null;
    const small = state?.smallSummaries ?? [];
    const large = state?.largeSummaries ?? [];
    return `
    <section class="ma11-toolbar"><div><h2>分层总结</h2><p>小总结负责安全沉降已结束内容；大总结把已消费的小总结内推为累计长期记忆。</p></div><div class="ma11-actions"><button data-ma11-action="force-small" ${enabled && info ? "" : "disabled"}>立即小总结</button><button data-ma11-action="force-large" ${enabled && info ? "" : "disabled"}>立即大总结</button></div></section>
    <div class="ma11-summary-columns">
      <section class="ma11-card"><header><b>小总结</b><span>${small.length}</span></header>${small.length
        ? small
            .slice()
            .reverse()
            .map((item) => `<article class="ma11-summary"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>${item.sedimentation ? `<div class="ma11-summary-settlement"><span>已应用 ${item.sedimentation.appliedRowIds?.length ?? 0}</span><span>保护/忽略 ${item.sedimentation.ignoredRowIds?.length ?? 0}</span></div>` : ""}<small>${escapeHtml(new Date(item.createdAt).toLocaleString())}</small></article>`)
            .join("")
        : '<p class="ma11-empty">尚无小总结。</p>'}</section>
      <section class="ma11-card"><header><b>大总结</b><span>${large.length}</span></header>${large.length
        ? large
            .slice()
            .reverse()
            .map((item) => `<article class="ma11-summary"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>${item.sedimentation ? `<div class="ma11-summary-settlement"><span>已应用 ${item.sedimentation.appliedRowIds?.length ?? 0}</span><span>保护/忽略 ${item.sedimentation.ignoredRowIds?.length ?? 0}</span></div>` : ""}<small>${escapeHtml(new Date(item.createdAt).toLocaleString())}</small></article>`)
            .join("")
        : '<p class="ma11-empty">尚无大总结。</p>'}</section>
    </div>`;
}
function auditHtml() {
    const settings = getSettings();
    const info = currentArtifact();
    const audit = info?.artifact.audit;
    const label = audit?.decision === "revised" ? "已修正" : audit?.passed ? "通过" : "失败";
    return `
    <section class="ma11-card ma11-form-card">
      <header><b>规则审核</b><span>按玩家填写的提示词检查最新AI正文</span></header>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="auditEnabled" ${settings.auditEnabled ? "checked" : ""}/><span>启用规则审核</span></label>
      <label>审核提示词<textarea rows="16" data-ma11-setting="auditPrompt" placeholder="填写需要审核模型检查的规则。">${escapeHtml(settings.auditPrompt)}</textarea></label>
      <p class="ma11-help">插件只执行这里填写的规则，不额外增加审核标准。审核模型返回 MA_OK 时保留原文；返回 MA_REVISED 和完整修正版时，插件直接原位替换正文。一次正文只调用一次审核模型。</p>
    </section>
    ${audit ? `<section class="ma11-card"><header><b>最近审核结果</b><span class="ma11-badge ${audit.passed ? "success" : "danger"}">${label}</span></header><p>${escapeHtml(audit.reason || "—")}</p></section>` : ""}`;
}

async function syncHtml() {
    const info = latestSnapshotArtifact();
    const state = info ? await getChatState(info.artifact.chatKey) : null;
    const settings = getSettings();
    return `
    <section class="ma11-card ma11-form-card">
      <header><b>聊天世界书</b><span class="ma11-badge ${statusClass(state?.lastSyncStatus || "idle")}">${statusText(state?.lastSyncStatus || "idle")}</span></header>
      ${state?.historyInvalidation ? `<div class="ma11-error-box">${state.historyInvalidation.startIndex === undefined ? "历史删除位置未知，请先选择重算起点。" : `第 ${state.historyInvalidation.startIndex + 1} 条消息之后的数据已失效。`}重建完成前不会发布世界书。</div>` : ""}
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="lorebookSync" ${settings.lorebookSync ? "checked" : ""}/><span>自动同步世界书</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoCreateLorebook" ${settings.autoCreateLorebook ? "checked" : ""}/><span>自动创建每聊天独立世界书</span></label>
      <label>发布结构<select data-ma11-setting="lorebookLayout"><option value="semantic" ${settings.lorebookLayout === "semantic" ? "selected" : ""}>对象语义模式（推荐）</option><option value="detailed" ${settings.lorebookLayout === "detailed" ? "selected" : ""}>逐行调试模式</option></select></label>
      <p class="ma11-help">对象语义模式按现实对象建立条目：基础设定、全局态势、每个焦点、每个正式人物、关系网络、区域、事件/流程、物品/资源、技能，以及当前小总结和累计大总结。旧的镜渊管理条目会在重新发布时自动替换。</p>
      <label>世界书名称（留空自动生成）<input data-ma11-setting="lorebookName" value="${escapeHtml(settings.lorebookName)}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="vectorizeRows" ${settings.vectorizeRows ? "checked" : ""}/><span>人物、物品、事件等状态行启用向量</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="latestContinuityConstant" ${settings.latestContinuityConstant ? "checked" : ""}/><span>基础设定、全局态势、当前焦点与当前总结常驻</span></label>
      <div class="ma11-actions"><button data-ma11-action="retry-sync" ${settings.enabled && info && !state?.historyInvalidation ? "" : "disabled"}>${settings.lorebookLayout === "semantic" ? "按对象清理并重新发布" : "立即同步"}</button><button data-ma11-action="open-graph" ${info?.artifact.snapshot ? "" : "disabled"}>查看关系图谱</button></div>
      ${state?.lastSyncError ? `<div class="ma11-error-box">${escapeHtml(state.lastSyncError)}</div>` : ""}
      <dl class="ma11-meta"><dt>当前世界书</dt><dd>${escapeHtml(state?.lastLorebookName || "未建立")}</dd><dt>最近同步</dt><dd>${escapeHtml(state?.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString() : "尚未同步")}</dd></dl>
    </section>`;
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
      <option value="current" ${value.mode === "current" ? "selected" : ""}>当前聊天连接</option>
      <option value="profile" ${value.mode === "profile" ? "selected" : ""}>ST原生 Profile（隔离请求）</option>
    </select>
    <select data-ma11-connection-profile-id="${task}" ${value.mode === "profile" ? "" : "hidden disabled"}><option value="">请选择Connection Profile</option>${missingProfile}${profileOptions}</select>
    <button data-ma11-test="${task}">测试</button>
  </div>`;
}
function settingsHtml() {
    const settings = getSettings();
    return `
    <section class="ma11-card ma11-form-card">
      <header><b>任务模型分配</b><span>全部通过 SillyTavern 原生连接能力调用。</span></header>
      ${connectionBlock("audit", "规则审核")}
      ${connectionBlock("state", "事实提取与状态表")}
      ${connectionBlock("smallSummary", "小总结")}
      ${connectionBlock("largeSummary", "大总结")}
      <p class="ma11-help">当前聊天连接使用 generateRaw；Profile 使用 ConnectionManagerRequestService，并关闭角色预设与 Instruct。插件不保存 API 地址或密钥。</p>
    </section>
    <section class="ma11-card ma11-form-card">
      <header><b>自动化</b></header>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="enabled" ${settings.enabled ? "checked" : ""}/><span>启用镜渊</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoState" ${settings.autoState ? "checked" : ""}/><span>每条新AI正文自动提取事实并整理表格</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="showMessagePanel" ${settings.showMessagePanel ? "checked" : ""}/><span>在正文下显示状态条</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoSmallSummary" ${settings.autoSmallSummary ? "checked" : ""}/><span>自动小总结</span></label>
      <label>小总结最晚回合数<input type="number" min="8" max="30" data-ma11-setting="smallSummaryTurns" value="${settings.smallSummaryTurns}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoLargeSummary" ${settings.autoLargeSummary ? "checked" : ""}/><span>自动大总结</span></label>
      <label>大总结所需小总结数<input type="number" min="1" max="30" data-ma11-setting="largeSummaryCount" value="${settings.largeSummaryCount}" /></label>
      <label>模型请求超时（毫秒）<input type="number" min="10000" max="300000" step="1000" data-ma11-setting="requestTimeoutMs" value="${settings.requestTimeoutMs}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="repairInvalidJsonOnce" ${settings.repairInvalidJsonOnce ? "checked" : ""}/><span>结构化输出不可用或JSON格式错误时，最多额外调用一次</span></label>
      <p class="ma11-help">小总结根据已经提取的状态变化判断：剧情变化密集时可提前触发，变化少时延后，但不会超过“最晚回合数”。判断不额外调用模型。兼容回退只执行一次；网络错误不会触发，失败后由用户手动重试。</p>
    </section>
    <section class="ma11-card ma11-form-card">
      <header><b>重置与维护</b><span>以下操作不会修改其他聊天。</span></header>
      <div class="ma11-actions">
        <button data-ma11-action="restart-plugin">重建插件缓存（软重置）</button>
        <button class="danger" data-ma11-action="reset-current-game">重置当前游戏</button>
      </div>
      <p class="ma11-help">重建插件缓存会取消请求、废弃任务、清除一次性模块缓存、解除监听并重新挂载镜渊 UI，相当于软重置插件，不删除表格、总结和设置。重置当前游戏会删除本聊天的镜渊表格、总结、审核记录及其世界书条目，但保留插件设置。</p>
    </section>`;
}
async function diagnosticsHtml() {
    const checks = await runDiagnostics();
    return `
    <section class="ma11-toolbar"><div><h2>运行诊断</h2><p>入口、模型、存储与同步分别检查。</p></div><div class="ma11-actions"><button data-ma11-action="refresh-diagnostics">刷新</button><button data-ma11-action="copy-diagnostics">复制诊断</button></div></section>
    <section class="ma11-check-grid">${checks.map((check) => `<article class="ma11-check ${check.status}"><span></span><div><b>${escapeHtml(check.label)}</b><p>${escapeHtml(check.detail)}</p></div></article>`).join("")}</section>`;
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
    const renderChatKey = currentChatKey();
    try {
        const settings = getSettings();
        const info = currentArtifact();
        workspace
            .querySelectorAll("[data-ma11-tab]")
            .forEach((button) => button.classList.toggle("active", button.dataset.ma11Tab === settings.ui.activeTab));
        let html = "";
        if (settings.ui.activeTab === "overview")
            html = await overviewHtml(info);
        if (settings.ui.activeTab === "tables")
            html = tableHtml(info);
        if (settings.ui.activeTab === "graph")
            html = graphHtml(info);
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
        if (content)
            content.innerHTML = html;
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
function openRowEditor(tableKey, row) {
    const info = currentArtifact();
    editorChatKey = currentChatKey();
    editorMessageKey = info?.artifact.messageKey ?? null;
    const workspace = root();
    const backdrop = workspace.querySelector(".ma11-editor-backdrop");
    const form = workspace.querySelector("#ma11-row-editor");
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
    form.elements.namedItem("locked").checked = row?.locked ?? true;
    const lifecycleFields = form.querySelector("[data-ma11-lifecycle-fields]");
    const supportsLifecycle = tableKey === "characters" || tableKey === "focus";
    if (lifecycleFields)
        lifecycleFields.hidden = !supportsLifecycle;
    if (supportsLifecycle) {
        const life = row?.lifecycle;
        form.elements.namedItem("existence").value = life?.existence || "未标注";
        form.elements.namedItem("activity").value = life?.activity || "未标注";
        form.elements.namedItem("memory").value = life?.memory || "未标注";
        form.elements.namedItem("evidenceLevel").value = life?.evidenceLevel || "未知";
        form.elements.namedItem("evidence").value = life?.evidence || "";
        form.elements.namedItem("returnConditions").value = life?.returnConditions.join("\n") || "";
        form.elements.namedItem("returnBlockers").value = life?.returnBlockers.join("\n") || "";
    }
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
    const tableKey = form.elements.namedItem("tableKey")
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
    const supportsLifecycle = tableKey === "characters" || tableKey === "focus";
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
    info.artifact.snapshot = upsertManualRow(info.artifact.snapshot, tableKey, {
        id: rowId || undefined,
        title,
        content,
        status,
        keywords,
        locked,
        lifecycle,
    });
    const message = getMessage(info.index);
    if (message)
        attachArtifactToMessage(message, info.artifact);
    await putArtifact(info.artifact);
    await persistChat();
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
    info.artifact.snapshot = deleteRow(info.artifact.snapshot, tableKey, rowId);
    const message = getMessage(info.index);
    if (message)
        attachArtifactToMessage(message, info.artifact);
    await putArtifact(info.artifact);
    await persistChat();
    assertArtifactCommitCurrent(info.artifact);
    if (getSettings().lorebookSync)
        await retryStage(info.index, "sync");
    await renderWorkspace();
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
        try {
            if (busyButton && !["close", "open-tables", "open-graph", "close-editor"].includes(action || "")) {
                busyButton.disabled = true;
                busyButton.setAttribute("aria-busy", "true");
                busyButton.textContent = "处理中…";
            }
            if (action === "close")
                workspace.hidden = true;
            if (action === "open-tables")
                setTab("tables");
            if (action === "open-graph")
                setTab("graph");
            if (action === "process-latest") {
                if (!getSettings().enabled)
                    throw new Error("镜渊已关闭，请先启用");
                const index = latestAssistantIndex();
                if (index < 0)
                    throw new Error("没有可整理的AI正文");
                selectedMessageIndex = index;
                await processMessage(index, true);
                await renderWorkspace();
            }
            if (action === "recalculate-history") {
                const state = await getChatState(currentChatKey());
                if (state.historyInvalidation?.startIndex === undefined) {
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
            if (action === "retry-state") {
                const info = currentArtifact();
                if (info)
                    await retryStage(info.index, "state");
                await renderWorkspace();
            }
            if (action === "force-small" || action === "force-large") {
                const info = latestSnapshotArtifact();
                if (!info)
                    throw new Error("尚无可总结的状态");
                await forceSummary(info.index, action === "force-small" ? "small" : "large");
                await renderWorkspace();
            }
            if (action === "retry-sync") {
                const info = latestSnapshotArtifact();
                if (!info)
                    throw new Error("尚无可同步的状态");
                await retryStage(info.index, "sync");
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
            if (action === "restart-plugin") {
                const restart = globalThis.MirrorAbyss?.restart;
                if (typeof restart !== "function")
                    throw new Error("插件重置入口不可用");
                toast("info", "正在重置镜渊插件…");
                await restart();
                return;
            }
            if (action === "reset-current-game") {
                if (!window.confirm("这会删除当前聊天的镜渊表格、总结、审核记录和镜渊世界书条目。其他聊天和插件设置不受影响。是否继续？"))
                    return;
                if (!window.confirm("请再次确认：重置后只能重新调用模型整理当前聊天，无法自动恢复。"))
                    return;
                const result = await resetCurrentGame();
                resetWorkspaceContext();
                renderAllMessagePanels();
                toast("success", `当前游戏已重置：清除 ${result.messages} 条消息记录、${result.lorebookEntries} 个世界书条目`);
                await renderWorkspace();
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
                const detail = `${result.method}；耗时${result.elapsedMs}ms；连接${result.connected ? "成功" : "失败"}；JSON${result.jsonValid ? "有效" : "无效"}；精确遵循${result.instructionFollowed ? "通过" : "未通过"}`;
                toast(result.instructionFollowed ? "success" : "warning", result.instructionFollowed ? detail : `${detail}；返回：${result.responsePreview}`);
            }
        }
        catch (error) {
            toast("error", toErrorMessage(error));
        }
        finally {
            if (busyButton?.isConnected) {
                busyButton.disabled = false;
                busyButton.removeAttribute("aria-busy");
                busyButton.textContent = originalButtonText;
            }
        }
    });
    workspace.addEventListener("change", (event) => {
        const target = event.target;
        if (target.dataset.ma11Setting)
            updateSetting(target);
        if (target.dataset.ma11ConnectionMode ||
            target.dataset.ma11ConnectionProfileId)
            updateConnection(target);
    });
    workspace.addEventListener("input", (event) => {
        const target = event.target;
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
                svg.setAttribute("height", String(Math.round(680 * zoom)));
                svg.setAttribute("style", `width:${Math.round(1000 * zoom)}px;height:${Math.round(680 * zoom)}px`);
            }
            return;
        }
        if (target.dataset.ma11Setting === "auditPrompt" ||
            target.dataset.ma11Setting === "lorebookName")
            updateSetting(target);
        if (target.dataset.ma11ConnectionProfileId)
            updateConnection(target);
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
export function openWorkspace(tab, messageIndex) {
    const workspace = root();
    if (Number.isInteger(messageIndex))
        selectedMessageIndex = Number(messageIndex);
    if (tab)
        getSettings().ui.activeTab = tab;
    workspace.hidden = false;
    void renderWorkspace();
}
export function closeWorkspace() {
    const workspace = document.querySelector("#ma11-workspace");
    if (workspace)
        workspace.hidden = true;
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
    savingRow = false;
    renderAgain = false;
    document.querySelector("#ma11-workspace")?.remove();
}
export function refreshWorkspace() {
    void renderWorkspace();
}
