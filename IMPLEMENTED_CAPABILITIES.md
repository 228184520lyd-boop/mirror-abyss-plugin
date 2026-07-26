# 已实现能力（只列实际代码）

版本：`2.0.0-alpha.4-realtest.1`

已实现：

- 官方 manifest 生命周期入口；
- 本地 `dist/index.js` 生命周期入口与 React 设置面板；
- Redux Toolkit 当前聊天、文档、设置和处理进度；
- Zod 设置、ChatDocument 与阶段结果边界；
- 当前聊天稳定键、generation 与 AbortController；
- 每聊天 `p-queue concurrency=1`；
- chatMetadata 中的 v2 ChatDocument 读取与保存；
- 阶段缓存 revision 与可发布业务 revision 分离推进；
- `MESSAGE_RECEIVED`、`MESSAGE_UPDATED`、`MESSAGE_EDITED`、`MESSAGE_SWIPED` 入口；
- 手动处理最新 AI 正文；
- 官方当前连接 `generateRaw(params)` 调用；
- 插件模型调用单通道串行，避免伪取消后产生重叠请求；
- 审核固定文本解析与阶段缓存；
- 审核失败后的可选最小修正；
- 修正前后消息键和正文哈希验证；
- 扁平 MA_TURN / MA_FACT 提取；
- 九张默认表由事实账本确定性投影；
- 编辑或 Swipe 后，同一消息旧事实在新提取成功时被替换；
- 完成阶段重复事件不再次调用模型；
- 全局设置保存到 extensionSettings；
- 固定事实与工程事件循环文档；
- `esm.sh` → `jsDelivr +esm` 两套精确版本浏览器 ESM 运行树，单一来源失败时顺序回退；
- 两个来源均失败时显示聚合错误；
- 无正文诊断 JSON 一键复制；
- 模拟宿主边界回归：事件清理、聊天身份、正文读写、Swipe 当前项同步与旧会话拒绝。

尚未实现，不能声称可用：

- Connection Profile 隔离调用；
- alpha.27 旧存档迁移；
- 完整动态表头编辑和手工锁定；
- 事件生命周期、NPC预退出和沉降；
- 小总结、大总结和消费机制；
- 世界书编译、发布与回读；
- 图谱；
- 历史重建和断点；
- 完整移动端工作区；
- SillyTavern 实机验证结果；
- 完全离线、自包含的 Webpack bundle（当前安装候选需要至少一个锁定 ESM 来源可访问）。
