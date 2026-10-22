import { SecuritySearchQuery } from '@easyfi/contracts';
import { authedRoute, parseQuery, securityService } from '@easyfi/services';

export const runtime = 'nodejs';

export const GET = authedRoute(async ({ req, ctx }) => {
  const { q, limit } = parseQuery(req, SecuritySearchQuery);
  return securityService(ctx.db).search(q, limit);
});
