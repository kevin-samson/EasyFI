import { describe, expect, it } from 'vitest';
import type { SecurityMap } from '../types';
import { groupConcentration } from './concentration';
import { lookThrough } from './lookThrough';
import { pairwiseFundOverlap } from './pairwiseOverlap';
import { etf, holding, px, snapshot, stock } from './testHelpers';

const securities: SecurityMap = {
  AAA: stock('AAA'),
  BBB: stock('BBB'),
  CCC: stock('CCC'),
  F1: etf('F1'),
  F2: etf('F2'),
  F3: etf('F3'),
};
const books = {
  F1: snapshot('F1', [
    ['AAA', 0.5],
    ['BBB', 0.5],
  ]),
  F2: snapshot('F2', [
    ['AAA', 0.5],
    ['CCC', 0.5],
  ]),
  F3: snapshot('F3', [['CCC', 1]]),
};

describe('pairwiseFundOverlap', () => {
  it('measures value held in common by each pair of funds, largest first', () => {
    const r = lookThrough({
      holdings: [holding('F1', 10), holding('F2', 10), holding('F3', 10)],
      fundHoldings: books,
      prices: { F1: px(10), F2: px(10), F3: px(10) },
      securities,
    });
    const pairs = pairwiseFundOverlap(r);
    // F1∩F2 share AAA: min(50, 50) = 50 of 300. F2∩F3 share CCC: min(50, 100) = 50.
    expect(pairs.map((p) => [p.a, p.b])).toEqual([
      ['F1', 'F2'],
      ['F2', 'F3'],
    ]);
    expect(pairs[0]!.value).toBeCloseTo(50);
    expect(pairs[0]!.weight).toBeCloseTo(50 / 300);
    expect(pairs[0]!.sharedCount).toBe(1);
  });

  it('ignores direct holdings and returns nothing for a single fund', () => {
    const r = lookThrough({
      holdings: [holding('F1', 10), holding('AAA', 5)],
      fundHoldings: books,
      prices: { F1: px(10), AAA: px(10) },
      securities,
    });
    expect(pairwiseFundOverlap(r)).toEqual([]);
  });
});

describe('groupConcentration', () => {
  it('uses sector thresholds for sector folds and company thresholds otherwise', () => {
    expect(groupConcentration(0.65, 'sector')).toBe('high');
    expect(groupConcentration(0.45, 'sector')).toBe('medium');
    expect(groupConcentration(0.1, 'sector')).toBe('low');
    expect(groupConcentration(0.3, 'industry')).toBe('high');
    expect(groupConcentration(0.12, 'industry')).toBe('medium');
  });
});
