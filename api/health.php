<?php
declare(strict_types=1);

// GET /api/health: проверка, что сервер заявок работает (без личных данных)
require __DIR__ . '/lib/app.php';
require __DIR__ . '/lib/telegram.php';
require __DIR__ . '/lib/bot.php';

$config = ll_config();
try { ll_db(); $db = true; } catch (Throwable $e) { $db = false; }
// bot: бот за последние 3 минуты получил ответ от Telegram (в режиме webhook это не проверить, там null)
try { $bot = $config['telegram_mode'] === 'polling' ? ll_bot_alive() : null; } catch (Throwable $e) { $bot = false; }
ll_json(200, [
    'ok' => $db,
    'telegram' => $config['bot_token'] !== '' && ll_recipients() !== [],
    'bot' => $bot,
    'metrika' => $config['metrika_counter_id'] !== '' && $config['metrika_token'] !== '',
]);
