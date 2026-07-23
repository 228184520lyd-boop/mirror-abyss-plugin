/**
 * Runtime V2 canonical state.
 *
 * This state is the authoritative orchestration layer. Snapshots, summaries and
 * lorebook entries are projections/adapters and must not drive these machines.
 */
import { nowIso, safeText } from '../core/utils.js';

export const RUNTIME_V2_VERSION = 1;

function cleanText(value, limit = 800) {
    return safeText(value, limit).trim();
}

function integer(value, fallback = -1) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : fallback;
}

export function emptyNarrativeContext() {
    return {
        revision: 0,
        time: '',
        location: '',
        scene: '',
        stage: '',
        goal: '',
        completedPrerequisites: [],
        activeEvents: [],
        effectiveFacts: [],
        generatedAt: nowIso(),
    };
}

export function emptyRuntimeV2() {
    return {
        version: RUNTIME_V2_VERSION,
        revision: 0,
        journal: [],
        processedTurnKeys: [],
        machines: {
            turn: {
                status: 'idle',
                lastTurnKey: '',
                lastTurnIndex: -1,
                lastCommittedAt: '',
            },
            clock: {
                elapsedMinutes: 0,
                display: '',
                sourceTurnKey: '',
                revision: 0,
            },
            scene: {
                sequence: 0,
                currentInstanceId: '',
                instances: {},
            },
            summary: {
                pendingKind: '',
                pendingTurnKey: '',
                lastSmallTurnIndex: -1,
                lastLargeTurnIndex: -1,
                lastSmallTurnKey: '',
                lastLargeTurnKey: '',
            },
            publication: {
                desiredRevision: 0,
                confirmedRevision: 0,
                status: 'clean',
                pendingJobId: '',
                lastError: '',
                updatedAt: '',
            },
        },
        outbox: [],
        narrativeContext: emptyNarrativeContext(),
        updatedAt: nowIso(),
    };
}

function normalizeSceneInstance(value, id) {
    const source = value && typeof value === 'object' ? value : {};
    const status = ['active', 'closing', 'closed', 'archived'].includes(String(source.status))
        ? String(source.status)
        : 'active';
    return {
        id: cleanText(source.id || id, 180) || id,
        location: cleanText(source.location, 240),
        title: cleanText(source.title, 240),
        stage: cleanText(source.stage, 240),
        goal: cleanText(source.goal, 500),
        status,
        startedTurnKey: cleanText(source.startedTurnKey, 220),
        startedTurnIndex: integer(source.startedTurnIndex),
        closedTurnKey: cleanText(source.closedTurnKey, 220),
        closedTurnIndex: integer(source.closedTurnIndex),
        closureReason: cleanText(source.closureReason, 500),
        eventIds: Array.isArray(source.eventIds)
            ? [...new Set(source.eventIds.map((item) => cleanText(item, 180)).filter(Boolean))].slice(0, 40)
            : [],
        updatedAt: cleanText(source.updatedAt, 80) || nowIso(),
    };
}

function normalizeOutboxJob(value) {
    const source = value && typeof value === 'object' ? value : {};
    const status = ['pending', 'running', 'done', 'failed', 'cancelled'].includes(String(source.status))
        ? String(source.status)
        : 'pending';
    const type = ['small-summary', 'large-summary', 'lorebook-sync'].includes(String(source.type))
        ? String(source.type)
        : '';
    const id = cleanText(source.id, 220);
    if (!id || !type)
        return null;
    return {
        id,
        type,
        turnKey: cleanText(source.turnKey, 220),
        turnIndex: integer(source.turnIndex),
        sourceRevision: Math.max(0, integer(source.sourceRevision, 0)),
        status,
        attempts: Math.max(0, integer(source.attempts, 0)),
        createdAt: cleanText(source.createdAt, 80) || nowIso(),
        startedAt: cleanText(source.startedAt, 80),
        finishedAt: cleanText(source.finishedAt, 80),
        error: cleanText(source.error, 1200),
    };
}

