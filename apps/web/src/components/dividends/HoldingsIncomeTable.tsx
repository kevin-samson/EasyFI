import { AsOf } from '@/components/ui/AsOf';
import { Card, CardHeader } from '@/components/ui/Card';
import { MiniBar } from '@/components/ui/MiniBar';
import { Money } from '@/components/ui/Values';
import { formatMoney, formatPercent } from '@/lib/format';
import { FREQUENCY_LABEL, type HoldingIncomeRow } from './types';

/** Per-holding income: annual income, yield, yield on cost, share of total income, frequency. */
export function HoldingsIncomeTable({
  rows,
  asOf,
}: {
  rows: HoldingIncomeRow[];
  asOf?: string | null;
}) {
  const known = rows.filter((r) => r.annualIncome != null);
  // Never show an unknown total as $0.
  const total = known.length ? known.reduce((s, r) => s + (r.annualIncome ?? 0), 0) : null;
  const partial = known.length > 0 && known.length < rows.length;
  const maxShare = Math.max(...rows.map((r) => r.shareOfIncome ?? 0), 0.0001);
  return (
    <Card padded={false}>
      <CardHeader
        className="px-5 pt-5 sm:px-6 sm:pt-6"
        title="Income by holding"
        meta="projected next 12 months"
        actions={<AsOf date={asOf} />}
      />
      <div className="scroll-x mt-3 px-5 pb-3 sm:px-6">
        <table className="w-full min-w-[680px] text-[13px]">
          <thead>
            <tr className="border-b border-line-strong text-left text-[12px] text-faint">
              <th scope="col" className="pb-3 font-normal">
                Holding
              </th>
              <th scope="col" className="pb-3 text-right font-normal">
                Annual income
              </th>
              <th scope="col" className="pb-3 text-right font-normal">
                Yield
              </th>
              <th scope="col" className="pb-3 text-right font-normal">
                Yield on cost
              </th>
              <th scope="col" className="w-[22%] pb-3 pl-8 font-normal">
                Share of income
              </th>
              <th scope="col" className="pb-3 text-right font-normal">
                Frequency
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ticker} className="border-b border-line/60">
                <th scope="row" className="py-3 text-left font-normal">
                  <span className="font-mono font-bold text-fg">{r.ticker}</span>
                  <span className="ml-3 text-muted">{r.name}</span>
                </th>
                <td className="py-3 text-right font-semibold text-fg">
                  <Money value={r.annualIncome} />
                </td>
                <td className="py-3 text-right text-fg">{formatPercent(r.yield, { digits: 2 })}</td>
                <td className="py-3 text-right text-muted">
                  {formatPercent(r.yieldOnCost, { digits: 2 })}
                </td>
                <td className="py-3 pl-8">
                  <span className="flex items-center gap-3">
                    <MiniBar
                      fraction={(r.shareOfIncome ?? 0) / maxShare}
                      color="var(--c3)"
                      className="flex-1"
                    />
                    <span className="w-11 text-right text-fg">
                      {formatPercent(r.shareOfIncome)}
                    </span>
                  </span>
                </td>
                <td className="py-3 text-right text-muted">{FREQUENCY_LABEL[r.frequency]}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-fg">
              <th scope="row" className="pt-3 text-left font-semibold">
                Total
              </th>
              <td className="pt-3 text-right font-semibold">{formatMoney(total)}</td>
              <td colSpan={4} className="pt-3 pl-4 text-[12px] text-faint">
                {partial ? 'Excludes holdings with unknown income' : null}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
