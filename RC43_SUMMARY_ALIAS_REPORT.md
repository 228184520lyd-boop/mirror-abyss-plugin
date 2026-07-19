# Mirror Abyss rc.43 总结别名分发修复

## 已复现问题

rc.42 已锁定对象 `title`，模型的新称呼进入 `keywords / recall.any`。但 `applySummaryLayer()` 只用 `row.id + row.title` 匹配事实的 `relatedEntities`。

例如：

- 稳定对象：`id=region_chen_shop`、`title=陈家面馆`；
- 已登记别名：`陈记面馆`；
- 新事实：`relatedEntities=[陈记面馆]`。

小总结可以成功生成，但原对象的 `recentHistory` 不更新；大总结也可能漏写 `solidifiedHistory`。

## 根因

总结分发的身份 token 与状态对象身份体系不一致。名称锚点上线后，别名已经被安全登记，但总结层没有读取这些别名。

## 修复

对象匹配 token 改为：

```text
id + title + keywords + recall.any
```

所有值都经过 NFKC、大小写和标点空白规范化后做精确匹配：

- 不使用模糊相似度；
- 不改变稳定 ID；
- 不改变锚点 `title`；
- 不创建新对象；
- 完全锁定条目仍不自动修改。

## 验证

`tests/rc43-summary-alias-distribution.ts` 验证：

1. `keywords` 别名可接收小总结；
2. 大总结可移除旧近期版本并写入长期历史；
3. `recall.any` 别名也可命中；
4. 条目数量和稳定 ID 保持不变。
