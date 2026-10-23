'use client';

import { AlertTriangle, History, Plus, SendHorizontal, Sparkle, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LogoMark } from '@/components/shell/Logo';
import { Button } from '@/components/ui/Button';
import { api, ApiError, unwrap } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { ChatBlockView } from './blocks';
import { streamAnswer } from './stream';
import { ThreadHistory, UsageMeter } from './ThreadHistory';
import type {
  ApiChatMessage,
  AssistantMessage,
  ChatMessage,
  ExplorerThread,
  ExplorerUsage,
  ThreadSummary,
} from './types';

export type ExplorerChatProps = {
  threads: ThreadSummary[];
  suggestions: string[];
  usage: ExplorerUsage;
  /** Thread reopened from ?t=<id>, if any. */
  initialThread: ExplorerThread | null;
  className?: string;
};

const TOOL_LABELS: Record<string, string> = {
  get_portfolio_lookthrough: 'Looking through your funds…',
  compare_funds: 'Comparing fund holdings…',
  what_if_add: 'Simulating the addition…',
  search_funds_holding: 'Searching fund holdings…',
  get_dividends: 'Checking your dividend income…',
};

export const EXPLORER_DISCLAIMER =
  'Educational, not financial advice; numbers come from your data as of the dates shown.';

let seq = 0;
const localId = (p: string) => `${p}-${++seq}`;

const fromApi = (m: ApiChatMessage): ChatMessage =>
  m.role === 'user'
    ? { id: m.id, role: 'user', text: m.text }
    : { id: m.id, role: 'assistant', text: m.text, blocks: m.blocks };

/** Keep the URL in sync without a server round-trip (Next syncs useSearchParams). */
function setUrl(threadId: string | null) {
  window.history.replaceState(null, '', threadId ? `/explorer?t=${threadId}` : '/explorer');
}

