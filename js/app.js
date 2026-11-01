/* 应用入口：路由（无登录，数据保存在本设备） */
(async function boot() {
  Store.loadUser();
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
      await Store.loadUser();
      await Store.loadWords();
      const p = Store.profile;
      const left = Store.examCountdown();
      root.innerHTML = `
        <h1>个人中心</h1>
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
          <h3>数据备份</h3>
          <p class="muted tiny" style="margin:0 0 10px">所有学习数据只保存在这台设备的浏览器里，不会上传。换手机 / 换电脑 / 清理浏览器前，先导出一份备份，在新设备的个人中心导入即可无缝继续。</p>
          <div class="row" style="gap:10px;flex-wrap:wrap">
            <button class="btn" onclick="Store.exportData();UI.toast('备份文件已下载')">导出备份</button>
            <button class="btn" onclick="document.getElementById('pf-import').click()">导入备份</button>
            <input type="file" id="pf-import" accept="application/json" style="display:none" onchange="Profile.doImport(this)">
            <button class="btn" style="color:var(--red)" onclick="if(confirm('确定清空吗？所有进度会被删除，无法恢复。')){Store.resetData();UI.toast('已清空');location.reload()}">清空数据</button>
          </div>
        </div>

        <div class="card">
          <h3>关于词库与内容</h3>
          <p class="muted tiny" style="margin:0">
            词库基于《雅思词汇真经》结构化整理，词根解析、英文释义、雅思语境例句为本站原创补充；发音为 TTS 合成的英式 / 美式语音。
            AI 反馈与分数诊断均为练习参考，不代表雅思官方评分。
          </p>
        </div>`;
    },
    async save() {
      const picked = $('#pf-new-chips .chip.on');
      const newPerDay = picked ? +picked.dataset.n : Plan.dailyNewOf();
      Store.saveProfile({
        target_band: +$('#pf-band').value,
        exam_date: $('#pf-date').value || null,
        daily_minutes: +$('#pf-min').value,
      });
      Store.saveSettings({ daily_new: newPerDay });
      UI.toast('已保存');
      UI.setUserChip();
      Profile.render($('#view'));
    },
    async doImport(input) {
      const f = input.files && input.files[0];
      if (!f) return;
      try {
        await Store.importData(f);
        UI.toast('导入成功，学习进度已恢复');
        UI.setUserChip();
        Profile.render($('#view'));
      } catch (e) {
        UI.toast('导入失败：' + (e.message || '文件格式不对'), 3200);
      }
      input.value = '';
    },
  };
  window.Profile = Profile;

  window.addEventListener('hashchange', route);
  await route();
})();
