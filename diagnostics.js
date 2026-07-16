import { VERSION } from '../constants.js';
import { currentChatKey, getSettings, tryGetContext } from '../core/context.js';
import { getChatState } from '../storage/repository.js';

export async function runDiagnostics() {
    const checks = [];
    const context = tryGetContext();
    checks.push({
        id: 'context',
        label: 'SillyTavern上下文',
        status: context ? 'ok' : 'error',
        detail: context ? '已连接' : '不可用',
    });
    checks.push({
        id: 'generateRaw',
        label: '当前连接原始调用',
        status: typeof context?.generateRaw === 'function' ? 'ok' : 'warn',
        detail: typeof context?.generateRaw === 'function' ? 'generateRaw可用' : '当前连接模式不可用；请选择可用的Connection Profile',
    });
    checks.push({
        id: 'connectionService',
        label: 'Connection Profile隔离调用',
        status: typeof context?.ConnectionManagerRequestService?.sendRequest === 'function' ? 'ok' : 'warn',
        detail: typeof context?.ConnectionManagerRequestService?.sendRequest === 'function'
            ? 'ConnectionManagerRequestService可用，不需要切换全局连接'
            : '不可用；Profile模式不可用，仍可使用当前聊天连接',
    });
    checks.push({
        id: 'settingsPanel',
        label: '扩展设置入口',
        status: document.querySelector('#ma11-settings-root') ? 'ok' : 'warn',
        detail: document.querySelector('#ma11-settings-root') ? '已挂载' : '尚未挂载',
    });
    const settings = context ? getSettings() : null;
    checks.push({
        id: 'audit',
        label: '规则审核配置',
        status: settings?.auditEnabled && !settings.auditPrompt.trim() ? 'error' : 'ok',
        detail: settings?.auditEnabled ? (settings.auditPrompt.trim() ? '已启用并填写规则' : '已启用但规则为空') : '未启用',
    });
    if (context) {
        const state = await getChatState(currentChatKey());
        checks.push({
            id: 'history',
            label: '历史数据一致性',
            status: state.historyInvalidation ? 'warn' : 'ok',
            detail: state.historyInvalidation
                ? state.historyInvalidation.startIndex === undefined
                    ? '历史删除位置未知，需要选择重算起点'
                    : `第 ${state.historyInvalidation.startIndex + 1} 条消息之后正在等待自动或手动重建`
                : '当前派生数据未发现历史失效',
        });
        checks.push({
            id: 'sync',
            label: '最近世界书同步',
            status: state.lastSyncStatus === 'failed' ? 'error' : state.lastSyncStatus === 'success' ? 'ok' : 'warn',
            detail: state.lastSyncError || state.lastSyncAt || '尚未同步',
        });
    }
    return checks;
}

export async function diagnosticReport() {
    const context = tryGetContext();
    const chatKey = context ? currentChatKey() : 'unavailable';
    return {
        version: VERSION,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        location: location.origin,
        chatKey,
        checks: await runDiagnostics(),
        settings: context ? { ...getSettings(), auditPrompt: getSettings().auditPrompt ? '[已填写]' : '' } : null,
        chatState: context ? await getChatState(chatKey) : null,
    };
}
