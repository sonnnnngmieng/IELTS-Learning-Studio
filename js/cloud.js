/* 云端客户端：认证 + 数据库 + 大模型 */
const Cloud = (() => {
  const cfg = window.PUBLIC_CONFIG;
  const client = WorkBuddyCloud.createWorkBuddyCloud({
    endpoint: cfg.endpoint,
    oauthRelayBaseUrl: cfg.oauthRelayBaseUrl,
    publishableKey: cfg.publishableKey,
  });

  let user = null;
  let session = null;
  let pendingPhone = null;
  let pendingEmail = null;
  let countdownTimer = null;

  async function restore() {
    try {
      const { data, error } = await client.auth.getSession();
      if (!error && data && data.user) { session = data; user = data.user; }
    } catch (e) { /* 未登录或网络异常 */ }
    UI.setUserChip();
    return user;
  }

  function startCountdown(btn, seconds) {
    let left = seconds;
    btn.disabled = true;
    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      left--;
      btn.textContent = `${left}s 后重发`;
      if (left <= 0) {
        clearInterval(countdownTimer);
        btn.disabled = false;
        btn.textContent = '重新发送';
      }
    }, 1000);
  }

  const Auth = {
    switchTab(key) {
      $$('#login-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.lt === key));
      $('#login-phone').style.display = key === 'phone' ? '' : 'none';
      $('#login-email').style.display = key === 'email' ? '' : 'none';
      Auth.clearErr();
    },
    clearErr() { $('#login-err').textContent = ''; },
    err(m) { $('#login-err').textContent = m; },

    async sendPhoneCode() {
      const phone = $('#ph-input').value.trim();
      if (!/^1\d{10}$/.test(phone)) return Auth.err('请输入正确的 11 位手机号');
      const btn = $('#ph-send');
      btn.disabled = true;
      const sent = await client.auth.sendOtp({ phone });
      if (sent.error) { btn.disabled = false; return Auth.err(sent.error.message || '验证码发送失败'); }
      pendingPhone = { phone, verificationId: sent.data.verificationId, isExistingUser: sent.data.isExistingUser };
      startCountdown(btn, 60);
      UI.toast('验证码已发送');
    },
    async submitPhone() {
      const p = pendingPhone;
      if (!p || p.phone !== $('#ph-input').value.trim()) return Auth.err('请先获取当前手机号的验证码');
      const code = $('#ph-code').value.trim();
      if (!code) return Auth.err('请输入验证码');
      const done = await client.auth.verifyOtp({ phone: p.phone, verificationId: p.verificationId, isExistingUser: p.isExistingUser, token: code });
      if (done.error) return Auth.err(done.error.message || '验证码不正确');
      pendingPhone = null;
      Auth.finish();
    },

    async sendEmailCode() {
      const email = $('#em-input').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Auth.err('请输入正确的邮箱地址');
      const btn = $('#em-send');
      btn.disabled = true;
      const sent = await client.auth.sendOtp({ email });
      if (sent.error) { btn.disabled = false; return Auth.err(sent.error.message || '验证码发送失败'); }
      pendingEmail = { email, verificationId: sent.data.verificationId, isExistingUser: sent.data.isExistingUser };
      startCountdown(btn, 60);
      UI.toast('验证码已发送到邮箱');
    },
    async submitEmail() {
      const p = pendingEmail;
      if (!p || p.email !== $('#em-input').value.trim()) return Auth.err('请先获取当前邮箱的验证码');
      const code = $('#em-code').value.trim();
      if (!code) return Auth.err('请输入验证码');
      const done = await client.auth.verifyOtp({ email: p.email, verificationId: p.verificationId, isExistingUser: p.isExistingUser, token: code });
      if (done.error) return Auth.err(done.error.message || '验证码不正确');
      pendingEmail = null;
      Auth.finish();
    },

    async loginWechat() {
      Auth.clearErr();
      const back = new URL(location.href);
      back.pathname = '/';
      ['code', 'state', 'provider'].forEach(k => back.searchParams.delete(k));
      const { data, error } = await client.auth.signInWithOAuth({ provider: 'wechat', redirectTo: back.toString() });
      if (error) return Auth.err(error.message || '暂时无法使用微信登录');
      location.assign(data.url);
    },

    finish() { UI.closeLogin(); UI.toast('登录成功'); location.reload(); },
    async signOut() { await client.auth.signOut(); location.hash = '#/home'; location.reload(); },
  };

  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') { user = null; session = null; UI.setUserChip(); }
  });

  /* ---------- 大模型 ---------- */
  let modelId = null;
  let loadModelPromise = null;

  async function ensureModel() {
    if (modelId) return modelId;
    if (!loadModelPromise) {
      loadModelPromise = (async () => {
        const models = await client.llm.models.list();
        const usable = (models || []).filter(m => m.disabled !== true);
        if (!usable.length) throw new Error('当前没有可用的模型');
        modelId = usable[0].id;
        return modelId;
      })();
    }
    return loadModelPromise;
  }

  /** 流式对话：onDelta(text) 逐块回调；返回完整文本 */
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
      return full;
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/login|unauthor|401/i.test(msg)) throw new Error('AI 助手需要登录后使用，请先登录');
      if (/quota|limit|exceed/i.test(msg)) throw new Error('今日 AI 额度已用完，明天再试');
      throw new Error(msg || 'AI 请求失败，请稍后再试');
    }
  }

  return { client, Auth, restore, chat, ensureModel, get user() { return user; }, get session() { return session; } };
})();
