/**
 * 模块职责：通用克隆、哈希、超时与错误文本工具。
 * 维护边界：模型协议解析由固定文本领域模块负责；这里不承担模型输出修复。
 */
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
//# sourceMappingURL=utils.js.map