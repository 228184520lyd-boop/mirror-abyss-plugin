import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_TABLE_REGISTRY } from '../domain/table-registry.js';
import { migrateSnapshotTables, normalizeTableRegistry, tableByRole } from '../domain/table-registry.js';
import { emptySnapshot } from '../domain/snapshot.js';
import { parseStateTextOutput } from '../domain/state-text.js';
import { transitionStateSnapshot } from '../domain/memory-state-machine.js';
import { normalizeFactPackage } from '../domain/facts.js';
import { mergeInternalFacts, normalizeInternalFacts, pendingFactsByEvent } from '../domain/internal-facts.js';
import { buildLorebookDocuments } from '../domain/lorebook-publish.js';
import { buildEventProfiles } from '../domain/event-profile.js';
import { finalizeSettlingEntries } from '../domain/entry-lifecycle.js';
import { applySummaryLayer, hasEligibleLargeSummary, hasEligibleSmallSummary } from '../pipeline/summary.js';
import { reconcileLorebookEntries } from '../pipeline/lorebook.js';
import { stateSystemPrompt } from '../prompts/state.js';

const registry = normalizeTableRegistry(DEFAULT_TABLE_REGISTRY);
const eventTable = tableByRole(registry, 'events', false);
const characterTable = tableByRole(registry, 'characters', false) || tableByRole(registry, 'state', false);

function eventOutput(statusLine = '', core = '林默打开库房侧门。', extra = '') {
    return `<MA_TURN>
林默打开库房侧门。
</MA_TURN>
<MA_EVENT>
潜入库房
${statusLine}
<MA_CORE>
${core}
</MA_CORE>
${extra}
</MA_EVENT>`;
}

function namedEventOutput(eventName, core, extra = '') {
    return `<MA_TURN>
${core}
</MA_TURN>
<MA_EVENT>
${eventName}
<MA_CORE>
${core}
</MA_CORE>
${extra}
</MA_EVENT>`;
}

function commitParsed(previous, parsed, existingFacts, messageKey) {
    const transition = transitionStateSnapshot({
        previous,
        incoming: parsed.snapshot,
        patchSnapshot: parsed.snapshot,
        facts: parsed.facts,
        internalFacts: existingFacts,
        registry,
    });
    const packageValue = normalizeFactPackage(parsed, messageKey);
    const incomingFacts = normalizeInternalFacts(packageValue.facts, messageKey);
    return {
        snapshot: transition.snapshot,
        facts: mergeInternalFacts(existingFacts, incomingFacts, incomingFacts),
    };
}

test('legacy 已结束 line cannot close an event after an atomic action', () => {
    const parsed = parseStateTextOutput(
        eventOutput('已结束'),
        emptySnapshot(registry),
        registry,
        [],
        { sourceText: '林默打开库房侧门。' },
    );
    const statusFact = parsed.facts.find((fact) => fact.title.endsWith('事件状态'));
    assert.equal(statusFact.operation, 'create');
    assert.equal(statusFact.status, 'active');
    assert.equal(parsed.snapshot[eventTable.key][0].status, '进行中');
    const transition = transitionStateSnapshot({
        previous: emptySnapshot(registry),
        incoming: parsed.snapshot,
        patchSnapshot: parsed.snapshot,
        facts: parsed.facts,
        registry,
    });
    assert.equal(transition.snapshot[eventTable.key][0].entryLifecycle, undefined);
});

test('plugin closes only when source and fact modules both state an explicit event terminal', () => {
    const result = '<MA_EVENT_RESULT>\n潜入库房任务已完成。\n</MA_EVENT_RESULT>';
    const parsed = parseStateTextOutput(
        eventOutput('已结束', '林默取得账册并安全撤离，潜入库房任务已完成。', result),
        emptySnapshot(registry),
        registry,
        [],
        { sourceText: '林默取得账册并安全撤离，潜入库房任务已完成。' },
    );
    const statusFact = parsed.facts.find((fact) => fact.title.endsWith('事件状态'));
    assert.equal(statusFact.operation, 'close');
    assert.equal(statusFact.status, 'closed');
    assert.equal(parsed.snapshot[eventTable.key][0].status, '已结束');
    const transition = transitionStateSnapshot({
        previous: emptySnapshot(registry),
        incoming: parsed.snapshot,
        patchSnapshot: parsed.snapshot,
        facts: parsed.facts,
        registry,
    });
    assert.equal(transition.snapshot[eventTable.key][0].entryLifecycle?.state, 'settling');
});

test('scene change pre-exits only an old-scene transient NPC', () => {
    const spacetimeTable = tableByRole(registry, 'spacetime', false);
    const sceneTable = tableByRole(registry, 'scenes', false);
    const previous = emptySnapshot(registry);
    previous[spacetimeTable.key] = [{
        id: 'spacetime_current',
        title: '港口酒馆',
        content: '林默位于港口酒馆。',
        status: '当前',
        keywords: ['港口酒馆'],
        fields: { relatedObjects: ['酒保'] },
        eventIds: ['event-tavern'],
        source: 'auto',
    }];
    previous[sceneTable.key] = [{
        id: 'scene-tavern',
        title: '港口酒馆',
        content: '林默向酒保打听消息。',
        status: '当前场景',
        keywords: ['港口酒馆'],
        fields: { relatedObjects: ['酒保'] },
        eventIds: ['event-tavern'],
        source: 'auto',
    }];
    previous[characterTable.key] = [{
        id: 'npc-bartender',
        title: '酒保',
        content: '酒保向林默提供一次性消息。',
        status: '在场',
        keywords: ['酒保'],
        fields: { currentFacts: ['酒保提供了码头消息。'] },
        factIds: ['fact-bartender'],
        source: 'auto',
    }];
    const incoming = structuredClone(previous);
    incoming[spacetimeTable.key] = [{
        ...incoming[spacetimeTable.key][0],
        title: '东侧码头',
        content: '林默已经抵达东侧码头。',
        keywords: ['东侧码头'],
        eventIds: ['event-docks'],
    }];
    const transition = transitionStateSnapshot({
        previous,
        incoming,
        patchSnapshot: { [spacetimeTable.key]: incoming[spacetimeTable.key] },
        facts: [],
        registry,
    });
    assert.equal(transition.sceneBoundary?.previousTitle, '港口酒馆');
    assert.equal(transition.sceneBoundary?.currentTitle, '东侧码头');
    assert.equal(transition.snapshot[spacetimeTable.key][0].title, '东侧码头');
    assert.equal(transition.snapshot[sceneTable.key][0].entryLifecycle?.state, 'settling');
    assert.equal(transition.snapshot[characterTable.key][0].entryLifecycle?.state, 'settling');
});

