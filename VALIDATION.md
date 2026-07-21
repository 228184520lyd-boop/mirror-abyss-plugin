# Mirror Abyss 1.3.9 验收记录

流水线：`ma-pipeline-72`

## 记忆状态机收拢

- `npm run test:rc72:machine`：覆盖 `active` 禁止直接删除、事件未结束或事实未覆盖时保留、无事实凭证保留、待结算同 ID 恢复、模型临时 ID 重新绑定稳定对象、标准状态转移与时空单例幂等。
- `npm run test:rc72:summary`：覆盖小总结和大总结必须先提交事实消费／固化标记，再进行覆盖审计；验证同批源条目与宿主容器级联物理删除。
- `npm run test:rc72:migration`：覆盖旧 `absorbed / retired` 归一为 `settling`、迁移幂等、已有覆盖事实的旧自动条目清理、人工／焦点保护以及无事实旧条目保留。
- `npm run test:rc72:lorebook`：覆盖活跃条目正常发布、待结算条目完全停用、事件画像仍可观察待结算状态、物理删除后不再发布。
- 状态机集中区回归覆盖状态提取、对象唯一化、总结事务、存储迁移和世界书发布；全项目浅筛覆盖类型、构建、语法、聊天隔离、异步提交、无限追加与整仓模型请求风险。
- `npm run verify` 已在 1.3.9 最终源码上完整串行执行，退出码为 `0`；包含全部历史回归、rc72、TypeScript、构建与语法检查。

## 1.3.8 记忆网络融合验证

- `rc71-memory-network-fusion`：验证融合视图、事件画像与关系图谱三种入口共存。
- 验证事件画像 event_id 可派生只读事件节点，并与关联对象建立只读事件边。
- 验证事件卡片定位、事件节点画像指标、旧设置默认迁移到融合视图。
- `rc59`、`rc62`、`rc63`、`rc69`、`rc70` 回归通过；TypeScript、构建与语法检查通过。

# Mirror Abyss 1.3.7 验收记录

流水线：`ma-pipeline-71`

## 1.3.7 总结结算、时空单例与状态请求韧性验收

- `npm run test:rc70:repair`：通过。验证小总结先消费事实、大总结先固化事实，再执行覆盖审计；事件结束时可取回同 event_id 的既有关联条目并完成局部真实删除。
- 同一回归验证每个聊天只保留固定 ID `spacetime_current`，旧重复时空的事实、事件、近期／历史总结与对象引用能被合并和改写。
- `<MA_CHANGE>` 支持可选 `result`／`confidence`，末尾块仅在必要字段完整时允许安全补闭合；旧 `<MA_FACT>/<MA_ROW>` 协议继续兼容。
- 格式性错误可进入一次紧凑修复；未注册或禁用表格／字段、对象歧义和禁止的生命周期字段保持硬失败，不会消耗修复响应或误提交。
- 502/503/504 与超时可退回本轮正文最小分段提取；单片正文也会改用最小提示重试，所有片段完成校验后才统一提交。
- `npm run typecheck`、`npm run build`、`npm run syntax`：通过。
- 六次离线玩家调用约 3002–3401 ms；稳定 ID 沿用，对象数 1，重复对象 0，幽灵任务 0，小总结 2，大总结 1。
- 所有 `npm run verify` 组成命令均已分别或分组执行通过。聚合命令曾在修复旧断言和迁移测试后重新分段验证，因此仅以组成命令结果为准，不虚构一次性聚合退出码。

## 1.3.6 无观点事实、增量结算与事件画像验收

