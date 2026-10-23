import type { Db } from '../client';
import { alertsRepo } from './alerts';
import { cashRepo } from './cash';
import { cpiRepo } from './cpi';
import { credentialsRepo } from './credentials';
import { dividendsRepo } from './dividends';
import { explorerRepo } from './explorer';
import { feedbackRepo } from './feedback';
import { fundHoldingsRepo } from './fund-holdings';
import { goalsRepo } from './goals';
import { holdingsRepo } from './holdings';
import { invitesRepo } from './invites';
import { jobsRepo } from './jobs';
import { portfoliosRepo } from './portfolios';
import { pricesRepo } from './prices';
import { profilesRepo } from './profiles';
import { securitiesRepo } from './securities';
import { shareLinksRepo } from './share-links';

export function createRepos(db: Db) {
  return {
    // user-owned: every method takes userId first
    profiles: profilesRepo(db),
    portfolios: portfoliosRepo(db),
    holdings: holdingsRepo(db),
    cash: cashRepo(db),
    explorer: explorerRepo(db),
    alerts: alertsRepo(db),
    goals: goalsRepo(db),
    shareLinks: shareLinksRepo(db),
    feedback: feedbackRepo(db),
    // shared market data / admin
    securities: securitiesRepo(db),
    prices: pricesRepo(db),
    fundHoldings: fundHoldingsRepo(db),
    dividends: dividendsRepo(db),
    cpi: cpiRepo(db),
    invites: invitesRepo(db),
    credentials: credentialsRepo(db),
    jobs: jobsRepo(db),
  };
}

export type Repos = ReturnType<typeof createRepos>;

export {
  alertsRepo,
  cashRepo,
  cpiRepo,
  credentialsRepo,
  dividendsRepo,
  explorerRepo,
  feedbackRepo,
  fundHoldingsRepo,
  goalsRepo,
  holdingsRepo,
  invitesRepo,
  jobsRepo,
  portfoliosRepo,
  pricesRepo,
  profilesRepo,
  securitiesRepo,
  shareLinksRepo,
};
export type { AlertInput } from './alerts';
export type { CpiInput } from './cpi';
export type { DividendInput } from './dividends';
export type { MessageInput, ThreadWithMessages } from './explorer';
export type { ConstituentInput, FundSnapshot, SectorWeightsInput } from './fund-holdings';
export type { GoalInput } from './goals';
export type { HoldingInput } from './holdings';
export type { PortfolioInput, PortfolioWithHoldings } from './portfolios';
export type { LatestPrice, PriceInput } from './prices';
export type { ProfileInput } from './profiles';
export type { SecurityInput } from './securities';
