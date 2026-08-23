# 架构与维护边界

模块按“隐藏会独立变化的设计决策”划分，不按文件行数或执行步骤划分。

## 真实模块

| 模块 | 唯一职责 | 不负责 |
|---|---|---|
| `HostAdapter` | 聊天、消息快照、元数据、宿主事件 | 世界书内容规则 |
| `WorldbookRepository` | 世界书唯一读写口、UID、事务、回读与回滚 | 提示词和界面 |
| `ModelGateway` | 模型请求与一次协议纠正 | 世界书写入 |
| `MemoryService` | 审核、提取、总结、世界书条目管理规则 | DOM 与任务排队 |
| `WorldSettingImportService` | 导入预览状态与确认写入 | 另外一套导入协议 |
| `MirrorAbyssController` | 用例入口、任务互斥、取消、自动触发、状态编排 | 世界书条目解析、模型请求、DOM |
| `MirrorAbyssPanel` | 界面状态与用户交互 | 业务判定与存储 |

`schema.js`、`protocol.js`、`entry.js`、`prompts.js` 是纯规则与编解码代码；`util.js`、`dom.js` 是辅助代码；`app.js` 只是组装根。它们不拥有独立生命周期，不作为业务模块计数。

## 单向依赖

```text
core rules ← host/worldbook adapters ← application ← UI ← composition root
```

- UI 不读写世界书，不调模型。
- Controller 不解析世界书条目，不直接读写世界书。
- 世界书数据只由 `WorldbookRepository` 提交。
- 核心规则不导入 SillyTavern 或 DOM。

## 宿主接口锚点

聊天、元数据、模型和世界书读写优先使用 `SillyTavern.getContext()`。Context 不提供创建世界书和分配条目 UID，因此只有 `WorldbookRepository` 直接引用 `createNewWorldInfo` 和 `createWorldInfoEntry`。这两个函数不形成旁路，仍在同一事务边界内。

## 错误定性

跨边界错误使用 `MirrorAbyssError(source, code, message, cause)`。`source/code` 是定性依据，`cause` 保留底层原因。UI 只展示，不根据文案猜测错误类型。

## 修改路由

| 需求 | 修改起点 |
|---|---|
| 增删世界书类型或栏目 | `core/schema.js` |
| 改模型输出格式 | `core/protocol.js` + `application/prompts.js` |
| 改世界书条目正文合并规则 | `core/entry.js` |
| 改宿主消息或元数据调用 | `adapters/host.js` |
| 改世界书提交或回滚 | `adapters/worldbook.js` |
| 改审核、提取、总结、条目管理 | `application/memory-service.js` |
| 改自动触发、取消、重试 | `application/controller.js` |
| 改手机排版或按钮 | `ui/panel.js` + `style.css` |

## 参考锚点

- D. L. Parnas, [On the Criteria To Be Used in Decomposing Systems into Modules](https://doi.org/10.1145/361598.361623)
- [SillyTavern UI Extensions 官方文档](https://docs.sillytavern.app/for-contributors/writing-extensions/)
- [SillyTavern `getContext()` 官方源码](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/st-context.js)
- [SillyTavern 世界书官方源码](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/world-info.js)
