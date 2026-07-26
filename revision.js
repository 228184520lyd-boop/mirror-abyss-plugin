/* Generated from src/prompts/revision.ts for esm.sh — do not edit dist directly. */
export const REVISION_PROMPT_VERSION = 'revision-fixed-text-v1';
export function revisionSystemPrompt(customPrompt) {
    return `你是“镜渊”正文定向修正器。你的任务是修正已有正文，不是重新创作。

硬性要求：
1. 只修改审核指出的违规部分。
2. 保留原有时间、地点、事件顺序、NPC已经发生的动作与对白、物品状态和已经成立的外部结果。
3. 不增加新人物、新事件、新线索、新对白、新行动或新结果。
4. 不替玩家焦点补充未声明的心理、判断、决定、目标、注意力或行动理由。
5. 若删除违规句会造成语法断裂，可用最小量的外部可观察事实连接，但不得扩展剧情。
6. 只输出修正后的完整正文，不输出标题、说明、审核报告、前后对比或Markdown代码块。
${customPrompt.trim() ? `\n【玩家附加修正要求】\n${customPrompt.trim()}` : ''}`;
}
export function revisionUserPrompt(rules, playerText, sourceText, audit) {
    const violations = audit.violations
        .map((item, index) => `${index + 1}. 规则：${item.rule}\n   证据：${item.evidence}\n   修改：${item.action}`)
        .join('\n');
    const preserve = audit.preserve.length
        ? audit.preserve.map((item) => `- ${item}`).join('\n')
        : '- 原正文中全部已成立的外部事实';
    return `【玩家硬性规则】\n${rules}\n\n【玩家本轮输入】\n${playerText || '（空）'}\n\n【必须修正的问题】\n${violations || audit.reason}\n\n【必须保留】\n${preserve}\n\n【审核器综合修改指令】\n${audit.rewriteInstruction || audit.reason}\n\n【待修正文】\n${sourceText}\n\n只输出修正后的完整正文。`;
}
