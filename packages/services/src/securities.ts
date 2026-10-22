import type { SecurityDto, SecuritySearchDto } from '@easyfi/contracts';
import { securitiesRepo, type Db, type Security } from '@easyfi/db';
import { ServiceError } from './errors';

const dto = (s: Security): SecurityDto => ({
  ticker: s.ticker,
  name: s.name,
  type: s.type,
  sector: s.sector,
  industry: s.industry,
  expenseRatio: s.expenseRatio,
});

export function securityService(db: Db) {
  const repo = securitiesRepo(db);
  return {
    async search(q: string, limit = 10): Promise<SecuritySearchDto> {
      return { results: (await repo.search(q, limit)).map(dto) };
    },

    async get(ticker: string): Promise<SecurityDto> {
      const s = await repo.get(ticker.trim().toUpperCase());
      if (!s)
        throw new ServiceError(
          'not_found',
          `${ticker.toUpperCase()} is not in the securities list.`,
        );
      return dto(s);
    },
  };
}
