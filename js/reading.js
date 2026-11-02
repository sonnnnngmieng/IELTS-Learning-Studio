/* 阅读模块：精读点词 / 题目 / 长难句 / 同义替换 */
const Reading = (() => {
  let DATA = null;
  let cur = 0;

  async function ensure() {
    if (DATA) return;
    DATA = await fetch('data/reading.json').then(r => r.json());
  }

  async function render(root, sub) {
    await ensure();
    if (sub) return passage(root, +sub);
    root.innerHTML = `
      <h1>阅读</h1>
      <p class="muted" style="margin-bottom:14px">雅思阅读的本质是「定位 + 同义替换」。精读一篇胜过泛读十篇。</p>
      <div class="grid g2">
        <div class="card hover" onclick="Reading.open(0)">
          <h4>学术文章精读</h4>
          <p class="muted tiny" style="margin:0">${DATA.passages.length} 篇 · 点词即查 · 长难句拆解 · 8 题精练</p>
        </div>
        <div class="card hover" onclick="Reading.syn()">
          <h4>同义替换训练</h4>
          <p class="muted tiny" style="margin:0">${DATA.synonym_groups.reduce((n, g) => n + g.pairs.length, 0)} 组高频替换 · 自测</p>
        </div>
      </div>
      ${DATA.passages.map((p, i) => `
        <div class="card">
          <div class="card-title"><h3>${esc(p.title)}</h3><span class="pill">${esc(p.level)}</span></div>
          <p class="muted tiny" style="margin:0">${esc(p.topic)} · ${p.paragraphs.length} 段 · 约 ${p.paragraphs.join(' ').split(/\s+/).length} 词</p>
          <button class="btn sm primary" style="margin-top:10px" onclick="Reading.open(${i})">开始精读</button>
        </div>`).join('')}`;
  }

  function open(i) { location.hash = '#/reading/' + i; }

  async function passage(root, i) {
    cur = i;
    const p = DATA.passages[i];
    root.innerHTML = `
      <a class="back" href="#/reading">← 返回</a>
      <h1>${esc(p.title)}</h1>
      <p class="muted tiny">${esc(p.topic)} · 点击任意单词可查释义与发音</p>
      <div class="card" style="font-family:Georgia,'Times New Roman',serif;font-size:15.5px;line-height:1.9">
        ${p.paragraphs.map(t => `<p>${clickable(t)}</p>`).join('')}
      </div>
      <div class="card">
        <div class="card-title"><h3>长难句拆解</h3><span class="pill purple">${p.difficult_sentences.length} 句</span></div>
        ${p.difficult_sentences.map(d => `<div style="padding:10px 0;border-top:1px solid var(--line)">
          <div class="ex-en">${esc(d.en)}</div>
          <div class="feedback info" style="margin-top:6px"><b>结构：</b>${esc(d.analysis)}<br><b>翻译：</b>${esc(d.translation)}</div>
        </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-title"><h3>配套练习</h3><span class="pill" id="r-score">0 / ${p.questions.length}</span></div>
        ${p.questions.map((q, qi) => `
          <div class="q-item" data-qi="${qi}" style="border-top:1px solid var(--line);padding:13px 0">
            <p style="font-weight:500;margin-bottom:8px">${qi + 1}. <span class="pill line">${esc(q.type)}</span> ${esc(q.question)}</p>
            ${q.options && q.options.length
              ? q.options.map(o => `<div class="option" data-v="${esc(o[0])}" onclick="Reading.pick(this,${qi})"><span class="k"></span>${esc(o)}</div>`).join('')
              : `<input placeholder="填写答案" onkeydown="if(event.key==='Enter')Reading.fill(this,${qi})">`}
            <div class="fb"></div>
          </div>`).join('')}
      </div>`;
    window.scrollTo(0, 0);
  }

  function clickable(text) {
    return esc(text).replace(/[A-Za-z][A-Za-z'-]*/g, m => `<span onclick="Reading.lookup('${esc(m)}')" style="cursor:pointer" onmouseover="this.style.background='#fff1c9'" onmouseout="this.style.background=''">${m}</span>`);
  }

  async function lookup(word) {
    await Store.loadWords();
    const key = String(word).toLowerCase().replace(/['’]s$/, '');
    const hit = Store.words.find(w => w.w.toLowerCase() === key);
    if (hit) { location.hash = '#/vocab/w/' + hit.id; return; }
    UI.openModal(`<h2>${esc(word)}</h2><p class="muted tiny">词库暂未收录这个词</p>
      <button class="btn" onclick="Audio2.speakFallback('${esc(word)}')">🔊 播放发音</button>`);
  }

  function pick(el, qi) {
    const p = DATA.passages[cur];
    const q = p.questions[qi];
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
    score();
  }

  function fill(input, qi) {
    const p = DATA.passages[cur];
    const q = p.questions[qi];
    const box = input.closest('.q-item');
    if (box.dataset.done) return;
    box.dataset.done = '1';
    input.disabled = true;
    const ok = input.value.trim().toLowerCase() === String(q.answer).toLowerCase();
    input.style.borderColor = ok ? 'var(--green)' : 'var(--red)';
    $('.fb', box).innerHTML = `<div class="feedback ${ok ? 'ok' : 'no'}">${ok ? '✓ 正确' : '✗ 正确答案：' + esc(q.answer)} · ${esc(q.explanation)}</div>`;
    score();
  }

  function score() {
    const p = DATA.passages[cur];
    const done = $$('.q-item[data-done]');
    let right = 0;
    done.forEach(b => {
      if (b.querySelector('.option.right')) right++;
      else {
        const inp = b.querySelector('input');
        if (inp && inp.style.borderColor.includes('green')) right++;
        else if (inp && inp.disabled && !b.querySelector('.option.wrong')) right++;
      }
    });
    const el = $('#r-score');
    if (el) el.textContent = `${right} / ${p.questions.length}`;
  }

  /* 同义替换 */
  async function syn() {
    await ensure();
    $('#view').innerHTML = `
      <a class="back" href="#/reading">← 返回</a>
      <h1>同义替换</h1>
      <p class="muted" style="margin-bottom:14px">题干词在原文里永远换了一种说法，认识这层关系，定位就快了。</p>
      <div class="card hover center" onclick="Reading.synQuiz()">
        <h4>⚡ 10 题快测</h4><p class="muted tiny" style="margin:0">看一个词，选出它的同义替换</p>
      </div>
      ${DATA.synonym_groups.map(g => `<div class="card">
        <div class="card-title"><h3>${esc(g.theme)}</h3><span class="pill blue">${g.pairs.length} 组</span></div>
        <div class="grid g2">
          ${g.pairs.map(([a, b]) => `<div class="chip-word" onclick="Audio2.speakFallback('${esc(a)}')" style="cursor:pointer">
            ${esc(a)} <span class="dim">⇄</span> ${esc(b)}</div>`).join('')}
        </div>
      </div>`).join('')}`;
    window.scrollTo(0, 0);
  }

  let SQ = null;
  function synQuiz() {
    const pool = [];
    DATA.synonym_groups.forEach(g => g.pairs.forEach(([a, b]) => pool.push([a, b])));
    SQ = { pool, picks: shuffle(pool).slice(0, 10), idx: 0, right: 0 };
    renderSyn();
  }

  function renderSyn() {
    const s = SQ;
    if (s.idx >= s.picks.length) {
      $('#view').innerHTML = `<div class="card center" style="padding:34px 18px">
        <h2>${s.right} / ${s.picks.length} 正确</h2>
        <button class="btn primary" onclick="Reading.synQuiz()">再来一轮</button>
        <button class="btn" onclick="Reading.syn()">返回替换表</button></div>`;
      return;
    }
    const [a, b] = s.picks[s.idx];
    const opts = shuffle([b, ...shuffle(s.pool.filter(x => x[1] !== b)).slice(0, 3).map(x => x[1])]);
    $('#view').innerHTML = `
      <a class="back" href="#/reading">← 退出</a>
      <div class="progress"><i style="width:${s.idx / s.picks.length * 100}%"></i></div>
      <div class="card center" style="padding:26px">
        <p class="muted tiny">选出同义替换</p>
        <div style="font-size:28px;font-weight:600">${esc(a)}</div>
      </div>
      ${opts.map(o => `<div class="option" data-v="${esc(o)}" onclick="Reading.pickSyn(this,'${esc(b)}')"><span class="k"></span>${esc(o)}</div>`).join('')}
      <div id="syn-fb"></div>`;
  }

  function pickSyn(el, answer) {
    const ok = el.dataset.v === answer;
    if (ok) SQ.right++;
    $$('.option').forEach(o => {
      o.onclick = null;
      if (o.dataset.v === answer) o.classList.add('right');
      else if (o === el) o.classList.add('wrong');
    });
    $('#syn-fb').innerHTML = `<button class="btn primary block" style="margin-top:10px" onclick="Reading.nextSyn()">继续 →</button>`;
  }

  function nextSyn() { SQ.idx++; renderSyn(); }

  return { render, open, passage, lookup, pick, fill, syn, synQuiz, pickSyn, nextSyn, ensure };
})();
