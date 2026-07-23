/**
 * 模块职责：在模型事实进入账本前，统一补齐准入、唯一主宿主、切面、保存层级与有效区间。
 * 维护边界：只依据模型已返回模块、稳定投影和插件上下文分类；不得补写剧情事实或猜测旧对象身份。
 */
import { hashText, safeText } from '../core/utils.js';

export const FACT_STORAGE_CLASSES = new Set(['working', 'episodic', 'event', 'durable']);
export const FACT_EVIDENCE_KINDS = new Set(['confirmed', 'recorded', 'reported', 'uncertain']);

const FACET_BY_LAYER_KEY = {
    baseContent: 'identity',
    currentFacts: 'fact',
    currentStates: 'status',
    presentationStates: 'appearance',
    relationshipStates: 'relationship',
    abilityStates: 'ability',
    relatedObjects: 'relation',
    relatedEvents: 'event-link',
    recentHistory: 'history',
    solidifiedHistory: 'history',
};

const FACET_BY_MODULE = {
    MA_CORE: 'progress',
    MA_EVENT_RESULT: 'result',
    MA_EVENT_STATE: 'status',
    MA_EVENT_STATUS: 'status',
    MA_CHARACTER_IDENTITY: 'identity',
    MA_CHARACTER_FACT: 'fact',
    MA_CHARACTER_STATE: 'status',
    MA_CHARACTER_APPEARANCE: 'appearance',
    MA_CHARACTER_RELATION: 'relationship',
    MA_CHARACTER_ABILITY: 'ability',
    MA_ITEM_IDENTITY: 'identity',
    MA_ITEM_FACT: 'fact',
    MA_ITEM_STATE: 'status',
    MA_SCENE_IDENTITY: 'identity',
    MA_SCENE_FACT: 'fact',
    MA_SCENE_STATE: 'status',
    MA_REGION_IDENTITY: 'identity',
    MA_REGION_FACT: 'fact',
    MA_REGION_STATE: 'status',
    MA_GLOBAL_IDENTITY: 'identity',
    MA_GLOBAL_FACT: 'fact',
    MA_GLOBAL_STATE: 'status',
    MA_FOUNDATION_IDENTITY: 'rule',
    MA_FOUNDATION_FACT: 'rule',
    MA_FOUNDATION_STATE: 'status',
    MA_SPACETIME_STATE: 'spacetime',
};

function text(value, limit = 240) {
    return safeText(value, limit).trim();
}

