/* Generated from src/features/processing/service.ts — do not edit dist directly. */
import { auditSystemPrompt, auditUserPrompt, AUDIT_PROMPT_VERSION } from '../../prompts/audit.js';
import { extractionSystemPrompt, extractionUserPrompt, EXTRACTION_PROMPT_VERSION } from '../../prompts/extraction.js';
import { revisionSystemPrompt, revisionUserPrompt, REVISION_PROMPT_VERSION } from '../../prompts/revision.js';
import { MirrorAbyssError } from '../../shared/errors.js';
import { hashText } from '../../shared/hash.js';
import { AuditResultSchema, ExtractionResultSchema, RevisionResultSchema } from './schemas.js';
import { parseAuditOutput, parseExtractionOutput } from './parsers.js';
import { applyExtraction, ensureMessageRecord } from './reducer.js';
/** 一条正文的真实纵向闭环：审核 → 必要修正 → 提取 → 持久化。 */
export class ProcessingService {
    repository;
    messages;
    model;
    constructor(repository, messages, model) {
        this.repository = repository;
        this.messages = messages;
        this.model = model;
    }
    async process(token, settings, hooks, requestedIndex) {
        let snapshot = await this.messages.getAssistantMessage(token, requestedIndex);
        hooks.started(snapshot.messageIndex, snapshot.messageKey);
        let document = structuredClone(await this.repository.loadCurrent(token));
        let record = ensureMessageRecord(document, snapshot);
        const audit = await this.audit(token, settings, document, record, snapshot.playerText, hooks);
        if (audit.decision === 'block')
            throw new MirrorAbyssError('AUDIT_BLOCKED', audit.reason, 'audit');
        if (audit.decision === 'revise') {
            if (!settings.autoRevision)
                throw new MirrorAbyssError('REVISION_REQUIRED', audit.reason, 'revision');
            const revision = await this.revision(token, settings, document, record, snapshot.playerText, audit, hooks);
            if (!revision.appliedContentHash) {
                snapshot = await this.messages.replaceText(token, snapshot, revision.text);
                revision.appliedContentHash = snapshot.contentHash;
                record.visibleContentHash = snapshot.contentHash;
                record.stages.revision = completedStage(revisionInputHash(settings, record, audit), revision);
                document = await this.commit(token, document, hooks, false);
            }
            else {
                snapshot = await this.messages.getAssistantMessage(token, snapshot.messageIndex);
                if (snapshot.contentHash !== revision.appliedContentHash) {
                    throw new MirrorAbyssError('MESSAGE_CHANGED', '已记录的修正文与当前可见正文不一致', 'revision');
                }
            }
        }
        hooks.stage('extraction', '提取本轮明确成立的扁平事实');
        const previouslyAppliedParse = ExtractionResultSchema.safeParse(record.stages.extraction?.result);
        const previouslyApplied = previouslyAppliedParse.success
            ? previouslyAppliedParse.data
            : null;
        if (previouslyApplied
            && previouslyApplied.protocolVersion === EXTRACTION_PROMPT_VERSION
            && previouslyApplied.appliedContentHash === snapshot.contentHash) {
            hooks.stage('complete', `已复用完成结果，共 ${previouslyApplied.facts.length} 条事实`);
            return document;
        }
        const stateContextHash = hashText(JSON.stringify({ tables: document.tables, facts: document.facts }));
        const extractionHash = hashText([EXTRACTION_PROMPT_VERSION, snapshot.contentHash, snapshot.playerText, stateContextHash].join('|'));
        let extraction = cachedResult(record.stages.extraction, extractionHash, (value) => ExtractionResultSchema.parse(value));
        if (!extraction) {
            const raw = await this.model.generate({
                systemPrompt: extractionSystemPrompt(),
                prompt: extractionUserPrompt(snapshot.playerText, snapshot.text, document),
                responseLength: settings.extractionResponseTokens,
                timeoutMs: settings.requestTimeoutMs,
                signal: token.signal,
            });
            extraction = { ...parseExtractionOutput(raw), protocolVersion: EXTRACTION_PROMPT_VERSION };
            record.stages.extraction = completedStage(extractionHash, extraction);
            document = await this.commit(token, document, hooks, false); // 先保存昂贵模型结果，失败后可复用。
        }
        applyExtraction(document, record.messageKey, extraction);
        extraction.appliedContentHash = snapshot.contentHash;
        extraction.protocolVersion = EXTRACTION_PROMPT_VERSION;
        record.stages.extraction = completedStage(extractionHash, extraction);
        record.visibleContentHash = snapshot.contentHash;
        document.recordingBoundary ??= { messageIndex: record.messageIndex, messageKey: record.messageKey };
        document = await this.commit(token, document, hooks, true);
        hooks.stage('complete', `已写入 ${extraction.facts.length} 条事实`);
        return document;
    }
    async audit(token, settings, document, record, playerText, hooks) {
        if (!settings.auditEnabled)
            return { passed: true, decision: 'pass', reason: '审核未启用', violations: [], preserve: [], rewriteInstruction: '' };
        if (!settings.auditRules.trim())
            throw new Error('审核已启用，但审核规则为空');
        hooks.stage('audit', '按玩家硬规则审核正文');
        const inputHash = hashText([AUDIT_PROMPT_VERSION, settings.auditRules, playerText, record.sourceContentHash].join('|'));
        const cached = cachedResult(record.stages.audit, inputHash, (value) => AuditResultSchema.parse(value));
        if (cached)
            return cached;
        const raw = await this.model.generate({
            systemPrompt: auditSystemPrompt(),
            prompt: auditUserPrompt(settings.auditRules, playerText, record.sourceText),
            responseLength: settings.auditResponseTokens,
            timeoutMs: settings.requestTimeoutMs,
            signal: token.signal,
        });
        const result = parseAuditOutput(raw);
        record.stages.audit = completedStage(inputHash, result);
        await this.commit(token, document, hooks, false);
        return result;
    }
    async revision(token, settings, document, record, playerText, audit, hooks) {
        hooks.stage('revision', '生成并应用最小修正版');
        const inputHash = revisionInputHash(settings, record, audit);
        const cached = cachedResult(record.stages.revision, inputHash, (value) => RevisionResultSchema.parse(value));
        if (cached)
            return cached;
        const text = audit.replacementText?.trim() || await this.model.generate({
            systemPrompt: revisionSystemPrompt(settings.revisionInstructions),
            prompt: revisionUserPrompt(settings.auditRules, playerText, record.sourceText, audit),
            responseLength: settings.revisionResponseTokens,
            timeoutMs: settings.requestTimeoutMs,
            signal: token.signal,
        });
        const result = { text: text.trim() };
        record.stages.revision = completedStage(inputHash, result);
        await this.commit(token, document, hooks, false); // 候选修正文先落盘；应用失败时不重复调用模型。
        return result;
    }
    async commit(token, document, hooks, publishableChange) {
        hooks.stage('saving', '保存当前聊天 ChatDocument');
        document.revision += 1;
        document.updatedAt = Date.now();
        // FACT-DATA-005 / EVT-20260726-006：审核缓存等恢复信息不应触发世界书重发。
        if (publishableChange)
            document.publication.targetRevision = document.revision;
        await this.repository.saveCurrent(token, document);
        hooks.committed(structuredClone(document));
        return document;
    }
}
function completedStage(inputHash, result) {
    return { inputHash, completedAt: Date.now(), result: structuredClone(result) };
}
function cachedResult(stage, inputHash, parse) {
    if (!stage || stage.inputHash !== inputHash || stage.error || stage.result === undefined)
        return null;
    try {
        return parse(stage.result);
    }
    catch {
        // 无效旧缓存不进入业务层；按当前协议重新请求即可。
        return null;
    }
}
function revisionInputHash(settings, record, audit) {
    return hashText([REVISION_PROMPT_VERSION, settings.auditRules, settings.revisionInstructions, record.sourceContentHash, JSON.stringify(audit)].join('|'));
}
