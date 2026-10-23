import type { AssetBucket } from '../types';
import type { Exposure, LookThroughResult } from './types';

export type FoldDimension = 'company' | 'sector' | 'industry' | 'asset';

export interface FoldSource {
  via: string;
  value: number;
}

export interface FoldGroup {
  key: string;
  label: string;
  value: number;
  /** Fraction of LookThroughResult.totalValue. */
  weight: number;
  /** Per-fund (or 'direct') contribution, sorted by value desc. */
  sources: FoldSource[];
  /** Number of exposures folded into the group. */
  count: number;
}

export const UNRESOLVED_KEY = 'Unresolved';
export const UNRESOLVED_LABEL = 'No look-through data';
export const OTHER_KEY = 'Other';
export const CASH_KEY = 'Cash';

export const ASSET_LABELS: Record<AssetBucket, string> = {
  stocks: 'Stocks',
  bonds: 'Bonds',
  cash: 'Cash',
  commodities: 'Commodities',
  crypto: 'Crypto',
  other: 'Other',
};

/** Kinds shown in company lists (tails, unmapped lines and cash are excluded). */
const COMPANY_KINDS = new Set<Exposure['kind']>(['company', 'fund', 'asset']);

export function foldKey(e: Exposure, by: FoldDimension): { key: string; label: string } | null {
  if (by === 'company') {
    return COMPANY_KINDS.has(e.kind) ? { key: e.key, label: e.name } : null;
  }
  if (by === 'asset') return { key: e.assetBucket, label: ASSET_LABELS[e.assetBucket] };
  const raw = by === 'sector' ? e.sector : e.industry;
  const key = raw ?? (e.kind === 'cash' ? CASH_KEY : OTHER_KEY);
  return { key, label: key };
}

interface Acc {
  key: string;
  label: string;
  value: number;
  count: number;
  sources: Map<string, number>;
}

/**
 * Fold look-through exposures by company, sector, industry or asset bucket. Non-company folds
 * also include the unresolved slice as its own group so their weights sum to 1.
 */
export function foldBy(result: LookThroughResult, by: FoldDimension): FoldGroup[] {
  const groups = new Map<string, Acc>();
  const bump = (key: string, label: string, value: number, sources: FoldSource[]) => {
    let g = groups.get(key);
    if (!g) {
      g = { key, label, value: 0, count: 0, sources: new Map() };
      groups.set(key, g);
    }
    g.value += value;
    g.count += 1;
    for (const s of sources) g.sources.set(s.via, (g.sources.get(s.via) ?? 0) + s.value);
  };

  for (const e of result.exposures) {
    const k = foldKey(e, by);
    if (k) bump(k.key, k.label, e.value, e.sources);
  }
  if (by !== 'company' && result.unresolved.value > 0) {
    const sources = result.unresolved.reasons.map((r) => ({ via: r.ticker, value: r.value }));
    bump(UNRESOLVED_KEY, UNRESOLVED_LABEL, result.unresolved.value, sources);
    groups.get(UNRESOLVED_KEY)!.count = result.unresolved.reasons.length;
  }

  const total = result.totalValue;
  return [...groups.values()]
    .map((g) => ({
      key: g.key,
      label: g.label,
      value: g.value,
      weight: total > 0 ? g.value / total : 0,
      count: g.count,
      sources: [...g.sources.entries()]
        .map(([via, value]) => ({ via, value }))
        .sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
}
