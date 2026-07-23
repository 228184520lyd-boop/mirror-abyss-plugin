import { nowIso } from '../core/utils.js';

function strings(value, limit = 160) {
    return [...new Set((Array.isArray(value) ? value : [])
            .map((item) => String(item ?? '').trim())
            .filter(Boolean))].slice(0, limit);
}

function normalizeRecord(value, fallbackKey = '') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const key = String(value.key || fallbackKey).trim();
    if (!key)
        return undefined;
    return {
        key,
        uid: String(value.uid ?? '').trim(),
        logicalKey: String(value.logicalKey || key).trim(),
        comment: String(value.comment || '').trim(),
        kind: String(value.kind || '').trim(),
        eventIds: strings(value.eventIds, 120),
        factIds: strings(value.factIds, 200),
        deletedAt: value.deletedAt ? String(value.deletedAt) : undefined,
        reason: value.reason ? String(value.reason) : undefined,
    };
}

function normalizeRecordMap(value) {
    const output = {};
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return output;
    for (const [key, record] of Object.entries(value)) {
        const normalized = normalizeRecord(record, key);
        if (normalized)
            output[normalized.key] = normalized;
    }
    return output;
}

export function normalizeLorebookPublication(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        bookName: String(source.bookName || '').trim(),
        published: normalizeRecordMap(source.published),
        suppressed: normalizeRecordMap(source.suppressed),
    };
}

function managedInfo(entry) {
    return entry?.extensions?.mirrorAbyssV11 ?? null;
}

function existingManagedKeys(data, chatKey) {
    const keys = new Set();
    for (const entry of Object.values(data?.entries ?? {})) {
        const info = managedInfo(entry);
        if (info?.managed && info.chatKey === chatKey && info.key)
            keys.add(String(info.key));
    }
    return keys;
}

export function detectPlayerDeletedLorebookEntries(state, data, desired, chatKey, bookName) {
    const publication = normalizeLorebookPublication(state?.lorebookPublication);
    state.lorebookPublication = publication;
    if (!publication.bookName || publication.bookName !== String(bookName || '').trim())
        return [];
    const existing = existingManagedKeys(data, chatKey);
    const detected = [];
    for (const [key, previous] of Object.entries(publication.published)) {
        if (!desired.has(key) || existing.has(key) || publication.suppressed[key])
            continue;
        publication.suppressed[key] = {
            ...previous,
            key,
            reason: 'player_deleted',
            deletedAt: nowIso(),
        };
        detected.push(key);
    }
    return detected;
}

function commentTitle(comment) {
    return String(comment || '')
        .replace(/^\s*\[MA11\]\s*/i, '')
        .split(/[｜|]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .at(-1) || '';
}

function relationToken(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function relationLineParts(line) {
    const match = String(line || '').match(/^(\s*(?:关联对象|直接关联对象|关联事件|直接关联事件|related\s*(?:objects?|events?))\s*[：:]\s*)(.*)$/i);
    return match ? { prefix: match[1], value: match[2] } : undefined;
}

function scrubRelationLine(line, suppressedTokens) {
    const parts = relationLineParts(line);
    if (!parts)
        return String(line || '');
    const values = parts.value
        .split(/[、,，;；|｜]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => {
            const normalized = relationToken(item);
            return !suppressedTokens.some((token) => token && (normalized === token || normalized.includes(token)));
        });
    return values.length ? `${parts.prefix}${values.join('、')}` : '';
}

function isEventPrimary(record) {
    const kind = String(record?.kind || '');
    const key = String(record?.key || '');
    return kind === 'view:events' || kind.startsWith('summary:') || key.startsWith('view:events:') || key.startsWith('summary:');
}

function specIsEventPrimary(spec, key) {
    const kind = String(spec?.kind || '');
    return kind === 'view:events' || kind.startsWith('summary:') || String(key).startsWith('view:events:') || String(key).startsWith('summary:');
}

export function applyLorebookSuppressions(desired, state) {
    const publication = normalizeLorebookPublication(state?.lorebookPublication);
    state.lorebookPublication = publication;
    const suppressed = Object.values(publication.suppressed);
    if (!suppressed.length)
        return new Map(desired);
    const directKeys = new Set(suppressed.map((item) => item.key));
    const suppressedEventIds = new Set(suppressed.filter(isEventPrimary).flatMap((item) => item.eventIds));
    const relationTokens = new Set(suppressed.flatMap((item) => [commentTitle(item.comment), ...item.eventIds])
        .map(relationToken)
        .filter(Boolean));
    const output = new Map();
    for (const [key, source] of desired) {
        const eventIds = strings(source?.eventIds, 120);
        const sameSuppressedEvent = specIsEventPrimary(source, key)
            && eventIds.some((eventId) => suppressedEventIds.has(eventId));
        if (directKeys.has(key) || sameSuppressedEvent)
            continue;
        const suppressedTokens = [...relationTokens];
        const content = String(source?.content || '')
            .split('\n')
            .map((line) => scrubRelationLine(line, suppressedTokens))
            .filter(Boolean)
            .join('\n');
        output.set(key, {
            ...structuredClone(source),
            content,
            eventIds: eventIds.filter((eventId) => !suppressedEventIds.has(eventId)),
            // 玩家删除只否决世界书节点与显式关联，不改其他条目的事实来源。
            factIds: strings(source?.factIds, 200),
        });
    }
    return output;
}

export function updateLorebookPublicationLedger(state, data, chatKey, bookName) {
    const publication = normalizeLorebookPublication(state?.lorebookPublication);
    const published = {};
    for (const [uid, entry] of Object.entries(data?.entries ?? {})) {
        const info = managedInfo(entry);
        if (!info?.managed || info.chatKey !== chatKey || !info.key)
            continue;
        const key = String(info.key);
        published[key] = {
            key,
            uid: String(uid),
            logicalKey: String(info.logicalKey || key),
            comment: String(entry.comment || ''),
            kind: String(info.kind || ''),
            eventIds: strings(info.eventIds, 120),
            factIds: strings(info.factIds, 200),
        };
    }
    state.lorebookPublication = {
        bookName: String(bookName || '').trim(),
        published,
        suppressed: publication.suppressed,
    };
    return state.lorebookPublication;
}

export function restoreLorebookSuppression(state, key) {
    const publication = normalizeLorebookPublication(state?.lorebookPublication);
    const normalizedKey = String(key || '').trim();
    const existed = Boolean(normalizedKey && publication.suppressed[normalizedKey]);
    if (existed)
        delete publication.suppressed[normalizedKey];
    state.lorebookPublication = publication;
    return existed;
}

export function suppressedLorebookEntries(state) {
    return Object.values(normalizeLorebookPublication(state?.lorebookPublication).suppressed)
        .sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')) || a.key.localeCompare(b.key));
}
