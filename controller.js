import { CancellationToken, describeError, invariant, unique } from '../core/util.js';

const ensureWorkflow = (condition, message, code = 'WORKFLOW') => invariant(condition, message, 'workflow', code);

export class MirrorAbyssController extends EventTarget {
  constructor({ host, settingsStore, memory, importer }) {
    super();
    this.host = host;
    this.settingsStore = settingsStore;
    this.memory = memory;
    this.importer = importer;
    this.active = null;
    this.lastFailedAction = null;
    this.unsubscribers = [];
    this.autoTimer = 0;
  }

  settings() { return this.settingsStore.load(); }
  saveSettings(patch) { const value = this.settingsStore.save(patch); this.emit('settings', value); return value; }

  start() {
    const events = this.host.eventTypes();
    if (events.MESSAGE_RECEIVED) this.unsubscribers.push(this.host.subscribe(events.MESSAGE_RECEIVED, () => this.scheduleAutomatic()));
    for (const eventName of [events.MESSAGE_EDITED, events.MESSAGE_SWIPED, events.MESSAGE_DELETED].filter(Boolean)) {
      this.unsubscribers.push(this.host.subscribe(eventName, index => void this.rollbackFrom(Number(index))));
    }
    if (events.CHAT_CHANGED) this.unsubscribers.push(this.host.subscribe(events.CHAT_CHANGED, () => this.onChatChanged()));
  }

  stop() {
    this.cancel('插件已停止');
    clearTimeout(this.autoTimer);
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
  }

  scheduleAutomatic() {
    clearTimeout(this.autoTimer);
    this.autoTimer = setTimeout(() => {
      const settings = this.settings();
      if (settings.enabled && (settings.autoAudit || settings.autoExtraction)) void this.process('full', true).catch(() => undefined);
    }, 220);
  }

  onChatChanged() {
    this.cancel('聊天已经切换');
    this.importer.clear();
    this.emit('refresh');
  }

  cancel(reason = '用户取消任务') {
    if (!this.active) return false;
    this.active.token.cancel(reason);
    this.setStatus('cancelled', reason, this.active.snapshot?.messageIndex ?? -1);
    return true;
  }

  async retryLast() {
    ensureWorkflow(this.lastFailedAction, '没有可重试的失败任务', 'RETRY_EMPTY');
    return this.lastFailedAction();
  }

  async process(mode = 'full', automatic = false) {
    return this.runExclusive(`${mode}:${automatic}`, async token => {
      const settings = this.settings();
      let snapshot = this.host.captureLatest(token);
      this.active.snapshot = snapshot;
      const useAudit = mode === 'audit' || (mode === 'full' && (!automatic || settings.autoAudit));
      const useExtraction = mode === 'extract' || (mode === 'full' && (!automatic || settings.autoExtraction));
      if (useAudit) {
        this.setStatus('audit', '正在审核当前正文', snapshot.messageIndex);
        const audited = await this.memory.audit(settings, snapshot);
        snapshot = audited.snapshot;
        this.active.snapshot = snapshot;
      }
      let extracted = { changed: false, factCount: 0, touchedUids: [], currentScene: '', receipt: null };
      if (useExtraction) {
        this.setStatus('extract', '正在提取世界事实', snapshot.messageIndex);
        extracted = await this.memory.extract(settings, snapshot);
        await this.recordExtraction(snapshot, extracted);
      }
      this.setStatus('complete', `处理完成：${extracted.factCount}条事实`, snapshot.messageIndex);
      if (automatic) await this.runAutomaticSummaries(settings, snapshot);
      this.emit('refresh');
      return extracted;
    }, () => this.process(mode, automatic));
  }

