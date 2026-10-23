// Shared look-through → DTO building blocks used by several use-cases.
import type {
  AllocationData,
  AllocationSlice,
  ExposureRow,
  FoldBy,
  FundRef,
  PortfolioSummary,
} from '@easyfi/contracts';
import {
  concentration,
  diversificationScore,
  foldBy,
  foldDayChanges,
  foldKey,
  groupConcentration,
  lookThrough,
  pairwiseFundOverlap,
  UNRESOLVED_KEY,
  UNRESOLVED_LABEL,
  valueHoldings,
  type Holding,
  type LookThroughResult,
} from '@easyfi/core';
import type { MarketData } from './market';
import { DIRECT_SOURCE, sectorLabel } from './mappers';

export interface PortfolioInput {
  id: string;
  name: string;
  type: PortfolioSummary['type'];
  holdings: Holding[];
  cash: number;
}

export interface Analysed {
  portfolio: PortfolioInput;
  result: LookThroughResult;
  valuation: ReturnType<typeof valueHoldings>;
}

export function analyse(p: PortfolioInput, m: MarketData): Analysed {
  const result = lookThrough({
    holdings: p.holdings,
    cash: p.cash,
    fundHoldings: m.fundHoldings,
    prices: m.prices,
    securities: m.securities,
  });
  return { portfolio: p, result, valuation: valueHoldings(p.holdings, m.prices) };
}

/** Combined look-through of several portfolios (Home "All portfolios"). */
export function analyseAll(ps: PortfolioInput[], m: MarketData): Analysed {
  return analyse(
    {
      id: 'all',
      name: 'All portfolios',
      type: 'actual',
      holdings: ps.flatMap((p) => p.holdings),
      cash: ps.reduce((s, p) => s + p.cash, 0),
    },
    m,
  );
}

export function nameOf(ticker: string, m: MarketData): string {
  return m.securities[ticker]?.name ?? ticker;
}

export function hasValue(a: Analysed): boolean {
  return a.result.totalValue > 0 || a.valuation.lines.some((l) => l.value !== null);
}

export function scoreOf(a: Analysed): number | null {
  return a.result.resolvedValue > 0 ? Math.round(diversificationScore(a.result)) : null;
}

const MAX_SLICES = 5;

function topSlices(
  groups: { key: string; label: string; weight: number; changeToday: number | null }[],
  n = MAX_SLICES,
): AllocationSlice[] {
  const sorted = [...groups].filter((g) => g.weight > 0).sort((a, b) => b.weight - a.weight);
  const unresolved = sorted.find((g) => g.key === UNRESOLVED_KEY);
  // keep the legend at n + 1 rows: the unresolved slice takes one of the named slots
  const shown = sorted.filter((g) => g.key !== UNRESOLVED_KEY).slice(0, unresolved ? n - 1 : n);
  const used = shown.reduce((s, g) => s + g.weight, 0) + (unresolved?.weight ?? 0);
  const rest = sorted.filter((g) => !shown.includes(g) && g !== unresolved);
  const slices: AllocationSlice[] = shown.map((g) => ({
    key: g.key,
    label: g.label,
    weight: g.weight,
    changeToday: g.changeToday,
  }));
  const otherWeight = Math.max(0, 1 - used);
  if (rest.length && otherWeight > 0.0005) {
    const restWeight = rest.reduce((s, g) => s + g.weight, 0);
    const known = rest.filter((g) => g.changeToday !== null);
    const knownW = known.reduce((s, g) => s + g.weight, 0);
    slices.push({
      key: 'other',
      label: 'Other',
      weight: restWeight,
      changeToday:
        knownW > 0 ? known.reduce((s, g) => s + g.weight * g.changeToday!, 0) / knownW : null,
    });
  }
  if (unresolved) {
    slices.push({
      key: UNRESOLVED_KEY,
      label: UNRESOLVED_LABEL,
      weight: unresolved.weight,
      changeToday: null,
    });
  }
  return slices;
}

export function sectorSlices(a: Analysed, m: MarketData, n = MAX_SLICES): AllocationSlice[] {
  const changes = foldDayChanges(a.result, 'sector', m.prices);
  return topSlices(
    foldBy(a.result, 'sector').map((g) => ({
      key: g.key,
      label: g.key === UNRESOLVED_KEY ? g.label : sectorLabel(g.label),
      weight: g.weight,
      changeToday: changes.get(g.key) ?? null,
    })),
    n,
  );
}

export function holdingSlices(a: Analysed, m: MarketData, n = MAX_SLICES): AllocationSlice[] {
  const changes = foldDayChanges(a.result, 'company', m.prices);
  const groups = foldBy(a.result, 'company').map((g) => {
    const e = a.result.exposures.find((x) => x.key === g.key);
    return {
      key: g.key,
      label: e?.ticker ?? g.label,
      weight: g.weight,
      changeToday: changes.get(g.key) ?? null,
    };
  });
  // "Other" here is everything else (tails, cash, smaller companies), so weights still sum to 1.
  const top = groups.sort((x, y) => y.weight - x.weight).slice(0, n);
  const used = top.reduce((s, g) => s + g.weight, 0);
  const slices: AllocationSlice[] = top.map((g) => ({ ...g }));
  if (1 - used > 0.0005)
    slices.push({ key: 'other', label: 'Other', weight: 1 - used, changeToday: null });
  return slices;
}

