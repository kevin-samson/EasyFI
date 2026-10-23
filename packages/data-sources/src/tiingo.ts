import { createConcurrencyLimit, fetchWithRetry, type RetryOptions } from './http';
import type {
  DividendEvent,
  DividendSource,
  FetchLike,
  IsoDate,
  LatestQuote,
  PricePoint,
  PriceSource,
  Security,
  SleepFn,
} from './types';

const BASE = 'https://api.tiingo.com';

export interface TiingoOptions {
  token: string;
  fetch?: FetchLike;
  sleep?: SleepFn;
  /** Max in-flight requests (default 4). */
  concurrency?: number;
  retries?: number;
  iexBatchSize?: number;
  /** Today's date (YYYY-MM-DD), injectable for tests. */
  today?: () => IsoDate;
}

interface TiingoEodRow {
  date: string;
  close: number;
  divCash?: number;
}

interface TiingoMeta {
  ticker?: string;
  name?: string;
}

interface TiingoIexRow {
  ticker: string;
  timestamp: string | null;
  tngoLast: number | null;
  last: number | null;
  prevClose: number | null;
}

/** Tiingo uses dashes for share classes (BRK.B → BRK-B). */
export function toTiingoTicker(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/[./]/g, '-');
}

export class TiingoClient implements PriceSource, DividendSource {
  private readonly fetch: FetchLike;
  private readonly limit: ReturnType<typeof createConcurrencyLimit>;
  private readonly retry: RetryOptions;
  private readonly today: () => IsoDate;
  private readonly iexBatchSize: number;

  constructor(private readonly opts: TiingoOptions) {
    this.fetch = opts.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.limit = createConcurrencyLimit(opts.concurrency ?? 4);
    this.retry = { retries: opts.retries ?? 3, ...(opts.sleep ? { sleep: opts.sleep } : {}) };
    this.today = opts.today ?? (() => new Date().toISOString().slice(0, 10));
    this.iexBatchSize = opts.iexBatchSize ?? 100;
  }

  async eodHistory(ticker: string, from: IsoDate, to: IsoDate): Promise<PricePoint[]> {
    const rows = await this.eodRows(ticker, from, to);
    return rows
      .filter((r) => typeof r.close === 'number' && Number.isFinite(r.close))
      .map((r) => ({ ticker, date: r.date.slice(0, 10), close: r.close }));
  }

  async dividends(ticker: string, from: IsoDate): Promise<DividendEvent[]> {
    const rows = await this.eodRows(ticker, from, this.today());
    return rows
      .filter((r) => typeof r.divCash === 'number' && r.divCash > 0)
      .map((r) => ({ ticker, exDate: r.date.slice(0, 10), payDate: null, amount: r.divCash! }));
  }

  /** Prices and dividends from one EOD request (saves Tiingo's hourly request budget). */
  async eodWithDividends(
    ticker: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<{ prices: PricePoint[]; dividends: DividendEvent[] }> {
    const rows = await this.eodRows(ticker, from, to);
    return {
      prices: rows
        .filter((r) => typeof r.close === 'number' && Number.isFinite(r.close))
        .map((r) => ({ ticker, date: r.date.slice(0, 10), close: r.close })),
      dividends: rows
        .filter((r) => typeof r.divCash === 'number' && r.divCash > 0)
        .map((r) => ({ ticker, exDate: r.date.slice(0, 10), payDate: null, amount: r.divCash! })),
    };
  }

  async meta(ticker: string): Promise<Partial<Security> | null> {
    const res = await this.get(`/tiingo/daily/${encodeURIComponent(toTiingoTicker(ticker))}`, {});
    if (!res) return null;
    const m = (await res.json()) as TiingoMeta;
    if (!m.name) return null;
    return { ticker, name: m.name.trim() };
  }

  async latest(tickers: string[]): Promise<Record<string, LatestQuote>> {
    const byTiingo = new Map<string, string>();
    for (const t of tickers) byTiingo.set(toTiingoTicker(t), t);
    const all = [...byTiingo.keys()];
    const batches: string[][] = [];
    for (let i = 0; i < all.length; i += this.iexBatchSize) {
      batches.push(all.slice(i, i + this.iexBatchSize));
    }
    const out: Record<string, LatestQuote> = {};
    await Promise.all(
      batches.map(async (batch) => {
        const res = await this.get('/iex/', { tickers: batch.join(',') });
        if (!res) return;
        const rows = (await res.json()) as TiingoIexRow[];
        for (const row of rows) {
          const original = byTiingo.get(toTiingoTicker(row.ticker));
          const close = row.tngoLast ?? row.last;
          // Never report a missing price as a number.
          if (!original || close == null || !row.timestamp) continue;
          const q: LatestQuote = { close, date: row.timestamp.slice(0, 10) };
          if (row.prevClose != null) q.prevClose = row.prevClose;
          out[original] = q;
        }
      }),
    );
    return out;
  }

  private async eodRows(ticker: string, from: IsoDate, to: IsoDate): Promise<TiingoEodRow[]> {
    const path = `/tiingo/daily/${encodeURIComponent(toTiingoTicker(ticker))}/prices`;
    const res = await this.get(path, { startDate: from, endDate: to });
    if (!res) return [];
    const body = (await res.json()) as unknown;
    return Array.isArray(body) ? (body as TiingoEodRow[]) : [];
  }

  /** GET with retries + concurrency limit. Returns null on 404. */
  private get(path: string, params: Record<string, string>): Promise<Response | null> {
    const qs = new URLSearchParams({ ...params, token: this.opts.token });
    const url = `${BASE}${path}?${qs.toString()}`;
    return this.limit(async () => {
      const res = await fetchWithRetry(
        this.fetch,
        url,
        { headers: { 'Content-Type': 'application/json' } },
        { ...this.retry, allowStatus: [404] },
      );
      return res.status === 404 ? null : res;
    });
  }
}
