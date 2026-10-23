import type { PortfolioDetail } from '@easyfi/contracts';
import { Card, CardHeader } from '@/components/ui/Card';
import { MiniBar } from '@/components/ui/MiniBar';
import { cn } from '@/lib/cn';
import { formatMoney, formatPercent, MISSING } from '@/lib/format';

/** Blended expense ratio, $/yr, the costliest funds, and fees paid twice on overlapping funds. */
export function FeeDragCard({
  fees,
  className,
}: {
  fees: PortfolioDetail['feeDrag'];
  className?: string;
}) {
  const top = fees.contributions.slice(0, 5);
  return (
    <Card className={cn(className)} aria-labelledby="h-fees">
      <CardHeader
        title={<span id="h-fees">Fee drag</span>}
        meta="expense ratios at current values"
      />
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-[13px] text-muted">Blended expense ratio</dt>
          <dd className="mt-0.5 text-[22px] font-semibold text-fg">
            {fees.blendedExpenseRatio == null
              ? MISSING
              : formatPercent(fees.blendedExpenseRatio, { digits: 2 })}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted">Cost per year</dt>
          <dd className="mt-0.5 text-[22px] font-semibold text-fg">
            {formatMoney(fees.annualCost, { cents: fees.annualCost < 100 })}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted">Paid on overlapping funds</dt>
          <dd className="mt-0.5 text-[22px] font-semibold text-fg">
            {formatMoney(fees.overlapWaste.annualCost, { cents: true })}
            <span className="ml-1 text-[13px] font-normal text-muted">/yr</span>
          </dd>
        </div>
      </dl>
      {top.length ? (
        <ul className="mt-5 space-y-2.5 border-t border-line pt-4">
          {top.map((c) => (
            <li
              key={c.ticker}
              className="grid grid-cols-[64px_1fr_72px_64px] items-center gap-3 text-[13px]"
            >
              <span className="font-mono font-semibold text-fg">{c.ticker}</span>
              <MiniBar fraction={c.shareOfCost} />
              <span className="text-right text-muted">
                {formatPercent(c.expenseRatio, { digits: 2 })}
              </span>
              <span className="text-right font-medium text-fg">
                {formatMoney(c.annualCost, { cents: c.annualCost < 100 })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {fees.unknown.length ? (
        <p className="mt-3 text-[12px] text-faint">
          No expense ratio on file for {fees.unknown.join(', ')} — excluded from the blend.
        </p>
      ) : null}
    </Card>
  );
}
