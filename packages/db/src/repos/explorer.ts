import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../client';
import {
  explorerMessages,
  explorerThreads,
  llmUsage,
  type ExplorerMessage,
  type ExplorerThread,
  type MessageRole,
} from '../schema';
import { isUuid } from '../util';

export interface MessageInput {
  role: MessageRole;
  content: string;
  blocks?: unknown;
}

export type ThreadWithMessages = ExplorerThread & { messages: ExplorerMessage[] };

export function explorerRepo(db: Db) {
  const ownedThread = (userId: string, id: string) =>
    and(eq(explorerThreads.userId, userId), eq(explorerThreads.id, id));

  return {
    async createThread(userId: string, input: { title?: string } = {}): Promise<ExplorerThread> {
      const [row] = await db
        .insert(explorerThreads)
        .values({ userId, ...input })
        .returning();
      return row!;
    },

    listThreads(userId: string): Promise<ExplorerThread[]> {
      return db
        .select()
        .from(explorerThreads)
        .where(eq(explorerThreads.userId, userId))
        .orderBy(desc(explorerThreads.updatedAt));
    },

    async getThread(userId: string, id: string): Promise<ThreadWithMessages | null> {
      if (!isUuid(id)) return null;
      const [thread] = await db.select().from(explorerThreads).where(ownedThread(userId, id));
      if (!thread) return null;
      const messages = await db
        .select()
        .from(explorerMessages)
        .where(and(eq(explorerMessages.userId, userId), eq(explorerMessages.threadId, id)))
        .orderBy(asc(explorerMessages.createdAt), asc(explorerMessages.id));
      return { ...thread, messages };
    },

    /** Null when the thread is not the user's. Bumps the thread's updatedAt. */
    async appendMessage(
      userId: string,
      threadId: string,
      input: MessageInput,
    ): Promise<ExplorerMessage | null> {
      if (!isUuid(threadId)) return null;
      return db.transaction(async (tx) => {
        const touched = await tx
          .update(explorerThreads)
          .set({ updatedAt: new Date() })
          .where(ownedThread(userId, threadId))
          .returning({ id: explorerThreads.id });
        if (touched.length === 0) return null;
        // clock_timestamp(), not now(): now() is frozen per transaction, we want strict append order
        const [row] = await tx
          .insert(explorerMessages)
          .values({ ...input, userId, threadId, createdAt: sql`clock_timestamp()` })
          .returning();
        return row!;
      });
    },

    async renameThread(userId: string, id: string, title: string): Promise<boolean> {
      if (!isUuid(id)) return false;
      const rows = await db
        .update(explorerThreads)
        .set({ title })
        .where(ownedThread(userId, id))
        .returning({ id: explorerThreads.id });
      return rows.length > 0;
    },

    async deleteThread(userId: string, id: string): Promise<boolean> {
      if (!isUuid(id)) return false;
      const rows = await db
        .delete(explorerThreads)
        .where(ownedThread(userId, id))
        .returning({ id: explorerThreads.id });
      return rows.length > 0;
    },

    /** Atomically increments and returns today's LLM call count for the user. day = 'YYYY-MM-DD'. */
    async incrementUsage(userId: string, day: string): Promise<number> {
      const [row] = await db
        .insert(llmUsage)
        .values({ userId, day, count: 1 })
        .onConflictDoUpdate({
          target: [llmUsage.userId, llmUsage.day],
          set: { count: sql`${llmUsage.count} + 1` },
        })
        .returning({ count: llmUsage.count });
      return row!.count;
    },

    async getUsage(userId: string, day: string): Promise<number> {
      const [row] = await db
        .select({ count: llmUsage.count })
        .from(llmUsage)
        .where(and(eq(llmUsage.userId, userId), eq(llmUsage.day, day)));
      return row?.count ?? 0;
    },
  };
}
