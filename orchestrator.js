/**
 * Runtime V2 turn orchestrator.
 *
 * One committed assistant turn advances authoritative machines once, writes an
 * immutable journal record, schedules at most one summary kind and creates a
 * durable lorebook publication intent.
 */
import { hashText, nowIso, safeText } from '../core/utils.js';
import { tableByRole } from '../domain/table-registry.js';
import { normalizeRuntimeV2 } from './state.js';

const TERMINAL_RE = /(已完成|完成|已结束|结束|已关闭|关闭|已离开|离开场景|已中止|中止|已解决|resolved|completed|closed|ended|aborted|archived)/i;
const ACTIVE_RE = /(进行中|正在|当前|active|ongoing|pending|等待|候场|处理中)/i;

function text(value, limit = 1200) {
    return safeText(value, limit).trim();
}

function list(value) {
    return Array.isArray(value) ? value.map((item) => text(item, 500)).filter(Boolean) : [];
}

function rowText(row) {
    const fields = row?.fields ?? {};
    return [
        row?.title,
        row?.status,
        row?.content,
        fields.baseContent,
        ...list(fields.currentFacts),
        ...list(fields.currentStates),
        ...list(fields.relatedEvents),
    ].map((item) => text(item, 1000)).filter(Boolean).join('；');
}

function normalizedToken(value) {
    return text(value, 500).normalize('NFKC').toLowerCase().replace(/[\s，。；、：:｜|—–-]+/g, '');
}

function labeledValue(source, labels) {
    for (const label of labels) {
        const regex = new RegExp(`(?:^|[\\n；。])\\s*${label}\\s*[：:]\\s*([^\\n；。]+)`, 'i');
        const matched = source.match(regex);
        if (matched?.[1])
            return text(matched[1], 500);
    }
    return '';
}

function latestRows(snapshot, registry, role) {
    const table = tableByRole(registry, role, false);
    return table ? snapshot?.[table.key] ?? [] : [];
}

function activeRow(rows) {
    return rows.filter((row) => !TERMINAL_RE.test(rowText(row))).at(-1) ?? rows.at(-1);
}

function eventIds(row) {
    return [...new Set([row?.eventId, ...(row?.eventIds ?? [])].map((item) => text(item, 180)).filter(Boolean))];
}

function sceneDescriptor(snapshot, artifact, registry) {
    const sceneRows = latestRows(snapshot, registry, 'scenes');
    const spacetimeRows = latestRows(snapshot, registry, 'spacetime');
    const scene = activeRow(sceneRows);
    const spacetime = activeRow(spacetimeRows);
    const source = [rowText(scene), rowText(spacetime), artifact?.factPackage?.turnSummary]
        .map((item) => text(item, 1500)).filter(Boolean).join('\n');
    const location = labeledValue(source, ['当前地点', '所在地点', '地点'])
        || text(spacetime?.title || spacetime?.content, 240)
        || text(scene?.title, 240);
    const stage = labeledValue(source, ['当前阶段', '场景阶段', '阶段']);
    const goal = labeledValue(source, ['当前目标', '场景目标', '目标']);
    const explicitStatus = labeledValue(source, ['阶段状态', '场景状态', '进度状态']);
    const rawStatus = explicitStatus || text(scene?.status, 120);
    const status = TERMINAL_RE.test(rawStatus || source)
        ? 'closed'
        : ACTIVE_RE.test(rawStatus || source)
            ? 'active'
            : 'active';
    return {
        title: text(scene?.title || location, 240),
        location,
        stage,
        goal,
        status,
        eventIds: eventIds(scene),
        sourceRowId: text(scene?.id, 180),
    };
}

const CHINESE_NUMBERS = new Map([
    ['半', 0.5], ['一', 1], ['二', 2], ['两', 2], ['三', 3], ['四', 4], ['五', 5],
    ['六', 6], ['七', 7], ['八', 8], ['九', 9], ['十', 10],
]);

function numberValue(value) {
    if (/^\d+(?:\.\d+)?$/.test(value))
        return Number(value);
    if (CHINESE_NUMBERS.has(value))
        return CHINESE_NUMBERS.get(value);
    const ten = value.match(/^十([一二三四五六七八九])?$/);
    if (ten)
        return 10 + (CHINESE_NUMBERS.get(ten[1]) || 0);
    const tens = value.match(/^([二三四五六七八九])十([一二三四五六七八九])?$/);
    if (tens)
        return CHINESE_NUMBERS.get(tens[1]) * 10 + (CHINESE_NUMBERS.get(tens[2]) || 0);
    return 0;
}

