/**
 * 模块职责：调用状态模型并把内部事实包与动态可见表格合并为下一快照。
 * 维护边界：模型只更新启用表格；停用表格保留隐藏旧视图；人工/锁定行必须恢复。
 */
import { assertArtifactCommitCurrent, CommitRejectedError } from './core-commit-guard.js';
import { getChat, getSettings } from './core-context.js';
import { hashText, safeText, toErrorMessage } from './core-utils.js';
import { markStage } from './domain-artifact.js';
import { normalizeFactPackage } from './domain-facts.js';
import { canonicalObjectTitle } from './domain-object-identity.js';
import { enabledTables, migrateSnapshotTables, normalizeTableRegistry, registryFingerprint } from './domain-table-registry.js';
import { emptySnapshot, normalizeSnapshot } from './domain-snapshot.js';
import { transitionStateSnapshot } from './domain-memory-state-machine.js';
import { dedupeStrongStateRows, parseStateTextOutput } from './domain-state-text.js';
import { generateTask } from './llm-generator.js';
import { stateSystemPrompt, stateUserPrompt } from './prompts-state.js';
import { getChatState, putArtifact } from './storage-repository.js';
class RegistryChangedError extends CommitRejectedError {
}
const FACT_OPERATIONS = new Set(['create', 'update', 'append', 'close', 'supersede']);
const FACT_CONFIDENCE = new Set(['confirmed', 'recorded', 'reported', 'uncertain']);
/** 固定文本解析后再检查镜渊业务身份约束。 */
function assertStateBusinessShape(parsed, active) {
    const factIds = new Set();
    parsed.facts.forEach((fact, index) => {
        if (!fact || typeof fact !== 'object' || Array.isArray(fact))
            throw new Error(`facts[${index}] 必须是对象`);
        const source = fact;
        const factId = String(source.fact_id ?? source.factId ?? source.id ?? '').trim();
        const eventId = String(source.event_id ?? source.eventId ?? source.entity_id ?? source.entityId ?? '').trim();
        const title = String(source.title ?? '').trim();
        if (!factId)
            throw new Error(`facts[${index}].fact_id 不能为空`);
        if (!eventId)
            throw new Error(`facts[${index}].event_id 不能为空`);
        if (!title)
            throw new Error(`facts[${index}].title 不能为空`);
        if (factIds.has(factId))
            throw new Error(`同一次状态返回包含重复 fact_id：${factId}`);
        factIds.add(factId);
        if (source.operation !== undefined && !FACT_OPERATIONS.has(String(source.operation)))
            throw new Error(`facts[${index}].operation 不合法`);
        if (source.confidence !== undefined && !FACT_CONFIDENCE.has(String(source.confidence)))
            throw new Error(`facts[${index}].confidence 不合法`);
    });
    for (const table of active) {
        const rows = parsed.snapshot[table.key];
        if (rows === undefined)
            continue;
        if (!Array.isArray(rows))
            throw new Error(`状态表 ${table.key} 必须是数组`);
        const ids = new Set();
        const titles = new Set();
        rows.forEach((row, index) => {
            if (!row || typeof row !== 'object' || Array.isArray(row))
                throw new Error(`状态表 ${table.key}[${index}] 必须是对象`);
            const source = row;
            const id = String(source.id ?? '').trim();
            const title = String(source.title ?? '').trim();
            if (!id)
                throw new Error(`状态表 ${table.key}[${index}].id 不能为空`);
            if (!title)
                throw new Error(`状态表 ${table.key}[${index}].title 不能为空`);
            if (ids.has(id))
                throw new Error(`状态表 ${table.key} 同一次返回包含重复 id：${id}`);
            const titleToken = canonicalObjectTitle(title);
            if (titleToken && titles.has(titleToken))
                throw new Error(`状态表 ${table.key} 同一次返回包含重复对象：${title}`);
            ids.add(id);
            if (titleToken)
                titles.add(titleToken);
        });
    }
}
export function previousSnapshot(beforeIndex) {
    const registry = getSettings().tableRegistry;
    const chat = getChat();
    for (let i = beforeIndex - 1; i >= 0; i -= 1) {
        if (chat[i]?.is_user)
            continue;
        const snapshot = chat[i]?.extra?.mirrorAbyssV11?.snapshot;
        if (snapshot)
            return normalizeSnapshot(snapshot, snapshot, registry);
        const legacy = chat[i]?.extra?.mirrorAbyss?.tableSnapshot;
        if (legacy)
            return normalizeSnapshot(legacy, legacy, registry);
    }
    return emptySnapshot(registry);
}
export { preserveProtectedRows } from './domain-memory-state-machine.js';
function normalizedTitle(value) {
    return canonicalObjectTitle(value);
}
function normalizedComparableText(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/[。．.！!？?；;，,、：:]$/u, '')
        .trim();
}
function normalizedComparableList(value) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map(normalizedComparableText).filter(Boolean))].sort();
}
function normalizedComparableObject(value) {
    if (Array.isArray(value))
        return value.map(normalizedComparableObject);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, normalizedComparableObject(item)]));
    }
    return normalizedComparableText(value);
}
function sameComparableValue(left, right) {
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right))
            return false;
        const a = normalizedComparableList(left);
        const b = normalizedComparableList(right);
        return a.length === b.length && a.every((value, index) => value === b[index]);
    }
    const leftObject = left && typeof left === 'object';
    const rightObject = right && typeof right === 'object';
    if (leftObject || rightObject) {
        if (!leftObject || !rightObject)
            return false;
        return JSON.stringify(normalizedComparableObject(left)) === JSON.stringify(normalizedComparableObject(right));
    }
    return normalizedComparableText(left) === normalizedComparableText(right);
}
/**
 * 模型返回的是候选修订。若只是空白、末尾标点或数组顺序变化，继续沿用旧值，
 * 避免无剧情变化时产生快照抖动；真正内容变化仍完整接受，不限制变化幅度。
 */
