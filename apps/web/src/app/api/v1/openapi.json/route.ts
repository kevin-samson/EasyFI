import { buildOpenApiDocument } from '@easyfi/contracts';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(buildOpenApiDocument());
}
