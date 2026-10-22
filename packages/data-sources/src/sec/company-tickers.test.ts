import { describe, expect, it } from 'vitest';
import { fakeFetch, jsonResponse } from '../testing';
import { fetchSecCompanyTickers, parseCompanyTickers } from './company-tickers';

const file = {
  '0': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
  '1': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
  '2': { cik_str: 1067983, ticker: 'BRK-B', title: 'BERKSHIRE HATHAWAY INC' },
  '3': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
  '4': { cik_str: 1, ticker: '', title: 'No ticker' },
};

describe('parseCompanyTickers', () => {
  it('maps to stock securities, dedupes, normalises BRK-B to BRK.B, skips blanks', () => {
    expect(parseCompanyTickers(file)).toEqual([
      { ticker: 'NVDA', name: 'NVIDIA CORP', cik: '1045810', type: 'stock' },
      { ticker: 'AAPL', name: 'Apple Inc.', cik: '320193', type: 'stock' },
      { ticker: 'BRK.B', name: 'BERKSHIRE HATHAWAY INC', cik: '1067983', type: 'stock' },
    ]);
  });
});

describe('fetchSecCompanyTickers', () => {
  it('sends the SEC user agent', async () => {
    const fetch = fakeFetch(() => jsonResponse(file));
    const out = await fetchSecCompanyTickers({ userAgent: 'EasyFI test@example.com', fetch });
    expect(out).toHaveLength(3);
    expect(fetch.calls[0]!.url).toBe('https://www.sec.gov/files/company_tickers.json');
    expect(new Headers(fetch.calls[0]!.init?.headers).get('user-agent')).toBe(
      'EasyFI test@example.com',
    );
  });
});
