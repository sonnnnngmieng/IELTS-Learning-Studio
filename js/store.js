/* 数据层：词库加载 / SRS 间隔复习 / 今日任务 / 学习统计 */
const Store = (() => {
  const STEPS = [1, 2, 4, 7, 14, 30, 60]; // 天

  const state = {
    words: null,
    byId: {},
    progress: {},      // word_id -> row
    profile: { target_band: 6.5, exam_date: null, daily_minutes: 60 },
    settings: { daily_new: 15, accent: 'en-GB' },
    today: null,       // daily_stats row
    tasks: [],
    ready: false,
  };

  function needLogin() {
    if (!Cloud.user) { UI.showLogin(); return true; }
    return false;
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

  /* ---------- 用户数据 ---------- */
  async function loadUser() {
    if (!Cloud.user) { state.ready = false; return; }
    const db = Cloud.client.database;
    const [pr, pf, st, ds] = await Promise.all([
      db.from('word_progress').select('*'),
      db.from('user_profile').select('*').limit(1).maybeSingle(),
      db.from('user_settings').select('*').limit(1).maybeSingle(),
      db.from('daily_stats').select('*').eq('day', todayStr()).maybeSingle(),
    ]);
    state.progress = {};
    (pr.data || []).forEach(r => { state.progress[r.word_id] = r; });
    if (pf.data) state.profile = { target_band: pf.data.target_band, exam_date: pf.data.exam_date, daily_minutes: pf.data.daily_minutes };
    if (st.data) state.settings = { daily_new: st.data.daily_new, accent: st.data.accent };
    state.today = ds.data || null;
    state.ready = true;
  }

  async function saveProfile(patch) {
    state.profile = { ...state.profile, ...patch };
    if (needLogin()) return;
    const db = Cloud.client.database;
    const ex = await db.from('user_profile').select('id').limit(1).maybeSingle();
    if (ex.data) await db.from('user_profile').update(state.profile).eq('id', ex.data.id);
    else await db.from('user_profile').insert(state.profile);
  }

  async function saveSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    if (needLogin()) return;
    const db = Cloud.client.database;
    const ex = await db.from('user_settings').select('id').limit(1).maybeSingle();
    if (ex.data) await db.from('user_settings').update(state.settings).eq('id', ex.data.id);
    else await db.from('user_settings').insert(state.settings);
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

  async function grade(wordId, g, source) {
    const row = schedule(state.progress[wordId], g);
    row.word_id = wordId;
    if (source) row.source = source;
    state.progress[wordId] = row;
    // 本地统计
    trackStudy(6);
    await flushStats(g === 2 ? 'correct' : g === 0 ? 'wrong' : null);
    if (!Cloud.user) return row;
    const db = Cloud.client.database;
    const payload = {
      word_id: wordId, box: row.box, ease: row.ease, interval_days: row.interval_days,
      due_at: row.due_at, reps: row.reps, lapses: row.lapses, correct: row.correct,
      wrong: row.wrong, starred: row.starred, streak_correct: row.streak_correct,
      mistake: row.mistake, source: row.source, last_review: row.last_review,
      first_seen: row.first_seen || new Date().toISOString(),
    };
    const res = await db.from('word_progress').upsert(payload, { onConflict: 'owner_id,word_id' }).select();
    if (res.data && res.data[0]) state.progress[wordId] = { ...state.progress[wordId], ...res.data[0] };
    return row;
  }

  async function toggleStar(wordId, word) {
    if (needLogin()) return null;
    const row = state.progress[wordId] || {
      box: 0, ease: 2.5, interval_days: 0, due_at: null, reps: 0, lapses: 0, correct: 0,
      wrong: 0, streak_correct: 0, mistake: false, source: 'book',
      first_seen: new Date().toISOString(),
    };
    row.starred = !row.starred;
    row.word_id = wordId;
    if (word) row.source = word.source || 'book';
    state.progress[wordId] = row;
    const db = Cloud.client.database;
    const res = await db.from('word_progress').upsert({
      word_id: wordId, starred: row.starred, box: row.box, ease: row.ease,
      interval_days: row.interval_days, due_at: row.due_at, reps: row.reps, lapses: row.lapses,
      correct: row.correct, wrong: row.wrong, streak_correct: row.streak_correct,
      mistake: row.mistake, source: row.source, first_seen: row.first_seen,
    }, { onConflict: 'owner_id,word_id' }).select();
    if (res.data && res.data[0]) state.progress[wordId] = { ...state.progress[wordId], ...res.data[0] };
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

  async function flushStats(kind) {
    if (!Cloud.user) return;
    const secs = Math.min(pendingSeconds, 3600);
    if (!secs && !kind) return;
    pendingSeconds = 0;
    const db = Cloud.client.database;
    const day = todayStr();
    const ex = await db.from('daily_stats').select('*').eq('day', day).maybeSingle();
    const patch = {};
    if (kind === 'new') { /* 新词计数由调用方指定 */ }
    if (ex.data) {
      patch.study_seconds = (ex.data.study_seconds || 0) + secs;
      if (kind === 'correct') patch.correct = (ex.data.correct || 0) + 1;
      if (kind === 'wrong') patch.wrong = (ex.data.wrong || 0) + 1;
      if (kind === 'review') patch.reviews = (ex.data.reviews || 0) + 1;
      if (Object.keys(patch).length) {
        const r = await db.from('daily_stats').update(patch).eq('id', ex.data.id).select();
        if (r.data && r.data[0]) state.today = r.data[0];
      }
    } else {
      const ins = { day, study_seconds: secs, correct: 0, wrong: 0, reviews: 0, new_words: 0 };
      if (kind === 'correct') ins.correct = 1;
      if (kind === 'wrong') ins.wrong = 1;
      if (kind === 'review') ins.reviews = 1;
      const r = await db.from('daily_stats').insert(ins).select();
      if (r.data && r.data[0]) state.today = r.data[0];
    }
  }

  async function addNewWords(n) {
    if (!Cloud.user || !n) return;
    const db = Cloud.client.database;
    const day = todayStr();
    const ex = await db.from('daily_stats').select('*').eq('day', day).maybeSingle();
    if (ex.data) {
      const r = await db.from('daily_stats').update({ new_words: (ex.data.new_words || 0) + n }).eq('id', ex.data.id).select();
      if (r.data && r.data[0]) state.today = r.data[0];
    } else {
      const r = await db.from('daily_stats').insert({ day, new_words: n }).select();
      if (r.data && r.data[0]) state.today = r.data[0];
    }
  }

  /* ---------- 任务 ---------- */
  async function loadTasks() {
    if (!Cloud.user) { state.tasks = []; return state.tasks; }
    const db = Cloud.client.database;
    const day = todayStr();
    let { data } = await db.from('study_tasks').select('*').eq('day', day).order('id');
    if (!data || !data.length) {
      const generated = Plan.generate(state);
      if (generated.length) {
        const ins = await db.from('study_tasks').insert(generated.map(t => ({
          day, task_key: t.key, title: t.title, module: t.module, est_min: t.est, status: 'todo', payload: JSON.stringify(t.payload || {}),
        }))).select();
        data = ins.data || [];
      }
    }
    state.tasks = (data || []).map(t => ({ ...t, payload: safeJSON(t.payload) }));
    return state.tasks;
  }

  function safeJSON(s) { try { return s ? JSON.parse(s) : {}; } catch (e) { return {}; } }

  async function toggleTask(task, done) {
    if (!Cloud.user) { task.status = done ? 'done' : 'todo'; return; }
    const db = Cloud.client.database;
    const r = await db.from('study_tasks').update({ status: done ? 'done' : 'todo', updated_at: new Date().toISOString() }).eq('id', task.id).select();
    if (r.data && r.data[0]) { task.status = r.data[0].status; }
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

  async function history(days) {
    if (!Cloud.user) return [];
    const { data } = await Cloud.client.database.from('daily_stats').select('*').order('day', { ascending: false }).limit(days || 30);
    return data || [];
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
    stats, history, streak, examCountdown, rootGroups, needLogin, schedule, safeJSON,
    get words() { return state.words || []; },
    get byId() { return state.byId; },
    get progress() { return state.progress; },
    get profile() { return state.profile; },
    get settings() { return state.settings; },
    get today() { return state.today; },
    get tasks() { return state.tasks; },
  };
})();
