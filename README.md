# Mirror Abyss 4.0.84

低耦合短代码版。世界书是唯一长期剧情事实源；运行链保持“入口 → 读 → 处理 → 写 → fresh 回读 → 结束”。

## 4.0.84

- 删除模型响应多层猜测、世界书 import 吞错、整本深比较、绑定补偿、手工原生条目 fallback 等防御性第二路径。
- 新条目只使用 SillyTavern 官方 `createWorldInfoEntry()`；保存只使用官方 `saveWorldInfo()`，随后 fresh read 当前世界书。
- SceneGroup 只保存实际写动 UID 与 open/closed/small/large 状态，不保存第二份剧情事实。
- 小总结读取最早 closed SceneGroup；大总结读取已小总结且尚未大总结的 SceneGroup；自动大总结使用同一总结函数。
- 整本世界书整理恢复为“一次模型整理 → 预览 → 玩家确认 → 保存”。
- 人工合并和明确删除可直接越过基石保护；自动提取/总结仍尊重基石。
- `世界｜游戏时间` 强制映射为 ST 原生常驻；managed 条目按类型与更新时间机械计算原生 `order`。
- 审核修正文同步当前 swipe。
- receipt 记录玩家输入索引；Edit/Swipe/Delete 会恢复受影响写入，pending Swipe 只回滚旧候选。
- 完整 Reset 会清空当前绑定世界书、聊天镜渊状态并恢复插件设置；“清空镜渊管理条目”仍作为独立轻量操作保留。
- 仅保留旧 `mirrorAbyssLite.currentGameTime` → `世界｜游戏时间` 的一次迁移。
- UI 保持白/灰高透明玻璃与轻量动态，并补上自动大总结、整本整理和完整重置入口。
