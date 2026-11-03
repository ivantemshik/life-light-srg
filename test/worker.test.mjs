import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/telegram-proxy.js';

const env = { PROXY_SECRET: 'top-secret', BOT_TOKEN: '123:ABC', UPSTREAM_WEBHOOK_URL: 'https://api.example.ru/api/telegram/webhook', WEBHOOK_SECRET: 'hook' };

function withFetch(handler, run) {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => { seen.push({ url: String(url), init }); return handler(url, init); };
  return run(seen).finally(() => { globalThis.fetch = original; });
}

test('прокси пересылает запрос бота на api.telegram.org', () => withFetch(
  () => new Response('{"ok":true,"result":{"message_id":1}}', { headers: { 'content-type': 'application/json' } }),
  async (seen) => {
    const res = await worker.fetch(new Request('https://proxy.workers.dev/bot123:ABC/sendMessage', { method: 'POST', headers: { 'X-Proxy-Secret': 'top-secret', 'content-type': 'application/json' }, body: '{"chat_id":1,"text":"hi"}' }), env);
    assert.equal(res.status, 200);
    assert.equal(seen[0].url, 'https://api.telegram.org/bot123:ABC/sendMessage');
    assert.equal(new TextDecoder().decode(seen[0].init.body), '{"chat_id":1,"text":"hi"}');
    assert.equal(seen[0].init.headers.get('x-proxy-secret'), null);
  }
));

test('без секрета или с чужим токеном прокси отказывает', () => withFetch(
  () => { throw new Error('не должно вызываться'); },
  async () => {
    const noSecret = await worker.fetch(new Request('https://proxy.workers.dev/bot123:ABC/getMe'), env);
    assert.equal(noSecret.status, 403);
    const otherBot = await worker.fetch(new Request('https://proxy.workers.dev/bot999:XYZ/getMe', { headers: { 'X-Proxy-Secret': 'top-secret' } }), env);
    assert.equal(otherBot.status, 403);
    const random = await worker.fetch(new Request('https://proxy.workers.dev/anything'), env);
    assert.equal(random.status, 404);
  }
));

test('webhook от Telegram уходит на российский сервер', () => withFetch(
  () => new Response('{"ok":true}'),
  async (seen) => {
    const res = await worker.fetch(new Request('https://proxy.workers.dev/webhook', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'hook' }, body: '{"update_id":1}' }), env);
    assert.equal(res.status, 200);
    assert.equal(seen[0].url, env.UPSTREAM_WEBHOOK_URL);
    const bad = await worker.fetch(new Request('https://proxy.workers.dev/webhook', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'wrong' }, body: '{}' }), env);
    assert.equal(bad.status, 403);
  }
));
