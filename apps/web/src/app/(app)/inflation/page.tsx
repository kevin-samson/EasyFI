import type { Metadata } from 'next';
import { CpiDriversCard } from '@/components/inflation/CpiDriversCard';
import { CpiHeadlineCard } from '@/components/inflation/CpiHeadlineCard';
import { PurchasingPowerCalculator } from '@/components/inflation/PurchasingPowerCalculator';
import { PURCHASING_POWER_DEFAULTS } from '@/components/inflation/types';
import { PageHeader } from '@/components/shell/PageHeader';
import { formatMonth } from '@/lib/format';
import { load, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Inflation' };

export default async function InflationPage() {
  const api = await serverApi();
  const { cpi, categories, trackedValue } = await load(api.GET('/inflation'));

  const hasTracked = trackedValue != null && trackedValue > 0;
  const initial = {
    ...PURCHASING_POWER_DEFAULTS,
    ...(hasTracked ? { amount: Math.round(trackedValue) } : null),
    ...(cpi.yoy != null ? { inflationRate: Math.round(cpi.yoy * 1000) / 1000 } : null),
  };
  return (
    <>
      <PageHeader
        title="Inflation"
        subtitle="How fast prices rise, and what that does to your savings."
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <CpiHeadlineCard cpi={cpi} />
        <CpiDriversCard categories={categories} asOf={cpi.asOf} />
      </div>
      <div className="mt-5">
        <PurchasingPowerCalculator
          initial={initial}
          amountNote={hasTracked ? 'Your total tracked value' : undefined}
          inflationNote={
            cpi.yoy != null && cpi.period
              ? `Latest CPI, ${formatMonth(cpi.period, true)}`
              : undefined
          }
        />
      </div>
    </>
  );
}
