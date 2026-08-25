import { createApplication } from './app.js?v=4.0.21';

let application;

function start() {
  if (application) return;
  const next = createApplication();
  try {
    next.start();
    application = next;
  } catch (error) {
    next.stop?.();
    const startupError = error instanceof Error
      ? error
      : new Error(`Mirror Abyss启动失败：${error?.message ?? error?.type ?? String(error)}`, { cause: error });
    console.error('[Mirror Abyss] startup failed', startupError);
    throw startupError;
  }
}

export function onActivate() { return start(); }

export function onEnable() { return start(); }

export function onDisable() {
  application?.stop();
  application = null;
}
