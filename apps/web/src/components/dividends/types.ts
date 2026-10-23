export type {
  AccountType,
  DividendKpis,
  DividendPayment,
  HoldingIncomeRow,
  IncomeMonth,
  PayoutFrequency,
  YieldLeader,
} from '@easyfi/contracts';
import type { AccountType, PayoutFrequency } from '@easyfi/contracts';

export const FREQUENCY_LABEL: Record<PayoutFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semiannual: 'Semiannual',
  annual: 'Annual',
  irregular: 'Irregular',
};

export const ACCOUNT_LABEL: Record<AccountType, string> = {
  taxable: 'Taxable',
  trad_ira: 'Traditional IRA',
  roth_ira: 'Roth IRA',
  '401k': '401(k)',
  roth_401k: 'Roth 401(k)',
  other: 'Other',
};
