import type { Metadata } from 'next';
import { PortfolioRiskCard } from '@/components/home/PortfolioRiskCard';
import { PortfolioCreateForm } from '@/components/portfolios/PortfolioCreateForm';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { formatMoney } from '@/lib/format';
import { load, serverApi } from '@/lib/api/server';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Portfolios' };

export default async function PortfoliosPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { new: isNew } = await searchParams;
  const highlight = isNew === '1';
  const api = await serverApi();
  const { portfolios, totalValue: total } = await load(api.GET('/portfolios'));
  const sorted = [...portfolios].sort(
    (a, b) => (a.diversificationScore ?? 101) - (b.diversificationScore ?? 101),
  );

  return (
    <>
      <PageHeader
        title="Portfolios"
        subtitle={`${portfolios.length} portfolio${portfolios.length === 1 ? '' : 's'} · ${formatMoney(total)} tracked · riskiest first`}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Your portfolios" className="grid content-start gap-5 md:grid-cols-2">
          {sorted.map((p) => (
            <PortfolioRiskCard key={p.id} portfolio={p} href={`/portfolios/${p.id}`} showType />
          ))}
        </section>
        <Card
          as="aside"
          aria-labelledby="h-new-portfolio"
          className={cn('self-start', highlight && 'border-brand/60 ring-1 ring-brand/40')}
        >
          <h2 id="h-new-portfolio" className="text-[15px] font-semibold text-fg">
            New portfolio
          </h2>
          <p className="mt-1 mb-5 text-[13px] text-muted">
            Add holdings after you create it, by hand or from a broker CSV.
          </p>
          <PortfolioCreateForm autoFocus={highlight} />
        </Card>
      </div>
    </>
  );
}