function preserveEquivalentPatchValues(existing, source) {
    const output = { ...source };
    if ('content' in output && sameComparableValue(existing.content, output.content))
        output.content = existing.content;
    if ('status' in output && sameComparableValue(existing.status, output.status))
        output.status = existing.status;
    if ('keywords' in output && sameComparableValue(existing.keywords, output.keywords))
        output.keywords = structuredClone(existing.keywords);
    if (output.fields && typeof output.fields === 'object' && !Array.isArray(output.fields)) {
        const nextFields = { ...output.fields };
        for (const [key, value] of Object.entries(nextFields)) {
            const oldValue = existing.fields?.[key];
            if (sameComparableValue(oldValue, value))
                nextFields[key] = structuredClone(oldValue);
        }
        output.fields = nextFields;
    }
    if ('lifecycle' in output && sameComparableValue(existing.lifecycle, output.lifecycle))
        output.lifecycle = structuredClone(existing.lifecycle);
    return output;
}
/**
 * V35 行级补丁合并：非空数组只 upsert 返回行，未返回行和空数组都保留旧表。
 * 自动状态提取不再用 [] 承担高风险清表语义；未来清表必须走独立显式操作。
 * 旧模型若仍返回完整表，也会按同一规则逐行覆盖，不产生重复。
 */
export function mergeStateRowPatches(previous, parsedSnapshot, registry) {
    const merged = {};
    for (const table of registry)
        merged[table.key] = structuredClone(previous[table.key] ?? []);
    for (const table of enabledTables(registry)) {
        if (!Object.prototype.hasOwnProperty.call(parsedSnapshot, table.key))
            continue;
        const patches = parsedSnapshot[table.key];
        if (!Array.isArray(patches))
            continue;
        if (patches.length === 0)
            continue;
        const rows = structuredClone(previous[table.key] ?? []);
        const idIndex = new Map(rows.map((row, index) => [row.id, index]));
        const titleIndexes = new Map();
        rows.forEach((row, index) => {
            const title = normalizedTitle(row.title);
            if (title)
                titleIndexes.set(title, [...(titleIndexes.get(title) ?? []), index]);
        });
        const patchTitleCounts = new Map();
        for (const patch of patches) {
            const title = normalizedTitle(patch?.title);
            if (title)
                patchTitleCounts.set(title, (patchTitleCounts.get(title) ?? 0) + 1);
        }
        for (const patch of patches) {
            if (!patch || typeof patch !== 'object')
                continue;
            const id = String(patch.id ?? '').trim();
            const title = normalizedTitle(patch.title);
            const uniqueTitleIndex = title
                && patchTitleCounts.get(title) === 1
                && (titleIndexes.get(title)?.length ?? 0) === 1
                ? titleIndexes.get(title)?.[0]
                : undefined;
            const index = (id && idIndex.get(id) !== undefined) ? idIndex.get(id) : uniqueTitleIndex;
            if (index === undefined) {
                rows.push(patch);
                if (id)
                    idIndex.set(id, rows.length - 1);
                if (title)
                    titleIndexes.set(title, [...(titleIndexes.get(title) ?? []), rows.length - 1]);
            }
            else {
                const existing = rows[index];
                const source = preserveEquivalentPatchValues(existing, patch);
                rows[index] = {
                    ...existing,
                    ...source,
                    // 标题唯一命中时必须继续沿用旧稳定 ID；模型补丁不能借机分裂同一对象。
                    id: existing.id,
                    fields: {
                        ...(existing.fields ?? {}),
                        ...(source.fields && typeof source.fields === 'object' ? source.fields : {}),
                    },
                };
                idIndex.set(existing.id, index);
            }
        }
        merged[table.key] = rows;
    }
    return normalizeSnapshot(merged, previous, registry);
}
/**
 * 模型通过 kind 明确纠正自动条目的语义归属时，先从旧表移除同一稳定 ID，
 * 再由正常行级补丁写入目标表。人工基础保护和完全锁定条目不允许自动搬迁。
 */
