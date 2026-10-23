import { ArrowRight } from 'lucide-react';
import { AsOf } from '@/components/ui/AsOf';
import { Card, CardHeader } from '@/components/ui/Card';
import { MiniBar } from '@/components/ui/MiniBar';
import { cn } from '@/lib/cn';
import { formatMoney, formatPercent, trendClass } from '@/lib/format';
import { scoreClass } from '@/lib/palette';
import type { WhatIfResult } from './types';

const pp = (f: number) => formatPercent(f, { digits: 1, signed: true });

function ScoreCard({ r }: { r: WhatIfResult }) {
  const delta = r.after.score - r.before.score;
  return (
    <Card>
      <CardHeader title="Diversification score" meta="0–100, higher is broader" />
      <div className="mt-4 flex items-center gap-4">
        <div>
          <div className="text-[12px] text-muted">Before</div>
          <div className={cn('text-[32px] font-semibold tabular-nums', scoreClass(r.before.score))}>
            {Math.round(r.before.score)}
          </div>
        </div>
        <ArrowRight aria-hidden className="h-5 w-5 text-faint" />
        <div>
          <div className="text-[12px] text-muted">After</div>
          <div className={cn('text-[32px] font-semibold tabular-nums', scoreClass(r.after.score))}>
            {Math.round(r.after.score)}
          </div>
        </div>
        <div className={cn('ml-auto text-[15px] font-semibold tabular-nums', trendClass(delta))}>
          {delta > 0 ? '+' : delta < 0 ? '−' : '±'}
          {Math.abs(Math.round(delta))}
        </div>
      </div>
      <p className="mt-3 text-[13px] text-muted">
        Value {formatMoney(r.before.totalValue)} → {formatMoney(r.after.totalValue)} after adding{' '}
        {formatMoney(r.amount)} of {r.ticker}.
      </p>
    </Card>
  );
}

function SectorShiftCard({ r }: { r: WhatIfResult }) {
  const rows = [...r.sectorShifts]
    .filter((s) => s.before > 0.0005 || s.after > 0.0005)
    .sort((a, b) => b.after - a.after);
  const max = Math.max(0.0001, ...rows.flatMap((s) => [s.before, s.after]));
  return (
    <Card>
      <CardHeader
        title="Sector shift"
        actions={
          <div className="flex items-center gap-3 text-[12px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--faint)]" /> Before
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-brand" /> After
            </span>
          </div>
        }
      />
      <ul className="mt-4 space-y-3">
        {rows.map((s) => (
          <li
            key={s.sector}
            className="grid grid-cols-[110px_minmax(0,1fr)_64px] items-center gap-3 text-[13px] sm:grid-cols-[140px_minmax(0,1fr)_72px]"
          >
            <span className="truncate text-fg" title={s.sector}>
              {s.sector}
            </span>
            <div className="space-y-1">
              <MiniBar
                fraction={s.before / max}
                color="var(--faint)"
                height={5}
                label={`${s.sector} before ${formatPercent(s.before)}`}
              />
              <MiniBar
                fraction={s.after / max}
                color="var(--brand)"
                height={5}
                label={`${s.sector} after ${formatPercent(s.after)}`}
              />
            </div>
            <span className="text-right tabular-nums">
              <span className="block text-fg">{formatPercent(s.after)}</span>
              <span className={cn('block text-[11px]', trendClass(s.shift))}>
                {Math.abs(s.shift) < 0.0005 ? '±0.0%' : pp(s.shift)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function OverlapCard({ r }: { r: WhatIfResult }) {
  const rows = [...r.overlaps].sort((a, b) => b.overlapByWeight - a.overlapByWeight);
  return (
    <Card>
      <CardHeader title={`Overlap with funds you hold`} meta={`${r.ticker} vs each fund`} />
      {rows.length ? (
        <ul className="mt-4 space-y-3">
          {rows.map((o) => (
            <li key={o.fund} className="text-[13px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono font-bold text-fg">{o.fund}</span>
                <span className="text-muted tabular-nums">
                  {formatPercent(o.overlapByWeight)} · {o.sharedCount} shared{' '}
                  {o.sharedCount === 1 ? 'holding' : 'holdings'}
                </span>
              </div>
              <MiniBar
                className="mt-1.5"
                fraction={o.overlapByWeight}
                color={o.overlapByWeight >= 0.5 ? 'var(--down)' : 'var(--c1)'}
                height={5}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted">You don&apos;t hold any funds here yet.</p>
      )}
      <p className="mt-4 text-[12px] text-faint">
        Overlap by weight: how much of the two funds is the same companies in the same amounts.
      </p>
    </Card>
  );
}

function TopChangesCard({ r }: { r: WhatIfResult }) {
  return (
    <Card padded={false}>
      <div className="p-5 pb-3 sm:p-6 sm:pb-3">
        <CardHeader title="Top exposure changes" meta="company weight after look-through" />
      </div>
      {r.topChanges.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-y border-line text-left text-[12px] text-muted">
                <th scope="col" className="px-5 py-2 font-medium sm:px-6">
                  Company
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Before
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  After
                </th>
                <th scope="col" className="px-5 py-2 text-right font-medium sm:px-6">
                  Change
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.topChanges.map((c) => (
                <tr key={c.ticker}>
                  <td className="px-5 py-2.5 sm:px-6">
                    <span className="mr-2 font-mono font-bold text-fg">{c.ticker}</span>
                    <span className="text-muted">{c.name}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-muted tabular-nums">
                    {formatPercent(c.beforeWeight, { digits: 2 })}
                  </td>
                  <td className="px-3 py-2.5 text-right text-fg tabular-nums">
                    {formatPercent(c.afterWeight, { digits: 2 })}
                  </td>
                  <td
                    className={cn(
                      'px-5 py-2.5 text-right font-semibold tabular-nums sm:px-6',
                      trendClass(c.shift),
                    )}
                  >
                    {formatPercent(c.shift, { digits: 2, signed: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 pb-5 text-[13px] text-muted sm:px-6">No notable changes.</p>
      )}
    </Card>
  );
}

/** Result of POST /whatif: score, sector shift, overlap, top exposure changes. */
export function WhatIfResultView({ result }: { result: WhatIfResult }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-fg">
          Adding {formatMoney(result.amount)} of <span className="font-mono">{result.ticker}</span>{' '}
          <span className="font-normal text-muted">· {result.name}</span>
        </h2>
        <AsOf date={result.asOf} />
      </div>
      {!result.addedResolved ? (
        <p className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-[13px] text-muted">
          We don&apos;t have look-through data for {result.ticker}, so it is counted as a single
          unresolved holding. Sector and overlap results are incomplete.
        </p>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <ScoreCard r={result} />
        <OverlapCard r={result} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <SectorShiftCard r={result} />
        <TopChangesCard r={result} />
      </div>
      <p className="text-[12px] text-faint">
        A simulation using current prices and the latest fund holdings. Nothing is saved or traded.
        Educational only, not investment advice.
      </p>
    </div>
  );
}
