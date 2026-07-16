const HOTFIX_ID = 'summary-safe-batching-rc42';
const HOTFIX_VERSION = '1.1.0-rc.4.2';
const CORE_FILENAME = 'index.js';

const PATCHES = Object.freeze([
  {
    id: 'summary-fact-index-by-id',
    buggy: 'return { packages, byMessageKey, stageSnapshots };',
    fixed: 'return { packages, byId, byMessageKey, stageSnapshots };',
  },
  {
    id: 'small-summary-default-turns',
    buggy: 'smallSummaryTurns: 15,',
    fixed: 'smallSummaryTurns: 7,',
  },
  {
    id: 'large-summary-default-count',
    buggy: 'largeSummaryCount: 6,',
    fixed: 'largeSummaryCount: 4,',
  },
  {
    id: 'legacy-small-summary-default-turns',
    buggy: 'smallSummaryTurns: Number(legacy.smallSummaryTurns) || 15,',
    fixed: 'smallSummaryTurns: Number(legacy.smallSummaryTurns) || 7,',
  },
  {
    id: 'legacy-large-summary-default-count',
    buggy: 'largeSummaryCount: Number(legacy.largeSummaryCount) || 6,',
    fixed: 'largeSummaryCount: Number(legacy.largeSummaryCount) || 4,',
  },
  {
    id: 'small-summary-input-budget',
    buggy: 'maxInputChars: 12e3,',
    fixed: 'maxInputChars: 5e3,',
  },
  {
    id: 'summary-threshold-settings-migration',
    buggy: `  settings.autoHistoryRebuild = false;\n  delete settings.repairInvalidJsonOnce;`,
    fixed: `  settings.autoHistoryRebuild = false;\n  settings.migration ||= {};\n  if (!settings.migration.summarySafeBatchingRc42) {\n    const previousSmallSummaryTurns = Number(settings.smallSummaryTurns);\n    const previousLargeSummaryCount = Number(settings.largeSummaryCount);\n    if (!Number.isFinite(previousSmallSummaryTurns) || previousSmallSummaryTurns === 15) settings.smallSummaryTurns = 7;\n    if (!Number.isFinite(previousLargeSummaryCount) || previousLargeSummaryCount === 6) settings.largeSummaryCount = 4;\n    settings.migration.summarySafeBatchingRc42 = true;\n    context.saveSettingsDebounced?.();\n  }\n  delete settings.repairInvalidJsonOnce;`,
  },
  {
    id: 'small-summary-evidence-allowlist',
    buggy: `function smallSummaryPrompt(packages, context, existingEvents) {\n  return \`请仅把以下本批变化整理为阶段概览和独立事件条目，并给出安全沉降计划。未列出的当前状态不属于本批变化。\n\n【本批相关轮次材料与新增/改变事实】`,
    fixed: `function smallSummaryPrompt(packages, context, existingEvents) {\n  const allowedFactIds = [...context.relevantFactIds];\n  const allowedRowIds = [...new Set(context.changedRows.map((change) => change.rowId))];\n  return \`请仅把以下本批变化整理为阶段概览和独立事件条目，并给出安全沉降计划。未列出的当前状态不属于本批变化。\n\n【本批唯一允许写入 source_fact_ids / source_row_ids 的 ID】\nsource_fact_ids=\${join(allowedFactIds)}\nsource_row_ids=\${join(allowedRowIds)}\n只能逐字复制上面列出的 ID。既有事件条目中的旧来源 ID、上下文锚点 ID、对象名称和自行改写的 ID 均禁止填写。每个 event_entry 和 long_term_candidate 至少填写一个允许 ID；没有可用允许 ID 时不要输出该条目。\n\n【本批相关轮次材料与新增/改变事实】`,
  },
]);

function occurrenceCount(source, needle) {
  if (!needle) return 0;
  return source.split(needle).length - 1;
}

