# 1.1.0-alpha.10.7.11 validation

- `node --test tests/stream-fallback-regression.mjs`: 7/7 test blocks passed, covering all eight requested fallback cases plus structural generator codes and cumulative `text` aggregation.
- `node --check index.js`, ES Module import smoke test and `git diff --check`: passed.
- Manifest, runtime and `BUILD_INFO.json` agree on `1.1.0-alpha.10.7.11`; the only non-stream fallback send path occurs once.
- The stale `index.js.map` does not contain the current stream classifier or wait telemetry and cannot be faithfully regenerated from this recovered deploy bundle; deployment archives exclude it.
- `ma-pipeline-10.7.4`, Profile two-slot cap, one derived slot, same-chat serialization, priority scheduling, diagnostics and memory protocols remain unchanged.
- SillyTavern mobile streaming/non-stream compatibility and provider billing behavior still require device verification.

# 1.1.0-alpha.10.7.10 validation

- `node --check index.js` and ES Module import smoke test passed.
- Manifest, runtime and `BUILD_INFO.json` versions agree; pipeline remains `ma-pipeline-10.7.4`.
- Dynamic transport test passed: foreground/critical priority, two-slot Profile cap, one derived slot, same-chat serialization, queued abort, failure release and final lane cleanup.
- Dynamic stream test passed: cumulative stream aggregation, exactly one compatibility fallback before first data, and no retry after stream data arrives.
- All `sendRequest`, `generateRaw`, `withNativeProfileTransport`, `laneKey` and summary dispatch call sites were reviewed.
- Task Center and diagnostic export expose queue, transport, first-data, complete-response, parse, persistence, metadata-save and lorebook-wait timing without prompts, responses or credentials.
- Real provider concurrency, mobile background behavior, SSE proxy compatibility and observed latency improvement still require SillyTavern device validation.

# 1.1.0-alpha.10.7.8 validation

- ES Module syntax and import smoke test.
- No `/profile` command or assignment to Connection Manager selected profile.
- Named Profile calls use frozen `profileId` with `ConnectionManagerRequestService.sendRequest`.
- Profile route fingerprint mismatch blocks queued requests.
- Per-profile request lanes permit different profile IDs to progress independently.
- Dual-channel diagnostics classify current/Profile route outcomes without automatic fallback.
- Manifest, runtime version and build metadata are consistent.
- Deployment ZIP integrity and SHA-256 generated.

# alpha.10.7.5 validation

- JavaScript classic syntax check: passed.
- ES Module parse/import smoke test: passed.
- History rebuild preflight occurs before `prepareHistoryRebuild`: passed.
- HTML/preflight failure preserves existing memory via `nonDestructive` waiting state: passed.
- Audit/admission executes before history-memory gate: passed.
- Verified connection snapshot is passed to raw history fact batches: passed.
- Deferred admitted messages are automatically re-enqueued after successful rebuild: passed.
- Manifest/index/build version agreement: passed.

# Validation — 1.1.0-alpha.10.7.4.2

执行日期：2026-07-14

## 结果

部署产物级语法、版本与结构检查通过。

事件记忆原有检查保持通过；另执行上游 HTML 诊断专项测试。

## 已执行检查

### 上游 HTML 错误页专项

- `Unexpected token '<'` 与 `not valid JSON` 可在进入事实协议解析前识别为 `upstream_html`。
- 指定 Connection Profile 的名称、API 类型和模型名会进入诊断；不输出密钥。
- 404 页面识别为 Base URL/接口路径问题。
- 401/403 页面识别为鉴权或会话问题。
- 502/503/504 页面识别为网关或上游暂时不可用。
- HTML 页面标题或 H1 可被提取为短预览，不回显整页 HTML。
- 外层错误会抑制底层 JSON 解析 cause，避免重复且难读的错误链。
- 非 5xx HTML 配置故障不会触发历史批次自动重试；502/503/504 保留重试能力。

### 代码与版本

- `node --check index.js` 语法通过。
- `manifest.json` 可解析。
- manifest、运行时版本和管线版本一致。
- 部署包必需文件、许可证、第三方说明、README、变更日志和架构契约齐全。

### 正文准入与严格来源链

- 审核关闭分支不包含审核模型调用，并写入显式 `bypass` 准入记录。
- 事实提取在模型调用前检查准入状态，模型返回后再次检查准入和正文指纹。
- 大总结提示词不接收原始正文或当前活跃表格。
- 长期候选优先从独立事件条目生成，而不是依赖整块阶段概览。

### 事件条目协议

已检查纯文本协议包含：

- 事件 ID、标题和确认事实；
- 参与者与地点；
- 发生时间和最后确认时间；
- 状态；
- 传播范围、已知者、渠道和误传；
- 痕迹与持续影响；
- 精度、重要度和独立注入方式；
- 来源表格行和来源事实。

协议中不存在下一次复核时间字段。

### 事件生命周期与沉降

动态测试覆盖：

