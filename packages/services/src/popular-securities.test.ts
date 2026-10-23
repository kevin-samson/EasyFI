import { createTestDb } from '@easyfi/db/testing';
import { createRepos } from '@easyfi/db';
import { describe, expect, it } from 'vitest';
import {
  POPULAR_SECURITIES,
  SEEDED_FUND_TICKERS,
  seedPopularSecurities,
} from './popular-securities';

describe('seedPopularSecurities', () => {
  it('adds missing funds once and keeps existing rows', async () => {
    const h = await createTestDb();
    const r = createRepos(h.db);
    await r.securities.upsert([{ ticker: 'VOO', name: 'Custom VOO name', type: 'etf' }]);
    expect(await seedPopularSecurities(h.db)).toBe(POPULAR_SECURITIES.length - 1);
    expect(await seedPopularSecurities(h.db)).toBe(0);
    expect((await r.securities.get('VOO'))!.name).toBe('Custom VOO name');
    expect((await r.securities.search('schwab', 20)).map((s) => s.ticker)).toContain('SCHD');
    expect(SEEDED_FUND_TICKERS).not.toContain('SPAXX');
    await h.close();
  });
});
