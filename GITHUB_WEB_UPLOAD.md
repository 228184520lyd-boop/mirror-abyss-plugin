# GitHub 网页上传版

此目录已经为 GitHub 网页上传限制做过整理。

- 当前可见文件总数少于 100，可以一次拖入 GitHub 的“Upload files”页面。
- 插件运行源码保持不变。
- 不影响运行的 source map 与 `docs/` 文档被收纳到 `_archives/docs-and-source-maps.zip`。
- 可安装的 SillyTavern 插件包位于 `release/Mirror-Abyss-1.3.14-core.5.zip`。

上传时：
1. 解压最外层 ZIP。
2. 打开 `mirror-abyss-plugin` 文件夹。
3. 将该文件夹内的全部内容拖到 GitHub 仓库根目录。
4. 提交说明可写：`Upload Mirror Abyss 1.3.14-core.5`。

不要把最外层 ZIP 作为唯一文件提交，否则 GitHub 无法直接浏览源码。
