# Mirror Abyss 2.0.0-lite.ui.51-st-native-request

Mirror Abyss（镜渊）是 SillyTavern 前端扩展，用于在 AI 正文完成后执行可选审核、完整修正、事实提取、分层总结、世界书提交和原生召回配置。

本版本固定以下边界：

- 世界书是唯一长期剧情数据源。
- 插件负责读取、转换、校验和提交，不建立第二剧情数据库。
- 模型只产生候选协议；匹配、合并、原生字段设置、提交与回滚由插件确定性执行。
- API、地址、密钥、模型、Completion Preset、Instruct、推理模板和供应商响应解析全部由 SillyTavern 管理。
- 镜渊不直接请求外部模型接口，也不实现供应商兼容层。

## 安装

将安装 ZIP 作为 SillyTavern 第三方扩展安装。最低客户端版本为 SillyTavern 1.18.0。

安装后，页面右侧显示镜渊浮动入口。插件面板分为：

- **运行**：完整处理、单独审核、单独提取、小总结、大总结、取消任务和阶段状态。
- **世界书**：条目浏览、编辑、锁定、焦点和召回状态。
- **设置**：功能开关、各阶段 Connection Profile、提示词和栏目定义。
- **维护**：设定导入、世界书重建、重置、自动验收和诊断导出。

## 模型连接

镜渊支持两种 ST 原生路由：

### 选择 Connection Profile

插件调用：

```js
ConnectionManagerRequestService.sendRequest(profileId, messages, undefined, { signal })
```

镜渊只提交标准消息和取消信号。以下内容由该 Profile 的 ST 原生配置决定：

- API 类型和网站
- URL、端口和鉴权
- 模型
- Completion Preset
- Instruct Preset
- 最大输出长度
- 推理模板及 reasoning 提取
- Chat Completion / Text Completion 转换
- 供应商响应解析

因此可以使用：

- 正文模型位于网站 A，镜渊模型位于网站 B；
- 正文和镜渊使用同一网站，但选择不同模型；
- 不同阶段分别选择不同的 ST Connection Profile。

### 当前 SillyTavern 连接

未选择 Profile 时，镜渊调用 ST 的 `generateRaw()`，跟随当前连接和模型。

## 单次请求原则

每个业务阶段只向 ST 提交一次模型任务：

- 审核一次；
- 审核失败后，修正属于下一独立业务阶段，修正一次；
- 提取一次；
- 每次小总结或大总结各一次；
- 每个重建批次一次；
- 每次设定导入预览一次。

镜渊不再自动执行：

- 502/503/504、网络错误或 HTML 错页重试；
- 空正文重试；
- reasoning-only 救援；
- 缩短 Prompt 后重放；
- 第二次格式修复模型；
- 修正版截断后的再次生成；
- 重建批次限流重试。

失败时保留 ST 原始错误并附加实际 Profile 路由。本轮停止，世界书不提交，处理游标不推进。

## 返回结果处理

Connection Profile 路由只读取 ST 标准化结果：

```text
content   → 最终正文
reasoning → 仅用于判断“只有推理、没有最终正文”
```

镜渊不会读取或猜测 `choices`、`message`、`delta`、`thinking`、SSE、HTML 或供应商私有字段。

模型仅返回 reasoning 时，镜渊立即停止并提示在 ST Profile 中调整模型、推理模板、Preset 或最大输出长度，不会再次请求模型，也不会把 reasoning 当成最终协议。

## 业务格式

本版本不修改：

- 世界书正文和栏目格式；
- ENTRY 提取协议；
- 审核、提取、总结和重建提示词定义；
- 本地解析与确定性格式恢复；
- 匹配、去重、生命周期和事件沉降；
- ST 原生召回参数；
- 玩家在 ST 中设置的 Position、Depth、Role 和 Outlet。

模型返回格式不合格时，只运行现有本地解析与安全恢复。无法形成合格协议时立即停止，不再调用格式修复模型。

## 世界书事务

- 只有官方 `saveWorldInfo` 一个写入器。
- 保存后通过后端权威读取验证。
- 条目编辑、焦点、锁定、召回重排、提取、总结和重建均执行保存—回读—验证。
- 验证失败时恢复旧世界书并再次回读。
- 世界书恢复成功后才清理提交回执。
- 聊天切换、正文编辑或任务取消后，旧任务不得写入新聊天。

## ui.51 本轮改动

- 保留 ST Connection Profile 下拉选择。
- Profile 请求不再传镜渊自定的 max tokens。
- 不再传 `includePreset`、`includeInstruct`、`extractData` 或供应商 payload override；使用 ST 默认行为。
- 当前连接统一调用 ST `generateRaw()`。
- 删除模型请求层的自动重试、错误分类、退避等待和 reasoning 协议救援。
- 删除提取与设定导入的第二次格式修复请求。
- 删除修正版截断后的第二次生成；本地完整性闸门失败时保留原正文。
- 删除重建批次的 API 限流自动重试；批次之间的正常节流间隔保留。
- 自动验收不再测试插件自己的网关错误分类，只验证业务协议严格拒绝。
- 世界书格式、提示词语义、解析、匹配、生命周期与原生召回未改。

## 使用建议

第三方网站应先在 SillyTavern 中建立并测试 Connection Profile，再由镜渊选择。模型速度、推理开关、最大输出和格式兼容问题都在该 Profile 中调整。

提取任务更适合轻量、稳定输出最终文本的模型。使用推理模型时，应在 ST 的 Profile 中配置正确的推理模板并确保最终正文有足够输出额度。
