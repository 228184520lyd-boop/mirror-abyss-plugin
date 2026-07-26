# 工程事件循环

每次修改必须由固定事实触发，记录观察事件、最小修改、新事实和验证。事件记录只追加，不覆盖历史。

## EVT-20260726-001｜框架冻结

- 触发固定事实：前一百多次修改反复产生多运行时、跨聊天写入、UI不同步。
- 观察事件：alpha.27 同时存在 runtime-v2、ReliableWorkflow、TaskQueue、Outbox 与提交协调器。
- 修改：冻结 SillyTavern 官方 React Template + TypeScript + Redux Toolkit + Zod + p-queue；删除旧运行内核迁移资格。
- 新固定事实：FACT-ARCH-001、FACT-ARCH-002、FACT-DATA-001。
- 验证：81 个旧模块全部写入迁移映射。
- 实机状态：不适用，属于架构审计。

## EVT-20260726-002｜Phase 1 宿主边界

- 触发固定事实：FACT-DATA-001、禁止回归 A01/A02/A04/A06。
- 观察事件：需要先固定聊天身份、取消和持久化边界，才能迁移模型业务。
- 修改：建立生命周期、ChatSession generation、AbortController、每聊天 p-queue、ChatDocument repository 和只读 UI。
- 新固定事实：FACT-RUN-001、FACT-RUN-002。
- 验证：TypeScript 单文件转译语法检查通过；未执行真实 npm build。
- 实机状态：未运行。

## EVT-20260726-003｜核对官方宿主接口

- 触发固定事实：禁止回归 A03、B05，要求尊重现有强力宿主工具。
- 观察事件：Phase 1 类型只写了 `event_types`，而官方当前上下文同时提供 `eventTypes` 和兼容别名；官方 memory 扩展直接调用 `generateRaw(params)`。
- 修改：Gateway 统一读取 `eventTypes ?? event_types`；ModelGateway 采用官方当前连接调用形式。
- 新固定事实：FACT-HOST-001、FACT-HOST-002、FACT-HOST-003。
- 验证：核对 SillyTavern 当前 `st-context.js`、`events.js` 与官方 memory 扩展源码。
- 实机状态：待真实 SillyTavern 验证。

## EVT-20260726-004｜核心纵向实机候选

- 触发固定事实：FACT-RUN-001、FACT-DATA-002、FACT-DATA-003、FACT-CONTENT-001、FACT-CONTENT-002。
- 观察事件：只有框架空壳不能验证玩家真实流程，也不能证明阶段缓存、正文回读和 chatMetadata 写入能够闭环。
- 修改：接入消息事件、手动处理按钮、当前连接 ModelGateway、审核、可选修正、正文回读、扁平事实提取、确定性事实/对象键、ChatDocument 保存和 UI 状态。
- 新固定事实：FACT-MODEL-001、FACT-MODEL-002、FACT-CONTENT-001、FACT-CONTENT-002。
- 验证：32 个 TS/TSX 生产文件完成 TypeScript 转译语法检查；简单 smoke 脚本待最终运行。
- 实机状态：未运行；必须按 `REAL_MACHINE_CHECKLIST.md` 留证。

## EVT-20260726-005｜构建环境阻断

- 触发固定事实：用户要求达到可安装实机程度，不能用语法检查冒充构建。
- 观察事件：内部 npm registry 对 React 与 Redux Toolkit 元数据请求返回 HTTP 503；公共 npm 域名在容器内无法解析。
- 修改：保留官方依赖与构建方式，不降级框架、不伪造 dist；加入 GitHub Actions 构建流程和明确状态记录。
- 新固定事实：FACT-BUILD-001、FACT-TEST-001。
- 验证：HTTP 状态与 npm 环境检查。
- 实机状态：因未生成 `dist/index.js`，本环境产物暂不能宣称已安装运行。

## EVT-20260726-006｜宿主请求与发布版本边界收紧

