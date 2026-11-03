import { STATUSES, OPEN_STATUSES, SEGMENTS, ZONES, TIMINGS } from './db.mjs';
import { loadPhotos } from './leads.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const STATUS_MARK = { new: '🆕', in_progress: '🔧', estimate: '📐', contract: '✅', rejected: '✖️', spam: '🚫' };
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '0%');

function contactLink(contact) {
  const digits = contact.replace(/\D/g, '');
  if (/^[+\d\s()-]+$/.test(contact) && digits.length >= 10) {
    const phone = digits.length === 11 && digits.startsWith('8') ? `7${digits.slice(1)}` : digits.length === 10 ? `7${digits}` : digits;
    return `<a href="tel:+${phone}">${esc(contact)}</a>`;
  }
  const nick = contact.replace(/^https?:\/\/t\.me\//, '').replace(/^@/, '');
  return `<a href="https://t.me/${esc(nick)}">@${esc(nick)}</a>`;
}

export function createBot({ config, repo, tg, metrika, log = console }) {
  const tz = config.timezone;
  const fmtTime = (iso) => new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const chatId = config.telegram.chatId;
  const admins = new Set(config.telegram.adminIds);
  const allowed = (chat, user) => (Boolean(chatId) && String(chat?.id) === String(chatId)) || Boolean(user && admins.has(String(user.id)));
  const actorName = (user) => [user?.first_name, user?.last_name].filter(Boolean).join(' ') || (user?.username ? `@${user.username}` : `id${user?.id}`);

  function leadText(lead) {
    const lines = [
      `${lead.timing === 'urgent' ? '🔥 <b>Срочно</b> · ' : ''}${STATUS_MARK[lead.status] || ''} <b>Заявка №${lead.id}</b> · ${esc(STATUSES[lead.status] || lead.status)}`,
      '',
      `<b>Имя:</b> ${esc(lead.name)}`,
      `<b>Контакт:</b> ${contactLink(lead.contact)}`,
      `<b>Объект:</b> ${esc(SEGMENTS[lead.segment] || lead.segment)}`
    ];
    if (lead.zones) lines.push(`<b>Что подсветить:</b> ${esc(lead.zones.split(',').map((z) => ZONES[z] || z).join(', '))}`);
    if (lead.timing) lines.push(`<b>Когда:</b> ${esc(TIMINGS[lead.timing] || lead.timing)}`);
    if (lead.comment) lines.push(`<b>Комментарий:</b> ${esc(lead.comment)}`);
    lines.push(`<b>Фото:</b> ${lead.photos ? `${lead.photos} шт., ниже` : 'нет'}`);
    lines.push(`<b>Источник:</b> ${esc(lead.source)}${lead.utm_campaign ? `, кампания ${esc(lead.utm_campaign)}` : ''}`);
    lines.push(`<b>Время:</b> ${fmtTime(lead.created_at)}`);
    if (lead.manager) lines.push(`<b>Менеджер:</b> ${esc(lead.manager)}`);
    if (lead.ym_client_id) lines.push(`<b>ClientID Метрики:</b> <code>${esc(lead.ym_client_id)}</code>`);
    lines.push('', '<i>Ответьте на это сообщение, чтобы оставить заметку к заявке.</i>');
    return lines.join('\n');
  }

  function keyboard(lead) {
    const btn = (status, text) => ({ text: lead.status === status ? `• ${text}` : text, callback_data: `st:${lead.id}:${status}` });
    return { inline_keyboard: [
      [btn('in_progress', 'Взять в работу'), btn('estimate', 'Смета отправлена')],
      [btn('contract', 'Договор'), btn('rejected', 'Отказ'), btn('spam', 'Спам')]
    ] };
  }

  async function notifyLead(lead) {
    if (!chatId) { log.error(`Заявка ${lead.id} сохранена, но TELEGRAM_CHAT_ID не задан: напишите боту /id в группе менеджеров`); return null; }
    const message = await tg.sendMessage(chatId, leadText(lead), { reply_markup: keyboard(lead) });
    repo.markNotified(lead.id, chatId, message.message_id);
    if (lead.photos) {
      try { await tg.sendPhotos(chatId, await loadPhotos(config.dataDir, lead.id), message.message_id); }
      catch (error) { log.error(`Фото к заявке ${lead.id} не отправлены: ${error.message}`); }
    }
    return message;
  }

  // Повторно отправляет заявки, которые не ушли в Telegram (например, если прокси был недоступен).
  async function flushPending() {
    if (!chatId) return;
    for (const lead of repo.unnotified(10)) {
      try { await notifyLead(lead); }
      catch (error) { log.error(`Заявка ${lead.id} пока не отправлена в Telegram: ${error.message}`); break; }
    }
  }

  async function statsText() {
    const startOfDay = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    startOfDay.setHours(0, 0, 0, 0);
    const offsetMs = new Date().getTime() - new Date(new Date().toLocaleString('en-US', { timeZone: tz })).getTime();
    const todayIso = new Date(startOfDay.getTime() + offsetMs).toISOString();
    const daysAgo = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
    const periods = [['Сегодня', todayIso], ['7 дней', daysAgo(7)], ['30 дней', daysAgo(30)]];
    const lines = ['<b>Заявки с сайта</b>'];
    for (const [label, since] of periods) {
      const s = repo.stats(since);
      const contracts = s.byStatus.find((r) => r.status === 'contract')?.n || 0;
      lines.push(`${label}: <b>${s.total}</b>${s.total ? `, с фото ${s.withPhotos}, договоров ${contracts} (${pct(contracts, s.total)})` : ''}`);
    }
    const month = repo.stats(daysAgo(30));
    if (month.total) {
      lines.push('', '<b>За 30 дней по статусам</b>', ...month.byStatus.map((r) => `${STATUS_MARK[r.status] || ''} ${esc(STATUSES[r.status] || r.status)}: ${r.n}`));
      lines.push('', '<b>По типу объекта</b>', ...month.bySegment.map((r) => `${esc(SEGMENTS[r.segment] || r.segment)}: ${r.n}`));
      if (month.byTiming.length) lines.push('', '<b>Сроки</b>', ...month.byTiming.map((r) => `${esc(TIMINGS[r.timing] || r.timing)}: ${r.n}`));
      lines.push('', '<b>Источники заявок</b>', ...month.bySource.map((r) => `${esc(r.source)}: ${r.n}`));
    }
    const open = repo.listByStatus(['new'], 100).length;
    if (open) lines.push('', `Не разобрано новых: <b>${open}</b>. Список: /new`);
    lines.push('', await metrikaText());
    return lines.join('\n');
  }

  async function metrikaText() {
    if (!metrika) return '<i>Метрика не подключена: задайте METRIKA_COUNTER_ID и METRIKA_TOKEN.</i>';
    try {
      const [week, month] = await Promise.all([metrika.summary(7), metrika.summary(30)]);
      const row = (label, m) => {
        const parts = [`визиты ${m.visits}`, `посетители ${m.users}`, `отказы ${m.bounceRate.toFixed(1)}%`, `глубина ${m.pageDepth.toFixed(1)}`, `время ${Math.round(m.avgDuration / 60)} мин ${Math.round(m.avgDuration % 60)} с`];
        if (m.leads !== null) parts.push(`заявки ${m.leads}`, `конверсия ${m.conversion.toFixed(2)}%`);
        return `${label}: ${parts.join(', ')}`;
      };
      const lines = ['<b>Яндекс Метрика</b>', row('7 дней', week), row('30 дней', month)];
      if (month.sources.length) lines.push('', '<b>Источники трафика, 30 дней</b>', ...month.sources.map((s) => `${esc(s.name)}: ${s.visits}`));
      return lines.join('\n');
    } catch (error) {
      return `<i>Метрика не ответила: ${esc(error.message)}</i>`;
    }
  }

  function listText(leads, title) {
    if (!leads.length) return `${title}: пусто.`;
    return [`<b>${title}</b>`, ...leads.map((l) => `${STATUS_MARK[l.status] || ''} №${l.id} ${esc(l.name)}, ${esc(SEGMENTS[l.segment] || l.segment)}, ${fmtTime(l.created_at)}${l.manager ? `, ${esc(l.manager)}` : ''}. /lead_${l.id}`)].join('\n');
  }

  function csv() {
    const cols = ['id', 'created_at', 'status', 'name', 'contact', 'segment', 'zones', 'timing', 'comment', 'photos', 'manager', 'source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'ym_client_id', 'page', 'referrer'];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return '﻿' + [cols.join(';'), ...repo.all().map((l) => cols.map((c) => cell(l[c])).join(';'))].join('\r\n');
  }

  const HELP = [
    '<b>Бот заявок «Жизнь-свет»</b>',
    'Новые заявки с сайта приходят сюда с фото. Кнопки под заявкой меняют статус, ответ на сообщение заявки сохраняет заметку.',
    '',
    '/new: новые, неразобранные заявки',
    '/leads: заявки в работе',
    '/lead_12: карточка и история заявки №12',
    '/stats: статистика заявок и Метрики',
    '/metrika: показатели Метрики',
    '/export: все заявки файлом CSV'
  ].join('\n');

  async function handleMessage(msg) {
    const text = (msg.text || '').trim();
    if (!chatId && msg.chat) {
      // Режим настройки: подсказываем ID чата в логе сервера (группа или личный чат с ботом)
      log.info?.(`Бот получил сообщение из ${msg.chat.type === 'private' ? `личного чата ${[msg.from?.first_name, msg.from?.username && `@${msg.from.username}`].filter(Boolean).join(' ')}` : `группы «${msg.chat.title || ''}»`}: TELEGRAM_CHAT_ID=${msg.chat.id}`);
      if (msg.new_chat_members?.length || msg.group_chat_created) await tg.sendMessage(msg.chat.id, `Бот добавлен. ID этой группы: <code>${msg.chat.id}</code>. Впишите его в TELEGRAM_CHAT_ID на сервере.`);
    }
    if (!allowed(msg.chat, msg.from)) {
      if (text.startsWith('/start') || text.startsWith('/id')) await tg.sendMessage(msg.chat.id, `Этот бот работает только в чате заявок. ID этого чата: <code>${msg.chat.id}</code>, ваш ID: <code>${msg.from?.id}</code>.`);
      return;
    }
    const reply = (t, extra) => tg.sendMessage(msg.chat.id, t, extra);
    const [cmdRaw] = text.split(/\s+/);
    const cmd = cmdRaw.replace(/@\w+$/, '').toLowerCase();
    const leadCmd = /^\/lead_?(\d+)$/.exec(cmd) || (cmd === '/lead' && /\s(\d+)/.exec(text));

    if (msg.reply_to_message && !text.startsWith('/')) {
      const lead = repo.findByMessage(msg.chat.id, msg.reply_to_message.message_id);
      if (lead && text) { repo.addNote(lead.id, actorName(msg.from), text); await reply(`Заметка сохранена к заявке №${lead.id}.`, { reply_parameters: { message_id: msg.message_id } }); }
      return;
    }
    if (cmd === '/start' || cmd === '/help') return reply(`${HELP}\n\nID этого чата: <code>${msg.chat.id}</code>`);
    if (cmd === '/id') return reply(`ID чата: <code>${msg.chat.id}</code>, ваш ID: <code>${msg.from?.id}</code>`);
    if (cmd === '/new') return reply(listText(repo.listByStatus(['new']), 'Новые заявки'));
    if (cmd === '/leads') return reply(listText(repo.listByStatus(OPEN_STATUSES), 'Заявки в работе'));
    if (cmd === '/stats') return reply(await statsText());
    if (cmd === '/metrika') return reply(await metrikaText());
    if (cmd === '/export') return tg.sendDocument(msg.chat.id, `leads-${new Date().toISOString().slice(0, 10)}.csv`, csv(), 'Все заявки с сайта. Открывается в Excel.');
    if (leadCmd) {
      const lead = repo.getLead(Number(leadCmd[1]));
      if (!lead) return reply('Такой заявки нет.');
      const history = repo.events(lead.id).map((e) => `${fmtTime(e.at)} ${esc(e.actor)}: ${e.action === 'status' ? `статус «${esc(STATUSES[e.value] || e.value)}»` : e.action === 'note' ? `заметка «${esc(e.value)}»` : 'заявка создана'}`);
      return reply(`${leadText(lead)}\n\n<b>История</b>\n${history.join('\n')}`, { reply_markup: keyboard(lead) });
    }
  }

  async function handleCallback(q) {
    const match = /^st:(\d+):(\w+)$/.exec(q.data || '');
    if (!match) return tg.answerCallbackQuery(q.id, '');
    if (!allowed(q.message?.chat, q.from)) return tg.answerCallbackQuery(q.id, 'Нет доступа');
    const lead = repo.setStatus(Number(match[1]), match[2], actorName(q.from));
    if (!lead) return tg.answerCallbackQuery(q.id, 'Заявка не найдена');
    await tg.answerCallbackQuery(q.id, `Статус: ${STATUSES[lead.status]}`);
    try { await tg.editMessageText(q.message.chat.id, q.message.message_id, leadText(lead), { reply_markup: keyboard(lead) }); }
    catch (error) { if (!/not modified/.test(error.message)) throw error; }
  }

  async function handleUpdate(update) {
    try {
      if (update.callback_query) await handleCallback(update.callback_query);
      else if (update.message) await handleMessage(update.message);
    } catch (error) { log.error(`Ошибка обработки обновления Telegram: ${error.message}`); }
  }

  let stopped = false;
  async function poll() {
    let offset = Number(repo.getKv('tg_offset') || 0);
    while (!stopped) {
      try {
        const updates = await tg.getUpdates(offset, 25);
        for (const update of updates) {
          offset = update.update_id + 1;
          repo.setKv('tg_offset', offset);
          await handleUpdate(update);
        }
      } catch (error) {
        if (stopped) break;
        log.error(`Telegram недоступен: ${error.message}. Повтор через 5 секунд.`);
        await new Promise((r) => setTimeout(r, error.retryAfter ? error.retryAfter * 1000 : 5000));
      }
    }
  }

  let timers = [];
  async function start() {
    try {
      await tg.setMyCommands([
        { command: 'new', description: 'Новые заявки' },
        { command: 'leads', description: 'Заявки в работе' },
        { command: 'stats', description: 'Статистика заявок и Метрики' },
        { command: 'metrika', description: 'Показатели Метрики' },
        { command: 'export', description: 'Все заявки файлом CSV' },
        { command: 'help', description: 'Справка' }
      ]);
      if (config.telegram.mode === 'webhook') await tg.setWebhook(config.telegram.webhookUrl, config.telegram.webhookSecret);
      else await tg.deleteWebhook();
    } catch (error) { log.error(`Не удалось настроить бота: ${error.message}`); }
    if (config.telegram.mode !== 'webhook') poll();
    timers.push(setInterval(() => flushPending().catch(() => {}), 60_000));
    if (Number.isInteger(config.telegram.dailyReportHour)) {
      let lastDay = repo.getKv('daily_report_day');
      timers.push(setInterval(async () => {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((p) => [p.type, p.value]));
        const day = `${parts.year}-${parts.month}-${parts.day}`;
        if (Number(parts.hour) === config.telegram.dailyReportHour && lastDay !== day) {
          lastDay = day; repo.setKv('daily_report_day', day);
          try { await tg.sendMessage(chatId, `<b>Ежедневный отчёт</b>\n\n${await statsText()}`); } catch (error) { log.error(`Отчёт не отправлен: ${error.message}`); }
        }
      }, 60_000));
    }
  }
  function stop() { stopped = true; timers.forEach(clearInterval); timers = []; }

  return { start, stop, notifyLead, flushPending, handleUpdate, statsText, leadText };
}
