import { describe, expect, it } from 'vitest';
import {
  buildOpenApiDocument,
  CreateHoldingRequest,
  CreatePortfolioRequest,
  ErrorEnvelope,
  HoldingDto,
  ImportCsvRequest,
  MeDto,
  PatchMeRequest,
  PortfolioDto,
  SignUpRequest,
} from './index';

const uuid = '3f1c2a9e-8b7d-4c6e-9f00-1a2b3c4d5e6f';

describe('request schemas', () => {
  it('accepts a minimal holding and applies defaults', () => {
    const h = CreateHoldingRequest.parse({ ticker: 'voo', shares: 10 });
    expect(h).toEqual({ ticker: 'VOO', shares: 10, accountType: 'taxable', tags: [] });
  });

  it('rejects unknown fields (spec §11)', () => {
    expect(CreatePortfolioRequest.safeParse({ name: 'Main', admin: true }).success).toBe(false);
    expect(CreateHoldingRequest.safeParse({ ticker: 'VOO', shares: 1, userId: uuid }).success).toBe(
      false,
    );
  });

  it('rejects negative shares, empty tickers and bad dates', () => {
    expect(CreateHoldingRequest.safeParse({ ticker: 'VOO', shares: -1 }).success).toBe(false);
    expect(CreateHoldingRequest.safeParse({ ticker: '  ', shares: 1 }).success).toBe(false);
    expect(
      CreateHoldingRequest.safeParse({ ticker: 'VOO', shares: 1, statementDate: '2026-13-01' })
        .success,
    ).toBe(false);
  });

  it('caps CSV import size and validates format', () => {
    expect(
      ImportCsvRequest.safeParse({ csv: 'Symbol,Quantity\nVOO,1', format: 'generic' }).success,
    ).toBe(true);
    expect(ImportCsvRequest.safeParse({ csv: 'x', format: 'robinhood' }).success).toBe(false);
    expect(ImportCsvRequest.safeParse({ csv: 'x'.repeat(2_000_001) }).success).toBe(false);
  });

  it('patch /me only allows display name and theme', () => {
    expect(PatchMeRequest.safeParse({ theme: 'light' }).success).toBe(true);
    expect(PatchMeRequest.safeParse({ theme: 'blue' }).success).toBe(false);
    expect(PatchMeRequest.safeParse({ baseCurrency: 'AED' }).success).toBe(false);
  });
});

describe('sign-up', () => {
  it('requires email, 8+ char password and an invite code', () => {
    const ok = { email: 'a@b.co', password: 'longenough', inviteCode: 'FRIENDS' };
    expect(SignUpRequest.safeParse(ok).success).toBe(true);
    expect(SignUpRequest.safeParse({ ...ok, email: 'nope' }).success).toBe(false);
    expect(SignUpRequest.safeParse({ ...ok, password: 'short' }).success).toBe(false);
    expect(SignUpRequest.safeParse({ ...ok, inviteCode: ' ' }).success).toBe(false);
  });
});

describe('response schemas', () => {
  it('parse realistic DTOs', () => {
    expect(
      MeDto.parse({
        id: uuid,
        email: 'a@b.co',
        displayName: null,
        baseCurrency: 'USD',
        theme: 'dark',
      }),
    ).toBeTruthy();
    expect(
      PortfolioDto.parse({
        id: uuid,
        name: 'Main',
        type: 'actual',
        createdAt: '2026-10-22T10:00:00.000Z',
        cash: 0,
      }),
    ).toBeTruthy();
    expect(
      HoldingDto.parse({
        id: uuid,
        portfolioId: uuid,
        ticker: 'VOO',
        accountType: 'roth_ira',
        shares: 1.5,
        costBasis: null,
        statementValue: null,
        statementDate: null,
        statementKind: null,
        tags: ['core'],
      }),
    ).toBeTruthy();
    expect(
      ErrorEnvelope.parse({ error: { code: 'not_found', message: 'Portfolio not found' } }),
    ).toBeTruthy();
  });
});

describe('OpenAPI document', () => {
  const doc = buildOpenApiDocument();

  it('is OpenAPI 3.1 served under /api/v1', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.servers?.[0]?.url).toBe('/api/v1');
  });

  it('documents every M2 endpoint', () => {
    const ops = Object.entries(doc.paths ?? {}).flatMap(([p, item]) =>
      Object.keys(item as object).map((m) => `${m.toUpperCase()} ${p}`),
    );
    expect(ops.sort()).toEqual(
      [
        'POST /auth/sign-up',
        'GET /me',
        'PATCH /me',
        'GET /portfolios',
        'POST /portfolios',
        'GET /portfolios/{id}',
        'PATCH /portfolios/{id}',
        'DELETE /portfolios/{id}',
        'GET /portfolios/{id}/holdings',
        'POST /portfolios/{id}/holdings',
        'PATCH /holdings/{id}',
        'DELETE /holdings/{id}',
        'POST /portfolios/{id}/import',
      ].sort(),
    );
  });

  it('registers named component schemas and a bearer auth scheme', () => {
    const names = Object.keys(doc.components?.schemas ?? {});
    for (const n of ['Me', 'Portfolio', 'Holding', 'Error', 'CreateHolding', 'ImportResult']) {
      expect(names).toContain(n);
    }
    expect(doc.components?.securitySchemes?.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('every operation declares the error envelope for 4xx', () => {
    for (const item of Object.values(doc.paths ?? {})) {
      for (const op of Object.values(
        item as Record<string, { responses: Record<string, unknown> }>,
      )) {
        expect(op.responses['400'] ?? op.responses['401']).toBeTruthy();
      }
    }
  });
});
