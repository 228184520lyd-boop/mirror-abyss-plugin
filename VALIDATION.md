# Validation — 1.1.0-alpha.10.5.3 Native Invocation & Rebuild Task Feedback

## 自动与工程验证

- 自动测试：97/97 通过。
- TypeScript strict：通过。
- 依赖边界检查：通过。
- ESLint：通过。
- 生产构建与 `node --check index.js`：通过。
- package、manifest 与运行时版本：`1.1.0-alpha.10.5.3`。

## 酒馆原生调用验证

- 当前连接只调用 `SillyTavern.getContext().generateRaw()`。
- 指定 Connection Profile 只调用 `ConnectionManagerRequestService.sendRequest()`，不切换玩家当前连接。
- `src` 中不存在模型供应商 fetch、API 密钥、独立 API 配置、Connection Broker 或 Invocation Router。
- 旧 `independent` 设置加载时迁移到当前酒馆连接，不再请求旧供应商端点。
- 模型请求的超时、网络重试、限流和供应商错误由 SillyTavern 管理；镜渊只处理业务失败状态。

## 历史重建验证

24 条历史正文端到端测试：

```text
入口立即返回
事实/阶段总结批次：2 次（每批 12 条）
最终大总结：1 次
小总结：2 份
大总结：1 份
任务终态：success
```

120 条历史正文模拟：

```text
启动返回：1.32ms（本地模拟）
事实＋阶段总结：10 次
最终大总结：1 次
总模型调用：11 次
最终小总结：10 份
最终大总结：1 份
未完成重建记录：0
```

- 每个成功批次写入表格和检查点。
- 失败批次不会覆盖之前成功的表格。
- 504 类失败仅重试当前批次；已完成前缀保留。
- 重建期间暂停中间世界书发布，完成后只发布最终版本。
- 修复了批次 `stageSummary` 被归一化后遗漏，以及最终大总结本地提交冲突。

## 任务反馈验证

- 顶部镜渊按钮默认显示；任务运行时显示旋转图标和数量。
- 失败任务显示警告图标和数量。
- 任务中心展示名称、消息范围、阶段、进度、耗时、重试次数、阻塞属性和错误全文。
- 历史重建支持暂停、取消和从失败批次继续。
- 同一任务重跑成功后，旧失败状态不继续污染顶部红色告警。

## 正常玩家流程回归

30 轮：审核 30、事实 30、小总结 6、大总结 3，总调用 69。

100 轮：审核 100、事实 100、小总结 20、大总结 10，总调用 230。

10 轮快速推进：合并为 1 次事实提取；全部正文进入同一事实区段，旧活跃人物保留。

编辑、Swipe、删除、分支恢复、沉降、世界书事务和插件停用测试均通过。

## 实机边界

- 仍需在真实 SillyTavern 中验证不同 API/模型对 JSON 协议的遵循。
- `generateRaw` 的底层中止能力取决于 SillyTavern 当前版本；镜渊取消后会拒绝提交迟到结果，但宿主请求可能继续到结束。
- 仍需人工验证真实 429/504、移动端后台回收和不同 SillyTavern 小版本的世界书编辑器刷新。
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
