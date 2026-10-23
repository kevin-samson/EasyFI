'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Tag, Trash2, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { AsOf } from '@/components/ui/AsOf';
import { Button } from '@/components/ui/Button';
import { MiniBar } from '@/components/ui/MiniBar';
import { Pill } from '@/components/ui/Pill';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { Money } from '@/components/ui/Values';
import { cn } from '@/lib/cn';
import { formatMoney, formatNumber, formatPercent, MISSING, trendClass } from '@/lib/format';
import { ACCOUNT_TYPE_LABEL, HOLDING_TYPE_LABEL, type HoldingRow, type HoldingType } from './types';

export type HoldingsView = 'overview' | 'returns' | 'income' | 'lookthrough';

export type HoldingsTableProps = {
  holdings: HoldingRow[];
  /** As-of date for prices in the table. */
  asOf: string | null;
  /** File name stem for the CSV export. */
  exportName?: string;
  /** Persist a bulk delete (rows are removed optimistically). */
  onDelete?: (ids: string[]) => void;
  /** Persist bulk tagging (tags are applied optimistically). */
  onTag?: (ids: string[], tag: string) => void;
  /** Open the editor for one line. */
  onEdit?: (row: HoldingRow) => void;
  className?: string;
};

type Ctx = { total: number; totalIncome: number; maxIncome: number };

type Column = {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** Value used for sorting (null sorts last). */
  sort?: (r: HoldingRow, ctx: Ctx) => number | string | null;
  cell: (r: HoldingRow, ctx: Ctx) => ReactNode;
  /** Plain text for CSV export. */
  text: (r: HoldingRow, ctx: Ctx) => string;
  footer?: (rows: HoldingRow[], ctx: Ctx) => ReactNode;
  minW?: string;
};

const VIEW_LABEL: Record<HoldingsView, string> = {
  overview: 'Overview',
  returns: 'Returns',
  income: 'Income',
  lookthrough: 'Look-through',
};

const tickerSort = (r: HoldingRow) => r.ticker;

const TYPE_ORDER: HoldingType[] = [
  'etf',
  'mutual_fund',
  'stock',
  'cash',
  'bond',
  'crypto',
  'other',
];

const weight = (r: HoldingRow, c: Ctx) => (r.value == null || !c.total ? null : r.value / c.total);
const gain = (r: HoldingRow) =>
  r.value == null || r.costBasis == null ? null : r.value - r.costBasis;
const sum = (rows: HoldingRow[], f: (r: HoldingRow) => number | null) =>
  rows.reduce((s, r) => s + (f(r) ?? 0), 0);

const pct = (v: number | null, digits = 1, signed = false) => formatPercent(v, { digits, signed });

const valueCol: Column = {
  key: 'value',
  label: 'Value',
  align: 'right',
  sort: (r) => r.value,
  cell: (r) => <Money value={r.value} quiet className="font-semibold text-fg" />,
  text: (r) => (r.value == null ? '' : r.value.toFixed(2)),
  footer: (rows) => <span className="font-semibold">{formatMoney(sum(rows, (r) => r.value))}</span>,
};
const weightCol: Column = {
  key: 'weight',
  label: 'Weight',
  align: 'right',
  sort: weight,
  cell: (r, c) => pct(weight(r, c)),
  text: (r, c) => pct(weight(r, c)),
  footer: (rows, c) => pct(c.total ? sum(rows, (r) => r.value) / c.total : null),
};
const dayCol: Column = {
  key: 'day',
  label: 'Today',
  align: 'right',
  sort: (r) => r.dayChange,
  cell: (r) => <span className={trendClass(r.dayChange)}>{pct(r.dayChange, 2, true)}</span>,
  text: (r) => pct(r.dayChange, 2, true),
};
const typeCol: Column = {
  key: 'type',
  label: 'Type',
  sort: (r) => HOLDING_TYPE_LABEL[r.type],
  cell: (r) => <span className="text-muted">{HOLDING_TYPE_LABEL[r.type]}</span>,
  text: (r) => HOLDING_TYPE_LABEL[r.type],
};

