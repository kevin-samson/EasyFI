import type {
  AccountType,
  DividendPayment,
  Dividends,
  Inflation,
  PurchasingPowerBody,
  PurchasingPowerResult,
} from '@easyfi/contracts';
import { CPI_SERIES } from '@easyfi/data-sources';
import {
  addMonthKey,
  cpiSnapshot,
  dividendSummary,
  monthKey,
  purchasingPower,
  type IncomeEvent,
} from '@easyfi/core';
import type { Ctx } from './context';
import { badRequest } from './errors';
import { loadDividends } from './holdings';
import { nameOf } from './internal/analysis';
import { loadMarket } from './internal/market';
import { ALL, loadPortfolios, tickersOf, type PortfolioService } from './portfolios';

/** CPI categories shown as drivers, with approximate BLS relative-importance weights. */
const CPI_CATEGORIES: { key: string; id: string; label: string; weight: number }[] = [
  { key: 'shelter', id: CPI_SERIES.shelter, label: 'Shelter', weight: 0.355 },
  { key: 'food', id: CPI_SERIES.food, label: 'Food', weight: 0.136 },
  { key: 'medical', id: CPI_SERIES.medical, label: 'Medical care', weight: 0.068 },
  { key: 'transportation', id: CPI_SERIES.transportation, label: 'Transportation', weight: 0.063 },
  { key: 'energy', id: CPI_SERIES.energy, label: 'Energy', weight: 0.064 },
  { key: 'apparel', id: CPI_SERIES.apparel, label: 'Apparel', weight: 0.025 },
  { key: 'used-cars', id: CPI_SERIES.usedCars, label: 'Used cars and trucks', weight: 0.019 },
];

export function incomeService(ctx: Ctx, portfolios: PortfolioService) {
  return {
    async dividends(userId: string, portfolio: string = ALL): Promise<Dividends> {
      const ps = await loadPortfolios(ctx, userId, portfolio);
      const holdings = ps.flatMap((p) => p.holdings);
      const tickers = tickersOf(ps);
      const [market, events] = await Promise.all([
        loadMarket(ctx.repos, tickers),
        loadDividends(ctx, tickers),
      ]);
      const today = ctx.today();
      const s = dividendSummary({
        holdings,
        dividends: events,
        prices: market.prices,
        asOf: today,
      });

      // account with the most shares of each ticker (events are aggregated per ticker)
      const account = new Map<string, { type: AccountType; shares: number }>();
      for (const h of holdings) {
        const cur = account.get(h.ticker);
        if (h.shares !== null && (!cur || h.shares > cur.shares))
          account.set(h.ticker, { type: h.accountType, shares: h.shares });
      }
      const payment = (e: IncomeEvent): DividendPayment => ({
        id: `${e.ticker}:${e.exDate}:${e.status}`,
        ticker: e.ticker,
        name: nameOf(e.ticker, market),
        payDate: e.payDate ?? e.exDate,
        perShare: e.perShare,
        amount: e.total,
        account: account.get(e.ticker)?.type ?? 'taxable',
        status: e.status,
      });

      // show the past 6 months and the next 12
      const from = addMonthKey(monthKey(today), -6);
      const priceDates = Object.values(market.prices)
        .map((p) => p.date)
        .sort();
      const all = (await ctx.repos.portfolios.list(userId)).map((p) => ({
        id: p.id,
        name: p.name,
      }));
      const warnings = [
        ...s.incomeConcentration.map((w) => w.message),
        ...(s.unpriced.length
          ? [`No price for ${s.unpriced.join(', ')} — excluded from yield.`]
          : []),
      ];
      return {
        portfolio,
        kpis: {
          trailing12m: s.ttmIncome,
          trailing12mChange: s.ttmChangePct,
          portfolioYield: s.portfolioYield,
          yieldOnCost: s.yieldOnCost,
          next30Days: s.next30Days.total,
          projected12m: s.projection12m,
          asOf: priceDates.at(-1) ?? null,
        },
        calendar: s.calendar
          .filter((m) => m.month >= from)
          .map((m) => ({
            month: m.month,
            received: m.received,
            projected: m.projected,
            payments: m.events.map(payment),
          })),
        yieldLeaders: s.yieldLeaders.slice(0, 6).map((r) => ({
          ticker: r.ticker,
          name: nameOf(r.ticker, market),
          yield: r.yield,
          frequency: r.frequency ?? 'irregular',
        })),
        holdings: s.perHolding
          .filter((r) => r.ttmIncome > 0 || r.projected12m > 0)
          .sort((a, b) => b.ttmIncome - a.ttmIncome)
          .map((r) => ({
            ticker: r.ticker,
            name: nameOf(r.ticker, market),
            annualIncome: r.ttmIncome,
            yield: r.yield,
            yieldOnCost: r.yieldOnCost,
            shareOfIncome: r.pctOfIncome,
            frequency: r.frequency ?? 'irregular',
          })),
        warnings,
        portfolios: all,
      };
    },

    async inflation(userId: string): Promise<Inflation> {
      const ids = [CPI_SERIES.headline, CPI_SERIES.core, ...CPI_CATEGORIES.map((c) => c.id)];
      const fromPeriod = addMonthKey(monthKey(ctx.today()), -30);
      const points = await ctx.repos.cpi.list(ids, fromPeriod);
      const snap = cpiSnapshot(points, {
        headlineSeriesId: CPI_SERIES.headline,
        categories: Object.fromEntries(CPI_CATEGORIES.map((c) => [c.id, c.label])),
        weights: Object.fromEntries(CPI_CATEGORIES.map((c) => [c.id, c.weight])),
      });
      const core = snap.asOfPeriod
        ? cpiSnapshot(points, { headlineSeriesId: CPI_SERIES.core, categories: {} }).headline
        : null;
      const list = await portfolios.list(userId);
      const byId = new Map(CPI_CATEGORIES.map((c) => [c.id, c]));
      return {
        cpi: {
          period: snap.asOfPeriod,
          yoy: snap.headline?.yoy ?? null,
          mom: snap.headline?.mom ?? null,
          coreYoy: core && core.period === snap.asOfPeriod ? core.yoy : null,
          // BLS publishes mid-month for the prior month; the period's month end is the as-of date
          asOf: snap.asOfPeriod ? `${addMonthKey(snap.asOfPeriod, 1)}-15` : null,
          history: snap.trend,
        },
        categories: snap.drivers
          .map((d) => ({
            key: byId.get(d.seriesId)?.key ?? d.seriesId,
            label: d.label,
            yoy: d.yoy,
            weight: d.weight ?? 0,
          }))
          .sort((a, b) => (b.yoy ?? -1) - (a.yoy ?? -1)),
        trackedValue: list.portfolios.length ? list.totalValue : null,
      };
    },

    purchasingPower(body: PurchasingPowerBody): PurchasingPowerResult {
      try {
        const r = purchasingPower({
          amount: body.amount,
          monthlyContribution: body.monthlyContribution ?? 0,
          inflationRate: body.inflationRate,
          growthRate: body.growthRate,
          years: body.years,
        });
        const last = r.rows.at(-1)!;
        return {
          points: r.rows.map((x) => ({
            year: x.year,
            nominal: x.nominal,
            real: x.real,
            contributed: x.contributed,
          })),
          final: { nominal: r.finalNominal, real: r.finalReal, contributed: last.contributed },
          amountReal: r.purchasingPowerOfAmount,
        };
      } catch (e) {
        throw badRequest((e as Error).message);
      }
    },
  };
}
