import { z } from '../z';
import { AsOf, Fraction, IsoDate, Money } from './common';

// ---------- me ----------

export const Theme = z.enum(['dark', 'light', 'system']);

export const Me = z
  .object({
    id: z.string(),
    email: z.string().nullable(),
    displayName: z.string(),
    baseCurrency: z.literal('USD'),
    theme: Theme,
    isAdmin: z.boolean(),
    /** "demo" when running without Supabase (single local user). */
    authMode: z.enum(['supabase', 'demo']),
    explorer: z.object({ usedToday: z.number().int(), dailyLimit: z.number().int() }),
  })
  .openapi('Me');
export type Me = z.infer<typeof Me>;

export const UpdateMeBody = z
  .strictObject({
    displayName: z.string().trim().min(1).max(60).optional(),
    theme: Theme.optional(),
  })
  .openapi('UpdateMeBody');
export type UpdateMeBody = z.input<typeof UpdateMeBody>;

// ---------- auth ----------

export const SignUpBody = z
  .strictObject({
    email: z.string().trim().email(),
    password: z.string().min(8).max(128),
    displayName: z.string().trim().min(1).max(60).optional(),
    inviteCode: z.string().trim().min(1).max(64),
  })
  .openapi('SignUpBody');
export type SignUpBody = z.input<typeof SignUpBody>;

export const SignInBody = z
  .strictObject({ email: z.string().trim().email(), password: z.string().min(1).max(128) })
  .openapi('SignInBody');
export type SignInBody = z.input<typeof SignInBody>;

export const Session = z
  .object({
    userId: z.string(),
    /** Bearer token for API clients (Flutter). Web relies on the httpOnly cookie instead. */
    accessToken: z.string().nullable(),
    refreshToken: z.string().nullable(),
    expiresAt: z.number().int().nullable(),
  })
  .openapi('Session');
export type Session = z.infer<typeof Session>;

// ---------- invites ----------

export const Invite = z
  .object({
    code: z.string(),
    maxUses: z.number().int(),
    used: z.number().int(),
    createdAt: z.string(),
  })
  .openapi('Invite');
export type Invite = z.infer<typeof Invite>;

export const CreateInviteBody = z
  .strictObject({ maxUses: z.number().int().min(1).max(50).default(1) })
  .openapi('CreateInviteBody');

// ---------- share links ----------

export const ShareLink = z
  .object({
    token: z.string(),
    portfolioId: z.string(),
    portfolioName: z.string(),
    path: z.string(),
    createdAt: z.string(),
    revokedAt: z.string().nullable(),
  })
  .openapi('ShareLink');
export type ShareLink = z.infer<typeof ShareLink>;

export const CreateShareLinkBody = z
  .strictObject({ portfolioId: z.string() })
  .openapi('CreateShareLinkBody');

/** Public, read-only snapshot (no holdings quantities or dollar values). */
export const SharedSnapshot = z
  .object({
    portfolioName: z.string(),
    diversificationScore: z.number().nullable(),
    sectors: z.array(z.object({ label: z.string(), weight: Fraction })),
    topExposures: z.array(
      z.object({ ticker: z.string().nullable(), name: z.string(), weight: Fraction }),
    ),
    funds: z.array(z.object({ ticker: z.string(), weight: Fraction })),
    asOf: AsOf,
  })
  .openapi('SharedSnapshot');
export type SharedSnapshot = z.infer<typeof SharedSnapshot>;

// ---------- alerts ----------

export const AlertKind = z.enum(['concentration', 'dividend']);

export const Alert = z
  .object({
    id: z.string(),
    kind: AlertKind,
    /** concentration: weight threshold (fraction); dividend: days ahead. */
    threshold: z.number(),
    enabled: z.boolean(),
    lastFiredAt: z.string().nullable(),
  })
  .openapi('Alert');
export type Alert = z.infer<typeof Alert>;

export const UpsertAlertBody = z
  .strictObject({ kind: AlertKind, threshold: z.number().positive(), enabled: z.boolean() })
  .openapi('UpsertAlertBody');

export const AlertCheck = z
  .object({
    triggered: z.array(z.object({ alertId: z.string(), kind: AlertKind, message: z.string() })),
  })
  .openapi('AlertCheck');
export type AlertCheck = z.infer<typeof AlertCheck>;

// ---------- goals (FI tracker) ----------

export const Goal = z
  .object({
    id: z.string(),
    label: z.string(),
    annualExpenses: Money,
    withdrawalRate: Fraction,
    monthlyContribution: Money,
    growthRate: Fraction,
    inflationRate: Fraction,
    targetDate: IsoDate.nullable(),
    /** Derived. */
    fiNumber: Money,
    current: Money.nullable(),
    progress: Fraction.nullable(),
    yearsToFi: z.number().nullable(),
    projection: z.array(
      z.object({ year: z.number().int(), real: Money, nominal: Money, fiNumberNominal: Money }),
    ),
  })
  .openapi('Goal');