/** Investment Explorer: streamed answers with structured blocks, thread history, usage. */
export function ExplorerChat({
  threads: initialThreads,
  suggestions,
  usage: initialUsage,
  initialThread,
  className,
}: ExplorerChatProps) {
  const [threads, setThreads] = useState(initialThreads);
  const [usage, setUsage] = useState(initialUsage);
  const [activeId, setActiveId] = useState<string | null>(initialThread?.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => initialThread?.messages.map(fromApi) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const lastRef = useRef<HTMLLIElement>(null);
  const busyRef = useRef(false);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  const limitReached = usage.usedToday >= usage.dailyLimit;

  const send = useCallback(async (text: string) => {
    const patchAssistant = (id: string, patch: (m: AssistantMessage) => AssistantMessage) =>
      setMessages((ms) => ms.map((m) => (m.id === id && m.role === 'assistant' ? patch(m) : m)));
    const t = text.trim();
    if (!t || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    setDraft('');
    const pendingId = localId('pending');
    setMessages((m) => [
      ...m,
      { id: localId('user'), role: 'user', text: t },
      { id: pendingId, role: 'assistant', text: '', blocks: [], pending: true },
    ]);
    requestAnimationFrame(() =>
      lastRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );

    try {
      let threadId = activeRef.current;
      if (!threadId) {
        const created = unwrap(await api.POST('/explorer/threads', { body: {} }));
        threadId = created.id;
        activeRef.current = threadId;
        setActiveId(threadId);
        setThreads((ts) => [
          {
            id: created.id,
            title: t.length > 60 ? `${t.slice(0, 57)}…` : t,
            createdAt: created.createdAt,
          },
          ...ts,
        ]);
      }
      setUrl(threadId); // also drops ?q= so a refresh doesn't ask again
      setUsage((u) => ({ ...u, usedToday: u.usedToday + 1 }));
      await streamAnswer(threadId, t, (e) => {
        switch (e.type) {
          case 'tool':
            patchAssistant(pendingId, (m) => ({ ...m, tool: e.name }));
            break;
          case 'delta':
            patchAssistant(pendingId, (m) => ({ ...m, tool: undefined, text: m.text + e.text }));
            break;
          case 'done':
            setMessages((ms) => ms.map((m) => (m.id === pendingId ? fromApi(e.message) : m)));
            break;
          case 'error':
            patchAssistant(pendingId, (m) => ({
              ...m,
              pending: false,
              tool: undefined,
              error: { code: e.code, message: e.message },
            }));
            if (e.code === 'rate_limited')
              setUsage((u) => ({ ...u, usedToday: Math.max(u.usedToday, u.dailyLimit) }));
            break;
        }
      });
    } catch (err) {
      patchAssistant(pendingId, (m) => ({
        ...m,
        pending: false,
        error: {
          code: err instanceof ApiError ? err.code : 'internal',
          message: err instanceof Error ? err.message : 'Something went wrong',
        },
      }));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  // Deep link: /explorer?q=… sends the question once (into the active thread, or a new one).
  const searchParams = useSearchParams();
  const q = searchParams.get('q')?.trim() || null;
  const handledQ = useRef<string | null>(null);
  useEffect(() => {
    if (!q) {
      handledQ.current = null;
      return;
    }
    if (handledQ.current === q) return;
    handledQ.current = q;
    void send(q);
  }, [q, send]);

  const selectThread = async (id: string) => {
    setHistoryOpen(false);
    if (busyRef.current || id === activeRef.current) return;
    setLoadingThread(true);
    setNotice(null);
    try {
      const t = unwrap(await api.GET('/explorer/threads/{id}', { params: { path: { id } } }));
      setActiveId(t.id);
      setMessages(t.messages.map(fromApi));
      setUrl(t.id);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not open that chat');
      if (err instanceof ApiError && err.status === 404)
        setThreads((ts) => ts.filter((x) => x.id !== id));
    } finally {
      setLoadingThread(false);
    }
  };

  const newChat = () => {
    setHistoryOpen(false);
    if (busyRef.current) return;
    setActiveId(null);
    setMessages([]);
    setNotice(null);
    setUrl(null);
  };

  const deleteThread = async (id: string) => {
    if (busyRef.current) return;
    setDeletingId(id);
    setNotice(null);
    try {
      unwrap(await api.DELETE('/explorer/threads/{id}', { params: { path: { id } } }));
      setThreads((ts) => ts.filter((x) => x.id !== id));
      if (activeRef.current === id) newChat();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setThreads((ts) => ts.filter((x) => x.id !== id));
      } else setNotice(err instanceof Error ? err.message : 'Could not delete that chat');
    } finally {
      setDeletingId(null);
    }
  };

  const history = (
    <ThreadHistory
      threads={threads}
      activeId={activeId}
      usage={usage}
      busy={busy}
      deletingId={deletingId}
      onSelect={(id) => void selectThread(id)}
      onDelete={(id) => void deleteThread(id)}
      onNew={newChat}
      className="h-full"
    />
  );

  return (
    <div className={cn('flex gap-8', className)}>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact history controls below lg; the rail takes over on wide screens. */}
        <div className="mb-4 flex items-center gap-2 lg:hidden">
          <Button size="sm" variant="secondary" onClick={newChat} disabled={busy}>
            <Plus aria-hidden className="h-4 w-4" /> New chat
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setHistoryOpen((o) => !o)}
            aria-expanded={historyOpen}
            aria-controls="explorer-history"
          >
            <History aria-hidden className="h-4 w-4" /> History ({threads.length})
          </Button>
          <UsageMeter usage={usage} className="ml-auto w-36" />
        </div>
        {historyOpen ? (
          <div
            id="explorer-history"
            className="relative mb-4 max-h-[50vh] overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-4 lg:hidden"
          >
            <button
              type="button"
              aria-label="Close history"
              onClick={() => setHistoryOpen(false)}
              className="absolute top-3 right-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
            <div className="pt-8">{history}</div>
          </div>
        ) : null}

        {notice ? (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-line-strong bg-surface-2 px-4 py-2.5 text-[13px] text-down"
          >
            {notice}
          </p>
        ) : null}

        <div className="flex-1" aria-live="polite" aria-busy={busy || loadingThread}>
          {loadingThread ? (
            <p className="pt-[12vh] text-center text-[14px] text-muted">Opening chat…</p>
          ) : messages.length === 0 ? (
            <div className="mx-auto flex max-w-xl flex-col items-center pt-[12vh] text-center">
              <LogoMark size={40} />
              <h2 className="mt-5 text-[24px] font-semibold tracking-[-0.015em] text-fg">
                Ask about any fund or company
              </h2>
              <p className="mt-2 text-[14px] text-muted">
                Answers come from your holdings and stored fund data, with tables you can check line
                by line.
              </p>
              <ul
                className="mt-6 flex flex-wrap justify-center gap-2"
                aria-label="Suggested questions"
              >
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => void send(s)}
                      disabled={busy || limitReached}
                      className="h-9 rounded-full border border-line-strong px-4 text-[13px] text-fg hover:bg-surface-2 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ol className="space-y-6 pt-2">
              {messages.map((m, idx) => {
                // The newest question sits just above its (pending) answer.
                return m.role === 'user' ? (
                  <li
                    key={m.id}
                    ref={idx === messages.length - 2 ? lastRef : undefined}
                    className="flex scroll-mt-20 justify-end"
                  >
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-surface-3 px-4 py-2.5 text-[14px] whitespace-pre-wrap text-fg sm:max-w-[70%]">
                      <span className="sr-only">You: </span>
                      {m.text}
                    </p>
                  </li>
                ) : (
                  <AssistantBubble key={m.id} message={m} />
                );
              })}
            </ol>
          )}
        </div>

        <div className="sticky bottom-0 -mx-4 mt-6 bg-gradient-to-t from-bg from-70% to-transparent px-4 pt-6 pb-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 lg:mx-0 lg:px-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
            className="flex items-center gap-3"
          >
            <label className="relative flex min-w-0 flex-1 items-center">
              <span className="sr-only">Ask the Investment Explorer</span>
              <Sparkle
                aria-hidden
                className="pointer-events-none absolute left-4 h-4 w-4 fill-up text-up"
              />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={2000}
                disabled={limitReached}
                placeholder={
                  limitReached
                    ? 'Daily question limit reached — try again tomorrow'
                    : 'e.g. Compare VOO and QQQ, or which ETFs are heavy in NVDA?'
                }
                className="h-12 w-full rounded-xl border border-line bg-surface pr-4 pl-11 text-[14px] text-fg placeholder:text-faint focus:border-line-strong focus:outline-none focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60"
              />
            </label>
            <button
              type="submit"
              aria-label="Send"
              disabled={!draft.trim() || busy || limitReached}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-ink hover:bg-brand-hover disabled:opacity-60"
            >
              <SendHorizontal aria-hidden className="h-5 w-5" />
            </button>
          </form>
          <p className="mt-2.5 text-[12px] text-faint">{EXPLORER_DISCLAIMER}</p>
        </div>
      </div>

      <aside className="sticky top-4 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 self-start lg:block">
        {history}
      </aside>
    </div>
  );
}

function AssistantBubble({ message: m }: { message: AssistantMessage }) {
  const waiting = m.pending && !m.text;
  return (
    <li className="flex scroll-mt-20 gap-3" aria-busy={m.pending || undefined}>
      <span className="mt-1 hidden sm:block">
        <LogoMark size={28} />
      </span>
      <article className="min-w-0 flex-1 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-6">
        <span className="sr-only">EasyFI: </span>
        {waiting ? (
          <p className="flex items-center gap-3 text-[14px] text-muted">
            <span className="flex gap-1.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted"
                  style={{ animationDelay: `${i * 160}ms` }}
                />
              ))}
            </span>
            {m.tool ? (TOOL_LABELS[m.tool] ?? 'Checking your data…') : 'Thinking…'}
          </p>
        ) : m.text ? (
          <p className="max-w-[68ch] text-[15px] leading-[1.6] whitespace-pre-wrap text-fg">
            {m.text}
            {m.pending ? (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-muted align-[-2px]"
              />
            ) : null}
          </p>
        ) : null}
        {m.error ? (
          <p
            role="alert"
            className={cn(
              'flex items-start gap-2 text-[14px] text-down',
              m.text ? 'mt-4' : undefined,
            )}
          >
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {m.error.code === 'rate_limited' ? (
                <>
                  <span className="font-semibold">Daily limit reached.</span> {m.error.message}
                </>
              ) : (
                m.error.message
              )}
            </span>
          </p>
        ) : null}
        {m.blocks.length ? (
          <div className="mt-5 space-y-4">
            {m.blocks.map((b, i) => (
              <ChatBlockView key={`${m.id}-${i}`} block={b} />
            ))}
          </div>
        ) : null}
      </article>
    </li>
  );
}
