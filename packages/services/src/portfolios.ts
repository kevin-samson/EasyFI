import type {
  Constellation,
  CreatePortfolioBody,
  FoldBy,
  LookThrough,
  PortfolioDetail,
  PortfolioList,
  PortfolioSummary,
  RangeKey,
  UpdatePortfolioBody,
  ValueSeriesSet,
} from '@easyfi/contracts';
import {
  constellationGraph,
  DIRECT_HUB_ID,
  feeDrag,
  portfolioValueSeries,
  type ValueRange,
} from '@easyfi/core';
import type { PortfolioWithHoldings } from '@easyfi/db';
import type { Ctx } from './context';
import { notFound } from './errors';
import {
  allocation,
  analyse,
  analyseAll,
  exposureRows,
  fundRefs,
  hasValue,
  nameOf,
  scoreOf,
  sourceOrder,
  summary,
  type PortfolioInput,
} from './internal/analysis';
import { sectorLabel, toCoreHolding } from './internal/mappers';
import { loadMarket } from './internal/market';

export const ALL = 'all';

export function toPortfolioInput(p: PortfolioWithHoldings): PortfolioInput {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    holdings: p.holdings.map(toCoreHolding),
    cash: p.cash,
  };
}

/** The user's portfolios (all, or one by id) with holdings, as core input. */
export async function loadPortfolios(
  ctx: Ctx,
  userId: string,
  id?: string,
): Promise<PortfolioInput[]> {
  const all = (await ctx.repos.portfolios.listWithHoldings(userId)).map(toPortfolioInput);
  if (!id || id === ALL) return all;
  const one = all.find((p) => p.id === id);
  if (!one) throw notFound('Portfolio');
  return [one];
}

export const tickersOf = (ps: PortfolioInput[]) =>
  ps.flatMap((p) => p.holdings.map((h) => h.ticker));

const RANGE_SPEC: Record<RangeKey, [ValueRange, string]> = {
  '1D': ['1d', 'today'],
  '7D': ['7d', 'past week'],
  '1M': ['1m', 'past month'],
  '3M': ['3m', 'past 3 months'],
  YTD: ['ytd', 'year to date'],
  '1Y': ['1y', 'past year'],
  MAX: ['max', 'since first close'],
};

