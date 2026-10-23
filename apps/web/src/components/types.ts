/**
 * View-model types consumed by presentational components. They are the /api/v1 DTOs from
 * @easyfi/contracts: camelCase, weights/percent changes as fractions (0–1), money as numbers
 * (USD), dates as ISO strings, and `asOf` on every market-derived number.
 * A `null` money/price means "unknown" and must render as "—", never $0.
 */
export type {
  AllocationData,
  AllocationMode,
  AllocationSlice,
  Concentration,
  ExposureInsight,
  ExposureRow,
  ExposureSource,
  FoldBy,
  FundRef,
  MarketQuote,
  Mover,
  PortfolioSummary,
  PortfolioType,
  Severity,
  ValuePoint,
} from '@easyfi/contracts';

export type IsoDate = string;

export type LookThroughView = 'stack' | 'constellation';
