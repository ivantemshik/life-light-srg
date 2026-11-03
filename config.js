// Настройки сайта. Меняются здесь, остальной код трогать не нужно.
window.LL_CONFIG = {
  // Адрес API заявок на российском сервере (server/). Если сайт и API на одном домене, оставьте '/api/leads'.
  // Если сайт размещён на Vercel, а API на своём сервере, укажите полный адрес: 'https://api.life-light.ru/api/leads'.
  apiEndpoint: '/api/leads',
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
