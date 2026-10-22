import { and, lt, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { invites, type Invite } from '../schema';

/** Invite codes are matched case-insensitively (people retype them). */
const sameCode = (code: string) => sql`upper(${invites.code}) = upper(${code.trim()})`;

export function invitesRepo(db: Db) {
  return {
    async create(input: { code: string; maxUses?: number }): Promise<Invite> {
      const [row] = await db.insert(invites).values(input).returning();
      return row!;
    },

    async get(code: string): Promise<Invite | null> {
      const [row] = await db.select().from(invites).where(sameCode(code));
      return row ?? null;
    },

    /** Atomically consumes one use. False when unknown or exhausted. */
    async redeem(code: string): Promise<boolean> {
      const rows = await db
        .update(invites)
        .set({ used: sql`${invites.used} + 1` })
        .where(and(sameCode(code), lt(invites.used, invites.maxUses)))
        .returning({ code: invites.code });
      return rows.length > 0;
    },
  };
}
