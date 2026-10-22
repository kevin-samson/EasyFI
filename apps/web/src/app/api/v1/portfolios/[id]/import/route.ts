import { IdParams, ImportCsvRequest } from '@easyfi/contracts';
import { authedRoute, parseBody, parseParams, portfolioService } from '@easyfi/services';

export const runtime = 'nodejs';

export const POST = authedRoute<{ id: string }>(async ({ req, ctx, user, params }) => {
  const { id } = await parseParams(params, IdParams);
  return portfolioService(ctx.db).importCsv(user, id, await parseBody(req, ImportCsvRequest));
});
