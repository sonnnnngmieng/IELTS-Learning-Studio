/* 词汇模块：词汇中心 / 单词详情 / SRS 学习 / 五种训练 */
const Vocab = (() => {
  let filter = { ch: 0, status: 'all', q: '' };
  let session = null;   // 学习会话
  let quiz = null;

  const audioUK = w => `audio/${w.id}.mp3`;
  const audioUS = w => `audio_us/${w.id}.mp3`;

  /* ================= 词汇中心 ================= */
  async function render(root, sub) {
    await Store.loadWords();
    if (Cloud.user && !Store.state.ready) await Store.loadUser();
    if (!Store.words.length) { root.innerHTML = '<div class="empty">词库加载中…</div>'; return; }
    if (sub === 'study') return renderStudy(root);
    if (sub === 'train') return renderTrain(root);
    if (sub === 'roots') return renderRoots(root);
    if (sub === 'mistakes') return renderMistakes(root);
    if (sub && sub.startsWith('w/')) return renderDetail(root, sub.slice(2));

    const s = Store.stats();
    const today = Store.today || {};
    const dailyNew = Store.settings.daily_new || 15;
    root.innerHTML = `
      <h1>词汇</h1>
      <p class="muted" style="margin-bottom:14px">词根理解 → 例句语境 → 间隔复习，三步把词记牢。</p>

      <div class="kpis">
        <div class="kpi"><div class="n">${today.new_words || 0}<span class="tiny dim"> / ${dailyNew}</span></div><div class="l">今日新词</div></div>
        <div class="kpi"><div class="n">${s.due}</div><div class="l">待复习</div></div>
        <div class="kpi"><div class="n">${s.mastered}</div><div class="l">已掌握</div></div>
        <div class="kpi"><div class="n">${s.mistakes.length}</div><div class="l">错词本</div></div>
      </div>

      <div class="grid g3">
        <div class="card hover" onclick="Vocab.startStudy('new')">
          <h4>学新词</h4><p class="muted tiny" style="margin:0">今天还有 ${Math.max(0, dailyNew - (today.new_words || 0))} 个新词待学</p>
        </div>
        <div class="card hover" onclick="Vocab.startStudy('review')">
          <h4>复习到期</h4><p class="muted tiny" style="margin:0">${s.due ? s.due + ' 个词到期' : '暂无到期词，可继续学新词'}</p>
        </div>
        <div class="card hover" onclick="location.hash='#/vocab/train'">
          <h4>专项训练</h4><p class="muted tiny" style="margin:0">拼写 / 听辨 / 互译 / 词根</p>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><h3>词库</h3><span class="pill blue">${Store.words.length} 词</span></div>
        <div class="row wrap" style="margin-bottom:10px">
          <div class="chips">
            <span class="chip ${filter.ch === 0 ? 'on' : ''}" onclick="Vocab.setFilter({ch:0})">全部章节</span>
            ${(Store.state.chapters || []).map(c => `<span class="chip ${filter.ch === c.id ? 'on' : ''}" onclick="Vocab.setFilter({ch:${c.id}})">第${c.id}章 ${esc(c.title)}</span>`).join('')}
          </div>
        </div>
        <div class="row wrap" style="margin-bottom:10px">
          <div class="chips">
            ${[['all', '全部'], ['new', '未学'], ['learning', '学习中'], ['mastered', '已掌握'], ['star', '已收藏'], ['mistake', '错词']]
              .map(([k, l]) => `<span class="chip ${filter.status === k ? 'on' : ''}" onclick="Vocab.setFilter({status:'${k}'})">${l}</span>`).join('')}
          </div>
          <div class="spacer"></div>
          <input id="v-search" placeholder="搜索单词或释义" style="max-width:220px" oninput="Vocab.onSearch(this.value)" value="${esc(filter.q)}">
        </div>
        <div id="v-list"></div>
      </div>

      <div class="card hover" onclick="location.hash='#/vocab/roots'">
        <div class="card-title"><h3>词根图谱</h3><span class="pill purple">${Store.rootGroups().length} 组</span></div>
        <p class="muted tiny" style="margin:0">按词根聚合本词库的词：先记住 port = 携带，再串起 import / export / transport。</p>
      </div>`;
    renderList();
  }

  function setFilter(patch) {
    Object.assign(filter, patch);
    render($('#view'), '');
  }

  function onSearch(q) { filter.q = q.trim(); renderList(); }

  function renderList() {
    const s = Store.progress;
    let list = Store.words;
    if (filter.ch) list = list.filter(w => w.ch === filter.ch);
    if (filter.q) {
      const q = filter.q.toLowerCase();
      list = list.filter(w => w.w.toLowerCase().includes(q) || (w.m || []).some(m => m.cn.includes(filter.q)));
    }
    if (filter.status !== 'all') {
      list = list.filter(w => {
        const r = s[w.id];
        if (filter.status === 'new') return !r || !r.reps;
        if (filter.status === 'learning') return r && r.reps > 0 && (r.box || 0) < 5;
        if (filter.status === 'mastered') return r && (r.box || 0) >= 5;
        if (filter.status === 'star') return r && r.starred;
        if (filter.status === 'mistake') return r && r.mistake;
        return true;
      });
    }
    const box = $('#v-list');
    if (!box) return;
    if (!list.length) { box.innerHTML = '<div class="empty">没有符合条件的词</div>'; return; }
    box.innerHTML = list.slice(0, 120).map(w => {
      const r = s[w.id];
      const tag = !r || !r.reps ? '<span class="pill">未学</span>'
        : (r.box || 0) >= 5 ? '<span class="pill green">已掌握</span>'
          : r.mistake ? '<span class="pill red">错词</span>'
            : `<span class="pill amber">L${r.box || 0}</span>`;
      return `<div class="wlist-item" onclick="location.hash='#/vocab/w/${w.id}'">
        <div class="wl-main">
          <div><span class="wl-w">${esc(w.w)}</span><span class="wl-ph">${esc(w.ph || '')}</span></div>
          <div class="wl-cn">${esc((w.m || []).map(m => m.cn).join('；'))}</div>
        </div>
        ${tag}
        <button class="btn sm icon soft" onclick="event.stopPropagation();Audio2.play('${audioUK(w)}','${jss(w.w)}')">🔊</button>
      </div>`;
    }).join('') + (list.length > 120 ? `<p class="muted tiny center" style="padding:10px 0">仅显示前 120 条，可搜索缩小范围</p>` : '');
  }

  /* ================= 单词详情 ================= */
  async function renderDetail(root, id) {
    const w = Store.byId[id];
    if (!w) { root.innerHTML = '<div class="empty">找不到这个单词</div>'; return; }
    const r = Store.progress[id];
    const star = r && r.starred;
    const related = w.rootKey ? (Store.rootGroups().find(g => g.key === w.rootKey) || {}).list || [] : [];

    root.innerHTML = `
      <a class="back" href="#/vocab">← 返回词库</a>
      <div class="card">
        <div class="word-head">
          <div style="flex:1;min-width:220px">
            <div class="big">${esc(w.w)}</div>
            <div class="ph-group">
              <button class="ph-btn" onclick="Audio2.play('${audioUK(w)}','${esc(w.w)}','uk')"><b>英</b> ${esc(w.ph || '')} 🔊</button>
              ${w.us ? `<button class="ph-btn" onclick="Audio2.play('${audioUS(w)}','${esc(w.w)}','us')"><b>美</b> ${esc(w.us)} 🔊</button>` : ''}
            </div>
          </div>
          <div style="text-align:right">
            <button class="btn sm ${star ? 'line' : ''}" onclick="Vocab.star('${id}', this)">${star ? '★ 已收藏' : '☆ 收藏'}</button>
            <div class="tiny dim" style="margin-top:6px">第${w.ch || '?'}章 · 原书 P${w.pg}</div>
          </div>
        </div>

        <div class="label">释义</div>
        ${(w.m || []).map(m => `<p class="meaning"><b>${esc(m.pos)}</b>${esc(m.cn)}</p>`).join('')}
        ${w.def_en ? `<p class="muted tiny" style="margin-top:6px">${esc(w.def_en)}</p>` : ''}
        ${w.use ? `<span class="pill purple" style="margin-top:6px">${esc(w.use)}</span>` : ''}

        ${w.root ? `
        <div class="label">词根词缀拆解</div>
        <div class="root-box">
          <div class="root-rule">
            ${w.root.prefix ? `<span class="root-part"><b>前缀</b> ${esc(w.root.prefix)}</span>` : ''}
            ${w.root.base ? `<span class="root-part"><b>词根</b> ${esc(w.root.base)}</span>` : ''}
            ${w.root.suffix ? `<span class="root-part"><b>后缀</b> ${esc(w.root.suffix)}</span>` : ''}
          </div>
          <div class="root-logic">${esc(w.root.logic || '')}</div>
          ${w.root.note ? `<div class="root-warn">⚠ ${esc(w.root.note)}</div>` : ''}
        </div>` : ''}

        <div class="label">例句</div>
        ${(w.ex || []).map(ex => `
          <div style="margin-bottom:12px">
            <div class="ex-en">${hl(ex.en, w.w)}</div>
            <div class="ex-zh">${esc(ex.zh)}</div>
            ${ex.note ? `<div class="ex-note">${esc(ex.note)}</div>` : ''}
          </div>`).join('')}
        ${w.ex2 ? `
          <div style="margin-bottom:12px">
            <div class="row" style="gap:6px;margin-bottom:2px"><span class="pill blue">雅思语境</span></div>
            <div class="ex-en">${hl(w.ex2.en, w.w)}</div>
            <div class="ex-zh">${esc(w.ex2.zh)}</div>
            ${w.ex2.note ? `<div class="ex-note">${esc(w.ex2.note)}</div>` : ''}
            <button class="btn sm soft" style="margin-top:6px" onclick="Audio2.speakFallback('${jss(w.ex2.en)}')">🔊 朗读例句</button>
          </div>` : ''}

        ${(w.col && w.col.length) ? `<div class="label">常用搭配</div><div class="chips">${w.col.map(c => `<span class="pill blue">${esc(c)}</span>`).join('')}</div>` : ''}

        ${(w.syn && w.syn.length) || (w.ant && w.ant.length) ? `
        <div class="label">同义 / 反义</div>
        <div class="row wrap">
          ${(w.syn || []).map(x => `<span class="chip-word">≈ ${esc(x)}</span>`).join('')}
          ${(w.ant || []).map(x => `<span class="chip-word">↔ ${esc(x)}</span>`).join('')}
        </div>` : ''}

        ${(w.fam && w.fam.length) ? `
        <div class="label">词族</div>
        <div class="chips">${w.fam.map(f => `<span class="chip-word" onclick="Vocab.findAndOpen('${esc(f.w)}')"><b>${esc(f.w)}</b> <span class="dim tiny">${esc(f.pos || '')} ${esc(f.cn || '')}</span></span>`).join('')}</div>` : ''}

        ${related.length > 1 ? `
        <div class="label">同词根家族（${related.length}）</div>
        <div class="chips">${related.filter(x => x.id !== w.id).slice(0, 12).map(x => `<span class="chip-word" href="#/vocab/w/${x.id}" onclick="location.hash='#/vocab/w/${x.id}'">${esc(x.w)}</span>`).join('')}</div>` : ''}

        ${r ? `<div class="sep"></div>
        <p class="tiny dim" style="margin:0">学习状态：复习 ${r.reps || 0} 次 · 正确 ${r.correct || 0} / 错误 ${r.wrong || 0} · 下次复习 ${r.due_at ? new Date(r.due_at).toLocaleDateString('zh-CN') : '—'}</p>` : ''}
      </div>

      <div class="row wrap">
        <button class="btn primary" onclick="Vocab.startStudy('new','${id}')">进入学习模式</button>
        <button class="btn" onclick="Vocab.trainOne('spell','${id}')">拼写训练</button>
        <button class="btn" onclick="AI.explainWord('${id}')">让 AI 讲这个词</button>
      </div>`;
    window.scrollTo(0, 0);
  }

  function findAndOpen(word) {
    const w = Store.words.find(x => x.w.toLowerCase() === String(word).toLowerCase());
    if (w) location.hash = '#/vocab/w/' + w.id;
    else UI.toast('词库中暂无该词');
  }

  function hl(en, word) {
    if (!en) return '';
    const re = new RegExp(`\\b(${String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z]{0,3})\\b`, 'gi');
    return esc(en).replace(re, '<span class="hl">$1</span>');
  }

  async function star(id, btn) {
    if (Store.needLogin()) return;
    const on = await Store.toggleStar(id);
    if (btn) { btn.textContent = on ? '★ 已收藏' : '☆ 收藏'; btn.classList.toggle('line', on); }
    UI.toast(on ? '已加入生词本' : '已移出生词本');
  }

  /* ================= 学习会话 ================= */
  async function startStudy(kind, singleId) {
    if (!singleId && Store.needLogin()) return;
    await Store.loadWords();
    if (Store.needLogin() && !singleId) return;
    let queue = [];
    if (singleId) queue = [Store.byId[singleId]].filter(Boolean);
    else if (kind === 'review') queue = Store.dueWords();
    else if (kind === 'mistakes') queue = Store.stats().mistakes.map(r => Store.byId[r.word_id]).filter(Boolean);
    else {
      const limit = Math.max(1, (Store.settings.daily_new || 15) - ((Store.today && Store.today.new_words) || 0));
      queue = Store.newWords(limit);
    }
    if (!queue.length) {
      UI.toast(kind === 'review' ? '今天没有到期需要复习的词 🎉' : '今天的新词已经学完啦');
      return;
    }
    session = { queue: shuffle(queue).slice(0, 30), idx: 0, kind, revealed: false, newCount: 0, right: 0 };
    location.hash = '#/vocab/study';
    renderStudy($('#view'));
  }

  function renderStudy(root) {
    if (!session) { root.innerHTML = '<div class="empty">没有进行中的学习<br><a href="#/vocab">回到词库</a></div>'; return; }
    const s = session;
    if (s.idx >= s.queue.length) {
      if (s.kind === 'new' || s.newCount) Store.addNewWords(s.newCount);
      root.innerHTML = `
        <div class="study-wrap">
          <div class="card center" style="padding:38px 20px">
            <div style="font-size:40px">✓</div>
            <h2>这一组完成了</h2>
            <p class="muted">共 ${s.queue.length} 个词，答对 ${s.right} 次</p>
            <div class="row" style="justify-content:center;margin-top:12px">
              <button class="btn primary" onclick="Vocab.startStudy('new')">再学一组新词</button>
              <button class="btn" onclick="location.hash='#/home'">回首页</button>
            </div>
          </div>
        </div>`;
      session = null;
      return;
    }
    const w = s.queue[s.idx];
    const r = Store.progress[w.id];
    const isNew = !r || !r.reps;
    root.innerHTML = `
      <div class="study-wrap">
        <div class="row between" style="margin-bottom:6px">
          <a class="back" href="#/vocab" onclick="session=null">← 退出</a>
          <span class="tiny dim">${s.idx + 1} / ${s.queue.length} · ${isNew ? '新词' : '复习'}</span>
        </div>
        <div class="progress"><i style="width:${s.idx / s.queue.length * 100}%"></i></div>

        <div class="card">
          <div class="center">
            <div style="font-size:34px;font-weight:600;letter-spacing:-.5px;line-height:1.2">${esc(w.w)}</div>
            <div class="ph-group" style="justify-content:center">
              <button class="ph-btn" onclick="Audio2.play('${audioUK(w)}','${esc(w.w)}','uk')"><b>英</b> ${esc(w.ph || '')} 🔊</button>
              ${w.us ? `<button class="ph-btn" onclick="Audio2.play('${audioUS(w)}','${esc(w.w)}','us')"><b>美</b> ${esc(w.us)} 🔊</button>` : ''}
            </div>
          </div>
          ${s.revealed ? `
            <div class="sep"></div>
            ${(w.m || []).map(m => `<p class="meaning"><b>${esc(m.pos)}</b>${esc(m.cn)}</p>`).join('')}
            ${w.def_en ? `<p class="muted tiny">${esc(w.def_en)}</p>` : ''}
            ${w.root && w.root.logic ? `<div class="root-box" style="margin-top:10px"><div class="root-logic">${esc(w.root.logic)}</div></div>` : ''}
            ${(w.ex || []).slice(0, 1).map(ex => `<div style="margin-top:10px">
              <div class="ex-en">${hl(ex.en, w.w)}</div><div class="ex-zh">${esc(ex.zh)}</div></div>`).join('')}
            ${w.ex2 ? `<div style="margin-top:8px"><span class="pill blue">雅思语境</span>
              <div class="ex-en" style="margin-top:4px">${hl(w.ex2.en, w.w)}</div><div class="ex-zh">${esc(w.ex2.zh)}</div></div>` : ''}
          ` : `<div class="sep"></div><p class="muted tiny center" style="margin:0">先回想意思和发音，再点「显示答案」</p>`}
        </div>

        ${!s.revealed ? `
          <div class="row">
            <button class="btn primary lg" style="flex:1" onclick="Vocab.reveal()">显示答案</button>
            <button class="btn" onclick="Vocab.detailFromStudy('${w.id}')">详细页</button>
          </div>` : `
          <div class="grade-row">
            <button class="btn g0" onclick="Vocab.judge(0)">不认识<small>8 分钟后重来</small></button>
            <button class="btn g1" onclick="Vocab.judge(1)">模糊<small>间隔略延长</small></button>
            <button class="btn g2" onclick="Vocab.judge(2)">认识<small>进入下一档</small></button>
          </div>`}
      </div>`;
  }

  function reveal() { session.revealed = true; renderStudy($('#view')); }
  function detailFromStudy(id) { location.hash = '#/vocab/w/' + id; }

  async function judge(g) {
    const s = session;
    const w = s.queue[s.idx];
    const wasNew = !Store.progress[w.id] || !Store.progress[w.id].reps;
    await Store.grade(w.id, g, 'book');
    if (g === 2) s.right++;
    if (wasNew) s.newCount++;
    s.idx++;
    s.revealed = false;
    renderStudy($('#view'));
  }

  /* ================= 训练模式 ================= */
  function renderTrain(root) {
    root.innerHTML = `
      <a class="back" href="#/vocab">← 返回</a>
      <h1>专项训练</h1>
      <p class="muted" style="margin-bottom:14px">同一批词换不同通道练，记忆才会变牢。</p>
      <div class="grid g2">
        ${[
          ['spell', '听音拼写', '听发音打字，系统逐字母指出错在哪'],
          ['listen', '听音辨词', '四个选项里选出听到的词'],
          ['c2e', '中译英', '看中文，写出对应英文'],
          ['e2c', '英译中', '看单词选释义，最快'],
          ['root', '词根关联', '给一个词根，挑出属于它的词'],
        ].map(([k, t, d]) => `<div class="card hover" onclick="Vocab.startTrain('${k}')">
          <h4>${t}</h4><p class="muted tiny" style="margin:0">${d}</p></div>`).join('')}
      </div>`;
  }

  async function startTrain(mode) {
    if (Store.needLogin()) return;
    await Store.loadWords();
    const learned = Object.values(Store.progress).map(r => Store.byId[r.word_id]).filter(Boolean);
    let pool = learned.length >= 8 ? learned : Store.words;
    // 优先错词
    const mistakes = Store.stats().mistakes.map(r => Store.byId[r.word_id]).filter(Boolean);
    pool = shuffle(mistakes).concat(shuffle(pool)).filter((w, i, a) => a.findIndex(x => x.id === w.id) === i);
    const picks = pool.slice(0, 10);
    if (!picks.length) { UI.toast('先去学几个词再来训练'); return; }
    quiz = { mode, picks, idx: 0, right: 0, wrong: [], revealed: false, typed: '' };
    renderQuiz($('#view'));
  }

  async function trainOne(mode, id) {
    await Store.loadWords();
    const w = Store.byId[id];
    quiz = { mode, picks: [w], idx: 0, right: 0, wrong: [], revealed: false, typed: '' };
    location.hash = '#/vocab/train';
    renderQuiz($('#view'));
  }

  function renderQuiz(root) {
    if (!quiz) { root.innerHTML = '<div class="empty">没有进行中的训练<br><a href="#/vocab/train">选择训练模式</a></div>'; return; }
    const q = quiz;
    if (q.idx >= q.picks.length) {
      const rate = Math.round(q.right / q.picks.length * 100);
      root.innerHTML = `
        <div class="study-wrap"><div class="card center" style="padding:36px 20px">
          <div style="font-size:40px">${rate >= 80 ? '🏆' : rate >= 60 ? '👍' : '📝'}</div>
          <h2>${q.right} / ${q.picks.length} 正确</h2>
          <p class="muted">正确率 ${rate}%${q.wrong.length ? ' · 错词已加入复习队列' : ''}</p>
          ${q.wrong.length ? `<div class="chips" style="justify-content:center;margin:10px 0">${q.wrong.map(w => `<span class="pill red">${esc(w.w)}</span>`).join('')}</div>` : ''}
          <div class="row" style="justify-content:center;margin-top:10px">
            <button class="btn primary" onclick="Vocab.startTrain('${q.mode}')">再来一轮</button>
            <button class="btn" onclick="location.hash='#/vocab'">回到词库</button>
          </div>
        </div></div>`;
      return;
    }
    const w = q.picks[q.idx];
    let body = '';
    if (q.mode === 'spell') {
      body = `
        <div class="card center">
          <p class="muted tiny">听发音，拼出这个单词</p>
          <button class="btn primary" id="q-play" style="margin:8px 0">🔊 播放（可重复）</button>
          <input id="q-input" class="mono" placeholder="输入你听到的单词" style="text-align:center;font-size:19px;letter-spacing:1px" autocomplete="off" autocapitalize="off" autocorrect="off">
          <p class="muted tiny" style="margin-top:8px">提示：${esc((w.m || []).map(m => m.cn).join('；'))}</p>
          <button class="btn primary block" style="margin-top:10px" onclick="Vocab.checkSpell()">提交</button>
        </div>`;
    } else if (q.mode === 'listen') {
      const others = shuffle(Store.words.filter(x => x.id !== w.id)).slice(0, 3);
      const opts = shuffle([w, ...others]);
      body = `
        <div class="card center">
          <p class="muted tiny">听发音，选出你听到的词</p>
          <button class="btn primary" id="q-play" style="margin:8px 0">🔊 播放</button>
        </div>
        <div id="q-opts">${opts.map(o => `<div class="option" data-id="${o.id}" onclick="Vocab.pickOption(this,'${o.id}')"><span class="k"></span>${esc(o.w)}</div>`).join('')}</div>`;
    } else if (q.mode === 'c2e') {
      body = `
        <div class="card center">
          <p class="muted tiny">看中文，写出对应的英文单词</p>
          <div style="font-size:18px;font-weight:500;margin:6px 0">${esc((w.m || []).map(m => m.pos + ' ' + m.cn).join('；'))}</div>
          <input id="q-input" class="mono" placeholder="英文单词" style="text-align:center;font-size:19px" autocomplete="off" autocapitalize="off" autocorrect="off">
          <button class="btn primary block" style="margin-top:10px" onclick="Vocab.checkSpell()">提交</button>
        </div>`;
    } else if (q.mode === 'e2c') {
      const others = shuffle(Store.words.filter(x => x.id !== w.id)).slice(0, 3);
      const mk = x => (x.m || []).map(m => m.cn).join('；');
      const opts = shuffle([mk(w), ...others.map(mk)]);
      body = `
        <div class="card center">
          <div style="font-size:30px;font-weight:600">${esc(w.w)}</div>
          <div class="muted tiny">${esc(w.ph || '')}</div>
          <button class="ph-btn" style="margin-top:8px" onclick="Audio2.play('${audioUK(w)}','${jss(w.w)}')">🔊 听发音</button>
        </div>
        <div id="q-opts">${opts.map(o => `<div class="option" data-v="${esc(o)}" onclick="Vocab.pickMeaning(this)"><span class="k"></span>${esc(o)}</div>`).join('')}</div>`;
    } else {
      // 词根关联
      const groups = Store.rootGroups();
      const g = groups.find(x => x.key === w.rootKey) || groups[0];
      const target = w.rootKey === g.key ? w : g.list[0];
      const opts = shuffle([target, ...shuffle(Store.words.filter(x => x.rootKey !== g.key)).slice(0, 3)]);
      q.rootAnswer = target.id;
      body = `
        <div class="card center">
          <p class="muted tiny">下面哪个词与词根「<b>${esc(g.key)}</b>」同源？</p>
          <div class="root-box" style="margin-top:8px;text-align:left">
            <div class="root-logic">${esc((g.list[0].root && g.list[0].root.logic) || '')}</div>
          </div>
        </div>
        <div id="q-opts">${opts.map(o => `<div class="option" data-id="${o.id}" onclick="Vocab.pickRoot(this)"><span class="k"></span>${esc(o.w)}</div>`).join('')}</div>`;
    }
    root.innerHTML = `
      <div class="study-wrap">
        <div class="row between" style="margin-bottom:6px">
          <a class="back" href="#/vocab/train" onclick="quiz=null">← 退出</a>
          <span class="tiny dim">${q.idx + 1} / ${q.picks.length}</span>
        </div>
        <div class="progress"><i style="width:${q.idx / q.picks.length * 100}%"></i></div>
        ${body}
        <div id="q-fb"></div>
      </div>`;
    if ($('#q-play')) $('#q-play').onclick = () => Audio2.play(audioUK(w), w.w);
    if ($('#q-input')) {
      $('#q-input').addEventListener('keydown', e => { if (e.key === 'Enter') checkSpell(); });
      setTimeout(() => { if ($('#q-play')) $('#q-play').click(); $('#q-input').focus(); }, 250);
    }
  }

  /* 拼写诊断：逐字符比对 */
  function diagnose(typed, target) {
    const a = typed.toLowerCase().split('');
    const b = target.toLowerCase().split('');
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
    const html = seq.map(([k, ch]) => {
      if (k === 'ok') return `<span class="ok">${esc(ch)}</span>`;
      if (k === 'miss') return `<span class="miss">${esc(ch)}</span>`;
      return `<span class="extra">${esc(ch)}</span>`;
    }).join('');
    return { html, miss, extra, correct: typed.toLowerCase() === target.toLowerCase() };
  }

  async function checkSpell() {
    const q = quiz;
    const w = q.picks[q.idx];
    const typed = ($('#q-input').value || '').trim();
    if (!typed) { UI.toast('先写点什么再提交'); return; }
    const d = diagnose(typed, w.w);
    if (d.correct) q.right++; else q.wrong.push(w);
    await Store.grade(w.id, d.correct ? 2 : 0, 'train');
    $('#q-fb').innerHTML = `
      <div class="feedback ${d.correct ? 'ok' : 'no'}">
        <div class="row between"><b>${d.correct ? '✓ 拼写正确' : '✗ 拼写有误'}</b>
          <span class="tiny">漏写 ${d.miss} 个字母 · 多写/错序 ${d.extra} 处</span></div>
        <div class="char-diff" style="margin-top:6px">${d.html}</div>
        <div class="tiny" style="margin-top:6px">${esc(w.ph || '')} · ${esc((w.m || []).map(m => m.cn).join('；'))}</div>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn soft" onclick="Audio2.play('${audioUK(w)}','${jss(w.w)}')">🔊 再听一次</button>
        <button class="btn primary" style="flex:1" onclick="Vocab.nextQ()">继续 →</button>
      </div>`;
    $('#q-input').disabled = true;
  }

  function pickOption(el, id) {
    const q = quiz;
    const w = q.picks[q.idx];
    const ok = w.id === id;
    if (ok) q.right++; else q.wrong.push(w);
    Store.grade(w.id, ok ? 2 : 0, 'train');
    $$('#q-opts .option').forEach(o => {
      o.onclick = null;
      if (o.dataset.id === w.id) o.classList.add('right');
      else if (o === el) o.classList.add('wrong');
    });
    afterChoice(ok, w);
  }

  function pickMeaning(el) {
    const q = quiz;
    const w = q.picks[q.idx];
    const right = (w.m || []).map(m => m.cn).join('；');
    const ok = el.dataset.v === right;
    if (ok) q.right++; else q.wrong.push(w);
    Store.grade(w.id, ok ? 2 : 0, 'train');
    $$('#q-opts .option').forEach(o => {
      o.onclick = null;
      if (o.dataset.v === right) o.classList.add('right');
      else if (o === el) o.classList.add('wrong');
    });
    afterChoice(ok, w);
  }

  function pickRoot(el) {
    const q = quiz;
    const ok = el.dataset.id === q.rootAnswer;
    const w = q.picks[q.idx];
    if (ok) q.right++; else q.wrong.push(w);
    $$('#q-opts .option').forEach(o => {
      o.onclick = null;
      if (o.dataset.id === q.rootAnswer) o.classList.add('right');
      else if (o === el) o.classList.add('wrong');
    });
    const target = Store.byId[q.rootAnswer];
    $('#q-fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'no'}">
      ${ok ? '✓ 正确' : '✗ 正确答案是 ' + esc(target.w)}：${esc((target.root && target.root.logic) || '')}</div>
      <button class="btn primary block" style="margin-top:10px" onclick="Vocab.nextQ()">继续 →</button>`;
  }

  function afterChoice(ok, w) {
    $('#q-fb').innerHTML = `
      <div class="feedback ${ok ? 'ok' : 'no'}">
        <b>${ok ? '✓ 正确' : '✗ 正确答案：' + esc(w.w)}</b>
        <div class="tiny" style="margin-top:4px">${esc(w.ph || '')} · ${esc((w.m || []).map(m => m.cn).join('；'))}</div>
        ${w.root && w.root.logic ? `<div class="tiny" style="margin-top:4px;opacity:.85">${esc(w.root.logic)}</div>` : ''}
      </div>
      <button class="btn primary block" style="margin-top:10px" onclick="Vocab.nextQ()">继续 →</button>`;
  }

  function nextQ() { quiz.idx++; renderQuiz($('#view')); }

  /* ================= 词根图谱 ================= */
  function renderRoots(root) {
    const groups = Store.rootGroups();
    root.innerHTML = `
      <a class="back" href="#/vocab">← 返回</a>
      <h1>词根图谱</h1>
      <p class="muted" style="margin-bottom:14px">同一词根下的词共享底层含义。先理解一层，再记一串。</p>
      ${groups.map(g => `
        <div class="card">
          <div class="card-title"><h3>${esc(g.key)}</h3><span class="pill purple">${g.list.length} 词</span></div>
          <p class="muted tiny">${esc((g.list[0].root && g.list[0].root.logic) || '')}</p>
          <div class="chips">${g.list.map(w => `<span class="chip-word" href="#/vocab/w/${w.id}" onclick="location.hash='#/vocab/w/${w.id}'">${esc(w.w)}</span>`).join('')}</div>
        </div>`).join('') || '<div class="empty">暂无词根分组数据</div>'}`;
  }

  /* ================= 错词本 ================= */
  function renderMistakes(root) {
    const list = Store.stats().mistakes.map(r => Store.byId[r.word_id]).filter(Boolean);
    root.innerHTML = `
      <a class="back" href="#/vocab">← 返回</a>
      <h1>错词本</h1>
      <p class="muted" style="margin-bottom:14px">连续答对 3 次会自动移出。错误次数越多，排序越靠前。</p>
      ${list.length ? `
        <div class="card">
          <div class="card-title"><h3>${list.length} 个待攻克</h3>
            <button class="btn sm primary" onclick="Vocab.startStudy('mistakes')">开始攻克</button></div>
          ${list.map(w => {
            const r = Store.progress[w.id];
            return `<div class="wlist-item" onclick="location.hash='#/vocab/w/${w.id}'">
              <div class="wl-main"><div><span class="wl-w">${esc(w.w)}</span><span class="wl-ph">${esc(w.ph || '')}</span></div>
                <div class="wl-cn">${esc((w.m || []).map(m => m.cn).join('；'))}</div></div>
              <span class="pill red">错 ${r.wrong || 0} 次</span>
            </div>`;
          }).join('')}
        </div>` : '<div class="empty">还没有错词，保持住 ✌️</div>'}`;
  }

  return {
    render, setFilter, onSearch, star, startStudy, reveal, judge, detailFromStudy,
    renderDetail, findAndOpen, startTrain, trainOne, checkSpell, pickOption, pickMeaning,
    pickRoot, nextQ, renderQuiz,
  };
})();