- `npm run test:rc69:fact-only`：通过。验证状态／总结模型仅承担事实提取与压缩，生产链忽略模型生命周期意见，旧未决输出不再进入新状态，插件仅按本轮明确事实生成增量结算动作。
- 同一回归验证普通可替代物品可在明确终态进入待结算，而唯一、任务、证物和关键物品不会因转移被机械删除。
- 事件画像由已有事实、对象、总结和待结算状态派生，不调用模型、不持久化第二份正文；角色表身份、长期／现行、当前状态和外观表现分层正常。
- 世界书对象硬上限按完整事实行执行；小总结和大总结超过白盒硬上限时拒绝提交。
- `test:rc51:text-state`、`test:rc52:text-protocol`、`test:rc58:directory-context`、`test:rc60:whitebox`、`test:stable`、`test:rc62:standard`、`test:rc68:lifecycle`、`test:rc65:routing`、`test:rc67:coverage` 等关键回归通过。
- `npm run typecheck`、`npm run build`、`npm run syntax`：通过。
- 标准状态 system prompt 实测为 5,111 字符，并由 `test:rc31:state-patch` 约束在 5,200 字符以内。
- 一次性 `npm run verify` 在外部 900 秒上限到达时已依次通过至 `test:rc59:aba`，随后正在执行 `test:rc59:abnormal`；中断点之后的异常矩阵、分离保存、六次 3.0–3.4 秒玩家流程、UI、白盒、路由、生命周期、事实书记、类型检查、构建和语法检查均已独立执行通过。因此全部组成命令均通过，但不把聚合命令声明为一次性退出码 0。

## 1.3.5 世界书结算与真实删除验收

- `npm run test:rc68:lifecycle`：通过。验证 `absorb / retire` 先把 ST 世界书原条目设为禁用、事件未结束时不得删除、总结覆盖与宿主分发完成后真实删除、待结算恢复、保护条目、无宿主退出、临时参与者与事件容器级联结算，以及 1.3.4 旧隐藏墓碑回收。
- `npm run test:rc20:summary`、`npm run test:rc20:lorebook`、`npm run test:rc53:unique-object`：通过。总结消费、世界书召回方式、稳定对象与唯一发布未回归。
- `npm run test:rc57:snapshot-precision`、`npm run test:rc58:directory-context`、`npm run test:rc60:whitebox`、`npm run test:rc62:standard`、`npm run test:rc65:routing`、`npm run test:rc67:coverage`：通过。稀疏修订、对象目录、白盒规则、工作台、类型分流、物品与场景覆盖未回归。
- `npm run test:rc59:abnormal`、`npm run test:rc59:aba`、`npm run test:rc59:split-save`、`npm run test:rc66:revision-resume`：通过。异常响应、聊天切换、分离保存和审核失败续跑未回归。
- `rc59-profile-player-runtime` 直接运行通过：六次模型调用耗时约 3001–3401 ms，稳定 ID 继承，对象重复 0，幽灵任务 0。
- `npm run typecheck`、`npm run build`、`npm run syntax`：通过。
- `npm run verify` 在容器 300 秒上限内依次通过到 rc.59 区段后被外部超时终止；中止点之后的全部测试已独立执行通过，因此不把聚合命令声称为一次性退出码 0。

## 1.3.4 条目生命周期验收（历史版本）

- `npm run test:rc68:lifecycle`：通过。验证普通出售物品并入交易事件、源条目转隐藏墓碑、宿主吸收归并事实/事实引用/事件引用/旧名称召回、世界书不再发布源对象、普通更新不复活墓碑、显式恢复、锁定保护和终态退出。
- `npm run test:rc31:state-patch`：通过。加入生命周期协议后，标准状态 system prompt 仍严格小于 5,200 字符，并保留既有任务识别文本。
- `npm run test:rc53:unique-object`、`npm run test:rc54:worldbook-refresh`、`npm run test:rc58:directory-context`、`npm run test:rc20:lorebook`：通过。稳定身份、世界书刷新、对象目录和召回模式未回归。
- `npm run test:rc65:routing`、`npm run test:rc67:coverage`：通过。角色/全局/地点/场景分流与物品覆盖未回归。
- `npm run test:rc57:snapshot-precision`、`npm run test:rc59:abnormal`、`npm run test:rc59:split-save`、`npm run test:rc59:aba`、`npm run test:rc66:revision-resume`：通过。稀疏快照、异常响应、分离保存、聊天切换和审核修正续跑未回归。
- `npm run test:rc59:player-runtime`：在 75 秒硬上限内通过。六次模型调用耗时 3001–3401 ms，稳定 ID 正常继承，重复对象 0、幽灵任务 0。
- `npm run typecheck`、`npm run build`、`npm run syntax`：通过。

