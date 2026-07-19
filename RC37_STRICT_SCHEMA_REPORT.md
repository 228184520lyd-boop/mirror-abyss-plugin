# rc.37 严格扁平状态 Schema 根因报告

## 实机证据

rc.36 在同一当前连接上得到以下结果：

- audit：Schema 成功，约 6.6–8.2 秒；
- state：Schema 在约 1.95 秒内返回 `Bad Request`；
- state fallback：普通 JSON 成功，约 18.7 秒；
- 下一轮相同 state Schema 命中精确拒绝缓存，直接走 plain，约 46.3 秒；
- 状态和世界书最终成功，没有发生隐式清表。

这证明：

1. 连接和模型具备结构化输出能力；
2. rc.35 的连接级误判修复有效；
3. rc.36 仅缩减 Schema 体积仍不足；
4. 当前最需要验证的是 Schema 严格性和可选动态属性，而不是继续盲目压缩正文或增大超时。

## rc.36 与审核 Schema 的关键差异

审核 Schema：

- `strict: true`；
- 所有对象属性全部 required；
- 固定字段；
- 同连接实机成功。

rc.36 状态 Schema：

- `strict: false`；
- operation 中大量动态可选属性；
- 同一 operation 混合所有表格字段；
- 实机快速 400。

## rc.37 修复

状态供应商协议改为严格扁平结构：

```json
{
  "turnSummary": "本轮变化",
  "facts": [{
    "fact_id": "f1",
    "event_id": "e1",
    "type": "event",
    "title": "事件",
    "occurred": ["结果"],
    "unresolved": [],
    "status": "active",
    "time_start": "当前",
    "time_end": "",
    "time_label": "",
    "related_entities": ["角色"],
    "keywords": ["事件"],
    "operation": "update",
    "confidence": "confirmed"
  }],
  "operations": [{
    "op": "upsert",
    "table": "characters",
    "id": "c1",
    "title": "角色",
    "content": "当前摘要",
    "keywords": ["角色"],
    "status": "active",
    "fields": [{"key": "currentStates", "values": ["当前状态"]}],
    "lifecycle": {
      "existence": "",
      "activity": "",
      "memory": "",
      "evidenceLevel": "",
      "evidence": "",
      "returnConditions": [],
      "returnBlockers": []
    }
  }]
}
```

约束：

- `strict: true`；
- 每一级 object 的 properties 全部 required；
- 每一级 object 均 `additionalProperties: false`；
- 动态字段的合法性和类型由当前表格注册表本地校验；
- `recentHistory / solidifiedHistory` 继续禁止状态提取写入；
- 空 lifecycle 不覆盖旧 lifecycle；
- 旧 rc.36 direct-fields 与 snapshot 返回继续兼容。

默认 Schema 测量：

- 约 2,304 字节；
- 35 个属性；
- 5 个 object Schema；
- 完整八表 Schema仍只用于本地验证。

## 回归结果

完整 `npm run verify` 通过，包括：

- rc.31–rc.36 历史回归；
- rc.37 strict object required 完整性；
- 动态字段还原；
- lifecycle 还原；
- 非法跨表字段拒绝；
- 状态禁写总结字段；
- 多事件线、小总结、大总结、世界书、聊天隔离和焦点 constant；
- 构建与浏览器语法检查。

## 尚待实机确认

本地无法证明目标中转接口会接受 V37。下一轮只需确认首个 state 请求是否以 `MirrorAbyssStateOperationsV37` 直接成功。若仍快速 400，下一优先级将转向该中转接口对字段数量或嵌套的私有限制，并采用最小探针逐级定位，不再凭推测继续修改业务协议。
