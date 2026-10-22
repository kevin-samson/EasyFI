import type { z } from 'zod';
import { ServiceError } from './errors';

function issueMessage(error: z.ZodError): string {
  const i = error.issues[0];
  if (!i) return 'Invalid input';
  const at = i.path.length ? `${i.path.join('.')}: ` : '';
  return `${at}${i.message}`;
}

/** JSON body → schema-typed value, or a 400 `bad_request` ServiceError. */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ServiceError('bad_request', 'Body must be valid JSON.');
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new ServiceError('bad_request', issueMessage(r.error));
  return r.data;
}

/** Next 16 passes route params as a Promise. Malformed ids are a 404, not a 400 (no id probing). */
export async function parseParams<S extends z.ZodType>(
  params: Promise<unknown> | unknown,
  schema: S,
): Promise<z.output<S>> {
  const r = schema.safeParse(await params);
  if (!r.success) throw new ServiceError('not_found', 'Not found.');
  return r.data;
}

export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.output<S> {
  const r = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!r.success) throw new ServiceError('bad_request', issueMessage(r.error));
  return r.data;
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ServiceError) {
    return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status });
  }
  console.error('[api] unhandled error', e);
  return Response.json(
    { error: { code: 'internal', message: 'Something went wrong.' } },
    { status: 500 },
  );
}

/**
 * Wraps a route handler: returned values become 200 JSON (return a Response for other statuses),
 * thrown ServiceErrors become the `{ error: { code, message } }` envelope, anything else a 500.
 */
export function route<C>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : Response.json(out);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/**
 * CSRF guard for cookie-authenticated writes: the browser always sends `Origin` on
 * POST/PATCH/DELETE, so a missing or foreign Origin is refused. Bearer-token clients (Flutter) and
 * reads are unaffected.
 */
export function assertSameOrigin(req: Request): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.headers.get('authorization')) return;
  if (req.headers.get('origin') !== new URL(req.url).origin) {
    throw new ServiceError('forbidden', 'Cross-origin request refused.');
  }
}
