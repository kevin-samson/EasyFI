import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

// Enums mirror packages/core types (contracts may not import core — kept in sync by tests in services).
export const PortfolioType = z.enum(['actual', 'hypothetical', 'watchlist']);
export const AccountType = z.enum([
  'taxable',
  'trad_ira',
  'roth_ira',
  '401k',
  'roth_401k',
  'other',
]);
export const Theme = z.enum(['dark', 'light']);
export const CsvFormat = z.enum(['auto', 'generic', 'fidelity', 'schwab', 'vanguard']);

export const Uuid = z.uuid();
export const IsoDate = z.iso.date();
export const Ticker = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9.\-^=/]+$/, 'Invalid ticker')
  .transform((t) => t.toUpperCase())
  .openapi({ type: 'string', example: 'VOO' });

// ---------- errors ----------
export const ErrorEnvelope = z
  .object({ error: z.object({ code: z.string(), message: z.string() }) })
  .openapi('Error');

// ---------- me ----------
export const MeDto = z
  .object({
    id: Uuid,
    email: z.string().nullable(),
    displayName: z.string().nullable(),
    baseCurrency: z.string(),
    theme: Theme,
  })
  .openapi('Me');

export const PatchMeRequest = z
  .strictObject({
    displayName: z.string().trim().max(80).nullable().optional(),
    theme: Theme.optional(),
  })
  .openapi('PatchMe');

// ---------- auth ----------
export const SignUpRequest = z
  .strictObject({
    email: z.email().max(254),
    password: z.string().min(8).max(72),
    displayName: z.string().trim().max(80).nullable().optional(),
    inviteCode: z.string().trim().min(1).max(64),
  })
  .openapi('SignUp');

export const SignUpResultDto = z.object({ userId: Uuid }).openapi('SignUpResult');

// ---------- portfolios ----------
export const PortfolioDto = z
  .object({
    id: Uuid,
    name: z.string(),
    type: PortfolioType,
    createdAt: z.iso.datetime(),
    cash: z.number(),
  })
  .openapi('Portfolio');

export const PortfolioListDto = z
  .object({ portfolios: z.array(PortfolioDto) })
  .openapi('PortfolioList');

export const CreatePortfolioRequest = z
  .strictObject({
    name: z.string().trim().min(1).max(80),
    type: PortfolioType.default('actual'),
    cash: z.number().min(0).optional(),
  })
  .openapi('CreatePortfolio');

export const PatchPortfolioRequest = z
  .strictObject({
    name: z.string().trim().min(1).max(80).optional(),
    type: PortfolioType.optional(),
    cash: z.number().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')
  .openapi('PatchPortfolio');

// ---------- holdings ----------
export const HoldingDto = z
  .object({
    id: Uuid,
    portfolioId: Uuid,
    ticker: z.string(),
    accountType: AccountType,
    shares: z.number(),
    costBasis: z.number().nullable(),
    statementValue: z.number().nullable(),
    statementDate: IsoDate.nullable(),
    statementKind: z.string().nullable(),
    tags: z.array(z.string()),
  })
  .openapi('Holding');

export const HoldingListDto = z.object({ holdings: z.array(HoldingDto) }).openapi('HoldingList');

const holdingFields = {
  ticker: Ticker,
  shares: z.number().min(0),
  accountType: AccountType.default('taxable'),
  costBasis: z.number().min(0).nullable().optional(),
  statementValue: z.number().min(0).nullable().optional(),
  statementDate: IsoDate.nullable().optional(),
  statementKind: z.string().max(40).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
};

export const CreateHoldingRequest = z.strictObject(holdingFields).openapi('CreateHolding');

export const PatchHoldingRequest = z
  .strictObject({
    ticker: Ticker.optional(),
    shares: holdingFields.shares.optional(),
    accountType: AccountType.optional(),
    costBasis: holdingFields.costBasis,
    statementValue: holdingFields.statementValue,
    statementDate: holdingFields.statementDate,
    statementKind: holdingFields.statementKind,
    tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')
  .openapi('PatchHolding');

// ---------- CSV import ----------
export const ImportCsvRequest = z
  .strictObject({
    csv: z.string().min(1).max(2_000_000),
    format: CsvFormat.default('auto'),
    /** replace = delete existing holdings in the portfolio first. */
    mode: z.enum(['append', 'replace']).default('append'),
  })
  .openapi('ImportCsv');

export const ImportResultDto = z
  .object({
    imported: z.number().int(),
    skipped: z.array(z.object({ line: z.number().int(), reason: z.string() })),
    holdings: z.array(HoldingDto),
  })
  .openapi('ImportResult');

export const IdParams = z.object({ id: Uuid.openapi({ param: { name: 'id', in: 'path' } }) });

export type MeDto = z.infer<typeof MeDto>;
export type SignUpRequest = z.infer<typeof SignUpRequest>;
export type SignUpResultDto = z.infer<typeof SignUpResultDto>;
export type PatchMeRequest = z.infer<typeof PatchMeRequest>;
export type PortfolioDto = z.infer<typeof PortfolioDto>;
export type CreatePortfolioRequest = z.infer<typeof CreatePortfolioRequest>;
export type PatchPortfolioRequest = z.infer<typeof PatchPortfolioRequest>;
export type HoldingDto = z.infer<typeof HoldingDto>;
export type CreateHoldingRequest = z.infer<typeof CreateHoldingRequest>;
export type PatchHoldingRequest = z.infer<typeof PatchHoldingRequest>;
export type ImportCsvRequest = z.infer<typeof ImportCsvRequest>;
export type ImportResultDto = z.infer<typeof ImportResultDto>;
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;