export function portfolioService(ctx: Ctx) {
  /** One portfolio, or every portfolio combined when id is 'all'. */
  async function analysedOne(userId: string, id: string) {
    const ps = await loadPortfolios(ctx, userId, id);
    const market = await loadMarket(ctx.repos, tickersOf(ps));
    return { a: id === ALL ? analyseAll(ps, market) : analyse(ps[0]!, market), market };
  }

  async function summaryOf(userId: string, id: string): Promise<PortfolioSummary> {
    const { a, market } = await analysedOne(userId, id);
    return summary(a, market);
  }

  return {
    async list(userId: string): Promise<PortfolioList> {
      const ps = await loadPortfolios(ctx, userId);
      const market = await loadMarket(ctx.repos, tickersOf(ps));
      const summaries = ps.map((p) => summary(analyse(p, market), market));
      const dates = summaries
        .map((s) => s.asOf)
        .filter((d): d is string => !!d)
        .sort();
      return {
        portfolios: summaries,
        totalValue: summaries.reduce((s, p) => s + (p.totalValue ?? 0), 0),
        asOf: dates[0] ?? null,
      };
    },

    async create(userId: string, body: CreatePortfolioBody): Promise<PortfolioSummary> {
      await ctx.repos.profiles.upsert(userId);
      const p = await ctx.repos.portfolios.create(userId, {
        name: body.name,
        type: body.type ?? 'actual',
      });
      if (body.cash) await ctx.repos.cash.set(userId, p.id, body.cash);
      return summaryOf(userId, p.id);
    },

    async update(userId: string, id: string, body: UpdatePortfolioBody): Promise<PortfolioSummary> {
      const { cash, ...patch } = body;
      if (Object.keys(patch).length) {
        if (!(await ctx.repos.portfolios.update(userId, id, patch))) throw notFound('Portfolio');
      } else if (!(await ctx.repos.portfolios.get(userId, id))) {
        throw notFound('Portfolio');
      }
      if (cash !== undefined) await ctx.repos.cash.set(userId, id, cash);
      return summaryOf(userId, id);
    },

    async remove(userId: string, id: string): Promise<{ ok: true }> {
      if (!(await ctx.repos.portfolios.delete(userId, id))) throw notFound('Portfolio');
      return { ok: true };
    },

    async detail(userId: string, id: string): Promise<PortfolioDetail> {
      const { a, market } = await analysedOne(userId, id);
      const fees = feeDrag(a.valuation, market.securities, market.fundHoldings);
      return {
        id: a.portfolio.id,
        name: a.portfolio.name,
        type: a.portfolio.type,
        currency: 'USD',
        holdingsCount: a.portfolio.holdings.length,
        totalValue: hasValue(a) ? a.result.totalValue : null,
        changeToday: a.valuation.dayChangePct,
        diversificationScore: scoreOf(a),
        cash: a.portfolio.cash,
        allocation: allocation(a, market),
        funds: fundRefs(a, market),
        unpriced: a.result.unpriced,
        feeDrag: {
          blendedExpenseRatio: fees.blendedExpenseRatio,
          annualCost: fees.annualCost,
          unknown: fees.unknown,
          contributions: fees.contributions,
          overlapWaste: fees.overlapWaste,
        },
        asOf: a.result.asOf,
        holdingsAsOf: a.result.holdingsAsOf,
      };
    },

    async lookThrough(userId: string, id: string, fold: FoldBy): Promise<LookThrough> {
      const { a, market } = await analysedOne(userId, id);
      return {
        portfolioId: a.portfolio.id,
        fold,
        totalValue: a.result.totalValue,
        rows: exposureRows(a, market, fold),
        funds: fundRefs(a, market),
        sourceOrder: sourceOrder(a),
        unresolved: a.result.unresolved,
        unpriced: a.result.unpriced,
        asOf: a.result.asOf,
        holdingsAsOf: a.result.holdingsAsOf,
      };
    },

    async constellation(userId: string, id: string): Promise<Constellation> {
      const { a, market } = await analysedOne(userId, id);
      const g = constellationGraph(a.result);
      const holdings = g.nodes
        .filter((n) => n.kind === 'holding' && n.ticker)
        .map((n, i) => {
          const edges = g.edges.filter((e) => e.target === n.id);
          return {
            key: n.ticker!,
            ticker: n.ticker!,
            name: n.label,
            sector: n.sector ? sectorLabel(n.sector) : null,
            concentration: n.concentration ?? 'low',
            weight: n.weight,
            value: n.value,
            funds: edges
              .filter((e) => e.source !== DIRECT_HUB_ID)
              .map((e) => e.source.replace(/^fund:/, '')),
            direct: edges.some((e) => e.source === DIRECT_HUB_ID),
            labeled: i < 12,
          };
        });
      return {
        portfolioId: a.portfolio.id,
        funds: fundRefs(a, market).filter((f) => holdings.some((h) => h.funds.includes(f.ticker))),
        sourceOrder: sourceOrder(a),
        holdings,
        asOf: a.result.asOf,
      };
    },

    /** id may be 'all' for the combined series. */
    async valueSeries(userId: string, id: string): Promise<ValueSeriesSet> {
      const ps = await loadPortfolios(ctx, userId, id);
      const holdings = ps.flatMap((p) => p.holdings);
      const cash = ps.reduce((s, p) => s + p.cash, 0);
      const tickers = [...new Set(holdings.filter((h) => h.shares !== null).map((h) => h.ticker))];
      const histories = await Promise.all(tickers.map((t) => ctx.repos.prices.history(t)));
      const priceHistory = histories
        .flat()
        .map((r) => ({ ticker: r.ticker, date: r.date, close: r.close }));
      const asOf = priceHistory.reduce<string | null>(
        (max, p) => (!max || p.date > max ? p.date : max),
        null,
      );
      const ranges: ValueSeriesSet['ranges'] = {};
      let unpriced: string[] = [];
      if (asOf) {
        for (const [key, [range, label]] of Object.entries(RANGE_SPEC) as [
          RangeKey,
          [ValueRange, string],
        ][]) {
          const s = portfolioValueSeries({
            holdings,
            cash,
            priceHistory,
            range,
            asOf,
            maxPoints: 180,
          });
          unpriced = s.unpriced;
          if (s.points.length < 2) continue;
          ranges[key] = { points: s.points, change: s.change.pct, changeLabel: label };
        }
      }
      return { ranges, unpriced, asOf };
    },

    /** Combined analysis of every portfolio (used by Home and What-if). */
    async analyseAllFor(userId: string) {
      const ps = await loadPortfolios(ctx, userId);
      const market = await loadMarket(ctx.repos, tickersOf(ps));
      return { ps, market, combined: analyseAll(ps, market) };
    },

    nameOf,
  };
}

export type PortfolioService = ReturnType<typeof portfolioService>;
