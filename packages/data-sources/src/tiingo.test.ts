import { describe, expect, it } from 'vitest';
import prices from './__fixtures__/tiingo/voo-prices.json';
import meta from './__fixtures__/tiingo/voo-meta.json';
import iex from './__fixtures__/tiingo/iex-last.json';
import { TiingoClient, toTiingoTicker } from './tiingo';
import { fakeFetch, jsonResponse, textResponse } from './testing';

const noSleep = async () => {};

describe('toTiingoTicker', () => {
  it('maps share-class dots to dashes', () => {
    expect(toTiingoTicker('BRK.B')).toBe('BRK-B');
    expect(toTiingoTicker('voo')).toBe('VOO');
  });
});

describe('TiingoClient.eodHistory', () => {
  it('requests the EOD endpoint and maps rows to PricePoints', async () => {
    const fetch = fakeFetch(() => jsonResponse(prices));
    const c = new TiingoClient({ token: 'secret', fetch, sleep: noSleep });
    const out = await c.eodHistory('VOO', '2026-09-24', '2026-09-29');
    const url = new URL(fetch.calls[0]!.url);
    expect(url.origin + url.pathname).toBe('https://api.tiingo.com/tiingo/daily/VOO/prices');
    expect(url.searchParams.get('startDate')).toBe('2026-09-24');
    expect(url.searchParams.get('endDate')).toBe('2026-09-29');
    expect(url.searchParams.get('token')).toBe('secret');
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({ ticker: 'VOO', date: '2026-09-24', close: 605.12 });
  });

  it('keeps the caller ticker but requests the Tiingo form', async () => {
    const fetch = fakeFetch(() => jsonResponse([prices[0]]));
    const c = new TiingoClient({ token: 't', fetch, sleep: noSleep });
    const out = await c.eodHistory('BRK.B', '2026-09-24', '2026-09-24');
    expect(fetch.calls[0]!.url).toContain('/tiingo/daily/BRK-B/prices');
    expect(out[0]!.ticker).toBe('BRK.B');
  });

  it('returns [] for unknown tickers (404)', async () => {
    const fetch = fakeFetch(() => textResponse('{"detail":"Not found."}', 404));
    const c = new TiingoClient({ token: 't', fetch, sleep: noSleep });
    expect(await c.eodHistory('NOPE', '2026-01-01', '2026-01-02')).toEqual([]);
  });

  it('retries on 429 with backoff', async () => {
    const sleeps: number[] = [];
    const fetch = fakeFetch([() => textResponse('rate', 429), () => jsonResponse(prices)]);
    const c = new TiingoClient({ token: 't', fetch, sleep: async (ms) => void sleeps.push(ms) });
    expect(await c.eodHistory('VOO', '2026-09-24', '2026-09-29')).toHaveLength(4);
    expect(sleeps).toHaveLength(1);
  });

  it('does not leak the token in error messages', async () => {
    const fetch = fakeFetch(() => textResponse('bad', 401));
    const c = new TiingoClient({ token: 'supersecret', fetch, sleep: noSleep });
    const err = (await c.eodHistory('VOO', '2026-01-01', '2026-01-02').catch((e) => e)) as Error;
    expect(err.message).not.toContain('supersecret');
  });
});

describe('TiingoClient.dividends', () => {
  it('maps divCash > 0 rows to dividend events', async () => {
    const fetch = fakeFetch(() => jsonResponse(prices));
    const c = new TiingoClient({ token: 't', fetch, sleep: noSleep, today: () => '2026-10-22' });
    const out = await c.dividends('VOO', '2026-09-01');
    expect(out).toEqual([{ ticker: 'VOO', exDate: '2026-09-26', payDate: null, amount: 1.7447 }]);
    const url = new URL(fetch.calls[0]!.url);
    expect(url.searchParams.get('startDate')).toBe('2026-09-01');
    expect(url.searchParams.get('endDate')).toBe('2026-10-22');
  });
});

describe('TiingoClient.meta', () => {
  it('maps metadata to a partial Security', async () => {
    const fetch = fakeFetch(() => jsonResponse(meta));
    const c = new TiingoClient({ token: 't', fetch, sleep: noSleep });
    expect(await c.meta('VOO')).toEqual({ ticker: 'VOO', name: 'Vanguard S&P 500 ETF' });
    expect(fetch.calls[0]!.url).toMatch(
      /^https:\/\/api\.tiingo\.com\/tiingo\/daily\/VOO\?token=t$/,
    );
  });

  it('returns null on 404', async () => {
    const fetch = fakeFetch(() => textResponse('nf', 404));
    const c = new TiingoClient({ token: 't', fetch, sleep: noSleep });
    expect(await c.meta('NOPE')).toBeNull();
  });
});

describe('TiingoClient.latest', () => {
  it('fetches IEX last quotes and keys them by caller ticker; omits missing prices', async () => {
    const fetch = fakeFetch(() => jsonResponse(iex));
    const c = new TiingoClient({ token: 't', fetch, sleep: noSleep });
    const out = await c.latest(['VOO', 'BRK.B', 'QQQ']);
    const url = new URL(fetch.calls[0]!.url);
    expect(url.origin + url.pathname).toBe('https://api.tiingo.com/iex/');
    expect(url.searchParams.get('tickers')).toBe('VOO,BRK-B,QQQ');
    expect(out).toEqual({
      VOO: { close: 612.45, date: '2026-10-21', prevClose: 609.81 },
      'BRK.B': { close: 478.02, date: '2026-10-21', prevClose: 475.5 },
    });
    expect(out.QQQ).toBeUndefined();
  });

  it('batches large ticker lists', async () => {
    const fetch = fakeFetch(() => jsonResponse([]));
    const c = new TiingoClient({ token: 't', fetch, sleep: noSleep, iexBatchSize: 2 });
    await c.latest(['A', 'B', 'C']);
    expect(fetch.calls).toHaveLength(2);
  });

  it('returns {} for an empty list without calling the API', async () => {
    const fetch = fakeFetch([]);
    const c = new TiingoClient({ token: 't', fetch, sleep: noSleep });
    expect(await c.latest([])).toEqual({});
  });
});

describe('TiingoClient.eodWithDividends', () => {
  it('returns prices and dividends from a single request', async () => {
    const rows = [
      { date: '2026-09-24T00:00:00.000Z', close: 600, divCash: 0 },
      { date: '2026-09-25T00:00:00.000Z', close: 601, divCash: 1.75 },
    ];
    const fetch = fakeFetch(() => jsonResponse(rows));
    const c = new TiingoClient({ token: 't', fetch, sleep: noSleep });
    const out = await c.eodWithDividends('VOO', '2026-09-24', '2026-09-25');
    expect(fetch.calls).toHaveLength(1);
    expect(out.prices).toHaveLength(2);
    expect(out.dividends).toEqual([
      { ticker: 'VOO', exDate: '2026-09-25', payDate: null, amount: 1.75 },
    ]);
  });
});
