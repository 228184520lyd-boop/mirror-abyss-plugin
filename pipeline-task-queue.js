import { makeId, nowIso, toErrorMessage } from './core-utils.js';
/** 业务前置条件未满足。任务已被正确阻断，不属于执行失败。 */
export class TaskBlockedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TaskBlockedError';
    }
}
/** 输入已经由同版本流水线完成，不需要再次执行。 */
export class TaskSkippedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TaskSkippedError';
    }
}
function cancelledError(message) {
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
}
function elapsed(startedAt, finishedAt = Date.now()) {
    return startedAt === undefined ? undefined : Math.max(0, finishedAt - startedAt);
}
const DEFAULT_PRIORITIES = {
    audit: 100,
    revision: 100,
    state: 90,
    manual: 70,
    sync: 40,
    smallSummary: 30,
    largeSummary: 10,
};
/**
 * 全插件只有一个 active 业务任务。优先级决定下一个 pending；显式取消只用于安全让位，不引入并发写入。
 */
export class TaskQueue {
    static MAX_TASKS = 200;
    inFlight = new Map();
    tasks = new Map();
    listeners = new Set();
    accepting = true;
    generation = 0;
    sequence = 0;
    pending = [];
    active = null;
    idleWaiters = new Set();
    setAccepting(accepting) {
        if (this.accepting && !accepting) {
            this.generation += 1;
            this.cancelActiveMatching(() => true, '镜渊已禁用，运行任务已请求取消');
            this.cancelPending(() => true, '镜渊已禁用，排队任务已取消');
        }
        this.accepting = accepting;
        if (accepting)
            this.pump();
    }
    isTerminal(task) {
        return !['running', 'queued'].includes(String(task.state));
    }
    pruneTasks() {
        while (this.tasks.size > TaskQueue.MAX_TASKS) {
            const removable = [...this.tasks.entries()].find(([, task]) => this.isTerminal(task));
            if (!removable)
                break;
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
            }
            catch (error) {
                console.warn('[MirrorAbyss] task listener failed', error);
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
            if (this.isTerminal(task))
                this.tasks.delete(id);
        }
        this.notify();
    }
    resetRuntime() {
        this.generation += 1;
        this.cancelActiveMatching(() => true, '镜渊运行环境已重置，运行任务已请求取消');
        this.cancelPending(() => true, '镜渊运行环境已重置，排队任务已取消');
        this.clearHistory();
        this.notify();
    }
    resolveIdle() {
        if (this.active || this.pending.length)
            return;
        for (const resolve of this.idleWaiters)
            resolve();
        this.idleWaiters.clear();
    }
    async whenIdle() {
        if (!this.active && !this.pending.length)
            return;
        await new Promise((resolve) => this.idleWaiters.add(resolve));
    }
    cancelPendingByChatKey(chatKey, reason = '聊天已切换，旧聊天排队任务已取消') {
        return this.cancelPending((job) => job.chatKey === chatKey, reason);
    }
    cancelPendingOutsideChat(chatKey, reason = '聊天已切换，旧聊天排队任务已取消') {
        return this.cancelPending((job) => Boolean(job.chatKey && job.chatKey !== chatKey), reason);
    }
    cancelPendingDerivedByChatKey(chatKey, reason = '已有更新的正文状态，旧派生任务已取消') {
        return this.cancelPending((job) => Boolean(job.chatKey === chatKey
            && job.task.automatic === true
            && ['smallSummary', 'largeSummary', 'sync'].includes(String(job.task.kind))), reason);
    }
    /**
     * 只标记当前 active 任务取消；调用方负责取消其外部请求。任务守卫会阻止迟到结果提交。
     */
    cancelActiveMatching(predicate, reason = '运行中的任务已被更高优先级工作取代') {
        const job = this.active;
        if (!job || !predicate(job.task) || job.cancelReason)
            return false;
        job.cancelReason = reason;
        job.task.cancelRequestedAt = nowIso();
        job.task.cancelReason = reason;
        this.notify();
        return true;
    }
    cancelPendingMatching(predicate, reason = '排队任务已失效') {
        return this.cancelPending((job) => predicate(job.task), reason);
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
            job.task.state = 'cancelled';
            job.task.error = reason;
            job.task.cancelReason = reason;
            job.task.cancelRequestedAt = nowIso();
            job.task.finishedAt = nowIso();
            job.task.queueWaitMs = elapsed(job.task.createdAtMs, now);
            job.task.totalMs = elapsed(job.task.createdAtMs, now);
            if (this.inFlight.get(job.task.key) === job.promise)
                this.inFlight.delete(job.task.key);
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
        if (!this.pending.length)
            return null;
        let selectedIndex = 0;
        for (let index = 1; index < this.pending.length; index += 1) {
            const candidate = this.pending[index];
            const selected = this.pending[selectedIndex];
            if (candidate.priority > selected.priority || (candidate.priority === selected.priority && candidate.sequence < selected.sequence)) {
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
        task.state = 'running';
        task.startedAt = nowIso();
        task.startedAtMs = startedMs;
        task.queueWaitMs = elapsed(task.createdAtMs, startedMs);
        this.notify();
        const guard = {
            generation: job.generation,
            assertCurrent: () => {
                if (job.cancelReason)
                    throw cancelledError(job.cancelReason);
                if (!this.accepting || job.generation !== this.generation) {
                    throw cancelledError('镜渊生命周期已变化，旧任务结果不再提交');
                }
            },
        };
        void Promise.resolve()
            .then(async () => {
            guard.assertCurrent();
            const result = await job.work(guard);
            guard.assertCurrent();
            return result;
        })
            .then((result) => {
            task.state = 'success';
            job.resolve(result);
        })
            .catch((error) => {
            // 一旦任务已被生命周期/聊天切换明确取消，迟到的上游错误不能把终态改写成 failed。
            // 取消意图优先；原始请求错误仍可在请求诊断中查看。
            const cancelled = Boolean(job.cancelReason)
                || (error instanceof Error && ['AbortError', 'CommitRejectedError'].includes(error.name));
            const blocked = error instanceof TaskBlockedError
                || (error instanceof Error && error.name === 'TaskBlockedError');
            const skipped = error instanceof TaskSkippedError
                || (error instanceof Error && error.name === 'TaskSkippedError');
            task.state = cancelled ? 'cancelled' : blocked ? 'blocked' : skipped ? 'skipped' : 'failed';
            if (skipped) {
                task.skipReason = toErrorMessage(error);
                delete task.error;
            }
            else {
                task.error = cancelled && job.cancelReason ? job.cancelReason : toErrorMessage(error);
            }
            job.reject(cancelled && job.cancelReason ? cancelledError(job.cancelReason) : error);
        })
            .finally(() => {
            const finishedMs = Date.now();
            task.finishedAt = nowIso();
            task.runMs = elapsed(startedMs, finishedMs);
            task.totalMs = elapsed(task.createdAtMs, finishedMs);
            if (this.inFlight.get(task.key) === job.promise)
                this.inFlight.delete(task.key);
            if (this.active === job)
                this.active = null;
            this.pruneTasks();
            this.notify();
            this.pump();
        });
    }
    /**
     * 相同 key 的任务共享同一 Promise；generation 与 guard 共同阻止禁用/重启后的旧任务提交。
     */
    run(key, label, kind, work, options = {}) {
        if (!this.accepting)
            return Promise.reject(cancelledError('镜渊已禁用，不再接受新任务'));
        const existing = this.inFlight.get(key);
        if (existing)
            return existing;
        const createdMs = Date.now();
        const priority = Number.isFinite(options.priority)
            ? Number(options.priority)
            : (DEFAULT_PRIORITIES[String(kind)] ?? 50);
        const task = {
            id: makeId('task'),
            key,
            label,
            kind,
            state: 'queued',
            createdAt: nowIso(),
            createdAtMs: createdMs,
            priority,
            chatKey: options.chatKey,
            triggerSource: options.triggerSource,
            messageKey: options.messageKey,
            messageFingerprint: options.messageFingerprint,
            historyRevisionAtEnqueue: options.historyRevisionAtEnqueue,
            historyRecoveryPhaseAtEnqueue: options.historyRecoveryPhaseAtEnqueue,
            automatic: options.automatic === true,
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
            reject,
        };
        this.pending.push(job);
        this.inFlight.set(key, promise);
        this.pruneTasks();
        this.notify();
        this.pump();
        return promise;
    }
}
export const taskQueue = new TaskQueue();
