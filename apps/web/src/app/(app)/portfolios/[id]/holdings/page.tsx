import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HoldingsWorkspace } from '@/components/holdings/HoldingsWorkspace';
import { ApiError, load, serverApi } from '@/lib/api/server';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Manage holdings' };

const SAMPLE_CSV = `Symbol,Description,Quantity,Last Price,Cost Basis Total
VTI,Vanguard Total Stock Market ETF,25,290.00,6100.00
SCHD,Schwab US Dividend Equity ETF,120,27.50,3000.00
MSFT,Microsoft Corp,4,510.00,1500.00`;

export default async function HoldingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await serverApi();
  let list, detail;
  try {
    [list, detail] = await Promise.all([
      load(api.GET('/portfolios/{id}/holdings', { params: { path: { id } } })),
      load(api.GET('/portfolios/{id}', { params: { path: { id } } })),
    ]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  return (
    <HoldingsWorkspace
      portfolioId={list.portfolioId}
      portfolio={{ id: detail.id, name: detail.name, type: detail.type, cash: detail.cash }}
      breadcrumb={[
        { label: 'Portfolios', href: '/portfolios' },
        { label: list.portfolioName, href: `/portfolios/${list.portfolioId}` },
        { label: 'Holdings' },
      ]}
      subtitle={`${list.portfolioName} · ${list.holdings.length} lines${detail.cash ? ` · ${formatMoney(detail.cash)} cash` : ''} · USD`}
      holdings={list.holdings}
      asOf={list.asOf}
      csvSample={SAMPLE_CSV}
      exportName={list.portfolioName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
    />
  );
}
