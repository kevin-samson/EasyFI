import type { DbHandle } from '@easyfi/db';
import { createTestDb } from '@easyfi/db/testing';
import type { ServiceDeps } from './context';
import { DEMO_TODAY, DEMO_USER_ID, seedDemo } from './demo';
import { createServices, type Services } from './index';

export interface TestServices {
  handle: DbHandle;
  services: Services;
  userId: string;
  /** Portfolio ids of the demo user, keyed by fixture name. */
  portfolioIds: Record<string, string>;
  close(): Promise<void>;
}

/** Fresh migrated PGlite seeded with the demo fixtures; clock pinned to the fixture date. */
export async function createTestServices(
  overrides: Partial<ServiceDeps> = {},
): Promise<TestServices> {
  const handle = await createTestDb();
  await seedDemo(handle.db, DEMO_USER_ID);
  const services = createServices({
    db: handle.db,
    now: () => new Date(`${DEMO_TODAY}T12:00:00Z`),
    ...overrides,
  });
  const list = await services.ctx.repos.portfolios.list(DEMO_USER_ID);
  return {
    handle,
    services,
    userId: DEMO_USER_ID,
    portfolioIds: Object.fromEntries(list.map((p) => [p.name, p.id])),
    close: () => handle.close(),
  };
}

export const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000bb';
