import {
  FakeCpiSource,
  FakeDividendSource,
  FakeHoldingsSource,
  FakePriceSource,
  type PriceSource,
} from '@easyfi/data-sources';
import {
  cpiRepo,
  dividendsRepo,
  fundHoldingsRepo,
  holdingsRepo,
  jobsRepo,
  portfoliosRepo,
  pricesRepo,
  securitiesRepo,
  type DbHandle,
} from '@easyfi/db';
import { createTestDb } from '@easyfi/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runNightly } from './nightly';

const USER = '33333333-3333-4333-8333-333333333333';
const TODAY = '2026-10-22';

const prices = new FakePriceSource({
  prices: [
    { ticker: 'VOO', date: '2026-10-20', close: 550 },
    { ticker: 'VOO', date: '2026-10-21', close: 552 },
    { ticker: 'AAPL', date: '2026-10-21', close: 230 },
    { ticker: 'OLD', date: '2023-01-02', close: 1 },
  ],
});

const sources = (over: Partial<{ prices: PriceSource }> = {}) => ({
  prices: over.prices ?? prices,
  dividends: new FakeDividendSource([
    { ticker: 'VOO', exDate: '2026-09-26', payDate: '2026-09-30', amount: 1.74 },
  ]),
  holdings: new FakeHoldingsSource({
    VOO: {
      asOf: '2026-08-31',
      constituents: [
        {
          fundTicker: 'VOO',
          constituentTicker: 'AAPL',
          name: 'Apple Inc',
          weight: 0.07,
          assetBucket: 'stocks',
          sector: null,
          industry: null,
        },
      ],
    },
  }),
  cpi: new FakeCpiSource([{ seriesId: 'CUUR0000SA0', period: '2026-09', value: 326.5 }]),
});

let h: DbHandle;
beforeEach(async () => {
  h?.close();
  h = await createTestDb();
  const p = await portfoliosRepo(h.db).create(USER, { name: 'Main', type: 'actual' });
  await holdingsRepo(h.db).bulkInsert(USER, p.id, [
    { ticker: 'VOO', shares: 1 },
    { ticker: 'AAPL', shares: 2 },
    { ticker: 'CASH', shares: 0, statementValue: 10 },
  ]);
  await pricesRepo(h.db).upsertBatch([{ ticker: 'OLD', date: '2023-01-02', close: 1 }]);
});
afterAll(() => h.close());