const COLUMNS: Record<HoldingsView, Column[]> = {
  overview: [
    typeCol,
    {
      key: 'account',
      label: 'Account',
      sort: (r) => ACCOUNT_TYPE_LABEL[r.accountType],
      cell: (r) => <span className="text-muted">{ACCOUNT_TYPE_LABEL[r.accountType]}</span>,
      text: (r) => ACCOUNT_TYPE_LABEL[r.accountType],
      minW: 'min-w-[110px]',
    },
    {
      key: 'shares',
      label: 'Shares',
      align: 'right',
      sort: (r) => r.shares,
      cell: (r) => formatNumber(r.shares, r.shares != null && r.shares % 1 ? 2 : 0),
      text: (r) => (r.shares == null ? '' : String(r.shares)),
    },
    {
      key: 'price',
      label: 'Price',
      align: 'right',
      sort: (r) => r.price,
      cell: (r) => <Money value={r.price} cents quiet />,
      text: (r) => (r.price == null ? '' : r.price.toFixed(2)),
    },
    valueCol,
    weightCol,
    dayCol,
  ],
  returns: [
    {
      key: 'cost',
      label: 'Cost basis',
      align: 'right',
      sort: (r) => r.costBasis,
      cell: (r) => <Money value={r.costBasis} quiet />,
      text: (r) => (r.costBasis == null ? '' : r.costBasis.toFixed(2)),
      footer: (rows) => formatMoney(sum(rows, (r) => r.costBasis)),
    },
    valueCol,
    {
      key: 'gain',
      label: 'Gain',
      align: 'right',
      sort: gain,
      cell: (r) => {
        const g = gain(r);
        return (
          <span className={trendClass(g)}>
            {g == null ? MISSING : `${g >= 0 ? '+' : '−'}${formatMoney(Math.abs(g))}`}
          </span>
        );
      },
      text: (r) => gain(r)?.toFixed(2) ?? '',
      footer: (rows) => {
        const priced = rows.filter((r) => gain(r) != null);
        const g = sum(priced, gain);
        return (
          <span
            className={trendClass(g)}
          >{`${g >= 0 ? '+' : '−'}${formatMoney(Math.abs(g))}`}</span>
        );
      },
    },
    {
      key: 'return',
      label: 'Total return',
      align: 'right',
      sort: (r) => r.totalReturn,
      cell: (r) => <span className={trendClass(r.totalReturn)}>{pct(r.totalReturn, 1, true)}</span>,
      text: (r) => pct(r.totalReturn, 1, true),
      footer: (rows) => {
        const priced = rows.filter((r) => gain(r) != null);
        const cost = sum(priced, (r) => r.costBasis);
        const v = cost ? sum(priced, gain) / cost : null;
        return <span className={trendClass(v)}>{pct(v, 1, true)}</span>;
      },
    },
    dayCol,
  ],
  income: [
    {
      key: 'yield',
      label: 'Yield',
      align: 'right',
      sort: (r) => r.yield,
      cell: (r) => pct(r.yield, 2),
      text: (r) => pct(r.yield, 2),
      footer: (rows) => {
        const v = sum(rows, (r) => r.value);
        return pct(v ? sum(rows, (r) => r.annualIncome) / v : null, 2);
      },
    },
    {
      key: 'income',
      label: 'Annual income',
      align: 'right',
      sort: (r) => r.annualIncome,
      cell: (r) => <Money value={r.annualIncome} quiet className="font-semibold text-fg" />,
      text: (r) => r.annualIncome?.toFixed(2) ?? '',
      footer: (rows) => (
        <span className="font-semibold">{formatMoney(sum(rows, (r) => r.annualIncome))}</span>
      ),
    },
    {
      key: 'incomeShare',
      label: '% of income',
      align: 'right',
      sort: (r, c) =>
        r.annualIncome == null || !c.totalIncome ? null : r.annualIncome / c.totalIncome,
      cell: (r, c) => {
        const s = r.annualIncome == null || !c.totalIncome ? null : r.annualIncome / c.totalIncome;
        return (
          <span className="inline-flex items-center justify-end gap-2.5">
            <MiniBar
              fraction={c.maxIncome ? (r.annualIncome ?? 0) / c.maxIncome : 0}
              color="var(--c3)"
              className="hidden w-16 sm:block"
            />
            <span className="w-12">{pct(s)}</span>
          </span>
        );
      },
      text: (r, c) =>
        pct(r.annualIncome == null || !c.totalIncome ? null : r.annualIncome / c.totalIncome),
      minW: 'min-w-[140px]',
    },
    valueCol,
  ],
  lookthrough: [
    typeCol,
    {
      key: 'coverage',
      label: 'Look-through coverage',
      sort: (r) => r.lookThroughCoverage,
      cell: (r) =>
        r.lookThroughCoverage == null ? (
          <span className="text-faint">Not available</span>
        ) : (
          <span className="flex items-center gap-2.5">
            <MiniBar
              fraction={r.lookThroughCoverage}
              color={r.lookThroughCoverage >= 0.9 ? 'var(--c3)' : 'var(--c4)'}
              className="w-24"
            />
            <span className="w-10 text-right text-muted">{pct(r.lookThroughCoverage, 0)}</span>
          </span>
        ),
      text: (r) => pct(r.lookThroughCoverage, 0),
      minW: 'min-w-[180px]',
    },
    valueCol,
    weightCol,
  ],
};

