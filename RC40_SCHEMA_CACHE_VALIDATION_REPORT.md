# RC40 Schema 拒绝缓存提交时机修复报告

版本：`1.2.0-rc.40`  
流水线：`ma-pipeline-42`

## 实机现象

历史恢复中的 state 请求没有发送已经实机成功的 `MirrorAbyssStateOperationsV37`，诊断只出现：

- `requestPurpose: plain`
- `hasJsonSchema: false`
- `responseTokens: 4096`
- 输出在 JSON 对象结束前截断

连续重试仍重复相同 plain 截断路径。

## 根因

rc.39 的具体 Schema 拒绝缓存写入发生在 fallback 网络请求返回后、JSON 解析和业务校验之前：

```text
Schema 被 400 拒绝
→ plain fallback 网络请求成功
→ 立即缓存“该 Schema 被拒绝”
→ plain 内容随后被判定截断/无效
→ 下次任务因缓存直接 plain
```

因此，失败的 fallback 也会永久支配当前浏览器会话。旧缓存还被持久化在 `sessionStorage`，刷新和版本升级后仍可能继续绕过严格 Schema。

## 修复

1. `generateWithSchemaFallback` 不再直接提交具体 Schema 拒绝缓存，只返回待提交标记。
2. 仅当 fallback 输出完成以下步骤后才提交缓存：
   - JSON 对象完整解析；
   - 供应商轻量协议归一化成功；
   - 镜渊本地完整业务 Schema 校验通过。
3. fallback 截断、语法错误、业务结构错误时不缓存。
4. 若任务因已有具体 Schema 缓存直接走 plain，而该 plain 输出失败，则删除该缓存；下一次重试重新探测 Schema。
5. 具体 Schema 拒绝改为当前页面内存缓存，不再写入 `sessionStorage`。
6. 新存储键为 `mirrorAbyss.schemaCapabilities.v40`，只持久化明确的连接级“不支持结构化输出”。启动时清理：
   - `mirrorAbyss.schemaCapabilities.v35`
   - `mirrorAbyss.schemaUnsupported.v31`
7. 审核和连接测试同步使用“结果有效后再缓存”的规则。

## 未修改内容

- `MirrorAbyssStateOperationsV37` Schema；
- 状态输出上限 4096 tokens；
- 状态提示词与表格协议；
- 历史恢复事务和世界书发布；
- 业务/诊断双通道调度；
- 5xx 不触发 fallback 的 rc.39 规则。

## 回归标准

- 400 + 截断 fallback 后，下一次仍发送 Schema；
- 400 + 有效 fallback 后，当前页面后续可跳过同一具体 Schema；
- 缓存绕过后的 plain 截断会清缓存；
- 旧持久化具体 Schema 拒绝升级后被删除；
- 全部既有回归、类型检查、构建和浏览器语法检查通过。
