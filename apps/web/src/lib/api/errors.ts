import type { components } from './schema';

export type ApiErrorBody = components['schemas']['Error'];

/** Thrown by `unwrap` when the API answers with the error envelope. */
export class ApiError extends Error {
  readonly code: ApiErrorBody['error']['code'];
  readonly status: number;
  readonly details: ApiErrorBody['error']['details'];

  constructor(status: number, body: ApiErrorBody | undefined) {
    super(body?.error.message ?? `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error.code ?? 'internal';
    this.details = body?.error.details;
  }
}

/** openapi-fetch result → data, or throw ApiError. */
export function unwrap<T>(r: { data?: T; error?: unknown; response: Response }): T {
  if (r.error !== undefined || r.data === undefined) {
    throw new ApiError(r.response.status, r.error as ApiErrorBody | undefined);
  }
  return r.data;
}
