<?php
declare(strict_types=1);

// GET /api/health: проверка, что сервер заявок работает (без личных данных)
require __DIR__ . '/lib/app.php';

$config = ll_config();
try { ll_db(); $db = true; } catch (Throwable $e) { $db = false; }
ll_json(200, [
    'ok' => $db,
    'telegram' => $config['bot_token'] !== '' && ll_recipients() !== [],
    'metrika' => $config['metrika_counter_id'] !== '' && $config['metrika_token'] !== '',
]);
