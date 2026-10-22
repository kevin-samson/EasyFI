import {
  DEFAULT_CPI_SERIES_IDS,
  type CpiSource,
  type DividendSource,
  type HoldingsSource,
  type PriceSource,
  type SecCompany,
} from '@easyfi/data-sources';
import {
  cpiRepo,
  dividendsRepo,
  fundHoldingsRepo,
  jobsRepo,
  pricesRepo,
  securitiesRepo,
  type Db,
} from '@easyfi/db';
import {
  addMonthKey,
  addMonths,
  buildIssuerIndex,
  monthKey,
  resolveConstituentTickers,
  type IssuerIndex,
} from '@easyfi/core';

export interface NightlySources {
  prices: PriceSource | null;
  dividends: DividendSource | null;
  holdings: HoldingsSource | null;
  cpi: CpiSource | null;
}

export interface NightlyDeps {
  db: Db;
  sources: NightlySources;
  /** 'YYYY-MM-DD' (UTC) — injected so runs are reproducible in tests. */
  today: string;
  /** Funds whose N-PORT holdings are refreshed (catalog ETFs + ETFs in use). */
  etfs: readonly string[];
  /** Optional stock universe (SEC company_tickers.json); only missing tickers are inserted. */
  companies?: () => Promise<SecCompany[]>;
}

export interface NightlyError {
  step: string;
  ticker?: string;
  message: string;
}

export interface NightlyResult {
  status: 'ok' | 'partial' | 'failed';
  counts: Record<string, number>;
  errors: NightlyError[];
}

const HISTORY_MONTHS = 24;
// CASH sentinel and CUSIP-only lines from CSV imports have no market data source.
const priceable = (t: string) => t !== 'CASH' && !/^(?=.*\d)[0-9A-Z]{9}$/.test(t);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/**
 * Spec §9 nightly ingestion. Idempotent and incremental; a failure for one ticker or step is
 * recorded and the run continues (status `partial`). Writes a `job_runs` row either way.
 */
