/**
 * Categorical chart palette. Index order is stable so the same series keeps its color
 * across donuts, stacked bars and constellation hubs. "Other" is always slate.
 */
export const CHART_COLORS = [
  'var(--c1)',
  'var(--c2)',
  'var(--c3)',
  'var(--c4)',
  'var(--c5)',
  'var(--c6)',
] as const;
export const OTHER_COLOR = 'var(--c-other)';
/** Slice we could not look through (fund without holdings data). */
export const UNRESOLVED_COLOR = 'var(--c-unresolved, var(--faint))';

export function seriesColor(index: number, label?: string) {
  if (label && /^other$/i.test(label)) return OTHER_COLOR;
  if (label && /^no look-through data$/i.test(label)) return UNRESOLVED_COLOR;
  return CHART_COLORS[index % CHART_COLORS.length] ?? OTHER_COLOR;
}

/** Stable color for a fund ticker given the ordered list of funds in view. */
export function fundColor(ticker: string, fundOrder: readonly string[]) {
  const i = fundOrder.indexOf(ticker);
  return i < 0 ? OTHER_COLOR : seriesColor(i);
}

export type Concentration = 'high' | 'medium' | 'low';

/** Diversification score color: red < 20, amber < 60, green otherwise. */
export function scoreClass(score: number | null | undefined) {
  if (score == null) return 'text-muted';
  if (score < 20) return 'text-down';
  if (score < 60) return 'text-warn';
  return 'text-up';
}