test('scene change keeps an NPC that continues into the new scene', () => {
    const spacetimeTable = tableByRole(registry, 'spacetime', false);
    const sceneTable = tableByRole(registry, 'scenes', false);
    const previous = emptySnapshot(registry);
    previous[spacetimeTable.key] = [{
        id: 'spacetime_current', title: '港口酒馆', content: '林默位于港口酒馆。', status: '当前',
        keywords: ['港口酒馆'], fields: { relatedObjects: ['向导'] }, source: 'auto',
    }];
    previous[sceneTable.key] = [{
        id: 'scene-tavern', title: '港口酒馆', content: '向导与林默会合。', status: '当前场景',
        keywords: ['港口酒馆'], fields: { relatedObjects: ['向导'] }, source: 'auto',
    }];
    previous[characterTable.key] = [{
        id: 'npc-guide', title: '向导', content: '向导与林默同行。', status: '同行',
        keywords: ['向导'], fields: { currentFacts: ['向导与林默同行。'] }, source: 'auto',
    }];
    const incoming = structuredClone(previous);
    incoming[spacetimeTable.key][0] = {
        ...incoming[spacetimeTable.key][0], title: '东侧码头', content: '林默与向导抵达东侧码头。', keywords: ['东侧码头'],
    };
    incoming[characterTable.key][0] = {
        ...incoming[characterTable.key][0], content: '向导跟随林默抵达东侧码头。',
    };
    const transition = transitionStateSnapshot({
        previous,
        incoming,
        patchSnapshot: {
            [spacetimeTable.key]: incoming[spacetimeTable.key],
            [characterTable.key]: incoming[characterTable.key],
        },
        facts: [],
        registry,
    });
    assert.equal(transition.snapshot[characterTable.key][0].entryLifecycle, undefined);
});

test('scene boundary makes only its related event eligible for an early small summary', () => {
    const facts = normalizeInternalFacts([
        {
            fact_id: 'fact-tavern',
            event_id: 'event-tavern',
            type: 'events',
            title: '酒馆问询',
            content: '酒保提供了码头消息。',
            occurred: ['酒保提供了码头消息。'],
            source_message_ids: ['message-1'],
            status: 'active',
            confidence: 'confirmed',
        },
        {
            fact_id: 'fact-other',
            event_id: 'event-other',
            type: 'events',
            title: '远方阴谋',
            content: '远方阴谋仍在发展。',
            occurred: ['远方阴谋仍在发展。'],
            source_message_ids: ['message-1'],
            status: 'active',
            confidence: 'confirmed',
        },
    ]);
    assert.equal(hasEligibleSmallSummary(facts, 12), false);
    assert.equal(hasEligibleSmallSummary(facts, 12, ['event-tavern']), true);
});

test('scene-boundary transient NPC can leave after small-summary coverage while its batch event remains open', () => {
    const snapshot = emptySnapshot(registry);
    snapshot[characterTable.key] = [{
        id: 'npc-bartender',
        title: '酒保',
        content: '酒保向林默提供了一次性消息。',
        status: '待结算：退出独立条目',
        keywords: ['酒保'],
        fields: { currentFacts: ['酒保提供了码头消息。'] },
        factIds: ['fact-bartender'],
        source: 'auto',
        entryLifecycle: {
            state: 'settling',
            action: 'retire',
            trigger: 'scene-boundary',
            triggerEventIds: ['event-tavern'],
            note: '酒保已离开当前叙事。',
        },
    }];
    snapshot[eventTable.key] = [{
        id: 'event-tavern',
        title: '酒馆问询',
        content: '林默已经取得码头消息，后续调查仍在继续。',
        status: '进行中',
        keywords: ['酒馆问询'],
        fields: { recentHistory: ['酒保提供了码头消息。'] },
        eventId: 'event-tavern',
        eventIds: ['event-tavern'],
        factIds: ['fact-event-tavern'],
        source: 'auto',
    }];
    const result = finalizeSettlingEntries(snapshot, {
        eventId: 'event-tavern',
        sourceFactIds: ['fact-bartender'],
        eventClosed: false,
        internalFacts: [{ factId: 'fact-bartender', consumedBySmallSummaryId: 'small-tavern' }],
        registry,
    });
    assert.deepEqual(result.deletedRowIds, ['npc-bartender']);
    assert.equal(result.snapshot[eventTable.key][0].id, 'event-tavern');
});

test('an open cross-scene event prevents its NPC from entering scene-boundary settling', () => {
    const spacetimeTable = tableByRole(registry, 'spacetime', false);
    const sceneTable = tableByRole(registry, 'scenes', false);
    const previous = emptySnapshot(registry);
    previous[spacetimeTable.key] = [{
        id: 'spacetime_current', title: '港口酒馆', content: '林默位于港口酒馆。', status: '当前',
        keywords: ['港口酒馆'], fields: { relatedObjects: ['线人'] }, eventIds: ['event-investigation'], source: 'auto',
    }];
    previous[sceneTable.key] = [{
        id: 'scene-tavern', title: '港口酒馆', content: '线人交付调查线索。', status: '当前场景',
        keywords: ['港口酒馆'], fields: { relatedObjects: ['线人'] }, eventIds: ['event-investigation'], source: 'auto',
    }];
    previous[characterTable.key] = [{
        id: 'npc-informant', title: '线人', content: '线人仍负责后续接应。', status: '暂时离场',
        keywords: ['线人'], fields: { currentFacts: ['线人仍负责后续接应。'] },
        eventId: 'event-investigation', eventIds: ['event-investigation'], source: 'auto',
    }];
    previous[eventTable.key] = [{
        id: 'event-investigation', title: '码头调查', content: '调查仍在继续。', status: '进行中',
        keywords: ['码头调查'], fields: { currentFacts: ['仍需查明走私船。'] },
        eventId: 'event-investigation', eventIds: ['event-investigation'], source: 'auto',
    }];
    const incoming = structuredClone(previous);
    incoming[spacetimeTable.key][0] = {
        ...incoming[spacetimeTable.key][0], title: '东侧码头', content: '林默抵达东侧码头。', keywords: ['东侧码头'],
    };
    const transition = transitionStateSnapshot({
        previous,
        incoming,
        patchSnapshot: { [spacetimeTable.key]: incoming[spacetimeTable.key] },
        facts: [],
        registry,
    });
    assert.equal(transition.snapshot[characterTable.key][0].entryLifecycle, undefined);
});

