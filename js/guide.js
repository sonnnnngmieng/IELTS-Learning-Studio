/* 备考页：必备语法 / 必背词单 / 考试须知 */
const Guide = (() => {
  let cache = null;
  let tab = 'grammar';
  let openTopic = null;

  async function ensure() {
    if (cache) return cache;
    const [g, w, e] = await Promise.all([
      fetch('data/grammar.json').then(r => r.json()).catch(() => ({ topics: [] })),
      fetch('data/essential_words.json').then(r => r.json()).catch(() => ({ groups: [] })),
      fetch('data/exam_guide.json').then(r => r.json()).catch(() => ({ sections: [] })),
    ]);
    cache = { grammar: g.topics || [], words: w.groups || [], exam: e.sections || [] };
    return cache;
  }

  async function render(root, seg) {
    await ensure();
    if (seg && seg[0] === 'grammar' && seg[1]) {
      openTopic = seg[1];
      return renderGrammarDetail(root, seg[1]);
    }
    if (seg && seg[0]) tab = seg[0];
    openTopic = null;
    root.innerHTML = `
      <h1>备考指南</h1>
      <p class="muted" style="margin-bottom:14px">考试怎么考、语法怎么抓、哪些词必须认识——出发前把地图看全。</p>
      <div class="chips" style="margin-bottom:16px">
        <span class="chip ${tab === 'grammar' ? 'on' : ''}" onclick="location.hash='#/guide/grammar'">✎ 必备语法</span>
        <span class="chip ${tab === 'words' ? 'on' : ''}" onclick="location.hash='#/guide/words'">✦ 必背词单</span>
        <span class="chip ${tab === 'exam' ? 'on' : ''}" onclick="location.hash='#/guide/exam'">◷ 考试须知</span>
      </div>
      <div id="guide-body"></div>`;
    const body = $('#guide-body');
    if (tab === 'words') paintWords(body);
    else if (tab === 'exam') paintExam(body);
    else paintGrammar(body);
    window.scrollTo(0, 0);
  }

  /* ---------- 语法 ---------- */
  function paintGrammar(root) {
    root.innerHTML = `
      <div class="grid g2">
        ${cache.grammar.map((t, i) => `
          <div class="card hover" style="cursor:pointer" onclick="location.hash='#/guide/grammar/${t.id}'">
            <div class="row between"><h4 style="margin:0">${t.title}</h4><span class="pill blue">${i + 1}</span></div>
            <p class="muted tiny" style="margin:8px 0 0">${esc(t.why.slice(0, 66))}…</p>
            <div class="tiny" style="margin-top:8px;color:var(--brand)">${t.points.length} 个要点 · ${t.mistakes.length} 个易错 →</div>
          </div>`).join('')}
      </div>
      <div class="card" style="margin-top:14px">
        <p class="muted tiny" style="margin:0">用法建议：每天精读 1 个专题，把「易错句」抄进错题本；写作练习时强制自己用上当天的结构。</p>
      </div>`;
  }

  function renderGrammarDetail(root, id) {
    const t = cache.grammar.find(x => x.id === id);
    if (!t) { openTopic = null; return render(root); }
    root.innerHTML = `
      <h1>${esc(t.title)}</h1>
      <div class="card"><p class="muted" style="margin:0">${esc(t.why)}</p></div>
      <div class="card">
        <h3>核心要点</h3>
        ${t.points.map(p => `
          <div style="padding:12px 0;border-top:1px solid var(--line)">
            <b>${esc(p.t)}</b>
            <p class="tiny muted" style="margin:4px 0 8px">${esc(p.d)}</p>
            <div class="ex-en" style="font-size:14px">${esc(p.ex)}</div>
            <div class="row" style="margin-top:6px">
              <button class="btn sm ghost" onclick="Guide.speak(${jss(p.ex)})">🔊 听例句</button>
            </div>
          </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-title"><h3>易错句</h3><span class="pill red">写作直接扣分点</span></div>
        ${t.mistakes.map(m => `
          <div style="padding:10px 0;border-top:1px solid var(--line)">
            <div class="tiny" style="color:var(--red)">✗ ${esc(m.wrong)}</div>
            <div class="tiny" style="color:var(--green);margin:3px 0">✓ ${esc(m.right)}</div>
            <div class="tiny muted">${esc(m.why)}</div>
          </div>`).join('')}
      </div>
      <div class="row">
        <button class="btn soft" onclick="location.hash='#/guide/grammar'">← 返回语法列表</button>
      </div>`;
    window.scrollTo(0, 0);
  }

  function speak(text) {
    try {
      const clean = String(text).replace(/→.*$/g, '').slice(0, 300);
      Audio2.speakFallback(clean, 'en-GB');
    } catch (e) {}
  }

  /* ---------- 词单 ---------- */
  function paintWords(root) {
    root.innerHTML = cache.words.map(g => `
      <div class="card" style="margin-bottom:14px">
        <div class="card-title"><h3>${esc(g.title)}</h3><span class="pill amber">${g.words.length} 组</span></div>
        <p class="muted tiny">${esc(g.scene)}</p>
        ${g.words.map(w => {
          const wid = String(w.en).split(' ')[0].toLowerCase().replace(/[^a-z-]/g, '');
          return `<div class="wlist-item">
            <div class="wl-main">
              <div><span class="wl-w" style="font-family:var(--hw);font-size:15.5px">${esc(w.en)}</span></div>
              <div class="wl-cn">${esc(w.cn)}${w.tip ? ` · <span class="dim">${esc(w.tip)}</span>` : ''}</div>
            </div>
            <button class="btn sm ghost" title="听发音" onclick="Audio2.play('audio/${wid}.mp3', ${jss(w.en.split('→')[0].trim())}, 'en-GB')">▶</button>
          </div>`;
        }).join('')}
      </div>`).join('') + `
      <div class="card"><p class="muted tiny" style="margin:0">
        这些词单是「必须认识」的保底清单，不是全部——完整 3600+ 词在「词汇」页按单元学习。
      </p></div>`;
  }

  /* ---------- 考试须知 ---------- */
  function paintExam(root) {
    root.innerHTML = cache.exam.map(s => `
      <div class="card" style="margin-bottom:14px">
        <div class="card-title"><h3>${s.icon} ${esc(s.title)}</h3></div>
        ${s.items.map(it => `
          <div style="padding:10px 0;border-top:1px solid var(--line)">
            <b style="font-size:14px">${esc(it.k)}</b>
            <p class="tiny muted" style="margin:4px 0 0;line-height:1.7">${esc(it.v)}</p>
          </div>`).join('')}
      </div>`).join('') + `
      <div class="card">
        <p class="muted tiny" style="margin:0">考试规则以ielts.org 与你报名的考试中心最新公告为准；本页为备考参考整理。</p>
      </div>`;
  }

  return { render, ensure, speak };
})();
