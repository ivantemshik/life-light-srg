<?php
// Настройки сервера заявок на хостинге reg.ru. Файл кладётся в ~/life-light-data/config.php
// (вне папки сайта, права 600). Токены и ключи в репозиторий не коммитятся.
return [
    'bot_token' => '123456:ABC…',                // токен бота от @BotFather
    'chat_id' => '123456789',                    // куда присылать заявки: личный чат или группа менеджеров (узнать: /id боту)
    'admin_ids' => ['123456789'],                // кто может управлять ботом из других чатов
    'webhook_secret' => 'случайная-строка-32-символа', // подпись запросов Telegram к /api/telegram/webhook
    'ip_salt' => 'случайная-строка',             // соль для хэша IP (сам IP не хранится)
    'timezone' => 'Europe/Moscow',
    'daily_report_hour' => 10,                   // час ежедневного отчёта; null — без отчёта
    'allowed_origins' => [                       // с каких адресов, кроме самого сайта, можно отправлять форму
        'https://www.xn--b1agbee5a2ak0g.xn--p1ai',
        'https://life-light-tz.vercel.app',
    ],
    'rate_limit_max' => 5,                       // не больше 5 заявок с одного адреса
    'rate_limit_window_min' => 10,               // за 10 минут
    'telegram_api' => 'https://api.telegram.org', // при блокировке: адрес прокси из папки worker/
    'metrika_counter_id' => '',                  // номер счётчика Метрики
    'metrika_token' => '',                       // OAuth-токен metrika:read (docs/metrika.md)
    'metrika_lead_goal_id' => '',                // числовой номер цели lead_sent
];
