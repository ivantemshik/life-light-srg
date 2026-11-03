import { createHash } from 'node:crypto';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { SEGMENTS, ZONES, TIMINGS } from './db.mjs';

export const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

export function isContact(value) {
  const v = value.trim();
  const digits = v.replace(/\D/g, '');
  if (/^[+\d\s()-]+$/.test(v) && digits.length >= 10 && digits.length <= 15) return true;
  return /^(@|https?:\/\/t\.me\/)?[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(v);
}

function decodePhoto(dataUrl) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl));
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) return null;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP';
  if (!(isJpeg || isPng || isWebp)) return null;
  return { bytes, ext: isJpeg ? 'jpg' : isPng ? 'png' : 'webp' };
}

function sourceOf(utm, referrer) {
  if (utm.utm_source) return [utm.utm_source, utm.utm_medium].filter(Boolean).join(' / ').slice(0, 120);
  if (utm.yclid) return 'yandex / cpc';
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    if (/yandex\./.test(host) || host === 'ya.ru') return 'yandex / organic';
    if (/google\./.test(host)) return 'google / organic';
    return `${host} / referral`;
  } catch { return 'direct'; }
}

// Проверяет тело запроса формы. Возвращает { lead, photos } или { error, field }.
export function validateLead(body, meta) {
  if (!body || typeof body !== 'object') return { error: 'Не удалось прочитать заявку.' };
  const name = clean(body.name, 80);
  const contact = clean(body.contact, 80);
  if (name.length < 2) return { error: 'Укажите имя.', field: 'name' };
  if (!isContact(contact)) return { error: 'Укажите телефон или ник в Telegram.', field: 'contact' };
  if (body.consent !== true) return { error: 'Нужно согласие на обработку персональных данных.', field: 'consent' };
  const segment = Object.hasOwn(SEGMENTS, body.segment) ? body.segment : 'other';
  const zones = [...new Set((Array.isArray(body.zones) ? body.zones : []).filter((z) => Object.hasOwn(ZONES, z)))].join(',');
  const timing = Object.hasOwn(TIMINGS, body.timing) ? body.timing : '';
  const rawPhotos = Array.isArray(body.photos) ? body.photos : [];
  if (rawPhotos.length > MAX_PHOTOS) return { error: `Можно приложить до ${MAX_PHOTOS} фото.`, field: 'photos' };
  const photos = [];
  for (const item of rawPhotos) {
    const photo = decodePhoto(item);
    if (!photo) return { error: 'Одно из фото не удалось прочитать. Пришлите JPG или PNG.', field: 'photos' };
    photos.push(photo);
  }
  const utmIn = body.utm && typeof body.utm === 'object' ? body.utm : {};
  const utm = Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid'].map((k) => [k, clean(utmIn[k], 200)]));
  const referrer = clean(body.referrer, 500);
  const lead = {
    name,
    contact,
    segment,
    zones,
    timing,
    comment: clean(body.comment, 1500),
    photos: 0,
    source: sourceOf(utm, referrer),
    page: clean(body.page, 500),
    referrer,
    ...utm,
    ym_client_id: clean(body.ymClientId, 40).replace(/[^\d]/g, ''),
    ip_hash: meta.ipHash,
    user_agent: clean(meta.userAgent, 300)
  };
  return { lead, photos };
}

export const hashIp = (ip, salt) => createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 24);

export async function savePhotos(dataDir, leadId, photos) {
  if (!photos.length) return [];
  const dir = path.join(dataDir, 'uploads', String(leadId));
  await mkdir(dir, { recursive: true });
  const files = [];
  for (const [i, photo] of photos.entries()) {
    const file = path.join(dir, `${i + 1}.${photo.ext}`);
    await writeFile(file, photo.bytes);
    files.push(file);
  }
  return files;
}

export async function loadPhotos(dataDir, leadId) {
  const dir = path.join(dataDir, 'uploads', String(leadId));
  try {
    const names = (await readdir(dir)).filter((n) => /^\d+\.(jpg|png|webp)$/.test(n)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    return Promise.all(names.map(async (n) => ({ name: n, bytes: await readFile(path.join(dir, n)) })));
  } catch { return []; }
}

// Простое ограничение частоты: не больше max заявок с одного адреса за окно.
export function createRateLimiter({ max, windowMs }) {
  const hits = new Map();
  return (key) => {
    const t = Date.now();
    const recent = (hits.get(key) || []).filter((at) => t - at < windowMs);
    if (recent.length >= max) { hits.set(key, recent); return false; }
    recent.push(t); hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((at) => t - at < windowMs)) hits.delete(k);
    return true;
  };
}
