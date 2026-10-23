import type {
  BulkHoldingsBody,
  CreateHoldingBody,
  CsvImportBody,
  CsvImportResult,
  HoldingList,
  HoldingRow,
  HoldingType,
  UpdateHoldingBody,
} from '@easyfi/contracts';
import {
  addMonths,
  dividendSummary,
  isCashTicker,
  lookThroughCoverage,
  normalizeTicker,
  parseBrokerCsv,
  valueHolding,
  type DividendEvent,
  type Holding,
  type SecurityType,
} from '@easyfi/core';
import type { HoldingInput, schema } from '@easyfi/db';
import type { Ctx } from './context';
import { badRequest, notFound } from './errors';
import { toCoreHolding } from './internal/mappers';
import { loadMarket, type MarketData } from './internal/market';

type DbHolding = typeof schema.holdings.$inferSelect;

const TYPE: Record<SecurityType, HoldingType> = {
  stock: 'stock',
  etf: 'etf',
  mutual_fund: 'mutual_fund',
  mmf: 'cash',
  crypto: 'crypto',
  bond: 'bond',
  other: 'other',
};

export async function loadDividends(
  ctx: Ctx,
  tickers: readonly string[],
): Promise<DividendEvent[]> {
  const from = addMonths(ctx.today(), -25);
  const rows = await ctx.repos.dividends.list([...new Set(tickers)], from);
  return rows.map((d) => ({
    ticker: d.ticker,
    exDate: d.exDate,
    payDate: d.payDate,
    amount: d.amount,
  }));
}

function toRows(
  holdings: Holding[],
  market: MarketData,
  dividends: DividendEvent[],
  today: string,
): HoldingRow[] {
  const income = dividendSummary({ holdings, dividends, prices: market.prices, asOf: today });
  const incomeByTicker = new Map(income.perHolding.map((r) => [r.ticker, r]));
  return holdings.map((h) => {
    const v = valueHolding(h, market.prices);
    const sec = market.securities[v.ticker];
    const inc = incomeByTicker.get(h.ticker);
    const perShare = inc?.ttmPerShare ?? 0;
    const type: HoldingType = isCashTicker(h.ticker) ? 'cash' : sec ? TYPE[sec.type] : 'other';
    return {
      id: h.id,
      ticker: h.ticker,
      name: sec?.name ?? (type === 'cash' ? 'Cash' : h.ticker),
      type,
      accountType: h.accountType,
      shares: h.shares,
      price: v.price,
      value: v.value,
      costBasis: h.costBasis,
      dayChange: v.dayChangePct,
      totalReturn: v.gainPct,
      yield: inc ? inc.yield : null,
      annualIncome: h.shares !== null && inc ? h.shares * perShare : null,
      tags: h.tags,
      lookThroughCoverage: lookThroughCoverage(h.ticker, market.securities, market.fundHoldings),
      asOf: v.priceDate ?? h.statementDate,
    };
  });
}

function toInput(b: {
  ticker: string;
  accountType?: Holding['accountType'] | undefined;
  shares?: number | null | undefined;
  costBasis?: number | null | undefined;
  statementValue?: number | null | undefined;
  statementDate?: string | null | undefined;
  tags?: string[] | undefined;
}): HoldingInput {
  return {
    ticker: normalizeTicker(b.ticker),
    // statement-only lines are stored with 0 shares (column is NOT NULL)
    shares: b.shares ?? 0,
    ...(b.accountType ? { accountType: b.accountType } : {}),
    costBasis: b.costBasis ?? null,
    statementValue: b.statementValue ?? null,
    statementDate: b.statementDate ?? null,
    tags: b.tags ?? [],
  };
}

