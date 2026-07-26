# Mirror Abyss 2.0.0-alpha.5-realtest.1

这是镜渊全面重构后的**入口修复实机候选**。它针对上一候选在真实 SillyTavern 中出现的：

```text
扩展程序加载失败：[object Event]
```

进行了宿主加载边界修复。

## 已确认原因

SillyTavern 在执行扩展生命周期 hook 之前，会先加载 manifest 指定的 JS 与 CSS。任一资源加载失败时，宿主保存的是原始 DOM Event，并直接转成字符串，因此界面只剩 `[object Event]`。上一版本的错误聚合逻辑位于 `onActivate` 之后，无法捕获这个更早阶段的失败。

本版本将初始加载面收敛为一个根目录模块：

```text
manifest.json
index.js
```

manifest 不再单独请求 `style.css`；样式由 `index.js` 注入。这样宿主初始阶段只有一个 JS 资源，进入生命周期后，后续错误由镜渊自己的可读错误面板接管。

## 安装结构

```text
manifest.json
index.js
dist/DEPENDENCIES.json
dist/runtime/**
dist/runtime/vendor/**
```

业务 runtime 只保留一套。React、Redux Toolkit、Zod、p-queue 等成熟依赖通过六个 vendor shim 分别按以下顺序回退：

1. `esm.sh` 精确版本；
2. `jsDelivr +esm` 精确版本。

这仍不是完全离线、自包含的 Webpack 产物，但不再复制两套业务 runtime。输出 JavaScript 从 67 个降为 41 个，安装文件总数从 80 个降为 48 个。源码包为避免 GitHub 网页上传接近 100 文件，不携带生成后的 `dist/**` 与根 `index.js`；运行 `npm run build:installable` 可重新生成。

## 当前纵向链

```text
SillyTavern 消息事件 / 手动按钮
→ 固定聊天身份与每聊天串行
→ 可选审核
→ 必要时最小修正并回读正文
→ 扁平事实提取
→ 保存 chatMetadata.ChatDocument
→ Redux / React UI 刷新
```

## 构建与验证

```bash
npm run verify:installable
```

当前候选已通过：

- 源码 smoke；
- reducer 最小回归；
- 单 runtime + vendor fallback 构建；
- 模拟宿主事件、聊天隔离和正文回写回归；
- 41 个输出 JS 的语法、版本、导入与布局检查；
- 根入口、内联 CSS、生命周期导出和 DOM Event 可读序列化检查。

尚未完成：

- 正式 npm typecheck；
- 自包含 Webpack bundle；
- `2.0.0-alpha.5-realtest.1` 在目标 SillyTavern 的真实安装复测；
- 目标浏览器对两个 ESM 来源的实际可达性。

因此本版本仍只能称为**实机候选**。上一版本的失败已记录在 `docs/FIXED_FACTS.md`、`docs/ENGINEERING_EVENTS.md` 与 `docs/REAL_MACHINE_CHECKLIST.md`。
