import type { Comparison } from '@easyfi/contracts';
import { SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { sectorColorMap } from '@/components/compare/colors';
import { CompareFundCard, CompareTopHoldingsCard } from '@/components/compare/CompareFundCard';
import { FundPicker } from '@/components/compare/FundPicker';
import { compareLabel } from '@/components/compare/labels';
import { SharedHoldingsTable } from '@/components/compare/SharedHoldingsTable';
import type { CompareMode } from '@/components/compare/types';
import { PageHeader } from '@/components/shell/PageHeader';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { ApiError, load, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Compare' };

const SHARED_ROWS = 10;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const mode: CompareMode = one(sp.mode) === 'holdings' ? 'holdings' : 'sector';
  const api = await serverApi();
  const query = { a: one(sp.a), b: one(sp.b) };

  let cmp: Comparison;
  try {
    cmp = await load(api.GET('/compare', { params: { query } }));
  } catch (e) {
    if (!(e instanceof ApiError) || (e.status !== 404 && e.status !== 400)) throw e;
    // Unknown fund/portfolio: fall back to the default pair just for the picker options.
    const fallback = await load(api.GET('/compare'));
    return (
      <>
        <PageHeader title="Compare" subtitle="Pick two funds or portfolios" />
        <Suspense fallback={<div className="mb-5 h-10" />}>
          <FundPicker
            className="mb-5"
            options={fallback.options}
            a={query.a ?? fallback.a.ticker}
            b={query.b ?? fallback.b.ticker}
          />
        </Suspense>
        <EmptyState
          icon={<SearchX aria-hidden className="h-6 w-6" />}
          title="Nothing to compare"
          body={e.message}
          action={
            <LinkButton href="/compare" variant="primary">
              Compare {compareLabel(fallback.a)} and {compareLabel(fallback.b)}
            </LinkButton>
          }
        />
      </>
    );
  }

  const { a, b, shared, sharedCount, overlapByWeight, options } = cmp;
  const labelA = compareLabel(a);
  const labelB = compareLabel(b);
  const colors = sectorColorMap([a, b]);
  const showAll = one(sp.shared) === 'all';
  const href = (m: CompareMode, all = showAll) =>
    `/compare?a=${encodeURIComponent(a.ticker)}&b=${encodeURIComponent(b.ticker)}&mode=${m}${all ? '&shared=all' : ''}`;
  const sharedTickers = new Set(shared.map((h) => h.ticker));

  return (
    <>
      <PageHeader
        title="Compare"
        subtitle={`${labelA} vs ${labelB} · ${mode === 'sector' ? 'sector weights' : 'top holdings'}`}
        actions={
          <SegmentedTabs
            label="Compare by"
            value={mode}
            options={[
              { value: 'sector', label: 'Sector', href: href('sector') },
              { value: 'holdings', label: 'Holdings', href: href('holdings') },
            ]}
          />
        }
      />

      <Suspense fallback={<div className="mb-5 h-10" />}>
        <FundPicker className="mb-5" options={options} a={a.ticker} b={b.ticker} />
      </Suspense>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {mode === 'sector' ? (
          <>
            <CompareFundCard fund={a} colors={colors} />
            <CompareFundCard fund={b} colors={colors} />
          </>
        ) : (
          <>
            <CompareTopHoldingsCard fund={a} color="var(--c1)" sharedTickers={sharedTickers} />
            <CompareTopHoldingsCard fund={b} color="var(--c5)" sharedTickers={sharedTickers} />
          </>
        )}
      </div>

      <SharedHoldingsTable
        labelA={labelA}
        labelB={labelB}
        holdings={shared}
        sharedCount={sharedCount}
        overlapByWeight={overlapByWeight}
        limit={showAll ? undefined : SHARED_ROWS}
        showAllHref={showAll ? undefined : href(mode, true)}
        showLessHref={showAll && shared.length > SHARED_ROWS ? href(mode, false) : undefined}
      />
    </>
  );
}
