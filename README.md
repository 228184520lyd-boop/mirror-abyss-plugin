# Mirror Abyss / 镜渊

版本：`4.0.38`

Mirror Abyss 是一个轻量的 SillyTavern 模型记忆搬运工具。

```text
正文 / 玩家操作
→ 读取当前世界书
→ 调模型
→ 读取约定格式
→ 按 UID / 稳定名称修改条目
→ saveWorldInfo()
→ UI
```

运行源码只有五个普通 JavaScript 文件：`app.js`、`host.js`、`memory.js`、`prompts.js`、`ui.js`。没有事务、Recovery、Repository、CAS、Snapshot、Reconcile、锁系统。

Edit / Swipe / Delete 使用一份最小撤回记录：只保存该消息操作前的条目值。消息失效时撤回那次操作；新增恢复为不存在，修改恢复为修改前，删除恢复被删除条目。世界书条目本身不保存消息来源追踪。

UI 是文字游戏皮肤：当前场景、游戏选项式操作、世界档案、设定录入和选项页。动态视觉仅由 CSS 的纸面颗粒、浮尘与轻微呼吸动画实现，不参与业务逻辑。
