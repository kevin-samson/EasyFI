import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '../client';
import { createTestDb } from '../testing';
import { createRepos, type Repos } from './index';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

let h: DbHandle;
let r: Repos;
beforeAll(async () => {
  h = await createTestDb();
  r = createRepos(h.db);
});
afterAll(() => h.close());

describe('profiles', () => {
  it('get returns null until upserted; upsert + update', async () => {
    expect(await r.profiles.get(A)).toBeNull();
    const p = await r.profiles.upsert(A, { displayName: 'Ann' });
    expect(p).toMatchObject({ id: A, displayName: 'Ann', baseCurrency: 'USD', theme: 'dark' });
    const again = await r.profiles.upsert(A, { theme: 'light' });
    expect(again).toMatchObject({ displayName: 'Ann', theme: 'light' });
    expect(await r.profiles.update(A, { displayName: 'Annie' })).toMatchObject({
      displayName: 'Annie',
    });
    expect(await r.profiles.update(B, { displayName: 'x' })).toBeNull();
  });
});

describe('portfolios + holdings isolation', () => {
  it('scopes every operation by user', async () => {
    const pa = await r.portfolios.create(A, { name: 'Main', type: 'actual' });
    expect(pa).toMatchObject({ userId: A, name: 'Main', type: 'actual' });

    // B cannot see / change / delete A's portfolio
    expect(await r.portfolios.get(B, pa.id)).toBeNull();
    expect(await r.portfolios.list(B)).toEqual([]);
    expect(await r.portfolios.update(B, pa.id, { name: 'pwned' })).toBeNull();
    expect(await r.portfolios.delete(B, pa.id)).toBe(false);
    expect(await r.portfolios.get(A, pa.id)).toMatchObject({ name: 'Main' });
    // malformed id is just "not found"
    expect(await r.portfolios.get(A, 'nope')).toBeNull();

    // holdings
    const hA = await r.holdings.create(A, pa.id, {
      ticker: 'VOO',
      shares: 10.5,
      costBasis: 4000,
      tags: ['core'],
    });
    expect(hA).toMatchObject({ ticker: 'VOO', shares: 10.5, costBasis: 4000, tags: ['core'] });
    expect(typeof hA!.shares).toBe('number');
    expect(await r.holdings.create(B, pa.id, { ticker: 'QQQ', shares: 1 })).toBeNull();
    expect(await r.holdings.list(B, pa.id)).toEqual([]);
    expect(await r.holdings.get(B, hA!.id)).toBeNull();
    expect(await r.holdings.update(B, hA!.id, { shares: 0 })).toBeNull();
    expect(await r.holdings.delete(B, hA!.id)).toBe(false);
    expect(await r.holdings.bulkDelete(B, [hA!.id])).toBe(0);
    expect(await r.holdings.bulkTag(B, [hA!.id], { add: ['x'] })).toBe(0);
    expect(await r.holdings.list(A, pa.id)).toHaveLength(1);

    expect(
      await r.holdings.update(A, hA!.id, { shares: 12, statementDate: '2026-09-30' }),
    ).toMatchObject({ shares: 12, statementDate: '2026-09-30' });

    // cash
    expect(await r.cash.get(A, pa.id)).toBe(0);
    expect(await r.cash.set(A, pa.id, 1234.5)).toBe(true);
    expect(await r.cash.set(A, pa.id, 99)).toBe(true);
    expect(await r.cash.get(A, pa.id)).toBe(99);
    expect(await r.cash.get(B, pa.id)).toBeNull();
    expect(await r.cash.set(B, pa.id, 1)).toBe(false);

    const withH = await r.portfolios.listWithHoldings(A);
    expect(withH).toHaveLength(1);
    expect(withH[0]).toMatchObject({ id: pa.id, cash: 99 });
    expect(withH[0]!.holdings.map((x) => x.ticker)).toEqual(['VOO']);
    expect(await r.portfolios.listWithHoldings(B)).toEqual([]);

    expect(await r.portfolios.update(A, pa.id, { name: 'Renamed' })).toMatchObject({
      name: 'Renamed',
    });
    expect(await r.holdings.delete(A, hA!.id)).toBe(true);
    expect(await r.portfolios.delete(A, pa.id)).toBe(true);
    expect(await r.portfolios.get(A, pa.id)).toBeNull();
  });

  it('bulk insert / tag / delete, cascade on portfolio delete', async () => {
    const p = await r.portfolios.create(A, { name: 'Import', type: 'hypothetical' });
    const rows = Array.from({ length: 2500 }, (_, i) => ({ ticker: `T${i}`, shares: i }));
    const inserted = await r.holdings.bulkInsert(A, p.id, rows);
    expect(inserted).toHaveLength(2500);
    expect(await r.holdings.bulkInsert(B, p.id, rows)).toBeNull();

    const ids = inserted!.slice(0, 3).map((x) => x.id);
    expect(await r.holdings.bulkTag(A, ids, { add: ['a', 'b'] })).toBe(3);
    expect(await r.holdings.bulkTag(A, ids, { add: ['b', 'c'], remove: ['a'] })).toBe(3);
    expect((await r.holdings.get(A, ids[0]!))!.tags).toEqual(['b', 'c']);
    expect(await r.holdings.bulkDelete(A, ids)).toBe(3);
    expect(await r.holdings.list(A, p.id)).toHaveLength(2497);

    expect(await r.portfolios.delete(A, p.id)).toBe(true);
    expect(await r.jobs.tickersInUse()).toEqual([]);
  });

  it('tickersInUse is distinct across all users', async () => {
    const pa = await r.portfolios.create(A, { name: 'a', type: 'actual' });
    const pb = await r.portfolios.create(B, { name: 'b', type: 'watchlist' });
    await r.holdings.bulkInsert(A, pa.id, [
      { ticker: 'VOO', shares: 1 },
      { ticker: 'QQQ', shares: 1, accountType: 'roth_ira' },
    ]);
    await r.holdings.bulkInsert(B, pb.id, [{ ticker: 'VOO', shares: 2 }]);
    expect(await r.jobs.tickersInUse()).toEqual(['QQQ', 'VOO']);
    await r.portfolios.delete(A, pa.id);
    await r.portfolios.delete(B, pb.id);
  });
});

