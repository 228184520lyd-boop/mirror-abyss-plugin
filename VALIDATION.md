# 1.1.0-rc.3 validation

- 基线为本地 `1.1.0-rc.1` 稳定候选；独立分支 `product/memory-contract-v1-rc.2`，管线继续为 `ma-pipeline-10.7.4`，未合并 main、未上传服务器。
- 新增事件/长期候选的本批事实与变化行来源校验；缺失、旧或伪造 ID 在本地提交前失败并进入既有协议修正及小总结检查点恢复路径。
- 新增严格限长场景锚点、旧事件兼容标记、发布/回读/实际命中分离诊断和向量降级显示测试。
- manifest 自动更新已关闭，避免从落后的 GitHub `main` 覆盖本地候选版。
- `node --test tests/*.mjs`：60/60 通过；新增 7 项产品闭环测试，并保留协议、调度、95 事实长局、10 聊天 × 120 事实、恢复、Outbox 与本地提交回归。
- `node --check index.js`、最小浏览器桩 ES Module 导入、`git diff --check`、manifest/运行时/BUILD_INFO 版本和入口/CSS/settings 路径一致性：通过。
- 本地 HTTP 浏览器模拟及刷新重载均为 PASS：真实读取 manifest、BUILD_INFO、index、CSS 和 settings；验证伪造来源拒绝、场景锚点限长、向量降级和“实际命中未知”显示。
- ZIP 根目录、文件清单、无测试/无 `index.js.map`、压缩数据与 SHA-256 将在最终产物生成后记录到本地交付报告。
- 仍需云服务器真实 SillyTavern 验证逐轮世界书触发效果、Connection Profile/SSE、真实向量扩展、反向代理和长期旧存档升级；宿主不提供命中回执时无法声称某条事件已进入具体一轮正文请求。

# 1.1.0-rc.1 validation

- 基线为用户上传的 `1.1.0-alpha.10.7.15` 部署 ZIP；本地独立分支 `stabilize/1.1.0-rc.1`，未合并 main、未上传服务器。
- 模拟玩家覆盖：95 条结构化事实长局、12,000 字符/24 事实双预算、无变化本地消费、504 自适应二分、刷新队列冻结、普通游玩逐批排空、检查点分阶段续跑、旧 sourceKeys 兼容、批次账本幂等、取消与 stale 提交边界。
- `node --test tests/*.mjs`：25/25 通过；其中实际函数链模拟连续两个 15 回合阈值，共处理 30 条事实、10 个预算批次，所有 source IDs 按顺序且仅提交一次。
- `node --check index.js`、带最小浏览器启动桩的 ES Module 导入、`git diff --check`、版本/管线一致性、入口/CSS/settings 资源路径和无旧 source map 检查：通过。
- 最终安装 ZIP 根目录直接包含 13 个部署文件与 `manifest.json`，不包含测试目录和 `index.js.map`；SHA-256 记录在本地交付报告中。
- 仍需在云服务器真实 SillyTavern 中验证 Connection Profile 流式首数据、实际 504、浏览器刷新、跨标签切换和世界书服务器回读去重。

# 1.1.0-alpha.10.7.15 validation

- `node --test tests/*.mjs`: 43/43 通过；新增覆盖 95 条事实/约 36k 字符场景、12,000 字符与 24 事实双预算、全提示词计数、顺序保持、稳定批次键、无变化隔离、单事实超限前置失败、504 自适应拆分、普通网络有限重试、批次检查点续跑、取消保留队列和首数据 N/A。
- `node --check index.js`、ES Module 导入烟雾测试和 `git diff --check`：通过。
- `manifest.json`、运行时 `VERSION` 与 `BUILD_INFO.json` 一致为 `1.1.0-alpha.10.7.15`；`PIPELINE_VERSION` 保持 `ma-pipeline-10.7.4`。
- 搜索确认小总结模型入口使用 `transportMaxAttempts: 1`；504 拆分分支先于普通网络重试，拆分父批次不调用业务提交；每个子批次成功后立即保存检查点。
- 部署 ZIP 排除无法从恢复部署包可靠重建的旧 `index.js.map`，并排除测试文件；根目录直接包含 manifest、入口脚本、样式与扩展资源。
- SillyTavern 手机端真实 Connection Profile/当前聊天连接的 504 拆分、流式首数据、页面刷新续跑、世界书最终去重与消息 28 后续生成仍需实机验证。

