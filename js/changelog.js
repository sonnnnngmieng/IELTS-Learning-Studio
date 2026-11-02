/* 版本与更新日志：
   - 页面 #/changelog 读 data/changelog.json 渲染
   - 侧栏底部显示当前版本；没看过的更新打个小点
   - 每次打开 / 切回标签页时悄悄比对一次线上版本，发现更新就浮一条「点此刷新」 */
const ChangeLog = (() => {
  const SEEN_KEY = 'wb_seen_ver';
  const LAST_CHECK = 'wb_ver_check_at';
  let cache = null;
  let banner = null;

  const VER = (typeof APP_VERSION !== 'undefined' ? APP_VERSION : { ver: '1.0.0', build: 'dev', date: '' });

  function seen() {
    try { return localStorage.getItem(SEEN_KEY) || ''; } catch (e) { return ''; }
  }

  function markSeen(ver) {
    try { localStorage.setItem(SEEN_KEY, ver); } catch (e) { /* 忽略 */ }
  }

  /** 版本号比较：1.10.0 > 1.9.0 */
  function newer(a, b) {
    const pa = String(a || '0').split('.').map(Number);
    const pb = String(b || '0').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    }
    return false;
  }

  async function data() {
    if (cache) return cache;
    const r = await fetch('data/changelog.json?v=' + encodeURIComponent(VER.build));
    cache = await r.json();
    return cache;
  }

  /** 没看过的更新条数（用来打小点） */
  async function unseen() {
    try {
      const d = await data();
      const s = seen();
      return (d.entries || []).filter(e => !s || newer(e.ver, s)).length;
    } catch (e) { return 0; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- 页面 ---------- */
  async function render(root) {
    let d;
    try { d = await data(); }
    catch (e) {
      root.innerHTML = `<h1>更新日志</h1><div class="card"><div class="empty">读不到更新日志（data/changelog.json）<br>当前版本 ${esc(VER.ver)}</div></div>`;
      return;
    }
    const s = seen();
    const list = d.entries || [];
    const fresh = list.filter(e => !s || newer(e.ver, s)).length;

    root.innerHTML = `
      <h1>更新日志</h1>
      <p class="muted" style="margin-bottom:14px">每次改完发布，这里会多一条；别人下次打开就是新版，不用清缓存。</p>

      <div class="card">
        <div class="card-title">
          <h3>当前版本 <span style="color:var(--brand)">v${esc(VER.ver)}</span></h3>
          <span class="pill ${fresh ? 'amber' : 'green'}">${fresh ? '有 ' + fresh + ' 条没看过' : '已是最新'}</span>
        </div>
        <p class="muted tiny" style="margin:0 0 10px">构建号 ${esc(VER.build)} · ${esc(VER.date)} 发布</p>
        <div class="root-box" style="margin:0">
          <div class="root-logic">更新只替换网页代码，你的学习进度、错词、击掌记录都还在这台设备的浏览器里，不会被新版本覆盖。升级前还会自动留一份快照，万一不对可以退回去。</div>
        </div>
        <div class="row wrap" style="margin-top:12px">
          <button class="btn sm" onclick="ChangeLog.jumpProfile()">数据备份 / 恢复</button>
          <button class="btn sm soft" onclick="ChangeLog.reload()">强制拉取最新版</button>
        </div>
      </div>

      <div class="chg-list">
        ${list.map(e => {
          const isNew = !s || newer(e.ver, s);
          return `<div class="card chg-item">
            <div class="row between" style="align-items:flex-start;gap:10px">
              <div style="flex:1;min-width:0">
                <div class="row wrap" style="gap:6px;margin-bottom:4px">
                  <span class="pill amber">v${esc(e.ver)}</span>
                  <span class="tiny dim">${esc(e.date)}</span>
                  ${(e.tags || []).map(t => `<span class="pill ${t === '修复' ? 'red' : t === '新增' ? 'green' : 'blue'}">${esc(t)}</span>`).join('')}
                  ${isNew ? '<span class="pill" style="background:var(--brand);color:var(--brand-ink)">新</span>' : ''}
                </div>
                <h4 style="margin:0 0 6px">${esc(e.title)}</h4>
              </div>
            </div>
            <ul class="chg-ul">${(e.items || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          </div>`;
        }).join('')}
      </div>`;

    markSeen(d.current || VER.ver);
    paintBadge();
    window.scrollTo(0, 0);
  }

  function jumpProfile() { location.hash = '#/profile'; }

  function reload() {
    try { sessionStorage.clear(); } catch (e) { /* 忽略 */ }
    location.reload();
  }

  /* ---------- 侧栏版本号 / 小点 ---------- */
  function paintBadge() {
    document.querySelectorAll('.ver-text').forEach(t => { t.textContent = 'v' + VER.ver; });
    unseen().then(n => {
      document.querySelectorAll('.ver-dot').forEach(d => {
        d.hidden = n === 0;
        d.textContent = n ? (d.tagName === 'EM' ? n + ' 条更新' : '') : '';
      });
    }).catch(() => {});
  }

  /* ---------- 有新版本就提示 ---------- */
  function showBanner(online) {
    if (banner) return;
    banner = document.createElement('div');
    banner.className = 'upd-bar';
    banner.innerHTML = `<b>有新版本 v${esc(online.ver)}</b>
      <span class="upd-bar-sub">你打开的是 v${esc(VER.ver)}</span>
      <button class="btn sm primary" onclick="ChangeLog.reload()">刷新</button>
      <button class="upd-x" aria-label="稍后" onclick="ChangeLog.hideBanner()">✕</button>`;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner && banner.classList.add('in'));
  }

  function hideBanner() {
    if (!banner) return;
    banner.classList.remove('in');
    const el = banner;
    banner = null;
    setTimeout(() => { if (el && el.parentNode) el.parentNode.removeChild(el); }, 200);
  }

  let checking = false;
  async function check() {
    if (checking) return;
    checking = true;
    try {
      const at = Number(sessionStorage.getItem(LAST_CHECK) || 0);
      if (Date.now() - at < 60000) return;      // 一分钟内不重复问
      sessionStorage.setItem(LAST_CHECK, String(Date.now()));
      const r = await fetch('data/changelog.json?t=' + Date.now(), { cache: 'no-store' });
      const d = await r.json();
      if (d && d.build && d.build !== VER.build) showBanner(d);
    } catch (e) { /* 离线就算了 */ }
    finally { checking = false; }
  }

  function watch() {
    setTimeout(check, 1500);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  }

  return { render, unseen, paintBadge, watch, check, reload, hideBanner, jumpProfile, VERSION: VER };
})();
