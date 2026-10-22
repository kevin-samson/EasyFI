import { TickerParams } from '@easyfi/contracts';
import { authedRoute, parseParams, securityService } from '@easyfi/services';

export const runtime = 'nodejs';

export const GET = authedRoute<{ ticker: string }>(async ({ ctx, params }) =>
  securityService(ctx.db).get((await parseParams(params, TickerParams)).ticker),
);
