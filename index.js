import { createApplication } from './app.js?v=4.0.32-recovered.5';

export function createLifecycleHooks(applicationFactory = createApplication, logger = console) {
  let application;
  let transition = Promise.resolve();

  const enqueue = operation => {
    const result = transition.then(operation);
    // Keep serialization alive after a failed hook without changing the
    // promise returned to that hook's caller.
    transition = result.catch(() => undefined);
    return result;
  };

  const start = () => enqueue(async () => {
    if (application) return;
    let next;
    try {
      next = applicationFactory();
      const started = await next.start();
      if (started) application = next;
    } catch (error) {
      const failures = [startupFailure(error)];
      try { await next?.stop?.(); } catch (cleanupError) { failures.push(startupFailure(cleanupError)); }
      const startupError = combinedFailure('Mirror Abyss启动及清理失败', failures);
      logger.error('[Mirror Abyss] startup failed', startupError);
      throw startupError;
    }
  });

  const stop = () => enqueue(async () => {
    const current = application;
    if (!current) return;
    try {
      await current.stop();
    } finally {
      // A failed stop must not leave a stale pointer blocking the next start.
      if (application === current) application = null;
    }
  });

  return Object.freeze({ onActivate: start, onEnable: start, onDisable: stop });
}

function startupFailure(error) {
  return error instanceof Error
    ? error
    : new Error(`Mirror Abyss启动失败：${error?.message ?? error?.type ?? String(error)}`, { cause: error });
}

function combinedFailure(message, failures) {
  if (failures.length === 1) return failures[0];
  return new AggregateError(failures, message, { cause: failures[0] });
}

const lifecycle = createLifecycleHooks();

export function onActivate() { return lifecycle.onActivate(); }

export function onEnable() { return lifecycle.onEnable(); }

export function onDisable() { return lifecycle.onDisable(); }
