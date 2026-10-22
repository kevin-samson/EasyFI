import { createSources, fetchSecCompanyTickers } from '@easyfi/data-sources';
import { createDb, runMigrations } from '@easyfi/db';
import { POPULAR_ETFS, runNightly, seedCatalog } from '@easyfi/services';

/** `pnpm job:nightly` — GitHub Actions cron (02:00 UTC weekdays) or locally against PGlite. */
async function main() {
  const env = process.env;
  const url = env.DATABASE_URL?.trim();
  // In CI a missing secret must fail loudly, not ingest into a throwaway PGlite.
  if (env.CI) {
    const missing = ['DATABASE_URL', 'TIINGO_TOKEN', 'SEC_USER_AGENT'].filter(
      (k) => !env[k]?.trim(),
    );
    if (missing.length) throw new Error(`Missing secrets in CI: ${missing.join(', ')}`);
  }
  const handle = url
    ? createDb({ databaseUrl: url, max: 1 })
    : createDb({ dataDir: env.EASYFI_DATA_DIR?.trim() || '.easyfi-data' });
  try {
    if (handle.driver === 'pglite') await runMigrations(handle);
    await seedCatalog(handle.db);

    const ua = env.SEC_USER_AGENT?.trim();

    const result = await runNightly({
      db: handle.db,
      sources: createSources(env),
      today: new Date().toISOString().slice(0, 10),
      // Held tickers are added inside runNightly (funds outside the catalog included).
      etfs: POPULAR_ETFS.map((e) => e.ticker),
      ...(ua ? { companies: () => fetchSecCompanyTickers({ userAgent: ua }) } : {}),
    });
    console.log(JSON.stringify({ status: result.status, counts: result.counts }));
    for (const e of result.errors)
      console.error(`[${e.step}]${e.ticker ? ` ${e.ticker}` : ''} ${e.message}`);
    if (result.status === 'failed') process.exitCode = 1;
  } finally {
    await handle.close();
  }
}

await main();
