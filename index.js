import { createApplication } from './app.js?v=4.0.19';

let application;

function start() {
  if (application) return;
  const next = createApplication();
  try {
    next.start();
    application = next;
  } catch (error) {
    next.stop();
    throw error;
  }
}

export function onActivate() { start(); }

export function onEnable() { start(); }

export function onDisable() {
  application?.stop();
  application = null;
}
