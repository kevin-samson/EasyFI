import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { invites, type Invite } from '../schema';

export function invitesRepo(db: Db) {
  return {
    async create(input: { code: string; maxUses?: number }): Promise<Invite> {
      const [row] = await db.insert(invites).values(input).returning();
      return row!;
    },

    list(): Promise<Invite[]> {
      return db.select().from(invites).orderBy(desc(invites.createdAt));
    },

    async get(code: string): Promise<Invite | null> {
      const [row] = await db.select().from(invites).where(eq(invites.code, code));
      return row ?? null;
    },

    /** Atomically consumes one use. False when unknown or exhausted. */
    async redeem(code: string): Promise<boolean> {
      const rows = await db
        .update(invites)
        .set({ used: sql`${invites.used} + 1` })
        .where(and(eq(invites.code, code), lt(invites.used, invites.maxUses)))
        .returning({ code: invites.code });
      return rows.length > 0;
    },
  };
}
