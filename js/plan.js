/* 学习计划：按目标分 / 考试日期 / 每日时长生成任务，并作为今日任务来源 */
const Plan = (() => {
  const BAND_VOCAB = { 5: 3000, 5.5: 3500, 6: 4000, 6.5: 5000, 7: 6000, 7.5: 7000, 8: 8000, 8.5: 9000, 9: 10000 };
  // 雅思总分 5.0–9.0，按 0.5 分一档，全部可选
  const BANDS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];
  // 每日新词上限开放到 100 个
  const NEW_OPTIONS = [5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100];
  let pendingNew = null;   // 页面上临时选中、点保存后生效
  let pendingBand = null;  // 同上，目标分数

  /** 用户自选优先；没选过就跟学习时长联动 */
  function dailyNewOf() {
    if (pendingNew) return pendingNew;
    const n = +(Store.settings && Store.settings.daily_new);
    if (n > 0) return n;
    return dailyNewFrom((Store.profile && Store.profile.daily_minutes) || 60);
  }

  function dailyNewFrom(minutes) {
    if (minutes <= 20) return 8;
    if (minutes <= 40) return 12;
    if (minutes <= 60) return 15;
    if (minutes <= 90) return 22;
    return 30;
  }

  /** 当前选中的目标分（临时选中优先，其次用户存档，最后兜底 6.5） */
  function bandNow() {
    if (pendingBand) return pendingBand;
    const b = +(Store.profile && Store.profile.target_band);
    return b > 0 ? b : 6.5;
  }

  /** 点选目标分：只改页面状态，点「保存目标」才写库 */
  function pickBand(b) {
    pendingBand = b;
    $$('#pl-band-chips .chip').forEach(c => c.classList.toggle('on', +c.dataset.b === b));
    const need = BAND_VOCAB[b] || 6000;
    const mastered = Store.stats().mastered;
    const tip = $('#pl-band-tip');
    if (tip) tip.innerHTML = `目标 ${b} 分 ≈ 需要 ${need} 个可主动运用的词，你已掌握 ${mastered} 个，还差 ${Math.max(0, need - mastered)} 个。`;
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
    const n = pendingNew || (Number(state.settings && state.settings.daily_new) > 0
      ? Number(state.settings.daily_new) : dailyNewFrom(minutes));
    const tasks = [];

    if (due > 0) {
      const cnt = Math.min(due, Math.max(10, Math.round(n * 1.5)), 90);
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
    await Store.loadUser();
    await Store.loadWords();
    await Store.loadTasks();
    const p = Store.profile;
    const stats = Store.stats();
    const left = Store.examCountdown();
    const need = BAND_VOCAB[Math.round(bandNow() * 10) / 10] || 6000;
    const gap = Math.max(0, need - stats.mastered);
    const perDay = left && left > 0 ? Math.ceil(gap / left) : null;

    root.innerHTML = `
      <h1>学习计划</h1>
      <p class="muted" style="margin-bottom:14px">目标决定路径。设置好目标和考试日期，系统会据此生成每日任务。</p>

      <div class="kpis">
        <div class="kpi"><div class="n">${bandNow()}</div><div class="l">目标分数</div></div>
        <div class="kpi"><div class="n">${left == null ? '未设置' : (left >= 0 ? left + ' 天' : '已过期')}</div><div class="l">距考试</div></div>
        <div class="kpi"><div class="n">${fmtMin(p.daily_minutes || 60)}</div><div class="l">每日可投入</div></div>
        <div class="kpi"><div class="n">${stats.mastered}</div><div class="l">已掌握词汇</div></div>
      </div>

      <div class="card">
        <div class="card-title"><h3>目标与节奏</h3><span class="pill blue">修改后明日任务随之调整</span></div>
        <div class="field">
          <span style="display:block;font-size:12.5px;color:var(--ink-2);margin-bottom:6px">
            目标分数（雅思总分 5.0–9.0，0.5 分一档，点一下选中即可）
          </span>
          <div class="chips" id="pl-band-chips">
            ${BANDS.map(b => `<span class="chip ${b === bandNow() ? 'on' : ''}" data-b="${b}" onclick="Plan.pickBand(${b})">${b} 分</span>`).join('')}
          </div>
          <p class="muted tiny" id="pl-band-tip" style="margin:8px 0 0">目标 ${bandNow()} 分 ≈ 需要 ${need} 个可主动运用的词，你已掌握 ${stats.mastered} 个，还差 ${gap} 个。</p>
        </div>
        <label class="field"><span>考试日期（可留空）</span>
          <input type="date" id="pl-date" value="${p.exam_date || ''}"></label>
        <label class="field"><span>每日学习时长（决定任务总条数）：<b id="pl-min-label">${p.daily_minutes || 60}</b> 分钟</span>
          <input type="range" id="pl-min" min="20" max="120" step="10" value="${p.daily_minutes || 60}"
            oninput="Plan.previewMinutes(this.value)"></label>
        <div class="field" style="margin-bottom:12px">
          <span style="display:block;font-size:12.5px;color:var(--ink-2);margin-bottom:6px">
            每天学几个新单词（5–100 个自己定 · 下面给出预计完成时间和复习负荷）
          </span>
          <div class="chips" id="pl-new-chips">
            ${NEW_OPTIONS.map(n => `<span class="chip ${n === dailyNewOf() ? 'on' : ''}" data-n="${n}" onclick="Plan.pickNew(${n})">${n} 个</span>`).join('')}
          </div>
          <p class="muted tiny" id="pl-new-hint" style="margin:8px 0 0">${newHint(dailyNewOf())}</p>
        </div>
        <button class="btn primary" onclick="Plan.saveProfile()">保存目标</button>
      </div>

      <div class="card">
        <h3>距离目标还差多少</h3>
        <p class="muted tiny">目标 ${bandNow()} 分通常需要约 ${need} 个可主动运用的词汇量，你现在已掌握 ${stats.mastered} 个。</p>
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
    const hint = $('#pl-new-hint');
    if (hint) hint.innerHTML = newHint(pendingNew || dailyNewOf());
  }

  function pickNew(n) {
    pendingNew = n;
    $$('#pl-new-chips .chip').forEach(c => c.classList.toggle('on', +c.dataset.n === n));
    const hint = $('#pl-new-hint');
    if (hint) hint.innerHTML = newHint(n);
  }

  /** 每天 n 个新词的代价说明：完成时间 + 复习负荷 + 节奏建议 */
  function newHint(n) {
    const learned = Object.keys(Store.progress).length;
    const remain = Math.max(0, (Store.words.length || 0) - learned);
    const days = Math.ceil(remain / n);
    const done = new Date();
    done.setDate(done.getDate() + days);
    const eta = remain === 0 ? '全书新词已经过完了'
      : days <= 1 ? '今天就能把全书新词过完'
        : `照这个节奏，约 <b>${days} 天</b>（${done.getMonth() + 1} 月 ${done.getDate()} 日前后）过完全书剩余 ${remain} 个新词`;
    const reviewLoad = Math.round(n * 2.2);          // 每个新词平均带来约 2.2 次复习（按遗忘曲线估）
    const minutes = (Store.profile && Store.profile.daily_minutes) || 60;
    const needMin = Math.round(n * 0.8 + reviewLoad * 0.35); // 新学 + 复习的合计耗时
    let advice;
    if (n <= 8) advice = '压力最小，适合在职 / 课多的时候；代价是战线拉长。';
    else if (n <= 15) advice = '稳健节奏，每天连复习 25–35 分钟能清完，坚持 3 个月有明显效果。';
    else if (n <= 20) advice = '偏快：每天要保证 45 分钟以上，且复习不能断——断 3 天就会积压 100+ 个到期词。';
    else if (n <= 30) advice = '冲量模式：只适合有整块时间、能每天雷打不动执行的人；中途断档会掉进「全在复习」的泥潭。';
    else if (n <= 50) advice = '高强度：单日约 1 小时以上，适合全天备考或假期冲刺；建议把每日学习时长也拉到 90 分钟以上。';
    else if (n <= 100) advice = '极限量：单日 2 小时以上，只建议考前突击或长假集中攻坚时用。第一遍只求「看个脸熟」（认识 / 不认识快速过），不要在拼写上死磕；连续两周以上通常会出现新词记不住、旧词全积压，届时请退回 30–50。';
    else advice = '量已经很大了，注意留出复习的时间。';
    const budget = needMin > minutes
      ? `<br><b style="color:var(--amber,#b8860b)">注意：按这个量，新学 + 复习合计约 ${needMin} 分钟，已经超过你设定的每天 ${minutes} 分钟</b>——要么把「每日学习时长」往上拉，要么把新词量降一点。`
      : `预计新学 + 复习合计约 ${needMin} 分钟，在你设定的 ${minutes} 分钟内。`;
    return `${eta}；届时每天同步带来约 ${reviewLoad} 个复习。${budget}<br>${advice}`;
  }

  async function saveProfile() {
    const band = pendingBand || bandNow();
    const date = $('#pl-date').value || null;
    const mins = +$('#pl-min').value;
    const newPerDay = pendingNew || dailyNewOf();
    Store.saveProfile({ target_band: band, exam_date: date, daily_minutes: mins });
    Store.saveSettings({ daily_new: newPerDay });
    pendingBand = null; pendingNew = null;
    // 计划变化，重建今日任务
    delete Store.state.tasks[todayStr()];
    Store.loadTasks();
    UI.toast(`已保存：目标 ${band} 分 · 每天 ${newPerDay} 个新词`);
    UI.setUserChip();
    render($('#view'));
  }

  function regen() {
    delete Store.state.tasks[todayStr()];
    Store.loadTasks();
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

  return { generate, render, saveProfile, regen, toggle, open, previewMinutes, pickNew, pickBand, dailyNewFrom, dailyNewOf, moduleName, BAND_VOCAB, BANDS, NEW_OPTIONS, newHint };
})();