- 触发固定事实：FACT-HOST-002、FACT-HOST-003、FACT-DATA-001、FACT-DATA-002。
- 观察事件：旧实现使用本地 `Promise.race` 超时后会提前释放执行通道，但无法证明 SillyTavern `generateRaw` 的上游请求已被取消；同时审核/修正阶段缓存保存会错误推进未来世界书目标版本。
- 修改：`ModelGateway` 采用一个 `p-queue concurrency=1` 串行插件模型请求；聊天切换只使结果作废，不伪装上游已取消；请求时限改为软告警。`ProcessingService.commit` 增加明确的 `publishableChange` 参数，只有事实/表格正式变化才推进 `publication.targetRevision`。
- 新固定事实：FACT-HOST-004、FACT-DATA-005。
- 验证：源码边界检查；等待依赖可用后执行 typecheck/build；等待 SillyTavern 实机观察上游行为。
- 实机状态：未运行。

## EVT-20260726-007｜无 lockfile 的构建配方修正

- 触发固定事实：FACT-ARCH-002、FACT-BUILD-001、FACT-TEST-001。
- 观察事件：GitHub Actions 在没有 `package-lock.json` 时启用 `setup-node cache: npm` 可能先因找不到 lockfile 失败；版本范围也会使首次可联网构建选择未经本轮核对的新依赖。
- 修改：移除 Actions 的 npm cache；依赖与开发依赖改为精确版本；安装命令固定为 `npm install --no-audit --no-fund`。首次真实构建成功后再生成并提交 lockfile。
- 新固定事实：FACT-BUILD-002。
- 验证：workflow 和 package 静态检查；等待 GitHub Actions 或本地联网环境真实构建。
- 实机状态：未运行。

## EVT-20260726-008｜核心候选最终静态验证记录

- 触发固定事实：FACT-TEST-001、FACT-BUILD-001、FACT-BUILD-002。
- 观察事件：核心纵向链完成后需要留下可重复的真实验证状态，不能把语法检查、临时声明扫描或 ZIP 完整性写成正式构建/实机结果。
- 修改：增强 `scripts/smoke.mjs`，检查相对导入、禁止模块、官方调用形式以及源码 FACT/EVT 引用；更新实机清单；版本提升为 `2.0.0-alpha.2-realtest.2`。
- 新固定事实：FACT-TEST-002。
- 验证：smoke 通过；32 个非声明 TS/TSX 文件转译语法检查通过；真实 `npm install` 因内部 registry HTTP 503 未完成；正式 typecheck/build/实机均未运行。
- 实机状态：未运行。

## EVT-20260726-009｜半启动资源回收

- 触发固定事实：FACT-RUN-001、FACT-TEST-002，以及历史上 disable/enable 后重复调用的真实故障。
- 观察事件：启动流程先挂载 UI、再逐项注册宿主事件；若中途某个必需事件不存在并抛错，已完成的监听和 UI 会残留，下一次启用可能重复注册。
- 修改：`startInternal` 使用失败回收边界；任何启动异常都撤销监听、停止会话、清空待执行任务并卸载 UI，然后再向 SillyTavern 抛出原错误。
- 新固定事实：FACT-RUN-003。
- 验证：smoke 引用检查与 TypeScript 转译语法检查；disable/enable 真实行为仍待实机清单验证。
- 实机状态：未运行。

## EVT-20260726-010｜编辑与 Swipe 后旧事实残留

- 触发固定事实：FACT-DATA-001、FACT-DATA-003、FACT-DATA-004，以及历史上世界书重复内容的真实故障。
- 观察事件：同一消息正文哈希变化后，阶段缓存会失效，但旧正文已写入的事实和表格字段不会自动删除；新提取成功后会形成新旧事实叠加。
- 修改：`FactRecord` 增加 `sourceMessageKey`；同一消息的新提取成功时先删除该消息旧事实，再加入新事实；九张表的模型行由完整事实账本确定性重建，人工行和锁定行保留。ChatDocument schema 提升为 3。
- 新固定事实：FACT-DATA-006。
- 验证：smoke、相对导入和 TypeScript 转译语法检查；编辑/Swipe 的实际数据替换仍待实机清单验证。
- 实机状态：未运行。

## EVT-20260726-011｜旧事实替换的最小回归测试

