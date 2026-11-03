<?php
declare(strict_types=1);

// Проверка PHP-версии сервера заявок без Telegram и без настоящей базы.
// Запуск: LL_DATA_DIR=$(mktemp -d) php test/php-selftest.php   (на хостинге: php ~/selftest/test/php-selftest.php)
$root = dirname(__DIR__);
require $root . '/api/lib/app.php';
require $root . '/api/lib/telegram.php';
require $root . '/api/lib/bot.php';

$failed = 0;
function check(string $name, bool $ok): void
{
    global $failed;
    echo ($ok ? 'ok   ' : 'FAIL ') . $name . "\n";
    if (!$ok) $failed++;
}

if (!getenv('LL_DATA_DIR')) { fwrite(STDERR, "Задайте LL_DATA_DIR на временную папку\n"); exit(1); }

$jpeg = 'data:image/jpeg;base64,' . base64_encode("\xFF\xD8\xFF\xE0" . str_repeat('x', 100));
$good = ['name' => 'Анна', 'contact' => '+7 900 123-45-67', 'consent' => true, 'segment' => 'home', 'comment' => '=SUM(1)', 'photos' => [$jpeg],
    'page' => 'https://xn--b1agbee5a2ak0g.xn--p1ai/', 'referrer' => 'https://yandex.ru/search', 'utm' => [], 'ymClientId' => '17000-abc'];

$r = ll_validate_lead($good, 'hash', 'UA');
check('валидная заявка принимается', isset($r['lead']) && count($r['photos']) === 1);
check('источник из реферера Яндекса', ($r['lead']['source'] ?? '') === 'yandex / organic');
check('ClientID только цифры', ($r['lead']['ym_client_id'] ?? '') === '17000');
check('короткое имя отклоняется', (ll_validate_lead(['name' => 'А'] + $good, 'h', '')['field'] ?? '') === 'name');
check('неверный контакт отклоняется', (ll_validate_lead(['contact' => '123'] + $good, 'h', '')['field'] ?? '') === 'contact');
check('ник Telegram принимается', ll_is_contact('@life_light'));
check('без согласия отклоняется', (ll_validate_lead(['consent' => false] + $good, 'h', '')['field'] ?? '') === 'consent');
check('не картинка отклоняется', (ll_validate_lead(['photos' => ['data:image/jpeg;base64,' . base64_encode('hello')]] + $good, 'h', '')['field'] ?? '') === 'photos');
check('больше 5 фото отклоняется', (ll_validate_lead(['photos' => array_fill(0, 6, $jpeg)] + $good, 'h', '')['field'] ?? '') === 'photos');
check('свой домен в реферере считается прямым заходом', ll_source_of(['utm_source' => '', 'utm_medium' => '', 'yclid' => ''], 'https://www.xn--b1agbee5a2ak0g.xn--p1ai/x', 'https://xn--b1agbee5a2ak0g.xn--p1ai/') === 'direct');
check('UTM важнее реферера', ll_source_of(['utm_source' => 'vk', 'utm_medium' => 'cpc', 'yclid' => ''], 'https://yandex.ru', '') === 'vk / cpc');

$lead = ll_create_lead($r['lead']);
$id = (int) $lead['id'];
ll_set_photos($id, ll_save_photos($id, $r['photos']));
check('заявка сохранена с фото', ll_get_lead($id)['photos'] === 1 && count(ll_photo_files($id)) === 1);
check('первым забрать на отправку может только один', ll_claim_for_sending($id) && !ll_claim_for_sending($id));
ll_release_claim($id);
check('после ошибки заявку снова можно отправить', ll_claim_for_sending($id));

$text = ll_lead_text(ll_get_lead($id));
check('карточка заявки содержит номер и ссылку на телефон', str_contains($text, "Заявка №$id") && str_contains($text, 'tel:+79001234567'));
check('карточка экранирует HTML', !str_contains(ll_lead_text(['comment' => '<b>x</b>'] + ll_get_lead($id)), '<b>x</b>'));
check('ник Telegram в карточке ссылкой', str_contains(ll_contact_link('@life_light'), 'https://t.me/life_light'));

$updated = ll_set_status($id, 'in_progress', 'Иван');
check('статус и менеджер меняются', $updated['status'] === 'in_progress' && $updated['manager'] === 'Иван');
check('неизвестный статус не принимается', ll_set_status($id, 'hack', 'Иван') === null);
ll_add_event($id, 'Иван', 'note', 'перезвонить');
check('история хранит создание, статус и заметку', count(ll_events($id)) === 3);

$csv = ll_csv();
check('CSV с BOM и защитой от формул', str_starts_with($csv, "\u{FEFF}id;") && str_contains($csv, "\"'=SUM(1)\""));
check('статистика считает заявку', str_contains(ll_stats_text(), 'Сегодня: <b>1</b>'));
check('список новых пуст после взятия в работу', ll_list_text(ll_list_by_status(['new']), 'Новые заявки') === 'Новые заявки: пусто.');

check('ограничение частоты', ll_rate_allow('k') && ll_rate_allow('k') && ll_rate_allow('k') && ll_rate_allow('k') && ll_rate_allow('k') && !ll_rate_allow('k'));

echo $failed ? "\nОшибок: $failed\n" : "\nВсе проверки пройдены\n";
exit($failed ? 1 : 0);
