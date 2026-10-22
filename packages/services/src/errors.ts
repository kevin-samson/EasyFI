export type ServiceErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'invalid_invite'
  | 'email_taken'
  | 'rate_limited'
  | 'upstream'
  | 'internal';

const STATUS: Record<ServiceErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid_invite: 400,
  email_taken: 409,
  rate_limited: 429,
  upstream: 502,
  internal: 500,
};

/** Expected failure with a stable code; route handlers turn it into the `{ error }` envelope. */
export class ServiceError extends Error {
  override readonly name = 'ServiceError';
  readonly status: number;
  constructor(
    readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}
