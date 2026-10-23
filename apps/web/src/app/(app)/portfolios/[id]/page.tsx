import { FlaskConical, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AllocationCard } from '@/components/overview/AllocationCard';
import { ValueCard } from '@/components/overview/ValueCard';
import { FeeDragCard } from '@/components/portfolio/FeeDragCard';
import { LookThroughBody } from '@/components/portfolio/LookThroughBody';
import { LookThroughToolbar } from '@/components/portfolio/LookThroughToolbar';
import { UnresolvedNotice } from '@/components/portfolio/UnresolvedNotice';
import { PageHeader } from '@/components/shell/PageHeader';
import type { FoldBy, LookThroughView } from '@/components/types';
import { LinkButton } from '@/components/ui/Button';
import { PORTFOLIO_RANGES } from '@/components/ui/RangeTabs';
import { ApiError, load, serverApi } from '@/lib/api/server';
import { formatIsoDate } from '@/lib/format';

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

async function detail(id: string) {
  const api = await serverApi();
  try {
    return await load(api.GET('/portfolios/{id}', { params: { path: { id } } }));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  return { title: (await detail(id)).name };
}

export default async function PortfolioPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const foldParam = one(sp.fold);
  const fold: FoldBy =
    foldParam === 'sector' || foldParam === 'industry' || foldParam === 'asset'
      ? foldParam
      : 'company';
  const view: LookThroughView = one(sp.view) === 'constellation' ? 'constellation' : 'stack';
  const focus = one(sp.focus) ?? null;
  const path = { params: { path: { id } } };

  const api = await serverApi();
  const [p, lt, series, constellation] = await Promise.all([
    detail(id),
    load(api.GET('/portfolios/{id}/lookthrough', { params: { path: { id }, query: { fold } } })),
    view === 'stack' ? load(api.GET('/portfolios/{id}/value-series', path)) : null,
    view === 'constellation' ? load(api.GET('/portfolios/{id}/constellation', path)) : null,
  ]);
  const basePath = `/portfolios/${p.id}`;
  const updated = p.asOf ? ` · prices ${formatIsoDate(p.asOf)}` : '';
  const holdingsAsOf = p.holdingsAsOf ? ` · fund holdings ${formatIsoDate(p.holdingsAsOf)}` : '';

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Portfolios', href: '/portfolios' }, { label: p.name }]}
        title={p.name}
        subtitle={`${p.holdingsCount} holdings · ${p.currency}${updated}${holdingsAsOf}`}
        actions={
          <>
            <LinkButton href={`/what-if?portfolio=${encodeURIComponent(p.id)}`} variant="secondary">
              <FlaskConical aria-hidden className="h-4 w-4" /> What if…
            </LinkButton>
            <LinkButton href={`/compare?a=${encodeURIComponent(p.id)}&b=VOO`} variant="secondary">
              Compare with…
            </LinkButton>
            <LinkButton href={`${basePath}/holdings`} variant="primary">
              <Plus aria-hidden className="h-4 w-4" /> Manage holdings
            </LinkButton>
          </>
        }
      />

      {view === 'stack' && series ? (
        <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <ValueCard
            title="Portfolio value"
            value={p.totalValue}
            changeToday={p.changeToday}
            series={series.ranges}
            ranges={PORTFOLIO_RANGES}
            defaultRange="1M"
            asOf={p.asOf}
            layout="split"
          />
          <AllocationCard
            data={p.allocation}
            diversificationScore={p.diversificationScore}
            asOf={p.asOf}
            variant="compact"
          />
        </div>
      ) : null}

      <UnresolvedNotice unresolved={lt.unresolved} unpriced={lt.unpriced} />

      <section aria-label="Look-through exposure">
        <LookThroughToolbar basePath={basePath} fold={fold} view={view} />
        <LookThroughBody
          basePath={basePath}
          fold={fold}
          view={view}
          rows={lt.rows}
          funds={constellation?.funds ?? lt.funds}
          holdings={constellation?.holdings ?? []}
          sourceOrder={constellation?.sourceOrder ?? lt.sourceOrder}
          focus={focus}
        />
      </section>

      {view === 'stack' ? <FeeDragCard fees={p.feeDrag} className="mt-9" /> : null}
    </>
  );
}
