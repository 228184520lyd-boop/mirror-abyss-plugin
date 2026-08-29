import { startApplication } from './app.js?v=4.0.84';
const ctx = globalThis.SillyTavern?.getContext?.();
if (ctx) startApplication(ctx);
