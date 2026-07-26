# 固定事实账本

更新日期：2026-07-26

这里记录已经由源码、官方接口或真实结果确定的事实。后续修改不得直接删除旧事实；若事实失效，必须在 `ENGINEERING_EVENTS.md` 中记录触发事件，再追加“已被何事实取代”。

| ID | 固定事实 | 证据 | 状态 | 影响位置 |
|---|---|---|---|---|
| FACT-ARCH-001 | 镜渊是 SillyTavern 原生 UI Extension，不采用 WXT 浏览器扩展运行层。 | 框架冻结 v1.0；官方 React Extension Template | 有效 | `manifest.json`, `src/index.ts` |
| FACT-ARCH-002 | 生产框架固定为 TypeScript、Webpack、React 18、Redux Toolkit、Zod、p-queue。 | 框架冻结 v1.0 | 有效 | `package.json`, `webpack.config.cjs` |
| FACT-DATA-001 | 每个聊天的 `ChatDocument` 是唯一持久化业务权威；UI 和未来世界书均为派生结果。 | 一百多次同步故障总结 | 有效 | `src/model/chat-document.ts`, repository |
| FACT-DATA-002 | 业务文档只有宿主保存成功后才进入 Redux fulfilled/committed 状态。 | 禁止回归 G01 | 有效 | `processing/service.ts`, `document-slice.ts` |
| FACT-DATA-003 | 模型阶段只按确定的 `inputHash` 复用；正文哈希变化会创建新的消息处理记录。 | 禁止回归 B02、B08、D01 | 有效 | `processing/reducer.ts`, `processing/service.ts` |
| FACT-DATA-004 | 事实 ID、对象行 ID 使用确定性输入生成；时空表只保留 `spacetime:current` 单例。 | alpha.27 重复条目故障；EVT-20260726-004 | 有效 | `processing/reducer.ts` |
| FACT-DATA-005 | 阶段缓存保存只推进 `ChatDocument.revision`；只有表格/事实等可发布业务投影变化才推进 `publication.targetRevision`。 | EVT-20260726-006 | 有效 | `processing/service.ts` |
| FACT-DATA-006 | 表格是事实账本的确定性投影。重处理同一 `messageKey` 成功时，必须先替换该消息的全部事实贡献再重建模型行；人工行与锁定行保留。 | EVT-20260726-010；历史重复/残留事实故障 | 有效 | `processing/reducer.ts`, `model/chat-document.ts` |
| FACT-HOST-001 | 当前 SillyTavern `getContext()` 同时提供 `eventTypes` 与兼容别名 `event_types`，并提供 `chatMetadata`、`saveMetadata`、`generateRaw`、`updateMessageBlock`。 | SillyTavern `public/scripts/st-context.js`（2026-07-26核对） | 有效 | `src/types/silly-tavern.d.ts`, `host/silly-tavern.ts` |
| FACT-HOST-002 | 官方当前连接调用形式是 `generateRaw({ prompt, systemPrompt, responseLength })`。 | SillyTavern 官方 memory 扩展 | 有效 | `host/model-gateway.ts` |
| FACT-HOST-003 | 本实机候选只保留一个当前连接调用路径，不启用多级 API fallback。 | 禁止回归 B05 | 有效 | `host/model-gateway.ts` |
| FACT-HOST-004 | 当前候选未验证 `generateRaw` 支持安全的单请求取消；不得用 `Promise.race` 让上游仍运行而本地提前释放执行通道。插件模型请求在 `ModelGateway` 内单通道串行，旧聊天结果在宿主调用结束后丢弃。 | EVT-20260726-006 | 有效 | `host/model-gateway.ts` |
| FACT-RUN-001 | 聊天切换递增 generation、abort 旧会话并清除未开始任务；旧结果不得保存到新聊天。 | 禁止回归 A01、A02、A06 | 有效 | `chat-session.ts`, `chat-task-executor.ts` |
| FACT-RUN-002 | 同一聊天任务 `concurrency=1`；历史重建未来也必须进入同一入口。 | 禁止回归 D03 | 有效 | `chat-task-executor.ts` |
| FACT-RUN-003 | 生命周期启动失败必须撤销已经挂载的 UI、已经注册的监听以及会话/队列；后续 enable 不得继承半启动资源。 | EVT-20260726-009；历史重复监听故障 | 有效 | `app/application.ts` |
| FACT-MODEL-001 | 审核、修正和扁平事实协议直接迁移 alpha.27 已确定语义，本轮不重新设计概念。 | alpha.27 prompts | 有效 | `src/prompts/*` |
| FACT-MODEL-002 | 固定文本解析允许等号、中英文冒号和字段别名，但不猜造缺失事实。 | 禁止回归 B06 | 有效 | `shared/fixed-text.ts`, `processing/parsers.ts` |
| FACT-CONTENT-001 | 审核期间正文保持可见；只有修正文准备完成后才替换正文。 | 禁止回归 C01 | 有效 | `processing/service.ts` |
| FACT-CONTENT-002 | 正文替换前验证消息键和旧哈希，替换后重新读取并验证新哈希。 | 禁止回归 C02、C03、C04 | 有效 | `host/message-gateway.ts` |
| FACT-CONTENT-003 | 修正文候选已保存但 applied 标记保存失败时，若当前可见正文哈希等于候选正文哈希，则恢复 applied 状态，不重新调用审核或修正模型。 | EVT-20260726-004；历史重复修正故障 | 有效 | `processing/reducer.ts` |
| FACT-BUILD-001 | 当前执行环境的内部 npm registry 于 2026-07-26 返回 HTTP 503，因此本环境尚未完成依赖安装和 Webpack 构建。 | 实际 curl/npm 结果 | 有效（环境事实） | `docs/REAL_MACHINE_CHECKLIST.md` |
| FACT-BUILD-002 | 依赖版本在无 lockfile 阶段全部精确固定；GitHub Actions 不启用 npm cache。真实构建成功并提交 lockfile 后，才允许由新事件调整。 | EVT-20260726-007 | 有效 | `package.json`, `.github/workflows/build-realtest.yml` |
| FACT-TEST-002 | 当前源码 smoke 已验证 33 个生产 TS/TSX 文件、相对导入、manifest 与 FACT/EVT 引用；TypeScript 转译语法检查已通过。该结果不等同于依赖 typecheck、Webpack build 或 SillyTavern 实机通过。 | EVT-20260726-008 | 有效 | `scripts/smoke.mjs`, `docs/REAL_MACHINE_CHECKLIST.md` |
| FACT-TEST-003 | 简单 reducer 回归测试固定验证：同一消息正文变化后旧事实贡献被替换，不同消息贡献仍保留，人工锁定行不被覆盖，时空模型行保持单例；不引入大型测试框架。 | EVT-20260726-011 | 有效 | `scripts/reducer-smoke.mjs` |
| FACT-TEST-001 | 简单测试只包含 smoke、TypeScript typecheck 和 Webpack build；它们不替代 SillyTavern 实机结论。 | 用户要求；禁止回归 H6 | 有效 | `scripts/smoke.mjs`, package scripts |
| FACT-BUILD-003 | 只有 manifest 指向的本地 `dist/index.js` 已生成、生命周期导出可解析且安装目录完整时，产物才可称为“可安装候选”；这仍不等于 SillyTavern 实机通过。 | EVT-20260726-012；install smoke | 有效 | `dist/index.js`, `scripts/install-smoke.mjs` |
| FACT-BUILD-004 | `2.0.0-alpha.3-installable.1` 因 npm registry 503 与 GitHub 写入权限 403，采用精确版本浏览器 ESM 依赖生成安装候选；它不是完全离线、自包含的 Webpack 产物，网络/CSP 限制必须显式显示。 | EVT-20260726-012 | 已被 FACT-BUILD-005 扩展 | `scripts/build-browser-esm.mjs`, `dist/DEPENDENCIES.json`, README |
| FACT-TEST-004 | install smoke 只证明本地入口、输出模块语法、导入映射、版本和目录结构成立；没有真实 SillyTavern 宿主时，不得把它写成“实机通过”。 | EVT-20260726-012 | 有效 | `scripts/install-smoke.mjs`, `VALIDATION_STATUS.json` |
| FACT-BUILD-005 | `2.0.0-alpha.4-realtest.1` 生成 `esm.sh` 与 `jsDelivr +esm` 两套精确直接依赖 runtime，本地 loader 按固定顺序回退；它降低单一来源故障，但仍不是离线、自包含构建。 | EVT-20260726-013；双来源 install smoke | 有效（版本事实） | `scripts/build-browser-esm.mjs`, `dist/index.js`, `dist/DEPENDENCIES.json` |
| FACT-TEST-005 | 宿主契约 smoke 可验证事件注册与清理、稳定聊天身份、消息键补写、正文/Swipe 回写和旧会话拒绝；它使用模拟上下文，不等于真实 SillyTavern 运行。 | EVT-20260726-013；`npm run smoke:host` | 有效 | `scripts/host-contract-smoke.mjs` |
| FACT-DIAG-001 | 实机诊断 JSON 只记录版本、运行来源、宿主能力、阶段状态、聊天键和数量；不得包含正文、事实内容、审核规则或角色名称。 | EVT-20260726-013 | 有效 | `src/shared/diagnostics.ts`, `src/ui/App.tsx` |

