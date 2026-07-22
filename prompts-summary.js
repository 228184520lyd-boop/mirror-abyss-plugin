/**
 * 模块职责：构造按事件槽位的小总结和大总结固定文本协议。
 * 维护边界：模型不返回 eventId 或 JSON；插件用本次请求 slot 映射内部事件线与版本链。
 */
import { DEFAULT_SUMMARY_PROMPTS } from './constants.js';
function ruleLines(value) {
    return String(value || '')
        .split(/\n+/)
        .map((line) => line.trim().replace(/^[-*•\d.、)）\s]+/, ''))
        .filter(Boolean)
        .map((line, index) => `${index + 1}. ${line}`)
        .join('\n') || '（无附加规则）';
}
export function summaryFixedProtocol(kind) {
    return `<MA_SUMMARY>
${kind === 'small' ? 'S1' : 'L1'}
事件线标题
<MA_SUMMARY_TEXT>
${kind === 'small' ? '只保留近期继续游玩必须知道的结果与未决状态。' : '只保留跨阶段仍成立的长期结果。'}
</MA_SUMMARY_TEXT>
<MA_MEMORY>
角色
对象名
${kind === 'small' ? '该对象近期继续游玩必须知道的一句结果。' : '该对象跨阶段仍成立的一句长期结果。'}
</MA_MEMORY>
<MA_KEYWORDS>
关键词
</MA_KEYWORDS>
</MA_SUMMARY>`;
}
function systemPrompt(kind, sections, maxChars) {
    const small = kind === 'small';
    return `任务：生成每个事件槽位当前唯一有效的${small ? '小总结' : '大总结'}。

角色边界：
职责仅限于无观点事实压缩。只保留材料中明确成立、符合白盒规则的事实；不推测未来、不解释动机、不评价重要性、不补全未知。

事实筛选边界：
${sections.coreQuestion}

只保留：
${ruleLines(sections.includeRules)}

必须删除：
${ruleLines(sections.excludeRules)}

更新规则：
${ruleLines(sections.updateRules)}

表达规则：
${ruleLines(sections.expressionRules)}

固定要求：
1. 必须返回固定文本协议。
2. 只使用本次请求提供的材料，不读取聊天正文，不补全未显影内容。
3. <MA_SUMMARY> 第一行是本次请求槽位，第二行是标题；槽位必须原样返回，不要输出任何内部 ID。
4. 每个输入 slot 必须且只能返回一个 <MA_SUMMARY>。
5. 禁止 JSON、Markdown 代码块、解释、分析过程和思考标签。
6. <MA_SUMMARY_TEXT> 正文不得超过 ${Math.max(200, Math.round(maxChars))} 个字符；只删除重复、已覆盖过程与无事实内容，不得新增事实。
7. 不输出建议、评价、潜在价值或处理方案；小总结只保留近期连续性，大总结只保留长期结果。
8. 禁止使用等号、键值字段和逐条复述原子事实。
9. 每个需要承接结果的对象可输出一个 <MA_MEMORY>：第一行对象类型，第二行对象名，后续只写该对象自身的一句结果；不要把事件摘要复制给所有对象。
10. 临时对象没有持续结果时不输出 <MA_MEMORY>，由插件在覆盖审计后删除其临时条目。

固定输出协议：
${summaryFixedProtocol(kind)}`;
}
export function smallSummarySystemPrompt(sections = DEFAULT_SUMMARY_PROMPTS.small, maxChars = 420) {
    return systemPrompt('small', sections, maxChars);
}
function lines(values) {
    return values.map((item) => `- ${String(item ?? '').trim()}`).filter((item) => item !== '-').join('\n') || '（无）';
}
function distributionLines(items) {
    if (!items?.length)
        return '（无）';
    return items.map((item) => `- ${item.objectType || '对象'}｜${item.objectName}：${item.content}`).join('\n');
}
function smallEventSection(group, index) {
    const slot = group.slot || `S${index + 1}`;
    const facts = group.facts.map((fact, factIndex) => `事实${factIndex + 1}
标题：${fact.title}
已发生：${lines(fact.occurredFacts)}
状态：${fact.status}
时间：${[fact.timeRange.start, fact.timeRange.end, fact.timeRange.label].filter(Boolean).join(' / ') || '未标注'}
直接影响对象：${lines(fact.relatedEntities)}
置信度：${fact.confidence}`).join('\n\n');
    return `【事件槽位 ${slot}】
内部事件名称（只用于理解，不要输出）：${group.eventId}

上一版小总结（待修订原料，不是必须保留的正文）：
${group.previous ? `标题：${group.previous.title}\n摘要：${group.previous.summary}\n对象承接：\n${distributionLines(group.previous.distributions)}\n关键词：${lines(group.previous.keywords)}` : '（无）'}

本次新增事实：
${facts || '（无）'}`;
}
export function smallSummaryBatchPrompt(groups) {
    return `分别更新下列事件槽位的小总结。对每个槽位都要重写当前唯一有效版本，不得在旧总结后追加。

${groups.map(smallEventSection).join('\n\n====================\n\n')}

按输入顺序返回 <MA_SUMMARY>。每个 slot 必须且只能出现一次。`;
}
export function smallSummaryPrompt(eventId, facts, previous) {
    return smallSummaryBatchPrompt([{ slot: 'S1', eventId, facts, previous }]);
}
export function largeSummarySystemPrompt(sections = DEFAULT_SUMMARY_PROMPTS.large, maxChars = 900) {
    return systemPrompt('large', sections, maxChars);
}
function largeEventSection(group, index) {
    const slot = group.slot || `L${index + 1}`;
    return `【事件槽位 ${slot}】
内部事件名称（只用于理解，不要输出）：${group.eventId}

上一版长期总结（待修订原料）：
${group.previousLarge ? `标题：${group.previousLarge.title}\n摘要：${group.previousLarge.summary}\n对象承接：\n${distributionLines(group.previousLarge.distributions)}\n关键词：${lines(group.previousLarge.keywords)}` : '（无）'}

最新累计小总结（只作为已确认事实材料，不得逐句缩写或推测长期意义）：
标题：${group.latestSmall.title}
摘要：${group.latestSmall.summary}
对象承接：
${distributionLines(group.latestSmall.distributions)}
关键词：${lines(group.latestSmall.keywords)}`;
}
export function largeSummaryPrompt(groups) {
    return `分别处理下列事件槽位。只写材料明确表述为长期、持续、不可逆或跨阶段成立的事实；没有介入或改变长期因果的对象描写不写入；不得根据人物重要性、未来可能或主观判断扩写。不是逐句缩写小总结。

${groups.map(largeEventSection).join('\n\n====================\n\n')}

按输入顺序返回 <MA_SUMMARY>。每个 slot 必须且只能出现一次。`;
}
