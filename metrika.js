// Яндекс Метрика. Номер счётчика задаётся в config.js (metrikaId).
// Цели отправляются через window.llGoal('имя_цели', { параметры }); список целей в docs/metrika.md.
(function () {
  var cfg = window.LL_CONFIG || {};
  var id = Number(cfg.metrikaId) || 0;

  window.llGoal = function (name, params) {
    if (!id || typeof window.ym !== 'function') return;
    try { window.ym(id, 'reachGoal', name, params || {}); } catch (e) { /* Метрика недоступна: сайт работает без неё */ }
  };

  window.llClientId = function (callback) {
    if (!id || typeof window.ym !== 'function') { callback(''); return; }
    var done = false;
    var finish = function (value) { if (!done) { done = true; callback(value || ''); } };
    try { window.ym(id, 'getClientID', finish); } catch (e) { finish(''); }
    setTimeout(function () { finish(''); }, 1500);
  };

  if (!id) return;

  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) return; }
    k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + id, 'ym');

  // Настройки по аудиту: ссылки и карта кликов включены, якоря не считаются просмотрами, Вебвизор по решению владельца и юриста.
  window.ym(id, 'init', {
    ssr: true,
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: cfg.metrikaWebvisor === true,
    trackHash: false,
    ecommerce: false,
    sendTitle: true,
    params: { site_version: String(cfg.siteVersion || 'unknown') }
  });
})();
