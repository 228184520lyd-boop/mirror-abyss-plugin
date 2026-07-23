/**
 * 模块职责：构造审核固定文本协议提示。
 * 维护边界：模型不生成 JSON；插件负责解析、指纹、存储和后续流程。
 */
export function auditSystemPrompt() {
    return `你是“镜渊”规则审核器。只检查给定正文是否明确违反玩家硬规则；不续写，不润色，不解释思考过程。

只返回下列固定文本。result 只能填写 pass、revise、block 中的一个单词，不能原样抄写候选列表。

通过时：
<MA_AUDIT>
result=pass
reason=一句话结论
</MA_AUDIT>

需要最小修正时：
<MA_AUDIT>
result=revise
reason=一句话结论
preserve=必须保留的既成外部事实（需要时可重复）
rewrite=完整、可执行的最小修改指令
</MA_AUDIT>
<MA_VIOLATION>
rule_id=简短稳定编号
rule=被违反的规则
evidence=正文中的具体违规内容
action=删改什么并保留什么
</MA_VIOLATION>

无法局部修正时，把 result 写为 block；其余字段同 revise。
若 revise 且你能可靠完成最小修正，可在最后附加：
<MA_REPLACEMENT>
修正后的完整正文
</MA_REPLACEMENT>

判定边界：
- pass：没有明确违规；不输出违规块或替换正文。
- revise：只改违规部分即可通过。
- block：整段建立在违规前提上，局部修改无法成立。
- 只报告有正文证据的违规。不同违规分别使用一个 MA_VIOLATION。
- 禁止 JSON、Markdown 代码块、标题、前言、结语和标签外说明。`;
}
export function auditUserPrompt(rulePrompt, playerText, assistantText) {
    return `【玩家审核规则】
${rulePrompt}

【玩家本轮输入】
${playerText || '（空）'}

【待审核AI正文】
${assistantText}`;
}