test('unresolved items keep an explicitly terminal event open', () => {
    const unresolved = '<MA_UNRESOLVED>\n账册下落仍未确认。\n</MA_UNRESOLVED>';
    const parsed = parseStateTextOutput(
        eventOutput('', '潜入库房任务已完成。', unresolved),
        emptySnapshot(registry),
        registry,
        [],
        { sourceText: '潜入库房任务已完成，但账册下落仍未确认。' },
    );
    const statusFact = parsed.facts.find((fact) => fact.title.endsWith('事件状态'));
    assert.equal(statusFact.operation, 'create');
    assert.equal(statusFact.status, 'active');
});

test('fact package retains deterministic view projection metadata', () => {
    const parsed = parseStateTextOutput(
        eventOutput(),
        emptySnapshot(registry),
        registry,
        [],
        { sourceText: '林默打开库房侧门。' },
    );
    const packageValue = normalizeFactPackage(parsed, 'message-1');
    const facts = normalizeInternalFacts(packageValue.facts, 'message-1');
    const core = facts.find((fact) => fact.title.includes('潜入库房'));
    assert.equal(core.view.table, eventTable.key);
    assert.equal(core.view.objectTitle, '潜入库房');
    assert.ok(core.view.rowId);
});

test('world-book compiler publishes formal facts when the snapshot has no rows', () => {
    const fact = normalizeInternalFacts([{
        fact_id: 'fact_clothing',
        event_id: 'event_arrival',
        type: 'characters',
        title: '白澄·外观表现',
        content: '白澄抵达内院时穿青色外衣。',
        occurred: ['白澄抵达内院时穿青色外衣。'],
        related_entities: ['白澄'],
        keywords: ['白澄', '青色外衣'],
        status: 'active',
        confidence: 'confirmed',
    }])[0];
    const documents = buildLorebookDocuments(emptySnapshot(registry), [], [], {
        layout: 'semantic',
        registry,
        internalFacts: [fact],
        vectorize: true,
        latestContinuityConstant: true,
        totalCapacity: 24000,
        maxVectorResults: 8,
        similarityThreshold: 0.72,
        recursion: true,
        entryLimits: {},
    });
    assert.equal(documents.length, 1);
    assert.equal(documents[0].key, 'fact:fact_clothing');
    assert.match(documents[0].content, /青色外衣/);
});

test('world-book compiler does not duplicate a fact already represented by a view', () => {
    const parsed = parseStateTextOutput(
        eventOutput(),
        emptySnapshot(registry),
        registry,
        [],
        { sourceText: '林默打开库房侧门。' },
    );
    const facts = normalizeInternalFacts(normalizeFactPackage(parsed, 'message-2').facts, 'message-2');
    const documents = buildLorebookDocuments(parsed.snapshot, [], [], {
        layout: 'semantic',
        registry,
        internalFacts: facts,
        vectorize: true,
        latestContinuityConstant: true,
        totalCapacity: 24000,
        maxVectorResults: 8,
        similarityThreshold: 0.72,
        recursion: true,
        entryLimits: {},
    });
    assert.equal(documents.filter((item) => item.key.startsWith('fact:')).length, 0);
    assert.equal(documents.filter((item) => item.key.startsWith(`view:${eventTable.key}:`)).length, 1);
});

test('settling event keeps one active summary fallback when its view is paused', () => {
    const snapshot = emptySnapshot(registry);
    snapshot[eventTable.key] = [{
        id: 'event-row',
        title: '守卫拒绝入内',
        content: '守卫拒绝白澄进入内院。',
        status: '待结算：退出独立条目',
        keywords: ['守卫拒绝入内'],
        fields: { recentHistory: ['守卫拒绝白澄进入内院。'] },
        eventId: 'event-denied',
        eventIds: ['event-denied'],
        factIds: ['fact-denied'],
        source: 'auto',
        locked: false,
        entryLifecycle: { state: 'settling', action: 'retire', note: '守卫拒绝白澄进入内院。' },
    }];
    const facts = normalizeInternalFacts([{
        fact_id: 'fact-denied',
        event_id: 'event-denied',
        type: 'events',
        title: '守卫拒绝入内',
        content: '守卫拒绝白澄进入内院。',
        occurred: ['守卫拒绝白澄进入内院。'],
        status: 'closed',
        confidence: 'confirmed',
        view: {
            table: eventTable.key,
            rowId: 'event-row',
            objectTitle: '守卫拒绝入内',
            semanticRole: 'events',
            layerKind: 'content',
            value: '守卫拒绝白澄进入内院。',
        },
    }]);
    const small = [{
        id: 'small-denied',
        kind: 'small',
        eventId: 'event-denied',
        sourceKeys: ['fact-denied'],
        sourceFactIds: ['fact-denied'],
        title: '守卫拒绝入内',
        summary: '守卫拒绝白澄进入内院，此结果已经确定。',
        unresolvedItems: [],
    }];
    const documents = buildLorebookDocuments(snapshot, small, [], {
        layout: 'semantic',
        registry,
        internalFacts: facts,
        vectorize: true,
        latestContinuityConstant: true,
        totalCapacity: 24000,
        maxVectorResults: 8,
        similarityThreshold: 0.72,
        recursion: true,
        entryLimits: {},
    });
    assert.equal(documents.filter((item) => item.disabled).length, 1);
    assert.equal(documents.filter((item) => !item.disabled).length, 1);
    assert.equal(documents.find((item) => !item.disabled)?.key, 'summary:small-denied');
});

