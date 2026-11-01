/* 应用入口：OAuth 回调 → 会话恢复 → 路由 */
(async function boot() {
  const url = new URL(location.href);
  const hasCallback = url.searchParams.has('code') || url.searchParams.has('error');

  if (hasCallback) {
    const provider = url.searchParams.get('provider');
    if (provider === 'wechat' && typeof Cloud.client.auth.handleWechatWebCallback === 'function') {
      const { data: session, error } = await Cloud.client.auth.handleWechatWebCallback.call(Cloud.client.auth);
      if (error) UI.toast('微信登录失败：' + error.message, 4000);
      else if (session) {
        ['code', 'state', 'provider'].forEach(k => url.searchParams.delete(k));
        history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      }
    } else {
      UI.toast('登录回调无效，请重新登录', 3000);
    }
  } else {
    await Cloud.restore();
  }
  UI.setUserChip();

  const titles = {
    home: '今日学习空间', vocab: '词汇', listening: '听力', writing: '写作', reading: '阅读',
    speaking: '口语', plan: '学习计划', records: '学习记录', ai: 'AI 助手', profile: '个人中心',
    daily: '今日学习空间', dictation: '每日听写', game: '拼词闯关', craft: '手工柜',
  };

  async function route() {
    const raw = location.hash.replace(/^#\//, '') || 'home';
    const parts = raw.split('/');
    const page = parts[0];
    const rest = parts.slice(1).join('/');
    const seg = parts.slice(1);
    const root = $('#view');

    Audio2.stop();
    $$('.side-nav a, .nav-pills a').forEach(a => a.classList.toggle('on', a.dataset.nav === page));
    $$('.mobbar a').forEach(a => a.classList.toggle('on', a.dataset.mob === page));
    $('#crumb').textContent = titles[page] || '今日学习空间';
    UI.closeDrawer();

    try {
      if (page === 'home') {
        if (rest === 'settings') return Profile.render(root);
        return await Dashboard.render(root);
      }
      if (page === 'daily') {
        if (seg[0] === 'essay' && seg[1]) return await Daily.renderEssay(root, seg[1]);
        return await Dashboard.render(root);
      }
      if (page === 'vocab') return await Vocab.render(root, rest);
      if (page === 'dictation') return await Vocab.renderDictation(root);
      if (page === 'game') return await Game.render(root, seg);
      if (page === 'craft') return await Craft.render(root, seg);
      if (page === 'listening') {
        if (rest === 'practice') { await Listening.ensure(); return Listening.renderPractice(root); }
        return await Listening.render(root);
      }
      if (page === 'writing') return await Writing.render(root);
      if (page === 'reading') return await Reading.render(root, rest);
      if (page === 'speaking') return await Speaking.render(root);
      if (page === 'plan') return await Plan.render(root);
      if (page === 'records') return await Records.render(root);
      if (page === 'ai') return await AI.render(root);
      if (page === 'profile') return Profile.render(root);
      return await Dashboard.render(root);
    } catch (e) {
      root.innerHTML = `<div class="empty">页面出错了：${esc(e.message || e)}<br><a onclick="location.reload()">重新加载</a></div>`;
    }
  }

  const Profile = {
    async render(root) {
      if (!Cloud.user) {
        root.innerHTML = `<h1>个人中心</h1>
          <div class="card center" style="padding:34px 18px"><p class="muted">登录后可设置目标并同步进度</p>
          <button class="btn primary" onclick="UI.showLogin()">登录 / 注册</button></div>`;
        return;
      }
      await Store.loadUser();
      await Store.loadWords();
      const p = Store.profile;
      const left = Store.examCountdown();
      const name = Cloud.user.name || (Cloud.user.phone ? Cloud.user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : (Cloud.user.email || '学习者'));
      root.innerHTML = `
        <h1>个人中心</h1>
        <div class="card">
          <div class="row">
            <span class="avatar" style="width:44px;height:44px;flex:0 0 44px;font-size:16px">${esc((name[0] || 'U').toUpperCase())}</span>
            <div><b>${esc(name)}</b><div class="tiny dim">${esc(Cloud.user.email || Cloud.user.phone || '已登录')}</div></div>
            <div class="spacer"></div>
            <button class="btn sm soft" onclick="Auth.signOut()">退出登录</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><h3>我的目标</h3><span class="pill blue">${left != null && left >= 0 ? `距考试 ${left} 天` : '未设置考试日期'}</span></div>
          <div class="grid g2">
            <label class="field"><span>目标分数</span>
              <select id="pf-band">${[6, 6.5, 7, 7.5, 8, 8.5].map(b => `<option value="${b}" ${(+p.target_band === b) ? 'selected' : ''}>${b} 分</option>`).join('')}</select></label>
            <label class="field"><span>考试日期</span><input type="date" id="pf-date" value="${p.exam_date || ''}"></label>
          </div>
          <label class="field"><span>每日学习时长：<b id="pf-min-label">${p.daily_minutes || 60}</b> 分钟</span>
            <input type="range" id="pf-min" min="20" max="120" step="10" value="${p.daily_minutes || 60}"
              oninput="document.getElementById('pf-min-label').textContent=this.value"></label>
          <div class="field" style="margin-bottom:12px">
            <span style="display:block;font-size:12.5px;color:var(--ink-2);margin-bottom:6px">每天学几个新单词</span>
            <div class="chips" id="pf-new-chips">
              ${Plan.NEW_OPTIONS.map(n => `<span class="chip ${n === Plan.dailyNewOf() ? 'on' : ''}" data-n="${n}"
                onclick="Array.from(this.parentNode.children).forEach(c=>c.classList.remove('on'));this.classList.add('on')">${n} 个</span>`).join('')}
            </div>
          </div>
          <button class="btn primary" onclick="Profile.save()">保存</button>
        </div>

        <div class="card">
          <h3>说明</h3>
          <p class="muted tiny" style="margin:0">
            词库基于《雅思词汇真经》结构化整理，词根解析、英文释义、雅思语境例句为本站原创补充；发音为 Edge TTS 合成的英式 / 美式语音。
            AI 反馈与分数诊断均为练习参考，不代表雅思官方评分。
          </p>
        </div>`;
    },
    async save() {
      const picked = $('#pf-new-chips .chip.on');
      const newPerDay = picked ? +picked.dataset.n : Plan.dailyNewOf();
      await Store.saveProfile({
        target_band: +$('#pf-band').value,
        exam_date: $('#pf-date').value || null,
        daily_minutes: +$('#pf-min').value,
      });
      await Store.saveSettings({ daily_new: newPerDay });
      UI.toast('已保存');
      Profile.render($('#view'));
    },
  };
  window.Profile = Profile;

  window.addEventListener('hashchange', route);
  await route();
})();
