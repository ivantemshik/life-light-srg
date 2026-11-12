// Настройки сайта. Меняются здесь, остальной код трогать не нужно.
window.LL_CONFIG = {
  // Адрес API заявок. На хостинге reg.ru (жизньсвет.рф) API работает на том же домене (папка api/, PHP).
  // Временная копия сайта на Vercel отправляет заявки туда же, на жизньсвет.рф.
  apiEndpoint: /\.vercel\.app$/.test(window.location.hostname) ? 'https://xn--b1agbee5a2ak0g.xn--p1ai/api/leads' : '/api/leads',
  // Номер счётчика Яндекс Метрики. 0 — счётчик не подключается, цели не отправляются.
  metrikaId: 114059448,
  // Вебвизор (запись визитов). Включать только после решения владельца и юриста.
  metrikaWebvisor: false,
  // Версия сайта для Метрики (параметр визита site_version), формат ГГГГ-ММ_vN. Меняйте при каждой заметной правке сайта.
  siteVersion: '2026-11_v3',
  // Telegram для переписки: чат с аккаунтом на номере +7 985 928-37-99 (кнопка «Обсудить в Telegram» и запасной путь, если форма недоступна).
  // Работает, если в этом аккаунте Telegram разрешено находить его по номеру телефона.
  telegram: 'https://t.me/lifelightlife',
  // Куда ведёт ссылка выше: personal, bot, business_link. Уходит в цель contact_telegram_click.
  telegramTargetType: 'personal',
  // Telegram-канал с работами (портфолио). Клик по нему уходит в ту же цель с telegram_target_type: channel.
  telegramChannel: 'https://t.me/LifeLight_ru'
};
