# Mirror Abyss / 镜渊

版本：`1.2.0-rc.52`　流水线：`ma-pipeline-52`

镜渊是 SillyTavern 前端扩展。它在角色正文生成完成后执行规则审核、必要的定向修正、内部事实提取、对象化状态维护、按事件线的小总结与大总结，并将当前聊天记忆发布到世界书。

## rc.52 核心架构

模型不再生成 JSON、稳定 ID 或完整数据库对象。审核、状态提取、小总结和大总结统一使用固定标签文本；插件负责解析、对象匹配、合并、去重、分发表格、生成或沿用 ID、本地校验以及最终存储。

```text
模型：固定标签 + 自然语言字段
  ↓
插件：拆壳 → 规范化 → 匹配旧对象 → 合并重复项 → 分配 ID → 校验
  ↓
内部：JavaScript 对象 / JSON 持久化 → 快照 → 世界书
```

JSON 仍用于插件内部设置、聊天状态、任务、快照、迁移和诊断导出；它不再进入模型通信协议。模型输入中的旧事实、对象索引和相关旧行同样使用 `<MA_CONTEXT_…>` 固定文本块。

## 自动处理顺序

```text
角色正文
→ 固定文本审核
→ 必要时生成纯正文修正版并再次审核
→ 固定文本事实/对象补丁
→ 插件本地合并、去重与 ID 管理
→ 固定文本小总结/大总结
→ 插件内部快照与世界书发布
```

核心事实与状态先提交；总结或世界书失败不会回滚已经成功的核心结果。

## 模型固定文本协议

### 审核

```text
<MA_AUDIT>
result=pass|revise|block
reason=一句话结论
preserve=必须保留的事实
rewrite=定向修正指令
</MA_AUDIT>

<MA_VIOLATION>
rule_id=规则编号
rule=被违反的规则
evidence=明确证据
action=具体修改方式
</MA_VIOLATION>
```

### 状态与表格

```text
<MA_TURN>
summary=本轮变化
</MA_TURN>

<MA_FACT>
event=事件稳定名称
title=事实名称
status=active
confidence=confirmed
occurred=已发生结果
unresolved=尚未解决事项
related=直接受影响对象
</MA_FACT>

<MA_ROW>
table=characters
object=陆云舒
summary=当前有效摘要
keyword=舒儿
field.currentFacts=当前客观事实
field.currentStates=当前阶段状态
</MA_ROW>
```

模型不得输出 `id`、`fact_id`、`event_id`。插件按表格、对象名、登记别名、事实与事件关联匹配旧记录；匹配成功沿用旧 ID，无法匹配时才创建新 ID。同一轮重复块先在插件内合并。

### 小总结与大总结

```text
<MA_SUMMARY>
slot=S1
title=事件线标题
summary=自然语言总结
keyword=关键词
unresolved=尚未解决事项
</MA_SUMMARY>
```

`slot` 只是本次请求的路由标签。内部事件 ID、总结 ID、版本链和固化关系全部由插件维护。

## 连接方式

每项任务可使用：

- 当前聊天连接；
- SillyTavern Connection Profile。

所有模型请求都不发送 `response_format`、`json_schema` 或 JSON Schema，也不把内部对象通过 `JSON.stringify` 交给模型。原 rc.49“兼容模式”和 JSON 修复开关已移除；旧设置会在加载时自动清理。

## 表格身份与去重

- 模型只描述对象，不管理数据库身份；
- 插件先匹配稳定名称和已登记关键词；
- 事实 ID、事件 ID、对象 ID 均在插件内部生成或沿用；
- 同名但无法证明相同的对象不会强行合并；
- 能由共同事实、事件、别名或完全相同内容证明相同的旧重复行会收拢；
- 人工基础字段和锁定条目继续受原保护规则约束。

## 界面

工作区使用顶部横向滑动标签，桌面和移动端共用同一导航。设置、连接、表格管理、对象编辑、总结、世界书、任务和诊断入口均保留。

## 构建与验证

```bash
npm install
npm run verify
```

`npm run verify` 覆盖固定文本解析、模型请求无 Schema、对象匹配与去重、审核修正链、历史重建、总结版本链、世界书事务、聊天切换守卫、移动端 UI、类型检查、浏览器构建和语法检查。

详细变更见 `RC52_FIXED_TEXT_PROTOCOL_REPORT.md`，验收结果见 `VALIDATION.md`。旧版本报告保存在源码包的 `docs/history/`，不随安装包发布。