export async function runNightly(deps: NightlyDeps): Promise<NightlyResult> {
  const { db, sources, today } = deps;
  const jobs = jobsRepo(db);
  const run = await jobs.start('nightly');
  const counts: Record<string, number> = {
    tickers: 0,
    prices: 0,
    dividends: 0,
    funds: 0,
    fundsNoFiling: 0,
    cpi: 0,
    securities: 0,
    pruned: 0,
  };
  const errors: NightlyError[] = [];
  // step -> [attempts, failures]: a step that failed for *every* item fails the run (e.g. revoked token).
  const tally = new Map<string, [number, number]>();
  const attempt = async (step: string, ticker: string | undefined, fn: () => Promise<void>) => {
    const t = tally.get(step) ?? [0, 0];
    tally.set(step, t);
    t[0]++;
    try {
      await fn();
    } catch (e) {
      t[1]++;
      errors.push({ step, ...(ticker ? { ticker } : {}), message: message(e) });
    }
  };

  try {
    const inUse = (await jobs.tickersInUse()).map((t) => t.toUpperCase());
    const tickers = [...new Set([...inUse, ...deps.etfs])].filter(priceable).sort();
    counts.tickers = tickers.length;
    const historyStart = addMonths(today, -HISTORY_MONTHS); // clamps 29 Feb

    let issuers: IssuerIndex = new Map();
    if (deps.companies) {
      await attempt('securities', undefined, async () => {
        const universe = await deps.companies!();
        issuers = buildIssuerIndex(universe);
        const repo = securitiesRepo(db);
        const have = new Set(
          (await repo.getMany(universe.map((c) => c.ticker))).map((s) => s.ticker),
        );
        const missing = universe.filter((c) => !have.has(c.ticker));
        await repo.upsert(missing);
        counts.securities = missing.length;
      });
    }

    if (sources.prices) {
      const prices = pricesRepo(db);
      let last = new Map<string, string>();
      await attempt('prices-latest', undefined, async () => {
        last = new Map((await prices.latest(tickers)).map((p) => [p.ticker, p.date]));
      });
      for (const t of tickers) {
        await attempt('prices', t, async () => {
          // Re-fetch the last stored bar too: providers revise the latest close.
          const bars = await sources.prices!.eodHistory(t, last.get(t) ?? historyStart, today);
          await prices.upsertBatch(bars.map((b) => ({ ticker: t, date: b.date, close: b.close })));
          counts.prices! += bars.length;
        });
      }
    }

    if (sources.dividends) {
      const repo = dividendsRepo(db);
      for (const t of tickers) {
        await attempt('dividends', t, async () => {
          const events = await sources.dividends!.dividends(t, historyStart);
          await repo.upsert(events.map((e) => ({ ...e, ticker: t })));
          counts.dividends! += events.length;
        });
      }
    }

    if (sources.holdings && deps.companies && issuers.size === 0) {
      // Without the issuer index a new snapshot would be stored ticker-less and never re-resolved
      // (it is only replaced by a newer filing). Keep last night's data instead.
      errors.push({ step: 'holdings', message: 'skipped: SEC company list unavailable' });
    } else if (sources.holdings) {
      const repo = fundHoldingsRepo(db);
      const catalog = new Set(deps.etfs);
      // Held tickers too: funds outside the catalog (typed 'stock' by the SEC list) still refresh;
      // non-funds resolve to null cheaply from the cached SEC fund list.
      for (const fund of [...new Set([...deps.etfs, ...tickers])].sort()) {
        await attempt('holdings', fund, async () => {
          const snap = await sources.holdings!.latestHoldings(fund);
          if (!snap) {
            if (catalog.has(fund)) counts.fundsNoFiling! += 1; // UITs (SPY, QQQ, DIA) file no N-PORT
            return;
          }
          const [stored] = await repo.snapshotDates(fund);
          if (stored && stored >= snap.asOf) return;
          await repo.replaceSnapshot(
            fund,
            snap.asOf,
            // Filings rarely carry tickers; match issuer names against the SEC company list.
            resolveConstituentTickers(snap.constituents, issuers).map((c) => ({
              ...c,
              fundTicker: fund,
            })),
          );
          counts.funds! += 1;
        });
      }
    }

    if (sources.cpi) {
      await attempt('cpi', undefined, async () => {
        const repo = cpiRepo(db);
        const stored = await repo.list(DEFAULT_CPI_SERIES_IDS);
        const last = new Map<string, string>();
        for (const p of stored) {
          if (p.period > (last.get(p.seriesId) ?? '')) last.set(p.seriesId, p.period);
        }
        const target = addMonthKey(monthKey(today), -1);
        // Per series: one lagging series must still be backfilled.
        if (DEFAULT_CPI_SERIES_IDS.every((id) => (last.get(id) ?? '') >= target)) return;
        const year = Number(today.slice(0, 4));
        const points = (await sources.cpi!.series(DEFAULT_CPI_SERIES_IDS, year - 1, year)).filter(
          (p) => p.period > (last.get(p.seriesId) ?? ''),
        );
        await repo.upsert(points);
        counts.cpi = points.length;
      });
    }

    await attempt('prune', undefined, async () => {
      counts.pruned = await pricesRepo(db).prune(historyStart);
    });

    const allFailed = [...tally.values()].some(([n, f]) => n > 0 && f === n);
    const status = allFailed ? 'failed' : errors.length ? 'partial' : 'ok';
    const result: NightlyResult = { status, counts, errors };
    await jobs.finish(run.id, result);
    return result;
  } catch (e) {
    errors.push({ step: 'run', message: message(e) });
    try {
      await jobs.finish(run.id, { status: 'failed', counts, errors });
    } catch (e2) {
      errors.push({ step: 'job_runs', message: message(e2) });
    }
    return { status: 'failed', counts, errors };
  }
}
