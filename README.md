# Mirror Abyss / 镜渊 1.1.0-alpha.9.7

这是 Summary Consistency 修复版，也是 Phase 5 真实 SillyTavern 验收候选。它保留 `alpha.9.6` 的 Connection Broker、任务终态、账户/聊天隔离、世界书 Outbox、跨标签协调、本地提交日志、旧数据迁移和镜渊领域逻辑，并修复“已总结消息在编辑、删除、swipe 或分支变化后，旧事实仍留在长期记忆”的一致性问题。

本次继续遵循“证据先行、最小修复”：消息事件以 SillyTavern 官方事件为准；总结与消息绑定、编辑/swipe/继续生成后的重新总结行为参考成熟 AGPL 总结插件的公开设计；没有复制外部插件的提示词、界面、CSS 或产品命名。

## alpha.9.7 主要修复

- 消息身份拆分为稳定逻辑身份与内容 revision 指纹；文本或 swipe 变化只更换 revision key。
- 建立 `消息 revision → 小总结 → 大总结` 依赖链失效：受影响的小总结被删除，依赖它的大总结后缀同步废弃。
- 编辑、删除、swipe、删除 swipe、继续生成/更新和分支差异统一进入历史重建通道。
- 重建从最早受影响位置向后按顺序重放状态和总结；重放期间不逐条写世界书，只在最后发布最新快照。
- 增加持久 `HistoryRebuildRecord`。中断或失败会保留可恢复状态，并阻止旧/新派生数据继续混合。
- 启动和切换聊天会自动恢复未完成重建；诊断页和 `MirrorAbyss.recovery.retryHistoryRebuild()` 提供人工恢复入口。
- 历史重建取得同聊天跨标签租约，开始前取消旧聊天任务和连接请求。
- 对 `MESSAGE_UPDATED` 增加 revision 对比；SillyTavern 编辑完成后的重复更新事件或非正文刷新不会再次触发重建。
- 新增 Phase 5 实机验收清单：`docs/PHASE5_ACCEPTANCE.md`。

## 已保留的可靠机制

- 三种模型连接适配器与 Connection Broker；
- 取消、超时、429 退避、熔断和按连接限流；
- 按聊天任务 lane 与真实任务终态；
- 稳定聊天身份、账户命名空间和可移植 ChatState；
- 世界书 Outbox、服务器回读、乐观冲突与条件回滚；
- Web Locks / localStorage 降级跨标签协调；
- LocalCommit 双对象崩溃恢复；
- alpha.6/alpha.7 旧数据预览、备份和保守迁移；
- 审核、定向修正、状态表、总结、沉降、图谱和世界书领域逻辑。

## 安装

将部署包内容放入现有 `mirror-abyss-plugin` 扩展目录，更新扩展后完全刷新 SillyTavern 页面。不要同时启用两个镜渊版本。

最低 SillyTavern 版本：`1.17.0`。

升级长期存档前，应先备份 SillyTavern 数据、聊天文件和相关世界书。`alpha.9.7` 仍是实机验收候选，不是稳定版。

## 验证

源码包中执行：

```bash
npm ci
npm test
npm run validate
npm audit --audit-level=low
```

`npm test` 运行 72 项功能/故障断言；`npm run validate` 运行严格 TypeScript、依赖边界、ESLint、生产构建和产物语法检查。详细结果见 `VALIDATION.md`。

## Phase 5

本版本已经进入真实 SillyTavern 验收阶段，不再继续增加功能。实机验收覆盖：

- 从公开 alpha.7 原位升级；
- install/update/enable/disable/delete 生命周期；
- 当前连接、Connection Profile 和独立 API；
- 编辑/删除/swipe/分支后的总结重建；
- 真实世界书断网、回读、冲突和双标签竞争；
- 移动端后台休眠、页面回收和网络切换；
- 100 回合以上长期运行与元数据体积。

完整步骤见 `docs/PHASE5_ACCEPTANCE.md`。

## 当前风险边界

- 尚未在用户真实 SillyTavern 安装中完成 alpha.7 原位升级；
- 尚未验证移动端后台冻结和浏览器页面回收；
- 多设备写同一世界书仍依赖服务器回读与乐观冲突，不是分布式共识；
- Web Locks 不可用时的 localStorage 租约属于 advisory lease；
- 可移植 ChatState 会增加聊天元数据体积，需在长存档实机测试中监测；
- `pipeline/lorebook.ts` 与 `ui/workspace.ts` 仍较大，只能继续在测试保护下拆分。

## 文档

- `docs/SUMMARY_CONSISTENCY_ALPHA9_7.md`
- `docs/PHASE5_ACCEPTANCE.md`
- `docs/FOUNDATION_CORRECTION_ALPHA9_6.md`
- `docs/REFERENCE_MATRIX.md`
- `docs/ROADMAP.md`
- `research/`
- `VALIDATION.md`
