# Mirror Abyss / 镜渊 3.0.0-lite.ui.1-exact-match

世界书唯一长期事实源 · 单一模型协议 · SceneGroup 场景粗化 · 确定性精确匹配

## 架构职责（基准）

| 角色 | 职责 |
|------|------|
| **世界书** | 唯一长期剧情事实源。UI、召回、总结均从世界书读取或确定性投影。 |
| **模型** | 唯一主要语义解释层：审核、事实、总结抽象、人工合并语义。 |
| **插件** | 只做确定性工作：固定协议校验、精确身份匹配、栏目模板、事务提交/回滚、SceneGroup 索引、召回映射、宿主边界保护。 |

**禁止**：相似度/子串包含猜测同一对象；本地推断从属吸收目标；reasoning 协议抢救；第二套 repair 模型阶段。

## 包说明

### 1. 可部署安装包（SillyTavern）

`Mirror-Abyss-3.0.0-lite.ui.1-exact-match-deploy.zip`

直接解压到 SillyTavern 的 `public/scripts/extensions/third-party/mirror-abyss/`（或通过扩展安装入口导入），包含：

- `manifest.json` — 扩展元数据与钩子
- `index.js` — 浮动加载器
- `app.js` — 打包后的核心逻辑
- `LICENSE` / `README.md`

### 2. 源码包

`Mirror-Abyss-3.0.0-lite.ui.1-exact-match-source.zip`

在可部署文件之外提供 `src/` 模块源码，便于阅读与二次开发：

```
src/
  application.js          # 主流程编排
  audit.js / revision.js  # 审核与修正
  parser.js / protocols.js / prompts.js
  memory.js               # 提取、SceneGroup、小/大总结
  migration.js            # 重建与迁移（精确证据）
  matcher.js              # 精确身份匹配
  model-request.js        # 请求与受控重试
  worldbook.js / host.js / ...
  domain/information-point.js  # TYPE_SECTION_ORDER
  ...
```

每个源码文件头部均有**职责说明**与**架构约束**注释。

重新打包核心（若修改了 src/）时，需将各模块按原 CommonJS 工厂形式合并回 `app.js`（仓库当前交付物已含合并结果）。

## 本次收束摘要

- 事件/地点/事实/身份匹配改为规范化后**精确相等**（去掉 bigram、子串包含猜测）。
- 吸收并入仅执行模型**显式**「并入/归并/附属」。
- 重建证据承接只认显式引用与精确文本，不做覆盖率猜测。
- 注释按模块职责重写，去掉过时的「历史防御」叙述噪音。

## 协议要点

- 审核：`审核结论：通过` / `审核结论：需要修正` + 问题列表  
- 提取：`事实｜类型｜稳定名称｜建立|变化|结束｜关联对象｜完整事实` 或 `无`  
- 小/大总结：`写回|移除|沉降｜...` 或 `无`  
- 栏目名称必须来自 `TYPE_SECTION_ORDER` 对应类型合法栏目  

## 安装与验证建议

1. 安装扩展并启用，确认浮动按钮可启动面板。  
2. 绑定世界书，跑一轮提取，确认写入与回读一致。  
3. 换场关闭 SceneGroup 后观察小总结队列。  
4. 手动触发大总结；失败小总结可精确重试。  

当前为代码级候选状态，需在 SillyTavern 实机做长时间游玩验证。

## License

GNU Affero General Public License v3.0 only.
