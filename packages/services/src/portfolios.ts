import type {
  CreateHoldingRequest,
  CreatePortfolioRequest,
  HoldingDto,
  ImportCsvRequest,
  ImportResultDto,
  PatchHoldingRequest,
  PatchPortfolioRequest,
  PortfolioDto,
} from '@easyfi/contracts';
import { parseBrokerCsv } from '@easyfi/core';
import {
  cashRepo,
  holdingsRepo,
  portfoliosRepo,
  type Db,
  type Holding,
  type Portfolio,
} from '@easyfi/db';
import type { AuthUser } from './auth';
import { ServiceError } from './errors';

const notFound = (what: string) => new ServiceError('not_found', `${what} not found.`);

const portfolioDto = (p: Portfolio, cash: number): PortfolioDto => ({
  id: p.id,
  name: p.name,
  type: p.type,
  createdAt: new Date(p.createdAt).toISOString(),
  cash,
});

export const holdingDto = (h: Holding): HoldingDto => ({
  id: h.id,
  portfolioId: h.portfolioId,
  ticker: h.ticker,
  accountType: h.accountType,
  shares: h.shares,
  costBasis: h.costBasis,
  statementValue: h.statementValue,
  statementDate: h.statementDate ?? null,
  statementKind: h.statementKind,
  tags: h.tags ?? [],
});

/** Portfolio + holdings use-cases. Every call is scoped to `user.userId`; foreign ids are 404. */
export function portfolioService(db: Db) {
  const portfolios = portfoliosRepo(db);
  const holdings = holdingsRepo(db);
  const cash = cashRepo(db);

  const owned = async (user: AuthUser, id: string) => {
    const p = await portfolios.get(user.userId, id);
    if (!p) throw notFound('Portfolio');
    return p;
  };

  return {
    async list(user: AuthUser) {
      const rows = await portfolios.listWithHoldings(user.userId);
      return { portfolios: rows.map((p) => portfolioDto(p, p.cash)) };
    },

    async get(user: AuthUser, id: string): Promise<PortfolioDto> {
      const p = await owned(user, id);
      return portfolioDto(p, (await cash.get(user.userId, id)) ?? 0);
    },

    async create(user: AuthUser, input: CreatePortfolioRequest): Promise<PortfolioDto> {
      const p = await portfolios.create(user.userId, { name: input.name, type: input.type });
      if (input.cash !== undefined) await cash.set(user.userId, p.id, input.cash);
      return portfolioDto(p, input.cash ?? 0);
    },

    async patch(user: AuthUser, id: string, input: PatchPortfolioRequest): Promise<PortfolioDto> {
      const { cash: amount, ...fields } = input;
      const p = Object.keys(fields).length
        ? await portfolios.update(user.userId, id, fields)
        : await portfolios.get(user.userId, id);
      if (!p) throw notFound('Portfolio');
      if (amount !== undefined) await cash.set(user.userId, id, amount);
      return portfolioDto(p, (await cash.get(user.userId, id)) ?? 0);
    },

    async remove(user: AuthUser, id: string): Promise<void> {
      if (!(await portfolios.delete(user.userId, id))) throw notFound('Portfolio');
    },

    async listHoldings(user: AuthUser, portfolioId: string) {
      await owned(user, portfolioId);
      return { holdings: (await holdings.list(user.userId, portfolioId)).map(holdingDto) };
    },

    async addHolding(
      user: AuthUser,
      portfolioId: string,
      input: CreateHoldingRequest,
    ): Promise<HoldingDto> {
      const row = await holdings.create(user.userId, portfolioId, input);
      if (!row) throw notFound('Portfolio');
      return holdingDto(row);
    },

    async patchHolding(
      user: AuthUser,
      id: string,
      input: PatchHoldingRequest,
    ): Promise<HoldingDto> {
      const row = await holdings.update(user.userId, id, input);
      if (!row) throw notFound('Holding');
      return holdingDto(row);
    },

    async removeHolding(user: AuthUser, id: string): Promise<void> {
      if (!(await holdings.delete(user.userId, id))) throw notFound('Holding');
    },

    /** Broker CSV → holdings. Cash / money-market rows add to the portfolio cash balance. */
    async importCsv(
      user: AuthUser,
      portfolioId: string,
      input: ImportCsvRequest,
    ): Promise<ImportResultDto> {
      await owned(user, portfolioId);
      const parsed = parseBrokerCsv(input.csv, input.format);
      const skipped = parsed.warnings.map((w) => ({ line: w.line, reason: w.message }));
      const cashLines = parsed.holdings.filter((x) => x.ticker === 'CASH');
      const rows = parsed.holdings
        .filter((x) => x.ticker !== 'CASH')
        .map((x) => ({
          ticker: x.ticker,
          // CUSIP-only / value-only lines keep their statement value; shares column is NOT NULL.
          shares: x.shares ?? 0,
          accountType: x.accountType,
          costBasis: x.costBasis,
          statementValue: x.statementValue,
          statementKind: x.shares === null ? 'broker_csv' : null,
          tags: [],
        }));

      if (input.mode === 'replace' && rows.length === 0 && cashLines.length === 0) {
        // A wrong format parses to nothing; replacing with nothing would wipe the portfolio.
        throw new ServiceError(
          'bad_request',
          skipped[0]?.reason ?? 'No holdings found in the CSV.',
        );
      }
      const csvCash = cashLines.reduce((sum, x) => sum + (x.statementValue ?? 0), 0);

      // One transaction: a failed insert must not leave a replaced portfolio empty.
      const inserted = await db.transaction(async (tx) => {
        const txHoldings = holdingsRepo(tx as unknown as Db);
        const txCash = cashRepo(tx as unknown as Db);
        if (input.mode === 'replace') {
          const existing = await txHoldings.list(user.userId, portfolioId);
          await txHoldings.bulkDelete(
            user.userId,
            existing.map((x) => x.id),
          );
          // Replace mirrors the statement: cash becomes exactly the CSV's cash lines (0 if none).
          await txCash.set(user.userId, portfolioId, csvCash);
        } else if (csvCash) {
          // Append adds to the balance (re-importing the same file adds its cash again).
          const prior = (await txCash.get(user.userId, portfolioId)) ?? 0;
          await txCash.set(user.userId, portfolioId, prior + csvCash);
        }
        return (await txHoldings.bulkInsert(user.userId, portfolioId, rows)) ?? [];
      });
      return { imported: inserted.length, skipped, holdings: inserted.map(holdingDto) };
    },
  };
}
