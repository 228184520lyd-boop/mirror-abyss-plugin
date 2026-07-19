# Mirror Abyss rc.42 条目名称锚点修复报告

版本：`1.2.0-rc.42`  
流水线：`ma-pipeline-44`

## 修复目标

已建立对象的世界书条目名称必须作为长期锚点。模型后续对同一对象使用不同称呼时，只允许更新状态、内容和别名，不得自动改写 `title`。

## 根因

rc.41 中同一稳定 ID 的模型补丁会先覆盖旧 `title`。`preserveStableObjectIds()` 只有在新旧标题规范化后完全一致时才恢复旧名称，因此模型只要换一种表达，世界书注释与 `logicalKey` 就会跟着漂移。

## 修复

1. `normalizeRow()`：
   - 自动归一化命中同一稳定 ID 时沿用旧 `title`；
   - 新称呼并入 `keywords`；
   - 玩家手动编辑仍允许显式改名。
2. `preserveAnchoredTitle()`：
   - 自动身份继承统一恢复旧 ID 与旧 `title`；
   - 合并旧、新关键词与召回条件；
   - 新称呼进入 `keywords` 和 `recall.any`。
3. `mergeRowsByIdentity()` 与 `preserveStableObjectIds()`：
   - 同一对象合并或临时 ID 回收时都使用名称锚点。
4. 状态提示词：
   - 明确要求同一对象沿用旧 `id` 与旧 `title`；
   - 新称呼只能进入 `keywords`。

## 行为边界

- 自动状态提取、小总结和大总结无权修改对象条目名称。
- 玩家手动编辑仍是正式改名入口。
- 本版不尝试由模型自动判断剧情中的正式改名，避免普通措辞变化误改锚点。
- 已经在旧版本中漂移过的名称无法凭空恢复到最初名称；升级后以当前已保存名称作为新的锚点。

## 验证

新增 `tests/rc42-title-anchor.ts`，覆盖：

- 同一稳定 ID 返回不同名称时保留旧 `title`；
- 新称呼进入 `keywords` 与 `recall.any`；
- 临时 ID 通过唯一事件身份命中旧对象时继承旧 ID 与旧名称；
- 世界书 `key`、`logicalKey` 与注释继续使用锚点名称；
- 玩家手动编辑可以正式改名。

完整 `npm run verify` 通过，包括历史回归、20 步模拟、类型检查、浏览器构建和语法检查。
