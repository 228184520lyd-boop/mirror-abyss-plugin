import { MirrorAbyssError, errorText, fault } from '../core/util.js';

export class ModelGateway {
  constructor(host) {
    this.host = host;
  }

  async text(prompt, settings, token) {
    try {
      return await this.host.generate({ ...prompt, responseTokens: settings.responseTokens, token });
    } catch (error) {
      if (token.cancelled || error instanceof MirrorAbyssError) throw error;
      throw fault('model', 'REQUEST', errorText(error), error);
    }
  }

  async structured(prompt, settings, token, parse) {
    let failure = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const request = failure
        ? { system: `${prompt.system}\n\n上一次格式校验失败：${failure.slice(0, 700)}\n请重新读取同一输入并输出完整最终协议。`, user: prompt.user }
        : prompt;
      const raw = await this.text(request, settings, token);
      try {
        return { raw, value: parse(raw), retried: attempt > 0 };
      } catch (error) {
        failure = errorText(error);
        if (attempt > 0) throw fault('model', 'PROTOCOL_RETRY', `模型连续两次未通过协议校验：${failure}`, error);
      }
    }
    throw fault('model', 'PROTOCOL', '模型协议校验失败');
  }
}
