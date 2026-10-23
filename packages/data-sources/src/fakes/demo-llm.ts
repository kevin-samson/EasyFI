import type {
  AssistantMessage,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  LLMProvider,
  ToolCall,
} from '../types';

/**
 * Keyless "LLM" for demo mode: picks Explorer tools with simple rules, then answers with a
 * templated summary of the tool results. It never invents numbers — it only echoes tool output.
 */

export const DEMO_TOOL_NAMES = [
  'get_portfolio_lookthrough',
  'compare_funds',
  'what_if_add',
  'search_funds_holding',
  'get_dividends',
] as const;
export type DemoToolName = (typeof DEMO_TOOL_NAMES)[number];

const STOPWORDS = new Set(
  'I A AN OK IRA ETF US USA AND OR THE MY IF VS IS IT TO DO OF IN ON AT BE ME AI CPI FI ROTH YTD ESG NAV IPO FAQ TV PM AM EU UK CEO SEC BLS ALL ANY HOW WHY WHAT WHO NOT NO YES CAN'.split(
    ' ',
  ),
);

/** Uppercase ticker-looking tokens (e.g. VOO, BRK.B), in order, de-duplicated. */
export function extractTickers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b[A-Z]{1,5}(?:\.[A-Z])?\b/g)) {
    const t = m[0];
    if (!STOPWORDS.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

const TITLES: Record<string, string> = {
  get_portfolio_lookthrough: 'Portfolio look-through',
  compare_funds: 'Fund comparison',
  what_if_add: 'What-if',
  search_funds_holding: 'Funds holding it',
  get_dividends: 'Dividends',
};

const PERCENT_KEY = /weight|pct|percent|share|overlap|yield|change|return|ratio|drift/i;
const LABEL_KEYS = ['ticker', 'symbol', 'name', 'sector', 'fund', 'fundTicker', 'label', 'bucket'];

function fmt(key: string, v: unknown): string {
  if (typeof v === 'number') {
    if (PERCENT_KEY.test(key) && Math.abs(v) <= 1.5) return `${(v * 100).toFixed(1)}%`;
    return String(v);
  }
  if (v === null || v === undefined) return 'n/a';
  return String(v);
}

function isScalar(v: unknown): v is string | number | boolean | null {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v);
}

function summarizeItem(item: unknown): string {
  if (isScalar(item)) return fmt('', item);
  if (typeof item !== 'object') return '';
  const o = item as Record<string, unknown>;
  const labelKey = LABEL_KEYS.find((k) => typeof o[k] === 'string');
  const label = labelKey ? String(o[labelKey]) : '';
  const numKey =
    Object.keys(o).find((k) => typeof o[k] === 'number' && PERCENT_KEY.test(k)) ??
    Object.keys(o).find((k) => typeof o[k] === 'number');
  const num = numKey ? fmt(numKey, o[numKey]) : '';
  return label && num ? `${label} (${num})` : label || num;
}

function findAsOf(v: unknown, acc: Set<string>, depth = 0): Set<string> {
  if (depth > 4 || !v || typeof v !== 'object') return acc;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (/^as_?of(date)?$/i.test(k) && typeof val === 'string') acc.add(val);
    else findAsOf(val, acc, depth + 1);
  }
  return acc;
}

function summarizeResult(value: unknown): string[] {
  const obj: Record<string, unknown> =
    Array.isArray(value) || isScalar(value)
      ? { result: value }
      : (value as Record<string, unknown>);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj).slice(0, 8)) {
    if (/^as_?of(date)?$/i.test(k)) continue;
    if (isScalar(v)) lines.push(`${k}: ${fmt(k, v)}`);
    else if (Array.isArray(v)) {
      const items = v.slice(0, 5).map(summarizeItem).filter(Boolean);
      lines.push(`${k}: ${items.length ? items.join(', ') : 'none'}${v.length > 5 ? ', …' : ''}`);
    } else if (v && typeof v === 'object') {
      const parts = Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => isScalar(x))
        .slice(0, 6)
        .map(([kk, x]) => `${kk} ${fmt(kk, x)}`);
      if (parts.length) lines.push(`${k}: ${parts.join(', ')}`);
    }
  }
  return lines;
}

export class RuleBasedDemoLLM implements LLMProvider {
  private seq = 0;

