import {
  authService,
  demoAuthBackend,
  meService,
  supabaseAuthBackend,
  type AuthBackend,
  type SupabaseAuthConfig,
} from './auth';
import { compareService } from './compare';
import { createCtx, type Ctx, type ServiceDeps } from './context';
import { explorerService } from './explorer';
import { holdingService } from './holdings';
import { homeService } from './home';
import { incomeService } from './income';
import { portfolioService } from './portfolios';
import { securityService } from './securities';
import { settingsService } from './settings';
import { whatIfService } from './whatif';

export const PACKAGE_NAME = '@easyfi/services';

export type AuthConfig =
  | { mode: 'demo'; secret: string }
  | ({ mode: 'supabase' } & SupabaseAuthConfig)
  | { mode: 'custom'; backend: (ctx: Ctx) => AuthBackend };

export interface CreateServicesOptions extends ServiceDeps {
  auth?: AuthConfig;
  /** Extra invite codes accepted at sign-up (env INVITE_CODES). */
  inviteCodes?: readonly string[];
}

export function createServices(deps: CreateServicesOptions) {
  const ctx = createCtx(deps);
  const authCfg = deps.auth ?? { mode: 'demo', secret: 'easyfi-local-demo-secret' };
  const backend =
    authCfg.mode === 'demo'
      ? demoAuthBackend(ctx, authCfg.secret)
      : authCfg.mode === 'supabase'
        ? supabaseAuthBackend(ctx, authCfg)
        : authCfg.backend(ctx);
  const portfolios = portfolioService(ctx);
  const compare = compareService(ctx);
  const whatIf = whatIfService(ctx);
  const income = incomeService(ctx, portfolios);
  return {
    ctx,
    auth: authService(ctx, backend, { inviteCodes: deps.inviteCodes ?? [] }),
    me: meService(ctx, backend.mode),
    portfolios,
    holdings: holdingService(ctx),
    home: homeService(ctx, portfolios),
    compare,
    income,
    securities: securityService(ctx),
    whatIf,
    explorer: explorerService(ctx, { portfolios, compare, whatIf, income }),
    settings: settingsService(ctx),
  };
}

export type Services = ReturnType<typeof createServices>;

export type { ServiceConfig, ServiceDeps } from './context';
export { ServiceError } from './errors';
export { DEMO_INVITE_CODE, DEMO_TODAY, DEMO_USER_ID, seedDemo, seedDemoMarket } from './demo';
export {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  ensureDemoLogin,
  type AuthBackend,
  type AuthTokens,
  type AuthUser,
} from './auth';
export { EXPLORER_SYSTEM_PROMPT, EXPLORER_TOOLS } from './explorer';
export {
  handleApiRequest,
  authenticate,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  type ApiRuntime,
} from './http';
export { createRuntime, getRuntime, type Runtime, type RuntimeEnv } from './runtime';
export {
  POPULAR_SECURITIES,
  SEEDED_FUND_TICKERS,
  seedPopularSecurities,
} from './popular-securities';
