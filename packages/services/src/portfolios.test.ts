import {
  HoldingList,
  LookThrough,
  PortfolioDetail,
  PortfolioList,
  ValueSeriesSet,
  Constellation,
} from '@easyfi/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestServices, OTHER_USER_ID, type TestServices } from './testing';

let t: TestServices;
beforeAll(async () => {
  t = await createTestServices();
}, 60_000);
afterAll(() => t.close());

const id = (name: string) => t.portfolioIds[name]!;

describe('portfolios.list', () => {
  it('summarises every demo portfolio (contract-valid)', async () => {
    const res = await t.services.portfolios.list(t.userId);
    expect(PortfolioList.parse(res)).toBeTruthy();
    expect(res.portfolios.map((p) => p.name).sort()).toEqual([
      'Family Taxable',
      'Growth / Tech Tilt',
      'Single Stock Bet',
    ]);
    const single = res.portfolios.find((p) => p.name === 'Single Stock Bet')!;
    expect(single.topHolding?.ticker).toBe('GOOGL');
    expect(single.topHolding!.weight).toBeGreaterThan(0.5);
    expect(single.diversificationScore).toBeLessThan(20);
    expect(res.totalValue).toBeGreaterThan(50_000);
    expect(res.asOf).toBe('2026-09-30');
  });

  it('is empty for another user', async () => {
    expect((await t.services.portfolios.list(OTHER_USER_ID)).portfolios).toEqual([]);
  });
});

