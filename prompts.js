import { EXTRACTION_TYPES, FACT_PROTOCOL, SUMMARY_PROTOCOL, WORLD_TYPES, renderSchema } from '../core/schema.js';

const outputDiscipline = `只输出规定的最终协议。不要输出分析、推理过程、解释、前言、后记、代码块或JSON。`;

export function auditPrompt(assistantText) {
  return {
    system: `你只审核当前AI正文是否越权替玩家行动。\n${outputDiscipline}\n合规时只输出：审核结论：通过\n需要修正时输出：\n审核结论：需要修正\n- 明确问题`,
    user: `当前AI正文：\n${assistantText}`,
  };
}

export function revisionPrompt(assistantText, issues) {
  return {
    system: `只修正列出的越权内容，保留原事件顺序、叙事视角、人物行为和有效信息。输出可直接替换原消息的完整自然正文。${outputDiscipline}`,
    user: `明确问题：\n${issues.map(issue => `- ${issue}`).join('\n')}\n\n原AI正文：\n${assistantText}`,
  };
}

export function extractionPrompt(playerText, assistantText, relevantEntries) {
  const index = relevantEntries.map(entry => `${entry.title}\n${entry.content}`).join('\n\n');
  return {
    system: `你是世界事实整理员。只记录本轮正文已经明确成立、会影响后续连续性的事实；不补全、不预测、不写玩家愿望。\n\n允许类型与栏目：\n${renderSchema(EXTRACTION_TYPES)}\n\n每条事实严格使用：\n${FACT_PROTOCOL}\n没有可记录事实时只输出“无”。\n${outputDiscipline}`,
    user: `相关世界书条目：\n${index || '（无）'}\n\n玩家本轮输入：\n${playerText || '（无）'}\n\n当前AI正文：\n${assistantText}`,
  };
}

export function importPrompt(sourceText, relevantEntries) {
  const index = relevantEntries.map(entry => `${entry.title}\n${entry.content}`).join('\n\n');
  return {
    system: `把玩家主动提交的世界设定整理为世界书事实。模型只决定语义类型、稳定名称、栏目与事实；插件决定UID、唯一身份和写入。不得把写作要求、提示规则、未来计划或未成立事件写成世界事实。\n\n允许类型与栏目：\n${renderSchema(WORLD_TYPES)}\n\n每条事实严格使用：\n${FACT_PROTOCOL}\n本任务的变化字段统一写“建立”。同一“类型＋稳定名称”的多行会形成同一个候选条目。没有可导入事实时只输出“无”。最多16个候选对象。\n${outputDiscipline}`,
    user: `玩家提交的世界设定（唯一来源）：\n${sourceText}\n\n已有相关条目（只用于复用稳定名称并避免重复）：\n${index || '（无）'}`,
  };
}

export function summaryPrompt(kind, sources, requirement = '') {
  const label = kind === 'small' ? '当前场景小总结' : kind === 'large' ? '长期大总结' : '玩家指定人工合并';
  const sourceText = sources.map((entry, index) => `【条目${index + 1}】\n${entry.title}\n${entry.content}`).join('\n\n');
  return {
    system: `${label}：把来源事实整理成更少、更完整的结果，不生成任务、未来行动或剧情方向。每条输出严格使用：\n${SUMMARY_PROTOCOL}\n同一目标的多行必须使用完全相同的来源编号、类型和稳定名称。无需改变时，小总结和大总结可以只输出“无”；人工合并必须返回结果。\n\n允许类型与栏目：\n${renderSchema(WORLD_TYPES)}\n${outputDiscipline}`,
    user: `${requirement ? `玩家要求：\n${requirement}\n\n` : ''}来源条目：\n${sourceText}`,
  };
}
