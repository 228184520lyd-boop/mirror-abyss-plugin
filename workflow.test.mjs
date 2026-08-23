import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryService } from '../src/application/memory-service.js';
import { WorldSettingImportService } from '../src/application/import-service.js';
import { applyNativeEntryFields, managedEntries, serializeSections } from '../src/core/entry.js';
import { clone, digest } from '../src/core/util.js';

const settings = { responseTokens: 4096 };
const token = { cancelled: false, assertActive() {} };
const snapshot = { chatKey: 'chat', messageIndex: 3, playerText: '我走到城门', assistantText: '阿洛正在城门值守。', token };

class ModelStub {
  constructor(outputs) { this.outputs = [...outputs]; }
  async structured(_prompt, _settings, _token, parse) {
    const raw = this.outputs.shift();
    return { raw, value: parse(raw), retried: false };
  }
  async text() { return this.outputs.shift(); }
}

class WorldbookStub {
  constructor(entries = {}) { this.name = '镜渊测试'; this.data = { entries: clone(entries) }; }
  async read() {
    const projected = managedEntries(this.data);
    return { name: this.name, data: clone(this.data), ...projected, digest: digest(this.data) };
  }
  async transact(_settings, options, mutate) {
    assert.equal(options.expectedName, this.name);
    assert.equal(options.expectedDigest, digest(this.data));
    const draft = clone(this.data);
    const result = await mutate({
      data: draft,
      createEntry: () => {
        const uid = String(Math.max(-1, ...Object.keys(draft.entries).map(Number)) + 1);
        const raw = { uid: Number(uid), key: [], keysecondary: [], extensions: {} };
        draft.entries[uid] = raw;
        return raw;
      },
    });
    this.data = draft;
    return { changed: true, result, receipt: { worldbookName: this.name, messageIndex: snapshot.messageIndex, createdAt: Date.now(), changes: [] } };
  }
}

function hostStub() {
  return {
    assertSnapshot() {},
    replaceAssistantText: async current => current,
  };
}

test('Extraction updates an exact identity and preserves its UID', async () => {
  const content = serializeSections('人物', new Map([['身份', ['守门人']], ['当前状态', ['在大厅']]]));
  const raw = applyNativeEntryFields({ uid: 7, key: [], keysecondary: [], extensions: {} }, '人物', '阿洛', content);
  const worldbook = new WorldbookStub({ 7: raw });
  const model = new ModelStub(['事实｜人物｜阿洛｜当前状态｜变化｜城门｜正在城门值守']);
  const memory = new MemoryService(hostStub(), worldbook, model);
  const result = await memory.extract(settings, snapshot);
  assert.deepEqual(result.touchedUids, ['7']);
  const entry = (await worldbook.read()).managed[0];
  assert.equal(entry.uid, '7');
  assert.deepEqual(entry.sections.get('当前状态'), ['正在城门值守']);
});

test('Manual merge creates one target and retires every source', async () => {
  const person = applyNativeEntryFields({ uid: 1, key: [], keysecondary: [], extensions: {} }, '人物', '阿洛', serializeSections('人物', new Map([['身份', ['守门人']]])));
  const scene = applyNativeEntryFields({ uid: 2, key: [], keysecondary: [], extensions: {} }, '场景', '城门', serializeSections('场景', new Map([['位置', ['王城北侧']]])));
  const worldbook = new WorldbookStub({ 1: person, 2: scene });
  const model = new ModelStub(['整理｜条目1、条目2｜世界｜王城入口｜环境状态｜北侧城门由阿洛值守']);
  const memory = new MemoryService(hostStub(), worldbook, model);
  const result = await memory.summarize('merge', settings, snapshot, ['1', '2']);
  assert.equal(result.outputUids.length, 1);
  const entries = (await worldbook.read()).managed;
  assert.equal(entries.filter(entry => entry.retired).length, 2);
  assert.equal(entries.find(entry => !entry.retired).title, '世界｜王城入口');
});

test('Manual merge may reuse one selected identity without creating a duplicate', async () => {
  const person = applyNativeEntryFields({ uid: 1, key: ['阿洛', '守门人'], keysecondary: [], extensions: {} }, '人物', '阿洛', serializeSections('人物', new Map([['身份', ['守门人']]])), ['守门人']);
  const scene = applyNativeEntryFields({ uid: 2, key: [], keysecondary: [], extensions: {} }, '场景', '城门', serializeSections('场景', new Map([['位置', ['王城北侧']]])));
  const worldbook = new WorldbookStub({ 1: person, 2: scene });
  const model = new ModelStub(['整理｜条目1、条目2｜人物｜阿洛｜经历｜曾在王城北门值守']);
  const memory = new MemoryService(hostStub(), worldbook, model);
  const result = await memory.summarize('merge', settings, snapshot, ['1', '2']);
  assert.deepEqual(result.outputUids, ['1']);
  const entries = (await worldbook.read()).managed;
  assert.equal(entries.find(entry => !entry.retired).uid, '1');
  assert.deepEqual(entries.find(entry => !entry.retired).keywords, ['阿洛', '守门人']);
  assert.equal(entries.find(entry => entry.uid === '2').retired, true);
});

test('Text and TXT import share preview and commit workflow', async () => {
  const worldbook = new WorldbookStub();
  const model = new ModelStub(['事实｜基础设定｜魔力规则｜自然规则｜建立｜｜魔力通过晶体传导']);
  const memory = new MemoryService(hostStub(), worldbook, model);
  const importer = new WorldSettingImportService(hostStub(), worldbook, model, memory);
  const preview = await importer.preview(settings, snapshot, '魔力通过晶体传导。');
  assert.equal(preview.groups.length, 1);
  await importer.commit(settings, snapshot);
  assert.equal((await worldbook.read()).managed[0].title, '基础设定｜魔力规则');
});
