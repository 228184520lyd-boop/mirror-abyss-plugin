// src/constants.ts
var MODULE_NAME = "mirrorAbyssV11";
var LEGACY_MODULE_NAME = "mirrorAbyss";
var DISPLAY_NAME = "\u955C\u6E0A";
var VERSION = "1.1.0-alpha.2";
var PIPELINE_VERSION = "ma-pipeline-1";
var TABLE_KEYS = [
  "focus",
  "spacetime",
  "characters",
  "relationships",
  "items",
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
  auditFailAction: "mark",
  autoSmallSummary: true,
  smallSummaryTurns: 15,
  autoLargeSummary: true,
  largeSummaryCount: 6,
  lorebookSync: true,
  autoCreateLorebook: true,
  lorebookName: "",
  vectorizeRows: false,
  latestContinuityConstant: true,
  repairInvalidJsonOnce: true,
  requestTimeoutMs: 9e4,
  connections: {
    audit: { mode: "current", profile: "" },
    state: { mode: "current", profile: "" },
    smallSummary: { mode: "current", profile: "" },
    largeSummary: { mode: "current", profile: "" }
  },
  ui: {
    activeTab: "overview",
    activeTable: "focus"
  },
  migration: {
    legacyChecked: false
  }
};
var STORAGE_DB_NAME = "mirror-abyss-v11";
var STORAGE_CHAT_PREFIX = "ma11:chat:";
var STORAGE_ARTIFACT_PREFIX = "ma11:artifact:";
var STORAGE_LOG_PREFIX = "ma11:log:";

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
function parseJsonObject(raw) {
  const text = safeText(raw).trim();
  if (!text || text === "{}") throw new Error("\u6A21\u578B\u8FD4\u56DE\u4E3A\u7A7A");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON\u6839\u8282\u70B9\u5FC5\u987B\u662F\u5BF9\u8C61");
    return parsed;
  } catch (error) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON\u6839\u8282\u70B9\u5FC5\u987B\u662F\u5BF9\u8C61");
      return parsed;
    }
    throw error instanceof Error ? error : new Error("\u65E0\u6CD5\u89E3\u6790\u6A21\u578B\u8FD4\u56DE\u7684JSON");
  }
}
function sanitizeBookName(value) {
  return String(value ?? "").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 80);
}
function toErrorMessage(error) {
  if (error instanceof Error) return error.message;
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
  return context.extensionSettings[MODULE_NAME];
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
      audit: { mode: legacy.auditProfile ? "profile" : "current", profile: safeText(legacy.auditProfile ?? "", 120) },
      state: { mode: legacy.stateProfile ? "profile" : "current", profile: safeText(legacy.stateProfile ?? "", 120) },
      smallSummary: { mode: legacy.smallSummaryProfile ? "profile" : "current", profile: safeText(legacy.smallSummaryProfile ?? "", 120) },
      largeSummary: { mode: legacy.largeSummaryProfile ? "profile" : "current", profile: safeText(legacy.largeSummaryProfile ?? "", 120) }
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
var adapter = null;
function getAdapter() {
  if (adapter) return adapter;
  const localforage = globalThis.SillyTavern?.libs?.localforage;
  if (localforage?.createInstance) {
    adapter = localforage.createInstance({ name: STORAGE_DB_NAME, storeName: "mirror_abyss" });
    return adapter;
  }
  adapter = {
    async getItem(key) {
      const raw = localStorage.getItem(`${STORAGE_DB_NAME}:${key}`);
      return raw ? JSON.parse(raw) : null;
    },
    async setItem(key, value) {
      localStorage.setItem(`${STORAGE_DB_NAME}:${key}`, JSON.stringify(value));
      return value;
    },
    async removeItem(key) {
      localStorage.removeItem(`${STORAGE_DB_NAME}:${key}`);
    },
    async keys() {
      return Object.keys(localStorage).filter((key) => key.startsWith(`${STORAGE_DB_NAME}:`)).map((key) => key.slice(STORAGE_DB_NAME.length + 1));
    }
  };
  return adapter;
}
async function getChatState(chatKey) {
  const key = `${STORAGE_CHAT_PREFIX}${chatKey}`;
  const existing = await getAdapter().getItem(key);
  return existing ?? {
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
  await getAdapter().setItem(`${STORAGE_CHAT_PREFIX}${state2.chatKey}`, state2);
}
async function putArtifact(artifact) {
  artifact.updatedAt = nowIso();
  await getAdapter().setItem(`${STORAGE_ARTIFACT_PREFIX}${artifact.chatKey}:${artifact.messageKey}`, artifact);
}
async function removeArtifact(chatKey, messageKey) {
  await getAdapter().removeItem(`${STORAGE_ARTIFACT_PREFIX}${chatKey}:${messageKey}`);
}
async function appendTaskLog(chatKey, task) {
  const key = `${STORAGE_LOG_PREFIX}${chatKey}`;
  const logs = await getAdapter().getItem(key) ?? [];
  logs.unshift(task);
  await getAdapter().setItem(key, logs.slice(0, 200));
}
async function getTaskLog(chatKey) {
  return await getAdapter().getItem(`${STORAGE_LOG_PREFIX}${chatKey}`) ?? [];
}
async function clearAllStorage() {
  const storage = getAdapter();
  const keys = await storage.keys();
  await Promise.all(keys.filter((key) => key.startsWith("ma11:")).map((key) => storage.removeItem(key)));
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

// src/llm/generator.ts
var profileMutex = Promise.resolve();
function slashResultText(result) {
  if (typeof result === "string") return result.trim();
  for (const key of ["pipe", "output", "result", "text", "value"]) {
    if (typeof result?.[key] === "string") return result[key].trim();
  }
  return "";
}
function cleanProfileName(value) {
  return safeText(value, 160).replace(/["|\r\n]/g, "").trim();
}
async function generateCurrent(options) {
  const context = getContext();
  if (typeof context.generateRaw !== "function") throw new Error("\u5F53\u524DSillyTavern\u672A\u63D0\u4F9BgenerateRaw");
  const settings = getSettings();
  const result = await withTimeout(
    Promise.resolve(context.generateRaw({ systemPrompt: options.systemPrompt, prompt: options.prompt })),
    Math.max(1e4, Number(settings.requestTimeoutMs) || 9e4),
    `${options.task}\u6A21\u578B\u8C03\u7528`
  );
  return safeText(result, 2e5);
}
async function generateWithProfile(options, profileName) {
  const profile = cleanProfileName(profileName);
  if (!profile) throw new Error("\u8FDE\u63A5\u914D\u7F6E\u540D\u79F0\u4E3A\u7A7A");
  const run = async () => {
    let slashModule;
    try {
      const moduleUrl = "/scripts/slash-commands.js";
      slashModule = await import(
        /* @vite-ignore */
        moduleUrl
      );
    } catch (error) {
      throw new Error(`\u65E0\u6CD5\u52A0\u8F7D\u8FDE\u63A5\u914D\u7F6E\u5207\u6362\u5668\uFF1A${toErrorMessage(error)}`);
    }
    const execute = slashModule?.executeSlashCommands;
    if (typeof execute !== "function") throw new Error("\u5F53\u524DSillyTavern\u4E0D\u652F\u6301\u8FDE\u63A5\u914D\u7F6E\u547D\u4EE4");
    const original = slashResultText(await execute("/profile"));
    await execute(`/profile "${profile}"`);
    try {
      return await generateCurrent(options);
    } finally {
      if (original && original !== profile) {
        try {
          await execute(`/profile "${cleanProfileName(original)}"`);
        } catch (error) {
          console.warn("[MirrorAbyss] failed to restore profile", error);
        }
      }
    }
  };
  const chained = profileMutex.then(run, run);
  profileMutex = chained.catch(() => void 0);
  return chained;
}
async function generateTask(options) {
  const connection = getSettings().connections[options.task];
  if (connection?.mode === "profile") return generateWithProfile(options, connection.profile);
  return generateCurrent(options);
}
async function testConnection(task) {
  const raw = await generateTask({
    task,
    systemPrompt: "\u4F60\u662F\u8FDE\u63A5\u6D4B\u8BD5\u5668\u3002",
    prompt: "\u53EA\u56DE\u590D MA_OK"
  });
  if (!/MA_OK/i.test(raw)) throw new Error(`\u8FDE\u63A5\u53EF\u7528\uFF0C\u4F46\u8FD4\u56DE\u5185\u5BB9\u5F02\u5E38\uFF1A${raw.slice(0, 120)}`);
  return "MA_OK";
}

// src/prompts/audit.ts
function auditSystemPrompt() {
  return `\u4F60\u662F\u201C\u955C\u6E0A\u201D\u89C4\u5219\u5BA1\u6838\u5668\u3002\u4F60\u53EA\u68C0\u67E5\u7ED9\u5B9AAI\u6B63\u6587\u662F\u5426\u8FDD\u53CD\u73A9\u5BB6\u63D0\u4F9B\u7684\u786C\u6027\u89C4\u5219\uFF0C\u4E0D\u7EED\u5199\uFF0C\u4E0D\u6DA6\u8272\uFF0C\u4E0D\u66FF\u6B63\u6587\u8FA9\u62A4\u3002

\u7B2C\u4E00\u884C\u5FC5\u987B\u4E14\u53EA\u80FD\u662F MA_OK \u6216 MA_FAIL\u3002
\u7B2C\u4E8C\u884C\u5F00\u59CB\u7ED9\u51FA\u7B80\u77ED\u3001\u53EF\u6267\u884C\u7684\u7406\u7531\uFF1B\u901A\u8FC7\u65F6\u7406\u7531\u4E0D\u8D85\u8FC7\u4E00\u53E5\u3002
\u4E0D\u8981\u8F93\u51FAMarkdown\u4EE3\u7801\u5757\uFF0C\u4E0D\u8981\u8F93\u51FA\u5176\u4ED6\u6807\u7B7E\u3002
\u53EA\u6709\u5B58\u5728\u660E\u786E\u8FDD\u89C4\u65F6\u624D\u5224\u5B9A MA_FAIL\uFF1B\u8BC1\u636E\u4E0D\u8DB3\u65F6\u5224\u5B9A MA_OK\u3002`;
}
function auditUserPrompt(rulePrompt, playerText, assistantText) {
  return `\u3010\u73A9\u5BB6\u5BA1\u6838\u89C4\u5219\u3011
${rulePrompt}

\u3010\u73A9\u5BB6\u672C\u8F6E\u8F93\u5165\u3011
${playerText || "\uFF08\u7A7A\uFF09"}

\u3010\u5F85\u5BA1\u6838AI\u6B63\u6587\u3011
${assistantText}`;
}

// src/pipeline/audit.ts
function parseAuditResult(raw) {
  const text = safeText(raw).trim().replace(/\r/g, "");
  const lines = text.split("\n");
  const first = (lines[0] || "").trim().toUpperCase();
  const reason = lines.slice(1).join("\n").trim();
  if (first === "MA_OK") return { passed: true, reason: reason || "\u901A\u8FC7" };
  if (first === "MA_FAIL") return { passed: false, reason: reason || "\u8FDD\u53CD\u89C4\u5219" };
  throw new Error("\u89C4\u5219\u5BA1\u6838\u6A21\u578B\u672A\u8FD4\u56DE MA_OK \u6216 MA_FAIL");
}
function findMessageElement(index) {
  return document.querySelector(`.mes[mesid="${index}"], .mes[data-message-id="${index}"], #chat .mes:nth-of-type(${index + 1})`);
}
function applyAuditVisibility(index, hidden) {
  const element = findMessageElement(index);
  element?.classList.toggle("ma11-audit-hidden-message", hidden);
}
async function safeDeleteLatest(index, fingerprint) {
  if (index !== latestAssistantIndex()) return false;
  if (messageFingerprint(index) !== fingerprint) return false;
  const beforeLength = getChat().length;
  try {
    const moduleUrl = "/scripts/slash-commands.js";
    const slashModule = await import(
      /* @vite-ignore */
      moduleUrl
    );
    if (typeof slashModule?.executeSlashCommands !== "function") return false;
    await slashModule.executeSlashCommands("/del 1");
    return getChat().length < beforeLength;
  } catch (error) {
    console.warn("[MirrorAbyss] safe delete unavailable", error);
    return false;
  }
}
async function runAudit(artifact, force = false) {
  const settings = getSettings();
  if (!settings.auditEnabled) {
    markStage(artifact, "audit", "skipped");
    artifact.audit = { passed: true, reason: "\u672A\u542F\u7528\u89C4\u5219\u5BA1\u6838" };
    await putArtifact(artifact);
    return artifact.audit;
  }
  if (!settings.auditPrompt.trim()) throw new Error("\u5DF2\u542F\u7528\u89C4\u5219\u5BA1\u6838\uFF0C\u4F46\u5BA1\u6838\u63D0\u793A\u8BCD\u4E3A\u7A7A");
  if (!force && artifact.stages.audit.status === "success" && artifact.audit?.passed) return artifact.audit;
  markStage(artifact, "audit", "running");
  await putArtifact(artifact);
  try {
    const raw = await generateTask({
      task: "audit",
      systemPrompt: auditSystemPrompt(),
      prompt: auditUserPrompt(settings.auditPrompt, artifact.playerText, artifact.assistantText)
    });
    const result = parseAuditResult(raw);
    artifact.audit = result;
    if (result.passed) {
      artifact.hiddenByAudit = false;
      applyAuditVisibility(artifact.messageIndex, false);
      markStage(artifact, "audit", "success");
    } else {
      markStage(artifact, "audit", "blocked", result.reason);
      if (settings.auditFailAction === "hide") {
        artifact.hiddenByAudit = true;
        applyAuditVisibility(artifact.messageIndex, true);
      } else if (settings.auditFailAction === "delete") {
        const deleted = await safeDeleteLatest(artifact.messageIndex, artifact.sourceFingerprint);
        if (!deleted) {
          artifact.hiddenByAudit = true;
          applyAuditVisibility(artifact.messageIndex, true);
          toast("warning", "\u5BA1\u6838\u672A\u901A\u8FC7\uFF0C\u4F46\u5B89\u5168\u64A4\u56DE\u6761\u4EF6\u4E0D\u6210\u7ACB\uFF1B\u5DF2\u6539\u4E3A\u9690\u85CF\u5E76\u4FDD\u7559\u8BB0\u5F55");
        }
      }
    }
    const message = getMessage(artifact.messageIndex);
    if (message && messageFingerprint(artifact.messageIndex) === artifact.sourceFingerprint) {
      attachArtifactToMessage(message, artifact);
      await persistChat();
    }
    await putArtifact(artifact);
    return result;
  } catch (error) {
    markStage(artifact, "audit", "failed", toErrorMessage(error));
    await putArtifact(artifact);
    throw error;
  }
}

// src/pipeline/lorebook.ts
var worldInfoModulePromise = null;
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
function generatedBookName() {
  const context = getContext();
  const display = sanitizeBookName(context.name2 || context.name1 || "Chat") || "Chat";
  return sanitizeBookName(`MA_${display}_${hashText(currentChatKey()).slice(0, 8)}`);
}
async function resolveBookName(create) {
  const settings = getSettings();
  const meta = getChatMetadataNamespace();
  const context = getContext();
  let name = sanitizeBookName(settings.lorebookName || meta.lorebookName || context.chatMetadata?.world_info || "");
  if (!name && create && settings.autoCreateLorebook) name = generatedBookName();
  if (!name) return "";
  if (create) {
    const wi = await worldInfoApi();
    let data = await wi.loadWorldInfo(name);
    if (!data && typeof wi.createNewWorldInfo === "function") {
      await wi.createNewWorldInfo(name, { interactive: false });
      data = await wi.loadWorldInfo(name);
    }
    if (!data) {
      data = { entries: {} };
      await wi.saveWorldInfo(name, data, true);
    }
    context.chatMetadata ||= {};
    context.chatMetadata[wi.METADATA_KEY || "world_info"] = name;
    meta.lorebookName = name;
    await persistMetadata();
  }
  return name;
}
function rowKeywords(row) {
  return [...new Set([row.title, ...row.keywords].map((item) => String(item || "").trim()).filter((item) => item.length >= 2))].slice(0, 16);
}
function managedInfo(entry) {
  return entry?.extensions?.mirrorAbyssV11 ?? null;
}
function applyEntry(entry, key, spec, wi) {
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
    version: VERSION
  };
}
async function desiredSpecs(artifact) {
  const settings = getSettings();
  const state2 = await getChatState(artifact.chatKey);
  const desired = /* @__PURE__ */ new Map();
  if (artifact.snapshot) {
    for (const tableKey of TABLE_KEYS) {
      for (const row of artifact.snapshot[tableKey]) {
        const constant = ["focus", "spacetime", "foundations"].includes(tableKey);
        desired.set(`state:${tableKey}:${row.id}`, {
          comment: `[MA11][${TABLE_LABELS[tableKey]}] ${row.title}`,
          content: `[${TABLE_LABELS[tableKey]}\uFF1A${row.title}]
${row.content}${row.status ? `
\u72B6\u6001\uFF1A${row.status}` : ""}`,
          keywords: rowKeywords(row),
          constant,
          vectorized: !constant && settings.vectorizeRows,
          order: constant ? 140 : 100,
          kind: `state:${tableKey}`
        });
      }
    }
  }
  for (const item of state2.smallSummaries) {
    desired.set(`small:${item.id}`, {
      comment: `[MA11][\u5C0F\u603B\u7ED3] ${item.title}`,
      content: item.summary,
      keywords: [item.title, ...item.keywords].filter(Boolean).slice(0, 16),
      constant: false,
      vectorized: true,
      order: 110,
      kind: "small"
    });
  }
  for (const item of state2.largeSummaries) {
    desired.set(`large:${item.id}`, {
      comment: `[MA11][\u5927\u603B\u7ED3] ${item.title}`,
      content: item.summary,
      keywords: [item.title, ...item.keywords].filter(Boolean).slice(0, 16),
      constant: false,
      vectorized: true,
      order: 120,
      kind: "large"
    });
  }
  if (settings.latestContinuityConstant) {
    const latest = state2.largeSummaries.at(-1) ?? state2.smallSummaries.at(-1);
    if (latest) {
      desired.set("core:latest", {
        comment: "[MA11][\u5F53\u524D\u8FDE\u7EED\u6027\u6838\u5FC3]",
        content: latest.summary,
        keywords: ["\u5F53\u524D\u8FDE\u7EED\u6027", "\u5F53\u524D\u72B6\u6001"],
        constant: true,
        vectorized: false,
        order: 150,
        kind: "core"
      });
    }
  }
  return desired;
}
async function syncLorebook(artifact) {
  const settings = getSettings();
  if (!settings.lorebookSync) {
    markStage(artifact, "sync", "skipped");
    await putArtifact(artifact);
    return;
  }
  markStage(artifact, "sync", "running");
  await putArtifact(artifact);
  const chatState = await getChatState(artifact.chatKey);
  chatState.lastSyncStatus = "running";
  chatState.lastSyncError = void 0;
  await putChatState(chatState);
  try {
    const wi = await worldInfoApi();
    const name = await resolveBookName(true);
    if (!name) throw new Error("\u6CA1\u6709\u53EF\u7528\u7684\u804A\u5929\u4E16\u754C\u4E66");
    const data = await wi.loadWorldInfo(name) || { entries: {} };
    data.entries ||= {};
    const desired = await desiredSpecs(artifact);
    const existing = /* @__PURE__ */ new Map();
    for (const [uid, entry] of Object.entries(data.entries)) {
      const info = managedInfo(entry);
      if (info?.managed && info.key) existing.set(info.key, { uid, entry });
    }
    let changed = false;
    const entryIds = [];
    for (const [key, spec] of desired) {
      let pair = existing.get(key);
      let entry = pair?.entry;
      if (!entry) {
        entry = wi.createWorldInfoEntry(name, data);
        if (!entry) continue;
        pair = { uid: String(entry.uid), entry };
        changed = true;
      }
      const before = JSON.stringify(entry);
      applyEntry(entry, key, spec, wi);
      if (before !== JSON.stringify(entry)) changed = true;
      existing.delete(key);
      if (Number.isFinite(Number(entry.uid))) entryIds.push(Number(entry.uid));
    }
    for (const { uid } of existing.values()) {
      delete data.entries[uid];
      changed = true;
    }
    if (changed) {
      await wi.saveWorldInfo(name, data, true);
      wi.reloadEditor?.(name);
    }
    artifact.lorebookEntryIds = entryIds;
    markStage(artifact, "sync", "success");
    chatState.lastLorebookName = name;
    chatState.lastSyncAt = (/* @__PURE__ */ new Date()).toISOString();
    chatState.lastSyncStatus = "success";
    chatState.lastSyncError = void 0;
    await putArtifact(artifact);
    await putChatState(chatState);
  } catch (error) {
    const message = toErrorMessage(error);
    markStage(artifact, "sync", "failed", message);
    chatState.lastSyncStatus = "failed";
    chatState.lastSyncError = message;
    await putArtifact(artifact);
    await putChatState(chatState);
    throw error;
  }
}

// src/domain/summary.ts
function normalizeSummary(value, kind, sourceKeys) {
  return {
    id: makeId(kind),
    kind,
    title: safeText(value.title || (kind === "small" ? "\u9636\u6BB5\u5FEB\u7167" : "\u957F\u671F\u5FEB\u7167"), 240).trim(),
    summary: safeText(value.summary || "", 3e4).trim(),
    keywords: Array.isArray(value.keywords) ? [...new Set(value.keywords.map((item) => safeText(item, 80).trim()).filter(Boolean))].slice(0, 24) : [],
    sourceKeys,
    createdAt: nowIso()
  };
}

// src/prompts/summary.ts
function smallSummarySystemPrompt() {
  return "\u4F60\u662F\u955C\u6E0A\u9636\u6BB5\u5FEB\u7167\u7ED3\u7B97\u5668\u3002\u53EA\u8F93\u51FA\u5408\u6CD5JSON\u5BF9\u8C61\uFF0C\u5B57\u6BB5\u4E3A title\u3001summary\u3001keywords\u3002\u4E0D\u8981\u7EED\u5199\u6545\u4E8B\uFF0C\u4E0D\u628A\u672A\u786E\u8BA4\u4E8B\u9879\u5199\u6210\u4E8B\u5B9E\u3002";
}
function smallSummaryPrompt(transcript, snapshot) {
  return `\u5C06\u4EE5\u4E0B\u56DE\u5408\u538B\u7F29\u6210\u201C\u5F53\u524D\u4E16\u754C\u5FEB\u7167\u5F0F\u5C0F\u603B\u7ED3\u201D\u3002\u4E0D\u662F\u6D41\u6C34\u8D26\u3002\u91CD\u70B9\u4FDD\u7559\uFF1A\u786E\u5B9A\u7ED3\u679C\u3001\u4E0D\u53EF\u9006\u53D8\u5316\u3001\u5F53\u524D\u4EBA\u7269/\u5173\u7CFB/\u7269\u54C1/\u533A\u57DF\u72B6\u6001\u3001\u4ECD\u5728\u8FDB\u884C\u7684\u6D41\u7A0B\u3001\u672A\u51B3\u4E0E\u51B2\u7A81\u3002\u5DF2\u7ECF\u88AB\u6700\u7EC8\u7ED3\u679C\u66FF\u4EE3\u7684\u4E2D\u95F4\u52A8\u4F5C\u4E0D\u5C55\u5F00\u3002

\u3010\u56DE\u5408\u3011
${transcript}

\u3010\u5F53\u524D\u72B6\u6001\u8868\u3011
${JSON.stringify(snapshot, null, 2)}

\u53EA\u8F93\u51FA\uFF1A{"title":"...","summary":"...","keywords":["..."]}`;
}
function largeSummarySystemPrompt() {
  return "\u4F60\u662F\u955C\u6E0A\u957F\u671F\u5FEB\u7167\u7ED3\u7B97\u5668\u3002\u53EA\u8F93\u51FA\u5408\u6CD5JSON\u5BF9\u8C61\uFF0C\u5B57\u6BB5\u4E3A title\u3001summary\u3001keywords\u3002";
}
function largeSummaryPrompt(summaries, snapshot) {
  const source = summaries.map((item) => `\u3010${item.title}\u3011
${item.summary}`).join("\n\n");
  return `\u5C06\u4E0B\u5217\u5C0F\u603B\u7ED3\u518D\u6B21\u538B\u7F29\u6210\u957F\u671F\u5FEB\u7167\u3002\u4FDD\u7559\u957F\u671F\u4ECD\u6210\u7ACB\u7684\u4EBA\u7269\u3001\u5173\u7CFB\u3001\u533A\u57DF\u3001\u7269\u54C1\u3001\u4E8B\u4EF6\u7ED3\u679C\u548C\u672A\u51B3\u4E8B\u9879\uFF1B\u4E0D\u8981\u590D\u8FF0\u9636\u6BB5\u6D41\u6C34\u8D26\uFF0C\u4E0D\u8981\u5F3A\u884C\u95ED\u5408\u5F00\u653E\u4E8B\u4EF6\u3002

${source}

\u3010\u5F53\u524D\u72B6\u6001\u8868\u3011
${JSON.stringify(snapshot, null, 2)}

\u53EA\u8F93\u51FA\uFF1A{"title":"...","summary":"...","keywords":["..."]}`;
}

// src/pipeline/summary.ts
function successfulArtifacts() {
  return getChat().filter((message) => !message?.is_user).map((message) => message?.extra?.mirrorAbyssV11).filter((artifact) => Boolean(artifact?.snapshot && artifact.stages.state.status === "success"));
}
function transcriptFor(artifacts) {
  return artifacts.map((artifact) => `\u3010\u56DE\u5408 ${artifact.messageIndex + 1}\u3011
\u73A9\u5BB6\uFF1A${artifact.playerText || "\uFF08\u7A7A\uFF09"}
\u6B63\u6587\uFF1A${artifact.assistantText}`).join("\n\n");
}
function allConsumedKeys(summaries) {
  return new Set(summaries.flatMap((item) => item.sourceKeys));
}
async function generateSmallSummary(artifact, force = false) {
  const settings = getSettings();
  const chatState = await getChatState(artifact.chatKey);
  const consumed = allConsumedKeys(chatState.smallSummaries);
  const pending = successfulArtifacts().filter((item) => !consumed.has(item.messageKey));
  const threshold = Math.max(1, Number(settings.smallSummaryTurns) || 15);
  if (!force && pending.length < threshold) return null;
  if (!pending.length) return null;
  const selected = force ? pending : pending.slice(0, threshold);
  const latestSnapshot = selected.at(-1)?.snapshot;
  const raw = await generateTask({
    task: "smallSummary",
    systemPrompt: smallSummarySystemPrompt(),
    prompt: smallSummaryPrompt(transcriptFor(selected), latestSnapshot)
  });
  const summary = normalizeSummary(parseJsonObject(raw), "small", selected.map((item) => item.messageKey));
  chatState.smallSummaries.push(summary);
  await putChatState(chatState);
  return summary;
}
async function generateLargeSummary(artifact, force = false) {
  const settings = getSettings();
  const chatState = await getChatState(artifact.chatKey);
  const consumed = allConsumedKeys(chatState.largeSummaries);
  const pending = chatState.smallSummaries.filter((item) => !consumed.has(item.id));
  const threshold = Math.max(1, Number(settings.largeSummaryCount) || 6);
  if (!force && pending.length < threshold) return null;
  if (!pending.length) return null;
  const selected = force ? pending : pending.slice(0, threshold);
  const snapshot = artifact.snapshot;
  if (!snapshot) throw new Error("\u6CA1\u6709\u53EF\u7528\u4E8E\u5927\u603B\u7ED3\u7684\u72B6\u6001\u8868");
  const raw = await generateTask({
    task: "largeSummary",
    systemPrompt: largeSummarySystemPrompt(),
    prompt: largeSummaryPrompt(selected, snapshot)
  });
  const summary = normalizeSummary(parseJsonObject(raw), "large", selected.map((item) => item.id));
  chatState.largeSummaries.push(summary);
  await putChatState(chatState);
  return summary;
}
async function maybeRunSummaries(artifact, forceSmall = false, forceLarge = false) {
  const settings = getSettings();
  markStage(artifact, "summary", "running");
  await putArtifact(artifact);
  try {
    if (settings.autoSmallSummary || forceSmall) await generateSmallSummary(artifact, forceSmall);
    if (settings.autoLargeSummary || forceLarge) await generateLargeSummary(artifact, forceLarge);
    markStage(artifact, "summary", "success");
    await putArtifact(artifact);
  } catch (error) {
    markStage(artifact, "summary", "failed", toErrorMessage(error));
    await putArtifact(artifact);
    throw error;
  }
}

// src/domain/snapshot.ts
function emptySnapshot() {
  return Object.fromEntries(TABLE_KEYS.map((key) => [key, []]));
}
function normalizeKeywords(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => safeText(item, 80).trim()).filter(Boolean))].slice(0, 16);
}
function normalizeRow(value, tableKey, index, previous) {
  const source = value && typeof value === "object" ? value : {};
  const now = nowIso();
  const id = safeText(source.id || previous?.id || makeId(tableKey), 160).trim() || makeId(tableKey);
  return {
    id,
    title: safeText(source.title || source.name || previous?.title || `${TABLE_LABELS[tableKey]} ${index + 1}`, 240).trim(),
    content: safeText(source.content || source.summary || previous?.content || "", 12e3).trim(),
    keywords: normalizeKeywords(source.keywords ?? previous?.keywords ?? []),
    status: safeText(source.status || previous?.status || "active", 120).trim() || "active",
    source: source.source === "manual" || previous?.source === "manual" ? "manual" : "auto",
    updatedAt: safeText(source.updatedAt || previous?.updatedAt || now, 80) || now
  };
}
function normalizeSnapshot(value, previousSnapshot2) {
  const source = value && typeof value === "object" ? value : {};
  const output = emptySnapshot();
  for (const key of TABLE_KEYS) {
    const rows = Array.isArray(source[key]) ? source[key] : [];
    const previousMap = new Map((previousSnapshot2?.[key] ?? []).map((row) => [row.id, row]));
    const used = /* @__PURE__ */ new Set();
    output[key] = rows.map((row, index) => {
      const rawId = row && typeof row === "object" ? safeText(row.id, 160) : "";
      const normalized = normalizeRow(row, key, index, rawId ? previousMap.get(rawId) : void 0);
      if (used.has(normalized.id)) normalized.id = makeId(key);
      used.add(normalized.id);
      return normalized;
    });
  }
  return output;
}
function snapshotRowCount(snapshot) {
  if (!snapshot) return 0;
  return TABLE_KEYS.reduce((sum, key) => sum + (snapshot[key]?.length ?? 0), 0);
}
function upsertManualRow(snapshot, tableKey, row) {
  const next = normalizeSnapshot(snapshot, snapshot);
  const index = next[tableKey].findIndex((item) => item.id === row.id);
  const normalized = normalizeRow({ ...row, source: "manual", updatedAt: nowIso() }, tableKey, index >= 0 ? index : next[tableKey].length, index >= 0 ? next[tableKey][index] : void 0);
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
    focus: [{ id: "stable-id", title: "\u5BF9\u8C61", content: "\u5F53\u524D\u4E8B\u5B9E", keywords: ["\u5173\u952E\u8BCD"], status: "active" }],
    spacetime: [],
    characters: [],
    relationships: [],
    items: [],
    events: [],
    regions: [],
    foundations: []
  }, null, 2);
}

