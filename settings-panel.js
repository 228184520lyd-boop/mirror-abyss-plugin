/**
 * 模块职责：挂载 SillyTavern 设置入口和顶部工作区按钮。
 * 维护边界：打开或切换 UI 本身不得触发模型请求。
 */
import { DISPLAY_NAME, VERSION } from '../constants.js';
import { getContext, getSettings, saveSettings } from '../core/context.js';
import { openWorkspace, refreshWorkspace } from './workspace.js';
import { renderAllMessagePanels } from './message-panel.js';
import { abortActiveRequests, setRequestAcceptance } from '../core/requests.js';
import { taskQueue } from '../pipeline/task-queue.js';
function extensionPathFromUrl() {
    const url = new URL(import.meta.url);
    const marker = '/scripts/extensions/';
    const index = url.pathname.indexOf(marker);
    if (index < 0)
        return 'third-party/mirror-abyss-plugin';
    const remainder = url.pathname.slice(index + marker.length);
    const parts = remainder.split('/').filter(Boolean);
    if (parts[0] === 'third-party' && parts[1])
        return `third-party/${parts[1]}`;
    return parts[0] || 'third-party/mirror-abyss-plugin';
}
async function waitForElement(selector, timeoutMs = 15000) {
    const immediate = document.querySelector(selector);
    if (immediate)
        return immediate;
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
            observer.disconnect();
            reject(new Error(`未找到界面挂载点：${selector}`));
        }, timeoutMs);
        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            if (element) {
                window.clearTimeout(timer);
                observer.disconnect();
                resolve(element);
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    });
}
export async function mountSettingsPanel(isCurrent = () => true) {
    if (document.querySelector('#ma11-settings-root'))
        return;
    const context = getContext();
    const host = await waitForElement('#extensions_settings2');
    if (!isCurrent())
        return;
    const html = await context.renderExtensionTemplateAsync(extensionPathFromUrl(), 'settings', {
        title: DISPLAY_NAME,
        version: VERSION,
    });
    if (!isCurrent() || document.querySelector('#ma11-settings-root'))
        return;
    host.insertAdjacentHTML('beforeend', html);
    const root = document.querySelector('#ma11-settings-root');
    if (!root)
        throw new Error('设置模板加载后未找到根节点');
    root.querySelector('[data-ma11-quick-setting="enabled"]').checked = getSettings().enabled;
    root.querySelector('[data-ma11-action="open"]')?.addEventListener('click', () => openWorkspace('overview'));
    root.querySelector('[data-ma11-action="diagnostics"]')?.addEventListener('click', () => openWorkspace('diagnostics'));
    root.querySelector('[data-ma11-quick-setting="enabled"]')?.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        getSettings().enabled = enabled;
        setRequestAcceptance(enabled);
        taskQueue.setAccepting(enabled);
        if (!enabled)
            abortActiveRequests();
        saveSettings();
        const workspaceToggle = document.querySelector('[data-ma11-setting="enabled"]');
        if (workspaceToggle)
            workspaceToggle.checked = enabled;
        renderAllMessagePanels();
        refreshWorkspace();
    });
}
export function mountOptionalTopButton() {
    const settings = getSettings();
    document.querySelector('#ma11-top-button')?.remove();
    if (!settings.showTopButton)
        return;
    const candidates = ['#top-settings-holder', '#rightNavHolder', '#top-bar', '#top-bar-left'];
    const host = candidates.map((selector) => document.querySelector(selector)).find(Boolean);
    if (!host)
        return;
    const button = document.createElement('button');
    button.id = 'ma11-top-button';
    button.className = 'menu_button ma11-top-button fa-solid fa-table-list';
    button.type = 'button';
    button.title = '打开镜渊';
    button.setAttribute('aria-label', '打开镜渊');
    button.addEventListener('click', () => openWorkspace('overview'));
    host.appendChild(button);
}
//# sourceMappingURL=settings-panel.js.map