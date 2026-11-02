/* 版本号：每次发布改这里（或用 _release.js 自动改），
   - ver   给用户看的版本，如 1.4.0
   - build 缓存穿透用的构建号，改一次浏览器就会重新拉所有 js/css
   - date  发布日期
   data/changelog.json 里的 current / build 必须与这里一致，_release.js 会同步。 */
const APP_VERSION = {
  ver: '1.4.0',
  build: '20261102-1616',
  date: '2026-11-02',
};
