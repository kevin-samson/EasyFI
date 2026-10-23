import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/PageHeader';
import { WhatIfSimulator } from '@/components/whatif/WhatIfSimulator';
import { load, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'What if' };

type Search = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function WhatIfPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const api = await serverApi();
  const { portfolios } = await load(api.GET('/portfolios'));
  const requested = one(sp.portfolio);
  const portfolio = requested && portfolios.some((p) => p.id === requested) ? requested : 'all';
  const current = portfolios.find((p) => p.id === portfolio);

  return (
    <>
      <PageHeader
        breadcrumb={
          current
            ? [
                { label: 'Portfolios', href: '/portfolios' },
                { label: current.name, href: `/portfolios/${current.id}` },
                { label: 'What if' },
              ]
            : undefined
        }
        title="What if…"
        subtitle="Simulate adding a fund or stock and see what changes after look-through."
      />
      <WhatIfSimulator
        portfolios={portfolios.map((p) => ({ id: p.id, name: p.name }))}
        initial={{
          portfolio,
          ticker: (one(sp.ticker) ?? '').toUpperCase().slice(0, 24),
          amount: one(sp.amount) ?? '10000',
        }}
      />
    </>
  );
}
