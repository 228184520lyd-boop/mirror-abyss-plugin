import { CancellationToken, clone, digest, errorText, fault, invariant } from '../core/util.js';

const ensureHost = (condition, message, code = 'CONTRACT') => invariant(condition, message, 'host', code);

function hostContext() {
  const getContext = globalThis.SillyTavern?.getContext;
  ensureHost(typeof getContext === 'function', 'SillyTavern Context 尚未就绪', 'CONTEXT');
  return getContext();
}

export const EXTENSION_KEY = 'mirrorAbyssClean';

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  autoAudit: false,
  autoExtraction: true,
  autoSmallSummary: true,
  autoLargeSummary: true,
  autoCreateLorebook: true,
  largeSummaryGroups: 4,
  responseTokens: 8192,
  foldersByWorldbook: {},
});

export class SettingsStore {
  load() {
    const context = hostContext();
    const raw = context.extensionSettings?.[EXTENSION_KEY];
    return sanitizeSettings({ ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) });
  }

  save(patch) {
    const context = hostContext();
    context.extensionSettings ??= {};
    const next = sanitizeSettings({ ...this.load(), ...(patch ?? {}) });
    context.extensionSettings[EXTENSION_KEY] = clone(next);
    context.saveSettingsDebounced();
    return next;
  }

  reset() {
    const context = hostContext();
    context.extensionSettings ??= {};
    context.extensionSettings[EXTENSION_KEY] = clone(DEFAULT_SETTINGS);
    context.saveSettingsDebounced();
    return this.load();
  }
}

