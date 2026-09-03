# Changelog

## 4.0.126

- 整本世界书整理取消每批重复发送全书 `globalIndex`；每个请求只携带当前 batch 的完整条目。
- 整本整理改为使用 SillyTavern token counter 组批，默认输入目标 6000 tokens；单条输入超过 12000 tokens 时直接停止并提示，不拖累整本任务。
- 502/503/504、429、网络超时等 transport failure 不再触发同尺寸 plain-JSON 重试；多条 batch 会机械二分后继续，单条仍失败则停止。
- Connection Manager Structured Output 改为 `extractData:false`：ST 继续负责 Profile/provider 路由和 `json_schema`，镜渊拿到原始 provider 响应后自行机械解析，避免宿主提前把损坏 JSON 吞成空对象。
- JSON 外层解析兼容代码围栏、前后说明、非法控制字符、注释和尾逗号；`complete=true`、E 数量、E 身份、重复/缺失检查继续严格，任何不完整结果零提交。
- 小总结提示词收回为“根据以上材料进行总结、合并与提炼”；大总结只增加“更高层级”。不再由插件提示词规定长期、重点、过程、阶段性等语义标准。
- 仓库发布化整理：用户 README 精简；历史开发 README、Host Research 归档到 `docs/archive/`；新增 CHANGELOG、Troubleshooting、Development 与 Host Contracts。

## 4.0.125

- 场景生命周期只读取本轮新提取的正常 `场景` 条目；ST 激活的旧场景条目不参与切场。
- 同一连续场景可以不重复输出场景条目；首次场景和真正切场必须产生稳定的场景事实。
- 保留空 SceneGroup 的零模型机械收尾。

## 4.0.124

- 修复空 SceneGroup 永久 `closed && !small` 重试问题。
- 曾实验每轮 `[当前场景]` 控制行；该设计在 4.0.125 收回。

## 4.0.123

- 整本整理改为独立 JSON 合同；E 身份与完整性严格校验；预览后 fresh-read 防止覆盖玩家改动。

## 4.0.122

- Edit / Swipe / Delete 历史补建改为跟随当前 ST `world_info_depth` 的有限窗口；范围外较新状态受保护。

## 4.0.121

- 辅助提取输入增加 16000-token 硬上限；优先使用 ST token counter，不修改 ST World Info Budget。

## 4.0.120

- 审核/润色收敛为单一“终稿处理”；正常路径一调用，只有协议损坏允许一次纠错。
- 提取参考收敛为全局薄身份目录 + ST 本轮实际 `WORLD_INFO_ACTIVATED` 详情。
- 普通世界书保存不再隐式全局重排。

## 4.0.119 及更早

完整历史开发记录保存在 `docs/archive/legacy/README-4.0.125.md`。
