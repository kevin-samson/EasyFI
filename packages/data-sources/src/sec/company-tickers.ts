import { fetchWithRetry } from '../http';
import type { FetchLike } from '../types';

const URL_TICKERS = 'https://www.sec.gov/files/company_tickers.json';

type CompanyTickersFile = Record<string, { cik_str: number; ticker: string; title: string }>;

export interface SecCompany {
  ticker: string;
  name: string;
  cik: string;
  type: 'stock';
}

/** SEC company_tickers.json (all US-listed operating companies) → stock securities. */
export function parseCompanyTickers(file: CompanyTickersFile): SecCompany[] {
  const out = new Map<string, SecCompany>();
  for (const row of Object.values(file)) {
    // SEC uses BRK-B; the app (and core normalizeTicker) uses BRK.B.
    const ticker = row.ticker?.trim().toUpperCase().replace(/-/g, '.');
    if (!ticker || out.has(ticker)) continue;
    out.set(ticker, { ticker, name: row.title.trim(), cik: String(row.cik_str), type: 'stock' });
  }
  return [...out.values()];
}

export async function fetchSecCompanyTickers(opts: {
  userAgent: string;
  fetch?: FetchLike;
}): Promise<SecCompany[]> {
  const fetch = opts.fetch ?? ((u, i) => globalThis.fetch(u, i));
  const res = await fetchWithRetry(fetch, URL_TICKERS, {
    headers: { 'User-Agent': opts.userAgent, Accept: 'application/json' },
  });
  return parseCompanyTickers((await res.json()) as CompanyTickersFile);
}
