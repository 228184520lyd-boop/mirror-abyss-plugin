// src/constants.ts
var MODULE_NAME = "mirrorAbyssV11";
var LEGACY_MODULE_NAME = "mirrorAbyss";
var DISPLAY_NAME = "\u955C\u6E0A";
var VERSION = "1.2.0-rc.18";
var PIPELINE_VERSION = "ma-pipeline-21";
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
  autoSmallSummary: true,
  smallSummaryTurns: 12,
  autoLargeSummary: true,
  largeSummaryCount: 4,
  lorebookSync: true,
  autoCreateLorebook: true,
  lorebookName: "",
  vectorizeRows: false,
  latestContinuityConstant: true,
  lorebookLayout: "semantic",
  repairInvalidJsonOnce: true,
  requestTimeoutMs: 9e4,
  connections: {
    audit: { mode: "current", profileId: "", profile: "" },
    revision: { mode: "current", profileId: "", profile: "" },
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
    let settled = false;
    let timer;
    const cleanup = () => {
      if (timer !== void 0) window.clearTimeout(timer);
      controller?.signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const error = new Error(`${label}\u5DF2\u53D6\u6D88`);
      error.name = "AbortError";
      reject(error);
    };
    if (controller?.signal.aborted) {
      onAbort();
      return;
    }
    controller?.signal.addEventListener("abort", onAbort, { once: true });
    timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      controller?.abort();
      reject(new Error(`${label}\u8D85\u65F6\uFF08${Math.round(ms / 1e3)}\u79D2\uFF09`));
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
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
  const uniqueCandidates = [...new Set(candidates.map((item) => item.trim()).filter(Boolean))];
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
  const savedProfiles = Array.isArray(context.extensionSettings?.connectionManager?.profiles) ? context.extensionSettings.connectionManager.profiles : [];
  for (const connection of Object.values(settings.connections ?? {})) {
    connection.profileId ||= "";
    connection.profile ||= "";
    if (connection.mode === "independent") connection.mode = "current";
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
    auditFailAction: legacy.ruleAuditFailAction === "withdraw" ? "hide" : "mark",
    revisionPrompt: safeText(legacy.revisionPrompt ?? ""),
    maxRevisionAttempts: Number(legacy.maxRevisionAttempts) || 1,
    stopOnRepeatedViolation: legacy.stopOnRepeatedViolation ?? true,
    revisionFallbackAction: legacy.revisionFallbackAction === "mark" ? "mark" : "hide",
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
      audit: { mode: legacy.auditProfile ? "profile" : "current", profileId: "", profile: safeText(legacy.auditProfile ?? "", 120) },
      revision: { mode: legacy.revisionProfile ? "profile" : "current", profileId: "", profile: safeText(legacy.revisionProfile ?? legacy.auditProfile ?? "", 120) },
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
function isProcessableAssistantMessage(message) {
  return Boolean(
    message && message.is_user === false && message.is_system !== true && message.extra?.type !== "system" && safeText(message.mes).trim()
  );
}
function latestAssistantIndex() {
  const chat = getChat();
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    if (isProcessableAssistantMessage(chat[i])) return i;
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
function currentChatKey() {
  const context = getContext();
  const chatId = context.getCurrentChatId?.() ?? context.chatId ?? context.chat_metadata?.chat_id ?? "";
  const scope = context.groupId ? `group:${context.groupId}` : `character:${context.characterId ?? context.name2 ?? "unknown"}`;
  const seed = `${scope}|${chatId || context.name1 || "chat"}|${context.name2 || ""}`;
  return `${scope}:${hashText(seed)}`;
}
function messageFingerprint(index) {
  const message = getMessage(index);
  return hashText(`${previousUserText(index)}
---MA11---
${safeText(message?.mes)}`);
}
function messageIdentity(index) {
  const message = getMessage(index);
  const stable = message?.id ?? message?.send_date ?? message?.extra?.gen_id ?? index;
  return `${String(stable)}:${messageFingerprint(index)}`;
}
function getChatMetadataNamespace() {
  const context = getContext();
  context.chatMetadata ||= {};
  context.chatMetadata[MODULE_NAME] ||= {
    schemaVersion: 1,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  return context.chatMetadata[MODULE_NAME];
}
function toast(kind, message) {
  const toastr = globalThis.toastr;
  if (toastr?.[kind]) toastr[kind](message, DISPLAY_NAME);
  else console[kind === "error" ? "error" : "log"](`[${DISPLAY_NAME}] ${message}`);
}

// src/core/commit-guard.ts
var historyRevisions = /* @__PURE__ */ new Map();
var artifactHistoryRevisions = /* @__PURE__ */ new WeakMap();
var artifactTaskGuards = /* @__PURE__ */ new WeakMap();
var CommitRejectedError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CommitRejectedError";
  }
};
function assertChatCommitCurrent(chatKey, message = "\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u672C\u6B21\u7ED3\u679C\u4E0D\u518D\u5199\u5165") {
  if (currentChatKey() !== chatKey) {
    throw new CommitRejectedError(message);
  }
}
async function persistChatFor(chatKey) {
  assertChatCommitCurrent(chatKey);
  const context = getContext();
  assertChatCommitCurrent(chatKey);
  if (typeof context.saveChat === "function") {
    await context.saveChat.call(context);
  } else if (typeof context.saveChatConditional === "function") {
    await context.saveChatConditional.call(context);
  }
  assertChatCommitCurrent(chatKey);
}
async function persistMetadataFor(chatKey) {
  assertChatCommitCurrent(chatKey, "\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u672C\u6B21\u5143\u6570\u636E\u4E0D\u518D\u5199\u5165");
  const context = getContext();
  assertChatCommitCurrent(chatKey, "\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u672C\u6B21\u5143\u6570\u636E\u4E0D\u518D\u5199\u5165");
  if (typeof context.saveMetadata === "function") {
    await context.saveMetadata.call(context);
  } else {
    context.saveMetadataDebounced?.call(context);
  }
  assertChatCommitCurrent(chatKey, "\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u672C\u6B21\u5143\u6570\u636E\u4E0D\u518D\u5199\u5165");
}
function currentHistoryRevision(chatKey) {
  return historyRevisions.get(chatKey) ?? 0;
}
function invalidateHistoryRevision(chatKey) {
  const next = currentHistoryRevision(chatKey) + 1;
  historyRevisions.set(chatKey, next);
  return next;
}
function assertHistoryRevisionCurrent(chatKey, expectedRevision) {
  if (currentHistoryRevision(chatKey) !== expectedRevision) {
    throw new CommitRejectedError("\u5386\u53F2\u6D88\u606F\u5DF2\u7ECF\u53D8\u5316\uFF0C\u672C\u6B21\u65E7\u4EFB\u52A1\u7ED3\u679C\u4E0D\u518D\u5199\u5165");
  }
}
function bindArtifactHistoryRevision(artifact, revision) {
  artifactHistoryRevisions.set(artifact, revision);
}
function unbindArtifactHistoryRevision(artifact, revision) {
  if (revision === void 0 || artifactHistoryRevisions.get(artifact) === revision) {
    artifactHistoryRevisions.delete(artifact);
  }
}
function bindArtifactTaskGuard(artifact, guard) {
  artifactTaskGuards.set(artifact, guard);
}
function unbindArtifactTaskGuard(artifact, guard) {
  if (!guard || artifactTaskGuards.get(artifact) === guard) artifactTaskGuards.delete(artifact);
}
function assertArtifactCommitCurrent(artifact) {
  artifactTaskGuards.get(artifact)?.assertCurrent();
  const expectedRevision = artifactHistoryRevisions.get(artifact);
  if (expectedRevision !== void 0) {
    assertHistoryRevisionCurrent(artifact.chatKey, expectedRevision);
  }
  assertChatCommitCurrent(artifact.chatKey);
  const message = getMessage(artifact.messageIndex);
  if (!message || message.is_user) {
    throw new CommitRejectedError("\u539FAI\u6B63\u6587\u5DF2\u4E0D\u5B58\u5728\uFF0C\u8BF7\u91CD\u65B0\u6574\u7406");
  }
  if (messageFingerprint(artifact.messageIndex) !== artifact.sourceFingerprint) {
    throw new CommitRejectedError("\u6B63\u6587\u5DF2\u7ECF\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u6574\u7406");
  }
}

// src/storage/repository.ts
function emptyChatState(chatKey) {
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
async function putArtifact(_artifact) {
}
async function getChatState(chatKey) {
  assertChatCommitCurrent(chatKey, "\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u4E0D\u8BFB\u53D6\u65E7\u804A\u5929\u72B6\u6001");
  const namespace = getChatMetadataNamespace();
  const current = namespace.state;
  if (!current || current.chatKey !== chatKey) {
    namespace.state = emptyChatState(chatKey);
  }
  return namespace.state;
}
async function putChatState(state2) {
  assertChatCommitCurrent(state2.chatKey, "\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u4E0D\u5199\u5165\u65E7\u804A\u5929\u72B6\u6001");
  state2.updatedAt = nowIso();
  const namespace = getChatMetadataNamespace();
  namespace.state = state2;
  namespace.updatedAt = state2.updatedAt;
  await persistMetadataFor(state2.chatKey);
}
async function clearAllStorage(chatKey = currentChatKey()) {
  assertChatCommitCurrent(chatKey, "\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u4E0D\u6E05\u7406\u65E7\u804A\u5929\u72B6\u6001");
  const namespace = getChatMetadataNamespace();
  delete namespace.state;
  delete namespace.lorebookName;
  namespace.updatedAt = nowIso();
  await persistMetadataFor(chatKey);
}

// src/core/requests.ts
var activeControllers = /* @__PURE__ */ new Set();
var acceptingRequests = true;
function setRequestAcceptance(accepting) {
  acceptingRequests = accepting;
}
function beginModelRequest() {
  if (!acceptingRequests) throw new Error("\u955C\u6E0A\u5DF2\u7981\u7528\uFF0C\u4E0D\u518D\u63A5\u53D7\u65B0\u8BF7\u6C42");
  const controller = new AbortController();
  activeControllers.add(controller);
  return controller;
}
function finishModelRequest(controller) {
  activeControllers.delete(controller);
}
function abortActiveRequests() {
  for (const controller of activeControllers) controller.abort();
  activeControllers.clear();
}

// src/domain/artifact.ts
function idleStage() {
  return { status: "idle", attempts: 0 };
}
function createArtifact(message, messageIndex) {
  const now = nowIso();
  return {
    schemaVersion: 1,
    chatKey: currentChatKey(),
    messageKey: messageIdentity(messageIndex),
    messageIndex,
    sourceFingerprint: messageFingerprint(messageIndex),
    playerText: previousUserText(messageIndex),
    assistantText: safeText(message.mes),
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

// src/domain/history.ts
function firstInconsistentArtifactIndex(chat, moduleName, identityAt, fingerprintAt) {
  return chat.findIndex((message, index) => {
    const artifact = message?.extra?.[moduleName];
    return Boolean(
      artifact && (artifact.messageIndex !== index || artifact.messageKey !== identityAt(index) || artifact.sourceFingerprint !== fingerprintAt(index))
    );
  });
}

// src/llm/request-scheduler.ts
var REQUEST_PRIORITIES = {
  audit: 100,
  revision: 100,
  state: 90,
  smallSummary: 30,
  largeSummary: 10
};
function abortError(message = "\u6A21\u578B\u8BF7\u6C42\u5DF2\u53D6\u6D88") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
var RequestLaneScheduler = class _RequestLaneScheduler {
  static MAX_TRACES = 200;
  lanes = /* @__PURE__ */ new Map();
  traces = /* @__PURE__ */ new Map();
  sequence = 0;
  list() {
    return [...this.traces.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  clearHistory() {
    for (const [id, trace] of this.traces) {
      if (!["queued", "running"].includes(String(trace.state))) this.traces.delete(id);
    }
  }
  prune() {
    while (this.traces.size > _RequestLaneScheduler.MAX_TRACES) {
      const removable = [...this.traces.entries()].find(([, trace]) => !["queued", "running"].includes(String(trace.state)));
      if (!removable) break;
      this.traces.delete(removable[0]);
    }
  }
  lane(name) {
    let state2 = this.lanes.get(name);
    if (!state2) {
      state2 = { active: null, pending: [] };
      this.lanes.set(name, state2);
    }
    return state2;
  }
  selectNext(state2) {
    if (!state2.pending.length) return null;
    let selectedIndex = 0;
    for (let index = 1; index < state2.pending.length; index += 1) {
      const candidate = state2.pending[index];
      const selected = state2.pending[selectedIndex];
      if (candidate.priority > selected.priority || candidate.priority === selected.priority && candidate.sequence < selected.sequence) selectedIndex = index;
    }
    return state2.pending.splice(selectedIndex, 1)[0] ?? null;
  }
  pump(laneName) {
    const state2 = this.lane(laneName);
    if (state2.active) return;
    const job = this.selectNext(state2);
    if (!job) {
      if (!state2.pending.length) this.lanes.delete(laneName);
      return;
    }
    if (job.signal.aborted) {
      job.signal.removeEventListener("abort", job.abortListener);
      job.trace.state = "cancelled";
      job.trace.error = "\u6A21\u578B\u8BF7\u6C42\u5DF2\u53D6\u6D88";
      job.trace.finishedAt = nowIso();
      job.trace.transportWaitMs = Math.max(0, Date.now() - job.createdMs);
      job.trace.totalMs = job.trace.transportWaitMs;
      job.reject(abortError());
      this.prune();
      this.pump(laneName);
      return;
    }
    state2.active = job;
    const startedMs = Date.now();
    job.trace.state = "running";
    job.trace.startedAt = nowIso();
    job.trace.transportWaitMs = Math.max(0, startedMs - job.createdMs);
    void job.work().then((result) => {
      job.trace.state = "success";
      job.resolve(result);
    }).catch((error) => {
      job.trace.state = error instanceof Error && error.name === "AbortError" ? "cancelled" : "failed";
      job.trace.error = toErrorMessage(error);
      job.reject(error);
    }).finally(() => {
      const finishedMs = Date.now();
      job.signal.removeEventListener("abort", job.abortListener);
      job.trace.finishedAt = nowIso();
      job.trace.requestMs = Math.max(0, finishedMs - startedMs);
      job.trace.totalMs = Math.max(0, finishedMs - job.createdMs);
      state2.active = null;
      this.prune();
      this.pump(laneName);
    });
  }
  run(laneName, task, signal, work) {
    if (signal.aborted) return Promise.reject(abortError());
    const createdMs = Date.now();
    const id = makeId("request");
    const trace = {
      id,
      lane: laneName,
      task,
      state: "queued",
      createdAt: nowIso(),
      transportWaitMs: 0,
      requestMs: 0,
      totalMs: 0,
      firstByteMs: void 0,
      streamMode: "off"
    };
    this.traces.set(id, trace);
    let resolve;
    let reject;
    const promise = new Promise((resolveValue, rejectValue) => {
      resolve = resolveValue;
      reject = rejectValue;
    });
    const state2 = this.lane(laneName);
    const job = {
      id,
      lane: laneName,
      task,
      priority: REQUEST_PRIORITIES[task],
      sequence: this.sequence += 1,
      createdMs,
      signal,
      work,
      resolve,
      reject,
      trace,
      abortListener: () => {
        if (state2.active === job) return;
        const index = state2.pending.indexOf(job);
        if (index < 0) return;
        state2.pending.splice(index, 1);
        trace.state = "cancelled";
        trace.error = "\u6A21\u578B\u8BF7\u6C42\u5DF2\u53D6\u6D88";
        trace.finishedAt = nowIso();
        trace.transportWaitMs = Math.max(0, Date.now() - createdMs);
        trace.totalMs = trace.transportWaitMs;
        signal.removeEventListener("abort", job.abortListener);
        reject(abortError());
        this.prune();
        this.pump(laneName);
      }
    };
    signal.addEventListener("abort", job.abortListener, { once: true });
    state2.pending.push(job);
    this.prune();
    this.pump(laneName);
    return promise;
  }
};
var requestScheduler = new RequestLaneScheduler();

// src/llm/generator.ts
var TASK_RESPONSE_TOKENS = {
  audit: 1800,
  revision: 4096,
  state: 4096,
  smallSummary: 2400,
  largeSummary: 3200
};
function responseTokens(options) {
  const requested = Number(options.maxTokens);
  if (Number.isFinite(requested) && requested > 0) {
    return Math.max(128, Math.min(32768, Math.round(requested)));
  }
  return TASK_RESPONSE_TOKENS[options.task];
}
function textFromValue(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}
function generationText(result) {
  if (typeof result === "string") return result.trim();
  const envelopeKeys = ["content", "text", "output", "result", "value", "pipe"];
  for (const key of envelopeKeys) {
    const text = textFromValue(result?.[key]);
    if (text) return text;
  }
  for (const value of [
    result?.message?.content,
    result?.choices?.[0]?.message?.content,
    result?.choices?.[0]?.text
  ]) {
    const text = textFromValue(value);
    if (text) return text;
  }
  const hasEnvelope = Boolean(
    result && typeof result === "object" && (envelopeKeys.some((key) => key in result) || "message" in result || "choices" in result)
  );
  return hasEnvelope ? "" : textFromValue(result) || safeText(result, 2e5).trim();
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
function profileApiMode(profileId) {
  const context = getContext();
  const profile = supportedProfiles().find((item) => item?.id === profileId);
  const selected = context.CONNECT_API_MAP?.[profile?.api]?.selected;
  return selected === "openai" || selected === "textgenerationwebui" ? selected : "";
}
function messagesFromOptions(options) {
  const messages = [];
  if (options.systemPrompt.trim()) messages.push({ role: "system", content: options.systemPrompt });
  if (Array.isArray(options.prompt)) {
    for (const item of options.prompt) {
      const role = safeText(item?.role, 30).trim() || "user";
      const content = safeText(item?.content, 2e5);
      if (content.trim()) messages.push({ role, content });
    }
  } else {
    messages.push({ role: "user", content: options.prompt });
  }
  return messages;
}
async function generateCurrent(options, controller) {
  const context = getContext();
  if (typeof context.generateRaw !== "function") throw new Error("\u5F53\u524DSillyTavern\u672A\u63D0\u4F9BgenerateRaw");
  const settings = getSettings();
  const result = await withTimeout(
    Promise.resolve(context.generateRaw({
      systemPrompt: options.systemPrompt,
      prompt: options.prompt,
      jsonSchema: options.jsonSchema,
      responseLength: responseTokens(options),
      signal: options.signal
    })),
    Math.max(1e4, Number(settings.requestTimeoutMs) || 9e4),
    `${options.task}\u6A21\u578B\u8C03\u7528`,
    controller
  );
  const text = generationText(result);
  if (!text) throw new Error(`${options.task}\u6A21\u578B\u8FD4\u56DE\u4E3A\u7A7A`);
  return text;
}
async function generateWithNativeProfile(options, profileId, controller) {
  const context = getContext();
  const service = context.ConnectionManagerRequestService;
  if (typeof service?.sendRequest !== "function") {
    throw new Error("\u5F53\u524DSillyTavern\u672A\u63D0\u4F9BConnectionManagerRequestService");
  }
  const settings = getSettings();
  const messages = messagesFromOptions(options);
  const overridePayload = { stream: false };
  if (options.jsonSchema && profileApiMode(profileId) === "openai") {
    overridePayload.json_schema = options.jsonSchema;
  }
  const result = await withTimeout(
    Promise.resolve(service.sendRequest(
      profileId,
      messages,
      responseTokens(options),
      {
        stream: false,
        extractData: true,
        includePreset: false,
        includeInstruct: false,
        signal: options.signal
      },
      overridePayload
    )),
    Math.max(1e4, Number(settings.requestTimeoutMs) || 9e4),
    `${options.task} Connection Profile\u8BF7\u6C42`,
    controller
  );
  const text = generationText(result);
  if (!text) throw new Error(`${options.task} Connection Profile\u8FD4\u56DE\u4E3A\u7A7A`);
  return text;
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
    const profile = listSupportedConnectionProfiles().find((item) => item.id === id);
    return `Connection Profile\uFF1A${profile?.name || cleanProfileName(connection.profile) || "\u672A\u9009\u62E9"}`;
  }
  return "\u5F53\u524D\u804A\u5929\u8FDE\u63A5";
}
async function generateTask(options) {
  const controller = beginModelRequest();
  const externalSignal = options.signal;
  const forwardAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) forwardAbort();
  else externalSignal?.addEventListener("abort", forwardAbort, { once: true });
  try {
    const request = { ...options, signal: controller.signal };
    const connection = getSettings().connections[options.task];
    const profileId = connection?.mode === "profile" ? resolveProfileId(connection) : "";
    const lane = connection?.mode === "profile" ? `profile:${profileId || "unselected"}` : "current-chat";
    return await requestScheduler.run(lane, options.task, controller.signal, async () => {
      if (connection?.mode === "profile") {
        if (!profileId) throw new Error(`${options.task}\u672A\u9009\u62E9\u6709\u6548\u7684Connection Profile`);
        return generateWithNativeProfile(request, profileId, controller);
      }
      return generateCurrent(request, controller);
    });
  } finally {
    externalSignal?.removeEventListener("abort", forwardAbort);
    finishModelRequest(controller);
  }
}
function requestTraceReport() {
  return requestScheduler.list();
}
async function testConnection(task) {
  const started = performance.now();
  let raw = "";
  const request = {
    task,
    systemPrompt: "\u4F60\u662FAPI\u7ED3\u6784\u6D4B\u8BD5\u5668\u3002\u7981\u6B62\u89E3\u91CA\u3001\u7981\u6B62Markdown\u3001\u7981\u6B62\u601D\u8003\u6807\u7B7E\u3002",
    prompt: '\u53EA\u8F93\u51FA\u8FD9\u4E2AJSON\u5BF9\u8C61\uFF1A{"ok":true,"source":"mirror-abyss"}',
    maxTokens: 256,
    jsonSchema: {
      name: "MirrorAbyssConnectionTest",
      description: "\u955C\u6E0A\u539F\u751F\u8FDE\u63A5\u7ED3\u6784\u5316\u8F93\u51FA\u6D4B\u8BD5",
      strict: true,
      value: {
        $schema: "http://json-schema.org/draft-04/schema#",
        type: "object",
        required: ["ok", "source"],
        properties: {
          ok: { type: "boolean" },
          source: { type: "string" }
        },
        additionalProperties: false
      }
    }
  };
  let schemaFailure;
  try {
    raw = await generateTask(request);
    if (raw.trim() === "{}") {
      schemaFailure = new Error("\u7ED3\u6784\u5316\u8F93\u51FA\u8FD4\u56DE\u7A7A\u5BF9\u8C61\uFF0C\u5F53\u524D\u6A21\u578B\u6216\u63A5\u53E3\u53EF\u80FD\u4E0D\u652F\u6301JSON Schema");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    schemaFailure = error;
  }
  if (schemaFailure) {
    try {
      raw = await generateTask({ ...request, jsonSchema: void 0 });
    } catch (fallbackError) {
      if (fallbackError instanceof Error && fallbackError.name === "AbortError") throw fallbackError;
      throw new Error(
        `${describeTaskConnection(task)}\u8FDE\u63A5\u5931\u8D25\u3002\u7ED3\u6784\u5316\u8BF7\u6C42\uFF1A${toErrorMessage(schemaFailure)}\uFF1B\u65E0Schema\u56DE\u9000\uFF1A${toErrorMessage(fallbackError)}`
      );
    }
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
function isCancelledRequest(error) {
  return error instanceof Error && ["AbortError", "CommitRejectedError"].includes(error.name);
}
function structuredError(task, error, raw) {
  const connection = describeTaskConnection(task);
  const preview = error instanceof JsonObjectParseError ? error.preview : jsonPreview(raw);
  const detail = toErrorMessage(error);
  return new Error(`${TASK_LABELS[task]}\u672A\u8FD4\u56DE\u6709\u6548JSON\u7ED3\u6784\uFF08${connection}\uFF09\u3002${detail}${preview ? `\uFF1B\u8FD4\u56DE\u7247\u6BB5\uFF1A${preview}` : ""}`);
}
async function repairStructuredOutput(task, raw, structureDescription) {
  const repaired = await generateTask({
    task,
    systemPrompt: repairSystemPrompt(structureDescription),
    prompt: repairUserPrompt(raw)
  });
  return parseJsonObject(repaired);
}
async function generateWithSchemaFallback(options) {
  let schemaFailure;
  try {
    const raw = await generateTask(options);
    if (!options.jsonSchema || raw.trim() !== "{}") return raw;
    schemaFailure = new Error("\u7ED3\u6784\u5316\u8F93\u51FA\u8FD4\u56DE\u7A7A\u5BF9\u8C61\uFF0C\u5F53\u524D\u6A21\u578B\u6216\u63A5\u53E3\u53EF\u80FD\u4E0D\u652F\u6301JSON Schema");
  } catch (error) {
    if (!options.jsonSchema || isCancelledRequest(error)) throw error;
    schemaFailure = error;
  }
  try {
    return await generateTask({ ...options, jsonSchema: void 0 });
  } catch (fallbackError) {
    if (isCancelledRequest(fallbackError)) throw fallbackError;
    throw new Error(
      `${TASK_LABELS[options.task]}\u8BF7\u6C42\u5931\u8D25\uFF08${describeTaskConnection(options.task)}\uFF09\u3002\u7ED3\u6784\u5316\u8BF7\u6C42\uFF1A${toErrorMessage(schemaFailure)}\uFF1B\u65E0Schema\u56DE\u9000\uFF1A${toErrorMessage(fallbackError)}`
    );
  }
}
async function generateStructuredTask(options) {
  const raw = await generateWithSchemaFallback(options);
  try {
    return parseJsonObject(raw);
  } catch (firstError) {
    const allowRepair = options.allowRepair ?? getSettings().repairInvalidJsonOnce;
    if (!allowRepair) throw structuredError(options.task, firstError, raw);
    try {
      return await repairStructuredOutput(options.task, raw, options.structureDescription);
    } catch (repairError) {
      if (repairError instanceof Error && repairError.message.startsWith(`${TASK_LABELS[options.task]}\u672A\u8FD4\u56DE\u6709\u6548JSON\u7ED3\u6784`)) {
        throw repairError;
      }
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
  "rewriteInstruction": "\u7ED9\u4FEE\u6B63\u6587\u6A21\u578B\u7684\u4E00\u6BB5\u5B8C\u6574\u6307\u4EE4",
  "replacementText": "\u82E5\u80FD\u4E25\u683C\u6700\u5C0F\u4FEE\u6B63\u5219\u7ED9\u51FA\u5B8C\u6574\u66FF\u6362\u6B63\u6587\uFF1B\u5426\u5219\u8F93\u51FA\u7A7A\u5B57\u7B26\u4E32"
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
6. replacementText\u5B57\u6BB5\u5FC5\u987B\u59CB\u7EC8\u5B58\u5728\uFF1B\u4EC5\u5728\u80FD\u4E25\u683C\u6700\u5C0F\u4FEE\u6B63\u65F6\u586B\u5199\u5B8C\u6574\u6B63\u6587\uFF0C\u5426\u5219\u8F93\u51FA\u7A7A\u5B57\u7B26\u4E32\u3002
7. \u4E0D\u8F93\u51FAMarkdown\u4EE3\u7801\u5757\uFF0C\u4E0D\u8F93\u51FAJSON\u4EE5\u5916\u7684\u6587\u5B57\u3002`;
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
        rewriteInstruction: { type: "string" },
        replacementText: { type: "string" }
      },
      required: ["result", "reason", "violations", "preserve", "rewriteInstruction", "replacementText"],
      additionalProperties: false
    }
  };
}

// src/pipeline/audit.ts
function list(value, maxItems = 24) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => safeText(item, 2e3).trim()).filter(Boolean).slice(0, maxItems);
}
function violationList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => ({
    ruleId: safeText(item?.ruleId || `rule_${index + 1}`, 120).trim() || `rule_${index + 1}`,
    rule: safeText(item?.rule, 1e3).trim(),
    evidence: safeText(item?.evidence, 3e3).trim(),
    action: safeText(item?.action, 3e3).trim()
  })).filter((item) => item.rule || item.evidence || item.action).slice(0, 24);
}
function resultFingerprint(violations) {
  const normalized = violations.map((item) => `${item.ruleId}|${item.rule}`.toLowerCase().replace(/\s+/g, " ").trim()).sort().join("\n");
  return normalized ? hashText(normalized) : "";
}
function parseAuditResult(raw) {
  const text = safeText(raw, 1e5).trim();
  try {
    const data = parseJsonObject(text);
    if (!["pass", "revise", "block"].includes(String(data.result))) {
      throw new Error("\u5BA1\u6838\u7ED3\u679C\u7F3A\u5C11\u6709\u6548\u7684result\u5B57\u6BB5");
    }
    const decision = String(data.result);
    const violations = violationList(data.violations);
    const passed = decision === "pass";
    return {
      passed,
      decision,
      reason: safeText(data.reason, 3e3).trim() || (passed ? "\u901A\u8FC7" : "\u8FDD\u53CD\u89C4\u5219"),
      violations: passed ? [] : violations,
      preserve: list(data.preserve),
      rewriteInstruction: safeText(data.rewriteInstruction, 6e3).trim(),
      violationFingerprint: passed ? "" : resultFingerprint(violations),
      replacementText: !passed && decision === "revise" ? safeText(data.replacementText ?? data.finalText, 2e5).trim() || void 0 : void 0
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
function applyAuditVisibility(index, hidden, marked = false) {
  const element = findMessageElement(index);
  element?.classList.toggle("ma11-audit-hidden-message", hidden);
  element?.classList.toggle("ma11-audit-marked-message", !hidden && marked);
}
function isCancelledAuditRequest(error) {
  return error instanceof Error && ["AbortError", "CommitRejectedError"].includes(error.name);
}
async function auditText(playerRules, playerText, assistantText) {
  const request = {
    task: "audit",
    systemPrompt: auditSystemPrompt(),
    prompt: auditUserPrompt(playerRules, playerText, assistantText)
  };
  let raw = "";
  let structuredRequestError;
  try {
    raw = await generateTask({ ...request, jsonSchema: auditJsonSchema() });
    if (raw.trim() === "{}") {
      structuredRequestError = new Error("\u7ED3\u6784\u5316\u8F93\u51FA\u8FD4\u56DE\u7A7A\u5BF9\u8C61\uFF0C\u5F53\u524D\u6A21\u578B\u6216\u63A5\u53E3\u53EF\u80FD\u4E0D\u652F\u6301JSON Schema");
    }
  } catch (error) {
    if (isCancelledAuditRequest(error)) throw error;
    structuredRequestError = error;
  }
  if (structuredRequestError) {
    try {
      raw = await generateTask(request);
    } catch (fallbackError) {
      if (isCancelledAuditRequest(fallbackError)) throw fallbackError;
      throw new Error(
        `\u89C4\u5219\u5BA1\u6838\u8BF7\u6C42\u5931\u8D25\uFF08${describeTaskConnection("audit")}\uFF09\u3002\u7ED3\u6784\u5316\u8BF7\u6C42\uFF1A${toErrorMessage(structuredRequestError)}\uFF1B\u65E0Schema\u56DE\u9000\uFF1A${toErrorMessage(fallbackError)}`
      );
    }
  }
  try {
    return parseAuditResult(raw);
  } catch (firstError) {
    if (raw.trim() === "{}") {
      const prefix = structuredRequestError ? `\u7ED3\u6784\u5316\u8BF7\u6C42\u5931\u8D25\u540E\uFF0C\u65E0Schema\u56DE\u9000\u4ECD\u8FD4\u56DE\u7A7A\u5BF9\u8C61\u3002\u539F\u9519\u8BEF\uFF1A${toErrorMessage(structuredRequestError)}` : "\u5BA1\u6838\u6A21\u578B\u8FD4\u56DE\u7A7A\u5BF9\u8C61";
      throw new Error(`\u89C4\u5219\u5BA1\u6838\u672A\u8FD4\u56DE\u6709\u6548\u7ED3\u6784\uFF08${describeTaskConnection("audit")}\uFF09\u3002${prefix}`);
    }
    if (!getSettings().repairInvalidJsonOnce) {
      throw new Error(`\u89C4\u5219\u5BA1\u6838\u672A\u8FD4\u56DE\u6709\u6548\u7ED3\u6784\uFF08${describeTaskConnection("audit")}\uFF09\u3002${toErrorMessage(firstError)}\uFF1B\u8FD4\u56DE\u7247\u6BB5\uFF1A${jsonPreview(raw)}`);
    }
    try {
      const repaired = await repairStructuredOutput(
        "audit",
        raw,
        '{"result":"pass|revise|block","reason":"...","violations":[{"ruleId":"...","rule":"...","evidence":"...","action":"..."}],"preserve":["..."],"rewriteInstruction":"...","replacementText":"...\u6216\u7A7A\u5B57\u7B26\u4E32"}'
      );
      return parseAuditResult(JSON.stringify(repaired));
    } catch (repairError) {
      if (isCancelledAuditRequest(repairError)) throw repairError;
      throw new Error(`\u89C4\u5219\u5BA1\u6838\u672A\u8FD4\u56DE\u6709\u6548\u7ED3\u6784\uFF08${describeTaskConnection("audit")}\uFF09\u3002${toErrorMessage(repairError)}\uFF1B\u539F\u59CB\u8FD4\u56DE\u7247\u6BB5\uFF1A${jsonPreview(raw)}`);
    }
  }
}
async function applyAuditFailureAction(artifact, action) {
  if (action === "mark") {
    artifact.hiddenByAudit = false;
    applyAuditVisibility(artifact.messageIndex, false, true);
    return;
  }
  if (action === "hide") {
    artifact.hiddenByAudit = true;
    applyAuditVisibility(artifact.messageIndex, true);
    return;
  }
  artifact.hiddenByAudit = true;
  applyAuditVisibility(artifact.messageIndex, true);
  toast("warning", "\u5BA1\u6838\u672A\u901A\u8FC7\uFF1B\u63D2\u4EF6\u4E0D\u4F1A\u81EA\u52A8\u5220\u9664\u9152\u9986\u6D88\u606F\uFF0C\u5DF2\u9690\u85CF\u5E76\u4FDD\u7559\u4EBA\u5DE5\u5904\u7406\u5165\u53E3");
}
async function runAudit(artifact, force = false) {
  const settings = getSettings();
  artifact.stages.revision ||= { status: "idle", attempts: 0 };
  if (!settings.auditEnabled) {
    markStage(artifact, "audit", "skipped");
    markStage(artifact, "revision", "skipped");
    artifact.hiddenByAudit = false;
    applyAuditVisibility(artifact.messageIndex, false, false);
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
    const result = await auditText(settings.auditPrompt, artifact.playerText, artifact.assistantText);
    assertArtifactCommitCurrent(artifact);
    artifact.audit = result;
    if (result.passed) {
      artifact.approvedFingerprint = artifact.sourceFingerprint;
      artifact.hiddenByAudit = false;
      applyAuditVisibility(artifact.messageIndex, false, false);
      markStage(artifact, "audit", "success");
      markStage(artifact, "revision", "skipped");
    } else {
      markStage(artifact, "audit", "blocked", result.reason);
    }
    const message = getMessage(artifact.messageIndex);
    if (!message) throw new Error("\u539FAI\u6B63\u6587\u5DF2\u4E0D\u5B58\u5728\uFF0C\u8BF7\u91CD\u65B0\u6574\u7406");
    attachArtifactToMessage(message, artifact);
    await persistChatFor(artifact.chatKey);
    await putArtifact(artifact);
    return result;
  } catch (error) {
    if (error instanceof Error && ["AbortError", "CommitRejectedError"].includes(error.name)) throw error;
    markStage(artifact, "audit", "failed", toErrorMessage(error));
    await putArtifact(artifact);
    throw error;
  }
}

// src/core/message-update.ts
function updateActiveSwipe(message, text) {
  if (!Array.isArray(message?.swipes)) return;
  const id = Number(message.swipe_id);
  if (Number.isInteger(id) && id >= 0 && id < message.swipes.length) message.swipes[id] = text;
}
async function refreshMessageDisplay(index) {
  const context = getContext();
  if (typeof context.reloadCurrentChat === "function") await context.reloadCurrentChat();
  else if (context.event_types?.MESSAGE_UPDATED) {
    context.eventSource?.emit?.(context.event_types.MESSAGE_UPDATED, index);
  }
}
async function replaceMessageInPlace(artifact, text) {
  assertArtifactCommitCurrent(artifact);
  const message = getMessage(artifact.messageIndex);
  if (!message || message.is_user) throw new Error("\u539FAI\u6D88\u606F\u5DF2\u4E0D\u5B58\u5728");
  const finalText = String(text || "").trim();
  if (!finalText) throw new Error("\u4FEE\u6B63\u6587\u6A21\u578B\u8FD4\u56DE\u7A7A\u6B63\u6587");
  message.mes = finalText;
  updateActiveSwipe(message, finalText);
  artifact.assistantText = finalText;
  artifact.sourceFingerprint = messageFingerprint(artifact.messageIndex);
  artifact.messageKey = messageIdentity(artifact.messageIndex);
  artifact.approvedFingerprint = artifact.sourceFingerprint;
  artifact.hiddenByAudit = false;
  attachArtifactToMessage(message, artifact);
  await persistChatFor(artifact.chatKey);
  await refreshMessageDisplay(artifact.messageIndex);
  return artifact.sourceFingerprint;
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
  const violations = audit.violations.map((item, index) => `${index + 1}. \u89C4\u5219\uFF1A${item.rule}
   \u8BC1\u636E\uFF1A${item.evidence}
   \u4FEE\u6539\uFF1A${item.action}`).join("\n");
  const preserve = audit.preserve.length ? audit.preserve.map((item) => `- ${item}`).join("\n") : "- \u539F\u6B63\u6587\u4E2D\u5168\u90E8\u5DF2\u6210\u7ACB\u7684\u5916\u90E8\u4E8B\u5B9E";
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
async function runRevisionFlow(artifact) {
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
  artifact.hiddenByAudit = true;
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
      const replacementText = safeText(currentAudit.replacementText, 2e5).trim();
      const supplied = attempt === 1 && replacementText ? replacementText : void 0;
      const raw = supplied ?? await generateTask({
        task: "revision",
        systemPrompt: revisionSystemPrompt(settings.revisionPrompt),
        prompt: revisionUserPrompt(settings.auditPrompt, artifact.playerText, sourceText, currentAudit, attempt)
      });
      const candidate = cleanRevisionText(raw);
      if (!candidate) throw new Error("\u4FEE\u6B63\u6587\u6A21\u578B\u8FD4\u56DE\u7A7A\u6B63\u6587");
      if (hashText(candidate) === hashText(sourceText)) throw new Error("\u4FEE\u6B63\u6587\u6A21\u578B\u672A\u6539\u53D8\u6B63\u6587");
      const candidateAudit = await auditText(settings.auditPrompt, artifact.playerText, candidate);
      assertArtifactCommitCurrent(artifact);
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
    if (error instanceof Error && ["AbortError", "CommitRejectedError"].includes(error.name)) {
      throw error;
    }
    artifact.revision.status = "failed";
    artifact.revision.stoppedReason = toErrorMessage(error);
    artifact.hiddenByAudit = false;
    applyAuditVisibility(artifact.messageIndex, false, true);
    markStage(artifact, "revision", "failed", `\u4FEE\u6B63\u6267\u884C\u5931\u8D25\uFF1A${artifact.revision.stoppedReason}`);
    await putArtifact(artifact);
    throw error;
  }
}

// src/domain/lorebook-publish.ts
function rows(snapshot, key) {
  return snapshot[key] ?? [];
}
function uniq(values, limit = 32) {
  return [...new Set(values.map((item) => String(item || "").trim()).filter((item) => item.length >= 2))].slice(0, limit);
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
  const process = /(^|[｜|])流程|手续|登记|申请|审批|调查程序|制度流程|process/i.test(text);
  return process ? { label: "\u6D41\u7A0B", name: cleanPrefixedTitle(row.title, ["\u6D41\u7A0B"]) } : { label: "\u4E8B\u4EF6", name: cleanPrefixedTitle(row.title, ["\u4E8B\u4EF6"]) };
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
  const consumed = new Set(large.flatMap((item) => item.sourceKeys));
  return small.filter((item) => !consumed.has(item.id));
}
function currentSmallSummaryContent(summaries) {
  const blocks = summaries.map((item) => {
    const notes = item.sedimentation?.notes?.length ? `
\u6C89\u964D\u5904\u7406\uFF1A${item.sedimentation.notes.join("\uFF1B")}` : "";
    return `\u3010${item.title}\u3011
${item.summary}${notes}`;
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
      ["\u5C0F\u603B\u7ED3", "\u5F53\u524D\u5468\u671F", ...pendingSmall.flatMap((item) => [item.title, ...item.keywords])],
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
  for (const item of smallSummaries) {
    documents.push(makeDocument(
      `small:${item.id}`,
      `MA\uFF5C\u5C0F\u603B\u7ED3\uFF5C${item.title}`,
      item.summary,
      [item.title, ...item.keywords],
      false,
      options.vectorize,
      110,
      "small"
    ));
  }
  for (const item of largeSummaries) {
    documents.push(makeDocument(
      `large:${item.id}`,
      `MA\uFF5C\u5927\u603B\u7ED3\uFF5C${item.title}`,
      item.summary,
      [item.title, ...item.keywords],
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

// src/pipeline/lorebook.ts
var worldInfoModulePromise = null;
function resetLorebookRuntime() {
  worldInfoModulePromise = null;
}
async function worldInfoApi() {
  if (!worldInfoModulePromise) {
    const moduleUrl = "/scripts/world-info.js";
    worldInfoModulePromise = import(
      /* @vite-ignore */
      moduleUrl
    );
  }
  return worldInfoModulePromise;
}
function generatedBookName(chatKey = currentChatKey()) {
  const context = getContext();
  const display = sanitizeBookName(context.name2 || context.name1 || "Chat") || "Chat";
  return sanitizeBookName(`MA_${display}_${hashText(chatKey).slice(0, 8)}`);
}
async function resolveBookName(create, artifact) {
  const chatKey = artifact?.chatKey ?? currentChatKey();
  if (artifact) assertArtifactCommitCurrent(artifact);
  else assertChatCommitCurrent(chatKey);
  const settings = getSettings();
  const meta = getChatMetadataNamespace();
  const context = getContext();
  let name = sanitizeBookName(settings.lorebookName || meta.lorebookName || context.chatMetadata?.world_info || "");
  if (!name && create && settings.autoCreateLorebook) name = generatedBookName(artifact?.chatKey);
  if (!name) return "";
  if (create) {
    const wi = await worldInfoApi();
    let data = await wi.loadWorldInfo(name);
    if (!data && typeof wi.createNewWorldInfo === "function") {
      if (artifact) assertArtifactCommitCurrent(artifact);
      await wi.createNewWorldInfo(name, { interactive: false });
      data = await wi.loadWorldInfo(name);
    }
    if (!data) {
      data = { entries: {} };
      if (artifact) assertArtifactCommitCurrent(artifact);
      await wi.saveWorldInfo(name, data, true);
    }
    if (artifact) assertArtifactCommitCurrent(artifact);
    context.chatMetadata ||= {};
    context.chatMetadata[wi.METADATA_KEY || "world_info"] = name;
    meta.lorebookName = name;
    await persistMetadataFor(chatKey);
    refreshChatLorebookIndicator(name);
  }
  return name;
}
function managedInfo(entry) {
  return entry?.extensions?.mirrorAbyssV11 ?? null;
}
async function reloadWorldInfoEditor(wi, name, loadIfNotSelected = false) {
  const context = getContext();
  const updateList = context.updateWorldInfoList ?? wi.updateWorldInfoList;
  if (typeof updateList === "function") {
    await Promise.resolve(updateList.call(context));
  }
  const names = typeof context.getWorldInfoNames === "function" ? context.getWorldInfoNames() : Array.isArray(wi.world_names) ? [...wi.world_names] : [];
  const listed = !names.length || names.includes(name);
  const editorSelect = document.querySelector("#world_editor_select");
  const selectedName = editorSelect?.selectedOptions?.[0]?.textContent?.trim() ?? "";
  const shouldRenderTarget = loadIfNotSelected || selectedName === name;
  const contextReload = context.reloadWorldInfoEditor;
  const moduleReload = wi.reloadEditor ?? wi.reloadWorldInfoEditor;
  const reload = contextReload ?? moduleReload;
  if (typeof reload === "function" && listed) {
    await Promise.resolve(reload.call(contextReload ? context : wi, name, loadIfNotSelected));
  }
  if (shouldRenderTarget && typeof wi.showWorldEditor === "function") {
    await wi.showWorldEditor(name);
  } else if (typeof reload === "function") {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
}
function refreshChatLorebookIndicator(name) {
  if (typeof document?.querySelectorAll !== "function") return;
  const linked = Boolean(name);
  document.querySelectorAll(".chat_lorebook_button").forEach((button) => {
    button.classList.toggle("world_set", linked);
  });
}
function applyEntry(entry, chatKey, key, spec, wi) {
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
    chatKey,
    key,
    kind: spec.kind,
    version: VERSION
  };
}
async function desiredSpecs(artifact) {
  const settings = getSettings();
  const state2 = await getChatState(artifact.chatKey);
  const documents = buildLorebookDocuments(
    artifact.snapshot,
    state2.smallSummaries,
    state2.largeSummaries,
    {
      layout: settings.lorebookLayout,
      vectorize: settings.vectorizeRows,
      latestContinuityConstant: settings.latestContinuityConstant
    }
  );
  return new Map(documents.map((document2) => [document2.key, document2]));
}
async function syncLorebook(artifact, force = false) {
  assertArtifactCommitCurrent(artifact);
  if (!artifact.snapshot || artifact.stages.state.status !== "success") {
    throw new Error("\u6CA1\u6709\u6210\u529F\u72B6\u6001\u8868\uFF0C\u505C\u6B62\u4E16\u754C\u4E66\u540C\u6B65");
  }
  const settings = getSettings();
  if (!settings.lorebookSync && !force) {
    markStage(artifact, "sync", "skipped");
    await putArtifact(artifact);
    return;
  }
  markStage(artifact, "sync", "running");
  await putArtifact(artifact);
  const chatState = await getChatState(artifact.chatKey);
  if (chatState.historyInvalidation) {
    markStage(artifact, "sync", "blocked", "\u5386\u53F2\u6D88\u606F\u5DF2\u53D8\u5316\uFF0C\u7B49\u5F85\u624B\u52A8\u91CD\u7B97");
    chatState.lastSyncStatus = "failed";
    chatState.lastSyncError = chatState.historyInvalidation.startIndex === void 0 ? "\u5386\u53F2\u5220\u9664\u4F4D\u7F6E\u672A\u77E5\uFF0C\u8BF7\u5148\u9009\u62E9\u91CD\u7B97\u8D77\u70B9" : `\u7B2C ${chatState.historyInvalidation.startIndex + 1} \u6761\u6D88\u606F\u4E4B\u540E\u7684\u6570\u636E\u9700\u8981\u91CD\u7B97`;
    await putArtifact(artifact);
    await putChatState(chatState);
    return;
  }
  try {
    const wi = await worldInfoApi();
    const name = await resolveBookName(true, artifact);
    if (!name) throw new Error("\u6CA1\u6709\u53EF\u7528\u7684\u804A\u5929\u4E16\u754C\u4E66");
    const data = await wi.loadWorldInfo(name) || { entries: {} };
    data.entries ||= {};
    const desired = await desiredSpecs(artifact);
    const existing = /* @__PURE__ */ new Map();
    for (const [uid, entry] of Object.entries(data.entries)) {
      const info = managedInfo(entry);
      if (info?.managed && info.chatKey === artifact.chatKey && info.key) {
        existing.set(info.key, { uid, entry });
      }
    }
    let changed = false;
    const entryIds = [];
    for (const [key, spec] of desired) {
      let pair = existing.get(key);
      let entry = pair?.entry;
      if (!entry) {
        entry = wi.createWorldInfoEntry(name, data);
        if (!entry) throw new Error(`\u4E16\u754C\u4E66\u6761\u76EE\u521B\u5EFA\u5931\u8D25\uFF1A${key}`);
        pair = { uid: String(entry.uid), entry };
        changed = true;
      }
      const before = JSON.stringify(entry);
      applyEntry(entry, artifact.chatKey, key, spec, wi);
      if (before !== JSON.stringify(entry)) changed = true;
      existing.delete(key);
      if (Number.isFinite(Number(entry.uid))) entryIds.push(Number(entry.uid));
    }
    for (const { uid } of existing.values()) {
      delete data.entries[uid];
      changed = true;
    }
    assertArtifactCommitCurrent(artifact);
    if (changed) {
      await wi.saveWorldInfo(name, data, true);
      assertArtifactCommitCurrent(artifact);
    }
    if (changed || force) {
      await reloadWorldInfoEditor(wi, name, force);
      assertArtifactCommitCurrent(artifact);
    }
    assertArtifactCommitCurrent(artifact);
    artifact.lorebookEntryIds = entryIds;
    markStage(artifact, "sync", "success");
    chatState.lastLorebookName = name;
    chatState.lastSyncAt = (/* @__PURE__ */ new Date()).toISOString();
    chatState.lastSyncStatus = "success";
    chatState.lastSyncError = void 0;
    await putArtifact(artifact);
    await putChatState(chatState);
  } catch (error) {
    if (error instanceof Error && error.name === "CommitRejectedError") throw error;
    const message = toErrorMessage(error);
    markStage(artifact, "sync", "failed", message);
    chatState.lastSyncStatus = "failed";
    chatState.lastSyncError = message;
    await putArtifact(artifact);
    await putChatState(chatState);
    throw error;
  }
}
async function clearCurrentChatLorebookEntries(chatKey = currentChatKey()) {
  if (currentChatKey() !== chatKey) throw new Error("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u505C\u6B62\u6E05\u7406\u65E7\u804A\u5929\u4E16\u754C\u4E66");
  const name = await resolveBookName(false);
  if (!name) return 0;
  const wi = await worldInfoApi();
  const data = await wi.loadWorldInfo(name);
  if (currentChatKey() !== chatKey) throw new Error("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u505C\u6B62\u6E05\u7406\u65E7\u804A\u5929\u4E16\u754C\u4E66");
  if (!data?.entries) return 0;
  let removed = 0;
  for (const [uid, entry] of Object.entries(data.entries)) {
    const info = managedInfo(entry);
    if (info?.managed && info.chatKey === chatKey) {
      delete data.entries[uid];
      removed += 1;
    }
  }
  if (removed) {
    if (currentChatKey() !== chatKey) throw new Error("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u505C\u6B62\u6E05\u7406\u65E7\u804A\u5929\u4E16\u754C\u4E66");
    await wi.saveWorldInfo(name, data, true);
    assertChatCommitCurrent(chatKey, "\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u505C\u6B62\u6E05\u7406\u65E7\u804A\u5929\u4E16\u754C\u4E66");
    await reloadWorldInfoEditor(wi, name);
  }
  return removed;
}
async function pauseCurrentChatLorebookEntries(chatKey = currentChatKey()) {
  if (currentChatKey() !== chatKey) throw new Error("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u505C\u6B62\u6682\u505C\u65E7\u804A\u5929\u4E16\u754C\u4E66");
  const name = await resolveBookName(false);
  if (!name) return 0;
  const wi = await worldInfoApi();
  const data = await wi.loadWorldInfo(name);
  if (currentChatKey() !== chatKey) throw new Error("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u505C\u6B62\u6682\u505C\u65E7\u804A\u5929\u4E16\u754C\u4E66");
  if (!data?.entries) return 0;
  let managed = 0;
  let changed = false;
  for (const entry of Object.values(data.entries)) {
    const info = managedInfo(entry);
    if (info?.managed && info.chatKey === chatKey) {
      managed += 1;
      if (!entry.disable) {
        entry.disable = true;
        changed = true;
      }
    }
  }
  if (changed) {
    if (currentChatKey() !== chatKey) throw new Error("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u505C\u6B62\u6682\u505C\u65E7\u804A\u5929\u4E16\u754C\u4E66");
    await wi.saveWorldInfo(name, data, true);
    assertChatCommitCurrent(chatKey, "\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u505C\u6B62\u6682\u505C\u65E7\u804A\u5929\u4E16\u754C\u4E66");
    await reloadWorldInfoEditor(wi, name);
  }
  return managed;
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
  return [...new Set(value.map((item) => safeText(item, 80).trim()).filter(Boolean))].slice(0, 16);
}
function normalizeStringList(value, limit = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => safeText(item, 240).trim()).filter(Boolean))].slice(0, limit);
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
  return String(value || "").toLowerCase().replace(/[\s·•._—–\-|｜:：()（）【】\[\]]+/g, "");
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
  const index = next[tableKey].findIndex((item) => item.id === row.id);
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
    const row = next.characters.find((item) => item.id === update.rowId);
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
  return [...new Set(value.map((item) => safeText(item, itemLimit).trim()).filter(Boolean))].slice(0, limit);
}
function normalizeActivityUpdates(value) {
  if (!Array.isArray(value)) return [];
  const allowed = /* @__PURE__ */ new Set(["\u4F11\u7720", "\u957F\u671F\u4F11\u7720", "\u5DF2\u5F52\u6863"]);
  return value.map((item) => item && typeof item === "object" ? item : {}).map((item) => ({
    rowId: safeText(item.rowId, 160).trim(),
    activity: safeText(item.activity, 40).trim(),
    reason: safeText(item.reason, 500).trim()
  })).filter((item) => item.rowId && allowed.has(item.activity)).slice(0, 30);
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
    keywords: Array.isArray(value.keywords) ? [...new Set(value.keywords.map((item) => safeText(item, 80).trim()).filter(Boolean))].slice(0, 24) : [],
    sourceKeys,
    createdAt: nowIso(),
    sedimentation: kind === "small" ? normalizeSedimentation(value.sedimentation) : void 0,
    previousLargeSummaryId: kind === "large" ? previousLargeSummaryId : void 0
  };
}

// src/domain/summary-policy.ts
var TABLE_WEIGHTS = {
  focus: 2,
  spacetime: 2,
  characters: 2,
  relationships: 2,
  events: 2,
  regions: 1,
  items: 1,
  skills: 1,
  foundations: 1
};
function comparableRow(row) {
  return JSON.stringify({
    title: row.title,
    content: row.content,
    status: row.status,
    lifecycle: row.lifecycle
  });
}
function changedRows(previous, current) {
  let score = 0;
  for (const table of TABLE_KEYS) {
    const before = new Map((previous?.[table] ?? []).map((row) => [row.id, comparableRow(row)]));
    const after = new Map(current[table].map((row) => [row.id, comparableRow(row)]));
    const ids = /* @__PURE__ */ new Set([...before.keys(), ...after.keys()]);
    for (const id of ids) {
      if (before.get(id) !== after.get(id)) score += TABLE_WEIGHTS[table];
    }
  }
  return Math.min(8, score);
}
function decideSmallSummary(allArtifacts, pendingArtifacts, configuredMaxTurns) {
  const maxTurns = Math.min(30, Math.max(8, Number(configuredMaxTurns) || 12));
  const minTurns = Math.max(4, Math.round(maxTurns * 0.4));
  const targetScore = Math.max(12, minTurns * 3);
  const firstIndex = pendingArtifacts.length ? allArtifacts.findIndex((item) => item.messageKey === pendingArtifacts[0].messageKey) : -1;
  let previous = firstIndex > 0 ? allArtifacts[firstIndex - 1].snapshot : void 0;
  let score = 0;
  for (const artifact of pendingArtifacts) {
    if (!artifact.snapshot) continue;
    const facts = artifact.factPackage?.facts ?? [];
    const factScore = facts.reduce((sum, fact) => {
      if (fact.confidence === "uncertain") return sum;
      if (["historical", "trace"].includes(fact.type)) return sum + 1;
      if (["focus", "spacetime", "character", "relationship", "event"].includes(fact.type)) return sum + 2;
      return sum + 1;
    }, 0);
    score += Math.min(8, factScore || changedRows(previous, artifact.snapshot));
    previous = artifact.snapshot;
  }
  const turns = pendingArtifacts.length;
  if (turns < minTurns) {
    return { shouldSummarize: false, turns, score, minTurns, maxTurns, targetScore, reason: "below-minimum" };
  }
  if (score >= targetScore) {
    return { shouldSummarize: true, turns, score, minTurns, maxTurns, targetScore, reason: "story-density" };
  }
  return {
    shouldSummarize: turns >= maxTurns,
    turns,
    score,
    minTurns,
    maxTurns,
    targetScore,
    reason: turns >= maxTurns ? "maximum-delay" : "waiting-density"
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
  const source = summaries.map((item) => `\u3010${item.title}\u3011
${item.summary}`).join("\n\n");
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

// src/pipeline/summary.ts
function successfulArtifacts() {
  const chatKey = currentChatKey();
  return getChat().filter((message) => !message?.is_user).map((message) => message?.extra?.mirrorAbyssV11).filter((artifact) => Boolean(
    artifact?.chatKey === chatKey && artifact.snapshot && artifact.stages.state.status === "success"
  ));
}
function transcriptFor(artifacts) {
  return artifacts.map((artifact) => {
    const packageValue = artifact.factPackage;
    if (!packageValue) {
      return `\u3010\u56DE\u5408 ${artifact.messageIndex + 1}\u3011
\u73A9\u5BB6\uFF1A${artifact.playerText || "\uFF08\u7A7A\uFF09"}
\u6B63\u6587\uFF1A${artifact.assistantText}`;
    }
    const facts = packageValue.facts.map(
      (fact) => `- [${fact.confidence}] ${fact.type}/${fact.operation}\uFF5C${fact.title}\uFF1A${fact.content}`
    ).join("\n");
    return `\u3010\u56DE\u5408 ${artifact.messageIndex + 1}\u3011
\u4E8B\u5B9E\u6458\u8981\uFF1A${packageValue.turnSummary || "\uFF08\u65E0\uFF09"}
\u6807\u51C6\u5316\u4E8B\u5B9E\uFF1A
${facts || "\uFF08\u65E0\u53EF\u6C89\u964D\u4E8B\u5B9E\uFF09"}`;
  }).join("\n\n");
}
function allConsumedKeys(summaries) {
  return new Set(summaries.flatMap((item) => item.sourceKeys));
}
function pendingSmallSummaries(small, large) {
  const consumed = new Set(large.flatMap((item) => item.sourceKeys));
  return small.filter((item) => !consumed.has(item.id));
}
async function generateSmallSummary(artifact, force = false) {
  const settings = getSettings();
  const chatState = await getChatState(artifact.chatKey);
  const consumed = allConsumedKeys(chatState.smallSummaries);
  const all = successfulArtifacts();
  const pending = all.filter((item) => !consumed.has(item.messageKey));
  const decision = decideSmallSummary(all, pending, settings.smallSummaryTurns);
  if (!force && !decision.shouldSummarize) return null;
  if (!pending.length) return null;
  const selected = force ? pending : pending.slice(0, decision.maxTurns);
  const latestSnapshot = selected.at(-1)?.snapshot;
  const parsed = await generateStructuredTask({
    task: "smallSummary",
    systemPrompt: smallSummarySystemPrompt(),
    prompt: smallSummaryPrompt(transcriptFor(selected), latestSnapshot),
    structureDescription: '{"title":"...","summary":"...","keywords":["..."],"sedimentation":{"removeRowIds":["..."],"characterActivityUpdates":[{"rowId":"...","activity":"\u4F11\u7720|\u957F\u671F\u4F11\u7720|\u5DF2\u5F52\u6863","reason":"..."}],"notes":["..."]}}'
  });
  assertArtifactCommitCurrent(artifact);
  const summary = normalizeSummary(parsed, "small", selected.map((item) => item.messageKey));
  if (!summary.summary) throw new Error("\u5C0F\u603B\u7ED3\u6A21\u578B\u8FD4\u56DE\u7A7A\u6458\u8981");
  const previousSnapshot2 = artifact.snapshot ? structuredClone(artifact.snapshot) : void 0;
  const previousSummaries = [...chatState.smallSummaries];
  try {
    if (artifact.snapshot) artifact.snapshot = applySedimentation(artifact.snapshot, summary);
    const message = getMessage(artifact.messageIndex);
    if (message) attachArtifactToMessage(message, artifact);
    await persistChatFor(artifact.chatKey);
    chatState.smallSummaries.push(summary);
    await putChatState(chatState);
  } catch (error) {
    artifact.snapshot = previousSnapshot2;
    chatState.smallSummaries = previousSummaries;
    try {
      assertArtifactCommitCurrent(artifact);
      const message = getMessage(artifact.messageIndex);
      if (message) attachArtifactToMessage(message, artifact);
      await persistChatFor(artifact.chatKey).catch(() => void 0);
    } catch {
    }
    throw error;
  }
  return summary;
}
async function generateLargeSummary(artifact, force = false) {
  const settings = getSettings();
  const chatState = await getChatState(artifact.chatKey);
  const pending = pendingSmallSummaries(chatState.smallSummaries, chatState.largeSummaries);
  const threshold = Math.max(1, Number(settings.largeSummaryCount) || 6);
  if (!force && pending.length < threshold) return null;
  if (!pending.length) return null;
  const selected = force ? pending : pending.slice(0, threshold);
  const snapshot = artifact.snapshot;
  if (!snapshot) throw new Error("\u6CA1\u6709\u53EF\u7528\u4E8E\u5927\u603B\u7ED3\u7684\u72B6\u6001\u8868");
  const previousLarge = chatState.largeSummaries.at(-1);
  const parsed = await generateStructuredTask({
    task: "largeSummary",
    systemPrompt: largeSummarySystemPrompt(),
    prompt: largeSummaryPrompt(selected, snapshot, previousLarge),
    structureDescription: '{"title":"...","summary":"...","keywords":["..."]}'
  });
  assertArtifactCommitCurrent(artifact);
  const summary = normalizeSummary(
    parsed,
    "large",
    selected.map((item) => item.id),
    previousLarge?.id
  );
  if (!summary.summary) throw new Error("\u5927\u603B\u7ED3\u6A21\u578B\u8FD4\u56DE\u7A7A\u6458\u8981");
  chatState.largeSummaries.push(summary);
  await putChatState(chatState);
  return summary;
}
async function runSummaryStage(artifact, kind, force = false) {
  const settings = getSettings();
  const enabled = kind === "small" ? settings.autoSmallSummary : settings.autoLargeSummary;
  if (!enabled && !force) return;
  const preserveEarlierFailure = !force && artifact.stages.summary.status === "failed";
  if (!preserveEarlierFailure) markStage(artifact, "summary", "running");
  await putArtifact(artifact);
  try {
    if (kind === "small") await generateSmallSummary(artifact, force);
    else await generateLargeSummary(artifact, force);
    if (!preserveEarlierFailure) markStage(artifact, "summary", "success");
    await putArtifact(artifact);
  } catch (error) {
    if (error instanceof Error && ["AbortError", "CommitRejectedError"].includes(error.name)) throw error;
    const label = kind === "small" ? "\u5C0F\u603B\u7ED3" : "\u5927\u603B\u7ED3";
    const previous = artifact.stages.summary.error;
    const current = `${label}\u5931\u8D25\uFF1A${toErrorMessage(error)}`;
    markStage(artifact, "summary", "failed", previous && previous !== current ? `${previous}\uFF1B${current}` : current);
    await putArtifact(artifact);
    throw error;
  }
}
async function maybeRunSummaries(artifact, forceSmall = false, forceLarge = false) {
  const errors = [];
  try {
    await runSummaryStage(artifact, "small", forceSmall);
  } catch (error) {
    if (error instanceof Error && ["AbortError", "CommitRejectedError"].includes(error.name)) throw error;
    errors.push(`\u5C0F\u603B\u7ED3\uFF1A${toErrorMessage(error)}`);
  }
  try {
    await runSummaryStage(artifact, "large", forceLarge);
  } catch (error) {
    if (error instanceof Error && ["AbortError", "CommitRejectedError"].includes(error.name)) throw error;
    errors.push(`\u5927\u603B\u7ED3\uFF1A${toErrorMessage(error)}`);
  }
  if (errors.length) {
    const combined = errors.join("\uFF1B");
    markStage(artifact, "summary", "failed", combined);
    await putArtifact(artifact);
    throw new Error(combined);
  }
}

// src/domain/facts.ts
var FACT_TYPES = /* @__PURE__ */ new Set([
  "focus",
  "spacetime",
  "character",
  "relationship",
  "item",
  "skill",
  "event",
  "region",
  "foundation",
  "historical",
  "trace"
]);
var OPERATIONS = /* @__PURE__ */ new Set(["create", "update", "append", "close", "supersede"]);
var CONFIDENCE = /* @__PURE__ */ new Set(["confirmed", "recorded", "reported", "uncertain"]);
function list2(value, limit = 16) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => safeText(item, 80).trim()).filter(Boolean))].slice(0, limit);
}
function normalizeFacts(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => item && typeof item === "object" ? item : {}).map((item, index) => {
    const type = safeText(item.type, 40).trim();
    const operation = safeText(item.operation, 40).trim();
    const confidence = safeText(item.confidence, 40).trim();
    const entityId = safeText(item.entityId, 160).trim();
    const title = safeText(item.title, 240).trim();
    const content = safeText(item.content, 4e3).trim();
    return {
      id: safeText(item.id, 160).trim() || `fact_${hashText(`${entityId}|${title}|${content}|${index}`)}`,
      type: FACT_TYPES.has(type) ? type : "event",
      entityId: entityId || `entity_${hashText(`${title}|${content}`)}`,
      title: title || `\u4E8B\u5B9E ${index + 1}`,
      content,
      status: safeText(item.status, 120).trim() || "active",
      keywords: list2(item.keywords),
      operation: OPERATIONS.has(operation) ? operation : "update",
      confidence: CONFIDENCE.has(confidence) ? confidence : "uncertain"
    };
  }).filter((fact) => fact.content).slice(0, 40);
}
function normalizeFactPackage(value, sourceMessageKey) {
  return {
    schemaVersion: 1,
    sourceMessageKey,
    turnSummary: safeText(value.turnSummary, 4e3).trim(),
    facts: normalizeFacts(value.facts),
    createdAt: nowIso()
  };
}

// src/prompts/state.ts
function stateSystemPrompt() {
  return `\u4F60\u662F\u201C\u955C\u6E0A\u201D\u4E8B\u5B9E\u63D0\u53D6\u4E0E\u72B6\u6001\u7EF4\u62A4\u5668\u3002\u4F60\u5148\u628A\u672C\u8F6E\u6B63\u6587\u6807\u51C6\u5316\u4E3A\u4E8B\u5B9E\uFF0C\u518D\u4F9D\u636E\u8FD9\u4E9B\u4E8B\u5B9E\u7EF4\u62A4\u5F53\u524D\u4E16\u754C\u72B6\u6001\uFF1B\u4E0D\u7EED\u5199\u6545\u4E8B\u3002

\u8F93\u51FA\u5FC5\u987B\u662F\u53EF\u76F4\u63A5\u88AB JSON.parse \u89E3\u6790\u7684\u5B8C\u6574JSON\u5BF9\u8C61\uFF0C\u4E0D\u8981\u8F93\u51FAMarkdown\u3001\u89E3\u91CA\u6216\u989D\u5916\u6587\u5B57\u3002
\u6839\u8282\u70B9\u5FC5\u987B\u5305\u542B turnSummary\u3001facts\u3001snapshot\u3002
snapshot \u5FC5\u987B\u5305\u542B\u4E5D\u4E2A\u6570\u7EC4\uFF1Afocus\u3001spacetime\u3001characters\u3001relationships\u3001items\u3001skills\u3001events\u3001regions\u3001foundations\u3002
\u6BCF\u884C\u5141\u8BB8\u5B57\u6BB5\uFF1Aid\u3001title\u3001content\u3001keywords\u3001status\uFF1Bfocus\u4E0Echaracters\u8FD8\u5141\u8BB8 lifecycle\u3002

facts \u4E2D\u6BCF\u6761\u4E8B\u5B9E\u5B57\u6BB5\uFF1A
- id\uFF1A\u7A33\u5B9A\u4E8B\u5B9EID\u3002
- type\uFF1Afocus\u3001spacetime\u3001character\u3001relationship\u3001item\u3001skill\u3001event\u3001region\u3001foundation\u3001historical\u3001trace\u3002
- entityId\uFF1A\u5BF9\u5E94\u5BF9\u8C61\u7684\u7A33\u5B9AID\uFF1B\u540C\u4E00\u5BF9\u8C61\u6CBF\u7528\u65E7ID\u3002
- title\u3001content\u3001status\u3001keywords\u3002
- operation\uFF1Acreate\u3001update\u3001append\u3001close\u3001supersede\u3002
- confidence\uFF1Aconfirmed\u3001recorded\u3001reported\u3001uncertain\u3002

\u4E8B\u5B9E\u89C4\u5219\uFF1A
1. \u53EA\u5199\u672C\u8F6E\u6B63\u6587\u5B9E\u9645\u65B0\u589E\u3001\u6539\u53D8\u3001\u7ED3\u675F\u6216\u786E\u8BA4\u7684\u4E8B\u5B9E\uFF0C\u4E0D\u590D\u5236\u5168\u90E8\u65E7\u72B6\u6001\u3002
2. \u73A9\u5BB6\u8F93\u5165\u4E2D\u7684\u52A8\u4F5C\u548C\u5BF9\u767D\u53EF\u89C6\u4E3A\u5DF2\u58F0\u660E\u884C\u4E3A\uFF1B\u73A9\u5BB6\u9884\u8BBE\u7684\u5916\u90E8\u7ED3\u679C\u4E0D\u80FD\u5355\u72EC\u4F5C\u4E3A confirmed\u3002
3. \u4ED6\u4EBA\u9648\u8FF0\u3001\u4F20\u95FB\u548C\u63A8\u6D4B\u5FC5\u987B\u4F7F\u7528 reported \u6216 uncertain\uFF0C\u4E0D\u5F97\u5347\u7EA7\u4E3A confirmed\u3002
4. historical \u548C trace \u53EA\u4F5C\u4E3A\u603B\u7ED3\u7D20\u6750\uFF0C\u4E0D\u5F3A\u5236\u8FDB\u5165\u5F53\u524D\u6D3B\u8DC3\u72B6\u6001\u8868\u3002
5. turnSummary \u53EA\u6982\u62EC\u672C\u8F6E\u5DF2\u53D1\u751F\u4E8B\u5B9E\uFF0C\u4E0D\u7EED\u5199\u3001\u4E0D\u8BC4\u4EF7\u3002

\u7EF4\u62A4\u89C4\u5219\uFF1A
1. \u4FDD\u7559\u672A\u53D7\u672C\u8F6E\u5F71\u54CD\u3001\u4ECD\u6210\u7ACB\u7684\u72B6\u6001\u3002\u53EA\u6709\u672C\u8F6E\u660E\u786E\u6539\u53D8\u7684\u72B6\u6001\u624D\u66F4\u65B0\u3002
2. \u8FC7\u7A0B\u538B\u7F29\u4E3A\u5F53\u524D\u7ED3\u679C\uFF0C\u4E0D\u5199\u6D41\u6C34\u8D26\u3002\u672A\u786E\u8BA4\u3001\u51B2\u7A81\u548C\u8FDB\u884C\u4E2D\u4E8B\u9879\u4E0D\u5F97\u5F3A\u884C\u95ED\u5408\u3002
3. \u5C3D\u91CF\u4FDD\u7559\u4E0A\u4E00\u4EFD\u5FEB\u7167\u7684\u7A33\u5B9Aid\uFF1B\u65B0\u589E\u5BF9\u8C61\u624D\u521B\u5EFA\u65B0id\u3002
4. snapshot \u5FC5\u987B\u4EE5 facts \u548C\u4E0A\u4E00\u4EFD\u72B6\u6001\u8868\u4E3A\u4F9D\u636E\uFF1B\u5916\u90E8\u7ED3\u679C\u4EE5AI\u6B63\u6587\u4E0E\u5DF2\u6709\u72B6\u6001\u4E2D\u7684\u53EF\u89C2\u5BDF\u4E8B\u5B9E\u4E3A\u51C6\u3002
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
{"turnSummary":"\u672C\u8F6E\u4E8B\u5B9E\u6458\u8981","facts":[{"id":"fact_1","type":"event","entityId":"event_x","title":"\u4E8B\u4EF6\u540D\u79F0","content":"\u53EF\u89C2\u5BDF\u4E8B\u5B9E","status":"\u8FDB\u884C\u4E2D","keywords":["\u5173\u952E\u8BCD"],"operation":"update","confidence":"confirmed"}],"snapshot":${stateSchemaDescription()}}`;
}
function stateUserPrompt(previous, playerText, assistantText, repair = false) {
  return `\u3010\u4E0A\u4E00\u4EFD\u72B6\u6001\u8868\u3011
${JSON.stringify(previous, null, 2)}

\u3010\u73A9\u5BB6\u672C\u8F6E\u8F93\u5165\u3011
${playerText || "\uFF08\u7A7A\uFF09"}

\u3010AI\u672C\u8F6E\u6B63\u6587\u3011
${assistantText}

\u8F93\u51FA\u6807\u51C6\u5316\u4E8B\u5B9E\u4E0E\u66F4\u65B0\u540E\u7684\u5B8C\u6574\u72B6\u6001\u5FEB\u7167\u3002${repair ? "\n\u4E0A\u4E00\u6B21\u8F93\u51FA\u65E0\u6CD5\u89E3\u6790\uFF1B\u8FD9\u6B21\u53EA\u8F93\u51FA\u5408\u6CD5JSON\u5BF9\u8C61\u3002" : ""}`;
}
function rowSchema(lifecycle = false) {
  const properties = {
    id: { type: "string" },
    title: { type: "string" },
    content: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
    status: { type: "string" }
  };
  if (lifecycle) {
    properties.lifecycle = {
      type: "object",
      properties: {
        existence: { type: "string" },
        activity: { type: "string" },
        memory: { type: "string" },
        evidenceLevel: { type: "string" },
        evidence: { type: "string" },
        returnConditions: { type: "array", items: { type: "string" } },
        returnBlockers: { type: "array", items: { type: "string" } }
      },
      required: ["existence", "activity", "memory", "evidenceLevel", "evidence", "returnConditions", "returnBlockers"],
      additionalProperties: false
    };
  }
  return {
    type: "object",
    properties,
    required: ["id", "title", "content", "keywords", "status", ...lifecycle ? ["lifecycle"] : []],
    additionalProperties: false
  };
}
function stateJsonSchema() {
  const snapshotProperties = Object.fromEntries([
    ["focus", rowSchema(true)],
    ["spacetime", rowSchema()],
    ["characters", rowSchema(true)],
    ["relationships", rowSchema()],
    ["items", rowSchema()],
    ["skills", rowSchema()],
    ["events", rowSchema()],
    ["regions", rowSchema()],
    ["foundations", rowSchema()]
  ].map(([key, schema]) => [key, { type: "array", items: schema }]));
  return {
    name: "MirrorAbyssStateResult",
    description: "\u955C\u6E0A\u4E8B\u5B9E\u548C\u5B8C\u6574\u72B6\u6001\u8868",
    strict: true,
    value: {
      type: "object",
      properties: {
        turnSummary: { type: "string" },
        facts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { type: "string" },
              entityId: { type: "string" },
              title: { type: "string" },
              content: { type: "string" },
              status: { type: "string" },
              keywords: { type: "array", items: { type: "string" } },
              operation: { type: "string" },
              confidence: { type: "string" }
            },
            required: ["id", "type", "entityId", "title", "content", "status", "keywords", "operation", "confidence"],
            additionalProperties: false
          }
        },
        snapshot: {
          type: "object",
          properties: snapshotProperties,
          required: ["focus", "spacetime", "characters", "relationships", "items", "skills", "events", "regions", "foundations"],
          additionalProperties: false
        }
      },
      required: ["turnSummary", "facts", "snapshot"],
      additionalProperties: false
    }
  };
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
function cloneProtectedRow(row) {
  return {
    ...row,
    keywords: [...row.keywords],
    ...row.lifecycle ? {
      lifecycle: {
        ...row.lifecycle,
        returnConditions: [...row.lifecycle.returnConditions],
        returnBlockers: [...row.lifecycle.returnBlockers]
      }
    } : {}
  };
}
function preserveProtectedRows(previous, next) {
  for (const key of TABLE_KEYS) {
    const nextIndexById = new Map(next[key].map((row, index) => [row.id, index]));
    for (const row of previous[key]) {
      if (row.source !== "manual" && !row.locked) continue;
      const protectedRow = cloneProtectedRow(row);
      const existingIndex = nextIndexById.get(row.id);
      if (existingIndex === void 0) {
        nextIndexById.set(row.id, next[key].length);
        next[key].push(protectedRow);
      } else {
        next[key][existingIndex] = protectedRow;
      }
    }
  }
  return next;
}
async function runStateExtraction(artifact, force = false) {
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
      structureDescription: `{"turnSummary":"...","facts":[{"id":"...","type":"event","entityId":"...","title":"...","content":"...","status":"...","keywords":["..."],"operation":"update","confidence":"confirmed"}],"snapshot":${stateSchemaDescription()}}`,
      allowRepair: settings.repairInvalidJsonOnce,
      jsonSchema: stateJsonSchema()
    });
    if (!parsed.snapshot || typeof parsed.snapshot !== "object") {
      throw new Error("\u72B6\u6001\u8868\u8FD4\u56DE\u7F3A\u5C11 snapshot \u6839\u5BF9\u8C61");
    }
    for (const key of TABLE_KEYS) {
      if (!Array.isArray(parsed.snapshot[key])) throw new Error(`\u72B6\u6001\u8868\u8FD4\u56DE\u7F3A\u5C11 ${key} \u6570\u7EC4`);
    }
    assertArtifactCommitCurrent(artifact);
    const normalized = preservePersistentCharacters(previous, preserveProtectedRows(previous, normalizeSnapshot(parsed.snapshot, previous)));
    artifact.factPackage = normalizeFactPackage(parsed, artifact.messageKey);
    artifact.snapshot = normalized;
    markStage(artifact, "state", "success");
    await putArtifact(artifact);
    return normalized;
  } catch (error) {
    if (error instanceof Error && ["AbortError", "CommitRejectedError"].includes(error.name)) throw error;
    markStage(artifact, "state", "failed", toErrorMessage(error));
    await putArtifact(artifact);
    throw error;
  }
}

// src/pipeline/task-queue.ts
function cancelledError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
function elapsed(startedAt, finishedAt = Date.now()) {
  return startedAt === void 0 ? void 0 : Math.max(0, finishedAt - startedAt);
}
var DEFAULT_PRIORITIES = {
  audit: 100,
  revision: 100,
  state: 90,
  manual: 70,
  sync: 40,
  smallSummary: 30,
  largeSummary: 10
};
var TaskQueue = class _TaskQueue {
  static MAX_TASKS = 200;
  inFlight = /* @__PURE__ */ new Map();
  tasks = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  accepting = true;
  generation = 0;
  sequence = 0;
  pending = [];
  active = null;
  idleWaiters = /* @__PURE__ */ new Set();
  setAccepting(accepting) {
    if (this.accepting && !accepting) {
      this.generation += 1;
      this.cancelPending(() => true, "\u955C\u6E0A\u5DF2\u7981\u7528\uFF0C\u6392\u961F\u4EFB\u52A1\u5DF2\u53D6\u6D88");
    }
    this.accepting = accepting;
    if (accepting) this.pump();
  }
  isTerminal(task) {
    return !["running", "queued"].includes(String(task.state));
  }
  pruneTasks() {
    while (this.tasks.size > _TaskQueue.MAX_TASKS) {
      const removable = [...this.tasks.entries()].find(([, task]) => this.isTerminal(task));
      if (!removable) break;
      this.tasks.delete(removable[0]);
    }
  }
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
  list() {
    return [...this.tasks.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  has(key) {
    return this.inFlight.has(key);
  }
  clearHistory() {
    for (const [id, task] of this.tasks) {
      if (this.isTerminal(task)) this.tasks.delete(id);
    }
    this.notify();
  }
  resetRuntime() {
    this.generation += 1;
    this.cancelPending(() => true, "\u955C\u6E0A\u8FD0\u884C\u73AF\u5883\u5DF2\u91CD\u7F6E\uFF0C\u6392\u961F\u4EFB\u52A1\u5DF2\u53D6\u6D88");
    this.clearHistory();
    this.notify();
  }
  resolveIdle() {
    if (this.active || this.pending.length) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }
  async whenIdle() {
    if (!this.active && !this.pending.length) return;
    await new Promise((resolve) => this.idleWaiters.add(resolve));
  }
  cancelPendingByChatKey(chatKey, reason = "\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u65E7\u804A\u5929\u6392\u961F\u4EFB\u52A1\u5DF2\u53D6\u6D88") {
    return this.cancelPending((job) => job.chatKey === chatKey, reason);
  }
  cancelPendingOutsideChat(chatKey, reason = "\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u65E7\u804A\u5929\u6392\u961F\u4EFB\u52A1\u5DF2\u53D6\u6D88") {
    return this.cancelPending((job) => Boolean(job.chatKey && job.chatKey !== chatKey), reason);
  }
  cancelPendingDerivedByChatKey(chatKey, reason = "\u5DF2\u6709\u66F4\u65B0\u7684\u6B63\u6587\u72B6\u6001\uFF0C\u65E7\u6D3E\u751F\u4EFB\u52A1\u5DF2\u53D6\u6D88") {
    return this.cancelPending(
      (job) => job.chatKey === chatKey && String(job.task.key).includes(":derived:"),
      reason
    );
  }
  cancelPending(predicate, reason) {
    const remaining = [];
    let cancelled = 0;
    const now = Date.now();
    for (const job of this.pending) {
      if (!predicate(job)) {
        remaining.push(job);
        continue;
      }
      cancelled += 1;
      job.task.state = "cancelled";
      job.task.error = reason;
      job.task.finishedAt = nowIso();
      job.task.queueWaitMs = elapsed(job.task.createdAtMs, now);
      job.task.totalMs = elapsed(job.task.createdAtMs, now);
      if (this.inFlight.get(job.task.key) === job.promise) this.inFlight.delete(job.task.key);
      job.reject(cancelledError(reason));
    }
    this.pending = remaining;
    if (cancelled) {
      this.pruneTasks();
      this.notify();
    }
    this.resolveIdle();
    return cancelled;
  }
  /** 从 pending 中选择最高优先级任务；同优先级保持进入顺序。 */
  selectNext() {
    if (!this.pending.length) return null;
    let selectedIndex = 0;
    for (let index = 1; index < this.pending.length; index += 1) {
      const candidate = this.pending[index];
      const selected = this.pending[selectedIndex];
      if (candidate.priority > selected.priority || candidate.priority === selected.priority && candidate.sequence < selected.sequence) {
        selectedIndex = index;
      }
    }
    return this.pending.splice(selectedIndex, 1)[0] ?? null;
  }
  pump() {
    if (this.active || !this.accepting) {
      this.resolveIdle();
      return;
    }
    const job = this.selectNext();
    if (!job) {
      this.resolveIdle();
      return;
    }
    this.active = job;
    const task = job.task;
    const startedMs = Date.now();
    task.state = "running";
    task.startedAt = nowIso();
    task.startedAtMs = startedMs;
    task.queueWaitMs = elapsed(task.createdAtMs, startedMs);
    this.notify();
    const guard = {
      generation: job.generation,
      assertCurrent: () => {
        if (!this.accepting || job.generation !== this.generation) {
          throw cancelledError("\u955C\u6E0A\u751F\u547D\u5468\u671F\u5DF2\u53D8\u5316\uFF0C\u65E7\u4EFB\u52A1\u7ED3\u679C\u4E0D\u518D\u63D0\u4EA4");
        }
      }
    };
    void Promise.resolve().then(async () => {
      guard.assertCurrent();
      const result = await job.work(guard);
      guard.assertCurrent();
      return result;
    }).then((result) => {
      task.state = "success";
      job.resolve(result);
    }).catch((error) => {
      const cancelled = error instanceof Error && error.name === "AbortError";
      task.state = cancelled ? "cancelled" : "failed";
      task.error = toErrorMessage(error);
      job.reject(error);
    }).finally(() => {
      const finishedMs = Date.now();
      task.finishedAt = nowIso();
      task.runMs = elapsed(startedMs, finishedMs);
      task.totalMs = elapsed(task.createdAtMs, finishedMs);
      if (this.inFlight.get(task.key) === job.promise) this.inFlight.delete(task.key);
      if (this.active === job) this.active = null;
      this.pruneTasks();
      this.notify();
      this.pump();
    });
  }
  /**
   * 相同 key 的任务共享同一 Promise；generation 与 guard 共同阻止禁用/重启后的旧任务提交。
   */
  run(key, label, kind, work, options = {}) {
    if (!this.accepting) return Promise.reject(cancelledError("\u955C\u6E0A\u5DF2\u7981\u7528\uFF0C\u4E0D\u518D\u63A5\u53D7\u65B0\u4EFB\u52A1"));
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const createdMs = Date.now();
    const priority = Number.isFinite(options.priority) ? Number(options.priority) : DEFAULT_PRIORITIES[String(kind)] ?? 50;
    const task = {
      id: makeId("task"),
      key,
      label,
      kind,
      state: "queued",
      createdAt: nowIso(),
      createdAtMs: createdMs,
      priority,
      chatKey: options.chatKey
    };
    this.tasks.set(task.id, task);
    let resolve;
    let reject;
    const promise = new Promise((resolveValue, rejectValue) => {
      resolve = resolveValue;
      reject = rejectValue;
    });
    const job = {
      task,
      work,
      generation: this.generation,
      sequence: this.sequence += 1,
      priority,
      chatKey: options.chatKey,
      promise,
      resolve,
      reject
    };
    this.pending.push(job);
    this.inFlight.set(key, promise);
    this.pruneTasks();
    this.notify();
    this.pump();
    return promise;
  }
};
var taskQueue = new TaskQueue();

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
function notifyFrom(startIndex) {
  for (let index = Math.max(0, startIndex); index < getChat().length; index += 1) {
    notify(index, getAttachedArtifact(getMessage(index)));
  }
}
function resolveMessageIndex(payload) {
  if (Number.isInteger(payload)) return Number(payload);
  const candidates = [payload?.messageId, payload?.message_id, payload?.mesId, payload?.mesid, payload?.index];
  for (const candidate of candidates) {
    if (candidate !== void 0 && candidate !== null && Number.isInteger(Number(candidate))) return Number(candidate);
  }
  const chat = getChat();
  const direct = chat.indexOf(payload);
  if (direct >= 0) return direct;
  const nested = payload?.message;
  const nestedIndex = nested ? chat.indexOf(nested) : -1;
  return nestedIndex >= 0 ? nestedIndex : -1;
}
function resolveChangedIndex(payload) {
  if (Number.isInteger(payload)) return Number(payload);
  const candidates = [payload?.messageId, payload?.message_id, payload?.mesId, payload?.mesid, payload?.index];
  for (const candidate of candidates) {
    if (candidate !== void 0 && candidate !== null && Number.isInteger(Number(candidate))) return Number(candidate);
  }
  return null;
}
async function pauseLorebookForHistoryChange(chatKey) {
  try {
    await pauseCurrentChatLorebookEntries(chatKey);
  } catch (error) {
    console.warn("[MirrorAbyss] failed to pause stale lorebook entries", error);
    toast("warning", `\u5386\u53F2\u6570\u636E\u5DF2\u6682\u505C\uFF0C\u4F46\u4E16\u754C\u4E66\u6761\u76EE\u6682\u505C\u5931\u8D25\uFF1A${toErrorMessage(error)}\u3002\u8BF7\u907F\u514D\u7EE7\u7EED\u751F\u6210\u5E76\u624B\u52A8\u91CD\u8BD5\u5386\u53F2\u91CD\u7B97`);
  }
}
async function saveArtifactToMessage(index, artifact) {
  assertArtifactCommitCurrent(artifact);
  const message = getMessage(index);
  if (!message || message.is_user) throw new Error("\u539FAI\u6B63\u6587\u5DF2\u4E0D\u5B58\u5728\uFF0C\u8BF7\u91CD\u65B0\u6574\u7406");
  attachArtifactToMessage(message, artifact);
  await putArtifact(artifact);
  await persistChatFor(artifact.chatKey);
  notify(index, artifact);
}
async function loadOrCreateArtifact(index, _force, historyRevision, taskGuard) {
  const message = getMessage(index);
  if (!isProcessableAssistantMessage(message)) throw new Error("\u76EE\u6807\u4E0D\u662F\u6709\u6548AI\u6B63\u6587");
  const fingerprint = messageFingerprint(index);
  let artifact = getAttachedArtifact(message);
  try {
    if (!artifact || artifact.chatKey !== currentChatKey() || artifact.sourceFingerprint !== fingerprint) {
      artifact = createArtifact(message, index);
    }
    if (historyRevision !== void 0) bindArtifactHistoryRevision(artifact, historyRevision);
    if (taskGuard) bindArtifactTaskGuard(artifact, taskGuard);
    assertArtifactCommitCurrent(artifact);
    attachArtifactToMessage(message, artifact);
    await persistChatFor(artifact.chatKey);
    await putArtifact(artifact);
    artifact.stages.revision ||= { status: "idle", attempts: 0 };
    return artifact;
  } catch (error) {
    if (artifact && historyRevision !== void 0) unbindArtifactHistoryRevision(artifact, historyRevision);
    if (artifact && taskGuard) unbindArtifactTaskGuard(artifact, taskGuard);
    throw error;
  }
}
async function commitCoreState(index, artifact) {
  if (!artifact.snapshot || artifact.stages.state.status !== "success") {
    throw new Error("\u72B6\u6001\u8868\u5C1A\u672A\u6210\u529F\uFF0C\u4E0D\u80FD\u63D0\u4EA4\u6838\u5FC3\u7ED3\u679C");
  }
  assertArtifactCommitCurrent(artifact);
  const chatState = await getChatState(artifact.chatKey);
  if (!chatState.processedMessageKeys.includes(artifact.messageKey)) {
    chatState.processedMessageKeys.push(artifact.messageKey);
  }
  chatState.latestSnapshotMessageKey = artifact.messageKey;
  chatState.updatedAt = nowIso();
  assertArtifactCommitCurrent(artifact);
  await putChatState(chatState);
  await saveArtifactToMessage(index, artifact);
}
async function prepareDerivedStageStatuses(artifact) {
  const settings = getSettings();
  const chatState = await getChatState(artifact.chatKey);
  const summaryEnabled = Boolean(settings.autoSmallSummary || settings.autoLargeSummary);
  markStage(artifact, "summary", summaryEnabled ? "queued" : "skipped");
  if (chatState.historyInvalidation) {
    markStage(artifact, "sync", "blocked", "\u5386\u53F2\u6D88\u606F\u5DF2\u53D8\u5316\uFF0C\u7B49\u5F85\u624B\u52A8\u91CD\u7B97");
  } else {
    markStage(artifact, "sync", settings.lorebookSync ? "queued" : "skipped");
  }
  await saveArtifactToMessage(artifact.messageIndex, artifact);
}
async function clearResolvedLatestHistoryInvalidation(index, artifact, force) {
  if (!force || index !== getChat().length - 1 || index !== latestAssistantIndex()) return false;
  const chatState = await getChatState(artifact.chatKey);
  const invalidation = chatState.historyInvalidation;
  if (!invalidation || invalidation.startIndex !== index || invalidation.reason === "deleted") return false;
  delete chatState.historyInvalidation;
  chatState.lastSyncError = void 0;
  chatState.lastSyncStatus = "idle";
  await putChatState(chatState);
  return true;
}
async function invalidateCoreAfterManualRevision(artifact, previousMessageKey) {
  const chatState = await getChatState(artifact.chatKey);
  const invalidSmallIds = new Set(
    chatState.smallSummaries.filter((summary) => summary.sourceKeys.includes(previousMessageKey)).map((summary) => summary.id)
  );
  chatState.smallSummaries = chatState.smallSummaries.filter((summary) => !invalidSmallIds.has(summary.id));
  chatState.largeSummaries = chatState.largeSummaries.filter(
    (summary) => !summary.sourceKeys.some((key) => invalidSmallIds.has(key))
  );
  chatState.processedMessageKeys = chatState.processedMessageKeys.filter((key) => key !== previousMessageKey);
  if (chatState.latestSnapshotMessageKey === previousMessageKey) {
    chatState.latestSnapshotMessageKey = chatState.processedMessageKeys.at(-1);
  }
  chatState.lastSyncStatus = "failed";
  chatState.lastSyncError = "\u6B63\u6587\u5DF2\u4FEE\u6B63\uFF0C\u7B49\u5F85\u91CD\u65B0\u751F\u6210\u8868\u683C\u540E\u540C\u6B65\u4E16\u754C\u4E66";
  artifact.factPackage = void 0;
  artifact.snapshot = void 0;
  markStage(artifact, "state", "idle");
  markStage(artifact, "summary", "idle");
  markStage(artifact, "sync", "blocked", "\u6B63\u6587\u5DF2\u4FEE\u6B63\uFF0C\u7B49\u5F85\u91CD\u65B0\u751F\u6210\u8868\u683C");
  await putChatState(chatState);
  await saveArtifactToMessage(artifact.messageIndex, artifact);
  try {
    await pauseCurrentChatLorebookEntries(artifact.chatKey);
  } catch (error) {
    console.warn("[MirrorAbyss] revised text saved but stale lorebook pause failed", error);
    toast("warning", `\u6B63\u6587\u5DF2\u4FEE\u6B63\uFF0C\u4F46\u65E7\u4E16\u754C\u4E66\u6761\u76EE\u6682\u505C\u5931\u8D25\uFF1A${toErrorMessage(error)}\u3002\u8BF7\u5728\u751F\u6210\u8868\u683C\u540E\u624B\u52A8\u540C\u6B65\u4E16\u754C\u4E66`);
  }
}
function derivedTaskError(error) {
  return error instanceof CommitRejectedError || error instanceof Error && error.name === "AbortError";
}
function queueAutomaticDerived(index, artifact, historyRevision) {
  const settings = getSettings();
  const chatKey = artifact.chatKey;
  const messageKey = artifact.messageKey;
  const runWithGuards = async (guard, work) => {
    if (currentChatKey() !== chatKey) throw new CommitRejectedError("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u65E7\u6D3E\u751F\u4EFB\u52A1\u4E0D\u518D\u8FD0\u884C");
    assertHistoryRevisionCurrent(chatKey, historyRevision);
    bindArtifactHistoryRevision(artifact, historyRevision);
    bindArtifactTaskGuard(artifact, guard);
    try {
      assertArtifactCommitCurrent(artifact);
      await work();
      assertArtifactCommitCurrent(artifact);
    } finally {
      unbindArtifactTaskGuard(artifact, guard);
      unbindArtifactHistoryRevision(artifact, historyRevision);
    }
  };
  const queueSync = () => {
    if (currentChatKey() !== chatKey || currentHistoryRevision(chatKey) !== historyRevision || !getSettings().enabled) return;
    if (!settings.lorebookSync) return;
    const key2 = `${PIPELINE_VERSION}:derived:sync:${chatKey}:${messageKey}`;
    void taskQueue.run(key2, `\u540E\u53F0\u540C\u6B65\u7B2C ${index + 1} \u6761\u6B63\u6587\u4E16\u754C\u4E66`, "sync", async (guard) => {
      await runWithGuards(guard, async () => {
        try {
          await syncLorebook(artifact);
        } finally {
          await saveArtifactToMessage(index, artifact);
        }
      });
    }, { priority: 40, chatKey }).catch((error) => {
      if (derivedTaskError(error)) return;
      console.warn("[MirrorAbyss] derived lorebook sync failed", error);
      toast("warning", `\u6838\u5FC3\u72B6\u6001\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u4E16\u754C\u4E66\u540C\u6B65\u5931\u8D25\uFF1A${toErrorMessage(error)}`);
    });
  };
  const queueLarge = () => {
    if (currentChatKey() !== chatKey || currentHistoryRevision(chatKey) !== historyRevision || !getSettings().enabled) return;
    if (!settings.autoLargeSummary) {
      queueSync();
      return;
    }
    const key2 = `${PIPELINE_VERSION}:derived:large:${chatKey}:${messageKey}`;
    void taskQueue.run(key2, `\u540E\u53F0\u751F\u6210\u7B2C ${index + 1} \u6761\u6B63\u6587\u5927\u603B\u7ED3`, "largeSummary", async (guard) => {
      await runWithGuards(guard, async () => {
        try {
          await runSummaryStage(artifact, "large");
        } finally {
          await saveArtifactToMessage(index, artifact);
        }
      });
    }, { priority: 10, chatKey }).then(queueSync, (error) => {
      if (derivedTaskError(error)) return;
      console.warn("[MirrorAbyss] derived large summary failed", error);
      toast("warning", `\u6838\u5FC3\u72B6\u6001\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u5927\u603B\u7ED3\u5931\u8D25\uFF1A${toErrorMessage(error)}`);
      if (currentChatKey() === chatKey && currentHistoryRevision(chatKey) === historyRevision && getSettings().enabled) queueSync();
    });
  };
  if (!settings.autoSmallSummary) {
    queueLarge();
    return;
  }
  const key = `${PIPELINE_VERSION}:derived:small:${chatKey}:${messageKey}`;
  void taskQueue.run(key, `\u540E\u53F0\u751F\u6210\u7B2C ${index + 1} \u6761\u6B63\u6587\u5C0F\u603B\u7ED3`, "smallSummary", async (guard) => {
    await runWithGuards(guard, async () => {
      try {
        await runSummaryStage(artifact, "small");
      } finally {
        await saveArtifactToMessage(index, artifact);
      }
    });
  }, { priority: 30, chatKey }).then(queueLarge, (error) => {
    if (derivedTaskError(error)) return;
    console.warn("[MirrorAbyss] derived small summary failed", error);
    toast("warning", `\u6838\u5FC3\u72B6\u6001\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u5C0F\u603B\u7ED3\u5931\u8D25\uFF1A${toErrorMessage(error)}`);
    if (currentChatKey() === chatKey && currentHistoryRevision(chatKey) === historyRevision && getSettings().enabled) queueLarge();
  });
}
async function processMessage(index, force = false, options = {}) {
  if (!getSettings().enabled) return null;
  const message = getMessage(index);
  if (!isProcessableAssistantMessage(message)) return null;
  const identity = messageIdentity(index);
  const scheduledFingerprint = messageFingerprint(index);
  const scheduledChatKey = currentChatKey();
  const scheduledHistoryRevision = currentHistoryRevision(scheduledChatKey);
  const key = `${PIPELINE_VERSION}:${scheduledChatKey}:${identity}`;
  return taskQueue.run(key, `\u5904\u7406\u7B2C ${index + 1} \u6761AI\u6B63\u6587`, "state", async (guard) => {
    const settings = getSettings();
    if (!settings.enabled) return null;
    if (currentChatKey() !== scheduledChatKey) return null;
    guard.assertCurrent();
    assertHistoryRevisionCurrent(scheduledChatKey, scheduledHistoryRevision);
    if (!isProcessableAssistantMessage(getMessage(index))) return null;
    if (messageFingerprint(index) !== scheduledFingerprint) {
      throw new CommitRejectedError("\u6B63\u6587\u5DF2\u7ECF\u53D8\u5316\uFF0C\u672C\u6B21\u6392\u961F\u4EFB\u52A1\u4E0D\u518D\u5904\u7406");
    }
    const artifact = await loadOrCreateArtifact(index, force, scheduledHistoryRevision, guard);
    notify(index, artifact);
    try {
      let audit = await runAudit(artifact, force);
      await saveArtifactToMessage(index, artifact);
      if (!audit.passed && settings.auditFailAction === "revise") {
        const revised = await runRevisionFlow(artifact);
        audit = revised.audit;
        await saveArtifactToMessage(index, artifact);
      }
      if (!audit.passed) {
        const failureAction = settings.auditFailAction === "revise" ? settings.revisionFallbackAction : settings.auditFailAction;
        await applyAuditFailureAction(artifact, failureAction);
        markStage(artifact, "state", "blocked", "\u89C4\u5219\u5BA1\u6838\u672A\u901A\u8FC7");
        markStage(artifact, "summary", "blocked", "\u89C4\u5219\u5BA1\u6838\u672A\u901A\u8FC7");
        markStage(artifact, "sync", "blocked", "\u89C4\u5219\u5BA1\u6838\u672A\u901A\u8FC7");
        await saveArtifactToMessage(index, artifact);
        return artifact;
      }
      if (settings.autoState || force) {
        await runStateExtraction(artifact, force);
        await saveArtifactToMessage(index, artifact);
      } else {
        if (!artifact.snapshot || artifact.stages.state.status !== "success") {
          markStage(artifact, "state", "skipped");
          markStage(artifact, "summary", "skipped");
          markStage(artifact, "sync", "skipped");
        }
        await saveArtifactToMessage(index, artifact);
      }
      if (artifact.snapshot && artifact.stages.state.status === "success") {
        await commitCoreState(index, artifact);
        await clearResolvedLatestHistoryInvalidation(index, artifact, force);
        await prepareDerivedStageStatuses(artifact);
        if (!options.skipDerived) {
          taskQueue.cancelPendingDerivedByChatKey(artifact.chatKey);
          queueAutomaticDerived(index, artifact, scheduledHistoryRevision);
        }
      }
      return artifact;
    } catch (error) {
      const messageText = toErrorMessage(error);
      console.error("[MirrorAbyss] pipeline failed", error);
      if (error instanceof CommitRejectedError) {
        toast("warning", messageText);
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") throw error;
      await saveArtifactToMessage(index, artifact);
      throw error;
    } finally {
      unbindArtifactTaskGuard(artifact, guard);
      unbindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
    }
  }, { priority: 90, chatKey: scheduledChatKey });
}
function scheduleMessage(payload, force = false, delay = 0) {
  if (!getSettings().enabled) return;
  const index = resolveMessageIndex(payload);
  if (index < 0) return;
  const message = getMessage(index);
  if (!isProcessableAssistantMessage(message)) return;
  const scheduledChatKey = currentChatKey();
  const scheduledIdentity = messageIdentity(index);
  const scheduledFingerprint = messageFingerprint(index);
  window.setTimeout(() => {
    void (async () => {
      if (!getSettings().enabled) return;
      if (currentChatKey() !== scheduledChatKey) return;
      const current = getMessage(index);
      if (!isProcessableAssistantMessage(current)) return;
      if (messageIdentity(index) !== scheduledIdentity || messageFingerprint(index) !== scheduledFingerprint) return;
      const state2 = await getChatState(scheduledChatKey);
      if (!force && state2.historyInvalidation) return;
      await processMessage(index, force);
    })().catch((error) => {
      if (error instanceof CommitRejectedError || error instanceof Error && error.name === "AbortError") return;
      console.error("[MirrorAbyss] scheduled processing failed", error);
      toast("error", `\u81EA\u52A8\u6574\u7406\u5931\u8D25\uFF1A${toErrorMessage(error)}`);
    });
  }, delay);
}
async function invalidateHistory(payload, reason) {
  if (!getSettings().enabled) return;
  const chatKey = currentChatKey();
  invalidateHistoryRevision(chatKey);
  abortActiveRequests();
  taskQueue.cancelPendingByChatKey(chatKey, "\u5386\u53F2\u6D88\u606F\u5DF2\u53D8\u5316\uFF0C\u65E7\u6392\u961F\u4EFB\u52A1\u5DF2\u53D6\u6D88");
  const eventIndex = resolveChangedIndex(payload);
  const scannedIndex = reason === "deleted" ? firstInconsistentArtifactIndex(getChat(), MODULE_NAME, messageIdentity, messageFingerprint) : null;
  const detectedIndex = reason === "deleted" ? scannedIndex === -1 ? null : scannedIndex : eventIndex;
  const state2 = await getChatState(chatKey);
  if (currentChatKey() !== chatKey) throw new Error("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u5386\u53F2\u53D8\u5316\u4E0D\u518D\u5199\u5165");
  if (detectedIndex === null) {
    state2.historyInvalidation = { reason, detectedAt: nowIso() };
    state2.lastSyncStatus = "failed";
    state2.lastSyncError = "\u68C0\u6D4B\u5230\u5386\u53F2\u5220\u9664\uFF0C\u4F46\u65E0\u6CD5\u5224\u65AD\u4F4D\u7F6E\uFF1B\u8BF7\u9009\u62E9\u91CD\u7B97\u8D77\u70B9";
    await putChatState(state2);
    await pauseLorebookForHistoryChange(chatKey);
    toast("warning", "\u68C0\u6D4B\u5230\u5386\u53F2\u6D88\u606F\u5220\u9664\uFF0C\u4F46\u65E0\u6CD5\u5224\u65AD\u4F4D\u7F6E\u3002\u73B0\u6709\u8BB0\u5FC6\u5DF2\u4FDD\u7559\uFF0C\u4E16\u754C\u4E66\u540C\u6B65\u6682\u505C\uFF1B\u8BF7\u5728\u955C\u6E0A\u4E2D\u9009\u62E9\u91CD\u7B97\u8D77\u70B9");
    notifyFrom(0);
    return;
  }
  const index = Math.max(0, detectedIndex);
  const startIndex = Math.min(index, state2.historyInvalidation?.startIndex ?? index);
  state2.historyInvalidation = { startIndex, reason, detectedAt: nowIso() };
  state2.lastSyncStatus = "failed";
  state2.lastSyncError = `\u5386\u53F2\u6D88\u606F\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u4ECE\u7B2C ${startIndex + 1} \u6761\u5F00\u59CB\u91CD\u7B97`;
  const validPrefixKeys = /* @__PURE__ */ new Set();
  for (let i = 0; i < startIndex; i += 1) {
    const attached = getAttachedArtifact(getMessage(i));
    if (attached) validPrefixKeys.add(attached.messageKey);
  }
  for (let i = startIndex; i < getChat().length; i += 1) {
    const message = getMessage(i);
    if (message?.extra?.[MODULE_NAME]) delete message.extra[MODULE_NAME];
  }
  const invalidSmallIds = new Set(
    state2.smallSummaries.filter((summary) => summary.sourceKeys.some((key) => !validPrefixKeys.has(key))).map((summary) => summary.id)
  );
  state2.smallSummaries = state2.smallSummaries.filter((summary) => !invalidSmallIds.has(summary.id));
  state2.largeSummaries = state2.largeSummaries.filter(
    (summary) => !summary.sourceKeys.some((key) => invalidSmallIds.has(key))
  );
  state2.processedMessageKeys = state2.processedMessageKeys.filter((key) => validPrefixKeys.has(key));
  state2.latestSnapshotMessageKey = state2.processedMessageKeys.at(-1);
  await persistChatFor(chatKey);
  await putChatState(state2);
  await pauseLorebookForHistoryChange(chatKey);
  notifyFrom(index);
  toast("warning", `\u5386\u53F2\u6D88\u606F\u5DF2\u53D8\u5316\uFF0C\u4E16\u754C\u4E66\u540C\u6B65\u5DF2\u6682\u505C\uFF1B\u8BF7\u5728\u955C\u6E0A\u4E2D\u4ECE\u7B2C ${startIndex + 1} \u6761\u5F00\u59CB\u91CD\u7B97`);
}
async function recalculateInvalidatedHistory() {
  if (!getSettings().enabled) throw new Error("\u955C\u6E0A\u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u542F\u7528");
  const chatKey = currentChatKey();
  const state2 = await getChatState(chatKey);
  const startIndex = state2.historyInvalidation?.startIndex;
  if (startIndex === void 0) throw new Error("\u5C1A\u672A\u9009\u62E9\u5386\u53F2\u91CD\u7B97\u8D77\u70B9");
  const endIndex = getChat().length;
  let latest = null;
  for (let index = startIndex; index < endIndex; index += 1) {
    if (currentChatKey() !== chatKey) throw new Error("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u5386\u53F2\u91CD\u7B97\u5DF2\u505C\u6B62");
    const message = getMessage(index);
    if (!isProcessableAssistantMessage(message)) continue;
    latest = await processMessage(index, true, { skipDerived: true });
    if (currentChatKey() !== chatKey) throw new Error("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u5386\u53F2\u91CD\u7B97\u5DF2\u505C\u6B62");
    if (!latest || latest.stages.state.status === "failed" || latest.stages.state.status === "blocked") {
      throw new Error(`\u7B2C ${index + 1} \u6761\u6D88\u606F\u91CD\u7B97\u5931\u8D25\uFF0C\u4E16\u754C\u4E66\u4ECD\u4FDD\u6301\u6682\u505C`);
    }
  }
  if (currentChatKey() !== chatKey) throw new Error("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u5386\u53F2\u91CD\u7B97\u5DF2\u505C\u6B62");
  const recoveryInfo = latest ? { index: latest.messageIndex, artifact: latest } : latestSnapshotArtifact();
  const freshState = await getChatState(chatKey);
  if (!recoveryInfo) {
    await clearCurrentChatLorebookEntries(chatKey);
    delete freshState.historyInvalidation;
    freshState.lastSyncError = void 0;
    freshState.lastSyncStatus = "success";
    freshState.lastSyncAt = nowIso();
    await putChatState(freshState);
    toast("success", "\u5386\u53F2\u6570\u636E\u91CD\u7B97\u5B8C\u6210\uFF1B\u5F53\u524D\u6CA1\u6709\u53EF\u53D1\u5E03\u72B6\u6001\uFF0C\u5DF2\u6E05\u9664\u672C\u804A\u5929\u7684\u955C\u6E0A\u4E16\u754C\u4E66\u6761\u76EE");
    return null;
  }
  delete freshState.historyInvalidation;
  freshState.lastSyncError = void 0;
  freshState.lastSyncStatus = "idle";
  await putChatState(freshState);
  const artifact = recoveryInfo.artifact;
  const revision = currentHistoryRevision(chatKey);
  const errors = [];
  await taskQueue.run(
    `${PIPELINE_VERSION}:history-recovery-derived:${chatKey}:${artifact.messageKey}`,
    "\u6062\u590D\u5386\u53F2\u603B\u7ED3\u4E0E\u4E16\u754C\u4E66",
    "smallSummary",
    async (guard) => {
      bindArtifactHistoryRevision(artifact, revision);
      bindArtifactTaskGuard(artifact, guard);
      try {
        try {
          await maybeRunSummaries(artifact, true, true);
        } catch (error) {
          if (derivedTaskError(error)) throw error;
          errors.push(`\u603B\u7ED3\uFF1A${toErrorMessage(error)}`);
        }
        await saveArtifactToMessage(recoveryInfo.index, artifact);
        if (getSettings().lorebookSync) {
          try {
            await syncLorebook(artifact);
          } catch (error) {
            if (derivedTaskError(error)) throw error;
            errors.push(`\u4E16\u754C\u4E66\uFF1A${toErrorMessage(error)}`);
          }
          await saveArtifactToMessage(recoveryInfo.index, artifact);
        }
      } finally {
        unbindArtifactTaskGuard(artifact, guard);
        unbindArtifactHistoryRevision(artifact, revision);
      }
    },
    { priority: 70, chatKey }
  );
  if (errors.length) {
    toast("warning", `\u5386\u53F2\u6838\u5FC3\u72B6\u6001\u5DF2\u91CD\u7B97\u5B8C\u6210\uFF0C\u4F46\u90E8\u5206\u6D3E\u751F\u6062\u590D\u5931\u8D25\uFF1A${errors.join("\uFF1B")}`);
  } else {
    toast("success", getSettings().lorebookSync ? "\u5386\u53F2\u6570\u636E\u91CD\u7B97\u5B8C\u6210\uFF0C\u4E16\u754C\u4E66\u540C\u6B65\u5DF2\u6062\u590D" : "\u5386\u53F2\u6570\u636E\u91CD\u7B97\u5B8C\u6210\uFF1B\u81EA\u52A8\u4E16\u754C\u4E66\u540C\u6B65\u5F53\u524D\u5DF2\u5173\u95ED");
  }
  return artifact;
}
async function chooseHistoryRecalculationStart(startIndex) {
  if (!getSettings().enabled) throw new Error("\u955C\u6E0A\u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u542F\u7528");
  const chatKey = currentChatKey();
  const state2 = await getChatState(chatKey);
  if (currentChatKey() !== chatKey) throw new Error("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u4E0D\u518D\u4FEE\u6539\u5386\u53F2\u91CD\u7B97\u8303\u56F4");
  if (!state2.historyInvalidation) throw new Error("\u5F53\u524D\u6CA1\u6709\u5F85\u5904\u7406\u7684\u5386\u53F2\u5931\u6548");
  const index = Math.max(0, Math.min(Math.trunc(startIndex), Math.max(0, getChat().length - 1)));
  state2.historyInvalidation.startIndex = index;
  const validPrefixKeys = /* @__PURE__ */ new Set();
  for (let i = 0; i < index; i += 1) {
    const attached = getAttachedArtifact(getMessage(i));
    if (attached) validPrefixKeys.add(attached.messageKey);
  }
  for (let i = index; i < getChat().length; i += 1) {
    const message = getMessage(i);
    if (message?.extra?.[MODULE_NAME]) delete message.extra[MODULE_NAME];
  }
  const invalidSmallIds = new Set(
    state2.smallSummaries.filter((summary) => summary.sourceKeys.some((key) => !validPrefixKeys.has(key))).map((summary) => summary.id)
  );
  state2.smallSummaries = state2.smallSummaries.filter((summary) => !invalidSmallIds.has(summary.id));
  state2.largeSummaries = state2.largeSummaries.filter(
    (summary) => !summary.sourceKeys.some((key) => invalidSmallIds.has(key))
  );
  state2.processedMessageKeys = state2.processedMessageKeys.filter((key) => validPrefixKeys.has(key));
  state2.latestSnapshotMessageKey = state2.processedMessageKeys.at(-1);
  state2.lastSyncError = `\u5DF2\u9009\u62E9\u4ECE\u7B2C ${index + 1} \u6761\u6D88\u606F\u5F00\u59CB\u91CD\u7B97`;
  await persistChatFor(chatKey);
  await putChatState(state2);
  notifyFrom(index);
}
async function retryStage(index, stage) {
  if (!getSettings().enabled) throw new Error("\u955C\u6E0A\u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u542F\u7528");
  const latestSnapshot = latestSnapshotArtifact();
  if (["audit", "revision", "state"].includes(stage) && index !== latestAssistantIndex()) {
    throw new Error("\u666E\u901A\u91CD\u8BD5\u53EA\u9002\u7528\u4E8E\u6700\u65B0AI\u6B63\u6587\uFF1B\u65E7\u6B63\u6587\u8BF7\u901A\u8FC7\u5386\u53F2\u53D8\u66F4\u63D0\u793A\u4ECE\u8BE5\u6761\u5F00\u59CB\u91CD\u7B97");
  }
  if (["summary", "sync"].includes(stage) && latestSnapshot?.index !== index) {
    throw new Error("\u603B\u7ED3\u548C\u4E16\u754C\u4E66\u53EA\u80FD\u57FA\u4E8E\u6700\u65B0\u6210\u529F\u72B6\u6001\u8868");
  }
  const chatKey = currentChatKey();
  const scheduledHistoryRevision = currentHistoryRevision(chatKey);
  const identity = messageIdentity(index);
  const key = `${PIPELINE_VERSION}:retry:${stage}:${chatKey}:${identity}`;
  const queueKind = stage === "sync" ? "sync" : stage === "summary" ? "smallSummary" : stage;
  return taskQueue.run(key, `\u91CD\u8BD5${stage}`, queueKind, async (guard) => {
    if (currentChatKey() !== chatKey) return null;
    assertHistoryRevisionCurrent(chatKey, scheduledHistoryRevision);
    const artifact = latestSnapshot?.index === index ? latestSnapshot.artifact : await loadOrCreateArtifact(index, false, scheduledHistoryRevision, guard);
    bindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
    bindArtifactTaskGuard(artifact, guard);
    try {
      if (stage === "audit") {
        const audit = await runAudit(artifact, true);
        if (!audit.passed) {
          markStage(artifact, "state", "blocked", "\u89C4\u5219\u5BA1\u6838\u672A\u901A\u8FC7");
          markStage(artifact, "summary", "blocked", "\u89C4\u5219\u5BA1\u6838\u672A\u901A\u8FC7");
          markStage(artifact, "sync", "blocked", "\u89C4\u5219\u5BA1\u6838\u672A\u901A\u8FC7");
          const action = getSettings().auditFailAction;
          if (action !== "revise") await applyAuditFailureAction(artifact, action);
          try {
            await pauseCurrentChatLorebookEntries(artifact.chatKey);
          } catch (error) {
            console.warn("[MirrorAbyss] audit blocked but lorebook pause failed", error);
            toast("warning", `\u5BA1\u6838\u5DF2\u963B\u65AD\u6B63\u6587\uFF0C\u4F46\u65E7\u4E16\u754C\u4E66\u6761\u76EE\u6682\u505C\u5931\u8D25\uFF1A${toErrorMessage(error)}`);
          }
        } else if (!artifact.snapshot || artifact.stages.state.status !== "success") {
          markStage(artifact, "state", "idle");
          markStage(artifact, "summary", "idle");
          markStage(artifact, "sync", "idle");
        }
        await saveArtifactToMessage(index, artifact);
      }
      if (stage === "revision") {
        if (!artifact.audit || artifact.audit.passed) throw new Error("\u5F53\u524D\u6B63\u6587\u6CA1\u6709\u5F85\u4FEE\u6B63\u7684\u5BA1\u6838\u8FDD\u89C4");
        const previousMessageKey = artifact.messageKey;
        const result = await runRevisionFlow(artifact);
        await saveArtifactToMessage(index, artifact);
        if (result.approved) {
          await invalidateCoreAfterManualRevision(artifact, previousMessageKey);
        } else {
          await applyAuditFailureAction(artifact, getSettings().revisionFallbackAction);
          await saveArtifactToMessage(index, artifact);
        }
      }
      if (stage === "state") {
        if (getSettings().auditEnabled && !artifact.audit?.passed) {
          throw new Error("\u89C4\u5219\u5BA1\u6838\u5C1A\u672A\u901A\u8FC7\uFF0C\u4E0D\u80FD\u751F\u6210\u72B6\u6001\u8868");
        }
        await runStateExtraction(artifact, true);
        await saveArtifactToMessage(index, artifact);
        await commitCoreState(index, artifact);
        await clearResolvedLatestHistoryInvalidation(index, artifact, true);
        await prepareDerivedStageStatuses(artifact);
        taskQueue.cancelPendingDerivedByChatKey(artifact.chatKey);
        queueAutomaticDerived(index, artifact, scheduledHistoryRevision);
      }
      if (stage === "summary") {
        const errors = [];
        try {
          await maybeRunSummaries(artifact, true, true);
        } catch (error) {
          if (derivedTaskError(error)) throw error;
          errors.push(`\u603B\u7ED3\uFF1A${toErrorMessage(error)}`);
        }
        await saveArtifactToMessage(index, artifact);
        if (getSettings().lorebookSync) {
          try {
            await syncLorebook(artifact);
          } catch (error) {
            if (derivedTaskError(error)) throw error;
            errors.push(`\u4E16\u754C\u4E66\uFF1A${toErrorMessage(error)}`);
          }
          await saveArtifactToMessage(index, artifact);
        }
        if (errors.length) throw new Error(errors.join("\uFF1B"));
      }
      if (stage === "sync") {
        await syncLorebook(artifact, true);
        await saveArtifactToMessage(index, artifact);
      }
      return artifact;
    } finally {
      unbindArtifactTaskGuard(artifact, guard);
      unbindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
    }
  }, { priority: 70, chatKey });
}
async function forceSummary(_index, kind) {
  if (!getSettings().enabled) throw new Error("\u955C\u6E0A\u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u542F\u7528");
  const latest = latestSnapshotArtifact();
  if (!latest) throw new Error("\u6CA1\u6709\u6210\u529F\u72B6\u6001\u8868\uFF0C\u4E0D\u80FD\u751F\u6210\u603B\u7ED3");
  const { index, artifact } = latest;
  const scheduledHistoryRevision = currentHistoryRevision(artifact.chatKey);
  const key = `${PIPELINE_VERSION}:force-summary:${kind}:${artifact.chatKey}:${artifact.messageKey}`;
  return taskQueue.run(key, `\u7ACB\u5373${kind === "small" ? "\u5C0F" : "\u5927"}\u603B\u7ED3`, kind === "small" ? "smallSummary" : "largeSummary", async (guard) => {
    if (currentChatKey() !== artifact.chatKey) return null;
    assertHistoryRevisionCurrent(artifact.chatKey, scheduledHistoryRevision);
    bindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
    bindArtifactTaskGuard(artifact, guard);
    const errors = [];
    try {
      try {
        await runSummaryStage(artifact, kind, true);
      } catch (error) {
        if (derivedTaskError(error)) throw error;
        errors.push(`${kind === "small" ? "\u5C0F\u603B\u7ED3" : "\u5927\u603B\u7ED3"}\uFF1A${toErrorMessage(error)}`);
      }
      await saveArtifactToMessage(index, artifact);
      if (getSettings().lorebookSync) {
        try {
          await syncLorebook(artifact);
        } catch (error) {
          if (derivedTaskError(error)) throw error;
          errors.push(`\u4E16\u754C\u4E66\uFF1A${toErrorMessage(error)}`);
        }
        await saveArtifactToMessage(index, artifact);
      }
      if (errors.length) throw new Error(errors.join("\uFF1B"));
      return artifact;
    } finally {
      unbindArtifactTaskGuard(artifact, guard);
      unbindArtifactHistoryRevision(artifact, scheduledHistoryRevision);
    }
  }, { priority: 70, chatKey: artifact.chatKey });
}
function getArtifactAt(index) {
  return getAttachedArtifact(getMessage(index));
}
async function resetCurrentGame() {
  const sourceChatKey = currentChatKey();
  taskQueue.setAccepting(false);
  abortActiveRequests();
  taskQueue.resetRuntime();
  try {
    await taskQueue.whenIdle();
    if (currentChatKey() !== sourceChatKey) throw new Error("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u5DF2\u505C\u6B62\u91CD\u7F6E\u5F53\u524D\u6E38\u620F");
    const lorebookEntries = await clearCurrentChatLorebookEntries(sourceChatKey);
    if (currentChatKey() !== sourceChatKey) throw new Error("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u5DF2\u505C\u6B62\u91CD\u7F6E\u5F53\u524D\u6E38\u620F");
    let messages = 0;
    for (const message of getChat()) {
      const extra = message?.extra;
      const hadCurrent = Boolean(extra?.[MODULE_NAME]);
      const hadLegacy = Boolean(extra?.[LEGACY_MODULE_NAME]);
      if (hadCurrent) {
        delete extra[MODULE_NAME];
      }
      if (hadLegacy) {
        delete extra[LEGACY_MODULE_NAME];
      }
      if (hadCurrent || hadLegacy) {
        messages += 1;
      }
    }
    const namespace = getChatMetadataNamespace();
    delete namespace.state;
    delete namespace.lorebookName;
    namespace.updatedAt = nowIso();
    const context = getContext();
    if (context.chatMetadata?.[LEGACY_MODULE_NAME]) delete context.chatMetadata[LEGACY_MODULE_NAME];
    await persistChatFor(sourceChatKey);
    if (currentChatKey() !== sourceChatKey) throw new Error("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u5DF2\u505C\u6B62\u91CD\u7F6E\u5F53\u524D\u6E38\u620F");
    await persistMetadataFor(sourceChatKey);
    notifyFrom(0);
    return { messages, lorebookEntries };
  } finally {
    taskQueue.setAccepting(getSettings().enabled);
  }
}
function latestArtifact() {
  const chat = getChat();
  const chatKey = currentChatKey();
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    const artifact = getAttachedArtifact(chat[i]);
    if (artifact?.chatKey === chatKey) return { index: i, artifact };
  }
  return null;
}
function latestSnapshotArtifact() {
  const chat = getChat();
  const chatKey = currentChatKey();
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    const artifact = getAttachedArtifact(chat[i]);
    if (artifact?.chatKey === chatKey && artifact.snapshot && artifact.stages.state.status === "success") {
      return { index: i, artifact };
    }
  }
  return null;
}
function installPipelineEventHandlers() {
  const context = globalThis.SillyTavern.getContext();
  const { eventSource, event_types } = context;
  const onReceived = (payload) => scheduleMessage(payload, false);
  const handleInvalidation = (payload, reason) => {
    if (!getSettings().enabled) return;
    void invalidateHistory(payload, reason).catch((error) => {
      console.error("[MirrorAbyss] history invalidation failed", error);
      toast("error", `\u5386\u53F2\u53D8\u5316\u5904\u7406\u5931\u8D25\uFF1A${toErrorMessage(error)}`);
    });
  };
  const onEdited = (payload) => handleInvalidation(payload, "edited");
  const onSwiped = (payload) => handleInvalidation(payload, "swiped");
  const onDeleted = (payload) => handleInvalidation(payload, "deleted");
  const onChatChanged = () => {
    abortActiveRequests();
    taskQueue.cancelPendingOutsideChat(currentChatKey());
  };
  eventSource.on(event_types.MESSAGE_RECEIVED, onReceived);
  eventSource.on(event_types.MESSAGE_EDITED, onEdited);
  eventSource.on(event_types.MESSAGE_SWIPED, onSwiped);
  eventSource.on(event_types.MESSAGE_DELETED, onDeleted);
  eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
  return () => {
    eventSource.removeListener?.(event_types.MESSAGE_RECEIVED, onReceived);
    eventSource.removeListener?.(event_types.MESSAGE_EDITED, onEdited);
    eventSource.removeListener?.(event_types.MESSAGE_SWIPED, onSwiped);
    eventSource.removeListener?.(event_types.MESSAGE_DELETED, onDeleted);
    eventSource.removeListener?.(event_types.CHAT_CHANGED, onChatChanged);
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

// src/ui/diagnostics.ts
async function runDiagnostics() {
  const checks = [];
  const context = tryGetContext();
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
    detail: typeof context?.generateRaw === "function" ? "generateRaw\u53EF\u7528" : "\u5F53\u524D\u8FDE\u63A5\u6A21\u5F0F\u4E0D\u53EF\u7528\uFF1B\u8BF7\u9009\u62E9\u53EF\u7528\u7684Connection Profile"
  });
  checks.push({
    id: "connectionService",
    label: "Connection Profile\u9694\u79BB\u8C03\u7528",
    status: typeof context?.ConnectionManagerRequestService?.sendRequest === "function" ? "ok" : "warn",
    detail: typeof context?.ConnectionManagerRequestService?.sendRequest === "function" ? "ConnectionManagerRequestService\u53EF\u7528\uFF0C\u4E0D\u9700\u8981\u5207\u6362\u5168\u5C40\u8FDE\u63A5" : "\u4E0D\u53EF\u7528\uFF1BProfile\u6A21\u5F0F\u4E0D\u53EF\u7528\uFF0C\u4ECD\u53EF\u4F7F\u7528\u5F53\u524D\u804A\u5929\u8FDE\u63A5"
  });
  checks.push({
    id: "settingsPanel",
    label: "\u6269\u5C55\u8BBE\u7F6E\u5165\u53E3",
    status: document.querySelector("#ma11-settings-root") ? "ok" : "warn",
    detail: document.querySelector("#ma11-settings-root") ? "\u5DF2\u6302\u8F7D" : "\u5C1A\u672A\u6302\u8F7D"
  });
  const settings = context ? getSettings() : null;
  checks.push({
    id: "audit",
    label: "\u89C4\u5219\u5BA1\u6838\u914D\u7F6E",
    status: settings?.auditEnabled && !settings.auditPrompt.trim() ? "error" : "ok",
    detail: settings?.auditEnabled ? settings.auditPrompt.trim() ? "\u5DF2\u542F\u7528\u5E76\u586B\u5199\u89C4\u5219" : "\u5DF2\u542F\u7528\u4F46\u89C4\u5219\u4E3A\u7A7A" : "\u672A\u542F\u7528"
  });
  const revisionConnection = settings?.connections.revision;
  const revisionProfileMissing = Boolean(
    settings?.auditEnabled && settings.auditFailAction === "revise" && revisionConnection?.mode === "profile" && !revisionConnection.profileId.trim()
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
      id: "history",
      label: "\u5386\u53F2\u6570\u636E\u4E00\u81F4\u6027",
      status: state2.historyInvalidation ? "warn" : "ok",
      detail: state2.historyInvalidation ? state2.historyInvalidation.startIndex === void 0 ? "\u5386\u53F2\u5220\u9664\u4F4D\u7F6E\u672A\u77E5\uFF0C\u9700\u8981\u5148\u9009\u62E9\u91CD\u7B97\u8D77\u70B9" : `\u7B2C ${state2.historyInvalidation.startIndex + 1} \u6761\u6D88\u606F\u4E4B\u540E\u9700\u8981\u624B\u52A8\u91CD\u7B97` : "\u5F53\u524D\u6D3E\u751F\u6570\u636E\u672A\u53D1\u73B0\u5386\u53F2\u5931\u6548"
    });
    checks.push({
      id: "sync",
      label: "\u6700\u8FD1\u4E16\u754C\u4E66\u540C\u6B65",
      status: state2.lastSyncStatus === "failed" ? "error" : state2.lastSyncStatus === "success" ? "ok" : "warn",
      detail: state2.lastSyncError || state2.lastSyncAt || "\u5C1A\u672A\u540C\u6B65"
    });
  }
  return checks;
}
function redactedChatState(state2) {
  if (!state2) return {};
  return {
    schemaVersion: state2.schemaVersion,
    chatKey: state2.chatKey,
    processedMessageCount: Array.isArray(state2.processedMessageKeys) ? state2.processedMessageKeys.length : 0,
    latestSnapshotMessageKey: state2.latestSnapshotMessageKey,
    smallSummaryCount: Array.isArray(state2.smallSummaries) ? state2.smallSummaries.length : 0,
    largeSummaryCount: Array.isArray(state2.largeSummaries) ? state2.largeSummaries.length : 0,
    historyInvalidation: state2.historyInvalidation,
    lastLorebookName: state2.lastLorebookName ? "[\u5DF2\u8BBE\u7F6E]" : "",
    lastSyncAt: state2.lastSyncAt,
    lastSyncStatus: state2.lastSyncStatus,
    lastSyncError: state2.lastSyncError,
    updatedAt: state2.updatedAt
  };
}
function redactedError(value) {
  const text = String(value ?? "").trim();
  if (!text) return void 0;
  return text.replace(/([；;]\s*(?:原始)?返回片段\s*[:：]).*$/s, "$1[\u5DF2\u9690\u85CF]").slice(0, 1200);
}
function safeTask(task) {
  return {
    id: task.id,
    key: task.key,
    label: task.label,
    kind: task.kind,
    state: task.state,
    priority: task.priority,
    chatKey: task.chatKey,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    queueWaitMs: task.queueWaitMs,
    runMs: task.runMs,
    totalMs: task.totalMs,
    error: redactedError(task.error)
  };
}
function safeRequest(trace) {
  return {
    id: trace.id,
    lane: trace.lane,
    task: trace.task,
    state: trace.state,
    createdAt: trace.createdAt,
    startedAt: trace.startedAt,
    finishedAt: trace.finishedAt,
    transportWaitMs: trace.transportWaitMs,
    requestMs: trace.requestMs,
    totalMs: trace.totalMs,
    firstByteMs: trace.firstByteMs,
    streamMode: trace.streamMode,
    error: redactedError(trace.error)
  };
}
async function diagnosticReport() {
  const context = tryGetContext();
  const chatKey = context ? currentChatKey() : "unavailable";
  const settings = context ? getSettings() : null;
  const chatState = context ? await getChatState(chatKey) : null;
  return {
    version: VERSION,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    userAgent: navigator.userAgent,
    location: location.origin,
    chatKey,
    checks: await runDiagnostics(),
    settings: settings ? {
      ...settings,
      auditPrompt: settings.auditPrompt ? "[\u5DF2\u586B\u5199]" : "",
      revisionPrompt: settings.revisionPrompt ? "[\u5DF2\u586B\u5199]" : ""
    } : null,
    chatState: redactedChatState(chatState),
    tasks: taskQueue.list().map(safeTask),
    requests: requestTraceReport().map(safeRequest),
    privacy: "\u8BCA\u65AD\u4E0D\u5305\u542B\u73A9\u5BB6\u8F93\u5165\u3001AI\u6B63\u6587\u3001\u5C0F\u603B\u7ED3\u6B63\u6587\u3001\u5927\u603B\u7ED3\u6B63\u6587\u3001\u5B8C\u6574\u6A21\u578B\u54CD\u5E94\u6216API\u5BC6\u94A5"
  };
}

// src/ui/workspace.ts
var selectedMessageIndex = null;
var rendering = false;
var renderAgain = false;
var queueUnsubscribe = null;
var selectedGraphNodeId = null;
var editorChatKey = null;
var editorMessageKey = null;
var savingRow = false;
function resolveWorkspaceStageCommand(action) {
  const commands = {
    "run-audit": { kind: "retry", stage: "audit" },
    "run-revision": { kind: "retry", stage: "revision" },
    "run-state": { kind: "retry", stage: "state" },
    "force-small": { kind: "summary", summary: "small" },
    "force-large": { kind: "summary", summary: "large" }
  };
  return commands[action] ?? null;
}
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
  queueUnsubscribe ||= taskQueue.subscribe(handleQueueChange);
  return element;
}
function currentArtifact() {
  if (selectedMessageIndex !== null) {
    const artifact = getArtifactAt(selectedMessageIndex);
    if (artifact) return { index: selectedMessageIndex, artifact };
    return null;
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
    cancelled: "\u5DF2\u53D6\u6D88",
    skipped: "\u8DF3\u8FC7",
    blocked: "\u963B\u65AD"
  };
  return map[value] || value;
}
function statusClass(value) {
  if (value === "success" || value === "skipped") return "success";
  if (value === "failed" || value === "blocked") return "danger";
  if (value === "cancelled") return "neutral";
  if (value === "running" || value === "queued") return "working";
  return "neutral";
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
function stageActionButtonsHtml(artifactInfo) {
  const settings = getSettings();
  const latestIndex = latestAssistantIndex();
  const isLatestText = artifactInfo ? artifactInfo.index === latestIndex : selectedMessageIndex === null && latestIndex >= 0;
  const artifact = artifactInfo?.artifact;
  const latestSnapshot = latestSnapshotArtifact();
  const canAudit = Boolean(settings.enabled && settings.auditEnabled && settings.auditPrompt.trim() && isLatestText);
  const canRevise = Boolean(
    settings.enabled && isLatestText && artifact?.audit && !artifact.audit.passed && artifact.audit.decision !== "block"
  );
  const canState = Boolean(
    settings.enabled && isLatestText && (!settings.auditEnabled || artifact?.audit?.passed)
  );
  const canSummarize = Boolean(
    settings.enabled && latestSnapshot && artifactInfo?.artifact.messageKey === latestSnapshot.artifact.messageKey
  );
  return `<div class="ma11-actions ma11-stage-actions">
    <button data-ma11-action="run-audit" ${canAudit ? "" : "disabled"}>\u5BA1\u6838\u6B63\u6587</button>
    <button data-ma11-action="run-revision" ${canRevise ? "" : "disabled"}>\u5B9A\u5411\u4FEE\u6B63</button>
    <button data-ma11-action="run-state" ${canState ? "" : "disabled"}>\u751F\u6210\u8868\u683C</button>
    <button data-ma11-action="force-small" ${canSummarize ? "" : "disabled"}>\u5C0F\u603B\u7ED3</button>
    <button data-ma11-action="force-large" ${canSummarize ? "" : "disabled"}>\u5927\u603B\u7ED3</button>
  </div>`;
}
function recentTasksHtml() {
  const jobs = taskQueue.list().slice(0, 5);
  return {
    count: jobs.length,
    html: jobs.length ? jobs.map((task) => {
      const timing = [
        Number.isFinite(task.queueWaitMs) ? `\u6392\u961F ${task.queueWaitMs}ms` : "",
        Number.isFinite(task.runMs) ? `\u6267\u884C ${task.runMs}ms` : ""
      ].filter(Boolean).join(" \xB7 ");
      return `<div><span>${escapeHtml(task.label)}${timing ? `<small>${escapeHtml(timing)}</small>` : ""}</span><em class="${task.state}">${escapeHtml(statusText(task.state))}</em></div>`;
    }).join("") : '<p class="ma11-empty">\u6CA1\u6709\u8FD0\u884C\u4E2D\u7684\u4EFB\u52A1\u3002</p>'
  };
}
function refreshTaskList() {
  const workspace = document.querySelector("#ma11-workspace");
  const list3 = workspace?.querySelector("[data-ma11-task-list]");
  const count = workspace?.querySelector("[data-ma11-task-count]");
  if (!list3 || !count) return;
  const tasks = recentTasksHtml();
  count.textContent = tasks.count ? `${tasks.count} \u6761\u6700\u8FD1\u4EFB\u52A1` : "\u7A7A\u95F2";
  list3.innerHTML = tasks.html;
}
function handleQueueChange() {
  refreshTaskList();
  if (taskQueue.list().some((task) => task.state === "queued" || task.state === "running")) return;
  const workspace = document.querySelector("#ma11-workspace");
  const active = document.activeElement;
  if (workspace?.contains(active) && active?.matches("input, textarea, select, button")) return;
  void renderWorkspace();
}
async function overviewHtml(artifactInfo) {
  const enabled = getSettings().enabled;
  const artifact = artifactInfo?.artifact;
  const chatState = await getChatState(currentChatKey());
  const rows2 = snapshotRowCount(artifact?.snapshot);
  const tasks = recentTasksHtml();
  return `
    ${chatState.historyInvalidation ? `<section class="ma11-card ma11-history-warning"><header><b>\u5386\u53F2\u6570\u636E\u9700\u8981\u91CD\u7B97</b><span>\u4E16\u754C\u4E66\u540C\u6B65\u5DF2\u6682\u505C</span></header><p>${chatState.historyInvalidation.startIndex === void 0 ? "\u68C0\u6D4B\u5230\u5386\u53F2\u5220\u9664\uFF0C\u4F46\u65E0\u6CD5\u81EA\u52A8\u5224\u65AD\u5220\u9664\u4F4D\u7F6E\u3002\u73B0\u6709\u6D3E\u751F\u8BB0\u5FC6\u5C1A\u672A\u6E05\u9664\uFF0C\u8BF7\u9009\u62E9\u91CD\u7B97\u8D77\u70B9\u3002" : `\u7B2C ${chatState.historyInvalidation.startIndex + 1} \u6761\u6D88\u606F\u53D1\u751F\u4E86${chatState.historyInvalidation.reason === "edited" ? "\u7F16\u8F91" : chatState.historyInvalidation.reason === "swiped" ? "\u6362\u9875" : "\u5220\u9664"}\u3002\u955C\u6E0A\u4E0D\u4F1A\u5728\u540E\u53F0\u81EA\u52A8\u91CD\u653E\u5386\u53F2\u3002`}</p><div class="ma11-actions"><button data-ma11-action="recalculate-history">${chatState.historyInvalidation.startIndex === void 0 ? "\u9009\u62E9\u8D77\u70B9\u5E76\u91CD\u7B97" : "\u4ECE\u53D8\u66F4\u4F4D\u7F6E\u5F00\u59CB\u91CD\u7B97"}</button></div></section>` : ""}
    <section class="ma11-hero">
      <div>
        <h2>${artifact ? `\u7B2C ${artifact.messageIndex + 1} \u6761\u6B63\u6587` : "\u5F53\u524D\u804A\u5929\u5C1A\u65E0\u955C\u6E0A\u8BB0\u5F55"}</h2>
        <p>${artifact ? `\u72B6\u6001\u8868 ${rows2} \u6761 \xB7 \u66F4\u65B0\u65F6\u95F4 ${escapeHtml(new Date(artifact.updatedAt).toLocaleString())}` : "\u751F\u6210\u4E00\u6761AI\u6B63\u6587\uFF0C\u6216\u624B\u52A8\u6574\u7406\u6700\u65B0\u6B63\u6587\u3002"}</p>
      </div>
      <div class="ma11-actions">
        <button data-ma11-action="process-latest" ${enabled ? "" : "disabled"}>\u6574\u7406\u6700\u65B0\u6B63\u6587</button>
        <button data-ma11-action="open-tables" ${artifact?.snapshot ? "" : "disabled"}>\u67E5\u770B\u72B6\u6001\u8868</button>
        <button data-ma11-action="open-graph" ${artifact?.snapshot ? "" : "disabled"}>\u5173\u7CFB\u56FE\u8C31</button>
      </div>
    </section>
    ${stageCards(artifact)}
    <section class="ma11-card">
      <header><b>\u5206\u9636\u6BB5\u624B\u52A8\u64CD\u4F5C</b><span>\u6BCF\u4E2A\u6309\u94AE\u53EA\u6267\u884C\u5BF9\u5E94\u9636\u6BB5</span></header>
      ${stageActionButtonsHtml(artifactInfo)}
    </section>
    <section class="ma11-card">
      <header><b>\u4EFB\u52A1\u961F\u5217</b><span data-ma11-task-count>${tasks.count ? `${tasks.count} \u6761\u6700\u8FD1\u4EFB\u52A1` : "\u7A7A\u95F2"}</span></header>
      <div class="ma11-task-list" data-ma11-task-list>
        ${tasks.html}
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
  const latest = latestSnapshotArtifact();
  const editable = Boolean(
    settings.enabled && artifactInfo && latest && latest.artifact.messageKey === artifactInfo.artifact.messageKey
  );
  const active = settings.ui.activeTable;
  const rows2 = artifact?.snapshot?.[active] ?? [];
  return `
    <section class="ma11-toolbar ma11-table-toolbar">
      <div class="ma11-table-tabs">${TABLE_KEYS.map((key) => `<button class="${key === active ? "active" : ""}" data-ma11-table="${key}">${TABLE_LABELS[key]} <span>${artifact?.snapshot?.[key]?.length ?? 0}</span></button>`).join("")}</div>
      <div class="ma11-actions"><button data-ma11-action="add-row" ${editable ? "" : "disabled"}>\uFF0B \u6DFB\u52A0</button><button data-ma11-action="run-state" ${settings.enabled && artifactInfo?.index === latestAssistantIndex() && (!settings.auditEnabled || artifact?.audit?.passed) ? "" : "disabled"}>\u751F\u6210/\u66F4\u65B0\u8868\u683C</button></div>
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
          <td><div class="ma11-row-actions"><button data-ma11-edit-row="${escapeHtml(row.id)}" ${editable ? "" : "disabled"}>\u7F16\u8F91</button><button class="danger" data-ma11-delete-row="${escapeHtml(row.id)}" ${editable ? "" : "disabled"}>\u5220\u9664</button></div></td>
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
  const info = latestSnapshotArtifact();
  const enabled = getSettings().enabled;
  const state2 = info ? await getChatState(info.artifact.chatKey) : null;
  const small = state2?.smallSummaries ?? [];
  const large = state2?.largeSummaries ?? [];
  return `
    <section class="ma11-toolbar"><div><h2>\u5206\u5C42\u603B\u7ED3</h2><p>\u5C0F\u603B\u7ED3\u8D1F\u8D23\u5B89\u5168\u6C89\u964D\u5DF2\u7ED3\u675F\u5185\u5BB9\uFF1B\u5927\u603B\u7ED3\u628A\u5DF2\u6D88\u8D39\u7684\u5C0F\u603B\u7ED3\u5185\u63A8\u4E3A\u7D2F\u8BA1\u957F\u671F\u8BB0\u5FC6\u3002</p></div><div class="ma11-actions"><button data-ma11-action="force-small" ${enabled && info ? "" : "disabled"}>\u7ACB\u5373\u5C0F\u603B\u7ED3</button><button data-ma11-action="force-large" ${enabled && info ? "" : "disabled"}>\u7ACB\u5373\u5927\u603B\u7ED3</button></div></section>
    <div class="ma11-summary-columns">
      <section class="ma11-card"><header><b>\u5C0F\u603B\u7ED3</b><span>${small.length}</span></header>${small.length ? small.slice().reverse().map(
    (item) => `<article class="ma11-summary"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>${item.sedimentation ? `<div class="ma11-summary-settlement"><span>\u5DF2\u5E94\u7528 ${item.sedimentation.appliedRowIds?.length ?? 0}</span><span>\u4FDD\u62A4/\u5FFD\u7565 ${item.sedimentation.ignoredRowIds?.length ?? 0}</span></div>` : ""}<small>${escapeHtml(new Date(item.createdAt).toLocaleString())}</small></article>`
  ).join("") : '<p class="ma11-empty">\u5C1A\u65E0\u5C0F\u603B\u7ED3\u3002</p>'}</section>
      <section class="ma11-card"><header><b>\u5927\u603B\u7ED3</b><span>${large.length}</span></header>${large.length ? large.slice().reverse().map(
    (item) => `<article class="ma11-summary"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>${item.sedimentation ? `<div class="ma11-summary-settlement"><span>\u5DF2\u5E94\u7528 ${item.sedimentation.appliedRowIds?.length ?? 0}</span><span>\u4FDD\u62A4/\u5FFD\u7565 ${item.sedimentation.ignoredRowIds?.length ?? 0}</span></div>` : ""}<small>${escapeHtml(new Date(item.createdAt).toLocaleString())}</small></article>`
  ).join("") : '<p class="ma11-empty">\u5C1A\u65E0\u5927\u603B\u7ED3\u3002</p>'}</section>
    </div>`;
}
function auditHtml() {
  const settings = getSettings();
  const info = currentArtifact();
  const audit = info?.artifact.audit;
  const revision = info?.artifact.revision;
  const violationHtml = audit && !audit.passed && audit.violations.length ? `<ol class="ma11-violation-list">${audit.violations.map((item) => `<li><b>${escapeHtml(item.rule)}</b><p>${escapeHtml(item.evidence)}</p><small>\u4FEE\u6539\uFF1A${escapeHtml(item.action)}</small></li>`).join("")}</ol>` : "";
  const latestIndex = latestAssistantIndex();
  const isLatest = info ? info.index === latestIndex : selectedMessageIndex === null && latestIndex >= 0;
  const canAudit = Boolean(settings.enabled && settings.auditEnabled && settings.auditPrompt.trim() && isLatest);
  const canRevise = Boolean(settings.enabled && isLatest && audit && !audit.passed && audit.decision !== "block");
  return `
    <section class="ma11-toolbar"><div><h2>\u5BA1\u6838\u4E0E\u4FEE\u6B63</h2><p>\u5BA1\u6838\u548C\u4FEE\u6B63\u5206\u5F00\u6267\u884C\uFF1B\u4FEE\u6B63\u901A\u8FC7\u540E\u518D\u70B9\u51FB\u201C\u751F\u6210\u8868\u683C\u201D\u3002</p></div><div class="ma11-actions"><button data-ma11-action="run-audit" ${canAudit ? "" : "disabled"}>\u7ACB\u5373\u5BA1\u6838</button><button data-ma11-action="run-revision" ${canRevise ? "" : "disabled"}>\u6267\u884C\u4FEE\u6B63</button></div></section>
    <section class="ma11-card ma11-form-card">
      <header><b>\u89C4\u5219\u5BA1\u6838\u4E0E\u5B9A\u5411\u4FEE\u6B63</b><span>\u6700\u7EC8\u901A\u8FC7\u7684\u6B63\u6587\u624D\u8FDB\u5165\u72B6\u6001\u8868\u4E0E\u4E16\u754C\u4E66</span></header>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="auditEnabled" ${settings.auditEnabled ? "checked" : ""}/><span>\u542F\u7528\u89C4\u5219\u5BA1\u6838</span></label>
      <label>\u5BA1\u6838\u5931\u8D25\u5904\u7406<select data-ma11-setting="auditFailAction">
        <option value="revise" ${settings.auditFailAction === "revise" ? "selected" : ""}>\u5B9A\u5411\u4FEE\u6B63\u5E76\u539F\u4F4D\u66FF\u6362\uFF08\u63A8\u8350\uFF09</option>
        <option value="mark" ${settings.auditFailAction === "mark" ? "selected" : ""}>\u4FDD\u7559\u5E76\u6807\u7EA2</option>
        <option value="hide" ${settings.auditFailAction === "hide" ? "selected" : ""}>\u9690\u85CF\uFF0C\u7B49\u5F85\u4EBA\u5DE5\u5904\u7406</option>
      </select></label>
      <label>\u81EA\u52A8\u4FEE\u6B63\u4ECD\u5931\u8D25\u540E\u7684\u5904\u7406<select data-ma11-setting="revisionFallbackAction">
        <option value="hide" ${settings.revisionFallbackAction === "hide" ? "selected" : ""}>\u9690\u85CF\u5E76\u7B49\u5F85\u4EBA\u5DE5\u5904\u7406\uFF08\u63A8\u8350\uFF09</option>
        <option value="mark" ${settings.revisionFallbackAction === "mark" ? "selected" : ""}>\u4FDD\u7559\u5E76\u6807\u7EA2</option>
      </select></label>
      <label>\u6700\u5927\u81EA\u52A8\u4FEE\u6B63\u6B21\u6570<input type="number" min="1" max="2" data-ma11-setting="maxRevisionAttempts" value="${settings.maxRevisionAttempts}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="stopOnRepeatedViolation" ${settings.stopOnRepeatedViolation ? "checked" : ""}/><span>\u76F8\u540C\u8FDD\u89C4\u91CD\u590D\u51FA\u73B0\u65F6\u7ACB\u5373\u505C\u6B62\uFF0C\u9632\u6B62\u5FAA\u73AF</span></label>
      <label>\u5BA1\u6838\u63D0\u793A\u8BCD<textarea rows="14" data-ma11-setting="auditPrompt" placeholder="\u586B\u5199\u5FC5\u987B\u68C0\u67E5\u7684\u786C\u89C4\u5219\u3002">${escapeHtml(settings.auditPrompt)}</textarea></label>
      <label>\u9644\u52A0\u4FEE\u6B63\u8981\u6C42\uFF08\u53EF\u9009\uFF09<textarea rows="6" data-ma11-setting="revisionPrompt" placeholder="\u4F8B\u5982\uFF1A\u53EA\u505A\u6700\u5C0F\u6539\u52A8\uFF1B\u4FDD\u7559\u539F\u6709\u6587\u98CE\u548C\u6BB5\u843D\u957F\u5EA6\u3002">${escapeHtml(settings.revisionPrompt)}</textarea></label>
      <p class="ma11-help">\u5BA1\u6838\u8BF4\u660E\u548C\u4FEE\u6B63\u6307\u4EE4\u4E0D\u4F1A\u4F5C\u4E3A\u804A\u5929\u6D88\u606F\u5199\u5165\u4E0A\u4E0B\u6587\u3002\u4FEE\u6B63\u901A\u8FC7\u540E\u539F\u4F4D\u66F4\u65B0\u6B63\u6587\uFF1B\u63D2\u4EF6\u4E0D\u4F1A\u9501\u5B9A\u9152\u9986\u751F\u6210\u6309\u94AE\uFF0C\u4E5F\u4E0D\u4F1A\u81EA\u52A8\u5220\u9664\u6D88\u606F\u3002</p>
    </section>
    ${audit ? `<section class="ma11-card"><header><b>\u6700\u8FD1\u5BA1\u6838\u7ED3\u679C</b><span class="ma11-badge ${audit.passed ? "success" : "danger"}">${audit.passed ? "\u901A\u8FC7" : audit.decision === "block" ? "\u963B\u65AD" : "\u9700\u4FEE\u6B63"}</span></header><p>${escapeHtml(audit.reason)}</p>${violationHtml}${revision ? `<dl class="ma11-meta"><dt>\u4FEE\u6B63\u72B6\u6001</dt><dd>${escapeHtml(revision.status)}</dd><dt>\u4FEE\u6B63\u6B21\u6570</dt><dd>${revision.attempts.length}</dd><dt>\u505C\u6B62\u539F\u56E0</dt><dd>${escapeHtml(revision.stoppedReason || "\u2014")}</dd></dl>` : ""}</section>` : ""}`;
}
async function syncHtml() {
  const info = latestSnapshotArtifact();
  const state2 = info ? await getChatState(info.artifact.chatKey) : null;
  const settings = getSettings();
  return `
    <section class="ma11-card ma11-form-card">
      <header><b>\u804A\u5929\u4E16\u754C\u4E66</b><span class="ma11-badge ${statusClass(state2?.lastSyncStatus || "idle")}">${statusText(state2?.lastSyncStatus || "idle")}</span></header>
      ${state2?.historyInvalidation ? `<div class="ma11-error-box">${state2.historyInvalidation.startIndex === void 0 ? "\u5386\u53F2\u5220\u9664\u4F4D\u7F6E\u672A\u77E5\uFF0C\u8BF7\u5148\u9009\u62E9\u91CD\u7B97\u8D77\u70B9\u3002" : `\u7B2C ${state2.historyInvalidation.startIndex + 1} \u6761\u6D88\u606F\u4E4B\u540E\u7684\u6570\u636E\u5DF2\u5931\u6548\u3002`}\u5B8C\u6210\u624B\u52A8\u91CD\u7B97\u524D\u4E0D\u4F1A\u53D1\u5E03\u4E16\u754C\u4E66\u3002</div>` : ""}
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="lorebookSync" ${settings.lorebookSync ? "checked" : ""}/><span>\u81EA\u52A8\u540C\u6B65\u4E16\u754C\u4E66</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoCreateLorebook" ${settings.autoCreateLorebook ? "checked" : ""}/><span>\u81EA\u52A8\u521B\u5EFA\u6BCF\u804A\u5929\u72EC\u7ACB\u4E16\u754C\u4E66</span></label>
      <label>\u53D1\u5E03\u7ED3\u6784<select data-ma11-setting="lorebookLayout"><option value="semantic" ${settings.lorebookLayout === "semantic" ? "selected" : ""}>\u5BF9\u8C61\u8BED\u4E49\u6A21\u5F0F\uFF08\u63A8\u8350\uFF09</option><option value="detailed" ${settings.lorebookLayout === "detailed" ? "selected" : ""}>\u9010\u884C\u8C03\u8BD5\u6A21\u5F0F</option></select></label>
      <p class="ma11-help">\u5BF9\u8C61\u8BED\u4E49\u6A21\u5F0F\u6309\u73B0\u5B9E\u5BF9\u8C61\u5EFA\u7ACB\u6761\u76EE\uFF1A\u57FA\u7840\u8BBE\u5B9A\u3001\u5168\u5C40\u6001\u52BF\u3001\u6BCF\u4E2A\u7126\u70B9\u3001\u6BCF\u4E2A\u6B63\u5F0F\u4EBA\u7269\u3001\u5173\u7CFB\u7F51\u7EDC\u3001\u533A\u57DF\u3001\u4E8B\u4EF6/\u6D41\u7A0B\u3001\u7269\u54C1/\u8D44\u6E90\u3001\u6280\u80FD\uFF0C\u4EE5\u53CA\u5F53\u524D\u5C0F\u603B\u7ED3\u548C\u7D2F\u8BA1\u5927\u603B\u7ED3\u3002\u65E7\u7684\u955C\u6E0A\u7BA1\u7406\u6761\u76EE\u4F1A\u5728\u91CD\u65B0\u53D1\u5E03\u65F6\u81EA\u52A8\u66FF\u6362\u3002</p>
      <label>\u4E16\u754C\u4E66\u540D\u79F0\uFF08\u7559\u7A7A\u81EA\u52A8\u751F\u6210\uFF09<input data-ma11-setting="lorebookName" value="${escapeHtml(settings.lorebookName)}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="vectorizeRows" ${settings.vectorizeRows ? "checked" : ""}/><span>\u4EBA\u7269\u3001\u7269\u54C1\u3001\u4E8B\u4EF6\u7B49\u72B6\u6001\u884C\u542F\u7528\u5411\u91CF</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="latestContinuityConstant" ${settings.latestContinuityConstant ? "checked" : ""}/><span>\u57FA\u7840\u8BBE\u5B9A\u3001\u5168\u5C40\u6001\u52BF\u3001\u5F53\u524D\u7126\u70B9\u4E0E\u5F53\u524D\u603B\u7ED3\u5E38\u9A7B</span></label>
      <div class="ma11-actions"><button data-ma11-action="retry-sync" ${settings.enabled && info && !state2?.historyInvalidation ? "" : "disabled"}>${settings.lorebookLayout === "semantic" ? "\u6309\u5BF9\u8C61\u6E05\u7406\u5E76\u91CD\u65B0\u53D1\u5E03" : "\u7ACB\u5373\u540C\u6B65"}</button><button data-ma11-action="open-graph" ${info?.artifact.snapshot ? "" : "disabled"}>\u67E5\u770B\u5173\u7CFB\u56FE\u8C31</button></div>
      ${state2?.lastSyncError ? `<div class="ma11-error-box">${escapeHtml(state2.lastSyncError)}</div>` : ""}
      <dl class="ma11-meta"><dt>\u5F53\u524D\u4E16\u754C\u4E66</dt><dd>${escapeHtml(state2?.lastLorebookName || "\u672A\u5EFA\u7ACB")}</dd><dt>\u6700\u8FD1\u540C\u6B65</dt><dd>${escapeHtml(state2?.lastSyncAt ? new Date(state2.lastSyncAt).toLocaleString() : "\u5C1A\u672A\u540C\u6B65")}</dd></dl>
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
      <header><b>\u4EFB\u52A1\u6A21\u578B\u5206\u914D</b><span>\u5168\u90E8\u901A\u8FC7 SillyTavern \u539F\u751F\u8FDE\u63A5\u80FD\u529B\u8C03\u7528\u3002</span></header>
      ${connectionBlock("audit", "\u89C4\u5219\u5BA1\u6838")}
      ${connectionBlock("revision", "\u5B9A\u5411\u4FEE\u6B63")}
      ${connectionBlock("state", "\u4E8B\u5B9E\u63D0\u53D6\u4E0E\u72B6\u6001\u8868")}
      ${connectionBlock("smallSummary", "\u5C0F\u603B\u7ED3")}
      ${connectionBlock("largeSummary", "\u5927\u603B\u7ED3")}
      <p class="ma11-help">\u5F53\u524D\u804A\u5929\u8FDE\u63A5\u4F7F\u7528 generateRaw\uFF1BProfile \u4F7F\u7528 ConnectionManagerRequestService\uFF0C\u5E76\u5173\u95ED\u89D2\u8272\u9884\u8BBE\u4E0E Instruct\u3002\u63D2\u4EF6\u4E0D\u4FDD\u5B58 API \u5730\u5740\u6216\u5BC6\u94A5\u3002</p>
    </section>
    <section class="ma11-card ma11-form-card">
      <header><b>\u81EA\u52A8\u5316</b></header>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="enabled" ${settings.enabled ? "checked" : ""}/><span>\u542F\u7528\u955C\u6E0A</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoState" ${settings.autoState ? "checked" : ""}/><span>\u6BCF\u6761\u65B0AI\u6B63\u6587\u81EA\u52A8\u63D0\u53D6\u4E8B\u5B9E\u5E76\u6574\u7406\u8868\u683C</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="showMessagePanel" ${settings.showMessagePanel ? "checked" : ""}/><span>\u5728\u6B63\u6587\u4E0B\u663E\u793A\u72B6\u6001\u6761</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoSmallSummary" ${settings.autoSmallSummary ? "checked" : ""}/><span>\u81EA\u52A8\u5C0F\u603B\u7ED3</span></label>
      <label>\u5C0F\u603B\u7ED3\u6700\u665A\u56DE\u5408\u6570<input type="number" min="8" max="30" data-ma11-setting="smallSummaryTurns" value="${settings.smallSummaryTurns}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="autoLargeSummary" ${settings.autoLargeSummary ? "checked" : ""}/><span>\u81EA\u52A8\u5927\u603B\u7ED3</span></label>
      <label>\u5927\u603B\u7ED3\u6240\u9700\u5C0F\u603B\u7ED3\u6570<input type="number" min="1" max="30" data-ma11-setting="largeSummaryCount" value="${settings.largeSummaryCount}" /></label>
      <label>\u6A21\u578B\u8BF7\u6C42\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09<input type="number" min="10000" max="300000" step="1000" data-ma11-setting="requestTimeoutMs" value="${settings.requestTimeoutMs}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="repairInvalidJsonOnce" ${settings.repairInvalidJsonOnce ? "checked" : ""}/><span>\u7ED3\u6784\u5316\u8F93\u51FA\u4E0D\u53EF\u7528\u6216JSON\u683C\u5F0F\u9519\u8BEF\u65F6\uFF0C\u6700\u591A\u989D\u5916\u8C03\u7528\u4E00\u6B21</span></label>
      <p class="ma11-help">\u5C0F\u603B\u7ED3\u6839\u636E\u5DF2\u7ECF\u63D0\u53D6\u7684\u72B6\u6001\u53D8\u5316\u5224\u65AD\uFF1A\u5267\u60C5\u53D8\u5316\u5BC6\u96C6\u65F6\u53EF\u63D0\u524D\u89E6\u53D1\uFF0C\u53D8\u5316\u5C11\u65F6\u5EF6\u540E\uFF0C\u4F46\u4E0D\u4F1A\u8D85\u8FC7\u201C\u6700\u665A\u56DE\u5408\u6570\u201D\u3002\u5224\u65AD\u4E0D\u989D\u5916\u8C03\u7528\u6A21\u578B\u3002\u517C\u5BB9\u56DE\u9000\u53EA\u6267\u884C\u4E00\u6B21\uFF1B\u7F51\u7EDC\u9519\u8BEF\u4E0D\u4F1A\u89E6\u53D1\uFF0C\u5931\u8D25\u540E\u7531\u7528\u6237\u624B\u52A8\u91CD\u8BD5\u3002</p>
    </section>
    <section class="ma11-card ma11-form-card">
      <header><b>\u91CD\u7F6E\u4E0E\u7EF4\u62A4</b><span>\u4EE5\u4E0B\u64CD\u4F5C\u4E0D\u4F1A\u4FEE\u6539\u5176\u4ED6\u804A\u5929\u3002</span></header>
      <div class="ma11-actions">
        <button data-ma11-action="restart-plugin">\u91CD\u5EFA\u63D2\u4EF6\u7F13\u5B58\uFF08\u8F6F\u91CD\u7F6E\uFF09</button>
        <button class="danger" data-ma11-action="reset-current-game">\u91CD\u7F6E\u5F53\u524D\u6E38\u620F</button>
      </div>
      <p class="ma11-help">\u91CD\u5EFA\u63D2\u4EF6\u7F13\u5B58\u4F1A\u53D6\u6D88\u8BF7\u6C42\u3001\u5E9F\u5F03\u4EFB\u52A1\u3001\u6E05\u9664\u4E00\u6B21\u6027\u6A21\u5757\u7F13\u5B58\u3001\u89E3\u9664\u76D1\u542C\u5E76\u91CD\u65B0\u6302\u8F7D\u955C\u6E0A UI\uFF0C\u76F8\u5F53\u4E8E\u8F6F\u91CD\u7F6E\u63D2\u4EF6\uFF0C\u4E0D\u5220\u9664\u8868\u683C\u3001\u603B\u7ED3\u548C\u8BBE\u7F6E\u3002\u91CD\u7F6E\u5F53\u524D\u6E38\u620F\u4F1A\u5220\u9664\u672C\u804A\u5929\u7684\u955C\u6E0A\u8868\u683C\u3001\u603B\u7ED3\u3001\u5BA1\u6838\u8BB0\u5F55\u53CA\u5176\u4E16\u754C\u4E66\u6761\u76EE\uFF0C\u4F46\u4FDD\u7559\u63D2\u4EF6\u8BBE\u7F6E\u3002</p>
    </section>`;
}
async function diagnosticsHtml() {
  const checks = await runDiagnostics();
  return `
    <section class="ma11-toolbar"><div><h2>\u8FD0\u884C\u8BCA\u65AD</h2><p>\u5165\u53E3\u3001\u6A21\u578B\u3001\u5B58\u50A8\u4E0E\u540C\u6B65\u5206\u522B\u68C0\u67E5\u3002</p></div><div class="ma11-actions"><button data-ma11-action="refresh-diagnostics">\u5237\u65B0</button><button data-ma11-action="copy-diagnostics">\u590D\u5236\u8BCA\u65AD</button></div></section>
    <section class="ma11-check-grid">${checks.map((check) => `<article class="ma11-check ${check.status}"><span></span><div><b>${escapeHtml(check.label)}</b><p>${escapeHtml(check.detail)}</p></div></article>`).join("")}</section>`;
}
async function renderWorkspace() {
  const workspace = document.querySelector("#ma11-workspace");
  if (!workspace || workspace.hidden) return;
  if (rendering) {
    renderAgain = true;
    return;
  }
  rendering = true;
  const renderChatKey = currentChatKey();
  try {
    const settings = getSettings();
    const info = currentArtifact();
    workspace.querySelectorAll("[data-ma11-tab]").forEach(
      (button) => button.classList.toggle(
        "active",
        button.dataset.ma11Tab === settings.ui.activeTab
      )
    );
    let html = "";
    if (settings.ui.activeTab === "overview") html = await overviewHtml(info);
    if (settings.ui.activeTab === "tables") html = tableHtml(info);
    if (settings.ui.activeTab === "graph") html = graphHtml(info);
    if (settings.ui.activeTab === "summaries") html = await summariesHtml();
    if (settings.ui.activeTab === "audit") html = auditHtml();
    if (settings.ui.activeTab === "sync") html = await syncHtml();
    if (settings.ui.activeTab === "settings") html = settingsHtml();
    if (settings.ui.activeTab === "diagnostics") html = await diagnosticsHtml();
    if (!workspace.isConnected || currentChatKey() !== renderChatKey) {
      renderAgain = true;
      return;
    }
    const content = workspace.querySelector("#ma11-workspace-content");
    if (content) content.innerHTML = html;
  } catch (error) {
    if (currentChatKey() !== renderChatKey) {
      renderAgain = true;
      return;
    }
    const message = toErrorMessage(error);
    const content = workspace.querySelector("#ma11-workspace-content");
    if (content) {
      content.innerHTML = `<section class="ma11-card"><header><b>\u754C\u9762\u52A0\u8F7D\u5931\u8D25</b></header><p class="ma11-message-error">${escapeHtml(message)}</p><div class="ma11-actions"><button data-ma11-action="refresh-diagnostics">\u91CD\u65B0\u52A0\u8F7D</button></div></section>`;
    }
    console.error("[MirrorAbyss] workspace render failed", error);
  } finally {
    rendering = false;
    if (renderAgain) {
      renderAgain = false;
      queueMicrotask(() => void renderWorkspace());
    }
  }
}
function setTab(tab) {
  const settings = getSettings();
  settings.ui.activeTab = tab;
  saveSettings();
  void renderWorkspace();
}
function editableArtifact() {
  if (!getSettings().enabled) throw new Error("\u955C\u6E0A\u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u542F\u7528");
  if (editorChatKey && currentChatKey() !== editorChatKey) {
    throw new Error("\u804A\u5929\u5DF2\u5207\u6362\uFF0C\u672C\u6B21\u7F16\u8F91\u4E0D\u518D\u4FDD\u5B58");
  }
  const info = currentArtifact();
  const latest = latestSnapshotArtifact();
  if (!info?.artifact.snapshot || !latest || info.artifact.messageKey !== latest.artifact.messageKey) {
    throw new Error("\u5386\u53F2\u72B6\u6001\u8868\u53EA\u8BFB\uFF0C\u53EA\u80FD\u7F16\u8F91\u6700\u65B0\u6210\u529F\u72B6\u6001\u8868");
  }
  if (editorMessageKey && info.artifact.messageKey !== editorMessageKey) {
    throw new Error("\u7F16\u8F91\u76EE\u6807\u5DF2\u7ECF\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u7F16\u8F91\u5668");
  }
  assertArtifactCommitCurrent(info.artifact);
  return info;
}
function openRowEditor(tableKey, row) {
  const info = currentArtifact();
  editorChatKey = currentChatKey();
  editorMessageKey = info?.artifact.messageKey ?? null;
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
  editorChatKey = null;
  editorMessageKey = null;
}
async function saveRow(form) {
  const info = editableArtifact();
  const tableKey = form.elements.namedItem("tableKey").value;
  const rowId = form.elements.namedItem("rowId").value;
  const title = form.elements.namedItem("title").value.trim();
  const content = form.elements.namedItem("content").value.trim();
  const status = form.elements.namedItem("status").value.trim();
  const keywords = form.elements.namedItem("keywords").value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  const locked = form.elements.namedItem("locked").checked;
  const supportsLifecycle = tableKey === "characters" || tableKey === "focus";
  const listFrom = (name) => form.elements.namedItem(name).value.split(/\n|[；;]/).map((item) => item.trim()).filter(Boolean);
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
  await persistChatFor(info.artifact.chatKey);
  assertArtifactCommitCurrent(info.artifact);
  if (getSettings().lorebookSync) await retryStage(info.index, "sync");
  closeEditor();
  await renderWorkspace();
}
async function deleteRowAction(rowId) {
  const info = editableArtifact();
  const tableKey = getSettings().ui.activeTable;
  if (!confirm("\u786E\u5B9A\u5220\u9664\u8FD9\u6761\u72B6\u6001\u5417\uFF1F")) return;
  info.artifact.snapshot = deleteRow(info.artifact.snapshot, tableKey, rowId);
  const message = getMessage(info.index);
  if (message) attachArtifactToMessage(message, info.artifact);
  await putArtifact(info.artifact);
  await persistChatFor(info.artifact.chatKey);
  assertArtifactCommitCurrent(info.artifact);
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
  if (key === "enabled") {
    setRequestAcceptance(Boolean(value));
    taskQueue.setAccepting(Boolean(value));
    if (!value) abortActiveRequests();
    const quick = document.querySelector('[data-ma11-quick-setting="enabled"]');
    if (quick) quick.checked = Boolean(value);
    renderAllMessagePanels();
    void renderWorkspace();
  }
  if (key === "showMessagePanel") renderAllMessagePanels();
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
    const actionButton = action ? target.closest("[data-ma11-action]") : null;
    const testButton = target.closest("[data-ma11-test]");
    const busyButton = actionButton ?? testButton;
    const originalButtonText = busyButton?.textContent ?? "";
    try {
      if (busyButton && !["close", "open-tables", "open-graph", "close-editor"].includes(action || "")) {
        busyButton.disabled = true;
        busyButton.setAttribute("aria-busy", "true");
        busyButton.textContent = "\u5904\u7406\u4E2D\u2026";
      }
      if (action === "close") workspace.hidden = true;
      if (action === "open-tables") setTab("tables");
      if (action === "open-graph") setTab("graph");
      if (action === "process-latest") {
        if (!getSettings().enabled) throw new Error("\u955C\u6E0A\u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u542F\u7528");
        const index = latestAssistantIndex();
        if (index < 0) throw new Error("\u6CA1\u6709\u53EF\u6574\u7406\u7684AI\u6B63\u6587");
        selectedMessageIndex = index;
        await processMessage(index, true);
        await renderWorkspace();
      }
      if (action === "recalculate-history") {
        const state2 = await getChatState(currentChatKey());
        if (state2.historyInvalidation?.startIndex === void 0) {
          const answer = window.prompt(`\u8BF7\u8F93\u5165\u91CD\u7B97\u8D77\u70B9\uFF081-${Math.max(1, getChat().length)}\uFF09`, "1");
          if (answer === null) return;
          const start = Number(answer);
          if (!Number.isInteger(start) || start < 1 || start > Math.max(1, getChat().length)) {
            throw new Error("\u91CD\u7B97\u8D77\u70B9\u5FC5\u987B\u662F\u5F53\u524D\u804A\u5929\u8303\u56F4\u5185\u7684\u6D88\u606F\u5E8F\u53F7");
          }
          await chooseHistoryRecalculationStart(start - 1);
        }
        await recalculateInvalidatedHistory();
        selectedMessageIndex = null;
        await renderWorkspace();
      }
      const stageCommand = action ? resolveWorkspaceStageCommand(action) : null;
      if (stageCommand?.kind === "retry") {
        const index = latestAssistantIndex();
        if (index < 0) throw new Error("\u6CA1\u6709\u53EF\u5904\u7406\u7684AI\u6B63\u6587");
        selectedMessageIndex = index;
        await retryStage(index, stageCommand.stage);
        await renderWorkspace();
      }
      if (stageCommand?.kind === "summary") {
        const info = latestSnapshotArtifact();
        if (!info) throw new Error("\u5C1A\u65E0\u53EF\u603B\u7ED3\u7684\u72B6\u6001");
        await forceSummary(info.index, stageCommand.summary);
        await renderWorkspace();
      }
      if (action === "retry-sync") {
        const info = latestSnapshotArtifact();
        if (!info) throw new Error("\u5C1A\u65E0\u53EF\u540C\u6B65\u7684\u72B6\u6001");
        await retryStage(info.index, "sync");
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
      if (action === "restart-plugin") {
        const restart = globalThis.MirrorAbyss?.restart;
        if (typeof restart !== "function") throw new Error("\u63D2\u4EF6\u91CD\u7F6E\u5165\u53E3\u4E0D\u53EF\u7528");
        toast("info", "\u6B63\u5728\u91CD\u7F6E\u955C\u6E0A\u63D2\u4EF6\u2026");
        await restart();
        return;
      }
      if (action === "reset-current-game") {
        if (!window.confirm("\u8FD9\u4F1A\u5220\u9664\u5F53\u524D\u804A\u5929\u7684\u955C\u6E0A\u8868\u683C\u3001\u603B\u7ED3\u3001\u5BA1\u6838\u8BB0\u5F55\u548C\u955C\u6E0A\u4E16\u754C\u4E66\u6761\u76EE\u3002\u5176\u4ED6\u804A\u5929\u548C\u63D2\u4EF6\u8BBE\u7F6E\u4E0D\u53D7\u5F71\u54CD\u3002\u662F\u5426\u7EE7\u7EED\uFF1F")) return;
        if (!window.confirm("\u8BF7\u518D\u6B21\u786E\u8BA4\uFF1A\u91CD\u7F6E\u540E\u53EA\u80FD\u91CD\u65B0\u8C03\u7528\u6A21\u578B\u6574\u7406\u5F53\u524D\u804A\u5929\uFF0C\u65E0\u6CD5\u81EA\u52A8\u6062\u590D\u3002")) return;
        const result = await resetCurrentGame();
        resetWorkspaceContext();
        renderAllMessagePanels();
        toast("success", `\u5F53\u524D\u6E38\u620F\u5DF2\u91CD\u7F6E\uFF1A\u6E05\u9664 ${result.messages} \u6761\u6D88\u606F\u8BB0\u5F55\u3001${result.lorebookEntries} \u4E2A\u4E16\u754C\u4E66\u6761\u76EE`);
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
          (item) => item.id === editId
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
    } finally {
      if (busyButton?.isConnected) {
        busyButton.disabled = false;
        busyButton.removeAttribute("aria-busy");
        busyButton.textContent = originalButtonText;
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
    if (savingRow) return;
    savingRow = true;
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    if (submit) {
      submit.disabled = true;
      submit.textContent = "\u4FDD\u5B58\u4E2D\u2026";
    }
    void saveRow(form).catch((error) => toast("error", toErrorMessage(error))).finally(() => {
      savingRow = false;
      if (submit?.isConnected) {
        submit.disabled = false;
        submit.textContent = "\u4FDD\u5B58";
      }
    });
  });
}
function openWorkspace(tab, messageIndex) {
  const workspace = root();
  if (Number.isInteger(messageIndex))
    selectedMessageIndex = Number(messageIndex);
  if (tab) getSettings().ui.activeTab = tab;
  workspace.hidden = false;
  void renderWorkspace();
}
function resetWorkspaceContext() {
  selectedMessageIndex = null;
  selectedGraphNodeId = null;
  closeEditor();
}
function disposeWorkspace() {
  resetWorkspaceContext();
  queueUnsubscribe?.();
  queueUnsubscribe = null;
  savingRow = false;
  renderAgain = false;
  document.querySelector("#ma11-workspace")?.remove();
}
function refreshWorkspace() {
  void renderWorkspace();
}

// src/ui/message-panel.ts
function stageLabel(stage) {
  const map = {
    idle: "\u7B49\u5F85",
    queued: "\u6392\u961F",
    running: "\u5904\u7406\u4E2D",
    success: "\u6210\u529F",
    failed: "\u5931\u8D25",
    cancelled: "\u5DF2\u53D6\u6D88",
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
function messageStageAvailability(index, artifact) {
  const settings = getSettings();
  const latestText = index === latestAssistantIndex();
  const latestSnapshot = index === latestSnapshotArtifact()?.index;
  const notBusy = (status) => !["queued", "running"].includes(status ?? "idle");
  return {
    audit: Boolean(settings.enabled && latestText && settings.auditEnabled && settings.auditPrompt.trim() && notBusy(artifact.stages.audit.status)),
    revision: Boolean(settings.enabled && latestText && artifact.audit && !artifact.audit.passed && artifact.audit.decision !== "block" && notBusy(artifact.stages.revision.status)),
    state: Boolean(settings.enabled && latestText && (!settings.auditEnabled || artifact.audit?.passed) && notBusy(artifact.stages.state.status)),
    small: Boolean(settings.enabled && latestSnapshot && artifact.stages.state.status === "success" && notBusy(artifact.stages.summary.status)),
    large: Boolean(settings.enabled && latestSnapshot && artifact.stages.state.status === "success" && notBusy(artifact.stages.summary.status)),
    sync: Boolean(settings.enabled && latestSnapshot && artifact.stages.state.status === "success" && notBusy(artifact.stages.sync.status))
  };
}
var pendingRetryIndexes = /* @__PURE__ */ new Set();
function panelHtml(index, artifact) {
  const rows2 = artifact.snapshot ? Object.values(artifact.snapshot).reduce((sum, list3) => sum + list3.length, 0) : 0;
  const error = Object.values(artifact.stages).find((stage) => stage.error)?.error;
  const retrying = pendingRetryIndexes.has(index);
  const latestText = index === latestAssistantIndex();
  const latestSnapshot = index === latestSnapshotArtifact()?.index;
  const available = messageStageAvailability(index, artifact);
  const enabled = (action) => !retrying && available[action] ? "" : "disabled";
  return `
    <div class="ma11-message-panel" data-ma-index="${index}">
      <button class="ma11-message-summary" type="button" data-ma-action="open">
        <span class="ma11-message-title">\u955C\u6E0A\u72B6\u6001</span>
        <span class="ma11-badge ${tone(artifact.stages.audit)}">\u5BA1\u6838 ${stageLabel(artifact.stages.audit)}</span>
        <span class="ma11-badge ${tone(artifact.stages.revision)}">\u4FEE\u6B63 ${stageLabel(artifact.stages.revision)}</span>
        <span class="ma11-badge ${tone(artifact.stages.state)}">\u8868\u683C ${stageLabel(artifact.stages.state)}</span>
        <span class="ma11-badge ${tone(artifact.stages.summary)}">\u603B\u7ED3 ${stageLabel(artifact.stages.summary)}</span>
        <span class="ma11-badge ${tone(artifact.stages.sync)}">\u540C\u6B65 ${stageLabel(artifact.stages.sync)}</span>
        <span class="ma11-message-count">${rows2} \u6761</span>
      </button>
      ${artifact.audit && !artifact.audit.passed ? `<div class="ma11-message-error">${escapeHtml(artifact.audit.reason)}</div>` : error ? `<div class="ma11-message-error">${escapeHtml(error)}</div>` : ""}
      ${latestText ? `<div class="ma11-message-actions ma11-message-stage-actions" aria-label="\u955C\u6E0A\u5206\u9636\u6BB5\u64CD\u4F5C">
        <button data-ma-stage-action="audit" ${enabled("audit")}>\u5BA1\u6838\u6B63\u6587</button>
        <button data-ma-stage-action="revision" ${enabled("revision")}>\u91CD\u65B0\u4FEE\u6B63</button>
        <button data-ma-stage-action="state" ${enabled("state")}>\u751F\u6210\u8868\u683C</button>
        <button data-ma-stage-action="small" ${enabled("small")}>\u5C0F\u603B\u7ED3</button>
        <button data-ma-stage-action="large" ${enabled("large")}>\u5927\u603B\u7ED3</button>
        <button data-ma-stage-action="sync" ${enabled("sync")}>\u540C\u6B65\u4E16\u754C\u4E66</button>
      </div>` : ""}
      <div class="ma11-message-actions">
        ${retrying ? "<button disabled>\u5904\u7406\u4E2D\u2026</button>" : ""}
        ${!retrying && latestText && artifact.stages.audit.status === "failed" ? '<button data-ma-retry="audit">\u91CD\u8BD5\u5BA1\u6838</button>' : ""}
        ${!retrying && latestText && ["failed", "blocked"].includes(artifact.stages.revision?.status ?? "idle") ? '<button data-ma-retry="revision">\u91CD\u8BD5\u5B9A\u5411\u4FEE\u6B63</button>' : ""}
        ${!retrying && latestText && artifact.stages.state.status === "failed" ? '<button data-ma-retry="state">\u91CD\u8BD5\u8868\u683C</button>' : ""}
        ${!retrying && latestSnapshot && artifact.stages.summary.status === "failed" ? '<button data-ma-retry="summary">\u91CD\u8BD5\u603B\u7ED3</button>' : ""}
        ${!retrying && latestSnapshot && artifact.stages.sync.status === "failed" ? '<button data-ma-retry="sync">\u91CD\u8BD5\u540C\u6B65</button>' : ""}
      </div>
    </div>`;
}
function renderMessagePanel(index) {
  const messageElement = findMessageElement2(index);
  if (!messageElement) return;
  const settings = getSettings();
  const artifact = getArtifactAt(index);
  applyAuditVisibility(
    index,
    Boolean(settings.enabled && artifact?.hiddenByAudit),
    Boolean(settings.enabled && artifact?.audit && !artifact.audit.passed && !artifact.hiddenByAudit)
  );
  messageElement.querySelector(":scope > .ma11-message-panel")?.remove();
  if (!settings.showMessagePanel) return;
  if (!artifact) return;
  messageElement.insertAdjacentHTML("beforeend", panelHtml(index, artifact));
}
function renderAllMessagePanels() {
  getChat().forEach((message, index) => {
    if (!message?.is_user) renderMessagePanel(index);
  });
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
    if (target.closest('[data-ma-action="open"]')) openWorkspace("overview", index);
    const stageAction = target.closest("[data-ma-stage-action]")?.dataset.maStageAction;
    if (stageAction) {
      if (pendingRetryIndexes.has(index)) return;
      pendingRetryIndexes.add(index);
      renderMessagePanel(index);
      toast("info", "\u5DF2\u63D0\u4EA4\u9636\u6BB5\u4EFB\u52A1\uFF0C\u8BF7\u7A0D\u5019");
      const task = stageAction === "small" || stageAction === "large" ? forceSummary(index, stageAction) : retryStage(index, stageAction);
      void task.catch((error) => {
        toast("error", toErrorMessage(error));
      }).finally(() => {
        pendingRetryIndexes.delete(index);
        renderMessagePanel(index);
      });
      return;
    }
    const retry = target.closest("[data-ma-retry]")?.dataset.maRetry;
    if (retry) {
      if (pendingRetryIndexes.has(index)) return;
      pendingRetryIndexes.add(index);
      renderMessagePanel(index);
      toast("info", "\u5DF2\u63D0\u4EA4\u91CD\u8BD5\uFF0C\u8BF7\u7A0D\u5019");
      void retryStage(index, retry).catch((error) => {
        toast("error", toErrorMessage(error));
      }).finally(() => {
        pendingRetryIndexes.delete(index);
        renderMessagePanel(index);
      });
    }
  };
  document.addEventListener("click", click);
  const unsubscribe = subscribePipeline((index) => renderMessagePanel(index));
  return () => {
    installed = false;
    pendingRetryIndexes.clear();
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
async function mountSettingsPanel(isCurrent = () => true) {
  if (document.querySelector("#ma11-settings-root")) return;
  const context = getContext();
  const host = await waitForElement("#extensions_settings2");
  if (!isCurrent()) return;
  const html = await context.renderExtensionTemplateAsync(extensionPathFromUrl(), "settings", {
    title: DISPLAY_NAME,
    version: VERSION
  });
  if (!isCurrent() || document.querySelector("#ma11-settings-root")) return;
  host.insertAdjacentHTML("beforeend", html);
  const root2 = document.querySelector("#ma11-settings-root");
  if (!root2) throw new Error("\u8BBE\u7F6E\u6A21\u677F\u52A0\u8F7D\u540E\u672A\u627E\u5230\u6839\u8282\u70B9");
  root2.querySelector('[data-ma11-quick-setting="enabled"]').checked = getSettings().enabled;
  root2.querySelector('[data-ma11-action="open"]')?.addEventListener("click", () => openWorkspace("overview"));
  root2.querySelector('[data-ma11-action="diagnostics"]')?.addEventListener("click", () => openWorkspace("diagnostics"));
  root2.querySelector('[data-ma11-quick-setting="enabled"]')?.addEventListener("change", (event) => {
    const enabled = event.target.checked;
    getSettings().enabled = enabled;
    setRequestAcceptance(enabled);
    taskQueue.setAccepting(enabled);
    if (!enabled) abortActiveRequests();
    saveSettings();
    const workspaceToggle = document.querySelector('[data-ma11-setting="enabled"]');
    if (workspaceToggle) workspaceToggle.checked = enabled;
    renderAllMessagePanels();
    refreshWorkspace();
  });
}
function mountOptionalTopButton() {
  const settings = getSettings();
  document.querySelector("#ma11-top-button")?.remove();
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

// src/bootstrap/app.ts
var state = "idle";
var cleanupPipeline = null;
var cleanupPanels = null;
var cleanupUiEvents = null;
var appReadyHandlerInstalled = false;
var appReadyContext = null;
var appReadyHandler = null;
var extensionEnabled = true;
var lifecycleGeneration = 0;
var debugRegistered = false;
var startupAttempts = 0;
var lastError = null;
var MAX_STARTUP_ATTEMPTS = 20;
function exposeApi() {
  globalThis.MirrorAbyss = {
    version: VERSION,
    open: (tab = "overview") => {
      if (!extensionEnabled) throw new Error("\u955C\u6E0A\u63D2\u4EF6\u5F53\u524D\u5DF2\u7981\u7528");
      return openWorkspace(tab);
    },
    processLatest: async () => {
      if (!extensionEnabled) throw new Error("\u955C\u6E0A\u63D2\u4EF6\u5F53\u524D\u5DF2\u7981\u7528");
      if (!getSettings().enabled) throw new Error("\u955C\u6E0A\u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u542F\u7528");
      const context = getContext();
      const index = [...context.chat ?? []].map((_, i) => i).reverse().find((i) => isProcessableAssistantMessage(context.chat[i]));
      if (index === void 0) throw new Error("\u6CA1\u6709\u53EF\u6574\u7406\u7684AI\u6B63\u6587");
      return processMessage(index, true);
    },
    diagnostics: diagnosticReport,
    restart: restartPlugin,
    getState: () => ({ state, lastError: lastError instanceof Error ? lastError.message : String(lastError || "") })
  };
}
async function restartPlugin() {
  shutdown();
  taskQueue.resetRuntime();
  resetLorebookRuntime();
  extensionEnabled = true;
  startupAttempts = 0;
  installAppReadyHandler();
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
async function initialize() {
  if (!extensionEnabled) return;
  if (state === "ready" || state === "initializing") return;
  const generation = lifecycleGeneration;
  state = "initializing";
  lastError = null;
  exposeApi();
  try {
    const settings = getSettings();
    setRequestAcceptance(settings.enabled);
    taskQueue.setAccepting(settings.enabled);
    await mountSettingsPanel(() => extensionEnabled && generation === lifecycleGeneration);
    if (!extensionEnabled || generation !== lifecycleGeneration) return;
    mountOptionalTopButton();
    cleanupPipeline ||= installPipelineEventHandlers();
    cleanupPanels ||= installMessagePanelHandlers();
    renderAllMessagePanels();
    const context = getContext();
    if (!cleanupUiEvents) {
      const rerender = () => {
        renderAllMessagePanels();
        refreshWorkspace();
      };
      const resetAndRerender = () => {
        resetWorkspaceContext();
        rerender();
      };
      context.eventSource.on(context.event_types.CHARACTER_MESSAGE_RENDERED, rerender);
      context.eventSource.on(context.event_types.CHAT_CHANGED, resetAndRerender);
      context.eventSource.on(context.event_types.MESSAGE_DELETED, resetAndRerender);
      cleanupUiEvents = () => {
        context.eventSource.removeListener?.(context.event_types.CHARACTER_MESSAGE_RENDERED, rerender);
        context.eventSource.removeListener?.(context.event_types.CHAT_CHANGED, resetAndRerender);
        context.eventSource.removeListener?.(context.event_types.MESSAGE_DELETED, resetAndRerender);
      };
    }
    if (!debugRegistered && typeof context.registerDebugFunction === "function") {
      context.registerDebugFunction(
        "mirror_abyss_diagnostics",
        "Mirror Abyss Diagnostics",
        "Open the Mirror Abyss diagnostics panel",
        () => {
          if (!extensionEnabled) throw new Error("\u955C\u6E0A\u63D2\u4EF6\u5F53\u524D\u5DF2\u7981\u7528");
          openWorkspace("diagnostics");
        }
      );
      debugRegistered = true;
    }
    document.querySelector("#ma11-fatal")?.remove();
    state = "ready";
    toast("success", `\u5DF2\u542F\u52A8 ${VERSION}`);
  } catch (error) {
    if (!extensionEnabled || generation !== lifecycleGeneration) return;
    state = "error";
    lastError = error;
    console.error("[MirrorAbyss] initialization failed", error);
    showFatal(error);
  }
}
function installAppReadyHandler() {
  if (!extensionEnabled) return;
  if (appReadyHandlerInstalled) return;
  const context = tryGetContext();
  if (!context) {
    startupAttempts += 1;
    if (startupAttempts < MAX_STARTUP_ATTEMPTS) {
      window.setTimeout(installAppReadyHandler, 250);
    } else {
      const error = new Error("\u7B49\u5F85SillyTavern\u4E0A\u4E0B\u6587\u8D85\u65F6\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5");
      state = "error";
      lastError = error;
      showFatal(error);
    }
    return;
  }
  startupAttempts = 0;
  appReadyHandlerInstalled = true;
  appReadyContext = context;
  appReadyHandler = () => {
    if (!extensionEnabled) return;
    void initialize();
  };
  context.eventSource.on(context.event_types.APP_READY, appReadyHandler);
  void initialize();
}
async function cleanData() {
  await clearAllStorage();
  const context = tryGetContext();
  if (context?.extensionSettings?.[MODULE_NAME]) delete context.extensionSettings[MODULE_NAME];
  context?.saveSettingsDebounced?.();
}
function onEnable() {
  extensionEnabled = true;
  startupAttempts = 0;
  installAppReadyHandler();
}
function shutdown() {
  lifecycleGeneration += 1;
  extensionEnabled = false;
  taskQueue.setAccepting(false);
  setRequestAcceptance(false);
  abortActiveRequests();
  resetLorebookRuntime();
  cleanupPipeline?.();
  cleanupPanels?.();
  cleanupUiEvents?.();
  cleanupPipeline = null;
  cleanupPanels = null;
  cleanupUiEvents = null;
  if (appReadyContext && appReadyHandler) {
    appReadyContext.eventSource.removeListener?.(appReadyContext.event_types.APP_READY, appReadyHandler);
  }
  appReadyContext = null;
  appReadyHandler = null;
  appReadyHandlerInstalled = false;
  document.querySelector("#ma11-top-button")?.remove();
  disposeWorkspace();
  document.querySelector("#ma11-settings-root")?.remove();
  document.querySelector("#ma11-fatal")?.remove();
  document.querySelectorAll(".ma11-message-panel").forEach((element) => element.remove());
  document.querySelectorAll(".ma11-audit-hidden-message, .ma11-audit-marked-message").forEach((element) => {
    element.classList.remove("ma11-audit-hidden-message");
    element.classList.remove("ma11-audit-marked-message");
  });
  state = "idle";
}
function onDisable() {
  shutdown();
}
function onActivate() {
  extensionEnabled = true;
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
  shutdown();
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
//# sourceMappingURL=index.js.map
