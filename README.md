# Mirror Abyss / 镜渊

镜渊是 SillyTavern 前端扩展，提供规则审核、结构化剧情状态、自适应分层总结和聊天世界书发布。

## API 调用

- “当前聊天连接”通过 SillyTavern `generateRaw` 调用。
- “Connection Profile”通过 `ConnectionManagerRequestService` 调用。
- 插件不保存 API 地址或密钥，也不直接连接模型供应商。

## 自适应总结

小总结只比较已经生成的状态表变化，不额外调用模型进行判断。剧情变化密集时提前总结，变化较少时延后，但不会超过设置的最晚回合数。

## 历史消息变化

编辑、删除或切换旧消息 swipe 后，镜渊暂停派生处理和世界书发布，并在工作区提供“从变更位置开始重算”。插件不会在后台自动重放历史。

## 开发验证

安装开发依赖后执行 `npm run verify`。可安装文件由 `dist` 目录生成。
