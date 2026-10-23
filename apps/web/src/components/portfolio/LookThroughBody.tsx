'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExposureRow, FoldBy, FundRef, LookThroughView } from '@/components/types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/SearchInput';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { cn } from '@/lib/cn';
import { ConstellationView } from './ConstellationView';
import { ExposureStackList } from './ExposureStackList';
import type { ConstellationHolding } from './types';

export type LookThroughBodyProps = {
  basePath: string;
  fold: FoldBy;
  view: LookThroughView;
  rows: ExposureRow[];
  funds: FundRef[];
  holdings: ConstellationHolding[];
  sourceOrder: readonly string[];
  /** Ticker to focus/open on load (?focus=). */
  focus?: string | null;
};

const PLACEHOLDER: Record<FoldBy, string> = {
  company: 'Search by ticker or name…',
  sector: 'Search sectors…',
  industry: 'Search industries…',
  asset: 'Search asset classes…',
};

type MinWeight = '0' | '0.001' | '0.01';
type Level = 'all' | 'medium' | 'high';
type Limit = '25' | '100' | 'all';
const DEFAULT_DISPLAY = { min: '0' as MinWeight, level: 'all' as Level, limit: '100' as Limit };

const LEVEL_RANK = { high: 2, medium: 1, low: 0 } as const;

/** Popover with list filters for the Stack view (weight floor, concentration, row count). */
function DisplayMenu({
  value,
  onChange,
}: {
  value: typeof DEFAULT_DISPLAY;
  onChange: (v: typeof DEFAULT_DISPLAY) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const changed =
    value.min !== DEFAULT_DISPLAY.min ||
    value.level !== DEFAULT_DISPLAY.level ||
    value.limit !== DEFAULT_DISPLAY.limit;
  return (
    <div ref={ref} className="relative">
      <Button
        variant="secondary"
        className="relative h-10"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersHorizontal aria-hidden className="h-4 w-4" />
        <span className="hidden sm:inline">Display</span>
        <span className="sr-only sm:hidden">Display options</span>
        {changed ? (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[var(--c1)]"
          />
        ) : null}
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-label="Display options"
          className="absolute top-full right-0 z-20 mt-2 w-[300px] space-y-4 rounded-[12px] border border-line-strong bg-surface-2 p-4 shadow-xl"
        >
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-muted">Hide holdings under</p>
            <SegmentedTabs
              label="Minimum weight"
              value={value.min}
              onChange={(min) => onChange({ ...value, min })}
              options={[
                { value: '0', label: 'Show all' },
                { value: '0.001', label: '0.1%' },
                { value: '0.01', label: '1%' },
              ]}
            />
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-muted">Concentration</p>
            <SegmentedTabs
              label="Concentration"
              value={value.level}
              onChange={(level) => onChange({ ...value, level })}
              options={[
                { value: 'all', label: 'All' },
                { value: 'medium', label: 'Medium+' },
                { value: 'high', label: 'High' },
              ]}
            />
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-muted">Rows</p>
            <SegmentedTabs
              label="Rows"
              value={value.limit}
              onChange={(limit) => onChange({ ...value, limit })}
              options={[
                { value: '25', label: 'Top 25' },
                { value: '100', label: 'Top 100' },
                { value: 'all', label: 'All' },
              ]}
            />
          </div>
          <button
            type="button"
            className={cn('text-[12px] text-muted hover:text-fg', !changed && 'invisible')}
            onClick={() => onChange(DEFAULT_DISPLAY)}
          >
            Reset
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Search + Display controls, then the Stack list or the Constellation view. */
export function LookThroughBody({
  basePath,
  fold,
  view,
  rows,
  funds,
  holdings,
  sourceOrder,
  focus = null,
}: LookThroughBodyProps) {
  const [query, setQuery] = useState('');
  const [display, setDisplay] = useState(DEFAULT_DISPLAY);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const min = Number(display.min);
    const level = display.level === 'all' ? -1 : LEVEL_RANK[display.level];
    const out = rows.filter(
      (r) =>
        r.weight >= min &&
        LEVEL_RANK[r.concentration] >= level &&
        (!q || [r.ticker, r.name, r.sector, r.industry].some((v) => v?.toLowerCase().includes(q))),
    );
    return display.limit === 'all' ? out : out.slice(0, Number(display.limit));
  }, [rows, q, display]);

  return (
    <div className="mt-3">
      <div className="mb-4 flex gap-3">
        <SearchInput
          className="flex-1"
          label="Filter holdings"
          placeholder={view === 'constellation' ? PLACEHOLDER.company : PLACEHOLDER[fold]}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {view === 'stack' ? <DisplayMenu value={display} onChange={setDisplay} /> : null}
      </div>

      {view === 'constellation' ? (
        <ConstellationView
          funds={funds}
          holdings={holdings}
          sourceOrder={sourceOrder}
          initialKey={focus}
          query={query}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={query.trim() ? `Nothing matches “${query.trim()}”` : 'Nothing to show'}
          body={
            rows.length === 0
              ? 'Add holdings to see what they own.'
              : 'Try a ticker like NVDA, a company name, or loosen the display filters.'
          }
          action={
            rows.length ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setDisplay(DEFAULT_DISPLAY);
                }}
              >
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <ExposureStackList
          rows={filtered}
          sourceOrder={sourceOrder}
          openKey={focus ?? undefined}
          constellationHref={(t) => `${basePath}?view=constellation&focus=${encodeURIComponent(t)}`}
          stockHref={(t) =>
            `/explorer?q=${encodeURIComponent(`Tell me about ${t} and which of my funds hold it`)}`
          }
        />
      )}
    </div>
  );
}
