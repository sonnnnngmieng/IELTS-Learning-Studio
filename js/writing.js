/* 写作模块：范文结构精读 / 句型库 / 话题词汇 / 练习与 AI 批改 */
const Writing = (() => {
  let DATA = null, DEEP = null, PHRASES = null;
  let tab = 'essays';

  async function ensure() {
    if (DATA) return;
    DATA = await fetch('data/writing.json').then(r => r.json());
    DEEP = await fetch('data/writing_deep.json').then(r => r.json()).catch(() => ({ essays: [], task1_sentence_bank: [], linking_bank: [] }));
    PHRASES = await fetch('data/writing_phrases.json').then(r => r.json()).catch(() => ({ groups: [] }));
  }

  function paras(text) {
    return String(text || '').split(/\n{2,}/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
  }

  async function render(root) {
    await ensure();
    root.innerHTML = `
      <h1>写作</h1>
      <p class="muted" style="margin-bottom:14px">范文不是拿来背的，是拿来拆的：每段干什么、每句怎么搭、哪些句型能搬走。</p>
      <div class="tabs">
        ${[['essays', '范文精读'], ['t1', 'Task 1'], ['t2', 'Task 2'], ['bank', '句型与衔接'], ['phrases', '常用词句'], ['vocab', '话题词汇'], ['practice', '动笔练习']]
          .map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" onclick="Writing.tab('${k}')">${l}</button>`).join('')}
      </div>
      <div id="w-body"></div>`;
    renderTab();
  }

  function tab_(k) { tab = k; render($('#view')); }

  function renderTab() {
    const b = $('#w-body');
    if (tab === 'essays') return tabEssays(b);
    if (tab === 't1') return tabT1(b);
    if (tab === 't2') return tabT2(b);
    if (tab === 'bank') return tabBank(b);
    if (tab === 'phrases') return tabPhrases(b);
    if (tab === 'vocab') return tabVocab(b);
    if (tab === 'practice') return tabPractice(b);
  }

  /* ---- 范文精读 ---- */
  function tabEssays(b) {
    b.innerHTML = (DEEP.essays || []).map((e, i) => {
      const src = DATA.model_essays[e.index] || {};
      return `
      <div class="card">
        <div class="card-title">
          <h3>${esc(src.type || e.type)} · ${esc(src.band || '')}</h3>
          <span class="pill blue">${e.structure_map ? e.structure_map.length : 0} 段 · ${e.sentence_notes ? e.sentence_notes.length : 0} 句拆解</span>
        </div>
        <div class="feedback info" style="margin-bottom:12px"><b>题目：</b>${esc(src.prompt || '')}
          <div style="margin-top:6px">${Src.pill('essay')}</div></div>

        <div class="label">全文（黄色高亮为可迁移句型）</div>
        <div class="essay">${paras(highlight(src.essay || '', e.sentence_notes || []))}</div>

        <div class="sep"></div>
        <div class="label">段落功能拆解</div>
        ${(e.structure_map || []).map(m => `<div class="map-row">
          <div class="map-part">${esc(m.part)}</div>
          <div class="map-body"><b>${esc(m.fn)}</b>
            ${m.quote ? `<div class="quote-line">“${esc(m.quote)}”</div>` : ''}
            <div class="tiny muted" style="margin-top:4px">${esc(m.tip)}</div>
          </div></div>`).join('')}

        <div class="sep"></div>
        <div class="label">逐句结构 → 可迁移模板</div>
        ${(e.sentence_notes || []).map(s => `<div style="padding:9px 0;border-top:1px solid var(--line)">
          <div class="ex-en" style="font-size:14px">${esc(s.sentence)}</div>
          <div class="tiny" style="margin-top:3px;color:var(--ink-2)">结构：${esc(s.structure)}</div>
          <div class="tiny" style="margin-top:2px;color:var(--purple)">模板：${esc(s.transfer)}</div>
        </div>`).join('')}

        <div class="grid g2" style="margin-top:14px">
          <div class="card flat" style="margin:0;background:var(--green-2)">
            <div class="tiny" style="font-weight:600;color:#0b6e4c;margin-bottom:4px">这篇为什么能上 7 分</div>
            ${(e.band7_signals || []).map(x => `<div class="tiny" style="color:#0b6e4c">· ${esc(x)}</div>`).join('')}
          </div>
          <div class="card flat" style="margin:0;background:var(--red-2)">
            <div class="tiny" style="font-weight:600;color:#8f2f2f;margin-bottom:4px">同题常见错误</div>
            ${(e.common_mistakes || []).map(x => `<div class="tiny" style="color:#8f2f2f">· ${esc(x)}</div>`).join('')}
          </div>
        </div>

        <div class="row" style="margin-top:12px">
          <button class="btn primary sm" onclick="Writing.practiceWith(${e.index})">照着结构写一篇</button>
          <button class="btn sm" onclick="AI.reviewEssay(${e.index})">让 AI 批改我的版本</button>
        </div>
      </div>`;
    }).join('');
  }

  function highlight(essay, notes) {
    let html = esc(essay);
    (notes || []).forEach(n => {
      const s = esc(n.sentence);
      if (s && html.includes(s)) html = html.replace(s, `<span class="hl-sent">${s}</span>`);
    });
    return html;
  }

  /* ---- Task1 ---- */
  function tabT1(b) {
    const d = DATA.task1_guide;
    b.innerHTML = `
      <div class="card">
        <h3>Task 1 是什么</h3>
        <p class="muted tiny">${esc(d.intro)}</p>
        <div class="sep"></div>
        ${d.structure.map((s, i) => `<div class="map-row">
          <div class="map-part">${i + 1}. ${esc(s.part)}</div>
          <div class="map-body tiny muted">${esc(s.desc)}</div></div>`).join('')}
      </div>
      <div class="card">
        <div class="card-title"><h3>句型库</h3><span class="tiny dim">点击朗读</span></div>
        ${(DEEP.task1_sentence_bank || []).map(g => `
          <div style="padding:8px 0;border-top:1px solid var(--line)">
            <div class="tiny" style="color:var(--purple);font-weight:500;margin-bottom:4px">${esc(g.fn)}</div>
            ${g.items.map(x => `<div class="tiny" style="padding:3px 0;cursor:pointer" onclick="Audio2.speakFallback('${jss(x)}')">· ${esc(x)}</div>`).join('')}
          </div>`).join('')}
      </div>`;
  }

  /* ---- Task2 ---- */
  function tabT2(b) {
    const d = DATA.task2_guide;
    b.innerHTML = `
      <div class="card">
        <h3>Task 2 是什么</h3>
        <p class="muted tiny">${esc(d.intro)}</p>
      </div>
      <div class="card">
        <div class="card-title"><h3>五种题型</h3></div>
        ${d.question_types.map(q => `<div style="padding:10px 0;border-top:1px solid var(--line)">
          <b style="color:var(--purple);font-size:14px">${esc(q.type)}</b>
          <p class="muted tiny" style="margin:2px 0 4px">${esc(q.desc)}</p>
          <div class="feedback info" style="margin:0">${esc(q.structure)}</div>
        </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-title"><h3>评分标准怎么看</h3></div>
        ${d.band_descriptors.map(x => `<div style="padding:10px 0;border-top:1px solid var(--line)">
          <span class="pill blue">${esc(x.band)}</span>
          <p class="tiny muted" style="margin:6px 0 0;line-height:1.75">${esc(x.criteria)}</p></div>`).join('')}
      </div>`;
  }

  /* ---- 句型 / 衔接 ---- */
  function tabBank(b) {
    b.innerHTML = `
      <div class="card">
        <div class="card-title"><h3>连接词（按逻辑分组）</h3></div>
        ${(DEEP.linking_bank || []).map(g => `<div style="padding:9px 0;border-top:1px solid var(--line)">
          <div class="tiny" style="color:var(--purple);font-weight:500">${esc(g.group)}</div>
          <div class="chips" style="margin-top:5px">${g.words.map(w => `<span class="chip-word" onclick="Audio2.speakFallback('${esc(w)}')">${esc(w)}</span>`).join('')}</div>
        </div>`).join('')}
      </div>`;
  }

  /* ---- 常用词句（训练写作） ---- */
  let phraseQ = '';
  let phraseFor = '全部';

  function tabPhrases(b) {
    const groups = (PHRASES && PHRASES.groups) || [];
    b.innerHTML = `
      <div class="card">
        <div class="card-title"><h3>训练用词句</h3>${Src.pill('phrases')}</div>
        <p class="muted tiny" style="margin:0 0 10px">${esc((PHRASES && PHRASES.intro) || '')}</p>
        <div class="row wrap" style="gap:8px;margin-bottom:8px">
          <input class="input" id="ph-q" style="flex:1;min-width:200px" placeholder="搜关键词：让步 / because / 上升 / percentage…"
            value="${esc(phraseQ)}" oninput="Writing.searchPhrases(this.value)">
          ${['全部', 'Task 2', 'Task 1', '通用'].map(f => `<span class="chip ${f === phraseFor ? 'on' : ''}" onclick="Writing.filterPhrases('${f}')">${f}</span>`).join('')}
        </div>
      </div>
      <div id="ph-list">${phraseGroups(groups)}</div>`;
  }

  function phraseGroups(groups) {
    const kw = (phraseQ || '').trim().toLowerCase();
    const out = groups.filter(g => phraseFor === '全部' || g.for === phraseFor).map(g => {
      const items = g.items.filter(it => !kw || (it.en + ' ' + it.cn + ' ' + it.use).toLowerCase().includes(kw));
      if (!items.length) return '';
      return `<div class="card">
        <div class="card-title"><h3>${esc(g.title)}</h3><span class="pill blue">${esc(g.for)}</span></div>
        ${items.map(it => `<div class="ph-row">
          <div class="ph-main">
            <div class="ph-en" onclick="Audio2.speakFallback('${jss(it.en)}')" title="点击朗读">${esc(it.en)}</div>
            <div class="ph-cn">${esc(it.cn)}</div>
            <div class="ph-use">${esc(it.use)}</div>
          </div>
          <button class="btn sm soft" onclick="Writing.usePhrase('${jss(it.en)}')">插入</button>
        </div>`).join('')}
      </div>`;
    }).filter(Boolean);
    return out.length ? out.join('') : '<div class="card"><p class="muted tiny" style="margin:0">没有匹配的句子，换个关键词试试。</p></div>';
  }

  function searchPhrases(q) {
    phraseQ = q;
    const box = $('#ph-list');
    if (box) box.innerHTML = phraseGroups((PHRASES && PHRASES.groups) || []);
  }

  function filterPhrases(f) {
    phraseFor = f;
    renderTab();
  }

  /** 插入到练习框；当前不在动笔页就复制到剪贴板 */
  function usePhrase(text) {
    const box = $('#wp-body');
    if (box) {
      const s0 = box.selectionStart || 0, e0 = box.selectionEnd || 0;
      const v = box.value;
      const add = (s0 > 0 && !/\s$/.test(v.slice(0, s0))) ? ' ' + text : text;
      box.value = v.slice(0, s0) + add + v.slice(e0);
      const pos = s0 + add.length;
      box.focus(); box.setSelectionRange(pos, pos);
      count();
      UI.toast('已插入到作文里');
      return;
    }
    const done = () => UI.toast('已复制，去「动笔练习」粘贴即可');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => { copyFallback(text); done(); });
    } else { copyFallback(text); done(); }
  }

  function copyFallback(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) { /* 忽略 */ }
  }

  /* ---- 话题词汇 ---- */
  function tabVocab(b) {
    b.innerHTML = DATA.topic_vocab.map(t => `
      <div class="card">
        <div class="card-title"><h3>${esc(t.topic)}</h3><span class="pill blue">${t.words.length} 词</span></div>
        <div class="chips">
          ${t.words.map(w => `<span class="chip-word" onclick="Audio2.speakFallback('${jss(w.en)}')"><b>${esc(w.en)}</b> <span class="dim tiny">${esc(w.cn)}</span></span>`).join('')}
        </div>
      </div>`).join('');
  }

  /* ---- 练习 ---- */
  let timer = null;
  function tabPractice(b, presetPrompt) {
    const essays = DATA.model_essays || [];
    b.innerHTML = `
      <div class="card">
        <label class="field"><span>题目</span>
          <textarea id="wp-prompt" rows="2" placeholder="选择下方范文题目或自己输入…">${esc(presetPrompt || '')}</textarea></label>
        <label class="field"><span>限时</span>
          <select id="wp-min">
            <option value="20">20 分钟（Task 1）</option>
            <option value="40" selected>40 分钟（Task 2）</option>
            <option value="60">60 分钟（两篇）</option>
          </select></label>
        <div class="row" style="margin-bottom:10px">
          <button class="btn primary" onclick="Writing.startTimer()">开始计时</button>
          <button class="btn soft" onclick="Writing.stopTimer()">停止</button>
          <span class="pill blue mono" id="wp-clock">00:00</span>
        </div>
        <label class="field"><span>正文</span>
          <textarea id="wp-body" rows="14" placeholder="开始写…" oninput="Writing.count()"></textarea></label>
        <p class="muted tiny" id="wp-count">0 词 · 0 句</p>
        <div class="row wrap">
          <button class="btn primary" onclick="Writing.save()">保存</button>
          <button class="btn" onclick="Writing.aiReview()">AI 批改</button>
          <span class="tiny dim">AI 反馈是练习参考，不是官方评分</span>
        </div>
      </div>
      <div class="card">
        <div class="card-title"><h3>用现成题目练</h3></div>
        <div class="chips">
          ${essays.map((e, i) => `<span class="chip" onclick="Writing.usePrompt(${i})">${esc((e.prompt || '').slice(0, 26))}…</span>`).join('')}
        </div>
      </div>`;
  }

  function usePrompt(i) {
    const e = DATA.model_essays[i];
    const box = $('#wp-prompt');
    if (box) { box.value = e.prompt; UI.toast('题目已填入'); }
  }

  function practiceWith(i) { tab = 'practice'; render($('#view')); setTimeout(() => usePrompt(i), 60); }

  /** 从「每日范文」跳过来：用范文自己的题目开写 */
  function practiceDaily(prompt) {
    tab = 'practice';
    render($('#view'));
    setTimeout(() => {
      const box = $('#wp-prompt');
      if (box) { box.value = prompt || ''; UI.toast('题目已填入，开始写吧'); box.scrollIntoView({ block: 'center' }); }
    }, 80);
  }

  function count() {
    const t = $('#wp-body').value.trim();
    const n = t ? t.split(/\s+/).filter(Boolean).length : 0;
    const s = t ? t.split(/[.!?]+/).filter(x => x.trim()).length : 0;
    $('#wp-count').textContent = `${n} 词 · ${s} 句${n >= 250 ? ' · 已达 Task 2 字数要求' : ''}`;
  }

  function startTimer() {
    stopTimer();
    let left = (+$('#wp-min').value) * 60;
    timer = setInterval(() => {
      left--;
      const m = String(Math.floor(left / 60)).padStart(2, '0');
      const sec = String(left % 60).padStart(2, '0');
      const c = $('#wp-clock');
      if (c) c.textContent = `${m}:${sec}`;
      if (left <= 0) { clearInterval(timer); timer = null; UI.toast('时间到，停笔检查'); }
    }, 1000);
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  async function save() {
    const body = $('#wp-body').value.trim();
    if (!body) return UI.toast('正文还是空的');
    const prompt = $('#wp-prompt').value.trim() || '未填写题目';
    Store.addEvent('writing', { title: prompt.slice(0, 80), content: body });
    try { Track.study('writing', { words: body.split(/\s+/).filter(Boolean).length }); } catch (e) { /* 忽略 */ }
    UI.toast('已保存，可在学习记录查看');
  }

  function aiReview() {
    const body = $('#wp-body').value.trim();
    if (!body) return UI.toast('先写点内容再批改');
    const prompt = $('#wp-prompt').value.trim();
    AI.reviewText(prompt, body);
  }

  return { render, tab: tab_, practiceWith, practiceDaily, usePrompt, count, startTimer, stopTimer, save, aiReview, ensure,
    searchPhrases, filterPhrases, usePhrase };
})();
