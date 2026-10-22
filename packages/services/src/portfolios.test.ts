import type { DbHandle } from '@easyfi/db';
import { createTestDb } from '@easyfi/db/testing';
import { HoldingDto, MeDto, PortfolioDto } from '@easyfi/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { meService } from './me';
import { portfolioService } from './portfolios';

const A = { userId: '11111111-1111-4111-8111-111111111111', email: 'a@b.co' };
const B = { userId: '22222222-2222-4222-8222-222222222222', email: 'b@b.co' };

let h: DbHandle;
beforeAll(async () => {
  h = await createTestDb();
});
afterAll(() => h.close());

describe('meService', () => {
  it('creates the profile on first read and validates against the contract', async () => {
    const me = meService(h.db);
    const out = await me.get(A);
    expect(MeDto.parse(out)).toEqual({
      id: A.userId,
      email: 'a@b.co',
      displayName: null,
      baseCurrency: 'USD',
      theme: 'dark',
    });
    expect((await me.patch(A, { displayName: 'Abhi', theme: 'light' })).theme).toBe('light');
  });
});

describe('portfolioService', () => {
  const svc = () => portfolioService(h.db);

  it('creates, lists, patches (incl. cash) and deletes a portfolio', async () => {
    const p = await svc().create(A, { name: 'Main', type: 'actual', cash: 250 });
    expect(PortfolioDto.parse(p)).toMatchObject({ name: 'Main', cash: 250 });
    expect((await svc().list(A)).portfolios.map((x) => x.id)).toContain(p.id);
    await svc().patch(A, p.id, { name: 'Core', cash: 10 });
    const got = await svc().get(A, p.id);
    expect(got).toMatchObject({ name: 'Core', cash: 10 });
    await svc().remove(A, p.id);
    await expect(svc().get(A, p.id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it("never exposes another user's portfolio or holdings (404, not 403)", async () => {
    const p = await svc().create(A, { name: 'Private', type: 'actual' });
    const hold = await svc().addHolding(A, p.id, {
      ticker: 'VOO',
      shares: 5,
      accountType: 'taxable',
      tags: [],
    });
    expect((await svc().list(B)).portfolios).toHaveLength(0);
    for (const call of [
      () => svc().get(B, p.id),
      () => svc().patch(B, p.id, { name: 'pwned' }),
      () => svc().remove(B, p.id),
      () => svc().listHoldings(B, p.id),
      () =>
        svc().addHolding(B, p.id, { ticker: 'QQQ', shares: 1, accountType: 'taxable', tags: [] }),
      () => svc().patchHolding(B, hold.id, { shares: 0 }),
      () => svc().removeHolding(B, hold.id),
      () =>
        svc().importCsv(B, p.id, {
          csv: 'Symbol,Quantity\nQQQ,1',
          format: 'auto',
          mode: 'replace',
        }),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: 'not_found', status: 404 });
    }
    expect((await svc().listHoldings(A, p.id)).holdings).toHaveLength(1);
    expect((await svc().get(A, p.id)).name).toBe('Private');
  });

  it('holding CRUD returns contract-valid DTOs', async () => {
    const p = await svc().create(A, { name: 'H', type: 'actual' });
    const hd = await svc().addHolding(A, p.id, {
      ticker: 'SCHD',
      shares: 3,
      accountType: 'roth_ira',
      costBasis: 200,
      tags: ['income'],
    });
    expect(HoldingDto.parse(hd)).toMatchObject({
      ticker: 'SCHD',
      accountType: 'roth_ira',
      tags: ['income'],
    });
    expect((await svc().patchHolding(A, hd.id, { shares: 4 })).shares).toBe(4);
    await svc().removeHolding(A, hd.id);
    expect((await svc().listHoldings(A, p.id)).holdings).toHaveLength(0);
  });

  it('imports a broker CSV: append vs replace, cash rows go to the cash balance, bad rows reported', async () => {
    const p = await svc().create(A, { name: 'Import', type: 'actual' });
    await svc().addHolding(A, p.id, { ticker: 'OLD', shares: 1, accountType: 'taxable', tags: [] });
    const csv = [
      'Symbol,Quantity,Current Value,Cost Basis Total',
      'VOO,10,"$5,000.00",4000',
      'SPAXX**,,$300.00,',
      'QQQ,abc,,',
    ].join('\n');

    const r = await svc().importCsv(A, p.id, { csv, format: 'auto', mode: 'replace' });
    expect(r.imported).toBe(1);
    expect(r.holdings.map((x) => x.ticker)).toEqual(['VOO']);
    expect(r.skipped.length).toBeGreaterThanOrEqual(1);
    expect((await svc().listHoldings(A, p.id)).holdings.map((x) => x.ticker)).toEqual(['VOO']);
    expect((await svc().get(A, p.id)).cash).toBe(300);

    await svc().importCsv(A, p.id, {
      csv: 'Symbol,Quantity\nVTI,2',
      format: 'auto',
      mode: 'append',
    });
    expect((await svc().listHoldings(A, p.id)).holdings.map((x) => x.ticker).sort()).toEqual([
      'VOO',
      'VTI',
    ]);
  });

  it('replace import is atomic, refuses an empty parse, and resets cash to the CSV', async () => {
    const p = await svc().create(A, { name: 'Safe', type: 'actual', cash: 999 });
    await svc().addHolding(A, p.id, {
      ticker: 'KEEP',
      shares: 1,
      accountType: 'taxable',
      tags: [],
    });
    await expect(
      svc().importCsv(A, p.id, { csv: 'no header here', format: 'auto', mode: 'replace' }),
    ).rejects.toMatchObject({ code: 'bad_request' });
    expect((await svc().listHoldings(A, p.id)).holdings.map((x) => x.ticker)).toEqual(['KEEP']);

    await svc().importCsv(A, p.id, {
      csv: 'Symbol,Quantity\nVOO,1',
      format: 'auto',
      mode: 'replace',
    });
    expect((await svc().get(A, p.id)).cash).toBe(0);
  });

  it('empty patch bodies are rejected before reaching the DB', async () => {
    const { PatchHoldingRequest, PatchPortfolioRequest } = await import('@easyfi/contracts');
    expect(PatchHoldingRequest.safeParse({}).success).toBe(false);
    expect(PatchPortfolioRequest.safeParse({}).success).toBe(false);
  });
});
