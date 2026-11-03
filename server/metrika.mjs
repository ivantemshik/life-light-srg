// Основные показатели Яндекс Метрики через Reporting API (api-metrika.yandex.net).
// Нужны METRIKA_COUNTER_ID и OAuth-токен METRIKA_TOKEN с доступом metrika:read.
const API = 'https://api-metrika.yandex.net/stat/v1/data';

export function createMetrika({ counterId, token, leadGoalId }, { fetchImpl = fetch } = {}) {
  async function query(params) {
    const url = new URL(API);
    url.search = new URLSearchParams({ ids: counterId, accuracy: 'full', ...params }).toString();
    const res = await fetchImpl(url, { headers: { Authorization: `OAuth ${token}` }, signal: AbortSignal.timeout(20_000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Метрика: ${data.message || res.status}`);
    return data;
  }

  return {
    async summary(days) {
      const date1 = `${days - 1}daysAgo`;
      const metrics = ['ym:s:visits', 'ym:s:users', 'ym:s:bounceRate', 'ym:s:pageDepth', 'ym:s:avgVisitDurationSeconds'];
      if (leadGoalId) metrics.push(`ym:s:goal${leadGoalId}reaches`, `ym:s:goal${leadGoalId}conversionRate`);
      const totals = (await query({ metrics: metrics.join(','), date1, date2: 'today' })).totals || [];
      let sources = [];
      try {
        const bySource = await query({ metrics: 'ym:s:visits', dimensions: 'ym:s:lastsignTrafficSource', date1, date2: 'today', sort: '-ym:s:visits', limit: '5' });
        sources = (bySource.data || []).map((row) => ({ name: row.dimensions?.[0]?.name || 'неизвестно', visits: row.metrics?.[0] || 0 }));
      } catch { /* источники необязательны */ }
      return {
        visits: totals[0] || 0,
        users: totals[1] || 0,
        bounceRate: totals[2] || 0,
        pageDepth: totals[3] || 0,
        avgDuration: totals[4] || 0,
        leads: leadGoalId ? totals[5] || 0 : null,
        conversion: leadGoalId ? totals[6] || 0 : null,
        sources
      };
    }
  };
}
