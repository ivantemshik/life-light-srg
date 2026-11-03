import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Поддельный Telegram Bot API: стоит на месте Cloudflare Worker и записывает запросы.
const calls = [];
const updates = [];
let messageId = 100;
const mockTelegram = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const method = req.url.split('/').pop();
    const raw = Buffer.concat(chunks);
    const body = (req.headers['content-type'] || '').includes('json') ? JSON.parse(raw.toString() || '{}') : { multipart: true, size: raw.length };
    calls.push({ method, body, secret: req.headers['x-proxy-secret'], path: req.url });
    let result = true;
    if (method === 'sendMessage' || method === 'sendPhoto' || method === 'sendDocument') result = { message_id: ++messageId };
    if (method === 'sendMediaGroup') result = [{ message_id: ++messageId }];
    if (method === 'getUpdates') {
      if (!updates.length) await new Promise((r) => setTimeout(r, 150));
      result = updates.splice(0);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, result }));
  });
});

const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
let app; let base; let dataDir;
const waitFor = async (check, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = check(); if (v) return v; await new Promise((r) => setTimeout(r, 30)); } throw new Error('timeout'); };
const post = (body, headers = {}) => fetch(`${base}/api/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const valid = { name: 'Иван', contact: '+7 900 123-45-67', segment: 'home', zones: ['facade', 'garden', 'hack'], timing: 'urgent', comment: 'Фасад и ель', consent: true, photos: [JPEG, JPEG], utm: { utm_source: 'yandex', utm_medium: 'cpc', utm_campaign: 'dom' }, ymClientId: '1700000000123' };

before(async () => {
  await new Promise((r) => mockTelegram.listen(0, '127.0.0.1', r));
  dataDir = mkdtempSync(path.join(tmpdir(), 'll-test-'));
  Object.assign(process.env, {
    PORT: '0', HOST: '127.0.0.1', DATA_DIR: dataDir, SERVE_STATIC: '1', ALLOWED_ORIGINS: 'https://example.vercel.app', RATE_LIMIT_MAX: '50',
    TELEGRAM_BOT_TOKEN: '123:TEST', TELEGRAM_API_BASE: `http://127.0.0.1:${mockTelegram.address().port}`, TELEGRAM_PROXY_SECRET: 'proxy-secret',
    TELEGRAM_CHAT_ID: '-1001', TELEGRAM_MODE: 'polling', METRIKA_COUNTER_ID: '', METRIKA_TOKEN: ''
  });
  const { loadConfig } = await import('../server/config.mjs');
  const { createApp } = await import('../server/index.mjs');
  app = createApp(loadConfig(), { log: { info() {}, error() {} } });
  const address = await app.listen();
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await app.close();
  await new Promise((r) => mockTelegram.close(r));
  mockTelegram.closeAllConnections?.();
  rmSync(dataDir, { recursive: true, force: true });
});

test('заявка с фото сохраняется в базе и уходит в Telegram через прокси', async () => {
  const res = await post(valid);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.id, 1);
  const lead = app.repo.getLead(1);
  assert.equal(lead.name, 'Иван');
  assert.equal(lead.photos, 2);
  assert.equal(lead.source, 'yandex / cpc');
  assert.equal(lead.ym_client_id, '1700000000123');
  assert.equal(lead.zones, 'facade,garden');
  assert.equal(lead.timing, 'urgent');
  assert.ok(existsSync(path.join(dataDir, 'uploads', '1', '1.jpg')));
  const message = await waitFor(() => calls.find((c) => c.method === 'sendMessage' && c.body.text?.includes('Заявка №1')));
  assert.equal(message.secret, 'proxy-secret');
  assert.equal(message.body.chat_id, '-1001');
  assert.match(message.body.text, /tel:\+79001234567/);
  assert.match(message.body.text, /Срочно/);
  assert.match(message.body.text, /Фасад и кровля, Деревья и сад/);
  assert.ok(message.body.reply_markup.inline_keyboard.flat().some((b) => b.callback_data === 'st:1:in_progress'));
  await waitFor(() => calls.find((c) => c.method === 'sendMediaGroup'));
  await waitFor(() => app.repo.getLead(1).tg_notified === 1);
});

