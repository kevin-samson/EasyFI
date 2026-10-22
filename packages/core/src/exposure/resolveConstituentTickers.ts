// N-PORT identifies holdings by CUSIP/ISIN/LEI, rarely by ticker. SEC's free company list has
// ticker + legal name, so filings are matched to tickers by exact *normalised* issuer name.
// Exact-match only: a wrong ticker would silently merge two companies' exposure, while a miss just
// lands in the unresolved slice (spec §11).

const SUFFIXES = new Set([
  'INC',
  'INCORPORATED',
  'CORP',
  'CORPORATION',
  'CO',
  'COMPANY',
  'LTD',
  'LIMITED',
  'PLC',
  'LLC',
  'LP',
  'HOLDINGS',
  'HOLDING',
  'GROUP',
  'NV',
  'SA',
  'AG',
  'SE',
  'THE',
  'CLASS',
  'CL',
  'A',
  'B',
  'C',
  'SHS',
  'COM',
  'NEW',
  'DEL',
]);

/** Upper-case, punctuation-free issuer name without legal suffixes or share-class words. */
export function issuerNameKey(name: string): string {
  return (
    name
      .toUpperCase()
      // SEC titles carry state-of-incorporation tags: "QUALCOMM INC/DE", "CVS HEALTH CORP /DE/".
      .replace(/\s*\/[A-Z]{2}\/?\s*$/, '')
      .replace(/&/g, ' AND ')
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter((w) => w && !SUFFIXES.has(w))
      .join(' ')
  );
}

export type IssuerIndex = ReadonlyMap<string, string>;

/**
 * name key → ticker. Several share classes of one company (same CIK: GOOGL/GOOG, BF.A/BF.B) map to
 * the first listed class — look-through is company-level. A key shared by *different* companies
 * (Carnival Corp vs Carnival plc) is dropped: a guess would merge two companies' exposure.
 */
export function buildIssuerIndex(
  companies: readonly { ticker: string; name: string; cik?: string | null }[],
): IssuerIndex {
  const first = new Map<string, { ticker: string; cik: string | null }>();
  const ambiguous = new Set<string>();
  for (const c of companies) {
    const key = issuerNameKey(c.name);
    if (!key) continue;
    const seen = first.get(key);
    if (!seen) first.set(key, { ticker: c.ticker, cik: c.cik ?? null });
    else if (seen.cik === null || c.cik == null || seen.cik !== c.cik) ambiguous.add(key);
  }
  const index = new Map<string, string>();
  for (const [key, v] of first) if (!ambiguous.has(key)) index.set(key, v.ticker);
  return index;
}

/**
 * Fills `constituentTicker` where the filing had none; existing tickers are kept. Only equity
 * lines are matched — a company's bonds share its name but are not exposure to its stock.
 */
export function resolveConstituentTickers<
  T extends { constituentTicker: string | null; name: string; assetBucket?: string | null },
>(constituents: readonly T[], index: IssuerIndex): T[] {
  return constituents.map((c) =>
    c.constituentTicker || (c.assetBucket != null && c.assetBucket !== 'stocks')
      ? c
      : { ...c, constituentTicker: index.get(issuerNameKey(c.name)) ?? null },
  );
}
