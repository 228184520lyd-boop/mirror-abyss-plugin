# Mirror Abyss 1.2.0-rc.18 验收记录

流水线：`ma-pipeline-21`

## 自动验证结果

执行 `npm run verify`，以下项目全部通过：

- Step 1：人工行、人工未锁定行、自动锁定行、遗漏保护行、普通自动行更新和引用隔离。
- Step 2：历史变化取消活动请求、拒绝旧 artifact 提交、取消旧排队任务及不回写旧结果。
- Step 3：保存期间切换聊天、源 context 绑定、目标聊天保存零调用及 ChatState 隔离。
- 单执行器优先队列：活动任务不抢占，待执行正文状态越过大总结。
- 相同 key 去重并共享 Promise。
- 禁用后的活动任务代次失效和 `cancelled` 状态。
- 聊天切换只取消旧聊天排队任务，不取消新聊天任务。
- 超过 200 条记录时保留所有 running/queued，结束后再裁剪历史。
- 同 lane 单请求及待执行请求优先级。
- 不同 lane 相互独立。
- 排队模型请求可取消，并记录请求耗时。
- 自动触发边界拒绝玩家、系统、空白和来源不明消息。
- 审核提示词与 Schema 的 `replacementText` 约束一致。
- 审核结构化请求遇到内部服务器错误时，只回退一次无 Schema 请求。
- 状态提取结构化请求遇到内部服务器错误时，只回退一次无 Schema 请求。
- 结构化兼容回退不受“JSON格式修复”开关影响；无 Schema 返回若仍格式异常，最多再执行一次既有格式修复。
- 当前连接与 OpenAI Connection Profile 的连接测试均会在 Schema 请求失败时回退一次。
- 结构化输出返回 `{}` 时不再误判为 `revise`，而是回退或明确失败。
- 审核格式修复目标结构包含 `replacementText`。
- 空 `replacementText` 会进入修正模型调用。
- 修正模型技术故障不会触发内容隐藏回退。
- 诊断报告不包含小总结或大总结正文。
- 正文核心状态在后台小总结结束前返回。
- 小总结失败后，大总结仍可独立成功；最终阶段状态保留部分失败信息。
- esbuild 浏览器 ESM 构建通过。
- 最终 `index.js` 通过 Node 语法检查。
- 最新角色消息面板中的六个阶段按钮均存在，并映射到审核、修正、表格、小总结、大总结和世界书同步后端动作。
- 审核按钮不会顺带调用修正或状态；修正按钮只调用修正与必要复审。
- 修正成功后旧状态表不会继续留在当前正文上。
- 最新 swipe 正文显式重新整理成功后，历史同步暂停可安全解除。
- 表格成功后总结/同步状态立即写为 queued 或 skipped。
- 世界书保存后先等待 `updateWorldInfoList()`，再调用 `reloadWorldInfoEditor(name, loadIfNotSelected)`；当前目标或强制同步继续等待 `showWorldEditor(name)` 完成条目 DOM 重绘。
- 聊天世界书关联写入后立即更新 `.chat_lorebook_button.world_set` 状态，不再等待聊天重新载入。
- npm 依赖审计：0 个已知漏洞。

## 静态检查结果

- 版本在 `package.json`、`package-lock.json`、`manifest.json` 和运行时常量中一致。
- 没有业务代码使用 `localStorage`、`localForage` 或 `IndexedDB`。
- 没有直接供应商 `fetch`、Bearer Token 或 API Key 存储。
- 自动事件无法解析时不再回退到最后一条正文。
- 所有业务任务仍经同一 TaskQueue；没有新增无界业务并发。
- 自动派生任务的优先级低于正文关键链。
- 诊断只输出 ChatState 数量和状态，不输出总结正文。
- 世界书清理条件仍要求托管标记与完全相同 `chatKey`。
- 数据结构版本保持 `schemaVersion: 1`，未增加迁移负担。

## 未完成的真实环境验收

以下项目不能由离线测试替代：

1. 目标 SillyTavern 版本的 `MESSAGE_RECEIVED / EDITED / SWIPED / DELETED` 实际 payload。
2. `generateRaw` 和 `ConnectionManagerRequestService` 对 signal、超时和 JSON Schema 的真实兼容性。
3. 两个消息索引相同的聊天间快速切换压力测试。
4. 世界书创建、更新、暂停、清理、编辑器刷新和 UID 行为。
5. 连续 50—100 条正文、多次切聊天和多次历史重算。
6. 手机浏览器布局与触控。

## 恢复源码限制

原 rc.10 source map 没有携带纯类型模块 `src/types.ts`。本版没有伪造该文件，因此不宣称完成严格 TypeScript 类型检查；所有可执行源码均由 esbuild 成功打包并经过运行测试。
