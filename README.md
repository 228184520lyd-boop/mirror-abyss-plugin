# Mirror Abyss 2.0.0-alpha.6-realtest.1

这是镜渊全面重构后的**零副作用入口实机候选**。它针对上一候选在真实 SillyTavern 中出现的：

```text
扩展程序加载失败：[object Event]
```

进行了宿主加载边界修复。

## 已确认原因

SillyTavern 在执行扩展生命周期 hook 之前，会先加载 manifest 指定的 JS 与 CSS。任一资源加载失败时，宿主保存的是原始 DOM Event，并直接转成字符串，因此界面只剩 `[object Event]`。上一版本的错误聚合逻辑位于 `onActivate` 之后，无法捕获这个更早阶段的失败。

`2.0.0-alpha.5-realtest.1` 移除独立 CSS 后仍在真实 SillyTavern 中得到同样的 `[object Event]`。这将失败范围进一步收窄为根入口的获取、解析或顶层执行，但宿主仍丢失具体异常。

本版本将初始加载面继续收敛为一个版本化、零顶层副作用模块：

```text
manifest.json
bootstrap-alpha6.js
```

manifest 不再单独请求 `style.css`。`bootstrap-alpha6.js` 在模块首次加载时只声明函数和导出，不读取 DOM、不读取模块 URL、不写全局状态、不构造时间、不发起网络请求，也不动态导入 runtime。只有 SillyTavern 真正调用 `onActivate` 或 `onEnable` 后，才注入样式、检查宿主并加载 runtime。版本化文件名同时排除同路径模块缓存。

## 安装结构

```text
manifest.json
bootstrap-alpha6.js
dist/DEPENDENCIES.json
dist/runtime/**
dist/runtime/vendor/**
```

业务 runtime 只保留一套。React、Redux Toolkit、Zod、p-queue 等成熟依赖通过六个 vendor shim 分别按以下顺序回退：

1. `esm.sh` 精确版本；
2. `jsDelivr +esm` 精确版本。

这仍不是完全离线、自包含的 Webpack 产物，但不再复制两套业务 runtime。输出 JavaScript 从 67 个降为 41 个，安装文件总数从 80 个降为 48 个。源码包为避免 GitHub 网页上传接近 100 文件，不携带生成后的 `dist/**` 与根 bootstrap；运行 `npm run build:installable` 可重新生成。

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
- 版本化零副作用入口、延迟内联 CSS、生命周期导出和 DOM Event 可读序列化检查。

尚未完成：

- 正式 npm typecheck；
- 自包含 Webpack bundle；
- `2.0.0-alpha.6-realtest.1` 在目标 SillyTavern 的真实安装复测；
- 目标浏览器对两个 ESM 来源的实际可达性。

因此本版本仍只能称为**实机候选**。上一版本的失败已记录在 `docs/FIXED_FACTS.md`、`docs/ENGINEERING_EVENTS.md` 与 `docs/REAL_MACHINE_CHECKLIST.md`。
