import { FakeAuthAdmin, SupabaseAuthAdmin } from '@easyfi/data-sources';
import { describe, expect, it } from 'vitest';
import { resolveAuthSetup } from './config';

describe('resolveAuthSetup', () => {
  it('uses demo mode only outside production when Supabase is not configured', () => {
    const s = resolveAuthSetup({ NODE_ENV: 'development', EASYFI_DEMO: '1' });
    expect(s.config.demo).toBe(true);
    expect(s.authAdmin).toBeInstanceOf(FakeAuthAdmin);
  });

  it('fails closed in production without auth config', () => {
    expect(() => resolveAuthSetup({ NODE_ENV: 'production' })).toThrow(/SUPABASE/);
  });

  it('configures JWKS + admin client from Supabase env', () => {
    const s = resolveAuthSetup({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co/',
      SUPABASE_SERVICE_ROLE_KEY: 'srk',
      SUPABASE_JWT_SECRET: 'sek',
      INVITE_CODES: ' FRIENDS , family,, ',
    });
    expect(s.config).toEqual({
      demo: false,
      jwtSecret: 'sek',
      jwksUrl: 'https://abc.supabase.co/auth/v1/.well-known/jwks.json',
    });
    expect(s.authAdmin).toBeInstanceOf(SupabaseAuthAdmin);
    expect(s.inviteCodes).toEqual(['FRIENDS', 'family']);
  });

  it('refuses a half-configured Supabase (URL without service role key)', () => {
    expect(() =>
      resolveAuthSetup({
        NODE_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
      }),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe('demo mode needs an explicit opt-in', () => {
  it('refuses to start without Supabase unless EASYFI_DEMO=1, whatever NODE_ENV says', () => {
    for (const NODE_ENV of [undefined, 'development', 'staging']) {
      expect(() => resolveAuthSetup({ NODE_ENV })).toThrow(/EASYFI_DEMO/);
    }
    expect(resolveAuthSetup({ NODE_ENV: 'development', EASYFI_DEMO: '1' }).config.demo).toBe(true);
    expect(() => resolveAuthSetup({ NODE_ENV: 'production', EASYFI_DEMO: '1' })).toThrow();
  });
});
