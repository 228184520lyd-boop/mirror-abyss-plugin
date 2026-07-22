# 镜渊运行工作流收拢路线

目标：保留现有事实语义、对象身份、生命周期、总结规则和 SillyTavern 接口，只收拢“任务进行到哪里、结果如何提交、后续效果如何执行”。

## 不在本轮重构的内容

- 不修改状态提取、审核、修正和总结提示词。
- 不修改表格字段、对象准入、稳定 ID、事实合并和条目结算规则。
- 不修改 SillyTavern 正文生成、事件挂接、世界书格式和召回机制。
- 不引入服务器、微服务、完整 Event Sourcing 或通用规则引擎。

## 阶段 1：统一历史工作流权威（1.3.12，已完成）

新增 `src/workflow/history-workflow.ts`。

统一负责：

- 历史失效；
- 重算起点；
- 核心重建检查点；
- 总结恢复阶段；
- 世界书发布阶段；
- failed / partial；
- 页面刷新中断；
- 最终解除历史锁。

底层暂时继续使用 `historyInvalidation / historyRecovery`，外围业务只能通过工作流接口读写。

验收：原历史恢复、续跑、ABA、世界书发布和诊断行为不变。

## 阶段 2：统一提交协调器

新增 `src/pipeline/commit-coordinator.ts`，先接管现有保存顺序，不改变数据结构。

固定三个提交入口：

```text
commitCoreTransaction
commitSummaryTransaction
commitPublishReceipt
```

统一执行：

```text
聊天快照守卫
→ history revision 守卫
→ task generation 守卫
→ 正文 fingerprint 守卫
→ 不变量检查
→ 保存 Artifact / ChatState
→ 通知 UI
```

验收：metadata 保存失败、聊天切换、迟到响应和历史恢复检查点测试保持通过。

## 阶段 3：总结改为纯事务结果

`pipeline/summary.ts` 不再自行分散保存和手动恢复多份副本，只负责：

```text
输入已确认事实与快照
→ 返回完整 SummaryTransactionResult
```

由提交协调器一次落盘。

验收：小总结消费、大总结固化、事件局部结算、失败不回滚核心状态。

## 阶段 4：持久化 Effect Outbox

新增：

```text
pendingEffects
EffectPlanner
EffectRunner
```

效果类型先限定为：

```text
small-summary
large-summary
lorebook-sync
```

核心状态提交后只登记待办；执行器按 revision 顺序排空。页面刷新后从待办恢复，TaskQueue 只负责当前运行顺序。

替换 `queueAutomaticDerived()` 的嵌套 Promise 链和分散取消分支。

验收：新正文抢占旧自动总结、总结失败后世界书策略、刷新恢复、无幽灵任务。

## 阶段 5：物理存储收拢

在前四阶段稳定后，才将：

```text
historyInvalidation + historyRecovery
```

物理合并为：

```text
workflow
```

并将聊天级 summary / sync 状态从 MessageArtifact 中移出，Artifact 只保留 audit / revision / state。UI 通过 ChatState、Artifact 和运行队列派生显示状态。

由于当前只有测试存档，可直接提升 schemaVersion，旧镜渊数据允许清除后从正文重建；不删除玩家和角色正文。

## 阶段 6：删除旧分支并做玩家链验证

删除兼容访问、旧字段写入和旧派生链。执行：

- 全部自动测试；
- 3–4 秒模型延迟玩家链；
- 504、格式错误、保存失败；
- A → B → A 聊天切换；
- 历史编辑、Swipe、删除和失败续跑；
- 刷新后待办恢复；
- 世界书保存回读与旧缓存回写。

## 最终职责

```text
memory-state-machine.ts       记忆内容如何变化
history-workflow.ts           历史流程如何转移
commit-coordinator.ts         结果如何安全提交
effect-planner.ts             提交后需要哪些派生工作
effect-runner.ts              执行下一项持久待办
task-queue.ts                 当前运行顺序与取消
pipeline.ts                   连接各模块，不保存第二套规则
```
