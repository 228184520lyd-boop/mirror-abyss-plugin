# Mirror Abyss 最终候选 v1 修改清单

版本：`3.0.0-lite.ui.10-final-candidate-v1`  
部署包：`Mirror-Abyss-final-candidate-v1.zip`

## 最终结果

- 世界书保持唯一长期事实源；业务读取不再命中运行时解析事实缓存，而是重新打开当前绑定的权威世界书。
- 模型继续负责语义提取、栏目选择和总结；插件只负责格式校验、确定性计划、UID、调度、事务、保存、权威回读与回滚。
- 唯一提取协议保持为：`事实｜类型｜稳定名称｜栏目｜建立/变化/结束｜关联对象｜完整事实`。
- 未新增 Provider、Prompt 来源、模型业务链、世界书结构、UID 体系或写入入口。

## 生产代码修改

1. 删除 `WorldbookAdapter` 的运行时事实缓存、缓存计数、命中返回、记忆重建和失效监听；所有正式读取直接解析权威世界书返回值。
2. 删除插件根据临时名称或关键词自动补写“临时 / 身份未明”的逻辑，避免插件越权推断事实标签。
3. 收紧 JSON 兼容层：
   - 接受完整 JSON 对象、对象数组、Markdown JSON 外壳及说明文字中的第一个完整 JSON 值。
   - 只做固定键别名映射，再进入同一七字段协议解析器。
   - 类型、稳定名称、栏目、变化、关联对象、完整事实任一键缺失即拒绝。
   - 不再给缺失的变化字段默认补“变化”；变化值必须明确为建立、变化或结束。
4. 在提取模型请求前增加小范围固定词表薄清洗：只修改传输副本，以中性/临床表达替换显式成人行为、生殖部位和体液词面；不修改原聊天正文、世界书或事务快照，不使用上下文推断。
5. 保留 ui.9.1 的 `MESSAGE_RECEIVED + GENERATION_ENDED` 兼容入口及 650/220ms 稳定检测；同一正文的完成事件会替换先前定时器。
6. 统一 `app.js` 版本、`manifest.json`、`index.js` 动态导入缓存键和 README。

## 基准与文档修改

- 修复 `dead-code-audit.mjs` 对模板字符串 `${...}` 内真实函数调用的假阳性。
- 更新 `debt-cleanup-benchmark.mjs`，使验收目标与 ui.9.1 双事件运行修复一致，并新增无事实缓存、无插件临时身份推断和严格 JSON 兼容断言。
- 扩充 `extraction-chain-benchmark.mjs`：覆盖 JSON 对象/数组、键别名、说明文字包裹、外层括号、缺变化、缺关联对象和薄清洗。
- 新增 `runtime-chain-benchmark.mjs`：行为验证同一正文经两个正常宿主事件只进入一次正式任务队列。
- README 已记录最终候选的真实实现，不再把历史 ui.6/ui.8 目标误写成当前目标。

## 代码级验收

以下随包基准全部通过：

- `node dead-code-audit.mjs app.js`
- `node debt-cleanup-benchmark.mjs app.js`
- `node engineering-chain-benchmark.mjs app.js`
- `node runtime-chain-benchmark.mjs app.js`
- `node extraction-chain-benchmark.mjs app.js --assert-clean`

另已执行：JavaScript 语法检查、JSON manifest 解析、版本/缓存键一致性、source/deploy 五个部署文件逐字节一致性和压缩包完整性测试。

## 外部验收边界

容器内验证不能替代真实 SillyTavern 的长时间游玩与宿主版本组合测试。最终候选已经覆盖可重复的静态、行为和事务链代码级验收，但仍应在目标 SillyTavern 环境中验证安装、启动、自动提取、编辑/滑动/删除回滚及长对话稳定性。
