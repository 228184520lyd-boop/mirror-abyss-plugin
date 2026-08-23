import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNativeEntryFields, assertUniqueManagedIdentities, managedEntries, mergeRows, parseManagedEntry, serializeSections } from '../src/core/entry.js';
import { parseFactProtocol, parseSummaryProtocol } from '../src/core/protocol.js';
import { EXTRACTION_TYPES, WORLD_SCHEMA, WORLD_TYPES, renderSchema, sectionNames } from '../src/core/schema.js';
import { MirrorAbyssError } from '../src/core/util.js';

test('Schema is the shared complete template', () => {
  assert.deepEqual(Object.keys(WORLD_SCHEMA), WORLD_TYPES);
  const rendered = renderSchema(WORLD_TYPES);
  for (const type of WORLD_TYPES) {
    assert.match(rendered, new RegExp(`${type}：`));
    for (const section of sectionNames(type)) assert.match(rendered, new RegExp(section));
  }
});

test('Fact protocol accepts every declared field and groups one identity once', () => {
  const lines = [];
  for (const type of WORLD_TYPES) {
    for (const section of sectionNames(type)) lines.push(`事实｜${type}｜测试${type}｜${section}｜建立｜｜${section}事实`);
  }
  const groups = parseFactProtocol(lines.join('\n'), { allowedTypes: WORLD_TYPES, maxIdentities: 16 });
  assert.equal(groups.length, WORLD_TYPES.length);
  for (const group of groups) assert.equal(group.rows.length, sectionNames(group.type).length);
});

test('Fact protocol rejects fields outside the same Schema', () => {
  let error;
  try {
    parseFactProtocol('事实｜人物｜阿洛｜不存在栏目｜建立｜｜事实', { allowedTypes: EXTRACTION_TYPES });
  } catch (caught) {
    error = caught;
  }
  assert.match(error?.message ?? '', /不属于人物模板/u);
  assert.ok(error instanceof MirrorAbyssError);
  assert.equal(error.source, 'protocol');
  assert.equal(error.code, 'SECTION');
});

test('Entry merge uses field policy without semantic guessing', () => {
  const current = new Map([['身份', ['守门人']], ['当前状态', ['在大厅']]]);
  const merged = mergeRows('人物', current, [
    { section: '身份', fact: '王城守门人' },
    { section: '当前状态', fact: '在城门' },
  ]);
  assert.deepEqual(merged.get('身份'), ['守门人', '王城守门人']);
  assert.deepEqual(merged.get('当前状态'), ['在城门']);
});

test('Managed identity is exact and unique', () => {
  const content = serializeSections('人物', new Map([['身份', ['守门人']]]));
  const first = applyNativeEntryFields({ uid: 1, extensions: {} }, '人物', '阿洛', content);
  const second = applyNativeEntryFields({ uid: 2, extensions: {} }, '人物', ' 阿洛 ', content);
  assert.throws(() => assertUniqueManagedIdentities({ entries: { 1: first, 2: second } }), /重复管理身份/u);
  assert.equal(parseManagedEntry(first).uid, '1');
});

test('Only explicitly marked entries belong to Mirror Abyss', () => {
  const native = { uid: 9, comment: '人物｜阿洛', content: '自由格式正文', extensions: {} };
  const split = managedEntries({ entries: { 9: native } });
  assert.equal(split.managed.length, 0);
  assert.equal(split.external.length, 1);
});

test('Summary protocol maps temporary references and rejects duplicate ownership', () => {
  const sources = [
    { uid: '1', type: '人物', name: '阿洛' },
    { uid: '2', type: '场景', name: '城门' },
  ];
  const parsed = parseSummaryProtocol('整理｜条目1、条目2｜世界｜王城入口｜环境状态｜城门由阿洛值守', sources);
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0].refs, ['条目1', '条目2']);
  assert.throws(() => parseSummaryProtocol([
    '整理｜条目1｜人物｜阿洛｜身份｜守门人',
    '整理｜条目1｜人物｜阿洛｜经历｜长期值守',
    '整理｜条目1｜世界｜王城｜环境状态｜城门有人值守',
  ].join('\n'), sources), /重复使用/u);
  assert.throws(() => parseSummaryProtocol([
    '整理｜条目1｜世界｜王城入口｜环境状态｜阿洛值守',
    '整理｜条目2｜世界｜王城入口｜长期变化｜北门开放',
  ].join('\n'), sources), /多个来源组/u);
});

test('Automatic summaries may return none; manual merge may not', () => {
  assert.deepEqual(parseSummaryProtocol('无', [], { allowNone: true }), []);
  assert.throws(() => parseSummaryProtocol('无', [], { allowNone: false }), /人工合并/u);
});
