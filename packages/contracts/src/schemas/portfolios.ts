import { z } from '../z';
import {
  AccountType,
  AllocationData,
  AllocationSlice,
  AsOf,
  Concentration,
  Fraction,
  IsoDate,
  Money,
  PortfolioType,
  Severity,
  Ticker,
} from './common';

// ---------- portfolios ----------

export const PortfolioSummary = z
  .object({
    id: z.string(),
    name: z.string(),
    type: PortfolioType,
    /** null when nothing in the portfolio could be valued. */
    totalValue: Money.nullable(),
    /** Today's change, fraction. */
    changeToday: Fraction.nullable(),
    holdingsCount: z.number().int(),
    topHolding: z.object({ ticker: z.string(), weight: Fraction }).nullable(),
    /** 0–100; null when nothing is resolved. */
    diversificationScore: z.number().nullable(),
    /** Sector mix for the colored strip. */
    mix: z.array(AllocationSlice),
    asOf: AsOf,
  })
  .openapi('PortfolioSummary');
export type PortfolioSummary = z.infer<typeof PortfolioSummary>;

export const PortfolioList = z
  .object({ portfolios: z.array(PortfolioSummary), totalValue: Money, asOf: AsOf })
  .openapi('PortfolioList');
export type PortfolioList = z.infer<typeof PortfolioList>;

export const FundRef = z.object({ ticker: z.string(), name: z.string() }).openapi('FundRef');
export type FundRef = z.infer<typeof FundRef>;

export const FeeDrag = z
  .object({
    blendedExpenseRatio: Fraction.nullable(),
    annualCost: Money,
    unknown: z.array(z.string()),
    contributions: z.array(
      z.object({
        ticker: z.string(),
        value: Money,
        expenseRatio: Fraction,
        annualCost: Money,
        shareOfCost: Fraction,
      }),
    ),
    /** Fees paid on fund value that duplicates another held fund. */
    overlapWaste: z.object({ annualCost: Money, overlappingValue: Money }),
  })
  .openapi('FeeDrag');
export type FeeDrag = z.infer<typeof FeeDrag>;

export const PortfolioDetail = z
  .object({
    id: z.string(),
    name: z.string(),
    type: PortfolioType,
    currency: z.literal('USD'),
    holdingsCount: z.number().int(),
    totalValue: Money.nullable(),
    changeToday: Fraction.nullable(),
    diversificationScore: z.number().nullable(),
    cash: Money,
    allocation: z.array(AllocationData),
    funds: z.array(FundRef),
    unpriced: z.array(z.string()),
    feeDrag: FeeDrag,
    asOf: AsOf,
    holdingsAsOf: AsOf,
  })
  .openapi('PortfolioDetail');
export type PortfolioDetail = z.infer<typeof PortfolioDetail>;

export const CreatePortfolioBody = z
  .strictObject({
    name: z.string().trim().min(1).max(80),
    type: PortfolioType.default('actual'),
    cash: Money.nonnegative().optional(),
  })
  .openapi('CreatePortfolioBody');
export type CreatePortfolioBody = z.input<typeof CreatePortfolioBody>;

export const UpdatePortfolioBody = z
  .strictObject({
    name: z.string().trim().min(1).max(80).optional(),
    type: PortfolioType.optional(),
    cash: Money.nonnegative().optional(),
  })
  .openapi('UpdatePortfolioBody');
export type UpdatePortfolioBody = z.input<typeof UpdatePortfolioBody>;

// ---------- holdings ----------

export const HoldingType = z.enum([
  'etf',
  'mutual_fund',
  'stock',
  'cash',
  'bond',
  'crypto',
  'other',
]);
export type HoldingType = z.infer<typeof HoldingType>;

export const HoldingRow = z
  .object({
    id: z.string(),
    ticker: z.string(),
    name: z.string(),
    type: HoldingType,
    accountType: AccountType,
    shares: z.number().nullable(),
    /** Last close; null = unpriced. */
    price: Money.nullable(),
    /** Market (or statement) value; null when unknown. */
    value: Money.nullable(),
    costBasis: Money.nullable(),
    dayChange: Fraction.nullable(),
    totalReturn: Fraction.nullable(),
    yield: Fraction.nullable(),
    annualIncome: Money.nullable(),
    tags: z.array(z.string()),
    /** Share of the holding whose constituents are known, fraction. */
    lookThroughCoverage: Fraction.nullable(),
    asOf: AsOf,
  })
  .openapi('HoldingRow');
