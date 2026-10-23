// Seed list of widely held funds so search, compare and the nightly job work before anyone
// holds them. Expense ratios are fractions (0.0003 = 0.03%), approximate as of 2026.
import type { Db, SecurityInput } from '@easyfi/db';
import { createRepos } from '@easyfi/db';

type Row = [ticker: string, name: string, er: number, type?: SecurityInput['type']];

const ROWS: Row[] = [
  ['VOO', 'Vanguard S&P 500 ETF', 0.0003],
  ['IVV', 'iShares Core S&P 500 ETF', 0.0003],
  ['SPY', 'SPDR S&P 500 ETF Trust', 0.000945],
  ['SPLG', 'SPDR Portfolio S&P 500 ETF', 0.0002],
  ['RSP', 'Invesco S&P 500 Equal Weight ETF', 0.002],
  ['VTI', 'Vanguard Total Stock Market ETF', 0.0003],
  ['ITOT', 'iShares Core S&P Total U.S. Stock Market ETF', 0.0003],
  ['SCHB', 'Schwab U.S. Broad Market ETF', 0.0003],
  ['SCHX', 'Schwab U.S. Large-Cap ETF', 0.0003],
  ['QQQ', 'Invesco QQQ Trust', 0.002],
  ['QQQM', 'Invesco NASDAQ 100 ETF', 0.0015],
  ['VUG', 'Vanguard Growth ETF', 0.0004],
  ['SCHG', 'Schwab U.S. Large-Cap Growth ETF', 0.0004],
  ['IWF', 'iShares Russell 1000 Growth ETF', 0.0019],
  ['VTV', 'Vanguard Value ETF', 0.0004],
  ['SCHD', 'Schwab U.S. Dividend Equity ETF', 0.0006],
  ['VYM', 'Vanguard High Dividend Yield ETF', 0.0006],
  ['DGRO', 'iShares Core Dividend Growth ETF', 0.0008],
  ['JEPI', 'JPMorgan Equity Premium Income ETF', 0.0035],
  ['VGT', 'Vanguard Information Technology ETF', 0.0009],
  ['XLK', 'Technology Select Sector SPDR Fund', 0.0008],
  ['SMH', 'VanEck Semiconductor ETF', 0.0035],
  ['SPMO', 'Invesco S&P 500 Momentum ETF', 0.0013],
  ['MTUM', 'iShares MSCI USA Momentum Factor ETF', 0.0015],
  ['DIA', 'SPDR Dow Jones Industrial Average ETF Trust', 0.0016],
  ['IWM', 'iShares Russell 2000 ETF', 0.0019],
  ['VB', 'Vanguard Small-Cap ETF', 0.0005],
  ['VO', 'Vanguard Mid-Cap ETF', 0.0004],
  ['VXUS', 'Vanguard Total International Stock ETF', 0.0005],
  ['VEA', 'Vanguard FTSE Developed Markets ETF', 0.0003],
  ['VWO', 'Vanguard FTSE Emerging Markets ETF', 0.0007],
  ['IEFA', 'iShares Core MSCI EAFE ETF', 0.0007],
  ['VT', 'Vanguard Total World Stock ETF', 0.0006],
  ['BND', 'Vanguard Total Bond Market ETF', 0.0003],
  ['AGG', 'iShares Core U.S. Aggregate Bond ETF', 0.0003],
  ['BNDX', 'Vanguard Total International Bond ETF', 0.0007],
  ['VNQ', 'Vanguard Real Estate ETF', 0.0013],
  ['GLD', 'SPDR Gold Shares', 0.004],
  ['IBIT', 'iShares Bitcoin Trust ETF', 0.0025],
  ['FXAIX', 'Fidelity 500 Index Fund', 0.00015, 'mutual_fund'],
  ['FSKAX', 'Fidelity Total Market Index Fund', 0.00015, 'mutual_fund'],
  ['FZROX', 'Fidelity ZERO Total Market Index Fund', 0, 'mutual_fund'],
  ['VFIAX', 'Vanguard 500 Index Fund Admiral Shares', 0.0004, 'mutual_fund'],
  ['VTSAX', 'Vanguard Total Stock Market Index Fund Admiral Shares', 0.0004, 'mutual_fund'],
  ['SWPPX', 'Schwab S&P 500 Index Fund', 0.0002, 'mutual_fund'],
  ['SWTSX', 'Schwab Total Stock Market Index Fund', 0.0003, 'mutual_fund'],
  ['SPAXX', 'Fidelity Government Money Market Fund', 0.0042, 'mmf'],
  ['VMFXX', 'Vanguard Federal Money Market Fund', 0.0011, 'mmf'],
  ['SWVXX', 'Schwab Prime Advantage Money Fund', 0.0034, 'mmf'],
];

export const POPULAR_SECURITIES: SecurityInput[] = ROWS.map(([ticker, name, er, type]) => ({
  ticker,
  name,
  type: type ?? 'etf',
  expenseRatio: er,
}));

/** Funds whose prices / holdings the nightly job keeps fresh even when nobody holds them. */
export const SEEDED_FUND_TICKERS: string[] = POPULAR_SECURITIES.filter((s) => s.type !== 'mmf').map(
  (s) => s.ticker,
);

/** Inserts the popular funds that are missing; never overwrites richer existing rows. */
export async function seedPopularSecurities(db: Db): Promise<number> {
  const repos = createRepos(db);
  const existing = new Set(
    (await repos.securities.getMany(POPULAR_SECURITIES.map((s) => s.ticker))).map((s) => s.ticker),
  );
  const missing = POPULAR_SECURITIES.filter((s) => !existing.has(s.ticker));
  await repos.securities.upsert(missing);
  return missing.length;
}