export function applyStateRowRelocations(previous, rawRelocations, registry) {
    if (!Array.isArray(rawRelocations) || !rawRelocations.length)
        return previous;
    const next = structuredClone(previous);
    const tableKeys = new Set(registry.map((table) => table.key));
    for (const raw of rawRelocations) {
        if (!raw || typeof raw !== 'object')
            continue;
        const move = raw;
        const id = String(move.id ?? '').trim();
        const fromTable = String(move.fromTable ?? '').trim();
        const toTable = String(move.toTable ?? '').trim();
        if (!id || !fromTable || !toTable || fromTable === toTable)
            continue;
        if (!tableKeys.has(fromTable) || !tableKeys.has(toTable))
            continue;
        const sourceRows = next[fromTable] ?? [];
        const source = sourceRows.find((row) => row.id === id);
        if (!source)
            continue;
        if (source.source === 'manual' || source.locked || source.lockMode === 'all' || source.lockMode === 'base')
            continue;
        next[fromTable] = sourceRows.filter((row) => row.id !== id);
    }
    return normalizeSnapshot(next, previous, registry);
}
function identityToken(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s·•._—–\-|｜:：()（）【】\[\]]+/g, '');
}
function textList(value) {
    return Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : [];
}
/**
 * facts 是事件线真相来源；行只输出内容补丁。这里在本地把同一轮多事件线重新挂回受影响对象，
 * 避免模型为每一行重复 factIds/eventIds/recall，降低输出体积并防止两条线互相覆盖。
 */
