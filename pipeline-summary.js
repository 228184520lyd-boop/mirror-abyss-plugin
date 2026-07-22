/**
 * 模块职责：按 event_id 消费内部事实生成小总结，并仅消费未固化小总结生成大总结。
 * 维护边界：失败不破坏核心事实；同一事实和小总结不得重复消费。
 */
import { getSettings } from './core-context.js';
import { assertArtifactCommitCurrent, persistChatFor } from './core-commit-guard.js';
import { nowIso, safeText, toErrorMessage } from './core-utils.js';
import { markStage } from './domain-artifact.js';
import { markFactsConsumed, markFactsSolidified, pendingFactsByEvent } from './domain-internal-facts.js';
import { normalizeTableRegistry } from './domain-table-registry.js';
import { isEntryLifecycleHidden } from './domain-entry-lifecycle.js';
import { finalizeSummarySettlement } from './domain-memory-state-machine.js';
import { normalizeSummary } from './domain-summary.js';
import { generateTask } from './llm-generator.js';
import { largeSummaryPrompt, largeSummarySystemPrompt, smallSummaryBatchPrompt, smallSummarySystemPrompt } from './prompts-summary.js';
import { parseSummaryTextOutput } from './domain-summary-text.js';
import { getChatState, putArtifact, putChatState } from './storage-repository.js';
function eventClosed(facts) {
    if (!facts.length)
        return false;
    // 内部事实按首次出现顺序保存，更新时 updatedAt 前移。以最后一次事件状态信号为准：
    // 旧阶段已结束但后续阶段仍活跃时不能关闭；后续明确结果可以覆盖早期“胜负未定”等旧未决表述。
    const latest = facts.reduce((selected, fact, index) => {
        const selectedTime = Date.parse(selected.fact.updatedAt) || 0;
        const factTime = Date.parse(fact.updatedAt) || 0;
        return factTime > selectedTime || (factTime === selectedTime && index > selected.index) ? { fact, index } : selected;
    }, { fact: facts[0], index: 0 }).fact;
    const settled = !latest.active || /(结束|已解决|已关闭|完成|归档|closed|resolved|ended)/i.test(latest.status);
    return settled;
}
function entryToken(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s·•._—–\-|｜:：()（）【】\[\]]+/g, '');
}
function summaryMemoryText(summary) {
    const title = String(summary.title || '').trim();
    const body = String(summary.summary || '').trim();
    return title ? `【${title}】${body}` : body;
}
function rowEventIds(row) {
    return [...new Set([...(row.eventIds ?? []), String(row.eventId || '').trim()].filter(Boolean))];
}
/**
 * 总结不再把同一整段事件摘要复制到所有对象。事件条目只承接事件线摘要；
 * 其他对象只承接模型在 <MA_MEMORY> 中为该对象给出的短结果。
 */
