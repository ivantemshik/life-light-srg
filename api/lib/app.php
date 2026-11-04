<?php
declare(strict_types=1);

// Сервер заявок «Жизнь-свет» для хостинга с PHP (reg.ru): форма сайта → SQLite → Telegram-бот через webhook.
// Повторяет логику server/*.mjs, чтобы работать без постоянно запущенного процесса.
// Настройки, база и фото лежат вне папки сайта: ~/life-light-data (config.php, leads.sqlite, uploads/).

const LL_STATUSES = ['new' => 'Новая', 'in_progress' => 'В работе', 'estimate' => 'Смета отправлена', 'contract' => 'Договор', 'rejected' => 'Отказ', 'spam' => 'Спам'];
const LL_OPEN_STATUSES = ['new', 'in_progress', 'estimate'];
const LL_SEGMENTS = ['home' => 'Частный дом', 'business' => 'Кафе, магазин, офис', 'mall' => 'ТЦ или БЦ', 'other' => 'Другое'];
const LL_ZONES = ['facade' => 'Фасад и кровля', 'garden' => 'Деревья и сад', 'terrace' => 'Терраса или беседка', 'newyear' => 'Новогодний декор', 'sign' => 'Вывеска или витрина', 'unsure' => 'Пока не знает'];
const LL_TIMINGS = ['newyear' => 'К Новому году', 'urgent' => 'Срочно, за 24 часа', 'later' => 'Круглый год, без спешки', 'browsing' => 'Присматривается'];
const LL_MAX_PHOTOS = 5;
const LL_MAX_PHOTO_BYTES = 4 * 1024 * 1024;

// ---------- Настройки

function ll_data_dir(): string
{
    $dir = getenv('LL_DATA_DIR');
    // api/lib → api → сайт → www → домашняя папка
    return $dir ?: dirname(__DIR__, 4) . '/life-light-data';
}

function ll_config(): array
{
    static $config = null;
    if ($config !== null) return $config;
    $file = ll_data_dir() . '/config.php';
    $raw = is_file($file) ? require $file : [];
    $config = array_replace([
        'bot_token' => '',
        'chat_id' => '',
        'admin_ids' => [],
        'webhook_secret' => '',
        'ip_salt' => 'change-me',
        'timezone' => 'Europe/Moscow',
        'daily_report_hour' => 10,
        // polling: бот сам забирает сообщения из Telegram (cron каждую минуту). webhook: Telegram присылает их на /api/telegram/webhook
        'telegram_mode' => 'polling',
        'allowed_origins' => [],
        'rate_limit_max' => 5,
        'rate_limit_window_min' => 10,
        'telegram_api' => 'https://api.telegram.org',
        'metrika_counter_id' => '',
        'metrika_token' => '',
        'metrika_lead_goal_id' => '',
    ], is_array($raw) ? $raw : []);
    $config['admin_ids'] = array_map('strval', (array) $config['admin_ids']);
    // Токен Метрики можно положить отдельным файлом: в нём только токен, править config.php не нужно
    $tokenFile = ll_data_dir() . '/metrika_token.txt';
    if ($config['metrika_token'] === '' && is_file($tokenFile)) $config['metrika_token'] = trim((string) file_get_contents($tokenFile));
    return $config;
}

function ll_log(string $message): void
{
    $dir = ll_data_dir();
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    @file_put_contents($dir . '/server.log', '[' . gmdate('Y-m-d H:i:s') . "Z] $message\n", FILE_APPEND);
}

// ---------- База

