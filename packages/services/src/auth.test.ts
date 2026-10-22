import { invitesRepo, profilesRepo, type DbHandle } from '@easyfi/db';
import { createTestDb } from '@easyfi/db/testing';
import { FakeAuthAdmin } from '@easyfi/data-sources';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { accessTokenFromRequest, authenticate, DEMO_USER_ID, signUp } from './auth';
import { ServiceError } from './errors';

const secret = 'test-secret-at-least-32-characters-long!!';
const uid = '0b4f6a2c-1d3e-4f5a-8b9c-0d1e2f3a4b5c';

const req = (headers: Record<string, string>) => ({ headers: new Headers(headers) });
const mint = (claims: Record<string, unknown>, exp = '1h', key = secret) =>
  new SignJWT({ aud: 'authenticated', role: 'authenticated', ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(key));

const cookieValue = (token: string) =>
  'base64-' +
  Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'r' })).toString('base64url');

describe('accessTokenFromRequest', () => {
  it('prefers the Bearer header (Flutter)', () => {
    expect(accessTokenFromRequest(req({ authorization: 'Bearer abc.def.ghi' }))).toBe(
      'abc.def.ghi',
    );
  });

  it('reads a Supabase SSR cookie, including chunked cookies', () => {
    const v = cookieValue('tok.en.x');
    expect(accessTokenFromRequest(req({ cookie: `other=1; sb-proj-auth-token=${v}` }))).toBe(
      'tok.en.x',
    );
    const [a, b] = [v.slice(0, 20), v.slice(20)];
    expect(
      accessTokenFromRequest(
        req({ cookie: `sb-proj-auth-token.1=${b}; sb-proj-auth-token.0=${a}` }),
      ),
    ).toBe('tok.en.x');
  });

  it('returns null without credentials or with garbage', () => {
    expect(accessTokenFromRequest(req({}))).toBeNull();
    expect(accessTokenFromRequest(req({ cookie: 'sb-proj-auth-token=%%%notjson' }))).toBeNull();
    expect(accessTokenFromRequest(req({ authorization: 'Basic xyz' }))).toBeNull();
  });
});

describe('authenticate', () => {
  it('accepts a valid Supabase JWT', async () => {
    const token = await mint({ sub: uid, email: 'a@b.co' });
    await expect(
      authenticate(req({ authorization: `Bearer ${token}` }), { jwtSecret: secret }),
    ).resolves.toEqual({ userId: uid, email: 'a@b.co' });
  });

  it('rejects expired, wrongly signed, wrong-audience and non-uuid tokens', async () => {
    const cases = [
      await mint({ sub: uid }, '-1m'),
      await mint({ sub: uid }, '1h', 'another-secret-another-secret-another!!'),
      await mint({ sub: uid, aud: 'anon' }),
      await mint({ sub: 'not-a-uuid' }),
    ];
    for (const t of cases) {
      await expect(
        authenticate(req({ authorization: `Bearer ${t}` }), { jwtSecret: secret }),
      ).resolves.toBeNull();
    }
  });

  it('never authenticates without a secret unless demo mode is on', async () => {
    const token = await mint({ sub: uid });
    await expect(authenticate(req({ authorization: `Bearer ${token}` }), {})).resolves.toBeNull();
    await expect(authenticate(req({}), { demo: true })).resolves.toEqual({
      userId: DEMO_USER_ID,
      email: 'demo@easyfi.local',
    });
  });
});

