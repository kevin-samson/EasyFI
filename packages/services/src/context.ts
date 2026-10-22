import { createDb, defaultMigrationsFolder, runMigrations, type Db } from '@easyfi/db';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { authenticate, type AuthUser, type RequestLike } from './auth';
import { resolveAuthSetup, type AuthEnv, type AuthSetup } from './config';
import { ServiceError } from './errors';
import { assertSameOrigin, route } from './http';

export interface AppEnv extends AuthEnv {
  DATABASE_URL?: string | undefined;
  /** PGlite data dir for local demo mode (default `.easyfi-data`). */
  EASYFI_DATA_DIR?: string | undefined;
  /** Override for the SQL migrations folder (bundlers move `import.meta.url`). */
  EASYFI_MIGRATIONS_DIR?: string | undefined;
}

export interface AppContext extends AuthSetup {
  db: Db;
}

function migrationsFolder(env: AppEnv): string {
  if (env.EASYFI_MIGRATIONS_DIR) return env.EASYFI_MIGRATIONS_DIR;
  // Next.js runs from apps/web with code bundled into .next, so import.meta.url is not reliable there.
  const fromWeb = path.resolve(process.cwd(), '../../packages/db/drizzle');
  return existsSync(fromWeb) ? fromWeb : defaultMigrationsFolder;
}

async function build(env: AppEnv): Promise<AppContext> {
  const auth = resolveAuthSetup(env);
  const url = env.DATABASE_URL?.trim();
  const handle = url
    ? createDb({ databaseUrl: url, max: 1 })
    : createDb({ dataDir: env.EASYFI_DATA_DIR?.trim() || '.easyfi-data' });
  // Postgres (Supabase) is migrated by `pnpm db:migrate` at deploy time; embedded PGlite migrates itself.
  if (handle.driver === 'pglite')
    await runMigrations(handle, { migrationsFolder: migrationsFolder(env) });
  return { ...auth, db: handle.db };
}

let ctx: Promise<AppContext> | undefined;

/** Process-wide singleton (one DB pool per serverless instance). */
export function appContext(env: AppEnv = process.env): Promise<AppContext> {
  ctx ??= build(env).catch((e: unknown) => {
    ctx = undefined; // allow a retry after a transient failure
    throw e;
  });
  return ctx;
}

/** Signed-in user or a 401 ServiceError. */
export async function requireUser(req: RequestLike, context: AppContext): Promise<AuthUser> {
  const user = await authenticate(req, context.config);
  if (!user) throw new ServiceError('unauthorized', 'Sign in required.');
  return user;
}

/** `route()` + app context + signed-in user (401 otherwise). Route params arrive as a Promise (Next 16). */
export function authedRoute<P = Record<string, never>>(
  fn: (args: {
    req: Request;
    ctx: AppContext;
    user: AuthUser;
    params: Promise<P>;
  }) => Promise<unknown>,
) {
  return route(async (req: Request, routeCtx: { params: Promise<P> }) => {
    assertSameOrigin(req);
    const ctx = await appContext();
    const user = await requireUser(req, ctx);
    return fn({ req, ctx, user, params: routeCtx?.params ?? Promise.resolve({} as P) });
  });
}
