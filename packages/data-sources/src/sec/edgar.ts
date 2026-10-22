import { createRateLimiter, fetchWithRetry, type RetryOptions } from '../http';
import type { FetchLike, FundHoldings, HoldingsSource, IsoDate, SleepFn } from '../types';
import { parseNport, type CusipLookup, type ParsedNport } from './nport';

const TICKERS_URL = 'https://www.sec.gov/files/company_tickers_mf.json';
const NPORT_FORMS = new Set(['NPORT-P', 'NPORT-P/A']);

export interface FundIds {
  cik: number;
  seriesId: string;
  classId?: string;
}

export interface NportFiling {
  cik: number;
  seriesId: string;
  accessionNumber: string;
  reportDate: IsoDate;
  filingDate: IsoDate;
  primaryDocUrl: string;
}

export interface SecEdgarOptions {
  /** Required by SEC fair-access policy, e.g. "EasyFI admin@example.com" (SEC_USER_AGENT). */
  userAgent: string;
  fetch?: FetchLike;
  sleep?: SleepFn;
  /** Awaited before every request. Defaults to ≤ 8 req/s (SEC limit is 10). */
  rateLimit?: () => Promise<void>;
  cusipToTicker?: CusipLookup;
  /** Extra ticker → CIK/series mappings for funds missing from company_tickers_mf.json. */
  tickerOverrides?: Record<string, FundIds>;
  /** How many recent N-PORT filings of a trust to inspect looking for the series. */
  maxFilingsToScan?: number;
  retries?: number;
}

interface MfTickersFile {
  fields: string[];
  data: (string | number)[][];
}

interface Submissions {
  filings?: {
    recent?: {
      accessionNumber: string[];
      form: string[];
      reportDate: string[];
      filingDate: string[];
      primaryDocument: string[];
    };
  };
}

/** Parse SEC's company_tickers_mf.json ({fields, data}) into symbol → ids. */
export function parseMutualFundTickers(file: MfTickersFile): Map<string, FundIds> {
  const idx = (f: string) => file.fields.indexOf(f);
  const [iCik, iSeries, iClass, iSym] = [
    idx('cik'),
    idx('seriesId'),
    idx('classId'),
    idx('symbol'),
  ];
  const map = new Map<string, FundIds>();
  for (const row of file.data) {
    const sym = String(row[iSym] ?? '').toUpperCase();
    const seriesId = String(row[iSeries] ?? '');
    if (!sym || !seriesId) continue;
    map.set(sym, { cik: Number(row[iCik]), seriesId, classId: String(row[iClass] ?? '') });
  }
  return map;
}

/**
 * SEC EDGAR N-PORT holdings source.
 *
 * Lookup: ticker → (CIK, seriesId) via company_tickers_mf.json; then the trust's submissions
 * JSON lists recent NPORT-P filings (one trust CIK files for many series). Newest-first, each
 * candidate is matched to the series via its small `.hdr.sgml` header (SERIES-ID), falling back
 * to `genInfo/seriesId` in primary_doc.xml. Accession → series results are cached.
 */
export class SecEdgarClient implements HoldingsSource {
  private readonly fetch: FetchLike;
  private readonly rateLimit: () => Promise<void>;
  private readonly retry: RetryOptions;
  private readonly maxScan: number;
  private tickers: Promise<Map<string, FundIds>> | null = null;
  private readonly accessionSeries = new Map<string, string | null>();
  private readonly parsedDocs = new Map<string, string>();

  constructor(private readonly opts: SecEdgarOptions) {
    if (!opts.userAgent?.trim())
      throw new Error('SEC EDGAR requires a User-Agent (SEC_USER_AGENT)');
    this.fetch = opts.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.rateLimit =
      opts.rateLimit ?? createRateLimiter(8, opts.sleep ? { sleep: opts.sleep } : {});
    this.retry = { retries: opts.retries ?? 3, ...(opts.sleep ? { sleep: opts.sleep } : {}) };
    this.maxScan = opts.maxFilingsToScan ?? 40;
  }

  async resolveFund(ticker: string): Promise<FundIds | null> {
    const t = ticker.trim().toUpperCase();
    const override = this.opts.tickerOverrides?.[t];
    if (override) return override;
    this.tickers ??= this.getJson<MfTickersFile>(TICKERS_URL).then((f) =>
      f ? parseMutualFundTickers(f) : new Map(),
    );
    try {
      return (
        (await this.tickers).get(t) ?? (await this.tickers).get(t.replace(/[.-]/g, '')) ?? null
      );
    } catch (err) {
      this.tickers = null; // allow retry on next call
      throw err;
    }
  }

