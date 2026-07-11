(() => {
    'use strict';

    const MODULE_NAME = 'mirrorAbyss';
    const DISPLAY_NAME = '镜渊';
    const VERSION = '1.0.0-rc.3.1';
    const EXTENSION_PATH = 'third-party/MA';
    const GRAPH_LIB_URL = 'https://unpkg.com/3d-force-graph@1.79.1/dist/3d-force-graph.min.js';
    const TABLE_KEYS = ['focus', 'spacetime', 'characters', 'relationships', 'items', 'events', 'regions', 'foundations'];
    const TABLE_LABELS = {
        focus: '当前焦点',
        spacetime: '时间与地点',
        characters: '人物',
        relationships: '关系',
        items: '物品',
        events: '事件与流程',
        regions: '区域状态',
        foundations: '基础设定',
    };

    const DEFAULT_SETTINGS = Object.freeze({
        enabled: true,
        autoState: true,
        autoSmallSummary: true,
        smallSummaryTurns: 15,
        autoLargeSummary: true,
        largeSummaryCount: 6,
        graphLibraryUrl: GRAPH_LIB_URL,
        showMessagePanels: true,
        showFloatingButton: true,
        showTopButton: true,

        generationMode: 'independent',
        apiProvider: 'openai-compatible',
        apiBaseUrl: '',
        apiKey: '',
        apiModel: '',
        apiTemperature: 0.1,
        apiMaxTokens: 4096,
        apiJsonMode: false,
        stateProfile: '',
        smallSummaryProfile: '',
        largeSummaryProfile: '',
        auditProfile: '',

        ruleAuditEnabled: false,
        ruleAuditPrompt: '',
        ruleAuditFailAction: 'withdraw',

        lorebookSync: true,
        lorebookName: '',
        autoCreateChatLorebook: true,
        vectorizeStateRows: false,
        showExternalLorebookNodes: true,
        latestContinuityConstant: true,
    });

    let initialized = false;
    let queueTail = Promise.resolve();
    const activeJobs = new Map();
    let graphInstance = null;
    let graphResizeObserver = null;
    let graphScriptPromise = null;
    let lorebookSyncTimer = null;
    let worldInfoModulePromise = null;
    let graphSearch = '';
    const messageProcessPromises = new Map();
    const pipelineTimers = new Map();
    let controlCenterTab = 'overview';
    const fallbackChatMetadata = {};
    let settingsPanelRetryTimer = null;
    let interfaceObserver = null;

    function cloneDefaults(value) {
        try {
            if (typeof structuredClone === 'function') return structuredClone(value);
        } catch (error) {
            console.warn('[MirrorAbyss] structuredClone unavailable, using JSON clone', error);
        }
        return JSON.parse(JSON.stringify(value));
    }

    function hasOwn(object, key) {
        return typeof Object.hasOwn === 'function' ? Object.hasOwn(object, key) : Object.prototype.hasOwnProperty.call(object, key);
    }

    function ctx() {
        return window.SillyTavern?.getContext?.();
    }

    function settings() {
        const context = ctx();
        if (!context) return cloneDefaults(DEFAULT_SETTINGS);
        const all = context.extensionSettings;
        if (!all[MODULE_NAME]) all[MODULE_NAME] = cloneDefaults(DEFAULT_SETTINGS);
        for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
            if (!hasOwn(all[MODULE_NAME], key)) all[MODULE_NAME][key] = value;
        }
        return all[MODULE_NAME];
    }

    function saveSettings() {
        ctx()?.saveSettingsDebounced?.();
    }


    function chatMeta() {
        const context = ctx();
        const metadata = context?.chatMetadata && typeof context.chatMetadata === 'object'
            ? context.chatMetadata
            : fallbackChatMetadata;
        metadata[MODULE_NAME] ||= {
            schemaVersion: 2,
            lorebookName: '',
            lastSyncAt: null,
            lastSyncError: null,
            lastSyncState: 'idle',
            lastAuditFailure: null,
        };
        const meta = metadata[MODULE_NAME];
        if (!hasOwn(meta, 'lastSyncState')) meta.lastSyncState = meta.lastSyncError ? 'error' : meta.lastSyncAt ? 'success' : 'idle';
        if (!hasOwn(meta, 'lastAuditFailure')) meta.lastAuditFailure = null;
        return meta;
    }

    async function persistMetadata() {
        const context = ctx();
        try {
            context?.saveMetadataDebounced?.();
            const script = await import(/* webpackIgnore: true */ '/script.js');
            if (typeof script.saveMetadata === 'function') await script.saveMetadata();
        } catch (error) {
            console.warn('[MirrorAbyss] Could not persist metadata immediately', error);
        }
    }

    function slashResultText(result) {
        if (typeof result === 'string') return result.trim();
        for (const key of ['pipe', 'output', 'result', 'text', 'value']) {
            if (typeof result?.[key] === 'string') return result[key].trim();
        }
        return '';
    }

    function safeProfileName(value) {
        return String(value || '').replace(/["|\r\n]/g, '').trim();
    }

    function normalizeApiBaseUrl(value, provider = settings().apiProvider) {
        let url = String(value || '').trim().replace(/\/+$/, '');
        if (provider === 'openai-compatible') {
            url = url.replace(/\/chat\/completions$/i, '').replace(/\/models$/i, '');
        }
        if (provider === 'anthropic') url = url.replace(/\/messages$/i, '');
        return url;
    }

    function independentApiConfigured() {
        const cfg = settings();
        return Boolean(cfg.apiProvider && cfg.apiKey && cfg.apiModel && (cfg.apiProvider === 'gemini' || normalizeApiBaseUrl(cfg.apiBaseUrl, cfg.apiProvider)));
    }

    function textFromOpenAiContent(content) {
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) return content.map(part => typeof part === 'string' ? part : part?.text || part?.content || '').join('');
        return String(content || '');
    }

    async function callIndependentApi(options = {}) {
        const cfg = settings();
        if (!independentApiConfigured()) throw new Error('独立模型尚未配置完整：请填写 API 地址、密钥和模型');
        const provider = cfg.apiProvider || 'openai-compatible';
        const systemPrompt = String(options.systemPrompt || '');
        const prompt = String(options.prompt || '');
        const temperature = Math.max(0, Math.min(2, Number(cfg.apiTemperature) || 0));
        const maxTokens = Math.max(128, Math.min(65536, Number(cfg.apiMaxTokens) || 4096));
        let response;

        try {
            if (provider === 'gemini') {
                const base = normalizeApiBaseUrl(cfg.apiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta', provider) || 'https://generativelanguage.googleapis.com/v1beta';
                const model = String(cfg.apiModel).replace(/^models\//, '');
                const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
                const body = {
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { temperature, maxOutputTokens: maxTokens },
                };
                if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
                if (options.jsonSchema) body.generationConfig.responseMimeType = 'application/json';
                response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                if (!response.ok) throw new Error(`Gemini 请求失败 ${response.status}: ${(await response.text()).slice(0, 500)}`);
                const data = await response.json();
                return data?.candidates?.[0]?.content?.parts?.map(part => part?.text || '').join('') || '';
            }

            if (provider === 'anthropic') {
                const base = normalizeApiBaseUrl(cfg.apiBaseUrl || 'https://api.anthropic.com/v1', provider) || 'https://api.anthropic.com/v1';
                response = await fetch(`${base}/messages`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': cfg.apiKey,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerous-direct-browser-access': 'true',
                    },
                    body: JSON.stringify({
                        model: cfg.apiModel,
                        system: systemPrompt,
                        messages: [{ role: 'user', content: prompt }],
                        temperature,
                        max_tokens: maxTokens,
                    }),
                });
                if (!response.ok) throw new Error(`Anthropic 请求失败 ${response.status}: ${(await response.text()).slice(0, 500)}`);
                const data = await response.json();
                return data?.content?.map(part => part?.text || '').join('') || '';
            }

            const base = normalizeApiBaseUrl(cfg.apiBaseUrl, provider);
            const body = {
                model: cfg.apiModel,
                messages: [
                    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                    { role: 'user', content: prompt },
                ],
                temperature,
                max_tokens: maxTokens,
                stream: false,
            };
            if (options.jsonSchema && cfg.apiJsonMode) body.response_format = { type: 'json_object' };
            response = await fetch(`${base}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(`OpenAI 兼容请求失败 ${response.status}: ${(await response.text()).slice(0, 500)}`);
            const data = await response.json();
            return textFromOpenAiContent(data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '');
        } catch (error) {
            if (/Failed to fetch|NetworkError|CORS/i.test(String(error?.message || error))) {
                throw new Error('独立 API 无法从浏览器访问，可能被 CORS 阻止。请改用允许跨域的反代，或切换为酒馆连接配置模式。');
            }
            throw error;
        }
    }

    async function generateWithProfile(task, options) {
        const context = ctx();
        if (!context?.generateRaw) throw new Error('当前酒馆版本未提供 generateRaw');
        const cfg = settings();
        const key = task === 'state' ? 'stateProfile' : task === 'small' ? 'smallSummaryProfile' : task === 'large' ? 'largeSummaryProfile' : 'auditProfile';
        const profile = safeProfileName(cfg[key]);
        if (!profile) return await context.generateRaw(options);
        try {
            const slash = await import(/* webpackIgnore: true */ '/scripts/slash-commands.js');
            if (typeof slash.executeSlashCommands !== 'function') return await context.generateRaw(options);
            const original = slashResultText(await slash.executeSlashCommands('/profile'));
            await slash.executeSlashCommands(`/profile "${profile}"`);
            try {
                return await context.generateRaw(options);
            } finally {
                if (original && original !== profile) {
                    await slash.executeSlashCommands(`/profile "${safeProfileName(original)}"`).catch(() => {});
                }
            }
        } catch (error) {
            console.warn(`[MirrorAbyss] Profile ${profile} unavailable; falling back to current connection`, error);
            return await context.generateRaw(options);
        }
    }

    async function generateTask(task, options) {
        const mode = settings().generationMode || 'independent';
        if (mode === 'independent') return await callIndependentApi(options);
        if (mode === 'profile') return await generateWithProfile(task, options);
        const context = ctx();
        if (!context?.generateRaw) throw new Error('当前酒馆版本未提供 generateRaw');
        return await context.generateRaw(options);
    }

    async function fetchIndependentModels() {
        const cfg = settings();
        if (!cfg.apiKey) throw new Error('请先填写 API 密钥');
        const provider = cfg.apiProvider || 'openai-compatible';
        if (provider === 'anthropic') throw new Error('Anthropic 未提供通用模型列表接口，请手动填写模型名');
        try {
            let response;
            if (provider === 'gemini') {
                const base = normalizeApiBaseUrl(cfg.apiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta', provider) || 'https://generativelanguage.googleapis.com/v1beta';
                response = await fetch(`${base}/models?key=${encodeURIComponent(cfg.apiKey)}`);
                if (!response.ok) throw new Error(`模型列表请求失败 ${response.status}: ${(await response.text()).slice(0, 300)}`);
                const data = await response.json();
                return (data?.models || []).filter(model => model?.supportedGenerationMethods?.includes('generateContent')).map(model => String(model.name || '').replace(/^models\//, '')).filter(Boolean);
            }
            const base = normalizeApiBaseUrl(cfg.apiBaseUrl, provider);
            if (!base) throw new Error('请填写 API 地址');
            response = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${cfg.apiKey}` } });
            if (!response.ok) throw new Error(`模型列表请求失败 ${response.status}: ${(await response.text()).slice(0, 300)}`);
            const data = await response.json();
            return (data?.data || data?.models || []).map(model => typeof model === 'string' ? model : model?.id || model?.name).filter(Boolean).sort();
        } catch (error) {
            if (/Failed to fetch|NetworkError|CORS/i.test(String(error?.message || error))) throw new Error('无法读取模型列表，可能被 CORS 阻止。可手动填写模型名，或改用允许跨域的 API 反代。');
            throw error;
        }
    }

    async function testIndependentApi() {
        const raw = await callIndependentApi({
            systemPrompt: '你是连接测试器。',
            prompt: '只回复 MA_OK',
        });
        if (!/MA_OK/i.test(String(raw || ''))) throw new Error(`连接成功，但模型返回异常：${String(raw || '').slice(0, 120)}`);
        return true;
    }

    function toast(kind, text) {
        if (window.toastr?.[kind]) window.toastr[kind](text, DISPLAY_NAME);
        else console[kind === 'error' ? 'error' : 'log'](`[${DISPLAY_NAME}] ${text}`);
    }

    function escapeHtml(value) {
        const text = String(value ?? '');
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function makeId(prefix = 'ma') {
        if (crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }

    function cleanRecord(record, tableKey, index) {
        const source = record && typeof record === 'object' ? record : {};
        return {
            id: String(source.id || makeId(tableKey)),
            title: String(source.title || source.name || `${TABLE_LABELS[tableKey]} ${index + 1}`).trim(),
            content: String(source.content || source.summary || '').trim(),
            keywords: Array.isArray(source.keywords)
                ? source.keywords.map(String).map(x => x.trim()).filter(Boolean).slice(0, 12)
                : [],
            status: String(source.status || 'active').trim(),
        };
    }

    function normalizeSnapshot(snapshot) {
        const out = {};
        for (const key of TABLE_KEYS) {
            const rows = Array.isArray(snapshot?.[key]) ? snapshot[key] : [];
            const used = new Set();
            out[key] = rows.map((row, index) => cleanRecord(row, key, index)).map(row => {
                if (used.has(row.id)) row.id = makeId(key);
                used.add(row.id);
                return row;
            });
        }
        return out;
    }

    function emptySnapshot() {
        return normalizeSnapshot({});
    }

    function getChat() {
        return ctx()?.chat || [];
    }

    function getMessage(index) {
        return getChat()[Number(index)] || null;
    }

    function ensureMessageData(message) {
        if (!message) return null;
        message.extra ||= {};
        message.extra[MODULE_NAME] ||= {};
        const data = message.extra[MODULE_NAME];
        const defaults = {
            schemaVersion: 2,
            artifactId: makeId('artifact'),
            revision: 0,
            status: 'idle',
            tableSnapshot: null,
            activeTableKey: 'focus',
            smallSummary: null,
            largeSummary: null,
            error: null,
            updatedAt: null,
            sourceFingerprint: '',
            auditStatus: 'idle',
            auditError: null,
            auditResult: null,
            auditFingerprint: '',
            lorebookEntryIds: [],
        };
        for (const [key, value] of Object.entries(defaults)) {
            if (!hasOwn(data, key)) data[key] = Array.isArray(value) ? [] : value;
        }
        data.schemaVersion = 2;
        return data;
    }

    function previousSnapshot(beforeIndex) {
        const chat = getChat();
        for (let i = Number(beforeIndex) - 1; i >= 0; i--) {
            const item = chat[i];
            if (item?.is_user) continue;
            const snap = item?.extra?.[MODULE_NAME]?.tableSnapshot;
            if (snap) return normalizeSnapshot(snap);
        }
        return emptySnapshot();
    }

    function previousUserText(beforeIndex) {
        const chat = getChat();
        for (let i = Number(beforeIndex) - 1; i >= 0; i--) {
            if (chat[i]?.is_user) return String(chat[i].mes || '').trim();
        }
        return '';
    }

    function latestAssistantIndex() {
        const chat = getChat();
        for (let i = chat.length - 1; i >= 0; i--) {
            if (!chat[i]?.is_user && String(chat[i]?.mes || '').trim()) return i;
        }
        return -1;
    }

    function hashText(value) {
        const text = String(value || '');
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function messageFingerprint(index) {
        const message = getMessage(index);
        return hashText(`${previousUserText(index)}
---MA---
${String(message?.mes || '')}`);
    }

    function auditSystemPrompt() {
        return `你是“镜渊”规则校正器。你只审核给定的AI正文是否违反玩家提供的规则，不续写，不润色。

第一行必须且只能是 MA_OK 或 MA_FAIL。
第二行开始给出简短、可执行的理由；通过时理由不超过一句。
不要输出Markdown代码块，不要输出其他标签。
只有存在明确违规时才判定 MA_FAIL；不确定时判定 MA_OK。`;
    }

    function parseAuditResult(raw) {
        const text = String(raw || '').trim().replace(/\r/g, '');
        const lines = text.split('\n');
        const first = String(lines[0] || '').trim().toUpperCase();
        const reason = lines.slice(1).join('\n').trim();
        if (first === 'MA_OK') return { passed: true, reason: reason || '通过' };
        if (first === 'MA_FAIL') return { passed: false, reason: reason || '违反规则' };
        throw new Error('规则校正模型未返回 MA_OK 或 MA_FAIL');
    }

    async function withdrawAssistantMessage(index, reason) {
        const messageIndex = Number(index);
        if (messageIndex !== latestAssistantIndex()) throw new Error('仅能自动撤回最新一条AI消息');
        const message = getMessage(messageIndex);
        if (!message || message.is_user) return false;
        const meta = chatMeta();
        meta.lastAuditFailure = {
            at: new Date().toISOString(),
            reason: String(reason || '规则校正未通过'),
            excerpt: String(message.mes || '').slice(0, 240),
        };
        await persistMetadata();

        const beforeLength = getChat().length;
        let deletedByCommand = false;
        try {
            const slash = await import(/* webpackIgnore: true */ '/scripts/slash-commands.js');
            if (typeof slash.executeSlashCommands === 'function') {
                await slash.executeSlashCommands('/del 1');
                deletedByCommand = getChat().length < beforeLength;
            }
        } catch (error) {
            console.warn('[MirrorAbyss] /del 1 unavailable; using local fallback', error);
        }

        if (!deletedByCommand) {
            getChat().splice(messageIndex, 1);
            messageElement(messageIndex)?.remove();
            await persistChat();
            try {
                const context = ctx();
                await context?.eventSource?.emit?.(context?.event_types?.MESSAGE_DELETED, messageIndex);
            } catch (error) {
                console.warn('[MirrorAbyss] Could not emit MESSAGE_DELETED', error);
            }
        }
        renderAllPanels();
        scheduleLorebookSync('audit withdrawal');
        updateUnifiedStatus();
        toast('warning', `规则校正未通过，已撤回AI消息：${String(reason || '').slice(0, 120)}`);
        return true;
    }

    async function auditMessage(index, { force = false } = {}) {
        const cfg = settings();
        if (!cfg.ruleAuditEnabled) return { passed: true, skipped: true };
        if (!String(cfg.ruleAuditPrompt || '').trim()) throw new Error('已启用规则校正，但审核提示词为空');
        const messageIndex = Number(index);
        const message = getMessage(messageIndex);
        if (!message || message.is_user || !String(message.mes || '').trim()) return { passed: true, skipped: true };
        const data = ensureMessageData(message);
        const fingerprint = messageFingerprint(messageIndex);
        if (!force && data.auditFingerprint === fingerprint && data.auditStatus === 'passed') return { passed: true, cached: true };

        data.auditStatus = 'processing';
        data.auditError = null;
        renderMessagePanel(messageIndex);
        updateUnifiedStatus();
        try {
            const raw = await generateTask('audit', {
                systemPrompt: auditSystemPrompt(),
                prompt: `【玩家审核规则】
${cfg.ruleAuditPrompt}

【玩家本轮输入】
${previousUserText(messageIndex) || '（空）'}

【待审核AI正文】
${String(message.mes || '')}`,
            });
            const result = parseAuditResult(raw);
            const current = getMessage(messageIndex);
            if (!current || current.is_user || messageFingerprint(messageIndex) !== fingerprint) return { passed: false, stale: true };
            const currentData = ensureMessageData(current);
            currentData.auditFingerprint = fingerprint;
            currentData.auditResult = result.reason;
            currentData.auditError = result.passed ? null : result.reason;
            currentData.auditStatus = result.passed ? 'passed' : 'failed';
            await persistChat();
            renderMessagePanel(messageIndex);
            updateUnifiedStatus();
            if (!result.passed && cfg.ruleAuditFailAction === 'withdraw') {
                await withdrawAssistantMessage(messageIndex, result.reason);
            }
            return result;
        } catch (error) {
            const current = getMessage(messageIndex);
            if (current && !current.is_user) {
                const currentData = ensureMessageData(current);
                currentData.auditStatus = 'error';
                currentData.auditError = String(error?.message || error);
                await persistChat();
                renderMessagePanel(messageIndex);
            }
            updateUnifiedStatus();
            throw error;
        }
    }

    async function runMessagePipeline(index, { force = false } = {}) {
        const messageIndex = Number(index);
        const message = getMessage(messageIndex);
        if (!message || message.is_user || !String(message.mes || '').trim() || !settings().enabled) return;
        try {
            const audit = await auditMessage(messageIndex, { force });
            if (!audit?.passed) return;
            await processMessage(messageIndex, { force });
        } catch (error) {
            toast('error', `镜渊处理失败：${error?.message || error}`);
        }
    }

    function scheduleMessagePipeline(index, { force = false, delay = 220 } = {}) {
        const messageIndex = Number(index);
        if (!Number.isInteger(messageIndex) || messageIndex < 0) return;
        clearTimeout(pipelineTimers.get(messageIndex));
        pipelineTimers.set(messageIndex, setTimeout(() => {
            pipelineTimers.delete(messageIndex);
            runMessagePipeline(messageIndex, { force });
        }, delay));
    }

    async function persistChat() {
        const context = ctx();
        try {
            if (typeof context?.saveChat === 'function') {
                await context.saveChat();
                return;
            }
            const script = await import(/* webpackIgnore: true */ '/script.js');
            if (typeof script.saveChatConditional === 'function') {
                await script.saveChatConditional();
                return;
            }
            if (typeof script.saveChat === 'function') await script.saveChat();
        } catch (error) {
            console.warn('[MirrorAbyss] Could not persist chat immediately', error);
        }
    }

    function enqueue(label, work) {
        const jobId = makeId('job');
        const job = async () => {
            activeJobs.set(jobId, { label, startedAt: Date.now() });
            updateUnifiedStatus();
            try {
                return await work(jobId);
            } finally {
                activeJobs.delete(jobId);
                updateUnifiedStatus();
            }
        };
        const result = queueTail.then(job, job);
        queueTail = result.catch(() => {});
        return result;
    }

    function extractJson(text) {
        const raw = String(text || '').trim();
        if (!raw || raw === '{}') throw new Error('模型返回为空');
        const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidate = fenced ? fenced[1].trim() : raw;
        try {
            return JSON.parse(candidate);
        } catch (_) {
            const start = candidate.indexOf('{');
            const end = candidate.lastIndexOf('}');
            if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
            throw new Error('无法解析模型返回的 JSON');
        }
    }

    function stateJsonSchema() {
        const rowSchema = {
            type: 'object',
            additionalProperties: false,
            properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                content: { type: 'string' },
                keywords: { type: 'array', items: { type: 'string' } },
                status: { type: 'string' },
            },
            required: ['id', 'title', 'content', 'keywords', 'status'],
        };
        const properties = {};
        for (const key of TABLE_KEYS) properties[key] = { type: 'array', items: rowSchema };
        return {
            name: 'MirrorAbyssStateSnapshot',
            description: '镜渊当前世界状态快照',
            strict: true,
            value: {
                $schema: 'http://json-schema.org/draft-04/schema#',
                type: 'object',
                additionalProperties: false,
                properties,
                required: TABLE_KEYS,
            },
        };
    }

    function stateSystemPrompt() {
        return `你是“镜渊”状态维护器。你只维护当前世界状态快照，不续写故事。\n\n输入包括：上一份状态表、玩家本轮输入、AI本轮正文。三者都是混合运算变量。玩家输入中的动作和对白可作为已声明行为，但输入中预设的外部结果不能单独当成已确认结果；外部结果以AI正文和已有状态的可观察事实为依据。\n\n输出必须是完整JSON快照，包含八个数组：focus、spacetime、characters、relationships、items、events、regions、foundations。每行包含 id、title、content、keywords、status。\n\n规则：\n1. 保留未受本轮影响的有效状态。\n2. 本轮明确改变的状态才更新。\n3. 过程压缩为当前结果，不写流水账。\n4. 未确认、冲突和进行中事项不得强行闭合。\n5. 尽量保留上一份快照的稳定id；新增对象才创建新id。\n6. 玩家手工加入的表格内容与其他状态同等参与运算，不特殊标注，也不默认锁定。\n7. 不输出解释、Markdown或JSON以外文字。`;
    }

    async function generateStateSnapshot(index) {
        const message = getMessage(index);
        const oldSnapshot = previousSnapshot(index);
        const playerText = previousUserText(index);
        const assistantText = String(message?.mes || '').trim();
        const prompt = `【上一份状态表】\n${JSON.stringify(oldSnapshot, null, 2)}\n\n【玩家本轮输入】\n${playerText || '（空）'}\n\n【AI本轮正文】\n${assistantText}\n\n输出更新后的完整状态快照。`;

        let raw = await generateTask('state', {
            systemPrompt: stateSystemPrompt(),
            prompt,
            jsonSchema: stateJsonSchema(),
        });
        try {
            return normalizeSnapshot(extractJson(raw));
        } catch (firstError) {
            raw = await generateTask('state', {
                systemPrompt: stateSystemPrompt(),
                prompt: `${prompt}\n\n上一次结构化输出失败。请只输出一个可被JSON.parse解析的JSON对象。`,
            });
            return normalizeSnapshot(extractJson(raw));
        }
    }

    async function processMessage(index, { force = false } = {}) {
        const messageIndex = Number(index);
        const message = getMessage(messageIndex);
        if (!message || message.is_user || !String(message.mes || '').trim()) return;
        const cfg = settings();
        if (!cfg.enabled || (!cfg.autoState && !force)) return;
        if (messageProcessPromises.has(messageIndex)) return await messageProcessPromises.get(messageIndex);

        const task = (async () => {
            const currentMessage = getMessage(messageIndex);
            if (!currentMessage || currentMessage.is_user) return;
            const data = ensureMessageData(currentMessage);
            const fingerprint = messageFingerprint(messageIndex);
            if (!force && data.status === 'synced' && data.tableSnapshot && data.sourceFingerprint === fingerprint) {
                renderMessagePanel(messageIndex);
                return;
            }

            const revision = Number(data.revision || 0) + 1;
            data.revision = revision;
            data.status = 'processing';
            data.error = null;
            renderMessagePanel(messageIndex);
            updateUnifiedStatus();

            return await enqueue(`更新第 ${messageIndex + 1} 条状态`, async () => {
                try {
                    const snapshot = await generateStateSnapshot(messageIndex);
                    const latestMessage = getMessage(messageIndex);
                    const latestData = latestMessage?.extra?.[MODULE_NAME];
                    if (!latestMessage || latestMessage.is_user || latestData?.revision !== revision) return;
                    if (messageFingerprint(messageIndex) !== fingerprint) return;
                    latestData.tableSnapshot = snapshot;
                    latestData.status = 'synced';
                    latestData.sourceFingerprint = fingerprint;
                    latestData.error = null;
                    latestData.updatedAt = new Date().toISOString();
                    if (!TABLE_KEYS.includes(latestData.activeTableKey)) latestData.activeTableKey = 'focus';
                    await persistChat();
                    renderMessagePanel(messageIndex);
                    await maybeAutoSummaries(messageIndex);
                    scheduleLorebookSync('state updated');
                    refreshWorkspaceIfOpen();
                    updateUnifiedStatus();
                } catch (error) {
                    const latestMessage = getMessage(messageIndex);
                    const latestData = latestMessage?.extra?.[MODULE_NAME];
                    if (latestData?.revision === revision) {
                        latestData.status = 'error';
                        latestData.error = String(error?.message || error);
                        await persistChat();
                        renderMessagePanel(messageIndex);
                    }
                    updateUnifiedStatus();
                    toast('error', `状态更新失败：${error?.message || error}`);
                }
            });
        })();

        messageProcessPromises.set(messageIndex, task);
        try {
            return await task;
        } finally {
            if (messageProcessPromises.get(messageIndex) === task) messageProcessPromises.delete(messageIndex);
        }
    }

    function validSyncedAssistantIndices() {
        const out = [];
        getChat().forEach((message, index) => {
            if (!message?.is_user && String(message?.mes || '').trim() && message?.extra?.[MODULE_NAME]?.tableSnapshot) out.push(index);
        });
        return out;
    }

    function lastArtifactIndex(field) {
        const chat = getChat();
        for (let i = chat.length - 1; i >= 0; i--) {
            if (chat[i]?.extra?.[MODULE_NAME]?.[field]) return i;
        }
        return -1;
    }

    function pendingSmallTurnIndices() {
        const after = lastArtifactIndex('smallSummary');
        return validSyncedAssistantIndices().filter(index => index > after);
    }

    function pendingSmallSummaryIndicesForLarge() {
        const after = lastArtifactIndex('largeSummary');
        const out = [];
        getChat().forEach((message, index) => {
            if (index > after && message?.extra?.[MODULE_NAME]?.smallSummary) out.push(index);
        });
        return out;
    }

    function summaryJsonSchema(name) {
        return {
            name,
            description: '镜渊快照式总结',
            strict: true,
            value: {
                $schema: 'http://json-schema.org/draft-04/schema#',
                type: 'object',
                additionalProperties: false,
                properties: {
                    title: { type: 'string' },
                    summary: { type: 'string' },
                    keywords: { type: 'array', items: { type: 'string' } },
                },
                required: ['title', 'summary', 'keywords'],
            },
        };
    }

    async function generateSmallSummary(anchorIndex, { force = false } = {}) {
        const indices = pendingSmallTurnIndices();
        if (!indices.length) throw new Error('没有可结算的有效回合');
        const context = ctx();
        const anchor = getMessage(anchorIndex);
        if (!anchor || anchor.is_user) throw new Error('未找到总结锚点正文');
        const data = ensureMessageData(anchor);
        if (data.smallSummary && !force) return;

        const transcript = indices.map(index => {
            const assistant = getMessage(index);
            return `【回合 ${index + 1}】\n玩家：${previousUserText(index)}\n正文：${assistant?.mes || ''}`;
        }).join('\n\n');
        const snapshot = getMessage(indices.at(-1))?.extra?.[MODULE_NAME]?.tableSnapshot || emptySnapshot();
        const prompt = `将以下回合压缩成“当前世界快照式小总结”。不是流水账。重点保留：确定结果、不可逆变化、当前人物/关系/物品/区域状态、仍在进行的流程、未决与冲突。已经被最终结果替代的中间动作不展开。\n\n${transcript}\n\n【当前状态表】\n${JSON.stringify(snapshot, null, 2)}`;
        const raw = await generateTask('small', {
            systemPrompt: '你是镜渊快照结算器。只输出结构化结果，不续写故事，不把未确认事项写成事实。',
            prompt,
            jsonSchema: summaryJsonSchema('MirrorAbyssSmallSummary'),
        });
        const parsed = extractJson(raw);
        data.smallSummary = {
            id: makeId('small'),
            title: String(parsed.title || '阶段快照'),
            summary: String(parsed.summary || ''),
            keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [],
            turnCount: indices.length,
            sourceArtifactIds: indices.map(index => getMessage(index)?.extra?.[MODULE_NAME]?.artifactId).filter(Boolean),
            createdAt: new Date().toISOString(),
        };
        await persistChat();
        renderMessagePanel(anchorIndex);
        scheduleLorebookSync('small summary updated');
        refreshWorkspaceIfOpen();
    }

    async function generateLargeSummary(anchorIndex, { force = false } = {}) {
        const indices = pendingSmallSummaryIndicesForLarge();
        if (!indices.length) throw new Error('没有可结算的小总结');
        const context = ctx();
        const anchor = getMessage(anchorIndex);
        if (!anchor || anchor.is_user) throw new Error('未找到总结锚点正文');
        const data = ensureMessageData(anchor);
        if (data.largeSummary && !force) return;
        const source = indices.map(index => {
            const item = getMessage(index)?.extra?.[MODULE_NAME]?.smallSummary;
            return `【${item?.title || `小总结 ${index + 1}`}】\n${item?.summary || ''}`;
        }).join('\n\n');
        const latestSnapshot = getMessage(latestAssistantIndex())?.extra?.[MODULE_NAME]?.tableSnapshot || emptySnapshot();
        const prompt = `将下列小总结再次压缩成长期快照。保留长期仍成立的人物、关系、区域、物品、事件结果和未决事项；不要复述阶段流水账，不要强行闭合开放事件。\n\n${source}\n\n【当前状态表】\n${JSON.stringify(latestSnapshot, null, 2)}`;
        const raw = await generateTask('large', {
            systemPrompt: '你是镜渊长期快照结算器。只输出结构化结果。',
            prompt,
            jsonSchema: summaryJsonSchema('MirrorAbyssLargeSummary'),
        });
        const parsed = extractJson(raw);
        data.largeSummary = {
            id: makeId('large'),
            title: String(parsed.title || '长期快照'),
            summary: String(parsed.summary || ''),
            keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [],
            sourceCount: indices.length,
            sourceSummaryIds: indices.map(index => getMessage(index)?.extra?.[MODULE_NAME]?.smallSummary?.id).filter(Boolean),
            createdAt: new Date().toISOString(),
        };
        await persistChat();
        renderMessagePanel(anchorIndex);
        scheduleLorebookSync('large summary updated');
        refreshWorkspaceIfOpen();
    }

    async function maybeAutoSummaries(anchorIndex) {
        const cfg = settings();
        if (cfg.autoSmallSummary && pendingSmallTurnIndices().length >= Math.max(1, Number(cfg.smallSummaryTurns) || 15)) {
            await generateSmallSummary(anchorIndex).catch(error => toast('error', `小总结失败：${error.message}`));
        }
        if (cfg.autoLargeSummary && pendingSmallSummaryIndicesForLarge().length >= Math.max(1, Number(cfg.largeSummaryCount) || 6)) {
            await generateLargeSummary(anchorIndex).catch(error => toast('error', `大总结失败：${error.message}`));
        }
        updateUnifiedStatus();
    }


    async function worldInfoApi() {
        if (!worldInfoModulePromise) {
            worldInfoModulePromise = import(/* webpackIgnore: true */ '/scripts/world-info.js');
        }
        return await worldInfoModulePromise;
    }

    function sanitizedBookName(value) {
        return String(value || '').replace(/[\\/:*?\"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);
    }

    function generatedLorebookName() {
        const context = ctx();
        const seed = context?.name2 || context?.characterId || context?.chatId || context?.getCurrentChatId?.() || 'Chat';
        return sanitizedBookName(`MA_${seed}`) || 'MA_Chat';
    }

    async function resolveLorebookName({ create = false } = {}) {
        const cfg = settings();
        const meta = chatMeta();
        const context = ctx();
        let name = sanitizedBookName(meta.lorebookName || cfg.lorebookName || context?.chatMetadata?.world_info || '');
        if (!name && create && cfg.autoCreateChatLorebook) name = generatedLorebookName();
        if (!name) return '';
        if (create) {
            const wi = await worldInfoApi();
            let data = await wi.loadWorldInfo(name);
            if (!data) {
                if (typeof wi.createNewWorldInfo === 'function') await wi.createNewWorldInfo(name, { interactive: false });
                data = await wi.loadWorldInfo(name);
                if (!data) {
                    data = { entries: {} };
                    await wi.saveWorldInfo(name, data, true);
                }
            }
            context.chatMetadata ||= {};
            context.chatMetadata[wi.METADATA_KEY || 'world_info'] = name;
            meta.lorebookName = name;
            await persistMetadata();
        }
        return name;
    }

    function rowKeywords(row) {
        return [...new Set([row.title, ...(row.keywords || [])]
            .map(x => String(x || '').trim())
            .filter(x => x.length >= 2 && !/^(他|她|它|我|你|他们|她们)$/.test(x)))]
            .slice(0, 16);
    }

    function rowLoreContent(tableKey, row) {
        return `[${TABLE_LABELS[tableKey]}：${row.title}]\n${row.content || ''}${row.status ? `\n状态：${row.status}` : ''}`.trim();
    }

    function pruneInvalidSummaries() {
        const artifactIds = new Set();
        const smallIds = new Set();
        for (const message of getChat()) {
            const data = message?.extra?.[MODULE_NAME];
            if (!data || message.is_user) continue;
            artifactIds.add(data.artifactId);
            if (data.smallSummary?.id) smallIds.add(data.smallSummary.id);
        }
        let changed = false;
        for (const message of getChat()) {
            const data = message?.extra?.[MODULE_NAME];
            if (!data || message.is_user) continue;
            const smallSources = data.smallSummary?.sourceArtifactIds;
            if (Array.isArray(smallSources) && smallSources.some(id => !artifactIds.has(id))) {
                data.smallSummary = null;
                changed = true;
            }
        }
        const remainingSmallIds = new Set();
        for (const message of getChat()) {
            const id = message?.extra?.[MODULE_NAME]?.smallSummary?.id;
            if (id) remainingSmallIds.add(id);
        }
        for (const message of getChat()) {
            const data = message?.extra?.[MODULE_NAME];
            if (!data || message.is_user) continue;
            const largeSources = data.largeSummary?.sourceSummaryIds;
            if (Array.isArray(largeSources) && largeSources.some(id => !remainingSmallIds.has(id))) {
                data.largeSummary = null;
                changed = true;
            }
        }
        return changed;
    }

    function collectArtifactSummaries() {
        const out = [];
        getChat().forEach((message, index) => {
            const data = message?.extra?.[MODULE_NAME];
            if (!data || message.is_user) return;
            if (data.smallSummary) out.push({ kind: 'small', index, artifactId: data.artifactId, value: data.smallSummary });
            if (data.largeSummary) out.push({ kind: 'large', index, artifactId: data.artifactId, value: data.largeSummary });
        });
        return out;
    }

    function desiredLorebookSpecs() {
        pruneInvalidSummaries();
        const desired = new Map();
        const latestIndex = latestAssistantIndex();
        const latestData = getMessage(latestIndex)?.extra?.[MODULE_NAME];
        const snapshot = latestData?.tableSnapshot;
        if (snapshot) {
            for (const tableKey of TABLE_KEYS) {
                for (const row of snapshot[tableKey] || []) {
                    const constant = ['focus', 'spacetime', 'foundations'].includes(tableKey);
                    desired.set(`state:${tableKey}:${row.id}`, {
                        title: row.title,
                        comment: `[MA][${TABLE_LABELS[tableKey]}] ${row.title}`,
                        content: rowLoreContent(tableKey, row),
                        keywords: rowKeywords(row),
                        constant,
                        vectorized: !constant && Boolean(settings().vectorizeStateRows),
                        sourceArtifactId: latestData.artifactId,
                        kind: `state:${tableKey}`,
                    });
                }
            }
        }
        const summaries = collectArtifactSummaries();
        for (const item of summaries) {
            const value = item.value;
            desired.set(`${item.kind}:${value.id}`, {
                title: value.title,
                comment: `[MA][${item.kind === 'small' ? '小总结' : '大总结'}] ${value.title}`,
                content: value.summary,
                keywords: [...new Set([value.title, ...(value.keywords || [])])].filter(Boolean).slice(0, 16),
                constant: false,
                vectorized: true,
                sourceArtifactId: item.artifactId,
                kind: item.kind,
            });
        }
        if (settings().latestContinuityConstant && summaries.length) {
            const latest = summaries.at(-1);
            desired.set('core:latest', {
                title: '当前连续性核心',
                comment: '[MA][当前连续性核心]',
                content: latest.value.summary,
                keywords: ['当前连续性', '当前状态'],
                constant: true,
                vectorized: false,
                sourceArtifactId: latest.artifactId,
                kind: 'core',
            });
        }
        return desired;
    }

    function managedEntryInfo(entry) {
        return entry?.extensions?.mirrorAbyss || null;
    }

    function applyLoreSpec(entry, key, spec, wi) {
        entry.comment = spec.comment;
        entry.content = spec.content;
        entry.key = spec.keywords;
        entry.constant = Boolean(spec.constant);
        entry.vectorized = Boolean(spec.vectorized);
        entry.selective = !entry.constant;
        entry.disable = false;
        entry.addMemo = true;
        entry.position = wi.world_info_position?.after ?? 1;
        entry.order = spec.constant ? 140 : spec.kind === 'large' ? 115 : spec.kind === 'small' ? 110 : 100;
        entry.preventRecursion = false;
        entry.excludeRecursion = false;
        entry.delayUntilRecursion = 0;
        entry.extensions ||= {};
        entry.extensions.mirrorAbyss = {
            managed: true,
            key,
            sourceArtifactId: spec.sourceArtifactId,
            kind: spec.kind,
            version: VERSION,
        };
    }

    async function reconcileLorebook({ silent = true } = {}) {
        if (!settings().lorebookSync) return { skipped: true };
        const meta = chatMeta();
        meta.lastSyncState = 'processing';
        meta.lastSyncError = null;
        updateUnifiedStatus();
        await persistMetadata();
        try {
            const wi = await worldInfoApi();
            const name = await resolveLorebookName({ create: true });
            if (!name) throw new Error('没有可用的聊天世界书');
            const data = await wi.loadWorldInfo(name) || { entries: {} };
            data.entries ||= {};
            const desired = desiredLorebookSpecs();
            const existing = new Map();
            for (const [uid, entry] of Object.entries(data.entries)) {
                const info = managedEntryInfo(entry);
                if (info?.managed && info.key) existing.set(info.key, { uid, entry });
            }
            const sourceUidMap = new Map();
            let changed = false;
            for (const [key, spec] of desired) {
                let pair = existing.get(key);
                let entry = pair?.entry;
                if (!entry) {
                    entry = wi.createWorldInfoEntry(name, data);
                    if (!entry) continue;
                    pair = { uid: String(entry.uid), entry };
                    changed = true;
                }
                const before = JSON.stringify(entry);
                applyLoreSpec(entry, key, spec, wi);
                if (before !== JSON.stringify(entry)) changed = true;
                existing.delete(key);
                if (!sourceUidMap.has(spec.sourceArtifactId)) sourceUidMap.set(spec.sourceArtifactId, []);
                sourceUidMap.get(spec.sourceArtifactId).push(Number(entry.uid));
            }
            for (const { uid } of existing.values()) {
                delete data.entries[uid];
                changed = true;
            }
            if (changed) {
                await wi.saveWorldInfo(name, data, true);
                if (typeof wi.reloadEditor === 'function') wi.reloadEditor(name);
            }
            for (const message of getChat()) {
                const artifact = message?.extra?.[MODULE_NAME];
                if (artifact) artifact.lorebookEntryIds = sourceUidMap.get(artifact.artifactId) || [];
            }
            meta.lorebookName = name;
            meta.lastSyncAt = new Date().toISOString();
            meta.lastSyncError = null;
            meta.lastSyncState = 'success';
            await persistChat();
            await persistMetadata();
            updateUnifiedStatus();
            if (!silent) toast('success', `记忆已同步到世界书：${name}`);
            return { name, changed, desired: desired.size };
        } catch (error) {
            meta.lastSyncState = 'error';
            meta.lastSyncError = String(error?.message || error);
            await persistMetadata();
            updateUnifiedStatus();
            if (!silent) toast('error', `世界书同步失败：${meta.lastSyncError}`);
            console.error('[MirrorAbyss] lorebook sync failed', error);
            return { error };
        }
    }

    function scheduleLorebookSync(reason = '') {
        if (!settings().lorebookSync) return;
        clearTimeout(lorebookSyncTimer);
        lorebookSyncTimer = setTimeout(() => enqueue(`同步世界书 ${reason}`, () => reconcileLorebook({ silent: true })), 350);
    }

    async function readLorebookEntries({ externalOnly = false } = {}) {
        try {
            const wi = await worldInfoApi();
            const name = await resolveLorebookName({ create: false });
            if (!name) return [];
            const data = await wi.loadWorldInfo(name);
            return Object.values(data?.entries || {}).filter(entry => !externalOnly || !managedEntryInfo(entry)).map(entry => ({ ...entry, world: name }));
        } catch (error) {
            console.warn('[MirrorAbyss] Unable to read lorebook', error);
            return [];
        }
    }

    async function editExternalLorebookEntry(node, text) {
        const parsed = JSON.parse(text);
        const wi = await worldInfoApi();
        const name = node.world || await resolveLorebookName({ create: false });
        const data = await wi.loadWorldInfo(name);
        const entry = data?.entries?.[node.uid];
        if (!entry) throw new Error('世界书条目已不存在');
        for (const field of ['comment', 'content', 'key', 'constant', 'vectorized', 'disable', 'order', 'position']) {
            if (hasOwn(parsed, field)) entry[field] = parsed[field];
        }
        await wi.saveWorldInfo(name, data, true);
        refreshWorkspaceIfOpen();
    }

    async function deleteExternalLorebookEntry(node) {
        const wi = await worldInfoApi();
        const name = node.world || await resolveLorebookName({ create: false });
        const data = await wi.loadWorldInfo(name);
        if (!data?.entries?.[node.uid]) return;
        delete data.entries[node.uid];
        await wi.saveWorldInfo(name, data, true);
        refreshWorkspaceIfOpen();
    }

    function statusLabel(value) {
        const map = {
            idle: '待处理', processing: '处理中', synced: '已完成', error: '失败',
            passed: '校正通过', failed: '校正未通过', success: '同步成功',
        };
        return map[value] || String(value || '待处理');
    }

    function statusTone(value) {
        if (['error', 'failed'].includes(value)) return 'danger';
        if (['processing'].includes(value)) return 'working';
        if (['synced', 'passed', 'success'].includes(value)) return 'success';
        return 'neutral';
    }

    function renderRows(snapshot, tableKey, messageIndex) {
        const rows = snapshot?.[tableKey] || [];
        const bodyRows = rows.map((row, rowIndex) => `
            <tr class="ma-row" data-row-id="${escapeHtml(row.id)}" data-table-key="${tableKey}">
                <td class="ma-row-index">${rowIndex + 1}</td>
                <td class="ma-row-title">${escapeHtml(row.title)}</td>
                <td class="ma-row-content">${escapeHtml(row.content)}</td>
                <td class="ma-row-meta"><span class="ma-state-pill">${escapeHtml(row.status)}</span>${row.keywords?.length ? `<div class="ma-row-keywords">${row.keywords.map(k => `<span>${escapeHtml(k)}</span>`).join('')}</div>` : ''}</td>
                <td class="ma-row-actions">
                    <button type="button" data-ma-action="row-edit" data-index="${messageIndex}" data-table-key="${tableKey}" data-row-id="${escapeHtml(row.id)}" title="修改"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" data-ma-action="row-delete" data-index="${messageIndex}" data-table-key="${tableKey}" data-row-id="${escapeHtml(row.id)}" title="删除"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`).join('');
        const table = rows.length ? `
            <div class="ma-table-scroll">
                <table class="ma-data-table">
                    <thead>
                        <tr><th>#</th><th>对象</th><th>当前记录</th><th>状态与关键词</th><th>操作</th></tr>
                    </thead>
                    <tbody>${bodyRows}</tbody>
                </table>
            </div>` : '<div class="ma-empty ma-table-empty">本分类暂无记录</div>';
        return `${table}<button type="button" class="ma-add-row" data-ma-action="row-add" data-index="${messageIndex}" data-table-key="${tableKey}"><i class="fa-solid fa-plus"></i> 添加${TABLE_LABELS[tableKey]}</button>`;
    }

    function panelHtml(index, data) {
        const snapshot = data?.tableSnapshot;
        const meta = chatMeta();
        const activeKey = TABLE_KEYS.includes(data?.activeTableKey) ? data.activeTableKey : (TABLE_KEYS.find(key => snapshot?.[key]?.length) || 'focus');
        const stateStatus = data?.status || 'idle';
        const auditStatus = settings().ruleAuditEnabled ? (data?.auditStatus || 'idle') : 'disabled';
        const loreStatus = settings().lorebookSync ? (meta.lastSyncState || 'idle') : 'disabled';
        const tabs = snapshot ? TABLE_KEYS.map(key => `
            <button type="button" class="ma-table-tab ${key === activeKey ? 'active' : ''}" data-ma-action="table-tab" data-index="${index}" data-table-key="${key}" aria-selected="${key === activeKey}">
                <span>${TABLE_LABELS[key]}</span><b>${snapshot[key]?.length || 0}</b>
            </button>`).join('') : '';
        const workbook = snapshot ? `
            <div class="ma-workbook">
                <div class="ma-table-tabs" role="tablist">${tabs}</div>
                <div class="ma-workbook-head"><b>${TABLE_LABELS[activeKey]}</b><span>当前快照 · 可直接编辑</span></div>
                <div class="ma-workbook-body">${renderRows(snapshot, activeKey, index)}</div>
            </div>` : '<div class="ma-empty ma-empty-state">本条正文尚未生成状态表。点击“重新整理”开始。</div>';
        const syncError = meta.lastSyncError ? `<div class="ma-error"><b>世界书同步失败</b><div>${escapeHtml(meta.lastSyncError)}</div><button type="button" data-ma-action="sync-now">重新同步</button></div>` : '';
        return `
            <div class="ma-panel-head">
                <button type="button" class="ma-panel-toggle" aria-expanded="false">
                    <span class="ma-panel-title">镜渊状态</span>
                    <span class="ma-chip ${statusTone(stateStatus)}">${statusLabel(stateStatus)}</span>
                </button>
                <div class="ma-panel-actions">
                    <button type="button" data-ma-action="retry" data-index="${index}" title="重新整理"><i class="fa-solid fa-rotate"></i></button>
                    <button type="button" data-ma-action="edit" data-index="${index}" title="高级编辑"><i class="fa-solid fa-code"></i></button>
                    <button type="button" data-ma-action="graph" data-index="${index}" title="打开图谱"><i class="fa-solid fa-diagram-project"></i></button>
                </div>
            </div>
            <div class="ma-panel-body" hidden>
                <div class="ma-status-strip">
                    <span>规则校正 <b class="ma-chip ${statusTone(auditStatus)}">${auditStatus === 'disabled' ? '未启用' : statusLabel(auditStatus)}</b></span>
                    <span>表格整理 <b class="ma-chip ${statusTone(stateStatus)}">${statusLabel(stateStatus)}</b></span>
                    <span>世界书 <b class="ma-chip ${statusTone(loreStatus)}">${loreStatus === 'disabled' ? '未启用' : statusLabel(loreStatus)}</b></span>
                </div>
                ${data?.auditError ? `<div class="ma-error"><b>规则校正异常</b><div>${escapeHtml(data.auditError)}</div></div>` : ''}
                ${data?.error ? `<div class="ma-error"><b>表格整理失败</b><div>${escapeHtml(data.error)}</div></div>` : ''}
                ${syncError}
                <div class="ma-progress-line">小总结 ${pendingSmallTurnIndices().length}/${settings().smallSummaryTurns} · 大总结 ${pendingSmallSummaryIndicesForLarge().length}/${settings().largeSummaryCount}</div>
                ${workbook}
                ${data?.smallSummary ? `<details class="ma-summary"><summary>小总结：${escapeHtml(data.smallSummary.title)}</summary><pre>${escapeHtml(data.smallSummary.summary)}</pre><div><button data-ma-action="summary-edit" data-kind="small" data-index="${index}">编辑</button><button data-ma-action="summary-delete" data-kind="small" data-index="${index}">删除</button></div></details>` : ''}
                ${data?.largeSummary ? `<details class="ma-summary"><summary>大总结：${escapeHtml(data.largeSummary.title)}</summary><pre>${escapeHtml(data.largeSummary.summary)}</pre><div><button data-ma-action="summary-edit" data-kind="large" data-index="${index}">编辑</button><button data-ma-action="summary-delete" data-kind="large" data-index="${index}">删除</button></div></details>` : ''}
                <div class="ma-inline-buttons">
                    <button type="button" data-ma-action="small" data-index="${index}">生成小总结</button>
                    <button type="button" data-ma-action="large" data-index="${index}">生成大总结</button>
                    <button type="button" data-ma-action="sync-now">同步世界书</button>
                </div>
            </div>`;
    }

    function messageElement(index) {
        return document.querySelector(`.mes[mesid="${index}"]`) || document.querySelector(`.mes[data-message-id="${index}"]`);
    }

    function renderMessagePanel(index) {
        if (!settings().showMessagePanels) return;
        const message = getMessage(index);
        if (!message || message.is_user) return;
        const root = messageElement(index);
        if (!root) return;
        const host = root.querySelector('.mes_text') || root.querySelector('.mes_block') || root;
        let panel = root.querySelector(':scope .ma-message-panel');
        if (!panel) {
            panel = document.createElement('section');
            panel.className = 'ma-message-panel';
            host.insertAdjacentElement('afterend', panel);
        }
        panel.innerHTML = panelHtml(index, message.extra?.[MODULE_NAME]);
    }

    function renderAllPanels() {
        document.querySelectorAll('.ma-message-panel').forEach(el => el.remove());
        getChat().forEach((message, index) => {
            if (!message?.is_user) renderMessagePanel(index);
        });
        updateUnifiedStatus();
    }

    function installDelegatedHandlers() {
        document.addEventListener('click', async event => {
            const toggle = event.target.closest('.ma-panel-toggle');
            if (toggle) {
                const body = toggle.closest('.ma-message-panel')?.querySelector('.ma-panel-body');
                if (body) {
                    body.hidden = !body.hidden;
                    toggle.setAttribute('aria-expanded', String(!body.hidden));
                }
                return;
            }
            const button = event.target.closest('[data-ma-action]');
            if (!button) return;
            const action = button.dataset.maAction;
            const index = Number(button.dataset.index ?? latestAssistantIndex());
            if (action === 'retry') runMessagePipeline(index, { force: true });
            if (action === 'edit') openSnapshotEditor(index);
            if (action === 'graph') openWorkspace(index);
            if (action === 'small') enqueue('生成小总结', () => generateSmallSummary(index, { force: true })).catch(error => toast('error', error.message));
            if (action === 'large') enqueue('生成大总结', () => generateLargeSummary(index, { force: true })).catch(error => toast('error', error.message));
            if (action === 'row-add') addRow(index, button.dataset.tableKey);
            if (action === 'row-edit') editRow(index, button.dataset.tableKey, button.dataset.rowId);
            if (action === 'row-delete') deleteRow(index, button.dataset.tableKey, button.dataset.rowId);
            if (action === 'table-tab') {
                const message = getMessage(index);
                const data = ensureMessageData(message);
                if (data && TABLE_KEYS.includes(button.dataset.tableKey)) {
                    data.activeTableKey = button.dataset.tableKey;
                    renderMessagePanel(index);
                    const body = messageElement(index)?.querySelector('.ma-message-panel .ma-panel-body');
                    const toggle = messageElement(index)?.querySelector('.ma-message-panel .ma-panel-toggle');
                    if (body) body.hidden = false;
                    if (toggle) toggle.setAttribute('aria-expanded', 'true');
                }
            }
            if (action === 'sync-now') enqueue('同步世界书', () => reconcileLorebook({ silent: false }));
            if (action === 'summary-edit') editSummary(index, button.dataset.kind);
            if (action === 'summary-delete') deleteSummary(index, button.dataset.kind);
        });
    }

    function selected(value, current) {
        return value === current ? 'selected' : '';
    }

    function checked(value) {
        return value ? 'checked' : '';
    }

    function latestMirrorData() {
        const index = latestAssistantIndex();
        return index >= 0 ? getMessage(index)?.extra?.[MODULE_NAME] || null : null;
    }

    function connectionStatusText() {
        const cfg = settings();
        if (cfg.generationMode === 'independent') return independentApiConfigured() ? '独立模型已配置' : '独立模型未完成配置';
        if (cfg.generationMode === 'profile') return '使用酒馆连接配置';
        return '跟随当前聊天连接';
    }

    function controlOverviewHtml() {
        const cfg = settings();
        const data = latestMirrorData();
        const meta = chatMeta();
        const lastFailure = meta.lastAuditFailure;
        const cards = [
            ['独立模型', connectionStatusText(), cfg.generationMode === 'independent' && !independentApiConfigured() ? 'danger' : 'success', 'plug'],
            ['规则校正', cfg.ruleAuditEnabled ? statusLabel(data?.auditStatus || 'idle') : '未启用', statusTone(cfg.ruleAuditEnabled ? data?.auditStatus : 'neutral'), 'shield-halved'],
            ['表格状态', statusLabel(data?.status || 'idle'), statusTone(data?.status || 'idle'), 'table-list'],
            ['世界书同步', cfg.lorebookSync ? statusLabel(meta.lastSyncState || 'idle') : '未启用', statusTone(cfg.lorebookSync ? meta.lastSyncState : 'neutral'), 'book'],
        ];
        return `
            <div class="ma-overview-grid">
                ${cards.map(([title, value, tone, icon]) => `<div class="ma-status-card ${tone}"><i class="fa-solid fa-${icon}"></i><div><span>${title}</span><b>${escapeHtml(value)}</b></div></div>`).join('')}
            </div>
            <div class="ma-control-section">
                <div class="ma-section-title"><b>当前进度</b><span>单聊天独立记录</span></div>
                <div class="ma-metric-row">
                    <div><b>${pendingSmallTurnIndices().length}</b><span>/ ${cfg.smallSummaryTurns} 小总结</span></div>
                    <div><b>${pendingSmallSummaryIndicesForLarge().length}</b><span>/ ${cfg.largeSummaryCount} 大总结</span></div>
                    <div><b>${validSyncedAssistantIndices().length}</b><span>已整理正文</span></div>
                </div>
            </div>
            ${meta.lastSyncError ? `<div class="ma-alert danger"><b>世界书同步失败</b><p>${escapeHtml(meta.lastSyncError)}</p></div>` : ''}
            ${data?.error ? `<div class="ma-alert danger"><b>表格整理失败</b><p>${escapeHtml(data.error)}</p></div>` : ''}
            ${data?.auditError ? `<div class="ma-alert danger"><b>规则校正异常</b><p>${escapeHtml(data.auditError)}</p></div>` : ''}
            ${lastFailure ? `<div class="ma-alert warning"><b>最近一次自动撤回</b><p>${escapeHtml(lastFailure.reason || '')}</p><small>${escapeHtml(lastFailure.at || '')}</small></div>` : ''}
            <div class="ma-quick-actions">
                <button type="button" data-ma-control-action="process-latest"><i class="fa-solid fa-rotate"></i> 整理最新正文</button>
                <button type="button" data-ma-control-action="audit-latest"><i class="fa-solid fa-shield"></i> 校正最新正文</button>
                <button type="button" data-ma-control-action="sync"><i class="fa-solid fa-arrows-rotate"></i> 同步世界书</button>
                <button type="button" data-ma-control-action="graph"><i class="fa-solid fa-diagram-project"></i> 世界图谱</button>
            </div>`;
    }

    function controlConnectionHtml() {
        const cfg = settings();
        return `
            <div class="ma-control-section">
                <div class="ma-section-title"><b>模型调用方式</b><span>正文模型与镜渊模型相互独立</span></div>
                <div class="ma-segmented">
                    <label><input type="radio" name="ma-generation-mode" data-ma-setting="generationMode" value="independent" ${cfg.generationMode === 'independent' ? 'checked' : ''}><span>独立 API</span></label>
                    <label><input type="radio" name="ma-generation-mode" data-ma-setting="generationMode" value="profile" ${cfg.generationMode === 'profile' ? 'checked' : ''}><span>连接配置</span></label>
                    <label><input type="radio" name="ma-generation-mode" data-ma-setting="generationMode" value="current" ${cfg.generationMode === 'current' ? 'checked' : ''}><span>当前连接</span></label>
                </div>
            </div>
            <div class="ma-control-section ${cfg.generationMode === 'independent' ? '' : 'ma-muted-section'}">
                <div class="ma-section-title"><b>独立 API</b><span>密钥保存在本机酒馆扩展设置中</span></div>
                <div class="ma-form-grid">
                    <label><span>接口类型</span><select data-ma-setting="apiProvider">
                        <option value="openai-compatible" ${selected('openai-compatible', cfg.apiProvider)}>OpenAI 兼容</option>
                        <option value="gemini" ${selected('gemini', cfg.apiProvider)}>Google Gemini</option>
                        <option value="anthropic" ${selected('anthropic', cfg.apiProvider)}>Anthropic</option>
                    </select></label>
                    <label><span>模型</span><div class="ma-input-button"><input type="text" list="ma-model-list" data-ma-setting="apiModel" value="${escapeHtml(cfg.apiModel)}" placeholder="例如 gpt-4.1-mini"><button type="button" data-ma-control-action="models" title="读取模型列表"><i class="fa-solid fa-list"></i></button></div><datalist id="ma-model-list"></datalist></label>
                </div>
                <label><span>API 地址</span><input type="url" data-ma-setting="apiBaseUrl" value="${escapeHtml(cfg.apiBaseUrl)}" placeholder="OpenAI兼容示例：https://api.example.com/v1"></label>
                <label><span>API 密钥</span><div class="ma-input-button"><input type="password" id="ma-api-key" autocomplete="new-password" data-ma-setting="apiKey" value="${escapeHtml(cfg.apiKey)}" placeholder="sk-..."><button type="button" data-ma-control-action="toggle-key" title="显示或隐藏密钥"><i class="fa-solid fa-eye"></i></button></div></label>
                <div class="ma-form-grid">
                    <label><span>温度</span><input type="number" min="0" max="2" step="0.05" data-ma-setting="apiTemperature" value="${Number(cfg.apiTemperature)}"></label>
                    <label><span>最大输出 Token</span><input type="number" min="128" max="65536" step="128" data-ma-setting="apiMaxTokens" value="${Number(cfg.apiMaxTokens)}"></label>
                </div>
                <label class="checkbox_label"><input type="checkbox" data-ma-setting="apiJsonMode" ${checked(cfg.apiJsonMode)}>OpenAI兼容接口支持 JSON Object 模式</label>
                <div class="ma-quick-actions"><button type="button" data-ma-control-action="test-api"><i class="fa-solid fa-vial"></i> 测试独立模型</button></div>
                <p class="ma-help">部分官方接口禁止浏览器跨域请求。出现 CORS 错误时，可使用允许跨域的反向代理，或切换到“连接配置”。</p>
            </div>
            <div class="ma-control-section">
                <div class="ma-section-title"><b>酒馆连接配置回退</b><span>仅在“连接配置”模式下生效</span></div>
                <div class="ma-form-grid">
                    <label><span>表格整理</span><input type="text" data-ma-setting="stateProfile" value="${escapeHtml(cfg.stateProfile)}" placeholder="Connection Profile 名称"></label>
                    <label><span>规则校正</span><input type="text" data-ma-setting="auditProfile" value="${escapeHtml(cfg.auditProfile)}"></label>
                    <label><span>小总结</span><input type="text" data-ma-setting="smallSummaryProfile" value="${escapeHtml(cfg.smallSummaryProfile)}"></label>
                    <label><span>大总结</span><input type="text" data-ma-setting="largeSummaryProfile" value="${escapeHtml(cfg.largeSummaryProfile)}"></label>
                </div>
            </div>`;
    }

    function controlStateHtml() {
        const cfg = settings();
        return `
            <div class="ma-control-section">
                <div class="ma-section-title"><b>状态表</b><span>每条 AI 正文对应一份可编辑快照</span></div>
                <label class="checkbox_label"><input type="checkbox" data-ma-setting="autoState" ${checked(cfg.autoState)}>每轮自动整理表格</label>
                <label class="checkbox_label"><input type="checkbox" data-ma-setting="showMessagePanels" ${checked(cfg.showMessagePanels)}>在正文下显示表格面板</label>
            </div>
            <div class="ma-control-section">
                <div class="ma-section-title"><b>分层总结</b><span>回合数可自行调整</span></div>
                <div class="ma-form-grid">
                    <label><span>小总结回合数</span><input type="number" min="1" max="100" data-ma-setting="smallSummaryTurns" value="${cfg.smallSummaryTurns}"></label>
                    <label><span>大总结所需小总结数</span><input type="number" min="1" max="30" data-ma-setting="largeSummaryCount" value="${cfg.largeSummaryCount}"></label>
                </div>
                <label class="checkbox_label"><input type="checkbox" data-ma-setting="autoSmallSummary" ${checked(cfg.autoSmallSummary)}>自动生成小总结</label>
                <label class="checkbox_label"><input type="checkbox" data-ma-setting="autoLargeSummary" ${checked(cfg.autoLargeSummary)}>自动生成大总结</label>
                <div class="ma-quick-actions"><button type="button" data-ma-control-action="small">立即生成小总结</button><button type="button" data-ma-control-action="large">立即生成大总结</button></div>
            </div>`;
    }

    function controlAuditHtml() {
        const cfg = settings();
        return `
            <div class="ma-control-section">
                <div class="ma-section-title"><b>规则校正</b><span>在状态整理前执行，避免违规正文进入记忆</span></div>
                <label class="checkbox_label ma-primary-toggle"><input type="checkbox" data-ma-setting="ruleAuditEnabled" ${checked(cfg.ruleAuditEnabled)}>启用规则校正</label>
                <label><span>审核提示词</span><textarea data-ma-setting="ruleAuditPrompt" rows="14" placeholder="粘贴需要审核的硬性规则。模型只判断本轮 AI 正文是否违反这些规则。">${escapeHtml(cfg.ruleAuditPrompt)}</textarea></label>
                <label><span>未通过时</span><select data-ma-setting="ruleAuditFailAction">
                    <option value="withdraw" ${selected('withdraw', cfg.ruleAuditFailAction)}>自动撤回最新 AI 消息</option>
                    <option value="mark" ${selected('mark', cfg.ruleAuditFailAction)}>保留消息并标记失败</option>
                </select></label>
                <div class="ma-alert warning"><b>撤回边界</b><p>插件只自动撤回最新一条 AI 消息。审核接口异常时不会撤回，以免误删正文。</p></div>
                <div class="ma-quick-actions"><button type="button" data-ma-control-action="audit-latest"><i class="fa-solid fa-shield"></i> 校正最新正文</button></div>
            </div>`;
    }

    function controlMemoryHtml() {
        const cfg = settings();
        const meta = chatMeta();
        return `
            <div class="ma-control-section">
                <div class="ma-section-title"><b>世界书同步</b><span class="ma-chip ${statusTone(meta.lastSyncState)}">${statusLabel(meta.lastSyncState)}</span></div>
                <label class="checkbox_label"><input type="checkbox" data-ma-setting="lorebookSync" ${checked(cfg.lorebookSync)}>自动同步聊天世界书</label>
                <label><span>聊天世界书名称</span><input type="text" data-ma-meta="lorebookName" value="${escapeHtml(meta.lorebookName || cfg.lorebookName)}" placeholder="留空自动创建"></label>
                <label class="checkbox_label"><input type="checkbox" data-ma-setting="vectorizeStateRows" ${checked(cfg.vectorizeStateRows)}>活跃状态同时启用向量</label>
                ${meta.lastSyncError ? `<div class="ma-alert danger"><b>同步失败</b><p>${escapeHtml(meta.lastSyncError)}</p></div>` : ''}
                <div class="ma-quick-actions"><button type="button" data-ma-control-action="sync">立即同步</button><button type="button" data-ma-control-action="graph">打开世界图谱</button></div>
            </div>
            <div class="ma-control-section">
                <div class="ma-section-title"><b>图谱显示</b><span>图谱只负责查看，不生成状态</span></div>
                <label class="checkbox_label"><input type="checkbox" data-ma-setting="showExternalLorebookNodes" ${checked(cfg.showExternalLorebookNodes)}>显示非镜渊世界书条目</label>
            </div>`;
    }

    function controlAdvancedHtml() {
        const cfg = settings();
        return `
            <div class="ma-control-section">
                <div class="ma-section-title"><b>界面入口</b><span>顶部按钮为默认入口</span></div>
                <label class="checkbox_label"><input type="checkbox" data-ma-setting="showTopButton" ${checked(cfg.showTopButton)}>在酒馆顶部显示镜渊按钮</label>
                <label class="checkbox_label"><input type="checkbox" data-ma-setting="showFloatingButton" ${checked(cfg.showFloatingButton)}>显示右下角浮动按钮</label>
            </div>
            <div class="ma-control-section">
                <div class="ma-section-title"><b>维护工具</b><span>用于迁移、诊断和备份</span></div>
                <div class="ma-quick-actions">
                    <button type="button" data-ma-control-action="import">导入旧版快照</button>
                    <button type="button" data-ma-control-action="migrate">迁移旧世界书</button>
                    <button type="button" data-ma-control-action="export">导出镜渊数据</button>
                </div>
                <p class="ma-help">当前构建 v${VERSION}。独立 API 密钥会随酒馆扩展设置保存在本机数据目录中，请勿在共享账号中使用私人密钥。</p>
            </div>`;
    }

    function controlTabContent(tab) {
        if (tab === 'connection') return controlConnectionHtml();
        if (tab === 'state') return controlStateHtml();
        if (tab === 'audit') return controlAuditHtml();
        if (tab === 'memory') return controlMemoryHtml();
        if (tab === 'advanced') return controlAdvancedHtml();
        return controlOverviewHtml();
    }

    function createControlCenter() {
        if (document.getElementById('ma-control-center')) return;
        const root = document.createElement('div');
        root.id = 'ma-control-center';
        root.hidden = true;
        root.innerHTML = '<div class="ma-control-shell"></div>';
        root.addEventListener('click', event => {
            if (event.target === root) closeControlCenter();
        });
        document.body.appendChild(root);
    }

    function renderControlCenter() {
        createControlCenter();
        const root = document.getElementById('ma-control-center');
        const shell = root.querySelector('.ma-control-shell');
        const tabs = [
            ['overview', '总览', 'gauge-high'], ['connection', '独立模型', 'plug'], ['state', '表格与总结', 'table-list'],
            ['audit', '规则校正', 'shield-halved'], ['memory', '世界书与图谱', 'book'], ['advanced', '高级', 'sliders'],
        ];
        shell.innerHTML = `
            <header class="ma-control-head">
                <div class="ma-brand"><span class="ma-brand-mark">渊</span><div><b>镜渊控制台</b><small>Mirror Abyss v${VERSION}</small></div></div>
                <button type="button" class="ma-icon-button" data-ma-control-action="close" aria-label="关闭">×</button>
            </header>
            <div class="ma-control-layout">
                <nav class="ma-control-tabs">${tabs.map(([id, label, icon]) => `<button type="button" class="${controlCenterTab === id ? 'active' : ''}" data-ma-control-tab="${id}"><i class="fa-solid fa-${icon}"></i><span>${label}</span></button>`).join('')}</nav>
                <main class="ma-control-content" data-tab="${controlCenterTab}">${controlTabContent(controlCenterTab)}</main>
            </div>`;
        bindControlCenterHandlers(root);
    }

    function openControlCenter(tab = controlCenterTab) {
        controlCenterTab = tab || 'overview';
        try {
            renderControlCenter();
            const root = document.getElementById('ma-control-center');
            if (!root) throw new Error('控制台容器创建失败');
            root.hidden = false;
            root.removeAttribute('hidden');
            document.body.classList.add('ma-control-open');
            updateUnifiedStatus();
        } catch (error) {
            console.error('[MirrorAbyss] Failed to open control center', error);
            createControlCenter();
            const root = document.getElementById('ma-control-center');
            if (root) {
                root.hidden = false;
                root.removeAttribute('hidden');
                root.innerHTML = `<div class="ma-control-shell ma-control-fallback"><header class="ma-control-head"><div class="ma-brand"><span class="ma-brand-mark">渊</span><div><b>镜渊控制台启动失败</b><small>Mirror Abyss v${VERSION}</small></div></div><button type="button" class="ma-icon-button" id="ma-control-fallback-close">×</button></header><main class="ma-control-content"><div class="ma-alert danger"><b>控制台渲染异常</b><p>${escapeHtml(error?.message || String(error))}</p></div><p class="ma-help">请完全刷新酒馆页面；若仍出现此页，请保留这段错误信息。</p></main></div>`;
                root.querySelector('#ma-control-fallback-close')?.addEventListener('click', closeControlCenter);
                document.body.classList.add('ma-control-open');
            }
            toast('error', `控制台打开失败：${error?.message || error}`);
        }
    }

    function closeControlCenter() {
        const root = document.getElementById('ma-control-center');
        if (root) root.hidden = true;
        document.body.classList.remove('ma-control-open');
    }

    function saveControlSetting(input) {
        const key = input.dataset.maSetting;
        if (!key) return;
        const value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
        settings()[key] = value;
        if (key === 'apiProvider' && !settings().apiBaseUrl) {
            if (value === 'gemini') settings().apiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';
            if (value === 'anthropic') settings().apiBaseUrl = 'https://api.anthropic.com/v1';
        }
        saveSettings();
        if (['showMessagePanels'].includes(key)) renderAllPanels();
        if (['showTopButton', 'showFloatingButton'].includes(key)) applyInterfaceVisibility();
        updateUnifiedStatus();
    }

    function bindControlCenterHandlers(root) {
        root.querySelectorAll('[data-ma-control-tab]').forEach(button => button.addEventListener('click', () => {
            controlCenterTab = button.dataset.maControlTab;
            renderControlCenter();
        }));
        root.querySelectorAll('[data-ma-setting]').forEach(input => {
            input.addEventListener('change', () => {
                saveControlSetting(input);
                if (['generationMode', 'apiProvider'].includes(input.dataset.maSetting)) renderControlCenter();
            });
        });
        root.querySelectorAll('[data-ma-meta]').forEach(input => input.addEventListener('change', () => {
            if (input.dataset.maMeta === 'lorebookName') {
                chatMeta().lorebookName = sanitizedBookName(input.value);
                persistMetadata();
                scheduleLorebookSync('lorebook changed');
            }
        }));
        root.querySelectorAll('[data-ma-control-action]').forEach(button => button.addEventListener('click', async () => {
            const action = button.dataset.maControlAction;
            try {
                if (action === 'close') return closeControlCenter();
                if (action === 'toggle-key') {
                    const field = root.querySelector('#ma-api-key');
                    if (field) field.type = field.type === 'password' ? 'text' : 'password';
                    return;
                }
                if (action === 'test-api') {
                    button.disabled = true;
                    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 测试中';
                    await testIndependentApi();
                    toast('success', '独立模型连接正常');
                    return renderControlCenter();
                }
                if (action === 'models') {
                    button.disabled = true;
                    const models = await fetchIndependentModels();
                    const list = root.querySelector('#ma-model-list');
                    if (list) list.innerHTML = models.slice(0, 300).map(model => `<option value="${escapeHtml(model)}"></option>`).join('');
                    toast('success', `已读取 ${models.length} 个模型`);
                    button.disabled = false;
                    return;
                }
                if (action === 'process-latest') return runMessagePipeline(latestAssistantIndex(), { force: true });
                if (action === 'audit-latest') return auditMessage(latestAssistantIndex(), { force: true });
                if (action === 'sync') return enqueue('同步世界书', () => reconcileLorebook({ silent: false }));
                if (action === 'graph') return openWorkspace(latestAssistantIndex());
                if (action === 'small') return enqueue('生成小总结', () => generateSmallSummary(latestAssistantIndex(), { force: true }));
                if (action === 'large') return enqueue('生成大总结', () => generateLargeSummary(latestAssistantIndex(), { force: true }));
                if (action === 'import') return openLegacyImporter();
                if (action === 'migrate') return enqueue('迁移旧世界书', migrateLegacyLorebook);
                if (action === 'export') return exportMirrorData();
            } catch (error) {
                toast('error', error?.message || String(error));
                renderControlCenter();
            }
        }));
    }

    function createTopBarButton() {
        if (document.getElementById('ma-top-button')) return;
        const button = document.createElement('button');
        button.id = 'ma-top-button';
        button.type = 'button';
        button.className = 'right_menu_button interactable';
        button.title = '镜渊控制台';
        button.setAttribute('aria-label', '打开镜渊控制台');
        button.innerHTML = '<i class="fa-solid fa-table-list"></i><span class="ma-top-dot"></span>';
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            openControlCenter('overview');
        });
        const anchors = ['#persona-management-button', '#persona_management_button', '#user-settings-button', '#user_settings_button', '#account-button', '#account_button'];
        const anchor = anchors.map(selector => document.querySelector(selector)).find(Boolean);
        const host = anchor?.parentElement
            || document.querySelector('#top-settings-holder')
            || document.querySelector('#top-bar')
            || document.querySelector('#sheld')
            || document.querySelector('.top-bar');
        if (anchor) anchor.insertAdjacentElement('afterend', button);
        else if (host) host.appendChild(button);
        else {
            button.classList.add('ma-top-fallback');
            document.body.appendChild(button);
        }
        applyInterfaceVisibility();
    }

    function applyInterfaceVisibility() {
        const cfg = settings();
        const top = document.getElementById('ma-top-button');
        const floating = document.getElementById('ma-floating-button');
        if (top) top.hidden = !cfg.showTopButton;
        const topVisible = Boolean(top && cfg.showTopButton && top.isConnected && getComputedStyle(top).display !== 'none' && getComputedStyle(top).visibility !== 'hidden');
        if (floating) floating.hidden = !cfg.showFloatingButton && topVisible;
    }

    function createFloatingButton() {
        if (document.getElementById('ma-floating-button')) return;
        const button = document.createElement('button');
        button.id = 'ma-floating-button';
        button.type = 'button';
        button.title = '打开镜渊控制台';
        button.innerHTML = '<span class="ma-orb">渊</span><span id="ma-floating-badge"></span>';
        button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); openControlCenter('overview'); });
        document.body.appendChild(button);
    }

    function overallStatus() {
        const latest = latestMirrorData();
        const meta = chatMeta();
        const hasError = Boolean(meta.lastSyncError || latest?.status === 'error' || latest?.auditStatus === 'error' || latest?.auditStatus === 'failed');
        if (hasError) return { tone: 'danger', label: '镜渊存在失败状态' };
        if (activeJobs.size || latest?.status === 'processing' || latest?.auditStatus === 'processing' || meta.lastSyncState === 'processing') return { tone: 'working', label: '镜渊正在处理' };
        if (latest?.status === 'synced') return { tone: 'success', label: '镜渊运行正常' };
        return { tone: 'neutral', label: '镜渊等待处理' };
    }

    function updateFloatingStatus() {
        const badge = document.getElementById('ma-floating-badge');
        if (!badge) return;
        const state = overallStatus();
        badge.textContent = activeJobs.size ? String(activeJobs.size) : state.tone === 'danger' ? '!' : '';
        badge.classList.toggle('error', state.tone === 'danger' && !activeJobs.size);
    }

    function updateTopStatus() {
        const button = document.getElementById('ma-top-button');
        if (!button) return;
        const state = overallStatus();
        button.dataset.tone = state.tone;
        button.title = state.label;
        const dot = button.querySelector('.ma-top-dot');
        if (dot) dot.dataset.tone = state.tone;
    }

    function updateUnifiedStatus() {
        updateFloatingStatus();
        updateTopStatus();
        applyInterfaceVisibility();
    }

    function createWorkspace() {
        if (document.getElementById('ma-workspace')) return;
        const root = document.createElement('div');
        root.id = 'ma-workspace';
        root.hidden = true;
        root.innerHTML = `
            <header class="ma-workspace-head">
                <div><b>镜渊世界图谱</b><small> v${VERSION}</small></div>
                <div class="ma-workspace-actions">
                    <input type="search" id="ma-graph-search" placeholder="搜索节点">
                    <button type="button" id="ma-workspace-sync">同步世界书</button>
                    <button type="button" id="ma-workspace-edit">编辑当前表格</button>
                    <button type="button" id="ma-workspace-small">小总结</button>
                    <button type="button" id="ma-workspace-large">大总结</button>
                    <button type="button" id="ma-workspace-close" aria-label="关闭">×</button>
                </div>
            </header>
            <div class="ma-workspace-body">
                <div id="ma-graph"></div>
                <aside id="ma-node-sheet" hidden>
                    <button type="button" id="ma-node-sheet-close">×</button>
                    <div id="ma-node-sheet-content"></div>
                </aside>
            </div>`;
        document.body.appendChild(root);
        root.querySelector('#ma-workspace-close').addEventListener('click', closeWorkspace);
        root.querySelector('#ma-workspace-sync').addEventListener('click', () => enqueue('同步世界书', () => reconcileLorebook({ silent: false })));
        root.querySelector('#ma-graph-search').addEventListener('input', event => { graphSearch = event.target.value.trim().toLowerCase(); renderGraph(); });
        root.querySelector('#ma-node-sheet-close').addEventListener('click', () => root.querySelector('#ma-node-sheet').hidden = true);
        root.querySelector('#ma-workspace-edit').addEventListener('click', () => openSnapshotEditor(Number(root.dataset.anchorIndex || latestAssistantIndex())));
        root.querySelector('#ma-workspace-small').addEventListener('click', () => {
            const index = latestAssistantIndex();
            enqueue('生成小总结', () => generateSmallSummary(index, { force: true })).catch(error => toast('error', error.message));
        });
        root.querySelector('#ma-workspace-large').addEventListener('click', () => {
            const index = latestAssistantIndex();
            enqueue('生成大总结', () => generateLargeSummary(index, { force: true })).catch(error => toast('error', error.message));
        });
    }

    function loadGraphLibrary() {
        if (window.ForceGraph3D) return Promise.resolve(window.ForceGraph3D);
        if (graphScriptPromise) return graphScriptPromise;
        graphScriptPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = settings().graphLibraryUrl || GRAPH_LIB_URL;
            script.async = true;
            script.onload = () => window.ForceGraph3D ? resolve(window.ForceGraph3D) : reject(new Error('3D图库未加载'));
            script.onerror = () => reject(new Error('无法加载3D图库'));
            document.head.appendChild(script);
        });
        return graphScriptPromise;
    }

    function currentGraphSnapshot() {
        const index = latestAssistantIndex();
        return getMessage(index)?.extra?.[MODULE_NAME]?.tableSnapshot || emptySnapshot();
    }

    async function buildGraphData(snapshot) {
        const nodes = [];
        for (const key of TABLE_KEYS) {
            for (const row of snapshot[key] || []) {
                nodes.push({
                    id: `state:${key}:${row.id}`,
                    rowId: row.id,
                    name: row.title,
                    type: key,
                    sourceKind: 'state',
                    tableKey: key,
                    content: row.content,
                    keywords: row.keywords || [],
                    status: row.status,
                });
            }
        }
        for (const item of collectArtifactSummaries()) {
            nodes.push({
                id: `${item.kind}:${item.value.id}`,
                name: item.value.title,
                type: item.kind,
                sourceKind: 'summary',
                messageIndex: item.index,
                summaryKind: item.kind,
                content: item.value.summary,
                keywords: item.value.keywords || [],
                status: 'snapshot',
            });
        }
        if (settings().showExternalLorebookNodes) {
            const entries = await readLorebookEntries({ externalOnly: true });
            for (const entry of entries) {
                nodes.push({
                    id: `worldbook:${entry.uid}`,
                    uid: entry.uid,
                    world: entry.world,
                    name: entry.comment || entry.key?.[0] || `世界书 ${entry.uid}`,
                    type: 'worldbook',
                    sourceKind: 'worldbook',
                    content: entry.content || '',
                    keywords: Array.isArray(entry.key) ? entry.key : [],
                    status: entry.disable ? 'disabled' : entry.constant ? 'constant' : entry.vectorized ? 'vectorized' : 'normal',
                    entry,
                });
            }
        }
        const query = graphSearch;
        const filtered = query ? nodes.filter(node => `${node.name} ${node.content} ${(node.keywords || []).join(' ')}`.toLowerCase().includes(query)) : nodes;
        const allowed = new Set(filtered.map(node => node.id));
        const links = [];
        const seen = new Set();
        for (const source of filtered) {
            const haystack = `${source.content} ${(source.keywords || []).join(' ')}`;
            for (const target of filtered) {
                if (source.id === target.id || !target.name || target.name.length < 2 || !allowed.has(target.id)) continue;
                if (!haystack.includes(target.name)) continue;
                const key = `${source.id}->${target.id}`;
                if (seen.has(key)) continue;
                seen.add(key);
                links.push({ source: source.id, target: target.id, label: target.name });
            }
        }
        return { nodes: filtered, links };
    }

    function showNodeSheet(node) {
        const sheet = document.getElementById('ma-node-sheet');
        const body = document.getElementById('ma-node-sheet-content');
        if (!sheet || !body) return;
        const label = node.type === 'worldbook' ? '世界书条目' : node.type === 'small' ? '小总结' : node.type === 'large' ? '大总结' : TABLE_LABELS[node.type] || node.type;
        body.innerHTML = `
            <div class="ma-node-kind">${escapeHtml(label)}</div>
            <h3>${escapeHtml(node.name)}</h3>
            <p>${escapeHtml(node.content)}</p>
            <div class="ma-node-meta">${escapeHtml(node.status || '')}${node.keywords?.length ? ` · ${escapeHtml(node.keywords.join('、'))}` : ''}</div>
            <div class="ma-node-buttons"><button type="button" id="ma-node-edit">修改此条目</button>${node.sourceKind === 'worldbook' ? '<button type="button" id="ma-node-delete">删除条目</button>' : ''}</div>`;
        sheet.hidden = false;
        body.querySelector('#ma-node-edit').addEventListener('click', () => openNodeEditor(node));
        body.querySelector('#ma-node-delete')?.addEventListener('click', async () => {
            if (!confirm('确定删除该世界书条目？')) return;
            await deleteExternalLorebookEntry(node);
            sheet.hidden = true;
        });
    }

    async function renderGraph() {
        const container = document.getElementById('ma-graph');
        if (!container) return;
        const data = await buildGraphData(currentGraphSnapshot());
        container.innerHTML = '';
        if (!data.nodes.length) {
            container.innerHTML = '<div class="ma-graph-empty">当前没有可显示的状态节点。生成或导入表格后再打开。</div>';
            return;
        }
        try {
            const ForceGraph3D = await loadGraphLibrary();
            if (!document.getElementById('ma-workspace') || document.getElementById('ma-workspace').hidden) return;
            graphInstance = ForceGraph3D()(container)
                .backgroundColor('rgba(0,0,0,0)')
                .graphData(data)
                .nodeLabel(node => `${TABLE_LABELS[node.type] || node.type}｜${node.name}`)
                .nodeAutoColorBy('type')
                .nodeVal(node => node.type === 'focus' ? 9 : node.type === 'foundations' || node.type === 'large' ? 7 : node.type === 'worldbook' ? 5 : 4)
                .linkDirectionalArrowLength(3)
                .linkDirectionalArrowRelPos(1)
                .linkOpacity(0.45)
                .onNodeClick(showNodeSheet)
                .cooldownTicks(80)
                .warmupTicks(20);
            const controls = graphInstance.controls?.();
            if (controls) {
                controls.autoRotate = false;
                controls.enableDamping = true;
                controls.dampingFactor = 0.08;
            }
            graphInstance.d3Force?.('charge')?.strength?.(-80);
            graphResizeObserver?.disconnect();
            graphResizeObserver = new ResizeObserver(entries => {
                const box = entries[0]?.contentRect;
                if (box && graphInstance) graphInstance.width(box.width).height(box.height);
            });
            graphResizeObserver.observe(container);
            setTimeout(() => graphInstance?.zoomToFit?.(600, 60), 250);
        } catch (error) {
            container.innerHTML = `<div class="ma-graph-empty">3D图库加载失败，已使用列表回退。<br>${escapeHtml(error.message)}</div>` +
                data.nodes.map(node => `<button class="ma-fallback-node" data-node-id="${escapeHtml(node.id)}">${escapeHtml(node.name)}</button>`).join('');
            container.querySelectorAll('.ma-fallback-node').forEach(button => {
                button.addEventListener('click', () => showNodeSheet(data.nodes.find(node => node.id === button.dataset.nodeId)));
            });
        }
    }

    function openWorkspace(anchorIndex = latestAssistantIndex()) {
        createWorkspace();
        const root = document.getElementById('ma-workspace');
        root.dataset.anchorIndex = String(anchorIndex);
        root.hidden = false;
        document.body.classList.add('ma-workspace-open');
        renderGraph();
    }

    function closeWorkspace() {
        const root = document.getElementById('ma-workspace');
        if (root) root.hidden = true;
        document.body.classList.remove('ma-workspace-open');
        graphResizeObserver?.disconnect();
        graphResizeObserver = null;
        graphInstance = null;
    }

    function refreshWorkspaceIfOpen() {
        const root = document.getElementById('ma-workspace');
        if (root && !root.hidden) renderGraph();
    }

    function openSnapshotEditor(index) {
        const message = getMessage(index);
        if (!message || message.is_user) return toast('warning', '未找到可编辑的AI正文');
        const data = ensureMessageData(message);
        const snapshot = data.tableSnapshot || previousSnapshot(index + 1);
        openEditorModal({
            title: `编辑第 ${index + 1} 条状态表`,
            value: JSON.stringify(snapshot, null, 2),
            onSave: async text => {
                const parsed = normalizeSnapshot(JSON.parse(text));
                data.tableSnapshot = parsed;
                data.status = 'synced';
                data.error = null;
                data.updatedAt = new Date().toISOString();
                await persistChat();
                scheduleLorebookSync('snapshot edited');
                renderMessagePanel(index);
                refreshWorkspaceIfOpen();
            },
        });
    }

    function openNodeEditor(node) {
        if (node.sourceKind === 'worldbook') {
            const value = JSON.stringify({
                comment: node.entry.comment || '',
                content: node.entry.content || '',
                key: node.entry.key || [],
                constant: Boolean(node.entry.constant),
                vectorized: Boolean(node.entry.vectorized),
                disable: Boolean(node.entry.disable),
                order: Number(node.entry.order || 100),
                position: Number(node.entry.position || 0),
            }, null, 2);
            return openEditorModal({ title: `修改世界书：${node.name}`, value, onSave: text => editExternalLorebookEntry(node, text) });
        }
        if (node.sourceKind === 'summary') return editSummary(node.messageIndex, node.summaryKind);
        const index = latestAssistantIndex();
        const message = getMessage(index);
        const snapshot = message?.extra?.[MODULE_NAME]?.tableSnapshot;
        const rows = snapshot?.[node.tableKey];
        const rowIndex = rows?.findIndex(row => row.id === (node.rowId || node.id)) ?? -1;
        if (rowIndex < 0) return toast('warning', '该节点不在当前表格中');
        openRowEditor({
            title: `修改：${node.name}`,
            row: rows[rowIndex],
            onSave: async value => {
                rows[rowIndex] = cleanRecord(value, node.tableKey, rowIndex);
                await persistChat();
                scheduleLorebookSync('node edited');
                renderMessagePanel(index);
                refreshWorkspaceIfOpen();
                document.getElementById('ma-node-sheet').hidden = true;
            },
        });
    }

    function addRow(index, tableKey) {
        const message = getMessage(index);
        const data = ensureMessageData(message);
        data.tableSnapshot ||= previousSnapshot(index + 1);
        openRowEditor({
            title: `添加${TABLE_LABELS[tableKey]}`,
            row: { id: makeId(tableKey), title: '', content: '', keywords: [], status: 'active' },
            onSave: async value => {
                data.tableSnapshot[tableKey].push(cleanRecord(value, tableKey, data.tableSnapshot[tableKey].length));
                data.activeTableKey = tableKey;
                data.status = 'synced';
                await persistChat();
                scheduleLorebookSync('row added');
                renderMessagePanel(index);
                refreshWorkspaceIfOpen();
            },
        });
    }

    function editRow(index, tableKey, rowId) {
        const rows = getMessage(index)?.extra?.[MODULE_NAME]?.tableSnapshot?.[tableKey];
        const rowIndex = rows?.findIndex(row => row.id === rowId) ?? -1;
        if (rowIndex < 0) return toast('warning', '记录已不存在');
        openRowEditor({
            title: `修改${TABLE_LABELS[tableKey]}`,
            row: rows[rowIndex],
            onSave: async value => {
                rows[rowIndex] = cleanRecord(value, tableKey, rowIndex);
                await persistChat();
                scheduleLorebookSync('row edited');
                renderMessagePanel(index);
                refreshWorkspaceIfOpen();
            },
        });
    }

    async function deleteRow(index, tableKey, rowId) {
        if (!confirm('确定删除这条状态记录？')) return;
        const rows = getMessage(index)?.extra?.[MODULE_NAME]?.tableSnapshot?.[tableKey];
        const rowIndex = rows?.findIndex(row => row.id === rowId) ?? -1;
        if (rowIndex < 0) return;
        rows.splice(rowIndex, 1);
        await persistChat();
        scheduleLorebookSync('row deleted');
        renderMessagePanel(index);
        refreshWorkspaceIfOpen();
    }

    function editSummary(index, kind) {
        const field = kind === 'large' ? 'largeSummary' : 'smallSummary';
        const data = getMessage(index)?.extra?.[MODULE_NAME];
        const summary = data?.[field];
        if (!summary) return toast('warning', '总结已不存在');
        openEditorModal({
            title: `编辑${kind === 'large' ? '大总结' : '小总结'}`,
            value: JSON.stringify(summary, null, 2),
            onSave: async text => {
                const parsed = JSON.parse(text);
                data[field] = { ...summary, ...parsed, id: summary.id };
                await persistChat();
                scheduleLorebookSync('summary edited');
                renderMessagePanel(index);
                refreshWorkspaceIfOpen();
            },
        });
    }

    async function deleteSummary(index, kind) {
        if (!confirm(`确定删除${kind === 'large' ? '大总结' : '小总结'}？`)) return;
        const data = getMessage(index)?.extra?.[MODULE_NAME];
        if (!data) return;
        data[kind === 'large' ? 'largeSummary' : 'smallSummary'] = null;
        await persistChat();
        scheduleLorebookSync('summary deleted');
        renderAllPanels();
        refreshWorkspaceIfOpen();
    }

    function openEditorModal({ title, value, onSave }) {
        document.getElementById('ma-editor-modal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'ma-editor-modal';
        modal.innerHTML = `
            <div class="ma-editor-card">
                <header><b>${escapeHtml(title)}</b><button type="button" data-close>×</button></header>
                <textarea spellcheck="false"></textarea>
                <footer><button type="button" data-cancel>取消</button><button type="button" data-save>保存</button></footer>
            </div>`;
        modal.querySelector('textarea').value = value;
        const close = () => modal.remove();
        modal.querySelector('[data-close]').addEventListener('click', close);
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-save]').addEventListener('click', async () => {
            try {
                await onSave(modal.querySelector('textarea').value);
                close();
            } catch (error) {
                toast('error', `保存失败：${error.message}`);
            }
        });
        document.body.appendChild(modal);
    }

    function openRowEditor({ title, row, onSave }) {
        document.getElementById('ma-row-editor-modal')?.remove();
        const source = {
            id: String(row?.id || makeId('row')),
            title: String(row?.title || row?.name || ''),
            content: String(row?.content || row?.summary || ''),
            status: String(row?.status || 'active'),
            keywords: Array.isArray(row?.keywords) ? row.keywords.map(String) : [],
        };
        const modal = document.createElement('div');
        modal.id = 'ma-row-editor-modal';
        modal.innerHTML = `
            <div class="ma-editor-card ma-form-editor">
                <header><b>${escapeHtml(title)}</b><button type="button" data-close>×</button></header>
                <div class="ma-form-body">
                    <label><span>对象／项目</span><input type="text" name="title" value="${escapeHtml(source.title)}" placeholder="例如：林晚、宿舍楼、调查流程"></label>
                    <label><span>当前记录</span><textarea name="content" placeholder="只填写当前有效事实"></textarea></label>
                    <div class="ma-form-grid">
                        <label><span>状态</span><input type="text" name="status" value="${escapeHtml(source.status)}" placeholder="active / pending / closed"></label>
                        <label><span>关键词</span><input type="text" name="keywords" value="${escapeHtml((source.keywords || []).join('、'))}" placeholder="使用逗号或顿号分隔"></label>
                    </div>
                </div>
                <footer><button type="button" data-cancel>取消</button><button type="button" class="menu_button" data-save>保存</button></footer>
            </div>`;
        modal.querySelector('[name="content"]').value = source.content;
        const close = () => modal.remove();
        modal.querySelector('[data-close]').addEventListener('click', close);
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-save]').addEventListener('click', async () => {
            try {
                const value = {
                    ...source,
                    title: modal.querySelector('[name="title"]').value.trim(),
                    content: modal.querySelector('[name="content"]').value.trim(),
                    status: modal.querySelector('[name="status"]').value.trim() || 'active',
                    keywords: modal.querySelector('[name="keywords"]').value.split(/[,，、]/).map(x => x.trim()).filter(Boolean),
                };
                if (!value.title) throw new Error('对象／项目不能为空');
                await onSave(value);
                close();
            } catch (error) {
                toast('error', `保存失败：${error.message}`);
            }
        });
        document.body.appendChild(modal);
    }

    function parseLegacySnapshot(text) {
        const snapshot = emptySnapshot();
        const source = String(text || '');
        const add = (key, title, content, keywords = []) => snapshot[key].push(cleanRecord({
            id: makeId(key), title, content, keywords, status: 'active',
        }, key, snapshot[key].length));

        const global = source.match(/\[全局\][\s\S]*?【全局卡结束】/);
        if (global) add('foundations', '世界全局', global[0], ['全局', '世界']);

        const collect = (regex, key) => {
            let match;
            while ((match = regex.exec(source))) {
                const name = String(match[1] || '').trim();
                const card = match[0];
                const aliasLine = card.match(/别名[：:]\s*([^\n]+)/)?.[1]?.trim();
                const aliases = aliasLine && aliasLine !== '无' ? aliasLine.split(/[,，、]/).map(x => x.trim()).filter(Boolean) : [];
                add(key, name, card, [name, ...aliases]);
            }
        };
        collect(/\[焦点：([^\]]+)\][\s\S]*?【焦点卡结束：[^\n]*】/g, 'focus');
        collect(/\[区域：([^\]]+)\][\s\S]*?【区域卡结束：[^\n]*】/g, 'regions');
        collect(/\[角色：([^\]]+)\][\s\S]*?【角色卡结束：[^\n]*】/g, 'characters');
        return snapshot;
    }

    async function migrateLegacyLorebook() {
        const wi = await worldInfoApi();
        const name = await resolveLorebookName({ create: false });
        if (!name) throw new Error('当前聊天没有关联世界书');
        const data = await wi.loadWorldInfo(name);
        if (!data?.entries) throw new Error('无法读取聊天世界书');
        let snapshot = emptySnapshot();
        let count = 0;
        const add = (tableKey, title, content, keywords = []) => {
            snapshot[tableKey].push(cleanRecord({ id: makeId(tableKey), title, content, keywords, status: 'active' }, tableKey, snapshot[tableKey].length));
            count++;
        };
        for (const entry of Object.values(data.entries)) {
            const comment = String(entry.comment || '');
            if (comment === 'MA_Backup_LastSnapshot' && entry.content) {
                const parsed = parseLegacySnapshot(entry.content);
                for (const key of TABLE_KEYS) snapshot[key].push(...parsed[key]);
                count += TABLE_KEYS.reduce((sum, key) => sum + parsed[key].length, 0);
                entry.disable = true;
                continue;
            }
            let match;
            if (comment === 'MA_世界全局') add('foundations', '世界全局', entry.content || '', entry.key || []);
            else if ((match = comment.match(/^MA_焦点_(.+)$/))) add('focus', match[1], entry.content || '', entry.key || []);
            else if ((match = comment.match(/^MA_区域_(.+)$/))) add('regions', match[1], entry.content || '', entry.key || []);
            else if ((match = comment.match(/^MA_角色_(.+)$/))) add('characters', match[1], entry.content || '', entry.key || []);
            else continue;
            entry.disable = true;
        }
        if (!count) throw new Error('未发现旧版 MA 世界书条目');
        snapshot = normalizeSnapshot(snapshot);
        const index = latestAssistantIndex();
        if (index < 0) throw new Error('当前聊天没有可绑定的AI正文');
        const artifact = ensureMessageData(getMessage(index));
        artifact.tableSnapshot = snapshot;
        artifact.status = 'synced';
        artifact.error = null;
        artifact.updatedAt = new Date().toISOString();
        await wi.saveWorldInfo(name, data, true);
        await persistChat();
        scheduleLorebookSync('legacy lorebook migrated');
        renderMessagePanel(index);
        refreshWorkspaceIfOpen();
        toast('success', `已迁移 ${count} 条旧版状态；旧条目已停用`);
    }

    function openLegacyImporter() {
        openEditorModal({
            title: '导入旧版快照',
            value: '',
            onSave: async text => {
                const index = latestAssistantIndex();
                if (index < 0) throw new Error('当前聊天没有可绑定的AI正文');
                const snapshot = parseLegacySnapshot(text);
                if (!TABLE_KEYS.some(key => snapshot[key].length)) throw new Error('未识别到旧版卡片');
                const data = ensureMessageData(getMessage(index));
                data.tableSnapshot = snapshot;
                data.status = 'synced';
                data.error = null;
                data.updatedAt = new Date().toISOString();
                await persistChat();
                scheduleLorebookSync('legacy imported');
                renderMessagePanel(index);
                refreshWorkspaceIfOpen();
                toast('success', '旧版快照已导入当前正文');
            },
        });
    }

    function exportMirrorData() {
        const payload = {
            format: 'MirrorAbyssExport',
            version: VERSION,
            exportedAt: new Date().toISOString(),
            lorebookName: chatMeta().lorebookName || settings().lorebookName || '',
            artifacts: getChat().map((message, index) => ({ index, is_user: Boolean(message?.is_user), data: message?.extra?.[MODULE_NAME] || null })).filter(item => item.data),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Mirror-Abyss-${Date.now()}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    function createSettingsPanel() {
        if (document.getElementById('ma-settings')) return;
        const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
        if (!host) {
            clearTimeout(settingsPanelRetryTimer);
            settingsPanelRetryTimer = setTimeout(createSettingsPanel, 700);
            return;
        }
        clearTimeout(settingsPanelRetryTimer);
        const cfg = settings();
        const panel = document.createElement('div');
        panel.id = 'ma-settings';
        panel.className = 'extension_container';
        panel.innerHTML = `
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>镜渊 Mirror Abyss</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <label class="checkbox_label"><input type="checkbox" id="ma-compact-enabled" ${cfg.enabled ? 'checked' : ''}>启用镜渊</label>
                    <p class="ma-help">主要设置已移动到酒馆顶部的镜渊按钮，便于手机与桌面统一使用。</p>
                    <button type="button" class="menu_button" id="ma-settings-control"><i class="fa-solid fa-table-list"></i> 打开镜渊控制台</button>
                    <small>v${VERSION}</small>
                </div>
            </div>`;
        host.appendChild(panel);
        panel.querySelector('#ma-compact-enabled').addEventListener('change', event => {
            settings().enabled = event.target.checked;
            saveSettings();
            updateUnifiedStatus();
        });
        panel.querySelector('#ma-settings-control').addEventListener('click', () => openControlCenter('overview'));
    }

    function resolveMessageIndex(data) {
        if (Number.isInteger(data)) return data;
        for (const key of ['messageId', 'message_id', 'mesId', 'index']) {
            if (Number.isInteger(data?.[key])) return data[key];
            if (/^\d+$/.test(String(data?.[key] ?? ''))) return Number(data[key]);
        }
        return latestAssistantIndex();
    }

    function bindSillyTavernEvents() {
        const context = ctx();
        if (!context?.eventSource || !context?.event_types) return;
        const { eventSource, event_types } = context;
        const renderSoon = () => setTimeout(renderAllPanels, 80);

        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, data => {
            const index = resolveMessageIndex(data);
            renderMessagePanel(index);
        });
        eventSource.on(event_types.MESSAGE_RECEIVED, data => {
            const index = resolveMessageIndex(data);
            scheduleMessagePipeline(index, { delay: 260 });
        });
        eventSource.on(event_types.MESSAGE_EDITED, data => {
            const index = resolveMessageIndex(data);
            const message = getMessage(index);
            if (message && !message.is_user) scheduleMessagePipeline(index, { force: true, delay: 180 });
            renderSoon();
        });
        eventSource.on(event_types.MESSAGE_SWIPED, () => {
            const index = latestAssistantIndex();
            scheduleMessagePipeline(index, { force: true, delay: 260 });
            renderSoon();
        });
        eventSource.on(event_types.MESSAGE_DELETED, () => {
            if (pruneInvalidSummaries()) persistChat();
            renderSoon();
            scheduleLorebookSync('message deleted');
            refreshWorkspaceIfOpen();
            updateUnifiedStatus();
        });
        eventSource.on(event_types.CHAT_CHANGED, () => {
            closeWorkspace();
            closeControlCenter();
            renderSoon();
            setTimeout(() => scheduleLorebookSync('chat changed'), 500);
            updateUnifiedStatus();
        });
    }

    function observeInterfaceHosts() {
        if (interfaceObserver) return;
        interfaceObserver = new MutationObserver(() => {
            if (!document.getElementById('ma-top-button')) createTopBarButton();
            if (!document.getElementById('ma-settings')) createSettingsPanel();
        });
        interfaceObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    function exposeEmergencyApi() {
        window.MirrorAbyss = Object.assign(window.MirrorAbyss || {}, {
            version: VERSION,
            openControlCenter: tab => openControlCenter(tab || 'overview'),
            closeControlCenter,
            openGraph: () => openWorkspace(latestAssistantIndex()),
        });
    }

    function init() {
        if (initialized || !ctx()) return;
        initialized = true;
        settings();
        createTopBarButton();
        createFloatingButton();
        createControlCenter();
        createWorkspace();
        createSettingsPanel();
        observeInterfaceHosts();
        exposeEmergencyApi();
        applyInterfaceVisibility();
        installDelegatedHandlers();
        bindSillyTavernEvents();
        setTimeout(() => { renderAllPanels(); updateUnifiedStatus(); }, 300);
        setTimeout(() => scheduleLorebookSync('initial'), 1200);
        console.info(`[MirrorAbyss] v${VERSION} initialized`);
    }

    const boot = () => {
        if (window.SillyTavern?.getContext?.()) init();
        else setTimeout(boot, 250);
    };
    boot();
})();
