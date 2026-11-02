/* 匿名使用统计：只记录"有人用了什么"，不记录任何身份信息
   - 设备号：本机随机生成的 16 位串，存在 localStorage，换设备就是新设备
   - 上报：写进云端 usage_events 表（无姓名、无手机号、无 IP 落库）
   - 读取：只读云端聚合视图 usage_daily，看不到任何单条明细
   没有任何云端环境时自动降级为"仅本地记录"，不影响使用。 */
const Track = (() => {
  const DEVICE_KEY = 'wb_device_id';
  const QUEUE_KEY = 'wb_track_queue';
  const VISIT_KEY = 'wb_visit_logged';
  const TABLE = 'usage_events';
  const VIEW = 'usage_daily';
  let offline = false;   // 一旦确认云端不可用就不再反复尝试

  function rnd(n) {
    let s = '';
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function deviceId() {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (!id) { id = 'd' + rnd(15); localStorage.setItem(DEVICE_KEY, id); }
      return id;
    } catch (e) { return 'd000000000000000'; }
  }

  function today() { return typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10); }

  function queue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return []; }
  }

  function setQueue(list) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-120))); } catch (e) { /* 忽略 */ }
  }

  function db() {
    try {
      const c = Cloud && Cloud.client;
      if (!c || !c.database || !c.database.from) return null;
      return c.database;
    } catch (e) { return null; }
  }

  async function send(rows) {
    const database = db();
    if (!database || !rows.length) return false;
    try {
      const { error } = await database.from(TABLE).insert(rows);
      if (error) { console.warn('统计上报被拒绝', error.message || error); return false; }
      return true;
    } catch (e) {
      console.warn('统计上报失败', e.message || e);
      return false;
    }
  }

  /** 记录一条匿名事件（失败就排队，下次打开再补） */
  async function log(kind, detail, path) {
    if (offline) return false;
    const row = {
      device_id: deviceId(),
      day: today(),
      kind: String(kind).slice(0, 24),
      path: String(path || (location.hash.replace(/^#\/?/, '') || 'home')).slice(0, 64),
      detail: detail || {},
      ua: String((navigator && navigator.userAgent) || '').slice(0, 160),
    };
    const ok = await send([row]);
    if (!ok) {
      const q = queue();
      q.push(row);
      setQueue(q);
    } else if (queue().length) {
      flushQueue();
    }
    return ok;
  }

  async function flushQueue() {
    const q = queue();
    if (!q.length) return;
    const ok = await send(q.slice(-40));
    if (ok) setQueue(q.slice(0, Math.max(0, q.length - 40)));
  }

  /** 每个标签页打开算一次访问 */
  function visit() {
    let seen = false;
    try { seen = sessionStorage.getItem(VISIT_KEY) === '1'; } catch (e) { /* 忽略 */ }
    if (seen) return;
    try { sessionStorage.setItem(VISIT_KEY, '1'); } catch (e) { /* 忽略 */ }
    log('visit', {
      w: (window.innerWidth || 0),
      h: (window.innerHeight || 0),
      ref: (document.referrer || '').replace(/^https?:\/\//, '').slice(0, 60),
      lang: (navigator && navigator.language) || '',
    }, 'home');
    flushQueue();
  }

  /** 学习行为：kind = study / writing / listening / dictation / task / hi5 */
  function study(kind, detail) {
    log(kind, detail);
  }

  /** 读取云端聚合（只有"每天每类事件有多少次、多少台设备"） */
  async function summary(days) {
    const database = db();
    if (!database) return { ok: false, rows: [], reason: 'no-cloud' };
    try {
      const { data, error } = await database.from(VIEW).select('day,kind,events,devices');
      if (error) return { ok: false, rows: [], reason: error.message || 'query-failed' };
      const rows = Array.isArray(data) ? data : [];
      const since = new Date();
      since.setDate(since.getDate() - ((days || 7) - 1));
      const from = todayStr(since);
      return { ok: true, rows: rows.filter(r => r.day >= from).sort((a, b) => (a.day < b.day ? 1 : -1)) };
    } catch (e) {
      return { ok: false, rows: [], reason: e.message || 'query-failed' };
    }
  }

  /** 本机自己的使用情况（不依赖网络） */
  function localStats() {
    return {
      device: deviceId(),
      events: (Store.state.events || []).length,
      days: Object.keys(Store.state.stats || {}).length,
      savedAt: Store.savedAt,
      pending: queue().length,
    };
  }

  return { deviceId, log, visit, study, flushQueue, summary, localStats };
})();
