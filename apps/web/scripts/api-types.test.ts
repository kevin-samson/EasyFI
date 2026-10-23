import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { API_TYPES_FILE, generateApiTypes } from './api-types';

it('generated API types match the contracts (run `pnpm --filter @easyfi/web gen:api`)', async () => {
  const fresh = await generateApiTypes();
  if (process.env.UPDATE_API_TYPES) writeFileSync(API_TYPES_FILE, fresh);
  expect(readFileSync(API_TYPES_FILE, 'utf8')).toBe(fresh);
});
