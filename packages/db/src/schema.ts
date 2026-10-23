import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/*
 * Conventions
 * - user_id is the Supabase auth user id (uuid). No FK to auth.users so the schema also runs on PGlite.
 * - Every user-owned table carries user_id (denormalised on child rows too) so every query can filter on it.
 * - Money / quantities are double precision (returned as JS numbers by both drivers).
 * - Calendar dates are `date` in string mode ('YYYY-MM-DD'); instants are timestamptz as Date.
 * - RLS is enabled with no policies on every table by a hand-written migration (spec §5 security).
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();
const day = (name: string) => date(name, { mode: 'string' });

export type PortfolioType = 'actual' | 'hypothetical' | 'watchlist';
export type AccountType = 'taxable' | 'trad_ira' | 'roth_ira' | '401k' | 'roth_401k' | 'other';
export type SecurityType = 'stock' | 'etf' | 'mutual_fund' | 'mmf' | 'crypto' | 'bond' | 'other';
export type MessageRole = 'user' | 'assistant' | 'system';
export type JobStatus = 'running' | 'ok' | 'partial' | 'failed';

// ---------------------------------------------------------------- user-owned

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // = auth user id
  displayName: text('display_name'),
  email: text('email'),
  baseCurrency: text('base_currency').notNull().default('USD'),
  theme: text('theme').notNull().default('dark'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const portfolios = pgTable(
  'portfolios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    type: text('type').$type<PortfolioType>().notNull().default('actual'),
    createdAt: createdAt(),
  },
  (t) => [index('portfolios_user_id_idx').on(t.userId)],
);

export const holdings = pgTable(
  'holdings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    portfolioId: uuid('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'cascade' }),
    ticker: text('ticker').notNull(),
    accountType: text('account_type').$type<AccountType>().notNull().default('taxable'),
    shares: doublePrecision('shares').notNull(),
    costBasis: doublePrecision('cost_basis'),
    statementValue: doublePrecision('statement_value'),
    statementDate: day('statement_date'),
    statementKind: text('statement_kind'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [
    index('holdings_user_id_idx').on(t.userId),
    index('holdings_portfolio_id_idx').on(t.portfolioId),
    index('holdings_ticker_idx').on(t.ticker),
  ],
);

export const cashBalances = pgTable(
  'cash_balances',
  {
    portfolioId: uuid('portfolio_id')
      .primaryKey()
      .references(() => portfolios.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    amount: doublePrecision('amount').notNull().default(0),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('cash_balances_user_id_idx').on(t.userId)],
);

export const explorerThreads = pgTable(
  'explorer_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    title: text('title').notNull().default('New chat'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('explorer_threads_user_id_idx').on(t.userId)],
);

export const explorerMessages = pgTable(
  'explorer_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => explorerThreads.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    role: text('role').$type<MessageRole>().notNull(),
    content: text('content').notNull(),
    blocks: jsonb('blocks').$type<unknown>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('explorer_messages_thread_id_idx').on(t.threadId, t.createdAt),
    index('explorer_messages_user_id_idx').on(t.userId),
  ],
);

export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    kind: text('kind').notNull(),
    threshold: jsonb('threshold').$type<unknown>(),
    enabled: boolean('enabled').notNull().default(true),
    lastFiredAt: ts('last_fired_at'),
    createdAt: createdAt(),
  },
  (t) => [index('alerts_user_id_idx').on(t.userId)],
);

export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    label: text('label').notNull().default('Financial independence'),
    targetAmount: doublePrecision('target_amount'),
    annualExpenses: doublePrecision('annual_expenses'),
    withdrawalRate: doublePrecision('withdrawal_rate'),
    monthlyContribution: doublePrecision('monthly_contribution'),
    expectedGrowth: doublePrecision('expected_growth'),
    inflationRate: doublePrecision('inflation_rate'),
    targetDate: day('target_date'),
    createdAt: createdAt(),
  },
  (t) => [index('goals_user_id_idx').on(t.userId)],
);

export const shareLinks = pgTable(
  'share_links',
  {
    token: text('token').primaryKey(),
    userId: uuid('user_id').notNull(),
    portfolioId: uuid('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    index('share_links_user_id_idx').on(t.userId),
    index('share_links_portfolio_id_idx').on(t.portfolioId),
  ],
);

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    message: text('message').notNull(),
    screenshotPath: text('screenshot_path'),
    createdAt: createdAt(),
  },
  (t) => [index('feedback_user_id_idx').on(t.userId)],
);

export const llmUsage = pgTable(
  'llm_usage',
  {
    userId: uuid('user_id').notNull(),
    day: day('day').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

// ---------------------------------------------------------------- shared market data

export const securities = pgTable('securities', {
  ticker: text('ticker').primaryKey(),
  name: text('name').notNull(),
  type: text('type').$type<SecurityType>().notNull().default('other'),
  sector: text('sector'),
  industry: text('industry'),
  cik: text('cik'),
  seriesId: text('series_id'),
  expenseRatio: doublePrecision('expense_ratio'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const pricesEod = pgTable(
  'prices_eod',
  {
    ticker: text('ticker').notNull(),
    date: day('date').notNull(),
    close: doublePrecision('close').notNull(),
    adjClose: doublePrecision('adj_close'),
  },
  (t) => [primaryKey({ columns: [t.ticker, t.date] }), index('prices_eod_date_idx').on(t.date)],
);

export const fundHoldings = pgTable(
  'fund_holdings',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    fundTicker: text('fund_ticker').notNull(),
    asOf: day('as_of').notNull(),
    constituentTicker: text('constituent_ticker'),
    name: text('name').notNull(),
    weight: doublePrecision('weight').notNull(),
    assetBucket: text('asset_bucket'),
    sector: text('sector'),
    industry: text('industry'),
  },
  (t) => [index('fund_holdings_fund_as_of_idx').on(t.fundTicker, t.asOf)],
);

export const fundSectorWeights = pgTable(
  'fund_sector_weights',
  {
    fundTicker: text('fund_ticker').notNull(),
    asOf: day('as_of').notNull(),
    sector: text('sector').notNull(),
    weight: doublePrecision('weight').notNull(),
  },
  (t) => [primaryKey({ columns: [t.fundTicker, t.asOf, t.sector] })],
);

export const dividends = pgTable(
  'dividends',
  {
    ticker: text('ticker').notNull(),
    exDate: day('ex_date').notNull(),
    payDate: day('pay_date'),
    amount: doublePrecision('amount').notNull(),
  },
  (t) => [primaryKey({ columns: [t.ticker, t.exDate] })],
);

export const cpiSeries = pgTable(
  'cpi_series',
  {
    seriesId: text('series_id').notNull(),
    period: text('period').notNull(), // 'YYYY-MM'
    value: doublePrecision('value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.seriesId, t.period] })],
);

export const invites = pgTable('invites', {
  code: text('code').primaryKey(),
  maxUses: integer('max_uses').notNull().default(1),
  used: integer('used').notNull().default(0),
  createdAt: createdAt(),
});

/** Local demo mode only (no Supabase): email + scrypt password hash. */
export const localCredentials = pgTable('local_credentials', {
  email: text('email').primaryKey(),
  userId: uuid('user_id').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: createdAt(),
});

