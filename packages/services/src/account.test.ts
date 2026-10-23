import type { ExplorerStreamEvent } from '@easyfi/contracts';
import { AlertCheck, ExplorerThread, Goal, Me, SharedSnapshot } from '@easyfi/contracts';
import { FakeLLMProvider, fakeFetch, jsonResponse } from '@easyfi/data-sources';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_EMAIL, DEMO_PASSWORD, ensureDemoLogin } from './auth';
import { createServices } from './index';
import { createTestServices, OTHER_USER_ID, type TestServices } from './testing';

let t: TestServices;
beforeAll(async () => {
  t = await createTestServices({ config: { explorerDailyLimit: 3 } });
}, 60_000);
afterAll(() => t.close());

describe('demo auth', () => {
  it('sign-up requires a valid invite; sign-in issues a verifiable token', async () => {
    await expect(
      t.services.auth.signUp({ email: 'a@x.io', password: 'password1', inviteCode: 'NOPE' }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    const s = await t.services.auth.signUp({
      email: 'friend@x.io',
      password: 'password1',
      inviteCode: 'demo-invite',
      displayName: 'Friend',
    });
    expect(s.accessToken).toBeTruthy();
    expect(await t.services.auth.verify(s.accessToken!)).toMatchObject({
      userId: s.userId,
      email: 'friend@x.io',
    });
    await expect(
      t.services.auth.signUp({
        email: 'FRIEND@x.io',
        password: 'password1',
        inviteCode: 'DEMO-INVITE',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    await expect(
      t.services.auth.signIn({ email: 'friend@x.io', password: 'wrong' }),
    ).rejects.toMatchObject({
      code: 'unauthorized',
    });
    const again = await t.services.auth.signIn({ email: 'friend@x.io', password: 'password1' });
    expect(again.userId).toBe(s.userId);
    expect(await t.services.auth.verify('garbage')).toBeNull();

    const me = Me.parse(await t.services.me.get(s.userId));
    expect(me).toMatchObject({ displayName: 'Friend', email: 'friend@x.io', authMode: 'demo' });
  });

  it('db invites are single-use', async () => {
    const inv = await t.services.settings.createInvite(t.userId, true, 1);
    await t.services.auth.signUp({ email: 'b@x.io', password: 'password1', inviteCode: inv.code });
    await expect(
      t.services.auth.signUp({ email: 'c@x.io', password: 'password1', inviteCode: inv.code }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('demo login exists after ensureDemoLogin', async () => {
    await ensureDemoLogin(t.services.ctx);
    const s = await t.services.auth.signIn({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    expect(s.userId).toBe(t.userId);
  });

  it('me can be updated', async () => {
    const me = await t.services.me.update(t.userId, { displayName: 'Kev', theme: 'light' });
    expect(me).toMatchObject({ displayName: 'Kev', theme: 'light' });
  });
});

describe('supabase auth backend', () => {
  it('creates via admin API, signs in, verifies HS256 tokens', async () => {
    const secret = 'super-secret-jwt-key-for-tests-0123456789';
    const userId = '11111111-1111-4111-8111-111111111111';
    const token = await new SignJWT({ email: 'z@x.io' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(secret));
    const f = fakeFetch((url) => {
      if (url.includes('/admin/users')) return jsonResponse({ id: userId, email: 'z@x.io' });
      if (url.includes('grant_type=password'))
        return jsonResponse({
          access_token: token,
          refresh_token: 'r1',
          expires_in: 3600,
          user: { id: userId, email: 'z@x.io' },
        });
      return jsonResponse({}, 404);
    });
    const s = createServices({
      db: t.handle.db,
      auth: {
        mode: 'supabase',
        url: 'https://p.supabase.co',
        anonKey: 'anon',
        serviceRoleKey: 'srv',
        jwtSecret: secret,
        fetch: f,
      },
      inviteCodes: ['FRIENDS'],
    });
    const session = await s.auth.signUp({
      email: 'z@x.io',
      password: 'password1',
      inviteCode: 'friends',
    });
    expect(session).toMatchObject({ userId, refreshToken: 'r1' });
    expect(await s.auth.verify(token)).toMatchObject({ userId });
    expect(f.calls.map((c) => c.url)).toEqual([
      'https://p.supabase.co/auth/v1/admin/users',
      'https://p.supabase.co/auth/v1/token?grant_type=password',
    ]);
    expect(f.calls[0]!.init?.headers).toMatchObject({ apikey: 'srv' });
  });
});

describe('settings', () => {
  it('invites are admin-only', async () => {
    await expect(t.services.settings.listInvites(OTHER_USER_ID, false)).rejects.toMatchObject({
      code: 'forbidden',
    });
    const list = await t.services.settings.listInvites(t.userId, true);
    expect(list.invites.length).toBeGreaterThan(0);
  });

  it('share links expose a weights-only snapshot until revoked', async () => {
    const pid = t.portfolioIds['Family Taxable']!;
    await expect(t.services.settings.createShareLink(OTHER_USER_ID, pid)).rejects.toMatchObject({
      code: 'not_found',
    });
    const link = await t.services.settings.createShareLink(t.userId, pid);
    expect(link.path).toBe(`/shared/${link.token}`);
    const snap = SharedSnapshot.parse(await t.services.settings.sharedSnapshot(link.token));
    expect(snap.portfolioName).toBe('Family Taxable');
    expect(JSON.stringify(snap)).not.toMatch(/shares|value"/);
    expect((await t.services.settings.listShareLinks(t.userId)).links).toHaveLength(1);
    await t.services.settings.revokeShareLink(t.userId, link.token);
    await expect(t.services.settings.sharedSnapshot(link.token)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('alerts fire for concentration and upcoming dividends', async () => {
    await t.services.settings.upsertAlert(t.userId, {
      kind: 'concentration',
      threshold: 0.1,
      enabled: true,
    });
    const updated = await t.services.settings.upsertAlert(t.userId, {
      kind: 'concentration',
      threshold: 0.12,
      enabled: true,
    });
    expect(updated.threshold).toBe(0.12);
    await t.services.settings.upsertAlert(t.userId, {
      kind: 'dividend',
      threshold: 60,
      enabled: true,
    });
    expect((await t.services.settings.listAlerts(t.userId)).alerts).toHaveLength(2);
    const check = AlertCheck.parse(await t.services.settings.checkAlerts(t.userId));
    expect(check.triggered.some((x) => x.kind === 'concentration' && /GOOGL/.test(x.message))).toBe(
      true,
    );
    expect(check.triggered.some((x) => x.kind === 'dividend')).toBe(true);
  });

  it('goals track FI progress against tracked value', async () => {
    const g = Goal.parse(
      await t.services.settings.createGoal(t.userId, {
        label: 'FI',
        annualExpenses: 40_000,
        monthlyContribution: 1500,
      }),
    );
    expect(g.fiNumber).toBe(1_000_000);
    expect(g.progress).toBeGreaterThan(0.05);
    expect(g.yearsToFi).toBeGreaterThan(5);
    const u = await t.services.settings.updateGoal(t.userId, g.id, {
      label: 'FI',
      annualExpenses: 30_000,
    });
    expect(u.fiNumber).toBe(750_000);
    await expect(t.services.settings.deleteGoal(OTHER_USER_ID, g.id)).rejects.toMatchObject({
      code: 'not_found',
    });
    await t.services.settings.deleteGoal(t.userId, g.id);
    expect((await t.services.settings.listGoals(t.userId)).goals).toEqual([]);
  });

  it('feedback validates screenshots', async () => {
    await expect(
      t.services.settings.sendFeedback(t.userId, {
        message: 'hi',
        screenshot: 'data:text/plain;base64,aGk=',
      }),
    ).rejects.toMatchObject({ code: 'bad_request' });
    let stored = 0;
    await t.services.settings.sendFeedback(
      t.userId,
      {
        message: 'Looks great',
        page: '/compare',
        screenshot: 'data:image/png;base64,iVBORw0KGgo=',
      },
      async () => {
        stored++;
        return 'feedback/x.png';
      },
    );
    expect(stored).toBe(1);
  });

  it('status reports the data freshness', async () => {
    const s = await t.services.settings.status({ driver: 'pglite', sources: { tiingo: false } });
    expect(s).toMatchObject({ ok: true, db: 'pglite', pricesAsOf: '2026-09-30', lastJob: null });
  });
});

describe('explorer', () => {
  it('rule-based demo LLM answers with blocks from tool results and persists the thread', async () => {
    const th = await t.services.explorer.create(t.userId);
    const events: ExplorerStreamEvent[] = [];
    const msg = await t.services.explorer.ask(t.userId, th.id, 'Compare VOO and QQQ', (e) =>
      events.push(e),
    );
    expect(events.map((e) => e.type)).toContain('tool');
    expect(events.at(-1)!.type).toBe('done');
    expect(msg.blocks[0]).toMatchObject({ type: 'table' });
    expect(msg.text).toMatch(/^VOO and QQQ overlap \d+% by weight, sharing \d+ holdings/);
    // an unused thread is hidden from the list
    await t.services.explorer.create(t.userId);
    expect((await t.services.explorer.list(t.userId)).threads.map((x) => x.title)).toEqual([
      'Compare VOO and QQQ',
    ]);
    const thread = ExplorerThread.parse(await t.services.explorer.get(t.userId, th.id));
    expect(thread.title).toBe('Compare VOO and QQQ');
    expect(thread.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    await expect(t.services.explorer.get(OTHER_USER_ID, th.id)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('scripted LLM: tool call → final answer; enforces the daily limit', async () => {
    const llm = new FakeLLMProvider([
      {
        role: 'assistant',
        content: null,
        toolCalls: [{ id: 'c1', name: 'what_if_add', arguments: '{"ticker":"VGT","amount":5000}' }],
      },
      { role: 'assistant', content: 'Adding VGT raises tech.' },
    ]);
    const s = createServices({
      db: t.handle.db,
      llm,
      now: t.services.ctx.now,
      config: { explorerDailyLimit: 1 },
    });
    const th = await s.explorer.create(OTHER_USER_ID);
    const msg = await s.explorer.ask(OTHER_USER_ID, th.id, 'Should I add VGT?');
    expect(msg.text).toBe('Adding VGT raises tech.');
    // other user has no portfolios → tool error is passed to the model, not thrown
    expect(llm.calls[1]!.messages.at(-1)).toMatchObject({ role: 'tool' });
    expect(llm.calls[0]!.messages[0]).toMatchObject({ role: 'system' });
    await expect(s.explorer.ask(OTHER_USER_ID, th.id, 'again')).rejects.toMatchObject({
      code: 'rate_limited',
    });
    expect((await s.explorer.list(OTHER_USER_ID)).usage.usedToday).toBe(1);
  });
});
