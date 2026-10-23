import { ArrowRight, Lightbulb } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { explorerHref, InsightCard } from '@/components/home/InsightList';
import { PageHeader } from '@/components/shell/PageHeader';
import type { Severity } from '@/components/types';
import { AsOf } from '@/components/ui/AsOf';
import { Card, CardHeader, SectionHeading } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { load, serverApi } from '@/lib/api/server';
import { cn } from '@/lib/cn';
import { formatPercent, trendClass } from '@/lib/format';

export const metadata: Metadata = { title: 'Insights' };

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export default async function InsightsPage() {
  const api = await serverApi();
  const home = await load(api.GET('/home'));
  const insights = [...home.insights].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const counts = insights.reduce<Record<Severity, number>>(
    (acc, i) => ({ ...acc, [i.severity]: acc[i.severity] + 1 }),
    { high: 0, medium: 0, low: 0 },
  );

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Insights' }]}
        title="Insights"
        subtitle={
          insights.length ? (
            <>
              {insights.length} things worth a look across your portfolios · {counts.high} high,{' '}
              {counts.medium} medium, {counts.low} low · <AsOf date={home.asOf} />
            </>
          ) : (
            'Concentration and overlap worth a look across your portfolios.'
          )
        }
      />

      {insights.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {insights.map((i) => (
            <Card key={i.id} as="div" className="flex">
              <InsightCard insight={i} className="w-full" />
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Lightbulb aria-hidden className="h-6 w-6" />}
          title="Nothing stands out"
          body="Add holdings to a portfolio and EasyFI will flag heavy concentration, sector tilts and fund overlap here."
        />
      )}

      {home.movers.length ? (
        <section aria-labelledby="h-movers" className="mt-9">
          <SectionHeading
            id="h-movers"
            title={
              <>
                Movers you own <span className="font-normal text-muted">· by exposure</span>
              </>
            }
          />
          <Card padded={false}>
            <div className="p-5 pb-3 sm:p-6 sm:pb-3">
              <CardHeader
                title="Today's change in companies you hold through funds and stocks"
                level={3}
              />
            </div>
            <ul className="divide-y divide-line border-t border-line">
              {home.movers.map((m) => (
                <li
                  key={m.ticker}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[13px] sm:px-6"
                >
                  <span className="w-16 font-mono font-bold text-fg">{m.ticker}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{m.name}</span>
                  <span className="text-faint tabular-nums">
                    {formatPercent(m.weight)} of your money
                  </span>
                  <span
                    className={cn(
                      'w-16 text-right font-semibold tabular-nums',
                      trendClass(m.change),
                    )}
                  >
                    {formatPercent(m.change, { signed: true })}
                  </span>
                  <AsOf date={m.asOf} className="w-28 text-right" />
                  <Link
                    href={explorerHref(
                      `Why did ${m.ticker} move today, and how much of my portfolio does it affect?`,
                    )}
                    className="inline-flex items-center gap-1 font-medium text-up hover:underline"
                  >
                    Ask why <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                    <span className="sr-only">: {m.ticker}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </>
  );
}
