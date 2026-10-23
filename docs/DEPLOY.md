# Deploying EasyFI (free tier)

EasyFI runs as one Next.js app on **Vercel Hobby** (pages + `/api/v1`) backed by **Supabase free**
(Postgres + Auth + Storage). A **GitHub Actions** cron runs the nightly ingestion. Nothing paid is
required.

Without any configuration the app runs in **local demo mode**: embedded PGlite in `.easyfi-data/`,
fixture market data, demo login `demo@easyfi.local` / `easyfi-demo`, invite code `DEMO-INVITE`, and
a rule-based Explorer (no LLM key needed).

## 1. Supabase project

1. Create a project at <https://supabase.com> (free tier). Region close to your Vercel region.
2. **Project Settings → API**: copy
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY` (server only — never expose it)
   - JWT secret (legacy HS256, if shown) → `SUPABASE_JWT_SECRET`. If your project uses the new
     asymmetric signing keys, leave it empty: the API verifies tokens against the project's JWKS.
3. **Authentication → Providers → Email**: enable email + password. Sign-up happens through
   `/api/v1/auth/sign-up` (admin API, invite-gated), so you can turn **off** "Allow new users to
   sign up" for the public client.
4. **Project Settings → Database → Connection string**:
   - *Transaction pooler* (port 6543) → `DATABASE_URL` for **Vercel** (serverless friendly; the
     app disables prepared statements automatically).
   - *Session pooler* (port 5432) → `DATABASE_URL` for **migrations and the nightly job**.
5. **Storage**: create a private bucket `feedback` (feedback screenshots).

### Migrations

Migrations live in `packages/db/drizzle` (schema + RLS deny-all on every table). Apply them from your
machine with the session pooler URL:

```bash
DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
  pnpm db:migrate
```

The API also applies pending migrations on cold start, and the nightly job runs them first, so a
forgotten migration fixes itself — but run it explicitly before deploying a schema change.

**Security:** every table has RLS enabled with no policies, so Supabase's Data API (anon /
authenticated roles) can read nothing. The app connects server-side as the database owner.

### Invites and admins

- `INVITE_CODES` (comma separated) are accepted at sign-up without limit — good for a first code.
- Codes created on **Settings → Invites** are stored in the `invites` table and are single-use by
  default. Only users listed in `ADMIN_USER_IDS` (Supabase auth user ids, comma separated) see the
  Invites section. Sign up once, copy your id from Supabase **Authentication → Users**, add it.

## 2. Vercel project

1. Import the GitHub repo in Vercel. **Root directory:** `apps/web`. Framework: Next.js.
   Install command: `pnpm install --frozen-lockfile` (Vercel detects pnpm from the lockfile).
2. Environment variables (Production + Preview):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Supabase **transaction pooler** URL (port 6543) |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | enables Supabase Auth (otherwise demo auth) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | server only |
| `SUPABASE_JWT_SECRET` | if HS256 | empty → JWKS verification |
| `INVITE_CODES` | yes | e.g. `FRIENDS-2026` |
| `ADMIN_USER_IDS` | recommended | your Supabase user id |
| `APP_URL` | recommended | `https://<project>.vercel.app` (OpenRouter referer, share links) |
| `OPENROUTER_API_KEY` | optional | Explorer uses the rule-based demo answers without it |
| `OPENROUTER_MODEL` | optional | default `meta-llama/llama-3.3-70b-instruct:free` |
| `EXPLORER_DAILY_LIMIT` | optional | questions per user per day (default 30) |
| `TIINGO_TOKEN`, `SEC_USER_AGENT`, `BLS_KEY` | job only | not needed by the web app |

3. Deploy. `outputFileTracingIncludes` in `apps/web/next.config.ts` ships the SQL migrations with the
   API function; PGlite / postgres-js are kept external.

> Never set `EASYFI_DEMO_CLOCK` in production. With `DATABASE_URL` set the clock is real time.

## 3. Nightly job (GitHub Actions)

`.github/workflows/nightly.yml` runs `pnpm job:nightly` at 02:00 UTC on weekdays (and on demand via
**Actions → Nightly ingestion → Run workflow**). Add repository secrets:

| Secret | Notes |
|---|---|
| `DATABASE_URL` | Supabase **session pooler** URL (port 5432) |
| `TIINGO_TOKEN` | <https://www.tiingo.com> free account (EOD prices + dividends) |
| `SEC_USER_AGENT` | `EasyFI you@example.com` — SEC requires a contact |
| `BLS_KEY` | optional; BLS works keyless with lower limits |
| `RESEND_API_KEY` | optional; alert emails (Resend free tier) |
| `ALERTS_FROM` | optional; e.g. `EasyFI <alerts@yourdomain.com>` |

What it does (idempotent; one ticker failing never fails the run):

1. Seeds the popular-fund list (`packages/services/src/popular-securities.ts`).
2. Prices + dividends for every held ticker and the seeded funds, stalest first, at most 45 tickers
   per run (Tiingo free = 50 requests/hour) — the rest catch up on following nights.
3. Fund holdings from SEC N-PORT when a stored book is older than 75 days. UIT funds (SPY, QQQ, DIA)
   don't file N-PORT: SPY uses the VOO book, QQQ the QQQM book (index equivalents in core).
4. CPI from BLS when a newer month may be out.
5. Prunes prices older than two years (keeps the database well under 500 MB).
6. Evaluates alert rules (concentration, upcoming dividends) and emails each user at most once
   a day when `RESEND_API_KEY` is set.
7. Writes a `job_runs` row — visible at `GET /api/v1/status` — which also keeps the free Supabase
   project from pausing.

Run it locally against the embedded DB (stop `pnpm dev` first — PGlite allows one process):

```bash
TIINGO_TOKEN=... SEC_USER_AGENT='EasyFI you@example.com' pnpm job:nightly
```

## 4. Smoke test on the production URL

```bash
BASE=https://<project>.vercel.app
curl -s $BASE/api/v1/status            # {"ok":true,"db":"postgres",...}
curl -s $BASE/api/v1/openapi.json | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/v1/me   # 401 without a session
```

Then in a browser: sign up with an invite code → create a portfolio → add VOO and QQQ → open the
portfolio (look-through shows NVDA via 2 ETFs once the nightly job has loaded holdings) → ask the
Explorer "Compare VOO and QQQ".

The same flow is automated locally by `pnpm --filter @easyfi/web e2e` (Playwright, demo mode).
