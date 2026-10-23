import type {
  ChatBlock,
  ChatMessage,
  ExplorerStreamEvent,
  ExplorerThread,
  ExplorerThreadList,
} from '@easyfi/contracts';
import { ChatBlock as ChatBlockSchema } from '@easyfi/contracts';
import { normalizeTicker } from '@easyfi/core';
import {
  RuleBasedDemoLLM,
  type ChatMessage as LlmMessage,
  type LLMProvider,
  type ToolDef,
} from '@easyfi/data-sources';
import type { schema } from '@easyfi/db';
import type { compareService } from './compare';
import type { Ctx } from './context';
import { badRequest, notFound, ServiceError } from './errors';
import type { incomeService } from './income';
import type { PortfolioService } from './portfolios';
import type { whatIfService } from './whatif';

type DbMessage = typeof schema.explorerMessages.$inferSelect;

export const EXPLORER_SYSTEM_PROMPT = `You are the EasyFI Investment Explorer. You help the user understand what their portfolios and funds actually own.
Rules:
- Educational only. Never give personalised financial advice or tell the user to buy or sell; describe trade-offs instead.
- Only state numbers that appear in tool results. Never invent or estimate holdings, weights, prices or yields.
- Cite the as-of date of the data you use (e.g. "as of 2026-06-30 holdings").
- Weights in tool results are fractions (0.091 = 9.1%). Money is USD.
- Keep answers short: 2–5 sentences. Tables are rendered separately from tool results, so do not repeat whole tables.
- If a tool returns an error or no data, say so plainly.`;

export const EXPLORER_TOOLS: ToolDef[] = [
  {
    name: 'get_portfolio_lookthrough',
    description:
      "Look through the user's funds to their real company and sector exposure. Use for questions about exposure, concentration, diversification or what they own.",
    parameters: {
      type: 'object',
      properties: {
        portfolio: { type: 'string', description: 'Portfolio name or id; omit for all portfolios' },
      },
    },
  },
  {
    name: 'compare_funds',
    description: 'Compare two funds (or portfolios): overlap by weight and shared holdings.',
    parameters: {
      type: 'object',
      properties: {
        tickers: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
      },
      required: ['tickers'],
    },
  },
  {
    name: 'what_if_add',
    description:
      "Simulate adding a fund or stock to the user's portfolios: sector shift, new overlap, diversification change.",
    parameters: {
      type: 'object',
      properties: {
        ticker: { type: 'string' },
        amount: { type: 'number', description: 'USD to add; defaults to 10% of the current total' },
      },
      required: ['ticker'],
    },
  },
  {
    name: 'search_funds_holding',
    description: 'Find which funds (with stored holdings) contain a given company, by weight.',
    parameters: {
      type: 'object',
      properties: { ticker: { type: 'string' } },
      required: ['ticker'],
    },
  },
  {
    name: 'get_dividends',
    description: "The user's dividend income: trailing 12 months, yield, next 30 days, top payers.",
    parameters: { type: 'object', properties: { portfolio: { type: 'string' } } },
  },
];

export const EXPLORER_SUGGESTIONS = [
  'How much tech exposure do I really have?',
  'Would QQQ overlap with my portfolio?',
  'Which ETFs are heavy in NVDA?',
  'What dividends am I getting?',
];

const MAX_TOOL_ROUNDS = 4;
const HISTORY_MESSAGES = 10;

interface ToolOutcome {
  result: unknown;
  block?: ChatBlock;
}

interface Deps {
  portfolios: PortfolioService;
  compare: ReturnType<typeof compareService>;
  whatIf: ReturnType<typeof whatIfService>;
  income: ReturnType<typeof incomeService>;
}

