import type { SecurityDetail, SecuritySearchResult, SecuritySummary } from '@easyfi/contracts';
import {
  isFundSecurity,
  normalizeTicker,
  resolveBook,
  sectorWeights,
  type Security,
} from '@easyfi/core';
import type { Ctx } from './context';
import { notFound } from './errors';
import { toCoreSecurity, sectorLabel } from './internal/mappers';
import { loadMarket } from './internal/market';

export function securityService(ctx: Ctx) {
  async function withBooks(list: Security[]): Promise<SecuritySummary[]> {
    const books = new Set((await ctx.repos.fundHoldings.funds()).map((f) => f.fundTicker));
    return list.map((s) => ({
      ticker: s.ticker,
      name: s.name,
      type: s.type,
      sector: s.sector,
      expenseRatio: s.expenseRatio,
      hasLookThrough: !isFundSecurity(s) || hasEquivalentBook(s.ticker, books),
    }));
  }

  return {
    async search(q: string, limit: number): Promise<SecuritySearchResult> {
      const rows = await ctx.repos.securities.search(q, limit);
      return { results: await withBooks(rows.map(toCoreSecurity)) };
    },

    async get(rawTicker: string): Promise<SecurityDetail> {
      const ticker = normalizeTicker(rawTicker);
      const market = await loadMarket(ctx.repos, [ticker]);
      const sec = market.securities[ticker];
      if (!sec) throw notFound(`Security ${ticker}`);
      const [summary] = await withBooks([sec]);
      const q = market.prices[ticker];
      const book = resolveBook(ticker, market.fundHoldings);
      const snap = book?.snapshot;
      return {
        ...summary!,
        industry: sec.industry,
        price: q?.close ?? null,
        dayChange: q?.prevClose ? q.close / q.prevClose - 1 : null,
        priceAsOf: q?.date ?? null,
        holdingsCount: snap ? snap.constituents.length : null,
        holdingsAsOf: snap?.asOf ?? null,
        topHoldings: snap
          ? [...snap.constituents]
              .sort((a, b) => b.weight - a.weight)
              .slice(0, 15)
              .map((c) => ({ ticker: c.constituentTicker, name: c.name, weight: c.weight }))
          : [],
        sectors: snap
          ? sectorWeights(snap).map((s) => ({
              key: s.sector,
              label: sectorLabel(s.sector),
              weight: s.weight,
            }))
          : [],
      };
    },
  };
}

function hasEquivalentBook(ticker: string, books: Set<string>): boolean {
  const fake = Object.fromEntries([...books].map((b) => [b, { asOf: '', constituents: [] }]));
  return resolveBook(ticker, fake) !== null;
}
