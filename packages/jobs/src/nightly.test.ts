import { createRepos } from '@easyfi/db';
import { createTestDb } from '@easyfi/db/testing';
import {
  FakeCpiSource,
  FakeDividendSource,
  FakeHoldingsSource,
  FakePriceSource,
  type PriceSource,
} from '@easyfi/data-sources';
import { describe, expect, it } from 'vitest';
import { runNightly } from './nightly';

const U = '00000000-0000-4000-8000-0000000000cc';

async function setup() {
  const h = await createTestDb();
  const r = createRepos(h.db);
  const p = await r.portfolios.create(U, { name: 'Main', type: 'actual' });
  await r.holdings.bulkInsert(U, p.id, [
    { ticker: 'AAPL', shares: 2 },
    { ticker: 'VOO', shares: 1 },
  ]);
  await r.securities.upsert([{ ticker: 'AAPL', name: 'Apple', type: 'stock' }]);
  return { h, r };
}

const days = (ticker: string, start: number, n: number, base = 100) =>
  Array.from({ length: n }, (_, i) => ({
    ticker,
    date: `2026-10-${String(start + i).padStart(2, '0')}`,
    close: base + i,
  }));

describe('runNightly', () => {
  it('ingests prices, dividends, fund books and CPI, then records the run', async () => {
    const { h, r } = await setup();
    const res = await runNightly({
      db: h.db,
      today: '2026-10-20',
      sources: {
        prices: new FakePriceSource({
          prices: [...days('AAPL', 1, 20), ...days('VOO', 1, 20, 500)],
        }),
        dividends: new FakeDividendSource([
          { ticker: 'VOO', exDate: '2026-10-10', payDate: '2026-10-14', amount: 1.8 },
        ]),
        holdings: new FakeHoldingsSource({
          VOO: {
            asOf: '2026-08-31',
            constituents: [
              {
                fundTicker: 'VOO',
                constituentTicker: 'AAPL',
                name: 'Apple',
                weight: 0.07,
                assetBucket: 'stocks',
                sector: null,
                industry: null,
              },
            ],
          },
        }),
        cpi: new FakeCpiSource([{ seriesId: 'CUUR0000SA0', period: '2026-09', value: 320 }]),
      },
    });
    expect(res.status).toBe('ok');
    expect(res.counts.pricedTickers).toBe(2);
    expect(res.counts.priceRows).toBe(40);
    expect(res.counts.dividendRows).toBeGreaterThanOrEqual(1);
    expect(res.counts.fundsRefreshed).toBe(1);
    expect(res.counts.cpiRows).toBe(1);
    expect(res.counts.seeded).toBeGreaterThan(20);
    expect((await r.prices.latest(['AAPL']))[0]).toMatchObject({ date: '2026-10-20', close: 119 });
    expect((await r.fundHoldings.latest(['VOO'])).VOO!.asOf).toBe('2026-08-31');
    expect(await r.jobs.latest()).toMatchObject({ status: 'ok' });
    await h.close();
  });

  it('is incremental, budgeted, and survives a failing ticker', async () => {
    const { h, r } = await setup();
    await r.prices.upsertBatch(days('VOO', 1, 19, 500));
    const requested: string[] = [];
    const flaky: PriceSource = {
      async eodHistory(ticker, from, to) {
        requested.push(`${ticker}:${from}`);
        if (ticker === 'AAPL') throw new Error('boom');
        return days(
          ticker,
          Number(from.slice(8)),
          Number(to.slice(8)) - Number(from.slice(8)) + 1,
          600,
        );
      },
      async latest() {
        return {};
      },
      async meta() {
        return null;
      },
    };
    const res = await runNightly({
      db: h.db,
      today: '2026-10-20',
      maxPriceTickers: 2,
      sources: { prices: flaky, dividends: null, holdings: null, cpi: null },
    });
    expect(res.status).toBe('partial');
    expect(res.errors).toEqual([{ step: 'prices', ticker: 'AAPL', message: 'boom' }]);
    // never-priced tickers (oldest) first, then VOO from the day after its last bar would come later
    expect(requested).toHaveLength(2);
    expect(requested[0]).toMatch(/:2024-10-20$/);
    const again = await runNightly({
      db: h.db,
      today: '2026-10-20',
      maxPriceTickers: 100,
      sources: { prices: flaky, dividends: null, holdings: null, cpi: null },
    });
    expect(requested).toContain('VOO:2026-10-20');
    expect(again.status).toBe('partial');
    await h.close();
  });

  it('prunes price history older than the retention window', async () => {
    const { h, r } = await setup();
    await r.prices.upsertBatch([{ ticker: 'AAPL', date: '2020-01-02', close: 1 }]);
    const res = await runNightly({
      db: h.db,
      today: '2026-10-20',
      sources: { prices: null, dividends: null, holdings: null, cpi: null },
    });
    expect(res.counts.pruned).toBe(1);
    await h.close();
  });
});

describe('runNightly alerts', () => {
  it('emails triggered alerts once per day', async () => {
    const { h, r } = await setup();
    await r.profiles.upsert(U, { email: 'u@example.com' });
    await r.prices.upsertBatch([
      { ticker: 'AAPL', date: '2026-10-19', close: 100 },
      { ticker: 'VOO', date: '2026-10-19', close: 100 },
    ]);
    await r.alerts.create(U, { kind: 'concentration', threshold: 0.1, enabled: true });
    const { FakeEmailSender } = await import('@easyfi/data-sources');
    const email = new FakeEmailSender();
    const none = { prices: null, dividends: null, holdings: null, cpi: null, email };
    const first = await runNightly({ db: h.db, today: '2026-10-20', sources: none });
    expect(first.counts.alertsTriggered).toBeGreaterThan(0);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]).toMatchObject({ to: 'u@example.com' });
    expect(email.sent[0]!.text).toMatch(/AAPL is 66\.7% of everything you own/);
    await runNightly({ db: h.db, today: '2026-10-20', sources: none });
    expect(email.sent).toHaveLength(1);
    await h.close();
  });
});
