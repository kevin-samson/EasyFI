import { describe, expect, it } from 'vitest';
import { extractTickers, RuleBasedDemoLLM } from './demo-llm';
import type { ChatMessage, ToolDef } from '../types';

const llm = new RuleBasedDemoLLM();
const ask = async (q: string, tools?: ToolDef[]) => {
  const res = await llm.chat({
    messages: [
      { role: 'system', content: 'You are EasyFI.' },
      { role: 'user', content: q },
    ],
    ...(tools ? { tools } : {}),
  });
  return res.message;
};
const calls = (m: Awaited<ReturnType<typeof ask>>) =>
  (m.toolCalls ?? []).map((t) => ({ name: t.name, args: JSON.parse(t.arguments) }));

describe('extractTickers', () => {
  it('finds uppercase tickers and skips common words', () => {
    expect(extractTickers('Should I add SCHD if I own VOO and QQQ? Is it OK for my IRA')).toEqual([
      'SCHD',
      'VOO',
      'QQQ',
    ]);
    expect(extractTickers('compare brk.b and VTI')).toEqual(['VTI']);
    expect(extractTickers('What about BRK.B?')).toEqual(['BRK.B']);
  });
});

describe('RuleBasedDemoLLM tool selection', () => {
  it('what-if question → what_if_add + compare_funds', async () => {
    expect(calls(await ask('Should I add SCHD if I own VOO and QQQ?'))).toEqual([
      { name: 'what_if_add', args: { ticker: 'SCHD' } },
      { name: 'compare_funds', args: { tickers: ['SCHD', 'VOO', 'QQQ'] } },
    ]);
  });

  it('compare → compare_funds', async () => {
    expect(calls(await ask('Compare VTI and VOO'))).toEqual([
      { name: 'compare_funds', args: { tickers: ['VTI', 'VOO'] } },
    ]);
    expect(calls(await ask('VTI vs SCHD?'))[0]?.name).toBe('compare_funds');
  });

  it('ETFs heavy in a stock → search_funds_holding', async () => {
    expect(calls(await ask('Which ETFs are heavy in NVDA?'))).toEqual([
      { name: 'search_funds_holding', args: { ticker: 'NVDA' } },
    ]);
  });

  it('dividends → get_dividends', async () => {
    expect(calls(await ask('When are my next dividends?'))).toEqual([
      { name: 'get_dividends', args: {} },
    ]);
  });

  it('exposure/tech → get_portfolio_lookthrough', async () => {
    expect(calls(await ask('How much tech exposure do I really have?'))).toEqual([
      { name: 'get_portfolio_lookthrough', args: {} },
    ]);
  });

  it('unknown question → helpful text, no tools', async () => {
    const m = await ask('hello there');
    expect(m.toolCalls).toBeUndefined();
    expect(m.content).toMatch(/demo/i);
  });

  it('only calls tools that were offered when a tools list is given', async () => {
    const tools: ToolDef[] = [
      { name: 'compare_funds', description: '', parameters: { type: 'object' } },
    ];
    expect(calls(await ask('Should I add SCHD if I own VOO?', tools)).map((c) => c.name)).toEqual([
      'compare_funds',
    ]);
  });
});

describe('RuleBasedDemoLLM answers from tool results', () => {
  it('summarizes tool JSON with as-of date and disclaimer, without tool calls', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'How much tech exposure do I have?' },
      {
        role: 'assistant',
        content: null,
        toolCalls: [{ id: 'demo_1', name: 'get_portfolio_lookthrough', arguments: '{}' }],
      },
      {
        role: 'tool',
        tool_call_id: 'demo_1',
        content: JSON.stringify({
          asOf: '2026-06-30',
          sectors: [
            { sector: 'Technology', weight: 0.412 },
            { sector: 'Health Care', weight: 0.11 },
          ],
          topHoldings: [{ ticker: 'NVDA', weight: 0.08 }],
        }),
      },
    ];
    const res = await llm.chat({ messages });
    expect(res.message.toolCalls).toBeUndefined();
    const text = res.message.content!;
    expect(text).toContain('Technology');
    expect(text).toContain('41.2%');
    expect(text).toContain('NVDA');
    expect(text).toContain('2026-06-30');
    expect(text).toMatch(/not investment advice/i);
  });

  it('handles non-JSON / error tool results gracefully', async () => {
    const res = await llm.chat({
      messages: [
        { role: 'user', content: 'dividends?' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [{ id: 'd', name: 'get_dividends', arguments: '{}' }],
        },
        { role: 'tool', tool_call_id: 'd', content: 'boom' },
      ],
    });
    expect(res.message.content).toContain('get_dividends');
  });
});

describe('RuleBasedDemoLLM tool summaries', () => {
  it('uses a tool-provided summary sentence instead of dumping fields', async () => {
    const llm = new RuleBasedDemoLLM();
    const res = await llm.chat({
      messages: [
        { role: 'user', content: 'Compare VOO and QQQ' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [{ id: 'c1', name: 'compare_funds', arguments: '{}' }],
        },
        {
          role: 'tool',
          tool_call_id: 'c1',
          content: JSON.stringify({
            summary: 'VOO and QQQ overlap 41% by weight.',
            overlapByWeight: 0.41,
            asOf: '2026-06-30',
          }),
        },
      ],
    });
    expect(res.message.content).toMatch(/^VOO and QQQ overlap 41% by weight\./);
    expect(res.message.content).toContain('Data as of 2026-06-30');
    expect(res.message.content).not.toContain('overlapByWeight');
  });
});
