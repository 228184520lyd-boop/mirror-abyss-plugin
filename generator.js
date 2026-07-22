/**
 * 模块职责：通过 SillyTavern 当前连接或 Connection Profile 发起模型请求。
 * 维护边界：插件不保存密钥、不切换全局 Profile；同物理连接的业务请求串行，
 * 只读诊断使用独立且同样受限的诊断通道，不参与数据提交。
 */
import { getContext, getSettings } from '../core/context.js';
import { beginModelRequest, finishModelRequest } from '../core/requests.js';
import { safeText, withTimeout } from '../core/utils.js';
import { requestScheduler } from './request-scheduler.js';
const TASK_RESPONSE_TOKENS = {
    audit: 1800,
    revision: 4096,
    state: 4096,
    smallSummary: 2400,
    largeSummary: 3200,
};
function responseTokens(options) {
    const requested = Number(options.maxTokens);
    if (Number.isFinite(requested) && requested > 0) {
        return Math.max(128, Math.min(32768, Math.round(requested)));
    }
    return TASK_RESPONSE_TOKENS[options.task];
}
function textFromValue(value) {
    if (typeof value === 'string')
        return value.trim();
    if (!value || typeof value !== 'object')
        return '';
    const source = value;
    for (const key of ['text', 'output_text', 'content', 'value']) {
        const nested = source[key];
        if (typeof nested === 'string' && nested.trim())
            return nested.trim();
        if (Array.isArray(nested)) {
            const text = textFromContentParts(nested);
            if (text)
                return text;
        }
    }
    return '';
}
function textFromContentParts(value) {
    if (!Array.isArray(value))
        return '';
    const parts = [];
    for (const item of value) {
        if (typeof item === 'string') {
            if (item.trim())
                parts.push(item.trim());
            continue;
        }
        if (!item || typeof item !== 'object')
            continue;
        const source = item;
        const text = typeof source.text === 'string'
            ? source.text.trim()
            : typeof source.output_text === 'string'
                ? source.output_text.trim()
                : '';
        if (text)
            parts.push(text);
        const args = source.functionCall?.args ?? source.function_call?.arguments ?? source.input;
        if (typeof args === 'string' && args.trim())
            parts.push(args.trim());
    }
    return parts.filter(Boolean).join('\n').trim();
}
function generationText(result) {
    if (typeof result === 'string')
        return result.trim();
    if (!result || typeof result !== 'object')
        return '';
    for (const value of [result.output_text, result.content, result.text, result.result, result.value, result.pipe]) {
        if (Array.isArray(value)) {
            const text = textFromContentParts(value);
            if (text)
                return text;
            continue;
        }
        const text = textFromValue(value);
        if (text)
            return text;
    }
    const messageContent = result?.message?.content ?? result?.choices?.[0]?.message?.content;
    if (Array.isArray(messageContent)) {
        const text = textFromContentParts(messageContent);
        if (text)
            return text;
    }
    else {
        const text = textFromValue(messageContent);
        if (text)
            return text;
    }
    for (const value of [
        result?.choices?.[0]?.text,
        result?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments,
        result?.choices?.[0]?.message?.function_call?.arguments,
    ]) {
        const text = textFromValue(value);
        if (text)
            return text;
    }
    const candidateParts = result?.candidates?.[0]?.content?.parts;
    const candidateText = textFromContentParts(candidateParts);
    if (candidateText)
        return candidateText;
    if (Array.isArray(result.output)) {
        for (const item of result.output) {
            const outputText = textFromContentParts(item?.content);
            if (outputText)
                return outputText;
            const input = item?.input ?? item?.arguments;
            const inputText = textFromValue(input);
            if (inputText)
                return inputText;
        }
    }
    else {
        const outputText = textFromValue(result.output);
        if (outputText)
            return outputText;
    }
    const hasEnvelope = [
        'content', 'text', 'output', 'output_text', 'result', 'value', 'pipe', 'message', 'choices',
        'candidates', 'error', 'refusal', 'status', 'incomplete_details', 'promptFeedback',
    ].some((key) => key in result);
    return hasEnvelope ? '' : textFromValue(result);
}
function generationFailureDetail(result) {
    if (!result || typeof result !== 'object')
        return '';
    const error = result.error;
    const errorText = typeof error === 'string'
        ? error
        : typeof error?.message === 'string'
            ? error.message
            : typeof error?.error?.message === 'string'
                ? error.error.message
                : '';
    if (errorText.trim())
        return safeText(errorText, 500).trim();
    const refusal = result.refusal
        ?? result?.message?.refusal
        ?? result?.choices?.[0]?.message?.refusal;
    if (typeof refusal === 'string' && refusal.trim())
        return `模型拒绝返回内容：${safeText(refusal, 300).trim()}`;
    const incompleteReason = result?.incomplete_details?.reason;
    if (typeof incompleteReason === 'string' && incompleteReason.trim()) {
        return `模型响应未完成：${safeText(incompleteReason, 160).trim()}`;
    }
    const finishReason = result?.choices?.[0]?.finish_reason
        ?? result?.stop_reason
        ?? result?.candidates?.[0]?.finishReason
        ?? result?.candidates?.[0]?.finish_reason;
    if (typeof finishReason === 'string' && finishReason.trim()) {
        return `No message generated（终止原因：${safeText(finishReason, 160).trim()}）`;
    }
    const blockReason = result?.promptFeedback?.blockReason ?? result?.prompt_feedback?.block_reason;
    if (typeof blockReason === 'string' && blockReason.trim()) {
        return `模型请求被拦截：${safeText(blockReason, 160).trim()}`;
    }
    return '';
}
function emptyGenerationError(label, result) {
    const detail = generationFailureDetail(result);
    return new Error(detail || `${label}返回为空（No message generated）`);
}
function cleanProfileName(value) {
    return safeText(value, 160).replace(/["|\r\n]/g, '').trim();
}
function connectionManagerStore() {
    const context = getContext();
    const store = context.extensionSettings?.connectionManager;
    if (!store || !Array.isArray(store.profiles))
        return null;
    return store;
}
function supportedProfiles() {
    const context = getContext();
    try {
        const service = context.ConnectionManagerRequestService;
        if (typeof service?.getSupportedProfiles === 'function')
            return service.getSupportedProfiles();
    }
    catch {
        // fall back to raw profile list; request call will still validate.
    }
    return connectionManagerStore()?.profiles ?? [];
}
function resolveProfileId(connection) {
    const profiles = supportedProfiles();
    if (connection.profileId && profiles.some((profile) => profile?.id === connection.profileId))
        return connection.profileId;
    const legacyName = cleanProfileName(connection.profile);
    const match = profiles.find((profile) => cleanProfileName(profile?.name) === legacyName);
    if (match?.id) {
        connection.profileId = String(match.id);
        return String(match.id);
    }
    return '';
}
function messagesFromOptions(options) {
    const messages = [];
    if (options.systemPrompt.trim())
        messages.push({ role: 'system', content: options.systemPrompt });
    if (Array.isArray(options.prompt)) {
        for (const item of options.prompt) {
            const role = safeText(item?.role, 30).trim() || 'user';
            const content = safeText(item?.content, 200000);
            if (content.trim())
                messages.push({ role, content });
        }
    }
    else {
        messages.push({ role: 'user', content: options.prompt });
    }
    return messages;
}
async function generateCurrent(options, controller) {
    const context = getContext();
    if (typeof context.generateRaw !== 'function')
        throw new Error('当前SillyTavern未提供generateRaw');
    const settings = getSettings();
    const result = await withTimeout(Promise.resolve(context.generateRaw({
        systemPrompt: options.systemPrompt,
        prompt: options.prompt,
        responseLength: responseTokens(options),
        signal: options.signal,
    })), Math.max(10000, Number(settings.requestTimeoutMs) || 90000), `${options.task}模型调用`, controller);
    const text = generationText(result);
    if (!text)
        throw emptyGenerationError(`${options.task}模型`, result);
    return text;
}
async function generateWithNativeProfile(options, profileId, controller) {
    const context = getContext();
    const service = context.ConnectionManagerRequestService;
    if (typeof service?.sendRequest !== 'function') {
        throw new Error('当前SillyTavern未提供ConnectionManagerRequestService');
    }
    const settings = getSettings();
    const messages = messagesFromOptions(options);
    const overridePayload = { stream: false };
    const result = await withTimeout(Promise.resolve(service.sendRequest(profileId, messages, responseTokens(options), {
        stream: false,
        extractData: true,
        includePreset: false,
        includeInstruct: false,
        signal: options.signal,
    }, overridePayload)), Math.max(10000, Number(settings.requestTimeoutMs) || 90000), `${options.task} Connection Profile请求`, controller);
    const text = generationText(result);
    if (!text)
        throw emptyGenerationError(`${options.task} Connection Profile`, result);
    return text;
}
export function listSupportedConnectionProfiles() {
    return supportedProfiles()
        .map((profile) => ({
        id: safeText(profile?.id, 160),
        name: cleanProfileName(profile?.name) || '未命名配置',
        api: safeText(profile?.api, 80),
        model: safeText(profile?.model, 240),
    }))
        .filter((profile) => profile.id);
}
export function describeTaskConnection(task) {
    const connection = getSettings().connections[task];
    if (connection?.mode === 'profile') {
        const id = resolveProfileId(connection);
        const profile = listSupportedConnectionProfiles().find((item) => item.id === id);
        return `Connection Profile：${profile?.name || cleanProfileName(connection.profile) || '未选择'}`;
    }
    return '当前聊天连接';
}
/**
 * 所有业务模型调用的统一入口。连接解析、lane 排队、超时与活动请求登记都在此收口。
 */
export async function generateTask(options) {
    const requestClass = options.requestClass === 'diagnostic' ? 'diagnostic' : 'business';
    const controller = beginModelRequest({ task: options.task, requestClass });
    const externalSignal = options.signal;
    const forwardAbort = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted)
        forwardAbort();
    else
        externalSignal?.addEventListener('abort', forwardAbort, { once: true });
    try {
        const request = { ...options, signal: controller.signal };
        const connection = getSettings().connections[options.task];
        const profileId = connection?.mode === 'profile' ? resolveProfileId(connection) : '';
        const connectionLane = connection?.mode === 'profile'
            ? `profile:${profileId || 'unselected'}`
            : 'current-chat';
        const promptChars = Array.isArray(options.prompt)
            ? options.prompt.reduce((sum, item) => sum + safeText(item?.content, 200000).length, 0)
            : safeText(options.prompt, 200000).length;
        const tokenLimit = responseTokens(options);
        return await requestScheduler.run(connectionLane, requestClass, options.task, controller.signal, async () => {
            if (connection?.mode === 'profile') {
                if (!profileId)
                    throw new Error(`${options.task}未选择有效的Connection Profile`);
                return generateWithNativeProfile(request, profileId, controller);
            }
            return generateCurrent(request, controller);
        }, {
            requestPurpose: options.requestPurpose || 'plain',
            requestOrigin: options.requestOrigin ? safeText(options.requestOrigin, 80) : undefined,
            systemPromptChars: options.systemPrompt.length,
            promptChars,
            responseTokens: tokenLimit,
            protocol: options.requestPurpose === 'fixed-text' || options.requestPurpose === 'connection-test' ? 'fixed-text' : 'plain-text',
        });
    }
    finally {
        externalSignal?.removeEventListener('abort', forwardAbort);
        finishModelRequest(controller);
    }
}
export function requestTraceReport() {
    return requestScheduler.list();
}
export async function testConnection(task) {
    const started = performance.now();
    const raw = await generateTask({
        task,
        systemPrompt: '你是镜渊固定文本协议测试器。禁止JSON、Markdown、解释和思考标签。',
        prompt: '<MA_PING>\nstatus=ok\nsource=mirror-abyss\n</MA_PING>',
        maxTokens: 128,
        requestClass: 'diagnostic',
        requestOrigin: 'connection-test',
        requestPurpose: 'connection-test',
    });
    const normalized = raw.replace(/\r/g, '').trim();
    const instructionFollowed = /<MA_PING>\s*status\s*[=＝:：]\s*ok\s*source\s*[=＝:：]\s*mirror-abyss\s*<\/MA_PING>/i.test(normalized);
    return {
        connected: Boolean(normalized),
        instructionFollowed,
        protocolValid: instructionFollowed,
        method: describeTaskConnection(task),
        elapsedMs: Math.round(performance.now() - started),
        responsePreview: normalized.replace(/\s+/g, ' ').slice(0, 240),
        responseFormat: 'fixed-text',
        protocolDetail: '所有模型任务均使用固定文本或正文文本，不发送JSON Schema',
    };
}
//# sourceMappingURL=generator.js.map