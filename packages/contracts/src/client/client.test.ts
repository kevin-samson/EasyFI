import { describe, expect, it } from 'vitest';
import { generateClientTypes } from './generate';
import { createApiClient } from './index';

describe('generated client types', () => {
  it('are up to date with the zod contracts (run `pnpm --filter @easyfi/contracts gen:client`)', async () => {
    await expect(await generateClientTypes()).toMatchFileSnapshot('./schema.gen.ts');
  }, 20_000);
});

describe('createApiClient', () => {
  it('calls typed paths with params and the bearer token', async () => {
    const seen: Request[] = [];
    const fetch = async (input: Request | string | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      seen.push(req);
      return Response.json({
        id: '3f1c2a9e-8b7d-4c6e-9f00-1a2b3c4d5e6f',
        name: 'Main',
        type: 'actual',
        createdAt: '2026-10-22T00:00:00.000Z',
        cash: 0,
      });
    };
    const api = createApiClient({ baseUrl: 'https://e.test/api/v1', getToken: () => 'tok', fetch });
    const { data, error } = await api.GET('/portfolios/{id}', {
      params: { path: { id: '3f1c2a9e-8b7d-4c6e-9f00-1a2b3c4d5e6f' } },
    });
    expect(error).toBeUndefined();
    expect(data?.name).toBe('Main');
    expect(seen[0]!.url).toBe(
      'https://e.test/api/v1/portfolios/3f1c2a9e-8b7d-4c6e-9f00-1a2b3c4d5e6f',
    );
    expect(seen[0]!.headers.get('authorization')).toBe('Bearer tok');
  });

  it('surfaces the error envelope on failures', async () => {
    const fetch = async () =>
      Response.json(
        { error: { code: 'not_found', message: 'Portfolio not found.' } },
        { status: 404 },
      );
    const api = createApiClient({ baseUrl: 'https://e.test/api/v1', fetch });
    const { data, error, response } = await api.GET('/portfolios/{id}', {
      params: { path: { id: '3f1c2a9e-8b7d-4c6e-9f00-1a2b3c4d5e6f' } },
    });
    expect(data).toBeUndefined();
    expect(response.status).toBe(404);
    expect(error?.error.code).toBe('not_found');
  });
});
