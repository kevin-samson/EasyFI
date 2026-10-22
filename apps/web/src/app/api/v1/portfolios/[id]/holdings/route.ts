import { CreateHoldingRequest, IdParams } from '@easyfi/contracts';
import { authedRoute, parseBody, parseParams, portfolioService } from '@easyfi/services';

export const runtime = 'nodejs';

type P = { id: string };

export const GET = authedRoute<P>(async ({ ctx, user, params }) =>
  portfolioService(ctx.db).listHoldings(user, (await parseParams(params, IdParams)).id),
);

export const POST = authedRoute<P>(async ({ req, ctx, user, params }) => {
  const { id } = await parseParams(params, IdParams);
  const body = await parseBody(req, CreateHoldingRequest);
  return Response.json(await portfolioService(ctx.db).addHolding(user, id, body), { status: 201 });
});