export function overlapSlices(a: Analysed, n = 3): AllocationSlice[] {
  const pairs = pairwiseFundOverlap(a.result).slice(0, n);
  const slices: AllocationSlice[] = pairs.map((p) => ({
    key: `${p.a}-${p.b}`,
    label: `${p.a} ∩ ${p.b}`,
    weight: p.weight,
    changeToday: null,
  }));
  const used = slices.reduce((s, x) => s + x.weight, 0);
  if (slices.length)
    slices.push({ key: 'other', label: 'Other', weight: Math.max(0, 1 - used), changeToday: null });
  return slices;
}

export function allocation(a: Analysed, m: MarketData): AllocationData[] {
  return [
    { mode: 'sector', slices: sectorSlices(a, m) },
    { mode: 'holding', slices: holdingSlices(a, m) },
    { mode: 'overlap', slices: overlapSlices(a) },
  ];
}

export function summary(a: Analysed, m: MarketData): PortfolioSummary {
  const { portfolio: p, result, valuation } = a;
  const top = result.exposures.find(
    (e) => e.kind === 'company' || e.kind === 'fund' || e.kind === 'asset',
  );
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    totalValue: hasValue(a) ? result.totalValue : null,
    changeToday: valuation.dayChangePct,
    holdingsCount: p.holdings.length,
    topHolding: top?.ticker ? { ticker: top.ticker, weight: top.weight } : null,
    diversificationScore: scoreOf(a),
    mix: sectorSlices(a, m).map(({ key, label, weight }) => ({ key, label, weight })),
    asOf: result.asOf,
  };
}

/** Held funds as legend refs, by value desc. */
export function fundRefs(a: Analysed, m: MarketData): FundRef[] {
  return [...a.result.funds]
    .sort((x, y) => y.value - x.value)
    .map((f) => ({ ticker: f.ticker, name: nameOf(f.ticker, m) }));
}

/** Color order for sources: funds by value with DIRECT in palette slot 5 when present. */
export function sourceOrder(a: Analysed): string[] {
  const funds = [...a.result.funds].sort((x, y) => y.value - x.value).map((f) => f.ticker);
  const hasDirect = a.result.exposures.some((e) => e.directValue > 0 && e.kind !== 'cash');
  if (!hasDirect) return funds;
  const out = [...funds];
  out.splice(Math.min(4, out.length), 0, DIRECT_SOURCE);
  return out;
}

const MAX_ROWS = 250;

export function exposureRows(a: Analysed, m: MarketData, fold: FoldBy): ExposureRow[] {
  const { result } = a;
  const total = result.totalValue;
  const frac = (v: number) => (total > 0 ? v / total : 0);
  const sourceName = (via: string) => (via === 'direct' ? 'Held directly' : nameOf(via, m));
  const src = (via: string) => (via === 'direct' ? DIRECT_SOURCE : via);

  if (fold === 'company') {
    const rows: ExposureRow[] = result.exposures
      .filter((e) => foldKey(e, 'company') !== null)
      .slice(0, MAX_ROWS)
      .map((e) => ({
        key: e.key,
        ticker: e.ticker,
        name: e.name,
        sector: e.sector ? sectorLabel(e.sector) : null,
        industry: e.industry,
        weight: e.weight,
        value: e.value,
        concentration: concentration(e),
        sources: e.sources.map((s) => ({
          sourceTicker: src(s.via),
          sourceName: sourceName(s.via),
          weightInFund: s.weightInFund,
          contribution: frac(s.value),
        })),
      }));
    if (result.unresolved.value > 0) rows.push(unresolvedRow(a, m));
    return rows;
  }

  return foldBy(result, fold).map((g) => ({
    key: g.key,
    ticker: null,
    name: g.key === UNRESOLVED_KEY ? g.label : fold === 'sector' ? sectorLabel(g.label) : g.label,
    sector: fold === 'sector' && g.key !== UNRESOLVED_KEY ? sectorLabel(g.label) : null,
    industry: fold === 'industry' && g.key !== UNRESOLVED_KEY ? g.label : null,
    weight: g.weight,
    value: g.value,
    concentration: g.key === UNRESOLVED_KEY ? 'low' : groupConcentration(g.weight, fold),
    sources: g.sources.map((s) => ({
      sourceTicker: g.key === UNRESOLVED_KEY ? s.via : src(s.via),
      sourceName: g.key === UNRESOLVED_KEY ? nameOf(s.via, m) : sourceName(s.via),
      weightInFund: null,
      contribution: frac(s.value),
    })),
  }));
}

function unresolvedRow(a: Analysed, m: MarketData): ExposureRow {
  const { unresolved, totalValue } = a.result;
  return {
    key: UNRESOLVED_KEY,
    ticker: null,
    name: UNRESOLVED_LABEL,
    sector: null,
    industry: null,
    weight: unresolved.weight,
    value: unresolved.value,
    concentration: 'low',
    sources: unresolved.reasons.map((r) => ({
      sourceTicker: r.ticker,
      sourceName: nameOf(r.ticker, m),
      weightInFund: null,
      contribution: totalValue > 0 ? r.value / totalValue : 0,
    })),
  };
}
