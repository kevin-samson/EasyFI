import { Sparkline } from '@/components/charts/Sparkline';
import { AsOf } from '@/components/ui/AsOf';
import { Card } from '@/components/ui/Card';
import { formatMonth, formatPercent } from '@/lib/format';
import type { CpiSnapshot } from './types';

/** Headline CPI: year-over-year, month-over-month, core, and a 12-month sparkline. */
export function CpiHeadlineCard({ cpi }: { cpi: CpiSnapshot }) {
  const first = cpi.history[0];
  const last = cpi.history[cpi.history.length - 1];
  return (
    <Card className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-medium text-muted">
          Consumer prices, {cpi.period ? formatMonth(cpi.period, true) : 'latest'}
        </h2>
        <AsOf date={cpi.asOf} prefix="released" />
      </div>
      <div className="mt-2 flex items-end gap-6">
        <div>
          <div className="text-[34px] leading-9 font-semibold tracking-[-0.02em] text-fg">
            {formatPercent(cpi.yoy)}
          </div>
          <div className="mt-1 text-[13px] text-muted">over the past 12 months</div>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-[13px]">
        <div>
          <dt className="text-muted">Month over month</dt>
          <dd className="mt-0.5 text-[17px] font-semibold text-fg">
            {formatPercent(cpi.mom, { signed: true })}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Core (ex food &amp; energy)</dt>
          <dd className="mt-0.5 text-[17px] font-semibold text-fg">{formatPercent(cpi.coreYoy)}</dd>
        </div>
      </dl>
      {cpi.history.length > 1 ? (
        <div className="mt-auto pt-6">
          <Sparkline
            values={cpi.history.map((h) => h.yoy)}
            height={120}
            color="var(--c4)"
            label="Annual CPI rate over the last 12 months"
          />
          {first && last ? (
            <div className="mt-1 flex justify-between text-[11px] text-faint">
              <span>{formatMonth(first.period, true)}</span>
              <span>{formatMonth(last.period, true)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
