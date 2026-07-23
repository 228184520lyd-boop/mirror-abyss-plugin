/**
 * 模块职责：按审核指令生成最小修正版并复审，成功后原位替换正文。
 * 维护边界：修正次数有限；技术错误不能当作再次违规，也不能因此隐藏正文。
 */
import { getSettings } from './core-context.js';
import { assertArtifactCommitCurrent } from './core-commit-guard.js';
import { hashText, nowIso, safeText, toErrorMessage } from './core-utils.js';
import { replaceMessageInPlace } from './core-message-update.js';
import { markStage } from './domain-artifact.js';
import { generateTask } from './llm-generator.js';
import { revisionSystemPrompt, revisionUserPrompt } from './prompts-revision.js';
import { putArtifact } from './storage-repository.js';
import { applyAuditVisibility, auditText } from './pipeline-audit.js';
function cleanRevisionText(raw) {
    let text = safeText(raw, 200000).trim();
    const fenced = text.match(/^```(?:markdown|text)?\s*([\s\S]*?)```$/i);
    if (fenced)
        text = fenced[1].trim();
    text = text.replace(/^(?:【?修正版(?:正文)?】?|修正后的完整正文)\s*[:：]?\s*/i, '').trim();
    return text;
}
function initialRevisionRecord(artifact) {
    return artifact.revision ?? {
        status: 'idle',
        originalText: artifact.assistantText,
        originalFingerprint: artifact.sourceFingerprint,
        attempts: [],
    };
}
/**
 * 每次候选正文都必须复审通过后才能原位替换。达到次数上限或重复违规时停止，不递归扩张。
 */
export async function runRevisionFlow(artifact) {
    const settings = getSettings();
    const firstAudit = artifact.audit;
    if (!firstAudit || firstAudit.passed)
        throw new Error('没有可修正的审核失败结果');
    artifact.revision = initialRevisionRecord(artifact);
    if (firstAudit.decision === 'block') {
        artifact.revision.status = 'blocked';
        artifact.revision.stoppedReason = firstAudit.reason || '审核判定无法局部修正';
        markStage(artifact, 'revision', 'blocked', artifact.revision.stoppedReason);
        await putArtifact(artifact);
        return { approved: false, audit: firstAudit };
    }
    artifact.hiddenByAudit = true;
    applyAuditVisibility(artifact.messageIndex, true);
    artifact.revision.status = 'running';
    markStage(artifact, 'revision', 'running');
    await putArtifact(artifact);
    let sourceText = artifact.assistantText;
    let currentAudit = firstAudit;
    let previousViolationFingerprint = firstAudit.violationFingerprint;
    const maxAttempts = Math.min(2, Math.max(1, Number(settings.maxRevisionAttempts) || 1));
    try {
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const replacementText = safeText(currentAudit.replacementText, 200000).trim();
            const supplied = attempt === 1 && replacementText ? replacementText : undefined;
            const raw = supplied ?? await generateTask({
                task: 'revision',
                systemPrompt: revisionSystemPrompt(settings.revisionPrompt),
                prompt: revisionUserPrompt(settings.auditPrompt, artifact.playerText, sourceText, currentAudit, attempt),
            });
            const candidate = cleanRevisionText(raw);
            if (!candidate)
                throw new Error('修正文模型返回空正文');
            if (hashText(candidate) === hashText(sourceText))
                throw new Error('修正文模型未改变正文');
            const candidateAudit = await auditText(settings.auditPrompt, artifact.playerText, candidate);
            assertArtifactCommitCurrent(artifact);
            artifact.revision.attempts.push({
                attempt,
                sourceFingerprint: hashText(sourceText),
                candidateFingerprint: hashText(candidate),
                audit: candidateAudit,
                createdAt: nowIso(),
            });
            if (candidateAudit.passed) {
                artifact.audit = candidateAudit;
                await replaceMessageInPlace(artifact, candidate);
                artifact.auditSourceFingerprint = artifact.sourceFingerprint;
                artifact.revision.status = 'success';
                artifact.revision.finalFingerprint = artifact.sourceFingerprint;
                artifact.revision.committedAt = nowIso();
                // The rejected body is no longer needed after an atomic in-place commit.
                // Purging it keeps the saved chat metadata free of the discarded prose.
                artifact.revision.originalText = '';
                artifact.hiddenByAudit = false;
                artifact.revision.stoppedReason = undefined;
                markStage(artifact, 'audit', 'success');
                markStage(artifact, 'revision', 'success');
                // 修正开始时消息节点已被加上隐藏类。仅修改 artifact 状态不会立即移除旧 DOM 类，
                // 必须在复审通过后显式放行，否则正文已替换成功但界面仍像被拦截。
                applyAuditVisibility(artifact.messageIndex, false, false);
                await putArtifact(artifact);
                return { approved: true, audit: candidateAudit };
            }
            const sameViolation = Boolean(settings.stopOnRepeatedViolation &&
                candidateAudit.violationFingerprint &&
                candidateAudit.violationFingerprint === previousViolationFingerprint);
            if (candidateAudit.decision === 'block' || sameViolation) {
                artifact.revision.status = 'blocked';
                artifact.revision.stoppedReason = candidateAudit.decision === 'block'
                    ? candidateAudit.reason
                    : '修正后重复出现相同违规，已停止循环';
                markStage(artifact, 'revision', 'blocked', artifact.revision.stoppedReason);
                await putArtifact(artifact);
                return { approved: false, audit: candidateAudit };
            }
            sourceText = candidate;
            currentAudit = candidateAudit;
            previousViolationFingerprint = candidateAudit.violationFingerprint;
            // 候选正文尚未提交，artifact.audit 必须继续对应玩家当前可见正文。
            // 候选审核保存在 revision.attempts 中，供诊断与下一次循环使用。
            await putArtifact(artifact);
        }
        artifact.revision.status = 'failed';
        artifact.revision.stoppedReason = `达到最大自动修正次数（${maxAttempts}）`;
        markStage(artifact, 'revision', 'failed', artifact.revision.stoppedReason);
        await putArtifact(artifact);
        return { approved: false, audit: artifact.audit ?? firstAudit };
    }
    catch (error) {
        if (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name)) {
            artifact.revision.status = 'cancelled';
            artifact.revision.stoppedReason = toErrorMessage(error);
            artifact.hiddenByAudit = false;
            applyAuditVisibility(artifact.messageIndex, false, true);
            markStage(artifact, 'revision', 'cancelled', artifact.revision.stoppedReason);
            await putArtifact(artifact);
            throw error;
        }
        artifact.revision.status = 'failed';
        artifact.revision.stoppedReason = toErrorMessage(error);
        artifact.hiddenByAudit = false;
        applyAuditVisibility(artifact.messageIndex, false, true);
        markStage(artifact, 'revision', 'failed', `修正执行失败：${artifact.revision.stoppedReason}`);
        await putArtifact(artifact);
        throw error;
    }
}
