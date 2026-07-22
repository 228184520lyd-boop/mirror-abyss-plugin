/**
 * 模块职责：解析小总结和大总结的自然文本模块，并按本次请求槽位回收结果。
 * 维护边界：模型只返回位置固定的短文本；eventId、总结 ID、版本链和持久化全部由插件维护。
 */
import { safeText } from './core-utils.js';
function lines(value) {
    return String(value || '')
        .replace(/^\s+|\s+$/g, '')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
}
function lineOf(source, index) {
    return source.slice(0, index).split('\n').length;
}
function nested(body, tag) {
    const match = body.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'iu'));
    return match?.[1] ?? '';
}
function nestedAll(body, tag) {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'giu');
    return [...body.matchAll(re)].map((match) => match[1]);
}
/**
 * 固定自然模块：<MA_SUMMARY> 的前两行依次是 slot 与标题；摘要正文和关键词放在独立子模块。
 * 任何 key=value 都视为旧协议并拒绝，避免总结文本继续表现为数据库表单。
 */
export function parseSummaryTextOutput(raw, expectedSlots) {
    const source = String(raw ?? '').replace(/^\uFEFF/, '').trim();
    if (!source)
        throw new Error('总结模型返回为空');
    if (/(^|\n)\s*[^\n]+\s*[=＝]\s*\S/u.test(source))
        throw new Error('总结模型返回了已停用键值协议');
    const expected = new Set(expectedSlots.map((slot) => slot.toUpperCase()));
    const output = new Map();
    const blockRe = /<MA_SUMMARY>([\s\S]*?)<\/MA_SUMMARY>/giu;
    for (const match of source.matchAll(blockRe)) {
        const body = match[1];
        const firstNested = body.search(/<MA_(?:SUMMARY_TEXT|MEMORY|KEYWORDS)>/iu);
        const prelude = lines(firstNested < 0 ? body : body.slice(0, firstNested));
        const slot = safeText(prelude[0], 40).trim().toUpperCase();
        const title = safeText(prelude[1], 1000).trim();
        const line = lineOf(source, match.index ?? 0);
        if (!slot)
            throw new Error(`第 ${line} 行开始的 <MA_SUMMARY> 缺少槽位`);
        if (!expected.has(slot))
            throw new Error(`总结返回未请求槽位：${slot}`);
        if (output.has(slot))
            throw new Error(`总结重复返回槽位：${slot}`);
        const summary = safeText(nested(body, 'MA_SUMMARY_TEXT'), 20000).replace(/\s+/g, ' ').trim();
        if (!summary)
            throw new Error(`总结槽位 ${slot} 缺少 <MA_SUMMARY_TEXT>`);
        const keywords = lines(nested(body, 'MA_KEYWORDS'))
            .map((item) => safeText(item.replace(/^[-*•]\s*/, ''), 200).trim())
            .filter(Boolean)
            .slice(0, 24);
        const distributions = nestedAll(body, 'MA_MEMORY').map((value) => {
            const parts = lines(value);
            const content = safeText(parts.slice(2).join(' '), 1200).replace(/\s+/g, ' ').trim();
            if (content.length > 220)
                throw new Error(`总结槽位 ${slot} 的对象记忆过长：${content.length}/220 字`);
            return {
                objectType: safeText(parts[0], 80).trim(),
                objectName: safeText(parts[1], 240).trim(),
                content,
            };
        }).filter((item) => item.objectName && item.content).slice(0, 40);
        output.set(slot, { slot, title, summary, keywords, unresolved: [], distributions });
    }
    if (!output.size)
        throw new Error('总结模型未返回 <MA_SUMMARY>');
    for (const slot of expected)
        if (!output.has(slot))
            throw new Error(`总结缺少槽位结果：${slot}`);
    return output;
}