test('settling event falls back to formal fact when no summary exists', () => {
    const snapshot = emptySnapshot(registry);
    snapshot[eventTable.key] = [{
        id: 'event-row',
        title: '旧约失效',
        content: '旧约已经失效。',
        status: '待结算：退出独立条目',
        keywords: ['旧约'],
        fields: {},
        eventId: 'event-old-pact',
        eventIds: ['event-old-pact'],
        factIds: ['fact-old-pact'],
        source: 'auto',
        locked: false,
        entryLifecycle: { state: 'settling', action: 'retire', note: '旧约已经失效。' },
    }];
    const facts = normalizeInternalFacts([{
        fact_id: 'fact-old-pact',
        event_id: 'event-old-pact',
        type: 'events',
        title: '旧约失效',
        content: '旧约已经失效。',
        occurred: ['旧约已经失效。'],
        status: 'closed',
        confidence: 'confirmed',
        view: {
            table: eventTable.key,
            rowId: 'event-row',
            objectTitle: '旧约失效',
            semanticRole: 'events',
            layerKind: 'content',
            value: '旧约已经失效。',
        },
    }]);
    const documents = buildLorebookDocuments(snapshot, [], [], {
        layout: 'semantic',
        registry,
        internalFacts: facts,
        vectorize: true,
        latestContinuityConstant: true,
        totalCapacity: 24000,
        maxVectorResults: 8,
        similarityThreshold: 0.72,
        recursion: true,
        entryLimits: {},
    });
    assert.equal(documents.filter((item) => !item.disabled).length, 1);
    assert.equal(documents.find((item) => !item.disabled)?.key, 'fact:fact-old-pact');
});

test('user-disabled event table suppresses view, fact and summary publication without deleting data', () => {
    const disabledRegistry = registry.map((table) => table.key === eventTable.key ? { ...table, enabled: false } : table);
    const facts = normalizeInternalFacts([{
        fact_id: 'fact-hidden-event',
        event_id: 'event-hidden',
        type: 'events',
        title: '隐藏事件',
        content: '隐藏事件已经发生。',
        occurred: ['隐藏事件已经发生。'],
        status: 'active',
        confidence: 'confirmed',
        view: {
            table: eventTable.key,
            rowId: 'event-hidden-row',
            objectTitle: '隐藏事件',
            semanticRole: 'events',
            layerKind: 'content',
            value: '隐藏事件已经发生。',
        },
    }]);
    const documents = buildLorebookDocuments(emptySnapshot(registry), [{
        id: 'small-hidden',
        kind: 'small',
        eventId: 'event-hidden',
        sourceKeys: ['fact-hidden-event'],
        sourceFactIds: ['fact-hidden-event'],
        title: '隐藏事件',
        summary: '隐藏事件已经发生。',
    }], [], {
        layout: 'semantic',
        registry: disabledRegistry,
        internalFacts: facts,
        vectorize: true,
        latestContinuityConstant: true,
        totalCapacity: 24000,
        maxVectorResults: 8,
        similarityThreshold: 0.72,
        recursion: true,
        entryLimits: {},
    });
    assert.equal(documents.some((item) => item.eventIds.includes('event-hidden')), false);
    assert.equal(facts.length, 1);
});

test('world-book compiler preserves the complete vector storage set beyond runtime recall limits', () => {
    const facts = normalizeInternalFacts(Array.from({ length: 12 }, (_, index) => ({
        fact_id: `fact-history-${index}`,
        event_id: `event-history-${index}`,
        type: 'events',
        title: `历史事件 ${index}`,
        content: `第 ${index} 条已经结束的历史事实，内容各不相同。`,
        occurred: [`第 ${index} 条已经结束的历史事实，内容各不相同。`],
        status: 'closed',
        confidence: 'confirmed',
    })));
    const documents = buildLorebookDocuments(emptySnapshot(registry), [], [], {
        layout: 'semantic',
        registry,
        internalFacts: facts,
        vectorize: true,
        latestContinuityConstant: true,
        totalCapacity: 2000,
        maxVectorResults: 8,
        similarityThreshold: 0.72,
        recursion: true,
        entryLimits: {},
    });
    assert.equal(documents.length, 12);
    assert.equal(documents.every((item) => item.vectorized), true);
});

test('state prompt no longer asks the model to invent unresolved items', () => {
    const prompt = stateSystemPrompt(registry);
    assert.doesNotMatch(prompt, /<MA_UNRESOLVED>/);
    assert.doesNotMatch(prompt, /守卫可能在烟雾散去后/);
    assert.match(prompt, /不单独生成“未决事项”/);
});

test('conservative terminal recognizer accepts additional explicit end phrasings', () => {
    const cases = [
        '码头冲突已经结束。',
        '双方散去，此事就此作罢。',
        '对方认输后不再追究。',
    ];
    for (const statement of cases) {
        const parsed = parseStateTextOutput(
            eventOutput('', statement, `<MA_EVENT_RESULT>\n${statement}\n</MA_EVENT_RESULT>`),
            emptySnapshot(registry),
            registry,
            [],
            { sourceText: statement },
        );
        const statusFact = parsed.facts.find((fact) => fact.title.endsWith('事件状态'));
        assert.equal(statusFact.operation, 'close', statement);
        assert.equal(statusFact.status, 'closed', statement);
    }
});

test('retiring event stays when no independent object received its memory', () => {
    const snapshot = emptySnapshot(registry);
    snapshot[eventTable.key] = [{
        id: 'event-row',
        title: '守卫拒绝入内',
        content: '守卫拒绝白澄进入内院。',
        status: '待结算：退出独立条目',
        keywords: ['守卫拒绝入内'],
        fields: { recentHistory: ['守卫拒绝白澄进入内院。'] },
        eventId: 'event-denied',
        eventIds: ['event-denied'],
        factIds: ['fact-denied'],
        source: 'auto',
        locked: false,
        entryLifecycle: { state: 'settling', action: 'retire', note: '守卫拒绝白澄进入内院。' },
    }];
    const result = finalizeSettlingEntries(snapshot, {
        eventId: 'event-denied',
        sourceFactIds: ['fact-denied'],
        eventClosed: true,
        internalFacts: [{ factId: 'fact-denied', consumedBySmallSummaryId: 'small-1' }],
        registry,
    });
    assert.deepEqual(result.deletedRowIds, []);
    assert.deepEqual(result.retainedRowIds, ['event-row']);
});

test('retiring event can be deleted after another active object received the summary', () => {
    const snapshot = emptySnapshot(registry);
    snapshot[eventTable.key] = [{
        id: 'event-row',
        title: '守卫拒绝入内',
        content: '守卫拒绝白澄进入内院。',
        status: '待结算：退出独立条目',
        keywords: ['守卫拒绝入内'],
        fields: {},
        eventId: 'event-denied',
        eventIds: ['event-denied'],
        factIds: ['fact-denied'],
        source: 'auto',
        locked: false,
        entryLifecycle: { state: 'settling', action: 'retire', note: '守卫拒绝白澄进入内院。' },
    }];
    snapshot[characterTable.key] = [{
        id: 'character-baicheng',
        title: '白澄',
        content: '白澄',
        status: 'active',
        keywords: ['白澄'],
        fields: { recentHistory: ['守卫拒绝她进入内院。'] },
        eventId: 'event-denied',
        eventIds: ['event-denied'],
        factIds: ['fact-baicheng'],
        source: 'auto',
        locked: false,
    }];
    const result = finalizeSettlingEntries(snapshot, {
        eventId: 'event-denied',
        sourceFactIds: ['fact-denied'],
        eventClosed: true,
        internalFacts: [{ factId: 'fact-denied', consumedBySmallSummaryId: 'small-1' }],
        registry,
    });
    assert.deepEqual(result.deletedRowIds, ['event-row']);
});

