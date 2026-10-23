# EasyFI — Build Plan (loop goal)

Spec: `docs/specs/2026-10-22-easyfi-design.md`. Research: `docs/research/simplifi/`.

## Loop protocol

Each iteration:
1. Pick the **first unchecked** task below.
2. Write failing test(s) first, then implement until green.
3. Run `pnpm verify` (lint + typecheck + test + build). Fix until it passes.
4. Tick the box (`- [x]`), add a one-line note if something non-obvious happened.
5. Commit with a conventional message (`feat(core): ...`).
6. If blocked (missing secret, external decision), write it under **Blocked** and move to the next task.

Stop when every box is ticked or only blocked tasks remain.

## M0 — Scaffold
- [x] pnpm + Turborepo monorepo with `apps/web` and packages listed in spec §4; TS strict; shared tsconfig/eslint/prettier
  - Note: TypeScript pinned to 5.9.3 and ESLint to 9.x — typescript-eslint does not support TS 7, eslint-plugin-import/react not yet on ESLint 10. Packages are source-only (exports `./src/index.ts`, transpiled by Next).
- [x] Vitest configured per package; `pnpm verify` script at root
- [x] ESLint boundary rules enforcing spec §4 dependency rule (test: a forbidden import fails lint)
  - Note: uses built-in `no-restricted-imports` per directory (`boundaryRules()` in root config); test in `tooling/boundaries.test.ts`.
- [x] GitHub Actions CI running `pnpm verify`
- [x] `.env.example` listing every env var (Supabase URL/keys, DATABASE_URL, TIINGO_TOKEN, SEC_USER_AGENT, BLS_KEY, OPENROUTER_API_KEY, OPENROUTER_MODEL, INVITE_CODES)

## M1 — Core domain (pure, fixtures)
- [x] `test-fixtures`: VOO, QQQ, SCHD, VGT, VTI holdings (top ~50 each + realistic sectors), prices, dividends
- [x] `normalizeTicker`
- [x] `lookThrough` + per-source breakdown + unresolved slice
- [x] `foldBy` (company/sector/industry/asset)
- [x] `concentration` + `diversificationScore`
- [x] `overlap`
- [x] `exposureInsights`
- [x] `constellationGraph`
- [x] `portfolioValueSeries`
- [x] `dividendSummary` (TTM, yield, YoC, next 30d, projection, frequency)
- [x] `purchasingPower` (+ `cpiSnapshot`, `fiProgress`, `parseMoney`)
- [x] `parseBrokerCsv` (generic + Fidelity + Schwab + Vanguard)
- [x] `whatIf`, `feeDrag`

## M2 — Database, auth, API foundation
- [x] Drizzle schema per spec §5 + migrations; RLS-enabled-no-policies migration
  - Note: no DATABASE_URL → embedded PGlite (`.easyfi-data/`) for local demo mode.
- [x] PGlite test harness (fresh migrated DB per test file)
- [x] Repositories with user scoping (test: user A cannot read user B's portfolio)
- [x] `contracts` zod schemas + OpenAPI generation at `/api/v1/openapi.json`
  - Note: one endpoint table (`packages/contracts/src/endpoints.ts`) drives OpenAPI, routing and validation.
- [x] Auth middleware: Supabase JWT (Bearer) + SSR cookie; invite-code sign-up gate
  - Note: httpOnly `easyfi_at`/`easyfi_rt` cookies set by `/auth/sign-in`; no Supabase env → local demo auth (scrypt creds in `local_credentials`).
- [x] Error envelope + zod validation helper
- [x] Endpoints: `/me`, portfolios CRUD, holdings CRUD, CSV import
  - Note: framework-agnostic `handleApiRequest` in services; Next route is a one-line adapter.
- [x] Generated typed client package used by web
  - Note: `apps/web/src/lib/api/schema.d.ts` (openapi-typescript, freshness test); server components call the handler in-process via `serverApi()`.

## M3 — Data ingestion
- [x] `data-sources` interfaces + fakes: PriceSource, HoldingsSource, DividendSource, CpiSource, LLMProvider
- [x] Tiingo client (EOD, dividends, IEX last) with recorded fixtures
- [x] SEC EDGAR N-PORT client: ticker→series lookup, parse holdings XML, map CUSIP→ticker
  - Note: UIT funds (SPY, QQQ, DIA) don't file N-PORT → need seeded holdings.
- [x] BLS CPI client
- [x] Securities search + seed of popular ETFs
- [x] Nightly job (spec §9) + `job_runs` table + GitHub Actions cron workflow
  - Note: Tiingo budget: ≤45 tickers/run stalest-first; also evaluates alerts + emails via Resend.

## M4 — Web app: shell, home, portfolio
- [x] App shell: sidebar, dark/light theme, responsive, auth pages (sign in/up with invite)
- [x] Portfolios list + create/edit
- [x] Holdings page: table (Overview/Returns/Income/Look-through views), add side panel, CSV import, tags, filters, export CSV
- [x] Portfolio page: value chart, allocation donut + diversification score, Stack view (expand per-ETF contribution)
- [x] Home: total value, allocation, portfolios sorted by risk, exposure insights, movers
- [ ] Playwright e2e: invite sign-up → portfolio → VOO+QQQ → look-through visible

## M5 — Compare + Constellation
- [ ] `/compare` API + page (sector donuts, shared holdings, overlap %)
- [x] Constellation API + d3-force view with side panel

## M6 — Dividends
- [ ] `/dividends` API + page (KPI cards, income calendar, projection, yield leaders, holdings table)

## M7 — Inflation
- [ ] `/inflation` API + page (CPI snapshot, category drivers, purchasing-power calculator)

## M8 — AI Investment Explorer
- [x] OpenRouter `LLMProvider` + tool-calling loop over services; per-user daily limit
- [x] Explorer API (threads, streamed messages, structured blocks)
- [ ] Explorer page + Home ask bar + "Ask why" links from insights
- [x] Fake-LLM tests + `docs/explorer-evals.md` with 20 eval questions

## M9 — Extras
- [ ] What-if simulator page (add fund → sector shift, overlap)
- [x] Fee drag card on portfolio
- [ ] FI goal tracker (target number, progress, projection)
- [ ] Alerts (email via Supabase/Resend free): concentration threshold, upcoming dividend
- [ ] Shareable read-only snapshot link
- [ ] Help + What's new pages, feedback form (Supabase Storage screenshot)

## M10 — Deploy
- [x] Vercel project + env vars documented in `docs/DEPLOY.md`
- [x] Supabase project setup steps + migration command documented
- [ ] Smoke test on production URL

## Blocked
- M10 smoke test on production URL — needs the Vercel/Supabase projects and secrets (owner action; steps in `docs/DEPLOY.md` §4).
