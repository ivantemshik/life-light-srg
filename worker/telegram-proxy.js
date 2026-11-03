// Cloudflare Worker: прокси между российским сервером и Telegram Bot API.
//
// 1. Сервер заявок шлёт запросы на https://<worker>/bot<TOKEN>/<method> с заголовком X-Proxy-Secret,
//    Worker пересылает их на api.telegram.org и возвращает ответ.
// 2. Режим webhook (необязательно): Telegram присылает обновления на https://<worker>/webhook,
//    Worker пересылает их на сервер заявок (UPSTREAM_WEBHOOK_URL).
//
// Переменные (Settings → Variables and Secrets):
//   PROXY_SECRET         обязательно, общий секрет с сервером (TELEGRAM_PROXY_SECRET)
//   BOT_TOKEN            необязательно, разрешить только этого бота
//   UPSTREAM_WEBHOOK_URL необязательно, https://api.ваш-домен.ru/api/telegram/webhook
//   WEBHOOK_SECRET       необязательно, секрет webhook (TELEGRAM_WEBHOOK_SECRET)

const TELEGRAM = 'https://api.telegram.org';

function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const text = (body, status) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health') return text('ok', 200);

    if (url.pathname === '/webhook') {
      if (request.method !== 'POST') return text('method not allowed', 405);
      if (!env.UPSTREAM_WEBHOOK_URL) return text('not found', 404);
      const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (env.WEBHOOK_SECRET && !safeEqual(secret, env.WEBHOOK_SECRET)) return text('forbidden', 403);
      const upstream = await fetch(env.UPSTREAM_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret || '' },
        body: await request.text()
      });
      return text(upstream.ok ? 'ok' : 'upstream error', upstream.ok ? 200 : 502);
    }

    const match = /^\/(file\/)?bot(\d+:[\w-]+)\/[\w./-]+$/.exec(url.pathname);
    if (!match) return text('not found', 404);
    if (!env.PROXY_SECRET || !safeEqual(request.headers.get('X-Proxy-Secret'), env.PROXY_SECRET)) return text('forbidden', 403);
    if (env.BOT_TOKEN && !safeEqual(match[2], env.BOT_TOKEN)) return text('forbidden', 403);

    const headers = new Headers();
    const type = request.headers.get('content-type');
    if (type) headers.set('content-type', type);
    const hasBody = !['GET', 'HEAD'].includes(request.method);
    const response = await fetch(TELEGRAM + url.pathname + url.search, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined
    });
    const out = new Headers();
    out.set('content-type', response.headers.get('content-type') || 'application/json');
    return new Response(response.body, { status: response.status, headers: out });
  }
};
