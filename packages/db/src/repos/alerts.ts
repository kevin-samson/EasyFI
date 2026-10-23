import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../client';
import { alerts, profiles, type Alert } from '../schema';
import { isUuid } from '../util';

export interface AlertInput {
  kind: string;
  threshold?: unknown;
  enabled?: boolean;
}

export function alertsRepo(db: Db) {
  const owned = (userId: string, id: string) => and(eq(alerts.userId, userId), eq(alerts.id, id));
  const patchOwned = async (
    userId: string,
    id: string,
    set: Partial<typeof alerts.$inferInsert>,
  ) => {
    if (!isUuid(id)) return null;
    const [row] = await db.update(alerts).set(set).where(owned(userId, id)).returning();
    return row ?? null;
  };

  return {
    list(userId: string): Promise<Alert[]> {
      return db
        .select()
        .from(alerts)
        .where(eq(alerts.userId, userId))
        .orderBy(asc(alerts.createdAt));
    },
    async create(userId: string, input: AlertInput): Promise<Alert> {
      const [row] = await db
        .insert(alerts)
        .values({ ...input, userId })
        .returning();
      return row!;
    },
    update(userId: string, id: string, patch: Partial<AlertInput>): Promise<Alert | null> {
      return patchOwned(userId, id, patch);
    },
    markFired(userId: string, id: string, at: Date = new Date()): Promise<Alert | null> {
      return patchOwned(userId, id, { lastFiredAt: at });
    },
    /** Job-only (crosses users): ids + emails of users with at least one enabled alert. */
    async usersWithEnabled(): Promise<{ userId: string; email: string | null }[]> {
      return db
        .selectDistinct({ userId: alerts.userId, email: profiles.email })
        .from(alerts)
        .leftJoin(profiles, eq(profiles.id, alerts.userId))
        .where(eq(alerts.enabled, true));
    },
    async delete(userId: string, id: string): Promise<boolean> {
      if (!isUuid(id)) return false;
      const rows = await db.delete(alerts).where(owned(userId, id)).returning({ id: alerts.id });
      return rows.length > 0;
    },
  };
}
