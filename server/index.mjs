// Сервер заявок «Жизнь-свет»: принимает форму сайта, хранит заявки в SQLite,
// отправляет их в Telegram-бот и при необходимости раздаёт сам сайт.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadConfig, siteRoot } from './config.mjs';
import { openDb } from './db.mjs';
import { validateLead, savePhotos, hashIp, createRateLimiter } from './leads.mjs';
import { createTelegram } from './telegram.mjs';
import { createMetrika } from './metrika.mjs';
import { createBot } from './bot.mjs';

const MAX_BODY = 14 * 1024 * 1024;
const STATIC_FILES = new Set(['index.html', 'style.css', 'mobile.css', 'tokens.css', 'base.css', 'app.js', 'config.js', 'metrika.js', 'favicon.svg', 'robots.txt', 'sitemap.xml']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };

const safeEqual = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (chunk) => { size += chunk.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(chunk); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createApp(config = loadConfig(), { log = console } = {}) {
  const repo = openDb(config.dataDir);
  const allow = createRateLimiter(config.rateLimit);
  const tg = config.telegram.enabled ? createTelegram(config.telegram) : null;
  const metrika = config.metrika.enabled ? createMetrika(config.metrika) : null;
  const bot = tg ? createBot({ config, repo, tg, metrika, log }) : null;

  function cors(req, res) {
    const origin = req.headers.origin;
    if (origin && (config.allowedOrigins.includes(origin) || config.allowedOrigins.includes('*'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
  }
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS }); res.end(JSON.stringify(data)); };
  const clientIp = (req) => (config.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';

  async function createLead(req, res) {
    const ipHash = hashIp(clientIp(req), config.ipSalt);
    if (!allow(ipHash)) return json(res, 429, { ok: false, error: 'Слишком много заявок подряд. Попробуйте через несколько минут.' });
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch (error) { return json(res, error.status || 400, { ok: false, error: error.status === 413 ? 'Фото слишком большие. Приложите меньше фото.' : 'Не удалось прочитать заявку.' }); }
    if (body && body.website) return json(res, 200, { ok: true, id: 0 }); // ловушка для ботов
    const result = validateLead(body, { ipHash, userAgent: req.headers['user-agent'] });
    if (result.error) return json(res, 422, { ok: false, error: result.error, field: result.field });
    const lead = repo.createLead(result.lead);
    try {
      const files = await savePhotos(config.dataDir, lead.id, result.photos);
      if (files.length) repo.setPhotos(lead.id, files.length);
    } catch (error) { log.error(`Фото заявки ${lead.id} не сохранены: ${error.message}`); }
    json(res, 200, { ok: true, id: lead.id });
    log.info?.(`Заявка №${lead.id} принята`);
    if (bot) bot.notifyLead(repo.getLead(lead.id)).catch((error) => log.error(`Заявка ${lead.id} не отправлена в Telegram, повторим позже: ${error.message}`));
  }

  async function telegramWebhook(req, res) {
    if (!bot || config.telegram.mode !== 'webhook') return json(res, 404, { ok: false });
    if (!config.telegram.webhookSecret || !safeEqual(req.headers['x-telegram-bot-api-secret-token'] || '', config.telegram.webhookSecret)) return json(res, 401, { ok: false });
    let update;
    try { update = JSON.parse(await readBody(req)); } catch { return json(res, 400, { ok: false }); }
    json(res, 200, { ok: true });
    bot.handleUpdate(update);
  }

  async function serveStatic(req, res, pathname) {
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const allowed = STATIC_FILES.has(rel) || /^assets\/[\w.-]+\.(webp|png|jpg|svg|ttf|woff2|txt)$/.test(rel);
    const target = path.resolve(siteRoot, rel);
    if (!allowed || !target.startsWith(siteRoot + path.sep)) return false;
    try {
      if (!(await stat(target)).isFile()) return false;
      const isAsset = rel.startsWith('assets/');
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream', 'Cache-Control': isAsset ? 'public, max-age=604800, stale-while-revalidate=86400' : 'no-cache', ...SECURITY_HEADERS });
      res.end(req.method === 'HEAD' ? undefined : await readFile(target));
      return true;
    } catch { return false; }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname.startsWith('/api/')) cors(req, res);
      if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) { res.writeHead(204); return res.end(); }
      if (pathname === '/api/health') return json(res, 200, { ok: true, telegram: Boolean(bot), metrika: Boolean(metrika) });
      if (pathname === '/api/leads') return req.method === 'POST' ? createLead(req, res) : json(res, 405, { ok: false });
      if (pathname === '/api/telegram/webhook' && req.method === 'POST') return telegramWebhook(req, res);
      if (config.serveStatic && (req.method === 'GET' || req.method === 'HEAD') && await serveStatic(req, res, pathname)) return;
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS }); res.end('Не найдено');
    } catch (error) {
      log.error(`Ошибка запроса: ${error.stack || error.message}`);
      if (!res.headersSent) json(res, 500, { ok: false, error: 'Ошибка сервера. Напишите нам в Telegram.' });
    }
  });

  return {
    server, repo, bot,
    async listen() {
      await new Promise((resolve) => server.listen(config.port, config.host, resolve));
      if (bot) bot.start();
      return server.address();
    },
    async close() { bot?.stop(); await new Promise((resolve) => server.close(resolve)); server.closeAllConnections?.(); repo.close(); }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const config = loadConfig();
  const app = createApp(config, { log: { info: console.log, error: console.error } });
  const address = await app.listen();
  console.log(`Сервер заявок: http://${address.address}:${address.port} · Telegram: ${config.telegram.enabled ? config.telegram.mode : 'выключен'} · Метрика: ${config.metrika.enabled ? 'подключена' : 'выключена'}`);
  const shutdown = () => app.close().then(() => process.exit(0));
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