function objectValue(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizedHostType(value) {
    const type = text(value, 100);
    if (!type)
        return '';
    const aliases = {
        event: 'events',
        character: 'characters',
        state: 'characters',
        item: 'items',
        scene: 'scenes',
        region: 'regions',
        location: 'regions',
        global: 'globalChanges',
        foundation: 'foundations',
        custom: 'customObjects',
        spacetime: 'spacetime',
        episode: 'episodic',
    };
    return aliases[type] || type;
}

function explicitEventId(source) {
    const direct = text(source.eventId ?? source.event_id, 160);
    if (direct)
        return direct;
    const type = normalizedHostType(source.type);
    const entity = text(source.entityId ?? source.entity_id, 160);
    return type === 'events' && entity ? entity : undefined;
}

function normalizeSubjectRef(value) {
    if (typeof value === 'string') {
        const id = text(value, 180);
        return id ? { kind: 'stable', id } : undefined;
    }
    const source = objectValue(value);
    const id = text(source.id, 180);
    const label = text(source.label ?? source.name, 240);
    const kind = source.kind === 'weak' || (!id && label) ? 'weak' : 'stable';
    if (!id && !label)
        return undefined;
    return { kind, id: id || undefined, label: label || undefined };
}

function inferFacet(source, view) {
    const explicit = text(source.facet, 80);
    if (explicit)
        return explicit;
    const moduleTag = text(view.moduleTag, 80);
    if (FACET_BY_MODULE[moduleTag])
        return FACET_BY_MODULE[moduleTag];
    const layerKey = text(view.layerKey, 100);
    if (FACET_BY_LAYER_KEY[layerKey])
        return FACET_BY_LAYER_KEY[layerKey];
    const role = normalizedHostType(view.semanticRole ?? source.type);
    if (role === 'events')
        return view.layerKind === 'status' ? 'status' : 'progress';
    if (role === 'spacetime')
        return 'spacetime';
    return view.layerKind === 'status' ? 'status' : 'fact';
}

function inferStorageClass(source, hostType, facet, eventId) {
    const explicit = text(source.storageClass ?? source.storage_class, 40);
    if (FACT_STORAGE_CLASSES.has(explicit))
        return explicit;
    if (hostType === 'episodic')
        return 'episodic';
    if (hostType === 'events' || (eventId && hostType === 'legacy'))
        return 'event';
    if (hostType === 'foundations' || facet === 'rule')
        return 'durable';
    if (facet === 'identity' && !['scenes', 'spacetime'].includes(hostType))
        return 'durable';
    if (['regions', 'globalChanges'].includes(hostType) && facet !== 'status')
        return 'durable';
    return 'working';
}

function inferPrimaryHost(source, view, factId, eventId) {
    const explicit = objectValue(source.primaryHost ?? source.primary_host);
    const explicitType = normalizedHostType(explicit.type ?? explicit.kind);
    const explicitId = text(explicit.id ?? explicit.hostId ?? explicit.host_id, 180);
    if (explicitType && explicitId)
        return { type: explicitType, id: explicitId };
    const table = text(view.table, 100);
    const rowId = text(view.rowId, 180);
    const role = normalizedHostType(view.semanticRole ?? source.type);
    if (rowId)
        return { type: role || table || 'customObjects', id: rowId };
    if (role === 'events' && eventId)
        return { type: 'events', id: eventId };
    // 旧事实没有稳定投影时不依据标题或 related_entities 猜对象，只挂入可审计的 legacy 宿主。
    return { type: 'legacy', id: factId };
}

function inferSubjectRef(source, view, host) {
    const explicit = normalizeSubjectRef(source.subjectRef ?? source.subject_ref);
    if (explicit)
        return explicit;
    const label = text(view.objectTitle, 240);
    if (host.type !== 'legacy' && host.type !== 'episodic')
        return { kind: 'stable', id: host.id, label: label || undefined };
    const related = Array.isArray(source.relatedEntities ?? source.related_entities)
        ? source.relatedEntities ?? source.related_entities
        : [];
    const weakLabel = text(related[0] || label || source.title, 240);
    return weakLabel ? { kind: 'weak', label: weakLabel } : undefined;
}

const CHARACTER_DURABLE_FACETS = new Set(['identity', 'relationship', 'ability']);
const CHARACTER_SUSTAINED_EFFECT_RE = /(承诺|约定|委托|雇佣|契约|债务|欠款|交易|交付|赠予|给予|取得|持有|保管|归还|偷取|抢夺|冲突|敌对|追捕|威胁|攻击|战斗|伤害|救援|治疗|保护|背叛|结盟|加入|离开队伍|告知|透露|情报|秘密|线索|证词|警告|邀请|命令|许可|拒绝|关系|好感|信任|仇恨|亲属|同伴|导师|下属|promise|contract|debt|trade|deliver|give|take|hold|conflict|attack|fight|injur|rescue|heal|protect|betray|alliance|inform|reveal|clue|secret|relationship)/i;

function characterAdmissionQualified(source, facet) {
    if (CHARACTER_DURABLE_FACETS.has(facet))
        return true;
    const evidence = [
        source.content,
        source.title,
        ...(Array.isArray(source.occurred) ? source.occurred : []),
        ...(Array.isArray(source.related_entities) ? source.related_entities : []),
    ].map((item) => text(item, 1200)).filter(Boolean).join(' ');
    return CHARACTER_SUSTAINED_EFFECT_RE.test(evidence);
}

/**
 * 新角色必须具备独立身份、关系/能力，或产生可持续影响。
 * 一句普通台词、站位、外观和即时反应仍可留作情景事实，但不得生成角色工作卡。
 */
function applyObjectAdmission(source, host, facet, storageClass, view, factId, options) {
    const unqualifiedNewCharacter = host.type === 'characters'
        && options.existingObject !== true
        && !characterAdmissionQualified(source, facet);
    if (!unqualifiedNewCharacter) {
        return {
            host,
            storageClass,
            view,
            admission: {
                admitted: true,
                objectQualified: options.existingObject === true || host.type !== 'characters' || facet !== 'appearance',
                projectionAllowed: true,
                reason: 'contract-route',
            },
        };
    }
    return {
        host: { type: 'episodic', id: factId },
        storageClass: 'episodic',
        view: undefined,
        admission: {
            admitted: true,
            objectQualified: false,
            projectionAllowed: false,
            reason: facet === 'appearance'
                ? 'appearance-alone-does-not-create-character'
                : 'no-sustained-character-effect',
        },
    };
}

export function applyFactContractGate(value, options = {}) {
    const source = objectValue(value);
    const factId = text(source.factId ?? source.fact_id ?? source.id, 180)
        || `fact_${hashText(`${source.title || ''}|${source.content || ''}|${options.index || 0}`)}`;
    const eventId = explicitEventId(source);
    const view = source.view && typeof source.view === 'object' ? structuredClone(source.view) : undefined;
    const facet = inferFacet(source, view ?? {});
    const inferredHost = inferPrimaryHost(source, view ?? {}, factId, eventId);
    const inferredStorage = inferStorageClass(source, inferredHost.type, facet, eventId);
    const admitted = applyObjectAdmission(source, inferredHost, facet, inferredStorage, view, factId, options);
    const timeRange = objectValue(source.timeRange ?? source.time_range);
    const operation = text(source.operation, 40);
    const sourceMessageId = text(options.sourceMessageId, 200);
    const validFrom = text(source.validFrom ?? source.valid_from ?? timeRange.start, 200) || sourceMessageId || undefined;
    const validTo = text(source.validTo ?? source.valid_to ?? timeRange.end, 200)
        || (['close'].includes(operation) ? sourceMessageId || undefined : undefined);
    const evidence = text(source.evidenceKind ?? source.evidence_kind ?? source.confidence, 40);
    return {
        factId,
        eventId,
        subjectRef: inferSubjectRef(source, admitted.view ?? view ?? {}, admitted.host),
        primaryHost: admitted.host,
        facet,
        storageClass: admitted.storageClass,
        validFrom,
        validTo,
        supersedesFactId: text(source.supersedesFactId ?? source.supersedes_fact_id, 180) || undefined,
        supersededByFactId: text(source.supersededByFactId ?? source.superseded_by_fact_id, 180) || undefined,
        evidenceKind: FACT_EVIDENCE_KINDS.has(evidence) ? evidence : 'uncertain',
        projectionHint: admitted.view ? structuredClone(admitted.view) : undefined,
        view: admitted.view,
        admission: admitted.admission,
    };
}
