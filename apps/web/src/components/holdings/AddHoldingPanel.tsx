'use client';

import { Search } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextInput, inputClass } from '@/components/ui/Field';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { api, ApiError, unwrap } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { Overlay } from './Overlay';
import {
  ACCOUNT_TYPE_LABEL,
  type AccountType,
  HOLDING_TYPE_LABEL,
  type HoldingRow,
  type HoldingType,
  type TickerSuggestion,
} from './types';

export type AddHoldingPanelProps = {
  open: boolean;
  onClose: () => void;
  portfolioId: string;
  /** Line being edited; null/undefined = add a new one. */
  editing?: HoldingRow | null;
  /** Called after a successful save (refresh the table). */
  onSaved: () => void;
};

type Mode = 'shares' | 'dollars' | 'statement';

/** Parses paste-friendly numbers: "$1,234.50" → 1234.5. Empty → null. */
function parseAmount(s: string): number | null {
  const n = Number(s.replace(/[$,\s]/g, ''));
  return s.trim() === '' || !Number.isFinite(n) ? null : n;
}

const SECURITY_TYPE: Record<string, HoldingType> = {
  etf: 'etf',
  mutual_fund: 'mutual_fund',
  stock: 'stock',
  mmf: 'cash',
  bond: 'bond',
  crypto: 'crypto',
  other: 'other',
};

const EMPTY = { ticker: '', amount: '', cost: '', tags: '' };

/** Live ticker lookup against /api/v1/securities/search (debounced). */
function useTickerSearch(q: string) {
  const [results, setResults] = useState<TickerSuggestion[]>([]);
  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await api.GET('/securities/search', { params: { query: { q: term, limit: 6 } } });
      if (!cancelled && r.data) {
        setResults(
          r.data.results.map((s) => ({
            ticker: s.ticker,
            name: s.name,
            type: SECURITY_TYPE[s.type] ?? 'other',
          })),
        );
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);
  return q.trim() ? results : [];
}

