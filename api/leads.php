<?php
declare(strict_types=1);

// POST /api/leads: заявка из формы сайта. Сохраняет её и сразу отправляет в Telegram;
// если Telegram не ответил, заявку дошлёт плановое задание (cron.php).
require __DIR__ . '/lib/app.php';
require __DIR__ . '/lib/telegram.php';
require __DIR__ . '/lib/bot.php';

ll_cors();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') { http_response_code(204); exit; }
if ($method !== 'POST') { ll_json(405, ['ok' => false]); exit; }

try {
    $ipHash = ll_hash_ip(ll_client_ip());
    if (!ll_rate_allow($ipHash)) { ll_json(429, ['ok' => false, 'error' => 'Слишком много заявок подряд. Попробуйте через несколько минут.']); exit; }

    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 14 * 1024 * 1024) { ll_json(413, ['ok' => false, 'error' => 'Фото слишком большие. Приложите меньше фото.']); exit; }
    $raw = file_get_contents('php://input');
    if (strlen((string) $raw) > 14 * 1024 * 1024) { ll_json(413, ['ok' => false, 'error' => 'Фото слишком большие. Приложите меньше фото.']); exit; }
    $body = json_decode((string) $raw, true);
    if (!is_array($body)) { ll_json(400, ['ok' => false, 'error' => 'Не удалось прочитать заявку.']); exit; }
    if (!empty($body['website'])) { ll_json(200, ['ok' => true, 'id' => 0]); exit; } // ловушка для ботов

    $result = ll_validate_lead($body, $ipHash, (string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
    if (isset($result['error'])) { ll_json(422, ['ok' => false, 'error' => $result['error'], 'field' => $result['field'] ?? null]); exit; }

    $lead = ll_create_lead($result['lead']);
    $id = (int) $lead['id'];
    try {
        $saved = ll_save_photos($id, $result['photos']);
        if ($saved) ll_set_photos($id, $saved);
    } catch (Throwable $e) { ll_log("Фото заявки $id не сохранены: " . $e->getMessage()); }

    try { ll_notify_lead($id); }
    catch (Throwable $e) { ll_log("Заявка $id не отправлена в Telegram, повторим позже: " . $e->getMessage()); }

    ll_json(200, ['ok' => true, 'id' => $id]);
} catch (Throwable $e) {
    ll_log('Ошибка приёма заявки: ' . $e->getMessage());
    ll_json(500, ['ok' => false, 'error' => 'Ошибка сервера. Напишите нам в Telegram.']);
}
