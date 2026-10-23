import type { CompareFund } from './types';

/** Short display label: the ticker for a fund, the name for a portfolio (its "ticker" is an id). */
export function compareLabel(f: Pick<CompareFund, 'kind' | 'ticker' | 'name'>): string {
  return f.kind === 'portfolio' ? f.name : f.ticker;
}
