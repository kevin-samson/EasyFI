import type { Comparison } from '@easyfi/contracts';

export type { CompareFund, SharedHolding } from '@easyfi/contracts';

export type CompareMode = 'sector' | 'holdings';

/** One entry in the fund/portfolio pickers (value = ticker or portfolio id). */
export type CompareOption = Comparison['options'][number];
