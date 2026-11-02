/* 首页：每日学习空间（今日内容 + 任务 + 提醒 + 推荐 + 成就 + 总结 + 励志） */
const Dashboard = (() => {
  async function render(root) {
    await Store.loadWords();
    await Store.loadUser();
    await Store.loadTasks();
    await Daily.prepareUserStats();

    const p = Store.profile;
    const left = Store.examCountdown();
    const stats = Store.stats();
    const tasks = Store.tasks || [];
    const doneCnt = tasks.filter(t => t.status === 'done').length;
    const pct = tasks.length ? Math.round(doneCnt / tasks.length * 100) : 0;
    const today = Store.today || {};
    const secs = today.study_seconds || 0;
    const remain = tasks.length - doneCnt;

    const feed = await Daily.feedHTML();
    const motivation = await Daily.motivateHTML();
    const recs = buildRecommendations(stats, tasks, left, today);

    root.innerHTML = `
      <section class="hero">
        <div class="greet">
          <h1>${greeting()}，同学</h1>
          <p>${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
            ${p.target_band ? ` · 目标 ${p.target_band} 分` : ' · <a href="#/profile" style="text-decoration:underline">设置目标 →</a>'}
            ${left != null && left >= 0 ? ` · 距考试 <b>${left}</b> 天` : ''}</p>
          <p class="tiny" style="margin:6px 0 0;color:var(--ink-2)">${reminderText(remain, tasks.length, left)}</p>
        </div>
        ${UI.ring(pct)}
        <div style="min-width:118px">
          <div class="tiny dim">今日任务</div>
          <div style="font-size:15px;font-weight:500">${doneCnt} / ${tasks.length} 已完成</div>
          <div class="tiny dim" style="margin-top:2px">${secs ? '已学习 ' + fmtMin(Math.round(secs / 60)) : '还没开始，先做一件小事'}</div>
        </div>
      </section>

      ${(typeof Hi5 !== 'undefined' && Hi5.cardHTML) ? Hi5.cardHTML() : ''}

      <section class="kpis">
        <div class="kpi"><div class="n">${stats.due}</div><div class="l">待复习</div></div>
        <div class="kpi"><div class="n">${stats.mastered}</div><div class="l">已掌握</div></div>
        <div class="kpi"><div class="n">${Store._streak || 0} 天</div><div class="l">连续学习</div></div>
        <div class="kpi"><div class="n">${fmtMin(Math.round(secs / 60))}</div><div class="l">今日时长</div></div>
      </section>

      ${feed}

      ${craftBlock()}

      <div class="card">
        <div class="card-title"><h3>今日任务</h3><a class="link-btn" href="#/plan">调整计划 →</a></div>
        ${tasks.length ? tasks.map(t => `
          <div class="task-item">
            <span class="task-check ${t.status === 'done' ? 'done' : ''}" onclick="Dashboard.toggle('${jss(t.id)}')">${t.status === 'done' ? '✓' : ''}</span>
            <div class="task-main">
              <div class="t ${t.status === 'done' ? 'done' : ''}">${esc(t.title)}</div>
              <div class="s">${Plan.moduleName(t.module)} · 约 ${t.est_min} 分钟</div>
            </div>
            <button class="btn sm ${t.status === 'done' ? 'soft' : 'ghost'}" onclick="Plan.open('${t.module}','${t.task_key}')">${t.status === 'done' ? '再练' : '开始'}</button>
          </div>`).join('') : `<p class="muted tiny">暂无任务，去<a href="#/plan">学习计划</a>生成今天的安排</p>`}
      </div>

      ${recs.length ? `<div class="card">
        <div class="card-title"><h3>今天优先做这些</h3><span class="pill amber">根据你的薄弱项</span></div>
        ${recs.map(r => `<div class="task-item">
          <span class="pill ${r.tone || 'blue'}">${r.tag}</span>
          <div class="task-main"><div class="t">${esc(r.text)}</div><div class="s">${esc(r.hint || '')}</div></div>
          <button class="btn sm soft" onclick="${r.action}">去处理</button>
        </div>`).join('')}
      </div>` : ''}

      ${Daily.summary() || ''}
      ${Daily.achievementsHTML()}
      ${motivation}
    `;
    try { if (typeof Hi5 !== 'undefined' && Hi5.bind) Hi5.bind(root); } catch (e) { /* 击掌卡失败不影响首页 */ }
    window.scrollTo(0, 0);
  }

  /** 手工进度 + 听写入口 */
  function craftBlock() {
    const m = (window.Craft && Store.words.length) ? Craft.mini() : null;
    const dictDone = (Store.today && Store.today.reviews) || 0;
    return `
      <div class="grid g2">
        ${m ? `<div class="craft-card" onclick="location.hash='#/craft'">
          <div class="row between">
            <div>
              <div class="ct">${m.c.craft.emoji} ${esc(m.c.craft.name)}</div>
              <div class="cs">第 ${m.c.id} 单元 · 已${m.c.craft.verb} ${m.st.done}/${m.st.total} ${m.c.craft.unit}</div>
            </div>
            <span class="pill ${m.st.wrongTotal ? 'red' : 'green'}">${m.st.wrongTotal ? m.st.wrongTotal + ' 个线头' : '没有线头'}</span>
          </div>
          <div class="craft-stage" style="margin:10px 0">${m.art}</div>
          <div class="progress" style="margin:0 0 6px"><i style="width:${m.st.pct}%"></i></div>
          <p class="muted tiny" style="margin:0">背一个词就多一${m.c.craft.unit}，学完这个单元成品就进柜子。</p>
        </div>` : ''}

        <div class="card" style="margin:0">
          <div class="card-title"><h3>听写 · 闯关</h3><span class="pill amber">动手练</span></div>
          <p class="muted tiny" style="margin:0 0 10px">看懂了不等于写得出。听写给发音让你默写，闯关按单元一关一关过，错一个扣一颗心。</p>
          <div class="row wrap">
            <button class="btn primary sm" onclick="location.hash='#/dictation'">开始今日听写</button>
            <button class="btn sm" onclick="location.hash='#/game'">拼词闯关</button>
            <button class="btn sm soft" onclick="location.hash='#/craft'">看手工柜</button>
          </div>
          <div class="sep"></div>
          <p class="muted tiny" style="margin:0">今天已经动手 ${dictDone} 次；听写和闯关拼对的词都会计入复习进度与手作针脚。</p>
        </div>
      </div>`;
  }

  function reminderText(remain, total, left) {
    if (!total) return '先去「学习计划」设定目标，系统会每天为你排任务。';
    const h = new Date().getHours();
    if (remain === 0) return '今天的任务已经清空，剩下的时间属于你自己。';
    if (h >= 22) return `还有 ${remain} 项没完成。挑最小的一件做完就睡，别熬夜还债。`;
    if (h >= 18) return `还有 ${remain} 项任务，趁记忆还热，先做最费脑的那一项。`;
    if (left != null && left <= 14 && left > 0) return `距考试 ${left} 天，还有 ${remain} 项任务，今天优先精听和作文。`;
    return `今天有 ${total} 项安排，已完成 ${total - remain} 项。`;
  }

  function buildRecommendations(stats, tasks, left, today) {
    const recs = [];
    if (stats.overdue > 0) {
      recs.push({ tag: '逾期复习', tone: 'red', text: `${stats.overdue} 个词的复习已逾期`, hint: '遗忘曲线已经过峰值，现在补最省时间', action: "location.hash='#/vocab/study/review'" });
    } else if (stats.due > 8) {
      recs.push({ tag: '复习优先', tone: 'amber', text: `今天有 ${stats.due} 个词到期`, hint: '先清复习再学新词，避免越学越忘', action: "location.hash='#/vocab/study/review'" });
    }
    if ((Store._listenCount || 0) > 0 && (Store._bestAccuracy || 0) < 85) {
      recs.push({ tag: '听力薄弱', tone: 'purple', text: '你的听写正确率还没上 85%', hint: '问题多半在连读弱读，做一组逐句精听', action: "location.hash='#/listening'" });
    }
    if ((Store._writingCount || 0) === 0) {
      recs.push({ tag: '写作', tone: 'blue', text: '还没动笔写过一篇', hint: '先照着今日范文的结构写 150 词，比看完十篇都有用', action: "location.hash='#/writing'" });
    }
    if (stats.mistakes.length >= 5) {
      recs.push({ tag: '错词', tone: 'red', text: `${stats.mistakes.length} 个词反复记错`, hint: '这些词要么词根没吃透，要么辨析不清，专项练一轮', action: "location.hash='#/vocab/mistakes'" });
    }
    const h = new Date().getHours();
    if (h >= 20 && !(today && (today.study_seconds || 0))) {
      recs.push({ tag: '该开始了', tone: 'amber', text: '今天还没有学习记录', hint: '只做 10 个词也算开始，别等"整块时间"', action: "location.hash='#/vocab/study/new'" });
    }
    return recs.slice(0, 3);
  }

  async function toggle(id) {
    const t = (Store.tasks || []).find(x => x.id === id);
    if (!t) return;
    Store.toggleTask(t, t.status !== 'done');
    if (t.status === 'done') { try { Track.study('task', { m: t.module }); } catch (e) { /* 忽略 */ } }
    render($('#view'));
  }

  return { render, toggle };
})();
