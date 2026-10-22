import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ServiceError } from './errors';
import { assertSameOrigin, parseBody, parseParams, parseQuery, route } from './http';

const body = (v: unknown) =>
  new Request('http://x/api', {
    method: 'POST',
    body: typeof v === 'string' ? v : JSON.stringify(v),
  });
const Schema = z.strictObject({ name: z.string().min(1), n: z.number().int().optional() });

describe('parseBody', () => {
  it('returns typed data', async () => {
    await expect(parseBody(body({ name: 'a', n: 2 }), Schema)).resolves.toEqual({
      name: 'a',
      n: 2,
    });
  });

  it('turns bad JSON and schema failures into 400 bad_request with the field path', async () => {
    await expect(parseBody(body('{oops'), Schema)).rejects.toMatchObject({
      code: 'bad_request',
      status: 400,
    });
    const err = await parseBody(body({ name: '', extra: 1 }), Schema).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.message).toMatch(/name|extra/);
  });
});

describe('parseParams / parseQuery', () => {
  it('validates awaited route params', async () => {
    const P = z.object({ id: z.uuid() });
    await expect(parseParams(Promise.resolve({ id: 'nope' }), P)).rejects.toMatchObject({
      code: 'not_found',
    });
    const id = '3f1c2a9e-8b7d-4c6e-9f00-1a2b3c4d5e6f';
    await expect(parseParams(Promise.resolve({ id }), P)).resolves.toEqual({ id });
  });

  it('validates query strings', () => {
    const Q = z.object({ fold: z.enum(['company', 'sector']).default('company') });
    expect(parseQuery(new Request('http://x/a'), Q)).toEqual({ fold: 'company' });
    expect(() => parseQuery(new Request('http://x/a?fold=planet'), Q)).toThrow(ServiceError);
  });
});

describe('route', () => {
  it('serialises plain return values as 200 JSON and passes Responses through', async () => {
    const r1 = await route(async () => ({ ok: true }))(body({}), {});
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ ok: true });
    const r2 = await route(async () => new Response(null, { status: 204 }))(body({}), {});
    expect(r2.status).toBe(204);
  });

  it('maps ServiceError to the error envelope', async () => {
    const r = await route(async () => {
      throw new ServiceError('not_found', 'Portfolio not found');
    })(body({}), {});
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({
      error: { code: 'not_found', message: 'Portfolio not found' },
    });
  });

  it('hides unexpected errors behind a 500 and logs them', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await route(async () => {
      throw new Error('db password is hunter2');
    })(body({}), {});
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('hunter2');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('assertSameOrigin (cookie-auth CSRF guard)', () => {
  const r = (method: string, headers: Record<string, string>) =>
    new Request('https://easyfi.app/api/v1/portfolios', { method, headers });

  it('allows reads, bearer-token calls and same-origin writes', () => {
    expect(() => assertSameOrigin(r('GET', {}))).not.toThrow();
    expect(() => assertSameOrigin(r('POST', { authorization: 'Bearer x' }))).not.toThrow();
    expect(() => assertSameOrigin(r('POST', { origin: 'https://easyfi.app' }))).not.toThrow();
  });

  it('rejects cross-origin or origin-less cookie writes with 403', () => {
    for (const h of [{ origin: 'https://evil.example' }, {}] as Record<string, string>[]) {
      expect(() => assertSameOrigin(r('DELETE', h))).toThrow(
        expect.objectContaining({ status: 403 }),
      );
    }
  });
});
