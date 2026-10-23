import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { formatPercent } from '@/lib/format';
import type { SharedHolding } from './types';

export type SharedHoldingsTableProps = {
  /** Column labels for each side (fund ticker or portfolio name). */
  labelA: string;
  labelB: string;
  holdings: SharedHolding[];
  /** Total companies held by both funds (may exceed rows shown). */
  sharedCount: number;
  /** Sum over shared names of min(weightA, weightB), fraction. */
  overlapByWeight: number | null;
  /** Rows shown before "Show all" (server-driven via `showAllHref`). */
  limit?: number;
  /** When set and rows exceed `limit`, a link to the full list. */
  showAllHref?: string;
  /** Link back to the collapsed list when the full list is shown. */
  showLessHref?: string;
};

/** Weight cell: tiny but non-zero weights read "<0.1%" rather than a misleading "0.0%". */
function weight(w: number | null) {
  return w != null && w > 0 && w < 0.0005 ? '<0.1%' : formatPercent(w);
}

/** Companies held by both funds with each fund's weight and a combined bar. */
export function SharedHoldingsTable({
  labelA,
  labelB,
  holdings,
  sharedCount,
  overlapByWeight,
  limit,
  showAllHref,
  showLessHref,
}: SharedHoldingsTableProps) {
  const rows = limit != null ? holdings.slice(0, limit) : holdings;
  const combined = rows.map((h) => (h.weightA ?? 0) + (h.weightB ?? 0));
  const max = Math.max(...combined, 0.0001);
  return (
    <Card padded={false} className="mt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="text-[17px] font-semibold text-fg">Shared holdings</h2>
          <span className="text-[13px] text-muted">
            {sharedCount === 1 ? '1 company appears' : `${sharedCount} companies appear`} in both
            {rows.length < sharedCount ? ` · top ${rows.length} by combined weight` : ''}
          </span>
        </div>
        <span className="text-[13px] font-medium text-up">
          Overlap by weight: {formatPercent(overlapByWeight, { digits: 0 })}
        </span>
      </div>
      {holdings.length === 0 ? (
        <p className="px-5 pt-4 pb-6 text-[13px] text-muted sm:px-6">
          {labelA} and {labelB} have no companies in common.
        </p>
      ) : (
        <div className="scroll-x mt-4 px-5 pb-4 sm:px-6">
          <table className="w-full min-w-[720px] text-[13px]">
            <caption className="sr-only">
              Companies held by both {labelA} and {labelB}, with weight in each fund
            </caption>
            <thead>
              <tr className="border-b border-line-strong text-left text-[12px] text-faint">
                <th scope="col" className="w-[13%] pb-3 font-normal">
                  Ticker
                </th>
                <th scope="col" className="pb-3 font-normal">
                  Name
                </th>
                <th scope="col" className="pb-3 font-normal">
                  Sector
                </th>
                <th
                  scope="col"
                  className="w-[12%] max-w-[120px] truncate pb-3 pl-3 text-right font-normal"
                  title={labelA}
                >
                  {labelA}
                </th>
                <th
                  scope="col"
                  className="w-[12%] max-w-[120px] truncate pb-3 pl-3 text-right font-normal"
                  title={labelB}
                >
                  {labelB}
                </th>
                <th scope="col" className="w-[18%] pb-3 pl-8 font-normal">
                  Combined
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h, i) => (
                <tr key={h.ticker} className="border-b border-line/60 last:border-0">
                  <th scope="row" className="py-[11px] text-left font-mono font-bold text-fg">
                    {h.ticker}
                  </th>
                  <td className="py-[11px] text-fg">{h.name}</td>
                  <td className="py-[11px] text-muted">{h.sector ?? '—'}</td>
                  <td className="py-[11px] text-right text-c1">{weight(h.weightA)}</td>
                  <td className="py-[11px] text-right text-c5">{weight(h.weightB)}</td>
                  <td className="py-[11px] pl-8">
                    <div
                      className="h-[5px] w-full overflow-hidden rounded-full bg-track"
                      aria-hidden
                    >
                      <div
                        className="h-full rounded-full bg-c3"
                        style={{ width: `${((combined[i] ?? 0) / max) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {showAllHref && holdings.length > rows.length ? (
            <Link
              href={showAllHref}
              scroll={false}
              className="mt-3 inline-block text-[13px] font-medium text-muted hover:text-fg"
            >
              Show all {holdings.length} shared holdings
            </Link>
          ) : showLessHref ? (
            <Link
              href={showLessHref}
              scroll={false}
              className="mt-3 inline-block text-[13px] font-medium text-muted hover:text-fg"
            >
              Show fewer
            </Link>
          ) : null}
        </div>
      )}
    </Card>
  );
}