export type Goal = z.infer<typeof Goal>;

export const GoalBody = z
  .strictObject({
    label: z.string().trim().min(1).max(60),
    annualExpenses: Money.positive(),
    withdrawalRate: Fraction.min(0.01).max(0.2).default(0.04),
    monthlyContribution: Money.nonnegative().default(0),
    growthRate: Fraction.min(-0.5).max(0.5).default(0.07),
    inflationRate: Fraction.min(-0.2).max(0.5).default(0.03),
    targetDate: IsoDate.nullable().optional(),
  })
  .openapi('GoalBody');
export type GoalBody = z.input<typeof GoalBody>;

// ---------- feedback ----------

export const FeedbackBody = z
  .strictObject({
    message: z.string().trim().min(1).max(4000),
    page: z.string().max(200).optional(),
    /** data: URL of a screenshot (png/jpeg), ≤ 2 MB. */
    screenshot: z.string().max(2_800_000).optional(),
  })
  .openapi('FeedbackBody');
export type FeedbackBody = z.input<typeof FeedbackBody>;

// ---------- explorer ----------

export const TableBlock = z
  .object({
    type: z.literal('table'),
    title: z.string(),
    subtitle: z.string().optional(),
    asOf: AsOf,
    columns: z.array(z.object({ key: z.string(), label: z.string() })),
    rows: z.array(
      z.object({
        ticker: z.string(),
        name: z.string().optional(),
        values: z.record(z.string(), Fraction.nullable()),
        total: Fraction.nullable(),
      }),
    ),
  })
  .openapi('TableBlock');

export const SectorShiftBlock = z
  .object({
    type: z.literal('sector_shift'),
    title: z.string(),
    subtitle: z.string().optional(),
    asOf: AsOf,
    rows: z.array(z.object({ sector: z.string(), before: Fraction, after: Fraction })),
  })
  .openapi('SectorShiftBlock');

export const ChatBlock = z
  .discriminatedUnion('type', [TableBlock, SectorShiftBlock])
  .openapi('ChatBlock');
export type ChatBlock = z.infer<typeof ChatBlock>;

export const ChatMessage = z
  .object({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    text: z.string(),
    blocks: z.array(ChatBlock),
    createdAt: z.string(),
  })
  .openapi('ChatMessage');
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ExplorerThread = z
  .object({
    id: z.string(),
    title: z.string(),
    createdAt: z.string(),
    messages: z.array(ChatMessage),
  })
  .openapi('ExplorerThread');
export type ExplorerThread = z.infer<typeof ExplorerThread>;

export const ExplorerThreadList = z
  .object({
    threads: z.array(z.object({ id: z.string(), title: z.string(), createdAt: z.string() })),
    suggestions: z.array(z.string()),
    usage: z.object({ usedToday: z.number().int(), dailyLimit: z.number().int() }),
  })
  .openapi('ExplorerThreadList');
export type ExplorerThreadList = z.infer<typeof ExplorerThreadList>;

export const CreateThreadBody = z
  .strictObject({ title: z.string().trim().max(120).optional() })
  .openapi('CreateThreadBody');

export const PostMessageBody = z
  .strictObject({ text: z.string().trim().min(1).max(2000) })
  .openapi('PostMessageBody');
export type PostMessageBody = z.input<typeof PostMessageBody>;

/**
 * POST /explorer/threads/:id/messages streams newline-delimited JSON (application/x-ndjson):
 * zero or more `delta` events, optional `tool` events, then one `done` (or `error`).
 */
export const ExplorerStreamEvent = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('delta'), text: z.string() }),
    z.object({ type: z.literal('tool'), name: z.string() }),
    z.object({ type: z.literal('done'), message: ChatMessage }),
    z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
  ])
  .openapi('ExplorerStreamEvent');
export type ExplorerStreamEvent = z.infer<typeof ExplorerStreamEvent>;

// ---------- admin / status ----------

export const Status = z
  .object({
    ok: z.boolean(),
    db: z.enum(['postgres', 'pglite']),
    lastJob: z
      .object({
        status: z.string(),
        startedAt: z.string(),
        finishedAt: z.string().nullable(),
        counts: z.record(z.string(), z.number()),
        errors: z.number().int(),
      })
      .nullable(),
    pricesAsOf: AsOf,
    sources: z.record(z.string(), z.boolean()),
    storage: z
      .object({ priceRows: z.number().int(), fundHoldingRows: z.number().int() })
      .optional(),
  })
  .openapi('Status');
export type Status = z.infer<typeof Status>;