export type HoldingRow = z.infer<typeof HoldingRow>;

export const HoldingList = z
  .object({
    portfolioId: z.string(),
    portfolioName: z.string(),
    holdings: z.array(HoldingRow),
    asOf: AsOf,
  })
  .openapi('HoldingList');
export type HoldingList = z.infer<typeof HoldingList>;

const Tags = z.array(z.string().trim().min(1).max(32)).max(20);

export const CreateHoldingBody = z
  .strictObject({
    ticker: Ticker,
    accountType: AccountType.default('taxable'),
    /** Either shares, or a dollar amount converted at the latest close. */
    shares: z.number().positive().optional(),
    dollars: Money.positive().optional(),
    /** Total cost basis for the line. */
    costBasis: Money.nonnegative().nullable().optional(),
    /** For assets without a market price. */
    statementValue: Money.nonnegative().nullable().optional(),
    statementDate: IsoDate.nullable().optional(),
    tags: Tags.default([]),
  })
  .refine((b) => b.shares != null || b.dollars != null || b.statementValue != null, {
    message: 'Provide shares, dollars or statementValue',
  })
  .openapi('CreateHoldingBody');
export type CreateHoldingBody = z.input<typeof CreateHoldingBody>;

export const UpdateHoldingBody = z
  .strictObject({
    ticker: Ticker.optional(),
    accountType: AccountType.optional(),
    shares: z.number().positive().nullable().optional(),
    costBasis: Money.nonnegative().nullable().optional(),
    statementValue: Money.nonnegative().nullable().optional(),
    statementDate: IsoDate.nullable().optional(),
    tags: Tags.optional(),
  })
  .openapi('UpdateHoldingBody');
export type UpdateHoldingBody = z.input<typeof UpdateHoldingBody>;

export const BulkHoldingsBody = z
  .strictObject({
    ids: z.array(z.string()).min(1).max(500),
    action: z.enum(['delete', 'tag', 'untag']),
    tag: z.string().trim().min(1).max(32).optional(),
  })
  .openapi('BulkHoldingsBody');
export type BulkHoldingsBody = z.input<typeof BulkHoldingsBody>;

export const CsvBroker = z.enum(['auto', 'fidelity', 'schwab', 'vanguard', 'generic']);
export type CsvBroker = z.infer<typeof CsvBroker>;

export const CsvImportBody = z
  .strictObject({
    broker: CsvBroker.default('auto'),
    csv: z.string().min(1).max(2_000_000),
    /** true = replace the portfolio's holdings, false = append. */
    replace: z.boolean().default(false),
    /** true = parse only, do not save. */
    dryRun: z.boolean().default(false),
  })
  .openapi('CsvImportBody');
export type CsvImportBody = z.input<typeof CsvImportBody>;

export const CsvImportResult = z
  .object({
    format: z.enum(['fidelity', 'schwab', 'vanguard', 'generic']),
    imported: z.number().int(),
    holdings: z.array(
      z.object({
        ticker: z.string(),
        accountName: z.string().nullable(),
        accountType: AccountType,
        shares: z.number().nullable(),
        costBasis: Money.nullable(),
        statementValue: Money.nullable(),
      }),
    ),
    warnings: z.array(z.object({ line: z.number().int(), message: z.string() })),
  })
  .openapi('CsvImportResult');
export type CsvImportResult = z.infer<typeof CsvImportResult>;

// ---------- look-through ----------

export const FoldBy = z.enum(['company', 'sector', 'industry', 'asset']);
export type FoldBy = z.infer<typeof FoldBy>;

export const ExposureSource = z
  .object({
    /** Fund ticker, or "DIRECT". */
    sourceTicker: z.string(),
    sourceName: z.string(),
    weightInFund: Fraction.nullable(),
    /** Contribution to the whole portfolio, fraction. */
    contribution: Fraction,
  })
  .openapi('ExposureSource');
export type ExposureSource = z.infer<typeof ExposureSource>;

export const ExposureRow = z
  .object({
    key: z.string(),
    ticker: z.string().nullable(),
    name: z.string(),
    sector: z.string().nullable(),
    industry: z.string().nullable(),
    weight: Fraction,
    value: Money.nullable(),
    concentration: Concentration,
    sources: z.array(ExposureSource),
  })
  .openapi('ExposureRow');
