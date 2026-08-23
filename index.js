import { createApplication } from './src/app.js';

let application = null;

export async function onActivate() {
  if (application) return;
  application = createApplication();
  application.start();
}

export async function onEnable() { return onActivate(); }

export async function onDisable() {
  application?.stop();
  application = null;
}