  /** Latest N-PORT-P filing for the fund's series, or null if none found. */
  async latestFiling(ticker: string): Promise<NportFiling | null> {
    const ids = await this.resolveFund(ticker);
    if (!ids) return null;
    // Any failure of the series lookup (403/429 from browse-edgar) falls back to scanning.
    const direct = await this.filingBySeries(ids).catch(() => null);
    if (direct) return direct;
    const cik10 = String(ids.cik).padStart(10, '0');
    const subs = await this.getJson<Submissions>(
      `https://data.sec.gov/submissions/CIK${cik10}.json`,
    );
    const r = subs?.filings?.recent;
    if (!r) return null;

    const candidates = r.form
      .map((form, i) => ({
        form,
        accessionNumber: r.accessionNumber[i] ?? '',
        reportDate: r.reportDate[i] ?? '',
        filingDate: r.filingDate[i] ?? '',
      }))
      .filter((f) => NPORT_FORMS.has(f.form) && f.accessionNumber)
      .sort(
        (a, b) =>
          b.reportDate.localeCompare(a.reportDate) || b.filingDate.localeCompare(a.filingDate),
      )
      .slice(0, this.maxScan);

    for (const c of candidates) {
      const base = `https://www.sec.gov/Archives/edgar/data/${ids.cik}/${c.accessionNumber.replace(/-/g, '')}`;
      const primaryDocUrl = `${base}/primary_doc.xml`;
      const series = await this.seriesOf(c.accessionNumber, base, primaryDocUrl, ticker);
      if (series === ids.seriesId) {
        return {
          cik: ids.cik,
          seriesId: ids.seriesId,
          accessionNumber: c.accessionNumber,
          reportDate: c.reportDate,
          filingDate: c.filingDate,
          primaryDocUrl,
        };
      }
    }
    return null;
  }

  async latestHoldings(fundTicker: string): Promise<FundHoldings | null> {
    const ticker = fundTicker.trim().toUpperCase();
    const filing = await this.latestFiling(ticker);
    if (!filing) return null;
    const xml =
      this.parsedDocs.get(filing.accessionNumber) ?? (await this.getText(filing.primaryDocUrl));
    this.parsedDocs.delete(filing.accessionNumber);
    if (!xml) return null;
    const doc: ParsedNport = parseNport(xml, {
      fundTicker: ticker,
      ...(this.opts.cusipToTicker ? { cusipToTicker: this.opts.cusipToTicker } : {}),
    });
    // Never store an empty asOf: it would compare below every later filing and stick forever.
    return {
      asOf: doc.asOf || filing.reportDate || filing.filingDate,
      constituents: doc.constituents,
    };
  }

  /**
   * EDGAR's company browse accepts a series id and lists only that series' filings. This finds
   * funds in very large trusts (iShares, SPDR Series, Invesco) whose filing is far beyond the
   * scan window of the trust's submissions list. Null → fall back to scanning.
   */
  private async filingBySeries(ids: FundIds): Promise<NportFiling | null> {
    const atom = await this.getText(
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ids.seriesId}&type=NPORT-P&dateb=&owner=include&count=1&output=atom`,
    );
    const href = atom && /<filing-href>([^<]+)<\/filing-href>/.exec(atom)?.[1];
    const acc = href && /\/(\d{10}-\d{2}-\d{6})-index\.html?$/.exec(href)?.[1];
    if (!href || !acc) return null;
    const cik = /\/edgar\/data\/(\d+)\//.exec(href)?.[1];
    return {
      cik: cik ? Number(cik) : ids.cik,
      seriesId: ids.seriesId,
      accessionNumber: acc,
      // Report date comes from the document itself (genInfo/repPdDate) in latestHoldings.
      reportDate: '',
      filingDate: /<filing-date>([^<]+)<\/filing-date>/.exec(atom)?.[1] ?? '',
      primaryDocUrl: href.replace(/\/[^/]+-index\.html?$/, '/primary_doc.xml'),
    };
  }

  private async seriesOf(
    accession: string,
    base: string,
    primaryDocUrl: string,
    ticker: string,
  ): Promise<string | null> {
    if (this.accessionSeries.has(accession)) return this.accessionSeries.get(accession) ?? null;
    let series: string | null = null;
    const hdr = await this.getText(`${base}/${accession}.hdr.sgml`);
    const ids = hdr ? [...hdr.matchAll(/<SERIES-ID>\s*(S\d{9})/g)].map((m) => m[1]!) : [];
    if (new Set(ids).size === 1) {
      series = ids[0]!;
    } else {
      const xml = await this.getText(primaryDocUrl);
      if (xml) {
        series = parseNport(xml, { fundTicker: ticker }).seriesId;
        // Keep only the most recent doc to avoid re-downloading it in latestHoldings.
        this.parsedDocs.clear();
        this.parsedDocs.set(accession, xml);
      }
    }
    this.accessionSeries.set(accession, series);
    return series;
  }

  private async request(url: string): Promise<Response | null> {
    await this.rateLimit();
    const res = await fetchWithRetry(
      this.fetch,
      url,
      { headers: { 'User-Agent': this.opts.userAgent, Accept: '*/*' } },
      { ...this.retry, allowStatus: [404] },
    );
    return res.status === 404 ? null : res;
  }

  private async getJson<T>(url: string): Promise<T | null> {
    const res = await this.request(url);
    return res ? ((await res.json()) as T) : null;
  }

  private async getText(url: string): Promise<string | null> {
    const res = await this.request(url);
    return res ? res.text() : null;
  }
}
