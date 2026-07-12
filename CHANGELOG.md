# Changelog

## 1.1.0-alpha.9.7 — Summary Consistency / Phase 5 Candidate

- Added a deterministic per-file Node test runner that exits after all file summaries, preventing open test handles from stalling release validation.

- 将消息稳定身份与内容 revision 指纹分离；编辑、swipe、继续生成时保留逻辑消息身份但更新 revision key。
- 根据消息 revision → 小总结 → 大总结依赖链递归废弃旧派生数据，修复撤回/修正正文后错误事实继续污染长期记忆的问题。
- 删除消息、删除 swipe、编辑、swipe、MESSAGE_UPDATED 与分支差异统一进入历史重建通道。
- 新增持久 `HistoryRebuildRecord`，重建中断会进入 failed 并阻止后续总结/世界书写入；启动、切换聊天、诊断页和公开 recovery API 均可恢复。
- 历史重放按聊天取得跨标签租约，取消旧任务与连接；重放期间延迟世界书同步，只发布最后一个重建快照。
- 诊断页新增“总结依赖一致性”检查及“恢复总结依赖”入口。
- 新增编辑、删除、swipe、分支、重建中断/恢复、无变化更新过滤和 SillyTavern MESSAGE_UPDATED/MESSAGE_SWIPE_DELETED 事件回归；总计 72/72。
- 新增 `docs/PHASE5_ACCEPTANCE.md`，版本进入真实 SillyTavern 实机验收候选阶段，仍不标记 stable。

## 1.1.0-alpha.9.6 — Foundation Correction

- 以 SillyTavern 官方 `accountStorage` 和聊天元数据接口为账户/可移植状态边界，不新增猜测性的账户 API。
- TaskQueue 所有取消、过期、失败和成功路径统一 finalize；排队取消不再残留 `inFlight`，同一任务键可重新提交。
- 模型阶段失败改为抛出携带 artifact 的 `PipelineStageError`，队列、诊断和恢复器统一记录真实 `failed` 终态。
- 本地数据库按匿名账户实例 ID 分命名空间；缺少 `accountStorage` 时仅会话内降级，不再使用 origin-wide 持久回退。
- 聊天主键改为 `accountKey + persistent chatInstanceId`；角色排序、角色/聊天改名不改变主键，`CHAT_CREATED`/`GROUP_CHAT_CREATED` 明确轮换身份。
- ChatState 增加版本化聊天元数据副本，本地数据库缺失时可恢复总结、processed keys 和同步状态。
- 审核隔离锁记录控件精确原状态和所有权，只恢复镜渊自己取得的锁，不覆盖酒馆或其他扩展的禁用状态。
- 清理依赖反转：领域层移除宿主上下文，Repository 不再隐式读取当前聊天，LLM 不再反向依赖 Pipeline。
- 把 SillyTavern 世界书 HTTP、事件与编辑器刷新适配移入 `integrations/sillytavern-worldinfo.ts`，保留原 Outbox 事务。
- 加入 ESLint、依赖边界检查、发布契约测试；生产构建不再生成或分发 `index.js.map`。
- manifest 最低 SillyTavern 版本提升至 1.17.0，package/manifest/运行时版本统一为 1.1.0-alpha.9.6。
- 修正 Memory Books 上游仓库记录，不再声称无法复核的提交 SHA；外部插件仍只作为行为/架构参考。
- 新增任务终态、账户隔离、聊天身份事件、可移植状态、锁所有权、发布契约等回归；自动测试增至 68/68。

## 1.1.0-alpha.9.5 — Phase 4 Architecture Repair

- 补回源码包遗漏的 `tsconfig.json`，`npm run check` 现在可在发布源码中真实复现严格 TypeScript 检查。
- 重构扩展启用/禁用生命周期：禁用时取消启动计时器、任务与连接请求，卸载宿主事件、Router 订阅、消息面板、工作区、设置面板、顶部按钮、全局 API 与生成拦截器；重新启用只恢复一套监听器。
- 聊天主键不再使用可变 `characterId` 列表索引，改为稳定角色标识/群组标识与真实聊天 ID；读取聊天作用域不再隐式写入新聊天元数据。
- 增加 Phase 4 旧聊天键别名迁移：复制 ChatState、artifact、任务、Outbox、本地提交、日志与备份到稳定键，旧来源保留用于回滚。
- TaskQueue 从全局单 tail 改为按聊天 lane 排队；同聊天保持顺序，不同聊天可并行，连接层限流继续由 Connection Broker 负责。
- 正常管线把多阶段 artifact 更新合并为回合末一次完整聊天保存；LocalCommit 在最终聊天保存后确认消息附着，崩溃恢复路径仍可独立补齐。
- 设置模板增加真实内置降级版本，不依赖 `renderExtensionTemplateAsync` 也能挂载基本控制入口。
- 新增生命周期、稳定聊天身份、旧键迁移、按聊天任务 lane、保存合并和模板降级回归测试；自动测试增至 59/59。
- 100 回合状态提取模拟从 500 次完整聊天保存降为 100 次；30 回合审核＋状态＋总结＋世界书全链保持 30 次保存、全部 Outbox/LocalCommit committed。

## 1.1.0-alpha.9.4 — Foundation Kernel Phase 4