## 1.3.3 物品覆盖、场景与语义归档验收

- `npm run test:rc67:coverage`：通过。验证三件独立物品同时入表、场景默认表、当前场景兜底、角色误归档全局条目迁移、稳定 ID/基础定义保留、角色专属字段剔除，以及独立物品进入世界书。
- `npm run test:rc65:routing`：通过。地点、场景和全局语义边界继续有效，旧对象原归属锚定与人工移动未回归。
- `npm run test:rc20`、`npm run test:rc21:bugs`、`npm run test:rc24:real-machine`、`npm run test:rc25:trial`：通过。九个默认对象视图、场景发布、地点过滤、20 步玩家流程和世界书唯一性未回归。
- `npm run test:rc31:state-patch`：通过。新增场景类型与物品覆盖后，默认状态 system prompt 为 5,200 字符以内。
- `npm run test:rc52:text-protocol`、`npm run test:rc53:unique-object`、`npm run test:rc57:snapshot-precision`、`npm run test:rc58:directory-context`、`npm run test:rc59:abnormal`、`npm run test:rc60:whitebox`、`npm run test:rc66:revision-resume`：通过。固定文本、稳定身份、稀疏修订、压缩上下文、异常响应、白盒规则和修正恢复未回归。
- `npm run test:rc59:player-runtime`：在 90 秒硬上限下通过。六次模型调用耗时 3001–3401 ms，稳定 ID 正常继承，重复对象 0、幽灵任务 0。
- `npm run typecheck`、`npm run build`、`npm run syntax`：通过。

## 1.3.2 条目分流与审核恢复验收

- `npm run test:rc65:routing`：通过。验证地点表恢复、全局对象不回退角色、跨表原归属锚定，以及人工移动时稳定 ID/引用保留。
- `npm run test:rc66:revision-resume`：通过。构造“失败审核已保存但 revision 被旧状态标成 skipped”的历史恢复现场；恢复调用顺序固定为 `revision → audit → state`，未重新审核原正文。
- `npm run test:ui-sync`、`npm run test:rc42:chain`、`npm run test:rc56:history-resume`：通过。单阶段按钮、正常自动修正链和历史失败后缀续跑未回归。
- `npm run test:rc59:player-runtime`：在 90 秒硬上限下通过。六次 3001–3401 ms 模型调用完成，稳定 ID 继承、重复对象 0、幽灵任务 0。
- `npm run typecheck`、`npm run build`、`npm run syntax`：通过。

## 1.3.0 标准工作台验收

- `npm run test:rc62:standard`：通过。验证四段状态白盒规则、标准恢复、开箱检查、表格搜索、关键列固定、图谱显式关系优先、旧记录回退标记、非折叠页面与 reduced-motion 动效边界。
- `npm run test:stable`、`npm run test:rc60:whitebox`：通过。验证两级总结信息资格与自定义状态规则进入真实 system prompt。
- `npm run test:rc20:dynamic`、`npm run test:rc29:headers`：通过。动态表格、简化表头和内部字段保护未回归。
- `npm run test:rc51:text-state`、`npm run test:rc52:text-protocol`、`npm run test:rc53:unique-object`：通过。固定文本协议、稳定对象身份和世界书唯一性未回归。
- `npm run test:rc57:snapshot-precision`、`npm run test:rc58:directory-context`：通过。稀疏修订、旧字段保护和上下文压缩未回归。
- `npm run test:rc59:aba`、`npm run test:rc59:abnormal`、`npm run test:rc59:split-save`：通过。聊天切换、HTML/超时/缺标签、分离保存恢复未回归。
- `npm run test:rc59:player-runtime`：通过。六次 3001–3400 ms 离线 Connection Profile 调用完成；空小总结可重试；稳定 ID 继承；对象数 1、重复对象 0、幽灵任务 0。
- `npm run test:rc59:ui`：通过。九页功能分配、触控尺寸、响应式布局与动作映射未回归。
- `npm run typecheck`、`npm run build`、`npm run syntax`：通过。