test('large-summary threshold uses retained cumulative small-summary count', () => {
    const small = [{
        id: 'small-current',
        kind: 'small',
        eventId: 'event-open',
        sourceKeys: ['fact-1'],
        sourceFactIds: ['fact-1'],
        summary: '事件累计进展。',
        rollupCount: 4,
        eventClosed: false,
    }];
    assert.equal(hasEligibleLargeSummary(small, [], 4), true);
    assert.equal(hasEligibleLargeSummary([{ ...small[0], rollupCount: 3 }], [], 4), false);
});

test('snapshot migration does not crash when the character view was deleted', () => {
    const withoutCharacters = registry.filter((table) => !['characters', 'state'].includes(table.role));
    const migrated = migrateSnapshotTables({
        characters: [{
            id: 'character-old',
            title: '白澄',
            content: '白澄',
            status: 'active',
            keywords: ['白澄'],
            fields: {},
        }],
    }, withoutCharacters);
    assert.equal(Object.prototype.hasOwnProperty.call(migrated, 'characters'), false);
});

test('renamed event reuses one stable event_id for every module in the block', () => {
    const first = parseStateTextOutput(
        namedEventOutput(
            '潜入库房',
            '林默打开库房侧门。',
            '<MA_CHARACTER_STATE>\n林默\n已经进入库房。\n</MA_CHARACTER_STATE>',
        ),
        emptySnapshot(registry),
        registry,
        [],
        { sourceText: '林默打开库房侧门并进入库房。' },
    );
    const firstCommit = commitParsed(emptySnapshot(registry), first, [], 'message-1');
    const originalEventId = firstCommit.facts.find((fact) => fact.type === 'events').eventId;

    const second = parseStateTextOutput(
        namedEventOutput(
            '取得账册并撤离',
            '林默取得账册后开始撤离库房。',
            '<MA_CHARACTER_STATE>\n林默\n已经取得账册并开始撤离。\n</MA_CHARACTER_STATE>',
        ),
        firstCommit.snapshot,
        registry,
        firstCommit.facts,
        { sourceText: '林默在库房取得账册后开始撤离。' },
    );
    assert.deepEqual([...new Set(second.facts.map((fact) => fact.event_id))], [originalEventId]);
    assert.equal(second.snapshot[eventTable.key].length, 1);
    assert.equal(second.snapshot[eventTable.key][0].title, '潜入库房');
});

test('ambiguous object event links do not guess a previous event_id', () => {
    const previous = emptySnapshot(registry);
    previous[characterTable.key] = [{
        id: 'character-linmo',
        title: '林默',
        content: '林默',
        status: 'active',
        keywords: ['林默'],
        fields: {},
        eventId: 'event-a',
        eventIds: ['event-a', 'event-b'],
        factIds: [],
        source: 'auto',
        locked: false,
    }];
    const parsed = parseStateTextOutput(
        namedEventOutput(
            '新的会面',
            '林默在码头与商人会面。',
            '<MA_CHARACTER_STATE>\n林默\n正在码头与商人会面。\n</MA_CHARACTER_STATE>',
        ),
        previous,
        registry,
        [],
        { sourceText: '林默在码头与商人会面。' },
    );
    const eventIds = [...new Set(parsed.facts.map((fact) => fact.event_id))];
    assert.equal(eventIds.length, 1);
    assert.notEqual(eventIds[0], 'event-a');
    assert.notEqual(eventIds[0], 'event-b');
});

test('core-only continuation can reuse a uniquely anchored open event', () => {
    const first = parseStateTextOutput(
        namedEventOutput(
            '潜入库房',
            '林默打开库房侧门。',
            '<MA_CHARACTER_STATE>\n林默\n已经进入库房。\n</MA_CHARACTER_STATE>',
        ),
        emptySnapshot(registry),
        registry,
        [],
        { sourceText: '林默打开库房侧门并进入库房。' },
    );
    const firstCommit = commitParsed(emptySnapshot(registry), first, [], 'message-1');
    const originalEventId = firstCommit.facts.find((fact) => fact.type === 'events').eventId;
    const second = parseStateTextOutput(
        namedEventOutput('取到账册', '林默在库房内取得账册。'),
        firstCommit.snapshot,
        registry,
        firstCommit.facts,
        { sourceText: '林默在库房内取得账册。' },
    );
    assert.deepEqual([...new Set(second.facts.map((fact) => fact.event_id))], [originalEventId]);
});

test('closed event is not reused for a new event involving the same character', () => {
    const first = parseStateTextOutput(
        namedEventOutput(
            '潜入库房',
            '林默打开库房侧门。',
            '<MA_CHARACTER_STATE>\n林默\n已经进入库房。\n</MA_CHARACTER_STATE>',
        ),
        emptySnapshot(registry),
        registry,
        [],
        { sourceText: '林默打开库房侧门并进入库房。' },
    );
    const firstCommit = commitParsed(emptySnapshot(registry), first, [], 'message-1');
    const oldEventId = firstCommit.facts.find((fact) => fact.type === 'events').eventId;
    const closedSnapshot = structuredClone(firstCommit.snapshot);
    const eventRow = closedSnapshot[eventTable.key][0];
    eventRow.status = '已结束';
    eventRow.entryLifecycle = { state: 'settling', action: 'retire', note: '潜入任务已完成。' };
    const closedFacts = firstCommit.facts.map((fact) => fact.eventId === oldEventId
        ? { ...fact, active: false, status: 'closed' }
        : fact);
    const next = parseStateTextOutput(
        namedEventOutput(
            '码头会面',
            '林默在码头与商人会面。',
            '<MA_CHARACTER_STATE>\n林默\n正在码头与商人会面。\n</MA_CHARACTER_STATE>',
        ),
        closedSnapshot,
        registry,
        closedFacts,
        { sourceText: '林默在码头与商人会面。' },
    );
    const eventIds = [...new Set(next.facts.map((fact) => fact.event_id))];
    assert.equal(eventIds.length, 1);
    assert.notEqual(eventIds[0], oldEventId);
});

