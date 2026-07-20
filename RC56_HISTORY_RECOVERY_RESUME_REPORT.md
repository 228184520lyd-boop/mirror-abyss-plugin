# rc.56 历史重建断点续跑报告

## 问题

历史累计重建中，前缀消息已经成功提交；中间消息失败后，`historyRecovery` 正确记录了 `currentIndex` 和 `completedCount`。但再次点击“继续重建”时，旧实现重新初始化为 `completedCount: 0`，并从 `historyInvalidation.startIndex` 重建全部消息，导致已成功前缀重复调用模型。

## 修复

- 恢复入口读取现有 `historyRecovery`。
- `failed/rebuilding-core` 阶段按 `currentIndex` 定位恢复后缀。
- 已完成数量由该消息在当前可处理序列中的位置确定。
- 前缀 artifact 的消息键加入本轮恢复集合，但不重新执行状态提取。
- `rebuilding-derived/publishing-lorebook/partial` 阶段直接跳过核心重建。
- 新的历史变化仍按原逻辑清除旧检查点。

## 验证

专项模拟三条 AI 正文：第一次调用第一条成功、第二条失败；第二次继续仅调用第二条和第三条。总调用次数为 4，旧错误行为会达到 5。第一条 artifact 的 `turnSummary` 保持首次结果。原有历史事务、世界书提交、恢复竞态、智能重建、链路缩短及 rc.55 总结队列回归均通过。
