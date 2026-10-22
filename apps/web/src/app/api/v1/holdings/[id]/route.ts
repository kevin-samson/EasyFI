import { IdParams, PatchHoldingRequest } from '@easyfi/contracts';
import { authedRoute, parseBody, parseParams, portfolioService } from '@easyfi/services';

export const runtime = 'nodejs';

type P = { id: string };

export const PATCH = authedRoute<P>(async ({ req, ctx, user, params }) => {
  const { id } = await parseParams(params, IdParams);
  return portfolioService(ctx.db).patchHolding(user, id, await parseBody(req, PatchHoldingRequest));
});

export const DELETE = authedRoute<P>(async ({ ctx, user, params }) => {
  await portfolioService(ctx.db).removeHolding(user, (await parseParams(params, IdParams)).id);
  return new Response(null, { status: 204 });
});
