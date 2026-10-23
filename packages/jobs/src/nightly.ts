// Nightly ingestion (spec §9). Idempotent; a failure for one ticker never fails the run.
import { addDays, addMonthKey, monthKey } from '@easyfi/core';
import {
  CPI_SERIES,
  DEFAULT_CPI_SERIES_IDS,
  type CpiSource,
  type DividendEvent,
  type DividendSource,
  type EmailSender,
  type HoldingsSource,
  type PricePoint,
  type PriceSource,
} from '@easyfi/data-sources';
import type { Db } from '@easyfi/db';
import { createRepos } from '@easyfi/db';
import { createServices, SEEDED_FUND_TICKERS, seedPopularSecurities } from '@easyfi/services';

export interface NightlySources {
  prices: PriceSource | null;
  dividends: DividendSource | null;
  holdings: HoldingsSource | null;
  cpi: CpiSource | null;
  /** Alert emails; null → alerts are evaluated and recorded but not delivered. */
  email?: EmailSender | null;
}

export interface NightlyOptions {
  db: Db;
  sources: NightlySources;
  /** 'YYYY-MM-DD' (UTC) — injectable for tests. */
  today: string;
  /**
   * Max tickers priced per run. Tiingo free allows 50 requests/hour, so the default stays under
   * it; the stalest tickers go first, so everything is refreshed over consecutive nights.
   */
  maxPriceTickers?: number;
  /** Re-check a fund's N-PORT book once its stored snapshot is this many days old. */
  holdingsStaleDays?: number;
  /** Price history kept (days). */
  retentionDays?: number;
  log?: (msg: string) => void;
}

export interface NightlyResult {
  status: 'ok' | 'partial' | 'failed';
  counts: Record<string, number>;
  errors: { step: string; ticker?: string; message: string }[];
  jobId: string;
}

const HISTORY_DAYS = 730;

type WithDividends = PriceSource & {
  eodWithDividends(
    ticker: string,
    from: string,
    to: string,
  ): Promise<{ prices: PricePoint[]; dividends: DividendEvent[] }>;
};

