/* 素材出处：所有内容都标明来源，不冒充真题 / 不冒充他人的书 */
const Src = (() => {
  const S = {
    vocab: {
      label: '词库',
      short: '《雅思词汇真经》整理',
      detail: [
        '词表与章节：来自《雅思词汇真经》纸质书的扫描 PDF（335 页），共整理出 3632 词 / 22 章。',
        '本站补充：词根拆解、英文释义、雅思语境例句、美式音标为二次整理与编写，不来自原书。',
        '发音：TTS 合成（英音 en-GB / 美音 en-US），不是真人录音，也不是官方音频。',
      ],
    },
    listening: {
      label: '听力材料',
      short: '本站自编 · 非真题',
      detail: [
        '所有听力稿按雅思听力 Section 1（双人对话）与 Section 4（学术独白）的结构、语速、题眼逻辑自行编写，人物、数字、机构均为虚构。',
        '不是剑桥雅思真题，也不摘自任何商业题库；用它是为了练"抓信号词 + 同义替换"，而不是押题。',
        '音频由 TTS 合成，可按 0.9 / 1.0 倍速播放。',
      ],
    },
    essay: {
      label: '范文',
      short: '本站自编范文',
      detail: [
        '范文依据雅思官方公开的写作评分描述（Task Response / Coherence & Cohesion / Lexical Resource / Grammatical Range & Accuracy）逐段设计，用于演示结构与可迁移句型。',
        '题目参考公开高频话题改写，不是考场原题；范文不是官方满分文，也不代表考官给分。',
        'AI 批改与自评分数都是练习参考，不等于真实考试成绩。',
      ],
    },
    grammar: {
      label: '语法',
      short: '公开语法体系 + 本站例句',
      detail: [
        '按中国学生高频错点整理（时态、被动、定语从句、虚拟语气、主谓一致等），体系属于通用英语语法，非某本书独有。',
        '所有对比例句（✗ / ✓）为本站编写。',
      ],
    },
    guide: {
      label: '备考流程',
      short: '依据官方公开信息整理',
      detail: [
        '考试顺序、时长、答题卡规则、机考功能等依据雅思官方公开说明整理。',
        '具体规则（如口试安排、证件要求）以你报名考点和官网最新通知为准。',
      ],
    },
    daily: {
      label: '每日内容',
      short: '本站编写 · 人物虚构',
      detail: [
        '每日一句、励志短文、人物故事均为本站编写，故事里的人物与经历为虚构，不是真实案例。',
        '不引用名人原话，避免"张冠李戴"式的心灵鸡汤。',
      ],
    },
    phrases: {
      label: '写作词句',
      short: '本站整理 · 通用表达',
      detail: [
        '句式与替换词按功能分类整理，属于通用学术写作表达，不含任何机构的独家讲义内容。',
        '模板句请当作"骨架"，考场要换成自己题目里的具体名词和动词，整段照搬会被判模板化。',
      ],
    },
  };

  function get(kind) { return S[kind] || null; }

  /** 行内小标签：出处：xxx（点开看说明） */
  function pill(kind, extra) {
    const s = get(kind);
    if (!s) return '';
    return `<span class="src-tag" onclick="Src.explain('${kind}')" title="点击查看出处说明">出处 · ${esc(s.short)}${extra ? ' · ' + esc(extra) : ''}</span>`;
  }

  function explain(kind) {
    const s = get(kind);
    if (!s) return;
    UI.openModal(`<h2>${esc(s.label)}：内容从哪来</h2>
      <p class="muted tiny" style="margin:2px 0 12px">${esc(s.short)}</p>
      ${s.detail.map(d => `<p class="tiny" style="margin:0 0 9px;line-height:1.75">· ${esc(d)}</p>`).join('')}
      <p class="muted tiny" style="margin-top:12px">如果你发现哪一处引用不准确，可以在个人中心导出数据时一并告诉我，我来改。</p>`);
  }

  /** 备考页用的完整出处表 */
  function tableHTML() {
    return Object.entries(S).map(([k, s]) => `
      <div class="src-row">
        <div class="src-name">${esc(s.label)}<span class="src-short">${esc(s.short)}</span></div>
        <div class="src-detail">${s.detail.map(d => `<p>${esc(d)}</p>`).join('')}</div>
      </div>`).join('');
  }

  return { get, pill, explain, tableHTML, all: S };
})();
