/**
 * 模块职责：解析审核模型的固定文本协议并转换为内部审核对象。
 * 维护边界：模型只给出自然语言字段；违规指纹、默认值和内部结构由插件生成。
 */
import { hashText, safeText } from './core-utils.js';
import { fixedTextValue, fixedTextValues, parseFixedTextBlocks } from './domain-fixed-text.js';
const MARKERS = [
    { kind: 'audit', start: '<MA_AUDIT>', end: '</MA_AUDIT>' },
    { kind: 'violation', start: '<MA_VIOLATION>', end: '</MA_VIOLATION>' },
    { kind: 'replacement', start: '<MA_REPLACEMENT>', end: '</MA_REPLACEMENT>', rawBody: true },
];
function normalizedKey(value) {
    return value.normalize('NFKC').trim().toLowerCase().replace(/[\s_-]+/g, '');
}
function aliasFields(block) {
    const aliases = {
        '结果': 'result', '判定': 'result', '结论': 'result',
        '原因': 'reason', '理由': 'reason',
        '保留': 'preserve', '必须保留': 'preserve',
        '修正指令': 'rewrite', '修改指令': 'rewrite', '重写指令': 'rewrite', 'rewriteinstruction': 'rewrite',
        '规则编号': 'ruleid', '规则id': 'ruleid', 'rule_id': 'ruleid',
        '规则': 'rule', '证据': 'evidence', '修改': 'action', '操作': 'action',
    };
    const output = new Map();
    for (const [key, values] of block.fields.entries()) {
        const normalized = normalizedKey(key);
        const target = aliases[key.trim()] || aliases[normalized] || normalized;
        output.set(target, [...(output.get(target) ?? []), ...values]);
    }
    return output;
}
function values(block, ...keys) {
    return fixedTextValues({ ...block, fields: aliasFields(block) }, ...keys);
}
function value(block, ...keys) {
    return fixedTextValue({ ...block, fields: aliasFields(block) }, ...keys);
}
function fingerprint(violations) {
    const source = violations
        .map((item) => `${item.ruleId}|${item.rule}`.toLowerCase().replace(/\s+/g, ' ').trim())
        .sort()
        .join('\n');
    return source ? hashText(source) : '';
}
function decisionValue(raw) {
    const value = normalizedKey(raw);
    if (['pass', '通过', '合格'].includes(value))
        return 'pass';
    if (['revise', '修改', '修正', '需修改', '需要修改'].includes(value))
        return 'revise';
    if (['block', '阻止', '拦截', '无法修正'].includes(value))
        return 'block';
    return '';
}
export function parseAuditTextOutput(raw) {
    const text = safeText(raw, 220000).trim();
    const legacy = text.replace(/\r/g, '').split('\n');
    if (legacy[0]?.trim().toUpperCase() === 'MA_OK') {
        return { passed: true, decision: 'pass', reason: legacy.slice(1).join('\n').trim() || '通过', violations: [], preserve: [], rewriteInstruction: '', violationFingerprint: '' };
    }
    if (legacy[0]?.trim().toUpperCase() === 'MA_FAIL') {
        const reason = legacy.slice(1).join('\n').trim() || '违反规则';
        const violations = [{ ruleId: 'legacy_failure', rule: '审核模型判定违反玩家规则', evidence: reason, action: reason }];
        return { passed: false, decision: 'revise', reason, violations, preserve: [], rewriteInstruction: reason, violationFingerprint: fingerprint(violations) };
    }
    const blocks = parseFixedTextBlocks(text, MARKERS);
    const auditBlocks = blocks.filter((block) => block.kind === 'audit');
    if (auditBlocks.length !== 1)
        throw new Error(`审核固定文本必须且只能包含一个 <MA_AUDIT>，实际 ${auditBlocks.length} 个`);
    const audit = auditBlocks[0];
    const decision = decisionValue(value(audit, 'result'));
    if (!decision)
        throw new Error('审核固定文本缺少有效 result=pass|revise|block');
    const passed = decision === 'pass';
    const violations = blocks.filter((block) => block.kind === 'violation').map((block, index) => ({
        ruleId: safeText(value(block, 'ruleid') || `rule_${index + 1}`, 120).trim() || `rule_${index + 1}`,
        rule: safeText(value(block, 'rule'), 1000).trim(),
        evidence: safeText(value(block, 'evidence'), 3000).trim(),
        action: safeText(value(block, 'action'), 3000).trim(),
    })).filter((item) => item.rule || item.evidence || item.action).slice(0, 24);
    if (!passed && !violations.length)
        throw new Error('审核判定未通过，但没有返回 <MA_VIOLATION>');
    const replacementBlocks = blocks.filter((block) => block.kind === 'replacement');
    if (replacementBlocks.length > 1)
        throw new Error('审核固定文本最多只能包含一个 <MA_REPLACEMENT>');
    const replacementText = decision === 'revise' ? safeText(replacementBlocks[0]?.raw, 200000).trim() || undefined : undefined;
    return {
        passed,
        decision,
        reason: safeText(value(audit, 'reason'), 3000).trim() || (passed ? '通过' : '违反规则'),
        violations: passed ? [] : violations,
        preserve: values(audit, 'preserve').map((item) => safeText(item, 2000).trim()).filter(Boolean).slice(0, 24),
        rewriteInstruction: safeText(value(audit, 'rewrite'), 6000).trim(),
        violationFingerprint: passed ? '' : fingerprint(violations),
        replacementText,
    };
}
