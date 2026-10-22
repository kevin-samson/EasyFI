import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import tickers from './__fixtures__/company_tickers_mf.json';
import submissions from './__fixtures__/submissions-36405.json';
import { SecEdgarClient, parseMutualFundTickers } from './edgar';
import { fakeFetch, jsonResponse, textResponse } from '../testing';

const xml = readFileSync(new URL('./__fixtures__/primary_doc.xml', import.meta.url), 'utf8');
const UA = 'EasyFI test admin@example.com';
const noWait = async () => {};

const header = (series: string) =>
  `<SEC-HEADER>\n<SERIES-AND-CLASSES-CONTRACTS-DATA>\n<EXISTING-SERIES-AND-CLASSES-CONTRACTS>\n<SERIES>\n<OWNER-CIK>0000036405\n<SERIES-ID>${series}\n<SERIES-NAME>Some fund\n</SERIES>\n</EXISTING-SERIES-AND-CLASSES-CONTRACTS>\n</SERIES-AND-CLASSES-CONTRACTS-DATA>\n</SEC-HEADER>`;

/** Routes by URL; unknown URLs 404. */
function router(routes: Record<string, () => Response>) {
  return fakeFetch((url) => {
    const r = routes[url];
    return r ? r() : textResponse('not found', 404);
  });
}

const TICKERS_URL = 'https://www.sec.gov/files/company_tickers_mf.json';
const SUBS_URL = 'https://data.sec.gov/submissions/CIK0000036405.json';
const seriesAtom = (series: string) =>
  `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${series}&type=NPORT-P&dateb=&owner=include&count=1&output=atom`;
const archive = (acc: string, file: string) =>
  `https://www.sec.gov/Archives/edgar/data/36405/${acc.replace(/-/g, '')}/${file}`;

describe('parseMutualFundTickers', () => {
  it('maps symbols to cik/series/class using the fields header', () => {
    const map = parseMutualFundTickers(tickers);
    expect(map.get('VOO')).toEqual({ cik: 36405, seriesId: 'S000002277', classId: 'C000092055' });
    expect(map.size).toBe(5);
  });
});

