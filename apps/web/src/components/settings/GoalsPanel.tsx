'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { MiniBar } from '@/components/ui/MiniBar';
import { api, unwrap } from '@/lib/api/client';
import { formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { errorMessage, FormStatus } from './FormStatus';
import { GoalForm } from './GoalForm';
import { GoalProjectionChart } from './GoalProjectionChart';
import type { Goal, GoalBody } from './types';

function yearsLabel(y: number | null) {
  if (y == null) return 'Not reached in the projection';
  if (y <= 0) return 'Reached';
  if (y < 1) return 'Under a year';
  return `${formatNumber(y, 1)} years`;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-0.5 text-[18px] font-semibold text-fg tabular-nums">{value}</div>
      {note ? <div className="text-[12px] text-faint">{note}</div> : null}
    </div>
  );
}

function GoalCard({ goal, asOf }: { goal: Goal; asOf: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reachYear =
    goal.yearsToFi != null && goal.yearsToFi > 0
      ? new Date().getUTCFullYear() + Math.ceil(goal.yearsToFi)
      : null;

  if (editing) {
    return (
      <li className="rounded-xl border border-line p-4">
        <GoalForm
          goal={goal}
          submitLabel="Save goal"
          onCancel={() => setEditing(false)}
          onSubmit={async (body: GoalBody) => {
            unwrap(await api.PATCH('/goals/{id}', { params: { path: { id: goal.id } }, body }));
            setEditing(false);
            router.refresh();
          }}
        />
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-line p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold text-fg">{goal.label}</h3>
          <p className="mt-0.5 text-[12px] text-faint">
            {formatMoney(goal.annualExpenses)}/yr at {formatPercent(goal.withdrawalRate)} ·{' '}
            {formatMoney(goal.monthlyContribution)}/mo · {formatPercent(goal.growthRate)} growth ·{' '}
            {formatPercent(goal.inflationRate)} inflation
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil aria-hidden className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            aria-label={`Delete goal ${goal.label}`}
            onClick={async () => {
              if (!window.confirm(`Delete “${goal.label}”?`)) return;
              setBusy(true);
              setError(null);
              try {
                unwrap(await api.DELETE('/goals/{id}', { params: { path: { id: goal.id } } }));
                router.refresh();
              } catch (err) {
                setError(errorMessage(err, 'Could not delete the goal.'));
                setBusy(false);
              }
            }}
          >
            <Trash2 aria-hidden className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="FI number" value={formatMoney(goal.fiNumber)} note="expenses ÷ withdrawal" />
        <Stat
          label="Tracked today"
          value={formatMoney(goal.current)}
          note={goal.current == null ? 'no priced holdings yet' : `prices as of ${asOf ?? '—'}`}
        />
        <Stat
          label="Years to FI"
          value={yearsLabel(goal.yearsToFi)}
          note={reachYear ? `around ${reachYear}` : undefined}
        />
      </div>

      <div className="mt-4">
        <MiniBar
          height={8}
          fraction={goal.progress ?? 0}
          color="var(--brand)"
          label={`${formatPercent(goal.progress)} of FI number`}
        />
        <div className="mt-1 flex justify-between text-[12px] text-faint">
          <span>{formatPercent(goal.progress)} reached</span>
          <span>{formatMoney(goal.fiNumber)}</span>
        </div>
      </div>

      <div className="mt-4">
        <GoalProjectionChart goal={goal} />
        <p className="mt-1 text-[12px] text-faint">
          Projection in today&apos;s dollars. Assumes steady growth and contributions — a what-if,
          not a forecast.
        </p>
      </div>
      <FormStatus error={error} />
    </li>
  );
}

/** FI goals: progress against tracked value, years to FI, projection; create / edit / delete. */
export function GoalsPanel({ goals, asOf }: { goals: Goal[]; asOf: string | null }) {
  const router = useRouter();
  const [adding, setAdding] = useState(goals.length === 0);

  return (
    <>
      {goals.length ? (
        <ul className="space-y-4">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} asOf={asOf} />
          ))}
        </ul>
      ) : null}
      {adding ? (
        <div className={goals.length ? 'mt-5 border-t border-line pt-5' : ''}>
          <h3 className="mb-3 text-[13px] font-semibold text-fg">New FI goal</h3>
          <GoalForm
            submitLabel="Add goal"
            onCancel={goals.length ? () => setAdding(false) : undefined}
            onSubmit={async (body) => {
              unwrap(await api.POST('/goals', { body }));
              setAdding(false);
              router.refresh();
            }}
          />
        </div>
      ) : (
        <Button className="mt-4" variant="secondary" onClick={() => setAdding(true)}>
          Add another goal
        </Button>
      )}
    </>
  );
}
