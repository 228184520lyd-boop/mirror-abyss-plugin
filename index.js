var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/constants.ts
var MODULE_NAME, LEGACY_MODULE_NAME, DISPLAY_NAME, VERSION, PIPELINE_VERSION, TABLE_KEYS, TABLE_LABELS, DEFAULT_SETTINGS, STORAGE_DB_NAME, STORAGE_CHAT_PREFIX, STORAGE_ARTIFACT_PREFIX, STORAGE_LOG_PREFIX, STORAGE_TASK_PREFIX, STORAGE_OUTBOX_PREFIX, STORAGE_LOCAL_COMMIT_PREFIX, STORAGE_OPERATION_LOG_PREFIX, STORAGE_BACKUP_PREFIX, CROSS_TAB_CHANNEL, CROSS_TAB_LEASE_PREFIX;
var init_constants = __esm({
  "src/constants.ts"() {
    "use strict";
    MODULE_NAME = "mirrorAbyssV11";
    LEGACY_MODULE_NAME = "mirrorAbyss";
    DISPLAY_NAME = "\u955C\u6E0A";
    VERSION = "1.1.0-alpha.10.7.1";
    PIPELINE_VERSION = "ma-pipeline-10.7.1";
    TABLE_KEYS = [
      "focus",
      "spacetime",
      "characters",
      "relationships",
      "items",
      "skills",
      "events",
      "regions",
      "foundations"
    ];
    TABLE_LABELS = {
      focus: "\u5F53\u524D\u7126\u70B9",
      spacetime: "\u65F6\u95F4\u4E0E\u5730\u70B9",
      characters: "\u4EBA\u7269",
      relationships: "\u5173\u7CFB",
      items: "\u7269\u54C1",
      skills: "\u6280\u80FD\u4E0E\u80FD\u529B",
      events: "\u4E8B\u4EF6\u4E0E\u6D41\u7A0B",
      regions: "\u533A\u57DF\u72B6\u6001",
      foundations: "\u57FA\u7840\u8BBE\u5B9A"
    };
    DEFAULT_SETTINGS = {
      enabled: true,
      autoState: true,
      showMessagePanel: true,
      showTopButton: true,
      auditEnabled: false,
      auditPrompt: "",
      auditFailAction: "revise",
      revisionPrompt: "",
      maxRevisionAttempts: 1,
      stopOnRepeatedViolation: true,
      revisionFallbackAction: "hide",
      lockGenerationDuringAudit: true,
      autoSmallSummary: true,
      smallSummaryTurns: 15,
      autoLargeSummary: true,
      largeSummaryCount: 6,
      lorebookSync: true,
      autoCreateLorebook: true,
      lorebookName: "",
      vectorizeRows: false,
      latestContinuityConstant: false,
      lorebookLayout: "semantic",
      connections: {
        audit: { mode: "current", profileId: "", profile: "" },
        revision: { mode: "current", profileId: "", profile: "" },
        factExtraction: { mode: "current", profileId: "", profile: "" },
        state: { mode: "current", profileId: "", profile: "" },
        smallSummary: { mode: "current", profileId: "", profile: "" },
        largeSummary: { mode: "current", profileId: "", profile: "" }
      },
      ui: {
        activeTab: "overview",
        activeTable: "focus",
        graphScope: "relations",
        graphZoom: 1
      },
      migration: {
        legacyChecked: false
      }
    };
    STORAGE_DB_NAME = "mirror-abyss-v11";
    STORAGE_CHAT_PREFIX = "ma11:chat:";
    STORAGE_ARTIFACT_PREFIX = "ma11:artifact:";
    STORAGE_LOG_PREFIX = "ma11:log:";
    STORAGE_TASK_PREFIX = "ma11:task:";
    STORAGE_OUTBOX_PREFIX = "ma11:outbox:";
    STORAGE_LOCAL_COMMIT_PREFIX = "ma11:local-commit:";
    STORAGE_OPERATION_LOG_PREFIX = "ma11:operation-log:";
    STORAGE_BACKUP_PREFIX = "ma11:backup:";
    CROSS_TAB_CHANNEL = "mirror-abyss-v11-coordination";
    CROSS_TAB_LEASE_PREFIX = "mirror-abyss-v11:lease:";
  }
});

// src/core/utils.ts
function deepClone(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
    }
  }
  return JSON.parse(JSON.stringify(value));
}
function mergeDefaults(defaults, current) {
  const output = deepClone(defaults);
  const merge = (target, source) => {
    if (!source) return;
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object" && !Array.isArray(target[key])) {
        merge(target[key], value);
      } else if (value !== void 0) {
        target[key] = value;
      }
    }
  };
  merge(output, current);
  return output;
}
function hashText(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function makeId(prefix = "ma") {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}
function safeText(value, max = 1e5) {
  return String(value ?? "").replace(/\u0000/g, "").slice(0, max);
}
function jsonPreview(raw, max = 360) {
  return safeText(raw, 1e5).replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<analysis>[\s\S]*?<\/analysis>/gi, "").replace(/\s+/g, " ").trim().slice(0, max);
}
function stripReasoningAndBom(text) {
  return text.replace(/^\uFEFF/, "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<analysis>[\s\S]*?<\/analysis>/gi, "").replace(/<!--[\s\S]*?-->/g, "").trim();
}
function fencedCandidates(text) {
  const output = [];
  const regex = /```(?:json|javascript|js|text)?\s*([\s\S]*?)```/gi;
  let match;
  while (match = regex.exec(text)) {
    if (match[1]?.trim()) output.push(match[1].trim());
  }
  return output;
}
function balancedObjectCandidates(text) {
  const output = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped2 = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped2) {
        escaped2 = false;
      } else if (char === "\\") {
        escaped2 = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        output.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return output;
}
function normalizeJsonPunctuationOutsideStrings(text) {
  let output = "";
  let inString = false;
  let escaped2 = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      output += char;
      if (escaped2) escaped2 = false;
      else if (char === "\\") escaped2 = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    const replacement = {
      "\uFF5B": "{",
      "\uFF5D": "}",
      "\uFF3B": "[",
      "\uFF3D": "]",
      "\uFF1A": ":",
      "\uFF0C": ","
    };
    output += replacement[char] ?? char;
  }
  return output;
}
function commonJsonRepairs(text) {
  const base = normalizeJsonPunctuationOutsideStrings(text).replace(/^\s*(?:json|JSON)\s*[:：]?\s*/, "").trim();
  const withoutTrailingCommas = base.replace(/,\s*([}\]])/g, "$1");
  const withoutSemicolon = withoutTrailingCommas.replace(/;\s*$/, "").trim();
  return [.../* @__PURE__ */ new Set([base, withoutTrailingCommas, withoutSemicolon])].filter(Boolean);
}
function parseObjectCandidate(candidate) {
  const parsed = JSON.parse(candidate);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON\u6839\u8282\u70B9\u5FC5\u987B\u662F\u5BF9\u8C61");
  }
  return parsed;
}
function parseJsonObject(raw) {
  const original = safeText(raw).trim();
  if (!original || original === "{}") throw new JsonObjectParseError("\u6A21\u578B\u8FD4\u56DE\u4E3A\u7A7A", raw);
  const clean = stripReasoningAndBom(original);
  const fenced = fencedCandidates(clean);
  const balanced = balancedObjectCandidates(clean).reverse();
  const candidates = [...fenced, clean, ...balanced];
  const uniqueCandidates = [...new Set(candidates.map((item2) => item2.trim()).filter(Boolean))];
  const attempts = [];
  for (const candidate of uniqueCandidates) {
    for (const repaired of commonJsonRepairs(candidate)) {
      try {
        return parseObjectCandidate(repaired);
      } catch (error) {
        attempts.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  throw new JsonObjectParseError("\u6A21\u578B\u672A\u8FD4\u56DE\u53EF\u89E3\u6790\u7684JSON\u5BF9\u8C61", raw, attempts.slice(-6));
}
function sanitizeBookName(value) {
  return String(value ?? "").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 80);
}
function toErrorMessage(error) {
  if (error instanceof Error) {
    const parts = [];
    const seen = /* @__PURE__ */ new Set();
    let current = error;
    while (current instanceof Error && !seen.has(current)) {
      seen.add(current);
      if (current.message && !parts.includes(current.message)) parts.push(current.message);
      if (current.suppressCauseDetails === true) break;
      current = current.cause;
    }
    return parts.join("\uFF1A") || error.name || "\u672A\u77E5\u9519\u8BEF";
  }
  if (error && typeof error === "object") {
    try {
      const message = error.message ?? error.error?.message;
      if (message) return String(message);
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error ?? "\u672A\u77E5\u9519\u8BEF");
}
var JsonObjectParseError;
var init_utils = __esm({
  "src/core/utils.ts"() {
    "use strict";
    JsonObjectParseError = class extends Error {
      preview;
      attempts;
      constructor(message, raw, attempts = []) {
        super(message);
        this.name = "JsonObjectParseError";
        this.preview = jsonPreview(raw);
        this.attempts = attempts;
      }
    };
  }
});

// src/foundation/account-scope.ts
function newAccountInstanceId(context) {
  try {
    if (typeof context?.uuidv4 === "function") return String(context.uuidv4());
    if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  } catch {
  }
  return makeId("ma-account");
}
function accountStorageValue(context) {
  try {
    return safeText(context?.accountStorage?.getItem?.(ACCOUNT_ID_STORAGE_KEY), 300).trim();
  } catch {
    return "";
  }
}
function persistAccountStorageValue(context, value) {
  try {
    if (typeof context?.accountStorage?.setItem !== "function") return false;
    context.accountStorage.setItem(ACCOUNT_ID_STORAGE_KEY, value);
    return true;
  } catch (error) {
    console.warn("[MirrorAbyss] accountStorage identity save failed", error);
    return false;
  }
}
function accountScopeFromContext(context) {
  const objectContext = context && typeof context === "object" ? context : null;
  let instanceId = accountStorageValue(context);
  let persistent = Boolean(instanceId);
  if (!instanceId && objectContext) instanceId = sessionAccountIds.get(objectContext) ?? "";
  if (!instanceId) {
    instanceId = newAccountInstanceId(context);
    persistent = persistAccountStorageValue(context, instanceId);
    if (!persistent && objectContext) sessionAccountIds.set(objectContext, instanceId);
  }
  return {
    instanceId,
    storageKey: hashText(instanceId),
    persistent
  };
}
var ACCOUNT_ID_STORAGE_KEY, sessionAccountIds;
var init_account_scope = __esm({
  "src/foundation/account-scope.ts"() {
    "use strict";
    init_constants();
    init_utils();
    ACCOUNT_ID_STORAGE_KEY = `${MODULE_NAME}:account-instance-id`;
    sessionAccountIds = /* @__PURE__ */ new WeakMap();
  }
});

// src/foundation/chat-scope.ts
function contextOrThrow() {
  const context = globalThis.SillyTavern?.getContext?.();
  if (!context) throw new Error("SillyTavern \u4E0A\u4E0B\u6587\u5C1A\u672A\u5C31\u7EEA");
  return context;
}
function rawChatIdFromContext(context) {
  return safeText(
    context?.getCurrentChatId?.() ?? context?.chatId ?? context?.chat_metadata?.chat_id ?? context?.chatMetadata?.chat_id ?? "",
    300
  ).trim();
}
function newPersistentInstanceId(context) {
  try {
    if (typeof context?.uuidv4 === "function") return String(context.uuidv4());
    if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  } catch {
  }
  return makeId("ma-chat");
}
function stableCharacterToken(context) {
  const character = Number.isInteger(Number(context?.characterId)) ? context?.characters?.[Number(context.characterId)] : void 0;
  const candidates = [
    character?.avatar,
    character?.data?.avatar,
    character?.name,
    context?.character?.avatar,
    context?.character?.name,
    context?.avatar,
    context?.name2,
    context?.name1
  ];
  const value = candidates.map((item2) => safeText(item2, 300).trim()).find(Boolean) || "unknown";
  return hashText(value);
}
function stableOwnerKey(context) {
  if (context?.groupId !== void 0 && context?.groupId !== null && String(context.groupId).trim()) {
    return `group:${String(context.groupId)}`;
  }
  return `character:${stableCharacterToken(context)}`;
}
function phase4OwnerKey(context) {
  if (context?.groupId !== void 0 && context?.groupId !== null && String(context.groupId).trim()) {
    return `group:${String(context.groupId)}`;
  }
  const character = context?.characterId ?? context?.name2 ?? context?.name1 ?? "unknown";
  return `character:${String(character)}`;
}
function alpha95StableKey(context, rawId) {
  return rawId ? `chat:${hashText(`${stableOwnerKey(context)}|${rawId}`)}` : "";
}
function scopedChatKey(accountKey, instanceId) {
  return `chat:${accountKey}:${hashText(instanceId)}`;
}
function attachedArtifactChatKeys(context) {
  const keys = /* @__PURE__ */ new Set();
  for (const message of context?.chat ?? []) {
    const key = safeText(message?.extra?.[MODULE_NAME]?.chatKey, 500).trim();
    if (key) keys.add(key);
  }
  return [...keys];
}
function uniqueAliases(values, currentKey = "") {
  return [...new Set(values.map((value) => safeText(value, 500).trim()).filter(Boolean))].filter((value) => value !== currentKey);
}
function namespaceFromContext(context) {
  const metadata = context?.chatMetadata ?? context?.chat_metadata;
  return metadata?.[MODULE_NAME] ?? {};
}
function deterministicPreviewInstance(context, rawId) {
  const account = accountScopeFromContext(context);
  return `ma-chat-${hashText(`${account.instanceId}|${stableOwnerKey(context)}|${rawId || "unsaved"}`)}`;
}
function legacyAliases(context, rawId, instanceId, currentKey) {
  const namespace2 = namespaceFromContext(context);
  const oldOwner = phase4OwnerKey(context);
  const phase4Key = rawId ? `${oldOwner}:${hashText(`${oldOwner}|${rawId}`)}` : "";
  const legacyInstanceKey = rawId ? `${oldOwner}:${hashText(`${oldOwner}|${rawId}|${instanceId}`)}` : "";
  return uniqueAliases([
    ...Array.isArray(namespace2.chatKeyAliases) ? namespace2.chatKeyAliases : [],
    alpha95StableKey(context, rawId),
    phase4Key,
    legacyInstanceKey,
    ...attachedArtifactChatKeys(context)
  ], currentKey);
}
function identityView(context) {
  const rawId = rawChatIdFromContext(context);
  const namespace2 = namespaceFromContext(context);
  const storedInstance = safeText(namespace2.chatInstanceId, 300).trim();
  const instanceId = storedInstance || deterministicPreviewInstance(context, rawId);
  const account = accountScopeFromContext(context);
  const currentKey = rawId ? scopedChatKey(account.storageKey, instanceId) : "";
  return {
    instanceId,
    aliases: legacyAliases(context, rawId, instanceId, currentKey),
    changed: false
  };
}
function ensureChatIdentityForContext(context, options = {}) {
  context.chatMetadata ||= context.chat_metadata || {};
  context.chat_metadata = context.chatMetadata;
  const rawId = rawChatIdFromContext(context);
  if (!rawId) return { instanceId: "", aliases: [], changed: false };
  const existingNamespace = context.chatMetadata[MODULE_NAME];
  const namespace2 = existingNamespace || {
    schemaVersion: 2,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  context.chatMetadata[MODULE_NAME] = namespace2;
  const previousInstance = safeText(namespace2.chatInstanceId, 300).trim();
  const previousRawId = safeText(namespace2.sourceChatId, 300).trim();
  const account = accountScopeFromContext(context);
  const previousKey = previousInstance ? scopedChatKey(account.storageKey, previousInstance) : "";
  const instanceId = options.forceNew ? newPersistentInstanceId(context) : previousInstance || deterministicPreviewInstance(context, rawId);
  const currentKey = scopedChatKey(account.storageKey, instanceId);
  const aliases = uniqueAliases([
    ...Array.isArray(namespace2.chatKeyAliases) ? namespace2.chatKeyAliases : [],
    previousKey,
    previousRawId ? alpha95StableKey(context, previousRawId) : "",
    ...legacyAliases(context, rawId, instanceId, currentKey)
  ], currentKey);
  let changed = !existingNamespace;
  if (namespace2.schemaVersion !== 2) {
    namespace2.schemaVersion = 2;
    changed = true;
  }
  if (namespace2.chatInstanceId !== instanceId) {
    namespace2.chatInstanceId = instanceId;
    namespace2.createdAt = nowIso();
    changed = true;
  }
  if (namespace2.accountKey !== account.storageKey) {
    namespace2.accountKey = account.storageKey;
    changed = true;
  }
  if (namespace2.sourceChatId !== rawId) {
    namespace2.sourceChatId = rawId;
    changed = true;
  }
  if (namespace2.ownerKey !== stableOwnerKey(context)) {
    namespace2.ownerKey = stableOwnerKey(context);
    changed = true;
  }
  const previousAliases = uniqueAliases(Array.isArray(namespace2.chatKeyAliases) ? namespace2.chatKeyAliases : []);
  if (JSON.stringify(previousAliases) !== JSON.stringify(aliases)) {
    namespace2.chatKeyAliases = aliases;
    changed = true;
  }
  if (changed) {
    namespace2.updatedAt = nowIso();
    context.saveMetadataDebounced?.();
  }
  return { instanceId, aliases, changed };
}
function rotateChatIdentityForContext(context) {
  return ensureChatIdentityForContext(context, { forceNew: true });
}
var ChatScopeManager, chatScopeManager;
var init_chat_scope = __esm({
  "src/foundation/chat-scope.ts"() {
    "use strict";
    init_constants();
    init_utils();
    init_account_scope();
    ChatScopeManager = class {
      revision = 0;
      ephemeralId = makeId("ephemeral-chat");
      lastChatKey = "";
      lastRawId = "";
      current() {
        const context = contextOrThrow();
        const rawId = rawChatIdFromContext(context);
        const owner = stableOwnerKey(context);
        const account = accountScopeFromContext(context);
        const persistent = Boolean(rawId);
        const identity = persistent ? identityView(context) : { instanceId: this.ephemeralId, aliases: [], changed: false };
        const chatKey = persistent ? scopedChatKey(account.storageKey, identity.instanceId) : `ephemeral:${account.storageKey}:${hashText(`${owner}|${this.ephemeralId}`)}`;
        if (chatKey !== this.lastChatKey || rawId !== this.lastRawId) {
          this.revision += 1;
          this.lastChatKey = chatKey;
          this.lastRawId = rawId;
          if (!rawId) this.ephemeralId = identity.instanceId;
        }
        return {
          chatKey,
          rawChatId: rawId,
          ownerKey: owner,
          accountKey: account.storageKey,
          revision: this.revision,
          persistent,
          capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
          aliases: identity.aliases,
          instanceId: identity.instanceId
        };
      }
      invalidate() {
        this.revision += 1;
        this.ephemeralId = makeId("ephemeral-chat");
        this.lastChatKey = "";
        this.lastRawId = "";
        return this.current();
      }
      isCurrent(snapshot) {
        const current = this.current();
        return current.chatKey === snapshot.chatKey && current.revision === snapshot.revision;
      }
    };
    chatScopeManager = new ChatScopeManager();
  }
});

// src/storage/repository.ts
function configurePortableChatStateBridge(bridge) {
  portableChatStateBridge = bridge;
}
function storageNamespaceFromChatKey(chatKey) {
  if (chatKey.startsWith("chat:")) {
    const [, accountKey] = chatKey.split(":");
    if (accountKey) return accountKey;
  }
  return "legacy";
}
function localStorageAdapter(databaseName) {
  return {
    async getItem(key) {
      const raw = localStorage.getItem(`${databaseName}:${key}`);
      return raw ? JSON.parse(raw) : null;
    },
    async setItem(key, value) {
      localStorage.setItem(`${databaseName}:${key}`, JSON.stringify(value));
      return value;
    },
    async removeItem(key) {
      localStorage.removeItem(`${databaseName}:${key}`);
    },
    async keys() {
      return Object.keys(localStorage).filter((key) => key.startsWith(`${databaseName}:`)).map((key) => key.slice(databaseName.length + 1));
    }
  };
}
function getPersistentAdapter(namespace2 = "legacy") {
  const existing = persistentAdapters.get(namespace2);
  if (existing) return existing;
  const databaseName = namespace2 === "legacy" ? STORAGE_DB_NAME : `${STORAGE_DB_NAME}-${namespace2}`;
  const localforage = globalThis.SillyTavern?.libs?.localforage;
  const adapter = localforage?.createInstance ? localforage.createInstance({ name: databaseName, storeName: "mirror_abyss" }) : localStorageAdapter(databaseName);
  persistentAdapters.set(namespace2, adapter);
  return adapter;
}
function isEphemeralChatKey(chatKey) {
  return chatKey.startsWith("ephemeral:");
}
function adapterForChat(chatKey) {
  return isEphemeralChatKey(chatKey) ? ephemeralAdapter : getPersistentAdapter(storageNamespaceFromChatKey(chatKey));
}
async function readStored(prefix, chatKey, suffix = "") {
  return adapterForChat(chatKey).getItem(`${prefix}${chatKey}${suffix}`);
}
function remapStorageKey(key, alias, chatKey) {
  const exactPrefixes = [STORAGE_CHAT_PREFIX, STORAGE_LOG_PREFIX, STORAGE_OPERATION_LOG_PREFIX];
  for (const prefix of exactPrefixes) {
    if (key === `${prefix}${alias}`) return `${prefix}${chatKey}`;
  }
  const scopedPrefixes = [
    STORAGE_ARTIFACT_PREFIX,
    STORAGE_TASK_PREFIX,
    STORAGE_OUTBOX_PREFIX,
    STORAGE_LOCAL_COMMIT_PREFIX,
    STORAGE_BACKUP_PREFIX
  ];
  for (const prefix of scopedPrefixes) {
    const oldPrefix = `${prefix}${alias}:`;
    if (key.startsWith(oldPrefix)) return `${prefix}${chatKey}:${key.slice(oldPrefix.length)}`;
  }
  return null;
}
function rewriteStoredChatKey(value, chatKey) {
  const clone = structuredClone(value);
  if (Array.isArray(clone)) {
    for (const item2 of clone) if (item2 && typeof item2 === "object" && "chatKey" in item2) item2.chatKey = chatKey;
  } else if (clone && typeof clone === "object" && "chatKey" in clone) {
    clone.chatKey = chatKey;
  }
  return clone;
}
async function migrateChatStorageAliases(chatKey, aliases) {
  if (isEphemeralChatKey(chatKey)) return 0;
  const targetStorage = adapterForChat(chatKey);
  const sourceStorages = [.../* @__PURE__ */ new Set([
    targetStorage,
    getPersistentAdapter("legacy")
  ])];
  let copied = 0;
  for (const alias of [...new Set(aliases.filter((value) => value && value !== chatKey))]) {
    for (const sourceStorage of sourceStorages) {
      const keys = await sourceStorage.keys();
      for (const key of keys) {
        const target = remapStorageKey(key, alias, chatKey);
        if (!target || await targetStorage.getItem(target)) continue;
        const value = await sourceStorage.getItem(key);
        if (value === null) continue;
        await targetStorage.setItem(target, rewriteStoredChatKey(value, chatKey));
        copied += 1;
      }
    }
  }
  return copied;
}
async function getChatStateExact(chatKey) {
  return adapterForChat(chatKey).getItem(`${STORAGE_CHAT_PREFIX}${chatKey}`);
}
async function getArtifactExact(chatKey, messageKey) {
  return adapterForChat(chatKey).getItem(`${STORAGE_ARTIFACT_PREFIX}${chatKey}:${messageKey}`);
}
async function getChatState(chatKey) {
  let existing = await readStored(STORAGE_CHAT_PREFIX, chatKey);
  if (!existing && portableChatStateBridge) {
    existing = await portableChatStateBridge.read(chatKey);
    if (existing) {
      existing = structuredClone(existing);
      existing.chatKey = chatKey;
      await adapterForChat(chatKey).setItem(`${STORAGE_CHAT_PREFIX}${chatKey}`, existing);
    }
  }
  if (existing) {
    existing.smallSummaries ||= [];
    existing.largeSummaries ||= [];
    existing.eventEntries ||= [];
    if (existing.chatKey !== chatKey) {
      existing.chatKey = chatKey;
      existing.updatedAt = nowIso();
      await putChatState(existing);
    }
    return existing;
  }
  return {
    schemaVersion: 1,
    chatKey,
    processedMessageKeys: [],
    smallSummaries: [],
    largeSummaries: [],
    eventEntries: [],
    lastSyncStatus: "idle",
    updatedAt: nowIso()
  };
}
async function putChatState(state2) {
  state2.updatedAt = nowIso();
  await adapterForChat(state2.chatKey).setItem(`${STORAGE_CHAT_PREFIX}${state2.chatKey}`, state2);
  await portableChatStateBridge?.write(structuredClone(state2));
}
async function getArtifact(chatKey, messageKey) {
  const artifact = await readStored(STORAGE_ARTIFACT_PREFIX, chatKey, `:${messageKey}`);
  if (artifact && artifact.chatKey !== chatKey) {
    artifact.chatKey = chatKey;
    artifact.updatedAt = nowIso();
    await putArtifact(artifact);
  }
  return artifact;
}
async function putArtifact(artifact) {
  artifact.updatedAt = nowIso();
  await adapterForChat(artifact.chatKey).setItem(`${STORAGE_ARTIFACT_PREFIX}${artifact.chatKey}:${artifact.messageKey}`, artifact);
}
async function removeArtifact(chatKey, messageKey) {
  await adapterForChat(chatKey).removeItem(`${STORAGE_ARTIFACT_PREFIX}${chatKey}:${messageKey}`);
}
async function putLorebookOutbox(record) {
  record.updatedAt = nowIso();
  await adapterForChat(record.chatKey).setItem(`${STORAGE_OUTBOX_PREFIX}${record.chatKey}:${record.id}`, record);
}
async function getLorebookOutbox(chatKey, id) {
  return readStored(STORAGE_OUTBOX_PREFIX, chatKey, `:${id}`);
}
async function getLorebookOutboxRecords(chatKey) {
  const storage = adapterForChat(chatKey);
  const keys = await storage.keys();
  const prefix = `${STORAGE_OUTBOX_PREFIX}${chatKey}:`;
  const records = await Promise.all(
    keys.filter((key) => key.startsWith(prefix)).map((key) => storage.getItem(key))
  );
  return records.filter((record) => Boolean(record)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function findLorebookOutboxByIntent(chatKey, intentKey) {
  const records = await getLorebookOutboxRecords(chatKey);
  return records.find((record) => record.intentKey === intentKey) ?? null;
}
async function removeLorebookOutbox(chatKey, id) {
  await adapterForChat(chatKey).removeItem(`${STORAGE_OUTBOX_PREFIX}${chatKey}:${id}`);
}
async function pruneLorebookOutbox(chatKey, keep = 50) {
  const terminal = /* @__PURE__ */ new Set(["committed", "rolled_back", "cancelled"]);
  const records = (await getLorebookOutboxRecords(chatKey)).filter((record) => terminal.has(record.state)).slice(keep);
  await Promise.all(records.map((record) => removeLorebookOutbox(chatKey, record.id)));
  return records.length;
}
async function putLocalCommit(record) {
  record.updatedAt = nowIso();
  await adapterForChat(record.chatKey).setItem(`${STORAGE_LOCAL_COMMIT_PREFIX}${record.chatKey}:${record.id}`, record);
}
async function getLocalCommit(chatKey, id) {
  return readStored(STORAGE_LOCAL_COMMIT_PREFIX, chatKey, `:${id}`);
}
async function getLocalCommitRecords(chatKey) {
  const storage = adapterForChat(chatKey);
  const keys = await storage.keys();
  const prefix = `${STORAGE_LOCAL_COMMIT_PREFIX}${chatKey}:`;
  const records = await Promise.all(
    keys.filter((key) => key.startsWith(prefix)).map((key) => storage.getItem(key))
  );
  return records.filter((record) => Boolean(record)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function findLocalCommitByIntent(chatKey, intentKey) {
  const records = await getLocalCommitRecords(chatKey);
  return records.find((record) => record.intentKey === intentKey) ?? null;
}
async function removeLocalCommit(chatKey, id) {
  await adapterForChat(chatKey).removeItem(`${STORAGE_LOCAL_COMMIT_PREFIX}${chatKey}:${id}`);
}
async function pruneLocalCommits(chatKey, keep = 50) {
  const terminal = /* @__PURE__ */ new Set(["committed", "cancelled"]);
  const records = (await getLocalCommitRecords(chatKey)).filter((record) => terminal.has(record.state) && record.messageAttached !== false).slice(keep);
  await Promise.all(records.map((record) => removeLocalCommit(chatKey, record.id)));
  return records.length;
}
async function appendOperationLog(chatKey, input) {
  const record = {
    id: `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    chatKey,
    createdAt: nowIso(),
    ...input
  };
  const storage = adapterForChat(chatKey);
  const key = `${STORAGE_OPERATION_LOG_PREFIX}${chatKey}`;
  const logs = await storage.getItem(key) ?? [];
  logs.unshift(record);
  await storage.setItem(key, logs.slice(0, 500));
  return record;
}
async function getOperationLog(chatKey) {
  return await adapterForChat(chatKey).getItem(`${STORAGE_OPERATION_LOG_PREFIX}${chatKey}`) ?? [];
}
async function safeAppendOperationLog(chatKey, input) {
  try {
    await appendOperationLog(chatKey, input);
  } catch (error) {
    console.warn("[MirrorAbyss] operation log save failed", error);
  }
}
async function putMigrationBackup(backup) {
  await adapterForChat(backup.chatKey).setItem(`${STORAGE_BACKUP_PREFIX}${backup.chatKey}:${backup.id}`, backup);
}
async function getMigrationBackups(chatKey) {
  const storage = adapterForChat(chatKey);
  const keys = await storage.keys();
  const prefix = `${STORAGE_BACKUP_PREFIX}${chatKey}:`;
  const backups = await Promise.all(
    keys.filter((key) => key.startsWith(prefix)).map((key) => storage.getItem(key))
  );
  return backups.filter((backup) => Boolean(backup)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function removeMigrationBackup(chatKey, id) {
  await adapterForChat(chatKey).removeItem(`${STORAGE_BACKUP_PREFIX}${chatKey}:${id}`);
}
async function putQueueTask(task) {
  task.updatedAt = nowIso();
  await adapterForChat(task.chatKey).setItem(`${STORAGE_TASK_PREFIX}${task.chatKey}:${task.id}`, task);
}
async function getQueueTasks(chatKey) {
  const storage = adapterForChat(chatKey);
  const keys = await storage.keys();
  const prefix = `${STORAGE_TASK_PREFIX}${chatKey}:`;
  const tasks = await Promise.all(keys.filter((key) => key.startsWith(prefix)).map((key) => storage.getItem(key)));
  return tasks.filter((task) => Boolean(task)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function markInterruptedTasksStale(chatKey) {
  const tasks = await getQueueTasks(chatKey);
  let count = 0;
  for (const task of tasks) {
    if (task.state === "queued" || task.state === "running") {
      task.state = "stale";
      task.error = "\u9875\u9762\u91CD\u8F7D\u6216\u63D2\u4EF6\u91CD\u542F\uFF0C\u65E7\u4EFB\u52A1\u5DF2\u5B89\u5168\u505C\u6B62";
      task.finishedAt = nowIso();
      await putQueueTask(task);
      count += 1;
    }
  }
  return count;
}
async function appendTaskLog(chatKey, task) {
  const storage = adapterForChat(chatKey);
  const key = `${STORAGE_LOG_PREFIX}${chatKey}`;
  const logs = await storage.getItem(key) ?? [];
  logs.unshift(task);
  await storage.setItem(key, logs.slice(0, 200));
}
async function getTaskLog(chatKey) {
  return await adapterForChat(chatKey).getItem(`${STORAGE_LOG_PREFIX}${chatKey}`) ?? [];
}
async function clearChatStorage(chatKey, options = {}) {
  const storage = adapterForChat(chatKey);
  const keys = await storage.keys();
  const exactChatKey = `${STORAGE_CHAT_PREFIX}${chatKey}`;
  const artifactPrefix = `${STORAGE_ARTIFACT_PREFIX}${chatKey}:`;
  const exactLogKey = `${STORAGE_LOG_PREFIX}${chatKey}`;
  const taskPrefix = `${STORAGE_TASK_PREFIX}${chatKey}:`;
  const outboxPrefix = `${STORAGE_OUTBOX_PREFIX}${chatKey}:`;
  const localCommitPrefix = `${STORAGE_LOCAL_COMMIT_PREFIX}${chatKey}:`;
  const operationLogKey = `${STORAGE_OPERATION_LOG_PREFIX}${chatKey}`;
  const backupPrefix = `${STORAGE_BACKUP_PREFIX}${chatKey}:`;
  await Promise.all(
    keys.filter(
      (key) => key === exactChatKey || key === exactLogKey || key === operationLogKey || key.startsWith(artifactPrefix) || key.startsWith(taskPrefix) || !options.preserveOutbox && key.startsWith(outboxPrefix) || !options.preserveLocalCommits && key.startsWith(localCommitPrefix) || !options.preserveBackups && key.startsWith(backupPrefix)
    ).map((key) => storage.removeItem(key))
  );
  await portableChatStateBridge?.clear?.(chatKey);
}
async function listMirrorAbyssStorageKeys() {
  const adapters = [.../* @__PURE__ */ new Set([...persistentAdapters.values(), getPersistentAdapter("legacy")])];
  const persistentKeys = (await Promise.all(adapters.map((adapter) => adapter.keys()))).flat();
  const ephemeralKeys = await ephemeralAdapter.keys();
  return [.../* @__PURE__ */ new Set([...persistentKeys, ...ephemeralKeys])].filter((key) => key.startsWith("ma11:"));
}
async function clearAllStorage() {
  const adapters = [.../* @__PURE__ */ new Set([...persistentAdapters.values(), getPersistentAdapter("legacy")])];
  for (const adapter of adapters) {
    const keys = await adapter.keys();
    await Promise.all(keys.filter((key) => key.startsWith("ma11:")).map((key) => adapter.removeItem(key)));
  }
  const ephemeralKeys = await ephemeralAdapter.keys();
  await Promise.all(ephemeralKeys.filter((key) => key.startsWith("ma11:")).map((key) => ephemeralAdapter.removeItem(key)));
}
var portableChatStateBridge, persistentAdapters, ephemeralMap, ephemeralAdapter;
var init_repository = __esm({
  "src/storage/repository.ts"() {
    "use strict";
    init_constants();
    init_utils();
    portableChatStateBridge = null;
    persistentAdapters = /* @__PURE__ */ new Map();
    ephemeralMap = /* @__PURE__ */ new Map();
    ephemeralAdapter = {
      async getItem(key) {
        return ephemeralMap.has(key) ? structuredClone(ephemeralMap.get(key)) : null;
      },
      async setItem(key, value) {
        ephemeralMap.set(key, structuredClone(value));
        return value;
      },
      async removeItem(key) {
        ephemeralMap.delete(key);
      },
      async keys() {
        return [...ephemeralMap.keys()];
      }
    };
  }
});

// src/foundation/task-errors.ts
var StaleTaskError, TaskCancelledError;
var init_task_errors = __esm({
  "src/foundation/task-errors.ts"() {
    "use strict";
    StaleTaskError = class extends Error {
      constructor(message = "\u4EFB\u52A1\u6240\u5C5E\u804A\u5929\u5DF2\u6539\u53D8\uFF0C\u65E7\u4EFB\u52A1\u5DF2\u505C\u6B62") {
        super(message);
        this.name = "StaleTaskError";
      }
    };
    TaskCancelledError = class extends Error {
      constructor(message = "\u4EFB\u52A1\u5DF2\u53D6\u6D88") {
        super(message);
        this.name = "TaskCancelledError";
      }
    };
  }
});

// src/pipeline/task-queue.ts
var task_queue_exports = {};
__export(task_queue_exports, {
  StaleTaskError: () => StaleTaskError,
  TaskCancelledError: () => TaskCancelledError,
  TaskQueue: () => TaskQueue,
  taskQueue: () => taskQueue
});
var TaskQueue, taskQueue;
var init_task_queue = __esm({
  "src/pipeline/task-queue.ts"() {
    "use strict";
    init_repository();
    init_chat_scope();
    init_utils();
    init_task_errors();
    init_task_errors();
    TaskQueue = class {
      laneTails = /* @__PURE__ */ new Map();
      inFlight = /* @__PURE__ */ new Map();
      tasks = /* @__PURE__ */ new Map();
      active = /* @__PURE__ */ new Map();
      listeners = /* @__PURE__ */ new Set();
      subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      }
      notify() {
        for (const listener of this.listeners) {
          try {
            listener();
          } catch (error) {
            console.warn("[MirrorAbyss] task listener failed", error);
          }
        }
      }
      async persist(task) {
        try {
          await putQueueTask({ ...task });
        } catch (error) {
          console.warn("[MirrorAbyss] task persistence failed", error);
        }
      }
      async finalize(key, scopeChatKey, task) {
        task.finishedAt ||= nowIso();
        task.updatedAt = task.finishedAt;
        this.inFlight.delete(key);
        this.active.delete(task.id);
        await this.persist(task);
        try {
          await appendTaskLog(scopeChatKey, { ...task });
        } catch (error) {
          console.warn("[MirrorAbyss] task log save failed", error);
        }
        this.notify();
      }
      list() {
        return [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }
      has(key) {
        return this.inFlight.has(key);
      }
      run(key, label, kind, work, options = {}) {
        const existing = this.inFlight.get(key);
        if (existing) return existing;
        const scope = chatScopeManager.current();
        const laneKey = options.laneKey?.trim() || `chat:${scope.chatKey}`;
        const controller = new AbortController();
        const createdAt = nowIso();
        const task = {
          id: makeId("task"),
          key,
          chatKey: scope.chatKey,
          scopeRevision: scope.revision,
          laneKey,
          label,
          kind,
          state: "queued",
          priority: options.priority,
          blocking: options.blocking,
          sourceStartIndex: options.sourceRange?.startIndex,
          sourceEndIndex: options.sourceRange?.endIndex,
          progressCurrent: options.progressTotal ? 0 : void 0,
          progressTotal: options.progressTotal,
          progressLabel: options.progressLabel,
          retries: 0,
          createdAt,
          updatedAt: createdAt
        };
        this.tasks.set(task.id, task);
        this.active.set(task.id, { task, controller });
        void this.persist(task);
        this.notify();
        const execute = async () => {
          try {
            if (controller.signal.aborted) {
              throw controller.signal.reason instanceof StaleTaskError ? controller.signal.reason : new TaskCancelledError(toErrorMessage(controller.signal.reason || "\u4EFB\u52A1\u5728\u6392\u961F\u671F\u95F4\u88AB\u53D6\u6D88"));
            }
            if (!chatScopeManager.isCurrent(scope)) {
              throw new StaleTaskError("\u4EFB\u52A1\u6392\u961F\u671F\u95F4\u804A\u5929\u5DF2\u5207\u6362");
            }
            task.state = "running";
            task.startedAt = nowIso();
            task.updatedAt = task.startedAt;
            await this.persist(task);
            this.notify();
            const result = await work(controller.signal);
            if (controller.signal.aborted) {
              if (!chatScopeManager.isCurrent(scope) || controller.signal.reason instanceof StaleTaskError) {
                throw controller.signal.reason instanceof StaleTaskError ? controller.signal.reason : new StaleTaskError("\u4EFB\u52A1\u6267\u884C\u671F\u95F4\u804A\u5929\u5DF2\u5207\u6362");
              }
              throw controller.signal.reason instanceof TaskCancelledError ? controller.signal.reason : new TaskCancelledError(toErrorMessage(controller.signal.reason || "\u4EFB\u52A1\u6267\u884C\u671F\u95F4\u88AB\u53D6\u6D88"));
            }
            if (!chatScopeManager.isCurrent(scope)) {
              throw new StaleTaskError("\u4EFB\u52A1\u6267\u884C\u671F\u95F4\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u7ED3\u679C\u672A\u63D0\u4EA4\u5230\u65B0\u804A\u5929");
            }
            task.state = "success";
            task.error = void 0;
            return result;
          } catch (error) {
            let finalError = error;
            if (error instanceof StaleTaskError || !chatScopeManager.isCurrent(scope)) {
              task.state = "stale";
              task.error = error instanceof StaleTaskError ? error.message : "\u4EFB\u52A1\u6267\u884C\u671F\u95F4\u804A\u5929\u5DF2\u5207\u6362";
              if (!(error instanceof StaleTaskError)) finalError = new StaleTaskError(task.error);
            } else if (error instanceof TaskCancelledError || error instanceof DOMException && error.name === "AbortError" || controller.signal.aborted) {
              task.state = "cancelled";
              task.error = toErrorMessage(error);
              if (!(error instanceof TaskCancelledError)) finalError = new TaskCancelledError(task.error);
            } else {
              task.state = "failed";
              task.error = toErrorMessage(error);
            }
            throw finalError;
          } finally {
            await this.finalize(key, scope.chatKey, task);
          }
        };
        const previous = this.laneTails.get(laneKey) ?? Promise.resolve();
        const promise = previous.then(execute, execute);
        const settledTail = promise.catch(() => void 0);
        this.laneTails.set(laneKey, settledTail);
        void settledTail.finally(() => {
          if (this.laneTails.get(laneKey) === settledTail) this.laneTails.delete(laneKey);
        });
        this.inFlight.set(key, promise);
        return promise;
      }
      updateByKey(key, patch) {
        const active = [...this.active.values()].find((item2) => item2.task.key === key);
        if (!active) return false;
        Object.assign(active.task, patch, { updatedAt: nowIso() });
        void this.persist(active.task);
        this.notify();
        return true;
      }
      cancel(taskId, reason = "\u7528\u6237\u53D6\u6D88\u4EFB\u52A1") {
        const active = this.active.get(taskId);
        if (!active) return false;
        active.controller.abort(new TaskCancelledError(reason));
        this.notify();
        return true;
      }
      cancelByKey(key, reason = "\u4EFB\u52A1\u5DF2\u88AB\u66FF\u6362") {
        let count = 0;
        for (const active of this.active.values()) {
          if (active.task.key !== key) continue;
          active.controller.abort(new TaskCancelledError(reason));
          count += 1;
        }
        if (count) this.notify();
        return count;
      }
      cancelChat(chatKey, reason = "\u804A\u5929\u4EFB\u52A1\u5DF2\u53D6\u6D88") {
        let count = 0;
        for (const active of this.active.values()) {
          if (active.task.chatKey !== chatKey) continue;
          active.controller.abort(new TaskCancelledError(reason));
          count += 1;
        }
        if (count) this.notify();
        return count;
      }
      cancelAllExceptChat(chatKey, reason = "\u804A\u5929\u5DF2\u5207\u6362") {
        let count = 0;
        for (const active of this.active.values()) {
          if (active.task.chatKey === chatKey) continue;
          active.controller.abort(new StaleTaskError(reason));
          count += 1;
        }
        if (count) this.notify();
        return count;
      }
      cancelAll(reason = "\u4EFB\u52A1\u961F\u5217\u5DF2\u505C\u6B62") {
        let count = 0;
        for (const active of this.active.values()) {
          active.controller.abort(new TaskCancelledError(reason));
          count += 1;
        }
        if (count) this.notify();
        return count;
      }
    };
    taskQueue = new TaskQueue();
  }
});

// src/bootstrap/app.ts
init_constants();

// src/core/context.ts
init_constants();
init_utils();
init_chat_scope();
function getContext() {
  const context = globalThis.SillyTavern?.getContext?.();
  if (!context) throw new Error("SillyTavern\u4E0A\u4E0B\u6587\u5C1A\u672A\u5C31\u7EEA");
  return context;
}
function tryGetContext() {
  try {
    return globalThis.SillyTavern?.getContext?.() ?? null;
  } catch {
    return null;
  }
}
function getSettings() {
  const context = getContext();
  context.extensionSettings ||= {};
  const legacy = context.extensionSettings[LEGACY_MODULE_NAME];
  const current = context.extensionSettings[MODULE_NAME];
  const migrated = current ?? migrateLegacySettings(legacy);
  const hadFactConnection = Boolean(migrated?.connections?.factExtraction);
  context.extensionSettings[MODULE_NAME] = mergeDefaults(DEFAULT_SETTINGS, migrated);
  const settings = context.extensionSettings[MODULE_NAME];
  if (!hadFactConnection && migrated?.connections?.state) {
    settings.connections.factExtraction = deepClone(migrated.connections.state);
  }
  if (String(settings.lorebookLayout) === "compact") settings.lorebookLayout = "semantic";
  settings.latestContinuityConstant = false;
  delete settings.repairInvalidJsonOnce;
  const savedProfiles = Array.isArray(context.extensionSettings?.connectionManager?.profiles) ? context.extensionSettings.connectionManager.profiles : [];
  for (const connection of Object.values(settings.connections ?? {})) {
    connection.profileId ||= "";
    connection.profile ||= "";
    if (connection.mode === "independent") connection.mode = "current";
    connection.independentProfileId = "";
    if (!connection.profileId && connection.profile) {
      const matched = savedProfiles.find((profile) => safeText(profile?.name, 160).trim() === safeText(connection.profile, 160).trim());
      if (matched?.id) connection.profileId = String(matched.id);
    }
  }
  return settings;
}
function migrateLegacySettings(legacy) {
  if (!legacy || typeof legacy !== "object") return void 0;
  return {
    enabled: legacy.enabled ?? true,
    autoState: legacy.autoState ?? true,
    showMessagePanel: legacy.showMessagePanels ?? true,
    showTopButton: legacy.showTopButton ?? true,
    auditEnabled: legacy.ruleAuditEnabled ?? false,
    auditPrompt: safeText(legacy.ruleAuditPrompt ?? ""),
    auditFailAction: legacy.ruleAuditFailAction === "withdraw" ? "delete" : "mark",
    revisionPrompt: safeText(legacy.revisionPrompt ?? ""),
    maxRevisionAttempts: Number(legacy.maxRevisionAttempts) || 1,
    stopOnRepeatedViolation: legacy.stopOnRepeatedViolation ?? true,
    revisionFallbackAction: legacy.revisionFallbackAction ?? "hide",
    lockGenerationDuringAudit: legacy.lockGenerationDuringAudit ?? true,
    autoSmallSummary: legacy.autoSmallSummary ?? true,
    smallSummaryTurns: Number(legacy.smallSummaryTurns) || 15,
    autoLargeSummary: legacy.autoLargeSummary ?? true,
    largeSummaryCount: Number(legacy.largeSummaryCount) || 6,
    lorebookSync: legacy.lorebookSync ?? true,
    autoCreateLorebook: legacy.autoCreateChatLorebook ?? true,
    lorebookName: safeText(legacy.lorebookName ?? "", 80),
    vectorizeRows: legacy.vectorizeStateRows ?? false,
    latestContinuityConstant: legacy.latestContinuityConstant ?? false,
    connections: {
      audit: { mode: legacy.auditProfile ? "profile" : "current", profileId: "", profile: safeText(legacy.auditProfile ?? "", 120) },
      revision: { mode: legacy.revisionProfile ? "profile" : "current", profileId: "", profile: safeText(legacy.revisionProfile ?? legacy.auditProfile ?? "", 120) },
      factExtraction: { mode: legacy.stateProfile ? "profile" : "current", profileId: "", profile: safeText(legacy.stateProfile ?? "", 120) },
      state: { mode: legacy.stateProfile ? "profile" : "current", profileId: "", profile: safeText(legacy.stateProfile ?? "", 120) },
      smallSummary: { mode: legacy.smallSummaryProfile ? "profile" : "current", profileId: "", profile: safeText(legacy.smallSummaryProfile ?? "", 120) },
      largeSummary: { mode: legacy.largeSummaryProfile ? "profile" : "current", profileId: "", profile: safeText(legacy.largeSummaryProfile ?? "", 120) }
    }
  };
}
function saveSettings() {
  getContext().saveSettingsDebounced?.();
}
function getChat() {
  return getContext().chat ?? [];
}
function getMessage(index) {
  return getChat()[index] ?? null;
}
function latestAssistantIndex() {
  const chat = getChat();
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    if (!chat[i]?.is_user && safeText(chat[i]?.mes).trim()) return i;
  }
  return -1;
}
function previousUserText(beforeIndex) {
  const chat = getChat();
  for (let i = beforeIndex - 1; i >= 0; i -= 1) {
    if (chat[i]?.is_user) return safeText(chat[i]?.mes).trim();
  }
  return "";
}
function currentRawChatId(context = getContext()) {
  return rawChatIdFromContext(context);
}
function ensureChatInstanceId() {
  return ensureChatIdentityForContext(getContext()).instanceId;
}
function legacyCurrentChatKey() {
  const context = getContext();
  const rawChatId = currentRawChatId(context);
  const instanceId = ensureChatInstanceId();
  const scope = context.groupId ? `group:${context.groupId}` : `character:${context.characterId ?? context.name2 ?? "unknown"}`;
  return `${scope}:${hashText(`${scope}|${rawChatId || "unsaved"}|${instanceId}`)}`;
}
function currentChatKey() {
  return chatScopeManager.current().chatKey;
}
function messageFingerprint(index) {
  const message = getMessage(index);
  return hashText(`${previousUserText(index)}
---MA11---
${safeText(message?.mes)}`);
}
function messageStableIdentity(index) {
  const message = getMessage(index);
  const stable = message?.id ?? message?.extra?.gen_id ?? message?.send_date ?? index;
  return String(stable);
}
function messageIdentity(index) {
  return `${messageStableIdentity(index)}:${messageFingerprint(index)}`;
}
function getChatMetadataNamespace() {
  const context = getContext();
  context.chatMetadata ||= context.chat_metadata || {};
  context.chat_metadata = context.chatMetadata;
  context.chatMetadata[MODULE_NAME] ||= {
    schemaVersion: 1,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  ensureChatInstanceId();
  return context.chatMetadata[MODULE_NAME];
}
async function persistMetadata() {
  const context = getContext();
  if (typeof context.saveMetadata === "function") {
    await context.saveMetadata();
    return;
  }
  context.saveMetadataDebounced?.();
}
async function persistChat() {
  const context = getContext();
  if (typeof context.saveChat === "function") {
    await context.saveChat();
    return;
  }
  if (typeof context.saveChatConditional === "function") {
    await context.saveChatConditional();
  }
}
function toast(kind, message) {
  const toastr = globalThis.toastr;
  if (toastr?.[kind]) toastr[kind](message, DISPLAY_NAME);
  else console[kind === "error" ? "error" : "log"](`[${DISPLAY_NAME}] ${message}`);
}

// src/bootstrap/app.ts
init_repository();

// src/pipeline/pipeline.ts
init_constants();
init_utils();

// src/domain/artifact.ts
init_constants();
init_utils();
function idleStage() {
  return { status: "idle", attempts: 0 };
}
function createArtifact(seed) {
  const now = nowIso();
  return {
    schemaVersion: 1,
    chatKey: seed.chatKey,
    stableMessageId: seed.stableMessageId,
    messageKey: seed.messageKey,
    messageIndex: seed.messageIndex,
    sourceFingerprint: seed.sourceFingerprint,
    playerText: safeText(seed.playerText),
    assistantText: safeText(seed.assistantText),
    createdAt: now,
    updatedAt: now,
    admission: {
      status: "pending",
      mode: "pending",
      detail: "等待正文准入确认"
    },
    lineage: {
      source: "assistant_final_text",
      tableSource: "approved_final_text",
      smallSummarySource: "fact_packages_active_table_and_event_registry",
      largeSummarySource: "small_summary_events_and_previous_large_summary",
      graphMode: "read_only"
    },
    stages: {
      audit: idleStage(),
      revision: idleStage(),
      state: idleStage(),
      summary: idleStage(),
      sync: idleStage()
    }
  };
}
function attachArtifactToMessage(message, artifact) {
  message.extra ||= {};
  message.extra[MODULE_NAME] = artifact;
}
function getAttachedArtifact(message) {
  const value = message?.extra?.[MODULE_NAME];
  return value && typeof value === "object" ? value : null;
}
function markStage(artifact, stage, status, error) {
  const current = artifact.stages[stage] ?? idleStage();
  const now = nowIso();
  artifact.stages[stage] = {
    ...current,
    status,
    attempts: status === "running" ? current.attempts + 1 : current.attempts,
    startedAt: status === "running" ? now : current.startedAt,
    finishedAt: ["success", "failed", "skipped", "blocked"].includes(status) ? now : void 0,
    error: error || void 0
  };
  artifact.updatedAt = now;
}

// src/application/artifact-factory.ts
init_utils();
function createArtifactForMessage(messageIndex) {
  const message = getMessage(messageIndex);
  if (!message || message.is_user) throw new Error("\u76EE\u6807\u4E0D\u662F\u6709\u6548AI\u6B63\u6587");
  return createArtifact({
    chatKey: currentChatKey(),
    stableMessageId: messageStableIdentity(messageIndex),
    messageKey: messageIdentity(messageIndex),
    messageIndex,
    sourceFingerprint: messageFingerprint(messageIndex),
    playerText: previousUserText(messageIndex),
    assistantText: safeText(message.mes)
  });
}

// src/pipeline/audit.ts
init_utils();

// src/llm/generator.ts
init_utils();

// src/llm/plain-protocol.ts
init_utils();
var PlainProtocolError = class extends Error {
  preview;
  constructor(message, raw) {
    super(message);
    this.name = "PlainProtocolError";
    this.preview = protocolPreview(raw);
  }
};
function protocolPreview(raw, max = 420) {
  return safeText(raw, 12e4).replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<analysis>[\s\S]*?<\/analysis>/gi, "").replace(/\s+/g, " ").trim().slice(0, max);
}
function cleanProtocolText(raw) {
  let text = safeText(raw, 24e4).replace(/^\uFEFF/, "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<analysis>[\s\S]*?<\/analysis>/gi, "").replace(/<!--[\s\S]*?-->/g, "").trim();
  const fence = text.match(/^```(?:xml|text|plaintext)?\s*([\s\S]*?)```$/i);
  if (fence?.[1]) text = fence[1].trim();
  return text;
}
function looksLikeHtmlDocument(raw) {
  const text = cleanProtocolText(raw).slice(0, 1200).toLowerCase();
  return /^\s*<!doctype\s+html/.test(text) || /^\s*<html(?:\s|>)/.test(text) || /^\s*<(?:head|body)(?:\s|>)/.test(text) && /<\/(?:head|body)>/.test(text);
}
function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function blocks(raw, tag) {
  const text = cleanProtocolText(raw);
  const name = escaped(tag);
  const regex = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "gi");
  const output = [];
  let match;
  while (match = regex.exec(text)) {
    if (match[1]?.trim()) output.push(match[1].trim());
  }
  return output;
}
function firstBlock(raw, tag) {
  return blocks(raw, tag)[0] ?? "";
}
function field(raw, ...names) {
  const text = cleanProtocolText(raw);
  for (const name of names) {
    const escapedName = escaped(name);
    const tagMatch = text.match(new RegExp(`<${escapedName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedName}>`, "i"));
    if (tagMatch?.[1] !== void 0) return tagMatch[1].trim();
    const lineMatch = text.match(new RegExp(`(?:^|\\n)\\s*${escapedName}\\s*[:\uFF1A]\\s*(.+?)(?=\\n|$)`, "i"));
    if (lineMatch?.[1] !== void 0) return lineMatch[1].trim();
  }
  return "";
}
function listField(raw, ...names) {
  const value = field(raw, ...names);
  if (!value) return [];
  return [...new Set(value.split(/(?:\r?\n|[|｜,，;；])/).map((item2) => item2.replace(/^[-*•]\s*/, "").trim()).filter((item2) => item2 && item2 !== "\u65E0" && item2 !== "\uFF08\u65E0\uFF09"))];
}
function numberListField(raw, ...names) {
  return [...new Set(listField(raw, ...names).flatMap((item2) => item2.split(/\s+/)).map((item2) => Number(item2)).filter((item2) => Number.isInteger(item2)))];
}
function booleanField(raw, names, fallback = false) {
  const value = field(raw, ...names).toLowerCase();
  if (!value) return fallback;
  if (["true", "yes", "1", "\u662F", "\u5141\u8BB8", "\u542F\u7528"].includes(value)) return true;
  if (["false", "no", "0", "\u5426", "\u4E0D\u5141\u8BB8", "\u7981\u7528"].includes(value)) return false;
  return fallback;
}
function requireProtocol(raw, expectedTags, label) {
  const text = cleanProtocolText(raw);
  if (!text) throw new PlainProtocolError(`${label}\u6A21\u578B\u8FD4\u56DE\u4E3A\u7A7A`, raw);
  if (looksLikeHtmlDocument(text)) {
    throw new PlainProtocolError(`${label}\u4E0A\u6E38\u8FD4\u56DE\u4E86HTML\u9519\u8BEF\u9875\uFF0C\u800C\u4E0D\u662F\u6A21\u578B\u6587\u672C`, raw);
  }
  if (!expectedTags.some((tag) => blocks(text, tag).length || new RegExp(`<${escaped(tag)}(?:\\s|>)`, "i").test(text))) {
    throw new PlainProtocolError(`${label}\u672A\u8FD4\u56DE\u53EF\u8BC6\u522B\u7684\u7EAF\u6587\u672C\u6807\u7B7E\u534F\u8BAE`, raw);
  }
  return text;
}

// src/llm/generator.ts
init_chat_scope();

// src/foundation/generation-guard.ts
var internalGenerationDepth = 0;
function isInternalGeneration() {
  return internalGenerationDepth > 0;
}
async function withInternalGeneration(work) {
  internalGenerationDepth += 1;
  try {
    return await work();
  } finally {
    internalGenerationDepth = Math.max(0, internalGenerationDepth - 1);
  }
}

// src/llm/generator.ts
init_task_errors();
var NativeGenerationError = class extends Error {
  constructor(message, kind, status, responsePreview, options) {
    super(message, options);
    this.kind = kind;
    this.status = status;
    this.responsePreview = responsePreview;
    this.suppressCauseDetails = Boolean(options?.suppressCauseDetails);
    this.name = "NativeGenerationError";
  }
  kind;
  status;
  responsePreview;
  suppressCauseDetails;
};
function nestedGenerationErrorText(error) {
  const chunks = [];
  const seen = /* @__PURE__ */ new Set();
  let current = error;
  for (let depth = 0; depth < 5 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current instanceof Error && current.message) chunks.push(current.message);
    else if (typeof current === "string") chunks.push(current);
    for (const value of [current?.responsePreview, current?.responseText, current?.response?.data, current?.body, current?.data]) {
      if (typeof value === "string" && value.trim()) chunks.push(value);
    }
    current = current?.cause;
  }
  return chunks.join("\n").slice(0, 6e3);
}
function generationErrorStatus(error, text) {
  const direct = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  if (Number.isFinite(direct) && direct >= 100 && direct <= 599) return direct;
  const source = safeText(text, 6e3);
  const match = source.match(/(?:HTTP(?:\s+status)?|status(?:Code)?|code)\D{0,8}([1-5]\d{2})/i)
    ?? source.match(/\b([1-5]\d{2})\s+(?:bad gateway|not found|forbidden|unauthorized|service unavailable|gateway timeout|too many requests)/i);
  return match ? Number(match[1]) : void 0;
}
function htmlPageLabel(text) {
  const source = safeText(text, 6e3);
  const match = source.match(/<(?:title|h1)[^>]*>([\s\S]{1,240}?)<\/(?:title|h1)>/i);
  if (!match?.[1]) return "";
  return match[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim().slice(0, 160);
}
function generationConnectionLabel(context = {}) {
  if (context.mode === "profile") {
    const name = safeText(context.profileName, 120).trim() || "未命名配置";
    const api = safeText(context.api, 80).trim();
    const model = safeText(context.model, 160).trim();
    const detail = [api, model].filter(Boolean).join(" / ");
    return `Connection Profile「${name}」${detail ? `（${detail}）` : ""}`;
  }
  return "当前聊天连接";
}
function htmlFailureHint(status, text) {
  if (status === 401 || status === 403) return "鉴权、登录会话或代理访问权限失效";
  if (status === 404) return "API Base URL 或接口路径指向了网页/不存在的端点";
  if (status === 429) return "上游限流页替代了标准 API 响应";
  if (status === 502 || status === 503 || status === 504) return "反向代理或模型上游暂时不可用";
  if (/cloudflare|nginx|gateway|bad gateway|service unavailable/i.test(text)) return "网关或反向代理没有连通模型服务";
  if (/login|sign[ -]?in|unauthorized|forbidden/i.test(text)) return "请求被重定向到登录页或鉴权页";
  return "API 类型、Base URL、反向代理路径、鉴权或上游服务状态异常";
}
function normalizeNativeGenerationError(error, task, connectionContext = {}) {
  if (error instanceof NativeGenerationError) {
    const nativeEvidence = `${error.message}\n${error.responsePreview ?? ""}`;
    if (!/unexpected token ['"]?<['"]?|not valid json|<!doctype\s+html|<html(?:\s|>)/i.test(nativeEvidence)) return error;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new NativeGenerationError(`${task}模型调用已取消`, "cancelled", void 0, void 0, { cause: error });
  }
  const evidence = nestedGenerationErrorText(error);
  const status = generationErrorStatus(error, evidence);
  const message = toErrorMessage(error);
  const htmlFailure = /unexpected token ['"]?<['"]?|not valid json|<!doctype\s+html|<html(?:\s|>)/i.test(evidence || message);
  if (htmlFailure) {
    const connection = generationConnectionLabel(connectionContext);
    const hint = htmlFailureHint(status, evidence);
    const page = htmlPageLabel(evidence);
    const statusText = status ? `HTTP ${status}；` : "";
    const pageText = page ? `页面：${page}；` : "";
    return new NativeGenerationError(
      `${task} 使用的${connection}返回了 HTML 页面，而不是模型 API 的 JSON 响应。${statusText}${pageText}${hint}。这不是事实提取协议或事件 JSON 的格式错误，请先在连接设置中修正并重新测试`,
      "upstream_html",
      status,
      [status ? `HTTP ${status}` : "", page ? `页面：${page}` : ""].filter(Boolean).join("；") || void 0,
      { cause: error instanceof Error ? error : void 0, suppressCauseDetails: true }
    );
  }
  const preview = protocolPreview(evidence, 500).trim();
  return new NativeGenerationError(
    message || `${task}模型调用失败`,
    "upstream",
    status,
    preview || void 0,
    { cause: error instanceof Error ? error : void 0 }
  );
}
function generationText(result) {
  if (typeof result === "string") return result.trim();
  for (const key of ["content", "text", "output", "result", "value", "pipe"]) {
    if (typeof result?.[key] === "string") return result[key].trim();
  }
  if (typeof result?.message?.content === "string") return result.message.content.trim();
  if (typeof result?.choices?.[0]?.message?.content === "string") return result.choices[0].message.content.trim();
  if (typeof result?.choices?.[0]?.text === "string") return result.choices[0].text.trim();
  return safeText(result, 2e5).trim();
}
function cleanProfileName(value) {
  return safeText(value, 160).replace(/["|\r\n]/g, "").trim();
}
function connectionManagerStore() {
  const context = getContext();
  const store = context.extensionSettings?.connectionManager;
  if (!store || !Array.isArray(store.profiles)) return null;
  return store;
}
function supportedProfiles() {
  const context = getContext();
  try {
    const service = context.ConnectionManagerRequestService;
    if (typeof service?.getSupportedProfiles === "function") return service.getSupportedProfiles();
  } catch {
  }
  return connectionManagerStore()?.profiles ?? [];
}
function resolveProfileId(connection) {
  const profiles = supportedProfiles();
  if (connection.profileId && profiles.some((profile) => profile?.id === connection.profileId)) return connection.profileId;
  const legacyName = cleanProfileName(connection.profile);
  const match = profiles.find((profile) => cleanProfileName(profile?.name) === legacyName);
  if (match?.id) {
    connection.profileId = String(match.id);
    return String(match.id);
  }
  return "";
}
function messagesFromOptions(options) {
  const messages = [];
  if (options.systemPrompt.trim()) messages.push({ role: "system", content: options.systemPrompt });
  if (Array.isArray(options.prompt)) {
    for (const item2 of options.prompt) {
      const role = safeText(item2?.role, 30).trim() || "user";
      const content = safeText(item2?.content, 2e5);
      if (content.trim()) messages.push({ role, content });
    }
  } else {
    messages.push({ role: "user", content: options.prompt });
  }
  return messages;
}
function assertInvocationScope(chatKey, revision, signal) {
  if (signal?.aborted) throw new TaskCancelledError("\u9152\u9986\u751F\u6210\u8BF7\u6C42\u5DF2\u53D6\u6D88");
  const current = chatScopeManager.current();
  if (current.chatKey !== chatKey || current.revision !== revision) {
    throw new StaleTaskError("\u9152\u9986\u751F\u6210\u8BF7\u6C42\u6240\u5C5E\u804A\u5929\u5DF2\u6539\u53D8");
  }
}
async function generateCurrent(options, signal) {
  const context = getContext();
  if (typeof context.generateRaw !== "function") {
    throw new NativeGenerationError("\u5F53\u524DSillyTavern\u672A\u63D0\u4F9B generateRaw", "configuration");
  }
  try {
    const result = await withInternalGeneration(() => Promise.resolve(context.generateRaw({
      systemPrompt: options.systemPrompt,
      prompt: options.prompt,
      signal
    })));
    const text = generationText(result);
    if (!text) throw new NativeGenerationError(`${options.task}\u6A21\u578B\u8FD4\u56DE\u4E3A\u7A7A`, "empty_response");
    if (looksLikeHtmlDocument(text)) {
      throw new NativeGenerationError(`${options.task}\u4E0A\u6E38\u8FD4\u56DE\u4E86HTML\u9519\u8BEF\u9875`, "upstream", void 0, protocolPreview(text));
    }
    return text;
  } catch (error) {
    if (signal.aborted) throw new NativeGenerationError(`${options.task}\u6A21\u578B\u8C03\u7528\u5DF2\u53D6\u6D88`, "cancelled", void 0, void 0, { cause: error instanceof Error ? error : void 0 });
    throw normalizeNativeGenerationError(error, options.task, { mode: "current" });
  }
}
async function generateWithNativeProfile(options, profileId, signal, profileSnapshot = {}) {
  const context = getContext();
  const service = context.ConnectionManagerRequestService;
  const liveProfile = listSupportedConnectionProfiles().find((item2) => item2.id === profileId);
  const profileDescriptor = {
    name: safeText(profileSnapshot.profileName ?? liveProfile?.name, 120),
    api: safeText(profileSnapshot.profileApi ?? liveProfile?.api, 80),
    model: safeText(profileSnapshot.profileModel ?? liveProfile?.model, 240)
  };
  if (typeof service?.sendRequest !== "function") {
    throw new NativeGenerationError("\u5F53\u524DSillyTavern\u672A\u63D0\u4F9B ConnectionManagerRequestService", "configuration");
  }
  try {
    const result = await withInternalGeneration(() => Promise.resolve(service.sendRequest(
      profileId,
      messagesFromOptions(options),
      void 0,
      {
        stream: false,
        extractData: true,
        includePreset: false,
        includeInstruct: false,
        signal
      },
      { stream: false }
    )));
    const text = generationText(result);
    if (!text) throw new NativeGenerationError(`${options.task} Connection Profile\u8FD4\u56DE\u4E3A\u7A7A`, "empty_response");
    if (looksLikeHtmlDocument(text)) {
      throw new NativeGenerationError(`${options.task} Connection Profile\u8FD4\u56DE\u4E86HTML\u9519\u8BEF\u9875`, "upstream", void 0, protocolPreview(text));
    }
    return text;
  } catch (error) {
    if (signal.aborted) throw new NativeGenerationError(`${options.task} Connection Profile\u8BF7\u6C42\u5DF2\u53D6\u6D88`, "cancelled", void 0, void 0, { cause: error instanceof Error ? error : void 0 });
    throw normalizeNativeGenerationError(error, options.task, {
      mode: "profile",
      profileName: profileDescriptor?.name,
      api: profileDescriptor?.api,
      model: profileDescriptor?.model
    });
  }
}
function listSupportedConnectionProfiles() {
  return supportedProfiles().map((profile) => ({
    id: safeText(profile?.id, 160),
    name: cleanProfileName(profile?.name) || "\u672A\u547D\u540D\u914D\u7F6E",
    api: safeText(profile?.api, 80),
    model: safeText(profile?.model, 240)
  })).filter((profile) => profile.id);
}
function effectiveConnectionTask(task) {
  if (task === "revision") return "audit";
  if (task === "state" || task === "smallSummary" || task === "largeSummary") return "factExtraction";
  return task;
}
function describeTaskConnection(task) {
  const connection = getSettings().connections[effectiveConnectionTask(task)];
  if (connection?.mode === "profile") {
    const id = resolveProfileId(connection);
    const profile = listSupportedConnectionProfiles().find((item2) => item2.id === id);
    return `Connection Profile\uFF1A${profile?.name || cleanProfileName(connection.profile) || "\u672A\u9009\u62E9"}`;
  }
  return "\u5F53\u524D\u804A\u5929\u8FDE\u63A5";
}
function captureTaskConnection(task) {
  const settings = getSettings();
  const effectiveTask = effectiveConnectionTask(task);
  const connection = settings.connections[effectiveTask] ?? settings.connections.factExtraction ?? settings.connections.state;
  const timeoutMs = 0;
  if (connection?.mode === "profile") {
    const profileId = resolveProfileId(connection);
    if (!profileId) throw new NativeGenerationError(`${task}\u672A\u9009\u62E9\u6709\u6548\u7684 Connection Profile`, "configuration");
    const profile = listSupportedConnectionProfiles().find((item2) => item2.id === profileId);
    return {
      mode: "profile",
      credentialKey: `native-profile:${profileId}`,
      profileId,
      profileName: profile?.name || cleanProfileName(connection.profile),
      profileApi: profile?.api || "",
      profileModel: profile?.model || "",
      timeoutMs,
      capturedAt: nowIso()
    };
  }
  return {
    mode: "current",
    credentialKey: "native-current",
    profileId: "",
    profileName: "\u5F53\u524D\u804A\u5929\u8FDE\u63A5",
    timeoutMs,
    capturedAt: nowIso()
  };
}
function defaultPriority(task) {
  if (task === "audit" || task === "revision") return "foreground";
  if (task === "factExtraction" || task === "state") return "background-critical";
  return "background-derived";
}
function createInvocationSpec(options) {
  const scope = chatScopeManager.current();
  const connection = options.connectionSnapshot ?? captureTaskConnection(options.task);
  return {
    schemaVersion: 1,
    id: `${makeId("inv")}:${scope.chatKey}:${options.task}`,
    taskType: options.task,
    chatKey: scope.chatKey,
    scopeRevision: scope.revision,
    sourceRange: options.invocation?.sourceRange ?? { startIndex: -1, endIndex: -1, messageKeys: [] },
    priority: options.invocation?.priority ?? defaultPriority(options.task),
    blocking: options.invocation?.blocking ?? (options.task === "audit" || options.task === "revision"),
    coalesceKey: options.invocation?.coalesceKey,
    connection,
    retryPolicy: { maxAttempts: 1, retryableKinds: [] },
    outputSchema: options.invocation?.outputSchema ?? "",
    createdAt: nowIso()
  };
}
async function generateTask(options) {
  const spec = createInvocationSpec(options);
  assertInvocationScope(spec.chatKey, spec.scopeRevision, options.signal);
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", forwardAbort, { once: true });
  if (options.signal?.aborted) controller.abort(options.signal.reason);
  try {
    const result = spec.connection.mode === "profile" ? await generateWithNativeProfile(options, spec.connection.profileId, controller.signal, spec.connection) : await generateCurrent(options, controller.signal);
    assertInvocationScope(spec.chatKey, spec.scopeRevision, options.signal);
    return result;
  } finally {
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}
async function testConnection(task) {
  const started = performance.now();
  let raw = "";
  try {
    raw = await generateTask({
      task,
      systemPrompt: "\u4F60\u662F\u8FDE\u63A5\u6D4B\u8BD5\u5668\u3002\u7981\u6B62\u89E3\u91CA\u3001\u7981\u6B62Markdown\u3001\u7981\u6B62\u601D\u8003\u6807\u7B7E\u3002",
      prompt: "\u53EA\u8F93\u51FA\uFF1AMA_CONNECTION_OK"
    });
  } catch (error) {
    if (error instanceof NativeGenerationError) {
      throw new Error(`${describeTaskConnection(task)}\u8FDE\u63A5\u5931\u8D25 [${error.kind}]\uFF1A${error.message}${error.responsePreview ? `\uFF1B\u4E0A\u6E38\u7247\u6BB5\uFF1A${error.responsePreview}` : ""}`);
    }
    throw new Error(`${describeTaskConnection(task)}\u8FDE\u63A5\u5931\u8D25\uFF1A${toErrorMessage(error)}`);
  }
  const normalized = raw.trim().replace(/^```(?:text)?\s*/i, "").replace(/```$/i, "").trim();
  const protocolValid = normalized === "MA_CONNECTION_OK";
  return {
    connected: Boolean(raw.trim()),
    instructionFollowed: protocolValid,
    protocolValid,
    method: describeTaskConnection(task),
    elapsedMs: Math.round(performance.now() - started),
    responsePreview: raw.replace(/\s+/g, " ").slice(0, 240)
  };
}

// src/prompts/audit.ts
function auditSystemPrompt() {
  return `\u4F60\u662F\u6587\u672C\u89C4\u5219\u6267\u884C\u5668\u3002\u4F60\u53EA\u6267\u884C\u73A9\u5BB6\u63D0\u4F9B\u7684\u89C4\u5219\uFF0C\u4E0D\u81EA\u884C\u589E\u52A0\u5BA1\u6838\u6807\u51C6\uFF0C\u4E0D\u505A\u4E0E\u89C4\u5219\u65E0\u5173\u7684\u6DA6\u8272\u3001\u6269\u5199\u6216\u5267\u60C5\u4F18\u5316\u3002

\u4F60\u5FC5\u987B\u4ECE\u4EE5\u4E0B\u4E09\u79CD\u534F\u8BAE\u4E2D\u9009\u62E9\u4E00\u79CD\u8F93\u51FA\uFF1A

1. \u6B63\u6587\u6CA1\u6709\u660E\u786E\u8FDD\u53CD\u73A9\u5BB6\u89C4\u5219\uFF1A
MA_OK

2. \u6B63\u6587\u660E\u786E\u8FDD\u53CD\u73A9\u5BB6\u89C4\u5219\uFF0C\u4E14\u53EF\u4EE5\u6309\u73A9\u5BB6\u89C4\u5219\u4FEE\u6B63\uFF1A
MA_REVISE
\u968F\u540E\u76F4\u63A5\u8F93\u51FA\u4FEE\u6B63\u540E\u7684\u5B8C\u6574\u6B63\u6587\u3002

3. \u6B63\u6587\u660E\u786E\u8FDD\u53CD\u73A9\u5BB6\u89C4\u5219\uFF0C\u4F46\u65E0\u6CD5\u751F\u6210\u7B26\u5408\u89C4\u5219\u7684\u5B8C\u6574\u4FEE\u6B63\u7248\uFF1A
MA_BLOCK
\u968F\u540E\u7528\u4E00\u53E5\u8BDD\u8BF4\u660E\u539F\u56E0\u3002

\u6267\u884C\u8981\u6C42\uFF1A
- \u53EA\u6709\u5B58\u5728\u660E\u786E\u8FDD\u89C4\u65F6\u624D\u5141\u8BB8\u4FEE\u6539\u6B63\u6587\u3002
- \u4FEE\u6B63\u53EA\u4E3A\u6D88\u9664\u73A9\u5BB6\u89C4\u5219\u6307\u51FA\u7684\u8FDD\u89C4\uFF0C\u4E0D\u6DFB\u52A0\u7528\u6237\u672A\u8981\u6C42\u7684\u76EE\u6807\u3002
- \u82E5\u73A9\u5BB6\u63D0\u4F9B\u9644\u52A0\u4FEE\u6B63\u8981\u6C42\uFF0C\u4FEE\u6B63\u7248\u540C\u65F6\u9075\u5B88\u8BE5\u8981\u6C42\u3002
- MA_REVISE \u540E\u5FC5\u987B\u662F\u53EF\u76F4\u63A5\u66FF\u6362\u539F\u6B63\u6587\u7684\u5B8C\u6574\u6587\u672C\uFF0C\u4E0D\u5F97\u9644\u52A0\u6807\u9898\u3001\u8BF4\u660E\u3001\u5BF9\u6BD4\u3001\u5BA1\u6838\u62A5\u544A\u6216 Markdown \u4EE3\u7801\u5757\u3002
- \u4E0D\u5F97\u8F93\u51FA JSON\uFF0C\u4E0D\u5F97\u8F93\u51FA\u534F\u8BAE\u4E4B\u5916\u7684\u524D\u8A00\u6216\u7ED3\u8BED\u3002`;
}
function auditUserPrompt(rulePrompt, revisionPrompt, playerText, assistantText) {
  return `\u3010\u73A9\u5BB6\u89C4\u5219\u3011
${rulePrompt}

${revisionPrompt.trim() ? `\u3010\u73A9\u5BB6\u9644\u52A0\u4FEE\u6B63\u8981\u6C42\u3011
${revisionPrompt.trim()}

` : ""}\u3010\u73A9\u5BB6\u672C\u8F6E\u8F93\u5165\u3011
${playerText || "\uFF08\u7A7A\uFF09"}

\u3010\u5F85\u5904\u7406AI\u6B63\u6587\u3011
${assistantText}`;
}

// src/pipeline/audit.ts
init_repository();

// src/core/message-update.ts
var scriptModulePromise = null;
async function scriptModule() {
  if (typeof process !== "undefined" && Boolean(process.versions?.node)) return null;
  if (!scriptModulePromise) {
    scriptModulePromise = import(
      /* @vite-ignore */
      String("/script.js")
    ).catch((error) => {
      console.warn("[MirrorAbyss] message adapter unavailable", error);
      return null;
    });
  }
  return scriptModulePromise;
}
function updateActiveSwipe(message, text) {
  if (!Array.isArray(message?.swipes)) return;
  const id = Number(message.swipe_id);
  if (Number.isInteger(id) && id >= 0 && id < message.swipes.length) message.swipes[id] = text;
}
async function refreshMessageDisplay(index) {
  const message = getMessage(index);
  if (!message) return;
  const module = await scriptModule();
  try {
    if (typeof module?.updateMessageBlock === "function") {
      module.updateMessageBlock(index, message);
      return;
    }
    if (typeof module?.redisplayChat === "function") {
      await module.redisplayChat({ startIndex: index, fade: false });
    }
  } catch (error) {
    console.warn("[MirrorAbyss] message display refresh failed", error);
  }
}
async function replaceMessageInPlace(artifact, text) {
  if (currentChatKey() !== artifact.chatKey) throw new Error("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u53D6\u6D88\u63D0\u4EA4\u65E7\u4FEE\u6B63\u7248");
  const message = getMessage(artifact.messageIndex);
  if (!message || message.is_user) throw new Error("\u539FAI\u6D88\u606F\u5DF2\u4E0D\u5B58\u5728");
  if (messageFingerprint(artifact.messageIndex) !== artifact.sourceFingerprint) {
    throw new Error("\u539F\u6B63\u6587\u5DF2\u53D1\u751F\u53D8\u5316\uFF0C\u53D6\u6D88\u63D0\u4EA4\u65E7\u4FEE\u6B63\u7248");
  }
  const finalText = String(text || "").trim();
  if (!finalText) throw new Error("\u4FEE\u6B63\u6587\u6A21\u578B\u8FD4\u56DE\u7A7A\u6B63\u6587");
  message.mes = finalText;
  updateActiveSwipe(message, finalText);
  artifact.assistantText = finalText;
  artifact.sourceFingerprint = messageFingerprint(artifact.messageIndex);
  artifact.approvedFingerprint = artifact.sourceFingerprint;
  artifact.hiddenByAudit = false;
  artifact.quarantined = false;
  attachArtifactToMessage(message, artifact);
  await persistChat();
  await refreshMessageDisplay(artifact.messageIndex);
  return artifact.sourceFingerprint;
}
async function deleteLatestMessageSafely(artifact) {
  if (currentChatKey() !== artifact.chatKey) return false;
  const chat = getChat();
  if (artifact.messageIndex !== chat.length - 1) return false;
  if (messageFingerprint(artifact.messageIndex) !== artifact.sourceFingerprint) return false;
  const before = chat.length;
  const module = await scriptModule();
  try {
    if (typeof module?.deleteLastMessage === "function") {
      await module.deleteLastMessage();
      await persistChat();
      return getChat().length < before;
    }
  } catch (error) {
    console.warn("[MirrorAbyss] deleteLastMessage failed", error);
  }
  try {
    const slashModule = await import(
      /* @vite-ignore */
      String("/scripts/slash-commands.js")
    );
    if (typeof slashModule?.executeSlashCommands !== "function") return false;
    await slashModule.executeSlashCommands("/del 1");
    return getChat().length < before;
  } catch (error) {
    console.warn("[MirrorAbyss] slash delete unavailable", error);
    return false;
  }
}

// src/pipeline/audit.ts
function list(value, maxItems = 24) {
  if (!Array.isArray(value)) return [];
  return value.map((item2) => safeText(item2, 2e3).trim()).filter(Boolean).slice(0, maxItems);
}
function violationList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item2, index) => ({
    ruleId: safeText(item2?.ruleId || `rule_${index + 1}`, 120).trim() || `rule_${index + 1}`,
    rule: safeText(item2?.rule, 1e3).trim(),
    evidence: safeText(item2?.evidence, 3e3).trim(),
    action: safeText(item2?.action, 3e3).trim()
  })).filter((item2) => item2.rule || item2.evidence || item2.action).slice(0, 24);
}
function resultFingerprint(violations) {
  const normalized = violations.map((item2) => `${item2.ruleId}|${item2.rule}`.toLowerCase().replace(/\s+/g, " ").trim()).sort().join("\n");
  return normalized ? hashText(normalized) : "";
}
function parseAuditResult(raw) {
  const text = safeText(raw, 2e5).trim();
  const lines = text.replace(/\r/g, "").split("\n");
  const first = (lines[0] || "").trim().toUpperCase();
  const remainder = lines.slice(1).join("\n").trim();
  if (first === "MA_OK") {
    return {
      passed: true,
      decision: "pass",
      reason: remainder || "\u901A\u8FC7",
      violations: [],
      preserve: [],
      rewriteInstruction: "",
      violationFingerprint: ""
    };
  }
  if (first === "MA_REVISE") {
    if (!remainder) throw new Error("MA_REVISE \u540E\u7F3A\u5C11\u5B8C\u6574\u4FEE\u6B63\u7248\u6B63\u6587");
    const violations = [{
      ruleId: "player_rule_violation",
      rule: "\u73A9\u5BB6\u63D0\u4F9B\u7684\u89C4\u5219",
      evidence: "\u89C4\u5219\u6267\u884C\u6A21\u578B\u5224\u5B9A\u539F\u6B63\u6587\u5B58\u5728\u660E\u786E\u8FDD\u89C4",
      action: "\u91C7\u7528\u540C\u4E00\u6B21\u8C03\u7528\u8FD4\u56DE\u7684\u5B8C\u6574\u4FEE\u6B63\u7248\u6B63\u6587"
    }];
    return {
      passed: false,
      decision: "revise",
      reason: "\u539F\u6B63\u6587\u8FDD\u53CD\u73A9\u5BB6\u89C4\u5219\uFF0C\u5DF2\u8FD4\u56DE\u5B8C\u6574\u4FEE\u6B63\u7248",
      violations,
      preserve: [],
      rewriteInstruction: "",
      violationFingerprint: resultFingerprint(violations),
      replacementText: remainder
    };
  }
  if (first === "MA_BLOCK") {
    const violations = [{
      ruleId: "player_rule_block",
      rule: "\u73A9\u5BB6\u63D0\u4F9B\u7684\u89C4\u5219",
      evidence: remainder || "\u65E0\u6CD5\u751F\u6210\u7B26\u5408\u89C4\u5219\u7684\u5B8C\u6574\u4FEE\u6B63\u7248",
      action: "\u963B\u65AD\u6B63\u6587\u5E76\u6309\u73A9\u5BB6\u8BBE\u7F6E\u5904\u7406"
    }];
    return {
      passed: false,
      decision: "block",
      reason: remainder || "\u65E0\u6CD5\u751F\u6210\u7B26\u5408\u89C4\u5219\u7684\u5B8C\u6574\u4FEE\u6B63\u7248",
      violations,
      preserve: [],
      rewriteInstruction: "",
      violationFingerprint: resultFingerprint(violations)
    };
  }
  try {
    const data = parseJsonObject(text);
    const decision = ["pass", "revise", "block"].includes(String(data.result)) ? String(data.result) : "revise";
    const violations = violationList(data.violations);
    const passed = decision === "pass";
    const replacementText = safeText(data.finalText ?? data.replacementText, 2e5).trim();
    return {
      passed,
      decision,
      reason: safeText(data.reason, 3e3).trim() || (passed ? "\u901A\u8FC7" : "\u8FDD\u53CD\u89C4\u5219"),
      violations: passed ? [] : violations,
      preserve: list(data.preserve),
      rewriteInstruction: safeText(data.rewriteInstruction, 6e3).trim(),
      violationFingerprint: passed ? "" : resultFingerprint(violations),
      replacementText: decision === "revise" && replacementText ? replacementText : void 0
    };
  } catch {
    if (first === "MA_FAIL") {
      const violations = [{
        ruleId: "legacy_failure",
        rule: "\u5BA1\u6838\u6A21\u578B\u5224\u5B9A\u8FDD\u53CD\u73A9\u5BB6\u89C4\u5219",
        evidence: remainder || "\u672A\u7ED9\u51FA\u5177\u4F53\u8BC1\u636E",
        action: remainder || "\u4F9D\u636E\u73A9\u5BB6\u89C4\u5219\u5B9A\u5411\u4FEE\u6B63\u8FDD\u89C4\u5185\u5BB9"
      }];
      return {
        passed: false,
        decision: "revise",
        reason: remainder || "\u8FDD\u53CD\u89C4\u5219",
        violations,
        preserve: [],
        rewriteInstruction: remainder || "\u53EA\u4FEE\u6B63\u8FDD\u89C4\u5185\u5BB9\u3002",
        violationFingerprint: resultFingerprint(violations)
      };
    }
    throw new Error("\u89C4\u5219\u6267\u884C\u6A21\u578B\u672A\u8FD4\u56DE MA_OK\u3001MA_REVISE\u3001MA_BLOCK \u6216\u517C\u5BB9JSON");
  }
}
function findMessageElement(index) {
  return document.querySelector(`.mes[mesid="${index}"], .mes[data-message-id="${index}"], #chat .mes:nth-of-type(${index + 1})`);
}
function applyAuditVisibility(index, hidden) {
  const element = findMessageElement(index);
  element?.classList.toggle("ma11-audit-hidden-message", hidden);
}
function markAdmissionApproved(artifact, mode, detail) {
  artifact.approvedFingerprint = artifact.sourceFingerprint;
  artifact.admission = {
    status: "approved",
    mode,
    detail: detail || "正文已准入记忆链",
    approvedFingerprint: artifact.sourceFingerprint,
    approvedAt: nowIso()
  };
}
function markAdmissionBlocked(artifact, detail) {
  artifact.admission = {
    status: "blocked",
    mode: artifact.admission?.mode || "audit",
    detail: detail || "正文未通过准入",
    approvedFingerprint: "",
    approvedAt: void 0
  };
}
function assertApprovedForMemory(artifact, signal) {
  assertArtifactCurrent(artifact, signal);
  const approved = artifact.admission?.status === "approved" && artifact.admission?.approvedFingerprint === artifact.sourceFingerprint;
  const legacyApproved = artifact.approvedFingerprint === artifact.sourceFingerprint && artifact.audit?.passed === true;
  if (!approved && !legacyApproved) {
    throw new Error("正文尚未通过准入门，禁止进入表格与总结链");
  }
}
async function auditText(playerRules, playerText, assistantText, signal, invocationSnapshot) {
  const settings = invocationSnapshot?.settings ?? getSettings();
  const connectionSnapshot = invocationSnapshot?.connectionSnapshot ?? captureTaskConnection("audit");
  const raw = await generateTask({
    task: "audit",
    systemPrompt: auditSystemPrompt(),
    prompt: auditUserPrompt(playerRules, settings.revisionPrompt, playerText, assistantText),
    signal,
    connectionSnapshot
  });
  try {
    return parseAuditResult(raw);
  } catch (error) {
    throw new Error(`\u89C4\u5219\u6267\u884C\u672A\u8FD4\u56DE\u6709\u6548\u534F\u8BAE\uFF08${describeTaskConnection("audit")}\uFF09\u3002${toErrorMessage(error)}\uFF1B\u8FD4\u56DE\u7247\u6BB5\uFF1A${jsonPreview(raw)}`);
  }
}
async function applyAuditFailureAction(artifact, action) {
  if (action === "mark") {
    artifact.hiddenByAudit = false;
    applyAuditVisibility(artifact.messageIndex, false);
    return;
  }
  if (action === "hide") {
    artifact.hiddenByAudit = true;
    applyAuditVisibility(artifact.messageIndex, true);
    return;
  }
  const deleted = await deleteLatestMessageSafely(artifact);
  if (!deleted) {
    artifact.hiddenByAudit = true;
    applyAuditVisibility(artifact.messageIndex, true);
    toast("warning", "\u5BA1\u6838\u672A\u901A\u8FC7\uFF0C\u4F46\u5B89\u5168\u64A4\u56DE\u6761\u4EF6\u4E0D\u6210\u7ACB\uFF1B\u5DF2\u6539\u4E3A\u9690\u85CF\u5E76\u4FDD\u7559\u8BB0\u5F55");
  }
}
async function runAudit(artifact, force = false, signal, invocationSnapshot) {
  const settings = invocationSnapshot?.settings ?? getSettings();
  artifact.stages.revision ||= { status: "idle", attempts: 0 };
  if (!settings.auditEnabled) {
    markStage(artifact, "audit", "skipped");
    markStage(artifact, "revision", "skipped");
    artifact.audit = {
      passed: true,
      decision: "pass",
      reason: "\u672A\u542F\u7528\u89C4\u5219\u5BA1\u6838",
      violations: [],
      preserve: [],
      rewriteInstruction: "",
      violationFingerprint: ""
    };
    markAdmissionApproved(artifact, "bypass", "审核已关闭；原正文直接准入后续记忆链");
    await putArtifact(artifact);
    return artifact.audit;
  }
  if (!settings.auditPrompt.trim()) throw new Error("\u5DF2\u542F\u7528\u89C4\u5219\u5BA1\u6838\uFF0C\u4F46\u5BA1\u6838\u63D0\u793A\u8BCD\u4E3A\u7A7A");
  if (!force && artifact.stages.audit.status === "success" && artifact.audit?.passed && artifact.approvedFingerprint === artifact.sourceFingerprint) {
    if (artifact.admission?.status !== "approved" || artifact.admission?.approvedFingerprint !== artifact.sourceFingerprint) {
      markAdmissionApproved(artifact, "audit", "复用已通过的正文审核结果");
      await putArtifact(artifact);
    }
    return artifact.audit;
  }
  markStage(artifact, "audit", "running");
  await putArtifact(artifact);
  try {
    const result = await auditText(settings.auditPrompt, artifact.playerText, artifact.assistantText, signal, invocationSnapshot);
    artifact.audit = result;
    if (result.passed) {
      markAdmissionApproved(artifact, "audit", "规则审核通过");
      artifact.hiddenByAudit = false;
      artifact.quarantined = false;
      applyAuditVisibility(artifact.messageIndex, false);
      markStage(artifact, "audit", "success");
      markStage(artifact, "revision", "skipped");
    } else {
      markAdmissionBlocked(artifact, result.reason);
      markStage(artifact, "audit", "blocked", result.reason);
    }
    const message = getMessage(artifact.messageIndex);
    if (message && messageFingerprint(artifact.messageIndex) === artifact.sourceFingerprint) {
      attachArtifactToMessage(message, artifact);
    }
    await putArtifact(artifact);
    return result;
  } catch (error) {
    markAdmissionBlocked(artifact, toErrorMessage(error));
    markStage(artifact, "audit", "failed", toErrorMessage(error));
    await putArtifact(artifact);
    throw error;
  }
}

// src/pipeline/revision.ts
init_utils();

// src/prompts/revision.ts
function revisionSystemPrompt(customPrompt = "") {
  return `\u4F60\u662F\u6587\u672C\u89C4\u5219\u4FEE\u6B63\u5668\u3002\u4F60\u53EA\u4F9D\u636E\u73A9\u5BB6\u63D0\u4F9B\u7684\u89C4\u5219\u548C\u5BA1\u6838\u7ED3\u679C\u4FEE\u6B63\u5DF2\u6709\u6B63\u6587\uFF0C\u4E0D\u81EA\u884C\u589E\u52A0\u5BA1\u6838\u6807\u51C6\uFF0C\u4E0D\u505A\u4E0E\u89C4\u5219\u65E0\u5173\u7684\u6DA6\u8272\u3001\u6269\u5199\u6216\u5267\u60C5\u4F18\u5316\u3002

\u6267\u884C\u8981\u6C42\uFF1A
1. \u4FEE\u6B63\u5BA1\u6838\u660E\u786E\u6307\u51FA\u7684\u8FDD\u89C4\u5185\u5BB9\u3002
2. \u9664\u975E\u73A9\u5BB6\u89C4\u5219\u6216\u9644\u52A0\u8981\u6C42\u660E\u786E\u8981\u6C42\uFF0C\u4E0D\u4E3B\u52A8\u6539\u53D8\u5176\u4ED6\u5185\u5BB9\u3002
3. \u4E0D\u8F93\u51FA\u5BA1\u6838\u8FC7\u7A0B\u3001\u4FEE\u6539\u8BF4\u660E\u3001\u524D\u540E\u5BF9\u6BD4\u3001\u6807\u9898\u6216 Markdown \u4EE3\u7801\u5757\u3002
4. \u53EA\u8F93\u51FA\u53EF\u76F4\u63A5\u66FF\u6362\u539F\u6587\u7684\u5B8C\u6574\u4FEE\u6B63\u7248\u6B63\u6587\u3002
${customPrompt.trim() ? `
\u3010\u73A9\u5BB6\u9644\u52A0\u4FEE\u6B63\u8981\u6C42\u3011
${customPrompt.trim()}` : ""}`;
}
function revisionUserPrompt(playerRules, playerText, sourceText, audit, attempt) {
  const violations = audit.violations.map((item2, index) => `${index + 1}. \u89C4\u5219\uFF1A${item2.rule}
   \u8BC1\u636E\uFF1A${item2.evidence}
   \u4FEE\u6539\uFF1A${item2.action}`).join("\n");
  const preserve = audit.preserve.length ? audit.preserve.map((item2) => `- ${item2}`).join("\n") : "- \u9664\u660E\u786E\u8FDD\u89C4\u90E8\u5206\u5916\u7684\u539F\u6B63\u6587\u5185\u5BB9";
  return `\u3010\u4FEE\u6B63\u8F6E\u6B21\u3011
\u7B2C${attempt}\u6B21

\u3010\u73A9\u5BB6\u89C4\u5219\u3011
${playerRules}

\u3010\u73A9\u5BB6\u672C\u8F6E\u8F93\u5165\u3011
${playerText || "\uFF08\u7A7A\uFF09"}

\u3010\u5FC5\u987B\u4FEE\u6B63\u7684\u95EE\u9898\u3011
${violations || audit.reason}

\u3010\u9700\u8981\u4FDD\u7559\u3011
${preserve}

\u3010\u5BA1\u6838\u7ED3\u679C\u4E2D\u7684\u4FEE\u6B63\u8981\u6C42\u3011
${audit.rewriteInstruction || audit.reason}

\u3010\u5F85\u4FEE\u6B63\u6587\u3011
${sourceText}

\u53EA\u8F93\u51FA\u4FEE\u6B63\u540E\u7684\u5B8C\u6574\u6B63\u6587\u3002`;
}

// src/pipeline/revision.ts
init_repository();

// src/pipeline/quarantine.ts
var LOCK_TOKEN = "mirror-abyss-audit";
var gates = /* @__PURE__ */ new Map();
var lockedElements = [];
function gateKey(chatKey, index, fingerprint3) {
  return `${chatKey}:${index}:${fingerprint3}`;
}
function captureAndLockElement(element) {
  const state2 = {
    element,
    ariaDisabled: element.getAttribute("aria-disabled"),
    ariaBusy: element.getAttribute("aria-busy")
  };
  if (element instanceof HTMLButtonElement) {
    state2.disabled = element.disabled;
    element.disabled = true;
    element.setAttribute("aria-disabled", "true");
  }
  if (element instanceof HTMLTextAreaElement) {
    state2.readOnly = element.readOnly;
    element.readOnly = true;
    element.setAttribute("aria-busy", "true");
  }
  element.dataset.ma11LockOwner = LOCK_TOKEN;
  return state2;
}
function restoreAttribute(element, name, value) {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}
function syncDomLock() {
  const locked = gates.size > 0;
  if (typeof document === "undefined") {
    if (!locked) lockedElements = [];
    return;
  }
  document.documentElement.classList.toggle("ma11-generation-locked", locked);
  if (locked) {
    if (lockedElements.length) return;
    const candidates = [
      document.querySelector("#send_but, #send_button"),
      document.querySelector("#send_textarea")
    ].filter((element) => Boolean(element));
    lockedElements = candidates.map(captureAndLockElement);
    return;
  }
  for (const state2 of lockedElements.splice(0)) {
    const element = state2.element;
    if (element.dataset.ma11LockOwner !== LOCK_TOKEN) continue;
    if (element instanceof HTMLButtonElement && state2.disabled !== void 0) element.disabled = state2.disabled;
    if (element instanceof HTMLTextAreaElement && state2.readOnly !== void 0) element.readOnly = state2.readOnly;
    restoreAttribute(element, "aria-disabled", state2.ariaDisabled);
    restoreAttribute(element, "aria-busy", state2.ariaBusy);
    delete element.dataset.ma11LockOwner;
  }
}
function isQuarantineActive() {
  return gates.size > 0;
}
function primeQuarantine(index) {
  const settings = getSettings();
  if (!settings.enabled || !settings.auditEnabled || settings.auditFailAction === "mark") return null;
  const message = getMessage(index);
  if (!message || message.is_user || !String(message.mes || "").trim()) return null;
  const fingerprint3 = messageFingerprint(index);
  let artifact = getAttachedArtifact(message);
  if (!artifact || artifact.chatKey !== currentChatKey() || artifact.sourceFingerprint !== fingerprint3) {
    artifact = createArtifactForMessage(index);
  }
  artifact.hiddenByAudit = true;
  artifact.quarantined = true;
  markStage(artifact, "audit", "queued");
  if (settings.auditFailAction === "revise") markStage(artifact, "revision", "queued");
  attachArtifactToMessage(message, artifact);
  if (settings.lockGenerationDuringAudit) {
    const record = {
      key: gateKey(artifact.chatKey, index, fingerprint3),
      chatKey: artifact.chatKey,
      messageIndex: index,
      fingerprint: fingerprint3
    };
    gates.set(record.key, record);
    syncDomLock();
  }
  return artifact;
}
function ensureQuarantine(artifact) {
  if (!getSettings().lockGenerationDuringAudit) return;
  const key = gateKey(artifact.chatKey, artifact.messageIndex, artifact.sourceFingerprint);
  gates.set(key, {
    key,
    chatKey: artifact.chatKey,
    messageIndex: artifact.messageIndex,
    fingerprint: artifact.sourceFingerprint
  });
  syncDomLock();
}
function releaseQuarantine(artifact) {
  for (const [key, gate] of gates) {
    if (gate.chatKey === artifact.chatKey && gate.messageIndex === artifact.messageIndex) gates.delete(key);
  }
  artifact.quarantined = false;
  syncDomLock();
}
function clearAllQuarantines() {
  gates.clear();
  syncDomLock();
}
async function generationInterceptor(_chat, _contextSize, abort, _type) {
  if (!isQuarantineActive() || isInternalGeneration()) return;
  abort(true);
  toast("warning", "\u4E0A\u4E00\u6761\u6B63\u6587\u4ECD\u5728\u5BA1\u6838\u6216\u4FEE\u6B63\uFF0C\u5DF2\u963B\u6B62\u65B0\u4E00\u8F6E\u751F\u6210\u4EE5\u907F\u514D\u4E0A\u4E0B\u6587\u6C61\u67D3");
}

// src/pipeline/revision.ts
function cleanRevisionText(raw) {
  let text = safeText(raw, 2e5).trim();
  const fenced = text.match(/^```(?:markdown|text)?\s*([\s\S]*?)```$/i);
  if (fenced) text = fenced[1].trim();
  text = text.replace(/^(?:【?修正版(?:正文)?】?|修正后的完整正文)\s*[:：]?\s*/i, "").trim();
  return text;
}
function initialRevisionRecord(artifact) {
  return artifact.revision ?? {
    status: "idle",
    originalText: artifact.assistantText,
    originalFingerprint: artifact.sourceFingerprint,
    attempts: []
  };
}
async function runRevisionFlow(artifact, signal, invocationSnapshot) {
  const settings = invocationSnapshot?.settings ?? getSettings();
  const firstAudit = artifact.audit;
  if (!firstAudit || firstAudit.passed) throw new Error("\u6CA1\u6709\u53EF\u4FEE\u6B63\u7684\u5BA1\u6838\u5931\u8D25\u7ED3\u679C");
  artifact.revision = initialRevisionRecord(artifact);
  if (firstAudit.decision === "block") {
    artifact.revision.status = "blocked";
    artifact.revision.stoppedReason = firstAudit.reason || "\u89C4\u5219\u6267\u884C\u5224\u5B9A\u65E0\u6CD5\u751F\u6210\u5408\u89C4\u6B63\u6587";
    markStage(artifact, "revision", "blocked", artifact.revision.stoppedReason);
    await putArtifact(artifact);
    return { approved: false, audit: firstAudit };
  }
  if (firstAudit.replacementText) {
    ensureQuarantine(artifact);
    artifact.hiddenByAudit = true;
    artifact.quarantined = true;
    applyAuditVisibility(artifact.messageIndex, true);
    artifact.revision.status = "running";
    markStage(artifact, "revision", "running");
    await putArtifact(artifact);
    try {
      const candidate = cleanRevisionText(firstAudit.replacementText);
      if (!candidate) throw new Error("\u89C4\u5219\u6267\u884C\u6A21\u578B\u8FD4\u56DE\u7A7A\u4FEE\u6B63\u7248");
      if (hashText(candidate) === hashText(artifact.assistantText)) throw new Error("\u89C4\u5219\u6267\u884C\u6A21\u578B\u8FD4\u56DE\u7684\u4FEE\u6B63\u7248\u4E0E\u539F\u6587\u76F8\u540C");
      artifact.revision.attempts.push({
        attempt: 1,
        sourceFingerprint: hashText(artifact.assistantText),
        candidateFingerprint: hashText(candidate),
        audit: firstAudit,
        createdAt: nowIso()
      });
      await replaceMessageInPlace(artifact, candidate);
      const passedAudit = {
        passed: true,
        decision: "pass",
        reason: "\u5DF2\u6309\u73A9\u5BB6\u89C4\u5219\u5B8C\u6210\u5355\u6B21\u6821\u6B63",
        violations: [],
        preserve: [],
        rewriteInstruction: "",
        violationFingerprint: ""
      };
      artifact.audit = passedAudit;
      markAdmissionApproved(artifact, "revision", "审核模型返回的完整修正版已落地");
      artifact.revision.status = "success";
      artifact.revision.finalFingerprint = artifact.sourceFingerprint;
      artifact.revision.committedAt = nowIso();
      artifact.revision.originalText = "";
      artifact.hiddenByAudit = false;
      artifact.quarantined = false;
      markStage(artifact, "audit", "success");
      markStage(artifact, "revision", "success");
      await putArtifact(artifact);
      return { approved: true, audit: passedAudit };
    } catch (error) {
      if (signal?.aborted) throw error;
      artifact.revision.status = "failed";
      artifact.revision.stoppedReason = toErrorMessage(error);
      markStage(artifact, "revision", "failed", artifact.revision.stoppedReason);
      await putArtifact(artifact);
      return { approved: false, audit: firstAudit };
    }
  }
  const revisionConnectionSnapshot = invocationSnapshot?.revisionConnectionSnapshot ?? captureTaskConnection("revision");
  const auditConnectionSnapshot = invocationSnapshot?.auditConnectionSnapshot ?? captureTaskConnection("audit");
  ensureQuarantine(artifact);
  artifact.hiddenByAudit = true;
  artifact.quarantined = true;
  applyAuditVisibility(artifact.messageIndex, true);
  artifact.revision.status = "running";
  markStage(artifact, "revision", "running");
  await putArtifact(artifact);
  let sourceText = artifact.assistantText;
  let currentAudit = firstAudit;
  let previousViolationFingerprint = firstAudit.violationFingerprint;
  const maxAttempts = Math.min(2, Math.max(1, Number(settings.maxRevisionAttempts) || 1));
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const raw = await generateTask({
        task: "revision",
        systemPrompt: revisionSystemPrompt(settings.revisionPrompt),
        prompt: revisionUserPrompt(settings.auditPrompt, artifact.playerText, sourceText, currentAudit, attempt),
        signal,
        connectionSnapshot: revisionConnectionSnapshot
      });
      const candidate = cleanRevisionText(raw);
      if (!candidate) throw new Error("\u4FEE\u6B63\u6587\u6A21\u578B\u8FD4\u56DE\u7A7A\u6B63\u6587");
      if (hashText(candidate) === hashText(sourceText)) throw new Error("\u4FEE\u6B63\u6587\u6A21\u578B\u672A\u6539\u53D8\u6B63\u6587");
      const candidateAudit = await auditText(
        settings.auditPrompt,
        artifact.playerText,
        candidate,
        signal,
        { settings, connectionSnapshot: auditConnectionSnapshot }
      );
      artifact.revision.attempts.push({
        attempt,
        sourceFingerprint: hashText(sourceText),
        candidateFingerprint: hashText(candidate),
        audit: candidateAudit,
        createdAt: nowIso()
      });
      if (candidateAudit.passed) {
        artifact.audit = candidateAudit;
        await replaceMessageInPlace(artifact, candidate);
        markAdmissionApproved(artifact, "revision", "定向修正并复审通过");
        artifact.revision.status = "success";
        artifact.revision.finalFingerprint = artifact.sourceFingerprint;
        artifact.revision.committedAt = nowIso();
        artifact.revision.originalText = "";
        artifact.hiddenByAudit = false;
        artifact.quarantined = false;
        markStage(artifact, "audit", "success");
        markStage(artifact, "revision", "success");
        await putArtifact(artifact);
        return { approved: true, audit: candidateAudit };
      }
      const sameViolation = Boolean(
        settings.stopOnRepeatedViolation && candidateAudit.violationFingerprint && candidateAudit.violationFingerprint === previousViolationFingerprint
      );
      if (candidateAudit.decision === "block" || sameViolation) {
        artifact.audit = candidateAudit;
        artifact.revision.status = "blocked";
        artifact.revision.stoppedReason = candidateAudit.decision === "block" ? candidateAudit.reason : "\u4FEE\u6B63\u540E\u91CD\u590D\u51FA\u73B0\u76F8\u540C\u8FDD\u89C4\uFF0C\u5DF2\u505C\u6B62\u5FAA\u73AF";
        markStage(artifact, "revision", "blocked", artifact.revision.stoppedReason);
        await putArtifact(artifact);
        return { approved: false, audit: candidateAudit };
      }
      sourceText = candidate;
      currentAudit = candidateAudit;
      previousViolationFingerprint = candidateAudit.violationFingerprint;
      artifact.audit = candidateAudit;
      await putArtifact(artifact);
    }
    artifact.revision.status = "failed";
    artifact.revision.stoppedReason = `\u8FBE\u5230\u6700\u5927\u81EA\u52A8\u4FEE\u6B63\u6B21\u6570\uFF08${maxAttempts}\uFF09`;
    markStage(artifact, "revision", "failed", artifact.revision.stoppedReason);
    await putArtifact(artifact);
    return { approved: false, audit: artifact.audit ?? firstAudit };
  } catch (error) {
    if (signal?.aborted) throw error;
    artifact.revision.status = "failed";
    artifact.revision.stoppedReason = toErrorMessage(error);
    markStage(artifact, "revision", "failed", artifact.revision.stoppedReason);
    await putArtifact(artifact);
    return { approved: false, audit: artifact.audit ?? firstAudit };
  }
}

// src/pipeline/lorebook.ts
init_constants();
init_utils();
init_repository();

// src/domain/lorebook-publish.ts
init_constants();

// src/domain/fact-projection.ts
init_utils();

// src/domain/snapshot.ts
init_constants();
init_utils();
var EXISTENCE_STATES = /* @__PURE__ */ new Set([
  "\u5B58\u6D3B",
  "\u6B7B\u4EA1\u5DF2\u786E\u8BA4",
  "\u5B58\u5728\u672A\u77E5",
  "\u5931\u8E2A",
  "\u8EAB\u4EFD\u5B58\u7591",
  "\u865A\u6784\u6216\u8BEF\u8BA4\u5DF2\u786E\u8BA4",
  "\u5B58\u5728\u88AB\u62B9\u9664",
  "\u672A\u6807\u6CE8",
  "\u4E0D\u9002\u7528"
]);
var ACTIVITY_STATES = /* @__PURE__ */ new Set([
  "\u5F53\u524D\u5728\u573A",
  "\u5F53\u524D\u76F8\u5173",
  "\u79BB\u573A\u4F46\u4ECD\u6D3B\u8DC3",
  "\u4F11\u7720",
  "\u957F\u671F\u4F11\u7720",
  "\u5DF2\u5F52\u6863",
  "\u672A\u6807\u6CE8",
  "\u4E0D\u9002\u7528"
]);
var MEMORY_STATES = /* @__PURE__ */ new Set([
  "\u5E7F\u6CDB\u8BB0\u5F97",
  "\u90E8\u5206\u4EBA\u7269\u8BB0\u5F97",
  "\u4EC5\u8BB0\u5F55\u7559\u5B58",
  "\u4EC5\u75D5\u8FF9\u7559\u5B58",
  "\u65E0\u4EBA\u53EF\u786E\u8BA4\u8BB0\u5F97",
  "\u8BB0\u5FC6\u88AB\u7BE1\u6539",
  "\u8BB0\u5FC6\u88AB\u62B9\u9664",
  "\u672A\u6807\u6CE8",
  "\u4E0D\u9002\u7528"
]);
var EVIDENCE_LEVELS = /* @__PURE__ */ new Set(["\u5DF2\u786E\u8BA4", "\u53EF\u9760\u8BB0\u5F55", "\u591A\u65B9\u9648\u8FF0", "\u5355\u65B9\u9648\u8FF0", "\u63A8\u6D4B", "\u672A\u77E5"]);
function emptySnapshot() {
  return Object.fromEntries(TABLE_KEYS.map((key) => [key, []]));
}
function normalizeKeywords(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item2) => safeText(item2, 80).trim()).filter(Boolean))].slice(0, 16);
}
function normalizeStringList(value, limit = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item2) => safeText(item2, 240).trim()).filter(Boolean))].slice(0, limit);
}
function enumValue(value, allowed, fallback) {
  const text = safeText(value, 80).trim();
  return allowed.has(text) ? text : fallback;
}
function defaultLifecycle() {
  return {
    existence: "\u672A\u6807\u6CE8",
    activity: "\u672A\u6807\u6CE8",
    memory: "\u672A\u6807\u6CE8",
    evidenceLevel: "\u672A\u77E5",
    evidence: "",
    returnConditions: [],
    returnBlockers: []
  };
}
function normalizeLifecycle(value, previous) {
  const source = value && typeof value === "object" ? value : {};
  const base = previous ?? defaultLifecycle();
  return {
    existence: enumValue(source.existence ?? base.existence, EXISTENCE_STATES, base.existence),
    activity: enumValue(source.activity ?? base.activity, ACTIVITY_STATES, base.activity),
    memory: enumValue(source.memory ?? base.memory, MEMORY_STATES, base.memory),
    evidenceLevel: enumValue(source.evidenceLevel ?? base.evidenceLevel, EVIDENCE_LEVELS, base.evidenceLevel),
    evidence: safeText(source.evidence ?? base.evidence, 4e3).trim(),
    returnConditions: normalizeStringList(source.returnConditions ?? base.returnConditions),
    returnBlockers: normalizeStringList(source.returnBlockers ?? base.returnBlockers)
  };
}
function normalizeRow(value, tableKey, index, previous) {
  const source = value && typeof value === "object" ? value : {};
  const now = nowIso();
  const id = safeText(source.id || previous?.id || makeId(tableKey), 160).trim() || makeId(tableKey);
  const manual = source.source === "manual" || previous?.source === "manual";
  const supportsLifecycle = tableKey === "characters" || tableKey === "focus";
  const lifecycleInput = source.lifecycle ?? previous?.lifecycle;
  return {
    id,
    title: safeText(source.title || source.name || previous?.title || `${TABLE_LABELS[tableKey]} ${index + 1}`, 240).trim(),
    content: safeText(source.content || source.summary || previous?.content || "", 12e3).trim(),
    keywords: normalizeKeywords(source.keywords ?? previous?.keywords ?? []),
    status: safeText(source.status || previous?.status || "active", 120).trim() || "active",
    source: manual ? "manual" : "auto",
    locked: Boolean(source.locked ?? previous?.locked ?? manual),
    lifecycle: supportsLifecycle && lifecycleInput ? normalizeLifecycle(lifecycleInput, previous?.lifecycle) : void 0,
    sourceEntityId: tableKey === "relationships" ? safeText(source.sourceEntityId || previous?.sourceEntityId, 180).trim() || void 0 : void 0,
    targetEntityId: tableKey === "relationships" ? safeText(source.targetEntityId || previous?.targetEntityId, 180).trim() || void 0 : void 0,
    updatedAt: safeText(source.updatedAt || previous?.updatedAt || now, 80) || now
  };
}
function normalizeSnapshot(value, previousSnapshot2) {
  const source = value && typeof value === "object" ? value : {};
  const output = emptySnapshot();
  for (const key of TABLE_KEYS) {
    const rows2 = Array.isArray(source[key]) ? source[key] : [];
    const previousMap = new Map((previousSnapshot2?.[key] ?? []).map((row) => [row.id, row]));
    const used = /* @__PURE__ */ new Set();
    output[key] = rows2.map((row, index) => {
      const rawId = row && typeof row === "object" ? safeText(row.id, 160) : "";
      const normalized = normalizeRow(row, key, index, rawId ? previousMap.get(rawId) : void 0);
      if (used.has(normalized.id)) normalized.id = makeId(key);
      used.add(normalized.id);
      return normalized;
    });
  }
  return output;
}
function identityTitle(value) {
  return String(value || "").toLowerCase().replace(/[\s·•._—–|｜:：()（）【】[\]]+/g, "");
}
function preserveSnapshotContinuity(previous, next) {
  for (const key of TABLE_KEYS) {
    const byId = new Map(next[key].map((row) => [row.id, row]));
    const byTitle = new Map(next[key].map((row) => [identityTitle(row.title), row]));
    for (const oldRow of previous[key] ?? []) {
      if (byId.has(oldRow.id)) continue;
      const titleKey = identityTitle(oldRow.title);
      const titleMatch = titleKey ? byTitle.get(titleKey) : void 0;
      if (titleMatch) {
        titleMatch.id = oldRow.id;
        titleMatch.source = oldRow.source === "manual" ? "manual" : titleMatch.source;
        titleMatch.locked = Boolean(oldRow.locked || titleMatch.locked);
        if ((oldRow.source === "manual" || oldRow.locked) && titleMatch.content !== oldRow.content) {
          Object.assign(titleMatch, { ...oldRow, id: oldRow.id });
        }
        byId.set(oldRow.id, titleMatch);
        continue;
      }
      const restored = { ...oldRow, lifecycle: oldRow.lifecycle ? { ...oldRow.lifecycle } : void 0 };
      next[key].push(restored);
      byId.set(restored.id, restored);
      if (titleKey) byTitle.set(titleKey, restored);
    }
  }
  return next;
}
function preservePersistentCharacters(previous, next) {
  const byId = new Map((next.characters ?? []).map((row) => [row.id, row]));
  const byTitle = new Map((next.characters ?? []).map((row) => [identityTitle(row.title), row]));
  for (const oldRow of previous.characters ?? []) {
    if (byId.has(oldRow.id)) continue;
    const titleMatch = byTitle.get(identityTitle(oldRow.title));
    if (titleMatch) {
      titleMatch.id = oldRow.id;
      if (oldRow.source === "manual" || oldRow.locked) {
        Object.assign(titleMatch, { ...oldRow, id: oldRow.id });
      } else if (!titleMatch.lifecycle && oldRow.lifecycle) {
        titleMatch.lifecycle = { ...oldRow.lifecycle };
      }
      byId.set(oldRow.id, titleMatch);
      continue;
    }
    const restored = { ...oldRow, lifecycle: oldRow.lifecycle ? { ...oldRow.lifecycle } : void 0 };
    next.characters.push(restored);
    byId.set(restored.id, restored);
    byTitle.set(identityTitle(restored.title), restored);
  }
  const seenTitles = /* @__PURE__ */ new Set();
  next.characters = next.characters.filter((row) => {
    const key = identityTitle(row.title);
    if (!key || !seenTitles.has(key)) {
      if (key) seenTitles.add(key);
      return true;
    }
    return false;
  });
  return next;
}
function snapshotRowCount(snapshot) {
  if (!snapshot) return 0;
  return TABLE_KEYS.reduce((sum, key) => sum + (snapshot[key]?.length ?? 0), 0);
}
function upsertManualRow(snapshot, tableKey, row) {
  const next = normalizeSnapshot(snapshot, snapshot);
  const index = next[tableKey].findIndex((item2) => item2.id === row.id);
  const normalized = normalizeRow({ ...row, source: "manual", locked: row.locked ?? true, updatedAt: nowIso() }, tableKey, index >= 0 ? index : next[tableKey].length, index >= 0 ? next[tableKey][index] : void 0);
  if (index >= 0) next[tableKey][index] = normalized;
  else next[tableKey].push(normalized);
  return next;
}
function deleteRow(snapshot, tableKey, rowId) {
  const next = normalizeSnapshot(snapshot, snapshot);
  next[tableKey] = next[tableKey].filter((row) => row.id !== rowId);
  return next;
}

// src/domain/fact-projection.ts
function normalizeIdentityName(value) {
  return String(value || "").toLowerCase().replace(/[\s·•._—–|｜:：()（）【】[\]“”‘’'"-]+/g, "");
}
function unique(values, limit = 32) {
  return [...new Set(values.map((item2) => String(item2 || "").trim()).filter(Boolean))].slice(0, limit);
}
function findRow(rows2, operation) {
  const byId = rows2.find((row) => row.id === operation.rowId);
  if (byId) return byId;
  const titleKey = normalizeIdentityName(operation.title);
  return titleKey ? rows2.find((row) => normalizeIdentityName(row.title) === titleKey) : void 0;
}
function applyOperation(snapshot, operation) {
  const rows2 = snapshot[operation.table];
  const existing = findRow(rows2, operation);
  if (existing?.source === "manual" || existing?.locked) return;
  const rowId = existing?.id || operation.rowId;
  const source = {
    ...existing ?? {},
    id: rowId,
    title: operation.title || existing?.title || rowId,
    content: operation.content || existing?.content || "",
    keywords: unique([...existing?.keywords ?? [], ...operation.keywords], 16),
    status: operation.operation === "retire" ? operation.status || "\u5F85\u9636\u6BB5\u6C89\u964D" : operation.status || existing?.status || "active",
    lifecycle: operation.lifecycle ?? existing?.lifecycle,
    sourceEntityId: operation.table === "relationships" ? operation.sourceEntityId || existing?.sourceEntityId : void 0,
    targetEntityId: operation.table === "relationships" ? operation.targetEntityId || existing?.targetEntityId : void 0,
    source: "auto",
    locked: false,
    updatedAt: nowIso()
  };
  if (operation.operation === "retire" && source.lifecycle) {
    const activity = source.lifecycle.activity;
    if (activity === "\u5F53\u524D\u5728\u573A" || activity === "\u5F53\u524D\u76F8\u5173") {
      source.lifecycle = { ...source.lifecycle, activity: "\u79BB\u573A\u4F46\u4ECD\u6D3B\u8DC3" };
    }
  }
  const normalized = normalizeRow(source, operation.table, existing ? rows2.indexOf(existing) : rows2.length, existing);
  if (existing) rows2[rows2.indexOf(existing)] = normalized;
  else rows2.push(normalized);
}
function mergeFocusRows(primary, rows2) {
  const protectedRow = rows2.find((row) => row.source === "manual" || row.locked);
  if (protectedRow) return deepClone(protectedRow);
  const latest = rows2.at(-1) ?? primary;
  return {
    ...deepClone(primary),
    title: latest.title || primary.title,
    content: latest.content || primary.content,
    status: latest.status || primary.status,
    keywords: unique(rows2.flatMap((row) => [row.title, ...row.keywords]), 16),
    lifecycle: deepClone(latest.lifecycle ?? primary.lifecycle),
    updatedAt: latest.updatedAt || primary.updatedAt
  };
}
function dedupeExactFocusRows(snapshot) {
  const mergedIdsByIdentity = /* @__PURE__ */ new Map();
  const groups = /* @__PURE__ */ new Map();
  for (const row of snapshot.focus) {
    const key = normalizeIdentityName(row.title) || `id:${row.id}`;
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  const output = [];
  for (const [identity, rows2] of groups.entries()) {
    const primary = rows2.find((row) => row.source === "manual" || row.locked) ?? rows2[0];
    const merged = mergeFocusRows(primary, rows2);
    merged.id = primary.id;
    output.push(merged);
    mergedIdsByIdentity.set(identity, rows2.filter((row) => row.id !== primary.id).map((row) => row.id));
  }
  snapshot.focus = output;
  return mergedIdsByIdentity;
}
function recordAliases(record) {
  return new Set([record.canonicalName, ...record.aliases].map(normalizeIdentityName).filter(Boolean));
}
function hintAliases(hint) {
  return new Set([hint.canonicalName, ...hint.aliases].map(normalizeIdentityName).filter(Boolean));
}
function matchingRecord(registry, hint) {
  if (hint.focusId) {
    const byId = registry.find((record) => record.focusId === hint.focusId);
    if (byId) return byId;
  }
  const names = hintAliases(hint);
  return registry.find((record) => {
    const aliases = recordAliases(record);
    return [...names].some((name) => aliases.has(name));
  });
}
function currentFocusCandidate(snapshot, hint) {
  if (hint) {
    const aliases = hintAliases(hint);
    return snapshot.focus.find((row) => aliases.has(normalizeIdentityName(row.title)));
  }
  return snapshot.focus.find((row) => /当前焦点|current/i.test(row.status)) ?? snapshot.focus[0];
}
function normalizeFocusIdentity(snapshot, registryInput, currentFocusId, hint) {
  const registry = deepClone(registryInput ?? []);
  const exactMergedIdsByIdentity = dedupeExactFocusRows(snapshot);
  const candidate = currentFocusCandidate(snapshot, hint);
  if (!candidate) return { registry, currentFocusId };
  const now = nowIso();
  let record = hint ? matchingRecord(registry, hint) : registry.find((item2) => item2.focusId === currentFocusId || item2.rowId === candidate.id);
  if (!record) {
    const canonicalName = hint?.canonicalName || candidate.title;
    const focusId = hint?.focusId || `focus:${hashText(normalizeIdentityName(canonicalName) || candidate.id).slice(0, 16)}`;
    record = {
      focusId,
      rowId: candidate.id,
      canonicalName,
      aliases: unique([canonicalName, candidate.title, ...hint?.aliases ?? []], 24),
      mergedRowIds: [],
      createdAt: now,
      updatedAt: now
    };
    registry.push(record);
  }
  const aliases = new Set([
    ...recordAliases(record),
    ...hint ? hintAliases(hint) : [],
    normalizeIdentityName(candidate.title)
  ].filter(Boolean));
  const duplicates = snapshot.focus.filter((row) => aliases.has(normalizeIdentityName(row.title)) || row.id === record.rowId);
  const primary = duplicates.find((row) => row.id === record.rowId) ?? candidate;
  const merged = mergeFocusRows(primary, duplicates);
  const mergedRowIds = unique([
    ...record.mergedRowIds,
    ...exactMergedIdsByIdentity.get(normalizeIdentityName(candidate.title)) ?? [],
    ...duplicates.filter((row) => row.id !== primary.id).map((row) => row.id)
  ], 80);
  merged.id = record.rowId || primary.id;
  merged.status = "\u5F53\u524D\u7126\u70B9";
  record.rowId = merged.id;
  record.canonicalName = hint?.canonicalName || record.canonicalName || merged.title;
  record.aliases = unique([record.canonicalName, merged.title, ...record.aliases, ...hint?.aliases ?? []], 24);
  record.mergedRowIds = mergedRowIds;
  record.updatedAt = now;
  const duplicateIds = new Set(duplicates.map((row) => row.id));
  snapshot.focus = snapshot.focus.filter((row) => !duplicateIds.has(row.id)).map((row) => /当前焦点|current/i.test(row.status) ? { ...row, status: "\u975E\u5F53\u524D\u7126\u70B9" } : row);
  snapshot.focus.push(merged);
  return { registry, currentFocusId: record.focusId };
}
function projectUnifiedFacts(input) {
  const operations = input.factPackage.tableOperations ?? [];
  let snapshot;
  let mode;
  if (operations.length) {
    snapshot = normalizeSnapshot(input.previousSnapshot, input.previousSnapshot);
    for (const operation of operations) applyOperation(snapshot, operation);
    mode = "operations";
  } else if (input.factPackage.finalSnapshot) {
    const normalized = normalizeSnapshot(input.factPackage.finalSnapshot, input.previousSnapshot);
    snapshot = preservePersistentCharacters(
      input.previousSnapshot,
      preserveSnapshotContinuity(input.previousSnapshot, normalized)
    );
    mode = "compatibility-snapshot";
  } else {
    snapshot = normalizeSnapshot(input.previousSnapshot, input.previousSnapshot);
    mode = "no-change";
  }
  const focus = normalizeFocusIdentity(
    snapshot,
    input.focusRegistry,
    input.currentFocusId,
    input.factPackage.focusIdentity
  );
  return {
    snapshot,
    focusRegistry: focus.registry,
    currentFocusId: focus.currentFocusId,
    mode
  };
}

// src/domain/lorebook-publish.ts
function lorebookActivationPolicy(kind, options) {
  const foundation = kind === "semantic:foundations" || kind === "state:foundations";
  const latestContinuity = kind === "semantic:large" && Boolean(options.latestContinuityConstant);
  if (foundation || latestContinuity) return { mode: "constant", constant: true, vectorized: false };
  if (options.vectorize) return { mode: "keyword-vector", constant: false, vectorized: true };
  return { mode: "keyword", constant: false, vectorized: false };
}
function dedupeFocusRows(sourceRows) {
  const groups = /* @__PURE__ */ new Map();
  for (const row of sourceRows) {
    const key = normalizeIdentityName(row.title) || `id:${row.id}`;
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  return [...groups.values()].map((values) => {
    const protectedRow = values.find((row) => row.source === "manual" || row.locked);
    const current = values.find((row) => /当前焦点|current/i.test(row.status));
    return protectedRow ?? current ?? values.at(-1);
  });
}
function rows(snapshot, key) {
  return snapshot[key] ?? [];
}
function uniq(values, limit = 32) {
  return [...new Set(values.map((item2) => String(item2 || "").trim()).filter((item2) => item2.length >= 2 || /[\p{L}\p{N}]/u.test(item2)))].slice(0, limit);
}
function titleKeywords(row) {
  return uniq([row.title, ...row.keywords], 20);
}
function lifecycleLines(lifecycle) {
  if (!lifecycle) return [];
  const lines = [
    `\u5B58\u5728\u72B6\u6001\uFF1A${lifecycle.existence}`,
    `\u6D3B\u8DC3\u72B6\u6001\uFF1A${lifecycle.activity}`,
    `\u8BB0\u5FC6\u72B6\u6001\uFF1A${lifecycle.memory}`,
    `\u8BC1\u636E\u7B49\u7EA7\uFF1A${lifecycle.evidenceLevel}`
  ];
  if (lifecycle.evidence) lines.push(`\u5224\u65AD\u4F9D\u636E\uFF1A${lifecycle.evidence}`);
  if (lifecycle.returnConditions.length) lines.push(`\u53EF\u80FD\u56DE\u6D41\u6761\u4EF6\uFF1A${lifecycle.returnConditions.join("\uFF1B")}`);
  if (lifecycle.returnBlockers.length) lines.push(`\u963B\u6B62\u56DE\u6D41\u6761\u4EF6\uFF1A${lifecycle.returnBlockers.join("\uFF1B")}`);
  return lines;
}
function rowContent(sectionName, row) {
  const lines = [`[${sectionName}\uFF1A${row.title}]`];
  lines.push(...lifecycleLines(row.lifecycle));
  if (row.status) lines.push(`\u5F53\u524D\u72B6\u6001\uFF1A${row.status}`);
  if (row.content) lines.push(`\u5F53\u524D\u8BB0\u5F55\uFF1A${row.content}`);
  if (row.keywords.length) lines.push(`\u5173\u952E\u8BCD\uFF1A${row.keywords.join("\u3001")}`);
  if (row.source === "manual" || row.locked) lines.push("\u7EF4\u62A4\u6743\u9650\uFF1A\u73A9\u5BB6\u9501\u5B9A\uFF1B\u81EA\u52A8\u6574\u7406\u4E0D\u5F97\u8986\u76D6\u6216\u5220\u9664\u3002");
  lines.push(`\u66F4\u65B0\u65F6\u95F4\uFF1A${row.updatedAt}`);
  return lines.join("\n");
}
function groupedContent(title, tableLabel, sourceRows) {
  const blocks2 = sourceRows.map((row) => rowContent(tableLabel, row));
  return `[${title}]
${blocks2.length ? blocks2.join("\n\n") : "\u6682\u65E0\u53EF\u53D1\u5E03\u8BB0\u5F55\u3002"}`;
}
function isCurrentCharacter(row) {
  const activity = row.lifecycle?.activity;
  return activity === "\u5F53\u524D\u5728\u573A" || activity === "\u5F53\u524D\u76F8\u5173";
}
function isGlobalRow(row) {
  const text = `${row.title} ${row.status} ${row.keywords.join(" ")}`;
  return /(全局|跨区域|公共|社会|制度|世界态势|global)/i.test(text);
}
function cleanPrefixedTitle(title, prefixes) {
  let output = String(title || "").trim();
  for (const prefix of prefixes) {
    const pattern = new RegExp(`^${prefix}[\uFF5C|:\uFF1A\\s-]*`, "i");
    output = output.replace(pattern, "").trim();
  }
  return output || title;
}
function eventKind(row) {
  const text = `${row.title} ${row.status} ${row.keywords.join(" ")}`;
  const process2 = /(^|[｜|])流程|手续|登记|申请|审批|调查程序|制度流程|process/i.test(text);
  return process2 ? { label: "\u6D41\u7A0B", name: cleanPrefixedTitle(row.title, ["\u6D41\u7A0B"]) } : { label: "\u4E8B\u4EF6", name: cleanPrefixedTitle(row.title, ["\u4E8B\u4EF6"]) };
}
function ownerEntry(row, kind) {
  const escaped2 = kind.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = row.title.match(new RegExp(`^(.*?)[\uFF5C|:\uFF1A\\s-]*${escaped2}$`));
  if (match?.[1]?.trim()) {
    const owner = match[1].trim();
    return { comment: `MA\uFF5C${kind}\uFF5C${owner}`, name: owner, label: kind };
  }
  return kind === "\u7269\u54C1\u4E0E\u8D44\u6E90" ? { comment: `MA\uFF5C\u7269\u54C1\uFF5C${row.title}`, name: row.title, label: "\u7269\u54C1" } : { comment: `MA\uFF5C\u6280\u80FD\u4E0E\u80FD\u529B\uFF5C${row.title}`, name: row.title, label: "\u6280\u80FD\u4E0E\u80FD\u529B" };
}
function makeDocument(key, comment, content, keywords, constant, vectorized, order, kind, activationMode) {
  const activation = activationMode ? {
    mode: activationMode,
    constant: activationMode === "constant",
    vectorized: activationMode === "vector"
  } : lorebookActivationPolicy(kind, {
    vectorize: vectorized,
    latestContinuityConstant: constant && kind === "semantic:large"
  });
  return {
    key,
    comment: `[MA11] ${comment}`,
    content,
    keywords: uniq(keywords),
    constant: activation.constant,
    vectorized: activation.vectorized,
    order,
    kind
  };
}
function unconsumedSmallSummaries(small, large) {
  const consumed = new Set(large.flatMap((item2) => item2.sourceKeys));
  return small.filter((item2) => !consumed.has(item2.id));
}
function currentSmallSummaryContent(summaries) {
  const blocks2 = summaries.map((item2) => {
    const notes = item2.sedimentation?.notes?.length ? `
\u6C89\u964D\u5904\u7406\uFF1A${item2.sedimentation.notes.join("\uFF1B")}` : "";
    return `\u3010${item2.title}\u3011
${item2.summary}${notes}`;
  });
  return `[\u5C0F\u603B\u7ED3\uFF1A\u5F53\u524D\u5468\u671F]
${blocks2.join("\n\n")}`;
}
function buildSemanticLorebookDocuments(snapshot, smallSummaries, largeSummaries, options) {
  const documents = [];
  if (snapshot) {
    const foundationRows = rows(snapshot, "foundations");
    if (foundationRows.length) {
      documents.push(makeDocument(
        "semantic:foundations",
        "MA\uFF5C\u57FA\u7840\u8BBE\u5B9A",
        groupedContent("\u57FA\u7840\u8BBE\u5B9A", TABLE_LABELS.foundations, foundationRows),
        ["\u57FA\u7840\u8BBE\u5B9A", ...foundationRows.flatMap(titleKeywords)],
        true,
        false,
        170,
        "semantic:foundations"
      ));
    }
    const globalRows = [
      ...rows(snapshot, "spacetime"),
      ...rows(snapshot, "events").filter(isGlobalRow),
      ...rows(snapshot, "regions").filter(isGlobalRow)
    ];
    if (globalRows.length) {
      documents.push(makeDocument(
        "semantic:global",
        "MA\uFF5C\u5168\u5C40\u6001\u52BF",
        groupedContent("\u5168\u5C40\u6001\u52BF", "\u5F53\u524D\u6001\u52BF", globalRows),
        ["\u5168\u5C40\u6001\u52BF", "\u5F53\u524D\u65F6\u95F4", "\u5F53\u524D\u5730\u70B9", ...globalRows.flatMap(titleKeywords)],
        false,
        options.vectorize,
        165,
        "semantic:global"
      ));
    }
    for (const row of dedupeFocusRows(rows(snapshot, "focus"))) {
      documents.push(makeDocument(
        `semantic:focus:${row.id}`,
        `MA\uFF5C\u7126\u70B9\uFF5C${row.title}`,
        rowContent("\u7126\u70B9", row),
        titleKeywords(row),
        false,
        options.vectorize,
        160,
        "semantic:focus"
      ));
    }
    for (const row of rows(snapshot, "characters")) {
      documents.push(makeDocument(
        `semantic:character:${row.id}`,
        `MA\uFF5C\u4EBA\u7269\uFF5C${row.title}`,
        rowContent("\u4EBA\u7269", row),
        titleKeywords(row),
        false,
        options.vectorize,
        isCurrentCharacter(row) ? 155 : 125,
        "semantic:character"
      ));
    }
    const relationRows = rows(snapshot, "relationships");
    if (relationRows.length) {
      documents.push(makeDocument(
        "semantic:relationships",
        "MA\uFF5C\u5173\u7CFB\u7F51\u7EDC",
        groupedContent("\u5173\u7CFB\u7F51\u7EDC", TABLE_LABELS.relationships, relationRows),
        ["\u5173\u7CFB\u7F51\u7EDC", ...relationRows.flatMap(titleKeywords)],
        false,
        options.vectorize,
        145,
        "semantic:relationships"
      ));
    }
    for (const row of rows(snapshot, "regions")) {
      documents.push(makeDocument(
        `semantic:region:${row.id}`,
        `MA\uFF5C\u533A\u57DF\uFF5C${row.title}`,
        rowContent("\u533A\u57DF", row),
        titleKeywords(row),
        false,
        options.vectorize,
        130,
        "semantic:region"
      ));
    }
    for (const row of rows(snapshot, "events")) {
      const classified = eventKind(row);
      documents.push(makeDocument(
        `semantic:${classified.label === "\u6D41\u7A0B" ? "process" : "event"}:${row.id}`,
        `MA\uFF5C${classified.label}\uFF5C${classified.name}`,
        rowContent(classified.label, row),
        titleKeywords(row),
        false,
        options.vectorize,
        135,
        classified.label === "\u6D41\u7A0B" ? "semantic:process" : "semantic:event"
      ));
    }
    for (const row of rows(snapshot, "items")) {
      const info = ownerEntry(row, "\u7269\u54C1\u4E0E\u8D44\u6E90");
      documents.push(makeDocument(
        `semantic:item:${row.id}`,
        info.comment,
        rowContent(info.label, row),
        titleKeywords(row),
        false,
        options.vectorize,
        120,
        "semantic:item"
      ));
    }
    for (const row of rows(snapshot, "skills")) {
      const info = ownerEntry(row, "\u6280\u80FD\u4E0E\u80FD\u529B");
      documents.push(makeDocument(
        `semantic:skill:${row.id}`,
        info.comment,
        rowContent(info.label, row),
        titleKeywords(row),
        false,
        options.vectorize,
        118,
        "semantic:skill"
      ));
    }
  }
  const pendingSmall = unconsumedSmallSummaries(smallSummaries, largeSummaries);
  if (pendingSmall.length) {
    documents.push(makeDocument(
      "semantic:small:current",
      "MA\uFF5C\u5C0F\u603B\u7ED3\uFF5C\u5F53\u524D\u5468\u671F",
      currentSmallSummaryContent(pendingSmall),
      ["\u5C0F\u603B\u7ED3", "\u5F53\u524D\u5468\u671F", ...pendingSmall.flatMap((item2) => [item2.title, ...item2.keywords])],
      false,
      options.vectorize,
      150,
      "semantic:small"
    ));
  }
  const latestLarge = largeSummaries.at(-1);
  if (latestLarge) {
    documents.push(makeDocument(
      "semantic:large:current",
      "MA\uFF5C\u5927\u603B\u7ED3\uFF5C\u957F\u671F\u6C89\u964D",
      `[\u5927\u603B\u7ED3\uFF1A\u957F\u671F\u6C89\u964D]
${latestLarge.summary}`,
      ["\u5927\u603B\u7ED3", "\u957F\u671F\u6C89\u964D", latestLarge.title, ...latestLarge.keywords],
      options.latestContinuityConstant,
      options.vectorize,
      148,
      "semantic:large"
    ));
  }
  return documents;
}
function buildDetailedLorebookDocuments(snapshot, smallSummaries, largeSummaries, options) {
  const documents = [];
  if (snapshot) {
    for (const tableKey of TABLE_KEYS) {
      for (const row of rows(snapshot, tableKey)) {
        const constant = tableKey === "foundations";
        documents.push(makeDocument(
          `state:${tableKey}:${row.id}`,
          `MA\uFF5C${TABLE_LABELS[tableKey]}\uFF5C${row.title}`,
          rowContent(TABLE_LABELS[tableKey], row),
          titleKeywords(row),
          constant,
          options.vectorize,
          constant ? 140 : 100,
          `state:${tableKey}`
        ));
      }
    }
  }
  for (const item2 of smallSummaries) {
    documents.push(makeDocument(
      `small:${item2.id}`,
      `MA\uFF5C\u5C0F\u603B\u7ED3\uFF5C${item2.title}`,
      item2.summary,
      [item2.title, ...item2.keywords],
      false,
      options.vectorize,
      110,
      "small"
    ));
  }
  for (const item2 of largeSummaries) {
    documents.push(makeDocument(
      `large:${item2.id}`,
      `MA\uFF5C\u5927\u603B\u7ED3\uFF5C${item2.title}`,
      item2.summary,
      [item2.title, ...item2.keywords],
      false,
      options.vectorize,
      120,
      "large"
    ));
  }
  return documents;
}
function eventMemoryContent(entry) {
  const lines = [`[事件记忆：${entry.title}]`, `事件ID：${entry.eventId}`, `状态：${entry.status}`, `信息精度：${entry.precision}`, `发生时间：${entry.occurredAt || "未明确"}`, `最后确认：${entry.lastConfirmedAt || "未明确"}`, `已确认事实：${entry.facts}`];
  if (entry.participants.length) lines.push(`涉及对象：${entry.participants.join("、")}`);
  if (entry.locations.length) lines.push(`涉及地点：${entry.locations.join("、")}`);
  if (entry.propagation.scope !== "unknown") lines.push(`传播范围：${entry.propagation.scope}`);
  if (entry.propagation.knownBy.length) lines.push(`已知者：${entry.propagation.knownBy.join("、")}`);
  if (entry.propagation.channels.length) lines.push(`传播渠道：${entry.propagation.channels.join("、")}`);
  if (entry.propagation.distortions.length) lines.push(`误传或偏差：${entry.propagation.distortions.join("；")}`);
  if (entry.traces.length) lines.push(`留存痕迹：${entry.traces.join("；")}`);
  if (entry.impacts.length) lines.push(`持续影响：${entry.impacts.join("；")}`);
  lines.push("时间判断说明：本条目不保存下一次复核时间；被触发时请结合当前时间与最后确认时间判断是否过时或进一步模糊。");
  return lines.join("\n");
}
function buildLorebookDocuments(snapshot, smallSummaries, largeSummaries, eventEntries, options) {
  const base = options.layout === "detailed" ? buildDetailedLorebookDocuments(snapshot, smallSummaries, largeSummaries, options) : buildSemanticLorebookDocuments(snapshot, smallSummaries, largeSummaries, options);
  const documents = base.filter((document2) => document2.kind !== "small" && document2.kind !== "semantic:small");
  for (const entry of eventEntries ?? []) {
    documents.push(makeDocument(
      `event-memory:${entry.eventId}`,
      `MA｜事件记忆｜${entry.title}`,
      eventMemoryContent(entry),
      [entry.title, ...entry.keywords, ...entry.participants, ...entry.locations],
      entry.activation === "constant",
      entry.activation === "vector",
      entry.activation === "constant" ? 158 : entry.status === "active" || entry.status === "unresolved" ? 142 : 112,
      "event-memory",
      entry.activation
    ));
  }
  return documents;
}

// src/pipeline/lorebook.ts
init_chat_scope();

// src/foundation/capabilities.ts
function item(id, label, value, required, availableDetail, missingDetail) {
  const available = Boolean(value);
  return {
    id,
    label,
    state: available ? "available" : required ? "missing" : "degraded",
    required,
    detail: available ? availableDetail : missingDetail
  };
}
function detectCapabilities(context) {
  const items = [
    item("eventSource", "\u4E8B\u4EF6\u603B\u7EBF", context?.eventSource?.on, true, "eventSource \u53EF\u7528", "\u7F3A\u5C11 eventSource.on"),
    item("eventTypes", "\u4E8B\u4EF6\u7C7B\u578B", context?.event_types, true, "event_types \u53EF\u7528", "\u7F3A\u5C11 event_types"),
    item("settings", "\u6269\u5C55\u8BBE\u7F6E", context?.extensionSettings, true, "extensionSettings \u53EF\u7528", "\u7F3A\u5C11 extensionSettings"),
    item("accountStorage", "\u8D26\u6237\u7EA7\u5B58\u50A8", context?.accountStorage?.getItem && context?.accountStorage?.setItem, false, "accountStorage \u53EF\u7528", "\u5C06\u4F7F\u7528\u4EC5\u5F53\u524D\u9875\u9762\u6709\u6548\u7684\u8D26\u6237\u9694\u79BB\u6807\u8BC6"),
    item("metadata", "\u804A\u5929\u5143\u6570\u636E", context?.chatMetadata ?? context?.chat_metadata, true, "chatMetadata \u53EF\u7528", "\u7F3A\u5C11 chatMetadata"),
    item("saveMetadata", "\u804A\u5929\u5143\u6570\u636E\u4FDD\u5B58", context?.saveMetadata ?? context?.saveMetadataDebounced, true, "\u5143\u6570\u636E\u4FDD\u5B58\u63A5\u53E3\u53EF\u7528", "\u7F3A\u5C11\u5143\u6570\u636E\u4FDD\u5B58\u63A5\u53E3"),
    item("saveChat", "\u804A\u5929\u4FDD\u5B58", context?.saveChat ?? context?.saveChatConditional, true, "\u804A\u5929\u4FDD\u5B58\u63A5\u53E3\u53EF\u7528", "\u7F3A\u5C11\u804A\u5929\u4FDD\u5B58\u63A5\u53E3"),
    item("templates", "\u5F02\u6B65\u6A21\u677F\u6E32\u67D3", context?.renderExtensionTemplateAsync, false, "\u5F02\u6B65\u6A21\u677F\u63A5\u53E3\u53EF\u7528", "\u5C06\u4F7F\u7528\u5185\u7F6E\u6A21\u677F\u964D\u7EA7"),
    item("localforage", "\u6D4F\u89C8\u5668\u6301\u4E45\u5B58\u50A8", globalThis.SillyTavern?.libs?.localforage?.createInstance, false, "localforage \u53EF\u7528", "\u5C06\u964D\u7EA7\u5230 localStorage"),
    item("profileRequest", "Connection Profile \u9694\u79BB\u8BF7\u6C42", context?.ConnectionManagerRequestService?.sendRequest, false, "\u539F\u751F\u9694\u79BB\u8BF7\u6C42\u53EF\u7528", "\u53EA\u80FD\u4F7F\u7528\u5F53\u524D\u804A\u5929\u8FDE\u63A5"),
    item("generateRaw", "\u5F53\u524D\u8FDE\u63A5\u539F\u59CB\u751F\u6210", context?.generateRaw, false, "generateRaw \u53EF\u7528", "\u5F53\u524D\u8FDE\u63A5\u6A21\u5F0F\u4E0D\u53EF\u7528"),
    item("requestHeaders", "\u670D\u52A1\u5668\u8BF7\u6C42\u5934", context?.getRequestHeaders, false, "\u53EF\u53D6\u5F97 CSRF \u8BF7\u6C42\u5934", "\u670D\u52A1\u5668\u5199\u5165\u5C06\u8FDB\u884C\u517C\u5BB9\u964D\u7EA7"),
    item("debugFunction", "\u8C03\u8BD5\u83DC\u5355", context?.registerDebugFunction, false, "\u8C03\u8BD5\u51FD\u6570\u6CE8\u518C\u53EF\u7528", "\u4E0D\u5F71\u54CD\u6838\u5FC3\u8FD0\u884C")
  ];
  return {
    checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ready: !items.some((entry) => entry.required && entry.state === "missing"),
    degraded: items.some((entry) => entry.state === "degraded"),
    items
  };
}

// src/foundation/event-router.ts
init_chat_scope();
var EventRouter = class {
  subscribers = /* @__PURE__ */ new Map();
  cleanup = [];
  installed = false;
  sequence = 0;
  subscribe(type, subscriber) {
    const set = this.subscribers.get(type) ?? /* @__PURE__ */ new Set();
    set.add(subscriber);
    this.subscribers.set(type, set);
    return () => set.delete(subscriber);
  }
  emit(type, payload, sourceEvent) {
    const event = {
      id: ++this.sequence,
      type,
      payload,
      scope: chatScopeManager.current(),
      occurredAt: (/* @__PURE__ */ new Date()).toISOString(),
      sourceEvent
    };
    for (const subscriber of this.subscribers.get(type) ?? []) {
      try {
        const result = subscriber(event);
        if (result && typeof result.catch === "function") {
          void result.catch((error) => console.error("[MirrorAbyss] event subscriber failed", error));
        }
      } catch (error) {
        console.error("[MirrorAbyss] event subscriber failed", error);
      }
    }
  }
  install(context) {
    if (this.installed) return;
    const eventSource = context?.eventSource;
    const types = context?.event_types;
    if (!eventSource?.on || !types) throw new Error("\u4E8B\u4EF6\u8DEF\u7531\u5668\u65E0\u6CD5\u5B89\u88C5\uFF1A\u7F3A\u5C11 eventSource \u6216 event_types");
    const bind = (rawType, normalized, before) => {
      if (!rawType) return;
      const handler = (payload) => {
        before?.();
        this.emit(normalized, payload, rawType);
      };
      eventSource.on(rawType, handler);
      this.cleanup.push(() => eventSource.removeListener?.(rawType, handler));
    };
    bind(types.APP_READY, "app-ready");
    bind(types.CHAT_CHANGED, "chat-changed", () => chatScopeManager.invalidate());
    bind(types.CHAT_CREATED, "chat-created", () => {
      rotateChatIdentityForContext(context);
      chatScopeManager.invalidate();
    });
    bind(types.GROUP_CHAT_CREATED, "chat-created", () => {
      rotateChatIdentityForContext(context);
      chatScopeManager.invalidate();
    });
    bind(types.MESSAGE_RECEIVED, "message-created");
    bind(types.CHARACTER_MESSAGE_RENDERED, "message-rendered");
    bind(types.MESSAGE_EDITED, "message-changed");
    bind(types.MESSAGE_UPDATED, "message-changed");
    bind(types.MESSAGE_SWIPED, "message-changed");
    bind(types.MESSAGE_SWIPE_DELETED, "message-changed");
    bind(types.MESSAGE_DELETED, "message-removed");
    bind(types.GENERATION_STARTED, "generation-started");
    bind(types.GENERATION_ENDED, "generation-finished");
    bind(types.WORLDINFO_UPDATED, "worldinfo-updated");
    this.installed = true;
  }
  uninstall() {
    for (const dispose of this.cleanup.splice(0)) {
      try {
        dispose();
      } catch (error) {
        console.warn("[MirrorAbyss] event unbind failed", error);
      }
    }
    this.installed = false;
  }
  isInstalled() {
    return this.installed;
  }
};

// src/foundation/lock-manager.ts
var LockManager = class {
  tails = /* @__PURE__ */ new Map();
  async withLock(key, work) {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    const queued = previous.catch(() => void 0).then(() => current);
    this.tails.set(key, queued);
    await previous.catch(() => void 0);
    try {
      return await work();
    } finally {
      release();
      if (this.tails.get(key) === queued) this.tails.delete(key);
    }
  }
  isLocked(key) {
    return this.tails.has(key);
  }
};

// src/foundation/service-container.ts
function createServiceToken(description) {
  return Symbol(description);
}
var ServiceContainer = class {
  services = /* @__PURE__ */ new Map();
  register(token, service) {
    if (this.services.has(token)) throw new Error(`\u670D\u52A1\u5DF2\u6CE8\u518C\uFF1A${String(token.description || token)}`);
    this.services.set(token, service);
    return service;
  }
  replace(token, service) {
    this.services.set(token, service);
    return service;
  }
  has(token) {
    return this.services.has(token);
  }
  get(token) {
    if (!this.services.has(token)) throw new Error(`\u670D\u52A1\u672A\u6CE8\u518C\uFF1A${String(token.description || token)}`);
    return this.services.get(token);
  }
  tryGet(token) {
    return this.services.get(token) ?? null;
  }
  clear() {
    this.services.clear();
  }
};

// src/foundation/kernel.ts
init_chat_scope();

// src/foundation/cross-tab-coordinator.ts
init_constants();
init_utils();
function abortError(signal) {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  const error = new Error(reason ? String(reason) : "\u534F\u8C03\u79DF\u7EA6\u5DF2\u53D6\u6D88");
  error.name = "AbortError";
  return error;
}
function defaultSleep(ms, signal) {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const finish = (callback) => {
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const timer = setTimeout(() => finish(resolve), ms);
    const onAbort = () => {
      clearTimeout(timer);
      finish(() => reject(abortError(signal)));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
function safeParse(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value?.ownerId || !value?.token || !Number.isFinite(value.expiresAt)) return null;
    return value;
  } catch {
    return null;
  }
}
var CrossTabCoordinator = class {
  ownerId;
  storage;
  navigatorLike;
  now;
  sleep;
  leaseTtlMs;
  heartbeatMs;
  acquireTimeoutMs;
  channel;
  active = /* @__PURE__ */ new Map();
  memoryTails = /* @__PURE__ */ new Map();
  stopped = false;
  constructor(options = {}) {
    this.ownerId = options.ownerId ?? makeId("tab");
    this.storage = options.storage !== void 0 ? options.storage : (() => {
      try {
        return globalThis.localStorage ?? null;
      } catch {
        return null;
      }
    })();
    this.navigatorLike = options.navigatorLike !== void 0 ? options.navigatorLike : globalThis.navigator;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? defaultSleep;
    this.leaseTtlMs = Math.max(2e3, options.leaseTtlMs ?? 15e3);
    this.heartbeatMs = Math.max(500, Math.min(this.leaseTtlMs / 3, options.heartbeatMs ?? 4e3));
    this.acquireTimeoutMs = Math.max(1e3, options.acquireTimeoutMs ?? 2e4);
    const factory = options.channelFactory !== void 0 ? options.channelFactory : typeof globalThis.window !== "undefined" && typeof globalThis.BroadcastChannel === "function" ? (name) => new BroadcastChannel(name) : null;
    this.channel = factory ? factory(CROSS_TAB_CHANNEL) : null;
    this.channel?.unref?.();
    if (this.channel) this.channel.onmessage = () => void 0;
  }
  storageKey(key) {
    return `${CROSS_TAB_LEASE_PREFIX}${encodeURIComponent(key)}`;
  }
  assertRunning(signal) {
    if (this.stopped) throw new Error("\u8DE8\u6807\u7B7E\u534F\u8C03\u5668\u5DF2\u505C\u6B62");
    if (signal?.aborted) throw abortError(signal);
  }
  readStored(key) {
    if (!this.storage) return null;
    try {
      return safeParse(this.storage.getItem(this.storageKey(key)));
    } catch {
      return null;
    }
  }
  writeStored(key, value) {
    if (!this.storage) return;
    this.storage.setItem(this.storageKey(key), JSON.stringify(value));
    this.channel?.postMessage({ type: "lease-change", key, ownerId: value.ownerId, expiresAt: value.expiresAt });
  }
  removeStoredIfOwned(key, ownerId, token) {
    if (!this.storage) return;
    try {
      const current = this.readStored(key);
      if (current?.ownerId === ownerId && current.token === token) {
        this.storage.removeItem(this.storageKey(key));
        this.channel?.postMessage({ type: "lease-release", key, ownerId });
      }
    } catch {
    }
  }
  async waitForTail(previous, signal) {
    if (!signal) {
      await previous.catch(() => void 0);
      return;
    }
    if (signal.aborted) throw abortError(signal);
    await Promise.race([
      previous.catch(() => void 0),
      new Promise((_, reject) => {
        const onAbort = () => reject(abortError(signal));
        signal.addEventListener("abort", onAbort, { once: true });
        previous.finally(() => signal.removeEventListener("abort", onAbort)).catch(() => void 0);
      })
    ]);
  }
  makeHandle(snapshot) {
    return {
      key: snapshot.key,
      ownerId: snapshot.ownerId,
      token: snapshot.token,
      mode: snapshot.mode,
      assertOwner: () => {
        if (this.stopped) throw new Error("\u8DE8\u6807\u7B7E\u534F\u8C03\u5668\u5DF2\u505C\u6B62");
        if (snapshot.mode === "storage") {
          const current = this.readStored(snapshot.key);
          if (!current || current.ownerId !== snapshot.ownerId || current.token !== snapshot.token || current.expiresAt <= this.now()) {
            throw new Error(`\u8DE8\u6807\u7B7E\u79DF\u7EA6\u5DF2\u4E22\u5931\uFF1A${snapshot.key}`);
          }
          snapshot.heartbeatAt = current.heartbeatAt;
          snapshot.expiresAt = current.expiresAt;
        }
      },
      snapshot: () => structuredClone(snapshot)
    };
  }
  async withStorageLease(key, work, signal) {
    if (!this.storage) {
      const previous = this.memoryTails.get(key) ?? Promise.resolve();
      let release;
      const current = new Promise((resolve) => {
        release = resolve;
      });
      const queued = previous.catch(() => void 0).then(() => current);
      this.memoryTails.set(key, queued);
      await this.waitForTail(previous, signal);
      this.assertRunning(signal);
      const now = this.now();
      const snapshot2 = {
        key,
        ownerId: this.ownerId,
        token: makeId("memory-lease"),
        mode: "memory",
        acquiredAt: now,
        heartbeatAt: now,
        expiresAt: Number.POSITIVE_INFINITY
      };
      this.active.set(key, snapshot2);
      try {
        return await work(this.makeHandle(snapshot2));
      } finally {
        this.active.delete(key);
        release();
        if (this.memoryTails.get(key) === queued) this.memoryTails.delete(key);
      }
    }
    const deadline = this.now() + this.acquireTimeoutMs;
    const token = makeId("lease");
    let stored;
    while (true) {
      this.assertRunning(signal);
      const now = this.now();
      if (now >= deadline) throw new Error(`\u7B49\u5F85\u8DE8\u6807\u7B7E\u79DF\u7EA6\u8D85\u65F6\uFF1A${key}`);
      const current = this.readStored(key);
      if (!current || current.expiresAt <= now || current.ownerId === this.ownerId && current.token === token) {
        stored = { ownerId: this.ownerId, token, acquiredAt: now, heartbeatAt: now, expiresAt: now + this.leaseTtlMs };
        this.writeStored(key, stored);
        await this.sleep(8, signal);
        const verified = this.readStored(key);
        if (verified?.ownerId === this.ownerId && verified.token === token) break;
      }
      await this.sleep(40 + Math.floor(Math.random() * 40), signal);
    }
    const snapshot = { key, ...stored, mode: "storage" };
    const handle = this.makeHandle(snapshot);
    this.active.set(key, snapshot);
    const heartbeat = setInterval(() => {
      try {
        const current = this.readStored(key);
        if (current?.ownerId !== this.ownerId || current.token !== token) return;
        const now = this.now();
        stored = { ...current, heartbeatAt: now, expiresAt: now + this.leaseTtlMs };
        this.writeStored(key, stored);
        snapshot.heartbeatAt = stored.heartbeatAt;
        snapshot.expiresAt = stored.expiresAt;
      } catch {
      }
    }, this.heartbeatMs);
    try {
      return await work(handle);
    } finally {
      clearInterval(heartbeat);
      this.active.delete(key);
      this.removeStoredIfOwned(key, this.ownerId, token);
    }
  }
  async withLease(key, work, signal) {
    this.assertRunning(signal);
    const lockManager = this.navigatorLike?.locks;
    if (lockManager?.request) {
      const lockName = `mirror-abyss:${key}`;
      return lockManager.request(lockName, { mode: "exclusive", signal }, async (lock) => {
        if (!lock) throw new Error(`\u65E0\u6CD5\u53D6\u5F97\u8DE8\u6807\u7B7E\u9501\uFF1A${key}`);
        const now = this.now();
        const snapshot = {
          key,
          ownerId: this.ownerId,
          token: makeId("web-lock"),
          mode: "web-locks",
          acquiredAt: now,
          heartbeatAt: now,
          expiresAt: Number.POSITIVE_INFINITY
        };
        this.active.set(key, snapshot);
        try {
          return await work(this.makeHandle(snapshot));
        } finally {
          this.active.delete(key);
        }
      });
    }
    return this.withStorageLease(key, work, signal);
  }
  snapshot() {
    return {
      ownerId: this.ownerId,
      mode: this.navigatorLike?.locks?.request ? "web-locks" : this.storage ? "storage" : "memory",
      active: [...this.active.values()].map((item2) => structuredClone(item2))
    };
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    for (const lease of this.active.values()) {
      if (lease.mode === "storage") this.removeStoredIfOwned(lease.key, lease.ownerId, lease.token);
    }
    this.active.clear();
    if (this.channel) {
      this.channel.onmessage = null;
      this.channel.close();
    }
  }
};
var crossTabCoordinator = new CrossTabCoordinator();

// src/foundation/kernel.ts
var EVENT_ROUTER = createServiceToken("EventRouter");
var LOCK_MANAGER = createServiceToken("LockManager");
var CHAT_SCOPE = createServiceToken("ChatScopeManager");
var CROSS_TAB_COORDINATOR = createServiceToken("CrossTabCoordinator");
var FoundationKernel = class {
  services = new ServiceContainer();
  snapshot = { state: "idle", stage: "idle" };
  startPromise = null;
  status() {
    return structuredClone(this.snapshot);
  }
  async start(context) {
    if (this.snapshot.state === "ready" || this.snapshot.state === "degraded") return this.status();
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal(context).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }
  async startInternal(context) {
    this.snapshot = { state: "starting", stage: "capability-detection", startedAt: (/* @__PURE__ */ new Date()).toISOString() };
    try {
      const capabilities = detectCapabilities(context);
      this.snapshot.capabilities = capabilities;
      if (!capabilities.ready) throw new Error("\u7F3A\u5C11\u955C\u6E0A\u8FD0\u884C\u6240\u9700\u7684 SillyTavern \u6838\u5FC3\u80FD\u529B");
      this.snapshot.stage = "service-registration";
      const router = this.services.tryGet(EVENT_ROUTER) ?? this.services.register(EVENT_ROUTER, new EventRouter());
      if (!this.services.tryGet(LOCK_MANAGER)) this.services.register(LOCK_MANAGER, new LockManager());
      if (!this.services.tryGet(CHAT_SCOPE)) this.services.register(CHAT_SCOPE, chatScopeManager);
      if (!this.services.tryGet(CROSS_TAB_COORDINATOR)) {
        this.services.register(CROSS_TAB_COORDINATOR, new CrossTabCoordinator());
      }
      this.snapshot.stage = "event-router";
      router.install(context);
      this.snapshot = {
        ...this.snapshot,
        state: capabilities.degraded ? "degraded" : "ready",
        stage: "ready",
        readyAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastError: void 0
      };
      return this.status();
    } catch (error) {
      this.snapshot = {
        ...this.snapshot,
        state: "failed",
        stage: this.snapshot.stage || "unknown",
        lastError: error instanceof Error ? error.message : String(error)
      };
      throw error;
    }
  }
  stop() {
    this.services.tryGet(CROSS_TAB_COORDINATOR)?.stop();
    this.services.tryGet(EVENT_ROUTER)?.uninstall();
    this.services.clear();
    this.snapshot = { state: "stopped", stage: "stopped" };
  }
};
var foundationKernel = new FoundationKernel();

// src/pipeline/lorebook.ts
init_task_queue();

// src/integrations/sillytavern-worldinfo.ts
init_utils();
init_task_errors();
var worldInfoModulePromise = null;
async function worldInfoApi() {
  const testApi = globalThis.__MirrorAbyssWorldInfoApi;
  if (testApi) return testApi;
  if (!worldInfoModulePromise) {
    const moduleUrl = "/scripts/world-info.js";
    worldInfoModulePromise = import(
      /* @vite-ignore */
      moduleUrl
    );
  }
  return worldInfoModulePromise;
}
function requestHeaders() {
  const headers = getContext().getRequestHeaders?.();
  if (headers && typeof headers === "object") return headers;
  return { "Content-Type": "application/json" };
}
async function responseDetail(response) {
  try {
    return (await response.text()).trim().slice(0, 500);
  } catch {
    return "";
  }
}
function serverErrorLabel(status) {
  if (status === 401 || status === 403) return "\u670D\u52A1\u5668\u4F1A\u8BDD\u6216CSRF\u6821\u9A8C\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55\u6216\u5237\u65B0\u9152\u9986\u540E\u91CD\u8BD5";
  if (status === 404) return "\u4E16\u754C\u4E66\u63A5\u53E3\u4E0D\u5B58\u5728";
  if (status >= 500) return "\u9152\u9986\u670D\u52A1\u5668\u4FDD\u5B58\u5931\u8D25";
  return "\u9152\u9986\u670D\u52A1\u5668\u62D2\u7EDD\u4E86\u8BF7\u6C42";
}
async function strictPost(path, body, signal) {
  let response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify(body),
      cache: "no-store",
      signal
    });
  } catch (error) {
    if (signal?.aborted) throw new TaskCancelledError(toErrorMessage(signal.reason || error));
    throw new Error(`\u65E0\u6CD5\u8FDE\u63A5\u9152\u9986\u670D\u52A1\u5668\uFF1A${toErrorMessage(error)}`);
  }
  if (!response.ok) {
    const detail = await responseDetail(response);
    throw new Error(`${serverErrorLabel(response.status)}\uFF08HTTP ${response.status}\uFF09${detail ? `\uFF1A${detail}` : ""}`);
  }
  return response;
}
async function loadWorldInfoStrict(name, signal) {
  let response;
  try {
    response = await strictPost("/api/worldinfo/get", { name }, signal);
  } catch (error) {
    if (/HTTP 404/.test(toErrorMessage(error))) return { entries: {} };
    throw error;
  }
  try {
    const data = await response.json();
    return data && typeof data === "object" ? data : { entries: {} };
  } catch (error) {
    throw new Error(`\u4E16\u754C\u4E66\u670D\u52A1\u5668\u8FD4\u56DE\u4E86\u65E0\u6548JSON\uFF1A${toErrorMessage(error)}`);
  }
}
async function saveWorldInfoStrict(name, data, signal) {
  await strictPost("/api/worldinfo/edit", { name, data }, signal);
}
async function emitWorldInfoUpdated(name, data, wi) {
  const context = getContext();
  try {
    await context.eventSource?.emit?.(context.event_types?.WORLDINFO_UPDATED, name, data);
  } catch (error) {
    console.warn("[MirrorAbyss] WORLDINFO_UPDATED emit failed after verified commit", error);
  }
  try {
    await wi.updateWorldInfoList?.();
  } catch (error) {
    console.warn("[MirrorAbyss] world info list refresh failed after verified commit", error);
  }
  try {
    wi.reloadEditor?.(name, true);
  } catch (error) {
    console.warn("[MirrorAbyss] world info editor refresh failed after verified commit", error);
  }
}
async function checkServerConnection() {
  try {
    await strictPost("/api/settings/get", {});
    return { ok: true, detail: "\u9152\u9986\u670D\u52A1\u5668\u8FDE\u63A5\u4E0E\u4F1A\u8BDD\u6821\u9A8C\u6B63\u5E38" };
  } catch (error) {
    return { ok: false, detail: toErrorMessage(error) };
  }
}

// src/pipeline/lorebook.ts
var fallbackLocks = new LockManager();
var TERMINAL_OUTBOX_STATES = /* @__PURE__ */ new Set([
  "committed",
  "rolled_back",
  "conflict",
  "cancelled"
]);
function lorebookLocks() {
  return foundationKernel.services.tryGet(LOCK_MANAGER) ?? fallbackLocks;
}
function lorebookCoordinator() {
  return foundationKernel.services.tryGet(CROSS_TAB_COORDINATOR) ?? crossTabCoordinator;
}
function assertScope(scope, chatKey, signal) {
  if (signal?.aborted) {
    throw new TaskCancelledError(toErrorMessage(signal.reason || "\u4E16\u754C\u4E66\u4EFB\u52A1\u5DF2\u53D6\u6D88"));
  }
  if (scope.chatKey !== chatKey || !chatScopeManager.isCurrent(scope)) {
    throw new StaleTaskError("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u7981\u6B62\u628A\u65E7\u804A\u5929\u7684\u4E16\u754C\u4E66\u4E8B\u52A1\u63D0\u4EA4\u5230\u5F53\u524D\u804A\u5929");
  }
}
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}
function fingerprint(value) {
  return hashText(JSON.stringify(stableValue(value)));
}
function generatedBookName(chatKey) {
  const context = getContext();
  const settings = getSettings();
  const display = sanitizeBookName(context.name2 || context.name1 || "Chat") || "Chat";
  const base = sanitizeBookName(settings.lorebookName || `MA_${display}`) || `MA_${display}`;
  return sanitizeBookName(`${base}_${hashText(chatKey).slice(0, 10)}`);
}
function resolveBookName(scope, create) {
  assertScope(scope, scope.chatKey);
  const settings = getSettings();
  const meta = getChatMetadataNamespace();
  const context = getContext();
  let name = sanitizeBookName(
    meta.lorebookName || context.chatMetadata?.world_info || ""
  );
  if (!name && create && settings.autoCreateLorebook)
    name = generatedBookName(scope.chatKey);
  return name;
}
function managedInfo(entry) {
  return entry?.extensions?.mirrorAbyssV11 ?? null;
}
function isOwnedEntry(entry, chatKey) {
  const info = managedInfo(entry);
  return Boolean(info?.managed && info.key && info.chatKey === chatKey);
}
function isLegacyEntry(entry, legacyKeys) {
  const info = managedInfo(entry);
  return Boolean(
    info?.managed && info.key && !info.chatKey && legacyKeys.has(String(info.key))
  );
}
function subjectEntries(data, chatKey, legacyKeys) {
  const output = [];
  for (const [uid, entry] of Object.entries(data?.entries ?? {})) {
    if (!isOwnedEntry(entry, chatKey) && !isLegacyEntry(entry, legacyKeys))
      continue;
    output.push({ uid, entry: deepClone(entry) });
  }
  return output.sort((a, b) => {
    const aKey = String(managedInfo(a.entry)?.key || "");
    const bKey = String(managedInfo(b.entry)?.key || "");
    return aKey.localeCompare(bKey) || a.uid.localeCompare(b.uid);
  });
}
function subjectFingerprint(data, chatKey, legacyKeys) {
  const normalized = subjectEntries(data, chatKey, legacyKeys).map(
    ({ entry }) => {
      const copy = deepClone(entry);
      delete copy.uid;
      return copy;
    }
  );
  return fingerprint(normalized);
}
function nextUid(data) {
  const used = Object.keys(data.entries ?? {}).map((key) => Number(key)).filter((value) => Number.isFinite(value));
  return used.length ? Math.max(...used) + 1 : 0;
}
function createEntry(wi, name, data) {
  const entry = wi.createWorldInfoEntry?.(name, data);
  if (entry) return entry;
  const uid = nextUid(data);
  const fallback = { uid };
  data.entries[String(uid)] = fallback;
  return fallback;
}
function applyEntry(entry, key, spec, wi, recordId, intentKey, chatKey) {
  entry.comment = spec.comment;
  entry.content = spec.content;
  entry.key = spec.keywords;
  entry.constant = Boolean(spec.constant);
  entry.vectorized = Boolean(spec.vectorized);
  entry.selective = !entry.constant;
  entry.disable = false;
  entry.addMemo = true;
  entry.position = wi.world_info_position?.after ?? 1;
  entry.order = spec.order;
  entry.preventRecursion = false;
  entry.excludeRecursion = false;
  entry.delayUntilRecursion = 0;
  entry.extensions ||= {};
  entry.extensions.mirrorAbyssV11 = {
    managed: true,
    key,
    kind: spec.kind,
    version: VERSION,
    chatKey,
    transactionId: recordId,
    intentKey
  };
}
function buildPlan(baseData, recordId, intentKey, chatKey, documents, legacyKeys, wi, name) {
  const data = deepClone(
    baseData && typeof baseData === "object" ? baseData : { entries: {} }
  );
  data.entries ||= {};
  const beforeEntries = subjectEntries(data, chatKey, legacyKeys);
  const desired = new Map(
    documents.map((document2) => [document2.key, document2])
  );
  const ownedByKey = /* @__PURE__ */ new Map();
  const legacyByKey = /* @__PURE__ */ new Map();
  for (const [uid, entry] of Object.entries(data.entries)) {
    const info = managedInfo(entry);
    if (!info?.managed || !info.key) continue;
    const key = String(info.key);
    if (info.chatKey === chatKey) {
      const values = ownedByKey.get(key) ?? [];
      values.push({ uid, entry });
      ownedByKey.set(key, values);
    } else if (!info.chatKey && legacyKeys.has(key)) {
      const values = legacyByKey.get(key) ?? [];
      values.push({ uid, entry });
      legacyByKey.set(key, values);
    }
  }
  const retained = /* @__PURE__ */ new Set();
  const entryIds = [];
  for (const [key, spec] of desired) {
    const owned = ownedByKey.get(key) ?? [];
    const legacy = legacyByKey.get(key) ?? [];
    const pair = owned[0] ?? legacy[0];
    const entry = pair?.entry ?? createEntry(wi, name, data);
    const uid = pair?.uid ?? String(entry.uid);
    retained.add(uid);
    applyEntry(entry, key, spec, wi, recordId, intentKey, chatKey);
    if (Number.isFinite(Number(entry.uid))) entryIds.push(Number(entry.uid));
    for (const duplicate of [
      ...owned.slice(pair && owned[0] === pair ? 1 : 0),
      ...legacy.slice(pair && legacy[0] === pair ? 1 : 0)
    ]) {
      delete data.entries[duplicate.uid];
    }
  }
  for (const [uid, entry] of Object.entries(data.entries)) {
    if (retained.has(uid)) continue;
    if (isOwnedEntry(entry, chatKey) || isLegacyEntry(entry, legacyKeys)) {
      delete data.entries[uid];
    }
  }
  return {
    data,
    beforeEntries,
    entryIds,
    intendedFingerprint: subjectFingerprint(data, chatKey, legacyKeys)
  };
}
function compareEntry(entry, key, spec, record, wi) {
  const expected = { uid: entry.uid };
  applyEntry(
    expected,
    key,
    spec,
    wi,
    record.id,
    record.intentKey,
    record.chatKey
  );
  const fields = [
    "comment",
    "content",
    "key",
    "constant",
    "vectorized",
    "selective",
    "disable",
    "addMemo",
    "position",
    "order",
    "preventRecursion",
    "excludeRecursion",
    "delayUntilRecursion"
  ];
  for (const field2 of fields) {
    if (fingerprint(entry?.[field2]) !== fingerprint(expected?.[field2])) {
      throw new Error(
        `\u4E16\u754C\u4E66\u670D\u52A1\u5668\u6821\u9A8C\u5931\u8D25\uFF1A\u6761\u76EE\u201C${spec.comment || key}\u201D\u5B57\u6BB5 ${field2} \u672A\u6309\u4E8B\u52A1\u5199\u5165`
      );
    }
  }
  if (fingerprint(managedInfo(entry)) !== fingerprint(managedInfo(expected))) {
    throw new Error(
      `\u4E16\u754C\u4E66\u670D\u52A1\u5668\u6821\u9A8C\u5931\u8D25\uFF1A\u6761\u76EE\u201C${spec.comment || key}\u201D\u4E8B\u52A1\u6807\u8BB0\u4E0D\u4E00\u81F4`
    );
  }
}
function verifyServerState(record, data, wi) {
  const legacyKeys = new Set(record.legacyKeys);
  const owned = /* @__PURE__ */ new Map();
  for (const entry of Object.values(data?.entries ?? {})) {
    if (!isOwnedEntry(entry, record.chatKey)) continue;
    const key = String(managedInfo(entry)?.key || "");
    const list2 = owned.get(key) ?? [];
    list2.push(entry);
    owned.set(key, list2);
  }
  const desired = new Map(
    record.desiredDocuments.map((document2) => [document2.key, document2])
  );
  for (const [key, entries] of owned) {
    if (!desired.has(key))
      throw new Error(`\u4E16\u754C\u4E66\u670D\u52A1\u5668\u6821\u9A8C\u5931\u8D25\uFF1A\u65E7\u6258\u7BA1\u6761\u76EE\u201C${key}\u201D\u672A\u5220\u9664`);
    if (entries.length !== 1)
      throw new Error(`\u4E16\u754C\u4E66\u670D\u52A1\u5668\u6821\u9A8C\u5931\u8D25\uFF1A\u6761\u76EE\u201C${key}\u201D\u51FA\u73B0\u91CD\u590D`);
  }
  const entryIds = [];
  for (const [key, spec] of desired) {
    const entries = owned.get(key) ?? [];
    if (entries.length !== 1)
      throw new Error(`\u4E16\u754C\u4E66\u670D\u52A1\u5668\u6821\u9A8C\u5931\u8D25\uFF1A\u7F3A\u5C11\u6761\u76EE\u201C${spec.comment || key}\u201D`);
    compareEntry(entries[0], key, spec, record, wi);
    if (Number.isFinite(Number(entries[0].uid)))
      entryIds.push(Number(entries[0].uid));
  }
  const actualFingerprint = subjectFingerprint(
    data,
    record.chatKey,
    legacyKeys
  );
  if (actualFingerprint !== record.intendedSubjectFingerprint) {
    throw new Error("\u4E16\u754C\u4E66\u670D\u52A1\u5668\u6821\u9A8C\u5931\u8D25\uFF1A\u6258\u7BA1\u6761\u76EE\u96C6\u5408\u4E0E\u51C6\u5907\u9636\u6BB5\u4E0D\u4E00\u81F4");
  }
  return entryIds;
}
function dedicatedLegacyBook(name, scope) {
  const meta = getChatMetadataNamespace();
  if (meta.lorebookManaged === true && (!meta.lorebookChatKey || meta.lorebookChatKey === scope.chatKey))
    return true;
  const suffix = hashText(scope.chatKey);
  return name.endsWith(suffix.slice(0, 8)) || name.endsWith(suffix.slice(0, 10));
}
function legacyKeysForClear(data, name, scope) {
  if (!dedicatedLegacyBook(name, scope)) return [];
  return [
    ...new Set(
      Object.values(data?.entries ?? {}).map((entry) => managedInfo(entry)).filter((info) => info?.managed && info.key && !info.chatKey).map((info) => String(info.key))
    )
  ];
}
async function desiredDocuments(artifact) {
  const settings = getSettings();
  const state2 = await getChatState(artifact.chatKey);
  return buildLorebookDocuments(
    artifact.snapshot,
    state2.smallSummaries,
    state2.largeSummaries,
    state2.eventEntries,
    {
      layout: settings.lorebookLayout,
      vectorize: settings.vectorizeRows,
      latestContinuityConstant: settings.latestContinuityConstant
    }
  ).map((document2) => deepClone(document2));
}
async function prepareOutbox(operation, scope, bookName, documents, artifactMessageKey, signal) {
  assertScope(scope, scope.chatKey, signal);
  const wi = await worldInfoApi();
  const baseData = await loadWorldInfoStrict(bookName, signal);
  assertScope(scope, scope.chatKey, signal);
  const legacyKeys = operation === "sync" ? documents.map((document2) => document2.key) : legacyKeysForClear(baseData, bookName, scope);
  const baseIntentKey = `${operation}:${bookName}:${artifactMessageKey || "maintenance"}:${fingerprint({ documents, legacyKeys })}`;
  let intentKey = baseIntentKey;
  let existing = await findLorebookOutboxByIntent(scope.chatKey, intentKey);
  if (existing?.state === "committed" && existing.metadataAttached) {
    const currentFingerprint = subjectFingerprint(
      baseData,
      scope.chatKey,
      new Set(existing.legacyKeys)
    );
    if (currentFingerprint === existing.intendedSubjectFingerprint)
      return existing;
    if (operation === "sync" && artifactMessageKey) {
      const state2 = await getChatState(scope.chatKey);
      if (state2.latestSnapshotMessageKey && state2.latestSnapshotMessageKey !== artifactMessageKey) {
        throw new StaleTaskError(
          "\u65E7\u6D88\u606F\u7684\u4E16\u754C\u4E66\u4E8B\u52A1\u5DF2\u88AB\u66F4\u65B0\u5FEB\u7167\u53D6\u4EE3\uFF0C\u7981\u6B62\u53CD\u5411\u8986\u76D6\u5F53\u524D\u4E16\u754C\u4E66"
        );
      }
      intentKey = `${baseIntentKey}:reconcile:${currentFingerprint}`;
      existing = await findLorebookOutboxByIntent(scope.chatKey, intentKey);
    }
  }
  if (existing?.state === "committed") return existing;
  if (existing && !TERMINAL_OUTBOX_STATES.has(existing.state)) return existing;
  const id = makeId("lorebook-outbox");
  const plan = buildPlan(
    baseData,
    id,
    intentKey,
    scope.chatKey,
    documents,
    new Set(legacyKeys),
    wi,
    bookName
  );
  const createdAt = nowIso();
  const record = {
    schemaVersion: 1,
    id,
    intentKey,
    operation,
    chatKey: scope.chatKey,
    scopeRevision: scope.revision,
    artifactMessageKey,
    bookName,
    state: "prepared",
    attempts: 0,
    desiredDocuments: documents,
    legacyKeys,
    beforeEntries: plan.beforeEntries,
    baseSubjectFingerprint: subjectFingerprint(
      baseData,
      scope.chatKey,
      new Set(legacyKeys)
    ),
    intendedSubjectFingerprint: plan.intendedFingerprint,
    intendedEntryIds: plan.entryIds,
    createdAt,
    updatedAt: createdAt
  };
  await putLorebookOutbox(record);
  await safeAppendOperationLog(record.chatKey, {
    category: "lorebook",
    action: record.operation,
    resourceId: record.id,
    state: record.state
  });
  return record;
}
function restoreBeforeEntries(currentData, record) {
  const data = deepClone(currentData);
  data.entries ||= {};
  const legacyKeys = new Set(record.legacyKeys);
  for (const [uid, entry] of Object.entries(data.entries)) {
    if (isOwnedEntry(entry, record.chatKey) || isLegacyEntry(entry, legacyKeys)) {
      delete data.entries[uid];
    }
  }
  for (const snapshot of record.beforeEntries) {
    let uid = snapshot.uid;
    if (Object.hasOwn(data.entries, uid)) uid = String(nextUid(data));
    const entry = deepClone(snapshot.entry);
    entry.uid = Number.isFinite(Number(uid)) ? Number(uid) : uid;
    data.entries[uid] = entry;
  }
  return data;
}
async function markConflict(record, detail) {
  record.state = "conflict";
  record.conflictDetail = detail;
  record.error = detail;
  await putLorebookOutbox(record);
  await safeAppendOperationLog(record.chatKey, {
    category: "lorebook",
    action: record.operation,
    resourceId: record.id,
    state: record.state,
    detail
  });
  throw new Error(`\u4E16\u754C\u4E66\u4E8B\u52A1\u51B2\u7A81\uFF1A${detail}`);
}
async function finalizeMetadata(record, scope, lease) {
  assertScope(scope, record.chatKey);
  lease?.assertOwner();
  const wi = await worldInfoApi();
  const context = getContext();
  const meta = getChatMetadataNamespace();
  const metadataKey = wi.METADATA_KEY || "world_info";
  context.chatMetadata ||= {};
  const metadataBefore = deepClone(context.chatMetadata);
  try {
    if (record.operation === "sync") {
      context.chatMetadata[metadataKey] = record.bookName;
      meta.lorebookName = record.bookName;
      meta.lorebookChatKey = record.chatKey;
      meta.lorebookManaged = true;
      meta.lorebookBindingFingerprint = hashText(`${record.chatKey}|${record.bookName}|managed`);
    } else {
      if (context.chatMetadata?.[metadataKey] === record.bookName)
        delete context.chatMetadata[metadataKey];
      delete meta.lorebookName;
      delete meta.lorebookChatKey;
      delete meta.lorebookManaged;
      delete meta.lorebookBindingFingerprint;
    }
    if (fingerprint(context.chatMetadata) !== fingerprint(metadataBefore)) {
      await persistMetadata();
    }
  } catch (error) {
    for (const key of Object.keys(context.chatMetadata))
      delete context.chatMetadata[key];
    Object.assign(context.chatMetadata, metadataBefore);
    throw error;
  }
  record.metadataAttached = true;
  record.error = void 0;
  await putLorebookOutbox(record);
}
async function finalizeCommit(record, scope, serverData, wi, lease) {
  const ids = verifyServerState(record, serverData, wi);
  record.intendedEntryIds = ids;
  record.state = "committed";
  record.committedAt ||= nowIso();
  record.verifiedAt = nowIso();
  record.error = void 0;
  await putLorebookOutbox(record);
  await safeAppendOperationLog(record.chatKey, {
    category: "lorebook",
    action: record.operation,
    resourceId: record.id,
    state: record.state
  });
  await finalizeMetadata(record, scope, lease);
  await emitWorldInfoUpdated(record.bookName, serverData, wi);
  return record;
}
async function conditionalRollback(record, scope, signal, lease) {
  assertScope(scope, record.chatKey, signal);
  lease?.assertOwner();
  const current = await loadWorldInfoStrict(record.bookName, signal);
  assertScope(scope, record.chatKey, signal);
  const legacyKeys = new Set(record.legacyKeys);
  const currentFingerprint = subjectFingerprint(
    current,
    record.chatKey,
    legacyKeys
  );
  if (currentFingerprint !== record.intendedSubjectFingerprint) {
    await markConflict(
      record,
      "\u670D\u52A1\u5668\u4E0A\u7684\u6258\u7BA1\u6761\u76EE\u5728\u5199\u5165\u540E\u53C8\u53D1\u751F\u53D8\u5316\uFF0C\u5DF2\u505C\u6B62\u81EA\u52A8\u56DE\u6EDA\u4EE5\u907F\u514D\u8986\u76D6\u7528\u6237\u6216\u5176\u4ED6\u6269\u5C55\u7684\u4FEE\u6539"
    );
  }
  const restored = restoreBeforeEntries(current, record);
  record.state = "rollback_pending";
  await putLorebookOutbox(record);
  try {
    assertScope(scope, record.chatKey, signal);
    lease?.assertOwner();
    await saveWorldInfoStrict(record.bookName, restored, signal);
    assertScope(scope, record.chatKey, signal);
    const verified = await loadWorldInfoStrict(record.bookName, signal);
    assertScope(scope, record.chatKey, signal);
    if (subjectFingerprint(verified, record.chatKey, legacyKeys) !== record.baseSubjectFingerprint) {
      await markConflict(record, "\u56DE\u6EDA\u540E\u7684\u670D\u52A1\u5668\u72B6\u6001\u4E0E\u4E8B\u52A1\u524D\u5FEB\u7167\u4E0D\u4E00\u81F4");
    }
    record.state = "rolled_back";
    record.rolledBackAt = nowIso();
    await putLorebookOutbox(record);
  } catch (error) {
    if (toErrorMessage(error).startsWith("\u4E16\u754C\u4E66\u4E8B\u52A1\u51B2\u7A81\uFF1A")) throw error;
    record.state = "rollback_pending";
    record.error = `\u56DE\u6EDA\u5C1A\u672A\u786E\u8BA4\uFF1A${toErrorMessage(error)}`;
    await putLorebookOutbox(record);
    throw error;
  }
}
async function executeOutbox(record, scope, signal) {
  assertScope(scope, record.chatKey, signal);
  return lorebookCoordinator().withLease(
    `worldinfo:${record.bookName}`,
    async (lease) => lorebookLocks().withLock(`worldinfo:${record.bookName}`, async () => {
      assertScope(scope, record.chatKey, signal);
      lease.assertOwner();
      const wi = await worldInfoApi();
      let current = await loadWorldInfoStrict(record.bookName, signal);
      assertScope(scope, record.chatKey, signal);
      const legacyKeys = new Set(record.legacyKeys);
      if (record.state === "committed" && record.metadataAttached)
        return record;
      if (record.state === "rollback_pending") {
        const rollbackFingerprint = subjectFingerprint(
          current,
          record.chatKey,
          legacyKeys
        );
        if (rollbackFingerprint === record.baseSubjectFingerprint) {
          record.state = "rolled_back";
          record.rolledBackAt ||= nowIso();
          await putLorebookOutbox(record);
          return record;
        }
        if (rollbackFingerprint === record.intendedSubjectFingerprint) {
          await conditionalRollback(record, scope, signal, lease);
          return record;
        }
        return markConflict(record, "\u5F85\u56DE\u6EDA\u4E8B\u52A1\u7684\u670D\u52A1\u5668\u72B6\u6001\u5DF2\u53D1\u751F\u7B2C\u4E09\u65B9\u53D8\u5316");
      }
      try {
        verifyServerState(record, current, wi);
        return await finalizeCommit(record, scope, current, wi, lease);
      } catch {
      }
      const currentFingerprint = subjectFingerprint(
        current,
        record.chatKey,
        legacyKeys
      );
      if (currentFingerprint !== record.baseSubjectFingerprint) {
        return markConflict(
          record,
          "\u51C6\u5907\u9636\u6BB5\u4E4B\u540E\u6258\u7BA1\u6761\u76EE\u5DF2\u88AB\u5176\u4ED6\u64CD\u4F5C\u4FEE\u6539\uFF1B\u955C\u6E0A\u6CA1\u6709\u8986\u76D6\u8BE5\u53D8\u5316"
        );
      }
      const plan = buildPlan(
        current,
        record.id,
        record.intentKey,
        record.chatKey,
        record.desiredDocuments,
        legacyKeys,
        wi,
        record.bookName
      );
      record.beforeEntries = plan.beforeEntries;
      record.baseSubjectFingerprint = currentFingerprint;
      record.intendedSubjectFingerprint = plan.intendedFingerprint;
      record.intendedEntryIds = plan.entryIds;
      record.state = "committing";
      record.attempts += 1;
      record.lastAttemptAt = nowIso();
      record.error = void 0;
      await putLorebookOutbox(record);
      let saveStarted = false;
      try {
        assertScope(scope, record.chatKey, signal);
        lease.assertOwner();
        saveStarted = true;
        await saveWorldInfoStrict(record.bookName, plan.data, signal);
        assertScope(scope, record.chatKey, signal);
      } catch (error) {
        if (!saveStarted && (error instanceof TaskCancelledError || error instanceof StaleTaskError)) {
          record.state = "cancelled";
          record.error = toErrorMessage(error);
        } else {
          record.state = "verify_pending";
          record.error = `\u63D0\u4EA4\u7ED3\u679C\u5F85\u786E\u8BA4\uFF1A${toErrorMessage(error)}`;
        }
        await putLorebookOutbox(record);
        throw error;
      }
      record.state = "verify_pending";
      await putLorebookOutbox(record);
      try {
        current = await loadWorldInfoStrict(record.bookName, signal);
      } catch (error) {
        record.error = `\u670D\u52A1\u5668\u5DF2\u63A5\u53D7\u5199\u5165\uFF0C\u4F46\u56DE\u8BFB\u5C1A\u672A\u5B8C\u6210\uFF1A${toErrorMessage(error)}`;
        await putLorebookOutbox(record);
        throw error;
      }
      try {
        return await finalizeCommit(record, scope, current, wi, lease);
      } catch (verificationError) {
        record.state = "rollback_pending";
        record.error = toErrorMessage(verificationError);
        await putLorebookOutbox(record);
        await conditionalRollback(record, scope, signal, lease);
        throw verificationError;
      }
    }),
    signal
  );
}
async function updateSyncStateFromRecord(record, error) {
  const state2 = await getChatState(record.chatKey);
  state2.lastOutboxId = record.id;
  state2.lastOutboxState = record.state;
  state2.lastLorebookName = record.bookName;
  if (record.state === "committed" && record.metadataAttached) {
    state2.lastSyncStatus = "success";
    state2.lastSyncAt = record.verifiedAt || record.committedAt || nowIso();
    state2.lastSyncError = void 0;
  } else if (error || record.state === "conflict" || record.state === "rollback_pending" || record.state === "rolled_back") {
    state2.lastSyncStatus = "failed";
    state2.lastSyncError = error || record.error || record.conflictDetail || `Outbox ${record.state}`;
  } else {
    state2.lastSyncStatus = "running";
    state2.lastSyncError = record.error;
  }
  await putChatState(state2);
}
async function syncLorebook(artifact, signal, options = {}) {
  const settings = getSettings();
  if (!settings.lorebookSync) {
    markStage(artifact, "sync", "skipped");
    await putArtifact(artifact);
    return;
  }
  const scope = chatScopeManager.current();
  assertScope(scope, artifact.chatKey, signal);
  markStage(artifact, "sync", "running");
  await putArtifact(artifact);
  const chatState = await getChatState(artifact.chatKey);
  chatState.lastSyncStatus = "running";
  chatState.lastSyncError = void 0;
  await putChatState(chatState);
  let record = null;
  try {
    const name = resolveBookName(scope, true);
    if (!name) throw new Error("\u6CA1\u6709\u53EF\u7528\u7684\u804A\u5929\u4E16\u754C\u4E66");
    const documents = await desiredDocuments(artifact);
    record = await prepareOutbox(
      "sync",
      scope,
      name,
      documents,
      artifact.messageKey,
      signal
    );
    const alreadyCommitted = record.state === "committed" && Boolean(record.metadataAttached);
    await updateSyncStateFromRecord(record);
    record = await executeOutbox(record, scope, signal);
    if (record.state !== "committed" || !record.metadataAttached) {
      throw new Error(record.error || "\u4E16\u754C\u4E66\u4E8B\u52A1\u5C1A\u672A\u5B8C\u6210");
    }
    if (options.forceRefresh && alreadyCommitted) {
      const wi = await worldInfoApi();
      const latestServerData = await loadWorldInfoStrict(record.bookName, signal);
      assertScope(scope, record.chatKey, signal);
      await emitWorldInfoUpdated(record.bookName, latestServerData, wi);
    }
    artifact.lorebookEntryIds = record.intendedEntryIds;
    markStage(artifact, "sync", "success");
    await putArtifact(artifact);
    await updateSyncStateFromRecord(record);
    await pruneLorebookOutbox(artifact.chatKey);
  } catch (error) {
    const message = toErrorMessage(error);
    if (record?.state === "prepared" && (error instanceof TaskCancelledError || error instanceof StaleTaskError)) {
      record.state = "cancelled";
      record.error = message;
      await putLorebookOutbox(record);
    }
    markStage(artifact, "sync", "failed", message);
    await putArtifact(artifact);
    if (record) await updateSyncStateFromRecord(record, message);
    else {
      chatState.lastSyncStatus = "failed";
      chatState.lastSyncError = message;
      await putChatState(chatState);
    }
    throw error;
  }
}
async function recoverLorebookOutboxForCurrentChat(signal) {
  const scope = chatScopeManager.current();
  const records = (await getLorebookOutboxRecords(scope.chatKey)).filter(
    (record) => !TERMINAL_OUTBOX_STATES.has(record.state) || record.state === "committed" && !record.metadataAttached
  ).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, 20);
  let recovered = 0;
  let conflicts = 0;
  let failed = 0;
  for (const original of records) {
    assertScope(scope, scope.chatKey, signal);
    let record = original;
    try {
      record = await executeOutbox(record, scope, signal);
      await updateSyncStateFromRecord(record);
      if (record.state === "committed" && record.metadataAttached) {
        recovered += 1;
        if (record.artifactMessageKey) {
          const artifact = await getArtifact(
            record.chatKey,
            record.artifactMessageKey
          );
          if (artifact) {
            artifact.lorebookEntryIds = record.intendedEntryIds;
            markStage(artifact, "sync", "success");
            await putArtifact(artifact);
          }
        }
      }
    } catch (error) {
      await updateSyncStateFromRecord(record, toErrorMessage(error));
      if (record.state === "conflict") conflicts += 1;
      else failed += 1;
    }
  }
  await pruneLorebookOutbox(scope.chatKey);
  return { recovered, conflicts, failed };
}
async function resolveLorebookConflictForCurrentChat(id, action, signal) {
  const scope = chatScopeManager.current();
  const record = await getLorebookOutbox(scope.chatKey, id);
  if (!record) throw new Error("\u672A\u627E\u5230\u4E16\u754C\u4E66\u4E8B\u52A1\u8BB0\u5F55");
  if (record.state !== "conflict") throw new Error("\u53EA\u6709\u51B2\u7A81\u4E8B\u52A1\u53EF\u4EE5\u4EBA\u5DE5\u5904\u7406");
  record.state = "cancelled";
  record.error = action === "cancel" ? "\u7528\u6237\u786E\u8BA4\u4FDD\u7559\u5F53\u524D\u4E16\u754C\u4E66\u72B6\u6001" : "\u65E7\u51B2\u7A81\u5DF2\u53D6\u6D88\uFF0C\u5C06\u4EE5\u6700\u65B0\u4EA7\u7269\u91CD\u65B0\u5EFA\u7ACB\u4E8B\u52A1";
  await putLorebookOutbox(record);
  await safeAppendOperationLog(record.chatKey, {
    category: "lorebook",
    action: `manual-${action}`,
    resourceId: record.id,
    state: record.state
  });
  if (action === "retry-latest") {
    const state2 = await getChatState(scope.chatKey);
    const messageKey = state2.latestSnapshotMessageKey || record.artifactMessageKey;
    if (!messageKey) throw new Error("\u6CA1\u6709\u53EF\u7528\u4E8E\u91CD\u65B0\u540C\u6B65\u7684\u6700\u65B0\u72B6\u6001\u4EA7\u7269");
    const artifact = await getArtifact(scope.chatKey, messageKey);
    if (!artifact?.snapshot) throw new Error("\u6700\u65B0\u72B6\u6001\u4EA7\u7269\u4E0D\u5B58\u5728\u6216\u6CA1\u6709\u72B6\u6001\u8868");
    await syncLorebook(artifact, signal);
  }
  return record;
}
async function clearManagedLorebookForCurrentChat(detach = true, signal) {
  const scope = chatScopeManager.current();
  assertScope(scope, scope.chatKey, signal);
  const name = resolveBookName(scope, false);
  if (!name) return { name: "", removed: 0 };
  const record = await prepareOutbox(
    "clear",
    scope,
    name,
    [],
    void 0,
    signal
  );
  const removed = record.beforeEntries.length;
  const committed = await executeOutbox(record, scope, signal);
  if (committed.state !== "committed") {
    throw new Error(committed.error || "\u4E16\u754C\u4E66\u6E05\u7406\u4E8B\u52A1\u5C1A\u672A\u5B8C\u6210");
  }
  if (!detach) {
    const wi = await worldInfoApi();
    const context = getContext();
    const meta = getChatMetadataNamespace();
    context.chatMetadata ||= {};
    context.chatMetadata[wi.METADATA_KEY || "world_info"] = name;
    meta.lorebookName = name;
    meta.lorebookChatKey = scope.chatKey;
    meta.lorebookManaged = true;
    await persistMetadata();
  }
  await pruneLorebookOutbox(scope.chatKey);
  return { name, removed };
}

// src/pipeline/lorebook-scheduler.ts
init_utils();
init_repository();
init_task_queue();
async function persistArtifact(artifact) {
  const message = getMessage(artifact.messageIndex);
  if (message && !message.is_user && messageFingerprint(artifact.messageIndex) === artifact.sourceFingerprint) {
    attachArtifactToMessage(message, artifact);
  }
  await putArtifact(artifact);
  await persistChat().catch(() => void 0);
}
var LorebookPublishScheduler = class {
  pending = /* @__PURE__ */ new Map();
  running = /* @__PURE__ */ new Set();
  schedule(artifact, options = {}) {
    const chatKey = artifact.chatKey;
    const previous = this.pending.get(chatKey);
    if (previous?.timer !== void 0) clearTimeout(previous.timer);
    if (previous && previous.artifact.messageKey !== artifact.messageKey) {
      markStage(previous.artifact, "sync", "skipped", "\u5DF2\u5408\u5E76\u5230\u66F4\u65B0\u7684\u4E16\u754C\u4E66\u53D1\u5E03\u4EFB\u52A1");
      void putArtifact(previous.artifact);
    }
    const pending = {
      artifact,
      forceRefresh: Boolean(options.forceRefresh || previous?.forceRefresh)
    };
    this.pending.set(chatKey, pending);
    markStage(artifact, "sync", "queued", "\u7B49\u5F85\u53D1\u5E03\u6700\u65B0\u4E16\u754C\u4E66\u7248\u672C");
    void putArtifact(artifact);
    if (!this.running.has(chatKey)) {
      pending.timer = setTimeout(() => {
        pending.timer = void 0;
        void this.flush(chatKey);
      }, Math.max(0, options.delayMs ?? 750));
    }
  }
  async flush(chatKey) {
    if (this.running.has(chatKey)) return;
    const pending = this.pending.get(chatKey);
    if (!pending) return;
    this.pending.delete(chatKey);
    this.running.add(chatKey);
    const artifact = pending.artifact;
    const key = `lorebook-publish:${chatKey}:${artifact.messageKey}`;
    try {
      await taskQueue.run(
        key,
        `\u53D1\u5E03\u6700\u65B0\u4E16\u754C\u4E66 \xB7 \u7B2C ${artifact.messageIndex + 1} \u6761\u6B63\u6587`,
        "sync",
        async (signal) => {
          if (chatKey !== currentChatKey()) throw new StaleTaskError("\u4E16\u754C\u4E66\u53D1\u5E03\u6240\u5C5E\u804A\u5929\u5DF2\u6539\u53D8");
          const state2 = await getChatState(chatKey);
          if (state2.latestSnapshotMessageKey && state2.latestSnapshotMessageKey !== artifact.messageKey) {
            markStage(artifact, "sync", "skipped", "\u5DF2\u6709\u66F4\u65B0\u7684\u72B6\u6001\u7248\u672C\uFF0C\u65E7\u53D1\u5E03\u4EFB\u52A1\u5DF2\u5408\u5E76");
            await persistArtifact(artifact);
            return;
          }
          try {
            await syncLorebook(artifact, signal, { forceRefresh: pending.forceRefresh });
            await persistArtifact(artifact);
          } catch (error) {
            if (error instanceof StaleTaskError || error instanceof TaskCancelledError) throw error;
            markStage(artifact, "sync", "failed", toErrorMessage(error));
            await persistArtifact(artifact);
            toast("warning", `\u6B63\u6587\u4E0D\u53D7\u5F71\u54CD\uFF1B\u4E16\u754C\u4E66\u53D1\u5E03\u5F85\u91CD\u8BD5\uFF1A${toErrorMessage(error)}`);
          }
        },
        {
          laneKey: `background-io:${chatKey}`,
          priority: "background-io",
          blocking: false,
          sourceRange: { startIndex: artifact.messageIndex, endIndex: artifact.messageIndex },
          progressLabel: "\u5199\u5165\u3001\u56DE\u8BFB\u4E0E\u5237\u65B0"
        }
      );
    } finally {
      this.running.delete(chatKey);
      if (this.pending.has(chatKey)) void this.flush(chatKey);
    }
  }
  cancelChat(chatKey, reason = "\u4E16\u754C\u4E66\u53D1\u5E03\u5DF2\u53D6\u6D88") {
    const pending = this.pending.get(chatKey);
    if (!pending) return 0;
    if (pending.timer !== void 0) clearTimeout(pending.timer);
    this.pending.delete(chatKey);
    markStage(pending.artifact, "sync", "skipped", reason);
    void putArtifact(pending.artifact);
    return 1;
  }
  cancelAllExceptChat(chatKey, reason = "\u804A\u5929\u5DF2\u5207\u6362") {
    let count = 0;
    for (const key of [...this.pending.keys()]) if (key !== chatKey) count += this.cancelChat(key, reason);
    return count;
  }
  pendingCount(chatKey) {
    if (chatKey) return Number(this.pending.has(chatKey)) + Number(this.running.has(chatKey));
    return this.pending.size + this.running.size;
  }
  async waitForIdle(chatKey, timeoutMs = 1e4) {
    const started = Date.now();
    while (this.pending.has(chatKey) || this.running.has(chatKey)) {
      if (Date.now() - started > timeoutMs) throw new Error("\u7B49\u5F85\u4E16\u754C\u4E66\u540E\u53F0\u53D1\u5E03\u5B8C\u6210\u8D85\u65F6");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
};
var lorebookPublishScheduler = new LorebookPublishScheduler();

// src/pipeline/summary.ts
init_utils();

// src/domain/sedimentation.ts
var REMOVABLE_TABLES = /* @__PURE__ */ new Set([
  "spacetime",
  "relationships",
  "items",
  "skills",
  "events",
  "regions"
]);
var SETTLED_STATUS = /(待阶段沉降|不再活跃|已结束|已完成|已关闭|已失效|已销毁|已遗失|已消耗|已解除|已中止|已归档|已替代|resolved|closed|completed|expired|destroyed|lost|consumed|archived|superseded|historical|inactive)/i;
function summaryAbsorbsRow(summary, row) {
  const absorbed = summary.sedimentation?.absorbedRowIds;
  if (absorbed !== void 0) return absorbed.includes(row.id);
  const body = `${summary.title}
${summary.summary}
${summary.sedimentation?.notes.join("\n") ?? ""}`;
  const title = row.title.trim();
  if (title && body.includes(title)) return true;
  const titleParts = title.split(/[｜|↔⇄→←·:：/\\]+/).map((item2) => item2.trim()).filter(Boolean);
  const tokens = [title, ...titleParts, ...row.keywords].map((item2) => item2.trim()).filter((item2) => item2.length >= 2).slice(0, 8);
  return tokens.some((token) => body.includes(token));
}
function canRemoveRow(table, row, snapshot, summary) {
  if (!REMOVABLE_TABLES.has(table)) return false;
  if (row.source === "manual" || row.locked) return false;
  if (summary.sedimentation?.keepActiveRowIds?.includes(row.id)) return false;
  if (!SETTLED_STATUS.test(`${row.status} ${row.content}`)) return false;
  if (!summaryAbsorbsRow(summary, row)) return false;
  return true;
}
function canAdvanceActivity(current, target, row) {
  if (row.source === "manual" || row.locked) return false;
  if (current === "\u5F53\u524D\u5728\u573A" || current === "\u5F53\u524D\u76F8\u5173") return false;
  const order = ["\u79BB\u573A\u4F46\u4ECD\u6D3B\u8DC3", "\u4F11\u7720", "\u957F\u671F\u4F11\u7720", "\u5DF2\u5F52\u6863"];
  const from = order.indexOf(current ?? "\u672A\u6807\u6CE8");
  const to = order.indexOf(target);
  if (to < 0) return false;
  if (current === "\u672A\u6807\u6CE8") return target === "\u4F11\u7720";
  return from >= 0 && to === Math.min(from + 1, order.length - 1);
}
function applySedimentation(snapshot, summary) {
  const plan = summary.sedimentation;
  if (!plan) return normalizeSnapshot(snapshot, snapshot);
  const next = normalizeSnapshot(snapshot, snapshot);
  const requested = new Set(plan.removeRowIds);
  const applied = [];
  const ignored = [];
  let remainingSpacetimeRows = next.spacetime.length;
  for (const table of REMOVABLE_TABLES) {
    next[table] = next[table].filter((row) => {
      if (!requested.has(row.id)) return true;
      if (canRemoveRow(table, row, next, summary)) {
        if (table === "spacetime" && remainingSpacetimeRows <= 1) {
          ignored.push(row.id);
          return true;
        }
        if (table === "spacetime") remainingSpacetimeRows -= 1;
        applied.push(row.id);
        return false;
      }
      ignored.push(row.id);
      return true;
    });
  }
  for (const update of plan.characterActivityUpdates) {
    const row = next.characters.find((item2) => item2.id === update.rowId);
    if (!row) {
      ignored.push(update.rowId);
      continue;
    }
    const current = row.lifecycle?.activity;
    if (!canAdvanceActivity(current, update.activity, row)) {
      ignored.push(update.rowId);
      continue;
    }
    row.lifecycle ||= {
      existence: "\u672A\u6807\u6CE8",
      activity: "\u672A\u6807\u6CE8",
      memory: "\u672A\u6807\u6CE8",
      evidenceLevel: "\u672A\u77E5",
      evidence: "",
      returnConditions: [],
      returnBlockers: []
    };
    row.lifecycle.activity = update.activity;
    row.status = update.activity;
    applied.push(update.rowId);
  }
  for (const rowId of requested) {
    if (!applied.includes(rowId) && !ignored.includes(rowId)) ignored.push(rowId);
  }
  const normalizedPlan = {
    ...plan,
    appliedRowIds: [...new Set(applied)],
    ignoredRowIds: [...new Set(ignored)]
  };
  summary.sedimentation = normalizedPlan;
  return next;
}

// src/domain/summary.ts
init_utils();
function stringList(value, limit = 40, itemLimit = 300) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item2) => safeText(item2, itemLimit).trim()).filter(Boolean))].slice(0, limit);
}
function normalizeActivityUpdates(value) {
  if (!Array.isArray(value)) return [];
  const allowed = /* @__PURE__ */ new Set(["\u4F11\u7720", "\u957F\u671F\u4F11\u7720", "\u5DF2\u5F52\u6863"]);
  return value.map((item2) => item2 && typeof item2 === "object" ? item2 : {}).map((item2) => ({
    rowId: safeText(item2.rowId, 160).trim(),
    activity: safeText(item2.activity, 40).trim(),
    reason: safeText(item2.reason, 500).trim()
  })).filter((item2) => item2.rowId && allowed.has(item2.activity)).slice(0, 30);
}
function normalizeSedimentationPlan(value) {
  if (!value || typeof value !== "object") return void 0;
  const source = value;
  const plan = {
    removeRowIds: stringList(source.removeRowIds, 80, 160),
    characterActivityUpdates: normalizeActivityUpdates(source.characterActivityUpdates),
    notes: stringList(source.notes, 40, 500)
  };
  if (Array.isArray(source.absorbedRowIds)) plan.absorbedRowIds = stringList(source.absorbedRowIds, 120, 160);
  if (Array.isArray(source.keepActiveRowIds)) plan.keepActiveRowIds = stringList(source.keepActiveRowIds, 120, 160);
  return plan;
}

var EVENT_STATUSES = /* @__PURE__ */ new Set(["active", "unresolved", "resolved", "dormant", "historical", "trace"]);
var EVENT_PRECISIONS = ["exact", "compressed", "fuzzy", "trace"];
var EVENT_IMPORTANCE = /* @__PURE__ */ new Set(["critical", "high", "normal", "low"]);
var EVENT_ACTIVATIONS = /* @__PURE__ */ new Set(["constant", "keyword", "vector"]);
var EVENT_PROPAGATION_SCOPES = /* @__PURE__ */ new Set(["private", "local", "regional", "public", "institutional", "unknown"]);
function eventEnum(value, allowed, fallback) {
  const text = safeText(value, 40).trim();
  return allowed.has(text) ? text : fallback;
}
function eventPrecision(value, fallback = "compressed") {
  const text = safeText(value, 40).trim();
  return EVENT_PRECISIONS.includes(text) ? text : fallback;
}
function eventPrecisionRank(value) {
  const index = EVENT_PRECISIONS.indexOf(value);
  return index < 0 ? 1 : index;
}
function eventActivation(value, entry) {
  let activation = eventEnum(value, EVENT_ACTIVATIONS, entry.precision === "fuzzy" || entry.precision === "trace" ? "vector" : "keyword");
  if (entry.precision === "fuzzy" || entry.precision === "trace") activation = "vector";
  const constantAllowed = (entry.importance === "critical" || entry.importance === "high") && (entry.status === "active" || entry.status === "unresolved") && eventPrecisionRank(entry.precision) <= 1;
  if (activation === "constant" && !constantAllowed) activation = entry.precision === "fuzzy" || entry.precision === "trace" ? "vector" : "keyword";
  return activation;
}
function normalizeEventOperation(value, sourceSummaryId, summaryCreatedAt) {
  if (!value || typeof value !== "object") return null;
  const source = value;
  const title = safeText(source.title, 240).trim();
  const facts = safeText(source.facts || source.content || source.summary, 8e3).trim();
  if (!title || !facts) return null;
  const eventId = safeText(source.eventId || source.id, 180).trim() || `event-memory:${hashText(title.toLowerCase())}`;
  const operationText = safeText(source.operation, 30).trim();
  const statusText = safeText(source.status, 40).trim();
  const propagationText = safeText(source.propagation?.scope || source.propagationScope, 40).trim();
  const precisionText = safeText(source.precision, 40).trim();
  const importanceText = safeText(source.importance, 40).trim();
  const activationText = safeText(source.activation, 40).trim();
  return {
    operation: ["upsert", "merge", "remove"].includes(operationText) ? operationText : "upsert",
    eventId,
    mergeFromIds: stringList(source.mergeFromIds, 40, 180),
    title,
    facts,
    participants: stringList(source.participants, 40, 120),
    locations: stringList(source.locations, 24, 160),
    occurredAt: safeText(source.occurredAt, 240).trim(),
    lastConfirmedAt: safeText(source.lastConfirmedAt, 240).trim(),
    status: statusText ? eventEnum(statusText, EVENT_STATUSES, "historical") : void 0,
    propagation: {
      scope: propagationText ? eventEnum(propagationText, EVENT_PROPAGATION_SCOPES, "unknown") : void 0,
      knownBy: stringList(source.propagation?.knownBy || source.knownBy, 60, 160),
      channels: stringList(source.propagation?.channels || source.channels, 40, 160),
      distortions: stringList(source.propagation?.distortions || source.distortions, 30, 300)
    },
    traces: stringList(source.traces, 40, 500),
    impacts: stringList(source.impacts, 40, 500),
    precision: precisionText ? eventPrecision(precisionText) : void 0,
    importance: importanceText ? eventEnum(importanceText, EVENT_IMPORTANCE, "normal") : void 0,
    activation: activationText ? eventEnum(activationText, EVENT_ACTIVATIONS, "keyword") : void 0,
    keywords: stringList(source.keywords, 32, 100),
    sourceRowIds: stringList(source.sourceRowIds, 80, 180),
    sourceFactIds: stringList(source.sourceFactIds, 120, 180),
    sourceSummaryId,
    updatedAt: summaryCreatedAt
  };
}
function normalizeEventOperations(value, sourceSummaryId, summaryCreatedAt) {
  if (!Array.isArray(value)) return [];
  return value.map((item2) => normalizeEventOperation(item2, sourceSummaryId, summaryCreatedAt)).filter(Boolean).slice(0, 80);
}
function normalizeEventEntry(value, previous, sourceSummaryId, updatedAt) {
  const source = value && typeof value === "object" ? value : {};
  const oldFacts = new Set(previous?.sourceFactIds ?? []);
  const incomingFactIds = stringList(source.sourceFactIds, 120, 180);
  const hasNewConfirmation = incomingFactIds.some((id) => !oldFacts.has(id));
  let precision = eventPrecision(source.precision, previous?.precision || "compressed");
  if (previous && !hasNewConfirmation && eventPrecisionRank(precision) < eventPrecisionRank(previous.precision)) precision = previous.precision;
  const entry = {
    eventId: safeText(source.eventId || previous?.eventId, 180).trim(),
    title: safeText(source.title || previous?.title, 240).trim(),
    facts: safeText(source.facts || previous?.facts, 8e3).trim(),
    participants: stringList([...(previous?.participants ?? []), ...(source.participants ?? [])], 60, 120),
    locations: stringList([...(previous?.locations ?? []), ...(source.locations ?? [])], 32, 160),
    occurredAt: safeText(source.occurredAt || previous?.occurredAt, 240).trim(),
    lastConfirmedAt: safeText(source.lastConfirmedAt || previous?.lastConfirmedAt, 240).trim(),
    status: eventEnum(source.status, EVENT_STATUSES, previous?.status || "historical"),
    propagation: {
      scope: eventEnum(source.propagation?.scope || source.propagationScope, EVENT_PROPAGATION_SCOPES, previous?.propagation?.scope || "unknown"),
      knownBy: stringList([...(previous?.propagation?.knownBy ?? []), ...(source.propagation?.knownBy ?? source.knownBy ?? [])], 80, 160),
      channels: stringList([...(previous?.propagation?.channels ?? []), ...(source.propagation?.channels ?? source.channels ?? [])], 50, 160),
      distortions: stringList([...(previous?.propagation?.distortions ?? []), ...(source.propagation?.distortions ?? source.distortions ?? [])], 40, 300)
    },
    traces: stringList([...(previous?.traces ?? []), ...(source.traces ?? [])], 60, 500),
    impacts: stringList([...(previous?.impacts ?? []), ...(source.impacts ?? [])], 60, 500),
    precision,
    importance: eventEnum(source.importance, EVENT_IMPORTANCE, previous?.importance || "normal"),
    activation: "keyword",
    keywords: stringList([source.title, ...(previous?.keywords ?? []), ...(source.keywords ?? []), ...(source.participants ?? []), ...(source.locations ?? [])], 40, 100),
    sourceRowIds: stringList([...(previous?.sourceRowIds ?? []), ...(source.sourceRowIds ?? [])], 120, 180),
    sourceFactIds: stringList([...(previous?.sourceFactIds ?? []), ...incomingFactIds], 180, 180),
    sourceSummaryIds: stringList([...(previous?.sourceSummaryIds ?? []), sourceSummaryId || source.sourceSummaryId], 120, 180),
    createdAt: previous?.createdAt || updatedAt || nowIso(),
    updatedAt: updatedAt || source.updatedAt || nowIso()
  };
  entry.activation = eventActivation(source.activation || previous?.activation, entry);
  return entry.eventId && entry.title && entry.facts ? entry : null;
}
function removableEvent(entry) {
  return entry && entry.importance === "low" && entry.status === "trace" && !entry.impacts.length && entry.precision === "trace";
}
function applyEventOperations(registry, operations, sourceSummaryId, updatedAt) {
  const map = new Map((registry ?? []).map((entry) => [entry.eventId, deepClone(entry)]));
  for (const operation of operations ?? []) {
    const existing = map.get(operation.eventId);
    if (operation.operation === "remove") {
      if (removableEvent(existing)) map.delete(operation.eventId);
      continue;
    }
    const mergedSources = operation.operation === "merge" ? operation.mergeFromIds.map((id) => map.get(id)).filter(Boolean) : [];
    const base = existing || mergedSources[0];
    const combined = {
      ...operation,
      participants: [...mergedSources.flatMap((entry) => entry.participants), ...operation.participants],
      locations: [...mergedSources.flatMap((entry) => entry.locations), ...operation.locations],
      propagation: {
        scope: operation.propagation.scope || mergedSources[0]?.propagation?.scope,
        knownBy: [...mergedSources.flatMap((entry) => entry.propagation.knownBy), ...operation.propagation.knownBy],
        channels: [...mergedSources.flatMap((entry) => entry.propagation.channels), ...operation.propagation.channels],
        distortions: [...mergedSources.flatMap((entry) => entry.propagation.distortions), ...operation.propagation.distortions]
      },
      traces: [...mergedSources.flatMap((entry) => entry.traces), ...operation.traces],
      impacts: [...mergedSources.flatMap((entry) => entry.impacts), ...operation.impacts],
      sourceRowIds: [...mergedSources.flatMap((entry) => entry.sourceRowIds), ...operation.sourceRowIds],
      sourceFactIds: [...mergedSources.flatMap((entry) => entry.sourceFactIds), ...operation.sourceFactIds]
    };
    const entry = normalizeEventEntry(combined, base, sourceSummaryId, updatedAt);
    if (!entry) continue;
    for (const id of operation.mergeFromIds) if (id !== entry.eventId) map.delete(id);
    map.set(entry.eventId, entry);
  }
  const values = [...map.values()];
  const protectedEntries = values.filter((entry) => entry.importance === "critical" || entry.importance === "high" || entry.status === "active" || entry.status === "unresolved");
  const protectedIds = new Set(protectedEntries.map((entry) => entry.eventId));
  const remainder = values.filter((entry) => !protectedIds.has(entry.eventId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return [...protectedEntries, ...remainder].slice(0, 320);
}
function normalizeEventUpdates(value) {
  if (!Array.isArray(value)) return [];
  const output = [];
  for (const item2 of value) {
    const source = item2 && typeof item2 === "object" ? item2 : {};
    const eventId = safeText(source.eventId, 180).trim();
    if (!eventId) continue;
    const actionText = safeText(source.action, 30).trim();
    const statusText = safeText(source.status, 40).trim();
    const precisionText = safeText(source.precision, 40).trim();
    const activationText = safeText(source.activation, 40).trim();
    output.push({
      action: ["keep", "sediment", "remove"].includes(actionText) ? actionText : "keep",
      eventId,
      facts: safeText(source.facts, 8e3).trim(),
      status: statusText ? eventEnum(statusText, EVENT_STATUSES, "historical") : void 0,
      precision: precisionText ? eventPrecision(precisionText) : void 0,
      activation: activationText ? eventEnum(activationText, EVENT_ACTIVATIONS, "vector") : void 0,
      reason: safeText(source.reason, 500).trim()
    });
  }
  return output.slice(0, 160);
}
function applyEventUpdates(registry, updates, sourceLargeSummaryId, updatedAt) {
  const map = new Map((registry ?? []).map((entry) => [entry.eventId, deepClone(entry)]));
  for (const update of updates ?? []) {
    const existing = map.get(update.eventId);
    if (!existing) continue;
    if (update.action === "remove") {
      if (removableEvent(existing)) map.delete(update.eventId);
      continue;
    }
    if (update.action !== "sediment") continue;
    const requestedPrecision = eventPrecision(update.precision, existing.precision);
    const precision = EVENT_PRECISIONS[Math.max(eventPrecisionRank(existing.precision), eventPrecisionRank(requestedPrecision))];
    const entry = normalizeEventEntry({
      ...existing,
      facts: update.facts || existing.facts,
      status: update.status || existing.status,
      precision,
      activation: update.activation || (eventPrecisionRank(precision) >= 2 ? "vector" : existing.activation)
    }, existing, sourceLargeSummaryId, updatedAt);
    if (entry) map.set(entry.eventId, entry);
  }
  return [...map.values()].slice(0, 320);
}
function rebuildEventEntries(smallSummaries, largeSummaries) {
  let registry = [];
  for (const summary of smallSummaries ?? []) registry = applyEventOperations(registry, summary.eventOperations ?? [], summary.id, summary.createdAt);
  for (const summary of largeSummaries ?? []) registry = applyEventUpdates(registry, summary.eventUpdates ?? [], summary.id, summary.createdAt);
  return registry;
}
var CATEGORIES = /* @__PURE__ */ new Set([
  "world",
  "character",
  "relationship",
  "event",
  "region",
  "item",
  "skill",
  "historical",
  "unresolved",
  "other"
]);
var PERMANENCE = /* @__PURE__ */ new Set(["stable", "irreversible", "long-term", "unresolved"]);
function normalizeCategory(value) {
  const category = safeText(value, 40).trim();
  return CATEGORIES.has(category) ? category : "other";
}
function normalizePermanence(value) {
  const permanence = safeText(value, 40).trim();
  return PERMANENCE.has(permanence) ? permanence : "long-term";
}
function normalizeLongTermRecord(value, fallbackSourceSummaryIds = []) {
  if (!value || typeof value !== "object") return null;
  const source = value;
  const title = safeText(source.title, 240).trim();
  const content = safeText(source.content, 4e3).trim();
  if (!title || !content) return null;
  const requestedId = safeText(source.recordId, 180).trim();
  const recordId = requestedId || `long:${hashText(`${normalizeCategory(source.category)}|${title}`)}`;
  return {
    recordId,
    category: normalizeCategory(source.category),
    title,
    content,
    keywords: stringList(source.keywords, 24, 80),
    permanence: normalizePermanence(source.permanence),
    sourceRowIds: stringList(source.sourceRowIds, 40, 180),
    sourceFactIds: stringList(source.sourceFactIds, 80, 180),
    sourceSummaryIds: stringList(source.sourceSummaryIds, 80, 180).length ? stringList(source.sourceSummaryIds, 80, 180) : [...fallbackSourceSummaryIds],
    updatedAt: safeText(source.updatedAt, 80).trim() || nowIso()
  };
}
function normalizeLongTermCandidates(value, sourceSummaryIds) {
  if (!Array.isArray(value)) return [];
  const byId = /* @__PURE__ */ new Map();
  for (const item2 of value) {
    const record = normalizeLongTermRecord(item2, sourceSummaryIds);
    if (record) byId.set(record.recordId, record);
  }
  return [...byId.values()].slice(0, 80);
}
function normalizeLongTermOperations(value) {
  if (!Array.isArray(value)) return [];
  const output = [];
  for (const item2 of value) {
    if (!item2 || typeof item2 !== "object") continue;
    const source = item2;
    const action = safeText(source.action, 30).trim();
    if (!["upsert", "remove", "merge"].includes(action)) continue;
    const recordId = safeText(source.recordId, 180).trim();
    if (!recordId) continue;
    output.push({
      action,
      recordId,
      sourceRecordIds: stringList(source.sourceRecordIds, 40, 180),
      category: source.category === void 0 ? void 0 : normalizeCategory(source.category),
      title: safeText(source.title, 240).trim() || void 0,
      content: safeText(source.content, 4e3).trim() || void 0,
      keywords: Array.isArray(source.keywords) ? stringList(source.keywords, 24, 80) : void 0,
      permanence: source.permanence === void 0 ? void 0 : normalizePermanence(source.permanence),
      reason: safeText(source.reason, 500).trim() || void 0
    });
  }
  return output.slice(0, 160);
}
function legacyLongTermRecord(previous) {
  if (!previous?.summary.trim()) return [];
  return [{
    recordId: `legacy:${previous.id}`,
    category: "historical",
    title: previous.title || "\u65E2\u6709\u957F\u671F\u8109\u7EDC",
    content: previous.summary,
    keywords: [...previous.keywords],
    permanence: "long-term",
    sourceRowIds: [],
    sourceFactIds: [],
    sourceSummaryIds: [...previous.sourceKeys],
    updatedAt: previous.createdAt
  }];
}
function longTermRecordsFromPrevious(previous) {
  const records = previous?.longTermRecords?.length ? previous.longTermRecords : legacyLongTermRecord(previous);
  return records.map((record) => ({ ...record, keywords: [...record.keywords], sourceRowIds: [...record.sourceRowIds], sourceFactIds: [...record.sourceFactIds], sourceSummaryIds: [...record.sourceSummaryIds] }));
}
function operationRecord(operation, existing, sourceSummaryIds) {
  const title = operation.title || existing?.title || "";
  const content = operation.content || existing?.content || "";
  if (!title || !content) return null;
  return {
    recordId: operation.recordId,
    category: operation.category || existing?.category || "other",
    title,
    content,
    keywords: operation.keywords ? [...operation.keywords] : [...existing?.keywords ?? []],
    permanence: operation.permanence || existing?.permanence || "long-term",
    sourceRowIds: [...existing?.sourceRowIds ?? []],
    sourceFactIds: [...existing?.sourceFactIds ?? []],
    sourceSummaryIds: [.../* @__PURE__ */ new Set([...existing?.sourceSummaryIds ?? [], ...sourceSummaryIds])],
    updatedAt: nowIso()
  };
}
function applyLongTermOperations(input) {
  const records = new Map(longTermRecordsFromPrevious(input.previous).map((record) => [record.recordId, record]));
  const candidatesById = new Map(input.candidates.map((record) => [record.recordId, record]));
  const handled = /* @__PURE__ */ new Set();
  for (const operation of input.operations) {
    if (operation.action === "remove") {
      const existing2 = records.get(operation.recordId) ?? candidatesById.get(operation.recordId);
      if (existing2?.permanence === "irreversible") {
        records.set(existing2.recordId, { ...existing2, sourceSummaryIds: [.../* @__PURE__ */ new Set([...existing2.sourceSummaryIds, ...input.sourceSummaryIds])] });
      } else {
        records.delete(operation.recordId);
      }
      handled.add(operation.recordId);
      continue;
    }
    if (operation.action === "merge") {
      const sources = operation.sourceRecordIds ?? [];
      const mergedFrom = sources.map((id) => records.get(id) ?? candidatesById.get(id)).filter((item2) => Boolean(item2));
      const existing2 = records.get(operation.recordId) ?? candidatesById.get(operation.recordId) ?? mergedFrom[0];
      const record2 = operationRecord(operation, existing2, input.sourceSummaryIds);
      if (!record2) continue;
      record2.sourceRowIds = [...new Set(mergedFrom.flatMap((item2) => item2.sourceRowIds))];
      record2.sourceFactIds = [...new Set(mergedFrom.flatMap((item2) => item2.sourceFactIds))];
      record2.sourceSummaryIds = [.../* @__PURE__ */ new Set([...record2.sourceSummaryIds, ...mergedFrom.flatMap((item2) => item2.sourceSummaryIds)])];
      if (mergedFrom.some((item2) => item2.permanence === "irreversible")) record2.permanence = "irreversible";
      for (const id of sources) records.delete(id);
      records.set(record2.recordId, record2);
      sources.forEach((id) => handled.add(id));
      handled.add(record2.recordId);
      continue;
    }
    const existing = records.get(operation.recordId) ?? candidatesById.get(operation.recordId);
    const record = operationRecord(operation, existing, input.sourceSummaryIds);
    if (record) records.set(record.recordId, record);
    handled.add(operation.recordId);
  }
  for (const candidate of input.candidates) {
    if (!records.has(candidate.recordId) && !handled.has(candidate.recordId)) {
      records.set(candidate.recordId, {
        ...candidate,
        sourceSummaryIds: [.../* @__PURE__ */ new Set([...candidate.sourceSummaryIds, ...input.sourceSummaryIds])],
        updatedAt: nowIso()
      });
    }
  }
  const values = [...records.values()];
  if (values.length <= 320) return values;
  const protectedRecords = values.filter((record) => record.permanence === "irreversible" || record.permanence === "stable");
  const protectedIds = new Set(protectedRecords.map((record) => record.recordId));
  const remainder = values.filter((record) => !protectedIds.has(record.recordId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return [...protectedRecords, ...remainder].slice(0, 320);
}
var CATEGORY_LABELS = {
  world: "\u4E16\u754C\u4E0E\u957F\u671F\u89C4\u5219",
  character: "\u4EBA\u7269\u957F\u671F\u72B6\u6001",
  relationship: "\u957F\u671F\u5173\u7CFB",
  event: "\u4E8B\u4EF6\u4E0E\u6D41\u7A0B\u7ED3\u679C",
  region: "\u533A\u57DF\u957F\u671F\u53D8\u5316",
  item: "\u7269\u54C1\u4E0E\u8D44\u6E90\u7ED3\u679C",
  skill: "\u6280\u80FD\u4E0E\u80FD\u529B\u7ED3\u679C",
  historical: "\u5386\u53F2\u7ED3\u679C",
  unresolved: "\u957F\u671F\u672A\u51B3\u4E8B\u9879",
  other: "\u5176\u4ED6\u957F\u671F\u4E8B\u5B9E"
};
function renderLongTermSummary(records) {
  const groups = /* @__PURE__ */ new Map();
  for (const record of records) {
    const values = groups.get(record.category) ?? [];
    values.push(record);
    groups.set(record.category, values);
  }
  return Object.keys(CATEGORY_LABELS).map((category) => {
    const values = groups.get(category);
    if (!values?.length) return "";
    return `\u3010${CATEGORY_LABELS[category]}\u3011
${values.map((record) => `- ${record.title}\uFF1A${record.content}`).join("\n")}`;
  }).filter(Boolean).join("\n\n");
}
function normalizeSummary(value, kind, sourceKeys, previousLargeSummaryId) {
  const id = makeId(kind);
  const createdAt = nowIso();
  return {
    id,
    kind,
    title: safeText(value.title || (kind === "small" ? "\u9636\u6BB5\u6C89\u964D" : "\u957F\u671F\u6C89\u964D"), 240).trim(),
    summary: safeText(value.summary || "", 3e4).trim(),
    keywords: Array.isArray(value.keywords) ? [...new Set(value.keywords.map((item2) => safeText(item2, 80).trim()).filter(Boolean))].slice(0, 24) : [],
    sourceKeys,
    createdAt,
    sedimentation: kind === "small" ? normalizeSedimentationPlan(value.sedimentation) : void 0,
    eventOperations: kind === "small" ? normalizeEventOperations(value.eventEntries, id, createdAt) : void 0,
    longTermCandidates: kind === "small" ? normalizeLongTermCandidates(value.longTermCandidates, [id]) : void 0,
    previousLargeSummaryId: kind === "large" ? previousLargeSummaryId : void 0
  };
}
function normalizeLargeSummaryUpdate(input) {
  const operations = normalizeLongTermOperations(input.value.operations);
  const records = operations.length ? applyLongTermOperations({ previous: input.previous, operations, candidates: input.candidates, sourceSummaryIds: input.sourceKeys }) : (() => {
    const summary = safeText(input.value.summary, 3e4).trim();
    if (summary && !input.candidates.length) {
      const fallback = {
        recordId: `legacy-generated:${hashText(summary)}`,
        category: "historical",
        title: safeText(input.value.title || "\u957F\u671F\u6C89\u964D", 240).trim(),
        content: summary,
        keywords: stringList(input.value.keywords, 24, 80),
        permanence: "long-term",
        sourceRowIds: [],
        sourceFactIds: [],
        sourceSummaryIds: [...input.sourceKeys],
        updatedAt: nowIso()
      };
      return applyLongTermOperations({ previous: input.previous, operations: [], candidates: [fallback], sourceSummaryIds: input.sourceKeys });
    }
    return applyLongTermOperations({ previous: input.previous, operations: [], candidates: input.candidates, sourceSummaryIds: input.sourceKeys });
  })();
  return {
    id: makeId("large"),
    kind: "large",
    title: safeText(input.value.title || "\u7D2F\u8BA1\u957F\u671F\u6C89\u964D", 240).trim(),
    summary: renderLongTermSummary(records),
    keywords: [.../* @__PURE__ */ new Set([
      ...stringList(input.value.keywords, 24, 80),
      ...records.flatMap((record) => record.keywords)
    ])].slice(0, 24),
    sourceKeys: [...input.sourceKeys],
    createdAt: nowIso(),
    longTermRecords: records,
    longTermOperations: operations,
    eventUpdates: normalizeEventUpdates(input.value.eventUpdates),
    previousLargeSummaryId: input.previous?.id
  };
}

// src/llm/plain-parsers.ts
init_utils();
function legacyObject(raw) {
  const text = cleanProtocolText(raw);
  if (!text.startsWith("{")) return null;
  try {
    return parseJsonObject(text);
  } catch {
    return null;
  }
}
function lifecycleFromBlock(block) {
  const values = {
    existence: field(block, "existence"),
    activity: field(block, "activity"),
    memory: field(block, "memory"),
    evidenceLevel: field(block, "evidence_level", "evidenceLevel"),
    evidence: field(block, "evidence"),
    returnConditions: listField(block, "return_conditions", "returnConditions"),
    returnBlockers: listField(block, "return_blockers", "returnBlockers")
  };
  return Object.values(values).some((value) => Array.isArray(value) ? value.length : Boolean(value)) ? values : void 0;
}
function sedimentationFromBlock(block) {
  return {
    absorbedRowIds: listField(block, "absorbed_row_ids", "absorbedRowIds"),
    keepActiveRowIds: listField(block, "keep_active_row_ids", "keepActiveRowIds"),
    removeRowIds: listField(block, "remove_row_ids", "removeRowIds"),
    characterActivityUpdates: blocks(block, "character_activity").map((item2) => ({
      rowId: field(item2, "row_id", "rowId"),
      activity: field(item2, "activity"),
      reason: field(item2, "reason")
    })),
    notes: listField(block, "notes", "note")
  };
}
function longTermCandidate(block) {
  return {
    recordId: field(block, "record_id", "recordId"),
    category: field(block, "category"),
    title: field(block, "title"),
    content: field(block, "content"),
    keywords: listField(block, "keywords"),
    permanence: field(block, "permanence"),
    sourceRowIds: listField(block, "source_row_ids", "sourceRowIds"),
    sourceFactIds: listField(block, "source_fact_ids", "sourceFactIds")
  };
}
function eventEntryFromBlock(block) {
  return {
    operation: field(block, "operation"),
    eventId: field(block, "event_id", "eventId"),
    mergeFromIds: listField(block, "merge_from_ids", "mergeFromIds"),
    title: field(block, "title"),
    facts: field(block, "facts", "content"),
    participants: listField(block, "participants"),
    locations: listField(block, "locations"),
    occurredAt: field(block, "occurred_at", "occurredAt"),
    lastConfirmedAt: field(block, "last_confirmed_at", "lastConfirmedAt"),
    status: field(block, "status"),
    propagationScope: field(block, "propagation_scope", "propagationScope"),
    knownBy: listField(block, "known_by", "knownBy"),
    channels: listField(block, "channels"),
    distortions: listField(block, "distortions"),
    traces: listField(block, "traces"),
    impacts: listField(block, "impacts"),
    precision: field(block, "precision"),
    importance: field(block, "importance"),
    activation: field(block, "activation"),
    keywords: listField(block, "keywords"),
    sourceRowIds: listField(block, "source_row_ids", "sourceRowIds"),
    sourceFactIds: listField(block, "source_fact_ids", "sourceFactIds")
  };
}
function eventUpdateFromBlock(block) {
  return {
    action: field(block, "action"),
    eventId: field(block, "event_id", "eventId"),
    facts: field(block, "facts", "content"),
    status: field(block, "status"),
    precision: field(block, "precision"),
    activation: field(block, "activation"),
    reason: field(block, "reason")
  };
}
function parseSmallSummaryText(raw) {
  const legacy = legacyObject(raw);
  if (legacy) return legacy;
  const text = requireProtocol(raw, ["small_summary", "stage_summary"], "\u5C0F\u603B\u7ED3");
  const root2 = firstBlock(text, "small_summary") || firstBlock(text, "stage_summary") || text;
  const sedimentation = firstBlock(root2, "sedimentation");
  return {
    title: field(root2, "title"),
    summary: field(root2, "summary"),
    keywords: listField(root2, "keywords"),
    sedimentation: sedimentation ? sedimentationFromBlock(sedimentation) : void 0,
    eventEntries: blocks(root2, "event_entry").map(eventEntryFromBlock),
    longTermCandidates: blocks(root2, "long_term_candidate").map(longTermCandidate)
  };
}
function parseLargeSummaryText(raw) {
  const legacy = legacyObject(raw);
  if (legacy) return legacy;
  const text = requireProtocol(raw, ["large_summary"], "\u5927\u603B\u7ED3");
  const root2 = firstBlock(text, "large_summary") || text;
  return {
    title: field(root2, "title"),
    keywords: listField(root2, "keywords"),
    operations: blocks(root2, "operation").map((item2) => ({
      action: field(item2, "action"),
      recordId: field(item2, "record_id", "recordId"),
      sourceRecordIds: listField(item2, "source_record_ids", "sourceRecordIds"),
      category: field(item2, "category"),
      title: field(item2, "title"),
      content: field(item2, "content"),
      keywords: listField(item2, "keywords"),
      permanence: field(item2, "permanence"),
      reason: field(item2, "reason")
    })),
    eventUpdates: blocks(root2, "event_update").map(eventUpdateFromBlock)
  };
}
function parseUnifiedFactsText(raw) {
  const legacy = legacyObject(raw);
  if (legacy) return legacy;
  const text = requireProtocol(raw, ["ma_facts", "turn", "fact"], "\u7EDF\u4E00\u4E8B\u5B9E\u63D0\u53D6");
  const root2 = firstBlock(text, "ma_facts") || text;
  const focus = firstBlock(root2, "focus_identity");
  const sedimentation = firstBlock(root2, "sedimentation");
  const stage = firstBlock(root2, "stage_summary");
  return {
    schemaVersion: 2,
    turnMaterials: blocks(root2, "turn").map((item2) => ({
      sourceOrdinal: Number(field(item2, "source_ordinal", "sourceOrdinal")),
      summary: field(item2, "summary"),
      keywords: listField(item2, "keywords")
    })),
    facts: blocks(root2, "fact").map((item2) => ({
      entityId: field(item2, "entity_id", "entityId"),
      entityType: field(item2, "entity_type", "entityType"),
      factType: field(item2, "fact_type", "factType"),
      title: field(item2, "title"),
      status: field(item2, "status"),
      rowLifecycle: lifecycleFromBlock(item2),
      sourceEntityId: field(item2, "source_entity_id", "sourceEntityId"),
      targetEntityId: field(item2, "target_entity_id", "targetEntityId"),
      operation: field(item2, "operation"),
      scope: field(item2, "scope"),
      lifecycle: field(item2, "lifecycle"),
      content: field(item2, "content"),
      keywords: listField(item2, "keywords"),
      residency: field(item2, "residency"),
      allowConstant: booleanField(item2, ["allow_constant", "allowConstant"]),
      playerBindingEvidence: listField(item2, "player_binding_evidence", "playerBindingEvidence"),
      sourceOrdinals: numberListField(item2, "source_ordinals", "sourceOrdinals"),
      confidence: field(item2, "confidence")
    })),
    focusIdentity: focus ? {
      focusId: field(focus, "focus_id", "focusId"),
      canonicalName: field(focus, "canonical_name", "canonicalName", "name"),
      aliases: listField(focus, "aliases")
    } : void 0,
    sedimentation: sedimentation ? sedimentationFromBlock(sedimentation) : void 0,
    stageSummary: stage ? parseSmallSummaryText(`<stage_summary>${stage}</stage_summary>`) : void 0
  };
}

// src/prompts/summary.ts
init_constants();
function join(values) {
  return values?.length ? values.join("\uFF5C") : "\u65E0";
}
function formatPackages(packages) {
  const lines = [];
  for (const pack of packages) {
    lines.push(`\u3010\u4E8B\u5B9E\u5305 ${pack.packageId}\uFF5C\u6D88\u606F ${pack.sourceRange.startIndex + 1}\u2013${pack.sourceRange.endIndex + 1}\u3011`);
    for (const material of pack.turnMaterials) {
      lines.push(`- \u8F6E\u6B21 ${material.sourceMessageIndex + 1}\uFF1A${material.summary}\uFF5C\u5173\u952E\u8BCD=${join(material.keywords)}`);
    }
    for (const fact of pack.facts) {
      lines.push([
        `- \u4E8B\u5B9E ${fact.factId}`,
        `\u5BF9\u8C61=${fact.entityId}`,
        `\u7C7B\u578B=${fact.entityType}/${fact.factType}`,
        fact.title ? `\u540D\u79F0=${fact.title}` : "",
        `\u64CD\u4F5C=${fact.operation}`,
        `\u751F\u547D\u5468\u671F=${fact.lifecycle}`,
        fact.status ? `\u72B6\u6001=${fact.status}` : "",
        `\u5185\u5BB9=${fact.content}`,
        `\u5173\u952E\u8BCD=${join(fact.keywords)}`,
        fact.sourceEntityId ? `\u5173\u7CFB\u8D77\u70B9=${fact.sourceEntityId}` : "",
        fact.targetEntityId ? `\u5173\u7CFB\u7EC8\u70B9=${fact.targetEntityId}` : "",
        `\u53EF\u4FE1\u5EA6=${fact.confidence}`
      ].filter(Boolean).join("\uFF1B"));
    }
  }
  return lines.join("\n");
}
function formatSnapshot(snapshot) {
  const lines = [];
  for (const [table, rows2] of Object.entries(snapshot)) {
    lines.push(`\u3010${TABLE_LABELS[table]} / ${table}\u3011`);
    if (!rows2.length) {
      lines.push("\uFF08\u65E0\uFF09");
      continue;
    }
    for (const row of rows2) {
      lines.push(`- ID=${row.id}\uFF1B\u540D\u79F0=${row.title}\uFF1B\u72B6\u6001=${row.status || "\u672A\u6807\u6CE8"}\uFF1B\u5185\u5BB9=${row.content}\uFF1B\u5173\u952E\u8BCD=${join(row.keywords)}\uFF1B\u4FDD\u62A4=${row.source === "manual" || row.locked ? "\u662F" : "\u5426"}`);
    }
  }
  return lines.join("\n");
}
function formatEventRegistry(entries) {
  if (!entries?.length) return "（无既有事件条目）";
  return entries.map((entry) => `- ID=${entry.eventId}；标题=${entry.title}；状态=${entry.status}；精度=${entry.precision}；注入=${entry.activation}；事实=${entry.facts}；已知者=${join(entry.propagation?.knownBy)}；痕迹=${join(entry.traces)}`).join("\n");
}
function smallSummarySystemPrompt() {
  return `你是镜渊“表格 → 事件记忆”沉降结算器。你只读取已提取事实、当前活跃表格与既有事件条目，不重新解释原始正文，不续写故事，不创造后台变化。

禁止输出 JSON、Markdown 代码块、解释、前言、结语或思考过程。只输出以下纯文本标签协议：

<small_summary>
<title>阶段标题</title>
<summary>阶段概览，只用于玩家查看，不作为世界书发布单元</summary>
<keywords>关键词1｜关键词2</keywords>
<event_entry>
<operation>upsert|merge|remove</operation>
<event_id>稳定事件ID；延续旧事件必须复用既有ID</event_id>
<merge_from_ids>仅 merge 填写，使用｜分隔</merge_from_ids>
<title>事件标题</title>
<facts>正文和表格已经确认的事件事实；不得写猜测或隐藏真相</facts>
<participants>涉及对象，使用｜分隔</participants>
<locations>地点，使用｜分隔</locations>
<occurred_at>发生时间或时间范围；未知则留空</occurred_at>
<last_confirmed_at>最后由本批事实确认的时间；未知则留空</last_confirmed_at>
<status>active|unresolved|resolved|dormant|historical|trace</status>
<propagation_scope>private|local|regional|public|institutional|unknown</propagation_scope>
<known_by>正文明确知道该信息的人或组织</known_by>
<channels>正文明确发生的传播渠道</channels>
<distortions>正文明确出现的误传、偏差或版本差异</distortions>
<traces>留下的记录、物证、传言、流程痕迹或可观察余波</traces>
<impacts>仍持续成立的影响</impacts>
<precision>exact|compressed|fuzzy|trace</precision>
<importance>critical|high|normal|low</importance>
<activation>constant|keyword|vector</activation>
<keywords>触发关键词</keywords>
<source_row_ids>来源表格行ID</source_row_ids>
<source_fact_ids>来源事实ID</source_fact_ids>
</event_entry>
<sedimentation>
<absorbed_row_ids>已被事件条目或阶段概览明确保存结果的行ID</absorbed_row_ids>
<keep_active_row_ids>仍参与当前世界的行ID</keep_active_row_ids>
<remove_row_ids>已吸收且可以退出活跃表格的行ID</remove_row_ids>
<character_activity><row_id>人物行ID</row_id><activity>休眠|长期休眠|已归档</activity><reason>依据</reason></character_activity>
<notes>说明1｜说明2</notes>
</sedimentation>
<long_term_candidate>
<record_id>稳定对象ID或事件ID</record_id>
<category>world|character|relationship|event|region|item|skill|historical|unresolved|other</category>
<title>标题</title><content>长期有效确定事实</content><keywords>关键词</keywords>
<permanence>stable|irreversible|long-term|unresolved</permanence>
<source_row_ids>来源表格行ID</source_row_ids><source_fact_ids>来源事实ID</source_fact_ids>
</long_term_candidate>
</small_summary>

规则：
1. 阶段概览不是实际发布单元；每个可独立触发、更新或沉降的事件必须单独输出 event_entry。
2. 同一事件延续时复用既有 event_id；只有确实属于同一因果对象才 merge。
3. 传播、已知者、渠道、误传、痕迹和影响都必须有本批事实或表格依据；不得后台自动演算。
4. 不输出“下一次复核时间”。只记录发生时间和最后确认时间；后续由正文 AI 对比当前时间判断。
5. 没有新确认时不得把 fuzzy/trace 恢复成 exact；正文出现新的明确证据时可以提高精度。
6. constant 只用于当前仍活跃、重要且必须持续注入的极少数事件；一般事件用 keyword；模糊历史、风声和痕迹用 vector。
7. remove 只用于低重要度、无持续影响、已成为 trace 的条目；否则改为沉降而不是删除。
8. 可退出表格仅限 spacetime、relationships、items、skills、events、regions；不得删除 focus、characters、foundations。
9. 手工或锁定行不得删除、覆盖或降级。仍在进行、影响当前行动或可立即调用的内容不得沉降。
10. 死亡、永久失去、关系断裂等不可逆结果必须先进入事件条目和长期候选，不能只删表格。
11. 列表使用“｜”分隔。`;
}
function smallSummaryPrompt(packages, snapshot, existingEvents) {
  return `请把以下事实素材与活跃表格整理为阶段概览和独立事件条目，并给出安全沉降计划。

【阶段事实素材】
${formatPackages(packages)}

【当前活跃表格】
${formatSnapshot(snapshot)}

【既有事件条目；仅用于稳定ID、延续、传播和精度比较】
${formatEventRegistry(existingEvents)}

只输出 <small_summary> 标签块。`;
}
function largeSummarySystemPrompt() {
  return `你是镜渊“事件总结 → 长期大总结”沉降结算器。你只读取上一版长期记录、本批小总结中的事件条目和长期候选，不读取原始正文或当前表格，不续写故事。

禁止输出 JSON、Markdown 代码块、解释或思考过程。只输出：

<large_summary>
<title>长期脉络标题</title>
<keywords>关键词1｜关键词2</keywords>
<operation>
<action>upsert|remove|merge</action>
<record_id>稳定长期记录ID</record_id>
<source_record_ids>仅 merge 填写</source_record_ids>
<category>world|character|relationship|event|region|item|skill|historical|unresolved|other</category>
<title>记录标题</title><content>长期有效内容</content><keywords>关键词</keywords>
<permanence>stable|irreversible|long-term|unresolved</permanence>
<reason>修改依据</reason>
</operation>
<event_update>
<action>keep|sediment|remove</action>
<event_id>本批小总结中的事件ID</event_id>
<facts>仅 sediment 时填写降精度后的事实，不得补回已模糊细节</facts>
<status>resolved|dormant|historical|trace</status>
<precision>compressed|fuzzy|trace</precision>
<activation>keyword|vector</activation>
<reason>沉降依据</reason>
</event_update>
</large_summary>

规则：
1. 没变化的旧长期记录无需输出，代码自动保留。
2. 大总结只继承小总结事件条目保留的精度，不得恢复姓名、数字、时间、地点等已沉降细节。
3. event_update 只处理本批事件。仍 active/unresolved 或仍影响当前行动的事件必须 keep。
4. 已结束事件可从 exact 降为 compressed；远离当前接触面且仅留风声或痕迹时可降为 fuzzy/trace，并改为 vector。
5. remove 只允许低重要度、无持续影响、已经是 trace 的事件。不可逆事实不得删除。
6. 不得因长期未出现自行判定死亡、失踪、关系终止或传播变化。
7. 临时位置、短期伤势和当前阶段不进入长期层，除非形成长期影响。
8. 列表使用“｜”分隔。`;
}
function formatPrevious(records) {
  if (!records.length) return "（无）";
  return records.map((record) => `- ID=${record.recordId}；类别=${record.category}；标题=${record.title}；永久性=${record.permanence}；内容=${record.content}；关键词=${join(record.keywords)}`).join("\n");
}
function formatSummaries(summaries) {
  return summaries.map((item2) => {
    const events = (item2.eventOperations ?? []).map((event) => `  · 事件ID=${event.eventId}；标题=${event.title}；状态=${event.status}；精度=${event.precision}；重要度=${event.importance}；事实=${event.facts}；传播=${event.propagation.scope}；痕迹=${join(event.traces)}；影响=${join(event.impacts)}`).join("\n");
    return `- 小总结ID=${item2.id}；标题=${item2.title}；概览=${item2.summary}\n${events || "  · 无独立事件条目"}`;
  }).join("\n");
}
function formatCandidates(candidates) {
  if (!candidates.length) return "（无）";
  return candidates.map((record) => `- ID=${record.recordId}；类别=${record.category}；标题=${record.title}；永久性=${record.permanence}；内容=${record.content}；关键词=${join(record.keywords)}`).join("\n");
}
function largeSummaryPrompt(summaries, previousRecords, candidates) {
  return `请根据上一版长期记录与本批小总结中的事件条目，输出长期记录操作和必要的事件沉降操作。

【上一版长期记录】
${formatPrevious(previousRecords)}

【本批小总结与事件条目】
${formatSummaries(summaries)}

【本批长期候选】
${formatCandidates(candidates)}

只输出 <large_summary> 标签块。`;
}

// src/pipeline/summary.ts
init_repository();

// src/pipeline/local-commit.ts
init_utils();
init_chat_scope();
init_repository();
init_task_queue();
function stableValue2(value) {
  if (Array.isArray(value)) return value.map(stableValue2);
  if (value && typeof value === "object") {
    return Object.keys(value).filter((key) => key !== "updatedAt").sort().reduce((result, key) => {
      result[key] = stableValue2(value[key]);
      return result;
    }, {});
  }
  return value;
}
function fingerprint2(value) {
  return hashText(JSON.stringify(stableValue2(value)));
}
function assertScope2(scope, chatKey, signal) {
  if (signal?.aborted) throw new TaskCancelledError(toErrorMessage(signal.reason || "\u672C\u5730\u63D0\u4EA4\u5DF2\u53D6\u6D88"));
  if (scope.chatKey !== chatKey || !chatScopeManager.isCurrent(scope)) {
    throw new StaleTaskError("\u672C\u5730\u63D0\u4EA4\u6240\u5C5E\u804A\u5929\u5DF2\u6539\u53D8");
  }
}
function localLocks() {
  return foundationKernel.services.get(LOCK_MANAGER);
}
function coordinator() {
  return foundationKernel.services.get(CROSS_TAB_COORDINATOR);
}
function matchingMessageIndex(artifact) {
  if (currentChatKey() !== artifact.chatKey) return -1;
  const chat = getChat();
  for (let index = 0; index < chat.length; index += 1) {
    const message = chat[index];
    if (!message || message.is_user) continue;
    const attached = getAttachedArtifact(message);
    if (attached?.messageKey === artifact.messageKey) return index;
    try {
      if (messageIdentity(index) === artifact.messageKey && messageFingerprint(index) === artifact.sourceFingerprint) return index;
    } catch {
    }
  }
  return -1;
}
async function attachCommittedArtifact(record, scope, persistImmediately = true) {
  if (record.messageAttached) return;
  assertScope2(scope, record.chatKey);
  const index = matchingMessageIndex(record.afterArtifact);
  if (index < 0) return;
  const message = getChat()[index];
  attachArtifactToMessage(message, deepClone(record.afterArtifact));
  if (!persistImmediately) return;
  await persistChat();
  record.messageAttached = true;
  record.attachedAt = nowIso();
  await putLocalCommit(record);
}
async function markConflict2(record, detail) {
  record.state = "conflict";
  record.error = detail;
  record.conflictDetail = detail;
  await putLocalCommit(record);
  await safeAppendOperationLog(record.chatKey, {
    category: "local_commit",
    action: record.operation,
    resourceId: record.id,
    state: record.state,
    detail
  });
  throw new Error(`\u672C\u5730\u63D0\u4EA4\u51B2\u7A81\uFF1A${detail}`);
}
async function executeRecord(record, scope, signal, deferMessageSave = false) {
  assertScope2(scope, record.chatKey, signal);
  return coordinator().withLease(`chat-state:${record.chatKey}`, async (lease) => localLocks().withLock(`chat-state:${record.chatKey}`, async () => {
    assertScope2(scope, record.chatKey, signal);
    lease.assertOwner();
    if (record.state === "committed") {
      await attachCommittedArtifact(record, scope, !deferMessageSave);
      return record;
    }
    if (record.state === "cancelled" || record.state === "conflict") return record;
    const currentArtifact2 = await getArtifact(record.chatKey, record.artifactMessageKey);
    const currentState = await getChatState(record.chatKey);
    if (!currentArtifact2) return markConflict2(record, "\u76EE\u6807\u6D88\u606F\u4EA7\u7269\u4E0D\u5B58\u5728\uFF0C\u65E0\u6CD5\u6062\u590D\u603B\u7ED3\u4E8B\u52A1");
    const artifactFp = fingerprint2(currentArtifact2);
    const stateFp = fingerprint2(currentState);
    const artifactIsBefore = artifactFp === record.beforeArtifactFingerprint;
    const artifactIsAfter = artifactFp === record.afterArtifactFingerprint;
    const stateIsBefore = stateFp === record.beforeChatStateFingerprint;
    const stateIsAfter = stateFp === record.afterChatStateFingerprint;
    if (!(artifactIsBefore || artifactIsAfter) || !(stateIsBefore || stateIsAfter)) {
      return markConflict2(record, "\u804A\u5929\u72B6\u6001\u6216\u6D88\u606F\u4EA7\u7269\u5DF2\u88AB\u5176\u4ED6\u64CD\u4F5C\u4FEE\u6539\uFF0C\u672A\u8986\u76D6\u8BE5\u53D8\u5316");
    }
    record.state = "committing";
    record.attempts += 1;
    record.error = void 0;
    await putLocalCommit(record);
    await safeAppendOperationLog(record.chatKey, {
      category: "local_commit",
      action: record.operation,
      resourceId: record.id,
      state: record.state
    });
    assertScope2(scope, record.chatKey, signal);
    lease.assertOwner();
    if (!artifactIsAfter) await putArtifact(deepClone(record.afterArtifact));
    assertScope2(scope, record.chatKey, signal);
    lease.assertOwner();
    if (!stateIsAfter) await putChatState(deepClone(record.afterChatState));
    const verifiedArtifact = await getArtifact(record.chatKey, record.artifactMessageKey);
    const verifiedState = await getChatState(record.chatKey);
    if (!verifiedArtifact || fingerprint2(verifiedArtifact) !== record.afterArtifactFingerprint || fingerprint2(verifiedState) !== record.afterChatStateFingerprint) {
      return markConflict2(record, "\u672C\u5730\u5199\u5165\u56DE\u8BFB\u4E0E\u76EE\u6807\u72B6\u6001\u4E0D\u4E00\u81F4");
    }
    record.state = "committed";
    record.committedAt ||= nowIso();
    record.error = void 0;
    await putLocalCommit(record);
    await attachCommittedArtifact(record, scope, !deferMessageSave);
    await safeAppendOperationLog(record.chatKey, {
      category: "local_commit",
      action: record.operation,
      resourceId: record.id,
      state: record.state
    });
    return record;
  }), signal);
}
async function commitSummaryMutation(input) {
  const scope = chatScopeManager.current();
  assertScope2(scope, input.artifact.chatKey, input.signal);
  let record = await findLocalCommitByIntent(input.artifact.chatKey, input.intentKey);
  if (!record || record.state === "cancelled" || record.state === "conflict") {
    const createdAt = nowIso();
    record = {
      schemaVersion: 1,
      id: makeId("local-commit"),
      intentKey: input.intentKey,
      operation: input.operation,
      chatKey: input.artifact.chatKey,
      scopeRevision: scope.revision,
      artifactMessageKey: input.artifact.messageKey,
      state: "prepared",
      attempts: 0,
      beforeArtifact: deepClone(input.beforeArtifact),
      afterArtifact: deepClone(input.afterArtifact),
      beforeChatState: deepClone(input.beforeChatState),
      afterChatState: deepClone(input.afterChatState),
      beforeArtifactFingerprint: fingerprint2(input.beforeArtifact),
      afterArtifactFingerprint: fingerprint2(input.afterArtifact),
      beforeChatStateFingerprint: fingerprint2(input.beforeChatState),
      afterChatStateFingerprint: fingerprint2(input.afterChatState),
      messageAttached: false,
      createdAt,
      updatedAt: createdAt
    };
    await putLocalCommit(record);
    await safeAppendOperationLog(record.chatKey, {
      category: "local_commit",
      action: record.operation,
      resourceId: record.id,
      state: record.state
    });
  }
  const committed = await executeRecord(record, scope, input.signal, true);
  Object.assign(input.artifact, deepClone(committed.afterArtifact));
  await pruneLocalCommits(input.artifact.chatKey);
  return committed;
}
async function confirmLocalCommitsAttachedForArtifact(artifact) {
  const records = (await getLocalCommitRecords(artifact.chatKey)).filter((record) => record.state === "committed" && !record.messageAttached && record.artifactMessageKey === artifact.messageKey);
  if (!records.length) return 0;
  const index = matchingMessageIndex(artifact);
  if (index < 0) return 0;
  const attached = getAttachedArtifact(getChat()[index]);
  if (!attached || attached.chatKey !== artifact.chatKey || attached.messageKey !== artifact.messageKey) return 0;
  for (const record of records) {
    record.messageAttached = true;
    record.attachedAt = nowIso();
    await putLocalCommit(record);
  }
  return records.length;
}
async function recoverLocalCommitsForCurrentChat(signal) {
  const scope = chatScopeManager.current();
  const records = (await getLocalCommitRecords(scope.chatKey)).filter((record) => record.state === "prepared" || record.state === "committing" || record.state === "committed" && !record.messageAttached).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, 30);
  let recovered = 0;
  let conflicts = 0;
  let failed = 0;
  for (const original of records) {
    assertScope2(scope, scope.chatKey, signal);
    try {
      const record = await executeRecord(original, scope, signal);
      if (record.state === "committed") recovered += 1;
      if (record.state === "conflict") conflicts += 1;
    } catch (error) {
      if (original.state === "conflict") conflicts += 1;
      else failed += 1;
      await safeAppendOperationLog(scope.chatKey, {
        category: "recovery",
        action: "local_commit",
        resourceId: original.id,
        state: original.state,
        detail: toErrorMessage(error)
      });
    }
  }
  await pruneLocalCommits(scope.chatKey);
  return { recovered, conflicts, failed };
}
async function cancelLocalCommitConflict(id) {
  const scope = chatScopeManager.current();
  const record = await getLocalCommit(scope.chatKey, id);
  if (!record) throw new Error("\u672A\u627E\u5230\u672C\u5730\u63D0\u4EA4\u8BB0\u5F55");
  if (record.state !== "conflict") throw new Error("\u53EA\u6709\u51B2\u7A81\u8BB0\u5F55\u53EF\u4EE5\u4EBA\u5DE5\u53D6\u6D88");
  record.state = "cancelled";
  record.error = "\u7528\u6237\u786E\u8BA4\u4FDD\u7559\u5F53\u524D\u672C\u5730\u72B6\u6001";
  await putLocalCommit(record);
  await safeAppendOperationLog(record.chatKey, {
    category: "local_commit",
    action: "manual-cancel",
    resourceId: record.id,
    state: record.state
  });
  return record;
}

// src/pipeline/summary-consistency.ts
init_constants();
init_utils();
init_chat_scope();
init_repository();
init_task_queue();
var rebuildOwnerId = makeId("history-rebuild-owner");
var DEFAULT_REBUILD_BATCH_SIZE = 12;
var MAX_BATCH_ATTEMPTS = 2;
function intersects(values, keys) {
  return values.some((value) => keys.has(value));
}
function invalidateSummaryDependencies(smallSummaries, largeSummaries, affectedMessageKeys) {
  const affected = new Set(affectedMessageKeys);
  const invalidatedSmall = smallSummaries.filter((summary) => intersects(summary.sourceKeys, affected));
  const invalidatedSmallIds = new Set(invalidatedSmall.map((summary) => summary.id));
  const keptSmall = smallSummaries.filter((summary) => !invalidatedSmallIds.has(summary.id));
  let firstInvalidLarge = -1;
  const invalidatedLargeIds = /* @__PURE__ */ new Set();
  for (let index = 0; index < largeSummaries.length; index += 1) {
    const summary = largeSummaries[index];
    const directDependencyChanged = intersects(summary.sourceKeys, invalidatedSmallIds);
    const previousChainChanged = Boolean(summary.previousLargeSummaryId && invalidatedLargeIds.has(summary.previousLargeSummaryId));
    if (firstInvalidLarge < 0 && (directDependencyChanged || previousChainChanged)) firstInvalidLarge = index;
    if (firstInvalidLarge >= 0) invalidatedLargeIds.add(summary.id);
  }
  return {
    smallSummaries: keptSmall,
    largeSummaries: firstInvalidLarge < 0 ? [...largeSummaries] : largeSummaries.slice(0, firstInvalidLarge),
    invalidatedSmallSummaryIds: [...invalidatedSmallIds],
    invalidatedLargeSummaryIds: [...invalidatedLargeIds]
  };
}
function assertCurrent(chatKey, signal) {
  if (signal?.aborted) throw new TaskCancelledError(toErrorMessage(signal.reason || "\u5386\u53F2\u91CD\u5EFA\u5DF2\u53D6\u6D88"));
  if (chatKey !== currentChatKey()) throw new StaleTaskError("\u5386\u53F2\u91CD\u5EFA\u6240\u5C5E\u804A\u5929\u5DF2\u6539\u53D8");
}
function coordinator2() {
  return foundationKernel.services.get(CROSS_TAB_COORDINATOR);
}
function locks() {
  return foundationKernel.services.get(LOCK_MANAGER);
}
function assistantIndexesFrom(startIndex) {
  const chat = getChat();
  const output = [];
  for (let index = Math.max(0, startIndex); index < chat.length; index += 1) {
    const message = chat[index];
    if (!message?.is_user && String(message?.mes || "").trim()) output.push(index);
  }
  return output;
}
function latestValidArtifactBefore(startIndex, chatKey) {
  for (let index = Math.min(startIndex - 1, getChat().length - 1); index >= 0; index -= 1) {
    const artifact = getAttachedArtifact(getMessage(index));
    if (artifact?.chatKey === chatKey && artifact.snapshot && artifact.messageKey === messageIdentity(index) && artifact.sourceFingerprint === messageFingerprint(index)) return artifact;
  }
  return null;
}
function allLiveRevisionKeys() {
  return new Set(assistantIndexesFrom(0).map((index) => messageIdentity(index)));
}
function currentArtifactCandidate(index, chatKey) {
  const attached = getAttachedArtifact(getMessage(index));
  if (attached?.chatKey === chatKey && attached.messageKey === messageIdentity(index) && attached.sourceFingerprint === messageFingerprint(index)) return attached;
  return null;
}
async function storedArtifactCandidate(index, chatKey) {
  const attached = currentArtifactCandidate(index, chatKey);
  if (attached) return attached;
  const stored = await getArtifactExact(chatKey, messageIdentity(index));
  if (stored?.chatKey === chatKey && stored.messageKey === messageIdentity(index) && stored.sourceFingerprint === messageFingerprint(index)) return stored;
  return null;
}
function packageIndexes(packageValue, liveIndexByKey) {
  const indexes = packageValue.sourceRange.messageKeys.map((key) => liveIndexByKey.get(key)).filter((index) => index !== void 0);
  return indexes.length === packageValue.sourceRange.messageKeys.length ? indexes : [];
}
function packageMatchesCurrentChat(packageValue, indexes, chatKey) {
  if (packageValue.chatKey !== chatKey || !indexes.length) return false;
  if (packageValue.sourceRange.messageKeys.length !== indexes.length) return false;
  if (packageValue.sourceRevisions.length !== indexes.length) return false;
  return indexes.every((index, ordinal) => packageValue.sourceRange.messageKeys[ordinal] === messageIdentity(index) && packageValue.sourceRevisions[ordinal] === messageFingerprint(index));
}
async function inspectHistoryRebuildSources(startIndex, batchSize, state2) {
  const chatKey = state2.chatKey;
  const indexes = assistantIndexesFrom(startIndex);
  const byStart = /* @__PURE__ */ new Map();
  const artifactKeysToRemove = /* @__PURE__ */ new Set();
  const liveIndexByKey = new Map(assistantIndexesFrom(0).map((index) => [messageIdentity(index), index]));
  for (const index of indexes) {
    const message = getMessage(index);
    const attached = getAttachedArtifact(message);
    if (attached?.chatKey === chatKey && (attached.messageKey !== messageIdentity(index) || attached.sourceFingerprint !== messageFingerprint(index))) artifactKeysToRemove.add(attached.messageKey);
    const artifact = await storedArtifactCandidate(index, chatKey);
    const packageValue = artifact?.factPackage;
    if (!artifact || !packageValue || artifact.stages.state?.status !== "success") continue;
    const sourceIndexes = packageIndexes(packageValue, liveIndexByKey);
    if (sourceIndexes[0] < startIndex || !packageMatchesCurrentChat(packageValue, sourceIndexes, chatKey)) continue;
    const existing = byStart.get(sourceIndexes[0]);
    if (!existing || existing.indexes.length < sourceIndexes.length) {
      byStart.set(sourceIndexes[0], {
        indexes: sourceIndexes,
        artifact,
        factPackage: packageValue
      });
    }
  }
  const steps = [];
  const invalidKeys = /* @__PURE__ */ new Set();
  const covered = /* @__PURE__ */ new Set();
  let raw = [];
  const flushRaw = () => {
    if (!raw.length) return;
    for (let offset = 0; offset < raw.length; offset += batchSize) {
      steps.push({ kind: "raw", indexes: raw.slice(offset, offset + batchSize) });
    }
    raw = [];
  };
  let cursor = 0;
  while (cursor < indexes.length) {
    const index = indexes[cursor];
    const cached = byStart.get(index);
    if (cached && cached.indexes.every((value) => indexes.includes(value) && !covered.has(value))) {
      flushRaw();
      const previous = steps.at(-1);
      if (previous?.kind === "cached") {
        previous.indexes.push(...cached.indexes);
        previous.factPackages ||= [];
        previous.factPackages.push(cached.factPackage);
      } else {
        steps.push({ kind: "cached", indexes: [...cached.indexes], factPackages: [cached.factPackage] });
      }
      for (const value of cached.indexes) covered.add(value);
      cursor += cached.indexes.length;
      continue;
    }
    raw.push(index);
    invalidKeys.add(messageIdentity(index));
    const attached = getAttachedArtifact(getMessage(index));
    if (attached?.chatKey === chatKey) artifactKeysToRemove.add(attached.messageKey);
    covered.add(index);
    cursor += 1;
  }
  flushRaw();
  const live = allLiveRevisionKeys();
  for (const key of state2.processedMessageKeys) {
    if (!live.has(key)) invalidKeys.add(key);
  }
  const reusedMessages = steps.filter((step) => step.kind === "cached").reduce((sum, step) => sum + step.indexes.length, 0);
  const rereadMessages = steps.filter((step) => step.kind === "raw").reduce((sum, step) => sum + step.indexes.length, 0);
  return {
    steps,
    invalidKeys,
    artifactKeysToRemove,
    reusedMessages,
    rereadMessages,
    reusedFactPackages: steps.filter((step) => step.kind === "cached").reduce((sum, step) => sum + (step.factPackages?.length ?? 0), 0),
    rawBatches: steps.filter((step) => step.kind === "raw").length
  };
}
async function prepareHistoryRebuild(startIndex, reason, batchSize, signal) {
  const scope = chatScopeManager.current();
  const chatKey = scope.chatKey;
  assertCurrent(chatKey, signal);
  return coordinator2().withLease(`history-rebuild-prepare:${chatKey}`, async (lease) => locks().withLock(`history-rebuild-prepare:${chatKey}`, async () => {
    assertCurrent(chatKey, signal);
    lease.assertOwner();
    const state2 = await getChatState(chatKey);
    const normalizedStart = Math.max(0, Math.min(startIndex, getChat().length));
    const normalizedBatchSize = Math.min(20, Math.max(10, Math.floor(batchSize || DEFAULT_REBUILD_BATCH_SIZE)));
    const inspection = await inspectHistoryRebuildSources(normalizedStart, normalizedBatchSize, state2);
    const affectedKeys = inspection.invalidKeys;
    const invalidation = invalidateSummaryDependencies(state2.smallSummaries, state2.largeSummaries, affectedKeys);
    const previous = latestValidArtifactBefore(normalizedStart, chatKey);
    const affectedIndexes = assistantIndexesFrom(normalizedStart);
    const now = nowIso();
    const record = {
      schemaVersion: 2,
      id: makeId("history-rebuild"),
      chatKey,
      startIndex: normalizedStart,
      endIndex: affectedIndexes.at(-1) ?? normalizedStart,
      nextIndex: affectedIndexes[0] ?? normalizedStart,
      batchSize: normalizedBatchSize,
      completedBatches: 0,
      totalBatches: inspection.steps.length,
      processedMessages: 0,
      totalMessages: affectedIndexes.length,
      reusedMessages: inspection.reusedMessages,
      rereadMessages: inspection.rereadMessages,
      reusedFactPackages: inspection.reusedFactPackages,
      rawBatches: inspection.rawBatches,
      phase: "planning",
      reason,
      state: "pending",
      ownerId: rebuildOwnerId,
      pauseRequested: false,
      cancelRequested: false,
      invalidatedMessageKeys: [...affectedKeys].slice(0, 200),
      invalidatedSmallSummaryIds: invalidation.invalidatedSmallSummaryIds.slice(0, 200),
      invalidatedLargeSummaryIds: invalidation.invalidatedLargeSummaryIds.slice(0, 200),
      createdAt: now,
      updatedAt: now
    };
    const artifactsToRemove = inspection.artifactKeysToRemove;
    for (const index of affectedIndexes) {
      const message = getMessage(index);
      const attached = getAttachedArtifact(message);
      if (attached?.chatKey === chatKey && artifactsToRemove.has(attached.messageKey) && message?.extra?.[MODULE_NAME]) {
        delete message.extra[MODULE_NAME];
      }
    }
    state2.processedMessageKeys = state2.processedMessageKeys.filter((key) => !affectedKeys.has(key));
    state2.smallSummaries = invalidation.smallSummaries;
    state2.largeSummaries = invalidation.largeSummaries;
    state2.eventEntries = rebuildEventEntries(state2.smallSummaries, state2.largeSummaries);
    state2.latestSnapshotMessageKey = previous?.messageKey;
    state2.lastFactMessageIndex = previous?.messageIndex;
    state2.lastFactPackageId = previous?.factPackageId;
    state2.factSchemaVersion = previous?.factPackage?.schemaVersion ?? state2.factSchemaVersion;
    state2.lastSyncStatus = "queued";
    state2.lastSyncError = `\u5386\u53F2\u4F9D\u8D56\u5DF2\u5931\u6548\uFF0C\u7B49\u5F85\u4ECE\u7B2C ${normalizedStart + 1} \u6761\u6D88\u606F\u5206\u6279\u91CD\u5EFA`;
    state2.historyRevision = Math.max(0, state2.historyRevision ?? 0) + 1;
    state2.historyRebuild = record;
    await putChatState(state2);
    await Promise.all([...artifactsToRemove].map((messageKey) => removeArtifact(chatKey, messageKey)));
    await persistChat();
    await safeAppendOperationLog(chatKey, {
      category: "recovery",
      action: "history-rebuild-prepared",
      resourceId: record.id,
      state: record.state,
      detail: `${reason}; start=${normalizedStart}; messages=${affectedIndexes.length}; reuse=${inspection.reusedMessages}; reread=${inspection.rereadMessages}; steps=${inspection.steps.length}`
    });
    return record;
  }), signal);
}
async function updateHistoryRebuild(record, patch) {
  const state2 = await getChatState(record.chatKey);
  const current = state2.historyRebuild;
  if (!current || current.id !== record.id) return record;
  const updated = { ...current, ...patch, updatedAt: nowIso() };
  state2.historyRebuild = updated;
  await putChatState(state2);
  Object.assign(record, updated);
  return record;
}
async function completeHistoryRebuild(record) {
  const state2 = await getChatState(record.chatKey);
  if (state2.historyRebuild?.id === record.id) delete state2.historyRebuild;
  state2.lastSyncError = void 0;
  await putChatState(state2);
  await safeAppendOperationLog(record.chatKey, {
    category: "recovery",
    action: "history-rebuild-completed",
    resourceId: record.id,
    state: "committed",
    detail: `messages=${record.processedMessages ?? 0}; batches=${record.completedBatches ?? 0}`
  });
}
async function currentRecord(record) {
  const state2 = await getChatState(record.chatKey);
  return state2.historyRebuild?.id === record.id ? state2.historyRebuild : record;
}
function retryableBatchError(error) {
  const message = toErrorMessage(error);
  if (/HTML 页面|upstream_html/i.test(message) && !/HTTP (?:502|503|504)/i.test(message)) return false;
  return /502|503|504|timeout|timed out|network|fetch|socket|429|rate.?limit|上游|超时|网络|限流/i.test(message);
}
async function runBatchWithRetry(work, onRetry) {
  let lastError2;
  for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError2 = error;
      if (attempt >= MAX_BATCH_ATTEMPTS || !retryableBatchError(error)) throw error;
      await onRetry(attempt, error);
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError2;
}
function assertHistoryRebuildAccess(state2) {
  const rebuild = state2.historyRebuild;
  if (!rebuild) return;
  if (rebuild.state === "failed") {
    throw new TaskCancelledError("\u5386\u53F2\u4F9D\u8D56\u91CD\u5EFA\u5931\u8D25\uFF0C\u5FC5\u987B\u5148\u6062\u590D\u540E\u624D\u80FD\u7EE7\u7EED\u603B\u7ED3\u6216\u540C\u6B65");
  }
  if (rebuild.state === "paused") {
    throw new TaskCancelledError("\u5386\u53F2\u4F9D\u8D56\u91CD\u5EFA\u5DF2\u6682\u505C\uFF0C\u6062\u590D\u540E\u624D\u80FD\u7EE7\u7EED\u603B\u7ED3\u6216\u540C\u6B65");
  }
  if (rebuild.ownerId && rebuild.ownerId !== rebuildOwnerId) {
    throw new TaskCancelledError("\u53E6\u4E00\u4E2A\u6807\u7B7E\u9875\u6B63\u5728\u91CD\u5EFA\u8BE5\u804A\u5929\u7684\u603B\u7ED3\u4E0E\u72B6\u6001\u4F9D\u8D56");
  }
}
async function requestHistoryRebuildPause() {
  const state2 = await getChatState(currentChatKey());
  if (!state2.historyRebuild) return false;
  state2.historyRebuild.pauseRequested = true;
  state2.historyRebuild.updatedAt = nowIso();
  await putChatState(state2);
  return true;
}
async function requestHistoryRebuildCancel() {
  const state2 = await getChatState(currentChatKey());
  if (!state2.historyRebuild) return false;
  state2.historyRebuild.cancelRequested = true;
  state2.historyRebuild.pauseRequested = true;
  state2.historyRebuild.updatedAt = nowIso();
  await putChatState(state2);
  return true;
}
async function rebuildHistoryFrom(input) {
  const chatKey = currentChatKey();
  return coordinator2().withLease(`history-rebuild:${chatKey}`, async (lease) => {
    assertCurrent(chatKey, input.signal);
    lease.assertOwner();
    const existingState = await getChatState(chatKey);
    const resumable = input.reason === "recovery" ? existingState.historyRebuild : void 0;
    const record = resumable ?? await prepareHistoryRebuild(
      input.startIndex,
      input.reason,
      input.batchSize ?? DEFAULT_REBUILD_BATCH_SIZE,
      input.signal
    );
    record.schemaVersion = 2;
    record.batchSize = Math.min(20, Math.max(10, record.batchSize ?? input.batchSize ?? DEFAULT_REBUILD_BATCH_SIZE));
    record.state = "rebuilding";
    record.ownerId = rebuildOwnerId;
    record.pauseRequested = false;
    record.cancelRequested = false;
    record.error = void 0;
    await updateHistoryRebuild(record, record);
    const allIndexes = assistantIndexesFrom(record.startIndex);
    const nextIndex = record.nextIndex ?? record.startIndex;
    const stateForPlan = await getChatState(chatKey);
    const inspection = await inspectHistoryRebuildSources(nextIndex, record.batchSize, stateForPlan);
    const steps = inspection.steps;
    record.totalMessages = allIndexes.length;
    record.totalBatches = (record.completedBatches ?? 0) + steps.length;
    record.reusedMessages = inspection.reusedMessages;
    record.rereadMessages = inspection.rereadMessages;
    record.reusedFactPackages = inspection.reusedFactPackages;
    record.rawBatches = inspection.rawBatches;
    record.phase = "planning";
    await updateHistoryRebuild(record, {
      totalMessages: record.totalMessages,
      totalBatches: record.totalBatches,
      reusedMessages: record.reusedMessages,
      rereadMessages: record.rereadMessages,
      reusedFactPackages: record.reusedFactPackages,
      rawBatches: record.rawBatches,
      phase: record.phase
    });
    input.onProgress?.({ current: record.processedMessages ?? 0, total: record.totalMessages, label: `\u7F13\u5B58\u4F18\u5148\uFF1A\u590D\u7528 ${inspection.reusedMessages} \u6761\uFF0C\u56DE\u8BFB ${inspection.rereadMessages} \u6761` });
    let rebuilt = record.processedMessages ?? 0;
    let latest = latestValidArtifactBefore(nextIndex, chatKey);
    try {
      for (const step of steps) {
        const indexes = step.indexes;
        assertCurrent(chatKey, input.signal);
        lease.assertOwner();
        const live = await currentRecord(record);
        if (live.pauseRequested || live.cancelRequested) {
          await updateHistoryRebuild(record, {
            state: "paused",
            pauseRequested: false,
            cancelRequested: false,
            error: live.cancelRequested ? "\u5386\u53F2\u91CD\u5EFA\u5DF2\u53D6\u6D88\uFF1B\u53EF\u4ECE\u68C0\u67E5\u70B9\u91CD\u65B0\u5F00\u59CB" : void 0
          });
          return { record, rebuilt, latestArtifact: latest, paused: true };
        }
        record.failedBatchStart = indexes[0];
        await updateHistoryRebuild(record, { failedBatchStart: indexes[0], error: void 0 });
        let batchArtifact = null;
        const cached = step.kind === "cached";
        await updateHistoryRebuild(record, { phase: cached ? "replaying-cache" : "reading-missing" });
        input.onProgress?.({
          current: rebuilt,
          total: record.totalMessages ?? allIndexes.length,
          label: cached ? `\u590D\u7528\u4E8B\u5B9E\u5305\uFF1A\u6D88\u606F ${indexes[0] + 1}\u2013${indexes.at(-1) + 1}` : `\u4EC5\u56DE\u8BFB\u7F3A\u5931\u6B63\u6587\uFF1A\u6D88\u606F ${indexes[0] + 1}\u2013${indexes.at(-1) + 1}`
        });
        await runBatchWithRetry(async () => {
          if (cached && input.replayBatch && step.factPackages?.length) {
            batchArtifact = await input.replayBatch(indexes, step.factPackages, { deferLorebookSync: true, holdDerived: true });
          } else if (input.processBatch) {
            batchArtifact = await input.processBatch(indexes, { deferLorebookSync: true, holdDerived: true });
          } else if (input.processMessage) {
            for (const index of indexes) {
              const artifact = await input.processMessage(index, true, { deferLorebookSync: true });
              if (artifact) batchArtifact = artifact;
            }
          } else {
            throw new Error("\u5386\u53F2\u91CD\u5EFA\u6CA1\u6709\u53EF\u7528\u7684\u6279\u5904\u7406\u5668");
          }
        }, async (attempt, error) => {
          input.onProgress?.({ current: rebuilt, total: record.totalMessages ?? allIndexes.length, label: `${cached ? "\u4E8B\u5B9E\u590D\u7528" : "\u6B63\u6587\u56DE\u8BFB"}\u6279\u6B21 ${indexes[0] + 1}\u2013${indexes.at(-1) + 1} \u91CD\u8BD5`, retries: attempt });
          await updateHistoryRebuild(record, {
            error: `\u6279\u6B21 ${indexes[0] + 1}\u2013${indexes.at(-1) + 1} \u7B2C ${attempt} \u6B21\u5931\u8D25\uFF0C\u6B63\u5728\u91CD\u8BD5\uFF1A${toErrorMessage(error)}`
          });
        });
        if (batchArtifact) latest = deepClone(batchArtifact);
        rebuilt += indexes.length;
        const completedBatches = (record.completedBatches ?? 0) + 1;
        await updateHistoryRebuild(record, {
          nextIndex: indexes.at(-1) + 1,
          processedMessages: rebuilt,
          completedBatches,
          failedBatchStart: void 0,
          error: void 0,
          phase: cached ? "replaying-cache" : "reading-missing"
        });
        input.onProgress?.({ current: rebuilt, total: record.totalMessages ?? allIndexes.length, label: `\u5DF2\u5B8C\u6210 ${completedBatches}/${record.totalBatches ?? 0} \u6279 \xB7 ${cached ? "\u590D\u7528" : "\u56DE\u8BFB"}` });
      }
      assertCurrent(chatKey, input.signal);
      lease.assertOwner();
      if (latest?.snapshot) {
        const needsLongTermUpdate = Boolean(
          (record.rereadMessages ?? 0) > 0 || record.invalidatedSmallSummaryIds.length || record.invalidatedLargeSummaryIds.length
        );
        if (needsLongTermUpdate) {
          await updateHistoryRebuild(record, { phase: "updating-long-term" });
          input.onProgress?.({ current: record.totalMessages ?? rebuilt, total: record.totalMessages ?? rebuilt, label: "\u66F4\u65B0\u957F\u671F\u8109\u7EDC" });
          await input.finalizeDerived?.(latest);
        } else {
          input.onProgress?.({ current: record.totalMessages ?? rebuilt, total: record.totalMessages ?? rebuilt, label: "\u957F\u671F\u603B\u7ED3\u4FDD\u6301\u6709\u6548\uFF0C\u65E0\u9700\u6A21\u578B\u66F4\u65B0" });
        }
        await updateHistoryRebuild(record, { phase: "syncing" });
        input.onProgress?.({ current: record.totalMessages ?? rebuilt, total: record.totalMessages ?? rebuilt, label: "\u53D1\u5E03\u6700\u7EC8\u4E16\u754C\u4E66" });
        await input.syncLatest(latest);
      }
      input.onProgress?.({ current: record.totalMessages ?? rebuilt, total: record.totalMessages ?? rebuilt, label: `\u91CD\u5EFA\u5B8C\u6210\uFF1A\u590D\u7528 ${record.reusedMessages ?? 0} \u6761\uFF0C\u56DE\u8BFB ${record.rereadMessages ?? 0} \u6761\uFF0C\u4E16\u754C\u4E66\u5DF2\u540C\u6B65` });
      await completeHistoryRebuild(record);
      return { record, rebuilt, latestArtifact: latest };
    } catch (error) {
      if (error instanceof TaskCancelledError || error instanceof StaleTaskError) throw error;
      record.state = "failed";
      record.error = toErrorMessage(error);
      await updateHistoryRebuild(record, { state: "failed", error: record.error });
      await safeAppendOperationLog(chatKey, {
        category: "recovery",
        action: "history-rebuild-failed",
        resourceId: record.id,
        state: "failed",
        detail: record.error
      });
      throw error;
    }
  }, input.signal);
}
async function detectHistoryConsistencyStart() {
  const chatKey = currentChatKey();
  const state2 = await getChatState(chatKey);
  const liveKeys = allLiveRevisionKeys();
  const summaryKeys = new Set(state2.smallSummaries.flatMap((summary) => summary.sourceKeys));
  const trackedKeys = /* @__PURE__ */ new Set([...state2.processedMessageKeys, ...summaryKeys]);
  for (const index of assistantIndexesFrom(0)) {
    const liveKey = messageIdentity(index);
    const attached = getAttachedArtifact(getMessage(index));
    if (attached?.messageKey && attached.messageKey !== liveKey && trackedKeys.has(attached.messageKey)) return index;
  }
  for (const key of trackedKeys) if (!liveKeys.has(key)) return 0;
  const hasExistingMemory = Boolean(
    state2.latestSnapshotMessageKey || state2.processedMessageKeys.length || state2.lastFactMessageIndex !== void 0
  );
  if (hasExistingMemory) {
    const tailStart = Math.max(0, (state2.lastFactMessageIndex ?? -1) + 1);
    for (const index of assistantIndexesFrom(tailStart)) {
      if (!state2.processedMessageKeys.includes(messageIdentity(index))) return index;
    }
  }
  return null;
}

// src/pipeline/summary.ts
init_task_queue();
function successfulFactPackageIndex() {
  const chatKey = currentChatKey();
  const byId = /* @__PURE__ */ new Map();
  const byMessageKey = /* @__PURE__ */ new Map();
  for (const message of getChat()) {
    if (message?.is_user) continue;
    const artifact = message?.extra?.mirrorAbyssV11;
    const pack = artifact?.factPackage;
    if (artifact?.chatKey === chatKey && pack?.chatKey === chatKey && artifact.stages.state.status === "success") {
      byId.set(pack.packageId, pack);
    }
  }
  const packages = [...byId.values()].sort((a, b) => a.sourceRange.startIndex - b.sourceRange.startIndex);
  for (const pack of packages) {
    for (const messageKey of pack.sourceRange.messageKeys) byMessageKey.set(messageKey, pack);
  }
  return { packages, byMessageKey };
}
function allConsumedKeys(summaries) {
  return new Set(summaries.flatMap((item2) => item2.sourceKeys));
}
function assertSummaryScope(artifact, signal) {
  if (signal?.aborted) throw new TaskCancelledError("\u603B\u7ED3\u4EFB\u52A1\u5DF2\u53D6\u6D88");
  if (artifact.chatKey !== currentChatKey()) throw new StaleTaskError("\u603B\u7ED3\u4EFB\u52A1\u6240\u5C5E\u804A\u5929\u5DF2\u6539\u53D8");
}
function summaryCoordinator() {
  return foundationKernel.services.get(CROSS_TAB_COORDINATOR);
}
function fallbackLongTermCandidates(summaries) {
  const candidates = [];
  for (const item2 of summaries) {
    if (item2.longTermCandidates?.length) {
      candidates.push(...item2.longTermCandidates.map((record) => ({
        ...record,
        sourceSummaryIds: [...new Set([...record.sourceSummaryIds, item2.id])]
      })));
    }
    for (const event of item2.eventOperations ?? []) {
      const longTerm = event.importance === "critical" || event.importance === "high" || event.status === "unresolved" || event.status === "historical" || event.status === "trace" || event.impacts.length;
      if (!longTerm || event.operation === "remove") continue;
      candidates.push({
        recordId: `event:${event.eventId}`,
        category: event.status === "unresolved" ? "unresolved" : "event",
        title: event.title,
        content: event.facts,
        keywords: [...event.keywords],
        permanence: event.status === "unresolved" ? "unresolved" : "long-term",
        sourceRowIds: [...event.sourceRowIds],
        sourceFactIds: [...event.sourceFactIds],
        sourceSummaryIds: [item2.id],
        updatedAt: item2.createdAt
      });
    }
    if (!item2.eventOperations?.length && !item2.longTermCandidates?.length && item2.summary.trim()) {
      candidates.push({
        recordId: `stage:${item2.id}`,
        category: "historical",
        title: item2.title,
        content: item2.summary,
        keywords: [...item2.keywords],
        permanence: "long-term",
        sourceRowIds: [],
        sourceFactIds: [],
        sourceSummaryIds: [item2.id],
        updatedAt: item2.createdAt
      });
    }
  }
  const byId = new Map();
  for (const candidate of candidates) byId.set(candidate.recordId, candidate);
  return [...byId.values()].slice(0, 160);
}
function pendingSmallSummaries(small, large) {
  const consumed = new Set(large.flatMap((item2) => item2.sourceKeys));
  return small.filter((item2) => !consumed.has(item2.id));
}
async function generateSmallSummary(artifact, force = false, signal, factIndex = successfulFactPackageIndex()) {
  assertSummaryScope(artifact, signal);
  return summaryCoordinator().withLease(`summary:${artifact.chatKey}`, async (lease) => {
    assertSummaryScope(artifact, signal);
    lease.assertOwner();
    const settings = getSettings();
    const chatState = await getChatState(artifact.chatKey);
    assertHistoryRebuildAccess(chatState);
    const consumed = allConsumedKeys(chatState.smallSummaries);
    const pending = factIndex.packages.filter((pack) => pack.sourceRange.messageKeys.some((key) => !consumed.has(key)));
    const threshold = Math.max(1, Number(settings.smallSummaryTurns) || 15);
    const selected = [];
    let count = 0;
    for (const pack of pending) {
      selected.push(pack);
      count += pack.turnMaterials.length;
      if (count >= threshold) break;
    }
    if (!selected.length || !force && count < threshold) return null;
    if (!artifact.snapshot) throw new Error("\u6CA1\u6709\u53EF\u7528\u4E8E\u5C0F\u603B\u7ED3\u6C89\u964D\u7684\u5F53\u524D\u6D3B\u8DC3\u8868\u683C");
    const sourceKeys = selected.flatMap((pack) => pack.turnMaterials.map((item2) => item2.sourceMessageKey));
    const sourceRange = {
      startIndex: selected[0].sourceRange.startIndex,
      endIndex: selected.at(-1).sourceRange.endIndex,
      messageKeys: sourceKeys
    };
    const raw = await generateTask({
      task: "smallSummary",
      systemPrompt: smallSummarySystemPrompt(),
      prompt: smallSummaryPrompt(selected, artifact.snapshot, chatState.eventEntries ?? []),
      signal,
      invocation: {
        sourceRange,
        priority: "background-derived",
        blocking: false,
        coalesceKey: `small-summary:${artifact.chatKey}`,
        outputSchema: "MA_SMALL_SUMMARY_TEXT_V1"
      }
    });
    const parsed = parseSmallSummaryText(raw);
    assertSummaryScope(artifact, signal);
    lease.assertOwner();
    const summary = normalizeSummary(parsed, "small", sourceKeys);
    if (!summary.summary) throw new Error("\u5C0F\u603B\u7ED3\u6A21\u578B\u8FD4\u56DE\u4E86\u7A7A\u603B\u7ED3");
    const intentKey = `small-model:${artifact.chatKey}:${hashText(sourceKeys.join("|"))}`;
    const beforeArtifact = deepClone(artifact);
    const beforeChatState = deepClone(chatState);
    const afterArtifact = deepClone(artifact);
    const afterChatState = deepClone(chatState);
    afterArtifact.snapshot = applySedimentation(afterArtifact.snapshot, summary);
    if (!afterChatState.smallSummaries.some((item2) => item2.sourceKeys.join("|") === summary.sourceKeys.join("|"))) {
      afterChatState.smallSummaries.push(deepClone(summary));
    }
    afterChatState.eventEntries = rebuildEventEntries(afterChatState.smallSummaries, afterChatState.largeSummaries);
    await commitSummaryMutation({
      operation: "small_summary",
      intentKey,
      artifact,
      beforeArtifact,
      afterArtifact,
      beforeChatState,
      afterChatState,
      signal
    });
    return summary;
  }, signal);
}
async function generateLargeSummary(artifact, force = false, signal, factIndex = successfulFactPackageIndex()) {
  assertSummaryScope(artifact, signal);
  return summaryCoordinator().withLease(`summary:${artifact.chatKey}`, async (lease) => {
    assertSummaryScope(artifact, signal);
    lease.assertOwner();
    const settings = getSettings();
    const chatState = await getChatState(artifact.chatKey);
    assertHistoryRebuildAccess(chatState);
    const pending = pendingSmallSummaries(chatState.smallSummaries, chatState.largeSummaries);
    const threshold = Math.max(1, Number(settings.largeSummaryCount) || 6);
    if (!pending.length || !force && pending.length < threshold) return null;
    const selected = force ? pending : pending.slice(0, threshold);
    const previousLarge = chatState.largeSummaries.at(-1);
    const sourceKeys = selected.map((item2) => item2.id);
    const raw = await generateTask({
      task: "largeSummary",
      systemPrompt: largeSummarySystemPrompt(),
      prompt: largeSummaryPrompt(
        selected,
        longTermRecordsFromPrevious(previousLarge),
        fallbackLongTermCandidates(selected)
      ),
      signal,
      invocation: {
        sourceRange: {
          startIndex: Math.min(...selected.flatMap((item2) => item2.sourceKeys.map((key) => {
            return factIndex.byMessageKey.get(key)?.sourceRange.startIndex ?? artifact.messageIndex;
          }))),
          endIndex: artifact.messageIndex,
          messageKeys: selected.flatMap((item2) => item2.sourceKeys)
        },
        priority: "background-derived",
        blocking: false,
        coalesceKey: `large-summary:${artifact.chatKey}`,
        outputSchema: "MA_LARGE_SUMMARY_TEXT_V1"
      }
    });
    const parsed = parseLargeSummaryText(raw);
    assertSummaryScope(artifact, signal);
    lease.assertOwner();
    const summary = normalizeLargeSummaryUpdate({
      value: parsed,
      sourceKeys,
      previous: previousLarge,
      candidates: fallbackLongTermCandidates(selected)
    });
    if (!summary.summary) throw new Error("\u5927\u603B\u7ED3\u6CA1\u6709\u5F62\u6210\u53EF\u7528\u7684\u957F\u671F\u8BB0\u5F55");
    const intentKey = `large-model:${artifact.chatKey}:${hashText(sourceKeys.join("|"))}`;
    const beforeArtifact = deepClone(artifact);
    const beforeChatState = deepClone(chatState);
    const afterArtifact = deepClone(artifact);
    const afterChatState = deepClone(chatState);
    if (!afterChatState.largeSummaries.some((item2) => item2.sourceKeys.join("|") === summary.sourceKeys.join("|"))) {
      afterChatState.largeSummaries.push(deepClone(summary));
    }
    afterChatState.eventEntries = rebuildEventEntries(afterChatState.smallSummaries, afterChatState.largeSummaries);
    await commitSummaryMutation({
      operation: "large_summary",
      intentKey,
      artifact,
      beforeArtifact,
      afterArtifact,
      beforeChatState,
      afterChatState,
      signal
    });
    return summary;
  }, signal);
}
async function maybeRunSummaries(artifact, forceSmall = false, forceLarge = false, signal, deferArtifactPersist = false) {
  const settings = getSettings();
  markStage(artifact, "summary", "running");
  await putArtifact(artifact);
  const factIndex = successfulFactPackageIndex();
  try {
    if (settings.autoSmallSummary || forceSmall) await generateSmallSummary(artifact, forceSmall, signal, factIndex);
    if (settings.autoLargeSummary || forceLarge) await generateLargeSummary(artifact, forceLarge, signal, factIndex);
    markStage(artifact, "summary", "success");
    if (!deferArtifactPersist) await putArtifact(artifact);
  } catch (error) {
    markStage(artifact, "summary", "failed", toErrorMessage(error));
    if (!deferArtifactPersist) await putArtifact(artifact);
    throw error;
  }
}

// src/pipeline/facts.ts
init_utils();

// src/domain/facts.ts
init_constants();
init_utils();
var ENTITY_TYPES = /* @__PURE__ */ new Set([
  "world_rule",
  "focus",
  "character",
  "relationship",
  "event",
  "region",
  "item",
  "skill",
  "process",
  "historical_result",
  "trace",
  "spacetime"
]);
var OPERATIONS = /* @__PURE__ */ new Set(["create", "update", "append", "remove", "close", "supersede", "merge"]);
var LIFECYCLES = /* @__PURE__ */ new Set(["stable", "active", "temporary", "historical", "trace"]);
var RESIDENCIES = /* @__PURE__ */ new Set(["global", "keyword", "contextual", "regional", "process", "historical", "trace", "never"]);
var CONFIDENCE = /* @__PURE__ */ new Set(["confirmed", "recorded", "reported", "uncertain"]);
function enumValue2(value, allowed, fallback) {
  const text = safeText(value, 80).trim();
  return allowed.has(text) ? text : fallback;
}
function ordinals(value, max) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((item2) => Number.isInteger(item2) && item2 >= 0 && item2 < max))];
}
var TABLE_SET = new Set(TABLE_KEYS);
function normalizeTableOperations(raw, artifacts) {
  if (!Array.isArray(raw)) return [];
  const output = [];
  for (const value of raw.slice(0, 240)) {
    if (!value || typeof value !== "object") continue;
    const source = value;
    const table = safeText(source.table, 80).trim();
    if (!TABLE_SET.has(table)) continue;
    const sourceOrdinals = ordinals(source.sourceOrdinals, artifacts.length);
    const selected = sourceOrdinals.length ? sourceOrdinals.map((index) => artifacts[index]) : [artifacts.at(-1)];
    const rowId = safeText(source.rowId || source.entityId, 160).trim();
    const title = safeText(source.title || source.name, 240).trim();
    if (!rowId && !title) continue;
    const operation = safeText(source.operation, 40).trim() === "retire" ? "retire" : "upsert";
    const sourceMessageKeys = selected.map((artifact) => artifact.messageKey);
    const sourceMessageIndexes = selected.map((artifact) => artifact.messageIndex);
    output.push({
      operationId: `table-op:${hashText(`${table}|${rowId}|${title}|${operation}|${sourceMessageKeys.join(",")}`)}`,
      table,
      operation,
      rowId: rowId || `${table}:${hashText(title).slice(0, 12)}`,
      title: title || rowId,
      content: safeText(source.content, 12e3).trim(),
      keywords: normalizeKeywords(source.keywords),
      status: safeText(source.status, 120).trim() || (operation === "retire" ? "\u5F85\u9636\u6BB5\u6C89\u964D" : "active"),
      lifecycle: (table === "characters" || table === "focus") && source.lifecycle ? normalizeLifecycle(source.lifecycle) : void 0,
      sourceEntityId: table === "relationships" ? safeText(source.sourceEntityId, 180).trim() || void 0 : void 0,
      targetEntityId: table === "relationships" ? safeText(source.targetEntityId, 180).trim() || void 0 : void 0,
      sourceMessageKeys,
      sourceMessageIndexes
    });
  }
  return output;
}
function normalizeFocusIdentity2(raw) {
  if (!raw || typeof raw !== "object") return void 0;
  const source = raw;
  const canonicalName = safeText(source.canonicalName || source.name, 240).trim();
  if (!canonicalName) return void 0;
  const aliases = Array.isArray(source.aliases) ? [...new Set(source.aliases.map((item2) => safeText(item2, 160).trim()).filter(Boolean))].slice(0, 24) : [];
  if (!aliases.includes(canonicalName)) aliases.unshift(canonicalName);
  return {
    focusId: safeText(source.focusId, 160).trim() || void 0,
    canonicalName,
    aliases
  };
}
function normalizeTurnMaterials(raw, artifacts) {
  const rows2 = Array.isArray(raw) ? raw : [];
  const byOrdinal = /* @__PURE__ */ new Map();
  for (const row of rows2) {
    if (!row || typeof row !== "object") continue;
    const ordinal = Number(row.sourceOrdinal);
    if (Number.isInteger(ordinal) && ordinal >= 0 && ordinal < artifacts.length) byOrdinal.set(ordinal, row);
  }
  return artifacts.map((artifact, ordinal) => {
    const row = byOrdinal.get(ordinal) ?? {};
    return {
      sourceMessageKey: artifact.messageKey,
      sourceMessageIndex: artifact.messageIndex,
      summary: safeText(row.summary, 4e3).trim() || `\u7B2C ${artifact.messageIndex + 1} \u6761\u6B63\u6587\u5DF2\u5B8C\u6210\u4E8B\u5B9E\u63D0\u53D6\u3002`,
      keywords: normalizeKeywords(row.keywords),
      factIds: []
    };
  });
}
function normalizeFacts(raw, artifacts) {
  if (!Array.isArray(raw)) return [];
  const output = [];
  for (const value of raw.slice(0, 400)) {
    if (!value || typeof value !== "object") continue;
    const source = value;
    const sourceOrdinals = ordinals(source.sourceOrdinals, artifacts.length);
    const selected = sourceOrdinals.length ? sourceOrdinals.map((index) => artifacts[index]) : [artifacts.at(-1)];
    const content = safeText(source.content, 6e3).trim();
    if (!content) continue;
    const entityType = enumValue2(source.entityType, ENTITY_TYPES, "event");
    const lifecycle = enumValue2(source.lifecycle, LIFECYCLES, "active");
    let residency = enumValue2(source.residency, RESIDENCIES, "contextual");
    const entityId = safeText(source.entityId, 180).trim() || `${entityType}:${hashText(content).slice(0, 12)}`;
    const operation = enumValue2(source.operation, OPERATIONS, "update");
    const allowConstant = entityType === "world_rule" && lifecycle === "stable" && residency === "global";
    if (!allowConstant && residency === "global") residency = "contextual";
    const sourceMessageKeys = selected.map((artifact) => artifact.messageKey);
    const sourceMessageIndexes = selected.map((artifact) => artifact.messageIndex);
    const factType = safeText(source.factType, 160).trim() || entityType;
    output.push({
      factId: `fact:${hashText(`${entityId}|${factType}|${operation}|${content}|${sourceMessageKeys.join(",")}`)}`,
      entityId,
      entityType,
      factType,
      title: safeText(source.title || source.name, 240).trim() || void 0,
      status: safeText(source.status, 120).trim() || void 0,
      rowLifecycle: (entityType === "character" || entityType === "focus") && source.rowLifecycle ? normalizeLifecycle(source.rowLifecycle) : void 0,
      sourceEntityId: entityType === "relationship" ? safeText(source.sourceEntityId, 180).trim() || void 0 : void 0,
      targetEntityId: entityType === "relationship" ? safeText(source.targetEntityId, 180).trim() || void 0 : void 0,
      operation,
      scope: safeText(source.scope, 240).trim() || "chat",
      lifecycle,
      content,
      keywords: normalizeKeywords(source.keywords),
      residency,
      allowConstant,
      playerBindingEvidence: Array.isArray(source.playerBindingEvidence) ? source.playerBindingEvidence.map((item2) => safeText(item2, 500).trim()).filter(Boolean).slice(0, 16) : [],
      sourceMessageKeys,
      sourceMessageIndexes,
      confidence: enumValue2(source.confidence, CONFIDENCE, "confirmed")
    });
  }
  return output;
}
function tableForEntityType(entityType) {
  const mapping = {
    world_rule: "foundations",
    focus: "focus",
    character: "characters",
    relationship: "relationships",
    event: "events",
    process: "events",
    region: "regions",
    item: "items",
    skill: "skills",
    spacetime: "spacetime"
  };
  return mapping[entityType];
}
function deriveTableOperations(facts, previousSnapshot2) {
  const output = [];
  for (const fact of facts) {
    if (fact.entityType === "world_rule" && fact.lifecycle !== "stable") continue;
    const table = tableForEntityType(fact.entityType);
    if (!table) continue;
    const retiring = fact.lifecycle === "historical" || fact.lifecycle === "trace" || ["remove", "close", "supersede"].includes(fact.operation);
    const existing = previousSnapshot2?.[table]?.find((row) => row.id === fact.entityId);
    const title = safeText(fact.title, 240).trim() || existing?.title || "";
    if (!title) continue;
    output.push({
      operationId: `table-op:${hashText(`${fact.factId}|${table}`)}`,
      table,
      operation: retiring ? "retire" : "upsert",
      rowId: fact.entityId,
      title: title || fact.entityId,
      content: fact.content,
      keywords: fact.keywords,
      status: fact.status || (retiring ? "\u5F85\u9636\u6BB5\u6C89\u964D" : "active"),
      lifecycle: fact.rowLifecycle,
      sourceEntityId: fact.sourceEntityId,
      targetEntityId: fact.targetEntityId,
      sourceMessageKeys: fact.sourceMessageKeys,
      sourceMessageIndexes: fact.sourceMessageIndexes
    });
  }
  return output;
}
function normalizeUnifiedFactPackage(input) {
  const { raw, artifacts, previousSnapshot: previousSnapshot2, extractorVersion } = input;
  if (!artifacts.length) throw new Error("\u7EDF\u4E00\u4E8B\u5B9E\u5305\u6CA1\u6709\u6765\u6E90\u6B63\u6587");
  const turnMaterials = normalizeTurnMaterials(raw.turnMaterials, artifacts);
  const facts = normalizeFacts(raw.facts, artifacts);
  const explicitTableOperations = normalizeTableOperations(raw.tableOperations, artifacts);
  const tableOperations = facts.length ? deriveTableOperations(facts, previousSnapshot2) : explicitTableOperations;
  const focusIdentity = normalizeFocusIdentity2(raw.focusIdentity);
  const stageSummary = raw.stageSummary && typeof raw.stageSummary === "object" ? normalizeSummary(raw.stageSummary, "small", artifacts.map((artifact) => artifact.messageKey)) : void 0;
  const factIdsByKey = /* @__PURE__ */ new Map();
  for (const fact of facts) {
    for (const key of fact.sourceMessageKeys) {
      const list2 = factIdsByKey.get(key) ?? [];
      list2.push(fact.factId);
      factIdsByKey.set(key, list2);
    }
  }
  for (const material of turnMaterials) material.factIds = factIdsByKey.get(material.sourceMessageKey) ?? [];
  const hasCompatibilitySnapshot = Boolean(raw.finalSnapshot || Array.isArray(raw.focus));
  const finalSnapshotInput = raw.finalSnapshot ?? (Array.isArray(raw.focus) ? raw : void 0);
  const finalSnapshot = hasCompatibilitySnapshot ? preservePersistentCharacters(
    previousSnapshot2,
    preserveSnapshotContinuity(previousSnapshot2, normalizeSnapshot(finalSnapshotInput, previousSnapshot2))
  ) : void 0;
  const sedimentation = normalizeSedimentationPlan(raw.sedimentation);
  const sourceRange = {
    startIndex: artifacts[0].messageIndex,
    endIndex: artifacts.at(-1).messageIndex,
    messageKeys: artifacts.map((artifact) => artifact.messageKey)
  };
  return {
    schemaVersion: 2,
    packageId: makeId("facts"),
    extractorVersion,
    chatKey: artifacts[0].chatKey,
    sourceRange,
    sourceRevisions: artifacts.map((artifact) => artifact.sourceFingerprint),
    turnMaterials,
    facts,
    tableOperations,
    focusIdentity,
    sedimentation,
    stageSummary,
    finalSnapshot,
    createdAt: nowIso()
  };
}

// src/prompts/facts.ts
init_constants();
function compactRowForFactPrompt(row) {
  const compact = { id: row.id, title: row.title, content: row.content };
  if (row.status) compact.status = row.status;
  if (row.keywords.length) compact.keywords = row.keywords;
  if (row.source === "manual" || row.locked) compact.protected = true;
  if (row.lifecycle) compact.lifecycle = row.lifecycle;
  if (row.sourceEntityId) compact.sourceEntityId = row.sourceEntityId;
  if (row.targetEntityId) compact.targetEntityId = row.targetEntityId;
  return compact;
}
function compactSnapshotForFactPrompt(previous) {
  return Object.fromEntries(
    Object.entries(previous).map(([key, rows2]) => [key, rows2.map(compactRowForFactPrompt)])
  );
}
function joinList(values) {
  return values?.length ? values.join("\uFF5C") : "\u65E0";
}
function formatLifecycle(row) {
  const life = row.lifecycle;
  if (!life) return "";
  return [
    `\u5B58\u5728=${life.existence}`,
    `\u6D3B\u8DC3=${life.activity}`,
    `\u8BB0\u5FC6=${life.memory}`,
    `\u8BC1\u636E\u7B49\u7EA7=${life.evidenceLevel}`,
    life.evidence ? `\u4F9D\u636E=${life.evidence}` : "",
    life.returnConditions.length ? `\u56DE\u6D41\u6761\u4EF6=${joinList(life.returnConditions)}` : "",
    life.returnBlockers.length ? `\u56DE\u6D41\u963B\u788D=${joinList(life.returnBlockers)}` : ""
  ].filter(Boolean).join("\uFF1B");
}
function formatFactPromptSnapshot(previous) {
  const compact = compactSnapshotForFactPrompt(previous);
  const sections = [];
  for (const [key, rows2] of Object.entries(compact)) {
    sections.push(`\u3010${TABLE_LABELS[key]} / ${key}\u3011`);
    if (!rows2.length) {
      sections.push("\uFF08\u65E0\uFF09");
      continue;
    }
    for (const row of rows2) {
      const meta = [
        `ID=${row.id}`,
        row.status ? `\u72B6\u6001=${row.status}` : "",
        row.protected ? "\u4FDD\u62A4=\u662F" : "",
        row.keywords?.length ? `\u5173\u952E\u8BCD=${joinList(row.keywords)}` : "",
        row.sourceEntityId ? `\u5173\u7CFB\u8D77\u70B9=${row.sourceEntityId}` : "",
        row.targetEntityId ? `\u5173\u7CFB\u7EC8\u70B9=${row.targetEntityId}` : "",
        formatLifecycle(row)
      ].filter(Boolean).join("\uFF1B");
      sections.push(`- ${row.title}
  ${meta}
  \u5185\u5BB9=${row.content}`);
    }
  }
  return sections.join("\n");
}
function formatTurns(artifacts) {
  return artifacts.map((artifact, sourceOrdinal) => [
    `<source_turn>`,
    `<source_ordinal>${sourceOrdinal}</source_ordinal>`,
    `<message_index>${artifact.messageIndex}</message_index>`,
    `<player>${artifact.playerText || "\uFF08\u7A7A\uFF09"}</player>`,
    `<assistant>${artifact.assistantText}</assistant>`,
    `</source_turn>`
  ].join("\n")).join("\n\n");
}
function estimateFactPromptCharacters(previous, artifacts) {
  return formatFactPromptSnapshot(previous).length + formatTurns(artifacts).length;
}
var UNIFIED_FACT_EXTRACTOR_VERSION = "ma-facts-text-v1";
var FACT_BLOCK = `<fact>
<entity_id>\u7A33\u5B9A\u5BF9\u8C61ID</entity_id>
<entity_type>world_rule|focus|character|relationship|event|region|item|skill|process|historical_result|trace|spacetime</entity_type>
<fact_type>\u4E8B\u5B9E\u7C7B\u522B</fact_type>
<title>\u5BF9\u8C61\u6216\u8868\u683C\u884C\u540D\u79F0\uFF1B\u6CBF\u7528\u65E7ID\u65F6\u53EF\u7701\u7565\u91CD\u590D\u540D\u79F0</title>
<status>\u5F53\u524D\u72B6\u6001</status>
<operation>create|update|append|remove|close|supersede|merge</operation>
<scope>\u4F5C\u7528\u57DF</scope>
<lifecycle>stable|active|temporary|historical|trace</lifecycle>
<content>\u53EF\u89C2\u5BDF\u4E8B\u5B9E\u6216\u66F4\u65B0\u540E\u7684\u5F53\u524D\u6D3B\u8DC3\u8BB0\u5F55</content>
<keywords>\u5173\u952E\u8BCD1\uFF5C\u5173\u952E\u8BCD2</keywords>
<residency>global|keyword|contextual|regional|process|historical|trace|never</residency>
<source_ordinals>0\uFF5C1</source_ordinals>
<confidence>confirmed|recorded|reported|uncertain</confidence>
<source_entity_id>\u4EC5\u5173\u7CFB\u586B\u5199</source_entity_id>
<target_entity_id>\u4EC5\u5173\u7CFB\u586B\u5199</target_entity_id>
<existence>\u4EC5\u7126\u70B9/\u4EBA\u7269\u586B\u5199</existence>
<activity>\u4EC5\u7126\u70B9/\u4EBA\u7269\u586B\u5199</activity>
<memory>\u4EC5\u7126\u70B9/\u4EBA\u7269\u586B\u5199</memory>
<evidence_level>\u4EC5\u7126\u70B9/\u4EBA\u7269\u586B\u5199</evidence_level>
<evidence>\u4F9D\u636E</evidence>
<return_conditions>\u6761\u4EF61\uFF5C\u6761\u4EF62</return_conditions>
<return_blockers>\u963B\u788D1\uFF5C\u963B\u788D2</return_blockers>
</fact>`;
function stageProtocol() {
  return `<stage_summary>
<title>\u672C\u6279\u9636\u6BB5\u603B\u7ED3\u6807\u9898</title>
<summary>\u9636\u6BB5\u538B\u7F29\u6B63\u6587</summary>
<keywords>\u5173\u952E\u8BCD1\uFF5C\u5173\u952E\u8BCD2</keywords>
<sedimentation>
<absorbed_row_ids>\u5DF2\u88AB\u603B\u7ED3\u4FDD\u5B58\u7684\u884CID</absorbed_row_ids>
<keep_active_row_ids>\u4ECD\u9700\u6D3B\u8DC3\u7684\u884CID</keep_active_row_ids>
<remove_row_ids>\u5DF2\u5438\u6536\u4E14\u53EF\u9000\u51FA\u7684\u884CID</remove_row_ids>
<character_activity><row_id>\u4EBA\u7269\u884CID</row_id><activity>\u4F11\u7720|\u957F\u671F\u4F11\u7720|\u5DF2\u5F52\u6863</activity><reason>\u4F9D\u636E</reason></character_activity>
<notes>\u8BF4\u660E1\uFF5C\u8BF4\u660E2</notes>
</sedimentation>
<long_term_candidate>
<record_id>\u7A33\u5B9A\u8BB0\u5F55ID</record_id><category>world|character|relationship|event|region|item|skill|historical|unresolved|other</category>
<title>\u6807\u9898</title><content>\u957F\u671F\u6709\u6548\u4E8B\u5B9E</content><keywords>\u5173\u952E\u8BCD</keywords><permanence>stable|irreversible|long-term|unresolved</permanence>
<source_row_ids>\u6765\u6E90\u8868\u683C\u884CID</source_row_ids><source_fact_ids>\u6765\u6E90\u4E8B\u5B9EID\u6216\u5BF9\u8C61ID</source_fact_ids>
</long_term_candidate>
</stage_summary>`;
}
function unifiedFactSystemPrompt(options = {}) {
  return `\u4F60\u662F\u201C\u955C\u6E0A\u201D\u7EDF\u4E00\u4E8B\u5B9E\u63D0\u53D6\u5668\u3002\u4F60\u53EA\u8BFB\u53D6\u7ED9\u5B9A\u6B63\u6587\u533A\u6BB5\u4E00\u6B21\uFF0C\u8F93\u51FA\u7EAF\u6587\u672C\u6807\u7B7E\u534F\u8BAE\uFF0C\u4E0D\u7EED\u5199\u6545\u4E8B\u3002

\u7981\u6B62\u8F93\u51FA JSON\u3001JSON Schema\u3001Markdown \u4EE3\u7801\u5757\u3001\u89E3\u91CA\u3001\u524D\u8A00\u3001\u7ED3\u8BED\u6216\u601D\u8003\u8FC7\u7A0B\u3002
\u8F93\u51FA\u5FC5\u987B\u4EE5 <ma_facts> \u5F00\u59CB\uFF0C\u4EE5 </ma_facts> \u7ED3\u675F\u3002\u5B57\u6BB5\u503C\u76F4\u63A5\u5199\u81EA\u7136\u6587\u672C\uFF1B\u5217\u8868\u4F7F\u7528\u5168\u89D2\u7AD6\u7EBF\u201C\uFF5C\u201D\u5206\u9694\u3002

\u6BCF\u4E2A\u8F93\u5165\u8F6E\u6B21\u8F93\u51FA\u4E00\u4E2A\uFF1A
<turn><source_ordinal>0</source_ordinal><summary>\u672C\u8F6E\u5DF2\u53D1\u751F\u4E8B\u5B9E\u6458\u8981</summary><keywords>\u5173\u952E\u8BCD1\uFF5C\u5173\u952E\u8BCD2</keywords></turn>

\u6BCF\u6761\u4E8B\u5B9E\u8F93\u51FA\u4E00\u4E2A\uFF1A
${FACT_BLOCK}

\u5F53\u524D\u7126\u70B9\u8F93\u51FA\u4E00\u6B21\uFF1A
<focus_identity><focus_id>\u5DF2\u77E5\u7A33\u5B9AID\u6216\u7A7A</focus_id><canonical_name>\u6807\u51C6\u540D\u79F0</canonical_name><aliases>\u79F0\u547C1\uFF5C\u79F0\u547C2</aliases></focus_identity>

\u9636\u6BB5\u6C89\u964D\u5019\u9009\u8F93\u51FA\u4E00\u6B21\uFF1A
<sedimentation><remove_row_ids>\u5019\u9009\u884CID</remove_row_ids><character_activity><row_id>\u4EBA\u7269\u884CID</row_id><activity>\u4F11\u7720|\u957F\u671F\u4F11\u7720|\u5DF2\u5F52\u6863</activity><reason>\u4F9D\u636E</reason></character_activity><notes>\u8BF4\u660E</notes></sedimentation>

\u89C4\u5219\uFF1A
1. <turn> \u5FC5\u987B\u8986\u76D6\u6BCF\u4E2A source_ordinal\uFF0C\u53EA\u6982\u62EC\u8BE5\u8F6E\u5DF2\u7ECF\u53D1\u751F\u7684\u4E8B\u5B9E\u3002
2. <fact> \u662F\u552F\u4E00\u4E8B\u5B9E\u8F93\u51FA\u3002\u4EE3\u7801\u6309 entity_type \u81EA\u52A8\u5206\u53D1\u5230\u8868\u683C\u3001\u603B\u7ED3\u3001\u4E16\u754C\u4E66\u548C\u56FE\u8C31\uFF1B\u4E0D\u8981\u8F93\u51FA\u5B8C\u6574\u8868\u683C\u5FEB\u7167\u3002
3. \u6D3B\u8DC3\u5BF9\u8C61\u5FC5\u987B\u5C3D\u91CF\u6CBF\u7528\u4E0A\u4E00\u8868\u683C\u7684\u7A33\u5B9A entity_id\u3002\u540D\u79F0\u6216\u522B\u540D\u53D8\u5316\u4E0D\u80FD\u65B0\u5EFA\u91CD\u590D\u5BF9\u8C61\u3002
4. relationship \u5FC5\u987B\u586B\u5199 source_entity_id \u4E0E target_entity_id\u3002historical_result \u548C trace \u53EA\u8FDB\u5165\u603B\u7ED3\u7D20\u6750\u3002
5. world_rule \u53EA\u7528\u4E8E\u7A33\u5B9A\u4E16\u754C\u5E95\u5C42\u89C4\u5219\uFF1B\u4E34\u65F6\u5236\u5EA6\u3001\u5C01\u9501\u6216\u5C40\u90E8\u89C4\u5219\u7528 process/event\u3002
6. \u5DF2\u7ED3\u675F\u5BF9\u8C61\u4F7F\u7528 close/remove/supersede \u6216 historical/trace\uFF1B\u666E\u901A\u8F6E\u6B21\u53EA\u6807\u8BB0\u5F85\u6C89\u964D\uFF0C\u4E0D\u76F4\u63A5\u5220\u9664\u3002
7. protected=\u662F\u7684\u65E7\u884C\u4E0D\u5F97\u8986\u76D6\u3001\u5220\u9664\u6216\u964D\u7EA7\u3002
8. \u53EA\u6709\u7A33\u5B9A world_rule \u53EF\u4EE5 residency=global\uFF1B\u4EBA\u7269\u4F4D\u7F6E\u3001\u4F24\u52BF\u3001\u4E8B\u4EF6\u9636\u6BB5\u548C\u77ED\u671F\u4EFB\u52A1\u4E0D\u5F97\u5E38\u9A7B\u3002
9. source_ordinals \u4F7F\u7528\u8F93\u5165\u5E8F\u53F7\uFF0C\u4E0D\u8F93\u51FA\u6D88\u606FID\u3002
10. \u6C89\u964D\u5019\u9009\u53EA\u5141\u8BB8\u5DF2\u7ED3\u675F\u7684 spacetime/relationships/items/skills/events/regions\uFF1B\u4E0D\u5F97\u5220\u9664 focus\u3001characters\u3001foundations\u3002
11. \u4EBA\u7269\u6D3B\u52A8\u964D\u7EA7\u53EA\u80FD\u9010\u7EA7\u8FDB\u5165\u4F11\u7720\u3001\u957F\u671F\u4F11\u7720\u3001\u5DF2\u5F52\u6863\uFF0C\u4E0D\u5F97\u6539\u53D8\u6B7B\u4EA1\u6216\u8BC1\u636E\u5224\u65AD\u3002
12. \u5B57\u6BB5\u4E0D\u9002\u7528\u65F6\u4FDD\u7559\u7A7A\u6807\u7B7E\u6216\u7701\u7565\u8BE5\u6807\u7B7E\u3002${options.includeStageSummary ? `
13. \u5386\u53F2\u91CD\u5EFA\u6A21\u5F0F\u8FD8\u5FC5\u987B\u8F93\u51FA\u4EE5\u4E0B\u9636\u6BB5\u603B\u7ED3\u5757\uFF1A
${stageProtocol()}` : ""}`;
}
function unifiedFactUserPrompt(previous, artifacts, options = {}) {
  const mode = options.includeStageSummary ? "\u5386\u53F2\u91CD\u5EFA\u6279\u6B21\uFF1A\u540C\u65F6\u8F93\u51FA stage_summary" : "\u666E\u901A\u4E8B\u5B9E\u63D0\u53D6";
  return `\u3010\u6A21\u5F0F\u3011${mode}

\u3010\u4E0A\u4E00\u4EFD\u5F53\u524D\u6D3B\u8DC3\u8868\u683C\u3011
${formatFactPromptSnapshot(previous)}

\u3010\u5F85\u63D0\u53D6\u6B63\u6587\u533A\u6BB5\u3011
${formatTurns(artifacts)}

\u8BF7\u6309\u7CFB\u7EDF\u6307\u5B9A\u7684\u7EAF\u6587\u672C\u6807\u7B7E\u534F\u8BAE\u8F93\u51FA\u3002\u4E0D\u8981\u8F93\u51FA JSON\u3002`;
}

// src/pipeline/facts.ts
init_repository();

// src/pipeline/state.ts
init_constants();
init_utils();

// src/prompts/state.ts
init_constants();

// src/pipeline/state.ts
init_repository();
function previousSnapshot(beforeIndex) {
  const chat = getChat();
  for (let i = beforeIndex - 1; i >= 0; i -= 1) {
    if (chat[i]?.is_user) continue;
    const snapshot = chat[i]?.extra?.mirrorAbyssV11?.snapshot;
    if (snapshot) return normalizeSnapshot(snapshot, snapshot);
    const legacy = chat[i]?.extra?.mirrorAbyss?.tableSnapshot;
    if (legacy) return normalizeSnapshot(legacy, legacy);
  }
  return emptySnapshot();
}

// src/pipeline/facts.ts
init_task_queue();
var DEFAULT_FACT_BATCH_CHARACTER_BUDGET = 52e3;
function partitionFactArtifactsBySize(artifacts, characterBudget = DEFAULT_FACT_BATCH_CHARACTER_BUDGET, initialSnapshot) {
  if (!artifacts.length) return [];
  const ordered = [...artifacts].sort((a, b) => a.messageIndex - b.messageIndex);
  const chunks = [];
  let current = [];
  for (const artifact of ordered) {
    const candidate = [...current, artifact];
    const previous = initialSnapshot ?? previousSnapshot(candidate[0].messageIndex);
    const size = estimateFactPromptCharacters(previous, candidate);
    if (current.length && size > Math.max(8e3, characterBudget)) {
      chunks.push(current);
      current = [artifact];
    } else {
      current = candidate;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}
function assertArtifactCurrent(artifact, signal) {
  if (signal?.aborted) throw new TaskCancelledError("\u7EDF\u4E00\u4E8B\u5B9E\u63D0\u53D6\u5DF2\u53D6\u6D88");
  if (artifact.chatKey !== currentChatKey()) throw new StaleTaskError("\u7EDF\u4E00\u4E8B\u5B9E\u63D0\u53D6\u6240\u5C5E\u804A\u5929\u5DF2\u6539\u53D8");
  if (messageFingerprint(artifact.messageIndex) !== artifact.sourceFingerprint) {
    throw new StaleTaskError("\u7EDF\u4E00\u4E8B\u5B9E\u63D0\u53D6\u6765\u6E90\u6B63\u6587\u5DF2\u53D8\u5316");
  }
}
async function attachAndStore(artifact) {
  const message = getMessage(artifact.messageIndex);
  if (!message || message.is_user || messageFingerprint(artifact.messageIndex) !== artifact.sourceFingerprint) {
    throw new StaleTaskError("\u7EDF\u4E00\u4E8B\u5B9E\u4EA7\u7269\u65E0\u6CD5\u9644\u7740\u5230\u5F53\u524D\u6B63\u6587");
  }
  attachArtifactToMessage(message, artifact);
  await putArtifact(artifact);
}
async function extractUnifiedFacts(artifacts, signal, connectionSnapshot, options = {}) {
  if (!artifacts.length) throw new Error("\u6CA1\u6709\u53EF\u63D0\u53D6\u7684\u6B63\u6587");
  for (const artifact of artifacts) {
    assertApprovedForMemory(artifact, signal);
    markStage(artifact, "state", "running");
    await putArtifact(artifact);
  }
  const previous = previousSnapshot(artifacts[0].messageIndex);
  const sourceRange = {
    startIndex: artifacts[0].messageIndex,
    endIndex: artifacts.at(-1).messageIndex,
    messageKeys: artifacts.map((artifact) => artifact.messageKey)
  };
  try {
    const raw = await generateTask({
      task: "factExtraction",
      systemPrompt: unifiedFactSystemPrompt(options),
      prompt: unifiedFactUserPrompt(previous, artifacts, options),
      signal,
      connectionSnapshot,
      invocation: {
        sourceRange,
        priority: "background-critical",
        blocking: false,
        coalesceKey: `facts:${artifacts[0].chatKey}`,
        outputSchema: "MA_FACTS_TEXT_V1"
      }
    });
    let parsed;
    try {
      parsed = parseUnifiedFactsText(raw);
    } catch (error) {
      if (error instanceof PlainProtocolError) {
        throw new Error(`\u7EDF\u4E00\u4E8B\u5B9E\u63D0\u53D6\u672A\u8FD4\u56DE\u6709\u6548\u7EAF\u6587\u672C\u534F\u8BAE\uFF1A${error.message}${error.preview ? `\uFF1B\u8FD4\u56DE\u7247\u6BB5\uFF1A${error.preview}` : ""}`);
      }
      throw error;
    }
    for (const artifact of artifacts) assertApprovedForMemory(artifact, signal);
    return normalizeUnifiedFactPackage({
      raw: parsed,
      artifacts,
      previousSnapshot: previous,
      extractorVersion: UNIFIED_FACT_EXTRACTOR_VERSION
    });
  } catch (error) {
    for (const artifact of artifacts) {
      markStage(artifact, "state", "failed", toErrorMessage(error));
      await attachAndStore(artifact).catch(() => putArtifact(artifact));
    }
    await persistChat().catch(() => void 0);
    throw error;
  }
}
async function dispatchUnifiedFactPackage(input) {
  const { artifacts, factPackage, signal } = input;
  const latest = artifacts.at(-1);
  if (!latest) throw new Error("\u7EDF\u4E00\u4E8B\u5B9E\u5305\u6CA1\u6709\u76EE\u6807\u4EA7\u7269");
  for (const artifact of artifacts) assertApprovedForMemory(artifact, signal);
  const state2 = await getChatState(latest.chatKey);
  assertHistoryRebuildAccess(state2);
  for (const artifact of artifacts) {
    artifact.factPackageId = factPackage.packageId;
    markStage(artifact, "state", "success");
    if (artifact !== latest) {
      markStage(artifact, "summary", "skipped", "\u6279\u91CF\u4E8B\u5B9E\u63D0\u53D6\u7531\u533A\u6BB5\u672B\u6761\u7EDF\u4E00\u6D3E\u751F");
      markStage(artifact, "sync", "skipped", "\u6279\u91CF\u4E8B\u5B9E\u63D0\u53D6\u7531\u533A\u6BB5\u672B\u6761\u7EDF\u4E00\u53D1\u5E03");
    }
  }
  const projection = projectUnifiedFacts({
    previousSnapshot: previousSnapshot(artifacts[0].messageIndex),
    factPackage,
    focusRegistry: state2.focusRegistry,
    currentFocusId: state2.currentFocusId
  });
  factPackage.projectionMode = projection.mode;
  latest.snapshot = deepClone(projection.snapshot);
  if (input.rebuildStageSummary && factPackage.stageSummary) {
    latest.snapshot = applySedimentation(latest.snapshot, factPackage.stageSummary);
    const signature = factPackage.stageSummary.sourceKeys.join("|");
    if (!state2.smallSummaries.some((summary) => summary.sourceKeys.join("|") === signature)) {
      state2.smallSummaries.push(deepClone(factPackage.stageSummary));
      state2.eventEntries = rebuildEventEntries(state2.smallSummaries, state2.largeSummaries);
    }
    markStage(latest, "summary", "success", `\u5386\u53F2\u6279\u6B21\u5DF2\u5F62\u6210\u9636\u6BB5\u603B\u7ED3\uFF1A${factPackage.stageSummary.title}`);
  }
  state2.focusRegistry = deepClone(projection.focusRegistry);
  state2.currentFocusId = projection.currentFocusId;
  const storedFactPackage = deepClone(factPackage);
  delete storedFactPackage.finalSnapshot;
  latest.factPackage = storedFactPackage;
  for (const key of factPackage.sourceRange.messageKeys) {
    if (!state2.processedMessageKeys.includes(key)) state2.processedMessageKeys.push(key);
  }
  state2.latestSnapshotMessageKey = latest.messageKey;
  state2.lastFactMessageIndex = latest.messageIndex;
  state2.lastFactPackageId = factPackage.packageId;
  state2.factSchemaVersion = factPackage.schemaVersion;
  state2.updatedAt = factPackage.createdAt;
  await putChatState(state2);
  for (const artifact of artifacts) await attachAndStore(artifact);
  if (input.deferDerived) {
    if (!(input.rebuildStageSummary && factPackage.stageSummary)) {
      markStage(latest, "summary", "queued", "\u540E\u53F0\u79EF\u538B\u4E2D\uFF0C\u9636\u6BB5\u603B\u7ED3\u5EF6\u8FDF\u5230\u6700\u65B0\u72B6\u6001");
    }
    markStage(latest, "sync", "queued", "\u540E\u53F0\u79EF\u538B\u4E2D\uFF0C\u53EA\u53D1\u5E03\u8FFD\u5E73\u540E\u7684\u6700\u65B0\u4E16\u754C\u4E66");
  } else {
    try {
      await maybeRunSummaries(latest, false, false, signal, true);
    } catch (error) {
      console.error("[MirrorAbyss] local summary dispatch failed", error);
      markStage(latest, "summary", "failed", toErrorMessage(error));
    }
    if (input.deferLorebookSync) {
      markStage(latest, "sync", "skipped", "\u5386\u53F2\u91CD\u5EFA\u671F\u95F4\u5EF6\u8FDF\u5230\u672B\u5C3E\u7EDF\u4E00\u540C\u6B65");
    } else if (getSettings().lorebookSync) {
      lorebookPublishScheduler.schedule(latest);
    } else {
      markStage(latest, "sync", "skipped");
    }
  }
  await attachAndStore(latest);
  await persistChat();
  await confirmLocalCommitsAttachedForArtifact(latest);
  return latest;
}
async function replayUnifiedFactPackages(input) {
  const artifacts = [...input.artifacts].sort((a, b) => a.messageIndex - b.messageIndex);
  const packages = [...input.factPackages].sort((a, b) => a.sourceRange.startIndex - b.sourceRange.startIndex);
  const latest = artifacts.at(-1);
  if (!latest || !packages.length) throw new Error("\u7F13\u5B58\u4E8B\u5B9E\u91CD\u653E\u6CA1\u6709\u53EF\u7528\u8F93\u5165");
  for (const artifact of artifacts) assertApprovedForMemory(artifact, input.signal);
  const state2 = await getChatState(latest.chatKey);
  assertHistoryRebuildAccess(state2);
  const byKey = new Map(artifacts.map((artifact) => [artifact.messageKey, artifact]));
  const coveredSummaryKeys = new Set(state2.smallSummaries.flatMap((summary) => summary.sourceKeys));
  const recoveredMaterials = [];
  let workingSnapshot = previousSnapshot(artifacts[0].messageIndex);
  let lastPackage;
  for (const sourcePackage of packages) {
    const factPackage = deepClone(sourcePackage);
    delete factPackage.stageSummary;
    const projection = projectUnifiedFacts({
      previousSnapshot: workingSnapshot,
      factPackage,
      focusRegistry: state2.focusRegistry,
      currentFocusId: state2.currentFocusId
    });
    factPackage.projectionMode = projection.mode;
    workingSnapshot = deepClone(projection.snapshot);
    state2.focusRegistry = deepClone(projection.focusRegistry);
    state2.currentFocusId = projection.currentFocusId;
    const packageArtifacts = factPackage.sourceRange.messageKeys.map((key) => byKey.get(key)).filter((artifact) => Boolean(artifact));
    const currentIndexByKey = new Map(packageArtifacts.map((artifact) => [artifact.messageKey, artifact.messageIndex]));
    if (packageArtifacts.length) {
      factPackage.sourceRange.startIndex = packageArtifacts[0].messageIndex;
      factPackage.sourceRange.endIndex = packageArtifacts.at(-1).messageIndex;
      for (const material of factPackage.turnMaterials) {
        material.sourceMessageIndex = currentIndexByKey.get(material.sourceMessageKey) ?? material.sourceMessageIndex;
      }
      for (const fact of factPackage.facts) {
        fact.sourceMessageIndexes = fact.sourceMessageKeys.map((key) => currentIndexByKey.get(key)).filter((index) => index !== void 0);
      }
      for (const operation of factPackage.tableOperations ?? []) {
        operation.sourceMessageIndexes = operation.sourceMessageKeys.map((key) => currentIndexByKey.get(key)).filter((index) => index !== void 0);
      }
    }
    for (const artifact of packageArtifacts) {
      artifact.factPackageId = factPackage.packageId;
      markStage(artifact, "state", "success", "\u5DF2\u590D\u7528\u65E2\u6709\u4E8B\u5B9E\u5305");
      if (!state2.processedMessageKeys.includes(artifact.messageKey)) state2.processedMessageKeys.push(artifact.messageKey);
    }
    const packageTail = packageArtifacts.at(-1);
    if (packageTail) {
      packageTail.snapshot = deepClone(workingSnapshot);
      const storedPackage = deepClone(factPackage);
      delete storedPackage.finalSnapshot;
      packageTail.factPackage = storedPackage;
    }
    recoveredMaterials.push(...factPackage.turnMaterials.filter((material) => !coveredSummaryKeys.has(material.sourceMessageKey)));
    lastPackage = factPackage;
  }
  latest.snapshot = deepClone(workingSnapshot);
  if (getSettings().autoSmallSummary && recoveredMaterials.length) {
    markStage(latest, "summary", "queued", `已复用 ${recoveredMaterials.length} 条事实素材；等待按“表格 → 事件条目”链重新生成`);
  } else {
    markStage(latest, "summary", "skipped", "既有事件总结保持有效");
  }
  for (const artifact of artifacts) {
    if (artifact !== latest) {
      markStage(artifact, "summary", "skipped", "\u7F13\u5B58\u4E8B\u5B9E\u7531\u533A\u6BB5\u672B\u6761\u7EDF\u4E00\u6D3E\u751F");
      markStage(artifact, "sync", "skipped", "\u5386\u53F2\u91CD\u5EFA\u7ED3\u675F\u540E\u7EDF\u4E00\u53D1\u5E03");
    }
  }
  markStage(latest, "sync", input.deferLorebookSync ? "skipped" : "queued", input.deferLorebookSync ? "\u5386\u53F2\u91CD\u5EFA\u7ED3\u675F\u540E\u7EDF\u4E00\u53D1\u5E03" : void 0);
  state2.latestSnapshotMessageKey = latest.messageKey;
  state2.lastFactMessageIndex = latest.messageIndex;
  state2.lastFactPackageId = lastPackage?.packageId;
  state2.factSchemaVersion = lastPackage?.schemaVersion ?? state2.factSchemaVersion;
  state2.updatedAt = nowIso();
  await putChatState(state2);
  for (const artifact of artifacts) await attachAndStore(artifact);
  await persistChat();
  return latest;
}
var UnifiedFactScheduler = class {
  pending = /* @__PURE__ */ new Map();
  running = /* @__PURE__ */ new Set();
  deferredLatest = /* @__PURE__ */ new Map();
  enqueue(artifact, options = {}) {
    return this.enqueueBatch([artifact], options);
  }
  enqueueBatch(artifacts, options = {}) {
    if (!artifacts.length) return Promise.reject(new Error("\u6CA1\u6709\u53EF\u8FDB\u5165\u7EDF\u4E00\u4E8B\u5B9E\u961F\u5217\u7684\u6B63\u6587"));
    return new Promise((resolve, reject) => {
      const chatKey = artifacts[0].chatKey;
      if (artifacts.some((artifact) => artifact.chatKey !== chatKey)) {
        reject(new Error("\u7EDF\u4E00\u4E8B\u5B9E\u6279\u6B21\u4E0D\u80FD\u8DE8\u804A\u5929"));
        return;
      }
      const batch = this.pending.get(chatKey) ?? {
        artifacts: /* @__PURE__ */ new Map(),
        deferLorebookSync: false,
        force: false,
        holdDerived: false,
        includeStageSummary: false,
        waiters: [],
        connectionSnapshot: captureTaskConnection("factExtraction"),
        queuedAt: Date.now()
      };
      for (const artifact of artifacts) batch.artifacts.set(artifact.messageIndex, deepClone(artifact));
      batch.deferLorebookSync ||= Boolean(options.deferLorebookSync);
      batch.force ||= Boolean(options.force);
      batch.holdDerived ||= Boolean(options.holdDerived);
      batch.includeStageSummary ||= Boolean(options.includeStageSummary);
      batch.waiters.push({ resolve, reject });
      this.pending.set(chatKey, batch);
      this.scheduleFlush(chatKey, batch);
    });
  }
  scheduleFlush(chatKey, batch) {
    if (this.running.has(chatKey)) return;
    if (batch.timer !== void 0) clearTimeout(batch.timer);
    const count = batch.artifacts.size;
    const delay = batch.force ? 0 : count >= 5 ? 0 : count >= 2 ? 60 : 180;
    batch.timer = globalThis.setTimeout(() => {
      batch.timer = void 0;
      void this.flush(chatKey);
    }, delay);
  }
  async flush(chatKey) {
    if (this.running.has(chatKey)) return;
    const batch = this.pending.get(chatKey);
    if (!batch) return;
    this.pending.delete(chatKey);
    if (batch.timer !== void 0) globalThis.clearTimeout(batch.timer);
    this.running.add(chatKey);
    const artifacts = [...batch.artifacts.values()].sort((a, b) => a.messageIndex - b.messageIndex);
    const chunks = partitionFactArtifactsBySize(artifacts);
    const key = `facts:${chatKey}:${hashText(artifacts.map((artifact) => artifact.messageKey).join("|"))}`;
    try {
      const { taskQueue: taskQueue2 } = await Promise.resolve().then(() => (init_task_queue(), task_queue_exports));
      const result = await taskQueue2.run(
        key,
        chunks.length > 1 ? `按体积分 ${chunks.length} 批：正文 → 表格（${artifacts.length} 条）` : artifacts.length > 1 ? `正文 → 表格（合并 ${artifacts.length} 条）` : `正文 → 表格 · 消息 ${artifacts[0].messageIndex + 1}`,
        "factExtraction",
        async (signal) => {
          let latestResult = null;
          for (let index = 0; index < chunks.length; index += 1) {
            const chunk = chunks[index];
            const factPackage = await extractUnifiedFacts(chunk, signal, batch.connectionSnapshot, { includeStageSummary: batch.includeStageSummary });
            const backlogContinues = this.pending.has(chatKey);
            const isLastChunk = index === chunks.length - 1;
            const deferDerived = !isLastChunk || batch.holdDerived || artifacts.length >= 5 || backlogContinues;
            latestResult = await dispatchUnifiedFactPackage({
              artifacts: chunk,
              factPackage,
              deferLorebookSync: batch.deferLorebookSync,
              deferDerived,
              rebuildStageSummary: batch.includeStageSummary,
              signal
            });
            await this.replaceDeferredLatest(chatKey, latestResult, deferDerived);
          }
          if (!latestResult) throw new Error("\u7EDF\u4E00\u4E8B\u5B9E\u6279\u6B21\u6CA1\u6709\u5F62\u6210\u7ED3\u679C");
          return latestResult;
        },
        {
          laneKey: `background-critical:${chatKey}`,
          priority: "background-critical",
          blocking: false,
          sourceRange: { startIndex: artifacts[0].messageIndex, endIndex: artifacts.at(-1).messageIndex },
          progressTotal: artifacts.length,
          progressLabel: chunks.length > 1 ? `分 ${chunks.length} 批更新活跃表格` : artifacts.length > 1 ? `合并 ${artifacts.length} 轮更新表格` : "提取事实并更新表格"
        }
      );
      for (const waiter of batch.waiters) waiter.resolve(result);
    } catch (error) {
      for (const waiter of batch.waiters) waiter.reject(error);
    } finally {
      this.running.delete(chatKey);
      if (this.pending.has(chatKey)) {
        const next = this.pending.get(chatKey);
        this.scheduleFlush(chatKey, next);
      } else if (!batch.holdDerived) {
        void this.flushDeferredDerived(chatKey, batch.deferLorebookSync);
      }
    }
  }
  async replaceDeferredLatest(chatKey, latest, keepLatestDeferred) {
    const previous = this.deferredLatest.get(chatKey);
    if (previous && previous.messageKey !== latest.messageKey) {
      markStage(previous, "summary", "skipped", "\u5DF2\u7531\u66F4\u65B0\u7684\u4E8B\u5B9E\u533A\u6BB5\u7EDF\u4E00\u6D3E\u751F");
      markStage(previous, "sync", "skipped", "\u5DF2\u7531\u66F4\u65B0\u7684\u4E16\u754C\u4E66\u7248\u672C\u53D6\u4EE3");
      await attachAndStore(previous).catch(() => putArtifact(previous));
    }
    if (keepLatestDeferred) this.deferredLatest.set(chatKey, deepClone(latest));
    else this.deferredLatest.delete(chatKey);
  }
  async flushDerived(chatKey, deferLorebookSync = false) {
    await this.flushDeferredDerived(chatKey, deferLorebookSync);
  }
  clearDeferred(chatKey) {
    this.deferredLatest.delete(chatKey);
  }
  async flushDeferredDerived(chatKey, deferLorebookSync) {
    const artifact = this.deferredLatest.get(chatKey);
    if (!artifact) return;
    this.deferredLatest.delete(chatKey);
    try {
      const { taskQueue: taskQueue2 } = await Promise.resolve().then(() => (init_task_queue(), task_queue_exports));
      await taskQueue2.run(
        `derived:${chatKey}:${artifact.messageKey}`,
        "表格 → 事件条目 → 大总结 → 世界书",
        "smallSummary",
        async (signal) => {
          if (chatKey !== currentChatKey()) throw new StaleTaskError("\u6D3E\u751F\u4EFB\u52A1\u6240\u5C5E\u804A\u5929\u5DF2\u6539\u53D8");
          try {
            await maybeRunSummaries(artifact, false, false, signal, true);
          } catch (error) {
            markStage(artifact, "summary", "failed", toErrorMessage(error));
          }
          if (deferLorebookSync) {
            markStage(artifact, "sync", "skipped", "\u5386\u53F2\u91CD\u5EFA\u671F\u95F4\u5EF6\u8FDF\u5230\u672B\u5C3E\u7EDF\u4E00\u540C\u6B65");
          } else if (getSettings().lorebookSync) {
            lorebookPublishScheduler.schedule(artifact);
          } else {
            markStage(artifact, "sync", "skipped");
          }
          await attachAndStore(artifact);
          await persistChat();
        },
        {
          laneKey: `background-derived:${chatKey}`,
          priority: "background-derived",
          blocking: false,
          sourceRange: { startIndex: artifact.messageIndex, endIndex: artifact.messageIndex },
          progressLabel: "生成分层总结并安排发布"
        }
      );
    } catch (error) {
      if (error instanceof StaleTaskError || error instanceof TaskCancelledError) return;
      console.error("[MirrorAbyss] deferred derived dispatch failed", error);
    }
  }
  cancelChat(chatKey, reason = "\u804A\u5929\u5DF2\u5207\u6362") {
    let count = 0;
    const batch = this.pending.get(chatKey);
    if (batch) {
      if (batch.timer !== void 0) globalThis.clearTimeout(batch.timer);
      this.pending.delete(chatKey);
      const error = new TaskCancelledError(reason);
      for (const waiter of batch.waiters) waiter.reject(error);
      count += batch.waiters.length;
    }
    this.deferredLatest.delete(chatKey);
    return count;
  }
  cancelAllExceptChat(chatKey, reason = "\u804A\u5929\u5DF2\u5207\u6362") {
    let count = 0;
    for (const key of [...this.pending.keys()]) {
      if (key !== chatKey) count += this.cancelChat(key, reason);
    }
    for (const key of [...this.deferredLatest.keys()]) if (key !== chatKey) this.deferredLatest.delete(key);
    return count;
  }
  cancelAll(reason = "\u7EDF\u4E00\u4E8B\u5B9E\u8C03\u5EA6\u5668\u5DF2\u505C\u6B62") {
    let count = 0;
    for (const key of [...this.pending.keys()]) count += this.cancelChat(key, reason);
    this.deferredLatest.clear();
    return count;
  }
  pendingCount(chatKey) {
    if (chatKey) return (this.pending.get(chatKey)?.artifacts.size ?? 0) + Number(this.deferredLatest.has(chatKey));
    return [...this.pending.values()].reduce((sum, batch) => sum + batch.artifacts.size, 0) + this.deferredLatest.size;
  }
};
var unifiedFactScheduler = new UnifiedFactScheduler();

// src/pipeline/pipeline.ts
init_task_queue();
init_repository();
init_chat_scope();

// src/pipeline/errors.ts
init_utils();
var PipelineStageError = class extends Error {
  artifact;
  cause;
  constructor(artifact, cause) {
    const failedStages = Object.entries(artifact.stages).filter(([, record]) => record.status === "failed").map(([stage]) => stage);
    const prefix = failedStages.length ? `\u9636\u6BB5 ${failedStages.join(", ")}` : "\u5904\u7406\u7BA1\u7EBF";
    super(`${prefix}\u5931\u8D25\uFF1A${toErrorMessage(cause)}`);
    this.name = "PipelineStageError";
    this.artifact = artifact;
    this.cause = cause;
  }
};

// src/pipeline/pipeline.ts
var listeners = /* @__PURE__ */ new Set();
function subscribePipeline(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function notify(index, artifact) {
  for (const listener of listeners) {
    try {
      listener(index, artifact);
    } catch (error) {
      console.warn("[MirrorAbyss] pipeline listener failed", error);
    }
  }
}
function resolveMessageIndex(payload) {
  if (Number.isInteger(payload)) return Number(payload);
  const candidates = [payload?.messageId, payload?.message_id, payload?.mesId, payload?.mesid, payload?.index];
  for (const candidate of candidates) if (Number.isInteger(Number(candidate))) return Number(candidate);
  const chat = getChat();
  return chat.length ? chat.length - 1 : -1;
}
function assertArtifactScope(artifact, signal) {
  if (signal?.aborted) throw new TaskCancelledError("\u4EFB\u52A1\u4FE1\u53F7\u5DF2\u53D6\u6D88");
  if (artifact.chatKey !== currentChatKey()) {
    throw new StaleTaskError("\u4EA7\u7269\u6240\u5C5E\u804A\u5929\u5DF2\u6539\u53D8\uFF0C\u7981\u6B62\u63D0\u4EA4\u526F\u4F5C\u7528");
  }
}
async function stageArtifact(index, artifact) {
  assertArtifactScope(artifact);
  const message = getMessage(index);
  if (!message || message.is_user) return false;
  if (messageFingerprint(index) !== artifact.sourceFingerprint) return false;
  attachArtifactToMessage(message, artifact);
  await putArtifact(artifact);
  notify(index, artifact);
  return true;
}
async function commitArtifact(index, artifact) {
  const staged = await stageArtifact(index, artifact);
  if (!staged) return false;
  await persistChat();
  await confirmLocalCommitsAttachedForArtifact(artifact);
  return true;
}
async function loadOrCreateArtifact(index, force) {
  const message = getMessage(index);
  if (!message || message.is_user || !String(message.mes || "").trim()) throw new Error("\u76EE\u6807\u4E0D\u662F\u6709\u6548AI\u6B63\u6587");
  const fingerprint3 = messageFingerprint(index);
  let artifact = getAttachedArtifact(message);
  if (!artifact || artifact.chatKey !== currentChatKey() || artifact.sourceFingerprint !== fingerprint3 || force) {
    artifact = createArtifactForMessage(index);
    attachArtifactToMessage(message, artifact);
    await putArtifact(artifact);
  }
  artifact.stableMessageId ||= messageStableIdentity(index);
  artifact.stages.revision ||= { status: "idle", attempts: 0 };
  return artifact;
}
async function processMessage(index, force = false, options = {}) {
  const settings = deepClone(getSettings());
  if (!settings.enabled) return null;
  const message = getMessage(index);
  if (!message || message.is_user || !String(message.mes || "").trim()) return null;
  const identity = messageIdentity(index);
  const chatKey = currentChatKey();
  const key = `${PIPELINE_VERSION}:foreground:${chatKey}:${identity}`;
  const awaitBackground = options.awaitBackground ?? true;
  const auditConnectionSnapshot = settings.auditEnabled ? captureTaskConnection("audit") : void 0;
  const foregroundLabel = settings.auditEnabled ? `正文准入与审核 · 消息 ${index + 1}` : `正文准入（审核关闭） · 消息 ${index + 1}`;
  const foreground = await taskQueue.run(key, foregroundLabel, "admission", async (signal) => {
    const initialState = await getChatState(chatKey);
    assertHistoryRebuildAccess(initialState);
    const artifact = await loadOrCreateArtifact(index, force);
    notify(index, artifact);
    let shouldPersistForeground = false;
    try {
      assertArtifactScope(artifact, signal);
      let audit = await runAudit(
        artifact,
        force,
        signal,
        auditConnectionSnapshot ? { settings, connectionSnapshot: auditConnectionSnapshot } : void 0
      );
      await stageArtifact(index, artifact);
      if (!audit.passed && settings.auditFailAction === "revise") {
        assertArtifactScope(artifact, signal);
        const revised = await runRevisionFlow(
          artifact,
          signal,
          auditConnectionSnapshot ? { settings, auditConnectionSnapshot } : void 0
        );
        audit = revised.audit;
        shouldPersistForeground = true;
        await stageArtifact(index, artifact);
      }
      if (!audit.passed) {
        const failureAction = settings.auditFailAction === "revise" ? settings.revisionFallbackAction : settings.auditFailAction;
        assertArtifactScope(artifact, signal);
        await applyAuditFailureAction(artifact, failureAction);
        releaseQuarantine(artifact);
        markAdmissionBlocked(artifact, audit.reason || "规则审核未通过");
        markStage(artifact, "state", "blocked", "\u89C4\u5219\u5BA1\u6838\u672A\u901A\u8FC7");
        markStage(artifact, "summary", "blocked", "\u89C4\u5219\u5BA1\u6838\u672A\u901A\u8FC7");
        markStage(artifact, "sync", "blocked", "\u89C4\u5219\u5BA1\u6838\u672A\u901A\u8FC7");
        await stageArtifact(index, artifact);
        await commitArtifact(index, artifact);
        return { artifact, approved: false };
      }
      releaseQuarantine(artifact);
      if (settings.autoState || force) markStage(artifact, "state", "queued");
      else markStage(artifact, "state", "skipped");
      await stageArtifact(index, artifact);
      if (shouldPersistForeground) await commitArtifact(index, artifact);
      return { artifact, approved: true };
    } catch (error) {
      if (signal.aborted || error instanceof StaleTaskError || error instanceof TaskCancelledError || artifact.chatKey !== currentChatKey()) {
        throw error;
      }
      const messageText = toErrorMessage(error);
      console.error("[MirrorAbyss] foreground pipeline failed", error);
      releaseQuarantine(artifact);
      toast("error", `\u5BA1\u6838\u6216\u4FEE\u6B63\u5931\u8D25\uFF1A${messageText}`);
      await stageArtifact(index, artifact);
      await commitArtifact(index, artifact);
      throw new PipelineStageError(artifact, error);
    }
  }, {
    laneKey: `foreground:${chatKey}`,
    priority: "foreground",
    blocking: true,
    sourceRange: { startIndex: index, endIndex: index }
  });
  if (!foreground.approved || !settings.autoState && !force) return foreground.artifact;
  const background = unifiedFactScheduler.enqueue(foreground.artifact, {
    deferLorebookSync: options.deferLorebookSync,
    force
  });
  if (!awaitBackground) {
    void background.catch((error) => {
      if (error instanceof StaleTaskError || error instanceof TaskCancelledError) return;
      console.error("[MirrorAbyss] background fact pipeline failed", error);
      toast("warning", `\u6B63\u6587\u5DF2\u653E\u884C\uFF1B\u540E\u53F0\u4E8B\u5B9E\u63D0\u53D6\u5931\u8D25\uFF1A${toErrorMessage(error)}`);
    });
    return foreground.artifact;
  }
  try {
    return await background;
  } catch (error) {
    if (error instanceof StaleTaskError || error instanceof TaskCancelledError) throw error;
    throw new PipelineStageError(getAttachedArtifact(getMessage(index)) ?? foreground.artifact, error);
  }
}
async function processHistoryBatch(indexes, options) {
  const artifacts = [];
  for (const index of indexes) {
    const message = getMessage(index);
    if (!message || message.is_user || !String(message.mes || "").trim()) continue;
    const artifact = await loadOrCreateArtifact(index, true);
    releaseQuarantine(artifact);
    markStage(artifact, "audit", "skipped", "\u5386\u53F2\u91CD\u5EFA\u4EC5\u56DE\u8BFB\u7F3A\u5931\u6216\u5931\u6548\u6B63\u6587");
    markStage(artifact, "revision", "skipped", "\u5386\u53F2\u91CD\u5EFA\u8DF3\u8FC7\u4FEE\u6B63");
    markAdmissionApproved(artifact, "history-rebuild", "历史重建按已保存正文回读，不重新执行审核");
    markStage(artifact, "state", "queued");
    await stageArtifact(index, artifact);
    artifacts.push(artifact);
  }
  if (!artifacts.length) return null;
  return unifiedFactScheduler.enqueueBatch(artifacts, {
    deferLorebookSync: options.deferLorebookSync,
    force: true,
    holdDerived: options.holdDerived,
    includeStageSummary: false
  });
}
async function replayHistoryBatch(indexes, factPackages, options) {
  const artifacts = [];
  for (const index of indexes) {
    const message = getMessage(index);
    if (!message || message.is_user || !String(message.mes || "").trim()) continue;
    const artifact = await loadOrCreateArtifact(index, true);
    releaseQuarantine(artifact);
    markStage(artifact, "audit", "skipped", "\u5386\u53F2\u91CD\u5EFA\u590D\u7528\u65E2\u6709\u4E8B\u5B9E\u5305\uFF0C\u4E0D\u91CD\u65B0\u8BFB\u53D6\u6B63\u6587");
    markStage(artifact, "revision", "skipped", "\u4E8B\u5B9E\u590D\u7528\u65E0\u9700\u4FEE\u6B63");
    markAdmissionApproved(artifact, "history-cache", "历史重建复用已确认的事实包");
    markStage(artifact, "state", "queued", "\u7B49\u5F85\u672C\u5730\u6279\u91CF\u91CD\u653E\u65E2\u6709\u4E8B\u5B9E");
    artifacts.push(artifact);
  }
  if (!artifacts.length) return null;
  return replayUnifiedFactPackages({
    artifacts,
    factPackages,
    deferLorebookSync: options.deferLorebookSync
  });
}
async function finalizeHistoryDerived(artifact) {
  unifiedFactScheduler.clearDeferred(artifact.chatKey);
  markStage(artifact, "summary", "running", "历史事实已投影到表格，正在按阈值生成事件总结");
  await stageArtifact(artifact.messageIndex, artifact);
  let generatedSmall = 0;
  for (let guard = 0; guard < 200; guard += 1) {
    const summary = await generateSmallSummary(artifact, true);
    if (!summary) break;
    generatedSmall += 1;
  }
  markStage(artifact, "summary", "running", `已生成 ${generatedSmall} 份事件总结，正在更新长期大总结`);
  await stageArtifact(artifact.messageIndex, artifact);
  await generateLargeSummary(artifact, true);
  markStage(artifact, "summary", "success", `历史重建完成：${generatedSmall} 份事件总结已汇入长期大总结`);
  await commitArtifact(artifact.messageIndex, artifact);
}
function scheduleMessage(payload, force = false, delay = 0) {
  const index = resolveMessageIndex(payload);
  if (index < 0) return;
  if (!force) {
    const primed = primeQuarantine(index);
    if (primed) notify(index, primed);
  }
  const scheduledScope = chatScopeManager.current();
  window.setTimeout(() => {
    if (!chatScopeManager.isCurrent(scheduledScope)) return;
    void processMessage(index, force, { awaitBackground: false }).catch((error) => {
      if (error instanceof PipelineStageError || error instanceof StaleTaskError || error instanceof TaskCancelledError) return;
      console.error("[MirrorAbyss] scheduled pipeline failed", error);
    });
  }, delay);
}
async function retryStage(index, stage) {
  if (stage === "audit" || stage === "revision") return processMessage(index, true);
  const artifact = await loadOrCreateArtifact(index, false);
  if (stage === "state") return unifiedFactScheduler.enqueue(artifact, { force: true });
  const key = `${PIPELINE_VERSION}:retry:${stage}:${artifact.chatKey}:${artifact.messageKey}`;
  return taskQueue.run(key, `\u91CD\u8BD5${stage}`, stage === "sync" ? "sync" : stage === "summary" ? "smallSummary" : stage, async (signal) => {
    try {
      assertArtifactScope(artifact, signal);
      if (stage === "summary") await maybeRunSummaries(artifact, true, true, signal);
      if (stage === "sync") await syncLorebook(artifact, signal, { forceRefresh: true });
      await stageArtifact(index, artifact);
      return artifact;
    } finally {
      if (artifact.chatKey === currentChatKey()) await commitArtifact(index, artifact);
    }
  });
}
async function forceSummary(index, kind) {
  const artifact = await loadOrCreateArtifact(index, false);
  const key = `${PIPELINE_VERSION}:force-summary:${kind}:${artifact.chatKey}:${artifact.messageKey}`;
  return taskQueue.run(key, `\u7ACB\u5373${kind === "small" ? "\u5C0F" : "\u5927"}\u603B\u7ED3`, kind === "small" ? "smallSummary" : "largeSummary", async (signal) => {
    try {
      assertArtifactScope(artifact, signal);
      await maybeRunSummaries(artifact, kind === "small", kind === "large", signal);
      await stageArtifact(index, artifact);
      if (getSettings().lorebookSync) {
        await syncLorebook(artifact, signal, { forceRefresh: true });
        await stageArtifact(index, artifact);
      }
      return artifact;
    } finally {
      if (artifact.chatKey === currentChatKey()) await commitArtifact(index, artifact);
    }
  });
}
var historyRebuildTimers = /* @__PURE__ */ new Map();
var pendingHistoryStarts = /* @__PURE__ */ new Map();
function reasonForChangedEvent(sourceEvent) {
  if (/SWIP/i.test(sourceEvent)) return "swiped";
  if (/UPDATED/i.test(sourceEvent)) return "continued";
  return "edited";
}
function launchHistoryRebuild(startIndex, reason) {
  const scope = chatScopeManager.current();
  const taskKey = `history-rebuild:${scope.chatKey}`;
  if (taskQueue.has(taskKey)) return false;
  clearAllQuarantines();
  taskQueue.cancelChat(scope.chatKey, "\u804A\u5929\u5386\u53F2\u5DF2\u4FEE\u6539\uFF0C\u53D6\u6D88\u65E7\u4EFB\u52A1\u5E76\u91CD\u5EFA\u4F9D\u8D56");
  unifiedFactScheduler.cancelChat(scope.chatKey, "\u804A\u5929\u5386\u53F2\u5DF2\u4FEE\u6539\uFF0C\u53D6\u6D88\u5F85\u63D0\u53D6\u533A\u6BB5");
  lorebookPublishScheduler.cancelChat(scope.chatKey, "\u804A\u5929\u5386\u53F2\u5DF2\u4FEE\u6539\uFF0C\u53D6\u6D88\u65E7\u4E16\u754C\u4E66\u53D1\u5E03");
  const total = Math.max(1, getChat().length - startIndex);
  void taskQueue.run(
    taskKey,
    `\u540E\u53F0\u91CD\u5EFA\uFF1A\u4ECE\u7B2C ${startIndex + 1} \u6761\u5F00\u59CB`,
    "factExtraction",
    async (signal) => rebuildHistoryFrom({
      startIndex,
      reason,
      processBatch: processHistoryBatch,
      replayBatch: replayHistoryBatch,
      finalizeDerived: finalizeHistoryDerived,
      syncLatest: async (artifact) => syncLorebook(artifact, signal, { forceRefresh: true }),
      signal,
      onProgress: (progress) => taskQueue.updateByKey(taskKey, {
        progressCurrent: progress.current,
        progressTotal: progress.total,
        progressLabel: progress.label,
        retries: progress.retries
      })
    }),
    {
      laneKey: `history-rebuild:${scope.chatKey}`,
      priority: "background-critical",
      blocking: false,
      sourceRange: { startIndex, endIndex: getChat().length - 1 },
      progressTotal: total,
      progressLabel: "\u7B49\u5F85\u6279\u6B21\u5212\u5206"
    }
  ).then(() => {
    toast("success", "\u5386\u53F2\u91CD\u5EFA\u5B8C\u6210\uFF0C\u8868\u683C\u3001\u603B\u7ED3\u4E0E\u4E16\u754C\u4E66\u5DF2\u66F4\u65B0");
  }).catch((error) => {
    if (error instanceof StaleTaskError || error instanceof TaskCancelledError) return;
    console.error("[MirrorAbyss] history rebuild failed", error);
    toast("error", `\u5386\u53F2\u4F9D\u8D56\u91CD\u5EFA\u5931\u8D25\uFF1A${toErrorMessage(error)}`);
  });
  return true;
}
function scheduleHistoryRebuild(payload, reason, delay = 300, sourceEvent = "") {
  const startIndex = Math.max(0, resolveMessageIndex(payload));
  const scope = chatScopeManager.current();
  const previous = pendingHistoryStarts.get(scope.chatKey);
  if (/MESSAGE_UPDATED/i.test(sourceEvent)) {
    if (previous) return;
    const message = getMessage(startIndex);
    const attached = getAttachedArtifact(message);
    if (message?.is_user || !attached || attached.chatKey !== scope.chatKey) return;
    if (attached.messageKey === messageIdentity(startIndex) && attached.sourceFingerprint === messageFingerprint(startIndex)) return;
  }
  pendingHistoryStarts.set(scope.chatKey, {
    startIndex: previous ? Math.min(previous.startIndex, startIndex) : startIndex,
    reason
  });
  const existingTimer = historyRebuildTimers.get(scope.chatKey);
  if (existingTimer !== void 0) window.clearTimeout(existingTimer);
  const timer = window.setTimeout(() => {
    historyRebuildTimers.delete(scope.chatKey);
    const pending = pendingHistoryStarts.get(scope.chatKey);
    pendingHistoryStarts.delete(scope.chatKey);
    if (!pending || !chatScopeManager.isCurrent(scope)) return;
    launchHistoryRebuild(pending.startIndex, pending.reason);
  }, delay);
  historyRebuildTimers.set(scope.chatKey, timer);
}
async function removeMessageArtifact(payload) {
  scheduleHistoryRebuild(payload, "deleted", 0);
}
async function recoverHistoryConsistencyForCurrentChat() {
  const state2 = await getChatState(currentChatKey());
  const startIndex = state2.historyRebuild?.startIndex ?? await detectHistoryConsistencyStart();
  if (startIndex === null) return false;
  return launchHistoryRebuild(startIndex, state2.historyRebuild ? "recovery" : "branch");
}
function getArtifactAt(index) {
  const artifact = getAttachedArtifact(getMessage(index));
  return artifact?.chatKey === currentChatKey() ? artifact : null;
}
function latestArtifact() {
  const chatKey = currentChatKey();
  const chat = getChat();
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    const artifact = getAttachedArtifact(chat[i]);
    if (artifact?.chatKey === chatKey) return { index: i, artifact };
  }
  return null;
}
function installPipelineEventHandlers() {
  const router = foundationKernel.services.get(EVENT_ROUTER);
  const cleanups = [
    router.subscribe("message-created", (event) => scheduleMessage(event.payload, false)),
    router.subscribe("message-changed", (event) => {
      scheduleHistoryRebuild(event.payload, reasonForChangedEvent(event.sourceEvent), 300, event.sourceEvent);
    }),
    router.subscribe("message-removed", (event) => {
      void removeMessageArtifact(event.payload);
    }),
    router.subscribe("chat-changed", (event) => {
      clearAllQuarantines();
      taskQueue.cancelAllExceptChat(event.scope.chatKey);
      unifiedFactScheduler.cancelAllExceptChat(event.scope.chatKey);
      lorebookPublishScheduler.cancelAllExceptChat(event.scope.chatKey);
    }),
    router.subscribe("chat-created", (event) => {
      clearAllQuarantines();
      taskQueue.cancelAllExceptChat(event.scope.chatKey);
      unifiedFactScheduler.cancelAllExceptChat(event.scope.chatKey);
      lorebookPublishScheduler.cancelAllExceptChat(event.scope.chatKey);
    })
  ];
  return () => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    for (const timer of historyRebuildTimers.values()) window.clearTimeout(timer);
    historyRebuildTimers.clear();
    pendingHistoryStarts.clear();
  };
}

// src/ui/message-panel.ts
init_utils();

// src/ui/workspace.ts
init_constants();
init_utils();

// src/domain/graph.ts
function nodeTypeFor(table) {
  if (table === "focus") return "focus";
  if (table === "characters") return "character";
  if (table === "items") return "item";
  if (table === "events") return "event";
  if (table === "regions" || table === "spacetime") return "region";
  return null;
}
function compactLabel(value) {
  const text = String(value || "").trim();
  return text.length > 24 ? `${text.slice(0, 23)}\u2026` : text;
}
function relationText(row) {
  return `${row.title}
${row.content}
${row.status}
${row.keywords.join(" ")}`.toLowerCase();
}
function mentions(row, node) {
  const label = node.label.trim().toLowerCase();
  return label.length >= 2 && relationText(row).includes(label);
}
function uniquePairKey(a, b, label) {
  const [left, right] = [a, b].sort();
  return `${left}|${right}|${label}`;
}
function buildRelationshipGraph(snapshot, scope = "relations") {
  if (!snapshot) return { nodes: [], edges: [] };
  const nodes = [];
  const nodeById = /* @__PURE__ */ new Map();
  const rowsByNode = /* @__PURE__ */ new Map();
  const nodeByEntityId = /* @__PURE__ */ new Map();
  const tables = scope === "relations" ? ["focus", "characters"] : ["focus", "characters", "items", "events", "regions", "spacetime"];
  for (const table of tables) {
    const type = nodeTypeFor(table);
    if (!type) continue;
    const seenFocusNames = /* @__PURE__ */ new Set();
    for (const row of snapshot[table]) {
      if (table === "focus") {
        const identity = normalizeIdentityName(row.title);
        if (identity && seenFocusNames.has(identity)) continue;
        if (identity) seenFocusNames.add(identity);
      }
      const id = `${table}:${row.id}`;
      const node = {
        id,
        label: String(row.title || "\u672A\u547D\u540D").trim(),
        type,
        detail: row.content,
        status: row.status,
        existence: row.lifecycle?.existence,
        activity: row.lifecycle?.activity,
        memory: row.lifecycle?.memory
      };
      nodes.push(node);
      nodeById.set(id, node);
      rowsByNode.set(id, row);
      nodeByEntityId.set(row.id, node);
    }
  }
  const edges = [];
  const seenEdges = /* @__PURE__ */ new Set();
  let relationIndex = 0;
  for (const row of snapshot.relationships) {
    const explicitSource = row.sourceEntityId ? nodeByEntityId.get(row.sourceEntityId) : void 0;
    const explicitTarget = row.targetEntityId ? nodeByEntityId.get(row.targetEntityId) : void 0;
    if (explicitSource && explicitTarget && explicitSource.id !== explicitTarget.id) {
      const key = uniquePairKey(explicitSource.id, explicitTarget.id, row.title);
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        edges.push({
          id: `edge:${row.id}:explicit`,
          source: explicitSource.id,
          target: explicitTarget.id,
          label: compactLabel(row.title),
          detail: row.content
        });
      }
      continue;
    }
    const matched = nodes.filter((node) => mentions(row, node));
    if (matched.length >= 2) {
      const source = matched[0];
      for (const target of matched.slice(1, 4)) {
        const key = uniquePairKey(source.id, target.id, row.title);
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
        edges.push({
          id: `edge:${row.id}:${target.id}`,
          source: source.id,
          target: target.id,
          label: compactLabel(row.title),
          detail: row.content
        });
      }
      continue;
    }
    const relationNode = {
      id: `relationship:${row.id}`,
      label: compactLabel(row.title || `\u5173\u7CFB${relationIndex + 1}`),
      type: "relationship",
      detail: row.content,
      status: row.status,
      existence: row.lifecycle?.existence,
      activity: row.lifecycle?.activity,
      memory: row.lifecycle?.memory
    };
    relationIndex += 1;
    nodes.push(relationNode);
    nodeById.set(relationNode.id, relationNode);
    if (matched.length === 1) {
      edges.push({
        id: `edge:${row.id}:single`,
        source: matched[0].id,
        target: relationNode.id,
        label: compactLabel(row.status || "\u5173\u7CFB"),
        detail: row.content
      });
    }
  }
  if (scope === "world") {
    const contextualTypes = /* @__PURE__ */ new Set(["item", "event", "region"]);
    const characters = nodes.filter(
      (node) => node.type === "character" || node.type === "focus"
    );
    const contextual = nodes.filter((node) => contextualTypes.has(node.type));
    for (const character of characters) {
      const row = rowsByNode.get(character.id);
      if (!row) continue;
      const text = relationText(row);
      for (const target of contextual) {
        const label = target.label.toLowerCase();
        if (label.length < 2 || !text.includes(label)) continue;
        const key = uniquePairKey(character.id, target.id, "\u5173\u8054");
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
        edges.push({
          id: `context:${character.id}:${target.id}`,
          source: character.id,
          target: target.id,
          label: "\u5173\u8054",
          detail: row.content
        });
      }
    }
  }
  return { nodes, edges };
}

// src/ui/workspace.ts
init_task_queue();
init_repository();

// src/maintenance/recovery.ts
init_constants();
init_utils();
init_repository();
async function buildRecoveryBundleForCurrentChat() {
  const chatKey = currentChatKey();
  return {
    format: "mirror-abyss-recovery-bundle",
    version: VERSION,
    exportedAt: nowIso(),
    chatKey,
    chatState: await getChatState(chatKey),
    lorebookOutbox: await getLorebookOutboxRecords(chatKey),
    localCommits: await getLocalCommitRecords(chatKey),
    operationLog: await getOperationLog(chatKey),
    migrationBackups: await getMigrationBackups(chatKey)
  };
}
async function downloadRecoveryBundleForCurrentChat() {
  const bundle = await buildRecoveryBundleForCurrentChat();
  const filename = `mirror-abyss-recovery-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.json`;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  await safeAppendOperationLog(bundle.chatKey, {
    category: "recovery",
    action: "export",
    state: "success",
    detail: filename
  });
  return filename;
}
async function cleanupRecoveryHistoryForCurrentChat(options = {}) {
  const chatKey = currentChatKey();
  const outbox = await pruneLorebookOutbox(chatKey, Math.max(0, options.keepOutbox ?? 50));
  const localCommits = await pruneLocalCommits(chatKey, Math.max(0, options.keepLocalCommits ?? 50));
  const backups = await getMigrationBackups(chatKey);
  const remove = backups.slice(Math.max(0, options.keepBackups ?? 5));
  await Promise.all(remove.map((backup) => removeMigrationBackup(chatKey, backup.id)));
  await safeAppendOperationLog(chatKey, {
    category: "recovery",
    action: "cleanup",
    state: "success",
    detail: `outbox=${outbox}; local=${localCommits}; backups=${remove.length}`
  });
  return { outbox, localCommits, backups: remove.length };
}

// src/maintenance/reset.ts
init_constants();
init_utils();
init_repository();
function clearArtifactsFromCurrentMessages() {
  let count = 0;
  for (const message of getChat()) {
    if (message?.extra?.[MODULE_NAME]) {
      delete message.extra[MODULE_NAME];
      count += 1;
    }
  }
  return count;
}
async function resetCurrentGame() {
  const context = getContext();
  const oldChatKey = currentChatKey();
  clearAllQuarantines();
  let lorebook = { name: "", removed: 0 };
  let lorebookError;
  try {
    lorebook = await clearManagedLorebookForCurrentChat(true);
  } catch (error) {
    lorebookError = toErrorMessage(error);
  }
  const clearedMessages = clearArtifactsFromCurrentMessages();
  const localCommits = await getLocalCommitRecords(oldChatKey);
  const unresolvedLocalCommit = localCommits.some((record) => record.state === "prepared" || record.state === "committing");
  await clearChatStorage(oldChatKey, {
    preserveOutbox: Boolean(lorebookError),
    preserveLocalCommits: unresolvedLocalCommit,
    preserveBackups: true
  });
  if (context.chatMetadata?.[MODULE_NAME]) delete context.chatMetadata[MODULE_NAME];
  await persistChat();
  await persistMetadata();
  return {
    chatKey: oldChatKey,
    clearedMessages,
    removedLorebookEntries: lorebook.removed,
    lorebookName: lorebook.name,
    lorebookError
  };
}
async function clearAllLocalMirrorAbyssCache() {
  const context = getContext();
  clearAllQuarantines();
  const clearedMessages = clearArtifactsFromCurrentMessages();
  await clearAllStorage();
  if (context.chatMetadata?.[MODULE_NAME]) delete context.chatMetadata[MODULE_NAME];
  await persistChat();
  await persistMetadata();
  return { clearedMessages };
}

// src/ui/diagnostics.ts
init_constants();
init_repository();
init_repository();
init_chat_scope();
async function runDiagnostics() {
  const checks = [];
  const context = tryGetContext();
  const kernel = foundationKernel.status();
  checks.push({
    id: "foundationKernel",
    label: "Foundation Kernel",
    status: kernel.state === "ready" ? "ok" : kernel.state === "degraded" ? "warn" : "error",
    detail: `${kernel.state} / ${kernel.stage}${kernel.lastError ? `\uFF1A${kernel.lastError}` : ""}`
  });
  const scope = context ? chatScopeManager.current() : null;
  checks.push({
    id: "chatScope",
    label: "\u804A\u5929\u4F5C\u7528\u57DF",
    status: scope?.persistent ? "ok" : "warn",
    detail: scope ? `${scope.persistent ? "\u5DF2\u4FDD\u5B58\u804A\u5929" : "\u672A\u4FDD\u5B58\u804A\u5929\uFF0C\u4EC5\u5185\u5B58\u6682\u5B58"}\uFF1Brevision=${scope.revision}` : "\u4E0D\u53EF\u7528"
  });
  checks.push({
    id: "context",
    label: "SillyTavern\u4E0A\u4E0B\u6587",
    status: context ? "ok" : "error",
    detail: context ? "\u5DF2\u8FDE\u63A5" : "\u4E0D\u53EF\u7528"
  });
  checks.push({
    id: "generateRaw",
    label: "\u5F53\u524D\u8FDE\u63A5\u539F\u59CB\u8C03\u7528",
    status: typeof context?.generateRaw === "function" ? "ok" : "warn",
    detail: typeof context?.generateRaw === "function" ? "generateRaw\u53EF\u7528" : "\u5F53\u524D\u8FDE\u63A5\u4E0D\u53EF\u7528\uFF0C\u8BF7\u914D\u7F6E SillyTavern Connection Profile"
  });
  const coordinator3 = foundationKernel.services.tryGet(CROSS_TAB_COORDINATOR);
  const coordination = coordinator3?.snapshot();
  checks.push({
    id: "crossTabCoordinator",
    label: "\u8DE8\u6807\u7B7E\u534F\u8C03",
    status: coordination?.mode === "memory" ? "warn" : coordination ? "ok" : "error",
    detail: coordination ? `${coordination.mode}\uFF1B\u6D3B\u52A8\u79DF\u7EA6 ${coordination.active.length}` : "\u4E0D\u53EF\u7528"
  });
  checks.push({
    id: "nativeInvocation",
    label: "SillyTavern \u539F\u751F\u6A21\u578B\u8C03\u7528",
    status: typeof context?.generateRaw === "function" ? "ok" : "warn",
    detail: "\u955C\u6E0A\u53EA\u7EC4\u88C5\u63D0\u793A\u8BCD\u4E0E\u4EFB\u52A1\u72B6\u6001\uFF1B\u6A21\u578B\u4F20\u8F93\u7531 SillyTavern \u5F53\u524D\u8FDE\u63A5\u6216 Connection Profile \u6267\u884C"
  });
  checks.push({
    id: "connectionService",
    label: "Connection Profile\u9694\u79BB\u8C03\u7528",
    status: typeof context?.ConnectionManagerRequestService?.sendRequest === "function" ? "ok" : "warn",
    detail: typeof context?.ConnectionManagerRequestService?.sendRequest === "function" ? "ConnectionManagerRequestService\u53EF\u7528\uFF0C\u4E0D\u9700\u8981\u5207\u6362\u5168\u5C40\u8FDE\u63A5" : "\u4E0D\u53EF\u7528\uFF1B\u5C06\u4F7F\u7528\u5F53\u524D SillyTavern \u8FDE\u63A5"
  });
  checks.push({
    id: "settingsPanel",
    label: "\u6269\u5C55\u8BBE\u7F6E\u5165\u53E3",
    status: document.querySelector("#ma11-settings-root") ? "ok" : "warn",
    detail: document.querySelector("#ma11-settings-root") ? "\u5DF2\u6302\u8F7D" : "\u5C1A\u672A\u6302\u8F7D"
  });
  checks.push({
    id: "storage",
    label: "\u6D4F\u89C8\u5668\u6570\u636E\u5B58\u50A8",
    status: globalThis.SillyTavern?.libs?.localforage ? "ok" : "warn",
    detail: globalThis.SillyTavern?.libs?.localforage ? "\u4F7F\u7528localforage" : "\u4F7F\u7528localStorage\u964D\u7EA7"
  });
  const server = context ? await checkServerConnection() : { ok: false, detail: "\u4E0A\u4E0B\u6587\u4E0D\u53EF\u7528" };
  checks.push({
    id: "server",
    label: "\u9152\u9986\u670D\u52A1\u5668\u4E0E\u4F1A\u8BDD",
    status: server.ok ? "ok" : "error",
    detail: server.detail
  });
  const storageKeys = await listMirrorAbyssStorageKeys().catch(() => []);
  checks.push({
    id: "storageKeys",
    label: "\u955C\u6E0A\u672C\u5730\u7F13\u5B58",
    status: "ok",
    detail: `${storageKeys.length} \u4E2A\u672C\u5730\u8BB0\u5F55\u952E`
  });
  if (context) {
    const queueTasks = await getQueueTasks(currentChatKey()).catch(() => []);
    checks.push({
      id: "persistentTasks",
      label: "\u6301\u4E45\u5316\u4EFB\u52A1\u8BB0\u5F55",
      status: queueTasks.some((task) => task.state === "failed") ? "warn" : "ok",
      detail: `${queueTasks.length} \u6761\u4EFB\u52A1\u8BB0\u5F55\uFF1B\u8FD0\u884C\u4E2D ${queueTasks.filter((task) => task.state === "running" || task.state === "queued").length} \u6761`
    });
  }
  if (context) {
    const outbox = await getLorebookOutboxRecords(currentChatKey()).catch(() => []);
    const active = outbox.filter((record) => !["committed", "rolled_back", "cancelled", "conflict"].includes(record.state));
    const conflicts = outbox.filter((record) => record.state === "conflict");
    checks.push({
      id: "lorebookOutbox",
      label: "\u4E16\u754C\u4E66\u4E8B\u52A1 Outbox",
      status: conflicts.length ? "error" : active.length ? "warn" : "ok",
      detail: `${outbox.length} \u6761\u4E8B\u52A1\uFF1B\u5F85\u6062\u590D ${active.length}\uFF1B\u51B2\u7A81 ${conflicts.length}`
    });
  }
  if (context) {
    const localCommits = await getLocalCommitRecords(currentChatKey()).catch(() => []);
    const pending = localCommits.filter((record) => record.state === "prepared" || record.state === "committing" || record.state === "committed" && !record.messageAttached);
    const conflicts = localCommits.filter((record) => record.state === "conflict");
    checks.push({
      id: "localCommitJournal",
      label: "\u603B\u7ED3\u4E0E\u6C89\u964D\u63D0\u4EA4\u65E5\u5FD7",
      status: conflicts.length ? "error" : pending.length ? "warn" : "ok",
      detail: `${localCommits.length} \u6761\u63D0\u4EA4\uFF1B\u5F85\u6062\u590D ${pending.length}\uFF1B\u51B2\u7A81 ${conflicts.length}`
    });
    const state2 = await getChatState(currentChatKey());
    const rebuild = state2.historyRebuild;
    checks.push({
      id: "historyConsistency",
      label: "\u603B\u7ED3\u4F9D\u8D56\u4E00\u81F4\u6027",
      status: rebuild?.state === "failed" ? "error" : rebuild ? "warn" : "ok",
      detail: rebuild ? `${rebuild.state}\uFF1B\u4ECE\u7B2C ${rebuild.startIndex + 1} \u6761\u6D88\u606F\u91CD\u5EFA\uFF1B\u539F\u56E0 ${rebuild.reason}${rebuild.error ? `\uFF1B${rebuild.error}` : ""}` : `\u4E00\u81F4\uFF1Brevision=${state2.historyRevision ?? 0}`
    });
    checks.push({
      id: "migration",
      label: "\u65E7\u7248\u6570\u636E\u8FC1\u79FB",
      status: (state2.migrationVersion ?? 0) >= 4 ? "ok" : "warn",
      detail: (state2.migrationVersion ?? 0) >= 4 ? `\u8FC1\u79FB\u7248\u672C ${state2.migrationVersion}` : "\u5C1A\u672A\u5B8C\u6210\u5F53\u524D\u804A\u5929\u7684\u4FDD\u5B88\u8FC1\u79FB\u68C0\u67E5"
    });
    checks.push({
      id: "factProjection",
      label: "\u7EDF\u4E00\u4E8B\u5B9E\u786E\u5B9A\u6027\u5206\u53D1",
      status: (state2.factSchemaVersion ?? 0) >= 2 ? "ok" : "warn",
      detail: (state2.factSchemaVersion ?? 0) >= 2 ? `\u4E8B\u5B9E\u5305 v${state2.factSchemaVersion}\uFF1B\u7126\u70B9\u8EAB\u4EFD ${state2.focusRegistry?.length ?? 0} \u6761` : "\u5F53\u524D\u804A\u5929\u5C1A\u672A\u7531 v2 \u4E8B\u5B9E\u5305\u66F4\u65B0\uFF1B\u4E0B\u4E00\u8F6E\u6216\u5386\u53F2\u91CD\u5EFA\u540E\u81EA\u52A8\u8FC1\u79FB"
    });
    const currentFocusMatches = (state2.focusRegistry ?? []).filter((item2) => item2.focusId === state2.currentFocusId);
    checks.push({
      id: "focusIdentity",
      label: "\u7126\u70B9\u5361\u552F\u4E00\u6027",
      status: state2.currentFocusId && currentFocusMatches.length !== 1 ? "warn" : "ok",
      detail: state2.currentFocusId ? `\u5F53\u524D\u7126\u70B9 ${state2.currentFocusId}\uFF1B\u6CE8\u518C\u8868 ${state2.focusRegistry?.length ?? 0} \u6761` : "\u5C1A\u672A\u5EFA\u7ACB\u7A33\u5B9A\u7126\u70B9\u8EAB\u4EFD\uFF1B\u4E0B\u4E00\u6B21\u4E8B\u5B9E\u63D0\u53D6\u65F6\u5EFA\u7ACB"
    });
  }
  const settings = context ? getSettings() : null;
  if (settings) {
    const revisionConnection = settings?.connections.revision;
    const revisionProfileMissing = Boolean(
      settings.auditEnabled && settings.auditFailAction === "revise" && revisionConnection?.mode === "profile" && !revisionConnection.profileId.trim()
    );
    checks.push({
      id: "revision",
      label: "\u5B9A\u5411\u4FEE\u6B63\u914D\u7F6E",
      status: revisionProfileMissing ? "error" : "ok",
      detail: settings?.auditFailAction === "revise" ? revisionProfileMissing ? "\u4FEE\u6B63\u6A21\u578B\u5DF2\u9009\u62E9 Connection Profile\uFF0C\u4F46\u5C1A\u672A\u9009\u62E9\u6709\u6548\u914D\u7F6E" : `\u5DF2\u542F\u7528\uFF0C\u6700\u591A${settings.maxRevisionAttempts}\u6B21\uFF0C\u5931\u8D25\u540E${settings.revisionFallbackAction}` : "\u672A\u542F\u7528\u81EA\u52A8\u4FEE\u6B63"
    });
  }
  if (context) {
    const state2 = await getChatState(currentChatKey());
    checks.push({
      id: "sync",
      label: "\u6700\u8FD1\u4E16\u754C\u4E66\u540C\u6B65",
      status: state2.lastSyncStatus === "failed" ? "error" : state2.lastSyncStatus === "success" ? "ok" : "warn",
      detail: state2.lastSyncError || state2.lastSyncAt || "\u5C1A\u672A\u540C\u6B65"
    });
  }
  return checks;
}
async function diagnosticReport() {
  const context = tryGetContext();
  const chatKey = context ? currentChatKey() : "unavailable";
  return {
    version: VERSION,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    userAgent: navigator.userAgent,
    location: location.origin,
    chatKey,
    kernel: foundationKernel.status(),
    scope: context ? chatScopeManager.current() : null,
    nativeInvocation: { current: typeof context?.generateRaw === "function", profiles: typeof context?.ConnectionManagerRequestService?.sendRequest === "function" },
    crossTabCoordinator: foundationKernel.services.tryGet(CROSS_TAB_COORDINATOR)?.snapshot() ?? null,
    checks: await runDiagnostics(),
    settings: context ? { ...getSettings(), auditPrompt: getSettings().auditPrompt ? "[\u5DF2\u586B\u5199]" : "", revisionPrompt: getSettings().revisionPrompt ? "[\u5DF2\u586B\u5199]" : "" } : null,
    chatState: context ? await getChatState(chatKey) : null,
    taskLog: context ? await getTaskLog(chatKey) : [],
    localCommits: context ? await getLocalCommitRecords(chatKey) : [],
    operationLog: context ? await getOperationLog(chatKey) : [],
    migrationBackups: context ? (await getMigrationBackups(chatKey)).map((item2) => ({ id: item2.id, createdAt: item2.createdAt, preview: item2.preview })) : [],
    lorebookOutbox: context ? (await getLorebookOutboxRecords(chatKey)).map((record) => ({
      id: record.id,
      intentKey: record.intentKey,
      operation: record.operation,
      bookName: record.bookName,
      state: record.state,
      attempts: record.attempts,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      error: record.error,
      conflictDetail: record.conflictDetail
    })) : []
  };
}

// src/ui/workspace.ts
var selectedMessageIndex = null;
var rendering = false;
var queueUnsubscribe = null;
var selectedGraphNodeId = null;
function clampGraphZoom(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(2.5, Math.max(0.5, Math.round(numeric * 20) / 20));
}
function root() {
  let element = document.querySelector("#ma11-workspace");
  if (element) return element;
  document.body.insertAdjacentHTML(
    "beforeend",
    `
    <div id="ma11-workspace" class="ma11-workspace" hidden>
      <div class="ma11-shell" role="dialog" aria-modal="true" aria-label="\u955C\u6E0A\u63A7\u5236\u4E2D\u5FC3">
        <header class="ma11-header">
          <div>
            <div class="ma11-brand">\u955C\u6E0A <span>${VERSION}</span></div>
            <div class="ma11-subtitle">正文准入 → 活跃表格 → 事件条目 → 长期总结</div>
          </div>
          <div class="ma11-header-actions">
            <button class="menu_button ma11-header-task-button" data-ma11-action="open-tasks" type="button" title="\u67E5\u770B\u4EFB\u52A1\u72B6\u6001">
              <i class="fa-solid fa-list-check"></i><span>\u4EFB\u52A1</span><b data-ma11-task-badge hidden>0</b>
            </button>
            <button class="ma11-icon-button" data-ma11-action="close" aria-label="\u5173\u95ED">\xD7</button>
          </div>
        </header>
        <nav class="ma11-tabs" aria-label="\u955C\u6E0A\u529F\u80FD">
          ${[
      ["overview", "\u603B\u89C8"],
      ["tasks", "\u4EFB\u52A1"],
      ["tables", "\u72B6\u6001\u8868"],
      ["graph", "\u5173\u7CFB\u56FE\u8C31"],
      ["summaries", "\u603B\u7ED3"],
      ["audit", "\u89C4\u5219\u5BA1\u6838"],
      ["sync", "\u4E16\u754C\u4E66"],
      ["settings", "\u6A21\u578B\u4E0E\u8BBE\u7F6E"],
      ["diagnostics", "\u8BCA\u65AD"]
    ].map(
      ([key, label]) => `<button data-ma11-tab="${key}">${label}</button>`
    ).join("")}
        </nav>
        <main id="ma11-workspace-content" class="ma11-content"></main>
      </div>
      <div class="ma11-editor-backdrop" hidden>
        <form class="ma11-editor" id="ma11-row-editor">
          <header><b>\u7F16\u8F91\u72B6\u6001\u884C</b><button type="button" data-ma11-action="close-editor">\xD7</button></header>
          <input type="hidden" name="tableKey" />
          <input type="hidden" name="rowId" />
          <label>\u5BF9\u8C61<input name="title" required maxlength="240" /></label>
          <label>\u5F53\u524D\u4E8B\u5B9E<textarea name="content" rows="6" maxlength="12000"></textarea></label>
          <label>\u72B6\u6001<input name="status" maxlength="120" /></label>
          <label>\u5173\u952E\u8BCD\uFF08\u9017\u53F7\u5206\u9694\uFF09<input name="keywords" maxlength="800" /></label>
          <label class="ma11-switch"><input type="checkbox" name="locked" /><span>\u73A9\u5BB6\u9501\u5B9A\uFF08\u81EA\u52A8\u6574\u7406\u4E0D\u5F97\u8986\u76D6\uFF09</span></label>
          <fieldset class="ma11-lifecycle-editor" data-ma11-lifecycle-fields hidden>
            <legend>\u4EBA\u7269\u751F\u547D\u5468\u671F</legend>
            <div class="ma11-editor-grid">
              <label>\u5B58\u5728\u72B6\u6001<select name="existence">
                ${["\u5B58\u6D3B", "\u6B7B\u4EA1\u5DF2\u786E\u8BA4", "\u5B58\u5728\u672A\u77E5", "\u5931\u8E2A", "\u8EAB\u4EFD\u5B58\u7591", "\u865A\u6784\u6216\u8BEF\u8BA4\u5DF2\u786E\u8BA4", "\u5B58\u5728\u88AB\u62B9\u9664", "\u672A\u6807\u6CE8"].map((value) => `<option value="${value}">${value}</option>`).join("")}
              </select></label>
              <label>\u6D3B\u8DC3\u72B6\u6001<select name="activity">
                ${["\u5F53\u524D\u5728\u573A", "\u5F53\u524D\u76F8\u5173", "\u79BB\u573A\u4F46\u4ECD\u6D3B\u8DC3", "\u4F11\u7720", "\u957F\u671F\u4F11\u7720", "\u5DF2\u5F52\u6863", "\u672A\u6807\u6CE8"].map((value) => `<option value="${value}">${value}</option>`).join("")}
              </select></label>
              <label>\u8BB0\u5FC6\u72B6\u6001<select name="memory">
                ${["\u5E7F\u6CDB\u8BB0\u5F97", "\u90E8\u5206\u4EBA\u7269\u8BB0\u5F97", "\u4EC5\u8BB0\u5F55\u7559\u5B58", "\u4EC5\u75D5\u8FF9\u7559\u5B58", "\u65E0\u4EBA\u53EF\u786E\u8BA4\u8BB0\u5F97", "\u8BB0\u5FC6\u88AB\u7BE1\u6539", "\u8BB0\u5FC6\u88AB\u62B9\u9664", "\u672A\u6807\u6CE8"].map((value) => `<option value="${value}">${value}</option>`).join("")}
              </select></label>
              <label>\u8BC1\u636E\u7B49\u7EA7<select name="evidenceLevel">
                ${["\u5DF2\u786E\u8BA4", "\u53EF\u9760\u8BB0\u5F55", "\u591A\u65B9\u9648\u8FF0", "\u5355\u65B9\u9648\u8FF0", "\u63A8\u6D4B", "\u672A\u77E5"].map((value) => `<option value="${value}">${value}</option>`).join("")}
              </select></label>
            </div>
            <label>\u5224\u65AD\u4F9D\u636E<textarea name="evidence" rows="3" maxlength="4000"></textarea></label>
            <label>\u53EF\u80FD\u56DE\u6D41\u6761\u4EF6\uFF08\u6BCF\u884C\u4E00\u9879\uFF09<textarea name="returnConditions" rows="3" maxlength="3000"></textarea></label>
            <label>\u963B\u6B62\u56DE\u6D41\u6761\u4EF6\uFF08\u6BCF\u884C\u4E00\u9879\uFF09<textarea name="returnBlockers" rows="3" maxlength="3000"></textarea></label>
          </fieldset>
          <footer><button type="button" data-ma11-action="close-editor">\u53D6\u6D88</button><button type="submit">\u4FDD\u5B58</button></footer>
        </form>
      </div>
    </div>`
  );
  element = document.querySelector("#ma11-workspace");
  bindWorkspace(element);
  queueUnsubscribe ||= taskQueue.subscribe(() => void renderWorkspace());
  return element;
}
function currentArtifact() {
  if (selectedMessageIndex !== null) {
    const artifact = getArtifactAt(selectedMessageIndex);
    if (artifact) return { index: selectedMessageIndex, artifact };
  }
  return latestArtifact();
}
function statusText(value) {
  const map = {
    idle: "\u7B49\u5F85",
    queued: "\u6392\u961F",
    running: "\u5904\u7406\u4E2D",
    success: "\u6210\u529F",
    failed: "\u5931\u8D25",
    skipped: "\u8DF3\u8FC7",
    blocked: "\u963B\u65AD"
  };
  return map[value] || value;
}
function statusClass(value) {
  if (value === "success" || value === "skipped") return "success";
  if (value === "failed" || value === "blocked") return "danger";
  if (value === "running" || value === "queued") return "working";
  return "neutral";
}
function latestTasksByKey(tasks) {
  const latest = /* @__PURE__ */ new Map();
  for (const task of [...tasks].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) latest.set(task.key, task);
  return [...latest.values()];
}
function queueStateText(value) {
  const map = {
    queued: "\u7B49\u5F85\u6267\u884C",
    running: "\u8FD0\u884C\u4E2D",
    success: "\u5DF2\u5B8C\u6210",
    failed: "\u5931\u8D25",
    cancelled: "\u5DF2\u53D6\u6D88",
    stale: "\u5DF2\u5931\u6548"
  };
  return map[value];
}
function queueStateClass(value) {
  if (value === "success") return "success";
  if (value === "failed") return "danger";
  if (value === "running" || value === "queued") return "working";
  return "neutral";
}
function queueStateIcon(value) {
  if (value === "success") return "fa-circle-check";
  if (value === "failed") return "fa-circle-exclamation";
  if (value === "running") return "fa-spinner fa-spin";
  if (value === "queued") return "fa-clock";
  if (value === "cancelled") return "fa-ban";
  return "fa-circle-minus";
}
function rebuildPhaseText(value) {
  const map = {
    planning: "\u68C0\u67E5\u7F13\u5B58\u4E0E\u5931\u6548\u533A\u6BB5",
    "replaying-cache": "\u590D\u7528\u65E2\u6709\u4E8B\u5B9E\u5305",
    "reading-missing": "\u56DE\u8BFB\u7F3A\u5931\u6216\u5DF2\u4FEE\u6539\u6B63\u6587",
    "updating-long-term": "\u66F4\u65B0\u957F\u671F\u8109\u7EDC",
    syncing: "\u53D1\u5E03\u6700\u7EC8\u4E16\u754C\u4E66"
  };
  return value ? map[value] || value : "\u51C6\u5907\u4E2D";
}
function historyRebuildStatusHtml(record) {
  const total = record.totalMessages ?? 0;
  const processed = record.processedMessages ?? 0;
  const progress = total ? Math.max(0, Math.min(100, Math.round(processed / total * 100))) : 0;
  return `<div class="ma11-status-strip ${record.state === "failed" ? "danger" : "working"}">
    <div class="ma11-status-strip-main">
      <span class="ma11-status-icon"><i class="fa-solid ${record.state === "failed" ? "fa-circle-exclamation" : "fa-arrows-rotate"}"></i></span>
      <div><b>\u5386\u53F2\u91CD\u5EFA \xB7 ${escapeHtml(rebuildPhaseText(record.phase))}</b><span>${processed}/${total} \u6761 \xB7 ${record.completedBatches ?? 0}/${record.totalBatches ?? 0} \u6279</span></div>
      <strong>${progress}%</strong>
    </div>
    <div class="ma11-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
    <div class="ma11-rebuild-metrics">
      <span><i class="fa-solid fa-database"></i> \u590D\u7528\u4E8B\u5B9E ${record.reusedMessages ?? 0} \u6761</span>
      <span><i class="fa-solid fa-file-lines"></i> \u56DE\u8BFB\u6B63\u6587 ${record.rereadMessages ?? 0} \u6761</span>
      <span><i class="fa-solid fa-layer-group"></i> \u7F13\u5B58\u5305 ${record.reusedFactPackages ?? 0} \u4E2A</span>
      <span><i class="fa-solid fa-wand-magic-sparkles"></i> \u6A21\u578B\u6279\u6B21 ${record.rawBatches ?? 0} \u4E2A</span>
    </div>
    ${record.error ? `<div class="ma11-inline-error">${escapeHtml(record.error)}</div>` : ""}
  </div>`;
}
function taskDurationText(task) {
  const start = Date.parse(task.startedAt || task.createdAt);
  const end = Date.parse(task.finishedAt || (/* @__PURE__ */ new Date()).toISOString());
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "";
  const seconds = Math.max(0, Math.round((end - start) / 1e3));
  if (seconds < 60) return `${seconds} \u79D2`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes} \u5206 ${rest} \u79D2`;
}
function taskRangeText(task) {
  if (task.sourceStartIndex === void 0) return "";
  const end = task.sourceEndIndex ?? task.sourceStartIndex;
  return `\u6D88\u606F ${task.sourceStartIndex + 1}${end !== task.sourceStartIndex ? `\u2013${end + 1}` : ""}`;
}
function taskCardHtml(task) {
  const progress = task.progressTotal ? Math.max(0, Math.min(100, Math.round((task.progressCurrent ?? 0) / task.progressTotal * 100))) : void 0;
  const active = task.state === "queued" || task.state === "running";
  const isHistory = task.key.startsWith("history-rebuild:");
  const actions = active ? isHistory ? `<button type="button" data-ma11-action="pause-history-rebuild">\u6682\u505C</button><button type="button" class="danger" data-ma11-action="cancel-history-rebuild">\u53D6\u6D88</button>` : `<button type="button" data-ma11-cancel-task="${escapeHtml(task.id)}">\u53D6\u6D88</button>` : task.state === "failed" && isHistory ? `<button type="button" data-ma11-action="retry-history-rebuild">\u4ECE\u5931\u8D25\u6279\u6B21\u7EE7\u7EED</button>` : "";
  return `<article class="ma11-task-card ${queueStateClass(task.state)}">
    <header><div class="ma11-task-heading"><span class="ma11-task-state-icon"><i class="fa-solid ${queueStateIcon(task.state)}"></i></span><div><b>${escapeHtml(task.label)}</b><span class="ma11-task-substate">${queueStateText(task.state)}</span></div></div><time>${escapeHtml(new Date(task.updatedAt).toLocaleString())}</time></header>
    <div class="ma11-task-meta">
      ${taskRangeText(task) ? `<span>${escapeHtml(taskRangeText(task))}</span>` : ""}
      <span>${task.blocking ? "\u963B\u585E\u73A9\u5BB6" : "\u540E\u53F0\u4EFB\u52A1"}</span>
      <span>\u4F18\u5148\u7EA7\uFF1A${escapeHtml(task.priority || "\u9ED8\u8BA4")}</span>
      ${task.retries ? `<span>\u91CD\u8BD5 ${task.retries} \u6B21</span>` : ""}
      ${task.startedAt ? `<span>\u8017\u65F6\uFF1A${escapeHtml(taskDurationText(task))}</span>` : ""}
    </div>
    ${task.progressLabel ? `<p class="ma11-task-progress-label"><i class="fa-solid fa-wave-square"></i>${escapeHtml(task.progressLabel)}</p>` : ""}
    ${progress !== void 0 ? `<div class="ma11-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div><small>${task.progressCurrent ?? 0}/${task.progressTotal} \xB7 ${progress}%</small>` : ""}
    ${task.error ? `<div class="ma11-error-box"><b>\u5931\u8D25\u539F\u56E0</b><p>${escapeHtml(task.error)}</p></div>` : ""}
    ${actions ? `<footer class="ma11-actions">${actions}</footer>` : ""}
  </article>`;
}
async function tasksHtml() {
  const chatKey = currentChatKey();
  const live = taskQueue.list().filter((task) => task.chatKey === chatKey);
  const logs = await getTaskLog(chatKey);
  const byId = /* @__PURE__ */ new Map();
  for (const task of [...logs, ...live]) byId.set(task.id, task);
  const tasks = [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const latestStates = latestTasksByKey(tasks);
  const active = latestStates.filter((task) => task.state === "queued" || task.state === "running");
  const failed = latestStates.filter((task) => task.state === "failed");
  const completed = latestStates.filter((task) => task.state === "success");
  return `<section class="ma11-toolbar"><div><h2>\u4EFB\u52A1\u4E2D\u5FC3</h2><p>模型调用由 SillyTavern 异步执行；这里显示正文准入、表格、总结与发布的真实排队、进度和结果。</p></div><div class="ma11-actions"><button data-ma11-action="refresh-tasks">\u5237\u65B0</button><button data-ma11-action="open-diagnostics">\u8BCA\u65AD</button></div></section>
    <section class="ma11-task-summary-grid">
      <article class="ma11-card working"><b>${active.length}</b><span>\u8FD0\u884C\u6216\u6392\u961F</span></article>
      <article class="ma11-card danger"><b>${failed.length}</b><span>\u5931\u8D25</span></article>
      <article class="ma11-card success"><b>${completed.length}</b><span>\u5DF2\u5B8C\u6210</span></article>
    </section>
    <section class="ma11-card"><header><b>\u5F53\u524D\u4E0E\u6700\u8FD1\u4EFB\u52A1</b><span>${tasks.length} \u6761</span></header>
      <div class="ma11-task-center-list">${tasks.length ? tasks.slice(0, 40).map(taskCardHtml).join("") : '<p class="ma11-empty">\u5F53\u524D\u6CA1\u6709\u4EFB\u52A1\u8BB0\u5F55\u3002</p>'}</div>
    </section>`;
}
function updateWorkspaceTaskIndicator() {
  const workspace = document.querySelector("#ma11-workspace");
  if (!workspace) return;
  const tasks = latestTasksByKey(taskQueue.list().filter((task) => task.chatKey === currentChatKey()));
  const active = tasks.filter((task) => task.state === "queued" || task.state === "running").length;
  const failed = tasks.filter((task) => task.state === "failed").length;
  const button = workspace.querySelector(".ma11-header-task-button");
  const badge = workspace.querySelector("[data-ma11-task-badge]");
  if (!button || !badge) return;
  const count = active || failed;
  badge.hidden = count === 0;
  badge.textContent = String(count);
  button.classList.toggle("working", active > 0);
  button.classList.toggle("danger", active === 0 && failed > 0);
  button.title = active > 0 ? `${active} \u4E2A\u4EFB\u52A1\u8FD0\u884C\u4E2D` : failed > 0 ? `${failed} \u4E2A\u4EFB\u52A1\u5931\u8D25` : "\u4EFB\u52A1\u7A7A\u95F2";
}
function outboxStateText(value) {
  const map = {
    prepared: "\u5DF2\u51C6\u5907",
    committing: "\u6B63\u5728\u63D0\u4EA4",
    verify_pending: "\u7B49\u5F85\u56DE\u8BFB\u786E\u8BA4",
    committed: "\u5DF2\u63D0\u4EA4\u5E76\u6821\u9A8C",
    rollback_pending: "\u7B49\u5F85\u56DE\u6EDA\u786E\u8BA4",
    rolled_back: "\u5DF2\u5B89\u5168\u56DE\u6EDA",
    failed: "\u5931\u8D25",
    conflict: "\u68C0\u6D4B\u5230\u51B2\u7A81",
    cancelled: "\u5DF2\u53D6\u6D88"
  };
  return value ? map[value] || value : "\u5C1A\u65E0\u4E8B\u52A1";
}
function stageCards(artifact) {
  const stages = artifact?.stages;
  const rows2 = [
    ["audit", "正文准入 / 审核"],
    ["revision", "违规正文修正"],
    ["state", "正文 → 活跃表格"],
    ["summary", "表格 → 事件条目 → 大总结"],
    ["sync", "\u4E16\u754C\u4E66\u540C\u6B65"]
  ];
  return `<div class="ma11-stage-grid">${rows2.map(([key, label]) => {
    const stage = stages?.[key] ?? { status: "idle", attempts: 0 };
    return `<article class="ma11-stage-card ${statusClass(stage.status)}">
      <div><b>${label}</b><span>${statusText(stage.status)}</span></div>
      <small>\u5C1D\u8BD5 ${stage.attempts || 0} \u6B21</small>
      ${stage.error ? `<p>${escapeHtml(stage.error)}</p>` : ""}
    </article>`;
  }).join("")}</div>`;
}
function overviewHtml(artifactInfo) {
  const artifact = artifactInfo?.artifact;
  const rows2 = snapshotRowCount(artifact?.snapshot);
  const jobs = taskQueue.list().filter((task) => task.chatKey === currentChatKey()).slice(0, 5);
  return `
    <section class="ma11-hero">
      <div>
        <h2>${artifact ? `\u7B2C ${artifact.messageIndex + 1} \u6761\u6B63\u6587` : "\u5F53\u524D\u804A\u5929\u5C1A\u65E0\u955C\u6E0A\u8BB0\u5F55"}</h2>
        <p>${artifact ? `准入 ${escapeHtml(artifact.admission?.status === "approved" ? "已确认" : artifact.admission?.status || "待确认")} · 状态表 ${rows2} 条 · 更新时间 ${escapeHtml(new Date(artifact.updatedAt).toLocaleString())}` : "生成一条AI正文，或手动整理最新正文。"}</p>
      </div>
      <div class="ma11-actions">
        <button data-ma11-action="process-latest">\u6574\u7406\u6700\u65B0\u6B63\u6587</button>
        <button data-ma11-action="open-tables" ${artifact?.snapshot ? "" : "disabled"}>\u67E5\u770B\u72B6\u6001\u8868</button>
        <button data-ma11-action="open-graph" ${artifact?.snapshot ? "" : "disabled"}>\u5173\u7CFB\u56FE\u8C31</button>
      </div>
    </section>
    ${stageCards(artifact)}
    <section class="ma11-card">
      <header><b>\u4EFB\u52A1\u961F\u5217</b><span>${jobs.length ? `${jobs.length} \u6761\u6700\u8FD1\u4EFB\u52A1` : "\u7A7A\u95F2"}</span></header>
      <div class="ma11-task-list">
        ${jobs.length ? jobs.map((task) => `<div><span>${escapeHtml(task.label)}${task.sourceStartIndex !== void 0 ? ` \xB7 \u6D88\u606F ${task.sourceStartIndex + 1}${task.sourceEndIndex !== void 0 && task.sourceEndIndex !== task.sourceStartIndex ? `\u2013${task.sourceEndIndex + 1}` : ""}` : ""}${task.progressTotal ? ` \xB7 ${task.progressCurrent ?? 0}/${task.progressTotal}` : ""}${task.blocking ? " \xB7 \u963B\u585E\u73A9\u5BB6" : " \xB7 \u540E\u53F0"}</span><em class="${task.state}">${escapeHtml(task.progressLabel || task.state)}</em>${task.state === "queued" || task.state === "running" ? `<button type="button" data-ma11-cancel-task="${escapeHtml(task.id)}">\u53D6\u6D88</button>` : ""}</div>`).join("") : '<p class="ma11-empty">\u6CA1\u6709\u8FD0\u884C\u4E2D\u7684\u4EFB\u52A1\u3002</p>'}
      </div>
    </section>
    <section class="ma11-card ma11-note">
      <b>本版数据链</b>
      <p>正文是唯一事实源。审核可关闭；开启时只有通过或完成修正的最终正文才能进入后台表格任务。事件总结只读取事实包、活跃表格与既有事件ID；大总结只读取事件总结和上一版长期记录。关系图谱只读现有表格，供玩家观察，不调用模型、不写回数据，也不参与正文生成。</p>
    </section>`;
}
function lifecycleHtml(row) {
  const life = row.lifecycle;
  if (!life) return "";
  const chips = [
    ["\u5B58\u5728", life.existence],
    ["\u6D3B\u8DC3", life.activity],
    ["\u8BB0\u5FC6", life.memory],
    ["\u8BC1\u636E", life.evidenceLevel]
  ].map(([label, value]) => `<span class="ma11-life-chip"><small>${label}</small>${escapeHtml(value)}</span>`).join("");
  const conditions = [
    life.returnConditions.length ? `<p><b>\u56DE\u6D41\uFF1A</b>${escapeHtml(life.returnConditions.join("\uFF1B"))}</p>` : "",
    life.returnBlockers.length ? `<p><b>\u963B\u6B62\uFF1A</b>${escapeHtml(life.returnBlockers.join("\uFF1B"))}</p>` : ""
  ].join("");
  return `<div class="ma11-lifecycle-inline">${chips}${conditions}</div>`;
}
function tableHtml(artifactInfo) {
  const settings = getSettings();
  const artifact = artifactInfo?.artifact;
  const active = settings.ui.activeTable;
  const rows2 = artifact?.snapshot?.[active] ?? [];
  return `
    <section class="ma11-toolbar ma11-table-toolbar">
      <div class="ma11-table-tabs">${TABLE_KEYS.map((key) => `<button class="${key === active ? "active" : ""}" data-ma11-table="${key}">${TABLE_LABELS[key]} <span>${artifact?.snapshot?.[key]?.length ?? 0}</span></button>`).join("")}</div>
      <div class="ma11-actions"><button data-ma11-action="add-row" ${artifact?.snapshot ? "" : "disabled"}>\uFF0B \u6DFB\u52A0</button><button data-ma11-action="retry-state" ${artifactInfo ? "" : "disabled"}>\u91CD\u65B0\u6574\u7406</button></div>
    </section>
    <p class="ma11-table-hint">\u8868\u683C\u4FDD\u6301\u6A2A\u5411\u6392\u7248\u3002\u624B\u673A\u7AEF\u8BF7\u5728\u8868\u683C\u533A\u57DF\u5DE6\u53F3\u6ED1\u52A8\uFF0C\u4E0D\u4F1A\u518D\u628A\u4E2D\u6587\u538B\u6210\u7AD6\u6392\u3002</p>
    <section class="ma11-table-wrap" role="region" aria-label="${TABLE_LABELS[active]}\u72B6\u6001\u8868" tabindex="0">
      ${artifact?.snapshot ? `<table class="ma11-table">
        <colgroup><col class="ma11-col-index"/><col class="ma11-col-title"/><col class="ma11-col-content"/><col class="ma11-col-state"/><col class="ma11-col-meta"/><col class="ma11-col-actions"/></colgroup>
        <thead><tr><th>\u5E8F\u53F7</th><th>\u5BF9\u8C61</th><th>\u5F53\u524D\u8BB0\u5F55</th><th>\u72B6\u6001\u4E0E\u5173\u952E\u8BCD</th><th>\u6765\u6E90\u4E0E\u66F4\u65B0\u65F6\u95F4</th><th>\u64CD\u4F5C</th></tr></thead>
        <tbody>${rows2.length ? rows2.map(
    (row, index) => `<tr>
          <td>${index + 1}</td>
          <td class="ma11-cell-title"><b>${escapeHtml(row.title)}</b></td>
          <td class="ma11-cell-content">${escapeHtml(row.content)}</td>
          <td><div class="ma11-cell-status">${row.status ? `<span class="ma11-status-text">${escapeHtml(row.status)}</span>` : ""}${lifecycleHtml(row)}<div class="ma11-keyword-list">${row.keywords.map((word) => `<span class="ma11-keyword">${escapeHtml(word)}</span>`).join("")}</div></div></td>
          <td><div class="ma11-cell-meta"><span class="ma11-source ${row.source}">${row.source === "manual" || row.locked ? "\u73A9\u5BB6\u9501\u5B9A" : "\u81EA\u52A8"}</span><time>${escapeHtml(new Date(row.updatedAt).toLocaleString())}</time></div></td>
          <td><div class="ma11-row-actions"><button data-ma11-edit-row="${escapeHtml(row.id)}">\u7F16\u8F91</button><button class="danger" data-ma11-delete-row="${escapeHtml(row.id)}">\u5220\u9664</button></div></td>
        </tr>`
  ).join("") : `<tr><td colspan="6" class="ma11-empty">\u8BE5\u5206\u7C7B\u6682\u65E0\u8BB0\u5F55\u3002</td></tr>`}</tbody>
      </table>` : '<div class="ma11-empty-panel">\u5C1A\u65E0\u72B6\u6001\u8868\u3002\u70B9\u51FB\u201C\u6574\u7406\u6700\u65B0\u6B63\u6587\u201D\u3002</div>'}
    </section>`;
}
function graphNodePositions(graph) {
  const width = 1e3;
  const height = 680;
  const center = { x: width / 2, y: height / 2 };
  const groups = /* @__PURE__ */ new Map();
  for (const node of graph.nodes) {
    const key = node.type === "focus" ? "focus" : node.type === "character" ? "character" : node.type === "relationship" ? "relationship" : "world";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
  }
  const output = [];
  const focus = groups.get("focus") ?? [];
  focus.forEach(
    (node, index) => output.push({ ...node, x: center.x + index * 56, y: center.y })
  );
  const ring = (key, radiusX, radiusY, offset = 0) => {
    const nodes = groups.get(key) ?? [];
    nodes.forEach((node, index) => {
      const angle = offset + Math.PI * 2 * index / Math.max(nodes.length, 1);
      output.push({
        ...node,
        x: center.x + Math.cos(angle) * radiusX,
        y: center.y + Math.sin(angle) * radiusY
      });
    });
  };
  ring("character", 250, 185, -Math.PI / 2);
  ring("relationship", 365, 250, Math.PI / 6);
  ring("world", 455, 300, 0);
  if (!focus.length && output.length) {
    output[0].x = center.x;
    output[0].y = center.y;
  }
  return output;
}
function graphTypeLabel(type) {
  const labels = {
    focus: "\u7126\u70B9",
    character: "\u4EBA\u7269",
    relationship: "\u5173\u7CFB",
    item: "\u7269\u54C1",
    event: "\u4E8B\u4EF6",
    region: "\u533A\u57DF"
  };
  return labels[type];
}
function graphLifecycleClass(node) {
  if (node.existence === "\u6B7B\u4EA1\u5DF2\u786E\u8BA4") return "dead";
  if (node.existence === "\u5B58\u5728\u672A\u77E5" || node.existence === "\u8EAB\u4EFD\u5B58\u7591" || node.existence === "\u5931\u8E2A") return "uncertain";
  if (node.activity === "\u5DF2\u5F52\u6863") return "archived";
  if (node.activity === "\u957F\u671F\u4F11\u7720") return "long-dormant";
  if (node.activity === "\u4F11\u7720") return "dormant";
  return "";
}
function graphHtml(artifactInfo) {
  const settings = getSettings();
  const snapshot = artifactInfo?.artifact.snapshot;
  const graph = buildRelationshipGraph(snapshot, settings.ui.graphScope);
  const positioned = graphNodePositions(graph);
  const positions = new Map(positioned.map((node) => [node.id, node]));
  const selected = positioned.find((node) => node.id === selectedGraphNodeId) ?? positioned[0];
  if (selected && !selectedGraphNodeId) selectedGraphNodeId = selected.id;
  const zoom = clampGraphZoom(settings.ui.graphZoom);
  settings.ui.graphZoom = zoom;
  const edgeSvg = graph.edges.map((edge) => {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) return "";
    const mx = (source.x + target.x) / 2;
    const my = (source.y + target.y) / 2;
    return `<g class="ma11-graph-edge"><line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"><title>${escapeHtml(`${edge.label}\uFF1A${edge.detail}`)}</title></line>${graph.edges.length <= 18 ? `<text x="${mx}" y="${my}">${escapeHtml(edge.label)}</text>` : ""}</g>`;
  }).join("");
  const nodeSvg = positioned.map(
    (node) => `<g class="ma11-graph-node ${node.type} ${graphLifecycleClass(node)} ${selected?.id === node.id ? "selected" : ""}" data-ma11-graph-node="${escapeHtml(node.id)}" transform="translate(${node.x} ${node.y})" tabindex="0" role="button"><circle r="34"></circle><text text-anchor="middle" y="4">${escapeHtml(node.label.length > 10 ? `${node.label.slice(0, 9)}\u2026` : node.label)}</text><title>${escapeHtml(`${node.label}
${node.detail}`)}</title></g>`
  ).join("");
  const graphWidth = Math.round(1e3 * zoom);
  const graphHeight = Math.round(680 * zoom);
  return `
    <section class="ma11-toolbar ma11-graph-toolbar">
      <div><h2>\u5173\u7CFB\u56FE\u8C31</h2><p>\u7531\u5F53\u524D\u72B6\u6001\u8868\u751F\u6210\uFF0C\u53EA\u8BFB\u5C55\u793A\uFF0C\u4E0D\u989D\u5916\u8C03\u7528\u6A21\u578B\u3002</p></div>
      <div class="ma11-graph-toolbar-actions">
        <div class="ma11-segmented"><button class="${settings.ui.graphScope === "relations" ? "active" : ""}" data-ma11-graph-scope="relations">\u4EBA\u7269\u5173\u7CFB</button><button class="${settings.ui.graphScope === "world" ? "active" : ""}" data-ma11-graph-scope="world">\u5168\u5C40\u7F51\u7EDC</button></div>
        <div class="ma11-graph-zoom" aria-label="\u56FE\u8C31\u7F29\u653E">
          <button type="button" data-ma11-graph-zoom="out" title="\u7F29\u5C0F">\u2212</button>
          <input type="range" min="50" max="250" step="5" value="${Math.round(zoom * 100)}" data-ma11-graph-zoom-range aria-label="\u7F29\u653E\u6BD4\u4F8B" />
          <button type="button" data-ma11-graph-zoom="in" title="\u653E\u5927">\uFF0B</button>
          <button type="button" data-ma11-graph-zoom="reset">100%</button>
          <button type="button" data-ma11-graph-zoom="fit">\u9002\u5E94</button>
          <output>${Math.round(zoom * 100)}%</output>
        </div>
      </div>
    </section>
    ${graph.nodes.length ? `<section class="ma11-graph-layout"><div class="ma11-graph-canvas"><svg viewBox="0 0 1000 680" width="${graphWidth}" height="${graphHeight}" style="width:${graphWidth}px;height:${graphHeight}px" preserveAspectRatio="xMidYMid meet" aria-label="\u955C\u6E0A\u5173\u7CFB\u56FE\u8C31">${edgeSvg}${nodeSvg}</svg></div><aside class="ma11-graph-detail">${selected ? `<span class="ma11-graph-type ${selected.type}">${escapeHtml(graphTypeLabel(selected.type))}</span><h3>${escapeHtml(selected.label)}</h3><p>${escapeHtml(selected.detail || "\u6682\u65E0\u8BE6\u7EC6\u8BB0\u5F55")}</p><dl><dt>\u72B6\u6001</dt><dd>${escapeHtml(selected.status || "\u672A\u6807\u6CE8")}</dd>${selected.existence ? `<dt>\u5B58\u5728</dt><dd>${escapeHtml(selected.existence)}</dd>` : ""}${selected.activity ? `<dt>\u6D3B\u8DC3</dt><dd>${escapeHtml(selected.activity)}</dd>` : ""}${selected.memory ? `<dt>\u8BB0\u5FC6</dt><dd>${escapeHtml(selected.memory)}</dd>` : ""}</dl>` : '<p class="ma11-empty">\u70B9\u51FB\u8282\u70B9\u67E5\u770B\u8BE6\u60C5\u3002</p>'}</aside></section>` : '<section class="ma11-empty-panel">\u5F53\u524D\u72B6\u6001\u8868\u6CA1\u6709\u53EF\u7ED8\u5236\u7684\u5173\u7CFB\u8282\u70B9\u3002\u5148\u5728\u201C\u4EBA\u7269\u201D\u548C\u201C\u5173\u7CFB\u201D\u8868\u4E2D\u751F\u6210\u6216\u6DFB\u52A0\u8BB0\u5F55\u3002</section>'}`;
}
async function summariesHtml() {
  const info = currentArtifact();
  const state2 = info ? await getChatState(info.artifact.chatKey) : null;
  const small = state2?.smallSummaries ?? [];
  const large = state2?.largeSummaries ?? [];
  const events = state2?.eventEntries ?? [];
  const eventCards = events.length ? events.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((entry) => `<article class="ma11-summary"><h3>${escapeHtml(entry.title)}</h3><div class="ma11-summary-settlement"><span>${escapeHtml(entry.status)}</span><span>${escapeHtml(entry.precision)}</span><span>${escapeHtml(entry.activation)}</span><span>${escapeHtml(entry.propagation?.scope || "unknown")}</span></div><p>${escapeHtml(entry.facts)}</p>${entry.traces?.length ? `<small>痕迹：${escapeHtml(entry.traces.join("；"))}</small>` : ""}<small>最后确认：${escapeHtml(entry.lastConfirmedAt || "未明确")} · 更新：${escapeHtml(new Date(entry.updatedAt).toLocaleString())}</small></article>`).join("") : '<p class="ma11-empty">尚无独立事件条目。</p>';
  return `
    <section class="ma11-toolbar"><div><h2>分层记忆</h2><p>最终正文先更新活跃表格；小总结把表格变化拆成独立事件条目；大总结只从事件总结形成长期记忆并降低旧事件精度。</p></div><div class="ma11-actions"><button data-ma11-action="force-small" ${info ? "" : "disabled"}>立即事件总结</button><button data-ma11-action="force-large" ${info ? "" : "disabled"}>立即长期沉降</button></div></section>
    <section class="ma11-card"><header><b>事件条目</b><span>${events.length} · 常驻 ${events.filter((entry) => entry.activation === "constant").length} / 触发 ${events.filter((entry) => entry.activation === "keyword").length} / 向量 ${events.filter((entry) => entry.activation === "vector").length}</span></header>${eventCards}</section>
    <div class="ma11-summary-columns">
      <section class="ma11-card"><header><b>阶段概览</b><span>${small.length}</span></header>${small.length ? small.slice().reverse().map((item2) => `<article class="ma11-summary"><h3>${escapeHtml(item2.title)}</h3><p>${escapeHtml(item2.summary)}</p><div class="ma11-summary-settlement"><span>事件 ${item2.eventOperations?.length ?? 0}</span><span>沉降 ${item2.sedimentation?.appliedRowIds?.length ?? 0}</span></div><small>${escapeHtml(new Date(item2.createdAt).toLocaleString())}</small></article>`).join("") : '<p class="ma11-empty">尚无阶段概览。</p>'}</section>
      <section class="ma11-card"><header><b>长期大总结</b><span>${large.length}</span></header>${large.length ? large.slice().reverse().map((item2) => `<article class="ma11-summary"><h3>${escapeHtml(item2.title)}</h3><p>${escapeHtml(item2.summary)}</p><div class="ma11-summary-settlement"><span>长期记录 ${item2.longTermRecords?.length ?? 0}</span><span>事件沉降 ${item2.eventUpdates?.length ?? 0}</span></div><small>${escapeHtml(new Date(item2.createdAt).toLocaleString())}</small></article>`).join("") : '<p class="ma11-empty">尚无长期大总结。</p>'}</section>
    </div>`;
}
function auditHtml() {
  const settings = getSettings();
  const info = currentArtifact();
  const audit = info?.artifact.audit;
  const revision = info?.artifact.revision;
  const violationHtml = audit && !audit.passed && audit.violations.length ? `<ol class="ma11-violation-list">${audit.violations.map((item2) => `<li><b>${escapeHtml(item2.rule)}</b><p>${escapeHtml(item2.evidence)}</p><small>\u4FEE\u6539\uFF1A${escapeHtml(item2.action)}</small></li>`).join("")}</ol>` : "";
  return `
    <section class="ma11-card ma11-form-card">
      <header><b>\u89C4\u5219\u5BA1\u6838\u4E0E\u5B9A\u5411\u4FEE\u6B63</b><span>\u6700\u7EC8\u901A\u8FC7\u7684\u6B63\u6587\u624D\u8FDB\u5165\u72B6\u6001\u8868\u4E0E\u4E16\u754C\u4E66</span></header>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="auditEnabled" ${settings.auditEnabled ? "checked" : ""}/><span>\u542F\u7528\u89C4\u5219\u5BA1\u6838</span></label>
      <label>\u5BA1\u6838\u5931\u8D25\u5904\u7406<select data-ma11-setting="auditFailAction">
        <option value="revise" ${settings.auditFailAction === "revise" ? "selected" : ""}>\u5B9A\u5411\u4FEE\u6B63\u5E76\u539F\u4F4D\u66FF\u6362\uFF08\u63A8\u8350\uFF09</option>
        <option value="mark" ${settings.auditFailAction === "mark" ? "selected" : ""}>\u4FDD\u7559\u5E76\u6807\u7EA2</option>
        <option value="hide" ${settings.auditFailAction === "hide" ? "selected" : ""}>\u9690\u85CF\uFF0C\u7B49\u5F85\u4EBA\u5DE5\u5904\u7406</option>
        <option value="delete" ${settings.auditFailAction === "delete" ? "selected" : ""}>\u5B89\u5168\u64A4\u56DE\u6700\u65B0AI\u6D88\u606F</option>
      </select></label>
      <label>\u81EA\u52A8\u4FEE\u6B63\u4ECD\u5931\u8D25\u540E\u7684\u5904\u7406<select data-ma11-setting="revisionFallbackAction">
        <option value="hide" ${settings.revisionFallbackAction === "hide" ? "selected" : ""}>\u9690\u85CF\u5E76\u7B49\u5F85\u4EBA\u5DE5\u5904\u7406\uFF08\u63A8\u8350\uFF09</option>
        <option value="mark" ${settings.revisionFallbackAction === "mark" ? "selected" : ""}>\u4FDD\u7559\u5E76\u6807\u7EA2</option>
        <option value="delete" ${settings.revisionFallbackAction === "delete" ? "selected" : ""}>\u5B89\u5168\u64A4\u56DE\u539F\u6B63\u6587</option>
      </select></label>
      <label>\u6700\u5927\u81EA\u52A8\u4FEE\u6B63\u6B21\u6570<input type="number" min="1" max="2" data-ma11-setting="maxRevisionAttempts" value="${settings.maxRevisionAttempts}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="stopOnRepeatedViolation" ${settings.stopOnRepeatedViolation ? "checked" : ""}/><span>\u76F8\u540C\u8FDD\u89C4\u91CD\u590D\u51FA\u73B0\u65F6\u7ACB\u5373\u505C\u6B62\uFF0C\u9632\u6B62\u5FAA\u73AF</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="lockGenerationDuringAudit" ${settings.lockGenerationDuringAudit ? "checked" : ""}/><span>\u5BA1\u6838\u4E0E\u4FEE\u6B63\u671F\u95F4\u963B\u6B62\u4E0B\u4E00\u8F6E\u751F\u6210\uFF0C\u907F\u514D\u9519\u8BEF\u6B63\u6587\u8FDB\u5165\u4E0A\u4E0B\u6587</span></label>
      <label>\u5BA1\u6838\u63D0\u793A\u8BCD<textarea rows="14" data-ma11-setting="auditPrompt" placeholder="\u586B\u5199\u5FC5\u987B\u68C0\u67E5\u7684\u786C\u89C4\u5219\u3002">${escapeHtml(settings.auditPrompt)}</textarea></label>
      <label>\u9644\u52A0\u4FEE\u6B63\u8981\u6C42\uFF08\u53EF\u9009\uFF09<textarea rows="6" data-ma11-setting="revisionPrompt" placeholder="\u4F8B\u5982\uFF1A\u53EA\u505A\u6700\u5C0F\u6539\u52A8\uFF1B\u4FDD\u7559\u539F\u6709\u6587\u98CE\u548C\u6BB5\u843D\u957F\u5EA6\u3002">${escapeHtml(settings.revisionPrompt)}</textarea></label>
      <p class="ma11-help">\u5BA1\u6838\u8BF4\u660E\u548C\u4FEE\u6B63\u6307\u4EE4\u53EA\u5728\u9694\u79BB\u4EFB\u52A1\u4E2D\u4F20\u9012\uFF0C\u4E0D\u4F1A\u4F5C\u4E3A\u804A\u5929\u6D88\u606F\u5199\u5165\u4E0A\u4E0B\u6587\u3002\u4FEE\u6B63\u901A\u8FC7\u540E\uFF0C\u63D2\u4EF6\u76F4\u63A5\u5728\u539F\u6D88\u606F\u4F4D\u7F6E\u66FF\u6362\u6B63\u6587\uFF1B\u4E0D\u4F1A\u65B0\u589E\u4E00\u6761\u201C\u4FEE\u6B63\u8BF4\u660E\u201D\u3002</p>
    </section>
    ${audit ? `<section class="ma11-card"><header><b>\u6700\u8FD1\u5BA1\u6838\u7ED3\u679C</b><span class="ma11-badge ${audit.passed ? "success" : "danger"}">${audit.passed ? "\u901A\u8FC7" : audit.decision === "block" ? "\u963B\u65AD" : "\u9700\u4FEE\u6B63"}</span></header><p>${escapeHtml(audit.reason)}</p>${violationHtml}${revision ? `<dl class="ma11-meta"><dt>\u4FEE\u6B63\u72B6\u6001</dt><dd>${escapeHtml(revision.status)}</dd><dt>\u4FEE\u6B63\u6B21\u6570</dt><dd>${revision.attempts.length}</dd><dt>\u505C\u6B62\u539F\u56E0</dt><dd>${escapeHtml(revision.stoppedReason || "\u2014")}</dd></dl>` : ""}</section>` : ""}`;
}
async function syncHtml() {
  const info = currentArtifact();
  const state2 = info ? await getChatState(info.artifact.chatKey) : null;
  const settings = getSettings();
  return `
    <section class="ma11-card ma11-form-card">
      <header><b>\u804A\u5929\u4E16\u754C\u4E66</b><span class="ma11-badge ${statusClass(state2?.lastSyncStatus || "idle")}">${statusText(state2?.lastSyncStatus || "idle")}</span></header>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="lorebookSync" ${settings.lorebookSync ? "checked" : ""}/><span>\u81EA\u52A8\u540C\u6B65\u4E16\u754C\u4E66</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoCreateLorebook" ${settings.autoCreateLorebook ? "checked" : ""}/><span>\u81EA\u52A8\u521B\u5EFA\u6BCF\u804A\u5929\u72EC\u7ACB\u4E16\u754C\u4E66</span></label>
      <label>\u53D1\u5E03\u7ED3\u6784<select data-ma11-setting="lorebookLayout"><option value="semantic" ${settings.lorebookLayout === "semantic" ? "selected" : ""}>\u5BF9\u8C61\u8BED\u4E49\u6A21\u5F0F\uFF08\u63A8\u8350\uFF09</option><option value="detailed" ${settings.lorebookLayout === "detailed" ? "selected" : ""}>\u9010\u884C\u8C03\u8BD5\u6A21\u5F0F</option></select></label>
      <p class="ma11-help">\u5BF9\u8C61\u8BED\u4E49\u6A21\u5F0F\u6309\u73B0\u5B9E\u5BF9\u8C61\u5EFA\u7ACB\u6761\u76EE\uFF1A\u57FA\u7840\u8BBE\u5B9A\u3001\u5168\u5C40\u6001\u52BF\u3001\u6BCF\u4E2A\u7126\u70B9\u3001\u6BCF\u4E2A\u6B63\u5F0F\u4EBA\u7269\u3001\u5173\u7CFB\u7F51\u7EDC\u3001\u533A\u57DF\u3001\u4E8B\u4EF6/\u6D41\u7A0B\u3001\u7269\u54C1/\u8D44\u6E90\u3001\u6280\u80FD\uFF0C\u4EE5\u53CA\u5F53\u524D\u5C0F\u603B\u7ED3\u548C\u7D2F\u8BA1\u5927\u603B\u7ED3\u3002\u65E7\u7684\u955C\u6E0A\u7BA1\u7406\u6761\u76EE\u4F1A\u5728\u91CD\u65B0\u53D1\u5E03\u65F6\u81EA\u52A8\u66FF\u6362\u3002</p>
      <label>\u4E16\u754C\u4E66\u540D\u79F0\uFF08\u7559\u7A7A\u81EA\u52A8\u751F\u6210\uFF09<input data-ma11-setting="lorebookName" value="${escapeHtml(settings.lorebookName)}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="vectorizeRows" ${settings.vectorizeRows ? "checked" : ""}/><span>\u4EBA\u7269\u3001\u7269\u54C1\u3001\u4E8B\u4EF6\u7B49\u72B6\u6001\u884C\u542F\u7528\u5411\u91CF</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="latestContinuityConstant" disabled/><span>\u4EC5\u57FA\u7840\u8BBE\u5B9A\u5141\u8BB8\u5E38\u9A7B\uFF1B\u5176\u4ED6\u5185\u5BB9\u6309\u5173\u952E\u8BCD\u89E6\u53D1</span></label>
      <div class="ma11-actions"><button data-ma11-action="check-server">\u68C0\u6D4B\u670D\u52A1\u5668</button><button data-ma11-action="retry-sync" ${info ? "" : "disabled"}>${settings.lorebookLayout === "semantic" ? "\u6309\u5BF9\u8C61\u6821\u9A8C\u5E76\u91CD\u65B0\u53D1\u5E03" : "\u7ACB\u5373\u540C\u6B65"}</button><button data-ma11-action="open-graph" ${info?.artifact.snapshot ? "" : "disabled"}>\u67E5\u770B\u5173\u7CFB\u56FE\u8C31</button></div>
      ${state2?.lastSyncError ? `<div class="ma11-error-box">${escapeHtml(state2.lastSyncError)}</div>` : ""}
      <dl class="ma11-meta"><dt>\u5F53\u524D\u4E16\u754C\u4E66</dt><dd>${escapeHtml(state2?.lastLorebookName || "\u672A\u5EFA\u7ACB")}</dd><dt>\u6700\u8FD1\u4E8B\u52A1</dt><dd>${escapeHtml(outboxStateText(state2?.lastOutboxState))}${state2?.lastOutboxId ? ` \xB7 ${escapeHtml(state2.lastOutboxId.slice(-10))}` : ""}</dd><dt>\u6700\u8FD1\u540C\u6B65</dt><dd>${escapeHtml(state2?.lastSyncAt ? new Date(state2.lastSyncAt).toLocaleString() : "\u5C1A\u672A\u540C\u6B65")}</dd></dl>
    </section>
    <section class="ma11-card ma11-form-card">
      <header><b>\u65B0\u6E38\u620F\u4E0E\u7F13\u5B58</b><span>\u53EA\u5F71\u54CD\u955C\u6E0A\u6570\u636E\uFF0C\u4E0D\u5220\u9664\u804A\u5929\u6B63\u6587</span></header>
      <p class="ma11-help">\u201C\u91CD\u7F6E\u5F53\u524D\u6E38\u620F\u201D\u4F1A\u6E05\u9664\u5F53\u524D\u804A\u5929\u7684\u72B6\u6001\u8868\u3001\u603B\u7ED3\u3001\u4EFB\u52A1\u8BB0\u5F55\u4E0E\u955C\u6E0A\u7BA1\u7406\u7684\u4E16\u754C\u4E66\u6761\u76EE\uFF0C\u5E76\u4E3A\u540C\u4E00\u804A\u5929\u5EFA\u7ACB\u65B0\u7684\u9694\u79BB\u6570\u636E\u4F5C\u7528\u57DF\u3002API\u914D\u7F6E\u4E0E\u5176\u4ED6\u804A\u5929\u4E0D\u53D7\u5F71\u54CD\u3002</p>
      <div class="ma11-actions"><button class="danger" data-ma11-action="reset-current-game">\u91CD\u7F6E\u5F53\u524D\u6E38\u620F</button><button class="danger" data-ma11-action="clear-all-cache">\u6E05\u7A7A\u5168\u90E8\u672C\u5730\u955C\u6E0A\u7F13\u5B58</button></div>
    </section>`;
}
function connectionProfiles() {
  try {
    return listSupportedConnectionProfiles();
  } catch {
    return [];
  }
}
function connectionBlock(task, label) {
  const value = getSettings().connections[task];
  const profiles = connectionProfiles();
  const profileOptions = profiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${profile.id === value.profileId ? "selected" : ""}>${escapeHtml(profile.name)}${profile.model ? ` \xB7 ${escapeHtml(profile.model)}` : ""}</option>`).join("");
  const missingProfile = value.profileId && !profiles.some((profile) => profile.id === value.profileId) ? `<option value="${escapeHtml(value.profileId)}" selected>\u5DF2\u5220\u9664\u6216\u4E0D\u53D7\u652F\u6301\u7684\u914D\u7F6E</option>` : "";
  return `<div class="ma11-connection-row" data-ma11-connection="${task}">
    <b>${label}</b>
    <select data-ma11-connection-mode="${task}">
      <option value="current" ${value.mode === "current" ? "selected" : ""}>\u5F53\u524D\u804A\u5929\u8FDE\u63A5</option>
      <option value="profile" ${value.mode === "profile" ? "selected" : ""}>ST\u539F\u751F Profile\uFF08\u9694\u79BB\u8BF7\u6C42\uFF09</option>
    </select>
    <select data-ma11-connection-profile-id="${task}" ${value.mode === "profile" ? "" : "hidden disabled"}><option value="">\u8BF7\u9009\u62E9Connection Profile</option>${missingProfile}${profileOptions}</select>
    <button data-ma11-test="${task}">\u6D4B\u8BD5</button>
  </div>`;
}
function settingsHtml() {
  const settings = getSettings();
  return `
    <section class="ma11-card ma11-form-card">
      <header><b>\u4EFB\u52A1\u6A21\u578B\u5206\u914D</b><span>\u6240\u6709\u8BF7\u6C42\u7531 SillyTavern \u5F53\u524D\u8FDE\u63A5\u6216\u539F\u751F Connection Profile \u6267\u884C\u3002</span></header>
      ${connectionBlock("audit", "\u5BA1\u6838\u4E0E\u5FC5\u8981\u4FEE\u6B63")}
      ${connectionBlock("factExtraction", "\u8BB0\u5FC6\u6A21\u578B\uFF08\u8868\u683C\uFF0B\u5C0F\u603B\u7ED3\uFF0B\u5927\u603B\u7ED3\uFF09")}
      <p class="ma11-help">\u955C\u6E0A\u53EA\u4F7F\u7528\u4E24\u4E2A\u6A21\u578B\u89D2\u8272\uFF1A\u5BA1\u6838\u4E0E\u5FC5\u8981\u4FEE\u6B63\u5171\u4EAB\u524D\u53F0\u8FDE\u63A5\uFF1B\u7EDF\u4E00\u4E8B\u5B9E\u63D0\u53D6\u3001\u5C0F\u603B\u7ED3\u548C\u5927\u603B\u7ED3\u5171\u4EAB\u540E\u53F0\u8BB0\u5FC6\u8FDE\u63A5\u3002\u6B63\u6587\u53EA\u5728\u7EDF\u4E00\u4E8B\u5B9E\u63D0\u53D6\u65F6\u88AB\u7406\u89E3\u4E00\u6B21\uFF0C\u5C0F\u603B\u7ED3\u8BFB\u53D6\u4E8B\u5B9E\u5305\u4E0E\u6D3B\u8DC3\u8868\u683C\uFF0C\u5927\u603B\u7ED3\u8BFB\u53D6\u65E7\u5927\u603B\u7ED3\u4E0E\u65B0\u5C0F\u603B\u7ED3\uFF0C\u4E0D\u91CD\u65B0\u53D1\u9001\u539F\u59CB\u6B63\u6587\u3002ST \u539F\u751F Profile \u4F7F\u7528 ConnectionManagerRequestService\uFF0C\u4E0D\u5207\u6362\u5F53\u524D\u804A\u5929\u8FDE\u63A5\uFF1B\u955C\u6E0A\u4E0D\u4FDD\u5B58\u5BC6\u94A5\u3001\u4E0D\u76F4\u63A5\u8BF7\u6C42\u6A21\u578B\u4F9B\u5E94\u5546\u3002</p>
    </section>
    <section class="ma11-card ma11-form-card">
      <header><b>\u81EA\u52A8\u5316</b></header>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="enabled" ${settings.enabled ? "checked" : ""}/><span>\u542F\u7528\u955C\u6E0A</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoState" ${settings.autoState ? "checked" : ""}/><span>\u6BCF\u6761\u65B0AI\u6B63\u6587\u540E\u53F0\u7EDF\u4E00\u63D0\u53D6\u4E8B\u5B9E</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="showMessagePanel" ${settings.showMessagePanel ? "checked" : ""}/><span>\u5728\u6B63\u6587\u4E0B\u663E\u793A\u72B6\u6001\u6761</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoSmallSummary" ${settings.autoSmallSummary ? "checked" : ""}/><span>\u81EA\u52A8\u4E8B\u4EF6\u603B\u7ED3</span></label>
      <label>\u4E8B\u4EF6\u603B\u7ED3\u56DE\u5408\u6570<input type="number" min="1" max="100" data-ma11-setting="smallSummaryTurns" value="${settings.smallSummaryTurns}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoLargeSummary" ${settings.autoLargeSummary ? "checked" : ""}/><span>\u81EA\u52A8\u5927\u603B\u7ED3</span></label>
      <label>\u5927\u603B\u7ED3\u6240\u9700\u5C0F\u603B\u7ED3\u6570<input type="number" min="1" max="30" data-ma11-setting="largeSummaryCount" value="${settings.largeSummaryCount}" /></label>
      <p class="ma11-help">\u4E8B\u5B9E\u3001\u8868\u683C\u4E0E\u603B\u7ED3\u4F7F\u7528\u7EAF\u6587\u672C\u6807\u7B7E\u534F\u8BAE\uFF0C\u4E0D\u542F\u7528 JSON Schema\uFF0C\u4E5F\u4E0D\u4F1A\u8FFD\u52A0 JSON \u683C\u5F0F\u4FEE\u590D\u8C03\u7528\u3002\u8BF7\u6C42\u8D85\u65F6\u3001\u91CD\u8BD5\u3001\u9650\u6D41\u548C\u4F9B\u5E94\u5546\u9519\u8BEF\u7531 SillyTavern \u5F53\u524D\u8FDE\u63A5\u6216 Connection Profile \u7EDF\u4E00\u5904\u7406\u3002</p>
    </section>`;
}
async function diagnosticsHtml() {
  const checks = await runDiagnostics();
  const chatKey = currentChatKey();
  const info = currentArtifact();
  const [logs, outbox, localCommits, chatState] = await Promise.all([
    getTaskLog(chatKey),
    getLorebookOutboxRecords(chatKey),
    getLocalCommitRecords(chatKey),
    getChatState(chatKey)
  ]);
  const lorebookConflicts = outbox.filter((record) => record.state === "conflict");
  const localConflicts = localCommits.filter((record) => record.state === "conflict");
  const conflictCount = lorebookConflicts.length + localConflicts.length;
  const conflictHtml = conflictCount ? `
      <section class="ma11-card">
        <header><b>\u9700\u8981\u4EBA\u5DE5\u5904\u7406\u7684\u51B2\u7A81</b><span class="ma11-badge danger">${conflictCount}</span></header>
        ${lorebookConflicts.map(
    (record) => `
              <article class="ma11-error-box">
                <b>\u4E16\u754C\u4E66\u4E8B\u52A1 \xB7 ${escapeHtml(record.bookName)}</b>
                <p>${escapeHtml(record.conflictDetail || record.error || "\u670D\u52A1\u5668\u5185\u5BB9\u4E0E\u4E8B\u52A1\u57FA\u7EBF\u4E0D\u4E00\u81F4")}</p>
                <small>${escapeHtml(record.id)} \xB7 ${escapeHtml(new Date(record.updatedAt).toLocaleString())}</small>
                <div class="ma11-actions">
                  <button data-ma11-action="cancel-lorebook-conflict" data-ma11-record-id="${escapeHtml(record.id)}">\u4FDD\u7559\u670D\u52A1\u5668\u73B0\u72B6</button>
                  <button data-ma11-action="retry-lorebook-conflict" data-ma11-record-id="${escapeHtml(record.id)}">\u4EE5\u6700\u65B0\u72B6\u6001\u91CD\u65B0\u53D1\u5E03</button>
                </div>
              </article>`
  ).join("")}
        ${localConflicts.map(
    (record) => `
              <article class="ma11-error-box">
                <b>\u603B\u7ED3\u4E8B\u52A1\u63D0\u4EA4 \xB7 ${escapeHtml(record.operation)}</b>
                <p>${escapeHtml(record.conflictDetail || record.error || "\u672C\u5730\u72B6\u6001\u4E0E\u63D0\u4EA4\u65E5\u5FD7\u4E0D\u4E00\u81F4")}</p>
                <small>${escapeHtml(record.id)} \xB7 ${escapeHtml(new Date(record.updatedAt).toLocaleString())}</small>
                <div class="ma11-actions">
                  <button data-ma11-action="cancel-local-conflict" data-ma11-record-id="${escapeHtml(record.id)}">\u4FDD\u7559\u5F53\u524D\u672C\u5730\u72B6\u6001</button>
                </div>
              </article>`
  ).join("")}
      </section>` : "";
  return `
    <section class="ma11-toolbar"><div><h2>\u8FD0\u884C\u8BCA\u65AD</h2><p>\u5165\u53E3\u3001\u6A21\u578B\u3001\u5B58\u50A8\u3001\u8DE8\u6807\u7B7E\u534F\u8C03\u4E0E\u6062\u590D\u4E8B\u52A1\u5206\u522B\u68C0\u67E5\u3002</p></div><div class="ma11-actions"><button data-ma11-action="refresh-diagnostics">\u5237\u65B0</button><button data-ma11-action="copy-diagnostics">\u590D\u5236\u8BCA\u65AD</button></div></section>
    <section class="ma11-card"><header><b>\u6062\u590D\u4E0E\u7EF4\u62A4</b><span>${escapeHtml(info?.artifact.chatKey.slice(-10) || chatKey.slice(-10))}</span></header><p class="ma11-help">\u5BFC\u51FA\u5305\u5305\u542B\u5F53\u524D\u804A\u5929\u7684\u72B6\u6001\u3001\u4E16\u754C\u4E66\u4E8B\u52A1\u3001\u672C\u5730\u63D0\u4EA4\u65E5\u5FD7\u3001\u64CD\u4F5C\u65E5\u5FD7\u548C\u8FC1\u79FB\u5907\u4EFD\uFF1B\u4E0D\u5305\u542B API \u5BC6\u94A5\u3002\u5386\u53F2\u91CD\u5EFA\u6309 10\u201320 \u6761\u6B63\u6587\u5206\u6279\u4FDD\u5B58\u68C0\u67E5\u70B9\uFF0C\u5237\u65B0\u9875\u9762\u540E\u53EF\u7EE7\u7EED\u3002</p>${chatState.historyRebuild ? historyRebuildStatusHtml(chatState.historyRebuild) : ""}<div class="ma11-actions"><button data-ma11-action="export-recovery">\u5BFC\u51FA\u6062\u590D\u5305</button><button data-ma11-action="cleanup-recovery">\u6E05\u7406\u5DF2\u5B8C\u6210\u5386\u53F2</button>${chatState.historyRebuild ? `<button data-ma11-action="retry-history-rebuild">${chatState.historyRebuild.state === "paused" || chatState.historyRebuild.state === "failed" ? "\u7EE7\u7EED\u91CD\u5EFA" : "\u6062\u590D\u91CD\u5EFA"}</button><button data-ma11-action="pause-history-rebuild">\u6682\u505C</button><button class="danger" data-ma11-action="cancel-history-rebuild">\u53D6\u6D88</button>` : ""}</div></section>
    ${conflictHtml}
    <section class="ma11-check-grid">${checks.map((check) => `<article class="ma11-check ${check.status}"><span></span><div><b>${escapeHtml(check.label)}</b><p>${escapeHtml(check.detail)}</p></div></article>`).join("")}</section>
    <section class="ma11-card"><header><b>\u6700\u8FD1\u4EFB\u52A1\u65E5\u5FD7</b><span>${logs.length}</span></header><div class="ma11-log-list">${logs.length ? logs.slice(0, 30).map(
    (log) => `<div><time>${escapeHtml(new Date(log.createdAt).toLocaleString())}</time><span>${escapeHtml(log.label)}</span><em class="${log.state}">${escapeHtml(log.state)}</em>${log.error ? `<small>${escapeHtml(log.error)}</small>` : ""}</div>`
  ).join("") : '<p class="ma11-empty">\u6682\u65E0\u65E5\u5FD7\u3002</p>'}</div></section>`;
}
async function renderWorkspace() {
  const workspace = document.querySelector("#ma11-workspace");
  if (!workspace || workspace.hidden || rendering) return;
  rendering = true;
  try {
    const settings = getSettings();
    const info = currentArtifact();
    workspace.querySelectorAll("[data-ma11-tab]").forEach(
      (button) => button.classList.toggle(
        "active",
        button.dataset.ma11Tab === settings.ui.activeTab
      )
    );
    const content = workspace.querySelector(
      "#ma11-workspace-content"
    );
    updateWorkspaceTaskIndicator();
    if (settings.ui.activeTab === "overview")
      content.innerHTML = overviewHtml(info);
    if (settings.ui.activeTab === "tasks") content.innerHTML = await tasksHtml();
    if (settings.ui.activeTab === "tables") content.innerHTML = tableHtml(info);
    if (settings.ui.activeTab === "graph") content.innerHTML = graphHtml(info);
    if (settings.ui.activeTab === "summaries")
      content.innerHTML = await summariesHtml();
    if (settings.ui.activeTab === "audit") content.innerHTML = auditHtml();
    if (settings.ui.activeTab === "sync") content.innerHTML = await syncHtml();
    if (settings.ui.activeTab === "settings")
      content.innerHTML = settingsHtml();
    if (settings.ui.activeTab === "diagnostics")
      content.innerHTML = await diagnosticsHtml();
  } finally {
    rendering = false;
  }
}
function setTab(tab) {
  const settings = getSettings();
  settings.ui.activeTab = tab;
  saveSettings();
  void renderWorkspace();
}
function openRowEditor(tableKey, row) {
  const workspace = root();
  const backdrop = workspace.querySelector(
    ".ma11-editor-backdrop"
  );
  const form = workspace.querySelector("#ma11-row-editor");
  form.elements.namedItem("tableKey").value = tableKey;
  form.elements.namedItem("rowId").value = row?.id || "";
  form.elements.namedItem("title").value = row?.title || "";
  form.elements.namedItem("content").value = row?.content || "";
  form.elements.namedItem("status").value = row?.status || "active";
  form.elements.namedItem("keywords").value = row?.keywords.join(", ") || "";
  form.elements.namedItem("locked").checked = row?.locked ?? true;
  const lifecycleFields = form.querySelector("[data-ma11-lifecycle-fields]");
  const supportsLifecycle = tableKey === "characters" || tableKey === "focus";
  if (lifecycleFields) lifecycleFields.hidden = !supportsLifecycle;
  if (supportsLifecycle) {
    const life = row?.lifecycle;
    form.elements.namedItem("existence").value = life?.existence || "\u672A\u6807\u6CE8";
    form.elements.namedItem("activity").value = life?.activity || "\u672A\u6807\u6CE8";
    form.elements.namedItem("memory").value = life?.memory || "\u672A\u6807\u6CE8";
    form.elements.namedItem("evidenceLevel").value = life?.evidenceLevel || "\u672A\u77E5";
    form.elements.namedItem("evidence").value = life?.evidence || "";
    form.elements.namedItem("returnConditions").value = life?.returnConditions.join("\n") || "";
    form.elements.namedItem("returnBlockers").value = life?.returnBlockers.join("\n") || "";
  }
  backdrop.hidden = false;
  form.elements.namedItem("title").focus();
}
function closeEditor() {
  const workspace = document.querySelector("#ma11-workspace");
  const backdrop = workspace?.querySelector(
    ".ma11-editor-backdrop"
  );
  if (backdrop) backdrop.hidden = true;
}
async function saveRow(form) {
  const info = currentArtifact();
  if (!info?.artifact.snapshot) throw new Error("\u5F53\u524D\u6CA1\u6709\u53EF\u7F16\u8F91\u7684\u72B6\u6001\u8868");
  const tableKey = form.elements.namedItem("tableKey").value;
  const rowId = form.elements.namedItem("rowId").value;
  const title = form.elements.namedItem("title").value.trim();
  const content = form.elements.namedItem("content").value.trim();
  const status = form.elements.namedItem("status").value.trim();
  const keywords = form.elements.namedItem("keywords").value.split(/[,，]/).map((item2) => item2.trim()).filter(Boolean);
  const locked = form.elements.namedItem("locked").checked;
  const supportsLifecycle = tableKey === "characters" || tableKey === "focus";
  const listFrom = (name) => form.elements.namedItem(name).value.split(/\n|[；;]/).map((item2) => item2.trim()).filter(Boolean);
  const lifecycle = supportsLifecycle ? {
    existence: form.elements.namedItem("existence").value,
    activity: form.elements.namedItem("activity").value,
    memory: form.elements.namedItem("memory").value,
    evidenceLevel: form.elements.namedItem("evidenceLevel").value,
    evidence: form.elements.namedItem("evidence").value.trim(),
    returnConditions: listFrom("returnConditions"),
    returnBlockers: listFrom("returnBlockers")
  } : void 0;
  info.artifact.snapshot = upsertManualRow(info.artifact.snapshot, tableKey, {
    id: rowId || void 0,
    title,
    content,
    status,
    keywords,
    locked,
    lifecycle
  });
  const message = getMessage(info.index);
  if (message) attachArtifactToMessage(message, info.artifact);
  await putArtifact(info.artifact);
  await persistChat();
  if (getSettings().lorebookSync) await retryStage(info.index, "sync");
  closeEditor();
  await renderWorkspace();
}
async function deleteRowAction(rowId) {
  const info = currentArtifact();
  if (!info?.artifact.snapshot) return;
  const tableKey = getSettings().ui.activeTable;
  if (!confirm("\u786E\u5B9A\u5220\u9664\u8FD9\u6761\u72B6\u6001\u5417\uFF1F")) return;
  info.artifact.snapshot = deleteRow(info.artifact.snapshot, tableKey, rowId);
  const message = getMessage(info.index);
  if (message) attachArtifactToMessage(message, info.artifact);
  await putArtifact(info.artifact);
  await persistChat();
  if (getSettings().lorebookSync) await retryStage(info.index, "sync");
  await renderWorkspace();
}
function updateSetting(target) {
  const key = target.dataset.ma11Setting;
  if (!key) return;
  const settings = getSettings();
  const value = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target instanceof HTMLInputElement && target.type === "number" ? Number(target.value) : target.value;
  settings[key] = value;
  saveSettings();
  if (key === "lorebookLayout") void renderWorkspace();
}
function updateConnection(target) {
  const modeTask = target.dataset.ma11ConnectionMode;
  const profileTask = target.dataset.ma11ConnectionProfileId;
  const settings = getSettings();
  let shouldRender = false;
  if (modeTask) {
    settings.connections[modeTask].mode = target.value;
    shouldRender = true;
  }
  if (profileTask) {
    settings.connections[profileTask].profileId = safeText(target.value, 160).trim();
    const selected = connectionProfiles().find((profile) => profile.id === settings.connections[profileTask].profileId);
    settings.connections[profileTask].profile = selected?.name || "";
  }
  saveSettings();
  if (shouldRender) void renderWorkspace();
}
function bindWorkspace(workspace) {
  workspace.addEventListener("click", async (event) => {
    const target = event.target;
    const tab = target.closest("[data-ma11-tab]")?.dataset.ma11Tab;
    if (tab) return setTab(tab);
    const action = target.closest("[data-ma11-action]")?.dataset.ma11Action;
    const actionButton = target.closest("button");
    const longAction = Boolean(action || target.closest("[data-ma11-test]"));
    const originalButtonText = actionButton?.textContent ?? "";
    if (actionButton && longAction) {
      actionButton.disabled = true;
      actionButton.setAttribute("aria-busy", "true");
      actionButton.textContent = "\u6267\u884C\u4E2D\u2026";
    }
    try {
      if (action === "close") workspace.hidden = true;
      if (action === "open-tasks") setTab("tasks");
      if (action === "open-diagnostics") setTab("diagnostics");
      if (action === "refresh-tasks") await renderWorkspace();
      if (action === "open-tables") setTab("tables");
      if (action === "open-graph") setTab("graph");
      if (action === "process-latest") {
        const index = latestAssistantIndex();
        if (index < 0) throw new Error("\u6CA1\u6709\u53EF\u6574\u7406\u7684AI\u6B63\u6587");
        selectedMessageIndex = index;
        await processMessage(index, true);
        await renderWorkspace();
      }
      if (action === "retry-state") {
        const info = currentArtifact();
        if (info) await retryStage(info.index, "state");
        await renderWorkspace();
      }
      if (action === "force-small" || action === "force-large") {
        const info = currentArtifact();
        if (!info) throw new Error("\u5C1A\u65E0\u53EF\u603B\u7ED3\u7684\u72B6\u6001");
        await forceSummary(
          info.index,
          action === "force-small" ? "small" : "large"
        );
        await renderWorkspace();
      }
      if (action === "retry-sync") {
        const info = currentArtifact();
        if (!info) throw new Error("\u5C1A\u65E0\u53EF\u540C\u6B65\u7684\u72B6\u6001");
        await retryStage(info.index, "sync");
        await renderWorkspace();
      }
      if (action === "check-server") {
        const result = await checkServerConnection();
        toast(result.ok ? "success" : "error", result.detail);
      }
      if (action === "reset-current-game") {
        if (!confirm("\u786E\u5B9A\u91CD\u7F6E\u5F53\u524D\u6E38\u620F\u5417\uFF1F\u8FD9\u4F1A\u6E05\u9664\u5F53\u524D\u804A\u5929\u7684\u955C\u6E0A\u8868\u683C\u3001\u603B\u7ED3\u3001\u4EFB\u52A1\u8BB0\u5F55\u548C\u955C\u6E0A\u7BA1\u7406\u7684\u4E16\u754C\u4E66\u6761\u76EE\uFF0C\u4F46\u4E0D\u4F1A\u5220\u9664\u804A\u5929\u6B63\u6587\u3002")) return;
        if (!confirm("\u518D\u6B21\u786E\u8BA4\uFF1A\u5F53\u524D\u804A\u5929\u7684\u955C\u6E0A\u6570\u636E\u5C06\u4E0D\u53EF\u4ECE\u754C\u9762\u6062\u590D\u3002\u7EE7\u7EED\u5417\uFF1F")) return;
        const result = await resetCurrentGame();
        resetWorkspaceChatSelection();
        toast(result.lorebookError ? "warning" : "success", result.lorebookError ? `\u5F53\u524D\u672C\u5730\u6E38\u620F\u6570\u636E\u5DF2\u91CD\u7F6E\uFF0C\u4F46\u4E16\u754C\u4E66\u6E05\u7406\u5931\u8D25\uFF1A${result.lorebookError}` : `\u5F53\u524D\u6E38\u620F\u5DF2\u91CD\u7F6E\uFF1A\u6E05\u9664${result.clearedMessages}\u6761\u6D88\u606F\u8BB0\u5F55\uFF0C\u79FB\u9664${result.removedLorebookEntries}\u4E2A\u4E16\u754C\u4E66\u6761\u76EE`);
        await renderWorkspace();
      }
      if (action === "clear-all-cache") {
        if (!confirm("\u786E\u5B9A\u6E05\u7A7A\u5168\u90E8\u672C\u5730\u955C\u6E0A\u7F13\u5B58\u5417\uFF1F\u8FD9\u4F1A\u6E05\u9664\u6240\u6709\u804A\u5929\u7684\u672C\u5730\u8868\u683C\u3001\u603B\u7ED3\u548C\u4EFB\u52A1\u65E5\u5FD7\uFF0C\u4F46\u4E0D\u4F1A\u81EA\u52A8\u5220\u9664\u5176\u4ED6\u804A\u5929\u7684\u4E16\u754C\u4E66\u3002")) return;
        if (!confirm("\u6B64\u64CD\u4F5C\u8303\u56F4\u5927\u4E8E\u201C\u91CD\u7F6E\u5F53\u524D\u6E38\u620F\u201D\u3002\u518D\u6B21\u786E\u8BA4\u7EE7\u7EED\u3002")) return;
        const result = await clearAllLocalMirrorAbyssCache();
        resetWorkspaceChatSelection();
        toast("success", `\u5168\u90E8\u672C\u5730\u955C\u6E0A\u7F13\u5B58\u5DF2\u6E05\u7A7A\uFF1B\u5F53\u524D\u804A\u5929\u79FB\u9664${result.clearedMessages}\u6761\u9644\u52A0\u8BB0\u5F55`);
        await renderWorkspace();
      }
      if (action === "add-row") openRowEditor(getSettings().ui.activeTable);
      if (action === "close-editor") closeEditor();
      if (action === "refresh-diagnostics") await renderWorkspace();
      if (action === "copy-diagnostics") {
        const report = await diagnosticReport();
        await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
        toast("success", "\u8BCA\u65AD\u4FE1\u606F\u5DF2\u590D\u5236");
      }
      if (action === "export-recovery") {
        const filename = await downloadRecoveryBundleForCurrentChat();
        toast("success", `\u6062\u590D\u5305\u5DF2\u5BFC\u51FA\uFF1A${filename}`);
      }
      if (action === "retry-history-rebuild") {
        const rebuilt = await recoverHistoryConsistencyForCurrentChat();
        toast(rebuilt ? "success" : "info", rebuilt ? "\u5386\u53F2\u91CD\u5EFA\u5DF2\u8FDB\u5165\u540E\u53F0\u4EFB\u52A1\uFF0C\u53EF\u5728\u4EFB\u52A1\u4E2D\u5FC3\u67E5\u770B\u8FDB\u5EA6" : "\u5F53\u524D\u804A\u5929\u6CA1\u6709\u5F85\u6062\u590D\u7684\u5386\u53F2\u4F9D\u8D56");
        await renderWorkspace();
      }
      if (action === "pause-history-rebuild") {
        const requested = await requestHistoryRebuildPause();
        toast(requested ? "success" : "info", requested ? "\u5C06\u5728\u5F53\u524D\u6279\u6B21\u7ED3\u675F\u540E\u6682\u505C\u5386\u53F2\u91CD\u5EFA" : "\u5F53\u524D\u6CA1\u6709\u5386\u53F2\u91CD\u5EFA\u4EFB\u52A1");
        await renderWorkspace();
      }
      if (action === "cancel-history-rebuild") {
        if (!confirm("\u53D6\u6D88\u540E\u4F1A\u4FDD\u7559\u5F53\u524D\u68C0\u67E5\u70B9\uFF0C\u53EF\u7A0D\u540E\u4ECE\u68C0\u67E5\u70B9\u91CD\u65B0\u5F00\u59CB\u3002\u7EE7\u7EED\u5417\uFF1F")) return;
        const requested = await requestHistoryRebuildCancel();
        toast(requested ? "warning" : "info", requested ? "\u5DF2\u8BF7\u6C42\u53D6\u6D88\u5386\u53F2\u91CD\u5EFA" : "\u5F53\u524D\u6CA1\u6709\u5386\u53F2\u91CD\u5EFA\u4EFB\u52A1");
        await renderWorkspace();
      }
      if (action === "cleanup-recovery") {
        if (!confirm("\u6E05\u7406\u5F53\u524D\u804A\u5929\u4E2D\u8FC7\u91CF\u7684\u5DF2\u5B8C\u6210\u4E8B\u52A1\u548C\u65E7\u8FC1\u79FB\u5907\u4EFD\uFF1F\u672A\u89E3\u51B3\u4E8B\u52A1\u4E0D\u4F1A\u5220\u9664\u3002")) return;
        const result = await cleanupRecoveryHistoryForCurrentChat();
        toast("success", `\u5DF2\u6E05\u7406\uFF1A\u4E16\u754C\u4E66 ${result.outbox}\uFF0C\u672C\u5730\u63D0\u4EA4 ${result.localCommits}\uFF0C\u8FC1\u79FB\u5907\u4EFD ${result.backups}`);
        await renderWorkspace();
      }
      if (action === "cancel-lorebook-conflict" || action === "retry-lorebook-conflict") {
        const recordId = target.closest("[data-ma11-record-id]")?.dataset.ma11RecordId;
        if (!recordId) throw new Error("\u4E16\u754C\u4E66\u51B2\u7A81\u8BB0\u5F55 ID \u7F3A\u5931");
        if (action === "cancel-lorebook-conflict" && !confirm("\u786E\u8BA4\u4FDD\u7559\u670D\u52A1\u5668\u5F53\u524D\u4E16\u754C\u4E66\u5185\u5BB9\uFF0C\u5E76\u53D6\u6D88\u8FD9\u6761\u51B2\u7A81\u4E8B\u52A1\uFF1F")) return;
        await resolveLorebookConflictForCurrentChat(
          recordId,
          action === "retry-lorebook-conflict" ? "retry-latest" : "cancel"
        );
        toast("success", action === "retry-lorebook-conflict" ? "\u5DF2\u57FA\u4E8E\u6700\u65B0\u72B6\u6001\u91CD\u65B0\u5EFA\u7ACB\u53D1\u5E03\u4E8B\u52A1" : "\u5DF2\u4FDD\u7559\u670D\u52A1\u5668\u73B0\u72B6\u5E76\u53D6\u6D88\u51B2\u7A81\u4E8B\u52A1");
        await renderWorkspace();
      }
      if (action === "cancel-local-conflict") {
        const recordId = target.closest("[data-ma11-record-id]")?.dataset.ma11RecordId;
        if (!recordId) throw new Error("\u672C\u5730\u51B2\u7A81\u8BB0\u5F55 ID \u7F3A\u5931");
        if (!confirm("\u786E\u8BA4\u4FDD\u7559\u5F53\u524D\u672C\u5730\u72B6\u6001\uFF0C\u5E76\u53D6\u6D88\u8FD9\u6761\u51B2\u7A81\u63D0\u4EA4\uFF1F")) return;
        await cancelLocalCommitConflict(recordId);
        toast("success", "\u5DF2\u4FDD\u7559\u5F53\u524D\u672C\u5730\u72B6\u6001\u5E76\u53D6\u6D88\u51B2\u7A81\u63D0\u4EA4");
        await renderWorkspace();
      }
      const cancelTaskId = target.closest("[data-ma11-cancel-task]")?.dataset.ma11CancelTask;
      if (cancelTaskId) {
        const cancelled = taskQueue.cancel(cancelTaskId, "\u7528\u6237\u4ECE\u5DE5\u4F5C\u53F0\u53D6\u6D88\u4EFB\u52A1");
        toast(cancelled ? "success" : "warning", cancelled ? "\u5DF2\u53D1\u9001\u53D6\u6D88\u8BF7\u6C42" : "\u4EFB\u52A1\u5DF2\u7ED3\u675F\u6216\u4E0D\u5B58\u5728");
        await renderWorkspace();
      }
      const graphScope = target.closest("[data-ma11-graph-scope]")?.dataset.ma11GraphScope;
      if (graphScope) {
        getSettings().ui.graphScope = graphScope;
        selectedGraphNodeId = null;
        saveSettings();
        await renderWorkspace();
      }
      const graphZoomAction = target.closest("[data-ma11-graph-zoom]")?.dataset.ma11GraphZoom;
      if (graphZoomAction) {
        const settings = getSettings();
        const current = clampGraphZoom(settings.ui.graphZoom);
        if (graphZoomAction === "in") settings.ui.graphZoom = clampGraphZoom(current + 0.15);
        if (graphZoomAction === "out") settings.ui.graphZoom = clampGraphZoom(current - 0.15);
        if (graphZoomAction === "reset") settings.ui.graphZoom = 1;
        if (graphZoomAction === "fit") {
          const canvas = workspace.querySelector(".ma11-graph-canvas");
          const availableWidth = Math.max(320, canvas?.clientWidth || 760);
          const availableHeight = Math.max(280, canvas?.clientHeight || 560);
          settings.ui.graphZoom = clampGraphZoom(Math.min(availableWidth / 1e3, availableHeight / 680));
        }
        saveSettings();
        await renderWorkspace();
      }
      const graphNodeId = target.closest("[data-ma11-graph-node]")?.dataset.ma11GraphNode;
      if (graphNodeId) {
        selectedGraphNodeId = graphNodeId;
        await renderWorkspace();
      }
      const table = target.closest("[data-ma11-table]")?.dataset.ma11Table;
      if (table) {
        getSettings().ui.activeTable = table;
        saveSettings();
        await renderWorkspace();
      }
      const editId = target.closest("[data-ma11-edit-row]")?.dataset.ma11EditRow;
      if (editId) {
        const info = currentArtifact();
        const key = getSettings().ui.activeTable;
        const row = info?.artifact.snapshot?.[key].find(
          (item2) => item2.id === editId
        );
        if (row) openRowEditor(key, row);
      }
      const deleteId = target.closest("[data-ma11-delete-row]")?.dataset.ma11DeleteRow;
      if (deleteId) await deleteRowAction(deleteId);
      const testTask = target.closest("[data-ma11-test]")?.dataset.ma11Test;
      if (testTask) {
        const result = await testConnection(testTask);
        const detail = `${result.method}\uFF1B\u8017\u65F6${result.elapsedMs}ms\uFF1B\u8FDE\u63A5${result.connected ? "\u6210\u529F" : "\u5931\u8D25"}\uFF1B\u6587\u672C\u534F\u8BAE${result.protocolValid ? "\u6709\u6548" : "\u65E0\u6548"}\uFF1B\u7CBE\u786E\u9075\u5FAA${result.instructionFollowed ? "\u901A\u8FC7" : "\u672A\u901A\u8FC7"}`;
        toast(result.instructionFollowed ? "success" : "warning", result.instructionFollowed ? detail : `${detail}\uFF1B\u8FD4\u56DE\uFF1A${result.responsePreview}`);
      }
    } catch (error) {
      toast("error", toErrorMessage(error));
    } finally {
      if (actionButton?.isConnected && longAction) {
        actionButton.disabled = false;
        actionButton.removeAttribute("aria-busy");
        actionButton.textContent = originalButtonText;
      }
    }
  });
  workspace.addEventListener("change", (event) => {
    const target = event.target;
    if (target.dataset.ma11Setting) updateSetting(target);
    if (target.dataset.ma11ConnectionMode || target.dataset.ma11ConnectionProfileId) updateConnection(target);
  });
  workspace.addEventListener("input", (event) => {
    const target = event.target;
    if (target.dataset.ma11GraphZoomRange !== void 0) {
      getSettings().ui.graphZoom = clampGraphZoom(Number(target.value) / 100);
      saveSettings();
      const output = workspace.querySelector(".ma11-graph-zoom output");
      if (output) output.value = `${Math.round(getSettings().ui.graphZoom * 100)}%`;
      const svg = workspace.querySelector(".ma11-graph-canvas svg");
      if (svg) {
        const zoom = getSettings().ui.graphZoom;
        svg.setAttribute("width", String(Math.round(1e3 * zoom)));
        svg.setAttribute("height", String(Math.round(680 * zoom)));
        svg.setAttribute("style", `width:${Math.round(1e3 * zoom)}px;height:${Math.round(680 * zoom)}px`);
      }
      return;
    }
    if (target.dataset.ma11Setting === "auditPrompt" || target.dataset.ma11Setting === "revisionPrompt" || target.dataset.ma11Setting === "lorebookName")
      updateSetting(target);
    if (target.dataset.ma11ConnectionProfileId) updateConnection(target);
  });
  workspace.querySelector("#ma11-row-editor")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveRow(event.currentTarget).catch(
      (error) => toast("error", toErrorMessage(error))
    );
  });
}
function resetWorkspaceChatSelection() {
  selectedMessageIndex = null;
  selectedGraphNodeId = null;
}
function openWorkspace(tab, messageIndex) {
  const workspace = root();
  if (Number.isInteger(messageIndex))
    selectedMessageIndex = Number(messageIndex);
  if (tab) getSettings().ui.activeTab = tab;
  workspace.hidden = false;
  void renderWorkspace();
}
function refreshWorkspace() {
  void renderWorkspace();
}
function unmountWorkspace() {
  queueUnsubscribe?.();
  queueUnsubscribe = null;
  selectedMessageIndex = null;
  selectedGraphNodeId = null;
  rendering = false;
  document.querySelector("#ma11-workspace")?.remove();
}

// src/ui/message-panel.ts
function stageLabel(stage) {
  const map = {
    idle: "\u7B49\u5F85",
    queued: "\u6392\u961F",
    running: "\u5904\u7406\u4E2D",
    success: "\u6210\u529F",
    failed: "\u5931\u8D25",
    skipped: "\u8DF3\u8FC7",
    blocked: "\u963B\u65AD"
  };
  return map[stage?.status] || "\u7B49\u5F85";
}
function tone(stage) {
  if (stage?.status === "success" || stage?.status === "skipped") return "success";
  if (stage?.status === "failed" || stage?.status === "blocked") return "danger";
  if (stage?.status === "running" || stage?.status === "queued") return "working";
  return "neutral";
}
function findMessageElement2(index) {
  return document.querySelector(`.mes[mesid="${index}"], .mes[data-message-id="${index}"], #chat .mes:nth-of-type(${index + 1})`);
}
function panelHtml(index, artifact) {
  const rows2 = artifact.snapshot ? Object.values(artifact.snapshot).reduce((sum, list2) => sum + list2.length, 0) : 0;
  const error = Object.values(artifact.stages).find((stage) => stage.error)?.error;
  return `
    <div class="ma11-message-panel" data-ma-index="${index}">
      <button class="ma11-message-summary" type="button" data-ma-action="open">
        <span class="ma11-message-title">\u955C\u6E0A\u72B6\u6001</span>
        <span class="ma11-badge ${tone(artifact.stages.audit)}">准入/审核 ${stageLabel(artifact.stages.audit)}</span>
        <span class="ma11-badge ${tone(artifact.stages.revision)}">\u4FEE\u6B63 ${stageLabel(artifact.stages.revision)}</span>
        <span class="ma11-badge ${tone(artifact.stages.state)}">\u8868\u683C ${stageLabel(artifact.stages.state)}</span>
        <span class="ma11-badge ${tone(artifact.stages.sync)}">\u540C\u6B65 ${stageLabel(artifact.stages.sync)}</span>
        <span class="ma11-message-count">${rows2} \u6761</span>
      </button>
      ${artifact.quarantined ? '<div class="ma11-message-notice">\u539F\u6B63\u6587\u5904\u4E8E\u9694\u79BB\u533A\uFF1B\u5BA1\u6838\u6216\u4FEE\u6B63\u901A\u8FC7\u524D\u4E0D\u4F1A\u8FDB\u5165\u8868\u683C\u3001\u603B\u7ED3\u548C\u4E16\u754C\u4E66\u3002</div>' : ""}
      ${artifact.audit && !artifact.audit.passed ? `<div class="ma11-message-error">${escapeHtml(artifact.audit.reason)}</div>` : error ? `<div class="ma11-message-error">${escapeHtml(error)}</div>` : ""}
      <div class="ma11-message-actions">
        ${artifact.stages.audit.status === "failed" ? '<button data-ma-retry="audit">\u91CD\u8BD5\u5BA1\u6838</button>' : ""}
        ${["failed", "blocked"].includes(artifact.stages.revision?.status ?? "idle") ? '<button data-ma-retry="revision">\u91CD\u8BD5\u5B9A\u5411\u4FEE\u6B63</button>' : ""}
        ${artifact.stages.state.status === "failed" ? '<button data-ma-retry="state">\u91CD\u8BD5\u8868\u683C</button>' : ""}
        ${artifact.stages.summary.status === "failed" ? '<button data-ma-retry="summary">\u91CD\u8BD5\u603B\u7ED3</button>' : ""}
        ${artifact.stages.sync.status === "failed" ? '<button data-ma-retry="sync">\u91CD\u8BD5\u540C\u6B65</button>' : ""}
      </div>
    </div>`;
}
function renderMessagePanel(index) {
  if (!getSettings().showMessagePanel) return;
  const artifact = getArtifactAt(index);
  const messageElement = findMessageElement2(index);
  if (!messageElement) return;
  messageElement.querySelector(":scope > .ma11-message-panel")?.remove();
  if (!artifact) return;
  messageElement.insertAdjacentHTML("beforeend", panelHtml(index, artifact));
  applyAuditVisibility(index, Boolean(artifact.hiddenByAudit));
}
function renderAllMessagePanels() {
  getChat().forEach((message, index) => {
    if (!message?.is_user) renderMessagePanel(index);
  });
}
function removeAllMessagePanels() {
  document.querySelectorAll(".ma11-message-panel").forEach((panel) => panel.remove());
}
var installed = false;
function installMessagePanelHandlers() {
  if (installed) return () => void 0;
  installed = true;
  const click = (event) => {
    const target = event.target;
    const panel = target.closest(".ma11-message-panel");
    if (!panel) return;
    const index = Number(panel.dataset.maIndex);
    if (target.closest('[data-ma-action="open"]')) openWorkspace("tables", index);
    const retry = target.closest("[data-ma-retry]")?.dataset.maRetry;
    if (retry) void retryStage(index, retry);
  };
  document.addEventListener("click", click);
  const unsubscribe = subscribePipeline((index) => renderMessagePanel(index));
  return () => {
    installed = false;
    document.removeEventListener("click", click);
    unsubscribe();
  };
}

// src/ui/settings-panel.ts
init_constants();
init_task_queue();
function extensionPathFromUrl() {
  const url = new URL(import.meta.url);
  const marker = "/scripts/extensions/";
  const index = url.pathname.indexOf(marker);
  if (index < 0) return "third-party/mirror-abyss-plugin";
  const remainder = url.pathname.slice(index + marker.length);
  const parts = remainder.split("/").filter(Boolean);
  if (parts[0] === "third-party" && parts[1]) return `third-party/${parts[1]}`;
  return parts[0] || "third-party/mirror-abyss-plugin";
}
var topTaskUnsubscribe = null;
async function waitForElement(selector, timeoutMs = 15e3) {
  const immediate = document.querySelector(selector);
  if (immediate) return immediate;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`\u672A\u627E\u5230\u754C\u9762\u6302\u8F7D\u70B9\uFF1A${selector}`));
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        window.clearTimeout(timer);
        observer.disconnect();
        resolve(element);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}
function fallbackTemplate() {
  return `
<div id="ma11-settings-root" class="ma11-settings-root">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>${DISPLAY_NAME}</b>
      <span class="ma11-settings-version">${VERSION}</span>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content ma11-settings-content">
      <p>\u7ED3\u6784\u5316\u72B6\u6001\u8868\u3001\u5206\u5C42\u603B\u7ED3\u3001\u89C4\u5219\u5BA1\u6838\u4E0E\u804A\u5929\u4E16\u754C\u4E66\u53D1\u5E03\u3002</p>
      <label class="ma11-switch"><input type="checkbox" data-ma11-quick-setting="enabled" /><span>\u542F\u7528\u955C\u6E0A</span></label>
      <div class="ma11-settings-buttons">
        <button type="button" class="menu_button" data-ma11-action="open">\u6253\u5F00\u955C\u6E0A\u63A7\u5236\u4E2D\u5FC3</button>
        <button type="button" class="menu_button" data-ma11-action="diagnostics">\u8FD0\u884C\u8BCA\u65AD</button>
      </div>
      <small>\u6A21\u578B\u5BC6\u94A5\u7531 SillyTavern Connection Profile \u7BA1\u7406\u3002\u955C\u6E0A\u4E0D\u4FDD\u5B58 API Key\u3002</small>
    </div>
  </div>
</div>`;
}
async function mountSettingsPanel() {
  if (document.querySelector("#ma11-settings-root")) return;
  const context = getContext();
  const host = await waitForElement("#extensions_settings2");
  const html = typeof context.renderExtensionTemplateAsync === "function" ? await context.renderExtensionTemplateAsync(extensionPathFromUrl(), "settings", {
    title: DISPLAY_NAME,
    version: VERSION
  }) : fallbackTemplate();
  host.insertAdjacentHTML("beforeend", html);
  const root2 = document.querySelector("#ma11-settings-root");
  if (!root2) throw new Error("\u8BBE\u7F6E\u6A21\u677F\u52A0\u8F7D\u540E\u672A\u627E\u5230\u6839\u8282\u70B9");
  root2.querySelector('[data-ma11-quick-setting="enabled"]').checked = getSettings().enabled;
  root2.querySelector('[data-ma11-action="open"]')?.addEventListener("click", () => openWorkspace("overview"));
  root2.querySelector('[data-ma11-action="diagnostics"]')?.addEventListener("click", () => openWorkspace("diagnostics"));
  root2.querySelector('[data-ma11-quick-setting="enabled"]')?.addEventListener("change", (event) => {
    getSettings().enabled = event.target.checked;
    saveSettings();
  });
}
function unmountSettingsPanel() {
  document.querySelector("#ma11-settings-root")?.remove();
}
function updateTopTaskButton() {
  const button = document.querySelector("#ma11-top-button");
  if (!button) return;
  const latest = /* @__PURE__ */ new Map();
  for (const task of taskQueue.list().filter((item2) => item2.chatKey === currentChatKey()).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) latest.set(task.key, task);
  const tasks = [...latest.values()];
  const active = tasks.filter((task) => task.state === "queued" || task.state === "running").length;
  const failed = tasks.filter((task) => task.state === "failed").length;
  const badge = button.querySelector("[data-ma11-top-task-badge]");
  const icon = button.querySelector("i");
  const count = active || failed;
  if (badge) {
    badge.hidden = count === 0;
    badge.textContent = String(count);
  }
  button.classList.toggle("working", active > 0);
  button.classList.toggle("danger", active === 0 && failed > 0);
  if (icon) icon.className = active > 0 ? "fa-solid fa-spinner fa-spin" : failed > 0 ? "fa-solid fa-triangle-exclamation" : "fa-solid fa-table-list";
  button.title = active > 0 ? `\u955C\u6E0A\uFF1A${active} \u4E2A\u4EFB\u52A1\u8FD0\u884C\u4E2D` : failed > 0 ? `\u955C\u6E0A\uFF1A${failed} \u4E2A\u4EFB\u52A1\u5931\u8D25` : "\u6253\u5F00\u955C\u6E0A";
}
function mountOptionalTopButton() {
  const settings = getSettings();
  unmountOptionalTopButton();
  if (!settings.showTopButton) return;
  const candidates = ["#top-settings-holder", "#rightNavHolder", "#top-bar", "#top-bar-left"];
  const host = candidates.map((selector) => document.querySelector(selector)).find(Boolean);
  if (!host) return;
  const button = document.createElement("button");
  button.id = "ma11-top-button";
  button.className = "menu_button ma11-top-button";
  button.type = "button";
  button.title = "\u6253\u5F00\u955C\u6E0A";
  button.setAttribute("aria-label", "\u6253\u5F00\u955C\u6E0A");
  button.innerHTML = '<i class="fa-solid fa-table-list"></i><span data-ma11-top-task-badge hidden>0</span>';
  button.addEventListener("click", () => {
    const latest = /* @__PURE__ */ new Map();
    for (const task of taskQueue.list().filter((item2) => item2.chatKey === currentChatKey()).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) latest.set(task.key, task);
    const hasAttention = [...latest.values()].some((task) => task.state === "queued" || task.state === "running" || task.state === "failed");
    openWorkspace(hasAttention ? "tasks" : "overview");
  });
  host.appendChild(button);
  topTaskUnsubscribe = taskQueue.subscribe(updateTopTaskButton);
  updateTopTaskButton();
}
function unmountOptionalTopButton() {
  topTaskUnsubscribe?.();
  topTaskUnsubscribe = null;
  document.querySelector("#ma11-top-button")?.remove();
}

// src/bootstrap/app.ts
init_chat_scope();
init_task_queue();

// src/migration/legacy-migration.ts
init_constants();
init_utils();
init_repository();
var MIGRATION_VERSION = 4;
var fallbackMigrationLocks = new LockManager();
function migrationLocks() {
  return foundationKernel.services.tryGet(LOCK_MANAGER) ?? fallbackMigrationLocks;
}
function migrationCoordinator() {
  return foundationKernel.services.tryGet(CROSS_TAB_COORDINATOR) ?? crossTabCoordinator;
}
function assertMigrationChat(chatKey, lease) {
  if (currentChatKey() !== chatKey) throw new Error("\u8FC1\u79FB\u6240\u5C5E\u804A\u5929\u5DF2\u6539\u53D8");
  lease?.assertOwner();
}
function alpha67ChatKey() {
  const context = getContext();
  const chatId = String(
    context.getCurrentChatId?.() ?? context.chatId ?? context.chat_metadata?.chat_id ?? context.chatMetadata?.chat_id ?? ""
  );
  const scope = context.groupId ? `group:${context.groupId}` : `character:${context.characterId ?? context.name2 ?? "unknown"}`;
  const seed = `${scope}|${chatId || context.name1 || "chat"}|${context.name2 || ""}`;
  return `${scope}:${hashText(seed)}`;
}
function legacyChatKeys() {
  const current = currentChatKey();
  return [...new Set([legacyCurrentChatKey(), alpha67ChatKey()].filter((key) => key && key !== current))];
}
function mergeById(current, legacy) {
  const result = current.map((item2) => deepClone(item2));
  const ids = new Set(result.map((item2) => item2.id));
  for (const item2 of legacy) {
    if (!item2?.id || ids.has(item2.id)) continue;
    result.push(deepClone(item2));
    ids.add(item2.id);
  }
  return result;
}
function normalizeOldArtifact(value, index, chatKey) {
  if (!value || typeof value !== "object") return null;
  const message = getChat()[index];
  if (!message || message.is_user) return null;
  const artifact = deepClone(value);
  artifact.schemaVersion = 1;
  artifact.chatKey = chatKey;
  artifact.messageIndex = index;
  artifact.messageKey = messageIdentity(index);
  artifact.sourceFingerprint = messageFingerprint(index);
  artifact.createdAt ||= nowIso();
  artifact.updatedAt = nowIso();
  artifact.stages ||= createArtifactForMessage(index).stages;
  artifact.stages.revision ||= { status: "idle", attempts: 0 };
  if (artifact.snapshot) artifact.snapshot = normalizeSnapshot(artifact.snapshot, artifact.snapshot);
  return artifact;
}
function artifactFromLegacySnapshot(index, snapshot) {
  const artifact = createArtifactForMessage(index);
  artifact.snapshot = normalizeSnapshot(snapshot, snapshot);
  markStage(artifact, "audit", "skipped");
  markStage(artifact, "state", "success");
  return artifact;
}
async function previewLegacyMigrationForCurrentChat() {
  const chatKey = currentChatKey();
  const keys = legacyChatKeys();
  const legacyStates = await Promise.all(keys.map((key) => getChatStateExact(key)));
  let currentArtifactCount = 0;
  let oldArtifactCount = 0;
  let legacySnapshotCount = 0;
  for (const message of getChat()) {
    if (message?.is_user) continue;
    const current = message?.extra?.[MODULE_NAME];
    if (current?.chatKey === chatKey) currentArtifactCount += 1;
    else if (current && typeof current === "object") oldArtifactCount += 1;
    if (message?.extra?.[LEGACY_MODULE_NAME]?.tableSnapshot) legacySnapshotCount += 1;
  }
  const context = getContext();
  const legacySettingsFound = Boolean(context.extensionSettings?.[LEGACY_MODULE_NAME]);
  const legacyMetadataFound = Boolean(context.chatMetadata?.[LEGACY_MODULE_NAME]);
  const legacyChatStateFound = legacyStates.some(Boolean);
  const changes = oldArtifactCount + legacySnapshotCount + Number(legacyChatStateFound) + Number(legacySettingsFound) + Number(legacyMetadataFound);
  return {
    chatKey,
    legacyChatKey: keys.join(","),
    currentArtifactCount,
    oldArtifactCount,
    legacySnapshotCount,
    legacyChatStateFound,
    legacySettingsFound,
    legacyMetadataFound,
    changes,
    createdAt: nowIso()
  };
}
async function createBackup(preview) {
  const context = getContext();
  const states = {};
  for (const key of legacyChatKeys()) states[key] = await getChatStateExact(key);
  const payload = {
    extensionSettings: {
      [LEGACY_MODULE_NAME]: deepClone(context.extensionSettings?.[LEGACY_MODULE_NAME] ?? null),
      [MODULE_NAME]: deepClone(context.extensionSettings?.[MODULE_NAME] ?? null)
    },
    chatMetadata: {
      [LEGACY_MODULE_NAME]: deepClone(context.chatMetadata?.[LEGACY_MODULE_NAME] ?? null),
      [MODULE_NAME]: deepClone(context.chatMetadata?.[MODULE_NAME] ?? null)
    },
    legacyChatStates: states,
    messageExtras: getChat().map((message, index) => ({
      index,
      module: deepClone(message?.extra?.[MODULE_NAME] ?? null),
      legacy: deepClone(message?.extra?.[LEGACY_MODULE_NAME] ?? null)
    }))
  };
  const backup = {
    schemaVersion: 1,
    id: makeId("migration-backup"),
    chatKey: preview.chatKey,
    preview: deepClone(preview),
    payload,
    createdAt: nowIso()
  };
  await putMigrationBackup(backup);
  return backup;
}
async function applyLegacyMigrationUnlocked(requestedPreview, lease) {
  const chatKey = currentChatKey();
  assertMigrationChat(chatKey, lease);
  const preview = requestedPreview?.chatKey === chatKey ? await previewLegacyMigrationForCurrentChat() : await previewLegacyMigrationForCurrentChat();
  const currentState = await getChatState(chatKey);
  if (currentState.migrationVersion && currentState.migrationVersion >= MIGRATION_VERSION) {
    return { migratedArtifacts: 0, backupId: currentState.migrationBackupId, preview };
  }
  const backup = preview.changes > 0 ? await createBackup(preview) : null;
  let migratedArtifacts = 0;
  const migratedKeys = [];
  const chat = getChat();
  for (let index = 0; index < chat.length; index += 1) {
    assertMigrationChat(chatKey, lease);
    const message = chat[index];
    if (!message || message.is_user) continue;
    const attached = getAttachedArtifact(message);
    let artifact = null;
    if (attached?.chatKey === chatKey) {
      artifact = attached;
    } else if (attached) {
      artifact = normalizeOldArtifact(attached, index, chatKey);
    } else {
      const legacySnapshot = message.extra?.[LEGACY_MODULE_NAME]?.tableSnapshot;
      if (legacySnapshot) artifact = artifactFromLegacySnapshot(index, legacySnapshot);
    }
    if (!artifact) continue;
    if (artifact !== attached || attached?.chatKey !== chatKey) migratedArtifacts += 1;
    attachArtifactToMessage(message, artifact);
    await putArtifact(artifact);
    const verifiedArtifact = await getArtifact(chatKey, artifact.messageKey);
    if (!verifiedArtifact || verifiedArtifact.chatKey !== chatKey || verifiedArtifact.messageKey !== artifact.messageKey) {
      throw new Error(`\u65E7\u6D88\u606F\u4EA7\u7269\u8FC1\u79FB\u56DE\u8BFB\u5931\u8D25\uFF1A${artifact.messageKey}`);
    }
    if (!migratedKeys.includes(artifact.messageKey)) migratedKeys.push(artifact.messageKey);
  }
  for (const key of legacyChatKeys()) {
    assertMigrationChat(chatKey, lease);
    const legacyState = await getChatStateExact(key);
    if (!legacyState) continue;
    currentState.smallSummaries = mergeById(currentState.smallSummaries, legacyState.smallSummaries ?? []);
    currentState.largeSummaries = mergeById(currentState.largeSummaries, legacyState.largeSummaries ?? []);
    currentState.processedMessageKeys = [.../* @__PURE__ */ new Set([...currentState.processedMessageKeys, ...legacyState.processedMessageKeys ?? []])];
    currentState.lastLorebookName ||= legacyState.lastLorebookName;
    currentState.lastSyncAt ||= legacyState.lastSyncAt;
  }
  currentState.eventEntries = rebuildEventEntries(currentState.smallSummaries, currentState.largeSummaries);
  currentState.processedMessageKeys = [.../* @__PURE__ */ new Set([...currentState.processedMessageKeys, ...migratedKeys])];
  if (migratedKeys.length) currentState.latestSnapshotMessageKey = migratedKeys.at(-1);
  const context = getContext();
  const legacyMeta = context.chatMetadata?.[LEGACY_MODULE_NAME];
  if (legacyMeta && typeof legacyMeta === "object") {
    context.chatMetadata ||= {};
    context.chatMetadata[MODULE_NAME] ||= {};
    const currentMeta = context.chatMetadata[MODULE_NAME];
    currentMeta.lorebookName ||= legacyMeta.lorebookName;
    currentMeta.updatedAt = nowIso();
    assertMigrationChat(chatKey, lease);
    await persistMetadata();
  }
  if (migratedArtifacts) {
    assertMigrationChat(chatKey, lease);
    await persistChat();
  }
  currentState.migrationVersion = MIGRATION_VERSION;
  currentState.migrationBackupId = backup?.id;
  assertMigrationChat(chatKey, lease);
  await putChatState(currentState);
  const verifiedState = await getChatState(chatKey);
  if (verifiedState.migrationVersion !== MIGRATION_VERSION || verifiedState.migrationBackupId !== backup?.id) {
    throw new Error("\u65E7\u804A\u5929\u72B6\u6001\u8FC1\u79FB\u56DE\u8BFB\u5931\u8D25");
  }
  const settings = getSettings();
  settings.migration.legacyChecked = true;
  saveSettings();
  await safeAppendOperationLog(chatKey, {
    category: "migration",
    action: "legacy-import",
    resourceId: backup?.id,
    state: "committed",
    detail: `${migratedArtifacts} \u6761\u6D88\u606F\u4EA7\u7269\uFF1B${preview.legacyChatStateFound ? "\u5DF2\u5408\u5E76\u65E7\u804A\u5929\u72B6\u6001" : "\u65E0\u65E7\u804A\u5929\u72B6\u6001"}`
  });
  return { migratedArtifacts, backupId: backup?.id, preview };
}
async function applyLegacyMigrationForCurrentChat(preview) {
  const chatKey = currentChatKey();
  return migrationCoordinator().withLease(
    `migration:${chatKey}`,
    async (lease) => migrationLocks().withLock(`migration:${chatKey}`, async () => {
      assertMigrationChat(chatKey, lease);
      return applyLegacyMigrationUnlocked(preview, lease);
    })
  );
}
async function migrateLegacyDataForCurrentChat() {
  const state2 = await getChatState(currentChatKey());
  if (state2.migrationVersion && state2.migrationVersion >= MIGRATION_VERSION) {
    return { migratedArtifacts: 0, backupId: state2.migrationBackupId, preview: await previewLegacyMigrationForCurrentChat() };
  }
  return applyLegacyMigrationForCurrentChat();
}

// src/migration/chat-scope-migration.ts
init_constants();
init_utils();
init_chat_scope();
init_repository();
async function migrateCurrentChatScopeIdentity() {
  ensureChatIdentityForContext(getContext());
  const scope = chatScopeManager.current();
  if (!scope.persistent) {
    return { chatKey: scope.chatKey, aliases: [], copiedStorageRecords: 0, updatedMessages: 0 };
  }
  const artifactAliases = getChat().map((message) => getAttachedArtifact(message)?.chatKey).filter((value) => Boolean(value && value !== scope.chatKey));
  const aliases = [.../* @__PURE__ */ new Set([...scope.aliases, ...artifactAliases])];
  const copiedStorageRecords = await migrateChatStorageAliases(scope.chatKey, aliases);
  let updatedMessages = 0;
  for (const message of getChat()) {
    const artifact = getAttachedArtifact(message);
    if (!artifact || artifact.chatKey === scope.chatKey || !aliases.includes(artifact.chatKey)) continue;
    artifact.chatKey = scope.chatKey;
    artifact.updatedAt = nowIso();
    message.extra ||= {};
    message.extra[MODULE_NAME] = artifact;
    await putArtifact(artifact);
    updatedMessages += 1;
  }
  if (updatedMessages) await persistChat();
  return { chatKey: scope.chatKey, aliases, copiedStorageRecords, updatedMessages };
}

// src/integrations/chat-metadata.ts
init_constants();
init_chat_scope();
init_utils();
function currentContext() {
  try {
    return globalThis.SillyTavern?.getContext?.() ?? null;
  } catch {
    return null;
  }
}
function namespace(context, create = false) {
  const metadata = context?.chatMetadata ?? context?.chat_metadata;
  if (!metadata) return null;
  if (!metadata[MODULE_NAME] && create) {
    metadata[MODULE_NAME] = {
      schemaVersion: 2,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }
  return metadata[MODULE_NAME] ?? null;
}
function isCurrentChat(chatKey) {
  try {
    return chatScopeManager.current().chatKey === chatKey;
  } catch {
    return false;
  }
}
var chatMetadataStateBridge = {
  read(chatKey) {
    if (!isCurrentChat(chatKey)) return null;
    const context = currentContext();
    const envelope = namespace(context)?.portableChatState;
    if (!envelope || envelope.schemaVersion !== 1 || !envelope.state) return null;
    const state2 = structuredClone(envelope.state);
    state2.chatKey = chatKey;
    return state2;
  },
  write(state2) {
    if (!isCurrentChat(state2.chatKey)) return;
    const context = currentContext();
    const target = namespace(context, true);
    if (!context || !target) return;
    const portableState = structuredClone(state2);
    portableState.chatKey = state2.chatKey;
    const next = {
      schemaVersion: 1,
      state: portableState,
      updatedAt: nowIso()
    };
    const previous = target.portableChatState;
    if (previous && JSON.stringify(previous.state) === JSON.stringify(next.state)) return;
    target.portableChatState = next;
    target.updatedAt = next.updatedAt;
    context.saveMetadataDebounced?.();
  },
  clear(chatKey) {
    if (!isCurrentChat(chatKey)) return;
    const context = currentContext();
    const target = namespace(context);
    if (!context || !target || !target.portableChatState) return;
    delete target.portableChatState;
    target.updatedAt = nowIso();
    context.saveMetadataDebounced?.();
  }
};

// src/bootstrap/app.ts
var state = "idle";
var cleanupPipeline = null;
var cleanupPanels = null;
var cleanupUiEvents = null;
var cleanupAppReady = null;
var startupRetryTimer = null;
var startupFallbackTimer = null;
var extensionActive = true;
var lifecycleEpoch = 0;
var lastError = null;
var debugRegisteredContexts = /* @__PURE__ */ new WeakSet();
var InitializationCancelledError = class extends Error {
  constructor() {
    super("\u6269\u5C55\u751F\u547D\u5468\u671F\u5DF2\u6539\u53D8\uFF0C\u542F\u52A8\u6D41\u7A0B\u5DF2\u53D6\u6D88");
    this.name = "InitializationCancelledError";
  }
};
function assertActive(epoch) {
  if (!extensionActive || epoch !== lifecycleEpoch) throw new InitializationCancelledError();
}
function exposeApi() {
  globalThis.MirrorAbyss = {
    version: VERSION,
    open: (tab = "overview") => {
      if (!extensionActive || state !== "ready") throw new Error("\u955C\u6E0A\u5F53\u524D\u672A\u542F\u7528");
      return openWorkspace(tab);
    },
    processLatest: async () => {
      if (!extensionActive || state !== "ready") throw new Error("\u955C\u6E0A\u5F53\u524D\u672A\u542F\u7528");
      const context = getContext();
      const index = [...context.chat ?? []].map((_, i) => i).reverse().find((i) => !context.chat[i]?.is_user && String(context.chat[i]?.mes || "").trim());
      if (index === void 0) throw new Error("\u6CA1\u6709\u53EF\u6574\u7406\u7684AI\u6B63\u6587");
      return processMessage(index, true);
    },
    diagnostics: diagnosticReport,
    getState: () => ({
      state,
      active: extensionActive,
      kernel: foundationKernel.status(),
      scope: tryGetContext() ? chatScopeManager.current() : null,
      lastError: lastError instanceof Error ? lastError.message : String(lastError || "")
    }),
    recovery: {
      previewMigration: previewLegacyMigrationForCurrentChat,
      migrate: migrateLegacyDataForCurrentChat,
      bundle: buildRecoveryBundleForCurrentChat,
      download: downloadRecoveryBundleForCurrentChat,
      cleanup: cleanupRecoveryHistoryForCurrentChat,
      resolveLorebookConflict: resolveLorebookConflictForCurrentChat,
      cancelLocalCommitConflict,
      retryHistoryRebuild: recoverHistoryConsistencyForCurrentChat
    }
  };
  globalThis.MirrorAbyssGenerationInterceptor = generationInterceptor;
}
function hideApi() {
  if (globalThis.MirrorAbyssGenerationInterceptor === generationInterceptor) {
    delete globalThis.MirrorAbyssGenerationInterceptor;
  }
  delete globalThis.MirrorAbyss;
}
function showFatal(error) {
  document.querySelector("#ma11-fatal")?.remove();
  const button = document.createElement("button");
  button.id = "ma11-fatal";
  button.className = "ma11-fatal";
  button.type = "button";
  button.textContent = "\u955C\u6E0A\u542F\u52A8\u5931\u8D25\uFF5C\u67E5\u770B\u8BCA\u65AD";
  button.title = error instanceof Error ? error.message : String(error);
  button.addEventListener("click", () => openWorkspace("diagnostics"));
  document.body.appendChild(button);
}
function clearStartupTimers() {
  if (startupRetryTimer !== null) window.clearTimeout(startupRetryTimer);
  if (startupFallbackTimer !== null) window.clearTimeout(startupFallbackTimer);
  startupRetryTimer = null;
  startupFallbackTimer = null;
}
function uninstallAppReadyHandler() {
  clearStartupTimers();
  cleanupAppReady?.();
  cleanupAppReady = null;
}
function teardownRuntime(reason = "\u6269\u5C55\u5DF2\u505C\u6B62") {
  clearAllQuarantines();
  taskQueue.cancelAll(reason);
  unifiedFactScheduler.cancelAll(reason);
  cleanupPipeline?.();
  cleanupPanels?.();
  cleanupUiEvents?.();
  cleanupPipeline = null;
  cleanupPanels = null;
  cleanupUiEvents = null;
  foundationKernel.stop();
  configurePortableChatStateBridge(null);
  removeAllMessagePanels();
  unmountWorkspace();
  unmountSettingsPanel();
  unmountOptionalTopButton();
  document.querySelector("#ma11-fatal")?.remove();
  document.documentElement.classList.remove("ma11-generation-locked");
}
async function initialize() {
  if (!extensionActive || state === "ready" || state === "initializing") return;
  const epoch = lifecycleEpoch;
  state = "initializing";
  lastError = null;
  exposeApi();
  try {
    getSettings();
    configurePortableChatStateBridge(chatMetadataStateBridge);
    await foundationKernel.start(getContext());
    assertActive(epoch);
    await migrateCurrentChatScopeIdentity();
    assertActive(epoch);
    await markInterruptedTasksStale(chatScopeManager.current().chatKey);
    await migrateLegacyDataForCurrentChat().catch((error) => {
      console.warn("[MirrorAbyss] legacy migration deferred", error);
    });
    assertActive(epoch);
    await recoverLocalCommitsForCurrentChat().catch((error) => {
      console.warn("[MirrorAbyss] local commit recovery deferred", error);
    });
    assertActive(epoch);
    await recoverHistoryConsistencyForCurrentChat().catch((error) => {
      console.warn("[MirrorAbyss] history consistency recovery deferred", error);
    });
    assertActive(epoch);
    await recoverLorebookOutboxForCurrentChat().catch((error) => {
      console.warn("[MirrorAbyss] lorebook outbox recovery deferred", error);
    });
    assertActive(epoch);
    await mountSettingsPanel();
    assertActive(epoch);
    mountOptionalTopButton();
    cleanupPipeline ||= installPipelineEventHandlers();
    cleanupPanels ||= installMessagePanelHandlers();
    renderAllMessagePanels();
    const context = getContext();
    if (!cleanupUiEvents) {
      const router = foundationKernel.services.get(EVENT_ROUTER);
      const rerender = () => {
        if (!extensionActive) return;
        renderAllMessagePanels();
        refreshWorkspace();
      };
      const onChatChanged = () => {
        if (!extensionActive) return;
        resetWorkspaceChatSelection();
        window.setTimeout(() => {
          if (!extensionActive) return;
          void migrateCurrentChatScopeIdentity().then(() => migrateLegacyDataForCurrentChat()).catch((error) => console.warn("[MirrorAbyss] migration after chat change failed", error)).then(() => recoverLocalCommitsForCurrentChat()).catch((error) => console.warn("[MirrorAbyss] local recovery after chat change failed", error)).then(() => recoverHistoryConsistencyForCurrentChat()).catch((error) => console.warn("[MirrorAbyss] history consistency after chat change failed", error)).then(() => recoverLorebookOutboxForCurrentChat()).catch((error) => console.warn("[MirrorAbyss] lorebook outbox recovery after chat change failed", error)).finally(() => {
            if (!extensionActive) return;
            renderAllMessagePanels();
            refreshWorkspace();
          });
        }, 0);
      };
      const cleanups = [
        router.subscribe("message-rendered", rerender),
        router.subscribe("message-removed", rerender),
        router.subscribe("chat-changed", onChatChanged),
        router.subscribe("chat-created", onChatChanged)
      ];
      cleanupUiEvents = () => cleanups.splice(0).forEach((cleanup) => cleanup());
    }
    if (typeof context.registerDebugFunction === "function" && !debugRegisteredContexts.has(context)) {
      context.registerDebugFunction(
        "mirror_abyss_diagnostics",
        "Mirror Abyss Diagnostics",
        "Open the Mirror Abyss diagnostics panel",
        () => {
          if (extensionActive && state === "ready") openWorkspace("diagnostics");
        }
      );
      debugRegisteredContexts.add(context);
    }
    assertActive(epoch);
    document.querySelector("#ma11-fatal")?.remove();
    state = "ready";
    toast("success", `\u5DF2\u542F\u52A8 ${VERSION}`);
  } catch (error) {
    if (error instanceof InitializationCancelledError) {
      teardownRuntime("\u542F\u52A8\u5DF2\u53D6\u6D88");
      state = "idle";
      return;
    }
    state = "error";
    lastError = error;
    console.error("[MirrorAbyss] initialization failed", error);
    teardownRuntime("\u542F\u52A8\u5931\u8D25");
    if (extensionActive) showFatal(error);
  }
}
function installAppReadyHandler() {
  if (!extensionActive || cleanupAppReady || startupRetryTimer !== null) return;
  const context = tryGetContext();
  if (!context) {
    startupRetryTimer = window.setTimeout(() => {
      startupRetryTimer = null;
      installAppReadyHandler();
    }, 250);
    return;
  }
  const rawType = context.event_types?.APP_READY;
  const handler = () => {
    if (!extensionActive) return;
    window.setTimeout(() => void initialize(), 0);
  };
  if (rawType && context.eventSource?.on) {
    context.eventSource.on(rawType, handler);
    cleanupAppReady = () => context.eventSource?.removeListener?.(rawType, handler);
  } else {
    cleanupAppReady = () => void 0;
  }
  startupFallbackTimer = window.setTimeout(() => {
    startupFallbackTimer = null;
    if (extensionActive) void initialize();
  }, 1200);
}
async function cleanData() {
  await clearAllStorage();
  const context = tryGetContext();
  if (context?.extensionSettings?.[MODULE_NAME]) delete context.extensionSettings[MODULE_NAME];
  context?.saveSettingsDebounced?.();
}
function onEnable() {
  if (extensionActive && state === "ready") return;
  extensionActive = true;
  lifecycleEpoch += 1;
  exposeApi();
  installAppReadyHandler();
  if (tryGetContext()) void initialize();
}
function onDisable() {
  if (!extensionActive && state === "idle") return;
  extensionActive = false;
  lifecycleEpoch += 1;
  uninstallAppReadyHandler();
  teardownRuntime("\u6269\u5C55\u5DF2\u7981\u7528");
  hideApi();
  state = "idle";
}
function onActivate() {
  extensionActive = true;
  exposeApi();
  installAppReadyHandler();
}
async function onInstall() {
  exposeApi();
}
async function onUpdate() {
  const settings = tryGetContext() ? getSettings() : null;
  if (settings) {
    settings.migration.legacyChecked = false;
    saveSettings();
  }
}
async function onClean() {
  await cleanData();
}
async function onDelete() {
  extensionActive = false;
  lifecycleEpoch += 1;
  uninstallAppReadyHandler();
  teardownRuntime("\u6269\u5C55\u5DF2\u5220\u9664");
  hideApi();
  state = "idle";
}

// src/index.ts
installAppReadyHandler();
export {
  onActivate,
  onClean,
  onDelete,
  onDisable,
  onEnable,
  onInstall,
  onUpdate
};
