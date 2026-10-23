// `pnpm job:nightly` — runs the nightly ingestion against DATABASE_URL (or the local PGlite dir).
import { createSources, ResendEmailSender } from '@easyfi/data-sources';
import { createDb, runMigrations } from '@easyfi/db';
import { runNightly } from './nightly';

const env = process.env;
const handle = createDb(
  env.DATABASE_URL
    ? { databaseUrl: env.DATABASE_URL, max: 2 }
    : { dataDir: env.EASYFI_DATA_DIR ?? '.easyfi-data' },
);
try {
  await runMigrations(handle);
  const email = env.RESEND_API_KEY
    ? new ResendEmailSender({
        apiKey: env.RESEND_API_KEY,
        from: env.ALERTS_FROM ?? 'EasyFI <onboarding@resend.dev>',
      })
    : null;
  const sources = { ...createSources(env), email };
  const result = await runNightly({
    db: handle.db,
    sources,
    today: new Date().toISOString().slice(0, 10),
    ...(env.NIGHTLY_MAX_TICKERS ? { maxPriceTickers: Number(env.NIGHTLY_MAX_TICKERS) } : {}),
    log: (m) => console.log(m),
  });
  console.log(
    JSON.stringify({ status: result.status, counts: result.counts, errors: result.errors.length }),
  );
  process.exitCode = result.status === 'failed' ? 1 : 0;
} finally {
  await handle.close();
}