export function applySummaryLayer(snapshot, eventId, facts, layer, addition, removals, registryValue) {
    const registry = normalizeTableRegistry(registryValue);
    const relatedTokens = new Set(facts.flatMap((fact) => fact.relatedEntities).map(entryToken).filter(Boolean));
    const eventTitleTokens = new Set(facts.map((fact) => entryToken(fact.title)).filter(Boolean));
    const factIds = new Set(facts.map((fact) => fact.factId).filter(Boolean));
    const next = structuredClone(snapshot);
    const removalEventTexts = new Set(removals.map(summaryMemoryText).filter(Boolean));
    const removalByObject = new Map();
    for (const previous of removals) {
        for (const memory of previous.distributions ?? []) {
            const key = entryToken(memory.objectName);
            if (!key)
                continue;
            const values = removalByObject.get(key) ?? new Set();
            values.add(String(memory.content || '').trim());
            removalByObject.set(key, values);
        }
    }
    const currentFactTextByObject = new Map();
    const eventNames = new Set();
    for (const fact of facts) {
        const title = String(fact.title || '').trim();
        const separator = title.lastIndexOf('·');
        const objectName = separator > 0 ? title.slice(0, separator).trim() : '';
        const layerLabel = separator > 0 ? title.slice(separator + 1).trim() : '';
        if (fact.type === 'events' && objectName)
            eventNames.add(objectName);
        if (!objectName || layerLabel !== '现行事实')
            continue;
        const key = entryToken(objectName);
        const values = currentFactTextByObject.get(key) ?? new Set();
        for (const value of [fact.content, ...fact.occurredFacts]) {
            const text = String(value || '').trim();
            if (text)
                values.add(text);
        }
        currentFactTextByObject.set(key, values);
    }
    const additionByObject = new Map();
    for (const memory of addition?.distributions ?? []) {
        const key = entryToken(memory.objectName);
        const content = String(memory.content || '').trim();
        if (!key || !content)
            continue;
        additionByObject.set(key, [...new Set([...(additionByObject.get(key) ?? []), content])]);
    }
    for (const table of registry) {
        for (const row of next[table.key] ?? []) {
            if (isEntryLifecycleHidden(row))
                continue;
            const rowTokens = [
                entryToken(row.id),
                entryToken(row.title),
                ...(row.keywords ?? []).map(entryToken),
                ...(row.recall?.any ?? []).map(entryToken),
            ].filter(Boolean);
            const linkedByEvent = rowEventIds(row).includes(eventId);
            const linkedByFact = (row.factIds ?? []).some((id) => factIds.has(id));
            const linkedByObject = rowTokens.some((token) => relatedTokens.has(token));
            const linkedEventRow = table.role === 'events' && rowTokens.some((token) => eventTitleTokens.has(token));
            if (!(linkedByEvent || linkedByFact || linkedByObject || linkedEventRow) || row.locked || row.lockMode === 'all')
                continue;
            const objectKey = entryToken(row.title);
            const removeTexts = table.role === 'events'
                ? removalEventTexts
                : (removalByObject.get(objectKey) ?? new Set());
            const addTexts = table.role === 'events'
                ? (addition ? [summaryMemoryText(addition)].filter(Boolean) : [])
                : (additionByObject.get(objectKey) ?? []);
            // 没有该对象自己的模块时，不把事件摘要兜底复制过来。
            if (!removeTexts.size && !addTexts.length)
                continue;
            row.fields ||= {};
            const current = Array.isArray(row.fields[layer])
                ? row.fields[layer].map((item) => String(item ?? '').trim()).filter(Boolean)
                : [];
            const values = [...new Set([...current.filter((item) => !removeTexts.has(item)), ...addTexts])].slice(-24);
            if (JSON.stringify(current) === JSON.stringify(values))
                continue;
            row.fields[layer] = values;
            // 对象自己的低精度承接写入后，移除已经被该总结覆盖的短期“现行事实”副本；当前状态、关系、能力和基础定义继续保留。
            if (table.role !== 'events' && !row.entryLifecycle && addTexts.length) {
                if (layer === 'recentHistory') {
                    const consumedTexts = new Set(currentFactTextByObject.get(objectKey) ?? []);
                    if (row.baseRevisionEvidence?.eventId === eventId)
                        consumedTexts.add(String(row.baseRevisionEvidence.statement || '').trim());
                    if (consumedTexts.size && Array.isArray(row.fields.currentFacts)) {
                        row.fields.currentFacts = row.fields.currentFacts
                            .map((item) => String(item ?? '').trim())
                            .filter((item) => item && !consumedTexts.has(item));
                    }
                }
                if (layer === 'solidifiedHistory') {
                    row.factIds = (row.factIds ?? []).filter((id) => !factIds.has(id));
                    row.eventIds = (row.eventIds ?? []).filter((id) => id !== eventId);
                    if (row.eventId === eventId)
                        row.eventId = row.eventIds[0];
                    if (Array.isArray(row.fields.relatedEvents) && eventNames.size) {
                        row.fields.relatedEvents = row.fields.relatedEvents
                            .map((item) => String(item ?? '').trim())
                            .filter((item) => item && !eventNames.has(item));
                    }
                }
            }
            row.updatedAt = nowIso();
        }
    }
    return next;
}
function pendingSmallEventGroups(facts, threshold, force) {
    const allByEvent = new Map();
    for (const fact of facts) {
        const list = allByEvent.get(fact.eventId) ?? [];
        list.push(fact);
        allByEvent.set(fact.eventId, list);
    }
    return [...pendingFactsByEvent(facts).entries()]
        .map(([eventId, eventFacts]) => ({
        eventId,
        facts: eventFacts,
        closed: eventClosed(allByEvent.get(eventId) ?? eventFacts),
        // 只统计上一次成功小总结之后进入当前窗口的消息。完整 sourceMessageIds 仍保留作历史来源，
        // 但不得再次触发阈值，否则同一事实更新后会从第一个达标回合起每轮重复总结。
        messages: new Set(eventFacts.flatMap((fact) => fact.pendingSourceMessageIds ?? fact.sourceMessageIds)).size,
    }))
        // 开放事件只按跨消息进度或明确结束触发；单回合返回很多事实不能被误判为完成了一段事件线。
        .filter((group) => force || group.closed || group.messages >= threshold)
        .sort((a, b) => Number(b.closed) - Number(a.closed) || b.facts.length - a.facts.length || a.eventId.localeCompare(b.eventId));
}
/** 兼容旧调用：仅返回每条事件线当前活动的小总结版本。 */
export function pendingSmallSummaries(small, large) {
    const consumed = new Set(large.flatMap((item) => item.sourceSummaryIds ?? item.sourceKeys));
    return small.filter((item) => !item.solidifiedByLargeSummaryId && !item.supersededBySmallSummaryId && !consumed.has(item.id));
}
function pendingLargeEventGroups(small, large, threshold, force) {
    const consumed = new Set(large.flatMap((item) => item.sourceSummaryIds ?? item.sourceKeys));
    const groups = new Map();
    for (const item of small) {
        if (item.solidifiedByLargeSummaryId || consumed.has(item.id))
            continue;
        // 缺 event_id 的旧数据按自身 ID 隔离，绝不因标题相似把不同事件混线。
        const eventId = String(item.eventId || item.id).trim();
        groups.set(eventId, [...(groups.get(eventId) ?? []), item]);
    }
    const minimum = Math.max(1, Math.round(Number(threshold) || 4));
    const output = [];
    for (const [eventId, items] of groups) {
        const ordered = items.map((item, index) => ({ item, index })).sort((a, b) => String(a.item.createdAt || '').localeCompare(String(b.item.createdAt || '')) || a.index - b.index).map(({ item }) => item);
        const latest = [...ordered].reverse().find((item) => !item.supersededBySmallSummaryId) ?? ordered.at(-1);
        const closed = latest.eventClosed === true;
        if (!force && !closed && ordered.length < minimum)
            continue;
        const previousLarge = [...large].reverse().find((item) => item.eventId === eventId || item.eventIds?.includes(eventId));
        output.push({
            eventId,
            items: ordered,
            latest,
            previousLarge,
            // 小总结新版本是累计版本；大总结只直接读取最新版本，但提交后要把整条旧版本链一起标记为已固化。
            sourceSummaryIds: [latest.id],
            consumedVersionIds: ordered.map((item) => item.id),
            sourceFactIds: [...new Set(latest.sourceFactIds ?? latest.sourceKeys)],
            closed,
        });
    }
    return output.sort((a, b) => Number(b.closed) - Number(a.closed)
        || b.items.length - a.items.length
        || a.eventId.localeCompare(b.eventId));
}
export function hasEligibleSmallSummary(facts, threshold) {
    return pendingSmallEventGroups(facts, Math.max(1, Math.round(Number(threshold) || 12)), false).length > 0;
}
export function hasEligibleLargeSummary(small, large, threshold) {
    return pendingLargeEventGroups(small, large, threshold, false).length > 0;
}
export async function generateSmallSummary(artifact, force = false) {
    const settings = getSettings();
    const chatState = await getChatState(artifact.chatKey);
    const threshold = Math.max(1, Math.round(Number(settings.smallSummaryTurns) || 12));
    // 尽量一次处理所有到期事件线；上限只防止极端输入重新撞上网关超时。
    const selected = pendingSmallEventGroups(chatState.internalFacts ?? [], threshold, force).slice(0, 8);
    if (!selected.length)
        return null;
    const prepared = selected.map((group) => ({
        ...group,
        previous: [...chatState.smallSummaries].reverse().find((item) => item.eventId === group.eventId && !item.solidifiedByLargeSummaryId && !item.supersededBySmallSummaryId),
    }));
    const slotted = prepared.map((group, index) => ({ ...group, slot: `S${index + 1}` }));
    const raw = await generateTask({
        task: 'smallSummary',
        systemPrompt: smallSummarySystemPrompt(settings.summaryPrompts.small, settings.contentLimits.smallSummary),
        prompt: smallSummaryBatchPrompt(slotted.map((group) => ({ slot: group.slot, eventId: group.eventId, facts: group.facts, previous: group.previous }))),
        maxTokens: Math.min(2200, 700 + prepared.length * 260),
        requestPurpose: 'fixed-text',
    });
    assertArtifactCommitCurrent(artifact);
    let bySlot;
    try {
        bySlot = parseSummaryTextOutput(raw, slotted.map((group) => group.slot));
    }
    catch (error) {
        const preview = safeText(raw, 1200).replace(/\s+/g, ' ').trim();
        throw new Error(`小总结未返回有效固定文本：${toErrorMessage(error)}${preview ? `；返回片段：${preview}` : ''}`, { cause: error });
    }
    const generated = slotted.map((group) => {
        const newFactIds = group.facts.map((fact) => fact.factId);
        const sourceFactIds = [...new Set([...(group.previous?.sourceFactIds ?? group.previous?.sourceKeys ?? []), ...newFactIds])];
        const text = bySlot.get(group.slot);
        const summary = normalizeSummary({ title: text.title, summary: text.summary, keywords: text.keywords, unresolved: text.unresolved }, 'small', sourceFactIds, undefined, { eventId: group.eventId, sourceFactIds });
        summary.distributions = text.distributions;
        summary.previousSmallSummaryId = group.previous?.id;
        summary.eventClosed = group.closed;
        if (!summary.summary)
            throw new Error(`小总结模型返回空摘要：${group.eventId}`);
        if (summary.summary.length > settings.contentLimits.smallSummary)
            throw new Error(`小总结超过白盒硬上限：${summary.summary.length}/${settings.contentLimits.smallSummary} 字（${group.eventId}）`);
        return { group, summary, newFactIds };
    });
    const previousSnapshot = artifact.snapshot ? structuredClone(artifact.snapshot) : undefined;
    const previousFacts = structuredClone(chatState.internalFacts);
    const previousSummaries = structuredClone(chatState.smallSummaries);
    try {
        chatState.smallSummaries.push(...generated.map((item) => item.summary));
        for (const { group, summary, newFactIds } of generated) {
            if (group.previous)
                group.previous.supersededBySmallSummaryId = summary.id;
            markFactsConsumed(chatState.internalFacts, newFactIds, summary.id);
        }
        if (artifact.snapshot) {
            let nextSnapshot = artifact.snapshot;
            for (const { group, summary, newFactIds } of generated) {
                nextSnapshot = applySummaryLayer(nextSnapshot, group.eventId, group.facts, 'recentHistory', summary, group.previous ? [group.previous] : [], settings.tableRegistry);
                const settlement = finalizeSummarySettlement({
                    snapshot: nextSnapshot,
                    eventId: group.eventId,
                    sourceFactIds: summary.sourceFactIds ?? [],
                    eventClosed: group.closed,
                    internalFacts: chatState.internalFacts,
                    coverageKind: 'small',
                    registry: settings.tableRegistry,
                    focusObjectId: chatState.focusObjectId,
                });
                nextSnapshot = settlement.snapshot;
                summary.sedimentation = {
                    removeRowIds: [],
                    characterActivityUpdates: [],
                    appliedRowIds: [...settlement.deletedRowIds],
                    ignoredRowIds: [...settlement.retainedRowIds],
                    notes: settlement.deletedRowIds.length
                        ? [`总结覆盖后由统一状态机物理删除：${settlement.deletedRowIds.join('、')}`]
                        : ['总结已写入覆盖标记；没有满足删除契约的待结算容器。'],
                };
            }
            artifact.snapshot = nextSnapshot;
            assertArtifactCommitCurrent(artifact);
            await persistChatFor(artifact.chatKey);
        }
        // 小总结是加工容器：同一事件只保留当前累计版本，旧版本在完成对象分发后退出。
        chatState.smallSummaries = chatState.smallSummaries.filter((item) => !item.supersededBySmallSummaryId);
        await putChatState(chatState);
    }
    catch (error) {
        artifact.snapshot = previousSnapshot;
        chatState.internalFacts = previousFacts;
        chatState.smallSummaries = previousSummaries;
        try {
            assertArtifactCommitCurrent(artifact);
            await persistChatFor(artifact.chatKey).catch(() => undefined);
        }
        catch {
            // 聊天或正文已变化，旧任务回滚不得接触新聊天。
        }
        throw error;
    }
    return generated.at(-1)?.summary ?? null;
}
export async function generateLargeSummary(artifact, force = false) {
    const settings = getSettings();
    const chatState = await getChatState(artifact.chatKey);
    const threshold = Math.max(1, Number(settings.largeSummaryCount) || 4);
    // 尽量一次处理所有到期事件线；设上限只用于防止极端输入重新撞上网关超时。
    const groups = pendingLargeEventGroups(chatState.smallSummaries, chatState.largeSummaries, threshold, force).slice(0, 8);
    if (!groups.length)
        return null;
    const slotted = groups.map((group, index) => ({ ...group, slot: `L${index + 1}` }));
    const raw = await generateTask({
        task: 'largeSummary',
        systemPrompt: largeSummarySystemPrompt(settings.summaryPrompts.large, settings.contentLimits.largeSummary),
        prompt: largeSummaryPrompt(slotted.map((group) => ({
            slot: group.slot,
            eventId: group.eventId,
            latestSmall: group.latest,
            sourceSummaryIds: group.sourceSummaryIds,
            previousLarge: group.previousLarge,
        }))),
        maxTokens: Math.min(2200, 700 + groups.length * 260),
        requestPurpose: 'fixed-text',
    });
    assertArtifactCommitCurrent(artifact);
    let bySlot;
    try {
        bySlot = parseSummaryTextOutput(raw, slotted.map((group) => group.slot));
    }
    catch (error) {
        const preview = safeText(raw, 1200).replace(/\s+/g, ' ').trim();
        throw new Error(`大总结未返回有效固定文本：${toErrorMessage(error)}${preview ? `；返回片段：${preview}` : ''}`, { cause: error });
    }
    const generated = slotted.map((group) => {
        const text = bySlot.get(group.slot);
        const value = { title: text.title, summary: text.summary, keywords: text.keywords, unresolved: text.unresolved };
        const summary = normalizeSummary(value, 'large', group.sourceSummaryIds, group.previousLarge?.id, {
            eventId: group.eventId,
            eventIds: [group.eventId],
            sourceSummaryIds: group.sourceSummaryIds,
            sourceFactIds: group.sourceFactIds,
        });
        summary.distributions = text.distributions;
        if (!summary.summary)
            throw new Error(`大总结模型返回空摘要：${group.eventId}`);
        if (summary.summary.length > settings.contentLimits.largeSummary)
            throw new Error(`大总结超过白盒硬上限：${summary.summary.length}/${settings.contentLimits.largeSummary} 字（${group.eventId}）`);
        return { group, summary };
    });
    const previousLargeList = structuredClone(chatState.largeSummaries);
    const previousSmall = structuredClone(chatState.smallSummaries);
    const previousFacts = structuredClone(chatState.internalFacts);
    const previousSnapshot = artifact.snapshot ? structuredClone(artifact.snapshot) : undefined;
    try {
        chatState.largeSummaries.push(...generated.map((item) => item.summary));
        for (const { group, summary } of generated) {
            const selectedIds = new Set(group.consumedVersionIds);
            for (const item of chatState.smallSummaries)
                if (selectedIds.has(item.id))
                    item.solidifiedByLargeSummaryId = summary.id;
            markFactsSolidified(chatState.internalFacts, group.sourceFactIds, summary.id);
        }
        if (artifact.snapshot) {
            let nextSnapshot = artifact.snapshot;
            for (const { group, summary } of generated) {
                const eventFacts = chatState.internalFacts.filter((fact) => fact.eventId === group.eventId);
                nextSnapshot = applySummaryLayer(nextSnapshot, group.eventId, eventFacts, 'recentHistory', undefined, group.items, settings.tableRegistry);
                nextSnapshot = applySummaryLayer(nextSnapshot, group.eventId, eventFacts, 'solidifiedHistory', summary, group.previousLarge ? [group.previousLarge] : [], settings.tableRegistry);
                const settlement = finalizeSummarySettlement({
                    snapshot: nextSnapshot,
                    eventId: group.eventId,
                    sourceFactIds: summary.sourceFactIds ?? [],
                    eventClosed: eventClosed(eventFacts),
                    internalFacts: chatState.internalFacts,
                    coverageKind: 'large',
                    registry: settings.tableRegistry,
                    focusObjectId: chatState.focusObjectId,
                });
                nextSnapshot = settlement.snapshot;
                summary.sedimentation = {
                    removeRowIds: [],
                    characterActivityUpdates: [],
                    appliedRowIds: [...settlement.deletedRowIds],
                    ignoredRowIds: [...settlement.retainedRowIds],
                    notes: settlement.deletedRowIds.length
                        ? [`大总结覆盖后由统一状态机物理删除：${settlement.deletedRowIds.join('、')}`]
                        : ['大总结已固化；没有满足删除契约的待结算容器。'],
                };
            }
            artifact.snapshot = nextSnapshot;
            assertArtifactCommitCurrent(artifact);
            await persistChatFor(artifact.chatKey);
        }
        // 大总结完成固化后，已消费的小总结不再作为独立条目保留。
        const consumedSmallIds = new Set(generated.flatMap(({ group }) => group.consumedVersionIds));
        chatState.smallSummaries = chatState.smallSummaries.filter((item) => !consumedSmallIds.has(item.id));
        // 大总结同样只是加工容器：开放事件保留当前累计版本；关闭事件已分发到长期宿主后移除正文容器。
        const closedEventIds = new Set(generated.filter((item) => item.group.closed).map((item) => item.group.eventId));
        const supersededLargeIds = new Set(generated.map((item) => item.summary.previousLargeSummaryId).filter(Boolean));
        chatState.largeSummaries = chatState.largeSummaries.filter((item) => {
            if (supersededLargeIds.has(item.id))
                return false;
            if (closedEventIds.has(String(item.eventId || '')))
                return false;
            return true;
        });
        await putChatState(chatState);
        const readBack = await getChatState(artifact.chatKey);
        const retainedGeneratedIds = new Set(generated
            .filter((item) => !item.group.closed)
            .map((item) => item.summary.id));
        if (![...retainedGeneratedIds].every((id) => readBack.largeSummaries.some((item) => item.id === id))) {
            throw new Error('开放事件大总结写入后回读校验失败');
        }
    }
    catch (error) {
        artifact.snapshot = previousSnapshot;
        chatState.largeSummaries = previousLargeList;
        chatState.smallSummaries = previousSmall;
        chatState.internalFacts = previousFacts;
        if (previousSnapshot) {
            try {
                assertArtifactCommitCurrent(artifact);
                await persistChatFor(artifact.chatKey).catch(() => undefined);
            }
            catch {
                // 聊天或正文已变化，旧总结回滚不得接触新聊天。
            }
        }
        throw error;
    }
    return generated.at(-1)?.summary ?? null;
}
export async function runSummaryStage(artifact, kind, force = false) {
    const settings = getSettings();
    const enabled = kind === 'small' ? settings.autoSmallSummary : settings.autoLargeSummary;
    if (!enabled && !force)
        return false;
    const previousStatus = artifact.stages.summary.status;
    const preserveEarlierFailure = !force && previousStatus === 'failed';
    if (!preserveEarlierFailure)
        markStage(artifact, 'summary', 'running');
    await putArtifact(artifact);
    try {
        const generated = kind === 'small'
            ? await generateSmallSummary(artifact, force)
            : await generateLargeSummary(artifact, force);
        if (!preserveEarlierFailure)
            markStage(artifact, 'summary', generated || previousStatus === 'success' ? 'success' : 'skipped');
        await putArtifact(artifact);
        return Boolean(generated);
    }
    catch (error) {
        if (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name)) {
            if (!preserveEarlierFailure)
                markStage(artifact, 'summary', 'cancelled', toErrorMessage(error));
            await putArtifact(artifact);
            throw error;
        }
        const label = kind === 'small' ? '小总结' : '大总结';
        const previous = artifact.stages.summary.error;
        const current = `${label}失败：${toErrorMessage(error)}`;
        markStage(artifact, 'summary', 'failed', previous && previous !== current ? `${previous}；${current}` : current);
        await putArtifact(artifact);
        throw error;
    }
}
export async function maybeRunSummaries(artifact, forceSmall = false, forceLarge = false) {
    const errors = [];
    try {
        await runSummaryStage(artifact, 'small', forceSmall);
    }
    catch (error) {
        if (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name))
            throw error;
        errors.push(`小总结：${toErrorMessage(error)}`);
    }
    try {
        await runSummaryStage(artifact, 'large', forceLarge);
    }
    catch (error) {
        if (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name))
            throw error;
        errors.push(`大总结：${toErrorMessage(error)}`);
    }
    if (errors.length) {
        const combined = errors.join('；');
        markStage(artifact, 'summary', 'failed', combined);
        await putArtifact(artifact);
        throw new Error(combined);
    }
}
/** 历史恢复专用：不 force，只把当前确实达到条件的受影响事件线与未固化小总结排空。 */
export async function rebuildEligibleSummaries(artifact) {
    const settings = getSettings();
    const errors = [];
    let generatedAny = false;
    const previousStatus = artifact.stages.summary.status;
    markStage(artifact, 'summary', 'running');
    await putArtifact(artifact);
    if (settings.autoSmallSummary) {
        try {
            while (await generateSmallSummary(artifact, false)) {
                generatedAny = true;
                // 每次成功至少消费一个 event_id 的待总结事实，循环必然收敛。
            }
        }
        catch (error) {
            if (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name))
                throw error;
            errors.push(`小总结：${toErrorMessage(error)}`);
        }
    }
    if (settings.autoLargeSummary) {
        try {
            while (await generateLargeSummary(artifact, false)) {
                generatedAny = true;
                // 每次成功固化一批未固化小总结，剩余不足阈值时停止。
            }
        }
        catch (error) {
            if (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name))
                throw error;
            errors.push(`大总结：${toErrorMessage(error)}`);
        }
    }
    if (errors.length) {
        markStage(artifact, 'summary', 'failed', errors.join('；'));
        await putArtifact(artifact);
        throw new Error(errors.join('；'));
    }
    markStage(artifact, 'summary', generatedAny || previousStatus === 'success'
        ? 'success'
        : 'skipped');
    await putArtifact(artifact);
}
