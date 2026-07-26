/** FACT-BUILD-006 / EVT-20260726-014: per-dependency pinned CDN fallback. */
export async function loadPinnedDependency(name, candidates) {
  const failures = [];
  for (const candidate of candidates) {
    try {
      const module = await import(candidate.url);
      const providers = globalThis.__MIRROR_ABYSS_DEPENDENCY_PROVIDERS__ ??= {};
      providers[name] = candidate.id;
      console.info('[MirrorAbyss] dependency loaded:', name, candidate.label);
      return module;
    } catch (error) {
      failures.push({ candidate, error });
      console.warn('[MirrorAbyss] dependency failed:', name, candidate.label, error);
    }
  }
  const detail = failures.map(({ candidate, error }) => candidate.label + ': ' + describeError(error)).join('\n');
  const aggregate = new AggregateError(failures.map((item) => item.error), '依赖 ' + name + ' 的所有锁定来源均加载失败\n' + detail);
  aggregate.mirrorAbyssDependency = { name, failures: failures.map(({ candidate, error }) => ({ provider: candidate.id, detail: describeError(error) })) };
  throw aggregate;
}

function describeError(error) {
  if (error instanceof Error) return error.name + ': ' + error.message;
  if (typeof Event !== 'undefined' && error instanceof Event) {
    const target = error.target ?? error.currentTarget;
    const url = target?.src ?? target?.href ?? '';
    return 'DOM Event(type=' + error.type + (url ? ', url=' + url : '') + ')';
  }
  try { return JSON.stringify(error); } catch { return String(error); }
}
