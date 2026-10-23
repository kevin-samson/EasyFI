import type { LatestPrices } from '../types';
import { foldKey, type FoldDimension } from './foldBy';
import { DIRECT } from './lookThrough';
import type { Exposure, LookThroughResult } from './types';

function quoteChange(ticker: string | null, prices: LatestPrices): number | null {
  if (!ticker) return null;
  const q = prices[ticker];
  if (!q || q.prevClose === undefined || q.prevClose <= 0) return null;
  return q.close / q.prevClose - 1;
}

/**
 * Today's change of one exposure: its own quote when priced, else the value-weighted change of
 * the funds it is reached through (a proxy — the fund moved, not necessarily this company).
 * Null when neither is known.
 */
export function exposureDayChange(e: Exposure, prices: LatestPrices): number | null {
  const own = quoteChange(e.ticker, prices);
  if (own !== null) return own;
  let num = 0;
  let den = 0;
  for (const s of e.sources) {
    if (s.via === DIRECT) continue;
    const c = quoteChange(s.via, prices);
    if (c === null) continue;
    num += s.value * c;
    den += s.value;
  }
  return den > 0 ? num / den : null;
}

/** Value-weighted day change per foldBy group key; groups without any known change are null. */
export function foldDayChanges(
  result: LookThroughResult,
  by: FoldDimension,
  prices: LatestPrices,
): Map<string, number | null> {
  const acc = new Map<string, { num: number; den: number }>();
  for (const e of result.exposures) {
    const k = foldKey(e, by);
    if (!k) continue;
    const a = acc.get(k.key) ?? { num: 0, den: 0 };
    const c = exposureDayChange(e, prices);
    if (c !== null) {
      a.num += e.value * c;
      a.den += e.value;
    }
    acc.set(k.key, a);
  }
  return new Map([...acc].map(([k, a]) => [k, a.den > 0 ? a.num / a.den : null]));
}
