/* Generated from src/index.ts for esm.sh — do not edit dist directly. */
import { getApplication } from './app/application.js';
/**
 * SillyTavern 生命周期入口。
 * 这里不包含业务逻辑，只转发到唯一应用实例。
 */
export async function onActivate() {
    await getApplication().start();
}
export async function onEnable() {
    await getApplication().start();
}
export function onDisable() {
    getApplication().stop();
}
export function onDelete() {
    getApplication().stop();
}
