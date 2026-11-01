/* 拼词闯关：把单元拆成关卡，逐关拼写；过关会推进手工进度 */
const Game = (() => {
  const KEY = 'wb_game_v1';
  const PER = 8;            // 每关词数
  const HEARTS = 3;
  let st = null;            // 当前关卡状态

  function loadStars() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveStars(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) { /* 隐私模式忽略 */ }
  }
  const keyOf = (ch, i) => ch + '-' + i;

  function levels(chId) {
    const words = Store.words.filter(w => w.ch === chId);
    const out = [];
    for (let i = 0; i < words.length; i += PER) out.push(words.slice(i, i + PER));
    return out;
  }

  function starOf(ch, i) { return loadStars()[keyOf(ch, i)] || 0; }
  function unlocked(ch, i) { return i === 0 || starOf(ch, i - 1) > 0; }

  function totalStars() {
    return Object.values(loadStars()).reduce((s, x) => s + (x || 0), 0);
  }

  /* ---------- 关卡地图 ---------- */
  async function render(root, seg) {
    await Store.loadWords();
    if (Cloud.user && !Store.state.ready) await Store.loadUser();
    if (!Store.words.length) { root.innerHTML = '<div class="empty">词库加载中…</div>'; return; }
    if (seg && seg[0] === 'play' && seg[1] != null && seg[2] != null) return play(root, +seg[1], +seg[2]);

    const chs = Craft.chapters();
    const active = +(localStorage.getItem('wb_game_ch') || chs[0].id);
    const c = chs.find(x => x.id === active) || chs[0];
    const lvs = levels(c.id);
    const doneCount = lvs.filter((_, i) => starOf(c.id, i) > 0).length;

    root.innerHTML = `
      <h1>拼词闯关</h1>
      <p class="muted" style="margin-bottom:14px">听音拼词，三颗心，全对拿三星。每过一关，你的手作就往前走一截。</p>

      <div class="kpis">
        <div class="kpi"><div class="n">${totalStars()}</div><div class="l">总星星</div></div>
        <div class="kpi"><div class="n">${doneCount}/${lvs.length}</div><div class="l">本单元通关</div></div>
        <div class="kpi"><div class="n">${PER}</div><div class="l">每关词数</div></div>
        <div class="kpi"><div class="n">${HEARTS}</div><div class="l">每关生命</div></div>
      </div>

      <div class="card">
        <div class="card-title"><h3>${esc(c.craft.emoji)} ${esc(c.craft.name)} · 第 ${c.id} 单元</h3>
          <span class="pill amber">${esc(c.title)}</span></div>
        <div class="chips" style="margin-bottom:10px">
          ${chs.map(x => `<span class="chip ${x.id === c.id ? 'on' : ''}" onclick="Game.pickChapter(${x.id})">第${x.id}单元 ${esc(x.craft.name)}</span>`).join('')}
        </div>
        <div class="level-grid">
          ${lvs.map((words, i) => {
            const s = starOf(c.id, i);
            const lock = !unlocked(c.id, i);
            return `<div class="level-node ${lock ? 'locked' : ''} ${s ? 'done' : ''}"
              onclick="${lock ? `UI.toast('先过上一关才能解锁')` : `Game.start(${c.id},${i})`}">
              <div class="lv">${i + 1}</div>
              <div class="stars">${s ? '★'.repeat(s) + '☆'.repeat(3 - s) : '☆☆☆'}</div>
              <div class="pct">${words.length} 词</div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div class="card">
        <h3>规则</h3>
        <div class="grid g2 tiny muted">
          <div>· 听发音 + 看中文，拼出单词</div>
          <div>· 拼错扣一颗心，错 3 次本关重来</div>
          <div>· 全对 3 星，错 1–2 次 2 星，其余 1 星</div>
          <div>· 拼对的词会记进复习队列和手作进度</div>
        </div>
      </div>`;
    window.scrollTo(0, 0);
  }

  function pickChapter(id) {
    try { localStorage.setItem('wb_game_ch', String(id)); } catch (e) {}
    render($('#view'), []);
  }

  function start(ch, lv) {
    const lvs = levels(ch);
    const words = lvs[lv] || [];
    if (!words.length) return UI.toast('这一关还没有词');
    st = { ch, lv, words: shuffle(words), idx: 0, hearts: HEARTS, wrong: [], typed: '', done: false };
    location.hash = `#/game/play/${ch}/${lv}`;
    play($('#view'), ch, lv);
  }

  /* ---------- 逐字符比对 ---------- */
  function diff(typed, target) {
    const a = typed.toLowerCase().split(''), b = target.toLowerCase().split('');
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    const seq = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) { seq.unshift(['ok', b[j - 1]]); i--; j--; }
      else if (dp[i - 1][j] >= dp[i][j - 1]) { seq.unshift(['extra', a[i - 1]]); i--; }
      else { seq.unshift(['miss', b[j - 1]]); j--; }
    }
    while (j > 0) { seq.unshift(['miss', b[j - 1]]); j--; }
    while (i > 0) { seq.unshift(['extra', a[i - 1]]); i--; }
    return seq.map(([k, ch]) => k === 'ok' ? `<span class="ok">${esc(ch)}</span>`
      : k === 'miss' ? `<span class="miss">${esc(ch)}</span>`
        : `<span class="extra">${esc(ch)}</span>`).join('');
  }

  /* ---------- 游戏界面 ---------- */
  function play(root, ch, lv) {
    if (!st || st.ch !== ch || st.lv !== lv) {
      const words = levels(ch)[lv] || [];
      if (!words.length) { root.innerHTML = '<div class="empty">关卡不存在<br><a href="#/game">回到闯关</a></div>'; return; }
      st = { ch, lv, words: shuffle(words), idx: 0, hearts: HEARTS, wrong: [], typed: '', done: false };
    }
    const s = st;

    if (s.idx >= s.words.length) return finish(root);
    if (s.hearts <= 0) return failed(root);

    const w = s.words[s.idx];
    const slots = w.w.split('').map((c2, i) => {
      const t = (s.typed || '')[i] || '';
      return `<i class="${t ? 'hit' : ''}">${c2 === ' ' ? '&nbsp;' : esc(t)}</i>`;
    }).join('');

    root.innerHTML = `
      <div class="study-wrap">
        <div class="row between" style="margin-bottom:8px">
          <a class="back" href="#/game">← 退出关卡</a>
          <span class="hearts">${Array.from({ length: HEARTS }, (_, i) => `<span class="${i < s.hearts ? '' : 'off'}">❤</span>`).join('')}</span>
        </div>
        <div class="progress"><i style="width:${s.idx / s.words.length * 100}%"></i></div>
        <div class="row between tiny dim" style="margin-bottom:8px">
          <span>第 ${ch} 单元 · 第 ${lv + 1} 关</span><span>${s.idx + 1} / ${s.words.length}</span>
        </div>

        <div class="card center">
          <div class="tiny dim">听发音，拼出这个词</div>
          <button class="btn primary" id="g-play" style="margin:10px 0">🔊 再听一次</button>
          <div style="font-size:17px;font-weight:600;margin-top:2px">${esc((w.m || []).map(x => x.pos + ' ' + x.cn).join('；'))}</div>
          <div class="word-slot">${slots}</div>
          <input id="g-input" class="mono" value="${esc(s.typed || '')}" placeholder="在这里拼写" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
            style="text-align:center;font-size:19px;letter-spacing:2px">
          <div class="row" style="margin-top:10px">
            <button class="btn soft" onclick="Game.skip()">跳过</button>
            <button class="btn primary" style="flex:1" onclick="Game.submit()">提交</button>
          </div>
        </div>
        <div id="g-fb"></div>
      </div>`;

    const input = $('#g-input');
    if (input) {
      input.addEventListener('input', () => {
        st.typed = input.value;
        const box = $('.word-slot');
        if (box) {
          const w2 = st.words[st.idx];
          box.innerHTML = w2.w.split('').map((c2, i) => {
            const t = (st.typed || '')[i] || '';
            return `<i class="${t ? 'hit' : ''}">${c2 === ' ' ? '&nbsp;' : esc(t)}</i>`;
          }).join('');
        }
      });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') Game.submit(); });
      input.focus();
    }
    const playBtn = $('#g-play');
    if (playBtn) playBtn.onclick = () => Audio2.play(`audio/${w.id}.mp3`, w.w);
    setTimeout(() => { if (playBtn) playBtn.click(); }, 220);
  }

  async function submit() {
    const s = st;
    if (!s) return;
    const w = s.words[s.idx];
    const typed = ($('#g-input').value || '').trim();
    if (!typed) { UI.toast('先拼一下再提交'); return; }
    const ok = typed.toLowerCase() === w.w.toLowerCase();
    if (ok) {
      await Store.grade(w.id, 2, 'game');
      s.idx++;
      s.typed = '';
      play($('#view'), s.ch, s.lv);
      UI.toast('✓ 拼对，一针织好了');
    } else {
      s.hearts--;
      s.wrong.push(w);
      await Store.grade(w.id, 0, 'game');
      const box = $('#g-fb');
      if (box) {
        box.innerHTML = `
          <div class="feedback no" style="margin-top:12px">
            <div class="row between"><b>✗ 不对，是 ${esc(w.w)}</b><span class="tiny">剩 ${s.hearts} 心</span></div>
            <div class="char-diff" style="margin-top:6px">${diff(typed, w.w)}</div>
            <div class="tiny" style="margin-top:6px;opacity:.8">${esc(w.root && w.root.logic ? w.root.logic : (w.mem || ''))}</div>
          </div>
          <button class="btn primary block" style="margin-top:10px" onclick="Game.next()">继续 →</button>`;
      }
      const input = $('#g-input');
      if (input) input.disabled = true;
    }
  }

  function next() {
    const s = st;
    s.idx++;
    s.typed = '';
    if (s.hearts <= 0) return failed($('#view'));
    play($('#view'), s.ch, s.lv);
  }

  function skip() {
    const s = st;
    s.hearts = Math.max(0, s.hearts - 1);
    s.idx++;
    s.typed = '';
    if (s.hearts <= 0) return failed($('#view'));
    play($('#view'), s.ch, s.lv);
  }

  function finish(root) {
    const s = st;
    const stars = s.wrong.length === 0 ? 3 : s.wrong.length <= 2 ? 2 : 1;
    const all = loadStars();
    const k = keyOf(s.ch, s.lv);
    if ((all[k] || 0) < stars) { all[k] = stars; saveStars(all); }
    const craftName = Craft.craftOf(s.ch, s.ch - 1).name;

    root.innerHTML = `
      <div class="study-wrap"><div class="card center" style="padding:34px 20px">
        <div style="font-size:34px;letter-spacing:4px;color:#e0a41c">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
        <h2 style="margin-top:8px">第 ${s.lv + 1} 关通过</h2>
        <p class="muted">${s.words.length} 个词，错 ${s.wrong.length} 次${s.wrong.length ? ' · 这些词已记进复习' : ' · 全对'}</p>
        ${s.wrong.length ? `<div class="chips" style="justify-content:center;margin:8px 0">${s.wrong.map(w => `<span class="pill red">${esc(w.w)}</span>`).join('')}</div>` : ''}
        <p class="tiny dim" style="margin-top:6px">每拼对一个词，你的「${esc(craftName)}」就多一${Craft.craftOf(s.ch, s.ch - 1).unit}。</p>
        <div class="row" style="justify-content:center;margin-top:12px">
          <button class="btn primary" onclick="Game.start(${s.ch},${s.lv + 1})">下一关 →</button>
          <button class="btn" onclick="location.hash='#/craft'">看看手作</button>
          <button class="btn soft" onclick="Game.start(${s.ch},${s.lv})">再来一次</button>
        </div>
      </div></div>`;
    st = null;
  }

  function failed(root) {
    const s = st;
    root.innerHTML = `
      <div class="study-wrap"><div class="card center" style="padding:34px 20px">
        <div style="font-size:34px">💔</div>
        <h2>心用完了</h2>
        <p class="muted">这一关的 ${s.words.length} 个词里，错的已经记进复习队列，晚点会再遇到。</p>
        <div class="row" style="justify-content:center;margin-top:12px">
          <button class="btn primary" onclick="Game.start(${s.ch},${s.lv})">重来一次</button>
          <button class="btn" onclick="location.hash='#/game'">先回关卡</button>
        </div>
      </div></div>`;
    st = null;
  }

  return { render, start, pickChapter, submit, next, skip, totalStars, levels, starOf };
})();
