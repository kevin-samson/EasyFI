'use client';

import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { ExplorerUsage, ThreadSummary } from './types';

export type ThreadHistoryProps = {
  threads: ThreadSummary[];
  activeId: string | null;
  usage: ExplorerUsage;
  /** Disables switching while an answer is streaming. */
  busy: boolean;
  deletingId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  className?: string;
};

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

export function UsageMeter({ usage, className }: { usage: ExplorerUsage; className?: string }) {
  const used = Math.min(usage.usedToday, usage.dailyLimit);
  const pct = usage.dailyLimit > 0 ? (used / usage.dailyLimit) * 100 : 0;
  return (
    <div className={className}>
      <p className="text-[12px] text-muted">
        <span className="font-semibold text-fg">{used}</span> of {usage.dailyLimit} questions today
      </p>
      <span
        aria-hidden
        className="mt-1.5 block h-[4px] w-full overflow-hidden rounded-full bg-track"
      >
        <span
          className={cn('block h-full rounded-full', pct >= 100 ? 'bg-down' : 'bg-brand')}
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}

/** Chat history: "New chat", previous threads (select / delete) and today's usage. */
export function ThreadHistory({
  threads,
  activeId,
  usage,
  busy,
  deletingId,
  onSelect,
  onDelete,
  onNew,
  className,
}: ThreadHistoryProps) {
  return (
    <nav aria-label="Chat history" className={cn('flex flex-col', className)}>
      <Button variant="secondary" size="md" onClick={onNew} disabled={busy} className="w-full">
        <Plus aria-hidden className="h-4 w-4" /> New chat
      </Button>
      <h2 className="mt-5 mb-2 px-2 text-[12px] font-semibold tracking-wide text-faint uppercase">
        History
      </h2>
      {threads.length === 0 ? (
        <p className="px-2 text-[13px] text-muted">Your questions will be saved here.</p>
      ) : (
        <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {threads.map((t) => {
            const active = t.id === activeId;
            return (
              <li key={t.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  disabled={busy && !active}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-lg px-3 py-2 pr-9 text-left text-[13px] disabled:opacity-50',
                    active ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  <MessageSquare aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{t.title}</span>
                    <span className="block text-[11px] text-faint">
                      {dateFmt.format(new Date(t.createdAt))}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(t.id)}
                  disabled={busy || deletingId === t.id}
                  aria-label={`Delete “${t.title}”`}
                  className="absolute top-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-faint opacity-100 hover:bg-surface-3 hover:text-down focus-visible:opacity-100 disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 aria-hidden className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <UsageMeter usage={usage} className="mt-4 border-t border-line px-2 pt-4" />
    </nav>
  );
}
