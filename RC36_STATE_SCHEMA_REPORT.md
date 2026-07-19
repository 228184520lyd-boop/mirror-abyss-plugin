# Mirror Abyss 1.2.0-rc.36 状态 Schema 根因修复报告

流水线：`ma-pipeline-38`

## 一、实机证据

rc.35 在同一聊天、同一当前连接、同一模型配置下产生了清晰的 A/B 结果：

- 审核请求携带 JSON Schema，约 6.1 秒成功；
- 状态请求携带 JSON Schema，约 2.0 秒立即返回 `Bad Request`；
- 同一状态请求随后以普通 JSON 回退，约 27.7 秒成功；
- 再次处理同一 Schema 时，精确 Schema 指纹缓存生效，直接走普通 JSON。

因此可以排除“当前连接完全不支持 JSON Schema”。故障范围收敛为状态 Schema 自身被当前供应商或代理拒绝。

## 二、根因

rc.35 的供应商侧状态 Schema 将八张动态表逐表展开，测量结果为：

- 约 10,114 字节；
- 147 个属性定义；
- 最大嵌套深度约 11 层。

审核 Schema 体积和层级显著更小，且在同一连接成功。SillyTavern 在发送前会做供应商适配，但不会替扩展重构业务协议。当前连接对小型 Schema 可用，对大型、深层状态 Schema 快速拒绝。

根因不是 JSON.parse，也不是酒馆没有解析响应，而是镜渊把完整八表业务约束全部塞进供应商侧 Schema，超过了当前接口可接受的复杂度边界。

## 三、rc.36 修复

### 1. 供应商传输 Schema 改为最小 operations

状态输出根节点改为：

```json
{
  "turnSummary": "本轮变化",
  "facts": [],
  "operations": [
    {
      "op": "upsert",
      "table": "characters",
      "id": "char-1",
      "title": "角色",
      "content": "当前摘要",
      "keywords": ["角色"],
      "status": "active"
    }
  ]
}
```

当前只开放 `upsert`：

- 无变化：不返回 operation；
- 未返回对象：保留旧行；
- 不提供隐式清表；
- 不提供模型侧删除；
- `recentHistory / solidifiedHistory` 继续只允许总结模块维护。

### 2. 完整八表 Schema 保留在镜渊本地

供应商侧 Schema 只负责约束最小传输格式。模型返回后：

1. operations 被本地转换成原有 snapshot 补丁；
2. 再使用完整动态表格 Schema 校验；
3. 表格专属字段放入错误表时仍会拒绝；
4. 校验失败不覆盖旧状态。

因此，本次减小供应商 Schema 不等于放宽入库约束。

### 3. 减重结果

默认八表测量：

- rc.35 完整供应商 Schema：约 10,114 字节、147 个属性、深度 11；
- rc.36 operations 传输 Schema：约 2,640 字节、42 个属性、深度 9；
- 体积下降约 74%。

### 4. 诊断增强

请求诊断新增：

- `jsonSchemaName`；
- `jsonSchemaBytes`。

实机可直接确认真正发出的 Schema 名称和体积，不再只看到 `hasJsonSchema`。

## 四、录屏额外发现

录屏显示历史恢复处于 `publishing-lorebook` 时，玩家点击继续/手动处理，新的普通 state 任务进入队列，并在恢复完成后运行。

rc.36 增加入口阻断：

- 历史恢复存在时，普通手动正文处理不入队；
- 返回真实 `blocked` 原因；
- 历史恢复自身任务和 rc.33 自动迟到事件幂等逻辑不变。

这属于任务入口竞态，不是状态 Schema 400 的根因，但由本次实机录屏一并确认并修复。

## 五、自动回归

`npm run verify` 已通过。新增 rc.36 专项覆盖：

- 传输 Schema 明显小于完整 Schema；
- operations 不允许写近期经历和历史事实；
- 动态表键枚举正确；
- operations 可归一化为现有 snapshot 补丁；
- 供应商侧轻量 Schema 与本地完整 Schema 分离；
- 角色专属字段写入物品表会在本地完整校验阶段拒绝；
- rc.33 历史恢复竞态、rc.35 JSON 分类及全部既有回归不回退。

## 六、实机判定标准

rc.36 首次状态请求预期出现：

- `requestPurpose: "schema"`；
- `hasJsonSchema: true`；
- `jsonSchemaName: "MirrorAbyssStateOperationsV36"`；
- `jsonSchemaBytes` 约 2,640；
- 不出现紧随其后的 state `fallback` 请求。

若仍返回 400，精确 Schema 指纹回退仍会保护主链，但需要根据新的 `jsonSchemaName/jsonSchemaBytes` 继续做更小粒度兼容定位。