test('closed event name can be used again without reviving its old event_id', () => {
    const first = parseStateTextOutput(
        namedEventOutput(
            '码头会面',
            '林默在码头与旧商人会面。',
            '<MA_CHARACTER_STATE>\n林默\n正在码头与旧商人会面。\n</MA_CHARACTER_STATE>',
        ),
        emptySnapshot(registry),
        registry,
        [],
        { sourceText: '林默在码头与旧商人会面。' },
    );
    const firstCommit = commitParsed(emptySnapshot(registry), first, [], 'message-1');
    const oldEventId = firstCommit.facts.find((fact) => fact.type === 'events').eventId;
    const closedSnapshot = structuredClone(firstCommit.snapshot);
    const eventRow = closedSnapshot[eventTable.key][0];
    eventRow.status = '已结束';
    eventRow.entryLifecycle = { state: 'settling', action: 'retire', note: '旧会面已经结束。' };
    const closedFacts = firstCommit.facts.map((fact) => fact.eventId === oldEventId
        ? { ...fact, active: false, status: 'closed' }
        : fact);
    const next = parseStateTextOutput(
        namedEventOutput(
            '码头会面',
            '数日后林默在码头与新商人会面。',
            '<MA_CHARACTER_STATE>\n林默\n正在码头与新商人会面。\n</MA_CHARACTER_STATE>',
        ),
        closedSnapshot,
        registry,
        closedFacts,
        { sourceText: '数日后林默在码头与新商人会面。' },
    );
    const nextEventId = next.facts[0].event_id;
    assert.notEqual(nextEventId, oldEventId);
    assert.ok(next.facts.every((fact) => fact.event_id === nextEventId));
});

test('play-order replay keeps one event through close, distribution and lorebook readback', () => {
    let snapshot = emptySnapshot(registry);
    let facts = [];

    const turn1 = parseStateTextOutput(
        namedEventOutput(
            '潜入库房',
            '林默打开库房侧门。',
            '<MA_CHARACTER_STATE>\n林默\n已经进入库房。\n</MA_CHARACTER_STATE>',
        ),
        snapshot,
        registry,
        facts,
        { sourceText: '林默打开库房侧门并进入库房。' },
    );
    ({ snapshot, facts } = commitParsed(snapshot, turn1, facts, 'message-1'));
    const eventId = facts.find((fact) => fact.type === 'events').eventId;

    const turn2 = parseStateTextOutput(
        namedEventOutput(
            '取得账册并撤离',
            '林默取得账册后开始撤离库房。',
            '<MA_CHARACTER_STATE>\n林默\n已经取得账册并开始撤离。\n</MA_CHARACTER_STATE>',
        ),
        snapshot,
        registry,
        facts,
        { sourceText: '林默在库房取得账册后开始撤离。' },
    );
    ({ snapshot, facts } = commitParsed(snapshot, turn2, facts, 'message-2'));
    assert.deepEqual([...new Set(facts.map((fact) => fact.eventId))], [eventId]);

    const turn3 = parseStateTextOutput(
        namedEventOutput(
            '安全带回账册',
            '林默安全撤离并把账册交给委托人，潜入任务已完成。',
            '<MA_EVENT_RESULT>\n潜入任务已完成，账册已经交付。\n</MA_EVENT_RESULT>\n'
                + '<MA_CHARACTER_STATE>\n林默\n已经安全撤离库房。\n</MA_CHARACTER_STATE>',
        ),
        snapshot,
        registry,
        facts,
        { sourceText: '林默安全撤离并把账册交给委托人，潜入任务已完成。' },
    );
    ({ snapshot, facts } = commitParsed(snapshot, turn3, facts, 'message-3'));
    assert.deepEqual([...new Set(facts.map((fact) => fact.eventId))], [eventId]);
    assert.equal(snapshot[eventTable.key][0].entryLifecycle?.state, 'settling');

    const eventFacts = facts.filter((fact) => fact.eventId === eventId);
    const summary = {
        id: 'small-event',
        title: '潜入库房',
        summary: '林默潜入库房取得账册并安全交付，任务已经完成。',
        distributions: [{
            objectName: '林默',
            content: '林默取得账册并完成交付后安全撤离。',
        }],
    };
    snapshot = applySummaryLayer(snapshot, eventId, eventFacts, 'recentHistory', summary, [], registry);
    const character = snapshot[characterTable.key].find((row) => row.title === '林默');
    assert.deepEqual(character.fields.recentHistory, ['林默取得账册并完成交付后安全撤离。']);

    const documents = buildLorebookDocuments(snapshot, [summary], [], {
        layout: 'semantic',
        registry,
        internalFacts: facts,
        vectorize: true,
        latestContinuityConstant: true,
        totalCapacity: 24000,
        maxVectorResults: 8,
        similarityThreshold: 0.72,
        recursion: true,
        entryLimits: {},
    });
    const desired = new Map(documents.map((document) => [document.key, document]));
    const stored = { entries: {} };
    const wi = {
        world_info_position: { after: 1 },
        createWorldInfoEntry(_name, data) {
            const uid = String(Object.keys(data.entries).length + 1);
            data.entries[uid] = { uid, extensions: {} };
            return data.entries[uid];
        },
    };
    const firstWrite = reconcileLorebookEntries(stored, desired, 'chat-replay', wi, 'MA_Test', true);
    assert.equal(firstWrite.changed, true);
    const readback = structuredClone(stored);
    const verified = reconcileLorebookEntries(readback, desired, 'chat-replay', wi, 'MA_Test', true);
    assert.equal(verified.changed, false);
    const managedEventIds = Object.values(readback.entries)
        .flatMap((entry) => entry.extensions?.mirrorAbyssV11?.eventIds ?? []);
    assert.deepEqual([...new Set(managedEventIds)], [eventId]);
});

