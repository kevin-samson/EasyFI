// Builds the process-wide services from environment variables (spec: demo mode when unset).
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createSources, type FetchLike } from '@easyfi/data-sources';
import { createDb, defaultMigrationsFolder, runMigrations, type DbHandle } from '@easyfi/db';
import { ensureDemoLogin } from './auth';
import { DEMO_TODAY, DEMO_USER_ID, seedDemo } from './demo';
import type { ApiRuntime } from './http';
import { createServices, type AuthConfig } from './index';
import { seedPopularSecurities } from './popular-securities';

export interface RuntimeEnv {
  DATABASE_URL?: string | undefined;
  EASYFI_DATA_DIR?: string | undefined;
  EASYFI_MIGRATIONS_DIR?: string | undefined;
  NEXT_PUBLIC_SUPABASE_URL?: string | undefined;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string | undefined;
  SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
  SUPABASE_JWT_SECRET?: string | undefined;
  DEMO_AUTH_SECRET?: string | undefined;
  INVITE_CODES?: string | undefined;
  ADMIN_USER_IDS?: string | undefined;
  EXPLORER_DAILY_LIMIT?: string | undefined;
  APP_URL?: string | undefined;
  TIINGO_TOKEN?: string | undefined;
  SEC_USER_AGENT?: string | undefined;
  BLS_KEY?: string | undefined;
  OPENROUTER_API_KEY?: string | undefined;
  OPENROUTER_MODEL?: string | undefined;
  /** "1" pins the clock to the fixture date in demo mode (default when no DATABASE_URL). */
  EASYFI_DEMO_CLOCK?: string | undefined;
  NODE_ENV?: string | undefined;
}

const val = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export interface Runtime extends ApiRuntime {
  handle: DbHandle;
  mode: { db: 'postgres' | 'pglite'; auth: 'supabase' | 'demo'; llm: boolean };
}

function migrationsFolder(env: RuntimeEnv): string {
  const explicit = val(env.EASYFI_MIGRATIONS_DIR);
  if (explicit) return explicit;
  // Next bundles this module, so import.meta.url may point into .next — prefer the repo path.
  for (const candidate of [
    path.resolve(process.cwd(), 'packages/db/drizzle'),
    path.resolve(process.cwd(), '../../packages/db/drizzle'),
    defaultMigrationsFolder,
  ]) {
    if (existsSync(path.join(candidate, 'meta', '_journal.json'))) return candidate;
  }
  return defaultMigrationsFolder;
}

export async function createRuntime(
  env: RuntimeEnv,
  deps: { fetch?: FetchLike } = {},
): Promise<Runtime> {
  const databaseUrl = val(env.DATABASE_URL);
  const handle = createDb(
    databaseUrl
      ? { databaseUrl, max: 3 }
      : { dataDir: val(env.EASYFI_DATA_DIR) ?? path.resolve(process.cwd(), '.easyfi-data') },
  );
  await runMigrations(handle, { migrationsFolder: migrationsFolder(env) });

  const supabaseUrl = val(env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = val(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = val(env.SUPABASE_SERVICE_ROLE_KEY);
  const auth: AuthConfig =
    supabaseUrl && anonKey && serviceRoleKey
      ? {
          mode: 'supabase',
          url: supabaseUrl,
          anonKey,
          serviceRoleKey,
          jwtSecret: val(env.SUPABASE_JWT_SECRET),
          ...(deps.fetch ? { fetch: deps.fetch } : {}),
        }
      : { mode: 'demo', secret: val(env.DEMO_AUTH_SECRET) ?? 'easyfi-local-demo-secret-change-me' };

  if (auth.mode === 'demo' && env.NODE_ENV === 'production' && !val(env.DEMO_AUTH_SECRET)) {
    throw new Error('Demo auth in production requires DEMO_AUTH_SECRET (or configure Supabase).');
  }

  const sources = createSources(env, deps.fetch ? { fetch: deps.fetch } : {});
  const demoClock = val(env.EASYFI_DEMO_CLOCK) ?? (databaseUrl ? '0' : '1');
  const now = demoClock === '1' ? () => new Date(`${DEMO_TODAY}T12:00:00Z`) : () => new Date();

  const services = createServices({
    db: handle.db,
    llm: sources.llm,
    now,
    auth,
    inviteCodes: list(env.INVITE_CODES),
    config: {
      adminUserIds: list(env.ADMIN_USER_IDS),
      appUrl: val(env.APP_URL) ?? '',
      ...(val(env.EXPLORER_DAILY_LIMIT)
        ? { explorerDailyLimit: Number(env.EXPLORER_DAILY_LIMIT) }
        : {}),
    },
  });

  await seedPopularSecurities(handle.db);

  // Local demo: fixture market data + demo user's portfolios, seeded once.
  if (handle.driver === 'pglite') {
    const hasDemo = (await services.ctx.repos.portfolios.list(DEMO_USER_ID)).length > 0;
    if (!hasDemo) await seedDemo(handle.db);
    if (auth.mode === 'demo') await ensureDemoLogin(services.ctx);
  }

  return {
    handle,
    services,
    mode: { db: handle.driver, auth: auth.mode, llm: sources.llm !== null },
    status: {
      driver: handle.driver,
      sources: {
        tiingo: sources.prices !== null,
        secEdgar: sources.holdings !== null,
        bls: sources.cpi !== null,
        openRouter: sources.llm !== null,
        supabaseAuth: auth.mode === 'supabase',
      },
    },
    ...(auth.mode === 'supabase'
      ? { storeScreenshot: supabaseStorageUploader(auth.url, auth.serviceRoleKey, deps.fetch) }
      : {}),
    onError: (err) => console.error('[api]', err),
  };
}

/** Uploads feedback screenshots to the private `feedback` bucket; returns the object path. */
export function supabaseStorageUploader(url: string, serviceRoleKey: string, doFetch?: FetchLike) {
  const f: FetchLike = doFetch ?? ((input, init) => fetch(input, init));
  return async (bytes: Uint8Array, contentType: string): Promise<string | null> => {
    const ext = contentType === 'image/png' ? 'png' : 'jpg';
    const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
    const res = await f(`${url.replace(/\/$/, '')}/storage/v1/object/feedback/${path}`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': contentType,
      },
      body: bytes as unknown as RequestInit['body'],
    });
    return res.ok ? `feedback/${path}` : null;
  };
}

const KEY = Symbol.for('easyfi.runtime');
type GlobalWithRuntime = typeof globalThis & { [KEY]?: Promise<Runtime> };

/** Process-wide singleton (survives Next.js dev hot reloads). */
export function getRuntime(env: RuntimeEnv = process.env as RuntimeEnv): Promise<Runtime> {
  const g = globalThis as GlobalWithRuntime;
  g[KEY] ??= createRuntime(env).catch((e) => {
    delete g[KEY];
    throw e;
  });
  return g[KEY];
}
