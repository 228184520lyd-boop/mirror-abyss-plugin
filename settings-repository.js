/* Generated from src/host/settings-repository.ts — do not edit dist directly. */
import { EXTENSION_NAMESPACE } from '../constants.js';
import { DEFAULT_SETTINGS, parseSettings } from '../model/settings.js';
/** 插件全局设置只存 extensionSettings，不进入 ChatDocument。 */
export class SettingsRepository {
    host;
    constructor(host) {
        this.host = host;
    }
    load() {
        const context = this.host.getContext();
        const root = (context.extensionSettings ??= {});
        const namespace = readNamespace(root[EXTENSION_NAMESPACE]);
        const settings = parseSettings(namespace.settings ?? DEFAULT_SETTINGS);
        root[EXTENSION_NAMESPACE] = { ...namespace, settings: structuredClone(settings) };
        return settings;
    }
    save(patch) {
        const context = this.host.getContext();
        const root = (context.extensionSettings ??= {});
        const namespace = readNamespace(root[EXTENSION_NAMESPACE]);
        const settings = parseSettings({ ...this.load(), ...patch });
        root[EXTENSION_NAMESPACE] = { ...namespace, settings: structuredClone(settings) };
        context.saveSettingsDebounced?.();
        return settings;
    }
}
function readNamespace(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}
