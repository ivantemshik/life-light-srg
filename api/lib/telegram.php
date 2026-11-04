<?php
declare(strict_types=1);

// Клиент Telegram Bot API. С хостинга reg.ru api.telegram.org доступен только по IPv6 и не всегда:
// часть подключений обрывается, поэтому неудавшееся подключение повторяется (запрос при этом ещё не ушёл, дублей нет).
// Для полной надёжности в config.php можно указать прокси (Cloudflare Worker из папки worker/) в telegram_api.

function tg_call(string $method, array $params = [], bool $multipart = false, int $timeout = 15)
{
    $config = ll_config();
    if ($config['bot_token'] === '') throw new RuntimeException('Telegram: не задан bot_token');
    $headers = [];
    if (!empty($config['telegram_proxy_secret'])) $headers[] = 'X-Proxy-Secret: ' . $config['telegram_proxy_secret'];
    if (!$multipart) $headers[] = 'Content-Type: application/json';
    $direct = str_contains((string) $config['telegram_api'], 'api.telegram.org');
    for ($attempt = 1; ; $attempt++) {
        $ch = curl_init(rtrim((string) $config['telegram_api'], '/') . '/bot' . $config['bot_token'] . '/' . $method);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $multipart ? $params : json_encode($params, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => $timeout,
            // IPv4-адреса Telegram с хостинга недоступны, сразу идём по IPv6
            CURLOPT_IPRESOLVE => $direct ? CURL_IPRESOLVE_V6 : CURL_IPRESOLVE_WHATEVER,
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $connected = (float) curl_getinfo($ch, CURLINFO_CONNECT_TIME) > 0;
        $error = curl_error($ch);
        curl_close($ch);
        if ($body !== false || $connected || $attempt >= 5) break;
        usleep(300000);
    }
    if ($body === false) throw new RuntimeException("Telegram $method: $error");
    $data = json_decode((string) $body, true);
    // Код исключения: 0 — Telegram недоступен по сети, иначе код ошибки Telegram (400, 403…)
    if (!is_array($data) || empty($data['ok'])) throw new RuntimeException("Telegram $method: " . ($data['description'] ?? "HTTP $status"), max(1, (int) ($data['error_code'] ?? $status)));
    return $data['result'];
}

function tg_send_message($chatId, string $text, array $extra = [])
{
    return tg_call('sendMessage', array_merge(['chat_id' => $chatId, 'text' => $text, 'parse_mode' => 'HTML', 'link_preview_options' => ['is_disabled' => true]], $extra));
}

function tg_edit_message_text($chatId, int $messageId, string $text, array $extra = [])
{
    return tg_call('editMessageText', array_merge(['chat_id' => $chatId, 'message_id' => $messageId, 'text' => $text, 'parse_mode' => 'HTML', 'link_preview_options' => ['is_disabled' => true]], $extra));
}

function tg_answer_callback(string $id, string $text)
{
    return tg_call('answerCallbackQuery', ['callback_query_id' => $id, 'text' => $text]);
}

function tg_send_photos($chatId, array $files, ?int $replyTo)
{
    if (!$files) return null;
    $form = ['chat_id' => (string) $chatId];
    if ($replyTo) $form['reply_parameters'] = json_encode(['message_id' => $replyTo, 'allow_sending_without_reply' => true]);
    $mime = fn($f) => ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][pathinfo($f, PATHINFO_EXTENSION)] ?? 'application/octet-stream';
    if (count($files) === 1) {
        $form['photo'] = new CURLFile($files[0], $mime($files[0]), basename($files[0]));
        return tg_call('sendPhoto', $form, true, 45);
    }
    $media = [];
    foreach (array_values($files) as $i => $file) {
        $media[] = ['type' => 'photo', 'media' => "attach://p$i"];
        $form["p$i"] = new CURLFile($file, $mime($file), basename($file));
    }
    $form['media'] = json_encode($media);
    return tg_call('sendMediaGroup', $form, true, 45);
}

function tg_send_document($chatId, string $name, string $content, string $caption = '')
{
    $form = ['chat_id' => (string) $chatId, 'document' => new CURLStringFile($content, $name, 'text/csv')];
    if ($caption !== '') $form['caption'] = $caption;
    return tg_call('sendDocument', $form, true, 45);
}
