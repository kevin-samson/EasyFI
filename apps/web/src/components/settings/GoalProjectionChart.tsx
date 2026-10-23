'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney } from '@/lib/format';
import type { Goal } from './types';

/** Projected portfolio (today's dollars) climbing toward the FI number. */
export function GoalProjectionChart({ goal, height = 160 }: { goal: Goal; height?: number }) {
  const data = goal.projection.map((p) => ({ year: p.year, real: p.real }));
  if (data.length < 2) return null;
  const thisYear = new Date().getUTCFullYear();
  return (
    <div
      role="img"
      aria-label={`Projection: ${formatMoney(data[data.length - 1]?.real)} in today's dollars after ${data[data.length - 1]?.year} years, versus an FI number of ${formatMoney(goal.fiNumber)}`}
      style={{ height }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="year"
            tickFormatter={(y: number) => String(thisYear + y)}
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--faint)', fontSize: 11 }}
            minTickGap={28}
          />
          <YAxis
            width={56}
            tickFormatter={(v: number) => formatMoney(v, { compact: true })}
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--faint)', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ stroke: 'var(--line-strong)' }}
            contentStyle={{
              background: 'var(--surface-2)',
              border: '1px solid var(--line-strong)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--fg)',
            }}
            labelStyle={{ color: 'var(--muted)' }}
            labelFormatter={(y) => `${thisYear + Number(y)}`}
            formatter={(v) => [formatMoney(Number(v)), "Projected (today's $)"]}
          />
          <ReferenceLine
            y={goal.fiNumber}
            stroke="var(--c3)"
            strokeDasharray="4 4"
            label={{
              value: 'FI number',
              position: 'insideTopLeft',
              fill: 'var(--muted)',
              fontSize: 11,
            }}
          />
          <Line
            type="monotone"
            dataKey="real"
            stroke="var(--brand)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
