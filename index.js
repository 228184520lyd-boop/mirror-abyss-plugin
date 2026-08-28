import { startApplication } from './app.js?v=4.0.75';
const ctx = globalThis.SillyTavern?.getContext?.();
if (ctx) startApplication(ctx);