describe('runNightly', () => {
  it('ingests prices, dividends, newer fund holdings and CPI, then records an ok job run', async () => {
    const run = await runNightly({ db: h.db, sources: sources(), today: TODAY, etfs: ['VOO'] });
    expect(run.status).toBe('ok');
    expect(run.counts).toMatchObject({
      tickers: 2,
      prices: 3,
      dividends: 1,
      funds: 1,
      cpi: 1,
      pruned: 1,
    });

    expect((await pricesRepo(h.db).latest(['VOO']))[0]).toMatchObject({
      close: 552,
      prevClose: 550,
    });
    expect(await dividendsRepo(h.db).list(['VOO'])).toHaveLength(1);
    expect(await fundHoldingsRepo(h.db).snapshotDates('VOO')).toEqual(['2026-08-31']);
    expect(await cpiRepo(h.db).list(['CUUR0000SA0'])).toHaveLength(1);
    expect(await jobsRepo(h.db).latest()).toMatchObject({ status: 'ok' });
  });

  it('is incremental and idempotent: a second run re-fetches only from the last stored date', async () => {
    await runNightly({ db: h.db, sources: sources(), today: TODAY, etfs: ['VOO'] });
    const second = await runNightly({ db: h.db, sources: sources(), today: TODAY, etfs: ['VOO'] });
    expect(second.counts).toMatchObject({ funds: 0, cpi: 0 });
    expect(second.counts.prices).toBeLessThanOrEqual(2); // only the latest bar per ticker
  });

  it('one failing ticker makes the run partial, never failed, and other tickers still load', async () => {
    const flaky: PriceSource = {
      ...prices,
      latest: prices.latest.bind(prices),
      meta: prices.meta.bind(prices),
      eodHistory: async (t, from, to) => {
        if (t === 'AAPL') throw new Error('Tiingo 500 for AAPL');
        return prices.eodHistory(t, from, to);
      },
    };
    const run = await runNightly({
      db: h.db,
      sources: sources({ prices: flaky }),
      today: TODAY,
      etfs: ['VOO'],
    });
    expect(run.status).toBe('partial');
    expect(run.errors).toEqual([expect.objectContaining({ step: 'prices', ticker: 'AAPL' })]);
    expect((await pricesRepo(h.db).latest(['VOO']))[0]?.close).toBe(552);
  });

  it('skips sources that are not configured', async () => {
    const run = await runNightly({
      db: h.db,
      sources: { prices: null, dividends: null, holdings: null, cpi: null },
      today: TODAY,
      etfs: ['VOO'],
    });
    expect(run.status).toBe('ok');
    expect(run.counts).toMatchObject({ prices: 0, dividends: 0, funds: 0, cpi: 0 });
  });

  it('resolves fund constituent tickers by issuer name and counts funds without a filing', async () => {
    const holdings = new FakeHoldingsSource({
      VOO: {
        asOf: '2026-08-31',
        constituents: [
          {
            fundTicker: 'VOO',
            constituentTicker: null,
            name: 'NVIDIA Corp.',
            weight: 0.07,
            assetBucket: 'stocks',
            sector: null,
            industry: null,
          },
          {
            fundTicker: 'VOO',
            constituentTicker: null,
            name: 'Toyota Motor Corp',
            weight: 0.01,
            assetBucket: 'stocks',
            sector: null,
            industry: null,
          },
        ],
      },
    });
    const run = await runNightly({
      db: h.db,
      sources: { prices: null, dividends: null, holdings, cpi: null },
      today: TODAY,
      etfs: ['VOO', 'SPY'],
      companies: async () => [
        { ticker: 'NVDA', name: 'NVIDIA CORP', cik: '1045810', type: 'stock' },
      ],
    });
    expect(run.counts).toMatchObject({ funds: 1, fundsNoFiling: 1 });
    const snap = (await fundHoldingsRepo(h.db).latest(['VOO'])).VOO!;
    expect(snap.constituents.map((c) => c.constituentTicker).sort()).toEqual(['NVDA', null].sort());
  });

  it('adds missing stock tickers from the SEC universe without overwriting', async () => {
    await securitiesRepo(h.db).upsert([
      { ticker: 'AAPL', name: 'Apple (curated)', type: 'stock', sector: 'Information Technology' },
    ]);
    const run = await runNightly({
      db: h.db,
      sources: { prices: null, dividends: null, holdings: null, cpi: null },
      today: TODAY,
      etfs: [],
      companies: async () => [
        { ticker: 'AAPL', name: 'Apple Inc.', cik: '320193', type: 'stock' },
        { ticker: 'NVDA', name: 'NVIDIA CORP', cik: '1045810', type: 'stock' },
      ],
    });
    expect(run.counts.securities).toBe(1);
    expect(await securitiesRepo(h.db).get('AAPL')).toMatchObject({
      name: 'Apple (curated)',
      sector: 'Information Technology',
    });
    expect(await securitiesRepo(h.db).get('NVDA')).toMatchObject({ type: 'stock' });
  });

  it('fails the run when a step fails for every ticker (revoked token)', async () => {
    const dead: PriceSource = {
      ...prices,
      latest: prices.latest.bind(prices),
      meta: prices.meta.bind(prices),
      eodHistory: async () => {
        throw new Error('401 invalid token');
      },
    };
    const run = await runNightly({
      db: h.db,
      sources: sources({ prices: dead }),
      today: TODAY,
      etfs: ['VOO'],
    });
    expect(run.status).toBe('failed');
    expect((await jobsRepo(h.db).latest())?.status).toBe('failed');
  });

  it('keeps the last snapshot when the SEC company list is unavailable', async () => {
    const run = await runNightly({
      db: h.db,
      sources: { prices: null, dividends: null, holdings: sources().holdings, cpi: null },
      today: TODAY,
      etfs: ['VOO'],
      companies: async () => {
        throw new Error('SEC 503');
      },
    });
    expect(run.counts.funds).toBe(0);
    expect(run.errors.map((e) => e.step)).toEqual(['securities', 'holdings']);
  });

  it('refreshes held funds outside the catalog', async () => {
    const holdings = new FakeHoldingsSource({ AAPL: { asOf: '2026-08-31', constituents: [] } });
    const run = await runNightly({
      db: h.db,
      sources: { prices: null, dividends: null, holdings, cpi: null },
      today: TODAY,
      etfs: [],
    });
    expect(run.counts).toMatchObject({ funds: 1, fundsNoFiling: 0 });
  });

  it('backfills a lagging CPI series and handles 29 Feb', async () => {
    await cpiRepo(h.db).upsert([{ seriesId: 'CUUR0000SA0', period: '2028-01', value: 1 }]);
    const cpi = new FakeCpiSource([
      { seriesId: 'CUUR0000SA0', period: '2028-01', value: 1 },
      { seriesId: 'CUUR0000SA0L1E', period: '2028-01', value: 2 },
    ]);
    const run = await runNightly({
      db: h.db,
      sources: { prices: null, dividends: null, holdings: null, cpi },
      today: '2028-02-29',
      etfs: [],
    });
    expect(run.status).toBe('ok');
    expect(run.counts.cpi).toBe(1);
  });
});
