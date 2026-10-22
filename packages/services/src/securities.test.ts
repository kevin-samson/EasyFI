import { securitiesRepo, type DbHandle } from '@easyfi/db';
import { createTestDb } from '@easyfi/db/testing';
import { SecurityDto, SecuritySearchDto } from '@easyfi/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POPULAR_ETFS, seedCatalog } from './catalog';
import { securityService } from './securities';

let h: DbHandle;
beforeAll(async () => {
  h = await createTestDb();
});
afterAll(() => h.close());

describe('POPULAR_ETFS', () => {
  it('has unique upper-case tickers and names', () => {
    const tickers = POPULAR_ETFS.map((e) => e.ticker);
    expect(new Set(tickers).size).toBe(tickers.length);
    for (const e of POPULAR_ETFS) {
      expect(e.ticker).toMatch(/^[A-Z.]{1,6}$/);
      expect(e.name.length).toBeGreaterThan(5);
    }
    for (const t of ['VOO', 'VTI', 'VT', 'IVV', 'QQQ', 'SCHD', 'XLK']) expect(tickers).toContain(t);
  });
});

describe('seedCatalog', () => {
  it('inserts missing ETFs and never overwrites existing rows', async () => {
    const repo = securitiesRepo(h.db);
    await repo.upsert([{ ticker: 'VOO', name: 'Custom name', type: 'etf', expenseRatio: 0.0003 }]);
    const n = await seedCatalog(h.db);
    expect(n).toBe(POPULAR_ETFS.length - 1);
    expect(await repo.get('VOO')).toMatchObject({ name: 'Custom name', expenseRatio: 0.0003 });
    expect(await seedCatalog(h.db)).toBe(0); // idempotent
  });
});

describe('securityService', () => {
  it('searches by ticker prefix and name, exact ticker first', async () => {
    const out = await securityService(h.db).search('vt');
    expect(SecuritySearchDto.parse(out).results[0]!.ticker).toBe('VT');
    expect(out.results.map((r) => r.ticker)).toContain('VTI');
    const byName = await securityService(h.db).search('dividend');
    expect(byName.results.map((r) => r.ticker)).toContain('SCHD');
  });

  it('caps results and returns nothing for blank queries', async () => {
    expect((await securityService(h.db).search('v', 3)).results).toHaveLength(3);
    expect((await securityService(h.db).search('  ')).results).toEqual([]);
  });

  it('gets one security (case-insensitive) or 404s', async () => {
    expect(SecurityDto.parse(await securityService(h.db).get('ivv'))).toMatchObject({
      ticker: 'IVV',
      type: 'etf',
    });
    await expect(securityService(h.db).get('ZZZZZ')).rejects.toMatchObject({ code: 'not_found' });
  });
});
