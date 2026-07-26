# Third-party notices

本项目的扩展入口与 Webpack/React 组织方式基于 SillyTavern 官方
`Extension-ReactTemplate`，该模板使用 GNU Affero General Public License v3.0。

运行依赖：

- React / ReactDOM — MIT
- Redux Toolkit / React Redux — MIT
- Zod — MIT
- p-queue — MIT
- Webpack / Babel / TypeScript 构建工具 — 各自开源许可证

本项目整体以 `AGPL-3.0-only` 发布。完整许可证见 `LICENSE`。

`2.0.0-alpha.4-realtest.1` 的安装候选生成 `esm.sh` 与 `jsDelivr +esm` 两套浏览器 ESM 运行映射，并按固定顺序回退。`dist/DEPENDENCIES.json` 记录直接依赖版本与实际地址。该分发方式不改变各依赖原许可证，也不表示项目复制或改写了这些库的实现。
