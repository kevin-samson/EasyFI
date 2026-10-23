import { ArrowRight, PieChart, Plus } from 'lucide-react';
import Link from 'next/link';
import { AskBar } from '@/components/home/AskBar';
import { InsightRow } from '@/components/home/InsightList';
import { MarketContextStrip } from '@/components/home/MarketContextStrip';
import { PortfolioRiskCard } from '@/components/home/PortfolioRiskCard';
import { AllocationCard } from '@/components/overview/AllocationCard';
import { ValueCard } from '@/components/overview/ValueCard';
import { PageHeader } from '@/components/shell/PageHeader';
import { LinkButton } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { HOME_RANGES } from '@/components/ui/RangeTabs';
import { load, serverApi } from '@/lib/api/server';

export default async function HomePage() {
  const api = await serverApi();
  const [home, series, me] = await Promise.all([
    load(api.GET('/home')),
    load(api.GET('/portfolios/{id}/value-series', { params: { path: { id: 'all' } } })),
    load(api.GET('/me')),
  ]);
  const firstName = me.displayName.split(' ')[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        subtitle="Here is what your portfolios own once every fund is opened up."
        actions={
          <LinkButton href="/portfolios?new=1" variant="primary">
            <Plus aria-hidden className="h-4 w-4" /> New portfolio
          </LinkButton>
        }
      />

      <AskBar suggestions={home.askSuggestions} />

      {home.portfolioCount === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<PieChart aria-hidden className="h-6 w-6" />}
          title="No portfolios yet"
          body="Create a portfolio and add a few holdings — by hand or from a broker CSV — to see what you really own."
          action={
            <LinkButton href="/portfolios?new=1" variant="primary">
              <Plus aria-hidden className="h-4 w-4" /> Create your first portfolio
            </LinkButton>
          }
        />
      ) : (
        <>
          <p className="mt-6 mb-3 text-[13px] text-muted">
            Overview <span className="text-faint">·</span> All portfolios
          </p>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <ValueCard
              title="Total tracked value"
              value={home.totalValue}
              note={`${home.portfolioCount} portfolio${home.portfolioCount === 1 ? '' : 's'}`}
              series={series.ranges}
              ranges={HOME_RANGES}
              defaultRange="1Y"
              asOf={home.asOf}
            />
            <AllocationCard
              data={home.allocation}
              diversificationScore={home.diversificationScore}
              asOf={home.asOf}
            />
          </div>

          <section aria-labelledby="h-portfolios" className="mt-9">
            <SectionHeading
              id="h-portfolios"
              title={
                <>
                  Your portfolios <span className="font-normal text-muted">· sorted by risk</span>
                </>
              }
              action={
                <Link href="/portfolios" className="inline-flex items-center gap-1 hover:text-fg">
                  View all ({home.portfolioCount}){' '}
                  <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {home.portfolios.slice(0, 3).map((p) => (
                <PortfolioRiskCard key={p.id} portfolio={p} href={`/portfolios/${p.id}`} />
              ))}
            </div>
          </section>

          {home.insights.length ? (
            <section aria-labelledby="h-insights" className="mt-9">
              <SectionHeading
                id="h-insights"
                title="Exposure insights"
                action={
                  <Link href="/insights" className="inline-flex items-center gap-1 hover:text-fg">
                    See all <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <InsightRow insights={home.insights.slice(0, 3)} />
            </section>
          ) : null}
        </>
      )}

      <section aria-labelledby="h-market" className="mt-9">
        <SectionHeading id="h-market" title="Market context" />
        <MarketContextStrip quotes={home.marketContext} />
      </section>
    </>
  );
}
