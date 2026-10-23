// Row → core / DTO mappers. No business rules here: only shape changes.
import type {
  FundConstituent,
  FundHoldingsMap,
  Holding,
  LatestPrices,
  Security,
  SecurityMap,
} from '@easyfi/core';
import type { FundSnapshot, LatestPrice, schema } from '@easyfi/db';

type HoldingRowDb = typeof schema.holdings.$inferSelect;
type SecurityRowDb = typeof schema.securities.$inferSelect;

const ASSET_BUCKETS = new Set(['stocks', 'bonds', 'cash', 'commodities', 'crypto', 'other']);

export function toCoreHolding(h: HoldingRowDb): Holding {
  // A statement-only line is stored with shares = 0; core expects null ("no share count").
  const statementOnly = h.statementValue !== null && h.shares === 0;
  return {
    id: h.id,
    portfolioId: h.portfolioId,
    ticker: h.ticker,
    accountType: h.accountType,
    shares: statementOnly ? null : h.shares,
    costBasis: h.costBasis,
    statementValue: h.statementValue,
    statementDate: h.statementDate,
    tags: h.tags,
  };
}

export function toCoreSecurity(s: SecurityRowDb): Security {
  return {
    ticker: s.ticker,
    name: s.name,
    type: s.type,
    sector: s.sector,
    industry: s.industry,
    expenseRatio: s.expenseRatio,
  };
}

export function toSecurityMap(rows: readonly SecurityRowDb[]): SecurityMap {
  return Object.fromEntries(rows.map((s) => [s.ticker, toCoreSecurity(s)]));
}

export function toLatestPrices(rows: readonly LatestPrice[]): LatestPrices {
  const out: LatestPrices = {};
  for (const p of rows) {
    out[p.ticker] = {
      close: p.close,
      date: p.date,
      ...(p.prevClose !== null ? { prevClose: p.prevClose } : {}),
    };
  }
  return out;
}

export function toFundHoldingsMap(snaps: Record<string, FundSnapshot>): FundHoldingsMap {
  const out: FundHoldingsMap = {};
  for (const [fund, snap] of Object.entries(snaps)) {
    out[fund] = {
      asOf: snap.asOf,
      constituents: snap.constituents.map((c): FundConstituent => ({
        fundTicker: c.fundTicker,
        constituentTicker: c.constituentTicker,
        name: c.name,
        weight: c.weight,
        assetBucket: (c.assetBucket && ASSET_BUCKETS.has(c.assetBucket)
          ? c.assetBucket
          : 'stocks') as FundConstituent['assetBucket'],
        sector: c.sector,
        industry: c.industry,
      })),
      ...(snap.sectorWeights.length
        ? { sectorWeights: Object.fromEntries(snap.sectorWeights.map((w) => [w.sector, w.weight])) }
        : {}),
    };
  }
  return out;
}

/** GICS names are long; the UI uses these shorter labels. */
const SECTOR_LABELS: Record<string, string> = {
  'Information Technology': 'Technology',
  'Communication Services': 'Communication',
  'Consumer Discretionary': 'Consumer',
  'Consumer Staples': 'Staples',
  'Health Care': 'Health Care',
};

export function sectorLabel(sector: string): string {
  return SECTOR_LABELS[sector] ?? sector;
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export const DIRECT_SOURCE = 'DIRECT';
