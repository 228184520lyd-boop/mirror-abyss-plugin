import { getContext, getSettings } from '../core/context.js';
import { beginModelRequest, finishModelRequest } from '../core/requests.js';
import { parseJsonObject, safeText, toErrorMessage, withTimeout } from '../core/utils.js';
const TASK_RESPONSE_TOKENS = {
    audit: 4096,
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
    if (value && typeof value === 'object') {
        try {
            return JSON.stringify(value);
        }
        catch {
            return '';
        }
    }
    return '';
}
function generationText(result) {
    if (typeof result === 'string')
        return result.trim();
    const envelopeKeys = ['content', 'text', 'output', 'result', 'value', 'pipe'];
    for (const key of envelopeKeys) {
        const text = textFromValue(result?.[key]);
        if (text)
            return text;
    }
    for (const value of [
        result?.message?.content,
        result?.choices?.[0]?.message?.content,
        result?.choices?.[0]?.text,
    ]) {
        const text = textFromValue(value);
        if (text)
            return text;
    }
    const hasEnvelope = Boolean(result
        && typeof result === 'object'
        && (envelopeKeys.some((key) => key in result)
            || 'message' in result
            || 'choices' in result));
    return hasEnvelope ? '' : textFromValue(result) || safeText(result, 200000).trim();
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
function profileApiMode(profileId) {
    const context = getContext();
    const profile = supportedProfiles().find((item) => item?.id === profileId);
    const selected = context.CONNECT_API_MAP?.[profile?.api]?.selected;
    return selected === 'openai' || selected === 'textgenerationwebui' ? selected : '';
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
        jsonSchema: options.jsonSchema,
        responseLength: responseTokens(options),
        signal: options.signal,
    })), Math.max(10000, Number(settings.requestTimeoutMs) || 90000), `${options.task}模型调用`, controller);
    const text = generationText(result);
    if (!text)
        throw new Error(`${options.task}模型返回为空`);
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
    if (options.jsonSchema && profileApiMode(profileId) === 'openai') {
        overridePayload.json_schema = options.jsonSchema;
    }
    const result = await withTimeout(Promise.resolve(service.sendRequest(profileId, messages, responseTokens(options), {
        stream: false,
        extractData: true,
        includePreset: false,
        includeInstruct: false,
        signal: options.signal,
    }, overridePayload)), Math.max(10000, Number(settings.requestTimeoutMs) || 90000), `${options.task} Connection Profile请求`, controller);
    const text = generationText(result);
    if (!text)
        throw new Error(`${options.task} Connection Profile返回为空`);
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
export async function generateTask(options) {
    const controller = beginModelRequest();
    try {
        const request = { ...options, signal: options.signal ?? controller.signal };
        const connection = getSettings().connections[options.task];
        if (connection?.mode === 'profile') {
            const profileId = resolveProfileId(connection);
            if (!profileId)
                throw new Error(`${options.task}未选择有效的Connection Profile`);
            return await generateWithNativeProfile(request, profileId, controller);
        }
        return await generateCurrent(request, controller);
    }
    finally {
        finishModelRequest(controller);
    }
}
export async function testConnection(task) {
    const started = performance.now();
    let raw = '';
    try {
        const request = {
            task,
            systemPrompt: '你是API结构测试器。禁止解释、禁止Markdown、禁止思考标签。',
            prompt: '只输出这个JSON对象：{"ok":true,"source":"mirror-abyss"}',
            maxTokens: 256,
            jsonSchema: {
                name: 'MirrorAbyssConnectionTest',
                description: '镜渊原生连接结构化输出测试',
                strict: true,
                value: {
                    $schema: 'http://json-schema.org/draft-04/schema#',
                    type: 'object',
                    required: ['ok', 'source'],
                    properties: {
                        ok: { type: 'boolean' },
                        source: { type: 'string' },
                    },
                    additionalProperties: false,
                },
            },
        };
        raw = await generateTask(request);
        if (raw.trim() === '{}')
            raw = await generateTask({ ...request, jsonSchema: undefined });
    }
    catch (error) {
        throw new Error(`${describeTaskConnection(task)}连接失败：${toErrorMessage(error)}`);
    }
    let jsonValid = false;
    let instructionFollowed = false;
    try {
        const parsed = parseJsonObject(raw);
        jsonValid = true;
        instructionFollowed = parsed.ok === true && parsed.source === 'mirror-abyss';
    }
    catch {
        // response remains useful for diagnosing instruction-following.
    }
    return {
        connected: Boolean(raw.trim()),
        instructionFollowed,
        jsonValid,
        method: describeTaskConnection(task),
        elapsedMs: Math.round(performance.now() - started),
        responsePreview: raw.replace(/\s+/g, ' ').slice(0, 240),
    };
}