function explicitElapsedMinutes(assistantText) {
    const source = text(assistantText, 8000);
    let total = 0;
    const unitMinutes = { 年: 525600, 月: 43200, 周: 10080, 天: 1440, 日: 1440, 小时: 60, 时辰: 120, 分钟: 1 };
    const pattern = /(\d+(?:\.\d+)?|半|一|二|两|三|四|五|六|七|八|九|十|十一|十二|十三|十四|十五|十六|十七|十八|十九|二十|三十)(年|个月|月|周|天|日|小时|时辰|分钟)(?:后|以后|之后|过去|流逝|前进|抵达|到达)/g;
    for (const match of source.matchAll(pattern)) {
        const amount = numberValue(match[1]);
        const unit = match[2] === '个月' ? '月' : match[2];
        if (amount > 0 && unitMinutes[unit])
            total += Math.round(amount * unitMinutes[unit]);
    }
    if (/(翌日|次日|第二天|第二日)/.test(source))
        total = Math.max(total, 1440);
    return total;
}

function clockDisplay(snapshot, registry) {
    const row = activeRow(latestRows(snapshot, registry, 'spacetime'));
    const source = rowText(row);
    const labeled = labeledValue(source, ['当前时间', '游戏时间', '时间']);
    if (labeled)
        return labeled;
    const stateTime = row?.fields?.currentStates?.find?.((item) => /(第.{0,8}[日天]|\d{1,2}[:：]\d{2}|清晨|上午|中午|下午|傍晚|夜晚|深夜|凌晨)/.test(String(item)));
    return text(stateTime, 240);
}

function eventContext(snapshot, registry) {
    const rows = latestRows(snapshot, registry, 'events');
    return rows
        .filter((row) => !TERMINAL_RE.test(rowText(row)))
        .slice(-8)
        .map((row) => {
            const fields = row.fields ?? {};
            const state = list(fields.currentStates).at(-1) || text(row.status, 160) || text(row.content, 300);
            return state ? `${text(row.title, 180)}：${state}` : text(row.title, 180);
        })
        .filter(Boolean);
}

function effectiveFactContext(snapshot, registry, descriptor) {
    const selected = [];
    const related = new Set([...(descriptor.eventIds ?? [])].map(normalizedToken).filter(Boolean));
    for (const table of registry ?? []) {
        if (!table?.enabled || !['characters', 'items', 'globalChanges', 'foundations'].includes(table.role))
            continue;
        for (const row of snapshot?.[table.key] ?? []) {
            const rowEvents = eventIds(row).map(normalizedToken);
            const directlyRelated = related.size === 0 || rowEvents.some((id) => related.has(id));
            if (!directlyRelated && table.role !== 'foundations')
                continue;
            const fields = row.fields ?? {};
            const current = [...list(fields.currentFacts), ...list(fields.currentStates)].slice(-2);
            for (const fact of current) {
                selected.push(`${text(row.title, 180)}：${fact}`);
                if (selected.length >= 10)
                    return selected;
            }
        }
    }
    return selected;
}

function appendJournal(runtime, type, turnKey, turnIndex, payload = {}) {
    const id = `rte_${hashText(`${runtime.revision + 1}|${type}|${turnKey}|${JSON.stringify(payload)}`)}`;
    if (runtime.journal.some((item) => item.id === id))
        return;
    runtime.revision += 1;
    runtime.journal.push({ id, revision: runtime.revision, type, turnKey, turnIndex, payload, createdAt: nowIso() });
    runtime.journal = runtime.journal.slice(-3000);
}

function closeCurrentScene(runtime, turnKey, turnIndex, reason) {
    const machine = runtime.machines.scene;
    const current = machine.instances[machine.currentInstanceId];
    if (!current || current.status === 'closed' || current.status === 'archived')
        return null;
    current.status = 'closed';
    current.closedTurnKey = turnKey;
    current.closedTurnIndex = turnIndex;
    current.closureReason = reason;
    current.updatedAt = nowIso();
    machine.currentInstanceId = '';
    appendJournal(runtime, 'SCENE_CLOSED', turnKey, turnIndex, { sceneInstanceId: current.id, reason });
    return current;
}

function sceneSignature(descriptor) {
    return [descriptor.location, descriptor.stage, descriptor.goal].map(normalizedToken).join('|');
}