- 触发固定事实：FACT-DATA-006、FACT-TEST-001。
- 观察事件：正文编辑/Swipe 后旧事实残留是本轮新修复的高风险点，仅检查文件存在无法证明投影替换规则运行正确。
- 修改：增加一个无测试框架的 reducer smoke，模拟同一消息由“红衣”改为“蓝衣”，并验证旧事实消失、其他消息事实仍保留、人工锁定行不被覆盖、时空模型行保持单例。
- 新固定事实：FACT-TEST-003。
- 验证：`scripts/reducer-smoke.mjs` 在当前 Node 22 + TypeScript 5.8.3 环境通过（旧事实替换、人工锁定、时空单例）。
- 实机状态：不适用；该测试只验证纯 reducer，不替代 SillyTavern。

---

## 后续事件模板

```md
## EVT-YYYYMMDD-NNN｜事件标题
- 触发固定事实：FACT-...
- 观察事件：真实错误、日志或用户行为。
- 修改：最小修改范围和文件。
- 新固定事实：FACT-...（没有则写“无”）。
- 验证：smoke / typecheck / build / 实机步骤与证据。
- 实机状态：未运行 / 通过 / 失败。
```

## EVT-20260726-012｜生成可安装实机候选

- 触发固定事实：FACT-ARCH-002、FACT-BUILD-001、FACT-BUILD-002、FACT-TEST-001，以及用户要求继续到实机安装阶段。
- 观察事件：本地 npm registry 持续返回 HTTP 503；公共 npm 域名无法解析；GitHub App 对独立构建分支和临时内容写入均返回 HTTP 403；当前容器也无法解析 `esm.sh`，因此既不能本地 Webpack、远程 Actions 构建，也不能在本容器验证远程运行依赖。
- 修改：保留 React、Redux Toolkit、Zod、p-queue 等成熟依赖，不重写替代品；新增 TypeScript 浏览器 ESM 构建器，生成本地生命周期 `dist/index.js` 和 32 个 `dist/runtime` 模块；所有外部依赖锁定精确版本。入口只动态加载 runtime，依赖加载失败时在 SillyTavern 设置区显示明确错误。增加 install smoke 检查生命周期导出、目录、版本、输出语法与导入映射。
- 新固定事实：FACT-BUILD-003、FACT-BUILD-004、FACT-TEST-004。
- 验证：源码 smoke 通过；reducer smoke 通过；浏览器 ESM 构建成功；33 个输出 JavaScript 文件语法检查通过；本地生命周期入口导入及 disable/delete 空载调用通过；ZIP 完整性待最终打包检查。
- 实机状态：未运行。该事件只把源码候选推进为可安装候选，不能标记为 SillyTavern 实机通过。

## EVT-20260726-013｜双来源运行回退与实机诊断

- 触发固定事实：FACT-BUILD-004、FACT-TEST-004，以及上一候选只有 `esm.sh` 单一运行依赖来源的实机阻断风险。
- 观察事件：`2.0.0-alpha.3-installable.1` 的业务源码与安装入口检查通过，但任何 `esm.sh` 网络或 CSP 故障都会直接阻断整个扩展；同时实机反馈只能依赖截图和人工描述，难以固定宿主能力、聊天键与阶段状态。
- 修改：生成 `esm.sh` 与 `jsDelivr +esm` 两套相互独立的 runtime 树，本地 loader 按固定顺序回退并聚合显示错误；新增无正文诊断 JSON；新增宿主契约 smoke，模拟官方上下文的事件注册/清理、稳定聊天键、消息键补写、正文与当前 Swipe 回写、聊天切换后的旧 token 拒绝。
- 新固定事实：FACT-BUILD-005、FACT-TEST-005、FACT-DIAG-001。
- 验证：`npm run verify:installable` 实际通过；源码 smoke 34 个生产文件通过；reducer smoke 通过；构建两套各 33 个 runtime 模块；host contract smoke 通过；install smoke 对 67 个输出 JavaScript、双来源 loader、版本、生命周期、目录和导入映射检查通过。当前容器对两个 CDN 均无法完成 DNS 解析，因此没有记录为目标浏览器连通性通过。
- 实机状态：未运行。模拟宿主回归和安装检查不替代真实 SillyTavern。
