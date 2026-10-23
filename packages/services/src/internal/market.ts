import {
  DEFAULT_LOOK_THROUGH_DEPTH,
  FUND_EQUIVALENTS,
  isCashTicker,
  isFundSecurity,
  normalizeTicker,
  type FundHoldingsMap,
  type LatestPrices,
  type SecurityMap,
} from '@easyfi/core';
import type { Repos } from '@easyfi/db';
import { toFundHoldingsMap, toLatestPrices, toSecurityMap } from './mappers';

/** Everything core needs to value and look through a set of held tickers. */
export interface MarketData {
  securities: SecurityMap;
  prices: LatestPrices;
  fundHoldings: FundHoldingsMap;
}

/**
 * Loads securities, latest prices and fund books for `tickers`, following fund-of-funds and
 * index-equivalent books (FXAIX → VOO) up to the look-through depth. Constituent prices are
 * loaded too (used for "today" changes) — only tickers we store prices for come back.
 */
export async function loadMarket(repos: Repos, tickers: readonly string[]): Promise<MarketData> {
  const held = [...new Set(tickers.map(normalizeTicker).filter((t) => !isCashTicker(t)))];
  const securities: SecurityMap = toSecurityMap(await repos.securities.getMany(held));
  const fundHoldings: FundHoldingsMap = {};

  let frontier = held.filter((t) => isFundSecurity(securities[t]) || FUND_EQUIVALENTS[t]);
  const requested = new Set<string>();
  for (let depth = 0; depth < DEFAULT_LOOK_THROUGH_DEPTH && frontier.length; depth++) {
    const want = new Set<string>();
    for (const f of frontier) {
      want.add(f);
      for (const alt of FUND_EQUIVALENTS[f] ?? []) want.add(alt);
    }
    const ask = [...want].filter((t) => !requested.has(t));
    ask.forEach((t) => requested.add(t));
    if (!ask.length) break;
    Object.assign(fundHoldings, toFundHoldingsMap(await repos.fundHoldings.latest(ask)));

    // constituents that are themselves funds → next level
    const constituentTickers = new Set<string>();
    for (const t of ask) {
      for (const c of fundHoldings[t]?.constituents ?? []) {
        if (c.constituentTicker && !securities[c.constituentTicker])
          constituentTickers.add(c.constituentTicker);
      }
    }
    if (constituentTickers.size) {
      Object.assign(
        securities,
        toSecurityMap(await repos.securities.getMany([...constituentTickers])),
      );
    }
    frontier = [...constituentTickers].filter((t) => isFundSecurity(securities[t]));
  }

  const priceTickers = new Set(held);
  for (const snap of Object.values(fundHoldings)) {
    for (const c of snap.constituents)
      if (c.constituentTicker) priceTickers.add(c.constituentTicker);
  }
  const prices = toLatestPrices(await repos.prices.latest([...priceTickers]));
  return { securities, prices, fundHoldings };
}