export type ExposureRow = z.infer<typeof ExposureRow>;

export const LookThrough = z
  .object({
    portfolioId: z.string(),
    fold: FoldBy,
    totalValue: Money,
    rows: z.array(ExposureRow),
    funds: z.array(FundRef),
    /** Source color order: funds by value, then DIRECT. */
    sourceOrder: z.array(z.string()),
    unresolved: z.object({
      value: Money,
      weight: Fraction,
      reasons: z.array(z.object({ ticker: z.string(), reason: z.string(), value: Money })),
    }),
    unpriced: z.array(z.string()),
    asOf: AsOf,
    holdingsAsOf: AsOf,
  })
  .openapi('LookThrough');
export type LookThrough = z.infer<typeof LookThrough>;

export const ConstellationHolding = z
  .object({
    key: z.string(),
    ticker: z.string(),
    name: z.string(),
    sector: z.string().nullable(),
    concentration: Concentration,
    weight: Fraction,
    value: Money.nullable(),
    funds: z.array(z.string()),
    direct: z.boolean(),
    labeled: z.boolean(),
  })
  .openapi('ConstellationHolding');
export type ConstellationHolding = z.infer<typeof ConstellationHolding>;

export const Constellation = z
  .object({
    portfolioId: z.string(),
    funds: z.array(FundRef),
    sourceOrder: z.array(z.string()),
    holdings: z.array(ConstellationHolding),
    asOf: AsOf,
  })
  .openapi('Constellation');
export type Constellation = z.infer<typeof Constellation>;

// ---------- home ----------

export const ExposureInsight = z
  .object({
    id: z.string(),
    severity: Severity,
    text: z.string(),
    askQuery: z.string(),
  })
  .openapi('ExposureInsight');
export type ExposureInsight = z.infer<typeof ExposureInsight>;

export const MarketQuote = z
  .object({ ticker: z.string(), name: z.string(), change: Fraction.nullable(), asOf: AsOf })
  .openapi('MarketQuote');
export type MarketQuote = z.infer<typeof MarketQuote>;

export const Mover = z
  .object({
    ticker: z.string(),
    name: z.string(),
    change: Fraction.nullable(),
    /** Effective exposure across all portfolios. */
    weight: Fraction,
    asOf: AsOf,
  })
  .openapi('Mover');
export type Mover = z.infer<typeof Mover>;

export const Home = z
  .object({
    totalValue: Money.nullable(),
    changeToday: Fraction.nullable(),
    portfolioCount: z.number().int(),
    diversificationScore: z.number().nullable(),
    allocation: z.array(AllocationData),
    portfolios: z.array(PortfolioSummary),
    insights: z.array(ExposureInsight),
    movers: z.array(Mover),
    marketContext: z.array(MarketQuote),
    askSuggestions: z.array(z.string()),
    asOf: AsOf,
  })
  .openapi('Home');
export type Home = z.infer<typeof Home>;

// ---------- what-if ----------

export const WhatIfBody = z
  .strictObject({
    /** Portfolio id, or "all". */
    portfolio: z.string().default('all'),
    ticker: Ticker,
    amount: Money.positive(),
  })
  .openapi('WhatIfBody');
export type WhatIfBody = z.input<typeof WhatIfBody>;

export const WhatIfResult = z
  .object({
    ticker: z.string(),
    name: z.string(),
    amount: Money,
    before: z.object({ totalValue: Money, score: z.number() }),
    after: z.object({ totalValue: Money, score: z.number() }),
    sectorShifts: z.array(
      z.object({ sector: z.string(), before: Fraction, after: Fraction, shift: Fraction }),
    ),
    overlaps: z.array(
      z.object({ fund: z.string(), overlapByWeight: Fraction, sharedCount: z.number().int() }),
    ),
    topChanges: z.array(
      z.object({
        ticker: z.string(),
        name: z.string(),
        beforeWeight: Fraction,
        afterWeight: Fraction,
        shift: Fraction,
      }),
    ),
    addedResolved: z.boolean(),
    asOf: AsOf,
  })
  .openapi('WhatIfResult');
export type WhatIfResult = z.infer<typeof WhatIfResult>;
