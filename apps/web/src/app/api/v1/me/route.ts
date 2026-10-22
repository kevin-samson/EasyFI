import { PatchMeRequest } from '@easyfi/contracts';
import { authedRoute, meService, parseBody } from '@easyfi/services';

export const runtime = 'nodejs';

export const GET = authedRoute(async ({ ctx, user }) => meService(ctx.db).get(user));

export const PATCH = authedRoute(async ({ req, ctx, user }) =>
  meService(ctx.db).patch(user, await parseBody(req, PatchMeRequest)),
);