### UI 合约

- `workspace.ts`、`message-panel.ts` 与 `settings.html` 不再使用 `<details>` / `<summary>` 或设置抽屉折叠。
- 总览提供六项准备度检查和进度条；状态反馈使用 `role=status` 与 `aria-live=polite`。
- 普通页面不显示固定文本协议、稳定 ID 或事实/事件内部标识；诊断页可只读预览 state、small summary、large summary、audit 和 revision 的完整 system prompt。
- 对象表搜索和图谱搜索均提供结果反馈；图谱搜索高亮动画只在未请求 reduced motion 时启用。

### 图谱合约

- `relationshipStates`、`relatedObjects` 和 `relatedEvents` 是首要边来源。
- 只有源对象没有任何显式关联时，才允许从旧文本提及产生 `legacy` 边。
- 图谱不修改快照，不创建事实，不决定对象身份。

### 已知验证边界

- 本轮在容器环境分组执行全部历史回归、受影响链路和玩家延迟流程；没有连接真实 SillyTavern 实机或实体手机。
- 一次性 `npm run verify` 在串行执行到玩家延迟模拟时出现进程悬挂，未取得整条命令退出码 0；该玩家流程随后在 75 秒硬上限下独立完成六次 3002–3401 ms 调用并通过，其后的 UI、白盒、类型、构建和语法检查也分别通过。
- 标准状态 system prompt 去除重复执行段后为 4275 字符，并由 rc.31 合约限制在 4300 字符以内。
- `npm ci --ignore-scripts` 在外部 120 秒限制内未完整退出，但所需本地 esbuild/TypeScript 依赖已安装并实际完成测试、构建和语法检查；不把依赖恢复命令声称为退出码 0。

## 1.2.1 对象准入白盒验收

- `npm run test:rc60:whitebox`：通过。验证默认状态提示词包含对象建档边界、背景板 NPC 排除规则与保守不新建原则。
- 自定义“允许建档条件 / 默认排除条件”会进入实际状态提取 system prompt；流水线不再只调用硬编码默认值。
- 表格管理页包含两个直接可编辑的文本区、保存按钮、恢复严格默认值按钮和完整提示词预览。
- 本次没有修改固定文本标签、解析器、对象 ID、匹配、合并、去重、旧快照保留或世界书同步逻辑。
- `npm run test:rc20:dynamic`、`npm run test:rc29:headers`、`npm run test:rc51:text-state`、`npm run typecheck`：通过。


## 1.2.0 稳定版新增验收

- `npm run test:stable`：通过。验证小总结和大总结使用不同的信息准入本质，不再依赖身份型提示；五段白盒配置可以覆盖默认提示词。
- 小总结默认判断固定为“接下来继续这条事件线，必须知道什么”；保留近期阶段结果、持续影响与未决事项，删除对白、动作流水账和已被结果覆盖的过程。
- 大总结默认判断固定为“即使近期过程全部遗忘，未来跨场景、跨阶段仍必须知道什么”；只保留长期结果、不可逆变化、持续因果和跨阶段约束，不再把小总结逐句缩写。
- 总结页面可以编辑“核心判断、保留内容、排除内容、更新规则、表达规则”，并可查看最终拼接提示词与固定输出协议；没有增加测试区、提示词诊断存储或新的模型调用。
- 表格管理的普通表头编辑已简化为“表头名称｜记录要求”；内部字段键、类型和权限继续由插件维护，旧高级格式仍可兼容读取。
- `npm run typecheck`、`npm run build`、`npm run syntax`：最终稳定版源码均通过。

## rc.59 功能回归

