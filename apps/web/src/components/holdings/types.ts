/** View-model types for the holdings table and editors (mirrors /api/v1 holdings DTOs). */

export type { AccountType, CsvBroker, HoldingRow, HoldingType } from '@easyfi/contracts';
import type { AccountType, CsvBroker, HoldingType } from '@easyfi/contracts';

export const HOLDING_TYPE_LABEL: Record<HoldingType, string> = {
  etf: 'ETF',
  mutual_fund: 'Mutual fund',
  stock: 'Stock',
  cash: 'Cash',
  bond: 'Bonds',
  crypto: 'Crypto',
  other: 'Other',
};

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  taxable: 'Taxable',
  trad_ira: 'Traditional IRA',
  roth_ira: 'Roth IRA',
  '401k': '401(k)',
  roth_401k: 'Roth 401(k)',
  other: 'Other',
};

export type AddHoldingInput = {
  ticker: string;
  accountType: AccountType;
  mode: 'shares' | 'dollars';
  amount: number | null;
  costBasis: number | null;
  tags: string[];
};

export type CsvImportInput = {
  broker: CsvBroker;
  /** Raw CSV text (pasted or read from the uploaded file). */
  csv: string;
};

export type TickerSuggestion = { ticker: string; name: string; type: HoldingType };