function advanceScene(runtime, descriptor, artifact) {
    const turnKey = artifact.messageKey;
    const turnIndex = artifact.messageIndex;
    const machine = runtime.machines.scene;
    let current = machine.instances[machine.currentInstanceId];
    const boundary = artifact.sceneBoundary;
    if (current && boundary) {
        closeCurrentScene(runtime, turnKey, turnIndex, `离开“${boundary.previousTitle || current.title}”，进入“${boundary.currentTitle || descriptor.title}”`);
        current = undefined;
    }
    if (current && descriptor.status === 'closed') {
        closeCurrentScene(runtime, turnKey, turnIndex, '场景阶段已明确完成或关闭');
        current = undefined;
    }
    if (current) {
        const oldSignature = sceneSignature(current);
        const nextSignature = sceneSignature(descriptor);
        const explicitStageChanged = Boolean(descriptor.stage && current.stage && normalizedToken(descriptor.stage) !== normalizedToken(current.stage));
        const explicitGoalChanged = Boolean(descriptor.goal && current.goal && normalizedToken(descriptor.goal) !== normalizedToken(current.goal));
        const locationChanged = Boolean(descriptor.location && current.location && normalizedToken(descriptor.location) !== normalizedToken(current.location));
        if (locationChanged || explicitStageChanged || explicitGoalChanged) {
            closeCurrentScene(runtime, turnKey, turnIndex, locationChanged ? '物理地点发生变化' : '同一地点内叙事阶段或目标发生变化');
            current = undefined;
        }
        else if (oldSignature === nextSignature || !nextSignature.replace(/\|/g, '')) {
            current.title = descriptor.title || current.title;
            current.location = descriptor.location || current.location;
            current.stage = descriptor.stage || current.stage;
            current.goal = descriptor.goal || current.goal;
            current.eventIds = [...new Set([...current.eventIds, ...descriptor.eventIds])];
            current.updatedAt = nowIso();
            appendJournal(runtime, 'SCENE_UPDATED', turnKey, turnIndex, { sceneInstanceId: current.id });
            return current;
        }
    }
    if (!descriptor.title && !descriptor.location)
        return undefined;
    machine.sequence += 1;
    const id = `sceneinst_${machine.sequence}_${hashText(`${turnKey}|${descriptor.location}|${descriptor.stage}|${descriptor.goal}`)}`;
    const instance = {
        id,
        location: descriptor.location,
        title: descriptor.title || descriptor.location,
        stage: descriptor.stage,
        goal: descriptor.goal,
        status: descriptor.status === 'closed' ? 'closed' : 'active',
        startedTurnKey: turnKey,
        startedTurnIndex: turnIndex,
        closedTurnKey: descriptor.status === 'closed' ? turnKey : '',
        closedTurnIndex: descriptor.status === 'closed' ? turnIndex : -1,
        closureReason: descriptor.status === 'closed' ? '本轮建立时已经明确完成' : '',
        eventIds: descriptor.eventIds,
        updatedAt: nowIso(),
    };
    machine.instances[id] = instance;
    if (instance.status === 'active')
        machine.currentInstanceId = id;
    appendJournal(runtime, 'SCENE_ENTERED', turnKey, turnIndex, { sceneInstanceId: id, location: instance.location, stage: instance.stage, goal: instance.goal });
    if (instance.status === 'closed')
        appendJournal(runtime, 'SCENE_CLOSED', turnKey, turnIndex, { sceneInstanceId: id, reason: instance.closureReason });
    return instance;
}

function enqueue(runtime, type, artifact, sourceRevision = runtime.revision) {
    const id = `outbox_${hashText(`${type}|${artifact.messageKey}|${runtime.revision}`)}`;
    const existing = runtime.outbox.find((item) => item.id === id);
    if (existing)
        return existing;
    const job = {
        id,
        type,
        turnKey: artifact.messageKey,
        turnIndex: artifact.messageIndex,
        sourceRevision: Math.max(0, Number(sourceRevision) || 0),
        status: 'pending',
        attempts: 0,
        createdAt: nowIso(),
        startedAt: '',
        finishedAt: '',
        error: '',
    };
    runtime.outbox.push(job);
    runtime.outbox = runtime.outbox.slice(-1000);
    appendJournal(runtime, 'OUTBOX_JOB_QUEUED', artifact.messageKey, artifact.messageIndex, { jobId: id, jobType: type });
    return job;
}

