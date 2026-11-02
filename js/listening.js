/* 听力模块：精听八步 / 泛听连播 / 错因诊断 */
const Listening = (() => {
  let DATA = null;      // listening.json
  let DEEP = null;      // listening_deep.json
  let cur = null;       // 当前材料 { id, title, section, genre, sentences, questions, extensive? }
  let step = 'intro';   // intro | blind | sentence | finish
  let sIdx = 0;
  let stats = null;
  let stopQueue = null;

  async function ensure() {
    if (DATA) return;
    DATA = await fetch('data/listening.json').then(r => r.json());
    DEEP = await fetch('data/listening_deep.json').then(r => r.json()).catch(() => ({ analyses: {}, extensive: [], error_tags: [] }));
  }

  function allMaterials() {
    const base = DATA.drills.map(d => ({ ...d, extensive: false }));
    const ext = (DEEP.extensive || []).map(d => ({ ...d, extensive: true }));
    return base.concat(ext);
  }

  function audioOf(drillId, i) {
    return audUk(`${drillId}_s${String(i + 1).padStart(2, '0')}`);
  }

  /* ================= 首页 ================= */
  async function render(root) {
    await ensure();
    const mats = allMaterials();
    const s = Store.stats();
    let recent = Store.eventsOf('listening', 5);
    const avgAcc = recent.length ? Math.round(recent.reduce((a, b) => a + (b.accuracy || 0), 0) / recent.length) : null;

    root.innerHTML = `
      <h1>听力</h1>
      <p class="muted" style="margin-bottom:14px">精听负责"听清"，泛听负责"听懂"。先精后泛，耳朵才会真的进步。</p>

      <div class="kpis">
        <div class="kpi"><div class="n">${mats.length}</div><div class="l">可用材料</div></div>
        <div class="kpi"><div class="n">${recent.length ? avgAcc + '%' : '—'}</div><div class="l">近期听写正确率</div></div>
        <div class="kpi"><div class="n">${recent.length}</div><div class="l">已完成练习</div></div>
        <div class="kpi"><div class="n">${s.due}</div><div class="l">待复习词</div></div>
      </div>

      <div class="card">
        <div class="card-title"><h3>精听材料</h3><span class="pill blue">逐句听写 + 句法语音解析</span></div>
        ${mats.filter(m => !m.extensive).map(m => `
          <div class="wlist-item" onclick="Listening.open('${m.id}')">
            <div class="wl-main">
              <div><span class="wl-w">${esc(m.title)}</span>
                <span class="pill ${m.section.includes('4') ? 'purple' : 'blue'}" style="margin-left:6px">${esc(m.section)}</span></div>
              <div class="wl-cn">${m.sentences.length} 句 · ${esc(m.genre)} · 约 ${Math.ceil(m.sentences.length * 0.6)} 分钟</div>
            </div>
            <span class="btn sm ghost">精听</span>
          </div>`).join('')}
      </div>

      <div class="card">
        <div class="card-title"><h3>泛听材料</h3><span class="pill purple">连播 + 理解题</span></div>
        ${mats.filter(m => m.extensive).map(m => `
          <div class="wlist-item" onclick="Listening.openExt('${m.id}')">
            <div class="wl-main">
              <div><span class="wl-w">${esc(m.title)}</span>
                <span class="pill" style="margin-left:6px">${esc(m.level || '')}</span></div>
              <div class="wl-cn">${m.sentences.length} 句 · ${esc(m.section)} · ${esc(m.topic || '')}</div>
            </div>
            <span class="btn sm soft">泛听</span>
          </div>`).join('') || '<p class="muted tiny">暂无</p>'}
      </div>

      ${recent.length ? `<div class="card">
        <div class="card-title"><h3>最近的练习诊断</h3><a class="link-btn" href="#/records">全部记录 →</a></div>
        ${recent.map(r => `<div class="task-item">
          <span class="pill ${r.accuracy >= 85 ? 'green' : r.accuracy >= 60 ? 'amber' : 'red'}">${r.accuracy}%</span>
          <div class="task-main">
            <div class="t">${esc((mats.find(m => m.id === r.drill_id) || {}).title || r.drill_id)}</div>
            <div class="s">漏听 ${r.missed_words} · 拼错 ${r.spelling_errors} · ${Math.round((r.seconds || 0) / 60)} 分钟
              ${r.error_tags ? ' · ' + esc((JSON.parse(r.error_tags) || []).map(k => tagLabel(k)).join('、')) : ''}</div>
          </div>
        </div>`).join('')}
      </div>` : ''}

      <div class="card">
        <h3>精听怎么做才有效</h3>
        <p class="muted tiny" style="margin:0">
          ① 不看文本盲听一遍，抓大意 → ② 逐句听，先听 1-2 遍再动笔写 → ③ 提交后看逐字符差异，分清是"没听到"还是"拼错了"
          → ④ 对照解析看这句的语法骨架和连读弱读 → ⑤ 生词点开直接入词库 → ⑥ 结束后勾选这次的错因，系统会累积成你的薄弱画像。
        </p>
      </div>`;
  }

  function tagLabel(k) {
    const t = (DEEP.error_tags || []).find(x => x.key === k);
    return t ? t.label : k;
  }

  /* ================= 精听 ================= */
  async function open(id) {
    await ensure();
    cur = allMaterials().find(m => m.id === id);
    if (!cur) return;
    step = 'intro';
    sIdx = 0;
    stats = { replays: 0, played: false, missed: 0, spelling: 0, checked: 0, started: Date.now(), diffs: [] };
    location.hash = '#/listening/practice';
    renderPractice($('#view'));
  }

  function renderPractice(root) {
    if (!cur) { root.innerHTML = '<div class="empty">请选择材料<br><a href="#/listening">返回列表</a></div>'; return; }
    if (step === 'intro') return renderIntro(root);
    if (step === 'blind') return renderBlind(root);
    if (step === 'sentence') return renderSentence(root);
    return renderFinish(root);
  }

  function renderIntro(root) {
    root.innerHTML = `
      <a class="back" href="#/listening">← 返回</a>
      <h1>${esc(cur.title)}</h1>
      <p class="muted" style="margin-bottom:6px">${esc(cur.section)} · ${esc(cur.genre)} · ${cur.sentences.length} 句</p>
      <p style="margin:0 0 10px">${Src.pill('listening')}</p>
      <div class="card">
        <h3>本次训练流程</h3>
        <div class="grid g2 tiny muted" style="margin-top:8px">
          <div>① 盲听整段（不看文本）</div><div>② 逐句听写，系统逐字符比对</div>
          <div>③ 对照原文找差距</div><div>④ 看句法 / 连读解析</div>
          <div>⑤ 生词点开加入词库</div><div>⑥ 勾选错因，生成本次诊断</div>
        </div>
      </div>
      <div class="row">
        <button class="btn primary lg" onclick="Listening.begin()">开始盲听 →</button>
        <button class="btn" onclick="Listening.jumpSentence()">跳过盲听，直接逐句</button>
      </div>`;
  }

  function begin() { step = 'blind'; renderPractice($('#view')); }

  function renderBlind(root) {
    root.innerHTML = `
      <a class="back" href="#/listening">← 退出</a>
      <div class="card center" style="padding:34px 18px">
        <div class="wave" style="justify-content:center;margin:0 auto 18px"><i></i><i></i><i></i><i></i><i></i></div>
        <h2>盲听整段</h2>
        <p class="muted tiny">不看文本，只抓大意：谁在说、说什么、有没有数字或转折。</p>
        <button class="btn primary lg" id="blind-play" style="margin-top:10px">▶ 播放整段</button>
        <button class="btn" style="margin-top:10px" onclick="Listening.stopAll()">■ 停止</button>
        <div style="margin-top:18px">
          <button class="btn line" onclick="Listening.jumpSentence()">听完了 / 听不懂，进入逐句 →</button>
        </div>
      </div>`;
    $('#blind-play').onclick = () => {
      stats.played = true;
      stopQueue = Audio2.playQueue(cur.sentences.map((s, i) => ({ src: audioOf(cur.id, i) })));
    };
  }

  function stopAll() { Audio2.stop(); if (stopQueue) stopQueue(); }

  function jumpSentence() { step = 'sentence'; sIdx = 0; renderPractice($('#view')); }

  function deepFor(i) {
    const arr = (DEEP.analyses || {})[cur.id] || [];
    return arr.find(a => a.i === i + 1) || null;
  }

  function renderSentence(root) {
    const s = cur.sentences[sIdx];
    const d = deepFor(sIdx);
    const isExt = cur.extensive;
    root.innerHTML = `
      <div class="row between" style="margin-bottom:6px">
        <a class="back" href="#/listening">← 退出</a>
        <span class="tiny dim">第 ${sIdx + 1} / ${cur.sentences.length} 句</span>
      </div>
      <div class="progress"><i style="width:${(sIdx + 1) / cur.sentences.length * 100}%"></i></div>

      <div class="card player">
        <div class="row wrap">
          <button class="btn primary sm" onclick="Listening.playCur()">▶ 播放本句</button>
          <button class="btn sm" onclick="Listening.prev()">◀ 上一句</button>
          <button class="btn sm" onclick="Listening.next()">下一句 ▶</button>
          <select style="width:auto;padding:7px 9px;font-size:13px" onchange="Audio2.setRate(+this.value)">
            <option value="0.7">0.7x</option><option value="0.85">0.85x</option>
            <option value="1" selected>1.0x</option><option value="1.2">1.2x</option>
          </select>
          <label class="tiny muted row" style="gap:5px"><input type="checkbox" id="loop" style="width:auto">循环</label>
        </div>
      </div>

      <div class="card">
        <div class="label" style="margin-top:0">听写这一句（听 1-2 遍再动笔）</div>
        <textarea id="dict" rows="2" placeholder="在下面写下你听到的内容…" spellcheck="false" style="font-size:15px"></textarea>
        <div class="row" style="margin-top:10px">
          <button class="btn primary" onclick="Listening.check()">提交比对</button>
          <button class="btn soft" onclick="Listening.reveal()">直接看原文</button>
          <div class="spacer"></div>
          <button class="btn soft" onclick="Listening.next()">跳过 →</button>
        </div>
        <div id="fb"></div>
      </div>

      <div class="card">
        <div class="card-title"><h3>逐句解析</h3><span class="pill ${d ? 'purple' : ''}">${d ? '已生成' : '基础版'}</span></div>
        <div class="sent-row-detail">
          <p class="ex-en"><span class="spk" style="color:var(--purple);font-weight:600;margin-right:6px">${esc(s.speaker || '')}</span>${clickableWords(s.en)}</p>
          <p class="ex-zh">${esc(s.zh)}</p>
          ${d ? `
            <div class="label">语法骨架</div><div class="tiny" style="color:var(--ink-2)">${esc(d.grammar)}</div>
            <div class="label">重点词</div>
            <div class="chips">${(d.key || []).map(k => `<span class="chip-word" onclick="Listening.lookup('${esc(k.w)}')"><b>${esc(k.w)}</b> <span class="dim tiny">${esc(k.cn)}</span></span>`).join('')}</div>
            <div class="label">语音现象</div><div class="tiny" style="color:var(--ink-2)">${esc(d.phonetic_note)}</div>
            <div class="label">在语篇中的作用</div><div class="tiny" style="color:var(--ink-2)">${esc(d.role)}</div>
          ` : `<p class="muted tiny">该句解析补充中。</p>`}
        </div>
      </div>

      <div class="card">
        <div class="card-title"><h3>全篇句子</h3><span class="tiny dim">点击句子跳转并播放${isExt ? '' : ''}</span></div>
        ${cur.sentences.map((x, i) => `
          <div class="sent ${i === sIdx ? 'on' : ''}" onclick="Listening.jump(${i})">
            <span class="n">${i + 1}</span>
            <div class="body"><div class="en"><span class="spk">${esc(x.speaker || '')}</span>${esc(x.en)}</div>
              <div class="zh">${esc(x.zh)}</div></div>
          </div>`).join('')}
      </div>`;
    setTimeout(() => Listening.playCur(), 200);
  }

  function clickableWords(text) {
    return esc(text).replace(/[A-Za-z][A-Za-z'-]*/g, m => `<span class="w" onclick="Listening.lookup('${esc(m)}')">${m}</span>`);
  }

  function playCur() {
    stats.replays++;
    Audio2.play(audioOf(cur.id, sIdx), cur.sentences[sIdx].en);
    const loop = $('#loop');
    if (loop && loop.checked) setTimeout(() => { if ($('#loop') && $('#loop').checked) playCur(); }, 1600);
  }

  function prev() { if (sIdx > 0) { sIdx--; renderPractice($('#view')); } }
  function next() {
    if (sIdx < cur.sentences.length - 1) { sIdx++; renderPractice($('#view')); }
    else { step = 'finish'; renderPractice($('#view')); }
  }
  function jump(i) { sIdx = i; renderPractice($('#view')); }

  function norm(t) {
    return String(t).toLowerCase()
      .replace(/[’‘]/g, "'").replace(/[“”"]/g, '')
      .replace(/\bi'm\b/g, 'i am').replace(/\bit's\b/g, 'it is').replace(/\bdon't\b/g, 'do not')
      .replace(/\bcan't\b/g, 'cannot').replace(/\bwon't\b/g, 'will not').replace(/\bdoesn't\b/g, 'does not')
      .replace(/\bi've\b/g, 'i have').replace(/\bthat's\b/g, 'that is').replace(/\bthere's\b/g, 'there is')
      .replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function wordDiff(input, target) {
    const a = norm(input).split(' ').filter(Boolean);
    const b = norm(target).split(' ').filter(Boolean);
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
    const miss = seq.filter(x => x[0] === 'miss').length;
    const extra = seq.filter(x => x[0] === 'extra').length;
    const html = seq.map(([k, w]) => k === 'ok' ? `<span class="diff-ok">${esc(w)}</span>` : `<span class="diff-bad">${esc(w)}</span>`).join(' ');
    const acc = Math.max(0, Math.round((b.length - miss) / Math.max(1, b.length) * 100));
    return { html, miss, extra, acc, total: b.length };
  }

  function check() {
    const s = cur.sentences[sIdx];
    const typed = $('#dict').value.trim();
    if (!typed) return UI.toast('先听一听，写下来再比对');
    const d = wordDiff(typed, s.en);
    stats.checked++;
    stats.missed += d.miss;
    stats.spelling += d.extra;
    stats.diffs.push(d.acc);
    Audio2.play(audioOf(cur.id, sIdx), s.en);
    $('#fb').innerHTML = `
      <div class="feedback ${d.acc >= 90 ? 'ok' : d.acc >= 60 ? 'info' : 'no'}">
        <div class="row between"><b>${d.acc >= 90 ? '几乎全对' : d.acc >= 60 ? '抓住大部分了' : '还差一些，再听一遍'}</b>
          <span class="tiny">相似度 ${d.acc}% · 漏听 ${d.miss} 词</span></div>
        <div style="margin-top:6px;line-height:1.9">${d.html}</div>
        <div class="tiny" style="margin-top:6px;color:var(--ink-2)">红色波浪线是原文里你没听到或写错的词。</div>
      </div>`;
  }

  function reveal() {
    const s = cur.sentences[sIdx];
    $('#dict').value = s.en;
    $('#fb').innerHTML = `<div class="feedback info"><b>原文：</b>${esc(s.en)}<div class="tiny" style="margin-top:4px">${esc(s.zh)}</div></div>`;
  }

  async function lookup(word) {
    await Store.loadWords();
    const key = String(word).toLowerCase().replace(/['’]s$/, '').replace(/[^a-z-]/g, '');
    const hit = Store.words.find(w => w.w.toLowerCase() === key)
      || Store.words.find(w => w.w.toLowerCase().replace(/[^a-z]/g, '') === key.replace(/[^a-z]/g, ''));
    if (hit) { location.hash = '#/vocab/w/' + hit.id; return; }
    UI.openModal(`<div class="word-hero center">
      <h2 style="margin:0">${esc(word)}</h2>
      <p class="muted tiny">词库暂未收录</p>
      <button class="btn" onclick="Audio2.speakFallback('${esc(word)}')">🔊 播放发音</button>
      <p class="muted tiny" style="margin-top:10px">可以把这个词记在笔记里：听力原文中的生词往往是你的听力瓶颈词。</p>
    </div>`);
  }

  /* ================= 结束与诊断 ================= */
  function renderFinish(root) {
    const s = stats;
    const avg = s.diffs.length ? Math.round(s.diffs.reduce((a, b) => a + b, 0) / s.diffs.length) : 0;
    const mins = Math.max(1, Math.round((Date.now() - s.started) / 60000));
    const guessed = [];
    if (s.missed > 6) guessed.push('linking', 'sound_miss');
    if (s.spelling > 6) guessed.push('spelling');
    if (avg < 50) guessed.push('unknown_word');
    root.innerHTML = `
      <a class="back" href="#/listening">← 返回</a>
      <h1>本次诊断</h1>
      <div class="kpis">
        <div class="kpi"><div class="n">${avg}%</div><div class="l">听写正确率</div></div>
        <div class="kpi"><div class="n">${s.missed}</div><div class="l">漏听单词</div></div>
        <div class="kpi"><div class="n">${s.spelling}</div><div class="l">拼写偏差</div></div>
        <div class="kpi"><div class="n">${mins} 分</div><div class="l">练习时长</div></div>
      </div>
      <div class="card">
        <h3>这次的问题可能出在哪？</h3>
        <p class="muted tiny">系统根据差异自动推断了几个方向，你也可以自己勾选。勾选会累积成薄弱画像，用于后续推荐。</p>
        <div class="chips" id="tags" style="margin:10px 0">
          ${(DEEP.error_tags || []).map(t => `<span class="chip ${guessed.includes(t.key) ? 'on' : ''}" data-k="${t.key}" onclick="this.classList.toggle('on')">${esc(t.label)}</span>`).join('')}
        </div>
        <div id="tag-tip" class="tip tiny">提示：漏听多但单词都认识，多半是连读弱读的问题，不是词汇量。</div>
      </div>
      <div class="row">
        <button class="btn primary" onclick="Listening.saveSession()">保存本次记录</button>
        <button class="btn" onclick="Listening.open('${cur.id}')">再练一遍</button>
        <button class="btn soft" onclick="location.hash='#/vocab/study/review'">去复习生词</button>
      </div>`;
  }

  async function saveSession() {
    const tags = $$('#tags .chip.on').map(c => c.dataset.k);
    const s = stats;
    const avg = s.diffs.length ? Math.round(s.diffs.reduce((a, b) => a + b, 0) / s.diffs.length) : 0;
    const secs = Math.round((Date.now() - s.started) / 1000);
    Store.addEvent('listening', {
      drill_id: cur.id, accuracy: avg, missed_words: s.missed,
      spelling_errors: s.spelling, replays: s.replays,
      seconds: secs, error_tags: tags,
    });
    Store.trackStudy(secs);
    Store.flushStats();
    try { Track.study('listening', { acc: avg, secs }); } catch (e) { /* 忽略 */ }
    UI.toast('记录已保存，可在学习记录查看');
    location.hash = '#/listening';
  }

  /* ================= 泛听 ================= */
  async function openExt(id) {
    await ensure();
    cur = allMaterials().find(m => m.id === id);
    if (!cur) return;
    renderExt($('#view'));
  }

  function renderExt(root) {
    const c = cur;
    root.innerHTML = `
      <a class="back" href="#/listening">← 返回</a>
      <h1>${esc(c.title)}</h1>
      <p class="muted">${esc(c.level || '')} · ${esc(c.section)} · ${esc(c.topic || '')} · ${c.sentences.length} 句</p>
      <div class="card player">
        <div class="row wrap">
          <button class="btn primary" id="ext-play">▶ 连续播放</button>
          <button class="btn" onclick="Listening.stopAll()">■ 停止</button>
          <select style="width:auto;padding:7px 9px;font-size:13px" onchange="Audio2.setRate(+this.value)">
            <option value="0.8">0.8x</option><option value="1" selected>1.0x</option><option value="1.2">1.2x</option>
          </select>
          <span class="tiny dim">建议先盲听 2 遍再看文本</span>
        </div>
      </div>
      <div class="card">
        <div class="card-title"><h3>理解题</h3><span class="pill blue">${c.questions.length} 题</span></div>
        ${c.questions.map((q, qi) => `
          <div class="q-item" data-qi="${qi}">
            <p style="font-weight:500;margin-bottom:8px">${qi + 1}. ${esc(q.question)}</p>
            ${q.options.map(o => `<div class="option" data-v="${esc(o[0])}" onclick="Listening.pickExt(this,${qi})"><span class="k"></span>${esc(o)}</div>`).join('')}
            <div class="fb"></div>
          </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-title"><h3>原文与翻译</h3>
          <button class="btn sm soft" onclick="this.nextElementSibling.classList.toggle('hide')">显示/隐藏</button></div>
        <div class="hide" id="ext-text">
          ${c.sentences.map((x, i) => `<div class="sent" onclick="Audio2.play('${audioOf(c.id, i)}','${jss(x.en)}')">
            <span class="n">${i + 1}</span>
            <div class="body"><div class="en"><span class="spk">${esc(x.speaker || '')}</span>${esc(x.en)}</div>
              <div class="zh">${esc(x.zh)}</div></div>
          </div>`).join('')}
        </div>
      </div>`;
    $('#ext-play').onclick = () => {
      stats = stats || { started: Date.now() };
      stopQueue = Audio2.playQueue(c.sentences.map((s, i) => ({ src: audioOf(c.id, i) })));
    };
  }

  function pickExt(el, qi) {
    const q = cur.questions[qi];
    const box = el.closest('.q-item');
    if (box.dataset.done) return;
    box.dataset.done = '1';
    $$('.option', box).forEach(o => {
      o.onclick = null;
      if (o.dataset.v === q.answer) o.classList.add('right');
      else if (o === el) o.classList.add('wrong');
    });
    $('.fb', box).innerHTML = `<div class="feedback ${q.answer === el.dataset.v ? 'ok' : 'no'}">
      ${q.answer === el.dataset.v ? '✓ 正确' : '✗ 正确答案 ' + esc(q.answer)} · ${esc(q.explanation)}</div>`;
  }

  function dailyPick(i) {
    const mats = allMaterials();
    return mats.length ? mats[i % mats.length] : null;
  }

  function materials() { return allMaterials(); }

  return { render, open, openExt, begin, jumpSentence, playCur, prev, next, jump, check, reveal,
    lookup, saveSession, pickExt, stopAll, ensure, renderPractice, tagLabel, dailyPick, materials };
})();
