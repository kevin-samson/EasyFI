import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { endpoints, type EndpointDef } from './endpoints';
import { ErrorEnvelope } from './schemas';

export const API_BASE = '/api/v1';

/** OpenAPI 3.1 document for /api/v1, generated from the endpoint table. */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  registry.register('Error', ErrorEnvelope);
  registry.registerComponent('securitySchemes', 'bearer', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Supabase access token. The web app uses the session cookie instead.',
  });

  for (const e of Object.values(endpoints) as EndpointDef[]) {
    const status = String(e.status ?? 200);
    const contentType = e.stream ?? 'application/json';
    registry.registerPath({
      operationId: e.operationId,
      method: e.method,
      path: e.path.replace(/:(\w+)/g, '{$1}'),
      summary: e.summary,
      tags: [e.tag],
      ...(e.auth === false ? { security: [] } : { security: [{ bearer: [] }] }),
      request: {
        ...(e.params ? { params: e.params } : {}),
        ...(e.query ? { query: e.query } : {}),
        ...(e.body
          ? { body: { required: true, content: { 'application/json': { schema: e.body } } } }
          : {}),
      },
      responses: {
        [status]: { description: 'OK', content: { [contentType]: { schema: e.response } } },
        default: {
          description: 'Error',
          content: { 'application/json': { schema: ErrorEnvelope } },
        },
      },
    });
  }

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'EasyFI API',
      version: '1.0.0',
      description:
        'Portfolio look-through API used by the EasyFI web app and Flutter client. Money in USD, weights as fractions, dates ISO.',
    },
    servers: [{ url: API_BASE }],
  });
}
