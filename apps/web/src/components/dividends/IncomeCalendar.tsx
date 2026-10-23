'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { cn } from '@/lib/cn';
import { formatMoney, formatMonth, formatShortDate, MISSING } from '@/lib/format';
import { ACCOUNT_LABEL, type IncomeMonth } from './types';

export type IncomeCalendarProps = {
  months: IncomeMonth[];
  /** ISO month selected initially; defaults to the latest month with received income. */
  initialMonth?: string;
};

function niceMax(v: number) {
  if (v <= 0) return 100;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}

const HATCH =
  'repeating-linear-gradient(135deg, color-mix(in srgb, var(--c1) 38%, transparent) 0 4px, color-mix(in srgb, var(--c1) 14%, transparent) 4px 8px)';

/**
 * Monthly income bars (received solid, expected — announced or projected — hatched, stacked when a
 * month has both). Click a month for its payments.
 */
export function IncomeCalendar({ months, initialMonth }: IncomeCalendarProps) {
  const hasReceived = (m: IncomeMonth) =>
    (m.received ?? 0) > 0 || m.payments.some((p) => p.status === 'received');
  let lastReceivedIdx = -1;
  months.forEach((m, i) => {
    if (hasReceived(m)) lastReceivedIdx = i;
  });
  // Months after the last one with received income are the forward-looking part.
  const firstProjected = lastReceivedIdx + 1;
  const [selected, setSelected] = useState(
    initialMonth ?? months[lastReceivedIdx]?.month ?? months[0]?.month ?? '',
  );
  const amount = (m: IncomeMonth) => (m.received ?? 0) + (m.projected ?? 0);
  const max = niceMax(Math.max(...months.map(amount), 0) * 1.08);
  const ticks = [1, 0.5, 0];
  const current = months.find((m) => m.month === selected);
  const receivedTotal = months.reduce((s, m) => s + (m.received ?? 0), 0);
  const projectedTotal = months.reduce((s, m) => s + (m.projected ?? 0), 0);

  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="text-[15px] font-semibold text-fg">Income calendar</h2>
          <p className="mt-1 text-[13px] text-muted">
            {formatMoney(receivedTotal)} received · {formatMoney(projectedTotal)} expected
          </p>
        </div>
        <ul className="flex items-center gap-4 text-[12px] text-muted" aria-label="Legend">
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-c1" /> Received
          </li>
          <li className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-[3px] border border-dashed border-c1"
              style={{ background: HATCH }}
            />
            Expected
          </li>
        </ul>
      </div>

      <div className="mt-6 flex gap-2">
        {/* y axis */}
        <div className="relative hidden w-10 shrink-0 sm:block" style={{ height: 200 }} aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 text-[11px] text-faint"
              style={{ top: `${(1 - t) * 100}%` }}
            >
              {formatMoney(max * t)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: 200 }}>
            {ticks.map((t) => (
              <div
                key={t}
                aria-hidden
                className={cn(
                  'absolute inset-x-0 border-t',
                  t === 0 ? 'border-line-strong' : 'border-dashed border-line',
                )}
                style={{ top: `${(1 - t) * 100}%` }}
              />
            ))}
            {firstProjected > 0 && firstProjected < months.length ? (
              <div
                aria-hidden
                className="absolute inset-y-0 border-l border-dashed border-line-strong"
                style={{ left: `${(firstProjected / months.length) * 100}%` }}
              >
                <span className="absolute -top-5 left-1.5 text-[11px] whitespace-nowrap text-faint">
                  Expected
                </span>
              </div>
            ) : null}
            <div
              role="listbox"
              aria-label="Income by month"
              className="absolute inset-0 flex items-end gap-[3px] sm:gap-1.5"
            >
              {months.map((m) => {
                const rec = m.received ?? 0;
                const exp = m.projected ?? 0;
                const v = rec + exp;
                const isSel = m.month === selected;
                const unknown = m.received == null && m.projected == null;
                const desc = unknown
                  ? 'amount unknown'
                  : [
                      rec > 0 ? `${formatMoney(rec)} received` : null,
                      exp > 0 ? `${formatMoney(exp)} expected` : null,
                    ]
                      .filter(Boolean)
                      .join(', ') || 'no distributions';
                return (
                  <button
                    key={m.month}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    aria-label={`${formatMonth(m.month, true)}: ${desc}`}
                    onClick={() => setSelected(m.month)}
                    className="group relative flex h-full flex-1 items-end justify-center rounded-md focus-visible:outline-offset-0"
                  >
                    <span
                      className={cn(
                        'flex w-full max-w-[34px] flex-col-reverse overflow-hidden rounded-t-[5px] rounded-b-[2px] transition-[opacity,box-shadow]',
                        isSel
                          ? 'opacity-100 shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--fg)]'
                          : 'opacity-75 group-hover:opacity-100',
                      )}
                      style={{ height: `${Math.max(v > 0 ? 2 : 0, (v / max) * 100)}%` }}
                    >
                      {rec > 0 ? (
                        <span className="block w-full bg-c1" style={{ flexGrow: rec }} />
                      ) : null}
                      {exp > 0 ? (
                        <span
                          className={cn(
                            'block w-full border border-dashed border-c1',
                            rec > 0 ? 'border-b-0' : 'rounded-t-[5px] border-b-0',
                          )}
                          style={{ flexGrow: exp, background: HATCH }}
                        />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-2 flex gap-[3px] sm:gap-1.5" aria-hidden>
            {months.map((m) => {
              const isJan = m.month.endsWith('-01');
              return (
                <div
                  key={m.month}
                  className={cn(
                    'flex-1 text-center text-[10px] leading-tight sm:text-[11px]',
                    m.month === selected ? 'font-semibold text-fg' : 'text-faint',
                  )}
                >
                  <span className="sm:hidden">{formatMonth(m.month).slice(0, 1)}</span>
                  <span className="hidden sm:inline">{formatMonth(m.month)}</span>
                  {isJan ? (
                    <span className="block text-[10px] font-normal text-faint">
                      {m.month.slice(0, 4)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {current ? (
        <div
          className="mt-5 rounded-xl border border-line bg-surface-2 p-4 sm:p-5"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[14px] font-semibold text-fg">
              {formatMonth(current.month, true)}
            </h3>
            <span className="text-[13px] text-muted">
              {current.received == null && current.projected == null
                ? `${MISSING} amount unknown`
                : [
                    (current.received ?? 0) > 0 || (current.projected ?? 0) === 0
                      ? `${formatMoney(current.received)} received`
                      : null,
                    (current.projected ?? 0) > 0
                      ? `${formatMoney(current.projected)} expected`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </span>
          </div>
          {current.payments.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted">No distributions this month.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {current.payments.map((p) => (
                <li
                  key={p.id}
                  className="grid grid-cols-[56px_1fr_auto] items-center gap-x-3 gap-y-0.5 py-2.5 text-[13px] sm:grid-cols-[64px_1fr_72px_96px_112px_80px_72px]"
                >
                  <span className="font-mono font-bold text-fg">{p.ticker}</span>
                  <span className="truncate text-muted">{p.name}</span>
                  <span className="text-right font-semibold text-fg sm:order-last">
                    {p.amount == null ? MISSING : formatMoney(p.amount, { cents: true })}
                  </span>
                  <span className="col-start-2 text-[12px] text-faint sm:col-start-auto sm:text-[13px] sm:text-muted">
                    {formatShortDate(p.payDate)}
                  </span>
                  <span className="hidden text-right text-muted sm:block">
                    {p.perShare == null
                      ? MISSING
                      : `${formatMoney(p.perShare, { cents: true })} / sh`}
                  </span>
                  <span className="hidden sm:block">
                    <Pill tone="neutral" className="h-5 px-2 text-[11px] font-medium">
                      {ACCOUNT_LABEL[p.account]}
                    </Pill>
                  </span>
                  <span className="hidden sm:block">
                    {p.status === 'received' ? null : (
                      <Pill
                        tone={p.status === 'announced' ? 'info' : 'neutral'}
                        className="h-5 px-2 text-[11px] font-medium"
                      >
                        {p.status === 'announced' ? 'Announced' : 'Estimated'}
                      </Pill>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </Card>
  );
}