export function attachLocalFactMetadata(parsedSnapshot, rawFacts, registry) {
    const facts = rawFacts.filter((item) => item && typeof item === 'object').map((item) => item);
    for (const table of enabledTables(registry)) {
        const patches = parsedSnapshot[table.key];
        if (!Array.isArray(patches))
            continue;
        for (const rawPatch of patches) {
            if (!rawPatch || typeof rawPatch !== 'object')
                continue;
            const patch = rawPatch;
            const title = String(patch.title ?? '').trim();
            const id = String(patch.id ?? '').trim();
            const rowTokens = new Set([title, id].map(identityToken).filter(Boolean));
            let matched = facts.filter((fact) => {
                const related = textList(fact.related_entities ?? fact.relatedEntities).map(identityToken).filter(Boolean);
                if (related.some((token) => rowTokens.has(token)))
                    return true;
                if (table.role === 'events' && identityToken(fact.title) === identityToken(title))
                    return true;
                return false;
            });
            // 单事件轮次允许安全回退；多事件轮次绝不凭模糊关键词把无关线挂到一起。
            if (!matched.length && facts.length === 1)
                matched = facts;
            const factIds = [...new Set([
                    ...textList(patch.factIds ?? patch.fact_ids),
                    ...matched.map((fact) => String(fact.fact_id ?? fact.factId ?? '').trim()).filter(Boolean),
                ])];
            const eventIds = [...new Set([
                    ...textList(patch.eventIds ?? patch.event_ids),
                    String(patch.eventId ?? patch.event_id ?? '').trim(),
                    ...matched.map((fact) => String(fact.event_id ?? fact.eventId ?? '').trim()).filter(Boolean),
                ].filter(Boolean))];
            patch.factIds = factIds;
            patch.eventIds = eventIds;
            patch.eventId = eventIds[0] ?? '';
            if (!patch.recall || typeof patch.recall !== 'object') {
                const keywords = textList(patch.keywords);
                patch.recall = { any: [...new Set([title, ...keywords].filter(Boolean))], all: [], exclude: [] };
            }
            const hasRelatedEvents = table.fields.some((field) => field.key === 'relatedEvents');
            if (hasRelatedEvents && eventIds.length) {
                patch.relatedEvents = [...new Set([...textList(patch.relatedEvents), ...eventIds])];
            }
        }
    }
    return parsedSnapshot;
}
function assertRegistryCurrent(expectedFingerprint) {
    const current = enabledTables(normalizeTableRegistry(getSettings().tableRegistry));
    if (registryFingerprint(current) !== expectedFingerprint) {
        throw new RegistryChangedError('表格定义已变化，旧状态结果不再提交');
    }
}
function splitStateSource(text, limit) {
    const max = Math.max(800, Math.round(limit));
    const paragraphs = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    const chunks = [];
    let current = '';
    const push = (value) => {
        const cleaned = value.trim();
        if (cleaned)
            chunks.push(cleaned);
    };
    const append = (piece) => {
        if (!piece)
            return;
        if (!current) {
            current = piece;
            return;
        }
        if (current.length + piece.length + 2 <= max)
            current += `\n\n${piece}`;
        else {
            push(current);
            current = piece;
        }
    };
    for (const paragraph of paragraphs.length ? paragraphs : [String(text || '')]) {
        if (paragraph.length <= max) {
            append(paragraph);
            continue;
        }
        const sentences = paragraph.split(/(?<=[。！？!?；;])\s*/u).map((item) => item.trim()).filter(Boolean);
        for (const sentence of sentences.length ? sentences : [paragraph]) {
            if (sentence.length <= max) {
                append(sentence);
                continue;
            }
            if (current) {
                push(current);
                current = '';
            }
            for (let offset = 0; offset < sentence.length; offset += max)
                push(sentence.slice(offset, offset + max));
        }
    }
    push(current);
    return chunks.length ? chunks : [''];
}
function minimalStateChunkPrompt(playerText, assistantChunk, index, total) {
    return `【玩家输入】\n${playerText || '（空）'}\n\n【本轮正文分段 ${index + 1}/${total}】\n${assistantChunk}\n\n只提取这一分段点名并明确建立的变化。只返回 <MA_TURN> 与按需出现的 <MA_EVENT>。对象模块第一行写对象名，后续直接写该对象的变化，不重复对象名；正文未提就不生成，不补齐类型。<MA_CORE> 可省略，只用于无法归给单一对象且不与对象结果重叠的过程。`;
}
function retryableStateTransportError(error) {
    return /(504|502|503|gateway|timeout|timed out|超时|网关|no message generated|返回为空|响应未完成|upstream)/i.test(toErrorMessage(error));
}
/** 只修复标签、块和必填语义项等传输格式问题；表格/语义层权限与对象歧义属于语义校验，必须原样失败。 */
function repairableStateParseError(error) {
    const message = toErrorMessage(error);
    return !/(未注册|已停用|无法确定对象表|存在歧义|多个条目命中|不允许写入|不允许直接维护|未知生命周期|只能用于已有对象|absorb 必须|merge_)/i.test(message);
}
function compactStateRepairSystemPrompt() {
    return `你是固定文本整理器，不分析剧情、不补充事实。把输入中已经写出的内容整理成镜渊自然事实模块。
只允许 <MA_TURN> 和 <MA_EVENT>。删除块外说明、JSON 外壳、代码围栏、等号键值和思考文字。
<MA_EVENT> 第一行是事件名，第二行只能是“进行中”或“已结束”。对象模块第一行写对象名，后续直接写该对象的变化，不重复对象名。<MA_CORE> 可省略，仅保留原文已有、无法归给单一对象且不与对象结果重叠的过程。不同模块不得概括、包含或换词复述；原始返回没有表达的事实不得添加。`;
}
function compactStateRepairPrompt(raw) {
    return `【待整理的模型原始返回】\n${safeText(raw, 18000)}\n\n只做格式整理。原始返回没有表达的事实不得添加。`;
}
async function repairStateText(raw, previous, registry, activeFacts, maxTokens, origin) {
    const repaired = await generateTask({
        task: 'state',
        systemPrompt: compactStateRepairSystemPrompt(),
        prompt: compactStateRepairPrompt(raw),
        maxTokens: Math.min(Math.max(768, maxTokens), 1536),
        requestPurpose: 'fixed-text',
        requestOrigin: origin,
    });
    parseStateTextOutput(repaired, previous, registry, activeFacts);
    return repaired;
}
async function generateValidatedStateText(request, previous, registry, activeFacts, repairOrigin) {
    const raw = await generateTask(request);
    try {
        parseStateTextOutput(raw, previous, registry, activeFacts);
        return raw;
    }
    catch (parseError) {
        if (!repairableStateParseError(parseError))
            throw parseError;
        try {
            return await repairStateText(raw, previous, registry, activeFacts, Number(request.maxTokens) || 1536, repairOrigin);
        }
        catch (repairError) {
            throw new Error(`状态返回格式整理失败：${toErrorMessage(parseError)}；整理重试：${toErrorMessage(repairError)}`, { cause: repairError });
        }
    }
}
async function requestStateText(artifact, previous, activeFacts, registry, systemPrompt, settings) {
    const fullPrompt = stateUserPrompt(previous, artifact.playerText, artifact.assistantText, registry, activeFacts);
    const budget = Math.max(6000, settings.stateContextChars);
    const initialRequest = {
        task: 'state',
        systemPrompt,
        prompt: fullPrompt,
        maxTokens: settings.stateOutputTokens,
        requestPurpose: 'fixed-text',
        requestOrigin: 'state-primary',
    };
    let initialError;
    if (systemPrompt.length + fullPrompt.length <= budget) {
        try {
            return await generateValidatedStateText(initialRequest, previous, registry, activeFacts, 'state-format-repair');
        }
        catch (error) {
            initialError = error;
            if (!retryableStateTransportError(error) && !repairableStateParseError(error))
                throw error;
            if (!retryableStateTransportError(error) && !/格式整理失败|固定文本|MA_EVENT|MA_TURN/i.test(toErrorMessage(error)))
                throw error;
        }
    }
    const reserve = Math.max(2200, budget - systemPrompt.length - 1800);
    let chunkLimit = Math.max(800, Math.min(settings.stateChunkChars, reserve));
    let chunks = splitStateSource(artifact.assistantText, chunkLimit);
    if (chunks.length > 12) {
        chunkLimit = Math.max(chunkLimit, Math.ceil(String(artifact.assistantText || '').length / 12));
        chunks = splitStateSource(artifact.assistantText, chunkLimit);
    }
    const outputs = [];
    for (let index = 0; index < chunks.length; index += 1) {
        let prompt = initialError
            ? minimalStateChunkPrompt(artifact.playerText, chunks[index], index, chunks.length)
            : stateUserPrompt(previous, artifact.playerText, chunks[index], registry, activeFacts, false);
        if (systemPrompt.length + prompt.length > budget)
            prompt = minimalStateChunkPrompt(artifact.playerText, chunks[index], index, chunks.length);
        outputs.push(await generateValidatedStateText({
            task: 'state',
            systemPrompt,
            prompt,
            maxTokens: Math.min(settings.stateOutputTokens, 2304),
            requestPurpose: 'fixed-text',
            requestOrigin: `state-chunk-${index + 1}-of-${chunks.length}`,
        }, previous, registry, activeFacts, `state-chunk-format-repair-${index + 1}-of-${chunks.length}`));
    }
    const combined = outputs.join('\n');
    parseStateTextOutput(combined, previous, registry, activeFacts);
    return combined;
}
/** 状态任务一次产出内部事实变更和动态快照，成功后由主流水线提交核心结果。 */
export async function runStateExtraction(artifact, force = false) {
    const settings = getSettings();
    const registry = normalizeTableRegistry(settings.tableRegistry);
    const active = enabledTables(registry);
    const expectedRegistryFingerprint = registryFingerprint(active);
    const previous = dedupeStrongStateRows(previousSnapshot(artifact.messageIndex), registry);
    const chatState = await getChatState(artifact.chatKey);
    const activeFacts = (chatState.internalFacts ?? [])
        .filter((fact) => fact.active || !fact.consumedBySmallSummaryId)
        .slice(-120);
    const systemPrompt = stateSystemPrompt(registry, settings.statePrompts, settings.contentLimits);
    const prompt = stateUserPrompt(previous, artifact.playerText, artifact.assistantText, registry, activeFacts);
    const inputFingerprint = hashText(JSON.stringify({
        systemPrompt,
        prompt,
        stateContextChars: settings.stateContextChars,
        stateOutputTokens: settings.stateOutputTokens,
        stateChunkChars: settings.stateChunkChars,
    }));
    assertRegistryCurrent(expectedRegistryFingerprint);
    if (!force && artifact.stages.state.status === 'success' && artifact.snapshot && artifact.stateInputFingerprint === inputFingerprint) {
        return normalizeSnapshot(artifact.snapshot, artifact.snapshot, registry);
    }
    markStage(artifact, 'state', 'running');
    await putArtifact(artifact);
    try {
        const raw = await requestStateText(artifact, previous, activeFacts, registry, systemPrompt, settings);
        let parsed;
        try {
            parsed = parseStateTextOutput(raw, previous, registry, activeFacts);
        }
        catch (error) {
            const preview = safeText(raw, 1200).replace(/\s+/g, ' ').trim();
            throw new Error(`状态表固定文本无法解析：${toErrorMessage(error)}${preview ? `；返回片段：${preview}` : ''}`, { cause: error });
        }
        if (typeof parsed.turnSummary !== 'string')
            throw new Error('状态返回缺少 turnSummary 字符串');
        if (!Array.isArray(parsed.facts))
            throw new Error('状态返回缺少 facts 数组');
        if (!parsed.snapshot || typeof parsed.snapshot !== 'object' || Array.isArray(parsed.snapshot))
            throw new Error('状态返回缺少 snapshot 根对象');
        // 兼容旧模型返回 state/characters；只迁移到当前注册的角色视图，其他未注册键仍拒绝。
        const characterTable = active.find((table) => table.role === 'characters' || table.role === 'state');
        if (characterTable) {
            if (Array.isArray(parsed.snapshot.state) && !Array.isArray(parsed.snapshot[characterTable.key]))
                parsed.snapshot[characterTable.key] = parsed.snapshot.state;
            if (Array.isArray(parsed.snapshot.characters) && !Array.isArray(parsed.snapshot[characterTable.key]))
                parsed.snapshot[characterTable.key] = parsed.snapshot.characters;
            if (characterTable.key !== 'state')
                delete parsed.snapshot.state;
            if (characterTable.key !== 'characters')
                delete parsed.snapshot.characters;
        }
        const returnedKeys = Object.keys(parsed.snapshot);
        const activeKeys = new Set(active.map((table) => table.key));
        const legacyViewKeys = new Set(['focus', 'state', 'characters', 'skills', 'relationships']);
        for (const key of returnedKeys)
            if (!activeKeys.has(key) && !legacyViewKeys.has(key))
                throw new Error(`模型返回未注册或已停用表格：${key}`);
        parsed.snapshot = attachLocalFactMetadata(migrateSnapshotTables(parsed.snapshot, registry), parsed.facts, registry);
        for (const [key, value] of Object.entries(parsed.snapshot)) {
            if (activeKeys.has(key) && !Array.isArray(value))
                throw new Error(`状态表 ${key} 必须是数组`);
        }
        assertStateBusinessShape(parsed, active);
        assertArtifactCommitCurrent(artifact);
        assertRegistryCurrent(expectedRegistryFingerprint);
        const routedPrevious = applyStateRowRelocations(previous, parsed.relocations, registry);
        const mergedViews = mergeStateRowPatches(routedPrevious, parsed.snapshot, registry);
        const transition = transitionStateSnapshot({
            previous: routedPrevious,
            incoming: mergedViews,
            patchSnapshot: parsed.snapshot,
            facts: parsed.facts,
            internalFacts: chatState.internalFacts,
            registry,
            focusObjectId: chatState.focusObjectId,
        });
        const normalized = transition.snapshot;
        artifact.factPackage = normalizeFactPackage(parsed, artifact.messageKey);
        artifact.snapshot = normalized;
        artifact.stateInputFingerprint = inputFingerprint;
        markStage(artifact, 'state', 'success');
        await putArtifact(artifact);
        return normalized;
    }
    catch (error) {
        if (error instanceof RegistryChangedError) {
            markStage(artifact, 'state', 'idle');
            await putArtifact(artifact);
            throw error;
        }
        if (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name)) {
            markStage(artifact, 'state', 'cancelled', toErrorMessage(error));
            await putArtifact(artifact);
            throw error;
        }
        markStage(artifact, 'state', 'failed', toErrorMessage(error));
        await putArtifact(artifact);
        throw error;
    }
}
