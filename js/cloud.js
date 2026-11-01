/* AI 能力客户端：仅保留大模型对话（应用本身无登录，数据全部本地保存） */
const Cloud = (() => {
  const cfg = window.PUBLIC_CONFIG;
  let client = null;
  try {
    client = WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: cfg.endpoint,
      oauthRelayBaseUrl: cfg.oauthRelayBaseUrl,
      publishableKey: cfg.publishableKey,
    });
  } catch (e) { console.warn('云端 AI 初始化失败，将使用本地助教', e); }

  /* ---------- 大模型 ---------- */
  let modelId = null;
  let loadModelPromise = null;
  let usable = false;   // 一旦确认不可用，后续直接走本地助教，不再反复尝试

  async function ensureModel() {
    if (modelId) return modelId;
    if (!client) throw new Error('no-client');
    if (!loadModelPromise) {
      loadModelPromise = (async () => {
        const models = await client.llm.models.list();
        const list = (models || []).filter(m => m.disabled !== true);
        if (!list.length) throw new Error('当前没有可用的模型');
        modelId = list[0].id;
        return modelId;
      })();
    }
    return loadModelPromise;
  }

  /** 流式对话：onDelta(text) 逐块回调；返回完整文本。
      失败时抛错，由调用方决定是否降级到本地助教。 */
  async function chat(messages, opts) {
    opts = opts || {};
    const model = await ensureModel();
    const controller = new AbortController();
    let full = '';
    try {
      for await (const chunk of client.llm.chat.completions.create({
        model,
        messages: [{ role: 'system', content: opts.system || '你是一位专业的雅思教学助手，用中文讲清楚问题，必要时给出地道英文示例。回答简洁、具体、可执行。' }, ...messages],
        stream: true,
        temperature: opts.temperature != null ? opts.temperature : 0.7,
        ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
        signal: controller.signal,
      })) {
        const delta = (chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) || '';
        if (delta) { full += delta; opts.onDelta && opts.onDelta(delta, full); }
      }
      usable = true;
      return full;
    } catch (e) {
      usable = false;
      const msg = String(e && e.message || e);
      if (/quota|limit|exceed/i.test(msg)) throw new Error('今日 AI 额度已用完，先试试本地助教吧');
      if (/login|unauthor|401|403/i.test(msg)) throw new Error('AI 服务暂时不可用');
      throw new Error(msg || 'AI 请求失败');
    }
  }

  /** 探测一次 AI 是否可用（页面打开时调用，失败就静默切到本地助教） */
  async function probe() {
    try { await ensureModel(); usable = true; } catch (e) { usable = false; }
    return usable;
  }

  return { client, chat, ensureModel, probe, get aiOk() { return usable; } };
})();