describe('portfolios CRUD', () => {
  it('create → update → delete, scoped by user', async () => {
    const p = await t.services.portfolios.create(t.userId, {
      name: 'Scratch',
      type: 'hypothetical',
      cash: 100,
    });
    expect(p).toMatchObject({
      name: 'Scratch',
      type: 'hypothetical',
      totalValue: 100,
      holdingsCount: 0,
    });
    await expect(
      t.services.portfolios.update(OTHER_USER_ID, p.id, { name: 'x' }),
    ).rejects.toMatchObject({
      code: 'not_found',
    });
    const u = await t.services.portfolios.update(t.userId, p.id, { name: 'Renamed', cash: 50 });
    expect(u).toMatchObject({ name: 'Renamed', totalValue: 50 });
    await expect(t.services.portfolios.remove(OTHER_USER_ID, p.id)).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(await t.services.portfolios.remove(t.userId, p.id)).toEqual({ ok: true });
    await expect(t.services.portfolios.detail(t.userId, p.id)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('portfolios.detail / lookThrough / constellation / valueSeries', () => {
  it('detail has allocation modes, funds and fee drag', async () => {
    const d = PortfolioDetail.parse(
      await t.services.portfolios.detail(t.userId, id('Family Taxable')),
    );
    expect(d.allocation.map((a) => a.mode)).toEqual(['sector', 'holding', 'overlap']);
    const sector = d.allocation[0]!.slices;
    expect(sector.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 2);
    expect(d.funds.map((f) => f.ticker)).toEqual(expect.arrayContaining(['VOO', 'SCHD', 'QQQM']));
    expect(d.feeDrag.blendedExpenseRatio).toBeGreaterThan(0);
    expect(d.allocation[2]!.slices[0]!.label).toMatch(/∩/);
  });

  it('look-through folds by company with per-fund sources', async () => {
    const lt = LookThrough.parse(
      await t.services.portfolios.lookThrough(t.userId, id('Family Taxable'), 'company'),
    );
    const msft = lt.rows.find((r) => r.ticker === 'MSFT')!;
    expect(msft.sources.map((s) => s.sourceTicker)).toEqual(
      expect.arrayContaining(['DIRECT', 'VOO']),
    );
    const sum = msft.sources.reduce((s, x) => s + x.contribution, 0);
    expect(sum).toBeCloseTo(msft.weight, 6);
    expect(lt.sourceOrder).toContain('DIRECT');
    // stable value fund has no book → unresolved row
    expect(lt.rows.at(-1)!.key).toBe('Unresolved');
  });

  it('look-through by sector sums to 1', async () => {
    const lt = await t.services.portfolios.lookThrough(
      t.userId,
      id('Growth / Tech Tilt'),
      'sector',
    );
    expect(lt.rows.reduce((s, r) => s + r.weight, 0)).toBeCloseTo(1, 6);
    expect(lt.rows[0]!.name).toBe('Technology');
  });

  it('constellation lists holdings linked to fund hubs', async () => {
    const c = Constellation.parse(
      await t.services.portfolios.constellation(t.userId, id('Family Taxable')),
    );
    const nvda = c.holdings.find((h) => h.ticker === 'NVDA')!;
    expect(nvda.funds.length).toBeGreaterThanOrEqual(3);
    expect(c.holdings.find((h) => h.ticker === 'MSFT')!.direct).toBe(true);
  });

  it('value series covers every range for one portfolio and for all', async () => {
    const one = ValueSeriesSet.parse(
      await t.services.portfolios.valueSeries(t.userId, id('Single Stock Bet')),
    );
    expect(Object.keys(one.ranges)).toEqual(expect.arrayContaining(['1M', '1Y', 'MAX']));
    expect(one.asOf).toBe('2026-09-30');
    const all = await t.services.portfolios.valueSeries(t.userId, 'all');
    expect(all.ranges['1Y']!.points.at(-1)!.value).toBeGreaterThan(
      one.ranges['1Y']!.points.at(-1)!.value,
    );
  });
});

describe('holdings', () => {
  it('lists priced rows; statement-only line is valued but unpriced', async () => {
    const list = HoldingList.parse(await t.services.holdings.list(t.userId, id('Family Taxable')));
    const svf = list.holdings.find((h) => h.ticker === 'SVF-1')!;
    expect(svf).toMatchObject({ price: null, value: 1500, shares: null });
    const schd = list.holdings.find((h) => h.ticker === 'SCHD')!;
    expect(schd.price).toBeGreaterThan(0);
    expect(schd.yield).toBeGreaterThan(0.02);
    expect(schd.annualIncome).toBeGreaterThan(0);
    expect(schd.type).toBe('etf');
  });

  it('create by dollars converts at the latest close; update; delete', async () => {
    const pid = id('Single Stock Bet');
    const row = await t.services.holdings.create(t.userId, pid, {
      ticker: 'voo',
      dollars: 1120,
      tags: ['new'],
    });
    expect(row.ticker).toBe('VOO');
    expect(row.shares).toBeCloseTo(2, 1);
    const upd = await t.services.holdings.update(t.userId, row.id, {
      shares: 3,
      accountType: 'roth_ira',
    });
    expect(upd).toMatchObject({ shares: 3, accountType: 'roth_ira' });
    await expect(
      t.services.holdings.update(OTHER_USER_ID, row.id, { shares: 1 }),
    ).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(await t.services.holdings.remove(t.userId, row.id)).toEqual({ ok: true });
  });

  it('rejects dollars for an unpriced ticker', async () => {
    await expect(
      t.services.holdings.create(t.userId, id('Single Stock Bet'), {
        ticker: 'ZZZZ',
        dollars: 100,
      }),
    ).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('imports a CSV (dry run, then append)', async () => {
    const p = await t.services.portfolios.create(t.userId, { name: 'Imported' });
    const csv = 'Symbol,Quantity,Cost Basis\nVTI,10,2500\nSCHD,20,500\n';
    const dry = await t.services.holdings.importCsv(t.userId, p.id, { csv, dryRun: true });
    expect(dry).toMatchObject({ imported: 0, format: 'generic' });
    expect(dry.holdings).toHaveLength(2);
    const real = await t.services.holdings.importCsv(t.userId, p.id, { csv });
    expect(real.imported).toBe(2);
    expect((await t.services.holdings.list(t.userId, p.id)).holdings).toHaveLength(2);
    const bulk = await t.services.holdings.bulk(t.userId, p.id, {
      ids: (await t.services.holdings.list(t.userId, p.id)).holdings.map((h) => h.id),
      action: 'tag',
      tag: 'imported',
    });
    expect(bulk.affected).toBe(2);
  });
});
