/* 每日击掌：进入网站先"击个掌"，点手掌 = 打卡 + 一句鼓励 + 直接进今天的学习 */
const Hi5 = (() => {
  let mask = null;
  let timer = null;

  function handSVG() {
    const P = 'currentColor';
    const rect = (x, y, w, h, r) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r || 2}" fill="${P}"/>`;
    return `
      <svg class="hi5-svg" viewBox="0 0 140 168" aria-hidden="true" shape-rendering="crispEdges">
        ${rect(34, 18, 18, 48)}
        ${rect(58, 6, 18, 60)}
        ${rect(82, 14, 18, 52)}
        ${rect(106, 28, 16, 40)}
        ${rect(10, 60, 20, 34, 8)}
        ${rect(26, 50, 98, 66, 10)}
        ${rect(34, 108, 82, 20, 8)}
        <g fill="#fff" opacity=".35">
          <rect x="62" y="26" width="6" height="26" rx="2"/>
          <rect x="86" y="34" width="6" height="22" rx="2"/>
        </g>
      </svg>`;
  }

  const SPARKS = ['✦', '✧', '＋', '·', '✦', '✧', '＋', '·', '✦', '✧', '＋', '·'];

  function streakDays() {
    try { return Store.streak(Store.history(60)) || 0; } catch (e) { return 0; }
  }

  function todayWordCount() {
    const t = Store.today || {};
    return t.new_words || 0;
  }

  /** 一句鼓励：先看状态，再给具体动作 */
  function praise() {
    const p = Store.profile || {};
    const tasks = Store.tasks || [];
    const todo = tasks.filter(t => t.status !== 'done');
    const st = (() => { try { return Store.stats(); } catch (e) { return { due: 0 }; } })();
    const left = (() => { try { return Store.examCountdown(); } catch (e) { return null; } })();
    const streak = streakDays();
    const hi5n = (Store.hi5 && Store.hi5.total) || 1;
    const newed = todayWordCount();

    const head = streak >= 2
      ? `连着第 <b>${streak}</b> 天来击掌了，手感正在回来。`
      : hi5n === 1
        ? '第一掌打上了 —— 从今天起，这个页面会记着你每一掌。'
        : `第 <b>${hi5n}</b> 次击掌，慢慢来，来得比完美重要。`;

    let body;
    if (st.due > 0) body = `先清掉 <b>${st.due}</b> 个到期词，比学新词划算得多。`;
    else if (newed > 0 && newed >= (Store.settings.daily_new || 15)) body = '今天的新词已经够了，剩下的时间留给精听和写作。';
    else if (todo.length) body = `今天还有 <b>${todo.length}</b> 件事，先把「${esc(todo[0].title).slice(0, 14)}」做掉。`;
    else if (left != null && left >= 0) body = `距考试 <b>${left}</b> 天，每天 15 分钟也比等到考前一周强。`;
    else body = '今天没有到期复习，正好推进一组新词。';

    const tail = left != null && left >= 0 && left <= 30 ? '最后这段路，稳住就是赢。' : '';
    return { head, body, tail };
  }

  function show(opts) {
    if (mask) return;
    const force = opts && opts.force;
    if (!force && Store.hi5DoneToday()) return;

    const d = new Date();
    const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    mask = document.createElement('div');
    mask.className = 'hi5-mask';
    mask.id = 'hi5-mask';
    mask.innerHTML = `
      <div class="hi5-card" role="dialog" aria-label="每日击掌">
        <div class="hi5-top">
          <span class="hi5-date">${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${wd}</span>
          <button class="hi5-x" onclick="Hi5.close()" aria-label="关闭">✕</button>
        </div>
        <div class="hi5-stage" id="hi5-stage">
          <div class="hi5-title">今天也来了</div>
          <div class="hi5-sub">击个掌，开始今天的学习</div>
          <div class="hi5-hand" id="hi5-hand" onclick="Hi5.slap()" role="button" tabindex="0" aria-label="击掌">
            <span class="hi5-burst" aria-hidden="true">啪！</span>
            ${handSVG()}
          </div>
          <div class="hi5-tap">点一下手掌 ↑</div>
          <button class="hi5-skip" onclick="Hi5.close()">今天先随便看看</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('in'));

    document.addEventListener('keydown', onKey);
    mask.addEventListener('click', e => { if (e.target === mask) close(); });
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  /** 击掌：粒子 + 文案 + 自动进入学习 */
  function slap() {
    const hand = document.getElementById('hi5-hand');
    if (!hand || hand.classList.contains('hit')) return;
    hand.classList.add('hit');

    const box = document.createElement('div');
    box.className = 'hi5-sparks';
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('i');
      s.textContent = SPARKS[i];
      const ang = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
      const dist = 70 + Math.random() * 60;
      s.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(0) + 'px');
      s.style.setProperty('--dy', (Math.sin(ang) * dist).toFixed(0) + 'px');
      s.style.animationDelay = (i % 3) * 40 + 'ms';
      box.appendChild(s);
    }
    hand.appendChild(box);

    const p = Store.markHi5();
    try { Track && Track.study('hi5', { total: p.total }); } catch (e) { /* 忽略 */ }

    setTimeout(() => renderDone(), 620);
  }

  function renderDone() {
    const stage = document.getElementById('hi5-stage');
    if (!stage) return;
    const { head, body, tail } = praise();
    const st = (() => { try { return Store.hi5Stats(); } catch (e) { return { days: 1, total: 1 }; } })();
    stage.innerHTML = `
      <div class="hi5-stamp">已击掌 · 第 ${st.days || 1} 天</div>
      <p class="hi5-praise">${head}</p>
      <p class="hi5-body">${body}${tail ? ' ' + tail : ''}</p>
      <div class="hi5-actions">
        <button class="btn primary" onclick="Hi5.go()">开始今天的学习</button>
        <button class="btn soft" onclick="Hi5.close()">先看看首页</button>
      </div>
      <p class="hi5-auto tiny dim">3 秒后自动进入 <b id="hi5-cd">3</b></p>`;
    let n = 3;
    const cd = setInterval(() => {
      n--;
      const el = document.getElementById('hi5-cd');
      if (el) el.textContent = n;
      if (n <= 0) { clearInterval(cd); go(); }
    }, 1000);
    timer = cd;
  }

  /** 进入今天的学习：有到期复习先复习，否则学新词 */
  function go() {
    close();
    let target = '#/vocab/study/new';
    try {
      if (Store.stats().due > 0) target = '#/vocab/study/review';
      else if (!Store.newWords(1).length) target = '#/vocab';
    } catch (e) { /* 忽略 */ }
    location.hash = target;
  }

  function close() {
    if (timer) { clearInterval(timer); timer = null; }
    document.removeEventListener('keydown', onKey);
    if (!mask) return;
    mask.classList.remove('in');
    const el = mask;
    mask = null;
    setTimeout(() => { if (el && el.parentNode) el.parentNode.removeChild(el); }, 260);
  }

  /* ---------- 首页常驻打卡卡：像素手掌 + 打卡日历 ---------- */
  function calStats() {
    try { return Store.hi5Stats(); }
    catch (e) { return { total: 0, today: 0, days: 0, streak: 0, map: {} }; }
  }

  function lineText(n, streak) {
    let s;
    if (n <= 0) s = '还没击掌 —— 点一下手掌，今天就算开始了。';
    else if (n === 1) s = '啪！今天<b>开张</b>了，剩下的都是赚的。';
    else if (n <= 3) s = `第 <b>${n}</b> 掌，手感在回来的路上。`;
    else s = `第 <b>${n}</b> 掌 —— 差不多收手，把力气留给单词。`;
    if (streak >= 2) s += ` 已经连着 <b>${streak}</b> 天。`;
    return s;
  }

  function cardHTML() {
    const st = calStats();
    return `
      <section class="hi5-panel" id="hi5-panel">
        <div class="hi5-pl">
          <div class="hi5-pl-top">
            <span class="hi5-kicker">DAILY HIGH-FIVE</span>
            <span class="hi5-chip" id="hi5-chip">连续 ${st.streak} 天</span>
          </div>
          <h3 class="hi5-pl-title">今天先击个掌</h3>
          <p class="hi5-pl-sub">点一下手掌，今天就算来过了 —— 可以一直点，每一下都算。</p>
          <button class="hi5-palm" id="hi5-palm" aria-label="击掌打卡，可重复点击">
            <span class="hi5-palm-pow">啪！</span>
            <span class="hi5-palm-sparks" id="hi5-palm-sparks" aria-hidden="true"></span>
            ${handSVG()}
          </button>
          <div class="hi5-figures">
            <div><b id="hi5-n-today">${st.today}</b><span>今日击掌</span></div>
            <div><b id="hi5-n-total">${st.total}</b><span>累计击掌</span></div>
            <div><b id="hi5-n-days">${st.days}</b><span>打卡天数</span></div>
          </div>
          <p class="hi5-line" id="hi5-line">${lineText(st.today, st.streak)}</p>
        </div>

        <div class="hi5-pr">
          <div class="hi5-cal-head">
            <b id="hi5-cal-title"></b>
            <span class="hi5-cal-stat" id="hi5-cal-stat"></span>
          </div>
          <div class="hi5-cal-week">${['一', '二', '三', '四', '五', '六', '日'].map(d => `<i>${d}</i>`).join('')}</div>
          <div class="hi5-cal" id="hi5-cal"></div>
          <div class="hi5-cal-legend">
            <span><i class="on"></i>已击掌</span>
            <span><i></i>未击掌</span>
            <span><i class="td"></i>今天</span>
          </div>
          <div class="hi5-cal-foot">
            <span>连续打卡 <b id="hi5-cal-streak">${st.streak}</b> 天</span>
            <span id="hi5-cal-rate"></span>
          </div>
        </div>
      </section>`;
  }

  function paintCal(root, st) {
    const box = root.querySelector('#hi5-cal');
    if (!box) return;
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const lead = (new Date(y, m, 1).getDay() + 6) % 7;   // 周一为第一列
    const last = new Date(y, m + 1, 0).getDate();
    let html = '', hit = 0;
    for (let i = 0; i < lead; i++) html += '<div class="hi5-cell blank"></div>';
    for (let d = 1; d <= last; d++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const n = Number(st.map[key]) || 0;
      if (n) hit++;
      let cls = 'hi5-cell';
      if (n) cls += ' on';
      if (d === now.getDate()) cls += ' today';
      else if (!n && d > now.getDate()) cls += ' future';
      html += `<div class="${cls}" title="${n ? key + ' · ' + n + ' 次' : key}">${d}</div>`;
    }
    box.innerHTML = html;

    const t = root.querySelector('#hi5-cal-title');
    if (t) t.textContent = `${m + 1} 月 · ${y}`;
    const s = root.querySelector('#hi5-cal-stat');
    if (s) s.textContent = `本月 ${hit} 天`;
    const r = root.querySelector('#hi5-cal-rate');
    if (r) r.textContent = `本月出勤 ${Math.round(hit / now.getDate() * 100)}%`;
  }

  function paintCard(root, flash) {
    if (!root) return;
    const st = calStats();
    const put = (sel, v) => { const el = root.querySelector(sel); if (el) el.textContent = v; };
    put('#hi5-n-today', st.today);
    put('#hi5-n-total', st.total);
    put('#hi5-n-days', st.days);
    put('#hi5-chip', `连续 ${st.streak} 天`);
    put('#hi5-cal-streak', st.streak);
    const line = root.querySelector('#hi5-line');
    if (line) {
      line.innerHTML = lineText(st.today, st.streak);
      if (flash) {
        line.classList.remove('flash');
        void line.offsetWidth;
        line.classList.add('flash');
      }
    }
    paintCal(root, st);
  }

  function burst(btn) {
    const box = btn.querySelector('.hi5-palm-sparks');
    if (!box) return;
    box.innerHTML = '';
    const marks = ['✦', '✧', '＋', '·'];
    for (let i = 0; i < 10; i++) {
      const s = document.createElement('i');
      s.textContent = marks[i % marks.length];
      const ang = (Math.PI * 2 * i) / 10 + Math.random() * 0.5;
      const dist = 54 + Math.random() * 36;
      s.style.setProperty('--dx', Math.round(Math.cos(ang) * dist) + 'px');
      s.style.setProperty('--dy', Math.round(Math.sin(ang) * dist - 14) + 'px');
      s.style.animationDelay = (i % 3) * 30 + 'ms';
      box.appendChild(s);
    }
  }

  /** 卡片里点手掌：可重复，每点一次都记一次 */
  function tap(btn) {
    try { Store.markHi5(); } catch (e) { return; }
    try { Track.study('hi5', { total: calStats().total }); } catch (e) { /* 忽略 */ }

    btn.classList.remove('hit');
    void btn.offsetWidth;
    btn.classList.add('hit');
    setTimeout(() => btn.classList.remove('hit'), 470);
    burst(btn);

    paintCard(btn.closest('.hi5-panel'), true);
  }

  function bind(root) {
    if (!root) return;
    const btn = root.querySelector('#hi5-palm');
    if (btn) btn.addEventListener('click', () => tap(btn));
    paintCard(root, false);
  }

  /** 开场：每天第一次「进首页」时自动出现；直接深链到学习页时不挡人 */
  function maybeShow() {
    try {
      const raw = (typeof location !== 'undefined' && location.hash) || '';
      const h = raw || '#/home';
      if (!/^#\/(home|daily)?$/.test(h)) return;
      if (Store.hi5DoneToday()) return;
    } catch (e) { return; }
    setTimeout(() => show(), 520);
  }

  return {
    maybeShow, show, slap, go, close, praise, force: () => show({ force: true }),
    cardHTML, bind, tap,
  };
})();
