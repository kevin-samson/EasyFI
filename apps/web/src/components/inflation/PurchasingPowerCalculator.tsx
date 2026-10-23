'use client';

import type { PurchasingPowerResult } from '@easyfi/contracts';
import { type ChangeEvent, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, TextInput } from '@/components/ui/Field';
import { api, ApiError, unwrap } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { PURCHASING_POWER_DEFAULTS, type PurchasingPowerInput } from './types';

const MAX_YEARS = 80;
const DEBOUNCE_MS = 300;

type FormState = Record<keyof PurchasingPowerInput, string>;

function toForm(i: PurchasingPowerInput): FormState {
  return {
    amount: String(Math.round(i.amount)),
    monthlyContribution: String(i.monthlyContribution),
    inflationRate: String(+(i.inflationRate * 100).toFixed(2)),
    growthRate: String(+(i.growthRate * 100).toFixed(2)),
    years: String(i.years),
  };
}

/** Form strings → request body (percent → fraction); null when a field is not a usable number. */
function parse(f: FormState): PurchasingPowerInput | null {
  const n = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(/[$,%\s]/g, '')));
  const v = {
    amount: n(f.amount),
    monthlyContribution: n(f.monthlyContribution),
    inflationRate: n(f.inflationRate) / 100,
    growthRate: n(f.growthRate) / 100,
    years: Math.round(n(f.years)),
  };
  if (Object.values(v).some((x) => !Number.isFinite(x))) return null;
  if (v.amount < 0 || v.monthlyContribution < 0) return null;
  if (v.years < 1 || v.years > MAX_YEARS) return null;
  if (v.inflationRate < -0.5 || v.inflationRate > 1) return null;
  if (v.growthRate < -0.9 || v.growthRate > 1) return null;
  return v;
}

type Projection = { input: PurchasingPowerInput; result: PurchasingPowerResult };

/**
 * Nominal vs inflation-adjusted growth. The projection is computed server-side
 * (POST /inflation/purchasing-power → packages/core), debounced as the user types.
 */
export function PurchasingPowerCalculator({
  initial = PURCHASING_POWER_DEFAULTS,
  amountNote,
  inflationNote,
}: {
  initial?: PurchasingPowerInput;
  /** Shown under the starting amount (e.g. "Your tracked value"). */
  amountNote?: string;
  /** Shown under the inflation rate (e.g. "Latest CPI, Sep 2026"). */
  inflationNote?: string;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const input = parse(form);
  const key = input ? JSON.stringify(input) : null;
  const [projection, setProjection] = useState<Projection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    const body = JSON.parse(key) as PurchasingPowerInput;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoadingKey(key);
      try {
        const result = unwrap(
          await api.POST('/inflation/purchasing-power', { body, signal: ctrl.signal }),
        );
        setProjection({ input: body, result });
        setError(null);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setError(e instanceof ApiError ? e.message : 'Could not calculate the projection.');
      } finally {
        if (!ctrl.signal.aborted) setLoadingKey(null);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [key]);

  const stale = projection != null && key !== JSON.stringify(projection.input);
  const loading = key != null && loadingKey === key;
  const points = projection?.result.points ?? [];
  const final = projection?.result.final;
  const shownYears = projection?.input.years;

  const set = (k: keyof FormState) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Card>
      <CardHeader title="Purchasing power" meta="What your money is worth in today's dollars" />
      <div className="mt-5 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <form
          className="grid grid-cols-2 gap-4 lg:grid-cols-1"
          onSubmit={(e) => e.preventDefault()}
        >
          <Field label="Starting amount ($)" hint={amountNote} className="col-span-2 lg:col-span-1">
            <TextInput inputMode="decimal" value={form.amount} onChange={set('amount')} />
          </Field>
          <Field label="Monthly contribution ($)" className="col-span-2 lg:col-span-1">
            <TextInput
              inputMode="decimal"
              value={form.monthlyContribution}
              onChange={set('monthlyContribution')}
            />
          </Field>
          <Field label="Inflation (%/yr)" hint={inflationNote}>
            <TextInput
              inputMode="decimal"
              value={form.inflationRate}
              onChange={set('inflationRate')}
            />
          </Field>
          <Field label="Growth (%/yr)">
            <TextInput inputMode="decimal" value={form.growthRate} onChange={set('growthRate')} />
          </Field>
          <Field label="Years" hint={`1 to ${MAX_YEARS}`} className="col-span-2 lg:col-span-1">
            <TextInput inputMode="numeric" value={form.years} onChange={set('years')} />
          </Field>
        </form>

        <div
          className={cn('min-w-0 transition-opacity', stale || loading ? 'opacity-60' : null)}
          aria-busy={loading}
        >
          {!input ? (
            <p className="rounded-lg border border-dashed border-line-strong p-6 text-[13px] text-muted">
              Enter numbers in every field, with years between 1 and {MAX_YEARS}, inflation between
              −50% and 100%, and growth between −90% and 100%, to see the projection.
            </p>
          ) : error ? (
            <p
              role="alert"
              className="rounded-lg border border-dashed border-line-strong p-6 text-[13px] text-warn"
            >
              {error}
            </p>
          ) : !final ? (
            <div className="h-[330px] animate-pulse rounded-lg bg-surface-2" aria-hidden />
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-[13px] text-muted">In {shownYears} years</dt>
                  <dd className="mt-0.5 text-[22px] font-semibold text-fg">
                    {formatMoney(final.nominal)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[13px] text-muted">In today&apos;s dollars</dt>
                  <dd className="mt-0.5 text-[22px] font-semibold text-up">
                    {formatMoney(final.real)}
                  </dd>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <dt className="text-[13px] text-muted">Lost to inflation</dt>
                  <dd className="mt-0.5 text-[22px] font-semibold text-warn">
                    {formatMoney(final.nominal - final.real)}
                  </dd>
                </div>
              </dl>
              {projection ? (
                <p className="mt-3 text-[13px] text-muted">
                  Left uninvested, {formatMoney(projection.input.amount)} would buy only what{' '}
                  <span className="font-semibold text-fg">
                    {formatMoney(projection.result.amountReal)}
                  </span>{' '}
                  buys today after {projection.input.years} years.
                </p>
              ) : null}
              <div
                className="mt-5 h-[260px]"
                role="img"
                aria-label="Nominal versus inflation-adjusted value by year"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="pp-real" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis
                      dataKey="year"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'var(--faint)', fontSize: 11 }}
                      tickFormatter={(y) => `Y${y}`}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      tick={{ fill: 'var(--faint)', fontSize: 11 }}
                      tickFormatter={(v) => formatMoney(Number(v), { compact: true })}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--line-strong)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--fg)',
                      }}
                      labelFormatter={(y) => `Year ${y}`}
                      formatter={(v, name) => [formatMoney(Number(v)), String(name)]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12, color: 'var(--muted)' }}
                      iconType="circle"
                      iconSize={8}
                    />
                    <Area
                      name="Nominal"
                      dataKey="nominal"
                      type="monotone"
                      stroke="var(--c1)"
                      strokeWidth={2}
                      fill="none"
                      isAnimationActive={false}
                    />
                    <Area
                      name="Today's dollars"
                      dataKey="real"
                      type="monotone"
                      stroke="var(--brand)"
                      strokeWidth={2}
                      fill="url(#pp-real)"
                      isAnimationActive={false}
                    />
                    <Area
                      name="Contributed"
                      dataKey="contributed"
                      type="monotone"
                      stroke="var(--c-other)"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      fill="none"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
