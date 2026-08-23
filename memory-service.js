import { applyNativeEntryFields, identityKey, managedEntries, mergeRows, parseManagedEntry, parseSections, serializeSections } from '../core/entry.js';
import { EXTRACTION_TYPES } from '../core/schema.js';
import { parseAuditProtocol, parseFactProtocol, parseSummaryProtocol } from '../core/protocol.js';
import { invariant, normalizeIdentity, unique } from '../core/util.js';
import { auditPrompt, extractionPrompt, revisionPrompt, summaryPrompt } from './prompts.js';

const ensureWorkflow = (condition, message, code = 'MEMORY') => invariant(condition, message, 'workflow', code);

export class MemoryService {
  constructor(host, worldbook, model) {
    this.host = host;
    this.worldbook = worldbook;
    this.model = model;
  }

  async audit(settings, snapshot) {
    const { raw, value } = await this.model.structured(auditPrompt(snapshot.assistantText), settings, snapshot.token, parseAuditProtocol);
    if (value.passed) return { snapshot, revised: false, raw, issues: [] };
    const revisedText = await this.model.text(revisionPrompt(snapshot.assistantText, value.issues), settings, snapshot.token);
    const nextSnapshot = await this.host.replaceAssistantText(snapshot, revisedText);
    return { snapshot: nextSnapshot, revised: true, raw, issues: value.issues };
  }

  async extract(settings, snapshot) {
    this.host.assertSnapshot(snapshot);
    const opened = await this.worldbook.read(settings);
    const relevant = selectRelevant(opened.managed, `${snapshot.playerText}\n${snapshot.assistantText}`, 10);
    const response = await this.model.structured(
      extractionPrompt(snapshot.playerText, snapshot.assistantText, relevant),
      settings,
      snapshot.token,
      raw => parseFactProtocol(raw, { allowedTypes: EXTRACTION_TYPES, maxIdentities: 32 }),
    );
    this.host.assertSnapshot(snapshot);
    if (!response.value.length) return { changed: false, factCount: 0, touchedUids: [], currentScene: '', receipt: null, raw: response.raw };
    const written = await this.writeFactGroups(settings, snapshot, opened, response.value);
    return { ...written, raw: response.raw, factCount: response.value.reduce((sum, group) => sum + group.rows.length, 0) };
  }

  async writeFactGroups(settings, snapshot, opened, groups) {
    const transaction = await this.worldbook.transact(settings, {
      expectedName: opened.name,
      expectedDigest: opened.digest,
      messageIndex: snapshot.messageIndex,
      validate: () => this.host.assertSnapshot(snapshot),
    }, ({ data, createEntry }) => {
      const { managed } = managedEntries(data);
      const activeByIdentity = new Map(managed.filter(entry => !entry.retired).map(entry => [identityKey(entry.type, entry.name), entry]));
      const touchedUids = [];
      let currentScene = '';
      for (const group of groups) {
        const key = identityKey(group.type, group.name);
        let target = activeByIdentity.get(key);
        if (!target) {
          const collidingRaw = Object.values(data.entries).find(raw => normalizeIdentity(raw?.comment) === normalizeIdentity(group.title));
          ensureWorkflow(!collidingRaw, `标题“${group.title}”已存在但正文不符合当前模板，请先由玩家处理该原生条目`, 'UNMANAGED_COLLISION');
          const raw = createEntry();
          const sections = mergeRows(group.type, new Map(), group.rows);
          applyNativeEntryFields(raw, group.type, group.name, serializeSections(group.type, sections));
          target = { uid: String(raw.uid), type: group.type, name: group.name, title: group.title, sections, raw };
          activeByIdentity.set(key, target);
        } else {
          const raw = data.entries[target.uid];
          const sections = mergeRows(group.type, parseSections(raw.content, group.type), group.rows);
          applyNativeEntryFields(raw, group.type, group.name, serializeSections(group.type, sections), raw.key);
          target = { ...target, sections, raw };
          activeByIdentity.set(key, target);
        }
        touchedUids.push(String(target.uid));
        if (group.type === '场景') currentScene = group.name;
      }
      return { touchedUids: unique(touchedUids), currentScene };
    });
    return { changed: transaction.changed, receipt: transaction.receipt, ...transaction.result };
  }