function ll_db(): PDO
{
    static $db = null;
    if ($db) return $db;
    $dir = ll_data_dir();
    if (!is_dir($dir)) mkdir($dir, 0700, true);
    $db = new PDO('sqlite:' . $dir . '/leads.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $db->exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    $db->exec(<<<SQL
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  segment TEXT NOT NULL,
  zones TEXT NOT NULL DEFAULT '',
  timing TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  photos INTEGER NOT NULL DEFAULT 0,
  manager TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'direct',
  page TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  utm_content TEXT NOT NULL DEFAULT '',
  utm_term TEXT NOT NULL DEFAULT '',
  yclid TEXT NOT NULL DEFAULT '',
  ym_client_id TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  tg_chat_id TEXT NOT NULL DEFAULT '',
  tg_message_id INTEGER,
  tg_notified INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS leads_created ON leads (created_at);
CREATE INDEX IF NOT EXISTS leads_status ON leads (status);
CREATE TABLE IF NOT EXISTS lead_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads (id),
  at TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS lead_events_lead ON lead_events (lead_id);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hits (key TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS hits_key ON hits (key, at);
CREATE TABLE IF NOT EXISTS lead_messages (
  lead_id INTEGER NOT NULL REFERENCES leads (id),
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  PRIMARY KEY (lead_id, chat_id)
);
CREATE INDEX IF NOT EXISTS lead_messages_message ON lead_messages (chat_id, message_id);
SQL);
    // Карточки, отправленные до появления нескольких получателей
    $db->exec("INSERT OR IGNORE INTO lead_messages (lead_id, chat_id, message_id) SELECT id, tg_chat_id, tg_message_id FROM leads WHERE tg_message_id IS NOT NULL AND tg_chat_id != ''");
    return $db;
}

function ll_now(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
}

function ll_query(string $sql, array $params = []): PDOStatement
{
    $stmt = ll_db()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

function ll_create_lead(array $lead): array
{
    $at = ll_now();
    $cols = ['name', 'contact', 'segment', 'zones', 'timing', 'comment', 'photos', 'source', 'page', 'referrer',
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'ym_client_id', 'ip_hash', 'user_agent'];
    $values = array_map(fn($c) => $lead[$c] ?? '', $cols);
    ll_query('INSERT INTO leads (created_at, updated_at, ' . implode(', ', $cols) . ') VALUES (?, ?, ' . implode(', ', array_fill(0, count($cols), '?')) . ')',
        array_merge([$at, $at], $values));
    $id = (int) ll_db()->lastInsertId();
    ll_add_event($id, 'site', 'created', '');
    return ll_get_lead($id);
}

function ll_get_lead(int $id): ?array
{
    $row = ll_query('SELECT * FROM leads WHERE id = ?', [$id])->fetch();
    return $row ?: null;
}

function ll_add_event(int $id, string $actor, string $action, string $value): void
{
    ll_query('INSERT INTO lead_events (lead_id, at, actor, action, value) VALUES (?, ?, ?, ?, ?)', [$id, ll_now(), $actor, $action, $value]);
}

function ll_set_photos(int $id, int $count): void
{
    ll_query('UPDATE leads SET photos = ?, updated_at = ? WHERE id = ?', [$count, ll_now(), $id]);
}

function ll_set_status(int $id, string $status, string $actor): ?array
{
    $lead = ll_get_lead($id);
    if (!$lead || !isset(LL_STATUSES[$status])) return null;
    $takes = $status === 'in_progress' || ($lead['manager'] === '' && in_array($status, array_merge(LL_OPEN_STATUSES, ['contract']), true));
    ll_query('UPDATE leads SET status = ?, manager = ?, updated_at = ? WHERE id = ?', [$status, $takes ? $actor : $lead['manager'], ll_now(), $id]);
    ll_add_event($id, $actor, 'status', $status);
    return ll_get_lead($id);
}

function ll_events(int $id): array
{
    return ll_query('SELECT * FROM lead_events WHERE lead_id = ? ORDER BY id', [$id])->fetchAll();
}

// Заявку отправляет в Telegram только тот, кто первым её «забрал»: так форма и плановый повтор не пришлют её дважды.
function ll_claim_for_sending(int $id): bool
{
    return ll_query('UPDATE leads SET tg_notified = 2, updated_at = ? WHERE id = ? AND tg_notified = 0', [ll_now(), $id])->rowCount() === 1;
}

function ll_release_claim(int $id): void
{
    ll_query('UPDATE leads SET tg_notified = 0 WHERE id = ? AND tg_notified = 2', [$id]);
}

// Кому присылать заявки: каждому админу бота в личку и в общий чат chat_id, если он задан
function ll_recipients(): array
{
    $config = ll_config();
    $list = array_map('strval', array_merge([(string) $config['chat_id']], $config['admin_ids']));
    return array_values(array_unique(array_filter($list, fn($v) => $v !== '')));
}

// Копия карточки заявки у одного получателя. Первая копия пишется и в саму заявку.
function ll_add_lead_message(int $id, string $chatId, int $messageId): void
{
    ll_query('INSERT OR REPLACE INTO lead_messages (lead_id, chat_id, message_id) VALUES (?, ?, ?)', [$id, $chatId, $messageId]);
    ll_query('UPDATE leads SET tg_chat_id = ?, tg_message_id = ? WHERE id = ? AND tg_message_id IS NULL', [$chatId, $messageId, $id]);
}

function ll_lead_messages(int $id): array
{
    return ll_query('SELECT chat_id, message_id FROM lead_messages WHERE lead_id = ?', [$id])->fetchAll();
}

// Заявка по сообщению, на которое ответили: подходит любая копия карточки
function ll_find_by_message(string $chatId, int $messageId): ?array
{
    $row = ll_query('SELECT l.* FROM lead_messages m JOIN leads l ON l.id = m.lead_id WHERE m.chat_id = ? AND m.message_id = ?', [$chatId, $messageId])->fetch();
    if (!$row) $row = ll_query('SELECT * FROM leads WHERE tg_chat_id = ? AND tg_message_id = ?', [$chatId, $messageId])->fetch();
    return $row ?: null;
}

function ll_list_by_status(array $statuses, int $limit = 20): array
{
    $marks = implode(',', array_fill(0, count($statuses), '?'));
    return ll_query("SELECT * FROM leads WHERE status IN ($marks) ORDER BY id DESC LIMIT " . (int) $limit, $statuses)->fetchAll();
}

function ll_stats(string $sinceIso): array
{
    $where = "WHERE created_at >= ? AND status != 'spam'";
    $p = [$sinceIso];
    return [
        'total' => (int) ll_query("SELECT COUNT(*) FROM leads $where", $p)->fetchColumn(),
        'byStatus' => ll_query("SELECT status, COUNT(*) AS n FROM leads $where GROUP BY status ORDER BY n DESC", $p)->fetchAll(),
        'bySegment' => ll_query("SELECT segment, COUNT(*) AS n FROM leads $where GROUP BY segment ORDER BY n DESC", $p)->fetchAll(),
        'bySource' => ll_query("SELECT source, COUNT(*) AS n FROM leads $where GROUP BY source ORDER BY n DESC LIMIT 5", $p)->fetchAll(),
        'byTiming' => ll_query("SELECT timing, COUNT(*) AS n FROM leads $where AND timing != '' GROUP BY timing ORDER BY n DESC", $p)->fetchAll(),
        'withPhotos' => (int) ll_query("SELECT COUNT(*) FROM leads $where AND photos > 0", $p)->fetchColumn(),
    ];
}

function ll_kv_get(string $key): ?string
{
    $value = ll_query('SELECT value FROM kv WHERE key = ?', [$key])->fetchColumn();
    return $value === false ? null : (string) $value;
}

function ll_kv_set(string $key, string $value): void
{
    ll_query('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [$key, $value]);
}

// Не больше max заявок с одного адреса за окно (адрес хранится только хэшем)
function ll_rate_allow(string $key): bool
{
    $config = ll_config();
    $window = max(1, (int) $config['rate_limit_window_min']) * 60;
    $now = time();
    ll_query('DELETE FROM hits WHERE at < ?', [$now - $window]);
    $count = (int) ll_query('SELECT COUNT(*) FROM hits WHERE key = ?', [$key])->fetchColumn();
    if ($count >= (int) $config['rate_limit_max']) return false;
    ll_query('INSERT INTO hits (key, at) VALUES (?, ?)', [$key, $now]);
    return true;
}

// ---------- Проверка заявки

function ll_clean($value, int $max): string
{
    $text = is_scalar($value) ? (string) $value : '';
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text) ?? '';
    return mb_substr(trim($text), 0, $max);
}

function ll_is_contact(string $value): bool
{
    $v = trim($value);
    $digits = preg_replace('/\D/', '', $v) ?? '';
    if (preg_match('/^[+\d\s()-]+$/u', $v) && strlen($digits) >= 10 && strlen($digits) <= 15) return true;
    return (bool) preg_match('~^(@|https?://t\.me/)?[a-zA-Z][a-zA-Z0-9_]{4,31}$~', $v);
}

function ll_decode_photo($dataUrl): ?array
{
    if (!is_string($dataUrl) || !preg_match('~^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$~', $dataUrl, $m)) return null;
    $bytes = base64_decode(preg_replace('/\s+/', '', $m[2]) ?? '', true);
    if ($bytes === false || $bytes === '' || strlen($bytes) > LL_MAX_PHOTO_BYTES) return null;
    $isJpeg = substr($bytes, 0, 2) === "\xFF\xD8";
    $isPng = substr($bytes, 0, 8) === "\x89PNG\r\n\x1A\n";
    $isWebp = substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP';
    if (!($isJpeg || $isPng || $isWebp)) return null;
    return ['bytes' => $bytes, 'ext' => $isJpeg ? 'jpg' : ($isPng ? 'png' : 'webp')];
}

function ll_host(string $url): string
{
    $host = strtolower((string) parse_url($url, PHP_URL_HOST));
    return preg_replace('/^www\./', '', $host) ?? '';
}

function ll_source_of(array $utm, string $referrer, string $page): string
{
    if ($utm['utm_source'] !== '') return mb_substr(implode(' / ', array_filter([$utm['utm_source'], $utm['utm_medium']])), 0, 120);
    if ($utm['yclid'] !== '') return 'yandex / cpc';
    $host = ll_host($referrer);
    if ($host === '') return 'direct';
    if ($host === ll_host($page) || $host === 'localhost' || $host === '127.0.0.1') return 'direct';
    if (preg_match('/yandex\./', $host) || $host === 'ya.ru') return 'yandex / organic';
    if (preg_match('/google\./', $host)) return 'google / organic';
    return "$host / referral";
}

// Возвращает ['lead' => …, 'photos' => …] или ['error' => текст, 'field' => поле]
function ll_validate_lead($body, string $ipHash, string $userAgent): array
{
    if (!is_array($body)) return ['error' => 'Не удалось прочитать заявку.'];
    $name = ll_clean($body['name'] ?? '', 80);
    $contact = ll_clean($body['contact'] ?? '', 80);
    if (mb_strlen($name) < 2) return ['error' => 'Укажите имя.', 'field' => 'name'];
    if (!ll_is_contact($contact)) return ['error' => 'Укажите телефон или ник в Telegram.', 'field' => 'contact'];
    if (($body['consent'] ?? null) !== true) return ['error' => 'Нужно согласие на обработку персональных данных.', 'field' => 'consent'];
    $segment = is_string($body['segment'] ?? null) && isset(LL_SEGMENTS[$body['segment']]) ? $body['segment'] : 'other';
    $zones = array_values(array_unique(array_filter(is_array($body['zones'] ?? null) ? $body['zones'] : [], fn($z) => is_string($z) && isset(LL_ZONES[$z]))));
    $timing = is_string($body['timing'] ?? null) && isset(LL_TIMINGS[$body['timing']]) ? $body['timing'] : '';
    $rawPhotos = is_array($body['photos'] ?? null) ? array_values($body['photos']) : [];
    if (count($rawPhotos) > LL_MAX_PHOTOS) return ['error' => 'Можно приложить до ' . LL_MAX_PHOTOS . ' фото.', 'field' => 'photos'];
    $photos = [];
    foreach ($rawPhotos as $item) {
        $photo = ll_decode_photo($item);
        if (!$photo) return ['error' => 'Одно из фото не удалось прочитать. Пришлите JPG или PNG.', 'field' => 'photos'];
        $photos[] = $photo;
    }
    $utmIn = is_array($body['utm'] ?? null) ? $body['utm'] : [];
    $utm = [];
    foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid'] as $k) $utm[$k] = ll_clean($utmIn[$k] ?? '', 200);
    $referrer = ll_clean($body['referrer'] ?? '', 500);
    $page = ll_clean($body['page'] ?? '', 500);
    $lead = array_merge([
        'name' => $name,
        'contact' => $contact,
        'segment' => $segment,
        'zones' => implode(',', $zones),
        'timing' => $timing,
        'comment' => ll_clean($body['comment'] ?? '', 1500),
        'photos' => 0,
        'source' => ll_source_of($utm, $referrer, $page),
        'page' => $page,
        'referrer' => $referrer,
    ], $utm, [
        'ym_client_id' => preg_replace('/\D/', '', ll_clean($body['ymClientId'] ?? '', 40)) ?? '',
        'ip_hash' => $ipHash,
        'user_agent' => ll_clean($userAgent, 300),
    ]);
    return ['lead' => $lead, 'photos' => $photos];
}

function ll_hash_ip(string $ip): string
{
    return substr(hash('sha256', ll_config()['ip_salt'] . ':' . $ip), 0, 24);
}

function ll_client_ip(): string
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    // Если запрос пришёл от nginx того же сервера, настоящий адрес он кладёт в X-Real-IP
    if (in_array($ip, ['127.0.0.1', '::1'], true) && !empty($_SERVER['HTTP_X_REAL_IP'])) $ip = (string) $_SERVER['HTTP_X_REAL_IP'];
    return $ip;
}

function ll_save_photos(int $leadId, array $photos): int
{
    if (!$photos) return 0;
    $dir = ll_data_dir() . '/uploads/' . $leadId;
    if (!is_dir($dir)) mkdir($dir, 0700, true);
    foreach ($photos as $i => $photo) file_put_contents($dir . '/' . ($i + 1) . '.' . $photo['ext'], $photo['bytes']);
    return count($photos);
}

function ll_photo_files(int $leadId): array
{
    $files = glob(ll_data_dir() . '/uploads/' . $leadId . '/*.{jpg,png,webp}', GLOB_BRACE) ?: [];
    usort($files, fn($a, $b) => (int) basename($a) <=> (int) basename($b));
    return $files;
}

// ---------- Ответы

function ll_json(int $status, array $data): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
}

function ll_cors(): void
{
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    $allowed = (array) ll_config()['allowed_origins'];
    if ($origin !== '' && (in_array($origin, $allowed, true) || in_array('*', $allowed, true))) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Access-Control-Max-Age: 86400');
    }
}

function ll_cli_only(): void
{
    if (PHP_SAPI !== 'cli') {
        http_response_code(404);
        exit;
    }
}
