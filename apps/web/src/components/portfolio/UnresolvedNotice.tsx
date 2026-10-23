import type { LookThrough } from '@easyfi/contracts';
import { Info } from 'lucide-react';
import { formatPercent } from '@/lib/format';

/** Explains the slice we cannot look through and any unpriced lines (spec §11). */
export function UnresolvedNotice({
  unresolved,
  unpriced,
}: {
  unresolved: LookThrough['unresolved'];
  unpriced: string[];
}) {
  if (unresolved.weight < 0.0005 && unpriced.length === 0) return null;
  const tickers = [...new Set(unresolved.reasons.map((r) => r.ticker))];
  return (
    <p className="mb-4 flex items-start gap-2 rounded-[10px] border border-line bg-surface px-4 py-3 text-[13px] text-muted">
      <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
      <span>
        {unresolved.weight >= 0.0005 ? (
          <>
            {formatPercent(unresolved.weight)} of this portfolio ({tickers.join(', ')}) has no
            look-through data, so it is shown as its own slice and left out of the diversification
            score.{' '}
          </>
        ) : null}
        {unpriced.length ? (
          <>No price yet for {unpriced.join(', ')} — not counted in totals (never shown as $0).</>
        ) : null}
      </span>
    </p>
  );
}