function planSummary(runtime, artifact, eligibility) {
    const machine = runtime.machines.summary;
    if (machine.pendingKind && machine.pendingTurnKey && machine.pendingTurnKey !== artifact.messageKey)
        return '';
    let kind = '';
    if (eligibility.small) {
        kind = 'small';
    }
    else if (eligibility.large && artifact.messageIndex > machine.lastSmallTurnIndex) {
        // A large summary may never be automatically scheduled on the same turn
        // that committed a small summary.
        kind = 'large';
    }
    if (!kind)
        return '';
    machine.pendingKind = kind;
    machine.pendingTurnKey = artifact.messageKey;
    enqueue(runtime, `${kind}-summary`, artifact);
    appendJournal(runtime, 'SUMMARY_SCHEDULED', artifact.messageKey, artifact.messageIndex, { kind });
    return kind;
}

function buildNarrativeContext(runtime, snapshot, registry, descriptor) {
    const currentId = runtime.machines.scene.currentInstanceId;
    const current = runtime.machines.scene.instances[currentId];
    const completed = Object.values(runtime.machines.scene.instances)
        .filter((item) => item.status === 'closed')
        .sort((a, b) => b.closedTurnIndex - a.closedTurnIndex)
        .slice(0, 8)
        .map((item) => {
            const label = item.stage || item.goal || item.title;
            const suffix = item.goal && item.goal !== label ? `（${item.goal}）` : '';
            return `${label}${suffix}：已完成`;
        });
    return {
        revision: runtime.revision,
        time: runtime.machines.clock.display,
        location: current?.location || descriptor.location,
        scene: current?.title || descriptor.title,
        stage: current?.stage || descriptor.stage,
        goal: current?.goal || descriptor.goal,
        completedPrerequisites: completed,
        activeEvents: eventContext(snapshot, registry),
        effectiveFacts: effectiveFactContext(snapshot, registry, descriptor),
        generatedAt: nowIso(),
    };
}

export function advanceRuntimeV2({ chatState, artifact, settings, smallEligible, largeEligible }) {
    const runtime = normalizeRuntimeV2(chatState.runtimeV2);
    if (runtime.processedTurnKeys.includes(artifact.messageKey)) {
        return {
            runtime,
            plan: {
                summaryKind: runtime.machines.summary.pendingTurnKey === artifact.messageKey
                    ? runtime.machines.summary.pendingKind
                    : '',
                sync: runtime.machines.publication.desiredRevision > runtime.machines.publication.confirmedRevision,
            },
            duplicate: true,
        };
    }
    runtime.machines.turn.status = 'committing';
    appendJournal(runtime, 'TURN_RECEIVED', artifact.messageKey, artifact.messageIndex, {});
    const delta = explicitElapsedMinutes(artifact.assistantText);
    const display = clockDisplay(artifact.snapshot, settings.tableRegistry);
    if (delta > 0 || (display && display !== runtime.machines.clock.display)) {
        runtime.machines.clock.elapsedMinutes += delta;
        runtime.machines.clock.display = display || runtime.machines.clock.display;
        runtime.machines.clock.sourceTurnKey = artifact.messageKey;
        runtime.machines.clock.revision += 1;
        appendJournal(runtime, 'GAME_TIME_CHANGED', artifact.messageKey, artifact.messageIndex, { deltaMinutes: delta, display: runtime.machines.clock.display });
    }
    const descriptor = sceneDescriptor(artifact.snapshot, artifact, settings.tableRegistry);
    advanceScene(runtime, descriptor, artifact);
    const summaryKind = planSummary(runtime, artifact, { small: smallEligible, large: largeEligible });
    runtime.narrativeContext = buildNarrativeContext(runtime, artifact.snapshot, settings.tableRegistry, descriptor);
    appendJournal(runtime, 'NARRATIVE_CONTEXT_PROJECTED', artifact.messageKey, artifact.messageIndex, { revision: runtime.narrativeContext.revision });
    runtime.machines.publication.desiredRevision = runtime.revision;
    const syncJob = enqueue(runtime, 'lorebook-sync', artifact, runtime.machines.publication.desiredRevision);
    runtime.machines.publication.status = 'queued';
    runtime.machines.publication.pendingJobId = syncJob.id;
    runtime.machines.publication.updatedAt = nowIso();
    runtime.processedTurnKeys.push(artifact.messageKey);
    runtime.processedTurnKeys = runtime.processedTurnKeys.slice(-2000);
    runtime.machines.turn.status = 'committed';
    runtime.machines.turn.lastTurnKey = artifact.messageKey;
    runtime.machines.turn.lastTurnIndex = artifact.messageIndex;
    runtime.machines.turn.lastCommittedAt = nowIso();
    runtime.updatedAt = nowIso();
    chatState.runtimeV2 = runtime;
    return { runtime, plan: { summaryKind, sync: true }, duplicate: false };
}

