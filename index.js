import { startApplication } from './app.js?v=4.0.63';
const ctx = globalThis.SillyTavern?.getContext?.();
if (ctx) startApplication(ctx);
