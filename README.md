# Mirror Abyss｜镜渊

SillyTavern 开放世界叙事审核与长期记忆插件，冻结架构 V1.0 实现版。

版本：`2.0.0-frozen.1`

## 核心边界

世界书是唯一长期剧情数据源。镜渊不保存人物表、事件表、事实账本或剧情副本，也不替代 SillyTavern 的关键词召回、向量、递归、深度和排序机制。

插件只调用模型完成四类语言任务：

1. 审核正文；
2. 提取事实与状态；
3. 生成小总结；
4. 生成大总结。

审核不通过时，审核模块内部只额外调用一次修正模型并要求完整修正版；不循环修正。

## 主流程

`AI 正文 → 聊天快照 → 一次审核 → 必要时一次修正 → 事实提取 → 确定性匹配 → 世界书两阶段事务 → 分层总结`

- 每个聊天同时最多一个核心流程。
- 每次模型返回、世界书读取和保存前都会校验聊天、消息、正文哈希、世界书与设置快照。
- 快速连续生成时取消旧正文资格，并在旧任务收尾后处理最新 AI 正文。
- 只有精确的 `无` 表示确定性 no-op。
- 创建和更新保存并回读成功后，才允许归档或按真实 UID 删除。
- 保存失败、聊天切换、正文变化、超时或取消时不更新完整处理游标。

## 世界书规则

默认标题为 `类型｜名称`，正文按 `【小标题】` 组织信息点。

匹配顺序固定为真实 UID、完全标题、标准化标题、类型与名称、同类型别名、关键词、关联条目、小标题与正文相似度。名称明显不同时不会仅凭模糊相似度覆盖旧条目。

当前状态按状态槽替换；固定事实变化会保留旧值到历史；重复事实不会跨小标题复制。焦点、手动锁定和基础设定条目受退出保护。玩家焦点每个聊天最多一个，只设置 `constant`。

## 工作区

控制面板包括：

- 总览
- 信息表
- 关键词
- 匹配
- 记忆网络
- 设置

工作区只在玩家打开时读取当前绑定世界书，关闭后清空映射。关系图只在打开“记忆网络”页时计算，支持居中、缩放、拖动、适配、复位、节点查看和触控操作。

启动阶段不会读取世界书、扫描消息、计算关系图或调用模型；未使用全局 `MutationObserver` 或轮询循环。

## Connection Profile

审核、修正、提取、小总结、大总结和世界书格式整理可分别选择 Connection Profile。留空时使用当前聊天连接，不需要在插件内填写 API Key。

## 旧世界书整理

“整理世界书格式”是独立手动维护功能，只处理旧格式或结构异常条目。它保留真实 UID、关键词、原生字段和扩展字段；无法识别的原文进入 `【旧格式保留】`。保存失败自动恢复临时备份，并提供一次“撤销上次整理”。

## 安装

将安装包 ZIP 作为 SillyTavern 第三方扩展安装。安装包根目录包含：

- `index.js`
- `manifest.json`
- `README.md`
- `LICENSE`

安装后先在设置页选择当前聊天绑定的世界书；默认不会自动创建或绑定世界书。

## 控制台 API

```js
await MirrorAbyss.processLatest();
await MirrorAbyss.audit();
await MirrorAbyss.extract();
await MirrorAbyss.smallSummary();
await MirrorAbyss.largeSummary();
await MirrorAbyss.migrateWorldbook();
await MirrorAbyss.undoWorldbookMigration();
await MirrorAbyss.cancel();
await MirrorAbyss.getSettings();
await MirrorAbyss.configure({ auditEnabled: false });
await MirrorAbyss.status();
```

## 开发与验证

```bash
pnpm test
```

`build.mjs` 会把 `src/` 递归构建为安装入口 `index.js`。自动化覆盖审核 1+1、严格 no-op、状态槽替换、重复抑制、聊天切换、快速连续正文、世界书两阶段事务、焦点保护、分层总结、整理回滚、启动零工作、移动端工作区及源码与 bundle 一致性。

自动化和模拟通过不等同于所有 SillyTavern 版本的实机证明；发布前仍建议用目标桌面端与手机端版本做安装冒烟测试。
