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

  function friendly(err) {
    const m = String((err && (err.message || err)) || '');
    if (/network|fetch|Failed to fetch|timeout/i.test(m)) return '网络不通，检查一下连接再试';
    if (/rate|too many/i.test(m)) return '请求太频繁，等一分钟再试';
    if (/expire|invalid.*code|code.*invalid/i.test(m)) return '验证码不对或已过期，重新获取一个';
    return m || '操作失败，请稍后再试';
  }
  function busy(btn, on, text) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = text || '处理中…'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  const Auth = {
    switchTab(key) {
      $$('#login-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.lt === key));
      $('#login-phone').style.display = key === 'phone' ? '' : 'none';
      $('#login-email').style.display = key === 'email' ? '' : 'none';
      Auth.clearErr();
      setTimeout(() => { const el = key === 'phone' ? $('#ph-input') : $('#em-input'); if (el) el.focus(); }, 30);
    },
    clearErr() { $('#login-err').textContent = ''; },
    err(m) { $('#login-err').textContent = m; },
    enter(e, kind) {
      if (e.key !== 'Enter') return;
      if (kind === 'phone') Auth.submitPhone(); else Auth.submitEmail();
    },

    async sendPhoneCode() {
      const phone = $('#ph-input').value.trim();
      if (!/^1\d{10}$/.test(phone)) return Auth.err('请输入正确的 11 位手机号');
      Auth.clearErr();
      const btn = $('#ph-send');
      busy(btn, true, '发送中…');
      try {
        const sent = await client.auth.sendOtp({ phone });
        if (sent.error) { busy(btn, false); return Auth.err(friendly(sent.error)); }
        pendingPhone = { phone, verificationId: sent.data.verificationId, isExistingUser: sent.data.isExistingUser };
        startCountdown(btn, 60);
        UI.toast('验证码已发送，请查看短信');
        const code = $('#ph-code'); if (code) code.focus();
      } catch (e) { busy(btn, false); Auth.err(friendly(e)); }
    },
    async submitPhone() {
      const p = pendingPhone;
      if (!p || p.phone !== $('#ph-input').value.trim()) return Auth.err('请先获取当前手机号的验证码');
      const code = $('#ph-code').value.trim();
      if (!code) return Auth.err('请输入验证码');
      Auth.clearErr();
      const btn = $('#ph-submit');
      busy(btn, true, '登录中…');
      try {
        const done = await client.auth.verifyOtp({ phone: p.phone, verificationId: p.verificationId, isExistingUser: p.isExistingUser, token: code });
        if (done.error) { busy(btn, false); return Auth.err(friendly(done.error)); }
        pendingPhone = null;
        Auth.finish();
      } catch (e) { busy(btn, false); Auth.err(friendly(e)); }
    },

    async sendEmailCode() {
      const email = $('#em-input').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Auth.err('请输入正确的邮箱地址');
      Auth.clearErr();
      const btn = $('#em-send');
      busy(btn, true, '发送中…');
      try {
        const sent = await client.auth.sendOtp({ email });
        if (sent.error) { busy(btn, false); return Auth.err(friendly(sent.error)); }
        pendingEmail = { email, verificationId: sent.data.verificationId, isExistingUser: sent.data.isExistingUser };
        startCountdown(btn, 60);
        UI.toast('验证码已发送到邮箱');
        const code = $('#em-code'); if (code) code.focus();
      } catch (e) { busy(btn, false); Auth.err(friendly(e)); }
    },
    async submitEmail() {
      const p = pendingEmail;
      if (!p || p.email !== $('#em-input').value.trim()) return Auth.err('请先获取当前邮箱的验证码');
      const code = $('#em-code').value.trim();
      if (!code) return Auth.err('请输入验证码');
      Auth.clearErr();
      const btn = $('#em-submit');
      busy(btn, true, '登录中…');
      try {
        const done = await client.auth.verifyOtp({ email: p.email, verificationId: p.verificationId, isExistingUser: p.isExistingUser, token: code });
        if (done.error) { busy(btn, false); return Auth.err(friendly(done.error)); }
        pendingEmail = null;
        Auth.finish();
      } catch (e) { busy(btn, false); Auth.err(friendly(e)); }
    },

    async loginWechat() {
      Auth.clearErr();
      const back = new URL(location.href);
      back.pathname = '/';
      ['code', 'state', 'provider'].forEach(k => back.searchParams.delete(k));
      try {
        const { data, error } = await client.auth.signInWithOAuth({ provider: 'wechat', redirectTo: back.toString() });
        if (error) return Auth.err('微信登录暂时不可用，先用手机号或邮箱登录吧');
        location.assign(data.url);
      } catch (e) { Auth.err('微信登录暂时不可用，先用手机号或邮箱登录吧'); }
    },

    finish() {
      UI.closeLogin();
      UI.toast('登录成功，正在同步你的进度…');
      setTimeout(() => location.reload(), 500);
    },
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
