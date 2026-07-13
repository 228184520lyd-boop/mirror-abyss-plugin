# Validation — 1.1.0-alpha.10.5.4 Cache-First Rebuild & Task UI

## 自动与工程验证

- 自动测试：100/100 通过。
- TypeScript strict：通过。
- 依赖边界检查：通过。
- ESLint：通过。
- 生产构建与 `node --check index.js`：通过。
- package、manifest 与运行时版本：`1.1.0-alpha.10.5.4`。

## 缓存优先历史重建验证

完整缓存手动重建：

```text
正文回读：0 条
事实模型调用：0 次
大总结调用：0 次
表格来源：既有统一事实包本地批量重放
世界书：最终重新发布
```

局部编辑 24 条历史：

```text
复用正文：23 条
回读正文：1 条
事实模型调用：1 次
长期总结调用：1 次（总结依赖失效）
任务终态：success
```

- 稳定消息键用于把旧事实包来源重新映射到当前消息索引。
- 连续缓存包只进行一次本地批量提交，不逐条持久化。
- 有效小总结保留；混合阶段总结失效时从既有逐轮摘要恢复。
- 失败或失效区段不会覆盖已成功复用的表格检查点。

## 任务与 UI 验证

- 重建状态显示规划、复用事实、回读缺失、更新长期和同步世界书阶段。
- 显示已复用正文、回读正文、缓存包和模型批次数。
- 任务卡显示状态图标、消息范围、进度、耗时、错误全文和终态。
- 运行、成功、失败、取消和被合并任务保持可辨识，不依赖短暂 Toast。
- 移动端任务指标和元数据使用两列/单列自适应布局。

## 正常玩家流程回归

- 正常游玩调用链与 1.1.0-alpha.10.5.3 相同；本补丁不改变审核、表格、小总结、大总结、世界书或图谱语义。
- 快速推进、历史编辑、Swipe、删除、分支恢复、沉降和世界书事务回归通过。
- 所有模型调用继续使用 SillyTavern 原生生成服务。

## 实机边界

- 仍需在真实 SillyTavern 中验证不同模型对事实与总结协议的遵循。
- 移动端页面回收、真实 429/504 和不同 SillyTavern 小版本的世界书编辑器刷新仍需人工验收。
- 当前仍为 alpha 候选。

执行日期：2026-07-13

## 可复现命令

```bash
npm ci
npm test
npm run validate
npm audit --audit-level=low
node --import tsx simulations/native-history-rebuild.ts
node --import tsx simulations/audit-one-pass-30turn.ts
node --import tsx simulations/player-backpressure-and-continuity.ts
node --import tsx simulations/full-30turn.ts
node --import tsx simulations/long-100turn.ts
node --import tsx simulations/history-mutation-chain.ts
node --import tsx simulations/memory-sedimentation-scenario.ts
```
