# Mirror Abyss / 镜渊

版本：`4.0.36`

Mirror Abyss 是一个轻量的 SillyTavern 模型记忆搬运工具。

主链只有：

```text
SillyTavern 正文 / 玩家操作
→ 读取当前世界书
→ 调模型
→ 读取约定格式
→ 按 UID / 稳定名称修改条目
→ saveWorldInfo()
→ UI 展示
```

代码原则：普通函数、普通对象、Promise、try/catch。没有事务系统、Recovery 系统、权威回读系统、CAS、Registry、Envelope、Snapshot、Reconcile、复杂锁。

保留功能：自动提取、审核、自动/手动小总结与大总结、人工合并、世界设定导入、UID 条目管理、基石、焦点、文件夹、定义前后、召回、Edit/Swipe/Delete 简单回滚、撤回、旧条目标记迁移、模型测试、重置。

运行状态只保存在内存。SillyTavern 保存接口成功即视为成功；明确报错就把错误交给用户。
