# Mirror Abyss / 镜渊

版本：`4.0.0-clean.2`

Mirror Abyss 是 SillyTavern 的长期游玩记忆扩展。世界书是唯一长期事实源；模型负责语义整理，插件只负责固定协议、精确身份、UID、单一事务入口、任务编排和界面。

## 单一链路

```text
UI或宿主事件 → Controller → Memory/Import → ModelGateway + Protocol → WorldbookRepository → SillyTavern
```

- 提示词、协议校验、正文栏目和界面类型均读取 `src/core/schema.js`。
- 世界书读取、写入与回滚只经过 `WorldbookRepository`；只有带镜渊标记的世界书条目才归镜渊管理。
- 条目身份严格使用“类型＋稳定名称”；不做相似度、包含关系或别名猜测。
- 模型不读取或输出 UID。
- 世界设定粘贴文本与 TXT 共用“AI整理 → 预览 → 确认写入”链。
- 世界设定、提取和总结均使用自然事实行协议，不使用额外对象外壳。

## 安装

本仓库根目录即 SillyTavern 扩展目录，`manifest.json`、`index.js` 和 `style.css` 不位于额外子目录中。

在 SillyTavern 中打开扩展面板，选择“安装扩展”，粘贴本 GitHub 仓库地址。安装完成后启用“Mirror Abyss / 镜渊”。

## 验证

```bash
node --test tests/*.test.mjs
```

架构边界和修改路由见 `ARCHITECTURE.md`，错误定性见 `ERROR-CATALOG.md`。
