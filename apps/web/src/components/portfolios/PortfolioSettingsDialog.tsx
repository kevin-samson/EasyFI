'use client';

import type { PortfolioType } from '@easyfi/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Overlay } from '@/components/holdings/Overlay';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { api, unwrap } from '@/lib/api/client';

export type PortfolioSettingsDialogProps = {
  open: boolean;
  onClose: () => void;
  portfolio: { id: string; name: string; type: PortfolioType; cash: number };
};

/** Rename, change type, set the uninvested cash balance, or delete a portfolio. */
export function PortfolioSettingsDialog({
  open,
  onClose,
  portfolio,
}: PortfolioSettingsDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(portfolio.name);
  const [type, setType] = useState<PortfolioType>(portfolio.type);
  const [cash, setCash] = useState(String(portfolio.cash || ''));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const amount = cash.trim() === '' ? 0 : Number(cash.replace(/[$,\s]/g, ''));
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Cash must be a number ≥ 0.');
      unwrap(
        await api.PATCH('/portfolios/{id}', {
          params: { path: { id: portfolio.id } },
          body: { name: name.trim(), type, cash: amount },
        }),
      );
      onClose();
      router.refresh();
    });

  const remove = () =>
    run(async () => {
      unwrap(await api.DELETE('/portfolios/{id}', { params: { path: { id: portfolio.id } } }));
      router.push('/portfolios');
      router.refresh();
    });

  return (
    <Overlay
      open={open}
      onClose={onClose}
      variant="modal"
      title="Portfolio settings"
      footer={
        <>
          {confirmDelete ? (
            <Button variant="danger" onClick={() => void remove()} disabled={busy}>
              Delete {portfolio.name} and its holdings
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              Delete portfolio…
            </Button>
          )}
          <Button variant="primary" onClick={() => void save()} disabled={busy || !name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-[var(--sev-high-bg)] px-3 py-2 text-[13px] text-[var(--sev-high-fg)]"
          >
            {error}
          </p>
        ) : null}
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as PortfolioType)}>
            <option value="actual">Actual</option>
            <option value="hypothetical">Hypothetical</option>
            <option value="watchlist">Watchlist</option>
          </Select>
        </Field>
        <Field
          label="Uninvested cash ($)"
          hint="Counted in the total and shown as Cash in look-through"
        >
          <TextInput
            inputMode="decimal"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>
    </Overlay>
  );
}
