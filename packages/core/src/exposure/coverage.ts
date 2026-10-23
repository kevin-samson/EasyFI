import type { FundHoldingsMap, SecurityMap } from '../types';
import { isCashTicker, normalizeTicker } from './normalizeTicker';
import { isFundSecurity, resolveBook } from './resolveBook';

/**
 * Share of a holding whose underlying companies are known: 1 for a stock or cash, the summed
 * weight of ticker-mapped constituents for a fund with a book (own or equivalent), 0 for a fund
 * without one. Null when the ticker is not a known security.
 */
export function lookThroughCoverage(
  rawTicker: string,
  securities: SecurityMap,
  fundHoldings: FundHoldingsMap,
): number | null {
  if (isCashTicker(rawTicker)) return 1;
  const ticker = normalizeTicker(rawTicker);
  const book = resolveBook(ticker, fundHoldings);
  const sec = securities[ticker];
  if (!book) {
    if (!sec) return null;
    return isFundSecurity(sec) ? 0 : 1;
  }
  const mapped = book.snapshot.constituents
    .filter((c) => c.constituentTicker !== null)
    .reduce((s, c) => s + c.weight, 0);
  return Math.min(1, mapped);
}
