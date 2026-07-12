// src/constants.ts
var MODULE_NAME = "mirrorAbyssV11";
var LEGACY_MODULE_NAME = "mirrorAbyss";
var DISPLAY_NAME = "\u955C\u6E0A";
var VERSION = "1.1.0-alpha.9.7";
var PIPELINE_VERSION = "ma-pipeline-9.7";
var TABLE_KEYS = [
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
var TABLE_LABELS = {
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
var DEFAULT_SETTINGS = {
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
  latestContinuityConstant: true,
  lorebookLayout: "semantic",
  repairInvalidJsonOnce: true,
  requestTimeoutMs: 9e4,
  connections: {
    audit: { mode: "current", profileId: "", profile: "", independentProfileId: "" },
    revision: { mode: "current", profileId: "", profile: "", independentProfileId: "" },
    state: { mode: "current", profileId: "", profile: "", independentProfileId: "" },
    smallSummary: { mode: "current", profileId: "", profile: "", independentProfileId: "" },
    largeSummary: { mode: "current", profileId: "", profile: "", independentProfileId: "" }
  },
  independentApiProfiles: [],
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
var STORAGE_DB_NAME = "mirror-abyss-v11";
var STORAGE_CHAT_PREFIX = "ma11:chat:";
var STORAGE_ARTIFACT_PREFIX = "ma11:artifact:";
var STORAGE_LOG_PREFIX = "ma11:log:";
var STORAGE_TASK_PREFIX = "ma11:task:";
var STORAGE_OUTBOX_PREFIX = "ma11:outbox:";
var STORAGE_LOCAL_COMMIT_PREFIX = "ma11:local-commit:";
var STORAGE_OPERATION_LOG_PREFIX = "ma11:operation-log:";
var STORAGE_BACKUP_PREFIX = "ma11:backup:";
var CROSS_TAB_CHANNEL = "mirror-abyss-v11-coordination";
var CROSS_TAB_LEASE_PREFIX = "mirror-abyss-v11:lease:";

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
function withTimeout(promise, ms, label, controller) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      controller?.abort();
      reject(new Error(`${label}\u8D85\u65F6\uFF08${Math.round(ms / 1e3)}\u79D2\uFF09`));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}
function safeText(value, max = 1e5) {
  return String(value ?? "").replace(/\u0000/g, "").slice(0, max);
}
var JsonObjectParseError = class extends Error {
  preview;
  attempts;
  constructor(message, raw, attempts = []) {
    super(message);
    this.name = "JsonObjectParseError";
    this.preview = jsonPreview(raw);
    this.attempts = attempts;
  }
};
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
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
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
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
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

// src/foundation/account-scope.ts
var ACCOUNT_ID_STORAGE_KEY = `${MODULE_NAME}:account-instance-id`;
var sessionAccountIds = /* @__PURE__ */ new WeakMap();
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
var ChatScopeManager = class {
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
var chatScopeManager = new ChatScopeManager();

// src/core/context.ts
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
  context.extensionSettings[MODULE_NAME] = mergeDefaults(DEFAULT_SETTINGS, migrated);
  const settings = context.extensionSettings[MODULE_NAME];
  if (String(settings.lorebookLayout) === "compact") settings.lorebookLayout = "semantic";
  settings.independentApiProfiles ||= [];
  const savedProfiles = Array.isArray(context.extensionSettings?.connectionManager?.profiles) ? context.extensionSettings.connectionManager.profiles : [];
  for (const connection of Object.values(settings.connections ?? {})) {
    connection.profileId ||= "";
    connection.profile ||= "";
    connection.independentProfileId ||= "";
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
    latestContinuityConstant: legacy.latestContinuityConstant ?? true,
    connections: {
      audit: { mode: legacy.auditProfile ? "profile" : "current", profileId: "", profile: safeText(legacy.auditProfile ?? "", 120), independentProfileId: "" },
      revision: { mode: legacy.revisionProfile ? "profile" : "current", profileId: "", profile: safeText(legacy.revisionProfile ?? legacy.auditProfile ?? "", 120), independentProfileId: "" },
      state: { mode: legacy.stateProfile ? "profile" : "current", profileId: "", profile: safeText(legacy.stateProfile ?? "", 120), independentProfileId: "" },
      smallSummary: { mode: legacy.smallSummaryProfile ? "profile" : "current", profileId: "", profile: safeText(legacy.smallSummaryProfile ?? "", 120), independentProfileId: "" },
      largeSummary: { mode: legacy.largeSummaryProfile ? "profile" : "current", profileId: "", profile: safeText(legacy.largeSummaryProfile ?? "", 120), independentProfileId: "" }
    },
    independentApiProfiles: []
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

// src/storage/repository.ts
var portableChatStateBridge = null;
var persistentAdapters = /* @__PURE__ */ new Map();
var ephemeralMap = /* @__PURE__ */ new Map();
var ephemeralAdapter = {
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

// src/domain/artifact.ts
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

// src/foundation/connection-broker.ts
var ConnectionRequestError = class extends Error {
  kind;
  status;
  responsePreview;
  retryAfterMs;
  attempts;
  connectionKey;
  constructor(message, kind, options = {}) {
    super(message, options.cause ? { cause: options.cause } : void 0);
    this.name = "ConnectionRequestError";
    this.kind = kind;
    this.status = options.status;
    this.responsePreview = options.responsePreview;
    this.retryAfterMs = options.retryAfterMs;
    this.attempts = options.attempts;
    this.connectionKey = options.connectionKey;
  }
};
var DEFAULT_POLICY = {
  maxConcurrent: 1,
  maxRetries: 2,
  baseBackoffMs: 750,
  maxBackoffMs: 12e3,
  jitterRatio: 0.2,
  circuitFailureThreshold: 3,
  circuitOpenMs: 3e4
};
function makeRequestId() {
  return `ma-conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? "\u672A\u77E5\u9519\u8BEF");
}
function copyError(error, patch) {
  return new ConnectionRequestError(error.message, error.kind, {
    status: error.status,
    responsePreview: error.responsePreview,
    retryAfterMs: error.retryAfterMs,
    attempts: error.attempts,
    connectionKey: error.connectionKey,
    cause: error.cause,
    ...patch
  });
}
function normalizeConnectionError(error) {
  if (error instanceof ConnectionRequestError) return error;
  const message = errorMessage(error);
  const candidate = error;
  const statusValue = Number(candidate?.status ?? candidate?.response?.status);
  const status = Number.isInteger(statusValue) && statusValue > 0 ? statusValue : void 0;
  const options = { status, cause: error };
  if (/abort|cancel|取消/i.test(message)) return new ConnectionRequestError(message || "\u8BF7\u6C42\u5DF2\u53D6\u6D88", "cancelled", options);
  if (status === 408 || status === 504 || /timeout|timed out|超时/i.test(message)) return new ConnectionRequestError(message, "timeout", options);
  if (status === 429 || /429|rate.?limit|too many requests|限流/i.test(message)) return new ConnectionRequestError(message, "rate_limit", options);
  if (status === 401 || status === 403 || /401|403|unauthori[sz]ed|forbidden|密钥|鉴权|认证/i.test(message)) return new ConnectionRequestError(message, "authentication", options);
  if (status === 404 || /(?:^|\D)404(?:\D|$)|not found/i.test(message)) return new ConnectionRequestError(message, "not_found", options);
  if (status === 400 || status === 409 || status === 422 || /bad request|invalid request|unprocessable/i.test(message)) {
    return new ConnectionRequestError(message, "configuration", options);
  }
  if (/network|fetch|socket|ECONN|ENOTFOUND|网络/i.test(message)) return new ConnectionRequestError(message, "network", options);
  return new ConnectionRequestError(message, "upstream", options);
}
function isRetryable(error) {
  return error.kind === "rate_limit" || error.kind === "network" || error.kind === "upstream";
}
function countsTowardCircuit(error) {
  return error.kind === "rate_limit" || error.kind === "network" || error.kind === "upstream" || error.kind === "timeout";
}
var ConnectionBroker = class {
  lanes = /* @__PURE__ */ new Map();
  circuits = /* @__PURE__ */ new Map();
  requests = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }
  snapshot() {
    return {
      active: [...this.requests.values()].map(({ controller: _controller, ...record }) => ({ ...record })),
      lanes: [...this.lanes.entries()].map(([connectionKey, lane]) => ({
        connectionKey,
        active: lane.active,
        queued: lane.waiters.length,
        maxConcurrent: lane.maxConcurrent
      })),
      circuits: [...this.circuits.entries()].map(([connectionKey, circuit]) => ({ connectionKey, ...circuit }))
    };
  }
  async request(request) {
    const policy = this.resolvePolicy(request.policy);
    const id = request.id || makeRequestId();
    if (this.requests.has(id)) {
      throw new ConnectionRequestError(`\u8FDE\u63A5\u8BF7\u6C42ID\u91CD\u590D\uFF1A${id}`, "configuration", { connectionKey: request.connectionKey });
    }
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener("abort", forwardAbort, { once: true });
    if (request.signal?.aborted) controller.abort(request.signal.reason);
    const record = {
      id,
      connectionKey: request.connectionKey,
      scopeKey: request.scopeKey || "",
      label: request.label,
      state: "queued",
      attempt: 0,
      controller,
      startedAt: Date.now()
    };
    this.requests.set(id, record);
    this.emit();
    let release;
    try {
      release = await this.acquire(request.connectionKey, policy.maxConcurrent, controller.signal);
      record.state = "running";
      this.emit();
      this.assertCircuitAvailable(request.connectionKey, policy);
      let lastError2 = null;
      for (let attempt = 1; attempt <= policy.maxRetries + 1; attempt += 1) {
        record.attempt = attempt;
        record.state = attempt === 1 ? "running" : "retrying";
        this.emit();
        try {
          const value = await this.executeAttempt(request, controller.signal, attempt);
          this.recordSuccess(request.connectionKey);
          return value;
        } catch (error) {
          let normalized = normalizeConnectionError(error);
          if (controller.signal.aborted && normalized.kind !== "timeout") {
            normalized = new ConnectionRequestError(`${request.label}\u5DF2\u53D6\u6D88`, "cancelled", {
              cause: error,
              connectionKey: request.connectionKey,
              attempts: attempt
            });
          }
          lastError2 = copyError(normalized, { attempts: attempt, connectionKey: request.connectionKey });
          if (!isRetryable(lastError2) || attempt > policy.maxRetries || controller.signal.aborted) break;
          const delay = this.retryDelay(lastError2, attempt, policy);
          await this.wait(delay, controller.signal, request.label);
        }
      }
      const finalError = lastError2 ?? new ConnectionRequestError(`${request.label}\u5931\u8D25`, "upstream");
      this.recordFailure(request.connectionKey, finalError, policy);
      throw finalError;
    } finally {
      release?.();
      request.signal?.removeEventListener("abort", forwardAbort);
      this.requests.delete(id);
      this.emit();
    }
  }
  cancel(requestId, reason = "\u8BF7\u6C42\u5DF2\u53D6\u6D88") {
    const record = this.requests.get(requestId);
    if (!record) return false;
    record.controller.abort(new ConnectionRequestError(reason, "cancelled", { connectionKey: record.connectionKey }));
    this.emit();
    return true;
  }
  cancelScope(scopeKey, reason = "\u804A\u5929\u4F5C\u7528\u57DF\u5DF2\u5931\u6548") {
    let count = 0;
    for (const record of this.requests.values()) {
      if (record.scopeKey !== scopeKey) continue;
      record.controller.abort(new ConnectionRequestError(reason, "cancelled", { connectionKey: record.connectionKey }));
      count += 1;
    }
    if (count) this.emit();
    return count;
  }
  cancelAllExceptScope(scopeKey, reason = "\u804A\u5929\u5DF2\u5207\u6362") {
    let count = 0;
    for (const record of this.requests.values()) {
      if (record.scopeKey === scopeKey) continue;
      record.controller.abort(new ConnectionRequestError(reason, "cancelled", { connectionKey: record.connectionKey }));
      count += 1;
    }
    if (count) this.emit();
    return count;
  }
  cancelAll(reason = "\u8FDE\u63A5\u670D\u52A1\u5DF2\u505C\u6B62") {
    let count = 0;
    for (const record of this.requests.values()) {
      record.controller.abort(new ConnectionRequestError(reason, "cancelled", { connectionKey: record.connectionKey }));
      count += 1;
    }
    if (count) this.emit();
    return count;
  }
  resetCircuit(connectionKey) {
    if (connectionKey) this.circuits.delete(connectionKey);
    else this.circuits.clear();
    this.emit();
  }
  resolvePolicy(patch) {
    return {
      maxConcurrent: Math.max(1, Math.floor(patch?.maxConcurrent ?? DEFAULT_POLICY.maxConcurrent)),
      maxRetries: Math.max(0, Math.floor(patch?.maxRetries ?? DEFAULT_POLICY.maxRetries)),
      baseBackoffMs: Math.max(0, Math.floor(patch?.baseBackoffMs ?? DEFAULT_POLICY.baseBackoffMs)),
      maxBackoffMs: Math.max(0, Math.floor(patch?.maxBackoffMs ?? DEFAULT_POLICY.maxBackoffMs)),
      jitterRatio: Math.min(1, Math.max(0, Number(patch?.jitterRatio ?? DEFAULT_POLICY.jitterRatio))),
      circuitFailureThreshold: Math.max(1, Math.floor(patch?.circuitFailureThreshold ?? DEFAULT_POLICY.circuitFailureThreshold)),
      circuitOpenMs: Math.max(100, Math.floor(patch?.circuitOpenMs ?? DEFAULT_POLICY.circuitOpenMs))
    };
  }
  async acquire(connectionKey, maxConcurrent, signal) {
    let lane = this.lanes.get(connectionKey);
    if (!lane) {
      lane = { active: 0, maxConcurrent, waiters: [] };
      this.lanes.set(connectionKey, lane);
    }
    lane.maxConcurrent = maxConcurrent;
    if (signal.aborted) throw new ConnectionRequestError("\u8BF7\u6C42\u5728\u6392\u961F\u524D\u5DF2\u53D6\u6D88", "cancelled", { connectionKey });
    if (lane.active < lane.maxConcurrent) {
      lane.active += 1;
      this.emit();
      return this.releaseFactory(connectionKey, lane);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        signal,
        resolve,
        reject,
        onAbort: () => {
          const index = lane.waiters.indexOf(waiter);
          if (index >= 0) lane.waiters.splice(index, 1);
          reject(new ConnectionRequestError("\u8BF7\u6C42\u5728\u961F\u5217\u4E2D\u88AB\u53D6\u6D88", "cancelled", { connectionKey }));
          this.emit();
        }
      };
      signal.addEventListener("abort", waiter.onAbort, { once: true });
      lane.waiters.push(waiter);
      this.emit();
    });
  }
  releaseFactory(connectionKey, lane) {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      lane.active = Math.max(0, lane.active - 1);
      while (lane.waiters.length) {
        const waiter = lane.waiters.shift();
        waiter.signal.removeEventListener("abort", waiter.onAbort);
        if (waiter.signal.aborted) continue;
        lane.active += 1;
        waiter.resolve(this.releaseFactory(connectionKey, lane));
        break;
      }
      if (lane.active === 0 && lane.waiters.length === 0) this.lanes.delete(connectionKey);
      this.emit();
    };
  }
  executeAttempt(request, parentSignal, attempt) {
    if (parentSignal.aborted) {
      return Promise.reject(new ConnectionRequestError(`${request.label}\u5DF2\u53D6\u6D88`, "cancelled", { connectionKey: request.connectionKey }));
    }
    const attemptController = new AbortController();
    const forwardAbort = () => attemptController.abort(parentSignal.reason);
    parentSignal.addEventListener("abort", forwardAbort, { once: true });
    let timer;
    let onAttemptAbort;
    const timeoutPromise = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        const timeoutError = new ConnectionRequestError(`${request.label}\u8D85\u65F6`, "timeout", {
          connectionKey: request.connectionKey,
          attempts: attempt
        });
        attemptController.abort(timeoutError);
        reject(timeoutError);
      }, Math.max(1, request.timeoutMs));
    });
    const abortPromise = new Promise((_resolve, reject) => {
      onAttemptAbort = () => {
        if (parentSignal.aborted) {
          reject(new ConnectionRequestError(`${request.label}\u5DF2\u53D6\u6D88`, "cancelled", {
            connectionKey: request.connectionKey,
            attempts: attempt,
            cause: parentSignal.reason
          }));
        }
      };
      attemptController.signal.addEventListener("abort", onAttemptAbort, { once: true });
    });
    const operation = Promise.resolve().then(() => request.execute(attemptController.signal, attempt));
    return Promise.race([operation, timeoutPromise, abortPromise]).finally(() => {
      if (timer) clearTimeout(timer);
      parentSignal.removeEventListener("abort", forwardAbort);
      if (onAttemptAbort) attemptController.signal.removeEventListener("abort", onAttemptAbort);
    });
  }
  assertCircuitAvailable(connectionKey, policy) {
    const circuit = this.circuits.get(connectionKey);
    if (!circuit) return;
    const now = Date.now();
    if (circuit.openUntil > now) {
      throw new ConnectionRequestError(`\u8FDE\u63A5\u201C${connectionKey}\u201D\u6682\u65F6\u7194\u65AD`, "circuit_open", {
        connectionKey,
        retryAfterMs: circuit.openUntil - now
      });
    }
    if (circuit.openUntil > 0) {
      if (circuit.halfOpen) {
        throw new ConnectionRequestError(`\u8FDE\u63A5\u201C${connectionKey}\u201D\u6B63\u5728\u534A\u5F00\u63A2\u6D4B`, "circuit_open", { connectionKey });
      }
      circuit.halfOpen = true;
      circuit.openUntil = 0;
      this.emit();
    }
    if (circuit.failures >= policy.circuitFailureThreshold && circuit.openUntil === 0 && !circuit.halfOpen) {
      circuit.openUntil = now + policy.circuitOpenMs;
      this.emit();
      throw new ConnectionRequestError(`\u8FDE\u63A5\u201C${connectionKey}\u201D\u6682\u65F6\u7194\u65AD`, "circuit_open", {
        connectionKey,
        retryAfterMs: policy.circuitOpenMs
      });
    }
  }
  recordSuccess(connectionKey) {
    if (this.circuits.delete(connectionKey)) this.emit();
  }
  recordFailure(connectionKey, error, policy) {
    const tracked = countsTowardCircuit(error);
    const existing = this.circuits.get(connectionKey);
    if (!tracked && !existing) return;
    const circuit = existing ?? { failures: 0, openUntil: 0, halfOpen: false };
    circuit.halfOpen = false;
    if (tracked) circuit.failures += 1;
    if (circuit.failures >= policy.circuitFailureThreshold) circuit.openUntil = Date.now() + policy.circuitOpenMs;
    this.circuits.set(connectionKey, circuit);
    this.emit();
  }
  retryDelay(error, attempt, policy) {
    if (typeof error.retryAfterMs === "number" && error.retryAfterMs >= 0) return Math.min(policy.maxBackoffMs, error.retryAfterMs);
    const base = Math.min(policy.maxBackoffMs, policy.baseBackoffMs * 2 ** Math.max(0, attempt - 1));
    const jitter = base * policy.jitterRatio * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(base + jitter));
  }
  wait(ms, signal, label) {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new ConnectionRequestError(`${label}\u91CD\u8BD5\u7B49\u5F85\u5DF2\u53D6\u6D88`, "cancelled", { cause: signal.reason }));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  emit() {
    if (!this.listeners.size) return;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
      }
    }
  }
};
var connectionBroker = new ConnectionBroker();

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

// src/llm/api-profiles.ts
var SECRET_PREFIX = "ma11:independent-api-key:";
var ApiRequestError = class extends ConnectionRequestError {
  constructor(message, kind, options = {}) {
    super(message, kind, options);
    this.name = "ApiRequestError";
  }
};
function makeId2() {
  try {
    const value = getContext().uuidv4?.();
    if (value) return String(value);
  } catch {
  }
  return `ma-api-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function apiKeyStorageKey(profileId) {
  return `${SECRET_PREFIX}${profileId}`;
}
function getSessionApiKey(profileId) {
  try {
    return sessionStorage.getItem(apiKeyStorageKey(profileId)) || "";
  } catch {
    return "";
  }
}
function setSessionApiKey(profileId, apiKey) {
  try {
    if (apiKey) sessionStorage.setItem(apiKeyStorageKey(profileId), apiKey);
    else sessionStorage.removeItem(apiKeyStorageKey(profileId));
  } catch {
    throw new ApiRequestError("\u6D4F\u89C8\u5668\u62D2\u7EDD\u4FDD\u5B58\u672C\u6B21\u4F1A\u8BDD\u5BC6\u94A5", "configuration");
  }
}
function clearSessionApiKey(profileId) {
  try {
    sessionStorage.removeItem(apiKeyStorageKey(profileId));
  } catch {
  }
}
function listIndependentApiProfiles() {
  return getSettings().independentApiProfiles;
}
function getIndependentApiProfile(profileId) {
  return listIndependentApiProfiles().find((profile) => profile.id === profileId) ?? null;
}
function createIndependentApiProfile() {
  const profile = {
    id: makeId2(),
    name: `\u955C\u6E0AAPI ${listIndependentApiProfiles().length + 1}`,
    provider: "openai-compatible",
    apiUrl: "",
    model: "",
    maxTokens: 4096,
    temperature: 0.1,
    topP: 1,
    cachedModels: []
  };
  getSettings().independentApiProfiles.push(profile);
  saveSettings();
  return profile;
}
function updateIndependentApiProfile(profileId, patch) {
  const profile = getIndependentApiProfile(profileId);
  if (!profile) throw new ApiRequestError("\u72EC\u7ACBAPI\u914D\u7F6E\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u5220\u9664", "configuration");
  Object.assign(profile, patch, { id: profile.id, provider: "openai-compatible" });
  profile.name = safeText(profile.name, 120).trim() || "\u672A\u547D\u540DAPI";
  profile.apiUrl = safeText(profile.apiUrl, 2e3).trim();
  profile.model = safeText(profile.model, 240).trim();
  profile.maxTokens = Math.min(131072, Math.max(64, Number(profile.maxTokens) || 4096));
  profile.temperature = Math.min(2, Math.max(0, Number(profile.temperature) || 0));
  profile.topP = Math.min(1, Math.max(0, Number(profile.topP) || 1));
  profile.cachedModels = Array.isArray(profile.cachedModels) ? profile.cachedModels.map((item2) => safeText(item2, 240).trim()).filter(Boolean).slice(0, 2e3) : [];
  saveSettings();
  return profile;
}
function deleteIndependentApiProfile(profileId) {
  const settings = getSettings();
  settings.independentApiProfiles = settings.independentApiProfiles.filter((profile) => profile.id !== profileId);
  for (const connection of Object.values(settings.connections)) {
    if (connection.independentProfileId === profileId) {
      connection.independentProfileId = "";
      connection.mode = "current";
    }
  }
  clearSessionApiKey(profileId);
  saveSettings();
}
function classifyHttp(status) {
  if (status === 401 || status === 403) return "authentication";
  if (status === 404) return "not_found";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limit";
  return "upstream";
}
function responseText(data) {
  if (typeof data === "string") return data.trim();
  const candidates = [
    data?.choices?.[0]?.message?.content,
    data?.choices?.[0]?.text,
    data?.message?.content,
    data?.content,
    data?.text,
    data?.output,
    data?.result
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}
function requestHeaders() {
  const headers = getContext().getRequestHeaders?.();
  return headers && typeof headers === "object" ? { ...headers, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}
function validateProfile(profile, requireModel = true) {
  if (!profile.apiUrl) throw new ApiRequestError(`\u72EC\u7ACBAPI\u201C${profile.name}\u201D\u672A\u586B\u5199API\u5730\u5740`, "configuration");
  if (requireModel && !profile.model) throw new ApiRequestError(`\u72EC\u7ACBAPI\u201C${profile.name}\u201D\u672A\u586B\u5199\u6A21\u578B`, "configuration");
  const key = getSessionApiKey(profile.id);
  if (!key) throw new ApiRequestError(`\u72EC\u7ACBAPI\u201C${profile.name}\u201D\u672A\u586B\u5199\u672C\u6B21\u4F1A\u8BDD\u5BC6\u94A5`, "configuration");
  return key;
}
async function requestIndependentApi(profileId, options) {
  const profile = getIndependentApiProfile(profileId);
  if (!profile) throw new ApiRequestError("\u9009\u62E9\u7684\u72EC\u7ACBAPI\u914D\u7F6E\u4E0D\u5B58\u5728", "configuration");
  const apiKey = validateProfile(profile);
  const body = {
    chat_completion_source: "openai",
    messages: options.messages,
    model: profile.model,
    reverse_proxy: profile.apiUrl,
    proxy_password: apiKey,
    stream: false,
    max_tokens: Math.max(64, Number(options.maxTokens) || profile.maxTokens || 4096),
    temperature: Number.isFinite(options.temperature) ? options.temperature : profile.temperature,
    top_p: Number.isFinite(options.topP) ? options.topP : profile.topP,
    custom_prompt_post_processing: "strict",
    enable_web_search: false,
    include_reasoning: false,
    request_images: false
  };
  try {
    const response = await fetch("/api/backends/chat-completions/generate", {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify(body),
      signal: options.signal
    });
    const rawText = await response.text();
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const retryAfterMs = retryAfter ? /^\d+(?:\.\d+)?$/.test(retryAfter.trim()) ? Math.max(0, Math.round(Number(retryAfter) * 1e3)) : Math.max(0, Date.parse(retryAfter) - Date.now()) : void 0;
      throw new ApiRequestError(
        `\u72EC\u7ACBAPI\u201C${profile.name}\u201D\u8BF7\u6C42\u5931\u8D25\uFF1AHTTP ${response.status}`,
        classifyHttp(response.status),
        {
          status: response.status,
          responsePreview: rawText.replace(/\s+/g, " ").slice(0, 500),
          retryAfterMs
        }
      );
    }
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (error) {
      throw new ApiRequestError(`\u72EC\u7ACBAPI\u201C${profile.name}\u201D\u8FD4\u56DE\u4E86\u975EJSON\u7684\u4EE3\u7406\u54CD\u5E94`, "response_format", {
        status: response.status,
        responsePreview: rawText.replace(/\s+/g, " ").slice(0, 500),
        cause: error
      });
    }
    const content = responseText(data);
    if (!content) {
      throw new ApiRequestError(`\u72EC\u7ACBAPI\u201C${profile.name}\u201D\u8FD4\u56DE\u4E3A\u7A7A`, "empty_response", {
        status: response.status,
        responsePreview: safeText(data, 500)
      });
    }
    return content;
  } catch (error) {
    if (error instanceof ApiRequestError || error instanceof ConnectionRequestError) throw error;
    if (options.signal?.aborted) {
      throw new ApiRequestError(`\u72EC\u7ACBAPI\u201C${profile.name}\u201D\u8BF7\u6C42\u5DF2\u53D6\u6D88`, "cancelled", { cause: error });
    }
    const message = toErrorMessage(error);
    if (/超时|timeout/i.test(message)) throw new ApiRequestError(message, "timeout", { cause: error });
    throw new ApiRequestError(`\u72EC\u7ACBAPI\u201C${profile.name}\u201D\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF1A${message}`, "network", { cause: error });
  }
}
async function fetchIndependentModels(profileId, timeoutMs) {
  const profile = getIndependentApiProfile(profileId);
  if (!profile) throw new ApiRequestError("\u72EC\u7ACBAPI\u914D\u7F6E\u4E0D\u5B58\u5728", "configuration");
  const apiKey = validateProfile(profile, false);
  const controller = new AbortController();
  const response = await withTimeout(
    fetch("/api/backends/chat-completions/status", {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({
        reverse_proxy: profile.apiUrl,
        proxy_password: apiKey,
        chat_completion_source: "openai"
      }),
      signal: controller.signal
    }),
    timeoutMs,
    `\u72EC\u7ACBAPI\u201C${profile.name}\u201D\u6A21\u578B\u5217\u8868`,
    controller
  );
  const rawText = await response.text();
  if (!response.ok) {
    throw new ApiRequestError(`\u8BFB\u53D6\u6A21\u578B\u5217\u8868\u5931\u8D25\uFF1AHTTP ${response.status}`, classifyHttp(response.status), {
      status: response.status,
      responsePreview: rawText.replace(/\s+/g, " ").slice(0, 500)
    });
  }
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (error) {
    throw new ApiRequestError("\u6A21\u578B\u5217\u8868\u63A5\u53E3\u8FD4\u56DE\u4E86\u975EJSON\u5185\u5BB9", "response_format", {
      responsePreview: rawText.replace(/\s+/g, " ").slice(0, 500),
      cause: error
    });
  }
  const source = Array.isArray(data) ? data : data?.data ?? data?.models ?? [];
  if (!Array.isArray(source)) {
    throw new ApiRequestError("API\u672A\u8FD4\u56DE\u53EF\u8BC6\u522B\u7684\u6A21\u578B\u5217\u8868", "response_format", { responsePreview: safeText(data, 500) });
  }
  const models = source.map((item2) => safeText(item2?.id ?? item2?.name ?? item2?.model ?? item2, 240).replace(/^models\//, "").trim()).filter(Boolean).filter((value, index, list2) => list2.indexOf(value) === index).sort((a, b) => a.localeCompare(b));
  updateIndependentApiProfile(profile.id, { cachedModels: models });
  return models;
}

// src/llm/generator.ts
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
async function generateCurrent(options, signal) {
  const context = getContext();
  if (typeof context.generateRaw !== "function") {
    throw new ConnectionRequestError("\u5F53\u524DSillyTavern\u672A\u63D0\u4F9BgenerateRaw", "configuration");
  }
  try {
    const result = await withInternalGeneration(() => Promise.resolve(context.generateRaw({
      systemPrompt: options.systemPrompt,
      prompt: options.prompt,
      jsonSchema: options.jsonSchema,
      signal
    })));
    const text = generationText(result);
    if (!text) throw new ConnectionRequestError(`${options.task}\u6A21\u578B\u8FD4\u56DE\u4E3A\u7A7A`, "empty_response");
    return text;
  } catch (error) {
    if (signal.aborted) throw new ConnectionRequestError(`${options.task}\u6A21\u578B\u8C03\u7528\u5DF2\u53D6\u6D88`, "cancelled", { cause: error });
    throw normalizeConnectionError(error);
  }
}
async function generateWithNativeProfile(options, profileId, signal) {
  const context = getContext();
  const service = context.ConnectionManagerRequestService;
  if (typeof service?.sendRequest !== "function") {
    throw new ConnectionRequestError("\u5F53\u524DSillyTavern\u672A\u63D0\u4F9BConnectionManagerRequestService", "configuration");
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
    if (!text) throw new ConnectionRequestError(`${options.task} Connection Profile\u8FD4\u56DE\u4E3A\u7A7A`, "empty_response");
    return text;
  } catch (error) {
    if (signal.aborted) throw new ConnectionRequestError(`${options.task} Connection Profile\u8BF7\u6C42\u5DF2\u53D6\u6D88`, "cancelled", { cause: error });
    throw normalizeConnectionError(error);
  }
}
async function generateWithIndependentProfile(options, profileId, signal) {
  return withInternalGeneration(() => requestIndependentApi(profileId, {
    messages: messagesFromOptions(options),
    timeoutMs: Math.max(1e4, Number(getSettings().requestTimeoutMs) || 9e4),
    signal
  }));
}
function listSupportedConnectionProfiles() {
  return supportedProfiles().map((profile) => ({
    id: safeText(profile?.id, 160),
    name: cleanProfileName(profile?.name) || "\u672A\u547D\u540D\u914D\u7F6E",
    api: safeText(profile?.api, 80),
    model: safeText(profile?.model, 240)
  })).filter((profile) => profile.id);
}
function describeTaskConnection(task) {
  const connection = getSettings().connections[task];
  if (connection?.mode === "profile") {
    const id = resolveProfileId(connection);
    const profile = listSupportedConnectionProfiles().find((item2) => item2.id === id);
    return `Connection Profile\uFF1A${profile?.name || cleanProfileName(connection.profile) || "\u672A\u9009\u62E9"}`;
  }
  if (connection?.mode === "independent") {
    const profile = getIndependentApiProfile(connection.independentProfileId);
    return `\u955C\u6E0A\u72EC\u7ACBAPI\uFF1A${profile?.name || "\u672A\u9009\u62E9"}`;
  }
  return "\u5F53\u524D\u804A\u5929\u8FDE\u63A5";
}
function taskAdapter(options) {
  const connection = getSettings().connections[options.task];
  if (connection?.mode === "profile") {
    const profileId = resolveProfileId(connection);
    if (!profileId) throw new ApiRequestError(`${options.task}\u672A\u9009\u62E9\u6709\u6548\u7684Connection Profile`, "configuration");
    return {
      connectionKey: `profile:${profileId}`,
      execute: (signal) => generateWithNativeProfile(options, profileId, signal)
    };
  }
  if (connection?.mode === "independent") {
    if (!connection.independentProfileId) throw new ApiRequestError(`${options.task}\u672A\u9009\u62E9\u955C\u6E0A\u72EC\u7ACBAPI`, "configuration");
    return {
      connectionKey: `independent:${connection.independentProfileId}`,
      execute: (signal) => generateWithIndependentProfile(options, connection.independentProfileId, signal)
    };
  }
  return {
    connectionKey: "current",
    execute: (signal) => generateCurrent(options, signal)
  };
}
async function generateTask(options) {
  const adapter = taskAdapter(options);
  const scope = chatScopeManager.current();
  const timeoutMs = Math.max(1e4, Number(getSettings().requestTimeoutMs) || 9e4);
  return connectionBroker.request({
    id: options.requestId,
    connectionKey: adapter.connectionKey,
    scopeKey: scope.chatKey,
    label: `${options.task}\u6A21\u578B\u8BF7\u6C42`,
    timeoutMs,
    signal: options.signal,
    execute: (signal) => adapter.execute(signal)
  });
}
async function testConnection(task) {
  const started = performance.now();
  let raw = "";
  try {
    raw = await generateTask({
      task,
      systemPrompt: "\u4F60\u662FAPI\u7ED3\u6784\u6D4B\u8BD5\u5668\u3002\u7981\u6B62\u89E3\u91CA\u3001\u7981\u6B62Markdown\u3001\u7981\u6B62\u601D\u8003\u6807\u7B7E\u3002",
      prompt: '\u53EA\u8F93\u51FA\u8FD9\u4E2AJSON\u5BF9\u8C61\uFF1A{"ok":true,"source":"mirror-abyss"}',
      jsonSchema: {
        type: "object",
        required: ["ok", "source"],
        properties: {
          ok: { type: "boolean" },
          source: { type: "string" }
        }
      }
    });
  } catch (error) {
    if (error instanceof ConnectionRequestError) {
      throw new Error(`${describeTaskConnection(task)}\u8FDE\u63A5\u5931\u8D25 [${error.kind}]\uFF1A${error.message}${error.responsePreview ? `\uFF1B\u4E0A\u6E38\u7247\u6BB5\uFF1A${error.responsePreview}` : ""}`);
    }
    throw new Error(`${describeTaskConnection(task)}\u8FDE\u63A5\u5931\u8D25\uFF1A${toErrorMessage(error)}`);
  }
  let jsonValid = false;
  let instructionFollowed = false;
  try {
    const parsed = parseJsonObject(raw);
    jsonValid = true;
    instructionFollowed = parsed.ok === true && parsed.source === "mirror-abyss";
  } catch {
  }
  return {
    connected: Boolean(raw.trim()),
    instructionFollowed,
    jsonValid,
    method: describeTaskConnection(task),
    elapsedMs: Math.round(performance.now() - started),
    responsePreview: raw.replace(/\s+/g, " ").slice(0, 240)
  };
}

// src/llm/structured.ts
function repairSystemPrompt(structureDescription) {
  return `\u4F60\u662FJSON\u683C\u5F0F\u4FEE\u590D\u5668\u3002\u4F60\u4E0D\u6267\u884C\u539F\u4EFB\u52A1\u3001\u4E0D\u8865\u5145\u65B0\u4E8B\u5B9E\u3001\u4E0D\u89E3\u91CA\u5185\u5BB9\uFF0C\u53EA\u628A\u7ED9\u5B9A\u6A21\u578B\u8F93\u51FA\u8F6C\u6362\u6210\u4E00\u4E2A\u5408\u6CD5JSON\u5BF9\u8C61\u3002

\u8981\u6C42\uFF1A
1. \u4FDD\u7559\u539F\u8F93\u51FA\u4E2D\u5DF2\u7ECF\u8868\u8FBE\u7684\u8BED\u4E49\uFF0C\u4E0D\u81EA\u884C\u91CD\u505A\u5BA1\u6838\u3001\u603B\u7ED3\u6216\u72B6\u6001\u63D0\u53D6\u3002
2. \u5220\u9664Markdown\u4EE3\u7801\u56F4\u680F\u3001\u89E3\u91CA\u3001\u524D\u8A00\u3001\u7ED3\u8BED\u548C\u601D\u8003\u6807\u7B7E\u3002
3. \u4FEE\u590D\u7F3A\u5931\u5F15\u53F7\u3001\u5C3E\u968F\u9017\u53F7\u3001\u5168\u89D2\u6807\u70B9\u7B49\u683C\u5F0F\u95EE\u9898\u3002
4. \u8F93\u51FA\u5FC5\u987B\u80FD\u88ABJSON.parse\u76F4\u63A5\u89E3\u6790\uFF0C\u6839\u8282\u70B9\u5FC5\u987B\u662F\u5BF9\u8C61\u3002
5. \u53EA\u8F93\u51FAJSON\u5BF9\u8C61\uFF0C\u7981\u6B62\u8F93\u51FA\u4EFB\u4F55\u989D\u5916\u6587\u5B57\u3002

\u3010\u76EE\u6807\u7ED3\u6784\u3011
${structureDescription}`;
}
function repairUserPrompt(raw) {
  return `\u3010\u9700\u8981\u4FEE\u590D\u7684\u539F\u59CB\u8F93\u51FA\u3011
${safeText(raw, 8e4)}`;
}
var TASK_LABELS = {
  audit: "\u89C4\u5219\u5BA1\u6838",
  revision: "\u5B9A\u5411\u4FEE\u6B63",
  state: "\u72B6\u6001\u8868",
  smallSummary: "\u5C0F\u603B\u7ED3",
  largeSummary: "\u5927\u603B\u7ED3"
};
function structuredError(task, error, raw) {
  const connection = describeTaskConnection(task);
  const preview = error instanceof JsonObjectParseError ? error.preview : jsonPreview(raw);
  const detail = toErrorMessage(error);
  return new Error(`${TASK_LABELS[task]}\u672A\u8FD4\u56DE\u6709\u6548JSON\u7ED3\u6784\uFF08${connection}\uFF09\u3002${detail}${preview ? `\uFF1B\u8FD4\u56DE\u7247\u6BB5\uFF1A${preview}` : ""}`);
}
async function repairStructuredOutput(task, raw, structureDescription, jsonSchema, signal) {
  const repaired = await generateTask({
    task,
    systemPrompt: repairSystemPrompt(structureDescription),
    prompt: repairUserPrompt(raw),
    jsonSchema,
    signal
  });
  return parseJsonObject(repaired);
}
async function generateStructuredTask(options) {
  const raw = await generateTask(options);
  try {
    return parseJsonObject(raw);
  } catch (firstError) {
    const allowRepair = options.allowRepair ?? getSettings().repairInvalidJsonOnce;
    if (!allowRepair) throw structuredError(options.task, firstError, raw);
    try {
      return await repairStructuredOutput(options.task, raw, options.structureDescription, options.jsonSchema, options.signal);
    } catch (repairError) {
      throw structuredError(options.task, repairError, raw);
    }
  }
}

// src/prompts/audit.ts
function auditSystemPrompt() {
  return `\u4F60\u662F\u201C\u955C\u6E0A\u201D\u89C4\u5219\u5BA1\u6838\u5668\u3002\u4F60\u53EA\u68C0\u67E5\u7ED9\u5B9AAI\u6B63\u6587\u662F\u5426\u8FDD\u53CD\u73A9\u5BB6\u63D0\u4F9B\u7684\u786C\u6027\u89C4\u5219\uFF0C\u4E0D\u7EED\u5199\uFF0C\u4E0D\u6DA6\u8272\uFF0C\u4E0D\u66FF\u6B63\u6587\u8FA9\u62A4\u3002

\u5FC5\u987B\u53EA\u8F93\u51FA\u4E00\u4E2AJSON\u5BF9\u8C61\uFF0C\u7ED3\u6784\u5982\u4E0B\uFF1A
{
  "result": "pass | revise | block",
  "reason": "\u4E00\u53E5\u8BDD\u7ED3\u8BBA",
  "violations": [
    {
      "ruleId": "\u7A33\u5B9A\u3001\u7B80\u77ED\u7684\u89C4\u5219\u7F16\u53F7",
      "rule": "\u88AB\u8FDD\u53CD\u7684\u89C4\u5219",
      "evidence": "\u6B63\u6587\u4E2D\u7684\u5177\u4F53\u8FDD\u89C4\u7247\u6BB5\u6216\u51C6\u786E\u6982\u8FF0",
      "action": "\u5E94\u5982\u4F55\u4FEE\u6539\uFF0C\u5FC5\u987B\u5177\u4F53\u53EF\u6267\u884C"
    }
  ],
  "preserve": ["\u4FEE\u6B63\u65F6\u5FC5\u987B\u4FDD\u7559\u7684\u5916\u90E8\u4E8B\u5B9E"],
  "rewriteInstruction": "\u7ED9\u4FEE\u6B63\u6587\u6A21\u578B\u7684\u4E00\u6BB5\u5B8C\u6574\u6307\u4EE4"
}

\u5224\u5B9A\u6807\u51C6\uFF1A
- pass\uFF1A\u6CA1\u6709\u660E\u786E\u8FDD\u89C4\u3002
- revise\uFF1A\u53EF\u4EE5\u5728\u4E0D\u6539\u53D8\u5DF2\u7ECF\u6210\u7ACB\u7684\u5916\u90E8\u4E8B\u4EF6\u3001NPC\u884C\u4E3A\u548C\u4E8B\u4EF6\u987A\u5E8F\u7684\u524D\u63D0\u4E0B\u5B9A\u5411\u4FEE\u6B63\u3002
- block\uFF1A\u6574\u6BB5\u5185\u5BB9\u5EFA\u7ACB\u5728\u8FDD\u89C4\u524D\u63D0\u4E0A\uFF0C\u65E0\u6CD5\u5C40\u90E8\u4FEE\u6B63\u800C\u4E0D\u91CD\u6784\u5267\u60C5\u3002

\u89C4\u5219\uFF1A
1. \u53EA\u5217\u51FA\u6709\u660E\u786E\u8BC1\u636E\u7684\u8FDD\u89C4\u3002
2. evidence\u5FC5\u987B\u8DB3\u4EE5\u8BA9\u4FEE\u6B63\u6587\u6A21\u578B\u5B9A\u4F4D\u95EE\u9898\u3002
3. action\u5FC5\u987B\u8BF4\u660E\u201C\u5220\u4EC0\u4E48\u3001\u4FDD\u7559\u4EC0\u4E48\u3001\u7528\u4EC0\u4E48\u53EF\u89C2\u5BDF\u4E8B\u5B9E\u66FF\u4EE3\u201D\uFF0C\u4E0D\u80FD\u53EA\u5199\u201C\u4E0D\u8981\u8FDD\u89C4\u201D\u3002
4. preserve\u53EA\u5199\u5DF2\u7ECF\u6210\u7ACB\u4E14\u4E0D\u80FD\u88AB\u4FEE\u6B63\u6A21\u578B\u6539\u52A8\u7684\u5916\u90E8\u4E8B\u5B9E\u3002
5. pass\u65F6violations\u5FC5\u987B\u4E3A\u7A7A\uFF0CrewriteInstruction\u53EF\u4E3A\u7A7A\u3002
6. \u4E0D\u8F93\u51FAMarkdown\u4EE3\u7801\u5757\uFF0C\u4E0D\u8F93\u51FAJSON\u4EE5\u5916\u7684\u6587\u5B57\u3002`;
}
function auditUserPrompt(rulePrompt, playerText, assistantText) {
  return `\u3010\u73A9\u5BB6\u5BA1\u6838\u89C4\u5219\u3011
${rulePrompt}

\u3010\u73A9\u5BB6\u672C\u8F6E\u8F93\u5165\u3011
${playerText || "\uFF08\u7A7A\uFF09"}

\u3010\u5F85\u5BA1\u6838AI\u6B63\u6587\u3011
${assistantText}`;
}
function auditJsonSchema() {
  return {
    name: "MirrorAbyssAuditResult",
    description: "\u955C\u6E0A\u89C4\u5219\u5BA1\u6838\u7ED3\u679C",
    strict: true,
    value: {
      $schema: "http://json-schema.org/draft-04/schema#",
      type: "object",
      properties: {
        result: { type: "string", enum: ["pass", "revise", "block"] },
        reason: { type: "string" },
        violations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ruleId: { type: "string" },
              rule: { type: "string" },
              evidence: { type: "string" },
              action: { type: "string" }
            },
            required: ["ruleId", "rule", "evidence", "action"],
            additionalProperties: false
          }
        },
        preserve: { type: "array", items: { type: "string" } },
        rewriteInstruction: { type: "string" }
      },
      required: ["result", "reason", "violations", "preserve", "rewriteInstruction"],
      additionalProperties: false
    }
  };
}

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
  const text = safeText(raw, 1e5).trim();
  try {
    const data = parseJsonObject(text);
    const decision = ["pass", "revise", "block"].includes(String(data.result)) ? String(data.result) : "revise";
    const violations = violationList(data.violations);
    const passed = decision === "pass";
    return {
      passed,
      decision,
      reason: safeText(data.reason, 3e3).trim() || (passed ? "\u901A\u8FC7" : "\u8FDD\u53CD\u89C4\u5219"),
      violations: passed ? [] : violations,
      preserve: list(data.preserve),
      rewriteInstruction: safeText(data.rewriteInstruction, 6e3).trim(),
      violationFingerprint: passed ? "" : resultFingerprint(violations)
    };
  } catch {
    const lines = text.replace(/\r/g, "").split("\n");
    const first = (lines[0] || "").trim().toUpperCase();
    const reason = lines.slice(1).join("\n").trim();
    if (first === "MA_OK") {
      return {
        passed: true,
        decision: "pass",
        reason: reason || "\u901A\u8FC7",
        violations: [],
        preserve: [],
        rewriteInstruction: "",
        violationFingerprint: ""
      };
    }
    if (first === "MA_FAIL") {
      const violations = [{
        ruleId: "legacy_failure",
        rule: "\u5BA1\u6838\u6A21\u578B\u5224\u5B9A\u8FDD\u53CD\u73A9\u5BB6\u89C4\u5219",
        evidence: reason || "\u672A\u7ED9\u51FA\u5177\u4F53\u8BC1\u636E",
        action: reason || "\u4F9D\u636E\u73A9\u5BB6\u89C4\u5219\u5B9A\u5411\u4FEE\u6B63\u8FDD\u89C4\u5185\u5BB9"
      }];
      return {
        passed: false,
        decision: "revise",
        reason: reason || "\u8FDD\u53CD\u89C4\u5219",
        violations,
        preserve: [],
        rewriteInstruction: reason || "\u53EA\u4FEE\u6B63\u8FDD\u89C4\u5185\u5BB9\uFF0C\u4E0D\u6539\u53D8\u5DF2\u6210\u7ACB\u7684\u5916\u90E8\u4E8B\u5B9E\u3002",
        violationFingerprint: resultFingerprint(violations)
      };
    }
    throw new Error("\u89C4\u5219\u5BA1\u6838\u6A21\u578B\u672A\u8FD4\u56DE\u6709\u6548JSON\u3001MA_OK\u6216MA_FAIL");
  }
}
function findMessageElement(index) {
  return document.querySelector(`.mes[mesid="${index}"], .mes[data-message-id="${index}"], #chat .mes:nth-of-type(${index + 1})`);
}
function applyAuditVisibility(index, hidden) {
  const element = findMessageElement(index);
  element?.classList.toggle("ma11-audit-hidden-message", hidden);
}
async function auditText(playerRules, playerText, assistantText, signal) {
  const request = {
    task: "audit",
    systemPrompt: auditSystemPrompt(),
    prompt: auditUserPrompt(playerRules, playerText, assistantText)
  };
  const raw = await generateTask({ ...request, jsonSchema: auditJsonSchema(), signal });
  try {
    return parseAuditResult(raw);
  } catch (firstError) {
    if (!getSettings().repairInvalidJsonOnce) {
      throw new Error(`\u89C4\u5219\u5BA1\u6838\u672A\u8FD4\u56DE\u6709\u6548\u7ED3\u6784\uFF08${describeTaskConnection("audit")}\uFF09\u3002${toErrorMessage(firstError)}\uFF1B\u8FD4\u56DE\u7247\u6BB5\uFF1A${jsonPreview(raw)}`);
    }
    try {
      const repaired = await repairStructuredOutput(
        "audit",
        raw,
        '{"result":"pass|revise|block","reason":"...","violations":[{"ruleId":"...","rule":"...","evidence":"...","action":"..."}],"preserve":["..."],"rewriteInstruction":"..."}',
        auditJsonSchema(),
        signal
      );
      return parseAuditResult(JSON.stringify(repaired));
    } catch (repairError) {
      throw new Error(`\u89C4\u5219\u5BA1\u6838\u672A\u8FD4\u56DE\u6709\u6548\u7ED3\u6784\uFF08${describeTaskConnection("audit")}\uFF09\u3002${toErrorMessage(repairError)}\uFF1B\u539F\u59CB\u8FD4\u56DE\u7247\u6BB5\uFF1A${jsonPreview(raw)}`);
    }
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
async function runAudit(artifact, force = false, signal) {
  const settings = getSettings();
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
    await putArtifact(artifact);
    return artifact.audit;
  }
  if (!settings.auditPrompt.trim()) throw new Error("\u5DF2\u542F\u7528\u89C4\u5219\u5BA1\u6838\uFF0C\u4F46\u5BA1\u6838\u63D0\u793A\u8BCD\u4E3A\u7A7A");
  if (!force && artifact.stages.audit.status === "success" && artifact.audit?.passed && artifact.approvedFingerprint === artifact.sourceFingerprint) {
    return artifact.audit;
  }
  markStage(artifact, "audit", "running");
  await putArtifact(artifact);
  try {
    const result = await auditText(settings.auditPrompt, artifact.playerText, artifact.assistantText, signal);
    artifact.audit = result;
    if (result.passed) {
      artifact.approvedFingerprint = artifact.sourceFingerprint;
      artifact.hiddenByAudit = false;
      artifact.quarantined = false;
      applyAuditVisibility(artifact.messageIndex, false);
      markStage(artifact, "audit", "success");
      markStage(artifact, "revision", "skipped");
    } else {
      markStage(artifact, "audit", "blocked", result.reason);
    }
    const message = getMessage(artifact.messageIndex);
    if (message && messageFingerprint(artifact.messageIndex) === artifact.sourceFingerprint) {
      attachArtifactToMessage(message, artifact);
    }
    await putArtifact(artifact);
    return result;
  } catch (error) {
    markStage(artifact, "audit", "failed", toErrorMessage(error));
    await putArtifact(artifact);
    throw error;
  }
}

// src/prompts/revision.ts
function revisionSystemPrompt(customPrompt = "") {
  return `\u4F60\u662F\u201C\u955C\u6E0A\u201D\u6B63\u6587\u5B9A\u5411\u4FEE\u6B63\u5668\u3002\u4F60\u7684\u4EFB\u52A1\u662F\u4FEE\u6B63\u5DF2\u6709\u6B63\u6587\uFF0C\u4E0D\u662F\u91CD\u65B0\u521B\u4F5C\u3002

\u786C\u6027\u8981\u6C42\uFF1A
1. \u53EA\u4FEE\u6539\u5BA1\u6838\u6307\u51FA\u7684\u8FDD\u89C4\u90E8\u5206\u3002
2. \u4FDD\u7559\u539F\u6709\u65F6\u95F4\u3001\u5730\u70B9\u3001\u4E8B\u4EF6\u987A\u5E8F\u3001NPC\u5DF2\u7ECF\u53D1\u751F\u7684\u52A8\u4F5C\u4E0E\u5BF9\u767D\u3001\u7269\u54C1\u72B6\u6001\u548C\u5DF2\u7ECF\u6210\u7ACB\u7684\u5916\u90E8\u7ED3\u679C\u3002
3. \u4E0D\u589E\u52A0\u65B0\u4EBA\u7269\u3001\u65B0\u4E8B\u4EF6\u3001\u65B0\u7EBF\u7D22\u3001\u65B0\u5BF9\u767D\u3001\u65B0\u884C\u52A8\u6216\u65B0\u7ED3\u679C\u3002
4. \u4E0D\u66FF\u73A9\u5BB6\u7126\u70B9\u8865\u5145\u672A\u58F0\u660E\u7684\u5FC3\u7406\u3001\u5224\u65AD\u3001\u51B3\u5B9A\u3001\u76EE\u6807\u3001\u6CE8\u610F\u529B\u6216\u884C\u52A8\u7406\u7531\u3002
5. \u82E5\u5220\u9664\u8FDD\u89C4\u53E5\u4F1A\u9020\u6210\u8BED\u6CD5\u65AD\u88C2\uFF0C\u53EF\u7528\u6700\u5C0F\u91CF\u7684\u5916\u90E8\u53EF\u89C2\u5BDF\u4E8B\u5B9E\u8FDE\u63A5\uFF0C\u4F46\u4E0D\u5F97\u6269\u5C55\u5267\u60C5\u3002
6. \u53EA\u8F93\u51FA\u4FEE\u6B63\u540E\u7684\u5B8C\u6574\u6B63\u6587\uFF0C\u4E0D\u8F93\u51FA\u6807\u9898\u3001\u8BF4\u660E\u3001\u5BA1\u6838\u62A5\u544A\u3001\u524D\u540E\u5BF9\u6BD4\u6216Markdown\u4EE3\u7801\u5757\u3002
${customPrompt.trim() ? `
\u3010\u73A9\u5BB6\u9644\u52A0\u4FEE\u6B63\u8981\u6C42\u3011
${customPrompt.trim()}` : ""}`;
}
function revisionUserPrompt(playerRules, playerText, sourceText, audit, attempt) {
  const violations = audit.violations.map((item2, index) => `${index + 1}. \u89C4\u5219\uFF1A${item2.rule}
   \u8BC1\u636E\uFF1A${item2.evidence}
   \u4FEE\u6539\uFF1A${item2.action}`).join("\n");
  const preserve = audit.preserve.length ? audit.preserve.map((item2) => `- ${item2}`).join("\n") : "- \u539F\u6B63\u6587\u4E2D\u5168\u90E8\u5DF2\u6210\u7ACB\u7684\u5916\u90E8\u4E8B\u5B9E";
  return `\u3010\u4FEE\u6B63\u8F6E\u6B21\u3011
\u7B2C${attempt}\u6B21

\u3010\u73A9\u5BB6\u786C\u6027\u89C4\u5219\u3011
${playerRules}

\u3010\u73A9\u5BB6\u672C\u8F6E\u8F93\u5165\u3011
${playerText || "\uFF08\u7A7A\uFF09"}

\u3010\u5FC5\u987B\u4FEE\u6B63\u7684\u95EE\u9898\u3011
${violations || audit.reason}

\u3010\u5FC5\u987B\u4FDD\u7559\u3011
${preserve}

\u3010\u5BA1\u6838\u5668\u7EFC\u5408\u4FEE\u6539\u6307\u4EE4\u3011
${audit.rewriteInstruction || audit.reason}

\u3010\u5F85\u4FEE\u6B63\u6587\u3011
${sourceText}

\u53EA\u8F93\u51FA\u4FEE\u6B63\u540E\u7684\u5B8C\u6574\u6B63\u6587\u3002`;
}

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
async function runRevisionFlow(artifact, signal) {
  const settings = getSettings();
  const firstAudit = artifact.audit;
  if (!firstAudit || firstAudit.passed) throw new Error("\u6CA1\u6709\u53EF\u4FEE\u6B63\u7684\u5BA1\u6838\u5931\u8D25\u7ED3\u679C");
  artifact.revision = initialRevisionRecord(artifact);
  if (firstAudit.decision === "block") {
    artifact.revision.status = "blocked";
    artifact.revision.stoppedReason = firstAudit.reason || "\u5BA1\u6838\u5224\u5B9A\u65E0\u6CD5\u5C40\u90E8\u4FEE\u6B63";
    markStage(artifact, "revision", "blocked", artifact.revision.stoppedReason);
    await putArtifact(artifact);
    return { approved: false, audit: firstAudit };
  }
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
        signal
      });
      const candidate = cleanRevisionText(raw);
      if (!candidate) throw new Error("\u4FEE\u6B63\u6587\u6A21\u578B\u8FD4\u56DE\u7A7A\u6B63\u6587");
      if (hashText(candidate) === hashText(sourceText)) throw new Error("\u4FEE\u6B63\u6587\u6A21\u578B\u672A\u6539\u53D8\u6B63\u6587");
      const candidateAudit = await auditText(settings.auditPrompt, artifact.playerText, candidate, signal);
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

// src/domain/lorebook-publish.ts
function rows(snapshot, key) {
  return snapshot[key] ?? [];
}
function uniq(values, limit = 32) {
  return [...new Set(values.map((item2) => String(item2 || "").trim()).filter((item2) => item2.length >= 2))].slice(0, limit);
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
  const blocks = sourceRows.map((row) => rowContent(tableLabel, row));
  return `[${title}]
${blocks.length ? blocks.join("\n\n") : "\u6682\u65E0\u53EF\u53D1\u5E03\u8BB0\u5F55\u3002"}`;
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
  const escaped = kind.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = row.title.match(new RegExp(`^(.*?)[\uFF5C|:\uFF1A\\s-]*${escaped}$`));
  if (match?.[1]?.trim()) {
    const owner = match[1].trim();
    return { comment: `MA\uFF5C${kind}\uFF5C${owner}`, name: owner, label: kind };
  }
  return kind === "\u7269\u54C1\u4E0E\u8D44\u6E90" ? { comment: `MA\uFF5C\u7269\u54C1\uFF5C${row.title}`, name: row.title, label: "\u7269\u54C1" } : { comment: `MA\uFF5C\u6280\u80FD\u4E0E\u80FD\u529B\uFF5C${row.title}`, name: row.title, label: "\u6280\u80FD\u4E0E\u80FD\u529B" };
}
function makeDocument(key, comment, content, keywords, constant, vectorized, order, kind) {
  return {
    key,
    comment: `[MA11] ${comment}`,
    content,
    keywords: uniq(keywords),
    constant,
    vectorized: constant ? false : vectorized,
    order,
    kind
  };
}
function unconsumedSmallSummaries(small, large) {
  const consumed = new Set(large.flatMap((item2) => item2.sourceKeys));
  return small.filter((item2) => !consumed.has(item2.id));
}
function currentSmallSummaryContent(summaries) {
  const blocks = summaries.map((item2) => {
    const notes = item2.sedimentation?.notes?.length ? `
\u6C89\u964D\u5904\u7406\uFF1A${item2.sedimentation.notes.join("\uFF1B")}` : "";
    return `\u3010${item2.title}\u3011
${item2.summary}${notes}`;
  });
  return `[\u5C0F\u603B\u7ED3\uFF1A\u5F53\u524D\u5468\u671F]
${blocks.join("\n\n")}`;
}
function buildSemanticLorebookDocuments(snapshot, smallSummaries, largeSummaries, options) {
  const documents = [];
  if (snapshot) {
    const foundationRows = rows(snapshot, "foundations");
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
    const globalRows = [
      ...rows(snapshot, "spacetime"),
      ...rows(snapshot, "events").filter(isGlobalRow),
      ...rows(snapshot, "regions").filter(isGlobalRow)
    ];
    documents.push(makeDocument(
      "semantic:global",
      "MA\uFF5C\u5168\u5C40\u6001\u52BF",
      groupedContent("\u5168\u5C40\u6001\u52BF", "\u5F53\u524D\u6001\u52BF", globalRows),
      ["\u5168\u5C40\u6001\u52BF", "\u5F53\u524D\u65F6\u95F4", "\u5F53\u524D\u5730\u70B9", ...globalRows.flatMap(titleKeywords)],
      options.latestContinuityConstant,
      false,
      165,
      "semantic:global"
    ));
    for (const row of rows(snapshot, "focus")) {
      documents.push(makeDocument(
        `semantic:focus:${row.id}`,
        `MA\uFF5C\u7126\u70B9\uFF5C${row.title}`,
        rowContent("\u7126\u70B9", row),
        titleKeywords(row),
        options.latestContinuityConstant,
        false,
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
        options.latestContinuityConstant && isCurrentCharacter(row),
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
      options.latestContinuityConstant,
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
        const constant = ["focus", "spacetime", "foundations"].includes(tableKey);
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
function buildLorebookDocuments(snapshot, smallSummaries, largeSummaries, options) {
  return options.layout === "detailed" ? buildDetailedLorebookDocuments(snapshot, smallSummaries, largeSummaries, options) : buildSemanticLorebookDocuments(snapshot, smallSummaries, largeSummaries, options);
}

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
    item("profileRequest", "Connection Profile \u9694\u79BB\u8BF7\u6C42", context?.ConnectionManagerRequestService?.sendRequest, false, "\u539F\u751F\u9694\u79BB\u8BF7\u6C42\u53EF\u7528", "\u53EA\u80FD\u4F7F\u7528\u5F53\u524D\u8FDE\u63A5\u6216\u72EC\u7ACB API"),
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

// src/foundation/cross-tab-coordinator.ts
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
var CONNECTION_BROKER = createServiceToken("ConnectionBroker");
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
      if (!this.services.tryGet(CONNECTION_BROKER)) this.services.register(CONNECTION_BROKER, connectionBroker);
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
    this.services.tryGet(CONNECTION_BROKER)?.cancelAll();
    this.services.tryGet(CROSS_TAB_COORDINATOR)?.stop();
    this.services.tryGet(EVENT_ROUTER)?.uninstall();
    this.services.clear();
    this.snapshot = { state: "stopped", stage: "stopped" };
  }
};
var foundationKernel = new FoundationKernel();

// src/foundation/task-errors.ts
var StaleTaskError = class extends Error {
  constructor(message = "\u4EFB\u52A1\u6240\u5C5E\u804A\u5929\u5DF2\u6539\u53D8\uFF0C\u65E7\u4EFB\u52A1\u5DF2\u505C\u6B62") {
    super(message);
    this.name = "StaleTaskError";
  }
};
var TaskCancelledError = class extends Error {
  constructor(message = "\u4EFB\u52A1\u5DF2\u53D6\u6D88") {
    super(message);
    this.name = "TaskCancelledError";
  }
};

// src/pipeline/task-queue.ts
var TaskQueue = class {
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
        } else if (error instanceof TaskCancelledError || error instanceof ConnectionRequestError && error.kind === "cancelled" || controller.signal.aborted) {
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
var taskQueue = new TaskQueue();

// src/integrations/sillytavern-worldinfo.ts
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
function requestHeaders2() {
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
      headers: requestHeaders2(),
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
  for (const field of fields) {
    if (fingerprint(entry?.[field]) !== fingerprint(expected?.[field])) {
      throw new Error(
        `\u4E16\u754C\u4E66\u670D\u52A1\u5668\u6821\u9A8C\u5931\u8D25\uFF1A\u6761\u76EE\u201C${spec.comment || key}\u201D\u5B57\u6BB5 ${field} \u672A\u6309\u4E8B\u52A1\u5199\u5165`
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
    } else {
      if (context.chatMetadata?.[metadataKey] === record.bookName)
        delete context.chatMetadata[metadataKey];
      delete meta.lorebookName;
      delete meta.lorebookChatKey;
      delete meta.lorebookManaged;
    }
    await persistMetadata();
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
async function syncLorebook(artifact, signal) {
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
    await updateSyncStateFromRecord(record);
    record = await executeOutbox(record, scope, signal);
    if (record.state !== "committed" || !record.metadataAttached) {
      throw new Error(record.error || "\u4E16\u754C\u4E66\u4E8B\u52A1\u5C1A\u672A\u5B8C\u6210");
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

// src/domain/snapshot.ts
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
function stateSchemaDescription() {
  return JSON.stringify({
    focus: [{
      id: "focus-linwan",
      title: "\u6797\u665A",
      content: "\u5F53\u524D\u5916\u90E8\u4E8B\u5B9E\u3001\u8EAB\u4EFD\u3001\u8D44\u6E90\u4E0E\u63A5\u89E6\u9762",
      keywords: ["\u6797\u665A"],
      status: "\u5F53\u524D\u7126\u70B9",
      lifecycle: {
        existence: "\u5B58\u6D3B",
        activity: "\u5F53\u524D\u5728\u573A",
        memory: "\u5E7F\u6CDB\u8BB0\u5F97",
        evidenceLevel: "\u5DF2\u786E\u8BA4",
        evidence: "\u5F53\u524D\u53EF\u89C2\u5BDF",
        returnConditions: [],
        returnBlockers: []
      }
    }],
    spacetime: [],
    characters: [],
    relationships: [],
    items: [],
    skills: [],
    events: [],
    regions: [],
    foundations: []
  }, null, 2);
}

// src/domain/sedimentation.ts
var REMOVABLE_TABLES = /* @__PURE__ */ new Set(["spacetime", "events", "regions"]);
var SETTLED_STATUS = /(已结束|已完成|已关闭|已失效|已归档|已替代|resolved|closed|completed|expired|archived|superseded|historical)/i;
function canRemoveRow(table, row, snapshot) {
  if (!REMOVABLE_TABLES.has(table)) return false;
  if (row.source === "manual" || row.locked) return false;
  if (!SETTLED_STATUS.test(`${row.status} ${row.content}`)) return false;
  if (table === "spacetime" && snapshot.spacetime.length <= 1) return false;
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
  for (const table of ["spacetime", "events", "regions"]) {
    next[table] = next[table].filter((row) => {
      if (!requested.has(row.id)) return true;
      if (canRemoveRow(table, row, next)) {
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
  const normalizedPlan = {
    ...plan,
    appliedRowIds: [...new Set(applied)],
    ignoredRowIds: [...new Set(ignored)]
  };
  summary.sedimentation = normalizedPlan;
  return next;
}

// src/domain/summary.ts
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
function normalizeSedimentation(value) {
  if (!value || typeof value !== "object") return void 0;
  const source = value;
  return {
    removeRowIds: stringList(source.removeRowIds, 50, 160),
    characterActivityUpdates: normalizeActivityUpdates(source.characterActivityUpdates),
    notes: stringList(source.notes, 30, 500)
  };
}
function normalizeSummary(value, kind, sourceKeys, previousLargeSummaryId) {
  return {
    id: makeId(kind),
    kind,
    title: safeText(value.title || (kind === "small" ? "\u9636\u6BB5\u6C89\u964D" : "\u957F\u671F\u6C89\u964D"), 240).trim(),
    summary: safeText(value.summary || "", 3e4).trim(),
    keywords: Array.isArray(value.keywords) ? [...new Set(value.keywords.map((item2) => safeText(item2, 80).trim()).filter(Boolean))].slice(0, 24) : [],
    sourceKeys,
    createdAt: nowIso(),
    sedimentation: kind === "small" ? normalizeSedimentation(value.sedimentation) : void 0,
    previousLargeSummaryId: kind === "large" ? previousLargeSummaryId : void 0
  };
}

// src/prompts/summary.ts
function smallSummarySystemPrompt() {
  return `\u4F60\u662F\u955C\u6E0A\u9636\u6BB5\u6C89\u964D\u7ED3\u7B97\u5668\u3002\u53EA\u8F93\u51FA\u5408\u6CD5JSON\u5BF9\u8C61\uFF0C\u4E0D\u7EED\u5199\u6545\u4E8B\uFF0C\u4E0D\u628A\u672A\u786E\u8BA4\u4E8B\u9879\u5199\u6210\u4E8B\u5B9E\u3002
\u8F93\u51FA\u5B57\u6BB5\uFF1Atitle\u3001summary\u3001keywords\u3001sedimentation\u3002
sedimentation\u5305\u542B\uFF1AremoveRowIds\u3001characterActivityUpdates\u3001notes\u3002
\u4F60\u53EA\u63D0\u51FA\u5B89\u5168\u6C89\u964D\uFF1A
- removeRowIds\u53EA\u80FD\u9009\u62E9\u5DF2\u7ECF\u7ED3\u675F\u3001\u5173\u95ED\u3001\u5931\u6548\u3001\u88AB\u66FF\u4EE3\u6216\u5DF2\u5F52\u6863\u7684spacetime/events/regions\u884Cid\u3002
- \u4E0D\u5F97\u5220\u9664focus\u3001characters\u3001relationships\u3001items\u3001skills\u3001foundations\u3002
- \u6B63\u5F0F\u4EBA\u7269\u6C38\u4E0D\u56E0\u79BB\u573A\u3001\u9057\u5FD8\u3001\u6B7B\u4EA1\u6216\u957F\u671F\u672A\u51FA\u73B0\u800C\u5220\u9664\u3002
- characterActivityUpdates\u53EA\u5141\u8BB8\u628A\u201C\u79BB\u573A\u4F46\u4ECD\u6D3B\u8DC3\u2192\u4F11\u7720\u201D\u201C\u4F11\u7720\u2192\u957F\u671F\u4F11\u7720\u201D\u201C\u957F\u671F\u4F11\u7720\u2192\u5DF2\u5F52\u6863\u201D\uFF0C\u4E0D\u5F97\u6539\u53D8\u5B58\u5728\u72B6\u6001\u548C\u8BB0\u5FC6\u72B6\u6001\u3002
- \u73A9\u5BB6\u624B\u52A8\u6216\u9501\u5B9A\u8BB0\u5F55\u4E0D\u5F97\u5220\u9664\u3001\u8986\u76D6\u6216\u964D\u7EA7\u3002
- summary\u6B63\u6587\u5FC5\u987B\u660E\u786E\u5199\u5165\u88AB\u6C89\u964D\u7684\u4E8B\u5B9E\u3001\u4ECD\u4FDD\u7559\u7684\u672A\u51B3\u4E8B\u9879\u548C\u4EBA\u7269\u56DE\u6D41\u6761\u4EF6\u3002`;
}
function smallSummaryPrompt(transcript, snapshot) {
  return `\u5C06\u4EE5\u4E0B\u56DE\u5408\u538B\u7F29\u6210\u201C\u5F53\u524D\u5468\u671F\u5C0F\u603B\u7ED3\u201D\uFF0C\u627F\u62C5\u9636\u6BB5\u6C89\u964D\uFF0C\u4E0D\u662F\u6D41\u6C34\u8D26\u3002
\u91CD\u70B9\u4FDD\u7559\uFF1A\u786E\u5B9A\u7ED3\u679C\u3001\u4E0D\u53EF\u9006\u53D8\u5316\u3001\u5F53\u524D\u4EBA\u7269/\u5173\u7CFB/\u7269\u54C1/\u6280\u80FD/\u533A\u57DF\u72B6\u6001\u3001\u4ECD\u5728\u8FDB\u884C\u7684\u6D41\u7A0B\u3001\u672A\u51B3\u4E0E\u51B2\u7A81\u3002
\u5DF2\u7ECF\u88AB\u6700\u7EC8\u7ED3\u679C\u66FF\u4EE3\u7684\u4E2D\u95F4\u52A8\u4F5C\u4E0D\u5C55\u5F00\u3002

\u3010\u56DE\u5408\u3011
${transcript}

\u3010\u5F53\u524D\u72B6\u6001\u8868\u3011
${JSON.stringify(snapshot, null, 2)}

\u53EA\u8F93\u51FA\u4EE5\u4E0B\u7ED3\u6784\uFF1A
{"title":"...","summary":"...","keywords":["..."],"sedimentation":{"removeRowIds":["\u5DF2\u7ED3\u675F\u72B6\u6001\u884Cid"],"characterActivityUpdates":[{"rowId":"\u4EBA\u7269\u884Cid","activity":"\u4F11\u7720\u6216\u957F\u671F\u4F11\u7720\u6216\u5DF2\u5F52\u6863","reason":"\u4F9D\u636E"}],"notes":["\u6C89\u964D\u8BF4\u660E"]}}`;
}
function largeSummarySystemPrompt() {
  return "\u4F60\u662F\u955C\u6E0A\u957F\u671F\u6C89\u964D\u7ED3\u7B97\u5668\u3002\u53EA\u8F93\u51FA\u5408\u6CD5JSON\u5BF9\u8C61\uFF0C\u5B57\u6BB5\u4E3A title\u3001summary\u3001keywords\u3002\u8F93\u51FA\u5FC5\u987B\u662F\u7D2F\u8BA1\u957F\u671F\u5FEB\u7167\uFF0C\u800C\u4E0D\u662F\u53EA\u590D\u8FF0\u672C\u6279\u5C0F\u603B\u7ED3\u3002";
}
function largeSummaryPrompt(summaries, snapshot, previousLarge) {
  const source = summaries.map((item2) => `\u3010${item2.title}\u3011
${item2.summary}`).join("\n\n");
  const previous = previousLarge ? `\u3010\u4E0A\u4E00\u7248\u957F\u671F\u6C89\u964D\u3011
${previousLarge.summary}

` : "";
  return `\u628A\u201C\u4E0A\u4E00\u7248\u957F\u671F\u6C89\u964D\u201D\u548C\u672C\u6279\u5C0F\u603B\u7ED3\u5408\u5E76\u4E3A\u4E00\u4EFD\u65B0\u7684\u7D2F\u8BA1\u957F\u671F\u6C89\u964D\u3002
\u4FDD\u7559\u957F\u671F\u4ECD\u6210\u7ACB\u7684\u4EBA\u7269\u3001\u5173\u7CFB\u3001\u533A\u57DF\u3001\u7269\u54C1\u3001\u6280\u80FD\u3001\u4E8B\u4EF6\u7ED3\u679C\u3001\u4E0D\u53EF\u9006\u540E\u679C\u4E0E\u672A\u51B3\u4E8B\u9879\uFF1B\u5220\u9664\u5DF2\u7ECF\u5931\u53BB\u610F\u4E49\u7684\u9636\u6BB5\u8FC7\u7A0B\u3002
\u4EBA\u7269\u6B7B\u4EA1\u3001\u5931\u8E2A\u3001\u88AB\u9057\u5FD8\u3001\u8EAB\u4EFD\u5B58\u7591\u7B49\u5FC5\u987B\u4FDD\u7559\u8BC1\u636E\u7B49\u7EA7\u548C\u9057\u7559\u56E0\u679C\uFF0C\u4E0D\u5F97\u7528\u957F\u671F\u672A\u51FA\u73B0\u66FF\u4EE3\u6B7B\u4EA1\u5224\u65AD\u3002

${previous}\u3010\u672C\u6279\u5C0F\u603B\u7ED3\u3011
${source}

\u3010\u5F53\u524D\u72B6\u6001\u8868\u3011
${JSON.stringify(snapshot, null, 2)}

\u53EA\u8F93\u51FA\uFF1A{"title":"...","summary":"...","keywords":["..."]}`;
}

// src/pipeline/local-commit.ts
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
var rebuildOwnerId = makeId("history-rebuild-owner");
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
function affectedRevisionKeys(startIndex, state2) {
  const keys = /* @__PURE__ */ new Set();
  for (const index of assistantIndexesFrom(startIndex)) {
    keys.add(messageIdentity(index));
    const attached = getAttachedArtifact(getMessage(index));
    if (attached?.messageKey) keys.add(attached.messageKey);
  }
  const live = allLiveRevisionKeys();
  for (const key of state2.processedMessageKeys) {
    if (!live.has(key)) keys.add(key);
  }
  return keys;
}
async function prepareHistoryRebuild(startIndex, reason, signal) {
  const scope = chatScopeManager.current();
  const chatKey = scope.chatKey;
  assertCurrent(chatKey, signal);
  return coordinator2().withLease(`history-rebuild-prepare:${chatKey}`, async (lease) => locks().withLock(`history-rebuild-prepare:${chatKey}`, async () => {
    assertCurrent(chatKey, signal);
    lease.assertOwner();
    const state2 = await getChatState(chatKey);
    const normalizedStart = Math.max(0, Math.min(startIndex, getChat().length));
    const affectedKeys = affectedRevisionKeys(normalizedStart, state2);
    const invalidation = invalidateSummaryDependencies(state2.smallSummaries, state2.largeSummaries, affectedKeys);
    const previous = latestValidArtifactBefore(normalizedStart, chatKey);
    const now = nowIso();
    const record = {
      schemaVersion: 1,
      id: makeId("history-rebuild"),
      chatKey,
      startIndex: normalizedStart,
      reason,
      state: "pending",
      ownerId: rebuildOwnerId,
      invalidatedMessageKeys: [...affectedKeys].slice(0, 200),
      invalidatedSmallSummaryIds: invalidation.invalidatedSmallSummaryIds.slice(0, 200),
      invalidatedLargeSummaryIds: invalidation.invalidatedLargeSummaryIds.slice(0, 200),
      createdAt: now,
      updatedAt: now
    };
    const affectedIndexes = assistantIndexesFrom(normalizedStart);
    const artifactsToRemove = /* @__PURE__ */ new Set();
    for (const index of affectedIndexes) {
      const message = getMessage(index);
      const attached = getAttachedArtifact(message);
      if (attached?.chatKey === chatKey) artifactsToRemove.add(attached.messageKey);
      if (message?.extra?.[MODULE_NAME]) delete message.extra[MODULE_NAME];
    }
    state2.processedMessageKeys = state2.processedMessageKeys.filter((key) => !affectedKeys.has(key));
    state2.smallSummaries = invalidation.smallSummaries;
    state2.largeSummaries = invalidation.largeSummaries;
    state2.latestSnapshotMessageKey = previous?.messageKey;
    state2.lastSyncStatus = "queued";
    state2.lastSyncError = `\u5386\u53F2\u4F9D\u8D56\u5DF2\u5931\u6548\uFF0C\u7B49\u5F85\u4ECE\u7B2C ${normalizedStart + 1} \u6761\u6D88\u606F\u91CD\u5EFA`;
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
      detail: `${reason}; start=${normalizedStart}; messages=${affectedKeys.size}; small=${record.invalidatedSmallSummaryIds.length}; large=${record.invalidatedLargeSummaryIds.length}`
    });
    return record;
  }), signal);
}
async function updateHistoryRebuild(record, patch) {
  const state2 = await getChatState(record.chatKey);
  const current = state2.historyRebuild;
  if (!current || current.id !== record.id) return;
  state2.historyRebuild = { ...current, ...patch, updatedAt: nowIso() };
  await putChatState(state2);
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
    state: "committed"
  });
}
function assertHistoryRebuildAccess(state2) {
  const rebuild = state2.historyRebuild;
  if (!rebuild) return;
  if (rebuild.state === "failed") {
    throw new TaskCancelledError("\u5386\u53F2\u4F9D\u8D56\u91CD\u5EFA\u5931\u8D25\uFF0C\u5FC5\u987B\u5148\u6062\u590D\u540E\u624D\u80FD\u7EE7\u7EED\u603B\u7ED3\u6216\u540C\u6B65");
  }
  if (rebuild.ownerId && rebuild.ownerId !== rebuildOwnerId) {
    throw new TaskCancelledError("\u53E6\u4E00\u4E2A\u6807\u7B7E\u9875\u6B63\u5728\u91CD\u5EFA\u8BE5\u804A\u5929\u7684\u603B\u7ED3\u4E0E\u72B6\u6001\u4F9D\u8D56");
  }
}
async function rebuildHistoryFrom(input) {
  const chatKey = currentChatKey();
  return coordinator2().withLease(`history-rebuild:${chatKey}`, async (lease) => {
    assertCurrent(chatKey, input.signal);
    lease.assertOwner();
    const record = await prepareHistoryRebuild(input.startIndex, input.reason, input.signal);
    record.state = "rebuilding";
    record.ownerId = rebuildOwnerId;
    await updateHistoryRebuild(record, { state: "rebuilding", ownerId: rebuildOwnerId, error: void 0 });
    let rebuilt = 0;
    let latest = latestValidArtifactBefore(record.startIndex, chatKey);
    try {
      for (const index of assistantIndexesFrom(record.startIndex)) {
        assertCurrent(chatKey, input.signal);
        lease.assertOwner();
        const artifact = await input.processMessage(index, true, { deferLorebookSync: true });
        if (artifact) {
          latest = deepClone(artifact);
          rebuilt += 1;
        }
      }
      assertCurrent(chatKey, input.signal);
      lease.assertOwner();
      if (latest?.snapshot) await input.syncLatest(latest);
      await completeHistoryRebuild(record);
      return { record, rebuilt, latestArtifact: latest };
    } catch (error) {
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
  for (const key of trackedKeys) {
    if (!liveKeys.has(key)) return 0;
  }
  return null;
}
async function recoverPendingHistoryRebuild(input) {
  const chatKey = currentChatKey();
  const state2 = await getChatState(chatKey);
  const record = state2.historyRebuild;
  const detectedStart = record ? record.startIndex : await detectHistoryConsistencyStart();
  if (detectedStart === null) return false;
  await rebuildHistoryFrom({
    startIndex: detectedStart,
    reason: record ? "recovery" : "branch",
    processMessage: input.processMessage,
    syncLatest: input.syncLatest,
    signal: input.signal
  });
  return true;
}

// src/pipeline/summary.ts
function successfulArtifacts() {
  const chatKey = currentChatKey();
  return getChat().filter((message) => !message?.is_user).map((message) => message?.extra?.mirrorAbyssV11).filter((artifact) => Boolean(
    artifact?.chatKey === chatKey && artifact?.snapshot && artifact.stages.state.status === "success"
  ));
}
function transcriptFor(artifacts) {
  return artifacts.map((artifact) => `\u3010\u56DE\u5408 ${artifact.messageIndex + 1}\u3011
\u73A9\u5BB6\uFF1A${artifact.playerText || "\uFF08\u7A7A\uFF09"}
\u6B63\u6587\uFF1A${artifact.assistantText}`).join("\n\n");
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
function pendingSmallSummaries(small, large) {
  const consumed = new Set(large.flatMap((item2) => item2.sourceKeys));
  return small.filter((item2) => !consumed.has(item2.id));
}
async function generateSmallSummary(artifact, force = false, signal) {
  assertSummaryScope(artifact, signal);
  return summaryCoordinator().withLease(`summary:${artifact.chatKey}`, async (lease) => {
    assertSummaryScope(artifact, signal);
    lease.assertOwner();
    const settings = getSettings();
    const chatState = await getChatState(artifact.chatKey);
    assertHistoryRebuildAccess(chatState);
    const consumed = allConsumedKeys(chatState.smallSummaries);
    const pending = successfulArtifacts().filter((item2) => !consumed.has(item2.messageKey));
    const threshold = Math.max(1, Number(settings.smallSummaryTurns) || 15);
    if (!force && pending.length < threshold) return null;
    if (!pending.length) return null;
    const selected = force ? pending : pending.slice(0, threshold);
    const latestSnapshot = selected.at(-1)?.snapshot;
    const intentKey = `small:${artifact.chatKey}:${hashText(JSON.stringify(selected.map((item2) => item2.messageKey)))}`;
    const parsed = await generateStructuredTask({
      task: "smallSummary",
      systemPrompt: smallSummarySystemPrompt(),
      prompt: smallSummaryPrompt(transcriptFor(selected), latestSnapshot),
      structureDescription: '{"title":"...","summary":"...","keywords":["..."],"sedimentation":{"removeRowIds":["..."],"characterActivityUpdates":[{"rowId":"...","activity":"\u4F11\u7720|\u957F\u671F\u4F11\u7720|\u5DF2\u5F52\u6863","reason":"..."}],"notes":["..."]}}',
      signal
    });
    assertSummaryScope(artifact, signal);
    lease.assertOwner();
    const summary = normalizeSummary(parsed, "small", selected.map((item2) => item2.messageKey));
    const beforeArtifact = deepClone(artifact);
    const beforeChatState = deepClone(chatState);
    const afterArtifact = deepClone(artifact);
    const afterChatState = deepClone(chatState);
    afterChatState.smallSummaries.push(summary);
    if (afterArtifact.snapshot) afterArtifact.snapshot = applySedimentation(afterArtifact.snapshot, summary);
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
async function generateLargeSummary(artifact, force = false, signal) {
  assertSummaryScope(artifact, signal);
  return summaryCoordinator().withLease(`summary:${artifact.chatKey}`, async (lease) => {
    assertSummaryScope(artifact, signal);
    lease.assertOwner();
    const settings = getSettings();
    const chatState = await getChatState(artifact.chatKey);
    assertHistoryRebuildAccess(chatState);
    const pending = pendingSmallSummaries(chatState.smallSummaries, chatState.largeSummaries);
    const threshold = Math.max(1, Number(settings.largeSummaryCount) || 6);
    if (!force && pending.length < threshold) return null;
    if (!pending.length) return null;
    const selected = force ? pending : pending.slice(0, threshold);
    const snapshot = artifact.snapshot;
    if (!snapshot) throw new Error("\u6CA1\u6709\u53EF\u7528\u4E8E\u5927\u603B\u7ED3\u7684\u72B6\u6001\u8868");
    const previousLarge = chatState.largeSummaries.at(-1);
    const intentKey = `large:${artifact.chatKey}:${hashText(JSON.stringify(selected.map((item2) => item2.id)))}`;
    const parsed = await generateStructuredTask({
      task: "largeSummary",
      systemPrompt: largeSummarySystemPrompt(),
      prompt: largeSummaryPrompt(selected, snapshot, previousLarge),
      structureDescription: '{"title":"...","summary":"...","keywords":["..."]}',
      signal
    });
    assertSummaryScope(artifact, signal);
    lease.assertOwner();
    const summary = normalizeSummary(
      parsed,
      "large",
      selected.map((item2) => item2.id),
      previousLarge?.id
    );
    const beforeArtifact = deepClone(artifact);
    const beforeChatState = deepClone(chatState);
    const afterArtifact = deepClone(artifact);
    const afterChatState = deepClone(chatState);
    afterChatState.largeSummaries.push(summary);
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
async function maybeRunSummaries(artifact, forceSmall = false, forceLarge = false, signal) {
  const settings = getSettings();
  markStage(artifact, "summary", "running");
  await putArtifact(artifact);
  try {
    if (settings.autoSmallSummary || forceSmall) await generateSmallSummary(artifact, forceSmall, signal);
    if (settings.autoLargeSummary || forceLarge) await generateLargeSummary(artifact, forceLarge, signal);
    markStage(artifact, "summary", "success");
    await putArtifact(artifact);
  } catch (error) {
    markStage(artifact, "summary", "failed", toErrorMessage(error));
    await putArtifact(artifact);
    throw error;
  }
}

// src/prompts/state.ts
function stateSystemPrompt() {
  return `\u4F60\u662F\u201C\u955C\u6E0A\u201D\u72B6\u6001\u7EF4\u62A4\u5668\u3002\u4F60\u53EA\u7EF4\u62A4\u5F53\u524D\u4E16\u754C\u72B6\u6001\u5FEB\u7167\uFF0C\u4E0D\u7EED\u5199\u6545\u4E8B\u3002

\u8F93\u51FA\u5FC5\u987B\u662F\u53EF\u76F4\u63A5\u88AB JSON.parse \u89E3\u6790\u7684\u5B8C\u6574JSON\u5BF9\u8C61\uFF0C\u4E0D\u8981\u8F93\u51FAMarkdown\u3001\u89E3\u91CA\u6216\u989D\u5916\u6587\u5B57\u3002
\u5FC5\u987B\u5305\u542B\u4E5D\u4E2A\u6570\u7EC4\uFF1Afocus\u3001spacetime\u3001characters\u3001relationships\u3001items\u3001skills\u3001events\u3001regions\u3001foundations\u3002
\u6BCF\u884C\u5141\u8BB8\u5B57\u6BB5\uFF1Aid\u3001title\u3001content\u3001keywords\u3001status\uFF1Bfocus\u4E0Echaracters\u8FD8\u5141\u8BB8 lifecycle\u3002

\u7EF4\u62A4\u89C4\u5219\uFF1A
1. \u4FDD\u7559\u672A\u53D7\u672C\u8F6E\u5F71\u54CD\u3001\u4ECD\u6210\u7ACB\u7684\u72B6\u6001\u3002\u53EA\u6709\u672C\u8F6E\u660E\u786E\u6539\u53D8\u7684\u72B6\u6001\u624D\u66F4\u65B0\u3002
2. \u8FC7\u7A0B\u538B\u7F29\u4E3A\u5F53\u524D\u7ED3\u679C\uFF0C\u4E0D\u5199\u6D41\u6C34\u8D26\u3002\u672A\u786E\u8BA4\u3001\u51B2\u7A81\u548C\u8FDB\u884C\u4E2D\u4E8B\u9879\u4E0D\u5F97\u5F3A\u884C\u95ED\u5408\u3002
3. \u5C3D\u91CF\u4FDD\u7559\u4E0A\u4E00\u4EFD\u5FEB\u7167\u7684\u7A33\u5B9Aid\uFF1B\u65B0\u589E\u5BF9\u8C61\u624D\u521B\u5EFA\u65B0id\u3002
4. \u73A9\u5BB6\u8F93\u5165\u4E2D\u7684\u52A8\u4F5C\u548C\u5BF9\u767D\u53EF\u4F5C\u4E3A\u5DF2\u58F0\u660E\u884C\u4E3A\uFF0C\u4F46\u73A9\u5BB6\u9884\u8BBE\u7684\u5916\u90E8\u7ED3\u679C\u4E0D\u80FD\u5355\u72EC\u5F53\u6210\u5DF2\u786E\u8BA4\u7ED3\u679C\uFF1B\u5916\u90E8\u7ED3\u679C\u4EE5AI\u6B63\u6587\u4E0E\u5DF2\u6709\u72B6\u6001\u4E2D\u7684\u53EF\u89C2\u5BDF\u4E8B\u5B9E\u4E3A\u51C6\u3002
5. source=manual\u6216locked=true\u7684\u73A9\u5BB6\u8BB0\u5F55\u4E0D\u5F97\u8986\u76D6\u3001\u5220\u9664\u6216\u6539\u5199\u3002
6. relationships \u4E2D\u6BCF\u884C title \u5FC5\u987B\u660E\u786E\u5199\u51FA\u5173\u7CFB\u4E24\u7AEF\uFF0C\u4F18\u5148\u4F7F\u7528\u201C\u5BF9\u8C61A \u2194 \u5BF9\u8C61B\u201D\u683C\u5F0F\uFF1Bcontent\u53EA\u5199\u5DF2\u663E\u5F71\u7684\u5173\u7CFB\u4E8B\u5B9E\uFF0Cstatus\u5199\u5173\u7CFB\u5F53\u524D\u72B6\u6001\u3002
7. characters \u53EA\u4E3A\u6B63\u5F0F\u663E\u5F71\u7684\u4EBA\u7269\u5EFA\u7ACB\u72EC\u7ACB\u884C\u3002\u4EC5\u88AB\u63D0\u53CA\u3001\u6CA1\u6709\u8FDB\u5165\u53EF\u89C2\u5BDF\u63A5\u89E6\u9762\u7684\u4EBA\u7269\uFF0C\u5148\u5199\u5728\u76F8\u5173\u4E8B\u4EF6\u6216\u4EBA\u7269\u5185\u5BB9\u4E2D\uFF0C\u4E0D\u5355\u72EC\u5EFA\u884C\u3002
8. \u5DF2\u5EFA\u7ACB\u7684\u6B63\u5F0F\u4EBA\u7269\u4E0D\u5F97\u4EC5\u56E0\u79BB\u573A\u3001\u957F\u671F\u672A\u51FA\u73B0\u3001\u88AB\u9057\u5FD8\u6216\u6B7B\u4EA1\u800C\u5220\u9664\u3002\u4EBA\u7269\u79BB\u5F00\u63A5\u89E6\u9762\u53EA\u6539\u53D8activity\uFF1B\u6B7B\u4EA1\u53EA\u6539\u53D8existence\uFF1B\u88AB\u9057\u5FD8\u53EA\u6539\u53D8memory\u3002
9. lifecycle\u5B57\u6BB5\u56FA\u5B9A\u4E3A\uFF1A
   - existence\uFF1A\u5B58\u6D3B\u3001\u6B7B\u4EA1\u5DF2\u786E\u8BA4\u3001\u5B58\u5728\u672A\u77E5\u3001\u5931\u8E2A\u3001\u8EAB\u4EFD\u5B58\u7591\u3001\u865A\u6784\u6216\u8BEF\u8BA4\u5DF2\u786E\u8BA4\u3001\u5B58\u5728\u88AB\u62B9\u9664\u3001\u672A\u6807\u6CE8\u3002
   - activity\uFF1A\u5F53\u524D\u5728\u573A\u3001\u5F53\u524D\u76F8\u5173\u3001\u79BB\u573A\u4F46\u4ECD\u6D3B\u8DC3\u3001\u4F11\u7720\u3001\u957F\u671F\u4F11\u7720\u3001\u5DF2\u5F52\u6863\u3001\u672A\u6807\u6CE8\u3002
   - memory\uFF1A\u5E7F\u6CDB\u8BB0\u5F97\u3001\u90E8\u5206\u4EBA\u7269\u8BB0\u5F97\u3001\u4EC5\u8BB0\u5F55\u7559\u5B58\u3001\u4EC5\u75D5\u8FF9\u7559\u5B58\u3001\u65E0\u4EBA\u53EF\u786E\u8BA4\u8BB0\u5F97\u3001\u8BB0\u5FC6\u88AB\u7BE1\u6539\u3001\u8BB0\u5FC6\u88AB\u62B9\u9664\u3001\u672A\u6807\u6CE8\u3002
   - evidenceLevel\uFF1A\u5DF2\u786E\u8BA4\u3001\u53EF\u9760\u8BB0\u5F55\u3001\u591A\u65B9\u9648\u8FF0\u3001\u5355\u65B9\u9648\u8FF0\u3001\u63A8\u6D4B\u3001\u672A\u77E5\u3002
   - evidence\uFF1A\u652F\u6301\u4E0A\u8FF0\u5224\u65AD\u7684\u53EF\u9A8C\u8BC1\u4F9D\u636E\u3002
   - returnConditions\uFF1A\u4EBA\u7269\u53EF\u80FD\u91CD\u65B0\u8FDB\u5165\u63A5\u89E6\u9762\u7684\u73B0\u5B9E\u6761\u4EF6\uFF0C\u4E0D\u4EE3\u8868\u4E00\u5B9A\u56DE\u6765\u3002
   - returnBlockers\uFF1A\u963B\u6B62\u56DE\u6D41\u7684\u5DF2\u786E\u8BA4\u6761\u4EF6\uFF1B\u6CA1\u6709\u53EF\u9760\u8BC1\u636E\u65F6\u7559\u7A7A\u3002
10. \u4E0D\u5F97\u56E0\u201C\u5F88\u4E45\u6CA1\u51FA\u73B0\u201D\u63A8\u5B9A\u6B7B\u4EA1\uFF1B\u4ED6\u4EBA\u9648\u8FF0\u6B7B\u4EA1\u53EA\u80FD\u6309\u8BC1\u636E\u7B49\u7EA7\u8BB0\u5F55\u3002\u6B7B\u4EA1\u5DF2\u786E\u8BA4\u7684\u4EBA\u7269\u4ECD\u4FDD\u7559\u9057\u7559\u5173\u7CFB\u3001\u7269\u54C1\u3001\u6D41\u7A0B\u548C\u540E\u679C\u3002
11. items\uFF1A\u666E\u901A\u7269\u54C1\u6309\u6240\u6709\u8005\u5408\u5E76\u4E3A\u201C\u4EBA\u7269\u540D\uFF5C\u7269\u54C1\u4E0E\u8D44\u6E90\u201D\uFF1B\u62E5\u6709\u72EC\u7ACB\u8EAB\u4EFD\u3001\u72B6\u6001\u3001\u56E0\u679C\u6216\u8FFD\u8E2A\u4EF7\u503C\u7684\u91CD\u8981\u7269\u54C1\u624D\u5355\u72EC\u4E00\u884C\u3002
12. skills\uFF1A\u6309\u4EBA\u7269\u6216\u4E3B\u4F53\u5408\u5E76\u4E3A\u201C\u4EBA\u7269\u540D\uFF5C\u6280\u80FD\u4E0E\u80FD\u529B\u201D\uFF0C\u53EA\u8BB0\u5F55\u5DF2\u663E\u5F71\u80FD\u529B\u3001\u6761\u4EF6\u3001\u6D88\u8017\u548C\u8FB9\u754C\uFF0C\u4E0D\u751F\u6210\u9690\u85CF\u80FD\u529B\u3002
13. events\u4E2D\u72EC\u7ACB\u4E8B\u4EF6\u4F7F\u7528\u201C\u4E8B\u4EF6\uFF5C\u540D\u79F0\u201D\uFF0C\u5236\u5EA6\u6216\u624B\u7EED\u4F7F\u7528\u201C\u6D41\u7A0B\uFF5C\u540D\u79F0\u201D\u3002\u5C0F\u4E8B\u4EF6\u53EF\u7559\u5728\u4EBA\u7269\u6216\u533A\u57DF\u5185\u5BB9\u4E2D\uFF0C\u4E0D\u5FC5\u62C6\u884C\u3002
14. foundations\u53EA\u4FDD\u7559\u957F\u671F\u627F\u91CD\u8BBE\u5B9A\uFF1B\u5F53\u524D\u5C40\u52BF\u3001\u4EBA\u7269\u53D8\u5316\u548C\u4E8B\u4EF6\u8FDB\u5C55\u4E0D\u5F97\u5199\u5165\u57FA\u7840\u8BBE\u5B9A\u3002

\u7ED3\u6784\u793A\u4F8B\uFF1A
${stateSchemaDescription()}`;
}
function stateUserPrompt(previous, playerText, assistantText, repair = false) {
  return `\u3010\u4E0A\u4E00\u4EFD\u72B6\u6001\u8868\u3011
${JSON.stringify(previous, null, 2)}

\u3010\u73A9\u5BB6\u672C\u8F6E\u8F93\u5165\u3011
${playerText || "\uFF08\u7A7A\uFF09"}

\u3010AI\u672C\u8F6E\u6B63\u6587\u3011
${assistantText}

\u8F93\u51FA\u66F4\u65B0\u540E\u7684\u5B8C\u6574\u72B6\u6001\u5FEB\u7167\u3002${repair ? "\n\u4E0A\u4E00\u6B21\u8F93\u51FA\u65E0\u6CD5\u89E3\u6790\uFF1B\u8FD9\u6B21\u53EA\u8F93\u51FA\u5408\u6CD5JSON\u5BF9\u8C61\u3002" : ""}`;
}

// src/pipeline/state.ts
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
function restoreManualRows(previous, next) {
  for (const key of TABLE_KEYS) {
    const existing = new Set(next[key].map((row) => row.id));
    for (const row of previous[key]) {
      if (row.source === "manual" && !existing.has(row.id)) next[key].push({ ...row });
    }
  }
  return next;
}
async function runStateExtraction(artifact, force = false, signal) {
  if (!force && artifact.stages.state.status === "success" && artifact.snapshot) return artifact.snapshot;
  const settings = getSettings();
  const previous = previousSnapshot(artifact.messageIndex);
  markStage(artifact, "state", "running");
  await putArtifact(artifact);
  try {
    const parsed = await generateStructuredTask({
      task: "state",
      systemPrompt: stateSystemPrompt(),
      prompt: stateUserPrompt(previous, artifact.playerText, artifact.assistantText),
      structureDescription: stateSchemaDescription(),
      allowRepair: settings.repairInvalidJsonOnce,
      signal
    });
    const normalized = preservePersistentCharacters(previous, restoreManualRows(previous, normalizeSnapshot(parsed, previous)));
    artifact.snapshot = normalized;
    markStage(artifact, "state", "success");
    await putArtifact(artifact);
    return normalized;
  } catch (error) {
    markStage(artifact, "state", "failed", toErrorMessage(error));
    await putArtifact(artifact);
    throw error;
  }
}

// src/pipeline/errors.ts
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
  const settings = getSettings();
  if (!settings.enabled) return null;
  const message = getMessage(index);
  if (!message || message.is_user || !String(message.mes || "").trim()) return null;
  const identity = messageIdentity(index);
  const key = `${PIPELINE_VERSION}:${currentChatKey()}:${identity}`;
  return taskQueue.run(key, `\u5904\u7406\u7B2C ${index + 1} \u6761AI\u6B63\u6587`, "state", async (signal) => {
    const initialState = await getChatState(currentChatKey());
    assertHistoryRebuildAccess(initialState);
    const artifact = await loadOrCreateArtifact(index, force);
    notify(index, artifact);
    try {
      assertArtifactScope(artifact, signal);
      let audit = await runAudit(artifact, force, signal);
      await stageArtifact(index, artifact);
      if (!audit.passed && settings.auditFailAction === "revise") {
        assertArtifactScope(artifact, signal);
        const revised = await runRevisionFlow(artifact, signal);
        audit = revised.audit;
        await stageArtifact(index, artifact);
      }
      if (!audit.passed) {
        const failureAction = settings.auditFailAction === "revise" ? settings.revisionFallbackAction : settings.auditFailAction;
        assertArtifactScope(artifact, signal);
        await applyAuditFailureAction(artifact, failureAction);
        releaseQuarantine(artifact);
        markStage(artifact, "state", "blocked", "\u89C4\u5219\u5BA1\u6838\u672A\u901A\u8FC7");
        markStage(artifact, "summary", "blocked", "\u89C4\u5219\u5BA1\u6838\u672A\u901A\u8FC7");
        markStage(artifact, "sync", "blocked", "\u89C4\u5219\u5BA1\u6838\u672A\u901A\u8FC7");
        await stageArtifact(index, artifact);
        return artifact;
      }
      releaseQuarantine(artifact);
      if (settings.autoState || force) {
        assertArtifactScope(artifact, signal);
        await runStateExtraction(artifact, force, signal);
        await stageArtifact(index, artifact);
      } else {
        markStage(artifact, "state", "skipped");
      }
      if (artifact.snapshot) {
        assertArtifactScope(artifact, signal);
        const chatState = await getChatState(artifact.chatKey);
        assertHistoryRebuildAccess(chatState);
        if (!chatState.processedMessageKeys.includes(artifact.messageKey)) chatState.processedMessageKeys.push(artifact.messageKey);
        chatState.latestSnapshotMessageKey = artifact.messageKey;
        chatState.updatedAt = nowIso();
        await putChatState(chatState);
        assertArtifactScope(artifact, signal);
        await maybeRunSummaries(artifact, false, false, signal);
        await stageArtifact(index, artifact);
        assertArtifactScope(artifact, signal);
        if (options.deferLorebookSync) {
          markStage(artifact, "sync", "skipped", "\u5386\u53F2\u91CD\u5EFA\u671F\u95F4\u5EF6\u8FDF\u5230\u672B\u5C3E\u7EDF\u4E00\u540C\u6B65");
          await putArtifact(artifact);
        } else {
          await syncLorebook(artifact, signal);
        }
        assertArtifactScope(artifact, signal);
        await stageArtifact(index, artifact);
      }
      return artifact;
    } catch (error) {
      if (signal.aborted || error instanceof StaleTaskError || error instanceof TaskCancelledError || artifact.chatKey !== currentChatKey()) {
        throw error;
      }
      const messageText = toErrorMessage(error);
      console.error("[MirrorAbyss] pipeline failed", error);
      releaseQuarantine(artifact);
      toast("error", `\u5904\u7406\u5931\u8D25\uFF1A${messageText}`);
      await stageArtifact(index, artifact);
      throw new PipelineStageError(artifact, error);
    } finally {
      if (artifact.chatKey === currentChatKey()) {
        await commitArtifact(index, artifact).catch((error) => {
          console.error("[MirrorAbyss] final chat commit failed", error);
          throw error;
        });
      }
    }
  });
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
    void processMessage(index, force).catch((error) => {
      if (error instanceof PipelineStageError || error instanceof StaleTaskError || error instanceof TaskCancelledError) return;
      console.error("[MirrorAbyss] scheduled pipeline failed", error);
    });
  }, delay);
}
async function retryStage(index, stage) {
  if (stage === "audit" || stage === "revision") return processMessage(index, true);
  const artifact = await loadOrCreateArtifact(index, false);
  const key = `${PIPELINE_VERSION}:retry:${stage}:${artifact.chatKey}:${artifact.messageKey}`;
  return taskQueue.run(key, `\u91CD\u8BD5${stage}`, stage === "sync" ? "sync" : stage === "summary" ? "smallSummary" : stage, async (signal) => {
    try {
      assertArtifactScope(artifact, signal);
      if (stage === "state") await runStateExtraction(artifact, true, signal);
      if (stage === "summary") await maybeRunSummaries(artifact, true, true, signal);
      if (stage === "sync") await syncLorebook(artifact, signal);
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
        await syncLorebook(artifact, signal);
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
    clearAllQuarantines();
    taskQueue.cancelChat(scope.chatKey, "\u804A\u5929\u5386\u53F2\u5DF2\u4FEE\u6539\uFF0C\u53D6\u6D88\u65E7\u4EFB\u52A1\u5E76\u91CD\u5EFA\u4F9D\u8D56");
    connectionBroker.cancelScope(scope.chatKey, "\u804A\u5929\u5386\u53F2\u5DF2\u4FEE\u6539\uFF0C\u53D6\u6D88\u65E7\u8BF7\u6C42\u5E76\u91CD\u5EFA\u4F9D\u8D56");
    void rebuildHistoryFrom({
      startIndex: pending.startIndex,
      reason: pending.reason,
      processMessage,
      syncLatest: async (artifact) => syncLorebook(artifact)
    }).catch((error) => {
      if (error instanceof StaleTaskError || error instanceof TaskCancelledError) return;
      console.error("[MirrorAbyss] history rebuild failed", error);
      toast("error", `\u5386\u53F2\u4F9D\u8D56\u91CD\u5EFA\u5931\u8D25\uFF1A${toErrorMessage(error)}`);
    });
  }, delay);
  historyRebuildTimers.set(scope.chatKey, timer);
}
async function removeMessageArtifact(payload) {
  scheduleHistoryRebuild(payload, "deleted", 0);
}
async function recoverHistoryConsistencyForCurrentChat() {
  return recoverPendingHistoryRebuild({
    processMessage,
    syncLatest: async (artifact) => syncLorebook(artifact)
  });
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
      connectionBroker.cancelAllExceptScope(event.scope.chatKey);
    }),
    router.subscribe("chat-created", (event) => {
      clearAllQuarantines();
      taskQueue.cancelAllExceptChat(event.scope.chatKey);
      connectionBroker.cancelAllExceptScope(event.scope.chatKey);
    })
  ];
  return () => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    for (const timer of historyRebuildTimers.values()) window.clearTimeout(timer);
    historyRebuildTimers.clear();
    pendingHistoryStarts.clear();
  };
}

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
  const tables = scope === "relations" ? ["focus", "characters"] : ["focus", "characters", "items", "events", "regions", "spacetime"];
  for (const table of tables) {
    const type = nodeTypeFor(table);
    if (!type) continue;
    for (const row of snapshot[table]) {
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
    }
  }
  const edges = [];
  const seenEdges = /* @__PURE__ */ new Set();
  let relationIndex = 0;
  for (const row of snapshot.relationships) {
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

// src/maintenance/recovery.ts
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
    detail: typeof context?.generateRaw === "function" ? "generateRaw\u53EF\u7528" : "\u5F53\u524D\u8FDE\u63A5\u6A21\u5F0F\u4E0D\u53EF\u7528\uFF1B\u4ECD\u53EF\u4F7F\u7528\u72EC\u7ACBAPI"
  });
  const coordinator3 = foundationKernel.services.tryGet(CROSS_TAB_COORDINATOR);
  const coordination = coordinator3?.snapshot();
  checks.push({
    id: "crossTabCoordinator",
    label: "\u8DE8\u6807\u7B7E\u534F\u8C03",
    status: coordination?.mode === "memory" ? "warn" : coordination ? "ok" : "error",
    detail: coordination ? `${coordination.mode}\uFF1B\u6D3B\u52A8\u79DF\u7EA6 ${coordination.active.length}` : "\u4E0D\u53EF\u7528"
  });
  const broker = connectionBroker.snapshot();
  checks.push({
    id: "connectionBroker",
    label: "Connection Broker",
    status: broker.circuits.some((item2) => item2.openUntil > Date.now()) ? "warn" : "ok",
    detail: `\u6D3B\u52A8 ${broker.active.length}\uFF1B\u6392\u961F ${broker.lanes.reduce((sum, lane) => sum + lane.queued, 0)}\uFF1B\u7194\u65AD ${broker.circuits.filter((item2) => item2.openUntil > Date.now()).length}`
  });
  checks.push({
    id: "connectionService",
    label: "Connection Profile\u9694\u79BB\u8C03\u7528",
    status: typeof context?.ConnectionManagerRequestService?.sendRequest === "function" ? "ok" : "warn",
    detail: typeof context?.ConnectionManagerRequestService?.sendRequest === "function" ? "ConnectionManagerRequestService\u53EF\u7528\uFF0C\u4E0D\u9700\u8981\u5207\u6362\u5168\u5C40\u8FDE\u63A5" : "\u4E0D\u53EF\u7528\uFF1B\u8BF7\u4F7F\u7528\u955C\u6E0A\u72EC\u7ACBAPI\u6216\u5F53\u524D\u8FDE\u63A5"
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
  }
  const settings = context ? getSettings() : null;
  if (settings) {
    const independentCount = settings.independentApiProfiles.length;
    const readyCount = settings.independentApiProfiles.filter(
      (profile) => Boolean(profile.apiUrl && profile.model && getSessionApiKey(profile.id))
    ).length;
    checks.push({
      id: "independentApi",
      label: "\u955C\u6E0A\u72EC\u7ACBAPI",
      status: independentCount === 0 ? "warn" : readyCount === independentCount ? "ok" : "warn",
      detail: independentCount === 0 ? "\u5C1A\u672A\u521B\u5EFA\uFF1B\u4EFB\u52A1\u53EF\u7EE7\u7EED\u4F7F\u7528\u5F53\u524D\u8FDE\u63A5\u6216ST Profile" : `${readyCount}/${independentCount} \u4E2A\u914D\u7F6E\u5DF2\u5177\u5907\u5730\u5740\u3001\u6A21\u578B\u548C\u672C\u6B21\u4F1A\u8BDD\u5BC6\u94A5`
    });
  }
  checks.push({
    id: "audit",
    label: "\u89C4\u5219\u5BA1\u6838\u914D\u7F6E",
    status: settings?.auditEnabled && !settings.auditPrompt.trim() ? "error" : "ok",
    detail: settings?.auditEnabled ? settings.auditPrompt.trim() ? "\u5DF2\u542F\u7528\u5E76\u586B\u5199\u89C4\u5219" : "\u5DF2\u542F\u7528\u4F46\u89C4\u5219\u4E3A\u7A7A" : "\u672A\u542F\u7528"
  });
  const revisionConnection = settings?.connections.revision;
  const revisionProfileMissing = Boolean(
    settings?.auditEnabled && settings.auditFailAction === "revise" && (revisionConnection?.mode === "profile" && !revisionConnection.profileId.trim() || revisionConnection?.mode === "independent" && !revisionConnection.independentProfileId.trim())
  );
  checks.push({
    id: "revision",
    label: "\u5B9A\u5411\u4FEE\u6B63\u914D\u7F6E",
    status: revisionProfileMissing ? "error" : "ok",
    detail: settings?.auditFailAction === "revise" ? revisionProfileMissing ? "\u4FEE\u6B63\u6A21\u578B\u5DF2\u9009\u62E9\u72EC\u7ACB\u8FDE\u63A5\u65B9\u5F0F\uFF0C\u4F46\u5C1A\u672A\u9009\u62E9\u6709\u6548\u914D\u7F6E" : `\u5DF2\u542F\u7528\uFF0C\u6700\u591A${settings.maxRevisionAttempts}\u6B21\uFF0C\u5931\u8D25\u540E${settings.revisionFallbackAction}` : "\u672A\u542F\u7528\u81EA\u52A8\u4FEE\u6B63"
  });
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
    connectionBroker: connectionBroker.snapshot(),
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
            <div class="ma11-subtitle">\u7ED3\u6784\u5316\u72B6\u6001\u3001\u5206\u5C42\u603B\u7ED3\u4E0E\u4E16\u754C\u4E66\u53D1\u5E03</div>
          </div>
          <button class="ma11-icon-button" data-ma11-action="close" aria-label="\u5173\u95ED">\xD7</button>
        </header>
        <nav class="ma11-tabs" aria-label="\u955C\u6E0A\u529F\u80FD">
          ${[
      ["overview", "\u603B\u89C8"],
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
    ["audit", "\u89C4\u5219\u5BA1\u6838"],
    ["revision", "\u5B9A\u5411\u4FEE\u6B63"],
    ["state", "\u72B6\u6001\u63D0\u53D6"],
    ["summary", "\u5206\u5C42\u603B\u7ED3"],
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
        <p>${artifact ? `\u72B6\u6001\u8868 ${rows2} \u6761 \xB7 \u66F4\u65B0\u65F6\u95F4 ${escapeHtml(new Date(artifact.updatedAt).toLocaleString())}` : "\u751F\u6210\u4E00\u6761AI\u6B63\u6587\uFF0C\u6216\u624B\u52A8\u6574\u7406\u6700\u65B0\u6B63\u6587\u3002"}</p>
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
        ${jobs.length ? jobs.map((task) => `<div><span>${escapeHtml(task.label)}</span><em class="${task.state}">${escapeHtml(task.state)}</em>${task.state === "queued" || task.state === "running" ? `<button type="button" data-ma11-cancel-task="${escapeHtml(task.id)}">\u53D6\u6D88</button>` : ""}</div>`).join("") : '<p class="ma11-empty">\u6CA1\u6709\u8FD0\u884C\u4E2D\u7684\u4EFB\u52A1\u3002</p>'}
      </div>
    </section>
    <section class="ma11-card ma11-note">
      <b>\u672C\u7248\u67B6\u6784\u539F\u5219</b>
      <p>\u6BCF\u6761AI\u6B63\u6587\u53EA\u521B\u5EFA\u4E00\u4E2A\u552F\u4E00\u4EFB\u52A1\uFF1B\u5BA1\u6838\u3001\u8868\u683C\u3001\u603B\u7ED3\u3001\u540C\u6B65\u5206\u9636\u6BB5\u4FDD\u5B58\u3002\u5355\u4E00\u9636\u6BB5\u5931\u8D25\u65F6\u53EA\u91CD\u8BD5\u8BE5\u9636\u6BB5\uFF0C\u4E0D\u91CD\u65B0\u8C03\u7528\u6574\u6761\u7BA1\u7EBF\u3002</p>
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
  return `
    <section class="ma11-toolbar"><div><h2>\u5206\u5C42\u603B\u7ED3</h2><p>\u5C0F\u603B\u7ED3\u8D1F\u8D23\u5B89\u5168\u6C89\u964D\u5DF2\u7ED3\u675F\u5185\u5BB9\uFF1B\u5927\u603B\u7ED3\u628A\u5DF2\u6D88\u8D39\u7684\u5C0F\u603B\u7ED3\u5185\u63A8\u4E3A\u7D2F\u8BA1\u957F\u671F\u8BB0\u5FC6\u3002</p></div><div class="ma11-actions"><button data-ma11-action="force-small" ${info ? "" : "disabled"}>\u7ACB\u5373\u5C0F\u603B\u7ED3</button><button data-ma11-action="force-large" ${info ? "" : "disabled"}>\u7ACB\u5373\u5927\u603B\u7ED3</button></div></section>
    <div class="ma11-summary-columns">
      <section class="ma11-card"><header><b>\u5C0F\u603B\u7ED3</b><span>${small.length}</span></header>${small.length ? small.slice().reverse().map(
    (item2) => `<article class="ma11-summary"><h3>${escapeHtml(item2.title)}</h3><p>${escapeHtml(item2.summary)}</p>${item2.sedimentation ? `<div class="ma11-summary-settlement"><span>\u5DF2\u5E94\u7528 ${item2.sedimentation.appliedRowIds?.length ?? 0}</span><span>\u4FDD\u62A4/\u5FFD\u7565 ${item2.sedimentation.ignoredRowIds?.length ?? 0}</span></div>` : ""}<small>${escapeHtml(new Date(item2.createdAt).toLocaleString())}</small></article>`
  ).join("") : '<p class="ma11-empty">\u5C1A\u65E0\u5C0F\u603B\u7ED3\u3002</p>'}</section>
      <section class="ma11-card"><header><b>\u5927\u603B\u7ED3</b><span>${large.length}</span></header>${large.length ? large.slice().reverse().map(
    (item2) => `<article class="ma11-summary"><h3>${escapeHtml(item2.title)}</h3><p>${escapeHtml(item2.summary)}</p>${item2.sedimentation ? `<div class="ma11-summary-settlement"><span>\u5DF2\u5E94\u7528 ${item2.sedimentation.appliedRowIds?.length ?? 0}</span><span>\u4FDD\u62A4/\u5FFD\u7565 ${item2.sedimentation.ignoredRowIds?.length ?? 0}</span></div>` : ""}<small>${escapeHtml(new Date(item2.createdAt).toLocaleString())}</small></article>`
  ).join("") : '<p class="ma11-empty">\u5C1A\u65E0\u5927\u603B\u7ED3\u3002</p>'}</section>
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
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="latestContinuityConstant" ${settings.latestContinuityConstant ? "checked" : ""}/><span>\u57FA\u7840\u8BBE\u5B9A\u3001\u5168\u5C40\u6001\u52BF\u3001\u5F53\u524D\u7126\u70B9\u4E0E\u5F53\u524D\u603B\u7ED3\u5E38\u9A7B</span></label>
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
function independentProfilesOptions(selectedId) {
  const profiles = listIndependentApiProfiles();
  const options = profiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${profile.id === selectedId ? "selected" : ""}>${escapeHtml(profile.name)}${profile.model ? ` \xB7 ${escapeHtml(profile.model)}` : ""}</option>`).join("");
  const missing = selectedId && !profiles.some((profile) => profile.id === selectedId) ? `<option value="${escapeHtml(selectedId)}" selected>\u5DF2\u5220\u9664\u7684\u72EC\u7ACBAPI</option>` : "";
  return `<option value="">\u8BF7\u9009\u62E9\u72EC\u7ACBAPI</option>${missing}${options}`;
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
      <option value="independent" ${value.mode === "independent" ? "selected" : ""}>\u955C\u6E0A\u72EC\u7ACBAPI</option>
    </select>
    <select data-ma11-connection-profile-id="${task}" ${value.mode === "profile" ? "" : "hidden disabled"}><option value="">\u8BF7\u9009\u62E9Connection Profile</option>${missingProfile}${profileOptions}</select>
    <select data-ma11-connection-independent="${task}" ${value.mode === "independent" ? "" : "hidden disabled"}>${independentProfilesOptions(value.independentProfileId)}</select>
    <button data-ma11-test="${task}">\u6D4B\u8BD5</button>
  </div>`;
}
function independentApiProfilesHtml() {
  const profiles = listIndependentApiProfiles();
  const cards = profiles.map((profile) => {
    const hasKey = Boolean(getSessionApiKey(profile.id));
    const listId = `ma11-models-${profile.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const modelOptions = profile.cachedModels.map((model) => `<option value="${escapeHtml(model)}"></option>`).join("");
    return `<article class="ma11-api-profile" data-ma11-api-profile="${escapeHtml(profile.id)}">
      <header><b>${escapeHtml(profile.name)}</b><span class="ma11-badge ${hasKey ? "success" : "warning"}">${hasKey ? "\u5BC6\u94A5\u5DF2\u8F7D\u5165\u672C\u6807\u7B7E\u9875" : "\u672A\u586B\u5199\u4F1A\u8BDD\u5BC6\u94A5"}</span></header>
      <div class="ma11-api-profile-grid">
        <label>\u914D\u7F6E\u540D\u79F0<input data-ma11-api-profile-id="${escapeHtml(profile.id)}" data-ma11-api-profile-field="name" value="${escapeHtml(profile.name)}" maxlength="120" /></label>
        <label>\u63A5\u53E3\u7C7B\u578B<select disabled><option>OpenAI\u517C\u5BB9\uFF08ST\u540E\u7AEF\u4EE3\u7406\uFF09</option></select></label>
        <label class="ma11-api-wide">API\u5730\u5740<input data-ma11-api-profile-id="${escapeHtml(profile.id)}" data-ma11-api-profile-field="apiUrl" value="${escapeHtml(profile.apiUrl)}" placeholder="https://api.example.com/v1" /></label>
        <label class="ma11-api-wide">API\u5BC6\u94A5\uFF08\u4EC5\u5F53\u524D\u6807\u7B7E\u9875\uFF09<input type="password" autocomplete="off" data-ma11-api-key="${escapeHtml(profile.id)}" value="" placeholder="${hasKey ? "\u5DF2\u4FDD\u5B58\u4E8E\u5F53\u524D\u6807\u7B7E\u9875\uFF1B\u7559\u7A7A\u4E0D\u53D8" : "\u8F93\u5165\u540E\u4EC5\u4FDD\u5B58\u5728 sessionStorage"}" /></label>
        <label>\u6A21\u578B<input list="${listId}" data-ma11-api-profile-id="${escapeHtml(profile.id)}" data-ma11-api-profile-field="model" value="${escapeHtml(profile.model)}" placeholder="\u6A21\u578B\u540D\u79F0" /><datalist id="${listId}">${modelOptions}</datalist></label>
        <label>\u6700\u5927\u8F93\u51FA<input type="number" min="64" max="131072" step="64" data-ma11-api-profile-id="${escapeHtml(profile.id)}" data-ma11-api-profile-field="maxTokens" value="${profile.maxTokens}" /></label>
        <label>\u6E29\u5EA6<input type="number" min="0" max="2" step="0.05" data-ma11-api-profile-id="${escapeHtml(profile.id)}" data-ma11-api-profile-field="temperature" value="${profile.temperature}" /></label>
        <label>Top P<input type="number" min="0" max="1" step="0.05" data-ma11-api-profile-id="${escapeHtml(profile.id)}" data-ma11-api-profile-field="topP" value="${profile.topP}" /></label>
      </div>
      <footer class="ma11-actions">
        <button data-ma11-api-models="${escapeHtml(profile.id)}">\u8BFB\u53D6\u6A21\u578B</button>
        <button data-ma11-api-test="${escapeHtml(profile.id)}">\u6D4B\u8BD5\u914D\u7F6E</button>
        <button class="danger" data-ma11-api-delete="${escapeHtml(profile.id)}">\u5220\u9664</button>
      </footer>
    </article>`;
  }).join("");
  return `<section class="ma11-card ma11-form-card">
    <header><b>\u955C\u6E0A\u72EC\u7ACBAPI\u914D\u7F6E</b><span>\u53C2\u8003\u6210\u719F\u63D2\u4EF6\u7684\u72EC\u7ACB\u69FD\u4F4D\uFF1A\u76F4\u63A5\u7ECFSillyTavern\u540E\u7AEF\u4EE3\u7406\u8BF7\u6C42\uFF0C\u4E0D\u5207\u6362\u5F53\u524D\u804A\u5929\u8FDE\u63A5\u3002</span></header>
    <p class="ma11-help">API\u5730\u5740\u3001\u6A21\u578B\u548C\u53C2\u6570\u4FDD\u5B58\u5728\u955C\u6E0A\u8BBE\u7F6E\u4E2D\uFF1BAPI\u5BC6\u94A5\u9ED8\u8BA4\u53EA\u4FDD\u5B58\u5728\u5F53\u524D\u6D4F\u89C8\u5668\u6807\u7B7E\u9875\uFF0C\u5173\u95ED\u5F53\u524D\u6807\u7B7E\u9875\u540E\u9700\u8981\u91CD\u65B0\u586B\u5199\uFF0C\u907F\u514D\u660E\u6587\u957F\u671F\u5199\u5165\u6269\u5C55\u8BBE\u7F6E\u3002</p>
    <div class="ma11-api-profile-list">${cards || '<p class="ma11-empty">\u5C1A\u672A\u521B\u5EFA\u72EC\u7ACBAPI\u914D\u7F6E\u3002</p>'}</div>
    <div class="ma11-actions"><button data-ma11-action="add-api-profile">\uFF0B \u65B0\u5EFA\u72EC\u7ACBAPI\u914D\u7F6E</button></div>
  </section>`;
}
function settingsHtml() {
  const settings = getSettings();
  return `
    <section class="ma11-card ma11-form-card">
      <header><b>\u4EFB\u52A1\u6A21\u578B\u5206\u914D</b><span>\u4E09\u79CD\u65B9\u5F0F\u5747\u4E0D\u4F1A\u518D\u901A\u8FC7DOM\u4E34\u65F6\u5207\u6362\u9152\u9986\u5168\u5C40\u8FDE\u63A5\u3002</span></header>
      ${connectionBlock("audit", "\u89C4\u5219\u5BA1\u6838")}
      ${connectionBlock("revision", "\u5B9A\u5411\u4FEE\u6B63")}
      ${connectionBlock("state", "\u72B6\u6001\u8868")}
      ${connectionBlock("smallSummary", "\u5C0F\u603B\u7ED3")}
      ${connectionBlock("largeSummary", "\u5927\u603B\u7ED3")}
      <p class="ma11-help">ST\u539F\u751F Profile \u4F7F\u7528 ConnectionManagerRequestService\uFF0C\u5E76\u5F3A\u5236\u5173\u95ED\u89D2\u8272\u9884\u8BBE\u4E0E Instruct\uFF1B\u72EC\u7ACBAPI\u76F4\u63A5\u901A\u8FC7\u9152\u9986\u540E\u7AEF\u4EE3\u7406\u53D1\u9001\u3002\u8FDE\u63A5\u9519\u8BEF\u4E0EJSON\u7ED3\u6784\u9519\u8BEF\u4F1A\u5206\u522B\u62A5\u544A\u3002</p>
    </section>
    ${independentApiProfilesHtml()}
    <section class="ma11-card ma11-form-card">
      <header><b>\u81EA\u52A8\u5316</b></header>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="enabled" ${settings.enabled ? "checked" : ""}/><span>\u542F\u7528\u955C\u6E0A</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoState" ${settings.autoState ? "checked" : ""}/><span>\u6BCF\u6761\u65B0AI\u6B63\u6587\u81EA\u52A8\u6574\u7406\u8868\u683C</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="showMessagePanel" ${settings.showMessagePanel ? "checked" : ""}/><span>\u5728\u6B63\u6587\u4E0B\u663E\u793A\u72B6\u6001\u6761</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoSmallSummary" ${settings.autoSmallSummary ? "checked" : ""}/><span>\u81EA\u52A8\u5C0F\u603B\u7ED3</span></label>
      <label>\u5C0F\u603B\u7ED3\u56DE\u5408\u6570<input type="number" min="1" max="100" data-ma11-setting="smallSummaryTurns" value="${settings.smallSummaryTurns}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoLargeSummary" ${settings.autoLargeSummary ? "checked" : ""}/><span>\u81EA\u52A8\u5927\u603B\u7ED3</span></label>
      <label>\u5927\u603B\u7ED3\u6240\u9700\u5C0F\u603B\u7ED3\u6570<input type="number" min="1" max="30" data-ma11-setting="largeSummaryCount" value="${settings.largeSummaryCount}" /></label>
      <label>\u6A21\u578B\u8BF7\u6C42\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09<input type="number" min="10000" max="300000" step="1000" data-ma11-setting="requestTimeoutMs" value="${settings.requestTimeoutMs}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="repairInvalidJsonOnce" ${settings.repairInvalidJsonOnce ? "checked" : ""}/><span>\u7ED3\u6784\u8F93\u51FA\u65E0\u6CD5\u672C\u5730\u89E3\u6790\u65F6\uFF0C\u5141\u8BB8\u4E00\u6B21\u4E13\u7528JSON\u683C\u5F0F\u4FEE\u590D</span></label>
      <p class="ma11-help">\u683C\u5F0F\u4FEE\u590D\u53EA\u6574\u7406\u539F\u59CB\u8FD4\u56DE\uFF0C\u4E0D\u91CD\u65B0\u6267\u884C\u5BA1\u6838\u3001\u72B6\u6001\u63D0\u53D6\u6216\u603B\u7ED3\uFF1B\u5931\u8D25\u65F6\u4F1A\u663E\u793A\u5B9E\u9645\u4F7F\u7528\u7684\u8FDE\u63A5\u914D\u7F6E\u4E0E\u8FD4\u56DE\u7247\u6BB5\u3002</p>
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
                <b>\u672C\u5730\u603B\u7ED3\u63D0\u4EA4 \xB7 ${escapeHtml(record.operation)}</b>
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
    <section class="ma11-card"><header><b>\u6062\u590D\u4E0E\u7EF4\u62A4</b><span>${escapeHtml(info?.artifact.chatKey.slice(-10) || chatKey.slice(-10))}</span></header><p class="ma11-help">\u5BFC\u51FA\u5305\u5305\u542B\u5F53\u524D\u804A\u5929\u7684\u72B6\u6001\u3001\u4E16\u754C\u4E66\u4E8B\u52A1\u3001\u672C\u5730\u63D0\u4EA4\u65E5\u5FD7\u3001\u64CD\u4F5C\u65E5\u5FD7\u548C\u8FC1\u79FB\u5907\u4EFD\uFF1B\u4E0D\u5305\u542B API \u5BC6\u94A5\u3002\u6E05\u7406\u53EA\u5220\u9664\u8D85\u8FC7\u4FDD\u7559\u6570\u91CF\u7684\u5DF2\u5B8C\u6210\u5386\u53F2\uFF0C\u4E0D\u5220\u9664\u672A\u89E3\u51B3\u4E8B\u52A1\u3002</p><div class="ma11-actions"><button data-ma11-action="export-recovery">\u5BFC\u51FA\u6062\u590D\u5305</button><button data-ma11-action="cleanup-recovery">\u6E05\u7406\u5DF2\u5B8C\u6210\u5386\u53F2</button>${chatState.historyRebuild ? `<button data-ma11-action="retry-history-rebuild">\u6062\u590D\u603B\u7ED3\u4F9D\u8D56</button>` : ""}</div></section>
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
    if (settings.ui.activeTab === "overview")
      content.innerHTML = overviewHtml(info);
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
  const independentTask = target.dataset.ma11ConnectionIndependent;
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
  if (independentTask) settings.connections[independentTask].independentProfileId = safeText(target.value, 160).trim();
  saveSettings();
  if (shouldRender) void renderWorkspace();
}
function updateIndependentProfileField(target) {
  const profileId = target.dataset.ma11ApiProfileId;
  const field = target.dataset.ma11ApiProfileField;
  if (!profileId || !field) return;
  const numericFields = /* @__PURE__ */ new Set(["maxTokens", "temperature", "topP"]);
  updateIndependentApiProfile(profileId, {
    [field]: numericFields.has(field) ? Number(target.value) : target.value
  });
}
function bindWorkspace(workspace) {
  workspace.addEventListener("click", async (event) => {
    const target = event.target;
    const tab = target.closest("[data-ma11-tab]")?.dataset.ma11Tab;
    if (tab) return setTab(tab);
    const action = target.closest("[data-ma11-action]")?.dataset.ma11Action;
    try {
      if (action === "close") workspace.hidden = true;
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
        toast(rebuilt ? "success" : "info", rebuilt ? "\u603B\u7ED3\u3001\u72B6\u6001\u4E0E\u4E16\u754C\u4E66\u4F9D\u8D56\u5DF2\u91CD\u5EFA" : "\u5F53\u524D\u804A\u5929\u6CA1\u6709\u5F85\u6062\u590D\u7684\u5386\u53F2\u4F9D\u8D56");
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
      if (action === "add-api-profile") {
        createIndependentApiProfile();
        await renderWorkspace();
      }
      const cancelTaskId = target.closest("[data-ma11-cancel-task]")?.dataset.ma11CancelTask;
      if (cancelTaskId) {
        const cancelled = taskQueue.cancel(cancelTaskId, "\u7528\u6237\u4ECE\u5DE5\u4F5C\u53F0\u53D6\u6D88\u4EFB\u52A1");
        toast(cancelled ? "success" : "warning", cancelled ? "\u5DF2\u53D1\u9001\u53D6\u6D88\u8BF7\u6C42" : "\u4EFB\u52A1\u5DF2\u7ED3\u675F\u6216\u4E0D\u5B58\u5728");
        await renderWorkspace();
      }
      const apiDeleteId = target.closest("[data-ma11-api-delete]")?.dataset.ma11ApiDelete;
      if (apiDeleteId) {
        const profile = getIndependentApiProfile(apiDeleteId);
        if (confirm(`\u786E\u5B9A\u5220\u9664\u72EC\u7ACBAPI\u201C${profile?.name || "\u672A\u547D\u540D"}\u201D\u5417\uFF1F`)) {
          deleteIndependentApiProfile(apiDeleteId);
          await renderWorkspace();
        }
      }
      const apiModelsId = target.closest("[data-ma11-api-models]")?.dataset.ma11ApiModels;
      if (apiModelsId) {
        const models = await fetchIndependentModels(apiModelsId, getSettings().requestTimeoutMs);
        toast("success", `\u8BFB\u53D6\u5230 ${models.length} \u4E2A\u6A21\u578B`);
        await renderWorkspace();
      }
      const apiTestId = target.closest("[data-ma11-api-test]")?.dataset.ma11ApiTest;
      if (apiTestId) {
        const profile = getIndependentApiProfile(apiTestId);
        if (!profile) throw new Error("\u72EC\u7ACBAPI\u914D\u7F6E\u4E0D\u5B58\u5728");
        const started = performance.now();
        const raw = await requestIndependentApi(apiTestId, {
          messages: [
            { role: "system", content: "\u4F60\u662FAPI\u7ED3\u6784\u6D4B\u8BD5\u5668\u3002\u7981\u6B62\u89E3\u91CA\u3001Markdown\u548C\u601D\u8003\u6807\u7B7E\u3002" },
            { role: "user", content: '\u53EA\u8F93\u51FA\u8FD9\u4E2AJSON\u5BF9\u8C61\uFF1A{"ok":true,"source":"mirror-abyss"}' }
          ],
          timeoutMs: getSettings().requestTimeoutMs,
          maxTokens: 128,
          temperature: 0
        });
        let structured = false;
        try {
          const parsed = JSON.parse(raw.trim());
          structured = parsed?.ok === true && parsed?.source === "mirror-abyss";
        } catch {
        }
        toast(structured ? "success" : "warning", `${profile.name}\u8FDE\u63A5\u6210\u529F\uFF0C${structured ? "\u7ED3\u6784\u8F93\u51FA\u6B63\u5E38" : `\u4F46\u7ED3\u6784\u6D4B\u8BD5\u5931\u8D25\uFF1A${raw.replace(/\s+/g, " ").slice(0, 120)}`}\uFF08${Math.round(performance.now() - started)}ms\uFF09`);
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
        const detail = `${result.method}\uFF1B\u8017\u65F6${result.elapsedMs}ms\uFF1B\u8FDE\u63A5${result.connected ? "\u6210\u529F" : "\u5931\u8D25"}\uFF1BJSON${result.jsonValid ? "\u6709\u6548" : "\u65E0\u6548"}\uFF1B\u7CBE\u786E\u9075\u5FAA${result.instructionFollowed ? "\u901A\u8FC7" : "\u672A\u901A\u8FC7"}`;
        toast(result.instructionFollowed ? "success" : "warning", result.instructionFollowed ? detail : `${detail}\uFF1B\u8FD4\u56DE\uFF1A${result.responsePreview}`);
      }
    } catch (error) {
      toast("error", toErrorMessage(error));
    }
  });
  workspace.addEventListener("change", (event) => {
    const target = event.target;
    if (target.dataset.ma11Setting) updateSetting(target);
    if (target.dataset.ma11ConnectionMode || target.dataset.ma11ConnectionProfileId || target.dataset.ma11ConnectionIndependent) updateConnection(target);
    if (target.dataset.ma11ApiProfileField) updateIndependentProfileField(target);
    if (target.dataset.ma11ApiKey) {
      setSessionApiKey(target.dataset.ma11ApiKey, target.value.trim());
      target.value = "";
      void renderWorkspace();
    }
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
    if (target.dataset.ma11ConnectionProfileId || target.dataset.ma11ConnectionIndependent) updateConnection(target);
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
        <span class="ma11-badge ${tone(artifact.stages.audit)}">\u5BA1\u6838 ${stageLabel(artifact.stages.audit)}</span>
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
function mountOptionalTopButton() {
  const settings = getSettings();
  unmountOptionalTopButton();
  if (!settings.showTopButton) return;
  const candidates = ["#top-settings-holder", "#rightNavHolder", "#top-bar", "#top-bar-left"];
  const host = candidates.map((selector) => document.querySelector(selector)).find(Boolean);
  if (!host) return;
  const button = document.createElement("button");
  button.id = "ma11-top-button";
  button.className = "menu_button ma11-top-button fa-solid fa-table-list";
  button.type = "button";
  button.title = "\u6253\u5F00\u955C\u6E0A";
  button.setAttribute("aria-label", "\u6253\u5F00\u955C\u6E0A");
  button.addEventListener("click", () => openWorkspace("overview"));
  host.appendChild(button);
}
function unmountOptionalTopButton() {
  document.querySelector("#ma11-top-button")?.remove();
}

// src/migration/legacy-migration.ts
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
  connectionBroker.cancelAll(reason);
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