- `npm run test:rc59:aba`：通过。A → B → A 期间 active 非模型异步任务保持 cancelled，不因返回原聊天恢复提交资格。
- `npm run test:rc59:abnormal`：通过。HTML 502/504 不进入状态提交，10 秒超时分类为 timeout，缺结束标签明确拒绝，同轮重复对象合并为一行。
- `npm run test:rc59:split-save`：通过。聊天 artifact 保存成功、metadata 失败后，再次提交复用旧快照，模型调用仍为一次。
- `npm run test:rc59:player-runtime`：通过。离线 Connection Profile 六次调用均使用 3000–3400 ms 延迟；空小总结可立即重试；稳定 ID 继承；没有重复对象或幽灵任务。
- `npm run test:rc59:ui`：通过。验证扁平九页导航、手机横向表格、44px 触控高度、普通同步/维护分离、单次高风险确认和内部字段隐藏。
- `npm run verify` 的全部组成命令均已分别实际通过；单次串行执行因运行环境 300 秒上限在 rc.59 ABA 测试处被中止，因此不把整条聚合命令声称为一次性退出码 0。中止点之后的 rc.59 测试、稳定版专项、TypeScript、构建和语法检查已另行执行并通过。

## rc.59 浏览器 UI 验收

- 用实际 `index.js`、`style.css` 和模拟 SillyTavern 上下文运行，不是静态预览。
- 1280×820、1440×900、360×780、390×820、430×820 的 CSS 视口均完成测量。
- 九个顶部标签逐页打开，`aria-selected` 均正确；切换页面的模型调用数保持 0。
- 430px 最右“诊断”标签经原生滚动安全边距校正后完整可见。
- 360px 对象表保留 `table-header-group`；滚动容器 343px、真实表宽 1344px。390/430px 容器分别为 369/409px。
- 手机业务按钮实测 44px；对象新增、编辑、删除后分别从真实快照重绘。
- 普通同步和按对象维护均执行既有同步函数；UI 状态、世界书名称和最近同步时间从 `ChatState` 回读。
- 连续打开/关闭工作区三次后：监听器 9、工作区根节点 1、模型调用 0。
- 聊天 A→B 显示“尚未整理 / 0 个对象”，切回 A 恢复“本轮已完成 / 4 个对象”。
- 禁用后设置入口、工作区、顶部按钮、正文面板均为 0；重新启用后分别恢复为 1、0、1、1，随后可重新打开工作区。
- 浅色主题使用深色文字/浅色底，深色主题使用浅色文字/深色底；均实际读取计算样式确认。
- 浏览器内核为 Chromium 等效环境；未连接实体 Vivo 手机，也未覆盖真实 VivoBrowser 专有 UA 行为。
- in-app Browser 截图后端把 430 CSS 像素视口输出为 1280×720 图像；报告中的 430px 来自页面 `window.innerWidth` 和布局测量，不以图片像素冒充 CSS 视口。

## 架构验收

已确认模型侧结构化协议全部改为固定文本：

- 审核：`<MA_AUDIT>` / `<MA_VIOLATION>` / `<MA_REPLACEMENT>`；
- 状态：主协议为 `<MA_TURN>` / `<MA_CHANGE>`；旧 `<MA_FACT>` / `<MA_ROW>` 仅作兼容输入；
- 小总结与大总结：`<MA_SUMMARY>`；
- 修正正文：继续返回完整纯正文；
- 连接测试：`<MA_PING>`。

运行时不再存在 `generateStructuredTask`、模型 JSON Schema 校验器、Schema 能力缓存或 JSON 修复模型。当前聊天连接和 Connection Profile 均不发送 `response_format`、`json_schema` 或 `jsonSchema`；状态输入上下文也不再包含序列化 JSON 对象。

## 数据职责验收

- 模型无法指定对象、事实或事件 ID；
- 插件按当前表格注册表解析字段；
- 插件匹配旧对象并沿用稳定 ID；
- 同轮重复对象块先合并；
- 同一聊天、同一表格、同一规范名称无条件归入一个对象；
- 不同事实、事件和时间切面合并到同一对象的分层字段；
- 跨历史快照沿用首次稳定 ID，并改写关联引用与焦点 ID；
- 未返回旧条目继续保留；
- 人工基础字段、全锁条目和历史层权限保持原约束；
- 插件内部设置、快照、任务和诊断继续使用对象/JSON 持久化。

## 自动回归

以下验证已通过：

