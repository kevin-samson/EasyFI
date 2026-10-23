import type { ErrorCode } from '@easyfi/contracts';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  unavailable: 503,
  internal: 500,
};

const BRAND = Symbol.for('easyfi.ServiceError');

/** Expected failure of a use-case; the API layer maps it to `{ error: { code, message } }`. */
export class ServiceError extends Error {
  readonly [BRAND] = true;
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = STATUS[code];
  }
}

export const notFound = (what: string) => new ServiceError('not_found', `${what} not found`);
export const badRequest = (message: string) => new ServiceError('bad_request', message);

/**
 * `instanceof` fails when bundlers load this module twice (Next route vs server components), so
 * the API layer checks the global brand instead.
 */
export function isServiceError(e: unknown): e is ServiceError {
  return typeof e === 'object' && e !== null && (e as Record<symbol, unknown>)[BRAND] === true;
}
