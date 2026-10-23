import type { AllocationSlice, CompareFund, Comparison } from '@easyfi/contracts';
import {
  foldBy,
  normalizeTicker,
  overlap,
  resolveBook,
  sectorWeights,
  UNRESOLVED_KEY,
  type Exposure,
  type FundHoldingsSnapshot,
} from '@easyfi/core';
import type { Ctx } from './context';
import { badRequest, notFound } from './errors';
import { analyse, nameOf } from './internal/analysis';
import { sectorLabel } from './internal/mappers';
import { loadMarket } from './internal/market';
import { loadPortfolios, tickersOf } from './portfolios';

const MAX_SECTORS = 6;
const TOP_HOLDINGS = 10;
const MAX_SHARED = 60;

type Side = { fund: CompareFund; book: FundHoldingsSnapshot | readonly Exposure[] };

function topSectors(list: { sector: string; weight: number }[]): AllocationSlice[] {
  const sorted = [...list].sort((a, b) => b.weight - a.weight);
  const shown = sorted.filter((s) => s.sector !== 'Other').slice(0, MAX_SECTORS);
  const rest = 1 - shown.reduce((s, x) => s + x.weight, 0);
  const slices = shown.map((s) => ({
    key: s.sector,
    label: sectorLabel(s.sector),
    weight: s.weight,
  }));
  if (rest > 0.0005) slices.push({ key: 'other', label: 'Other', weight: rest });
  return slices;
}

export function compareService(ctx: Ctx) {
  async function fundSide(ticker: string): Promise<Side> {
    const t = normalizeTicker(ticker);
    const market = await loadMarket(ctx.repos, [t]);
    const book = resolveBook(t, market.fundHoldings);
    if (!book) {
      const sec = market.securities[t];
      throw sec ? badRequest(`No holdings data for ${t} yet`) : notFound(`Fund ${t}`);
    }
    const snap = book.snapshot;
    const top = [...snap.constituents].sort((a, b) => b.weight - a.weight).slice(0, TOP_HOLDINGS);
    return {
      book: snap,
      fund: {
        ticker: t,
        name: nameOf(t, market),
        kind: 'fund',
        asOf: snap.asOf,
        holdingsCount: snap.constituents.filter((c) => c.constituentTicker).length,
        sectors: topSectors(sectorWeights(snap)),
        topHoldings: top.map((c) => ({
          ticker: c.constituentTicker ?? '—',
          name: c.name,
          weight: c.weight,
        })),
      },
    };
  }

  async function portfolioSide(userId: string, id: string): Promise<Side> {
    const [p] = await loadPortfolios(ctx, userId, id);
    const market = await loadMarket(ctx.repos, tickersOf([p!]));
    const a = analyse(p!, market);
    const companies = a.result.exposures.filter((e) => e.kind === 'company');
    const sectors = foldBy(a.result, 'sector')
      .filter((g) => g.key !== UNRESOLVED_KEY)
      .map((g) => ({ sector: g.label, weight: g.weight }));
    return {
      book: companies,
      fund: {
        ticker: p!.id,
        name: p!.name,
        kind: 'portfolio',
        asOf: a.result.holdingsAsOf ?? a.result.asOf,
        holdingsCount: companies.length,
        sectors: topSectors(sectors),
        topHoldings: companies
          .slice(0, TOP_HOLDINGS)
          .map((e) => ({ ticker: e.ticker!, name: e.name, weight: e.weight })),
      },
    };
  }

  return {
    async compare(userId: string, a: string, b: string): Promise<Comparison> {
      const portfolios = await ctx.repos.portfolios.list(userId);
      const isPortfolio = (x: string) => portfolios.some((p) => p.id === x);
      const side = (x: string) => (isPortfolio(x) ? portfolioSide(userId, x) : fundSide(x));
      const [left, right] = await Promise.all([side(a), side(b)]);
      const o = overlap(left.book, right.book);
      const funds = await ctx.repos.fundHoldings.funds();
      const names = await ctx.repos.securities.getMany(funds.map((f) => f.fundTicker));
      const nameBy = new Map(names.map((s) => [s.ticker, s.name]));
      return {
        a: left.fund,
        b: right.fund,
        shared: o.shared.slice(0, MAX_SHARED).map((s) => ({
          ticker: s.ticker,
          name: s.name,
          sector: s.sector ? sectorLabel(s.sector) : null,
          weightA: s.weightA,
          weightB: s.weightB,
        })),
        sharedCount: o.sharedCount,
        overlapByWeight: o.overlapByWeight,
        options: [
          ...funds.map((f) => ({
            value: f.fundTicker,
            label: `${f.fundTicker} · ${nameBy.get(f.fundTicker) ?? f.fundTicker}`,
            kind: 'fund' as const,
          })),
          ...portfolios.map((p) => ({ value: p.id, label: p.name, kind: 'portfolio' as const })),
        ],
      };
    },
  };
}
