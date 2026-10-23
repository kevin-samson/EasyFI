'use client';

import { ArrowLeftRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/cn';
import type { CompareOption } from './types';

export type FundPickerProps = {
  options: CompareOption[];
  a: string;
  b: string;
  className?: string;
};

/**
 * Two fund/portfolio selects; changing either updates ?a=&b= (keeps other params like ?mode=)
 * and the server component re-renders with the new comparison.
 */
export function FundPicker({ options, a, b, className }: FundPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const push = (next: { a: string; b: string }) => {
    const sp = new URLSearchParams(params?.toString());
    sp.set('a', next.a);
    sp.set('b', next.b);
    startTransition(() => router.push(`${pathname}?${sp.toString()}`, { scroll: false }));
  };

  // Keep the current selection visible even if it is not in the suggested list.
  const withCurrent = (value: string) =>
    options.some((o) => o.value === value)
      ? options
      : [{ value, label: value, kind: 'fund' as const }, ...options];

  const select = (label: string, value: string, other: string, onPick: (v: string) => void) => {
    const opts = withCurrent(value);
    const funds = opts.filter((o) => o.kind === 'fund');
    const portfolios = opts.filter((o) => o.kind === 'portfolio');
    const render = (o: CompareOption) => (
      <option key={o.value} value={o.value} disabled={o.value === other}>
        {o.label}
      </option>
    );
    return (
      <label className="relative block min-w-0 flex-1 sm:w-[280px] sm:flex-none">
        <span className="sr-only">{label}</span>
        <select
          value={value}
          disabled={pending}
          onChange={(e) => onPick(e.target.value)}
          className="h-10 w-full appearance-auto rounded-[10px] border border-line bg-surface pr-8 pl-3 text-[14px] text-fg focus:border-line-strong focus:outline-none focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60"
        >
          {funds.length ? <optgroup label="Funds">{funds.map(render)}</optgroup> : null}
          {portfolios.length ? (
            <optgroup label="Your portfolios">{portfolios.map(render)}</optgroup>
          ) : null}
        </select>
      </label>
    );
  };

  return (
    <div className={cn('flex items-center gap-2', className)} aria-busy={pending}>
      {select('First fund or portfolio', a, b, (v) => push({ a: v, b }))}
      <button
        type="button"
        onClick={() => push({ a: b, b: a })}
        disabled={pending}
        aria-label="Swap sides"
        title="Swap sides"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-60"
      >
        <ArrowLeftRight aria-hidden className="h-4 w-4" />
      </button>
      {select('Second fund or portfolio', b, a, (v) => push({ a, b: v }))}
    </div>
  );
}
