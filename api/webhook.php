<?php
declare(strict_types=1);

// POST /api/telegram/webhook: обновления от Telegram (кнопки статусов, команды, заметки).
// Telegram подписывает запрос заголовком X-Telegram-Bot-Api-Secret-Token, чужие запросы отклоняются.
require __DIR__ . '/lib/app.php';
require __DIR__ . '/lib/telegram.php';
require __DIR__ . '/lib/bot.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { ll_json(405, ['ok' => false]); exit; }
$secret = (string) ll_config()['webhook_secret'];
$given = (string) ($_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '');
if ($secret === '' || !hash_equals($secret, $given)) { ll_json(401, ['ok' => false]); exit; }

$update = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($update)) { ll_json(400, ['ok' => false]); exit; }

// Одно и то же обновление Telegram может прислать повторно, если ответ задержался: обрабатываем его один раз
$updateId = (int) ($update['update_id'] ?? 0);
try {
    $done = ll_query('INSERT OR IGNORE INTO kv (key, value) VALUES (?, ?)', ['update:' . $updateId, ll_now()])->rowCount() === 0;
    if ($updateId && $done) { ll_json(200, ['ok' => true]); exit; }
    ll_query("DELETE FROM kv WHERE key LIKE 'update:%' AND value < ?", [(new DateTimeImmutable('-2 days', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z')]);
} catch (Throwable $e) { ll_log('Webhook: ' . $e->getMessage()); }

ll_handle_update($update);
ll_json(200, ['ok' => true]);
