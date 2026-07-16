import { getChat, getSettings, latestAssistantIndex, toast } from '../core/context.js';
import { escapeHtml, toErrorMessage } from '../core/utils.js';
import { getArtifactAt, latestSnapshotArtifact, retryStage, subscribePipeline } from '../pipeline/pipeline.js';
import { openWorkspace } from './workspace.js';
import { clearLegacyAuditVisibility } from '../pipeline/audit.js';
function stageLabel(stage) {
    const map = {
        idle: '等待', queued: '排队', running: '处理中', success: '成功', failed: '失败', skipped: '跳过', blocked: '阻断',
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
function findMessageElement(index) {
    return document.querySelector(`.mes[mesid="${index}"], .mes[data-message-id="${index}"], #chat .mes:nth-of-type(${index + 1})`);
}
const pendingRetryIndexes = new Set();
function panelHtml(index, artifact) {
    const rows = artifact.snapshot ? Object.values(artifact.snapshot).reduce((sum, list) => sum + list.length, 0) : 0;
    const error = Object.values(artifact.stages).find((stage) => stage.error)?.error;
    const retrying = pendingRetryIndexes.has(index);
    const latestText = index === latestAssistantIndex();
    const latestSnapshot = index === latestSnapshotArtifact()?.index;
    return `
    <div class="ma11-message-panel" data-ma-index="${index}">
      <button class="ma11-message-summary" type="button" data-ma-action="open">
        <span class="ma11-message-title">镜渊状态</span>
        <span class="ma11-badge ${tone(artifact.stages.audit)}">审核 ${stageLabel(artifact.stages.audit)}</span>
        <span class="ma11-badge ${tone(artifact.stages.state)}">表格 ${stageLabel(artifact.stages.state)}</span>
        <span class="ma11-badge ${tone(artifact.stages.sync)}">同步 ${stageLabel(artifact.stages.sync)}</span>
        <span class="ma11-message-count">${rows} 条</span>
      </button>
      ${artifact.audit && !artifact.audit.passed ? `<div class="ma11-message-error">${escapeHtml(artifact.audit.reason)}</div>` : error ? `<div class="ma11-message-error">${escapeHtml(error)}</div>` : ''}
      <div class="ma11-message-actions">
        ${retrying ? '<button disabled>重试处理中…</button>' : ''}
        ${!retrying && latestText && artifact.stages.audit.status === 'failed' ? '<button data-ma-retry="audit">重试审核</button>' : ''}
        ${!retrying && latestText && artifact.stages.state.status === 'failed' ? '<button data-ma-retry="state">重试表格</button>' : ''}
        ${!retrying && latestSnapshot && artifact.stages.summary.status === 'failed' ? '<button data-ma-retry="summary">重试总结</button>' : ''}
        ${!retrying && latestSnapshot && artifact.stages.sync.status === 'failed' ? '<button data-ma-retry="sync">重试同步</button>' : ''}
      </div>
    </div>`;
}
export function renderMessagePanel(index) {
    const messageElement = findMessageElement(index);
    if (!messageElement)
        return;
    const settings = getSettings();
    const artifact = getArtifactAt(index);
    clearLegacyAuditVisibility(index);
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
        if (target.closest('[data-ma-action="open"]'))
            openWorkspace('tables', index);
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
        document.removeEventListener('click', click);
        unsubscribe();
    };
}
