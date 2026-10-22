import { AuthAdminError, type AuthAdmin, type CreateUserInput } from '../supabase-auth';

/** In-memory AuthAdmin for tests and local demo mode. */
export class FakeAuthAdmin implements AuthAdmin {
  readonly users = new Map<string, { email: string; displayName: string | null }>();

  async createUser({ email, displayName }: CreateUserInput): Promise<{ id: string }> {
    const e = email.trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.email === e) throw new AuthAdminError('email_taken', 'Email already registered');
    }
    const id = crypto.randomUUID();
    this.users.set(id, { email: e, displayName: displayName ?? null });
    return { id };
  }

  async deleteUser(id: string): Promise<void> {
    this.users.delete(id);
  }
}