describe('signUp (invite gate)', () => {
  let h: DbHandle;
  beforeAll(async () => {
    h = await createTestDb();
    await invitesRepo(h.db).create({ code: 'ONE-USE', maxUses: 1 });
  });
  afterAll(() => h.close());

  const input = (email: string, inviteCode: string) => ({
    email,
    password: 'correct horse',
    displayName: 'Friend',
    inviteCode,
  });

  it('creates the user and profile with a DB invite, and consumes it', async () => {
    const admin = new FakeAuthAdmin();
    const { userId } = await signUp(
      { db: h.db, authAdmin: admin, inviteCodes: [] },
      input('a@b.co', 'ONE-USE'),
    );
    expect(admin.users.get(userId)?.email).toBe('a@b.co');
    expect((await profilesRepo(h.db).get(userId))?.displayName).toBe('Friend');
    expect((await invitesRepo(h.db).get('ONE-USE'))?.used).toBe(1);
  });

  it('rejects an exhausted or unknown invite without creating a user', async () => {
    const admin = new FakeAuthAdmin();
    for (const code of ['ONE-USE', 'NOPE']) {
      const err = await signUp(
        { db: h.db, authAdmin: admin, inviteCodes: [] },
        input(`${code}@b.co`, code),
      ).catch((e) => e);
      expect(err).toBeInstanceOf(ServiceError);
      expect(err.code).toBe('invalid_invite');
    }
    expect(admin.users.size).toBe(0);
  });

  it('accepts env INVITE_CODES (unlimited) case-insensitively', async () => {
    const admin = new FakeAuthAdmin();
    const deps = { db: h.db, authAdmin: admin, inviteCodes: ['FRIENDS'] };
    await signUp(deps, input('x@b.co', 'friends'));
    await signUp(deps, input('y@b.co', 'FRIENDS'));
    expect(admin.users.size).toBe(2);
  });

  it('maps a duplicate email to email_taken (409)', async () => {
    const admin = new FakeAuthAdmin();
    const deps = { db: h.db, authAdmin: admin, inviteCodes: ['FRIENDS'] };
    await signUp(deps, input('dup@b.co', 'FRIENDS'));
    const err = await signUp(deps, input('dup@b.co', 'FRIENDS')).catch((e) => e);
    expect(err).toMatchObject({ code: 'email_taken', status: 409 });
  });
});

describe('review fixes', () => {
  it('uses the HS256 secret even when a JWKS url is also configured (legacy projects)', async () => {
    const token = await mint({ sub: uid });
    await expect(
      authenticate(req({ authorization: `Bearer ${token}` }), {
        jwtSecret: secret,
        jwksUrl: 'https://never-called.invalid/jwks.json',
      }),
    ).resolves.toMatchObject({ userId: uid });
  });

  it('rejects tokens without exp', async () => {
    const t = await new SignJWT({ aud: 'authenticated', sub: uid })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode(secret));
    await expect(
      authenticate(req({ authorization: `Bearer ${t}` }), { jwtSecret: secret }),
    ).resolves.toBeNull();
  });
});

describe('signUp review fixes', () => {
  let h2: DbHandle;
  beforeAll(async () => {
    h2 = await createTestDb();
    await invitesRepo(h2.db).create({ code: 'MixedCase1', maxUses: 1 });
  });
  afterAll(() => h2.close());

  it('matches DB invite codes case-insensitively', async () => {
    const admin = new FakeAuthAdmin();
    await signUp(
      { db: h2.db, authAdmin: admin, inviteCodes: [] },
      {
        email: 'm@b.co',
        password: 'correct horse',
        inviteCode: 'mixedcase1',
      },
    );
    expect(admin.users.size).toBe(1);
  });

  it('still reports invalid_invite when rollback of a lost race fails', async () => {
    const admin = new FakeAuthAdmin();
    await invitesRepo(h2.db).create({ code: 'RACE', maxUses: 1 });
    // Simulate losing the race: someone else redeems after our check, and deleteUser fails.
    const orig = admin.createUser.bind(admin);
    admin.createUser = async (i) => {
      await invitesRepo(h2.db).redeem('RACE');
      return orig(i);
    };
    admin.deleteUser = async () => {
      throw new Error('supabase down');
    };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = await signUp(
      { db: h2.db, authAdmin: admin, inviteCodes: [] },
      {
        email: 'r@b.co',
        password: 'correct horse',
        inviteCode: 'RACE',
      },
    ).catch((e) => e);
    expect(err).toMatchObject({ code: 'invalid_invite' });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
