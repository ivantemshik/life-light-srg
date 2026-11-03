<?php
declare(strict_types=1);

// Плановое задание, запускается раз в 5 минут (crontab на хостинге):
// досылает заявки, которые не ушли в Telegram, и в заданный час присылает ежедневный отчёт.
require __DIR__ . '/lib/app.php';
require __DIR__ . '/lib/telegram.php';
require __DIR__ . '/lib/bot.php';

ll_cli_only();
ll_flush_pending();
ll_daily_report();
