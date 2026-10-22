import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  type RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import type { z } from 'zod';
import {
  CreateHoldingRequest,
  CreatePortfolioRequest,
  ErrorEnvelope,
  HoldingDto,
  HoldingListDto,
  IdParams,
  ImportCsvRequest,
  ImportResultDto,
  MeDto,
  PatchHoldingRequest,
  PatchMeRequest,
  PatchPortfolioRequest,
  PortfolioDto,
  PortfolioListDto,
  SecurityDto,
  SecuritySearchDto,
  SecuritySearchQuery,
  SignUpRequest,
  SignUpResultDto,
  TickerParams,
} from './schemas';

const json = (schema: z.ZodType, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

const errors = {
  400: json(ErrorEnvelope, 'Validation error'),
  401: json(ErrorEnvelope, 'Not signed in'),
  403: json(ErrorEnvelope, 'Cross-origin cookie request refused'),
  404: json(ErrorEnvelope, 'Not found'),
};

const publicErrors = {
  400: json(ErrorEnvelope, 'Validation error or invalid invite'),
  409: json(ErrorEnvelope, 'Email already registered'),
  502: json(ErrorEnvelope, 'Auth provider unavailable'),
};

type Route = Omit<RouteConfig, 'responses' | 'security'> & {
  /** Public routes (sign-up) skip the bearer requirement. */
  public?: boolean;
  ok: { status: 200 | 201 | 204; schema?: z.ZodType; description: string };
};

const routes: Route[] = [
  {
    method: 'post',
    path: '/auth/sign-up',
    tags: ['auth'],
    public: true,
    request: { body: json(SignUpRequest, 'Invite-gated sign-up') },
    ok: { status: 201, schema: SignUpResultDto, description: 'Account created; sign in next' },
  },
  {
    method: 'get',
    path: '/me',
    tags: ['me'],
    ok: { status: 200, schema: MeDto, description: 'Current user' },
  },
  {
    method: 'patch',
    path: '/me',
    tags: ['me'],
    request: { body: json(PatchMeRequest, 'Profile changes') },
    ok: { status: 200, schema: MeDto, description: 'Updated user' },
  },
  {
    method: 'get',
    path: '/portfolios',
    tags: ['portfolios'],
    ok: { status: 200, schema: PortfolioListDto, description: 'Your portfolios' },
  },
  {
    method: 'post',
    path: '/portfolios',
    tags: ['portfolios'],
    request: { body: json(CreatePortfolioRequest, 'New portfolio') },
    ok: { status: 201, schema: PortfolioDto, description: 'Created' },
  },
  {
    method: 'get',
    path: '/portfolios/{id}',
    tags: ['portfolios'],
    request: { params: IdParams },
    ok: { status: 200, schema: PortfolioDto, description: 'Portfolio' },
  },
  {
    method: 'patch',
    path: '/portfolios/{id}',
    tags: ['portfolios'],
    request: { params: IdParams, body: json(PatchPortfolioRequest, 'Changes') },
    ok: { status: 200, schema: PortfolioDto, description: 'Updated' },
  },
  {
    method: 'delete',
    path: '/portfolios/{id}',
    tags: ['portfolios'],
    request: { params: IdParams },
    ok: { status: 204, description: 'Deleted with its holdings' },
  },
  {
    method: 'get',
    path: '/portfolios/{id}/holdings',
    tags: ['holdings'],
    request: { params: IdParams },
    ok: { status: 200, schema: HoldingListDto, description: 'Holdings' },
  },
  {
    method: 'post',
    path: '/portfolios/{id}/holdings',
    tags: ['holdings'],
    request: { params: IdParams, body: json(CreateHoldingRequest, 'New holding') },
    ok: { status: 201, schema: HoldingDto, description: 'Created' },
  },
  {
    method: 'patch',
    path: '/holdings/{id}',
    tags: ['holdings'],
    request: { params: IdParams, body: json(PatchHoldingRequest, 'Changes') },
    ok: { status: 200, schema: HoldingDto, description: 'Updated' },
  },
  {
    method: 'delete',
    path: '/holdings/{id}',
    tags: ['holdings'],
    request: { params: IdParams },
    ok: { status: 204, description: 'Deleted' },
  },
  {
    method: 'post',
    path: '/portfolios/{id}/import',
    tags: ['holdings'],
    request: { params: IdParams, body: json(ImportCsvRequest, 'Broker CSV export') },
    ok: { status: 200, schema: ImportResultDto, description: 'Import result' },
  },
  {
    method: 'get',
    path: '/securities/search',
    tags: ['securities'],
    request: { query: SecuritySearchQuery },
    ok: { status: 200, schema: SecuritySearchDto, description: 'Ticker prefix or name matches' },
  },
  {
    method: 'get',
    path: '/securities/{ticker}',
    tags: ['securities'],
    request: { params: TickerParams },
    ok: { status: 200, schema: SecurityDto, description: 'One security' },
  },
];

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'bearer', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'Supabase access token (Flutter). The web app uses the Supabase SSR cookie instead.',
  });
  for (const { ok, public: isPublic, ...r } of routes) {
    registry.registerPath({
      ...r,
      security: isPublic ? [] : [{ bearer: [] }],
      responses: {
        [ok.status]: ok.schema ? json(ok.schema, ok.description) : { description: ok.description },
        ...(isPublic ? publicErrors : errors),
      },
    });
  }
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'EasyFI API', version: '1.0.0' },
    servers: [{ url: '/api/v1' }],
  });
}
