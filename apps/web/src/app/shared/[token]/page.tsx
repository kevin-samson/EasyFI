import { Link2Off } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { SharedSnapshot } from '@easyfi/contracts';
import type { ReactNode } from 'react';
import { Donut, DonutCenter } from '@/components/charts/Donut';
import { Logo } from '@/components/shell/Logo';
import { AsOf } from '@/components/ui/AsOf';
import { Card, CardHeader } from '@/components/ui/Card';
import { MiniBar } from '@/components/ui/MiniBar';
import { ApiError, serverApi, unwrap } from '@/lib/api/server';
import { cn } from '@/lib/cn';
import { formatPercent } from '@/lib/format';
import { fundColor, scoreClass, seriesColor } from '@/lib/palette';

type Params = Promise<{ token: string }>;

export const metadata: Metadata = {
  title: 'Shared portfolio',
  robots: { index: false, follow: false },
};

type Loaded = { ok: true; snapshot: SharedSnapshot } | { ok: false; reason: 'missing' | 'error' };

async function snapshot(token: string): Promise<Loaded> {
  const api = await serverApi();
  try {
    const s = unwrap(await api.GET('/shared/{token}', { params: { path: { token } } }));
    return { ok: true, snapshot: s };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) {
      return { ok: false, reason: 'missing' };
    }
    // Public page: never show a stack trace to someone who only has a link.
    return { ok: false, reason: 'error' };
  }
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1040px] px-4 pt-6 pb-16 sm:px-6 lg:pt-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <Logo />
        <span className="text-[12px] text-faint">Read-only snapshot</span>
      </header>
      {children}
      <footer className="mt-10 border-t border-line pt-5 text-[12px] leading-relaxed text-faint">
        Weights only — no share counts, dollar values or account details are shared. Funds are
        opened up so overlapping holdings are counted once. Educational, not investment advice.
      </footer>
    </div>
  );
}

export default async function SharedSnapshotPage({ params }: { params: Params }) {
  const { token } = await params;
  const loaded = await snapshot(token);

  if (!loaded.ok) {
    const missing = loaded.reason === 'missing';
    return (
      <Shell>
        <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-16 text-center">
          <Link2Off aria-hidden className="mb-3 h-7 w-7 text-faint" />
          <h1 className="text-[18px] font-semibold text-fg">
            {missing ? 'This link was revoked or not found' : 'This snapshot could not be loaded'}
          </h1>
          <p className="mt-2 max-w-sm text-[14px] text-muted">
            {missing
              ? 'The owner may have turned sharing off. Ask them for a new link.'
              : 'The link may have been revoked, or something went wrong on our side. Try again later or ask the owner for a new link.'}
          </p>
          <Link href="/" className="mt-5 text-[13px] font-medium text-up hover:underline">
            Go to EasyFI
          </Link>
        </div>
      </Shell>
    );
  }

  const s = loaded.snapshot;
  // Top five sectors + "Other", so every slice gets its own palette color.
  const sorted = [...s.sectors].sort((a, b) => b.weight - a.weight);
  const rest = sorted.slice(5).reduce((sum, x) => sum + x.weight, 0);
  const sectors = rest > 0 ? [...sorted.slice(0, 5), { label: 'Other', weight: rest }] : sorted;
  const fundOrder = s.funds.map((f) => f.ticker);
  const maxExposure = Math.max(0.0001, ...s.topExposures.map((e) => e.weight));

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted">Shared portfolio</p>
          <h1 className="text-[26px] font-semibold tracking-[-0.01em] text-fg">
            {s.portfolioName}
          </h1>
        </div>
        <AsOf date={s.asOf} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Sectors" meta="after look-through" />
          <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <Donut
              label={`Sector mix: ${sectors.map((x) => `${x.label} ${formatPercent(x.weight)}`).join(', ')}`}
              slices={sectors.map((x, i) => ({
                key: x.label,
                label: x.label,
                weight: x.weight,
                color: seriesColor(i, x.label),
              }))}
              center={
                <DonutCenter
                  value={
                    <span className={cn(scoreClass(s.diversificationScore))}>
                      {s.diversificationScore == null ? '—' : Math.round(s.diversificationScore)}
                    </span>
                  }
                  caption="Diversification"
                />
              }
            />
            <ul className="w-full min-w-0 flex-1 space-y-2">
              {sectors.map((x, i) => (
                <li key={x.label} className="flex items-center gap-2.5 text-[13px]">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: seriesColor(i, x.label) }}
                  />
                  <span className="min-w-0 flex-1 truncate text-fg">{x.label}</span>
                  <span className="text-muted tabular-nums">{formatPercent(x.weight)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader title="Top exposures" meta="company weight across all funds" />
          {s.topExposures.length ? (
            <ul className="mt-4 space-y-3">
              {s.topExposures.map((e) => (
                <li key={`${e.ticker ?? ''}-${e.name}`} className="text-[13px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {e.ticker ? (
                        <span className="mr-2 font-mono font-bold text-fg">{e.ticker}</span>
                      ) : null}
                      <span className="text-muted">{e.name}</span>
                    </span>
                    <span className="text-fg tabular-nums">
                      {formatPercent(e.weight, { digits: 2 })}
                    </span>
                  </div>
                  <MiniBar
                    className="mt-1.5"
                    fraction={e.weight / maxExposure}
                    color="var(--brand)"
                    height={4}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-muted">No exposures to show.</p>
          )}
        </Card>
      </div>

      {s.funds.length ? (
        <Card className="mt-5">
          <CardHeader title="Funds" meta="share of the portfolio in each fund" />
          <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {s.funds.map((f) => (
              <li key={f.ticker} className="text-[13px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono font-bold text-fg">{f.ticker}</span>
                  <span className="text-muted tabular-nums">{formatPercent(f.weight)}</span>
                </div>
                <MiniBar
                  className="mt-1.5"
                  fraction={f.weight}
                  color={fundColor(f.ticker, fundOrder)}
                  height={4}
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </Shell>
  );
}