  async chat(req: ChatRequest): Promise<ChatResponse> {
    let lastUser = -1;
    req.messages.forEach((m, i) => {
      if (m.role === 'user') lastUser = i;
    });
    const after = req.messages.slice(lastUser + 1);
    const toolMsgs = after.filter(
      (m): m is Extract<ChatMessage, { role: 'tool' }> => m.role === 'tool',
    );
    if (toolMsgs.length) return { message: this.answer(after, toolMsgs) };

    const question = lastUser >= 0 ? (req.messages[lastUser]!.content as string) : '';
    const offered = req.tools ? new Set(req.tools.map((t) => t.name)) : null;
    const planned = this.plan(question).filter((c) => !offered || offered.has(c.name));
    if (!planned.length) {
      return {
        message: {
          role: 'assistant',
          content:
            "I'm the EasyFI demo assistant (rule-based, no AI model connected). Try asking: " +
            '"How much tech exposure do I have?", "Compare VOO and SCHD", ' +
            '"Should I add SCHD if I own VOO and QQQ?", "Which ETFs are heavy in NVDA?" ' +
            'or "What dividends am I getting?"',
        },
      };
    }
    const toolCalls: ToolCall[] = planned.map((c) => ({
      id: `demo_call_${++this.seq}`,
      name: c.name,
      arguments: JSON.stringify(c.args),
    }));
    return { message: { role: 'assistant', content: null, toolCalls } };
  }

  private plan(question: string): { name: DemoToolName; args: Record<string, unknown> }[] {
    const q = question.toLowerCase();
    const tickers = extractTickers(question);
    const first = tickers[0];

    if (first && /\b(should i (add|buy)|what if i (add|buy)|add(ing)?|buy(ing)?)\b/.test(q)) {
      const out: { name: DemoToolName; args: Record<string, unknown> }[] = [
        { name: 'what_if_add', args: { ticker: first } },
      ];
      if (tickers.length > 1) out.push({ name: 'compare_funds', args: { tickers } });
      return out;
    }
    if (
      tickers.length >= 2 &&
      /\b(compare|vs\.?|versus|difference|overlap between|better)\b/.test(q)
    ) {
      return [{ name: 'compare_funds', args: { tickers } }];
    }
    if (
      first &&
      /\b(etfs?|funds?)\b/.test(q) &&
      /(heavy|hold|own|contain|exposure|most|weight)/.test(q)
    ) {
      return [{ name: 'search_funds_holding', args: { ticker: first } }];
    }
    if (/(dividend|income|yield|payout|distribution)/.test(q)) {
      return [{ name: 'get_dividends', args: {} }];
    }
    if (
      /(exposure|tech|sector|look-?through|portfolio|allocation|concentrat|diversif|overlap|holding|own)/.test(
        q,
      )
    ) {
      return [{ name: 'get_portfolio_lookthrough', args: {} }];
    }
    return [];
  }

  private answer(
    after: ChatMessage[],
    toolMsgs: Extract<ChatMessage, { role: 'tool' }>[],
  ): AssistantMessage {
    const names = new Map<string, string>();
    for (const m of after) {
      if (m.role === 'assistant') for (const tc of m.toolCalls ?? []) names.set(tc.id, tc.name);
    }
    const asOf = new Set<string>();
    const sections: string[] = [];
    for (const t of toolMsgs) {
      const name = names.get(t.tool_call_id) ?? t.name ?? 'tool';
      let lines: string[];
      try {
        const parsed = JSON.parse(t.content) as unknown;
        findAsOf(parsed, asOf);
        // Tools may supply a ready-made sentence built from their own numbers; prefer it.
        const summary =
          parsed && typeof parsed === 'object' && 'summary' in parsed
            ? (parsed as { summary: unknown }).summary
            : null;
        if (typeof summary === 'string' && summary) {
          sections.push(summary);
          continue;
        }
        lines = summarizeResult(parsed);
      } catch {
        lines = [`${name} returned no usable data.`];
      }
      sections.push(`${TITLES[name] ?? name} (${name}):\n${lines.map((l) => `- ${l}`).join('\n')}`);
    }
    const footer = [
      asOf.size ? `Data as of ${[...asOf].sort().join(', ')}.` : '',
      'Demo mode (rule-based summary). Educational only — not investment advice.',
    ]
      .filter(Boolean)
      .join(' ');
    return {
      role: 'assistant',
      content: `${sections.join('\n\n')}\n\n${footer}`,
    };
  }
}
