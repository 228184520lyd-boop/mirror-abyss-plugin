/* Generated from src/app/application.ts for esm.sh — do not edit dist directly. */
import { ChatSessionController, StaleChatSessionError } from './chat-session.js';
import { ChatTaskExecutor } from './chat-task-executor.js';
import { createApplicationStore } from './store.js';
import { documentActions } from '../features/document/document-slice.js';
import { processingActions } from '../features/processing/processing-slice.js';
import { ProcessingService } from '../features/processing/service.js';
import { sessionActions } from '../features/session/session-slice.js';
import { settingsActions } from '../features/settings/settings-slice.js';
import { MessageGateway } from '../host/message-gateway.js';
import { ModelGateway } from '../host/model-gateway.js';
import { SettingsRepository } from '../host/settings-repository.js';
import { SillyTavernGateway } from '../host/silly-tavern.js';
import { ChatDocumentRepository } from '../repository/chat-document-repository.js';
import { errorMessage, MirrorAbyssError } from '../shared/errors.js';
import { mountUi } from '../ui/mount.js';
/**
 * 核心实机候选编排器。只包含一个消息处理入口和一组官方宿主监听。
 * EVT-20260726-004：由 FACT-RUN-001、FACT-DATA-002、FACT-CONTENT-002 触发建立本纵向闭环。
 */
export class MirrorAbyssApplication {
    runtime = createApplicationStore();
    store = this.runtime.store;
    host = new SillyTavernGateway();
    session = new ChatSessionController();
    executor = new ChatTaskExecutor(this.session);
    repository = new ChatDocumentRepository(this.host, this.session);
    settingsRepository = new SettingsRepository(this.host);
    processing = new ProcessingService(this.repository, new MessageGateway(this.host, this.session), new ModelGateway(this.host));
    mountedUi = null;
    cleanup = [];
    startPromise = null;
    started = false;
    constructor() {
        this.runtime.listenerMiddleware.startListening({
            actionCreator: processingActions.processRequested,
            effect: async (action) => { await this.handleProcessRequest(action.payload); },
        });
        this.runtime.listenerMiddleware.startListening({
            actionCreator: settingsActions.patchRequested,
            effect: async (action) => {
                const settings = this.settingsRepository.save(action.payload);
                this.store.dispatch(settingsActions.loaded(settings));
            },
        });
    }
    start() {
        if (this.startPromise)
            return this.startPromise;
        this.startPromise = this.startInternal().finally(() => { this.startPromise = null; });
        return this.startPromise;
    }
    stop() {
        if (!this.started && !this.mountedUi)
            return;
        this.started = false;
        this.cleanup.splice(0).forEach((remove) => remove());
        this.session.stop();
        this.executor.clearAll();
        this.store.dispatch(documentActions.cleared());
        this.store.dispatch(processingActions.reset());
        this.store.dispatch(sessionActions.disabled());
        this.mountedUi?.unmount();
        this.mountedUi = null;
    }
    async startInternal() {
        if (this.started)
            return;
        try {
            this.host.getContext();
            this.store.dispatch(settingsActions.loaded(this.settingsRepository.load()));
            this.mountedUi = mountUi(this.store);
            this.cleanup.push(this.host.subscribeChatChanged(() => void this.loadCurrentChat()));
            this.cleanup.push(this.host.subscribeMessageReceived((messageIndex) => this.onHostMessage('automatic', messageIndex)));
            this.cleanup.push(this.host.subscribeMessageChanged((messageIndex) => this.onHostMessage('message-change', messageIndex)));
            this.started = true;
            await this.loadCurrentChat();
        }
        catch (error) {
            // FACT-RUN-003 / EVT-20260726-009：启动不是“尽力而为”；失败必须撤销部分 UI 和监听。
            this.started = false;
            this.cleanup.splice(0).forEach((remove) => remove());
            this.session.stop();
            this.executor.clearAll();
            this.mountedUi?.unmount();
            this.mountedUi = null;
            throw error;
        }
    }
    onHostMessage(source, messageIndex) {
        const settings = this.settingsRepository.load();
        if (!settings.enabled || !settings.autoProcess)
            return;
        this.store.dispatch(processingActions.processRequested({
            source,
            ...(Number.isInteger(messageIndex) && messageIndex >= 0 ? { messageIndex } : {}),
        }));
    }
    async handleProcessRequest(request) {
        const token = this.session.capture();
        if (!token.chatKey) {
            this.store.dispatch(processingActions.failed('没有活动聊天'));
            return;
        }
        const settings = this.settingsRepository.load();
        if (!settings.enabled) {
            this.store.dispatch(processingActions.failed('插件当前已关闭'));
            return;
        }
        try {
            const document = await this.executor.run(token, async () => this.processing.process(token, settings, {
                started: (messageIndex, messageKey) => this.store.dispatch(processingActions.started({ source: request.source, messageIndex, messageKey })),
                stage: (stage, detail) => this.store.dispatch(processingActions.stageChanged({ stage, detail })),
                committed: (committed) => this.store.dispatch(documentActions.committed(committed)),
            }, request.messageIndex));
            if (!this.session.isCurrent(token))
                return;
            this.store.dispatch(documentActions.committed(document));
            this.store.dispatch(processingActions.completed(`处理完成，文档 revision ${document.revision}`));
        }
        catch (error) {
            if (error instanceof StaleChatSessionError || (error instanceof DOMException && error.name === 'AbortError') || token.signal.aborted)
                return;
            if (!this.session.isCurrent(token))
                return;
            const message = errorMessage(error);
            if (error instanceof MirrorAbyssError && ['AUDIT_BLOCKED', 'REVISION_REQUIRED'].includes(error.code)) {
                this.store.dispatch(processingActions.blocked(message));
            }
            else {
                this.store.dispatch(processingActions.failed(message));
            }
            console.error('[MirrorAbyss] message processing failed', error);
        }
    }
    async loadCurrentChat() {
        const chatKey = this.host.getCurrentChatKey();
        const token = this.session.switchTo(chatKey);
        this.executor.clearExcept(chatKey);
        this.store.dispatch(sessionActions.chatChanged({ chatKey, generation: token.generation }));
        this.store.dispatch(documentActions.cleared());
        this.store.dispatch(processingActions.reset());
        if (!chatKey)
            return;
        try {
            const document = await this.executor.run(token, async () => this.repository.loadCurrent(token));
            if (!this.session.isCurrent(token))
                return;
            this.store.dispatch(documentActions.loaded(document));
            this.store.dispatch(sessionActions.ready());
        }
        catch (error) {
            if (error instanceof StaleChatSessionError || token.signal.aborted || !this.session.isCurrent(token))
                return;
            this.store.dispatch(sessionActions.failed(errorMessage(error)));
            console.error('[MirrorAbyss] failed to load current chat', error);
        }
    }
}
let singleton = null;
export function getApplication() { singleton ??= new MirrorAbyssApplication(); return singleton; }
