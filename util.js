export function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export class MirrorAbyssError extends Error {
  constructor(source, code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'MirrorAbyssError';
    this.source = source;
    this.code = code;
  }
}

export function fault(source, code, message, cause) {
  return new MirrorAbyssError(source, code, message, cause);
}

export function invariant(condition, message, source = 'core', code = 'INVARIANT') {
  if (!condition) throw fault(source, code, message);
}

export function unique(values) {
  return [...new Set((values ?? []).map(value => String(value ?? '').trim()).filter(Boolean))];
}

export function normalizeIdentity(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function digest(value) {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function errorText(error) {
  return error instanceof Error ? error.message : String(error ?? '未知错误');
}

export function describeError(error) {
  const text = errorText(error);
  return error?.source && error?.code ? `【${error.source}/${error.code}】${text}` : text;
}

export class CancellationToken {
  constructor(label = '') {
    this.label = label;
    this.cancelled = false;
    this.reason = '';
  }

  cancel(reason = '用户取消任务') {
    this.cancelled = true;
    this.reason = reason;
  }

  assertActive() {
    if (this.cancelled) throw fault('workflow', 'CANCELLED', this.reason || '任务已取消');
  }
}

export function debounce(fn, delay = 120) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
