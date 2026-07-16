export function deepClone(value) {
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        }
        catch {
            // Fall through.
        }
    }
    return JSON.parse(JSON.stringify(value));
}
export function mergeDefaults(defaults, current) {
    const output = deepClone(defaults);
    const merge = (target, source) => {
        if (!source)
            return;
        for (const [key, value] of Object.entries(source)) {
            if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
                merge(target[key], value);
            }
            else if (value !== undefined) {
                target[key] = value;
            }
        }
    };
    merge(output, current);
    return output;
}
export function hashText(value) {
    const text = String(value ?? '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}
export function makeId(prefix = 'ma') {
    if (globalThis.crypto?.randomUUID)
        return `${prefix}_${globalThis.crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
export function nowIso() {
    return new Date().toISOString();
}
export function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = String(value ?? '');
    return element.innerHTML;
}
export function withTimeout(promise, ms, label, controller) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer;
        const cleanup = () => {
            if (timer !== undefined)
                window.clearTimeout(timer);
            controller?.signal.removeEventListener('abort', onAbort);
        };
        const onAbort = () => {
            if (settled)
                return;
            settled = true;
            cleanup();
            const error = new Error(`${label}已取消`);
            error.name = 'AbortError';
            reject(error);
        };
        if (controller?.signal.aborted) {
            onAbort();
            return;
        }
        controller?.signal.addEventListener('abort', onAbort, { once: true });
        timer = window.setTimeout(() => {
            if (settled)
                return;
            settled = true;
            cleanup();
            controller?.abort();
            reject(new Error(`${label}超时（${Math.round(ms / 1000)}秒）`));
        }, ms);
        promise.then((value) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            resolve(value);
        }, (error) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            reject(error);
        });
    });
}
export function safeText(value, max = 100000) {
    return String(value ?? '').replace(/\u0000/g, '').slice(0, max);
}
export class JsonObjectParseError extends Error {
    preview;
    attempts;
    constructor(message, raw, attempts = []) {
        super(message);
        this.name = 'JsonObjectParseError';
        this.preview = jsonPreview(raw);
        this.attempts = attempts;
    }
}
export function jsonPreview(raw, max = 360) {
    return safeText(raw, 100000)
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}
function stripReasoningAndBom(text) {
    return text
        .replace(/^\uFEFF/, '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .trim();
}
function fencedCandidates(text) {
    const output = [];
    const regex = /```(?:json|javascript|js|text)?\s*([\s\S]*?)```/gi;
    let match;
    while ((match = regex.exec(text))) {
        if (match[1]?.trim())
            output.push(match[1].trim());
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
            }
            else if (char === '\\') {
                escaped = true;
            }
            else if (char === '"') {
                inString = false;
            }
            continue;
        }
        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === '{') {
            if (depth === 0)
                start = i;
            depth += 1;
            continue;
        }
        if (char === '}' && depth > 0) {
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
    let output = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (inString) {
            output += char;
            if (escaped)
                escaped = false;
            else if (char === '\\')
                escaped = true;
            else if (char === '"')
                inString = false;
            continue;
        }
        if (char === '"') {
            inString = true;
            output += char;
            continue;
        }
        const replacement = {
            '｛': '{', '｝': '}', '［': '[', '］': ']', '：': ':', '，': ',',
        };
        output += replacement[char] ?? char;
    }
    return output;
}
function commonJsonRepairs(text) {
    const base = normalizeJsonPunctuationOutsideStrings(text)
        .replace(/^\s*(?:json|JSON)\s*[:：]?\s*/, '')
        .trim();
    const withoutTrailingCommas = base.replace(/,\s*([}\]])/g, '$1');
    const withoutSemicolon = withoutTrailingCommas.replace(/;\s*$/, '').trim();
    return [...new Set([base, withoutTrailingCommas, withoutSemicolon])].filter(Boolean);
}
function parseObjectCandidate(candidate) {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('JSON根节点必须是对象');
    }
    return parsed;
}
export function parseJsonObject(raw) {
    const original = safeText(raw).trim();
    if (!original || original === '{}')
        throw new JsonObjectParseError('模型返回为空', raw);
    const clean = stripReasoningAndBom(original);
    const fenced = fencedCandidates(clean);
    const balanced = balancedObjectCandidates(clean).reverse();
    // Prefer explicit code fences, then a fully valid response, then the last complete object.
    // Models often put a schema/example object before the actual answer.
    const candidates = [...fenced, clean, ...balanced];
    const uniqueCandidates = [...new Set(candidates.map((item) => item.trim()).filter(Boolean))];
    const attempts = [];
    for (const candidate of uniqueCandidates) {
        for (const repaired of commonJsonRepairs(candidate)) {
            try {
                return parseObjectCandidate(repaired);
            }
            catch (error) {
                attempts.push(error instanceof Error ? error.message : String(error));
            }
        }
    }
    throw new JsonObjectParseError('模型未返回可解析的JSON对象', raw, attempts.slice(-6));
}
export function sanitizeBookName(value) {
    return String(value ?? '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
}
export function toErrorMessage(error) {
    if (error instanceof Error) {
        const parts = [];
        const seen = new Set();
        let current = error;
        while (current instanceof Error && !seen.has(current)) {
            seen.add(current);
            if (current.message && !parts.includes(current.message))
                parts.push(current.message);
            current = current.cause;
        }
        return parts.join('：') || error.name || '未知错误';
    }
    if (error && typeof error === 'object') {
        try {
            const message = error.message ?? error.error?.message;
            if (message)
                return String(message);
            return JSON.stringify(error);
        }
        catch {
            return String(error);
        }
    }
    return String(error ?? '未知错误');
}