# 1.1.0-alpha.10.7.14 validation

- `node --test tests/*.mjs`: 10/10 通过；覆盖精确 sourceKeys 事务续交、仅恢复元数据重基、其他状态漂移拒绝、冲突/取消不覆盖、缺失精确结果失败关闭、模型调用前恢复及提交错误注解。
- `node --check index.js` 与 ES Module 导入烟雾测试。
- `manifest.json`、运行时 `VERSION` 与 `BUILD_INFO.json` 一致为 `1.1.0-alpha.10.7.14`；管线保持 `ma-pipeline-10.7.4`。
- 小总结提示词仍只使用 `changedRows`、`affectedRows`、`contextAnchors`、相关事实和匹配事件，不发送完整 snapshot。
- `prepared`、`committing`、`committed` 小总结事务可在模型调用前续交；`conflict`、`cancelled` 不自动覆盖当前状态。
- 手机端 IndexedDB/portable bridge 写入中断、SillyTavern 页面刷新与真实恢复按钮流程仍需实机确认。

# 1.1.0-alpha.10.7.13 validation

- `node --test tests/*.mjs`: 32/32 test blocks passed。新增覆盖：物品持续携带 30 轮只记录首次获得、无变化技能/基础设定/事件不重复进入、物品数量变化、技能升级、语义指纹、阶段快照时间边界、无变化不调模型、失败精确来源续跑、表格检查点保留、沉降竞态防护、匹配事件最小化与世界书隔离。
- `node --check index.js`、ES Module 导入烟雾测试及 `git diff --check`：通过。
- `manifest.json`、运行时 `VERSION` 与 `BUILD_INFO.json` 一致为 `1.1.0-alpha.10.7.13`；管线仍为 `ma-pipeline-10.7.4`。
- 小总结提示词路径已搜索：不再调用完整 snapshot 格式化器，仅输出代码筛选的变化、直接操作、最小锚点和匹配事件。
- 小总结的结果提交仍在完整模型响应、协议解析、聊天作用域与沉降行安全校验之后；无变化记录不参与事件、大总结或世界书发布。
- 部署归档继续排除无法由当前恢复源码可靠重建的旧 `index.js.map`。
- 真实供应商返回属于输入过长、输出截断、标签协议不完整、空总结或本地提交冲突中的哪一类，仍需安装后通过任务卡的原始错误与 timing 实机确认。

# 1.1.0-alpha.10.7.12 validation

- `node --test tests/history-rebuild-resume-regression.mjs`: 6/6 test blocks passed，覆盖六阶段映射、失败批次回退、连接恢复、小/大总结分段续跑、最终同步跳过模型及包装错误透传。
- `node --test tests/stream-fallback-regression.mjs`: 7/7 test blocks passed，确认上一版本流式降级白名单未退化。
- `node --check index.js`、ES Module 导入烟雾测试及 `git diff --check`：通过。
- Manifest、运行时与 `BUILD_INFO.json` 版本一致；管线仍为 `ma-pipeline-10.7.4`。
- 部署归档继续排除无法由当前恢复源码可靠再生成的旧 `index.js.map`。
- 手机端真实失败状态识别、Connection Profile 错误显示及世界书服务器续跑仍需要 SillyTavern 实机验证。

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

## 已停用历史重建兼容检查

- `getSettings()` 强制 `autoHistoryRebuild=false`，旧设置不能重新开启。
- 启动与聊天切换只放弃遗留的 `detected`、`failed`、`paused` 或 `checkpoint-pending` 记录，不调用重建模型。
- 旧正文编辑、删除和 Swipe 只更新 `historyDependencyPolicy`，不阻塞事实、表格、总结或世界书流水线。
- 原先被历史依赖标记为 `blocked` 的阶段本地改为 `skipped`，不补跑旧消息。
- `launchHistoryRebuild()` 仅保留为不可达兼容代码；设置、任务中心、恢复界面和公开恢复 API 均不存在启动入口。
- 现有表格、小总结、大总结、事件条目、图谱输入、世界书与成功事务必须保持不变。
