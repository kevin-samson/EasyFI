// Local demo mode: fixture market data + the demo user's three portfolios.
import type { Db, SeedResult } from '@easyfi/db';
import { seedFromFixtures } from '@easyfi/db';
import * as fx from '@easyfi/test-fixtures';

export const DEMO_USER_ID = fx.DEMO_USER_ID;
export const DEMO_INVITE_CODE = 'DEMO-INVITE';

/** Market data only (securities, fund books, prices, dividends, CPI). Idempotent. */
export async function seedDemoMarket(db: Db): Promise<SeedResult> {
  return seedFromFixtures(db, {
    securities: fx.securities,
    fundHoldings: fx.fundHoldings,
    prices: Object.values(fx.allPriceHistory()).flat(),
    dividends: fx.dividends,
    cpi: fx.cpi,
  });
}

/** Market data plus the demo portfolios for `userId`. Idempotent. */
export async function seedDemo(db: Db, userId: string = DEMO_USER_ID): Promise<SeedResult> {
  await seedDemoMarket(db);
  const res = await seedFromFixtures(
    db,
    {
      demoPortfolios: fx.demoPortfolios.map((p) => ({
        name: p.name,
        type: p.type,
        cash: p.cash,
        holdings: p.holdings.map((h) => ({
          ticker: h.ticker,
          accountType: h.accountType,
          shares: h.shares ?? 0,
          costBasis: h.costBasis,
          statementValue: h.statementValue,
          statementDate: h.statementDate,
          tags: h.tags,
        })),
      })),
    },
    { userId },
  );
  return res;
}

/** Date the fixture market data is "as of" — pin the clock here in demo mode and tests. */
export const DEMO_TODAY = fx.FIXTURE_TODAY;
