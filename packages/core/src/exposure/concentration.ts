import {
  CONCENTRATION_HIGH_WEIGHT,
  CONCENTRATION_MEDIUM_FUND_COUNT,
  INSIGHT_THRESHOLDS,
} from './constants';
import type { Exposure } from './types';

export type ConcentrationLevel = 'high' | 'medium' | 'low';

/**
 * high   – an operating company (kind 'company') ≥ CONCENTRATION_HIGH_WEIGHT of the total
 * medium – reached through ≥ CONCENTRATION_MEDIUM_FUND_COUNT funds (overlap)
 * low    – everything else; tails, unmapped lines and cash are never flagged
 */
export function concentration(
  exposure: Pick<Exposure, 'kind' | 'weight' | 'fundCount'>,
): ConcentrationLevel {
  if (exposure.kind === 'tail' || exposure.kind === 'unmapped' || exposure.kind === 'cash')
    return 'low';
  if (exposure.kind === 'company' && exposure.weight >= CONCENTRATION_HIGH_WEIGHT) return 'high';
  if (exposure.fundCount >= CONCENTRATION_MEDIUM_FUND_COUNT) return 'medium';
  return 'low';
}

/** Weight thresholds [high, medium] for folded groups (a sector is expected to be larger). */
const GROUP_THRESHOLDS = {
  sector: [INSIGHT_THRESHOLDS.sectorHigh, INSIGHT_THRESHOLDS.sectorMedium],
  industry: [0.25, 0.1],
  asset: [1.01, 1.01],
} as const;

/** Concentration of a folded group (sector / industry / asset bucket) by its weight alone. */
export function groupConcentration(
  weight: number,
  by: 'sector' | 'industry' | 'asset',
): ConcentrationLevel {
  const [high, medium] = GROUP_THRESHOLDS[by];
  return weight >= high ? 'high' : weight >= medium ? 'medium' : 'low';
}
