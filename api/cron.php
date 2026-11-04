<?php
declare(strict_types=1);

// Плановое задание, запускается каждую минуту (crontab на хостинге):
// досылает заявки, которые не ушли в Telegram, в заданный час присылает ежедневный отчёт
// и до конца минуты слушает Telegram: забирает команды, кнопки статусов и заметки (режим polling).
require __DIR__ . '/lib/app.php';
require __DIR__ . '/lib/telegram.php';
require __DIR__ . '/lib/bot.php';

$start = time();
ll_cli_only();
ll_flush_pending();
ll_daily_report();
if (ll_config()['telegram_mode'] === 'polling') ll_poll(56 - (time() - $start));
