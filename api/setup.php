<?php
declare(strict_types=1);

// Подключает бота: меню команд и способ получения сообщений. Запуск по SSH один раз (и после смены режима или домена):
//   php ~/www/<сайт>/api/setup.php                      режим polling (по умолчанию): снимает webhook, бот слушает из cron
//   php ~/www/<сайт>/api/setup.php https://жизньсвет.рф  режим webhook (telegram_mode = webhook в config.php)
require __DIR__ . '/lib/app.php';
require __DIR__ . '/lib/telegram.php';

ll_cli_only();
if (ll_config()['telegram_mode'] === 'polling') {
    tg_call('deleteWebhook', ['drop_pending_updates' => false]);
} else {
    $site = rtrim($argv[1] ?? '', '/');
    if (!preg_match('~^https://~', $site)) { fwrite(STDERR, "Укажите адрес сайта с https://
"); exit(1); }
    $secret = (string) ll_config()['webhook_secret'];
    if (strlen($secret) < 16) { fwrite(STDERR, "В config.php нужен webhook_secret длиной от 16 символов
"); exit(1); }
    tg_call('setWebhook', ['url' => "$site/api/telegram/webhook", 'secret_token' => $secret, 'allowed_updates' => ['message', 'callback_query'], 'drop_pending_updates' => false]);
}
tg_call('setMyCommands', ['commands' => [
    ['command' => 'new', 'description' => 'Новые заявки'],
    ['command' => 'leads', 'description' => 'Заявки в работе'],
    ['command' => 'stats', 'description' => 'Статистика заявок и Метрики'],
    ['command' => 'metrika', 'description' => 'Показатели Метрики'],
    ['command' => 'export', 'description' => 'Все заявки файлом CSV'],
    ['command' => 'help', 'description' => 'Справка'],
]]);
$info = tg_call('getWebhookInfo');
echo 'Режим: ' . ll_config()['telegram_mode'] . ', webhook: ' . (($info['url'] ?? '') ?: 'нет') . ', в очереди ' . ($info['pending_update_count'] ?? 0)
    . (empty($info['last_error_message']) ? '' : ', последняя ошибка: ' . $info['last_error_message']) . "
";
