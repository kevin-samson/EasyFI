import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../client';
import { goals, type Goal } from '../schema';
import { isUuid } from '../util';

export interface GoalInput {
  label?: string;
  inflationRate?: number | null;
  targetDate?: string | null;
  targetAmount?: number | null;
  annualExpenses?: number | null;
  withdrawalRate?: number | null;
  monthlyContribution?: number | null;
  expectedGrowth?: number | null;
}

export function goalsRepo(db: Db) {
  const owned = (userId: string, id: string) => and(eq(goals.userId, userId), eq(goals.id, id));

  return {
    list(userId: string): Promise<Goal[]> {
      return db.select().from(goals).where(eq(goals.userId, userId)).orderBy(asc(goals.createdAt));
    },
    async get(userId: string, id: string): Promise<Goal | null> {
      if (!isUuid(id)) return null;
      const [row] = await db.select().from(goals).where(owned(userId, id));
      return row ?? null;
    },
    async create(userId: string, input: GoalInput): Promise<Goal> {
      const [row] = await db
        .insert(goals)
        .values({ ...input, userId })
        .returning();
      return row!;
    },
    async update(userId: string, id: string, patch: GoalInput): Promise<Goal | null> {
      if (!isUuid(id)) return null;
      const [row] = await db.update(goals).set(patch).where(owned(userId, id)).returning();
      return row ?? null;
    },
    async delete(userId: string, id: string): Promise<boolean> {
      if (!isUuid(id)) return false;
      const rows = await db.delete(goals).where(owned(userId, id)).returning({ id: goals.id });
      return rows.length > 0;
    },
  };
}