const hasCombined = (p: PriceSource): p is WithDividends =>
  typeof (p as Partial<WithDividends>).eodWithDividends === 'function';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function runNightly(opts: NightlyOptions): Promise<NightlyResult> {
  const { db, sources, today } = opts;
  const log = opts.log ?? (() => {});
  const repos = createRepos(db);
  const run = await repos.jobs.start('nightly');
  const counts: Record<string, number> = {
    tickers: 0,
    priceRequests: 0,
    pricedTickers: 0,
    priceRows: 0,
    dividendRows: 0,
    fundsRefreshed: 0,
    cpiRows: 0,
    pruned: 0,
    seeded: 0,
    alertsTriggered: 0,
    alertEmails: 0,
  };
  const errors: NightlyResult['errors'] = [];
  const fail = (step: string, e: unknown, ticker?: string) => {
    errors.push({ step, ...(ticker ? { ticker } : {}), message: message(e) });
    log(`✗ ${step}${ticker ? ` ${ticker}` : ''}: ${message(e)}`);
  };

  try {
    counts.seeded = await seedPopularSecurities(db);

    // 1. tickers in use + seeded ETF list
    const held = await repos.jobs.tickersInUse();
    const tickers = [...new Set([...held, ...SEEDED_FUND_TICKERS])].filter(
      (t) => !/^CASH$|^SVF-/.test(t),
    );
    counts.tickers = tickers.length;

    // 2. EOD prices + dividends (stalest first, budgeted)
    if (sources.prices) {
      const latest = new Map((await repos.prices.latest(tickers)).map((p) => [p.ticker, p.date]));
      const heldSet = new Set(held);
      const order = [...tickers].sort((a, b) => {
        const da = latest.get(a) ?? '';
        const dbb = latest.get(b) ?? '';
        if (da !== dbb) return da < dbb ? -1 : 1;
        return Number(heldSet.has(b)) - Number(heldSet.has(a));
      });
      const due = order.filter((t) => (latest.get(t) ?? '') < today);
      for (const ticker of due.slice(0, opts.maxPriceTickers ?? 45)) {
        const last = latest.get(ticker);
        const from = last ? addDays(last, 1) : addDays(today, -HISTORY_DAYS);
        try {
          let prices: PricePoint[];
          let divs: DividendEvent[] = [];
          if (hasCombined(sources.prices)) {
            ({ prices, dividends: divs } = await sources.prices.eodWithDividends(
              ticker,
              from,
              today,
            ));
          } else {
            prices = await sources.prices.eodHistory(ticker, from, today);
            if (sources.dividends) divs = await sources.dividends.dividends(ticker, from);
          }
          await repos.prices.upsertBatch(prices);
          await repos.dividends.upsert(divs);
          counts.priceRequests! += 1;
          if (prices.length) counts.pricedTickers! += 1;
          counts.priceRows! += prices.length;
          counts.dividendRows! += divs.length;
        } catch (e) {
          fail('prices', e, ticker);
        }
      }
    }

    // 3. fund holdings from SEC N-PORT when the stored book is stale
    if (sources.holdings) {
      const secs = await repos.securities.getMany(tickers);
      const funds = secs
        .filter((s) => s.type === 'etf' || s.type === 'mutual_fund')
        .map((s) => s.ticker);
      const books = new Map((await repos.fundHoldings.funds()).map((f) => [f.fundTicker, f.asOf]));
      const staleBefore = addDays(today, -(opts.holdingsStaleDays ?? 75));
      for (const fund of funds) {
        const asOf = books.get(fund);
        if (asOf && asOf > staleBefore) continue;
        try {
          const book = await sources.holdings.latestHoldings(fund);
          if (!book || (asOf && book.asOf <= asOf)) continue;
          await repos.fundHoldings.replaceSnapshot(fund, book.asOf, book.constituents);
          counts.fundsRefreshed! += 1;
        } catch (e) {
          fail('holdings', e, fund);
        }
      }
    }

    // 4. CPI when a newer month may be out
    if (sources.cpi) {
      try {
        const have = await repos.cpi.list([CPI_SERIES.headline], addMonthKey(monthKey(today), -3));
        const latestPeriod =
          have
            .map((p) => p.period)
            .sort()
            .at(-1) ?? '';
        if (latestPeriod < addMonthKey(monthKey(today), -1)) {
          const year = Number(today.slice(0, 4));
          const points = await sources.cpi.series(DEFAULT_CPI_SERIES_IDS, year - 3, year);
          await repos.cpi.upsert(points);
          counts.cpiRows = points.length;
        }
      } catch (e) {
        fail('cpi', e);
      }
    }

    // 5. retention
    counts.pruned = await repos.prices.prune(addDays(today, -(opts.retentionDays ?? HISTORY_DAYS)));

    // 6. alerts (concentration / upcoming dividend), at most once a day per rule
    const services = createServices({ db, now: () => new Date(`${today}T12:00:00Z`) });
    const since = new Date(`${addDays(today, -1)}T12:00:00Z`);
    for (const user of await repos.alerts.usersWithEnabled()) {
      try {
        const { triggered } = await services.settings.checkAlerts(user.userId, { since });
        counts.alertsTriggered! += triggered.length;
        if (triggered.length && user.email && sources.email) {
          await sources.email.send({
            to: user.email,
            subject: `EasyFI: ${triggered.length} alert${triggered.length === 1 ? '' : 's'}`,
            text: [
              ...triggered.map((t) => `• ${t.message}`),
              '',
              'Educational information, not financial advice. Manage alerts in Settings.',
            ].join('\n'),
          });
          counts.alertEmails! += 1;
        }
      } catch (e) {
        fail('alerts', e, user.userId);
      }
    }
  } catch (e) {
    fail('run', e);
    await repos.jobs.finish(run.id, { status: 'failed', counts, errors });
    return { status: 'failed', counts, errors, jobId: run.id };
  }

  // 7. job_runs row (also keeps the Supabase project active)
  const status = errors.length ? 'partial' : 'ok';
  await repos.jobs.finish(run.id, { status, counts, errors });
  log(`nightly ${status}: ${JSON.stringify(counts)}`);
  return { status, counts, errors, jobId: run.id };
}
