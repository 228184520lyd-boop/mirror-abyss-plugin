#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const bundlePath = resolve(process.argv.find((value) => value.endsWith('.js')) || './app.js');
const source = await readFile(bundlePath, 'utf8');
const instrumented = source.replace(
  'export const onActivate=',
  'export const __benchRequire=maRequire;\nexport const __benchModules=MA_MODULES;\nexport const onActivate=',
);
const bundle = await import(`data:text/javascript;base64,${Buffer.from(instrumented).toString('base64')}`);
const requireModule = bundle.__benchRequire;
const { parseExtractionProtocol, parseWorldSettingImportProtocol } = requireModule('parser');
const { buildOperationPlan, applyPlanToEntries } = requireModule('operations');
const { buildRecallPlan } = requireModule('recall-policy');
const { resolveSceneStages, activeContext } = requireModule('governance');
const { parseAuditResult } = requireModule('audit');
const { parseRevisionResult } = requireModule('revision');
const { normalizeEventTimeline } = requireModule('util');
const { parseSettings, DEFAULT_SETTINGS } = requireModule('settings');
const { AUDIT } = requireModule('protocols');

const extractionInput = [
  '事实｜场景｜青石大厅｜当前状态｜变化｜无｜北侧铁门已经打开。',
  '事实｜人物｜林岚｜固定事实｜建立｜青石大厅｜林岚负责看守北侧铁门。',
].join('\n');
const blocks = parseExtractionProtocol(extractionInput);
const plan = buildOperationPlan(blocks, [], DEFAULT_SETTINGS, '地点：青石大厅');
const projected = applyPlanToEntries(plan, [], DEFAULT_SETTINGS);

const scene = projected.find((entry) => entry.type === '场景');
const person = projected.find((entry) => entry.type === '人物');
scene.sceneLastActiveAt = 200;
scene.updatedAt = 200;
person.focus = true;
const previousScene = {
  ...structuredClone(scene),
  uid: 'scene-old',
  title: '场景｜旧站台',
  name: '旧站台',
  sceneLastActiveAt: 100,
  updatedAt: 100,
};
const entries = [previousScene, scene, person];
const stages = resolveSceneStages(entries);
const recall = buildRecallPlan(entries, DEFAULT_SETTINGS);
const context = activeContext(entries);

const timeline = normalizeEventTimeline({
  groupUid: 'SG-engineering',
  sceneGroup: '青石大厅',
  sceneTitle: '场景｜青石大厅',
  memberUids: [scene.uid, person.uid],
  summaryUids: [],
  stages: [{
    messageKey: 'message-1',
    uids: [scene.uid, person.uid],
    points: [{ uid: scene.uid, section: '当前状态', factHash: 'fact-1', change: '变化', relatedUids: [person.uid] }],
  }],
  summaryStatus: 'active',
});

const settingBlocks = parseWorldSettingImportProtocol(
  [
    '<<<ENTRY:基础设定:港城规则>>>',
    '<<<KEYWORDS>>>',
    '- 港城规则',
    '<<<CONTENT>>>',
    '【社会规则】',
    '- 港城夜间实行宵禁。',
    '<<<END_ENTRY>>>',
  ].join('\n'),
);
const settings = parseSettings({ requestTimeoutMs: -1, auditEnabled: true });

const rejects = (fn) => {
  try { fn(); return false; }
  catch { return true; }
};

const checks = {
  extractionInputAccepted: blocks.length === 2,
  deterministicPlanCreated: plan.operations.some((operation) => operation.kind === 'create-entry' && operation.title === '场景｜青石大厅')
    && plan.operations.some((operation) => operation.kind === 'create-entry' && operation.title === '人物｜林岚'),
  projectionOutputComplete: Boolean(scene && person)
    && scene.sections.values['当前状态']?.some((line) => line.includes('北侧铁门已经打开。'))
    && person.sections.values['固定事实']?.includes('林岚负责看守北侧铁门。'),
  currentSceneSingleAuthority: stages.get(scene.uid) === 'current'
    && stages.get(previousScene.uid) === 'previous'
    && context.scene?.uid === scene.uid,
  focusSingleAuthority: recall.profiles.get(person.uid)?.semanticRole === 'focus'
    && context.focus?.uid === person.uid,
  minimalTimelineIdentity: timeline?.groupUid === 'SG-engineering'
    && !Object.prototype.hasOwnProperty.call(timeline, 'id'),
  worldSettingInputAccepted: settingBlocks.length === 1 && settingBlocks[0].type === '基础设定',
  auditPassAccepted: parseAuditResult(AUDIT.pass).decision === 'pass',
  auditFailureLocatable: rejects(() => parseAuditResult('也许通过')),
  revisionOutputAccepted: parseRevisionResult('雨声停在窗外。林岚收起钥匙。').includes('林岚'),
  revisionWrapperRejected: rejects(() => parseRevisionResult('修正版：雨声停了。')),
  settingsRemainBounded: settings.requestTimeoutMs >= 10000,
  noTemporaryMarkers: !/\b(?:TODO|FIXME|HACK|TEMP)\b/u.test(source),
  noHiddenFocusMetadata: !source.includes('chatNamespace().focusUid') && !source.includes('focusTitle'),
  noDuplicateSceneResolver: (source.match(/function resolveSceneStages\(/g) || []).length === 1,
};

console.log(JSON.stringify({
  bundlePath,
  flow: {
    inputBlocks: blocks.length,
    plannedOperations: plan.operations.length,
    projectedEntries: projected.length,
    currentSceneUid: context.scene?.uid ?? '',
    focusUid: context.focus?.uid ?? '',
  },
  checks,
}, null, 2));

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length) {
  console.error(`engineering-chain assertions failed: ${failures.join(', ')}`);
  process.exitCode = 1;
}