  async summarize(kind, uids = [], requirement = '') {
    return this.runExclusive(`summary:${kind}`, async token => {
      const settings = this.settings();
      const snapshot = this.host.captureChat(token);
      this.active.snapshot = snapshot;
      let selected = unique(uids);
      const usesOperationalSelection = selected.length === 0;
      if (usesOperationalSelection) {
        const state = this.host.state();
        selected = kind === 'large'
          ? unique(state.summarizedGroups.flatMap(group => group.uids))
          : unique(state.currentGroupUids);
      }
      ensureWorkflow(selected.length, '当前没有可总结条目', 'SUMMARY_EMPTY');
      this.setStatus(kind === 'large' ? 'large-summary' : 'small-summary', kind === 'merge' ? '正在人工合并' : `正在${kind === 'large' ? '大' : '小'}总结`, snapshot.messageIndex);
      const result = await this.memory.summarize(kind, settings, snapshot, selected, requirement);
      await this.host.updateState(state => {
        addReceipt(state, result.receipt);
        if (usesOperationalSelection && kind === 'small') {
          state.summarizedGroups.push({ scene: state.currentScene || '当前场景', uids: unique(result.outputUids) });
          state.currentGroupUids = [];
          state.currentGroupFacts = 0;
        }
        if (usesOperationalSelection && kind === 'large') {
          state.summarizedGroups = [{ scene: '长期', uids: unique(result.outputUids) }];
        }
      });
      this.setStatus('complete', '整理完成', snapshot.messageIndex);
      this.emit('refresh');
      return result;
    }, () => this.summarize(kind, uids, requirement));
  }

  async previewImport(sourceText) {
    return this.runExclusive('import-preview', async token => {
      const settings = this.settings();
      const snapshot = this.host.captureChat(token);
      this.active.snapshot = snapshot;
      this.setStatus('import', 'AI正在整理世界设定', snapshot.messageIndex);
      const preview = await this.importer.preview(settings, snapshot, sourceText);
      this.setStatus('complete', `导入预览完成：${preview.groups.length}个对象`, snapshot.messageIndex);
      this.emit('import-preview', preview);
      return preview;
    }, () => this.previewImport(sourceText));
  }

  async commitImport() {
    return this.runExclusive('import-commit', async token => {
      const settings = this.settings();
      const snapshot = this.host.captureChat(token);
      this.active.snapshot = snapshot;
      this.setStatus('worldbook', '正在写入世界设定', snapshot.messageIndex);
      const result = await this.importer.commit(settings, snapshot);
      this.setStatus('complete', '世界设定导入完成', snapshot.messageIndex);
      this.emit('refresh');
      return result;
    }, () => this.commitImport());
  }

  importPreview() { return this.importer.previewValue(); }
  clearImportPreview() { this.importer.clear(); this.emit('import-preview', null); }

  async listEntries() {
    return this.memory.listEntries(this.settings());
  }

  async updateEntry(uid, content) {
    const transaction = await this.memory.updateEntry(this.settings(), uid, content);
    this.emit('refresh');
    return transaction;
  }

  async deleteEntries(uids) {
    const transaction = await this.memory.deleteEntries(this.settings(), uids);
    this.emit('refresh');
    return transaction;
  }

  async recordExtraction(snapshot, result) {
    await this.host.updateState(state => {
      addReceipt(state, result.receipt);
      if (result.currentScene && state.currentScene && result.currentScene !== state.currentScene && state.currentGroupUids.length) {
        state.closedGroups.push({ scene: state.currentScene, uids: unique(state.currentGroupUids), facts: state.currentGroupFacts });
        state.currentGroupUids = [];
        state.currentGroupFacts = 0;
      }
      if (result.currentScene) state.currentScene = result.currentScene;
      state.currentGroupUids = unique([...state.currentGroupUids, ...result.touchedUids]);
      state.currentGroupFacts += Number(result.factCount || 0);
      state.status = { phase: 'complete', detail: `本轮更新${result.factCount}条`, messageIndex: snapshot.messageIndex, updated: Date.now() };
    });
  }

