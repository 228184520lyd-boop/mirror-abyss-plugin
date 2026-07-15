# 镜渊 1.1.0-rc.4.1 总结热修复覆盖安装

本包用于覆盖现有 `1.1.0-rc.3` 或 `1.1.0-rc.4` 安装目录。它仍然依赖安装目录中已有的核心 `index.js` 与基础 `style.css`。

## 修复内容

核心的事实包索引已经创建 `byId` Map，但返回对象漏掉了该字段；小总结合并批次时执行 `factIndex.byId.get(...)`，因此出现：

`无法读取未定义的属性（读取“get”）`

本覆盖包在载入核心前，只把这一处返回值从：

`{ packages, byMessageKey, stageSnapshots }`

修正为：

`{ packages, byId, byMessageKey, stageSnapshots }`

不修改提示词、总结协议、存储数据、世界书结构、聊天作用域或 API 调度。

## 覆盖文件

将压缩包内全部文件复制到现有 `mirror-abyss-plugin` 目录，并允许覆盖同名文件。必须保留原目录中的：

- `index.js`
- `style.css`

新增文件 `core-hotfix.js` 必须与 `finalizer.js` 位于同一目录。

覆盖完成后，完全关闭并重新打开 SillyTavern 页面，或执行一次完整刷新。

## 验收

1. 工作区版本显示 `1.1.0-rc.4.1 · 总结热修复`。
2. 触发一次小总结，不再出现 `undefined (reading 'get')`。
3. 小总结成功后再观察大总结与世界书同步。
4. 不需要清缓存，也不要删除现有表格或总结。

## 安全机制

热修复只允许精确命中一个已知缺陷标记。若核心版本不同、标记不存在或出现多次，插件会停止启动并显示明确错误，不会猜测性修改核心。

## 回滚

1. 将 `manifest.json` 中的 `js` 改回 `index.js`。
2. 将 `css` 改回 `style.css`。
3. 删除 `finalizer.js`、`core-hotfix.js` 与 `final-style.css`。
4. 完整刷新页面。

回滚不会清理或迁移现有数据。
