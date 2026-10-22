import { IdParams, PatchPortfolioRequest } from '@easyfi/contracts';
import { authedRoute, parseBody, parseParams, portfolioService } from '@easyfi/services';

export const runtime = 'nodejs';

type P = { id: string };

export const GET = authedRoute<P>(async ({ ctx, user, params }) =>
  portfolioService(ctx.db).get(user, (await parseParams(params, IdParams)).id),
);

export const PATCH = authedRoute<P>(async ({ req, ctx, user, params }) => {
  const { id } = await parseParams(params, IdParams);
  return portfolioService(ctx.db).patch(user, id, await parseBody(req, PatchPortfolioRequest));
});

export const DELETE = authedRoute<P>(async ({ ctx, user, params }) => {
  await portfolioService(ctx.db).remove(user, (await parseParams(params, IdParams)).id);
  return new Response(null, { status: 204 });
});
