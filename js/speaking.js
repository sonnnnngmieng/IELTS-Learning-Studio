/* 口语模块：Part 1/2/3 题库 / 话题卡录音 / 跟读 */
const Speaking = (() => {
  let DATA = null;
  let tab = 'p1';

  async function ensure() {
    if (DATA) return;
    DATA = await fetch('data/speaking.json').then(r => r.json());
  }

  async function render(root) {
    await ensure();
    root.innerHTML = `
      <h1>口语</h1>
      <p class="muted" style="margin-bottom:14px">流利度优先于准确度：先把话说完，再打磨用词。每天开口 15 分钟胜过周末突击。</p>
      <div class="tabs">
        ${[['p1', 'Part 1'], ['p2', 'Part 2 话题卡'], ['p3', 'Part 3'], ['shadow', '影子跟读']]
          .map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" onclick="Speaking.go('${k}')">${l}</button>`).join('')}
      </div>
      <div id="s-body"></div>`;
    paint();
  }

  function go(k) { tab = k; render($('#view')); }

  function paint() {
    const b = $('#s-body');
    if (tab === 'p1') return p1(b);
    if (tab === 'p2') return p2(b);
    if (tab === 'p3') return p3(b);
    return shadow(b);
  }

  function p1(b) {
    b.innerHTML = DATA.part1.map(t => `
      <div class="card">
        <h3>${esc(t.topic)}</h3>
        ${t.questions.map(q => `<div style="padding:11px 0;border-top:1px solid var(--line)">
          <div class="row"><b style="font-size:14.5px">${esc(q.q)}</b>
            <button class="btn sm icon soft" onclick="Audio2.speakFallback('${jss(q.q)}')">🔊</button></div>
          <p class="muted tiny" style="margin:4px 0">思路：${esc(q.tip)}</p>
          <details><summary class="link-btn tiny">看示范回答</summary>
            <div class="feedback info" style="margin-top:6px">${esc(q.sample)}
              <div style="margin-top:6px"><button class="btn sm soft" onclick="Audio2.speakFallback('${jss(q.sample)}')">🔊 听示范</button></div>
            </div></details>
        </div>`).join('')}
      </div>`).join('');
  }

  function p2(b) {
    b.innerHTML = DATA.part2.map((c, i) => `
      <div class="card">
        <div class="cue">
          <div class="ct">${esc(c.title)}</div>
          <ul>${c.cue_card.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
        </div>
        <div class="label">思路提纲</div>
        ${c.ideas.map(x => `<div class="tiny" style="color:var(--ink-2);padding:2px 0">· ${esc(x)}</div>`).join('')}
        <div class="label">话题词汇</div>
        <div class="chips">${c.topic_vocab.map(v => `<span class="chip-word" onclick="Audio2.speakFallback('${jss(v.en)}')"><b>${esc(v.en)}</b> <span class="dim tiny">${esc(v.cn)}</span></span>`).join('')}</div>
        <details style="margin-top:10px"><summary class="link-btn tiny">看示范答案</summary>
          <div class="essay" style="font-size:14px;margin-top:8px">${esc(c.sample)}</div></details>
        <div class="row" style="margin-top:12px">
          <button class="btn primary sm" onclick="Speaking.practice(${i})">🎤 限时练这题</button>
          <button class="btn sm" onclick="AI.polishSpeaking(${i})">让 AI 帮我看表达</button>
        </div>
      </div>`).join('');
  }

  function p3(b) {
    b.innerHTML = DATA.part3.map(g => `
      <div class="card">
        <h3>${esc(g.topic)}</h3>
        ${g.questions.map(q => `<div style="padding:11px 0;border-top:1px solid var(--line)">
          <b style="font-size:14.5px">${esc(q.q)}</b>
          <p class="muted tiny" style="margin:4px 0">切入角度：${esc(q.angle)}</p>
          <details><summary class="link-btn tiny">看示范回答</summary>
            <div class="feedback info" style="margin-top:6px">${esc(q.sample)}</div></details>
        </div>`).join('')}
      </div>`).join('');
  }

  /* Part2 限时录音 */
  let cardIdx = 0;
  function practice(i) {
    cardIdx = i;
    const c = DATA.part2[i];
    $('#view').innerHTML = `
      <a class="back" href="#/speaking" onclick="Speaking.go('p2')">← 返回</a>
      <div class="card"><div class="cue"><div class="ct">${esc(c.title)}</div>
        <ul>${c.cue_card.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div></div>
      <div class="card center">
        <p class="muted tiny">点击开始：1 分钟准备 + 2 分钟陈述，录音自动停止</p>
        <div class="pill blue mono" id="rec-clock" style="font-size:16px;padding:6px 14px">01:00 准备</div>
        <button class="btn primary" id="mic" style="margin:14px auto;width:64px;height:64px;border-radius:50%;font-size:22px">🎤</button>
        <p class="tiny muted" id="rec-tip">点击开始准备</p>
        <audio id="rec-play" controls style="display:none;width:100%;margin-top:12px"></audio>
      </div>`;
    let phase = 'idle', iv = null;
    const clock = $('#rec-clock'), tip = $('#rec-tip'), mic = $('#mic');
    mic.onclick = async () => {
      if (phase === 'idle') {
        try { await Recorder.start(); } catch (e) { return UI.toast('无法访问麦克风，请检查浏览器权限'); }
        phase = 'prep';
        let left = 60;
        clock.textContent = '01:00 准备';
        tip.textContent = '用关键词记下你要说的三点…';
        iv = setInterval(() => {
          left--;
          const m = String(Math.floor(left / 60)).padStart(2, '0');
          const s = String(left % 60).padStart(2, '0');
          if (phase === 'prep') {
            clock.textContent = `${m}:${s} 准备`;
            if (left <= 0) { phase = 'talk'; left = 120; tip.textContent = '开始说，别停，卡住就换句话'; clock.textContent = '02:00 陈述'; }
          } else {
            clock.textContent = `${m}:${s} 陈述`;
            if (left <= 0) finish();
          }
        }, 1000);
      } else finish();
    };
    async function finish() {
      clearInterval(iv);
      phase = 'idle';
      const url = await Recorder.stop();
      tip.textContent = '录音完成，回放听听停顿和重复的地方';
      const p = $('#rec-play');
      p.src = url; p.style.display = 'block';
      mic.textContent = '🔄';
      mic.onclick = () => Speaking.practice(cardIdx);
      Store.trackStudy(180);
      Store.flushStats();
    }
  }

  /* 跟读 */
  let shIdx = 0;
  function shadow(b) {
    const s = DATA.shadowing[shIdx];
    b.innerHTML = `
      <div class="card center" style="padding:26px 18px">
        <p class="tiny dim">第 ${shIdx + 1} / ${DATA.shadowing.length} 句</p>
        <p style="font-size:18px;font-weight:500;line-height:1.65;margin:8px 0">${esc(s.en)}</p>
        <p class="muted tiny">${esc(s.zh)}</p>
        <div class="feedback info" style="text-align:left"><b>发音要点：</b>${esc(s.note)}</div>
        <div class="row" style="justify-content:center;margin-top:12px">
          <button class="btn primary" onclick="Audio2.play(audUk('shadow_${String(shIdx + 1).padStart(2, '0')}'),'${jss(s.en)}')">🔊 听原句</button>
          <button class="btn line" id="sh-rec">🎤 录音跟读</button>
        </div>
        <audio id="sh-play" controls style="display:none;width:100%;margin-top:12px"></audio>
        <div class="row between" style="margin-top:14px">
          <button class="btn soft" onclick="Speaking.shMove(-1)">← 上一句</button>
          <button class="btn soft" onclick="Speaking.shMove(1)">下一句 →</button>
        </div>
      </div>`;
    const btn = $('#sh-rec');
    let rec = false;
    btn.onclick = async () => {
      if (!rec) {
        try { await Recorder.start(); } catch (e) { return UI.toast('无法访问麦克风'); }
        rec = true; btn.textContent = '■ 停止';
      } else {
        rec = false; btn.textContent = '🎤 录音跟读';
        const url = await Recorder.stop();
        const p = $('#sh-play');
        p.src = url; p.style.display = 'block';
      }
    };
  }

  function shMove(d) {
    const n = shIdx + d;
    if (n < 0 || n >= DATA.shadowing.length) return;
    shIdx = n;
    shadow($('#s-body'));
  }

  function dailyPick(i) {
    const cards = (DATA && DATA.part2) || [];
    return cards.length ? cards[i % cards.length] : null;
  }

  return { render, go, practice, shMove, ensure, dailyPick };
})();
