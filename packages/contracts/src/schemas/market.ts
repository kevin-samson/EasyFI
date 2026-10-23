import { z } from '../z';
import {
  AccountType,
  AllocationSlice,
  AsOf,
  Fraction,
  IsoDate,
  IsoMonth,
  Money,
  SecurityType,
} from './common';

// ---------- securities ----------

export const SecuritySummary = z
  .object({
    ticker: z.string(),
    name: z.string(),
    type: SecurityType,
    sector: z.string().nullable(),
    expenseRatio: Fraction.nullable(),
    /** True when we have a holdings book to look through. */
    hasLookThrough: z.boolean(),
  })
  .openapi('SecuritySummary');
export type SecuritySummary = z.infer<typeof SecuritySummary>;

export const SecuritySearchResult = z
  .object({ results: z.array(SecuritySummary) })
  .openapi('SecuritySearchResult');
export type SecuritySearchResult = z.infer<typeof SecuritySearchResult>;

export const SecurityDetail = SecuritySummary.extend({
  industry: z.string().nullable(),
  price: Money.nullable(),
  dayChange: Fraction.nullable(),
  priceAsOf: AsOf,
  holdingsCount: z.number().int().nullable(),
  holdingsAsOf: AsOf,
  topHoldings: z.array(
    z.object({ ticker: z.string().nullable(), name: z.string(), weight: Fraction }),
  ),
  sectors: z.array(AllocationSlice),
}).openapi('SecurityDetail');
export type SecurityDetail = z.infer<typeof SecurityDetail>;

// ---------- compare ----------

export const CompareFund = z
  .object({
    /** Fund ticker, or portfolio id for a portfolio. */
    ticker: z.string(),
    name: z.string(),
    kind: z.enum(['fund', 'portfolio']),
    asOf: AsOf,
    holdingsCount: z.number().int(),
    sectors: z.array(AllocationSlice),
    topHoldings: z.array(z.object({ ticker: z.string(), name: z.string(), weight: Fraction })),
  })
  .openapi('CompareFund');
export type CompareFund = z.infer<typeof CompareFund>;

export const SharedHolding = z
  .object({
    ticker: z.string(),
    name: z.string(),
    sector: z.string().nullable(),
    weightA: Fraction.nullable(),
    weightB: Fraction.nullable(),
  })
  .openapi('SharedHolding');
export type SharedHolding = z.infer<typeof SharedHolding>;

export const Comparison = z
  .object({
    a: CompareFund,
    b: CompareFund,
    shared: z.array(SharedHolding),
    sharedCount: z.number().int(),
    /** Σ min(wA, wB). */
    overlapByWeight: Fraction,
    /** Pickable funds and portfolios for the selectors. */
    options: z.array(
      z.object({ value: z.string(), label: z.string(), kind: z.enum(['fund', 'portfolio']) }),
    ),
  })
  .openapi('Comparison');
export type Comparison = z.infer<typeof Comparison>;

// ---------- dividends ----------

export const PayoutFrequency = z.enum([
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
  'irregular',
]);
export type PayoutFrequency = z.infer<typeof PayoutFrequency>;

export const DividendPayment = z
  .object({
    id: z.string(),
    ticker: z.string(),
    name: z.string(),
    payDate: IsoDate,
    perShare: Money.nullable(),
    amount: Money.nullable(),
    account: AccountType,
    status: z.enum(['received', 'announced', 'projected']),
  })
  .openapi('DividendPayment');
export type DividendPayment = z.infer<typeof DividendPayment>;

export const IncomeMonth = z
  .object({
    month: IsoMonth,
    received: Money.nullable(),
    projected: Money.nullable(),
    payments: z.array(DividendPayment),
  })
  .openapi('IncomeMonth');
export type IncomeMonth = z.infer<typeof IncomeMonth>;

export const DividendKpis = z
  .object({
    trailing12m: Money.nullable(),
    trailing12mChange: Fraction.nullable(),
    portfolioYield: Fraction.nullable(),
    yieldOnCost: Fraction.nullable(),
    next30Days: Money.nullable(),
    projected12m: Money.nullable(),
    asOf: AsOf,
  })
  .openapi('DividendKpis');
export type DividendKpis = z.infer<typeof DividendKpis>;

export const YieldLeader = z
  .object({
    ticker: z.string(),
    name: z.string(),
    yield: Fraction.nullable(),
    frequency: PayoutFrequency,
  })
  .openapi('YieldLeader');
export type YieldLeader = z.infer<typeof YieldLeader>;

export const HoldingIncomeRow = z
  .object({
    ticker: z.string(),
    name: z.string(),
    annualIncome: Money.nullable(),
    yield: Fraction.nullable(),
    yieldOnCost: Fraction.nullable(),
    shareOfIncome: Fraction.nullable(),
    frequency: PayoutFrequency,
  })
  .openapi('HoldingIncomeRow');
export type HoldingIncomeRow = z.infer<typeof HoldingIncomeRow>;

export const Dividends = z
  .object({
    portfolio: z.string(),
    kpis: DividendKpis,
    calendar: z.array(IncomeMonth),
    yieldLeaders: z.array(YieldLeader),
    holdings: z.array(HoldingIncomeRow),
    warnings: z.array(z.string()),
    portfolios: z.array(z.object({ id: z.string(), name: z.string() })),
  })
  .openapi('Dividends');
export type Dividends = z.infer<typeof Dividends>;

// ---------- inflation ----------

export const CpiHistoryPoint = z
  .object({ period: IsoMonth, yoy: Fraction })
  .openapi('CpiHistoryPoint');

export const CpiSnapshot = z
  .object({
    period: IsoMonth.nullable(),
    yoy: Fraction.nullable(),
    mom: Fraction.nullable(),
    coreYoy: Fraction.nullable(),
    asOf: AsOf,
    history: z.array(CpiHistoryPoint),
  })
  .openapi('CpiSnapshot');
export type CpiSnapshot = z.infer<typeof CpiSnapshot>;

export const CpiCategory = z
  .object({ key: z.string(), label: z.string(), yoy: Fraction.nullable(), weight: Fraction })
  .openapi('CpiCategory');
export type CpiCategory = z.infer<typeof CpiCategory>;

export const Inflation = z
  .object({
    cpi: CpiSnapshot,
    categories: z.array(CpiCategory),
    /** User's total tracked value, to pre-fill the calculator. */
    trackedValue: Money.nullable(),
  })
  .openapi('Inflation');
export type Inflation = z.infer<typeof Inflation>;

export const PurchasingPowerBody = z
  .strictObject({
    amount: Money.nonnegative(),
    monthlyContribution: Money.nonnegative().default(0),
    inflationRate: Fraction.min(-0.5).max(1),
    growthRate: Fraction.min(-0.9).max(1),
    years: z.number().int().min(1).max(80),
  })
  .openapi('PurchasingPowerBody');
export type PurchasingPowerBody = z.input<typeof PurchasingPowerBody>;

export const PurchasingPowerResult = z
  .object({
    points: z.array(
      z.object({ year: z.number().int(), nominal: Money, real: Money, contributed: Money }),
    ),
    final: z.object({ nominal: Money, real: Money, contributed: Money }),
    /** What today's `amount` buys after `years` of inflation, in today's dollars. */
    amountReal: Money,
  })
  .openapi('PurchasingPowerResult');
export type PurchasingPowerResult = z.infer<typeof PurchasingPowerResult>;
