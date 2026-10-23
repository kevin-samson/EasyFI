import type { Home, MarketQuote, Mover } from '@easyfi/contracts';
import { exposureDayChange, exposureInsights, foldBy, UNRESOLVED_KEY } from '@easyfi/core';
import type { Ctx } from './context';
import { allocation, analyse, hasValue, scoreOf, summary } from './internal/analysis';
import { sectorLabel } from './internal/mappers';
import { loadMarket } from './internal/market';
import type { PortfolioService } from './portfolios';

/** Broad-market reference funds for the "Market context" strip. */
export const MARKET_CONTEXT: { ticker: string; name: string }[] = [
  { ticker: 'SCHD', name: 'Schwab Dividend' },
  { ticker: 'VTI', name: 'Total Market' },
  { ticker: 'VOO', name: 'S&P 500' },
  { ticker: 'QQQM', name: 'Nasdaq 100' },
];

const SUGGESTED_FUNDS = ['QQQ', 'VTI', 'SCHD', 'VGT', 'VOO'];

export function homeService(ctx: Ctx, portfolios: PortfolioService) {
  return {
    async get(userId: string): Promise<Home> {
      const { ps, market, combined } = await portfolios.analyseAllFor(userId);
      const analysed = ps.map((p) => analyse(p, market));
      const summaries = analysed
        .map((a) => summary(a, market))
        .sort((a, b) => (a.diversificationScore ?? 101) - (b.diversificationScore ?? 101));

      const insights = exposureInsights({
        portfolios: analysed.map((a) => ({
          id: a.portfolio.id,
          name: a.portfolio.name,
          result: a.result,
          holdings: a.portfolio.holdings,
        })),
        combined: combined.result,
        fundHoldings: market.fundHoldings,
      }).slice(0, 9);

      const movers: Mover[] = combined.result.exposures
        .filter((e) => e.kind === 'company' && e.ticker)
        .slice(0, 25)
        .map((e) => ({
          ticker: e.ticker!,
          name: e.name,
          change: exposureDayChange(e, market.prices),
          weight: e.weight,
          asOf: market.prices[e.ticker!]?.date ?? combined.result.asOf,
        }))
        .filter((m) => m.change !== null)
        .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!))
        .slice(0, 6);

      const ctxMarket = await loadMarket(
        ctx.repos,
        MARKET_CONTEXT.map((m) => m.ticker),
      );
      const marketContext: MarketQuote[] = MARKET_CONTEXT.map((m) => {
        const q = ctxMarket.prices[m.ticker];
        return {
          ticker: m.ticker,
          name: m.name,
          change: q && q.prevClose ? q.close / q.prevClose - 1 : null,
          asOf: q?.date ?? null,
        };
      });

      const held = new Set(combined.result.funds.map((f) => f.ticker));
      const notHeld = SUGGESTED_FUNDS.find((t) => !held.has(t)) ?? 'QQQ';
      const topSector = foldBy(combined.result, 'sector').find((g) => g.key !== UNRESOLVED_KEY);
      const askSuggestions = [
        `Would ${notHeld} overlap with my portfolio?`,
        topSector
          ? `Why is my ${sectorLabel(topSector.label).toLowerCase()} exposure so high?`
          : 'What do my funds actually own?',
      ];

      return {
        totalValue: hasValue(combined) ? combined.result.totalValue : null,
        changeToday: combined.valuation.dayChangePct,
        portfolioCount: ps.length,
        diversificationScore: scoreOf(combined),
        allocation: allocation(combined, market),
        portfolios: summaries,
        insights: insights.map((i) => ({
          id: i.id,
          severity: i.severity,
          text: i.title,
          askQuery: i.askPrompt,
        })),
        movers,
        marketContext,
        askSuggestions,
        asOf: combined.result.asOf,
      };
    },
  };
}
