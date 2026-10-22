import { describe, expect, it } from 'vitest';
import { FakeAuthAdmin } from './fakes/auth-admin';
import { AuthAdminError, SupabaseAuthAdmin } from './supabase-auth';
import { fakeFetch, jsonResponse } from './testing';

const id = '7d3f0c1e-5b2a-4c8d-9e0f-112233445566';

describe('SupabaseAuthAdmin', () => {
  it('creates a confirmed user with the service role key', async () => {
    const fetch = fakeFetch(() => jsonResponse({ id, email: 'a@b.co' }));
    const admin = new SupabaseAuthAdmin({
      url: 'https://x.supabase.co/',
      serviceRoleKey: 'srk',
      fetch,
    });
    await expect(
      admin.createUser({ email: 'a@b.co', password: 'pw123456', displayName: 'A' }),
    ).resolves.toEqual({ id });

    const call = fetch.calls[0]!;
    expect(call.url).toBe('https://x.supabase.co/auth/v1/admin/users');
    expect(call.init?.method).toBe('POST');
    const h = new Headers(call.init?.headers);
    expect(h.get('authorization')).toBe('Bearer srk');
    expect(h.get('apikey')).toBe('srk');
    expect(JSON.parse(call.init!.body as string)).toEqual({
      email: 'a@b.co',
      password: 'pw123456',
      email_confirm: true,
      user_metadata: { display_name: 'A' },
    });
  });

  it('maps "already registered" to a typed email_taken error', async () => {
    const fetch = fakeFetch(() =>
      jsonResponse(
        {
          code: 422,
          error_code: 'email_exists',
          msg: 'A user with this email address has already been registered',
        },
        422,
      ),
    );
    const admin = new SupabaseAuthAdmin({
      url: 'https://x.supabase.co',
      serviceRoleKey: 'srk',
      fetch,
    });
    const err = await admin.createUser({ email: 'a@b.co', password: 'pw123456' }).catch((e) => e);
    expect(err).toBeInstanceOf(AuthAdminError);
    expect(err.code).toBe('email_taken');
  });

  it('deletes a user', async () => {
    const fetch = fakeFetch(() => jsonResponse({}));
    const admin = new SupabaseAuthAdmin({
      url: 'https://x.supabase.co',
      serviceRoleKey: 'srk',
      fetch,
    });
    await admin.deleteUser(id);
    expect(fetch.calls[0]!.url).toBe(`https://x.supabase.co/auth/v1/admin/users/${id}`);
    expect(fetch.calls[0]!.init?.method).toBe('DELETE');
  });
});

describe('FakeAuthAdmin', () => {
  it('creates unique users and rejects duplicate emails', async () => {
    const fake = new FakeAuthAdmin();
    const a = await fake.createUser({ email: 'A@b.co', password: 'pw123456' });
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(fake.createUser({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({
      code: 'email_taken',
    });
    await fake.deleteUser(a.id);
    expect(fake.users.size).toBe(0);
  });
});
