/**
 * 模块职责：解析模型返回的固定标签文本协议。
 * 维护边界：只处理文本边界、重复字段和续行；业务字段、对象身份与持久化由各领域模块负责。
 */
import { safeText } from '../core/utils.js';
function normalizedMarker(value) {
    return value.trim().toUpperCase();
}
function appendField(block, key, value) {
    const current = block.fields.get(key) ?? [];
    block.fields.set(key, [...current, value]);
}
function appendContinuation(block, key, value) {
    const current = block.fields.get(key) ?? [];
    if (!current.length)
        return;
    const next = [...current];
    next[next.length - 1] = `${next[next.length - 1]}\n${value}`.trim();
    block.fields.set(key, next);
}
/**
 * 支持：英文/中文等号、英文/中文冒号、重复字段、多行续写、原文块。
 * 固定文本是提交协议而不是宽松标记提取：普通块必须用与起始标签配对的结束标签闭合。
 */
export function parseFixedTextBlocks(raw, markers) {
    const source = safeText(raw, 240000).replace(/^\uFEFF/, '');
    const byStart = new Map(markers.map((item) => [normalizedMarker(item.start), item]));
    const byEnd = new Map(markers.map((item) => [normalizedMarker(item.end), item]));
    const blocks = [];
    let current = null;
    let definition = null;
    let lastKey = '';
    let rawLines = [];
    const flush = () => {
        if (!current)
            return;
        if (definition?.rawBody)
            current.raw = rawLines.join('\n').trim();
        blocks.push(current);
        current = null;
        definition = null;
        lastKey = '';
        rawLines = [];
    };
    source.split(/\r?\n/).forEach((sourceLine, index) => {
        const trimmed = sourceLine.trim();
        const markerKey = normalizedMarker(trimmed);
        // 原文块内只有自身结束标签具有结构意义；正文恰好包含其他协议标签时仍按原文保留。
        if (current && definition?.rawBody) {
            if (markerKey === normalizedMarker(definition.end)) {
                flush();
            }
            else {
                rawLines.push(sourceLine);
            }
            return;
        }
        const start = byStart.get(markerKey);
        if (start) {
            if (current && definition) {
                throw new Error(`第 ${current.line} 行开始的 ${definition.start} 未闭合，缺少 ${definition.end}`);
            }
            definition = start;
            current = { kind: start.kind, fields: new Map(), raw: '', line: index + 1 };
            return;
        }
        const end = byEnd.get(markerKey);
        if (end) {
            if (!current || !definition)
                throw new Error(`第 ${index + 1} 行出现未配对结束标签 ${end.end}`);
            if (markerKey !== normalizedMarker(definition.end)) {
                throw new Error(`第 ${current.line} 行开始的 ${definition.start} 结束标签不匹配，期望 ${definition.end}`);
            }
            flush();
            return;
        }
        if (!current || !definition)
            return;
        if (definition.rawBody) {
            rawLines.push(sourceLine);
            return;
        }
        if (!trimmed || /^```/.test(trimmed))
            return;
        const match = sourceLine.match(/^\s*([^=＝:：]+?)\s*[=＝:：]\s*(.*)$/);
        if (match) {
            lastKey = match[1].trim();
            if (lastKey)
                appendField(current, lastKey, match[2].trim());
            return;
        }
        if (lastKey)
            appendContinuation(current, lastKey, sourceLine.trim());
    });
    if (current && definition) {
        throw new Error(`第 ${current.line} 行开始的 ${definition.start} 未闭合，缺少 ${definition.end}`);
    }
    return blocks;
}
export function fixedTextValues(block, ...keys) {
    const output = [];
    const seen = new Set();
    for (const key of keys) {
        for (const raw of block.fields.get(key) ?? []) {
            const value = safeText(raw, 12000).trim();
            if (!value || seen.has(value))
                continue;
            seen.add(value);
            output.push(value);
        }
    }
    return output;
}
export function fixedTextValue(block, ...keys) {
    return fixedTextValues(block, ...keys).at(-1) ?? '';
}
//# sourceMappingURL=fixed-text.js.map