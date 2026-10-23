import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Me, Session, SignInBody, SignUpBody, UpdateMeBody } from '@easyfi/contracts';
import type { FetchLike } from '@easyfi/data-sources';
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from 'jose';
import type { Ctx } from './context';
import { DEMO_INVITE_CODE, DEMO_USER_ID } from './demo';
import { ServiceError } from './errors';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export interface AuthUser {
  userId: string;
  email: string | null;
}

export interface AuthTokens {
  userId: string;
  email: string | null;
  accessToken: string;
  refreshToken: string | null;
  /** Unix seconds. */
  expiresAt: number | null;
}

/** Credential + token backend: Supabase Auth in production, a local store in demo mode. */
export interface AuthBackend {
  mode: 'supabase' | 'demo';
  createUser(input: {
    email: string;
    password: string;
    displayName?: string | undefined;
  }): Promise<AuthUser>;
  signIn(email: string, password: string): Promise<AuthTokens>;
  refresh(refreshToken: string): Promise<AuthTokens>;
  verify(accessToken: string): Promise<AuthUser | null>;
}

const invalid = () => new ServiceError('unauthorized', 'Invalid email or password');

// ---------------------------------------------------------------- demo (local) backend

const DEMO_TTL_SECONDS = 60 * 60 * 24 * 30;
export const DEMO_EMAIL = 'demo@easyfi.local';
export const DEMO_PASSWORD = 'easyfi-demo';

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [, salt, key] = stored.split('$');
  if (!salt || !key) return false;
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), 32);
  const expected = Buffer.from(key, 'base64url');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Deterministic uuid-shaped id for a demo email (v4 layout, not random — demo only). */
function demoUserId(email: string): string {
  const h = createHash('sha256').update(email.toLowerCase()).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function demoAuthBackend(ctx: Ctx, secret: string): AuthBackend {
  const key = new TextEncoder().encode(secret);
  const issue = async (user: AuthUser): Promise<AuthTokens> => {
    const exp = Math.floor(ctx.now().getTime() / 1000) + DEMO_TTL_SECONDS;
    const accessToken = await new SignJWT({ email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.userId)
      .setIssuer('easyfi-demo')
      .setExpirationTime(exp)
      .sign(key);
    return { ...user, accessToken, refreshToken: null, expiresAt: exp };
  };

  return {
    mode: 'demo',
    async createUser({ email, password }) {
      const userId = email.toLowerCase() === DEMO_EMAIL ? DEMO_USER_ID : demoUserId(email);
      const ok = await ctx.repos.credentials.create({
        email,
        userId,
        passwordHash: await hashPassword(password),
      });
      if (!ok) throw new ServiceError('conflict', 'An account with this email already exists');
      return { userId, email: email.toLowerCase() };
    },
    async signIn(email, password) {
      const cred = await ctx.repos.credentials.get(email);
      if (!cred || !(await checkPassword(password, cred.passwordHash))) throw invalid();
      return issue({ userId: cred.userId, email: cred.email });
    },
    async refresh() {
      throw new ServiceError('unauthorized', 'Session expired');
    },
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: 'easyfi-demo',
          currentDate: ctx.now(),
        });
        return payload.sub
          ? { userId: payload.sub, email: (payload.email as string) ?? null }
          : null;
      } catch {
        return null;
      }
    },
  };
}

/** Ensures the demo login (demo@easyfi.local / easyfi-demo) exists. */
export async function ensureDemoLogin(ctx: Ctx): Promise<void> {
  if (await ctx.repos.credentials.get(DEMO_EMAIL)) return;
  await ctx.repos.credentials.create({
    email: DEMO_EMAIL,
    userId: DEMO_USER_ID,
    passwordHash: await hashPassword(DEMO_PASSWORD),
  });
  await ctx.repos.profiles.upsert(DEMO_USER_ID, {
    email: DEMO_EMAIL,
    displayName: 'Demo investor',
  });
}

// ---------------------------------------------------------------- Supabase backend

export interface SupabaseAuthConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  /** Legacy HS256 JWT secret; when absent the project's JWKS is used. */
  jwtSecret?: string | undefined;
  fetch?: FetchLike;
}

interface SupabaseTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  user: { id: string; email?: string };
}

