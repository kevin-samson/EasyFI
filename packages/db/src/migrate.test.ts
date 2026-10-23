import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from './client';
import { runMigrations } from './migrate';
import { createTestDb } from './testing';
import { queryRows } from './util';

let h: DbHandle;
beforeAll(async () => {
  h = await createTestDb();
});
afterAll(() => h.close());

const rows = <T>(q: SQL) => queryRows<T>(h.db, q);

describe('migrations', () => {
  it('creates all spec tables', async () => {
    const tables = await rows<{ relname: string }>(
      sql`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' order by 1`,
    );
    expect(tables.map((t) => t.relname)).toEqual([
      'alerts',
      'cash_balances',
      'cpi_series',
      'dividends',
      'explorer_messages',
      'explorer_threads',
      'feedback',
      'fund_holdings',
      'fund_sector_weights',
      'goals',
      'holdings',
      'invites',
      'job_runs',
      'llm_usage',
      'local_credentials',
      'portfolios',
      'prices_eod',
      'profiles',
      'securities',
      'share_links',
    ]);
  });

  it('enables RLS with no policies on every public table', async () => {
    const off = await rows<{ relname: string }>(
      sql`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(off).toEqual([]);
    const policies = await rows<{ n: number }>(
      sql`select count(*)::int as n from pg_policies where schemaname = 'public'`,
    );
    expect(policies[0]?.n).toBe(0);
  });

  it('is idempotent', async () => {
    await expect(runMigrations(h)).resolves.toBeUndefined();
  });
});
