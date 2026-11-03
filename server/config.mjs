import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const serverDir = path.dirname(fileURLToPath(import.meta.url));
export const siteRoot = path.resolve(serverDir, '..');

// Переменные окружения можно положить в server/.env (пример: server/.env.example).
try { process.loadEnvFile(path.join(serverDir, '.env')); } catch { /* файла нет: берём окружение процесса */ }

const env = (name, fallback = '') => (process.env[name] ?? fallback).toString().trim();
const list = (name) => env(name).split(',').map((v) => v.trim()).filter(Boolean);
const flag = (name, fallback = false) => { const v = env(name); return v ? ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()) : fallback; };

export function loadConfig(overrides = {}) {
  const config = {
    host: env('HOST', '127.0.0.1'),
    port: Number(env('PORT', '8080')),
    dataDir: path.resolve(siteRoot, env('DATA_DIR', 'data')),
    serveStatic: flag('SERVE_STATIC', true),
    allowedOrigins: list('ALLOWED_ORIGINS'),
    trustProxy: flag('TRUST_PROXY', false),
    ipSalt: env('IP_SALT', 'change-me'),
    timezone: env('REPORT_TZ', 'Europe/Moscow'),
    rateLimit: { max: Number(env('RATE_LIMIT_MAX', '5')), windowMs: Number(env('RATE_LIMIT_WINDOW_MIN', '10')) * 60_000 },
    telegram: {
      token: env('TELEGRAM_BOT_TOKEN'),
      apiBase: env('TELEGRAM_API_BASE', 'https://api.telegram.org').replace(/\/+$/, ''),
      proxySecret: env('TELEGRAM_PROXY_SECRET'),
      chatId: env('TELEGRAM_CHAT_ID'),
      adminIds: list('TELEGRAM_ADMIN_IDS'),
      mode: env('TELEGRAM_MODE', 'polling'),
      webhookUrl: env('TELEGRAM_WEBHOOK_URL'),
      webhookSecret: env('TELEGRAM_WEBHOOK_SECRET'),
      dailyReportHour: env('DAILY_REPORT_HOUR') === '' ? null : Number(env('DAILY_REPORT_HOUR'))
    },
    metrika: {
      counterId: env('METRIKA_COUNTER_ID'),
      token: env('METRIKA_TOKEN'),
      leadGoalId: env('METRIKA_LEAD_GOAL_ID')
    },
    ...overrides
  };
  config.telegram.enabled = Boolean(config.telegram.token && config.telegram.chatId) && config.telegram.mode !== 'off';
  config.metrika.enabled = Boolean(config.metrika.counterId && config.metrika.token);
  return config;
}
