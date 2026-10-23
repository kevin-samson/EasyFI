import { getRuntime, handleApiRequest } from '@easyfi/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(req: Request) {
  return handleApiRequest(req, await getRuntime());
}

export { handle as DELETE, handle as GET, handle as PATCH, handle as POST, handle as PUT };
