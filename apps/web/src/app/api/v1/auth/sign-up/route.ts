import { SignUpRequest } from '@easyfi/contracts';
import { appContext, parseBody, route, signUp } from '@easyfi/services';

export const runtime = 'nodejs';

export const POST = route(async (req) => {
  const input = await parseBody(req, SignUpRequest);
  return Response.json(await signUp(await appContext(), input), { status: 201 });
});
