import type { Dividends } from '@easyfi/contracts';
import { AlertTriangle, Coins } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DividendKpiCards } from '@/components/dividends/DividendKpiCards';
import { DividendsPortfolioSelect } from '@/components/dividends/DividendsPortfolioSelect';
import { HoldingsIncomeTable } from '@/components/dividends/HoldingsIncomeTable';
import { IncomeCalendar } from '@/components/dividends/IncomeCalendar';
import { YieldLeaders } from '@/components/dividends/YieldLeaders';
import { PageHeader } from '@/components/shell/PageHeader';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ApiError, load, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Dividends' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DividendsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.portfolio) ? sp.portfolio[0] : sp.portfolio;
  const portfolio = raw?.trim() || 'all';
  const api = await serverApi();

  let data: Dividends;
  try {
    data = await load(api.GET('/dividends', { params: { query: { portfolio } } }));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const scopeName =
    portfolio === 'all'
      ? 'all your portfolios'
      : (data.portfolios.find((p) => p.id === portfolio)?.name ?? 'this portfolio');
  const hasIncome = data.holdings.length > 0 || data.calendar.some((m) => m.payments.length > 0);

  return (
    <>
      <PageHeader
        title="Dividends"
        subtitle={`Income paid and expected across ${scopeName}`}
        actions={
          data.portfolios.length > 0 ? (
            <Suspense fallback={<div className="h-10 w-[240px]" />}>
              <DividendsPortfolioSelect value={portfolio} portfolios={data.portfolios} />
            </Suspense>
          ) : null
        }
      />

      {data.warnings.length ? (
        <div
          role="status"
          className="mb-5 flex gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[13px] text-muted"
        >
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <ul className="space-y-1">
            {data.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.portfolios.length === 0 ? (
        <EmptyState
          icon={<Coins aria-hidden className="h-6 w-6" />}
          title="No portfolios yet"
          body="Add a portfolio with a few holdings to see the dividends they pay and what is coming next."
          action={
            <LinkButton href="/portfolios?new=1" variant="primary">
              Create a portfolio
            </LinkButton>
          }
        />
      ) : !hasIncome ? (
        <EmptyState
          icon={<Coins aria-hidden className="h-6 w-6" />}
          title="No dividend income"
          body={`None of the holdings in ${scopeName} have paid or announced a distribution.`}
        />
      ) : (
        <>
          <DividendKpiCards kpis={data.kpis} />
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <IncomeCalendar key={portfolio} months={data.calendar} />
            <YieldLeaders leaders={data.yieldLeaders} asOf={data.kpis.asOf} />
          </div>
          <div className="mt-5">
            <HoldingsIncomeTable rows={data.holdings} asOf={data.kpis.asOf} />
          </div>
        </>
      )}
    </>
  );
}
