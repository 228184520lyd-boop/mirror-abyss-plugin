# Mirror Abyss｜镜渊 2.0.0-core.3

本版本严格以 `Mirror-Abyss-2.0.0-core.2-source.zip` 为源码基线进行增量修复，没有从 `frozen.1`、GitHub 旧版或其他分支复制业务模块。

## 四个模型脚本

1. 正文审核：单次调用完成审核、问题定位和必要的完整最小修正版。
2. 事实与状态提取：只读取最终可见正文，输出候选事实。
3. 小总结：只读取已经写入世界书的确认事实，维护 `小总结｜稳定事件名称` 的当前版本。
4. 大总结：读取 `大总结｜当前`、未固化小总结和重要长期条目，替换唯一当前大总结。

不存在独立自由重写模型。审核关闭后，其余三项仍可运行。

## 唯一链路

`AI 正文 → 任务快照 → 单次审核/最小修正 → 最终正文 → 事实提取 → 唯一世界书提交器 → 小总结 → 大总结 → 回读确认`

- 所有模型请求只经过 `HostAdapter.generate()`。
- 所有世界书写入只经过 `WorldbookAdapter.apply()`。
- UI 只发出命令和显示任务状态，不保存剧情事实。
- 世界书是唯一长期剧情数据源。

## 控制面板

右下角“镜渊”按钮提供：

- 自动处理开关
- 审核独立开关
- 手动审核
- 手动提取
- 手动小总结
- 手动大总结
- 取消当前任务
- 当前状态

面板不使用全局 `MutationObserver`，启动时不读取世界书、不扫描历史消息、不调用模型。

## 控制台 API

```js
await MirrorAbyss.processLatest();
await MirrorAbyss.audit();
await MirrorAbyss.extract();
await MirrorAbyss.smallSummary();
await MirrorAbyss.largeSummary();
await MirrorAbyss.cancel();
await MirrorAbyss.configure({ auditEnabled: false });
await MirrorAbyss.getSettings();
await MirrorAbyss.status();
```

## 验证

```bash
npm test
```

测试覆盖单次审核修正、严格“无”语义、空响应、HTML 错误页、超时、聊天/正文/世界书/设置变化、重复点击、世界书两阶段事务、当前状态替换、固定事实历史、小总结恢复检查点、玩家流程模拟、启动零工作和源码/bundle 一致性。

这些测试不是 SillyTavern 实机证明。真实 Connection Profile、真实世界书接口差异、移动端宿主布局和实际事件顺序仍需实机验证。
