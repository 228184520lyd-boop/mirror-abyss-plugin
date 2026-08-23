const BUNDLE_URL = './app.js?v=4.0.0-clean.4';

let bundlePromise;
let application;

function loadBundle() {
  return bundlePromise ??= import(BUNDLE_URL);
}

async function start() {
  if (application) return;
  const { createApplication } = await loadBundle();
  application = createApplication();
  application.start();
}

export async function onActivate() { return start(); }

export async function onEnable() { return start(); }

export async function onDisable() {
  application?.stop();
  application = null;
}
