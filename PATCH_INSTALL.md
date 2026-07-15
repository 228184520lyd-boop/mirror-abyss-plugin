# 镜渊 rc.4 手机覆盖安装

本包是针对现有 `1.1.0-rc.3` 安装目录的覆盖包，不包含核心 `index.js` 和基础 `style.css`。

## 覆盖内容

将压缩包内下列文件复制到现有 `mirror-abyss-plugin` 目录，并允许覆盖同名文件：

- `manifest.json`
- `finalizer.js`
- `final-style.css`
- `README.md`
- `BUILD_INFO.json`
- `PRODUCT_CONTRACT.md`

现有的 `index.js` 与 `style.css` 必须保留。`finalizer.js` 会加载现有核心，`final-style.css` 会加载现有基础样式。

复制完成后，完全关闭并重新打开 SillyTavern 页面，或执行一次完整刷新。

## 验收

打开镜渊工作区后，应在标题与标签页之间看到运行结构条，包含：前台、事实关键后台、派生后台、发布。

版本应显示为 `1.1.0-rc.4`。旧的历史重建恢复入口不应再出现在公开 API 或 UI 中。

## 回滚

出现启动异常时：

1. 将 `manifest.json` 中的 `js` 改回 `index.js`。
2. 将 `css` 改回 `style.css`。
3. 删除 `finalizer.js` 与 `final-style.css`。
4. 完整刷新页面。

核心数据格式没有改变，回滚不会要求重建历史。
