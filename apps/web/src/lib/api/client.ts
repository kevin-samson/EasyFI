'use client';

import createClient from 'openapi-fetch';
import type { paths } from './schema';

/** Browser client for /api/v1 (session cookie is sent automatically). */
export const api = createClient<paths>({ baseUrl: '/api/v1', credentials: 'same-origin' });

export { ApiError, unwrap } from './errors';
export type { components, paths } from './schema';
