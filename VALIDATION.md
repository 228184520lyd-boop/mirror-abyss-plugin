# Validation

版本：`1.1.0-alpha.7`

已完成：

- TypeScript `strict` 静态检查通过。
- ESM 生产构建通过。
- `node --check index.js` 通过。
- 28 项自动测试全部通过。
- 同一正文重复事件只创建一个任务。
- 审核、定向修正、再审核和状态提取顺序保持不变。
- Connection Profile 通过稳定 ID 和官方 Request Service 请求；测试确认当前选中 Profile 不发生变化。
- Profile 请求强制 `includePreset=false`、`includeInstruct=false`、`stream=false`。
- 独立 API 经 `/api/backends/chat-completions/generate` 后端代理发送。
- 独立 API 测试确认 reverse proxy、密钥、模型和消息正确进入请求体。
- 独立 API 密钥不进入 `extensionSettings`。
- 连接测试能分别报告连接、JSON 和精确指令遵循状态。
- 结构解析、专用格式修复、人物生命周期、对象语义世界书、安全沉降、玩家锁定行、移动端横向表格和图谱缩放原有测试继续通过。

尚未完成：

- 真实 SillyTavern 1.14 云部署中多个 OpenAI 兼容代理的实机回归。
- 不同服务商对 `/api/backends/chat-completions/generate` 可选字段的兼容测试。
- ST 1.14 Connection Profile 使用不同独立密钥时的厂商级验证；此场景推荐独立 API。
- 401、403、404、429、超时、代理 HTML 错误页和空响应的真实故障注入。
- 标签页休眠、网络切换、多个设备、群聊、Swipe、消息编辑与删除组合测试。
- 100 回合以上长期沉降与数百图谱节点性能测试。

因此本版本仍标记为 alpha，不宣称长期稳定版。
