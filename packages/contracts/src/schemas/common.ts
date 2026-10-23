// Conventions for every DTO:
//  - camelCase fields; money is a number in USD; weights / percent changes are fractions (0–1).
//  - Dates are ISO 'YYYY-MM-DD' strings; months are 'YYYY-MM'.
//  - `null` money/price means "unknown" and must render as "—", never $0.
//  - Every market-derived number carries an `asOf` date.
import { z } from '../z';

export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .openapi({ example: '2026-09-30' });
export const IsoMonth = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .openapi({ example: '2026-09' });
export const AsOf = IsoDate.nullable();

export const Uuid = z.string().uuid();
export const Ticker = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .transform((s) => s.toUpperCase())
  .openapi({ example: 'VOO' });

export const Money = z.number().finite();
export const Fraction = z.number().finite();

export const ErrorCode = z.enum([
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'unavailable',
  'internal',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorEnvelope = z
  .object({
    error: z.object({
      code: ErrorCode,
      message: z.string(),
      /** zod issues for `bad_request`. */
      details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    }),
  })
  .openapi('Error');
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

export const Ok = z.object({ ok: z.literal(true) }).openapi('Ok');

export const PortfolioType = z.enum(['actual', 'hypothetical', 'watchlist']);
export type PortfolioType = z.infer<typeof PortfolioType>;

export const AccountType = z.enum([
  'taxable',
  'trad_ira',
  'roth_ira',
  '401k',
  'roth_401k',
  'other',
]);
export type AccountType = z.infer<typeof AccountType>;

export const SecurityType = z.enum([
  'stock',
  'etf',
  'mutual_fund',
  'mmf',
  'crypto',
  'bond',
  'other',
]);
export type SecurityType = z.infer<typeof SecurityType>;

export const Severity = z.enum(['high', 'medium', 'low']);
export type Severity = z.infer<typeof Severity>;

export const Concentration = z.enum(['high', 'medium', 'low']);
export type Concentration = z.infer<typeof Concentration>;

export const ValuePoint = z.object({ date: IsoDate, value: Money }).openapi('ValuePoint');
export type ValuePoint = z.infer<typeof ValuePoint>;

export const AllocationSlice = z
  .object({
    key: z.string(),
    label: z.string(),
    weight: Fraction,
    /** Today's change of the slice, fraction; null = unknown. */
    changeToday: Fraction.nullable().optional(),
  })
  .openapi('AllocationSlice');
export type AllocationSlice = z.infer<typeof AllocationSlice>;

export const AllocationMode = z.enum(['sector', 'holding', 'overlap']);
export type AllocationMode = z.infer<typeof AllocationMode>;

export const AllocationData = z
  .object({ mode: AllocationMode, slices: z.array(AllocationSlice) })
  .openapi('AllocationData');
export type AllocationData = z.infer<typeof AllocationData>;

export const RangeKey = z.enum(['1D', '7D', '1M', '3M', 'YTD', '1Y', 'MAX']);
export type RangeKey = z.infer<typeof RangeKey>;

export const RangeSeries = z
  .object({
    points: z.array(ValuePoint),
    /** Change over the range, fraction; null when the start value is unknown. */
    change: Fraction.nullable(),
    changeLabel: z.string(),
  })
  .openapi('RangeSeries');
export type RangeSeries = z.infer<typeof RangeSeries>;

export const ValueSeriesSet = z
  .object({
    ranges: z.partialRecord(RangeKey, RangeSeries),
    /** Tickers excluded because they have no price. */
    unpriced: z.array(z.string()),
    asOf: AsOf,
  })
  .openapi('ValueSeriesSet');
export type ValueSeriesSet = z.infer<typeof ValueSeriesSet>;