1. 事件操作规范化；
2. 活跃高重要度事件允许常驻；
3. 没有新来源事实时，`fuzzy` 不得恢复为 `exact`；
4. 出现新的来源事实后允许重新确认精度；
5. `fuzzy` 和 `trace` 强制使用向量注入；
6. 有持续影响的事件不能被 remove 删除；
7. 低重要度、无影响的 `trace` 可安全删除；
8. 大总结可以把事件降为更低精度并改为向量注入；
9. 事件注册表可由小总结操作和大总结沉降操作完整重建。

### 总结事务与一致性

- 小总结保存 `eventOperations`。
- 大总结保存 `eventUpdates`。
- 小总结和大总结事务提交前都会重新计算事件注册表。
- 历史依赖失效时，删除受影响总结后重新计算事件注册表。
- 旧版本状态迁移完成后重新计算事件注册表。
- 世界书发布不再包含整块小总结条目。

### 条目级世界书发布

- 每个事件使用独立世界书文档键。
- 每个事件独立选择 `constant`、`keyword` 或 `vector`。
- 常驻模式受到重要度、活动状态和精度限制。
- 模糊和痕迹条目强制向量化。
- 基础设定、活跃表格和长期大总结保留原有发布逻辑。

### 前端与关系图谱

- 分层记忆页面显示事件数量、状态、精度、传播范围和注入方式。
- 任务阶段显示“表格 → 事件条目 → 大总结”。
- 关系图谱模块不调用模型、不写 ChatState、不写 Artifact、不同步世界书，也不修改正文。

## 尚需真实 SillyTavern 验证

上传内容仍是部署代码，不包含原始 TypeScript 工程、`package.json`、构建配置和完整自动测试目录。因此需要在实际 SillyTavern 中继续验证：

- 不同模型对新增纯文本事件协议的服从程度；
- 世界书向量扩展未启用时，向量条目的实际兼容表现；
- 多个事件在连续阶段中复用稳定 ID 的准确率；
- 快速连续生成、切换聊天和跨标签页时的事件事务冲突处理；
- 历史编辑、删除和 Swipe 后的真实世界书清理与重发；
- 移动端后台冻结、弱网、API 超时和页面刷新恢复；
- 长期存档从无事件注册表版本升级后的实际显示。

当前版本仍为 alpha，不应省略长期存档备份。

## alpha.10.7.2

已检查：JavaScript 语法、版本一致性、Profile 底层串行锁、测试连接快照、渲染合并刷新、世界书同步后 UI 刷新、焦点从人物表归位、手工锁定人物行保护、启动修复入口。

## alpha.10.7.3 UI health and retry validation

- `node --check index.js` passed.
- Version consistency passed for `index.js`, `manifest.json`, and `BUILD_INFO.json`.
- Diagnostic warning/error cards expose a matching recovery action.
- Failed admission/audit, revision, fact extraction, summary, sync, and history rebuild tasks expose a safe retry route when a source message is available.
- Message-panel retry controls enter a busy state immediately and catch rejected retry promises.
- Message panels subscribe to both pipeline artifacts and task-queue changes, and refresh when the window regains focus.
- UI diagnostics report expected/actual message panel counts, render backlog, workspace render state, and retry coverage.
- Multi-stage recovery restarts from the earliest failed stage instead of duplicating downstream work.
- Standardized button, card, badge, focus, and mobile styles were added without changing the existing tab/navigation structure.


## alpha.10.7.4 checks

- Lorebook server-readback fingerprint and entry-count persistence.
- Startup/chat-switch/focus verification recovery.
- Live task state overlay below assistant messages.
- Automatic processing idempotency guard.
- Event-ID continuity unique-match behavior.
- Explicit vector-unavailable keyword fallback.


## 10.7.4.1 启动顺序专项

- 启动主链在 `mountSettingsPanel` 前不再等待 `verifyLatestLorebookForCurrentChat`。
- 运行状态进入 `ready` 后才通过 `setTimeout` 启动后台世界书回读。
- 聊天切换恢复链不再等待服务器回读后才刷新 UI。
- 管线版本维持 `ma-pipeline-10.7.4`，防止热修复触发重复事实提取。


## alpha.10.7.4.2 module-load validation

- `index.js` copied to `.mjs` and parsed/imported as an ES Module.
- Checked for the former duplicate top-level `intersects` declaration.
- Verified manifest/runtime version consistency and unchanged pipeline version.


## Adaptive extraction checks

- Fact prompt budget is 18,000 characters.
- Single-turn transient/protocol retry helpers are present.
- Multi-turn failed batches split adaptively.
- History rebuild batch range is 4–10 with default 6.
- Previous active-table context is capped and prioritizes focus, foundations, protected rows, active rows and entities mentioned in the current turn.
- Stage facts, event registry, previous long-term records, summaries and candidates each have bounded prompt budgets.
- Small/large summaries retry transient failures and retry malformed tag protocols once.
- Non-gateway HTML remains non-retryable.

## 手动历史重建检查

- 默认设置 `autoHistoryRebuild=false`。
- 启动与聊天切换调用本地检测函数，不直接调用重建函数。
- 检测记录状态为 `detected`、`nonDestructive=true`。
- 手动按钮可从 `detected` 进入连接预检和正式重建。
- 开启自动开关后，编辑、删除、Swipe 可恢复旧版自动重建行为。
