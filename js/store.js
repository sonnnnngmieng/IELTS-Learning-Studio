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
    hi5: { last: null, total: 0, days: {} }, // 每日击掌：last=今天，total=累计次数，days=每日明细
    savedAt: null,
    persistError: false,
  };

  /* ---------- 本地持久化 ---------- */
  const DATA_V = 2;              // 数据结构版本：升级只做合并，永不整体覆盖
  const BACKUP_KEY = 'wb_ielts_backup';

  /** 版本迁移：只补字段 / 修类型，绝不删已有数据 */
  function migrate(d) {
    const out = { ...d };
    out.progress = d.progress && typeof d.progress === 'object' ? d.progress : {};
    out.stats = d.stats && typeof d.stats === 'object' ? d.stats : {};
    out.tasks = d.tasks && typeof d.tasks === 'object' ? d.tasks : {};
    out.events = Array.isArray(d.events) ? d.events : [];
    out.profile = { target_band: 6.5, exam_date: null, daily_minutes: 60, ...(d.profile || {}) };
    out.settings = { daily_new: 15, accent: 'en-GB', ...(d.settings || {}) };
    out.hi5 = { last: null, total: 0, ...(d.hi5 || {}) };
    // 旧版本没有每日明细：按 last 补一条，历史击掌次数不会丢
    if (!out.hi5.days || typeof out.hi5.days !== 'object') {
      out.hi5.days = {};
      if (out.hi5.last) out.hi5.days[out.hi5.last] = Math.max(1, Number(out.hi5.total) || 1);
    }
    // 类型兜底：旧版本可能存成字符串
    out.profile.target_band = Number(out.profile.target_band) || 6.5;
    out.profile.daily_minutes = Number(out.profile.daily_minutes) || 60;
    out.settings.daily_new = Math.min(100, Math.max(1, Number(out.settings.daily_new) || 15));
    return out;
  }

  /** 每天留一份滚动备份，升级 / 误操作都能退回去 */
  function rollingBackup(raw) {
    try {
      const prev = localStorage.getItem(BACKUP_KEY);
      const prevDay = prev ? (JSON.parse(prev).backup_day || '') : '';
      if (prevDay === todayStr()) return;
      localStorage.setItem(BACKUP_KEY, JSON.stringify({
        backup_day: todayStr(),
        data_v: DATA_V,
        payload: raw,
      }));
    } catch (e) { console.warn('滚动备份失败（可能是空间不足）', e); }
  }

  function loadLS() {
    // 只在启动时读一次：之后内存就是唯一真相。
    // 以前每次渲染都重读，会把刚改完还没落盘的设置/进度冲掉（目标分总是跳回 6.5 就是这个原因）。
    if (state.ready) return;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) { state.ready = true; return; }
      rollingBackup(raw);
      const d = migrate(JSON.parse(raw));
      state.progress = d.progress;
      state.profile = d.profile;
      state.settings = d.settings;
      state.stats = d.stats;
      state.tasks = d.tasks;
      state.events = d.events;
      state.hi5 = d.hi5;
      state.savedAt = d.saved_at || null;
      if (Number(d.v) !== DATA_V) persist(true);   // 老数据就地升级到新结构
    } catch (e) {
      // 数据损坏时先留个备份，避免下一次保存把它彻底覆盖掉
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) localStorage.setItem(KEY + '_broken', raw.slice(0, 200000));
      } catch (e2) { /* 忽略 */ }
      console.warn('本地数据读取失败，已备份到 ' + KEY + '_broken', e);
    }
    state.ready = true;
  }

  /** 从昨天的备份恢复（只在新版本出问题时用） */
  function restoreBackup() {
    try {
      const b = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null');
      if (!b || !b.payload) throw new Error('没有可用备份');
      const d = migrate(JSON.parse(b.payload));
      state.progress = d.progress;
      state.profile = d.profile;
      state.settings = d.settings;
      state.stats = d.stats;
      state.tasks = d.tasks;
      state.events = d.events;
      state.hi5 = d.hi5;
      persist(true);
      return b.backup_day || '上次备份';
    } catch (e) { throw e; }
  }

  function backupInfo() {
    try {
      const b = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null');
      return b ? { day: b.backup_day || null, bytes: (b.payload || '').length } : null;
    } catch (e) { return null; }
  }

  let saveTimer = null;

  function snapshot(int) {
    const slim = int === 'slim';
    const day = todayStr();
    return {
      v: DATA_V,
      progress: state.progress,
      profile: state.profile,
      settings: state.settings,
      stats: state.stats,
      tasks: slim ? (state.tasks[day] ? { [day]: state.tasks[day] } : {}) : state.tasks,
      events: (state.events || []).slice(slim ? -200 : -800),
      hi5: state.hi5,
      saved_at: new Date().toISOString(),
    };
  }

  /** 立刻写盘：关键操作（保存目标、打卡、记录）都走这里，不等防抖 */
  function writeNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshot()));
      state.savedAt = new Date().toISOString();
      state.persistError = false;
      return true;
    } catch (e) {
      // 存储配额满：先瘦身（只留今天的任务、最近 200 条记录）再试一次
      try {
        localStorage.setItem(KEY, JSON.stringify(snapshot('slim')));
        state.savedAt = new Date().toISOString();
        state.persistError = false;
        console.warn('本地存储接近上限，已压缩历史数据', e);
        return true;
      } catch (e2) {
        state.persistError = true;
        console.warn('本地保存失败', e2);
        return false;
      }
    }
  }

  /** immediate=true 立刻落盘；否则 120ms 合并写入 */
  function persist(immediate) {
    if (immediate) return writeNow();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 120);
  }

  // 关页面 / 切到后台时，把还没落盘的改动写完
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pagehide', writeNow);
    window.addEventListener('beforeunload', writeNow);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') writeNow();
    });
  }


  /* 导出 / 导入（代替云端同步） */
  function exportData() {
    const blob = new Blob([JSON.stringify({
      app: 'IELTS-Learning-Studio', version: 2, exported_at: new Date().toISOString(),
      progress: state.progress, profile: state.profile, settings: state.settings,
      stats: state.stats, tasks: state.tasks, events: (state.events || []).slice(-800),
      hi5: state.hi5,
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
    if (d.hi5) state.hi5 = { ...state.hi5, ...d.hi5 };
    persist(true);
  }

  /* ---------- 本地练习记录（听力精听 / 写作笔记 / 口语录音等） ---------- */
  function addEvent(kind, payload) {
    state.events = state.events || [];
    state.events.push({ kind, day: todayStr(), ts: new Date().toISOString(), ...(payload || {}) });
    if (state.events.length > 800) state.events = state.events.slice(-800);
    persist(true);
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
    state.hi5 = { last: null, total: 0, days: {} };
    persist(true);
  }

  /* ---------- 每日击掌 ---------- */
  function hi5DoneToday() {
    return state.hi5 && state.hi5.last === todayStr();
  }

  /** 击掌：每点一次都计数（可重复点击），同时记录当天明细 */
  function markHi5() {
    const day = todayStr();
    const days = { ...(state.hi5 && state.hi5.days ? state.hi5.days : {}) };
    days[day] = (Number(days[day]) || 0) + 1;
    state.hi5 = {
      last: day,
      total: (state.hi5 && state.hi5.total ? state.hi5.total : 0) + 1,
      total_days: Object.keys(days).length,
      days,
    };
    persist(true);
    return state.hi5;
  }

  /** 今日击掌次数 */
  function hi5Today() {
    const d = (state.hi5 && state.hi5.days) || {};
    return Number(d[todayStr()]) || 0;
  }

  /** 打卡天数 / 连续天数 */
  function hi5Stats() {
    const days = (state.hi5 && state.hi5.days) || {};
    const keys = Object.keys(days).filter(k => Number(days[k]) > 0).sort();
    let streak = 0;
    const d = new Date();
    if (!days[todayStr()]) d.setDate(d.getDate() - 1);   // 今天还没点，从昨天往前数
    while (days[todayStr(d)]) { streak++; d.setDate(d.getDate() - 1); }
    return {
      total: (state.hi5 && state.hi5.total) || 0,
      today: Number(days[todayStr()]) || 0,
      days: keys.length,
      streak,
      map: days,
    };
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
    persist(true);       // 目标分这类设置立刻落盘，避免刷新后回到默认值
  }

  function saveSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    persist(true);
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
    persist(true);
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
    persist(true);
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
    persist(true);
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
    hi5DoneToday, markHi5, hi5Today, hi5Stats, flush: writeNow, restoreBackup, backupInfo,
    get words() { return state.words || []; },
    get byId() { return state.byId; },
    get progress() { return state.progress; },
    get profile() { return state.profile; },
    get settings() { return state.settings; },
    get today() { return todayStat(); },
    get tasks() { return loadTasks(); },
    get savedAt() { return state.savedAt; },
    get hi5() { return state.hi5; },
  };
})();
