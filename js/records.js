/* 学习记录：时间投入 / 听写正确率 / 错词排行 / 写作练习（本地数据） */
const Records = (() => {
  async function render(root) {
    await Store.loadUser();
    await Store.loadWords();
    const rows = Store.history(30);
    const stats = Store.stats();
    const st = Store.streak(rows);
    const totalSec = rows.reduce((a, r) => a + (r.study_seconds || 0), 0);
    const totalWords = rows.reduce((a, r) => a + (r.new_words || 0), 0);
    const sess = Store.eventsOf('listening', 12);
    const notes = Store.eventsOf('writing', 10);
    const avgAcc = sess.length ? Math.round(sess.reduce((a, s) => a + (s.accuracy || 0), 0) / sess.length) : null;

    // 近 14 天柱状
    const days = [];
    const map = {};
    rows.forEach(r => { map[r.day] = r; });
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = todayStr(d);
      const r = map[k];
      days.push({ k, v: r ? (r.study_seconds || 0) / 60 : 0, label: `${d.getMonth() + 1}/${d.getDate()}` });
    }
    const max = Math.max(20, ...days.map(d => d.v));

    // 错因聚合
    const tagCount = {};
    sess.forEach(s => {
      const tags = Array.isArray(s.error_tags) ? s.error_tags : [];
      tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
    });
    const tagRank = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 4);

    root.innerHTML = `
      <h1>学习记录</h1>
      <p class="muted" style="margin-bottom:14px">数据不是为了给你压力，是为了看清哪一环还没打通。</p>

      <div class="kpis">
        <div class="kpi"><div class="n">${st} 天</div><div class="l">连续学习</div></div>
        <div class="kpi"><div class="n">${fmtMin(Math.round(totalSec / 60))}</div><div class="l">近 30 天投入</div></div>
        <div class="kpi"><div class="n">${totalWords}</div><div class="l">新学单词</div></div>
        <div class="kpi"><div class="n">${avgAcc == null ? '—' : avgAcc + '%'}</div><div class="l">听写平均正确率</div></div>
      </div>

      <div class="card">
        <div class="card-title"><h3>近 14 天学习时长</h3><span class="pill blue">分钟</span></div>
        <div class="bars">
          ${days.map(d => `<div class="b ${d.v > 0 ? 'on' : ''}" style="height:${Math.max(3, d.v / max * 100)}%" title="${d.k}：${Math.round(d.v)} 分钟"><span>${d.label}</span></div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title"><h3>近 30 天打卡</h3><span class="pill ${st >= 3 ? 'green' : ''}">连续 ${st} 天</span></div>
        <div class="heats" style="display:grid;grid-template-columns:repeat(15,1fr);gap:4px">
          ${heatCells(rows)}
        </div>
        <p class="muted tiny" style="margin:8px 0 0">颜色越深投入越多，空格是没学习的日子。中断不可怕，重启就好。</p>
      </div>

      ${Daily.achievementsHTML()}

      <div class="card">
        <div class="card-title"><h3>词汇状态</h3><a class="link-btn" href="#/vocab/mistakes">错词本 →</a></div>
        <div class="kpis" style="margin:0">
          <div class="kpi" style="box-shadow:none;border:none;padding:6px 0"><div class="n">${stats.learned}</div><div class="l">学过</div></div>
          <div class="kpi" style="box-shadow:none;border:none;padding:6px 0"><div class="n" style="color:var(--green)">${stats.mastered}</div><div class="l">已掌握</div></div>
          <div class="kpi" style="box-shadow:none;border:none;padding:6px 0"><div class="n" style="color:var(--amber)">${stats.learning}</div><div class="l">学习中</div></div>
          <div class="kpi" style="box-shadow:none;border:none;padding:6px 0"><div class="n" style="color:var(--red)">${stats.mistakes.length}</div><div class="l">错词</div></div>
        </div>
        ${stats.mistakes.length ? `<div class="sep"></div>
          <div class="label">错误最多的词</div>
          ${stats.mistakes.slice(0, 6).map(r => {
            const w = Store.byId[r.word_id];
            if (!w) return '';
            return `<div class="wlist-item" onclick="location.hash='#/vocab/w/${w.id}'">
              <div class="wl-main"><div><span class="wl-w">${esc(w.w)}</span><span class="wl-ph">${esc(w.ph || '')}</span></div>
                <div class="wl-cn">${esc((w.m || []).map(m => m.cn).join('；'))}</div></div>
              <span class="pill red">错 ${r.wrong || 0}</span></div>`;
          }).join('')}` : ''}
      </div>

      ${tagRank.length ? `<div class="card">
        <div class="card-title"><h3>听力薄弱画像</h3><span class="tiny dim">来自你勾选的错因</span></div>
        ${tagRank.map(([k, n]) => `<div class="row between" style="padding:6px 0">
          <span class="tiny">${esc(Listening.tagLabel ? Listening.tagLabel(k) : k)}</span>
          <span class="pill amber">${n} 次</span></div>`).join('')}
        <p class="muted tiny" style="margin-top:8px">同一类错因积累 3 次以上，说明这是稳定短板，值得专门练一轮。</p>
      </div>` : ''}

      <div class="card">
        <div class="card-title"><h3>听力练习记录</h3></div>
        ${sess.length ? sess.map(s => `<div class="task-item">
          <span class="pill ${s.accuracy >= 85 ? 'green' : s.accuracy >= 60 ? 'amber' : 'red'}">${s.accuracy}%</span>
          <div class="task-main"><div class="t">${esc(s.drill_id)} · 精听</div>
            <div class="s">漏听 ${s.missed_words} · 拼写 ${s.spelling_errors} · ${Math.round((s.seconds || 0) / 60)} 分钟 · ${esc(s.day || '')}</div></div>
        </div>`).join('') : '<p class="muted tiny">还没有听力记录</p>'}
      </div>

      <div class="card">
        <div class="card-title"><h3>写作练习</h3></div>
        ${notes.length
          ? notes.map((n, i) => `<div class="task-item">
              <div class="task-main"><div class="t">${esc((n.title || '练习').slice(0, 40))}</div>
                <div class="s">${(n.content || '').split(/\s+/).filter(Boolean).length} 词 · ${esc(n.day || '')}</div></div>
              <button class="btn sm soft" onclick="Records.viewNote(${i})">查看</button>
            </div>`).join('')
          : '<p class="muted tiny">还没有保存过作文</p>'}
      </div>`;
  }

  function heatCells(rows) {
    const map = {};
    rows.forEach(r => { map[r.day] = (r.study_seconds || 0) / 60 + (r.new_words || 0) * 1.5; });
    const cells = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = todayStr(d);
      const v = map[k] || 0;
      const lv = v === 0 ? '' : v < 10 ? 'l1' : v < 25 ? 'l2' : v < 50 ? 'l3' : 'l4';
      cells.push(`<i class="${lv}" title="${k}：${Math.round(v)} 分钟"></i>`);
    }
    return cells.join('');
  }

  function viewNote(idx) {
    const notes = Store.eventsOf('writing', 10);
    const n = notes[idx];
    if (!n) return;
    UI.openModal(`<h2>${esc((n.title || '练习').slice(0, 50))}</h2>
      <p class="muted tiny">${esc(n.day || '')}</p>
      <div class="essay" style="font-size:14px">${esc(n.content || '')}</div>`, { wide: true });
  }

  return { render, viewNote };
})();
