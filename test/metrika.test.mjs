import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMetrika } from '../server/metrika.mjs';

test('сводка Метрики собирает визиты, отказы, цель заявки и источники', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), auth: init.headers.Authorization });
    const dims = new URL(url).searchParams.get('dimensions');
    const body = dims
      ? { data: [{ dimensions: [{ name: 'Переходы из поисковых систем' }], metrics: [120] }, { dimensions: [{ name: 'Прямые заходы' }], metrics: [40] }] }
      : { totals: [300, 250, 21.5, 2.4, 95, 6, 2] };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const metrika = createMetrika({ counterId: '12345', token: 'tok', leadGoalId: '777' }, { fetchImpl });
  const s = await metrika.summary(30);
  assert.equal(s.visits, 300);
  assert.equal(s.users, 250);
  assert.equal(s.leads, 6);
  assert.equal(s.conversion, 2);
  assert.equal(s.sources[0].name, 'Переходы из поисковых систем');
  assert.equal(seen[0].auth, 'OAuth tok');
  assert.match(seen[0].url, /ym%3As%3Agoal777reaches/);
  assert.match(seen[0].url, /date1=29daysAgo/);
});