function sanitizeSettings(value) {
  return {
    enabled: value.enabled !== false,
    autoAudit: value.autoAudit === true,
    autoExtraction: value.autoExtraction !== false,
    autoSmallSummary: value.autoSmallSummary !== false,
    autoLargeSummary: value.autoLargeSummary !== false,
    autoCreateLorebook: value.autoCreateLorebook !== false,
    largeSummaryGroups: clamp(value.largeSummaryGroups, 2, 20, 4),
    responseTokens: clamp(value.responseTokens, 1024, 16384, 8192),
    foldersByWorldbook: value.foldersByWorldbook && typeof value.foldersByWorldbook === 'object'
      ? clone(value.foldersByWorldbook) : {},
  };
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

export class HostAdapter {
  constructor() {
    this.metadataQueue = Promise.resolve();
  }

  context() { return hostContext(); }

  chatKey() {
    const context = this.context();
    return String(context.getCurrentChatId?.() ?? context.chatId ?? '');
  }

  worldbookName() {
    return String(this.context().chatMetadata?.world_info ?? '').trim();
  }

  worldbookNames() {
    return this.context().getWorldInfoNames();
  }

  async bindWorldbook(name) {
    const context = this.context();
    context.chatMetadata.world_info = name;
    try {
      await context.saveMetadata();
    } catch (error) {
      throw fault('host', 'BOOK_BIND', `世界书绑定保存失败：${errorText(error)}`, error);
    }
  }

  captureChat(token = new CancellationToken()) {
    const chatKey = this.chatKey();
    ensureHost(chatKey, '请先打开一个聊天', 'CHAT_REQUIRED');
    return Object.freeze({ chatKey, messageIndex: -1, worldbookName: this.worldbookName(), token });
  }

  captureLatest(token = new CancellationToken()) {
    const chatSnapshot = this.captureChat(token);
    const context = this.context();
    const chat = Array.isArray(context.chat) ? context.chat : [];
    let assistantIndex = -1;
    for (let index = chat.length - 1; index >= 0; index -= 1) {
      if (!chat[index]?.is_user && !chat[index]?.is_system && String(chat[index]?.mes ?? '').trim()) {
        assistantIndex = index;
        break;
      }
    }
    ensureHost(assistantIndex >= 0, '当前聊天没有可处理的AI正文', 'MESSAGE_REQUIRED');
    let playerText = '';
    for (let index = assistantIndex - 1; index >= 0; index -= 1) {
      if (chat[index]?.is_user) { playerText = String(chat[index].mes ?? ''); break; }
    }
    const assistantText = String(chat[assistantIndex].mes ?? '');
    return Object.freeze({
      ...chatSnapshot,
      messageIndex: assistantIndex,
      messageDigest: digest(assistantText),
      playerText,
      assistantText,
    });
  }

  assertSnapshot(snapshot) {
    snapshot.token.assertActive();
    ensureHost(this.chatKey() === snapshot.chatKey, '聊天已经切换，任务结果已丢弃', 'CHAT_CHANGED');
    const currentWorldbook = this.worldbookName();
    if (snapshot.worldbookName) ensureHost(currentWorldbook === snapshot.worldbookName, '聊天绑定的世界书已经变化', 'BOOK_CHANGED');
    if (snapshot.messageIndex < 0) return;
    const message = this.context().chat?.[snapshot.messageIndex];
    ensureHost(message && !message.is_user, '目标AI消息已经不存在', 'MESSAGE_MISSING');
    ensureHost(digest(String(message.mes ?? '')) === snapshot.messageDigest, '目标AI正文已经变化，任务结果已丢弃', 'MESSAGE_CHANGED');
  }

  async replaceAssistantText(snapshot, text) {
    this.assertSnapshot(snapshot);
    const context = this.context();
    ensureHost(typeof context.updateMessageBlock === 'function' && typeof context.saveChat === 'function', 'SillyTavern 未提供消息更新接口', 'MESSAGE_WRITE_API');
    const message = context.chat[snapshot.messageIndex];
    message.mes = String(text ?? '').trim();
    if (Array.isArray(message.swipes) && Number.isInteger(message.swipe_id)) {
      message.swipes[message.swipe_id] = message.mes;
    }
    try {
      context.updateMessageBlock(snapshot.messageIndex, message);
      await context.saveChat();
    } catch (error) {
      throw fault('host', 'MESSAGE_WRITE', `AI正文保存失败：${errorText(error)}`, error);
    }
    return Object.freeze({ ...snapshot, assistantText: message.mes, messageDigest: digest(message.mes) });
  }

  async generate({ system, user, responseTokens, token }) {
    token.assertActive();
    const context = this.context();
    ensureHost(typeof context.generateRaw === 'function', 'SillyTavern 未提供 generateRaw', 'MODEL_API');
    const output = await context.generateRaw({
      systemPrompt: String(system ?? ''),
      prompt: String(user ?? ''),
      responseLength: Number(responseTokens) || 8192,
      trimNames: false,
    });
    token.assertActive();
    const text = String(output ?? '').trim();
    ensureHost(text, '模型没有返回最终文本', 'MODEL_EMPTY');
    return text;
  }

  state() {
    const context = this.context();
    context.chatMetadata ??= {};
    const current = context.chatMetadata[EXTENSION_KEY];
    if (!current || typeof current !== 'object') context.chatMetadata[EXTENSION_KEY] = defaultChatState();
    return context.chatMetadata[EXTENSION_KEY];
  }

  async updateState(mutator) {
    const update = this.metadataQueue.catch(() => undefined).then(async () => {
      const context = this.context();
      ensureHost(typeof context.saveMetadata === 'function', 'SillyTavern 未提供聊天元数据保存接口', 'METADATA_API');
      const draft = clone(this.state());
      mutator(draft);
      context.chatMetadata[EXTENSION_KEY] = draft;
      try {
        await context.saveMetadata();
      } catch (error) {
        throw fault('host', 'METADATA_WRITE', `聊天运行状态保存失败：${errorText(error)}`, error);
      }
      return clone(draft);
    });
    this.metadataQueue = update;
    return update;
  }

  async clearState() {
    return this.updateState(state => Object.assign(state, defaultChatState()));
  }

  subscribe(eventName, handler) {
    const source = this.context().eventSource;
    ensureHost(typeof source?.on === 'function' && typeof source?.removeListener === 'function', 'SillyTavern 事件接口不可用', 'EVENT_API');
    source.on(eventName, handler);
    return () => source.removeListener(eventName, handler);
  }

  eventTypes() { return this.context().eventTypes ?? {}; }
}

function defaultChatState() {
  return {
    status: { phase: 'idle', detail: '等待处理', messageIndex: -1, updated: 0 },
    currentScene: '',
    currentGroupUids: [],
    currentGroupFacts: 0,
    closedGroups: [],
    summarizedGroups: [],
    receipts: [],
  };
}
