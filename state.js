import { TABLE_KEYS } from '../constants.js';
import { assertArtifactCommitCurrent } from '../core/commit-guard.js';
import { getChat, getSettings } from '../core/context.js';
import { toErrorMessage } from '../core/utils.js';
import { markStage } from '../domain/artifact.js';
import { normalizeFactPackage } from '../domain/facts.js';
import { emptySnapshot, normalizeSnapshot, preservePersistentCharacters, stateSchemaDescription } from '../domain/snapshot.js';
import { generateStructuredTask } from '../llm/structured.js';
import { stateJsonSchema, stateSystemPrompt, stateUserPrompt } from '../prompts/state.js';
import { putArtifact } from '../storage/repository.js';
export function previousSnapshot(beforeIndex) {
    const chat = getChat();
    for (let i = beforeIndex - 1; i >= 0; i -= 1) {
        if (chat[i]?.is_user)
            continue;
        const snapshot = chat[i]?.extra?.mirrorAbyssV11?.snapshot;
        if (snapshot)
            return normalizeSnapshot(snapshot, snapshot);
        const legacy = chat[i]?.extra?.mirrorAbyss?.tableSnapshot;
        if (legacy)
            return normalizeSnapshot(legacy, legacy);
    }
    return emptySnapshot();
}
function restoreManualRows(previous, next) {
    for (const key of TABLE_KEYS) {
        const existing = new Set(next[key].map((row) => row.id));
        for (const row of previous[key]) {
            if (row.source === 'manual' && !existing.has(row.id))
                next[key].push({ ...row });
        }
    }
    return next;
}
export async function runStateExtraction(artifact, force = false) {
    if (!force && artifact.stages.state.status === 'success' && artifact.snapshot)
        return artifact.snapshot;
    const settings = getSettings();
    const previous = previousSnapshot(artifact.messageIndex);
    markStage(artifact, 'state', 'running');
    await putArtifact(artifact);
    try {
        const parsed = await generateStructuredTask({
            task: 'state',
            systemPrompt: stateSystemPrompt(),
            prompt: stateUserPrompt(previous, artifact.playerText, artifact.assistantText),
            structureDescription: `{"turnSummary":"...","facts":[{"id":"...","type":"event","entityId":"...","title":"...","content":"...","status":"...","keywords":["..."],"operation":"update","confidence":"confirmed"}],"snapshot":${stateSchemaDescription()}}`,
            allowRepair: settings.repairInvalidJsonOnce,
            jsonSchema: stateJsonSchema(),
        });
        if (!parsed.snapshot || typeof parsed.snapshot !== 'object') {
            throw new Error('状态表返回缺少 snapshot 根对象');
        }
        for (const key of TABLE_KEYS) {
            if (!Array.isArray(parsed.snapshot[key]))
                throw new Error(`状态表返回缺少 ${key} 数组`);
        }
        assertArtifactCommitCurrent(artifact);
        const normalized = preservePersistentCharacters(previous, restoreManualRows(previous, normalizeSnapshot(parsed.snapshot, previous)));
        artifact.factPackage = normalizeFactPackage(parsed, artifact.messageKey);
        artifact.snapshot = normalized;
        markStage(artifact, 'state', 'success');
        await putArtifact(artifact);
        return normalized;
    }
    catch (error) {
        markStage(artifact, 'state', 'failed', toErrorMessage(error));
        await putArtifact(artifact);
        throw error;
    }
}
