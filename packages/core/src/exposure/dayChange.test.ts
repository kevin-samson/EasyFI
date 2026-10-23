import { describe, expect, it } from 'vitest';
import type { LatestPrices, SecurityMap } from '../types';
import { exposureDayChange, foldDayChanges } from './dayChange';
import { lookThrough } from './lookThrough';
import { etf, holding, snapshot, stock } from './testHelpers';

const FIN = 'Financials';
const securities: SecurityMap = { AAA: stock('AAA'), BBB: stock('BBB', FIN), FUND: etf('FUND') };
const books = {
  FUND: snapshot('FUND', [
    ['AAA', 0.5],
    ['BBB', 0.5, FIN],
  ]),
};

const q = (close: number, prevClose?: number) => ({
  close,
  date: '2026-09-30',
  ...(prevClose !== undefined ? { prevClose } : {}),
});

describe('exposureDayChange', () => {
  it("uses the company's own change when it is priced", () => {
    const prices: LatestPrices = { FUND: q(100, 100), AAA: q(110, 100) };
    const r = lookThrough({
      holdings: [holding('FUND', 10)],
      fundHoldings: books,
      prices,
      securities,
    });
    const aaa = r.exposures.find((e) => e.key === 'AAA')!;
    expect(exposureDayChange(aaa, prices)).toBeCloseTo(0.1);
  });

  it('falls back to the value-weighted change of the funds it is held through', () => {
    const prices: LatestPrices = { FUND: q(98, 100) };
    const r = lookThrough({
      holdings: [holding('FUND', 10)],
      fundHoldings: books,
      prices,
      securities,
    });
    const bbb = r.exposures.find((e) => e.key === 'BBB')!;
    expect(exposureDayChange(bbb, prices)).toBeCloseTo(-0.02);
  });

  it('is null when nothing has a previous close', () => {
    const prices: LatestPrices = { FUND: q(100) };
    const r = lookThrough({
      holdings: [holding('FUND', 10)],
      fundHoldings: books,
      prices,
      securities,
    });
    expect(exposureDayChange(r.exposures[0]!, prices)).toBeNull();
  });
});

describe('foldDayChanges', () => {
  it('value-weights exposure changes per fold group', () => {
    const prices: LatestPrices = { FUND: q(100, 100), AAA: q(110, 100), BBB: q(100, 100) };
    const r = lookThrough({
      holdings: [holding('FUND', 10), holding('AAA', 5)],
      fundHoldings: books,
      prices,
      securities,
    });
    const bySector = foldDayChanges(r, 'sector', prices);
    expect(bySector.get('Information Technology')).toBeCloseTo(0.1);
    expect(bySector.get(FIN)).toBeCloseTo(0);
    const byCompany = foldDayChanges(r, 'company', prices);
    expect(byCompany.get('AAA')).toBeCloseTo(0.1);
  });
});
