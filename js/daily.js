/* 每日学习空间：每日内容轮换 / 成就系统 / 今日总结 */
const Daily = (() => {
  const cache = { essays: null, motivation: null, listening: null, speaking: null };

  function dayIndex(d) {
    const t = d || new Date();
    return Math.floor((t - new Date(t.getFullYear(), 0, 0)) / 86400000);
  }
  function weekIndex(d) {
    return Math.floor(dayIndex(d) / 7);
  }
  function pick(arr, i) {
    if (!arr || !arr.length) return null;
    return arr[((i % arr.length) + arr.length) % arr.length];
  }

  async function ensure() {
    const jobs = [];
    if (!cache.essays) jobs.push(fetch('data/daily_essays.json').then(r => r.ok ? r.json() : { essays: [] }).then(j => { cache.essays = j.essays || []; }).catch(() => { cache.essays = []; }));
    if (!cache.motivation) jobs.push(fetch('data/daily_motivation.json').then(r => r.ok ? r.json() : { quotes: [], stories: [] }).then(j => { cache.motivation = j; }).catch(() => { cache.motivation = { quotes: [], stories: [] }; }));
    if (!cache.listening && window.Listening) jobs.push(Listening.ensure().then(() => { cache.listening = true; }).catch(() => { cache.listening = true; }));
    if (!cache.speaking && window.Speaking) jobs.push(Speaking.ensure().then(() => { cache.speaking = true; }).catch(() => { cache.speaking = true; }));
    await Promise.all(jobs);
  }

  /** 今日内容（确定性轮换，同一天永远相同） */
  function today() {
    const di = dayIndex();
    const essays = cache.essays || [];
    const t2 = essays.filter(e => e.type === 'Task2');
    const t1 = essays.filter(e => e.type === 'Task1');
    const m = cache.motivation || { quotes: [], stories: [] };
    return {
      essayT2: pick(t2, di),
      essayT1: pick(t1, di),
      quote: pick(m.quotes, di),
      story: pick(m.stories, weekIndex()),
      dayIndex: di,
    };
  }

  /** 今日重点单词：按日期在词库中滑动取 5 个，优先未掌握 */
  function todayWords(n) {
    const words = Store.words || [];
    if (!words.length) return [];
    const prog = Store.progress || {};
    const pool = words.filter(w => !prog[w.id] || (prog[w.id].box || 0) < 5);
    const base = pool.length >= n * 12 ? pool : words;
    const start = (dayIndex() * 7) % Math.max(1, base.length - n);
    return base.slice(start, start + (n || 5));
  }

  /* ================= 首页的每日内容卡 ================= */
  async function feedHTML() {
    await ensure();
    const t = today();
    const words = todayWords(5);
    const mat = (window.Listening && Listening.dailyPick) ? Listening.dailyPick(dayIndex()) : null;
    const spk = (window.Speaking && Speaking.dailyPick) ? Speaking.dailyPick(dayIndex()) : null;

    return `
      <div class="section-h"><h3>今天读什么 · 学什么</h3><span class="pill blue">每日更新</span></div>
      <div class="grid g2">
        ${t.essayT2 ? `<div class="card hover" onclick="location.hash='#/daily/essay/${t.essayT2.id}'">
          <span class="pill amber">今日大作文</span>
          <h4 style="margin:8px 0 4px">${esc(t.essayT2.topic)} · ${esc(t.essayT2.task_type || t.essayT2.type)}</h4>
          <p class="muted tiny" style="margin:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(t.essayT2.prompt)}</p>
          <div class="row tiny dim" style="margin-top:6px"><span>${t.essayT2.word_count || ''} 词</span><span>·</span><span>${esc(t.essayT2.difficulty || '')}</span></div>
        </div>` : ''}
        ${t.essayT1 ? `<div class="card hover" onclick="location.hash='#/daily/essay/${t.essayT1.id}'">
          <span class="pill green">今日小作文</span>
          <h4 style="margin:8px 0 4px">${esc(t.essayT1.topic)} · ${esc(t.essayT1.chart_type || 'Task 1')}</h4>
          <p class="muted tiny" style="margin:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(t.essayT1.prompt)}</p>
          <div class="row tiny dim" style="margin-top:6px"><span>${t.essayT1.word_count || ''} 词</span><span>·</span><span>${esc(t.essayT1.difficulty || '')}</span></div>
        </div>` : ''}
        ${!t.essayT2 && !t.essayT1 ? `<div class="card hover" onclick="location.hash='#/writing'">
          <span class="pill amber">今日范文</span>
          <h4 style="margin:8px 0 4px">去范文精读里挑一篇</h4>
          <p class="muted tiny" style="margin:0">结构拆解 + 中英对照 + 可迁移句型</p>
        </div>` : ''}
      </div>

      <div class="card">
        <div class="card-title"><h3>今日重点单词</h3><span class="pill">${words.length} 个 · 点击看词根</span></div>
        ${words.map(w => `
          <div class="wlist-item" onclick="location.hash='#/vocab/w/${w.id}'">
            <div class="wl-main">
              <div><span class="wl-w">${esc(w.w)}</span><span class="wl-ph">${esc(w.ph || '')}</span></div>
              <div class="wl-cn">${esc((w.m || []).map(m => m.cn).join('；'))}</div>
            </div>
            <button class="btn sm icon soft" onclick="event.stopPropagation();Audio2.play(audUk('${w.id}'),'${esc(w.w)}')">🔊</button>
          </div>`).join('')}
        <button class="btn block sm" style="margin-top:8px" onclick="location.hash='#/vocab/study/new'">把这批词加入学习 →</button>
      </div>

      ${rootCard()}

      <div class="grid g2">
        ${mat ? `<div class="card hover" onclick="Listening.open('${mat.id}')">
          <span class="pill purple">今日听力</span>
          <h4 style="margin:8px 0 4px">${esc(mat.title)}</h4>
          <p class="muted tiny" style="margin:0">${esc(mat.section)} · ${mat.sentences.length} 句 · 精听</p>
        </div>` : ''}
        ${spk ? `<div class="card hover" onclick="location.hash='#/speaking'">
          <span class="pill blue">今日口语</span>
          <h4 style="margin:8px 0 4px">${esc(spk.title)}</h4>
          <p class="muted tiny" style="margin:0">Part 2 话题卡 · 1 分钟准备 + 2 分钟陈述</p>
        </div>` : ''}
      </div>`;
  }

  let quoteOffset = 0;   // 「换一句」的偏移，不写库，只影响当前这次浏览

  /** 励志内容按当下状态挑场景：拖延 / 想放弃 / 倦怠 / 焦虑 */
  function quoteFor(ctx) {
    const m = cache.motivation || { quotes: [], stories: [] };
    const qs = m.quotes || [];
    if (!qs.length) return null;
    let scene = null;
    if (ctx.overdue > 0) scene = '拖延时';
    else if (ctx.daysLeft != null && ctx.daysLeft <= 14 && ctx.daysLeft >= 0) scene = '焦虑时';
    else if (!ctx.studied && ctx.hour >= 21) scene = '想放弃时';
    else if ((ctx.streak || 0) >= 3 && !ctx.studied) scene = '倦怠时';
    const pool = scene ? qs.filter(q => q.scene === scene) : [];
    return pick(pool.length ? pool : qs, dayIndex() + quoteOffset);
  }

  /* ================= 今日词根 ================= */
  function rootOfDay() {
    if (!Store.rootGroups) return null;
    const groups = Store.rootGroups();
    if (!groups.length) return null;
    const g = pick(groups, dayIndex());
    return { ...g, list: g.list.slice(0, 5) };
  }

  function rootCard() {
    const g = rootOfDay();
    if (!g) return '';
    const logic = ((g.list[0].root || {}).logic || '').trim();
    return `
      <div class="card">
        <div class="card-title">
          <h3>今日词根 <span style="color:var(--purple)">${esc(g.key)}</span></h3>
          <a class="link-btn tiny" href="#/vocab/roots">全部词根 →</a>
        </div>
        ${logic ? `<div class="root-box" style="margin-bottom:10px"><div class="root-logic">${esc(logic)}</div></div>` : ''}
        ${g.list.map(w => `
          <div class="wlist-item" onclick="location.hash='#/vocab/w/${w.id}'">
            <div class="wl-main">
              <div><span class="wl-w">${esc(w.w)}</span><span class="wl-ph">${esc(w.ph || '')}</span></div>
              <div class="wl-cn">${esc((w.m || []).map(m => m.cn).join('；'))}</div>
            </div>
          </div>`).join('')}
        <p class="muted tiny" style="margin:8px 0 0">同根词一起记，比一个一个背省一半力气。今天这 ${g.list.length} 个词，能串起 ${g.list.length >= 3 ? '一整族' : '几个'} 相关词。</p>
      </div>`;
  }

  /* ================= 励志卡 ================= */
  async function motivateHTML() {
    await ensure();
    const st = Store.stats();
    const t = Store.today || {};
    const q = quoteFor({
      overdue: st.overdue || 0,
      studied: !!(t.study_seconds || t.new_words || t.reviews),
      streak: Store._streak || 0,
      daysLeft: Store.examCountdown(),
      hour: new Date().getHours(),
    }) || today().quote;
    const s = today().story;
    if (!q) return '';
    return `
      <div class="quote-card" id="daily-quote">
        <div class="q">“${esc(q.quote)}”</div>
        <p class="t">${esc(q.text)}</p>
        <div class="row between wrap" style="margin-top:10px">
          <div class="row" style="gap:8px">
            <span class="pill amber">${esc(q.scene || '')}</span>
            ${s ? `<button class="link-btn tiny" onclick="Daily.showStory()">看一个学习故事 →</button>` : ''}
          </div>
          <button class="btn sm soft" onclick="Daily.nextQuote()">换一句</button>
        </div>
      </div>`;
  }

  /** 换一句：不写库，只换当前页面这一条 */
  async function nextQuote() {
    quoteOffset++;
    const el = document.getElementById('daily-quote');
    if (!el) return;
    const html = await motivateHTML();
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const card = tmp.firstElementChild;
    if (card) el.replaceWith(card);
  }

  async function showStory() {
    await ensure();
    const s = today().story;
    if (!s) return;
    UI.openModal(`<h2>${esc(s.title)}</h2>
      <div class="tiny dim" style="margin-bottom:10px">${(s.tags || []).map(t => `<span class="pill amber">${esc(t)}</span>`).join(' ')}</div>
      <p class="muted" style="font-size:14px;line-height:1.85">${esc(s.body)}</p>
      <div class="feedback ok" style="margin-top:10px"><b>可以试试：</b>${esc(s.takeaway || '')}</div>`, { wide: true });
  }

  /* ================= 成就系统 ================= */
  function achievements() {
    const st = Store.stats();
    const today = Store.today || {};
    const list = [
      { key: 'first-word', name: '起步', desc: '学完第一个单词', icon: '①', got: st.learned >= 1 },
      { key: 'words-50', name: '半百', desc: '掌握 50 个单词', icon: '②', got: st.mastered >= 50 },
      { key: 'words-100', name: '百词斩', desc: '掌握 100 个单词', icon: '③', got: st.mastered >= 100 },
      { key: 'words-300', name: '词库过半', desc: '掌握 300 个单词', icon: '④', got: st.mastered >= 300 },
      { key: 'streak-3', name: '三天不辍', desc: '连续学习 3 天', icon: '⑤', got: (Store._streak || 0) >= 3 },
      { key: 'streak-7', name: '一周不断', desc: '连续学习 7 天', icon: '⑥', got: (Store._streak || 0) >= 7 },
      { key: 'streak-30', name: '月度习惯', desc: '连续学习 30 天', icon: '⑦', got: (Store._streak || 0) >= 30 },
      { key: 'first-listen', name: '耳朵开机', desc: '完成第一次精听', icon: '⑧', got: (Store._listenCount || 0) >= 1 },
      { key: 'listen-10', name: '听力常客', desc: '完成 10 次听力练习', icon: '⑨', got: (Store._listenCount || 0) >= 10 },
      { key: 'first-essay', name: '动笔了', desc: '完成第一篇作文', icon: '⑩', got: (Store._writingCount || 0) >= 1 },
      { key: 'essay-5', name: '笔耕不辍', desc: '累计完成 5 篇作文', icon: '⑪', got: (Store._writingCount || 0) >= 5 },
      { key: 'accuracy-90', name: '耳准', desc: '单次听写正确率 ≥ 90%', icon: '⑫', got: (Store._bestAccuracy || 0) >= 90 },
    ];
    return list;
  }

  function achievementsHTML() {
    const list = achievements();
    const got = list.filter(a => a.got).length;
    return `
      <div class="card">
        <div class="card-title"><h3>学习成就</h3><span class="pill ${got ? 'green' : ''}">${got} / ${list.length}</span></div>
        <div class="grid g4" style="gap:8px">
          ${list.map(a => `<div class="center" style="padding:8px 4px;border-radius:10px;${a.got ? 'background:var(--green-2)' : 'background:var(--surface-2);opacity:.55'}"
            title="${esc(a.desc)}">
            <div style="font-size:17px">${a.got ? '★' : '☆'}</div>
            <div class="tiny" style="font-weight:500;margin-top:2px">${esc(a.name)}</div>
            <div class="tiny dim" style="font-size:10.5px;line-height:1.3">${esc(a.desc)}</div>
          </div>`).join('')}
        </div>
        <p class="muted tiny" style="margin:10px 0 0">成就会随学习自动点亮，不需要手动打卡。盯着"今天有没有推进"比盯着分数更有用。</p>
      </div>`;
  }

  /* ================= 今日总结 ================= */
  function summary() {
    const t = Store.today || {};
    const newWords = t.new_words || 0;
    const reviews = t.reviews || 0;
    const secs = t.study_seconds || 0;
    const correct = t.correct || 0, wrong = t.wrong || 0;
    const tasks = Store.tasks || [];
    const doneTasks = tasks.filter(x => x.status === 'done');
    const st = Store.stats();
    if (!newWords && !reviews && !secs && !doneTasks.length) return null;

    const tomorrow = [];
    if (st.due > 0) tomorrow.push(`先清掉 ${st.due} 个到期复习词（今天的记忆还没凉，最省力）`);
    if (st.mistakes.length >= 3) tomorrow.push(`挑 ${Math.min(5, st.mistakes.length)} 个错词做一次听音拼写`);
    if (reviews === 0) tomorrow.push('安排一段精听，听写是检验"真的听懂"的唯一方式');
    if (!tomorrow.length) tomorrow.push('按今天的节奏继续，稳住就已经很快了');

    const acc = correct + wrong ? Math.round(correct / (correct + wrong) * 100) : null;
    return `
      <div class="card">
        <div class="card-title"><h3>今日总结</h3><span class="pill blue">${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}</span></div>
        <div class="grid g4" style="gap:8px;margin-bottom:10px">
          <div class="center"><div style="font-size:18px;font-weight:600">${newWords}</div><div class="tiny dim">新词</div></div>
          <div class="center"><div style="font-size:18px;font-weight:600">${reviews}</div><div class="tiny dim">复习次数</div></div>
          <div class="center"><div style="font-size:18px;font-weight:600">${fmtMin(Math.round(secs / 60))}</div><div class="tiny dim">投入时长</div></div>
          <div class="center"><div style="font-size:18px;font-weight:600">${doneTasks.length}/${tasks.length}</div><div class="tiny dim">任务完成</div></div>
        </div>
        <p class="muted tiny" style="margin:0 0 6px">
          ${acc != null ? `今天答题正确率 ${acc}%。` : ''}${st.learning ? `有 ${st.learning} 个词在复习队列里滚动。` : ''}
          ${doneTasks.length ? `已完成：${doneTasks.map(x => esc(x.title)).slice(0, 3).join('、')}${doneTasks.length > 3 ? ' 等' : ''}。` : ''}
        </p>
        <div class="sep"></div>
        <div class="label" style="margin-top:0">明天建议</div>
        ${tomorrow.map(x => `<div class="tiny" style="color:var(--ink-2);padding:2px 0">· ${esc(x)}</div>`).join('')}
      </div>`;
  }

  /* ================= 作文教学包详情 ================= */
  async function renderEssay(root, id) {
    await ensure();
    const e = (cache.essays || []).find(x => x.id === id);
    if (!e) { root.innerHTML = '<div class="empty">找不到这篇范文<br><a href="#/home">回到首页</a></div>'; return; }
    const full = (e.paragraphs || []).map(p => p.en).join('\n\n');
    root.innerHTML = `
      <a class="back" href="#/home">← 返回今日</a>
      <div class="row wrap" style="gap:8px;margin-bottom:6px">
        <span class="pill ${e.type === 'Task2' ? 'amber' : 'green'}">${esc(e.type)}</span>
        <span class="pill">${esc(e.topic)}</span>
        <span class="pill line">${esc(e.difficulty || '')}</span>
        <span class="pill line">${e.word_count || ''} 词</span>
        ${e.band ? `<span class="pill line" title="按四项评分标准自评的参考档位，非官方评分">参考 ${esc(e.band)} 档</span>` : ''}
      </div>
      <h1 style="font-size:19px;line-height:1.5">${esc(e.prompt)}</h1>
      <p class="muted tiny">${esc(e.prompt_zh || '')}</p>

      <div class="card">
        <div class="card-title"><h3>题目拆解</h3><span class="pill purple">${esc((e.analysis && e.analysis.task_type) || '')}</span></div>
        ${(e.analysis && e.analysis.keywords) ? `<div class="chips" style="margin-bottom:8px">${e.analysis.keywords.map(k => `<span class="chip-word" title="${esc(k)}">${esc(String(k).split('（')[0])}</span>`).join('')}</div>` : ''}
        ${(e.analysis && e.analysis.stand) ? `<div class="feedback ok" style="margin-bottom:8px"><b>推荐立场：</b>${esc(e.analysis.stand)}</div>` : ''}
        ${(e.analysis && e.analysis.traps) ? `<div class="feedback no"><b>易跑题点：</b>${esc(e.analysis.traps)}</div>` : ''}
      </div>

      <div class="card">
        <div class="card-title"><h3>写作思路</h3><span class="tiny dim">先看结构，再看句子</span></div>
        ${(e.outline || []).map(o => `<div class="map-row">
          <div class="map-part">${esc(o.para)}</div>
          <div class="map-body"><b>${esc(o.goal)}</b>
            ${(o.points || []).map(p => `<div class="tiny muted">· ${esc(p)}</div>`).join('')}
          </div></div>`).join('')}
      </div>

      <div class="card">
        <div class="card-title"><h3>逐段精讲 + 中英对照</h3>
          <button class="btn sm soft" onclick="Daily.toggleZh(this)">显示/隐藏中文</button></div>
        ${(e.paragraphs || []).map((p, i) => `<div style="padding:12px 0;border-top:1px solid var(--line)">
          <div class="row between" style="margin-bottom:4px">
            <span class="pill blue">第 ${i + 1} 段</span>
            <button class="btn sm icon soft" onclick="Audio2.speakFallback('${jss(p.en)}')">🔊</button>
          </div>
          <div class="essay" style="font-size:15px">${esc(p.en)}</div>
          <div class="essay zh-block" style="font-size:13.5px;color:var(--ink-2);margin-top:6px">${esc(p.zh)}</div>
          ${p.note ? `<div class="feedback info" style="margin-top:8px"><b>这段为什么这么写：</b>${esc(p.note)}</div>` : ''}
        </div>`).join('')}
      </div>

      <div class="card">
        <div class="card-title"><h3>重点词汇与词根拓展</h3><span class="pill">${(e.key_vocab || []).length} 个</span></div>
        ${(e.key_vocab || []).map(v => `<div style="padding:9px 0;border-top:1px solid var(--line)">
          <div class="row"><b style="font-size:14.5px">${esc(v.en)}</b>
            <span class="muted tiny">${esc(v.cn)}</span>
            <button class="btn sm icon soft" style="margin-left:auto" onclick="Audio2.speakFallback('${jss(v.en)}')">🔊</button></div>
          ${v.root ? `<div class="root-box" style="margin-top:6px;padding:9px 11px"><div class="root-logic" style="font-size:12.5px">${esc(v.root)}</div></div>` : ''}
          ${v.use ? `<div class="tiny muted" style="margin-top:4px">${esc(v.use)}</div>` : ''}
        </div>`).join('')}
      </div>

      ${(e.patterns && e.patterns.length) ? `<div class="card">
        <div class="card-title"><h3>高分句型（可直接迁移）</h3></div>
        ${e.patterns.map(p => `<div style="padding:9px 0;border-top:1px solid var(--line)">
          <div class="ex-en" style="font-size:14px">${esc(p.en)}</div>
          <div class="tiny muted">${esc(p.zh)}</div>
          <div class="tiny" style="color:var(--purple);margin-top:3px">模板：${esc(p.note)}</div>
        </div>`).join('')}
      </div>` : ''}

      <div class="row wrap" style="margin-bottom:24px">
        <button class="btn primary" onclick="Writing.practiceDaily('${jss(e.prompt)}')">照这个结构写一篇</button>
        <button class="btn" onclick="AI.reviewText('${jss(e.prompt)}','')">让 AI 带我写</button>
        <button class="btn soft" onclick="Daily.copyEssay()">复制全文</button>
      </div>
      <textarea id="full-essay" style="display:none">${esc(full)}</textarea>`;
    window.scrollTo(0, 0);
  }

  function toggleZh(btn) {
    $$('.zh-block').forEach(b => b.classList.toggle('hide'));
    UI.toast('已切换中英对照');
  }

  function copyEssay() {
    const ta = $('#full-essay');
    if (!ta) return;
    ta.style.display = 'block';
    ta.select();
    try { document.execCommand('copy'); UI.toast('全文已复制'); } catch (e) { UI.toast('请手动复制'); }
    setTimeout(() => { ta.style.display = 'none'; }, 800);
  }

  /** 供首页使用：取本地统计 */
  async function prepareUserStats() {
    const rows = Store.history(40);
    Store._streak = Store.streak(rows);
    const listens = Store.eventsOf('listening', 100);
    Store._listenCount = listens.length;
    Store._bestAccuracy = listens.reduce((a, x) => Math.max(a, x.accuracy || 0), 0);
    Store._writingCount = Store.eventsOf('writing', 100).length;
  }

  return { ensure, today, todayWords, feedHTML, motivateHTML, showStory, nextQuote, achievementsHTML, summary,
    renderEssay, toggleZh, copyEssay, prepareUserStats, dayIndex };
})();