describe('SecEdgarClient', () => {
  it('requires a User-Agent', () => {
    expect(() => new SecEdgarClient({ userAgent: '' })).toThrow(/User-Agent/);
  });

  it('finds the latest NPORT-P for the series and parses its holdings', async () => {
    const fetch = router({
      [TICKERS_URL]: () => jsonResponse(tickers),
      [SUBS_URL]: () => jsonResponse(submissions),
      [archive('0001752724-26-200003', '0001752724-26-200003.hdr.sgml')]: () =>
        textResponse(header('S000002848')),
      [archive('0001752724-26-200002', '0001752724-26-200002.hdr.sgml')]: () =>
        textResponse(header('S000002277')),
      [archive('0001752724-26-200002', 'primary_doc.xml')]: () => textResponse(xml),
    });
    const c = new SecEdgarClient({
      userAgent: UA,
      fetch,
      rateLimit: noWait,
      cusipToTicker: { '084670702': 'BRK.B' },
    });
    const out = await c.latestHoldings('voo');
    expect(out?.asOf).toBe('2026-06-30');
    expect(out?.constituents).toHaveLength(6);
    expect(out?.constituents[0]).toMatchObject({ fundTicker: 'VOO', constituentTicker: 'AAPL' });
    expect(out?.constituents.find((x) => x.constituentTicker === 'BRK.B')).toBeTruthy();

    for (const call of fetch.calls) {
      expect(new Headers(call.init?.headers).get('User-Agent')).toBe(UA);
    }
    // Never downloaded the non-matching filing's (large) primary doc.
    expect(
      fetch.calls.some((x) => x.url === archive('0001752724-26-200003', 'primary_doc.xml')),
    ).toBe(false);
  });

  it('falls back to checking genInfo/seriesId in primary_doc when headers are unavailable', async () => {
    const otherSeriesXml = xml.replace(/S000002277/g, 'S000002848');
    const fetch = router({
      [TICKERS_URL]: () => jsonResponse(tickers),
      [SUBS_URL]: () => jsonResponse(submissions),
      [archive('0001752724-26-200003', 'primary_doc.xml')]: () => textResponse(otherSeriesXml),
      [archive('0001752724-26-200002', 'primary_doc.xml')]: () => textResponse(xml),
    });
    const c = new SecEdgarClient({ userAgent: UA, fetch, rateLimit: noWait });
    const filing = await c.latestFiling('VOO');
    expect(filing).toMatchObject({
      cik: 36405,
      seriesId: 'S000002277',
      accessionNumber: '0001752724-26-200002',
      reportDate: '2026-06-30',
    });
  });

  it('caches the ticker file and accession→series lookups across calls', async () => {
    const fetch = router({
      [TICKERS_URL]: () => jsonResponse(tickers),
      [SUBS_URL]: () => jsonResponse(submissions),
      [archive('0001752724-26-200003', '0001752724-26-200003.hdr.sgml')]: () =>
        textResponse(header('S000002848')),
      [archive('0001752724-26-200002', '0001752724-26-200002.hdr.sgml')]: () =>
        textResponse(header('S000002277')),
    });
    const c = new SecEdgarClient({ userAgent: UA, fetch, rateLimit: noWait });
    await c.latestFiling('VOO');
    const before = fetch.calls.length;
    const vti = await c.latestFiling('VTI');
    expect(vti?.accessionNumber).toBe('0001752724-26-200003');
    const newUrls = fetch.calls.slice(before).map((x) => x.url);
    // Series lookup first (404 here), then the cached-ticker scan path re-reads submissions only.
    expect(newUrls).toEqual([seriesAtom('S000002848'), SUBS_URL]);
  });

  it('returns null for tickers not in the SEC fund list (e.g. UITs)', async () => {
    const fetch = router({ [TICKERS_URL]: () => jsonResponse(tickers) });
    const c = new SecEdgarClient({ userAgent: UA, fetch, rateLimit: noWait });
    expect(await c.latestHoldings('SPY')).toBeNull();
  });

  it('supports explicit ticker overrides', async () => {
    const fetch = router({
      [SUBS_URL]: () => jsonResponse(submissions),
      [archive('0001752724-26-200003', '0001752724-26-200003.hdr.sgml')]: () =>
        textResponse(header('S000002848')),
    });
    const c = new SecEdgarClient({
      userAgent: UA,
      fetch,
      rateLimit: noWait,
      tickerOverrides: { MYETF: { cik: 36405, seriesId: 'S000002848' } },
    });
    expect((await c.latestFiling('MYETF'))?.seriesId).toBe('S000002848');
    expect(fetch.calls.some((x) => x.url === TICKERS_URL)).toBe(false);
  });

  it('returns null when the filer has no submissions or matching filing', async () => {
    const fetch = router({
      [TICKERS_URL]: () => jsonResponse(tickers),
      [SUBS_URL]: () => jsonResponse(submissions),
    });
    const c = new SecEdgarClient({ userAgent: UA, fetch, rateLimit: noWait, maxFilingsToScan: 2 });
    expect(await c.latestHoldings('SCHD')).toBeNull();
  });

  it('finds the filing directly by series id (big trusts like iShares) without scanning submissions', async () => {
    const atom = `<?xml version="1.0"?><feed><entry><content><accession-number>0001752724-26-200002</accession-number><filing-date>2026-08-25</filing-date><filing-href>https://www.sec.gov/Archives/edgar/data/36405/000175272426200002/0001752724-26-200002-index.htm</filing-href></content></entry></feed>`;
    const fetch = router({
      [TICKERS_URL]: () => jsonResponse(tickers),
      [seriesAtom('S000002277')]: () => textResponse(atom),
      [archive('0001752724-26-200002', 'primary_doc.xml')]: () => textResponse(xml),
    });
    const c = new SecEdgarClient({ userAgent: UA, fetch, rateLimit: noWait });
    const out = await c.latestHoldings('VOO');
    expect(out?.asOf).toBe('2026-06-30');
    expect(out?.constituents).toHaveLength(6);
    expect(fetch.calls.some((x) => x.url === SUBS_URL)).toBe(false);
  });

  it('passes every request through the rate limiter', async () => {
    let waits = 0;
    const fetch = router({ [TICKERS_URL]: () => jsonResponse(tickers) });
    const c = new SecEdgarClient({ userAgent: UA, fetch, rateLimit: async () => void waits++ });
    await c.latestHoldings('SPY');
    expect(waits).toBe(fetch.calls.length);
  });
});
