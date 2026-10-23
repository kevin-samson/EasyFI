import { describe, expect, it } from 'vitest';
import { lookThroughCoverage } from './coverage';
import { etf, snapshot, stock } from './testHelpers';

const securities = { AAA: stock('AAA'), F: etf('F'), NOBOOK: etf('NOBOOK'), FXAIX: etf('FXAIX') };
const books = {
  F: snapshot('F', [
    ['AAA', 0.6],
    [null, 0.1],
  ]),
  VOO: snapshot('VOO', [['AAA', 0.9]]),
};

describe('lookThroughCoverage', () => {
  it('is 1 for stocks and cash, 0 for a fund without a book', () => {
    expect(lookThroughCoverage('AAA', securities, books)).toBe(1);
    expect(lookThroughCoverage('SPAXX', securities, books)).toBe(1);
    expect(lookThroughCoverage('NOBOOK', securities, books)).toBe(0);
  });

  it('is the mapped share of a fund book (equivalents allowed)', () => {
    expect(lookThroughCoverage('F', securities, books)).toBeCloseTo(0.6);
    expect(lookThroughCoverage('FXAIX', securities, books)).toBeCloseTo(0.9);
  });

  it('is null for an unknown ticker', () => {
    expect(lookThroughCoverage('ZZZ', securities, books)).toBeNull();
  });
});
