import { parseFactProtocol } from '../core/protocol.js';
import { WORLD_TYPES } from '../core/schema.js';
import { invariant } from '../core/util.js';
import { importPrompt } from './prompts.js';

const ensureImport = (condition, message, code = 'IMPORT') => invariant(condition, message, 'workflow', code);

export class WorldSettingImportService {
  constructor(host, worldbook, model, memory) {
    this.host = host;
    this.worldbook = worldbook;
    this.model = model;
    this.memory = memory;
    this.previewState = null;
  }

  clear() { this.previewState = null; }
  previewValue() { return this.previewState; }

  async preview(settings, snapshot, sourceText) {
    const source = String(sourceText ?? '').trim();
    ensureImport(source.length >= 2, '请粘贴世界设定文本或导入TXT', 'IMPORT_SOURCE');
    ensureImport(source.length <= 120000, '世界设定文本超过120000字符上限', 'IMPORT_LIMIT');
    this.host.assertSnapshot(snapshot);
    const opened = await this.worldbook.read(settings);
    const relevant = opened.managed
      .filter(entry => source.toLocaleLowerCase().includes(entry.name.toLocaleLowerCase()) || /^(基础设定|世界)$/u.test(entry.type))
      .slice(0, 12);
    const response = await this.model.structured(
      importPrompt(source, relevant), settings, snapshot.token,
      raw => parseFactProtocol(raw, { allowedTypes: WORLD_TYPES, maxIdentities: 16 }),
    );
    ensureImport(response.value.length > 0, '设定文本没有形成可导入事实', 'IMPORT_EMPTY');
    this.previewState = {
      chatKey: snapshot.chatKey,
      worldbookName: opened.name,
      worldbookDigest: opened.digest,
      groups: response.value,
      raw: response.raw,
    };
    return this.previewState;
  }

  async commit(settings, snapshot) {
    const preview = this.previewState;
    ensureImport(preview && preview.chatKey === snapshot.chatKey, '没有属于当前聊天的导入预览', 'IMPORT_PREVIEW');
    this.host.assertSnapshot(snapshot);
    const opened = await this.worldbook.read(settings);
    ensureImport(opened.name === preview.worldbookName, '导入预览后聊天绑定的世界书已变化', 'IMPORT_BOOK');
    ensureImport(opened.digest === preview.worldbookDigest, '世界书在预览后发生变化，请重新生成预览', 'IMPORT_STALE');
    const result = await this.memory.writeFactGroups(settings, snapshot, opened, preview.groups);
    this.previewState = null;
    return result;
  }
}
