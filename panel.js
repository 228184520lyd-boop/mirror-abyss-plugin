import { WORLD_SCHEMA, WORLD_TYPES } from '../core/schema.js';
import { describeError, fault } from '../core/util.js';
import { button, element, notice } from './dom.js';

const ROOT_ID = 'mirror-abyss-clean-root';

export class MirrorAbyssPanel {
  constructor(controller, host) {
    this.controller = controller;
    this.host = host;
    this.page = 'run';
    this.opened = false;
    this.editing = false;
    this.search = '';
    this.typeFilter = '全部';
    this.selected = new Set();
    this.entryData = null;
    this.boundRefresh = () => void this.refresh();
  }

  mount() {
    if (document.getElementById(ROOT_ID)) return;
    this.root = element('div', { className: 'ma-root' });
    this.root.id = ROOT_ID;
    this.launcher = button('渊', () => this.open(), 'ma-launcher');
    this.launcher.title = '打开镜渊';
    this.panel = element('section', { className: 'ma-panel', ariaLabel: '镜渊控制面板' });
    this.panel.hidden = true;
    this.root.append(this.launcher, this.panel);
    document.body.append(this.root);
    for (const type of ['refresh', 'status', 'settings', 'import-preview']) this.controller.addEventListener(type, this.boundRefresh);
    void this.render();
  }

  unmount() {
    for (const type of ['refresh', 'status', 'settings', 'import-preview']) this.controller.removeEventListener(type, this.boundRefresh);
    document.documentElement.classList.remove('ma-panel-open');
    this.root?.remove();
  }

  open(page = this.page) {
    this.page = page;
    this.opened = true;
    this.panel.hidden = false;
    document.documentElement.classList.add('ma-panel-open');
    void this.render();
  }

  close() {
    this.opened = false;
    this.panel.hidden = true;
    document.documentElement.classList.remove('ma-panel-open');
  }

  async refresh() {
    if (!this.opened) return;
    await this.render();
  }

  async render() {
    if (!this.panel) return;
    this.panel.replaceChildren();
    const header = element('header', { className: 'ma-header' }, [
      element('div', { className: 'ma-brand' }, [element('span', { className: 'ma-sigil', text: '◇' }), element('strong', { text: '镜渊' })]),
      button('关闭', () => this.close(), 'ma-quiet'),
    ]);
    const nav = element('nav', { className: 'ma-tabs' });
    for (const [key, label] of [['run', '运行'], ['notes', '手记'], ['maintenance', '维护']]) {
      const tab = button(label, () => { this.page = key; void this.render(); }, key === this.page ? 'is-active' : '');
      tab.setAttribute('role', 'tab');
      nav.append(tab);
    }
    const main = element('main', { className: 'ma-main' });
    this.panel.append(header, nav, main);
    try {
      if (this.page === 'run') await this.renderRun(main);
      else if (this.page === 'notes') await this.renderNotes(main);
      else await this.renderMaintenance(main);
    } catch (error) {
      main.append(element('div', { className: 'ma-error', text: describeError(error) }));
    }
  }

  async renderRun(main) {
    const state = this.host.state();
    main.append(
      element('section', { className: 'ma-scene-strip' }, [
        element('span', { text: state.currentScene ? `当前场景 · ${state.currentScene}` : '当前场景 · 未识别' }),
        element('span', { text: `${state.currentGroupFacts || 0} 条待整理事实` }),
      ]),
      element('section', { className: 'ma-section' }, [
        element('h2', { text: '当前正文' }),
        element('div', { className: 'ma-action-grid' }, [
          this.action('完整处理当前正文', () => this.controller.process('full')),
          this.action('仅审核', () => this.controller.process('audit')),
          this.action('仅提取', () => this.controller.process('extract')),
          this.action('取消当前任务', () => this.controller.cancel(), 'ma-danger'),
        ]),
      ]),
      element('section', { className: 'ma-section' }, [
        element('h2', { text: '总结' }),
        element('p', { className: 'ma-help', text: '小总结整理当前场景批次；大总结整理已完成的小总结结果。' }),
        element('div', { className: 'ma-action-grid' }, [
          this.action('立即小总结', () => this.controller.summarize('small')),
          this.action('立即大总结', () => this.controller.summarize('large')),
          this.action('重试上次失败', () => this.controller.retryLast()),
        ]),
      ]),
      element('section', { className: 'ma-section' }, [
        element('h2', { text: '运行状态' }),
        element('div', { className: `ma-status is-${state.status?.phase || 'idle'}`, text: state.status?.detail || '等待处理' }),
      ]),
    );
  }

