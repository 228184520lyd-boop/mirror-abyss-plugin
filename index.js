export { onActivate, onInstall, onUpdate, onEnable, onDisable, onClean, onDelete, } from './bootstrap/app.js';
import { installAppReadyHandler } from './bootstrap/app.js';
installAppReadyHandler();
