import { createApplication } from './app.js?v=4.0.37';

let app = null;

export function onEnable() {
  if (app) return Promise.resolve();
  app = createApplication();
  return app.start();
}

export function onActivate() {
  return onEnable();
}

export function onDisable() {
  if (!app) return Promise.resolve();
  const current = app;
  app = null;
  return current.stop();
}
