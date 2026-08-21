#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';

const bundlePath = resolve(process.argv.find((value) => value.endsWith('.js')) || './app.js');
const source = await readFile(bundlePath, 'utf8');
const instrumented = source.replace('export const onActivate=', 'export const __benchRequire=maRequire;\nexport const onActivate=');
const bundle = await import(`data:text/javascript;base64,${Buffer.from(instrumented).toString('base64')}`);
const { MemoryRunner } = bundle.__benchRequire('memory');
const { parseExtractionProtocol } = bundle.__benchRequire('parser');
const { extractionPrompts } = bundle.__benchRequire('prompts');
const { DEFAULT_SETTINGS } = bundle.__benchRequire('settings');

const VALID = '事实｜场景｜青石大厅｜当前状态｜变化｜无｜北侧铁门已经打开。';
const INVALID = '场景：青石大厅，北侧铁门已经打开。';
const NONE = '无';
const hash = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 16);

async function runCase(name, responses, { cancelled = false } = {}) {
  const calls = [];
  const queue = [...responses];
  const host = {
    assertSnapshot() {},
    cursor() { return {}; },
    async generate(system, user, responseTokens, snapshot, settings, timeout, profileId, generationOptions) {
      calls.push({ system, user, responseTokens, timeout, profileId, generationOptions });
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
  const worldbook = { async list() { return []; } };
  const settings = { ...DEFAULT_SETTINGS, requestRetryBaseDelayMs: 0 };
  const snapshot = {
    chatKey: 'benchmark-chat',
    playerText: '我走进青石大厅。',
    assistantText: '青石大厅的北侧铁门已经打开。',
    turnText: '青石大厅的北侧铁门已经打开。',
    token: { cancelled, reason: cancelled ? '用户取消' : '' },
  };
  const runner = new MemoryRunner(host, worldbook, () => settings);
  runner.apply = async () => ({
    entries: [], changed: true, businessChanged: true, businessChanges: [],
    warehouse: { created: [], updated: [], deleted: [] },
  });
  let outcome = 'success';
  let error = '';
  try { await runner.extract(settings, snapshot); }
  catch (cause) { outcome = 'error'; error = String(cause?.message || cause); }
  const fingerprints = calls.map((call) => hash(`${call.system}\u0000${call.user}\u0000${call.responseTokens}`));
  return {
    name,
    outcome,
    calls: calls.length,
    identicalReplay: calls.length < 2 || new Set(fingerprints).size === 1,
    promptFingerprints: fingerprints,
    error: error.slice(0, 180),
  };
}

const authError = Object.assign(new Error('HTTP 401 unauthorized'), { status: 401 });
const cancelledError = Object.assign(new Error('用户取消'), { code: 'MA_TASK_CANCELLED' });
const cases = [
  await runCase('valid-first-response', [VALID]),
  await runCase('explicit-none', [NONE]),
  await runCase('malformed-then-valid', [INVALID, VALID]),
  await runCase('malformed-twice', [INVALID, INVALID]),
  await runCase('non-retryable-auth-error', [authError, authError]),
  await runCase('cancelled-request', [cancelledError, cancelledError], { cancelled: true }),
];

const parserInput = Array.from({ length: 24 }, (_, index) =>
  `事实｜事件｜基准事件${index}｜已发生进展｜变化｜无｜基准事实${index}已经发生。`).join('\n');
const entries = Array.from({ length: 120 }, (_, index) => ({
  type: index % 2 ? '人物' : '事件',
  title: `${index % 2 ? '人物' : '事件'}｜基准对象${index}`,
  content: `【固定事实】\n- 基准事实${index}`,
}));
const iterations = 20000;
let start = performance.now();
for (let index = 0; index < iterations; index += 1) parseExtractionProtocol(parserInput);
const parserMs = performance.now() - start;
start = performance.now();
for (let index = 0; index < iterations; index += 1) extractionPrompts('玩家输入', 'AI正文', entries);
const promptMs = performance.now() - start;

const report = {
  bundlePath,
  behavioral: cases,
  throughput: {
    iterations,
    parserTotalMs: Number(parserMs.toFixed(2)),
    parserMeanUs: Number((parserMs * 1000 / iterations).toFixed(2)),
    promptTotalMs: Number(promptMs.toFixed(2)),
    promptMeanUs: Number((promptMs * 1000 / iterations).toFixed(2)),
  },
};
console.log(JSON.stringify(report, null, 2));

if (process.argv.includes('--assert-clean')) {
  const byName = Object.fromEntries(cases.map((item) => [item.name, item]));
  const failures = [];
  if (byName['valid-first-response'].calls !== 1) failures.push('valid response must use one request');
  if (byName['explicit-none'].calls !== 1) failures.push('explicit none must use one request');
  if (byName['malformed-then-valid'].calls !== 2 || !byName['malformed-then-valid'].identicalReplay) failures.push('protocol retry must replay one identical request');
  if (byName['non-retryable-auth-error'].calls !== 1) failures.push('non-retryable request error must not replay');
  if (byName['cancelled-request'].calls !== 1) failures.push('cancelled request must not replay');
  if (failures.length) {
    console.error(`clean-chain assertions failed: ${failures.join('; ')}`);
    process.exitCode = 1;
  }
}
