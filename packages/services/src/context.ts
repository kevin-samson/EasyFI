import type { Db, Repos } from '@easyfi/db';
import { createRepos } from '@easyfi/db';
import type { LLMProvider } from '@easyfi/data-sources';
import { isoDay } from './internal/mappers';

export interface ServiceConfig {
  /** Explorer questions per user per day. */
  explorerDailyLimit: number;
  /** User ids allowed to manage invites. */
  adminUserIds: readonly string[];
  /** Public base URL for share links (no trailing slash). */
  appUrl: string;
}

export interface ServiceDeps {
  db: Db;
  /** LLM used by the Explorer; null → rule-based demo answers. */
  llm?: LLMProvider | null;
  /** Injectable clock (tests pin it). */
  now?: () => Date;
  config?: Partial<ServiceConfig>;
}

export interface Ctx {
  db: Db;
  repos: Repos;
  llm: LLMProvider | null;
  now: () => Date;
  /** Today as 'YYYY-MM-DD' (UTC). */
  today: () => string;
  config: ServiceConfig;
}

export function createCtx(deps: ServiceDeps): Ctx {
  const now = deps.now ?? (() => new Date());
  return {
    db: deps.db,
    repos: createRepos(deps.db),
    llm: deps.llm ?? null,
    now,
    today: () => isoDay(now()),
    config: {
      explorerDailyLimit: 30,
      adminUserIds: [],
      appUrl: '',
      ...deps.config,
    },
  };
}
