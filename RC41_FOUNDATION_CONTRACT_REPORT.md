# rc.41 基础设施契约差分审计报告

版本：`1.2.0-rc.41`  
流水线：`ma-pipeline-43`

## 范围

本轮不改变镜渊的表格、记忆漏斗、审核规则、总结规则或世界书布局。审计只针对请求队列、取消、Schema 回退、阶段状态、世界书写入锁和 ChatState 持久化等基础模块，并以成熟 Promise 队列、分类重试、严格 JSON 校验和显式状态机的不变量作为对照。

## 已修复的九组基础问题

### 1. 请求执行函数同步抛错会卡死 lane

旧调度器在调用 `job.work()` 时若同步抛错，异常会越过任务 Promise，`active` 无法在正常 finally 中释放。后续同 lane 请求会永久等待。

修复：统一通过 Promise 微任务调用执行函数，使同步 throw 与异步 reject 进入同一失败和释放路径。

### 2. 通用 structured fallback 依赖修复模型后仍写入 Schema 绕过缓存

修复模型只能证明本次内容可挽救，不能证明 plain 输出稳定。旧逻辑会因此让下一次请求跳过严格 Schema。

修复：只有原始 fallback 自身完成解析、归一化和本地业务校验后，才允许提交具体 Schema 拒绝缓存。

### 3. 审核遇到 5xx、超时等传输故障仍追加 plain 请求

无 Schema fallback 是结构化兼容路径，不是网络重试策略。旧审核链会把上游故障扩大为第二次同等请求。

修复：只有明确 Schema 兼容拒绝才执行一次 plain fallback；5xx、超时、鉴权、限流和取消直接结束。

### 4. 审核 fallback 依赖修复模型后仍写入 Schema 绕过缓存

修复：与状态结构化链统一，修复模型产物不再提交审核 Schema 拒绝缓存。

### 5. 阶段重新排队或直接阻断会继承上一轮时间与错误

旧 `markStage` 在 `success → queued → blocked` 等路径上可能保留旧 `startedAt` 或旧错误，造成 UI 和诊断把未执行的新阶段显示成旧执行延续。

修复：进入 queued/idle 时清理执行时间；未运行即 blocked/skipped 不继承旧开始时间；attempts 只在真正进入 running 时增加。

### 6. 禁用和运行时重置没有给 active 任务留下明确取消意图

旧逻辑只递增 generation 并取消 pending。active 虽会在提交守卫处失败，但任务诊断可能缺少 `cancelReason/cancelRequestedAt`。

修复：禁用和 resetRuntime 都显式标记 active 取消；pending 与 active 使用同一取消元数据语义。

### 7. 取消与上游错误竞态会把 cancelled 改写成 failed

active 已被聊天切换或禁用明确取消后，底层请求若先以 502/504 拒绝，旧任务终态会变成 failed。

修复：明确取消意图优先决定任务终态；原始上游错误仍保留在请求诊断，不覆盖任务的取消原因。

### 8. 插件重启会清空仍在执行的世界书物理写入锁

旧 `resetLorebookRuntime()` 清空锁表，但旧保存请求不会因此停止。重启后的新同步可能与旧请求并发写同一本世界书。

修复：重启只重置模块句柄，不清除仍在执行的物理保存 Promise 链；锁在旧写入真正结束后正常释放。

### 9. ChatState 未提交修改与保存失败会污染规范 metadata

旧 `getChatState` 可能直接返回 metadata 中的活对象，调用方未执行 `putChatState` 的修改也会泄漏。`putChatState` 或 `clearAllStorage` 保存失败时，内存 metadata 还可能保留“已写入/已清空”的假状态。

修复：

- 读取始终返回独立 JSON 工作副本，兼容 SillyTavern/插件提供的 Proxy 包装对象；
- `putChatState` 成功后才确认规范状态，物理保存失败则恢复旧 state 与 updatedAt；
- `clearAllStorage` 保存失败则恢复旧 state、lorebookName 与 updatedAt；
- 若物理保存已完成、仅因随后聊天切换触发提交守卫拒绝，不进行反向回滚，避免制造内存/磁盘分歧。

## 未修改内容

- `MirrorAbyssStateOperationsV37`；
- 状态最大输出和提示词；
- 连接 business/diagnostic 双通道；
- 表格注册表和对象字段；
- 小总结、大总结和记忆漏斗；
- 世界书条目结构、焦点 constant 和召回模式；
- 历史恢复权限边界。

## 回归覆盖

新增 `tests/rc41-foundation-contracts.ts`，并更新现有审核、持久化和世界书事务测试，覆盖：

- 同步 throw 后 lane 正常释放；
- repaired fallback 不写 Schema 绕过缓存；
- 审核 5xx 不发送 plain 第二请求；
- queued/blocked 不继承旧时间；
- pending/active 取消元数据完整；
- 取消与 502 竞态保持 cancelled；
- 重启期间同一本世界书最大并发保存数仍为 1；
- Proxy ChatState 可读取为独立副本；
- metadata 保存与清空失败完整回滚。

完整 `npm run verify`、20 步模拟玩家流程、TypeScript 检查、浏览器构建和语法检查均通过。
