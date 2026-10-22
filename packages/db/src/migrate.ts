import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { fileURLToPath } from 'node:url';
import type { DbHandle } from './client';

/** Absolute path of the generated SQL migrations (packages/db/drizzle). */
// Joined at runtime on purpose: a literal `new URL('../drizzle', import.meta.url)` makes Turbopack try
// to bundle the folder as an asset and fail the Next build.
export const defaultMigrationsFolder = fileURLToPath(
  new URL(['..', 'drizzle'].join('/'), import.meta.url),
);

/** Apply all pending migrations (schema + RLS) on either driver. Idempotent. */
export async function runMigrations(
  handle: DbHandle,
  options: { migrationsFolder?: string } = {},
): Promise<void> {
  const migrationsFolder = options.migrationsFolder ?? defaultMigrationsFolder;
  if (handle.driver === 'pglite') {
    await migratePglite(handle.db as unknown as PgliteDatabase, { migrationsFolder });
  } else {
    await migratePostgres(handle.db as unknown as PostgresJsDatabase, { migrationsFolder });
  }
}