function applyExactPatch(source, patch) {
  const buggyCount = occurrenceCount(source, patch.buggy);
  const fixedCount = occurrenceCount(source, patch.fixed);

  if (buggyCount === 1 && fixedCount === 0) {
    return {
      source: source.replace(patch.buggy, patch.fixed),
      status: 'applied',
      buggyCount,
      fixedCount: 1,
    };
  }

  if (buggyCount === 0 && fixedCount === 1) {
    return {
      source,
      status: 'already-fixed',
      buggyCount,
      fixedCount,
    };
  }

  throw new Error(
    `热修复 ${patch.id} 无法安全应用：缺陷标记 ${buggyCount} 个，修复标记 ${fixedCount} 个。为避免修改错误位置，核心未启动。`,
  );
}

export function patchMirrorAbyssCore(source) {
  if (typeof source !== 'string' || !source.trim()) {
    throw new TypeError('镜渊核心文件为空，无法应用总结安全批次热修复');
  }

  let output = source;
  const results = [];
  for (const patch of PATCHES) {
    const result = applyExactPatch(output, patch);
    output = result.source;
    results.push(Object.freeze({ id: patch.id, status: result.status }));
  }

  return {
    source: output,
    applied: results.some((item) => item.status === 'applied'),
    alreadyFixed: results.every((item) => item.status === 'already-fixed'),
    results,
  };
}

// Backward-compatible export used by the rc.4.1 validation fixture.
export const patchSummaryFactIndex = patchMirrorAbyssCore;

function hotfixError(message, cause) {
  const error = new Error(message, cause instanceof Error ? { cause } : undefined);
  error.name = 'MirrorAbyssHotfixError';
  return error;
}

async function readCoreSource(coreUrl) {
  let response;
  try {
    response = await fetch(coreUrl, { cache: 'no-store', credentials: 'same-origin' });
  } catch (error) {
    throw hotfixError(`无法读取镜渊核心 ${CORE_FILENAME}：${error instanceof Error ? error.message : String(error)}`, error);
  }

  if (!response.ok) {
    throw hotfixError(`无法读取镜渊核心 ${CORE_FILENAME}：HTTP ${response.status}`);
  }

  const source = await response.text();
  if (!source.trim()) throw hotfixError(`镜渊核心 ${CORE_FILENAME} 内容为空`);
  return source;
}

function base64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function importPatchedSource(source, coreUrl) {
  const sourceLabel = `${coreUrl.href}?mirror-abyss-hotfix=${encodeURIComponent(HOTFIX_ID)}`;
  const executable = `${source}\n//# sourceURL=${sourceLabel}\n`;
  let blobError = null;

  if (typeof URL?.createObjectURL === 'function' && typeof Blob === 'function') {
    const blobUrl = URL.createObjectURL(new Blob([executable], { type: 'text/javascript' }));
    try {
      return await import(blobUrl);
    } catch (error) {
      blobError = error;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  try {
    const dataUrl = `data:text/javascript;base64,${base64Utf8(executable)}`;
    return await import(dataUrl);
  } catch (dataError) {
    const details = [blobError, dataError]
      .filter(Boolean)
      .map((error) => error instanceof Error ? error.message : String(error))
      .join('；');
    throw hotfixError(
      `已修复总结批次，但浏览器拒绝载入修复后的核心模块（blob 与 data 两种方式均失败）：${details}`,
      dataError,
    );
  }
}

export async function loadPatchedCore() {
  const coreUrl = new URL(`./${CORE_FILENAME}`, import.meta.url);
  const original = await readCoreSource(coreUrl);
  const result = patchMirrorAbyssCore(original);
  const core = await importPatchedSource(result.source, coreUrl);

  const status = Object.freeze({
    id: HOTFIX_ID,
    version: HOTFIX_VERSION,
    applied: result.applied,
    alreadyFixed: result.alreadyFixed,
    patches: result.results,
    settings: Object.freeze({ smallSummaryTurns: 7, largeSummaryCount: 4, maxInputChars: 5000 }),
    coreUrl: coreUrl.href,
    loadedAt: new Date().toISOString(),
  });

  globalThis.MirrorAbyssHotfix = status;
  console.info('[MirrorAbyss] summary safe-batching hotfix loaded', status);
  return core;
}

export const hotfixMetadata = Object.freeze({
  id: HOTFIX_ID,
  version: HOTFIX_VERSION,
  patches: PATCHES.map((patch) => patch.id),
  smallSummaryTurns: 7,
  largeSummaryCount: 4,
  maxInputChars: 5000,
});
