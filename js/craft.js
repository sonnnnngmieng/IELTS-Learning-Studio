/* 手工柜：把每个单元的单词做成一件手作。学一个词 = 织一针；错了 = 留下一个线头 */
const Craft = (() => {
  /* 单元 → 手作类型 */
  const CRAFT = {
    1: { key: 'scarf', name: '羊毛围巾', kind: '织', verb: '织', unit: '针', cols: 12, color: '#e0a13c', color2: '#f6d79b', emoji: '🧶' },
    2: { key: 'tote', name: '亚麻布包', kind: '缝', verb: '缝', unit: '格', cols: 10, color: '#9aa86a', color2: '#e2e6c8', emoji: '🪡' },
    3: { key: 'pillow', name: '拼布抱枕', kind: '拼', verb: '拼', unit: '块', cols: 8, color: '#cf8a72', color2: '#f3ddd4', emoji: '🧵' },
  };
  const FALLBACK = [
    { name: '手织杯垫', kind: '织', verb: '织', unit: '针', cols: 10, color: '#c9a227', color2: '#f3e3b4', emoji: '🧶' },
    { name: '布艺书签', kind: '缝', verb: '缝', unit: '格', cols: 8, color: '#9aa86a', color2: '#e2e6c8', emoji: '🪡' },
    { name: '拼贴画', kind: '拼', verb: '拼', unit: '块', cols: 8, color: '#cf8a72', color2: '#f3ddd4', emoji: '🧵' },
  ];

  function craftOf(chId, idx) {
    return CRAFT[chId] || FALLBACK[(idx || 0) % FALLBACK.length];
  }

  function chapters() {
    const list = (Store.state.chapters || []).slice();
    if (!list.length) {
      const ids = [...new Set(Store.words.map(w => w.ch))].sort();
      return ids.map((id, i) => ({ id, title: '第 ' + id + ' 单元', craft: craftOf(id, i) }));
    }
    return list.map((c, i) => ({ ...c, craft: craftOf(c.id, i) }));
  }

  /** 一个单元的进度：学会了多少针、错了几个线头 */
  function stats(chId) {
    const words = Store.words.filter(w => w.ch === chId);
    const prog = Store.progress || {};
    let done = 0, wrongTotal = 0;
    const threads = words.map(w => {
      const r = prog[w.id] || null;
      const learned = !!(r && (r.reps || 0) > 0);
      const wrong = (r && r.wrong) || 0;
      if (learned) done++;
      wrongTotal += wrong;
      return { w, learned, wrong };
    });
    const total = words.length || 1;
    return {
      total, done, pct: Math.round(done / total * 100), wrongTotal, threads,
      finished: done === total && total > 0,
    };
  }

  /* ================= 图形 ================= */
  /** 生成手作图：每个单词一格，已学会填色，错过的补一根红线头 */
  function art(chId, idx, opts) {
    opts = opts || {};
    const c = craftOf(chId, idx);
    const words = Store.words.filter(w => w.ch === chId).slice(0, opts.limit || 400);
    const st = stats(chId);
    const cols = c.cols;
    const cell = 16, pad = 14;
    const rows = Math.max(1, Math.ceil(words.length / cols));
    const W = cols * cell + pad * 2;
    const H = rows * cell + pad * 2;
    let cells = '';

    words.forEach((w, i) => {
      const x = pad + (i % cols) * cell;
      const y = pad + Math.floor(i / cols) * cell;
      const th = st.threads[i];
      const cx = x + cell / 2, cy = y + cell / 2;
      if (!th.learned) {
        cells += `<path d="M${x + 3} ${y + cell - 4} L${cx} ${y + 4} L${x + cell - 3} ${y + cell - 4}" fill="none" stroke="#efe3ca" stroke-width="1.6" stroke-dasharray="2 3" stroke-linecap="round"/>`;
        return;
      }
      const col = th.wrong > 0 ? c.color : c.color;
      if (c.key === 'scarf') {
        cells += `<path d="M${x + 3} ${y + cell - 4} L${cx} ${y + 4} L${x + cell - 3} ${y + cell - 4}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round" opacity="${th.wrong > 0 ? 0.9 : 1}"/>`;
      } else if (c.key === 'tote') {
        cells += `<rect x="${x + 2}" y="${y + 2}" width="${cell - 4}" height="${cell - 4}" rx="2.5" fill="${col}" opacity="${th.wrong > 0 ? 0.85 : 0.92}"/>`;
      } else {
        cells += `<path d="M${x + 3} ${y + 3} L${x + cell - 3} ${y + cell - 3} M${x + cell - 3} ${y + 3} L${x + 3} ${y + cell - 3}" stroke="${col}" stroke-width="2.4" stroke-linecap="round"/>`;
      }
      // 错过的词：留一根线头
      if (th.wrong > 0) {
        cells += `<path d="M${cx} ${cy} q${5 + th.wrong} ${-6} ${2} ${6} q${-3} ${5} ${4} ${3}" fill="none" stroke="#d4554c" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>`;
      }
    });

    const bg = c.key === 'pillow'
      ? `<rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="14" fill="${c.color2}" opacity=".45"/>`
      : c.key === 'tote'
        ? `<path d="M12 ${H - 40} v-14 a10 10 0 0 1 20 0 v14" fill="none" stroke="${c.color2}" stroke-width="4"/><rect x="6" y="${H - 42}" width="${W - 12}" height="36" rx="10" fill="${c.color2}" opacity=".38"/>`
        : `<rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="12" fill="${c.color2}" opacity=".38"/>`;

    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(c.name)}进度">
      ${bg}
      ${cells}
    </svg>`;
  }

  /* ================= 页面 ================= */
  async function render(root, seg) {
    await Store.loadWords();
    if (Cloud.user && !Store.state.ready) await Store.loadUser();
    if (!Store.words.length) { root.innerHTML = '<div class="empty">词库加载中…</div>'; return; }
    const openId = (seg && seg[0] === 'item' && seg[1]) ? +seg[1] : null;

    const list = chapters();
    const all = list.map(c => ({ c, st: stats(c.id) }));
    const finished = all.filter(x => x.st.finished);
    const working = all.filter(x => !x.st.finished);

    root.innerHTML = `
      <h1>手工柜</h1>
      <p class="muted" style="margin-bottom:14px">每个单元是一件手作。背会一个词就是${working[0] ? working[0].c.craft.verb : '织'}上一${working[0] ? working[0].c.craft.unit : '针'}，背错一次留一个线头。整个单元学完，成品就进柜子。</p>

      <div class="kpis">
        <div class="kpi"><div class="n">${finished.length}</div><div class="l">柜里成品</div></div>
        <div class="kpi"><div class="n">${all.reduce((s, x) => s + x.st.done, 0)}</div><div class="l">已完成的针脚</div></div>
        <div class="kpi"><div class="n">${all.reduce((s, x) => s + x.st.wrongTotal, 0)}</div><div class="l">累计线头</div></div>
        <div class="kpi"><div class="n">${all.length ? Math.round(all.reduce((s, x) => s + x.st.pct, 0) / all.length) : 0}%</div><div class="l">总体完成</div></div>
      </div>

      <div class="section-h"><h3>工作台 · 正在做的</h3><span class="pill amber">共 ${working.length} 件</span></div>
      ${working.length ? `<div class="craft-grid">
        ${working.map(({ c, st }) => `<div class="craft-card" onclick="location.hash='#/craft/item/${c.id}'">
          <div class="ct">${c.craft.emoji} ${esc(c.craft.name)}</div>
          <div class="cs">第 ${c.id} 单元 · ${esc(c.title)} · ${st.done}/${st.total} ${c.craft.unit}</div>
          <div class="craft-stage">${art(c.id, c.id - 1)}</div>
          <div class="progress" style="margin:10px 0 4px"><i style="width:${st.pct}%"></i></div>
          <div class="row between tiny"><span class="dim">${st.pct}%</span><span class="${st.wrongTotal ? 'pill red' : 'dim'}">${st.wrongTotal ? st.wrongTotal + ' 个线头' : '没有线头'}</span></div>
        </div>`).join('')}
      </div>` : '<div class="empty">全部完成，柜子满了 🎉</div>'}

      <div class="section-h"><h3>柜子 · 成品</h3><span class="tiny dim">点开看看走了多少针、错了几针</span></div>
      <div class="shelf">
        ${list.map(c => {
          const st = stats(c.id);
          return `<div class="shelf-slot ${st.finished ? '' : 'locked'}" ${st.finished ? `onclick="Craft.openItem(${c.id})"` : ''}>
            <div style="width:100%;max-width:120px;opacity:${st.finished ? 1 : .45}">${art(c.id, c.id - 1, { limit: 60 })}</div>
            <div class="tiny" style="font-weight:600">${esc(c.craft.name)}</div>
            ${st.finished
              ? `<span class="done-tag">${st.wrongTotal ? st.wrongTotal + ' 个线头' : '完美针脚'}</span>`
              : `<span class="tiny dim">还差 ${st.total - st.done} ${c.craft.unit}</span>`}
          </div>`;
        }).join('') || '<div class="empty">还没有单元数据</div>'}
      </div>

      <div class="card" style="margin-top:16px">
        <h3>怎么才能织得快</h3>
        <p class="muted tiny" style="margin:0 0 6px">线头（红线圈）来自答错的词，反复错会越缠越乱。清线头的办法只有一个：去听写或闯关里把这些词再拼对一次。</p>
        <div class="row wrap">
          <button class="btn primary sm" onclick="location.hash='#/dictation'">去听写清线头</button>
          <button class="btn sm" onclick="location.hash='#/game'">拼词闯关</button>
        </div>
      </div>`;
    window.scrollTo(0, 0);
    if (openId) openItem(openId);
  }

  /** 单件详情：所有针脚 + 每个词错了几次 */
  function openItem(chId) {
    const list = chapters();
    const c = list.find(x => x.id === chId) || { id: chId, title: '第 ' + chId + ' 单元', craft: craftOf(chId, 0) };
    const st = stats(chId);
    const wrongList = st.threads.filter(t => t.wrong > 0).sort((a, b) => b.wrong - a.wrong);
    UI.openModal(`
      <h2>${c.craft.emoji} ${esc(c.craft.name)}</h2>
      <p class="muted tiny">第 ${c.id} 单元 · ${esc(c.title)}</p>
      <div class="craft-stage" style="margin:10px 0">${art(chId, chId - 1, { limit: 240 })}</div>
      <div class="row between tiny" style="margin-bottom:6px">
        <span>共 ${st.total} ${c.craft.unit}，已完成 ${st.done}</span>
        <span class="${st.wrongTotal ? 'pill red' : 'pill green'}">${st.wrongTotal ? st.wrongTotal + ' 个线头' : '没有线头'}</span>
      </div>
      <div class="sep"></div>
      <div class="label" style="margin-top:0">线头清单 · 错得越多排越前</div>
      ${wrongList.length ? wrongList.slice(0, 40).map(t => `
        <div class="thread-row" onclick="location.hash='#/vocab/w/${t.w.id}'">
          <span class="tw">${esc(t.w.w)}</span>
          <span class="tn">错 ${t.wrong} 针</span>
          <span class="spacer"></span>
          <button class="btn sm soft" onclick="event.stopPropagation();Audio2.play('audio/${t.w.id}.mp3','${jss(t.w.w)}')">🔊</button>
        </div>`).join('')
        : '<p class="muted tiny" style="margin:0">这一件干干净净，一个线头都没有。去下一件吧。</p>'}
      ${wrongList.length ? `<div class="row" style="margin-top:12px">
        <button class="btn primary" onclick="location.hash='#/dictation'">听写清线头</button>
        <button class="btn" onclick="location.hash='#/craft'">回柜子</button></div>` : ''}
    `, { wide: true });
  }

  /** 首页用的小卡 */
  function mini() {
    const list = chapters();
    if (!list.length || !Store.words.length) return null;
    const working = list.map(c => ({ c, st: stats(c.id) })).filter(x => !x.st.finished);
    const pick = (working.length ? working : list.map(c => ({ c, st: stats(c.id) })))[0];
    return { ...pick, art: art(pick.c.id, pick.c.id - 1, { limit: 96 }) };
  }

  return { render, openItem, mini, art, stats, chapters, craftOf };
})();
