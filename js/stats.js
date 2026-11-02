/* 数据后台：只读云端的聚合视图，展示"多少人、用了什么"
   —— 拿不到任何单条明细，也拿不到设备号本身。
   口令只是「别让人随手点进来」的门槛，静态站没有真密码可言。 */
(() => {
  const PASS_HASH = 'rekh3j';   // djb2('yazhong2026')，改口令就改这里和 PASS_KEY 版本
  const OK_KEY = 'wb_stats_ok';
  const V = {
    activity: 'usage_activity_daily',
    daily: 'usage_daily',
    path: 'usage_path_daily',
    env: 'usage_env_daily',
    study: 'usage_study_daily',
    fresh: 'usage_new_device_daily',
    totals: 'usage_totals',
  };

  const $ = s => document.querySelector(s);
  const num = v => (v == null ? 0 : Number(v) || 0);
  const pad = n => (n < 10 ? '0' + n : '' + n);
  const dayStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const short = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;

  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  let client = null;
  function db() {
    if (!client) {
      const cfg = window.PUBLIC_CONFIG;
      client = window.WorkBuddyCloud.createWorkBuddyCloud({
        endpoint: cfg.endpoint,
        oauthRelayBaseUrl: cfg.oauthRelayBaseUrl,
        publishableKey: cfg.publishableKey,
      });
    }
    if (!client || !client.database) throw new Error('云数据库没有初始化');
    return client.database;
  }

  async function rows(view) {
    const { data, error } = await db().from(view).select('*');
    if (error) throw new Error(error.message || '查询失败');
    return Array.isArray(data) ? data : [];
  }

  /* ---------- 口令 ---------- */
  function gateOk() {
    try { return localStorage.getItem(OK_KEY) === PASS_HASH; } catch (e) { return false; }
  }

  function bindGate() {
    const box = $('#gate');
    box.hidden = false;
    const input = $('#gate-input');
    const go = () => {
      if (hash(input.value.trim()) === PASS_HASH) {
        try { localStorage.setItem(OK_KEY, PASS_HASH); } catch (e) { /* 忽略 */ }
        box.hidden = true;
        start();
      } else {
        $('#gate-hint').textContent = '口令不对，再试一次';
        input.select();
      }
    };
    $('#gate-go').addEventListener('click', go);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    input.focus();
  }

  /* ---------- 数据 ---------- */
  async function load() {
    const [act, daily, path, env, study, fresh, totals] = await Promise.all([
      rows(V.activity), rows(V.daily), rows(V.path), rows(V.env), rows(V.study), rows(V.fresh), rows(V.totals),
    ]);
    return { act, daily, path, env, study, fresh, totals: totals[0] || {} };
  }

  function lastDays(n) {
    const out = [];
    const d = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
      out.push(dayStr(x));
    }
    return out;
  }

  /* ---------- 渲染 ---------- */
  function kpi(n, label, sub) {
    return `<div class="kpi"><div class="n">${n}${sub ? `<small>${sub}</small>` : ''}</div><div class="l">${label}</div></div>`;
  }

  function render(d) {
    const today = dayStr(new Date());
    const byDay = {};
    d.act.forEach(r => { byDay[r.day] = { devices: num(r.devices), events: num(r.events) }; });
    const t = byDay[today] || { devices: 0, events: 0 };

    const kindToday = {};
    d.daily.filter(r => r.day === today).forEach(r => { kindToday[r.kind] = num(r.events); });

    const span = lastDays(14);
    const week7 = span.slice(-7).reduce((s, k) => s + ((byDay[k] || {}).events || 0), 0);
    const totals = {
      devices: num(d.totals.devices),
      events: num(d.totals.events),
      days: num(d.totals.days),
      first: d.totals.first_day || '',
    };

    $('#kpis').innerHTML = [
      kpi(t.devices, '今日活跃设备', '台'),
      kpi(t.events, '今日事件', '条'),
      kpi(kindToday.hi5 || 0, '今日击掌', '次'),
      kpi(totals.devices, '累计设备', '台'),
      kpi(week7, '近 7 天事件', '条'),
      kpi(totals.days || 0, '已记录天数', '天'),
    ].join('');

    /* --- 柱状图：每日活跃设备 --- */
    const maxDev = Math.max(1, ...span.map(k => (byDay[k] || {}).devices || 0));
    $('#bars').innerHTML = span.map(k => {
      const v = (byDay[k] || {}).devices || 0;
      const ev = (byDay[k] || {}).events || 0;
      const h = v ? Math.max(3, Math.round(v / (maxDev * 1.14) * 100)) : 0;
      return `<div class="bar${v ? '' : ' zero'}" title="${k} · ${v} 台设备 · ${ev} 个事件">
        <div class="v">${v || ''}</div>
        <div class="stack"><div class="dv" style="height:${h}%"></div></div>
      </div>`;
    }).join('');
    $('#xis').innerHTML = span.map(k => `<span>${short(k)}</span>`).join('');
    $('#chart-note').textContent = `峰值 ${maxDev} 台 · 悬停看当天事件数`;

    /* --- 表格 --- */
    const freshMap = {};
    d.fresh.forEach(r => { freshMap[r.day] = num(r.new_devices); });
    const studyMap = {};
    d.study.forEach(r => { studyMap[r.day] = r; });
    const hi5Map = {};
    d.daily.filter(r => r.kind === 'hi5').forEach(r => { hi5Map[r.day] = num(r.events); });

    $('#tbl').querySelector('tbody').innerHTML = span.slice().reverse().map(k => {
      const a = byDay[k] || { devices: 0, events: 0 };
      if (!a.events && !a.devices) return '';          // 没记录的日子不占行
      const st = studyMap[k] || {};
      return `<tr class="${k === today ? 'today' : ''}">
        <td>${k}${k === today ? ' <span class="pill amber" style="font-size:10px">今天</span>' : ''}</td>
        <td class="num">${a.devices}</td>
        <td class="num">${freshMap[k] || 0}</td>
        <td class="num">${hi5Map[k] || 0}</td>
        <td class="num">${num(st.sessions)}</td>
        <td class="num">${num(st.words)}</td>
        <td class="num">${a.events}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="empty">最近 14 天还没有任何记录</td></tr>';

    /* --- 平台 / 页面 --- */
    const envAgg = {};
    d.env.forEach(r => {
      const k = r.platform || '其他';
      envAgg[k] = envAgg[k] || { dev: 0, ev: 0 };
      envAgg[k].dev += num(r.devices);
      envAgg[k].ev += num(r.events);
    });
    $('#platforms').innerHTML = listHTML(
      Object.entries(envAgg).sort((a, b) => b[1].dev - a[1].dev)
        .map(([k, v]) => ({ name: k, n: v.dev, unit: '台' }))
    );

    const pathAgg = {};
    d.path.forEach(r => {
      const k = r.path || 'home';
      pathAgg[k] = pathAgg[k] || { ev: 0, dev: 0 };
      pathAgg[k].ev += num(r.events);
      pathAgg[k].dev += num(r.devices);
    });
    $('#paths').innerHTML = listHTML(
      Object.entries(pathAgg).sort((a, b) => b[1].ev - a[1].ev).slice(0, 8)
        .map(([k, v]) => ({ name: k, n: v.ev, unit: '条' }))
    );

    $('#upd').textContent = '更新于 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false });
  }

  function listHTML(items) {
    if (!items.length) return '<div class="empty">还没有数据</div>';
    const max = Math.max(1, ...items.map(x => x.n));
    return items.map(x => `<div class="list-row">
      <span class="nm" title="${x.name}">${x.name}</span>
      <span class="track"><i style="width:${Math.round(x.n / max * 100)}%"></i></span>
      <span class="n">${x.n} ${x.unit}</span>
    </div>`).join('');
  }

  /* ---------- 入口 ---------- */
  async function start() {
    $('#upd').textContent = '读取中…';
    try {
      render(await load());
      $('#dash').hidden = false;
    } catch (e) {
      $('#upd').textContent = '读取失败：' + (e.message || e);
      $('#dash').hidden = false;
      $('#kpis').innerHTML = `<div class="kpi" style="grid-column:1/-1">
        <div class="l">云端连不上，可能被网络或代理挡了。稍后点「刷新」再试。</div></div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#btn-refresh').addEventListener('click', start);
    if (gateOk()) { $('#gate').hidden = true; start(); } else bindGate();
  });
})();
