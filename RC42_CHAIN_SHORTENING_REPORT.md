# Mirror Abyss 1.2.0-rc.42 链路收敛报告

流水线：`ma-pipeline-44`

## 1. 范围

本轮只处理可复现的业务链重复步骤，不修改：

- 审核、修正、状态、总结及世界书业务顺序；
- JSON Schema、提示词、表格和记忆数据结构；
- 核心状态先提交、派生失败不回滚的边界；
- chatKey、历史修订、任务代次和正文指纹守卫；
- TaskQueue 单 active 与请求 lane；
- 世界书物理书名单写者。

本轮没有把审核与状态合并为一次模型调用，也没有把小总结、大总结和世界书合成一个不可分割任务。

## 2. 对照基准

只对照成熟实现的行为契约，不移植其架构：

- SillyTavern 内置 memory 扩展：在产生真实消息变更后统一保存，事件/UI 绑定保持幂等；
- Qvink MessageSummarize：先判断消息是否达到处理条件，默认顺序执行，保存动作集中在真实记忆变更之后；
- p-queue：取消和优先级依赖显式任务元数据；不能通过任务 ID/字符串内容推断任务类别；
- 镜渊既有 CORE_REDUCTION_AUDIT：保留两层队列和提交守卫，收敛相邻聊天/metadata 保存、重复状态读取和 key 字符串分类。

## 3. 已复现问题与修复

### 3.1 主链相邻重复聊天保存

rc.41 正常合规正文：

```text
创建/绑定 artifact 保存
→ runAudit 内部保存
→ processMessage 审核检查点再保存
→ 状态结果保存
→ commitCoreState 再保存同一状态 artifact
→ 派生状态保存
```

实测桩计数：`6` 次 `saveChat`。

rc.42：

```text
审核结果检查点
→ 状态结果检查点
→ 派生 queued/skipped/blocked 检查点
```

实测桩计数：`3` 次 `saveChat`。

删除的步骤：

- 创建空壳 artifact 时的预保存；
- `runAudit()` 与调用者相邻的重复保存；
- `commitCoreState()` 对已经保存的状态 artifact 再保存一次。

### 3.2 修正链重复聊天保存

rc.41：合规修正链 `audit → revision → audit → state` 共 `8` 次 `saveChat`。

rc.42：保留以下五个真实检查点：

1. 初次审核失败；
2. 修正文原位替换；
3. 修正与复审终态；
4. 状态结果；
5. 派生阶段状态。

实测桩计数：`5` 次 `saveChat`。模型调用仍严格为：

```text
audit → revision → audit → state
```

### 3.3 核心提交后重复读取 ChatState

rc.41 在 `commitCoreState()` 保存 ChatState 后，`prepareDerivedStageStatuses()` 立即重新读取同一 ChatState。

rc.42 由核心提交返回已提交的 canonical ChatState，并直接传给派生资格判断。派生计划仍基于正式提交内容，不使用状态模型调用前的旧副本。

### 3.4 世界书同步重复读取 ChatState

rc.41 `syncLorebookOnce()` 已读取 ChatState 用于历史守卫，随后 `desiredSpecs()` 再读取一次。

rc.42 将同一已读取 ChatState 传入发布文档构建。世界书保存、回读、刷新后验证及物理写锁没有变化。

### 3.5 历史恢复进度双写

rc.41 每条正文：

```text
处理前写 currentIndex/completedCount
→ 核心状态提交
→ 处理后再次写 completedCount
```

两条历史正文的状态模型开始时，metadata 保存计数为 `[2, 5]`。

rc.42：

```text
恢复开始写一次
→ 每条正文正式完成后推进一次 completedCount，并同时指向下一条 currentIndex
```

两条历史正文的状态模型开始时，metadata 保存计数为 `[1, 3]`。失败时仍单独写入准确的 currentIndex、completedCount 和错误。

### 3.6 最新正文恢复双写

rc.41 最新正文状态成功后：

```text
先保存新核心状态，但保留 historyInvalidation
→ 下一步删除 historyInvalidation
→ 再保存一次 metadata
```

rc.42 在核心提交中一次性完成：

```text
新事实/状态 + latestSnapshotMessageKey + 解除最新正文历史暂停
```

metadata 保存由 `2` 次收敛为 `1` 次。删除位置未知、更早历史变化和 deleted 失效不会被提前解除。

### 3.7 派生任务取消依赖 key 字符串

rc.41 通过任务 key 是否包含 `:derived:` 判断派生任务，可能：

- 漏掉 key 格式变化后的真实自动总结；
- 误取消 key 文本偶然包含 `derived` 的核心任务。

rc.42 只按显式元数据判断：

```text
相同 chatKey
+ automatic === true
+ kind ∈ smallSummary / largeSummary / sync
```

人工总结、核心状态和审核任务不会被当成旧派生取消。

## 4. 没有缩短的必要链路

以下步骤经对照后明确保留：

- `TaskQueue` 与 `RequestLaneScheduler` 两层：连接测试不经过业务 TaskQueue，request lane 仍有独立职责；
- 审核与状态两个模型请求：输出契约、失败语义和内容审核职责不同；
- 修正后的复审：没有复审就无法证明修正文已合规；
- 小总结、大总结、世界书三个派生任务：需要独立失败、不同优先级和新正文插队；
- 状态调用前读取活跃事实：模型提示必须使用调用时最新事实；
- 世界书实际保存后的回读与编辑器真实刷新后的验证；
- 所有 chatKey、历史修订、任务代次和正文指纹守卫。

## 5. 自动验证

新增 `tests/rc42-chain-shortening.ts`，覆盖：

- 合规正文模型调用为 `audit → state`；
- 合规正文聊天保存 `6 → 3`；
- 修正正文模型调用为 `audit → revision → audit → state`；
- 修正正文聊天保存 `8 → 5`；
- 核心 ChatState 正常链只提交一次；
- 历史恢复不再在每条正文开始前重复写进度；
- 最新正文恢复核心状态与解除暂停只提交一次；
- 派生取消按显式 task kind/automatic，不按 key 字符串。

完整 `npm run verify` 通过，包含全部旧版本回归、20 步模拟、TypeScript 检查、浏览器构建与语法检查。

## 6. 实机验收重点

1. 普通合规正文：请求只应为 `audit schema → state schema`；同一 messageKey 不出现第二条等价 state。
2. 需要修正的正文：只应为 `audit → revision → audit → state`。
3. 最新正文编辑/swipe 后重新处理：状态成功后 history 直接恢复正常，sync 不应先残留 blocked 再依赖第二次 metadata 提交解除。
4. 两条历史正文重建：进度应单向 `0/2 → 1/2 → 2/2`，不倒退、不重复处理同一条。
5. 自动总结排队时生成新正文：只取消旧 automatic small/large/sync；不取消审核、状态和人工总结。
6. 世界书同步继续保持单写者、UID 不重复，派生失败不回滚核心状态。

真实 SillyTavern 与供应商行为仍以实机诊断和录屏为最终证据。
