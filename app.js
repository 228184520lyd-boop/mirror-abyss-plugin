import { HostAdapter, SettingsStore } from './adapters/host.js';
import { WorldbookRepository } from './adapters/worldbook.js';
import { MirrorAbyssController } from './application/controller.js';
import { WorldSettingImportService } from './application/import-service.js';
import { MemoryService } from './application/memory-service.js';
import { ModelGateway } from './application/model-gateway.js';
import { ChatIndicator } from './ui/chat-indicator.js';
import { MirrorAbyssPanel } from './ui/panel.js';

export function createApplication() {
  const host = new HostAdapter();
  const settingsStore = new SettingsStore();
  const worldbook = new WorldbookRepository(host);
  const model = new ModelGateway(host);
  const memory = new MemoryService(host, worldbook, model);
  const importer = new WorldSettingImportService(host, worldbook, model, memory);
  const controller = new MirrorAbyssController({ host, settingsStore, memory, importer });
  const panel = new MirrorAbyssPanel(controller, host);
  const indicator = new ChatIndicator(controller, host, panel);

  return {
    start() {
      controller.start();
      panel.mount();
      indicator.mount();
    },
    stop() {
      indicator.unmount();
      panel.unmount();
      controller.stop();
    },
  };
}
