import {
  createNewWorldInfo,
  createWorldInfoEntry,
} from '/scripts/world-info.js';
import { assertUniqueManagedIdentities, managedEntries } from '../core/entry.js';
import { MirrorAbyssError, clone, digest, errorText, fault, invariant, stableStringify } from '../core/util.js';

const ensureWorldbook = (condition, message, code = 'CONTRACT') => invariant(condition, message, 'worldbook', code);

export class WorldbookRepository {
  constructor(host) {
    this.host = host;
    this.locks = new Map();
  }

  async ensureBound(settings) {
    const current = this.host.worldbookName();
    if (current) return current;
    ensureWorldbook(settings.autoCreateLorebook, '当前聊天未绑定世界书', 'BOOK_REQUIRED');
    const chatKey = this.host.chatKey();
    ensureWorldbook(chatKey, '请先打开一个聊天', 'CHAT_REQUIRED');
    const base = `镜渊-${chatKey.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 48) || '聊天'}`;
    const names = new Set(this.host.worldbookNames());
    let name = base;
    for (let suffix = 2; names.has(name); suffix += 1) name = `${base}-${suffix}`;
    let created;
    try {
      created = await createNewWorldInfo(name, { interactive: false });
    } catch (error) {
      throw fault('worldbook', 'CREATE_FAILED', `创建聊天世界书失败：${errorText(error)}`, error);
    }
    ensureWorldbook(created, '创建聊天世界书失败', 'CREATE_FAILED');
    await this.host.bindWorldbook(name);
    return name;
  }

  async read(settings) {
    const name = await this.ensureBound(settings);
    const data = await this.readData(name);
    this.validateData(data);
    return { name, data, ...managedEntries(data), digest: digest(data) };
  }

  async readData(name) {
    try {
      const data = clone(await this.host.context().loadWorldInfo(name));
      ensureWorldbook(data, `无法读取世界书“${name}”`, 'READ_FAILED');
      data.entries ??= {};
      return data;
    } catch (error) {
      if (error instanceof MirrorAbyssError && error.source === 'worldbook') throw error;
      throw fault('worldbook', 'READ_FAILED', `无法读取世界书“${name}”：${errorText(error)}`, error);
    }
  }

  async transact(settings, options, mutate) {
    const name = await this.ensureBound(settings);
    return this.withLock(name, async () => {
      options?.validate?.();
      const before = await this.readData(name);
      const beforeDigest = digest(before);
      if (options?.expectedName) ensureWorldbook(name === options.expectedName, '聊天绑定的世界书已经变化', 'BOOK_CHANGED');
      if (options?.expectedDigest) ensureWorldbook(beforeDigest === options.expectedDigest, '世界书已被其他操作修改，请刷新后重试', 'STALE_WRITE');
      this.validateData(before);
      const draft = clone(before);
      const result = await mutate({
        data: draft,
        createEntry: () => {
          const entry = createWorldInfoEntry(name, draft);
          ensureWorldbook(entry, '无法分配新的世界书 UID', 'UID_ALLOCATE');
          return entry;
        },
      });
      this.validateData(draft);
      const afterDigest = digest(draft);
      if (afterDigest === beforeDigest) return { changed: false, result, receipt: null, data: before };
      const receipt = buildReceipt(name, before, draft, options?.messageIndex);
      await this.saveVerified(name, before, draft, afterDigest);
      options?.validate?.();
      return { changed: true, result, receipt, data: draft };
    });
  }

  async rollback(settings, receipt) {
    ensureWorldbook(receipt?.worldbookName, '回滚记录不完整', 'RECEIPT');
    const name = await this.ensureBound(settings);
    ensureWorldbook(name === receipt.worldbookName, '回滚记录属于其他世界书', 'RECEIPT_BOOK');
    return this.withLock(name, async () => {
      const current = await this.readData(name);
      for (const change of receipt.changes) {
        const raw = current.entries?.[change.uid];
        ensureWorldbook(entryDigest(raw) === change.afterDigest, `UID ${change.uid} 已被后续操作修改，拒绝覆盖回滚`, 'ROLLBACK_CONFLICT');
      }
      const restored = clone(current);
      for (const change of receipt.changes) {
        if (change.before === null) delete restored.entries[change.uid];
        else restored.entries[change.uid] = clone(change.before);
      }
      this.validateData(restored);
      await this.saveVerified(name, current, restored, digest(restored));
      return { changed: true };
    });
  }

  async saveVerified(name, before, next, intendedDigest) {
    const context = this.host.context();
    try {
      await context.saveWorldInfo(name, clone(next), true);
      const verified = await this.readData(name);
      ensureWorldbook(digest(verified) === intendedDigest, '世界书保存后权威回读不一致', 'VERIFY_FAILED');
    } catch (error) {
      try {
        const current = await this.readData(name);
        if (digest(current) === intendedDigest) {
          await context.saveWorldInfo(name, clone(before), true);
          const restored = await this.readData(name);
          ensureWorldbook(digest(restored) === digest(before), '世界书提交失败且自动回滚未通过回读校验', 'RESTORE_FAILED');
        }
      } catch (rollbackError) {
        throw fault('worldbook', 'RESTORE_FAILED', `世界书提交与自动回滚均失败：${errorText(rollbackError)}`, new AggregateError([error, rollbackError]));
      }
      if (error instanceof MirrorAbyssError && error.source === 'worldbook') throw error;
      throw fault('worldbook', 'SAVE_FAILED', `世界书保存失败：${errorText(error)}`, error);
    }
  }

  validateData(data) {
    try {
      assertUniqueManagedIdentities(data);
    } catch (error) {
      throw fault('worldbook', 'ITEM_INVALID', `镜渊条目数据无效：${errorText(error)}`, error);
    }
  }

  withLock(name, task) {
    const previous = this.locks.get(name) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    this.locks.set(name, current);
    return current.finally(() => {
      if (this.locks.get(name) === current) this.locks.delete(name);
    });
  }
}

function buildReceipt(worldbookName, before, after, messageIndex = -1) {
  const keys = new Set([...Object.keys(before.entries ?? {}), ...Object.keys(after.entries ?? {})]);
  const changes = [];
  for (const uid of keys) {
    const left = before.entries?.[uid] ?? null;
    const right = after.entries?.[uid] ?? null;
    if (stableStringify(left) === stableStringify(right)) continue;
    changes.push({ uid: String(uid), before: clone(left), afterDigest: entryDigest(right) });
  }
  return { worldbookName, messageIndex: Number(messageIndex), createdAt: Date.now(), changes };
}

function entryDigest(entry) {
  return entry == null ? 'absent' : digest(entry);
}