// src/prompts/state.ts
function stateSystemPrompt() {
  return `\u4F60\u662F\u201C\u955C\u6E0A\u201D\u72B6\u6001\u7EF4\u62A4\u5668\u3002\u4F60\u53EA\u7EF4\u62A4\u5F53\u524D\u4E16\u754C\u72B6\u6001\u5FEB\u7167\uFF0C\u4E0D\u7EED\u5199\u6545\u4E8B\u3002

\u8F93\u51FA\u5FC5\u987B\u662F\u53EF\u76F4\u63A5\u88AB JSON.parse \u89E3\u6790\u7684\u5B8C\u6574JSON\u5BF9\u8C61\uFF0C\u4E0D\u8981\u8F93\u51FAMarkdown\u3001\u89E3\u91CA\u6216\u989D\u5916\u6587\u5B57\u3002
\u5FC5\u987B\u5305\u542B\u516B\u4E2A\u6570\u7EC4\uFF1Afocus\u3001spacetime\u3001characters\u3001relationships\u3001items\u3001events\u3001regions\u3001foundations\u3002
\u6BCF\u884C\u53EA\u5141\u8BB8\u5B57\u6BB5\uFF1Aid\u3001title\u3001content\u3001keywords\u3001status\u3002

\u7EF4\u62A4\u89C4\u5219\uFF1A
1. \u4FDD\u7559\u672A\u53D7\u672C\u8F6E\u5F71\u54CD\u3001\u4ECD\u6210\u7ACB\u7684\u72B6\u6001\u3002
2. \u53EA\u6709\u672C\u8F6E\u660E\u786E\u6539\u53D8\u7684\u72B6\u6001\u624D\u66F4\u65B0\u3002
3. \u8FC7\u7A0B\u538B\u7F29\u4E3A\u5F53\u524D\u7ED3\u679C\uFF0C\u4E0D\u5199\u6D41\u6C34\u8D26\u3002
4. \u672A\u786E\u8BA4\u3001\u51B2\u7A81\u548C\u8FDB\u884C\u4E2D\u4E8B\u9879\u4E0D\u5F97\u5F3A\u884C\u95ED\u5408\u3002
5. \u5C3D\u91CF\u4FDD\u7559\u4E0A\u4E00\u4EFD\u5FEB\u7167\u7684\u7A33\u5B9Aid\uFF1B\u65B0\u589E\u5BF9\u8C61\u624D\u521B\u5EFA\u65B0id\u3002
6. \u73A9\u5BB6\u8F93\u5165\u4E2D\u7684\u52A8\u4F5C\u548C\u5BF9\u767D\u53EF\u4F5C\u4E3A\u5DF2\u58F0\u660E\u884C\u4E3A\uFF0C\u4F46\u73A9\u5BB6\u9884\u8BBE\u7684\u5916\u90E8\u7ED3\u679C\u4E0D\u80FD\u5355\u72EC\u5F53\u6210\u5DF2\u786E\u8BA4\u7ED3\u679C\uFF1B\u5916\u90E8\u7ED3\u679C\u4EE5AI\u6B63\u6587\u4E0E\u5DF2\u6709\u72B6\u6001\u4E2D\u7684\u53EF\u89C2\u5BDF\u4E8B\u5B9E\u4E3A\u51C6\u3002
7. \u73A9\u5BB6\u624B\u5DE5\u52A0\u5165\u7684\u72B6\u6001\u4E0E\u5176\u4ED6\u72B6\u6001\u540C\u7B49\u53C2\u4E0E\u7EF4\u62A4\uFF0C\u4E0D\u5F97\u65E0\u6545\u5220\u9664\u3002

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
async function runStateExtraction(artifact, force = false) {
  if (!force && artifact.stages.state.status === "success" && artifact.snapshot) return artifact.snapshot;
  const settings = getSettings();
  const previous = previousSnapshot(artifact.messageIndex);
  markStage(artifact, "state", "running");
  await putArtifact(artifact);
  try {
    let raw = await generateTask({
      task: "state",
      systemPrompt: stateSystemPrompt(),
      prompt: stateUserPrompt(previous, artifact.playerText, artifact.assistantText)
    });
    let parsed;
    try {
      parsed = parseJsonObject(raw);
    } catch (firstError) {
      if (!settings.repairInvalidJsonOnce) throw firstError;
      raw = await generateTask({
        task: "state",
        systemPrompt: stateSystemPrompt(),
        prompt: stateUserPrompt(previous, artifact.playerText, artifact.assistantText, true)
      });
      parsed = parseJsonObject(raw);
    }
    const normalized = restoreManualRows(previous, normalizeSnapshot(parsed, previous));
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

// src/pipeline/task-queue.ts
var TaskQueue = class {
  tail = Promise.resolve();
  inFlight = /* @__PURE__ */ new Map();
  tasks = /* @__PURE__ */ new Map();
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
  list() {
    return [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  has(key) {
    return this.inFlight.has(key);
  }
  run(key, label, kind, work) {
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const task = {
      id: makeId("task"),
      key,
      label,
      kind,
      state: "queued",
      createdAt: nowIso()
    };
    this.tasks.set(task.id, task);
    this.notify();
    const execute = async () => {
      task.state = "running";
      task.startedAt = nowIso();
      this.notify();
      try {
        const result = await work();
        task.state = "success";
        return result;
      } catch (error) {
        task.state = "failed";
        task.error = toErrorMessage(error);
        throw error;
      } finally {
        task.finishedAt = nowIso();
        this.inFlight.delete(key);
        try {
          await appendTaskLog(currentChatKey(), { ...task });
        } catch (error) {
          console.warn("[MirrorAbyss] task log save failed", error);
        }
        this.notify();
      }
    };
    const promise = this.tail.then(execute, execute);
    this.tail = promise.catch(() => void 0);
    this.inFlight.set(key, promise);
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
function resolveMessageIndex(payload) {
  if (Number.isInteger(payload)) return Number(payload);
  const candidates = [payload?.messageId, payload?.message_id, payload?.mesId, payload?.mesid, payload?.index];
  for (const candidate of candidates) if (Number.isInteger(Number(candidate))) return Number(candidate);
  const chat = getChat();
  return chat.length ? chat.length - 1 : -1;
}
async function saveArtifactToMessage(index, artifact) {
  const message = getMessage(index);
  if (!message || message.is_user) return;
  if (messageFingerprint(index) !== artifact.sourceFingerprint) return;
  attachArtifactToMessage(message, artifact);
  await putArtifact(artifact);
  await persistChat();
  notify(index, artifact);
}
async function loadOrCreateArtifact(index, force) {
  const message = getMessage(index);
  if (!message || message.is_user || !String(message.mes || "").trim()) throw new Error("\u76EE\u6807\u4E0D\u662F\u6709\u6548AI\u6B63\u6587");
  const fingerprint = messageFingerprint(index);
  let artifact = getAttachedArtifact(message);
  if (!artifact || artifact.chatKey !== currentChatKey() || artifact.sourceFingerprint !== fingerprint || force) {
    artifact = createArtifact(message, index);
    attachArtifactToMessage(message, artifact);
    await persistChat();
    await putArtifact(artifact);
  }
  return artifact;
}
async function processMessage(index, force = false) {
  const settings = getSettings();
  if (!settings.enabled) return null;
  const message = getMessage(index);
  if (!message || message.is_user || !String(message.mes || "").trim()) return null;
  const identity = messageIdentity(index);
  const key = `${PIPELINE_VERSION}:${currentChatKey()}:${identity}`;
  return taskQueue.run(key, `\u5904\u7406\u7B2C ${index + 1} \u6761AI\u6B63\u6587`, "state", async () => {
    const artifact = await loadOrCreateArtifact(index, force);
    notify(index, artifact);
    try {
      const audit = await runAudit(artifact, force);
      await saveArtifactToMessage(index, artifact);
      if (!audit.passed) {
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
        markStage(artifact, "state", "skipped");
      }
      if (artifact.snapshot) {
        const chatState = await getChatState(artifact.chatKey);
        if (!chatState.processedMessageKeys.includes(artifact.messageKey)) chatState.processedMessageKeys.push(artifact.messageKey);
        chatState.latestSnapshotMessageKey = artifact.messageKey;
        chatState.updatedAt = nowIso();
        await putChatState(chatState);
        await maybeRunSummaries(artifact);
        await saveArtifactToMessage(index, artifact);
        await syncLorebook(artifact);
        await saveArtifactToMessage(index, artifact);
      }
      return artifact;
    } catch (error) {
      const messageText = toErrorMessage(error);
      console.error("[MirrorAbyss] pipeline failed", error);
      toast("error", `\u5904\u7406\u5931\u8D25\uFF1A${messageText}`);
      await saveArtifactToMessage(index, artifact);
      return artifact;
    }
  });
}
function scheduleMessage(payload, force = false, delay = 180) {
  const index = resolveMessageIndex(payload);
  if (index < 0) return;
  window.setTimeout(() => void processMessage(index, force), delay);
}
async function retryStage(index, stage) {
  const artifact = await loadOrCreateArtifact(index, false);
  const key = `${PIPELINE_VERSION}:retry:${stage}:${artifact.chatKey}:${artifact.messageKey}`;
  return taskQueue.run(key, `\u91CD\u8BD5${stage}`, stage === "sync" ? "sync" : stage === "summary" ? "smallSummary" : stage, async () => {
    if (stage === "audit") await runAudit(artifact, true);
    if (stage === "state") await runStateExtraction(artifact, true);
    if (stage === "summary") await maybeRunSummaries(artifact, true, true);
    if (stage === "sync") await syncLorebook(artifact);
    await saveArtifactToMessage(index, artifact);
    return artifact;
  });
}
async function forceSummary(index, kind) {
  const artifact = await loadOrCreateArtifact(index, false);
  const key = `${PIPELINE_VERSION}:force-summary:${kind}:${artifact.chatKey}:${artifact.messageKey}`;
  return taskQueue.run(key, `\u7ACB\u5373${kind === "small" ? "\u5C0F" : "\u5927"}\u603B\u7ED3`, kind === "small" ? "smallSummary" : "largeSummary", async () => {
    await maybeRunSummaries(artifact, kind === "small", kind === "large");
    await saveArtifactToMessage(index, artifact);
    return artifact;
  });
}
async function removeMessageArtifact(_payload) {
  const chatKey = currentChatKey();
  const chatState = await getChatState(chatKey);
  const liveKeys = new Set(
    getChat().map((message) => getAttachedArtifact(message)?.messageKey).filter((key) => Boolean(key))
  );
  const staleKeys = chatState.processedMessageKeys.filter((key) => !liveKeys.has(key));
  await Promise.all(staleKeys.map((key) => removeArtifact(chatKey, key)));
  chatState.processedMessageKeys = chatState.processedMessageKeys.filter((key) => liveKeys.has(key));
  if (chatState.latestSnapshotMessageKey && !liveKeys.has(chatState.latestSnapshotMessageKey)) {
    chatState.latestSnapshotMessageKey = [...liveKeys].at(-1);
  }
  await putChatState(chatState);
}
function getArtifactAt(index) {
  return getAttachedArtifact(getMessage(index));
}
function latestArtifact() {
  const chat = getChat();
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    const artifact = getAttachedArtifact(chat[i]);
    if (artifact) return { index: i, artifact };
  }
  return null;
}
function installPipelineEventHandlers() {
  const context = globalThis.SillyTavern.getContext();
  const { eventSource, event_types } = context;
  const onReceived = (payload) => scheduleMessage(payload, false);
  const onEdited = (payload) => scheduleMessage(payload, true, 300);
  const onSwiped = (payload) => scheduleMessage(payload, true, 300);
  const onDeleted = (payload) => void removeMessageArtifact(payload);
  eventSource.on(event_types.MESSAGE_RECEIVED, onReceived);
  eventSource.on(event_types.MESSAGE_EDITED, onEdited);
  eventSource.on(event_types.MESSAGE_SWIPED, onSwiped);
  eventSource.on(event_types.MESSAGE_DELETED, onDeleted);
  return () => {
    eventSource.removeListener?.(event_types.MESSAGE_RECEIVED, onReceived);
    eventSource.removeListener?.(event_types.MESSAGE_EDITED, onEdited);
    eventSource.removeListener?.(event_types.MESSAGE_SWIPED, onSwiped);
    eventSource.removeListener?.(event_types.MESSAGE_DELETED, onDeleted);
  };
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
    label: "\u540E\u53F0\u6A21\u578B\u8C03\u7528",
    status: typeof context?.generateRaw === "function" ? "ok" : "error",
    detail: typeof context?.generateRaw === "function" ? "generateRaw\u53EF\u7528" : "\u5F53\u524D\u7248\u672C\u672A\u63D0\u4F9BgenerateRaw"
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
  const settings = context ? getSettings() : null;
  checks.push({
    id: "audit",
    label: "\u89C4\u5219\u5BA1\u6838\u914D\u7F6E",
    status: settings?.auditEnabled && !settings.auditPrompt.trim() ? "error" : "ok",
    detail: settings?.auditEnabled ? settings.auditPrompt.trim() ? "\u5DF2\u542F\u7528\u5E76\u586B\u5199\u89C4\u5219" : "\u5DF2\u542F\u7528\u4F46\u89C4\u5219\u4E3A\u7A7A" : "\u672A\u542F\u7528"
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
    checks: await runDiagnostics(),
    settings: context ? { ...getSettings(), auditPrompt: getSettings().auditPrompt ? "[\u5DF2\u586B\u5199]" : "" } : null,
    chatState: context ? await getChatState(chatKey) : null,
    taskLog: context ? await getTaskLog(chatKey) : []
  };
}

// src/ui/workspace.ts
var selectedMessageIndex = null;
var rendering = false;
var queueUnsubscribe = null;
function root() {
  let element = document.querySelector("#ma11-workspace");
  if (element) return element;
  document.body.insertAdjacentHTML("beforeend", `
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
    ["summaries", "\u603B\u7ED3"],
    ["audit", "\u89C4\u5219\u5BA1\u6838"],
    ["sync", "\u4E16\u754C\u4E66"],
    ["settings", "\u6A21\u578B\u4E0E\u8BBE\u7F6E"],
    ["diagnostics", "\u8BCA\u65AD"]
  ].map(([key, label]) => `<button data-ma11-tab="${key}">${label}</button>`).join("")}
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
          <footer><button type="button" data-ma11-action="close-editor">\u53D6\u6D88</button><button type="submit">\u4FDD\u5B58</button></footer>
        </form>
      </div>
    </div>`);
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
function stageCards(artifact) {
  const stages = artifact?.stages;
  const rows = [
    ["audit", "\u89C4\u5219\u5BA1\u6838"],
    ["state", "\u72B6\u6001\u63D0\u53D6"],
    ["summary", "\u5206\u5C42\u603B\u7ED3"],
    ["sync", "\u4E16\u754C\u4E66\u540C\u6B65"]
  ];
  return `<div class="ma11-stage-grid">${rows.map(([key, label]) => {
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
  const rows = snapshotRowCount(artifact?.snapshot);
  const jobs = taskQueue.list().slice(0, 5);
  return `
    <section class="ma11-hero">
      <div>
        <h2>${artifact ? `\u7B2C ${artifact.messageIndex + 1} \u6761\u6B63\u6587` : "\u5F53\u524D\u804A\u5929\u5C1A\u65E0\u955C\u6E0A\u8BB0\u5F55"}</h2>
        <p>${artifact ? `\u72B6\u6001\u8868 ${rows} \u6761 \xB7 \u66F4\u65B0\u65F6\u95F4 ${escapeHtml(new Date(artifact.updatedAt).toLocaleString())}` : "\u751F\u6210\u4E00\u6761AI\u6B63\u6587\uFF0C\u6216\u624B\u52A8\u6574\u7406\u6700\u65B0\u6B63\u6587\u3002"}</p>
      </div>
      <div class="ma11-actions">
        <button data-ma11-action="process-latest">\u6574\u7406\u6700\u65B0\u6B63\u6587</button>
        <button data-ma11-action="open-tables" ${artifact?.snapshot ? "" : "disabled"}>\u67E5\u770B\u72B6\u6001\u8868</button>
      </div>
    </section>
    ${stageCards(artifact)}
    <section class="ma11-card">
      <header><b>\u4EFB\u52A1\u961F\u5217</b><span>${jobs.length ? `${jobs.length} \u6761\u6700\u8FD1\u4EFB\u52A1` : "\u7A7A\u95F2"}</span></header>
      <div class="ma11-task-list">
        ${jobs.length ? jobs.map((task) => `<div><span>${escapeHtml(task.label)}</span><em class="${task.state}">${escapeHtml(task.state)}</em></div>`).join("") : '<p class="ma11-empty">\u6CA1\u6709\u8FD0\u884C\u4E2D\u7684\u4EFB\u52A1\u3002</p>'}
      </div>
    </section>
    <section class="ma11-card ma11-note">
      <b>\u672C\u7248\u67B6\u6784\u539F\u5219</b>
      <p>\u6BCF\u6761AI\u6B63\u6587\u53EA\u521B\u5EFA\u4E00\u4E2A\u552F\u4E00\u4EFB\u52A1\uFF1B\u5BA1\u6838\u3001\u8868\u683C\u3001\u603B\u7ED3\u3001\u540C\u6B65\u5206\u9636\u6BB5\u4FDD\u5B58\u3002\u5355\u4E00\u9636\u6BB5\u5931\u8D25\u65F6\u53EA\u91CD\u8BD5\u8BE5\u9636\u6BB5\uFF0C\u4E0D\u91CD\u65B0\u8C03\u7528\u6574\u6761\u7BA1\u7EBF\u3002</p>
    </section>`;
}
function tableHtml(artifactInfo) {
  const settings = getSettings();
  const artifact = artifactInfo?.artifact;
  const active = settings.ui.activeTable;
  const rows = artifact?.snapshot?.[active] ?? [];
  return `
    <section class="ma11-toolbar">
      <div class="ma11-table-tabs">${TABLE_KEYS.map((key) => `<button class="${key === active ? "active" : ""}" data-ma11-table="${key}">${TABLE_LABELS[key]} <span>${artifact?.snapshot?.[key]?.length ?? 0}</span></button>`).join("")}</div>
      <div class="ma11-actions"><button data-ma11-action="add-row" ${artifact?.snapshot ? "" : "disabled"}>\uFF0B \u6DFB\u52A0</button><button data-ma11-action="retry-state" ${artifactInfo ? "" : "disabled"}>\u91CD\u65B0\u6574\u7406</button></div>
    </section>
    <section class="ma11-table-wrap">
      ${artifact?.snapshot ? `<table class="ma11-table">
        <thead><tr><th>\u5E8F\u53F7</th><th>\u5BF9\u8C61</th><th>\u5F53\u524D\u4E8B\u5B9E</th><th>\u72B6\u6001</th><th>\u5173\u952E\u8BCD</th><th>\u6765\u6E90</th><th>\u64CD\u4F5C</th></tr></thead>
        <tbody>${rows.length ? rows.map((row, index) => `<tr>
          <td>${index + 1}</td>
          <td><b>${escapeHtml(row.title)}</b></td>
          <td class="ma11-cell-content">${escapeHtml(row.content)}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${row.keywords.map((word) => `<span class="ma11-keyword">${escapeHtml(word)}</span>`).join("")}</td>
          <td><span class="ma11-source ${row.source}">${row.source === "manual" ? "\u624B\u52A8" : "\u81EA\u52A8"}</span></td>
          <td><button data-ma11-edit-row="${escapeHtml(row.id)}">\u7F16\u8F91</button><button class="danger" data-ma11-delete-row="${escapeHtml(row.id)}">\u5220\u9664</button></td>
        </tr>`).join("") : `<tr><td colspan="7" class="ma11-empty">\u8BE5\u5206\u7C7B\u6682\u65E0\u8BB0\u5F55\u3002</td></tr>`}</tbody>
      </table>` : '<div class="ma11-empty-panel">\u5C1A\u65E0\u72B6\u6001\u8868\u3002\u70B9\u51FB\u201C\u6574\u7406\u6700\u65B0\u6B63\u6587\u201D\u3002</div>'}
    </section>`;
}
async function summariesHtml() {
  const info = currentArtifact();
  const state2 = info ? await getChatState(info.artifact.chatKey) : null;
  const small = state2?.smallSummaries ?? [];
  const large = state2?.largeSummaries ?? [];
  return `
    <section class="ma11-toolbar"><div><h2>\u5206\u5C42\u603B\u7ED3</h2><p>\u5C0F\u603B\u7ED3\u4FDD\u7559\u9636\u6BB5\u72B6\u6001\uFF0C\u5927\u603B\u7ED3\u538B\u7F29\u957F\u671F\u8FDE\u7EED\u6027\u3002</p></div><div class="ma11-actions"><button data-ma11-action="force-small" ${info ? "" : "disabled"}>\u7ACB\u5373\u5C0F\u603B\u7ED3</button><button data-ma11-action="force-large" ${info ? "" : "disabled"}>\u7ACB\u5373\u5927\u603B\u7ED3</button></div></section>
    <div class="ma11-summary-columns">
      <section class="ma11-card"><header><b>\u5C0F\u603B\u7ED3</b><span>${small.length}</span></header>${small.length ? small.slice().reverse().map((item) => `<article class="ma11-summary"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p><small>${escapeHtml(new Date(item.createdAt).toLocaleString())}</small></article>`).join("") : '<p class="ma11-empty">\u5C1A\u65E0\u5C0F\u603B\u7ED3\u3002</p>'}</section>
      <section class="ma11-card"><header><b>\u5927\u603B\u7ED3</b><span>${large.length}</span></header>${large.length ? large.slice().reverse().map((item) => `<article class="ma11-summary"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p><small>${escapeHtml(new Date(item.createdAt).toLocaleString())}</small></article>`).join("") : '<p class="ma11-empty">\u5C1A\u65E0\u5927\u603B\u7ED3\u3002</p>'}</section>
    </div>`;
}
function auditHtml() {
  const settings = getSettings();
  return `
    <section class="ma11-card ma11-form-card">
      <header><b>\u89C4\u5219\u5BA1\u6838</b><span>\u5728\u72B6\u6001\u63D0\u53D6\u524D\u8FD0\u884C</span></header>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="auditEnabled" ${settings.auditEnabled ? "checked" : ""}/><span>\u542F\u7528\u89C4\u5219\u5BA1\u6838</span></label>
      <label>\u5BA1\u6838\u5931\u8D25\u5904\u7406<select data-ma11-setting="auditFailAction">
        <option value="mark" ${settings.auditFailAction === "mark" ? "selected" : ""}>\u4FDD\u7559\u5E76\u6807\u7EA2</option>
        <option value="hide" ${settings.auditFailAction === "hide" ? "selected" : ""}>\u9690\u85CF\uFF0C\u7B49\u5F85\u4EBA\u5DE5\u5904\u7406</option>
        <option value="delete" ${settings.auditFailAction === "delete" ? "selected" : ""}>\u5B89\u5168\u64A4\u56DE\u6700\u65B0AI\u6D88\u606F</option>
      </select></label>
      <label>\u5BA1\u6838\u63D0\u793A\u8BCD<textarea rows="14" data-ma11-setting="auditPrompt" placeholder="\u586B\u5199\u5FC5\u987B\u68C0\u67E5\u7684\u786C\u89C4\u5219\u3002">${escapeHtml(settings.auditPrompt)}</textarea></label>
      <p class="ma11-help">\u81EA\u52A8\u64A4\u56DE\u53EA\u5728\u76EE\u6807\u4ECD\u662F\u5F53\u524D\u804A\u5929\u6700\u65B0AI\u6D88\u606F\u3001\u4E14\u6B63\u6587\u6307\u7EB9\u672A\u53D8\u5316\u65F6\u6267\u884C\uFF1B\u6761\u4EF6\u4E0D\u6210\u7ACB\u4F1A\u964D\u7EA7\u4E3A\u9690\u85CF\u3002</p>
    </section>`;
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
      <label>\u4E16\u754C\u4E66\u540D\u79F0\uFF08\u7559\u7A7A\u81EA\u52A8\u751F\u6210\uFF09<input data-ma11-setting="lorebookName" value="${escapeHtml(settings.lorebookName)}" /></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="vectorizeRows" ${settings.vectorizeRows ? "checked" : ""}/><span>\u4EBA\u7269\u3001\u7269\u54C1\u3001\u4E8B\u4EF6\u7B49\u72B6\u6001\u884C\u542F\u7528\u5411\u91CF</span></label>
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="latestContinuityConstant" ${settings.latestContinuityConstant ? "checked" : ""}/><span>\u4FDD\u7559\u201C\u5F53\u524D\u8FDE\u7EED\u6027\u6838\u5FC3\u201D\u5E38\u9A7B\u6761\u76EE</span></label>
      <div class="ma11-actions"><button data-ma11-action="retry-sync" ${info ? "" : "disabled"}>\u7ACB\u5373\u540C\u6B65</button></div>
      ${state2?.lastSyncError ? `<div class="ma11-error-box">${escapeHtml(state2.lastSyncError)}</div>` : ""}
      <dl class="ma11-meta"><dt>\u5F53\u524D\u4E16\u754C\u4E66</dt><dd>${escapeHtml(state2?.lastLorebookName || "\u672A\u5EFA\u7ACB")}</dd><dt>\u6700\u8FD1\u540C\u6B65</dt><dd>${escapeHtml(state2?.lastSyncAt ? new Date(state2.lastSyncAt).toLocaleString() : "\u5C1A\u672A\u540C\u6B65")}</dd></dl>
    </section>`;
}
function connectionBlock(task, label) {
  const value = getSettings().connections[task];
  return `<div class="ma11-connection-row" data-ma11-connection="${task}">
    <b>${label}</b>
    <select data-ma11-connection-mode="${task}"><option value="current" ${value.mode === "current" ? "selected" : ""}>\u5F53\u524D\u804A\u5929\u8FDE\u63A5</option><option value="profile" ${value.mode === "profile" ? "selected" : ""}>Connection Profile</option></select>
    <input data-ma11-connection-profile="${task}" value="${escapeHtml(value.profile)}" placeholder="\u8FDE\u63A5\u914D\u7F6E\u540D\u79F0" ${value.mode === "profile" ? "" : "disabled"} />
    <button data-ma11-test="${task}">\u6D4B\u8BD5</button>
  </div>`;
}
function settingsHtml() {
  const settings = getSettings();
  return `
    <section class="ma11-card ma11-form-card">
      <header><b>\u6A21\u578B\u8FDE\u63A5</b><span>\u5BC6\u94A5\u7531SillyTavern\u7BA1\u7406\uFF0C\u955C\u6E0A\u4E0D\u4FDD\u5B58API Key</span></header>
      ${connectionBlock("audit", "\u89C4\u5219\u5BA1\u6838")}
      ${connectionBlock("state", "\u72B6\u6001\u8868")}
      ${connectionBlock("smallSummary", "\u5C0F\u603B\u7ED3")}
      ${connectionBlock("largeSummary", "\u5927\u603B\u7ED3")}
    </section>
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
      <label class="ma11-switch"><input type="checkbox" data-ma11-setting="repairInvalidJsonOnce" ${settings.repairInvalidJsonOnce ? "checked" : ""}/><span>JSON\u65E0\u6548\u65F6\u5141\u8BB8\u4E00\u6B21\u4FEE\u590D\u8C03\u7528</span></label>
    </section>`;
}
async function diagnosticsHtml() {
  const checks = await runDiagnostics();
  const info = currentArtifact();
  const logs = info ? await getTaskLog(info.artifact.chatKey) : [];
  return `
    <section class="ma11-toolbar"><div><h2>\u8FD0\u884C\u8BCA\u65AD</h2><p>\u5165\u53E3\u3001\u6A21\u578B\u3001\u5B58\u50A8\u4E0E\u540C\u6B65\u5206\u522B\u68C0\u67E5\u3002</p></div><div class="ma11-actions"><button data-ma11-action="refresh-diagnostics">\u5237\u65B0</button><button data-ma11-action="copy-diagnostics">\u590D\u5236\u8BCA\u65AD</button></div></section>
    <section class="ma11-check-grid">${checks.map((check) => `<article class="ma11-check ${check.status}"><span></span><div><b>${escapeHtml(check.label)}</b><p>${escapeHtml(check.detail)}</p></div></article>`).join("")}</section>
    <section class="ma11-card"><header><b>\u6700\u8FD1\u4EFB\u52A1\u65E5\u5FD7</b><span>${logs.length}</span></header><div class="ma11-log-list">${logs.length ? logs.slice(0, 30).map((log) => `<div><time>${escapeHtml(new Date(log.createdAt).toLocaleString())}</time><span>${escapeHtml(log.label)}</span><em class="${log.state}">${escapeHtml(log.state)}</em>${log.error ? `<small>${escapeHtml(log.error)}</small>` : ""}</div>`).join("") : '<p class="ma11-empty">\u6682\u65E0\u65E5\u5FD7\u3002</p>'}</div></section>`;
}
async function renderWorkspace() {
  const workspace = document.querySelector("#ma11-workspace");
  if (!workspace || workspace.hidden || rendering) return;
  rendering = true;
  try {
    const settings = getSettings();
    const info = currentArtifact();
    workspace.querySelectorAll("[data-ma11-tab]").forEach((button) => button.classList.toggle("active", button.dataset.ma11Tab === settings.ui.activeTab));
    const content = workspace.querySelector("#ma11-workspace-content");
    if (settings.ui.activeTab === "overview") content.innerHTML = overviewHtml(info);
    if (settings.ui.activeTab === "tables") content.innerHTML = tableHtml(info);
    if (settings.ui.activeTab === "summaries") content.innerHTML = await summariesHtml();
    if (settings.ui.activeTab === "audit") content.innerHTML = auditHtml();
    if (settings.ui.activeTab === "sync") content.innerHTML = await syncHtml();
    if (settings.ui.activeTab === "settings") content.innerHTML = settingsHtml();
    if (settings.ui.activeTab === "diagnostics") content.innerHTML = await diagnosticsHtml();
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
  const backdrop = workspace.querySelector(".ma11-editor-backdrop");
  const form = workspace.querySelector("#ma11-row-editor");
  form.elements.namedItem("tableKey").value = tableKey;
  form.elements.namedItem("rowId").value = row?.id || "";
  form.elements.namedItem("title").value = row?.title || "";
  form.elements.namedItem("content").value = row?.content || "";
  form.elements.namedItem("status").value = row?.status || "active";
  form.elements.namedItem("keywords").value = row?.keywords.join(", ") || "";
  backdrop.hidden = false;
  form.elements.namedItem("title").focus();
}
function closeEditor() {
  const workspace = document.querySelector("#ma11-workspace");
  const backdrop = workspace?.querySelector(".ma11-editor-backdrop");
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
  const keywords = form.elements.namedItem("keywords").value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  info.artifact.snapshot = upsertManualRow(info.artifact.snapshot, tableKey, { id: rowId || void 0, title, content, status, keywords });
  const message = getMessage(info.index);
  if (message) attachArtifactToMessage(message, info.artifact);
  await putArtifact(info.artifact);
  await persistChat();
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
  await renderWorkspace();
}
function updateSetting(target) {
  const key = target.dataset.ma11Setting;
  if (!key) return;
  const settings = getSettings();
  const value = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target instanceof HTMLInputElement && target.type === "number" ? Number(target.value) : target.value;
  settings[key] = value;
  saveSettings();
}
function updateConnection(target) {
  const modeTask = target.dataset.ma11ConnectionMode;
  const profileTask = target.dataset.ma11ConnectionProfile;
  const settings = getSettings();
  let shouldRender = false;
  if (modeTask) {
    settings.connections[modeTask].mode = target.value;
    shouldRender = true;
  }
  if (profileTask) settings.connections[profileTask].profile = safeText(target.value, 160).trim();
  saveSettings();
  if (shouldRender) void renderWorkspace();
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
        await forceSummary(info.index, action === "force-small" ? "small" : "large");
        await renderWorkspace();
      }
      if (action === "retry-sync") {
        const info = currentArtifact();
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
        const row = info?.artifact.snapshot?.[key].find((item) => item.id === editId);
        if (row) openRowEditor(key, row);
      }
      const deleteId = target.closest("[data-ma11-delete-row]")?.dataset.ma11DeleteRow;
      if (deleteId) await deleteRowAction(deleteId);
      const testTask = target.closest("[data-ma11-test]")?.dataset.ma11Test;
      if (testTask) {
        await testConnection(testTask);
        toast("success", `${testTask}\u8FDE\u63A5\u6B63\u5E38`);
      }
    } catch (error) {
      toast("error", toErrorMessage(error));
    }
  });
  workspace.addEventListener("change", (event) => {
    const target = event.target;
    if (target.dataset.ma11Setting) updateSetting(target);
    if (target.dataset.ma11ConnectionMode || target.dataset.ma11ConnectionProfile) updateConnection(target);
  });
  workspace.addEventListener("input", (event) => {
    const target = event.target;
    if (target.dataset.ma11Setting === "auditPrompt" || target.dataset.ma11Setting === "lorebookName") updateSetting(target);
    if (target.dataset.ma11ConnectionProfile) updateConnection(target);
  });
  workspace.querySelector("#ma11-row-editor")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveRow(event.currentTarget).catch((error) => toast("error", toErrorMessage(error)));
  });
}
function openWorkspace(tab, messageIndex) {
  const workspace = root();
  if (Number.isInteger(messageIndex)) selectedMessageIndex = Number(messageIndex);
  if (tab) getSettings().ui.activeTab = tab;
  workspace.hidden = false;
  void renderWorkspace();
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
  const rows = artifact.snapshot ? Object.values(artifact.snapshot).reduce((sum, list) => sum + list.length, 0) : 0;
  const error = Object.values(artifact.stages).find((stage) => stage.error)?.error;
  return `
    <div class="ma11-message-panel" data-ma-index="${index}">
      <button class="ma11-message-summary" type="button" data-ma-action="open">
        <span class="ma11-message-title">\u955C\u6E0A\u72B6\u6001</span>
        <span class="ma11-badge ${tone(artifact.stages.audit)}">\u5BA1\u6838 ${stageLabel(artifact.stages.audit)}</span>
        <span class="ma11-badge ${tone(artifact.stages.state)}">\u8868\u683C ${stageLabel(artifact.stages.state)}</span>
        <span class="ma11-badge ${tone(artifact.stages.sync)}">\u540C\u6B65 ${stageLabel(artifact.stages.sync)}</span>
        <span class="ma11-message-count">${rows} \u6761</span>
      </button>
      ${error ? `<div class="ma11-message-error">${escapeHtml(error)}</div>` : ""}
      <div class="ma11-message-actions">
        ${artifact.stages.audit.status === "failed" ? '<button data-ma-retry="audit">\u91CD\u8BD5\u5BA1\u6838</button>' : ""}
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
async function mountSettingsPanel() {
  if (document.querySelector("#ma11-settings-root")) return;
  const context = getContext();
  const host = await waitForElement("#extensions_settings2");
  const html = await context.renderExtensionTemplateAsync(extensionPathFromUrl(), "settings", {
    title: DISPLAY_NAME,
    version: VERSION
  });
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
var lastError = null;
function exposeApi() {
  globalThis.MirrorAbyss = {
    version: VERSION,
    open: (tab = "overview") => openWorkspace(tab),
    processLatest: async () => {
      const context = getContext();
      const index = [...context.chat ?? []].map((_, i) => i).reverse().find((i) => !context.chat[i]?.is_user && String(context.chat[i]?.mes || "").trim());
      if (index === void 0) throw new Error("\u6CA1\u6709\u53EF\u6574\u7406\u7684AI\u6B63\u6587");
      return processMessage(index, true);
    },
    diagnostics: diagnosticReport,
    getState: () => ({ state, lastError: lastError instanceof Error ? lastError.message : String(lastError || "") })
  };
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
  if (state === "ready" || state === "initializing") return;
  state = "initializing";
  lastError = null;
  exposeApi();
  try {
    getSettings();
    await mountSettingsPanel();
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
      context.eventSource.on(context.event_types.CHARACTER_MESSAGE_RENDERED, rerender);
      context.eventSource.on(context.event_types.CHAT_CHANGED, rerender);
      context.eventSource.on(context.event_types.MESSAGE_DELETED, rerender);
      cleanupUiEvents = () => {
        context.eventSource.removeListener?.(context.event_types.CHARACTER_MESSAGE_RENDERED, rerender);
        context.eventSource.removeListener?.(context.event_types.CHAT_CHANGED, rerender);
        context.eventSource.removeListener?.(context.event_types.MESSAGE_DELETED, rerender);
      };
    }
    if (typeof context.registerDebugFunction === "function") {
      context.registerDebugFunction(
        "mirror_abyss_diagnostics",
        "Mirror Abyss Diagnostics",
        "Open the Mirror Abyss diagnostics panel",
        () => openWorkspace("diagnostics")
      );
    }
    document.querySelector("#ma11-fatal")?.remove();
    state = "ready";
    toast("success", `\u5DF2\u542F\u52A8 ${VERSION}`);
  } catch (error) {
    state = "error";
    lastError = error;
    console.error("[MirrorAbyss] initialization failed", error);
    showFatal(error);
  }
}
function installAppReadyHandler() {
  if (appReadyHandlerInstalled) return;
  appReadyHandlerInstalled = true;
  const context = tryGetContext();
  if (!context) {
    window.setTimeout(installAppReadyHandler, 250);
    appReadyHandlerInstalled = false;
    return;
  }
  context.eventSource.on(context.event_types.APP_READY, () => {
    window.setTimeout(() => void initialize(), 0);
  });
  window.setTimeout(() => void initialize(), 1200);
}
async function cleanData() {
  await clearAllStorage();
  const context = tryGetContext();
  if (context?.extensionSettings?.[MODULE_NAME]) delete context.extensionSettings[MODULE_NAME];
  context?.saveSettingsDebounced?.();
}
function onEnable() {
  if (tryGetContext()) void initialize();
}
function onDisable() {
  getSettings().enabled = false;
  saveSettings();
}
function onActivate() {
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
  cleanupPipeline?.();
  cleanupPanels?.();
  cleanupUiEvents?.();
  cleanupPipeline = null;
  cleanupPanels = null;
  cleanupUiEvents = null;
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
//# sourceMappingURL=index.js.map
