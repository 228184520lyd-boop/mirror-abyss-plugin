/**
 * 模块职责：渲染每条角色消息下方的阶段状态与操作入口。
 * 维护边界：UI 只展示 artifact 状态；所有阶段按钮必须调用 pipeline 公开入口。
 */
import { getChat, getSettings, latestAssistantIndex, toast } from '../core/context.js';
import { escapeHtml, toErrorMessage } from '../core/utils.js';
import { forceSummary, getArtifactAt, latestSnapshotArtifact, processMessage, retryStage, subscribePipeline } from '../pipeline/pipeline.js';
import { openWorkspace } from './workspace.js';
import { applyAuditVisibility } from '../pipeline/audit.js';
import { snapshotRowCount } from '../domain/snapshot.js';
import { taskQueue } from '../pipeline/task-queue.js';
function stageLabel(stage) {
    const map = {
        idle: '等待', queued: '排队', running: '处理中', success: '成功', failed: '失败', cancelled: '已取消', skipped: '跳过', blocked: '阻断',
    };
    return map[stage?.status] || '等待';
}
function tone(stage) {
    if (stage?.status === 'success' || stage?.status === 'skipped')
        return 'success';
    if (stage?.status === 'failed' || stage?.status === 'blocked')
        return 'danger';
    if (stage?.status === 'running' || stage?.status === 'queued')
        return 'working';
    return 'neutral';
}
function liveTaskMatchesArtifact(artifact, kinds) {
    return taskQueue.list().some((task) => Boolean(['queued', 'running'].includes(String(task.state))
        && (!task.chatKey || task.chatKey === artifact.chatKey)
        && (!task.messageKey || task.messageKey === artifact.messageKey)
        && kinds.includes(String(task.kind))));
}
function effectiveStageBusy(artifact, stage) {
    const status = artifact.stages[stage]?.status;
    if (!['queued', 'running'].includes(status ?? 'idle'))
        return false;
    if (stage === 'summary')
        return liveTaskMatchesArtifact(artifact, ['smallSummary', 'largeSummary']);
    if (stage === 'sync')
        return liveTaskMatchesArtifact(artifact, ['sync']);
    return true;
}
function displayStage(artifact, stage) {
    const value = artifact.stages[stage];
    if (!['queued', 'running'].includes(value?.status ?? 'idle') || effectiveStageBusy(artifact, stage))
        return value;
    return {
        ...value,
        status: 'failed',
        error: value?.error || '任务已结束但界面状态未收尾，可重新提交',
    };
}
function findMessageElement(index) {
    return document.querySelector(`.mes[mesid="${index}"], .mes[data-message-id="${index}"], #chat .mes:nth-of-type(${index + 1})`);
}
/** 按钮始终渲染；这里只决定能否点击，避免失败前完全找不到对应操作。 */
export function messageStageAvailability(index, artifact) {
    const settings = getSettings();
    const latestText = index === latestAssistantIndex();
    const latestSnapshot = index === latestSnapshotArtifact()?.index;
    const notBusy = (stage) => !effectiveStageBusy(artifact, stage);
    return {
        audit: Boolean(settings.enabled && settings.hostControl.enabled && latestText && settings.auditEnabled && settings.auditPrompt.trim() && notBusy('audit')),
        revision: Boolean(settings.enabled && latestText && artifact.audit && !artifact.audit.passed && artifact.audit.decision !== 'block' && notBusy('revision')),
        state: Boolean(settings.enabled && latestText && (!settings.hostControl.enabled || !settings.auditEnabled || artifact.audit?.passed) && notBusy('state')),
        small: Boolean(settings.enabled && latestSnapshot && artifact.stages.state.status === 'success' && notBusy('summary')),
        large: Boolean(settings.enabled && latestSnapshot && artifact.stages.state.status === 'success' && notBusy('summary')),
        sync: Boolean(settings.enabled && latestSnapshot && artifact.stages.state.status === 'success' && notBusy('sync')),
    };
}
const pendingRetryIndexes = new Set();
const expandedPanelIndexes = new Set();
function flowStageHtml(order, label, stage) {
    const status = stageLabel(stage);
    const symbol = stage?.status === 'success' || stage?.status === 'skipped'
        ? '✓'
        : stage?.status === 'failed' || stage?.status === 'blocked'
            ? '!'
            : stage?.status === 'running' || stage?.status === 'queued'
                ? '…'
                : String(order);
    return `<span class="ma11-flow-stage ${tone(stage)}"><em>${symbol}</em><span><small>${label}</small><b>${status}</b></span></span>`;
}
export function panelHtml(index, artifact) {
    const rows = snapshotRowCount(artifact.snapshot, getSettings().tableRegistry, true);
    const error = Object.values(artifact.stages).find((stage) => stage.error)?.error;
    const retrying = pendingRetryIndexes.has(index);
    const latestText = index === latestAssistantIndex();
    const latestSnapshot = index === latestSnapshotArtifact()?.index;
    const available = messageStageAvailability(index, artifact);
    const enabled = (action) => !retrying && available[action] ? '' : 'disabled';
    const expanded = expandedPanelIndexes.has(index);
    const displayStages = {
        audit: displayStage(artifact, 'audit'),
        revision: displayStage(artifact, 'revision'),
        state: displayStage(artifact, 'state'),
        summary: displayStage(artifact, 'summary'),
        sync: displayStage(artifact, 'sync'),
    };
    const stages = [displayStages.audit, displayStages.revision, displayStages.state, displayStages.summary, displayStages.sync];
    const chainBusy = Object.keys(displayStages).some((stage) => effectiveStageBusy(artifact, stage));
    const chainFailed = stages.some((stage) => ['failed', 'blocked'].includes(stage.status));
    const completedStages = stages.filter((stage) => ['success', 'skipped'].includes(stage.status)).length;
    const chainComplete = artifact.stages.state.status === 'success'
        && ['success', 'skipped'].includes(artifact.stages.summary.status)
        && ['success', 'skipped'].includes(artifact.stages.sync.status);
    const chainState = chainBusy ? '处理中' : chainFailed ? '需处理' : chainComplete ? '已完成' : '待继续';
    return `
    <div class="ma11-message-panel ${expanded ? 'is-open' : 'is-collapsed'}" data-ma-index="${index}">
      <div class="ma11-message-bar ${chainFailed ? 'danger' : chainBusy ? 'working' : chainComplete ? 'success' : 'neutral'}">
        <span class="ma11-message-state-dot" aria-hidden="true"></span>
        <button class="ma11-message-open" type="button" data-ma-action="toggle-inline" aria-expanded="${expanded}" aria-controls="ma11-message-detail-${index}">
          <b>镜渊</b><span>${chainState}</span><i aria-hidden="true">⌄</i>
        </button>
        <span class="ma11-message-count">${rows} 对象</span>
        <button class="ma11-message-open-workspace" type="button" data-ma-action="open">工作区</button>
      </div>
      <div class="ma11-message-detail" id="ma11-message-detail-${index}" ${expanded ? '' : 'hidden'}>
        <div class="ma11-message-progress-head"><span>处理进度</span><b>${completedStages}/5</b></div>
        <div class="ma11-flow" aria-label="审核到世界书的处理进度">
          ${flowStageHtml(1, '审核', displayStages.audit)}
          ${flowStageHtml(2, '修正', displayStages.revision)}
          ${flowStageHtml(3, '表格', displayStages.state)}
          ${flowStageHtml(4, '总结', displayStages.summary)}
          ${flowStageHtml(5, '世界书', displayStages.sync)}
        </div>
        ${artifact.audit && !artifact.audit.passed ? `<div class="ma11-message-error">${escapeHtml(artifact.audit.reason)}</div>` : error ? `<div class="ma11-message-error">${escapeHtml(error)}</div>` : ''}
        ${latestText ? `<div class="ma11-message-primary-actions">
          <button class="ma11-primary-action" data-ma-auto-continue ${retrying || chainBusy || chainComplete ? 'disabled' : ''}>${chainBusy ? '处理中' : chainComplete ? '流程已完成' : '继续自动流程'}</button>
          <button data-ma-action="open">打开工作区</button>
        </div>
        <div class="ma11-message-tools" aria-label="单阶段排错">
          <div class="ma11-message-tools-title"><b>单阶段处理</b><small>仅在自动流程未能完成时使用</small></div>
          <div class="ma11-message-actions ma11-message-stage-actions" aria-label="镜渊分阶段操作">
            <button data-ma-stage-action="audit" ${enabled('audit')}>仅审核</button>
            <button data-ma-stage-action="revision" ${enabled('revision')}>仅修正</button>
            <button data-ma-stage-action="state" ${enabled('state')}>仅生成表格</button>
            <button data-ma-stage-action="small" ${enabled('small')}>立即小总结</button>
            <button data-ma-stage-action="large" ${enabled('large')}>立即大总结</button>
            <button data-ma-stage-action="sync" ${enabled('sync')}>立即同步</button>
          </div>
        </div>` : '<div class="ma11-message-actions"><button data-ma-action="open">打开工作区</button></div>'}
        <div class="ma11-message-actions ma11-message-retries">
          ${retrying ? '<button disabled>处理中…</button>' : ''}
          ${!retrying && latestText && artifact.stages.audit.status === 'failed' ? '<button data-ma-retry="audit">重试审核</button>' : ''}
          ${!retrying && latestText && ['failed', 'blocked'].includes(artifact.stages.revision?.status ?? 'idle') ? '<button data-ma-retry="revision">重试定向修正</button>' : ''}
          ${!retrying && latestText && artifact.stages.state.status === 'failed' ? '<button data-ma-retry="state">重试表格</button>' : ''}
          ${!retrying && latestSnapshot && artifact.stages.summary.status === 'failed' ? '<button data-ma-retry="summary">重试总结</button>' : ''}
          ${!retrying && latestSnapshot && artifact.stages.sync.status === 'failed' ? '<button data-ma-retry="sync">重试同步</button>' : ''}
        </div>
      </div>
    </div>`;
}
export function renderMessagePanel(index) {
    const messageElement = findMessageElement(index);
    if (!messageElement)
        return;
    const settings = getSettings();
    const artifact = getArtifactAt(index);
    applyAuditVisibility(index, Boolean(settings.enabled && artifact?.hiddenByAudit), Boolean(settings.enabled && artifact?.audit && !artifact.audit.passed && !artifact.hiddenByAudit));
    messageElement.querySelector(':scope > .ma11-message-panel')?.remove();
    if (!settings.showMessagePanel)
        return;
    if (!artifact)
        return;
    messageElement.insertAdjacentHTML('beforeend', panelHtml(index, artifact));
}
export function renderAllMessagePanels() {
    getChat().forEach((message, index) => {
        if (!message?.is_user)
            renderMessagePanel(index);
    });
}
let installed = false;
export function installMessagePanelHandlers() {
    if (installed)
        return () => undefined;
    installed = true;
    const click = (event) => {
        const target = event.target;
        const panel = target.closest('.ma11-message-panel');
        if (!panel)
            return;
        const index = Number(panel.dataset.maIndex);
        if (target.closest('[data-ma-action="toggle-inline"]')) {
            if (expandedPanelIndexes.has(index))
                expandedPanelIndexes.delete(index);
            else
                expandedPanelIndexes.add(index);
            renderMessagePanel(index);
            return;
        }
        if (target.closest('[data-ma-action="open"]')) {
            openWorkspace('overview', index);
            return;
        }
        if (target.closest('[data-ma-auto-continue]')) {
            if (pendingRetryIndexes.has(index))
                return;
            pendingRetryIndexes.add(index);
            renderMessagePanel(index);
            toast('info', '正在从第一个失效阶段继续处理');
            void processMessage(index, false).catch((error) => {
                toast('error', toErrorMessage(error));
            }).finally(() => {
                pendingRetryIndexes.delete(index);
                renderMessagePanel(index);
            });
            return;
        }
        const stageAction = target.closest('[data-ma-stage-action]')?.dataset.maStageAction;
        if (stageAction) {
            if (pendingRetryIndexes.has(index))
                return;
            pendingRetryIndexes.add(index);
            renderMessagePanel(index);
            toast('info', '已提交阶段任务，请稍候');
            const task = stageAction === 'small' || stageAction === 'large'
                ? forceSummary(index, stageAction)
                : retryStage(index, stageAction);
            void task.catch((error) => {
                toast('error', toErrorMessage(error));
            }).finally(() => {
                pendingRetryIndexes.delete(index);
                renderMessagePanel(index);
            });
            return;
        }
        const retry = target.closest('[data-ma-retry]')?.dataset.maRetry;
        if (retry) {
            if (pendingRetryIndexes.has(index))
                return;
            pendingRetryIndexes.add(index);
            renderMessagePanel(index);
            toast('info', '已提交重试，请稍候');
            void retryStage(index, retry).catch((error) => {
                toast('error', toErrorMessage(error));
            }).finally(() => {
                pendingRetryIndexes.delete(index);
                renderMessagePanel(index);
            });
        }
    };
    document.addEventListener('click', click);
    const unsubscribe = subscribePipeline((index) => renderMessagePanel(index));
    return () => {
        installed = false;
        pendingRetryIndexes.clear();
        expandedPanelIndexes.clear();
        document.removeEventListener('click', click);
        unsubscribe();
    };
}
