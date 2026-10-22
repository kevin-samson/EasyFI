import type { MeDto, PatchMeRequest } from '@easyfi/contracts';
import { profilesRepo, type Db } from '@easyfi/db';
import type { AuthUser } from './auth';

export function meService(db: Db) {
  const profiles = profilesRepo(db);
  const dto = (
    u: AuthUser,
    p: { displayName: string | null; baseCurrency: string; theme: string },
  ): MeDto => ({
    id: u.userId,
    email: u.email,
    displayName: p.displayName,
    baseCurrency: p.baseCurrency,
    theme: p.theme === 'light' ? 'light' : 'dark',
  });

  return {
    /** Profiles are created lazily: users made outside sign-up (e.g. Supabase dashboard) still work. */
    async get(user: AuthUser): Promise<MeDto> {
      const p = (await profiles.get(user.userId)) ?? (await profiles.upsert(user.userId));
      return dto(user, p);
    },

    async patch(user: AuthUser, patch: PatchMeRequest): Promise<MeDto> {
      await profiles.upsert(user.userId);
      const p = await profiles.update(user.userId, patch);
      return dto(user, p!);
    },
  };
}
