import type { WhatIfBody, WhatIfResult } from '@easyfi/contracts';
import { normalizeTicker, whatIf } from '@easyfi/core';
import type { Ctx } from './context';
import { badRequest } from './errors';
import { nameOf } from './internal/analysis';
import { sectorLabel } from './internal/mappers';
import { loadMarket } from './internal/market';
import { loadPortfolios, tickersOf } from './portfolios';

export function whatIfService(ctx: Ctx) {
  return {
    async run(userId: string, body: WhatIfBody): Promise<WhatIfResult> {
      const ticker = normalizeTicker(body.ticker);
      const ps = await loadPortfolios(ctx, userId, body.portfolio ?? 'all');
      const market = await loadMarket(ctx.repos, [...tickersOf(ps), ticker]);
      if (!market.securities[ticker]) throw badRequest(`Unknown ticker ${ticker}`);
      const r = whatIf(
        {
          holdings: ps.flatMap((p) => p.holdings),
          cash: ps.reduce((s, p) => s + p.cash, 0),
          fundHoldings: market.fundHoldings,
          prices: market.prices,
          securities: market.securities,
        },
        { ticker, amount: body.amount },
      );
      return {
        ticker,
        name: nameOf(ticker, market),
        amount: r.amount,
        before: { totalValue: r.before.totalValue, score: Math.round(r.before.score) },
        after: { totalValue: r.after.totalValue, score: Math.round(r.after.score) },
        sectorShifts: r.sectorShifts.map((s) => ({ ...s, sector: sectorLabel(s.sector) })),
        overlaps: r.overlaps,
        topChanges: r.topChanges.map((c) => ({
          ticker: c.ticker,
          name: c.name,
          beforeWeight: c.beforeWeight,
          afterWeight: c.afterWeight,
          shift: c.shift,
        })),
        addedResolved: r.addedResolved,
        asOf: market.prices[ticker]?.date ?? null,
      };
    },
  };
}