- 固定文本通用解析：中文/英文等号与冒号、重复字段、续行、原文块；
- 状态上下文 `<MA_CONTEXT_…>` 序列化与旧 JSON 输入拒绝；
- 审核通过、修正、违规明细与替换正文解析；
- 总结槽位完整性、重复槽位、未知槽位与缺失槽位拒绝；
- 状态动态表头映射、插件 ID 分配、同轮合并和旧重复项收拢；
- 自动审核—修正—复审—状态入表；
- 历史失效与事务性重建；
- 多事件线、小总结版本链和大总结固化；
- 世界书待发布计划名称唯一化、同名副本清理、迁移、刷新回读和共享物理书保护；
- 五轮生产链、20 步模拟流程和约 3.2 秒模型延迟下的聊天切换提交守卫；
- 顶部横向滑动导航、移动端布局和工作区动作锁；
- TypeScript `noEmit`、浏览器 ESM 构建和 `node --check index.js`。

专项命令：

```bash
npm run test:rc51:text-state
npm run test:rc52:text-protocol
npm run test:rc53:unique-object
npm run verify
```

## 实机验收重点

1. 升级并刷新 SillyTavern，确认设置中不再出现“兼容模式”和“JSON 修复”。
2. 运行任一任务连接测试，诊断应显示 `protocol: fixed-text`。
3. 处理一条包含已存在角色的正文，确认角色继续沿用原 ID，而不是生成第二条同名记录。
4. 打开曾出现重复条目的旧聊天，确认 V31 将同名对象、关联引用和焦点 ID 合并，并把世界书同步置为待刷新。
5. 让模型在同一次状态返回中重复输出同一对象、同一字段的多个 `<MA_CHANGE>`，确认插件合并为唯一当前结果；旧 `<MA_ROW>` 重复项仍按兼容规则收拢。
6. 同步世界书，确认当前聊天同一表格同一对象只剩一个托管条目，旧 UID 副本被清理。
7. 检查请求体，不应出现 `response_format`、`json_schema`、完整表格 JSON Schema 或序列化的内部对象 JSON。
8. 触发审核、小总结和大总结，确认分别返回固定标签文本并正常写入内部状态。
9. 编辑历史正文并重建，确认旧 JSON 路径不会被调用，历史和世界书事务仍能完成。

## 已知边界

固定文本壳允许字段内容使用自然语言，但外层标签和字段名必须存在。格式缺失时任务明确失败，不会把散文或旧 JSON 猜测为有效数据，也不会静默写入半成品。


## rc.54 世界书界面刷新

- `npm run test:ui-sync`：通过。
- `npm run test:rc54:worldbook-refresh`：通过。
- 验证当前打开的目标书不再并发触发 `reloadEditor` 和 `showWorldEditor`。
- 验证清理后的唯一条目不会被延迟的旧 `change` 渲染覆盖。
- 验证后台未打开的世界书仍使用选择器刷新，不强制打开编辑器。

## rc.55 小总结空响应与队列恢复

- `npm run test:queue`：通过；验证 `No message generated` 失败后，同 key 已从 `inFlight` 释放，第二次手动重试实际执行。
- `npm run test:ui-sync`：通过；验证持久化 `summary=queued` 但无真实任务时，立即小总结按钮恢复可用；真实总结任务运行时仍阻止重复提交。
- `npm run test:generator-lane`：通过；空响应继续被识别为独立模型失败，请求 lane 正常释放。
- `npm run test:derived`、`npm run test:partial`：通过；自动总结失败不回滚核心状态，也不破坏后续派生链。
- `npm run test:rc32:history-recovery`、`npm run test:rc33:recovery-race`：通过；历史恢复和自动任务竞态未回归。
- 完整 `npm run verify` 前半链全部通过；因外部 20 分钟执行上限中断后，从中断点续跑的剩余回归、类型检查、构建和语法检查全部通过。

实机预期：Connection Profile 返回空内容后，任务显示失败；再次点击“立即小总结”会重新调用模型，不再永久停留在“排队/处理中”。



## rc.56 历史核心断点续跑