export const jobRuns = pgTable(
  'job_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().default('nightly'),
    startedAt: ts('started_at').notNull().defaultNow(),
    finishedAt: ts('finished_at'),
    status: text('status').$type<JobStatus>().notNull().default('running'),
    counts: jsonb('counts').$type<Record<string, number>>(),
    errors: jsonb('errors').$type<unknown[]>(),
  },
  (t) => [index('job_runs_started_at_idx').on(t.startedAt)],
);

// ---------------------------------------------------------------- row types

export type Profile = typeof profiles.$inferSelect;
export type Portfolio = typeof portfolios.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
export type CashBalance = typeof cashBalances.$inferSelect;
export type ExplorerThread = typeof explorerThreads.$inferSelect;
export type ExplorerMessage = typeof explorerMessages.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type ShareLink = typeof shareLinks.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type LlmUsage = typeof llmUsage.$inferSelect;
export type Security = typeof securities.$inferSelect;
export type PriceEod = typeof pricesEod.$inferSelect;
export type FundHolding = typeof fundHoldings.$inferSelect;
export type FundSectorWeight = typeof fundSectorWeights.$inferSelect;
export type Dividend = typeof dividends.$inferSelect;
export type CpiPoint = typeof cpiSeries.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type JobRun = typeof jobRuns.$inferSelect;
export type LocalCredential = typeof localCredentials.$inferSelect;
