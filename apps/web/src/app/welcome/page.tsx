import {
  ArrowRight,
  Coins,
  Gauge,
  Layers,
  MessageSquareText,
  Orbit,
  TrendingUp,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/shell/Logo';
import { LinkButton } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'EasyFI — see what your portfolio really owns',
  description:
    'Look through your ETFs to the companies underneath, spot hidden overlap, track income and inflation, and ask questions in plain English.',
};

const FEATURES: { icon: typeof Layers; title: string; body: string }[] = [
  {
    icon: Layers,
    title: 'Look-through exposure',
    body: 'Every fund opened up to the companies, sectors and industries it holds — added to what you own directly.',
  },
  {
    icon: Orbit,
    title: 'Overlap you can see',
    body: 'The constellation links each holding to the funds that carry it, so the same bet held three times stands out.',
  },
  {
    icon: MessageSquareText,
    title: 'Investment Explorer',
    body: 'Ask “would QQQ overlap with my portfolio?” and get an answer built only from your data, with dates.',
  },
  {
    icon: Coins,
    title: 'Dividends and income',
    body: 'Trailing income, yield on cost, the next 30 days and a 12-month calendar of expected payments.',
  },
  {
    icon: Gauge,
    title: 'Inflation in context',
    body: 'Latest CPI, what is driving it, and what your money buys in real terms years from now.',
  },
  {
    icon: TrendingUp,
    title: 'End-of-day, with dates',
    body: 'Prices and fund holdings refresh nightly. Every number says how fresh it is; missing prices are never $0.',
  },
];

const SHOWCASE: { img: string; alt: string; title: string; body: string }[] = [
  {
    img: '/landing/constellation.png',
    alt: 'Constellation view linking funds to the companies they hold',
    title: 'Your portfolio as a constellation',
    body: 'Funds are hubs, holdings are stars. A company held by four of your ETFs is drawn four times — so concentration you never chose becomes obvious.',
  },
  {
    img: '/landing/home.png',
    alt: 'Home dashboard with total value, allocation and portfolios sorted by risk',
    title: 'One screen for everything you own',
    body: 'Total value, true sector mix, portfolios ranked by diversification, and the insights worth a second look.',
  },
  {
    img: '/landing/lookthrough.png',
    alt: 'Look-through list showing each company split by the funds that hold it',
    title: 'Look through to the real holdings',
    body: 'Fold by company, sector, industry or asset class. Each bar shows which funds — and which direct positions — add up to your exposure.',
  },
  {
    img: '/landing/compare.png',
    alt: 'Two funds compared side by side with shared holdings',
    title: 'Compare funds without a spreadsheet',
    body: 'Sector tilts, shared holdings and overlap by weight for any two funds — or a fund against one of your portfolios.',
  },
  {
    img: '/landing/explorer.png',
    alt: 'Investment Explorer answering a question with a table',
    title: 'Ask in plain English',
    body: 'What-if a fund, compare two, find which ETFs are heavy in a stock. Answers come with tables and the as-of date of the data behind them.',
  },
  {
    img: '/landing/dividends.png',
    alt: 'Dividend income calendar and yield leaders',
    title: 'Income at a glance',
    body: 'A calendar of received and projected payments, yield leaders, and which holding your income really depends on.',
  },
];

function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-line-strong bg-surface shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)]">
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <span
            key={c}
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: c }}
          />
        ))}
      </div>
      <Image src={src} alt={alt} width={1440} height={900} className="h-auto w-full" />
    </div>
  );
}

function Section({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`mx-auto w-full max-w-[1140px] px-4 sm:px-6 ${className}`}>
      {children}
    </section>
  );
}

