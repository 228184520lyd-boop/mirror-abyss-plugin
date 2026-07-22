/**
 * 模块职责：浏览器入口，仅负责导出 SillyTavern 生命周期钩子。
 * 维护边界：不要在入口层堆叠业务逻辑，避免生命周期与流水线耦合。
 */
export { onActivate, onInstall, onUpdate, onEnable, onDisable, onClean, onDelete, } from './bootstrap-app.js';
import { installAppReadyHandler } from './bootstrap-app.js';
installAppReadyHandler();
