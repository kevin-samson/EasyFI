import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: "What's new" };

type Entry = {
  date: string;
  title: string;
  tag: 'New' | 'Improved' | 'Fixed';
  body: string;
  href?: string;
};

const ENTRIES: Entry[] = [
  {
    date: '2026-10-24',
    title: 'What-if simulator',
    tag: 'New',
    body: 'Try adding a fund or stock before you buy it. See the sector shift, overlap with funds you already hold, the biggest company-level changes and your new diversification score.',
    href: '/what-if',
  },
  {
    date: '2026-10-24',
    title: 'FI goal tracker',
    tag: 'New',
    body: 'Set your annual expenses and withdrawal rate to get an FI number, see progress against everything you track, years to FI and a projection in today’s dollars.',
    href: '/settings#s-goals',
  },
  {
    date: '2026-10-24',
    title: 'Alerts',
    tag: 'New',
    body: 'Get an email when one company crosses a concentration threshold after look-through, or before a holding pays a dividend. Run a check any time from Settings.',
    href: '/settings#s-alerts',
  },
  {
    date: '2026-10-24',
    title: 'Read-only share links',
    tag: 'New',
    body: 'Share a snapshot of a portfolio with a friend: sector weights, top exposures and fund weights only — never share counts or dollar values. Revoke a link whenever you like.',
    href: '/settings#s-share',
  },
  {
    date: '2026-10-24',
    title: 'Fee drag',
    tag: 'New',
    body: 'Each portfolio shows its blended expense ratio, what fees cost you per year, and how much you pay for fund holdings that duplicate another fund you own.',
  },
  {
    date: '2026-10-24',
    title: 'Insights and feedback',
    tag: 'New',
    body: 'All exposure insights and today’s movers in one list, each with an “Ask why” link into the Explorer. Send feedback (with a screenshot) from Help.',
    href: '/insights',
  },
  {
    date: '2026-10-23',
    title: 'Investment Explorer',
    tag: 'New',
    body: 'Ask questions about your holdings in plain English. Answers use your real look-through data and come back with tables and sector-shift charts.',
    href: '/explorer',
  },
  {
    date: '2026-10-23',
    title: 'Dividends and inflation',
    tag: 'New',
    body: 'An income calendar, 12-month projection and yield leaders for what you hold, plus the latest CPI, its biggest drivers and a purchasing-power calculator.',
    href: '/dividends',
  },
  {
    date: '2026-10-23',
    title: 'Compare funds and portfolios',
    tag: 'New',
    body: 'Put two funds or portfolios side by side: sector mix, shared holdings and how much they overlap by weight.',
    href: '/compare',
  },
  {
    date: '2026-10-22',
    title: 'Look-through and constellation view',
    tag: 'New',
    body: 'Every fund is opened up so you see the companies you really own, folded by company, sector, industry or asset. The constellation shows funds as hubs and the holdings they share.',
    href: '/portfolios',
  },
  {
    date: '2026-10-22',
    title: 'Unpriced holdings never count as $0',
    tag: 'Fixed',
    body: 'Holdings without a price show a dash and an Unpriced label and are left out of totals. Every market number carries its as-of date.',
  },
];

const TONE = { New: 'brand', Improved: 'info', Fixed: 'low' } as const;

export default function WhatsNewPage() {
  return (
    <>
      <PageHeader title="What's new" subtitle="Recent changes to EasyFI." />
      <ol className="relative max-w-3xl space-y-4 border-l border-line pl-6">
        {ENTRIES.map((e) => (
          <li key={e.title} className="relative">
            <span
              aria-hidden
              className="absolute top-6 -left-[29px] h-2.5 w-2.5 rounded-full border-2 border-bg bg-brand"
            />
            <Card as="article">
              <div className="flex flex-wrap items-center gap-3">
                <time dateTime={e.date} className="text-[12px] text-faint">
                  {e.date}
                </time>
                <Pill tone={TONE[e.tag]}>{e.tag}</Pill>
              </div>
              <h2 className="mt-2 text-[15px] font-semibold text-fg">
                {e.href ? (
                  <Link href={e.href} className="hover:underline">
                    {e.title}
                  </Link>
                ) : (
                  e.title
                )}
              </h2>
              <p className="mt-1 max-w-[68ch] text-[14px] leading-relaxed text-muted">{e.body}</p>
            </Card>
          </li>
        ))}
      </ol>
    </>
  );
}