test('кнопка под заявкой меняет статус и подписывает менеджера', async () => {
  const lead = app.repo.getLead(1);
  updates.push({ update_id: 1, callback_query: { id: 'cb1', data: 'st:1:in_progress', from: { id: 7, first_name: 'Мария' }, message: { message_id: lead.tg_message_id, chat: { id: -1001 } } } });
  await waitFor(() => app.repo.getLead(1).status === 'in_progress');
  assert.equal(app.repo.getLead(1).manager, 'Мария');
  const edit = await waitFor(() => calls.find((c) => c.method === 'editMessageText'));
  assert.match(edit.body.text, /В работе/);
  assert.match(edit.body.text, /Менеджер:<\/b> Мария/);
});

test('ответ на сообщение заявки сохраняется как заметка', async () => {
  const lead = app.repo.getLead(1);
  updates.push({ update_id: 2, message: { message_id: 500, text: 'Перезвонить завтра в 10', chat: { id: -1001 }, from: { id: 7, first_name: 'Мария' }, reply_to_message: { message_id: lead.tg_message_id } } });
  await waitFor(() => app.repo.events(1).some((e) => e.action === 'note'));
  assert.equal(app.repo.events(1).find((e) => e.action === 'note').value, 'Перезвонить завтра в 10');
});

test('команда /stats присылает статистику заявок', async () => {
  updates.push({ update_id: 3, message: { message_id: 501, text: '/stats', chat: { id: -1001 }, from: { id: 7, first_name: 'Мария' } } });
  const stats = await waitFor(() => calls.find((c) => c.method === 'sendMessage' && c.body.text?.includes('Заявки с сайта')));
  assert.match(stats.body.text, /30 дней: <b>1<\/b>/);
  assert.match(stats.body.text, /Метрика не подключена/);
});

test('чужой чат не управляет заявками', async () => {
  updates.push({ update_id: 4, callback_query: { id: 'cb2', data: 'st:1:spam', from: { id: 99, first_name: 'Чужой' }, message: { message_id: 1, chat: { id: 555 } } } });
  await waitFor(() => calls.find((c) => c.method === 'answerCallbackQuery' && c.body.callback_query_id === 'cb2'));
  assert.equal(app.repo.getLead(1).status, 'in_progress');
});

test('неверные данные отклоняются с понятной ошибкой', async () => {
  let res = await post({ ...valid, contact: '123' });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).field, 'contact');
  res = await post({ ...valid, consent: false });
  assert.equal(res.status, 422);
  res = await post({ ...valid, photos: ['data:image/jpeg;base64,AAAA'] });
  assert.equal(res.status, 422);
  res = await fetch(`${base}/api/leads`, { method: 'POST', body: 'not json' });
  assert.equal(res.status, 400);
});

test('ловушка для ботов не создаёт заявку', async () => {
  const before = app.repo.all().length;
  const res = await post({ ...valid, website: 'http://spam' });
  assert.equal(res.status, 200);
  assert.equal(app.repo.all().length, before);
});

test('CORS разрешён только для указанных доменов', async () => {
  let res = await fetch(`${base}/api/leads`, { method: 'OPTIONS', headers: { Origin: 'https://example.vercel.app' } });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://example.vercel.app');
  res = await fetch(`${base}/api/leads`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('сервер отдаёт сайт, но не свои файлы и не базу', async () => {
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/assets/project-terrace.webp`)).status, 200);
  for (const p of ['/server/index.mjs', '/server/.env', '/data/leads.sqlite', '/package.json', '/.git/config', '/assets/../server/db.mjs']) {
    assert.equal((await fetch(`${base}${p}`)).status, 404, p);
  }
});

test('ограничение частоты срабатывает', async () => {
  const { createRateLimiter } = await import('../server/leads.mjs');
  const allow = createRateLimiter({ max: 2, windowMs: 60_000 });
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), false);
  assert.equal(allow('b'), true);
});
