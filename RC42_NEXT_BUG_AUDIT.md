# Mirror Abyss rc.42 下一步 Bug 判断

本文件只记录已经通过代码路径与独立复现确认的问题，不包含预防性设计。

## 优先级 1：总结分发忽略对象别名

### 现象

对象名称锁定后，模型的新称呼会正确进入 `keywords`。但小总结/大总结向对象回写时，`applySummaryLayer()` 只用：

- `row.id`
- `row.title`
- `eventId`
- `factIds`

匹配 `relatedEntities`，没有使用 `row.keywords` 或 `row.recall.any`。

### 已复现

对象：

- `title = 陈家面馆`
- `keywords = [陈家面馆, 陈记面馆]`

事实：

- `related_entities = [陈记面馆]`
- 对象行暂时没有该事件的 `eventId/factId`

小总结生成成功，但该对象的 `recentHistory` 仍为空。

### 影响

名称锚点本身正确，但模型用别名指向对象时，总结可能漏分发，导致对象世界书条目缺少近期经历或长期历史。

### 合理修复

总结分发的对象身份 token 应使用：

`id + title + keywords + recall.any`

仍要求精确规范化匹配，不做模糊相似度猜测。

## 优先级 2：多事件对象的身份继承只检查主 eventId

### 现象

`preserveStableObjectIds()` 声称按事件身份继承旧 ID，但当前索引与计数只读取单个 `row.eventId`，没有遍历 `row.eventIds`。

### 已复现

旧对象：

- `id = c1`
- `title = 沉秋`
- `eventIds = [e1, e2]`
- 主 `eventId = e1`

新补丁：

- `id = temp`
- `title = 刀客`
- `eventIds = [e2, e1]`
- 主 `eventId = e2`

两边明确共享事件，但当前结果仍保留 `temp / 刀客`，没有继承 `c1 / 沉秋`。

### 影响

长期多事件游玩中，如果模型同时改变临时 ID、称呼以及事件排序，同一对象可能分裂为新条目。

### 合理修复

按全部 `eventIds` 建立唯一候选集合；只有交集最终唯一指向一个未认领旧对象时才继承，存在多候选则保持原样，不猜测。

## 建议顺序

先修“总结分发别名漏匹配”，因为它是名称锚点上线后的直接功能缺口；随后修多事件 `eventIds` 身份继承。