  async renderNotes(main) {
    const opened = await this.controller.listEntries();
    this.entryData = opened;
    const top = element('section', { className: 'ma-notes-head' }, [
      element('div', {}, [element('h1', { text: '世界设定集' }), element('small', { text: `${opened.managed.filter(entry => !entry.retired).length} 条管理资料` })]),
      element('div', { className: 'ma-inline-actions' }, [
        button(this.editing ? '完成' : '修改', () => { this.editing = !this.editing; this.selected.clear(); void this.render(); }, this.editing ? 'is-active' : 'ma-quiet'),
        button('刷新', () => this.render(), 'ma-quiet'),
      ]),
    ]);
    const search = element('input', { className: 'ma-search', type: 'search', value: this.search, placeholder: '搜索人物、地点、物品、事件或正文' });
    search.addEventListener('input', () => { this.search = search.value; void this.renderNotesList(listHost, opened); });
    const filters = element('div', { className: 'ma-filters' });
    for (const type of ['全部', ...WORLD_TYPES]) {
      const count = type === '全部' ? opened.managed.filter(entry => !entry.retired).length : opened.managed.filter(entry => !entry.retired && entry.type === type).length;
      filters.append(button(`${type} ${count}`, () => { this.typeFilter = type; void this.renderNotesList(listHost, opened); }, type === this.typeFilter ? 'is-active' : 'ma-chip'));
    }
    const toolbar = element('div', { className: `ma-manage-bar ${this.editing ? '' : 'is-hidden'}` }, [
      button('＋ 文件夹', () => this.createFolder(opened.name)),
      button('小总结', () => this.runSelectedSummary('small')),
      button('大总结', () => this.runSelectedSummary('large')),
      button('手动合并', () => this.runSelectedSummary('merge')),
      button('删除条目', () => this.deleteSelected(), 'ma-danger'),
    ]);
    const listHost = element('div', { className: 'ma-notes-list' });
    main.append(top, search, filters, toolbar, listHost);
    await this.renderNotesList(listHost, opened);
  }

  async renderNotesList(host, opened) {
    host.replaceChildren();
    const layout = this.folderLayout(opened.name);
    const query = this.search.trim().toLocaleLowerCase();
    const entries = opened.managed.filter(entry => !entry.retired)
      .filter(entry => this.typeFilter === '全部' || entry.type === this.typeFilter)
      .filter(entry => !query || `${entry.title}\n${entry.content}`.toLocaleLowerCase().includes(query));
    const folders = [{ id: 'default', name: '默认分类' }, ...layout.folders];
    for (const folder of folders) {
      const inFolder = entries.filter(entry => (layout.assignments[entry.uid] || 'default') === folder.id);
      if (!inFolder.length && folder.id === 'default' && entries.length) continue;
      const section = element('section', { className: 'ma-folder' });
      const headActions = [];
      if (this.editing && folder.id !== 'default') {
        headActions.push(button('重命名', () => this.renameFolder(opened.name, folder.id), 'ma-mini'));
        headActions.push(button('删除', () => this.removeFolder(opened.name, folder.id), 'ma-mini ma-danger'));
      }
      section.append(element('div', { className: 'ma-folder-head' }, [
        element('h2', { text: folder.name }),
        element('span', { text: `${inFolder.length} 条` }),
        ...headActions,
      ]));
      for (const entry of inFolder) section.append(this.entryRow(opened.name, entry, folders, layout));
      if (!inFolder.length) section.append(element('p', { className: 'ma-empty', text: '此文件夹暂无条目' }));
      host.append(section);
    }
    if (opened.external.length) host.append(element('p', { className: 'ma-help', text: `${opened.external.length}个原生条目不属于镜渊模板，保持只读且不会被自动修改。` }));
  }

