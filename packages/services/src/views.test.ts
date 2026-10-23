import {
  Comparison,
  Dividends,
  Home,
  Inflation,
  PurchasingPowerResult,
  SecurityDetail,
  SecuritySearchResult,
  WhatIfResult,
} from '@easyfi/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestServices, OTHER_USER_ID, type TestServices } from './testing';

let t: TestServices;
beforeAll(async () => {
  t = await createTestServices();
}, 60_000);
afterAll(() => t.close());

describe('home', () => {
  it('aggregates value, allocation, risk-sorted portfolios, insights, movers and market context', async () => {
    const h = Home.parse(await t.services.home.get(t.userId));
    expect(h.portfolioCount).toBe(3);
    expect(h.totalValue).toBeGreaterThan(50_000);
    expect(h.portfolios[0]!.name).toBe('Single Stock Bet'); // riskiest first
    const scores = h.portfolios.map((p) => p.diversificationScore ?? 101);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
    expect(h.insights.length).toBeGreaterThan(0);
    expect(h.insights[0]!.severity).toBe('high');
    expect(h.insights.some((i) => /GOOGL/.test(i.text))).toBe(true);
    expect(h.marketContext.map((m) => m.ticker)).toEqual(['SCHD', 'VTI', 'VOO', 'QQQM']);
    expect(h.marketContext[0]!.change).not.toBeNull();
    expect(h.allocation[0]!.slices[0]!.label).toBe('Technology');
    expect(h.askSuggestions).toHaveLength(2);
  });

  it('is empty but valid for a new user', async () => {
    const h = Home.parse(await t.services.home.get(OTHER_USER_ID));
    expect(h).toMatchObject({ totalValue: null, portfolioCount: 0, portfolios: [], insights: [] });
  });
});

describe('compare', () => {
  it('compares two funds', async () => {
    const c = Comparison.parse(await t.services.compare.compare(t.userId, 'VOO', 'QQQ'));
    expect(c.a).toMatchObject({ ticker: 'VOO', kind: 'fund' });
    expect(c.sharedCount).toBeGreaterThan(10);
    expect(c.overlapByWeight).toBeGreaterThan(0.1);
    expect(c.shared[0]!.weightA).not.toBeNull();
    expect(c.options.some((o) => o.value === 'SCHD')).toBe(true);
    expect(c.options.some((o) => o.kind === 'portfolio')).toBe(true);
  });

  it('compares a portfolio with a fund', async () => {
    const pid = t.portfolioIds['Growth / Tech Tilt']!;
    const c = await t.services.compare.compare(t.userId, pid, 'VGT');
    expect(c.a).toMatchObject({ kind: 'portfolio', name: 'Growth / Tech Tilt' });
    expect(c.overlapByWeight).toBeGreaterThan(0);
  });

  it('uses an equivalent book (FXAIX → VOO) and rejects unknown funds', async () => {
    const c = await t.services.compare.compare(t.userId, 'FXAIX', 'VOO');
    // same book on both sides: every listed holding is shared
    expect(c.sharedCount).toBe(c.a.holdingsCount);
    expect(c.overlapByWeight).toBeCloseTo(
      c.shared.reduce((s, x) => s + x.weightA!, 0),
      5,
    );
    await expect(t.services.compare.compare(t.userId, 'NOPE', 'VOO')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('securities', () => {
  it('searches by ticker and name', async () => {
    const r = SecuritySearchResult.parse(await t.services.securities.search('vang', 10));
    expect(r.results.map((s) => s.ticker)).toEqual(expect.arrayContaining(['VOO', 'VTI']));
    const voo = (await t.services.securities.search('VOO', 5)).results[0]!;
    expect(voo).toMatchObject({ ticker: 'VOO', hasLookThrough: true });
  });

  it('details a fund with top holdings', async () => {
    const d = SecurityDetail.parse(await t.services.securities.get('voo'));
    expect(d.topHoldings.length).toBeGreaterThan(5);
    expect(d.price).toBeGreaterThan(0);
    expect(d.sectors[0]!.label).toBe('Technology');
    await expect(t.services.securities.get('ZZZZ')).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('what-if', () => {
  it('adding VGT shifts sectors towards Technology', async () => {
    const r = WhatIfResult.parse(
      await t.services.whatIf.run(t.userId, { ticker: 'VGT', amount: 10_000 }),
    );
    const tech = r.sectorShifts.find((s) => s.sector === 'Technology')!;
    expect(tech.after).toBeGreaterThan(tech.before);
    expect(r.after.totalValue).toBeCloseTo(r.before.totalValue + 10_000, 0);
    expect(r.overlaps.length).toBeGreaterThan(0);
  });
});

describe('dividends', () => {
  it('summarises income for all portfolios', async () => {
    const d = Dividends.parse(await t.services.income.dividends(t.userId));
    expect(d.kpis.trailing12m).toBeGreaterThan(0);
    expect(d.kpis.portfolioYield).toBeGreaterThan(0);
    expect(d.calendar.length).toBeGreaterThanOrEqual(12);
    expect(d.calendar.some((m) => m.payments.some((p) => p.status === 'projected'))).toBe(true);
    expect(d.holdings[0]!.ticker).toBe('SCHD');
    expect(d.yieldLeaders.length).toBeGreaterThan(0);
    expect(d.portfolios).toHaveLength(3);
  });

  it('filters to one portfolio', async () => {
    const d = await t.services.income.dividends(t.userId, t.portfolioIds['Single Stock Bet']!);
    expect(d.holdings.map((h) => h.ticker)).not.toContain('SCHD');
  });
});

describe('inflation', () => {
  it('returns headline + core CPI and category drivers', async () => {
    const i = Inflation.parse(await t.services.income.inflation(t.userId));
    expect(i.cpi.period).toBe('2026-09');
    expect(i.cpi.yoy).toBeGreaterThan(0);
    expect(i.cpi.coreYoy).not.toBeNull();
    expect(i.cpi.history).toHaveLength(12);
    expect(i.categories.map((c) => c.key)).toContain('shelter');
    expect(i.trackedValue).toBeGreaterThan(0);
  });

  it('projects purchasing power', () => {
    const r = PurchasingPowerResult.parse(
      t.services.income.purchasingPower({
        amount: 10_000,
        monthlyContribution: 100,
        inflationRate: 0.03,
        growthRate: 0.07,
        years: 10,
      }),
    );
    expect(r.points).toHaveLength(11);
    expect(r.final.nominal).toBeGreaterThan(r.final.real);
    expect(r.amountReal).toBeLessThan(10_000);
  });
});