test('fact contract accepts an eventless episodic fact without inventing an event_id', () => {
    const packageValue = normalizeFactPackage({
        turnSummary: '侍卫从门前经过。',
        facts: [{
            fact_id: 'fact-guard-red',
            type: 'observation',
            title: '侍卫·外观观察',
            content: '门前侍卫当时穿红色外衣。',
            occurred: ['门前侍卫当时穿红色外衣。'],
            related_entities: ['门前侍卫'],
            confidence: 'confirmed',
            primary_host: { type: 'episodic', id: 'fact-guard-red' },
            subject_ref: { kind: 'weak', label: '门前侍卫' },
            facet: 'appearance',
            storage_class: 'episodic',
        }],
    }, 'message-episodic');
    const [fact] = normalizeInternalFacts(packageValue.facts, 'message-episodic');
    assert.equal(fact.eventId, undefined);
    assert.equal(fact.primaryHost.type, 'episodic');
    assert.equal(fact.storageClass, 'episodic');
    assert.equal(fact.facet, 'appearance');
    assert.equal(fact.validFrom, 'message-episodic');
    assert.equal(fact.subjectRef.kind, 'weak');
});

test('new character appearance remains episodic and cannot create a character card', () => {
    const parsed = parseStateTextOutput(
        namedEventOutput(
            '门前经过',
            '一名侍卫从门前经过。',
            '<MA_CHARACTER_APPEARANCE>\n门前侍卫\n当时穿红色外衣。\n</MA_CHARACTER_APPEARANCE>',
        ),
        emptySnapshot(registry),
        registry,
        [],
        { sourceText: '一名穿红色外衣的侍卫从门前经过。' },
    );
    const appearance = parsed.facts.find((fact) => fact.title.includes('门前侍卫'));
    assert.equal(appearance.storageClass, 'episodic');
    assert.equal(appearance.primaryHost.type, 'episodic');
    assert.equal(appearance.admission.objectQualified, false);
    assert.equal(appearance.view, undefined);
    assert.equal(parsed.snapshot[characterTable.key], undefined);
    const stored = normalizeInternalFacts(normalizeFactPackage(parsed, 'message-appearance').facts, 'message-appearance');
    assert.equal(pendingFactsByEvent(stored).has(appearance.eventId), true);
    assert.equal(pendingFactsByEvent(stored).get(appearance.eventId).some((fact) => fact.storageClass === 'episodic'), false);
});

test('appearance may update an already established character without changing its host', () => {
    const previous = emptySnapshot(registry);
    previous[characterTable.key] = [{
        id: 'character-linmo',
        title: '林默',
        content: '林默',
        status: 'active',
        keywords: ['林默'],
        fields: { baseContent: '潜行者' },
        source: 'auto',
        locked: false,
    }];
    const parsed = parseStateTextOutput(
        namedEventOutput(
            '更换伪装',
            '林默换上白色外衣。',
            '<MA_CHARACTER_APPEARANCE>\n林默\n现在穿白色外衣。\n</MA_CHARACTER_APPEARANCE>',
        ),
        previous,
        registry,
        [],
        { sourceText: '林默换上白色外衣。' },
    );
    const appearance = parsed.facts.find((fact) => fact.title.includes('林默'));
    assert.equal(appearance.primaryHost.type, 'characters');
    assert.equal(appearance.primaryHost.id, 'character-linmo');
    assert.equal(appearance.storageClass, 'working');
    assert.equal(appearance.admission.projectionAllowed, true);
    assert.equal(parsed.snapshot[characterTable.key][0].id, 'character-linmo');
});

test('one ordinary line from a new background speaker remains episodic and does not create a character card', () => {
    const parsed = parseStateTextOutput(
        namedEventOutput(
            '经过集市',
            '摊贩喊了一句“新鲜苹果”。',
            '<MA_CHARACTER_FACT>\n路边摊贩\n喊了一句“新鲜苹果”。\n</MA_CHARACTER_FACT>',
        ),
        emptySnapshot(registry),
        registry,
        [],
        { sourceText: '路边摊贩喊了一句“新鲜苹果”。' },
    );
    const fact = parsed.facts.find((item) => item.title.includes('路边摊贩'));
    assert.equal(fact.primaryHost.type, 'episodic');
    assert.equal(fact.admission.objectQualified, false);
    assert.equal(fact.admission.reason, 'no-sustained-character-effect');
    assert.equal(parsed.snapshot[characterTable.key], undefined);
});

test('a new NPC who provides a lasting clue is admitted as a character', () => {
    const parsed = parseStateTextOutput(
        namedEventOutput(
            '调查失踪案',
            '老船工向主角透露了走私船的秘密航线。',
            '<MA_CHARACTER_FACT>\n老船工\n向主角透露了走私船的秘密航线。\n</MA_CHARACTER_FACT>',
        ),
        emptySnapshot(registry),
        registry,
        [],
        { sourceText: '老船工向主角透露了走私船的秘密航线。' },
    );
    const fact = parsed.facts.find((item) => item.title.includes('老船工'));
    assert.equal(fact.primaryHost.type, 'characters');
    assert.equal(fact.admission.objectQualified, true);
    assert.equal(parsed.snapshot[characterTable.key].length, 1);
    assert.equal(parsed.snapshot[characterTable.key][0].title, '老船工');
});

test('a settling NPC explicitly returning in a new event restores the same stable ID', () => {
    const previous = emptySnapshot(registry);
    previous[characterTable.key] = [{
        id: 'character-old-sailor',
        title: '老船工',
        content: '老船工',
        status: '待结算：退出独立条目',
        keywords: ['老船工'],
        fields: { currentFacts: ['曾向主角提供秘密航线。'] },
        source: 'auto',
        locked: false,
        eventId: 'event-old',
        eventIds: ['event-old'],
        factIds: ['fact-old'],
        entryLifecycle: {
            state: 'settling',
            action: 'retire',
            trigger: 'scene-boundary',
            triggerEventIds: ['event-old'],
            note: '等待结算。',
        },
    }];
    const parsed = parseStateTextOutput(
        namedEventOutput(
            '港口重逢',
            '老船工再次出现，并警告主角今晚会有追捕。',
            '<MA_CHARACTER_FACT>\n老船工\n再次出现，并警告主角今晚会有追捕。\n</MA_CHARACTER_FACT>',
        ),
        previous,
        registry,
        [],
        { sourceText: '老船工再次出现，并警告主角今晚会有追捕。' },
    );
    const transition = transitionStateSnapshot({
        previous,
        incoming: parsed.snapshot,
        patchSnapshot: parsed.snapshot,
        facts: parsed.facts,
        registry,
    });
    const restored = transition.snapshot[characterTable.key][0];
    assert.equal(restored.id, 'character-old-sailor');
    assert.equal(restored.entryLifecycle, undefined);
    assert.equal(restored.status, 'active');
    assert.equal(transition.lifecycleAppliedIds.includes('character-old-sailor'), true);
});