export function supabaseAuthBackend(ctx: Ctx, cfg: SupabaseAuthConfig): AuthBackend {
  const base = cfg.url.replace(/\/$/, '');
  const doFetch: FetchLike = cfg.fetch ?? ((input, init) => fetch(input, init));
  const secret = cfg.jwtSecret ? new TextEncoder().encode(cfg.jwtSecret) : null;
  let jwks: JWTVerifyGetKey | null = null;

  async function post<T>(
    path: string,
    body: unknown,
    key: string,
  ): Promise<{ status: number; data: T }> {
    const res = await doFetch(`${base}${path}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, data };
  }

  const toTokens = (d: SupabaseTokenResponse): AuthTokens => ({
    userId: d.user.id,
    email: d.user.email ?? null,
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresAt:
      d.expires_at ?? (d.expires_in ? Math.floor(ctx.now().getTime() / 1000) + d.expires_in : null),
  });

  return {
    mode: 'supabase',
    async createUser({ email, password, displayName }) {
      const { status, data } = await post<{
        id?: string;
        email?: string;
        msg?: string;
        message?: string;
      }>(
        '/auth/v1/admin/users',
        {
          email,
          password,
          email_confirm: true,
          user_metadata: displayName ? { display_name: displayName } : {},
        },
        cfg.serviceRoleKey,
      );
      if (status === 422 || status === 409)
        throw new ServiceError('conflict', 'An account with this email already exists');
      if (status >= 400 || !data.id)
        throw new ServiceError('unavailable', data.msg ?? data.message ?? 'Sign-up failed');
      return { userId: data.id, email: data.email ?? email };
    },
    async signIn(email, password) {
      const { status, data } = await post<SupabaseTokenResponse>(
        '/auth/v1/token?grant_type=password',
        { email, password },
        cfg.anonKey,
      );
      if (status === 400 || status === 401) throw invalid();
      if (status >= 400) throw new ServiceError('unavailable', 'Sign-in failed');
      return toTokens(data);
    },
    async refresh(refreshToken) {
      const { status, data } = await post<SupabaseTokenResponse>(
        '/auth/v1/token?grant_type=refresh_token',
        { refresh_token: refreshToken },
        cfg.anonKey,
      );
      if (status >= 400) throw new ServiceError('unauthorized', 'Session expired');
      return toTokens(data);
    },
    async verify(token) {
      try {
        const opts = { audience: 'authenticated', currentDate: ctx.now() };
        const { payload } = secret
          ? await jwtVerify(token, secret, opts)
          : await jwtVerify(
              token,
              (jwks ??= createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`))),
              opts,
            );
        return payload.sub
          ? { userId: payload.sub, email: (payload.email as string) ?? null }
          : null;
      } catch {
        return null;
      }
    },
  };
}

// ---------------------------------------------------------------- use-cases

export interface AuthOptions {
  /** Codes accepted at sign-up in addition to the invites table (env INVITE_CODES). */
  inviteCodes?: readonly string[];
}

export function authService(ctx: Ctx, backend: AuthBackend, options: AuthOptions = {}) {
  const envCodes = new Set(
    (options.inviteCodes ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean),
  );
  if (backend.mode === 'demo') envCodes.add(DEMO_INVITE_CODE);

  const session = (t: AuthTokens): Session => ({
    userId: t.userId,
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    expiresAt: t.expiresAt,
  });

  return {
    mode: backend.mode,

    async signUp(body: SignUpBody): Promise<Session & { tokens: AuthTokens }> {
      const code = body.inviteCode.trim().toUpperCase();
      const valid = envCodes.has(code) || (await ctx.repos.invites.redeem(code));
      if (!valid)
        throw new ServiceError('forbidden', 'That invite code is not valid or has been used up');
      const user = await backend.createUser({
        email: body.email,
        password: body.password,
        displayName: body.displayName,
      });
      await ctx.repos.profiles.upsert(user.userId, {
        email: user.email,
        displayName: body.displayName ?? body.email.split('@')[0]!,
      });
      const tokens = await backend.signIn(body.email, body.password);
      return { ...session(tokens), tokens };
    },

    async signIn(body: SignInBody): Promise<Session & { tokens: AuthTokens }> {
      const tokens = await backend.signIn(body.email, body.password);
      await ctx.repos.profiles.upsert(tokens.userId, tokens.email ? { email: tokens.email } : {});
      return { ...session(tokens), tokens };
    },

    async refresh(refreshToken: string): Promise<AuthTokens> {
      return backend.refresh(refreshToken);
    },

    /** Resolves a bearer / cookie token to a user, or null. */
    verify(token: string): Promise<AuthUser | null> {
      return backend.verify(token);
    },
  };
}

export type AuthService = ReturnType<typeof authService>;

export function meService(ctx: Ctx, mode: 'supabase' | 'demo') {
  async function get(userId: string, email: string | null = null): Promise<Me> {
    const p =
      (await ctx.repos.profiles.get(userId)) ??
      (await ctx.repos.profiles.upsert(userId, email ? { email } : {}));
    const used = await ctx.repos.explorer.getUsage(userId, ctx.today());
    const theme = p.theme === 'light' || p.theme === 'system' ? p.theme : 'dark';
    return {
      id: p.id,
      email: p.email ?? email,
      displayName: p.displayName ?? (p.email ?? email ?? 'Investor').split('@')[0]!,
      baseCurrency: 'USD',
      theme,
      isAdmin: mode === 'demo' || ctx.config.adminUserIds.includes(userId),
      authMode: mode,
      explorer: { usedToday: used, dailyLimit: ctx.config.explorerDailyLimit },
    };
  }
  return {
    get,
    async update(userId: string, body: UpdateMeBody): Promise<Me> {
      await ctx.repos.profiles.upsert(userId, {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.theme !== undefined ? { theme: body.theme } : {}),
      });
      return get(userId);
    },
  };
}
