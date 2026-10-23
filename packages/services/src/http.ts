// Framework-agnostic /api/v1 handler (web-standard Request → Response). The Next.js route is a
// one-line adapter around `handleApiRequest`; contract tests call it directly.
import {
  API_BASE,
  buildOpenApiDocument,
  endpoints,
  type EndpointDef,
  type EndpointName,
  type ErrorCode,
  type ErrorEnvelope,
  type ExplorerStreamEvent,
} from '@easyfi/contracts';
import type { ZodError } from 'zod';
import type { AuthTokens, AuthUser } from './auth';
import { isServiceError } from './errors';
import type { Services } from './index';
import type { StatusExtras } from './settings';

export const ACCESS_COOKIE = 'easyfi_at';
export const REFRESH_COOKIE = 'easyfi_rt';

export interface ApiRuntime {
  services: Services;
  status: StatusExtras;
  /** Uploads a feedback screenshot; returns its storage path. */
  storeScreenshot?: (bytes: Uint8Array, contentType: string) => Promise<string | null>;
  /** Called with alert messages after /alerts/check (e.g. email delivery). */
  onError?: (err: unknown, req: Request) => void;
}

interface Call {
  user: AuthUser;
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: unknown;
  rt: ApiRuntime;
  emit: (e: ExplorerStreamEvent) => void;
}

type Handler = (c: Call) => Promise<unknown> | unknown;

const s = (rt: ApiRuntime) => rt.services;

const handlers: Record<Exclude<EndpointName, 'signUp' | 'signIn' | 'signOut'>, Handler> = {
  getMe: (c) => s(c.rt).me.get(c.user.userId, c.user.email),
  updateMe: (c) => s(c.rt).me.update(c.user.userId, c.body as never),

  listPortfolios: (c) => s(c.rt).portfolios.list(c.user.userId),
  createPortfolio: (c) => s(c.rt).portfolios.create(c.user.userId, c.body as never),
  getPortfolio: (c) => s(c.rt).portfolios.detail(c.user.userId, c.params.id!),
  updatePortfolio: (c) => s(c.rt).portfolios.update(c.user.userId, c.params.id!, c.body as never),
  deletePortfolio: (c) => s(c.rt).portfolios.remove(c.user.userId, c.params.id!),
  getLookThrough: (c) =>
    s(c.rt).portfolios.lookThrough(c.user.userId, c.params.id!, c.query.fold as never),
  getConstellation: (c) => s(c.rt).portfolios.constellation(c.user.userId, c.params.id!),
  getValueSeries: (c) => s(c.rt).portfolios.valueSeries(c.user.userId, c.params.id!),

  listHoldings: (c) => s(c.rt).holdings.list(c.user.userId, c.params.id!),
  createHolding: (c) => s(c.rt).holdings.create(c.user.userId, c.params.id!, c.body as never),
  bulkHoldings: (c) => s(c.rt).holdings.bulk(c.user.userId, c.params.id!, c.body as never),
  importHoldings: (c) => s(c.rt).holdings.importCsv(c.user.userId, c.params.id!, c.body as never),
  updateHolding: (c) => s(c.rt).holdings.update(c.user.userId, c.params.id!, c.body as never),
  deleteHolding: (c) => s(c.rt).holdings.remove(c.user.userId, c.params.id!),

  getHome: (c) => s(c.rt).home.get(c.user.userId),
  compare: (c) => s(c.rt).compare.compare(c.user.userId, String(c.query.a), String(c.query.b)),
  getDividends: (c) => s(c.rt).income.dividends(c.user.userId, String(c.query.portfolio)),
  getInflation: (c) => s(c.rt).income.inflation(c.user.userId),
  purchasingPower: (c) => s(c.rt).income.purchasingPower(c.body as never),
  whatIf: (c) => s(c.rt).whatIf.run(c.user.userId, c.body as never),

  searchSecurities: (c) => s(c.rt).securities.search(String(c.query.q), Number(c.query.limit)),
  getSecurity: (c) => s(c.rt).securities.get(c.params.ticker!),

  listThreads: (c) => s(c.rt).explorer.list(c.user.userId),
  createThread: (c) => s(c.rt).explorer.create(c.user.userId, (c.body as { title?: string }).title),
  getThread: (c) => s(c.rt).explorer.get(c.user.userId, c.params.id!),
  deleteThread: (c) => s(c.rt).explorer.remove(c.user.userId, c.params.id!),
  postMessage: (c) =>
    s(c.rt).explorer.ask(c.user.userId, c.params.id!, (c.body as { text: string }).text, c.emit),

  listInvites: async (c) =>
    s(c.rt).settings.listInvites(c.user.userId, (await s(c.rt).me.get(c.user.userId)).isAdmin),
  createInvite: async (c) =>
    s(c.rt).settings.createInvite(
      c.user.userId,
      (await s(c.rt).me.get(c.user.userId)).isAdmin,
      (c.body as { maxUses?: number }).maxUses,
    ),
  listShareLinks: (c) => s(c.rt).settings.listShareLinks(c.user.userId),
  createShareLink: (c) =>
    s(c.rt).settings.createShareLink(
      c.user.userId,
      (c.body as { portfolioId: string }).portfolioId,
    ),
  revokeShareLink: (c) => s(c.rt).settings.revokeShareLink(c.user.userId, c.params.token!),
  getSharedSnapshot: (c) => s(c.rt).settings.sharedSnapshot(c.params.token!),
  listAlerts: (c) => s(c.rt).settings.listAlerts(c.user.userId),
  upsertAlert: (c) => s(c.rt).settings.upsertAlert(c.user.userId, c.body as never),
  checkAlerts: (c) => s(c.rt).settings.checkAlerts(c.user.userId),
  listGoals: (c) => s(c.rt).settings.listGoals(c.user.userId),
  createGoal: (c) => s(c.rt).settings.createGoal(c.user.userId, c.body as never),
  updateGoal: (c) => s(c.rt).settings.updateGoal(c.user.userId, c.params.id!, c.body as never),
  deleteGoal: (c) => s(c.rt).settings.deleteGoal(c.user.userId, c.params.id!),
  sendFeedback: (c) =>
    s(c.rt).settings.sendFeedback(c.user.userId, c.body as never, c.rt.storeScreenshot),
  getStatus: (c) => s(c.rt).settings.status(c.rt.status),
};