  async runAutomaticSummaries(settings, snapshot) {
    const state = this.host.state();
    if (settings.autoSmallSummary && state.closedGroups.length) {
      const group = state.closedGroups[0];
      const result = await this.memory.summarize('small', settings, snapshot, group.uids);
      await this.host.updateState(draft => {
        draft.closedGroups.shift();
        draft.summarizedGroups.push({ scene: group.scene, uids: unique(result.outputUids) });
        addReceipt(draft, result.receipt);
      });
    }
    const refreshed = this.host.state();
    if (settings.autoLargeSummary && refreshed.summarizedGroups.length >= settings.largeSummaryGroups) {
      const groups = refreshed.summarizedGroups.slice(0, settings.largeSummaryGroups);
      const sourceUids = unique(groups.flatMap(group => group.uids));
      const result = await this.memory.summarize('large', settings, snapshot, sourceUids);
      await this.host.updateState(draft => {
        draft.summarizedGroups.splice(0, settings.largeSummaryGroups, { scene: '长期', uids: unique(result.outputUids) });
        addReceipt(draft, result.receipt);
      });
    }
  }

  async rollbackFrom(messageIndex) {
    this.cancel('源消息已经变化');
    const settings = this.settings();
    const state = this.host.state();
    const receipts = state.receipts.filter(receipt => Number(receipt.messageIndex) >= messageIndex).sort((a, b) => b.createdAt - a.createdAt);
    if (!receipts.length) return;
    try {
      for (const receipt of receipts) await this.memory.rollback(settings, receipt);
      await this.host.updateState(draft => {
        const removed = new Set(receipts.map(receipt => receipt.createdAt));
        draft.receipts = draft.receipts.filter(receipt => !removed.has(receipt.createdAt));
        draft.currentScene = '';
        draft.currentGroupUids = [];
        draft.currentGroupFacts = 0;
        draft.closedGroups = [];
        draft.summarizedGroups = [];
        draft.status = { phase: 'rolled-back', detail: '源消息变化，相关写入已回滚', messageIndex, updated: Date.now() };
      });
      this.emit('refresh');
    } catch (error) {
      this.setStatus('error', `回滚停止：${describeError(error)}`, messageIndex);
    }
  }

  async resetOperationalState() {
    this.cancel('运行状态正在重置');
    await this.host.clearState();
    this.importer.clear();
    this.emit('refresh');
  }

  async diagnostics() {
    const context = this.host.context();
    const checks = [];
    checks.push({ name: '当前聊天', passed: Boolean(this.host.chatKey()), detail: this.host.chatKey() || '未打开聊天' });
    checks.push({ name: '模型接口', passed: typeof context.generateRaw === 'function', detail: typeof context.generateRaw === 'function' ? '可用' : '缺失' });
    try {
      const opened = await this.memory.listEntries(this.settings());
      checks.push({ name: '权威世界书', passed: true, detail: `${opened.name} · ${opened.managed.length}个管理条目 · ${opened.external.length}个外部条目` });
    } catch (error) {
      checks.push({ name: '权威世界书', passed: false, detail: describeError(error) });
    }
    return checks;
  }

  async runExclusive(label, task, retry) {
    ensureWorkflow(!this.active, '已有任务正在运行', 'TASK_BUSY');
    const token = new CancellationToken(label);
    this.active = { label, token, snapshot: null };
    try {
      const result = await task(token);
      this.lastFailedAction = null;
      return result;
    } catch (error) {
      if (!token.cancelled) {
        this.lastFailedAction = retry;
        this.setStatus('error', describeError(error), this.active.snapshot?.messageIndex ?? -1);
      }
      throw error;
    } finally {
      this.active = null;
    }
  }

  setStatus(phase, detail, messageIndex = -1) {
    const status = { phase, detail, messageIndex, updated: Date.now() };
    void this.host.updateState(state => { state.status = status; }).catch(error => {
      console.error('[Mirror Abyss]', describeError(error), error);
    });
    this.emit('status', status);
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}

function addReceipt(state, receipt) {
  if (!receipt || Number(receipt.messageIndex) < 0) return;
  state.receipts.push(receipt);
  const recentMessages = [...new Set(state.receipts.map(item => Number(item.messageIndex)))].sort((a, b) => b - a).slice(0, 20);
  state.receipts = state.receipts.filter(item => recentMessages.includes(Number(item.messageIndex))).sort((a, b) => a.createdAt - b.createdAt);
}
