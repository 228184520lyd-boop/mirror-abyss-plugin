const HOTFIX_ID = 'summary-fact-index-by-id';
const HOTFIX_VERSION = '1.1.0-rc.4.1';
const CORE_FILENAME = 'index.js';

const BUGGY_RETURN = 'return { packages, byMessageKey, stageSnapshots };';
const FIXED_RETURN = 'return { packages, byId, byMessageKey, stageSnapshots };';

function occurrenceCount(source, needle) {
  if (!needle) return 0;
  return source.split(needle).length - 1;
}

export function patchSummaryFactIndex(source) {
  if (typeof source !== 'string' || !source.trim()) {
    throw new TypeError('镜渊核心文件为空，无法应用总结索引热修复');
  }

  const buggyCount = occurrenceCount(source, BUGGY_RETURN);
  const fixedCount = occurrenceCount(source, FIXED_RETURN);

  if (buggyCount === 1) {
    return {
      source: source.replace(BUGGY_RETURN, FIXED_RETURN),
      applied: true,
      alreadyFixed: false,
      buggyCount,
      fixedCount: fixedCount + 1,
    };
  }

  if (buggyCount === 0 && fixedCount >= 1) {
    return {
      source,
      applied: false,
      alreadyFixed: true,
      buggyCount,
      fixedCount,
    };
  }

  throw new Error(
    `总结索引热修复无法安全应用：预期找到 1 个缺陷标记，实际找到 ${buggyCount} 个；已修复标记 ${fixedCount} 个。为避免修改错误位置，核心未启动。`,
  );
}

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
      `已修复总结索引，但浏览器拒绝载入修复后的核心模块（blob 与 data 两种方式均失败）：${details}`,
      dataError,
    );
  }
}

export async function loadPatchedCore() {
  const coreUrl = new URL(`./${CORE_FILENAME}`, import.meta.url);
  const original = await readCoreSource(coreUrl);
  const result = patchSummaryFactIndex(original);
  const core = await importPatchedSource(result.source, coreUrl);

  const status = Object.freeze({
    id: HOTFIX_ID,
    version: HOTFIX_VERSION,
    applied: result.applied,
    alreadyFixed: result.alreadyFixed,
    coreUrl: coreUrl.href,
    loadedAt: new Date().toISOString(),
  });

  globalThis.MirrorAbyssHotfix = status;
  console.info('[MirrorAbyss] summary fact-index hotfix loaded', status);
  return core;
}

export const hotfixMetadata = Object.freeze({
  id: HOTFIX_ID,
  version: HOTFIX_VERSION,
  buggyReturn: BUGGY_RETURN,
  fixedReturn: FIXED_RETURN,
});
