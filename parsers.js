/* Generated from src/features/processing/parsers.ts — do not edit dist directly. */
import { MirrorAbyssError } from '../../shared/errors.js';
import { field, fields, parseBlocks } from '../../shared/fixed-text.js';
import { AuditResultSchema, ExtractionResultSchema } from './schemas.js';
const TABLE_ALIASES = {
    时空: 'spacetime', spacetime: 'spacetime',
    场景: 'scenes', scene: 'scenes', scenes: 'scenes',
    角色: 'characters', character: 'characters', characters: 'characters',
    物品: 'items', item: 'items', items: 'items',
    事件: 'events', event: 'events', events: 'events',
    地点: 'regions', region: 'regions', regions: 'regions',
    全局变化: 'globalChanges', 全局: 'globalChanges', globalchanges: 'globalChanges',
    基础设定: 'foundations', foundations: 'foundations',
    自定义对象: 'customObjects', 自定义: 'customObjects', customobjects: 'customObjects',
};
function decision(value) {
    const normalized = value.normalize('NFKC').trim().toLocaleLowerCase();
    if (['pass', '通过', '合格'].includes(normalized))
        return 'pass';
    if (['revise', '修改', '修正', '需修改', '需要修改'].includes(normalized))
        return 'revise';
    if (['block', '阻止', '拦截', '无法修正'].includes(normalized))
        return 'block';
    return null;
}
export function parseAuditOutput(raw) {
    const blocks = parseBlocks(raw, [
        { kind: 'audit', start: '<MA_AUDIT>', end: '</MA_AUDIT>' },
        { kind: 'violation', start: '<MA_VIOLATION>', end: '</MA_VIOLATION>' },
        { kind: 'replacement', start: '<MA_REPLACEMENT>', end: '</MA_REPLACEMENT>' },
    ]);
    const auditBlocks = blocks.filter((block) => block.kind === 'audit');
    if (auditBlocks.length !== 1) {
        throw new MirrorAbyssError('INVALID_AUDIT_OUTPUT', `审核结果必须包含一个 MA_AUDIT，实际 ${auditBlocks.length} 个`, 'audit');
    }
    const audit = auditBlocks[0];
    if (!audit)
        throw new MirrorAbyssError('INVALID_AUDIT_OUTPUT', '审核主块为空', 'audit');
    const result = decision(field(audit, 'result', '结果', '判定'));
    if (!result)
        throw new MirrorAbyssError('INVALID_AUDIT_OUTPUT', '审核结果缺少 pass/revise/block', 'audit');
    const violations = blocks
        .filter((block) => block.kind === 'violation')
        .map((block, index) => ({
        ruleId: field(block, 'ruleid', 'rule_id', '规则编号') || `rule_${index + 1}`,
        rule: field(block, 'rule', '规则'),
        evidence: field(block, 'evidence', '证据'),
        action: field(block, 'action', '修改', '操作'),
    }))
        .filter((item) => item.rule || item.evidence || item.action)
        .slice(0, 24);
    if (result !== 'pass' && violations.length === 0) {
        throw new MirrorAbyssError('INVALID_AUDIT_OUTPUT', '审核未通过但没有违规块', 'audit');
    }
    const replacement = blocks.find((block) => block.kind === 'replacement')?.body.trim();
    return AuditResultSchema.parse({
        passed: result === 'pass',
        decision: result,
        reason: field(audit, 'reason', '原因', '理由') || (result === 'pass' ? '通过' : '违反规则'),
        violations: result === 'pass' ? [] : violations,
        preserve: fields(audit, 'preserve', '保留', '必须保留').filter(Boolean).slice(0, 24),
        rewriteInstruction: field(audit, 'rewrite', '修正指令', '修改指令'),
        ...(result === 'revise' && replacement ? { replacementText: replacement } : {}),
    });
}
export function parseExtractionOutput(raw) {
    const blocks = parseBlocks(raw, [
        { kind: 'turn', start: '<MA_TURN>', end: '</MA_TURN>' },
        { kind: 'fact', start: '<MA_FACT>', end: '</MA_FACT>' },
    ]);
    const turnBlocks = blocks.filter((block) => block.kind === 'turn');
    if (turnBlocks.length !== 1) {
        throw new MirrorAbyssError('INVALID_EXTRACTION_OUTPUT', `状态提取必须包含一个 MA_TURN，实际 ${turnBlocks.length} 个`, 'extraction');
    }
    const facts = blocks.filter((block) => block.kind === 'fact').map((block) => {
        const tableRaw = field(block, '表格', 'table').replace(/\s+/g, '');
        const tableKey = TABLE_ALIASES[tableRaw] ?? TABLE_ALIASES[tableRaw.toLocaleLowerCase()] ?? '';
        const item = {
            eventName: field(block, '事件', 'event'),
            tableKey,
            objectName: field(block, '对象', 'object'),
            semanticLayer: field(block, '语义层', 'layer'),
            fact: field(block, '事实', 'fact'),
        };
        if (!item.tableKey || !item.objectName || !item.fact) {
            throw new MirrorAbyssError('INVALID_EXTRACTION_OUTPUT', 'MA_FACT 缺少有效表格、对象或事实', 'extraction');
        }
        return item;
    });
    return ExtractionResultSchema.parse({
        turnSummary: turnBlocks[0]?.body.trim() ?? '',
        facts,
    });
}
