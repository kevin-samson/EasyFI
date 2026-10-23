import { DIRECT } from './lookThrough';
import type { LookThroughResult } from './types';

export interface FundPairOverlap {
  a: string;
  b: string;
  /** Σ over shared exposures of min(value via a, value via b). */
  value: number;
  /** value / portfolio total. */
  weight: number;
  sharedCount: number;
}

/**
 * Money the portfolio holds "twice": for every pair of held funds, the value of companies both
 * reach, counted once at the smaller of the two contributions. Sorted by value desc.
 */
export function pairwiseFundOverlap(result: LookThroughResult): FundPairOverlap[] {
  const pairs = new Map<string, FundPairOverlap>();
  for (const e of result.exposures) {
    const via = e.sources.filter((s) => s.via !== DIRECT && s.value > 0);
    for (let i = 0; i < via.length; i++) {
      for (let j = i + 1; j < via.length; j++) {
        const [x, y] = [via[i]!, via[j]!].sort((p, q) => p.via.localeCompare(q.via));
        const key = `${x!.via}\u0000${y!.via}`;
        const p = pairs.get(key) ?? { a: x!.via, b: y!.via, value: 0, weight: 0, sharedCount: 0 };
        p.value += Math.min(x!.value, y!.value);
        p.sharedCount += 1;
        pairs.set(key, p);
      }
    }
  }
  const total = result.totalValue;
  return [...pairs.values()]
    .map((p) => ({ ...p, weight: total > 0 ? p.value / total : 0 }))
    .sort((p, q) => q.value - p.value || p.a.localeCompare(q.a) || p.b.localeCompare(q.b));
}