function findJob(runtime, type, turnKey) {
    return [...runtime.outbox].reverse().find((item) => item.type === type && item.turnKey === turnKey && !['cancelled'].includes(item.status));
}

export function markRuntimeJobRunning(chatState, type, turnKey) {
    const runtime = normalizeRuntimeV2(chatState.runtimeV2);
    const job = findJob(runtime, type, turnKey);
    if (job) {
        job.status = 'running';
        job.attempts += 1;
        job.startedAt = nowIso();
        job.error = '';
    }
    if (type === 'lorebook-sync') {
        runtime.machines.publication.status = 'writing';
        runtime.machines.publication.updatedAt = nowIso();
    }
    chatState.runtimeV2 = runtime;
    return job;
}

export function markRuntimeJobDone(chatState, type, artifact) {
    const runtime = normalizeRuntimeV2(chatState.runtimeV2);
    const job = findJob(runtime, type, artifact.messageKey);
    if (job) {
        job.status = 'done';
        job.finishedAt = nowIso();
        job.error = '';
    }
    if (type === 'small-summary' || type === 'large-summary') {
        const kind = type === 'small-summary' ? 'small' : 'large';
        runtime.machines.summary.pendingKind = '';
        runtime.machines.summary.pendingTurnKey = '';
        if (kind === 'small') {
            runtime.machines.summary.lastSmallTurnIndex = artifact.messageIndex;
            runtime.machines.summary.lastSmallTurnKey = artifact.messageKey;
        }
        else {
            runtime.machines.summary.lastLargeTurnIndex = artifact.messageIndex;
            runtime.machines.summary.lastLargeTurnKey = artifact.messageKey;
        }
        appendJournal(runtime, 'SUMMARY_COMMITTED', artifact.messageKey, artifact.messageIndex, { kind });
    }
    if (type === 'lorebook-sync') {
        runtime.machines.publication.confirmedRevision = Math.max(runtime.machines.publication.confirmedRevision, job?.sourceRevision ?? runtime.revision);
        runtime.machines.publication.status = runtime.machines.publication.confirmedRevision >= runtime.machines.publication.desiredRevision ? 'clean' : 'dirty';
        runtime.machines.publication.pendingJobId = '';
        runtime.machines.publication.lastError = '';
        runtime.machines.publication.updatedAt = nowIso();
        appendJournal(runtime, 'LOREBOOK_PROJECTION_CONFIRMED', artifact.messageKey, artifact.messageIndex, { revision: runtime.machines.publication.confirmedRevision });
    }
    runtime.updatedAt = nowIso();
    chatState.runtimeV2 = runtime;
    return job;
}

export function markRuntimeJobFailed(chatState, type, turnKey, error) {
    const runtime = normalizeRuntimeV2(chatState.runtimeV2);
    const job = findJob(runtime, type, turnKey);
    if (job) {
        job.status = 'failed';
        job.finishedAt = nowIso();
        job.error = text(error, 1200);
    }
    if (type === 'small-summary' || type === 'large-summary') {
        runtime.machines.summary.pendingKind = '';
        runtime.machines.summary.pendingTurnKey = '';
    }
    if (type === 'lorebook-sync') {
        runtime.machines.publication.status = 'failed';
        runtime.machines.publication.lastError = text(error, 1200);
        runtime.machines.publication.updatedAt = nowIso();
    }
    runtime.updatedAt = nowIso();
    chatState.runtimeV2 = runtime;
    return job;
}

export function narrativeContextText(context) {
    const source = context && typeof context === 'object' ? context : {};
    const lines = ['[当前叙事上下文]'];
    if (source.time)
        lines.push(`当前时间：${source.time}`);
    if (source.location)
        lines.push(`当前地点：${source.location}`);
    if (source.scene)
        lines.push(`当前场景：${source.scene}`);
    if (source.stage)
        lines.push(`当前阶段：${source.stage}`);
    if (source.goal)
        lines.push(`当前目标：${source.goal}`);
    for (const item of source.completedPrerequisites ?? [])
        lines.push(`已完成前置：${item}`);
    for (const item of source.activeEvents ?? [])
        lines.push(`当前事件：${item}`);
    for (const item of source.effectiveFacts ?? [])
        lines.push(`有效事实：${item}`);
    return lines.join('\n');
}
