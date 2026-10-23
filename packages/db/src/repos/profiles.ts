import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import { profiles, type Profile } from '../schema';
import { isUuid } from '../util';

export interface ProfileInput {
  email?: string | null;
  displayName?: string | null;
  baseCurrency?: string;
  theme?: string;
}

export function profilesRepo(db: Db) {
  return {
    async get(userId: string): Promise<Profile | null> {
      if (!isUuid(userId)) return null;
      const [row] = await db.select().from(profiles).where(eq(profiles.id, userId));
      return row ?? null;
    },

    /** Create the profile if missing; otherwise apply the given fields. */
    async upsert(userId: string, input: ProfileInput = {}): Promise<Profile> {
      const [row] = await db
        .insert(profiles)
        .values({ id: userId, ...input })
        .onConflictDoUpdate({ target: profiles.id, set: { ...input, updatedAt: new Date() } })
        .returning();
      return row!;
    },

    async update(userId: string, patch: ProfileInput): Promise<Profile | null> {
      if (!isUuid(userId)) return null;
      const [row] = await db
        .update(profiles)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(profiles.id, userId))
        .returning();
      return row ?? null;
    },
  };
}