- 复核 Phase 3 并保留已通过的 Chat Scope、Connection Broker 和 Worldbook Outbox；新增复核报告 `docs/PHASE3_AUDIT.md`。
- 新增 CrossTabCoordinator：优先使用 Web Locks，同源不支持时降级为带 token、TTL、心跳和 fencing 的 localStorage 租约。
- Foundation Kernel 每次重新启动创建新的协调器实例，避免扩展删除/重载后复用已停止的 channel 与租约状态。
- 世界书提交按 `worldinfo:<bookName>` 取得跨标签独占协调，同时继续执行 Phase 3 的服务器基线指纹与回读校验。
- 小总结与大总结按 `summary:<chatKey>` 串行；artifact 与 ChatState 改为持久 LocalCommitRecord 双对象提交。
- 页面在 artifact/ChatState 两次写入之间退出时，启动或切回聊天可依据 before/after 指纹补齐；未知第三状态进入 conflict，不静默覆盖。
- 从用户提供的 alpha.6/alpha.7 部署 source map 提取真实旧数据库、键前缀、聊天键和消息 extra 结构，建立 preview → backup → conservative import 迁移链。
- 迁移按 `migration:<chatKey>` 取得跨标签锁；消息、元数据和 ChatState 均持久化并回读后才写入 migrationVersion 完成标记。
- 兼容 `mirrorAbyssV11` 旧 artifact、`mirrorAbyss.tableSnapshot` 更早快照、旧 ChatState、设置与聊天元数据；迁移不删除旧来源。
- 诊断页新增恢复包导出、已完成历史清理、世界书冲突取消/按最新状态重试、本地提交冲突取消。
- 操作日志改为 best-effort，日志配额或 IndexedDB 异常不会反向导致已完成事务失败。
- 重置流程保留未解决本地提交、Outbox 和迁移备份。
- 新增跨标签租约、本地崩溃恢复和旧版迁移测试；自动断言由 48 项增至 52 项。

## 1.1.0-alpha.9.3 — Foundation Kernel Phase 3

- 将世界书同步替换为持久 Outbox 事务：`prepared → committing → verify_pending → committed`，并记录回滚、冲突和取消状态。
- 所有世界书 GET/EDIT 请求贯穿任务 `AbortSignal`；写请求发出前取消即终止，发出后中断按未知结果回读恢复。
- 以捕获的聊天 `chatKey + scopeRevision` 约束整条发布链，修复读取与保存之间切换聊天导致的新聊天元数据污染。
- 使用每世界书锁和托管条目基线指纹进行乐观并发控制；检测到外部变化时拒绝覆盖。
- 服务器回读逐字段校验内容、关键词、常驻/向量设置、排序、托管集合、事务 ID 与 intent key。
- 同一已提交 intent 幂等重放，不重复调用世界书编辑接口，也不允许迟到旧快照覆盖较新状态。
- 写入成功但聊天元数据提交失败时，恢复实时元数据并条件回滚；回滚只恢复本聊天的镜渊托管条目，保留共享世界书中的无关条目。
- 页面启动和聊天切换后自动恢复未完成事务；已取消和冲突事务不会自动重放。
- alpha.7 旧托管条目按目标 key 选择性认领，补充聊天所有权和事务标记；未匹配旧条目不删除。
- 重置游戏若世界书结果未确认，会保留 Outbox 供恢复，不再把唯一恢复记录随缓存一起清除。
- 诊断报告增加 Outbox 状态、尝试次数、错误和冲突摘要；世界书页显示最近事务状态。
- 新增 10 个 Phase 3 故障注入场景；总自动断言测试由 37 项增至 48 项。

## 1.1.0-alpha.9.2 — Foundation Kernel Phase 2

- 保留 Phase 1 与全部既有镜渊领域/产品模块，在三种模型适配器上增加统一 Connection Broker。
- 当前连接、ST Connection Profile、镜渊独立 API 使用稳定 connection key 和统一请求入口。
- 同一连接默认 FIFO 单并发，不同连接允许并行，避免共享上游被多个任务同时压满。
- TaskQueue 增加任务级 AbortController；信号贯穿审核、修正、结构化修复、状态表、总结和连接适配器。
- 聊天切换、扩展禁用、内核停止和工作台取消都会主动中止旧任务及连接请求。
- Broker 统一请求超时；只对 rate_limit、network、upstream 做有界重试，支持 Retry-After、指数退避和抖动。
- 增加按连接熔断与半开恢复，避免持续故障造成请求风暴。
- 统一连接错误分类，并在诊断报告中加入活动请求、排队与熔断状态。
- 强化 stale-result gate：消息副作用前核对聊天作用域；延迟调度捕获原始作用域。
- 工作台任务队列为 queued/running 任务增加取消按钮。
- 新增 5 项 Connection Broker 故障注入测试；自动测试由 32 项增至 37 项。
- 将 `happy-dom` 从 17.6.3 升级到 20.10.6；当前 `npm audit` 为 0 个已知漏洞。
- 新增 `research/` 源码供应链记录、许可证矩阵、架构比较和 ADR。

## 1.1.0-alpha.9 — Foundation Kernel Phase 1

- 新增 Service Container、Capability Registry、Event Router、Chat Scope Manager 和 Lock Manager。
- 业务事件统一通过 Event Router，不再由管线和 UI 各自重复监听酒馆原始事件。
- 持久聊天键以 SillyTavern 真实聊天 ID 为权威；同角色不同聊天不再依赖角色名或临时 UUID 区分。
- 未保存聊天的数据只保存在内存，关闭或切换后不进入持久缓存。
- 兼容读取 alpha.8 旧聊天键，并在访问时迁移到新聊天键。
- 任务新增持久化记录与 scopeRevision；聊天切换后旧任务标记 stale，结果不得写入新聊天。
- 页面重载后将遗留的 queued/running 任务安全标记为 stale。
- 诊断面板新增 Foundation Kernel、聊天作用域和持久任务检查。
- 保留 alpha.8 的审核、修正、表格、总结、独立 API、世界书和图谱功能。
