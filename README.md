# Mirror Abyss / 镜渊 1.1.0-rc.4.1

这是针对 `1.1.0-rc.3 / rc.4` 的总结阻断错误热修复覆盖包。

## 根因

`buildFactPackageIndex()` 内部已经创建 `byId` Map，但返回的事实索引只有：

`{ packages, byMessageKey, stageSnapshots }`

小总结合并批次随后调用：

`factIndex.byId.get(...)`

因此 `factIndex.byId` 为 `undefined`，界面显示“无法读取未定义的属性（读取 get）”。

## 修复

`core-hotfix.js` 在执行现有 `index.js` 前进行一次精确替换，把返回值修正为：

`{ packages, byId, byMessageKey, stageSnapshots }`

修复器只允许命中一个已知标记。核心已经修复时保持幂等；标记缺失或不唯一时停止启动，不对未知代码猜测性替换。

## 未改变

- 不清除或迁移现有表格、小总结、大总结、事件和世界书。
- 不修改提示词、JSON 协议或总结阈值。
- 不修改 API 密钥、连接方式、任务优先级或并发策略。
- 不恢复历史回读或历史依赖重建。

## 安装

这是覆盖包，不是独立完整包。现有插件目录必须保留 `index.js` 与 `style.css`。将压缩包内文件全部覆盖到现有 `mirror-abyss-plugin` 目录，再完整刷新 SillyTavern。

具体步骤见 `PATCH_INSTALL.md`。

## 验收

版本栏应显示 `1.1.0-rc.4.1 · 总结热修复`。直接触发一次小总结，不应再出现 `undefined (reading 'get')`；成功后再观察大总结和世界书同步。
