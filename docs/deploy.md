# Развёртывание: сервер заявок, Telegram-бот и прокси

Схема:

```
Посетитель ──форма──▶ российский сервер (server/, SQLite, фото) ──▶ Cloudflare Worker ──▶ api.telegram.org ──▶ чат менеджеров
                                   ▲                                                                     │
                                   └──────────── обновления бота (кнопки, команды) ◀─────────────────────┘
```

Персональные данные (имя, контакт, фото) хранятся только на российском сервере. В Telegram уходит уведомление менеджерам.

## 1. Telegram-бот

1. В [@BotFather](https://t.me/BotFather): `/newbot`, задайте имя, сохраните токен.
2. Создайте группу для менеджеров и добавьте туда бота. Режим приватности менять не нужно: ответы на сообщения бота (заметки) и команды он видит и так.
3. ID группы бот подскажет сам после запуска: напишите в группе `/id`.

## 2. Cloudflare Worker (прокси до Telegram)

Нужен бесплатный аккаунт Cloudflare.

**Через панель:** Workers & Pages → Create → Worker → вставьте код `worker/telegram-proxy.js` → Deploy. В Settings → Variables and Secrets добавьте секрет `PROXY_SECRET` (длинная случайная строка) и при желании `BOT_TOKEN` (тогда прокси обслуживает только этого бота).

**Через консоль:**

```sh
cd worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put PROXY_SECRET
```

Адрес вида `https://life-light-tg-proxy.<аккаунт>.workers.dev` впишите в `TELEGRAM_API_BASE`, секрет в `TELEGRAM_PROXY_SECRET`.

## 3. Российский сервер

Подойдёт любой VPS в РФ (Timeweb, Selectel, REG.RU, Yandex Cloud) с Ubuntu 22.04+ и 1 ГБ памяти.

```sh
# Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx

# Код
sudo useradd --system --home /opt/life-light lifelight
sudo git clone https://github.com/ivantemshik/life-light-srg.git /opt/life-light
sudo mkdir -p /opt/life-light/data && sudo chown -R lifelight /opt/life-light/data

# Настройки
sudo cp /opt/life-light/server/.env.example /opt/life-light/server/.env
sudo nano /opt/life-light/server/.env      # токен бота, ID чата, адрес Worker, секрет, Метрика

# Автозапуск
sudo cp /opt/life-light/deploy/life-light.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now life-light
curl http://127.0.0.1:8080/api/health        # {"ok":true,"telegram":true,...}

# Домен и HTTPS
sudo cp /opt/life-light/deploy/nginx.conf /etc/nginx/sites-available/life-light
sudo ln -s /etc/nginx/sites-available/life-light /etc/nginx/sites-enabled/
sudo certbot --nginx -d life-light.ru -d www.life-light.ru
sudo systemctl reload nginx
```

Внешние npm-пакеты не нужны: база на встроенном в Node.js модуле `node:sqlite`.

Обновление: `cd /opt/life-light && sudo git pull && sudo systemctl restart life-light`.

Логи: `journalctl -u life-light -f`.

Резервная копия: папка `/opt/life-light/data` (база `leads.sqlite` и фото `uploads/`). Пример ежедневной копии через cron: `0 3 * * * tar czf /root/backup/life-light-$(date +\%F).tgz -C /opt/life-light data`.

## 4. Где разместить сайт

**Вариант А, рекомендуемый: всё на российском сервере.** `SERVE_STATIC=1`, сайт и API на одном домене, в `config.js` остаётся `apiEndpoint: '/api/leads'`.

**Вариант Б: сайт на Vercel, API на сервере.** На сервере `SERVE_STATIC=0` и `ALLOWED_ORIGINS=https://<домен сайта>`; API лучше вынести на поддомен (`api.life-light.ru` в `nginx.conf`). В `config.js`: `apiEndpoint: 'https://api.life-light.ru/api/leads'`.

Если API недоступен, форма честно пишет, что заявка не отправлена, и предлагает Telegram.

## 5. Режим webhook (необязательно)

По умолчанию бот сам опрашивает Telegram через Worker (`TELEGRAM_MODE=polling`): серверу не нужен входящий доступ из-за рубежа. Если нужен webhook:

1. В Worker добавьте `UPSTREAM_WEBHOOK_URL=https://<ваш домен>/api/telegram/webhook` и секрет `WEBHOOK_SECRET`.
2. На сервере: `TELEGRAM_MODE=webhook`, `TELEGRAM_WEBHOOK_URL=https://<worker>/webhook`, `TELEGRAM_WEBHOOK_SECRET=<тот же секрет>`.

## 6. Работа с заявками в боте

- Новая заявка приходит в группу с фото и кнопками: «Взять в работу», «Смета отправлена», «Договор», «Отказ», «Спам». Кнопка меняет статус и подписывает, кто взял заявку.
- Ответ на сообщение заявки сохраняется как заметка к ней.
- `/new`: неразобранные, `/leads`: в работе, `/lead_12`: карточка и история.
- `/stats`: заявки за сегодня, 7 и 30 дней, статусы, типы объектов, источники, конверсия в договор и показатели Метрики.
- `/export`: все заявки файлом CSV для Excel.
- В `DAILY_REPORT_HOUR` бот сам присылает отчёт в группу.
- Если Telegram или прокси были недоступны, заявка всё равно сохраняется и уходит в бот, как только связь вернётся (проверка раз в минуту).