  entryRow(worldbookName, entry, folders, layout) {
    const details = element('details', { className: 'ma-entry' });
    const summary = element('summary', { className: 'ma-entry-head' });
    if (this.editing) {
      const check = element('input', { type: 'checkbox', ariaLabel: `选择${entry.title}` });
      check.checked = this.selected.has(entry.uid);
      check.addEventListener('click', event => event.stopPropagation());
      check.addEventListener('change', () => check.checked ? this.selected.add(entry.uid) : this.selected.delete(entry.uid));
      summary.append(check);
    }
    summary.append(
      element('span', { className: 'ma-type-icon', text: WORLD_SCHEMA[entry.type].icon }),
      element('strong', { text: entry.name }),
      element('small', { text: entry.type }),
    );
    if (this.editing) {
      const select = element('select', { className: 'ma-folder-select', ariaLabel: '移动到文件夹' });
      for (const folder of folders) {
        const option = element('option', { text: folder.name, value: folder.id });
        option.selected = (layout.assignments[entry.uid] || 'default') === folder.id;
        select.append(option);
      }
      select.addEventListener('click', event => event.stopPropagation());
      select.addEventListener('change', () => this.assignFolder(worldbookName, entry.uid, select.value));
      summary.append(select);
    }
    const content = element('div', { className: 'ma-entry-content' });
    const pre = element('pre', { text: entry.content });
    content.append(pre);
    if (this.editing) content.append(button('编辑正文', () => this.editEntry(content, entry), 'ma-quiet'));
    details.append(summary, content);
    return details;
  }

  editEntry(container, entry) {
    const textarea = element('textarea', { className: 'ma-editor', value: entry.content });
    const actions = element('div', { className: 'ma-inline-actions' }, [
      button('保存', async () => {
        try { await this.controller.updateEntry(entry.uid, textarea.value); } catch (error) { notice(error); }
      }),
      button('取消', () => void this.render(), 'ma-quiet'),
    ]);
    container.replaceChildren(textarea, actions);
  }

  async renderMaintenance(main) {
    const settings = this.controller.settings();
    const automation = element('section', { className: 'ma-section' }, [element('h2', { text: '自动运行' })]);
    for (const [key, label, detail] of [
      ['autoAudit', '自动审核', '每轮先检查AI正文'],
      ['autoExtraction', '自动提取', '把已成立事实写入当前世界书'],
      ['autoSmallSummary', '自动小总结', '按已关闭场景组顺序整理'],
      ['autoLargeSummary', '自动大总结', '按已完成场景组阈值整理'],
      ['autoCreateLorebook', '自动创建世界书', '聊天未绑定时创建并绑定'],
    ]) automation.append(this.toggle(key, label, detail, settings[key]));

    const threshold = element('input', { type: 'number', value: settings.largeSummaryGroups, className: 'ma-number' });
    threshold.min = '2'; threshold.max = '20';
    threshold.addEventListener('change', () => this.controller.saveSettings({ largeSummaryGroups: Number(threshold.value) }));
    automation.append(element('label', { className: 'ma-setting-row' }, [
      element('span', {}, [element('strong', { text: '大总结场景组阈值' }), element('small', { text: '完成多少个小总结后运行' })]), threshold,
    ]));

    const importSection = element('section', { className: 'ma-section' }, [element('h2', { text: '世界设定导入' })]);
    const textarea = element('textarea', { className: 'ma-import-text', placeholder: '粘贴世界设定文本；与导入TXT使用同一条AI整理链。' });
    const file = element('input', { type: 'file', ariaLabel: '选择TXT文件' });
    file.accept = '.txt,text/plain';
    file.addEventListener('change', async () => {
      try {
        const selected = file.files?.[0];
        if (selected) textarea.value = await selected.text();
      } catch (error) {
        notice(fault('ui', 'TXT_READ', `TXT读取失败：${error.message}`, error));
      }
    });
    const previewHost = element('div', { className: 'ma-import-preview' });
    const importActions = element('div', { className: 'ma-inline-actions' }, [
      button('AI整理预览', async () => { try { await this.controller.previewImport(textarea.value); this.renderImportPreview(previewHost); } catch (error) { notice(error); } }),
      button('确认写入', async () => { try { await this.controller.commitImport(); previewHost.replaceChildren(); } catch (error) { notice(error); } }),
      button('清空', () => { textarea.value = ''; this.controller.clearImportPreview(); previewHost.replaceChildren(); }, 'ma-quiet'),
    ]);
    importSection.append(textarea, file, importActions, previewHost);
    this.renderImportPreview(previewHost);

    const diagnostics = element('section', { className: 'ma-section' }, [element('h2', { text: '维护' })]);
    const report = element('div', { className: 'ma-report' });
    diagnostics.append(element('div', { className: 'ma-inline-actions' }, [
      button('运行诊断', async () => {
        try {
          const checks = await this.controller.diagnostics();
          report.replaceChildren(...checks.map(check => element('div', { className: `ma-check ${check.passed ? 'is-pass' : 'is-fail'}`, text: `${check.passed ? '通过' : '失败'} · ${check.name} · ${check.detail}` })));
        } catch (error) { notice(error); }
      }),
      button('重置运行状态', async () => { try { await this.controller.resetOperationalState(); } catch (error) { notice(error); } }, 'ma-danger'),
    ]), report);
    main.append(automation, importSection, diagnostics);
  }

