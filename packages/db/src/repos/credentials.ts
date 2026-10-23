import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import { localCredentials, type LocalCredential } from '../schema';

/** Local demo-mode credentials (Supabase Auth owns credentials in production). */
export function credentialsRepo(db: Db) {
  return {
    async get(email: string): Promise<LocalCredential | null> {
      const [row] = await db
        .select()
        .from(localCredentials)
        .where(eq(localCredentials.email, email.toLowerCase()));
      return row ?? null;
    },
    /** False when the email is already registered. */
    async create(input: { email: string; userId: string; passwordHash: string }): Promise<boolean> {
      const rows = await db
        .insert(localCredentials)
        .values({ ...input, email: input.email.toLowerCase() })
        .onConflictDoNothing()
        .returning({ email: localCredentials.email });
      return rows.length > 0;
    },
  };
}
