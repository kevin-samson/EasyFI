import { AsOf } from '@/components/ui/AsOf';
import { Card, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { formatPercent } from '@/lib/format';
import type { CpiCategory } from './types';

/**
 * Category drivers: diverging bars around zero (rising prices right, falling left),
 * sorted by year-over-year change.
 */
export function CpiDriversCard({
  categories,
  asOf,
}: {
  categories: CpiCategory[];
  asOf?: string | null;
}) {
  const sorted = [...categories].sort((a, b) => (b.yoy ?? 0) - (a.yoy ?? 0));
  const maxAbs = Math.max(...sorted.map((c) => Math.abs(c.yoy ?? 0)), 0.0001);
  return (
    <Card>
      <CardHeader
        title="What is moving prices"
        meta="12-month change by category"
        actions={asOf !== undefined ? <AsOf date={asOf} prefix="released" /> : undefined}
      />
      {sorted.length === 0 ? (
        <p className="mt-5 text-[13px] text-muted">Category data is not available yet.</p>
      ) : null}
      <ul className="mt-5 space-y-3.5">
        {sorted.map((c) => {
          const v = c.yoy ?? 0;
          const w = (Math.abs(v) / maxAbs) * 100;
          return (
            <li
              key={c.key}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_52px] items-center gap-3 text-[13px]"
            >
              <span className="min-w-0">
                <span className="block truncate text-fg">{c.label}</span>
                <span className="text-[11px] text-faint">
                  {formatPercent(c.weight, { digits: 0 })} of the basket
                </span>
              </span>
              <span className="relative grid h-2 grid-cols-2" aria-hidden>
                <span className="relative">
                  {v < 0 ? (
                    <span
                      className="absolute inset-y-0 right-0 rounded-l-full bg-up"
                      style={{ width: `${w}%` }}
                    />
                  ) : null}
                </span>
                <span className="relative border-l border-line-strong">
                  {v > 0 ? (
                    <span
                      className="absolute inset-y-0 left-0 rounded-r-full bg-c4"
                      style={{ width: `${w}%` }}
                    />
                  ) : null}
                </span>
              </span>
              <span
                className={cn(
                  'text-right font-semibold',
                  v > 0 ? 'text-warn' : v < 0 ? 'text-up' : 'text-muted',
                )}
              >
                {formatPercent(c.yoy, { signed: true })}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
