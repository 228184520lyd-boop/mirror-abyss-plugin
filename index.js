(() => {
    'use strict';

    const MODULE_NAME = 'mirrorAbyss';
    const DISPLAY_NAME = '镜渊';
    const VERSION = '1.0.0-rc.1';
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
        stateProfile: '',
        smallSummaryProfile: '',
        largeSummaryProfile: '',
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

    function ctx() {
        return window.SillyTavern?.getContext?.();
    }

    function settings() {
        const context = ctx();
        if (!context) return structuredClone(DEFAULT_SETTINGS);
        const all = context.extensionSettings;
        if (!all[MODULE_NAME]) all[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
        for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
            if (!Object.hasOwn(all[MODULE_NAME], key)) all[MODULE_NAME][key] = value;
        }
        return all[MODULE_NAME];
    }

    function saveSettings() {
        ctx()?.saveSettingsDebounced?.();
    }


    function chatMeta() {
        const context = ctx();
        if (!context) return {};
        context.chatMetadata ||= {};
        context.chatMetadata[MODULE_NAME] ||= { schemaVersion: 1, lorebookName: '', lastSyncAt: null, lastSyncError: null };
        return context.chatMetadata[MODULE_NAME];
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
        return String(value || '').replace(/[\"|\r\n]/g, '').trim();
    }

    async function generateTask(task, options) {
        const context = ctx();
        if (!context?.generateRaw) throw new Error('当前酒馆版本未提供 generateRaw');
        const cfg = settings();
        const key = task === 'state' ? 'stateProfile' : task === 'small' ? 'smallSummaryProfile' : 'largeSummaryProfile';
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
        message.extra[MODULE_NAME] ||= {
            schemaVersion: 1,
            artifactId: makeId('artifact'),
            revision: 0,
            status: 'idle',
            tableSnapshot: null,
            smallSummary: null,
            largeSummary: null,
            error: null,
            updatedAt: null,
            lorebookEntryIds: [],
        };
        return message.extra[MODULE_NAME];
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
            updateFloatingStatus();
            try {
                return await work(jobId);
            } finally {
                activeJobs.delete(jobId);
                updateFloatingStatus();
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
        const context = ctx();
        if (!context?.generateRaw) throw new Error('当前酒馆版本未提供 generateRaw');
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
        if (!cfg.enabled || !cfg.autoState && !force) return;

        const data = ensureMessageData(message);
        if (!force && data.status === 'synced' && data.tableSnapshot) {
            renderMessagePanel(messageIndex);
            return;
        }

        const revision = Number(data.revision || 0) + 1;
        data.revision = revision;
        data.status = 'processing';
        data.error = null;
        renderMessagePanel(messageIndex);

        return enqueue(`更新第 ${messageIndex + 1} 条状态`, async () => {
            try {
                const snapshot = await generateStateSnapshot(messageIndex);
                const currentMessage = getMessage(messageIndex);
                const currentData = currentMessage?.extra?.[MODULE_NAME];
                if (!currentMessage || currentMessage.is_user || currentData?.revision !== revision) return;
                currentData.tableSnapshot = snapshot;
                currentData.status = 'synced';
                currentData.error = null;
                currentData.updatedAt = new Date().toISOString();
                await persistChat();
                renderMessagePanel(messageIndex);
                await maybeAutoSummaries(messageIndex);
                scheduleLorebookSync('state updated');
                refreshWorkspaceIfOpen();
            } catch (error) {
                const currentMessage = getMessage(messageIndex);
                const currentData = currentMessage?.extra?.[MODULE_NAME];
                if (currentData?.revision === revision) {
                    currentData.status = 'error';
                    currentData.error = String(error?.message || error);
                    await persistChat();
                    renderMessagePanel(messageIndex);
                }
                toast('error', `状态更新失败：${error?.message || error}`);
            }
        });
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
        updateFloatingStatus();
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
            await persistChat();
            await persistMetadata();
            if (!silent) toast('success', `记忆已同步到世界书：${name}`);
            return { name, changed, desired: desired.size };
        } catch (error) {
            meta.lastSyncError = String(error?.message || error);
            await persistMetadata();
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
            if (Object.hasOwn(parsed, field)) entry[field] = parsed[field];
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

    function renderRows(snapshot, tableKey, messageIndex) {
        const rows = snapshot?.[tableKey] || [];
        const cards = rows.map(row => `
            <article class="ma-row" data-row-id="${escapeHtml(row.id)}" data-table-key="${tableKey}">
                <div class="ma-row-main">
                    <div class="ma-row-title">${escapeHtml(row.title)}</div>
                    <div class="ma-row-content">${escapeHtml(row.content)}</div>
                    <div class="ma-row-meta">${escapeHtml(row.status)}${row.keywords?.length ? ` · ${escapeHtml(row.keywords.join('、'))}` : ''}</div>
                </div>
                <div class="ma-row-actions">
                    <button type="button" data-ma-action="row-edit" data-index="${messageIndex}" data-table-key="${tableKey}" data-row-id="${escapeHtml(row.id)}" title="修改">✎</button>
                    <button type="button" data-ma-action="row-delete" data-index="${messageIndex}" data-table-key="${tableKey}" data-row-id="${escapeHtml(row.id)}" title="删除">×</button>
                </div>
            </article>`).join('');
        return `${cards || '<div class="ma-empty">暂无记录</div>'}<button type="button" class="ma-add-row" data-ma-action="row-add" data-index="${messageIndex}" data-table-key="${tableKey}">＋ 添加</button>`;
    }

    function panelHtml(index, data) {
        const snapshot = data?.tableSnapshot;
        const statusText = data?.status === 'processing' ? '整理中' : data?.status === 'error' ? '未同步' : snapshot ? '已同步' : '等待同步';
        const sections = snapshot ? TABLE_KEYS.map((key, order) => `
            <details class="ma-section" ${order < 2 ? 'open' : ''}>
                <summary><span>${TABLE_LABELS[key]}</span><span>${snapshot[key]?.length || 0}</span></summary>
                <div class="ma-section-body">${renderRows(snapshot, key, index)}</div>
            </details>`).join('') : '<div class="ma-empty">本条正文尚未生成状态表。</div>';
        return `
            <div class="ma-panel-head">
                <button type="button" class="ma-panel-toggle" aria-expanded="false">镜渊状态 · ${statusText}</button>
                <div class="ma-panel-actions">
                    <button type="button" data-ma-action="retry" data-index="${index}" title="重新整理">↻</button>
                    <button type="button" data-ma-action="edit" data-index="${index}" title="编辑表格">✎</button>
                    <button type="button" data-ma-action="graph" data-index="${index}" title="打开图谱">◎</button>
                </div>
            </div>
            <div class="ma-panel-body" hidden>
                ${data?.error ? `<div class="ma-error">${escapeHtml(data.error)}</div>` : ''}
                <div class="ma-progress-line">小总结 ${pendingSmallTurnIndices().length}/${settings().smallSummaryTurns} · 大总结 ${pendingSmallSummaryIndicesForLarge().length}/${settings().largeSummaryCount}</div>
                ${sections}
                ${data?.smallSummary ? `<details class="ma-summary"><summary>小总结：${escapeHtml(data.smallSummary.title)}</summary><pre>${escapeHtml(data.smallSummary.summary)}</pre><div><button data-ma-action="summary-edit" data-kind="small" data-index="${index}">编辑</button><button data-ma-action="summary-delete" data-kind="small" data-index="${index}">删除</button></div></details>` : ''}
                ${data?.largeSummary ? `<details class="ma-summary"><summary>大总结：${escapeHtml(data.largeSummary.title)}</summary><pre>${escapeHtml(data.largeSummary.summary)}</pre><div><button data-ma-action="summary-edit" data-kind="large" data-index="${index}">编辑</button><button data-ma-action="summary-delete" data-kind="large" data-index="${index}">删除</button></div></details>` : ''}
                <div class="ma-inline-buttons">
                    <button type="button" data-ma-action="small" data-index="${index}">生成小总结</button>
                    <button type="button" data-ma-action="large" data-index="${index}">生成大总结</button>
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
        updateFloatingStatus();
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
            if (action === 'retry') processMessage(index, { force: true });
            if (action === 'edit') openSnapshotEditor(index);
            if (action === 'graph') openWorkspace(index);
            if (action === 'small') enqueue('生成小总结', () => generateSmallSummary(index, { force: true })).catch(error => toast('error', error.message));
            if (action === 'large') enqueue('生成大总结', () => generateLargeSummary(index, { force: true })).catch(error => toast('error', error.message));
            if (action === 'row-add') addRow(index, button.dataset.tableKey);
            if (action === 'row-edit') editRow(index, button.dataset.tableKey, button.dataset.rowId);
            if (action === 'row-delete') deleteRow(index, button.dataset.tableKey, button.dataset.rowId);
            if (action === 'summary-edit') editSummary(index, button.dataset.kind);
            if (action === 'summary-delete') deleteSummary(index, button.dataset.kind);
        });
    }

    function createFloatingButton() {
        if (document.getElementById('ma-floating-button')) return;
        const button = document.createElement('button');
        button.id = 'ma-floating-button';
        button.type = 'button';
        button.title = '打开镜渊';
        button.innerHTML = '<span class="ma-orb">渊</span><span id="ma-floating-badge"></span>';
        button.addEventListener('click', () => openWorkspace(latestAssistantIndex()));
        document.body.appendChild(button);
    }

    function updateFloatingStatus() {
        const badge = document.getElementById('ma-floating-badge');
        if (!badge) return;
        const errors = getChat().filter(m => m?.extra?.[MODULE_NAME]?.status === 'error').length;
        badge.textContent = activeJobs.size ? String(activeJobs.size) : errors ? '!' : '';
        badge.classList.toggle('error', Boolean(errors && !activeJobs.size));
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
        openEditorModal({
            title: `修改：${node.name}`,
            value: JSON.stringify(rows[rowIndex], null, 2),
            onSave: async text => {
                rows[rowIndex] = cleanRecord(JSON.parse(text), node.tableKey, rowIndex);
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
        openEditorModal({
            title: `添加${TABLE_LABELS[tableKey]}`,
            value: JSON.stringify({ id: makeId(tableKey), title: '', content: '', keywords: [], status: 'active' }, null, 2),
            onSave: async text => {
                data.tableSnapshot[tableKey].push(cleanRecord(JSON.parse(text), tableKey, data.tableSnapshot[tableKey].length));
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
        openEditorModal({
            title: `修改${TABLE_LABELS[tableKey]}`,
            value: JSON.stringify(rows[rowIndex], null, 2),
            onSave: async text => {
                rows[rowIndex] = cleanRecord(JSON.parse(text), tableKey, rowIndex);
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
        if (!host) return;
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
                    <label class="checkbox_label"><input type="checkbox" data-setting="enabled" ${cfg.enabled ? 'checked' : ''}>启用镜渊</label>
                    <label class="checkbox_label"><input type="checkbox" data-setting="autoState" ${cfg.autoState ? 'checked' : ''}>每轮自动更新表格</label>
                    <label class="checkbox_label"><input type="checkbox" data-setting="showMessagePanels" ${cfg.showMessagePanels ? 'checked' : ''}>在正文下显示折叠表格</label>
                    <label class="checkbox_label"><input type="checkbox" data-setting="autoSmallSummary" ${cfg.autoSmallSummary ? 'checked' : ''}>自动小总结</label>
                    <label>小总结回合数 <input type="number" min="1" max="100" data-setting="smallSummaryTurns" value="${cfg.smallSummaryTurns}"></label>
                    <label class="checkbox_label"><input type="checkbox" data-setting="autoLargeSummary" ${cfg.autoLargeSummary ? 'checked' : ''}>自动大总结</label>
                    <label>大总结所需小总结数 <input type="number" min="1" max="30" data-setting="largeSummaryCount" value="${cfg.largeSummaryCount}"></label>
                    <hr>
                    <label>表格连接配置（留空跟随当前）<input type="text" data-setting="stateProfile" value="${escapeHtml(cfg.stateProfile)}"></label>
                    <label>小总结连接配置<input type="text" data-setting="smallSummaryProfile" value="${escapeHtml(cfg.smallSummaryProfile)}"></label>
                    <label>大总结连接配置<input type="text" data-setting="largeSummaryProfile" value="${escapeHtml(cfg.largeSummaryProfile)}"></label>
                    <label class="checkbox_label"><input type="checkbox" data-setting="lorebookSync" ${cfg.lorebookSync ? 'checked' : ''}>自动同步聊天世界书</label>
                    <label>聊天世界书名称（留空自动创建）<input type="text" data-setting="lorebookName" value="${escapeHtml(chatMeta().lorebookName || cfg.lorebookName)}"></label>
                    <label class="checkbox_label"><input type="checkbox" data-setting="vectorizeStateRows" ${cfg.vectorizeStateRows ? 'checked' : ''}>人物等活跃状态同时启用向量</label>
                    <label class="checkbox_label"><input type="checkbox" data-setting="showExternalLorebookNodes" ${cfg.showExternalLorebookNodes ? 'checked' : ''}>图谱显示非镜渊世界书条目</label>
                    <div class="ma-settings-buttons">
                        <button type="button" id="ma-settings-open">打开世界图谱</button>
                        <button type="button" id="ma-settings-import">导入旧版快照</button>
                        <button type="button" id="ma-settings-migrate">迁移旧世界书</button>
                        <button type="button" id="ma-settings-retry">整理最新正文</button>
                        <button type="button" id="ma-settings-sync">同步世界书</button>
                        <button type="button" id="ma-settings-export">导出镜渊数据</button>
                    </div>
                    <small>当前构建：v${VERSION}。状态数据附着于对应正文；正文删除后，该条附属数据一并消失。</small>
                </div>
            </div>`;
        host.appendChild(panel);
        panel.querySelectorAll('[data-setting]').forEach(input => {
            input.addEventListener('change', () => {
                const key = input.dataset.setting;
                const value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
                if (key === 'lorebookName') {
                    chatMeta().lorebookName = sanitizedBookName(value);
                    persistMetadata();
                    scheduleLorebookSync('lorebook changed');
                } else {
                    settings()[key] = value;
                    saveSettings();
                }
                if (key === 'showMessagePanels') renderAllPanels();
            });
        });
        panel.querySelector('#ma-settings-open').addEventListener('click', () => openWorkspace(latestAssistantIndex()));
        panel.querySelector('#ma-settings-import').addEventListener('click', openLegacyImporter);
        panel.querySelector('#ma-settings-migrate').addEventListener('click', () => enqueue('迁移旧世界书', migrateLegacyLorebook).catch(error => toast('error', error.message)));
        panel.querySelector('#ma-settings-retry').addEventListener('click', () => processMessage(latestAssistantIndex(), { force: true }));
        panel.querySelector('#ma-settings-sync').addEventListener('click', () => enqueue('同步世界书', () => reconcileLorebook({ silent: false })));
        panel.querySelector('#ma-settings-export').addEventListener('click', exportMirrorData);
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
            setTimeout(() => processMessage(index), 150);
        });
        eventSource.on(event_types.GENERATION_ENDED, () => {
            const index = latestAssistantIndex();
            setTimeout(() => processMessage(index), 180);
        });
        eventSource.on(event_types.MESSAGE_EDITED, data => {
            const index = resolveMessageIndex(data);
            const message = getMessage(index);
            if (message && !message.is_user) setTimeout(() => processMessage(index, { force: true }), 100);
            renderSoon();
        });
        eventSource.on(event_types.MESSAGE_SWIPED, () => {
            const index = latestAssistantIndex();
            setTimeout(() => processMessage(index, { force: true }), 180);
            renderSoon();
        });
        eventSource.on(event_types.MESSAGE_DELETED, () => {
            if (pruneInvalidSummaries()) persistChat();
            renderSoon();
            scheduleLorebookSync('message deleted');
            refreshWorkspaceIfOpen();
        });
        eventSource.on(event_types.CHAT_CHANGED, () => {
            closeWorkspace();
            renderSoon();
            const bookInput = document.querySelector('#ma-settings [data-setting="lorebookName"]');
            if (bookInput) bookInput.value = chatMeta().lorebookName || settings().lorebookName || '';
            setTimeout(() => scheduleLorebookSync('chat changed'), 500);
        });
    }

    function init() {
        if (initialized || !ctx()) return;
        initialized = true;
        settings();
        createFloatingButton();
        createWorkspace();
        createSettingsPanel();
        installDelegatedHandlers();
        bindSillyTavernEvents();
        setTimeout(renderAllPanels, 300);
        setTimeout(() => scheduleLorebookSync('initial'), 1200);
        console.info(`[MirrorAbyss] v${VERSION} initialized`);
    }

    const boot = () => {
        if (window.SillyTavern?.getContext?.()) init();
        else setTimeout(boot, 250);
    };
    boot();
})();
