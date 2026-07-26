# Mirror Abyss 2.0.0-alpha.4-realtest.1

这是镜渊全面重构后的**可安装实机候选**。它不是完整功能版，也没有被标记为“实机通过”，但安装包已经包含 SillyTavern manifest 指向的本地 `dist/index.js`。

当前纵向链：

```text
SillyTavern 消息事件 / 手动按钮
→ 固定聊天身份与每聊天串行
→ 可选审核
→ 必要时最小修正并回读正文
→ 扁平事实提取
→ 保存 chatMetadata.ChatDocument
→ Redux / React UI 刷新
```

## 安装

将安装包解压到 SillyTavern 的第三方 UI Extension 目录，保持以下结构：

```text
manifest.json
style.css
dist/index.js
dist/runtime/esmsh/**
dist/runtime/jsdelivr/**
```

启用扩展后，本地生命周期入口按顺序尝试两个运行树：

1. `esm.sh` 精确版本依赖；
2. `jsDelivr +esm` 精确版本依赖。

任一来源成功即可启动。两个来源都受网络与浏览器 CSP 影响，因此当前候选仍不是完全离线、自包含的 Webpack 产物。若两者均失败，本地入口会在扩展设置区显示聚合错误，并在控制台保留每个来源的原始异常。

面板提供“复制实机诊断 JSON”按钮。诊断只包含版本、宿主能力、阶段状态、聊天键与数量统计，不包含正文、事实内容、审核规则或角色名称。

## 构建与简单检查

标准、最终目标仍是安装 npm 依赖后执行 Webpack：

```bash
npm install --no-audit --no-fund
npm run smoke
npm run smoke:reducer
npm run typecheck
npm run build
```

当前环境无法安装 npm 依赖时，可生成同版本的双来源浏览器 ESM 候选：

```bash
npm run build:installable
npm run smoke:host
npm run smoke:install
```

完整的一次性候选验证：

```bash
npm run verify:installable
```

## 当前结论

已经真实完成：

- 本地 `dist/index.js` 与两套各 33 个运行模块生成；
- 67 个输出 JavaScript 的语法、相对导入、版本与安装结构检查；
- 双来源 loader 顺序与空载生命周期检查；
- 源码结构 smoke；
- reducer 最小回归；
- 模拟当前宿主接口的事件注册/清理、稳定聊天键、正文读写和旧会话失效回归；
- 可复制的无正文诊断 JSON；
- ZIP 完整性和解包后安装结构检查。

尚未完成：

- 正式 npm typecheck；
- 自包含 Webpack bundle；
- 真实 SillyTavern 安装运行；
- 目标浏览器对两个 ESM 来源的实际可达性；
- 聊天切换、审核、修正、持久化等玩家流程的实机勾选。

因此本版本只能称为**可安装实机候选**。真实运行结果必须写入 `docs/REAL_MACHINE_CHECKLIST.md`。

固定事实与修改循环：

- `docs/FIXED_FACTS.md`
- `docs/ENGINEERING_EVENTS.md`
- `docs/CHANGE_PROTOCOL.md`
- `docs/REAL_MACHINE_CHECKLIST.md`
