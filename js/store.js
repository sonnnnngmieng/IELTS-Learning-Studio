/* 数据层：词库加载 / SRS 间隔复习 / 今日任务 / 学习统计
   全部数据保存在浏览器 localStorage，无需登录。 */
const Store = (() => {
  const STEPS = [1, 2, 4, 7, 14, 30, 60]; // 天
  const KEY = 'wb_ielts_v1';

  const state = {
    words: null,
    byId: {},
    progress: {},      // word_id -> row
    profile: { target_band: 6.5, exam_date: null, daily_minutes: 60 },
    settings: { daily_new: 15, accent: 'en-GB' },
    stats: {},         // day -> {study_seconds, correct, wrong, reviews, new_words}
    tasks: {},         // day -> [task]
    ready: false,
    events: [],        // 本地练习记录 {kind, day, ts, ...payload}
  };

  /* ---------- 本地持久化 ---------- */
  function loadLS() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) { state.ready = true; return; }
      const d = JSON.parse(raw);
      state.progress = d.progress || {};
      if (d.profile) state.profile = { ...state.profile, ...d.profile };
      if (d.settings) state.settings = { ...state.settings, ...d.settings };
      state.stats = d.stats || {};
      state.tasks = d.tasks || {};
      state.events = d.events || [];
    } catch (e) { console.warn('本地数据读取失败，使用全新数据', e); }
    state.ready = true;
  }

  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          progress: state.progress,
          profile: state.profile,
          settings: state.settings,
          stats: state.stats,
          tasks: state.tasks,
          events: (state.events || []).slice(-800),
          saved_at: new Date().toISOString(),
        }));
      } catch (e) { console.warn('本地保存失败', e); }
    }, 120);
  }

  /* 导出 / 导入（代替云端同步） */
  function exportData() {
    const blob = new Blob([JSON.stringify({
      app: 'IELTS-Learning-Studio', version: 1, exported_at: new Date().toISOString(),
      progress: state.progress, profile: state.profile, settings: state.settings,
      stats: state.stats, tasks: state.tasks, events: (state.events || []).slice(-800),
    }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ielts-backup-${todayStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  async function importData(file) {
    const text = await file.text();
    const d = JSON.parse(text);
    if (!d || !d.progress) throw new Error('不是本应用的备份文件');
    state.progress = d.progress || {};
    if (d.profile) state.profile = { ...state.profile, ...d.profile };
    if (d.settings) state.settings = { ...state.settings, ...d.settings };
    state.stats = d.stats || {};
    state.tasks = d.tasks || {};
    state.events = d.events || [];
    persist();
  }

  /* ---------- 本地练习记录（听力精听 / 写作笔记 / 口语录音等） ---------- */
  function addEvent(kind, payload) {
    state.events = state.events || [];
    state.events.push({ kind, day: todayStr(), ts: new Date().toISOString(), ...(payload || {}) });
    if (state.events.length > 800) state.events = state.events.slice(-800);
    persist();
  }

  function eventsOf(kind, limit) {
    const list = (state.events || []).filter(e => e.kind === kind).reverse();
    return limit ? list.slice(0, limit) : list;
  }

  function resetData() {
    localStorage.removeItem(KEY);
    state.progress = {};
    state.stats = {};
    state.tasks = {};
    state.events = [];
    state.profile = { target_band: 6.5, exam_date: null, daily_minutes: 60 };
    state.settings = { daily_new: 15, accent: 'en-GB' };
    persist();
  }

  /* ---------- 词库 ---------- */
  async function loadWords() {
    if (state.words) return state.words;
    const data = await fetch('data/words.json').then(r => r.json());
    let enrich = {};
    try {
      const parts = await Promise.all(['A', 'B', 'C', 'D'].map(k =>
        fetch(`data/enrich_${k}.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({}))));
      parts.forEach(p => Object.assign(enrich, p));
    } catch (e) { /* 补充数据缺失时降级为基础字段 */ }
    state.words = data.words.map(w => {
      const e = enrich[w.id] || {};
      const merged = {
        ...w,
        us: e.us || '',
        def_en: e.def_en || '',
        root: e.root || null,
        ex2: e.ex2 || null,
        syn: e.syn || [],
        ant: e.ant || [],
        fam: e.fam || w.der || [],
        use: e.use || '',
      };
      merged.rootKey = rootKeyOf(merged);
      return merged;
    });
    state.words.forEach(w => { state.byId[w.id] = w; });
    state.chapters = data.chapters;
    return state.words;
  }

  function rootKeyOf(w) {
    if (!w.root || !w.root.base) return null;
    const m = String(w.root.base).match(/^[a-zA-Z-]{2,}/);
    return m ? m[0].toLowerCase().replace(/-$/, '') : null;
  }

  function rootGroups() {
    const map = {};
    state.words.forEach(w => {
      if (!w.rootKey) return;
      (map[w.rootKey] = map[w.rootKey] || []).push(w);
    });
    return Object.entries(map)
      .filter(([, list]) => list.length >= 3)
      .map(([key, list]) => ({ key, list }))
      .sort((a, b) => b.list.length - a.list.length);
  }

  /* ---------- 用户数据（本地） ---------- */
  async function loadUser() {
    loadLS();
    return true;
  }

  function saveProfile(patch) {
    state.profile = { ...state.profile, ...patch };
    persist();
  }

  function saveSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    persist();
  }

  /* ---------- SRS ---------- */
  function schedule(row, grade, now) {
    now = now || new Date();
    const r = row ? { ...row } : {
      box: 0, ease: 2.5, interval_days: 0, due_at: null, reps: 0, lapses: 0,
      correct: 0, wrong: 0, starred: false, streak_correct: 0, mistake: false, source: 'book',
      first_seen: now.toISOString(),
    };
    if (grade === 0) {
      r.box = 0;
      r.interval_days = 0;
      r.due_at = new Date(now.getTime() + 8 * 60 * 1000).toISOString();
      r.lapses = (r.lapses || 0) + 1;
      r.wrong = (r.wrong || 0) + 1;
      r.streak_correct = 0;
      r.mistake = true;
    } else if (grade === 1) {
      r.interval_days = Math.max(0.5, (r.interval_days || 0.5) * 1.4);
      r.due_at = new Date(now.getTime() + r.interval_days * 86400000).toISOString();
      r.streak_correct = 0;
    } else {
      r.box = Math.min((r.box || 0) + 1, STEPS.length + 1);
      r.interval_days = STEPS[Math.min(r.box - 1, STEPS.length - 1)];
      r.ease = Math.min(3.2, (r.ease || 2.5) + 0.06);
      r.due_at = new Date(now.getTime() + r.interval_days * 86400000).toISOString();
      r.correct = (r.correct || 0) + 1;
      r.streak_correct = (r.streak_correct || 0) + 1;
      if (r.streak_correct >= 3) r.mistake = false;
    }
    r.reps = (r.reps || 0) + 1;
    r.last_review = now.toISOString();
    return r;
  }

  function grade(wordId, g, source) {
    const row = schedule(state.progress[wordId], g);
    row.word_id = wordId;
    if (source) row.source = source;
    state.progress[wordId] = row;
    // 本地统计
    trackStudy(6);
    flushStats(g === 2 ? 'correct' : g === 0 ? 'wrong' : null);
    return row;
  }

  function toggleStar(wordId, word) {
    const row = state.progress[wordId] || {
      box: 0, ease: 2.5, interval_days: 0, due_at: null, reps: 0, lapses: 0, correct: 0,
      wrong: 0, streak_correct: 0, mistake: false, source: 'book',
      first_seen: new Date().toISOString(),
    };
    row.starred = !row.starred;
    row.word_id = wordId;
    if (word) row.source = word.source || 'book';
    state.progress[wordId] = row;
    persist();
    return row.starred;
  }

  /* ---------- 每日统计 ---------- */
  let pendingSeconds = 0;
  let statsTimer = null;
  function trackStudy(seconds) {
    pendingSeconds += seconds;
    if (statsTimer) return;
    statsTimer = setTimeout(() => { flushStats(); }, 5000);
  }

  function dayStat(day) {
    if (!state.stats[day]) state.stats[day] = { study_seconds: 0, correct: 0, wrong: 0, reviews: 0, new_words: 0 };
    return state.stats[day];
  }

  function flushStats(kind) {
    const secs = Math.min(pendingSeconds, 3600);
    pendingSeconds = 0;
    const s = dayStat(todayStr());
    if (secs) s.study_seconds = (s.study_seconds || 0) + secs;
    if (kind === 'correct') s.correct = (s.correct || 0) + 1;
    if (kind === 'wrong') s.wrong = (s.wrong || 0) + 1;
    if (kind === 'review') s.reviews = (s.reviews || 0) + 1;
    persist();
  }

  function addNewWords(n) {
    if (!n) return;
    const s = dayStat(todayStr());
    s.new_words = (s.new_words || 0) + n;
    persist();
  }

  function todayStat() { return state.stats[todayStr()] || null; }

  /* ---------- 任务 ---------- */
  function loadTasks() {
    const day = todayStr();
    if (!state.tasks[day]) {
      const generated = Plan.generate(state);
      if (generated.length) {
        state.tasks[day] = generated.map((t, i) => ({
          id: `${day}-${t.key}-${i}`,
          day, task_key: t.key, title: t.title, module: t.module,
          est_min: t.est, status: 'todo', payload: JSON.stringify(t.payload || {}),
        }));
        persist();
      }
    }
    return state.tasks[day] || [];
  }

  function safeJSON(s) { try { return s ? JSON.parse(s) : {}; } catch (e) { return {}; } }

  function toggleTask(task, done) {
    task.status = done ? 'done' : 'todo';
    persist();
  }

  /* ---------- 队列与统计 ---------- */
  function dueWords() {
    const now = new Date();
    return Object.values(state.progress)
      .filter(r => r.due_at && new Date(r.due_at) <= now && (r.box || 0) < STEPS.length + 1)
      .map(r => state.byId[r.word_id])
      .filter(Boolean);
  }

  function overdueWords() {
    const now = new Date();
    return Object.values(state.progress)
      .filter(r => r.due_at && new Date(r.due_at) <= now && (new Date(now) - new Date(r.due_at)) > 86400000)
      .map(r => state.byId[r.word_id]).filter(Boolean);
  }

  function newWords(limit) {
    const known = new Set(Object.keys(state.progress));
    return state.words.filter(w => !known.has(w.id)).slice(0, limit || 15);
  }

  function stats() {
    const rows = Object.values(state.progress);
    return {
      total: state.words ? state.words.length : 0,
      learned: rows.filter(r => (r.reps || 0) > 0).length,
      mastered: rows.filter(r => (r.box || 0) >= 5).length,
      learning: rows.filter(r => (r.reps || 0) > 0 && (r.box || 0) < 5).length,
      starred: rows.filter(r => r.starred).length,
      mistakes: rows.filter(r => r.mistake).sort((a, b) => (b.wrong || 0) - (a.wrong || 0)),
      due: dueWords().length,
      overdue: overdueWords().length,
    };
  }

  function history(days) {
    const out = [];
    const keys = Object.keys(state.stats).sort().reverse().slice(0, days || 30);
    keys.forEach(k => out.push({ day: k, ...state.stats[k] }));
    return out;
  }

  function streak(rows) {
    const set = new Set(rows.filter(r => (r.reviews || 0) + (r.new_words || 0) + (r.study_seconds || 0) > 60).map(r => r.day));
    let s = 0;
    const d = new Date();
    if (!set.has(todayStr(d))) d.setDate(d.getDate() - 1);
    while (set.has(todayStr(d))) { s++; d.setDate(d.getDate() - 1); }
    return s;
  }

  function examCountdown() {
    if (!state.profile.exam_date) return null;
    const left = daysBetween(todayStr(), state.profile.exam_date);
    return left;
  }

  return {
    state, loadWords, loadUser, loadTasks, saveProfile, saveSettings, grade, toggleStar,
    trackStudy, flushStats, addNewWords, toggleTask, dueWords, overdueWords, newWords,
    stats, history, streak, examCountdown, rootGroups, schedule, safeJSON,
    exportData, importData, resetData, todayStat, addEvent, eventsOf,
    get words() { return state.words || []; },
    get byId() { return state.byId; },
    get progress() { return state.progress; },
    get profile() { return state.profile; },
    get settings() { return state.settings; },
    get today() { return todayStat(); },
    get tasks() { return loadTasks(); },
  };
})();
