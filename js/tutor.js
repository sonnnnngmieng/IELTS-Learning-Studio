/* 本地助教：不依赖网络与模型，基于词库与学习数据直接作答 */
const Tutor = (() => {
  const LINKERS = ['however', 'therefore', 'moreover', 'furthermore', 'in addition', 'for instance',
    'for example', 'on the other hand', 'as a result', 'consequently', 'nevertheless', 'in contrast',
    'firstly', 'secondly', 'finally', 'to conclude', 'in conclusion', 'admittedly', 'whereas', 'while'];

  const CHINGLISH = [
    { re: /with the development of (?:the )?society/gi, tip: '「with the development of society」是十几年前的模板开头，考官看到会减分。换成具体背景：In an era when remote work is becoming the norm, ...' },
    { re: /every coin has two sides/gi, tip: '「every coin has two sides」被用滥了，直接说 This view is one-sided, however, because ...' },
    { re: /more and more (people|students)/gi, tip: '「more and more people」口语化，写作里用 an increasing number of + 具体人群 更好。' },
    { re: /in a word/gi, tip: '结尾用 In conclusion / Overall 更正式，in a word 偏口语。' },
    { re: /as we all know/gi, tip: '「as we all know」是典型模板语，删掉直接陈述事实即可。' },
    { re: /can not/gi, tip: 'can not 应写作 cannot。' },
  ];

  /** 讲一个词：全部来自本地词库 */
  function explainWord(w) {
    if (!w) return '词库里没有这个词，可以换一个IELTS 核心词试试。';
    const m = (w.m || []).map(x => `${x.pos} ${x.cn}`).join('；');
    const root = w.mem || (w.root ? `${w.root.prefix || ''} + ${w.root.base || ''} + ${w.root.suffix || ''}：${w.root.logic || ''}` : '');
    const ex = (w.ex || []).map(x => `· ${x.en}\n  ${x.zh}`).join('\n');
    const fam = (w.fam || []).slice(0, 6).map(f => f.w || f).join(', ');
    const syn = (w.syn || []).slice(0, 5).join(', ');
    let out = `【${w.w}】${w.ph || ''}\n释义：${m || '（见词库详情）'}\n`;
    if (root) out += `记忆：${root}\n`;
    if (ex) out += `例句：\n${ex}\n`;
    if (syn) out += `近义：${syn}\n`;
    if (fam) out += `同族：${fam}\n`;
    out += `\n想更深入的话，去词汇页看它的完整卡片：#/vocab/w/${w.id}`;
    return out;
  }

  /** 从文本中挑出第一个英文词 */
  function findWord(text) {
    const words = String(text).toLowerCase().match(/[a-z][a-z'-]{2,}/g) || [];
    for (const raw of words) {
      const w = Store.byId[raw.replace(/'s$/, '')];
      if (w) return w;
    }
    return null;
  }

  /** 排今天的计划 */
  function planToday() {
    const stats = Store.stats();
    const tasks = Plan.generate(Store.state);
    if (!tasks.length) return '词库还在加载，稍后再来。';
    const p = Store.profile;
    let out = `按你现在的状态（目标 ${p.target_band} 分，每天 ${p.daily_minutes} 分钟）：
${tasks.map((t, i) => `${i + 1}. ${t.title}（约 ${t.est} 分钟）`).join('\n')}`;
    if (stats.overdue) out += `\n\n注意：有 ${stats.overdue} 个词的复习已经逾期，先清逾期再学新词，否则会越积越多。`;
    if (!stats.learned) out += '\n\n你还没学过词。建议现在就去「词汇 → 学新词」，从第 1 单元开始。';
    return out;
  }

  /** 错词复盘 */
  function mistakeReview() {
    const stats = Store.stats();
    if (!stats.mistakes.length) return '目前没有错词记录——要么你真的很稳，要么还没开始做题。去「听写」或「拼词闯关」练一轮，我再帮你复盘。';
    const top = stats.mistakes.slice(0, 5).map(r => {
      const w = Store.byId[r.word_id];
      if (!w) return null;
      return `· ${w.w}（错 ${r.wrong || 1} 次）——${w.mem ? w.mem.slice(0, 60) : (w.m || []).map(x => x.cn).join('；')}`;
    }).filter(Boolean);
    return `你现在有 ${stats.mistakes.length} 个错词，最顽固的 5 个：
${top.join('\n')}

复盘建议：
1. 每个错词用手在纸上默写 3 遍（输入 ≠ 输出，手写记忆更深）；
2. 说出词根含义给"空气听众"听，讲不出来就是没懂；
3. 今晚睡前和明早各过一遍，连续两天不错就会自动脱离错词本。`;
  }

  /** 数据速览 */
  function overview() {
    const stats = Store.stats();
    const today = Store.today || {};
    const p = Store.profile;
    const left = Store.examCountdown();
    return `当前进度一览：
· 词库 ${stats.total} 词，学过 ${stats.learned}，掌握 ${stats.mastered}，学习中 ${stats.learning}
· 待复习 ${stats.due}${stats.overdue ? `（逾期 ${stats.overdue}）` : ''}，错词 ${stats.mistakes.length}，生词本 ${stats.starred}
· 今日学习 ${Math.round((today.study_seconds || 0) / 60)} 分钟，新词 ${today.new_words || 0}，复习 ${today.reviews || 0}
${p.target_band ? `· 目标 ${p.target_band} 分${left != null && left >= 0 ? `，距考试 ${left} 天` : ''}` : '· 还没设置目标分数，去「学习计划」设置后我会按目标排任务'}`;
  }

  /** 批改作文（启发式诊断，非官方评分） */
  function reviewEssay(body, prompt) {
    const text = String(body || '').trim();
    if (!text) return '把作文正文贴进来（现在这里还是空的），我来按 Task Response / Coherence / Lexis / Grammar 四个维度给你做练习参考诊断。';
    const words = text.split(/\s+/).filter(Boolean);
    const sents = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const avgLen = sents.length ? Math.round(words.length / sents.length) : 0;
    const linkers = LINKERS.filter(l => new RegExp(`\\b${l.replace(/ /g, '\\s+')}\\b`, 'i').test(text));
    const longSents = sents.filter(s => s.split(/\s+/).length > 38).length;
    const paras = text.split(/\n\s*\n/).filter(p => p.trim().length > 20).length;
    const tips = CHINGLISH.filter(c => c.re.test(text)).map(c => '· ' + c.tip);
    const rep = {};
    words.forEach(w => { const k = w.toLowerCase().replace(/[^a-z]/g, ''); if (k.length > 4) rep[k] = (rep[k] || 0) + 1; });
    const overused = Object.entries(rep).filter(([, n]) => n >= 4).slice(0, 3);

    let out = `练习参考诊断（非官方评分）：
· 长度：${words.length} 词${words.length < 250 ? '，Task 2 不足 250 词会被直接扣分，先补到 260–280' : words.length > 340 ? '，偏长，注意别为了凑字数写水话' : '，合适'}
· 段落：${paras} 段${paras < 4 ? '，Task 2 建议 4 段：引言 + 主体×2 + 结论' : ''}
· 平均句长 ${avgLen} 词${avgLen < 12 ? '，句子偏短，试着用 which / while / -ing 结构合并两句' : avgLen > 28 ? '，句子偏长，长句多容易失控，长短交替才稳' : ''}
· 衔接词：${linkers.length ? '检测到 ' + linkers.slice(0, 5).join(' / ') : '没有检测到明显衔接词——连贯性是雅思写作四项之一，每段至少一个'}
${longSents ? `· ${longSents} 个句子超过 38 词，考官读起来很吃力，拆成两句更好\n` : ''}
${tips.length ? `模板语问题：\n${tips.join('\n')}\n` : ''}
${overused.length ? `重复偏多的词：${overused.map(([w, n]) => `${w}×${n}`).join('、')}——换同义表达（${overused.map(([w]) => { const s = Store.byId[w]; return s && s.syn && s.syn.length ? s.syn.slice(0, 2).join('/') : 'consider / regard / view（视语境）'; }).join('；')}）\n` : ''}
下一步：把最没把握的一段单独贴给我，我逐句帮你改。`;
    return out;
  }

  /** 口语润色建议（启发式） */
  function polishSpeaking(text) {
    if (!text || text.trim().length < 10) return '把你的口语回答贴进来（哪怕只是中文提纲也行），我会告诉你哪里最不自然、怎么改。';
    const sents = text.split(/[.!?。！？]+/).filter(Boolean);
    const fillers = (text.match(/\b(very|really|so|a lot of|things|good|bad)\b/gi) || []).length;
    let out = `口语表达初诊：
· 句子数 ${sents.length}。Part 2 要求说满 1.5–2 分钟，按每句 12 词算，你至少需要 8–10 句。${sents.length < 6 ? '目前偏少，按「场景 → 细节 → 感受」补足。' : '长度可以。'}`;
    if (fillers >= 3) out += `\n· very / really / good / things 这类空泛词出现 ${fillers} 次——全部换成具体细节：把 very good 换成 it saved me two hours a day 这种可感知的表达。`;
    out += `
· 提升自然度的三个动作：
  1) 每个要点后面加一句「为什么/举例」，才像说话不像背稿；
  2) 用 contractions：I'd / it's / don't——书面腔立刻消失；
  3) 每段开头用 well / actually / the thing is 缓冲，更接近母语节奏。
把你想让我逐句改的那段单独贴出来。`;
    return out;
  }

  /** 听力错因诊断 */
  function listeningDiagnose(text) {
    const sess = Store.eventsOf('listening', 10);
    let out = '';
    if (sess.length) {
      const avg = Math.round(sess.reduce((a, s) => a + (s.accuracy || 0), 0) / sess.length);
      out += `你最近 ${sess.length} 次精听平均正确率 ${avg}%。`;
    }
    out += `
听不懂通常只有三种原因，对号入座：
1. 词不认识 → 表现为「看到文本秒懂」。去词汇页把那一段的生词先过一遍再听。
2. 词认识但听不出 → 表现为「看文本认识、听是另一回事」。这是连读弱读问题：打开那句话的慢速播放，跟读 5 遍再常速听。
3. 跟不上语速 → 表现为「每个词都懂，合起来没反应过来」。做影子跟读（放一句跟一句），练 3 天明显改善。
把你听不懂的那句话贴给我，我帮你判断属于哪一种。`;
    if (text && text.trim()) out += `\n\n你描述的问题「${text.trim().slice(0, 80)}」——如果你看着文本能懂、纯听不懂，就是第 2 类，优先做跟读。`;
    return out;
  }

  /** 兜底回答 */
  function fallback(text) {
    const w = findWord(text);
    if (w) return `看起来你在问「${w.w}」：\n\n${explainWord(w)}\n\n（这是本地词库的自动识别。想要更自由的问答，等 AI 服务可用后再试。）`;
    return `我先按通用思路帮你拆解：「${(text || '').slice(0, 60)}」这类问题，通常分三步处理——
1. 明确它考什么（词汇 / 语法 / 思路 / 语音，是哪一类）；
2. 用最小练习验证（一个词、一句话、一组题）；
3. 复盘错在哪，把错因记到对应模块。
告诉我更具体的情况（比如哪句话、哪个词、哪种题型），我给更准的建议。`;
  }

  /** 根据消息文本自动路由（离线模式的智能分发） */
  function answer(text) {
    const t = String(text || '').trim();
    const low = t.toLowerCase();
    // 贴了作文（长英文文本）
    const enWords = (low.match(/[a-z]+/g) || []).length;
    if (enWords > 60) return reviewEssay(t);
    if (/(批改|改作文|诊断.*作文|评分)/.test(t)) {
      const m = t.split(/\n/).filter(Boolean);
      return reviewEssay(m.slice(1).join('\n'), m[0]);
    }
    if (/(听力|听不懂|精听|听写)/.test(t)) return listeningDiagnose(t);
    if (/(口语|润色|part ?2|话题卡)/i.test(t)) return polishSpeaking(t.replace(/^.*?[:：]/, ''));
    if (/(计划|安排|今天学|时间表)/.test(t)) return planToday();
    if (/(错词|复盘|记不住|忘记)/.test(t)) return mistakeReview();
    if (/(进度|数据|学了|掌握)/.test(t)) return overview();
    if (enWords >= 1 && enWords <= 20 && /[a-z]/.test(low) && !/[\u4e00-\u9fa5]/.test(low.replace(/释义|词根/g, ''))) {
      const w = findWord(t);
      if (w) return explainWord(w);
    }
    return fallback(t);
  }

  return { answer, explainWord, planToday, mistakeReview, overview, reviewEssay, polishSpeaking, listeningDiagnose, findWord };
})();
