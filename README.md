# Mirror Abyss 2.0.0-alpha.7-realtest.1

Mirror Abyss 是 SillyTavern 原生 UI Extension。本候选只修复发布与启动链，不改变已冻结的审核、修正、事实提取、聊天隔离和持久化语义。

## 本轮实机事实

`2.0.0-alpha.6-realtest.1` 已进入 `onActivate`，但随后请求 `dist/runtime/index.js` 失败。GitHub 默认分支存在 manifest 和 bootstrap，却缺少该 runtime 文件，因此直接原因是多文件发布不完整，而不是 CDN、模型或业务处理失败。

## alpha.7 发布结构

安装运行只需要：

```text
manifest.json
mirror-abyss-alpha7.js
dist/DEPENDENCIES.json（说明文件，不参与启动）
```

`mirror-abyss-alpha7.js` 内嵌 33 个本地可执行生产模块和 CSS，不再动态请求任何 `dist/runtime/**` 文件。React 18、Redux Toolkit、React Redux、Zod 与 p-queue 仍按精确版本使用成熟包，并在生命周期启动后逐依赖尝试 `esm.sh` 与 `jsDelivr +esm`。

## 验证边界

`npm run verify:installable` 验证源码、reducer、单文件构建、宿主契约和安装结构。正式 `npm run typecheck` 与 Webpack 自包含构建仍依赖 npm registry；当前环境 registry 返回 HTTP 503。所有本地验证都不替代真实 SillyTavern 结论。