export function holdingService(ctx: Ctx) {
  async function rowsFor(userId: string, list: DbHolding[]): Promise<HoldingRow[]> {
    const holdings = list.map(toCoreHolding);
    const tickers = holdings.map((h) => h.ticker);
    const [market, dividends] = await Promise.all([
      loadMarket(ctx.repos, tickers),
      loadDividends(ctx, tickers),
    ]);
    void userId;
    return toRows(holdings, market, dividends, ctx.today());
  }

  async function rowOf(userId: string, h: DbHolding): Promise<HoldingRow> {
    return (await rowsFor(userId, [h]))[0]!;
  }

  return {
    async list(userId: string, portfolioId: string): Promise<HoldingList> {
      const p = await ctx.repos.portfolios.get(userId, portfolioId);
      if (!p) throw notFound('Portfolio');
      const rows = await rowsFor(userId, await ctx.repos.holdings.list(userId, portfolioId));
      const dates = rows
        .map((r) => r.asOf)
        .filter((d): d is string => !!d)
        .sort();
      return { portfolioId: p.id, portfolioName: p.name, holdings: rows, asOf: dates[0] ?? null };
    },

    async create(
      userId: string,
      portfolioId: string,
      body: CreateHoldingBody,
    ): Promise<HoldingRow> {
      const ticker = normalizeTicker(body.ticker);
      let shares = body.shares ?? null;
      if (shares === null && body.dollars != null) {
        const [latest] = await ctx.repos.prices.latest([ticker]);
        if (!latest)
          throw badRequest(`No price for ${ticker} yet — enter shares instead of dollars`);
        shares = Math.round((body.dollars / latest.close) * 1e6) / 1e6;
      }
      const created = await ctx.repos.holdings.create(
        userId,
        portfolioId,
        toInput({ ...body, ticker, shares, tags: body.tags ?? [] }),
      );
      if (!created) throw notFound('Portfolio');
      return rowOf(userId, created);
    },

    async update(userId: string, id: string, body: UpdateHoldingBody): Promise<HoldingRow> {
      const patch: Partial<HoldingInput> = {};
      if (body.ticker !== undefined) patch.ticker = normalizeTicker(body.ticker);
      if (body.accountType !== undefined) patch.accountType = body.accountType;
      if (body.shares !== undefined) patch.shares = body.shares ?? 0;
      if (body.costBasis !== undefined) patch.costBasis = body.costBasis;
      if (body.statementValue !== undefined) patch.statementValue = body.statementValue;
      if (body.statementDate !== undefined) patch.statementDate = body.statementDate;
      if (body.tags !== undefined) patch.tags = body.tags;
      const updated = Object.keys(patch).length
        ? await ctx.repos.holdings.update(userId, id, patch)
        : await ctx.repos.holdings.get(userId, id);
      if (!updated) throw notFound('Holding');
      return rowOf(userId, updated);
    },

    async remove(userId: string, id: string): Promise<{ ok: true }> {
      if (!(await ctx.repos.holdings.delete(userId, id))) throw notFound('Holding');
      return { ok: true };
    },

    async bulk(
      userId: string,
      portfolioId: string,
      body: BulkHoldingsBody,
    ): Promise<{ affected: number }> {
      if (!(await ctx.repos.portfolios.get(userId, portfolioId))) throw notFound('Portfolio');
      const owned = new Set((await ctx.repos.holdings.list(userId, portfolioId)).map((h) => h.id));
      const ids = body.ids.filter((i) => owned.has(i));
      if (body.action === 'delete')
        return { affected: await ctx.repos.holdings.bulkDelete(userId, ids) };
      if (!body.tag) throw badRequest('tag is required');
      const change = body.action === 'tag' ? { add: [body.tag] } : { remove: [body.tag] };
      return { affected: await ctx.repos.holdings.bulkTag(userId, ids, change) };
    },

    async importCsv(
      userId: string,
      portfolioId: string,
      body: CsvImportBody,
    ): Promise<CsvImportResult> {
      if (!(await ctx.repos.portfolios.get(userId, portfolioId))) throw notFound('Portfolio');
      const parsed = parseBrokerCsv(body.csv, body.broker ?? 'auto');
      if (parsed.holdings.length === 0 && parsed.warnings.length === 0) {
        throw badRequest('No holdings found in the CSV');
      }
      const holdings = parsed.holdings.map((h) => ({
        ticker: h.ticker,
        accountName: h.accountName,
        accountType: h.accountType,
        shares: h.shares,
        costBasis: h.costBasis,
        statementValue: h.statementValue,
      }));
      let imported = 0;
      if (!body.dryRun && holdings.length) {
        if (body.replace) {
          const existing = await ctx.repos.holdings.list(userId, portfolioId);
          await ctx.repos.holdings.bulkDelete(
            userId,
            existing.map((h) => h.id),
          );
        }
        const rows = await ctx.repos.holdings.bulkInsert(
          userId,
          portfolioId,
          holdings.map((h) => toInput(h)),
        );
        imported = rows?.length ?? 0;
      }
      return {
        format: parsed.format,
        imported,
        holdings,
        warnings: parsed.warnings.map((w) => ({ line: w.line, message: w.message })),
      };
    },
  };
}

export type HoldingService = ReturnType<typeof holdingService>;