- `npm run test:rc56:history-resume`：通过。三条累计重建中第二条失败；第二次继续只重新调用第二、第三条，第一条调用结果保持不变。
- `npm run test:rc32:history-recovery`、`test:rc32:history-transaction`、`test:rc33:recovery-race`：通过。历史锁、世界书提交边界和陈旧自动任务取消未回归。
- `npm run test:smart-rebuild`、`test:rc42:chain`、`test:step2`、`test:step3`：通过。旧智能重建、链路缩短、历史失效与受保护提交未回归。
- `npm run test:rc55:summary-retry`：通过。小总结空响应后的队列恢复仍有效。
- TypeScript 类型检查、浏览器构建和 `node --check index.js`：通过。

实机预期：累计历史重建在中间消息失败后，再点“继续重建”应从该失败消息开始；前面已成功消息不会再次产生模型请求。


## rc.57 旧快照精简修订

- `npm run test:rc57:snapshot-precision`：通过。
- 验证相关旧行继续通过 `<MA_CONTEXT_ROW>` 发送，未返回字段由插件保留。
- 验证系统提示没有“最多 4 条”等事实条数硬限制，剧烈变化可一次更新六项以上独立状态。
- 验证摘要、对象定义和单条事实的软字数要求已进入状态提示词。
- 验证仅有空白、末尾标点或数组顺序差异时，插件保留旧字段原值。
- 验证真实内容变化、状态变化、关联对象与关联事件仍完整写入。
- 验证物品未返回的 `baseContent` 固有作用继续保留。
- rc.19–rc.56 全部历史回归、TypeScript 类型检查、浏览器构建和语法检查通过。

实机预期：状态模型仍参考相关旧快照，但只输出本轮真实变化；条目单项更短，未变化字段不再因模型润色反复改写。


## rc.58 对象目录与状态上下文压缩

- `npm run test:rc58:directory-context`：通过。
- 验证 `<MA_DIRECTORY>` 使用单行短目录，不再使用逐对象 `<MA_CONTEXT_INDEX>` 标签块。
- 验证直接命中对象、当前时空、活跃事件和直接关联对象进入精简 `<MA_CONTEXT_ROW>` 工作副本；无关归档对象只在目录中出现。
- 验证目录不是白名单，目录中没有的玄冰玉佩仍可作为新对象提取并由插件生成稳定 ID。
- 验证司夜发生多字段剧烈变化时沿用旧 ID，并一次写入多个当前状态、关系与能力变化。
- 验证工作副本不超过 8 行、每表不超过 3 行；内部事实按相关性排序并压缩。
- 240 个长对象的合成大快照下，状态用户提示为 10,312 字符，低于 13,000 字符验收线。
- rc.20、rc.31、rc.34、rc.36、rc.38、rc.41、rc.51–rc.57 相关状态、事件、身份与历史回归均通过。

实机预期：诊断中的 `promptChars` 应明显低于 rc.56/rc.57 的约 24,000 字符；实际数值仍会随本轮正文长度、命中对象数量和相关内部事实变化。

## 1.3.1 移动端与正文状态区补充验证

- `tests/rc63-mobile-ui-hotfix.ts`：复选框尺寸、移动端表格固定列移除、表头模糊层移除、标题栏触控尺寸、导航顺序和记忆层级映射。
- `tests/rc64-inline-panel-collapse.ts`：正文状态详情默认收起、展开状态保持、无障碍展开属性、独立工作区入口和收起后不占位。
- 已通过 `typecheck`、浏览器构建与 `node --check index.js`。


## 1.3.2 地点与全局条目分流验证

- `tests/rc65-entry-routing.ts`：验证默认地点视图存在、全局对象语义边界、地点新建、已有全局对象的跨表归属锚定，以及人工移动误分类条目。
- `tests/rc31-state-patch-compaction.ts`：标准状态系统提示为 4,700 字符以内。
- `tests/rc60-state-prompt-whitebox.ts`、`tests/rc62-standard-workbench.ts`：新增分流规则继续保持白盒可编辑，并纳入标准规则判断。
- `typecheck`、浏览器构建和 `node --check index.js`：通过。
