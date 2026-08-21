#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const bundlePath = resolve(process.argv.find((value) => value.endsWith('.js')) || './app.js');
const source = await readFile(bundlePath, 'utf8');
const instrumented = source.replace('export const onActivate=', 'export const __benchRequire=maRequire;\nexport const __benchModules=MA_MODULES;\nexport const onActivate=');
const bundle = await import(`data:text/javascript;base64,${Buffer.from(instrumented).toString('base64')}`);
const util = bundle.__benchRequire('util');
const { HostAdapter } = bundle.__benchRequire('host');
const settings = bundle.__benchRequire('settings');
const moduleIds = Object.keys(bundle.__benchModules);
const resolveModule = (from, spec) => {
  if (!spec.startsWith('.')) return spec;
  const parts = from.split('/');
  parts.pop();
  for (const part of spec.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  const id = parts.join('/');
  return id.endsWith('.js') ? id.slice(0, -3) : id;
};
const reachable = new Set();
const visit = (id) => {
  if (reachable.has(id)) return;
  reachable.add(id);
  const body = String(bundle.__benchModules[id]);
  for (const match of body.matchAll(/require\(["']([^"']+)["']\)/g)) visit(resolveModule(id, match[1]));
};
visit('index');
const loadFailures = moduleIds.filter((id) => {
  try { bundle.__benchRequire(id); return false; }
  catch { return true; }
});

const currentTimeline = {
  groupUid: 'SG-current123',
  sceneGroup: '青石大厅',
  sceneTitle: '场景｜青石大厅',
  memberUids: ['11', '12'],
  summaryUids: [],
  stages: [{
    seq: 9,
    messageKey: 'message-8',
    uids: ['11'],
    points: [{ uid: '11', section: '当前状态', factHash: 'fact-1', change: '变化', relatedUids: ['12'] }],
  }],
  summaryStatus: 'active',
  openedAtMessageKey: 'message-8',
  closedAtMessageKey: '',
  settledAt: 0,
  failedAt: 0,
  summaryError: '',
};
const legacyTimeline = {
  id: 'E-old-location',
  sceneGroup: '青石大厅',
  stages: [{ messageKey: 'old-message', uids: ['11'], points: [] }],
};
const oldAuditPrompt = `只做基础审核；明确触发任一条时判定 FAIL：
1. AI不得替玩家新增玩家未输入的台词、主动行动、重要决定、明确心理结论或价值判断。
2. AI不得把玩家已表达的动作、语言或选择扩大成新的关键决定。
3. AI回复不得与当前可见对话中的明确事实直接矛盾。
4. AI回复不得输出选项栏、行动列表、攻略、内部检查、系统规则、自我解释、管理标签、回合编号或作者总结。
5. 正常叙事描写、NPC主动行动、NPC提问、自然段落和对白换行本身不构成违规。
只依据当前提供的对话上下文审核；不审核角色卡、世界书或未提供的隐藏设定。`;

const utilCurrent = util.normalizeEventTimeline(currentTimeline);
const host = new HostAdapter();
const root = {
  cursor: { activeEventTimeline: currentTimeline, closedEventTimelines: [], eventTimelineArchive: [] },
  commitReceipts: [{
    id: 'old-receipt', messageIndex: 2, playerMessageIndex: 1, sourceMessageKey: 'old',
    changes: [{ uid: '11', before: null }],
  }],
};
host.chatNamespace = () => root;

const checks = {
  allModulesLoad: moduleIds.length === 26 && loadFailures.length === 0,
  allModulesReachableFromEntry: reachable.size === moduleIds.length,
  currentTimelineAccepted: utilCurrent?.groupUid === currentTimeline.groupUid,
  memoryUsesSharedNormalizer: source.split('(0, util_1.normalizeEventTimeline)(').length > 10,
  hostUsesCurrentTimeline: host.cursor().activeEventTimeline?.groupUid === currentTimeline.groupUid,
  legacyTimelineRejected: util.normalizeEventTimeline(legacyTimeline) === null,
  legacyReceiptsNotMigrated: host.getTurnRollbackSnapshots().length === 0,
  oldPromptNoLongerAutoMigrated: settings.parseSettings({ auditPrompt: oldAuditPrompt }).auditPrompt === oldAuditPrompt,
  noPreviousPromptConstant: !source.includes('PREVIOUS_AUDIT_PROMPT'),
  noPromptMigrationHelper: !source.includes('migrateBuiltinPrompt'),
  noLegacyRuntimeProjectionCleanup: !source.includes('removeLegacyRuntimeProjection'),
  noLegacyEventSectionCleanup: !source.includes("for (const legacySection of ['目标', '阶段', '关键进展', '事件进程', '未决'])"),
  noProductionTestExports: !source.includes('__test'),
  oneAutomaticGenerationEvent: !source.includes("this.listen('MESSAGE_RECEIVED'")
    && (source.match(/this\.listen\('GENERATION_ENDED'/g) || []).length === 1,
  noGenerationPollingBranch: !source.includes('pendingMessageTimers')
    && !source.includes('stableTicks')
    && !source.includes("for (const eventName of ['MESSAGE_RECEIVED', 'GENERATION_ENDED'])"),
  noDuplicateWorldbookMigrationAlias: !source.includes('migrateWorldbook:'),
  noLegacyObjectRole: !source.includes('legacy-object'),
  oneTimelineNormalizerImplementation: (source.match(/function normalizeEventTimeline\(/g) || []).length === 1,
  oneSceneStageAuthority: (source.match(/function resolveSceneStages\(/g) || []).length === 1
    && !source.includes('function sceneStageMap(')
    && !source.includes('sceneExplicitActivityTime'),
  oneFoundationAuthority: (source.match(/function isFoundationEntry\(/g) || []).length === 1
    && source.includes('(0, semantic_1.isFoundationEntry)(entry, settings)'),
  oneTimelineIdentity: !source.includes('groupUid || timeline.id')
    && !source.includes('groupUid || item.id')
    && !source.includes('id: groupUid'),
  oneFocusPersistenceSource: !source.includes('getFocusUid')
    && !source.includes('setFocusUid')
    && !source.includes('focusTitle')
    && !source.includes('chatNamespace().focusUid'),
  noEmptyFocusForwarding: !source.includes("const focusUid = ''")
    && !source.includes('buildRecallPlan(entries, settings, focusUid'),
  noSummaryCompatibilityAlias: !source.includes('exports.SUMMARY ='),
};

console.log(JSON.stringify({ bundlePath, checks }, null, 2));
const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length) {
  console.error(`debt-cleanup assertions failed: ${failures.join(', ')}`);
  process.exitCode = 1;
}
