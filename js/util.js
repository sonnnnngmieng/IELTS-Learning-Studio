/* 基础工具与全局 UI */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/* 把文本安全地放进 onclick="fn('...')" 里：先做 JS 转义，再做 HTML 属性转义 */
function jss(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, ' ');
}

function todayStr(d) {
  const t = d || new Date();
  const p = n => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}
function daysBetween(a, b) {
  const d1 = new Date(a + 'T00:00:00'), d2 = new Date(b + 'T00:00:00');
  return Math.round((d2 - d1) / 86400000);
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function fmtMin(m) { return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`; }
function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了，注意休息';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}
const ENCOURAGE = [
  '今天多认识一个词，考场上就多一分从容。',
  '听不懂不是失败，是耳朵正在变灵敏的过程。',
  '稳定的 30 分钟，胜过周末的 3 小时。',
  '把今天这一组做完，你就比昨天更强。',
  '分数是结果，习惯才是复利。',
  '不用和别人比进度，只和昨天的自己比。',
];

const UI = {
  toastTimer: null,
  toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { t.style.display = 'none'; }, ms || 2200);
  },
  showLogin() { $('#login-mask').style.display = 'grid'; },
  closeLogin() { $('#login-mask').style.display = 'none'; },
  toggleDrawer(force) {
    const open = force != null ? force : !$('#sidebar').classList.contains('open');
    $('#sidebar').classList.toggle('open', open);
    $('#drawer-mask').classList.toggle('show', open);
  },
  closeDrawer() { this.toggleDrawer(false); },
  openModal(html, opts) {
    opts = opts || {};
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}">
      <button class="modal-close">×</button>${html}</div>`;
    document.body.appendChild(mask);
    mask.querySelector('.modal-close').onclick = () => mask.remove();
    mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
    return mask;
  },
  sheet(items) {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.style.alignItems = 'flex-end';
    mask.innerHTML = `<div class="modal" style="max-width:340px;padding:10px">
      ${items.map((it, i) => it.plain
        ? `<div style="padding:12px;text-align:center;color:var(--ink-3);font-size:13px;border-bottom:1px solid var(--line)">${esc(it.label)}</div>`
        : `<button class="btn block" data-i="${i}" style="border:none;${it.danger ? 'color:var(--red)' : ''}">${esc(it.label)}</button>`).join('')}
      <button class="btn block" id="sheet-cancel" style="border:none;color:var(--ink-3)">取消</button></div>`;
    document.body.appendChild(mask);
    mask.addEventListener('click', e => {
      if (e.target === mask || e.target.id === 'sheet-cancel') return mask.remove();
      const b = e.target.closest('button[data-i]');
      if (b) { mask.remove(); items[+b.dataset.i].onClick && items[+b.dataset.i].onClick(); }
    });
  },
  showUserMenu() {
    if (!Cloud.user) return this.showLogin();
    UI.sheet([
      { label: Cloud.user.name || '我的账号', plain: true },
      { label: '个人中心 / 目标设置', onClick: () => { location.hash = '#/profile'; } },
      { label: '学习记录', onClick: () => { location.hash = '#/records'; } },
      { label: '退出登录', danger: true, onClick: () => Auth.signOut() },
    ]);
  },
  setUserChip() {
    const u = Cloud.user;
    const name = u ? (u.name || (u.phone ? u.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : u.email || '学习者')) : '未登录';
    $('#user-name').textContent = name;
    $('#user-sub').textContent = u ? '进度已云端同步' : '点击登录同步进度';
    $('#avatar').textContent = u ? (name[0] || 'U').toUpperCase() : '?';
  },
  ring(pct, size) {
    size = size || 78;
    const r = (size - 9) / 2, c = 2 * Math.PI * r;
    const on = Math.max(0, Math.min(100, pct));
    return `<div class="ring" style="width:${size}px;height:${size}px;flex:0 0 ${size}px">
      <svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#f5ead3" stroke-width="8"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#efb52a" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c - c * on / 100}"/></svg>
      <div class="val">${Math.round(on)}%</div></div>`;
  },
};
