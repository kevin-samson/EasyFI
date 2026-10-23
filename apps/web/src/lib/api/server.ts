import 'server-only';
import {
  DEMO_EMAIL,
  DEMO_INVITE_CODE,
  DEMO_PASSWORD,
  getRuntime,
  handleApiRequest,
} from '@easyfi/services';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import createClient from 'openapi-fetch';
import { cache } from 'react';
import { ApiError, unwrap } from './errors';
import type { paths } from './schema';

const INTERNAL_BASE = 'http://easyfi.internal/api/v1';

/**
 * Server-component client for /api/v1. Requests are dispatched in-process to the same handler
 * the HTTP route uses (same validation, auth and contracts), forwarding the caller's cookies.
 */
export const serverApi = cache(async () => {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');
  const runtime = await getRuntime();
  return createClient<paths>({
    baseUrl: INTERNAL_BASE,
    fetch: async (req: Request) => {
      const headers = new Headers(req.headers);
      if (cookieHeader) headers.set('cookie', cookieHeader);
      return handleApiRequest(new Request(req, { headers }), runtime);
    },
  });
});

/** unwrap, but a 401 sends the user to sign in and a 404 renders not-found. */
export async function load<T>(
  p: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  try {
    return unwrap(await p);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect('/sign-in');
    throw e;
  }
}

export { ApiError, unwrap };

/** Demo-mode login hints for the auth pages (null when Supabase Auth is configured). */
export async function demoLogin() {
  const runtime = await getRuntime();
  return runtime.mode.auth === 'demo'
    ? { email: DEMO_EMAIL, password: DEMO_PASSWORD, inviteCode: DEMO_INVITE_CODE }
    : null;
}
