// Настройки сайта. Меняются здесь, остальной код трогать не нужно.
window.LL_CONFIG = {
  // Адрес API заявок. На хостинге reg.ru (жизньсвет.рф) API работает на том же домене (папка api/, PHP).
  // Временная копия сайта на Vercel отправляет заявки туда же, на жизньсвет.рф.
  apiEndpoint: /\.vercel\.app$/.test(window.location.hostname) ? 'https://xn--b1agbee5a2ak0g.xn--p1ai/api/leads' : '/api/leads',
  // Номер счётчика Яндекс Метрики. 0 — счётчик не подключается, цели не отправляются.
  metrikaId: 0,
  // Вебвизор (запись визитов). Включать только после решения владельца и юриста.
  metrikaWebvisor: false,
  // Версия сайта для Метрики (параметр визита site_version), формат ГГГГ-ММ_vN. Меняйте при каждой заметной правке сайта.
  siteVersion: '2026-11_v1',
  // Ссылка на Telegram компании: запасной канал, если форма недоступна.
  telegram: 'https://t.me/LifeLight_ru',
  // Куда ведёт ссылка Telegram: channel (канал, писать нельзя), personal, bot, business_link. Уходит в цель contact_telegram_click.
  telegramTargetType: 'channel'
};