  async summarize(kind, settings, snapshot, uids, requirement = '') {
    this.host.assertSnapshot(snapshot);
    const opened = await this.worldbook.read(settings);
    const wanted = unique(uids);
    const sourceByUid = new Map(opened.managed.filter(entry => !entry.retired).map(entry => [entry.uid, entry]));
    const sources = wanted.map(uid => sourceByUid.get(uid)).filter(Boolean);
    ensureWorkflow(sources.length === wanted.length && sources.length > 0, '总结来源已经变化，请刷新后重试', 'SUMMARY_SOURCE');
    if (kind === 'merge') ensureWorkflow(sources.length >= 2, '人工合并至少选择两个条目', 'MERGE_COUNT');
    const response = await this.model.structured(
      summaryPrompt(kind, sources, requirement), settings, snapshot.token,
      raw => parseSummaryProtocol(raw, sources, { allowNone: kind !== 'merge' }),
    );
    this.host.assertSnapshot(snapshot);
    if (!response.value.length) return { changed: false, outputUids: sources.map(entry => entry.uid), receipt: null, raw: response.raw };
    const transaction = await this.worldbook.transact(settings, {
      expectedName: opened.name,
      expectedDigest: opened.digest,
      messageIndex: snapshot.messageIndex,
      validate: () => this.host.assertSnapshot(snapshot),
    }, ({ data, createEntry }) => {
      const current = managedEntries(data).managed;
      const byUid = new Map(current.map(entry => [entry.uid, entry]));
      const activeByIdentity = new Map(current.filter(entry => !entry.retired).map(entry => [identityKey(entry.type, entry.name), entry]));
      const outputUids = [];
      for (const group of response.value) {
        const sourceEntries = group.refs.map(ref => sources[Number(ref.replace('条目', '')) - 1]);
        ensureWorkflow(sourceEntries.every(Boolean), '总结来源编号已经失效', 'SUMMARY_REF');
        const targetKey = identityKey(group.type, group.name);
        const targetSource = sourceEntries.find(source => identityKey(source.type, source.name) === targetKey);
        const collision = activeByIdentity.get(targetKey);
        ensureWorkflow(!collision || collision.uid === targetSource?.uid, `总结目标“${group.title}”与未参与整理的现有条目冲突`, 'SUMMARY_COLLISION');
        const targetRaw = targetSource ? data.entries[targetSource.uid] : createEntry();
        const sections = new Map(group.sections);
        applyNativeEntryFields(targetRaw, group.type, group.name, serializeSections(group.type, sections), targetRaw.key);
        outputUids.push(String(targetRaw.uid));
        for (const source of sourceEntries) {
          if (String(source.uid) === String(targetRaw.uid)) continue;
          const sourceRaw = data.entries[source.uid];
          ensureWorkflow(sourceRaw && byUid.has(source.uid), `总结来源UID ${source.uid}已经不存在`, 'SUMMARY_UID');
          sourceRaw.disable = true;
          sourceRaw.extensions ??= {};
          sourceRaw.extensions.mirrorAbyss = { managed: true, retired: true };
        }
      }
      return { outputUids: unique(outputUids) };
    });
    return { changed: transaction.changed, receipt: transaction.receipt, ...transaction.result, raw: response.raw };
  }

  listEntries(settings) {
    return this.worldbook.read(settings);
  }

  async updateEntry(settings, uid, content) {
    const opened = await this.worldbook.read(settings);
    return this.worldbook.transact(settings, { expectedName: opened.name, expectedDigest: opened.digest }, ({ data }) => {
      const raw = data.entries?.[uid];
      ensureWorkflow(raw, `UID ${uid}不存在`, 'ITEM_MISSING');
      const managed = parseManagedEntry(raw);
      ensureWorkflow(managed && !managed.retired, '该条目不属于当前可编辑模板', 'ITEM_READONLY');
      const sections = parseSections(content, managed.type);
      applyNativeEntryFields(raw, managed.type, managed.name, serializeSections(managed.type, sections), raw.key);
    });
  }

  async deleteEntries(settings, uids) {
    const selected = unique(uids);
    ensureWorkflow(selected.length, '没有选择条目', 'SELECTION_EMPTY');
    const opened = await this.worldbook.read(settings);
    return this.worldbook.transact(settings, { expectedName: opened.name, expectedDigest: opened.digest }, ({ data }) => {
      for (const uid of selected) {
        ensureWorkflow(data.entries?.[uid], `UID ${uid}不存在`, 'ITEM_MISSING');
        delete data.entries[uid];
      }
    });
  }

  rollback(settings, receipt) {
    return this.worldbook.rollback(settings, receipt);
  }
}

function selectRelevant(entries, text, limit) {
  const normalized = normalizeIdentity(text);
  const ranked = entries.filter(entry => !entry.retired).map(entry => {
    let score = 0;
    if (normalized.includes(normalizeIdentity(entry.name))) score += 10;
    for (const keyword of entry.keywords) if (normalized.includes(normalizeIdentity(keyword))) score += 3;
    if (entry.type === '基础设定' || entry.type === '世界') score += 1;
    return { entry, score };
  });
  return ranked.sort((left, right) => right.score - left.score || Number(right.entry.uid) - Number(left.entry.uid)).slice(0, limit).map(item => item.entry);
}
