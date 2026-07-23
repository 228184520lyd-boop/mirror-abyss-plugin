/**
 * 模块职责：解析审核模型返回并转换为内部审核对象。
 * 维护边界：优先读取固定文本；模型轻微漏标签、加标题或省略违规块时做保守归一，
 * 只有连 pass/revise/block 都无法确定时才视为技术格式错误。
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
    const value = normalizedKey(raw).replace(/[。.!！,，;；:：]+$/g, '');
    if (['pass', 'ok', '通过', '合格', '放行'].includes(value))
        return 'pass';
    if (['revise', '修改', '修正', '需修改', '需要修改', '需修正', '需要修正'].includes(value))
        return 'revise';
    if (['block', '阻止', '拦截', '阻断', '无法修正'].includes(value))
        return 'block';
    return '';
}
function unwrapFence(raw) {
    const text = safeText(raw, 220000).replace(/^\uFEFF/, '').trim();
    const fenced = text.match(/^```(?:text|txt|markdown|md)?\s*\n?([\s\S]*?)\n?```$/i);
    return (fenced ? fenced[1] : text).trim();
}
function looseDecision(text) {
    const normalized = text.replace(/\r/g, '').trim();
    const first = normalized.split('\n').map((line) => line.trim()).find(Boolean) || '';
    const resultField = normalized.match(/(?:result|结果|判定|结论)\s*[=＝:：]\s*([^\n<]+)/i)?.[1]?.trim() || '';
    for (const candidate of [first, resultField]) {
        // 模型若原样抄回 pass|revise|block，不能擅自取第一个候选当作通过。
        if (/[|｜]/.test(candidate))
            continue;
        const decision = decisionValue(candidate.replace(/^MA[_\s-]*/i, ''));
        if (decision)
            return decision;
    }
    if (/\bMA[_\s-]*BLOCK\b|无法(?:局部|最小)?修正|应当?阻断|必须阻断/i.test(normalized))
        return 'block';
    if (/\bMA[_\s-]*(?:REVISE|FAIL)\b|^不通过[。.!！]?$|不合格|(?:需要|需|应当?|必须)(?:进行)?(?:修改|修正)|存在(?:明确)?违规|审核不通过/im.test(normalized))
        return 'revise';
    if (/\bMA[_\s-]*(?:PASS|OK)\b|审核通过|判定通过|结论通过|未发现(?:明确)?违规|没有(?:明确)?违规|可以放行/i.test(normalized))
        return 'pass';
    return '';
}
function looseField(text, labels) {
    for (const label of labels) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = text.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*[=＝:：]\\s*(.+)`, 'i'));
        if (match?.[1]?.trim())
            return match[1].trim();
    }
    return '';
}
function looseReplacement(text) {
    const tagged = text.match(/<MA_REPLACEMENT\s*>\s*([\s\S]*?)(?:<\/MA_REPLACEMENT\s*>|$)/i)?.[1]?.trim();
    if (tagged)
        return safeText(tagged, 200000).trim() || undefined;
    const headed = text.match(/(?:^|\n)\s*(?:【?修正版(?:正文)?】?|修正后的完整正文)\s*[:：]\s*\n?([\s\S]+)$/i)?.[1]?.trim();
    return headed ? safeText(headed, 200000).trim() || undefined : undefined;
}
function syntheticViolation(reason, rewrite) {
    const detail = safeText(reason || rewrite || '审核模型判定正文需要修正', 3000).trim();
    const action = safeText(rewrite || reason || '按玩家审核规则做最小修正', 3000).trim();
    return {
        ruleId: 'audit_failure',
        rule: '玩家审核规则',
        evidence: detail,
        action,
    };
}
function resultObject({ decision, reason, violations, preserve = [], rewriteInstruction = '', replacementText }) {
    const passed = decision === 'pass';
    const normalizedViolations = passed
        ? []
        : (violations.length ? violations : [syntheticViolation(reason, rewriteInstruction)]);
    return {
        passed,
        decision,
        reason: safeText(reason, 3000).trim() || (passed ? '通过' : decision === 'block' ? '无法局部修正' : '需要修正'),
        violations: normalizedViolations.slice(0, 24),
        preserve: preserve.map((item) => safeText(item, 2000).trim()).filter(Boolean).slice(0, 24),
        rewriteInstruction: safeText(rewriteInstruction, 6000).trim(),
        violationFingerprint: passed ? '' : fingerprint(normalizedViolations),
        replacementText: decision === 'revise' ? replacementText : undefined,
    };
}
function parseLegacy(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const first = lines[0]?.trim().toUpperCase();
    if (['MA_OK', 'MA_PASS'].includes(first)) {
        return resultObject({ decision: 'pass', reason: lines.slice(1).join('\n').trim() || '通过', violations: [] });
    }
    if (['MA_FAIL', 'MA_REVISE'].includes(first)) {
        const reason = lines.slice(1).join('\n').trim() || '违反规则';
        return resultObject({ decision: 'revise', reason, violations: [], rewriteInstruction: reason, replacementText: looseReplacement(text) });
    }
    if (first === 'MA_BLOCK') {
        const reason = lines.slice(1).join('\n').trim() || '无法局部修正';
        return resultObject({ decision: 'block', reason, violations: [], rewriteInstruction: reason });
    }
    return null;
}
function parseLoose(text, originalError) {
    const decision = looseDecision(text);
    if (!decision)
        throw originalError ?? new Error('审核结果无法确定 pass、revise 或 block');
    const reason = looseField(text, ['reason', '原因', '理由'])
        || text.split('\n').map((line) => line.trim()).filter(Boolean).slice(1, 4).join(' ').replace(/<[^>]+>/g, '').trim();
    const rewrite = looseField(text, ['rewrite', '修正指令', '修改指令', '重写指令', 'action', '修改', '操作']);
    const rule = looseField(text, ['rule', '规则', '被违反的规则']);
    const evidence = looseField(text, ['evidence', '证据', '违规片段']);
    const violations = decision === 'pass' ? [] : [{
        ruleId: looseField(text, ['rule_id', '规则编号', '规则id']) || 'audit_failure',
        rule: rule || '玩家审核规则',
        evidence: evidence || reason || '审核模型判定存在违规',
        action: rewrite || reason || '按玩家审核规则做最小修正',
    }];
    return resultObject({
        decision,
        reason,
        violations,
        rewriteInstruction: rewrite,
        replacementText: looseReplacement(text),
    });
}
export function parseAuditTextOutput(raw) {
    const text = unwrapFence(raw);
    const legacy = parseLegacy(text);
    if (legacy)
        return legacy;
    let blocks;
    try {
        blocks = parseFixedTextBlocks(text, MARKERS);
    }
    catch (error) {
        return parseLoose(text, error);
    }
    const auditBlocks = blocks.filter((block) => block.kind === 'audit');
    const audit = [...auditBlocks].reverse().find((block) => decisionValue(value(block, 'result')));
    if (!audit)
        return parseLoose(text, new Error(`审核固定文本缺少有效 <MA_AUDIT> 或 result；检测到 ${auditBlocks.length} 个审核块`));
    const decision = decisionValue(value(audit, 'result'));
    const reason = safeText(value(audit, 'reason'), 3000).trim();
    const rewriteInstruction = safeText(value(audit, 'rewrite'), 6000).trim();
    const violations = blocks.filter((block) => block.kind === 'violation').map((block, index) => ({
        ruleId: safeText(value(block, 'ruleid') || `rule_${index + 1}`, 120).trim() || `rule_${index + 1}`,
        rule: safeText(value(block, 'rule'), 1000).trim(),
        evidence: safeText(value(block, 'evidence'), 3000).trim(),
        action: safeText(value(block, 'action'), 3000).trim(),
    })).filter((item) => item.rule || item.evidence || item.action).slice(0, 24);
    const replacementBlocks = blocks.filter((block) => block.kind === 'replacement');
    const replacementText = replacementBlocks.at(-1)?.raw
        ? safeText(replacementBlocks.at(-1).raw, 200000).trim() || undefined
        : looseReplacement(text);
    return resultObject({
        decision,
        reason,
        violations,
        preserve: values(audit, 'preserve'),
        rewriteInstruction,
        replacementText,
    });
}
