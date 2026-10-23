'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Select } from '@/components/ui/Field';

export type DividendsPortfolioSelectProps = {
  /** 'all' or a portfolio id. */
  value: string;
  portfolios: { id: string; name: string }[];
};

/** Portfolio scope selector; writes ?portfolio= and lets the server re-render. */
export function DividendsPortfolioSelect({ value, portfolios }: DividendsPortfolioSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const onChange = (next: string) => {
    const sp = new URLSearchParams(params?.toString());
    if (next === 'all') sp.delete('portfolio');
    else sp.set('portfolio', next);
    const qs = sp.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return (
    <label className="block w-full sm:w-[240px]">
      <span className="sr-only">Portfolio</span>
      <Select
        value={value}
        disabled={pending}
        aria-busy={pending}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface disabled:opacity-60"
      >
        <option value="all">All portfolios</option>
        {portfolios.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </label>
  );
}
