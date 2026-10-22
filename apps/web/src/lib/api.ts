import { createApiClient } from '@easyfi/contracts/client';

/** Browser client for `/api/v1` (same origin; auth via the Supabase session cookie). */
export const api = createApiClient();