function csvEscape(s: string) {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Holdings table with view tabs, filters, sorting, selection + bulk actions, totals and CSV export.
 * Scrolls horizontally inside its own container on narrow screens.
 */
export function HoldingsTable({
  holdings,
  asOf,
  exportName = 'holdings',
  onDelete,
  onTag,
  onEdit,
  className,
}: HoldingsTableProps) {
  const [rows, setRows] = useState<HoldingRow[]>(holdings);
  // re-sync when the server sends fresh rows (after add / import / edit)
  const [source, setSource] = useState(holdings);
  if (source !== holdings) {
    setSource(holdings);
    setRows(holdings);
  }
  const [view, setView] = useState<HoldingsView>('overview');
  const [types, setTypes] = useState<Set<HoldingType>>(new Set());
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({
    key: 'value',
    dir: 'desc',
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagDraft, setTagDraft] = useState<string | null>(null);

  const ctx: Ctx = useMemo(
    () => ({
      total: sum(rows, (r) => r.value),
      totalIncome: sum(rows, (r) => r.annualIncome),
      maxIncome: Math.max(0, ...rows.map((r) => r.annualIncome ?? 0)),
    }),
    [rows],
  );

  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => r.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + (r.value ?? 0))));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const presentTypes = TYPE_ORDER.filter((t) => rows.some((r) => r.type === t));
  const columns = COLUMNS[view];

  const visible = useMemo(() => {
    const filtered = rows.filter(
      (r) => (types.size === 0 || types.has(r.type)) && (!tagFilter || r.tags.includes(tagFilter)),
    );
    const col = columns.find((c) => c.key === sort.key);
    const get = sort.key === 'ticker' ? tickerSort : col?.sort;
    if (!get) return filtered;
    return [...filtered].sort((a, b) => {
      const va = get(a, ctx);
      const vb = get(b, ctx);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = typeof va === 'string' ? va.localeCompare(String(vb)) : va - (vb as number);
      return sort.dir === 'asc' ? c : -c;
    });
  }, [rows, types, tagFilter, columns, sort, ctx]);

  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const someSelected = visible.some((r) => selected.has(r.id));

  const toggleSort = (key: string) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: key === 'ticker' ? 'asc' : 'desc' },
    );

  const toggleType = (t: HoldingType) =>
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map((r) => r.id)));

  const ids = [...selected];

  const deleteSelected = () => {
    onDelete?.(ids);
    setRows((rs) => rs.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
  };

  const applyTag = () => {
    const t = tagDraft?.trim().toLowerCase();
    if (!t) return;
    onTag?.(ids, t);
    setRows((rs) =>
      rs.map((r) =>
        selected.has(r.id) && !r.tags.includes(t) ? { ...r, tags: [...r.tags, t] } : r,
      ),
    );
    setTagDraft(null);
  };

  const exportCsv = () => {
    const header = ['Ticker', 'Name', ...columns.map((c) => c.label)];
    const lines = visible.map((r) =>
      [r.ticker, r.name, ...columns.map((c) => c.text(r, ctx))].map(csvEscape).join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportName}-${view}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortIcon = (key: string) =>
    sort.key !== key ? (
      <ChevronsUpDown aria-hidden className="h-3 w-3 opacity-40" />
    ) : sort.dir === 'asc' ? (
      <ArrowUp aria-hidden className="h-3 w-3" />
    ) : (
      <ArrowDown aria-hidden className="h-3 w-3" />
    );

  const ariaSort = (key: string) =>
    sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined;

  const chip = (active: boolean) =>
    cn(
      'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12px] whitespace-nowrap transition-colors',
      active
        ? 'border-line-strong bg-surface-3 font-semibold text-fg'
        : 'border-line text-muted hover:border-line-strong hover:text-fg',
    );

  return (
    <div className={cn('rounded-[var(--radius-card)] border border-line bg-surface', className)}>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <SegmentedTabs
            label="Table view"
            value={view}
            onChange={setView}
            options={(Object.keys(VIEW_LABEL) as HoldingsView[]).map((v) => ({
              value: v,
              label: VIEW_LABEL[v],
            }))}
          />
          <Button size="sm" onClick={exportCsv} aria-label="Export CSV">
            <Download aria-hidden className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
          <div
            role="group"
            aria-label="Filter by type"
            className="no-scrollbar scroll-x -mx-4 flex items-center gap-1.5 px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          >
            <button
              type="button"
              className={chip(types.size === 0)}
              aria-pressed={types.size === 0}
              onClick={() => setTypes(new Set())}
            >
              All types
            </button>
            {presentTypes.map((t) => (
              <button
                key={t}
                type="button"
                className={chip(types.has(t))}
                aria-pressed={types.has(t)}
                onClick={() => toggleType(t)}
              >
                {HOLDING_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          {allTags.length ? (
            <div
              role="group"
              aria-label="Filter by tag"
              className="no-scrollbar scroll-x -mx-4 flex items-center gap-1.5 px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:border-l sm:border-line sm:pr-0 sm:pl-4"
            >
              <Tag aria-hidden className="h-3.5 w-3.5 shrink-0 text-faint" />
              {allTags.map(([t, v]) => (
                <button
                  key={t}
                  type="button"
                  className={chip(tagFilter === t)}
                  aria-pressed={tagFilter === t}
                  onClick={() => setTagFilter((cur) => (cur === t ? null : t))}
                >
                  {t}
                  <span className="text-faint">{formatMoney(v, { compact: true })}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5 sm:px-5"
        >
          <span className="mr-2 text-[13px] font-semibold text-fg">{selected.size} selected</span>
          {tagDraft === null ? (
            <Button size="sm" onClick={() => setTagDraft('')}>
              <Tag aria-hidden className="h-3.5 w-3.5" /> Tag…
            </Button>
          ) : (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                applyTag();
              }}
            >
              <label className="sr-only" htmlFor="bulk-tag">
                Tag name
              </label>
              <input
                id="bulk-tag"
                autoFocus
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder="e.g. growth"
                className="h-8 w-32 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-fg placeholder:text-faint focus:outline-none"
              />
              <Button size="sm" type="submit" variant="primary">
                Apply
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTagDraft(null)}>
                Cancel
              </Button>
            </form>
          )}
          <Button size="sm" variant="danger" onClick={deleteSelected}>
            <Trash2 aria-hidden className="h-3.5 w-3.5" /> Delete
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setSelected(new Set())}
          >
            <X aria-hidden className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      ) : null}

      <p className="flex items-center gap-1 px-4 pt-3 text-[12px] text-faint md:hidden" aria-hidden>
        Swipe to see more columns →
      </p>

      <div className="scroll-x">
        <table className="w-full min-w-[720px] border-collapse text-[13px] tabular-nums">
          <caption className="sr-only">
            Holdings, {VIEW_LABEL[view]} view, sorted by {sort.key} {sort.dir}ending
          </caption>
          <thead>
            <tr className="border-b border-line text-[12px] text-faint">
              <th
                scope="col"
                className="sticky left-0 z-10 w-11 min-w-11 bg-surface py-2.5 pr-1 pl-4"
              >
                <input
                  type="checkbox"
                  aria-label="Select all visible holdings"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={toggleAll}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
              </th>
              <th
                scope="col"
                aria-sort={ariaSort('ticker')}
                className="sticky left-11 z-10 min-w-[200px] bg-surface py-3 pr-4 text-left font-normal"
              >
                <button
                  type="button"
                  onClick={() => toggleSort('ticker')}
                  className="inline-flex items-center gap-1 hover:text-fg"
                >
                  Holding {sortIcon('ticker')}
                </button>
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={ariaSort(c.key)}
                  className={cn(
                    'px-3 py-3 font-normal whitespace-nowrap last:pr-5',
                    c.align === 'right' ? 'text-right' : 'text-left',
                    c.minW,
                  )}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        'inline-flex items-center gap-1 hover:text-fg',
                        c.align === 'right' && 'flex-row-reverse',
                        sort.key === c.key && 'text-fg',
                      )}
                    >
                      {c.label} {sortIcon(c.key)}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const isSel = selected.has(r.id);
              return (
                <tr
                  key={r.id}
                  className={cn(
                    'group border-b border-line/70 last:border-b-0',
                    isSel ? 'bg-surface-2' : 'hover:bg-surface-2/60',
                  )}
                >
                  <td
                    className={cn(
                      'sticky left-0 z-10 w-11 min-w-11 py-2.5 pr-1 pl-4',
                      isSel ? 'bg-surface-2' : 'bg-surface group-hover:bg-surface-2',
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.ticker}`}
                      checked={isSel}
                      onChange={() => toggleRow(r.id)}
                      className="h-4 w-4 accent-[var(--brand)]"
                    />
                  </td>
                  <th
                    scope="row"
                    className={cn(
                      'sticky left-11 z-10 py-2.5 pr-4 text-left font-normal',
                      isSel ? 'bg-surface-2' : 'bg-surface group-hover:bg-surface-2',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {onEdit ? (
                        <button
                          type="button"
                          onClick={() => onEdit(r)}
                          title={`Edit ${r.ticker}`}
                          className="font-mono text-[13px] font-bold text-fg hover:underline hover:underline-offset-4"
                        >
                          {r.ticker}
                        </button>
                      ) : (
                        <span className="font-mono text-[13px] font-bold text-fg">{r.ticker}</span>
                      )}
                      {r.price == null ? (
                        <Pill tone="neutral" className="h-5 px-2 text-[11px]">
                          Unpriced
                        </Pill>
                      ) : null}
                      {r.tags.slice(0, 2).map((t) => (
                        <span
                          key={t}
                          className="hidden rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] text-muted lg:inline"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="mt-0.5 max-w-[240px] truncate text-[12px] text-faint">
                      {r.name}
                    </div>
                  </th>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-3 py-2.5 whitespace-nowrap text-fg last:pr-5',
                        c.align === 'right' ? 'text-right' : 'text-left',
                      )}
                    >
                      {c.cell(r, ctx)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="px-5 py-10 text-center text-muted">
                  No holdings match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong bg-surface-2 text-fg">
              <td className="sticky left-0 z-10 w-11 min-w-11 bg-surface-2 py-3 pl-4" />
              <th
                scope="row"
                className="sticky left-11 z-10 bg-surface-2 py-3 pr-4 text-left font-semibold"
              >
                Total{' '}
                <span className="font-normal text-faint">
                  · {visible.length} {visible.length === 1 ? 'holding' : 'holdings'}
                </span>
              </th>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-3 py-3 whitespace-nowrap last:pr-5',
                    c.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {c.footer?.(visible, ctx) ?? null}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 sm:px-5">
        <AsOf date={asOf} prefix="Prices as of" />
        {rows.some((r) => r.value == null) ? (
          <span className="text-[12px] text-faint">
            Unpriced lines are excluded from totals until a statement value is entered.
          </span>
        ) : null}
      </div>
    </div>
  );
}