describe('explorer + llm usage', () => {
  it('threads and messages are user-scoped', async () => {
    const t = await r.explorer.createThread(A, { title: 'Overlap?' });
    expect(await r.explorer.appendMessage(A, t.id, { role: 'user', content: 'hi' })).toMatchObject({
      role: 'user',
      content: 'hi',
    });
    await r.explorer.appendMessage(A, t.id, {
      role: 'assistant',
      content: 'hello',
      blocks: [{ type: 'table', rows: [[1, 2]] }],
    });
    expect(await r.explorer.appendMessage(B, t.id, { role: 'user', content: 'x' })).toBeNull();
    expect(await r.explorer.renameThread(B, t.id, 'pwned')).toBe(false);
    expect(await r.explorer.renameThread(A, t.id, 'Renamed')).toBe(true);
    expect((await r.explorer.getThread(A, t.id))!.title).toBe('Renamed');
    expect(await r.explorer.getThread(B, t.id)).toBeNull();
    const full = await r.explorer.getThread(A, t.id);
    expect(full!.messages.map((m) => m.content)).toEqual(['hi', 'hello']);
    expect(full!.messages[1]!.blocks).toEqual([{ type: 'table', rows: [[1, 2]] }]);
    expect(await r.explorer.listThreads(A)).toHaveLength(1);
    expect(await r.explorer.listThreads(B)).toEqual([]);
    expect(await r.explorer.deleteThread(B, t.id)).toBe(false);
    expect(await r.explorer.deleteThread(A, t.id)).toBe(true);
  });

  it('llm usage increments per user/day', async () => {
    expect(await r.explorer.getUsage(A, '2026-10-22')).toBe(0);
    expect(await r.explorer.incrementUsage(A, '2026-10-22')).toBe(1);
    expect(await r.explorer.incrementUsage(A, '2026-10-22')).toBe(2);
    expect(await r.explorer.getUsage(B, '2026-10-22')).toBe(0);
    expect(await r.explorer.getUsage(A, '2026-10-23')).toBe(0);
  });
});

describe('alerts, goals, share links, feedback', () => {
  it('alerts CRUD scoped', async () => {
    const a = await r.alerts.create(A, { kind: 'drop', threshold: { pct: 5 } });
    expect(a).toMatchObject({ enabled: true, threshold: { pct: 5 }, lastFiredAt: null });
    expect(await r.alerts.list(B)).toEqual([]);
    expect(await r.alerts.update(B, a.id, { enabled: false })).toBeNull();
    expect(await r.alerts.update(A, a.id, { enabled: false })).toMatchObject({ enabled: false });
    const fired = new Date('2026-10-22T00:00:00Z');
    expect((await r.alerts.markFired(A, a.id, fired))!.lastFiredAt).toEqual(fired);
    expect(await r.alerts.delete(B, a.id)).toBe(false);
    expect(await r.alerts.delete(A, a.id)).toBe(true);
  });

  it('goals CRUD scoped', async () => {
    const g = await r.goals.create(A, { targetAmount: 1_000_000, withdrawalRate: 0.04 });
    expect(g).toMatchObject({
      targetAmount: 1_000_000,
      withdrawalRate: 0.04,
      annualExpenses: null,
    });
    expect(await r.goals.get(B, g.id)).toBeNull();
    expect(await r.goals.update(A, g.id, { monthlyContribution: 2000 })).toMatchObject({
      monthlyContribution: 2000,
    });
    expect(await r.goals.list(A)).toHaveLength(1);
    expect(await r.goals.delete(B, g.id)).toBe(false);
    expect(await r.goals.delete(A, g.id)).toBe(true);
  });

  it('share links create/resolve/revoke', async () => {
    const p = await r.portfolios.create(A, { name: 'Shared', type: 'actual' });
    expect(await r.shareLinks.create(B, p.id)).toBeNull();
    const link = await r.shareLinks.create(A, p.id);
    expect(link!.token.length).toBeGreaterThanOrEqual(20);
    expect(await r.shareLinks.resolve(link!.token)).toEqual({ portfolioId: p.id, userId: A });
    expect(await r.shareLinks.list(A)).toHaveLength(1);
    expect(await r.shareLinks.revoke(B, link!.token)).toBe(false);
    expect(await r.shareLinks.revoke(A, link!.token)).toBe(true);
    expect(await r.shareLinks.resolve(link!.token)).toBeNull();
    expect(await r.shareLinks.resolve('missing')).toBeNull();
  });

  it('feedback insert', async () => {
    expect(await r.feedback.insert(A, { message: 'nice' })).toMatchObject({
      userId: A,
      message: 'nice',
      screenshotPath: null,
    });
  });
});

describe('local credentials', () => {
  it('create is unique per email (case-insensitive) and get finds it', async () => {
    expect(await r.credentials.create({ email: 'Ann@x.io', userId: A, passwordHash: 'h' })).toBe(
      true,
    );
    expect(await r.credentials.create({ email: 'ann@x.io', userId: B, passwordHash: 'h2' })).toBe(
      false,
    );
    expect(await r.credentials.get('ANN@x.io')).toMatchObject({ userId: A, passwordHash: 'h' });
    expect(await r.credentials.get('nobody@x.io')).toBeNull();
  });
});
