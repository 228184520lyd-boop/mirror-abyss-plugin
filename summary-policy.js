import { TABLE_KEYS } from '../constants.js';
const TABLE_WEIGHTS = {
    focus: 2,
    spacetime: 2,
    characters: 2,
    relationships: 2,
    events: 2,
    regions: 1,
    items: 1,
    skills: 1,
    foundations: 1,
};
function comparableRow(row) {
    return JSON.stringify({
        title: row.title,
        content: row.content,
        status: row.status,
        lifecycle: row.lifecycle,
    });
}
function changedRows(previous, current) {
    let score = 0;
    for (const table of TABLE_KEYS) {
        const before = new Map((previous?.[table] ?? []).map((row) => [row.id, comparableRow(row)]));
        const after = new Map(current[table].map((row) => [row.id, comparableRow(row)]));
        const ids = new Set([...before.keys(), ...after.keys()]);
        for (const id of ids) {
            if (before.get(id) !== after.get(id))
                score += TABLE_WEIGHTS[table];
        }
    }
    return Math.min(8, score);
}
/**
 * Uses state changes already produced by the plugin. It makes no extra model
 * request and does not score the same fact through multiple text heuristics.
 */
export function decideSmallSummary(allArtifacts, pendingArtifacts, configuredMaxTurns) {
    const maxTurns = Math.min(30, Math.max(8, Number(configuredMaxTurns) || 12));
    const minTurns = Math.max(4, Math.round(maxTurns * 0.4));
    const targetScore = Math.max(12, minTurns * 3);
    const firstIndex = pendingArtifacts.length
        ? allArtifacts.findIndex((item) => item.messageKey === pendingArtifacts[0].messageKey)
        : -1;
    let previous = firstIndex > 0 ? allArtifacts[firstIndex - 1].snapshot : undefined;
    let score = 0;
    for (const artifact of pendingArtifacts) {
        if (!artifact.snapshot)
            continue;
        const facts = artifact.factPackage?.facts ?? [];
        const factScore = facts.reduce((sum, fact) => {
            if (fact.confidence === 'uncertain')
                return sum;
            if (['historical', 'trace'].includes(fact.type))
                return sum + 1;
            if (['focus', 'spacetime', 'character', 'relationship', 'event'].includes(fact.type))
                return sum + 2;
            return sum + 1;
        }, 0);
        // Facts are the base signal. Snapshot differences only add a small,
        // independent continuity signal when extraction omitted explicit facts.
        score += Math.min(8, factScore || changedRows(previous, artifact.snapshot));
        previous = artifact.snapshot;
    }
    const turns = pendingArtifacts.length;
    if (turns < minTurns) {
        return { shouldSummarize: false, turns, score, minTurns, maxTurns, targetScore, reason: 'below-minimum' };
    }
    if (score >= targetScore) {
        return { shouldSummarize: true, turns, score, minTurns, maxTurns, targetScore, reason: 'story-density' };
    }
    return {
        shouldSummarize: turns >= maxTurns,
        turns,
        score,
        minTurns,
        maxTurns,
        targetScore,
        reason: turns >= maxTurns ? 'maximum-delay' : 'waiting-density',
    };
}
