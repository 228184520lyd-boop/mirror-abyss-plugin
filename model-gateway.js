/* Generated from src/host/model-gateway.ts — do not edit dist directly. */
import PQueue from '../vendor/p-queue.js';
import { MirrorAbyssError } from '../shared/errors.js';
/**
 * 当前连接模型调用边界。调用形式直接采用 SillyTavern 官方 memory 扩展使用的 generateRaw(params)。
 * FACT-HOST-003：不做多级 API fallback，也不猜测十几种响应包络。
 * FACT-HOST-004 / EVT-20260726-006：当前未确认 generateRaw 支持单请求 AbortSignal，
 * 因此插件模型调用在这里单通道串行；聊天切换后等待宿主请求自然结束，再丢弃旧结果。
 */
export class ModelGateway {
    host;
    requestQueue = new PQueue({ concurrency: 1 });
    constructor(host) {
        this.host = host;
    }
    async generate(request) {
        const result = await this.requestQueue.add(async () => {
            if (request.signal.aborted)
                throw abortError();
            const generateRaw = this.host.getContext().generateRaw;
            if (typeof generateRaw !== 'function') {
                throw new MirrorAbyssError('HOST_API_UNAVAILABLE', '当前 SillyTavern 未提供 generateRaw');
            }
            const startedAt = Date.now();
            const raw = await generateRaw({
                prompt: request.prompt,
                systemPrompt: request.systemPrompt,
                responseLength: request.responseLength,
            });
            const elapsedMs = Date.now() - startedAt;
            // 不让已经切换聊天的结果进入下一阶段，但也不使用无法真正中止上游的伪超时竞速。
            if (request.signal.aborted)
                throw abortError();
            if (elapsedMs > request.timeoutMs) {
                console.warn(`[MirrorAbyss] 模型请求耗时 ${elapsedMs}ms，超过软时限 ${request.timeoutMs}ms；结果仍按真实返回处理。`);
            }
            const text = typeof raw === 'string' ? raw.trim() : '';
            if (!text)
                throw new MirrorAbyssError('EMPTY_RESPONSE', '模型返回为空');
            return text;
        });
        if (typeof result !== 'string') {
            throw new MirrorAbyssError('EMPTY_RESPONSE', '模型请求未返回文本');
        }
        return result;
    }
}
function abortError() {
    return new DOMException('请求已因聊天切换或插件停用而作废', 'AbortError');
}
