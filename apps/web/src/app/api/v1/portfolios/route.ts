import { CreatePortfolioRequest } from '@easyfi/contracts';
import { authedRoute, parseBody, portfolioService } from '@easyfi/services';

export const runtime = 'nodejs';

export const GET = authedRoute(async ({ ctx, user }) => portfolioService(ctx.db).list(user));

export const POST = authedRoute(async ({ req, ctx, user }) => {
  const body = await parseBody(req, CreatePortfolioRequest);
  return Response.json(await portfolioService(ctx.db).create(user, body), { status: 201 });
});