export default function WelcomePage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 w-full max-w-[1140px] items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link
            href="#features"
            className="hidden px-3 text-[14px] text-muted hover:text-fg sm:inline"
          >
            Features
          </Link>
          <Link href="#how" className="hidden px-3 text-[14px] text-muted hover:text-fg sm:inline">
            How it works
          </Link>
          <LinkButton href="/sign-in" variant="ghost">
            Sign in
          </LinkButton>
          <LinkButton href="/sign-up" variant="primary">
            I have an invite
          </LinkButton>
        </nav>
      </header>

      <Section className="grid items-center gap-10 pt-14 pb-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:pt-20">
        <div>
          <h1 className="text-[40px] leading-[1.08] font-semibold tracking-[-0.03em] text-fg sm:text-[52px]">
            See what you actually own.
          </h1>
          <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-muted">
            EasyFI opens up every ETF and fund in your portfolios, shows where they overlap, and
            puts income and inflation in context — then lets you ask questions in plain English.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/sign-up" variant="primary" size="lg">
              Create an account <ArrowRight aria-hidden className="h-4 w-4" />
            </LinkButton>
            <LinkButton href="/sign-in" variant="secondary" size="lg">
              Sign in
            </LinkButton>
          </div>
          <p className="mt-4 text-[13px] text-faint">
            Free and invite-only — for the owner and friends. No brokerage login required.
          </p>
        </div>
        <Shot src="/landing/home.png" alt="EasyFI home dashboard" />
      </Section>

      <Section className="pb-24">
        <div id="features" className="scroll-mt-20">
          <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-fg">
            Built for clarity
          </h2>
          <p className="mt-2 text-[15px] text-muted">
            The things a fund factsheet won&apos;t tell you about your own money.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="rounded-[var(--radius-card)] border border-line bg-surface p-5"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand/10 text-brand">
                  <f.icon aria-hidden className="h-[18px] w-[18px]" />
                </span>
                <h3 className="mt-4 text-[15px] font-semibold text-fg">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section className="space-y-24 pb-24">
        {SHOWCASE.map((s, i) => (
          <div key={s.title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
            <div className={i % 2 === 0 ? 'lg:order-1' : 'lg:order-2'}>
              <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-fg">{s.title}</h2>
              <p className="mt-3 max-w-[48ch] text-[15px] leading-relaxed text-muted">{s.body}</p>
            </div>
            <div className={i % 2 === 0 ? 'lg:order-2' : 'lg:order-1'}>
              <Shot src={s.img} alt={s.alt} />
            </div>
          </div>
        ))}
      </Section>

      <Section className="pb-24">
        <div id="how" className="scroll-mt-20">
          <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-fg">How it works</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              [
                'Add or import a portfolio',
                'Type a few tickers or import a positions CSV from Fidelity, Schwab or Vanguard. Hypothetical and watchlist portfolios work too.',
              ],
              [
                'We look through it overnight',
                'End-of-day prices and the latest SEC fund filings are refreshed nightly, so the morning view is current.',
              ],
              [
                'Explore, compare, ask',
                'Dig into overlap, income and inflation, simulate adding a fund, or ask the Explorer.',
              ],
            ].map(([title, body], i) => (
              <li
                key={title}
                className="rounded-[var(--radius-card)] border border-line bg-surface p-5"
              >
                <span className="text-[13px] font-semibold text-brand">{i + 1}</span>
                <h3 className="mt-2 text-[15px] font-semibold text-fg">{title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <footer className="border-t border-line">
        <Section className="space-y-3 py-8 text-[12px] leading-relaxed text-faint">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Logo />
            <span>
              Market data: Tiingo (EOD) · SEC EDGAR N-PORT · U.S. Bureau of Labor Statistics
            </span>
          </div>
          <p>
            EasyFI is an educational tool for the owner and invited friends. It is not investment,
            tax or legal advice, and EasyFI is not a registered investment adviser or broker-dealer.
            Prices are end-of-day and fund holdings come from quarterly filings with a delay;
            numbers may be incomplete or out of date — every figure shows its as-of date.
          </p>
        </Section>
      </footer>
    </div>
  );
}
