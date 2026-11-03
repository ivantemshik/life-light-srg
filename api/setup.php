<?php
declare(strict_types=1);

// Подключает бота к сайту: ставит webhook и меню команд. Запуск по SSH один раз (и после смены домена):
//   php ~/www/<сайт>/api/setup.php https://жизньсвет.рф
require __DIR__ . '/lib/app.php';
require __DIR__ . '/lib/telegram.php';

ll_cli_only();
$site = rtrim($argv[1] ?? '', '/');
if (!preg_match('~^https://~', $site)) { fwrite(STDERR, "Укажите адрес сайта с https://\n"); exit(1); }
$secret = (string) ll_config()['webhook_secret'];
if (strlen($secret) < 16) { fwrite(STDERR, "В config.php нужен webhook_secret длиной от 16 символов\n"); exit(1); }

tg_call('setWebhook', ['url' => "$site/api/telegram/webhook", 'secret_token' => $secret, 'allowed_updates' => ['message', 'callback_query'], 'drop_pending_updates' => false]);
tg_call('setMyCommands', ['commands' => [
    ['command' => 'new', 'description' => 'Новые заявки'],
    ['command' => 'leads', 'description' => 'Заявки в работе'],
    ['command' => 'stats', 'description' => 'Статистика заявок и Метрики'],
    ['command' => 'metrika', 'description' => 'Показатели Метрики'],
    ['command' => 'export', 'description' => 'Все заявки файлом CSV'],
    ['command' => 'help', 'description' => 'Справка'],
]]);
$info = tg_call('getWebhookInfo');
echo 'Webhook: ' . ($info['url'] ?? '') . ', в очереди ' . ($info['pending_update_count'] ?? 0) . (empty($info['last_error_message']) ? '' : ', последняя ошибка: ' . $info['last_error_message']) . "\n";
