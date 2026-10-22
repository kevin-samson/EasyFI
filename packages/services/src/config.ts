import { FakeAuthAdmin, SupabaseAuthAdmin, type AuthAdmin } from '@easyfi/data-sources';
import type { AuthConfig } from './auth';

export interface AuthEnv {
  NODE_ENV?: string | undefined;
  NEXT_PUBLIC_SUPABASE_URL?: string | undefined;
  SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
  SUPABASE_JWT_SECRET?: string | undefined;
  INVITE_CODES?: string | undefined;
  /** `1` enables local demo mode (no Supabase, single demo user). Refused in production. */
  EASYFI_DEMO?: string | undefined;
}

export interface AuthSetup {
  config: AuthConfig;
  authAdmin: AuthAdmin;
  inviteCodes: string[];
}

const val = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

/**
 * Supabase configured → real auth. Not configured → local demo mode (single demo user), which is
 * refused in production so a missing env var can never open the app to everyone.
 */
export function resolveAuthSetup(env: AuthEnv): AuthSetup {
  const url = val(env.NEXT_PUBLIC_SUPABASE_URL);
  const inviteCodes = (env.INVITE_CODES ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (!url) {
    // Explicit opt-in: a missing env var on any host (NODE_ENV unset, "staging"...) must not open the app.
    if (env.EASYFI_DEMO !== '1' || env.NODE_ENV === 'production') {
      throw new Error(
        'Auth not configured: set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or EASYFI_DEMO=1 for local demo mode',
      );
    }
    return { config: { demo: true }, authAdmin: new FakeAuthAdmin(), inviteCodes };
  }
  const serviceRoleKey = val(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!serviceRoleKey)
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required when Supabase is configured');
  return {
    config: {
      demo: false,
      jwtSecret: val(env.SUPABASE_JWT_SECRET),
      jwksUrl: `${url.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`,
    },
    authAdmin: new SupabaseAuthAdmin({ url, serviceRoleKey }),
    inviteCodes,
  };
}
