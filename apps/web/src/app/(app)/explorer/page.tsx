import type { Metadata } from 'next';
import { ExplorerChat } from '@/components/explorer/ExplorerChat';
import { ApiError, load, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Investment Explorer' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ExplorerPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const threadId = first(sp.t);
  const api = await serverApi();
  const list = await load(api.GET('/explorer/threads'));

  // ?t=<id> reopens a thread; a stale/deleted id just starts a fresh chat.
  let thread = null;
  if (threadId) {
    try {
      thread = await load(
        api.GET('/explorer/threads/{id}', { params: { path: { id: threadId } } }),
      );
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
  }

  return (
    <>
      <h1 className="sr-only">Investment Explorer</h1>
      {/* -mb-16 cancels the shell's bottom padding so the input sits at the viewport bottom. */}
      <ExplorerChat
        threads={list.threads}
        suggestions={list.suggestions}
        usage={list.usage}
        initialThread={thread}
        className="-mb-16 min-h-[calc(100dvh-5.5rem)] md:min-h-[calc(100dvh-2rem)]"
      />
    </>
  );
}
