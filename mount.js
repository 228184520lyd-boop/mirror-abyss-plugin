/* Generated from src/ui/mount.tsx — do not edit dist directly. */
import React from '../vendor/react.js';
import { createRoot } from '../vendor/react-dom-client.js';
import { Provider } from '../vendor/react-redux.js';
import { App } from './App.js';
const ROOT_ID = 'mirror-abyss-v2-root';
/** 挂载点沿用 SillyTavern 官方 React 模板的 extensions_settings 容器。 */
export function mountUi(store) {
    const container = document.getElementById('extensions_settings');
    if (!container) {
        throw new Error('找不到 SillyTavern 扩展设置容器');
    }
    document.getElementById(ROOT_ID)?.remove();
    const element = document.createElement('div');
    element.id = ROOT_ID;
    element.className = 'mirror-abyss-v2-root';
    container.appendChild(element);
    const root = createRoot(element);
    root.render(React.createElement(React.StrictMode, null,
        React.createElement(Provider, { store: store },
            React.createElement(App, null))));
    return {
        unmount() {
            root.unmount();
            element.remove();
        },
    };
}