// ---------------------------------------------------------------- routing

interface Route {
  name: EndpointName;
  def: EndpointDef;
  regex: RegExp;
  keys: string[];
}

const routes: Route[] = (Object.entries(endpoints) as [EndpointName, EndpointDef][])
  .map(([name, def]) => {
    const keys: string[] = [];
    const pattern = def.path.replace(/:(\w+)/g, (_, k: string) => {
      keys.push(k);
      return '([^/]+)';
    });
    return { name, def, keys, regex: new RegExp(`^${pattern}$`) };
  })
  // static segments win over params (/securities/search before /securities/:ticker)
  .sort((a, b) => a.keys.length - b.keys.length);

function match(
  method: string,
  path: string,
): { route: Route; params: Record<string, string> } | 'method' | null {
  let pathMatched = false;
  for (const route of routes) {
    const m = route.regex.exec(path);
    if (!m) continue;
    pathMatched = true;
    if (route.def.method !== method) continue;
    const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
    return { route, params };
  }
  return pathMatched ? 'method' : null;
}

// ---------------------------------------------------------------- responses

const SECURITY_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...SECURITY_HEADERS, ...headers },
  });
}

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  unavailable: 503,
  internal: 500,
};

function error(code: ErrorCode, message: string, details?: ErrorEnvelope['error']['details']) {
  const body: ErrorEnvelope = { error: { code, message, ...(details ? { details } : {}) } };
  return json(body, STATUS[code]);
}

function zodError(err: ZodError, where: string) {
  return error(
    'bad_request',
    `Invalid ${where}`,
    err.issues.map((i) => ({ path: i.path.join('.') || where, message: i.message })),
  );
}

