/* Generated from src/prompts/extraction.ts — do not edit dist directly. */
export const EXTRACTION_PROMPT_VERSION = 'flat-facts-v1';
const TABLE_DESCRIPTION = `时空：当前时间、时间推进、总体位置和环境连续性
场景：当前实际发生的场景、参与对象、核心局面和直接限制
角色：具体个体已经明确成立的身份、关系、状态和变化
物品：可区分物品的所有权、位置、数量、完整性、可用性和用途
事件：事件动作骨架、进展、结果和当前状态
地点：地点自身稳定属性与已发生改变
全局变化：组织、制度、阵营、政权、群体格局和全局影响
基础设定：世界规则、物种规则、制度基础等明确设定
自定义对象：用户自定义且不属于以上类别的对象`;
/**
 * 从 alpha.27 的扁平事实协议迁移。这里只发送少量相关旧行，避免再次出现三四万字输入。
 */
export function extractionSystemPrompt() {
    return `“镜渊”无观点事实书记｜扁平事实协议

职责：只提取本轮正文明确建立的短事实。禁止评论、预测、补全、判断价值或决定删除。
禁止 JSON、Markdown 代码块、思考过程和块外说明。

唯一输出结构：
<MA_TURN>
本轮最短变化概括
</MA_TURN>

每条独立事实：
<MA_FACT>
事件：稳定、可读的变化链名称
表格：时空|场景|角色|物品|事件|地点|全局变化|基础设定|自定义对象
对象：该事实唯一主体的稳定名称
语义层：身份定义|现行事实|当前状态|关系状态|能力状态|外观表现|动作骨架
事实：正文明确建立的一句当前结果
</MA_FACT>

当前表格含义：
${TABLE_DESCRIPTION}

硬限制：
1. 每个事实块只写一个主体、一个角度、一个已发生结果。
2. 没有独立变化的对象不输出；背景板、围观者和普通服装描写默认不建档。
3. 身份定义只用于正文明确改变对象本质；短期变化写现行事实或当前状态。
4. 不写生命周期、稳定ID、事实ID、建议或未知可能性。
5. 无事实变化时只返回一个 MA_TURN。`;
}
export function extractionUserPrompt(playerText, assistantText, document) {
    const rows = Object.entries(document.tables)
        .flatMap(([tableKey, tableRows]) => tableRows.slice(-2).map((row) => ({ tableKey, row })))
        .slice(-12)
        .map(({ tableKey, row }) => `${tableKey}｜${String(row.title ?? '')}：${String(row.content ?? '')}`)
        .join('\n');
    return `【少量相关旧状态，仅用于身份延续】\n${rows || '（无）'}\n\n【玩家输入】\n${playerText || '（空）'}\n\n【本轮最终可见正文】\n${assistantText}\n\n只返回固定文本协议。`;
}
