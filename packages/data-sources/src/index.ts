import { BlsClient } from './bls';
import { OpenRouterProvider } from './openrouter';
import { SecEdgarClient } from './sec/edgar';
import type { CusipLookup } from './sec/nport';
import { TiingoClient } from './tiingo';
import type {
  CpiSource,
  DividendSource,
  FetchLike,
  HoldingsSource,
  LLMProvider,
  PriceSource,
} from './types';

export const PACKAGE_NAME = '@easyfi/data-sources';

export * from './types';
export * from './http';
export * from './tiingo';
export * from './bls';
export * from './openrouter';
export * from './sec/edgar';
export * from './sec/nport';
export * from './sec/company-tickers';
export * from './fakes/prices';
export * from './fakes/dividends';
export * from './fakes/holdings';
export * from './fakes/cpi';
export * from './fakes/llm';
export * from './fakes/demo-llm';
export {
  fakeFetch,
  jsonResponse,
  textResponse,
  type FakeFetch,
  type RecordedCall,
} from './testing';

export const DEFAULT_OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

export interface SourcesEnv {
  TIINGO_TOKEN?: string | undefined;
  SEC_USER_AGENT?: string | undefined;
  BLS_KEY?: string | undefined;
  /** Set to any non-empty value to skip BLS entirely (it otherwise works keyless). */
  BLS_DISABLED?: string | undefined;
  OPENROUTER_API_KEY?: string | undefined;
  OPENROUTER_MODEL?: string | undefined;
  /** Public app URL, sent as OpenRouter HTTP-Referer. */
  APP_URL?: string | undefined;
}

export interface Sources {
  prices: PriceSource | null;
  dividends: DividendSource | null;
  holdings: HoldingsSource | null;
  cpi: CpiSource | null;
  llm: LLMProvider | null;
}

const val = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

/**
 * Real clients for every source whose credentials are configured; `null` otherwise
 * (callers fall back to fakes / RuleBasedDemoLLM in demo mode).
 */
export function createSources(
  env: SourcesEnv,
  deps: { fetch?: FetchLike; cusipToTicker?: CusipLookup } = {},
): Sources {
  const fetchOpt = deps.fetch ? { fetch: deps.fetch } : {};
  const tiingoToken = val(env.TIINGO_TOKEN);
  const secUa = val(env.SEC_USER_AGENT);
  const blsKey = val(env.BLS_KEY);
  const orKey = val(env.OPENROUTER_API_KEY);
  const appUrl = val(env.APP_URL);

  const tiingo = tiingoToken ? new TiingoClient({ token: tiingoToken, ...fetchOpt }) : null;
  return {
    prices: tiingo,
    dividends: tiingo,
    holdings: secUa
      ? new SecEdgarClient({
          userAgent: secUa,
          ...fetchOpt,
          ...(deps.cusipToTicker ? { cusipToTicker: deps.cusipToTicker } : {}),
        })
      : null,
    cpi: val(env.BLS_DISABLED)
      ? null
      : new BlsClient({ ...(blsKey ? { registrationKey: blsKey } : {}), ...fetchOpt }),
    llm: orKey
      ? new OpenRouterProvider({
          apiKey: orKey,
          model: val(env.OPENROUTER_MODEL) ?? DEFAULT_OPENROUTER_MODEL,
          ...(appUrl ? { referer: appUrl } : {}),
          ...fetchOpt,
        })
      : null,
  };
}
export * from './supabase-auth';
export * from './fakes/auth-admin';
