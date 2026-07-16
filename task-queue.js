import { makeId, nowIso, toErrorMessage } from '../core/utils.js';
export class TaskQueue {
    static MAX_TASKS = 200;
    tail = Promise.resolve();
    inFlight = new Map();
    tasks = new Map();
    listeners = new Set();
    accepting = true;
    generation = 0;
    setAccepting(accepting) {
        if (this.accepting && !accepting)
            this.generation += 1;
        this.accepting = accepting;
    }
    pruneTasks() {
        while (this.tasks.size > TaskQueue.MAX_TASKS) {
            const oldest = this.tasks.keys().next().value;
            if (!oldest)
                break;
            this.tasks.delete(oldest);
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
        return [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    has(key) {
        return this.inFlight.has(key);
    }
    clearHistory() {
        for (const [id, task] of this.tasks) {
            if (task.state !== 'running' && task.state !== 'queued')
                this.tasks.delete(id);
        }
        this.notify();
    }
    resetRuntime() {
        this.generation += 1;
        this.tasks.clear();
        this.inFlight.clear();
        this.notify();
    }
    async whenIdle() {
        await this.tail.catch(() => undefined);
    }
    run(key, label, kind, work) {
        if (!this.accepting)
            return Promise.reject(new Error('镜渊已禁用，不再接受新任务'));
        const existing = this.inFlight.get(key);
        if (existing)
            return existing;
        const task = {
            id: makeId('task'),
            key,
            label,
            kind,
            state: 'queued',
            createdAt: nowIso(),
        };
        this.tasks.set(task.id, task);
        this.pruneTasks();
        this.notify();
        const taskGeneration = this.generation;
        let promise;
        const execute = async () => {
            try {
                if (!this.accepting || taskGeneration !== this.generation)
                    throw new Error('镜渊已禁用，任务已停止');
                task.state = 'running';
                task.startedAt = nowIso();
                this.notify();
                const result = await work();
                task.state = 'success';
                return result;
            }
            catch (error) {
                task.state = 'failed';
                task.error = toErrorMessage(error);
                throw error;
            }
            finally {
                task.finishedAt = nowIso();
                if (this.inFlight.get(key) === promise)
                    this.inFlight.delete(key);
                this.notify();
            }
        };
        promise = this.tail.then(execute, execute);
        this.tail = promise.catch(() => undefined);
        this.inFlight.set(key, promise);
        return promise;
    }
}
export const taskQueue = new TaskQueue();
