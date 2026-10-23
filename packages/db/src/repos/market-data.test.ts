import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '../client';
import { createTestDb } from '../testing';
import { createRepos, type Repos } from './index';

let h: DbHandle;
let r: Repos;
beforeAll(async () => {
  h = await createTestDb();
  r = createRepos(h.db);
});
afterAll(() => h.close());

describe('securities', () => {
  it('upserts and searches by ticker prefix or name', async () => {
    await r.securities.upsert([
      { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', type: 'etf', expenseRatio: 0.0003 },
      { ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', type: 'etf' },
      { ticker: 'AAPL', name: 'Apple Inc', type: 'stock', sector: 'Technology' },
      { ticker: 'V', name: 'Visa Inc', type: 'stock' },
    ]);
    await r.securities.upsert([{ ticker: 'AAPL', name: 'Apple Inc.', type: 'stock' }]);
    expect(await r.securities.get('AAPL')).toMatchObject({ name: 'Apple Inc.', sector: null });
    expect(await r.securities.get('NOPE')).toBeNull();
    expect((await r.securities.getMany(['VOO', 'V'])).map((s) => s.ticker).sort()).toEqual([
      'V',
      'VOO',
    ]);

    const v = await r.securities.search('v', 10);
    expect(v[0]!.ticker).toBe('V'); // exact ticker first
    expect(v.map((s) => s.ticker)).toEqual(expect.arrayContaining(['VOO', 'VTI']));
    expect((await r.securities.search('apple')).map((s) => s.ticker)).toEqual(['AAPL']);
    expect(await r.securities.search('v', 1)).toHaveLength(1);
    expect(await r.securities.search('%')).toEqual([]);
    expect(await r.securities.search('  ')).toEqual([]);
  });
});

describe('prices', () => {
  it('upserts, returns history, latest with prevClose, prunes', async () => {
    await r.prices.upsertBatch([
      { ticker: 'VOO', date: '2024-01-02', close: 400 },
      { ticker: 'VOO', date: '2026-10-20', close: 500 },
      { ticker: 'VOO', date: '2026-10-21', close: 505, adjClose: 505 },
      { ticker: 'QQQ', date: '2026-10-21', close: 450 },
    ]);
    await r.prices.upsertBatch([{ ticker: 'VOO', date: '2026-10-21', close: 506 }]);

    const hist = await r.prices.history('VOO', '2026-01-01');
    expect(hist.map((p) => [p.date, p.close])).toEqual([
      ['2026-10-20', 500],
      ['2026-10-21', 506],
    ]);
    expect(await r.prices.history('VOO')).toHaveLength(3);

    const latest = await r.prices.latest(['VOO', 'QQQ', 'MISSING']);
    expect(latest).toEqual(
      expect.arrayContaining([
        {
          ticker: 'VOO',
          date: '2026-10-21',
          close: 506,
          adjClose: null,
          prevDate: '2026-10-20',
          prevClose: 500,
        },
        {
          ticker: 'QQQ',
          date: '2026-10-21',
          close: 450,
          adjClose: null,
          prevDate: null,
          prevClose: null,
        },
      ]),
    );
    expect(latest).toHaveLength(2);
    expect(await r.prices.latest([])).toEqual([]);

    expect(await r.prices.prune('2024-10-22')).toBe(1);
    expect(await r.prices.history('VOO')).toHaveLength(2);
  });

  it('handles large batches', async () => {
    const rows = Array.from({ length: 3000 }, (_, i) => ({
      ticker: 'BIG',
      date: new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
      close: i,
    }));
    await r.prices.upsertBatch(rows);
    expect(await r.prices.history('BIG')).toHaveLength(3000);
  });
});

describe('fund holdings', () => {
  const snap = (asOf: string, w: number) => ({
    asOf,
    constituents: [
      {
        constituentTicker: 'AAPL',
        name: 'Apple',
        weight: w,
        assetBucket: 'equity',
        sector: 'Tech',
      },
      { constituentTicker: null, name: 'Cash & other', weight: 1 - w, assetBucket: 'cash' },
    ],
    sectorWeights: [{ sector: 'Tech', weight: w }],
  });

  it('keeps only latest + previous snapshot and returns latest', async () => {
    for (const [d, w] of [
      ['2025-12-31', 0.1],
      ['2026-03-31', 0.2],
      ['2026-06-30', 0.3],
    ] as const) {
      const s = snap(d, w);
      await r.fundHoldings.replaceSnapshot('VOO', s.asOf, s.constituents, s.sectorWeights);
    }
    // re-replacing the same snapshot is idempotent
    const s = snap('2026-06-30', 0.3);
    await r.fundHoldings.replaceSnapshot('VOO', s.asOf, s.constituents, s.sectorWeights);

    expect(await r.fundHoldings.snapshotDates('VOO')).toEqual(['2026-06-30', '2026-03-31']);
    const latest = await r.fundHoldings.latest(['VOO', 'NONE']);
    expect(Object.keys(latest)).toEqual(['VOO']);
    expect(latest.VOO!.asOf).toBe('2026-06-30');
    expect(latest.VOO!.constituents).toHaveLength(2);
    expect(latest.VOO!.constituents.map((c) => [c.constituentTicker, c.weight])).toEqual([
      [null, 0.7],
      ['AAPL', 0.3],
    ]);
    expect(latest.VOO!.sectorWeights).toEqual([{ sector: 'Tech', weight: 0.3 }]);
    expect(await r.fundHoldings.funds()).toEqual([{ fundTicker: 'VOO', asOf: '2026-06-30' }]);
    expect(await r.fundHoldings.fundsHolding('AAPL')).toEqual([
      { fundTicker: 'VOO', weight: 0.3, asOf: '2026-06-30' },
    ]);
    expect(await r.fundHoldings.fundsHolding('ZZZ')).toEqual([]);
  });
});

describe('dividends + cpi', () => {
  it('upsert and list', async () => {
    await r.dividends.upsert([
      { ticker: 'SCHD', exDate: '2026-03-25', payDate: '2026-03-30', amount: 0.25 },
      { ticker: 'SCHD', exDate: '2026-06-25', payDate: null, amount: 0.26 },
      { ticker: 'VOO', exDate: '2025-06-25', amount: 1.7 },
    ]);
    await r.dividends.upsert([{ ticker: 'SCHD', exDate: '2026-06-25', amount: 0.27 }]);
    const list = await r.dividends.list(['SCHD', 'VOO'], '2026-01-01');
    expect(list.map((d) => [d.ticker, d.exDate, d.amount])).toEqual([
      ['SCHD', '2026-03-25', 0.25],
      ['SCHD', '2026-06-25', 0.27],
    ]);
    expect(await r.dividends.list([])).toEqual([]);

    await r.cpi.upsert([
      { seriesId: 'CUUR0000SA0', period: '2026-08', value: 320.1 },
      { seriesId: 'CUUR0000SA0', period: '2026-09', value: 321 },
      { seriesId: 'OTHER', period: '2026-09', value: 1 },
    ]);
    await r.cpi.upsert([{ seriesId: 'CUUR0000SA0', period: '2026-09', value: 321.5 }]);
    expect((await r.cpi.list(['CUUR0000SA0'], '2026-09')).map((c) => [c.period, c.value])).toEqual([
      ['2026-09', 321.5],
    ]);
    expect(await r.cpi.list(['CUUR0000SA0'])).toHaveLength(2);
  });
});

describe('invites', () => {
  it('redeem respects max_uses atomically', async () => {
    await r.invites.create({ code: 'FRIENDS', maxUses: 2 });
    const results = await Promise.all([1, 2, 3].map(() => r.invites.redeem('FRIENDS')));
    expect(results.filter(Boolean)).toHaveLength(2);
    expect(await r.invites.redeem('FRIENDS')).toBe(false);
    expect(await r.invites.redeem('MISSING')).toBe(false);
    expect(await r.invites.get('FRIENDS')).toMatchObject({ maxUses: 2, used: 2 });
    expect((await r.invites.list()).map((i) => i.code)).toEqual(['FRIENDS']);
  });
});

describe('job runs', () => {
  it('start / finish / latest', async () => {
    expect(await r.jobs.latest()).toBeNull();
    const run = await r.jobs.start();
    expect(run.status).toBe('running');
    const done = await r.jobs.finish(run.id, {
      status: 'partial',
      counts: { prices: 10 },
      errors: [{ ticker: 'X', message: 'boom' }],
    });
    expect(done).toMatchObject({ status: 'partial', counts: { prices: 10 } });
    expect(done!.finishedAt).toBeInstanceOf(Date);
    expect((await r.jobs.latest())!.id).toBe(run.id);
  });
});
