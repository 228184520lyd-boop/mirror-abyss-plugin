/* Generated from src/ui/App.tsx — do not edit dist directly. */
import React from '../vendor/react.js';
import { VERSION, DEFAULT_TABLE_KEYS } from '../constants.js';
import { processingActions } from '../features/processing/processing-slice.js';
import { settingsActions } from '../features/settings/settings-slice.js';
import { createDiagnosticReport } from '../shared/diagnostics.js';
import { useAppDispatch, useAppSelector } from './store-hooks.js';
const STATUS_TEXT = { idle: '等待聊天', 'loading-chat': '正在载入当前聊天', ready: '已就绪', error: '发生错误', disabled: '已禁用' };
const STAGE_TEXT = { idle: '空闲', loading: '读取消息', audit: '审核', revision: '修正', extraction: '事实提取', saving: '保存', complete: '完成', blocked: '已阻断', error: '失败' };
export function App() {
    const dispatch = useAppDispatch();
    const session = useAppSelector((state) => state.session);
    const document = useAppSelector((state) => state.document.active);
    const processing = useAppSelector((state) => state.processing);
    const settings = useAppSelector((state) => state.settings);
    const busy = !['idle', 'complete', 'blocked', 'error'].includes(processing.status);
    const [diagnosticStatus, setDiagnosticStatus] = React.useState('');
    const runtimeProvider = globalThis.__MIRROR_ABYSS_RUNTIME_PROVIDER__ ?? '未记录';
    const dependencyProviders = globalThis.__MIRROR_ABYSS_DEPENDENCY_PROVIDERS__ ?? {};
    const copyDiagnostics = async () => {
        const report = createDiagnosticReport({ session, processing, document });
        const text = JSON.stringify(report, null, 2);
        try {
            await copyText(text);
            setDiagnosticStatus('诊断 JSON 已复制；可直接粘贴反馈。');
        }
        catch (error) {
            setDiagnosticStatus(`复制失败：${error instanceof Error ? error.message : String(error)}`);
        }
    };
    return React.createElement("section", { className: "mirror-abyss-v2-panel", "aria-label": "Mirror Abyss" },
        React.createElement("h3", null, "Mirror Abyss\uFF5C\u53EF\u5B89\u88C5\u5B9E\u673A\u5019\u9009"),
        React.createElement("div", { className: "mirror-abyss-v2-grid" },
            React.createElement("span", { className: "mirror-abyss-v2-label" }, "\u7248\u672C"),
            React.createElement("span", null, VERSION),
            React.createElement("span", { className: "mirror-abyss-v2-label" }, "\u8FD0\u884C\u4F9D\u8D56"),
            React.createElement("span", null, runtimeProvider),
            React.createElement("span", { className: "mirror-abyss-v2-label" }, "\u5BBF\u4E3B\u72B6\u6001"),
            React.createElement("span", null, STATUS_TEXT[session.status]),
            React.createElement("span", { className: "mirror-abyss-v2-label" }, "\u5F53\u524D\u804A\u5929"),
            React.createElement("span", { className: "mirror-abyss-v2-value" }, session.activeChatKey ?? '未选择'),
            React.createElement("span", { className: "mirror-abyss-v2-label" }, "\u5904\u7406\u9636\u6BB5"),
            React.createElement("span", null,
                STAGE_TEXT[processing.status],
                processing.detail ? `｜${processing.detail}` : ''),
            React.createElement("span", { className: "mirror-abyss-v2-label" }, "\u6587\u6863\u7248\u672C"),
            React.createElement("span", null, document ? `revision ${document.revision}` : '尚未建立'),
            React.createElement("span", { className: "mirror-abyss-v2-label" }, "\u672C\u8F6E\u6982\u62EC"),
            React.createElement("span", null, document?.lastTurnSummary || '（无）')),
        React.createElement("div", { className: "mirror-abyss-v2-actions" },
            React.createElement("button", { className: "menu_button", disabled: busy || !session.activeChatKey, onClick: () => dispatch(processingActions.processRequested({ source: 'manual' })) }, "\u5904\u7406\u6700\u65B0 AI \u6B63\u6587"),
            React.createElement("button", { className: "menu_button", type: "button", onClick: copyDiagnostics }, "\u590D\u5236\u5B9E\u673A\u8BCA\u65AD JSON"),
            React.createElement("label", null,
                React.createElement("input", { type: "checkbox", checked: settings.autoProcess, onChange: (e) => dispatch(settingsActions.patchRequested({ autoProcess: e.target.checked })) }),
                " \u81EA\u52A8\u5904\u7406\u65B0\u6B63\u6587"),
            React.createElement("label", null,
                React.createElement("input", { type: "checkbox", checked: settings.auditEnabled, onChange: (e) => dispatch(settingsActions.patchRequested({ auditEnabled: e.target.checked })) }),
                " \u542F\u7528\u5BA1\u6838"),
            React.createElement("label", null,
                React.createElement("input", { type: "checkbox", checked: settings.autoRevision, onChange: (e) => dispatch(settingsActions.patchRequested({ autoRevision: e.target.checked })) }),
                " \u5BA1\u6838\u5931\u8D25\u65F6\u6700\u5C0F\u4FEE\u6B63")),
        diagnosticStatus ? React.createElement("div", { className: "mirror-abyss-v2-diagnostic-status", role: "status" }, diagnosticStatus) : null,
        React.createElement("label", { className: "mirror-abyss-v2-field" },
            "\u5BA1\u6838\u89C4\u5219",
            React.createElement("textarea", { rows: 6, value: settings.auditRules, placeholder: "\u4E00\u6761\u786C\u89C4\u5219\u4E00\u884C\uFF1B\u4E3A\u7A7A\u65F6\u4E0D\u8981\u542F\u7528\u5BA1\u6838", onChange: (e) => dispatch(settingsActions.patchRequested({ auditRules: e.target.value })) })),
        React.createElement("label", { className: "mirror-abyss-v2-field" },
            "\u9644\u52A0\u4FEE\u6B63\u8981\u6C42",
            React.createElement("textarea", { rows: 3, value: settings.revisionInstructions, onChange: (e) => dispatch(settingsActions.patchRequested({ revisionInstructions: e.target.value })) })),
        React.createElement("div", { className: "mirror-abyss-v2-table-counts" }, DEFAULT_TABLE_KEYS.map((key) => React.createElement("span", { key: key },
            key,
            ": ",
            document?.tables[key]?.length ?? 0))),
        session.error || processing.error ? React.createElement("div", { className: "mirror-abyss-v2-error", role: "alert" }, session.error || processing.error) : null,
        React.createElement("p", { className: "mirror-abyss-v2-note" }, "\u5F53\u524D\u7248\u672C\u7528\u4E8E\u771F\u5B9E SillyTavern \u9A8C\u8BC1\u201C\u4E8B\u4EF6 \u2192 \u5BA1\u6838/\u4FEE\u6B63 \u2192 \u63D0\u53D6 \u2192 chatMetadata \u2192 UI\u201D\u95ED\u73AF\uFF1B\u603B\u7ED3\u3001\u6C89\u964D\u3001\u4E16\u754C\u4E66\u548C\u5386\u53F2\u91CD\u5EFA\u5C1A\u672A\u63A5\u5165\u3002"));
}
async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = window.document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    window.document.body.appendChild(textarea);
    textarea.select();
    const copied = window.document.execCommand('copy');
    textarea.remove();
    if (!copied)
        throw new Error('浏览器拒绝剪贴板写入');
}
