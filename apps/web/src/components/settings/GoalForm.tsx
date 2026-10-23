'use client';

import { type ChangeEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { FormStatus } from './FormStatus';
import type { Goal, GoalBody } from './types';

type Values = {
  label: string;
  annualExpenses: string;
  withdrawalRate: string;
  monthlyContribution: string;
  growthRate: string;
  inflationRate: string;
};

const pct = (f: number) => String(Math.round(f * 10000) / 100);

function initial(goal?: Goal): Values {
  return {
    label: goal?.label ?? 'Financial independence',
    annualExpenses: goal ? String(goal.annualExpenses) : '',
    withdrawalRate: pct(goal?.withdrawalRate ?? 0.04),
    monthlyContribution: goal ? String(goal.monthlyContribution) : '0',
    growthRate: pct(goal?.growthRate ?? 0.07),
    inflationRate: pct(goal?.inflationRate ?? 0.03),
  };
}

function num(s: string) {
  const n = Number(s.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

function toBody(v: Values): GoalBody | string {
  const annualExpenses = num(v.annualExpenses);
  const withdrawalRate = num(v.withdrawalRate) / 100;
  const monthlyContribution = num(v.monthlyContribution || '0');
  const growthRate = num(v.growthRate) / 100;
  const inflationRate = num(v.inflationRate) / 100;
  if (!v.label.trim()) return 'Give the goal a name.';
  if (!(annualExpenses > 0)) return 'Annual expenses must be more than $0.';
  if (!(withdrawalRate >= 0.01 && withdrawalRate <= 0.2)) return 'Withdrawal rate: 1–20%.';
  if (!(monthlyContribution >= 0)) return 'Monthly contribution cannot be negative.';
  if (!(growthRate >= -0.5 && growthRate <= 0.5)) return 'Growth rate: −50% to 50%.';
  if (!(inflationRate >= -0.2 && inflationRate <= 0.5)) return 'Inflation: −20% to 50%.';
  return {
    label: v.label.trim(),
    annualExpenses,
    withdrawalRate,
    monthlyContribution,
    growthRate,
    inflationRate,
  };
}

/** Create / edit an FI goal. Rates are entered as percents and sent as fractions. */
export function GoalForm({
  goal,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  goal?: Goal;
  submitLabel: string;
  onSubmit: (body: GoalBody) => Promise<void>;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<Values>(() => initial(goal));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Values) => (e: ChangeEvent<HTMLInputElement>) =>
    setV((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const body = toBody(v);
        if (typeof body === 'string') {
          setError(body);
          return;
        }
        setBusy(true);
        setError(null);
        try {
          await onSubmit(body);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not save the goal.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Name">
        <TextInput value={v.label} onChange={set('label')} maxLength={60} required />
      </Field>
      <Field label="Annual expenses ($)" hint="What you spend in a year, in today's dollars.">
        <TextInput
          inputMode="decimal"
          value={v.annualExpenses}
          onChange={set('annualExpenses')}
          placeholder="40,000"
          required
        />
      </Field>
      <Field label="Withdrawal rate (%)" hint="4% is the classic rule of thumb.">
        <TextInput inputMode="decimal" value={v.withdrawalRate} onChange={set('withdrawalRate')} />
      </Field>
      <Field label="Monthly contribution ($)">
        <TextInput
          inputMode="decimal"
          value={v.monthlyContribution}
          onChange={set('monthlyContribution')}
        />
      </Field>
      <Field label="Expected growth (%/yr)">
        <TextInput inputMode="decimal" value={v.growthRate} onChange={set('growthRate')} />
      </Field>
      <Field label="Inflation (%/yr)">
        <TextInput inputMode="decimal" value={v.inflationRate} onChange={set('inflationRate')} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
        <FormStatus error={error} />
      </div>
    </form>
  );
}
