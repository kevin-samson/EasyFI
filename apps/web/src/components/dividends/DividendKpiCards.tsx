import { AsOf } from '@/components/ui/AsOf';
import { Card } from '@/components/ui/Card';
import { formatMoney, formatPercent, trendClass } from '@/lib/format';

/** Whole dollars, but keep cents for small amounts so $1.35 does not read as $1. */
const money = (v: number | null) => formatMoney(v, { cents: v != null && Math.abs(v) < 100 });
import type { DividendKpis } from './types';

/** Headline cards: trailing 12 months, portfolio yield, next 30 days, next 12 months. */
export function DividendKpiCards({ kpis }: { kpis: DividendKpis }) {
  const items = [
    {
      label: 'Trailing 12 months',
      value: money(kpis.trailing12m),
      foot:
        kpis.trailing12mChange == null ? (
          <span className="text-muted">Received</span>
        ) : (
          <span className={trendClass(kpis.trailing12mChange)}>
            {formatPercent(kpis.trailing12mChange, { signed: true })} vs prior year
          </span>
        ),
    },
    {
      label: 'Portfolio yield',
      value: formatPercent(kpis.portfolioYield, { digits: 2 }),
      foot: (
        <span className="text-muted">
          {kpis.yieldOnCost == null
            ? 'On tracked market value'
            : `${formatPercent(kpis.yieldOnCost, { digits: 2 })} on cost`}
        </span>
      ),
    },
    {
      label: 'Next 30 days',
      value: money(kpis.next30Days),
      foot: <span className="text-muted">Announced &amp; estimated</span>,
    },
    {
      label: 'Next 12 months',
      value: money(kpis.projected12m),
      foot: <span className="text-muted">Projected income</span>,
    },
  ];
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((k) => (
        <Card key={k.label} className="sm:!px-7 sm:!py-6">
          <h2 className="text-[13px] font-medium text-muted">{k.label}</h2>
          <p className="mt-2.5 text-[34px] leading-none font-semibold tracking-[-0.02em] text-fg">
            {k.value}
          </p>
          <p className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[13px]">
            {k.foot}
            <AsOf date={kpis.asOf} />
          </p>
        </Card>
      ))}
    </div>
  );
}
