// Клиент Telegram Bot API. Запросы идут через Cloudflare Worker (TELEGRAM_API_BASE),
// который пересылает их на api.telegram.org: прямой доступ с российского сервера не нужен.
export function createTelegram({ token, apiBase, proxySecret }) {
  const base = `${apiBase}/bot${token}`;
  const headers = proxySecret ? { 'X-Proxy-Secret': proxySecret } : {};

  async function call(method, params = {}, { timeoutMs = 20_000 } = {}) {
    const isForm = params instanceof FormData;
    const res = await fetch(`${base}/${method}`, {
      method: 'POST',
      headers: isForm ? headers : { ...headers, 'Content-Type': 'application/json' },
      body: isForm ? params : JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs)
    });
    let data;
    try { data = await res.json(); } catch { data = { ok: false, description: `HTTP ${res.status}` }; }
    if (!data.ok) {
      const error = new Error(`Telegram ${method}: ${data.description || res.status}`);
      error.code = data.error_code || res.status;
      error.retryAfter = data.parameters?.retry_after;
      throw error;
    }
    return data.result;
  }

  return {
    call,
    sendMessage: (chatId, text, extra = {}) => call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra }),
    editMessageText: (chatId, messageId, text, extra = {}) => call('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra }),
    answerCallbackQuery: (id, text) => call('answerCallbackQuery', { callback_query_id: id, text }),
    getUpdates: (offset, timeout = 25) => call('getUpdates', { offset, timeout, allowed_updates: ['message', 'callback_query'] }, { timeoutMs: (timeout + 15) * 1000 }),
    deleteWebhook: () => call('deleteWebhook', { drop_pending_updates: false }),
    setWebhook: (url, secret) => call('setWebhook', { url, secret_token: secret || undefined, allowed_updates: ['message', 'callback_query'] }),
    setMyCommands: (commands) => call('setMyCommands', { commands }),
    async sendPhotos(chatId, photos, replyTo) {
      if (!photos.length) return;
      const form = new FormData();
      form.append('chat_id', String(chatId));
      if (replyTo) form.append('reply_parameters', JSON.stringify({ message_id: replyTo, allow_sending_without_reply: true }));
      if (photos.length === 1) {
        form.append('photo', new Blob([photos[0].bytes]), photos[0].name);
        return call('sendPhoto', form, { timeoutMs: 60_000 });
      }
      form.append('media', JSON.stringify(photos.map((p, i) => ({ type: 'photo', media: `attach://p${i}` }))));
      photos.forEach((p, i) => form.append(`p${i}`, new Blob([p.bytes]), p.name));
      return call('sendMediaGroup', form, { timeoutMs: 60_000 });
    },
    async sendDocument(chatId, name, content, caption) {
      const form = new FormData();
      form.append('chat_id', String(chatId));
      if (caption) form.append('caption', caption);
      form.append('document', new Blob([content]), name);
      return call('sendDocument', form, { timeoutMs: 60_000 });
    }
  };
}
