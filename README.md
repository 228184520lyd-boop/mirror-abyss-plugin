# Mirror Abyss｜镜渊 Core 2.0.0-core.1

这是无 UI 核心版，只保留四项功能：

1. 正文审核（不通过时只修正一次）
2. 事实与状态提取
3. 小总结
4. 大总结

插件只监听 SillyTavern 的 `MESSAGE_RECEIVED` 事件。启用时不读取世界书、不调用模型、不扫描消息、不创建 DOM。

自动流程：审核 → 提取 → 达到回合数时小总结 → 达到小总结数量时大总结。任何一步失败立即停止；只有整轮成功才更新 `lastProcessedMessageKey`。

默认使用当前聊天连接。旧版本已保存的设置会继续沿用。控制台可用：

```js
MirrorAbyss.audit()
MirrorAbyss.extract()
MirrorAbyss.smallSummary()
MirrorAbyss.largeSummary()
MirrorAbyss.processLatest()
MirrorAbyss.getSettings()
MirrorAbyss.configure({ autoProcess: true, auditEnabled: true, smallSummaryTurns: 10, largeSummaryCount: 4 })
MirrorAbyss.status()
```

没有自定义工作区、状态灯、图谱、表格、迁移页面或全局 DOM 监听。成功/失败只使用 SillyTavern 已有 Toast；Toast 不可用时写入控制台。
