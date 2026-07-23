import { nowIso } from '../core/utils.js';

export function normalizeRecordingBoundary(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const startIndex = Number(value.startIndex);
    if (!Number.isInteger(startIndex) || startIndex < 0)
        return undefined;
    return {
        startIndex,
        setAt: String(value.setAt || nowIso()),
        source: ['player', 'legacy'].includes(String(value.source)) ? String(value.source) : 'player',
    };
}

export function hasRecordingBoundary(state) {
    return Boolean(normalizeRecordingBoundary(state?.recordingBoundary));
}

export function recordingStartIndex(state) {
    return normalizeRecordingBoundary(state?.recordingBoundary)?.startIndex;
}

export function messageInsideRecordingBoundary(state, messageIndex) {
    const startIndex = recordingStartIndex(state);
    return startIndex !== undefined && Number.isInteger(messageIndex) && messageIndex >= startIndex;
}

export function createPlayerRecordingBoundary(startIndex) {
    const normalized = Math.max(0, Math.trunc(Number(startIndex) || 0));
    return { startIndex: normalized, setAt: nowIso(), source: 'player' };
}
