import { randomBytes } from 'node:crypto';
import type {
  Alert,
  AlertCheck,
  FeedbackBody,
  Goal,
  GoalBody,
  Invite,
  SharedSnapshot,
  ShareLink,
  Status,
} from '@easyfi/contracts';
import { addDays, dividendSummary, fiProgress, foldBy, UNRESOLVED_KEY } from '@easyfi/core';
import type { schema } from '@easyfi/db';
import type { Ctx } from './context';
import { badRequest, notFound, ServiceError } from './errors';
import { loadDividends } from './holdings';
import { analyse, analyseAll, hasValue, scoreOf } from './internal/analysis';
import { sectorLabel } from './internal/mappers';
import { loadMarket } from './internal/market';
import { loadPortfolios, tickersOf } from './portfolios';

type GoalRow = typeof schema.goals.$inferSelect;
type AlertRow = typeof schema.alerts.$inferSelect;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function inviteCode(): string {
  const raw = randomBytes(6)
    .toString('base64url')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, 'X');
  return `EFI-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

export interface StatusExtras {
  sources: Record<string, boolean>;
  driver: 'postgres' | 'pglite';
}

export function settingsService(ctx: Ctx) {
  const requireAdmin = (userId: string, isAdmin: boolean) => {
    if (!isAdmin && !ctx.config.adminUserIds.includes(userId))
      throw new ServiceError('forbidden', 'Only the owner can manage invites');
  };

  const toLink = (
    l: typeof schema.shareLinks.$inferSelect,
    names: Map<string, string>,
  ): ShareLink => ({
    token: l.token,
    portfolioId: l.portfolioId,
    portfolioName: names.get(l.portfolioId) ?? 'Portfolio',
    path: `/shared/${l.token}`,
    createdAt: l.createdAt.toISOString(),
    revokedAt: iso(l.revokedAt),
  });

  const toAlert = (a: AlertRow): Alert => ({
    id: a.id,
    kind: a.kind === 'dividend' ? 'dividend' : 'concentration',
    threshold: typeof a.threshold === 'number' ? a.threshold : a.kind === 'dividend' ? 7 : 0.1,
    enabled: a.enabled,
    lastFiredAt: iso(a.lastFiredAt),
  });

  async function trackedValue(userId: string): Promise<number | null> {
    const ps = await loadPortfolios(ctx, userId);
    if (!ps.length) return null;
    const market = await loadMarket(ctx.repos, tickersOf(ps));
    const all = analyseAll(ps, market);
    return hasValue(all) ? all.result.totalValue : null;
  }

  function toGoal(g: GoalRow, current: number | null): Goal {
    const input = {
      annualExpenses: g.annualExpenses ?? 40_000,
      withdrawalRate: g.withdrawalRate ?? 0.04,
      monthlyContribution: g.monthlyContribution ?? 0,
      growthRate: g.expectedGrowth ?? 0.07,
      inflationRate: g.inflationRate ?? 0.03,
    };
    const r = fiProgress({ currentValue: current ?? 0, ...input, maxYears: 60 });
    return {
      id: g.id,
      label: g.label,
      ...input,
      targetDate: g.targetDate,
      fiNumber: r.fiNumber,
      current,
      progress: current === null ? null : r.progress,
      yearsToFi: current === null ? null : r.yearsToFi,
      projection: r.series,
    };
  }

  const goalInput = (b: GoalBody) => ({
    label: b.label,
    annualExpenses: b.annualExpenses,
    withdrawalRate: b.withdrawalRate ?? 0.04,
    monthlyContribution: b.monthlyContribution ?? 0,
    expectedGrowth: b.growthRate ?? 0.07,
    inflationRate: b.inflationRate ?? 0.03,
    targetDate: b.targetDate ?? null,
    targetAmount: b.annualExpenses / (b.withdrawalRate ?? 0.04),
  });

  return {
    // ---- invites ----
    async listInvites(userId: string, isAdmin: boolean): Promise<{ invites: Invite[] }> {
      requireAdmin(userId, isAdmin);
      const rows = await ctx.repos.invites.list();
      return {
        invites: rows.map((i) => ({
          code: i.code,
          maxUses: i.maxUses,
          used: i.used,
          createdAt: i.createdAt.toISOString(),
        })),
      };
    },
    async createInvite(userId: string, isAdmin: boolean, maxUses = 1): Promise<Invite> {
      requireAdmin(userId, isAdmin);
      const i = await ctx.repos.invites.create({ code: inviteCode(), maxUses });
      return {
        code: i.code,
        maxUses: i.maxUses,
        used: i.used,
        createdAt: i.createdAt.toISOString(),
      };
    },

    // ---- share links ----
    async listShareLinks(userId: string): Promise<{ links: ShareLink[] }> {
      const [links, ps] = await Promise.all([
        ctx.repos.shareLinks.list(userId),
        ctx.repos.portfolios.list(userId),
      ]);
      const names = new Map(ps.map((p) => [p.id, p.name]));
      return { links: links.map((l) => toLink(l, names)) };
    },
    async createShareLink(userId: string, portfolioId: string): Promise<ShareLink> {
      const link = await ctx.repos.shareLinks.create(userId, portfolioId);
      if (!link) throw notFound('Portfolio');
      const p = await ctx.repos.portfolios.get(userId, portfolioId);
      return toLink(link, new Map([[portfolioId, p?.name ?? 'Portfolio']]));
    },
    async revokeShareLink(userId: string, token: string): Promise<{ ok: true }> {
      if (!(await ctx.repos.shareLinks.revoke(userId, token))) throw notFound('Share link');
      return { ok: true };
    },
    /** Public: weights only, never quantities or dollar values. */
    async sharedSnapshot(token: string): Promise<SharedSnapshot> {
      const target = await ctx.repos.shareLinks.resolve(token);
      if (!target) throw notFound('Share link');
      const [p] = await loadPortfolios(ctx, target.userId, target.portfolioId);
      const market = await loadMarket(ctx.repos, tickersOf([p!]));
      const a = analyse(p!, market);
      return {
        portfolioName: p!.name,
        diversificationScore: scoreOf(a),
        sectors: foldBy(a.result, 'sector')
          .filter((g) => g.key !== UNRESOLVED_KEY)
          .slice(0, 8)
          .map((g) => ({ label: sectorLabel(g.label), weight: g.weight })),
        topExposures: a.result.exposures
          .filter((e) => e.kind === 'company')
          .slice(0, 10)
          .map((e) => ({ ticker: e.ticker, name: e.name, weight: e.weight })),
        funds: a.result.funds.map((f) => ({ ticker: f.ticker, weight: f.weight })),
        asOf: a.result.asOf,
      };
    },

    // ---- alerts ----
    async listAlerts(userId: string): Promise<{ alerts: Alert[] }> {
      return { alerts: (await ctx.repos.alerts.list(userId)).map(toAlert) };
    },
    async upsertAlert(
      userId: string,
      body: { kind: Alert['kind']; threshold: number; enabled: boolean },
    ): Promise<Alert> {
      if (body.kind === 'concentration' && body.threshold >= 1)
        throw badRequest('Concentration threshold is a fraction (0.1 = 10%)');
      const existing = (await ctx.repos.alerts.list(userId)).find((a) => a.kind === body.kind);
      const row = existing
        ? await ctx.repos.alerts.update(userId, existing.id, {
            threshold: body.threshold,
            enabled: body.enabled,
          })
        : await ctx.repos.alerts.create(userId, {
            kind: body.kind,
            threshold: body.threshold,
            enabled: body.enabled,
          });
      return toAlert(row!);
    },
    /** Evaluates enabled rules; marks fired ones. Delivery (email) is the caller's job. */
    async checkAlerts(userId: string): Promise<AlertCheck> {
      const rules = (await ctx.repos.alerts.list(userId)).map(toAlert).filter((a) => a.enabled);
      if (!rules.length) return { triggered: [] };
      const ps = await loadPortfolios(ctx, userId);
      const market = await loadMarket(ctx.repos, tickersOf(ps));
      const combined = analyseAll(ps, market);
      const triggered: AlertCheck['triggered'] = [];
      for (const rule of rules) {
        if (rule.kind === 'concentration') {
          const over = combined.result.exposures.filter(
            (e) => e.kind === 'company' && e.weight >= rule.threshold,
          );
          for (const e of over.slice(0, 5)) {
            triggered.push({
              alertId: rule.id,
              kind: 'concentration',
              message: `${e.ticker} is ${(e.weight * 100).toFixed(1)}% of everything you own (alert at ${(rule.threshold * 100).toFixed(0)}%).`,
            });
          }
        } else {
          const today = ctx.today();
          const until = addDays(today, Math.round(rule.threshold));
          const holdings = ps.flatMap((p) => p.holdings);
          const s = dividendSummary({
            holdings,
            dividends: await loadDividends(ctx, tickersOf(ps)),
            prices: market.prices,
            asOf: today,
          });
          const soon = s.calendar
            .flatMap((m) => m.events)
            .filter(
              (e) =>
                e.status !== 'received' &&
                (e.payDate ?? e.exDate) > today &&
                (e.payDate ?? e.exDate) <= until,
            );
          for (const e of soon) {
            triggered.push({
              alertId: rule.id,
              kind: 'dividend',
              message: `${e.ticker} pays about $${e.total.toFixed(2)} on ${e.payDate ?? e.exDate}${e.status === 'projected' ? ' (estimated)' : ''}.`,
            });
          }
        }
        if (triggered.some((t) => t.alertId === rule.id))
          await ctx.repos.alerts.markFired(userId, rule.id, ctx.now());
      }
      return { triggered };
    },

    // ---- goals ----
    async listGoals(userId: string): Promise<{ goals: Goal[] }> {
      const [rows, current] = await Promise.all([
        ctx.repos.goals.list(userId),
        trackedValue(userId),
      ]);
      return { goals: rows.map((g) => toGoal(g, current)) };
    },
    async createGoal(userId: string, body: GoalBody): Promise<Goal> {
      const row = await ctx.repos.goals.create(userId, goalInput(body));
      return toGoal(row, await trackedValue(userId));
    },
    async updateGoal(userId: string, id: string, body: GoalBody): Promise<Goal> {
      const row = await ctx.repos.goals.update(userId, id, goalInput(body));
      if (!row) throw notFound('Goal');
      return toGoal(row, await trackedValue(userId));
    },
    async deleteGoal(userId: string, id: string): Promise<{ ok: true }> {
      if (!(await ctx.repos.goals.delete(userId, id))) throw notFound('Goal');
      return { ok: true };
    },

    // ---- feedback ----
    /** `storeScreenshot` uploads the decoded image and returns its storage path (Supabase Storage). */
    async sendFeedback(
      userId: string,
      body: FeedbackBody,
      storeScreenshot?: (bytes: Uint8Array, contentType: string) => Promise<string | null>,
    ): Promise<{ ok: true }> {
      let screenshotPath: string | null = null;
      if (body.screenshot) {
        const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(body.screenshot);
        if (!m) throw badRequest('Screenshot must be a PNG or JPEG data URL');
        const bytes = Buffer.from(m[2]!, 'base64');
        if (bytes.length > 2 * 1024 * 1024) throw badRequest('Screenshot is larger than 2 MB');
        screenshotPath = storeScreenshot ? await storeScreenshot(bytes, m[1]!) : null;
      }
      const message = body.page ? `[${body.page}] ${body.message}` : body.message;
      await ctx.repos.feedback.insert(userId, { message, screenshotPath });
      return { ok: true };
    },

    // ---- status ----
    async status(extras: StatusExtras): Promise<Status> {
      const job = await ctx.repos.jobs.latest();
      const [voo] = await ctx.repos.prices.latest(['VOO']);
      const errors = Array.isArray(job?.errors) ? job.errors.length : 0;
      return {
        ok: !job || job.status !== 'failed',
        db: extras.driver,
        lastJob: job
          ? {
              status: job.status,
              startedAt: job.startedAt.toISOString(),
              finishedAt: iso(job.finishedAt),
              counts: job.counts ?? {},
              errors,
            }
          : null,
        pricesAsOf: voo?.date ?? null,
        sources: extras.sources,
      };
    },
  };
}
