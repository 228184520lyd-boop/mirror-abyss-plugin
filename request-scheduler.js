import { makeId, nowIso, toErrorMessage } from '../core/utils.js';
const REQUEST_PRIORITIES = {
    audit: 100,
    revision: 100,
    state: 90,
    smallSummary: 30,
    largeSummary: 10,
};
function abortError(message = '模型请求已取消') {
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
}
function requestErrorMetadata(error) {
    const message = toErrorMessage(error);
    const statusMatch = message.match(/(?:http|status|code)?\s*[:=]?\s*([45]\d{2})\b/i);
    const httpStatus = statusMatch ? Number(statusMatch[1]) : undefined;
    if ((error instanceof Error && error.name === 'AbortError')
        || /\b(?:cancelled|canceled|aborted)\b|stop event|已取消|被取消|已中止/i.test(message))
        return { errorKind: 'cancelled', httpStatus };
    if (/no message generated|返回为空|空内容/i.test(message))
        return { errorKind: 'empty', httpStatus };
    if (httpStatus === 401 || httpStatus === 403 || /unauthori[sz]ed|forbidden|api key/i.test(message))
        return { errorKind: 'auth', httpStatus };
    if (httpStatus === 429 || /rate.?limit|too many requests/i.test(message))
        return { errorKind: 'rate_limit', httpStatus };
    if ((httpStatus !== undefined && httpStatus >= 500) || /gateway|upstream|bad gateway|service unavailable/i.test(message))
        return { errorKind: 'upstream', httpStatus };
    if (/timeout|timed out|超时/i.test(message))
        return { errorKind: 'timeout', httpStatus };
    if (httpStatus === 400 || /bad request|invalid schema|invalid request/i.test(message))
        return { errorKind: 'request', httpStatus };
    return { errorKind: 'unknown', httpStatus };
}
/**
 * 每个显式 lane 保持单请求；不同 lane 可独立运行。
 * 调用方必须把 lane 组成定义为“物理连接 + 调度类别”，从而把业务链与只读诊断隔离。
 * pending 按优先级选取，已经 running 的请求不会被新任务强行中断。
 */
export class RequestLaneScheduler {
    static MAX_TRACES = 200;
    lanes = new Map();
    traces = new Map();
    sequence = 0;
    list() {
        return [...this.traces.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }
    clearHistory() {
        for (const [id, trace] of this.traces) {
            if (!['queued', 'running'].includes(String(trace.state)))
                this.traces.delete(id);
        }
    }
    prune() {
        while (this.traces.size > RequestLaneScheduler.MAX_TRACES) {
            const removable = [...this.traces.entries()].find(([, trace]) => !['queued', 'running'].includes(String(trace.state)));
            if (!removable)
                break;
            this.traces.delete(removable[0]);
        }
    }
    lane(name) {
        let state = this.lanes.get(name);
        if (!state) {
            state = { active: null, pending: [] };
            this.lanes.set(name, state);
        }
        return state;
    }
    selectNext(state) {
        if (!state.pending.length)
            return null;
        let selectedIndex = 0;
        for (let index = 1; index < state.pending.length; index += 1) {
            const candidate = state.pending[index];
            const selected = state.pending[selectedIndex];
            if (candidate.priority > selected.priority || (candidate.priority === selected.priority && candidate.sequence < selected.sequence))
                selectedIndex = index;
        }
        return state.pending.splice(selectedIndex, 1)[0] ?? null;
    }
    pump(laneName) {
        const state = this.lane(laneName);
        if (state.active)
            return;
        const job = this.selectNext(state);
        if (!job) {
            if (!state.pending.length)
                this.lanes.delete(laneName);
            return;
        }
        if (job.signal.aborted) {
            job.signal.removeEventListener('abort', job.abortListener);
            job.trace.state = 'cancelled';
            job.trace.error = '模型请求已取消';
            job.trace.errorKind = 'cancelled';
            job.trace.finishedAt = nowIso();
            job.trace.transportWaitMs = Math.max(0, Date.now() - job.createdMs);
            job.trace.totalMs = job.trace.transportWaitMs;
            job.reject(abortError());
            this.prune();
            this.pump(laneName);
            return;
        }
        state.active = job;
        const startedMs = Date.now();
        job.trace.state = 'running';
        job.trace.startedAt = nowIso();
        job.trace.transportWaitMs = Math.max(0, startedMs - job.createdMs);
        // 与成熟 Promise 队列一致：执行函数即使同步 throw，也必须进入任务 Promise 的失败路径，
        // 不能让 run() 直接抛出并把 lane 永久留在 active。
        void Promise.resolve()
            .then(() => job.work())
            .then((result) => {
            job.trace.state = 'success';
            job.resolve(result);
        })
            .catch((error) => {
            const metadata = requestErrorMetadata(error);
            job.trace.state = metadata.errorKind === 'cancelled' ? 'cancelled' : 'failed';
            job.trace.error = toErrorMessage(error);
            job.trace.errorKind = metadata.errorKind;
            job.trace.httpStatus = metadata.httpStatus;
            job.reject(error);
        })
            .finally(() => {
            const finishedMs = Date.now();
            job.signal.removeEventListener('abort', job.abortListener);
            job.trace.finishedAt = nowIso();
            job.trace.requestMs = Math.max(0, finishedMs - startedMs);
            job.trace.totalMs = Math.max(0, finishedMs - job.createdMs);
            state.active = null;
            this.prune();
            this.pump(laneName);
        });
    }
    run(connectionLane, requestClass, task, signal, work, metadata = {}) {
        if (signal.aborted)
            return Promise.reject(abortError());
        const laneName = `${connectionLane}:${requestClass}`;
        const createdMs = Date.now();
        const id = makeId('request');
        const trace = {
            ...metadata,
            id,
            lane: laneName,
            connectionLane,
            requestClass,
            task,
            state: 'queued',
            createdAt: nowIso(),
            transportWaitMs: 0,
            requestMs: 0,
            totalMs: 0,
            firstByteMs: undefined,
            streamMode: 'off',
        };
        this.traces.set(id, trace);
        let resolve;
        let reject;
        const promise = new Promise((resolveValue, rejectValue) => {
            resolve = resolveValue;
            reject = rejectValue;
        });
        const state = this.lane(laneName);
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
                if (state.active === job)
                    return;
                const index = state.pending.indexOf(job);
                if (index < 0)
                    return;
                state.pending.splice(index, 1);
                trace.state = 'cancelled';
                trace.error = '模型请求已取消';
                trace.errorKind = 'cancelled';
                trace.finishedAt = nowIso();
                trace.transportWaitMs = Math.max(0, Date.now() - createdMs);
                trace.totalMs = trace.transportWaitMs;
                signal.removeEventListener('abort', job.abortListener);
                reject(abortError());
                this.prune();
                this.pump(laneName);
            },
        };
        signal.addEventListener('abort', job.abortListener, { once: true });
        state.pending.push(job);
        this.prune();
        this.pump(laneName);
        return promise;
    }
}
export const requestScheduler = new RequestLaneScheduler();
//# sourceMappingURL=request-scheduler.js.map