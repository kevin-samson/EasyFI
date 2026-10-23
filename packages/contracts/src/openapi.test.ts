import { describe, expect, it } from 'vitest';
import { endpoints, type EndpointDef } from './endpoints';
import { buildOpenApiDocument } from './openapi';
import { CreateHoldingBody, CreatePortfolioBody, ErrorEnvelope, HoldingRow } from './schemas';

describe('buildOpenApiDocument', () => {
  const doc = buildOpenApiDocument();

  it('is OpenAPI 3.1 with a v1 server', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.servers?.[0]?.url).toBe('/api/v1');
  });

  it('documents every endpoint with its method and a JSON 200 response', () => {
    const list = Object.values(endpoints) as EndpointDef[];
    expect(list.length).toBeGreaterThan(20);
    for (const e of list) {
      const oaPath = e.path.replace(/:(\w+)/g, '{$1}');
      const op = doc.paths?.[oaPath]?.[e.method];
      expect(op, `${e.method} ${e.path}`).toBeDefined();
      expect(op?.operationId).toBe(e.operationId);
      expect(Object.keys(op?.responses ?? {})).toContain(String(e.status ?? 200));
    }
  });

  it('documents the error envelope on every operation', () => {
    for (const methods of Object.values(doc.paths ?? {})) {
      for (const op of Object.values(methods as Record<string, { responses: object }>)) {
        expect(Object.keys(op.responses)).toContain('default');
      }
    }
  });

  it('registers named component schemas', () => {
    const names = Object.keys(doc.components?.schemas ?? {});
    expect(names).toEqual(expect.arrayContaining(['HoldingRow', 'PortfolioSummary', 'Error']));
  });

  it('has unique operation ids', () => {
    const ids = Object.values(endpoints).map((e) => e.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('schemas', () => {
  it('rejects unknown fields in request bodies', () => {
    expect(CreatePortfolioBody.safeParse({ name: 'A', type: 'actual' }).success).toBe(true);
    expect(CreatePortfolioBody.safeParse({ name: 'A', type: 'actual', admin: true }).success).toBe(
      false,
    );
  });

  it('validates holdings input', () => {
    expect(
      CreateHoldingBody.safeParse({ ticker: 'VOO', accountType: 'roth_ira', shares: 10 }).success,
    ).toBe(true);
    expect(CreateHoldingBody.safeParse({ ticker: '', shares: 10 }).success).toBe(false);
    expect(CreateHoldingBody.safeParse({ ticker: 'VOO', shares: -1 }).success).toBe(false);
  });

  it('allows null money (unpriced) but not missing fields on rows', () => {
    const row = {
      id: 'h1',
      ticker: 'XYZ',
      name: 'XYZ Corp',
      type: 'stock',
      accountType: 'taxable',
      shares: 1,
      price: null,
      value: null,
      costBasis: null,
      dayChange: null,
      totalReturn: null,
      yield: null,
      annualIncome: null,
      tags: [],
      lookThroughCoverage: null,
      asOf: null,
    };
    expect(HoldingRow.safeParse(row).success).toBe(true);
    const missing: Partial<typeof row> = { ...row };
    delete missing.value;
    expect(HoldingRow.safeParse(missing).success).toBe(false);
  });

  it('error envelope shape', () => {
    expect(ErrorEnvelope.safeParse({ error: { code: 'not_found', message: 'x' } }).success).toBe(
      true,
    );
  });
});