export function normalizeRuntimeV2(value) {
    const base = emptyRuntimeV2();
    const source = value && typeof value === 'object' ? value : {};
    const machines = source.machines && typeof source.machines === 'object' ? source.machines : {};
    const sceneSource = machines.scene && typeof machines.scene === 'object' ? machines.scene : {};
    const instances = {};
    for (const [id, instance] of Object.entries(sceneSource.instances ?? {})) {
        const normalized = normalizeSceneInstance(instance, id);
        if (normalized.id)
            instances[normalized.id] = normalized;
    }
    const runtime = {
        ...base,
        version: RUNTIME_V2_VERSION,
        revision: Math.max(0, integer(source.revision, 0)),
        journal: Array.isArray(source.journal)
            ? source.journal.filter((item) => item && typeof item === 'object').slice(-3000)
            : [],
        processedTurnKeys: Array.isArray(source.processedTurnKeys)
            ? [...new Set(source.processedTurnKeys.map((item) => cleanText(item, 220)).filter(Boolean))].slice(-2000)
            : [],
        machines: {
            turn: {
                ...base.machines.turn,
                ...(machines.turn ?? {}),
                status: ['idle', 'committing', 'committed', 'failed'].includes(String(machines.turn?.status))
                    ? String(machines.turn.status)
                    : 'idle',
                lastTurnKey: cleanText(machines.turn?.lastTurnKey, 220),
                lastTurnIndex: integer(machines.turn?.lastTurnIndex),
                lastCommittedAt: cleanText(machines.turn?.lastCommittedAt, 80),
            },
            clock: {
                ...base.machines.clock,
                ...(machines.clock ?? {}),
                elapsedMinutes: Math.max(0, integer(machines.clock?.elapsedMinutes, 0)),
                display: cleanText(machines.clock?.display, 240),
                sourceTurnKey: cleanText(machines.clock?.sourceTurnKey, 220),
                revision: Math.max(0, integer(machines.clock?.revision, 0)),
            },
            scene: {
                sequence: Math.max(0, integer(sceneSource.sequence, 0)),
                currentInstanceId: cleanText(sceneSource.currentInstanceId, 180),
                instances,
            },
            summary: {
                ...base.machines.summary,
                ...(machines.summary ?? {}),
                pendingKind: ['small', 'large'].includes(String(machines.summary?.pendingKind))
                    ? String(machines.summary.pendingKind)
                    : '',
                pendingTurnKey: cleanText(machines.summary?.pendingTurnKey, 220),
                lastSmallTurnIndex: integer(machines.summary?.lastSmallTurnIndex),
                lastLargeTurnIndex: integer(machines.summary?.lastLargeTurnIndex),
                lastSmallTurnKey: cleanText(machines.summary?.lastSmallTurnKey, 220),
                lastLargeTurnKey: cleanText(machines.summary?.lastLargeTurnKey, 220),
            },
            publication: {
                ...base.machines.publication,
                ...(machines.publication ?? {}),
                desiredRevision: Math.max(0, integer(machines.publication?.desiredRevision, 0)),
                confirmedRevision: Math.max(0, integer(machines.publication?.confirmedRevision, 0)),
                status: ['clean', 'dirty', 'queued', 'writing', 'failed', 'suppressed'].includes(String(machines.publication?.status))
                    ? String(machines.publication.status)
                    : 'clean',
                pendingJobId: cleanText(machines.publication?.pendingJobId, 220),
                lastError: cleanText(machines.publication?.lastError, 1200),
                updatedAt: cleanText(machines.publication?.updatedAt, 80),
            },
        },
        outbox: Array.isArray(source.outbox)
            ? source.outbox.map(normalizeOutboxJob).filter(Boolean).slice(-1000)
            : [],
        narrativeContext: {
            ...base.narrativeContext,
            ...(source.narrativeContext ?? {}),
            revision: Math.max(0, integer(source.narrativeContext?.revision, 0)),
            time: cleanText(source.narrativeContext?.time, 240),
            location: cleanText(source.narrativeContext?.location, 240),
            scene: cleanText(source.narrativeContext?.scene, 240),
            stage: cleanText(source.narrativeContext?.stage, 240),
            goal: cleanText(source.narrativeContext?.goal, 500),
            completedPrerequisites: Array.isArray(source.narrativeContext?.completedPrerequisites)
                ? [...new Set(source.narrativeContext.completedPrerequisites.map((item) => cleanText(item, 500)).filter(Boolean))].slice(-8)
                : [],
            activeEvents: Array.isArray(source.narrativeContext?.activeEvents)
                ? [...new Set(source.narrativeContext.activeEvents.map((item) => cleanText(item, 500)).filter(Boolean))].slice(0, 8)
                : [],
            effectiveFacts: Array.isArray(source.narrativeContext?.effectiveFacts)
                ? [...new Set(source.narrativeContext.effectiveFacts.map((item) => cleanText(item, 500)).filter(Boolean))].slice(0, 10)
                : [],
            generatedAt: cleanText(source.narrativeContext?.generatedAt, 80) || nowIso(),
        },
        updatedAt: cleanText(source.updatedAt, 80) || nowIso(),
    };
    if (runtime.machines.scene.currentInstanceId && !runtime.machines.scene.instances[runtime.machines.scene.currentInstanceId]) {
        runtime.machines.scene.currentInstanceId = '';
    }
    return runtime;
}
