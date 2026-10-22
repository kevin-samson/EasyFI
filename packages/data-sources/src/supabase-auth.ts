import type { FetchLike } from './types';

export interface CreateUserInput {
  email: string;
  password: string;
  displayName?: string | null;
}

/** Server-side user management (sign-up is invite-gated, so users are created by the API, not the browser). */
export interface AuthAdmin {
  createUser(input: CreateUserInput): Promise<{ id: string }>;
  deleteUser(id: string): Promise<void>;
}

export type AuthAdminErrorCode = 'email_taken' | 'weak_password' | 'upstream';

export class AuthAdminError extends Error {
  override readonly name = 'AuthAdminError';
  constructor(
    readonly code: AuthAdminErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface SupabaseAuthAdminOptions {
  url: string;
  serviceRoleKey: string;
  fetch?: FetchLike;
}

/** Supabase GoTrue admin API. Needs the service role key — server only, never the browser. */
export class SupabaseAuthAdmin implements AuthAdmin {
  private readonly base: string;
  private readonly fetch: FetchLike;

  constructor(private readonly opts: SupabaseAuthAdminOptions) {
    this.base = opts.url.replace(/\/+$/, '') + '/auth/v1/admin/users';
    this.fetch = opts.fetch ?? ((u, i) => globalThis.fetch(u, i));
  }

  private headers() {
    return {
      apikey: this.opts.serviceRoleKey,
      authorization: `Bearer ${this.opts.serviceRoleKey}`,
      'content-type': 'application/json',
    };
  }

  async createUser({ email, password, displayName }: CreateUserInput): Promise<{ id: string }> {
    const res = await this.fetch(this.base, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: displayName ? { display_name: displayName } : {},
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      error_code?: string;
      msg?: string;
    };
    if (res.ok && body.id) return { id: body.id };
    const code: AuthAdminErrorCode =
      body.error_code === 'email_exists' || /already been registered/i.test(body.msg ?? '')
        ? 'email_taken'
        : body.error_code === 'weak_password'
          ? 'weak_password'
          : 'upstream';
    throw new AuthAdminError(code, body.msg ?? `Supabase admin HTTP ${res.status}`);
  }

  async deleteUser(id: string): Promise<void> {
    const res = await this.fetch(`${this.base}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok && res.status !== 404) {
      throw new AuthAdminError('upstream', `Supabase admin HTTP ${res.status}`);
    }
  }
}
