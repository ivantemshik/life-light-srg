import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export const STATUSES = {
  new: 'Новая',
  in_progress: 'В работе',
  estimate: 'Смета отправлена',
  contract: 'Договор',
  rejected: 'Отказ',
  spam: 'Спам'
};
export const OPEN_STATUSES = ['new', 'in_progress', 'estimate'];
export const SEGMENTS = { home: 'Частный дом', business: 'Кафе, магазин, офис', mall: 'ТЦ или БЦ', other: 'Другое' };
export const ZONES = { facade: 'Фасад и кровля', garden: 'Деревья и сад', terrace: 'Терраса или беседка', newyear: 'Новогодний декор', sign: 'Вывеска или витрина', unsure: 'Пока не знает' };
export const TIMINGS = { newyear: 'К Новому году', urgent: 'Срочно, за 24 часа', later: 'Круглый год, без спешки', browsing: 'Присматривается' };

const SCHEMA = `
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
`;

export function openDb(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'leads.sqlite'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  // Миграция баз первой версии: поля квиза
  const columns = db.prepare('PRAGMA table_info(leads)').all().map((c) => c.name);
  if (!columns.includes('zones')) db.exec("ALTER TABLE leads ADD COLUMN zones TEXT NOT NULL DEFAULT ''");
  if (!columns.includes('timing')) db.exec("ALTER TABLE leads ADD COLUMN timing TEXT NOT NULL DEFAULT ''");
  return createRepo(db);
}

const now = () => new Date().toISOString();

function createRepo(db) {
  const insertLead = db.prepare(`INSERT INTO leads (created_at, updated_at, name, contact, segment, zones, timing, comment, photos, source, page, referrer,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, yclid, ym_client_id, ip_hash, user_agent)
    VALUES ($created_at, $created_at, $name, $contact, $segment, $zones, $timing, $comment, $photos, $source, $page, $referrer,
    $utm_source, $utm_medium, $utm_campaign, $utm_content, $utm_term, $yclid, $ym_client_id, $ip_hash, $user_agent)`);
  const insertEvent = db.prepare('INSERT INTO lead_events (lead_id, at, actor, action, value) VALUES (?, ?, ?, ?, ?)');

  return {
    raw: db,
    createLead(lead) {
      const created_at = now();
      const { lastInsertRowid } = insertLead.run({ created_at, ...lead });
      const id = Number(lastInsertRowid);
      insertEvent.run(id, created_at, 'site', 'created', '');
      return this.getLead(id);
    },
    setPhotos(id, count) { db.prepare('UPDATE leads SET photos = ?, updated_at = ? WHERE id = ?').run(count, now(), id); },
    getLead(id) { return db.prepare('SELECT * FROM leads WHERE id = ?').get(id) || null; },
    setStatus(id, status, actor) {
      const lead = this.getLead(id);
      if (!lead || !STATUSES[status]) return null;
      const manager = status === 'in_progress' || (!lead.manager && OPEN_STATUSES.concat('contract').includes(status)) ? actor : lead.manager;
      db.prepare('UPDATE leads SET status = ?, manager = ?, updated_at = ? WHERE id = ?').run(status, manager, now(), id);
      insertEvent.run(id, now(), actor, 'status', status);
      return this.getLead(id);
    },
    addNote(id, actor, text) { insertEvent.run(id, now(), actor, 'note', text.slice(0, 2000)); },
    events(id) { return db.prepare('SELECT * FROM lead_events WHERE lead_id = ? ORDER BY id').all(id); },
    markNotified(id, chatId, messageId) { db.prepare('UPDATE leads SET tg_notified = 1, tg_chat_id = ?, tg_message_id = ? WHERE id = ?').run(String(chatId), messageId, id); },
    findByMessage(chatId, messageId) { return db.prepare('SELECT * FROM leads WHERE tg_chat_id = ? AND tg_message_id = ?').get(String(chatId), messageId) || null; },
    unnotified(limit = 10) { return db.prepare('SELECT * FROM leads WHERE tg_notified = 0 AND status != \'spam\' ORDER BY id LIMIT ?').all(limit); },
    listByStatus(statuses, limit = 20) {
      const marks = statuses.map(() => '?').join(',');
      return db.prepare(`SELECT * FROM leads WHERE status IN (${marks}) ORDER BY id DESC LIMIT ?`).all(...statuses, limit);
    },
    all() { return db.prepare('SELECT * FROM leads ORDER BY id').all(); },
    stats(sinceIso) {
      const where = 'WHERE created_at >= ? AND status != \'spam\'';
      const total = db.prepare(`SELECT COUNT(*) AS n FROM leads ${where}`).get(sinceIso).n;
      const byStatus = db.prepare(`SELECT status, COUNT(*) AS n FROM leads ${where} GROUP BY status ORDER BY n DESC`).all(sinceIso);
      const bySegment = db.prepare(`SELECT segment, COUNT(*) AS n FROM leads ${where} GROUP BY segment ORDER BY n DESC`).all(sinceIso);
      const bySource = db.prepare(`SELECT source, COUNT(*) AS n FROM leads ${where} GROUP BY source ORDER BY n DESC LIMIT 5`).all(sinceIso);
      const byTiming = db.prepare(`SELECT timing, COUNT(*) AS n FROM leads ${where} AND timing != '' GROUP BY timing ORDER BY n DESC`).all(sinceIso);
      const withPhotos = db.prepare(`SELECT COUNT(*) AS n FROM leads ${where} AND photos > 0`).get(sinceIso).n;
      return { total, byStatus, bySegment, bySource, byTiming, withPhotos };
    },
    getKv(key) { return db.prepare('SELECT value FROM kv WHERE key = ?').get(key)?.value ?? null; },
    setKv(key, value) { db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value)); },
    close() { db.close(); }
  };
}
