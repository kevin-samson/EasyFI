// 36 months of CPI-U (not seasonally adjusted, 1982-84=100) for the headline index and the
// category drivers shown on the Inflation page. Values are realistic but synthetic: each series
// grows at its trend rate with deterministic month-to-month noise.
import { gaussian, hashSeed, mulberry32 } from './prng';

export interface FixtureCpiPoint {
  seriesId: string;
  period: string;
  value: number;
}

export const CPI_FIRST_PERIOD = '2023-10';
export const CPI_LAST_PERIOD = '2026-09';
export const CPI_HEADLINE = 'CUUR0000SA0';

interface SeriesSpec {
  label: string;
  start: number;
  /** Annual trend rate. */
  annual: number;
  /** Monthly noise (fraction). */
  noise: number;
}

export const CPI_SERIES: Record<string, SeriesSpec> = {
  CUUR0000SA0: { label: 'All items', start: 307.671, annual: 0.028, noise: 0.0015 },
  CUUR0000SAF1: { label: 'Food', start: 325.6, annual: 0.026, noise: 0.002 },
  CUUR0000SA0E: { label: 'Energy', start: 286.8, annual: 0.004, noise: 0.025 },
  CUUR0000SAH1: { label: 'Shelter', start: 381.2, annual: 0.045, noise: 0.0015 },
  CUUR0000SAM: { label: 'Medical care', start: 558.4, annual: 0.031, noise: 0.002 },
  CUUR0000SAA: { label: 'Apparel', start: 128.9, annual: 0.006, noise: 0.01 },
  CUUR0000SAT: { label: 'Transportation', start: 270.3, annual: 0.018, noise: 0.008 },
  CUUR0000SETA02: { label: 'Used cars and trucks', start: 183.4, annual: -0.012, noise: 0.012 },
  CUUR0000SA0L1E: {
    label: 'All items less food and energy',
    start: 311.2,
    annual: 0.031,
    noise: 0.0012,
  },
};

function periods(): string[] {
  const out: string[] = [];
  let [y, m] = CPI_FIRST_PERIOD.split('-').map(Number) as [number, number];
  for (let i = 0; i < 36; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function series(seriesId: string, spec: SeriesSpec): FixtureCpiPoint[] {
  const rand = mulberry32(hashSeed(`cpi:${seriesId}`));
  const monthly = Math.pow(1 + spec.annual, 1 / 12);
  let trend = spec.start;
  return periods().map((period, i) => {
    if (i > 0) trend *= monthly;
    const value = i === 0 ? spec.start : trend * (1 + spec.noise * gaussian(rand));
    return { seriesId, period, value: Math.round(value * 1000) / 1000 };
  });
}

export const cpi: FixtureCpiPoint[] = Object.entries(CPI_SERIES).flatMap(([id, spec]) =>
  series(id, spec),
);

export function cpiSeries(seriesId: string): FixtureCpiPoint[] {
  return cpi.filter((p) => p.seriesId === seriesId);
}
