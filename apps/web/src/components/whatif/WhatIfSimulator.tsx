'use client';

import { FlaskConical } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { api, unwrap } from '@/lib/api/client';
import { TickerSuggest } from './TickerSuggest';
import type { WhatIfResult } from './types';
import { WhatIfResultView } from './WhatIfResultView';

export type WhatIfPortfolioOption = { id: string; name: string };

/** Form (ticker, amount, portfolio) → POST /whatif, result below. Inputs mirror into the URL. */
export function WhatIfSimulator({
  portfolios,
  initial,
}: {
  portfolios: WhatIfPortfolioOption[];
  initial: { portfolio: string; ticker: string; amount: string };
}) {
  const [portfolio, setPortfolio] = useState(initial.portfolio);
  const [ticker, setTicker] = useState(initial.ticker);
  const [amount, setAmount] = useState(initial.amount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const autoRan = useRef(false);

  async function run(p = portfolio, t = ticker, a = amount) {
    const amt = Number(a.replace(/[$,\s]/g, ''));
    if (!t.trim()) return setError('Pick a fund or stock to add.');
    if (!(amt > 0)) return setError('Enter an amount above $0.');
    setBusy(true);
    setError(null);
    try {
      const r = unwrap(
        await api.POST('/whatif', { body: { portfolio: p, ticker: t.trim(), amount: amt } }),
      );
      setResult(r);
      const qs = new URLSearchParams({ portfolio: p, ticker: r.ticker, amount: String(amt) });
      // Native history keeps the URL shareable without re-rendering (and remounting) the page.
      window.history.replaceState(null, '', `${window.location.pathname}?${qs.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run the simulation.');
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // Deep links with ?ticker=…&amount=… run once on arrival.
    if (autoRan.current || !initial.ticker || !initial.amount) return;
    autoRan.current = true;
    void run(initial.portfolio, initial.ticker, initial.amount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <form
          className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <Field label="Fund or stock to add">
            <TickerSuggest value={ticker} onChange={setTicker} />
          </Field>
          <Field label="Amount ($)">
            <TextInput
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10,000"
            />
          </Field>
          <Field label="Into">
            <Select value={portfolio} onChange={(e) => setPortfolio(e.target.value)}>
              <option value="all">All portfolios</option>
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="primary" size="lg" disabled={busy}>
            <FlaskConical aria-hidden className="h-4 w-4" />
            {busy ? 'Simulating…' : 'Simulate'}
          </Button>
        </form>
        {error ? (
          <p role="alert" className="mt-3 text-[13px] text-down">
            {error}
          </p>
        ) : null}
      </Card>

      {result ? (
        <div aria-busy={busy} className={busy ? 'opacity-60 transition-opacity' : undefined}>
          <WhatIfResultView result={result} />
        </div>
      ) : (
        <EmptyState
          icon={<FlaskConical aria-hidden className="h-6 w-6" />}
          title="Try a fund before you buy it"
          body="Pick a ticker and an amount to see how your sectors, overlap and diversification score would change."
        />
      )}
    </div>
  );
}
