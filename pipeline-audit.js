/**
 * 模块职责：解析和执行规则审核，并应用标记、隐藏或进入修正的结果。
 * 维护边界：技术故障与内容违规必须分开；缺少合法 result 的对象不能默认判为违规。
 */
import { getSettings, toast } from './core-context.js';
import { assertArtifactCommitCurrent } from './core-commit-guard.js';
import { hashText, safeText, toErrorMessage } from './core-utils.js';
import { markStage } from './domain-artifact.js';
import { describeTaskConnection, generateTask } from './llm-generator.js';
import { auditSystemPrompt, auditUserPrompt } from './prompts-audit.js';
import { putArtifact } from './storage-repository.js';
import { parseAuditTextOutput } from './domain-audit-text.js';
import { resolveHostControl } from './domain-host-control.js';
/** 审核模型只返回固定文本；插件负责转换为内部对象。 */
export function parseAuditResult(raw) {
    return parseAuditTextOutput(raw);
}
export function findMessageElement(index) {
    return document.querySelector(`.mes[mesid="${index}"], .mes[data-message-id="${index}"], #chat .mes:nth-of-type(${index + 1})`);
}
export function applyAuditVisibility(index, hidden, marked = false) {
    const element = findMessageElement(index);
    element?.classList.toggle('ma11-audit-hidden-message', hidden);
    element?.classList.toggle('ma11-audit-marked-message', !hidden && marked);
}
function isCancelledAuditRequest(error) {
    return error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name);
}
export async function auditText(playerRules, playerText, assistantText) {
    const raw = await generateTask({
        task: 'audit',
        systemPrompt: auditSystemPrompt(),
        prompt: auditUserPrompt(playerRules, playerText, assistantText),
        requestPurpose: 'fixed-text',
    });
    try {
        return parseAuditResult(raw);
    }
    catch (error) {
        const preview = safeText(raw, 1200).replace(/\s+/g, ' ').trim();
        throw new Error(`规则审核未返回有效固定文本（${describeTaskConnection('audit')}）。${toErrorMessage(error)}${preview ? `；返回片段：${preview}` : ''}`, { cause: error });
    }
}
export async function applyAuditFailureAction(artifact, action) {
    if (action === 'mark') {
        artifact.hiddenByAudit = false;
        applyAuditVisibility(artifact.messageIndex, false, true);
        return;
    }
    if (action === 'hide') {
        artifact.hiddenByAudit = true;
        applyAuditVisibility(artifact.messageIndex, true);
        return;
    }
    artifact.hiddenByAudit = true;
    applyAuditVisibility(artifact.messageIndex, true);
    toast('warning', '审核未通过；插件不会自动删除酒馆消息，已隐藏并保留人工处理入口');
}
function alignRevisionStageWithAudit(artifact, result) {
    const settings = getSettings();
    const currentRevision = artifact.revision;
    const committedRevision = Boolean(currentRevision?.status === 'success'
        && currentRevision.finalFingerprint
        && currentRevision.finalFingerprint === artifact.sourceFingerprint);
    if (result.passed) {
        // 修正成功后的复审属于修正阶段的一部分，不能在后续恢复时把“修正成功”覆盖成“跳过”。
        if (!committedRevision)
            markStage(artifact, 'revision', 'skipped');
        return;
    }
    if (result.decision === 'block') {
        markStage(artifact, 'revision', 'blocked', result.reason || '审核判定无法局部修正');
        return;
    }
    if (settings.auditFailAction === 'revise') {
        // 失败审核本身是可恢复检查点。即使旧数据把 revision 留在 skipped，
        // 也必须恢复成待执行，避免“从失败位置继续”时直接越过修正。
        if (artifact.stages.revision.status !== 'running' && !committedRevision) {
            markStage(artifact, 'revision', 'idle');
        }
        return;
    }
    markStage(artifact, 'revision', 'skipped', '当前审核失败处理未启用自动修正');
}
/**
 * 审核只决定当前正文是否通过以及后续是否需要修正；技术异常由调用方按失败状态处理。
 * 已完成且仍对应当前正文/规则的失败审核也必须复用：它是“审核 → 修正”之间的正式检查点。
 */
export async function runAudit(artifact, force = false) {
    const settings = getSettings();
    artifact.stages.revision ||= { status: 'idle', attempts: 0 };
    if (!resolveHostControl(settings).audit) {
        markStage(artifact, 'audit', 'skipped');
        markStage(artifact, 'revision', 'skipped');
        artifact.hiddenByAudit = false;
        applyAuditVisibility(artifact.messageIndex, false, false);
        artifact.audit = {
            passed: true,
            decision: 'pass',
            reason: '未启用规则审核',
            violations: [],
            preserve: [],
            rewriteInstruction: '',
            violationFingerprint: '',
        };
        await putArtifact(artifact);
        return artifact.audit;
    }
    if (!settings.auditPrompt.trim())
        throw new Error('已启用规则审核，但审核提示词为空');
    const ruleFingerprint = hashText(`${settings.auditPrompt}\n${settings.auditFailAction}\n${settings.maxRevisionAttempts}`);
    const cachedAudit = artifact.audit;
    const cachedRuleMatches = !artifact.auditRuleFingerprint || artifact.auditRuleFingerprint === ruleFingerprint;
    const cachedSourceMatches = !artifact.auditSourceFingerprint || artifact.auditSourceFingerprint === artifact.sourceFingerprint;
    const cachedTerminalMatches = Boolean(cachedAudit
        && ((cachedAudit.passed && artifact.stages.audit.status === 'success' && artifact.approvedFingerprint === artifact.sourceFingerprint)
            || (!cachedAudit.passed && artifact.stages.audit.status === 'blocked')));
    if (!force && cachedTerminalMatches && cachedRuleMatches && cachedSourceMatches && cachedAudit) {
        artifact.auditRuleFingerprint = ruleFingerprint;
        artifact.auditSourceFingerprint = artifact.sourceFingerprint;
        alignRevisionStageWithAudit(artifact, cachedAudit);
        return cachedAudit;
    }
    markStage(artifact, 'audit', 'running');
    await putArtifact(artifact);
    try {
        const result = await auditText(settings.auditPrompt, artifact.playerText, artifact.assistantText);
        assertArtifactCommitCurrent(artifact);
        artifact.audit = result;
        artifact.auditRuleFingerprint = ruleFingerprint;
        artifact.auditSourceFingerprint = artifact.sourceFingerprint;
        if (result.passed) {
            artifact.approvedFingerprint = artifact.sourceFingerprint;
            artifact.hiddenByAudit = false;
            applyAuditVisibility(artifact.messageIndex, false, false);
            markStage(artifact, 'audit', 'success');
        }
        else {
            artifact.approvedFingerprint = undefined;
            markStage(artifact, 'audit', 'blocked', result.reason);
        }
        alignRevisionStageWithAudit(artifact, result);
        // 审核阶段只更新内存 artifact；业务编排器负责在明确检查点统一保存。
        // 避免审核函数与主链紧邻地重复保存同一条聊天。
        await putArtifact(artifact);
        return result;
    }
    catch (error) {
        if (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name)) {
            markStage(artifact, 'audit', 'cancelled', toErrorMessage(error));
            await putArtifact(artifact);
            throw error;
        }
        markStage(artifact, 'audit', 'failed', toErrorMessage(error));
        await putArtifact(artifact);
        throw error;
    }
}