  renderImportPreview(host) {
    const preview = this.controller.importPreview();
    if (!preview) return;
    host.replaceChildren(element('h3', { text: `待写入 ${preview.groups.length} 个对象` }));
    for (const group of preview.groups) {
      host.append(element('details', { className: 'ma-preview-item' }, [
        element('summary', { text: group.title }),
        element('pre', { text: group.rows.map(row => `【${row.section}】\n- ${row.fact}`).join('\n') }),
      ]));
    }
  }

  toggle(key, title, detail, checked) {
    const input = element('input', { type: 'checkbox', ariaLabel: title });
    input.checked = checked;
    input.addEventListener('change', () => this.controller.saveSettings({ [key]: input.checked }));
    return element('label', { className: 'ma-setting-row' }, [
      element('span', {}, [element('strong', { text: title }), element('small', { text: detail })]), input,
    ]);
  }

  action(label, task, className = '') {
    return button(label, async () => {
      try { await task(); } catch (error) { notice(error); }
    }, className);
  }

  folderLayout(worldbookName) {
    const settings = this.controller.settings();
    const current = settings.foldersByWorldbook?.[worldbookName];
    return current && typeof current === 'object'
      ? { folders: Array.isArray(current.folders) ? current.folders : [], assignments: current.assignments ?? {} }
      : { folders: [], assignments: {} };
  }

  saveFolderLayout(worldbookName, layout) {
    const settings = this.controller.settings();
    this.controller.saveSettings({ foldersByWorldbook: { ...settings.foldersByWorldbook, [worldbookName]: layout } });
    void this.render();
  }

  createFolder(worldbookName) {
    const name = window.prompt('新建文件夹名称')?.trim();
    if (!name) return;
    const layout = this.folderLayout(worldbookName);
    const id = `folder-${Date.now().toString(36)}`;
    layout.folders.push({ id, name });
    this.saveFolderLayout(worldbookName, layout);
  }

  renameFolder(worldbookName, id) {
    const layout = this.folderLayout(worldbookName);
    const folder = layout.folders.find(item => item.id === id);
    if (!folder) return;
    const name = window.prompt('文件夹新名称', folder.name)?.trim();
    if (!name) return;
    folder.name = name;
    this.saveFolderLayout(worldbookName, layout);
  }

  removeFolder(worldbookName, id) {
    const layout = this.folderLayout(worldbookName);
    layout.folders = layout.folders.filter(item => item.id !== id);
    for (const [uid, folderId] of Object.entries(layout.assignments)) if (folderId === id) delete layout.assignments[uid];
    this.saveFolderLayout(worldbookName, layout);
  }

  assignFolder(worldbookName, uid, folderId) {
    const layout = this.folderLayout(worldbookName);
    if (folderId === 'default') delete layout.assignments[uid];
    else layout.assignments[uid] = folderId;
    this.saveFolderLayout(worldbookName, layout);
  }

  async runSelectedSummary(kind) {
    try {
      const uids = [...this.selected];
      if (!uids.length) throw fault('ui', 'SELECTION_EMPTY', '请先选择条目');
      const requirement = kind === 'merge' ? window.prompt('可选：填写人工合并要求', '') ?? '' : '';
      await this.controller.summarize(kind, uids, requirement);
      this.selected.clear();
    } catch (error) { notice(error); }
  }

  async deleteSelected() {
    try {
      const uids = [...this.selected];
      if (!uids.length) throw fault('ui', 'SELECTION_EMPTY', '请先选择条目');
      if (!window.confirm(`确认删除选中的${uids.length}个条目？`)) return;
      await this.controller.deleteEntries(uids);
      this.selected.clear();
    } catch (error) { notice(error); }
  }
}
