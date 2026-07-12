# Validation — 1.1.0-alpha.9.7 Summary Consistency / Phase 5 Candidate

执行日期：2026-07-12

## 可复现命令

```bash
npm ci
npm test
npm run validate
npm audit --audit-level=low
```

`npm test` 与静态/构建验证分开运行，避免把测试结果隐藏在复合脚本中。

## 自动检查

- 发布源码内 `tsconfig.json`：存在
- TypeScript strict：通过
- 依赖边界检查：通过
- ESLint：通过
- 自动测试：72/72 通过
- 生产 ESM 构建：通过
- `node --check index.js`：通过
- 生产 `index.js.map`：不存在
- `npm audit --audit-level=low`：0 个已知漏洞

## Foundation 回归

- Connection Broker 串行/并行、429、超时、取消、熔断：通过
- 按聊天 TaskQueue lane 与任务终态：通过
- 账户隔离与稳定聊天身份：通过
- Worldbook Outbox prepare、回读、冲突、回滚和恢复：通过
- LocalCommit 双对象崩溃恢复：通过
- Web Locks/localStorage 降级协调：通过
- alpha.6/alpha.7 迁移与备份：通过
- 生命周期完整卸载与单实例重启：通过
- 正常管线单回合一次完整聊天保存：通过
- 可移植 ChatState 恢复：通过
- 审核锁所有权：通过

## alpha.9.7 新增回归

- 消息稳定身份与 revision key 分离：通过
- 受影响小总结递归失效：通过
- 大总结依赖后缀失效：通过
- 总结后编辑消息并重建：通过
- 总结后删除消息并重建：通过
- swipe 替换旧 revision：通过
- `MESSAGE_SWIPE_DELETED` 事件路由：通过
- `MESSAGE_UPDATED` 事件路由：通过
- 无正文变化的 `MESSAGE_UPDATED` 不重建：通过
- 分支携带旧 portable ChatState 时自动识别并重建：通过
- 重建中断写入 failed 记录：通过
- 启动/人工恢复 failed 重建：通过
- 重放期间只在结尾同步最新世界书快照：通过
- 历史重建诊断与人工恢复入口：通过

## 模拟结果

### 100 回合状态提取

```text
turns: 100
generateCalls: 100
saveChatCalls: 100
saveChatCallsPerTurn: 1
```

### 30 回合完整功能链

```text
audit: 30
state: 30
small summaries: 6
large summaries: 3
saveChatCalls: 30
worldbook Outbox committed: 30
LocalCommit committed: 9
world entries: 4
```

### 历史变更链

```text
编辑：新 revision 存在，旧 revision 不存在
swipe：新 revision 存在，旧 revision 不存在
删除：被删 revision 不存在，小/大总结归零
分支：自动恢复，旧 revision 数量 0
未解决 HistoryRebuild：false
```

## 发布结构

- source ZIP 包含 `tsconfig.json`、`eslint.config.mjs`、源码、测试、模拟、脚本、研究和 Phase 5 文档；
- source ZIP 不包含 `node_modules`、`.git`；
- deploy ZIP 不包含 TypeScript、测试、开发依赖或 source map；
- source/deploy `index.js` 哈希必须一致；
- package、manifest 与运行时版本必须一致。

## 仍需真实环境验证

- 从公开 alpha.7 安装仓库原位升级；
- 真实 SillyTavern install/update/enable/disable/delete hooks；
- 当前连接和 Connection Profile 的真实取消、401/secret-id 情况；
- 编辑、删除、swipe、继续生成和分支事件的真实宿主顺序；
- 后台标签页休眠、页面刷新/关闭和浏览器页面回收；
- 双标签页真实 Web Locks 与 localStorage 降级竞争；
- 移动端弱网、Wi-Fi/移动数据切换与长期运行；
- 100 回合以上存档中 portable ChatState 元数据体积；
- 多设备同时编辑同一个世界书。

本版本是 Phase 5 实机验收候选，不能标记为 stable 或 beta。
