import { securitiesRepo, type Db } from '@easyfi/db';

/**
 * Popular US ETFs searchable before anyone adds them. Names only: expense ratios and holdings are
 * filled by the nightly job from real sources (never hand-typed fee numbers).
 * UIT funds (SPY, QQQ, DIA) file no N-PORT — their look-through needs seeded holdings (PLAN M3 note).
 */
export const POPULAR_ETFS: readonly { ticker: string; name: string }[] = [
  { ticker: 'VOO', name: 'Vanguard S&P 500 ETF' },
  { ticker: 'VTI', name: 'Vanguard Total Stock Market ETF' },
  { ticker: 'VT', name: 'Vanguard Total World Stock ETF' },
  { ticker: 'VXUS', name: 'Vanguard Total International Stock ETF' },
  { ticker: 'VEA', name: 'Vanguard FTSE Developed Markets ETF' },
  { ticker: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF' },
  { ticker: 'VUG', name: 'Vanguard Growth ETF' },
  { ticker: 'VTV', name: 'Vanguard Value ETF' },
  { ticker: 'VIG', name: 'Vanguard Dividend Appreciation ETF' },
  { ticker: 'VYM', name: 'Vanguard High Dividend Yield ETF' },
  { ticker: 'VGT', name: 'Vanguard Information Technology ETF' },
  { ticker: 'VNQ', name: 'Vanguard Real Estate ETF' },
  { ticker: 'BND', name: 'Vanguard Total Bond Market ETF' },
  { ticker: 'BNDX', name: 'Vanguard Total International Bond ETF' },
  { ticker: 'IVV', name: 'iShares Core S&P 500 ETF' },
  { ticker: 'ITOT', name: 'iShares Core S&P Total U.S. Stock Market ETF' },
  { ticker: 'IJH', name: 'iShares Core S&P Mid-Cap ETF' },
  { ticker: 'IJR', name: 'iShares Core S&P Small-Cap ETF' },
  { ticker: 'IWM', name: 'iShares Russell 2000 ETF' },
  { ticker: 'IWF', name: 'iShares Russell 1000 Growth ETF' },
  { ticker: 'IWD', name: 'iShares Russell 1000 Value ETF' },
  { ticker: 'IEFA', name: 'iShares Core MSCI EAFE ETF' },
  { ticker: 'IEMG', name: 'iShares Core MSCI Emerging Markets ETF' },
  { ticker: 'QUAL', name: 'iShares MSCI USA Quality Factor ETF' },
  { ticker: 'USMV', name: 'iShares MSCI USA Min Vol Factor ETF' },
  { ticker: 'AGG', name: 'iShares Core U.S. Aggregate Bond ETF' },
  { ticker: 'SCHD', name: 'Schwab U.S. Dividend Equity ETF' },
  { ticker: 'SCHB', name: 'Schwab U.S. Broad Market ETF' },
  { ticker: 'SCHX', name: 'Schwab U.S. Large-Cap ETF' },
  { ticker: 'SCHG', name: 'Schwab U.S. Large-Cap Growth ETF' },
  { ticker: 'SCHF', name: 'Schwab International Equity ETF' },
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust' },
  { ticker: 'SPLG', name: 'SPDR Portfolio S&P 500 ETF' },
  { ticker: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF Trust' },
  { ticker: 'XLK', name: 'Technology Select Sector SPDR Fund' },
  { ticker: 'XLF', name: 'Financial Select Sector SPDR Fund' },
  { ticker: 'XLV', name: 'Health Care Select Sector SPDR Fund' },
  { ticker: 'XLY', name: 'Consumer Discretionary Select Sector SPDR Fund' },
  { ticker: 'XLP', name: 'Consumer Staples Select Sector SPDR Fund' },
  { ticker: 'XLE', name: 'Energy Select Sector SPDR Fund' },
  { ticker: 'XLI', name: 'Industrial Select Sector SPDR Fund' },
  { ticker: 'XLB', name: 'Materials Select Sector SPDR Fund' },
  { ticker: 'XLU', name: 'Utilities Select Sector SPDR Fund' },
  { ticker: 'XLRE', name: 'Real Estate Select Sector SPDR Fund' },
  { ticker: 'XLC', name: 'Communication Services Select Sector SPDR Fund' },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust' },
  { ticker: 'QQQM', name: 'Invesco NASDAQ 100 ETF' },
  { ticker: 'RSP', name: 'Invesco S&P 500 Equal Weight ETF' },
  { ticker: 'SPMO', name: 'Invesco S&P 500 Momentum ETF' },
  { ticker: 'JEPI', name: 'JPMorgan Equity Premium Income ETF' },
];

/** Inserts catalog ETFs that are missing; existing rows (with fees/sectors from jobs) are untouched. */
export async function seedCatalog(db: Db): Promise<number> {
  const repo = securitiesRepo(db);
  const have = new Set(
    (await repo.getMany(POPULAR_ETFS.map((e) => e.ticker))).map((s) => s.ticker),
  );
  const missing = POPULAR_ETFS.filter((e) => !have.has(e.ticker));
  if (missing.length) await repo.upsert(missing.map((e) => ({ ...e, type: 'etf' as const })));
  return missing.length;
}
