'use client';

import { useEffect, useId, useState } from 'react';
import { inputClass } from '@/components/ui/Field';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { formatPercent } from '@/lib/format';
import type { SecuritySummary } from './types';

/** Ticker input with suggestions from GET /securities/search (debounced). */
export function TickerSuggest({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (ticker: string) => void;
  id?: string;
}) {
  const listId = useId();
  const [results, setResults] = useState<SecuritySummary[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const q = value.trim();
    if (!q || !open) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const r = await api
        .GET('/securities/search', { params: { query: { q, limit: 8 } }, signal: ctrl.signal })
        .catch(() => null);
      if (r?.data) {
        setResults(r.data.results);
        setActive(-1);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value, open]);

  const shown = open && value.trim() ? results : [];
  const pick = (s: SecuritySummary) => {
    onChange(s.ticker);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        id={id}
        className={cn(
          inputClass,
          'font-mono uppercase placeholder:font-sans placeholder:normal-case',
        )}
        value={value}
        placeholder="e.g. SCHD or VXUS"
        autoComplete="off"
        spellCheck={false}
        maxLength={24}
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!shown.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => (a + 1) % shown.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => (a <= 0 ? shown.length - 1 : a - 1));
          } else if (e.key === 'Enter' && active >= 0 && shown[active]) {
            e.preventDefault();
            pick(shown[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {shown.length ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full min-w-[280px] overflow-auto rounded-[10px] border border-line-strong bg-surface-2 py-1 shadow-lg"
        >
          {shown.map((s, i) => (
            <li
              key={s.ticker}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              className={cn(
                'flex cursor-pointer items-baseline gap-3 px-3 py-2 text-[13px]',
                i === active ? 'bg-surface-3' : 'hover:bg-surface-3',
              )}
            >
              <span className="w-14 shrink-0 font-mono font-bold text-fg">{s.ticker}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{s.name}</span>
              <span className="shrink-0 text-[11px] text-faint uppercase">
                {s.type}
                {s.expenseRatio != null ? ` · ${formatPercent(s.expenseRatio, { digits: 2 })}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
