import { AuthAdminError, type AuthAdmin } from '@easyfi/data-sources';
import { invitesRepo, profilesRepo, type Db } from '@easyfi/db';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { ServiceError } from './errors';

/** Fixed user for local demo mode (no Supabase configured). */
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';

export interface AuthConfig {
  /** Legacy Supabase HS256 JWT secret. */
  jwtSecret?: string | undefined;
  /** Supabase asymmetric signing keys: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. */
  jwksUrl?: string | undefined;
  /** Local demo only: every request is the demo user. Never enable in production. */
  demo?: boolean;
}

export interface AuthUser {
  userId: string;
  email: string | null;
}

export interface RequestLike {
  headers: { get(name: string): string | null };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SB_COOKIE = /^sb-.+-auth-token(?:\.(\d+))?$/;

function parseCookies(header: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return out;
}

/** Bearer header (Flutter) first, then the Supabase SSR session cookie (web; may be chunked). */
export function accessTokenFromRequest(req: RequestLike): string | null {
  const auth = req.headers.get('authorization');
  if (auth) {
    const m = /^Bearer\s+(\S+)$/i.exec(auth);
    return m ? m[1]! : null;
  }
  const cookie = req.headers.get('cookie');
  if (!cookie) return null;
  const chunks: [number, string][] = [];
  for (const [name, value] of parseCookies(cookie)) {
    const m = SB_COOKIE.exec(name);
    if (m) chunks.push([m[1] === undefined ? -1 : Number(m[1]), value]);
  }
  if (chunks.length === 0) return null;
  try {
    let raw = decodeURIComponent(
      chunks
        .sort((a, b) => a[0] - b[0])
        .map((c) => c[1])
        .join(''),
    );
    if (raw.startsWith('base64-')) raw = Buffer.from(raw.slice(7), 'base64url').toString('utf8');
    const session = JSON.parse(raw) as { access_token?: unknown } | unknown[];
    const token = Array.isArray(session) ? session[0] : session.access_token;
    return typeof token === 'string' ? token : null;
  } catch {
    return null;
  }
}

const jwksCache = new Map<string, JWTVerifyGetKey>();

/** Returns the signed-in user, or null (missing/invalid/expired token). */
export async function authenticate(req: RequestLike, cfg: AuthConfig): Promise<AuthUser | null> {
  if (cfg.demo) return { userId: DEMO_USER_ID, email: 'demo@easyfi.local' };
  const token = accessTokenFromRequest(req);
  if (!token) return null;
  try {
    const opts = {
      audience: 'authenticated',
      algorithms: ['HS256', 'RS256', 'ES256'],
      requiredClaims: ['exp', 'sub'],
    };
    // Legacy projects sign HS256 with the shared secret; newer ones use asymmetric keys (JWKS).
    const alg = decodeProtectedHeader(token).alg;
    let payload;
    if (alg === 'HS256') {
      if (!cfg.jwtSecret) return null;
      ({ payload } = await jwtVerify(token, new TextEncoder().encode(cfg.jwtSecret), opts));
    } else if (cfg.jwksUrl) {
      let keys = jwksCache.get(cfg.jwksUrl);
      if (!keys) jwksCache.set(cfg.jwksUrl, (keys = createRemoteJWKSet(new URL(cfg.jwksUrl))));
      ({ payload } = await jwtVerify(token, keys, opts));
    } else {
      return null;
    }
    if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) return null;
    return { userId: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
  } catch {
    return null;
  }
}

export interface SignUpDeps {
  db: Db;
  authAdmin: AuthAdmin;
  /** INVITE_CODES env: unlimited-use codes. */
  inviteCodes: readonly string[];
}

export interface SignUpInput {
  email: string;
  password: string;
  displayName?: string | null | undefined;
  inviteCode: string;
}

/** Invite-gated sign-up: check invite → create auth user → consume invite → create profile. */
export async function signUp(deps: SignUpDeps, input: SignUpInput): Promise<{ userId: string }> {
  const code = input.inviteCode.trim();
  const envCode = deps.inviteCodes.some((c) => c.trim().toUpperCase() === code.toUpperCase());
  const invites = invitesRepo(deps.db);
  if (!envCode) {
    const inv = await invites.get(code);
    if (!inv || inv.used >= inv.maxUses) {
      throw new ServiceError(
        'invalid_invite',
        'That invite code is not valid or has been used up.',
      );
    }
  }

  let userId: string;
  try {
    ({ id: userId } = await deps.authAdmin.createUser({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      displayName: input.displayName ?? null,
    }));
  } catch (e) {
    if (e instanceof AuthAdminError && e.code === 'email_taken') {
      throw new ServiceError('email_taken', 'An account with that email already exists.');
    }
    if (e instanceof AuthAdminError && e.code === 'weak_password') {
      throw new ServiceError('bad_request', 'Password is too weak.');
    }
    throw new ServiceError('upstream', 'Could not create the account. Try again.');
  }

  // Consume after creation; a lost race (last use taken meanwhile) rolls the user back.
  if (!envCode && !(await invites.redeem(code))) {
    try {
      await deps.authAdmin.deleteUser(userId);
    } catch (e) {
      // The orphaned auth user has no profile; flag it for manual cleanup rather than 500.
      console.error('[signUp] rollback failed; delete auth user manually', userId, e);
    }
    throw new ServiceError('invalid_invite', 'That invite code is not valid or has been used up.');
  }
  await profilesRepo(deps.db).upsert(userId, { displayName: input.displayName ?? null });
  return { userId };
}
