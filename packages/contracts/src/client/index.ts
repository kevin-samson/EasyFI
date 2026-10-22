import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema.gen';

export type { components, paths } from './schema.gen';

export interface ApiClientOptions {
  /** Origin + `/api/v1`, e.g. `https://easyfi.app/api/v1`; defaults to same-origin `/api/v1`. */
  baseUrl?: string;
  /** Flutter/scripts: return a Supabase access token. The web app relies on the session cookie. */
  getToken?: () => string | null | Promise<string | null>;
  fetch?: typeof globalThis.fetch;
}

/** Typed client for `/api/v1`; request/response types come from the zod contracts via OpenAPI. */
export function createApiClient(opts: ApiClientOptions = {}) {
  const client = createClient<paths>({
    baseUrl: opts.baseUrl ?? '/api/v1',
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
  if (opts.getToken) {
    const auth: Middleware = {
      async onRequest({ request }) {
        const token = await opts.getToken!();
        if (token) request.headers.set('authorization', `Bearer ${token}`);
        return request;
      },
    };
    client.use(auth);
  }
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
