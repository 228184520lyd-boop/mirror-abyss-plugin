import { debounce } from '../core/util.js';

const CLASS_NAME = 'ma-chat-indicator';

export class ChatIndicator {
  constructor(controller, host, panel) {
    this.controller = controller;
    this.host = host;
    this.panel = panel;
    this.render = debounce(() => this.refresh(), 80);
  }

  mount() {
    this.observer = new MutationObserver(this.render);
    this.controller.addEventListener('status', this.render);
    this.controller.addEventListener('refresh', this.render);
    this.refresh();
  }

  unmount() {
    this.controller.removeEventListener('status', this.render);
    this.controller.removeEventListener('refresh', this.render);
    this.observer?.disconnect();
    this.chat = null;
    document.querySelectorAll(`.${CLASS_NAME}`).forEach(node => node.remove());
  }

  refresh() {
    this.bindChat();
    document.querySelectorAll(`.${CLASS_NAME}`).forEach(node => node.remove());
    const state = this.host.state();
    const messages = [...document.querySelectorAll('#chat .mes')].filter(node => node.getAttribute('is_user') !== 'true');
    const latest = messages.at(-1);
    if (!latest) return;
    const indicator = document.createElement('button');
    indicator.type = 'button';
    indicator.className = CLASS_NAME;
    indicator.textContent = `镜渊 · ${state.status?.detail || '等待处理'}${state.currentScene ? ` · ${state.currentScene}` : ''}`;
    indicator.addEventListener('click', () => this.panel.open('run'));
    const body = latest.querySelector('.mes_text') ?? latest;
    body.insertAdjacentElement('afterend', indicator);
  }

  bindChat() {
    const chat = document.getElementById('chat');
    if (chat === this.chat) return;
    this.observer.disconnect();
    this.chat = chat;
    if (chat) this.observer.observe(chat, { childList: true, subtree: true });
  }
}