/** Side drawer to add or edit one holding (ticker search, account, amount, cost basis, tags). */
export function AddHoldingPanel({
  open,
  onClose,
  portfolioId,
  editing,
  onSaved,
}: AddHoldingPanelProps) {
  const tickerRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(EMPTY);
  const [account, setAccount] = useState<AccountType>('taxable');
  const [mode, setMode] = useState<Mode>('shares');
  const [showList, setShowList] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const matches = useTickerSearch(showList ? form.ticker : '');

  // load the edited line into the form whenever the panel opens for it
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = open ? (editing?.id ?? 'new') : null;
  if (key !== loadedFor) {
    setLoadedFor(key);
    setError(null);
    setAdded(null);
    if (editing) {
      const statement = editing.shares == null;
      setForm({
        ticker: editing.ticker,
        amount: statement ? String(editing.value ?? '') : String(editing.shares ?? ''),
        cost: editing.costBasis == null ? '' : String(editing.costBasis),
        tags: editing.tags.join(', '),
      });
      setAccount(editing.accountType);
      setMode(statement ? 'statement' : 'shares');
    } else if (key === 'new') {
      setForm(EMPTY);
      setMode('shares');
    }
  }

  const submit = async (another: boolean, e?: FormEvent) => {
    e?.preventDefault();
    const ticker = form.ticker.trim().toUpperCase();
    if (!ticker) {
      tickerRef.current?.focus();
      return;
    }
    const amount = parseAmount(form.amount);
    if (amount == null || amount <= 0) {
      setError(mode === 'shares' ? 'Enter the number of shares.' : 'Enter an amount.');
      return;
    }
    const costBasis = parseAmount(form.cost);
    const tags = form.tags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        unwrap(
          await api.PATCH('/holdings/{id}', {
            params: { path: { id: editing.id } },
            body: {
              ticker,
              accountType: account,
              tags,
              costBasis,
              ...(mode === 'statement'
                ? { shares: null, statementValue: amount }
                : { shares: amount, statementValue: null }),
            },
          }),
        );
      } else {
        unwrap(
          await api.POST('/portfolios/{id}/holdings', {
            params: { path: { id: portfolioId } },
            body: {
              ticker,
              accountType: account,
              tags,
              costBasis,
              ...(mode === 'shares'
                ? { shares: amount }
                : mode === 'dollars'
                  ? { dollars: amount }
                  : { statementValue: amount }),
            },
          }),
        );
      }
      onSaved();
      if (another && !editing) {
        setAdded(ticker);
        setForm(EMPTY);
        tickerRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the holding.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      unwrap(await api.DELETE('/holdings/{id}', { params: { path: { id: editing.id } } }));
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove the holding.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay
      open={open}
      onClose={onClose}
      variant="drawer"
      title={editing ? `Edit ${editing.ticker}` : 'Add holding'}
      description="Search by ticker or name. Assets without a market price can be added by statement value."
      initialFocus={tickerRef}
      footer={
        editing ? (
          <>
            <Button variant="danger" onClick={() => void remove()} disabled={busy}>
              Remove
            </Button>
            <Button variant="primary" type="submit" form="add-holding-form" disabled={busy}>
              Save
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => void submit(true)} disabled={busy}>
              Add and add another
            </Button>
            <Button variant="primary" type="submit" form="add-holding-form" disabled={busy}>
              Add
            </Button>
          </>
        )
      }
    >
      <form id="add-holding-form" onSubmit={(e) => void submit(false, e)} className="space-y-5">
        {added ? (
          <p role="status" className="rounded-lg bg-brand/10 px-3 py-2 text-[13px] text-brand">
            Added {added}. Enter the next holding.
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-[var(--sev-high-bg)] px-3 py-2 text-[13px] text-[var(--sev-high-fg)]"
          >
            {error}
          </p>
        ) : null}
        <div className="relative">
          <Field label="Ticker">
            <span className="relative block">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint"
              />
              <input
                ref={tickerRef}
                role="combobox"
                aria-expanded={showList && matches.length > 0}
                aria-controls="ticker-results"
                aria-autocomplete="list"
                autoComplete="off"
                value={form.ticker}
                onChange={(e) => {
                  setForm({ ...form, ticker: e.target.value });
                  setShowList(true);
                }}
                onBlur={() => setTimeout(() => setShowList(false), 120)}
                placeholder="e.g. VTI or Vanguard Total"
                className={cn(
                  inputClass,
                  'pl-9 font-mono uppercase placeholder:font-sans placeholder:normal-case',
                )}
              />
            </span>
          </Field>
          {showList && matches.length > 0 ? (
            <ul
              id="ticker-results"
              role="listbox"
              className="absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden rounded-[10px] border border-line-strong bg-surface-2 py-1 shadow-xl"
            >
              {matches.map((m) => (
                <li key={m.ticker} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setForm({ ...form, ticker: m.ticker });
                      setShowList(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] hover:bg-surface-3"
                  >
                    <span className="w-14 font-mono font-bold text-fg">{m.ticker}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{m.name}</span>
                    <span className="text-[11px] text-faint">{HOLDING_TYPE_LABEL[m.type]}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <Field label="Account type">
          <Select value={account} onChange={(e) => setAccount(e.target.value as AccountType)}>
            {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((a) => (
              <option key={a} value={a}>
                {ACCOUNT_TYPE_LABEL[a]}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-muted">Enter amount as</span>
          <SegmentedTabs
            label="Amount mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'shares', label: 'Shares' },
              ...(editing ? [] : [{ value: 'dollars' as const, label: 'Dollars' }]),
              { value: 'statement', label: 'Statement value' },
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={mode === 'shares' ? 'Shares' : mode === 'dollars' ? 'Amount ($)' : 'Value ($)'}
            hint={mode === 'statement' ? 'From your latest statement' : undefined}
          >
            <TextInput
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder={mode === 'shares' ? '12.5' : '$1,250.00'}
            />
          </Field>
          <Field label="Cost basis ($)" hint="Optional, total paid">
            <TextInput
              inputMode="decimal"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
              placeholder="$1,100.00"
            />
          </Field>
        </div>

        <Field label="Tags" hint="Comma separated, e.g. growth, core">
          <TextInput
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="growth, core"
          />
        </Field>
      </form>
    </Overlay>
  );
}
