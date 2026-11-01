/* 学习计划：按目标分 / 考试日期 / 每日时长生成任务，并作为今日任务来源 */
const Plan = (() => {
  const BAND_VOCAB = { 5: 3000, 5.5: 3500, 6: 4000, 6.5: 5000, 7: 6000, 7.5: 7000, 8: 8000, 8.5: 9000 };

  function dailyNewFrom(minutes) {
    if (minutes <= 20) return 8;
    if (minutes <= 40) return 12;
    if (minutes <= 60) return 15;
    if (minutes <= 90) return 22;
    return 30;
  }

  function rotationTasks() {
    const dow = new Date().getDay();
    const table = {
      0: [{ key: 'weekly-review', title: '周复盘：看本周错词与正确率', module: 'records', est: 12 }],
      1: [{ key: 'w-read', title: '精读一篇 Task 2 范文（段落功能 + 句型）', module: 'writing', est: 20 }],
      2: [{ key: 's-shadow', title: '影子跟读 10 句（录音对比）', module: 'speaking', est: 15 }],
      3: [{ key: 'r-passage', title: '精读一篇阅读文章 + 8 道题', module: 'reading', est: 25 }],
      4: [{ key: 'w-write', title: 'Task 2 限时写作（40 分钟）', module: 'writing', est: 40 }],
      5: [{ key: 's-part2', title: 'Part 2 话题卡限时陈述（录音）', module: 'speaking', est: 18 }],
      6: [{ key: 'r-synonym', title: '同义替换训练 10 题', module: 'reading', est: 12 }],
    };
    return table[dow] || table[1];
  }

  /** 生成今日任务（不写库，返回数组） */
  function generate(state) {
    const minutes = (state.profile && state.profile.daily_minutes) || 60;
    const due = Store.dueWords().length;
    const overdue = Store.overdueWords().length;
    const n = dailyNewFrom(minutes);
    const tasks = [];

    if (due > 0) {
      const cnt = Math.min(due, Math.max(10, Math.round(n * 1.5)));
      tasks.push({
        key: 'review', module: 'vocab',
        title: `复习 ${cnt} 个到期单词` + (overdue ? `（含 ${overdue} 个逾期）` : ''),
        est: Math.round(cnt * 0.35), payload: { limit: cnt },
      });
    }
    tasks.push({ key: 'new', module: 'vocab', title: `学习 ${n} 个新单词（词根 + 例句）`, est: Math.round(n * 0.8), payload: { limit: n } });

    tasks.push({ key: 'daily-essay', module: 'daily', title: '精读今日范文：结构 + 3 句仿写', est: 15 });

    const used = tasks.reduce((s, t) => s + t.est, 0);
    if (minutes - used >= 15) {
      tasks.push({ key: 'listen', module: 'listening', title: '精听一组材料（逐句听写 + 句析）', est: 20 });
    }
    if (minutes - used >= 30) {
      rotationTasks().forEach(t => tasks.push(t));
    }
    if (minutes >= 60) {
      tasks.push({ key: 'ai-review', module: 'ai', title: 'AI 复盘：让助手讲清今天最难记的 3 个词', est: 8 });
    }
    return tasks;
  }

  /* ---------- 计划页 ---------- */
  async function render(root) {
    if (!Cloud.user) {
      root.innerHTML = `
        <h1>学习计划</h1>
        <div class="card center" style="padding:34px 20px">
          <p class="muted">登录后可设置目标分数与考试日期，系统会每天自动生成学习任务。</p>
          <button class="btn primary" onclick="UI.showLogin()">登录 / 注册</button>
        </div>`;
      return;
    }
    await Store.loadUser();
    await Store.loadWords();
    await Store.loadTasks();
    const p = Store.profile;
    const stats = Store.stats();
    const left = Store.examCountdown();
    const need = BAND_VOCAB[Math.round((p.target_band || 6.5) * 10) / 10] || 6000;
    const gap = Math.max(0, need - stats.mastered);
    const perDay = left && left > 0 ? Math.ceil(gap / left) : null;

    root.innerHTML = `
      <h1>学习计划</h1>
      <p class="muted" style="margin-bottom:14px">目标决定路径。设置好目标和考试日期，系统会据此生成每日任务。</p>

      <div class="kpis">
        <div class="kpi"><div class="n">${p.target_band || '—'}</div><div class="l">目标分数</div></div>
        <div class="kpi"><div class="n">${left == null ? '未设置' : (left >= 0 ? left + ' 天' : '已过期')}</div><div class="l">距考试</div></div>
        <div class="kpi"><div class="n">${fmtMin(p.daily_minutes || 60)}</div><div class="l">每日可投入</div></div>
        <div class="kpi"><div class="n">${stats.mastered}</div><div class="l">已掌握词汇</div></div>
      </div>

      <div class="card">
        <div class="card-title"><h3>目标与节奏</h3><span class="pill blue">修改后明日任务随之调整</span></div>
        <div class="grid g2">
          <label class="field"><span>目标分数</span>
            <select id="pl-band">
              ${[6, 6.5, 7, 7.5, 8, 8.5].map(b => `<option value="${b}" ${(+p.target_band === b) ? 'selected' : ''}>${b} 分</option>`).join('')}
            </select></label>
          <label class="field"><span>考试日期（可留空）</span>
            <input type="date" id="pl-date" value="${p.exam_date || ''}"></label>
        </div>
        <label class="field"><span>每日学习时长：<b id="pl-min-label">${p.daily_minutes || 60}</b> 分钟（对应每日新词 <b id="pl-new-label">${dailyNewFrom(p.daily_minutes || 60)}</b> 个）</span>
          <input type="range" id="pl-min" min="20" max="120" step="10" value="${p.daily_minutes || 60}"
            oninput="Plan.previewMinutes(this.value)"></label>
        <button class="btn primary" onclick="Plan.saveProfile()">保存目标</button>
      </div>

      <div class="card">
        <h3>距离目标还差多少</h3>
        <p class="muted tiny">目标 ${p.target_band} 分通常需要约 ${need} 个可主动运用的词汇量，你现在已掌握 ${stats.mastered} 个。</p>
        <div class="progress"><i style="width:${Math.min(100, stats.mastered / need * 100)}%"></i></div>
        <p class="muted tiny" style="margin:6px 0 0">
          ${gap === 0 ? '词汇量已达标，接下来重点是精听与写作输出。'
            : left > 0 ? `还剩 ${gap} 个词，按 ${left} 天计算，每天约需掌握 ${perDay} 个新词（含复习巩固）。`
              : `还剩 ${gap} 个词；设置考试日期后可以算出每日配速。`}
        </p>
      </div>

      <div class="card">
        <div class="card-title"><h3>今日任务</h3>
          <button class="btn sm soft" onclick="Plan.regen()">重新生成</button></div>
        ${(Store.tasks.length ? Store.tasks : []).map(t => `
          <div class="task-item">
            <span class="task-check ${t.status === 'done' ? 'done' : ''}" onclick="Plan.toggle(${t.id})">${t.status === 'done' ? '✓' : ''}</span>
            <div class="task-main"><div class="t ${t.status === 'done' ? 'done' : ''}">${esc(t.title)}</div>
              <div class="s">${moduleName(t.module)} · 约 ${t.est_min} 分钟</div></div>
            <button class="btn sm" onclick="Plan.open('${t.module}','${t.task_key}')">去完成</button>
          </div>`).join('') || '<p class="muted tiny">暂无任务，点击「重新生成」</p>'}
      </div>

      <div class="card">
        <h3>每周节奏建议</h3>
        <div class="grid g2 tiny muted">
          <div>周一 · 写作范文精读</div><div>周二 · 影子跟读</div>
          <div>周三 · 阅读精读 + 题目</div><div>周四 · Task 2 限时写作</div>
          <div>周五 · Part 2 话题卡</div><div>周六 · 同义替换训练</div>
          <div>周日 · 周复盘（错词 + 正确率）</div><div>每天 · 复习 + 新词</div>
        </div>
      </div>`;
  }

  function moduleName(m) {
    return ({ vocab: '词汇', listening: '听力', writing: '写作', reading: '阅读', speaking: '口语',
      records: '学习记录', ai: 'AI 助手', daily: '今日内容' })[m] || m;
  }

  function previewMinutes(v) {
    $('#pl-min-label').textContent = v;
    $('#pl-new-label').textContent = dailyNewFrom(+v);
  }

  async function saveProfile() {
    const band = +$('#pl-band').value;
    const date = $('#pl-date').value || null;
    const mins = +$('#pl-min').value;
    await Store.saveProfile({ target_band: band, exam_date: date, daily_minutes: mins });
    await Store.saveSettings({ daily_new: dailyNewFrom(mins) });
    // 计划变化，重建今日任务
    const db = Cloud.client.database;
    await db.from('study_tasks').delete().eq('day', todayStr());
    await Store.loadTasks();
    UI.toast('目标已保存，今日任务已更新');
    render($('#view'));
  }

  async function regen() {
    const db = Cloud.client.database;
    await db.from('study_tasks').delete().eq('day', todayStr());
    await Store.loadTasks();
    UI.toast('已重新生成今日任务');
    location.hash = '#/plan';
    render($('#view'));
  }

  async function toggle(id) {
    const t = Store.tasks.find(x => x.id === id);
    if (!t) return;
    await Store.toggleTask(t, t.status !== 'done');
    render($('#view'));
  }

  async function open(module, key) {
    const map = {
      vocab: '#/vocab',
      listening: '#/listening',
      writing: '#/writing',
      reading: '#/reading',
      speaking: '#/speaking',
      records: '#/records',
      ai: '#/ai',
    };
    if (module === 'vocab') {
      location.hash = key === 'review' ? '#/vocab/study/review' : '#/vocab/study/new';
      return;
    }
    if (module === 'ai') { AI.askPreset('复盘'); location.hash = '#/ai'; return; }
    if (module === 'daily') {
      await Daily.ensure();
      const e = Daily.today().essayT2;
      location.hash = e ? `#/daily/essay/${e.id}` : '#/home';
      return;
    }
    location.hash = map[module] || '#/home';
  }

  return { generate, render, saveProfile, regen, toggle, open, previewMinutes, dailyNewFrom, moduleName, BAND_VOCAB };
})();
