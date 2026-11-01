/* AI 学习助手：作文批改 / 表达润色 / 单词讲解 / 错因复盘 / 自由问答 */
const AI = (() => {
  let history = [];      // {role, content}
  let pending = false;
  let preset = null;

  const SYSTEM = `你是中国雅思考生的学习助手，服务对象目标是 7 分以上。
规则：
1. 全部用中文讲解，英文例句保留原文。
2. 给建议时必须具体：指出是哪一句、哪个词、改成什么，并说明为什么。禁止只说"多练习""注意语法"这类空话。
3. 涉及雅思评分时，明确说明这是"练习参考诊断"，不是官方评分。
4. 不编造数据、不虚构真题来源；不确定的内容直接说不确定。
5. 回答控制在 400 字以内，多用短段落或列表。`;

  const PRESETS = [
    { key: 'essay', label: '批改我的作文', tip: '把作文贴在下面，或在写作页点「AI 批改」' },
    { key: 'word', label: '讲一个词', tip: '写一个单词，我讲词根、搭配和雅思用法' },
    { key: 'speak', label: '润色我的口语答案', tip: '贴你的回答，我给出更自然的版本' },
    { key: 'diagnose', label: '分析我的听力错因', tip: '说说你听不懂的句子或题型' },
    { key: 'plan', label: '帮我排今天的学习', tip: '告诉我你现在的时间和薄弱项' },
  ];

  async function render(root) {
    if (!Cloud.user) {
      root.innerHTML = `<h1>AI 学习助手</h1>
        <div class="card center" style="padding:34px 18px">
          <p class="muted">AI 助手需要登录后使用（模型调用由平台提供，无需自备 Key）。</p>
          <button class="btn primary" onclick="UI.showLogin()">登录 / 注册</button></div>`;
      return;
    }
    root.innerHTML = `
      <h1>AI 学习助手</h1>
      <p class="muted" style="margin-bottom:12px">批改、讲解、复盘都可以。它给的是练习参考，不是官方评分。</p>
      <div class="chips" style="margin-bottom:10px">
        ${PRESETS.map(p => `<span class="chip" onclick="AI.usePreset('${p.key}')" title="${esc(p.tip)}">${esc(p.label)}</span>`).join('')}
      </div>
      <div class="ai-wrap">
        <div class="ai-log" id="ai-log"></div>
        <div class="ai-input">
          <textarea id="ai-input" rows="1" placeholder="问点什么，或把作文 / 句子贴进来…（Enter 发送，Shift+Enter 换行）"></textarea>
          <button class="btn primary" id="ai-send" onclick="AI.send()">发送</button>
        </div>
      </div>`;
    paintLog();
    const ta = $('#ai-input');
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); AI.send(); }
    });
    if (preset) { ta.value = preset; preset = null; ta.focus(); }
  }

  function paintLog() {
    const log = $('#ai-log');
    if (!log) return;
    if (!history.length) {
      log.innerHTML = `<div class="msg ai"><span class="who">AI</span>
        <div class="text">你好，我可以帮你做这些事：
· 批改一篇 Task 2，指出扣分点和具体改法
· 讲清一个词的词根、搭配和雅思用法
· 把口语答案改得更自然（不是换成更难的词）
· 听你描述听不懂的句子，判断是词汇、连读还是理解问题

想从哪一项开始？</div></div>`;
      return;
    }
    log.innerHTML = history.map(m => `<div class="msg ${m.role === 'user' ? 'user' : 'ai'}">
      <span class="who">${m.role === 'user' ? '我' : 'AI'}</span>
      <div class="text">${esc(m.content)}</div></div>`).join('');
    log.scrollTop = log.scrollHeight;
  }

  function usePreset(key) {
    const p = PRESETS.find(x => x.key === key);
    if (!p) return;
    const ta = $('#ai-input');
    if (!ta) return;
    const map = {
      essay: '请帮我批改下面这篇 Task 2 作文。请按「任务回应 / 连贯衔接 / 词汇资源 / 语法多样性与准确性」四方面给诊断，指出最影响分数的 3 个问题，并给出一句改后的示范。\n\n题目：\n\n我的作文：\n',
      word: '请讲一下这个词：',
      speak: '请润色我的口语回答，保留我原本的意思，改成更自然、更像母语者的表达，并说明改了什么。原答案：\n',
      diagnose: '我听力有这样的问题：',
      plan: '帮我安排今天的学习。我的情况：',
    };
    ta.value = map[key] || '';
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  async function send() {
    if (pending) return;
    const ta = $('#ai-input');
    const text = (ta.value || '').trim();
    if (!text) return;
    ta.value = '';
    history.push({ role: 'user', content: text });
    paintLog();
    await run();
  }

  async function run() {
    pending = true;
    const log = $('#ai-log');
    const holder = document.createElement('div');
    holder.className = 'msg ai';
    holder.innerHTML = `<span class="who">AI</span><div class="text" id="ai-stream">…</div>`;
    log.appendChild(holder);
    log.scrollTop = log.scrollHeight;
    const box = holder.querySelector('#ai-stream');
    let full = '';
    try {
      const messages = history.slice(-8).map(m => ({ role: m.role, content: m.content }));
      full = await Cloud.chat(messages, {
        system: SYSTEM,
        onDelta: (d, all) => { box.textContent = all; log.scrollTop = log.scrollHeight; },
      });
      history.push({ role: 'assistant', content: full });
    } catch (e) {
      box.textContent = '出错了：' + (e.message || '请稍后重试');
      history.pop();
    }
    pending = false;
    paintLog();
  }

  /** 快捷入口：讲一个词 */
  async function explainWord(id) {
    await Store.loadWords();
    const w = Store.byId[id];
    if (!w) return;
    location.hash = '#/ai';
    setTimeout(() => {
      const ta = $('#ai-input');
      if (!ta) return;
      ta.value = `请讲一下 ${w.w} ${w.ph || ''}。它的释义是 ${(w.m || []).map(m => m.cn).join('；')}。`
        + `请说明：① 词根词缀构成和记忆逻辑 ② 两个雅思场景的搭配 ③ 一个容易和它混淆的词及区别。`;
      ta.focus();
    }, 200);
  }

  /** 快捷入口：批改写作页文本 */
  async function reviewText(prompt, body) {
    location.hash = '#/ai';
    setTimeout(() => {
      const ta = $('#ai-input');
      if (!ta) return;
      ta.value = `请帮我批改这篇雅思作文。\n\n题目：${prompt || '（未提供）'}\n\n正文：\n${body}`;
      ta.focus();
      UI.toast('已带入 AI 助手，点发送即可批改');
    }, 220);
  }

  /** 范文页：批改我的版本 */
  async function reviewEssay(index) {
    let prompt = '';
    try {
      const d = await fetch('data/writing.json').then(r => r.json());
      prompt = (d.model_essays[index] || {}).prompt || '';
    } catch (e) {}
    location.hash = '#/ai';
    setTimeout(() => {
      const ta = $('#ai-input');
      if (!ta) return;
      ta.value = `我想照着这篇范文的结构写一篇。题目是：${prompt}\n\n请先帮我列一个四段提纲（每段主题句怎么写），再提醒我三个最容易踩的坑。`;
      ta.focus();
    }, 220);
  }

  /** 口语：润色表达 */
  async function polishSpeaking(i) {
    let sample = '', title = '';
    try {
      const d = await fetch('data/speaking.json').then(r => r.json());
      const c = d.part2[i] || {};
      title = c.title || '';
      sample = c.sample || '';
    } catch (e) {}
    location.hash = '#/ai';
    setTimeout(() => {
      const ta = $('#ai-input');
      if (!ta) return;
      ta.value = `口语 Part 2 题目：${title}\n\n这是我的答案（先贴在这里替换）：\n\n\n`
        + `请参考这个思路：${sample.slice(0, 200)}...\n请指出我的表达里哪 3 处最不自然，并给出更地道的说法。`;
      ta.focus();
    }, 220);
  }

  function askPreset(kind) {
    if (kind === '复盘') {
      location.hash = '#/ai';
      setTimeout(() => {
        const ta = $('#ai-input');
        if (!ta) return;
        ta.value = '帮我复盘今天：请给我 3 个问题，检查我今天的单词是否真的记住了（用英文提问，我用中文回答也可以）。';
        ta.focus();
      }, 220);
    }
  }

  return { render, send, usePreset, explainWord, reviewText, reviewEssay, polishSpeaking, askPreset };
})();
