<?php
declare(strict_types=1);

// Логика бота заявок: карточка заявки с кнопками статусов, заметки ответом на заявку,
// команды /new /leads /lead_N /stats /metrika /export, ежедневный отчёт. Повторяет server/bot.mjs.

const LL_STATUS_MARK = ['new' => '🆕', 'in_progress' => '🔧', 'estimate' => '📐', 'contract' => '✅', 'rejected' => '✖️', 'spam' => '🚫'];

function ll_esc($s): string
{
    return htmlspecialchars((string) $s, ENT_NOQUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

// Ячейку, которая начинается с = + - @, Excel считает формулой: экранируем апострофом
function ll_csv_cell($value): string
{
    $t = (string) ($value ?? '');
    if (preg_match('/^[=+@\t\r-]/', $t)) $t = "'" . $t;
    return '"' . str_replace('"', '""', $t) . '"';
}

function ll_pct(int $a, int $b): string
{
    return $b ? round($a / $b * 100) . '%' : '0%';
}

function ll_fmt_time(string $iso): string
{
    $tz = new DateTimeZone((string) ll_config()['timezone']);
    return (new DateTimeImmutable($iso))->setTimezone($tz)->format('d.m.Y, H:i');
}

function ll_contact_link(string $contact): string
{
    $digits = preg_replace('/\D/', '', $contact) ?? '';
    if (preg_match('/^[+\d\s()-]+$/u', $contact) && strlen($digits) >= 10) {
        $phone = strlen($digits) === 11 && $digits[0] === '8' ? '7' . substr($digits, 1) : (strlen($digits) === 10 ? '7' . $digits : $digits);
        return '<a href="tel:+' . $phone . '">' . ll_esc($contact) . '</a>';
    }
    $nick = preg_replace(['~^https?://t\.me/~', '/^@/'], '', $contact) ?? '';
    return '<a href="https://t.me/' . ll_esc($nick) . '">@' . ll_esc($nick) . '</a>';
}

function ll_lead_text(array $lead): string
{
    $lines = [
        ($lead['timing'] === 'urgent' ? '🔥 <b>Срочно</b> · ' : '') . (LL_STATUS_MARK[$lead['status']] ?? '') . ' <b>Заявка №' . $lead['id'] . '</b> · ' . ll_esc(LL_STATUSES[$lead['status']] ?? $lead['status']),
        '',
        '<b>Имя:</b> ' . ll_esc($lead['name']),
        '<b>Контакт:</b> ' . ll_contact_link($lead['contact']),
        '<b>Объект:</b> ' . ll_esc(LL_SEGMENTS[$lead['segment']] ?? $lead['segment']),
    ];
    if ($lead['zones'] !== '') $lines[] = '<b>Что подсветить:</b> ' . ll_esc(implode(', ', array_map(fn($z) => LL_ZONES[$z] ?? $z, explode(',', $lead['zones']))));
    if ($lead['timing'] !== '') $lines[] = '<b>Когда:</b> ' . ll_esc(LL_TIMINGS[$lead['timing']] ?? $lead['timing']);
    if ($lead['comment'] !== '') $lines[] = '<b>Комментарий:</b> ' . ll_esc($lead['comment']);
    $lines[] = '<b>Фото:</b> ' . ($lead['photos'] ? $lead['photos'] . ' шт., ниже' : 'нет');
    $lines[] = '<b>Источник:</b> ' . ll_esc($lead['source']) . ($lead['utm_campaign'] !== '' ? ', кампания ' . ll_esc($lead['utm_campaign']) : '');
    $lines[] = '<b>Время:</b> ' . ll_fmt_time($lead['created_at']);
    if ($lead['manager'] !== '') $lines[] = '<b>Менеджер:</b> ' . ll_esc($lead['manager']);
    if ($lead['ym_client_id'] !== '') $lines[] = '<b>ClientID Метрики:</b> <code>' . ll_esc($lead['ym_client_id']) . '</code>';
    $lines[] = '';
    $lines[] = '<i>Ответьте на это сообщение, чтобы оставить заметку к заявке.</i>';
    return implode("\n", $lines);
}

function ll_keyboard(array $lead): array
{
    $btn = fn(string $status, string $text) => ['text' => $lead['status'] === $status ? "• $text" : $text, 'callback_data' => "st:{$lead['id']}:$status"];
    return ['inline_keyboard' => [
        [$btn('in_progress', 'Взять в работу'), $btn('estimate', 'Смета отправлена')],
        [$btn('contract', 'Договор'), $btn('rejected', 'Отказ'), $btn('spam', 'Спам')],
    ]];
}

// Отправляет заявку в чат менеджеров. Повторную отправку той же заявки не допускает.
function ll_notify_lead(int $id): bool
{
    $chatId = (string) ll_config()['chat_id'];
    if ($chatId === '') { ll_log("Заявка $id сохранена, но chat_id не задан"); return false; }
    if (!ll_claim_for_sending($id)) return false;
    try {
        $lead = ll_get_lead($id);
        $message = tg_send_message($chatId, ll_lead_text($lead), ['reply_markup' => ll_keyboard($lead)]);
    } catch (Throwable $e) {
        ll_release_claim($id);
        throw $e;
    }
    ll_mark_notified($id, $chatId, (int) $message['message_id']);
    if ($lead['photos']) ll_send_lead_photos($id, $chatId, (int) $message['message_id'], 0);
    return true;
}

// Фото идут отдельным сообщением ответом на карточку. Если не ушли, плановое задание повторит (до 12 раз, около часа).
function ll_send_lead_photos(int $id, string $chatId, int $messageId, int $tries): void
{
    try {
        tg_send_photos($chatId, ll_photo_files($id), $messageId);
        ll_query('DELETE FROM kv WHERE key = ?', ["photos_pending:$id"]);
    } catch (Throwable $e) {
        $tries++;
        ll_log("Фото к заявке $id не отправлены (попытка $tries): " . $e->getMessage());
        if ($tries < 12) ll_kv_set("photos_pending:$id", "$chatId|$messageId|$tries");
        else ll_query('DELETE FROM kv WHERE key = ?', ["photos_pending:$id"]);
    }
}

// Повторно отправляет заявки, которые не ушли в Telegram (минута форы, чтобы не пересечься с самой формой)
function ll_flush_pending(): void
{
    if ((string) ll_config()['chat_id'] === '') return;
    $cutoff = (new DateTimeImmutable('-1 minute', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
    ll_query("UPDATE leads SET tg_notified = 0 WHERE tg_notified = 2 AND updated_at < ?", [(new DateTimeImmutable('-15 minutes', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z')]);
    $rows = ll_query("SELECT id FROM leads WHERE tg_notified = 0 AND status != 'spam' AND created_at < ? ORDER BY id LIMIT 10", [$cutoff])->fetchAll();
    foreach ($rows as $row) {
        try { ll_notify_lead((int) $row['id']); }
        catch (Throwable $e) { ll_log("Заявка {$row['id']} пока не отправлена в Telegram: " . $e->getMessage()); break; }
    }
    foreach (ll_query("SELECT key, value FROM kv WHERE key LIKE 'photos_pending:%' LIMIT 5")->fetchAll() as $row) {
        [$chatId, $messageId, $tries] = array_pad(explode('|', $row['value']), 3, '0');
        ll_send_lead_photos((int) substr($row['key'], strlen('photos_pending:')), $chatId, (int) $messageId, (int) $tries);
    }
}

function ll_metrika_summary(int $days): array
{
    $config = ll_config();
    $query = function (array $params) use ($config) {
        $url = 'https://api-metrika.yandex.net/stat/v1/data?' . http_build_query(array_merge(['ids' => $config['metrika_counter_id'], 'accuracy' => 'full'], $params));
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_HTTPHEADER => ['Authorization: OAuth ' . $config['metrika_token']]]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        $data = json_decode((string) $body, true) ?: [];
        if ($status !== 200) throw new RuntimeException('Метрика: ' . ($data['message'] ?? $status));
        return $data;
    };
    $goal = (string) $config['metrika_lead_goal_id'];
    $date1 = ($days - 1) . 'daysAgo';
    $metrics = ['ym:s:visits', 'ym:s:users', 'ym:s:bounceRate', 'ym:s:pageDepth', 'ym:s:avgVisitDurationSeconds'];
    if ($goal !== '') array_push($metrics, "ym:s:goal{$goal}reaches", "ym:s:goal{$goal}conversionRate");
    $totals = $query(['metrics' => implode(',', $metrics), 'date1' => $date1, 'date2' => 'today'])['totals'] ?? [];
    $sources = [];
    try {
        $rows = $query(['metrics' => 'ym:s:visits', 'dimensions' => 'ym:s:lastsignTrafficSource', 'date1' => $date1, 'date2' => 'today', 'sort' => '-ym:s:visits', 'limit' => '5'])['data'] ?? [];
        foreach ($rows as $row) $sources[] = ['name' => $row['dimensions'][0]['name'] ?? 'неизвестно', 'visits' => $row['metrics'][0] ?? 0];
    } catch (Throwable $e) { /* источники необязательны */ }
    return [
        'visits' => $totals[0] ?? 0, 'users' => $totals[1] ?? 0, 'bounceRate' => $totals[2] ?? 0, 'pageDepth' => $totals[3] ?? 0, 'avgDuration' => $totals[4] ?? 0,
        'leads' => $goal !== '' ? ($totals[5] ?? 0) : null, 'conversion' => $goal !== '' ? ($totals[6] ?? 0) : null, 'sources' => $sources,
    ];
}

function ll_metrika_text(): string
{
    $config = ll_config();
    if ($config['metrika_counter_id'] === '' || $config['metrika_token'] === '') return '<i>Метрика не подключена: впишите metrika_counter_id и metrika_token в config.php на хостинге.</i>';
    try {
        $row = function (string $label, array $m): string {
            $parts = ["визиты {$m['visits']}", "посетители {$m['users']}", 'отказы ' . number_format((float) $m['bounceRate'], 1, '.', '') . '%',
                'глубина ' . number_format((float) $m['pageDepth'], 1, '.', ''), 'время ' . intdiv((int) round($m['avgDuration']), 60) . ' мин ' . ((int) round($m['avgDuration']) % 60) . ' с'];
            if ($m['leads'] !== null) array_push($parts, "заявки {$m['leads']}", 'конверсия ' . number_format((float) $m['conversion'], 2, '.', '') . '%');
            return "$label: " . implode(', ', $parts);
        };
        $week = ll_metrika_summary(7);
        $month = ll_metrika_summary(30);
        $lines = ['<b>Яндекс Метрика</b>', $row('7 дней', $week), $row('30 дней', $month)];
        if ($month['sources']) {
            $lines[] = '';
            $lines[] = '<b>Источники трафика, 30 дней</b>';
            foreach ($month['sources'] as $s) $lines[] = ll_esc($s['name']) . ': ' . $s['visits'];
        }
        return implode("\n", $lines);
    } catch (Throwable $e) {
        return '<i>Метрика не ответила: ' . ll_esc($e->getMessage()) . '</i>';
    }
}

function ll_stats_text(): string
{
    $tz = new DateTimeZone((string) ll_config()['timezone']);
    $iso = fn(DateTimeImmutable $d) => $d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
    $periods = [
        ['Сегодня', $iso(new DateTimeImmutable('today', $tz))],
        ['7 дней', $iso(new DateTimeImmutable('-7 days', $tz))],
        ['30 дней', $iso(new DateTimeImmutable('-30 days', $tz))],
    ];
    $lines = ['<b>Заявки с сайта</b>'];
    foreach ($periods as [$label, $since]) {
        $s = ll_stats($since);
        $contracts = 0;
        foreach ($s['byStatus'] as $r) if ($r['status'] === 'contract') $contracts = (int) $r['n'];
        $lines[] = "$label: <b>{$s['total']}</b>" . ($s['total'] ? ", с фото {$s['withPhotos']}, договоров $contracts (" . ll_pct($contracts, $s['total']) . ')' : '');
    }
    $month = ll_stats($periods[2][1]);
    if ($month['total']) {
        $lines[] = '';
        $lines[] = '<b>За 30 дней по статусам</b>';
        foreach ($month['byStatus'] as $r) $lines[] = (LL_STATUS_MARK[$r['status']] ?? '') . ' ' . ll_esc(LL_STATUSES[$r['status']] ?? $r['status']) . ': ' . $r['n'];
        $lines[] = '';
        $lines[] = '<b>По типу объекта</b>';
        foreach ($month['bySegment'] as $r) $lines[] = ll_esc(LL_SEGMENTS[$r['segment']] ?? $r['segment']) . ': ' . $r['n'];
        if ($month['byTiming']) {
            $lines[] = '';
            $lines[] = '<b>Сроки</b>';
            foreach ($month['byTiming'] as $r) $lines[] = ll_esc(LL_TIMINGS[$r['timing']] ?? $r['timing']) . ': ' . $r['n'];
        }
        $lines[] = '';
        $lines[] = '<b>Источники заявок</b>';
        foreach ($month['bySource'] as $r) $lines[] = ll_esc($r['source']) . ': ' . $r['n'];
    }
    $open = count(ll_list_by_status(['new'], 100));
    if ($open) { $lines[] = ''; $lines[] = "Не разобрано новых: <b>$open</b>. Список: /new"; }
    $lines[] = '';
    $lines[] = ll_metrika_text();
    return implode("\n", $lines);
}

function ll_list_text(array $leads, string $title): string
{
    if (!$leads) return "$title: пусто.";
    $lines = ["<b>$title</b>"];
    foreach ($leads as $l) {
        $lines[] = (LL_STATUS_MARK[$l['status']] ?? '') . " №{$l['id']} " . ll_esc($l['name']) . ', ' . ll_esc(LL_SEGMENTS[$l['segment']] ?? $l['segment']) . ', ' . ll_fmt_time($l['created_at'])
            . ($l['manager'] !== '' ? ', ' . ll_esc($l['manager']) : '') . ". /lead_{$l['id']}";
    }
    return implode("\n", $lines);
}

function ll_csv(): string
{
    $cols = ['id', 'created_at', 'status', 'name', 'contact', 'segment', 'zones', 'timing', 'comment', 'photos', 'manager', 'source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'ym_client_id', 'page', 'referrer'];
    $rows = [implode(';', $cols)];
    foreach (ll_query('SELECT * FROM leads ORDER BY id')->fetchAll() as $lead) $rows[] = implode(';', array_map(fn($c) => ll_csv_cell($lead[$c]), $cols));
    return "\u{FEFF}" . implode("\r\n", $rows);
}

const LL_HELP = "<b>Бот заявок «Жизнь-свет»</b>\n"
    . "Новые заявки с сайта приходят сюда с фото. Кнопки под заявкой меняют статус, ответ на сообщение заявки сохраняет заметку.\n\n"
    . "/new: новые, неразобранные заявки\n/leads: заявки в работе\n/lead_12: карточка и история заявки №12\n"
    . "/stats: статистика заявок и Метрики\n/metrika: показатели Метрики\n/export: все заявки файлом CSV";

function ll_allowed(?array $chat, ?array $user): bool
{
    $config = ll_config();
    $chatId = (string) $config['chat_id'];
    return ($chatId !== '' && (string) ($chat['id'] ?? '') === $chatId) || ($user && in_array((string) ($user['id'] ?? ''), $config['admin_ids'], true));
}

function ll_actor_name(?array $user): string
{
    $name = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));
    if ($name !== '') return $name;
    return !empty($user['username']) ? '@' . $user['username'] : 'id' . ($user['id'] ?? '');
}

function ll_handle_message(array $msg): void
{
    $text = trim((string) ($msg['text'] ?? ''));
    $chat = $msg['chat'] ?? [];
    $from = $msg['from'] ?? null;
    if ((string) ll_config()['chat_id'] === '' && $chat) {
        ll_log('Бот получил сообщение, ID чата для config.php: ' . ($chat['id'] ?? ''));
        if (!empty($msg['new_chat_members']) || !empty($msg['group_chat_created'])) tg_send_message($chat['id'], 'Бот добавлен. ID этой группы: <code>' . $chat['id'] . '</code>. Впишите его в chat_id в config.php на хостинге.');
    }
    if (!ll_allowed($chat, $from)) {
        if (str_starts_with($text, '/start') || str_starts_with($text, '/id')) tg_send_message($chat['id'], 'Этот бот работает только в чате заявок. ID этого чата: <code>' . $chat['id'] . '</code>, ваш ID: <code>' . ($from['id'] ?? '') . '</code>.');
        return;
    }
    $reply = fn(string $t, array $extra = []) => tg_send_message($chat['id'], $t, $extra);
    $cmd = strtolower(preg_replace('/@\w+$/', '', preg_split('/\s+/', $text)[0] ?? '') ?? '');

    if (!empty($msg['reply_to_message']) && !str_starts_with($text, '/')) {
        $lead = ll_find_by_message((string) $chat['id'], (int) $msg['reply_to_message']['message_id']);
        if ($lead && $text !== '') {
            ll_add_event((int) $lead['id'], ll_actor_name($from), 'note', mb_substr($text, 0, 2000));
            $reply("Заметка сохранена к заявке №{$lead['id']}.", ['reply_parameters' => ['message_id' => $msg['message_id']]]);
        }
        return;
    }
    if ($cmd === '/start' || $cmd === '/help') { $reply(LL_HELP . "\n\nID этого чата: <code>{$chat['id']}</code>"); return; }
    if ($cmd === '/id') { $reply("ID чата: <code>{$chat['id']}</code>, ваш ID: <code>" . ($from['id'] ?? '') . '</code>'); return; }
    if ($cmd === '/new') { $reply(ll_list_text(ll_list_by_status(['new']), 'Новые заявки')); return; }
    if ($cmd === '/leads') { $reply(ll_list_text(ll_list_by_status(LL_OPEN_STATUSES), 'Заявки в работе')); return; }
    if ($cmd === '/stats') { $reply(ll_stats_text()); return; }
    if ($cmd === '/metrika') { $reply(ll_metrika_text()); return; }
    if ($cmd === '/export') { tg_send_document($chat['id'], 'leads-' . gmdate('Y-m-d') . '.csv', ll_csv(), 'Все заявки с сайта. Открывается в Excel.'); return; }
    if (preg_match('/^\/lead_?(\d+)$/', $cmd, $m) || ($cmd === '/lead' && preg_match('/\s(\d+)/', $text, $m))) {
        $lead = ll_get_lead((int) $m[1]);
        if (!$lead) { $reply('Такой заявки нет.'); return; }
        $history = [];
        foreach (ll_events((int) $lead['id']) as $e) {
            $what = $e['action'] === 'status' ? 'статус «' . ll_esc(LL_STATUSES[$e['value']] ?? $e['value']) . '»' : ($e['action'] === 'note' ? 'заметка «' . ll_esc($e['value']) . '»' : 'заявка создана');
            $history[] = ll_fmt_time($e['at']) . ' ' . ll_esc($e['actor']) . ": $what";
        }
        $reply(ll_lead_text($lead) . "\n\n<b>История</b>\n" . implode("\n", $history), ['reply_markup' => ll_keyboard($lead)]);
    }
}

function ll_handle_callback(array $q): void
{
    if (!preg_match('/^st:(\d+):(\w+)$/', (string) ($q['data'] ?? ''), $m)) { tg_answer_callback($q['id'], ''); return; }
    if (!ll_allowed($q['message']['chat'] ?? null, $q['from'] ?? null)) { tg_answer_callback($q['id'], 'Нет доступа'); return; }
    $lead = ll_set_status((int) $m[1], $m[2], ll_actor_name($q['from'] ?? null));
    if (!$lead) { tg_answer_callback($q['id'], 'Заявка не найдена'); return; }
    tg_answer_callback($q['id'], 'Статус: ' . LL_STATUSES[$lead['status']]);
    try { tg_edit_message_text($q['message']['chat']['id'], (int) $q['message']['message_id'], ll_lead_text($lead), ['reply_markup' => ll_keyboard($lead)]); }
    catch (Throwable $e) { if (!str_contains($e->getMessage(), 'not modified')) throw $e; }
}

function ll_handle_update(array $update): void
{
    try {
        if (isset($update['callback_query'])) ll_handle_callback($update['callback_query']);
        elseif (isset($update['message'])) ll_handle_message($update['message']);
    } catch (Throwable $e) {
        ll_log('Ошибка обработки обновления Telegram: ' . $e->getMessage());
    }
}

// Ежедневный отчёт в чат заявок, один раз в день в заданный час
function ll_daily_report(): void
{
    $config = ll_config();
    if ($config['daily_report_hour'] === null || $config['daily_report_hour'] === '' || (string) $config['chat_id'] === '') return;
    $now = new DateTimeImmutable('now', new DateTimeZone((string) $config['timezone']));
    $day = $now->format('Y-m-d');
    if ((int) $now->format('G') !== (int) $config['daily_report_hour'] || ll_kv_get('daily_report_day') === $day) return;
    ll_kv_set('daily_report_day', $day);
    try { tg_send_message($config['chat_id'], "<b>Ежедневный отчёт</b>\n\n" . ll_stats_text()); }
    catch (Throwable $e) { ll_log('Отчёт не отправлен: ' . $e->getMessage()); }
}
