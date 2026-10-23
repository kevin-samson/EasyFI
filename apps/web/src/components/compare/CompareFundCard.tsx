import { Donut, DonutCenter } from '@/components/charts/Donut';
import { AsOf } from '@/components/ui/AsOf';
import { Card } from '@/components/ui/Card';
import { MiniBar } from '@/components/ui/MiniBar';
import { formatPercent } from '@/lib/format';
import { OTHER_COLOR } from '@/lib/palette';
import { compareLabel } from './labels';
import type { CompareFund } from './types';

/** "VOO  Vanguard S&P 500 ETF" for a fund; "Family Taxable  Portfolio" for a portfolio. */
function FundTitle({ fund }: { fund: CompareFund }) {
  return fund.kind === 'portfolio' ? (
    <h2 className="flex min-w-0 items-baseline gap-2.5">
      <span className="truncate text-[19px] font-bold text-fg">{fund.name}</span>
      <span className="shrink-0 text-[14px] text-muted">Portfolio</span>
    </h2>
  ) : (
    <h2 className="flex min-w-0 items-baseline gap-2.5">
      <span className="font-mono text-[19px] font-bold text-fg">{fund.ticker}</span>
      <span className="truncate text-[14px] text-muted">{fund.name}</span>
    </h2>
  );
}

export type CompareFundCardProps = {
  fund: CompareFund;
  /** Sector key → color, shared across both cards (see sectorColorMap). */
  colors: Record<string, string>;
};

/** One fund's sector mix: donut with "top sector" weight in the hole + legend with mini bars. */
export function CompareFundCard({ fund, colors }: CompareFundCardProps) {
  const ranked = fund.sectors.filter((s) => !/^other$/i.test(s.label));
  const top = ranked.reduce<(typeof ranked)[number] | undefined>(
    (best, s) => (!best || s.weight > best.weight ? s : best),
    undefined,
  );
  const scale = Math.max(0.55, ...fund.sectors.map((s) => s.weight));
  if (fund.sectors.length === 0) {
    return (
      <Card className="flex flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <FundTitle fund={fund} />
          <AsOf date={fund.asOf} prefix="holdings as of" />
        </div>
        <p className="mt-6 text-[13px] text-muted">No sector breakdown available yet.</p>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <FundTitle fund={fund} />
        <AsOf date={fund.asOf} prefix="holdings as of" />
      </div>
      <div className="mt-5 flex flex-1 flex-col items-center gap-7 sm:flex-row sm:gap-8">
        <Donut
          size={186}
          thickness={26}
          label={`${compareLabel(fund)} sector weights`}
          slices={fund.sectors.map((s) => ({ ...s, color: colors[s.key] ?? OTHER_COLOR }))}
          center={
            <DonutCenter
              value={formatPercent(top?.weight ?? null, { digits: 0 })}
              caption="top sector"
            />
          }
        />
        <ul className="w-full min-w-0 flex-1 space-y-[15px]">
          {fund.sectors.map((s) => {
            const color = colors[s.key] ?? OTHER_COLOR;
            return (
              <li key={s.key} className="flex items-center gap-3 text-[13px]">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <span className="w-[120px] min-w-0 truncate text-fg">{s.label}</span>
                <MiniBar
                  fraction={s.weight / scale}
                  color={color}
                  className="min-w-[48px] flex-1"
                />
                <span className="w-10 text-right font-semibold text-fg">
                  {formatPercent(s.weight, { digits: 0 })}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

/** Holdings-mode card: the fund's top holdings with weight bars; shared names are marked. */
export function CompareTopHoldingsCard({
  fund,
  color,
  sharedTickers,
}: {
  fund: CompareFund;
  color: string;
  sharedTickers: ReadonlySet<string>;
}) {
  const max = Math.max(...fund.topHoldings.map((h) => h.weight), 0.0001);
  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <FundTitle fund={fund} />
        <span className="text-[12px] text-faint">
          {fund.topHoldings.length
            ? `Top ${fund.topHoldings.length} of ${fund.holdingsCount.toLocaleString('en-US')}`
            : 'No holdings data'}
        </span>
      </div>
      <ol className="mt-4 divide-y divide-line">
        {fund.topHoldings.map((h) => {
          const shared = sharedTickers.has(h.ticker);
          return (
            <li key={h.ticker} className="flex items-center gap-3 py-2.5 text-[13px]">
              <span className="w-14 shrink-0 font-mono text-[13px] font-bold text-fg">
                {h.ticker}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted">
                {h.name}
                {shared ? (
                  <span className="ml-2 rounded-full bg-c3/15 px-1.5 py-0.5 text-[11px] font-medium text-c3">
                    in both
                  </span>
                ) : null}
              </span>
              <span className="hidden w-24 shrink-0 sm:block">
                <MiniBar fraction={h.weight / max} color={color} />
              </span>
              <span className="w-12 text-right font-semibold text-fg">
                {formatPercent(h.weight)}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3">
        <AsOf date={fund.asOf} prefix="holdings as of" />
      </div>
    </Card>
  );
}
