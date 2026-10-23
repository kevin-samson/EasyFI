import { Orbit, Rows3 } from 'lucide-react';
import type { FoldBy, LookThroughView } from '@/components/types';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';

export type LookThroughToolbarProps = {
  /** Base path of the portfolio page, e.g. "/portfolios/taxable-core". */
  basePath: string;
  fold: FoldBy;
  view: LookThroughView;
};

function href(basePath: string, fold: FoldBy, view: LookThroughView) {
  const p = new URLSearchParams();
  if (fold !== 'company') p.set('fold', fold);
  if (view !== 'stack') p.set('view', view);
  const q = p.toString();
  return q ? `${basePath}?${q}` : basePath;
}

const FOLDS: { value: FoldBy; label: string }[] = [
  { value: 'company', label: 'Company' },
  { value: 'sector', label: 'Sector' },
  { value: 'industry', label: 'Industry' },
  { value: 'asset', label: 'Assets' },
];

/** Fold tabs (Company / Sector / Industry) + view toggle (Constellation / Stack). URL-driven. */
export function LookThroughToolbar({ basePath, fold, view }: LookThroughToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 rounded-[var(--radius-card)] border border-line bg-surface p-2.5">
      <SegmentedTabs
        label="Group exposure by"
        value={fold}
        className="!flex-nowrap"
        options={FOLDS.map((f) => ({ ...f, href: href(basePath, f.value, view) }))}
      />
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-[13px] text-faint">View</span>
        <SegmentedTabs
          label="View"
          value={view}
          className="!flex-nowrap"
          options={[
            {
              value: 'constellation',
              label: 'Constellation',
              icon: <Orbit aria-hidden className="h-3.5 w-3.5" />,
              href: href(basePath, fold, 'constellation'),
            },
            {
              value: 'stack',
              label: 'Stack',
              icon: <Rows3 aria-hidden className="h-3.5 w-3.5" />,
              href: href(basePath, fold, 'stack'),
            },
          ]}
        />
      </div>
    </div>
  );
}
