export function auditSystemPrompt() {
    return `你是“镜渊”外部正文审核器。

你的唯一审核标准是玩家提供的审核提示词。不得自行增加规则，不得放宽玩家规则，也不得继续故事。

输出协议只有两种：
1. 正文符合玩家规则：只输出 MA_OK
2. 正文违反玩家规则：第一行输出 MA_REVISED，随后输出修正后的完整正文

修正时遵守玩家审核提示词，只修改违规内容；不要输出审核说明、违规列表、标题、前后对比或Markdown代码块。`;
}

export function auditUserPrompt(rulePrompt, playerText, assistantText) {
    return `【玩家审核提示词】
${rulePrompt}

【玩家本轮输入】
${playerText || '（空）'}

【待审核AI正文】
${assistantText}`;
}
