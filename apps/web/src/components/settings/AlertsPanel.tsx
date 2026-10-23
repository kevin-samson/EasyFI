'use client';

import { BellRing } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { api, unwrap } from '@/lib/api/client';
import { formatIsoDate } from '@/lib/format';
import { errorMessage, FormStatus } from './FormStatus';
import { Switch } from './Switch';
import type { Alert, AlertCheck } from './types';

type Kind = Alert['kind'];

const META: Record<
  Kind,
  {
    label: string;
    description: string;
    field: string;
    /** API value → input value. */
    toInput: (v: number) => string;
    /** Input value → API value (null when invalid). */
    fromInput: (s: string) => number | null;
    fallback: number;
  }
> = {
  concentration: {
    label: 'Concentration',
    description:
      'When one company passes this share of a portfolio after look-through (funds opened up).',
    field: 'Threshold (% of portfolio)',
    toInput: (v) => String(Math.round(v * 1000) / 10),
    fromInput: (s) => {
      const n = Number(s);
      return Number.isFinite(n) && n > 0 && n <= 100 ? n / 100 : null;
    },
    fallback: 0.1,
  },
  dividend: {
    label: 'Upcoming dividend',
    description: 'Heads-up before a holding goes ex-dividend or pays a distribution.',
    field: 'Days ahead',
    toInput: (v) => String(v),
    fromInput: (s) => {
      const n = Math.round(Number(s));
      return Number.isFinite(n) && n >= 1 && n <= 90 ? n : null;
    },
    fallback: 7,
  },
};

function AlertRow({ kind, alert }: { kind: Kind; alert: Alert | undefined }) {
  const router = useRouter();
  const m = META[kind];
  const [enabled, setEnabled] = useState(alert?.enabled ?? false);
  const [value, setValue] = useState(m.toInput(alert?.threshold ?? m.fallback));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const dirty = !alert || enabled !== alert.enabled || m.fromInput(value) !== alert.threshold;

  async function save(nextEnabled = enabled) {
    const threshold = m.fromInput(value);
    if (threshold == null) {
      setError(
        kind === 'concentration' ? 'Enter a percent between 0 and 100.' : 'Enter 1–90 days.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      unwrap(await api.PUT('/alerts', { body: { kind, threshold, enabled: nextEnabled } }));
      setOk('Saved');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the alert.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-1">
      <Switch
        label={m.label}
        description={m.description}
        checked={enabled}
        onChange={(v) => {
          setEnabled(v);
          void save(v);
        }}
      />
      <form
        className="flex flex-wrap items-end gap-3 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label={m.field} className="w-48">
          <TextInput
            type="number"
            inputMode="decimal"
            step={kind === 'concentration' ? 0.5 : 1}
            min={kind === 'concentration' ? 0.5 : 1}
            max={kind === 'concentration' ? 100 : 90}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOk(null);
            }}
          />
        </Field>
        <Button type="submit" size="md" variant="secondary" disabled={busy || !dirty}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <FormStatus error={error} ok={ok} />
        <span className="ml-auto text-[12px] text-faint">
          {alert?.lastFiredAt ? `last sent ${formatIsoDate(alert.lastFiredAt)}` : 'never sent'}
        </span>
      </form>
    </div>
  );
}

/** Concentration + dividend alert rules (PUT /alerts) and an on-demand check. */
export function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  const [check, setCheck] = useState<AlertCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byKind = (k: Kind) => alerts.find((a) => a.kind === k);

  return (
    <>
      <div className="divide-y divide-line">
        <AlertRow kind="concentration" alert={byKind('concentration')} />
        <AlertRow kind="dividend" alert={byKind('dividend')} />
      </div>
      <div className="mt-2 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                setCheck(unwrap(await api.POST('/alerts/check')));
              } catch (err) {
                setError(errorMessage(err, 'Could not check alerts.'));
              } finally {
                setBusy(false);
              }
            }}
          >
            <BellRing aria-hidden className="h-4 w-4" /> {busy ? 'Checking…' : 'Check now'}
          </Button>
          <span className="text-[12px] text-faint">Rules are also checked every night.</span>
          <FormStatus error={error} />
        </div>
        {check ? (
          check.triggered.length ? (
            <ul className="mt-3 space-y-2" aria-live="polite">
              {check.triggered.map((t, i) => (
                <li
                  key={`${t.alertId}-${i}`}
                  className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] text-fg"
                >
                  <span className="mr-2 text-[11px] font-semibold tracking-wide text-faint uppercase">
                    {META[t.kind].label}
                  </span>
                  {t.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-muted" aria-live="polite">
              Nothing triggered right now.
            </p>
          )
        ) : null}
      </div>
    </>
  );
}
