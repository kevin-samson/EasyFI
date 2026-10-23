'use client';

import { Eye, FlaskConical, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PortfolioType } from '@/components/types';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { api, ApiError, unwrap } from '@/lib/api/client';
import { cn } from '@/lib/cn';

export type PortfolioCreateFormProps = {
  /** Focus the name field on mount (e.g. arriving from "+ New portfolio"). */
  autoFocus?: boolean;
  className?: string;
};

const TYPES: { value: PortfolioType; label: string; body: string; icon: typeof Wallet }[] = [
  {
    value: 'actual',
    label: 'Actual',
    body: 'Money you hold today, at a broker or in a 401(k).',
    icon: Wallet,
  },
  {
    value: 'hypothetical',
    label: 'Hypothetical',
    body: 'Try a mix of funds before you buy anything.',
    icon: FlaskConical,
  },
  {
    value: 'watchlist',
    label: 'Watchlist',
    body: 'Track funds you are curious about, no amounts.',
    icon: Eye,
  },
];

/** Create-portfolio form: name + type radio cards. */
export function PortfolioCreateForm({ autoFocus, className }: PortfolioCreateFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [type, setType] = useState<PortfolioType>('actual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className={cn('space-y-5', className)}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        setError(null);
        try {
          const p = unwrap(await api.POST('/portfolios', { body: { name: name.trim(), type } }));
          router.push(`/portfolios/${p.id}/holdings`);
          router.refresh();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Could not create the portfolio.');
          setBusy(false);
        }
      }}
    >
      <Field label="Name">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Roth IRA"
          required
          maxLength={60}
          autoFocus={autoFocus}
        />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-muted">Type</legend>
        <div className="grid gap-2">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const active = t.value === type;
            return (
              <label
                key={t.value}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-3 transition-colors focus-within:outline-2 focus-within:outline-brand',
                  active
                    ? 'border-brand/60 bg-brand/[0.06]'
                    : 'border-line hover:border-line-strong',
                )}
              >
                <input
                  type="radio"
                  name="portfolio-type"
                  value={t.value}
                  checked={active}
                  onChange={() => setType(t.value)}
                  className="sr-only"
                />
                <Icon
                  aria-hidden
                  className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-brand' : 'text-faint')}
                />
                <span>
                  <span className="block text-[14px] font-semibold text-fg">{t.label}</span>
                  <span className="block text-[12px] text-muted">{t.body}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create portfolio'}
        </Button>
        {error ? (
          <span role="alert" className="text-[13px] text-down">
            {error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