export function explorerService(ctx: Ctx, deps: Deps) {
  const llm: LLMProvider = ctx.llm ?? new RuleBasedDemoLLM();

  const toMessage = (m: DbMessage): ChatMessage => {
    const parsed = ChatBlockSchema.array().safeParse(m.blocks ?? []);
    return {
      id: m.id,
      role: m.role === 'user' ? 'user' : 'assistant',
      text: m.content,
      blocks: parsed.success ? parsed.data : [],
      createdAt: m.createdAt.toISOString(),
    };
  };

  async function resolvePortfolio(userId: string, ref: unknown): Promise<string> {
    if (typeof ref !== 'string' || !ref.trim() || /^all$/i.test(ref)) return 'all';
    const ps = await ctx.repos.portfolios.list(userId);
    const q = ref.trim().toLowerCase();
    const hit = ps.find((p) => p.id === ref) ?? ps.find((p) => p.name.toLowerCase().includes(q));
    return hit?.id ?? 'all';
  }

  async function runTool(
    userId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolOutcome> {
    switch (name) {
      case 'get_portfolio_lookthrough': {
        const id = await resolvePortfolio(userId, args.portfolio);
        const lt = await deps.portfolios.lookThrough(userId, id, 'company');
        const sectors = (await deps.portfolios.lookThrough(userId, id, 'sector')).rows.slice(0, 6);
        const top = lt.rows.filter((r) => r.ticker).slice(0, 8);
        const fundCols = lt.sourceOrder.slice(0, 4);
        return {
          result: {
            scope: id === 'all' ? 'all portfolios' : id,
            totalValue: Math.round(lt.totalValue),
            unresolvedWeight: lt.unresolved.weight,
            sectors: sectors.map((s) => ({ sector: s.name, weight: s.weight })),
            topExposures: top.map((r) => ({
              ticker: r.ticker,
              name: r.name,
              weight: r.weight,
              via: r.sources.map((s) => s.sourceTicker),
            })),
            asOf: lt.holdingsAsOf ?? lt.asOf,
          },
          block: {
            type: 'table',
            title: 'Top look-through exposures',
            subtitle: `share of ${id === 'all' ? 'everything you own' : 'the portfolio'}, by source`,
            asOf: lt.holdingsAsOf ?? lt.asOf,
            columns: fundCols.map((t) => ({ key: t, label: t === 'DIRECT' ? 'Direct' : t })),
            rows: top.map((r) => ({
              ticker: r.ticker!,
              name: r.name,
              values: Object.fromEntries(
                fundCols.map((t) => [
                  t,
                  r.sources.find((s) => s.sourceTicker === t)?.contribution ?? null,
                ]),
              ),
              total: r.weight,
            })),
          },
        };
      }
      case 'compare_funds': {
        const tickers = Array.isArray(args.tickers) ? args.tickers.map(String) : [];
        if (tickers.length < 2) throw badRequest('compare_funds needs two tickers');
        const [a, b] = [normalizeTicker(tickers[0]!), normalizeTicker(tickers[1]!)];
        const c = await deps.compare.compare(userId, a, b);
        const shared = c.shared.slice(0, 8);
        return {
          result: {
            a: c.a.ticker,
            b: c.b.ticker,
            overlapByWeight: c.overlapByWeight,
            sharedCount: c.sharedCount,
            holdingsCountA: c.a.holdingsCount,
            holdingsCountB: c.b.holdingsCount,
            topShared: shared.map((s) => ({
              ticker: s.ticker,
              weightA: s.weightA,
              weightB: s.weightB,
            })),
            asOf: c.a.asOf,
          },
          block: {
            type: 'table',
            title: `${c.a.ticker} vs ${c.b.ticker}: ${(c.overlapByWeight * 100).toFixed(0)}% overlap by weight`,
            subtitle: `${c.sharedCount} shared holdings`,
            asOf: c.a.asOf,
            columns: [
              { key: 'a', label: c.a.ticker },
              { key: 'b', label: c.b.ticker },
            ],
            rows: shared.map((s) => ({
              ticker: s.ticker,
              name: s.name,
              values: { a: s.weightA, b: s.weightB },
              total:
                s.weightA !== null && s.weightB !== null ? Math.min(s.weightA, s.weightB) : null,
            })),
          },
        };
      }
      case 'what_if_add': {
        const ticker = normalizeTicker(String(args.ticker ?? ''));
        if (!ticker) throw badRequest('what_if_add needs a ticker');
        let amount = typeof args.amount === 'number' && args.amount > 0 ? args.amount : 0;
        if (!amount) {
          const { combined } = await deps.portfolios.analyseAllFor(userId);
          amount = Math.max(1000, Math.round(combined.result.totalValue * 0.1));
        }
        const r = await deps.whatIf.run(userId, { ticker, amount, portfolio: 'all' });
        const shifts = r.sectorShifts.slice(0, 6);
        return {
          result: {
            ticker,
            amount,
            scoreBefore: r.before.score,
            scoreAfter: r.after.score,
            sectorShifts: shifts.map((s) => ({
              sector: s.sector,
              before: s.before,
              after: s.after,
            })),
            overlapWithHeld: r.overlaps.map((o) => ({ fund: o.fund, overlap: o.overlapByWeight })),
            asOf: r.asOf,
          },
          block: {
            type: 'sector_shift',
            title: `Adding $${amount.toLocaleString('en-US')} of ${ticker}`,
            subtitle: `diversification ${r.before.score} → ${r.after.score}`,
            asOf: r.asOf,
            rows: shifts.map((s) => ({ sector: s.sector, before: s.before, after: s.after })),
          },
        };
      }
      case 'search_funds_holding': {
        const ticker = normalizeTicker(String(args.ticker ?? ''));
        const funds = (await ctx.repos.fundHoldings.fundsHolding(ticker)).slice(0, 10);
        const names = new Map(
          (await ctx.repos.securities.getMany(funds.map((f) => f.fundTicker))).map((s) => [
            s.ticker,
            s.name,
          ]),
        );
        return {
          result: {
            ticker,
            funds: funds.map((f) => ({ fund: f.fundTicker, weight: f.weight })),
            asOf: funds[0]?.asOf ?? null,
          },
          block: {
            type: 'table',
            title: `Funds holding ${ticker}`,
            subtitle: `${funds.length} funds with stored holdings`,
            asOf: funds[0]?.asOf ?? null,
            columns: [{ key: 'w', label: `${ticker} weight` }],
            rows: funds.map((f) => ({
              ticker: f.fundTicker,
              name: names.get(f.fundTicker) ?? f.fundTicker,
              values: { w: f.weight },
              total: null,
            })),
          },
        };
      }
      case 'get_dividends': {
        const id = await resolvePortfolio(userId, args.portfolio);
        const d = await deps.income.dividends(userId, id);
        const top = d.holdings.slice(0, 6);
        return {
          result: {
            trailing12m: d.kpis.trailing12m,
            portfolioYield: d.kpis.portfolioYield,
            next30Days: d.kpis.next30Days,
            projected12m: d.kpis.projected12m,
            topPayers: top.map((h) => ({
              ticker: h.ticker,
              annualIncome: h.annualIncome,
              yield: h.yield,
            })),
            asOf: d.kpis.asOf,
          },
          block: {
            type: 'table',
            title: 'Top income sources',
            subtitle: 'trailing yield and share of income',
            asOf: d.kpis.asOf,
            columns: [
              { key: 'yield', label: 'Yield' },
              { key: 'share', label: 'Share of income' },
            ],
            rows: top.map((h) => ({
              ticker: h.ticker,
              name: h.name,
              values: { yield: h.yield, share: h.shareOfIncome },
              total: null,
            })),
          },
        };
      }
      default:
        throw badRequest(`Unknown tool ${name}`);
    }
  }

  async function threadOf(userId: string, id: string): Promise<ExplorerThread> {
    const t = await ctx.repos.explorer.getThread(userId, id);
    if (!t) throw notFound('Thread');
    return {
      id: t.id,
      title: t.title,
      createdAt: t.createdAt.toISOString(),
      messages: t.messages.filter((m) => m.role !== 'system').map(toMessage),
    };
  }

  return {
    async list(userId: string): Promise<ExplorerThreadList> {
      const threads = await ctx.repos.explorer.listThreads(userId);
      return {
        threads: threads.map((t) => ({
          id: t.id,
          title: t.title,
          createdAt: t.createdAt.toISOString(),
        })),
        suggestions: EXPLORER_SUGGESTIONS,
        usage: {
          usedToday: await ctx.repos.explorer.getUsage(userId, ctx.today()),
          dailyLimit: ctx.config.explorerDailyLimit,
        },
      };
    },

    async create(userId: string, title?: string): Promise<ExplorerThread> {
      await ctx.repos.profiles.upsert(userId);
      const t = await ctx.repos.explorer.createThread(userId, title ? { title } : {});
      return threadOf(userId, t.id);
    },

    get: threadOf,

    async remove(userId: string, id: string): Promise<{ ok: true }> {
      if (!(await ctx.repos.explorer.deleteThread(userId, id))) throw notFound('Thread');
      return { ok: true };
    },

    /** Runs the tool loop, persisting both messages. Emits tool / delta / done events. */
    async ask(
      userId: string,
      threadId: string,
      text: string,
      emit: (e: ExplorerStreamEvent) => void = () => {},
    ): Promise<ChatMessage> {
      const thread = await ctx.repos.explorer.getThread(userId, threadId);
      if (!thread) throw notFound('Thread');
      const used = await ctx.repos.explorer.incrementUsage(userId, ctx.today());
      if (used > ctx.config.explorerDailyLimit) {
        throw new ServiceError(
          'rate_limited',
          `Daily limit of ${ctx.config.explorerDailyLimit} questions reached — try again tomorrow`,
        );
      }
      await ctx.repos.explorer.appendMessage(userId, threadId, { role: 'user', content: text });
      if (thread.messages.length === 0 && thread.title === 'New chat') {
        await ctx.repos.explorer.renameThread(
          userId,
          threadId,
          text.length > 60 ? `${text.slice(0, 57)}…` : text,
        );
      }

      const history: LlmMessage[] = thread.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-HISTORY_MESSAGES)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      const messages: LlmMessage[] = [
        { role: 'system', content: EXPLORER_SYSTEM_PROMPT },
        ...history,
        { role: 'user', content: text },
      ];
      const blocks: ChatBlock[] = [];
      let answer = '';
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const tools = round < MAX_TOOL_ROUNDS ? EXPLORER_TOOLS : [];
        let res;
        try {
          res = await llm.chat({ messages, tools, temperature: 0.2 });
        } catch (e) {
          throw new ServiceError(
            'unavailable',
            `The AI model is unavailable: ${(e as Error).message}`,
          );
        }
        const calls = res.message.toolCalls ?? [];
        if (!calls.length) {
          answer = res.message.content ?? '';
          break;
        }
        messages.push({ role: 'assistant', content: res.message.content, toolCalls: calls });
        for (const call of calls) {
          emit({ type: 'tool', name: call.name });
          let content: string;
          try {
            const args = call.arguments
              ? (JSON.parse(call.arguments) as Record<string, unknown>)
              : {};
            const out = await runTool(userId, call.name, args);
            if (out.block) blocks.push(out.block);
            content = JSON.stringify(out.result);
          } catch (e) {
            content = JSON.stringify({ error: (e as Error).message });
          }
          messages.push({ role: 'tool', tool_call_id: call.id, name: call.name, content });
        }
      }
      if (!answer) answer = 'I could not finish that answer. Try rephrasing the question.';
      for (const chunk of answer.match(/.{1,48}(\s|$)|.{1,48}/g) ?? [answer])
        emit({ type: 'delta', text: chunk });

      const saved = await ctx.repos.explorer.appendMessage(userId, threadId, {
        role: 'assistant',
        content: answer,
        blocks,
      });
      const message = toMessage(saved!);
      emit({ type: 'done', message });
      return message;
    },
  };
}
