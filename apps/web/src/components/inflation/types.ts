export type { CpiCategory, CpiSnapshot } from '@easyfi/contracts';

export type PurchasingPowerInput = {
  amount: number;
  monthlyContribution: number;
  inflationRate: number;
  growthRate: number;
  years: number;
};

/** Calculator defaults (the inflation page overrides amount/inflation with live values). */
export const PURCHASING_POWER_DEFAULTS: PurchasingPowerInput = {
  amount: 75_000,
  monthlyContribution: 500,
  inflationRate: 0.029,
  growthRate: 0.06,
  years: 20,
};
