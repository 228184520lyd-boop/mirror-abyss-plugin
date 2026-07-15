# Mirror Abyss 1.1.0-rc.4.1 验证记录

## 已确认根因

事实包索引函数创建了 `byId`，但返回对象遗漏该字段；小总结合并函数随后调用 `factIndex.byId.get(id)`。因此总结链路在本地构造批次阶段抛出 `Cannot read properties of undefined (reading 'get')`。

## 修复范围

只补回事实索引返回值中的 `byId`。未修改存储格式、提示词、模型调用、并发调度、历史策略和世界书发布逻辑。

## 自动检查

- `core-hotfix.js` ES Module 语法：通过。
- `finalizer.js` ES Module 语法：通过。
- `manifest.json`、`BUILD_INFO.json`、`ROLLBACK_MANIFEST.json`：解析通过。
- 缺陷标记单次替换：通过。
- 对已修复输入再次执行保持幂等：通过。
- 出现多个缺陷标记时拒绝猜测性修补：通过。
- Chromium 中通过 `fetch → 精确替换 → blob 模块 import` 执行模拟核心：通过。
- 模拟核心执行 `factIndex.byId.get('ok')`：通过。

## 仍需实机确认

SillyTavern 中触发一次真实小总结，确认模型调用、总结提交和后续世界书同步完整成功。覆盖前无需清缓存。