test('eventless and episodic facts do not enter event summaries, event profiles or default world-book publication', () => {
    const [fact] = normalizeInternalFacts([{
        fact_id: 'fact-table-color',
        type: 'observation',
        title: '桌面观察',
        content: '会面时桌上放着蓝色杯子。',
        occurred: ['会面时桌上放着蓝色杯子。'],
        confidence: 'confirmed',
        primary_host: { type: 'episodic', id: 'fact-table-color' },
        facet: 'appearance',
        storage_class: 'episodic',
        valid_from: 'message-1',
    }]);
    assert.equal(pendingFactsByEvent([fact]).size, 0);
    assert.deepEqual(buildEventProfiles(emptySnapshot(registry), [fact], [], [], registry), []);
    const documents = buildLorebookDocuments(emptySnapshot(registry), [], [], {
        layout: 'semantic',
        registry,
        internalFacts: [fact],
        vectorize: true,
        latestContinuityConstant: true,
        totalCapacity: 24000,
        maxVectorResults: 8,
        similarityThreshold: 0.72,
        recursion: true,
        entryLimits: {},
    });
    assert.deepEqual(documents, []);
});

test('a replacement fact closes the old validity window and preserves both sides of the chain', () => {
    const [oldFact] = normalizeInternalFacts([{
        fact_id: 'fact-linmo-gender-old',
        type: 'characters',
        title: '林默·身份',
        content: '林默为男性。',
        occurred: ['林默为男性。'],
        confidence: 'confirmed',
        primary_host: { type: 'characters', id: 'character-linmo' },
        subject_ref: { kind: 'stable', id: 'character-linmo', label: '林默' },
        facet: 'identity',
        storage_class: 'durable',
        valid_from: 'message-1',
    }]);
    const [newFact] = normalizeInternalFacts([{
        fact_id: 'fact-linmo-gender-new',
        type: 'characters',
        title: '林默·身份',
        content: '林默现在为女性。',
        occurred: ['林默完成手术后现在为女性。'],
        confidence: 'confirmed',
        primary_host: { type: 'characters', id: 'character-linmo' },
        subject_ref: { kind: 'stable', id: 'character-linmo', label: '林默' },
        facet: 'identity',
        storage_class: 'durable',
        valid_from: 'message-2',
        supersedes_fact_id: 'fact-linmo-gender-old',
        operation: 'create',
    }]);
    const merged = mergeInternalFacts([oldFact], [newFact], [{
        factId: newFact.factId,
        operation: 'create',
    }]);
    const oldAfter = merged.find((fact) => fact.factId === oldFact.factId);
    const newAfter = merged.find((fact) => fact.factId === newFact.factId);
    assert.equal(oldAfter.active, false);
    assert.equal(oldAfter.validTo, 'message-2');
    assert.equal(oldAfter.supersededByFactId, newFact.factId);
    assert.equal(newAfter.active, true);
    assert.equal(newAfter.supersedesFactId, oldFact.factId);
});

test('natural replacement layers create a new fact while unchanged values reuse the current fact', () => {
    let snapshot = emptySnapshot(registry);
    snapshot[characterTable.key] = [{
        id: 'character-linmo',
        title: '林默',
        content: '林默',
        status: 'active',
        keywords: ['林默'],
        fields: { baseContent: '潜行者' },
        source: 'auto',
        locked: false,
    }];
    let facts = [];
    const first = parseStateTextOutput(
        namedEventOutput(
            '更换外衣',
            '林默换上青色外衣。',
            '<MA_CHARACTER_APPEARANCE>\n林默\n现在穿青色外衣。\n</MA_CHARACTER_APPEARANCE>',
        ),
        snapshot,
        registry,
        facts,
        { sourceText: '林默换上青色外衣。' },
    );
    ({ snapshot, facts } = commitParsed(snapshot, first, facts, 'message-1'));
    const firstAppearance = facts.find((fact) => fact.facet === 'appearance');

    const unchanged = parseStateTextOutput(
        namedEventOutput(
            '整理衣领',
            '林默整理青色外衣的衣领。',
            '<MA_CHARACTER_APPEARANCE>\n林默\n现在穿青色外衣。\n</MA_CHARACTER_APPEARANCE>',
        ),
        snapshot,
        registry,
        facts,
        { sourceText: '林默整理青色外衣的衣领。' },
    );
    const unchangedAppearance = unchanged.facts.find((fact) => fact.facet === 'appearance');
    assert.equal(unchangedAppearance.fact_id, firstAppearance.factId);
    assert.equal(unchangedAppearance.supersedes_fact_id, undefined);

    const changed = parseStateTextOutput(
        namedEventOutput(
            '再次更衣',
            '林默换上白色外衣。',
            '<MA_CHARACTER_APPEARANCE>\n林默\n现在穿白色外衣。\n</MA_CHARACTER_APPEARANCE>',
        ),
        snapshot,
        registry,
        facts,
        { sourceText: '林默换上白色外衣。' },
    );
    const changedAppearance = changed.facts.find((fact) => fact.facet === 'appearance');
    assert.notEqual(changedAppearance.fact_id, firstAppearance.factId);
    assert.equal(changedAppearance.supersedes_fact_id, firstAppearance.factId);
    const committed = commitParsed(snapshot, changed, facts, 'message-2');
    const oldAfter = committed.facts.find((fact) => fact.factId === firstAppearance.factId);
    const newAfter = committed.facts.find((fact) => fact.factId === changedAppearance.fact_id);
    assert.equal(oldAfter.active, false);
    assert.equal(oldAfter.supersededByFactId, newAfter.factId);
    assert.equal(newAfter.active, true);
});

test('legacy facts gain contract metadata without guessed object identity or changed IDs', () => {
    const [legacy] = normalizeInternalFacts([{
        fact_id: 'fact-legacy',
        event_id: 'event-legacy',
        type: 'characters',
        title: '旧角色事实',
        content: '旧版只保存了事件关联。',
        occurred: ['旧版只保存了事件关联。'],
        status: 'active',
        confidence: 'recorded',
    }]);
    assert.equal(legacy.factId, 'fact-legacy');
    assert.equal(legacy.eventId, 'event-legacy');
    assert.deepEqual(legacy.primaryHost, { type: 'legacy', id: 'fact-legacy' });
    assert.equal(legacy.storageClass, 'event');
    assert.equal(legacy.subjectRef.kind, 'weak');
});
