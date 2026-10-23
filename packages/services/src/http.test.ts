import { ErrorEnvelope, ExplorerStreamEvent } from '@easyfi/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_EMAIL, DEMO_PASSWORD, ensureDemoLogin } from './auth';
import { handleApiRequest, type ApiRuntime } from './http';
import { createTestServices, type TestServices } from './testing';

let t: TestServices;
let rt: ApiRuntime;
let cookie = '';

beforeAll(async () => {
  t = await createTestServices();
  await ensureDemoLogin(t.services.ctx);
  rt = { services: t.services, status: { driver: 'pglite', sources: {} } };
}, 60_000);
afterAll(() => t.close());

const BASE = 'http://localhost:3000/api/v1';

function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return handleApiRequest(
    new Request(`${BASE}${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    rt,
  );
}

describe('/api/v1', () => {
  it('serves the OpenAPI document publicly', async () => {
    const res = await call('GET', '/openapi.json');
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.paths['/portfolios/{id}/lookthrough']).toBeDefined();
  });

  it('requires auth, with the error envelope', async () => {
    const res = await call('GET', '/portfolios');
    expect(res.status).toBe(401);
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('unauthorized');
  });

  it('unknown route → 404, wrong method → 400', async () => {
    expect((await call('GET', '/nope')).status).toBe(404);
    expect((await call('PUT', '/me')).status).toBe(400);
  });

  it('sign-in sets an httpOnly session cookie that authenticates later calls', async () => {
    const bad = await call('POST', '/auth/sign-in', { email: DEMO_EMAIL, password: 'nope' });
    expect(bad.status).toBe(401);
    const res = await call('POST', '/auth/sign-in', { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/easyfi_at=.+; Path=\/; HttpOnly; SameSite=Lax/);
    cookie = setCookie.split(';')[0]!;
    const me = await call('GET', '/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ email: DEMO_EMAIL, authMode: 'demo' });
  });

  it('accepts a Bearer token too', async () => {
    const res = await call('POST', '/auth/sign-in', { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    const { accessToken } = (await res.json()) as { accessToken: string };
    const saved = cookie;
    cookie = '';
    const me = await call('GET', '/me', undefined, { authorization: `Bearer ${accessToken}` });
    cookie = saved;
    expect(me.status).toBe(200);
  });

  it('validates bodies (unknown fields rejected) and queries', async () => {
    const res = await call('POST', '/portfolios', { name: 'X', hacker: true });
    expect(res.status).toBe(400);
    const body = ErrorEnvelope.parse(await res.json());
    expect(body.error.details?.length).toBeGreaterThan(0);
    const pid = t.portfolioIds['Family Taxable']!;
    expect((await call('GET', `/portfolios/${pid}/lookthrough?fold=bogus`)).status).toBe(400);
  });

  it('CRUD round-trip through HTTP', async () => {
    const created = await call('POST', '/portfolios', { name: 'Via HTTP' });
    expect(created.status).toBe(201);
    const p = (await created.json()) as { id: string };
    const h = await call('POST', `/portfolios/${p.id}/holdings`, { ticker: 'VOO', shares: 2 });
    expect(h.status).toBe(201);
    const lt = await call('GET', `/portfolios/${p.id}/lookthrough?fold=sector`);
    expect(lt.status).toBe(200);
    expect(((await lt.json()) as { rows: unknown[] }).rows.length).toBeGreaterThan(3);
    expect((await call('DELETE', `/portfolios/${p.id}`)).status).toBe(200);
    expect((await call('GET', `/portfolios/${p.id}`)).status).toBe(404);
  });

  it('every GET view endpoint returns 200 for the demo user', async () => {
    const pid = t.portfolioIds['Family Taxable']!;
    for (const path of [
      '/home',
      '/portfolios',
      `/portfolios/${pid}`,
      `/portfolios/${pid}/holdings`,
      `/portfolios/${pid}/constellation`,
      `/portfolios/${pid}/value-series`,
      '/portfolios/all/value-series',
      '/compare?a=VOO&b=SCHD',
      '/dividends',
      '/inflation',
      '/securities/search?q=VO',
      '/securities/VOO',
      '/explorer/threads',
      '/alerts',
      '/goals',
      '/share-links',
      '/invites',
      '/status',
    ]) {
      const res = await call('GET', path);
      expect(res.status, path).toBe(200);
    }
  });

  it('streams explorer answers as NDJSON', async () => {
    const th = await call('POST', '/explorer/threads', {});
    const { id } = (await th.json()) as { id: string };
    const res = await call('POST', `/explorer/threads/${id}/messages`, {
      text: 'Which ETFs are heavy in NVDA?',
    });
    expect(res.headers.get('content-type')).toBe('application/x-ndjson');
    const events = (await res.text())
      .trim()
      .split('\n')
      .map((l) => ExplorerStreamEvent.parse(JSON.parse(l)));
    expect(events.at(-1)!.type).toBe('done');
    expect(events.some((e) => e.type === 'tool' && e.name === 'search_funds_holding')).toBe(true);
  });

  it('shared snapshots are public', async () => {
    const pid = t.portfolioIds['Growth / Tech Tilt']!;
    const link = (await (await call('POST', '/share-links', { portfolioId: pid })).json()) as {
      token: string;
    };
    const saved = cookie;
    cookie = '';
    const res = await call('GET', `/shared/${link.token}`);
    cookie = saved;
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ portfolioName: 'Growth / Tech Tilt' });
  });

  it('sign-out clears cookies', async () => {
    const res = await call('POST', '/auth/sign-out');
    expect(res.headers.get('set-cookie')).toMatch(/easyfi_at=; .*Max-Age=0/);
  });
});
