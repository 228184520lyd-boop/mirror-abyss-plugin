import { getSettings } from '../core/context.js';
import { JsonObjectParseError, jsonPreview, parseJsonObject, safeText, toErrorMessage } from '../core/utils.js';
import { describeTaskConnection, generateTask } from './generator.js';
function repairSystemPrompt(structureDescription) {
    return `你是JSON格式修复器。你不执行原任务、不补充新事实、不解释内容，只把给定模型输出转换成一个合法JSON对象。

要求：
1. 保留原输出中已经表达的语义，不自行重做审核、总结或状态提取。
2. 删除Markdown代码围栏、解释、前言、结语和思考标签。
3. 修复缺失引号、尾随逗号、全角标点等格式问题。
4. 输出必须能被JSON.parse直接解析，根节点必须是对象。
5. 只输出JSON对象，禁止输出任何额外文字。

【目标结构】
${structureDescription}`;
}
function repairUserPrompt(raw) {
    return `【需要修复的原始输出】
${safeText(raw, 80000)}`;
}
const TASK_LABELS = {
    audit: '规则审核',
    state: '状态表',
    smallSummary: '小总结',
    largeSummary: '大总结',
};
function structuredError(task, error, raw) {
    const connection = describeTaskConnection(task);
    const preview = error instanceof JsonObjectParseError ? error.preview : jsonPreview(raw);
    const detail = toErrorMessage(error);
    return new Error(`${TASK_LABELS[task]}未返回有效JSON结构（${connection}）。${detail}${preview ? `；返回片段：${preview}` : ''}`);
}
export async function repairStructuredOutput(task, raw, structureDescription) {
    const repaired = await generateTask({
        task,
        systemPrompt: repairSystemPrompt(structureDescription),
        prompt: repairUserPrompt(raw),
    });
    return parseJsonObject(repaired);
}
export async function generateStructuredTask(options) {
    const raw = await generateTask(options);
    try {
        return parseJsonObject(raw);
    }
    catch (firstError) {
        const allowRepair = options.allowRepair ?? getSettings().repairInvalidJsonOnce;
        if (!allowRepair)
            throw structuredError(options.task, firstError, raw);
        try {
            if (raw.trim() === '{}' && options.jsonSchema) {
                const fallbackRaw = await generateTask({ ...options, jsonSchema: undefined });
                try {
                    return parseJsonObject(fallbackRaw);
                }
                catch (fallbackError) {
                    throw structuredError(options.task, fallbackError, fallbackRaw);
                }
            }
            return await repairStructuredOutput(options.task, raw, options.structureDescription);
        }
        catch (repairError) {
            if (repairError instanceof Error && repairError.message.startsWith(`${TASK_LABELS[options.task]}未返回有效JSON结构`)) {
                throw repairError;
            }
            throw structuredError(options.task, repairError, raw);
        }
    }
}