// ---------------------------------------------------------------- cookies

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function cookie(req: Request, name: string, value: string, maxAge: number): string {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function sessionCookies(req: Request, t: AuthTokens, now: Date): string[] {
  const ttl = t.expiresAt ? Math.max(60, t.expiresAt - Math.floor(now.getTime() / 1000)) : 3600;
  const out = [cookie(req, ACCESS_COOKIE, t.accessToken, ttl)];
  if (t.refreshToken) out.push(cookie(req, REFRESH_COOKIE, t.refreshToken, 60 * 60 * 24 * 30));
  return out;
}

function withCookies(res: Response, cookies: string[]): Response {
  for (const c of cookies) res.headers.append('set-cookie', c);
  return res;
}

/** Resolve the caller from Bearer header or session cookie (refreshing when possible). */
export async function authenticate(
  req: Request,
  services: Services,
): Promise<{ user: AuthUser; setCookies: string[] } | null> {
  const header = req.headers.get('authorization');
  const bearer = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
  const token = bearer ?? readCookie(req, ACCESS_COOKIE);
  if (token) {
    const user = await services.auth.verify(token);
    if (user) return { user, setCookies: [] };
  }
  const refresh = bearer ? null : readCookie(req, REFRESH_COOKIE);
  if (!refresh) return null;
  try {
    const t = await services.auth.refresh(refresh);
    return {
      user: { userId: t.userId, email: t.email },
      setCookies: sessionCookies(req, t, services.ctx.now()),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- entry point

export async function handleApiRequest(req: Request, rt: ApiRuntime): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.startsWith(API_BASE)
    ? url.pathname.slice(API_BASE.length) || '/'
    : url.pathname;
  const method = req.method.toLowerCase();

  if (path === '/openapi.json' && method === 'get') return json(buildOpenApiDocument());

  const found = match(method, path.replace(/\/$/, '') || '/');
  if (found === null) return error('not_found', `No route ${req.method} ${path}`);
  if (found === 'method')
    return error('bad_request', `Method ${req.method} not allowed on ${path}`);
  const { route, params: rawParams } = found;
  const def = route.def;

  try {
    // ---- input
    const params = def.params
      ? def.params.safeParse(rawParams)
      : { success: true as const, data: {} };
    if (!params.success) return zodError(params.error, 'path');
    const query = def.query
      ? def.query.safeParse(Object.fromEntries(url.searchParams))
      : { success: true as const, data: {} };
    if (!query.success) return zodError(query.error, 'query');
    let body: unknown = {};
    if (def.body) {
      let raw: unknown = {};
      const text = await req.text();
      if (text) {
        try {
          raw = JSON.parse(text);
        } catch {
          return error('bad_request', 'Body is not valid JSON');
        }
      }
      const parsed = def.body.safeParse(raw);
      if (!parsed.success) return zodError(parsed.error, 'body');
      body = parsed.data;
    }

    // ---- auth endpoints (cookies)
    const services = rt.services;
    if (route.name === 'signUp' || route.name === 'signIn') {
      const r =
        route.name === 'signUp'
          ? await services.auth.signUp(body as never)
          : await services.auth.signIn(body as never);
      const { tokens, ...session } = r;
      return withCookies(
        json(def.response.parse(session), def.status ?? 200),
        sessionCookies(req, tokens, services.ctx.now()),
      );
    }
    if (route.name === 'signOut') {
      return withCookies(json({ ok: true }), [
        cookie(req, ACCESS_COOKIE, '', 0),
        cookie(req, REFRESH_COOKIE, '', 0),
      ]);
    }

    let user: AuthUser = { userId: '', email: null };
    let setCookies: string[] = [];
    if (def.auth !== false) {
      const auth = await authenticate(req, services);
      if (!auth) return error('unauthorized', 'Sign in required');
      ({ user, setCookies } = auth);
    }

    const handler = handlers[route.name as keyof typeof handlers];
    const call: Call = {
      user,
      params: params.data as Record<string, string>,
      query: query.data as Record<string, unknown>,
      body,
      rt,
      emit: () => {},
    };

    if (def.stream) return withCookies(streamResponse(call, handler, rt, req), setCookies);

    const result = await handler(call);
    const out = def.response.safeParse(result);
    if (!out.success) {
      rt.onError?.(out.error, req);
      return error('internal', 'Response failed contract validation');
    }
    return withCookies(json(out.data, def.status ?? 200), setCookies);
  } catch (e) {
    return toErrorResponse(e, rt, req);
  }
}

function toErrorResponse(e: unknown, rt: ApiRuntime, req: Request): Response {
  if (isServiceError(e)) return error(e.code, e.message);
  rt.onError?.(e, req);
  return error('internal', 'Something went wrong');
}

/** NDJSON stream of ExplorerStreamEvent lines. Errors become an `error` event. */
function streamResponse(call: Call, handler: Handler, rt: ApiRuntime, req: Request): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ExplorerStreamEvent) =>
        controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      try {
        await handler({ ...call, emit: send });
      } catch (e) {
        if (isServiceError(e)) send({ type: 'error', code: e.code, message: e.message });
        else {
          rt.onError?.(e, req);
          send({ type: 'error', code: 'internal', message: 'Something went wrong' });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson', ...SECURITY_HEADERS },
  });
}
